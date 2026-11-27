import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import express from "express"
import { DATA_DIR } from "./config.js"
import { hasSupabase, kvGet, kvSet, sbStorageUpload } from "./db.js"
import { askFallback, parseJsonLoose } from "./opencode.js"
import { askStudioGo, goKey, goModels, validGoModel } from "./studio-go.js"
import { ARLO, ELEVEN_VOICES, elevenVoices, generateElevenNarration, generateNarration, googleVoices, providerKey, VOICE_CATALOG } from "./panel-providers.js"
import { audioDuration } from "./timeline.js"

const LOCAL_FILE = path.join(DATA_DIR, "_cartoon_projects.json")
const ASSETS_FILE = path.join(DATA_DIR, "_cartoon_assets.json")
const AUDIO_DIR = path.join(DATA_DIR, "_cartoon_audio")

const BUILTIN_OBJECTS = new Set([
  "auto", "nenhum", "navio", "iceberg", "timao", "cronometro", "trem", "aviao", "onibus", "carro", "fogo", "dinheiro",
  "bilhete", "feno", "farol", "foguete", "dinossauro", "colheres", "computador", "bau",
])

function enforceVisualRules(cenas, { titulo = "", frases = [] } = {}) {
  const fullStory = `${titulo} ${frases.join(" ")}`
  const isSpaceStory = /espa[cç]o|planeta|astronauta|foguete|gal[aá]xia|universo|lua\b|marte\b|[oó]rbita|alien/i.test(fullStory)
  const isOceanStory = /titanic|oceano|atl[aâ]ntico|pac[ií]fico|iceberg|navio|transatl[aâ]ntico|cruzeiro|submarino|naufr[aá]gio|alto-mar/i.test(fullStory)
  const fallbackCenario = isOceanStory ? "oceano" : "vila"
  const planosAlt = ["medio", "aberto", "medio"]
  const acoesAlt = ["mostrar", "pensando", "assustado", "acenar", "cintura", "parado"]
  const camsAlt = ["aproximar", "pan", "afastar", "automatico"]
  let enforcedFixes = 0

  return {
    cenas: cenas.map((c, i) => {
      const next = { ...c }
      const txt = String(next.texto || "")

      // 1. Proíbe espaço em histórias terrestres
      if (!isSpaceStory && (next.cenario === "espaco" || next.luz === "espaco")) {
        next.cenario = fallbackCenario
        next.luz = /noite|madrugada|escuro/i.test(fullStory) ? "noite" : "dourado"
        enforcedFixes++
      }
      // 2. Proíbe rio em frases oceânicas/mar aberto
      if ((isOceanStory || /oceano|atl[aâ]ntico|iceberg|titanic|navio|mar aberto/i.test(txt)) && next.cenario === "rio") {
        next.cenario = "oceano"
        enforcedFixes++
      }
      // 3. Mapeia timão / cronômetro direto para modelos HD nativos (evita blueprint torto)
      if (/tim[aã]o|volante do navio|leme/i.test(`${txt} ${next.customAssetLabel || ""}`)) {
        next.objeto = "timao"
        next.customAssetId = ""
        next.customAssetLabel = ""
      } else if (/cron[oô]metro|5 segundos/i.test(`${txt} ${next.customAssetLabel || ""}`) && next.customAssetId?.includes("cronometro")) {
        next.objeto = "cronometro"
        next.customAssetId = ""
        next.customAssetLabel = ""
      }
      // 4. Proíbe close quando há objeto central
      const hasObj = Boolean(next.customAssetId || (next.objeto && next.objeto !== "auto" && next.objeto !== "nenhum"))
      if (hasObj && next.plano === "close") {
        next.plano = "medio"
        enforcedFixes++
      }
      // 5. Evita duas cenas seguidas com composição visual idêntica
      if (i > 0) {
        const prev = cenas[i - 1]
        if (prev && next.cenario === prev.cenario && next.plano === prev.plano && next.acao === prev.acao) {
          next.plano = next.plano === "aberto" ? "medio" : "aberto"
          next.camera = camsAlt[i % camsAlt.length]
          next.acao = acoesAlt[(i + 1) % acoesAlt.length]
          enforcedFixes++
        }
      }
      next.textoTela = trimTextoTela(next.textoTela, 28)
      return next
    }),
    enforcedFixes,
  }
}

function trimTextoTela(text, maxLen = 30) {
  const s = String(text || "").replace(/\s+/g, " ").trim()
  if (!s) return ""
  if (s.length <= maxLen) return s
  const words = s.split(" ")
  let out = ""
  for (const w of words) {
    const next = out ? `${out} ${w}` : w
    if (next.length > maxLen) break
    out = next
  }
  return out || words[0].slice(0, maxLen)
}

function slugifyAsset(name) {
  return String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)
}

function readLocalAssets() {
  try {
    if (!fs.existsSync(ASSETS_FILE)) return {}
    return JSON.parse(fs.readFileSync(ASSETS_FILE, "utf8"))
  } catch {
    return {}
  }
}

function writeLocalAssets(map) {
  if (process.env.VERCEL) return
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(map, null, 2), "utf8")
}

async function getAssetsMap() {
  if (hasSupabase()) {
    try {
      const rows = await kvGet("cartoon:assets")
      if (rows && typeof rows === "object") return rows
    } catch {}
  }
  return readLocalAssets()
}

async function saveAssetsMap(updates) {
  const current = await getAssetsMap()
  const merged = { ...current, ...updates }
  const keys = Object.keys(merged)
  if (keys.length > 120) {
    for (const k of keys.slice(0, keys.length - 120)) delete merged[k]
  }
  if (hasSupabase()) {
    await kvSet("cartoon:assets", merged)
  }
  writeLocalAssets(merged)
  return merged
}

function clampNum(v, lo, hi, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def
}

function sanitizeColor(hex, fallback = "#e06d53") {
  const s = String(hex || "").trim()
  return /^#[0-9a-f]{6}$/i.test(s) ? s : fallback
}

