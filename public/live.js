import { $, $$, el, icon, numFmt, compact, apiJson, animateNumber, renderMarkdown, timeAgo, hhmm, toast, installGradients, extLink, btn } from "./ui.js"

/**
 * Dashboard ao vivo do canal: recebe snapshots do servidor (SSE) e desenha
 * KPIs, gráfico, atividade, Shorts, meta YPP e a análise gerada por IA.
 */

export const YPP_VIEWS_KEY = "studio:fatonexo:ypp-views-90d"
const TARGET_SUBS = 500

let snap = null
let localRecv = 0
let metric = "views"
let range = "all"
let handlers = { onAnalyze() {}, onChatAbout() {} }
let insightBusy = false
let lastInsightTry = 0
let kpisBuilt = false
let es = null

export const getSnapshot = () => snap
export const getAvatar = () => snap?.channel?.avatar || ""

const KPIS = [
  { key: "subs", label: "Inscritos", icon: "users", value: (c) => c.subs },
  { key: "views", label: "Views nos Shorts", icon: "eye", value: (c) => c.views },
  { key: "videos", label: "Shorts publicados", icon: "film", value: (c) => c.videos },
  { key: "avg", label: "Média por Short", icon: "zap", value: (c) => c.avg },
]

function seriesDelta(key) {
  const pts = (snap?.series || []).filter((p) => typeof p[key] === "number")
  if (pts.length < 2) return null
  const last = pts.at(-1)
  for (const [ms, label] of [[3_600_000, "1h"], [86_400_000, "24h"]]) {
    const target = snap.now - ms
    const base = [...pts].reverse().find((p) => p.t <= target)
    if (base) return { v: last[key] - base[key], label }
  }
  const first = pts[0]
  return { v: last[key] - first[key], label: `desde ${hhmm(first.t)}`, partial: true }
}

function chip(delta) {
  if (!delta) return el("span", "coletando…", "chip gold")
  const { v, label } = delta
  const up = v > 0
  const node = el("span", "", `chip ${up ? "up" : v < 0 ? "down" : ""}`)
  node.append(icon(up ? "trend" : "clock"))
  const fmtV = Math.abs(v) >= 1000 ? compact.format(v) : numFmt.format(v)
  node.append(document.createTextNode(v === 0 ? `estável · ${label}` : `${up ? "+" : ""}${fmtV} · ${label}`))
  return node
}

function sparkline(key) {
  const pts = (snap?.series || []).filter((p) => typeof p[key] === "number").slice(-40)
  const W = 96, H = 34
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("class", "spark")
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`)
  const vals = pts.map((p) => p[key])
  if (vals.length < 2) {
    svg.innerHTML = `<path d="M2 ${H / 2} H${W - 2}" stroke="#f2b53f" stroke-opacity=".45" stroke-width="2" stroke-dasharray="3 4" fill="none" stroke-linecap="round"/>`
    return svg
  }
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const x = (i) => 2 + (i / (vals.length - 1)) * (W - 4)
  const y = (v) => 3 + (1 - (v - min) / (max - min)) * (H - 6)
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  svg.innerHTML = `<path d="${d} L${W - 2} ${H} L2 ${H} Z" fill="url(#sparkGrad)"/><path d="${d}" fill="none" stroke="#f2b53f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  return svg
}

function buildKpis() {
  const box = $("#channel-summary")
  box.replaceChildren(
    ...KPIS.map((k) => {
      const card = el("div", "", "kpi")
      card.dataset.key = k.key
      const top = el("div", "", "kpi-top")
      const ic = el("span", "", "kpi-icon")
      ic.append(icon(k.icon))
      top.append(ic)
      const label = el("div", k.label, "kpi-label")
      const value = el("div", "—", "kpi-value")
      const foot = el("div", "", "kpi-foot")
      card.append(top, label, value, foot)
      return card
    }),
  )
  kpisBuilt = true
}

