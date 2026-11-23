import { getClient } from "../src/opencode.js"

const client = await getClient()
const s = await client.session.create({ title: "diagnostico", model: { id: "minimax-m3.1-flash", providerID: "opencode-go" } })
console.log("sessão:", s.id)
const sent = await client.session.prompt({ sessionID: s.id, text: "Responda apenas OK.", resume: true })
console.log("enviado:", JSON.stringify(sent).slice(0, 400))

for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const ctx = await client.session.context({ sessionID: s.id })
  const inbox = await client.session.inbox.list({ sessionID: s.id })
  console.log(
    `t=${(i + 1) * 5}s context=${ctx.length} tipos=${ctx.map((m) => m.type).join(",")} inbox=${inbox.length}`,
  )
  if (ctx.some((m) => m.type === "assistant")) {
    const a = [...ctx].reverse().find((m) => m.type === "assistant")
    console.log("ASSISTANT:", JSON.stringify(a).slice(0, 600))
    break
  }
}