function sanitizeBlueprint(raw, id, label) {
  const validTypes = new Set(["box", "cylinder", "cone", "sphere", "torus", "dodecahedron"])
  const validMats = new Set(["toon", "wood", "stone", "roof", "glow"])
  const validAnims = new Set(["none", "bob", "spinX", "spinY", "spinZ", "flicker", "sway"])
  const validScales = new Set(["pequeno", "medio", "grande", "cenario"])
  const validPos = new Set(["lado", "fundo", "ceu"])

  const rawParts = Array.isArray(raw?.parts) ? raw.parts : []
  const parts = rawParts.slice(0, 26).map((p) => {
    const type = validTypes.has(p?.type) ? p.type : "box"
    const pos = Array.isArray(p?.pos) ? p.pos : [0, 0.5, 0]
    const size = Array.isArray(p?.size) ? p.size : [1, 1, 1]
    const rot = Array.isArray(p?.rot) ? p.rot : [0, 0, 0]
    return {
      type,
      pos: [clampNum(pos[0], -6, 6, 0), clampNum(pos[1], -2, 10, 0.5), clampNum(pos[2], -6, 6, 0)],
      size: [clampNum(size[0], 0.08, 8, 1), clampNum(size[1], 0.08, 8, 1), clampNum(size[2], 0.08, 8, 1)],
      rot: [clampNum(rot[0], -360, 360, 0), clampNum(rot[1], -360, 360, 0), clampNum(rot[2], -360, 360, 0)],
      color: sanitizeColor(p?.color),
      material: validMats.has(p?.material) ? p.material : "toon",
      anim: validAnims.has(p?.anim) ? p.anim : "none",
    }
  })
  if (parts.length < 3) return null
  return {
    id,
    label: String(raw?.label || label || id).slice(0, 60),
    escala: validScales.has(raw?.escala) ? raw.escala : "medio",
    posicao: validPos.has(raw?.posicao) ? raw.posicao : "lado",
    parts,
    updatedAt: Date.now(),
  }
}

async function generateCustom3DAssets({ items, titulo, model }) {
  if (!items.length) return {}
  const listDesc = items.map((it) => `- id "${it.id}": ${it.label}`).join("\n")
  const raw = await askAi({
    model,
    text: `Você é um artista/modelador 3D de animação cartoon cel-shaded (estilo Three.js + contorno preto + cores vibrantes).
Crie modelos 3D RICOS e IMEDIATAMENTE RECONHECÍVEIS para o vídeo ${JSON.stringify(titulo)}.
Modelos a criar:
${listDesc}

REGRAS DE ALTA QUALIDADE (OBRIGATÓRIO):
1. Cada modelo DEVE ter entre 12 e 22 peças bem articuladas formando uma silhueta inconfundível e acabamento de cinema cartoon (base/corpo principal + subestruturas + detalhes finos como janelas, molduras, rodas com calotas, chaminés, velas, colunas, escotilhas, olhos, para-choques, bandeiras ou brilhos). NUNCA faça poucos blocos genéricos ou peças soltas flutuando desconectadas!
2. Use coordenadas locais coerentes com a base apoiada em y=0 (centrado em x=0, z=0).
3. Primitivas válidas em "type": "box" | "cylinder" | "cone" | "sphere" | "torus" | "dodecahedron".
4. Materiais válidos em "material":
   - "toon": cel-shaded vibrante com cor hex
   - "wood": textura de madeira do kit (cascos, pontes, móveis, cabos)
   - "stone": textura de pedra do kit (castelos, pirâmides, ruínas, pilares)
   - "roof": telha do kit (telhados, torres)
   - "glow": emissivo brilhante (janelas acesas, lava, farol, energia, telas, escotilhas iluminadas)
5. Animação por peça em "anim": "none" | "bob" | "spinX" | "spinY" | "spinZ" | "flicker" | "sway".
6. "escala": "pequeno" (objeto de mão/mesa), "medio" (veículo/animal/móvel), "grande" (navio/submarino/monumento), "cenario" (vulcão/pirâmide/castelo ao fundo).
7. "posicao": "lado" (ao lado do personagem), "fundo" (estrutura grande atrás), "ceu" (voador no céu).

Exemplo de padrão de qualidade (submarino):
{"assets":[{"id":"submarino-amarelo","label":"Submarino amarelo","escala":"grande","posicao":"lado","parts":[{"type":"cylinder","pos":[0,1.1,0],"size":[1.1,3.2,1.1],"rot":[0,0,90],"color":"#f2c12e","material":"toon","anim":"none"},{"type":"sphere","pos":[1.6,1.1,0],"size":[1.1,1.1,1.1],"rot":[0,0,0],"color":"#f2c12e","material":"toon","anim":"none"},{"type":"sphere","pos":[-1.6,1.1,0],"size":[1.05,1.05,1.05],"rot":[0,0,0],"color":"#d9a21b","material":"toon","anim":"none"},{"type":"cylinder","pos":[0.1,1.9,0],"size":[0.65,0.9,0.65],"rot":[0,0,0],"color":"#e0a91f","material":"toon","anim":"none"},{"type":"cylinder","pos":[0.1,2.55,0],"size":[0.12,0.65,0.12],"rot":[0,0,0],"color":"#3a3f4d","material":"toon","anim":"none"},{"type":"box","pos":[0.25,2.82,0],"size":[0.32,0.14,0.14],"rot":[0,0,0],"color":"#3a3f4d","material":"toon","anim":"none"},{"type":"sphere","pos":[0.55,1.15,0.52],"size":[0.34,0.34,0.14],"rot":[0,0,0],"color":"#8ce0ff","material":"glow","anim":"none"},{"type":"sphere","pos":[-0.25,1.15,0.52],"size":[0.34,0.34,0.14],"rot":[0,0,0],"color":"#8ce0ff","material":"glow","anim":"none"},{"type":"box","pos":[-2.2,1.1,0],"size":[0.1,0.95,0.22],"rot":[0,0,0],"color":"#d93b2b","material":"toon","anim":"spinX"},{"type":"box","pos":[-2.2,1.1,0],"size":[0.1,0.22,0.95],"rot":[0,0,0],"color":"#d93b2b","material":"toon","anim":"spinX"}]}]}

Retorne SOMENTE JSON válido no formato {"assets":[...]}.`,
  })
  const parsed = parseJsonLoose(raw)
  const arr = Array.isArray(parsed?.assets) ? parsed.assets : []
  const created = {}
  for (const it of items) {
    const match = arr.find((a) => slugifyAsset(a?.id || a?.label) === it.id) || (items.length === 1 ? arr[0] : null)
    const clean = match ? sanitizeBlueprint(match, it.id, it.label) : null
    if (clean) created[it.id] = clean
  }
  if (Object.keys(created).length) await saveAssetsMap(created)
  return created
}

function readLocalAll() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return {}
    return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"))
  } catch {
    return {}
  }
}

function writeLocalAll(map) {
  if (process.env.VERCEL) return
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(map, null, 2), "utf8")
}

