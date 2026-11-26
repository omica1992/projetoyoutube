// Renderização do vídeo 3D na versão hospedada (sem Chrome/FFmpeg no servidor).
// O planejamento das cenas acontece no servidor; o desenho e a codificação
// acontecem neste navegador, num iframe isolado.

import { saveVideo } from "./studio-media.js"

let dialog
let state = null
let sequence = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char])
const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  if (seconds < 90) return `faltam ~${Math.max(1, Math.ceil(seconds))}s`
  return `faltam ~${Math.ceil(seconds / 60)} min`
}
const fileSlug = (value) => String(value || "video").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).toLowerCase() || "video"

async function decodeAudio(blob) {
  const bytes = await blob.arrayBuffer()
  const context = new OfflineAudioContext(1, 48_000, 48_000)
  return context.decodeAudioData(bytes)
}

/** Sincroniza as palavras usando a energia da fala (pausas reais do áudio). */
export function estimateWords(audioBuffer, text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const samples = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const step = Math.max(1, Math.round(sampleRate * 0.02))
  const rms = []
  for (let offset = 0; offset + step <= samples.length; offset += step) {
    let total = 0
    for (let i = 0; i < step; i++) total += samples[offset + i] * samples[offset + i]
    rms.push(Math.sqrt(total / step))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * value)))] || 0
  const threshold = Math.max(0.0015, percentile(0.1) * 2.5, percentile(0.9) * 0.1)

  const regions = []
  let start = null
  rms.forEach((value, index) => {
    const speech = value > threshold
    if (speech && start === null) start = index * step / sampleRate
    if (!speech && start !== null) {
      const end = index * step / sampleRate
      if (end - start > 0.06) regions.push({ start, end })
      start = null
    }
  })
  if (start !== null) regions.push({ start, end: audioBuffer.duration })

  // Junta pausas muito curtas (respiração entre palavras) e descarta estalos.
  const merged = []
  for (const region of regions) {
    const last = merged.at(-1)
    if (last && region.start - last.end < 0.16) last.end = region.end
    else merged.push({ ...region })
  }
  const speech = merged.filter((region) => region.end - region.start >= 0.05)
  if (!speech.length) speech.push({ start: 0, end: audioBuffer.duration })

  const weights = words.map((word) => Math.max(2, word.replace(/[^\p{L}\p{N}]/gu, "").length))
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)
  const totalSpeech = speech.reduce((sum, region) => sum + region.end - region.start, 0)
  const result = []
  let word = 0
  let index = 0
  let cursor = speech[0].start
  while (word < words.length && index < speech.length) {
    const region = speech[index]
    const available = region.end - cursor
    if (available <= 0.02) {
      index += 1
      cursor = speech[index]?.start ?? cursor
      continue
    }
    const duration = Math.max(0.06, (weights[word] / totalWeight) * totalSpeech)
    const use = Math.min(duration, available)
    result.push({ palavra: words[word], inicio: cursor, fim: cursor + use })
    cursor += use
    word += 1
    if (cursor >= region.end - 0.02) {
      index += 1
      cursor = speech[index]?.start ?? cursor
    }
  }
  // Se a fala detectada terminou antes do texto, distribui o restante até o fim.
  while (word < words.length) {
    const remaining = Math.max(0.06, (weights[word] / totalWeight) * totalSpeech)
    result.push({ palavra: words[word], inicio: cursor, fim: Math.min(audioBuffer.duration, cursor + remaining) })
    cursor += remaining
    word += 1
  }
  return result.filter((item) => item.fim > item.inicio)
}

