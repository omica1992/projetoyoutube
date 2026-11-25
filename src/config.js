import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const DATA_DIR = process.env.STUDIO_DATA_DIR ? path.resolve(process.env.STUDIO_DATA_DIR) : path.join(ROOT, "data")
export const PUBLIC_DIR = path.join(ROOT, "public")
export const PY_DIR = path.join(ROOT, "python")

export const WIDTH = 1080
export const HEIGHT = 1920
export const FPS = 30

export const PROVIDER = "opencode-go"

export const MODELS = {
  direcionador: process.env.MODEL_DIRECIONADOR ?? "opencode/mimo-v2.6-flash-free",
  direcionadorFallback: (process.env.MODEL_DIRECIONADOR_FALLBACK ?? "opencode/mimo-v2.6-flash-free,opencode-go/mimo-v2.6-flash,opencode-go/gemini-4-argon")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  roteiro: process.env.MODEL_ROTEIRO ?? "opencode/mimo-v2.6-flash-free",
  direcao: process.env.MODEL_DIRECAO ?? "gemini-4-argon",
  html: process.env.MODEL_HTML ?? "gpt-6-luna",
  htmlFallback: (process.env.MODEL_HTML_FALLBACK ?? "gpt-6-luna,claude-haiku-5-5")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
}

export const WHISPER = {
  model: process.env.WHISPER_MODEL ?? "small",
  language: process.env.WHISPER_LANG ?? "pt",
}
