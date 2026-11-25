const $ = (id) => document.getElementById(id)
const path = "/api/criar"
const fields = ["title", "script", "description", "voice"]
const selectionKey = "fora-do-nivel:projeto"
let project = null
let busy = false
let gemini = false
let channel = null
let youtubeChecked = false

async function api(url, body) {
  const response = await fetch(url, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Não foi possível completar a etapa.")
  return data
}

function status(message = "", { error = false, progress } = {}) {
  $("status-box").hidden = !message
  $("status-box").classList.toggle("error", error)
  $("status").textContent = message
  $("progress").hidden = progress === undefined
  if (progress !== undefined) $("progress").value = progress
}

function asset(id, url, attribute = "src") {
  const element = $(id)
  element.hidden = !url
  if (url && element.getAttribute(attribute) !== url) element.setAttribute(attribute, url)
  if (!url && element.hasAttribute(attribute)) {
    element.removeAttribute(attribute)
    if (element instanceof HTMLMediaElement) element.load()
  }
}

function draft() {
  return {
    titulo: $("title").value.trim(),
    roteiro: $("script").value.trim(),
    descricao: $("description").value.trim(),
    voice: $("voice").value,
  }
}

function render() {
  const hasProject = Boolean(project)
  const data = draft()
  const matchesAudio = project?.audio && data.roteiro === project.roteiro.roteiro && (!project.voice || data.voice === project.voice)
  const urls = matchesAudio ? project.urls : {}
  const publication = project?.publicacao
  $("production").hidden = !hasProject
  for (const button of document.querySelectorAll("[data-action]")) button.disabled = busy
  for (const id of ["projects", "topic", "duration"]) $(id).disabled = busy
  for (const id of fields) $(id).disabled = busy || Boolean(publication)
  $("narrate").disabled ||= !gemini || !data.roteiro || !data.titulo || Boolean(publication)
  $("animate").disabled ||= !urls.audio || Boolean(urls.mp4 || publication)
  $("animate").textContent = urls.mp4 ? "Vídeo pronto" : urls.html ? "Finalizar MP4" : "Criar animação e vídeo"
  $("basic-scenes").hidden = !urls.html || !project?.basicScenes
  $("audio-config").hidden = gemini
  $("publish").hidden = !urls.mp4 || !channel || Boolean(publication)
  $("publish").disabled ||= !data.titulo
  $("visibility-label").hidden = $("publish").hidden
  $("visibility").disabled = busy
  $("connect").hidden = !urls.mp4 || !youtubeChecked || Boolean(publication)
  $("connect").textContent = channel ? "Trocar canal ↗" : "Conectar YouTube ↗"
  $("channel").textContent = publication
    ? `Enviado ao YouTube · ${{ public: "Público", unlisted: "Não listado", private: "Privado" }[publication.privacyStatus] ?? ""}`
    : !urls.mp4 ? "O envio é liberado quando o vídeo fica pronto."
      : channel ? `Canal conectado: ${channel.title}${channel.handle ? ` (${channel.handle})` : ""}`
        : youtubeChecked ? "Conecte o canal que vai receber o vídeo." : "Verificando a conexão com o YouTube…"
  asset("audio", urls.audio)
  asset("audio-download", urls.audio, "href")
  asset("download", urls.mp4, "href")
  asset("preview", urls.mp4 ? null : urls.html)
  asset("html-link", urls.html, "href")
  asset("video", urls.mp4)
  asset("published", publication?.url, "href")
  $("empty-preview").hidden = Boolean(urls.html || urls.mp4)
  $("audio-download").download = `${project?.id || "short"}.wav`
  $("download").download = `${project?.id || "short"}.mp4`
  const completed = [Boolean(data.roteiro), Boolean(urls.audio), Boolean(urls.mp4), Boolean(publication)]
  document.querySelectorAll(".steps a").forEach((link, i) => link.toggleAttribute("data-complete", completed[i]))
  for (const button of $("titles").children) {
    button.disabled = busy || Boolean(publication)
    button.setAttribute("aria-pressed", String(button.textContent === data.titulo))
  }
}

function saveDraft() {
  if (project && !project.publicacao) localStorage.setItem(`fdn:draft:${project.id}`, JSON.stringify(draft()))
  render()
}

async function refreshProjects() {
  const items = await api(`${path}/projetos`)
  $("projects").replaceChildren(new Option("Novo projeto", ""), ...items.map((item) => new Option(item.titulo, item.id)))
  $("projects").value = project?.id ?? ""
}

function showProject(next, restoreDraft = false) {
  project = next
  $("projects").value = project?.id ?? ""
  localStorage.setItem(selectionKey, project?.id ?? "")
  const roteiro = project?.roteiro ?? {}
  let saved = {}
  if (project && restoreDraft && !project.publicacao) {
    saved = JSON.parse(localStorage.getItem(`fdn:draft:${project.id}`) || "{}")
  }
  $("topic").value = project?.ideia ?? $("topic").value
  $("duration").value = project?.duracaoAlvo ?? "90"
  $("title").value = saved.titulo ?? project?.titulo ?? ""
  $("script").value = saved.roteiro ?? roteiro.roteiro ?? ""
  $("description").value = saved.descricao ?? roteiro.descricao ?? ""
  $("voice").value = saved.voice ?? project?.voice ?? "Puck"
  $("titles").replaceChildren(...(roteiro.titulos ?? []).map((title) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "secondary"
    button.textContent = title
    button.addEventListener("click", () => {
      $("title").value = title
      saveDraft()
    })
    return button
  }))
  const claims = roteiro.conferir ?? []
  $("review").hidden = !claims.length
  $("claims").replaceChildren(...claims.map((claim) => {
    const item = document.createElement("li")
    item.textContent = claim
    return item
  }))
  render()
  if (project?.mp4 && !project.publicacao) void checkYouTube()
}

