const content = document.querySelector("#content")
const header = document.querySelector("#header")
const status = document.querySelector("#status")
const embedded = window.parent !== window && new URLSearchParams(location.search).has("painel")
let importedScript
const sendToPanel = (type, data) => { if (embedded) window.parent.postMessage({ type, data }, location.origin) }
const hosted = document.documentElement.dataset.runtime === "cloud"
const apiRoot = "/api/criar"
const cache = {
  audio: null, channels: [], config: null, current: null, projects: [], activeId: "", originalId: null,
  editing: null, busy: false, progress: null, mobileTab: "preview", compare: "b", time: 0,
}
let navigation = 0
let releaseSceneFrames
const html = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c])
const include = (page, id) => `#${page}${id ? "/" + encodeURIComponent(id) : ""}`
const route = () => (location.hash.slice(1) || "inicio").split("/")
const activeChannel = () => cache.channels.find((channel) => channel.id === cache.activeId)
const channelProject = (project) => project && cache.channels.find((channel) => channel.id === (project.channelId === undefined ? cache.originalId : project.channelId))
const version = (project) => project?.versions?.find((item) => item.id === project.selectedVersion)
const videoUrl = (project, item) => `/p/${encodeURIComponent(project.id)}/${encodeURIComponent(item.preview)}`
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clock = (time) => [Math.floor(time / 60), Math.floor(time % 60)].map((n) => String(n).padStart(2, "0")).join(":")
const navigationItems = [["inicio", "Início", "M3 10l9-7 9 7v11h-6v-7H9v7H3z"], ["projetos", "Projetos", "M3 6h6l2 2h10v12H3z"], ["canais", "Canais", "M3 5h18v14H3z M10 9l5 3-5 3z"], ["pautas", "Pautas", "M4 6h16 M4 12h12 M4 18h8"], ["criar", "Criar", "M12 4v16 M4 12h16"]]
function studioNav() {
  return `<nav aria-label="Studio">${navigationItems.map(([key, title, shape]) => `<a href="#${key}" class="nav-${key}"${route()[0] === key ? ' aria-current="page"' : ""}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="${shape}"/></svg>${title}</a>`).join("")}</nav>`
}

async function api(url, payload) {
  if (hosted) return (await import("/studio-cloud.js")).cloudApi(url,payload)
  const response = await fetch(url.startsWith("/api/") ? url : apiRoot + url, payload === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `A operação falhou (HTTP ${response.status}).`)
  return data
}

function notify(message, error = false) {
  status.hidden = !message
  status.textContent = message ?? ""
  status.classList.toggle("error", error)
  sendToPanel("studio:mobile-status", { message: message || "", error })
}

const youtubeImage = url => /^https:\/\/(?:[\w.-]+\.googleusercontent\.com|yt3\.ggpht\.com)\//i.test(url || "") ? url : ""

function avatar(channel, classes = "") {
  const mark = html((channel?.title ?? "Studio 3D").trim()[0])
  const logo = youtubeImage(channel?.logo)
  return logo ? `<img class="avatar ${classes}" src="${html(logo)}" alt="" referrerpolicy="no-referrer">` : `<span aria-hidden="true" class="avatar ${classes}">${mark}</span>`
}

function headerView(project = null) {
  const channel = activeChannel()
  const items = cache.channels.map((entry) => `<button type="button" role="menuitem" data-action="channel" data-id="${html(entry.id)}">${avatar(entry)} ${html(entry.title)}${entry.id === cache.activeId ? " ✓" : ""}</button>`).join("")
  const review = Boolean(project)
  header.classList.toggle("workspace-header", review)
  const brand = channel ? avatar(channel) : '<span class="studio-mark" aria-hidden="true"><span></span></span>'
  const download = project?.urls.mp4
    ? `<a class="button workspace-export" href="${html(project.urls.mp4)}" download><span aria-hidden="true">↓</span> Baixar MP4</a>`
    : project ? link("exportar", "Exportar vídeo", project.id, "button workspace-export") : ""
  if (embedded) {
    header.hidden = !project
    header.innerHTML = project ? `<div class="header-inner"><h1 class="workspace-title">${html(project.titulo)}</h1>${download}</div>` : ""
    return
  }
  header.innerHTML = `<div class="header-inner">
    <details class="switcher"><summary>${brand}<span>${html(channel?.title || "Studio 3D")}</span><span aria-hidden="true">⌄</span></summary>
      <div class="menu" role="menu">${items}${items ? '<button type="button" role="menuitem" data-action="channel" data-id="">Projetos sem canal</button>' : ""}${review ? '<a role="menuitem" href="#inicio">Início</a><a role="menuitem" href="#projetos">Projetos</a>' : ""}<a role="menuitem" href="#canais">Meus canais</a></div></details>
    ${review ? `<h1 class="workspace-title">${html(project.titulo)}</h1>` : studioNav()}
    <span class="provider">OpenCode Go</span>${download}
  </div>`
}

function heading(title, detail = "", action = "") {
  return `<div class="page-heading"><div><h1>${html(title)}</h1>${detail ? `<p>${html(detail)}</p>` : ""}</div>${action}</div>`
}

function productionFlow(project, page) {
  const hasVideo = Boolean(project?.urls?.mp4 || version(project))
  const steps = [
    ["criar", "Roteiro e voz", true],
    ["revisao", "Revisar vídeo", hasVideo],
    ["publicar", "Publicar", hasVideo || Boolean(project?.publicacao)],
  ]
  return `<ol class="production-flow" aria-label="Etapas de produção">${steps.map(([route, label, available]) => `<li${page === route ? ' aria-current="step"' : ""}>${
    available && route !== page ? link(route, label, project?.id, "flow-link") : `<span>${label}</span>`
  }</li>`).join("")}</ol>`
}

function link(page, label, id = "", classes = "button secondary") {
  return `<a class="${classes}" href="${include(page, id)}">${label}</a>`
}

function projectLink(project) {
  if (project.publicacao || project.scenePlan || project.jobId) return include(productionStep(project)[0], project.id)
  return include(project.versions?.length || project.mp4 ? "revisao" : "criar", project.id)
}

function projectState(project) {
  if (project.publicacao) return productionStep(project)[1] === "Ver agendamento" ? "Agendado" : "Publicado no YouTube"
  if (project.scenePlan) return "Cenas para aprovação"
  if (project.mp4) return "MP4 pronto"
  if (version(project)) return "Em revisão"
  return project.audio ? "Narração pronta" : "Rascunho"
}

function projectMedia(project, className = "") {
  const item = version(project)
  const media = item ? videoUrl(project, item) : project.urls?.mp4
  return media ? `<video class="${className}" muted preload="metadata" playsinline src="${html(media)}#t=0.5" aria-hidden="true"></video>`
    : project.urls?.cover ? `<img class="project-cover ${className}" src="${html(project.urls.cover)}" loading="lazy" alt="Capa do projeto">`
    : `<span class="placeholder ${className}" aria-hidden="true">▤</span>`
}

function projectCards(projects) {
  if (!projects.length) return `<div class="surface empty studio-empty"><span class="empty-mark" aria-hidden="true">▤</span><h2>Nenhum projeto ainda</h2><p>Crie um vídeo para começar.</p>${link("criar", "Novo vídeo", "", "button")}</div>`
  return `<div class="projects">${projects.map((project) => `<article class="project-card surface"><a href="${projectLink(project)}" aria-label="Abrir ${html(project.titulo)}">${projectMedia(project)}</a><div class="project-card-body"><h2>${html(project.titulo)}</h2><p class="project-status"><span>${project.archived ? "Arquivado" : projectState(project)}</span></p><div class="card-tools"><a href="${projectLink(project)}">Abrir projeto →</a>${hosted ? `<button type="button" class="link-button" data-action="archive-project" data-id="${html(project.id)}">${project.archived ? "Restaurar" : "Arquivar"}</button>` : ""}<button type="button" class="delete-project" data-action="delete-project" data-id="${html(project.id)}" ${project.jobId ? "disabled" : ""}>Excluir</button></div></div></article>`).join("")}</div>`
}

function productionStep(p) {
  if (p.jobId) return ["gerando", "Ver andamento"]
  if (p.publicacao) return ["publicar", p.publicacao.publishAt && Date.parse(p.publicacao.publishAt) > Date.now() ? "Ver agendamento" : "Ver publicação"]
  if (p.scenePlan) return ["criar", "Conferir cenas"]
  if (p.mp4) return ["exportar", "Baixar MP4"]
  if (version(p)) return ["revisao", "Revisar cenas"]
  return ["criar", p.audio ? "Ouvir narração" : "Editar roteiro"]
}

