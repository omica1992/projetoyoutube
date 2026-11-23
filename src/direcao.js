import { ask, parseJsonLoose } from "./opencode.js"
import { MODELS } from "./config.js"
import { normalizeDirecao } from "./timeline.js"
import { promptDirecao } from "./prompts.js"

/** Direção determinística usada se a IA falhar: alterna emoções e paletas por cena. */
export function direcaoHeuristica(chunks, estilo = "") {
  const paletas = [
    { fundo: "#07070C", primaria: "#FFFFFF", secundaria: "#8E93A6", destaque: "#FF2E63" },
    { fundo: "#0B0714", primaria: "#F5F1E8", secundaria: "#9A8FB8", destaque: "#FFB703" },
    { fundo: "#04121A", primaria: "#E6FBFF", secundaria: "#6FA8B8", destaque: "#00E5FF" },
  ]
  const emocoes = ["choque", "curiosidade", "tensao", "revelacao", "cta"]
  const paleta = /tech|neon|futur/i.test(estilo) ? paletas[2] : /claro|clean|elegante/i.test(estilo) ? paletas[1] : paletas[0]

  const cenas = []
  let i = 0
  while (i < chunks.length) {
    const size = Math.min(3, chunks.length - i)
    const blocos = []
    for (let k = 0; k < size; k++) blocos.push(i + k)
    const idx = cenas.length
    cenas.push({
      blocos,
      emocao: emocoes[Math.min(idx, emocoes.length - 1)],
      fundo: {
        tipo: idx % 3 === 0 ? "gradiente" : idx % 3 === 1 ? "particulas" : "grid",
        cores: [paleta.fundo, idx % 2 ? "#1B1030" : "#0F1B2A"],
        movimento: idx % 2 ? "pulse" : "zoom",
      },
      transicao: idx % 4 === 1 ? "flash" : idx % 4 === 2 ? "zoom" : "corte",
      enfase: {},
      elemento: { tipo: "nenhum", valor: "" },
    })
    i += size
  }

  return normalizeDirecao(
    {
      paleta,
      tipografia: { familia: "Impact, 'Arial Black', sans-serif", caixa: "uppercase", peso: 900 },
      cenas,
    },
    chunks,
  )
}

export async function planejarDirecao({ chunks, estilo, tema, log }) {
  try {
    log?.(`Direção de cena com ${MODELS.direcao}...`)
    const raw = await ask({
      model: MODELS.direcao,
      text: promptDirecao({ chunks, estilo, tema }),
      timeoutMs: 240_000,
    })
    const json = parseJsonLoose(raw)
    const norm = normalizeDirecao(json, chunks, {})
    const cobertura = norm.cenas.reduce((a, c) => a + c.blocos.length, 0)
    if (cobertura < chunks.length * 0.6) throw new Error(`direção cobriu só ${cobertura}/${chunks.length} blocos`)
    return norm
  } catch (e) {
    log?.(`Direção por IA falhou (${e.message}). Usando direção automática.`)
    return direcaoHeuristica(chunks, estilo)
  }
}
