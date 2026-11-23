import { ask } from "../src/opencode.js"

const [model, timeoutArg] = process.argv.slice(2)
const timeoutMs = Number(timeoutArg) || 300_000
const t0 = Date.now()
let lastTick = 0
try {
  const out = await ask({
    model,
    text: "Responda apenas com a palavra OK.",
    timeoutMs,
    onTick: (t) => {
      const now = Date.now()
      if (now - lastTick > 3000) {
        lastTick = now
        console.log(`  ...${((now - t0) / 1000).toFixed(0)}s (${t.length} chars)`)
      }
    },
  })
  console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${JSON.stringify(out.slice(0, 100))}`)
} catch (e) {
  console.log(`${model}: ERRO ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${e.message}`)
}
