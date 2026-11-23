const $ = (sel) => document.querySelector(sel)
const els = {
  nicho: $("#nicho"),
  tom: $("#tom"),
  duracao: $("#duracao"),
  geo: $("#geo"),
  canal: $("#canal"),
  extra: $("#extra"),
  btnRoteiro: $("#btn-roteiro"),
  roteiroBox: $("#roteiro-box"),
  roteiroTitulo: $("#roteiro-titulo"),
  roteiroMeta: $("#roteiro-meta"),
  roteiroTexto: $("#roteiro-texto"),
  roteiroCenas: $("#roteiro-cenas"),
  cardAudio: $("#card-audio"),
  cardHtml: $("#card-html"),
  cardRender: $("#card-render"),
  drop: $("#drop"),
  file: $("#file"),
  fileName: $("#file-name"),
  btnAudio: $("#btn-audio"),
  chunks: $("#chunks"),
  htmlFonte: $("#html-fonte"),
  preview: $("#preview"),
  phone: $("#phone"),
  btnRender: $("#btn-render"),
  renderOut: $("#render-out"),
  video: $("#video"),
  btnBaixar: $("#btn-baixar"),
  btnPasta: $("#btn-pasta"),
  jobStep: $("#job-step"),
  job: $("#job"),
  jobPct: $("#job-pct"),
  jobBar: $("#job-bar"),
  jobLog: $("#job-log"),
  spinner: $("#spinner"),
  steps: document.querySelectorAll(".step"),
}

let state = {
  project: null,
  file: null,
  roteiroTexto: "",
}

const FONTE_LABEL = { ia: "HTML por IA", "ia-design": "design por IA", motor: "motor próprio" }

/* ------------------------------- utilidades ------------------------------- */

async function api(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text }
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function setStep(n, done) {
  els.steps.forEach((s) => {
    const idx = Number(s.dataset.step)
    s.classList.toggle("active", idx === n)
    s.classList.toggle("done", idx < n || (idx === n && done))
  })
}

function renderJob(job) {
  els.job.hidden = false
  els.jobStep.textContent = job.step || job.status
  els.jobPct.textContent = `${job.pct ?? 0}%`
  els.jobBar.style.width = `${job.pct ?? 0}%`
  els.spinner.classList.toggle("hidden", job.status !== "running" && job.status !== "queued")
  els.jobLog.textContent = (job.log || []).join("\n")
  els.jobLog.scrollTop = els.jobLog.scrollHeight
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitJob(jobId) {
  while (true) {
    const job = await api(`/api/jobs/${jobId}`)
    renderJob(job)
    if (job.status === "done") return job
    if (job.status === "error") throw new Error(job.error || "Falha na tarefa")
    await sleep(900 + Math.random() * 500)
  }
}

function fmtTime(s) {
  return `${Number(s).toFixed(1)}s`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
}

/* --------------------------------- etapa 1 -------------------------------- */

els.btnRoteiro.addEventListener("click", async () => {
  const nicho = els.nicho.value.trim()
  if (!nicho) return alert("Informe o nicho")

  els.btnRoteiro.disabled = true
  els.btnRoteiro.textContent = "Pesquisando tendências..."
  setStep(1)
  try {
    const { jobId } = await api("/api/roteiro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nicho,
        tom: els.tom.value,
        duracao: Number(els.duracao.value) || 50,
        geo: els.geo.value,
        canal: els.canal.value.trim(),
        modeloHtml: $("#modeloHtml").value,
        pauta: $("#pauta").value.trim(),
        extra: [$("#brief-pauta").value.trim(), els.extra.value.trim()].filter(Boolean).join("\n\n"),
      }),
    })
    const job = await waitJob(jobId)
    const project = job.result.project
    state.project = project
    state.roteiroTexto = project.roteiro?.roteiro || ""
    mostrarRoteiro(project)
    localStorage.setItem("studio:projeto", project.id)
    els.cardAudio.classList.remove("disabled")
    setStep(2)
  } catch (e) {
    els.job.hidden = false
    els.jobStep.textContent = "erro"
    els.jobLog.textContent += `\n${e.message}`
    alert(e.message)
  } finally {
    els.btnRoteiro.disabled = false
    els.btnRoteiro.textContent = "Pesquisar tendências e criar roteiro"
  }
})

