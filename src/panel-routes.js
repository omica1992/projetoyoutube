import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import express from "express"
import { fileFormats, splitChatFiles } from "../public/chat-files.js"
import { isLocalStudio } from "./create-routes.js"
import { cloudBook, editCloudBook } from "./cloud-book.js"
import { loadCloudKit } from "./cloud-kit.js"
import { goKey, goModels } from "./studio-go.js"
import multer from "multer"
import { DATA_DIR, MODELS } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"
import { buildHorarios } from "./horarios.js"
import { ytGetVideoComments, ytGetVideosByIds, ytResolveChannel } from "./youtube.js"
import { getAnalyticsSummary, getOAuthStatus, uploadShortToYouTube } from "./youtube-oauth.js"
import {
  addAgendaItem,
  buildRadar,
  buildSrtFromText,
  compareTopVsBottom,
  deleteAgendaItem,
  readAgenda,
  readConcorrentes,
  resolveChannelInput,
  updateAgendaItem,
  writeConcorrentes,
} from "./extras.js"
import { askFallback, parseJsonLoose } from "./opencode.js"
import { ARLO, googleVoices, generateNarration, providerKey, storeProviderKey, verifyGemini, CHANNEL_ID, VOICE_CATALOG } from "./panel-providers.js"
import { getYouTubeKey, getYouTubeKeyAsync, saveYouTubeKey, searchYouTube, verifyYouTubeKey } from "./youtube.js"
import { getChannelPublicOverview, getVideoDetailsAndTranscript, searchYouTubePublic } from "./youtube-public.js"
import { transcribeAudio } from "./transcribe.js"
import { addClient, getChannelVideosCatalog, getInsight, getSnapshot, getSnapshotAsync, pollOnce, setInsight, startLiveMonitor } from "./live-monitor.js"
import {
  appendChatTurn,
  deleteAcervoItem,
  deleteChatThread,
  readAcervo,
  saveAnalise,
  saveBusca,
  saveRoteiro,
  updateAcervoItem,
  updateChatThread,
} from "./acervo.js"
import {
  promptAnalisarVideo,
  promptDirecionadorAvaliar,
  promptDirecionadorBusca,
  promptDirecionadorChat,
  promptRoteiroValidado,
} from "./prompts.js"

export const panelRoutes = express.Router()
const HANDLE = "@fatonexocuri"
const HISTORY_FILE = path.join(DATA_DIR, "canal-historico.json")
const CHAT_UPLOAD_DIR = path.join(DATA_DIR, "_chat_uploads")
if (!process.env.VERCEL) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true })

const chatUpload = multer({
  storage: process.env.VERCEL ? multer.memoryStorage() : multer.diskStorage({ destination: CHAT_UPLOAD_DIR }),
  limits: { fileSize: 40 * 1024 * 1024, files: 5 },
})

const AI_CATALOG = [
  // Nuvem (fallback automático quando rodando na Vercel sem OpenCode local)
  { id: "gemini/gemini-2.5-flash", label: "Gemini 2.5 Flash (Nuvem)", group: "Nuvem · Textos / Docs", cap: "text" },
  // Leitura de Vídeo, Imagem & Visão (Multimodal + Áudio via Whisper)
  { id: "opencode/nemotron-3.5-super-vl-free", label: "Nemotron 3.5 Super VL (Free)", group: "Free · Vídeo / Imagem", cap: "media" },
  { id: "opencode-go/gemini-4-argon", label: "Gemini 4 Argon (OpenCode Go)", group: "Go · Vídeo / Imagem", cap: "media" },
  { id: "opencode-go/gpt-6-luna", label: "GPT-6 Luna (OpenCode Go)", group: "Go · Vídeo / Imagem", cap: "media" },
  { id: "opencode-go/claude-haiku-5-5", label: "Claude Haiku 5.5 (OpenCode Go)", group: "Go · Vídeo / Imagem", cap: "media" },
  { id: "opencode-go/qwen3.8-flash", label: "Qwen 3.8 Flash (OpenCode Go)", group: "Go · Vídeo / Imagem", cap: "media" },
  { id: "opencode-go/kimi-k3.1-pro", label: "Kimi K3.1 Pro (OpenCode Go)", group: "Go · Vídeo / Imagem", cap: "media" },
  // Documentos, Textos, Roteiros & Estratégia
  { id: "opencode/mimo-v2.6-flash-free", label: "MiMo-V2.6-Flash (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/deepseek-v4.1-flash-free", label: "DeepSeek V4.1 Flash (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/qwen4-max-free", label: "Qwen 4 Max (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/hy4-flash-free", label: "HY4 Flash (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/nemotron-3.5-lightning-free", label: "Nemotron 3.5 Lightning (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/flint-40b-free", label: "Flint 40B (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/beam-free", label: "Beam (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/iceman-free", label: "Iceman (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/tidepool-alpha-free", label: "Tidepool Alpha (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode/big-pickle", label: "Big Pickle (Free)", group: "Free · Textos / Docs", cap: "text" },
  { id: "opencode-go/mimo-v2.6-flash", label: "MiMo-V2.6-Flash (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/mimo-v2.6-pro", label: "MiMo-V2.6-Pro (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/deepseek-v4-pro", label: "DeepSeek V4 Pro (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/qwen4-max", label: "Qwen 4 Max (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/grok-4.7", label: "Grok 4.7 (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/glm-5.3-flash", label: "GLM 5.3 Flash (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
  { id: "opencode-go/hy4", label: "HY4 (OpenCode Go)", group: "Go · Textos / Docs", cap: "text" },
]
const ALLOWED_IDS = new Set(AI_CATALOG.map((m) => m.id))
const VOICE_PREVIEW_DIR = path.join(DATA_DIR, "_voice_previews")
if (!process.env.VERCEL) fs.mkdirSync(VOICE_PREVIEW_DIR, { recursive: true })

function pickModels(requested) {
  const chosen = ALLOWED_IDS.has(requested) ? requested : MODELS.direcionador
  return [chosen, ...MODELS.direcionadorFallback.filter((m) => m !== chosen)]
}

function extractVideoId(input = "") {
  const s = String(input).trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const url = new URL(s)
    const parts = url.pathname.split("/").filter(Boolean)
    const id = url.hostname === "youtu.be" ? parts[0] : parts[0] === "shorts" ? parts[1] : url.searchParams.get("v")
    if (/^[\w-]{11}$/.test(id || "")) return id
  } catch {}
  return ""
}