function queueView() {
  const projects = cache.projects.filter(p => !p.publicacao)
  const ideas = cache.book.ideas.filter(i => i.queued && !cache.projects.some(p => p.pautaId === i.id))
  const rows = projects.map(p => {
    const [page, label] = productionStep(p)
    return `<li><div><strong>${html(p.titulo)}</strong><small>${projectState(p)}</small></div>${link(page,label,p.id,"text-link")}</li>`
  }).concat(ideas.map(i => `<li><div><strong>${html(i.title)}</strong><small>Pauta escolhida</small></div><button class="button secondary" data-action="use-idea" data-id="${html(i.id)}">Criar roteiro</button></li>`))
  return `<div class="section-heading studio-section"><h2>Fila de produção</h2>${link("pautas","Escolher temas","","text-link")}</div><section class="surface planning-card">${rows.length ? `<ul class="queue-list">${rows.join("")}</ul>` : "<p>Escolha uma sugestão da IA para começar a fila deste canal.</p>"}</section>`
}

function topicPage() {
  const book = cache.book
  return `${heading("Pautas do canal",activeChannel()?.title || "Estúdio sem canal selecionado")}
  <div class="topic-columns"><section class="surface planning-card"><h2>Descobrir temas com IA</h2>
    <form id="ideas-form" class="form"><label>Quais assuntos você quer explorar?<textarea name="interests" maxlength="1000" rows="2" placeholder="Ex.: construção, curiosidades do cotidiano ou deixe a IA escolher">${html(book.interests)}</textarea></label>
    ${modelOptions("Modelo do OpenCode Go","scriptModel",null,"opencode-go/deepseek-v4.1-flash")}
    <div class="actions"><button class="button" value="sugerir" ${cache.config.go ? "" : "disabled"}>Sugerir temas com IA</button><button class="button secondary" value="preferencias">Salvar preferências</button></div></form>
    <ul class="idea-list">${book.ideas.map(i => `<li><h3>${html(i.title)}</h3><p>${html(i.hook)}</p><div class="actions"><button class="button secondary" data-action="use-idea" data-id="${html(i.id)}">Usar no roteiro</button><button class="link-button" data-action="queue-idea" data-id="${html(i.id)}">${i.queued ? "Retirar da fila" : "Guardar na fila"}</button></div></li>`).join("")}</ul></section>
    <aside class="surface planning-card"><h2>Referências salvas</h2><form id="reference-form" class="form"><label>Link<input type="url" required name="url" placeholder="https://…" maxlength="2000"></label><label>O que você quer aproveitar?<textarea name="note" required rows="2" maxlength="800"></textarea></label><button class="button secondary">Guardar referência</button></form>
    <ul class="idea-list">${book.references.map(r => `<li><a href="${html(r.url)}" target="_blank" rel="noopener noreferrer">${html(new URL(r.url).hostname)}</a><p>${html(r.note)}</p><button class="link-button" data-action="use-reference" data-id="${html(r.id)}">Criar roteiro desta referência</button></li>`).join("")}</ul></aside></div>`
}

const draftKey = (project = cache.current) => "studio-draft:" + JSON.stringify([cache.activeId,project?.id || "novo"])
function readDraft(project) {
  try { return JSON.parse(localStorage.getItem(draftKey(project))) } catch { return null }
}
function saveDraft(form) {
  const fields = Object.fromEntries(new FormData(form))
  const savedAt = new Date().toISOString()
  try {
    localStorage.setItem(draftKey(),JSON.stringify({ fields, savedAt }))
    form.querySelector(".draft-status").textContent = draftTime(savedAt)
  } catch { notify("O navegador não conseguiu guardar o rascunho. Use Salvar roteiro.", true) }
}
const draftTime = date => "Salvo neste navegador às " + new Date(date).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
function restoreDraft(project) {
  const form = document.querySelector("#create-form")
  const draft = readDraft(project)
  if (!form || !draft?.fields) return
  for (const [name,value] of Object.entries(draft.fields)) {
    const field = form.elements.namedItem(name)
    if (field && field.tagName !== "BUTTON" && name !== "intent") field.value = value
  }
  form.querySelector(".draft-status").textContent = draftTime(draft.savedAt)
}

function planView(project) {
  const plan = project?.scenePlan
  if (!plan) return ""
  return `<section class="surface planning-card scene-plan"><h2>Conferir cenas antes de animar</h2>
    <ol class="idea-list">${plan.board.cenas.map((scene,index) => {
      const objects = (scene.objetos || []).map(o => o.asset || o.id).filter(Boolean).slice(0,8).join(", ").replaceAll("_"," ")
      return `<li><h3>Cena ${index+1} · ${clock(scene.inicio)}–${clock(scene.fim)}</h3><p>${html(plan.narration[index])}</p><small>${html(scene.descricaoVisual || objects || scene.ambiente?.fundo || "Cenário do projeto")}</small></li>`
    }).join("")}</ol>
    <form class="form" id="plan-form"><label>Cena a ajustar<select name="scene">${plan.board.cenas.map((_,i)=>`<option value="${i}">Cena ${i+1}</option>`).join("")}</select></label>
    <label>Pedido à IA<textarea name="message" maxlength="2000" required rows="2"></textarea></label><button class="button secondary">Ajustar cena com IA</button></form>
    ${plan.response ? `<p>${html(plan.response)}</p>` : ""}<button class="button" data-action="render-plan">Aprovar cenas e gerar animação</button></section>`
}

function home() {
  const channel = activeChannel()
  const latest = cache.projects.find(p => !p.publicacao) || cache.projects[0]
  const recent = cache.projects.filter(p => p.id !== latest?.id).slice(0, 3)
  return `<section class="channel-hero surface">
    ${youtubeImage(channel?.banner) ? `<img class="hero-scene channel-cover" src="${html(channel.banner)}" alt="" referrerpolicy="no-referrer">` : !channel ? '<img class="hero-scene" src="/studio-banner.webp" alt="">' : ""}
    <div class="hero-identity">${channel ? avatar(channel, "large") : '<span class="studio-mark hero-mark" aria-hidden="true"><span></span></span>'}<div><p>${channel ? "Studio 3D" : "Estúdio de vídeo"}</p><h1>${html(channel?.title || "Studio 3D")}</h1></div></div>
    ${link("criar", "<span aria-hidden='true'>＋</span> Novo vídeo", "", "button")}</section>

    ${latest ? `<div class="section-heading studio-section"><h2>Continuar projeto</h2><a class="text-link" href="#projetos">Ver projetos</a></div>
      <article class="featured-project surface">${latest.urls?.mp4 || version(latest) ? `<video class="featured-media" aria-label="Reproduzir prévia" controls playsinline preload="auto" src="${html(version(latest) ? videoUrl(latest,version(latest)) : latest.urls.mp4)}#t=0.1"></video>` : projectMedia(latest, "featured-media")}<div><span class="tag">${projectState(latest)}</span><h2>${html(latest.titulo)}</h2><a class="button" href="${projectLink(latest)}">Continuar edição</a></div></article>` : projectCards([])}
    ${queueView()}
    ${recent.length ? `<div class="section-heading studio-section"><h2>Projetos recentes</h2></div><div class="surface recent-projects">${recent.map((project) => `<a href="${projectLink(project)}">${projectMedia(project)}<strong>${html(project.titulo)}</strong><span aria-hidden="true">›</span></a>`).join("")}</div>` : ""}
    ${!channel ? `<div class="channel-callout surface"><p>Conecte seu canal para publicar no YouTube.</p>${link("canais", "Meus canais", "", "button secondary")}</div>` : ""}`
}

function channels() {
  const rows = cache.channels.map((item) => `<div class="channel-row">${avatar(item, "medium")}<div><strong>${html(item.title)}</strong><p>${html(item.handle || item.id)}</p></div>
    ${item.id === cache.activeId ? '<span class="tag">Canal ativo</span>' : `<button class="button secondary" data-action="channel" data-id="${html(item.id)}">Abrir canal</button>`}</div>`).join("")
  return `${heading("Meus canais", "Alterne entre seus canais do YouTube.", rows && cache.youtubeConfigured ? '<a class="button" href="/api/youtube/oauth/start?canais=1">Conectar canal</a>' : "")}
    <section class="surface channel-list">${rows || `<div class="studio-empty"><span class="empty-mark" aria-hidden="true">▶</span><h2>Nenhum canal conectado</h2>
      <p>${cache.youtubeConfigured ? "Entre com sua conta Google e confirme o canal que quer adicionar." : "Configure as credenciais OAuth do Google no servidor do Studio."}</p>
      ${cache.youtubeConfigured ? '<a class="button" href="/api/youtube/oauth/start?canais=1">Conectar canal</a>' : ""}</div>`}</section>${hosted ? `<form id="channel-profile-form" class="surface form"><label>Adicionar perfil do YouTube<input name="ref" required maxlength="300" placeholder="@canal ou link do YouTube"></label><div class="actions"><button class="button">Adicionar e abrir canal</button></div></form>` : ""}`
}

