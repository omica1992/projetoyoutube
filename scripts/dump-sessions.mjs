import { getClient } from "../src/opencode.js"

const client = await getClient()
const res = await client.session.list()
const sessions = (res?.data ?? res ?? []).slice(0, 12)
for (const s of sessions) {
  const title = s.title ?? s.id
  if (!String(title).startsWith("studio-")) continue
  try {
    const ctx = await client.session.context({ sessionID: s.id })
    const a = [...ctx].reverse().find((m) => m.type === "assistant")
    const text = (a?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("")
    console.log(`\n=== ${s.id} | ${title} | model=${a?.model?.id} | ${text.length} chars`)
    console.log(text.slice(0, 280).replace(/\n/g, "\\n"))
  } catch (e) {
    console.log(s.id, "erro", e.message)
  }
}
