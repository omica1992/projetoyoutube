const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

const HEADERS = {
  "user-agent": UA,
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+917",
}

function extractBalancedJson(html, marker) {
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const start = html.indexOf("{", idx)
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === "\\") esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function textOf(node) {
  if (!node) return ""
  if (typeof node === "string") return node
  if (node.simpleText) return node.simpleText
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || "").join("")
  if (node.content) return String(node.content)
  return ""
}

export function parseCompactNumber(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  const s = String(raw || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .trim()
  if (!s) return null
  const match = s.match(/([\d.,]+)\s*(milh[oõ]es|milh[aã]o|mil|bi|m|k|b)?/i)
  if (!match) return null
  let numStr = match[1]
  const unit = (match[2] || "").toLowerCase()
  if (unit) {
    numStr = numStr.replace(/\./g, "").replace(",", ".")
  } else {
    numStr = numStr.replace(/\./g, "").replace(/,/g, "")
  }
  const base = Number(numStr)
  if (!Number.isFinite(base)) return null
  if (unit === "k" || unit === "mil") return Math.round(base * 1_000)
  if (unit === "m" || unit.startsWith("milh")) return Math.round(base * 1_000_000)
  if (unit === "b" || unit === "bi") return Math.round(base * 1_000_000_000)
  return Math.round(base)
}

function collectNodes(root, key, out = []) {
  if (!root || typeof root !== "object") return out
  if (Array.isArray(root)) {
    for (const item of root) collectNodes(item, key, out)
    return out
  }
  if (Object.hasOwn(root, key)) out.push(root[key])
  for (const val of Object.values(root)) {
    if (val && typeof val === "object") collectNodes(val, key, out)
  }
  return out
}

function pickThumb(thumbnails) {
  const list = thumbnails?.thumbnails || thumbnails?.sources || thumbnails
  if (!Array.isArray(list) || !list.length) return ""
  const url = list.at(-1)?.url || list[0]?.url || ""
  return url.startsWith("//") ? `https:${url}` : url
}

function searchSpParam(type, _days, order) {
  if (type === "channel") return "EgIQAg=="
  if (order === "date") return "CAI="
  if (order === "viewCount") return "CAM="
  return ""
}

/**
 * Busca pública no YouTube (sem vidIQ e sem precisar de chave de API).
 */
export async function searchYouTubePublic({ query, type = "video", days = 30, order = "relevance", limit = 20 }) {
  const q = type === "video" && !/#shorts/i.test(query) ? `${query} #shorts` : query
  const sp = searchSpParam(type, Number(days), order)
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}${sp ? `&sp=${encodeURIComponent(sp)}` : ""}`
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`YouTube retornou HTTP ${res.status}`)
  const html = await res.text()
  const data = extractBalancedJson(html, "var ytInitialData =")
  if (!data) throw new Error("Não foi possível ler os resultados públicos do YouTube.")

  if (type === "channel") {
    const channels = collectNodes(data, "channelRenderer")
    const seen = new Set()
    const results = []
    for (const ch of channels) {
      const id = ch.channelId
      if (!id || seen.has(id)) continue
      seen.add(id)
      const subsText = textOf(ch.videoCountText) || textOf(ch.subscriberCountText)
      const handleText = textOf(ch.subscriberCountText)
      const subsRaw = subsText.includes("inscrit") ? subsText : handleText.includes("inscrit") ? handleText : ""
      results.push({
        type: "channel",
        id,
        title: textOf(ch.title),
        url: `https://www.youtube.com/channel/${id}/shorts`,
        handle: handleText.startsWith("@") ? handleText : "",
        avatar: pickThumb(ch.thumbnail),
        subscribers: parseCompactNumber(subsRaw),
        subscribersText: subsRaw,
        description: textOf(ch.descriptionSnippet),
      })
      if (results.length >= limit) break
    }
    return results
  }

  const results = []
  const seen = new Set()

  // Shorts lockups (carrossel de Shorts na busca)
  for (const lockup of collectNodes(data, "shortsLockupViewModel")) {
    const videoId = lockup.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId
    if (!videoId || seen.has(videoId)) continue
    seen.add(videoId)
    const title = lockup.overlayMetadata?.primaryText?.content || ""
    const viewsText = lockup.overlayMetadata?.secondaryText?.content || ""
    const thumb = pickThumb(lockup.thumbnailViewModel?.thumbnailViewModel?.image) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    results.push({
      type: "video",
      id: videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
      title,
      channel: "",
      channelId: "",
      date: "",
      thumbnail: thumb,
      views: parseCompactNumber(viewsText),
      viewsText,
      isShort: true,
    })
    if (results.length >= limit) return results
  }

  // Video renderers comuns
  for (const v of collectNodes(data, "videoRenderer")) {
    const videoId = v.videoId
    if (!videoId || seen.has(videoId)) continue
    seen.add(videoId)
    const ownerRun = v.ownerText?.runs?.[0]
    const channelId = ownerRun?.navigationEndpoint?.browseEndpoint?.browseId || ""
    const viewsText = textOf(v.viewCountText) || textOf(v.shortViewCountText)
    const isShort = v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url?.includes("/shorts/") || false
    results.push({
      type: "video",
      id: videoId,
      url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
      title: textOf(v.title),
      channel: textOf(v.ownerText) || textOf(v.longBylineText),
      channelId,
      date: textOf(v.publishedTimeText),
      thumbnail: pickThumb(v.thumbnail) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      views: parseCompactNumber(viewsText),
      viewsText,
      durationText: textOf(v.lengthText),
      isShort,
    })
    if (results.length >= limit) break
  }

  return results
}

function decodeXmlEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Extrai metadados + transcrição/roteiro real de qualquer vídeo ou Short do YouTube sem vidIQ.
 */
export async function getVideoDetailsAndTranscript(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("ID de vídeo inválido.")
  const [watchRes, oembedRes] = await Promise.all([
    fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null),
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null),
  ])

  const oembed = oembedRes?.ok ? await oembedRes.json().catch(() => null) : null
  const html = watchRes?.ok ? await watchRes.text().catch(() => "") : ""
  let pr = html ? extractBalancedJson(html, "var ytInitialPlayerResponse =") : null
  const initialData = html ? extractBalancedJson(html, "var ytInitialData =") : null

  if (!pr?.videoDetails?.title) {
    try {
      const embRes = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify({
          context: {
            client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "pt", gl: "BR" },
            thirdParty: { embedUrl: "https://www.youtube.com/" },
          },
          videoId,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (embRes.ok) {
        const embData = await embRes.json()
        if (embData?.videoDetails?.title) pr = embData
      }
    } catch {}
  }

  const details = pr?.videoDetails || {}
  const micro = pr?.microformat?.playerMicroformatRenderer || {}
  const subText = textOf(collectNodes(initialData, "videoOwnerRenderer")[0]?.subscriberCountText) || ""

  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  const chosen =
    tracks.find((t) => /^pt(-BR)?$/i.test(t.languageCode) && t.kind !== "asr") ||
    tracks.find((t) => /^pt/i.test(t.languageCode)) ||
    tracks.find((t) => t.kind !== "asr") ||
    tracks[0] ||
    null

  let transcript = ""
  let language = chosen?.languageCode || ""

  if (chosen?.baseUrl) {
    try {
      const capRes = await fetch(`${chosen.baseUrl}&fmt=json3`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10_000),
      })
      if (capRes.ok) {
        const raw = await capRes.text()
        if (raw.trimStart().startsWith("{")) {
          const json = JSON.parse(raw)
          transcript = (json.events || [])
            .flatMap((ev) => (ev.segs || []).map((s) => s.utf8 || ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        } else {
          transcript = decodeXmlEntities(raw)
        }
      }
    } catch {
      // fallback sem transcrição se falhar
    }
  }

  return {
    id: videoId,
    url: `https://www.youtube.com/shorts/${videoId}`,
    title: details.title || oembed?.title || "",
    channel: details.author || oembed?.author_name || "",
    channelId: details.channelId || "",
    channelSubscribers: parseCompactNumber(subText),
    channelSubscribersText: subText,
    views: details.viewCount ? Number(details.viewCount) : null,
    durationSeconds: details.lengthSeconds ? Number(details.lengthSeconds) : null,
    publishDate: micro.publishDate || "",
    category: micro.category || "",
    keywords: Array.isArray(details.keywords) ? details.keywords.slice(0, 15) : [],
    description: details.shortDescription || "",
    transcript: transcript.slice(0, 18_000),
    language,
    hasCaptions: Boolean(transcript),
  }
}