function ensureDialog() {
  if (dialog) return dialog
  dialog = document.createElement("div")
  dialog.className = "render-dialog"
  dialog.hidden = true
  dialog.innerHTML = `
    <div class="render-backdrop" data-render-close></div>
    <section class="render-panel" role="dialog" aria-modal="true" aria-labelledby="render-title">
      <header class="render-head">
        <div><span class="tag">Studio 3D · navegador</span><h2 id="render-title">Renderizar animação</h2></div>
        <button type="button" class="render-close" data-render-close aria-label="Fechar">×</button>
      </header>
      <div class="render-body">
        <div class="render-intro" data-render-step="start">
          <p>O planejamento das cenas usa a IA do OpenCode Go. O desenho e a codificação do MP4 acontecem <strong>neste navegador</strong> — mantenha esta aba aberta.</p>
          <p class="render-audio">Narração: <strong data-render-duration>—</strong> · <span data-render-wordcount>—</span></p>
          <div class="render-start-actions">
            <button type="button" class="button" data-render-start="final">Renderizar vídeo final</button>
            <button type="button" class="button secondary" data-render-start="preview">Prévia rápida</button>
          </div>
          <p class="render-hint">Final: 1080 × 1920, 30 fps. Prévia: 540 × 960, 24 fps. A prévia não é salva no projeto.</p>
          <p class="render-error" data-render-error hidden></p>
        </div>
        <div class="render-running" data-render-step="running" hidden>
          <p class="render-status" data-render-status>Preparando…</p>
          <progress max="1" value="0" data-render-progress></progress>
          <p class="render-detail" data-render-detail></p>
          <p class="render-hint">Você pode continuar em outra aba; não feche esta.</p>
        </div>
        <div class="render-result" data-render-step="result" hidden>
          <video class="render-video" controls playsinline data-render-video></video>
          <p class="render-status" data-render-result-status>Vídeo pronto.</p>
          <p class="render-detail" data-render-result-detail></p>
          <div class="render-start-actions">
            <a class="button" data-render-download download>Baixar vídeo</a>
            <button type="button" class="button secondary" data-render-close>Fechar</button>
          </div>
        </div>
      </div>
    </section>`
  document.body.appendChild(dialog)
  dialog.addEventListener("click", (event) => {
    const start = event.target.closest("[data-render-start]")
    if (start && state && !state.running) startRender(start.dataset.renderStart)
    if (event.target.closest("[data-render-close]")) requestClose()
  })
  return dialog
}

function showStep(name) {
  for (const element of dialog.querySelectorAll("[data-render-step]")) {
    element.hidden = element.dataset.renderStep !== name
  }
}

function setStatus(message, pct, eta) {
  dialog.querySelector("[data-render-status]").textContent = message
  const progress = dialog.querySelector("[data-render-progress]")
  if (Number.isFinite(pct)) progress.value = Math.max(0, Math.min(1, pct))
  dialog.querySelector("[data-render-detail]").textContent = formatEta(eta)
}

function showError(error) {
  const message = error?.message || String(error)
  const box = dialog.querySelector("[data-render-error]")
  box.hidden = false
  box.textContent = message
  showStep("start")
  const buttons = dialog.querySelectorAll("[data-render-start]")
  for (const button of buttons) button.disabled = false
  setStatus(message)
}

function cleanupFrame() {
  if (state?.frame) {
    state.frame.remove()
    state.frame = null
  }
  if (state?.listener) {
    removeEventListener("message", state.listener)
    state.listener = null
  }
  if (state?.readyTimer) {
    clearTimeout(state.readyTimer)
    state.readyTimer = null
  }
  if (state?.planAbort) {
    state.planAbort.abort()
    state.planAbort = null
  }
}

function requestClose() {
  if (!state) {
    if (dialog) dialog.hidden = true
    return
  }
  if (state.running && !window.confirm("Cancelar a renderização em andamento?")) return
  if (state.running) {
    state.cancelled = true
    state.frame?.contentWindow?.postMessage({ type: "kit-cancel" }, location.origin)
    state.planAbort?.abort()
    cleanupFrame()
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl)
    if (dialog) {
      dialog.hidden = true
      dialog.querySelector("[data-render-video]").removeAttribute("src")
      dialog.querySelector("[data-render-download]").removeAttribute("href")
    }
    return
  }
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl)
  state = null
  if (dialog) {
    dialog.hidden = true
    dialog.querySelector("[data-render-video]").removeAttribute("src")
    dialog.querySelector("[data-render-download]").removeAttribute("href")
  }
}

