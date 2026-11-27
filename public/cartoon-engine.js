/* Motor 3D Cartoon Estilo Kit-Animacao-3D (Cel-Shading + Texturas Procedurais + Personagens Bean + DOF + SFX + Legendas) */

import {
  INK,
  ELENCO,
  CLOUD_DAY,
  CLOUD_GOLD,
  M,
  rep,
  rng,
  texGrass,
  texCobble,
  texSand,
  texWoodFloor,
  texWater,
  texRoof,
  texFacade,
  texCloudHD,
  texPlanet,
  drawToonCharacterCanvas,
} from "/cartoon-kit-paint.js"

const NOINK = 3

const CEU = {
  dia: { topo: "#3b8de0", meio: "#7cc0f2", horiz: "#dff1ff", sol: "#fff4e0", solI: 1.35, amb: "#cfe6ff", ambI: 0.95, nevoa: "#cfe6f7" },
  dourado: { topo: "#4a3a8c", meio: "#e2789a", horiz: "#ffc58a", sol: "#ffb36b", solI: 1.35, amb: "#d8a8c8", ambI: 0.9, nevoa: "#f2b79a" },
  noite: { topo: "#070a24", meio: "#1b2257", horiz: "#3a3f86", sol: "#9fb4ff", solI: 0.85, amb: "#5262b8", ambI: 0.72, nevoa: "#20285e" },
  espaco: { topo: "#05030f", meio: "#0d0826", horiz: "#1a1040", sol: "#ffffff", solI: 1.5, amb: "#6a5ab8", ambI: 0.55, nevoa: null },
}

const PAREDES = ["#f4e3c1", "#f2c6b4", "#cfe3d2", "#f6d58e", "#d8d1ef", "#ffffff"]
const TELHADOS = ["#c8553d", "#3d6fb0", "#6b4f8c", "#d98b2b", "#4f8a5b"]

function buildRamp(THREE) {
  const d = new Uint8Array([145, 145, 145, 255, 255, 255, 255, 255])
  const t = new THREE.DataTexture(d, 2, 1, THREE.RGBAFormat)
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

function addInkEdges(THREE, mesh, threshold = 32) {
  const eg = new THREE.EdgesGeometry(mesh.geometry, threshold)
  const line = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: INK }))
  mesh.add(line)
  return line
}

function addHullOutline(THREE, mesh, scale = 1.032) {
  const mat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
  const out = new THREE.Mesh(mesh.geometry, mat)
  out.scale.setScalar(scale)
  mesh.add(out)
  return out
}

function createHouse(THREE, toon, x, z, o = {}) {
  const r = rng(o.seed ?? Math.round(x * 13 + z * 7))
  const w = o.w ?? 6, d = o.d ?? 5, h = o.h ?? 4 + Math.floor(r() * 3) * 2.6
  const parede = o.parede ?? PAREDES[Math.floor(r() * PAREDES.length)]
  const tel = o.telhado ?? TELHADOS[Math.floor(r() * TELHADOS.length)]
  const g = new THREE.Group()

  const fr = toon("#ffffff", texFacade(THREE, `f_${parede}_${w}_${h}`, w, h, { wall: parede, shutter: tel, door: true }))
  const lado = toon("#ffffff", texFacade(THREE, `l_${parede}_${d}_${h}`, d, h, { wall: parede, shutter: tel }))
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [lado, lado, toon(parede), toon(parede), fr, fr])
  corpo.position.y = h / 2
  corpo.castShadow = true
  corpo.receiveShadow = true
  addInkEdges(THREE, corpo, 35)
  g.add(corpo)

  const rh = Math.min(w, d) * 0.45
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.35, 0), new THREE.Vector2(w / 2 + 0.35, 0), new THREE.Vector2(0, rh)])
  const tg = new THREE.ExtrudeGeometry(sh, { depth: d + 0.7, bevelEnabled: false })
  tg.translate(0, 0, -(d + 0.7) / 2)
  const tet = new THREE.Mesh(tg, toon("#ffffff", rep(texRoof(THREE, tel), 2, 2)))
  tet.position.y = h
  tet.castShadow = true
  tet.receiveShadow = true
  addInkEdges(THREE, tet, 35)
  g.add(tet)

  g.position.set(x, 0, z)
  g.rotation.y = ((o.yaw ?? 0) * Math.PI) / 180
  return g
}

