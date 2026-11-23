import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

const BASE = "http://127.0.0.1:5173"
const OUT = path.join(process.cwd(), "data", "_e2e")

async function api(url, options) {
  const res = await fetch(BASE + url, options)
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${data.error ?? text.slice(0, 300)}`)
  return data
}

async function waitJob(id) {
  let lastStep = ""
  while (true) {
    const job = await api(`/api/jobs/${id}`)
    if (job.step !== lastStep) {
      lastStep = job.step
      console.log(`   [${job.pct}%] ${job.step}`)
    }
    if (job.status === "done") return job
    if (job.status === "error") {
      console.log(job.log.slice(-12).join("\n"))
      throw new Error(job.error)
    }
    await new Promise((r) => setTimeout(r, 1200))
  }
}

function sapi(text, outWav) {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Maria Desktop')
$s.Rate = 0
$s.SetOutputToWaveFile('${outWav.replace(/'/g, "''")}')
$t = Get-Content -Raw -Encoding UTF8 '${path.join(OUT, "fala.txt").replace(/'/g, "''")}'
$s.Speak($t)
$s.Dispose()
`
    const child = spawn("powershell", ["-NoProfile", "-Command", script], { windowsHide: true })
    let err = ""
    child.stderr.on("data", (d) => (err += d))
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err))))
  })
}

fs.mkdirSync(OUT, { recursive: true })

console.log("1) criando roteiro...")
const { jobId } = await api("/api/roteiro", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nicho: "curiosidades", tom: "curiosidade + revelação", duracao: 40, geo: "BR" }),
})
const roteiroJob = await waitJob(jobId)
const project = roteiroJob.result.project
console.log("   projeto:", project.id)
console.log("   título:", project.titulo)
console.log("   roteiro:", project.roteiro.roteiro.slice(0, 160), "...")

console.log("2) sintetizando voz (SAPI Maria) para teste...")
fs.writeFileSync(path.join(OUT, "fala.txt"), project.roteiro.roteiro, "utf8")
const wav = path.join(OUT, "fala.wav")
await sapi(project.roteiro.roteiro, wav)
console.log("   wav:", (fs.statSync(wav).size / 1024).toFixed(0), "KB")

console.log("3) subindo áudio no studio...")
const form = new FormData()
form.append("audio", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), "fala.wav")
const up = await api(`/api/projetos/${project.id}/audio`, { method: "POST", body: form })
const audioJob = await waitJob(up.jobId)
console.log("   HTML:", audioJob.result.project.htmlFonte)
console.log("   blocos:", audioJob.result.project.chunks.length)
console.log("   html:", audioJob.result.project.urls.html)

console.log("4) renderizando mp4...")
const r = await api(`/api/projetos/${project.id}/render`, { method: "POST" })
const renderJob = await waitJob(r.jobId)
console.log("   MP4:", renderJob.result.mp4)
console.log("   tamanho:", (fs.statSync(path.join(process.cwd(), "data", project.id, "video.mp4")).size / 1024 / 1024).toFixed(1), "MB")
