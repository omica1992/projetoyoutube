import { spawn } from "node:child_process"
import path from "node:path"
import { PY_DIR, WHISPER } from "./config.js"

export function transcribeAudio(audioPath, { model = WHISPER.model, language = WHISPER.language } = {}) {
  return new Promise((resolve, reject) => {
    const py = spawn("python", ["-X", "utf8", path.join(PY_DIR, "transcribe.py"), audioPath, model, language], {
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""
    py.stdout.on("data", (d) => (stdout += d.toString("utf8")))
    py.stderr.on("data", (d) => {
      stderr += d.toString("utf8")
      process.stderr.write(d)
    })
    py.on("error", reject)
    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Whisper falhou (${code}): ${stderr.slice(-800)}`))
      const line = stdout
        .split(/\r?\n/)
        .reverse()
        .find((l) => l.trim().startsWith("{"))
      if (!line) return reject(new Error(`Whisper não devolveu JSON: ${stdout.slice(-500)}`))
      resolve(JSON.parse(line))
    })
  })
}
