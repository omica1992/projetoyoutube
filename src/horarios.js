/**
 * Análise de melhores horários de publicação (fuso de Brasília, UTC-3).
 * - Canal: horário exato de publicação (RSS do YouTube) × views exatas dos Shorts.
 *   As amostras são acumuladas (Supabase/arquivo local) para superar o limite de 15 vídeos do RSS.
 * - Mercado: vídeos recentes da busca pública ("há X horas") → velocidade de views por hora × hora de postagem.
 */
import fs from "node:fs"
import path from "node:path"
import { DATA_DIR } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"
import { searchYouTubePublic } from "./youtube-public.js"
import { ytGetVideosByIds } from "./youtube.js"

const TZ_OFFSET_MS = -3 * 3600_000
const KV_KEY = "horarios_amostras"
const LOCAL_FILE = path.join(DATA_DIR, "horarios-amostras.json")
const DEFAULT_QUERIES = ["curiosidades", "fatos curiosos", "ciência", "espaço"]
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
export const PERIODS = [
  { id: "madrugada", label: "Madrugada (0h–6h)", from: 0, to: 6 },
  { id: "manha", label: "Manhã (6h–12h)", from: 6, to: 12 },
  { id: "tarde", label: "Tarde (12h–18h)", from: 12, to: 18 },
  { id: "noite", label: "Noite (18h–24h)", from: 18, to: 24 },
]

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

let memoryStore = {}

export function toBrt(ms) {
  const d = new Date(ms + TZ_OFFSET_MS)
  return { weekday: d.getUTCDay(), hour: d.getUTCHours() }
}

export function periodOf(hour) {
  return PERIODS.find((p) => hour >= p.from && hour < p.to) || PERIODS[0]
}

/** "há 3 horas" / "Transmitido há 40 minutos" → horas decimais. Dias ou mais → null (sem precisão de horário). */
export function parseHoursAgo(text = "") {
  const m = String(text).toLowerCase().match(/h[áa]\s+(\d+)\s*(minuto|min|hora|h)\b/)
  if (!m) return null
  const n = Number(m[1])
  return m[2].startsWith("min") ? n / 60 : n
}

async function readStore() {
  if (hasSupabase()) {
    try {
      const v = await kvGet(KV_KEY)
      return v && typeof v === "object" && !Array.isArray(v) ? v : {}
    } catch {
      return {}
    }
  }
  if (process.env.VERCEL) return memoryStore
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"))
  } catch {
    return {}
  }
}

async function writeStore(store) {
  if (hasSupabase()) {
    try {
      await kvSet(KV_KEY, store)
    } catch {}
    return
  }
  memoryStore = store
  if (process.env.VERCEL) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(store, null, 2), "utf8")
  } catch {}
}

async function fetchRssPublished(channelId) {
  if (!channelId) return []
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
      .map((m) => ({
        id: m[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
        publishedAt: m[1].match(/<published>([^<]+)<\/published>/)?.[1],
        title: m[1].match(/<title>([^<]*)<\/title>/)?.[1] || "",
      }))
      .filter((e) => e.id && e.publishedAt)
  } catch {
    return []
  }
}

/** Atualiza (e persiste) as amostras do canal: id → { publishedAt, views, title }. */
async function collectOwnSamples(overview) {
  const store = await readStore()
  const rss = await fetchRssPublished(overview?.channelId)
  const viewsById = new Map((overview?.recentShorts || []).map((s) => [s.id, s]))
  let changed = false
  for (const e of rss) {
    const short = viewsById.get(e.id)
    const prev = store[e.id]
    const views = typeof short?.views === "number" ? short.views : prev?.views ?? null
    const title = short?.title || prev?.title || e.title
    if (!prev || prev.views !== views || prev.publishedAt !== e.publishedAt) {
      store[e.id] = { publishedAt: e.publishedAt, views, title }
      changed = true
    }
  }
  // Atualiza com todos os Shorts retornados (a API v3 já traz publishedAt exato para todos os vídeos)
  for (const [id, s] of viewsById) {
    const prev = store[id]
    const pub = s.publishedAt || prev?.publishedAt
    const views = typeof s.views === "number" ? s.views : prev?.views ?? null
    const title = s.title || prev?.title || ""
    if (pub && (!prev || prev.views !== views || prev.publishedAt !== pub)) {
      store[id] = { publishedAt: pub, views, title }
      changed = true
    }
  }
  if (changed) await writeStore(store)
  return Object.entries(store)
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.publishedAt && typeof v.views === "number")
}

