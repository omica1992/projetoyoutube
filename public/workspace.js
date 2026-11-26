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
    pacote: "criar", inicio: "projetos", conectar: "canais", revisao: "projetos", comparar: "projetos", exportar: "projetos",
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
  const manualTopics = document.querySelector("#manual-topics")
  if (manualTopics) manualTopics.hidden = section !== "pautas"
  if (title) title.textContent = section === "pacote" ? "Pacote de edição" : currentLink?.querySelector("span")?.textContent || active.getAttribute("aria-label") || "FatoNexo"
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
  if (type === "studio:channel") updateChannelIdentity(data)
  if (type === "studio:received") pendingScript = undefined
  if (type === "studio:height" && Number.isFinite(data)) editor.style.height = Math.max(360, Math.ceil(data)) + "px"
  if (type === "studio:fields") {
    document.querySelector("#pauta").value = data.title || ""
    document.querySelector("#script-text").value = data.script || ""
  }
})

const primaryChannelId = "UCClrO3uvc5-H6NPc6alEHDw"
const channelDashboard = document.querySelector("#canal")
const channelHero = document.querySelector("#selected-channel-hero")
const brandTitle = document.querySelector(".rail-brand-text strong")
const originalBrandTitle = brandTitle?.cloneNode(true)
const brandHandle = document.querySelector(".rail-brand-text small")
const originalBrandHandle = brandHandle?.textContent

function loadChannelImage(img, url, fallback) {
  if (!img) return
  const usable = /^https:\/\/(?:[\w.-]+\.googleusercontent\.com|yt3\.ggpht\.com)\//i.test(url || "")
  img.hidden = true
  if (fallback) fallback.hidden = false
  if (!usable) { img.removeAttribute("src"); return }
  img.referrerPolicy = "no-referrer"
  img.onload = () => { img.hidden = false; if (fallback) fallback.hidden = true }
  img.onerror = () => { img.hidden = true; if (fallback) fallback.hidden = false }
  img.src = url
  if (img.complete && img.naturalWidth) img.onload()
}

function updateChannelIdentity(profile) {
  if (!channelHero || !channelDashboard) return
  const alternate = Boolean(profile?.id && profile.id !== primaryChannelId)
  channelDashboard.classList.toggle("alternate-channel", alternate)
  channelHero.hidden = !alternate
  if (!alternate) {
    if (brandTitle && originalBrandTitle) brandTitle.replaceChildren(...originalBrandTitle.cloneNode(true).childNodes)
    if (brandHandle) brandHandle.textContent = originalBrandHandle
    window.dispatchEvent(new Event("studio:reset-brand"))
    return
  }
  if (brandTitle) brandTitle.textContent = profile.title
  if (brandHandle) brandHandle.textContent = profile.handle || "Canal do YouTube"
  channelHero.querySelector("h2").textContent = profile.title
  channelHero.querySelector("p").textContent = profile.handle || ""
  channelHero.querySelector("a").href = "https://www.youtube.com/channel/" + encodeURIComponent(profile.id)
  loadChannelImage(channelHero.querySelector(".selected-channel-logo"), profile.logo)
  loadChannelImage(channelHero.querySelector(".selected-channel-cover"), profile.banner)
  loadChannelImage(document.querySelector("#brand-avatar"), profile.logo, document.querySelector("#brand-fallback"))
}

const selectedProfile = JSON.parse(localStorage.getItem("studio-channel-profiles") || "[]").find(p => p.id === localStorage.getItem("studio-channel"))
if (selectedProfile) updateChannelIdentity(selectedProfile)