async function checkYouTube() {
  youtubeChecked = false
  try {
    channel = (await api(`${path}/youtube`)).channel
    $("connect").title = ""
  } catch (e) {
    channel = null
    $("connect").title = e.message
  } finally {
    youtubeChecked = true
    render()
  }
}

async function waitJob(id) {
  let failures = 0
  for (;;) {
    let job
    try {
      job = await api(`/api/jobs/${id}`)
      failures = 0
    } catch (e) {
      if (++failures >= 3) throw e
    }
    if (job?.status === "done") return job.result.project
    if (job?.status === "error") throw new Error(job.error)
    if (job) {
      status(job.step, { progress: job.pct })
      if (job.kind === "animacao" && job.pct >= 43 && project && !project.html) {
        const latest = await api(`${path}/projetos/${project.id}`).catch(() => null)
        if (latest?.html) {
          project = latest
          render()
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1100))
  }
}

async function execute(action, message, success, onSuccess) {
  if (busy) return
  busy = true
  render()
  try {
    status(message, { progress: 0 })
    const response = await action()
    const next = response.jobId ? await waitJob(response.jobId) : response.project
    showProject(next, project?.id === next.id)
    status(success)
    await refreshProjects()
    onSuccess?.()
  } catch (e) {
    status(e.message, { error: true })
  } finally {
    busy = false
    render()
  }
}

function create(manual) {
  return execute(() => api(`${path}/projetos`, {
    idea: $("topic").value,
    duration: Number($("duration").value),
    manual,
  }), "Preparando roteiro…", manual ? "Cole seu roteiro no campo Narração." : "Roteiro pronto para revisar.", () => {
    $("roteiro").scrollIntoView({ behavior: "smooth", block: "nearest" })
    if (manual) $("script").focus()
  })
}

function postStage(stage, body) {
  return api(`${path}/projetos/${project.id}/${stage}`, body)
}

$("brief").addEventListener("submit", (event) => {
  event.preventDefault()
  void create(false)
})
$("manual").addEventListener("click", () => void create(true))
for (const id of fields) $(id).addEventListener("input", saveDraft)
$("narrate").addEventListener("click", () => {
  const data = draft()
  if (project.audio && !confirm("Gerar uma nova narração? O vídeo anterior precisará ser gerado de novo.")) return
  void execute(() => postStage("narracao", data), "Preparando a narração…", "Narração pronta para ouvir.")
})
$("animate").addEventListener("click", () => {
  void execute(() => postStage("animacao", {}), "Preparando a animação…", "MP4 pronto para baixar ou enviar.")
})
$("publish").addEventListener("click", () => {
  $("confirmation").textContent = `Enviar “${draft().titulo}” para ${channel.title} com visibilidade ${$("visibility").selectedOptions[0].textContent.toLowerCase()}?`
  $("confirm").returnValue = ""
  $("confirm").showModal()
})
$("confirm").addEventListener("close", () => {
  if ($("confirm").returnValue !== "publish" || !channel) return
  void execute(() => postStage("publicacao", {
    ...draft(), channelId: channel.id, privacyStatus: $("visibility").value,
  }), "Preparando o envio…", "Vídeo enviado ao YouTube.")
})

async function selectProject(id) {
  if (!id) {
    $("topic").value = ""
    showProject(null)
    status()
    return
  }
  const next = await api(`${path}/projetos/${id}`)
  showProject(next, true)
  if (next.jobId) {
    await execute(() => ({ jobId: next.jobId }), "Retomando etapa…", "Etapa concluída.")
  }
}

$("projects").addEventListener("change", async () => {
  const id = $("projects").value
  $("projects").disabled = true
  try {
    status()
    await selectProject(id)
  } catch (e) {
    status(e.message, { error: true })
  } finally {
    render()
  }
})

try {
  const config = await api(`${path}/config`)
  gemini = config.gemini
  $("voice").replaceChildren(...config.voices.map((voice) => new Option(voice.label, voice.id)))
  $("voice").value = "Puck"
  await refreshProjects()
  const saved = localStorage.getItem(selectionKey)
  if ([...$("projects").options].some((option) => option.value === saved)) await selectProject(saved)
  const query = new URLSearchParams(location.search)
  if (query.get("oauth") === "erro") status(query.get("msg") || "A conexão com o YouTube não foi concluída.", { error: true })
  if (query.has("oauth")) history.replaceState(null, "", location.pathname)
} catch (e) {
  status(e.message, { error: true })
}
render()
