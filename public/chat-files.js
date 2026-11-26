export const fileFormats = {
  html: "HTML", md: "Markdown", txt: "Texto", csv: "CSV", json: "JSON", srt: "Legendas SRT",
}

export function splitChatFiles(reply, requestedFormat = "") {
  const files = []
  const add = (name, value) => {
    const content = value.trim()
    const extension = name.split(".").at(-1).toLowerCase()
    if (!Object.hasOwn(fileFormats, extension) || !content || content.length > 120000 || files.length >= 5) return false
    files.push({ name, content })
    return true
  }
  let text = reply.replace(/^(`{3,})file[ \t]+([a-z0-9][a-z0-9._-]{0,94}\.[a-z0-9]{2,5})[ \t]*\r?\n([\s\S]*?)^\1[ \t]*(?=\r?$)/gim,
    (block, _fence, name, content) => add(name, content) ? "" : block)
  if (!files.length) {
    text = text.replace(/^```(html|markdown|md|text|txt|csv|json|srt)[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?=\r?$)/gim,
      (block, language, content) => {
        const raw = language.toLowerCase()
        const extension = ({ markdown: "md", text: "txt" })[raw] || raw
        if (extension !== "html" && extension !== requestedFormat) return block
        const name = files.length ? `arquivo-${files.length + 1}` : extension === "html" ? "pagina" : "arquivo"
        return add(name + "." + extension, content) ? "" : block
      })
    if (!files.length) {
      text = text.replace(/(?:<!doctype\s+html\b|<html(?:\s[^>]*)?>)[\s\S]*?<\/html\s*>/i,
        document => add("pagina.html", document) ? "" : document)
    }
  }
  return { text: text.trim(), files }
}
