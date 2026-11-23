import { execFile } from "node:child_process"
import { promisify } from "node:util"
import ffmpegPath from "ffmpeg-static"

const execFileP = promisify(execFile)

/** Duração real do áudio via stderr do ffmpeg (ffmpeg-static não traz ffprobe). */
export async function audioDuration(file) {
  try {
    const { stderr } = await execFileP(ffmpegPath, ["-hide_banner", "-i", file], { windowsHide: true })
    return parseDuration(stderr)
  } catch (e) {
    return parseDuration(String(e?.stderr ?? ""))
  }
}

function parseDuration(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text || "")
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

const PUNCT = /[.,!?;:…]$/

/**
 * Agrupa palavras (com timestamp real do Whisper) em blocos de legenda curtos.
 * O tempo nunca é inventado: cada bloco começa e termina na palavra real.
 */
export function buildChunks(whisper, { maxWords = 3, maxChars = 16, maxDur = 2.4, minDur = 0.6 } = {}) {
  const words = []
  for (const seg of whisper.segments || []) {
    for (const w of seg.words || []) {
      const clean = String(w.word || "").trim()
      if (!clean) continue
      words.push({ w: clean, start: Number(w.start), end: Number(w.end) })
    }
  }
  // fallback: se o modelo não devolveu palavras, usa segmentos inteiros
  if (!words.length) {
    for (const seg of whisper.segments || []) {
      const parts = String(seg.text || "").split(/\s+/).filter(Boolean)
      if (!parts.length) continue
      const step = (seg.end - seg.start) / parts.length
      parts.forEach((p, i) =>
        words.push({ w: p, start: seg.start + i * step, end: seg.start + (i + 1) * step }),
      )
    }
  }

  const chunks = []
  let cur = []
  let start = 0

  const flush = () => {
    if (!cur.length) return
    let end = cur[cur.length - 1].end
    if (cur.length === 1) end = Math.max(end, cur[0].start + minDur)
    const text = cur.map((x) => x.w).join(" ").replace(/\s+([.,!?;:])/g, "$1")
    chunks.push({
      i: chunks.length,
      start: round(start),
      end: round(Math.min(end, whisper.duration || end)),
      text,
      words: cur.map((x) => ({ w: x.w, start: round(x.start), end: round(x.end) })),
      enfase: [],
    })
    cur = []
  }

  for (const word of words) {
    if (!cur.length) start = word.start
    const candidateLen = cur.reduce((a, x) => a + x.w.length + 1, 0) + word.w.length
    const candidateDur = word.end - start
    const tooLong = cur.length >= maxWords || candidateLen > maxChars || candidateDur > maxDur
    if (tooLong) {
      flush()
      start = word.start
    }
    cur.push(word)
    if (PUNCT.test(word.w) && cur.length >= 2) flush()
  }
  flush()

  // evita buracos: bloco começa quando o anterior termina
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i].start < chunks[i - 1].end) chunks[i].start = chunks[i - 1].end
  }
  if (chunks.length && whisper.duration) {
    const last = chunks[chunks.length - 1]
    if (last.end > whisper.duration) last.end = round(whisper.duration)
  }
  return chunks
}

function round(n) {
  return Math.round(Number(n) * 1000) / 1000
}

const CAPS = ["choque", "curiosidade", "tensao", "revelacao", "cta"]
const FUNDOS = ["gradiente", "particulas", "grid", "bokeh", "solido"]
const MOVS = ["zoom", "pan", "pulse"]
const TRANS = ["corte", "zoom", "flash", "deslize"]

