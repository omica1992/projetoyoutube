import { openWorkspace, openStudioScript } from "./workspace.js"

const searchForm = document.querySelector("#youtube-search")
const connection = document.querySelector("#youtube-connection")
const keyForm = document.querySelector("#youtube-key-form")
const keyStatus = document.querySelector("#youtube-key-status")
const referenceForm = document.querySelector("#reference-form")
const ideaForm = document.querySelector("#idea-form")
const newIdea = document.querySelector("#btn-nova-pauta")
const goalForm = document.querySelector("#goal-form")
const status = document.querySelector("#search-status")
const key = "studio:fatonexo:planejamento"
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })
const targets = {
  entry: { subs: 500, views: 3_000_000, uploads: 3 },
  ads: { subs: 1_000, views: 10_000_000 },
  ads2027: { subs: 1_000, views: 20_000_000 },
}

const board = JSON.parse(localStorage.getItem(key) || '{"references":[],"ideas":[],"goal":{}}')
let editingReference = null
let editingIdea = null

function save() {
  localStorage.setItem(key, JSON.stringify(board))
  render()
}

function formData(form) {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]))
}

function showConnection(configured, open) {
  connection.querySelector("summary").textContent = configured
    ? "Chave do Google configurada · trocar"
    : "Conectar chave do Google"
  connection.open = open
}

async function loadYouTubeConnection() {
  try {
    const response = await fetch("/api/youtube/conexao")
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    showConnection(data.configured, !data.configured)
  } catch (error) {
    keyStatus.textContent = error.message
    connection.open = true
  }
}

keyForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const button = keyForm.querySelector("button")
  button.disabled = true
  keyStatus.textContent = "Validando no Google…"
  try {
    const response = await fetch("/api/youtube/conexao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keyForm.elements.key.value.trim() }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    keyForm.reset()
    keyStatus.textContent = ""
    showConnection(true, false)
    status.textContent = "YouTube conectado. Você já pode pesquisar dentro do Studio."
    if (searchForm.elements.q.value.trim()) searchForm.requestSubmit()
  } catch (error) {
    keyStatus.textContent = error.message
  } finally {
    button.disabled = false
  }
})

function fill(form, values) {
  form.reset()
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name)
    if (input) input.value = value ?? ""
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  return node
}

function link(text, url) {
  const node = element("a", text)
  node.href = url
  node.target = "_blank"
  node.rel = "noopener"
  return node
}

function action(text, handler) {
  const button = element("button", text, "ghost")
  button.type = "button"
  button.addEventListener("click", handler)
  return button
}

function canonicalLink(raw, type) {
  const url = new URL(raw)
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error()
  const parts = url.pathname.split("/").filter(Boolean)
  const shortHost = url.hostname === "youtu.be"
  const mainHost = ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
  if (!shortHost && !mainHost) throw new Error()
  if (type === "video") {
    const id = shortHost ? parts[0] : parts[0] === "shorts" ? parts[1] : url.searchParams.get("v")
    if (!/^[\w-]{11}$/.test(id || "")) throw new Error()
    return `https://www.youtube.com/watch?v=${id}`
  }
  if (!mainHost) throw new Error()
  const channel = /^@[\p{L}\p{N}_.-]+$/u.test(decodeURIComponent(parts[0] || "")) ? parts[0] :
    ["channel", "c", "user"].includes(parts[0]) && /^[\w.-]+$/.test(parts[1] || "") ? parts.slice(0, 2).join("/") : ""
  if (!channel) throw new Error()
  return `https://www.youtube.com/${channel}/shorts`
}

function referenceMetrics(reference) {
  const metrics = [reference.channel, reference.date]
  if (reference.views != null && reference.views !== "") metrics.push(`${number.format(reference.views)} views públicas`)
  if (reference.baseline > 0 && reference.views !== "") {
    metrics.push(`${number.format(reference.views / reference.baseline)}× a mediana informada`)
  }
  return metrics.filter(Boolean).join(" · ")
}

function listItems(selector, items, empty) {
  document.querySelector(selector).replaceChildren(...(items.length ? items : [element("p", empty, "meta")]))
}

function card(head, subtitle, ...actions) {
  const item = element("div", "", "cena-mini strategy-item")
  item.append(head)
  if (subtitle) item.append(element("p", subtitle, "meta"))
  if (actions.length) {
    const row = element("div", "", "actions")
    row.append(...actions)
    item.append(row)
  }
  return item
}

function editReference(reference, id = null) {
  editingReference = id
  fill(referenceForm, reference)
  toggleReferenceMetrics()
  const editor = document.querySelector("#reference-editor")
  editor.open = true
  referenceForm.elements.title.focus()
}

function editIdea(idea = {}, id = null) {
  editingIdea = id
  fill(ideaForm, idea)
  openWorkspace("estrategia")
  ideaForm.hidden = false
  newIdea.setAttribute("aria-expanded", "true")
  ideaForm.elements.title.focus()
}

function closeIdea() {
  editingIdea = null
  ideaForm.reset()
  ideaForm.hidden = true
  newIdea.setAttribute("aria-expanded", "false")
  newIdea.focus()
}

function toggleReferenceMetrics() {
  const show = referenceForm.elements.type.value === "video"
  const metrics = document.querySelector("#reference-metrics")
  metrics.hidden = !show
  document.querySelector("#baseline-help").hidden = !show
  for (const field of metrics.querySelectorAll("input")) field.disabled = !show
}

