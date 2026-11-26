import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import ffmpegPath from "ffmpeg-static"
import { ROOT } from "./config.js"
import { parseJsonLoose } from "./opencode.js"
import { askStudioGo } from "./studio-go.js"
import { transcribeAudio } from "./transcribe.js"
import { KIT_GUIDE } from "./kit-guide.js"

const kit = path.resolve(ROOT, "..", "kit-video-3d WillianIA")
const references = ["catalog/RESUMO.md", "docs/processos.md", "docs/storyboard.md"]
let guide

function runTool(tool, args, progress) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`tools/${tool}.mjs`, ...args], {
      cwd: kit, windowsHide: true,
      env: { ...process.env, FFMPEG_PATH: process.env.FFMPEG_PATH || ffmpegPath || "ffmpeg" },
    })
    let output = ""
    const capture = (chunk) => {
      output = (output + chunk.toString()).slice(-8000)
      if (progress) progress(output)
    }
    child.stdout.on("data", capture)
    child.stderr.on("data", capture)
    child.on("error", reject)
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(output.trim().slice(-2200) || `Kit: ${tool} falhou (${code}).`)))
  })
}

export async function kitAvailability() {
  const paths = ["engine/player.js", "node_modules/three/build/three.module.js", "node_modules/puppeteer-core/package.json"]
  try { await Promise.all(paths.map((item) => fs.access(path.join(kit, item)))); return true }
  catch { return false }
}

export async function timeKitWords(audio, duration) {
  const result = await transcribeAudio(audio)
  const words = result.segments.flatMap((segment) => segment.words).map(({ word, start, end }) => ({
    palavra: word.trim(), inicio: Math.max(0, start), fim: Math.min(duration, end),
  })).filter((word) => word.palavra && word.fim > word.inicio)
  if (!words.length) throw new Error("O Whisper não encontrou palavras na narração.")
  return words
}

const readGuide = () => guide ??= Promise.all(references.map((name) => fs.readFile(path.join(kit, name), "utf8")))
  .then((parts) => parts.join("\n\n"))
  .catch(() => [KIT_GUIDE.resumo, KIT_GUIDE.processos, KIT_GUIDE.storyboard].join("\n\n"))

async function askKit(model, instructions, image) {
  const text = `Você é o diretor de animação do Studio 3D. Produza somente JSON, usando o motor e os assets existentes.
Use a documentação abaixo. Não use ferramentas, não escreva código, não altere arquivos.
${await readGuide()}\n\nTarefa:\n${instructions}`
  return parseJsonLoose(await askStudioGo({ model, text, image }))
}

export async function planKitVideo({ model, title, script, duration, words }) {
  const total = Math.round((duration + 0.4) * 1000) / 1000
  const plan = await askKit(model, `Crie um storyboard para vídeo explicativo. Retorne {"ambiente":{},"cenas":[]}.
Inclua em cada cena descricaoVisual, uma frase em português descrevendo a ação, o cenário e o enquadramento para aprovação humana. Use duas formas de animação por cena, cenários concretos, continuidade e câmera bem enquadrada.
As cenas cobrem de 0 a ${total} segundos, sem lacunas. Respeite o tempo da narração.
Cada ação, movimento, fluxo e texto deve usar tempos absolutos dentro do intervalo da própria cena.
Título: ${JSON.stringify(title)}
Roteiro: ${JSON.stringify(script)}
Palavras sincronizadas (segundos): ${JSON.stringify(words)}`)
  if (!Array.isArray(plan?.cenas) || !plan.cenas.length) throw new Error("O modelo não retornou cenas do kit.")
  return {
    versao: 1, titulo: title, formato: { largura: 1080, altura: 1920, fps: 30 },
    duracao: total, audio: "narracao.wav", palavras: "palavras.json",
    legendas: { ativo: true, palavrasPorBloco: 1 }, ambiente: plan.ambiente, cenas: plan.cenas,
  }
}

