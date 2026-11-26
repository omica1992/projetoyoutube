import { $, el, apiJson, toast, numFmt, extLink, renderMarkdown } from "./ui.js"

const modelVal = () => $("#global-model")?.value || ""

/* ==================== 1. RADAR DE CONCORRENTES (#pesquisa) ==================== */
let radarLoaded = false

async function loadRadar(fetchVideos = true) {
  const box = $("#radar-lista")
  const chips = $("#radar-canais")
  if (!box || !chips) return
  if (fetchVideos) box.replaceChildren(el("p", "Consultando Shorts recentes dos concorrentes…", "meta"))
  try {
    const data = await apiJson(`/api/painel/concorrentes${fetchVideos ? "?radar=1" : ""}`)
    chips.replaceChildren(
      ...(data.concorrentes || []).map((c) => {
        const tag = el("span", `${c.title || c.handle || c.id} `)
        tag.style.cssText = "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.06);font-size:12px"
        const rm = el("button", "×")
        rm.type = "button"
        rm.style.cssText = "background:none;border:0;color:#e8efe9;cursor:pointer;font-size:14px;padding:0 2px"
        rm.title = "Remover canal"
        rm.onclick = async () => {
          await apiJson(`/api/painel/concorrentes/${encodeURIComponent(c.id)}`, { method: "DELETE" })
          loadRadar(true)
        }
        tag.append(rm)
        return tag
      }),
    )
    if (fetchVideos) {
      const list = data.radar || []
      if (!list.length) {
        box.replaceChildren(el("p", "Nenhum Short recente encontrado nos canais monitorados.", "meta"))
      } else {
        box.replaceChildren(
          ...list.map((v) => {
            const row = el("div", "", "strategy-item")
            row.style.cssText = "padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"
            const left = el("div")
            left.append(
              extLink(v.title || v.id, v.url),
              el("p", `${v.channelTitle} · ${v.views != null ? numFmt.format(v.views) + " views" : "–"} · ${v.hoursAgo ?? "?"}h atrás`, "meta"),
            )
            const vel = el("span", v.velocity != null ? `${numFmt.format(v.velocity)} views/h` : "–", "chip up")
            row.append(left, vel)
            return row
          }),
        )
      }
      radarLoaded = true
    }
  } catch (e) {
    box.replaceChildren(el("p", `Erro no radar: ${e.message}`, "meta"))
  }
}

$("#btn-radar-atualizar")?.addEventListener("click", () => loadRadar(true))
$("#radar-add-form")?.addEventListener("submit", async (e) => {
  e.preventDefault()
  const inp = $("#radar-canal-input")
  const canal = inp?.value.trim()
  if (!canal) return
  try {
    await apiJson("/api/painel/concorrentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canal }),
    })
    inp.value = ""
    toast("Canal adicionado ao radar")
    loadRadar(true)
  } catch (err) {
    toast(err.message, "error")
  }
})

/* ==================== 2. TESTADOR DE TÍTULOS (#producao) ==================== */
$("#btn-testar-titulo")?.addEventListener("click", async () => {
  const titulo = $("#test-titulo-input")?.value.trim() || ""
  const gancho = $("#test-gancho-input")?.value.trim() || ""
  const out = $("#test-titulo-out")
  if (!titulo && !gancho) return toast("Informe um título ou gancho", "error")
  out.replaceChildren(el("p", "Avaliando com IA…", "meta"))
  try {
    const res = await apiJson("/api/painel/titulo/testar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, gancho, model: modelVal() }),
    })
    out.replaceChildren()
    if (res.nota != null || res.diagnostico) {
      out.append(el("p", `${res.nota != null ? `Nota ${res.nota}/10 · ` : ""}${res.diagnostico || ""}`))
    }
    for (const v of res.variacoes || []) {
      const card = el("div")
      card.style.cssText = "padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px"
      card.append(el("strong", v.titulo || ""), el("p", `Gancho: ${v.gancho || "–"}`, "meta"), el("p", v.motivo || "", "meta"))
      out.append(card)
    }
  } catch (err) {
    out.replaceChildren(el("p", `Erro: ${err.message}`, "meta"))
  }
})

/* ==================== 3. PACOTE DE EDIÇÃO (.srt + Cenas) ==================== */
function downloadText(filename, content) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

