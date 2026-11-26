import { primaryChannelId, chatChannelId } from "./chat-channel.js"
import { openWorkspace, openStudioScript, getActiveChannelProfile } from "./workspace.js"
import { fileFormats, splitChatFiles } from "./chat-files.js"
import { $, $$, el, icon, btn, extLink, numFmt, compact, apiJson, toast, renderMarkdown, hhmm } from "./ui.js"
import { initLive, getSnapshot, getAvatar, YPP_VIEWS_KEY, ringMarkup } from "./live.js"

/* ============================== Estado base ============================== */

const STORE_KEY = "studio:fatonexo:planejamento"
const MODEL_KEY = "studio:fatonexo:mimo-model"
const STATUSES = ["Ideia", "Prioridade", "Em produção", "Publicado"]
const FALLBACK_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238aaba3'%3E%3Crect width='24' height='24' fill='%230a2825'/%3E%3Ccircle cx='12' cy='9' r='4'/%3E%3Cpath d='M4 21c0-4.5 3.6-7 8-7s8 2.5 8 7z'/%3E%3C/svg%3E"

const board = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}")
    return {
      references: Array.isArray(raw.references) ? raw.references : [],
      ideas: Array.isArray(raw.ideas) ? raw.ideas : [],
      goal: raw.goal || {},
    }
  } catch {
    return { references: [], ideas: [], goal: {} }
  }
})()

const modelSelect = $("#global-model")
const defaultAiSelect = $("#default-ai-model")

function setSelectedModel(val) {
  if (!val) return
  localStorage.setItem(MODEL_KEY, val)
  if ([...modelSelect.options].some((o) => o.value === val)) modelSelect.value = val
  if (defaultAiSelect && [...defaultAiSelect.options].some((o) => o.value === val)) defaultAiSelect.value = val
}

modelSelect.addEventListener("change", () => setSelectedModel(modelSelect.value))
defaultAiSelect?.addEventListener("change", () => {
  setSelectedModel(defaultAiSelect.value)
  toast("IA padrão atualizada")
})
const currentModel = () => modelSelect.value || "opencode/mimo-v2.6-flash-free"

async function loadCatalogs() {
  try {
    const [modData, voiceData] = await Promise.all([
      apiJson("/api/painel/modelos"),
      apiJson("/api/painel/vozes"),
    ])
    const models = modData.available || []
    const buildModelOptions = (sel) => {
      if (!sel) return
      const groups = new Map()
      for (const m of models) {
        if (!groups.has(m.group)) groups.set(m.group, [])
        groups.get(m.group).push(m)
      }
      sel.replaceChildren(
        ...[...groups.entries()].map(([gName, items]) => {
          const og = document.createElement("optgroup")
          og.label = gName
          og.append(...items.map((m) => new Option(m.label, m.id)))
          return og
        }),
      )
    }
    buildModelOptions(modelSelect)
    buildModelOptions(defaultAiSelect)
    const saved = localStorage.getItem(MODEL_KEY) || modData.default || "opencode/mimo-v2.6-flash-free"
    setSelectedModel(saved)

    const renderCapChips = (sel, cap) => {
      const box = $(sel)
      if (!box) return
      box.replaceChildren(
        ...models
          .filter((m) => m.cap === cap)
          .map((m) => {
            const chip = el("button", m.label, `history-chip${m.id === currentModel() ? " active" : ""}`)
            chip.type = "button"
            chip.addEventListener("click", () => {
              setSelectedModel(m.id)
              renderCapChips("#ai-list-media", "media")
              renderCapChips("#ai-list-text", "text")
              toast(`IA padrão: ${m.label}`)
            })
            return chip
          }),
      )
    }
    renderCapChips("#ai-list-media", "media")
    renderCapChips("#ai-list-text", "text")

    const voiceSelect = $("#tts-voice")
    const prevVoice = voiceSelect?.value || "Kore"
    if (voiceSelect && Array.isArray(voiceData.voices)) {
      voiceSelect.replaceChildren(...voiceData.voices.map((v) => new Option(v.label, v.id)))
      if ([...voiceSelect.options].some((o) => o.value === prevVoice)) voiceSelect.value = prevVoice
    }
  } catch {}
}

const saveBoard = () => {
  localStorage.setItem(STORE_KEY, JSON.stringify(board))
  renderBoard()
}

const formData = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]))
function fillForm(form, values) {
  form.reset()
  for (const [k, v] of Object.entries(values || {})) {
    const input = form.elements.namedItem(k)
    if (input) input.value = v ?? ""
  }
}
const toText = (v) => (typeof v === "string" ? v : Array.isArray(v) ? v.map(toText).join(" • ") : v ? JSON.stringify(v) : "")
const jsonPost = (url, body) => apiJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

function listItems(selector, nodes, emptyText, emptyIcon = "file") {
  const target = $(selector)
  if (nodes.length) return target.replaceChildren(...nodes)
  const empty = el("div", "", "empty")
  empty.append(icon(emptyIcon), el("span", emptyText))
  target.replaceChildren(empty)
}
function makeCard(head, subtitle, ...actions) {
  const item = el("div", "", "strategy-item")
  item.append(head)
  if (subtitle) item.append(el("p", subtitle, "meta"))
  if (actions.filter(Boolean).length) {
    const row = el("div", "", "actions")
    row.append(...actions.filter(Boolean))
    item.append(row)
  }
  return item
}
const pill = (text, kind = "", iconName = "") => {
  const node = el("span", "", `metric-pill ${kind}`.trim())
  if (iconName) node.append(icon(iconName))
  node.append(document.createTextNode(text))
  return node
}
const skeleton = (n = 4) => {
  const box = el("div", "", "skeleton-stack")
  for (let i = 0; i < n; i++) box.append(el("i"))
  return box
}

/* ============================== Drawers ============================== */

const backdrop = $("#drawer-backdrop")
function openDrawer(id) {
  closeDrawers()
  const drawer = $(`#${id}`)
  drawer.classList.add("open")
  drawer.setAttribute("aria-hidden", "false")
  backdrop.hidden = false
}
function closeDrawers() {
  $$(".drawer.open").forEach((d) => {
    d.classList.remove("open")
    d.setAttribute("aria-hidden", "true")
  })
  backdrop.hidden = true
}
backdrop.addEventListener("click", closeDrawers)
$$("[data-close-drawer]").forEach((b) => b.addEventListener("click", closeDrawers))
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawers())
$$("[data-goto]").forEach((node) =>
  node.addEventListener("click", (e) => {
    e.preventDefault()
    openWorkspace(node.dataset.goto, true)
  }),
)

/* ============================== Pesquisa ============================== */

const searchForm = $("#youtube-search")
const searchStatus = $("#search-status")
const aiBriefCard = $("#ai-brief-card")
const toggleChannelFilter = () => ($("#channel-filter-wrap").hidden = searchForm.elements.type.value !== "channel")
searchForm.elements.type.addEventListener("change", toggleChannelFilter)
toggleChannelFilter()

function renderChannelDrawer(drawer, data) {
  const stats = data.stats || {}
  const pills = el("div", "", "metric-pills")
  if (data.subscribers != null) pills.append(pill(`${numFmt.format(data.subscribers)} inscritos`, "", "users"))
  if (stats.avgViews != null) pills.append(pill(`Média ${numFmt.format(stats.avgViews)} views/Short`, "hot", "zap"))
  if (stats.medianViews != null) pills.append(pill(`Mediana ${numFmt.format(stats.medianViews)}`, "", "target"))
  const grid = el("div", "", "mini-video-grid")
  for (const s of (data.recentShorts || []).slice(0, 10)) {
    const card = el("div", "", "mini-video-card")
    const img = document.createElement("img")
    img.src = s.thumbnail || `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`
    img.alt = s.title || "Short"
    img.loading = "lazy"
    const info = el("div", "", "mini-info")
    const title = extLink(s.title || s.id, s.url, "mini-title")
    info.append(title, pill(s.views != null ? `${compact.format(s.views)} views` : s.viewsText || "—", "hot", "eye"), btn("Analisar", () => analyzeVideo(s.id), "primary"))
    card.append(img, info)
    grid.append(card)
  }
  drawer.replaceChildren(pills, grid.children.length ? grid : el("p", "Nenhum Short recente neste canal.", "meta"))
}

