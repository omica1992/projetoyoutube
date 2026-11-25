import fs from "node:fs"
import { askOpenCode, parseJsonLoose } from "./opencode.js"

const THREE = new URL("../public/vendor/three.min.js", import.meta.url)
const LICENSE = new URL("../public/vendor/three.LICENSE.txt", import.meta.url)
const SCENE_ENGINE = new URL("../public/engine/fora-do-nivel.js", import.meta.url)
const shapes = ["box", "sphere", "cylinder", "cone", "ring", "mascot"]
const motions = ["still", "shake", "swing", "rise", "roll", "slide", "bob"]
const palette = ["#8cbec7", "#e8ae68", "#698ab0", "#c7b692", "#a6c6a2"]
const SCRIPT_MODEL = "opencode/deepseek-v4.1-flash-free"

async function generateJson(text, log, quick = false) {
  log?.("Consultando DeepSeek V4.1 Flash Free pelo OpenCode.")
  return parseJsonLoose(await askOpenCode({ model: SCRIPT_MODEL, text, timeoutMs: quick ? 55_000 : 80_000 }))
}

export async function writeShortScript({ idea, duration, log }) {
  const result = await generateJson(`Você escreve roteiros originais para Fora do Nível, canal brasileiro de entretenimento educativo sobre engenharia do dia a dia em cartoon 3D.
Crie um Short a partir da pauta abaixo, com duração aproximada de ${duration} segundos e ritmo natural. Abra com um gancho imediato. Coloque o espectador na história em segunda pessoa: você tenta, algo dá errado de um jeito visualmente engraçado, você descobre um princípio de engenharia, enfrenta um novo problema e chega a uma resolução. Termine com uma pergunta curta. O mascote é um personagem de capacete laranja, camiseta azul e nível amarelo. Escreva em português do Brasil, com humor e explicações precisas. Não invente estatísticas ou fontes. Use as fontes fornecidas na pauta quando houver. Separe as afirmações que exigem conferência em um campo próprio. Evite receitas ou dimensionamento para obras reais.
Responda apenas em JSON: {"titulos":["três opções de até 100 caracteres"],"roteiro":"somente a narração pronta para ler, em parágrafos","descricao":"descrição curta para o YouTube, com fontes da pauta quando houver","conferir":["afirmações técnicas que precisam de conferência"]}.
Pauta: ${JSON.stringify(idea)}`, log)
  const titulos = Array.isArray(result.titulos)
    ? [...new Set(result.titulos.filter((v) => typeof v === "string").map((v) => v.trim().slice(0, 100)).filter(Boolean))].slice(0, 3)
    : []
  const roteiro = typeof result.roteiro === "string" ? result.roteiro.trim() : ""
  if (!titulos.length || !roteiro || roteiro.length > 5000) throw new Error("O roteiro retornou incompleto. Tente gerar novamente.")
  return {
    titulos,
    roteiro,
    descricao: typeof result.descricao === "string" ? result.descricao.slice(0, 5000) : "",
    conferir: Array.isArray(result.conferir) ? result.conferir.filter((v) => typeof v === "string").slice(0, 12) : [],
  }
}

