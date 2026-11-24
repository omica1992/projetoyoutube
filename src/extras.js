/**
 * Funcionalidades complementares do FatoNexo Studio:
 * 1. Comparador Top vs. Piores Shorts do canal
 * 2. Radar de concorrentes monitorados (RSS + views exatas + velocidade views/hora)
 * 3. Gerador de pacote de produção (cenas, legenda .srt e prompts visuais)
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { DATA_DIR } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"
import { ytGetVideosByIds, ytResolveChannel } from "./youtube.js"

const CONCORRENTES_KEY = "concorrentes_monitorados"
const CONCORRENTES_FILE = path.join(DATA_DIR, "concorrentes.json")
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const HEADERS = { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+917" }

let memConcorrentes = null

const DEFAULT_CONCORRENTES = [
  { id: "UC6nSFpj9HTCZ5t-N3Rm3-HA", title: "Vsauce", handle: "@Vsauce" },
]

export async function readConcorrentes() {
  if (hasSupabase()) {
    try {
      const v = await kvGet(CONCORRENTES_KEY)
      if (Array.isArray(v)) return v
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      const v = JSON.parse(fs.readFileSync(CONCORRENTES_FILE, "utf8"))
      if (Array.isArray(v)) return v
    } catch {}
  }
  return memConcorrentes || DEFAULT_CONCORRENTES
}

export async function writeConcorrentes(list) {
  memConcorrentes = list
  if (hasSupabase()) {
    try {
      await kvSet(CONCORRENTES_KEY, list)
    } catch {}
    return
  }
  if (process.env.VERCEL) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(CONCORRENTES_FILE, JSON.stringify(list, null, 2), "utf8")
  } catch {}
}

/** Resolve @handle, URL de canal ou UC... para { id, title, handle }. */
export async function resolveChannelInput(raw = "") {
  const s = String(raw).trim()
  if (!s) throw new Error("Informe o @handle, URL ou ID do canal.")
  try {
    const apiCh = await ytResolveChannel(s)
    if (apiCh) return apiCh
  } catch {}
  if (/^UC[\w-]{20,}$/.test(s)) {
    const res = await fetch(`https://www.youtube.com/channel/${s}`, { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
    const html = res.ok ? await res.text() : ""
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || s
    return { id: s, title, handle: "" }
  }
  const url = s.startsWith("http") ? s : `https://www.youtube.com/${s.startsWith("@") ? s : `@${s}`}`
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Não foi possível abrir o canal (HTTP ${res.status}).`)
  const html = await res.text()
  const id =
    html.match(/"externalId":"(UC[\w-]+)"/)?.[1] ||
    html.match(/channel_id=(UC[\w-]+)/)?.[1] ||
    ""
  if (!id) throw new Error("Não consegui identificar o ID desse canal no YouTube.")
  const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || s
  const handle = html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/)?.[1] || (s.startsWith("@") ? s : "")
  return { id, title, handle }
}

async function fetchChannelRssTop(ch) {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 5)
    const now = Date.now()
    const parsed = entries
      .map((m) => ({
        id: m[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
        title: m[1].match(/<title>([^<]*)<\/title>/)?.[1] || "",
        publishedAt: m[1].match(/<published>([^<]+)<\/published>/)?.[1] || "",
      }))
      .filter((e) => e.id)
    const apiVideos = await ytGetVideosByIds(parsed.map((e) => e.id)).catch(() => null)
    if (Array.isArray(apiVideos)) {
      const byId = new Map(apiVideos.map((v) => [v.id, v]))
      return parsed.map((e) => {
        const v = byId.get(e.id)
        const pub = v?.publishedAt || e.publishedAt
        const ageH = pub ? Math.max(0.5, (now - Date.parse(pub)) / 3600_000) : null
        const views = v?.views ?? null
        return {
          id: e.id,
          title: v?.title || e.title,
          channelId: ch.id,
          channelTitle: ch.title || ch.handle || ch.id,
          url: `https://www.youtube.com/shorts/${e.id}`,
          publishedAt: pub,
          hoursAgo: ageH ? Math.round(ageH * 10) / 10 : null,
          views,
          likes: v?.likes ?? null,
          comments: v?.comments ?? null,
          velocity: typeof views === "number" && ageH ? Math.round(views / Math.max(ageH, 1)) : null,
        }
      })
    }
    const out = await Promise.all(
      entries.map(async (m) => {
        const id = m[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
        const title = m[1].match(/<title>([^<]*)<\/title>/)?.[1] || ""
        const publishedAt = m[1].match(/<published>([^<]+)<\/published>/)?.[1] || ""
        if (!id) return null
        let views = null
        try {
          const wr = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: HEADERS, signal: AbortSignal.timeout(7_000) })
          if (wr.ok) {
            const html = await wr.text()
            const idx = html.indexOf('"videoDetails"')
            const vm = idx >= 0 ? html.slice(idx, idx + 30_000).match(/"viewCount":"(\d+)"/) : null
            if (vm) views = Number(vm[1])
          }
        } catch {}
        const ageH = publishedAt ? Math.max(0.5, (now - Date.parse(publishedAt)) / 3600_000) : null
        return {
          id,
          title,
          channelId: ch.id,
          channelTitle: ch.title || ch.handle || ch.id,
          url: `https://www.youtube.com/shorts/${id}`,
          publishedAt,
          hoursAgo: ageH ? Math.round(ageH * 10) / 10 : null,
          views,
          velocity: typeof views === "number" && ageH ? Math.round(views / Math.max(ageH, 1)) : null,
        }
      }),
    )
    return out.filter(Boolean)
  } catch {
    return []
  }
}

