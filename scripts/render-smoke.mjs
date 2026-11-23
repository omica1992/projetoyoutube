import fs from "node:fs"
import path from "node:path"
import { transcribeAudio } from "../src/transcribe.js"
import { audioDuration, buildChunks, buildTimeline } from "../src/timeline.js"
import { direcaoHeuristica } from "../src/direcao.js"
import { writeEngineHtml } from "../src/htmlgen.js"
import { captureFrames, encodeMp4 } from "../src/render.js"

const wav = process.argv[2]
const outDir = path.join(process.cwd(), "data", "_smoke")
fs.mkdirSync(outDir, { recursive: true })

const mp3 = path.join(outDir, "audio.mp3")
fs.copyFileSync(wav, path.join(outDir, "audio.wav"))

console.log("1/5 transcrevendo...")
const whisper = await transcribeAudio(path.join(outDir, "audio.wav"))
console.log("   ", whisper.text)

console.log("2/5 chunking...")
const chunks = buildChunks(whisper)
console.log("   ", chunks.map((c) => `${c.start}-${c.end} ${c.text}`).join(" | "))

const duracao = (await audioDuration(path.join(outDir, "audio.wav"))) || whisper.duration
const direcao = direcaoHeuristica(chunks, "sombrio")
const timeline = buildTimeline({ chunks, direcao, duration: duracao, titulo: "Smoke Test" })

console.log("3/5 html...")
const htmlPath = writeEngineHtml({
  dir: outDir,
  timeline,
  audioName: "audio.wav",
  titulo: "Smoke Test",
})
console.log("   ", htmlPath)

console.log("4/5 capturando quadros...")
const framesDir = path.join(outDir, "frames")
const t0 = Date.now()
const { frames } = await captureFrames({
  htmlPath,
  framesDir,
  duration: timeline.duration,
  onProgress: ({ frame, frames: total, eta }) => {
    if (frame % 30 === 0) console.log(`    ${frame}/${total} (~${eta}s restantes)`)
  },
})
console.log(`    ${frames} quadros em ${((Date.now() - t0) / 1000).toFixed(1)}s`)

console.log("5/5 codificando...")
const out = path.join(outDir, "smoke.mp4")
await encodeMp4({ framesDir, audioPath: path.join(outDir, "audio.wav"), outFile: out })
console.log("    OK:", out, (fs.statSync(out).size / 1024).toFixed(0), "KB")
