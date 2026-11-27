/* Kit Visual Procedural (Texturas pintadas em Canvas2D + Personagens cartoon estilo kit-animacao-3d / demo-vaso) */

export const INK = "#241726"
export const SKIN = "#ffe2c2"
const WHITE = "#ffffff"
const MOUTH = "#5a1e28"
const TONGUE = "#e86e78"
const SH_SKIN = [0.96, 0.86, 0.84]
const SH_CLOTH = [0.64, 0.66, 0.74]
const SH_FELT = [0.62, 0.62, 0.7]
const INKL = "rgba(40,30,40,0.85)"
const TAU = Math.PI * 2
const DEF_LIGHT = (-120 * Math.PI) / 180

export const rng = (seed) => {
  let s = (Math.abs(Math.round(seed)) * 9301 + 49297) % 233280 || 1
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length]
const rad = (d) => (d * Math.PI) / 180
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const rnd = (seed, k) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export const M = {
  smooth: (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10) },
  easeOut: (t) => 1 - Math.pow(1 - clamp(t), 3),
  back: (t, s = 1.7) => { t = clamp(t) - 1; return t * t * ((s + 1) * t + s) + 1 },
  clamp,
}

export const idleMotion = (t, seed = 1) => {
  const f = t * 30
  return {
    bob: 4.5 * Math.sin((f + seed * 11) * 0.11),
    tilt: 1.3 * Math.sin((f + seed * 7) * 0.05),
    headTilt: 1.7 * Math.sin((f + seed * 5) * 0.037 + 1),
  }
}

export const mul = (c, m) => {
  const n = parseInt(c.slice(1), 16)
  const ch = (v, k) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0")
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`
}
export const shade = (c, k) => mul(c, [k, k, k])
export const mix = (a, b, t) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16)
  const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0")
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

// =====================================================================
// TEXTURAS PROCEDURAIS 3D (paint.ts)
// =====================================================================
const texCache = new Map()
export const ctex = (THREE, key, w, h, draw) => {
  if (texCache.has(key)) return texCache.get(key)
  const cv = document.createElement("canvas")
  cv.width = w; cv.height = h
  draw(cv.getContext("2d"), rng(key.length * 131 + key.charCodeAt(0)))
  const t = new THREE.CanvasTexture(cv)
  t.encoding = THREE.sRGBEncoding
  t.anisotropy = 4
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  texCache.set(key, t)
  return t
}

export const rep = (t, x, y) => {
  const c = t.clone()
  c.repeat.set(x, y)
  c.needsUpdate = true
  return c
}

export const texGrass = (THREE) => ctex(THREE, "grass", 512, 512, (g, r) => {
  g.fillStyle = "#79b950"; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 65; i++) {
    g.fillStyle = pick(r, ["rgba(96,160,60,.35)", "rgba(140,205,95,.3)"])
    g.beginPath(); g.ellipse(r() * 512, r() * 512, 30 + r() * 60, 18 + r() * 30, r() * 3, 0, 7); g.fill()
  }
  g.lineCap = "round"
  for (let i = 0; i < 1800; i++) {
    const x = r() * 512, y = r() * 512, l = 5 + r() * 8
    g.strokeStyle = pick(r, ["#5f9c3d", "#8fcc5f", "#6aa844", "#9ad46a"]); g.lineWidth = 2
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - l); g.stroke()
  }
  for (let i = 0; i < 24; i++) {
    g.fillStyle = pick(r, ["#fff7d0", "#ffe066", "#ffb3c8"])
    g.beginPath(); g.arc(r() * 512, r() * 512, 3.2, 0, 7); g.fill()
  }
})

export const texCobble = (THREE) => ctex(THREE, "cobble", 512, 512, (g, r) => {
  g.fillStyle = "#827058"; g.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const cx = x * 32 + 16 + (y % 2) * 16 + (r() - 0.5) * 4
    const cy = y * 32 + 16 + (r() - 0.5) * 4
    const rx = 12.5 + r() * 1.5, ry = 10.5 + r() * 1.5, rot = r() * 0.35
    const col = pick(r, ["#c8b494", "#bca684", "#d2bf9f", "#b29b7a"])
    for (const ox of [0, -512, 512]) {
      const px = cx + ox
      if (px < -20 || px > 532) continue
      g.fillStyle = col; g.strokeStyle = "rgba(60,48,36,.82)"; g.lineWidth = 2.6
      g.beginPath(); g.ellipse(px, cy, rx, ry, rot, 0, 7); g.fill(); g.stroke()
      g.fillStyle = "rgba(255,255,255,.16)"
      g.beginPath(); g.ellipse(px - 4, cy - 4, 5, 2.5, 0, 0, 7); g.fill()
    }
  }
})

export const texSand = (THREE) => ctex(THREE, "sand", 512, 512, (g, r) => {
  g.fillStyle = "#e3c58e"; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 45; i++) {
    g.fillStyle = pick(r, ["rgba(205,170,115,.3)", "rgba(245,225,180,.28)"])
    g.beginPath(); g.ellipse(r() * 512, r() * 512, 40 + r() * 50, 14 + r() * 20, 0.1, 0, 7); g.fill()
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = r() > 0.5 ? "#c9a66b" : "#f5e3ba"
    g.fillRect(r() * 512, r() * 512, 3, 3)
  }
})

export const texWoodFloor = (THREE) => ctex(THREE, "woodFloor", 512, 512, (g, r) => {
  for (let i = 0; i < 12; i++) {
    const h = 512 / 12
    g.fillStyle = pick(r, ["#b87c4b", "#ad7040", "#c48855", "#a46a3c"])
    g.fillRect(0, i * h, 512, h)
    g.strokeStyle = "rgba(75,40,18,.28)"; g.lineWidth = 1.5
    for (let k = 0; k < 3; k++) {
      const y = i * h + 8 + r() * (h - 16)
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(160, y + 4, 350, y - 4, 512, y); g.stroke()
    }
    g.fillStyle = "#4d2f1a"; g.fillRect(0, i * h, 512, 3)
    const cut = ((i * 173) % 420) + 40
    g.fillRect(cut, i * h, 3, h)
  }
})

export const texWater = (THREE) => ctex(THREE, "water", 512, 512, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 512)
  gr.addColorStop(0, "#378cd6"); gr.addColorStop(0.5, "#2f7ec7"); gr.addColorStop(1, "#378cd6")
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512)
  g.lineCap = "round"
  for (let i = 0; i < 90; i++) {
    const x = r() * 512, y = r() * 512, l = 30 + r() * 70
    g.strokeStyle = pick(r, ["rgba(140,205,245,.55)", "rgba(110,185,240,.5)", "rgba(225,245,255,.55)"])
    g.lineWidth = 3 + r() * 3
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 6, x + l, y); g.stroke()
  }
})

export const texRoof = (THREE, col) => ctex(THREE, "roof" + col, 512, 512, (g, r) => {
  g.fillStyle = "#3b2a2a"; g.fillRect(0, 0, 512, 512)
  const base = new THREE.Color(col)
  for (let row = 0; row < 16; row++) for (let i = -1; i < 9; i++) {
    const x = i * 64 + (row % 2) * 32, y = row * 32
    const c = base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08)
    g.fillStyle = `#${c.getHexString()}`; g.strokeStyle = INKL; g.lineWidth = 2.5
    g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + 62, y); g.lineTo(x + 62, y + 22); g.quadraticCurveTo(x + 32, y + 36, x + 2, y + 22); g.closePath()
    g.fill(); g.stroke()
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x + 6, y + 3, 50, 5)
  }
})

