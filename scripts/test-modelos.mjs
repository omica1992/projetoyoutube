import { ask } from "../src/opencode.js"
import { promptDesign } from "../src/prompts.js"
import fs from "node:fs"
import path from "node:path"

const id = process.argv[2]
const project = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", id, "projeto.json"), "utf8"))
const chars = process.argv.slice(3)
const text = promptDesign({ chunks: project.chunks, direcao: project.direcao })
console.log(`prompt: ${text.length} chars`)

for (const model of chars) {
  const t0 = Date.now()
  try {
    const out = await ask({ model, text, timeoutMs: 120_000 })
    console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(0)}s · ${out.length} chars · ${JSON.stringify(out.slice(0, 120))}`)
  } catch (e) {
    console.log(`${model}: ERRO ${((Date.now() - t0) / 1000).toFixed(0)}s · ${e.message.slice(0, 160)}`)
  }
}