export async function reviseKitVideo({ model, storyboard, scene, time, history, message, image }) {
  const current = storyboard.cenas[scene]
  const result = await askKit(model, `Responda apenas {"resposta":"texto breve ao usuário","cena":{}}.
Se a mensagem for uma pergunta ou não puder ser atendida, responda com "cena":null e explique.
Se for um pedido de ajuste, retorne a cena COMPLETA ajustada. Edite somente a cena enviada, preserve início, fim e áudio. Atualize descricaoVisual para resumir o resultado em português.
Ambiente geral: ${JSON.stringify(storyboard.ambiente)}
Cena ${scene + 1} em ${time}s: ${JSON.stringify(current)}
Histórico recente: ${JSON.stringify(history.slice(-12))}
Mensagem: ${JSON.stringify(message)}${image ? "\nConsidere também a imagem de referência anexada." : ""}`, image)
  if (typeof result?.resposta !== "string" || !result.resposta.trim() || (result.cena !== null && (!result.cena || typeof result.cena !== "object" || Array.isArray(result.cena)))) {
    throw new Error("O modelo não retornou uma resposta válida para a revisão.")
  }
  const edited = result.cena && { ...current, ...result.cena, inicio: current.inicio, fim: current.fim }
  const changed = edited && JSON.stringify(edited) !== JSON.stringify(current)
  const next = changed ? { ...storyboard, cenas: storyboard.cenas.map((item, i) => i === scene ? edited : item) } : null
  const response = edited && !changed ? "O modelo devolveu a mesma cena. Você pode descrever o ajuste de outro jeito." : result.resposta.trim().slice(0, 4000)
  return { response, storyboard: next }
}

export async function renderKitVideo({ storyboard, words, audio, output, preview, onProgress, repair }) {
  if (!await kitAvailability()) throw new Error("As dependências do kit 3D ainda não estão instaladas.")
  const stage = await fs.mkdtemp(path.join(kit, "projects", "studio-render-"))
  const project = path.relative(kit, stage)
  try {
    await Promise.all([
      fs.copyFile(audio, path.join(stage, "narracao.wav")),
      fs.writeFile(path.join(stage, "palavras.json"), JSON.stringify(words)),
    ])
    async function validate(board) {
      await fs.writeFile(path.join(stage, "storyboard.json"), JSON.stringify(board, null, 2))
      await runTool("validar", [project, "--json"])
    }
    try { await validate(storyboard) }
    catch (error) {
      if (!repair) throw error
      storyboard = await repair(storyboard, error.message)
      await validate(storyboard)
    }
    await runTool("render", [project, ...(preview ? ["--previa"] : []), "--saida", output], onProgress)
    if (!(await fs.stat(output)).size) throw new Error("O kit não produziu um MP4 válido.")
    return storyboard
  } finally {
    await fs.rm(stage, { recursive: true, force: true })
  }
}

export async function repairKitVideo(model, storyboard, errors, scene) {
  const selected = Number.isInteger(scene)
  const payload = selected ? storyboard.cenas[scene] : { ambiente: storyboard.ambiente, cenas: storyboard.cenas }
  const result = await askKit(model, `Corrija os erros do validador. Preserve o objetivo visual e o tempo.
Retorne somente ${selected ? "o objeto completo da cena" : '{"ambiente":{},"cenas":[]}'}.
Erros: ${errors}
Dados: ${JSON.stringify(payload)}`)
  if (!selected) return { ...storyboard, ambiente: result.ambiente, cenas: result.cenas }
  return { ...storyboard, cenas: storyboard.cenas.map((item, index) => index === scene ? { ...result, inicio: item.inicio, fim: item.fim } : item) }
}

// ---------------------------------------------------------------------------
// Validação leve usada no planejamento pelo navegador (a Vercel não roda o
// validador Node do kit). Cobre o que o player precisa para não quebrar.
// ---------------------------------------------------------------------------

