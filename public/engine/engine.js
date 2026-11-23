/* Motor de render determinístico do Studio.
   Todo o estado visual é função de t (segundos). Nada depende de relógio. */
(function () {
  const stage = document.getElementById("stage")
  const bg = document.getElementById("bg")
  const bg2 = document.getElementById("bg2")
  const fx = document.getElementById("fx")
  const grain = document.getElementById("grain")
  const flash = document.getElementById("flash")
  const caption = document.getElementById("caption")
  const ghost = document.getElementById("ghost")
  const progress = document.getElementById("progress")
  const pill = document.getElementById("pill")
  const badge = document.querySelector(".badge")
  const topbar = document.getElementById("topbar")
  const audio = document.getElementById("audio")

  const T = window.__TIMELINE__
  const D = T.duration
  const P = T.paleta
  const TYPO = T.tipografia
  const SCENES = T.scenes
  const CHUNKS = T.chunks

  document.documentElement.style.setProperty("--fundo", P.fundo)
  document.documentElement.style.setProperty("--primaria", P.primaria)
  document.documentElement.style.setProperty("--secundaria", P.secundaria)
  document.documentElement.style.setProperty("--destaque", P.destaque)
  document.documentElement.style.setProperty("--familia", TYPO.familia)
  document.documentElement.style.setProperty("--peso", String(TYPO.peso || 900))
  document.documentElement.style.setProperty("--caixa", TYPO.caixa || "uppercase")
  if (badge && T.canal) badge.textContent = T.canal

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3)
  const easeInOut = (x) => {
    x = clamp(x, 0, 1)
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
  }

  function sceneAt(t) {
    let active = SCENES[0]
    for (const s of SCENES) if (t >= s.start) active = s
    return active
  }

  function chunkAt(t) {
    if (!CHUNKS.length) return { chunk: { i: 0, start: 0, end: 0, words: [], enfase: [] }, index: 0 }
    if (t <= CHUNKS[0].start) return { chunk: CHUNKS[0], index: 0 }
    let idx = 0
    for (let i = 0; i < CHUNKS.length; i++) {
      if (CHUNKS[i].start <= t + 0.001) idx = i
      else break
    }
    return { chunk: CHUNKS[idx], index: idx }
  }

  function visibleFrom(t) {
    for (let i = 0; i < CHUNKS.length; i++) if (t < CHUNKS[i].start) return i
    return CHUNKS.length
  }

  const LINES = new Map()
  function linesOf(chunk) {
    const key = chunk.i
    if (LINES.has(key)) return LINES.get(key)
    const words = chunk.words
    const lines = []
    let cur = []
    let curLen = 0
    for (let i = 0; i < words.length; i++) {
      const w = words[i].w
      const len = w.replace(/\s/g, "").length
      if (cur.length && (curLen + len > 14 || cur.length >= 3)) {
        lines.push(cur)
        cur = []
        curLen = 0
      }
      cur.push(i)
      curLen += len + 1
    }
    if (cur.length) lines.push(cur)
    LINES.set(key, lines)
    return lines
  }

  let lastChunkIndex = -1
  function renderCaption(t) {
    const { chunk, index } = chunkAt(t)
    const lines = linesOf(chunk)
    if (lastChunkIndex !== chunk.i) {
      lastChunkIndex = chunk.i
      let html = ""
      let wi = 0
      for (const line of lines) {
        html += '<div class="line">'
        for (const wIndex of line) {
          const word = chunk.words[wIndex]
          const em = chunk.enfase && chunk.enfase.includes(wIndex) ? " em" : ""
          html += `<span class="w${em}" data-i="${wi}">${escapeHtml(word.w)}</span>`
          wi++
        }
        html += "</div>"
      }
      caption.innerHTML = html
      const maxLen = Math.max(...chunk.words.map((w) => w.w.length))
      caption.style.fontSize = maxLen > 13 ? "72px" : maxLen > 10 ? "86px" : maxLen > 7 ? "96px" : "108px"
    }

    const spans = caption.querySelectorAll(".w")
    const allWords = chunk.words
    let flat = 0
    // palavra ativa = última palavra cujo start <= t (dentro do bloco)
    let active = 0
    for (let i = 0; i < allWords.length; i++) if (t + 0.02 >= allWords[i].start) active = i

    for (let i = 0; i < spans.length; i++) {
      const w = allWords[flat]
      const span = spans[i]
      const age = t - w.start
      const isActive = flat === active
      const isPast = flat < active
      let scale = 1
      let opacity = 0.78
      if (isPast) opacity = 0.94
      if (isActive) {
        opacity = 1
        scale = 1 + 0.16 * (1 - easeOut(age / 0.22))
      }
      const sinceStart = t - chunk.start
      const pop = 1 + 0.06 * (1 - easeOut(sinceStart / 0.18))
      span.style.opacity = (opacity * (isActive ? 1 : 1)).toFixed(3)
      span.style.transform = `scale(${(scale * pop).toFixed(4)})`
      span.style.color = isActive ? "var(--destaque)" : ""
      span.style.webkitTextFillColor = isActive ? "var(--destaque)" : ""
      span.style.textShadow = isActive
        ? "0 0 34px rgba(255,255,255,.25), 0 10px 0 rgba(0,0,0,.95), 0 0 26px var(--destaque)"
        : ""
      flat++
    }

    // entrada do bloco
    const enter = 1 - easeOut((t - chunk.start) / 0.2)
    caption.style.transform = `translateY(${(enter * 26).toFixed(2)}px)`
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
  }

  function renderBackground(t, scene) {
    const p = D > 0 ? t / D : 0
    const seed = scene.index * 37
    const angle = 120 + Math.sin(t * 0.13 + seed) * 26
    const a = scene.fundo.cores[0] || P.fundo
    const b = scene.fundo.cores[1] || P.fundo
    const zoom = scene.fundo.movimento === "zoom" ? 1.02 + 0.09 * p : 1.06
    const rotate = scene.fundo.movimento === "pan" ? Math.sin(t * 0.1) * 2.2 : 0
    bg.style.background = `linear-gradient(${angle}deg, ${a}, ${b})`
    bg.style.transform = `scale(${zoom.toFixed(3)}) rotate(${rotate.toFixed(2)}deg)`
    const orbX = 50 + Math.sin(t * 0.21 + seed) * 26
    const orbY = 38 + Math.cos(t * 0.17 + seed) * 22
    bg2.style.background = `radial-gradient(38% 30% at ${orbX}% ${orbY}%, ${withAlpha(P.destaque, 0.55)}, transparent 70%)`
    bg2.style.filter = `blur(40px)`

    const tipo = scene.fundo.tipo
    if (tipo === "particulas") {
      const c = withAlpha(P.primaria, 0.5)
      fx.style.backgroundImage = `radial-gradient(2.2px 2.2px at 12% 18%, ${c}, transparent), radial-gradient(1.8px 1.8px at 62% 32%, ${c}, transparent), radial-gradient(2.6px 2.6px at 38% 72%, ${c}, transparent), radial-gradient(1.6px 1.6px at 82% 88%, ${c}, transparent), radial-gradient(2px 2px at 28% 46%, ${c}, transparent)`
      fx.style.backgroundSize = "420px 420px, 320px 320px, 520px 520px, 260px 260px, 380px 380px"
      fx.style.transform = `translate(${(-t * 14).toFixed(1)}px, ${(-t * 22).toFixed(1)}px)`
      fx.style.opacity = ".5"
      fx.style.filter = "none"
    } else if (tipo === "grid") {
      const l = withAlpha(P.secundaria, 0.28)
      fx.style.backgroundImage = `linear-gradient(${l} 1px, transparent 1px), linear-gradient(90deg, ${l} 1px, transparent 1px)`
      fx.style.backgroundSize = "120px 120px, 120px 120px"
      fx.style.transform = `perspective(900px) rotateX(58deg) translateY(${(t * 26) % 120}px)`
      fx.style.opacity = ".35"
      fx.style.filter = "none"
    } else if (tipo === "bokeh") {
      const a = withAlpha(P.destaque, 0.5)
      const b = withAlpha(P.primaria, 0.22)
      fx.style.backgroundImage = `radial-gradient(closest-side, ${a}, transparent), radial-gradient(closest-side, ${b}, transparent), radial-gradient(closest-side, ${a}, transparent)`
      fx.style.backgroundSize = "520px 520px, 340px 340px, 680px 680px"
      fx.style.backgroundPosition = `${20 + Math.sin(t * 0.3) * 8}% ${30 + Math.cos(t * 0.24) * 6}%, 70% 60%, 40% 85%`
      fx.style.filter = "blur(26px)"
      fx.style.opacity = ".55"
      fx.style.transform = "none"
    } else {
      fx.style.backgroundImage = "none"
    }

    grain.style.transform = `translate(${(t * 31) % 220 - 110}px, ${(t * 47) % 220 - 110}px)`

    // flash de transição
    let f = 0
    if (scene.transicao === "flash") {
      const dt = t - scene.start
      f = dt < 0.22 ? 1 - easeOut(dt / 0.22) : 0
    }
    flash.style.opacity = (f * 0.55).toFixed(3)

    // elemento fantasma (número grande ou ícone)
    const el = scene.elemento
    const ICONES = {
      eye: "👁", lock: "🔒", question: "❓", alert: "⚠️", "chart-down": "📉",
      fire: "🔥", brain: "🧠", money: "💰", clock: "⏳", star: "★",
    }
    if (el && el.tipo === "numero" && el.valor) {
      ghost.textContent = el.valor
      ghost.style.fontSize = "760px"
      ghost.style.opacity = "0.10"
    } else if (el && el.tipo === "icone" && el.valor) {
      ghost.textContent = ICONES[el.valor] || ""
      ghost.style.fontSize = "420px"
      ghost.style.opacity = "0.14"
    } else {
      ghost.style.opacity = "0"
    }
    ghost.style.transform = `scale(${(1.02 + 0.04 * Math.sin(t * 0.4)).toFixed(3)})`

    if (el && el.tipo === "barra" && el.valor) {
      pill.textContent = el.valor
      const dt = t - scene.start
      pill.style.opacity = String(Math.min(1, dt / 0.25) * 0.95)
      pill.style.transform = `translateX(-50%) translateY(${(1 - easeOut(dt / 0.3)) * -12}px)`
    } else {
      pill.style.opacity = "0"
    }

    progress.style.width = `${(clamp(p, 0, 1) * 100).toFixed(2)}%`

    // selo do topo com emoção
    const caps = { choque: "IMPACTO", curiosidade: "CURIOSIDADE", tensao: "TENSÃO", revelacao: "REVELAÇÃO", cta: "SIGA" }
    topbar.textContent = caps[scene.emocao] || ""
    topbar.style.opacity = t < 1.2 ? String(clamp(t / 0.6, 0, 1) * 0.6) : "0.6"
  }

  function withAlpha(hex, a) {
    const h = hex.replace("#", "")
    const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
    const r = parseInt(n.slice(0, 2), 16)
    const g = parseInt(n.slice(2, 4), 16)
    const b = parseInt(n.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  function renderAt(t) {
    t = clamp(t, 0, D)
    const scene = sceneAt(t)
    renderBackground(t, scene)
    renderCaption(t)

    // entrada de cena
    let s = 1
    let tx = 0
    if (scene.transicao === "zoom") s = 1 + 0.18 * (1 - easeOut((t - scene.start) / 0.3))
    if (scene.transicao === "deslize") tx = 90 * (1 - easeOut((t - scene.start) / 0.32))
    caption.style.scale = String(s)
    caption.style.translate = `${tx}px 0`
    if (t < 0.001) caption.style.opacity = "0"
    else caption.style.opacity = "1"
  }

  function setTime(t) {
    renderAt(t)
    try {
      if (audio && Math.abs(audio.currentTime - t) > 0.05) audio.currentTime = t
    } catch (_) {}
  }

  let raf = 0
  function tick() {
    if (!audio.paused && !audio.ended) {
      renderAt(audio.currentTime)
      raf = requestAnimationFrame(tick)
    }
  }

  function play() {
    try {
      audio.currentTime = 0
    } catch (_) {}
    audio.play().then(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    })
  }

  audio.addEventListener("play", () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tick)
  })

  window.__STUDIO__ = {
    duration: D,
    ready: false,
    setTime,
    play,
    tick: renderAt,
  }

  function boot() {
    try {
      if (TYPO.url) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = TYPO.url
        document.head.appendChild(link)
      }
    } catch (_) {}
    // estado 0 desenhado; libera o renderizador após fontes
    renderAt(0)
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
    ready.then(() => {
      renderAt(0)
      window.__STUDIO__.ready = true
    })
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()
})()