export function analyzeOwn(samples) {
  const cells = {}
  const periods = {}
  const hours = {}
  for (const s of samples) {
    const t = Date.parse(s.publishedAt)
    if (!Number.isFinite(t)) continue
    const { weekday, hour } = toBrt(t)
    const p = periodOf(hour)
    const key = `${weekday}-${p.id}`
    for (const [bag, k] of [[cells, key], [periods, p.id], [hours, String(hour)]]) {
      const c = (bag[k] ||= { n: 0, total: 0 })
      c.n += 1
      c.total += s.views
    }
  }
  const finish = (bag) => Object.fromEntries(Object.entries(bag).map(([k, c]) => [k, { n: c.n, avg: Math.round(c.total / c.n) }]))
  const byPeriod = PERIODS.map((p) => ({ id: p.id, label: p.label, ...(periods[p.id] ? { n: periods[p.id].n, avg: Math.round(periods[p.id].total / periods[p.id].n) } : { n: 0, avg: null }) }))
  const best = [...byPeriod].filter((p) => p.n > 0).sort((a, b) => b.avg - a.avg)[0] || null
  const grid = WEEKDAYS.map((label, weekday) => ({
    weekday,
    label,
    periods: PERIODS.map((p) => {
      const c = cells[`${weekday}-${p.id}`]
      return { id: p.id, n: c ? c.n : 0, avg: c ? Math.round(c.total / c.n) : null }
    }),
  }))
  const hourList = Object.entries(finish(hours))
    .map(([h, v]) => ({ hour: Number(h), ...v }))
    .sort((a, b) => a.hour - b.hour)
  const topVideos = [...samples]
    .map((s) => ({ ...s, ...toBrt(Date.parse(s.publishedAt)) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((s) => ({ id: s.id, title: s.title, views: s.views, weekday: WEEKDAYS[s.weekday], hour: s.hour }))
  return { sampleSize: samples.length, grid, byPeriod, byHour: hourList, best, topVideos }
}

const watchCache = new Map()
const WATCH_TTL_MS = 10 * 60_000
const MAX_AGE_H = 96

async function fetchWatchMeta(id) {
  const hit = watchCache.get(id)
  if (hit && Date.now() - hit.at < WATCH_TTL_MS) return hit.meta
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+917" },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const pub = html.match(/"publishDate":"([^"]+)"/)?.[1] || html.match(/"uploadDate":"([^"]+)"/)?.[1] || ""
    const idx = html.indexOf('"videoDetails"')
    const views = idx >= 0 ? html.slice(idx, idx + 30_000).match(/"viewCount":"(\d+)"/)?.[1] : null
    const publishedMs = pub.includes("T") ? Date.parse(pub) : NaN
    if (!Number.isFinite(publishedMs) || views == null) return null
    const meta = { publishedMs, views: Number(views) }
    watchCache.set(id, { at: Date.now(), meta })
    return meta
  } catch {
    return null
  }
}

/** Busca Shorts recentes por tema e lê horário exato (publishDate) + views exatas na página de cada vídeo. */
async function collectMarket(queries) {
  const now = Date.now()
  const lists = await Promise.all(
    queries.map((q) => searchYouTubePublic({ query: q, type: "video", order: "date", limit: 10 }).catch(() => [])),
  )
  const seen = new Set()
  const candidates = []
  for (const r of lists.flat()) {
    if (!r.id || seen.has(r.id)) continue
    seen.add(r.id)
    candidates.push(r)
    if (candidates.length >= 28) break
  }
  const items = []
  const needFetch = []
  for (const r of candidates) {
    if (r.publishedAt && typeof r.views === "number") {
      const publishedMs = Date.parse(r.publishedAt)
      const ageH = (now - publishedMs) / 3600_000
      if (Number.isFinite(publishedMs) && ageH >= 0.5 && ageH <= MAX_AGE_H) {
        items.push({ id: r.id, title: r.title, channel: r.channel, views: r.views, hoursAgo: Math.round(ageH * 10) / 10, hour: toBrt(publishedMs).hour, velocity: Math.round(r.views / Math.max(ageH, 1)) })
      }
    } else needFetch.push(r)
  }
  const apiBatch = needFetch.length ? await ytGetVideosByIds(needFetch.map((r) => r.id)).catch(() => null) : null
  if (Array.isArray(apiBatch)) {
    for (const v of apiBatch) {
      const publishedMs = Date.parse(v.publishedAt)
      const ageH = (now - publishedMs) / 3600_000
      if (Number.isFinite(publishedMs) && typeof v.views === "number" && ageH >= 0.5 && ageH <= MAX_AGE_H) {
        items.push({ id: v.id, title: v.title, channel: v.channel, views: v.views, hoursAgo: Math.round(ageH * 10) / 10, hour: toBrt(publishedMs).hour, velocity: Math.round(v.views / Math.max(ageH, 1)) })
      }
    }
    return items
  }
  const queue = [...needFetch]
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift()
      const meta = await fetchWatchMeta(r.id)
      if (!meta) continue
      const ageH = (now - meta.publishedMs) / 3600_000
      if (ageH < 0.5 || ageH > MAX_AGE_H) continue
      const { hour } = toBrt(meta.publishedMs)
      items.push({
        id: r.id,
        title: r.title,
        channel: r.channel,
        views: meta.views,
        hoursAgo: Math.round(ageH * 10) / 10,
        hour,
        velocity: Math.round(meta.views / Math.max(ageH, 1)),
      })
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return items
}
export function analyzeMarket(items) {
  const bag = {}
  for (const it of items) {
    const c = (bag[it.hour] ||= { n: 0, total: 0 })
    c.n += 1
    c.total += it.velocity
  }
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    n: bag[hour]?.n || 0,
    velocity: bag[hour] ? Math.round(bag[hour].total / bag[hour].n) : null,
  }))
  const best = byHour.filter((h) => h.n >= 2).sort((a, b) => b.velocity - a.velocity)[0] || null
  const top = [...items].sort((a, b) => b.velocity - a.velocity).slice(0, 5)
  return { sampleSize: items.length, byHour, best, top }
}

