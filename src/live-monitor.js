import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { DATA_DIR } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"
import { getChannelPublicOverview, getVideoDetailsAndTranscript } from "./youtube-public.js"

/**
 * Monitor ao vivo do canal @fatonexocuri.
 * Consulta os dados públicos do YouTube em intervalo fixo, grava a série temporal em
 * data/canal-live.json (continua registrando enquanto o servidor estiver ligado) e
 * transmite cada atualização para o painel via SSE.
 */

const FILE = path.join(DATA_DIR, "canal-live.json")
const CATALOG_FILE = path.join(DATA_DIR, "canal-videos-cache.json")
const HANDLE = "@fatonexocuri"
const CHANNEL_ID = "UCClrO3uvc5-H6NPc6alEHDw"
export const POLL_MS = Number(process.env.LIVE_POLL_MS || 30_000)
const HOUR = 3_600_000
const KEEP_POINT_MS = 5 * 60_000

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    return {
      series: Array.isArray(raw.series) ? raw.series : [],
      shortsHist: Array.isArray(raw.shortsHist) ? raw.shortsHist : [],
      feed: Array.isArray(raw.feed) ? raw.feed : [],
      insight: raw.insight || null,
      channel: raw.channel || null,
      shorts: Array.isArray(raw.shorts) ? raw.shorts : [],
    }
  } catch {
    return { series: [], shortsHist: [], feed: [], insight: null, channel: null, shorts: [] }
  }
}

const state = loadState()
const clients = new Set()
let timer = null
let polling = false
let lastError = ""
let lastSaveAt = 0
let nextPollAt = 0
let polls = 0