const ASSETS = new Set(KIT_GUIDE.assets)
const ASSET_INFO = new Map((KIT_GUIDE.assetCatalog || []).map((item) => [item.id, item]))
const CHARACTERS = new Set(KIT_GUIDE.characters)
const CLIPS = new Set(KIT_GUIDE.clips)
const MACHINES = new Set(["betoneira", "rolo_compressor", "vibroacabadora", "espargidor", "escavadeira", "esteira", "misturador", "fabrica_processo", "guindaste", "engrenagem", "helice"])

function animationTypes(scene) {
  const objects = Array.isArray(scene.objetos) ? scene.objetos : []
  const people = Array.isArray(scene.personagens) ? scene.personagens : []
  const kinds = new Set()
  if (objects.some((o) => o?.movimentos?.length) || people.some((c) => c?.movimentos?.length)) kinds.add("movimento")
  if (scene.fluxos?.length || scene.rastros?.length) kinds.add("fluxo")
  if (objects.some((o) => o?.etapa !== undefined || o?.aparece !== undefined || o?.some !== undefined || o?.anim)) kinds.add("transformacao")
  if (people.some((c) => c?.acoes?.length)) kinds.add("acao")
  if (objects.some((o) => MACHINES.has(o?.asset))) kinds.add("maquina")
  return kinds
}

export function validateStoryboard(storyboard) {
  const errors = []
  const duration = Number(storyboard?.duracao)
  if (!Number.isFinite(duration) || duration <= 0) return ["duracao inválida"]
  if (!Array.isArray(storyboard.cenas) || !storyboard.cenas.length) return ["sem cenas"]

  let expected = 0
  storyboard.cenas.forEach((scene, index) => {
    const label = `cena ${index + 1}`
    const start = Number(scene?.inicio)
    const end = Number(scene?.fim)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      errors.push(`${label}: início/fim inválidos`)
      return
    }
    if (index === 0 && start > 0.06) errors.push(`${label}: precisa começar em 0 (começa em ${start})`)
    if (index > 0 && Math.abs(start - expected) > 0.06) errors.push(`${label}: começa em ${start}, mas a anterior termina em ${expected}`)
    expected = end
    if (end - start > 7.1) errors.push(`${label}: dura ${(end - start).toFixed(1)}s; o máximo é 7s`)

    const ids = new Set()
    for (const item of [...(scene.objetos || []), ...(scene.personagens || [])]) {
      if (!item?.id || typeof item.id !== "string") { errors.push(`${label}: entidade sem id`); continue }
      if (ids.has(item.id)) errors.push(`${label}: id repetido "${item.id}"`)
      ids.add(item.id)
    }
    for (const item of scene.objetos || []) {
      if (!ASSETS.has(item?.asset)) errors.push(`${label}: asset inexistente "${item?.asset}"`)
    }
    for (const person of scene.personagens || []) {
      if (!CHARACTERS.has(person?.preset)) errors.push(`${label}: personagem inexistente "${person?.preset}"`)
      for (const action of person?.acoes || []) {
        if (!CLIPS.has(action?.clip)) errors.push(`${label}: animação inexistente "${action?.clip}" (personagem ${person.id})`)
      }
    }
    const camera = scene.camera
    if (camera?.tipo === "enquadrar" && !ids.has(camera.alvo)) errors.push(`${label}: câmera aponta para "${camera.alvo}", que não existe`)
    for (const element of scene.elementos || []) {
      if (element?.ancora && !ids.has(element.ancora)) errors.push(`${label}: elemento ancorado em "${element.ancora}", que não existe`)
    }
    for (const flow of scene.fluxos || []) {
      for (const point of [flow?.origem, flow?.destino]) {
        if (point && !Array.isArray(point) && !ids.has(point.ancora)) errors.push(`${label}: fluxo ancorado em "${point.ancora}", que não existe`)
      }
    }
    for (const trail of scene.rastros || []) {
      if (!ids.has(trail?.seguir)) errors.push(`${label}: rastro seguindo "${trail?.seguir}", que não existe`)
    }
    if (animationTypes(scene).size < 2) errors.push(`${label}: precisa de pelo menos 2 tipos de animação (movimento, fluxo, transformação, máquina ou ação)`)
  })
  if (Math.abs(expected - duration) > 0.1) errors.push(`as cenas terminam em ${expected}s, mas o vídeo dura ${duration}s`)
  return errors
}