$("#btn-gerar-pacote")?.addEventListener("click", async () => {
  const titulo = $("#pauta")?.value?.trim() || $("#script-promessa")?.value?.trim() || "Short"
  const texto = $("#script-text")?.value?.trim() || ""
  const out = $("#pacote-out")
  if (!texto) return toast("Escreva ou gere um roteiro no editor acima primeiro", "error")
  out.replaceChildren(el("p", "Gerando legenda .srt e cenas…", "meta"))
  try {
    const res = await apiJson("/api/painel/roteiro/pacote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, texto, model: modelVal() }),
    })
    out.replaceChildren()
    const dl = el("button", "Baixar legenda (.srt)", "primary")
    dl.type = "button"
    dl.onclick = () => downloadText(`${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "short"}.srt`, res.srt)
    out.append(dl)
    for (const c of res.cenas || []) {
      const item = el("div")
      item.style.cssText = "padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px"
      item.append(
        el("strong", `${c.tempo || ""} · ${c.fala || ""}`),
        el("p", `Visual: ${c.visual || "–"}`, "meta"),
        el("p", `Prompt: ${c.prompt_imagem || "–"}`, "meta"),
      )
      out.append(item)
    }
  } catch (err) {
    out.replaceChildren(el("p", `Erro: ${err.message}`, "meta"))
  }
})

/* ==================== 4. VÍNCULO ROTEIRO ↔ PUBLICADO (#producao) ==================== */
async function loadPublishList() {
  const sel = $("#pub-roteiro-select")
  const list = $("#pub-roteiros-lista")
  if (!sel || !list) return
  try {
    const ac = await apiJson("/api/painel/acervo")
    const roteiros = ac.roteiros || []
    sel.replaceChildren(el("option", "Selecione um roteiro salvo…"), ...roteiros.map((r) => {
      const o = el("option", r.titulo || r.title || r.id)
      o.value = r.id
      return o
    }))
    sel.firstChild.value = ""
    const pubs = roteiros.filter((r) => r.publishedId)
    list.replaceChildren(
      ...(pubs.length
        ? pubs.map((r) => {
            const d = el("div")
            d.style.cssText = "padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"
            d.append(
              extLink(r.titulo || r.publishedTitle || r.publishedId, r.publishedUrl),
              el("span", r.publishedViews != null ? `${numFmt.format(r.publishedViews)} views` : "Publicado", "chip up"),
            )
            return d
          })
        : [el("p", "Nenhum roteiro vinculado a Short publicado ainda.", "meta")]),
    )
  } catch {}
}

