import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import express from "express"
import { DATA_DIR } from "./config.js"
import { hasSupabase, kvGet, kvSet } from "./db.js"
import { askFallback, parseJsonLoose } from "./opencode.js"
import { askStudioGo, goKey, goModels, validGoModel } from "./studio-go.js"
import { ARLO, ELEVEN_VOICES, elevenVoices, generateElevenNarration, generateNarration, googleVoices, providerKey, VOICE_CATALOG } from "./panel-providers.js"
import { audioDuration } from "./timeline.js"

const LOCAL_FILE = path.join(DATA_DIR, "_cartoon_projects.json")
const AUDIO_DIR = path.join(DATA_DIR, "_cartoon_audio")

function readLocalAll() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"))
  } catch {
    return {}
  }
}

function writeLocalAll(map) {
  if (process.env.VERCEL) return
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(map, null, 2), "utf8")
}

async function listProjects() {
  if (hasSupabase()) {
    try {
      const rows = await kvGet("cartoon:index")
      if (Array.isArray(rows)) return rows
    } catch {}
  }
  const map = readLocalAll()
  return Object.values(map)
    .map(({ id, titulo, formato, duracao, estilo, criadoEm, atualizadoEm }) => ({ id, titulo, formato, duracao, estilo, criadoEm, atualizadoEm }))
    .sort((a, b) => Date.parse(b.atualizadoEm || b.criadoEm || 0) - Date.parse(a.atualizadoEm || a.criadoEm || 0))
}

async function getProject(id) {
  if (hasSupabase()) {
    try {
      const row = await kvGet(`cartoon:proj:${id}`)
      if (row) return row
    } catch {}
  }
  return readLocalAll()[id] || null
}

async function saveProject(proj) {
  const now = new Date().toISOString()
  const item = { ...proj, atualizadoEm: now, criadoEm: proj.criadoEm || now }
  if (hasSupabase()) {
    await kvSet(`cartoon:proj:${item.id}`, item)
    const index = await listProjects()
    const summary = {
      id: item.id, titulo: item.titulo, formato: item.formato, duracao: item.duracao,
      estilo: item.estilo, criadoEm: item.criadoEm, atualizadoEm: item.atualizadoEm,
    }
    const nextIndex = [summary, ...index.filter((x) => x.id !== item.id)].slice(0, 80)
    await kvSet("cartoon:index", nextIndex)
  }
  if (!process.env.VERCEL) {
    const map = readLocalAll()
    map[item.id] = item
    writeLocalAll(map)
  }
  return item
}

async function deleteProject(id) {
  if (hasSupabase()) {
    const index = await listProjects()
    await kvSet("cartoon:index", index.filter((x) => x.id !== id))
    await kvSet(`cartoon:proj:${id}`, null)
  }
  if (!process.env.VERCEL) {
    const map = readLocalAll()
    delete map[id]
    writeLocalAll(map)
  }
}

async function askAi({ model, text }) {
  if (validGoModel(model) && await goKey()) {
    return askStudioGo({ model, text })
  }
  const out = await askFallback({ models: [model || "opencode-go/deepseek-v4.1-flash"], text, timeoutMs: 90_000 })
  return out.text
}

function alignWordsFromDuration(frases, totalDuration) {
  const cleanText = frases.join(" ").replace(/\[[^\]]{1,32}\]\s*/g, " ").trim()
  const tokens = cleanText.split(/\s+/).filter(Boolean)
  if (!tokens.length || !(totalDuration > 0)) return []
  const weights = tokens.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.!?…]$/.test(w) ? 3 : /[,;:]$/.test(w) ? 1.5 : 0))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let cursor = 0.08
  const usable = Math.max(0.5, totalDuration - 0.16)
  return tokens.map((palavra, i) => {
    const span = (weights[i] / totalWeight) * usable
    const inicio = Math.round(cursor * 1000) / 1000
    cursor += span
    const fim = Math.round(cursor * 1000) / 1000
    return { palavra, inicio, fim }
  })
}

