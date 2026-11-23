import { ask, parseJsonLoose } from "../src/opencode.js"
import { buildTrendBrief } from "../src/trends.js"
import { promptRoteiro } from "../src/prompts.js"

const nicho = process.argv[2] ?? "curiosidades"
const t0 = Date.now()
const brief = await buildTrendBrief({ nicho })
console.log(`tendências em ${((Date.now() - t0) / 1000).toFixed(1)}s · ${brief.buscasDoDia.length} buscas`)

const raw = await ask({
  model: "gemini-4-argon",
  text: promptRoteiro({ nicho, tom: "curiosidade + revelação", duracao: 50, brief }),
  timeoutMs: 300_000,
})
console.log(`roteiro em ${((Date.now() - t0) / 1000).toFixed(1)}s, ${raw.length} chars`)
const j = parseJsonLoose(raw)
console.log("TÍTULO:", j.titulo)
console.log("ROTEIRO:", j.roteiro)
console.log("CENAS:", (j.cenas || []).length, "| HASHTAGS:", (j.hashtags || []).join(" "))
