import { readFileSync } from "node:fs"
import { rename, unlink, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { hasSupabase, kvGet, kvSet } from "./db.js"

const API = "https://www.googleapis.com/youtube/v3/"
const KEY_FILE = new URL("../.youtube-key", import.meta.url)

export function getYouTubeKey() {
  if (!process.env.VERCEL) {
    try {
      const saved = readFileSync(KEY_FILE, "utf8").trim()
      if (saved) return saved
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  return process.env.YOUTUBE_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || ""
}

export async function getYouTubeKeyAsync() {
  const local = getYouTubeKey()
  if (local) return local
  if (hasSupabase()) {
    try {
      const row = await kvGet("key:youtube")
      if (row?.key) return String(row.key).trim()
    } catch {}
  }
  return ""
}

export async function saveYouTubeKey(key) {
  if (hasSupabase()) {
    await kvSet("key:youtube", { key })
  }
  if (process.env.VERCEL) return
  const temporary = new URL(`../.youtube-key.${randomUUID()}.tmp`, import.meta.url)
  try {
    await writeFile(temporary, key, { mode: 0o600, flag: "wx" })
    await rename(temporary, KEY_FILE)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

const API_ERRORS = new Map([
  ["keyInvalid", "O Google rejeitou a chave. Confira se ela foi copiada por inteiro."],
  ["API_KEY_INVALID", "O Google rejeitou a chave. Confira se ela foi copiada por inteiro."],
  ["keyExpired", "Essa chave do Google expirou."],
  ["accessNotConfigured", "Ative a YouTube Data API v3 no projeto Google Cloud dessa chave."],
  ["SERVICE_DISABLED", "Ative a YouTube Data API v3 no projeto Google Cloud dessa chave."],
  ["API_KEY_SERVICE_BLOCKED", "Permita a YouTube Data API v3 nas restrições de API dessa chave no Google Cloud."],
  ["API_KEY_HTTP_REFERRER_BLOCKED", "Essa chave é restrita a sites por referenciador. A busca do Studio usa chamadas pelo servidor."],
  ["API_KEY_IP_ADDRESS_BLOCKED", "O IP do servidor local está fora das restrições dessa chave."],
  ["quotaExceeded", "A cota da YouTube Data API foi atingida. Confira o limite do projeto Google Cloud."],
  ["dailyLimitExceeded", "A cota diária da YouTube Data API foi atingida."],
])

export class YouTubeApiError extends Error {}

async function list(endpoint, params, key, request) {
  const url = new URL(endpoint, API)
  url.search = new URLSearchParams(params)
  let response
  try {
    response = await request(url, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    })
  } catch {
    throw new YouTubeApiError("O servidor do Studio não conseguiu alcançar o Google. Confira a conexão e tente de novo.")
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const details = [...(data?.error?.details ?? []), ...(data?.error?.errors ?? [])]
    const message = details.map(({ reason }) => API_ERRORS.get(reason)).find(Boolean)
    throw new YouTubeApiError(message || `O Google recusou a consulta (HTTP ${response.status}). Confira as permissões e a cota da chave.`)
  }
  if (!Array.isArray(data?.items)) throw new YouTubeApiError("O Google retornou uma resposta inesperada. Tente de novo.")
  return data.items
}

export async function verifyYouTubeKey(key, request = fetch) {
  await list("videos", { part: "id", id: "jNQXAC9IVRw" }, key, request)
}

export function parseIsoDuration(iso = "") {
  const m = String(iso).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!m) return null
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

function bestThumb(thumbs = {}) {
  const raw = thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || ""
  return raw.replace("//yt3.ggpht.com/", "//yt3.googleusercontent.com/")
}

export async function ytGetVideosByIds(ids = [], request = fetch) {
  const clean = [...new Set(ids.filter((id) => /^[\w-]{11}$/.test(id)))]
  if (!clean.length) return []
  const key = await getYouTubeKeyAsync()
  if (!key) return null
  const out = []
  for (let i = 0; i < clean.length; i += 50) {
    const items = await list("videos", { part: "snippet,statistics,contentDetails", id: clean.slice(i, i + 50).join(",") }, key, request)
    for (const v of items) {
      out.push({
        id: v.id,
        url: `https://www.youtube.com/shorts/${v.id}`,
        title: v.snippet?.title || "",
        channel: v.snippet?.channelTitle || "",
        channelId: v.snippet?.channelId || "",
        description: v.snippet?.description || "",
        publishedAt: v.snippet?.publishedAt || "",
        date: v.snippet?.publishedAt?.slice(0, 10) || "",
        thumbnail: bestThumb(v.snippet?.thumbnails) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        keywords: Array.isArray(v.snippet?.tags) ? v.snippet.tags.slice(0, 15) : [],
        durationSeconds: parseIsoDuration(v.contentDetails?.duration),
        views: v.statistics?.viewCount != null ? Number(v.statistics.viewCount) : null,
        likes: v.statistics?.likeCount != null ? Number(v.statistics.likeCount) : null,
        comments: v.statistics?.commentCount != null ? Number(v.statistics.commentCount) : null,
      })
    }
  }
  return out
}

export async function ytGetChannelOverview(channelRef = "@fatonexocuri", channelId = "UCClrO3uvc5-H6NPc6alEHDw", request = fetch) {
  const key = await getYouTubeKeyAsync()
  if (!key) return null
  const query = channelId ? { part: "snippet,statistics,contentDetails", id: channelId } : { part: "snippet,statistics,contentDetails", forHandle: channelRef.replace(/^@/, "") }
  const channels = await list("channels", query, key, request)
  const ch = channels[0]
  if (!ch) return null
  const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads
  let shorts = []
  if (uploadsId) {
    const pl = await list("playlistItems", { part: "contentDetails", playlistId: uploadsId, maxResults: "50" }, key, request)
    const ids = pl.map((i) => i.contentDetails?.videoId).filter(Boolean)
    const videos = (await ytGetVideosByIds(ids, request)) || []
    shorts = videos.filter((v) => v.durationSeconds == null || v.durationSeconds <= 180)
  }
  const validViews = shorts.map((s) => s.views).filter((v) => typeof v === "number" && Number.isFinite(v))
  const totalRecentViews = validViews.reduce((a, b) => a + b, 0)
  const avgViews = validViews.length ? Math.round(totalRecentViews / validViews.length) : null
  const sorted = [...validViews].sort((a, b) => a - b)
  const medianViews = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
  const subs = ch.statistics?.subscriberCount != null ? Number(ch.statistics.subscriberCount) : null
  return {
    channelId: ch.id,
    handle: ch.snippet?.customUrl || (channelRef.startsWith("@") ? channelRef : ""),
    title: ch.snippet?.title || channelRef,
    avatar: bestThumb(ch.snippet?.thumbnails),
    subscribers: subs,
    subscribersText: subs != null ? `${subs} inscritos` : "",
    videosCount: ch.statistics?.videoCount != null ? Number(ch.statistics.videoCount) : shorts.length,
    totalChannelViews: ch.statistics?.viewCount != null ? Number(ch.statistics.viewCount) : null,
    recentShorts: shorts,
    stats: { sampleSize: shorts.length, totalRecentViews, avgViews, medianViews },
    observedAt: new Date().toISOString(),
    source: "youtube-api-v3",
  }
}

export async function ytResolveChannel(raw = "", request = fetch) {
  const key = await getYouTubeKeyAsync()
  if (!key) return null
  const s = String(raw).trim()
  const uc = s.match(/(UC[\w-]{20,})/)?.[1]
  const handle = s.match(/@([\w.-]+)/)?.[1] || (!s.startsWith("http") && !uc ? s.replace(/^@/, "") : "")
  const params = uc ? { part: "snippet", id: uc } : { part: "snippet", forHandle: handle }
  const items = await list("channels", params, key, request)
  const ch = items[0]
  if (!ch) return null
  return { id: ch.id, title: ch.snippet?.title || s, handle: ch.snippet?.customUrl || (handle ? `@${handle}` : "") }
}

export async function ytGetVideoComments(videoId, maxResults = 20, request = fetch) {
  const key = await getYouTubeKeyAsync()
  if (!key) return null
  const items = await list(
    "commentThreads",
    { part: "snippet", videoId, maxResults: String(Math.min(50, maxResults)), order: "relevance", textFormat: "plainText" },
    key,
    request,
  )
  return items.map((c) => {
    const s = c.snippet?.topLevelComment?.snippet || {}
    return {
      author: s.authorDisplayName || "Usuário",
      text: s.textDisplay || "",
      likes: Number(s.likeCount || 0),
      publishedAt: s.publishedAt || "",
    }
  })
}

export async function searchYouTube({ query, type, days, order }, request = fetch) {
  const key = await getYouTubeKeyAsync()
  if (!key) return null

  const params = { part: "snippet", q: query, type, maxResults: "15", regionCode: "BR", relevanceLanguage: "pt", order }
  if (type === "video") {
    params.videoDuration = "short"
    params.publishedAfter = new Date(Date.now() - days * 86_400_000).toISOString()
  }
  const matches = await list("search", params, key, request)
  const ids = matches.map(({ id }) => id?.[type === "video" ? "videoId" : "channelId"]).filter(Boolean)
  if (!ids.length) return []

  const endpoint = type === "video" ? "videos" : "channels"
  const part = type === "video" ? "snippet,statistics,contentDetails" : "snippet,statistics"
  const items = await list(endpoint, { part, id: ids.join(",") }, key, request)
  const byId = new Map(items.map((item) => [item.id, item]))
  return ids.filter((id) => byId.has(id)).map((id) => {
    const { snippet, statistics, contentDetails } = byId.get(id)
    return {
      type,
      id,
      url: type === "video" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/channel/${id}/shorts`,
      title: snippet.title,
      channel: type === "video" ? snippet.channelTitle : "",
      channelId: snippet.channelId || "",
      thumbnail: bestThumb(snippet.thumbnails) || (type === "video" ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""),
      date: type === "video" ? snippet.publishedAt?.slice(0, 10) : "",
      publishedAt: snippet.publishedAt || "",
      durationSeconds: type === "video" ? parseIsoDuration(contentDetails?.duration) : null,
      views: statistics?.viewCount != null ? Number(statistics.viewCount) : null,
      likes: statistics?.likeCount != null ? Number(statistics.likeCount) : null,
      comments: statistics?.commentCount != null ? Number(statistics.commentCount) : null,
      subscribers: type === "channel" && statistics?.subscriberCount != null ? Number(statistics.subscriberCount) : null,
      isShort: type === "video",
    }
  })
}