export function buildVerdict(own, market) {
  const lines = []
  if (!own.best) lines.push("Ainda não há Shorts do canal com horário e views suficientes para comparar.")
  else {
    lines.push(
      `No canal, o melhor período até agora é ${own.best.label}: média de ${own.best.avg} views em ${own.best.n} Short(s).`,
    )
    if (own.sampleSize < 20) lines.push(`Amostra pequena (${own.sampleSize} Shorts): trate como hipótese, não como regra.`)
  }
  if (!market.best) {
    lines.push("O mercado ainda não tem horas com 2+ vídeos recentes para indicar um horário forte.")
  } else {
    const h = market.best.hour
    lines.push(
      `No mercado, vídeos postados por volta das ${String(h).padStart(2, "0")}h (Brasília) têm a maior velocidade: ~${market.best.velocity} views/hora (${market.best.n} vídeos).`,
    )
    if (own.best) {
      const mp = periodOf(h)
      lines.push(
        mp.id === own.best.id
          ? "O melhor período do canal coincide com o do mercado."
          : `O melhor período do canal (${own.best.label}) difere do mercado (${mp.label}). Vale testar postar no horário do mercado.`,
      )
    }
  }
  return lines
}

export async function buildHorarios({ overview, queries }) {
  const qs = (queries && queries.length ? queries : DEFAULT_QUERIES).slice(0, 5)
  const [samples, marketItems] = await Promise.all([collectOwnSamples(overview), collectMarket(qs)])
  const own = analyzeOwn(samples)
  const market = analyzeMarket(marketItems)
  return {
    timezone: "America/Sao_Paulo (UTC-3)",
    queries: qs,
    own,
    market,
    verdict: buildVerdict(own, market),
    generatedAt: new Date().toISOString(),
  }
}