function connect(channel, id) {
  if (!channel) return `<div class="connection-page">${link("canais", "← Meus canais", "", "text-link")}${heading("Conectar canal do YouTube")}
    <div class="surface studio-empty"><h2>Inicie a conexão em Meus canais</h2><p>Entre com sua conta Google para escolher o canal.</p>
    ${cache.youtubeConfigured ? '<a class="button" href="/api/youtube/oauth/start?canais=1">Conectar canal</a>' : ""}</div></div>`
  return `<div class="connection-page">${link("canais", "← Meus canais", "", "text-link")}${heading("Conectar canal do YouTube", "Confira o canal autorizado antes de adicionar.")}
  <div class="surface connection-card"><div class="channel-row">${avatar(channel, "large")}<div><h2>${html(channel.title)}</h2><p>${html(channel.handle || channel.id)}</p></div></div>
  <div class="actions"><a class="button secondary" href="/api/youtube/oauth/start?canais=1">Trocar conta Google</a><button class="button" data-action="add-channel" data-id="${html(id)}">Adicionar canal</button></div></div></div>`
}

function inputTypes(id) {
  const labels = { text:"Texto", image:"Imagem", audio:"Áudio", video:"Vídeo", "application/pdf":"PDF" }
  const types = cache.config.modelCatalog?.[id]?.input || []
  return [...new Set(types.map(type => labels[type] || labels[type.split("/")[0]] || type))]
}
function modelInfo(id) {
  const types = inputTypes(id)
  return `<span class="model-caption">Entradas do modelo</span><span class="modality-tags">${(types.length ? types : ["Sem informação"]).map(type => `<span>${html(type)}</span>`).join("")}</span>`
}
function modelOptions(label, name, saved, preferred) {
  const available = cache.config.models.length ? cache.config.models : ["opencode-go/deepseek-v4.1-flash", "opencode-go/kimi-k3"]
  const value = saved || localStorage.getItem(name) || (available.includes(preferred) ? preferred : available[0])
  const choices = [...new Set([value, ...available])]
  const names = { "deepseek-v4.1-flash": "DeepSeek V4.1 Flash", "kimi-k3": "Kimi K3" }
  return `<div class="model-field"><label>${label}<select name="${name}">${choices.map((id) => {
    const model = id.split("/").at(-1)
    const types = inputTypes(id)
    return `<option value="${html(id)}"${id === value ? " selected" : ""}>${html(names[model] || cache.config.modelCatalog?.[id]?.name || model)} · ${html(types.join(", ") || "Sem informação")}</option>`
  }).join("")}</select></label><div class="model-info" aria-live="polite">${modelInfo(value)}</div></div>`
}

let fullVoiceLibrary
function showVoiceOptions(form, preferred) {
  const search = form.querySelector("#voice-search")
  const select = form.elements.voice
  const query = search.value.trim().toLocaleLowerCase("pt-BR")
  const library = fullVoiceLibrary || cache.config.voices
  const matches = library.filter(v => (v.label + " " + v.id).toLocaleLowerCase("pt-BR").includes(query))
  select.replaceChildren(...matches.map(v => new Option(v.label, v.id)))
  if (matches.some(v => v.id === preferred)) select.value = preferred
  form.querySelector("#voice-count").textContent = matches.length ? matches.length.toLocaleString("pt-BR") + (matches.length === 1 ? " voz" : " vozes") : "Nenhuma voz encontrada."
}
async function loadVoiceLibrary(project) {
  const form = document.querySelector("#create-form")
  if (!form || !cache.config.gemini) return
  const initial = form.elements.voice.value
  const saved = readDraft(project)?.fields?.voice || project?.voice || initial
  try {
    fullVoiceLibrary ||= await api("/vozes")
    if (form.isConnected) showVoiceOptions(form, form.elements.voice.value === initial ? saved : form.elements.voice.value)
  } catch {
    if (form.isConnected) form.querySelector("#voice-count").textContent = "Biblioteca ampliada indisponível. Mostrando as vozes locais."
  }
}

function scriptMeterText(text) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length
  const seconds = Math.round(words / 2.4)
  return `${words} ${words === 1 ? "palavra" : "palavras"} · ~${seconds}s`
}

function settingsSummaryText(form) {
  if (!form) return ""
  const dur = form.elements.duration?.value
  const voiceOpt = form.elements.voice?.selectedOptions?.[0]?.textContent?.split("·")[0]?.trim()
  const modelId = form.elements.animationModel?.value || ""
  const modelName = modelId.split("/").at(-1) || ""
  return [dur ? `${dur}s` : "", voiceOpt, modelName].filter(Boolean).join(" · ")
}

function updateCreateMeta(form) {
  if (!form) return
  const meter = form.querySelector("#script-meter")
  if (meter) meter.textContent = scriptMeterText(form.elements.script?.value)
  const summary = form.querySelector("#settings-summary")
  if (summary) summary.textContent = settingsSummaryText(form)
}

function create(project) {
  const config = cache.config
  const opts = [30, 45, 60, 90, 120, 150].map((seconds) => `<option value="${seconds}"${seconds === (project?.duracaoAlvo || 60) ? " selected" : ""}>${seconds} segundos</option>`).join("")
  const available = fullVoiceLibrary || config.voices
  const voices = (project?.voice && !available.some(v => v.id === project.voice) ? [...available,{id:project.voice,label:project.voice}] : available).map((voice) => `<option value="${html(voice.id)}"${(project?.voice || "en-us-arlo") === voice.id ? " selected" : ""}>${html(voice.label || voice.id)}</option>`).join("")
  const hasScript = Boolean(project?.roteiro?.roteiro?.trim())
  const hasAudio = Boolean(project?.audio)
  const hasVideo = Boolean(version(project) || project?.urls?.mp4)
  return `${heading(project ? "Editar roteiro" : "Criar vídeo")}
    ${!config.go ? '<p class="notice">A chave do OpenCode Go ainda não está configurada no servidor.</p>' : ""}
    ${!config.kit ? `<p class="notice">${hosted ? "A renderização de animações 3D ainda não está disponível nesta hospedagem." : "O motor 3D precisa das dependências do kit para gerar as cenas."}</p>` : ""}
    <div class="production-grid create-grid"><form id="create-form" class="surface form production-form">
      ${project?.id ? "" : `<div class="script-start">
        <label>Tema para a IA<input name="idea" placeholder="Escolha um tema ou escreva uma ideia" maxlength="2000"></label>
        <input type="hidden" name="pautaId">
        <div class="script-start-actions"><a class="text-link" href="#pautas">Sugerir temas com IA →</a><button class="button secondary" name="intent" value="script" ${!config.go ? "disabled" : ""}>Gerar roteiro</button></div>
      </div>`}
      <label>Título<input name="title" maxlength="100" value="${html(project?.titulo)}" placeholder="Título do vídeo"></label>
      <div class="story-editor-wrap">
        <div class="story-editor-head"><span>Roteiro</span><span id="script-meter" class="script-meter">${scriptMeterText(project?.roteiro?.roteiro)}</span></div>
        <label class="story-editor"><span class="sr-only">Roteiro</span><textarea name="script" rows="12" maxlength="5000" placeholder="Escreva ou cole a narração…">${html(project?.roteiro?.roteiro)}</textarea></label>
      </div>
      <details class="production-settings"><summary><span>Configurações de produção</span><span id="settings-summary" class="settings-summary"></span></summary>
        <div class="fields">
          ${project?.id ? "" : `<label>Duração alvo<select name="duration">${opts}</select></label>${modelOptions("IA do roteiro", "scriptModel", null, "opencode-go/deepseek-v4.1-flash")}`}
          ${modelOptions("IA da animação", "animationModel", project?.animationModel, "opencode-go/kimi-k3")}
          <div class="voice-settings"><label>Buscar voz do Google<input id="voice-search" type="search" placeholder="Nome ou idioma, ex.: Arlo, pt-BR"></label><label>Voz<select name="voice">${voices}</select></label><small id="voice-count" aria-live="polite">${config.gemini ? "Carregando biblioteca…" : "Vozes locais"}</small></div>
        </div>
      </details>
      ${project?.urls?.audio ? `<div class="script-audio"><strong>Narração do projeto</strong><audio controls preload="metadata" src="${html(project.urls.audio)}"></audio>${hosted ? `<a class="text-link" href="${html(project.urls.audio)}" download="narracao.wav">Baixar narração WAV</a>` : ""}</div>` : ""}
      ${!config.gemini ? '<p class="notice">Configure a chave Gemini no servidor para gerar a narração.</p>' : ""}
      <small class="draft-status" role="status"></small><div class="actions production-actions">
        <button class="button" name="intent" value="audio" ${!config.gemini || project?.publicacao ? "disabled" : ""}>Gerar narração</button>
        ${!hosted && project?.audio && !project.publicacao ? `<button class="button secondary" name="intent" value="animate" ${!config.go || !config.kit ? "disabled" : ""}>Aprovar áudio e planejar cenas</button>` : ""}
        <button class="button secondary" name="intent" value="produce" ${!config.go || !config.gemini || !config.kit || project?.publicacao ? "disabled" : ""}>Gerar narração e animação</button>
        <button class="button secondary" name="intent" value="save">Salvar roteiro</button>
        ${embedded && hosted ? '<a class="text-link" href="/#pacote" target="_top">Pacote de edição</a>' : ""}
      </div>
    </form><aside class="surface production-preview create-preview">
      <div class="workspace-panel-title"><h2>Prévia do projeto</h2><span class="workspace-badge">9:16</span></div>
      ${hasVideo ? `<div class="poster-stage cinema-stage"><video class="portrait" controls playsinline preload="metadata" src="${html(version(project) ? videoUrl(project, version(project)) : project.urls.mp4)}"></video></div>`
      : `<div class="preview-awaiting"><span class="empty-mark" aria-hidden="true">▶</span><p>${project?.scenePlan ? "Confira o plano de cenas para gerar a prévia." : hasAudio ? "A narração está pronta. A prévia aparece depois que você gerar a animação." : "A prévia vertical (9:16) aparece aqui após gerar a animação."}</p>
        <ul class="preview-checklist" aria-label="Progresso">
          <li data-done="${hasScript}"><span>${hasScript ? "✓" : "1"}</span>Roteiro</li>
          <li data-done="${hasAudio}"><span>${hasAudio ? "✓" : "2"}</span>Narração</li>
          <li data-done="${hasVideo}"><span>${hasVideo ? "✓" : "3"}</span>Animação 3D</li>
        </ul></div>
        <details class="visual-reference"><summary>Ver referência visual</summary><img src="/studio-concept.webp" alt="Ilustração de referência de um rolo compactador" loading="lazy"></details>`}
    </aside></div>${planView(project)}
    ${project?.htmlDocuments?.length ? `<details class="surface planning-card scene-plan"><summary>Versões do HTML do projeto</summary><ul class="idea-list">${[...project.htmlDocuments].reverse().map((version, index) =>
      `<li><a href="/api/criar/projetos/${encodeURIComponent(project.id)}/html/${encodeURIComponent(version.id)}" download>${index === 0 ? "Baixar HTML atual" : "Baixar versão anterior"} · ${html(new Date(version.createdAt).toLocaleString("pt-BR"))}</a></li>`
    ).join("")}</ul></details>` : ""}
    ${!hosted && project && !project.publicacao ? link("publicar","Vincular um Short já publicado",project.id,"text-link") : ""}`
}

