// Exporta o vídeo 3D do kit direto no navegador.
//
// A página é aberta pelo Studio num iframe (mesma origem) e recebe:
//   { type: "render-start", storyboard, words, audio, titulo }
// O player do kit é importado sem alterações; um fetch virtual entrega o
// storyboard e as palavras. Cada quadro é composto (WebGL + textos/legendas)
// num canvas 2D e codificado com WebCodecs através do Mediabunny.

import {
  Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat,
  CanvasSource, AudioBufferSource, Quality,
  getFirstEncodableVideoCodec, getFirstEncodableAudioCodec,
} from "/kit/vendor/mediabunny.min.mjs"

const parentOrigin = location.origin
const send = (type, data = {}, transfer = []) => parent.postMessage({ type, ...data }, parentOrigin, transfer)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let cancelled = false

addEventListener("message", (event) => {
  if (event.origin !== parentOrigin) return
  if (event.data?.type === "kit-cancel") cancelled = true
})

let started = false
const start = (job) => {
  if (started) return
  started = true
  run(job).catch((error) => {
    console.error(error)
    send("kit-error", { error: error?.message || String(error) })
  })
}
window.__kitStart = start

// Testes locais (puppeteer) podem injetar o trabalho sem iframe.
if (location.search.includes("test=1")) {
  // O teste chama window.__kitStart(job) diretamente.
} else {
  addEventListener("message", function onMessage(event) {
    if (event.origin !== parentOrigin || event.data?.type !== "render-start") return
    removeEventListener("message", onMessage)
    start(event.data)
  })
}
send("kit-ready")