/**
 * Planeja o storyboard usando o mesmo motor do kit, mas sem renderizar.
 * Usado pela versão hospedada: o navegador baixa o plano e desenha os quadros.
 */
export async function planBrowserVideo({ model, title, script, duration, words }) {
  let storyboard = await planKitVideo({ model, title, script, duration, words })
  let errors = validateStoryboard(storyboard)
  if (errors.length) {
    try {
      const repaired = await repairKitVideo(model, storyboard, errors.slice(0, 10).join("\n"))
      if (repaired?.cenas?.length) storyboard = repaired
    } catch { /* A validação abaixo devolve o erro original. */ }
    errors = validateStoryboard(storyboard)
  }
  if (errors.length) throw new Error(`O modelo montou um plano inválido: ${errors.slice(0, 3).join(" · ")}`)
  return storyboard
}

// ---------------------------------------------------------------------------
// Planejamento em partes para a Vercel (cada requisição fica abaixo de 60 s).
// 1) /plano/esboco: esboço curto com tempos, descrição, assets e câmera.
// 2) /plano/cena: expande uma cena por vez, em paralelo no navegador.
// ---------------------------------------------------------------------------

const BACKGROUNDS = new Set(["campo", "cidade", "floresta", "deserto", "litoral", "industrial", "interior"])
const FLOORS = new Set(["grama", "terra", "areia", "concreto", "asfalto", "madeira", "piso"])
const TIMES = new Set(["dia", "tarde", "nublado"])
const WEATHERS = new Set(["limpo", "chuva"])
const ANIMATION_KINDS = ["movimento", "fluxo", "transformacao", "maquina", "acao"]
const FLOW_MATERIALS = new Set(["pedra", "brita", "areia", "terra", "concreto", "asfalto", "agua", "fumaca", "vapor", "poeira", "ar", "bolha", "neve", "eletricidade", "luz", "fagulha", "fogo"])
const SCENE_SCHEMA = `{"inicio":0,"fim":6.7,"transicao":"corte","objetos":[{"id":"casa","asset":"casa_simples","pos":[0,0,0],"giro":0,"params":{},"etapa":[[0,0.2],[6,1]],"movimentos":[{"de":0,"ate":3,"para":[2,0]}],"anim":{"pulsa":0.05}}],"personagens":[{"id":"construtor","preset":"construtor","pos":[2,0,3],"giro":0,"viraPara":[{"em":0,"alvo":"camera"}],"acoes":[{"clip":"talk","de":0,"ate":6.7,"fala":true,"expressao":"happy"}]}],"camera":{"tipo":"enquadrar","alvo":"casa","plano":"medio","angulo":25,"elevacao":14},"textos":[{"texto":"TELHADO PRIMEIRO","de":0.2,"ate":2.5,"estilo":"titulo"}],"fluxos":[{"material":"poeira","origem":{"ancora":"casa","desloca":[0,4,0]},"destino":[2,1,0],"de":0.5,"ate":3,"taxa":20,"espalha":0.5}],"elementos":[{"tipo":"seta","direcao":"cima","ancora":"casa","de":1,"ate":4}],"rastros":[]}`
let compactGuideCache

function truncate(value, size) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, size)
}