function generating(project) {
  const current = cache.progress
  const inProgress = Boolean(project?.jobId || cache.busy)
  const hasPreview = Boolean(version(project))
  return `${heading("Gerando vídeo", project?.titulo)}
    <div class="production-grid"><div class="surface progress-card"><h2 id="step-label">${html(inProgress ? current?.message || "Preparando a próxima etapa" : hasPreview ? "Prévia pronta" : "Nenhuma etapa em andamento")}</h2>
      <progress id="progress-meter" max="100" ${inProgress && Number.isFinite(current?.pct) ? `value="${current.pct}"` : inProgress ? "" : `value="${hasPreview ? 100 : 0}"`}></progress>
      <img class="progress-art" src="/studio-progress.webp" alt="">
      <ul class="stage-list">${[["Roteiro", project?.roteiro?.roteiro], ["Narração", project?.audio], ["Animação e prévia", hasPreview]].map(([stage, done]) => `<li data-done="${Boolean(done)}"><span aria-hidden="true">${done ? "✓" : "○"}</span>${stage}<small>${done ? "Pronto" : "Pendente"}</small></li>`).join("")}</ul>
      ${project?.urls?.audio ? `<audio controls preload="metadata" src="${html(project.urls.audio)}"></audio>${hosted ? `<a class="text-link" href="${html(project.urls.audio)}" download="narracao.wav">Baixar narração WAV</a>` : ""}` : ""}
      ${!inProgress && project ? `<div class="actions">${link(hasPreview ? "revisao" : "criar", hasPreview ? "Abrir revisão" : "Voltar ao roteiro", project.id)}</div>` : ""}
    </div><aside class="surface production-preview"><div class="workspace-panel-title"><h2>Prévia do vídeo</h2></div>
    ${hasPreview ? `<div class="poster-stage"><video class="portrait" controls playsinline preload="metadata" src="${html(videoUrl(project, version(project)))}"></video></div>` : '<div class="poster-stage pending-preview"><span class="empty-mark" aria-hidden="true">▶</span><p>A prévia aparece quando estiver pronta.</p></div>'}</aside></div>`
}

function review(project) {
  const item = version(project)
  const media = item ? videoUrl(project, item) : project.urls.mp4
  if (!media) return `${heading(project.titulo)}${link("criar", "Voltar ao roteiro", project.id)}`
  const versions = (project.versions || []).map((entry, i) => `<option value="${html(entry.id)}"${entry.id === item?.id ? " selected" : ""}>Versão ${i + 1}</option>`).join("")
  const messages = (project.history || []).map((entry) => `<div class="message ${entry.role === "user" ? "user" : ""}"><span>${entry.role === "user" ? "Você" : html(entry.model?.split("/").at(-1) || "OpenCode Go")} · Cena ${entry.scene + 1}${entry.attachment ? " · Imagem anexada" : ""}</span><p>${html(entry.text)}</p></div>`).join("")
  return `<div class="review-tabs" role="group" aria-label="Painel de revisão"><button data-action="tab" data-id="preview" aria-pressed="${cache.mobileTab === "preview"}">Prévia</button><button data-action="tab" data-id="chat" aria-pressed="${cache.mobileTab === "chat"}">Chat</button></div>
  <div class="review-grid" data-tab="${html(cache.mobileTab)}"><section class="surface review-preview">
    <div class="workspace-panel-title"><h2>Prévia da animação</h2>${item ? `<label class="sr-only" for="review-version">Versão</label><select id="review-version" ${project.publicacao ? "disabled" : ""}>${versions}</select>` : '<span class="workspace-badge">Versão original</span>'}</div>
    <div class="review-stage cinema-stage"><video class="portrait" id="review-video" controls playsinline preload="metadata" src="${html(media)}"></video></div>
    ${item ? `<div class="review-scenes"><div class="scene-heading"><h3>Cenas</h3><span id="active-scene-label"></span></div><div class="scene-list" aria-label="Cenas">${item.scenes.map((scene, index) => `<button type="button" data-action="seek" data-id="${scene.inicio}"><span class="scene-frame" aria-hidden="true"></span><strong>Cena ${index + 1}</strong><span>${clock(scene.inicio)}</span></button>`).join("")}</div></div>` : '<div class="review-file-details"><span>Vídeo vertical</span><span>MP4 original</span></div>'}
    ${project.versions?.length > 1 || project.urls.mp4 ? `<div class="review-actions">
      ${project.versions?.length > 1 ? link("comparar", "Comparar versões", project.id) : ""}
      ${project.urls.mp4 ? link("publicar", "Publicar no YouTube", project.id, "text-link") : ""}
    </div>` : ""}
  </section>
  <section class="surface chat"><div class="workspace-panel-title"><h2>Chat de edição</h2><div class="chat-model">${item ? modelOptions("Modelo", "chatModel", item.model, "opencode-go/kimi-k3") : ""}<span class="workspace-badge">OpenCode Go</span></div></div>
    <div class="messages${messages ? "" : " messages-empty"}" id="messages">${messages || `<div class="chat-empty"><span class="chat-empty-icon" aria-hidden="true">✦</span><h3>${item ? "Qual cena você quer ajustar?" : "Edição por cena"}</h3><p>${item ? "Selecione uma cena ou pause a prévia no ponto que quer ajustar. Você pode pedir mudanças de câmera, cenário e movimento." : "Este vídeo foi gerado no motor anterior. Para conversar com a IA sobre uma cena, gere uma prévia com o kit 3D usando sua narração atual."}</p>${!item && project.audio && !project.publicacao ? link("criar", "Abrir roteiro e narração", project.id) : ""}</div>`}</div>
    ${item ? `<form id="chat-form" class="chat-form">
      <span id="scene-context" class="tag">Cena 1 · 00:00</span><label class="sr-only" for="chat-message">Mensagem</label>
      <div class="composer"><label class="chat-attach" title="Anexar imagem de referência" for="chat-reference"><span aria-hidden="true">＋</span><span class="sr-only">Anexar imagem de referência</span></label>
      <input class="sr-only" type="file" id="chat-reference" name="reference" accept="image/png,image/jpeg,image/webp">
      <textarea id="chat-message" name="message" rows="2" maxlength="2000" placeholder="Descreva o que quer mudar…" required></textarea><button class="button chat-send" aria-label="Enviar mensagem" ${project.publicacao || !cache.config.go ? "disabled" : ""}>↑</button></div><span id="chat-file" class="chat-file" hidden></span>
    </form>` : '<div class="chat-form chat-unavailable"><span class="tag">Prévia do kit necessária</span><p>O campo de mensagem aparece quando o projeto tem cenas editáveis.</p></div>'}
  </section>
  </div>`
}

