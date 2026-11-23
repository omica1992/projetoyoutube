// Captura de telas do painel (desktop e mobile) para conferência visual.
// Uso: node scripts/ui-shots.mjs <pasta-de-saida> [porta]
import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer-core"
import { findChrome } from "../src/render.js"

const out = process.argv[2]
const port = process.argv[3] || "5173"
fs.mkdirSync(out, { recursive: true })
const base = `http://localhost:${port}`

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] })
const errors = []

async function run(label, viewport) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`[${label}] console: ${m.text()}`))
  page.on("requestfailed", (r) => !r.url().includes("googleusercontent") && !r.url().includes("ytimg") && errors.push(`[${label}] requestfailed: ${r.url()}`))
  await page.goto(`${base}/#canal`, { waitUntil: "networkidle2" })
  await new Promise((r) => setTimeout(r, 2500))
  const shot = (name, full = false) => page.screenshot({ path: path.join(out, `${label}-${name}.png`), fullPage: full })

  await shot("dashboard", true)

  // gráfico de linha com série simulada (só para validar o desenho)
  await page.evaluate(async () => {
    const m = await import("/live.js")
    const s = structuredClone(m.getSnapshot())
    const now = Date.now()
    s.now = now
    s.series = Array.from({ length: 40 }, (_, i) => ({ t: now - (40 - i) * 90_000, subs: 20 + Math.floor(i / 8), views: 800 + i * 37 + (i % 5) * 11, videos: 17, avg: 50 + i }))
    s.current = { ...s.series.at(-1), t: now }
    s.feed = [{ t: now - 5000, type: "views", text: "+4 views em “Teste”" }, { t: now - 20000, type: "subs", text: "+1 inscrito" }]
    m.applySnapshot(s)
  })
  await new Promise((r) => setTimeout(r, 1200))
  await shot("dashboard-line", true)

  for (const id of ["pesquisa", "chat", "producao", "estrategia", "metas", "historico", "integracoes"]) {
    await page.evaluate((h) => (location.hash = h), id)
    await new Promise((r) => setTimeout(r, 900))
    await shot(id, id !== "chat")
  }

  // busca direta + drawer de análise
  await page.evaluate(() => (location.hash = "pesquisa"))
  await new Promise((r) => setTimeout(r, 500))
  await page.click("#btn-direct-search")
  await page.waitForSelector("#search-results .media-card", { timeout: 25000 }).catch(() => errors.push(`[${label}] busca direta sem resultados`))
  await new Promise((r) => setTimeout(r, 1200))
  await shot("pesquisa-resultados", true)
  await page.click("#btn-open-analyzer")
  await new Promise((r) => setTimeout(r, 700))
  await shot("drawer-analise")
  await page.close()
}

await run("desktop", { width: 1440, height: 900 })
await run("mobile", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await browser.close()
console.log(errors.length ? `ERROS:\n${errors.join("\n")}` : "SEM ERROS DE CONSOLE")

