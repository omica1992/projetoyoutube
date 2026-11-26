import { kvGet, sbPatch, sbSelect, sbUpsert } from "./db.js"
import { randomUUID } from "node:crypto"
import { suggestIdeas } from "./studio-planning.js"
import { validGoModel } from "./studio-go.js"

const key = "studio:cloud:pautas"
export const cloudBook = async () => (await kvGet(key)) || { references: [], ideas: [], interests: "" }

export async function editCloudBook(body) {
  const interests = String(body.interests || "").trim().slice(0,1000)
  let ideas
  if (body.action === "sugerir") {
    if (!validGoModel(body.model)) throw Error("Selecione um modelo OpenCode Go.")
    const book = await cloudBook()
    ideas = await suggestIdeas(body.model, interests, book.references, book.ideas.map(i=>i.title), "FatoNexo")
  }
  for (let attempt=0; attempt<5; attempt++) {
    const rows = await sbSelect("fatonexo_kv","select=value,updated_at&key=eq."+encodeURIComponent(key))
    const book = rows[0]?.value || { references: [], ideas: [], interests: "" }
    if (ideas) {
      book.interests = interests
      book.ideas = [...book.ideas.filter(i=>i.queued), ...ideas]
    } else if (body.action === "preferencias") book.interests = interests
    else if (body.action === "fila") {
      const item = book.ideas.find(i=>i.id===body.id)
      if (!item) throw Error("Tema não encontrado.")
      item.queued = Boolean(body.queued)
    } else if (body.action === "referencia") {
      const url = new URL(String(body.url).slice(0,2000))
      const note = String(body.note || "").trim().slice(0,800)
      if (!["http:","https:"].includes(url.protocol) || !note) throw Error("Confira o link e a anotação.")
      book.references.push({id:randomUUID(),url:url.href,note})
    } else throw Error("Operação inválida.")
    const record = { key,value:book,updated_at:new Date().toISOString() }
    if (!rows.length) {
      const inserted = await sbUpsert("fatonexo_kv",[record],"key",true)
      if (inserted.length) return book
    } else if ((await sbPatch("fatonexo_kv","key=eq."+encodeURIComponent(key)+"&updated_at=eq."+encodeURIComponent(rows[0].updated_at),record)).length) return book
  }
  throw Error("As pautas mudaram. Atualize e tente de novo.")
}