async function requestPlan(path, body, signal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 70_000)
  const abort = () => controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || (response.status === 504
        ? "O planejamento demorou demais. Tente novamente."
        : `O planejamento falhou (HTTP ${response.status}).`))
      error.status = response.status
      throw error
    }
    return data
  } catch (error) {
    if (signal?.aborted) throw error
    if (error?.name === "AbortError") throw new Error("O modelo demorou mais de um minuto nesta etapa. Tente novamente ou escolha outro modelo.")
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

async function planStoryboard({ title, script, model, words, duration, signal, onScene }) {
  let outline
  try {
    const data = await requestPlan("/api/painel/studio/plano/esboco", {
      titulo: title,
      roteiro: script,
      duracao: duration,
      model,
      palavras: words,
    }, signal)
    outline = data.outline
  } catch (error) {
    if (error.status !== 404) throw error
    // Servidor antigo, sem o planejamento em partes: usa a chamada única.
    const data = await requestPlan("/api/painel/studio/plano", {
      titulo: title,
      roteiro: script,
      duracao: duration,
      model,
      palavras: words,
    }, signal)
    if (!data.storyboard?.cenas?.length) throw new Error("A IA não devolveu um plano de cenas válido. Tente novamente.")
    return data.storyboard
  }
  if (!outline?.cenas?.length) throw new Error("A IA não devolveu um esboço de cenas válido. Tente novamente.")

  const scenes = new Array(outline.cenas.length)
  let cursor = 0
  let done = 0
  const runScene = async (index) => {
    const scene = outline.cenas[index]
    const sceneWords = words.filter((word) => word.inicio >= scene.inicio - 0.1 && word.inicio < scene.fim + 0.1)
    const body = {
      model,
      esboco: scene,
      anterior: outline.cenas[index - 1] || null,
      proximo: outline.cenas[index + 1] || null,
      palavras: sceneWords,
      ambiente: outline.ambiente,
      duracao: outline.duracao,
      indice: index,
      totalCenas: outline.cenas.length,
    }
    let lastError
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError")
      try {
        const data = await requestPlan("/api/painel/studio/plano/cena", body, signal)
        if (!data.cena) throw new Error("A IA não devolveu a cena.")
        return data.cena
      } catch (error) {
        if (signal?.aborted) throw error
        lastError = error
        if (error.status === 400 || error.status === 401 || error.status === 403) break
      }
    }
    throw new Error(`Cena ${index + 1}: ${lastError?.message || "não foi possível planejar."}`)
  }

  const workers = Array.from({ length: Math.min(3, outline.cenas.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= outline.cenas.length) return
      scenes[index] = await runScene(index)
      done += 1
      onScene?.(done, outline.cenas.length)
    }
  })
  await Promise.all(workers)
  if (scenes.some((scene) => !scene)) throw new Error("Algumas cenas não foram planejadas. Tente novamente.")
  return {
    versao: 1,
    titulo: title,
    formato: { largura: 1080, altura: 1920, fps: 30 },
    duracao: outline.duracao,
    audio: "narracao.wav",
    palavras: "palavras.json",
    legendas: { ativo: true, palavrasPorBloco: 1 },
    ambiente: outline.ambiente,
    cenas: scenes,
  }
}

async function startRender(quality) {
  if (!state || state.running) return
  const preview = quality === "preview"
  state.running = true
  state.preview = preview
  state.error = null
  dialog.querySelectorAll("[data-render-start]").forEach((button) => { button.disabled = true })
  dialog.querySelector("[data-render-error]").hidden = true
  showStep("running")
  setStatus("Sincronizando a narração", 0.01)
  let controller
  try {
    const words = estimateWords(state.audioBuffer, state.script)
    if (state.cancelled) return
    const duration = Math.max(6, Math.min(180, state.audioBuffer.duration))
    controller = new AbortController()
    state.planAbort = controller
    setStatus("Montando o esboço das cenas", 0.05)
    let storyboard
    try {
      storyboard = await planStoryboard({
        title: state.title,
        script: state.script,
        model: state.model,
        words,
        duration,
        signal: controller.signal,
        onScene: (done, total) => setStatus(`Planejando cena ${done} de ${total}`, 0.06 + (done / total) * 0.46),
      })
    } finally {
      state.planAbort = null
    }
    if (state.cancelled) return
    if (!storyboard?.cenas?.length) throw new Error("A IA não devolveu um plano de cenas válido. Tente novamente.")

    setStatus("Preparando o motor 3D", 0.54)
    const audio = await state.audioBlob.arrayBuffer()
    if (state.cancelled) return
    await openFrame({ storyboard, words, audio, preview })
  } catch (error) {
    if (state?.cancelled || error?.name === "AbortError") return
    controller?.abort()
    state.running = false
    showError(error)
  }
}

async function openFrame({ storyboard, words, audio, preview }) {
  const frame = document.createElement("iframe")
  frame.className = "render-frame"
  frame.title = "Renderizador 3D"
  frame.src = `/kit-render.html?projeto=virtual&render=1&qualidade=basica${preview ? "&previa=1" : ""}`
  document.body.appendChild(frame)
  state.frame = frame
  state.storyboard = storyboard
  state.words = words
  state.audio = audio
  state.preview = preview
  state.started = false

  const startFrame = () => {
    if (!state || state.started || !state.frame) return
    state.started = true
    state.frame.contentWindow?.postMessage({
      type: "render-start",
      storyboard: state.storyboard,
      words: state.words,
      audio: state.audio,
      titulo: state.title,
    }, location.origin, [state.audio])
    setStatus("Começando a desenhar os quadros", 0.02)
  }

  state.listener = (event) => {
    if (!state || event.origin !== location.origin || event.source !== state.frame?.contentWindow) return
    const message = event.data || {}
    if (message.type === "kit-ready") {
      clearTimeout(state.readyTimer)
      state.readyTimer = null
      startFrame()
    } else if (message.type === "kit-stage" || message.type === "kit-progress") {
      const pct = Number.isFinite(message.pct) ? 0.55 + Math.min(1, Math.max(0, message.pct)) * 0.45 : undefined
      setStatus(message.message || "Renderizando", pct, message.eta)
    } else if (message.type === "kit-done") {
      finish(message).catch((error) => {
        state.running = false
        showError(error)
      })
    } else if (message.type === "kit-error") {
      state.running = false
      showError(new Error(message.error || "A renderização falhou."))
      cleanupFrame()
    } else if (message.type === "kit-cancelled") {
      state.running = false
      cleanupFrame()
      showStep("start")
    }
  }
  addEventListener("message", state.listener)
  state.readyTimer = setTimeout(() => {
    if (state && !state.started) {
      state.running = false
      cleanupFrame()
      showError(new Error("O motor 3D não carregou. Recarregue a página e tente novamente."))
    }
  }, 60_000)
}

