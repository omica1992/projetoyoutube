import fs from "node:fs"
import path from "node:path"
import { designComIa } from "../src/htmlgen.js"

const id = process.argv[2]
const dir = path.join(process.cwd(), "data", id)
const project = JSON.parse(fs.readFileSync(path.join(dir, "projeto.json"), "utf8"))

const t0 = Date.now()
try {
  const { html, css } = await designComIa({
    chunks: project.chunks,
    direcao: project.direcao,
    audioName: project.audio,
    titulo: project.titulo,
    timeline: project.timeline,
    log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`),
  })
  fs.writeFileSync(path.join(dir, "video.design.html"), html, "utf8")
  console.log(`OK em ${((Date.now() - t0) / 1000).toFixed(0)}s · html ${html.length} · css ${css.length}`)
  console.log("CSS:", css.slice(0, 400).replace(/\n/g, " "))
} catch (e) {
  console.log(`ERRO em ${((Date.now() - t0) / 1000).toFixed(0)}s: ${e.message}`)
}
