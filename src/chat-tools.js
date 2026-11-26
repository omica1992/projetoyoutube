import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import ffmpegPath from "ffmpeg-static"
import { ROOT } from "./config.js"
import { providerKey } from "./panel-providers.js"
import { getChannelPublicOverview, searchYouTubePublic } from "./youtube-public.js"
import { transcribeAudio } from "./transcribe.js"

const KIT_SUMMARY = path.resolve(ROOT, "..", "kit-video-3d WillianIA", "catalog", "RESUMO.md")
let cachedKitSummary = null

export function get2d3dSpecialistContext() {
  if (cachedKitSummary === null) {
    try {
      cachedKitSummary = fs.readFileSync(KIT_SUMMARY, "utf8").slice(0, 4500)
    } catch {
      cachedKitSummary = ""
    }
  }
  return `[ESPECIALISTA EM VÍDEOS 2D, 3D E ROTEIRO VIRAL]
Você é especialista em:
1. Vídeos 3D (motor Three.js low-poly do kit): cenas com cenário concreto (campo, cidade, floresta, indústria, etc.), personagens animados, partículas/fluxos/processos, câmera dinâmica e legendas palavra por palavra.
${cachedKitSummary ? `Catálogo resumido do kit 3D:\n${cachedKitSummary}` : ""}
2. Vídeos 2D / Motion Graphics em HTML5/Canvas/SVG: animações determinísticas usando o contrato window.__STUDIO__ = { duration, ready: true, setTime(t), play() } em 1080x1920 (9:16).
3. Roteiro viral para Shorts: Gancho/Promessa (0-3s), Contexto mínimo, Entrega com prova/mecanismo, frases curtas e ritmo alto (140-165 palavras/min).`
}

function isSafePublicUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:") return false
    const h = u.hostname.toLowerCase()
    if (h === "localhost" || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|::1|fc|fd)/.test(h)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

export async function fetchUrlText(url) {
  if (!isSafePublicUrl(url)) return null
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "FatoNexoStudio/1.0" },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") || ""
    const raw = await res.text()
    if (ct.includes("json") || ct.includes("text/plain") || ct.includes("markdown")) {
      return { url, title: url, text: raw.slice(0, 6000) }
    }
    const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || url
    const cleaned = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
    return { url, title, text: cleaned.slice(0, 6000) }
  } catch {
    return null
  }
}

export async function searchWeb(query) {
  const q = String(query || "").trim().slice(0, 200)
  if (!q) return []
  const results = []

  const [newsRes, wikiRes, ddgRes] = await Promise.allSettled([
    fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, {
      signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.text() : "")),
    fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json`, {
      headers: { "User-Agent": "FatoNexoStudio/1.0" },
      signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(6000),
    }).then((r) => (r.ok ? r.text() : "")),
  ])

  if (ddgRes.status === "fulfilled" && ddgRes.value) {
    const blocks = [...ddgRes.value.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi)]
    for (const m of blocks.slice(0, 5)) {
      const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      const snippet = (m[3] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      if (title) results.push({ source: "Web", title, snippet, url: m[1] })
    }
  }
  if (wikiRes.status === "fulfilled" && wikiRes.value?.query?.search?.length) {
    for (const item of wikiRes.value.query.search.slice(0, 3)) {
      const snippet = String(item.snippet || "").replace(/<[^>]+>/g, "").trim()
      results.push({ source: "Wikipedia", title: item.title, snippet, url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}` })
    }
  }
  if (newsRes.status === "fulfilled" && newsRes.value) {
    const items = [...newsRes.value.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/gi)]
    for (const m of items.slice(0, 4)) {
      results.push({ source: "Notícias", title: m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(), snippet: m[3].trim(), url: m[2].trim() })
    }
  }
  return results
}

