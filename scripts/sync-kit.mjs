// Copia o runtime do kit 3D para public/kit, para o navegador poder renderizar
// as mesmas cenas na versão hospedada (Vercel). Não altera o kit.
//
//   node scripts/sync-kit.mjs
//
// O destino fica fora do Git? Não: os arquivos copiados são estáticos e
// precisam existir no deploy. Rode este script sempre que o kit mudar.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const kit = path.resolve(studio, "..", "kit-video-3d WillianIA")
const dest = path.join(studio, "public", "kit")
const copied = []

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  copied.push(path.relative(dest, to))
}

function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) throw new Error(`Pasta não encontrada no kit: ${from}`)
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(source, target, filter)
    else if (entry.isFile() && filter(entry.name)) copyFile(source, target)
  }
}

if (!fs.existsSync(kit)) {
  const hasRuntime = fs.existsSync(path.join(dest, "engine", "player.js")) &&
    fs.existsSync(path.join(dest, "vendor", "three.module.js"))
  if (hasRuntime) {
    console.log("Kit local não encontrado; mantendo o runtime já copiado em public/kit.")
    process.exit(0)
  }
  throw new Error(`Kit 3D não encontrado em ${kit}. Copie a pasta do kit para o lado de studio/ ou rode o Studio localmente antes do deploy.`)
}

// Motor e estilos
for (const file of ["player.js", "player.css", "legendas.js", "fluxos.js"]) {
  copyFile(path.join(kit, "engine", file), path.join(dest, "engine", file))
}

// Personagens, cenários e animações (código puro, sem dependências externas)
copyDir(path.join(kit, "assets"), path.join(dest, "assets"))

// Three.js e os addons usados pelo player
copyFile(path.join(kit, "node_modules", "three", "build", "three.module.js"), path.join(dest, "vendor", "three.module.js"))
copyFile(path.join(kit, "node_modules", "three", "build", "three.core.js"), path.join(dest, "vendor", "three.core.js"))
copyDir(path.join(kit, "node_modules", "three", "examples", "jsm"), path.join(dest, "vendor", "addons"))

// Muxer/encoder usado só na exportação pelo navegador
copyFile(
  path.join(studio, "node_modules", "mediabunny", "dist", "bundles", "mediabunny.min.mjs"),
  path.join(dest, "vendor", "mediabunny.min.mjs"),
)

// Licenças
const licenses = [
  [path.join(kit, "node_modules", "three", "LICENSE"), path.join(dest, "vendor", "three.LICENSE.txt")],
  [path.join(studio, "node_modules", "mediabunny", "LICENSE"), path.join(dest, "vendor", "mediabunny.LICENSE.txt")],
]
for (const [from, to] of licenses) {
  if (fs.existsSync(from)) copyFile(from, to)
}

console.log(`Kit 3D copiado para ${path.relative(studio, dest)} (${copied.length} arquivos).`)
