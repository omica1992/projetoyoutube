import { readFile, writeFile, rename, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import os from "node:os"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import { hasSupabase, kvGet, kvSet } from "./db.js"

const keys = { vidiq: "VIDIQ_API_KEY", gemini: "GEMINI_API_KEY", youtube: "YOUTUBE_API_KEY", opencode: "OPENCODE_API_KEY", elevenlabs: "ELEVENLABS_API_KEY" }

export const ELEVEN_VOICES = [
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam · Grave e narrativa (ElevenLabs)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah · Clara e natural (ElevenLabs)" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni · Equilibrada (ElevenLabs)" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel · Calma e envolvente (ElevenLabs)" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi · Forte e expressiva (ElevenLabs)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh · Jovem e dinâmica (ElevenLabs)" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold · Profunda (ElevenLabs)" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam · Direta e firme (ElevenLabs)" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel · Documental (ElevenLabs)" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte · Suave (ElevenLabs)" },
]
export const VOICE_CATALOG = [
  { id: "Kore", label: "Kore · Firme e clara" },
  { id: "Puck", label: "Puck · Animada e jovem" },
  { id: "Charon", label: "Charon · Informativa e grave" },
  { id: "Fenrir", label: "Fenrir · Enérgica e forte" },
  { id: "Aoede", label: "Aoede · Leve e fluida" },
  { id: "Zephyr", label: "Zephyr · Brilhante e expressiva" },
  { id: "Leda", label: "Leda · Jovem e suave" },
  { id: "Orus", label: "Orus · Firme e segura" },
  { id: "Callirrhoe", label: "Callirrhoe · Tranquila e natural" },
  { id: "Autonoe", label: "Autonoe · Brilhante e clara" },
  { id: "Enceladus", label: "Enceladus · Sussurrada / íntima" },
  { id: "Iapetus", label: "Iapetus · Clara e direta" },
  { id: "Umbriel", label: "Umbriel · Calma e envolvente" },
  { id: "Algieba", label: "Algieba · Macia e agradável" },
  { id: "Despina", label: "Despina · Suave e contínua" },
  { id: "Erinome", label: "Erinome · Nítida e precisa" },
  { id: "Algenib", label: "Algenib · Grave e texturizada" },
  { id: "Rasalgethi", label: "Rasalgethi · Documental / informativa" },
  { id: "Laomedeia", label: "Laomedeia · Alegre e dinâmica" },
  { id: "Achernar", label: "Achernar · Suave e acolhedora" },
  { id: "Alnilam", label: "Alnilam · Firme e marcante" },
  { id: "Schedar", label: "Schedar · Equilibrada e natural" },
  { id: "Gacrux", label: "Gacrux · Madura e confiante" },
  { id: "Pulcherrima", label: "Pulcherrima · Expressiva e direta" },
  { id: "Achird", label: "Achird · Amigável e próxima" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi · Casual e conversacional" },
  { id: "Vindemiatrix", label: "Vindemiatrix · Gentil e serena" },
  { id: "Sadachbia", label: "Sadachbia · Viva e envolvente" },
  { id: "Sadaltager", label: "Sadaltager · Confiante e didática" },
  { id: "Sulafat", label: "Sulafat · Quente e acolhedora" },
]
const VOICES = VOICE_CATALOG.map((v) => v.id)
const STYLES = {
  narration: "Narração firme, envolvente, com modulação vocal rica e pausas dramáticas para YouTube Shorts.",
  friendly: "Tom amigável, natural e próximo, com ritmo fluido de conversa.",
  promote: "Alta energia, ritmo dinâmico e ênfase em palavras-chave para prender atenção.",
  mystery: "Tom de curiosidade e mistério, criando suspense antes da revelação.",
  whisper: "Tom mais baixo, íntimo e sussurrado para gerar intriga.",
}
export const CHANNEL_ID = "UCClrO3uvc5-H6NPc6alEHDw"

export async function providerKey(provider) {
  if (!process.env.VERCEL) {
    const file = new URL(`../.panel-${provider}-key`, import.meta.url)
    try {
      const local = (await readFile(file, "utf8")).trim()
      if (local) return local
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  if (hasSupabase()) {
    try {
      const row = await kvGet(`key:${provider}`)
      if (row?.key) return String(row.key).trim()
    } catch {}
  }
  return process.env[keys[provider]]?.trim() || ""
}

export async function storeProviderKey(provider, key) {
  if (hasSupabase()) {
    await kvSet(`key:${provider}`, { key })
  }
  if (process.env.VERCEL) return
  const temp = new URL(`../.panel-${provider}-key.${randomUUID()}.tmp`, import.meta.url)
  try {
    await writeFile(temp, key, { mode: 0o600, flag: "wx" })
    await rename(temp, new URL(`../.panel-${provider}-key`, import.meta.url))
  } finally {
    await unlink(temp).catch(() => {})
  }
}

function decodeMcp(text) {
  if (!text.trim()) return null
  if (text.trimStart().startsWith("{")) return JSON.parse(text)
  const messages = text.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n")
    return data ? [JSON.parse(data)] : []
  })
  return messages.findLast((entry) => entry.id != null) ?? null
}

export async function vidiqClient(key, request = fetch) {
  if (!key) throw new Error("Conecte a chave MCP do vidIQ em Integrações.")
  let id = 0
  let session = ""
  let protocol = "2025-03-26"
  async function rpc(method, params) {
    const notification = method.startsWith("notifications/")
    const response = await request("https://mcp.vidiq.com/mcp", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
        "MCP-Protocol-Version": protocol,
        ...(session ? { "Mcp-Session-Id": session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: ++id }), method, params }),
    })
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new Error("O vidIQ recusou a credencial MCP. Confira a chave em Integrações.")
      if (response.status === 429) throw new Error("O vidIQ atingiu um limite de consulta. Confira os créditos e tente novamente.")
      throw new Error(`O vidIQ retornou HTTP ${response.status}.`)
    }
    session = response.headers.get("Mcp-Session-Id") || session
    if (notification) return
    const result = decodeMcp(await response.text())
    if (!result || result.error) throw new Error("O vidIQ não concluiu a solicitação MCP.")
    return result.result
  }
  const hello = await rpc("initialize", {
    protocolVersion: protocol, capabilities: {}, clientInfo: { name: "FatoNexo Studio", version: "1.0.0" },
  })
  protocol = hello.protocolVersion || protocol
  await rpc("notifications/initialized", {})
  return async (name, args = {}) => {
    const response = await rpc("tools/call", { name, arguments: args })
    const text = response.content?.find((item) => item.type === "text")?.text ?? ""
    let data = response.structuredContent
    if (!data && text.startsWith("{")) {
      try { data = JSON.parse(text) } catch {}
    }
    if (response.isError || data?.error || !data) {
      if (/credit|cota|quota/i.test(`${text} ${JSON.stringify(data?.error ?? "")}`)) {
        throw new Error("O vidIQ está sem créditos para esta consulta.")
      }
      throw new Error("O vidIQ não disponibilizou estes dados para a conta ou credencial conectada.")
    }
    return data
  }
}

