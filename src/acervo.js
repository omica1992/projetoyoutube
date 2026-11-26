import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { DATA_DIR } from "./config.js"
import { hasSupabase, sbDelete, sbPatch, sbSelect, sbUpsert } from "./db.js"

const ACERVO_FILE = path.join(DATA_DIR, "acervo.json")

const EMPTY = () => ({
  buscas: [],
  analises: [],
  roteiros: [],
  chats: [],
})

function readLocal() {
  try {
    if (!fs.existsSync(ACERVO_FILE)) return EMPTY()
    const raw = JSON.parse(fs.readFileSync(ACERVO_FILE, "utf8"))
    let chats = Array.isArray(raw.chats) ? raw.chats : []
    if (!chats.length && Array.isArray(raw.chat) && raw.chat.length) {
      chats = [
        {
          id: crypto.randomUUID(),
          title: raw.chat[0]?.text?.slice(0, 48) || "Conversa anterior",
          archived: false,
          createdAt: raw.chat[0]?.createdAt || new Date().toISOString(),
          updatedAt: raw.chat.at(-1)?.createdAt || new Date().toISOString(),
          messages: raw.chat,
        },
      ]
    }
    return {
      buscas: Array.isArray(raw.buscas) ? raw.buscas : [],
      analises: Array.isArray(raw.analises) ? raw.analises : [],
      roteiros: Array.isArray(raw.roteiros) ? raw.roteiros : [],
      chats,
    }
  } catch {
    return EMPTY()
  }
}