function comparison(project) {
  const versions = project.versions ?? []
  if (versions.length < 2) return review(project)
  const current = version(project)
  const prior = versions[versions.indexOf(current) - 1] || versions.find((item) => item.id !== current.id)
  const choices = [prior, current]
  return `${link("revisao", "← Voltar à revisão", project.id, "text-link")}${heading("Comparar versões", project.titulo)}
  <div class="review-tabs"><button data-action="compare-tab" data-id="a" aria-pressed="${cache.compare === "a"}">Versão ${versions.indexOf(prior) + 1}</button><button data-action="compare-tab" data-id="b" aria-pressed="${cache.compare === "b"}">Versão ${versions.indexOf(current) + 1}</button></div>
  <div class="compare-grid" data-tab="${html(cache.compare)}">${choices.map((entry, i) => `<section class="surface compare-card" data-slot="${i === 0 ? "a" : "b"}">
    <label>Versão<select class="compare-version" data-slot="${i === 0 ? "a" : "b"}">${versions.map((item, n) => `<option value="${html(item.id)}" ${item.id === entry.id ? "selected" : ""}>Versão ${n + 1}</option>`).join("")}</select></label>
    <video class="portrait compare-video" muted playsinline preload="metadata" src="${html(videoUrl(project, entry))}"></video>
    <button class="button ${i === 0 ? "secondary" : ""}" data-action="use-version" data-id="${html(entry.id)}" ${project.publicacao ? "disabled" : ""}>Usar esta versão</button>
  </section>`).join("")}</div>
  <div class="surface compare-transport"><button class="button secondary" id="compare-play">Reproduzir</button>
    <label class="sr-only" for="compare-time">Instante da comparação</label><input type="range" min="0" max="0" step="0.05" value="0" id="compare-time">
    <output id="compare-clock" for="compare-time">00:00</output></div>`
}

function exportVideo(project) {
  const item = version(project)
  const media = project.urls.mp4 || (item && videoUrl(project, item))
  return `${link("revisao", "← Voltar à revisão", project.id, "text-link")}${heading(project.urls.mp4 ? "Seu vídeo está pronto" : "Exportar vídeo", project.titulo)}
    <div class="delivery">${deliveryPreview(media)}
      <section class="form surface delivery-panel"><h2>Arquivo final</h2>
      ${media ? `<div class="file-card"><span class="empty-mark" aria-hidden="true">▤</span><div><strong>${html(project.titulo)}.mp4</strong><p>${project.urls.mp4 ? "Pronto para baixar" : "Aguardando renderização final"}</p></div></div>
      <dl class="file-specs"><div><dt>Formato</dt><dd>MP4 vertical</dd></div>${item ? "<div><dt>Resolução final</dt><dd>1080 × 1920 · 30 fps</dd></div>" : ""}</dl>` : ""}
      ${project.urls.mp4 ? `<div class="actions"><a class="button" href="${html(project.urls.mp4)}" download>↓ Baixar MP4</a>${link("publicar", "Publicar no YouTube", project.id)}</div>`
      : item ? '<button class="button" data-action="export">Gerar MP4 final</button>' : "<p>Gere uma prévia antes de exportar.</p>"}</section></div>`
}

function deliveryPreview(media) {
  return `<section class="surface delivery-preview"><div class="workspace-panel-title"><h2>Prévia do vídeo</h2><span class="workspace-badge">9:16</span></div>
    ${media ? `<div class="poster-stage"><video class="portrait" controls playsinline preload="metadata" src="${html(media)}"></video></div>` :
      '<div class="poster-stage pending-preview"><span class="empty-mark" aria-hidden="true">▶</span><p>Seu vídeo aparecerá aqui.</p></div>'}</section>`
}

function publicationLibrary() {
  const candidates = cache.projects.filter(p => !p.jobId && !p.publicacao && (p.urls?.mp4 || version(p)))
  const published = cache.projects.filter(p => p.publicacao)
  return `${heading("Publicação", "Escolha um vídeo que você já criou no Studio.")}
    <div class="publication-layout"><section class="surface form publication-picker">
      <h2>Vídeo do projeto</h2>
      ${candidates.length ? `<form id="publication-picker" class="channel-picker">
        <label>Selecione o vídeo<select name="projectId" required><option value="">Selecione…</option>
          ${candidates.map(p => `<option value="${html(p.id)}">${html(p.titulo)} · ${p.urls.mp4 ? "MP4 pronto" : "Prévia pronta"}</option>`).join("")}
        </select></label><button class="button">Revisar publicação</button>
      </form>` : `<p>${hosted ? "A renderização na Vercel ainda está pendente. Os MP4 gerados no Studio local aparecem na biblioteca local." : "Gere uma prévia ou exporte um vídeo para começar."}</p>${link("projetos", "Abrir projetos")}`}
      ${embedded ? '<a class="text-link" href="/#vincular" target="_top">Vincular um Short já publicado</a>' : ""}
    </section>${candidates.length ? '<div id="publication-selection" aria-live="polite"></div>' : ""}</div>
    ${published.length ? `<div class="section-heading"><h2>Publicações anteriores</h2></div>${projectCards(published)}` : ""}`
}

function updatePublicationPreview(id) {
  const selected = cache.projects.find(project => project.id === id)
  const target = document.querySelector("#publication-selection")
  if (!selected || !target) {
    if (target) target.replaceChildren()
    return
  }
  const item = version(selected)
  const media = selected.urls.mp4 || (item && videoUrl(selected, item))
  const channel = channelProject(selected)
  target.innerHTML = `<div class="surface publication-preview"><div class="workspace-panel-title"><h2>${html(selected.titulo)}</h2></div>
    <div class="poster-stage cinema-stage"><video class="portrait" controls playsinline preload="metadata" src="${html(media)}"></video></div>
    <div class="channel-row">${channel ? avatar(channel) : ""}<div><small>Canal de destino</small><h3>${html(channel?.title || "A definir na revisão")}</h3></div></div></div>`
}

function publish(project) {
  const channel = channelProject(project)
  const media = project.urls.mp4
  if (project.publicacao) {
    const id = project.publicacao.videoId || project.publicacao.id
    const scheduled = Date.parse(project.publicacao.publishAt) > Date.now()
    return `${link("publicacao", "← Voltar à publicação", "", "text-link")}${heading(scheduled ? "Publicação agendada" : "Vídeo no YouTube", project.titulo)}
    <div class="delivery">${deliveryPreview(media)}<div class="surface delivery-panel studio-empty"><span class="empty-mark" aria-hidden="true">✓</span><h2>${scheduled ? html(new Date(project.publicacao.publishAt).toLocaleString("pt-BR")) : project.publicacao.linked ? "Short vinculado" : "Envio concluído"}</h2>
    ${id ? `<a class="button" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">Abrir no YouTube</a>` : ""}</div></div>`
  }
  return `${link("publicacao", "← Escolher outro vídeo", "", "text-link")}${heading("Publicar no YouTube", project.titulo)}
  <div class="delivery">${deliveryPreview(media)}
  ${!media ? `<section class="surface form delivery-panel"><h2>Preparar MP4 final</h2>
    ${version(project) ? '<p>O Studio vai renderizar a versão selecionada e voltar para esta tela.</p><button class="button" data-action="export" data-next="publicar">Gerar MP4 para publicação</button>' : link("criar", "Voltar ao roteiro", project.id)}
    </section>` : !channel ? `<section class="surface form delivery-panel"><h2>Canal de destino</h2>
    ${cache.channels.length && !project.channelId ? `<form id="project-channel-form" class="channel-picker">
      <label>Canal<select name="channelId">${cache.channels.map((item) => `<option value="${html(item.id)}">${html(item.title)}</option>`).join("")}</select></label><button class="button">Vincular canal ao projeto</button></form>` : link("canais", "Conectar canal")}</section>` : `
    <form id="publish-form" class="surface form delivery-panel">
    <div class="channel-row destination-row">${avatar(channel, "medium")}<div><span>Canal de destino</span><h2>${html(channel.title)}</h2><p>${html(channel.handle || channel.id)}</p></div></div>
    <label>Título<input name="title" maxlength="100" value="${html(project.titulo)}" required></label>
    <label>Descrição<textarea name="description" maxlength="5000" rows="4">${html(project.roteiro?.descricao)}</textarea></label>
    <label>Visibilidade<select name="visibility"><option value="private">Privado</option><option value="unlisted">Não listado</option><option value="public">Público</option><option value="scheduled">Agendar</option></select></label>
    <label id="schedule-field" hidden>Data e hora local (${html(Intl.DateTimeFormat().resolvedOptions().timeZone)})<input type="datetime-local" name="schedule"></label>
    <div class="actions"><button class="button">Revisar e publicar</button><a class="button secondary" href="${html(media)}" download>Baixar MP4</a></div></form>`}</div>
    ${channel ? `<form id="link-short-form" class="surface form scene-plan"><h2>Já publicou pelo YouTube Studio?</h2><label>Link do Short<input type="url" name="url" required placeholder="https://www.youtube.com/shorts/…"></label><button class="button secondary">Vincular Short ao projeto</button></form>` : ""}`
}

