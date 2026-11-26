import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import express from "express"
import { notebook, updateNotebook, suggestIdeas, youtubeVideoId } from "./studio-planning.js"
import { ARLO, ELEVEN_VOICES, elevenVoices, generateElevenNarration, generateNarration, googleVoices, providerKey, VOICE_CATALOG } from "./panel-providers.js"
import { audioDuration } from "./timeline.js"
import { parseJsonLoose } from "./opencode.js"
import { askStudioGo, goKey, goModels, validGoModel } from "./studio-go.js"
import { kitAvailability, planKitVideo, renderKitVideo, repairKitVideo, reviseKitVideo, timeKitWords } from "./video-kit.js"
import { isStickStyle, planStick2dVideo, renderStick2dVideo, reviseStick2dVideo } from "./stick2d.js"
import { addStudioChannel, listStudioChannels, pendingStudioChannel, studioChannelToken } from "./studio-channels.js"
import { getOAuthStatus, getStudioChannel, uploadShortToYouTube } from "./youtube-oauth.js"

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status })
const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : ""
const projectChannel = (project, originalId) => project.channelId === undefined ? originalId : project.channelId

export function studioRequestOrigin(req) {
  const host = req.get("host") ?? ""
  if (process.env.VERCEL || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return null
  if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return `http://${host}`
  const configured = process.env.STUDIO_PUBLIC_ORIGIN
  const secret = process.env.STUDIO_PROXY_TOKEN
  const supplied = req.get("x-studio-proxy-token") ?? ""
  if (configured !== `https://${host}` || !secret || secret.length < 32) return null
  const first = Buffer.from(secret)
  const second = Buffer.from(supplied)
  return first.length === second.length && timingSafeEqual(first, second) ? configured : null
}

export function isLocalStudio(req, oauthCallback = false) {
  const origin = studioRequestOrigin(req)
  return Boolean(origin && (!req.get("origin") || req.get("origin") === origin) &&
    (oauthCallback || req.get("sec-fetch-site") !== "cross-site"))
}

export function createRoutes({ projects, projectDir, publicProject, createJob, startJob, slugify, studioContext = {} }) {
  const router = express.Router()
  const active = new Map()

  router.use((req, res, next) => {
    if (!isLocalStudio(req) || (req.method === "POST" && !req.is("application/json"))) {
      return res.status(403).json({ error: "Abra o estúdio em http://localhost:5173 para produzir e publicar." })
    }
    res.set("Cache-Control", "no-store")
    next()
  })

  const view = (project) => ({ ...publicProject(project), jobId: active.get(project.id) ?? null })

  function commit(project) {
    const dir = projectDir(project.id)
    fs.mkdirSync(dir, { recursive: true })
    const temp = path.join(dir, "projeto.json.tmp")
    fs.writeFileSync(temp, JSON.stringify(project, null, 2), "utf8")
    fs.renameSync(temp, path.join(dir, "projeto.json"))
    projects.set(project.id, project)
    return project
  }

  function get(id) {
    const project = projects.get(id)
    if (project?.studio !== "fora-do-nivel") throw badRequest("Projeto não encontrado.", 404)
    return project
  }

  function chatContext(id) {
    const project = get(id)
    const dir = projectDir(project.id)
    const latest = project.htmlDocuments?.at(-1)?.id
    const legacy = project.html || (project.htmlFonte ? "video.html" : "")
    const file = latest ? path.join(dir, ".chat-html", latest + ".html")
      : legacy && path.basename(legacy) === legacy ? path.join(dir, legacy) : ""
    const metadata = file && fs.existsSync(file) ? fs.lstatSync(file) : null
    const html = metadata?.isFile() && metadata.size <= 120000 ? fs.readFileSync(file, "utf8") : ""
    return {
      id, titulo: project.titulo, roteiro: project.roteiro?.roteiro || "", descricao: project.roteiro?.descricao || "",
      html, htmlLimit: Boolean(metadata && metadata.size > 120000),
      revision: createHash("sha256").update(JSON.stringify(project)).update(html).digest("hex"),
    }
  }

  studioContext.chatProject = chatContext

  router.get("/chat-projetos", route((_req, res) => {
    res.json([...projects.values()].filter(project => project.studio === "fora-do-nivel" && !project.publicacao)
      .map(({ id, titulo }) => ({ id, titulo })))
  }))

  router.post("/projetos/:id/editar-chat", route((req, res) => {
    const project = get(req.params.id)
    if (active.has(project.id) || project.publicacao) throw badRequest("Este projeto não pode ser alterado agora.", 409)
    if (req.body.revision !== chatContext(project.id).revision) throw badRequest("O projeto mudou. Peça uma nova proposta ao chat.", 409)
    const patch = req.body.patch
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length ||
      Object.keys(patch).some(key => !["titulo", "descricao", "roteiro", "html"].includes(key))) throw badRequest("Proposta inválida.")
    const next = { ...project, roteiro: { ...project.roteiro } }
    if (Object.hasOwn(patch, "titulo")) {
      next.titulo = text(patch.titulo, 100)
      if (!next.titulo) throw badRequest("O título precisa ser preenchido.")
    }
    if (Object.hasOwn(patch, "descricao")) next.roteiro.descricao = text(patch.descricao, 5000)
    if (Object.hasOwn(patch, "roteiro")) {
      next.roteiro.roteiro = text(patch.roteiro, 5000)
      if (project.audio && next.roteiro.roteiro !== project.roteiro?.roteiro) {
        throw badRequest("Este roteiro já tem narração. Abra o editor com a proposta e gere a nova narração.", 409)
      }
    }
    let documentPath
    if (Object.hasOwn(patch, "html")) {
      const source = patch.html
      if (typeof source !== "string" || Buffer.byteLength(source) > 120000 || !/<html(?:\s|>)[\s\S]*<\/html\s*>/i.test(source)) {
        throw badRequest("Envie um HTML completo de até 120 KB.")
      }
      const id = randomUUID()
      const dir = path.join(projectDir(project.id), ".chat-html")
      fs.mkdirSync(dir, { recursive: true })
      documentPath = path.join(dir, id + ".html")
      fs.writeFileSync(documentPath, source, { flag: "wx" })
      next.htmlDocuments = [...(project.htmlDocuments || []), { id, createdAt: new Date().toISOString() }]
    }
    try { commit(next) }
    catch (error) {
      if (documentPath) fs.rmSync(documentPath, { force: true })
      throw error
    }
    res.json({ project: view(next) })
  }))

  router.get("/projetos/:id/html/:version", route((req, res) => {
    const project = get(req.params.id)
    const version = project.htmlDocuments?.find(item => item.id === req.params.version)
    if (!version || !/^[a-f0-9-]{36}$/.test(version.id)) throw badRequest("Versão não encontrada.", 404)
    const file = path.join(projectDir(project.id), ".chat-html", version.id + ".html")
    if (!fs.existsSync(file)) throw badRequest("Arquivo não encontrado.", 404)
    res.set({ "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" })
      .attachment("projeto.html").type("application/octet-stream").send(fs.readFileSync(file))
  }))

  function route(fn) {
    return async (req, res) => {
      try { await fn(req, res) }
      catch (e) { res.status(e.status ?? 500).json({ error: e.message }) }
    }
  }

  function model(value) {
    if (!validGoModel(value)) throw badRequest("Escolha um modelo válido do OpenCode Go.")
    return value
  }

  const readJson = (project, file) => JSON.parse(fs.readFileSync(path.join(projectDir(project.id), file), "utf8"))

  function renderProgress(progress, from, to) {
    return (output) => {
      const frame = [...output.matchAll(/Quadro (\d+)\/(\d+)/g)].at(-1)
      if (frame) progress(from + ((to - from) * Number(frame[1])) / Number(frame[2]), `Renderizando quadro ${frame[1]} de ${frame[2]}`)
    }
  }

  async function prepareVersion(project, id, storyboard, words, modelId, progress, scene, style = project.style || "3d") {
    const dir = projectDir(project.id)
    const board = `storyboard-${id}.json`
    const preview = `previa-${id}.mp4`
    const out = path.join(dir, preview)
    progress(48, "Validando cenas e renderizando a prévia")
    try {
      const is2d = isStickStyle(style) || isStickStyle(storyboard?.estilo)
      const validated = is2d
        ? await renderStick2dVideo({
          storyboard, words, audio: path.join(dir, project.audio), output: out, preview: true,
          onProgress: (msg, pct) => progress(48 + 46 * (pct || 0), msg),
        })
        : await renderKitVideo({
          storyboard, words, audio: path.join(dir, project.audio), output: out, preview: true,
          onProgress: renderProgress(progress, 48, 94),
          repair: (value, errors) => repairKitVideo(modelId, value, errors, scene),
        })
      fs.writeFileSync(path.join(dir, board), JSON.stringify(validated, null, 2))
      return {
        id, board, preview, model: modelId, style: is2d ? (storyboard?.estilo || style) : "3d", createdAt: new Date().toISOString(),
        scenes: validated.cenas.map(({ inicio, fim }) => ({ inicio, fim })),
      }
    } catch (error) {
      fs.rmSync(out, { force: true })
      throw error
    }
  }

  const selected = (project, id) => project.versions?.find((version) => version.id === (id || project.selectedVersion))

  async function planningChannel(value) {
    const id = text(value, 80)
    if (!id) return { id: "", title: "" }
    const channel = (await listStudioChannels()).channels.find(entry => entry.id === id)
    if (!channel) throw badRequest("Canal não encontrado.", 404)
    return channel
  }

  router.get("/pautas", route(async (req, res) => {
    const channel = await planningChannel(req.query.canal)
    res.json(notebook(channel.id))
  }))
  router.post("/pautas", route(async (req, res) => {
    const channel = await planningChannel(req.body.channelId)
    const { action } = req.body
    if (action === "sugerir") {
      const interests = text(req.body.interests, 1000)
      const book = updateNotebook(channel.id, entry => { entry.interests = interests })
      const ideas = await suggestIdeas(model(req.body.model), interests, book.references, book.ideas.map(i => i.title), channel.title)
      return res.json(updateNotebook(channel.id, entry => { entry.ideas = [...entry.ideas.filter(i => i.queued), ...ideas] }))
    }
    res.json(updateNotebook(channel.id, entry => {
      if (action === "preferencias") entry.interests = text(req.body.interests, 1000)
      else if (action === "referencia") {
        let url
        try { url = new URL(text(req.body.url, 2000)) } catch { throw badRequest("Informe um link válido.") }
        if (!["https:", "http:"].includes(url.protocol)) throw badRequest("Use um link HTTP ou HTTPS.")
        const note = text(req.body.note, 800)
        if (!note) throw badRequest("Anote o que deseja aproveitar da referência.")
        entry.references.push({ id: randomUUID(), url: url.href, note })
      } else if (action === "fila") {
        const idea = entry.ideas.find(i => i.id === req.body.id)
        if (!idea) throw badRequest("Tema não encontrado.", 404)
        idea.queued = Boolean(req.body.queued)
      } else throw badRequest("Operação inválida.")
    }))
  }))

  function run(res, kind, project, work) {
    if (project && projects.get(project.id) !== project) throw badRequest("O projeto mudou. Atualize a página.", 409)
    if (project && active.has(project.id)) throw badRequest("Aguarde a etapa em andamento.", 409)
    const job = createJob(kind)
    job.localOnly = true
    if (project) active.set(project.id, job.id)
    startJob(job, async (context) => {
      try { return { project: publicProject(await work(context, job.id)) } }
      finally { if (project) active.delete(project.id) }
    })
    res.status(202).json({ jobId: job.id })
  }

  router.get("/config", route(async (_req, res) => {
    const [gemini, elevenlabs, go, models, kit] = await Promise.all([providerKey("gemini"), providerKey("elevenlabs"), goKey(), goModels(), kitAvailability()])
    res.json({ voices: [ARLO, ...VOICE_CATALOG], elevenVoices: ELEVEN_VOICES, gemini: Boolean(gemini), elevenlabs: Boolean(elevenlabs), go: Boolean(go), models: Object.keys(models).sort(), modelCatalog: models, kit })
  }))
  router.get("/vozes", route(async (req, res) => {
    if (req.query.provider === "elevenlabs") return res.json(await elevenVoices(await providerKey("elevenlabs")))
    res.json(await googleVoices(await providerKey("gemini")))
  }))

  router.get("/canais", route(async (_req, res) => res.json(await listStudioChannels())))
  router.get("/canais/pendente/:id", route((req, res) => {
    const channel = pendingStudioChannel(req.params.id)
    if (!channel) throw badRequest("Esta autorização expirou. Inicie a conexão novamente.", 404)
    res.json(channel)
  }))
  router.post("/canais/pendente/:id", route((req, res) => {
    const channel = addStudioChannel(req.params.id)
    if (!channel) throw badRequest("Esta autorização expirou. Inicie a conexão novamente.", 404)
    res.json(channel)
  }))

  router.get("/youtube", route(async (_req, res) => {
    const status = await getOAuthStatus(true)
    const channel = status.connected ? await getStudioChannel() : null
    res.json({ ...status, channel })
  }))

  router.get("/projetos", route(async (req, res) => {
    const { originalId } = await listStudioChannels()
    const id = String(req.query.canal ?? "")
    const forPublication = req.query.publicacao === "1"
    res.json([...projects.values()]
      .filter((project) => project.studio === "fora-do-nivel")
      .filter((project) => {
        const owner = projectChannel(project, originalId) || ""
        if (!forPublication) return owner === id
        if (owner && id && owner !== id) return false
        return Boolean(project.publicacao || selected(project) || (project.mp4 && fs.existsSync(path.join(projectDir(project.id), project.mp4))))
      })
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .map((project) => view(project)))
  }))

  router.get("/projetos/:id", route((req, res) => res.json(view(get(req.params.id)))))
  router.post("/projetos/:id/excluir", route((req, res) => {
    const project = get(req.params.id)
    if (active.has(project.id)) throw badRequest("Aguarde o fim da operação para excluir o projeto.", 409)
    const root = path.resolve(projectDir("."))
    const dir = path.resolve(projectDir(project.id))
    if (path.dirname(dir) !== root || !/^fdn-[\w-]+$/.test(project.id) || fs.lstatSync(dir).isSymbolicLink()) throw badRequest("Pasta de projeto inválida.")
    const removed = path.join(root, ".excluido-" + randomUUID())
    fs.renameSync(dir, removed)
    projects.delete(project.id)
    fs.rmSync(removed, { recursive: true, force: true, maxRetries: 3 })
    res.json({ excluded: project.id })
  }))

  router.post("/projetos", route(async (req, res) => {
    const idea = text(req.body?.idea, 6000)
    const duration = Number(req.body?.duration)
    const manual = req.body?.manual === true
    const style = isStickStyle(req.body?.style) ? req.body.style : "3d"
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    const channelId = text(req.body?.channelId, 80) || null
    if (channelId && !(await listStudioChannels()).channels.some((channel) => channel.id === channelId)) {
      throw badRequest("Escolha um canal conectado.")
    }
    if (!idea && !manual) throw badRequest("Escreva a ideia do Short.")
    if (![30, 45, 60, 90, 120, 150].includes(duration)) throw badRequest("Escolha uma duração para o Short.")

    function create(roteiro) {
      const titulo = roteiro.titulos[0] || text(idea, 100) || "Novo Short"
      return commit({
        id: `fdn-${slugify(titulo) || "short"}-${randomUUID().slice(0, 8)}`,
        studio: "fora-do-nivel", titulo, ideia: idea, duracaoAlvo: duration, style, ttsProvider, roteiro, channelId,
        criadoEm: new Date().toISOString(), pautaId: text(req.body.pautaId, 80) || null,
      })
    }

    if (manual) return res.status(201).json({ project: view(create({ titulos: [], roteiro: "", descricao: "" })) })
    const scriptModel = model(req.body?.model)
    run(res, "roteiro", null, async ({ progress }) => {
      progress(20, "Escrevendo títulos e narração")
      const tagRule = ttsProvider === "elevenlabs"
        ? `Inclua tags de áudio expressivas da ElevenLabs v3 inline nos momentos certos da narração (ex.: [curious], [excited], [whispers], [sighs], [gasp], [pauses]) sem exagerar, mantendo o texto natural em português brasileiro.`
        : `O campo "roteiro" deve conter APENAS o texto exato que será falado na narração (sem rubricas, sem "Visual:", sem "Narrador:" e sem indicações entre parênteses ou colchetes).`
      const generated = parseJsonLoose(await askStudioGo({
        model: scriptModel,
        text: `Escreva um roteiro em português brasileiro de aproximadamente ${duration} segundos para um vídeo explicativo (${style}). Use frases curtas, gancho forte nos 3 primeiros segundos e explicação clara, sem inventar dados. ${tagRule} Retorne somente {"titulo":"","roteiro":"","descricao":""}. Tema: ${JSON.stringify(idea)}`,
      }))
      const roteiro = text(generated?.roteiro, 5000)
      if (!roteiro) throw new Error("O modelo não retornou um roteiro.")
      return commit({ ...create({ titulos: [text(generated.titulo, 100)], roteiro, descricao: text(generated.descricao, 5000) }), scriptModel })
    })
  }))

  router.post("/projetos/:id/roteiro", route((req, res) => {
    const project = get(req.params.id)
    if (active.has(project.id) || project.publicacao) throw badRequest("Este projeto não pode ser alterado agora.", 409)
    const titulo = text(req.body?.titulo, 100)
    const roteiro = text(req.body?.roteiro, 5000)
    if (!titulo) throw badRequest("Digite um título.")
    if (project.audio && roteiro !== project.roteiro.roteiro) throw badRequest("Gere uma nova narração para aplicar a mudança no roteiro.")
    res.json({ project: view(commit({ ...project, titulo, roteiro: { ...project.roteiro, roteiro } })) })
  }))

  router.post("/projetos/:id/canal", route(async (req, res) => {
    const { channels, originalId } = await listStudioChannels()
    const project = get(req.params.id)
    if (active.has(project.id) || project.publicacao || projectChannel(project, originalId)) {
      throw badRequest("Este projeto já pertence a um canal ou tem uma operação em andamento.", 409)
    }
    const channel = channels.find((item) => item.id === req.body?.channelId)
    if (!channel) throw badRequest("Selecione um canal conectado.")
    res.json({ project: view(commit({ ...project, channelId: channel.id })) })
  }))

  router.post("/projetos/:id/narracao", route((req, res) => {
    const project = get(req.params.id)
    const roteiro = text(req.body?.roteiro, 5000)
    const titulo = text(req.body?.titulo, 100)
    const descricao = text(req.body?.descricao, 5000)
    const voice = req.body?.voice
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    if (project.publicacao) throw badRequest("Este projeto já foi enviado ao YouTube.", 409)
    if (!roteiro || !titulo) throw badRequest("Preencha o título e a narração.")
    if (typeof voice !== "string" || !voice.trim() || voice.length > 300) throw badRequest("Escolha uma voz.")

    run(res, "narracao", project, async ({ progress }, id) => {
      progress(20, ttsProvider === "elevenlabs" ? "Gerando a voz na ElevenLabs (com tags de áudio)" : "Gerando a voz no Gemini")
      const wav = ttsProvider === "elevenlabs"
        ? await generateElevenNarration({ key: await providerKey("elevenlabs"), text: roteiro, voice })
        : await generateNarration({ key: await providerKey("gemini"), text: roteiro, voice })
      const file = `audio-${id}.wav`
      const out = path.join(projectDir(project.id), file)
      fs.writeFileSync(out, wav)
      try {
        const duration = await audioDuration(out)
        if (!(duration > 0 && duration <= 180)) {
          throw new Error(duration > 180 ? "A narração passou de 3 minutos. Encurte o texto e gere de novo." : "O áudio recebido está vazio ou ilegível.")
        }
        return commit({
          ...project, titulo, roteiro: { ...project.roteiro, roteiro, descricao }, voice, ttsProvider,
          audio: file, duration, html: null, htmlFonte: null, mp4: null,
          versions: [], history: [], selectedVersion: null, words: null, exportedVersion: null, scenePlan: null,
        })
      } catch (e) {
        fs.rmSync(out, { force: true })
        throw e
      }
    })
  }))

  router.post(["/projetos/:id/plano", "/projetos/:id/animacao"], route((req, res) => {
    const project = get(req.params.id)
    if (project.publicacao) throw badRequest("Este projeto já foi enviado ao YouTube.", 409)
    if (!project.audio) throw badRequest("Gere a narração primeiro.")
    const modelId = model(req.body?.model)
    const style = isStickStyle(req.body?.style) ? req.body.style : req.body?.style === "3d" ? "3d" : (project.style || "3d")
    const is2dStyle = isStickStyle(style)
    run(res, "animacao", project, async ({ progress }, id) => {
      if (!is2dStyle && !await kitAvailability()) throw new Error("Instale as dependências Node do kit para renderizar.")
      const audio = path.join(projectDir(project.id), project.audio)
      progress(8, "Sincronizando a narração com as legendas")
      const words = project.words ? readJson(project, project.words) : await timeKitWords(audio, project.duration)
      const wordsFile = project.words ?? `palavras-${id}.json`
      if (!project.words) fs.writeFileSync(path.join(projectDir(project.id), wordsFile), JSON.stringify(words))
      progress(25, is2dStyle ? `Planejando cenas 2D (${style.toUpperCase()})` : "Planejando as cenas com o OpenCode Go")
      const planning = req.path.endsWith("/plano")
      if (req.body.planId && project.scenePlan?.id !== req.body.planId) throw badRequest("O plano mudou. Confira as cenas novamente.", 409)
      const storyboard = !planning && project.scenePlan
        ? project.scenePlan.board
        : is2dStyle
          ? await planStick2dVideo({ model: modelId, title: project.titulo, script: project.roteiro.roteiro, duration: project.duration, words, style })
          : await planKitVideo({ model: modelId, title: project.titulo, script: project.roteiro.roteiro, duration: project.duration, words })
      if (planning) {
        const scenes = storyboard.cenas.map(scene => words.filter(w => w.inicio >= scene.inicio && w.inicio < scene.fim).map(w => w.palavra).join(" "))
        return commit({ ...project, style, words: wordsFile, animationModel: modelId, scenePlan: { id, board: storyboard, narration: scenes } })
      }
      const version = await prepareVersion(project, id, storyboard, words, modelId, progress, undefined, style)
      return commit({ ...project, style, scenePlan: null, words: wordsFile, animationModel: modelId, versions: [...(project.versions ?? []), version], selectedVersion: id, mp4: null, exportedVersion: null })
    })
  }))
  router.post("/projetos/:id/plano/ajuste", route((req, res) => {
    const project = get(req.params.id)
    const plan = project.scenePlan
    const scene = Number(req.body.scene)
    const message = text(req.body.message, 2000)
    if (!plan || project.publicacao || req.body.planId !== plan.id || !Number.isInteger(scene) || !plan.board.cenas[scene] || !message) throw badRequest("Confira o plano e selecione a cena.")
    const modelId = model(req.body.model)
    run(res, "plano", project, async ({ progress }, id) => {
      progress(25, "Ajustando o plano da cena")
      const edit = await reviseKitVideo({ model: modelId, storyboard: plan.board, scene, time: plan.board.cenas[scene].inicio, history: [], message })
      return commit({ ...project, scenePlan: { ...plan, id, board: edit.storyboard || plan.board, response: edit.response } })
    })
  }))

  router.post("/projetos/:id/chat", route((req, res) => {
    const project = get(req.params.id)
    if (project.publicacao) throw badRequest("Este projeto já foi publicado.", 409)
    const version = selected(project, req.body?.version)
    const message = text(req.body?.message, 2000)
    const image = req.body?.image
    if (image && (typeof image !== "string" || image.length > 2_000_100 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) {
      throw badRequest("Anexe uma imagem PNG, JPEG ou WebP de até 1,5 MB.")
    }
    const modelId = model(req.body?.model)
    const scene = Number(req.body?.scene)
    if (!version || !message || !Number.isInteger(scene) || !version.scenes[scene]) throw badRequest("Selecione a cena e digite uma mensagem.")
    const range = version.scenes[scene]
    const time = Math.min(range.fim, Math.max(range.inicio, Number(req.body?.time) || 0))
    const history = project.history ?? []
    const user = { role: "user", text: message, scene, time, version: version.id, attachment: Boolean(image) }
    run(res, "revisao", project, async ({ progress }, id) => {
      progress(20, "Consultando o modelo escolhido")
      const currentBoard = readJson(project, version.board)
      const is2d = isStickStyle(currentBoard?.estilo) || isStickStyle(version.style) || isStickStyle(project.style)
      const edit = is2d
        ? await reviseStick2dVideo({ model: modelId, storyboard: currentBoard, scene, time, history, message, image })
        : await reviseKitVideo({ model: modelId, storyboard: currentBoard, scene, time, history, message, image })
      let updates = {}
      if (edit.storyboard) {
        const next = await prepareVersion(project, id, edit.storyboard, readJson(project, project.words), modelId, progress, scene, currentBoard?.estilo || project.style || "2d-palito")
        updates = { versions: [...project.versions, next], selectedVersion: id, exportedVersion: null, mp4: null }
      }
      const assistant = { role: "assistant", text: edit.response, model: modelId, scene, time, version: updates.selectedVersion || version.id }
      return commit({ ...project, ...updates, history: [...history, user, assistant] })
    })
  }))

  router.post("/projetos/:id/versao", route((req, res) => {
    const project = get(req.params.id)
    if (active.has(project.id) || project.publicacao) throw badRequest("Este projeto não pode ser alterado agora.", 409)
    const version = selected(project, req.body?.version)
    if (!version) throw badRequest("Versão não encontrada.")
    const current = project.exportedVersion === version.id
    res.json({ project: view(commit({ ...project, selectedVersion: version.id, mp4: current ? project.mp4 : null, exportedVersion: current ? version.id : null })) })
  }))

  router.post("/projetos/:id/exportar", route((req, res) => {
    const project = get(req.params.id)
    const version = selected(project, project.selectedVersion)
    if (project.mp4) return res.json({ project: view(project) })
    if (!version) throw badRequest("Gere uma prévia antes de exportar.")
    run(res, "exportacao", project, async ({ progress }, id) => {
      const dir = projectDir(project.id)
      const mp4 = `video-${id}.mp4`
      const output = path.join(dir, mp4)
      progress(20, "Renderizando MP4 vertical em 1080 × 1920")
      try {
        const board = readJson(project, version.board)
        const words = readJson(project, project.words)
        const is2d = isStickStyle(board?.estilo) || isStickStyle(version.style) || isStickStyle(project.style)
        if (is2d) {
          await renderStick2dVideo({
            storyboard: board, words, audio: path.join(dir, project.audio), output,
            onProgress: (msg, pct) => progress(20 + 76 * (pct || 0), msg),
          })
        } else {
          await renderKitVideo({
            storyboard: board, words,
            audio: path.join(dir, project.audio), output, onProgress: renderProgress(progress, 20, 96),
          })
        }
        return commit({ ...project, mp4, exportedVersion: version.id })
      } catch (error) {
        fs.rmSync(output, { force: true })
        throw error
      }
    })
  }))

  router.post("/projetos/:id/publicacao", route(async (req, res) => {
    const project = get(req.params.id)
    if (!project.mp4) throw badRequest("Crie o vídeo antes de publicar.")
    if (project.publicacao) return res.json({ project: view(project) })
    const title = text(req.body?.titulo, 100)
    const description = text(req.body?.descricao, 5000)
    const { privacyStatus, channelId } = req.body ?? {}
    const publishAt = req.body.publishAt || ""
    if (publishAt && (privacyStatus !== "private" || !(Date.parse(publishAt) > Date.now()))) throw badRequest("Escolha uma data futura para agendar.")
    if (!title || !channelId || !["public", "unlisted", "private"].includes(privacyStatus)) {
      throw badRequest("Revise o título, o canal e a visibilidade.")
    }
    const { originalId } = await listStudioChannels()
    if (projectChannel(project, originalId) !== channelId) throw badRequest("O destino não é o canal deste projeto.")
    run(res, "publicacao", project, async ({ progress }) => {
      progress(25, "Enviando o MP4 ao YouTube")
      const publicacao = await uploadShortToYouTube({
        buffer: await fs.promises.readFile(path.join(projectDir(project.id), project.mp4)),
        title, description, privacyStatus, publishAt, expectedChannel: channelId, accessToken: await studioChannelToken(channelId),
      })
      return commit({ ...project, titulo: title, roteiro: { ...project.roteiro, descricao: description }, publicacao: { ...publicacao, channelId, publishAt } })
    })
  }))

  router.post("/projetos/:id/vincular-short", route(async (req, res) => {
    const id = youtubeVideoId(req.body.url)
    if (!id) throw badRequest("Cole um link de vídeo ou Short do YouTube.")
    const { originalId } = await listStudioChannels()
    const project = get(req.params.id)
    const channelId = projectChannel(project, originalId)
    if (!channelId || project.publicacao) throw badRequest("Escolha um projeto de um canal conectado e ainda não publicado.")
    run(res, "vinculo", project, async () => {
      const token = await studioChannelToken(channelId)
      const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=" + id, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw Error("O YouTube não permitiu confirmar o vídeo. Verifique a conexão do canal.")
      const video = (await response.json()).items?.[0]
      if (video?.snippet?.channelId !== channelId) throw Error("O vídeo não foi encontrado neste canal.")
      return commit({ ...project, publicacao: { id, channelId, linked: true, publishAt: video.status?.publishAt || "" } })
    })
  }))

  return router
}
