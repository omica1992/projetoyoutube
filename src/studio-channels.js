import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { ROOT } from "./config.js"
import { exchangeCode, getOAuthStatus, getStudioChannel, getValidAccessToken, refreshYouTubeToken } from "./youtube-oauth.js"

const file = process.env.STUDIO_CHANNELS_FILE || path.join(ROOT, ".youtube-studio-channels.json")
const pending = new Map()
const store = () => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) }
  catch (error) { if (error.code !== "ENOENT") throw error; return {} }
}
function save(id, record) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...store(), [id]: record }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

let defaultLookup
export async function listStudioChannels() {
  const status = await getOAuthStatus(true)
  const channels = Object.values(store()).map(({ channel }) => channel)
  let legacy = null
  if (status.connected) {
    defaultLookup ??= getStudioChannel().catch(() => null).finally(() => {
      const timer = setTimeout(() => { defaultLookup = undefined }, 60_000)
      timer.unref()
    })
    legacy = await defaultLookup
  }
  if (legacy && !channels.some((channel) => channel.id === legacy.id)) channels.unshift(legacy)
  return { configured: status.configured, channels, originalId: legacy?.id ?? null }
}

export async function beginChannelConfirmation(code, origin) {
  const tokens = await exchangeCode(code, origin, true, { persist: false })
  const channel = await getStudioChannel(tokens.access_token)
  const id = randomUUID()
  pending.set(id, { tokens, channel })
  const timer = setTimeout(() => pending.delete(id), 10 * 60 * 1000)
  timer.unref()
  return id
}

export const pendingStudioChannel = (id) => pending.get(id)?.channel ?? null
export function addStudioChannel(id) {
  const record = pending.get(id)
  if (!record) return null
  const old = store()[record.channel.id]
  if (!record.tokens.refresh_token && old?.tokens.refresh_token) record.tokens.refresh_token = old.tokens.refresh_token
  save(record.channel.id, record)
  pending.delete(id)
  return record.channel
}

export async function studioChannelToken(id) {
  const record = store()[id]
  if (record) return refreshYouTubeToken(record.tokens, (tokens) => save(id, { ...record, tokens }))
  const token = await getValidAccessToken(true)
  if ((await getStudioChannel(token)).id !== id) throw new Error("O canal selecionado precisa ser conectado novamente.")
  return token
}
