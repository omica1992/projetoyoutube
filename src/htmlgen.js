import fs from "node:fs"
import path from "node:path"
import { ask, askFallback, parseJsonLoose } from "./opencode.js"
import { MODELS } from "./config.js"
import { promptHtml, promptDesign } from "./prompts.js"
import { buildEngineHtml } from "./engine-template.js"
import { smokeHtml } from "./render.js"

export function writeEngineHtml({ dir, timeline, audioName, titulo, fileName = "video.html" }) {
  const html = buildEngineHtml({ timeline, audioName, titulo })
  const out = path.join(dir, fileName)
  fs.writeFileSync(out, html, "utf8")
  return out
}

function validateHtml(html) {
  const problems = []
  if (!/<html[\s>]/i.test(html)) problems.push("sem <html>")
  if (!/__STUDIO__/.test(html)) problems.push("sem window.__STUDIO__")
  if (!/setTime\s*[:(]/.test(html)) problems.push("sem setTime()")
  if (html.length < 3000) problems.push("html muito curto")
  const externo = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/gi)].map((m) => m[1])
  if (externo.length) problems.push(`recursos externos: ${externo.slice(0, 3).join(", ")}`)
  return problems
}

/**
 * Gera o HTML final em três camadas de garantia:
 *  1. HTML completo escrito por IA (vídeos curtos, onde o output cabe na resposta)
 *  2. design/CSS autoral da IA aplicado sobre o motor determinístico
 *  3. motor próprio puro
 */
export async function gerarHtmlComIa({ dir, chunks, direcao, timeline, audioName, titulo, modelo, log }) {
  const engine = () => writeEngineHtml({ dir, timeline, audioName, titulo, fileName: "video.html" })
  const modeloPrincipal = modelo || MODELS.html

  // vídeos longos geram respostas enormes: vai direto para a camada de design
  if (chunks.length <= 30) {
    try {
      log?.(`Criando HTML completo com ${modeloPrincipal}...`)
      let raw = await ask({
        model: modeloPrincipal,
        text: promptHtml({ chunks, direcao, audioName, titulo }),
        timeoutMs: 150_000,
      })
      raw = raw.trim().replace(/^```(?:html)?/i, "").replace(/```$/i, "").trim()
      let problems = validateHtml(raw)

      if (problems.length) {
        log?.(`HTML da IA inválido (${problems.join("; ")}). Pedindo correção...`)
        const fix = await ask({
          model: modeloPrincipal,
          text: `O HTML abaixo falhou na validação: ${problems.join("; ")}.

Reescreva COMPLETO, auto-contido, com window.__STUDIO__ = { duration, ready, setTime(t), play() } e <audio id="audio" src="${audioName}">.
Sem recursos externos. Sem CDN. Responda apenas com HTML começando em <!DOCTYPE html>.

HTML ANTERIOR:
${raw.slice(0, 12000)}`,
          timeoutMs: 120_000,
        })
        raw = fix.trim().replace(/^```(?:html)?/i, "").replace(/```$/i, "").trim()
        problems = validateHtml(raw)
      }

      if (problems.length) throw new Error(problems.join("; "))

      const out = path.join(dir, "video.html")
      fs.writeFileSync(out, raw, "utf8")
      log?.("Validando animação da IA...")
      try {
        await smokeHtml({ htmlPath: out, duration: timeline.duration })
      } catch (e) {
        fs.rmSync(out, { force: true })
        throw new Error(e.message)
      }
      fs.writeFileSync(path.join(dir, "video.ia.html"), raw, "utf8")
      writeEngineHtml({ dir, timeline, audioName, titulo, fileName: "video.motor.html" })
      log?.("HTML cinematográfico da IA salvo.")
      return { htmlPath: out, fonte: "ia", modelo: modeloPrincipal }
    } catch (e) {
      log?.(`HTML completo da IA falhou (${e.message}). Tentando camada de design...`)
    }
  } else {
    log?.(`${chunks.length} blocos de legenda: usando camada de design (mais rápida e confiável).`)
  }

  try {
    const design = await designComIa({
      chunks,
      direcao,
      audioName,
      titulo,
      timeline,
      log,
      models: [modeloPrincipal, ...MODELS.htmlFallback],
    })
    const out = path.join(dir, "video.html")
    fs.writeFileSync(out, design.html, "utf8")
    await smokeHtml({ htmlPath: out, duration: timeline.duration })
    fs.writeFileSync(path.join(dir, "video.ia.html"), design.html, "utf8")
    log?.(`Design aplicado (modelo ${design.modelo}).`)
    return { htmlPath: out, fonte: "ia-design", modelo: design.modelo }
  } catch (e2) {
    log?.(`Design da IA falhou (${e2.message}). Gerando com o motor próprio.`)
    const engineFile = engine()
    return { htmlPath: engineFile, fonte: "motor", modelo: "motor" }
  }
}

/** Fallback: a IA escreve só o CSS/identidade visual; o motor garante a sincronia. */
export async function designComIa({ chunks, direcao, audioName, titulo, timeline, log, models }) {
  const lista = models?.length ? models : [MODELS.html, ...MODELS.htmlFallback]
  const { text: raw, model } = await askFallback({
    models: lista,
    text: promptDesign({ chunks, direcao }),
    timeoutMs: 90_000,
    log,
  })

  const design = parseJsonLoose(raw)
  if (!design?.css || String(design.css).length < 200) throw new Error("CSS ausente ou curto")

  const css = sanitizeCss(
    String(design.css)
      .replace(/<\/?style/gi, "")
      .replace(/@import[^;]+;/gi, "")
      .replace(/url\(\s*['"]?https?:[^)]*\)/gi, "none"),
  )

  const merged = {
    ...timeline,
    paleta: { ...timeline.paleta, ...(design.paleta ?? {}) },
    tipografia: { ...timeline.tipografia, ...(design.tipografia ?? {}) },
  }
  const html = buildEngineHtml({ timeline: merged, audioName, titulo, extraCss: css })
  return { html, css, modelo: model }
}

/** Remove da IA qualquer regra que mexa na estrutura do palco. */
function sanitizeCss(css) {
  const proibido = /(^|[\s,>+~])(html|body|#stage|#topbar|\.badge)\b/i
  const blocos = String(css).split("}")
  const mantidos = []
  for (const bloco of blocos) {
    if (!bloco.includes("{")) continue
    const seletor = bloco.slice(0, bloco.indexOf("{"))
    if (proibido.test(seletor)) continue
    mantidos.push(
      bloco
        .replace(/position\s*:\s*fixed/gi, "position:absolute")
        .replace(/-webkit-text-fill-color\s*:\s*transparent/gi, "-webkit-text-fill-color: currentColor")
        .replace(/(color\s*:\s*)transparent/gi, "$1inherit"),
    )
  }
  return mantidos.join("}") + (mantidos.length ? "}" : "")
}

export function parseRoteiro(raw) {
  const json = parseJsonLoose(raw)
  if (!json.roteiro) throw new Error("Roteiro sem campo 'roteiro'")
  return json
}
