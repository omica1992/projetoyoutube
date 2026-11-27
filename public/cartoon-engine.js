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

  // Colinas verdes suaves e montanhas nevadas ao longe (nunca em espaço, sala, praia ou alto-mar)
  if (cenario !== "espaco" && cenario !== "sala" && cenario !== "praia" && cenario !== "oceano") {
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
    const winColor = luz === "noite" || luz === "espaco" ? "#0d1638" : luz === "dourado" ? "#f59d62" : "#79c0f5"
    const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.3), new THREE.MeshBasicMaterial({ color: winColor }))
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
  } else if (cenario === "oceano") {
    // Alto-mar infinito (sem colinas verdes) + convés de navio sob os personagens
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), toon("#ffffff", rep(texWater(THREE), 34, 34)))
    ocean.rotation.x = -Math.PI / 2
    ocean.position.set(0, -0.35, -40)
    scene.add(ocean)
    animated.sea = ocean
    animated.seaBaseY = -0.35

    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, 5.2), toon("#ffffff", rep(texWoodFloor(THREE), 5, 2)))
    deck.position.set(0, -0.22, 0.8)
    deck.receiveShadow = true
    addInkEdges(THREE, deck, 35)
    scene.add(deck)

    // Guarda-corpo de convés branco com postes e corrimão de madeira
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.14), toon("#8b5a2b"))
    railTop.position.set(0, 0.92, -1.75)
    addInkEdges(THREE, railTop, 35)
    scene.add(railTop)
    const railMid = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.09), toon("#f4f6fb"))
    railMid.position.set(0, 0.5, -1.75)
    scene.add(railMid)
    for (let rx = -6; rx <= 6; rx += 1.5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 8), toon("#f4f6fb"))
      post.position.set(rx, 0.46, -1.75)
      addHullOutline(THREE, post, 1.06)
      scene.add(post)
    }
  } else if (cenario === "rio") {
    // Margem firme de grama na frente (personagens sempre em terra firme!) + rio correndo atrás + ponte
    const bankFront = new THREE.Mesh(new THREE.PlaneGeometry(240, 20), toon("#ffffff", rep(texGrass(THREE), 30, 3)))
    bankFront.rotation.x = -Math.PI / 2
    bankFront.position.set(0, 0, 8.2)
    bankFront.receiveShadow = true
    scene.add(bankFront)

    const bankBack = new THREE.Mesh(new THREE.PlaneGeometry(240, 180), toon("#ffffff", rep(texGrass(THREE), 30, 22)))
    bankBack.rotation.x = -Math.PI / 2
    bankBack.position.set(0, 0, -104)
    bankBack.receiveShadow = true
    scene.add(bankBack)

    const river = new THREE.Mesh(new THREE.PlaneGeometry(240, 15), toon("#ffffff", rep(texWater(THREE), 26, 3)))
    river.rotation.x = -Math.PI / 2
    river.position.set(0, -0.05, -8.5)
    scene.add(river)
    animated.sea = river
    animated.seaBaseY = -0.05

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.22, 15.5), toon("#ffffff", rep(texWoodFloor(THREE), 2, 5)))
    bridge.position.set(0, 0.12, -8.5)
    bridge.receiveShadow = true
    addInkEdges(THREE, bridge, 35)
    scene.add(bridge)
    for (const bx of [-2.75, 2.75]) {
      for (let bz = -15; bz <= -2; bz += 3.2) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 8), toon("#7a502d"))
        post.position.set(bx, 0.62, bz)
        addHullOutline(THREE, post, 1.05)
        scene.add(post)
      }
    }
    scene.add(createTree(THREE, toon, -8.5, -17, 5.2, "#4fa34a", 31))
    scene.add(createTree(THREE, toon, 8.8, -19, 5.6, "#3f8c3d", 42))
  } else if (cenario === "estrada") {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon("#ffffff", rep(texGrass(THREE), 30, 30)))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 240), toon("#454854"))
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.02, -40)
    road.receiveShadow = true
    scene.add(road)
    for (let z = 2; z > -60; z -= 4.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 2.1), new THREE.MeshBasicMaterial({ color: "#ffd23f" }))
      stripe.rotation.x = -Math.PI / 2
      stripe.position.set(0, 0.04, z)
      scene.add(stripe)
    }
    for (let z = -6; z >= -30; z -= 8) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.8, 8), toon("#2b2e3a"))
      pole.position.set(-4.2, 2.4, z)
      addHullOutline(THREE, pole, 1.05)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffe787" }))
      lamp.position.set(-3.8, 4.8, z)
      scene.add(pole, lamp)
    }
    scene.add(createHouse(THREE, toon, -10.5, -18, { w: 5.5, d: 4.5, h: 4.6, yaw: 12, parede: "#f2e1c0", telhado: "#c8553d", seed: 21 }))
    scene.add(createTree(THREE, toon, 7.2, -13, 5.1, "#4fa34a", 55))
  }

  return { scene, animated }
}

const PROP_RULES = [
  [/iceberg|geleira|bloco de gelo/i, "iceberg"],
  [/tim[aã]o|leme|volante do navio/i, "timao"],
  [/cron[oô]metro|rel[oó]gio|5 segundos|segundos/i, "cronometro"],
  [/titanic|navio|transatl[aâ]ntico|barco|cruzeiro|casco/i, "navio"],
  [/trem|vag[aã]o|trilho|descarril/i, "trem"],
  [/avi[aã]o|aeronave|ejetad|paraqued/i, "aviao"],
  [/[oô]nibus|bus[aã]o/i, "onibus"],
  [/carro|autom[oó]vel|volante|motorista/i, "carro"],
  [/fogo|chamas|inc[eê]ndio|explod|queim/i, "fogo"],
  [/loteria|bilhete|sorteio|raspadinha/i, "bilhete"],
  [/milh[aã]o|milh[oõ]es|d[oó]lar|dinheiro|fortuna|pr[eê]mio|ouro|moeda/i, "dinheiro"],
  [/feno|palha|fazenda/i, "feno"],
  [/foguete|[oó]rbita|espa[cç]onave/i, "foguete"],
  [/dinossauro|rex|pr[eé]-hist/i, "dinossauro"],
  [/farol|faroleiro/i, "farol"],
  [/colher/i, "colheres"],
  [/computador|notebook|c[oó]digo|tela/i, "computador"],
  [/ba[uú]|tesouro|cofre/i, "bau"],
]

function resolveSceneProp(sceneCfg) {
  const explicit = sceneCfg.objeto && sceneCfg.objeto !== "auto" ? sceneCfg.objeto : ""
  if (explicit === "nenhum") return { prop: null, hasFire: sceneCfg.eventoCenario === "fumaca" }
  const txt = String(sceneCfg.texto || "")
  const hasFire = /fogo|chamas|explod|inc[eê]ndio/i.test(txt) || explicit === "fogo"
  if (explicit) return { prop: explicit, hasFire }
  if (["farol", "dinossauro", "foguete"].includes(sceneCfg.foco)) return { prop: sceneCfg.foco, hasFire }
  for (const [re, name] of PROP_RULES) {
    if (re.test(txt)) return { prop: name, hasFire }
  }
  return { prop: null, hasFire }
}