function compactGuide() {
  if (compactGuideCache) return compactGuideCache
  const assets = (KIT_GUIDE.assetCatalog || []).map((item) => {
    const flags = [item.setProgress ? "[etapas]" : "", item.update || item.wheels ? "[animado]" : ""].filter(Boolean).join(" ")
    return `- ${item.id} (${item.category || "cenário"}): ${truncate(item.description || item.label, 120)}${flags ? ` ${flags}` : ""}${item.params?.length ? ` params=${item.params.join(",")}` : ""}${item.variants?.length ? ` variantes=${item.variants.join(",")}` : ""}`
  }).join("\n")
  const characters = (KIT_GUIDE.characterCatalog || []).map((item) =>
    `- ${item.id}: ${truncate(item.role || item.id, 90)}${item.hat ? ` chapéu=${item.hat}` : ""}`,
  ).join("\n")
  const clips = (KIT_GUIDE.clipCatalog || []).map((item) =>
    `- ${item.id}: ${truncate(item.description || item.id, 70)}${item.params?.length ? ` params=${item.params.join(",")}` : ""}`,
  ).join("\n")
  compactGuideCache = `CENÁRIOS DISPONÍVEIS (use somente estes ids):
${assets}

PERSONAGENS DISPONÍVEIS (use somente estes ids):
${characters}

ANIMAÇÕES DISPONÍVEIS (use somente estes ids):
${clips}

REGRAS OBRIGATÓRIAS:
- Cada cena cobre de 3 a 7 segundos, sem lacunas, começando onde a anterior terminou.
- Cada cena precisa de pelo menos 2 tipos entre: movimento, fluxo, transformacao, maquina e acao.
- Sempre use um cenário real (fundo) e um chão coerente; nunca cor sólida.
- Personagem que fala: use "talk" com fala:true e viraPara [{em, alvo:"camera"}].
- Tempos de movimentos, ações, fluxos, textos e efeitos são absolutos dentro da cena.
- Use 3 a 10 objetos por cena, com posições em metros e y=0 no chão.
- A câmera "enquadrar" precisa apontar para um id que exista na cena.
- Use poucos textos: título no gancho, no máximo 1 destaque e a pergunta final.`
  return compactGuideCache
}

function allowedIdsText(scene) {
  const staged = (KIT_GUIDE.assetCatalog || []).filter((item) => item.setProgress).map((item) => item.id)
  return `Assets permitidos: ${(KIT_GUIDE.assets || []).join(", ")}
Assets com etapas (usar "etapa" só nestes): ${staged.join(", ")}
Personagens permitidos: ${(KIT_GUIDE.characters || []).join(", ")}
Animações permitidas: ${(KIT_GUIDE.clips || []).join(", ")}`
}

function round(value) {
  return Math.round(value * 10) / 10
}

