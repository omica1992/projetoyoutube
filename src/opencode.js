import fs from "node:fs"
import path from "node:path"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { PROVIDER } from "./config.js"
import { providerKey } from "./panel-providers.js"

let cached = null

function resolveOpencodeCommand() {
  if (process.env.OPENCODE_BIN) return [process.env.OPENCODE_BIN, "serve", "--service"]
  if (process.platform === "win32" && process.env.APPDATA) {
    const winBin = path.join(process.env.APPDATA, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe")
    if (fs.existsSync(winBin)) return [winBin, "serve", "--service"]
  }
  return ["opencode", "serve", "--service"]
}

export function parseModelSpec(model) {
  const raw = String(model || "").trim()
  if (raw.includes("/")) {
    const idx = raw.indexOf("/")
    return { providerID: raw.slice(0, idx), id: raw.slice(idx + 1) }
  }
  return { providerID: PROVIDER, id: raw }
}

export async function getClient() {
  if (cached) return cached
  const endpoint = await Service.ensure({ command: resolveOpencodeCommand() })
  cached = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  return cached
}

/**
 * Executa um prompt de ponta a ponta numa sessão nova e devolve o texto final.
 * Usa session.generate (turno completo, retorno síncrono). Anexos de áudio não
 * entram aqui: transcrição roda local com Whisper.
 */
async function askCloudFallback({ model, text, timeoutMs }) {
  const apiUrl = process.env.AI_API_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  if (apiUrl && apiKey) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: text }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`API IA HTTP ${res.status}`)
    const data = await res.json()
    const body = data?.choices?.[0]?.message?.content
    if (!body?.trim()) throw new Error(`Modelo ${model} respondeu vazio`)
    return String(body)
  }

  const ocKey = await providerKey("opencode")
  if (ocKey && !String(model).startsWith("gemini/")) {
    const modelId = parseModelSpec(model).id
    const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ocKey}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: text }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error?.message || `OpenCode API HTTP ${res.status}`)
    }
    const data = await res.json()
    const body = data?.choices?.[0]?.message?.content
    if (!body?.trim()) throw new Error(`Modelo ${model} respondeu vazio`)
    return String(body)
  }

  const geminiKey = await providerKey("gemini")
  if (geminiKey) {
    const gemModel = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash"
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`)
    const data = await res.json()
    const body = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("")
    if (!body?.trim()) throw new Error("Gemini respondeu vazio")
    return String(body)
  }

  throw new Error("Conecte sua chave da OpenCode API em Integrações (ou configure AI_API_URL/AI_API_KEY) para usar suas IAs na Vercel.")
}

export async function ask({ model, text, timeoutMs = 300_000, onTick }) {
  if (process.env.VERCEL || (process.env.AI_API_URL && process.env.AI_API_KEY)) {
    onTick?.("")
    const body = await askCloudFallback({ model, text, timeoutMs })
    onTick?.(body)
    return body
  }
  const client = await getClient()
  const spec = parseModelSpec(model)
  const session = await client.session.create({
    title: `studio-${Date.now()}`,
    model: spec,
  })

  onTick?.("")
  const started = Date.now()
  try {
    const out = await client.session.generate(
      { sessionID: session.id, prompt: text },
      { signal: AbortSignal.timeout(timeoutMs) },
    )
    const body = typeof out === "string" ? out : out?.text
    if (!body || !String(body).trim()) throw new Error(`Modelo ${model} respondeu vazio`)
    onTick?.(String(body))
    return String(body)
  } catch (e) {
    const ms = Date.now() - started
    const msg = e?.message ?? String(e)
    throw new Error(`Falha com ${model} após ${(ms / 1000).toFixed(0)}s: ${msg}`)
  }
}

/** Tenta vários modelos em ordem até um devolver texto. */
export async function askFallback({ models, text, timeoutMs = 180_000, onTick, log }) {
  const errors = []
  for (const model of models) {
    try {
      const out = await ask({ model, text, timeoutMs, onTick })
      if (log && model !== models[0]) log(`usando ${model} (o modelo principal falhou)`)
      return { text: out, model }
    } catch (e) {
      errors.push(`${model}: ${e.message.slice(0, 160)}`)
      log?.(`${model} falhou: ${e.message.slice(0, 160)}`)
    }
  }
  throw new Error(`Nenhum modelo respondeu (${errors.join(" | ")})`)
}

/** Extrai o primeiro objeto/array JSON de uma resposta que pode vir com cercas markdown. */
export function parseJsonLoose(raw) {
  if (!raw) throw new Error("Resposta vazia")
  let s = String(raw).trim()
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
  const start = s.search(/[[{]/)
  if (start === -1) throw new Error("Nenhum JSON encontrado na resposta")
  s = s.slice(start)
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{" || ch === "[") depth++
    else if (ch === "}" || ch === "]") {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end === -1) throw new Error("JSON incompleto na resposta")
  return JSON.parse(s.slice(0, end))
}
