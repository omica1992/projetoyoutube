import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import express from "express"
import multer from "multer"
import { spawn } from "node:child_process"
import ffmpegPath from "ffmpeg-static"

if (!process.env.VERCEL) {
  try { process.loadEnvFile(new URL("../.env", import.meta.url)) } catch {}
}

import { DATA_DIR, PUBLIC_DIR, MODELS, FPS, WIDTH, HEIGHT } from "./config.js"
import { ask, parseJsonLoose } from "./opencode.js"
import { buildTrendBrief } from "./trends.js"
import { getYouTubeKey, saveYouTubeKey, searchYouTube, verifyYouTubeKey, YouTubeApiError } from "./youtube.js"
import { panelRoutes } from "./panel-routes.js"
import { promptRoteiro } from "./prompts.js"
import { transcribeAudio } from "./transcribe.js"
import { audioDuration, buildChunks, buildTimeline } from "./timeline.js"
import { planejarDirecao } from "./direcao.js"
import { gerarHtmlComIa, writeEngineHtml, parseRoteiro } from "./htmlgen.js"
import { captureFrames, encodeMp4, findChrome } from "./render.js"

const app = express()
const PORT = Number(process.env.PORT ?? 5173)
const UPLOAD_DIR = process.env.VERCEL ? "/tmp/studio-uploads" : path.join(DATA_DIR, "_uploads")

if (!process.env.VERCEL) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

app.use(express.json({ limit: "8mb" }))
app.use(express.static(PUBLIC_DIR))
app.use("/p", express.static(DATA_DIR))
app.use("/api/painel", panelRoutes)

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 60 * 1024 * 1024 },
})

/* ---------------------------------- jobs ---------------------------------- */

const jobs = new Map()

function createJob(kind) {
  const id = crypto.randomBytes(5).toString("hex")
  const job = { id, kind, status: "queued", pct: 0, step: "na fila", log: [], criadoEm: Date.now() }
  jobs.set(id, job)
  return job
}

function log(job, msg) {
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`
  job.log.push(line)
  if (job.log.length > 400) job.log.shift()
  console.log(line)
}

function startJob(job, fn) {
  job.status = "running"
  ;(async () => {
    try {
      const result = await fn({
        log: (m) => log(job, m),
        progress: (pct, step) => {
          job.pct = Math.max(0, Math.min(100, Math.round(pct)))
          if (step) job.step = step
        },
      })
      job.status = "done"
      job.pct = 100
      job.step = "concluído"
      job.result = result
    } catch (e) {
      job.status = "error"
      job.step = "erro"
      job.error = e?.message ?? String(e)
      log(job, `ERRO: ${job.error}`)
    }
  })()
  return job
}

/* -------------------------------- projects -------------------------------- */

const projects = new Map()

function projectDir(id) {
  return path.join(DATA_DIR, id)
}

function saveProject(p) {
  fs.writeFileSync(path.join(projectDir(p.id), "projeto.json"), JSON.stringify(p, null, 2), "utf8")
}

function loadProjects() {
  if (!fs.existsSync(DATA_DIR)) return
  for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue
    const file = path.join(DATA_DIR, entry.name, "projeto.json")
    if (!fs.existsSync(file)) continue
    try {
      projects.set(entry.name, JSON.parse(fs.readFileSync(file, "utf8")))
    } catch {}
  }
}

function publicProject(p) {
  if (!p) return null
  const base = `/p/${p.id}`
  return {
    ...p,
    urls: {
      audio: p.audio ? `${base}/${p.audio}` : null,
      html: p.htmlFonte ? `${base}/video.html` : null,
      mp4: p.mp4 ? `${base}/${p.mp4}` : null,
    },
    videoHtmlUrl: p.htmlFonte ? `${base}/video.html` : null,
  }
}

loadProjects()

function getProject(id) {
  const p = projects.get(id)
  if (!p) throw Object.assign(new Error("Projeto não encontrado"), { status: 404 })
  return p
}

function slugify(s) {
  return String(s || "short")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

/* --------------------------------- helpers -------------------------------- */

function toMp3(input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "2", "-ar", "44100", "-b:a", "192k", output],
      { windowsHide: true },
    )
    let err = ""
    child.stderr.on("data", (d) => (err += d))
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(err.slice(-800)))))
  })
}

/* ---------------------------------- rotas --------------------------------- */

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    chrome: (() => {
      try {
        return findChrome()
      } catch (e) {
        return e.message
      }
    })(),
    ffmpeg: ffmpegPath,
    modelos: MODELS,
    video: { width: WIDTH, height: HEIGHT, fps: FPS },
  })
})

app.get("/api/modelos", (_req, res) => {
  res.json({
    audio: ["gemini-4-argon", "gemini-4-argon-contributor", "mimo-v2.6-pro", "mimo-v2.6-flash", "mimo-v2.5", "muse-spark-1.3-contributor"],
    ativos: MODELS,
    obs: "A transcrição do áudio roda localmente com Whisper (faster-whisper), com timestamp por palavra. As IAs do OpenCode Go cuidam de roteiro, direção e HTML.",
  })
})

app.use("/api/youtube", (req, res, next) => {
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
  const host = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.get("host") || "")
  const origin = req.get("origin")
  const sameOrigin = origin === `${req.protocol}://${req.get("host")}`
  if (!loopback || !host || (origin && !sameOrigin) || req.get("sec-fetch-site") === "cross-site" ||
      (req.method === "POST" && (!sameOrigin || !req.is("application/json")))) {
    return res.status(403).json({ error: "Abra o Studio pelo endereço local para usar a integração do YouTube." })
  }
  res.set("Cache-Control", "no-store")
  next()
})

