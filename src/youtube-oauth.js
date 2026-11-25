/**
 * Integração OAuth 2.0 com YouTube (Data API v3 Upload + YouTube Analytics API v2).
 * Credenciais e tokens nunca são expostos no frontend; ficam no .env e/ou Supabase (fatonexo_kv).
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { ROOT } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"

const TOKENS_KEY = "oauth:youtube_tokens"
const CLIENT_KEY = "oauth:google_client"
const LOCAL_TOKEN_FILE = path.join(ROOT, ".youtube-oauth.json")
const STUDIO_TOKEN_FILE = path.join(ROOT, ".youtube-fora-do-nivel.json")

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ")

export async function getOAuthClientConfig() {
  const envId = process.env.GOOGLE_CLIENT_ID?.trim()
  const envSec = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (envId && envSec) return { client_id: envId, client_secret: envSec }
  if (hasSupabase()) {
    try {
      const row = await kvGet(CLIENT_KEY)
      if (row?.client_id && row?.client_secret) return row
    } catch {}
  }
  return null
}

async function readTokens(studio = false) {
  if (!studio && hasSupabase()) {
    try {
      const row = await kvGet(TOKENS_KEY)
      if (row?.refresh_token || row?.access_token) return row
    } catch {}
  }
  if (!process.env.VERCEL) {
    try {
      return JSON.parse(fs.readFileSync(studio ? STUDIO_TOKEN_FILE : LOCAL_TOKEN_FILE, "utf8"))
    } catch {}
  }
  return null
}

async function writeTokens(tokens, studio = false) {
  if (studio) {
    const temp = STUDIO_TOKEN_FILE + ".tmp"
    fs.writeFileSync(temp, JSON.stringify(tokens, null, 2), { mode: 0o600 })
    fs.renameSync(temp, STUDIO_TOKEN_FILE)
    return
  }
  if (hasSupabase()) {
    await kvSet(TOKENS_KEY, tokens)
  }
  if (!process.env.VERCEL) {
    try {
      fs.writeFileSync(LOCAL_TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 })
    } catch {}
  }
}

export async function disconnectOAuth() {
  if (hasSupabase()) await kvSet(TOKENS_KEY, {}).catch(() => {})
  if (!process.env.VERCEL) {
    try {
      if (fs.existsSync(LOCAL_TOKEN_FILE)) fs.unlinkSync(LOCAL_TOKEN_FILE)
    } catch {}
  }
}

export async function getOAuthStatus(studio = false) {
  const [cfg, tok] = await Promise.all([getOAuthClientConfig(), readTokens(studio)])
  return {
    configured: Boolean(cfg?.client_id && cfg?.client_secret),
    connected: Boolean(tok?.refresh_token || (tok?.access_token && Date.now() < (tok.expires_at || 0))),
  }
}

export async function getAuthUrl(origin, { chooseAccount = false } = {}) {
  const cfg = await getOAuthClientConfig()
  if (!cfg) throw new Error("Credenciais OAuth do Google não configuradas.")
  const redirectUri = `${origin}/api/youtube/oauth/callback`
  const params = new URLSearchParams({
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: chooseAccount ? "select_account consent" : "consent",
    include_granted_scopes: "true",
    state: crypto.randomBytes(12).toString("hex"),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(code, origin, studio = false, { persist = true } = {}) {
  const cfg = await getOAuthClientConfig()
  if (!cfg) throw new Error("Credenciais OAuth do Google não configuradas.")
  const redirectUri = `${origin}/api/youtube/oauth/callback`
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(12_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Falha OAuth HTTP ${res.status}`)
  }
  const prev = studio ? null : await readTokens()
  const saved = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev?.refresh_token || "",
    expires_at: Date.now() + Number(data.expires_in || 3500) * 1000 - 60_000,
    scope: data.scope || SCOPES,
    updated_at: new Date().toISOString(),
  }
  if (persist) await writeTokens(saved, studio)
  return saved
}

export async function getValidAccessToken(studio = false) {
  return refreshYouTubeToken(await readTokens(studio), (tokens) => writeTokens(tokens, studio))
}

export async function refreshYouTubeToken(tok, persist) {
  if (!tok?.access_token && !tok?.refresh_token) {
    throw new Error("Conecte sua conta do YouTube via OAuth 2.0 em Integrações primeiro.")
  }
  if (tok.access_token && Date.now() < (tok.expires_at || 0)) return tok.access_token
  if (!tok.refresh_token) throw new Error("Sessão do YouTube expirada. Reconecte em Integrações.")
  const cfg = await getOAuthClientConfig()
  if (!cfg) throw new Error("Credenciais OAuth do Google não configuradas.")
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(12_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error("Não foi possível renovar o login do YouTube. Reconecte em Integrações.")
  }
  const updated = {
    ...tok,
    access_token: data.access_token,
    expires_at: Date.now() + Number(data.expires_in || 3500) * 1000 - 60_000,
    updated_at: new Date().toISOString(),
  }
  await persist(updated)
  return updated.access_token
}

export async function getStudioChannel(token) {
  const accessToken = token ?? await getValidAccessToken(true)
  const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || "Não foi possível consultar o canal conectado.")
  if (data.items?.length !== 1 || !data.items[0].id) throw new Error("Reconecte selecionando o canal que receberá os vídeos.")
  const { id, snippet } = data.items[0]
  return { id, title: snippet?.title || id, handle: snippet?.customUrl || "", logo: snippet?.thumbnails?.medium?.url || snippet?.thumbnails?.default?.url || "" }
}

function isoDateDaysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

async function ytAnalyticsQuery(token, params) {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports")
  url.search = new URLSearchParams(params)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `YouTube Analytics HTTP ${res.status}`)
  return data
}

export async function getAnalyticsSummary() {
  const token = await getValidAccessToken()
  const endDate = isoDateDaysAgo(1)
  const startDate = isoDateDaysAgo(28)
  const [tot, byVideo] = await Promise.all([
    ytAnalyticsQuery(token, {
      ids: "channel==MINE",
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost",
    }),
    ytAnalyticsQuery(token, {
      ids: "channel==MINE",
      startDate,
      endDate,
      dimensions: "video",
      metrics: "views,averageViewDuration,averageViewPercentage,likes,subscribersGained",
      sort: "-views",
      maxResults: "15",
    }),
  ])
  const row = tot?.rows?.[0] || []
  return {
    period: { startDate, endDate },
    summary: {
      views: Number(row[0] || 0),
      estimatedMinutesWatched: Number(row[1] || 0),
      averageViewDuration: Number(row[2] || 0),
      averageViewPercentage: Number(row[3] || 0),
      subscribersGained: Number(row[4] || 0),
      subscribersLost: Number(row[5] || 0),
    },
    topVideos: (byVideo?.rows || []).map((r) => ({
      videoId: r[0],
      views: Number(r[1] || 0),
      averageViewDuration: Number(r[2] || 0),
      averageViewPercentage: Number(r[3] || 0),
      likes: Number(r[4] || 0),
      subscribersGained: Number(r[5] || 0),
    })),
  }
}

export async function uploadShortToYouTube({
  buffer,
  mimetype = "video/mp4",
  title,
  description = "",
  tags = [],
  privacyStatus = "private",
  publishAt = "",
  expectedChannel,
  accessToken,
}) {
  const token = accessToken ?? await getValidAccessToken(Boolean(expectedChannel))
  if (expectedChannel && (await getStudioChannel(token)).id !== expectedChannel) {
    throw new Error("O canal conectado mudou. Revise o destino antes de enviar.")
  }
  const cleanTitle = String(title || "Short #Shorts").trim().slice(0, 100)
  const status = {
    privacyStatus: ["public", "unlisted", "private"].includes(privacyStatus) ? privacyStatus : "private",
    selfDeclaredMadeForKids: false,
  }
  if (publishAt) {
    status.privacyStatus = "private"
    status.publishAt = new Date(publishAt).toISOString()
  }
  const metadata = {
    snippet: {
      title: cleanTitle,
      description: String(description || "").slice(0, 5000),
      tags: Array.isArray(tags) ? tags.slice(0, 20) : [],
      categoryId: "28",
    },
    status,
  }
  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(buffer.length),
      "X-Upload-Content-Type": mimetype,
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(15_000),
  })
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Falha ao iniciar upload (HTTP ${initRes.status})`)
  }
  const uploadUrl = initRes.headers.get("location")
  if (!uploadUrl) throw new Error("YouTube não retornou URL de upload.")
  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimetype, "Content-Length": String(buffer.length) },
    body: buffer,
    signal: AbortSignal.timeout(120_000),
  })
  const upData = await upRes.json().catch(() => ({}))
  if (!upRes.ok || !upData.id) {
    throw new Error(upData?.error?.message || `Falha ao enviar vídeo (HTTP ${upRes.status})`)
  }
  return {
    id: upData.id,
    url: `https://www.youtube.com/shorts/${upData.id}`,
    title: upData.snippet?.title || cleanTitle,
    privacyStatus: upData.status?.privacyStatus || status.privacyStatus,
  }
}