function renderKpis(prev) {
  if (!kpisBuilt) buildKpis()
  const cur = snap.current
  for (const k of KPIS) {
    const card = $(`.kpi[data-key="${k.key}"]`)
    if (!card) continue
    const v = cur ? k.value(cur) : null
    animateNumber($(".kpi-value", card), v)
    const foot = $(".kpi-foot", card)
    foot.replaceChildren(chip(cur ? seriesDelta(k.key) : null), sparkline(k.key))
    if (prev && cur && k.value(prev) !== v && v != null) {
      card.classList.remove("flash")
      void card.offsetWidth
      card.classList.add("flash")
    }
  }
}

/* ------------------------------ Gráfico ------------------------------ */

function rangeFilter(points) {
  if (range === "all") return points
  const ms = range === "1h" ? 3_600_000 : 86_400_000
  const from = snap.now - ms
  const inRange = points.filter((p) => p.t >= from)
  // mantém o ponto anterior à janela para a linha começar no valor certo
  const before = [...points].reverse().find((p) => p.t < from)
  return before ? [before, ...inRange] : inRange
}

function axisLabel(t, spanMs) {
  const d = new Date(t)
  return spanMs > 20 * 3_600_000
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hhmm(t)
    : hhmm(t)
}

function barsChart(shorts) {
  const items = shorts.slice(0, 12)
  const W = 860, H = 250, L = 12, B = 34, T = 26
  const max = Math.max(1, ...items.map((s) => s.views || 0))
  const slot = (W - L * 2) / items.length
  const bw = Math.min(46, slot - 12)
  const bars = items
    .map((s, i) => {
      const h = Math.max(4, ((H - T - B) * (s.views || 0)) / max)
      const x = L + i * slot + (slot - bw) / 2
      const y = H - B - h
      return `<g><rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="7"><title>${(s.title || "").replace(/[<&]/g, "")}: ${numFmt.format(s.views || 0)} views</title></rect>
      <text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" style="fill:#f3e7c9">${compact.format(s.views || 0)}</text>
      <text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle">#${i + 1}</text></g>`
    })
    .join("")
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Views por Short">${bars}</svg>`
}

function renderChart() {
  const wrap = $("#channel-chart-wrap")
  const sub = $("#chart-sub")
  if (!snap?.current) {
    wrap.replaceChildren(el("div", "Aguardando a primeira leitura do YouTube…", "chart-empty"))
    return
  }
  const first = snap.series[0]
  const all = snap.series.filter((p) => typeof p[metric] === "number")
  const pts = rangeFilter(all)
  const metricName = { views: "Views dos Shorts", subs: "Inscritos", avg: "Média de views por Short" }[metric]

  if (pts.length < 2) {
    sub.textContent = `Monitorando desde ${hhmm(first.t)} · ${snap.polls} leituras · a linha aparece quando os números variarem`
    wrap.replaceChildren()
    const note = el("div", "", "chart-empty")
    note.append(
      icon("trend"),
      el("span", `${metricName}: o monitor está acompanhando em tempo real. Enquanto não há variação, veja as views de cada Short.`),
    )
    const holder = el("div")
    holder.innerHTML = barsChart(snap.shorts)
    wrap.append(note, holder)
    return
  }

  const spanMs = pts.at(-1).t - pts[0].t
  sub.textContent = `${metricName} · ${pts.length} pontos · de ${axisLabel(pts[0].t, spanMs)} até agora`
  const W = 860, H = 290, L = 54, R = 18, T = 18, B = 32
  const t0 = pts[0].t
  const t1 = Math.max(pts.at(-1).t, snap.now)
  const vals = pts.map((p) => p[metric])
  let min = Math.min(...vals), max = Math.max(...vals)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.18
  min = Math.max(0, min - pad)
  max += pad
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B)

  let d = `M${x(pts[0].t).toFixed(1)} ${y(pts[0][metric]).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L${x(pts[i].t).toFixed(1)} ${y(pts[i - 1][metric]).toFixed(1)} L${x(pts[i].t).toFixed(1)} ${y(pts[i][metric]).toFixed(1)}`
  }
  const lastV = pts.at(-1)[metric]
  d += ` L${x(t1).toFixed(1)} ${y(lastV).toFixed(1)}`
  const area = `${d} L${x(t1).toFixed(1)} ${H - B} L${x(t0).toFixed(1)} ${H - B} Z`

  const grid = [0, 1, 2, 3].map((i) => {
    const v = min + ((max - min) * i) / 3
    const yy = y(v)
    return `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text class="axis" x="${L - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${compact.format(Math.round(v))}</text>`
  }).join("")
  const xl = [0, 0.5, 1].map((k, i) => {
    const t = t0 + (t1 - t0) * k
    return `<text class="axis" x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${axisLabel(t, spanMs)}</text>`
  }).join("")
  const lx = x(t1), ly = y(lastV)

  wrap.replaceChildren()
  const holder = el("div")
  holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metricName}">
    ${grid}${xl}
    <path d="${area}" fill="url(#areaGrad)"/>
    <path class="line" d="${d}"/>
    <circle class="pulse" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="7"/>
    <circle class="dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5.5"/>
    <line id="hover-line" class="grid-line" y1="${T}" y2="${H - B}" style="display:none;stroke:rgba(242,181,63,.5);stroke-dasharray:none"/>
    <circle id="hover-dot" class="dot" r="5" style="display:none"/>
    <rect id="hover-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg>`
  const tip = el("div", "", "chart-tip")
  tip.hidden = true
  wrap.append(holder, tip)

  const svg = $("svg", holder)
  const hit = $("#hover-hit", holder)
  const hline = $("#hover-line", holder)
  const hdot = $("#hover-dot", holder)
  hit.addEventListener("mousemove", (ev) => {
    const rect = svg.getBoundingClientRect()
    const px = ((ev.clientX - rect.left) / rect.width) * W
    const t = t0 + ((px - L) / (W - L - R)) * (t1 - t0)
    let best = pts[0]
    for (const p of pts) if (p.t <= t) best = p
    const bx = x(best.t), by = y(best[metric])
    hline.setAttribute("x1", bx); hline.setAttribute("x2", bx); hline.style.display = ""
    hdot.setAttribute("cx", bx); hdot.setAttribute("cy", by); hdot.style.display = ""
    tip.hidden = false
    tip.style.left = `${(bx / W) * rect.width}px`
    tip.style.top = `${(by / H) * rect.height}px`
    tip.replaceChildren(el("b", numFmt.format(best[metric])), document.createTextNode(axisLabel(best.t, spanMs)))
  })
  hit.addEventListener("mouseleave", () => {
    tip.hidden = true
    hline.style.display = "none"
    hdot.style.display = "none"
  })
}