function createTree(THREE, toon, x, z, h = 5, cor = "#4fa34a", seed = 1) {
  const r = rng(seed + Math.round(x * 3 + z))
  const g = new THREE.Group()
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * h / 5, 0.24 * h / 5, h * 0.46, 10), toon("#7a5232"))
  tr.position.y = h * 0.23
  tr.castShadow = true
  addHullOutline(THREE, tr, 1.06)
  g.add(tr)
  for (let i = 0; i < 4; i++) {
    const col = new THREE.Color(cor).offsetHSL(0, 0, (r() - 0.5) * 0.08)
    const s = new THREE.Mesh(new THREE.SphereGeometry(h * (0.21 + r() * 0.09), 16, 12), toon(col))
    s.position.set((r() - 0.5) * h * 0.34, h * (0.56 + r() * 0.24), (r() - 0.5) * h * 0.34)
    s.castShadow = true
    addHullOutline(THREE, s, 1.04)
    g.add(s)
  }
  g.position.set(x, 0, z)
  return g
}

function buildWorld3D(THREE, cenario, luz, rampTex) {
  const cfg = CEU[luz] || CEU.dia
  const scene = new THREE.Scene()
  if (cfg.nevoa && cenario !== "sala") scene.fog = new THREE.Fog(cfg.nevoa, 38, 175)

  // Céu procedural
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { a: { value: new THREE.Color(cfg.topo) }, b: { value: new THREE.Color(cfg.meio) }, h: { value: new THREE.Color(cfg.horiz) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 a,b,h; varying vec3 vP; void main(){ float y = clamp(vP.y, -0.2, 1.); vec3 col = y < .18 ? mix(h, b, smoothstep(-.05,.18,y)) : mix(b, a, smoothstep(.18,.85,y)); gl_FragColor = vec4(col,1.); }",
  }))
  ceu.renderOrder = -10
  scene.add(ceu)

  // Luz direcional com sombras projetadas + hemisfério
  const sol = new THREE.DirectionalLight(cfg.sol, cfg.solI)
  sol.position.set(18, 28, 16)
  sol.castShadow = true
  sol.shadow.mapSize.set(1024, 1024)
  sol.shadow.camera.near = 2
  sol.shadow.camera.far = 95
  sol.shadow.camera.left = -26
  sol.shadow.camera.right = 26
  sol.shadow.camera.top = 26
  sol.shadow.camera.bottom = -26
  sol.shadow.bias = -0.0005
  scene.add(sol, sol.target)
  scene.add(new THREE.HemisphereLight(cfg.amb, "#6b5a4a", cfg.ambI))

  const toon = (color, map = null) => new THREE.MeshToonMaterial({ color, map, gradientMap: rampTex })

  const animated = { sea: null, terra: null, lua: null }

  if (luz === "noite" || luz === "espaco") {
    const r = rng(99), n = luz === "espaco" ? 1600 : 750, p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      p.set([760 * s * Math.cos(a), 760 * Math.abs(u) * 0.9 + 20, 760 * s * Math.sin(a)], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(p, 3))
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 2.3, sizeAttenuation: false, fog: false, depthWrite: false })))
  }

  if (cenario !== "espaco" && cenario !== "sala" && (luz === "dia" || luz === "dourado")) {
    const pal = luz === "dourado" ? CLOUD_GOLD : CLOUD_DAY
    for (const [cx, cy, cz, cw, sd] of [[-26, 26, -90, 52, 1], [28, 32, -110, 62, 2], [-2, 36, -130, 56, 3], [-58, 30, -105, 54, 4], [60, 28, -98, 50, 5]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCloudHD(THREE, sd, pal), depthWrite: false, fog: false, transparent: true }))
      sp.scale.set(cw, cw / 2, 1)
      sp.position.set(cx, cy, cz)
      scene.add(sp)
    }
  }

  // Colinas verdes suaves e montanhas nevadas ao longe (visual cartoon-short-kit)
  if (cenario !== "espaco" && cenario !== "sala" && cenario !== "praia") {
    const rH = rng(41)
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * 0.85 + (i / 7) * Math.PI * 0.7, d = 68 + rH() * 45
      const hill = new THREE.Mesh(new THREE.SphereGeometry(20 + rH() * 14, 18, 10), toon(i % 2 ? "#7aa64c" : "#84ad5e"))
      hill.position.set(Math.cos(a) * d, -6.5, Math.sin(a) * d)
      hill.scale.y = 0.55 + rH() * 0.22
      scene.add(hill)
    }
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.78 + (i / 4) * Math.PI * 0.56, d = 140 + rH() * 35
      const hh = 34 + rH() * 24, rw = 26 + rH() * 16
      const mg = new THREE.Group()
      mg.position.set(Math.cos(a) * d, -2, Math.sin(a) * d)
      const body = new THREE.Mesh(new THREE.ConeGeometry(rw, hh, 7), toon("#8ca4b8"))
      body.position.y = hh / 2
      const snow = new THREE.Mesh(new THREE.ConeGeometry(rw * 0.32, hh * 0.32, 7), toon("#f4f6fa"))
      snow.position.y = hh * 0.85
      mg.add(body, snow)
      scene.add(mg)
    }
  }

  if (cenario === "praia") {
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon("#ffffff", rep(texSand(THREE), 30, 30)))
    sand.rotation.x = -Math.PI / 2
    sand.receiveShadow = true
    scene.add(sand)

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), toon("#ffffff", rep(texWater(THREE), 24, 12)))
    sea.rotation.x = -Math.PI / 2
    sea.position.set(0, 0.04, -72)
    scene.add(sea)
    animated.sea = sea

    const foam = new THREE.Mesh(new THREE.BoxGeometry(180, 0.08, 0.9), new THREE.MeshBasicMaterial({ color: "#eff9ff" }))
    foam.position.set(0, 0.05, -12)
    scene.add(foam)

    // Píer de madeira
    for (const px of [-3.6, -2.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.3, 10), toon("#6e4b2c"))
      post.position.set(px, 1.15, -10)
      post.castShadow = true
      addHullOutline(THREE, post, 1.06)
      scene.add(post)
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 4.6), toon("#ffffff", rep(texWoodFloor(THREE), 1, 2)))
    deck.position.set(-2.85, 1.45, -11.6)
    deck.castShadow = true
    addInkEdges(THREE, deck, 35)
    scene.add(deck)

    // Farol completo
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.25, 1.4, 18), toon("#8b8e98"))
    base.position.set(4.0, 0.7, -15)
    base.castShadow = true
    addHullOutline(THREE, base, 1.03)
    scene.add(base)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.85, 9.2, 20), toon("#f6f2e8"))
    tower.position.set(4.0, 5.8, -15)
    tower.castShadow = true
    addHullOutline(THREE, tower, 1.03)
    scene.add(tower)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.56, 1.5, 20), toon("#d93b2b"))
    band.position.set(4.0, 6.8, -15)
    addHullOutline(THREE, band, 1.03)
    scene.add(band)
    const capBase = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.28, 0.35, 18), toon("#232732"))
    capBase.position.set(4.0, 10.4, -15)
    scene.add(capBase)
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 1.3, 16), new THREE.MeshBasicMaterial({ color: "#ffe787" }))
    lantern.position.set(4.0, 11.2, -15)
    scene.add(lantern)
    const dome = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.2, 18), toon("#d93b2b"))
    dome.position.set(4.0, 12.3, -15)
    addHullOutline(THREE, dome, 1.04)
    scene.add(dome)

    for (const [rx, rz, rs] of [[-5.0, -9.0, 1.15], [1.6, -11.0, 0.85], [-1.0, -15.5, 1.45], [6.4, -12.0, 1.15]]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), toon("#7a7e8a"))
      rock.position.set(rx, rs * 0.42, rz)
      rock.castShadow = true
      addHullOutline(THREE, rock, 1.04)
      scene.add(rock)
    }
    scene.add(createHouse(THREE, toon, -7.2, -16, { w: 5.2, d: 4.5, h: 4.2, yaw: 20, parede: "#f4e3c1", telhado: "#c8553d", seed: 4 }))
  } else if (cenario === "vila" || cenario === "cidade") {
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon("#ffffff", rep(texCobble(THREE), 44, 44)))
    plaza.rotation.x = -Math.PI / 2
    plaza.receiveShadow = true
    scene.add(plaza)

    if (cenario === "vila") {
      // Pórtico / templo clássico ao fundo direito igual demo-vaso + casinhas da vila ao redor
      const wall = new THREE.Mesh(new THREE.BoxGeometry(10.5, 8.2, 6), toon("#ebe1ce"))
      wall.position.set(4.2, 4.1, -13.5)
      wall.castShadow = true
      wall.receiveShadow = true
      addInkEdges(THREE, wall, 35)
      scene.add(wall)
      const frieze = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.3, 7.6), toon("#f5ecdb"))
      frieze.position.set(4.2, 8.5, -13.1)
      frieze.castShadow = true
      addInkEdges(THREE, frieze, 35)
      scene.add(frieze)
      for (const cx of [0.2, 2.8, 5.4, 8.0]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.54, 7.9, 14), toon("#f4ebda"))
        col.position.set(cx, 3.95, -9.8)
        col.castShadow = true
        addHullOutline(THREE, col, 1.04)
        scene.add(col)
      }
      scene.add(createHouse(THREE, toon, -6.5, -12.5, { w: 6.2, d: 5.0, h: 5.4, yaw: 18, parede: "#f2e1c0", telhado: "#c8553d", seed: 9 }))
      scene.add(createHouse(THREE, toon, -14.5, -18, { w: 6.0, d: 5.0, h: 6.8, yaw: 0, parede: "#f6d58e", telhado: "#3d6fb0", seed: 12 }))
      scene.add(createHouse(THREE, toon, 14.5, -18, { w: 6.0, d: 5.0, h: 6.0, yaw: -15, parede: "#cfe3d2", telhado: "#c8553d", seed: 14 }))
      scene.add(createTree(THREE, toon, -2.5, -16.5, 4.8, "#4fa34a", 3))
      scene.add(createTree(THREE, toon, 10.2, -12.0, 5.2, "#4fa34a", 7))
    } else {
      const r = rng(7)
      for (let x = -22; x <= 22; x += 11) for (let z = -26; z <= -4; z += 11) {
        if (Math.hypot(x, z) < 8.5) continue
        if (r() < 0.78) scene.add(createHouse(THREE, toon, x + (r() - 0.5) * 1.5, z - 5, { yaw: Math.round(r() * 4) * 90, seed: Math.round(r() * 999) }))
        else scene.add(createTree(THREE, toon, x, z - 5, 4.5 + r() * 2.2, "#4fa34a", Math.round(r() * 99)))
      }
    }
  } else if (cenario === "floresta") {
    const meadow = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon("#ffffff", rep(texGrass(THREE), 30, 30)))
    meadow.rotation.x = -Math.PI / 2
    meadow.receiveShadow = true
    scene.add(meadow)
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue
      const tx = i * 3.1 + ((Math.abs(i) % 2) ? 0.6 : -0.6)
      const tz = -7.5 - (Math.abs(i) % 3) * 4.2
      scene.add(createTree(THREE, toon, tx, tz, 4.4 + (Math.abs(i) % 3) * 1.1, "#4fa34a", i * 17 + 5))
    }
    for (const [rx, rz, rs] of [[-4.0, -6.5, 0.9], [3.5, -8.5, 1.2]]) {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), toon("#8b8d94"))
      rk.position.set(rx, rs * 0.42, rz)
      rk.castShadow = true
      addHullOutline(THREE, rk, 1.04)
      scene.add(rk)
    }
  } else if (cenario === "espaco") {
    const terra = new THREE.Mesh(new THREE.SphereGeometry(5.5, 36, 24), toon("#ffffff", texPlanet(THREE, "terra", 4)))
    terra.position.set(5.2, 4.5, -18)
    scene.add(terra)
    const halo = new THREE.Mesh(new THREE.SphereGeometry(5.68, 32, 20), new THREE.MeshBasicMaterial({ color: "#9fe0ff", transparent: true, opacity: 0.3, side: THREE.BackSide, depthWrite: false }))
    terra.add(halo)
    animated.terra = terra

    const lua = new THREE.Mesh(new THREE.SphereGeometry(1.7, 28, 18), toon("#ffffff", texPlanet(THREE, "lua", 2)))
    lua.position.set(-5.8, 7.2, -16)
    scene.add(lua)
    animated.lua = lua

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon("#ffffff", texPlanet(THREE, "lua", 9)))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
  } else if (cenario === "sala") {
    // Sala aconchegante completa (piso de tábua, paredes creme com rodapé, janela aberta, mesa, quadro)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), toon("#ffffff", rep(texWoodFloor(THREE), 9, 9)))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 0.5), toon("#f4ead6"))
    backWall.position.set(0, 4.5, -6.2)
    backWall.receiveShadow = true
    addInkEdges(THREE, backWall, 35)
    scene.add(backWall)

    const wainscot = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 0.56), toon("#c99d6b"))
    wainscot.position.set(0, 0.7, -6.15)
    addInkEdges(THREE, wainscot, 35)
    scene.add(wainscot)

    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 20), toon("#eadcc4"))
    sideWall.position.set(-7.5, 4.5, 0)
    sideWall.receiveShadow = true
    addInkEdges(THREE, sideWall, 35)
    scene.add(sideWall)

    // Janela com vista do céu e cortinas
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 0.16), toon("#f7f2e8"))
    winFrame.position.set(-2.4, 3.2, -5.9)
    addInkEdges(THREE, winFrame, 35)
    scene.add(winFrame)
    const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.3), new THREE.MeshBasicMaterial({ color: "#79c0f5" }))
    winGlass.position.set(-2.4, 3.2, -5.8)
    scene.add(winGlass)
    const sill = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 0.35), toon("#e6dac7"))
    sill.position.set(-2.4, 1.75, -5.8)
    addInkEdges(THREE, sill, 35)
    scene.add(sill)

    // Quadro na parede direita
    const artFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.14), toon("#7a4a2c"))
    artFrame.position.set(2.6, 3.4, -5.9)
    addInkEdges(THREE, artFrame, 35)
    scene.add(artFrame)
    const artCanvas = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshBasicMaterial({ color: "#e8b55d" }))
    artCanvas.position.set(2.6, 3.4, -5.81)
    scene.add(artCanvas)

    // Mesa de madeira e vaso com planta
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.6), toon("#9c6538"))
    tableTop.position.set(2.6, 1.15, -3.5)
    tableTop.castShadow = true
    addInkEdges(THREE, tableTop, 35)
    scene.add(tableTop)
    for (const lx of [1.2, 4.0]) for (const lz of [-4.1, -2.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), toon("#7a4a2c"))
      leg.position.set(lx, 0.57, lz)
      leg.castShadow = true
      scene.add(leg)
    }
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.45, 14), toon("#d9534f"))
    vase.position.set(2.8, 1.46, -3.5)
    addHullOutline(THREE, vase, 1.05)
    scene.add(vase)
  }

  return { scene, animated }
}