app.get("/api/youtube/conexao", (_req, res) => {
  try {
    res.json({ configured: Boolean(getYouTubeKey()) })
  } catch {
    res.status(500).json({ error: "O Studio não conseguiu ler a configuração local do YouTube." })
  }
})

app.post("/api/youtube/conexao", async (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key.trim() : ""
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(key)) {
    return res.status(400).json({ error: "Digite uma chave de API do Google válida." })
  }
  try {
    await verifyYouTubeKey(key)
    await saveYouTubeKey(key)
    res.json({ configured: true })
  } catch (error) {
    if (error instanceof YouTubeApiError) return res.status(502).json({ error: error.message })
    res.status(500).json({ error: "A chave foi aceita pelo Google, mas o Studio não conseguiu salvá-la na pasta local." })
  }
})

app.get("/api/youtube/pesquisa", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : ""
  const type = req.query.type === "channel" ? "channel" : "video"
  const days = Number(req.query.days || 30)
  const order = ["relevance", "date", "viewCount"].includes(req.query.order) ? req.query.order : "relevance"
  if (!query || query.length > 160 || ![7, 30, 90].includes(days)) {
    return res.status(400).json({ error: "Informe um termo de até 160 caracteres e um período válido." })
  }
  try {
    const results = await searchYouTube({ query, type, days, order })
    res.json({ configured: results !== null, results: results ?? [] })
  } catch (error) {
    const message = error instanceof YouTubeApiError ? error.message : "O Studio não conseguiu concluir a busca do YouTube."
    res.status(502).json({ error: message })
  }
})

// 1) roteiro com tendências
app.post("/api/roteiro", (req, res) => {
  const { nicho, tom, duracao, extra, keywords, geo, canal, modeloHtml, pauta } = req.body ?? {}
  if (!nicho) return res.status(400).json({ error: "Informe o nicho" })
  const job = createJob("roteiro")
  res.status(202).json({ jobId: job.id })

  startJob(job, async ({ log, progress }) => {
    progress(5, "coletando tendências")
    const termos = typeof pauta === "string" && pauta.trim() ? [pauta.trim().slice(0, 160), ...(keywords || [])] : keywords || []
    const brief = await buildTrendBrief({ nicho, geo: geo || "BR", keywords: termos })
    log(`Tendências: ${brief.buscasDoDia.length} buscas, ${brief.sugestoesYouTube.length} sugestões, ${brief.noticias.length} notícias`)

    progress(35, "escrevendo roteiro")
    const raw = await ask({
      model: MODELS.roteiro,
      text: promptRoteiro({ nicho, tom, duracao, brief, extra, pauta }),
      timeoutMs: 300_000,
      onTick: (t) => log(`Roteirista: ${t.length} caracteres`),
    })
    const roteiro = parseRoteiro(raw)
    progress(90, "salvando projeto")

    const id = crypto.randomBytes(4).toString("hex")
    const id_slug = `${slugify(roteiro.titulo || nicho)}-${id}`
    fs.mkdirSync(projectDir(id_slug), { recursive: true })

    const project = {
      id: id_slug,
      titulo: roteiro.titulo,
      canal: canal || "",
      modeloHtml: modeloHtml || MODELS.html,
      nicho,
      tom: tom || "",
      pauta: typeof pauta === "string" ? pauta.trim().slice(0, 160) : "",
      geo: brief.geo,
      criadoEm: new Date().toISOString(),
      roteiro,
      brief,
      etapas: { roteiro: true, audio: false, html: false, mp4: false },
    }
    projects.set(project.id, project)
    saveProject(project)
    progress(100, "pronto")
    return { project: publicProject(project) }
  })
})