async function listProjects() {
  if (hasSupabase()) {
    try {
      const rows = await kvGet("cartoon:index")
      if (Array.isArray(rows)) return rows
    } catch {}
  }
  const map = readLocalAll()
  return Object.values(map)
    .map(({ id, titulo, formato, duracao, estilo, criadoEm, atualizadoEm }) => ({ id, titulo, formato, duracao, estilo, criadoEm, atualizadoEm }))
    .sort((a, b) => Date.parse(b.atualizadoEm || b.criadoEm || 0) - Date.parse(a.atualizadoEm || a.criadoEm || 0))
}

async function getProject(id) {
  if (hasSupabase()) {
    try {
      const row = await kvGet(`cartoon:proj:${id}`)
      if (row) return row
    } catch {}
  }
  return readLocalAll()[id] || null
}

async function saveProject(proj) {
  const now = new Date().toISOString()
  const item = { ...proj, atualizadoEm: now, criadoEm: proj.criadoEm || now }
  if (hasSupabase()) {
    await kvSet(`cartoon:proj:${item.id}`, item)
    const index = await listProjects()
    const summary = {
      id: item.id, titulo: item.titulo, formato: item.formato, duracao: item.duracao,
      estilo: item.estilo, criadoEm: item.criadoEm, atualizadoEm: item.atualizadoEm,
    }
    const nextIndex = [summary, ...index.filter((x) => x.id !== item.id)].slice(0, 80)
    await kvSet("cartoon:index", nextIndex)
  }
  if (!process.env.VERCEL) {
    const map = readLocalAll()
    map[item.id] = item
    writeLocalAll(map)
  }
  return item
}

async function deleteProject(id) {
  if (hasSupabase()) {
    const index = await listProjects()
    await kvSet("cartoon:index", index.filter((x) => x.id !== id))
    await kvSet(`cartoon:proj:${id}`, null)
  }
  if (!process.env.VERCEL) {
    const map = readLocalAll()
    delete map[id]
    writeLocalAll(map)
  }
}

async function askAi({ model, text }) {
  if (validGoModel(model) && await goKey()) {
    return askStudioGo({ model, text })
  }
  const out = await askFallback({ models: [model || "opencode-go/deepseek-v4.1-flash"], text, timeoutMs: 90_000 })
  return out.text
}

function cleanSpoken(text) {
  return String(text || "").replace(/\[[^\]]{1,32}\]\s*/g, " ").replace(/\s+/g, " ").trim()
}

function phraseWeight(frase) {
  const s = cleanSpoken(frase)
  const chars = s.replace(/\s+/g, "").length
  const pauses = (s.match(/[.,!?;:…—–-]+/g) || []).length * 4
  return Math.max(8, chars + pauses)
}

function alignPhrasesWeighted(frases, totalDuration) {
  const dur = Math.max(0.5, Number(totalDuration) || 1)
  const weights = frases.map(phraseWeight)
  const totalW = weights.reduce((a, b) => a + b, 0) || 1
  const pad = Math.min(0.08, dur * 0.02)
  const usable = Math.max(0.4, dur - pad * 2)
  let cursor = pad
  return frases.map((_, i) => {
    const span = (weights[i] / totalW) * usable
    const inicio = Math.round(cursor * 1000) / 1000
    cursor += span
    const fim = Math.round(cursor * 1000) / 1000
    return { fraseIndex: i, inicio, fim }
  })
}

function alignWordsWithinRanges(frases, ranges) {
  const out = []
  frases.forEach((f, fIdx) => {
    const tokens = cleanSpoken(f).split(/\s+/).filter(Boolean)
    const r = ranges[fIdx] || { inicio: 0, fim: 1 }
    if (!tokens.length) return
    const spanTotal = Math.max(0.2, r.fim - r.inicio)
    const weights = tokens.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.!?…]$/.test(w) ? 2.5 : /[,;:]$/.test(w) ? 1.2 : 0))
    const totalW = weights.reduce((a, b) => a + b, 0) || 1
    let cur = r.inicio
    tokens.forEach((palavra) => {
      const span = (weights.shift() / totalW) * spanTotal
      const inicio = Math.round(cur * 1000) / 1000
      cur += span
      const fim = Math.round(Math.min(r.fim, cur) * 1000) / 1000
      out.push({ palavra, inicio, fim, fraseIndex: fIdx })
    })
  })
  return out
}

function extractTimingFromElevenAlignment(frases, alignment, totalDuration) {
  const chars = alignment?.characters
  const starts = alignment?.character_start_times_seconds
  const ends = alignment?.character_end_times_seconds
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) || !chars.length) return null

  const cleanStream = []
  let inTag = false
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === "[") { inTag = true; continue }
    if (ch === "]") { inTag = false; continue }
    if (inTag || /\s/.test(ch)) continue
    cleanStream.push({ ch: ch.toLowerCase(), s: Number(starts[i]) || 0, e: Number(ends[i]) || 0 })
  }
  if (!cleanStream.length) return null

  const palavras = []
  const ranges = []
  let ptr = 0
  for (let fIdx = 0; fIdx < frases.length; fIdx++) {
    const tokens = cleanSpoken(frases[fIdx]).split(/\s+/).filter(Boolean)
    let fStart = null
    let fEnd = null
    for (const palavra of tokens) {
      const len = palavra.replace(/\s+/g, "").length
      if (!len) continue
      const wStartIdx = Math.min(ptr, cleanStream.length - 1)
      const wEndIdx = Math.min(cleanStream.length - 1, ptr + len - 1)
      const inicio = Math.round(cleanStream[wStartIdx].s * 1000) / 1000
      const fim = Math.round(Math.max(inicio + 0.05, cleanStream[wEndIdx].e) * 1000) / 1000
      palavras.push({ palavra, inicio, fim, fraseIndex: fIdx })
      if (fStart === null) fStart = inicio
      fEnd = fim
      ptr = Math.min(cleanStream.length, ptr + len)
    }
    const prevEnd = ranges.length ? ranges[ranges.length - 1].fim : 0
    const s = fStart !== null ? fStart : prevEnd
    const e = fEnd !== null ? Math.max(s + 0.2, fEnd) : Math.min(totalDuration, s + 0.4)
    ranges.push({ fraseIndex: fIdx, inicio: s, fim: Math.min(totalDuration, e) })
  }
  return ranges.length === frases.length && palavras.length ? { ranges, palavras } : null
}

