import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import ffmpegPath from "ffmpeg-static"
import { ROOT } from "./config.js"
import { parseJsonLoose } from "./opencode.js"
import { askStudioGo } from "./studio-go.js"
import { transcribeAudio } from "./transcribe.js"

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
  .catch((error) => { guide = undefined; throw error })

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
