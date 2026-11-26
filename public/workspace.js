const views = [...document.querySelectorAll("[data-workspace]")]
const links = [...document.querySelectorAll(".workspace-nav a")]
const editor = document.querySelector("#studio-embedded")
let pendingScript
let editorRoute
const title = document.querySelector("#page-title")
const editorRoutes = /^(inicio|criar|projetos|pautas|canais|conectar|revisao|comparar|exportar|publicar|gerando)(?:\/|$)/
const productionTabs = { pacote: "prod-pacote", publicacao: "prod-publicar" }

function renderWorkspace(hash, fromEditor = false) {
  const target = hash.slice(1) || (location.pathname === "/" ? "criar" : "")
  const destination = target === "producao" ? "criar" : target
  const inEditor = editorRoutes.test(destination)
  const id = inEditor || productionTabs[destination] ? "producao" : destination
  const active = views.find((view) => view.id === id) ?? views[0]
  const section = destination.split("/")[0]
  const navId = active.id !== "producao" ? active.id : ({
    inicio: "projetos", conectar: "canais", revisao: "projetos", comparar: "projetos", exportar: "projetos",
    publicar: "projetos", gerando: "projetos",
  })[section] || section
  const currentLink = links.find(link => link.hash === "#" + navId)
  for (const view of views) view.hidden = view !== active
  for (const link of links) {
    if (link === currentLink) {
      link.setAttribute("aria-current", "page")
      link.scrollIntoView?.({ block: "nearest", inline: "center" })
    } else link.removeAttribute("aria-current")
  }
  if (active.id === "producao") {
    const tab = productionTabs[destination] || "prod-editor"
    document.querySelector(`[data-subtarget="${tab}"]:not(.active)`)?.click()
    if (inEditor && !fromEditor && editorRoute !== destination) {
      editorRoute = destination
      if (!editor.hasAttribute("src")) editor.src = editor.dataset.src.split("#")[0] + "#" + destination
      else editor.contentWindow.postMessage({ type: "studio:navigate", data: destination }, location.origin)
    }
  }
  if (title) title.textContent = currentLink?.querySelector("span")?.textContent || active.getAttribute("aria-label") || "FatoNexo"
  window.dispatchEvent(new CustomEvent("workspace:change", { detail: { id: active.id } }))
}

export function openWorkspace(id, scroll = false) {
  const hash = `#${id}`
  if (window.location.hash !== hash) history.pushState(null, "", hash)
  renderWorkspace(hash)
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" })
}

for (const link of links) {
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    openWorkspace(link.hash.slice(1), true)
  })
}

window.addEventListener("hashchange", () => renderWorkspace(window.location.hash))
renderWorkspace(window.location.hash)


export function openStudioScript(data) {
  pendingScript = data
  openWorkspace(data.id ? "criar/" + encodeURIComponent(data.id) : "criar", true)
  editor?.contentWindow?.postMessage({ type: "studio:script", data }, location.origin)
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || !editor || event.source !== editor.contentWindow) return
  const { type, data } = event.data || {}
  if (type === "studio:route" && typeof data === "string" && editorRoutes.test(data)) {
    editorRoute = data
    const current = location.hash.slice(1) || "criar"
    if (!views.find(view => view.id === "producao")?.hidden && (current === "producao" || editorRoutes.test(current)) && current !== data) {
      history.replaceState(null, "", "#" + data)
      renderWorkspace(location.hash, true)
    }
  }
  if (type === "studio:ready") {
    if (editorRoute) editor.contentWindow.postMessage({ type: "studio:navigate", data: editorRoute }, location.origin)
    if (pendingScript) editor.contentWindow.postMessage({ type: "studio:script", data: pendingScript }, location.origin)
  }
  if (type === "studio:received") pendingScript = undefined
  if (type === "studio:height" && Number.isFinite(data)) editor.style.height = Math.max(360, Math.ceil(data)) + "px"
  if (type === "studio:fields") {
    document.querySelector("#pauta").value = data.title || ""
    document.querySelector("#script-text").value = data.script || ""
  }
})