function drawCaptionOverlay(ctx, W, H, captionGroup, extraText) {
  if (extraText) {
    ctx.save()
    let fs = Math.round(W * 0.048)
    ctx.font = `900 ${fs}px Inter, "Segoe UI", Arial, sans-serif`
    const maxW = W * 0.84
    const words = extraText.toUpperCase().split(/\s+/).filter(Boolean)
    const wrap = (fSize) => {
      ctx.font = `900 ${fSize}px Inter, "Segoe UI", Arial, sans-serif`
      const out = []; let cur = ""
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w
        if (ctx.measureText(test).width > maxW && cur) { out.push(cur); cur = w } else cur = test
      }
      if (cur) out.push(cur)
      return out
    }
    let lines = wrap(fs)
    while (lines.length > 2 && fs > W * 0.03) { fs -= 2; lines = wrap(fs) }
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.lineJoin = "round"
    ctx.lineWidth = Math.round(fs * 0.28)
    ctx.strokeStyle = "#0e0e14"
    ctx.fillStyle = "#ffffff"
    lines.forEach((ln, i) => {
      const y = H * 0.1 + i * (fs * 1.24)
      ctx.strokeText(ln, W / 2, y)
      ctx.fillText(ln, W / 2, y)
    })
    ctx.restore()
  }

  if (!captionGroup?.words?.length) return
  ctx.save()
  const baseFs = Math.round(W * 0.056)
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  const y = H * 0.76
  const upper = captionGroup.words.map((w) => w.toUpperCase())
  const gap = Math.round(baseFs * 0.36)
  const widths = upper.map((w, idx) => {
    const fs = idx === captionGroup.active ? Math.round(baseFs * 1.08) : baseFs
    ctx.font = `900 ${fs}px Inter, "Segoe UI", Arial, sans-serif`
    return ctx.measureText(w).width
  })
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (upper.length - 1)
  let x = (W - totalW) / 2

  upper.forEach((w, idx) => {
    const isAct = idx === captionGroup.active
    const fs = isAct ? Math.round(baseFs * 1.08) : baseFs
    ctx.font = `900 ${fs}px Inter, "Segoe UI", Arial, sans-serif`
    ctx.textAlign = "left"
    ctx.lineWidth = Math.round(fs * 0.28)
    ctx.strokeStyle = "#000000"
    ctx.shadowColor = "rgba(0,0,0,0.85)"
    ctx.shadowOffsetY = Math.round(fs * 0.09)
    ctx.shadowBlur = 0
    ctx.strokeText(w, x, y)
    ctx.fillStyle = isAct ? "#ffd23f" : "#ffffff"
    ctx.fillText(w, x, y)
    x += widths[idx] + gap
  })
  ctx.restore()
}