async function readHistory() {
  if (hasSupabase()) {
    try {
      const v = await kvGet("canal-historico")
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  if (process.env.VERCEL) return []
  try {
    if (!fs.existsSync(HISTORY_FILE)) return []
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function appendHistory(snapshot) {
  const list = await readHistory()
  const today = snapshot.observedAt.slice(0, 10)
  const entry = {
    date: today,
    observedAt: snapshot.observedAt,
    subscribers: snapshot.subscribers,
    videosCount: snapshot.videosCount,
    avgViews: snapshot.stats?.avgViews ?? null,
    totalRecentViews: snapshot.stats?.totalRecentViews ?? null,
  }
  const idx = list.findIndex((item) => item.date === today)
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  const trimmed = list.slice(-90)
  if (hasSupabase()) {
    try {
      await kvSet("canal-historico", trimmed)
    } catch {}
  } else if (!process.env.VERCEL) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), "utf8")
  }
  return trimmed
}

function computeGrowth(history) {
  if (history.length < 2) return null
  const first = history[0]
  const latest = history[history.length - 1]
  return {
    sinceDate: first.date,
    subscribersDelta:
      typeof latest.subscribers === "number" && typeof first.subscribers === "number"
        ? latest.subscribers - first.subscribers
        : null,
    videosDelta:
      typeof latest.videosCount === "number" && typeof first.videosCount === "number"
        ? latest.videosCount - first.videosCount
        : null,
    avgViewsDelta:
      typeof latest.avgViews === "number" && typeof first.avgViews === "number"
        ? latest.avgViews - first.avgViews
        : null,
  }
}

panelRoutes.use((req, res, next) => {
  const origin = req.get("origin")
  const proto = req.get("x-forwarded-proto")?.split(",")[0].trim() || req.protocol
  const hostHeader = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim()
  const currentOrigin = `${proto}://${hostHeader}`
  if (!process.env.VERCEL) {
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
    const host = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(hostHeader)
    if (!loopback || !host) {
      return res.status(403).json({ error: "Abra o painel pelo endereço local do Studio." })
    }
  }
  const sameHost = (() => {
    if (!origin) return true
    try { return new URL(origin).host === hostHeader } catch { return false }
  })()
  if (
    !sameHost ||
    (origin && origin !== currentOrigin && !process.env.VERCEL) ||
    req.get("sec-fetch-site") === "cross-site" ||
    (req.method === "POST" && ((!origin && !process.env.VERCEL) || (!req.is("application/json") && !req.is("multipart/form-data"))))
  ) {
    return res.status(403).json({ error: "Requisição bloqueada por proteção de origem." })
  }
  res.set("Cache-Control", "no-store")
  next()
})

const route = (handler) => async (req, res) => {
  try {
    await handler(req, res)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar solicitação no painel."
    res.status(502).json({ error: message })
  }
}

panelRoutes.get("/studio/config", route(async (_req,res) => {
  const [catalog,go,gemini] = await Promise.all([goModels(),goKey(),providerKey("gemini")])
  res.json({ models:Object.keys(catalog),modelCatalog:catalog,voices:[ARLO,...VOICE_CATALOG],go:Boolean(go),gemini:Boolean(gemini),kit:false,cloud:true })
}))
panelRoutes.get("/studio/vozes", route(async (_req,res) => res.json((await googleVoices(await providerKey("gemini"))).filter(v=>!/^voice(?:key)?_/.test(v.id)))))
panelRoutes.get("/studio/perfil-canal", route(async (req, res) => {
  let ref = String(req.query.canal || "").trim().slice(0, 300)
  if (/^https?:\/\//i.test(ref)) {
    const url = new URL(ref)
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return res.status(400).json({ error: "Use um link de canal do YouTube." })
    ref = /^\/(?:channel\/)?(@[^/]+|UC[\w-]{22})(?:\/|$)/.exec(url.pathname)?.[1] || ""
    ref = decodeURIComponent(ref)
  }
  const byId = /^UC[\w-]{22}$/.test(ref)
  if (!byId && !/^@[\p{L}\p{N}_.-]{2,60}$/u.test(ref)) return res.status(400).json({ error: "Informe o @handle, o ID ou o link do canal." })
  const channel = await ytResolveChannel(ref).catch(() => null)
  if (channel) return res.json(channel)
  const overview = await getChannelPublicOverview(ref, byId ? ref : "")
  if (!overview.channelId) return res.status(404).json({ error: "Canal não encontrado no YouTube." })
  res.json({ id: overview.channelId, title: overview.title, handle: overview.handle, logo: overview.avatar, banner: overview.banner })
}))
panelRoutes.get("/studio/pautas", route(async (req,res) => res.json(await cloudBook(req.query.canal))))
panelRoutes.get("/studio/render-status", route(async (_req, res) => {
  const kitStored = await loadCloudKit().then(() => true, () => false)
  res.json({ kitStored, renderEnabled: false })
}))
panelRoutes.post("/studio/pautas", route(async (req,res) => {
  if (!hasSupabase()) return res.status(503).json({error:"Supabase indisponível."})
  res.json(await editCloudBook(req.body))
}))

panelRoutes.get(
  "/modelos",
  route(async (_req, res) => {
    res.json({
      default: MODELS.direcionador,
      available: AI_CATALOG,
    })
  }),
)

panelRoutes.get(
  "/vozes",
  route(async (_req, res) => {
    res.json({ voices: VOICE_CATALOG })
  }),
)

panelRoutes.get(
  "/conexoes",
  route(async (_req, res) => {
    res.json({
      youtube: Boolean(await getYouTubeKeyAsync()),
      gemini: Boolean(await providerKey("gemini")),
      opencode: true,
      opencodeCloud: Boolean(await providerKey("opencode")),
    })
  }),
)

panelRoutes.post(
  "/conexoes/:provider",
  route(async (req, res) => {
    const { provider } = req.params
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : ""
    if (!["youtube", "gemini", "opencode"].includes(provider) || key.length < 16 || key.length > 400) {
      return res.status(400).json({ error: "Confira se a chave foi copiada por inteiro." })
    }
    if (provider === "youtube") {
      await verifyYouTubeKey(key)
      await saveYouTubeKey(key)
    } else if (provider === "gemini") {
      await verifyGemini(key)
      await storeProviderKey(provider, key)
    } else {
      await storeProviderKey("opencode", key)
    }
    res.json({ connected: true })
  }),
)

async function unifiedSearch({ query, type, days, order }) {
  if (await getYouTubeKeyAsync()) {
    try {
      const apiResults = await searchYouTube({ query, type, days, order })
      if (Array.isArray(apiResults) && apiResults.length) {
        return { source: "youtube-api", results: apiResults }
      }
    } catch {
      // Se a cota da API acabar ou falhar, cai para a busca pública sem travar
    }
  }
  const pubResults = await searchYouTubePublic({ query, type, days, order, limit: 20 })
  return { source: "youtube-public", results: pubResults }
}

function filterChannelsByGoal(results, type, channelFilter) {
  if (type !== "channel") return results
  return results
    .map((ch) => ({
      ...ch,
      hitEntryGoal: typeof ch.subscribers === "number" && ch.subscribers >= 500,
      hitMonetizedGoal: typeof ch.subscribers === "number" && ch.subscribers >= 1000,
    }))
    .filter((ch) => {
      if (channelFilter === "monetized") return typeof ch.subscribers === "number" && ch.subscribers >= 1000
      if (channelFilter === "entry") return typeof ch.subscribers === "number" && ch.subscribers >= 500
      if (channelFilter === "growing") return typeof ch.subscribers === "number" && ch.subscribers >= 500 && ch.subscribers <= 50_000
      if (channelFilter === "micro") return typeof ch.subscribers === "number" && ch.subscribers < 1000
      return true
    })
}

panelRoutes.get(
  "/pesquisa",
  route(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    const type = req.query.type === "channel" ? "channel" : "video"
    const channelFilter = typeof req.query.channelFilter === "string" ? req.query.channelFilter : "all"
    const days = Number(req.query.days || 30)
    const order = ["relevance", "date", "viewCount"].includes(req.query.order) ? req.query.order : "relevance"
    if (!q || q.length > 160 || ![7, 30, 90].includes(days)) {
      return res.status(400).json({ error: "Informe um termo de busca válido e período." })
    }
    const { source, results } = await unifiedSearch({ query: q, type, days, order })
    const filtered = filterChannelsByGoal(results.filter((r) => r.id !== CHANNEL_ID), type, channelFilter)
    const saved = await saveBusca({
      modo: "direta",
      objetivo: q,
      tipo: type,
      channelFilter,
      days,
      queries: [q],
      resumo: "",
      results: filtered,
    })
    res.json({ source, results: filtered, buscaId: saved.id })
  }),
)