$("#btn-refresh-publicar")?.addEventListener("click", loadPublishList)
$("#btn-vincular-short")?.addEventListener("click", async () => {
  const id = $("#pub-roteiro-select")?.value
  const urlOrId = $("#pub-url-input")?.value.trim()
  if (!id || !urlOrId) return toast("Selecione o roteiro e cole a URL/ID do Short", "error")
  try {
    await apiJson(`/api/painel/roteiro/${encodeURIComponent(id)}/publicar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urlOrId }),
    })
    $("#pub-url-input").value = ""
    toast("Roteiro vinculado ao Short publicado!")
    loadPublishList()
  } catch (err) {
    toast(err.message, "error")
  }
})

/* ==================== 5. COMPARADOR TOP VS PIORES (#metas) ==================== */
let padroesLoaded = false
async function loadPadroes(ai = false) {
  const out = $("#padroes-out")
  if (!out) return
  out.replaceChildren(el("p", ai ? "Comparando Shorts e gerando regras com IA…" : "Comparando Top 5 vs. Piores 5…", "meta"))
  try {
    const res = await apiJson(`/api/painel/canal/padroes${ai ? "?ai=1" : ""}`)
    out.replaceChildren()
    const summary = el(
      "p",
      `Top ${res.topStats.count}: média ${numFmt.format(res.topStats.avgViews)} views (${res.topStats.emojiPct}% com emoji, ${res.topStats.questionPct}% pergunta) | Piores ${res.bottomStats.count}: média ${numFmt.format(res.bottomStats.avgViews)} views (${res.bottomStats.emojiPct}% emoji, ${res.bottomStats.questionPct}% pergunta).`,
    )
    out.append(summary)
    if (res.ai?.text) out.append(renderMarkdown(res.ai.text))
    padroesLoaded = true
  } catch (err) {
    out.replaceChildren(el("p", `Erro: ${err.message}`, "meta"))
  }
}

$("#btn-padroes")?.addEventListener("click", () => loadPadroes(false))
$("#btn-padroes-ai")?.addEventListener("click", () => loadPadroes(true))

/* ==================== 6. FUNIL COMPLETO (#estrategia) ==================== */
let funilLoaded = false

function readIdeasLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem("studio:fatonexo:planejamento") || "{}")
    return Array.isArray(raw.ideas) ? raw.ideas : []
  } catch {
    return []
  }
}

async function loadFunil() {
  const box = $("#funil-body")
  if (!box) return
  box.replaceChildren(el("p", "Carregando funil…", "meta"))
  try {
    const data = await apiJson("/api/painel/funil")
    const ideas = readIdeasLocal()
    const stages = [
      { label: "1. Pautas", count: ideas.length, sub: `${ideas.filter((i) => i.status === "Prioridade").length} prioridade(s)` },
      { label: "2. Roteiros", count: data.counts.roteiros, sub: "salvos no acervo" },
      { label: "3. Prontos p/ postar", count: data.counts.prontos, sub: "aguardando publicação" },
      { label: "4. Publicados", count: data.counts.shortsNoCanal, sub: `${data.counts.publicadosVinculados} vinculado(s)` },
    ]
    const grid = el("div")
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px"
    for (const st of stages) {
      const card = el("div")
      card.style.cssText = "padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.03)"
      const num = el("div", numFmt.format(st.count ?? 0))
      num.style.cssText = "font-size:24px;font-weight:700;color:#f1c453"
      card.append(el("div", st.label, "meta"), num, el("div", st.sub, "meta"))
      grid.append(card)
    }
    const actions = el("div")
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px"
    actions.append(
      extLink("Abrir YouTube Studio (Upload)", "https://studio.youtube.com/channel/UCClrO3uvc5-H6NPc6alEHDw/videos/upload"),
      el("span", `Fonte: ${data.source === "youtube-api-v3" ? "YouTube Data API v3 (oficial)" : "Leitura pública"} · Upload direto exige OAuth 2.0`, "meta"),
    )
    box.replaceChildren(grid, actions)
    if (data.prontos?.length) {
      const pTitle = el("p", `Prontos para publicar (${data.prontos.length}): ${data.prontos.slice(0, 4).map((p) => p.titulo).join(" · ")}`, "meta")
      box.append(pTitle)
    }
    funilLoaded = true
  } catch (err) {
    box.replaceChildren(el("p", `Erro no funil: ${err.message}`, "meta"))
  }
}

$("#btn-funil-refresh")?.addEventListener("click", loadFunil)

/* ==================== 7. COMENTÁRIOS DA API NO DRAWER DE VÍDEO ==================== */
$("#btn-video-comments")?.addEventListener("click", async () => {
  const urlVal = $("#analyze-url-form input[name='url']")?.value?.trim() || ""
  const box = $("#video-comments-box")
  if (!urlVal || !box) return toast("Abra ou informe um vídeo antes", "error")
  box.replaceChildren(el("p", "Buscando comentários na YouTube Data API v3…", "meta"))
  try {
    const res = await apiJson(`/api/painel/video/${encodeURIComponent(urlVal)}/comentarios`)
    if (!res.comments?.length) {
      box.replaceChildren(el("p", "Nenhum comentário público neste vídeo.", "meta"))
      return
    }
    box.replaceChildren(
      ...res.comments.slice(0, 10).map((c) => {
        const d = el("div")
        d.style.cssText = "padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px"
        d.append(el("strong", `${c.author} · ${c.likes} 👍`, "meta"), el("p", c.text))
        return d
      }),
    )
  } catch (err) {
    box.replaceChildren(el("p", err.message, "meta"))
  }
})

/* ==================== 8. OAUTH 2.0, ANALYTICS REAL & UPLOAD ==================== */
let oauthLoaded = false
let analyticsLoaded = false

// Exibe retorno do redirecionamento OAuth do Google (?oauth=ok | ?oauth=erro)
try {
  const qs = new URLSearchParams(window.location.search)
  const oauthParam = qs.get("oauth")
  if (oauthParam) {
    if (oauthParam === "ok") toast("Conta do YouTube conectada com sucesso!")
    else toast(qs.get("msg") || "Não foi possível concluir o login do YouTube.", "error")
    qs.delete("oauth")
    qs.delete("msg")
    const clean = `${window.location.pathname}${qs.toString() ? `?${qs}` : ""}${window.location.hash}`
    history.replaceState(null, "", clean)
  }
} catch {}

async function loadOAuthCard() {
  const badge = $("#oauth-conn-badge")
  const btnConn = $("#btn-oauth-connect")
  const btnDisc = $("#btn-oauth-disconnect")
  const st = $("#oauth-status")
  if (!st) return
  try {
    const res = await apiJson("/api/youtube/oauth/status")
    if (badge) badge.hidden = !res.connected
    if (btnDisc) btnDisc.hidden = !res.connected
    if (btnConn) btnConn.textContent = res.connected ? "Reconectar conta" : "Conectar conta do YouTube"
    st.textContent = res.connected
      ? "Conta conectada: upload de Shorts e YouTube Analytics liberados."
      : res.configured
        ? "Credenciais OAuth prontas. Clique acima para autorizar seu canal no Google."
        : "Credenciais OAuth não configuradas no servidor."
    oauthLoaded = true
  } catch (e) {
    st.textContent = e.message
  }
}

$("#btn-oauth-disconnect")?.addEventListener("click", async () => {
  await apiJson("/api/youtube/oauth/disconnect", { method: "POST" })
  toast("Conta YouTube desconectada")
  loadOAuthCard()
})

async function loadAnalytics() {
  const out = $("#analytics-out")
  if (!out) return
  out.replaceChildren(el("p", "Consultando YouTube Analytics API (28 dias)…", "meta"))
  try {
    const res = await apiJson("/api/painel/youtube/analytics")
    const s = res.summary
    out.replaceChildren(
      el(
        "p",
        `Últimos 28 dias (${res.period.startDate} a ${res.period.endDate}): ${numFmt.format(s.views)} views · ${numFmt.format(s.estimatedMinutesWatched)} min assistidos · retenção média ${s.averageViewPercentage.toFixed(1)}% (${Math.round(s.averageViewDuration)}s) · +${s.subscribersGained} inscritos.`,
      ),
      ...res.topVideos.slice(0, 8).map((v) => {
        const d = el("div")
        d.style.cssText = "padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"
        d.append(
          extLink(v.title || v.videoId, `https://www.youtube.com/shorts/${v.videoId}`),
          el("span", `${numFmt.format(v.views)} views · ${v.averageViewPercentage.toFixed(1)}% retenção · +${v.subscribersGained} insc.`, "chip up"),
        )
        return d
      }),
    )
    analyticsLoaded = true
  } catch (e) {
    out.replaceChildren(el("p", e.message, "meta"))
  }
}

