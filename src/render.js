import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import ffmpegPath from "ffmpeg-static"
import { FPS, HEIGHT, WIDTH } from "./config.js"

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean)

export function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c
  throw new Error("Chrome/Edge não encontrado. Defina CHROME_PATH.")
}

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let err = ""
    child.stderr.on("data", (d) => {
      const s = d.toString()
      err += s
      onLine?.(s)
    })
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1200)))))
  })
}

/** Captura a animação quadro a quadro (determinístico) e devolve os frames. */
export async function captureFrames({ htmlPath, framesDir, duration, onProgress, workers: workerCount }) {
  const chrome = findChrome()
  fs.rmSync(framesDir, { recursive: true, force: true })
  fs.mkdirSync(framesDir, { recursive: true })

  const total = Number(duration)
  if (!total) throw new Error("Duração do vídeo não encontrada no timeline")

  const frames = Math.ceil(total * FPS)
  const workers = Math.max(1, Math.min(4, Number(workerCount ?? process.env.STUDIO_WORKERS ?? 2)))
  const per = Math.ceil(frames / workers)
  const errors = []
  const start = Date.now()
  let done = 0

  const report = () => {
    if (done % 15 !== 0 && done !== frames) return
    const elapsed = (Date.now() - start) / 1000
    const eta = (elapsed / Math.max(done, 1)) * (frames - done)
    onProgress?.({ frame: done, frames, pct: done / frames, eta: Math.round(eta) })
  }

  const worker = async (wi) => {
    const from = wi * per
    const to = Math.min(frames, from + per)
    if (from >= to) return

    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: "shell",
      protocolTimeout: 120_000,
      args: [
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--disable-lcd-text",
        "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        `--window-size=${WIDTH},${HEIGHT}`,
      ],
    })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
      await page.evaluateOnNewDocument(() => {
        window.__RENDER__ = true
      })
      page.on("pageerror", (e) => errors.push(String(e)))
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text())
      })
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 60_000 })
      await page.waitForFunction(() => window.__STUDIO__ && window.__STUDIO__.setTime, { timeout: 30_000 })
      await page
        .waitForFunction(() => window.__STUDIO__ && window.__STUDIO__.ready === true, { timeout: 15_000 })
        .catch(() => {})

      for (let f = from; f < to; f++) {
        const t = f / FPS
        await page.evaluate((time) => window.__STUDIO__.setTime(time), t)
        const file = path.join(framesDir, `f${String(f).padStart(5, "0")}.jpg`)
        await page.screenshot({
          path: file,
          type: "jpeg",
          quality: 92,
          optimizeForSpeed: true,
          captureBeyondViewport: false,
        })
        done++
        report()
      }
    } finally {
      await browser.close().catch(() => {})
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)))
  return { frames, duration: total, errors, workers }
}

export async function encodeMp4({ framesDir, audioPath, outFile, onLine }) {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", path.join(framesDir, "f%05d.jpg"),
    "-i", audioPath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "19",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outFile,
  ]
  return run(ffmpegPath, args, onLine)
}

/** Teste rápido: abre o HTML, desenha dois instantes e compara. */
export async function smokeHtml({ htmlPath, duration }) {
  const chrome = findChrome()
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "shell",
    args: ["--hide-scrollbars", "--mute-audio", "--disable-lcd-text"],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
    await page.evaluateOnNewDocument(() => {
      window.__RENDER__ = true
    })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 45_000 })
    await page.waitForFunction(() => window.__STUDIO__ && window.__STUDIO__.setTime, { timeout: 20_000 })
    const d = Number(await page.evaluate(() => window.__STUDIO__.duration)) || duration

    const shot = async (t) => {
      await page.evaluate((time) => window.__STUDIO__.setTime(time), t)
      return page.screenshot({ type: "jpeg", quality: 70, optimizeForSpeed: true })
    }
    const a = await shot(Math.max(0.2, d * 0.3))
    const b = await shot(Math.max(0.4, d * 0.7))
    if (Buffer.from(a).equals(Buffer.from(b))) throw new Error("animação estática (quadros idênticos)")
    if (errors.length) throw new Error(`erros no HTML: ${errors.slice(0, 2).join(" | ")}`)
    return true
  } finally {
    await browser.close().catch(() => {})
  }
}

/** Aplica normalização de loudness para o padrão do YouTube (-14 LUFS). */
export async function normalizeAudio({ audioPath, outFile }) {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", audioPath,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k",
    outFile,
  ]
  await run(ffmpegPath, args)
  return outFile
}