export function sanitizeOutline(raw, duration) {
  const total = Math.max(4, Number(duration))
  const ambiente = { ...(raw?.ambiente || {}) }
  if (!BACKGROUNDS.has(ambiente.fundo)) ambiente.fundo = "cidade"
  if (!FLOORS.has(ambiente.chao)) ambiente.chao = ambiente.fundo === "cidade" || ambiente.fundo === "industrial" ? "concreto" : "grama"
  if (!TIMES.has(ambiente.horario)) ambiente.horario = "dia"
  if (!WEATHERS.has(ambiente.clima)) ambiente.clima = "limpo"
  if (ambiente.decoracao === undefined) ambiente.decoracao = true

  const source = Array.isArray(raw?.cenas) ? raw.cenas : []
  const scenes = source.slice(0, 24).map((scene) => {
    const objects = Array.isArray(scene?.objetos) ? scene.objetos : []
    const assetIds = [...new Set(objects.map((item) => typeof item === "string" ? item : item?.asset || item?.id).filter((id) => ASSETS.has(id)))]
    const people = [...new Set((Array.isArray(scene?.personagens) ? scene.personagens : [])
      .map((item) => typeof item === "string" ? item : item?.preset || item?.id).filter((id) => CHARACTERS.has(id)))]
    const camera = scene?.camera && typeof scene.camera === "object" ? { ...scene.camera } : undefined
    return {
      descricaoVisual: truncate(scene?.descricaoVisual || scene?.descricao || "", 500),
      objetos: assetIds,
      personagens: people,
      animacoes: (Array.isArray(scene?.animacoes) ? scene.animacoes : [])
        .map(String).filter((kind) => ANIMATION_KINDS.includes(kind)).slice(0, 5),
      camera,
      textos: Array.isArray(scene?.textos) ? scene.textos.slice(0, 2) : [],
    }
  })
  if (!scenes.length) throw new Error("O modelo não retornou cenas para o esboço.")

  // Garante tempos contínuos. Se o modelo errou, divide o vídeo em partes iguais.
  const count = scenes.length
  let cursor = 0
  let validTimes = true
  for (const [index, scene] of source.slice(0, count).entries()) {
    const start = Number(scene?.inicio)
    const end = Number(scene?.fim)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) validTimes = false
    if (index === 0 && start > 0.06) validTimes = false
    if (index > 0 && Math.abs(start - cursor) > 0.16) validTimes = false
    cursor = end
  }
  if (Math.abs(cursor - total) > 0.16) validTimes = false
  const slice = total / count
  scenes.forEach((scene, index) => {
    const rawScene = source[index] || {}
    scene.inicio = validTimes ? round(Number(rawScene.inicio)) : round(index * slice)
    scene.fim = validTimes ? round(Number(rawScene.fim)) : index === count - 1 ? round(total) : round((index + 1) * slice)
  })

  for (const scene of scenes) {
    if (!scene.objetos.length && !scene.personagens.length) scene.objetos = ["casa_simples"]
    const ids = new Set([...scene.objetos, ...scene.personagens])
    if (scene.camera?.tipo === "enquadrar") {
      if (!ids.has(scene.camera.alvo)) scene.camera = { ...scene.camera, alvo: [...ids][0] }
    } else if (!["fixa", "travelling", "enquadrar"].includes(scene.camera?.tipo)) {
      scene.camera = { tipo: "enquadrar", alvo: [...ids][0], plano: "medio" }
    }
    // Limita o tamanho de cada cena sem criar buracos.
    if (scene.fim - scene.inicio > 8) scene.animacoes.push("movimento")
  }
  return {
    ambiente: { fundo: ambiente.fundo, chao: ambiente.chao, horario: ambiente.horario, clima: ambiente.clima, decoracao: ambiente.decoracao !== false },
    cenas: scenes,
    duracao: round(total),
  }
}

function planError(error) {
  if (error?.name === "AbortError" || /aborted|timeout|timed out/i.test(String(error?.message || ""))) {
    return new Error("O modelo demorou mais de um minuto nesta etapa. Tente novamente ou escolha outro modelo.")
  }
  return error
}

function unwrapPlan(raw) {
  let value = Array.isArray(raw) ? raw[0] : raw
  if (value && typeof value === "object" && value.cena && typeof value.cena === "object" && !value.objetos && !value.personagens) value = value.cena
  return value
}

export async function planBrowserOutline({ model, title, script, duration, words }) {
  const total = Math.round((Number(duration) + 0.4) * 10) / 10
  const target = Math.max(1, Math.min(24, Math.round(total / 5)))
  const prompt = `Você é o diretor de animação do Studio 3D. Produza SOMENTE JSON, sem explicar.
${compactGuide()}

Tarefa: crie o esboço de um vídeo vertical explicativo de ${total}s sobre o tema abaixo.
Retorne exatamente este formato:
{"ambiente":{"fundo":"cidade","chao":"concreto","horario":"dia","clima":"limpo"},"cenas":[{"inicio":0,"fim":4.2,"descricaoVisual":"o que se move, quem age e qual é o enquadramento","objetos":["id_do_asset"],"personagens":["id_do_personagem"],"animacoes":["movimento","fluxo"],"camera":{"tipo":"enquadrar","alvo":"id_do_objeto","plano":"geral"}}]}
Use aproximadamente ${target} cenas (no mínimo 1). A primeira começa em 0 e a última termina em ${total}.
Cada cena precisa de 3 a 10 objetos e pelo menos 1 personagem em mais da metade delas.
Tipos de animação: movimento, fluxo, transformacao, maquina, acao.
Quem fala é o personagem principal, com a animação "talk" e fala:true na expansão.
Os tempos das palavras sincronizadas estão em segundos e devem orientar os cortes.
Título: ${JSON.stringify(title)}
Roteiro: ${JSON.stringify(script)}
Palavras sincronizadas: ${JSON.stringify(words)}`
  const raw = unwrapPlan(parseJsonLoose(await askStudioGo({ model, text: prompt, timeoutMs: 55_000 }).catch((error) => { throw planError(error) })))
  return sanitizeOutline(raw, total)
}

