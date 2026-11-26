// Gera src/kit-guide.js com a documentação e os IDs do kit 3D.
// É esse arquivo que a versão hospedada usa para planejar cenas sem depender
// da pasta irmã do kit, que não é enviada à Vercel.
//
//   node scripts/bundle-kit-guide.mjs

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const kit = path.resolve(studio, "..", "kit-video-3d WillianIA")
const read = (file) => fs.readFileSync(path.join(kit, file), "utf8")
const catalog = JSON.parse(read("catalog/catalog.json"))

const guide = {
  resumo: read("catalog/RESUMO.md"),
  processos: read("docs/processos.md"),
  storyboard: read("docs/storyboard.md"),
  assets: catalog.scenery.map((item) => item.id),
  characters: catalog.characters.map((item) => item.id),
  clips: catalog.clips.map((item) => item.id),
  assetCatalog: catalog.scenery.map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label,
    description: String(item.description || "").slice(0, 180),
    params: Object.keys(item.params || {}),
    variants: item.variants || [],
    setProgress: Boolean(item.setProgress),
    update: Boolean(item.update),
    wheels: Boolean(item.wheels),
    animated: Boolean(item.setProgress || item.update || item.wheels),
  })),
  characterCatalog: catalog.characters.map((item) => ({
    id: item.id,
    role: String(item.role || "").slice(0, 160),
    hat: item.hat || "",
    held: Object.keys(item.held || {}),
  })),
  clipCatalog: catalog.clips.map((item) => ({
    id: item.id,
    description: String(item.description || "").slice(0, 120),
    loop: Boolean(item.loop),
    params: Object.keys(item.params || {}),
  })),
}

const output = `// Gerado por scripts/bundle-kit-guide.mjs. Não edite à mão.\n` +
  `// Fonte: kit-video-3d WillianIA (catalog/RESUMO.md, docs/processos.md, docs/storyboard.md).\n\n` +
  `export const KIT_GUIDE = ${JSON.stringify(guide, null, 2)}\n`

fs.writeFileSync(path.join(studio, "src", "kit-guide.js"), output, "utf8")
console.log(`src/kit-guide.js gerado (${Buffer.byteLength(output)} bytes).`)