// 2) upload de áudio -> transcrição -> direção -> HTML
app.post("/api/projetos/:id/audio", upload.single("audio"), (req, res) => {
  let project
  try {
    project = getProject(req.params.id)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.message })
  }
  if (!req.file) return res.status(400).json({ error: "Envie o arquivo no campo 'audio'" })

  const job = createJob("audio")
  res.status(202).json({ jobId: job.id })

  const tmp = req.file.path.replace(/\\/g, "/")
  const ext = path.extname(req.file.originalname || ".mp3").toLowerCase() || ".mp3"

  startJob(job, async ({ log, progress }) => {
    const dir = projectDir(project.id)
    fs.mkdirSync(dir, { recursive: true })
    log(`Áudio recebido: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`)

    progress(5, "convertendo áudio")
    const audioName = "audio.mp3"
    const audioPath = path.join(dir, audioName)
    try {
      await toMp3(req.file.path, audioPath)
    } catch (e) {
      log(`Conversão falhou (${e.message}); usando arquivo original`)
      fs.copyFileSync(req.file.path, path.join(dir, `audio${ext}`))
    }
    fs.rmSync(req.file.path, { force: true })
    const finalAudio = fs.existsSync(audioPath) ? audioName : `audio${ext}`
    const finalPath = path.join(dir, finalAudio)

    progress(12, "transcrevendo (Whisper local)")
    const whisper = await transcribeAudio(finalPath)
    log(`Whisper: ${whisper.segments.length} segmentos, ${whisper.duration.toFixed(1)}s, idioma ${whisper.language}`)

    progress(45, "sincronizando legendas")
    const chunks = buildChunks(whisper)
    log(`${chunks.length} blocos de legenda sincronizados`)

    const audioSecs = (await audioDuration(finalPath)) || whisper.duration
    const duration = Math.max(audioSecs, chunks.at(-1)?.end ?? 0)

    progress(55, "direção de cena")
    const direcao = await planejarDirecao({
      chunks,
      estilo: project.roteiro?.temas_visuais || project.tom,
      tema: project.titulo,
      log,
    })
    log(`Direção: ${direcao.cenas.length} cenas`)

    const timeline = buildTimeline({ chunks, direcao, duration, titulo: project.titulo, canal: project.canal })

    progress(70, "gerando HTML")
    const { htmlPath, fonte } = await gerarHtmlComIa({
      dir,
      chunks,
      direcao,
      timeline,
      audioName: finalAudio,
      titulo: project.titulo,
      modelo: project.modeloHtml,
      log,
    })
    if (fonte === "motor") writeEngineHtml({ dir, timeline, audioName: finalAudio, titulo: project.titulo })

    project.audio = finalAudio
    project.duration = duration
    project.whisper = whisper
    project.chunks = chunks
    project.direcao = direcao
    project.timeline = timeline
    project.htmlFonte = fonte
    project.htmlModelo = fonte === "motor" ? "motor" : MODELS.html
    project.etapas = { ...project.etapas, audio: true, html: true }
    project.transcricao = whisper.text
    saveProject(project)

    progress(100, "pronto")
    return { project: publicProject(project), htmlPath, fonte }
  })
})