panelRoutes.post(
  "/direcionador/buscar",
  route(async (req, res) => {
    const objetivo = typeof req.body?.objetivo === "string" ? req.body.objetivo.trim() : ""
    const tipo = req.body?.tipo === "channel" ? "channel" : "video"
    const channelFilter = typeof req.body?.channelFilter === "string" ? req.body.channelFilter : "all"
    const days = [7, 30, 90].includes(Number(req.body?.days)) ? Number(req.body.days) : 30
    const models = pickModels(req.body?.model)
    if (!objetivo || objetivo.length > 300) {
      return res.status(400).json({ error: "Descreva o que deseja buscar com o MiMo-V2.6-Flash." })
    }

    const planOut = await askFallback({
      models,
      text: promptDirecionadorBusca({ objetivo, tipo, channelFilter }),
      timeoutMs: 65_000,
    })
    let plan
    try {
      plan = parseJsonLoose(planOut.text)
    } catch {
      plan = { queries: [objetivo], criterio: "Busca direta pelo termo informado." }
    }
    const queries = Array.isArray(plan.queries) && plan.queries.length ? plan.queries.slice(0, 3) : [objetivo]

    const searchBatches = await Promise.all(
      queries.map((q) => unifiedSearch({ query: String(q).slice(0, 120), type: tipo, days, order: "relevance" }).catch(() => ({ results: [] }))),
    )

    const seen = new Set()
    let merged = []
    for (const batch of searchBatches) {
      for (const item of batch.results || []) {
        const key = item.id || item.url
        if (!key || key === CHANNEL_ID || seen.has(key)) continue
        seen.add(key)
        merged.push(item)
      }
    }
    merged = filterChannelsByGoal(merged, tipo, channelFilter)

    let canalInfo = null
    try {
      canalInfo = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    } catch {}

    let avaliacao = { resumo: "", destaques: [], proximas_buscas: [] }
    let evalModel = planOut.model
    if (merged.length) {
      const evalOut = await askFallback({
        models,
        text: promptDirecionadorAvaliar({ objetivo, tipo, resultados: merged, canalInfo }),
        timeoutMs: 90_000,
      })
      evalModel = evalOut.model
      try {
        avaliacao = parseJsonLoose(evalOut.text)
      } catch {
        avaliacao = { resumo: evalOut.text.slice(0, 500), destaques: [], proximas_buscas: [] }
      }
    }

    const payload = {
      model: evalModel,
      queries,
      criterio: plan.criterio || "",
      avaliacao,
      results: merged.slice(0, 24),
    }
    const saved = await saveBusca({
      modo: "ia",
      objetivo,
      tipo,
      days,
      model: evalModel,
      queries,
      criterio: payload.criterio,
      avaliacao,
      results: payload.results,
    })
    res.json({ ...payload, buscaId: saved.id })
  }),
)

panelRoutes.post(
  "/video/analisar",
  route(async (req, res) => {
    const urlOrId = typeof req.body?.urlOrId === "string" ? req.body.urlOrId.trim() : ""
    const transcricaoManual = typeof req.body?.transcricaoManual === "string" ? req.body.transcricaoManual.trim() : ""
    const videoId = extractVideoId(urlOrId)
    if (!videoId) {
      return res.status(400).json({ error: "Informe uma URL ou ID válido de vídeo/Short do YouTube." })
    }
    let video = await getVideoDetailsAndTranscript(videoId)
    // Se for um vídeo do próprio canal em cache (ex.: na Vercel), enriquece com os dados salvos
    try {
      const cat = await getChannelVideosCatalog()
      const hit = cat.find((s) => s.id === videoId)
      if (hit) {
        video = {
          ...video,
          title: video.title || hit.title || "",
          channel: video.channel || "FatoNexo",
          views: video.views ?? hit.views ?? null,
          durationSeconds: video.durationSeconds ?? hit.durationSeconds ?? null,
          description: video.description || hit.description || "",
          transcript: video.transcript || hit.transcript || "",
          hasCaptions: Boolean(video.transcript || hit.transcript),
        }
      }
    } catch {}
    if (!transcricaoManual && !video.transcript && !video.title && !video.description) {
      return res.status(422).json({
        error:
          "Não consegui ler os dados deste vídeo (título, descrição ou legenda). Confira o link/ID ou cole a fala do vídeo no campo de transcrição e tente de novo.",
      })
    }
    const models = pickModels(req.body?.model)
    const ai = await askFallback({
      models,
      text: promptAnalisarVideo({ video, transcricaoManual }),
      timeoutMs: 65_000,
    })
    let analise
    try {
      analise = parseJsonLoose(ai.text)
    } catch {
      analise = {
        tem_transcricao: Boolean(transcricaoManual || video.transcript),
        promessa: ai.text.slice(0, 400),
        contexto: "",
        entrega: "",
        estrategias: [],
        por_que_retencao: "",
        adaptacao_fatonexo: null,
      }
    }
    const saved = await saveAnalise({ video, analise, model: ai.model })
    res.json({ video, analise, model: ai.model, analiseId: saved.id })
  }),
)

panelRoutes.post(
  "/roteiro",
  route(async (req, res) => {
    const pauta = typeof req.body?.pauta === "string" ? req.body.pauta.trim() : ""
    if (!pauta || pauta.length > 240) {
      return res.status(400).json({ error: "Informe a pauta ou pergunta central do roteiro." })
    }
    const models = pickModels(req.body?.model)
    const ai = await askFallback({
      models,
      text: promptRoteiroValidado({
        pauta,
        promessa: typeof req.body?.promessa === "string" ? req.body.promessa.trim() : "",
        contexto: typeof req.body?.contexto === "string" ? req.body.contexto.trim() : "",
        entrega: typeof req.body?.entrega === "string" ? req.body.entrega.trim() : "",
        referencia: typeof req.body?.referencia === "string" ? req.body.referencia.trim() : "",
        duracao: Number(req.body?.duracao) || 45,
        tom: typeof req.body?.tom === "string" ? req.body.tom.trim() : "",
      }),
      timeoutMs: 65_000,
    })
    const roteiro = parseJsonLoose(ai.text)
    const saved = await saveRoteiro({
      id: typeof req.body?.id === "string" ? req.body.id : undefined,
      status: "validado",
      channelId: /^UC[\w-]{22}$/.test(req.body.channelId || "") ? req.body.channelId : undefined,
      pautaId: typeof req.body?.pautaId === "string" ? req.body.pautaId.slice(0,80) : undefined,
      pauta,
      duracao: Number(req.body?.duracao) || 45,
      tom: typeof req.body?.tom === "string" ? req.body.tom.trim() : "",
      model: ai.model,
      roteiro,
    })
    res.json({ roteiro, model: ai.model, roteiroId: saved.id, saved })
  }),
)