async function gemini(key, route, options, request, timeoutMs = 55_000) {
  if (!key) throw new Error("Conecte a chave do Google AI Studio em Integrações.")
  const response = await request(`https://generativelanguage.googleapis.com/v1beta/${route}`, {
    ...options, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
  })
  if (!response.ok) {
    if (response.status === 429) throw new Error("Limite do Gemini atingido. Confira a cota do projeto no Google AI Studio.")
    if ([400, 401, 403].includes(response.status)) throw new Error("O Google recusou a consulta. Confira a chave, o acesso à Gemini API e o modelo no projeto.")
    throw new Error(`A Gemini API retornou HTTP ${response.status}.`)
  }
  return response.json()
}

export const TTS_MODEL = "gemini-2.5-flash-preview-tts"
export const ARLO = { id: "en-us-arlo", label: "Arlo · en-US" }
let library, pendingLibrary
export async function googleVoices(key) {
  if (library?.key === key && library.until > Date.now()) return library.voices
  if (pendingLibrary?.key === key) return pendingLibrary.promise
  const promise = (async () => {
    const known = new Set(VOICE_CATALOG.map(v => v.id.toLowerCase()))
    const voices = [...VOICE_CATALOG]
    let token = ""
    const pages = new Set()
    do {
      if (pages.has(token)) throw Error("O Google repetiu uma página do catálogo. Tente novamente.")
      pages.add(token)
      const query = new URLSearchParams({ page_size: "100" })
      if (token) query.set("page_token", token)
      const page = await gemini(key, "voices?" + query, {}, fetch)
      for (const row of page.voices || []) {
        if (!row.id || known.has(row.id.toLowerCase())) continue
        known.add(row.id.toLowerCase())
        voices.push({ id: row.id, label: [row.display_name || row.id, row.language_code].filter(Boolean).join(" · ") })
      }
      token = page.next_page_token || ""
    } while (token)
    library = { key, voices, until: Date.now() + 3600000 }
    return voices
  })()
  pendingLibrary = { key, promise }
  try { return await promise } finally { if (pendingLibrary?.promise === promise) pendingLibrary = null }
}
export async function verifyGemini(key, request = fetch) {
  await gemini(key, `models/${TTS_MODEL}`, {}, request)
}