function writeLocal(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const temp = `${ACERVO_FILE}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8")
  fs.renameSync(temp, ACERVO_FILE)
}

export async function readAcervo() {
  if (hasSupabase()) {
    const kinds = ["buscas", "analises", "roteiros"]
    const [perKind, chatsRows] = await Promise.all([
      Promise.all(
        kinds.map((k) => sbSelect("fatonexo_acervo", `select=*&kind=eq.${k}&order=created_at.desc&limit=60`)),
      ),
      sbSelect("fatonexo_chats", "select=*&order=updated_at.desc&limit=40"),
    ])
    const items = perKind.flat()
    const out = EMPTY()
    for (const row of items) {
      const entry = {
        ...(row.payload || {}),
        id: row.id,
        status: row.status || row.payload?.status || "",
        archived: Boolean(row.archived),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
      if (out[row.kind]) out[row.kind].push(entry)
    }
    out.chats = (chatsRows || []).map((c) => ({
      id: c.id,
      title: c.title,
      archived: Boolean(c.archived),
      messages: Array.isArray(c.messages) ? c.messages : [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))
    return out
  }
  return readLocal()
}

export async function saveBusca(entry) {
  const now = new Date().toISOString()
  const item = { id: crypto.randomUUID(), archived: false, createdAt: now, ...entry }
  if (hasSupabase()) {
    await sbUpsert("fatonexo_acervo", [
      {
        id: item.id,
        kind: "buscas",
        title: String(item.objetivo || "").slice(0, 200),
        status: item.modo || "direta",
        archived: false,
        payload: item,
        created_at: now,
        updated_at: now,
      },
    ])
    return item
  }
  const data = readLocal()
  data.buscas = [item, ...data.buscas].slice(0, 80)
  writeLocal(data)
  return item
}

export async function saveAnalise(entry) {
  const now = new Date().toISOString()
  const item = { id: crypto.randomUUID(), archived: false, createdAt: now, ...entry }
  if (hasSupabase()) {
    await sbUpsert("fatonexo_acervo", [
      {
        id: item.id,
        kind: "analises",
        title: String(item.video?.title || item.video?.id || "").slice(0, 200),
        status: "analisado",
        archived: false,
        payload: item,
        created_at: now,
        updated_at: now,
      },
    ])
    return item
  }
  const data = readLocal()
  const videoId = entry.video?.id
  const filtered = videoId ? data.analises.filter((a) => a.video?.id !== videoId || (a.channelId || "") !== (entry.channelId || "")) : data.analises
  data.analises = [item, ...filtered].slice(0, 80)
  writeLocal(data)
  return item
}

export async function saveRoteiro(entry) {
  const now = new Date().toISOString()
  const item = {
    status: entry.status || "validado",
    archived: false,
    createdAt: entry.createdAt || now,
    updatedAt: now,
    ...entry,
    id: entry.id || crypto.randomUUID(),
  }
  if (hasSupabase()) {
    await sbUpsert("fatonexo_acervo", [
      {
        id: item.id,
        kind: "roteiros",
        title: String(item.roteiro?.titulo || item.pauta || "Roteiro").slice(0, 200),
        status: item.status,
        archived: Boolean(item.archived),
        payload: item,
        created_at: item.createdAt,
        updated_at: now,
      },
    ])
    return item
  }
  const data = readLocal()
  if (entry.id) {
    const idx = data.roteiros.findIndex((r) => r.id === entry.id)
    if (idx >= 0) {
      data.roteiros[idx] = { ...data.roteiros[idx], ...entry, updatedAt: now }
      writeLocal(data)
      return data.roteiros[idx]
    }
  }
  data.roteiros = [item, ...data.roteiros].slice(0, 100)
  writeLocal(data)
  return item
}

export async function updateAcervoItem(kind, id, patch) {
  if (!["buscas", "analises", "roteiros"].includes(kind)) return null
  if (hasSupabase()) {
    const rows = await sbPatch("fatonexo_acervo", `id=eq.${encodeURIComponent(id)}&kind=eq.${kind}`, {
      ...(typeof patch.archived === "boolean" ? { archived: patch.archived } : {}),
      updated_at: new Date().toISOString(),
    })
    return rows?.[0] || null
  }
  const data = readLocal()
  const idx = data[kind].findIndex((item) => item.id === id)
  if (idx === -1) return null
  data[kind][idx] = { ...data[kind][idx], ...patch, updatedAt: new Date().toISOString() }
  writeLocal(data)
  return data[kind][idx]
}

export async function deleteAcervoItem(kind, id) {
  if (!["buscas", "analises", "roteiros"].includes(kind)) return null
  if (hasSupabase()) {
    await sbDelete("fatonexo_acervo", `id=eq.${encodeURIComponent(id)}&kind=eq.${kind}`)
    return []
  }
  const data = readLocal()
  data[kind] = data[kind].filter((item) => item.id !== id)
  writeLocal(data)
  return data[kind]
}

export async function appendChatTurn({ chatId, title, userMsg, assistantMsg }) {
  const now = new Date().toISOString()
  if (hasSupabase()) {
    let existing = null
    if (chatId) {
      const rows = await sbSelect("fatonexo_chats", `select=*&id=eq.${encodeURIComponent(chatId)}&limit=1`)
      existing = rows?.[0] || null
    }
    const id = existing?.id || chatId || crypto.randomUUID()
    const nextTitle = existing?.title && existing.title !== "Nova conversa"
      ? existing.title
      : (title || userMsg?.text || "Conversa com anexos").slice(0, 56)
    const messages = [...(Array.isArray(existing?.messages) ? existing.messages : []), userMsg, assistantMsg].slice(-80)
    const thread = {
      id,
      title: nextTitle,
      archived: Boolean(existing?.archived),
      messages,
      createdAt: existing?.created_at || now,
      updatedAt: now,
    }
    await sbUpsert("fatonexo_chats", [
      {
        id: thread.id,
        title: thread.title,
        archived: thread.archived,
        messages: thread.messages,
        created_at: thread.createdAt,
        updated_at: now,
      },
    ])
    const all = await readAcervo()
    return { thread, chats: all.chats }
  }

  const data = readLocal()
  let thread = chatId ? data.chats.find((c) => c.id === chatId) : null
  if (!thread) {
    thread = {
      id: chatId || crypto.randomUUID(),
      title: (title || userMsg?.text || "Nova conversa").slice(0, 56),
      archived: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    data.chats = [thread, ...data.chats].slice(0, 60)
  }
  thread.messages = [...thread.messages, userMsg, assistantMsg].slice(-80)
  thread.updatedAt = now
  if (!thread.title || thread.title === "Nova conversa") {
    thread.title = (userMsg?.text || "Conversa com anexos").slice(0, 56)
  }
  data.chats = [thread, ...data.chats.filter((c) => c.id !== thread.id)]
  writeLocal(data)
  return { thread, chats: data.chats }
}

export async function updateChatThread(chatId, patch) {
  if (hasSupabase()) {
    const body = { updated_at: new Date().toISOString() }
    if (typeof patch.title === "string" && patch.title.trim()) body.title = patch.title.trim().slice(0, 80)
    if (typeof patch.archived === "boolean") body.archived = patch.archived
    const rows = await sbPatch("fatonexo_chats", `id=eq.${encodeURIComponent(chatId)}`, body)
    if (!rows?.length) return null
    return (await readAcervo()).chats
  }
  const data = readLocal()
  const idx = data.chats.findIndex((c) => c.id === chatId)
  if (idx === -1) return null
  data.chats[idx] = {
    ...data.chats[idx],
    ...(typeof patch.title === "string" && patch.title.trim() ? { title: patch.title.trim().slice(0, 80) } : {}),
    ...(typeof patch.archived === "boolean" ? { archived: patch.archived } : {}),
    updatedAt: new Date().toISOString(),
  }
  writeLocal(data)
  return data.chats
}

export async function deleteChatThread(chatId) {
  if (hasSupabase()) {
    await sbDelete("fatonexo_chats", `id=eq.${encodeURIComponent(chatId)}`)
    return (await readAcervo()).chats
  }
  const data = readLocal()
  data.chats = data.chats.filter((c) => c.id !== chatId)
  writeLocal(data)
  return data.chats
}