export function createCartoonRenderer(width = 540, height = 960) {
  const THREE = window.THREE
  if (!THREE) throw new Error("Three.js não carregado.")

  const glCanvas = document.createElement("canvas")
  glCanvas.width = width
  glCanvas.height = height
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(width, height, false)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const rampTex = buildRamp(THREE)
  const outCanvas = document.createElement("canvas")
  outCanvas.width = width
  outCanvas.height = height
  const ctx = outCanvas.getContext("2d")

  const worldCache = new Map()
  const getWorld = (cenario, luz) => {
    const k = `${cenario}|${luz}`
    if (!worldCache.has(k)) worldCache.set(k, buildWorld3D(THREE, cenario, luz, rampTex))
    return worldCache.get(k)
  }

  const charGeo = new THREE.PlaneGeometry(1.3, 2.16)
  charGeo.translate(0, 1.03, 0)
  const shadowGeo = new THREE.CircleGeometry(0.36, 24)
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#1d1630", transparent: true, opacity: 0.32, depthWrite: false })

  function renderFrame(sceneCfg, t, captionGroup = null, sceneLocalT = t, showCaptions = true) {
    const cenario = sceneCfg.cenario || "vila"
    const luz = sceneCfg.luz || "dia"
    const worldObj = getWorld(cenario, luz)
    const world = worldObj.scene

    if (worldObj.animated.terra) worldObj.animated.terra.rotation.y = t * 0.22
    if (worldObj.animated.lua) {
      const a = t * 0.3
      worldObj.animated.lua.position.set(Math.cos(a) * -6.5, 7.2, -16 + Math.sin(a) * 3)
      worldObj.animated.lua.rotation.y = -a
    }

    // Motion contínuo (creep + smooth glides + impacto kick + Dutch roll nas viradas)
    const u = M.clamp(sceneLocalT / 3.2, 0, 1)
    const baseFov = sceneCfg.plano === "close" ? 32 : sceneCfg.plano === "aberto" ? 50 : 40
    const creepFov = baseFov * (1 - 0.035 * u)
    const camZ = sceneCfg.plano === "close" ? 3.95 : sceneCfg.plano === "aberto" ? 8.6 : 5.8
    const zoom = sceneCfg.camera === "aproximar" ? -1.15 * M.smooth(u) : sceneCfg.camera === "afastar" ? 1.35 * M.smooth(u) : -0.25 * M.easeOut(u)
    const panX = sceneCfg.camera === "pan" ? Math.sin(t * 0.9) * 1.15 : 0

    // Kick impact de 7 frames no início da cena se houver virada ou tremor
    const fLoc = Math.round(sceneLocalT * 30)
    const isHit = sceneCfg.virada || sceneCfg.efeito === "tremor"
    const kickAmp = isHit && fLoc < 7 ? (fLoc % 2 ? -1 : 1) * (1 - fLoc / 7) : 0
    const shakeX = kickAmp * 0.14 + (sceneCfg.efeito === "tremor" ? Math.sin(t * 36) * 0.05 : 0)
    const rollDeg = (sceneCfg.virada ? 2.8 : sceneCfg.acao === "assustado" ? -2.2 : 0) + kickAmp * 3.2

    const cam = new THREE.PerspectiveCamera(creepFov, width / height, 0.1, 1200)
    cam.position.set(panX + shakeX, sceneCfg.plano === "close" ? 1.48 : sceneCfg.plano === "aberto" ? 1.85 : 1.55, Math.max(2.4, camZ + zoom))
    cam.lookAt(panX * 0.4, (sceneCfg.plano === "close" ? 1.38 : 1.25) + kickAmp * 0.08, -2.5)
    if (rollDeg) cam.rotateZ((rollDeg * Math.PI) / 180)

    // Monta elenco principal + figurantes ao fundo em planos médios/abertos de vila/cidade/praia
    const tempNodes = []
    const addChar = (outfit, opts, px, pz, layer = 0) => {
      const cv = drawToonCharacterCanvas(outfit, opts)
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(charGeo, mat)
      mesh.position.set(px, 0, pz)
      mesh.rotation.y = Math.atan2(cam.position.x - px, cam.position.z - pz)
      mesh.layers.set(layer)
      world.add(mesh)

      const sh = new THREE.Mesh(shadowGeo, shadowMat)
      sh.rotation.x = -Math.PI / 2
      sh.scale.set(1.0, 0.55, 1)
      sh.position.set(px, 0.02, pz)
      sh.layers.set(layer)
      world.add(sh)
      tempNodes.push({ mesh, sh, tex, mat })
    }

    const cast = sceneCfg.quemAparece?.length ? sceneCfg.quemAparece : ["silas"]
    const isClose = sceneCfg.plano === "close"
    const charLayer = isClose ? NOINK : 0

    if (!isClose && (cenario === "vila" || cenario === "cidade") && sceneCfg.plano === "aberto") {
      const extrasPos = [[-2.6, -3.2], [-1.7, -4.1], [2.4, -3.4], [1.6, -4.6], [3.3, -2.8]]
      extrasPos.forEach(([ex, ez], idx) => {
        addChar(ELENCO.extra(idx), { acao: "parado", expressao: "neutro", t, facing: ex > 0 ? -1 : 1 }, ex, ez, 0)
      })
    }

    cast.forEach((id, idx) => {
      const outfit = ELENCO[id] || ELENCO.silas
      const px = (idx - (cast.length - 1) / 2) * 1.15
      addChar(outfit, {
        acao: sceneCfg.acao || "parado",
        expressao: sceneCfg.expressao || "neutro",
        atividade: sceneCfg.atividade || "nenhuma",
        t,
        speaking: Boolean(captionGroup?.words?.length) && idx === 0,
        facing: idx % 2 === 0 ? 1 : -1,
      }, px, 0.2, charLayer)
    })

    if (isClose) {
      // Pass 1: mundo desfocado estilo cinema (demo-vaso)
      renderer.autoClear = true
      renderer.setClearColor(0x000000, 1)
      cam.layers.set(0)
      renderer.render(world, cam)
      ctx.save()
      ctx.filter = "blur(5.5px)"
      ctx.drawImage(glCanvas, -8, -8, width + 16, height + 16)
      ctx.restore()

      // Pass 2: personagem principal nítido por cima sobre fundo transparente
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, true, false)
      cam.layers.set(NOINK)
      const prevFog = world.fog
      world.fog = null
      renderer.render(world, cam)
      world.fog = prevFog
      ctx.drawImage(glCanvas, 0, 0, width, height)
    } else {
      renderer.autoClear = true
      renderer.setClearColor(0x000000, 1)
      cam.layers.enable(0)
      cam.layers.enable(NOINK)
      renderer.render(world, cam)
      ctx.drawImage(glCanvas, 0, 0, width, height)
    }

    for (const n of tempNodes) {
      world.remove(n.mesh, n.sh)
      n.mat.dispose()
      n.tex.dispose()
    }

    if (sceneCfg.efeito === "flash" && fLoc < 6) {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.7 - fLoc * 0.11)})`
      ctx.fillRect(0, 0, width, height)
    }
    drawCaptionOverlay(ctx, width, height, showCaptions ? captionGroup : null, sceneCfg.textoTela)
    return outCanvas
  }

  return {
    outCanvas,
    preloadScenes(list = []) {
      for (const c of list) getWorld(c.cenario || "vila", c.luz || "dia")
    },
    renderThumbnailDataUrl(sceneCfg) {
      const clean = (sceneCfg.texto || "").replace(/\[[^\]]{1,32}\]\s*/g, " ").trim()
      const words = clean.split(/\s+/).filter(Boolean).slice(0, 3)
      renderFrame(sceneCfg, 0.4, words.length ? { words, active: 0 } : null, 0.4, true)
      return outCanvas.toDataURL("image/jpeg", 0.9)
    },
    renderCoverPngDataUrl(sceneCfg, hookText = "") {
      renderFrame({ ...sceneCfg, textoTela: hookText, plano: sceneCfg.plano === "aberto" ? "medio" : sceneCfg.plano }, 0.4, null, 0.4, false)
      return outCanvas.toDataURL("image/png")
    },
    renderFrame,
    dispose() {
      rampTex.dispose()
      charGeo.dispose()
      shadowGeo.dispose()
      shadowMat.dispose()
      renderer.dispose()
    },
  }
}

export async function recordCartoonVideo({ cenas, palavras, audioSrc, duration, showCaptions = true, onProgress, previewHost }) {
  const W = 1080
  const H = 1920
  const engine = createCartoonRenderer(W, H)

  const cv = engine.outCanvas
  let tempMount = false
  if (previewHost) {
    cv.style.cssText = "width:140px;aspect-ratio:9/16;border-radius:10px;display:block;background:#000"
    previewHost.replaceChildren(cv)
  } else {
    cv.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;pointer-events:none"
    document.body.appendChild(cv)
    tempMount = true
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const actx = new AudioCtx()
  if (actx.state === "suspended") await actx.resume()
  const dest = actx.createMediaStreamDestination()

  const loadAudioBuffer = async (url) => {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    return actx.decodeAudioData(buf)
  }

  const voiceBuf = await loadAudioBuffer(audioSrc)
  const finalDuration = Math.max(duration || 0, voiceBuf.duration || 5)
  const voiceSrc = actx.createBufferSource()
  voiceSrc.buffer = voiceBuf
  voiceSrc.connect(dest)

  // Trilha curiosa (com Twist Music Drop antes da virada!) + suíte completa SFX (/sons/*.wav)
  const activeAudioNodes = [voiceSrc]
  const tryLoad = (u) => loadAudioBuffer(u).catch(() => null)
  const [bgBuf, whooshBuf, surpresaBuf, impactoBuf, popBuf, subidaBuf] = await Promise.all([
    tryLoad("/sons/trilha_curiosa.wav"),
    tryLoad("/sons/whoosh.wav"),
    tryLoad("/sons/surpresa.wav"),
    tryLoad("/sons/impacto.wav"),
    tryLoad("/sons/pop.wav"),
    tryLoad("/sons/subida.wav"),
  ])

  // Pré-aquece todos os cenários 3D usados antes de agendar/iniciar áudio e gravação
  engine.preloadScenes(cenas)
  engine.renderFrame(cenas[0], 0, null, 0, showCaptions)

  let bgSrc = null
  let bgGain = null
  if (bgBuf) {
    bgSrc = actx.createBufferSource()
    bgSrc.buffer = bgBuf
    bgSrc.loop = true
    bgGain = actx.createGain()
    bgGain.gain.value = 0.16
    bgSrc.connect(bgGain)
    bgGain.connect(dest)
    activeAudioNodes.push(bgSrc)
  }

  const stream = cv.captureStream(30)
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)

  const mime = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
    .find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm"

  const chunks = []
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }

  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime })
      resolve({ blob, mimeType: mime, ext: mime.includes("mp4") ? "mp4" : "webm", duration: finalDuration })
    }
  })

  const sliceDur = finalDuration / Math.max(1, cenas.length)
  const now = actx.currentTime
  const twistIdx = cenas.findIndex((c) => c.virada)
  const dropIdx = twistIdx >= 0 ? twistIdx : Math.max(1, cenas.length - 1)
  if (bgGain && dropIdx > 0) {
    const dropAt = now + dropIdx * sliceDur - 0.12
    if (dropAt > now + 0.5) {
      bgGain.gain.setValueAtTime(0.16, Math.max(now, dropAt - 0.15))
      bgGain.gain.linearRampToValueAtTime(0.0001, dropAt)
    }
  }

  const playSfx = (buf, at, vol) => {
    if (!buf || at < now) return
    const s = actx.createBufferSource()
    s.buffer = buf
    const g = actx.createGain()
    g.gain.value = vol
    s.connect(g); g.connect(dest)
    s.start(at)
    activeAudioNodes.push(s)
  }

  cenas.forEach((cena, i) => {
    const startAt = now + i * sliceDur
    if (i > 0 && whooshBuf && i % 2 === 0 && i !== dropIdx) playSfx(whooshBuf, startAt, 0.22)
    if (cena.textoTela && popBuf) playSfx(popBuf, startAt + 0.04, 0.25)
    if (i === dropIdx - 1 && subidaBuf) playSfx(subidaBuf, startAt, 0.24)
    if (i === dropIdx || cena.virada || cena.efeito === "flash") {
      playSfx(impactoBuf || surpresaBuf, startAt, 0.42)
      if (surpresaBuf && impactoBuf) playSfx(surpresaBuf, startAt + 0.06, 0.34)
    }
  })

  voiceSrc.start(now)
  if (bgSrc) bgSrc.start(now)
  recorder.start(250)

  const wordList = palavras || []
  const t0 = performance.now()
  let renderedCount = 0
  await new Promise((resolve) => {
    function tick() {
      const elapsed = (performance.now() - t0) / 1000
      if (elapsed >= finalDuration && renderedCount >= 10) {
        resolve()
        return
      }
      const clampedT = Math.min(elapsed, finalDuration)
      const idx = Math.min(cenas.length - 1, Math.floor(clampedT / sliceDur))
      const sceneLocalT = clampedT - idx * sliceDur
      let wIdx = wordList.findIndex((w) => clampedT >= w.inicio && clampedT <= w.fim)
      if (wIdx < 0) wIdx = wordList.findLastIndex((w) => clampedT >= w.inicio)
      let captionGroup = null
      if (showCaptions && wIdx >= 0) {
        const gStart = Math.floor(wIdx / 3) * 3
        captionGroup = {
          words: wordList.slice(gStart, gStart + 3).map((w) => w.palavra),
          active: wIdx - gStart,
        }
      }
      engine.renderFrame(cenas[idx], clampedT, captionGroup, sceneLocalT, showCaptions)
      renderedCount++
      onProgress?.(Math.min(99, Math.round((clampedT / finalDuration) * 100)), clampedT)
      setTimeout(tick, 33)
    }
    tick()
  })

  if (recorder.state !== "inactive") recorder.stop()
  const result = await done
  for (const n of activeAudioNodes) { try { n.stop() } catch { } }
  if (tempMount && cv.parentNode) cv.parentNode.removeChild(cv)
  await actx.close().catch(() => { })
  engine.dispose()
  return result
}