async function run(job) {
  const storyboard = job.storyboard
  const words = Array.isArray(job.words) ? job.words : []
  if (!storyboard?.cenas?.length) throw new Error("O plano de cenas está vazio.")

  const query = new URLSearchParams(location.search)
  const preview = query.get("previa") === "1"
  if (preview) {
    storyboard.formato = {
      ...(storyboard.formato || {}),
      largura: 540,
      altura: 960,
      fps: 24,
    }
  }

  // O player busca /<projeto>/storyboard.json e /<projeto>/<palavras>.
  const json = (value) => Promise.resolve(new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  }))
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url
    try {
      const path = new URL(url, location.href).pathname
      if (path === "/virtual/storyboard.json") return json(storyboard)
      if (path === "/virtual/palavras.json") return json(words)
    } catch { /* deixa o fetch normal tratar */ }
    return nativeFetch(input, init)
  }

  send("kit-stage", { message: "Carregando o motor 3D", pct: 0.01 })
  await import("/kit/engine/player.js")
  if (window.__erro) throw new Error(window.__erro)
  if (!window.__pronto) {
    for (let i = 0; i < 1200 && !window.__pronto; i++) await sleep(50)
  }
  if (!window.__pronto) throw new Error("O motor 3D não terminou de carregar.")

  const info = window.__info
  const W = info.largura
  const H = info.altura
  const fps = info.fps
  const duration = info.duracao
  const total = Math.max(1, Math.ceil(duration * fps))

  // Canvas de composição (WebGL + camadas HTML)
  const tela = document.getElementById("tela")
  const palco = document.getElementById("palco")
  const frame = document.createElement("canvas")
  frame.width = W
  frame.height = H
  const ctx = frame.getContext("2d", { alpha: false })
  const bitmapCache = new Map()

  const fontOf = (style) => `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize} ${style.fontFamily}`
  const px = (value, fallback = 0) => {
    const number = Number.parseFloat(value)
    return Number.isFinite(number) ? number : fallback
  }
  const layoutRect = (element) => ({
    x: element.offsetLeft,
    y: element.offsetTop,
    w: element.offsetWidth,
    h: element.offsetHeight,
  })

  // Aplica a transformação CSS do elemento (usada pelo motor para escalar,
  // girar e animar textos e setas) ao contexto 2D.
  const applyTransform = (element, rect) => {
    const transform = getComputedStyle(element).transform
    if (!transform || transform === "none") return
    const matrix = new DOMMatrix(transform)
    const origin = getComputedStyle(element).transformOrigin.split(" ").map(Number.parseFloat)
    const ox = origin[0] || 0
    const oy = origin[1] || 0
    ctx.translate(rect.x + ox, rect.y + oy)
    ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
    ctx.translate(-(rect.x + ox), -(rect.y + oy))
  }

  const roundedRect = (x, y, width, height, radius) => {
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, Math.max(0, radius))
    else ctx.rect(x, y, width, height)
  }

  const wrapLines = (text, maxWidth) => {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const lines = []
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`
      if (ctx.measureText(candidate).width <= maxWidth) line = candidate
      else { lines.push(line); line = words[i] }
    }
    lines.push(line)
    return lines
  }

  const drawTextBlock = (element) => {
    const style = getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || px(style.opacity, 1) <= 0.001) return
    const rect = layoutRect(element)
    if (!rect.w || !rect.h) return
    ctx.save()
    ctx.globalAlpha *= px(style.opacity, 1)
    applyTransform(element, rect)

    const radius = px(style.borderTopLeftRadius)
    const background = style.backgroundColor
    if (background && background !== "rgba(0, 0, 0, 0)" && background !== "transparent") {
      const shadow = /rgba?\([^)]+\)\s+0px\s+(\d+)px/.exec(style.boxShadow || "")
      if (shadow) {
        ctx.fillStyle = "rgba(0,0,0,.35)"
        roundedRect(rect.x, rect.y + Number(shadow[1]), rect.w, rect.h, radius)
        ctx.fill()
      }
      ctx.fillStyle = background
      roundedRect(rect.x, rect.y, rect.w, rect.h, radius)
      ctx.fill()
    }

    const padLeft = px(style.paddingLeft)
    const padRight = px(style.paddingRight)
    const padTop = px(style.paddingTop)
    const padBottom = px(style.paddingBottom)
    const width = Math.max(1, rect.w - padLeft - padRight)
    const height = Math.max(1, rect.h - padTop - padBottom)
    ctx.font = fontOf(style)
    ctx.textAlign = style.textAlign === "left" ? "left" : style.textAlign === "right" ? "right" : "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = style.color || "#fff"
    ctx.lineJoin = "round"
    const strokeWidth = px(style.getPropertyValue("-webkit-text-stroke-width"))
    const strokeColor = style.getPropertyValue("-webkit-text-stroke-color") || "#000"
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth
      ctx.strokeStyle = strokeColor
    }
    const lineHeight = px(style.lineHeight, px(style.fontSize) * 1.2)
    const lines = wrapLines(element.textContent, width)
    const startY = rect.y + padTop + (height - lines.length * lineHeight) / 2 + lineHeight / 2
    const x = ctx.textAlign === "left" ? rect.x + padLeft : ctx.textAlign === "right" ? rect.x + rect.w - padRight : rect.x + rect.w / 2
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight
      if (strokeWidth > 0) ctx.strokeText(line, x, y)
      ctx.fillText(line, x, y)
    })
    ctx.restore()
  }

  const svgBitmap = async (svg) => {
    const markup = svg.outerHTML.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
    if (!bitmapCache.has(markup)) {
      bitmapCache.set(markup, createImageBitmap(new Blob([markup], { type: "image/svg+xml;charset=utf-8" })))
    }
    return bitmapCache.get(markup)
  }

  const drawElement = async (element) => {
    const style = getComputedStyle(element)
    if (style.display === "none" || style.visibility === "hidden" || px(style.opacity, 1) <= 0.001) return
    const rect = layoutRect(element)
    if (!rect.w || !rect.h) return
    ctx.save()
    ctx.globalAlpha *= px(style.opacity, 1)
    applyTransform(element, rect)

    if (element.classList.contains("etiqueta")) {
      const radius = Math.min(rect.h / 2, px(style.borderTopLeftRadius, rect.h / 2))
      ctx.fillStyle = style.backgroundColor || "#fff"
      roundedRect(rect.x, rect.y, rect.w, rect.h, radius)
      ctx.fill()
      const borderWidth = px(style.borderTopWidth)
      if (borderWidth > 0) {
        ctx.lineWidth = borderWidth
        ctx.strokeStyle = style.borderTopColor || "#111"
        roundedRect(rect.x, rect.y, rect.w, rect.h, radius)
        ctx.stroke()
      }
      const dot = element.querySelector(".ponto")
      if (dot) {
        const dotStyle = getComputedStyle(dot)
        const dotRect = layoutRect(dot)
        const radiusDot = Math.min(dotRect.w, dotRect.h) / 2
        const centerX = rect.x + dotRect.x + dotRect.w / 2
        const centerY = rect.y + dotRect.y + dotRect.h / 2
        ctx.beginPath()
        ctx.arc(centerX, centerY, radiusDot, 0, Math.PI * 2)
        ctx.fillStyle = dotStyle.backgroundColor || "#ffd60a"
        ctx.fill()
        ctx.lineWidth = px(dotStyle.borderTopWidth)
        ctx.strokeStyle = dotStyle.borderTopColor || "#111"
        ctx.stroke()
      }
      const label = element.querySelector("span:last-child")
      if (label) {
        const labelRect = layoutRect(label)
        const labelStyle = getComputedStyle(label)
        ctx.font = fontOf(labelStyle)
        ctx.fillStyle = labelStyle.color || "#111"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(label.textContent, rect.x + labelRect.x + labelRect.w / 2, rect.y + labelRect.y + labelRect.h / 2)
      }
    } else {
      const svg = element.querySelector("svg")
      if (svg) {
        try {
          const bitmap = await svgBitmap(svg)
          ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h)
        } catch { /* um ícone ausente não deve abortar o vídeo */ }
      }
    }
    ctx.restore()
  }

  const drawOverlay = async () => {
    const palcoRect = palco.getBoundingClientRect()
    for (const element of document.querySelectorAll("#elementos > .elemento")) await drawElement(element)
    for (const element of document.querySelectorAll("#textos > .texto")) drawTextBlock(element)

    const legenda = document.getElementById("legenda")
    const legendaStyle = getComputedStyle(legenda)
    if (legendaStyle.visibility !== "hidden" && px(legendaStyle.opacity, 1) > 0.001) {
      ctx.save()
      ctx.globalAlpha *= px(legendaStyle.opacity, 1)
      ctx.font = fontOf(legendaStyle)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const strokeWidth = px(legendaStyle.getPropertyValue("-webkit-text-stroke-width"))
      const strokeColor = legendaStyle.getPropertyValue("-webkit-text-stroke-color") || "#000"
      if (strokeWidth > 0) {
        ctx.lineWidth = strokeWidth
        ctx.strokeStyle = strokeColor
        ctx.lineJoin = "round"
      }
      for (const span of legenda.querySelectorAll("span")) {
        const box = span.getBoundingClientRect()
        if (!box.width || !box.height) continue
        const x = box.left - palcoRect.left + box.width / 2
        const y = box.top - palcoRect.top + box.height / 2
        ctx.fillStyle = getComputedStyle(span).color || "#fff"
        if (strokeWidth > 0) ctx.strokeText(span.textContent, x, y)
        ctx.fillText(span.textContent, x, y)
      }
      ctx.restore()
    }

    const fx = document.getElementById("fx")
    const fxStyle = getComputedStyle(fx)
    const fxOpacity = px(fxStyle.opacity, 0)
    if (fxOpacity > 0.001) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, fxOpacity)
      ctx.fillStyle = fxStyle.backgroundColor || "#fff"
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  }

  const drawFrame = async (t) => {
    window.renderAt(t)
    ctx.save()
    ctx.filter = "none"
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, W, H)
    const style = getComputedStyle(tela)
    if (style.filter && style.filter !== "none") ctx.filter = style.filter
    if (style.transform && style.transform !== "none") {
      const matrix = new DOMMatrix(style.transform)
      ctx.translate(W / 2, H / 2)
      ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
      ctx.translate(-W / 2, -H / 2)
    }
    ctx.drawImage(tela, 0, 0, W, H)
    ctx.restore()

    await drawOverlay()
  }

  // Deixa o teste inspecionar um quadro sem codificar tudo.
  window.__kitFrame = async (t) => {
    await drawFrame(t)
    return frame.toDataURL("image/png")
  }

  send("kit-stage", { message: "Preparando a codificação", pct: 0.03 })

  const videoQuality = new Quality({ bitrate: preview ? 4_000_000 : 8_000_000 })
  const audioQuality = new Quality({ bitrate: 192_000 })
  let chosen = null
  for (const format of [new Mp4OutputFormat(), new WebMOutputFormat()]) {
    const video = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: W, height: H, frameRate: fps, quality: videoQuality,
    })
    const audio = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), {
      numberOfChannels: 2, sampleRate: 48_000, quality: audioQuality,
    })
    if (video && audio) { chosen = { format, video, audio }; break }
  }
  if (!chosen) throw new Error("Este navegador não consegue codificar vídeo H.264/VP9 com áudio. Use Chrome ou Edge atualizado no computador.")
  const mime = chosen.format.mimeType ||
    (chosen.format instanceof Mp4OutputFormat ? "video/mp4" : "video/webm")
  send("kit-stage", {
    message: `Codificando ${chosen.video.toUpperCase()} + ${chosen.audio.toUpperCase()}`,
    pct: 0.05,
  })

  const output = new Output({ format: chosen.format, target: new BufferTarget() })
  const videoSource = new CanvasSource(frame, {
    codec: chosen.video,
    quality: videoQuality,
    keyFrameInterval: 2,
    latencyMode: "quality",
    hardwareAcceleration: "no-preference",
  })
  const audioSource = new AudioBufferSource({
    codec: chosen.audio,
    quality: audioQuality,
    transform: { numberOfChannels: 2, sampleRate: 48_000 },
  })
  output.addVideoTrack(videoSource, { frameRate: fps })
  output.addAudioTrack(audioSource)
  await output.start()

  // Áudio: decodifica o WAV e acrescenta antes dos quadros (track menor).
  const audioContext = new OfflineAudioContext(2, 48_000, 48_000)
  const audioBytes = job.audio instanceof ArrayBuffer ? job.audio : await job.audio.arrayBuffer()
  let audioBuffer
  try {
    audioBuffer = await audioContext.decodeAudioData(audioBytes.slice(0))
  } catch {
    throw new Error("Não foi possível ler a narração WAV para incluir no vídeo.")
  }
  const maxSamples = Math.ceil(duration * audioBuffer.sampleRate)
  if (audioBuffer.length > maxSamples) {
    const trimmed = new AudioBuffer({
      length: maxSamples,
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    })
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      trimmed.copyToChannel(audioBuffer.getChannelData(channel).subarray(0, maxSamples), channel)
    }
    audioBuffer = trimmed
  }
  await audioSource.add(audioBuffer)
  audioSource.close()

  const startedAt = performance.now()
  for (let i = 0; i < total; i++) {
    if (cancelled) {
      await output.cancel().catch(() => {})
      send("kit-cancelled")
      return
    }
    const t = i / fps
    await drawFrame(t)
    await videoSource.add(t, 1 / fps, { keyFrame: i === 0 })
    if (i % 5 === 0 || i === total - 1) {
      const elapsed = (performance.now() - startedAt) / 1000
      const done = i + 1
      send("kit-progress", {
        pct: 0.06 + (done / total) * 0.9,
        frame: done,
        total,
        message: `Renderizando quadro ${done} de ${total}`,
        eta: Math.max(0, (elapsed / done) * (total - done)),
      })
      await sleep(0)
    }
  }
  videoSource.close()

  send("kit-stage", { message: "Fechando o MP4", pct: 0.97 })
  await output.finalize()
  const buffer = output.target.buffer
  send("kit-stage", { message: "Vídeo pronto", pct: 1 })
  send("kit-done", {
    buffer,
    mime,
    width: W,
    height: H,
    fps,
    duration,
  }, [buffer])
}