function renderSearchResults(results) {
  const nodes = results.map((item, idx) => {
    const card = el("div", "", "media-card")
    card.style.animationDelay = `${Math.min(idx, 10) * 35}ms`
    const body = el("div", "", "media-body")
    const title = extLink(item.title || item.url, item.url, "media-title")

    if (item.type === "channel") {
      const avatar = document.createElement("img")
      avatar.className = "channel-avatar"
      avatar.src = item.avatar || FALLBACK_AVATAR
      avatar.alt = item.title || "Canal"
      avatar.loading = "lazy"
      avatar.addEventListener("error", () => (avatar.src = FALLBACK_AVATAR), { once: true })
      const pills = el("div", "", "metric-pills")
      if (item.handle) pills.append(pill(item.handle))
      if (item.subscribers != null) pills.append(pill(`${numFmt.format(item.subscribers)} inscritos`, "", "users"))
      else if (item.subscribersText) pills.append(pill(item.subscribersText, "", "users"))
      if (item.hitMonetizedGoal) pills.append(pill("Monetizável · 1.000+", "ok", "check"))
      else if (item.hitEntryGoal) pills.append(pill("Meta inicial · 500+", "ok", "check"))
      const drawer = el("div", "", "channel-drawer")
      drawer.hidden = true
      const actions = el("div", "", "actions")
      const explore = btn("Ver vídeos e views", async () => {
        if (!drawer.hidden) {
          drawer.hidden = true
          explore.lastChild.textContent = "Ver vídeos e views"
          return
        }
        explore.disabled = true
        explore.lastChild.textContent = "Carregando…"
        drawer.replaceChildren(skeleton(2))
        drawer.hidden = false
        try {
          renderChannelDrawer(drawer, await apiJson(`/api/painel/canal/${encodeURIComponent(item.id)}/videos`))
          explore.lastChild.textContent = "Ocultar vídeos"
        } catch (error) {
          drawer.replaceChildren(el("p", error.message, "meta"))
          explore.lastChild.textContent = "Ver vídeos e views"
        } finally {
          explore.disabled = false
        }
      }, "primary", "film")
      actions.append(
        explore,
        btn("Salvar", () => editReference({ type: "channel", title: item.title, url: item.url, channel: item.handle || item.title, notes: item.subscribers ? `${numFmt.format(item.subscribers)} inscritos` : "" }), "ghost", "bookmark"),
      )
      body.append(title, pills)
      if (item.description) body.append(el("p", item.description.slice(0, 120), "meta"))
      body.append(actions)
      card.append(avatar, body, drawer)
      return card
    }

    const wrap = el("div", "", "video-thumb-wrap")
    const thumb = document.createElement("img")
    thumb.className = "video-thumb"
    thumb.src = item.thumbnail || (item.id ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : "")
    thumb.alt = item.title || "Short"
    thumb.loading = "lazy"
    wrap.append(thumb)
    if (item.durationText || item.isShort) wrap.append(el("span", item.durationText || "Short", "thumb-badge"))
    const pills = el("div", "", "metric-pills")
    if (item.views != null) pills.append(pill(`${compact.format(item.views)} views`, "hot", "eye"))
    else if (item.viewsText) pills.append(pill(item.viewsText, "hot", "eye"))
    if (item.channel) pills.append(pill(item.channel))
    if (item.date) pills.append(pill(item.date))
    const actions = el("div", "", "actions")
    if (item.id) actions.append(btn("Analisar roteiro", () => analyzeVideo(item.id), "primary", "sparkles"))
    actions.append(
      btn("Salvar", () => editReference({ type: "video", title: item.title, url: item.url, channel: item.channel || "", date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") ? item.date : "", views: item.views ?? "" }), "ghost", "bookmark"),
    )
    body.append(title, pills, actions)
    card.append(wrap, body)
    return card
  })
  listItems("#search-results", nodes, "Nenhum resultado para esta busca.", "search")
  $("#search-results").classList.toggle("results-grid", nodes.length > 0)
}

function setSearching(busy) {
  $("#btn-ai-search").disabled = busy
  $("#btn-direct-search").disabled = busy
  $("#btn-ai-search span").textContent = busy ? "Buscando…" : "Buscar com IA"
  if (busy) {
    $("#search-results").classList.remove("results-grid")
    $("#search-results").replaceChildren(skeleton(4))
  }
}

async function runAiSearch(customQuery) {
  const { q, type, days, channelFilter } = formData(searchForm)
  const objetivo = customQuery || q
  if (!objetivo) return
  if (customQuery) searchForm.elements.q.value = customQuery
  setSearching(true)
  searchStatus.textContent = "A IA está montando as buscas e analisando o potencial viral…"
  aiBriefCard.hidden = true
  try {
    const data = await jsonPost("/api/painel/direcionador/buscar", { objetivo, tipo: type, channelFilter, days: Number(days), model: currentModel(), channelId: currentChatChannel() })
    $("#ai-brief-model").textContent = data.model
    $("#ai-brief-summary").textContent = data.avaliacao?.resumo || data.criterio || ""
    $("#ai-brief-queries").textContent = `Buscas executadas: ${(data.queries || []).join(" · ")}`
    const byId = new Map((data.results || []).map((r) => [r.id, r]))
    const highlights = (data.avaliacao?.destaques || []).map((d) => {
      const ref = byId.get(d.id)
      const head = ref ? extLink(ref.title, ref.url) : el("strong", d.id)
      const actions = []
      if (ref?.type === "video") actions.push(btn("Analisar roteiro", () => analyzeVideo(ref.id), "primary", "sparkles"))
      if (ref) actions.push(btn("Criar pauta", () => editIdea({ title: d.acao || ref.title, promise: d.motivo }), "ghost", "compass"))
      return makeCard(head, [d.motivo, d.acao && `Testar: ${d.acao}`].filter(Boolean).join(" · "), ...actions)
    })
    listItems("#ai-brief-highlights", highlights, "Nenhum destaque específico retornado.")
    $("#ai-next-queries").replaceChildren(
      ...(data.avaliacao?.proximas_buscas || []).map((nq) => {
        const chip = el("button", nq, "history-chip")
        chip.type = "button"
        chip.addEventListener("click", () => runAiSearch(nq))
        return chip
      }),
    )
    aiBriefCard.hidden = false
    searchStatus.textContent = `${(data.results || []).length} resultados reais do YouTube · salvos no Histórico`
    renderSearchResults(data.results || [])
    loadAcervo()
  } catch (error) {
    searchStatus.textContent = error.message
    renderSearchResults([])
    toast(error.message, "error")
  } finally {
    setSearching(false)
  }
}

searchForm.addEventListener("submit", (e) => {
  e.preventDefault()
  runAiSearch()
})
$("#btn-direct-search").addEventListener("click", async () => {
  if (!searchForm.reportValidity()) return
  setSearching(true)
  searchStatus.textContent = "Buscando direto no YouTube…"
  aiBriefCard.hidden = true
  try {
    const params = new URLSearchParams(formData(searchForm))
    params.set("channelId", currentChatChannel())
    const data = await apiJson(`/api/painel/pesquisa?${params}`)
    searchStatus.textContent = `${data.results.length} resultados · ${data.source === "youtube-api" ? "YouTube API" : "YouTube público"} · salvos no Histórico`
    renderSearchResults(data.results || [])
    loadAcervo()
  } catch (error) {
    searchStatus.textContent = error.message
    renderSearchResults([])
  } finally {
    setSearching(false)
  }
})
$("#open-youtube-search").addEventListener("click", () => {
  if (!searchForm.reportValidity()) return
  const { q, type } = formData(searchForm)
  const params = new URLSearchParams({ search_query: type === "video" ? `${q} #shorts` : q })
  if (type === "channel") params.set("sp", "EgIQAg==")
  window.open(`https://www.youtube.com/results?${params}`, "_blank", "noopener")
})

function reopenSavedSearch(b) {
  openWorkspace("pesquisa", true)
  searchForm.elements.q.value = b.objetivo || ""
  if (b.tipo) searchForm.elements.type.value = b.tipo
  toggleChannelFilter()
  if (b.avaliacao?.resumo || b.criterio) {
    $("#ai-brief-model").textContent = b.model || "salvo"
    $("#ai-brief-summary").textContent = b.avaliacao?.resumo || b.criterio || ""
    $("#ai-brief-queries").textContent = `Buscas executadas: ${(b.queries || []).join(" · ")}`
    aiBriefCard.hidden = false
  } else aiBriefCard.hidden = true
  searchStatus.textContent = `Busca salva em ${new Date(b.createdAt).toLocaleString("pt-BR")} · ${(b.results || []).length} resultados`
  renderSearchResults(b.results || [])
}

/* ============================== Analisador (drawer) ============================== */

const analyzeForm = $("#analyze-url-form")
let lastAnalysis = null

function showAnalysis(item) {
  lastAnalysis = item
  const v = item.video || {}
  const a = item.analise || {}
  $("#analysis-meta").textContent = [v.title, v.channel && `${v.channel}${v.channelSubscribersText ? ` (${v.channelSubscribersText})` : ""}`, v.views != null && `${numFmt.format(v.views)} views`, v.durationSeconds != null && `${v.durationSeconds}s`, item.model && `IA: ${item.model}`].filter(Boolean).join(" · ")
  const ad = a.adaptacao_fatonexo
  const blocks = [
    ["Promessa · 0–3s", a.promessa],
    ["Contexto", a.contexto],
    ["Entrega", a.entrega],
    ["Estratégias usadas", toText(a.estrategias)],
    ["Por que retém atenção", a.por_que_retencao],
    ad && ["Adaptação para o FatoNexo", [ad.titulo, ad.pauta].filter(Boolean).map(toText).join(" — ")],
  ].filter((b) => b && b[1])
  $("#analysis-breakdown").replaceChildren(
    ...blocks.map(([label, val], i) => {
      const box = el("div", "", "analysis-block")
      box.style.animationDelay = `${i * 60}ms`
      box.append(el("strong", label), el("div", toText(val)))
      return box
    }),
  )
  $("#analysis-transcript-input").value = v.transcript || ""
  $("#analysis-transcript-box").open = !v.hasCaptions
  $("#btn-use-adaptation").disabled = !ad
  $("#btn-save-adaptation-idea").disabled = !ad
  $("#analysis-status").textContent = v.hasCaptions ? "Análise feita com a transcrição do vídeo." : "O YouTube não liberou a legenda: análise feita pelos metadados. Cole a fala abaixo para refinar."
  $("#analysis-result").hidden = false
}

async function analyzeVideo(urlOrId, manual = "") {
  openDrawer("video-analysis-card")
  analyzeForm.elements.url.value = urlOrId
  $("#analysis-result").hidden = true
  $("#analysis-loading").hidden = false
  $("#analysis-status").textContent = "Lendo o vídeo e analisando o roteiro com o Direcionador… (pode levar até 30 s)"
  try {
    const data = await jsonPost("/api/painel/video/analisar", { urlOrId, transcricaoManual: manual, model: currentModel(), channelId: currentChatChannel() })
    showAnalysis(data)
    loadAcervo()
  } catch (error) {
    $("#analysis-status").textContent = error.message
    toast(error.message, "error")
  } finally {
    $("#analysis-loading").hidden = true
  }
}

analyzeForm.addEventListener("submit", (e) => {
  e.preventDefault()
  analyzeVideo(analyzeForm.elements.url.value.trim())
})
$("#btn-open-analyzer").addEventListener("click", () => {
  openDrawer("video-analysis-card")
  analyzeForm.elements.url.focus()
})
$("#btn-reanalyze").addEventListener("click", () => {
  const url = analyzeForm.elements.url.value.trim()
  if (url) analyzeVideo(url, $("#analysis-transcript-input").value.trim())
})
$("#btn-use-adaptation").addEventListener("click", () => {
  const ad = lastAnalysis?.analise?.adaptacao_fatonexo
  if (!ad) return
  closeDrawers()
  sendAdaptationToStudio(ad)
  toast("Adaptação enviada para o editor de roteiro")
})
$("#btn-save-adaptation-idea").addEventListener("click", () => {
  const ad = lastAnalysis?.analise?.adaptacao_fatonexo
  if (!ad) return
  addIdea({ title: toText(ad.pauta || ad.titulo || lastAnalysis.video?.title), promise: toText(ad.promessa), context: toText(ad.contexto), payoff: toText(ad.entrega), status: "Prioridade" })
  toast("Pauta salva na Estratégia como Prioridade")
})

/* ============================== Referências, pautas e Kanban ============================== */

const referenceForm = $("#reference-form")
const ideaForm = $("#idea-form")
let editingReference = null
let editingIdea = null

function editReference(ref, id = null) {
  editingReference = id
  fillForm(referenceForm, ref)
  $("#reference-editor").open = true
  openWorkspace("pesquisa")
  referenceForm.scrollIntoView({ behavior: "smooth", block: "center" })
  referenceForm.elements.title.focus()
}
referenceForm.addEventListener("submit", (e) => {
  e.preventDefault()
  const ref = formData(referenceForm)
  ref.id = editingReference || crypto.randomUUID()
  board.references = [ref, ...board.references.filter((r) => r.id !== ref.id)]
  editingReference = null
  referenceForm.reset()
  $("#reference-editor").open = false
  saveBoard()
  toast("Referência salva")
})

function addIdea(idea) {
  board.ideas = [{ pillar: "Outro", status: "Ideia", ...idea, id: crypto.randomUUID() }, ...board.ideas]
  saveBoard()
}
function editIdea(idea = {}, id = null) {
  editingIdea = id
  fillForm(ideaForm, { status: "Ideia", ...idea })
  openDrawer("idea-drawer")
  ideaForm.elements.title.focus()
}
$("#btn-nova-pauta").addEventListener("click", () => editIdea())
$("#btn-cancelar-pauta").addEventListener("click", closeDrawers)
ideaForm.addEventListener("submit", (e) => {
  e.preventDefault()
  const idea = { ...formData(ideaForm), id: editingIdea || crypto.randomUUID() }
  board.ideas = [idea, ...board.ideas.filter((i) => i.id !== idea.id)]
  editingIdea = null
  closeDrawers()
  saveBoard()
  toast("Pauta salva")
})

function sendAdaptationToStudio(adaptation) {
  const title = toText(adaptation.pauta || adaptation.titulo)
  const idea = [title, adaptation.promessa, adaptation.contexto, adaptation.entrega].map(toText).filter(Boolean).join("\n")
  openStudioScript({ title, idea })
}

function useIdeaInScript(idea) {
  openStudioScript({ title: idea.title, idea: [idea.title, idea.promise, idea.context, idea.payoff].filter(Boolean).join("\n") })
  toast("Pauta enviada para o roteiro")
}
function moveIdea(idea, dir) {
  const idx = STATUSES.indexOf(idea.status)
  const next = STATUSES[Math.min(STATUSES.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))]
  idea.status = next
  saveBoard()
}

function renderBoard() {
  const select = ideaForm.elements.reference
  const prev = select.value
  select.replaceChildren(new Option("Sem referência", ""), ...board.references.map((r) => new Option(r.title, r.id)))
  select.value = board.references.some((r) => r.id === prev) ? prev : ""

  listItems(
    "#reference-list",
    board.references.map((r) =>
      makeCard(
        extLink(r.title, r.url),
        [r.type === "channel" ? "Canal" : "Vídeo", r.channel, r.views && `${numFmt.format(r.views)} views`, r.notes].filter(Boolean).join(" · "),
        btn("Criar pauta", () => editIdea({ reference: r.id, title: r.title }), "primary", "compass"),
        btn("Editar", () => editReference(r, r.id), "ghost", "pen"),
        btn("Excluir", () => {
          board.references = board.references.filter((x) => x.id !== r.id)
          saveBoard()
        }, "ghost", "trash"),
      ),
    ),
    "Salve canais e Shorts que valem modelar — eles aparecem aqui.",
    "bookmark",
  )

  const cols = STATUSES.map((status) => {
    const col = el("div", "", "kan-col")
    col.dataset.status = status
    const items = board.ideas.filter((i) => (STATUSES.includes(i.status) ? i.status : "Ideia") === status)
    const head = el("div", "", "kan-head")
    const label = el("span")
    label.append(el("i"), document.createTextNode(status))
    head.append(label, el("span", items.length, "count"))
    col.append(head)
    if (!items.length) col.append(el("p", "Nada por aqui.", "meta"))
    items.forEach((idea, n) => {
      const card = el("div", "", "kan-card")
      card.style.animationDelay = `${n * 40}ms`
      const ref = board.references.find((r) => r.id === idea.reference)
      card.append(el("strong", idea.title))
      if (idea.promise) card.append(el("p", `Promessa: ${idea.promise}`))
      const tags = el("div", "", "metric-pills")
      if (idea.pillar) tags.append(pill(idea.pillar))
      if (ref) tags.append(pill(ref.title.slice(0, 28), "", "bookmark"))
      card.append(tags)
      const actions = el("div", "", "kan-actions")
      const left = btn("", () => moveIdea(idea, -1), "ghost", "arrow-l")
      left.title = "Mover para a etapa anterior"
      left.disabled = status === STATUSES[0]
      const right = btn("", () => moveIdea(idea, 1), "ghost", "arrow-r")
      right.title = "Avançar etapa"
      right.disabled = status === STATUSES.at(-1)
      actions.append(left, right, btn("Roteiro", () => useIdeaInScript(idea), "primary", "pen"), btn("", () => editIdea(idea, idea.id), "ghost", "pen"), btn("", () => {
        if (!confirm("Excluir esta pauta?")) return
        board.ideas = board.ideas.filter((x) => x.id !== idea.id)
        saveBoard()
      }, "ghost", "trash"))
      card.append(actions)
      col.append(card)
    })
    return col
  })
  $("#idea-list").replaceChildren(...cols)
}

/* ============================== Roteiro ============================== */

let currentRoteiroId = null
const scriptText = $("#script-text")

function updateMeter() {
  const words = scriptText.value.trim().split(/\s+/).filter(Boolean).length
  const target = Number($("#script-duracao").value) || 45
  const secs = Math.round(words / 2.6)
  $("#script-meter").textContent = `${words} palavras · ~${secs}s de fala (alvo ${target}s)`
}
scriptText.addEventListener("input", updateMeter)
$("#script-duracao").addEventListener("input", updateMeter)

function setScriptState(text) {
  $("#script-state").textContent = text
}
function newScript() {
  currentRoteiroId = null
  for (const id of ["pauta", "script-promessa", "script-contexto", "script-entrega", "script-text"]) $(`#${id}`).value = ""
  $("#script-checks").hidden = true
  $("#script-status").textContent = ""
  setScriptState("Novo roteiro")
  updateMeter()
}
$("#btn-new-script").addEventListener("click", () => {
  newScript()
  $("#pauta").focus()
})

function loadSavedScript(entry) {
  if (entry.id) openStudioScript({ id: entry.id, title: entry.roteiro?.titulo || entry.pauta, script: toText(entry.roteiro?.roteiro) })
  currentRoteiroId = entry.id || null
  const r = entry.roteiro || {}
  $("#pauta").value = entry.pauta || r.titulo || ""
  $("#script-promessa").value = toText(r.promessa)
  $("#script-contexto").value = toText(r.contexto)
  $("#script-entrega").value = toText(r.entrega)
  scriptText.value = toText(r.roteiro)
  const checks = Array.isArray(r.pontos_a_checar) ? r.pontos_a_checar : []
  $("#script-checks").hidden = !checks.length
  $("#script-checks").textContent = checks.length ? `Verifique antes de publicar: ${checks.join(" · ")}` : ""
  setScriptState(`${entry.status === "rascunho" ? "Rascunho" : "Roteiro validado"} · ${new Date(entry.updatedAt || entry.createdAt).toLocaleString("pt-BR")}`)
  $("#script-status").textContent = ""
  updateMeter()
}

$("#btn-generate-script").addEventListener("click", async () => {
  const pauta = $("#pauta").value.trim()
  if (!pauta) {
    toast("Informe a pauta ou a pergunta central primeiro", "error")
    return $("#pauta").focus()
  }
  const b = $("#btn-generate-script")
  b.disabled = true
  const label = $("span", b)
  const started = Date.now()
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000)
    label.textContent = `Gerando… ${s}s`
    $("#script-status").textContent = `O Direcionador está estruturando Promessa, Contexto e Entrega (${s}s)`
  }, 500)
  try {
    const data = await jsonPost("/api/painel/roteiro", {
      id: currentRoteiroId,
      pauta,
      promessa: $("#script-promessa").value.trim(),
      contexto: $("#script-contexto").value.trim(),
      entrega: $("#script-entrega").value.trim(),
      duracao: Number($("#script-duracao").value) || 45,
      tom: $("#script-tom").value.trim(),
      model: currentModel(),
    })
    currentRoteiroId = data.roteiroId || currentRoteiroId
    loadSavedScript({ ...(data.saved || {}), id: currentRoteiroId, roteiro: data.roteiro, pauta, status: "validado" })
    $("#script-status").textContent = `Gerado por ${data.model}`
    toast("Roteiro gerado e salvo no acervo")
    loadAcervo()
  } catch (error) {
    $("#script-status").textContent = error.message
    toast(error.message, "error")
  } finally {
    clearInterval(timer)
    b.disabled = false
    label.textContent = "Gerar com IA"
  }
})