panelRoutes.post(
  "/roteiro/rascunho",
  route(async (req, res) => {
    const pauta = typeof req.body?.pauta === "string" ? req.body.pauta.trim() : ""
    const texto = typeof req.body?.roteiro === "string" ? req.body.roteiro.trim() : ""
    if (!pauta && !texto) {
      return res.status(400).json({ error: "Informe pelo menos a pauta ou o texto do rascunho." })
    }
    const saved = await saveRoteiro({
      id: typeof req.body?.id === "string" && req.body.id ? req.body.id : undefined,
      status: "rascunho",
      channelId: /^UC[\w-]{22}$/.test(req.body.channelId || "") ? req.body.channelId : undefined,
      pautaId: typeof req.body?.pautaId === "string" ? req.body.pautaId.slice(0,80) : undefined,
      pauta: pauta || "Rascunho sem título",
      duracao: Number(req.body?.duracao) || 45,
      tom: typeof req.body?.tom === "string" ? req.body.tom.trim() : "",
      model: "manual",
      roteiro: {
        titulo: pauta || "Rascunho",
        promessa: typeof req.body?.promessa === "string" ? req.body.promessa.trim() : "",
        contexto: typeof req.body?.contexto === "string" ? req.body.contexto.trim() : "",
        entrega: typeof req.body?.entrega === "string" ? req.body.entrega.trim() : "",
        roteiro: texto,
      },
    })
    res.json({ saved })
  }),
)

panelRoutes.post(
  "/direcionador/perguntar",
  route(async (req, res) => {
    const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : ""
    if (!pergunta || pergunta.length > 800) {
      return res.status(400).json({ error: "Escreva uma pergunta para o Direcionador." })
    }
    let canalInfo = null
    try {
      canalInfo = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    } catch {}
    const models = pickModels(req.body?.model)
    const ai = await askFallback({
      models,
      text: promptDirecionadorChat({ pergunta, canalInfo }),
      timeoutMs: 90_000,
    })
    res.json({ resposta: ai.text.trim(), model: ai.model })
  }),
)

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
})

panelRoutes.get(
  "/youtube/analytics",
  route(async (_req, res) => {
    const st = await getOAuthStatus()
    if (!st.connected) {
      return res.status(401).json({ error: "Conecte sua conta do YouTube (OAuth 2.0) em Integrações para ver a retenção real." })
    }
    const summary = await getAnalyticsSummary()
    const ids = summary.topVideos.map((v) => v.videoId)
    const details = ids.length ? await ytGetVideosByIds(ids).catch(() => []) : []
    const byId = new Map((details || []).map((d) => [d.id, d]))
    summary.topVideos = summary.topVideos.map((v) => ({ ...v, title: byId.get(v.videoId)?.title || v.videoId }))
    res.json(summary)
  }),
)

panelRoutes.post(
  "/youtube/upload",
  videoUpload.single("video"),
  route(async (req, res) => {
    if (!req.file?.buffer?.length) return res.status(400).json({ error: "Selecione um arquivo de vídeo (.mp4 / .mov)." })
    const title = String(req.body?.title || "").trim()
    if (!title) return res.status(400).json({ error: "Informe o título do Short." })
    const tags = String(req.body?.tags || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const uploaded = await uploadShortToYouTube({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype || "video/mp4",
      title,
      description: String(req.body?.description || ""),
      tags,
      privacyStatus: String(req.body?.privacyStatus || "private"),
      publishAt: String(req.body?.publishAt || ""),
    })
    const roteiroId = String(req.body?.roteiroId || "").trim()
    if (roteiroId) {
      await updateAcervoItem("roteiros", roteiroId, {
        status: "publicado",
        publishedId: uploaded.id,
        publishedUrl: uploaded.url,
        publishedTitle: uploaded.title,
        publishedAt: new Date().toISOString(),
      }).catch(() => {})
    }
    res.json({ uploaded })
  }),
)

panelRoutes.get(
  "/video/:id/comentarios",
  route(async (req, res) => {
    const id = extractVideoId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de vídeo inválido." })
    const comments = await ytGetVideoComments(id, 20)
    if (comments === null) {
      return res.status(400).json({ error: "Conecte a chave da YouTube Data API v3 em Integrações para ler comentários." })
    }
    res.json({ videoId: id, comments })
  }),
)

panelRoutes.get(
  "/funil",
  route(async (_req, res) => {
    const [acervo, overview] = await Promise.all([
      readAcervo(),
      getChannelPublicOverview(HANDLE, CHANNEL_ID).catch(() => null),
    ])
    const roteiros = acervo.roteiros || []
    const publicadosRoteiros = roteiros.filter((r) => r.publishedId)
    const prontos = roteiros.filter((r) => !r.publishedId)
    const shorts = overview?.recentShorts || []
    const viewsById = new Map(shorts.map((s) => [s.id, s]))
    const publicados = publicadosRoteiros.map((r) => {
      const s = viewsById.get(r.publishedId)
      return {
        id: r.id,
        titulo: r.titulo || r.title || s?.title || r.publishedId,
        publishedId: r.publishedId,
        publishedUrl: r.publishedUrl,
        views: s?.views ?? r.publishedViews ?? null,
        likes: s?.likes ?? null,
        comments: s?.comments ?? null,
      }
    })
    res.json({
      source: overview?.source || "youtube-public",
      counts: {
        analises: (acervo.analises || []).length,
        roteiros: roteiros.length,
        prontos: prontos.length,
        publicadosVinculados: publicados.length,
        shortsNoCanal: overview?.videosCount ?? shorts.length,
        totalChannelViews: overview?.totalChannelViews ?? overview?.stats?.totalRecentViews ?? null,
      },
      prontos: prontos.slice(0, 12).map((r) => ({ id: r.id, titulo: r.titulo || r.title || "Roteiro", createdAt: r.createdAt })),
      publicados: publicados.slice(0, 12),
      recentShorts: shorts.slice(0, 8),
    })
  }),
)

panelRoutes.get(
  "/canal/padroes",
  route(async (req, res) => {
    const overview = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    const cmp = compareTopVsBottom(overview.recentShorts || [])
    let ai = null
    if (req.query.ai === "1" && cmp.sampleSize >= 4) {
      try {
        const out = await askFallback({
          models: pickModels(req.query.model),
          timeoutMs: 40_000,
          text: `Analise os padrões do canal @fatonexocuri comparando Top ${cmp.top.length} vs Piores ${cmp.bottom.length} Shorts:
TOP: ${JSON.stringify(cmp.top.map((s) => ({ title: s.title, views: s.views })))}
PIORES: ${JSON.stringify(cmp.bottom.map((s) => ({ title: s.title, views: s.views })))}
Métricas: ${JSON.stringify({ topStats: cmp.topStats, bottomStats: cmp.bottomStats })}
Responda em português do Brasil, objetivo (máx 6 linhas): 3 regras práticas do que funciona melhor neste canal e 2 erros a evitar.`,
        })
        ai = { text: out.text.trim(), model: out.model }
      } catch (e) {
        ai = { error: e instanceof Error ? e.message.slice(0, 180) : "Erro na IA" }
      }
    }
    res.json({ ...cmp, ai })
  }),
)

panelRoutes.post(
  "/titulo/testar",
  route(async (req, res) => {
    const titulo = String(req.body?.titulo || "").trim()
    const gancho = String(req.body?.gancho || "").trim()
    if (!titulo && !gancho) return res.status(400).json({ error: "Informe um título ou gancho para testar." })
    const overview = await getChannelPublicOverview(HANDLE, CHANNEL_ID).catch(() => null)
    const topTitles = (overview?.recentShorts || [])
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 5)
      .map((s) => `${s.title} (${s.views} views)`)
    const ai = await askFallback({
      models: pickModels(req.body?.model),
      timeoutMs: 40_000,
      text: `Você é especialista em YouTube Shorts de curiosidades (@fatonexocuri).
Top Shorts do canal: ${topTitles.join(" | ") || "n/d"}
Avalie este candidato:
Título: "${titulo}"
Gancho (0-3s): "${gancho}"
Devolva APENAS JSON válido:
{"nota": 0-10, "diagnostico": "1 frase direta", "variacoes": [{"titulo": "...", "gancho": "...", "motivo": "..."}]} (4 variações).`,
    })
    let parsed
    try {
      parsed = parseJsonLoose(ai.text)
    } catch {
      parsed = { nota: null, diagnostico: ai.text.slice(0, 300), variacoes: [] }
    }
    res.json({ ...parsed, model: ai.model })
  }),
)

