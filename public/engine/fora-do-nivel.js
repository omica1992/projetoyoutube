(() => {
  const { scenes, chunks, duration } = JSON.parse(document.querySelector("#scene-data").textContent)
  const stage = document.querySelector("#stage")
  const audio = document.querySelector("audio")
  const play = document.querySelector("#play")
  const caption = document.querySelector("#caption")
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(1080, 1920)
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace
  else renderer.outputEncoding = THREE.sRGBEncoding
  stage.prepend(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 130)
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 24, 16),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
    cone: new THREE.ConeGeometry(0.5, 1, 24),
    ring: new THREE.TorusGeometry(0.4, 0.1, 12, 28),
  }
  const shadowCanvas = document.createElement("canvas")
  shadowCanvas.width = shadowCanvas.height = 64
  const shadowContext = shadowCanvas.getContext("2d")
  const gradient = shadowContext.createRadialGradient(32, 32, 4, 32, 32, 31)
  gradient.addColorStop(0, "rgba(34,29,24,0.42)")
  gradient.addColorStop(1, "rgba(34,29,24,0)")
  shadowContext.fillStyle = gradient
  shadowContext.fillRect(0, 0, 64, 64)
  const shadowGeometry = new THREE.PlaneGeometry(1, 1)
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
  })
  const materials = new Map()
  function mesh(shape, color, position, size) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }))
    const object = new THREE.Mesh(geometry[shape], materials.get(color))
    object.position.set(...position)
    object.scale.set(...size)
    return object
  }

  function mascot() {
    const avatar = new THREE.Group()
    const skin = "#df9c65"
    const blue = "#2267bd"
    const helmet = "#f58d17"
    avatar.add(
      mesh("box", blue, [0, 0.95, 0], [0.66, 0.69, 0.42]),
      mesh("sphere", skin, [0, 1.55, 0], [0.62, 0.64, 0.57]),
      mesh("sphere", helmet, [0, 1.83, 0], [0.73, 0.40, 0.69]),
      mesh("cylinder", helmet, [0, 1.77, 0.06], [0.78, 0.055, 0.75]),
      mesh("box", "#202b3a", [0, 1.39, 0.252], [0.15, 0.033, 0.04]),
    )
    for (const x of [-1, 1]) {
      avatar.add(
        mesh("box", "#354459", [x * 0.18, 0.38, 0], [0.28, 0.61, 0.30]),
        mesh("box", "#222933", [x * 0.18, 0.09, 0.1], [0.31, 0.17, 0.5]),
        mesh("sphere", "#fff6e8", [x * 0.117, 1.55, 0.245], [0.13, 0.15, 0.1]),
        mesh("sphere", "#152331", [x * 0.113, 1.55, 0.287], [0.061, 0.086, 0.043]),
      )
      const arm = new THREE.Group()
      arm.position.set(x * 0.39, 1.13, 0)
      arm.add(
        mesh("sphere", blue, [0, 0, 0], [0.25, 0.29, 0.26]),
        mesh("sphere", skin, [0, -0.23, 0.08], [0.17, 0.48, 0.19]),
      )
      if (x > 0) arm.add(
        mesh("box", "#f8cd24", [0, -0.43, 0.14], [0.54, 0.12, 0.14]),
        mesh("box", "#3f4634", [0, -0.43, 0.218], [0.14, 0.058, 0.025]),
        mesh("sphere", "#a8e477", [0, -0.43, 0.234], [0.062, 0.032, 0.025]),
      )
      avatar.add(arm)
      avatar.userData[x < 0 ? "leftArm" : "rightArm"] = arm
    }
    return avatar
  }

  function prepare(shot) {
    const world = new THREE.Scene()
    world.background = new THREE.Color(shot.sky)
    world.fog = new THREE.Fog(shot.sky, 27, 55)
    world.add(new THREE.HemisphereLight("#eff8ff", "#6b5037", 0.92))
    const sun = new THREE.DirectionalLight("#fff1d4", 1.02)
    sun.position.set(-5, 12, 7)
    world.add(sun, mesh("box", shot.ground, [0, -0.15, 0], [90, 0.3, 90]))

    const objects = shot.objects.map((spec) => {
      const object = spec.shape === "mascot"
        ? mascot()
        : mesh(spec.shape, spec.color, spec.position, spec.size)
      object.scale.set(...spec.size)
      world.add(object)
      const base = spec.position[1] - (spec.shape === "mascot" ? 0 : spec.size[1] / 2)
      const shadow = base < 0.5 ? new THREE.Mesh(shadowGeometry, shadowMaterial) : null
      if (shadow) {
        shadow.rotation.x = -Math.PI / 2
        shadow.scale.set(spec.size[0] * 1.65, spec.size[2] * 1.65, 1)
        world.add(shadow)
      }
      return { spec, object, shadow }
    })
    return { ...shot, world, objects }
  }

  const shots = scenes.map(prepare)
  function setTime(seconds) {
    const t = Math.max(0, Math.min(duration, seconds))
    const shot = shots.find((s) => t < s.end) || shots.at(-1)
    const elapsed = t - shot.start
    const progress = Math.min(1, elapsed / Math.max(0.01, shot.end - shot.start))
    for (const { spec, object, shadow } of shot.objects) {
      const [x, y, z] = spec.position
      const f = spec.strength
      const motionProgress = Math.max(0, (progress - spec.onset) / (1 - spec.onset))
      const motionTime = Math.max(0, elapsed - spec.onset * (shot.end - shot.start))
      object.position.set(x, y, z)
      object.rotation.set(...spec.rotation)
      object.visible = spec.motion !== "rise" || progress >= spec.onset
      switch (spec.motion) {
        case "shake":
          object.position.x += Math.sin(motionTime * 15) * f
          object.rotation.z += Math.sin(motionTime * 12) * f * 0.13
          break
        case "swing":
          object.position.x += Math.sin(motionTime * 2.2) * f
          object.rotation.z += Math.sin(motionTime * 2.2) * f * 0.25
          break
        case "rise":
          object.position.y -= (1 - Math.min(1, motionProgress * 2)) ** 2 * f * 3
          break
        case "roll":
          object.position.x += motionProgress * f * 3
          object.rotation.z -= motionProgress * f * 5
          break
        case "slide":
          object.position.x += Math.sin(motionProgress * Math.PI * 0.8) * f * 3
          break
        case "bob":
          object.position.y += Math.abs(Math.sin(motionTime * 3)) * f
          break
      }
      if (spec.shape === "mascot") {
        object.userData.leftArm.rotation.z = -0.22 - Math.sin(elapsed * 3.1) * 0.24
        object.userData.rightArm.rotation.x = -0.95 - Math.sin(elapsed * 3.3) * 0.31
      }
      if (shadow) {
        shadow.position.set(object.position.x, 0.015, object.position.z)
        shadow.visible = object.visible
      }
    }
    camera.position.set(...shot.camera)
    camera.position.x += Math.sin(progress * 1.4) * 0.75
    camera.position.lerp(new THREE.Vector3(...shot.target), progress * 0.08)
    camera.lookAt(...shot.target)
    renderer.render(shot.world, camera)
    caption.textContent = chunks.find((c) => t >= c.start && t < c.end)?.text || ""
  }

  function fit() {
    const scale = Math.min(innerWidth / 1080, innerHeight / 1920)
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`
  }
  function sync() {
    setTime(audio.currentTime)
    if (!audio.paused) requestAnimationFrame(sync)
  }
  audio.addEventListener("play", () => {
    play.textContent = "Pausar"
    sync()
  })
  audio.addEventListener("pause", () => { play.textContent = audio.ended ? "Assistir de novo" : "Continuar" })
  play.addEventListener("click", () => {
    if (!audio.paused) return audio.pause()
    audio.play().catch(() => { play.textContent = "Não foi possível reproduzir o áudio" })
  })
  addEventListener("resize", fit)
  play.hidden = Boolean(window.__RENDER__)
  fit()
  setTime(0)
  window.__STUDIO__ = { duration, ready: true, setTime, play: () => audio.play() }
})()