$("#btn-save-draft").addEventListener("click", async () => {
  const b = $("#btn-save-draft")
  b.disabled = true
  try {
    const data = await jsonPost("/api/painel/roteiro/rascunho", {
      id: currentRoteiroId,
      pauta: $("#pauta").value.trim(),
      promessa: $("#script-promessa").value.trim(),
      contexto: $("#script-contexto").value.trim(),
      entrega: $("#script-entrega").value.trim(),
      roteiro: scriptText.value.trim(),
      duracao: Number($("#script-duracao").value) || 45,
      tom: $("#script-tom").value.trim(),
    })
    currentRoteiroId = data.saved?.id || currentRoteiroId
    setScriptState(`Rascunho salvo · ${hhmm(Date.now())}`)
    toast("Rascunho salvo no acervo")
    loadAcervo()
  } catch (error) {
    toast(error.message, "error")
  } finally {
    b.disabled = false
  }
})

$("#btn-download-script").addEventListener("click", () => {
  const content = [`PAUTA: ${$("#pauta").value.trim()}`, `PROMESSA (0-3s): ${$("#script-promessa").value.trim()}`, `CONTEXTO: ${$("#script-contexto").value.trim()}`, `ENTREGA: ${$("#script-entrega").value.trim()}`, "", "ROTEIRO PARA NARRAÇÃO:", scriptText.value.trim()].join("\n")
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
  a.download = "roteiro-fatonexo.txt"
  a.click()
})

