/**
 * Coleta sinais reais de tendência (sem API key):
 *  - Google Trends RSS (buscas do dia, por país)
 *  - autocomplete do YouTube (o que as pessoas realmente digitam)
 *  - Google News RSS (assuntos quentes do nicho)
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const cache = new Map()
const TTL = 10 * 60 * 1000

async function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function getText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8", ...headers },
  })
  if (!res.ok) throw new Error(`${res.status} em ${url}`)
  return res.text()
}

function decodeEntities(s = "") {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim()
}

export async function googleTrends(geo = "BR") {
  return cached(`trends:${geo}`, async () => {
    try {
      const xml = await getText(`https://trends.google.com/trending/rss?geo=${geo}`)
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const block = m[1]
        const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
        const traffic = decodeEntities(block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1] ?? "")
        const news = [...block.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)]
          .map((n) => decodeEntities(n[1]))
          .slice(0, 3)
        return { title, traffic, news }
      })
      return items.filter((i) => i.title).slice(0, 20)
    } catch (e) {
      return [{ title: `(falha ao ler Google Trends: ${e.message})`, traffic: "", news: [] }]
    }
  })
}

export async function youtubeSuggest(query, geo = "BR") {
  return cached(`yt:${geo}:${query}`, async () => {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=pt&gl=${geo}&q=${encodeURIComponent(query)}`
      const raw = await getText(url)
      const json = JSON.parse(raw)
      return (json?.[1] ?? []).map(String).slice(0, 10)
    } catch {
      return []
    }
  })
}

export async function newsFor(query, geo = "BR") {
  return cached(`news:${geo}:${query}`, async () => {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=${geo}&ceid=${geo}:pt-419`
      const xml = await getText(url)
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map((m) => {
        const block = m[1]
        return {
          title: decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
          date: decodeEntities(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""),
          source: decodeEntities(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? ""),
        }
      })
      return items.filter((i) => i.title)
    } catch {
      return []
    }
  })
}

/** Monta o "briefing de tendências" que vai no prompt do roteirista. */
export async function buildTrendBrief({ nicho, geo = "BR", keywords = [] }) {
  const [trends, ...suggests] = await Promise.all([
    googleTrends(geo),
    ...keywords.slice(0, 4).map((k) => youtubeSuggest(`${nicho} ${k}`.trim(), geo)),
    youtubeSuggest(nicho, geo),
    newsFor(nicho, geo),
  ])

  const news = suggests.pop() ?? []
  const suggestFlat = [...new Set(suggests.flat())]

  return {
    nicho,
    geo,
    geradoEm: new Date().toISOString(),
    buscasDoDia: trends.slice(0, 12),
    sugestoesYouTube: suggestFlat.slice(0, 24),
    noticias: news.slice(0, 8),
  }
}