panelRoutes.post(
  "/roteiro/pacote",
  route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Short").trim()
    const texto = String(req.body?.texto || "").trim()
    if (!texto) return res.status(400).json({ error: "Cole ou gere um roteiro antes de montar o pacote." })
    const srt = buildSrtFromText(texto)
    let cenas = []
    let model = null
    try {
      const ai = await askFallback({
        models: pickModels(req.body?.model),
        timeoutMs: 45_000,
        text: `Divida este roteiro de Short em cenas curtas (2-4s cada) para edição no CapCut/editor.
Título: ${titulo}
Roteiro:
${texto}
Devolva APENAS JSON válido:
{"cenas": [{"tempo": "0-3s", "fala": "...", "visual": "descrição visual curta", "prompt_imagem": "prompt em inglês para gerar imagem/B-roll"}]}`,
      })
      model = ai.model
      const parsed = parseJsonLoose(ai.text)
      if (Array.isArray(parsed?.cenas)) cenas = parsed.cenas
    } catch {}
    res.json({ titulo, srt, cenas, model })
  }),
)

panelRoutes.post(
  "/roteiro/:id/publicar",
  route(async (req, res) => {
    const urlOrId = String(req.body?.urlOrId || "").trim()
    const videoId = extractVideoId(urlOrId)
    if (!videoId) return res.status(400).json({ error: "Informe uma URL ou ID válido do Short publicado." })
    const video = await getVideoDetailsAndTranscript(videoId).catch(() => ({ id: videoId, title: "", views: null }))
    const updated = await updateAcervoItem("roteiros", req.params.id, {
      status: "publicado",
      publishedId: videoId,
      publishedUrl: `https://www.youtube.com/shorts/${videoId}`,
      publishedTitle: video.title || "",
      publishedViews: video.views ?? null,
      publishedAt: new Date().toISOString(),
    })
    if (!updated) return res.status(404).json({ error: "Roteiro não encontrado no acervo." })
    res.json({ item: updated })
  }),
)

panelRoutes.get(
  "/concorrentes",
  route(async (req, res) => {
    const list = await readConcorrentes()
    const radar = req.query.radar === "1" ? await buildRadar(list) : []
    res.json({ concorrentes: list, radar })
  }),
)

panelRoutes.post(
  "/concorrentes",
  route(async (req, res) => {
    const ch = await resolveChannelInput(req.body?.canal || "")
    const list = await readConcorrentes()
    if (!list.some((c) => c.id === ch.id)) {
      list.push(ch)
      await writeConcorrentes(list)
    }
    res.json({ concorrentes: list, added: ch })
  }),
)

panelRoutes.delete(
  "/concorrentes/:id",
  route(async (req, res) => {
    const list = (await readConcorrentes()).filter((c) => c.id !== req.params.id)
    await writeConcorrentes(list)
    res.json({ concorrentes: list })
  }),
)

panelRoutes.get(
  "/agenda",
  route(async (_req, res) => {
    res.json({ agenda: await readAgenda() })
  }),
)

panelRoutes.post(
  "/agenda",
  route(async (req, res) => {
    const titulo = String(req.body?.titulo || "").trim()
    if (!titulo) return res.status(400).json({ error: "Informe o título da ação." })
    const out = await addAgendaItem({
      titulo,
      tipo: String(req.body?.tipo || "postar"),
      quando: String(req.body?.quando || ""),
      detalhes: String(req.body?.detalhes || ""),
      origem: "manual",
    })
    res.json(out)
  }),
)

panelRoutes.patch(
  "/agenda/:id",
  route(async (req, res) => {
    const agenda = await updateAgendaItem(req.params.id, {
      status: req.body?.status,
      titulo: req.body?.titulo,
      quando: req.body?.quando,
    })
    res.json({ agenda })
  }),
)

panelRoutes.delete(
  "/agenda/:id",
  route(async (req, res) => {
    res.json({ agenda: await deleteAgendaItem(req.params.id) })
  }),
)

panelRoutes.get(
  "/horarios",
  route(async (req, res) => {
    const overview = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    const queries = String(req.query.q || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const data = await buildHorarios({ overview, queries })
    if (req.query.ai === "1") {
      try {
        const ai = await askFallback({
          models: pickModels(req.query.model),
          timeoutMs: 40_000,
          text: `Você é analista de YouTube Shorts do canal @fatonexocuri (nicho: curiosidades/ciência). Fuso: Brasília.
Dados do canal por período (média de views por Short): ${JSON.stringify(data.own.byPeriod)}
Melhores Shorts do canal (dia/hora): ${JSON.stringify(data.own.topVideos)}
Mercado, velocidade (views/hora) por hora de postagem: ${JSON.stringify(data.market.byHour.filter((h) => h.n > 0))}
Conclusões automáticas: ${data.verdict.join(" ")}
Responda em português do Brasil, em até 6 linhas: sugira 2 ou 3 horários para TESTAR nas próximas semanas e deixe claro que a amostra é pequena. Não invente números.`,
        })
        data.ai = { text: ai.text.trim(), model: ai.model }
      } catch (error) {
        data.ai = { error: error instanceof Error ? error.message.slice(0, 200) : "Falha ao gerar recomendação." }
      }
    }
    res.json(data)
  }),
)

panelRoutes.get(
  "/canal",
  route(async (req, res) => {
    const channel = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    const history = await appendHistory(channel)
    const growth = computeGrowth(history)
    let aiPulse = ""
    if (req.query.ai === "1") {
      try {
        const models = pickModels(req.query.model)
        const latest = (channel.recentShorts || []).slice(0, 5).map((s) => `${s.title} (${s.views ?? 0} views)`).join(" | ")
        const out = await askFallback({
          models,
          timeoutMs: 35_000,
          text: `Você é o analista em tempo real do canal @fatonexocuri.
Dados ao vivo: ${channel.subscribers ?? 0} inscritos, ${channel.videosCount ?? 0} vídeos, média recente ${channel.stats?.avgViews ?? 0} views/Short.
Últimos Shorts: ${latest}.
Escreva um diagnóstico curto em 2 frases diretas destacando o ritmo atual e 1 ação imediata para ganhar mais inscritos hoje.`,
        })
        aiPulse = out.text.trim()
      } catch {}
    }
    res.json({ channel, history, growth, aiPulse })
  }),
)

startLiveMonitor()

panelRoutes.get(
  "/canal/live",
  route(async (_req, res) => {
    res.json(await getSnapshotAsync())
  }),
)

panelRoutes.post(
  "/canal/live/atualizar",
  route(async (_req, res) => {
    res.json(await pollOnce())
  }),
)

panelRoutes.get("/canal/stream", (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  })
  res.flushHeaders?.()
  res.write("retry: 4000\n\n")
  addClient(res)
  res.write(`event: snapshot\ndata: ${JSON.stringify(getSnapshot())}\n\n`)
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n")
    } catch {}
  }, 20_000)
  req.on("close", () => clearInterval(heartbeat))
})