$("#btn-voice-preview")?.addEventListener("click", async () => {
  const b = $("#btn-voice-preview")
  const label = $("span", b)
  b.disabled = true
  label.textContent = "Carregando prévia…"
  try {
    const res = await fetch("/api/painel/narracao/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: $("#tts-voice").value, style: $("#tts-style").value }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    const url = URL.createObjectURL(await res.blob())
    const player = $("#tts-player")
    player.src = url
    player.hidden = false
    await player.play().catch(() => {})
    $("#tts-status").textContent = `Prévia da voz ${$("#tts-voice").value} reproduzida.`
  } catch (error) {
    toast(error.message, "error")
  } finally {
    b.disabled = false
    label.textContent = "Ouvir prévia da voz"
  }
})

$("#btn-narration").addEventListener("click", async () => {
  const text = scriptText.value.trim()
  if (!text) return toast("Escreva ou gere o roteiro primeiro", "error")
  if (!$("#tts-confirm").checked) return toast("Marque a autorização para enviar o texto ao Google", "error")
  const b = $("#btn-narration")
  const label = $("span", b)
  b.disabled = true
  label.textContent = "Gerando voz…"
  $("#tts-status").textContent = "Gerando narração no Gemini TTS…"
  try {
    const res = await fetch("/api/painel/narracao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: $("#tts-voice").value, style: $("#tts-style").value, confirmed: true }) })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    const url = URL.createObjectURL(await res.blob())
    const slug = ($("#pauta").value.trim() || "narracao-fatonexo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
    const player = $("#tts-player")
    const dl = $("#tts-download")
    player.src = url
    player.hidden = false
    dl.href = url
    dl.download = `${slug || "narracao-fatonexo"}.wav`
    dl.hidden = false
    dl.click()
    $("#tts-status").textContent = "Áudio pronto — o download começou."
    toast("Áudio gerado e baixado")
  } catch (error) {
    $("#tts-status").textContent = error.message
    toast(error.message, "error")
  } finally {
    b.disabled = false
    label.textContent = "Gerar e baixar áudio"
  }
})

/* ============================== Metas YPP ============================== */

const currentChatChannel = () => getActiveChannelProfile()?.id || primaryChannelId
const yppInput = $("#ypp-views-input")
const yppViewsKey = () => currentChatChannel() === primaryChannelId ? YPP_VIEWS_KEY : `${YPP_VIEWS_KEY}:${currentChatChannel()}`
yppInput.value = localStorage.getItem(yppViewsKey()) || ""

function meter(label, current, target) {
  const val = Number.isFinite(current) ? current : 0
  const pct = Math.min(100, Math.round((val / target) * 100))
  const wrap = el("div", "", "ypp-meter")
  const top = el("div", "", "ypp-meter-top")
  top.append(el("span", label), el("strong", `${compact.format(val)} / ${compact.format(target)} · ${pct}%`))
  const bg = el("div", "", "ypp-bar-bg")
  const fill = el("div", "", "ypp-bar-fill")
  fill.style.width = "0"
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${pct}%`)))
  bg.append(fill)
  wrap.append(top, bg)
  return wrap
}

function renderYpp() {
  const isPrimary = currentChatChannel() === primaryChannelId
  const snap = isPrimary ? getSnapshot() : null
  const cur = snap?.current
  const profile = getActiveChannelProfile()
  const subs = isPrimary ? (cur?.subs ?? 0) : (Number.isFinite(profile?.subscribers) ? profile.subscribers : 0)
  const stored = Number(localStorage.getItem(yppViewsKey()) || "")
  const tracked = isPrimary ? (cur?.views ?? 0) : 0
  const views = Number.isFinite(stored) && stored > 0 ? stored : tracked
  const since = Date.now() - 90 * 86_400_000
  const dated = isPrimary ? (snap?.shorts || []).filter((s) => s.date && Date.parse(s.date) >= since).length : 0
  const uploads = isPrimary ? (dated || cur?.videos || 0) : 0
  const tiers = [
    { title: "Entrada no YPP · fãs e recursos", hit: subs >= 500 && views >= 3_000_000 && uploads >= 3, meters: [["Inscritos", subs, 500], ["Views Shorts · 90 dias", views, 3_000_000], ["Envios válidos · 90 dias", uploads, 3]] },
    { title: "Monetização com anúncios", hit: subs >= 1000 && views >= 10_000_000, meters: [["Inscritos", subs, 1000], ["Views Shorts · 90 dias", views, 10_000_000]] },
    { title: "Nova regra · fevereiro de 2027", hit: subs >= 1000 && views >= 20_000_000, meters: [["Inscritos", subs, 1000], ["Views Shorts · 90 dias", views, 20_000_000]] },
  ]
  $("#ypp-tiers").replaceChildren(
    ...tiers.map((t) => {
      const card = el("div", "", `ypp-card${t.hit ? " hit" : ""}`)
      const head = el("div", "", "ypp-card-head")
      head.append(el("strong", t.title), el("span", t.hit ? "Atingida" : "Em progresso", t.hit ? "ypp-badge-hit" : "ypp-badge-wait"))
      const first = t.meters[0]
      const ringWrap = el("div", "", "ring-row")
      ringWrap.innerHTML = ringMarkup(Math.min(1, first[1] / first[2]), `${Math.round(Math.min(1, first[1] / first[2]) * 100)}%`, "inscritos")
      const col = el("div", "", "ypp-card")
      col.style.cssText = "border:0;padding:0;background:none;gap:12px;flex:1"
      col.append(...t.meters.map(([l, c, g]) => meter(l, c, g)))
      ringWrap.append(col)
      card.append(head, ringWrap)
      return card
    }),
  )
}
$("#ypp-views-form").addEventListener("submit", (e) => {
  e.preventDefault()
  const v = Number(yppInput.value)
  if (!Number.isFinite(v) || v < 0) return
  localStorage.setItem(yppViewsKey(), String(Math.round(v)))
  renderYpp()
  toast("Views dos 90 dias atualizadas")
})
$("#btn-ypp-plan").addEventListener("click", async () => {
  const b = $("#btn-ypp-plan")
  const box = $("#ypp-plan-box")
  const label = $("span", b)
  b.disabled = true
  label.textContent = "Gerando plano…"
  box.hidden = false
  box.replaceChildren(skeleton(3))
  try {
    const isPrimary = currentChatChannel() === primaryChannelId
    const cur = isPrimary ? getSnapshot()?.current : null
    const subs = isPrimary ? (cur?.subs ?? 0) : (getActiveChannelProfile()?.subscribers ?? 0)
    const views = Number(localStorage.getItem(yppViewsKey()) || "") || (isPrimary ? cur?.views : 0) || 0
    const data = await jsonPost("/api/painel/direcionador/perguntar", {
      pergunta: `Hoje tenho ${subs} inscritos e ${views} views nos Shorts. Monte um plano prático de 3 passos para bater a primeira meta de monetização do YouTube (500 inscritos e 3M de views em 90 dias).`,
      model: currentModel(),
    })
    box.replaceChildren(renderMarkdown(data.resposta))
  } catch (error) {
    box.replaceChildren(el("p", error.message, "meta"))
  } finally {
    b.disabled = false
    label.textContent = "Gerar plano"
  }
})

$("#report-upload").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    $("#report-status").textContent = "CSV vazio ou inválido."
    return
  }
  const sep = lines[0].includes(";") ? ";" : ","
  const headers = lines[0].split(sep).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase())
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.replace(/^"|"$/g, "").trim())
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]))
  })
  $("#report-status").textContent = `${rows.length} linhas importadas de ${file.name}.`
  listItems(
    "#performance-top",
    rows.slice(0, 12).map((r) => {
      const title = r["título do vídeo"] || r["video title"] || r["conteúdo"] || Object.values(r)[1] || "Short"
      const summary = Object.entries(r).slice(2, 6).map(([k, v]) => `${k}: ${v}`).join(" · ")
      return makeCard(el("strong", title), summary)
    }),
    "Sem linhas.",
  )
})

/* ============================== Chat IA ============================== */

let allChats = []
let activeChatId = null
let lastChatList = []
let chatBusy = false
const chatBox = $("#chat-messages")
const chatInput = $("#chat-input")
async function loadChatProjects() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return
  try {
    const select = $("#chat-project")
    const current = select.value
    const projects = await apiJson("/api/criar/chat-projetos")
    select.replaceChildren(new Option(projects.length ? "Sem projeto" : "Crie um projeto para editar", ""),
      ...projects.map(p => new Option(p.titulo, p.id)))
    select.disabled = !projects.length
    if (projects.some(p => p.id === current)) select.value = current
    $("#chat-project-target").hidden = false
  } catch {}
}
window.addEventListener("workspace:change", (event) => {
  if (event.detail?.id === "chat") loadChatProjects()
})
if (location.hash === "#chat") loadChatProjects()
const chatFiles = $("#chat-files")

const chatAvatar = () => currentChatChannel() === primaryChannelId ? getAvatar() : getActiveChannelProfile()?.logo
const syncChatChannel = () => { $("#chat-channel-name").textContent = getActiveChannelProfile()?.title || "FatoNexo" }
syncChatChannel()
const chatInitials = () => getActiveChannelProfile()?.title?.trim().split(/\s+/).slice(0,2).map(word => word[0]).join("").toUpperCase() || "FN"

window.addEventListener("studio:active-channel", () => {
  syncChatChannel()
  activeChatId = null
  lastChatList = []
  $("#chat-active-title").textContent = "Nova conversa"
  yppInput.value = localStorage.getItem(yppViewsKey()) || ""
  renderYpp()
  const yppBox = $("#ypp-plan-box")
  if (yppBox) { yppBox.hidden = true; yppBox.replaceChildren() }
  if ($("#report-status")) $("#report-status").textContent = "Exporte no YouTube Studio → Analytics → Modo avançado → Exportar CSV."
  $("#performance-top")?.replaceChildren()
  $("#performance-worst")?.replaceChildren()
  $("#search-results")?.replaceChildren()
  if ($("#search-status")) $("#search-status").textContent = ""
  if (aiBriefCard) aiBriefCard.hidden = true
  closeDrawers()
  renderChatSidebar()
  renderChat([])
  loadAcervo({ chat: true })
})

function aiAvatar() {
  const wrap = el("div", "", "chat-ai-avatar")
  const url = chatAvatar()
  if (url) {
    const img = document.createElement("img")
    img.referrerPolicy = "no-referrer"
    img.alt = ""
    img.addEventListener("error", () => wrap.replaceChildren(el("b", chatInitials())), { once: true })
    img.src = url
    wrap.append(img)
  } else wrap.append(el("b", chatInitials()))
  return wrap
}

function welcomeNode() {
  const box = el("div", "", "chat-welcome")
  const logo = el("div", "", "chat-logo")
  const url = chatAvatar()
  if (url) {
    const img = document.createElement("img")
    img.referrerPolicy = "no-referrer"
    img.alt = ""
    img.addEventListener("error", () => logo.replaceChildren(el("b", chatInitials())), { once: true })
    img.src = url
    logo.append(img)
  } else logo.append(el("b", chatInitials()))
  box.append(logo, el("h3", `Como posso ajudar o canal ${getActiveChannelProfile()?.title || "FatoNexo"} hoje?`), el("p", "Eu vejo os números do canal, crio roteiros e pautas, busco canais e entendo áudios, imagens e arquivos que você enviar.", "meta"))
  const starters = [
    ["trend", "Diagnostique o @fatonexocuri com os números de hoje"],
    ["search", "Ache 5 canais de curiosidades que já monetizam e diga o que copiar"],
    ["script", "Crie um roteiro de 45s com Promessa, Contexto e Entrega sobre buracos negros"],
    ["target", "Monte um plano de 7 dias para chegar a 500 inscritos"],
  ]
  const grid = el("div", "", "chat-starters")
  for (const [ic, text] of starters) {
    const b = el("button", "", "chat-starter")
    b.type = "button"
    b.append(icon(ic), el("span", text))
    b.addEventListener("click", () => sendChat(text))
    grid.append(b)
  }
  box.append(grid)
  return box
}

function actionCard(m) {
  const act = m.panelAction
  if (!act) return null
  const card = el("div", "", "chat-action-card")
  const label = el("span")
  if (act.action === "editar_projeto" && act.patch) {
    label.textContent = `Alterações propostas em “${act.title}”`
    const preview = el("details", "", "chat-edit-preview")
    preview.append(el("summary", "Revisar alterações"))
    for (const [field, title] of Object.entries({ titulo:"Título", descricao:"Descrição", roteiro:"Roteiro" })) {
      if (Object.hasOwn(act.patch, field)) preview.append(el("strong", title), el("p", act.patch[field] || "Campo vazio"))
    }
    if (act.patch.html) preview.append(el("p", "O HTML será salvo como uma nova versão. Confira o arquivo acima."))
    const apply = btn("Aplicar ao projeto", async () => {
      apply.disabled = true
      try {
        await jsonPost(`/api/criar/projetos/${encodeURIComponent(act.id)}/editar-chat`, { revision: act.revision, patch: act.patch })
        apply.textContent = "Aplicado"
        toast("Alterações salvas no projeto")
      } catch (error) {
        toast(error.message)
        apply.disabled = false
      }
    }, "primary", "check")
    card.append(label, preview, apply)
    if (typeof act.patch.roteiro === "string") card.append(btn("Abrir proposta no editor", () => {
      openStudioScript({ id: act.id, script: act.patch.roteiro, title: act.patch.titulo, applyDraft: true })
    }, "ghost", "pen"))
  } else if (act.action === "criar_roteiro" && act.savedDraft) {
    label.append(icon("check"), document.createTextNode(`Rascunho criado no painel: “${act.savedDraft.pauta}”`))
    card.append(label, btn("Abrir no editor", () => loadSavedScript(act.savedDraft), "primary", "pen"))
  } else if (act.action === "buscar" && act.query) {
    label.append(icon("search"), document.createTextNode(`Busca sugerida: “${act.query}”`))
    card.append(label, btn("Executar busca", () => {
      openWorkspace("pesquisa", true)
      if (act.searchType) searchForm.elements.type.value = act.searchType
      toggleChannelFilter()
      runAiSearch(act.query)
    }, "primary", "search"))
  } else if (act.action === "analisar_video" && /^[\w-]{11}$/.test(act.videoId || "")) {
    label.append(icon("film"), document.createTextNode("Análise de vídeo sugerida"))
    card.append(label, btn("Analisar agora", () => analyzeVideo(act.videoId), "primary", "sparkles"))
  } else if (act.action === "criar_pauta" && act.title) {
    label.append(icon("compass"), document.createTextNode(`Pauta sugerida: “${act.title}”`))
    card.append(label, btn("Salvar na Estratégia", () => {
      addIdea({ title: act.title, promise: act.promise || "", context: act.context || "", payoff: act.payoff || "", status: "Ideia" })
      toast("Pauta salva na Estratégia")
    }, "primary", "compass"))
  } else return null
  return card
}

function reveal(container, text, onTick) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    container.replaceChildren(renderMarkdown(text))
    return
  }
  let n = 0
  const step = Math.max(8, Math.ceil(text.length / 110))
  const frame = () => {
    n = Math.min(text.length, n + step)
    const md = renderMarkdown(text.slice(0, n))
    container.replaceChildren(md)
    if (n < text.length) md.lastElementChild?.classList.add("chat-cursor")
    onTick()
    if (n < text.length) requestAnimationFrame(frame)
  }
  frame()
}

function chatFileCard(file) {
  const extension = file.name.split(".").at(-1).toLowerCase()
  const card = el("div", "", "chat-output-file")
  const detail = el("div")
  detail.append(el("strong", file.name), el("span", fileFormats[extension], "meta"))
  const controls = el("div", "", "actions")
  controls.append(btn("Baixar arquivo", () => {
    const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }))
    const download = document.createElement("a")
    download.href = url
    download.download = file.name
    download.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, "ghost", "download"))
  if (extension === "txt" && file.content.length <= 5000) controls.append(btn("Usar no roteiro", () => {
    openStudioScript({ script: file.content })
  }, "ghost", "pen"))
  card.append(icon("file"), detail, controls)
  return card
}

function renderChat(messages, { typing = false, animateId = null } = {}) {
  if (!messages.length && !typing) return chatBox.replaceChildren(welcomeNode())
  const nodes = messages.map((m) => {
    if (m.role === "user") {
      const row = el("div", "", "chat-user-row")
      if (m.text) row.append(el("div", m.text, "chat-user-bubble"))
      if (m.attachments?.length) {
        const att = el("div", "", "chat-attachments")
        for (const a of m.attachments) {
          if (a.kind === "image") {
            const img = document.createElement("img")
            img.src = a.url
            img.alt = a.name
            img.className = "chat-thumb"
            att.append(img)
          } else {
            const chip = extLink("", a.url, "chat-file-chip")
            chip.append(icon(a.kind === "audio" ? "mic" : "file"), document.createTextNode(a.name))
            att.append(chip)
          }
        }
        row.append(att)
      }
      return row
    }
    const row = el("div", "", "chat-ai-row")
    const main = el("div", "", "chat-ai-main")
    const meta = el("div", "", "chat-ai-meta")
    meta.append(el("strong", "Direcionador"), document.createTextNode(`${m.model || "MiMo-V2.6-Flash"} · ${hhmm(m.createdAt)}`))
    const reply = m.files?.length ? m : splitChatFiles(m.text || "")
    main.append(meta)
    if (reply.text) {
      const body = el("div")
      if (m.id === animateId && !reply.files.length) reveal(body, reply.text, () => (chatBox.scrollTop = chatBox.scrollHeight))
      else body.append(renderMarkdown(reply.text))
      main.append(body)
    }
    if (reply.files.length) main.append(...reply.files.map(chatFileCard))
    const card = actionCard(m)
    if (card) main.append(card)
    if (reply.text && !reply.files.length) {
      const actions = el("div", "", "chat-ai-actions")
      const copy = el("button", "")
      copy.type = "button"
      copy.append(icon("copy"), el("span", "Copiar"))
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(m.text).catch(() => {})
        copy.lastChild.textContent = "Copiado"
        setTimeout(() => (copy.lastChild.textContent = "Copiar"), 1400)
      })
      const toScript = el("button", "")
      toScript.type = "button"
      toScript.append(icon("pen"), el("span", "Usar no roteiro"))
      toScript.addEventListener("click", () => {
        if (m.panelAction?.savedDraft?.id) return loadSavedScript(m.panelAction.savedDraft)
        let script = m.text.trim()
        if (/<(?:!doctype|html|body|main|section)\b/i.test(script)) {
          const template = document.createElement("template")
          template.innerHTML = script
          for (const node of template.content.querySelectorAll("script, style, template")) node.remove()
          const narration = template.content.querySelector('[data-roteiro], [data-narracao], #roteiro, #narracao')
          if (!narration?.textContent.trim()) return toast("Peça ao Chat IA a narração em texto para enviar ao roteiro.")
          script = narration.textContent.trim()
        }
        openStudioScript({ script })
      })
      actions.append(copy, toScript)
      main.append(actions)
    }
    row.append(aiAvatar(), main)
    return row
  })
  if (typing) {
    const row = el("div", "", "chat-ai-row")
    const main = el("div", "", "chat-ai-main")
    const dots = el("div", "", "chat-typing")
    dots.append(el("span"), el("span"), el("span"))
    main.append(el("div", "Direcionador pensando…", "chat-ai-meta"), dots)
    row.append(aiAvatar(), main)
    nodes.push(row)
  }
  chatBox.replaceChildren(...nodes)
  chatBox.scrollTop = chatBox.scrollHeight
}

function renderChatSidebar() {
  const q = ($("#chat-search").value || "").trim().toLowerCase()
  const showArchived = $("#chat-show-archived")?.checked
  const list = allChats.filter((c) => {
    if (chatChannelId(c) !== currentChatChannel()) return false
    if (!showArchived && c.archived) return false
    if (q && !(c.title || "").toLowerCase().includes(q)) return false
    return true
  })
  const target = $("#chat-thread-list")
  if (!list.length) return target.replaceChildren(el("p", "Nenhuma conversa aqui.", "meta"))
  target.replaceChildren(
    ...list.map((c) => {
      const row = el("div", "", `chat-thread-item${c.id === activeChatId ? " active" : ""}${c.archived ? " archived" : ""}`)
      row.append(el("span", c.title || "Conversa", "chat-thread-title"))
      row.addEventListener("click", () => {
        activeChatId = c.id
        lastChatList = c.messages || []
        $("#chat-active-title").textContent = c.title || "Direcionador IA"
        renderChat(lastChatList)
        renderChatSidebar()
        $("#chat-sidebar").classList.remove("open")
      })

      const acts = el("span", "", "chat-thread-actions")
      const rename = el("button", "", "chat-thread-del")
      rename.type = "button"
      rename.title = "Renomear conversa"
      rename.append(icon("pen"))
      rename.addEventListener("click", async (e) => {
        e.stopPropagation()
        const nextTitle = prompt("Novo nome da conversa:", c.title || "")
        if (!nextTitle || !nextTitle.trim()) return
        const res = await apiJson(`/api/painel/chat/${encodeURIComponent(c.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle.trim() }),
        })
        allChats = res.chats || allChats
        if (activeChatId === c.id) $("#chat-active-title").textContent = nextTitle.trim()
        renderChatSidebar()
        toast("Conversa renomeada")
      })

      const arch = el("button", "", "chat-thread-del")
      arch.type = "button"
      arch.title = c.archived ? "Desarquivar conversa" : "Arquivar conversa"
      arch.append(icon("archive"))
      arch.addEventListener("click", async (e) => {
        e.stopPropagation()
        const res = await apiJson(`/api/painel/chat/${encodeURIComponent(c.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: !c.archived }),
        })
        allChats = res.chats || allChats
        renderChatSidebar()
        toast(c.archived ? "Conversa desarquivada" : "Conversa arquivada")
      })

      const del = el("button", "", "chat-thread-del")
      del.type = "button"
      del.title = "Excluir conversa"
      del.append(icon("trash"))
      del.addEventListener("click", async (e) => {
        e.stopPropagation()
        if (!confirm("Excluir esta conversa?")) return
        allChats = (await apiJson(`/api/painel/chat/${encodeURIComponent(c.id)}`, { method: "DELETE" })).chats || []
        if (activeChatId === c.id) {
          activeChatId = null
          lastChatList = []
          $("#chat-active-title").textContent = "Direcionador IA"
          renderChat([])
        }
        renderChatSidebar()
      })
      acts.append(rename, arch, del)
      row.append(acts)
      return row
    }),
  )
}

async function sendChat(text) {
  if (text != null) chatInput.value = text
  $("#chat-form").requestSubmit()
}

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto"
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 170)}px`
})
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    $("#chat-form").requestSubmit()
  }
})
chatFiles.addEventListener("change", () => {
  const preview = $("#chat-file-preview")
  const files = [...(chatFiles.files || [])]
  preview.hidden = !files.length
  preview.replaceChildren(
    ...files.map((f) => {
      const chip = el("span", "", "history-chip")
      chip.append(icon(f.type.startsWith("audio/") ? "mic" : f.type.startsWith("image/") ? "image" : "file"), document.createTextNode(` ${f.name}`))
      return chip
    }),
  )
})

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  if (chatBusy) return
  const channelId = currentChatChannel()
  const message = chatInput.value.trim()
  const files = [...(chatFiles.files || [])]
  if (!message && !files.length) return
  chatBusy = true
  $("#btn-chat-send").disabled = true
  const hasAudio = files.some((f) => f.type.startsWith("audio/"))
  $("#chat-status").textContent = hasAudio ? "Transcrevendo o áudio e consultando o Direcionador…" : "O Direcionador está pensando…"
  renderChat([...lastChatList, { role: "user", text: message || `(anexos: ${files.map((f) => f.name).join(", ")})`, attachments: [], createdAt: new Date().toISOString() }], { typing: true })
  const fd = new FormData()
  fd.append("message", message)
  fd.append("channelId", channelId)
  fd.append("output", $("#chat-output").value)
  if ($("#chat-project").value) fd.append("projectId", $("#chat-project").value)
  fd.append("model", currentModel())
  if (activeChatId) fd.append("chatId", activeChatId)
  for (const f of files) fd.append("files", f)
  chatInput.value = ""
  chatInput.style.height = "auto"
  try {
    const data = await apiJson("/api/painel/chat", { method: "POST", body: fd })
    if (channelId !== currentChatChannel()) return
    chatFiles.value = ""
    $("#chat-file-preview").hidden = true
    activeChatId = data.thread?.id || activeChatId
    allChats = data.chats || allChats
    lastChatList = data.thread?.messages || []
    $("#chat-active-title").textContent = data.thread?.title || "Direcionador IA"
    renderChatSidebar()
    renderChat(lastChatList, { animateId: data.assistantMsg?.id })
    if (data.assistantMsg?.panelAction?.action === "criar_roteiro") {
      toast("Rascunho de roteiro criado pelo chat")
      loadAcervo()
    }
    $("#chat-status").textContent = `Respondido por ${data.assistantMsg?.model || "o Direcionador"} · conversa salva`
  } catch (error) {
    if (channelId !== currentChatChannel()) return
    renderChat(lastChatList)
    chatInput.value = message
    $("#chat-status").textContent = error.message
    toast(error.message, "error")
  } finally {
    chatBusy = false
    $("#btn-chat-send").disabled = false
  }
})

