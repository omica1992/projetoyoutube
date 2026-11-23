import fs from "node:fs"
import path from "node:path"
import { gerarHtmlComIa } from "../src/htmlgen.js"

const id = process.argv[2]
const dir = path.join(process.cwd(), "data", id)
const project = JSON.parse(fs.readFileSync(path.join(dir, "projeto.json"), "utf8"))

const t0 = Date.now()
const r = await gerarHtmlComIa({
  dir,
  chunks: project.chunks,
  direcao: project.direcao,
  timeline: project.timeline,
  audioName: project.audio,
  titulo: project.titulo,
  log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`),
})
console.log("RESULTADO:", r.fonte, r.htmlPath)
for (const f of ["video.ia.html"]) {
  const p = path.join(dir, f)
  if (fs.existsSync(p)) {
    const s = fs.readFileSync(p, "utf8")
    console.log(`${f}: ${s.length} chars`)
    console.log(s.slice(0, 300).replace(/\n/g, "\\n"))
  } else console.log(`${f}: não existe`)
}