export async function readGitHub(text) {
  const ghUrl = text.match(/https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(blob|tree)\/([^/\s]+)\/([^\s#?]+)|\/issues\/(\d+))?/i)
  const repoRef = ghUrl ? `${ghUrl[1]}/${ghUrl[2].replace(/\.git$/i, "")}` : (/\bgithub\b/i.test(text) && text.match(/\b([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\b/)?.[1])
  if (!repoRef) return null

  const headers = { "User-Agent": "FatoNexoStudio/1.0", Accept: "application/vnd.github+json" }
  const out = []
  try {
    const repo = await fetch(`https://api.github.com/repos/${repoRef}`, { headers, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null))
    if (!repo) return null
    out.push(`Repositório GitHub: ${repo.full_name} (${repo.stargazers_count}★, linguagem: ${repo.language || "N/A"})`)
    if (repo.description) out.push(`Descrição: ${repo.description}`)

    if (ghUrl?.[6]) {
      const issue = await fetch(`https://api.github.com/repos/${repoRef}/issues/${ghUrl[6]}`, { headers, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null))
      if (issue) out.push(`Issue #${issue.number}: ${issue.title}\n${String(issue.body || "").slice(0, 3000)}`)
    } else if (ghUrl?.[3] === "blob" && ghUrl[4] && ghUrl[5]) {
      const raw = await fetch(`https://raw.githubusercontent.com/${repoRef}/${ghUrl[4]}/${ghUrl[5]}`, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : ""))
      if (raw) out.push(`Arquivo ${ghUrl[5]}:\n${raw.slice(0, 6000)}`)
    } else {
      const branch = repo.default_branch || "main"
      const [readme, tree] = await Promise.all([
        fetch(`https://raw.githubusercontent.com/${repoRef}/${branch}/README.md`, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : "")),
        fetch(`https://api.github.com/repos/${repoRef}/contents/`, { headers, signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : [])),
      ])
      if (Array.isArray(tree) && tree.length) {
        out.push(`Arquivos na raiz: ${tree.slice(0, 25).map((f) => `${f.name}${f.type === "dir" ? "/" : ""}`).join(", ")}`)
      }
      if (readme) out.push(`README.md:\n${readme.slice(0, 4000)}`)
    }
    return out.join("\n")
  } catch {
    return null
  }
}

export async function searchWebImages(query) {
  const q = String(query || "").trim().slice(0, 120)
  if (!q) return []
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=4&prop=imageinfo&iiprop=url|mime&iiurlwidth=720&format=json`
    const data = await fetch(url, { headers: { "User-Agent": "FatoNexoStudio/1.0" }, signal: AbortSignal.timeout(7000) }).then((r) => (r.ok ? r.json() : null))
    const pages = Object.values(data?.query?.pages || {})
    return pages
      .map((p) => {
        const info = p.imageinfo?.[0]
        if (!info?.thumburl && !info?.url) return null
        return { name: p.title.replace(/^File:/i, ""), url: info.thumburl || info.url, sourceUrl: info.descriptionurl || info.url }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function generateChatImage({ prompt, outDir }) {
  const key = await providerKey("gemini")
  if (!key) throw new Error("Configure a chave do Google AI Studio (Gemini) em Integrações para gerar imagens.")
  fs.mkdirSync(outDir, { recursive: true })

  // 1) Tenta Gemini Image Generation (generateContent com responseModalities: IMAGE)
  const gemModels = ["gemini-2.0-flash-exp-image-generation", "gemini-2.5-flash-image"]
  for (const model of gemModels) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
      if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png"
        const ext = mime.includes("jpeg") ? ".jpg" : mime.includes("webp") ? ".webp" : ".png"
        const fileName = `img-${crypto.randomUUID().slice(0, 8)}${ext}`
        fs.writeFileSync(path.join(outDir, fileName), Buffer.from(part.inlineData.data, "base64"))
        return { name: fileName, url: `/p/_chat_uploads/${fileName}`, model }
      }
    } catch {}
  }

  // 2) Fallback: Imagen 3
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
      signal: AbortSignal.timeout(45_000),
    })
    if (res.ok) {
      const data = await res.json()
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded
      if (b64) {
        const fileName = `img-${crypto.randomUUID().slice(0, 8)}.png`
        fs.writeFileSync(path.join(outDir, fileName), Buffer.from(b64, "base64"))
        return { name: fileName, url: `/p/_chat_uploads/${fileName}`, model: "imagen-3.0-generate-002" }
      }
    }
  } catch {}

  throw new Error("A API Gemini não retornou imagem para este prompt.")
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath || "ffmpeg", args, { windowsHide: true })
    let err = ""
    child.stderr.on("data", (d) => (err += d.toString()))
    child.on("error", reject)
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))))
  })
}

export async function extractVideoMedia(videoPath, outDir) {
  const id = crypto.randomUUID().slice(0, 8)
  const wavPath = path.join(outDir, `vid-audio-${id}.wav`)
  const framePath = path.join(outDir, `vid-frame-${id}.jpg`)
  let transcript = ""
  let frameBase64 = null

  await Promise.allSettled([
    runFfmpeg(["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-t", "180", wavPath])
      .then(async () => {
        if (!process.env.VERCEL && fs.existsSync(wavPath)) {
          const w = await transcribeAudio(wavPath)
          transcript = (w.segments || []).map((s) => s.text).join(" ").trim()
        }
      })
      .finally(() => fs.rmSync(wavPath, { force: true })),
    runFfmpeg(["-y", "-ss", "00:00:01", "-i", videoPath, "-frames:v", "1", "-q:v", "3", framePath])
      .then(() => {
        if (fs.existsSync(framePath)) frameBase64 = fs.readFileSync(framePath).toString("base64")
      })
      .finally(() => fs.rmSync(framePath, { force: true })),
  ])

  return { transcript, frameBase64, frameMime: "image/jpeg" }
}

export async function askGeminiVision({ prompt, images = [] }) {
  const key = await providerKey("gemini")
  if (!key) return null
  const parts = [
    ...images.slice(0, 3).map((img) => ({ inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.base64 } })),
    { text: prompt },
  ]
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.5-flash"
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts }] }),
    signal: AbortSignal.timeout(65_000),
  })
  if (!res.ok) return null
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim()
  return text ? { text, model: `gemini/${model}` } : null
}

export async function runChatSubagents({ message, channelId, primary }) {
  const text = String(message || "")
  const tasks = []
  const agentsUsed = []
  const foundImages = []

  const wantsGitHub = /github\.com\/|(?:\bgithub\b.*\b[\w.-]+\/[\w.-]+\b)/i.test(text)
  const urls = [...new Set((text.match(/https?:\/\/[^\s)>\]"']+/gi) || []).filter((u) => !/youtube\.com|youtu\.be|github\.com/i.test(u)))].slice(0, 2)
  const wantsWebSearch = /\b(pesquis\w*|busc\w*\s+na\s+(?:web|internet|net)|google|not[íi]cia|atualidade|o\s+que\s+[eé]\b|quem\s+[eé]\b|dados?\s+(?:reais|atuais)|tend[êe]ncia|estat[íi]stica)/i.test(text)
  const wantsYouTube = /\b(refer[êe]ncia|youtube|shorts?\s+sobre|v[íi]deos?\s+sobre|canais?\s+(?:de|sobre)|concorrente|parecido)/i.test(text)
  const wantsFindImage = /\b(procur\w*|busc\w*|achar?|encontr\w*)\s+(?:uma?\s+)?(?:imagem|imagens|foto|fotos)/i.test(text)
  const wants2d3d = /\b(2d|3d|anima[çc][ãa]o|storyboard|cena|cenas|personagem|cen[áa]rio|roteiro|short|vídeo|video)\b/i.test(text)

  if (wantsGitHub) {
    agentsUsed.push("GitHub")
    tasks.push(readGitHub(text).then((res) => (res ? `[SUBAGENTE GITHUB]\n${res}` : "")))
  }
  if (urls.length) {
    agentsUsed.push("Leitor Web")
    tasks.push(
      Promise.all(urls.map(fetchUrlText)).then((pages) =>
        pages.filter(Boolean).map((p) => `[CONTEÚDO DO LINK ${p.url}]\nTítulo: ${p.title}\n${p.text}`).join("\n\n"),
      ),
    )
  }
  if (wantsWebSearch) {
    agentsUsed.push("Pesquisador Web")
    const q = text.replace(/\b(pesquise|pesquisa|busque|busca|na internet|na web|no google|para mim|me diga)\b/gi, " ").trim().slice(0, 120) || text.slice(0, 120)
    tasks.push(
      searchWeb(q).then((items) =>
        items.length ? `[SUBAGENTE PESQUISA WEB (${q})]\n${items.map((i) => `- [${i.source}] ${i.title}: ${i.snippet} (${i.url})`).join("\n")}` : "",
      ),
    )
  }
  if (wantsYouTube) {
    agentsUsed.push("Pesquisador YouTube")
    const q = text.replace(/\b(busque|procure|ache|referências|referencia|no youtube|videos sobre|vídeos sobre|shorts sobre)\b/gi, " ").trim().slice(0, 100) || text.slice(0, 100)
    tasks.push(
      searchYouTubePublic({ query: q, type: "video", days: 30, order: "viewCount", limit: 8 })
        .then((results) =>
          results?.length
            ? `[SUBAGENTE REFERÊNCIAS YOUTUBE (${q})]\n${results.slice(0, 6).map((v) => `- "${v.title}" · ${v.channel} · ${v.views ?? "?"} views · ${v.url}`).join("\n")}`
            : "",
        )
        .catch(() => ""),
    )
  }
  if (wantsFindImage) {
    agentsUsed.push("Buscador de Imagens")
    const q = text.replace(/\b(procure|procura|busque|busca|ache|encontre|uma|imagens?|fotos?|para mim|de)\b/gi, " ").trim().slice(0, 80) || text.slice(0, 80)
    tasks.push(
      searchWebImages(q).then((imgs) => {
        foundImages.push(...imgs)
        return imgs.length ? `[SUBAGENTE IMAGENS ENCONTRADAS]\n${imgs.map((i) => `- ${i.name}: ${i.url}`).join("\n")}` : ""
      }),
    )
  }
  if (!primary && channelId) {
    tasks.push(
      getChannelPublicOverview(channelId, channelId)
        .then((overview) => {
          const vids = overview?.recentVideos || overview?.shorts || []
          return vids.length
            ? `[VÍDEOS RECENTES DO CANAL ATIVO]\n${vids.slice(0, 8).map((v, i) => `${i + 1}. "${v.title}" — ${v.views ?? "?"} views (id: ${v.id})`).join("\n")}`
            : ""
        })
        .catch(() => ""),
    )
  }
  if (wants2d3d) {
    agentsUsed.push("Especialista 2D/3D")
  }

  const resolved = (await Promise.all(tasks)).filter(Boolean)
  if (wants2d3d) resolved.unshift(get2d3dSpecialistContext())
  return { contextBlocks: resolved.join("\n\n"), agentsUsed, foundImages }
}
