/**
 * Cliente leve para Supabase REST API (PostgREST).
 * Ativado automaticamente quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão definidos.
 * Sem essas variáveis, o Studio continua salvando normalmente em studio/data/*.json.
 */

export function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

function baseUrl() {
  return process.env.SUPABASE_URL.trim().replace(/\/+$/, "")
}

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

export async function sbSelect(table, query = "") {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Supabase SELECT ${table} HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function sbUpsert(table, rows, onConflict = "id", ignoreDuplicates = false) {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: headers({ Prefer: `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates,return=representation` }),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function sbPatch(table, filterQuery, patch) {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}?${filterQuery}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Supabase PATCH ${table} HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function sbDelete(table, filterQuery) {
  const res = await fetch(`${baseUrl()}/rest/v1/${table}?${filterQuery}`, {
    method: "DELETE",
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Supabase DELETE ${table} HTTP ${res.status}: ${await res.text()}`)
}

export async function kvGet(key) {
  if (!hasSupabase()) return null
  const rows = await sbSelect("fatonexo_kv", `select=value&key=eq.${encodeURIComponent(key)}&limit=1`)
  return rows?.[0]?.value ?? null
}

export async function kvSet(key, value) {
  if (!hasSupabase()) return
  await sbUpsert("fatonexo_kv", [{ key, value, updated_at: new Date().toISOString() }], "key")
}