function buildProp3D(THREE, toon, prop, hasFire, side = 1) {
  const g = new THREE.Group()
  const anims = { flames: [], floaters: [], spin: null }
  const addM = (mesh, scale = 1.04) => {
    mesh.castShadow = true
    addHullOutline(THREE, mesh, scale)
    g.add(mesh)
    return mesh
  }

  if (prop === "navio") {
    // Transatlântico clássico estilo Titanic (casco escuro + faixa vermelha + conveses iluminados + 4 chaminés)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.15, 1.8), toon("#1f2430"))
    hull.position.set(0, 0.55, 0); hull.castShadow = true; addInkEdges(THREE, hull, 35); g.add(hull)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.66, 0.25, 1.84), toon("#c93b2b"))
    stripe.position.set(0, 0.12, 0); g.add(stripe)
    const bow = addM(new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.35, 4), toon("#1f2430")))
    bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(3.45, 0.55, 0)
    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.72, 1.56), toon("#f4f6fb"))
    deck1.position.set(-0.15, 1.48, 0); deck1.castShadow = true; addInkEdges(THREE, deck1, 35); g.add(deck1)
    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.34), toon("#eef2f8"))
    deck2.position.set(-0.1, 2.08, 0); deck2.castShadow = true; addInkEdges(THREE, deck2, 35); g.add(deck2)
    for (let px = -2.1; px <= 1.8; px += 0.55) {
      const porthole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 1.62), new THREE.MeshBasicMaterial({ color: "#ffe88a" }))
      porthole.position.set(px, 1.48, 0); g.add(porthole)
    }
    for (const fx of [-1.25, -0.45, 0.35, 1.15]) {
      const funnel = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.15, 14), toon("#e5a93c")))
      funnel.position.set(fx, 2.85, 0); funnel.rotation.z = 0.08
      const cap = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.26, 14), toon("#1d1f26")))
      cap.position.set(fx - 0.04, 3.45, 0); cap.rotation.z = 0.08
    }
    g.rotation.y = side > 0 ? -0.35 : 0.35
    g.position.set(side * 1.1, -0.3, -6.2)
  } else if (prop === "iceberg") {
    // Iceberg colossal facetado azul-gelo e branco emergindo do oceano
    const peakMain = addM(new THREE.Mesh(new THREE.ConeGeometry(2.3, 5.2, 6), toon("#dff4ff")))
    peakMain.position.set(0, 2.1, 0)
    const peakSide = addM(new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 5), toon("#bfe6fa")))
    peakSide.position.set(-1.35, 1.2, 0.5); peakSide.rotation.z = 0.22
    const peakRight = addM(new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 0), toon("#c9ecfc")))
    peakRight.position.set(1.25, 0.9, -0.2)
    const baseFoam = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.2, 0.22, 12), new THREE.MeshBasicMaterial({ color: "#f2fbff" }))
    baseFoam.position.set(0, -0.25, 0); g.add(baseFoam)
    g.position.set(side * 1.25, -0.1, -6.0)
  } else if (prop === "timao") {
    // Timão náutico clássico de madeira sobre pedestal (roda vertical + 8 alças + miolo dourado)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.7), toon("#6e4526"))
    base.position.set(0, 0.11, 0); base.castShadow = true; addInkEdges(THREE, base, 35); g.add(base)
    const post = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.25, 14), toon("#8b5a2b")))
    post.position.set(0, 0.8, 0)
    const wheel = new THREE.Group()
    wheel.position.set(0, 1.38, 0.16)
    const rim = addM(new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.075, 12, 24), toon("#7a4a24")))
    wheel.add(rim)
    const hub = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.18, 14), toon("#e5b53c")))
    hub.rotation.x = Math.PI / 2; wheel.add(hub)
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2
      const spoke = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.48, 8), toon("#9c6538")))
      spoke.rotation.z = ang; wheel.add(spoke)
    }
    g.add(wheel)
    anims.spinZ = wheel
    g.position.set(side * 1.15, 0, -0.95)
  } else if (prop === "cronometro") {
    // Cronômetro dourado gigante com mostrador branco, ponteiros e pino superior
    const body = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.18, 24), toon("#f2c12e")))
    body.rotation.x = Math.PI / 2; body.position.set(0, 1.55, 0)
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 24), new THREE.MeshBasicMaterial({ color: "#fffdf7" }))
    face.rotation.x = Math.PI / 2; face.position.set(0, 1.55, 0.01); g.add(face)
    const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.04), new THREE.MeshBasicMaterial({ color: "#1d1e24" }))
    hand1.position.set(0, 1.72, 0.13); g.add(hand1)
    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.04), new THREE.MeshBasicMaterial({ color: "#d93b2b" }))
    hand2.position.set(0.12, 1.62, 0.14); hand2.rotation.z = -0.9; g.add(hand2)
    const crown = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), toon("#d9a21b")))
    crown.position.set(0, 2.3, 0)
    const ring = addM(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), toon("#f2c12e")))
    ring.position.set(0, 2.52, 0)
    anims.floaters.push({ mesh: g, baseY: 0, phase: 0.4 })
    g.position.set(side * 1.1, 0, -0.95)
  } else if (prop === "trem") {
    const addBox = (w, h, d, col, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(col))
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true
      addInkEdges(THREE, m, 35); g.add(m); return m
    }
    // Chassi e caldeira cilíndrica de locomotiva clássica
    addBox(3.8, 0.34, 1.56, "#252934", 0, 0.52, 0)
    const boiler = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.35, 18), toon("#c93b2b")))
    boiler.rotation.z = Math.PI / 2; boiler.position.set(0.55, 1.24, 0)
    const frontRing = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.14, 18), toon("#232732")))
    frontRing.rotation.z = Math.PI / 2; frontRing.position.set(1.74, 1.24, 0)
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: "#fff29c" }))
    headlight.position.set(1.86, 1.38, 0); g.add(headlight)
    const catcher = addM(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.72, 4), toon("#3a404f")))
    catcher.rotation.z = -Math.PI / 2; catcher.position.set(2.12, 0.55, 0)
    // Cabine com teto e janelas brilhantes
    addBox(1.3, 1.72, 1.58, "#2d456b", -1.12, 1.52, 0)
    addBox(1.52, 0.18, 1.72, "#1f2532", -1.12, 2.44, 0)
    for (const wz of [-0.81, 0.81]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.58), new THREE.MeshBasicMaterial({ color: "#9ee2ff" }))
      win.position.set(-1.12, 1.78, wz); if (wz < 0) win.rotation.y = Math.PI; g.add(win)
    }
    // Chaminé + domo dourado
    const stack = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.78, 14), toon("#232732")))
    stack.position.set(1.22, 2.15, 0)
    const dome = addM(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), toon("#eab33a")))
    dome.position.set(0.35, 1.88, 0)
    // 6 rodas com calotas + barra de tração
    for (const wx of [-1.2, 0.05, 1.2]) for (const wz of [-0.82, 0.82]) {
      const w = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 16), toon("#1d1e24")))
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.36, wz)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.19, 12), toon("#c7ccd6"))
      hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.36, wz); g.add(hub)
    }
    g.rotation.z = -0.14
    g.position.set(side * 1.25, 0, -3.0)
  } else if (prop === "aviao") {
    const fuse = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.24, 3.8, 16), toon("#f4f6fb")))
    fuse.rotation.z = Math.PI / 2; fuse.position.set(0, 2.2, 0)
    const nose = addM(new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.65, 16), toon("#d93b2b")))
    nose.rotation.z = -Math.PI / 2; nose.position.set(2.22, 2.2, 0)
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshBasicMaterial({ color: "#8ce0ff" }))
    cockpit.scale.set(1.3, 0.75, 0.9); cockpit.position.set(0.6, 2.55, 0); g.add(cockpit)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 4.6), toon("#3d78d8"))
    wing.position.set(0.25, 2.18, 0); wing.castShadow = true; addInkEdges(THREE, wing, 35); g.add(wing)
    const tailH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 1.75), toon("#3d78d8"))
    tailH.position.set(-1.6, 2.24, 0); addInkEdges(THREE, tailH, 35); g.add(tailH)
    const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.95, 0.12), toon("#d93b2b"))
    tailV.position.set(-1.6, 2.7, 0); addInkEdges(THREE, tailV, 35); g.add(tailV)
    for (const wx of [-0.55, -0.05, 0.45]) for (const wz of [-0.45, 0.45]) {
      const porthole = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: "#8ce0ff" }))
      porthole.position.set(wx, 2.25, wz); g.add(porthole)
    }
    const propGroup = new THREE.Group()
    propGroup.position.set(2.58, 2.2, 0)
    const b1 = addM(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.14), toon("#232732")))
    const b2 = addM(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 1.5), toon("#232732")))
    propGroup.add(b1, b2); g.add(propGroup)
    anims.spin = propGroup
    g.rotation.z = -0.22
    g.position.set(side * 0.85, 0.45, -3.3)
  } else if (prop === "onibus") {
    const bus = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.62, 1.52), toon("#f0b429"))
    bus.position.set(0, 1.08, 0); bus.castShadow = true; addInkEdges(THREE, bus, 35); g.add(bus)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.24, 1.55), toon("#2f68b5"))
    stripe.position.set(0, 0.82, 0); g.add(stripe)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.18, 1.38), toon("#fff7e2"))
    roof.position.set(0, 1.96, 0); addInkEdges(THREE, roof, 35); g.add(roof)
    for (const wx of [-1.2, -0.4, 0.4, 1.2]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 1.56), new THREE.MeshBasicMaterial({ color: "#8cd4ff" }))
      w.position.set(wx, 1.42, 0); g.add(w)
    }
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.72), new THREE.MeshBasicMaterial({ color: "#8cd4ff" }))
    windshield.rotation.y = Math.PI / 2; windshield.position.set(1.92, 1.38, 0); g.add(windshield)
    for (const lz of [-0.46, 0.46]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff39e" }))
      hl.position.set(1.92, 0.62, lz); g.add(hl)
    }
    for (const wx of [-1.15, 1.15]) for (const wz of [-0.78, 0.78]) {
      const w = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 16), toon("#1d1e24")))
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.35, wz)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.21, 12), toon("#cfd4de"))
      hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.35, wz); g.add(hub)
    }
    g.rotation.z = 0.14
    g.position.set(side * 1.25, -0.1, -2.9)
  } else if (prop === "carro") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.68, 1.48), toon("#d93b2b"))
    base.position.set(0, 0.64, 0); base.castShadow = true; addInkEdges(THREE, base, 35); g.add(base)
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.56), toon("#cfd4de"))
    bumperF.position.set(1.46, 0.44, 0); addInkEdges(THREE, bumperF, 35); g.add(bumperF)
    const bumperB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 1.56), toon("#cfd4de"))
    bumperB.position.set(-1.46, 0.44, 0); addInkEdges(THREE, bumperB, 35); g.add(bumperB)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.62, 1.28), toon("#e84b3c"))
    cabin.position.set(-0.12, 1.26, 0); cabin.castShadow = true; addInkEdges(THREE, cabin, 35); g.add(cabin)
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.42, 1.32), new THREE.MeshBasicMaterial({ color: "#8cd4ff" }))
    sideWin.position.set(-0.12, 1.28, 0); g.add(sideWin)
    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 1.08), new THREE.MeshBasicMaterial({ color: "#9ee2ff" }))
    frontWin.position.set(0.65, 1.26, 0); frontWin.rotation.z = 0.22; g.add(frontWin)
    for (const lz of [-0.46, 0.46]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff39e" }))
      hl.position.set(1.44, 0.72, lz); g.add(hl)
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.24), new THREE.MeshBasicMaterial({ color: "#ff3b3b" }))
      tl.position.set(-1.44, 0.72, lz); g.add(tl)
    }
    for (const wx of [-0.85, 0.85]) for (const wz of [-0.76, 0.76]) {
      const w = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16), toon("#1d1e24")))
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.32, wz)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.21, 12), toon("#cfd4de"))
      hub.rotation.x = Math.PI / 2; hub.position.set(wx, 0.32, wz); g.add(hub)
    }
    g.position.set(side * 1.3, 0, -2.35)
  } else if (prop === "feno") {
    const hay = addM(new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 1), toon("#eab33a")))
    hay.scale.set(1.25, 0.88, 1.05)
    hay.position.set(side * 1.3, 0.85, -1.7)
  } else if (prop === "bilhete" || prop === "dinheiro") {
    const ticket = addM(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 0.12), toon("#ffd23f")))
    ticket.position.set(side * 1.15, 1.55, -0.6)
    ticket.rotation.z = -0.18
    anims.floaters.push({ mesh: ticket, baseY: 1.55, phase: 0 })
    for (let k = 0; k < 5; k++) {
      const isBill = k % 2 === 1 || prop === "dinheiro"
      const m = addM(new THREE.Mesh(
        isBill ? new THREE.BoxGeometry(0.45, 0.24, 0.05) : new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12),
        toon(isBill ? "#52b755" : "#ffd23f")
      ))
      m.position.set((k - 2) * 0.65, 1.45 + (k % 3) * 0.42, -0.9 - (k % 2) * 0.7)
      anims.floaters.push({ mesh: m, baseY: m.position.y, phase: k * 1.1 })
    }
  } else if (prop === "foguete") {
    const body = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.4, 14), toon("#f4f6fb")))
    body.position.y = 1.6
    const nose = addM(new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.0, 14), toon("#d93b2b")))
    nose.position.y = 3.3
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: "#7cc5f5" }))
    win.position.set(0, 1.85, 0.48)
    g.add(win)
    g.position.set(side * 1.6, 0, -2.5)
  } else if (prop === "dinossauro") {
    const body = addM(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 12), toon("#52a849")))
    body.scale.set(1.1, 0.85, 1.35)
    body.position.set(0, 1.05, 0)
    const neck = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 1.25, 10), toon("#52a849")))
    neck.position.set(0, 1.85, 0.6)
    const head = addM(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 1.1), toon("#5bbd52")))
    head.position.set(0, 2.45, 0.9)
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: "#fff" }))
    eye.position.set(0.36, 2.58, 1.1)
    g.add(eye)
    g.rotation.y = side > 0 ? -0.6 : 0.6
    g.position.set(side * 1.7, 0, -2.3)
  } else if (prop === "farol") {
    const tower = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.0, 4.6, 14), toon("#f6f2e8")))
    tower.position.y = 2.3
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.75, 14), new THREE.MeshBasicMaterial({ color: "#ffe787" }))
    top.position.y = 4.9
    const roof = addM(new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.7, 14), toon("#d93b2b")))
    roof.position.y = 5.6
    g.add(top)
    g.position.set(side * 2.0, 0, -3.4)
  } else if (prop === "computador" || prop === "bau") {
    const color = prop === "bau" ? "#8c562c" : "#2b3040"
    const box = addM(new THREE.Mesh(new THREE.BoxGeometry(1.15, prop === "bau" ? 0.78 : 0.85, 0.72), toon(color)))
    box.position.set(side * 1.15, 0.65, -0.85)
    if (prop === "computador") {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.58), new THREE.MeshBasicMaterial({ color: "#68d8ff" }))
      scr.position.set(side * 1.15, 0.72, -0.48)
      g.add(scr)
    }
  } else if (prop === "colheres") {
    for (const ox of [-0.25, 0.25]) {
      const sp = addM(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), toon("#dce4f0")))
      sp.position.set(side * 0.95 + ox, 1.35, -0.45)
      sp.rotation.z = ox * 0.6
      anims.floaters.push({ mesh: sp, baseY: 1.35, phase: ox * 3 })
    }
  }

  if (hasFire || prop === "fogo") {
    const isStandalone = !prop || prop === "fogo"
    const baseFx = isStandalone ? side * 1.25 : 0
    const baseFz = isStandalone ? -1.9 : 0.28
    const baseFy = isStandalone ? 0.6 : 1.05
    const flameColors = ["#ff4e26", "#ff9224", "#ffd93d"]
    for (let f = 0; f < 5; f++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.32 + (f % 2) * 0.14, 1.05 + (f % 3) * 0.35, 8),
        new THREE.MeshBasicMaterial({ color: flameColors[f % 3] })
      )
      cone.position.set(baseFx + (f - 2) * 0.38, baseFy + (f % 2) * 0.22, baseFz + ((f % 2) - 0.5) * 0.3)
      g.add(cone)
      anims.flames.push({ mesh: cone, baseY: cone.position.y, phase: f * 1.4 })
    }
  }
  return { group: g, anims }
}