export function sanitizeScene(raw, outline) {
  const start = Number(outline.inicio)
  const end = Number(outline.fim)
  const ids = new Set()
  const objects = (Array.isArray(raw?.objetos) ? raw.objetos : [])
    .filter((item) => item && ASSETS.has(item.asset))
    .slice(0, 14)
  const people = (Array.isArray(raw?.personagens) ? raw.personagens : [])
    .filter((item) => item && CHARACTERS.has(item.preset))
    .slice(0, 6)

  for (const [index, item] of objects.entries()) {
    item.id = typeof item.id === "string" && item.id ? item.id : `${item.asset}_${index + 1}`
    if (ids.has(item.id)) item.id = `${item.id}_${index + 1}`
    ids.add(item.id)
    const pos = (Array.isArray(item.pos) ? item.pos : []).map(Number)
    item.pos = pos.length >= 2 && pos.slice(0, 3).every(Number.isFinite)
      ? [pos[0], pos[1] ?? 0, pos[2] ?? 0]
      : [0, 0, 0]
    item.movimentos = Array.isArray(item.movimentos) ? item.movimentos.filter((move) =>
      move && Number.isFinite(Number(move.de)) && Number.isFinite(Number(move.ate)) && Array.isArray(move.para) && move.para.length >= 2) : []
    for (const move of item.movimentos) {
      move.de = Number(move.de)
      move.ate = Number(move.ate)
      move.para = move.para.slice(0, 2).map(Number)
    }
    if (item.etapa && (!ASSET_INFO.get(item.asset)?.setProgress || !Array.isArray(item.etapa) || !item.etapa.every((key) => Array.isArray(key) && key.length >= 2 && Number.isFinite(Number(key[0])) && Number.isFinite(Number(key[1]))))) delete item.etapa
    if (item.anim && typeof item.anim !== "object") delete item.anim
  }
  for (const [index, item] of people.entries()) {
    item.id = typeof item.id === "string" && item.id ? item.id : `${item.preset}_${index + 1}`
    if (ids.has(item.id)) item.id = `${item.id}_${index + 1}`
    ids.add(item.id)
    const pos = (Array.isArray(item.pos) ? item.pos : []).map(Number)
    item.pos = pos.length >= 2 && pos.slice(0, 3).every(Number.isFinite)
      ? [pos[0], pos[1] ?? 0, pos[2] ?? 0]
      : [0, 0, 0]
    item.acoes = Array.isArray(item.acoes) ? item.acoes.filter((action) => action && CLIPS.has(action.clip)) : []
    item.viraPara = Array.isArray(item.viraPara) ? item.viraPara.filter((turn) => turn && Number.isFinite(Number(turn.em))) : []
  }
  if (!objects.length && !people.length) throw new Error(`A cena ${outline.indice + 1} veio sem objetos ou personagens válidos.`)

  const firstId = objects[0]?.id || people[0]?.id
  const camera = raw?.camera && typeof raw.camera === "object" ? { ...raw.camera } : { tipo: "enquadrar", alvo: firstId, plano: "medio" }
  if (!["fixa", "travelling", "enquadrar"].includes(camera.tipo)) camera.tipo = "enquadrar"
  if (camera.tipo === "fixa" && (!Array.isArray(camera.pos) || !Array.isArray(camera.olha))) camera.tipo = "enquadrar"
  if (camera.tipo === "travelling" && (!camera.de?.pos || !camera.para?.pos)) camera.tipo = "enquadrar"
  if (camera.tipo === "enquadrar" && !ids.has(camera.alvo)) camera.alvo = firstId

  const texts = (Array.isArray(raw?.textos) ? raw.textos : []).slice(0, 3).map((text) => ({
    texto: truncate(text?.texto || "", 120),
    de: Math.max(start, Math.min(end, Number(text?.de ?? start))),
    ate: Math.max(start, Math.min(end, Number(text?.ate ?? end))),
    estilo: ["titulo", "destaque", "pergunta", "rodape"].includes(text?.estilo) ? text.estilo : "destaque",
  })).filter((text) => text.texto && text.ate > text.de)

  const elementos = (Array.isArray(raw?.elementos) ? raw.elementos : []).filter((element) =>
    element && (!element.ancora || ids.has(element.ancora)) && ["seta", "icone", "etiqueta"].includes(element.tipo))
  const fluxos = (Array.isArray(raw?.fluxos) ? raw.fluxos : []).filter((flow) => {
    if (!flow || !FLOW_MATERIALS.has(flow.material) || (!flow.origem && !flow.caminho)) return false
    for (const point of [flow.origem, flow.destino]) if (point && !Array.isArray(point) && !ids.has(point.ancora)) return false
    return true
  })
  const rastros = (Array.isArray(raw?.rastros) ? raw.rastros : []).filter((trail) => trail && ids.has(trail.seguir))

  return {
    inicio: start,
    fim: end,
    transicao: ["corte", "fade", "flash"].includes(raw?.transicao) ? raw.transicao : "corte",
    descricaoVisual: truncate(raw?.descricaoVisual || outline.descricaoVisual, 600),
    objetos: objects,
    personagens: people,
    camera,
    textos: texts,
    elementos,
    fluxos,
    rastros,
  }
}