$("#btn-analytics")?.addEventListener("click", loadAnalytics)

$("#up-video-file")?.addEventListener("change", (e) => {
  const f = e.currentTarget.files?.[0]
  const lbl = $("#up-video-name")
  if (lbl) lbl.textContent = f ? `${f.name} (${(f.size / 1048576).toFixed(1)} MB)` : "Escolher vídeo (.mp4 / .mov)"
})

$("#upload-youtube-form")?.addEventListener("submit", async (e) => {
  e.preventDefault()
  const status = $("#up-youtube-status")
  const btn = $("#btn-up-youtube")
  const file = $("#up-video-file")?.files?.[0]
  if (!file) return toast("Escolha um vídeo para enviar", "error")
  const fd = new FormData(e.currentTarget)
  const roteiroId = $("#pub-roteiro-select")?.value
  if (roteiroId) fd.append("roteiroId", roteiroId)
  btn.disabled = true
  status.textContent = "Enviando vídeo para o YouTube…"
  try {
    const r = await fetch("/api/painel/youtube/upload", { method: "POST", body: fd })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    status.replaceChildren(
      document.createTextNode(`Publicado (${data.uploaded.privacyStatus}): `),
      extLink(data.uploaded.title, data.uploaded.url),
    )
    toast("Short enviado para o YouTube!")
    e.currentTarget.reset()
    const lbl = $("#up-video-name")
    if (lbl) lbl.textContent = "Escolher vídeo (.mp4 / .mov)"
    loadPublishList()
  } catch (err) {
    status.textContent = `Erro: ${err.message}`
    toast(err.message, "error")
  } finally {
    btn.disabled = false
  }
})

/* ==================== 9. AGENDA DE AÇÕES (#estrategia) ==================== */
let agendaLoaded = false