// regerar HTML (motor próprio ou IA)
app.post("/api/projetos/:id/html", (req, res) => {
  let project
  try {
    project = getProject(req.params.id)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.message })
  }
  if (!project.timeline) return res.status(400).json({ error: "Envie o áudio primeiro" })
  const modo = req.body?.modo ?? "ia"
  const job = createJob("html")
  res.status(202).json({ jobId: job.id })

  startJob(job, async ({ log, progress }) => {
    const dir = projectDir(project.id)
    const audioName = project.audio
    progress(10, modo === "ia" ? "gerando com IA" : "gerando com motor")
    let fonte = modo
    if (modo === "ia") {
      const r = await gerarHtmlComIa({
        dir,
        chunks: project.chunks,
        direcao: project.direcao,
        timeline: project.timeline,
        audioName,
        titulo: project.titulo,
        modelo: project.modeloHtml,
        log,
      })
      fonte = r.fonte
      project.htmlModelo = r.modelo ?? MODELS.html
    } else {
      writeEngineHtml({ dir, timeline: project.timeline, audioName, titulo: project.titulo })
      fonte = "motor"
      project.htmlModelo = "motor"
    }
    project.htmlFonte = fonte
    project.etapas = { ...project.etapas, html: true }
    saveProject(project)
    progress(100, "pronto")
    return { project: publicProject(project), fonte }
  })
})

// 3) render MP4
app.post("/api/projetos/:id/render", (req, res) => {
  let project
  try {
    project = getProject(req.params.id)
  } catch (e) {
    return res.status(e.status ?? 500).json({ error: e.message })
  }
  if (!project.audio || !project.timeline) return res.status(400).json({ error: "Envie o áudio primeiro" })
  if (!project.htmlFonte) return res.status(400).json({ error: "Gere o HTML primeiro" })

  const job = createJob("render")
  res.status(202).json({ jobId: job.id })

  startJob(job, async ({ log, progress }) => {
    const dir = projectDir(project.id)
    const htmlPath = path.join(dir, "video.html")
    const framesDir = path.join(dir, "frames")
    const outFile = path.join(dir, "video.mp4")
    const duration = project.timeline.duration

    log(`Renderizando ${duration.toFixed(1)}s a ${FPS}fps (${Math.ceil(duration * FPS)} quadros)`)
    progress(2, "capturando quadros")

    const { frames, errors } = await captureFrames({
      htmlPath,
      framesDir,
      duration,
      onProgress: ({ frame, frames: total, pct, eta }) =>
        progress(2 + pct * 78, `quadro ${frame}/${total} · ~${eta}s restantes`),
    })
    if (errors?.length) log(`Avisos do HTML: ${errors.slice(0, 3).join(" | ")}`)
    log(`${frames} quadros capturados`)

    progress(82, "codificando MP4")
    await encodeMp4({ framesDir, audioPath: path.join(dir, project.audio), outFile, onLine: () => {} })
    log("MP4 finalizado")
    if (process.env.STUDIO_KEEP_FRAMES !== "1") {
      fs.rmSync(framesDir, { recursive: true, force: true })
      log("Quadros temporários removidos")
    }

    // cópia para a pasta "3d" que você já usa
    try {
      const destino = path.join(DATA_DIR, "..", "..", "3d")
      fs.mkdirSync(destino, { recursive: true })
      fs.copyFileSync(outFile, path.join(destino, `${slugify(project.titulo)}.mp4`))
      log(`Cópia salva em ${path.resolve(destino)}`)
    } catch (e) {
      log(`Não copiei para /3d: ${e.message}`)
    }

    project.mp4 = "video.mp4"
    project.etapas = { ...project.etapas, mp4: true }
    saveProject(project)
    progress(100, "pronto")
    return { project: publicProject(project), mp4: `/p/${project.id}/video.mp4` }
  })
})

app.get("/api/projetos", (_req, res) => {
  res.json([...projects.values()].map(publicProject))
})

app.get("/api/projetos/:id", (req, res) => {
  try {
    res.json(publicProject(getProject(req.params.id)))
  } catch (e) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: "Job não encontrado" })
  res.json(job)
})

export default app

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Studio Shorts rodando em http://localhost:${PORT}\n`)
    console.log(`  Modelos: roteiro=${MODELS.roteiro}  direção=${MODELS.direcao}  html=${MODELS.html}`)
    console.log(`  ffmpeg: ${ffmpegPath}`)
  })
}