/* ------------------------------ Atividade, Shorts, meta ------------------------------ */

function renderFeed() {
  const feed = snap.feed || []
  $("#feed-count").textContent = feed.length ? `${feed.length} eventos` : ""
  if (!feed.length) {
    const empty = el("div", "", "empty")
    empty.append(icon("zap"), el("span", "Sem movimento ainda. Cada nova view ou inscrito aparece aqui na hora."))
    $("#live-feed").replaceChildren(empty)
    return
  }
  $("#live-feed").replaceChildren(
    ...feed.slice(0, 20).map((e) => {
      const row = el("div", "", "feed-item")
      const dot = el("span", "", `feed-dot ${e.type}`)
      dot.append(icon(e.type === "subs" ? "users" : e.type === "video" ? "film" : "eye"))
      row.append(dot, el("span", e.text), el("time", hhmm(e.t, true)))
      return row
    }),
  )
}

const shortNodes = new Map()
function renderShorts() {
  const shorts = snap.shorts || []
  $("#shorts-count").textContent = shorts.length ? `${shorts.length} Shorts · ordenados por views` : ""
  const grid = $("#channel-shorts")
  if (!shorts.length) {
    const empty = el("div", "", "empty")
    empty.append(icon("film"), el("span", "Nenhum Short encontrado ainda."))
    grid.replaceChildren(empty)
    return
  }
  const order = []
  shorts.forEach((s, i) => {
    let node = shortNodes.get(s.id)
    if (!node) {
      node = el("div", "", "short-card")
      node.style.animationDelay = `${Math.min(i, 12) * 40}ms`
      const thumb = el("div", "", "short-thumb")
      const img = document.createElement("img")
      img.src = s.thumbnail || `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`
      img.alt = s.title || s.id
      const rank = el("span", "", "short-rank")
      const views = el("span", "", "short-views")
      views.append(icon("eye"), el("span"))
      const delta = el("span", "", "short-delta")
      thumb.append(img, rank, views, delta)
      const info = el("div", "", "short-info")
      const title = extLink(s.title || s.id, s.url, "short-title")
      info.append(title, btn("Analisar roteiro", () => handlers.onAnalyze(s.id), "primary", "sparkles"))
      node.append(thumb, info)
      shortNodes.set(s.id, node)
      setTimeout(() => node.classList.add("seen"), 900 + i * 40)
    }
    $(".short-rank", node).textContent = `#${i + 1}`
    $(".short-views span:last-child", node).textContent = compact.format(s.views || 0)
    const delta = $(".short-delta", node)
    if (s.delta1h > 0) {
      delta.replaceChildren(el("span", `+${numFmt.format(s.delta1h)}${s.deltaPartial ? "" : " · 1h"}`, "chip up"))
    } else delta.replaceChildren()
    order.push(node)
  })
  grid.replaceChildren(...order)
}

