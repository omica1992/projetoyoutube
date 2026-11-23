const views = [...document.querySelectorAll("[data-workspace]")]
const links = [...document.querySelectorAll(".workspace-nav a")]
const title = document.querySelector("#page-title")

function renderWorkspace(hash) {
  const id = hash.slice(1)
  const active = views.find((view) => view.id === id) ?? views[0]
  for (const view of views) view.hidden = view !== active
  for (const link of links) {
    if (link.hash === `#${active.id}`) {
      link.setAttribute("aria-current", "page")
      link.scrollIntoView?.({ block: "nearest", inline: "center" })
    } else link.removeAttribute("aria-current")
  }
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