export function cartoonRoutes() {
  const router = express.Router()
  const route = (fn) => async (req, res) => {
    try { await fn(req, res) }
    catch (e) { res.status(e.status || 500).json({ error: e.message || "Erro interno" }) }
  }

  router.get("/config", route(async (_req, res) => {
    const [gemini, elevenlabs, go, models] = await Promise.all([
      providerKey("gemini"),
      providerKey("elevenlabs"),
      goKey(),
      goModels(),
    ])
    res.json({
      gemini: Boolean(gemini),
      elevenlabs: Boolean(elevenlabs),
      go: Boolean(go),
      supabase: hasSupabase(),
      vercel: Boolean(process.env.VERCEL),
      models: Object.keys(models).sort(),
      modelCatalog: models,
      googleVoices: [ARLO, ...VOICE_CATALOG],
      elevenVoices: ELEVEN_VOICES,
      sounds: ["clique.wav", "ding.wav", "impacto.wav", "pop.wav", "subida.wav", "surpresa.wav", "trilha_curiosa.wav", "whoosh.wav"],
    })
  }))

  router.get("/vozes", route(async (req, res) => {
    if (req.query.provider === "elevenlabs") {
      return res.json(await elevenVoices(await providerKey("elevenlabs")))
    }
    const key = await providerKey("gemini")
    if (!key) return res.json([ARLO, ...VOICE_CATALOG])
    try {
      res.json(await googleVoices(key))
    } catch {
      res.json([ARLO, ...VOICE_CATALOG])
    }
  }))

  router.get("/projetos", route(async (_req, res) => {
    res.json({ projects: await listProjects() })
  }))

  router.get("/projetos/:id", route(async (req, res) => {
    const proj = await getProject(req.params.id)
    if (!proj) return res.status(404).json({ error: "Projeto não encontrado." })
    res.json({ project: proj })
  }))

  router.post("/projetos", route(async (req, res) => {
    const body = req.body || {}
    const id = body.id || `crt-${randomUUID().slice(0, 8)}`
    const saved = await saveProject({ ...body, id })
    res.json({ project: saved })
  }))

  router.delete("/projetos/:id", route(async (req, res) => {
    await deleteProject(req.params.id)
    res.json({ ok: true })
  }))

  router.post("/ideias", route(async (req, res) => {
    const tema = String(req.body?.tema || "curiosidades e histórias incríveis").trim().slice(0, 300)
    const formato = String(req.body?.formato || "automático").trim()
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    const raw = await askAi({
      model,
      text: `Crie 10 ideias originais de vídeos animados curtos (Shorts/Reels) em português do Brasil sobre: ${JSON.stringify(tema)}.
Formato preferido: ${formato}.
Cada ideia precisa ter gancho forte, conflito/curiosidade visual e virada.
Retorne SOMENTE JSON válido: {"ideias":[{"titulo":"...","premissa":"frase curta para o pedido","formato":"História com virada|Curiosidade curta|E se...?|Você dentro da situação"}]}.`,
    })
    const parsed = parseJsonLoose(raw)
    if (!Array.isArray(parsed?.ideias) || !parsed.ideias.length) {
      throw new Error("O modelo não retornou ideias válidas.")
    }
    res.json({ ideias: parsed.ideias.slice(0, 10) })
  }))

  router.post("/roteiro", route(async (req, res) => {
    const ideia = String(req.body?.ideia || "").trim().slice(0, 2000)
    if (!ideia) return res.status(400).json({ error: "Descreva a ideia do vídeo." })
    const formato = String(req.body?.formato || "automático").trim()
    const duracao = Math.max(15, Math.min(120, Number(req.body?.duracao) || 45))
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    const targetWords = Math.round(duracao * 2.6)
    const tagInstr = ttsProvider === "elevenlabs"
      ? `Inclua tags expressivas da ElevenLabs v3 inline onde fizer sentido emocional (ex.: [curious], [excited], [whispers], [sighs], [gasp], [pauses]).`
      : `Escreva apenas texto falado limpo, SEM rubricas, SEM "Visual:" e SEM tags entre colchetes.`

    const raw = await askAi({
      model,
      text: `Você é roteirista de animações cartoon 3D virais (estilo YouTube Shorts / TikTok).
Ideia: ${JSON.stringify(ideia)}
Formato narrativo: ${formato}
Duração alvo: ${duracao} segundos (~${targetWords} palavras no total).
${tagInstr}
Divida o roteiro em frases curtas (de 8 a 18 frases, cada frase vira uma cena).
Comece com um gancho impossível ou pergunta forte nos 2 primeiros segundos, tenha escalada e virada.
Retorne SOMENTE JSON válido: {"titulo":"Título curto e forte","frases":["frase 1","frase 2",...],"cenarioPrincipal":"vila|floresta|cidade|espaco|praia|sala"}.`,
    })
    const parsed = parseJsonLoose(raw)
    const frases = Array.isArray(parsed?.frases) ? parsed.frases.map((f) => String(f).trim()).filter(Boolean) : []
    if (!frases.length) throw new Error("O modelo não retornou frases de roteiro.")
    res.json({
      titulo: String(parsed?.titulo || ideia).slice(0, 100),
      frases,
      cenarioPrincipal: parsed?.cenarioPrincipal || "vila",
    })
  }))

  router.post("/storyboard", route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Novo vídeo").trim()
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    const cenarioPrincipal = String(req.body?.cenarioPrincipal || "vila")
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    if (!frases.length) return res.status(400).json({ error: "Envie as frases do roteiro." })

    const raw = await askAi({
      model,
      text: `Você é diretor de storyboard cartoon 3D. Para CADA uma das ${frases.length} frases abaixo, defina a cena visual exata.
Título: ${JSON.stringify(titulo)} | Cenário base: ${cenarioPrincipal}
Frases:
${frases.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Opções válidas para cada campo:
- cenario: "vila" | "praia" | "floresta" | "cidade" | "espaco" | "sala"
- atividade: "nenhuma" | "comer" | "pescar" | "correr" | "observar" | "trabalhar" | "voar"
- plano: "aberto" | "medio" | "close"
- foco: "silas" | "pedro" | "maria" | "joao" | "farol" | "dinossauro" | "foguete"
- acao: "parado" | "mostrar" | "andar" | "correr" | "debochar" | "acenar" | "assustado" | "cintura" | "barriga" | "pensando" | "bochecha" | "cruzado" | "joinha" | "comemorar"
- expressao: "(da ação)" | "neutro" | "feliz" | "alivio" | "desconfiado" | "teimoso" | "nervoso" | "surpreso" | "assustado" | "rindo"
- efeito: "nenhum" | "tremor" | "zoom" | "flash" | "suor"
- luz: "dia" | "dourado" | "noite" | "espaco"
- camera: "automatico" | "fixa" | "aproximar" | "afastar" | "pan"
- eventoCenario: "nenhum" | "onda" | "raio" | "fumaca" | "estrelas"
- quemAparece: array com 1 a 4 de ["silas", "pedro", "maria", "joao"]

Retorne SOMENTE JSON válido: {"cenas":[{"fraseIndex":0,"cenario":"praia","atividade":"pescar","plano":"medio","foco":"silas","acao":"parado","expressao":"(da ação)","efeito":"nenhum","luz":"dia","camera":"automatico","textoTela":"","quemAparece":["silas"],"eventoCenario":"nenhum","virada":false}]}.`,
    })
    const parsed = parseJsonLoose(raw)
    const rawCenas = Array.isArray(parsed?.cenas) ? parsed.cenas : []
    const cenas = frases.map((texto, i) => {
      const c = rawCenas[i] || {}
      return {
        id: `cena-${i + 1}`,
        fraseIndex: i,
        texto,
        cenario: c.cenario || cenarioPrincipal || "praia",
        atividade: c.atividade || "nenhuma",
        plano: c.plano || (i % 3 === 1 ? "close" : i % 3 === 2 ? "aberto" : "medio"),
        foco: c.foco || "silas",
        acao: c.acao || "parado",
        expressao: c.expressao || "(da ação)",
        efeito: c.efeito || "nenhum",
        luz: c.luz || "dia",
        camera: c.camera || "automatico",
        textoTela: typeof c.textoTela === "string" ? c.textoTela.slice(0, 40) : "",
        quemAparece: Array.isArray(c.quemAparece) && c.quemAparece.length ? c.quemAparece : ["silas"],
        eventoCenario: c.eventoCenario || "nenhum",
        virada: Boolean(c.virada),
      }
    })
    res.json({ cenas })
  }))

  router.post("/youtube-pack", route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Cartoon Short").trim()
    const ideia = String(req.body?.ideia || titulo).trim()
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    const duration = Math.max(10, Number(req.body?.duration) || 45)
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    if (!frases.length) return res.status(400).json({ error: "Envie o roteiro do vídeo." })

    const slice = duration / frases.length
    const timeline = frases.map((f, i) => `${(i * slice).toFixed(1)}s-${((i + 1) * slice).toFixed(1)}s: ${f}`).join("\n")

    const raw = await askAi({
      model,
      text: `Você é estrategista de YouTube Shorts (Playbook v2). Crie o pacote completo de publicação para este curta animado.
Título atual: ${JSON.stringify(titulo)} | Ideia: ${JSON.stringify(ideia)}
Cenas com timestamps:
${timeline}

Gere em JSON válido:
- tituloYt: título curto de alto CTR para YouTube Shorts (em português)
- tituloAlt: título alternativo curioso (em português)
- descricao: descrição curta atrativa + 5 hashtags (#shorts #animacao #curiosidades etc.)
- textoCapa: exatamente 2 a 3 palavras impactantes em MAIÚSCULAS para a Thumbnail 9:16
- dublagem: roteiro completo de dublagem em INGLÊS sincronizado com os timestamps acima, + parágrafo corrido pronto para colar no ElevenLabs
- thumbnailPrompt: prompt detalhado em inglês para gerar capa 9:16 HD no estilo exato (flat 2D minimalist bean-head toon characters, thick black ink outlines, NO noses, simple expressive eyes, blocky cel-shaded 3D ink-outlined world, bright high-contrast colors, bold 2-3 word hook text at top center)

Retorne SOMENTE JSON válido: {"tituloYt":"...","tituloAlt":"...","descricao":"...","textoCapa":"...","dublagem":{"timestamps":"...","elevenlabs":"..."},"thumbnailPrompt":"..."}.`,
    })
    const parsed = parseJsonLoose(raw) || {}
    res.json({
      tituloYt: parsed.tituloYt || titulo,
      tituloAlt: parsed.tituloAlt || `${titulo} (Você não esperava isso!)`,
      descricao: parsed.descricao || `${ideia}\n\n#shorts #animacao #historia #curiosidades`,
      textoCapa: String(parsed.textoCapa || titulo.split(/\s+/).slice(0, 3).join(" ")).toUpperCase(),
      dublagem: {
        timestamps: parsed.dublagem?.timestamps || timeline,
        elevenlabs: parsed.dublagem?.elevenlabs || frases.join(" "),
      },
      thumbnailPrompt: parsed.thumbnailPrompt || `9:16 vertical YouTube Shorts thumbnail, flat 2D minimalist bean-head cartoon character with smooth round head, NO nose, thin black stick arms, thick ink outline, inside colorful cel-shaded 3D outlined world, dramatic lighting, bold uppercase text "${String(titulo).slice(0, 22)}" at top center.`,
    })
  }))

  router.post("/voz", route(async (req, res) => {
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    if (!frases.length) return res.status(400).json({ error: "O roteiro está vazio." })
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    const voice = String(req.body?.voice || (ttsProvider === "elevenlabs" ? ELEVEN_VOICES[0].id : "Kore")).trim()
    const fullText = frases.join(" ")

    const wavBuffer = ttsProvider === "elevenlabs"
      ? await generateElevenNarration({ key: await providerKey("elevenlabs"), text: fullText, voice })
      : await generateNarration({ key: await providerKey("gemini"), text: fullText.replace(/\[[^\]]{1,32}\]\s*/g, ""), voice })

    let audioUrl = ""
    let duration = 0
    if (!process.env.VERCEL) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true })
      const fileName = `voz-${randomUUID().slice(0, 10)}.wav`
      const outPath = path.join(AUDIO_DIR, fileName)
      fs.writeFileSync(outPath, wavBuffer)
      duration = await audioDuration(outPath).catch(() => 0)
      audioUrl = `/p/_cartoon_audio/${fileName}`
    }
    if (!(duration > 0)) {
      // Fallback WAV header duration (24kHz 16-bit mono = 48000 bytes/s)
      duration = Math.max(1, Math.round(((wavBuffer.length - 44) / 48000) * 100) / 100)
    }
    const palavras = alignWordsFromDuration(frases, duration)
    const audioBase64 = `data:audio/wav;base64,${wavBuffer.toString("base64")}`
    res.json({ audioUrl, audioBase64, duration, palavras, ttsProvider, voice })
  }))

  return router
}
