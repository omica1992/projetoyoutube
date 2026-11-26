import { createHash } from "node:crypto"
import { hasSupabase } from "./db.js"

const digest = "e55981bba9ea68d3ae787b42b421b0a99f53c29bd812db2d27bd81467b1e238e"
const object = `studio-3d-runtime/${digest}.tar.gz`

export async function loadCloudKit() {
  if (!hasSupabase()) throw new Error("Supabase indisponível para carregar o kit 3D.")
  const base = process.env.SUPABASE_URL.trim().replace(/\/+$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
  const response = await fetch(`${base}/storage/v1/object/${object}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`O Supabase não entregou o kit 3D (HTTP ${response.status}).`)
  const archive = Buffer.from(await response.arrayBuffer())
  if (createHash("sha256").update(archive).digest("hex") !== digest) {
    throw new Error("A cópia do kit 3D falhou na verificação de integridade.")
  }
  return archive
}
