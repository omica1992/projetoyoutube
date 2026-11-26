// Guarda os vídeos renderizados no próprio navegador (IndexedDB).
// A versão hospedada não tem disco no servidor, então o MP4 fica disponível
// neste dispositivo até ser baixado.

const DB_NAME = "studio-3d"
const STORE = "videos"
const DB_VERSION = 1
const memory = new Map()
const urls = new Map()
let database

function openDatabase() {
  if (database !== undefined) return Promise.resolve(database)
  database = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null)
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "projectId" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return database
}

function transaction(mode) {
  return openDatabase().then((db) => {
    if (!db) return null
    return db.transaction(STORE, mode).objectStore(STORE)
  })
}

export async function saveVideo(projectId, { blob, mime, width, height, fps, duration, title }) {
  const record = {
    projectId,
    blob,
    mime: mime || blob.type || "video/mp4",
    width,
    height,
    fps,
    duration,
    title: title || "",
    createdAt: new Date().toISOString(),
  }
  memory.set(projectId, record)
  const previous = urls.get(projectId)
  if (previous) { URL.revokeObjectURL(previous); urls.delete(projectId) }
  const store = await transaction("readwrite")
  if (!store) return record
  await new Promise((resolve, reject) => {
    const request = store.put(record)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }).catch(() => {})
  return record
}

export async function getVideo(projectId) {
  if (memory.has(projectId)) return memory.get(projectId)
  const store = await transaction("readonly")
  if (!store) return null
  const record = await new Promise((resolve) => {
    const request = store.get(projectId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => resolve(null)
  })
  if (record) memory.set(projectId, record)
  return record
}

export async function getVideoUrl(projectId) {
  if (urls.has(projectId)) return urls.get(projectId)
  const record = await getVideo(projectId)
  if (!record?.blob) return null
  const url = URL.createObjectURL(record.blob)
  urls.set(projectId, url)
  return url
}

export async function deleteVideo(projectId) {
  const previous = urls.get(projectId)
  if (previous) URL.revokeObjectURL(previous)
  urls.delete(projectId)
  memory.delete(projectId)
  const store = await transaction("readwrite")
  if (!store) return
  await new Promise((resolve) => {
    const request = store.delete(projectId)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
}
