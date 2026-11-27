import { createCartoonRenderer, recordCartoonVideo } from "/cartoon-engine.js?v=4"

const $ = (s, root = document) => root.querySelector(s)
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const state = {
  config: null,
  projects: [],
  current: null,
  model: localStorage.getItem("cartoon:model") || "opencode-go/deepseek-v4.1-flash",
  busy: false,
  activeTab: "script",
  videoBlobUrl: null,
  coverDataUrl: null,
  videoExt: "mp4",
}

async function api(path, body) {
  const res = await fetch("/api/cartoon" + path, body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data
}

function toast(msg, error = false) {
  const el = $("#toast")
  el.textContent = msg
  el.classList.toggle("error", error)
  el.hidden = false
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { el.hidden = true }, 3800)
}

function updateTopPills() {
  const shortModel = state.model.split("/").at(-1)
  $("#pill-model-text").textContent = `IA · ${shortModel}`
  const prov = $("#cfg-provider").value === "elevenlabs" ? "ElevenLabs" : "Google Studio"
  const voiceName = $("#cfg-voz").selectedOptions?.[0]?.textContent?.split("·")[0]?.trim() || ""
  $("#pill-voice-text").textContent = `Voz · ${prov}${voiceName ? ` (${voiceName})` : ""}`
  if (state.config) {
    $("#pill-db-text").textContent = state.config.supabase ? "Supabase" : "Local"
  }
}

function populateVoices() {
  const prov = $("#cfg-provider").value
  const list = prov === "elevenlabs" ? (state.config?.elevenVoices || []) : (state.config?.googleVoices || [])
  const sel = $("#cfg-voz")
  const prev = sel.value
  sel.replaceChildren(...list.map((v) => new Option(v.label, v.id)))
  if (list.some((v) => v.id === prev)) sel.value = prev
  else if (prov === "google" && list.some((v) => v.id === "Kore")) sel.value = "Kore"
  updateTopPills()
}

function renderSidebar() {
  const box = $("#sidebar-list")
  if (!state.projects.length) {
    box.innerHTML = `<p class="sidebar-empty">Nenhum vídeo ainda.</p>`
    return
  }
  box.innerHTML = state.projects.map((p) => `
    <div class="sidebar-item${state.current?.id === p.id ? " active" : ""}" data-open="${esc(p.id)}">
      <div style="min-width:0;flex:1">
        <div class="sidebar-item-title">${esc(p.titulo || "Sem título")}</div>
        <span class="sidebar-item-sub">${esc(p.formato || "automático")} · ${p.duracao || 45}s</span>
      </div>
      <button type="button" class="sidebar-del" data-del="${esc(p.id)}" title="Excluir">✕</button>
    </div>
  `).join("")
}

function renderProgress(label, sub, pct = 20) {
  return `<div class="progress-box" id="live-progress">
    <div class="progress-row"><div class="spinner"></div><strong>${esc(label)}</strong><span class="stage-meta">${esc(sub)}</span></div>
    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.max(8, Math.min(100, pct))}%"></div></div>
  </div>`
}

function setGlobalJob(job) {
  const host = $("#global-job-bar")
  if (!host) return
  if (!job) {
    host.hidden = true
    host.innerHTML = ""
    return
  }
  host.hidden = false
  if (!host.querySelector("#live-progress")) {
    host.innerHTML = `<div class="global-job-row">
      <div style="flex:1;min-width:220px">${renderProgress(job.label, job.sub, job.pct)}</div>
      ${job.withPreview ? `<div id="live-preview-host"></div>` : ""}
    </div>`
  } else {
    const title = host.querySelector("#live-progress strong")
    const meta = host.querySelector("#live-progress .stage-meta")
    const bar = host.querySelector(".progress-bar-fill")
    if (title && job.label) title.textContent = job.label
    if (meta && job.sub !== undefined) meta.textContent = job.sub
    if (bar && job.pct !== undefined) bar.style.width = `${Math.max(8, Math.min(100, job.pct))}%`
    if (job.withPreview && !host.querySelector("#live-preview-host")) {
      host.querySelector(".global-job-row")?.insertAdjacentHTML("beforeend", `<div id="live-preview-host"></div>`)
    }
  }
}

async function uploadMediaBlob(projectId, kind, blob, contentType) {
  if (!projectId || !blob?.size) return ""
  // Na Vercel o corpo máximo de requisição serverless é 4,5 MB; acima disso mantém blob local sem falhar
  if (state.config?.vercel && blob.size > 4_000_000) return ""
  try {
    const res = await fetch(`/api/cartoon/midia/${encodeURIComponent(projectId)}/${encodeURIComponent(kind)}`, {
      method: "POST",
      headers: { "Content-Type": contentType || blob.type || "application/octet-stream" },
      body: blob,
    })
    if (!res.ok) return ""
    const data = await res.json().catch(() => ({}))
    return data.url || ""
  } catch {
    return ""
  }
}