function buildBlueprintProp3D(THREE, toon, blueprint, hasFire, side = 1, cenario = "vila") {
  const root = new THREE.Group()
  const inner = new THREE.Group()
  const anims = { flames: [], floaters: [], spin: null, custom: [] }
  const deg = Math.PI / 180

  const makeMat = (part) => {
    const col = part.color || "#e06d53"
    if (part.material === "glow") return new THREE.MeshBasicMaterial({ color: col })
    if (part.material === "wood") return toon("#ffffff", rep(texWoodFloor(THREE), 2, 2))
    if (part.material === "stone") return toon("#ffffff", rep(texCobble(THREE), 2, 2))
    if (part.material === "roof") return toon("#ffffff", rep(texRoof(THREE, col), 2, 2))
    return toon(col)
  }

  for (const part of (blueprint?.parts || [])) {
    let geo
    const t = part.type || "box"
    if (t === "sphere") geo = new THREE.SphereGeometry(0.5, 16, 12)
    else if (t === "cylinder") geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
    else if (t === "cone") geo = new THREE.ConeGeometry(0.5, 1, 16)
    else if (t === "torus") geo = new THREE.TorusGeometry(0.38, 0.13, 10, 20)
    else if (t === "dodecahedron") geo = new THREE.DodecahedronGeometry(0.5, 0)
    else geo = new THREE.BoxGeometry(1, 1, 1)

    const mesh = new THREE.Mesh(geo, makeMat(part))
    const [px, py, pz] = part.pos || [0, 0.5, 0]
    const [sx, sy, sz] = part.size || [1, 1, 1]
    const [rx, ry, rz] = part.rot || [0, 0, 0]
    mesh.position.set(px, py, pz)
    mesh.scale.set(sx, sy, sz)
    mesh.rotation.set(rx * deg, ry * deg, rz * deg)
    if (part.material !== "glow") {
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (t === "box") addInkEdges(THREE, mesh, 35)
      else addHullOutline(THREE, mesh, 1.045)
    } else {
      addHullOutline(THREE, mesh, 1.03)
    }
    inner.add(mesh)
    if (part.anim && part.anim !== "none") {
      anims.custom.push({
        mesh,
        anim: part.anim,
        baseY: py,
        baseRotZ: rz * deg,
        baseScale: [sx, sy, sz],
        phase: anims.custom.length * 1.15,
      })
    }
  }

  // Normaliza escala real + ancora exatamente no chão (y = 0) para manter proporção cinematográfica
  inner.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(inner)
  const sizeV = new THREE.Vector3()
  const centerV = new THREE.Vector3()
  box.getSize(sizeV)
  box.getCenter(centerV)
  const maxDim = Math.max(0.2, sizeV.x, sizeV.y, sizeV.z)
  const targetDims = { pequeno: 1.25, medio: 2.35, grande: 3.6, cenario: 5.8 }
  const scaleFactor = (targetDims[blueprint?.escala] || 2.35) / maxDim

  inner.scale.setScalar(scaleFactor)
  inner.position.set(-centerV.x * scaleFactor, -box.min.y * scaleFactor, -centerV.z * scaleFactor)
  root.add(inner)

  const posKind = blueprint?.posicao || "lado"
  if (posKind === "ceu") {
    root.position.set(side * 0.95, 2.55, -4.6)
  } else if (posKind === "fundo" || blueprint?.escala === "cenario") {
    root.position.set(side * 1.55, 0, cenario === "oceano" ? -5.8 : -5.4)
  } else if (blueprint?.escala === "grande") {
    root.position.set(side * 0.95, 0, cenario === "oceano" ? -4.8 : -3.5)
  } else {
    // Em oceano, itens pequenos/médios ficam EM CIMA do convés (z = -0.95, antes da mureta em -1.75)
    root.position.set(side * 1.15, 0, cenario === "oceano" ? -0.95 : -2.55)
  }
  root.rotation.y = side > 0 ? -0.25 : 0.25

  if (hasFire) {
    const flameColors = ["#ff4e26", "#ff9224", "#ffd93d"]
    for (let f = 0; f < 5; f++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.32 + (f % 2) * 0.14, 1.05 + (f % 3) * 0.35, 8),
        new THREE.MeshBasicMaterial({ color: flameColors[f % 3] })
      )
      cone.position.set((f - 2) * 0.38, Math.min(2.6, sizeV.y * scaleFactor * 0.85) + (f % 2) * 0.2, 0.28)
      root.add(cone)
      anims.flames.push({ mesh: cone, baseY: cone.position.y, phase: f * 1.4 })
    }
  }
  return { group: root, anims }
}