export function ringMarkup(pct, centerText, small) {
  const r = 46, c = 2 * Math.PI * r
  return `<div class="ring"><svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="${r}"/><circle class="prog" cx="56" cy="56" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(1, pct))).toFixed(1)}"/></svg><div class="ring-center"><div><b>${centerText}</b><br><small>${small}</small></div></div></div>`
}

function renderGoal() {
  const box = $("#goal-progress")
  const subs = snap?.current?.subs ?? 0
  const pct = subs / TARGET_SUBS
  const missing = Math.max(0, TARGET_SUBS - subs)
  const wrap = el("div", "", "ring-row")
  wrap.innerHTML = ringMarkup(pct, `${Math.round(Math.min(1, pct) * 100)}%`, "da meta")
  const info = el("div", "", "ring-info")
  info.append(
    el("strong", `${numFmt.format(subs)} / ${numFmt.format(TARGET_SUBS)} inscritos`),
    el("span", missing ? `Faltam ${numFmt.format(missing)} inscritos para a entrada no YPP.` : "Meta de inscritos atingida!", "meta"),
  )
  wrap.append(info)
  box.replaceChildren(wrap)
}

/* ------------------------------ Hero, status e IA ------------------------------ */

function renderHero() {
  const ch = snap.channel
  if (ch?.avatar) {
    for (const [img, fb] of [["#channel-hero-avatar", "#hero-fallback"], ["#brand-avatar", "#brand-fallback"]]) {
      const i = $(img), f = $(fb)
      if (i && i.getAttribute("src") !== ch.avatar) i.src = ch.avatar
      if (i) i.hidden = false
      if (f) f.hidden = true
    }
  }
  if (ch?.title) $("#hero-title").textContent = ch.title
  if (ch?.handle) $("#hero-handle").textContent = ch.handle
}

function renderInsight() {
  const box = $("#channel-ai-pulse")
  const meta = $("#ai-pulse-meta")
  const ins = snap.insight
  if (insightBusy) {
    box.classList.add("loading")
    const sk = el("div", "", "skeleton-stack")
    sk.append(el("i"), el("i"), el("i"))
    box.replaceChildren(sk)
    meta.textContent = "O Direcionador está lendo os números ao vivo…"
    return
  }
  box.classList.remove("loading")
  if (!ins) {
    box.replaceChildren(el("p", "Ainda sem análise. Clique em “Análise IA” para gerar o diagnóstico com os números de agora.", "meta"))
    return
  }
  box.replaceChildren(renderMarkdown(ins.text))
  meta.textContent = `Gerada há ${timeAgo(Date.now() - ins.at)} por ${ins.model} · renova sozinha a cada 10 min`
}

export async function requestInsight(force = false) {
  if (insightBusy) return
  insightBusy = true
  renderInsight()
  const b = $("#btn-channel-ai")
  b.disabled = true
  try {
    const data = await apiJson("/api/painel/canal/live/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force, model: $("#global-model")?.value }),
    })
    if (snap) snap.insight = data.insight
    if (force) toast("Análise atualizada pela IA")
  } catch (error) {
    toast(error.message, "error")
  } finally {
    insightBusy = false
    b.disabled = false
    renderInsight()
  }
}