export async function planBrowserScene({ model, outline, previous, next, words, ambiente, total, index, count }) {
  const selectedWords = (Array.isArray(words) ? words : []).filter((word) =>
    Number(word.inicio) >= outline.inicio - 0.1 && Number(word.inicio) < outline.fim + 0.1)
  const prompt = `Você é o diretor de animação do Studio 3D. Expanda a cena ${index + 1} de ${count} para o formato completo do kit.
Retorne SOMENTE o objeto da cena, sem cercas de código, explicações ou um array.

Formato de saída (exemplo mínimo):
${SCENE_SCHEMA}

${allowedIdsText(outline)}
Materiais de fluxo: pedra, brita, areia, terra, concreto, asfalto, agua, fumaca, vapor, poeira, ar, bolha, neve, eletricidade, luz, fagulha, fogo.
Ambiente do vídeo: ${JSON.stringify(ambiente)}
Duração do vídeo: ${total}s
Cena: começa em ${outline.inicio}s e termina em ${outline.fim}s.
Cena anterior: ${JSON.stringify(previous || null)}
Próxima cena: ${JSON.stringify(next || null)}
Esboço desta cena: ${JSON.stringify(outline)}
Palavras dentro da cena (tempos absolutos, segundos): ${JSON.stringify(selectedWords)}

Regras:
- Use os assets e personagens do esboço; dê a cada um um "id" único, "pos" [x,y,z] no chão (y=0) e, se preciso, "giro".
- Anime de verdade: pelo menos 2 tipos entre movimentos, ações, fluxos, rastros, etapa/aparece/anim e assets animados.
- Use a animação "talk" com fala:true no personagem que narra e viraPara [{em:${outline.inicio},alvo:"camera"}].
- Use "etapa" só nos assets marcados como "com etapas"; nos demais use "aparece", "some" ou "anim".
- Todos os tempos de movimentos, ações, fluxos, textos e efeitos são absolutos dentro da cena (${outline.inicio} a ${outline.fim}).
- A câmera deve enquadrar um id existente; confira o enquadramento.
- Não use asset, personagem, animação ou âncora fora das listas.`
  let raw
  try {
    raw = unwrapPlan(parseJsonLoose(await askStudioGo({ model, text: prompt, timeoutMs: 55_000 })))
  } catch (error) {
    throw new Error(`Cena ${index + 1}: ${planError(error).message}`)
  }
  return sanitizeScene(raw, { ...outline, indice: index })
}