function mostrarRoteiro(project) {
  const r = project.roteiro || {}
  els.roteiroTitulo.textContent = r.titulo || "(sem título)"
  const palavras = (r.roteiro || "").split(/\s+/).filter(Boolean).length
  const seg = Math.round(palavras / 2.6)
  els.roteiroMeta.textContent = `${project.nicho} · ${palavras} palavras · ~${seg}s de fala${r.tendencia_base ? ` · base: ${r.tendencia_base}` : ""}`
  els.roteiroTexto.textContent = r.roteiro || ""
  const retention = [
    ["Promessa", r.retencao?.promessa],
    ["Contexto", r.retencao?.contexto],
    ["Entrega", r.retencao?.entrega],
    ["Verificar antes de publicar", Array.isArray(r.pontos_a_checar) ? r.pontos_a_checar.filter(Boolean).join(" · ") : ""],
  ].filter(([, text]) => text)
  $("#roteiro-retencao").replaceChildren(...retention.map(([label, text]) => {
    const row = document.createElement("div")
    row.className = "cena-mini"
    const heading = document.createElement("b")
    heading.textContent = label
    row.append(heading, document.createTextNode(` — ${text}`))
    return row
  }))
  els.roteiroBox.classList.remove("hidden")

  const cenas = (r.cenas || []).map(
    (c) => `<div class="cena-mini"><b>${escapeHtml(c.intencao || "cena")} · ${escapeHtml(c.duracao || "?")}s</b><br>${escapeHtml(c.texto || "")}</div>`,
  )
  const tags = (r.hashtags || []).join(" ")
  els.roteiroCenas.innerHTML =
    cenas.join("") + (tags ? `<div class="cena-mini"><b>hashtags</b><br>${escapeHtml(tags)}</div>` : "")
}

$("#btn-copiar").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.roteiroTexto).catch(() => {})
  $("#btn-copiar").textContent = "copiado!"
  setTimeout(() => ($("#btn-copiar").textContent = "copiar"), 1500)
})

$("#btn-txt").addEventListener("click", () => {
  if (!state.project) return
  const r = state.project.roteiro || {}
  const txt = `${r.titulo}\n\n${r.roteiro}\n\n${(r.hashtags || []).join(" ")}\n\n${r.descricao_youtube || ""}`
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${(r.titulo || "roteiro").replace(/[^\w\-]+/g, "-").toLowerCase()}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
})

/* --------------------------------- etapa 2 -------------------------------- */

els.drop.addEventListener("click", () => els.file.click())
els.drop.addEventListener("dragover", (e) => {
  e.preventDefault()
  els.drop.classList.add("over")
})
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"))
els.drop.addEventListener("drop", (e) => {
  e.preventDefault()
  els.drop.classList.remove("over")
  if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0])
})
els.file.addEventListener("change", () => {
  if (els.file.files?.[0]) setFile(els.file.files[0])
})

function setFile(file) {
  state.file = file
  els.fileName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
  els.btnAudio.disabled = !state.project
  if (!state.project) alert("Crie o roteiro primeiro (etapa 1).")
}

els.btnAudio.addEventListener("click", async () => {
  if (!state.file) return alert("Escolha um áudio")
  if (!state.project) return alert("Crie o roteiro primeiro")

  els.btnAudio.disabled = true
  els.btnAudio.textContent = "Analisando áudio..."
  try {
    const form = new FormData()
    form.append("audio", state.file)
    const { jobId } = await api(`/api/projetos/${state.project.id}/audio`, { method: "POST", body: form })
    setStep(2)
    const job = await waitJob(jobId)
    state.project = job.result.project
    mostrarChunks(state.project)
    mostrarPreview(state.project)
    els.cardHtml.classList.remove("disabled")
    els.cardRender.classList.remove("disabled")
    els.cardHtml.classList.add("done")
    mostrarFonte(state.project)
    setStep(3, true)
  } catch (e) {
    alert(e.message)
  } finally {
    els.btnAudio.disabled = false
    els.btnAudio.textContent = "Analisar áudio e gerar animação"
  }
})