/**
 * Busca dados públicos de um canal (padrão: @fatonexocuri) + Shorts recentes sem depender do vidIQ.
 */
export async function getChannelPublicOverview(channelRef = "@fatonexocuri", channelId = "UCClrO3uvc5-H6NPc6alEHDw") {
  const pathPart = channelRef.startsWith("@") ? channelRef : `channel/${channelRef}`
  const [pageRes, rssRes] = await Promise.all([
    fetch(`https://www.youtube.com/${pathPart}/shorts`, { headers: HEADERS, signal: AbortSignal.timeout(12_000) }),
    channelId
      ? fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
          headers: HEADERS,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  if (!pageRes.ok) throw new Error(`Não foi possível abrir o canal no YouTube (HTTP ${pageRes.status}).`)
  const html = await pageRes.text()
  const data = extractBalancedJson(html, "var ytInitialData =")
  if (!data) throw new Error("Não foi possível ler os dados públicos do canal.")

  const meta = data.metadata?.channelMetadataRenderer || {}
  const resolvedId = meta.externalId || channelId || ""
  const headerRows =
    data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows || []
  const metaTexts = headerRows.flatMap((r) => (r.metadataParts || []).map((p) => p.text?.content || "")).filter(Boolean)

  const subsText = metaTexts.find((t) => /inscrit|subscriber/i.test(t)) || ""
  const videosText = metaTexts.find((t) => /v[ií]deo/i.test(t)) || ""
  const handle = metaTexts.find((t) => t.startsWith("@")) || (channelRef.startsWith("@") ? channelRef : "")

  // Shorts da aba /shorts
  const shorts = []
  const seen = new Set()
  for (const lockup of collectNodes(data, "shortsLockupViewModel")) {
    const videoId = lockup.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId
    if (!videoId || seen.has(videoId)) continue
    seen.add(videoId)
    const title = lockup.overlayMetadata?.primaryText?.content || ""
    const viewsText = lockup.overlayMetadata?.secondaryText?.content || ""
    shorts.push({
      id: videoId,
      url: `https://www.youtube.com/shorts/${videoId}`,
      title,
      thumbnail: pickThumb(lockup.thumbnailViewModel?.thumbnailViewModel?.image) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      views: parseCompactNumber(viewsText),
      viewsText,
      date: "",
    })
    if (shorts.length >= 30) break
  }

  // Enriquecer datas com RSS se disponível
  if (rssRes && rssRes.ok) {
    const xml = await rssRes.text()
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    const dateById = new Map()
    for (const m of entries) {
      const id = m[1].match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
      const pub = m[1].match(/<published>([^<]+)<\/published>/)?.[1]?.slice(0, 10)
      if (id && pub) dateById.set(id, pub)
    }
    for (const s of shorts) {
      if (dateById.has(s.id)) s.date = dateById.get(s.id)
    }
  }

  const validViews = shorts.map((s) => s.views).filter((v) => typeof v === "number" && Number.isFinite(v))
  const totalRecentViews = validViews.reduce((a, b) => a + b, 0)
  const avgViews = validViews.length ? Math.round(totalRecentViews / validViews.length) : null
  const sortedViews = [...validViews].sort((a, b) => a - b)
  const medianViews = sortedViews.length ? sortedViews[Math.floor(sortedViews.length / 2)] : null

  return {
    channelId: resolvedId,
    handle,
    title: meta.title || handle || "Canal",
    avatar: pickThumb(meta.avatar),
    subscribers: parseCompactNumber(subsText),
    subscribersText: subsText,
    videosCount: parseCompactNumber(videosText),
    videosText,
    recentShorts: shorts,
    stats: {
      sampleSize: shorts.length,
      totalRecentViews,
      avgViews,
      medianViews,
    },
    observedAt: new Date().toISOString(),
    source: "youtube-public",
  }
}