function alignPhrasesFromWavSilence(wavBuffer, frases, duration) {
  const fallback = alignPhrasesWeighted(frases, duration)
  if (!wavBuffer || wavBuffer.length <= 44 || wavBuffer.toString("ascii", 0, 4) !== "RIFF" || frases.length <= 1) {
    return fallback
  }
  try {
    const sampleRate = wavBuffer.readUInt32LE(24) || 24000
    const samples = Math.floor((wavBuffer.length - 44) / 2)
    const winSamples = Math.max(1, Math.round(sampleRate * 0.04)) // 40ms frames
    const silences = []
    let silStart = -1
    for (let i = 0; i < samples; i += winSamples) {
      const count = Math.min(winSamples, samples - i)
      let sum = 0
      for (let j = 0; j < count; j++) {
        const s = wavBuffer.readInt16LE(44 + (i + j) * 2) / 32768
        sum += s * s
      }
      const rms = Math.sqrt(sum / count)
      const t = i / sampleRate
      if (rms < 0.018) {
        if (silStart < 0) silStart = t
      } else if (silStart >= 0) {
        const durSil = t - silStart
        if (durSil >= 0.16 && silStart > 0.25 && t < duration - 0.25) {
          silences.push({ mid: (silStart + t) / 2, start: silStart, end: t, dur: durSil })
        }
        silStart = -1
      }
    }
    if (!silences.length) return fallback

    // Ajusta cada fronteira prevista (fallback[i].fim) para a pausa real mais próxima dentro de +-1.4s
    const cuts = [0.06]
    for (let i = 0; i < frases.length - 1; i++) {
      const expected = fallback[i].fim
      const prevCut = cuts[cuts.length - 1]
      let best = null
      let bestScore = Infinity
      for (const s of silences) {
        if (s.mid <= prevCut + 0.35 || s.mid >= duration - 0.35) continue
        const dist = Math.abs(s.mid - expected)
        if (dist <= 1.45) {
          const score = dist - Math.min(0.4, s.dur * 0.35)
          if (score < bestScore) { bestScore = score; best = s }
        }
      }
      cuts.push(best ? Math.round(best.mid * 1000) / 1000 : expected)
    }
    cuts.push(Math.round(Math.max(cuts[cuts.length - 1] + 0.2, duration - 0.06) * 1000) / 1000)

    return frases.map((_, i) => ({
      fraseIndex: i,
      inicio: cuts[i],
      fim: Math.max(cuts[i] + 0.2, cuts[i + 1]),
    }))
  } catch {
    return fallback
  }
}

