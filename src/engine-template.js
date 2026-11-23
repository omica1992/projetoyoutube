import { readFileSync } from "node:fs"

const ENGINE_SOURCE = readFileSync(new URL("../public/engine/engine.js", import.meta.url), "utf8")

const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.55'/></svg>`,
  )

export function buildEngineHtml({ timeline, audioName, titulo, extraCss = "" }) {
  const json = JSON.stringify(timeline)
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, initial-scale=1">
<title>${escapeHtml(titulo || "Short")}</title>
<style>
  html, body { margin:0; padding:0; background:#000; overflow:hidden; }
  body { display:flex; align-items:center; justify-content:center; height:100vh; }
  #stage {
    position:relative; width:1080px; height:1920px; overflow:hidden;
    background: var(--fundo, #0a0a0f); flex:0 0 auto; transform-origin: center center;
  }
  #bg, #bg2, #fx, #grain, #flash, #vignette, #ghost, #topbar, #progress, #pill, #caption { position:absolute; }
  #bg { inset:-8%; background: linear-gradient(120deg,#0a0a0f,#151025); will-change: transform; }
  #bg2 { inset:-20%; background: radial-gradient(38% 30% at 50% 38%, rgba(255,61,90,.4), transparent 70%); filter: blur(40px); }
  #fx { inset:-10%; opacity:.5; background-repeat: repeat; }
  #grain { inset:-60%; background-image:url("${NOISE}"); background-size:300px 300px; opacity:.07; mix-blend-mode:overlay; }
  #vignette { inset:0; background: radial-gradient(70% 55% at 50% 46%, transparent 30%, rgba(0,0,0,.55) 78%, rgba(0,0,0,.92) 100%); }
  #flash { inset:0; background:#fff; opacity:0; mix-blend-mode:screen; }

  #ghost {
    left:50%; top:52%; transform:translate(-50%,-50%); opacity:0;
    font-family: var(--familia, Impact, sans-serif); font-weight:900; font-size:760px;
    color: var(--destaque, #ff3d5a); letter-spacing:-.06em; line-height:1; pointer-events:none;
    text-shadow: 0 0 120px rgba(0,0,0,.6);
  }

  #topbar {
    top:200px; left:0; right:0; text-align:center;
    font-family: var(--familia, Impact, sans-serif); font-size:26px; letter-spacing:.42em;
    color: var(--secundaria, #9aa0b4); text-transform:uppercase; opacity:.6;
  }

  #caption {
    left:54px; right:54px; bottom:360px;
    text-align:center; font-family: var(--familia, Impact, sans-serif);
    font-weight: var(--peso, 900); text-transform: var(--caixa, uppercase);
    font-size:104px; line-height:.94; letter-spacing:-.015em;
    color: var(--primaria, #fff);
    transform-origin: 50% 100%;
  }
  #caption .line { display:block; margin: 0 0 .06em; }
  #caption .w {
    display:inline-block; margin:0 .075em; transform-origin:50% 62%;
    will-change: transform, opacity, color;
    text-shadow: 0 10px 0 rgba(0,0,0,.92), 0 0 42px rgba(0,0,0,.75);
  }
  #caption .w.em { position:relative; }
  #caption .w.em::after {
    content:""; position:absolute; left:2%; right:2%; bottom:.02em; height:.075em;
    background: var(--destaque, #ff3d5a); opacity:.9; border-radius:2px;
  }

  #progress { bottom:300px; left:54px; width:0; height:7px; border-radius:4px;
    background: linear-gradient(90deg, var(--destaque, #ff3d5a), var(--primaria, #fff));
    box-shadow: 0 0 22px rgba(255,255,255,.35); }

  #pill {
    top:340px; left:50%; transform:translateX(-50%);
    font-family: var(--familia, Impact, sans-serif); font-size:24px; letter-spacing:.28em;
    text-transform:uppercase; color: var(--fundo, #08080d);
    background: var(--destaque, #ff3d5a); padding:9px 18px 7px; border-radius:999px;
    opacity:0; white-space:nowrap; box-shadow:0 8px 24px rgba(0,0,0,.45);
  }

  #hint {
    position:absolute; left:50%; top:47%; transform:translate(-50%,-50%);
    font-family:ui-sans-serif, system-ui, sans-serif; font-size:22px; letter-spacing:.18em;
    text-transform:uppercase; color:rgba(255,255,255,.75);
    border:1px solid rgba(255,255,255,.25); border-radius:999px; padding:12px 22px;
    background:rgba(0,0,0,.35); backdrop-filter:blur(6px);
    transition:opacity .3s; z-index:5; pointer-events:none;
  }

  .badge {
    position:absolute; bottom:110px; left:0; right:0; text-align:center;
    font-family: var(--familia, Impact, sans-serif); font-size:22px; letter-spacing:.34em;
    color: var(--secundaria, #9aa0b4); opacity:.35; text-transform:uppercase;
  }
${extraCss ? `  /* --- design autoral da IA --- */\n${extraCss}` : ""}
</style>
</head>
<body>
  <div id="stage">
    <div id="bg"></div>
    <div id="bg2"></div>
    <div id="fx"></div>
    <div id="ghost"></div>
    <div id="grain"></div>
    <div id="vignette"></div>
    <div id="flash"></div>
    <div id="topbar"></div>
    <div id="pill"></div>
    <div id="caption"></div>
    <div id="progress"></div>
    <div class="badge">@ SEU CANAL</div>
    <div id="hint">▶ clique para ouvir</div>
  </div>
  <audio id="audio" src="${escapeAttr(audioName)}" preload="auto"></audio>
  <script>window.__TIMELINE__ = ${json};</script>
  <script>
${ENGINE_SOURCE}
  </script>
  <script>
    // preview animado (sem som) até o usuário clicar; render usa 1080x1920 fixo
    (function () {
      const stage = document.getElementById('stage')
      const audio = document.getElementById('audio')
      const hint = document.getElementById('hint')
      if (window.__RENDER__ && hint) hint.remove()

      function fit() {
        if (window.__RENDER__) return
        const s = Math.min(window.innerWidth / 1080, window.innerHeight / 1920)
        stage.style.transform = 'scale(' + s + ')'
      }
      window.addEventListener('resize', fit)
      fit()

      if (window.__RENDER__) return

      const t0 = performance.now()
      setInterval(function () {
        if (!window.__STUDIO__ || !audio.paused) return
        const d = window.__STUDIO__.duration || 1
        window.__STUDIO__.setTime(((performance.now() - t0) / 1000) % d)
      }, 40)

      function iniciar() {
        if (!window.__STUDIO__) return
        if (hint) hint.style.opacity = '0'
        window.__STUDIO__.play()
      }
      stage.addEventListener('click', iniciar)
      audio.addEventListener('ended', function () {
        if (hint) hint.style.opacity = '1'
      })
    })()
  </script>
</body>
</html>`
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])
}
function escapeAttr(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
}