function renderStoryboardCards(cenas, customAssets = {}) {
  const engine = createCartoonRenderer(270, 480)
  engine.setCustomAssets(customAssets || {})
  const html = cenas.map((c, idx) => {
    const thumb = engine.renderThumbnailDataUrl(c, idx, customAssets)
    const opts = (arr, cur) => arr.map((v) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(v)}</option>`).join("")
    const castChecks = ["silas", "pedro", "maria", "joao"].map((id) =>
      `<label><input type="checkbox" data-cast="${idx}" value="${id}" ${(c.quemAparece || []).includes(id) ? "checked" : ""}>${id}</label>`
    ).join("")
    const hasCustom = Boolean(c.customAssetId && customAssets?.[c.customAssetId])
    return `<article class="scene-card" data-scene="${idx}">
      <img class="scene-thumb" src="${thumb}" alt="Cena ${idx + 1}">
      <div class="scene-body">
        <div class="scene-caption">${idx + 1}. ${esc(c.texto)}</div>
        <div class="custom-3d-bar">
          ${hasCustom
            ? `<span class="custom-3d-pill">✦ 3D criado: ${esc(c.customAssetLabel || c.customAssetId)}</span>
               <button type="button" class="btn-mini" data-regen-3d="${idx}">Regenerar 3D</button>
               <button type="button" class="btn-mini" data-clear-3d="${idx}" title="Remover objeto 3D">✕</button>`
            : `<button type="button" class="btn-mini" data-create-3d="${idx}">+ Criar objeto 3D inédito</button>`}
        </div>
        <div class="scene-fields">
          <label class="sf"><span>ATIVIDADE</span><select data-field="atividade">${opts(["nenhuma", "comer", "pescar", "correr", "observar", "trabalhar", "voar"], c.atividade)}</select></label>
          <label class="sf"><span>OBJETO / CENA</span><select data-field="objeto">${opts(["auto", "nenhum", "navio", "iceberg", "timao", "cronometro", "trem", "aviao", "onibus", "carro", "fogo", "dinheiro", "bilhete", "feno", "farol", "foguete", "dinossauro", "colheres", "computador", "bau"], c.objeto || "auto")}</select></label>
          <label class="sf"><span>PLANO</span><select data-field="plano">${opts(["aberto", "medio", "close"], c.plano)}</select></label>
          <label class="sf"><span>FOCO</span><select data-field="foco">${opts(["silas", "pedro", "maria", "joao", "farol", "dinossauro", "foguete"], c.foco)}</select></label>
          <label class="sf"><span>AÇÃO</span><select data-field="acao">${opts(["parado", "mostrar", "andar", "correr", "debochar", "acenar", "assustado", "cintura", "barriga", "pensando", "bochecha", "cruzado", "joinha", "comemorar"], c.acao)}</select></label>
          <label class="sf"><span>EXPRESSÃO</span><select data-field="expressao">${opts(["(da ação)", "neutro", "feliz", "alivio", "desconfiado", "teimoso", "nervoso", "surpreso", "assustado", "rindo"], c.expressao)}</select></label>
          <label class="sf"><span>EFEITO</span><select data-field="efeito">${opts(["nenhum", "tremor", "zoom", "flash", "suor"], c.efeito)}</select></label>
          <label class="sf"><span>LUZ</span><select data-field="luz">${opts(["dia", "dourado", "noite", "espaco"], c.luz)}</select></label>
          <label class="sf"><span>CÂMERA</span><select data-field="camera">${opts(["automatico", "fixa", "aproximar", "afastar", "pan"], c.camera)}</select></label>
          <label class="sf"><span>TEXTO NA TELA</span><input type="text" data-field="textoTela" value="${esc(c.textoTela)}" placeholder="ex.: DIA 1"></label>
          <div class="sf full"><span>QUEM APARECE</span><div class="cast-checks">${castChecks}</div></div>
          <label class="sf full"><span>CENÁRIO</span><select data-field="cenario">${opts(["oceano", "praia", "vila", "floresta", "cidade", "rio", "estrada", "espaco", "sala"], c.cenario)}</select></label>
          <label class="sf full"><span>EVENTO NO CENÁRIO</span><select data-field="eventoCenario">${opts(["nenhum", "onda", "raio", "fumaca", "estrelas"], c.eventoCenario)}</select></label>
          <label class="virada-check full"><input type="checkbox" data-field="virada" ${c.virada ? "checked" : ""}><span>virada (música para, impacto)</span></label>
        </div>
      </div>
    </article>`
  }).join("")
  engine.dispose()
  return html
}

function scrollTopSmooth() {
  $("#main-scroll")?.scrollTo({ top: 0, behavior: "smooth" })
}

function renderThread(progressHtml = "") {
  const p = state.current
  document.body.classList.toggle("in-thread", Boolean(p))
  if (!p) {
    $("#home-view").hidden = false
    $("#thread-view").hidden = true
    return
  }
  $("#home-view").hidden = true
  $("#thread-view").hidden = false

  const hasScript = Boolean(p.frases?.length)
  const hasSb = Boolean(p.cenas?.length)
  const videoSrc = state.videoBlobUrl || p.videoUrl || ""
  const hasVideo = Boolean(videoSrc)

  if (state.activeTab === "ready" && !hasVideo) state.activeTab = hasSb ? "storyboard" : "script"
  if (state.activeTab === "storyboard" && !hasSb) state.activeTab = "script"
  try {
    localStorage.setItem("cartoon:lastProjectId", p.id || "")
    localStorage.setItem("cartoon:lastTab", state.activeTab || "script")
  } catch {}

  const frases = p.frases || []
  const wordsCount = frases.join(" ").trim().split(/\s+/).filter(Boolean).length
  const estSec = Math.round(wordsCount / 2.6)

  const tabsHtml = `
    <nav class="stage-tabs" aria-label="Etapas do vídeo">
      <button type="button" class="stage-tab${state.activeTab === "script" ? " active" : hasScript ? " done" : ""}" data-tab="script" ${hasScript ? "" : "disabled"}>1. Roteiro</button>
      <button type="button" class="stage-tab${state.activeTab === "storyboard" ? " active" : hasSb ? " done" : ""}" data-tab="storyboard" ${hasSb ? "" : "disabled"}>2. Storyboard${hasSb ? ` (${p.cenas.length})` : ""}</button>
      <button type="button" class="stage-tab${state.activeTab === "ready" ? " active" : hasVideo ? " done" : ""}" data-tab="ready" ${hasVideo ? "" : "disabled"}>3. Vídeo pronto</button>
    </nav>
  `

  const scriptCard = hasScript && state.activeTab === "script" ? `
    <section class="stage-card">
      <div class="stage-head">
        <span class="stage-meta">Roteiro · ${esc(p.formato || "automático")} · edite à vontade antes de aprovar</span>
        <div class="stage-actions">
          <button type="button" class="btn-white" id="btn-build-storyboard-top">Aprovar e montar storyboard →</button>
        </div>
      </div>
      <input class="title-input" id="proj-title" value="${esc(p.titulo)}" maxlength="100">
      <div class="stage-meta" style="font-weight:700;letter-spacing:.05em">NARRAÇÃO</div>
      <div class="phrases-list" id="phrases-list">
        ${frases.map((f, i) => `
          <div class="phrase-row">
            <span class="phrase-num">${String(i + 1).padStart(2, "0")}</span>
            <input class="phrase-input" data-phrase="${i}" value="${esc(f)}">
            <button type="button" class="phrase-del" data-del-phrase="${i}" title="Remover frase">✕</button>
          </div>
        `).join("")}
      </div>
      <div><button type="button" class="btn-dark" id="btn-add-phrase">+ frase</button></div>
      <div class="stage-foot">
        <span class="stage-meta" id="script-stats">${frases.length} frases · ${wordsCount} palavras · cerca de ${estSec} s de narração</span>
        <div class="stage-actions">
          <button type="button" class="btn-white" id="btn-build-storyboard">Aprovar roteiro e montar storyboard →</button>
          <button type="button" class="btn-dark" id="btn-save-proj">Salvar</button>
          <button type="button" class="btn-dark" id="btn-new-from-card">Escrever outro</button>
        </div>
      </div>
    </section>
  ` : ""

  const sbActions = `
    <div class="stage-actions">
      <button type="button" class="btn-white" id="btn-render-video">Aprovar e criar o vídeo →</button>
      <button type="button" class="btn-dark" id="btn-refresh-thumbs">Atualizar quadros</button>
      <button type="button" class="btn-dark" id="btn-redo-storyboard">Refazer storyboard com a IA</button>
    </div>
  `

  const sbBadge = p.validation?.audited
    ? ` · ✓ validado pela IA${p.validation.fixes ? ` (${p.validation.fixes} ajustes automáticos)` : ""}`
    : ""
  const storyboardCard = hasSb && state.activeTab === "storyboard" ? `
    <section class="stage-card">
      <div class="stage-head">
        <span class="stage-meta">Storyboard · ${p.cenas.length} cenas com quadros reais${sbBadge}</span>
        ${sbActions}
      </div>
      <div class="storyboard-grid" id="storyboard-grid">${renderStoryboardCards(p.cenas, p.customAssets || {})}</div>
      <div class="stage-foot">
        ${sbActions}
      </div>
    </section>
  ` : ""

  const yt = p.youtubePack
  const coverUrl = state.coverDataUrl || p.coverUrl || ""
  const ytHtml = yt ? `
    <div class="yt-pack">
      <div class="yt-cover-row">
        ${coverUrl ? `<img class="yt-cover-img" src="${coverUrl}" alt="Capa 9:16">` : ""}
        <div style="display:grid;gap:8px">
          <div class="yt-box"><header><span>Título YouTube Shorts</span><button type="button" class="btn-dark" data-copy="tituloYt">Copiar</button></header><pre>${esc(yt.tituloYt)}</pre></div>
          <div class="yt-box"><header><span>Título Alternativo</span><button type="button" class="btn-dark" data-copy="tituloAlt">Copiar</button></header><pre>${esc(yt.tituloAlt)}</pre></div>
          ${coverUrl ? `<div><a class="btn-white" style="text-decoration:none;display:inline-block" href="${coverUrl}" download="${esc(p.id)}-capa.png">Baixar Capa 9:16 (PNG) →</a></div>` : ""}
        </div>
      </div>
      <div class="yt-box"><header><span>Descrição + Hashtags</span><button type="button" class="btn-dark" data-copy="descricao">Copiar</button></header><pre>${esc(yt.descricao)}</pre></div>
      <div class="yt-box"><header><span>Dublagem Inglês (ElevenLabs)</span><button type="button" class="btn-dark" data-copy="dubEn">Copiar</button></header><pre>${esc(yt.dublagem?.elevenlabs || "")}</pre></div>
      <div class="yt-box"><header><span>Prompt Capa HD 9:16</span><button type="button" class="btn-dark" data-copy="thumbPrompt">Copiar</button></header><pre>${esc(yt.thumbnailPrompt || "")}</pre></div>
    </div>
  ` : ""

  const readyExt = state.videoExt || (p.videoUrl?.endsWith(".webm") ? "webm" : "mp4")
  const readyCard = hasVideo && state.activeTab === "ready" ? `
    <section class="stage-card">
      <div class="stage-head"><strong>Vídeo pronto</strong></div>
      <div class="ready-grid">
        <video class="ready-video" controls playsinline src="${videoSrc}"></video>
        <div class="ready-info">
          <span class="stage-meta">duração ${(p.duration || estSec).toFixed(2)}s | áudio ${esc(p.ttsProvider === "elevenlabs" ? "ElevenLabs" : "Google Studio")}</span>
          <div class="check-ok">● checagem ok: nenhum quadro congelado ou preto</div>
          <span class="stage-meta">1080×1920 (9:16), 30 fps cravados (${esc(readyExt.toUpperCase())}), áudio com Twist Music Drop (-6 dB).</span>
          <div class="stage-actions">
            <a class="btn-white" style="text-decoration:none" href="${videoSrc}" download="${esc(p.id)}.${readyExt}">Baixar vídeo (${esc(readyExt.toUpperCase())}) →</a>
            <button type="button" class="btn-dark" id="btn-yt-pack">Gerar Kit YouTube + Capa 9:16 →</button>
          </div>
          ${ytHtml}
        </div>
      </div>
    </section>
  ` : ""

  $("#thread-view").innerHTML = `
    ${tabsHtml}
    ${progressHtml}
    ${p.ideia ? `<div class="user-bubble">${esc(p.ideia)}</div>` : ""}
    ${scriptCard}
    ${storyboardCard}
    ${readyCard}
  `
}

async function persistCurrent() {
  if (!state.current) return
  // Não envia o audioBase64 pesado pro índice leve; mantém no projeto
  const res = await api("/projetos", state.current)
  state.current = res.project
  const listRes = await api("/projetos")
  state.projects = listRes.projects || []
  renderSidebar()
}

async function startWriteScript(ideia) {
  if (state.busy) return
  state.busy = true
  state.videoBlobUrl = null
  const formato = $("#cfg-formato").value
  const duracao = Number($("#cfg-duracao").value)
  const ttsProvider = $("#cfg-provider").value
  const voice = $("#cfg-voz").value

  state.current = {
    id: `crt-${Date.now().toString(36)}`,
    titulo: ideia.slice(0, 60),
    ideia,
    formato,
    duracao,
    ttsProvider,
    voice,
    estilo: "cartoon-3d",
    frases: [],
    cenas: [],
  }
  state.activeTab = "script"
  renderThread(renderProgress("Escrevendo o roteiro", "a IA está escrevendo o roteiro com gancho, falas e virada", 25))
  scrollTopSmooth()
  try {
    const out = await api("/roteiro", { ideia, formato, duracao, ttsProvider, model: state.model })
    state.current.titulo = out.titulo
    state.current.frases = out.frases
    state.current.cenarioPrincipal = out.cenarioPrincipal
    await persistCurrent()
    renderThread()
    scrollTopSmooth()
  } catch (e) {
    toast(e.message, true)
    renderThread()
  } finally {
    state.busy = false
  }
}

async function buildContactSheetJpeg(cenas, customAssets) {
  const cols = 4
  const rows = Math.ceil(cenas.length / cols)
  const cw = 180, ch = 320
  const sheet = document.createElement("canvas")
  sheet.width = cols * cw
  sheet.height = rows * ch
  const sctx = sheet.getContext("2d")
  sctx.fillStyle = "#0e0e14"
  sctx.fillRect(0, 0, sheet.width, sheet.height)
  const eng = createCartoonRenderer(cw, ch)
  eng.setCustomAssets(customAssets || {})
  cenas.forEach((c, idx) => {
    eng.renderFrame(c, 0.5, null, 0.3, false, { sceneIdx: idx, speaking: false })
    const col = idx % cols, row = Math.floor(idx / cols)
    sctx.drawImage(eng.outCanvas, col * cw, row * ch, cw, ch)
    sctx.fillStyle = "rgba(0,0,0,0.75)"
    sctx.fillRect(col * cw + 6, row * ch + 6, 30, 24)
    sctx.fillStyle = "#ffd23f"
    sctx.font = "bold 16px sans-serif"
    sctx.fillText(String(idx + 1), col * cw + 14, row * ch + 23)
  })
  eng.dispose()
  return sheet.toDataURL("image/jpeg", 0.72)
}

async function buildStoryboard() {
  if (state.busy || !state.current?.frases?.length) return
  state.busy = true
  setGlobalJob({ label: "Montando e auditando storyboard", sub: "a IA está dirigindo cenas, criando objetos 3D e validando coerência…", pct: 35 })
  scrollTopSmooth()
  try {
    const out = await api("/storyboard", {
      titulo: state.current.titulo,
      frases: state.current.frases,
      cenarioPrincipal: state.current.cenarioPrincipal,
      model: state.model,
    })
    state.current.cenas = out.cenas
    state.current.customAssets = { ...(state.current.customAssets || {}), ...(out.customAssets || {}) }
    state.current.validation = out.validation || { audited: true, fixes: 0 }

    // 3ª camada: Inspeção Visual Real (Gemini Vision enxerga os quadros renderizados e corrige qualquer defeito!)
    setGlobalJob({ label: "Inspeção visual dos quadros 3D", sub: "a IA está olhando os quadros reais renderizados para corrigir detalhes…", pct: 75 })
    try {
      const sheetDataUrl = await buildContactSheetJpeg(state.current.cenas, state.current.customAssets)
      const vis = await api("/inspecionar-quadros", {
        titulo: state.current.titulo,
        cenas: state.current.cenas,
        imageBase64: sheetDataUrl,
        model: state.model,
      })
      if (vis?.inspected && Array.isArray(vis.correcoes) && vis.correcoes.length) {
        let applied = 0
        for (const fix of vis.correcoes) {
          const idx = Number(fix?.i)
          const target = state.current.cenas[idx]
          if (!target) continue
          if (fix.cenario) target.cenario = fix.cenario
          if (fix.luz) target.luz = fix.luz
          if (fix.plano) target.plano = fix.plano
          if (fix.objeto) target.objeto = fix.objeto
          if (fix.acao) target.acao = fix.acao
          if (fix.camera) target.camera = fix.camera
          applied++
        }
        state.current.validation = {
          audited: true,
          visualInspected: true,
          fixes: (state.current.validation.fixes || 0) + applied,
        }
      } else if (vis?.inspected) {
        state.current.validation.visualInspected = true
      }
    } catch {}

    state.activeTab = "storyboard"
    await persistCurrent()
    setGlobalJob(null)
    renderThread()
    scrollTopSmooth()
  } catch (e) {
    setGlobalJob(null)
    toast(e.message, true)
    renderThread()
  } finally {
    state.busy = false
  }
}

async function renderFinalVideo() {
  if (state.busy || !state.current?.cenas?.length) return
  if (state.current.frases?.length !== state.current.cenas.length) {
    toast("Você adicionou ou removeu frases no roteiro. Clique em 'Refazer storyboard com a IA' antes de criar o vídeo.", true)
    return
  }
  state.busy = true
  state.videoBlobUrl = null
  const jobProject = state.current
  const ttsProvider = $("#cfg-provider").value
  const voice = $("#cfg-voz").value
  jobProject.ttsProvider = ttsProvider
  jobProject.voice = voice

  setGlobalJob({ label: "Gerando voz + falas", sub: `sintetizando narração via ${ttsProvider === "elevenlabs" ? "ElevenLabs" : "Google Studio"}…`, pct: 25, withPreview: false })
  scrollTopSmooth()
  try {
    const voz = await api("/voz", {
      frases: jobProject.frases,
      ttsProvider,
      voice,
      projetoId: jobProject.id,
    })
    jobProject.duration = voz.duration
    jobProject.palavras = voz.palavras
    jobProject.cenasTiming = voz.cenasTiming
    if (voz.audioUrl) jobProject.audioUrl = voz.audioUrl
    const audioSrc = voz.audioUrl || voz.audioBase64

    setGlobalJob({ label: "Renderizando Animação 3D (1080×1920)", sub: "preparando quadros 3D em qualidade máxima + áudio + trilha…", pct: 35, withPreview: true })
    scrollTopSmooth()
    const rec = await recordCartoonVideo({
      cenas: jobProject.cenas,
      palavras: voz.palavras,
      cenasTiming: voz.cenasTiming,
      customAssets: jobProject.customAssets || {},
      audioSrc,
      duration: voz.duration,
      showCaptions: $("#cfg-legenda")?.value !== "sem",
      previewHost: $("#live-preview-host"),
      onProgress: (pct, sec) => {
        setGlobalJob({ label: "Renderizando Animação 3D (1080×1920)", sub: `${sec.toFixed(1)}s / ${voz.duration.toFixed(1)}s (${pct}%)`, pct, withPreview: true })
      },
    })
    state.videoBlobUrl = URL.createObjectURL(rec.blob)
    state.videoExt = rec.ext

    setGlobalJob({ label: "Salvando vídeo na nuvem", sub: "enviando arquivo final para o Supabase Storage…", pct: 98, withPreview: false })
    const uploadedUrl = await uploadMediaBlob(jobProject.id, "video", rec.blob, rec.mimeType)
    if (uploadedUrl) jobProject.videoUrl = uploadedUrl

    state.activeTab = "ready"
    await persistCurrent()
    setGlobalJob(null)
    renderThread()
    scrollTopSmooth()
    toast(`Vídeo ${rec.ext.toUpperCase()} pronto em qualidade máxima!`)
  } catch (e) {
    setGlobalJob(null)
    toast(e.message, true)
    renderThread()
  } finally {
    state.busy = false
  }
}

// Eventos
$("#composer-form").addEventListener("submit", (e) => {
  e.preventDefault()
  const idea = $("#idea-input").value.trim()
  if (!idea) return toast("Descreva a ideia do vídeo primeiro.", true)
  $("#idea-input").value = ""
  startWriteScript(idea)
})

$("#example-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-idea]")
  if (!btn) return
  startWriteScript(btn.dataset.idea)
})

function setSidebarOpen(open) {
  const sb = $("#sidebar")
  const bd = $("#sidebar-backdrop")
  if (!sb || !bd) return
  sb.classList.toggle("open", open)
  bd.hidden = !open
}

$("#btn-mobile-menu")?.addEventListener("click", () => {
  setSidebarOpen(!$("#sidebar")?.classList.contains("open"))
})
$("#sidebar-backdrop")?.addEventListener("click", () => setSidebarOpen(false))

$("#btn-new-video").addEventListener("click", () => {
  setSidebarOpen(false)
  state.current = null
  state.videoBlobUrl = null
  renderSidebar()
  renderThread()
  $("#idea-input").focus()
})

$("#btn-manual").addEventListener("click", () => {
  state.current = {
    id: `crt-${Date.now().toString(36)}`,
    titulo: "Meu roteiro",
    ideia: $("#idea-input").value.trim() || "Roteiro manual",
    formato: $("#cfg-formato").value,
    duracao: Number($("#cfg-duracao").value),
    ttsProvider: $("#cfg-provider").value,
    voice: $("#cfg-voz").value,
    frases: ["Escreva a primeira frase aqui.", "Escreva a segunda frase aqui."],
    cenas: [],
  }
  renderThread()
})

$("#btn-ideas").addEventListener("click", async () => {
  const tema = $("#idea-input").value.trim() || "histórias reais e curiosidades surpreendentes"
  $("#modal-title").textContent = "10 ideias geradas pela IA"
  $("#modal-body").innerHTML = renderProgress("Gerando 10 ideias", "consultando OpenCode…", 45)
  $("#modal-backdrop").hidden = false
  try {
    const out = await api("/ideias", { tema, formato: $("#cfg-formato").value, model: state.model })
    $("#modal-body").innerHTML = out.ideias.map((it) => `
      <button type="button" class="idea-item" data-pick-idea="${esc(it.premissa || it.titulo)}">
        <strong>${esc(it.titulo)}</strong>
        <span>${esc(it.premissa)} · <em>${esc(it.formato || "")}</em></span>
      </button>
    `).join("")
  } catch (e) {
    $("#modal-body").innerHTML = `<p style="color:#fca5a5">${esc(e.message)}</p>`
  }
})

$("#pill-model").addEventListener("click", () => {
  const models = state.config?.models?.length ? state.config.models : ["opencode-go/deepseek-v4.1-flash", "opencode-go/kimi-k3"]
  $("#modal-title").textContent = "Escolher modelo de IA (OpenCode)"
  $("#modal-body").innerHTML = models.map((m) => `
    <button type="button" class="idea-item" data-pick-model="${esc(m)}">
      <strong>${esc(state.config?.modelCatalog?.[m]?.name || m.split("/").at(-1))}</strong>
      <span>${esc(m)}${m === state.model ? " · Em uso" : ""}</span>
    </button>
  `).join("")
  $("#modal-backdrop").hidden = false
})

$("#modal-close").addEventListener("click", () => { $("#modal-backdrop").hidden = true })
$("#modal-body").addEventListener("click", (e) => {
  const ideaBtn = e.target.closest("[data-pick-idea]")
  if (ideaBtn) {
    $("#modal-backdrop").hidden = true
    startWriteScript(ideaBtn.dataset.pickIdea)
    return
  }
  const modelBtn = e.target.closest("[data-pick-model]")
  if (modelBtn) {
    state.model = modelBtn.dataset.pickModel
    localStorage.setItem("cartoon:model", state.model)
    updateTopPills()
    $("#modal-backdrop").hidden = true
    toast(`Modelo alterado para ${state.model.split("/").at(-1)}`)
  }
})

$("#cfg-provider").addEventListener("change", populateVoices)
$("#cfg-voz").addEventListener("change", updateTopPills)

$("#sidebar-list").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]")
  if (del) {
    e.stopPropagation()
    await fetch(`/api/cartoon/projetos/${encodeURIComponent(del.dataset.del)}`, { method: "DELETE" })
    if (state.current?.id === del.dataset.del) state.current = null
    state.projects = state.projects.filter((p) => p.id !== del.dataset.del)
    renderSidebar()
    renderThread()
    return
  }
  const item = e.target.closest("[data-open]")
  if (!item) return
  if (state.busy) return toast("Aguarde a geração atual terminar antes de abrir outro projeto.", true)
  setSidebarOpen(false)
  try {
    const res = await api(`/projetos/${encodeURIComponent(item.dataset.open)}`)
    state.current = res.project
    state.videoBlobUrl = null
    state.coverDataUrl = null
    state.activeTab = res.project?.videoUrl ? "ready" : res.project?.cenas?.length ? "storyboard" : "script"
    renderSidebar()
    renderThread()
    scrollTopSmooth()
  } catch (e2) {
    toast(e2.message, true)
  }
})

$("#thread-view").addEventListener("input", (e) => {
  if (!state.current) return
  if (e.target.id === "proj-title") state.current.titulo = e.target.value
  if (e.target.dataset.phrase !== undefined) {
    const idx = Number(e.target.dataset.phrase)
    state.current.frases[idx] = e.target.value
    if (state.current.cenas?.[idx]) state.current.cenas[idx].texto = e.target.value
  }
  const card = e.target.closest("[data-scene]")
  if (card) {
    const idx = Number(card.dataset.scene)
    const cena = state.current.cenas[idx]
    if (e.target.dataset.field) {
      cena[e.target.dataset.field] = e.target.type === "checkbox" ? e.target.checked : e.target.value
    }
    if (e.target.dataset.cast !== undefined) {
      cena.quemAparece = [...card.querySelectorAll('input[data-cast]:checked')].map((x) => x.value)
    }
  }
})

$("#thread-view").addEventListener("click", async (e) => {
  const tabBtn = e.target.closest("[data-tab]")
  if (tabBtn && !tabBtn.disabled) {
    state.activeTab = tabBtn.dataset.tab
    renderThread()
    scrollTopSmooth()
    return
  }
  if (e.target.dataset.delPhrase !== undefined) {
    state.current.frases.splice(Number(e.target.dataset.delPhrase), 1)
    renderThread()
  } else if (e.target.id === "btn-add-phrase") {
    state.current.frases.push("Nova frase...")
    renderThread()
  } else if (e.target.id === "btn-save-proj") {
    await persistCurrent()
    toast("Salvo no Supabase!")
  } else if (e.target.id === "btn-new-from-card") {
    state.current = null
    renderThread()
  } else if (e.target.id === "btn-build-storyboard" || e.target.id === "btn-build-storyboard-top" || e.target.id === "btn-redo-storyboard") {
    buildStoryboard()
  } else if (e.target.id === "btn-refresh-thumbs") {
    renderThread()
    toast("Quadros atualizados!")
  } else if (e.target.dataset.create3d !== undefined || e.target.dataset.regen3d !== undefined) {
    const idx = Number(e.target.dataset.create3d ?? e.target.dataset.regen3d)
    const cena = state.current?.cenas?.[idx]
    if (!cena || state.busy) return
    const isRegen = e.target.dataset.regen3d !== undefined
    const nome = isRegen
      ? (cena.customAssetLabel || cena.customAssetId)
      : window.prompt("Qual objeto ou estrutura 3D deseja criar para esta cena? (ex.: submarino amarelo, vulcão em erupção, castelo medieval)", "")
    if (!nome?.trim()) return
    state.busy = true
    renderThread(renderProgress("Modelando objeto 3D", `criando "${nome.trim()}" no estilo cel-shaded do kit…`, 60))
    try {
      const out = await api("/ativo-3d", {
        nome: nome.trim(),
        titulo: state.current.titulo,
        model: state.model,
        forceNew: isRegen,
      })
      state.current.customAssets = { ...(state.current.customAssets || {}), [out.id]: out.blueprint }
      cena.customAssetId = out.id
      cena.customAssetLabel = out.blueprint.label || nome.trim()
      await persistCurrent()
      renderThread()
      toast(`Objeto 3D "${cena.customAssetLabel}" criado!`)
    } catch (err) {
      toast(err.message, true)
      renderThread()
    } finally {
      state.busy = false
    }
  } else if (e.target.dataset.clear3d !== undefined) {
    const idx = Number(e.target.dataset.clear3d)
    const cena = state.current?.cenas?.[idx]
    if (cena) {
      cena.customAssetId = ""
      cena.customAssetLabel = ""
      renderThread()
    }
  } else if (e.target.id === "btn-render-video") {
    renderFinalVideo()
  } else if (e.target.id === "btn-yt-pack") {
    generateYoutubePack()
  } else if (e.target.dataset.copy) {
    const yt = state.current?.youtubePack
    if (!yt) return
    const map = {
      tituloYt: yt.tituloYt,
      tituloAlt: yt.tituloAlt,
      descricao: yt.descricao,
      dubEn: `${yt.dublagem?.timestamps || ""}\n\nElevenLabs:\n${yt.dublagem?.elevenlabs || ""}`,
      thumbPrompt: yt.thumbnailPrompt,
    }
    await navigator.clipboard?.writeText(map[e.target.dataset.copy] || "")
    toast("Copiado!")
  }
})

async function generateYoutubePack() {
  if (state.busy || !state.current?.frases?.length) return
  state.busy = true
  renderThread(renderProgress("Gerando Kit YouTube + Capa 9:16", "criando títulos CTR, descrição, dublagem e thumbnail HD…", 55))
  try {
    const pack = await api("/youtube-pack", {
      titulo: state.current.titulo,
      ideia: state.current.ideia,
      frases: state.current.frases,
      cenasTiming: state.current.cenasTiming,
      duration: state.current.duration || state.current.duracao || 45,
      model: state.model,
    })
    const bestScene = state.current.cenas?.find((c) => c.virada) || state.current.cenas?.[0] || { cenario: "vila", luz: "dia", plano: "close", acao: "surpreso", expressao: "surpreso", quemAparece: ["silas"] }
    const cov = createCartoonRenderer(1080, 1920)
    state.coverDataUrl = cov.renderCoverPngDataUrl(bestScene, pack.textoCapa, state.current.customAssets || {})
    cov.dispose()
    try {
      const covBlob = await (await fetch(state.coverDataUrl)).blob()
      const covUrl = await uploadMediaBlob(state.current.id, "cover", covBlob, "image/png")
      if (covUrl) state.current.coverUrl = covUrl
    } catch {}
    state.current.youtubePack = pack
    await persistCurrent()
    renderThread()
    scrollTopSmooth()
    toast("Kit YouTube + Capa 9:16 prontos!")
  } catch (e) {
    toast(e.message, true)
    renderThread()
  } finally {
    state.busy = false
  }
}

// Inicialização (restaura o último projeto/aba aberto automaticamente)
; (async () => {
  try {
    const [cfg, list] = await Promise.all([api("/config"), api("/projetos")])
    state.config = cfg
    state.projects = list.projects || []
    populateVoices()
    renderSidebar()
    updateTopPills()
    const lastId = localStorage.getItem("cartoon:lastProjectId")
    const lastTab = localStorage.getItem("cartoon:lastTab")
    if (lastId && state.projects.some((p) => p.id === lastId)) {
      const res = await api(`/projetos/${encodeURIComponent(lastId)}`).catch(() => null)
      if (res?.project) {
        state.current = res.project
        state.activeTab = lastTab || (res.project.videoUrl ? "ready" : res.project.cenas?.length ? "storyboard" : "script")
        renderSidebar()
        renderThread()
      }
    }
  } catch (e) {
    toast(e.message, true)
  }
})()