export async function generateNarration({ key, text, voice, style = "narration" }, request = fetch) {
  const styleDesc = STYLES[style] || STYLES.narration
  if (!VOICES.includes(voice)) {
    if (voice !== ARLO.id && !(await googleVoices(key)).some(v => v.id === voice)) throw Error("Selecione uma voz disponível.")
    const result = await gemini(key, "interactions", { method: "POST", body: JSON.stringify({
      model: "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: "Português do Brasil. " + styleDesc }] }] }],
      response_format: { type: "audio", mime_type: "audio/wav" },
      generation_config: { speech_config: [{ voice }] },
    }) }, request, 120000)
    const audio = result.steps?.filter(s => s.type === "model_output").flatMap(s => s.content || []).find(c => c.type === "audio")
    const wav = Buffer.from(audio?.data || "", "base64")
    if (wav.length <= 44 || wav.toString("ascii",0,4) !== "RIFF" || wav.toString("ascii",8,12) !== "WAVE") throw Error("O Google não devolveu uma narração WAV válida.")
    return wav
  }
  const data = await gemini(key, `models/${TTS_MODEL}:generateContent`, {
    method: "POST",
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Leia o roteiro abaixo em português do Brasil. Estilo: ${styleDesc} Narre apenas o texto entre as marcações.\n<roteiro>\n${text}\n</roteiro>` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  }, request, 120_000)
  const audio = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData
  if (!audio) throw new Error("O Gemini não retornou áudio para esse roteiro.")
  const pcm = Buffer.from(audio.data, "base64")
  if (audio.mimeType?.includes("wav")) return pcm
  const sampleRate = Number(audio.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000)
  if (!pcm.length || pcm.length % 2 || !Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("O áudio do Gemini veio em um formato inesperado.")
  }
  const header = Buffer.alloc(44)
  header.write("RIFF")
  header.writeUInt32LE(pcm.length + 36, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function elevenVoices(key) {
  if (!key) return ELEVEN_VOICES
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return ELEVEN_VOICES
    const data = await res.json()
    const list = (data.voices || []).map((v) => ({
      id: v.voice_id,
      label: `${v.name} · ${v.labels?.accent || v.category || "ElevenLabs"}`,
    }))
    return list.length ? list : ELEVEN_VOICES
  } catch {
    return ELEVEN_VOICES
  }
}

function mp3BufferToWav(mp3Buf) {
  return new Promise(async (resolve, reject) => {
    const id = randomUUID().slice(0, 8)
    const inFile = path.join(os.tmpdir(), `el-${id}.mp3`)
    const outFile = path.join(os.tmpdir(), `el-${id}.wav`)
    try {
      await writeFile(inFile, mp3Buf)
      const child = spawn(ffmpegPath || "ffmpeg", ["-y", "-i", inFile, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", outFile], { windowsHide: true })
      let err = ""
      child.stderr.on("data", (d) => (err += d.toString()))
      child.on("error", reject)
      child.on("close", async (code) => {
        try {
          if (code !== 0) return reject(new Error(`FFmpeg falhou ao converter áudio ElevenLabs: ${err.slice(-300)}`))
          resolve(await readFile(outFile))
        } finally {
          await unlink(inFile).catch(() => {})
          await unlink(outFile).catch(() => {})
        }
      })
    } catch (e) {
      await unlink(inFile).catch(() => {})
      reject(e)
    }
  })
}

export async function generateElevenNarration({ key, text, voice }) {
  if (!key) throw new Error("Configure a chave da ElevenLabs para gerar narração.")
  const voiceId = String(voice || ELEVEN_VOICES[0].id).trim()
  const tryModel = async (model_id, inputText) => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: inputText,
        model_id,
        voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err?.detail?.message || `ElevenLabs HTTP ${res.status}`
      throw Object.assign(new Error(msg), { status: res.status })
    }
    return Buffer.from(await res.arrayBuffer())
  }

  let mp3
  try {
    // eleven_v3 suporta nativamente tags de áudio como [whispers], [excited], [sighs], [laughs], [pauses]
    mp3 = await tryModel("eleven_v3", text)
  } catch (err) {
    if (err.status === 400 || err.status === 404 || err.status === 422) {
      const clean = String(text).replace(/\[[^\]]{1,32}\]\s*/g, "")
      mp3 = await tryModel("eleven_multilingual_v2", clean)
    } else {
      throw err
    }
  }
  return mp3BufferToWav(mp3)
}
