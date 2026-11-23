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
  const items = await list(endpoint, { part: "snippet,statistics", id: ids.join(",") }, key, request)
  const byId = new Map(items.map((item) => [item.id, item]))
  return ids.filter((id) => byId.has(id)).map((id) => {
    const { snippet, statistics } = byId.get(id)
    return {
      type,
      url: type === "video" ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/channel/${id}/shorts`,
      title: snippet.title,
      channel: type === "video" ? snippet.channelTitle : "",
      date: type === "video" ? snippet.publishedAt?.slice(0, 10) : "",
      views: type === "video" ? statistics?.viewCount ?? null : null,
    }
  })
}