function redraw(page, project, pending) {
  releaseSceneFrames?.()
  releaseSceneFrames = undefined
  const workspace = (page === "revisao" || (page === "comparar" && (project.versions?.length || 0) < 2)) && Boolean(project?.urls.mp4 || version(project))
  content.classList.toggle("review-workspace", workspace)
  content.dataset.page = page
  headerView(workspace ? project : null)
  const pages = {
    inicio: home, pautas: topicPage, canais: channels, conectar: () => connect(pending, route()[1]), criar: () => create(project),
    gerando: () => generating(project), revisao: () => review(project), comparar: () => comparison(project),
    exportar: () => exportVideo(project), publicacao: publicationLibrary, publicar: () => publish(project),
    projetos: () => `<div class="library-toolbar"><h1>Projetos</h1>${hosted ? `<label class="archive-filter"><input id="archived-projects" type="checkbox" ${cache.showArchived ? "checked" : ""}>Mostrar arquivados</label>` : ""}
      <label class="project-search"><span class="sr-only">Buscar projetos</span><input id="project-search" type="search" placeholder="Buscar projetos"></label>${link("criar", "Novo vídeo", "", "button")}</div>
      <div id="project-results" aria-live="polite">${projectCards(cache.projects)}</div>`,
  }
  const showFlow = page === "criar" || (project && ["revisao", "publicar"].includes(page))
  content.innerHTML = (showFlow ? productionFlow(project, page) : "") + (pages[page] || home)()
  content.setAttribute("aria-busy", "false")
  if (embedded) for (const oauthLink of content.querySelectorAll('a[href^="/api/youtube/oauth/start"]')) oauthLink.target = "_top"
  if (hosted && page === "canais") content.insertAdjacentHTML("beforeend", '<div class="actions"><a class="button" href="/#integracoes" target="_top">Integração com o YouTube</a></div>')
  if (page === "criar") {
    restoreDraft(project)
    const form = document.querySelector("#create-form")
    if (importedScript && (!project || importedScript.applyDraft)) {
      const { title, idea, script } = importedScript
      for (const [name, value] of Object.entries({ title, idea, script })) {
        if (typeof value === "string" && form.elements[name]) form.elements[name].value = value.slice(0, form.elements[name].maxLength)
      }
      saveDraft(form)
      importedScript = undefined
    }
    sendToPanel("studio:fields", { title: form.elements.title.value, script: form.elements.script.value })
    const next = [...form.querySelectorAll('button[name="intent"]')].find(button =>
      !button.disabled && button.value === "animate") || form.querySelector('button[value="audio"]:not(:disabled)')
    const canReview = project?.urls?.mp4 || version(project)
    sendToPanel("studio:mobile-action", canReview ? { intent: "review", label: "Revisar vídeo" } :
      next ? { intent: next.value, label: next.textContent.trim() } : null)
    loadVoiceLibrary(project)
    updateCreateMeta(form)
  } else sendToPanel("studio:mobile-action", null)
  for (const field of content.querySelectorAll(".model-field select")) field.closest(".model-field").querySelector(".model-info").innerHTML = modelInfo(field.value)
  if (workspace) bindReview()
  if (page === "comparar") bindCompare()
}

async function channelData() {
  const data = await api("/canais")
  cache.youtubeConfigured = data.configured
  cache.channels = data.channels
  cache.originalId = data.originalId
  const last = localStorage.getItem("studio-channel")
  cache.activeId = last === "" || data.channels.some((channel) => channel.id === last) ? last : data.channels[0]?.id || ""
}

async function navigate() {
  const request = ++navigation
  const [page, raw] = route()
  const id = raw ? decodeURIComponent(raw) : ""
  try {
    cache.config ??= await api("/config")
    await channelData()
    const project = id && page !== "conectar" ? await api(`/projetos/${encodeURIComponent(id)}`) : null
    const pending = id && page === "conectar" ? await api(`/canais/pendente/${encodeURIComponent(id)}`) : null
    const channel = channelProject(project)
    if (project) cache.activeId = channel?.id || ""
    if (["inicio", "projetos", "publicacao"].includes(page)) cache.projects = await api(`/projetos?canal=${encodeURIComponent(cache.activeId)}${page === "publicacao" ? "&publicacao=1" : ""}${page === "projetos" && cache.showArchived ? "&arquivados=1" : ""}`)
    if (["pautas","inicio"].includes(page)) cache.book = await api("/pautas?canal="+encodeURIComponent(cache.activeId))
    if (request !== navigation) return
    cache.current = project
    sendToPanel("studio:channel", activeChannel())
    if (["revisao", "comparar", "exportar", "publicar"].includes(page) && !project) { location.hash = "projetos"; return }
    redraw(page, project, pending)
    if (project?.jobId && !cache.busy) resume(project)
  } catch (error) {
    if (request !== navigation) return
    releaseSceneFrames?.()
    releaseSceneFrames = undefined
    content.classList.remove("review-workspace")
    content.setAttribute("aria-busy", "false")
    const returnLink = page === "conectar" ? link("canais", "Voltar a Meus canais", "", "text-link") : link("inicio", "Voltar ao início", "", "text-link")
    content.innerHTML = `${heading(page === "conectar" ? "Conectar canal do YouTube" : "Studio 3D")}<p class="notice">${html(error.message)}</p>${returnLink}`
    headerView()
  }
}

function bindReview() {
  const video = document.querySelector("#review-video")
  const messages = document.querySelector("#messages")
  if (messages) messages.scrollTop = messages.scrollHeight
  if (!video) return
  function sync() {
    const scenes = version(cache.current)?.scenes ?? []
    const index = Math.max(0, scenes.findLastIndex((scene) => scene.inicio <= video.currentTime))
    cache.time = video.currentTime
    const activeSceneLabel = document.querySelector("#active-scene-label")
    if (activeSceneLabel) activeSceneLabel.textContent = `Cena ${index + 1} de ${scenes.length}`
    const context = document.querySelector("#scene-context")
    if (context) context.textContent = `Cena ${index + 1} · ${clock(video.currentTime)}`
    document.querySelectorAll(".scene-list button").forEach((button, n) => button.setAttribute("aria-current", String(n === index)))
  }
  video.addEventListener("loadedmetadata", () => { if (cache.time < video.duration) video.currentTime = cache.time; sync() })
  video.addEventListener("seeking", sync)
  video.addEventListener("timeupdate", sync)
  sync()
  const sceneList = document.querySelector(".scene-list")
  if (sceneList) releaseSceneFrames = loadSceneFrames(video.currentSrc || video.src, sceneList)
}

