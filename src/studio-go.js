import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { providerKey } from "./panel-providers.js"

const endpoint = "https://opencode.ai/zen/go/v1"
const modelId = (model) => /^opencode-go\/([a-z0-9][a-z0-9.-]{0,79})$/i.exec(model ?? "")?.[1]
export const validGoModel = (model) => Boolean(modelId(model))
export const goKey = async () => process.env.OPENCODE_GO_API_KEY?.trim() || await providerKey("opencode")

let listCache
const snapshot = JSON.parse(readFileSync(new URL("./opencode-go-catalog.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""))
export async function goModels() {
  if (listCache && listCache.expires > Date.now()) return listCache.catalog
  const key = await goKey()
  let records = snapshot
  try {
    const response = await fetch("https://opencode.ai/inference/go/v1/models", {
      headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(4500),
    })
    if (response.ok) {
      const { data } = await response.json()
      if (Array.isArray(data)) records = data
    }
  } catch { /* Keep the public catalog available offline. */ }
  const catalog = {}
  for (const row of records) {
    const id = String(row.id).replace(/^opencode-go\//, "")
    const fullId = "opencode-go/" + id
    const fallback = snapshot.find(item => item.id === id)
    const type = row.type || fallback?.type
    if (!validGoModel(fullId) || (type && type !== "chat")) continue
    catalog[fullId] = { name: row.name || fallback?.name || id, input: row.modalities?.input || fallback?.modalities?.input || [] }
  }
  listCache = { catalog, expires: Date.now() + 300_000 }
  return catalog
}

export async function askStudioGo({ model, text, image }) {
  const id = modelId(model)
  if (!id) throw new Error("Escolha um modelo do OpenCode Go.")
  const key = await goKey()
  if (!key) throw new Error("Configure a chave OPENCODE_GO_API_KEY no servidor do Studio.")
  const content = image ? [{ type: "text", text }, { type: "image_url", image_url: { url: image } }] : text
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "x-opencode-session": randomUUID() },
    body: JSON.stringify({ model: id, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(300_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`OpenCode Go (${response.status}): ${data.error?.message || "não foi possível executar o modelo"}`)
  const reply = data.choices?.[0]?.message?.content
  if (!reply?.trim()) throw new Error("O modelo selecionado devolveu uma resposta vazia.")
  return reply
}