function mostrarFonte(project) {
  els.htmlFonte.textContent = FONTE_LABEL[project.htmlFonte] ?? "—"
}

function mostrarChunks(project) {
  const chunks = project.chunks || []
  els.chunks.innerHTML = chunks
    .map((c) => `<div class="chunk"><time>${fmtTime(c.start)} → ${fmtTime(c.end)}</time><span>${escapeHtml(c.text)}</span></div>`)
    .join("")
}

function mostrarPreview(project) {
  if (!project.videoHtmlUrl) return
  els.phone.hidden = false
  els.preview.src = `/p/${project.id}/video.html?v=${Date.now()}`
}

/* --------------------------------- etapa 3 -------------------------------- */

async function regerarHtml(modo) {
  if (!state.project) return
  const btn = modo === "ia" ? $("#btn-html-ia") : $("#btn-html-motor")
  btn.disabled = true
  try {
    const { jobId } = await api(`/api/projetos/${state.project.id}/html`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modo }),
    })
    const job = await waitJob(jobId)
    state.project = job.result.project
    mostrarFonte(state.project)
    mostrarPreview(state.project)
    setStep(3)
  } catch (e) {
    alert(e.message)
  } finally {
    btn.disabled = false
  }
}
$("#btn-html-ia").addEventListener("click", () => regerarHtml("ia"))
$("#btn-html-motor").addEventListener("click", () => regerarHtml("motor"))

/* --------------------------------- etapa 4 -------------------------------- */

els.btnRender.addEventListener("click", async () => {
  if (!state.project) return
  els.btnRender.disabled = true
  els.btnRender.textContent = "Renderizando..."
  setStep(4)
  try {
    const { jobId } = await api(`/api/projetos/${state.project.id}/render`, { method: "POST" })
    const job = await waitJob(jobId)
    state.project = job.result.project
    const url = `/p/${state.project.id}/video.mp4?v=${Date.now()}`
    els.video.src = url
    els.renderOut.classList.remove("hidden")
    els.btnBaixar.href = url
    els.btnBaixar.download = `${state.project.titulo || "short"}.mp4`
    els.btnPasta.href = url
    setStep(4, true)
  } catch (e) {
    alert(e.message)
  } finally {
    els.btnRender.disabled = false
    els.btnRender.textContent = "Gerar MP4 para o YouTube"
  }
})

/* ---------------------------------- boot ---------------------------------- */

;(async function boot() {
  try {
    const health = await api("/api/health")
    $("#m-roteiro").textContent = health.modelos.roteiro
    $("#m-html").textContent = health.modelos.html
  } catch {}

  const saved = localStorage.getItem("studio:projeto")
  if (!saved) return
  try {
    const project = await api(`/api/projetos/${saved}`)
    state.project = project
    state.roteiroTexto = project.roteiro?.roteiro || ""
    mostrarRoteiro(project)
    els.cardAudio.classList.remove("disabled")
    if (project.chunks) {
      mostrarChunks(project)
      mostrarFonte(project)
      mostrarPreview(project)
      setStep(project.videoHtmlUrl ? 4 : 2)
    } else {
      setStep(2)
    }
    if (project.videoHtmlUrl) {
      mostrarFonte(project)
      if (!project.chunks) mostrarPreview(project)
      els.cardHtml.classList.remove("disabled")
      els.cardRender.classList.remove("disabled")
    }
    if (project.mp4) {
      const url = `/p/${project.id}/video.mp4?v=${Date.now()}`
      els.video.src = url
      els.renderOut.classList.remove("hidden")
      els.btnBaixar.href = url
      els.btnPasta.href = url
      setStep(4, true)
    }
  } catch {}
})()