export function cartoonRoutes() {
  const router = express.Router()
  const route = (fn) => async (req, res) => {
    try { await fn(req, res) }
    catch (e) { res.status(e.status || 500).json({ error: e.message || "Erro interno" }) }
  }

  router.get("/config", route(async (_req, res) => {
    const [gemini, elevenlabs, go, models] = await Promise.all([
      providerKey("gemini"),
      providerKey("elevenlabs"),
      goKey(),
      goModels(),
    ])
    res.json({
      gemini: Boolean(gemini),
      elevenlabs: Boolean(elevenlabs),
      go: Boolean(go),
      supabase: hasSupabase(),
      vercel: Boolean(process.env.VERCEL),
      models: Object.keys(models).sort(),
      modelCatalog: models,
      googleVoices: [ARLO, ...VOICE_CATALOG],
      elevenVoices: ELEVEN_VOICES,
      sounds: ["clique.wav", "ding.wav", "impacto.wav", "pop.wav", "subida.wav", "surpresa.wav", "trilha_curiosa.wav", "whoosh.wav"],
    })
  }))

  router.get("/vozes", route(async (req, res) => {
    if (req.query.provider === "elevenlabs") {
      return res.json(await elevenVoices(await providerKey("elevenlabs")))
    }
    const key = await providerKey("gemini")
    if (!key) return res.json([ARLO, ...VOICE_CATALOG])
    try {
      res.json(await googleVoices(key))
    } catch {
      res.json([ARLO, ...VOICE_CATALOG])
    }
  }))

  router.get("/projetos", route(async (_req, res) => {
    res.json({ projects: await listProjects() })
  }))

  router.get("/projetos/:id", route(async (req, res) => {
    const proj = await getProject(req.params.id)
    if (!proj) return res.status(404).json({ error: "Projeto não encontrado." })
    res.json({ project: proj })
  }))

  router.post("/projetos", route(async (req, res) => {
    const body = req.body || {}
    const id = body.id || `crt-${randomUUID().slice(0, 8)}`
    const saved = await saveProject({ ...body, id })
    res.json({ project: saved })
  }))

  router.delete("/projetos/:id", route(async (req, res) => {
    await deleteProject(req.params.id)
    res.json({ ok: true })
  }))

  router.post("/ideias", route(async (req, res) => {
    const tema = String(req.body?.tema || "curiosidades e histórias incríveis").trim().slice(0, 300)
    const formato = String(req.body?.formato || "automático").trim()
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    const raw = await askAi({
      model,
      text: `Crie 10 ideias originais de vídeos animados curtos (Shorts/Reels) em português do Brasil sobre: ${JSON.stringify(tema)}.
Formato preferido: ${formato}.
Cada ideia precisa ter gancho forte, conflito/curiosidade visual e virada.
Retorne SOMENTE JSON válido: {"ideias":[{"titulo":"...","premissa":"frase curta para o pedido","formato":"História com virada|Curiosidade curta|E se...?|Você dentro da situação"}]}.`,
    })
    const parsed = parseJsonLoose(raw)
    if (!Array.isArray(parsed?.ideias) || !parsed.ideias.length) {
      throw new Error("O modelo não retornou ideias válidas.")
    }
    res.json({ ideias: parsed.ideias.slice(0, 10) })
  }))

  router.post("/roteiro", route(async (req, res) => {
    const ideia = String(req.body?.ideia || "").trim().slice(0, 2000)
    if (!ideia) return res.status(400).json({ error: "Descreva a ideia do vídeo." })
    const formato = String(req.body?.formato || "automático").trim()
    const duracao = Math.max(15, Math.min(120, Number(req.body?.duracao) || 45))
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    const targetWords = Math.round(duracao * 2.6)
    const tagInstr = ttsProvider === "elevenlabs"
      ? `Inclua tags expressivas da ElevenLabs v3 inline onde fizer sentido emocional (ex.: [curious], [excited], [whispers], [sighs], [gasp], [pauses]).`
      : `Escreva apenas texto falado limpo, SEM rubricas, SEM "Visual:" e SEM tags entre colchetes.`

    const raw = await askAi({
      model,
      text: `Você é roteirista de animações cartoon 3D virais (estilo YouTube Shorts / TikTok).
Ideia: ${JSON.stringify(ideia)}
Formato narrativo: ${formato}
Duração alvo: ${duracao} segundos (~${targetWords} palavras no total).
${tagInstr}
REGRAS DE QUALIDADE:
- Escreva em português do Brasil PERFEITO, revise ortografia com rigor (nunca invente palavras).
- Divida o roteiro em frases curtas (de 8 a 16 frases, cada frase vira uma cena visual clara).
- Comece com um gancho impossível ou pergunta forte nos 2 primeiros segundos, tenha escalada e virada.
Retorne SOMENTE JSON válido: {"titulo":"Título curto e forte","frases":["frase 1","frase 2",...],"cenarioPrincipal":"oceano|vila|floresta|cidade|rio|estrada|espaco|praia|sala"}.`,
    })
    const parsed = parseJsonLoose(raw)
    const frases = Array.isArray(parsed?.frases) ? parsed.frases.map((f) => String(f).trim()).filter(Boolean) : []
    if (!frases.length) throw new Error("O modelo não retornou frases de roteiro.")
    res.json({
      titulo: String(parsed?.titulo || ideia).slice(0, 100),
      frases,
      cenarioPrincipal: parsed?.cenarioPrincipal || "vila",
    })
  }))

  router.post("/storyboard", route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Novo vídeo").trim()
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    const cenarioPrincipal = String(req.body?.cenarioPrincipal || "vila")
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    if (!frases.length) return res.status(400).json({ error: "Envie as frases do roteiro." })

    const raw = await askAi({
      model,
      text: `Você é diretor de storyboard cartoon 3D. Para CADA uma das ${frases.length} frases abaixo, defina a cena visual exata para que o espectador VEJA a história acontecendo.
Título: ${JSON.stringify(titulo)} | Cenário base: ${cenarioPrincipal}
Frases:
${frases.map((f, i) => `${i + 1}. ${f}`).join("\n")}

REGRAS OBRIGATÓRIAS DE DIREÇÃO VISUAL (SEJA 100% FIEL AO ROTEIRO):
1. Cada cena PRECISA representar literalmente o local e o evento da frase:
   - Use "oceano" para alto-mar, navios, Titanic, icebergs, cruzeiros, mar aberto (personagens ficam no convés do navio sobre o mar!).
   - Use "rio" APENAS para rios terrestres com ponte/margens. NUNCA use "rio" para oceano/alto-mar!
   - Use "espaco" APENAS se a história falar literalmente de espaço, astronautas, planetas ou galáxias. PROIBIDO usar "espaco" como metáfora em histórias na Terra!
   - Mantenha consistência de "luz" ("noite", "dia", "dourado") com o momento da história (ex.: se a cena se passa à noite, use "noite" inclusive em "sala"!).
2. Use "objeto" quando a frase citar literalmente: navio, iceberg, trem, avião, ônibus, carro, fogo, bilhete, dinheiro, feno, foguete, dinossauro, computador, baú, farol ou colheres. NUNCA coloque um objeto aleatório que a frase não mencionou!
3. Se a frase exigir um elemento visual importante fora da lista fixa (ex.: submarino, vulcão, pirâmide, castelo, timão, cronômetro), preencha "objetoNovo" com nome curto claro. Caso contrário, "objetoNovo": "".
4. Se a cena tem "objeto" ou "objetoNovo" importante, use "plano": "medio" ou "aberto" (NUNCA "close", para não esconder o objeto!).
5. "textoTela" deve ser CURTO e INTEIRO (máximo 2 a 4 palavras impactantes, ex.: "14 DE ABRIL, 1912", "ICEBERG À FRENTE!", "5 SEGUNDOS"). Nunca coloque frases inteiras em "textoTela".

Opções válidas para cada campo:
- cenario: "oceano" | "vila" | "praia" | "floresta" | "cidade" | "rio" | "estrada" | "espaco" | "sala"
- atividade: "nenhuma" | "comer" | "pescar" | "correr" | "observar" | "trabalhar" | "voar"
- objeto: "auto" | "nenhum" | "navio" | "iceberg" | "trem" | "aviao" | "onibus" | "carro" | "fogo" | "dinheiro" | "bilhete" | "feno" | "farol" | "foguete" | "dinossauro" | "colheres" | "computador" | "bau"
- objetoNovo: string curta opcional com elemento 3D inédito (ou "")
- plano: "aberto" | "medio" | "close"
- foco: "silas" | "pedro" | "maria" | "joao" | "farol" | "dinossauro" | "foguete"
- acao: "parado" | "mostrar" | "andar" | "correr" | "debochar" | "acenar" | "assustado" | "cintura" | "barriga" | "pensando" | "bochecha" | "cruzado" | "joinha" | "comemorar"
- expressao: "(da ação)" | "neutro" | "feliz" | "alivio" | "desconfiado" | "teimoso" | "nervoso" | "surpreso" | "assustado" | "rindo"
- efeito: "nenhum" | "tremor" | "zoom" | "flash" | "suor"
- luz: "dia" | "dourado" | "noite" | "espaco"
- camera: "automatico" | "fixa" | "aproximar" | "afastar" | "pan"
- eventoCenario: "nenhum" | "onda" | "raio" | "fumaca" | "estrelas"
- quemAparece: array com 1 a 4 de ["silas", "pedro", "maria", "joao"]

Retorne SOMENTE JSON válido: {"cenas":[{"fraseIndex":0,"cenario":"oceano","atividade":"observar","objeto":"navio","objetoNovo":"","plano":"aberto","foco":"silas","acao":"parado","expressao":"(da ação)","efeito":"nenhum","luz":"noite","camera":"automatico","textoTela":"14 DE ABRIL, 1912","quemAparece":["silas"],"eventoCenario":"estrelas","virada":false}]}.`,
    })
    const parsed = parseJsonLoose(raw)
    let rawCenas = Array.isArray(parsed?.cenas) ? parsed.cenas : []

    // 2ª passada obrigatória: Auditoria e Validação de Coerência pela IA cena por cena
    let fixesCount = 0
    try {
      const draftSummary = frases.map((texto, i) => {
        const c = rawCenas[i] || {}
        return {
          i,
          frase: texto,
          cenario: c.cenario || cenarioPrincipal,
          luz: c.luz || "dia",
          plano: c.plano || "medio",
          objeto: c.objeto || "auto",
          objetoNovo: c.objetoNovo || "",
          acao: c.acao || "parado",
          textoTela: c.textoTela || "",
        }
      })
      const auditRaw = await askAi({
        model,
        text: `Você é AUDITOR DE QUALIDADE de direção de arte 3D. Revise RIGOROSAMENTE cada cena abaixo contra o roteiro da história ${JSON.stringify(titulo)}.
Cenas propostas:
${JSON.stringify(draftSummary)}

REGRAS DE AUDITORIA (CORRIJA QUALQUER ERRO):
1. Se a história NÃO for sobre espaço/astronomia, PROIBIDO cenario="espaco" ou luz="espaco" — troque pelo cenário real da frase!
2. Se a frase falar de mar aberto, oceano, Atlântico, navio, Titanic, iceberg ou convés, cenario DEVE ser "oceano" (nunca "rio"!).
3. Se a cena tem objeto/objetoNovo importante, plano NÃO pode ser "close" (use "medio" ou "aberto").
4. Se "objeto" não tiver relação literal com a frase (ex.: "bilhete" sem falar de bilhete/loteria), troque para "nenhum" ou pelo objeto certo da frase.
5. "textoTela" deve ter no máximo 2 a 4 palavras completas e impactantes (nunca frase longa cortada).
6. Garanta que "luz" ("noite" / "dia" / "dourado") combine com o momento da história.

Retorne SOMENTE JSON válido listando SOMENTE as cenas que precisam de correção (ou array vazio se todas estiverem perfeitas):
{"correcoes":[{"i":0,"cenario":"oceano","luz":"noite","plano":"aberto","objeto":"navio","objetoNovo":"","acao":"assustado","textoTela":"ICEBERG À FRENTE!","motivo":"..."}]}.`,
      })
      const auditParsed = parseJsonLoose(auditRaw)
      const correcoes = Array.isArray(auditParsed?.correcoes) ? auditParsed.correcoes : []
      for (const fix of correcoes) {
        const idx = Number(fix?.i)
        if (!Number.isInteger(idx) || idx < 0 || idx >= frases.length) continue
        const cur = rawCenas[idx] || {}
        rawCenas[idx] = {
          ...cur,
          ...(fix.cenario ? { cenario: fix.cenario } : {}),
          ...(fix.luz ? { luz: fix.luz } : {}),
          ...(fix.plano ? { plano: fix.plano } : {}),
          ...(fix.objeto !== undefined ? { objeto: fix.objeto } : {}),
          ...(fix.objetoNovo !== undefined ? { objetoNovo: fix.objetoNovo } : {}),
          ...(fix.acao ? { acao: fix.acao } : {}),
          ...(fix.textoTela !== undefined ? { textoTela: fix.textoTela } : {}),
          _auditMotivo: String(fix.motivo || "ajustado pela auditoria IA"),
        }
        fixesCount++
      }
    } catch {}

    const assetLibrary = await getAssetsMap()
    const neededMap = new Map()
    const cenas = frases.map((texto, i) => {
      const c = rawCenas[i] || {}
      const novoLabel = String(c.objetoNovo || "").trim().slice(0, 60)
      const novoSlug = novoLabel ? slugifyAsset(novoLabel) : ""
      const isCustom = novoSlug && !BUILTIN_OBJECTS.has(novoSlug)
      if (isCustom && !neededMap.has(novoSlug) && neededMap.size < 5) {
        neededMap.set(novoSlug, { id: novoSlug, label: novoLabel })
      }
      const chosenObj = isCustom ? "auto" : (c.objeto || "auto")
      const hasMajorObj = isCustom || (chosenObj && chosenObj !== "auto" && chosenObj !== "nenhum")
      const chosenPlano = hasMajorObj && c.plano === "close" ? "medio" : (c.plano || (i % 3 === 1 ? "close" : i % 3 === 2 ? "aberto" : "medio"))
      return {
        id: `cena-${i + 1}`,
        fraseIndex: i,
        texto,
        cenario: c.cenario || cenarioPrincipal || "praia",
        atividade: c.atividade || "nenhuma",
        objeto: chosenObj,
        customAssetId: isCustom && neededMap.has(novoSlug) ? novoSlug : "",
        customAssetLabel: isCustom && neededMap.has(novoSlug) ? novoLabel : "",
        plano: chosenPlano,
        foco: c.foco || "silas",
        acao: c.acao || "parado",
        expressao: c.expressao || "(da ação)",
        efeito: c.efeito || "nenhum",
        luz: c.luz || "dia",
        camera: c.camera || "automatico",
        textoTela: trimTextoTela(c.textoTela, 30),
        quemAparece: Array.isArray(c.quemAparece) && c.quemAparece.length ? c.quemAparece : ["silas"],
        eventoCenario: c.eventoCenario || "nenhum",
        virada: Boolean(c.virada),
        auditado: true,
      }
    })

    const { cenas: finalCenas, enforcedFixes } = enforceVisualRules(cenas, { titulo, frases })

    const customAssets = {}
    const toGenerate = []
    for (const [id, info] of neededMap.entries()) {
      if (!finalCenas.some((c) => c.customAssetId === id)) continue
      if (assetLibrary[id]) customAssets[id] = assetLibrary[id]
      else toGenerate.push(info)
    }
    if (toGenerate.length) {
      const generated = await generateCustom3DAssets({ items: toGenerate, titulo, model })
      Object.assign(customAssets, generated)
    }

    res.json({ cenas: finalCenas, customAssets, validation: { audited: true, fixes: fixesCount + enforcedFixes } })
  }))

  // Inspetor Visual Multimodal via OpenCode Go (usa exclusivamente modelos OpenCode Go com suporte a imagem)
  router.post("/inspecionar-quadros", route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Cartoon Short").trim()
    const cenas = Array.isArray(req.body?.cenas) ? req.body.cenas : []
    const rawImg = String(req.body?.imageBase64 || "").trim()
    const requestedModel = String(req.body?.model || "opencode-go/gpt-6-luna").trim()
    if (!rawImg || !cenas.length || !(await goKey())) {
      return res.json({ inspected: false, correcoes: [] })
    }
    const imageUrl = rawImg.startsWith("data:") ? rawImg : `data:image/jpeg;base64,${rawImg}`
    const catalog = await goModels().catch(() => ({}))
    const supportsImage = (m) => (catalog[m]?.input || []).some((t) => String(t).startsWith("image/"))
    const visionModel = validGoModel(requestedModel) && supportsImage(requestedModel)
      ? requestedModel
      : supportsImage("opencode-go/gpt-6-luna")
      ? "opencode-go/gpt-6-luna"
      : "opencode-go/gemini-4-argon"

    const lista = cenas.map((c, i) => `${i + 1}. frase="${c.texto}" | atual: cenario=${c.cenario}, luz=${c.luz}, plano=${c.plano}, objeto=${c.objeto}, acao=${c.acao}`).join("\n")
    const prompt = `Você é DIRETOR DE QUALIDADE VISUAL de animação 3D.
A imagem anexa é um mosaico numerado (1, 2, 3...) com os QUADROS REAIS renderizados do vídeo ${JSON.stringify(titulo)}.
Cenas atuais:
${lista}

OLHE CADA QUADRO NUMERADO NA IMAGEM e detecte qualquer problema real:
- Cenário incompatível com a frase (ex.: rio/floresta/espaço no lugar errado, sala de dia numa cena noturna)
- Objeto 3D errado, estranho ou desconexo com a frase
- Duas cenas seguidas praticamente idênticas visualmente
- Personagem ou enquadramento ruim para a ação da frase

Retorne SOMENTE JSON válido listando SOMENTE as cenas (índice 0-based "i") que precisam melhorar, usando ESTRITAMENTE valores válidos:
- cenario: "oceano" | "praia" | "vila" | "floresta" | "cidade" | "rio" | "estrada" | "espaco" | "sala"
- luz: "dia" | "dourado" | "noite" | "espaco"
- plano: "aberto" | "medio" | "close"
- objeto: "auto" | "nenhum" | "navio" | "iceberg" | "timao" | "cronometro" | "trem" | "aviao" | "onibus" | "carro" | "fogo" | "dinheiro" | "bilhete" | "feno" | "farol" | "foguete" | "dinossauro" | "colheres" | "computador" | "bau"
- acao: "parado" | "mostrar" | "andar" | "correr" | "debochar" | "acenar" | "assustado" | "cintura" | "barriga" | "pensando" | "bochecha" | "cruzado" | "joinha" | "comemorar"
- camera: "automatico" | "fixa" | "aproximar" | "afastar" | "pan"
Formato: {"correcoes":[{"i":0,"cenario":"oceano","luz":"noite","plano":"medio","objeto":"navio","acao":"assustado","camera":"aproximar","motivo":"..."}]}`

    const validCenarios = new Set(["oceano", "praia", "vila", "floresta", "cidade", "rio", "estrada", "espaco", "sala"])
    const validLuz = new Set(["dia", "dourado", "noite", "espaco"])
    const validPlano = new Set(["aberto", "medio", "close"])
    const validAcao = new Set(["parado", "mostrar", "andar", "correr", "debochar", "acenar", "assustado", "cintura", "barriga", "pensando", "bochecha", "cruzado", "joinha", "comemorar"])
    const validCam = new Set(["automatico", "fixa", "aproximar", "afastar", "pan"])

    try {
      const reply = await askStudioGo({ model: visionModel, text: prompt, image: imageUrl, timeoutMs: 45_000 })
      const parsed = parseJsonLoose(reply)
      const correcoes = (Array.isArray(parsed?.correcoes) ? parsed.correcoes : []).map((f) => ({
        i: Number(f?.i),
        ...(validCenarios.has(f?.cenario) ? { cenario: f.cenario } : {}),
        ...(validLuz.has(f?.luz) ? { luz: f.luz } : {}),
        ...(validPlano.has(f?.plano) ? { plano: f.plano } : {}),
        ...(BUILTIN_OBJECTS.has(f?.objeto) ? { objeto: f.objeto } : {}),
        ...(validAcao.has(f?.acao) ? { acao: f.acao } : {}),
        ...(validCam.has(f?.camera) ? { camera: f.camera } : {}),
        motivo: String(f?.motivo || ""),
      })).filter((f) => Number.isInteger(f.i) && f.i >= 0 && f.i < cenas.length)
      res.json({ inspected: true, model: visionModel, correcoes })
    } catch {
      res.json({ inspected: false, correcoes: [] })
    }
  }))

  router.post("/ativo-3d", route(async (req, res) => {
    const nome = String(req.body?.nome || "").trim().slice(0, 60)
    const titulo = String(req.body?.titulo || nome || "Cartoon Short").trim()
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    const forceNew = Boolean(req.body?.forceNew)
    if (!nome) return res.status(400).json({ error: "Informe o nome do objeto 3D a criar." })
    const id = slugifyAsset(nome)
    if (!id) return res.status(400).json({ error: "Nome inválido para objeto 3D." })

    if (!forceNew) {
      const lib = await getAssetsMap()
      if (lib[id]) return res.json({ id, blueprint: lib[id], cached: true })
    }
    const created = await generateCustom3DAssets({ items: [{ id, label: nome }], titulo, model })
    if (!created[id]) throw new Error("A IA não conseguiu montar o modelo 3D. Tente novamente.")
    res.json({ id, blueprint: created[id], cached: false })
  }))

  router.post(
    "/midia/:projectId/:kind",
    express.raw({ type: ["video/mp4", "video/webm", "image/png", "image/jpeg", "application/octet-stream"], limit: "45mb" }),
    route(async (req, res) => {
      const projectId = String(req.params.projectId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 48)
      const kind = req.params.kind === "cover" ? "cover" : "video"
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      if (!projectId || !buf.length) return res.status(400).json({ error: "Mídia vazia ou projeto inválido." })
      const contentType = String(req.headers["content-type"] || (kind === "cover" ? "image/png" : "video/mp4")).split(";")[0]
      const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : contentType.includes("webm") ? "webm" : "mp4"
      const folder = kind === "cover" ? "covers" : "videos"
      const fileName = `${projectId}.${ext}`
      let url = ""
      if (hasSupabase()) {
        url = await sbStorageUpload("cartoon-media", `${folder}/${fileName}`, buf, contentType)
      } else if (!process.env.VERCEL) {
        const dir = path.join(DATA_DIR, "_cartoon_media", folder)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, fileName), buf)
        url = `/p/_cartoon_media/${folder}/${fileName}`
      }
      res.json({ url, kind, bytes: buf.length })
    })
  )

  router.post("/youtube-pack", route(async (req, res) => {
    const titulo = String(req.body?.titulo || "Cartoon Short").trim()
    const ideia = String(req.body?.ideia || titulo).trim()
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    const duration = Math.max(10, Number(req.body?.duration) || 45)
    const model = req.body?.model || "opencode-go/deepseek-v4.1-flash"
    if (!frases.length) return res.status(400).json({ error: "Envie o roteiro do vídeo." })

    const customRanges = Array.isArray(req.body?.cenasTiming) && req.body.cenasTiming.length === frases.length ? req.body.cenasTiming : alignPhrasesWeighted(frases, duration)
    const timeline = frases.map((f, i) => {
      const r = customRanges[i] || { inicio: 0, fim: 1 }
      return `${Number(r.inicio).toFixed(1)}s-${Number(r.fim).toFixed(1)}s: ${f}`
    }).join("\n")

    const raw = await askAi({
      model,
      text: `Você é estrategista de YouTube Shorts (Playbook v2). Crie o pacote completo de publicação para este curta animado.
Escreva TODO o texto em português do Brasil perfeito, revise ortografia com rigor.
Título atual: ${JSON.stringify(titulo)} | Ideia: ${JSON.stringify(ideia)}
Cenas com timestamps:
${timeline}

Gere em JSON válido:
- tituloYt: título curto de alto CTR para YouTube Shorts (em português)
- tituloAlt: título alternativo curioso (em português)
- descricao: descrição curta atrativa + 5 hashtags (#shorts #animacao #curiosidades etc.)
- textoCapa: exatamente 2 a 3 palavras impactantes em MAIÚSCULAS para a Thumbnail 9:16
- dublagem: roteiro completo de dublagem em INGLÊS sincronizado com os timestamps acima, + parágrafo corrido pronto para colar no ElevenLabs
- thumbnailPrompt: prompt detalhado em inglês para gerar capa 9:16 HD no estilo exato (flat 2D minimalist bean-head toon characters, thick black ink outlines, NO noses, simple expressive eyes, blocky cel-shaded 3D ink-outlined world, bright high-contrast colors, bold 2-3 word hook text at top center)

Retorne SOMENTE JSON válido: {"tituloYt":"...","tituloAlt":"...","descricao":"...","textoCapa":"...","dublagem":{"timestamps":"...","elevenlabs":"..."},"thumbnailPrompt":"..."}.`,
    })
    const parsed = parseJsonLoose(raw) || {}
    res.json({
      tituloYt: parsed.tituloYt || titulo,
      tituloAlt: parsed.tituloAlt || `${titulo} (Você não esperava isso!)`,
      descricao: parsed.descricao || `${ideia}\n\n#shorts #animacao #historia #curiosidades`,
      textoCapa: String(parsed.textoCapa || titulo.split(/\s+/).slice(0, 3).join(" ")).toUpperCase(),
      dublagem: {
        timestamps: parsed.dublagem?.timestamps || timeline,
        elevenlabs: parsed.dublagem?.elevenlabs || frases.join(" "),
      },
      thumbnailPrompt: parsed.thumbnailPrompt || `9:16 vertical YouTube Shorts thumbnail, flat 2D minimalist bean-head cartoon character with smooth round head, NO nose, thin black stick arms, thick ink outline, inside colorful cel-shaded 3D outlined world, dramatic lighting, bold uppercase text "${String(titulo).slice(0, 22)}" at top center.`,
    })
  }))

  router.post("/voz", route(async (req, res) => {
    const frases = Array.isArray(req.body?.frases) ? req.body.frases.map((f) => String(f).trim()).filter(Boolean) : []
    if (!frases.length) return res.status(400).json({ error: "O roteiro está vazio." })
    const ttsProvider = req.body?.ttsProvider === "elevenlabs" ? "elevenlabs" : "google"
    const voice = String(req.body?.voice || (ttsProvider === "elevenlabs" ? ELEVEN_VOICES[0].id : "Kore")).trim()
    const fullText = frases.join(" ")
    const geminiKey = await providerKey("gemini")

    let audioBuffer
    let mimeType = "audio/wav"
    let ext = "wav"
    let elevenAlignment = null
    if (ttsProvider === "elevenlabs") {
      const out = await generateElevenNarration({ key: await providerKey("elevenlabs"), text: fullText, voice, withTimestamps: true })
      audioBuffer = out.audioBuffer
      mimeType = out.mimeType || "audio/mpeg"
      ext = mimeType.includes("mpeg") ? "mp3" : "wav"
      elevenAlignment = out.alignment
    } else {
      audioBuffer = await generateNarration({ key: geminiKey, text: cleanSpoken(fullText), voice })
    }

    const fileName = `voz-${randomUUID().slice(0, 10)}.${ext}`
    let audioUrl = ""
    let duration = 0

    if (ext === "wav" && audioBuffer.length > 44) {
      const byteRate = audioBuffer.readUInt32LE(28) || 48000
      duration = Math.max(1, Math.round(((audioBuffer.length - 44) / byteRate) * 100) / 100)
    } else if (elevenAlignment?.character_end_times_seconds?.length) {
      const ends = elevenAlignment.character_end_times_seconds
      duration = Math.max(1, Math.round((Number(ends[ends.length - 1]) + 0.25) * 100) / 100)
    }

    if (!process.env.VERCEL) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true })
      const outPath = path.join(AUDIO_DIR, fileName)
      fs.writeFileSync(outPath, audioBuffer)
      if (!(duration > 0)) duration = await audioDuration(outPath).catch(() => 0)
      audioUrl = `/p/_cartoon_audio/${fileName}`
    }
    if (hasSupabase()) {
      try {
        const publicUrl = await sbStorageUpload("cartoon-media", `audio/${fileName}`, audioBuffer, mimeType)
        if (publicUrl) audioUrl = publicUrl
      } catch {}
    }
    if (!(duration > 0)) {
      // Fallback 128kbps MP3 (16000 B/s) ou 24kHz WAV (48000 B/s)
      const rate = ext === "mp3" ? 16000 : 48000
      duration = Math.max(1, Math.round((audioBuffer.length / rate) * 100) / 100)
    }

    let cenasTiming = null
    let palavras = null
    if (elevenAlignment) {
      const aligned = extractTimingFromElevenAlignment(frases, elevenAlignment, duration)
      if (aligned) {
        cenasTiming = aligned.ranges
        palavras = aligned.palavras
      }
    }
    if (!cenasTiming && ext === "wav") {
      // Alinhamento local direto pelas pausas de silêncio do WAV (zero chamada extra à API do Google)
      cenasTiming = alignPhrasesFromWavSilence(audioBuffer, frases, duration)
    }
    if (!cenasTiming) {
      cenasTiming = alignPhrasesWeighted(frases, duration)
    }
    if (!palavras) {
      palavras = alignWordsWithinRanges(frases, cenasTiming)
    }

    // Evita estourar limite de 4,5 MB da resposta Serverless na Vercel quando já há audioUrl (Supabase Storage)
    const sendBase64 = !audioUrl || (!process.env.VERCEL && audioBuffer.length < 2_400_000)
    const audioBase64 = sendBase64 ? `data:${mimeType};base64,${audioBuffer.toString("base64")}` : ""
    res.json({ audioUrl, audioBase64, mimeType, duration, palavras, cenasTiming, ttsProvider, voice })
  }))

  return router
}