async function finish(message) {
  const session = state
  if (!session || session.cancelled) return
  session.running = false
  session.started = false
  clearTimeout(session.readyTimer)
  session.readyTimer = null
  const blob = new Blob([message.buffer], { type: message.mime || "video/mp4" })
  const extension = (message.mime || "").includes("webm") ? "webm" : "mp4"
  if (session.resultUrl) URL.revokeObjectURL(session.resultUrl)
  session.resultUrl = URL.createObjectURL(blob)
  session.resultBlob = blob

  const video = dialog.querySelector("[data-render-video]")
  video.src = session.resultUrl
  const download = dialog.querySelector("[data-render-download]")
  download.href = session.resultUrl
  download.download = `${fileSlug(session.title)}.${extension}`
  dialog.querySelector("[data-render-result-detail]").textContent = [
    `${message.width} × ${message.height}`,
    `${message.fps} fps`,
    `${Number(message.duration).toFixed(1)}s`,
    `${(blob.size / 1e6).toFixed(1)} MB`,
  ].join(" · ")

  let saved = false
  if (!session.preview && session.projectId) {
    try {
      await saveVideo(session.projectId, {
        blob,
        mime: message.mime,
        width: message.width,
        height: message.height,
        fps: message.fps,
        duration: message.duration,
        title: session.title,
      })
      saved = true
    } catch { /* o download continua disponível */ }
  }
  if (state !== session) return
  dialog.querySelector("[data-render-result-status]").textContent = saved
    ? "Vídeo pronto e salvo neste navegador."
    : session.preview
      ? "Prévia pronta (não salva no projeto)."
      : "Vídeo pronto. Baixe o arquivo para guardar."
  showStep("result")
  session.onSaved?.({ saved, blob, mime: message.mime })
  cleanupFrame()
}

/**
 * Abre o diálogo de renderização para um projeto com narração já pronta.
 * @param {{project: object, audioBlob: Blob, model: string, onSaved?: Function}} options
 */
export async function renderProject({ project, audioBlob, model, onSaved }) {
  if (!audioBlob) throw new Error("A narração deste projeto precisa ser gerada novamente neste navegador.")
  const script = String(project?.roteiro?.roteiro || "").trim()
  if (!script) throw new Error("O projeto não tem roteiro para narrar.")
  ensureDialog()
  cleanupFrame()
  if (state?.resultUrl) URL.revokeObjectURL(state.resultUrl)
  state = {
    projectId: project.id,
    title: project.titulo || "Novo vídeo",
    script,
    model: model || "opencode-go/kimi-k3",
    audioBlob,
    audioBuffer: null,
    onSaved,
    running: false,
    cancelled: false,
    started: false,
    resultUrl: null,
    resultBlob: null,
    sequence: ++sequence,
  }
  dialog.hidden = false
  showStep("start")
  dialog.querySelector("[data-render-error]").hidden = true
  dialog.querySelectorAll("[data-render-start]").forEach((button) => { button.disabled = true })
  dialog.querySelector("[data-render-duration]").textContent = "lendo…"
  dialog.querySelector("[data-render-wordcount]").textContent = ""
  try {
    state.audioBuffer = await decodeAudio(audioBlob)
    if (!state || state.sequence !== sequence) return
    const words = script.split(/\s+/).filter(Boolean).length
    dialog.querySelector("[data-render-duration]").textContent = `${state.audioBuffer.duration.toFixed(1)}s`
    dialog.querySelector("[data-render-wordcount]").textContent = `${words} palavras`
    dialog.querySelectorAll("[data-render-start]").forEach((button) => { button.disabled = false })
  } catch {
    showError(new Error("Não foi possível ler a narração WAV deste projeto."))
  }
}
