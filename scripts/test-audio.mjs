import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { pathToFileURL } from "node:url"

const endpoint = await Service.ensure()
console.log("endpoint:", endpoint.url)
const client = OpenCode.make({
  baseUrl: endpoint.url,
  headers: Service.headers(endpoint),
})

const file = process.argv[2]
const uri = pathToFileURL(file).href
console.log("uri:", uri)

const session = await client.session.create({
  title: "teste-audio",
  model: { id: "gemini-4-argon", providerID: "opencode-go" },
})
console.log("session:", session.id)

const res = await client.session.prompt({
  sessionID: session.id,
  text: "Transcreva EXATAMENTE a fala do arquivo de audio anexado. Nao use ferramentas. Responda apenas com a transcricao. Se nao houver audio anexado, responda apenas: SEM AUDIO",
  files: [{ uri, source: { type: "uri", uri }, name: "audio.wav" }],
})
console.log("--- RESP ---")
console.log(JSON.stringify(res, null, 2).slice(0, 4000))