function loadSceneFrames(src, list) {
  const source = document.createElement("video")
  source.preload = "auto"
  source.muted = true
  const canvas = document.createElement("canvas")
  canvas.width = 144
  canvas.height = 82
  const context = canvas.getContext("2d")
  if (!context) return
  const queue = []
  let current
  function next() {
    if (current || !queue.length || !list.isConnected || source.readyState < 1) return
    current = queue.shift()
    source.currentTime = Math.min(Number(current.dataset.id) + .35, Math.max(0, source.duration - .05))
  }
  source.addEventListener("loadedmetadata", next)
  source.addEventListener("seeked", () => {
    if (!current || !list.isConnected) return
    const scale = Math.max(canvas.width / source.videoWidth, canvas.height / source.videoHeight)
    const width = source.videoWidth * scale
    const height = source.videoHeight * scale
    context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    const image = new Image()
    image.alt = ""
    image.src = canvas.toDataURL("image/jpeg", .73)
    current.querySelector(".scene-frame").replaceWith(image)
    current = null
    next()
  })
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      watcher.unobserve(entry.target)
      queue.push(entry.target)
    }
    if (queue.length && !source.getAttribute("src")) source.src = src
    next()
  }, { root: list })
  list.querySelectorAll("button").forEach((button) => watcher.observe(button))
  return () => {
    watcher.disconnect()
    source.removeAttribute("src")
    source.load()
  }
}

function bindCompare() {
  const players = [...document.querySelectorAll(".compare-video")]
  const range = document.querySelector("#compare-time")
  const play = document.querySelector("#compare-play")
  const output = document.querySelector("#compare-clock")
  if (players.length !== 2 || !range || !play) return
  const leader = players[0]
  function updateClock(time) {
    range.value = time
    output.textContent = clock(time)
  }
  for (const video of players) {
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(cache.time, video.duration)
      range.max = String(Math.min(...players.map((player) => player.duration || video.duration)))
      updateClock(video.currentTime)
    })
  }
  range.addEventListener("input", () => {
    cache.time = Number(range.value)
    for (const video of players) if (video.readyState) video.currentTime = cache.time
    updateClock(cache.time)
  })
  leader.addEventListener("timeupdate", () => {
    const other = players[1]
    cache.time = leader.currentTime
    if (other.readyState && Math.abs(other.currentTime - cache.time) > 0.25) other.currentTime = Math.min(cache.time, other.duration)
    updateClock(cache.time)
  })
  const pause = () => { players.forEach((video) => video.pause()); play.textContent = "Reproduzir" }
  leader.addEventListener("ended", pause)
  play.addEventListener("click", async () => {
    if (!leader.paused) return pause()
    try { await Promise.all(players.map((video) => video.play())); play.textContent = "Pausar" }
    catch { pause(); notify("Não foi possível reproduzir as duas prévias.", true) }
  })
}

function progressView(job) {
  const message = job.step || "Etapa em andamento"
  const pct = Number(job.progress ?? job.pct)
  cache.progress = { message: typeof message === "string" ? message : "Etapa em andamento", pct }
  const label = document.querySelector("#step-label")
  const meter = document.querySelector("#progress-meter")
  if (label) label.textContent = cache.progress.message
  if (meter && Number.isFinite(pct)) meter.value = pct
  notify(cache.progress.message)
}

async function jobResult(response) {
  if (response.project) return response.project
  if (!response.jobId) throw new Error("O servidor não retornou a operação.")
  for (;;) {
    const job = await api(`/api/jobs/${encodeURIComponent(response.jobId)}`)
    progressView(job)
    if (["error", "failed"].includes(job.status)) throw new Error(job.error || "A operação falhou.")
    if (["done", "complete", "completed"].includes(job.status)) {
      if (!job.result?.project) throw new Error("A operação finalizou sem retornar o projeto.")
      return job.result.project
    }
    await wait(1200)
  }
}

const projectApi = (project, action, data) => api(`/projetos/${encodeURIComponent(project.id)}/${action}`, data)

function readReference(file) {
  if (!file?.size) return null
  if (file.size > 1_500_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPEG ou WebP de até 1,5 MB.")
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."))
    reader.readAsDataURL(file)
  })
}

async function action(work) {
  if (cache.busy) return
  cache.busy = true
  notify("Processando…")
  try { await work(); notify("") }
  catch (error) { notify(error.message, true) }
  finally { cache.busy = false }
}

function go(page, id) {
  const hash = include(page, id)
  if (location.hash === hash) return navigate()
  location.hash = hash
}

function resume(project) {
  action(async () => {
    const result = await jobResult({ jobId: project.jobId })
    if (route()[0] === "gerando") go(result.scenePlan ? "criar" : result.versions?.length ? "revisao" : "criar", result.id)
    else await navigate()
  })
}