/** Normaliza a direção da IA em algo 100% válido e cobre todos os blocos. */
export function normalizeDirecao(direcao, chunks, fallback = {}) {
  const paleta = {
    fundo: sanitizeColor(direcao?.paleta?.fundo, "#0A0A0F"),
    primaria: sanitizeColor(direcao?.paleta?.primaria, "#FFFFFF"),
    secundaria: sanitizeColor(direcao?.paleta?.secundaria, "#9AA0B4"),
    destaque: sanitizeColor(direcao?.paleta?.destaque, "#FF3D5A"),
  }
  const tipografia = {
    familia: String(direcao?.tipografia?.familia || "Impact, 'Arial Black', sans-serif").replace(/[";{}<>]/g, ""),
    caixa: direcao?.tipografia?.caixa === "none" ? "none" : "uppercase",
    peso: clampInt(direcao?.tipografia?.peso, 400, 900, 900),
  }

  const cenasRaw = Array.isArray(direcao?.cenas) ? direcao.cenas : []
  const cenas = []
  let cursor = 0
  for (const c of cenasRaw) {
    const blocos = (Array.isArray(c?.blocos) ? c.blocos : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= cursor && n < chunks.length)
    if (!blocos.length) continue
    const start = chunks[blocos[0]].start
    const end = chunks[Math.min(blocos[blocos.length - 1], chunks.length - 1)].end
    const enfase = {}
    if (c?.enfase && typeof c.enfase === "object") {
      for (const [k, v] of Object.entries(c.enfase)) {
        const idx = Number(k)
        if (!blocos.includes(idx) || !Array.isArray(v)) continue
        const max = chunks[idx].words.length
        enfase[idx] = v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < max)
      }
    }
    cenas.push({
      index: cenas.length,
      blocos,
      start,
      end,
      emocao: CAPS.includes(c?.emocao) ? c.emocao : "curiosidade",
      fundo: {
        tipo: FUNDOS.includes(c?.fundo?.tipo) ? c.fundo.tipo : "gradiente",
        cores: [
          sanitizeColor(c?.fundo?.cores?.[0], fallback.cores?.[0] ?? "#101018"),
          sanitizeColor(c?.fundo?.cores?.[1], fallback.cores?.[1] ?? "#1B1030"),
        ],
        movimento: MOVS.includes(c?.fundo?.movimento) ? c.fundo.movimento : "zoom",
      },
      transicao: TRANS.includes(c?.transicao) ? c.transicao : "corte",
      elemento: {
        tipo: ["nenhum", "numero", "barra", "icone"].includes(c?.elemento?.tipo) ? c.elemento.tipo : "nenhum",
        valor: String(c?.elemento?.valor ?? "").slice(0, 28),
      },
      enfase,
    })
    cursor = blocos[blocos.length - 1] + 1
  }

  // cobre o resto dos blocos (caso a IA tenha esquecido)
  if (cursor < chunks.length) {
    const rest = []
    for (let i = cursor; i < chunks.length; i++) rest.push(i)
    cenas.push({
      index: cenas.length,
      blocos: rest,
      start: chunks[rest[0]].start,
      end: chunks[rest[rest.length - 1]].end,
      emocao: "revelacao",
      fundo: { tipo: "gradiente", cores: ["#101018", "#1B1030"], movimento: "zoom" },
      transicao: "corte",
      elemento: { tipo: "nenhum", valor: "" },
      enfase: {},
    })
  }
  if (!cenas.length) {
    cenas.push({
      index: 0,
      blocos: chunks.map((c) => c.i),
      start: chunks[0]?.start ?? 0,
      end: chunks.at(-1)?.end ?? 0,
      emocao: "curiosidade",
      fundo: { tipo: "gradiente", cores: ["#101018", "#1B1030"], movimento: "zoom" },
      transicao: "corte",
      elemento: { tipo: "nenhum", valor: "" },
      enfase: {},
    })
  }

  // aplica ênfase escolhida em cada bloco
  for (const cena of cenas) {
    for (const idx of cena.blocos) {
      chunks[idx].enfase = cena.enfase[idx] ?? []
      chunks[idx].cena = cena.index
      chunks[idx].emocao = cena.emocao
    }
  }

  return { paleta, tipografia, cenas }
}

function sanitizeColor(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())) return value.trim()
  return fallback
}
function clampInt(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function buildTimeline({ chunks, direcao, duration, titulo, canal }) {
  return {
    titulo,
    canal: canal || "",
    duration: round(duration),
    paleta: direcao.paleta,
    tipografia: direcao.tipografia,
    scenes: direcao.cenas,
    chunks: chunks.map((c) => ({
      i: c.i,
      start: c.start,
      end: c.end,
      text: c.text,
      words: c.words,
      enfase: c.enfase ?? [],
    })),
  }
}