async function loadAgenda() {
  const box = $("#agenda-list")
  if (!box) return
  try {
    const res = await apiJson("/api/painel/agenda")
    const list = res.agenda || []
    if (!list.length) {
      box.replaceChildren(el("p", "Nenhuma ação agendada. Crie acima ou peça no Chat IA!", "meta"))
      agendaLoaded = true
      return
    }
    box.replaceChildren(
      ...list.map((a) => {
        const d = el("div")
        d.style.cssText = `padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;${a.status === "concluido" ? "opacity:.6" : ""}`
        const left = el("div")
        left.append(
          el("strong", `[${a.tipo}] ${a.titulo}`),
          el("p", `${a.quando || "Sem data"} · origem: ${a.origem}${a.detalhes ? ` · ${a.detalhes}` : ""}`, "meta"),
        )
        const right = el("div")
        right.style.cssText = "display:flex;gap:6px"
        const doneBtn = el("button", a.status === "concluido" ? "Reabrir" : "Concluir", "ghost")
        doneBtn.type = "button"
        doneBtn.onclick = async () => {
          await apiJson(`/api/painel/agenda/${encodeURIComponent(a.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: a.status === "concluido" ? "pendente" : "concluido" }),
          })
          loadAgenda()
        }
        const delBtn = el("button", "Excluir", "ghost")
        delBtn.type = "button"
        delBtn.onclick = async () => {
          await apiJson(`/api/painel/agenda/${encodeURIComponent(a.id)}`, { method: "DELETE" })
          loadAgenda()
        }
        right.append(doneBtn, delBtn)
        d.append(left, right)
        return d
      }),
    )
    agendaLoaded = true
  } catch (e) {
    box.replaceChildren(el("p", e.message, "meta"))
  }
}

$("#btn-agenda-refresh")?.addEventListener("click", loadAgenda)
$("#agenda-form")?.addEventListener("submit", async (e) => {
  e.preventDefault()
  const titulo = $("#ag-titulo")?.value.trim()
  if (!titulo) return
  await apiJson("/api/painel/agenda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo,
      tipo: $("#ag-tipo")?.value || "postar",
      quando: $("#ag-quando")?.value || "",
    }),
  })
  e.currentTarget.reset()
  toast("Ação agendada!")
  loadAgenda()
})

/* ==================== SUB-ABAS & MENU MOBILE ==================== */
for (const bar of document.querySelectorAll("[data-subtabs]")) {
  const group = bar.getAttribute("data-subtabs")
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-subtarget]")
    if (!b) return
    const target = b.getAttribute("data-subtarget")
    for (const x of bar.querySelectorAll("button[data-subtarget]")) x.classList.toggle("active", x === b)
    for (const p of document.querySelectorAll(`[data-subgroup="${group}"]`)) {
      p.hidden = p.getAttribute("data-subpanel") !== target
    }
    if (target === "pesq-radar" && !radarLoaded) loadRadar(true)
    if (target === "prod-publicar") {
      loadPublishList()
      const tInp = $("#up-title")
      const pVal = $("#pauta")?.value?.trim()
      if (tInp && !tInp.value && pVal) tInp.value = pVal
    }
    if (target === "est-agenda" && !agendaLoaded) loadAgenda()
    if (target === "metas-retencao" && !analyticsLoaded) loadAnalytics()
    if (target === "metas-padroes" && !padroesLoaded) loadPadroes(false)
    window.dispatchEvent(new CustomEvent("subtab:change", { detail: { group, target } }))
  })
}

const rail = $("#rail")
$("#btn-mobile-nav")?.addEventListener("click", () => {
  rail?.classList.toggle("mobile-open")
})
rail?.addEventListener("click", (e) => {
  if (e.target.closest("a")) rail.classList.remove("mobile-open")
})

/* ==================== AUTO-LOAD POR ABA ==================== */
function onWorkspace(id) {
  rail?.classList.remove("mobile-open")
  if (id === "pesquisa" && !radarLoaded && !$("#radar-concorrentes-card")?.closest("[hidden]")) loadRadar(true)
  if (id === "producao") loadPublishList()
  if (id === "estrategia") {
    if (!funilLoaded) loadFunil()
    if (!agendaLoaded && !$("#agenda-card")?.closest("[hidden]")) loadAgenda()
  }
  if (id === "metas") {
    if (!padroesLoaded && !$("#padroes-card")?.closest("[hidden]")) loadPadroes(false)
    if (!analyticsLoaded && !$("#analytics-card")?.closest("[hidden]")) loadAnalytics()
  }
  if (id === "integracoes" && !oauthLoaded) loadOAuthCard()
}
window.addEventListener("workspace:change", (e) => onWorkspace(e.detail?.id))
const initialProductionTab = { "#pacote": "prod-pacote", "#publicacao": "prod-publicar" }[location.hash]
if (initialProductionTab) document.querySelector(`[data-subtarget="${initialProductionTab}"]:not(.active)`)?.click()
loadOAuthCard()
onWorkspace(window.location.hash.slice(1) || "canal")
