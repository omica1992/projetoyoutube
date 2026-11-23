import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { pathToFileURL } from "node:url"

const endpoint = await Service.ensure()
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })

const file = process.argv[2]
const uri = pathToFileURL(file).href
const models = (process.argv[3] ?? "gemini-4-argon,mimo-v2.6-pro,mimo-v2.6-flash,muse-spark-1.3-contributor").split(",")

const texto = "O audio anexado contem uma frase curta em portugues. Transcreva palavra por palavra, exatamente. Nao use ferramentas. Se nao conseguir ouvir nenhum audio, responda apenas: SEM AUDIO"

for (const modelID of models) {
  const t0 = Date.now()
  try {
    const session = await client.session.create({ title: `audio-${modelID}`, model: { id: modelID, providerID: "opencode-go" } })
    await client.session.prompt({
      sessionID: session.id,
      text: texto,
      files: [{ uri, source: { type: "uri", uri }, name: "audio.wav" }],
    })
    await client.experimental.session.wait({ sessionID: session.id })
    const msgs = await client.session.context({ sessionID: session.id })
    const assistant = [...msgs].reverse().find((m) => m.type === "assistant")
    const answer = (assistant?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ").trim()
    console.log(`\n=== ${modelID} (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`)
    console.log(answer.slice(0, 800) || "(sem texto)")
  } catch (e) {
    console.log(`\n=== ${modelID} ERRO ===`)
    console.log(String(e?.message ?? e).slice(0, 500))
  }
}