panelRoutes.post(
  "/canal/live/insight",
  route(async (req, res) => {
    const cached = getInsight()
    const force = req.body?.force === true
    if (!force && cached && Date.now() - cached.at < 10 * 60_000) return res.json({ insight: cached, cached: true })
    const snap = getSnapshot()
    const cur = snap.current
    if (!cur) return res.status(400).json({ error: "O monitor ainda não coletou dados. Aguarde alguns segundos." })
    const fmtDelta = (d) => (d ? `${d.subs ?? 0} inscritos e ${d.views ?? 0} views${d.partial ? " (desde que o monitor começou)" : ""}` : "sem base ainda")
    const top = snap.shorts.slice(0, 5).map((s) => `- ${s.title}: ${s.views} views${s.delta1h != null ? ` (+${s.delta1h} na última hora)` : ""}`).join("\n")
    const models = pickModels(req.body?.model)
    const ai = await askFallback({
      models,
      timeoutMs: 60_000,
      text: `Você é o analista de crescimento em tempo real do canal @fatonexocuri (FatoNexo, YouTube Shorts de curiosidades).
Leitura ao vivo: ${cur.subs ?? "?"} inscritos, ${cur.videos ?? "?"} vídeos, ${cur.views ?? 0} views somadas nos Shorts, média ${cur.avg ?? 0} views/Short.
Variação 1h: ${fmtDelta(snap.deltas.h1)}.
Variação 24h: ${fmtDelta(snap.deltas.h24)}.
Top Shorts:
${top || "(sem dados)"}
Metas: 500 inscritos e 3M views em 90 dias (entrada YPP); 1.000 inscritos e 10M views (anúncios).

Responda em português do Brasil, Markdown curto, EXATAMENTE neste formato:
### Diagnóstico
(2 frases com números reais acima, sem inventar métricas)
### O que está funcionando
(1 a 2 itens)
### Faça agora
(2 ações concretas para ganhar inscritos e views nas próximas 24h)`,
    })
    const insight = { text: ai.text.trim(), model: ai.model, at: Date.now() }
    setInsight(insight)
    res.json({ insight, cached: false })
  }),
)

panelRoutes.get(
  "/canal/:id/videos",
  route(async (req, res) => {
    const raw = String(req.params.id || "").trim()
    if (!/^(@[\w.-]+|UC[\w-]{10,40})$/.test(raw)) {
      return res.status(400).json({ error: "ID ou handle de canal inválido." })
    }
    const overview = await getChannelPublicOverview(raw, raw.startsWith("UC") ? raw : "")
    res.json(overview)
  }),
)

panelRoutes.post(
  "/narracao",
  route(async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
    if (!text || text.length > 5000 || req.body?.confirmed !== true) {
      return res.status(400).json({ error: "Informe um roteiro de até 5.000 caracteres e confirme o envio ao Google." })
    }
    const voice = typeof req.body?.voice === "string" ? req.body.voice : "Kore"
    const style = typeof req.body?.style === "string" ? req.body.style : "narration"
    const wav = await generateNarration({ key: await providerKey("gemini"), text, voice, style })
    res.type("audio/wav").send(wav)
  }),
)

panelRoutes.post(
  "/narracao/preview",
  route(async (req, res) => {
    const voice = typeof req.body?.voice === "string" ? req.body.voice : "Kore"
    const style = typeof req.body?.style === "string" ? req.body.style : "narration"
    const safeVoice = VOICE_CATALOG.some((v) => v.id === voice) ? voice : "Kore"
    const safeStyle = /^[a-z]+$/i.test(style) ? style : "narration"
    const cacheFile = path.join(VOICE_PREVIEW_DIR, `${safeVoice}-${safeStyle}.wav`)
    if (!process.env.VERCEL && fs.existsSync(cacheFile)) {
      return res.type("audio/wav").send(fs.readFileSync(cacheFile))
    }
    const sample = "Olá! Esta é uma prévia desta voz no estúdio FatoNexo."
    const wav = await generateNarration({ key: await providerKey("gemini"), text: sample, voice: safeVoice, style: safeStyle })
    if (!process.env.VERCEL) fs.writeFileSync(cacheFile, wav)
    res.type("audio/wav").send(wav)
  }),
)

panelRoutes.get(
  "/acervo",
  route(async (_req, res) => {
    res.json(await readAcervo())
  }),
)

panelRoutes.patch(
  "/acervo/:kind/:id",
  route(async (req, res) => {
    const { kind, id } = req.params
    const patch = {}
    if (typeof req.body?.archived === "boolean") patch.archived = req.body.archived
    const updated = await updateAcervoItem(kind, id, patch)
    if (!updated) return res.status(404).json({ error: "Item não encontrado no acervo." })
    res.json({ item: updated, acervo: await readAcervo() })
  }),
)

panelRoutes.delete(
  "/acervo/:kind/:id",
  route(async (req, res) => {
    const { kind, id } = req.params
    const list = await deleteAcervoItem(kind, id)
    if (!list) return res.status(400).json({ error: "Tipo inválido." })
    res.json({ acervo: await readAcervo() })
  }),
)