content.addEventListener("submit", (event) => {
  event.preventDefault()
  const form = event.target
  const data = Object.fromEntries(new FormData(form))
  const project = cache.current
  if (form.id === "publication-picker" && data.projectId) go("publicar", data.projectId)
  if (form.id === "channel-profile-form") action(async () => {
    const profile = await api("/perfil-canal", { ref: data.ref.trim() })
    localStorage.setItem("studio-channel", profile.id)
    go("inicio")
  })
  if (form.id === "ideas-form" || form.id === "reference-form") {
    const operation = form.id === "reference-form" ? "referencia" : event.submitter?.value || "sugerir"
    const channelId = cache.activeId
    action(async () => {
      if (data.scriptModel) localStorage.setItem("scriptModel", data.scriptModel)
      await api("/pautas", { ...data, action: operation, model: data.scriptModel, channelId, channelTitle: activeChannel()?.title })
      if (route()[0] === "pautas" && channelId === cache.activeId) await navigate()
    })
  }
  if (form.id === "plan-form") action(async () => {
    const next = await jobResult(await projectApi(project,"plano/ajuste",{ ...data, planId: project.scenePlan.id, model: document.querySelector('[name="animationModel"]').value }))
    if (route()[1] === project.id) { cache.current = next; redraw("criar", next) }
  })
  if (form.id === "link-short-form") action(async () => {
    await jobResult(await projectApi(project,"vincular-short",{ url: data.url }))
    go("publicar",project.id)
  })
  if (form.id === "create-form") {
    action(async () => {
      const intent = event.submitter?.value || "save"
      if (["audio","produce","animate"].includes(intent) && !data.voice) throw Error("Selecione uma voz para narrar.")
      if (data.scriptModel) localStorage.setItem("scriptModel", data.scriptModel)
      localStorage.setItem("animationModel", data.animationModel)
      if (intent === "script") {
        if (!data.idea?.trim()) throw new Error("Digite o tema do vídeo.")
        const next = await jobResult(await api("/projetos", { idea: data.idea, duration: Number(data.duration), channelId: cache.activeId, model: data.scriptModel, pautaId: data.pautaId }))
        localStorage.removeItem(draftKey(project))
        go("criar", next.id)
        return
      }
      const titulo = data.title?.trim() || data.idea?.trim() || "Novo vídeo"
      const roteiro = data.script?.trim() || ""
      if (["produce", "animate", "audio"].includes(intent) && !roteiro) throw new Error("Escreva, cole ou gere o roteiro primeiro.")
      const next = project || (await api("/projetos", { idea: titulo, duration: Number(data.duration) || 60, manual: true, channelId: cache.activeId, pautaId:data.pautaId })).project
      if (intent === "save") {
        await projectApi(next, "roteiro", { titulo, roteiro, duration:next.duracaoAlvo, pautaId:next.pautaId, channelId:next.channelId })
        localStorage.removeItem(draftKey(project))
        go("criar", next.id)
        return
      }
      if (intent === "animate" && (roteiro !== next.roteiro.roteiro || titulo !== next.titulo || (next.voice && data.voice !== next.voice))) {
        throw new Error("Gere uma nova narração para aplicar as mudanças de título, voz ou roteiro.")
      }
      if (!next.audio) await projectApi(next, "roteiro", { titulo, roteiro, duration:next.duracaoAlvo, pautaId:next.pautaId, channelId:next.channelId })
      go("gerando", next.id)
      try {
        const narrated = intent === "animate" ? next : await jobResult(await projectApi(next, "narracao", { titulo, roteiro, voice: data.voice, descricao: next.roteiro?.descricao }))
        localStorage.removeItem("studio-draft:" + JSON.stringify([next.channelId || cache.activeId,project?.id || "novo"]))
        if (intent === "audio") { go("criar", narrated.id); return }
        cache.current = narrated
        if (route()[0] === "gerando") redraw("gerando", narrated)
        const animated = await jobResult(await projectApi(narrated, intent === "animate" ? "plano" : "animacao", { model: data.animationModel }))
        go(intent === "animate" ? "criar" : "revisao", animated.id)
      } catch (error) { go("criar", next.id); throw error }
    })
  }
  if (form.id === "chat-form") {
    action(async () => {
      const video = document.querySelector("#review-video")
      video?.pause()
      const item = version(project)
      const scene = Math.max(0, item.scenes.findLastIndex((entry) => entry.inicio <= cache.time))
      const model = document.querySelector('[name="chatModel"]').value
      const image = await readReference(data.reference)
      const next = await jobResult(await projectApi(project, "chat", { version: item.id, scene, time: cache.time, message: data.message, model, image }))
      if (route()[0] === "revisao") { cache.current = next; redraw("revisao", next) }
    })
  }
  if (form.id === "publish-form") {
    const channel = channelProject(project)
    const visibility = { private: "Privado", unlisted: "Não listado", public: "Público" }
    const scheduled = data.visibility === "scheduled"
    const date = new Date(data.schedule)
    if (scheduled && !(date.getTime() > Date.now())) return notify("Escolha uma data futura.",true)
    if (!channel || !window.confirm(`Enviar “${data.title}” para ${channel.title}${scheduled ? " e agendar para " + date.toLocaleString("pt-BR") : " com visibilidade " + visibility[data.visibility]}?`)) return
    action(async () => {
      const next = await jobResult(await projectApi(project, "publicacao", { channelId: channel.id, titulo: data.title, descricao: data.description, privacyStatus: scheduled ? "private" : data.visibility, publishAt: scheduled ? date.toISOString() : "" }))
      cache.current = next
      redraw("publicar", next)
    })
  }
  if (form.id === "project-channel-form") action(async () => {
    await projectApi(project, "canal", { channelId: data.channelId })
    localStorage.setItem("studio-channel", data.channelId)
    await navigate()
  })
})

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]")
  if (!button) return
  const { action: kind, id } = button.dataset
  const project = cache.current
  if (kind === "archive-project") action(async () => {
    const target = cache.projects.find(item => item.id === id)
    if (!target) return
    await projectApi(target, "arquivar", { archived: !target.archived })
    await navigate()
  })
  if (kind === "delete-project") {
    const target = cache.projects.find(p => p.id === id)
    if (!target || !window.confirm(`Excluir “${target.titulo}” deste Studio? O roteiro, a narração e os vídeos locais serão removidos. Uma publicação no YouTube continuará no canal.`)) return
    action(async () => {
      await projectApi(target, "excluir", {})
      localStorage.removeItem(draftKey(target))
      await navigate()
    })
  }
  if (kind === "use-idea" || kind === "use-reference") {
    const idea = cache.book.ideas.find(i => i.id === id)
    const ref = cache.book.references.find(r => r.id === id)
    const fields = { ...(readDraft(null)?.fields || {}), idea: idea ? idea.title + " — " + idea.hook : ref.note + " (" + ref.url + ")", pautaId: idea?.id || "" }
    localStorage.setItem(draftKey(null),JSON.stringify({ fields, savedAt: new Date().toISOString() }))
    go("criar")
  }
  if (kind === "queue-idea") action(async () => {
    await api("/pautas",{ action:"fila", channelId:cache.activeId, id, queued:!cache.book.ideas.find(i=>i.id===id)?.queued })
    await navigate()
  })
  if (kind === "render-plan") action(async () => {
    const form = document.querySelector("#create-form")
    if (form.elements.script.value.trim() !== project.roteiro.roteiro || (project.voice && form.elements.voice.value !== project.voice)) throw Error("Gere uma narração com o texto e a voz escolhidos antes de aprovar as cenas.")
    const model = form.elements.animationModel.value
    const job = await projectApi(project,"animacao",{model,planId:project.scenePlan.id})
    go("gerando",project.id)
    try { const result = await jobResult(job); go("revisao",result.id) }
    catch(error) { go("criar",project.id); throw error }
  })
  if (kind === "seek") {
    const video = document.querySelector("#review-video")
    if (video) { video.pause(); video.currentTime = Number(id) }
  }
  if (kind === "tab") {
    cache.mobileTab = id
    document.querySelector(".review-grid").dataset.tab = id
    document.querySelectorAll("[data-action=tab]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)))
  }
  if (kind === "compare-tab") {
    cache.compare = id
    document.querySelector(".compare-grid").dataset.tab = id
    document.querySelectorAll("[data-action=compare-tab]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)))
  }
  if (kind === "channel") action(async () => {
    const selected = cache.channels.find(channel => channel.id === id)
    if (hosted && selected && !selected.banner) {
      try { await api("/perfil-canal", { ref: selected.id }) } catch { /* The cached profile remains usable. */ }
    }
    localStorage.setItem("studio-channel", id)
    cache.time = 0
    go("inicio")
  })
  if (kind === "add-channel") action(async () => {
    const channel = await api(`/canais/pendente/${encodeURIComponent(id)}`, {})
    localStorage.setItem("studio-channel", channel.id)
    go("inicio")
  })
  if (kind === "use-version") action(async () => {
    await projectApi(project, "versao", { version: id })
    go("revisao", project.id)
  })
  if (kind === "export") action(async () => {
    const next = await jobResult(await projectApi(project, "exportar", {}))
    const destination = button.dataset.next || "exportar"
    if (route()[0] === destination && cache.current?.id === next.id) {
      cache.current = next
      redraw(destination, next)
    }
  })
})

content.addEventListener("change", (event) => {
  const field = event.target
  if (field.name === "projectId" && field.form?.id === "publication-picker") updatePublicationPreview(field.value)
  if (field.id === "archived-projects") { cache.showArchived = field.checked; navigate() }
  if (field.matches(".model-field select")) field.closest(".model-field").querySelector(".model-info").innerHTML = modelInfo(field.value)
  if (field.closest("#create-form")) updateCreateMeta(field.form)
  const project = cache.current
  if (field.name === "visibility") {
    const scheduled = field.value === "scheduled"
    document.querySelector("#schedule-field").hidden = !scheduled
    field.form.elements.schedule.required = scheduled
  }
  if (field.id === "chat-reference") {
    const label = document.querySelector("#chat-file")
    label.textContent = field.files[0]?.name || ""
    label.hidden = !label.textContent
  }
  if (field.id === "review-version") action(async () => {
    cache.current = (await projectApi(project, "versao", { version: field.value })).project
    redraw("revisao", cache.current)
  })
  if (field.classList.contains("compare-version")) {
    const card = field.closest(".compare-card")
    const player = card.querySelector("video")
    for (const video of document.querySelectorAll(".compare-video")) video.pause()
    document.querySelector("#compare-play").textContent = "Reproduzir"
    cache.time = player.currentTime
    const selected = project.versions.find((item) => item.id === field.value)
    player.src = videoUrl(project, selected)
    card.querySelector("[data-action=use-version]").dataset.id = selected.id
  }
})

content.addEventListener("input", (event) => {
  if (event.target.id === "voice-search") {
    const form = event.target.form
    showVoiceOptions(form, form.elements.voice.value)
    return
  }
  if (event.target.closest("#create-form")) {
    const form = event.target.form
    saveDraft(form)
    updateCreateMeta(form)
    sendToPanel("studio:fields", { title: form.elements.title.value, script: form.elements.script.value })
  }
  if (event.target.id !== "project-search") return
  const terms = event.target.value.trim().toLocaleLowerCase("pt-BR")
  const found = cache.projects.filter((project) => project.titulo.toLocaleLowerCase("pt-BR").includes(terms))
  document.querySelector("#project-results").innerHTML = found.length || !terms ? projectCards(found) : '<p class="surface empty">Nenhum projeto encontrado.</p>'
})

if (embedded) {
  document.documentElement.classList.add("embedded-studio")
  const resize = new ResizeObserver(() => sendToPanel("studio:height", content.getBoundingClientRect().bottom + window.scrollY))
  resize.observe(content)
  resize.observe(header)
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return
    const data = event.data.data
    if (event.data.type === "studio:navigate" && typeof data === "string" && location.hash !== "#" + data) {
      location.replace("#" + data)
      return
    }
    if (event.data.type === "studio:submit-create") {
      const form = document.querySelector("#create-form")
      if (data === "review" && form && cache.current?.id) return go("revisao", cache.current.id)
      const button = ["audio", "animate"].includes(data) && form?.querySelector(`button[value="${data}"]:not(:disabled)`)
      if (button) form.requestSubmit(button)
      return
    }
    if (event.data.type !== "studio:script") return
    if (!data || typeof data !== "object") return
    const openSaved = typeof data.id === "string" && (hosted || data.id.startsWith("fdn-"))
    importedScript = openSaved && !data.applyDraft ? undefined : data
    go("criar", openSaved ? data.id : undefined)
    sendToPanel("studio:received")
  })
  window.addEventListener("hashchange", () => sendToPanel("studio:route", location.hash.slice(1)))
  sendToPanel("studio:ready")
}
window.addEventListener("hashchange", navigate)
const query = new URLSearchParams(location.search)
if (query.get("oauth") === "erro") notify(query.get("reason") === "access_denied"
  ? "O Google não autorizou a conta. Em modo de teste, use uma conta adicionada em Público-alvo → Usuários de teste."
  : query.get("msg") || "A conexão com o YouTube não foi concluída.", true)
navigate()