function render() {
  const select = ideaForm.elements.reference
  const previous = select.value
  select.replaceChildren(new Option("Sem referência", ""), ...board.references.map((ref) => new Option(ref.title, ref.id)))
  select.value = board.references.some((ref) => ref.id === previous) ? previous : ""

  listItems("#reference-list", board.references.map((ref) => card(
    link(ref.title, ref.url),
    [ref.type === "video" ? "Vídeo" : "Canal", referenceMetrics(ref), ref.notes].filter(Boolean).join(" · "),
    action("Editar", () => editReference(ref, ref.id)),
    action("Criar pauta", () => editIdea({ reference: ref.id })),
  )), "Salve um vídeo ou canal que tenha algo para testar no FatoNexo.")

  const ranked = [...board.ideas].sort((a, b) => Number(b.status === "Prioridade") - Number(a.status === "Prioridade"))
  listItems("#idea-list", ranked.map((idea) => {
    const measures = [
      idea.age && `${idea.age} dias`,
      idea.stayed && `${idea.stayed}% continuaram assistindo`,
      idea.watched && `${idea.watched}% de média assistida`,
      idea.engaged && `${number.format(idea.engaged)} views engajadas`,
    ].filter(Boolean)
    return card(
      element("strong", idea.title),
      [idea.pillar, idea.status, ...measures, idea.learning].filter(Boolean).join(" · "),
      action("Editar", () => editIdea(idea, idea.id)),
      action("Usar no roteiro", () => useIdea(idea)),
    )
  }), "Sua fila ainda está vazia. Clique em Nova pauta ou use uma referência salva.")

  const goal = board.goal
  const labels = { subs: "Inscritos", views: "Views qualificadas em 90 dias", uploads: "Envios válidos em 90 dias" }
  document.querySelector("#goal-tier").textContent = goalForm.elements.tier.selectedOptions[0].textContent
  document.querySelector("#goal-progress").replaceChildren(...Object.entries(targets[goal.tier] ?? targets.entry).map(([name, target]) => {
    const tile = element("div", "", "goal-metric")
    const amount = goal[name] ? number.format(goal[name]) : "—"
    const value = element("strong", `${amount} / ${number.format(target)}`)
    const label = element("span", labels[name], "meta")
    tile.append(value, label)
    return tile
  }))
}

function useIdea(idea) {
  const reference = board.references.find((ref) => ref.id === idea.reference)
  const ideaText = [idea.title, idea.promise, idea.context, idea.payoff, reference?.url, reference?.notes].filter(Boolean).join("\n")
  openStudioScript({ title: idea.title, idea: ideaText })
}

searchForm.elements.type.addEventListener("change", () => {
  searchForm.elements.days.disabled = searchForm.elements.type.value === "channel"
})

document.querySelector("#open-youtube-search").addEventListener("click", () => {
  if (!searchForm.reportValidity()) return
  const { q, type } = formData(searchForm)
  const params = new URLSearchParams({ search_query: type === "video" ? `${q} #shorts` : q })
  if (type === "channel") params.set("sp", "EgIQAg==")
  window.open(`https://www.youtube.com/results?${params}`, "_blank", "noopener")
})

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  const params = new URLSearchParams(formData(searchForm))
  const submit = searchForm.querySelector('button:not([type="button"])')
  submit.disabled = true
  listItems("#search-results", [], "")
  status.textContent = "Consultando o YouTube…"
  try {
    const response = await fetch(`/api/youtube/pesquisa?${params}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    if (!data.configured) {
      status.textContent = "Conecte sua chave do Google acima para ver os resultados aqui."
      showConnection(false, true)
      keyForm.elements.key.focus()
      return
    }
    status.textContent = data.results.length
      ? params.get("type") === "video"
        ? "Confira quais resultados são Shorts. A API retorna vídeos curtos em geral."
        : "Abra o canal para conferir os Shorts publicados."
      : "Nenhum resultado para essa busca."
    listItems("#search-results", data.results.map((ref) => card(
      link(ref.title, ref.url), referenceMetrics(ref), action("Selecionar", () => editReference(ref)),
    )), "")
  } catch (error) {
    status.textContent = error.message
  } finally {
    submit.disabled = false
  }
})

referenceForm.elements.type.addEventListener("change", () => {
  referenceForm.elements.url.setCustomValidity("")
  toggleReferenceMetrics()
})
referenceForm.elements.url.addEventListener("input", () => referenceForm.elements.url.setCustomValidity(""))
referenceForm.addEventListener("submit", (event) => {
  event.preventDefault()
  const reference = formData(referenceForm)
  try {
    reference.url = canonicalLink(reference.url, reference.type)
  } catch {
    referenceForm.elements.url.setCustomValidity("Use um link de vídeo ou canal do YouTube compatível com o tipo selecionado.")
    referenceForm.reportValidity()
    return
  }
  const duplicate = board.references.find((ref) => ref.url === reference.url && ref.id !== editingReference)
  if (duplicate) {
    referenceForm.elements.url.setCustomValidity("Esse link já está salvo. Use Editar na lista de referências.")
    referenceForm.reportValidity()
    return
  }
  reference.id = editingReference || crypto.randomUUID()
  board.references = [reference, ...board.references.filter((ref) => ref.id !== reference.id)]
  editingReference = null
  referenceForm.reset()
  toggleReferenceMetrics()
  save()
  document.querySelector("#reference-editor").open = false
  document.querySelector("#reference-editor summary").focus()
})

newIdea.addEventListener("click", () => editIdea())
document.querySelector("#btn-cancelar-pauta").addEventListener("click", closeIdea)

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault()
  const idea = { ...formData(ideaForm), id: editingIdea || crypto.randomUUID() }
  board.ideas = [idea, ...board.ideas.filter((item) => item.id !== idea.id)]
  closeIdea()
  save()
})

goalForm.addEventListener("submit", (event) => {
  event.preventDefault()
  board.goal = formData(goalForm)
  save()
})

fill(goalForm, board.goal)
render()
loadYouTubeConnection()