panelRoutes.post(
  "/chat",
  chatUpload.array("files", 5),
  route(async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : ""
    const requestedFile = Object.hasOwn(fileFormats, req.body?.output) ? req.body.output : ""
    const projectId = req.body?.projectId
    if (projectId && !isLocalStudio(req)) return res.status(403).json({ error: "A edição de projetos pelo chat está disponível no Studio local." })
    const project = projectId ? req.app.locals.chatProject(projectId) : null
    const files = Array.isArray(req.files) ? req.files : []
    if (!message && !files.length) {
      return res.status(400).json({ error: "Escreva uma mensagem ou anexe um arquivo, áudio ou imagem." })
    }

    const attachments = []
    const contextParts = []

    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLowerCase()
      const safeName = `${crypto.randomBytes(6).toString("hex")}${ext}`
      let url = ""
      let destPath = ""
      if (process.env.VERCEL && file.buffer) {
        url = `data:${file.mimetype || "application/octet-stream"};base64,${file.buffer.toString("base64")}`
      } else {
        destPath = path.join(CHAT_UPLOAD_DIR, safeName)
        fs.renameSync(file.path, destPath)
        url = `/p/_chat_uploads/${safeName}`
      }

      const isAudio = file.mimetype?.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(ext)
      const isImage = file.mimetype?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(ext)
      const isText = file.mimetype?.startsWith("text/") || /\.(txt|md|csv|json|srt|vtt|log)$/i.test(ext)

      if (isAudio) {
        let transcript = ""
        if (process.env.VERCEL) {
          transcript = "(Transcrição local via Whisper disponível no Studio desktop; na Vercel, envie o texto ou resumo do áudio.)"
        } else {
          try {
            const w = await transcribeAudio(destPath)
            transcript = (w.segments || []).map((s) => s.text).join(" ").trim()
          } catch (err) {
            transcript = `(Não foi possível transcrever automaticamente: ${err.message})`
          }
        }
        attachments.push({ kind: "audio", name: file.originalname, url, transcript })
        contextParts.push(`[ÁUDIO ANEXADO: ${file.originalname}]\nTranscrição automática:\n${transcript.slice(0, 8000)}`)
      } else if (isImage) {
        attachments.push({ kind: "image", name: file.originalname, url })
        contextParts.push(`[IMAGEM ANEXADA: ${file.originalname}]`)
      } else if (isText) {
        let text = ""
        try {
          text = file.buffer ? file.buffer.toString("utf8").slice(0, 12_000) : fs.readFileSync(destPath, "utf8").slice(0, 12_000)
        } catch {}
        attachments.push({ kind: "file", name: file.originalname, url })
        contextParts.push(`[ARQUIVO ANEXADO: ${file.originalname}]\nConteúdo:\n${text}`)
      } else {
        attachments.push({ kind: "file", name: file.originalname, url })
        contextParts.push(`[ARQUIVO ANEXADO: ${file.originalname} (${file.mimetype || "binário"})]`)
      }
    }

    const [acervo, concorrentes, agenda, oauthSt] = await Promise.all([
      readAcervo(),
      readConcorrentes().catch(() => []),
      readAgenda().catch(() => []),
      getOAuthStatus().catch(() => ({ connected: false })),
    ])
    const chatId = typeof req.body?.chatId === "string" && req.body.chatId ? req.body.chatId : undefined
    const existingThread = chatId ? acervo.chats.find((c) => c.id === chatId) : null
    const recentMessages = (existingThread?.messages || []).slice(-8)
    const recentChat = recentMessages.map((m) => `${m.role === "user" ? "Criador" : "Direcionador"}: ${m.text}`).join("\n")
    const previousFile = recentMessages.findLast(m => m.files?.length)?.files.at(-1)
    const useProjectHtml = requestedFile === "html" || /\bhtml\b/i.test(message) || /\.html$/i.test(previousFile?.name || "")
    const projectContext = project && {
      titulo: project.titulo, descricao: project.descricao, roteiro: project.roteiro,
      ...(useProjectHtml && { html: project.html, htmlExcedeLimite: project.htmlLimit }),
    }
    const lastSearches = acervo.buscas.slice(0, 3).map((b) => `- "${b.objetivo}" (${b.results?.length ?? 0} resultados)`).join("\n")
    const lastAnalyses = acervo.analises.slice(0, 3).map((a) => `- ${a.video?.title || a.video?.id}: Promessa="${a.analise?.promessa || ""}"`).join("\n")
    const lastRoteiros = acervo.roteiros.slice(0, 5).map((r) => `- [id:${r.id}] "${r.pauta || r.titulo || "Roteiro"}" (${r.publishedId ? `publicado: ${r.publishedId}` : "rascunho"})`).join("\n")
    const pendingAgenda = agenda.filter((a) => a.status !== "concluido").slice(0, 6).map((a) => `- [${a.tipo}] ${a.titulo}${a.quando ? ` (${a.quando})` : ""}`).join("\n")

    let analyticsCtx = ""
    if (oauthSt.connected) {
      try {
        const an = await getAnalyticsSummary()
        const s = an.summary
        analyticsCtx = `\n[YOUTUBE ANALYTICS REAL - ÚLTIMOS 28 DIAS]\nViews: ${s.views} | Minutos assistidos: ${s.estimatedMinutesWatched} | Retenção média: ${s.averageViewPercentage.toFixed(1)}% (${Math.round(s.averageViewDuration)}s) | Inscritos ganhos: +${s.subscribersGained}\nTop retenção: ${an.topVideos.slice(0, 4).map((v) => `${v.videoId} (${v.averageViewPercentage.toFixed(1)}%, ${v.views} views)`).join(" | ")}`
      } catch {}
    }

    let canalResumo = ""
    try {
      const snap = getSnapshot()
      const ch = snap.channel && snap.current ? { ...snap.channel, ...snap.current } : await getChannelPublicOverview(HANDLE, CHANNEL_ID)
      const catalog = await getChannelVideosCatalog()
      const shortsList = catalog
        .slice(0, 18)
        .map((s, idx) => {
          const extra = [
            s.durationSeconds ? `${s.durationSeconds}s` : "",
            s.date || "",
            s.transcript ? `Roteiro/legenda: "${s.transcript.slice(0, 260)}"` : s.description ? `Descrição: "${s.description.slice(0, 220).replace(/\s+/g, " ")}"` : "",
          ]
            .filter(Boolean)
            .join(" | ")
          return `${idx + 1}. "${s.title}" — ${s.views ?? 0} views (id: ${s.id})${extra ? ` · ${extra}` : ""}`
        })
        .join("\n")
      canalResumo = `Canal @fatonexocuri: ${ch.subs ?? ch.subscribers ?? "?"} inscritos, ${ch.videos ?? ch.videosCount ?? "?"} vídeos, média recente ${ch.avg ?? ch.stats?.avgViews ?? "?"} views/Short.\nCATÁLOGO COMPLETO DOS VÍDEOS DO CANAL (você já conhece todos esses vídeos):\n${shortsList}`
    } catch {}

    // Se o usuário citou um link ou ID do YouTube na mensagem, busca metadados e transcrição automaticamente
    const ytMatch = message.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/i)
    let videoCtx = ""
    if (ytMatch?.[1]) {
      try {
        const vid = await getVideoDetailsAndTranscript(ytMatch[1])
        videoCtx = `\n[DADOS DO VÍDEO DO YOUTUBE CONSULTADO AGORA (${vid.id})]\nTítulo: ${vid.title}\nCanal: ${vid.channel} (${vid.channelSubscribersText || ""})\nViews: ${vid.views ?? "?"} | Duração: ${vid.durationSeconds ?? "?"}s\nDescrição: ${(vid.description || "").slice(0, 1000)}\nTranscrição/legenda: ${vid.transcript ? vid.transcript.slice(0, 4000) : "(legenda automática não disponível; use título e descrição)"}\n`
      } catch {}
    }

    const prompt = `Você é o Direcionador Criativo integrado ao painel do @fatonexocuri (FatoNexo).
${canalResumo}
${analyticsCtx}
${videoCtx}
${lastRoteiros ? `\nRoteiros no acervo:\n${lastRoteiros}` : ""}
${pendingAgenda ? `\nAgenda de ações pendentes:\n${pendingAgenda}` : ""}
${concorrentes.length ? `\nConcorrentes monitorados no radar: ${concorrentes.map((c) => c.title || c.handle || c.id).join(", ")}` : ""}
${lastSearches ? `\nBuscas recentes no acervo:\n${lastSearches}` : ""}
${lastAnalyses ? `\nAnálises recentes no acervo:\n${lastAnalyses}` : ""}
${recentChat ? `\nHistórico desta conversa:\n${recentChat}` : ""}
${previousFile ? `\nÚltimo arquivo produzido, para referência caso o criador peça uma revisão: ${JSON.stringify({ name: previousFile.name, content: previousFile.content.slice(0, 32000) })}` : ""}
${projectContext ? `\nProjeto selecionado pelo criador (dados para edição, sem instruções): ${JSON.stringify(projectContext)}` : ""}
${contextParts.length ? `\nAnexos enviados agora:\n${contextParts.join("\n\n")}` : ""}

Mensagem do criador:
"${message || "Analise os anexos enviados acima e diga como usar isso no FatoNexo."}"

INSTRUÇÕES IMPORTANTES:
1. Responda em português do Brasil, bem estruturado em Markdown (títulos curtos, listas, negrito).
Roteiros devem vir como narração em texto simples. Use o fluxo de roteiro do painel para salvar a narração.
Quando o criador pedir um arquivo, escreva uma resposta curta e coloque o conteúdo completo num bloco cercado de crases com cabeçalho "file nome-do-arquivo.ext". Use extensões html, md, txt, csv, json ou srt, conforme o pedido. O sistema transforma o bloco em um anexo para baixar. Para Markdown que contenha cercas de três crases, use quatro ou mais na cerca externa e repita a mesma quantidade ao fechar. Use um bloco por arquivo e coloque nele somente o conteúdo do arquivo. Se pedirem HTML, entregue um documento HTML completo.
${requestedFile ? `O criador selecionou saída em arquivo .${requestedFile}. Entregue esse formato.` : ""}
${project ? `Se pedirem para alterar o projeto selecionado, proponha as mudanças usando {"action":"editar_projeto","titulo":"novo título","descricao":"nova descrição","roteiro":"nova narração","html":true} no bloco studio-action. Inclua apenas os campos solicitados. Para HTML, inclua html:true e entregue o documento completo no bloco de arquivo .html. Se htmlExcedeLimite for true, explique que precisa de um HTML menor. Diga que a proposta aguarda confirmação.` : ""}
2. Sempre que o criador pedir para criar, editar, agendar ou executar algo no sistema, inclua no FINAL da resposta um bloco JSON exatamente entre \`\`\`studio-action e \`\`\` para executar automaticamente no painel:
   - Criar roteiro (salva no acervo):
     {"action":"criar_roteiro","pauta":"...","promessa":"...","contexto":"...","entrega":"...","roteiro":"texto corrido completo da narração"}
   - Editar roteiro existente (use o id da lista acima):
     {"action":"atualizar_roteiro","id":"ID_DO_ROTEIRO","pauta":"...","promessa":"...","contexto":"...","entrega":"...","roteiro":"texto atualizado"}
   - Agendar ação ou publicação (salva na Agenda de Estratégia):
     {"action":"agendar_acao","titulo":"...","tipo":"postar|roteiro|analise|busca","quando":"2026-11-25 18:00","detalhes":"..."}
   - Monitorar canal concorrente no Radar:
     {"action":"monitorar_concorrente","canal":"@handle"}
   - Buscar no YouTube:
     {"action":"buscar","query":"termo curto","searchType":"channel"}
   - Analisar vídeo específico (ID de 11 caracteres):
     {"action":"analisar_video","videoId":"XXXXXXXXXXX"}
   - Criar pauta na fila de Estratégia:
     {"action":"criar_pauta","title":"...","promise":"...","context":"...","payoff":"..."}
   Use no máximo UM bloco studio-action por resposta. Não use tabelas Markdown largas; prefira listas.`

    const models = pickModels(req.body?.model)
    const ai = await askFallback({ models, text: prompt, timeoutMs: 75_000 })

    const output = splitChatFiles(ai.text, requestedFile)
    let cleanText = output.text
    let panelAction = null
    const actionMatch = cleanText.match(/```studio-action\s*([\s\S]*?)```/i)
    if (actionMatch) {
      cleanText = cleanText.replace(actionMatch[0], "").trim()
      try {
        const parsed = JSON.parse(actionMatch[1].trim())
        if (parsed?.action === "editar_projeto" && project) {
          const patch = Object.fromEntries(["titulo", "descricao", "roteiro"].filter(key => typeof parsed[key] === "string").map(key => [key, parsed[key]]))
          const htmlFile = parsed.html === true && !project.htmlLimit && output.files.find(file => /\.html$/i.test(file.name))
          if (htmlFile) patch.html = htmlFile.content
          if (Object.keys(patch).length) panelAction = { action: "editar_projeto", id: project.id, title: project.titulo, revision: project.revision, patch }
        } else if (parsed?.action === "criar_roteiro") {
          const savedDraft = await saveRoteiro({
            status: "rascunho",
            pauta: parsed.pauta || "Roteiro sugerido pelo Chat IA",
            duracao: 45,
            model: ai.model,
            roteiro: {
              titulo: parsed.pauta || "Roteiro sugerido",
              promessa: parsed.promessa || "",
              contexto: parsed.contexto || "",
              entrega: parsed.entrega || "",
              roteiro: parsed.roteiro || "",
            },
          })
          panelAction = { ...parsed, roteiroId: savedDraft.id, savedDraft }
        } else if (parsed?.action === "atualizar_roteiro" && parsed.id) {
          const updated = await updateAcervoItem("roteiros", parsed.id, {
            pauta: parsed.pauta,
            roteiro: {
              titulo: parsed.pauta || "Roteiro atualizado",
              promessa: parsed.promessa || "",
              contexto: parsed.contexto || "",
              entrega: parsed.entrega || "",
              roteiro: parsed.roteiro || "",
            },
          })
          panelAction = { ...parsed, updated }
        } else if (parsed?.action === "agendar_acao") {
          const ag = await addAgendaItem({
            titulo: parsed.titulo || "Ação agendada pela IA",
            tipo: parsed.tipo || "postar",
            quando: parsed.quando || "",
            detalhes: parsed.detalhes || "",
            origem: "chat-ia",
          })
          panelAction = { ...parsed, agendaItem: ag.item }
        } else if (parsed?.action === "monitorar_concorrente" && parsed.canal) {
          const ch = await resolveChannelInput(parsed.canal)
          const list = await readConcorrentes()
          if (!list.some((c) => c.id === ch.id)) {
            list.push(ch)
            await writeConcorrentes(list)
          }
          panelAction = { ...parsed, added: ch }
        } else if (["buscar", "analisar_video", "criar_pauta"].includes(parsed?.action)) {
          panelAction = parsed
        }
      } catch {}
    }

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
      attachments,
      createdAt: new Date().toISOString(),
    }
    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: cleanText,
      files: output.files,
      model: ai.model,
      panelAction,
      createdAt: new Date().toISOString(),
    }
    const { thread, chats } = await appendChatTurn({ chatId, userMsg, assistantMsg })
    res.json({ thread, chats, userMsg, assistantMsg })
  }),
)

panelRoutes.patch(
  "/chat/:id",
  route(async (req, res) => {
    const chats = await updateChatThread(req.params.id, {
      title: req.body?.title,
      archived: req.body?.archived,
    })
    if (!chats) return res.status(404).json({ error: "Conversa não encontrada." })
    res.json({ chats })
  }),
)

panelRoutes.delete(
  "/chat/:id",
  route(async (req, res) => {
    const chats = await deleteChatThread(req.params.id)
    res.json({ chats })
  }),
)