function drawCaptionOverlay(ctx, W, H, captionGroup, extraText, flags = {}) {
  if (flags.stars) {
    ctx.save()
    const t = flags.t || 0
    for (let i = 0; i < 8; i++) {
      const x = W * (0.1 + ((i * 0.115) % 0.84))
      const y = H * (0.15 + ((i * 0.063) % 0.22))
      const r = W * (0.012 + 0.008 * Math.abs(Math.sin(t * 4 + i)))
      ctx.fillStyle = "#ffe96b"
      ctx.strokeStyle = "#0e0e14"
      ctx.lineWidth = Math.max(2, W * 0.003)
      ctx.beginPath()
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.32, y - r * 0.32); ctx.lineTo(x + r, y)
      ctx.lineTo(x + r * 0.32, y + r * 0.32); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.32, y + r * 0.32)
      ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.32, y - r * 0.32); ctx.closePath()
      ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }
  if (flags.lightning) {
    ctx.save()
    ctx.strokeStyle = "#fff48c"
    ctx.lineWidth = Math.max(4, W * 0.008)
    ctx.shadowColor = "#ffd23f"
    ctx.shadowBlur = 18
    ctx.beginPath()
    const lx = flags.lightningX || W * 0.78
    ctx.moveTo(lx, 0)
    ctx.lineTo(lx - W * 0.05, H * 0.13)
    ctx.lineTo(lx + W * 0.02, H * 0.16)
    ctx.lineTo(lx - W * 0.06, H * 0.3)
    ctx.stroke()
    ctx.restore()
  }
  if (flags.sweat) {
    ctx.save()
    const sx = W * 0.62, sy = H * (flags.sweatY || 0.34), drop = W * 0.022
    ctx.fillStyle = "#4cc3ff"
    ctx.strokeStyle = "#0e0e14"
    ctx.lineWidth = Math.max(3, W * 0.005)
    ctx.beginPath()
    ctx.moveTo(sx, sy - drop)
    ctx.quadraticCurveTo(sx + drop, sy + drop * 0.4, sx, sy + drop)
    ctx.quadraticCurveTo(sx - drop, sy + drop * 0.4, sx, sy - drop)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
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

  // Renderização 100% nativa (1080×1920 no vídeo final, sem downscale)
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

  const propCache = new Map()
  let customAssetsMap = {}
  const getCachedProp = (prop, hasFire, side, blueprint = null, cenario = "vila") => {
    const pk = blueprint
      ? `bp|${blueprint.id}|${blueprint.updatedAt || 0}|${hasFire ? 1 : 0}|${side}|${cenario}`
      : `${prop || ""}|${hasFire ? 1 : 0}|${side}`
    if (!propCache.has(pk)) {
      const toonFn = (c, m) => new THREE.MeshToonMaterial({ color: c, map: m || null, gradientMap: rampTex })
      propCache.set(pk, blueprint
        ? buildBlueprintProp3D(THREE, toonFn, blueprint, hasFire, side, cenario)
        : buildProp3D(THREE, toonFn, prop, hasFire, side))
    }
    return propCache.get(pk)
  }

  // Pools reutilizáveis de efeitos climáticos (zero alocação de geometria por frame)
  const smokePool = new THREE.Group()
  const smokeMat = new THREE.MeshToonMaterial({ color: "#808b99", transparent: true, opacity: 0.82, gradientMap: rampTex })
  const smokeGeo = new THREE.SphereGeometry(0.28, 10, 8)
  const smokeMeshes = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(smokeGeo, smokeMat)
    smokePool.add(m)
    return m
  })
  const wavePool = new THREE.Group()
  const waveMat = new THREE.MeshToonMaterial({ color: "#3d9ae8", gradientMap: rampTex })
  const waveGeo = new THREE.CylinderGeometry(0.26, 0.3, 5.2, 10)
  const waveMeshes = Array.from({ length: 5 }, () => {
    const w = new THREE.Mesh(waveGeo, waveMat)
    w.rotation.z = Math.PI / 2
    wavePool.add(w)
    return w
  })

  const blurCv = document.createElement("canvas")
  blurCv.width = Math.max(120, Math.round(width / 5))
  blurCv.height = Math.max(213, Math.round(height / 5))
  const blurCtx = blurCv.getContext("2d")

  const charSlots = new Map()
  const extraCache = new Map()
  const acquireCharSlot = (slotKey) => {
    if (!charSlots.has(slotKey)) {
      const cv = document.createElement("canvas")
      cv.width = 600
      cv.height = 1000
      const tex = new THREE.CanvasTexture(cv)
      tex.encoding = THREE.sRGBEncoding
      charSlots.set(slotKey, { cv, tex, lastPaintKey: "" })
    }
    return charSlots.get(slotKey)
  }

  function renderFrame(sceneCfg, t, captionGroup = null, sceneLocalT = t, showCaptions = true, opts = {}) {
    const cenario = sceneCfg.cenario || "vila"
    const luz = sceneCfg.luz || "dia"
    const sceneIdx = Number(opts.sceneIdx) || 0
    const worldObj = getWorld(cenario, luz)
    const world = worldObj.scene

    if (worldObj.animated.terra) worldObj.animated.terra.rotation.y = t * 0.22
    if (worldObj.animated.lua) {
      const a = t * 0.3
      worldObj.animated.lua.position.set(Math.cos(a) * -6.5, 7.2, -16 + Math.sin(a) * 3)
      worldObj.animated.lua.rotation.y = -a
    }
    if (worldObj.animated.sea) {
      const baseSeaY = worldObj.animated.seaBaseY ?? 0.03
      worldObj.animated.sea.position.y = baseSeaY + Math.sin(t * 2.4) * 0.05
    }

    const cast = sceneCfg.quemAparece?.length ? sceneCfg.quemAparece : ["silas"]
    const { prop, hasFire } = resolveSceneProp(sceneCfg)
    const activeAssets = opts.customAssets || customAssetsMap
    const blueprint = sceneCfg.customAssetId ? activeAssets?.[sceneCfg.customAssetId] : null
    // Se a cena tem um objeto principal (iceberg, navio, carro, blueprint), evita close borrando o objeto
    const isClose = sceneCfg.plano === "close" && !blueprint && !prop
    const focusCharIdx = cast.indexOf(sceneCfg.foco)
    const speakerIdx = focusCharIdx >= 0 ? focusCharIdx : 0
    const speakerPx = (speakerIdx - (cast.length - 1) / 2) * 1.15
    const lookX = isClose ? speakerPx : (["pedro", "maria", "joao", "silas"].includes(sceneCfg.foco) ? speakerPx : 0)

    // Motion contínuo + variação de ângulo entre cenas (evita repetir enquadramento estático)
    const u = M.clamp(sceneLocalT / 3.2, 0, 1)
    const baseFov = isClose ? 32 : sceneCfg.plano === "aberto" ? 50 : 40
    const creepFov = baseFov * (1 - 0.035 * u)
    const camZ = isClose ? 3.95 : sceneCfg.plano === "aberto" ? 8.6 : 5.8
    const zoom = sceneCfg.camera === "aproximar" || sceneCfg.efeito === "zoom"
      ? -1.25 * M.smooth(u)
      : sceneCfg.camera === "afastar"
        ? 1.4 * M.smooth(u)
        : -0.25 * M.easeOut(u)
    const angleOffsets = isClose ? [0, 0.25, -0.25] : [-1.85, 0.55, 2.05, -1.15, 1.45]
    const baseAngleX = sceneCfg.camera === "fixa" ? 0 : angleOffsets[sceneIdx % angleOffsets.length]
    const panX = sceneCfg.camera === "pan" ? Math.sin(t * 0.9) * 1.25 : baseAngleX

    // Kick impact de 7 frames no início da cena se houver virada ou tremor
    const fLoc = Math.round(sceneLocalT * 30)
    const isHit = sceneCfg.virada || sceneCfg.efeito === "tremor"
    const kickAmp = isHit && fLoc < 7 ? (fLoc % 2 ? -1 : 1) * (1 - fLoc / 7) : 0
    const shakeX = kickAmp * 0.14 + (sceneCfg.efeito === "tremor" ? Math.sin(t * 36) * 0.06 : 0)
    const rollDeg = (sceneCfg.virada ? 2.8 : sceneCfg.acao === "assustado" ? -2.2 : 0) + kickAmp * 3.2

    const cam = new THREE.PerspectiveCamera(creepFov, width / height, 0.1, 1200)
    const camY = (isClose ? 1.48 : sceneCfg.plano === "aberto" ? 1.88 : 1.56) + (sceneIdx % 2 === 1 && !isClose ? 0.18 : 0)
    cam.position.set(lookX + panX + shakeX, camY, Math.max(2.4, camZ + zoom))
    cam.lookAt(lookX + panX * 0.22, (isClose ? 1.38 : 1.25) + kickAmp * 0.08, -2.2)
    if (rollDeg) cam.rotateZ((rollDeg * Math.PI) / 180)

    const tempNodes = []
    const charSlotTick = Math.floor(t * 16)
    const charT = charSlotTick / 16
    const speakActive = typeof opts.speaking === "boolean" ? opts.speaking : Boolean(captionGroup?.words?.length)

    const addChar = (slotKey, outfit, charOpts, px, py, pz, layer = 0, isExtra = false) => {
      let tex
      if (isExtra) {
        const blinkSlot = Math.floor(t * 2) % 6 === 0 ? 1 : 0
        const ek = `${slotKey}|${blinkSlot}`
        if (!extraCache.has(ek)) {
          const cv = drawToonCharacterCanvas(outfit, { ...charOpts, t: blinkSlot ? 1.0 : 0.2, canvasWidth: 420, canvasHeight: 700 })
          const et = new THREE.CanvasTexture(cv)
          et.encoding = THREE.sRGBEncoding
          extraCache.set(ek, et)
        }
        tex = extraCache.get(ek)
      } else {
        const slot = acquireCharSlot(slotKey)
        const paintKey = `${outfit.seed}|${charOpts.acao}|${charOpts.expressao}|${charOpts.atividade}|${charOpts.speaking ? 1 : 0}|${charOpts.facing}|${charSlotTick}`
        if (slot.lastPaintKey !== paintKey) {
          drawToonCharacterCanvas(outfit, { ...charOpts, t: charT, targetCanvas: slot.cv, canvasWidth: 600, canvasHeight: 1000 })
          slot.tex.needsUpdate = true
          slot.lastPaintKey = paintKey
        }
        tex = slot.tex
      }

      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(charGeo, mat)
      mesh.position.set(px, py, pz)
      mesh.rotation.y = Math.atan2(cam.position.x - px, cam.position.z - pz)
      if (charOpts.atividade === "voar") mesh.rotation.z = Math.sin(t * 5) * 0.14
      mesh.layers.set(layer)
      world.add(mesh)

      const sh = new THREE.Mesh(shadowGeo, shadowMat)
      sh.rotation.x = -Math.PI / 2
      const shScale = Math.max(0.55, 1.0 - py * 0.35)
      sh.scale.set(shScale, 0.55 * shScale, 1)
      sh.position.set(px, 0.02, pz)
      sh.layers.set(layer)
      world.add(sh)
      tempNodes.push({ mesh, sh, mat })
    }

    const charLayer = isClose ? NOINK : 0

    // Adereços 3D contextuais da história (blueprint inédito ou catálogo fixo) + eventoCenario
    const cleanupExtras = []
    if (blueprint || prop || hasFire) {
      const side = sceneIdx % 2 === 0 ? 1 : -1
      const { group, anims } = getCachedProp(prop, hasFire, side, blueprint, cenario)
      anims.flames.forEach((f) => {
        f.mesh.position.y = f.baseY + Math.sin(t * 14 + f.phase) * 0.14
        f.mesh.scale.setScalar(0.92 + Math.sin(t * 17 + f.phase) * 0.16)
      })
      anims.floaters.forEach((fl) => {
        fl.mesh.position.y = fl.baseY + Math.sin(t * 3.4 + fl.phase) * 0.16
        if (fl.mesh !== group) fl.mesh.rotation.y = t * 1.4 + fl.phase
      })
      if (anims.spin) anims.spin.rotation.x = t * 18
      if (anims.spinZ) anims.spinZ.rotation.z = Math.sin(t * 2.2) * 0.85
      if (anims.custom?.length) {
        anims.custom.forEach((c) => {
          if (c.anim === "bob") c.mesh.position.y = c.baseY + Math.sin(t * 3 + c.phase) * 0.14
          else if (c.anim === "spinX") c.mesh.rotation.x = t * 10
          else if (c.anim === "spinY") c.mesh.rotation.y = t * 2.4
          else if (c.anim === "spinZ") c.mesh.rotation.z = t * 4
          else if (c.anim === "sway") c.mesh.rotation.z = c.baseRotZ + Math.sin(t * 3.2 + c.phase) * 0.15
          else if (c.anim === "flicker") {
            const sc = 0.9 + Math.sin(t * 15 + c.phase) * 0.16
            c.mesh.scale.set(c.baseScale[0] * sc, c.baseScale[1] * sc, c.baseScale[2] * sc)
          }
        })
      }
      world.add(group)
      cleanupExtras.push(group)
    }

    if (sceneCfg.eventoCenario === "fumaca" || hasFire) {
      smokeMeshes.forEach((s, i) => {
        const rise = (t * 0.85 + i * 0.42) % 2.2
        s.position.set((i - 2.5) * 0.72 + Math.sin(t * 2 + i) * 0.22, 1.8 + rise * 1.1, -2.8 - (i % 2) * 0.7)
        s.scale.setScalar(0.65 + rise * 0.25)
      })
      world.add(smokePool)
      cleanupExtras.push(smokePool)
    }
    if (sceneCfg.eventoCenario === "onda") {
      waveMeshes.forEach((w, i) => {
        w.position.set((i - 2) * 0.7, 0.22 + Math.sin(t * 5 + i) * 0.12, -2.2 - i * 0.75)
      })
      world.add(wavePool)
      cleanupExtras.push(wavePool)
    }

    if (!isClose && (cenario === "vila" || cenario === "cidade" || cenario === "estrada") && sceneCfg.plano === "aberto") {
      const extrasPos = [[-2.6, -3.2], [-1.7, -4.1], [2.4, -3.4], [1.6, -4.6], [3.3, -2.8]]
      extrasPos.forEach(([ex, ez], idx) => {
        addChar(`extra-${idx}`, ELENCO.extra(idx), { acao: "parado", expressao: "neutro", t, facing: ex > 0 ? -1 : 1 }, ex, 0, ez, 0, true)
      })
    }

    cast.forEach((id, idx) => {
      const outfit = ELENCO[id] || ELENCO.silas
      const runShift = sceneCfg.atividade === "correr" || sceneCfg.acao === "correr" ? Math.sin(t * 2.2) * 0.35 : 0
      const px = (idx - (cast.length - 1) / 2) * 1.15 + runShift
      const py = sceneCfg.atividade === "voar" ? 0.8 + Math.sin(t * 4.5 + idx) * 0.22 : 0
      addChar(`cast-${id}`, outfit, {
        acao: sceneCfg.acao || "parado",
        expressao: sceneCfg.expressao || "neutro",
        atividade: sceneCfg.atividade || "nenhuma",
        t,
        speaking: speakActive && idx === speakerIdx,
        facing: idx % 2 === 0 ? 1 : -1,
      }, px, py, 0.2, charLayer, false)
    })

    if (isClose) {
      // Pass 1: mundo em baixa resolução + blur suave (10× mais rápido no GPU/Canvas2D!)
      renderer.autoClear = true
      renderer.setClearColor(0x000000, 1)
      cam.layers.set(0)
      renderer.render(world, cam)
      blurCtx.save()
      blurCtx.clearRect(0, 0, blurCv.width, blurCv.height)
      blurCtx.filter = "blur(2.4px)"
      blurCtx.drawImage(glCanvas, 0, 0, blurCv.width, blurCv.height)
      blurCtx.restore()
      ctx.drawImage(blurCv, -10, -10, width + 20, height + 20)

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
    }
    for (const ex of cleanupExtras) {
      world.remove(ex)
    }

    if ((sceneCfg.efeito === "flash" || (sceneCfg.eventoCenario === "raio" && (fLoc % 28) < 4)) && fLoc < 6) {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.65 - fLoc * 0.11)})`
      ctx.fillRect(0, 0, width, height)
    }
    const overlayFlags = {
      sweat: sceneCfg.efeito === "suor",
      sweatY: isClose ? 0.27 : 0.34,
      lightning: sceneCfg.eventoCenario === "raio",
      lightningX: width * (0.28 + ((sceneIdx % 3) * 0.22)),
      stars: sceneCfg.eventoCenario === "estrelas",
      t,
    }
    drawCaptionOverlay(ctx, width, height, showCaptions ? captionGroup : null, sceneCfg.textoTela, overlayFlags)
    return outCanvas
  }

  return {
    outCanvas,
    setCustomAssets(map = {}) {
      customAssetsMap = map || {}
    },
    preloadScenes(list = []) {
      for (const c of list) getWorld(c.cenario || "vila", c.luz || "dia")
    },
    renderThumbnailDataUrl(sceneCfg, sceneIdx = 0, customAssets = null) {
      const clean = (sceneCfg.texto || "").replace(/\[[^\]]{1,32}\]\s*/g, " ").trim()
      const words = clean.split(/\s+/).filter(Boolean).slice(0, 3)
      renderFrame(sceneCfg, 0.4, words.length ? { words, active: 0 } : null, 0.4, true, { sceneIdx, speaking: true, customAssets: customAssets || customAssetsMap })
      return outCanvas.toDataURL("image/jpeg", 0.9)
    },
    renderCoverPngDataUrl(sceneCfg, hookText = "", customAssets = null) {
      renderFrame({ ...sceneCfg, textoTela: hookText, plano: sceneCfg.plano === "aberto" ? "medio" : sceneCfg.plano }, 0.4, null, 0.4, false, { sceneIdx: 0, speaking: false, customAssets: customAssets || customAssetsMap })
      return outCanvas.toDataURL("image/png")
    },
    renderFrame,
    dispose() {
      for (const s of charSlots.values()) s.tex.dispose()
      for (const et of extraCache.values()) et.dispose()
      charSlots.clear()
      extraCache.clear()
      propCache.clear()
      smokeGeo.dispose()
      smokeMat.dispose()
      waveGeo.dispose()
      waveMat.dispose()
      rampTex.dispose()
      charGeo.dispose()
      shadowGeo.dispose()
      shadowMat.dispose()
      renderer.dispose()
    },
  }
}

function computeSceneWindows(cenas, finalDuration, cenasTiming, palavras) {
  const n = Math.max(1, cenas.length)
  let rawRanges = null

  if (Array.isArray(cenasTiming) && cenasTiming.length === n) {
    rawRanges = cenasTiming.map((r) => ({ inicio: Number(r.inicio) || 0, fim: Number(r.fim) || 0 }))
  } else if (Array.isArray(palavras) && palavras.some((w) => Number.isInteger(w.fraseIndex))) {
    rawRanges = cenas.map((_, idx) => {
      const ws = palavras.filter((w) => w.fraseIndex === idx)
      if (!ws.length) return null
      return { inicio: ws[0].inicio, fim: ws[ws.length - 1].fim }
    })
    if (rawRanges.some((x) => !x)) rawRanges = null
  }

  if (!rawRanges) {
    // Fallback ponderado pelo tamanho da frase + pontuação (nunca fatia uniforme fixa)
    const weights = cenas.map((c) => {
      const txt = String(c.texto || "").replace(/\[[^\]]{1,32}\]\s*/g, "")
      const pauses = (txt.match(/[.,!?;:…—-]+/g) || []).length * 4
      return Math.max(8, txt.replace(/\s+/g, "").length + pauses)
    })
    const tot = weights.reduce((a, b) => a + b, 0) || 1
    let cur = 0
    rawRanges = weights.map((w) => {
      const span = (w / tot) * finalDuration
      const r = { inicio: cur, fim: cur + span }
      cur += span
      return r
    })
  }

  return rawRanges.map((r, i) => {
    const prev = rawRanges[i - 1]
    const next = rawRanges[i + 1]
    const start = i === 0 ? 0 : (prev.fim + r.inicio) / 2
    const end = i === n - 1 ? finalDuration : (r.fim + next.inicio) / 2
    return { start, end: Math.max(start + 0.25, end), speakStart: r.inicio, speakEnd: r.fim }
  })
}

async function renderMixedOfflineAudio({ voiceBuf, bgBuf, whooshBuf, surpresaBuf, impactoBuf, popBuf, subidaBuf, cenas, sceneWindows, dropIdx, finalDuration }) {
  const sampleRate = 44100
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const offline = new OfflineCtx(2, Math.max(sampleRate, Math.ceil(finalDuration * sampleRate)), sampleRate)

  const voiceSrc = offline.createBufferSource()
  voiceSrc.buffer = voiceBuf
  voiceSrc.connect(offline.destination)
  voiceSrc.start(0)

  if (bgBuf) {
    const bgSrc = offline.createBufferSource()
    bgSrc.buffer = bgBuf
    bgSrc.loop = true
    const bgGain = offline.createGain()
    bgGain.gain.setValueAtTime(0.14, 0)
    if (dropIdx > 0 && sceneWindows[dropIdx]) {
      const dropAt = sceneWindows[dropIdx].start - 0.12
      if (dropAt > 0.5) {
        bgGain.gain.setValueAtTime(0.14, Math.max(0, dropAt - 0.15))
        bgGain.gain.linearRampToValueAtTime(0.0001, dropAt)
      }
    }
    bgSrc.connect(bgGain)
    bgGain.connect(offline.destination)
    bgSrc.start(0)
  }

  const playSfx = (buf, at, vol) => {
    if (!buf || at < 0 || at >= finalDuration) return
    const s = offline.createBufferSource()
    s.buffer = buf
    const g = offline.createGain()
    g.gain.value = vol
    s.connect(g)
    g.connect(offline.destination)
    s.start(at)
  }

  cenas.forEach((cena, i) => {
    const startAt = sceneWindows[i]?.start || 0
    if (i > 0 && whooshBuf && i % 2 === 0 && i !== dropIdx) playSfx(whooshBuf, startAt, 0.22)
    if (cena.textoTela && popBuf) playSfx(popBuf, startAt + 0.04, 0.25)
    if (i === dropIdx - 1 && subidaBuf) playSfx(subidaBuf, startAt, 0.24)
    if (i === dropIdx || cena.virada || cena.efeito === "flash") {
      playSfx(impactoBuf || surpresaBuf, startAt, 0.42)
      if (surpresaBuf && impactoBuf) playSfx(surpresaBuf, startAt + 0.06, 0.34)
    }
  })

  return offline.startRendering()
}

export async function recordCartoonVideo({ cenas, palavras, cenasTiming, customAssets, audioSrc, duration, showCaptions = true, onProgress, previewHost }) {
  const W = 1080
  const H = 1920
  const engine = createCartoonRenderer(W, H)
  engine.setCustomAssets(customAssets || {})

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

  const loadAudioBuffer = async (url) => {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    return actx.decodeAudioData(buf)
  }

  const voiceBuf = await loadAudioBuffer(audioSrc)
  const finalDuration = Math.max(duration || 0, voiceBuf.duration || 5)
  const sceneWindows = computeSceneWindows(cenas, finalDuration, cenasTiming, palavras)

  // Trilha curiosa (com Twist Music Drop antes da virada!) + suíte completa SFX (/sons/*.wav)
  const tryLoad = (u) => loadAudioBuffer(u).catch(() => null)
  const [bgBuf, whooshBuf, surpresaBuf, impactoBuf, popBuf, subidaBuf] = await Promise.all([
    tryLoad("/sons/trilha_curiosa.wav"),
    tryLoad("/sons/whoosh.wav"),
    tryLoad("/sons/surpresa.wav"),
    tryLoad("/sons/impacto.wav"),
    tryLoad("/sons/pop.wav"),
    tryLoad("/sons/subida.wav"),
  ])

  engine.preloadScenes(cenas)
  const twistIdx = cenas.findIndex((c) => c.virada)
  const dropIdx = twistIdx >= 0 ? twistIdx : Math.max(1, cenas.length - 1)
  const wordList = palavras || []

  const renderAtTime = (clampedT) => {
    let idx = sceneWindows.findIndex((w) => clampedT >= w.start && clampedT < w.end)
    if (idx < 0) idx = clampedT >= finalDuration ? cenas.length - 1 : 0
    const win = sceneWindows[idx] || { start: 0, end: finalDuration, speakStart: 0, speakEnd: finalDuration }
    const sceneLocalT = Math.max(0, clampedT - win.start)

    const wIdx = wordList.findIndex((w) => clampedT >= w.inicio - 0.05 && clampedT <= w.fim + 0.05)
    const activeFallbackIdx = wIdx >= 0 ? wIdx : wordList.findLastIndex((w) => clampedT >= w.inicio && (w.fraseIndex === undefined || w.fraseIndex === idx))
    const speakingNow = wIdx >= 0 || (clampedT >= win.speakStart && clampedT <= win.speakEnd)

    let captionGroup = null
    if (showCaptions && activeFallbackIdx >= 0) {
      const curWord = wordList[activeFallbackIdx]
      const phraseWords = curWord.fraseIndex !== undefined
        ? wordList.filter((w) => w.fraseIndex === curWord.fraseIndex)
        : wordList
      const posInPhrase = phraseWords.indexOf(curWord)
      const gStart = Math.floor(Math.max(0, posInPhrase) / 3) * 3
      captionGroup = {
        words: phraseWords.slice(gStart, gStart + 3).map((w) => w.palavra),
        active: Math.max(0, posInPhrase) - gStart,
      }
    }
    engine.renderFrame(cenas[idx], clampedT, captionGroup, sceneLocalT, showCaptions, { sceneIdx: idx, speaking: speakingNow })
  }

  // Caminho 1 (Preferencial): Exportação MP4 (H.264 + AAC) offline 30 fps cravados via mediabunny + WebCodecs
  if (typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined") {
    try {
      const mb = await import("/vendor/mediabunny.min.mjs")
      const [canAvc, canAac] = await Promise.all([
        mb.canEncodeVideo("avc", { width: W, height: H, bitrate: mb.QUALITY_HIGH }).catch(() => false),
        mb.canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 44100, bitrate: mb.QUALITY_HIGH }).catch(() => false),
      ])
      if (canAvc && canAac) {
        const mixedAudio = await renderMixedOfflineAudio({
          voiceBuf, bgBuf, whooshBuf, surpresaBuf, impactoBuf, popBuf, subidaBuf,
          cenas, sceneWindows, dropIdx, finalDuration,
        })
        const target = new mb.BufferTarget()
        const output = new mb.Output({
          format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
          target,
        })
        const fps = 30
        const frameDur = 1 / fps
        const totalFrames = Math.max(15, Math.ceil(finalDuration * fps))
        const videoSource = new mb.CanvasSource(cv, { codec: "avc", bitrate: mb.QUALITY_VERY_HIGH })
        const audioSource = new mb.AudioBufferSource({ codec: "aac", bitrate: mb.QUALITY_HIGH })
        output.addVideoTrack(videoSource, { frameRate: fps })
        output.addAudioTrack(audioSource)
        await output.start()

        await audioSource.add(mixedAudio)
        audioSource.close()

        // MessageChannel cede o event loop sem sofrer throttling de setTimeout em abas ocultas
        const yieldFast = () => new Promise((resolve) => {
          if (typeof MessageChannel !== "undefined") {
            const ch = new MessageChannel()
            ch.port1.onmessage = () => resolve()
            ch.port2.postMessage(0)
          } else {
            setTimeout(resolve, 0)
          }
        })

        for (let f = 0; f < totalFrames; f++) {
          const t = Math.min(finalDuration, f * frameDur)
          renderAtTime(t)
          await videoSource.add(t, frameDur)
          if (f % 4 === 0 || f === totalFrames - 1) {
            onProgress?.(Math.min(99, Math.round(((f + 1) / totalFrames) * 100)), t)
            await yieldFast()
          }
        }
        videoSource.close()
        await output.finalize()

        const blob = new Blob([target.buffer], { type: "video/mp4" })
        if (tempMount && cv.parentNode) cv.parentNode.removeChild(cv)
        await actx.close().catch(() => { })
        engine.dispose()
        return { blob, mimeType: "video/mp4", ext: "mp4", duration: finalDuration, mode: "mp4-offline" }
      }
    } catch (err) {
      console.warn("Fallback para MediaRecorder (MP4 WebCodecs indisponível):", err?.message || err)
    }
  }

  // Caminho 2 (Fallback): MediaRecorder em tempo real (WebM)
  const dest = actx.createMediaStreamDestination()
  const voiceSrc = actx.createBufferSource()
  voiceSrc.buffer = voiceBuf
  voiceSrc.connect(dest)
  const activeAudioNodes = [voiceSrc]

  renderAtTime(0)
  renderAtTime(Math.min(finalDuration, 0.05))

  let bgSrc = null
  let bgGain = null
  if (bgBuf) {
    bgSrc = actx.createBufferSource()
    bgSrc.buffer = bgBuf
    bgSrc.loop = true
    bgGain = actx.createGain()
    bgGain.gain.value = 0.14
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
      resolve({ blob, mimeType: mime, ext: mime.includes("mp4") ? "mp4" : "webm", duration: finalDuration, mode: "mediarecorder" })
    }
  })

  const playSfx = (buf, at, vol) => {
    if (!buf || at < 0) return
    const s = actx.createBufferSource()
    s.buffer = buf
    const g = actx.createGain()
    g.gain.value = vol
    s.connect(g); g.connect(dest)
    s.start(at)
    activeAudioNodes.push(s)
  }

  recorder.start(250)
  await new Promise((r) => requestAnimationFrame(r))

  const audioStart = actx.currentTime + 0.06
  if (bgGain && dropIdx > 0 && sceneWindows[dropIdx]) {
    const dropAt = audioStart + sceneWindows[dropIdx].start - 0.12
    if (dropAt > audioStart + 0.5) {
      bgGain.gain.setValueAtTime(0.14, Math.max(audioStart, dropAt - 0.15))
      bgGain.gain.linearRampToValueAtTime(0.0001, dropAt)
    }
  }

  cenas.forEach((cena, i) => {
    const startAt = audioStart + (sceneWindows[i]?.start || 0)
    if (i > 0 && whooshBuf && i % 2 === 0 && i !== dropIdx) playSfx(whooshBuf, startAt, 0.22)
    if (cena.textoTela && popBuf) playSfx(popBuf, startAt + 0.04, 0.25)
    if (i === dropIdx - 1 && subidaBuf) playSfx(subidaBuf, startAt, 0.24)
    if (i === dropIdx || cena.virada || cena.efeito === "flash") {
      playSfx(impactoBuf || surpresaBuf, startAt, 0.42)
      if (surpresaBuf && impactoBuf) playSfx(surpresaBuf, startAt + 0.06, 0.34)
    }
  })

  voiceSrc.start(audioStart)
  if (bgSrc) bgSrc.start(audioStart)

  const wallFallbackT0 = performance.now() + 60
  let nextDue = performance.now()
  let renderedCount = 0

  await new Promise((resolve) => {
    function tick() {
      const actxElapsed = actx.currentTime - audioStart
      const elapsed = Number.isFinite(actxElapsed) && actxElapsed > -0.2 ? Math.max(0, actxElapsed) : Math.max(0, (performance.now() - wallFallbackT0) / 1000)
      if (elapsed >= finalDuration && renderedCount >= 10) {
        resolve()
        return
      }
      const clampedT = Math.min(elapsed, finalDuration)
      renderAtTime(clampedT)
      renderedCount++
      onProgress?.(Math.min(99, Math.round((clampedT / finalDuration) * 100)), clampedT)

      nextDue += 1000 / 30
      const waitMs = Math.max(4, nextDue - performance.now())
      if (waitMs < 4) nextDue = performance.now()
      setTimeout(tick, waitMs)
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
