import { getClient } from "../src/opencode.js"

const client = await getClient()
const s = await client.session.create({ title: "diag2", model: { id: "minimax-m3.1-flash", providerID: "opencode-go" } })
console.log("sessão:", s.id)
const t0 = Date.now()
try {
  const out = await client.session.generate({ sessionID: s.id, prompt: "Responda apenas OK." })
  console.log(`OK em ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(out).slice(0, 500))
} catch (e) {
  console.log(`ERRO em ${((Date.now() - t0) / 1000).toFixed(1)}s:`, e.message)
}
