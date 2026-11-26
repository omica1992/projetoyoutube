const views = [...document.querySelectorAll("[data-workspace]")]
const links = [...document.querySelectorAll(".workspace-nav a")]
const editor = document.querySelector("#studio-embedded")
let pendingScript
const title = document.querySelector("#page-title")

function renderWorkspace(hash) {
  const target = hash.slice(1) || (location.pathname === "/" ? "producao" : "")
  const id = /^(inicio|criar|projetos|pautas|canais|revisao|comparar|exportar|publicar|gerando)(?:\/|$)/.test(target) ? "producao" : target
  const active = views.find((view) => view.id === id) ?? views[0]
  for (const view of views) view.hidden = view !== active
  for (const link of links) {
    if (link.hash === `#${active.id}`) {
      link.setAttribute("aria-current", "page")
      link.scrollIntoView?.({ block: "nearest", inline: "center" })
    } else link.removeAttribute("aria-current")
  }
  if (active.id === "producao" && editor && !editor.hasAttribute("src")) editor.src = id === target ? editor.dataset.src : editor.dataset.src.split("#")[0] + "#" + target
  if (title) title.textContent = active.getAttribute("aria-label") || "FatoNexo"
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
  openWorkspace("producao", true)
  document.querySelector('[data-subtarget="prod-editor"]')?.click()
  editor?.contentWindow?.postMessage({ type: "studio:script", data }, location.origin)
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || !editor || event.source !== editor.contentWindow) return
  const { type, data } = event.data || {}
  if (type === "studio:ready" && pendingScript) editor.contentWindow.postMessage({ type: "studio:script", data: pendingScript }, location.origin)
  if (type === "studio:received") pendingScript = undefined
  if (type === "studio:height" && Number.isFinite(data)) editor.style.height = Math.max(360, Math.ceil(data)) + "px"
  if (type === "studio:fields") {
    document.querySelector("#pauta").value = data.title || ""
    document.querySelector("#script-text").value = data.script || ""
  }
})
