const NS = "http://www.w3.org/2000/svg"

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
export const numFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })
export const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

export function el(tag, text, className) {
  const node = document.createElement(tag)
  if (text != null && text !== "") node.textContent = String(text)
  if (className) node.className = className
  return node
}

export function icon(name, cls = "") {
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", `ic ${cls}`.trim())
  const use = document.createElementNS(NS, "use")
  use.setAttribute("href", `#i-${name}`)
  svg.append(use)
  return svg
}

export function btn(label, handler, kind = "ghost", iconName = "") {
  const node = el("button", "", `${kind} small`)
  node.type = "button"
  if (iconName) node.append(icon(iconName))
  node.append(el("span", label))
  node.addEventListener("click", handler)
  return node
}

export function extLink(text, url, className = "") {
  const a = el("a", text, className)
  a.href = url
  a.target = "_blank"
  a.rel = "noopener"
  return a
}

export async function apiJson(url, options = {}) {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data
}

export function toast(message, kind = "ok") {
  const box = $("#toasts")
  if (!box) return
  const node = el("div", "", `toast ${kind === "error" ? "error" : ""}`)
  node.append(icon(kind === "error" ? "x" : "check"), el("span", message))
  box.append(node)
  setTimeout(() => {
    node.classList.add("out")
    setTimeout(() => node.remove(), 320)
  }, kind === "error" ? 5200 : 2800)
}

export function hhmm(t, withSeconds = false) {
  const d = new Date(t)
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) })
}

export function timeAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return "agora"
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

export function animateNumber(node, to) {
  if (to == null || !Number.isFinite(to)) {
    node.textContent = "—"
    node.dataset.v = ""
    return
  }
  const from = Number(node.dataset.v)
  node.dataset.v = String(to)
  if (!Number.isFinite(from) || from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = numFmt.format(to)
    return
  }
  const start = performance.now()
  const dur = 900
  const frame = (now) => {
    const k = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - k, 3)
    node.textContent = numFmt.format(Math.round(from + (to - from) * eased))
    if (k < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/** Gradientes SVG compartilhados (gráficos, anéis). */
export function installGradients() {
  if ($("#shared-gradients")) return
  const svg = document.createElementNS(NS, "svg")
  svg.id = "shared-gradients"
  svg.setAttribute("width", "0")
  svg.setAttribute("height", "0")
  svg.style.position = "absolute"
  svg.innerHTML = `<defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2b53f" stop-opacity="0.42"/><stop offset="1" stop-color="#f2b53f" stop-opacity="0"/></linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd67c"/><stop offset="1" stop-color="#c98617"/></linearGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd67c"/><stop offset="1" stop-color="#3ccf9b"/></linearGradient>
    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2b53f" stop-opacity="0.35"/><stop offset="1" stop-color="#f2b53f" stop-opacity="0"/></linearGradient>
  </defs>`
  document.body.append(svg)
}

/* ------------------------------ Markdown ------------------------------ */

function inline(parent, text) {
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|(?<![*\w])\*[^*\n]+\*(?![*\w]))/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)))
    const token = m[0]
    if (token.startsWith("**")) parent.append(el("strong", token.slice(2, -2)))
    else if (token.startsWith("`")) parent.append(el("code", token.slice(1, -1)))
    else if (token.startsWith("[")) {
      const close = token.indexOf("](")
      parent.append(extLink(token.slice(1, close), token.slice(close + 2, -1)))
    } else parent.append(el("em", token.slice(1, -1)))
    last = m.index + token.length
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)))
}

const isListLine = (t) => /^([-*•]|\d+[.)])\s+/.test(t)
const isBlockStart = (t) =>
  !t || t.startsWith("```") || t.startsWith("|") || t.startsWith(">") || /^#{1,4}\s/.test(t) || isListLine(t) || /^([-*_])\1{2,}$/.test(t.replace(/\s/g, ""))

const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())

export function renderMarkdown(source) {
  const root = el("div", "", "md")
  const lines = String(source || "").replace(/\r/g, "").split("\n")
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (!t) { i++; continue }

    if (t.startsWith("```")) {
      const buf = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++])
      i++
      const pre = document.createElement("pre")
      pre.append(el("code", buf.join("\n")))
      root.append(pre)
      continue
    }
    if (/^([-*_])\1{2,}$/.test(t.replace(/\s/g, ""))) { root.append(document.createElement("hr")); i++; continue }
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const node = document.createElement(`h${h[1].length}`)
      inline(node, h[2])
      root.append(node)
      i++
      continue
    }
    if (t.startsWith("|")) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]))
      const hasHead = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c))
      const table = document.createElement("table")
      const bodyRows = hasHead ? rows.slice(2) : rows
      if (hasHead) {
        const thead = document.createElement("thead")
        const tr = document.createElement("tr")
        for (const c of rows[0]) { const th = document.createElement("th"); inline(th, c); tr.append(th) }
        thead.append(tr)
        table.append(thead)
      }
      const tbody = document.createElement("tbody")
      for (const r of bodyRows) {
        const tr = document.createElement("tr")
        for (const c of r) { const td = document.createElement("td"); inline(td, c); tr.append(td) }
        tbody.append(tr)
      }
      table.append(tbody)
      const wrap = el("div", "", "table-wrap")
      wrap.append(table)
      root.append(wrap)
      continue
    }
    if (t.startsWith(">")) {
      const buf = []
      while (i < lines.length && lines[i].trim().startsWith(">")) buf.push(lines[i++].trim().replace(/^>\s?/, ""))
      const q = document.createElement("blockquote")
      inline(q, buf.join(" "))
      root.append(q)
      continue
    }
    if (isListLine(t)) {
      const ordered = /^\d/.test(t)
      const list = document.createElement(ordered ? "ol" : "ul")
      while (i < lines.length && isListLine(lines[i].trim())) {
        const li = document.createElement("li")
        inline(li, lines[i++].trim().replace(/^([-*•]|\d+[.)])\s+/, ""))
        list.append(li)
      }
      root.append(list)
      continue
    }
    const buf = []
    while (i < lines.length && !isBlockStart(lines[i].trim())) buf.push(lines[i++].trim())
    if (!buf.length) { buf.push(t); i++ }
    const p = document.createElement("p")
    buf.forEach((line, idx) => {
      if (idx) p.append(document.createElement("br"))
      inline(p, line)
    })
    root.append(p)
  }
  return root
}