$("#btn-new-chat").addEventListener("click", () => {
  activeChatId = null
  lastChatList = []
  $("#chat-active-title").textContent = "Nova conversa"
  renderChat([])
  renderChatSidebar()
  $("#chat-sidebar").classList.remove("open")
  chatInput.focus()
})
$("#chat-search").addEventListener("input", renderChatSidebar)
$("#chat-show-archived")?.addEventListener("change", renderChatSidebar)
$("#history-show-archived")?.addEventListener("change", () => loadAcervo())
$("#btn-toggle-sidebar").addEventListener("click", () => $("#chat-sidebar").classList.toggle("open"))
chatBox.addEventListener("click", () => $("#chat-sidebar").classList.remove("open"))

/* ============================== Histórico / acervo ============================== */

function showSavedAnalysis(item) {
  openDrawer("video-analysis-card")
  analyzeForm.elements.url.value = item.video?.url || item.video?.id || ""
  $("#analysis-loading").hidden = true
  showAnalysis(item)
  $("#analysis-status").textContent = "Análise carregada do Histórico."
}

async function loadAcervo({ chat = false } = {}) {
  try {
    const data = await apiJson("/api/painel/acervo")
    const ch = currentChatChannel()
    const ofChannel = (arr) => (arr || []).filter((item) => (item.channelId || primaryChannelId) === ch)
    const buscas = ofChannel(data.buscas)
    const analises = ofChannel(data.analises)
    const roteiros = ofChannel(data.roteiros)
    allChats = data.chats || []
    const showArch = $("#history-show-archived")?.checked
    const vis = (arr) => arr.filter((x) => showArch || !x.archived)
    const vBuscas = vis(buscas)
    const vAnalises = vis(analises)

    $("#count-searches").textContent = vBuscas.length
    $("#count-analyses").textContent = vAnalises.length

    if (chat) {
      const channelChats = allChats.filter(c => chatChannelId(c) === currentChatChannel())
      const thread = channelChats.find(c => c.id === activeChatId) || channelChats.find(c => !c.archived)
      activeChatId = thread?.id || null
      lastChatList = thread?.messages || []
      $("#chat-active-title").textContent = thread?.title || "Direcionador IA"
      renderChat(lastChatList)
    }
    renderChatSidebar()

    const bar = $("#recent-searches-bar")
    const activeBuscas = buscas.filter((b) => !b.archived)
    bar.hidden = !activeBuscas.length
    bar.replaceChildren(
      ...(activeBuscas.length ? [el("span", "Recentes:", "meta")] : []),
      ...activeBuscas.slice(0, 6).map((b) => {
        const chip = el("button", `${b.objetivo} · ${(b.results || []).length}`, "history-chip")
        chip.type = "button"
        chip.addEventListener("click", () => reopenSavedSearch(b))
        return chip
      }),
    )

    const archDel = (kind, item) => [
      btn(item.archived ? "Desarquivar" : "Arquivar", async () => {
        await apiJson(`/api/painel/acervo/${kind}/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: !item.archived }),
        })
        toast(item.archived ? "Item restaurado" : "Item arquivado")
        loadAcervo()
      }, "ghost", "archive"),
      btn("", async () => {
        if (!confirm("Excluir este item do histórico?")) return
        await apiJson(`/api/painel/acervo/${kind}/${encodeURIComponent(item.id)}`, { method: "DELETE" })
        toast("Item excluído")
        loadAcervo()
      }, "ghost", "trash"),
    ]

    listItems("#history-searches", vBuscas.map((b) => makeCard(el("strong", b.objetivo), `${b.tipo === "channel" ? "Canais" : "Shorts"} · ${(b.results || []).length} resultados · ${new Date(b.createdAt).toLocaleString("pt-BR")}`, btn("Reabrir", () => reopenSavedSearch(b), "primary", "search"), ...archDel("buscas", b))), "Nenhuma busca salva ainda.", "search")

    listItems("#history-analyses", vAnalises.map((a) => {
      const ad = a.analise?.adaptacao_fatonexo
      return makeCard(el("strong", a.video?.title || a.video?.id || "Vídeo"), [a.video?.channel, toText(a.analise?.promessa).slice(0, 110), new Date(a.createdAt).toLocaleString("pt-BR")].filter(Boolean).join(" · "), btn("Ver análise", () => showSavedAnalysis(a), "primary", "eye"), ad && btn("Roteiro", () => {
        sendAdaptationToStudio(ad)
      }, "ghost", "pen"), ...archDel("analises", a))
    }), "Nenhuma análise salva ainda.", "film")

    const scriptCard = (r) => {
      const head = el("div", "", "actions")
      head.append(el("strong", r.roteiro?.titulo || r.pauta), el("span", r.status === "rascunho" ? "Rascunho" : "Validado", `draft-badge ${r.status === "rascunho" ? "rascunho" : "validado"}`))
      return makeCard(head, [toText(r.roteiro?.promessa).slice(0, 100), new Date(r.updatedAt || r.createdAt).toLocaleString("pt-BR")].filter(Boolean).join(" · "), btn("Abrir", () => loadSavedScript(r), "primary", "pen"), ...archDel("roteiros", r))
    }
    listItems("#script-drafts-list", roteiros.filter((r) => !r.archived).slice(0, 12).map(scriptCard), "Seus rascunhos e roteiros aparecem aqui.", "script")
  } catch {}
}

/* ============================== Integrações ============================== */

async function loadConnections() {
  try {
    const conn = await apiJson("/api/painel/conexoes")
    const badge = $("#tts-conn-badge")
    badge.textContent = conn.gemini ? "API Gemini conectada" : "API Gemini não conectada"
    badge.className = conn.gemini ? "badge-ok" : "meta"
    $("#gemini-conn-badge").hidden = !conn.gemini
    $("#youtube-conn-badge").hidden = !conn.youtube
    const ocBadge = $("#opencode-conn-badge")
    if (ocBadge) ocBadge.hidden = !(conn.opencodeCloud || conn.opencode)
    if (conn.gemini) $("#tts-status").textContent = "Pronto: escolha voz e estilo e gere o áudio."
    if (conn.gemini) $("#gemini-status").textContent = "Chave Gemini configurada e pronta para narração."
    if (conn.youtube) $("#youtube-status").textContent = "Chave YouTube Data API configurada."
    const ocSt = $("#opencode-status")
    if (ocSt) ocSt.textContent = conn.opencodeCloud ? "Chave OpenCode configurada na nuvem e ativa." : "Usando servidor local OpenCode (cole sua chave para usar na Vercel)."
  } catch {}
}
$$(".provider-form").forEach((form) =>
  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const provider = form.dataset.provider
    const status = $(`#${provider}-status`)
    const b = form.querySelector("button")
    b.disabled = true
    status.textContent = "Validando a chave…"
    try {
      await jsonPost(`/api/painel/conexoes/${provider}`, { key: form.elements.key.value.trim() })
      form.reset()
      toast(`${provider === "gemini" ? "Google AI Studio" : provider === "opencode" ? "OpenCode API" : "YouTube API"} conectado`)
      loadConnections()
    } catch (error) {
      status.textContent = error.message
      toast(error.message, "error")
    } finally {
      b.disabled = false
    }
  }),
)

/* ============================== Integração entre módulos ============================== */

initLive({
  onAnalyze: (id) => analyzeVideo(id),
  onChatAbout: (snap) => {
    const c = snap?.current
    openWorkspace("chat", true)
    activeChatId = null
    lastChatList = []
    $("#chat-active-title").textContent = "Nova conversa · Análise do canal"
    renderChatSidebar()
    renderChat([])
    sendChat(`Analise os números ao vivo do canal: ${c?.subs ?? "?"} inscritos, ${c?.views ?? 0} views somadas nos Shorts, média de ${c?.avg ?? 0} por Short. O que devo fazer agora para crescer mais rápido?`)
  },
})

window.addEventListener("live:snapshot", () => {
  renderYpp()
  if (!lastChatList.length && !chatBusy && !$("#chat").hidden) renderChat([])
})
window.addEventListener("workspace:change", (e) => {
  const id = e.detail.id
  if (id === "chat") setTimeout(() => (chatBox.scrollTop = chatBox.scrollHeight), 50)
  if (id === "historico") loadAcervo()
  if (id !== "chat") $("#chat-sidebar").classList.remove("open")
  closeDrawers()
})

renderBoard()
renderYpp()
updateMeter()
renderChat([])
loadCatalogs()
loadConnections()
loadAcervo({ chat: true })
