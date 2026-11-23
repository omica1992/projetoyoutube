import { ask } from "../src/opencode.js"

const models = process.argv.slice(2)
for (const model of models) {
  const t0 = Date.now()
  try {
    const out = await ask({
      model,
      text: "Responda apenas com a palavra OK.",
      timeoutMs: 120_000,
    })
    console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${JSON.stringify(out.slice(0, 80))}`)
  } catch (e) {
    console.log(`${model}: ERRO ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${e.message}`)
  }
}