function save(force = false) {
  const now = Date.now()
  if (!force && now - lastSaveAt < KEEP_POINT_MS) return
  lastSaveAt = now
  if (hasSupabase()) {
    kvSet("live_state", state).catch(() => {})
  }
  if (process.env.VERCEL) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const temp = `${FILE}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temp, JSON.stringify(state), "utf8")
    fs.renameSync(temp, FILE)
  } catch {}
}

export async function getSnapshotAsync() {
  if (hasSupabase() && !state.series.length) {
    try {
      const remote = await kvGet("live_state")
      if (remote && Array.isArray(remote.series)) {
        Object.assign(state, remote)
      }
    } catch {}
  }
  if (!state.series.length) {
    await pollOnce()
  }
  return { ...getSnapshot(), sse: !process.env.VERCEL }
}

function baseline(list, ms) {
  const target = Date.now() - ms
  let found = null
  for (const item of list) {
    if (item.t <= target) found = item
    else break
  }
  return { point: found || list[0] || null, partial: !found }
}

function diff(a, b) {
  return typeof a === "number" && typeof b === "number" ? a - b : null
}

function downsample(list, max = 360) {
  if (list.length <= max) return list
  const step = (list.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(list[Math.round(i * step)])
  return out
}

export function getSnapshot() {
  const last = state.series.at(-1) || null
  const windows = { h1: HOUR, h24: 24 * HOUR }
  const deltas = {}
  for (const [key, ms] of Object.entries(windows)) {
    const { point, partial } = baseline(state.series, ms)
    deltas[key] = last && point
      ? { subs: diff(last.subs, point.subs), views: diff(last.views, point.views), since: point.t, partial }
      : null
  }
  const first = state.series[0]
  deltas.all = last && first ? { subs: diff(last.subs, first.subs), views: diff(last.views, first.views), since: first.t } : null

  const b1 = baseline(state.shortsHist, HOUR)
  const shorts = state.shorts
    .map((s) => {
      const prev = b1.point?.map?.[s.id]
      return { ...s, delta1h: typeof prev === "number" ? s.views - prev : null, deltaPartial: b1.partial }
    })
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))

  return {
    channel: state.channel,
    current: last,
    series: downsample(state.series),
    deltas,
    shorts,
    feed: state.feed.slice(-40).reverse(),
    insight: state.insight,
    pollMs: POLL_MS,
    nextPollAt,
    lastError,
    polls,
    now: Date.now(),
  }
}

function broadcast() {
  if (!clients.size) return
  const payload = `event: snapshot\ndata: ${JSON.stringify(getSnapshot())}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

export function addClient(res) {
  clients.add(res)
  res.on("close", () => clients.delete(res))
}

export async function pollOnce() {
  if (polling) return getSnapshot()
  polling = true
  try {
    const ch = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    const now = Date.now()
    const shortsNow = (ch.recentShorts || []).map((s) => ({
      id: s.id,
      title: s.title,
      thumbnail: s.thumbnail,
      url: s.url,
      date: s.date,
      views: typeof s.views === "number" ? s.views : 0,
    }))
    const viewsMap = Object.fromEntries(shortsNow.map((s) => [s.id, s.views]))
    const totalViews = shortsNow.reduce((acc, s) => acc + s.views, 0)

    const point = {
      t: now,
      subs: ch.subscribers,
      videos: ch.videosCount,
      views: totalViews,
      avg: ch.stats?.avgViews ?? null,
    }

    const prevPoint = state.series.at(-1)
    const prevMap = state.shortsHist.at(-1)?.map
    const events = []
    if (prevPoint) {
      const ds = diff(point.subs, prevPoint.subs)
      if (ds) events.push({ type: "subs", delta: ds, text: `${ds > 0 ? "+" : ""}${ds} ${Math.abs(ds) === 1 ? "inscrito" : "inscritos"}` })
      if (prevMap) {
        const changed = shortsNow.filter((s) => typeof prevMap[s.id] === "number" && s.views > prevMap[s.id])
        const added = shortsNow.filter((s) => !(s.id in prevMap))
        for (const s of added) events.push({ type: "video", id: s.id, text: `Novo Short detectado: ${s.title}` })
        if (changed.length && changed.length <= 2) {
          for (const s of changed) {
            const d = s.views - prevMap[s.id]
            events.push({ type: "views", id: s.id, delta: d, text: `+${d} views em “${s.title}”` })
          }
        } else if (changed.length > 2) {
          const total = changed.reduce((acc, s) => acc + (s.views - prevMap[s.id]), 0)
          events.push({ type: "views", delta: total, text: `+${total} views distribuídas em ${changed.length} Shorts` })
        }
      }
    }
    for (const e of events) state.feed.push({ t: now, ...e })
    state.feed = state.feed.slice(-120)

    const changed =
      !prevPoint || prevPoint.subs !== point.subs || prevPoint.views !== point.views || prevPoint.videos !== point.videos
    if (changed || now - (prevPoint?.t || 0) >= KEEP_POINT_MS) {
      state.series.push(point)
      if (state.series.length > 6000) state.series = state.series.slice(-6000)
    }
    const lastHist = state.shortsHist.at(-1)
    if (!lastHist || changed || now - lastHist.t >= 2 * 60_000) {
      state.shortsHist.push({ t: now, map: viewsMap })
      const cutoff = now - 26 * HOUR
      state.shortsHist = state.shortsHist.filter((h) => h.t >= cutoff)
    }

    state.channel = {
      channelId: ch.channelId,
      title: ch.title,
      handle: ch.handle || HANDLE,
      avatar: ch.avatar,
      subscribersText: ch.subscribersText,
    }
    state.shorts = shortsNow
    // O ponto "current" sempre reflete a leitura mais recente, mesmo quando nada mudou
    if (!changed && state.series.length) state.series[state.series.length - 1] = { ...state.series.at(-1), lastSeen: now }
    lastError = ""
    polls += 1
    save(changed || events.length > 0)
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Falha ao consultar o YouTube."
  } finally {
    polling = false
    nextPollAt = Date.now() + POLL_MS
    broadcast()
  }
  return getSnapshot()
}

export function startLiveMonitor() {
  if (process.env.VERCEL || timer) return
  nextPollAt = Date.now() + 1000
  pollOnce()
  timer = setInterval(pollOnce, POLL_MS)
  timer.unref?.()
}

export function getInsight() {
  return state.insight
}

export function setInsight(insight) {
  state.insight = insight
  save(true)
  broadcast()
}

async function readCatalogCache() {
  if (hasSupabase()) {
    try {
      const remote = await kvGet("canal_videos_cache")
      if (remote && typeof remote === "object") return remote
    } catch {}
  }
  try {
    return JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")) || {}
  } catch {
    return {}
  }
}

async function writeCatalogCache(cache) {
  if (hasSupabase()) {
    await kvSet("canal_videos_cache", cache).catch(() => {})
  }
  if (process.env.VERCEL) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const temp = `${CATALOG_FILE}.${crypto.randomUUID()}.tmp`
    fs.writeFileSync(temp, JSON.stringify(cache, null, 2), "utf8")
    fs.renameSync(temp, CATALOG_FILE)
  } catch {}
}

/**
 * Garante que os Shorts do canal tenham metadados (descrição, duração e legenda)
 * cacheados em disco ou Supabase para o Chat IA conhecer todos os vídeos do @fatonexocuri.
 */
export async function getChannelVideosCatalog() {
  const shorts = state.shorts.length ? state.shorts : (await getChannelPublicOverview(HANDLE, CHANNEL_ID)).recentShorts || []
  const cache = await readCatalogCache()
  const missing = shorts.filter((s) => s.id && !cache[s.id]).slice(0, 6)
  if (missing.length) {
    await Promise.allSettled(
      missing.map(async (s) => {
        try {
          const det = await getVideoDetailsAndTranscript(s.id)
          cache[s.id] = {
            id: s.id,
            title: det.title || s.title,
            durationSeconds: det.durationSeconds,
            description: (det.description || "").slice(0, 600),
            transcript: (det.transcript || "").slice(0, 1500),
            cachedAt: Date.now(),
          }
        } catch {}
      }),
    )
    await writeCatalogCache(cache)
  }
  return shorts.map((s) => ({
    ...s,
    ...(cache[s.id] || {}),
    views: s.views,
  }))
}

