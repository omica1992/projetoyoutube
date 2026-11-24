import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import express from "express"
import multer from "multer"
import { DATA_DIR, MODELS } from "./config.js"
import { askFallback, parseJsonLoose } from "./opencode.js"
import { generateNarration, providerKey, storeProviderKey, verifyGemini, CHANNEL_ID, VOICE_CATALOG } from "./panel-providers.js"
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

function readHistory() {
  if (process.env.VERCEL) return []
  try {
    if (!fs.existsSync(HISTORY_FILE)) return []
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function appendHistory(snapshot) {
  const list = readHistory()
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
  if (!process.env.VERCEL) {
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
    })
  }),
)

panelRoutes.post(
  "/conexoes/:provider",
  route(async (req, res) => {
    const { provider } = req.params
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : ""
    if (!["youtube", "gemini"].includes(provider) || key.length < 16 || key.length > 400) {
      return res.status(400).json({ error: "Confira se a chave foi copiada por inteiro." })
    }
    if (provider === "youtube") {
      await verifyYouTubeKey(key)
      await saveYouTubeKey(key)
    } else {
      await verifyGemini(key)
      await storeProviderKey(provider, key)
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

panelRoutes.get(
  "/canal",
  route(async (req, res) => {
    const channel = await getChannelPublicOverview(HANDLE, CHANNEL_ID)
    const history = appendHistory(channel)
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

    const acervo = await readAcervo()
    const chatId = typeof req.body?.chatId === "string" && req.body.chatId ? req.body.chatId : undefined
    const existingThread = chatId ? acervo.chats.find((c) => c.id === chatId) : null
    const recentChat = (existingThread?.messages || []).slice(-8).map((m) => `${m.role === "user" ? "Criador" : "Direcionador"}: ${m.text}`).join("\n")
    const lastSearches = acervo.buscas.slice(0, 3).map((b) => `- "${b.objetivo}" (${b.results?.length ?? 0} resultados)`).join("\n")
    const lastAnalyses = acervo.analises.slice(0, 3).map((a) => `- ${a.video?.title || a.video?.id}: Promessa="${a.analise?.promessa || ""}"`).join("\n")

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
${videoCtx}
${lastSearches ? `\nBuscas recentes no acervo:\n${lastSearches}` : ""}
${lastAnalyses ? `\nAnálises recentes no acervo:\n${lastAnalyses}` : ""}
${recentChat ? `\nHistórico desta conversa:\n${recentChat}` : ""}
${contextParts.length ? `\nAnexos enviados agora:\n${contextParts.join("\n\n")}` : ""}

Mensagem do criador:
"${message || "Analise os anexos enviados acima e diga como usar isso no FatoNexo."}"

INSTRUÇÕES IMPORTANTES:
1. Responda em português do Brasil, bem estruturado em Markdown (títulos curtos, listas, negrito).
2. Sempre que fizer sentido (ou quando o criador pedir para criar um roteiro, buscar canais/vídeos ou montar uma pauta), inclua no FINAL da resposta um bloco JSON opcional exatamente entre \`\`\`studio-action e \`\`\` para executar no painel:
   - Para salvar/sugerir um roteiro (que já entra como rascunho no painel):
     {"action":"criar_roteiro","pauta":"...","promessa":"...","contexto":"...","entrega":"...","roteiro":"texto corrido completo da narração"}
   - Para sugerir uma busca no YouTube:
     {"action":"buscar","query":"termo curto","searchType":"channel"}
   - Para sugerir analisar um vídeo específico (ID de 11 caracteres):
     {"action":"analisar_video","videoId":"XXXXXXXXXXX"}
   - Para sugerir uma pauta na fila de Estratégia:
     {"action":"criar_pauta","title":"...","promise":"...","context":"...","payoff":"..."}
   Use no máximo UM bloco studio-action por resposta. Não use tabelas Markdown largas; prefira listas.`

    const models = pickModels(req.body?.model)
    const ai = await askFallback({ models, text: prompt, timeoutMs: 75_000 })

    let cleanText = ai.text.trim()
    let panelAction = null
    const actionMatch = cleanText.match(/```studio-action\s*([\s\S]*?)```/i)
    if (actionMatch) {
      cleanText = cleanText.replace(actionMatch[0], "").trim()
      try {
        const parsed = JSON.parse(actionMatch[1].trim())
        if (parsed?.action === "criar_roteiro") {
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