function vector(value, fallback, min, max) {
  if (!Array.isArray(value)) return fallback
  return fallback.map((v, i) => Number.isFinite(value[i]) ? Math.max(min, Math.min(max, value[i])) : v)
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

export async function planScenes(chunks, duration, script, log) {
  const count = Math.min(9, Math.max(2, Math.round(duration / 11)), chunks.length)
  const beats = Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * chunks.length / count)
    const end = Math.floor((i + 1) * chunks.length / count)
    return {
      start: i ? chunks[start].start : 0,
      text: chunks.slice(start, end).map((chunk) => chunk.text).join(" "),
    }
  })
  let result
  let basicScenes = false
  try {
    result = await generateJson(`Crie ${beats.length} cenas cartoon 3D (uma por trecho, na ordem) para a história de engenharia abaixo. Mostre a ação com 4 a 10 objetos por cena. Use o mascote interagindo, objetos compostos e mudanças no enquadramento vertical. Movimento ilustrativo. Responda só JSON.
Formato: {"cenas":[{"ceu":"#a8cad2","solo":"#b2a28c","camera":[6,4,12],"alvo":[0,2,0],"objetos":[{"forma":"box","cor":"#78899a","pos":[0,2,0],"tam":[2,4,2],"rot":[0,0,0],"movimento":"shake","forca":0.12,"inicio":0.27}]}]}.
Formas: ${shapes.join(", ")}. Movimento: ${motions.join(", ")}. pos, tam e rot em xyz, y sobe, chão em y=0, dimensão inteira, rotação em radianos. O mascote se apoia pelos pés e usa tam [1,1,1]. inicio é fração da cena (0 a 0.9), conforme a fala. Para rise, o objeto aparece a partir de inicio. Posicione a ação perto do alvo.
Trechos: ${JSON.stringify(beats.map((b) => b.text))}`, log, true)
    if (result.cenas?.length !== beats.length || !result.cenas.every((s) => s?.objetos?.some?.((o) => shapes.includes(o?.forma)))) {
      throw new Error("O plano não cobriu todos os trechos.")
    }
  } catch (e) {
    log?.(`Direção da IA indisponível. Usando cenas básicas. ${e.message}`)
    result = { cenas: beats.map((beat, i) => basicScene(beat.text, script, i)) }
    basicScenes = true
  }
  const scenes = beats.map((beat, i) => {
    const scene = result.cenas[i] ?? {}
    const objects = Array.isArray(scene.objetos) ? scene.objetos.filter((o) => shapes.includes(o?.forma)).slice(0, 28) : []
    if (!objects.length) throw new Error(`A cena ${i + 1} veio sem objetos 3D. Tente novamente.`)
    const target = vector(scene.alvo, [0, 2, 0], -12, 12)
    let camera = vector(scene.camera, [8, 6, 12], -24, 24)
    if (Math.hypot(...camera.map((v, j) => v - target[j])) < 4) camera = [8, 6, 12]
    return {
      start: beat.start,
      end: beats[i + 1]?.start ?? duration,
      sky: color(scene.ceu, palette[i % palette.length]),
      ground: color(scene.solo, "#bcaa8a"),
      camera,
      target,
      objects: objects.map((o) => ({
        shape: o.forma,
        color: color(o.cor, "#426a88"),
        position: vector(o.pos, [0, 0.5, 0], -18, 18),
        size: vector(o.tam, [1, 1, 1], 0.07, 13),
        rotation: vector(o.rot, [0, 0, 0], -Math.PI * 2, Math.PI * 2),
        motion: motions.includes(o.movimento) ? o.movimento : "still",
        strength: Number.isFinite(o.forca) ? Math.max(0, Math.min(2, o.forca)) : 0.35,
        onset: Number.isFinite(o.inicio) ? Math.max(0, Math.min(0.9, o.inicio)) : 0,
      })),
    }
  })
  return { scenes, basicScenes }
}

