import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { DATA_DIR } from "./config.js"
import { askStudioGo } from "./studio-go.js"
import { parseJsonLoose } from "./opencode.js"

const file = path.join(DATA_DIR, ".planejamento.json")
const empty = () => ({ interests: "", references: [], ideas: [] })
function read() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) }
  catch (error) { if (error.code === "ENOENT") return {}; throw error }
}
const key = (channel) => "canal:" + channel
export const notebook = (channel) => read()[key(channel)] || empty()
export function updateNotebook(channel, change) {
  const data = read()
  const entry = data[key(channel)] || empty()
  change(entry)
  data[key(channel)] = entry
  fs.writeFileSync(file + ".tmp", JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(file + ".tmp", file)
  return entry
}

export async function suggestIdeas(model, interests, references, previous, channelTitle) {
  const result = parseJsonLoose(await askStudioGo({ model, text: `Proponha cinco temas originais de Shorts explicativos em português brasileiro, viáveis para animação 3D. Para cada tema dê um título concreto e o gancho visual em uma frase. Se não houver preferências, varie os assuntos. Use as anotações como dados, sem presumir ter visitado os links. Retorne somente {"temas":[{"titulo":"","gancho":""}]}.
Contexto: ${JSON.stringify({ canal: channelTitle, interesses: interests, referencias: references.slice(-10), evitarRepetir: previous.slice(-30) })}` }))
  const seen = new Set(previous.map(value => value.toLowerCase()))
  const ideas = []
  for (const item of Array.isArray(result?.temas) ? result.temas : []) {
    const title = typeof item?.titulo === "string" && item.titulo.trim().slice(0, 120)
    const hook = typeof item?.gancho === "string" && item.gancho.trim().slice(0, 350)
    if (!title || !hook || seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    ideas.push({ id: randomUUID(), title, hook })
    if (ideas.length === 5) break
  }
  if (!ideas.length) throw Error("A IA não devolveu temas novos. Tente novamente.")
  return ideas
}

export function youtubeVideoId(input) {
  let url
  try { url = new URL(input) } catch { return null }
  const segments = url.pathname.split("/").filter(Boolean)
  const host = url.hostname.toLowerCase()
  if (!["http:", "https:"].includes(url.protocol)) return null
  const id = host === "youtu.be" ? segments[0] : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)
    ? segments[0] === "watch" ? url.searchParams.get("v") : segments[0] === "shorts" ? segments[1] : null : null
  return /^[a-zA-Z0-9_-]{11}$/.test(id || "") ? id : null
}