export const texFacade = (THREE, key, wm, hm, o) => ctex(THREE, "fac" + key, Math.round(wm * 48), Math.round(hm * 48), (g, r) => {
  const W = Math.round(wm * 48), H = Math.round(hm * 48)
  g.fillStyle = o.wall; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},.05)`
    g.beginPath(); g.ellipse(r() * W, r() * H, 20 + r() * 40, 10 + r() * 20, 0, 0, 7); g.fill()
  }
  const floors = Math.max(1, Math.floor(hm / 2.8))
  g.fillStyle = "rgba(60,45,40,.32)"; g.fillRect(0, H - 20, W, 20)
  const nWin = Math.max(1, Math.floor(wm / 2.2))
  for (let fl = 0; fl < floors; fl++) for (let i = 0; i < nWin; i++) {
    const cx = ((i + 0.5) * W) / nWin, by = H - fl * 2.8 * 48 - 0.9 * 48
    if (o.door && fl === 0 && i === Math.floor(nWin / 2)) {
      const dw = 1.1 * 48, dh = 2.1 * 48
      g.fillStyle = "#7a4a2c"; g.strokeStyle = INKL; g.lineWidth = 3
      g.beginPath(); g.moveTo(cx - dw / 2, H); g.lineTo(cx - dw / 2, H - dh + dw / 2); g.arc(cx, H - dh + dw / 2, dw / 2, Math.PI, 0); g.lineTo(cx + dw / 2, H); g.fill(); g.stroke()
      g.fillStyle = "#e8c45a"; g.beginPath(); g.arc(cx + dw / 3, H - dh / 2, 3.5, 0, 7); g.fill()
      continue
    }
    const ww = 0.9 * 48, wh = 1.25 * 48, x0 = cx - ww / 2, y0 = by - wh
    g.fillStyle = o.shutter; g.strokeStyle = INKL; g.lineWidth = 2.2
    for (const sx of [x0 - ww / 2 - 2, x0 + ww + 2]) { g.fillRect(sx, y0, ww / 2, wh); g.strokeRect(sx, y0, ww / 2, wh) }
    g.fillStyle = "#f4efe2"; g.fillRect(x0 - 4, y0 - 4, ww + 8, wh + 8)
    const gg = g.createLinearGradient(x0, y0, x0 + ww, y0 + wh); gg.addColorStop(0, "#8d9cdb"); gg.addColorStop(1, "#5260a8")
    g.fillStyle = gg; g.fillRect(x0, y0, ww, wh)
    g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.moveTo(x0 + 6, y0 + wh * 0.55); g.lineTo(x0 + ww * 0.55, y0 + 6); g.lineTo(x0 + ww * 0.75, y0 + 6); g.lineTo(x0 + 6, y0 + wh * 0.8); g.fill()
    g.fillStyle = "#f4efe2"; g.fillRect(cx - 2, y0, 4, wh); g.fillRect(x0, y0 + wh / 2 - 2, ww, 4)
    g.strokeRect(x0 - 4, y0 - 4, ww + 8, wh + 8)
    g.fillStyle = "#e6dccb"; g.fillRect(x0 - 8, by, ww + 16, 7); g.strokeRect(x0 - 8, by, ww + 16, 7)
  }
})

export const CLOUD_DAY = { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" }
export const CLOUD_GOLD = { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" }
export const texCloudHD = (THREE, seed, pal = CLOUD_DAY) => ctex(THREE, `cloudHD_${pal.lit}_${seed}`, 512, 256, (g) => {
  const r = rng(seed * 7919 + 17)
  const W = 512, H = 256, base = 200
  const n = 6, lobes = []
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, lrad = (30 + 55 * Math.sin(Math.PI * t) ** 0.8) * (0.78 + r() * 0.35)
    lobes.push({ x: 75 + t * 362 + (r() - 0.5) * 26, y: base - lrad * (0.35 + r() * 0.3), r: lrad })
  }
  for (let i = 0; i < 3; i++) {
    const t = 0.25 + r() * 0.5, lrad = 30 + r() * 25
    lobes.push({ x: 75 + t * 362, y: base - 75 - lrad * (0.3 + r() * 0.4), r: lrad })
  }
  const layer = (dx, dy, k, col, blur) => {
    g.save(); g.filter = `blur(${blur}px)`; g.fillStyle = col; g.beginPath()
    for (const l of lobes) { const x = l.x + dx * l.r, y = l.y + dy * l.r; g.moveTo(x + l.r * k, y); g.arc(x, y, l.r * k, 0, TAU) }
    g.fill(); g.restore()
  }
  layer(0, 0, 1.0, pal.shade, 3)
  layer(-0.04, -0.12, 0.9, pal.mid, 4)
  layer(-0.1, -0.26, 0.72, pal.lit, 5)
  g.globalCompositeOperation = "destination-in"
  const m = g.createLinearGradient(0, base - 10, 0, base + 4)
  m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = m; g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = "source-over"
})

export const texPlanet = (THREE, tipo, seed) => ctex(THREE, `pl_${tipo}_${seed}`, 512, 256, (g, r) => {
  const W = 512, H = 256
  const blob = (cx, cy, rx, ry, col) => {
    g.fillStyle = col; g.beginPath()
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, k = 0.75 + r() * 0.35; g.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k) }
    g.fill()
  }
  if (tipo === "terra") {
    g.fillStyle = "#2f7fd8"; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 9; i++) blob(r() * W, 45 + r() * 165, 30 + r() * 55, 20 + r() * 35, i % 3 ? "#5fbf5a" : "#d9c27a")
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, 15); g.fillRect(0, H - 15, W, 15)
    g.globalAlpha = 0.55; for (let i = 0; i < 12; i++) blob(r() * W, r() * H, 35 + r() * 45, 6 + r() * 8, "#ffffff"); g.globalAlpha = 1
  } else if (tipo === "lua") {
    g.fillStyle = "#d9d6cf"; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 6; i++) blob(r() * W, 50 + r() * 150, 30 + r() * 45, 20 + r() * 30, "#b8b4ad")
    for (let i = 0; i < 50; i++) {
      const x = r() * W, y = r() * H, s = 3 + r() * 11
      g.fillStyle = "#a9a49c"; g.beginPath(); g.ellipse(x, y, s, s * 0.8, 0, 0, 7); g.fill()
      g.strokeStyle = "rgba(40,30,40,.35)"; g.lineWidth = 1.5; g.stroke()
    }
  } else {
    g.fillStyle = "#d4683a"; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 10; i++) blob(r() * W, r() * H, 25 + r() * 45, 15 + r() * 25, "#a9472a")
  }
})

// =====================================================================
// PERSONAGENS 2D ESTILO DEMO-VASO (toon.ts + personagens.ts)
// =====================================================================
export const ELENCO = {
  silas: { jacket: "#2b5280", pants: "#2b3242", boots: "#241b16", skin: "#e7b084", hat: "beanie", cap: "#e24d2b", beard: "#6c4529", moustache: "#5a3820", seed: 2 },
  pedro: { jacket: "#3a6fd1", pants: "#33384a", boots: "#241b16", skin: "#f5cfa8", hat: "hair", hair: "#3a2a20", seed: 5 },
  maria: { jacket: "#d9467a", pants: "#3b3f52", boots: "#3a2a20", skin: "#f7d4b2", hat: "hair", hair: "#6b3a22", seed: 8 },
  joao: { jacket: "#e09a2b", pants: "#3b5b9a", boots: "#241b16", skin: "#e8b98f", hat: "cap", cap: "#2e75b6", build: "adult", seed: 11 },
  extra: (v) => {
    const coats = ["#3f6fb5", "#c24444", "#5d7a3a", "#b5653f", "#7b5ac9", "#2f5f6a"]
    const skins = ["#ffe2c2", "#f5c9a0", "#ecd0b6", "#c99067"]
    return {
      jacket: coats[v % coats.length],
      pants: "#3b3f52",
      boots: "#241b16",
      skin: skins[v % skins.length],
      hat: v % 3 === 0 ? "cap" : v % 3 === 1 ? "hair" : "tophat",
      cap: ["#e2453c", "#2e75b6", "#357650"][v % 3],
      hair: ["#3a2a20", "#6b3a22", "#9aa0a8", "#221b18"][v % 4],
      seed: 20 + v * 7,
    }
  },
}

class Pen {
  constructor(g) { this.g = g; this.ol = 12; this.rot = null }
  P(x, y) {
    if (!this.rot) return [x, y]
    const [a, cx, cy, dx = 0, dy = 0] = this.rot, c = Math.cos(a), s = Math.sin(a)
    return [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy]
  }
  path(pts, close) {
    const g = this.g
    g.beginPath()
    pts.forEach((p, i) => { const [x, y] = this.P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y) })
    if (close) g.closePath()
  }
  poly(pts, fill, ol) {
    const g = this.g, w = ol ?? this.ol
    this.path(pts, true)
    if (fill) { g.fillStyle = fill; g.fill() }
    if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke() }
  }
  ell(cx, cy, rx, ry, fill, ol, a0 = 0, a1 = 360, rot = 0) {
    this.poly(ellPts(cx, cy, rx, ry, a0, a1, rot), fill, ol)
  }
  stroke(pts, w, fill = INK) {
    const g = this.g
    g.lineCap = "round"; g.lineJoin = "round"
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke()
  }
  arc(cx, cy, rx, ry, a0, a1, w, fill = INK) {
    const pts = []
    for (let i = 0; i <= 24; i++) pts.push([cx + rx * Math.cos(rad(a0 + ((a1 - a0) * i) / 24)), cy + ry * Math.sin(rad(a0 + ((a1 - a0) * i) / 24))])
    this.stroke(pts, w, fill)
  }
  dot(cx, cy, r, fill = INK) {
    const [x, y] = this.P(cx, cy)
    this.g.beginPath(); this.g.arc(x, y, r, 0, TAU); this.g.fillStyle = fill; this.g.fill()
  }
  clip(pts, fn) { const g = this.g; g.save(); this.path(pts, true); g.clip(); fn(); g.restore() }
  shadedFill(pts, base, shadow, light, R, shift = 0.45, r0 = 1.05, r1 = 1.25) {
    const g = this.g, n = pts.length
    let cx = 0, cy = 0
    for (const [x, y] of pts) { cx += x / n; cy += y / n }
    const [gx, gy] = this.P(cx + Math.cos(light) * shift * R, cy + Math.sin(light) * shift * R)
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r1 * R)
    gr.addColorStop(0, base); gr.addColorStop(r0 / r1, base); gr.addColorStop(1, shadow)
    this.path(pts, true); g.fillStyle = gr; g.fill()
  }
  gradFill(pts, base, shadow, light, flat = 0.22) {
    const g = this.g, dx = Math.cos(light), dy = Math.sin(light), n = pts.length
    let cx = 0, cy = 0, lo = Infinity, hi = -Infinity
    for (const [x, y] of pts) { cx += x / n; cy += y / n; const d = x * dx + y * dy; lo = Math.min(lo, d); hi = Math.max(hi, d) }
    const dc = cx * dx + cy * dy
    const [ax, ay] = this.P(cx + dx * (hi - dc), cy + dy * (hi - dc)), [bx, by] = this.P(cx + dx * (lo - dc), cy + dy * (lo - dc))
    const gr = g.createLinearGradient(ax, ay, bx, by)
    gr.addColorStop(0, base); gr.addColorStop(flat, base); gr.addColorStop(1, shadow)
    this.path(pts, true); g.fillStyle = gr; g.fill()
  }
  inkRing(pts, w0, thick, k = 0.45, col = INK) {
    const n = pts.length
    let cx = 0, cy = 0
    for (const [x, y] of pts) { cx += x / n; cy += y / n }
    const out = [], inn = []
    pts.forEach((q, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]
      let nx = b[1] - a[1], ny = a[0] - b[0]
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l
      const h = 0.5 * w0 * (1 + k * Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - thick))
      out.push([q[0] + nx * h, q[1] + ny * h]); inn.push([q[0] - nx * h, q[1] - ny * h])
    })
    const g = this.g
    const trace = (r) => { r.forEach(([x0, y0], i) => { const [x, y] = this.P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y) }); g.closePath() }
    g.beginPath(); trace(out); trace(inn.reverse())
    g.fillStyle = col; g.fill("evenodd")
  }
}

const ellPts = (cx, cy, rx, ry, a0 = 0, a1 = 360, rot = 0, n = 40) => {
  const r = rad(rot), pts = []
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a)
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)])
  }
  return pts
}
const curve = (a, k, b, n = 10) => {
  const c = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2], out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]])
  }
  return out
}
const rotPts = (pts, a, cx, cy) =>
  pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)])
const rotAbout = (q, a, c) => rotPts([q], a, c[0], c[1])[0]
const taper = (p, a, b, wa, wb, col = INK) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l
  p.poly([[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]], col, 0)
  p.dot(a[0], a[1], wa / 2, col); p.dot(b[0], b[1], wb / 2, col)
}

const blobPts = (cx, cy, B, n = 64) => {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * TAU), pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? B.nTop : B.nBot)
    let X = Math.sign(c) * Math.abs(c) ** e
    const Y = Math.sign(s) * Math.abs(s) ** e
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X))
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]) + 0.7 * Math.cos(3 * t + ph[1]) + 0.5 * Math.cos(4 * t + ph[2]))
    const x = B.a * X * r, y = B.b * Y * r
    pts.push([cx + x * Math.cos(B.rot) - y * Math.sin(B.rot), cy + x * Math.sin(B.rot) + y * Math.cos(B.rot)])
  }
  return pts
}
const headBlob = (seed, a = 118, facing = 0) => ({
  a, b: a * (0.94 + 0.08 * (rnd(seed, 1) - 0.5)),
  nTop: 1.75 + 0.3 * (rnd(seed, 2) - 0.5), nBot: 2.3 + 0.3 * (rnd(seed, 3) - 0.5),
  egg: -0.12 + 0.06 * (rnd(seed, 4) - 0.5),
  asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
  rot: rad(6 * (rnd(seed, 7) - 0.5)), noise: 0.008, seed,
})
const thickAngle = (light) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light))

const EXPR_MAP = {
  "(da ação)": "neutral",
  neutro: "neutral",
  feliz: "smile",
  alivio: "smile",
  desconfiado: "stern",
  teimoso: "stubborn",
  nervoso: "nervous",
  surpreso: "shock",
  assustado: "shock",
  rindo: "laugh",
}

const FACE = {
  neutral: { eye: ["lid", "lid"], brow: [0, -1], mouth: "dash" },
  stern: { eye: ["lid", "lid"], brow: [3, -2], mouth: "frown" },
  stubborn: { eye: ["lid", "lid"], brow: [4.5, -3], mouth: "frown" },
  grin: { eye: ["happy", "happy"], brow: [-3, -3], mouth: "grin" },
  laugh: { eye: ["squeeze", "squeeze"], brow: [-4, -4], mouth: "laugh" },
  nervous: { eye: ["small", "small"], brow: [-3, 2], mouth: "wave" },
  shock: { eye: ["shock", "shock"], brow: [-7, -6], mouth: "O" },
  smile: { eye: ["dot", "dot"], brow: [0, -1], mouth: "smileWide" },
}

const drawEye = (p, kind, x, ey, u, side, look) => {
  const lx = x + look * 3 * u, lw = 3.8 * u
  if (kind === "dot") p.ell(lx, ey, 3.8 * u, 5.5 * u, INK, 0)
  else if (kind === "small") p.ell(lx, ey, 3 * u, 4.4 * u, INK, 0)
  else if (kind === "lid") { p.ell(lx, ey - u, 7 * u, 6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey - u], [x + 9 * u, ey - u]], lw) }
  else if (kind === "happy") p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw)
  else if (kind === "dash") p.stroke([[x - 8.5 * u, ey], [x + 8.5 * u, ey]], lw)
  else if (kind === "squeeze") p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw)
  else {
    p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u)
  }
}

const dmouth = (p, mx, y, rx, ry, u, tongue = false) => {
  p.ell(mx, y, rx, ry, MOUTH, 0, 0, 180)
  p.clip([[mx - rx, y], [mx + rx, y], [mx + rx, y + 3 * u], [mx - rx, y + 3 * u]], () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180))
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0)
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180)
}

const drawMouth = (p, kind, mx, my, u, speaking, t) => {
  const mw = 4 * u
  if (speaking) {
    const ry = 4.5 * u + Math.abs(Math.sin(t * 16)) * 6.5 * u
    dmouth(p, mx, my - u, 10.5 * u, ry, u, ry > 8 * u)
    return
  }
  if (kind === "dash") p.stroke([[mx - 5.5 * u, my], [mx + 5.5 * u, my - 0.8 * u]], mw)
  else if (kind === "frown") p.arc(mx, my + 3 * u, 6.5 * u, 3.5 * u, 200, 340, mw)
  else if (kind === "smileWide") p.arc(mx, my - 4 * u, 11 * u, 6 * u, 15, 165, mw)
  else if (kind === "grin") dmouth(p, mx, my - u, 12 * u, 8 * u, u)
  else if (kind === "laugh") dmouth(p, mx, my, 16 * u, 11 * u, u, true)
  else if (kind === "O") p.ell(mx, my + 2 * u, 9 * u, 11 * u, MOUTH, 3.2 * u)
  else { const s = []; for (let i = 0; i <= 12; i++) s.push([mx - 9 * u + i * 1.5 * u, my + 1.5 * u * Math.sin(i * 1.3)]); p.stroke(s, 3 * u) }
}

export const piscar = (t, seed) => {
  const f = Math.round(t * 30), LID = [0.5, 1, 1, 0.5]
  const h = (i) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v) }
  let s = Math.round(-60 * h(9))
  for (let n = 0; s <= f && n < 200; n++) { const k = f - s; if (k >= 0 && k < 4) return LID[k]; s += Math.round(25 + 65 * h(n + 13)) }
  return 0
}

function drawHat(p, o, hp, H, cx, hc, light, seed, facing) {
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, crown = hc - H.b, ow = 0.85 * 5 * u
  const a = H.rot + rad(3 * (rnd(seed, 20) - 0.5))
  const R = (pts) => rotPts(pts, a, cx, hc)
  if (o.hat === "beanie") {
    const cut = crown + 0.34 * HH
    const keep = (_x, y) => y < cut
    const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])))
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y))
      .map(([x, y]) => [cx + (x - cx) * 1.04, hc + (y - hc) * 1.04])
    if (arc.length >= 3) {
      p.shadedFill(arc, o.cap, mul(o.cap, SH_FELT), light, H.a, 0.35)
      p.poly(arc, null, ow)
    }
    const [px, py] = R([[cx, cut + 1 * u]])[0]
    p.ell(px, py, 48 * u, 7 * u, shade(o.cap, 1.05), ow, 0, 360, (a * 180) / Math.PI)
    const [bx, by] = R([[cx, crown - 4 * u]])[0]
    p.ell(bx, by, 9 * u, 9 * u, o.cap, ow)
  } else if (o.hat === "cap" || o.hat === "hair") {
    const cut = crown + (o.hat === "cap" ? 0.3 : 0.42) * HH
    const keep = (_x, y) => y < cut
    const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])))
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y))
      .map(([x, y]) => [cx + (x - cx) * 1.03, hc + (y - hc) * 1.03])
    if (arc.length < 3) return
    if (o.hat === "hair") {
      const [x0, y0] = arc[arc.length - 1], [x1, y1] = arc[0]
      for (let i = 1; i < 6; i++) arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4.5 * u : 0)])
    }
    const col = o.hat === "cap" ? o.cap : o.hair
    p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35)
    p.poly(arc, null, ow)
    if (o.hat === "hair") {
      const s = facing || 1
      p.stroke([[cx + s * 10 * u, cut - 30 * u], [cx + s * 2 * u, cut - 12 * u]], 1.3 * u)
    } else {
      const s = facing || (rnd(seed, 21) < 0.5 ? -1 : 1), [px, py] = R([[cx + s * 4 * u, cut + 1.5 * u]])[0]
      p.ell(px, py, 32 * u, 0.06 * HH, shade(col, 0.8), ow, 0, 180, (a * 180) / Math.PI)
    }
  } else if (o.hat === "tophat") {
    const yb = crown + 0.22 * HH, ht = 0.72 * HH, wb = 0.31 * W, wt = 0.33 * W, col = "#2e2a36"
    const body = R([[cx - wb, yb], [cx + wb, yb], [cx + wt, yb - ht], [cx - wt, yb - ht]])
    p.shadedFill(body, col, mul(col, SH_FELT), light, wt, 0.4)
    p.poly(body, null, ow)
    const [bx, by] = R([[cx, yb + 1 * u]])[0]
    p.ell(bx, by, 0.45 * W, 0.05 * HH, "#1d1b22", ow, 0, 360, (a * 180) / Math.PI)
  }
}

export function drawToonCharacterCanvas(o, { acao = "parado", expressao = "neutro", atividade = "nenhuma", t = 0, speaking = false, facing = 0 } = {}) {
  const cv = document.createElement("canvas")
  cv.width = 600
  cv.height = 1000
  const p = new Pen(cv.getContext("2d"))

  const seed = o.seed || 1
  const mode = acao === "correr" ? "march" : acao === "andar" ? "stroll" : "stand"
  const phase = acao === "correr" ? t * 1.9 : acao === "andar" ? t * 1.1 : 0
  const exprKey = EXPR_MAP[expressao] || (acao === "assustado" || acao === "bochecha" ? "shock" : acao === "debochar" ? "grin" : acao === "comemorar" ? "laugh" : "neutral")
  const blink = piscar(t, seed)
  const idl = idleMotion(t, seed)

  const Bd = { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 }
  const skin = o.skin || SKIN
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100
  const tall = (1 + Bd.torso + Bd.legs) * HH, sole = 975
  const bob = mode === "march" ? 0.025 * tall * Math.cos(2 * TAU * phase) : mode === "stroll" ? 0.015 * tall * Math.cos(2 * TAU * phase) : idl.bob
  const torsoBot = sole - Bd.legs * HH + bob
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, hipY = torsoBot - 0.12 * HH
  const thick = thickAngle(DEF_LIGHT), ow = 5 * u
  const legCol = mix(o.pants, INK, 0.55), armCol = mix(o.jacket, INK, 0.5), footCol = o.boots || INK
  const legW = 5.8 * u, footW = 7.5 * u

  // Pernas e pés
  const L = mode === "march" ? 75 : mode === "stroll" ? 33 : 0
  for (const [side, ph] of [[-1, 0], [1, 0.5]]) {
    const up = Math.max(0, Math.sin(TAU * (phase + ph))) * L
    const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u, fy = sole - 4 * u - up
    const k = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08]
    p.stroke(curve([hx, hipY], k, [fx, fy]), legW, legCol)
    p.stroke([[fx - side * 3 * u, fy], [fx + side * 13 * u, fy + 0.5 * u]], footW, footCol)
  }

  // Corpo com balanço contínuo (idle + caminhada)
  const sway = (mode === "march" ? 2.2 * Math.sin(TAU * phase) : mode === "stroll" ? 1.2 * Math.sin(TAU * phase) : idl.tilt) + (acao === "debochar" ? Math.sin(t * 9) * 2.5 : 0)
  p.rot = sway ? [rad(sway), 300, hipY] : null
  const T = { a: ((Bd.tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6, egg: 0.12, asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 }
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T)

  // Braços articulados com todas as poses expressivas (roman.js + storybook)
  const sh = (side) => [tcx + side * 0.85 * T.a, chin + 0.12 * HH]
  const sw = mode === "march" || mode === "stroll" ? Math.sin(TAU * phase) : 0
  const armPoints = (side) => {
    const S = sh(side)
    const X = (k) => tcx + side * (T.a * 1.1 + k * u)
    if (acao === "acenar" && side === 1) {
      const wv = Math.sin(t * 7)
      return { pts: [S, [X(16), S[1] - 0.2 * HH], [X(28 + 10 * wv), S[1] - 0.62 * HH]], front: false }
    }
    if (acao === "assustado" || acao === "comemorar") {
      return { pts: [S, [X(16), S[1] - 0.28 * HH], [X(24), S[1] - 0.72 * HH]], front: false }
    }
    if (acao === "bochecha") {
      return { pts: [S, [X(16), S[1] + 0.05 * HH], [300 + side * (H.a + 2 * u), hc + 0.25 * H.b]], front: false }
    }
    if (acao === "cintura") {
      return { pts: [S, [X(22), S[1] + 0.3 * HH], [tcx + side * T.a * 0.95, torsoBot - 0.3 * HH]], front: false }
    }
    if (acao === "barriga") {
      return { pts: [S, [X(8), S[1] + 0.45 * HH], [tcx + side * 0.25 * T.a, torsoBot - 0.35 * HH]], front: true }
    }
    if (acao === "cruzado") {
      return { pts: [S, [X(2), S[1] + 0.38 * HH], [tcx - side * 0.45 * T.a, S[1] + 0.32 * HH]], front: true }
    }
    if (acao === "pensando" && side === 1) {
      return { pts: [S, [X(26), S[1] + 0.05 * HH], [300 + (H.a + 16 * u), hc - 0.1 * HH]], front: false, swirl: true }
    }
    if (acao === "joinha" && side === 1) {
      return { pts: [S, [X(20), S[1] + 0.12 * HH], [X(44), S[1] - 0.12 * HH]], front: false, thumb: true }
    }
    if (acao === "mostrar" && side === 1) {
      return { pts: [S, [X(28), S[1] - 0.02 * HH], [X(62), S[1] - 0.1 * HH]], front: false, finger: true }
    }
    if (atividade === "pescar" && side === 1) {
      return { pts: [S, [X(18), S[1] + 0.18 * HH], [X(38), S[1] - 0.06 * HH]], front: false }
    }
    const ex = tcx + side * (1.14 * T.a + 4 * u)
    const fwd = side === 1 ? sw : -sw
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd)
    return { pts: [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]], front: false }
  }
  const leftArm = armPoints(-1), rightArm = armPoints(1)
  const drawArm = (armObj) => {
    p.stroke(curve(armObj.pts[0], armObj.pts[1], armObj.pts[2]), 5.2 * u, armCol)
    const [hx, hy] = armObj.pts[2]
    if (armObj.finger) {
      const dx = armObj.pts[2][0] - armObj.pts[1][0], dy = armObj.pts[2][1] - armObj.pts[1][1], l = Math.hypot(dx, dy) || 1
      p.stroke([[hx, hy], [hx + (dx / l) * 14 * u, hy + (dy / l) * 14 * u]], 2.6 * u)
    }
    if (armObj.thumb) {
      p.stroke([[hx, hy], [hx + Math.sign(hx - 300) * 6 * u, hy - 12 * u]], 2.6 * u)
    }
    if (armObj.swirl) {
      const sp = []
      for (let k = 1; k < 16; k++) { const ang = k * 0.8 + t * 5; sp.push([hx + 18 * u + Math.cos(ang) * k * 0.8 * u, hy - 14 * u + Math.sin(ang) * k * 0.8 * u]) }
      p.stroke(sp, 2.2 * u, "#5a6994")
    }
    p.dot(hx, hy, 5.6 * u)
  }
  if (!leftArm.front) drawArm(leftArm)
  if (!rightArm.front) drawArm(rightArm)

  // Tronco com cel-shading + reflexo branco igual demo-vaso + gola em V
  p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), DEF_LIGHT)
  p.clip(tp, () => {
    p.stroke([[tcx - 10 * u, chin - 2 * u], [tcx, chin + 12 * u], [tcx + 10 * u, chin - 2 * u]], 2.5 * u, INK)
    p.stroke([[tcx - 0.72 * T.a, tcy - 0.5 * T.b], [tcx - 0.78 * T.a, tcy + 0.15 * T.b]], 4.2 * u, "rgba(255,255,255,0.45)")
  })
  p.inkRing(tp, ow, thick)

  if (leftArm.front) drawArm(leftArm)
  if (rightArm.front) drawArm(rightArm)
  if (atividade === "pescar") {
    const [hx, hy] = rightArm.pts[2]
    p.stroke([[hx - 8 * u, hy + 18 * u], [hx + 68 * u, hy - 98 * u]], 3.2 * u, "#6e4726")
    p.stroke([[hx + 68 * u, hy - 98 * u], [hx + 72 * u, hy + 125 * u]], 1.2 * u, "rgba(255,255,255,0.7)")
  }

  // Cabeça gira sutilmente com o corpo + própria inclinação idle
  const [cpx, cpy] = rotAbout([300, chin], rad(sway), [300, hipY])
  p.rot = [rad(sway + idl.headTilt), 300, chin, cpx - 300, cpy - chin]
  const hp = blobPts(300, hc, H)
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), DEF_LIGHT, H.a)
  p.inkRing(hp, ow, thick)
  drawHat(p, o, hp, H, 300, hc, DEF_LIGHT, seed, facing)

  if (o.beard) {
    const [cx, cy] = [300, hc]
    const beardPts = [[cx - 32 * u, cy + 11 * u], [cx, cy + 62 * u], [cx + 32 * u, cy + 11 * u], [cx, cy + 20 * u]]
    p.poly(beardPts, o.beard, 3.6 * u)
    for (let i = -18; i <= 18; i += 9) {
      p.stroke([[cx + i * u, cy + 22 * u], [cx + i * 0.55 * u, cy + 44 * u]], 1.6 * u, "#9c704c")
    }
  }

  // Rosto (olhos, piscada, sobrancelhas afinadas, boca com lip-sync)
  const F = FACE[exprKey] || FACE.neutral
  const fx = 300 + 7 * u * facing, ex = (F.eye[0] === "shock" ? 12 : 13) * u, ey = hc
  for (const side of [-1, 1]) {
    const x = fx + side * ex
    const kind = blink >= 1 && F.eye[0] !== "shock" ? "dash" : blink > 0 && F.eye[0] === "lid" ? "dash" : F.eye[1]
    drawEye(p, kind, x, ey, u, side, 0)
    const [dI, dO] = F.brow, by = ey - 19 * u
    if (kind === "shock") p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u)
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u)
  }
  drawMouth(p, F.mouth, 300 + 8 * u * facing, hc + 20 * u, u, speaking, t)
  p.rot = null
  return cv
}