function basicScene(line, script, i) {
  const lookup = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const plans = [
    [/isolador|fundacao|alicerce|solo|terra/, [
      ["box", "#9b7555", [0, 0.2, 0], [3.4, 0.4, 2.2], "shake", 0.1],
      ["cylinder", "#27384a", [-0.8, 0.62, 0], [0.56, 0.45, 0.65], "shake", 0.07],
      ["cylinder", "#27384a", [0.8, 0.62, 0], [0.56, 0.45, 0.65], "shake", 0.07],
      ["box", "#81a7bc", [0, 2.08, 0], [2.55, 2.45, 1.8], "shake", 0.03],
    ]],
    [/terremoto|predio|andares|estrutura|arranha/, [
      ["box", "#719ab6", [0, 2, 0], [2.2, 4, 1.65], "shake", 0.11],
      ...[1, 1.7, 2.4, 3.1].map((y) => ["box", "#273e55", [0, y, 0.84], [1.65, 0.26, 0.05], "shake", 0.11]),
      ["box", "#f7aa35", [0, 4.05, 0], [2.5, 0.16, 1.9], "shake", 0.11],
    ]],
    [/ponte|viaduto|estrada/, [
      ["box", "#434d59", [0, 1.8, 0], [5.6, 0.24, 1.35]],
      ...[-1.5, 1.5].map((x) => ["cylinder", "#d2c1a8", [x, 0.85, 0], [0.58, 1.7, 0.58]]),
      ["box", "#e1882e", [-1.8, 2.08, 0.2], [0.7, 0.35, 0.45], "slide", 1],
    ]],
    [/agua|ralo|enchente|tubo|barragem|drenagem/, [
      ["box", "#6b7582", [0, 0.2, 0], [4.8, 0.4, 1.9]],
      ["cylinder", "#287b9c", [-1.15, 1, 0], [0.9, 1.5, 0.9]],
      ["ring", "#e5be60", [0.1, 1.3, 0], [1, 1, 1]],
      ["sphere", "#3ca9ee", [-1.3, 1.3, 0.13], [0.42, 0.42, 0.42], "slide", 1],
    ]],
  ]
  const contents = lookup(line)
  const props = (plans.find(([pattern]) => pattern.test(contents)) || plans.find(([pattern]) => pattern.test(lookup(script))))?.[1] ?? [
    ["box", "#688190", [0, 0.32, 0], [3.2, 0.64, 2.1]],
    ["cylinder", "#da9e4c", [0, 1.2, 0], [1.15, 1.75, 1.15], "swing", 0.26],
    ["sphere", "#2a779c", [0, 2.6, 0], [0.9, 0.9, 0.9], "bob", 0.25],
  ]
  const specs = [...props, ["mascot", "#f58d17", [-2.2, 0, 1.1], [1.02, 1.02, 1.02]]]
  return {
    camera: [i % 2 ? 4 : 2, 4.4, 12], alvo: [-0.55, 1.95, 0],
    objetos: specs.map(([forma, cor, pos, tam, movimento, forca]) => ({ forma, cor, pos, tam, movimento, forca })),
  }
}

export function writeShortHtml(file, { scenes, chunks, duration, audioName }) {
  const data = JSON.stringify({ scenes, chunks, duration }).replace(/</g, "\\u003c")
  const three = fs.readFileSync(THREE, "utf8")
  const license = fs.readFileSync(LICENSE, "utf8")
  const engine = fs.readFileSync(SCENE_ENGINE, "utf8")
  fs.writeFileSync(file, `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fora do Nível · Animação 3D</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#192334;display:grid;place-items:center;height:100vh;overflow:hidden;font:700 16px system-ui}
  main{width:1080px;height:1920px;position:absolute;left:50%;top:50%;overflow:hidden}
  canvas{display:block} #brand{position:absolute;top:125px;left:75px;border-radius:30px;background:#162438;color:#fff;padding:18px 28px;font-size:26px;letter-spacing:.11em}
  #brand b{color:#ffb42c} #caption{position:absolute;left:65px;right:65px;bottom:320px;color:white;font-size:82px;line-height:1.04;text-transform:uppercase;text-align:center;overflow-wrap:anywhere;-webkit-text-stroke:3px #15202e;paint-order:stroke fill;text-shadow:0 5px 12px #111}
  #play{position:fixed;bottom:6%;left:50%;transform:translateX(-50%);border:0;border-radius:8px;padding:12px;background:#ffb42c;color:#172135;font:inherit;white-space:nowrap;cursor:pointer}
</style></head><body><main id="stage"><div id="brand">FORA DO <b>NÍVEL</b></div><div id="caption"></div></main>
<audio src="${audioName}" preload="metadata"></audio><button id="play" type="button">Assistir com som</button>
<script id="scene-data" type="application/json">${data}</script><script>/*\n${license}\n*/\n${three}</script><script>${engine}</script></body></html>`, "utf8")
}