function tick() {
  const rail = $("#rail-live")
  const status = $("#channel-status")
  const bar = $("#live-bar")
  if (!snap) return
  const baseLastPoll = snap.lastPollAt || (snap.nextPollAt > 0 ? snap.nextPollAt - snap.pollMs : snap.now)
  const lastPoll = baseLastPoll + (localRecv - snap.now)
  const age = Math.max(0, Date.now() - lastPoll)
  const err = snap.lastError
  if (snap.current) {
    status.textContent = err
      ? `Sem resposta do YouTube agora (${err}). Mostrando a última leitura.`
      : `Atualizado há ${timeAgo(age)} · próxima leitura automática em ${Math.max(0, Math.ceil((snap.pollMs - age) / 1000))} s`
  }
  rail.classList.toggle("off", Boolean(err) || !es || es.readyState !== 1)
  $("#rail-live-text").textContent = err
    ? "YouTube indisponível"
    : snap.current
      ? `Ao vivo · ${numFmt.format(snap.current.subs ?? 0)} inscritos`
      : "Coletando dados…"
  bar.style.width = `${Math.min(100, Math.max(0, (age / snap.pollMs) * 100))}%`
  // renova a análise sozinha (no máximo 1 tentativa por minuto)
  const ins = snap.insight
  const stale = !ins || Date.now() - ins.at > 10 * 60_000
  if (snap.current && stale && !insightBusy && Date.now() - lastInsightTry > 60_000) {
    if (!document.hidden && !$("#canal").hidden) {
      lastInsightTry = Date.now()
      requestInsight(false)
    }
  }
  if (!insightBusy && ins) {
    $("#ai-pulse-meta").textContent = `Gerada há ${timeAgo(Date.now() - ins.at)} por ${ins.model} · renova sozinha a cada 10 min`
  }
}

function apply(next) {
  const prev = snap?.current || null
  snap = next
  localRecv = Date.now()
  renderHero()
  renderKpis(prev)
  renderChart()
  renderFeed()
  renderShorts()
  renderGoal()
  if (!insightBusy) renderInsight()
  tick()
  window.dispatchEvent(new CustomEvent("live:snapshot", { detail: next }))
}

export const applySnapshot = apply

function connect() {
  try {
    es = new EventSource("/api/painel/canal/stream")
    es.addEventListener("snapshot", (event) => {
      try { apply(JSON.parse(event.data)) } catch {}
    })
  } catch {
    es = null
  }
}

export function initLive(h) {
  handlers = { ...handlers, ...h }
  installGradients()
  buildKpis()
  renderKpisEmpty()
  $("#btn-channel").addEventListener("click", async () => {
    const b = $("#btn-channel")
    b.disabled = true
    b.classList.add("is-busy")
    try {
      apply(await apiJson("/api/painel/canal/live/atualizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
      toast("Dados atualizados agora")
    } catch (error) {
      toast(error.message, "error")
    } finally {
      b.disabled = false
    }
  })
  $("#btn-channel-ai").addEventListener("click", () => requestInsight(true))
  $("#btn-chat-about").addEventListener("click", () => handlers.onChatAbout(snap))
  $("#chart-metric").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]")
    if (!b) return
    metric = b.dataset.m
    $$("#chart-metric button").forEach((x) => x.classList.toggle("active", x === b))
    if (snap) renderChart()
  })
  $("#chart-range").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]")
    if (!b) return
    range = b.dataset.r
    $$("#chart-range button").forEach((x) => x.classList.toggle("active", x === b))
    if (snap) renderChart()
  })
  apiJson("/api/painel/canal/live")
    .then((s) => {
      if (!snap) apply(s)
      if (s?.sse !== false) connect()
    })
    .catch(() => connect())
  setInterval(tick, 1000)
  // se o SSE não estiver ativo (ex.: Vercel), busca por polling a cada 30s
  setInterval(async () => {
    if (es && es.readyState === 1) return
    try { apply(await apiJson("/api/painel/canal/live")) } catch {}
  }, 30_000)
}

function renderKpisEmpty() {
  for (const k of KPIS) {
    const foot = $(`.kpi[data-key="${k.key}"] .kpi-foot`)
    foot?.replaceChildren(el("span", "conectando…", "chip gold"))
  }
}