export async function buildRadar(concorrentes) {
  const lists = await Promise.all((concorrentes || []).slice(0, 8).map(fetchChannelRssTop))
  return lists
    .flat()
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
    .slice(0, 20)
}

function summarizeGroup(list) {
  if (!list.length) return { count: 0, avgViews: 0, emojiPct: 0, questionPct: 0, avgLen: 0 }
  const n = list.length
  const emojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u
  return {
    count: n,
    avgViews: Math.round(list.reduce((a, s) => a + (s.views || 0), 0) / n),
    emojiPct: Math.round((list.filter((s) => emojiRe.test(s.title || "")).length / n) * 100),
    questionPct: Math.round((list.filter((s) => /\?/.test(s.title || "")).length / n) * 100),
    avgLen: Math.round(list.reduce((a, s) => a + (s.title || "").length, 0) / n),
  }
}

export function compareTopVsBottom(shorts = []) {
  const valid = shorts.filter((s) => typeof s.views === "number").sort((a, b) => b.views - a.views)
  const k = Math.min(5, Math.floor(valid.length / 2) || valid.length)
  const top = valid.slice(0, k)
  const bottom = valid.slice(-k).reverse()
  return {
    sampleSize: valid.length,
    top,
    bottom,
    topStats: summarizeGroup(top),
    bottomStats: summarizeGroup(bottom),
  }
}

function fmtSrtTime(sec) {
  const ms = Math.round((sec % 1) * 1000)
  const s = Math.floor(sec) % 60
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  const p = (v, n = 2) => String(v).padStart(n, "0")
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`
}

/** Gera .srt determinístico a partir das cenas ou frases do roteiro. */
export function buildSrtFromText(text = "", secPerScene = 3) {
  const clean = String(text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((l) => l.replace(/^(?:\[[^\]]+\]|Narrador:|Cena \d+:?)\s*/i, "").trim())
    .filter((l) => l && !/^\(.*\)$/.test(l))
  const chunks = clean.length ? clean : [String(text || "").trim()].filter(Boolean)
  let t = 0
  return chunks
    .map((line, i) => {
      const words = line.split(/\s+/).length
      const dur = Math.max(1.8, Math.min(5.5, Math.round((words / 2.6) * 10) / 10 || secPerScene))
      const start = fmtSrtTime(t)
      t += dur
      const end = fmtSrtTime(t)
      return `${i + 1}\n${start} --> ${end}\n${line}\n`
    })
    .join("\n")
}

export function newId() {
  return crypto.randomUUID()
}

const AGENDA_KEY = "agenda_acoes"
const AGENDA_FILE = path.join(DATA_DIR, "agenda.json")
let memAgenda = []

export async function readAgenda() {
  if (hasSupabase()) {
    try {
      const v = await kvGet(AGENDA_KEY)
      if (Array.isArray(v)) return v
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      const v = JSON.parse(fs.readFileSync(AGENDA_FILE, "utf8"))
      if (Array.isArray(v)) return v
    } catch {}
  }
  return memAgenda
}

async function writeAgenda(list) {
  memAgenda = list
  if (hasSupabase()) {
    try {
      await kvSet(AGENDA_KEY, list)
    } catch {}
    return
  }
  if (process.env.VERCEL) return
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(AGENDA_FILE, JSON.stringify(list, null, 2), "utf8")
  } catch {}
}

export async function addAgendaItem({ titulo, tipo = "postar", quando = "", detalhes = "", origem = "manual" }) {
  const list = await readAgenda()
  const item = {
    id: crypto.randomUUID(),
    titulo: String(titulo || "Ação agendada").trim(),
    tipo,
    quando: String(quando || "").trim(),
    detalhes: String(detalhes || "").trim(),
    origem,
    status: "pendente",
    createdAt: new Date().toISOString(),
  }
  const next = [item, ...list].slice(0, 60)
  await writeAgenda(next)
  return { item, agenda: next }
}

export async function updateAgendaItem(id, patch) {
  const list = await readAgenda()
  const next = list.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a))
  await writeAgenda(next)
  return next
}

export async function deleteAgendaItem(id) {
  const list = (await readAgenda()).filter((a) => a.id !== id)
  await writeAgenda(list)
  return list
}

