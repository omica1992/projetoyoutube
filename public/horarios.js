import { $, el, apiJson, toast, numFmt, renderMarkdown } from "./ui.js"
import { primaryChannelId } from "./chat-channel.js"
import { getActiveChannelProfile } from "./workspace.js"

const body = $("#horarios-body")
let loaded = false
let loading = false

function heat(avg, max) {
  if (avg == null) return "background:rgba(255,255,255,.04);color:#7d8a85"
  const a = Math.max(0.15, Math.min(1, avg / (max || 1)))
  return `background:rgba(241,196,83,${(a * 0.75).toFixed(2)});color:${a > 0.55 ? "#1a1405" : "#e8efe9"}`
}

function table(headers, rows, minWidth = 340) {
  const wrap = el("div", "", "table-scroll")
  const t = el("table")
  t.style.cssText = `width:100%;min-width:${minWidth}px;border-collapse:separate;border-spacing:4px;font-size:13px;text-align:center`
  const thead = el("tr")
  for (const h of headers) {
    const th = el("th", h)
    th.style.cssText = "font-weight:600;color:#9fb0a8;padding:4px 2px"
    thead.append(th)
  }
  t.append(thead)
  for (const r of rows) t.append(r)
  wrap.append(t)
  return wrap
}

function section(title, ...nodes) {
  const box = el("div")
  const h = el("h3", title)
  h.style.cssText = "margin:8px 0 6px;font-size:15px"
  box.append(h, ...nodes)
  return box
}

function renderOwn(own) {
  if (!own.sampleSize) return section("Nosso canal", el("p", "Sem Shorts com horário e views para analisar.", "meta"))
  const max = Math.max(...own.grid.flatMap((d) => d.periods.map((p) => p.avg ?? 0)), 1)
  const rows = own.grid.map((d) => {
    const tr = el("tr")
    const th = el("td", d.label)
    th.style.cssText = "text-align:left;color:#9fb0a8;padding-right:6px"
    tr.append(th)
    for (const p of d.periods) {
      const td = el("td", p.n ? `${numFmt.format(p.avg)} (${p.n})` : "–")
      td.style.cssText = `${heat(p.avg, max)};border-radius:8px;padding:8px 4px;${p.n && p.n < 2 ? "opacity:.7" : ""}`
      td.title = p.n ? `${p.n} Short(s), média ${p.avg} views` : "Sem vídeos"
      tr.append(td)
    }
    return tr
  })
  const legend = el("p", `Células: média de views (nº de Shorts). Amostra total: ${own.sampleSize} Shorts. Poucos vídeos por célula = indicação fraca.`, "meta")
  return section("Nosso canal — dia × período", table(["", "Madrugada", "Manhã", "Tarde", "Noite"], rows), legend)
}

function renderMarket(market) {
  if (!market.sampleSize) return section("Mercado", el("p", "Nenhum vídeo recente encontrado na busca agora.", "meta"))
  const max = Math.max(...market.byHour.map((h) => h.velocity ?? 0), 1)
  const row = (from) => {
    const tr = el("tr")
    for (let h = from; h < from + 12; h++) {
      const c = market.byHour[h]
      const td = el("td", c.n ? `${String(h).padStart(2, "0")}h\n${numFmt.format(c.velocity)}` : `${String(h).padStart(2, "0")}h\n–`)
      td.style.cssText = `${heat(c.velocity, max)};border-radius:8px;padding:6px 2px;white-space:pre-line;font-size:12px`
      td.title = c.n ? `${c.n} vídeo(s), ~${c.velocity} views/hora` : "Sem vídeos"
      tr.append(td)
    }
    return tr
  }
  const wrap = el("div", "", "table-scroll")
  const t = el("table")
  t.style.cssText = "width:100%;min-width:520px;border-collapse:separate;border-spacing:3px;text-align:center"
  t.append(row(0), row(12))
  wrap.append(t)
  const legend = el("p", `Velocidade = views por hora desde a publicação, por hora de postagem. Amostra: ${market.sampleSize} Shorts de até 4 dias.`, "meta")
  return section("Mercado — hora de postagem × views/hora", wrap, legend)
}

function render(data) {
  body.replaceChildren()
  const verdict = el("div")
  verdict.style.cssText = "padding:12px 14px;border:1px solid rgba(241,196,83,.35);border-radius:12px;background:rgba(241,196,83,.07)"
  for (const line of data.verdict) verdict.append(el("p", line))
  body.append(section("Conclusão", verdict), renderOwn(data.own), renderMarket(data.market))
  if (data.ai?.text) {
    const ai = el("div")
    ai.append(renderMarkdown(data.ai.text))
    body.append(section(`Recomendação da IA (${data.ai.model})`, ai))
  } else if (data.ai?.error) {
    body.append(section("Recomendação da IA", el("p", `Não foi possível gerar agora: ${data.ai.error}`, "meta")))
  }
}

async function load(ai = false) {
  if (loading) return
  if ((getActiveChannelProfile()?.id || primaryChannelId) !== primaryChannelId) {
    body.replaceChildren(el("p", "Sem dados de horários publicados para este canal ainda.", "meta"))
    loaded = true
    return
  }
  loading = true
  body.replaceChildren(el("p", ai ? "Analisando horários e consultando a IA…" : "Analisando horários…", "meta"))
  try {
    render(await apiJson(`/api/painel/horarios${ai ? "?ai=1" : ""}`))
    loaded = true
  } catch (error) {
    body.replaceChildren(el("p", `Erro ao carregar: ${error.message}`, "meta"))
    toast(error.message, "error")
  } finally {
    loading = false
  }
}

window.addEventListener("studio:active-channel", () => {
  loaded = false
  body?.replaceChildren()
  if (document.body.dataset.workspace === "estrategia" && !$("#horarios-card")?.closest("[hidden]")) load(false)
})

$("#btn-horarios")?.addEventListener("click", () => load(false))
$("#btn-horarios-ai")?.addEventListener("click", () => load(true))
window.addEventListener("subtab:change", (e) => {
  if (e.detail?.target === "est-horarios" && !loaded) load(false)
})
window.addEventListener("workspace:change", (e) => {
  if (e.detail?.id === "estrategia" && !loaded && !$("#horarios-card")?.closest("[hidden]")) load(false)
})
if (window.location.hash === "#estrategia") load(false)