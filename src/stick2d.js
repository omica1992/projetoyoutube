import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { parseJsonLoose } from "./opencode.js"
import { askStudioGo } from "./studio-go.js"
import { captureFrames, encodeMp4 } from "./render.js"
import { FPS, HEIGHT, WIDTH } from "./config.js"

const CHARACTERS = {
  nina: { name: "Nina", shirt: "#cc7a6f", pants: "#f5e6cc", shoes: "#cc7a6f", hair: "buns", glasses: false },
  beto: { name: "Beto", shirt: "#cfa75c", pants: "#4a4a4a", shoes: "#cfa75c", hair: "none", glasses: true },
  leo: { name: "Léo", shirt: "#688296", pants: "#4a4a4a", shoes: "#f5e6cc", hair: "quiff", glasses: false },
}

export async function planStick2dVideo({ model, title, script, duration, words }) {
  const total = Math.round((duration + 0.4) * 1000) / 1000
  const plan = await askStudioGo({
    model,
    text: `Você é o diretor de animação 2D estilo Boneco de Palito (flat vector).
Retorne SOMENTE JSON válido: {"ambiente":{"cenario":"floresta|cidade|sala|noite"},"cenas":[{"inicio":0,"fim":5,"cenario":"floresta","camera":"medio|aberto|close","descricaoVisual":"frase curta em português","personagens":[{"nome":"nina|beto|leo","acao":"correr|andar|parado|falar|assustado|acenar|apontar","expressao":"normal|feliz|assustado|suando","x":0.42,"dir":1}],"props":["dinossauro|sol|nuvens|ideia|livro|relogio"]}]}
Regras:
- As cenas devem cobrir exatamente de 0 a ${total} segundos, sem lacunas.
- Personagens disponíveis: "nina", "beto", "leo".
- Cenários disponíveis: "floresta", "cidade", "sala", "noite".
- Ações: "correr", "andar", "parado", "falar", "assustado", "acenar", "apontar".
- Expressões: "normal", "feliz", "assustado", "suando".
- x é posição horizontal de 0.15 a 0.85; dir é 1 (direita) ou -1 (esquerda).
Título: ${JSON.stringify(title)}
Roteiro: ${JSON.stringify(script)}
Palavras (segundos): ${JSON.stringify(words.slice(0, 140))}`,
  })
  const parsed = parseJsonLoose(plan)
  if (!Array.isArray(parsed?.cenas) || !parsed.cenas.length) {
    throw new Error("O modelo não retornou cenas 2D válidas.")
  }
  return {
    versao: 1,
    estilo: "2d-palito",
    titulo: title,
    formato: { largura: WIDTH, altura: HEIGHT, fps: FPS },
    duracao: total,
    ambiente: parsed.ambiente || { cenario: "floresta" },
    cenas: parsed.cenas,
  }
}

export async function reviseStick2dVideo({ model, storyboard, scene, time, history, message, image }) {
  const current = storyboard.cenas[scene]
  const raw = await askStudioGo({
    model,
    image,
    text: `Você é o diretor de animação 2D Boneco de Palito.
Responda APENAS JSON: {"resposta":"texto breve ao usuário","cena":{...} ou null}.
Edite somente a cena ${scene + 1} (em ${time}s), preservando inicio=${current.inicio} e fim=${current.fim}.
Personagens: nina, beto, leo. Cenários: floresta, cidade, sala, noite.
Cena atual: ${JSON.stringify(current)}
Histórico: ${JSON.stringify(history.slice(-8))}
Pedido: ${JSON.stringify(message)}`,
  })
  const result = parseJsonLoose(raw)
  if (typeof result?.resposta !== "string" || !result.resposta.trim()) {
    throw new Error("O modelo não retornou uma resposta válida para a revisão 2D.")
  }
  const edited = result.cena && typeof result.cena === "object"
    ? { ...current, ...result.cena, inicio: current.inicio, fim: current.fim }
    : null
  const next = edited ? { ...storyboard, cenas: storyboard.cenas.map((c, i) => (i === scene ? edited : c)) } : null
  return { response: result.resposta.trim().slice(0, 4000), storyboard: next }
}

export function buildStick2dHtml({ storyboard, words = [], width = WIDTH, height = HEIGHT }) {
  const payload = JSON.stringify({ storyboard, words, characters: CHARACTERS, width, height })
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #14181f; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="stage" width="${width}" height="${height}"></canvas>
<script>
const DATA = ${payload};
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const W = DATA.width, H = DATA.height;
const CREAM = "#f5e6cc";

function activeScene(t) {
  const cenas = DATA.storyboard.cenas || [];
  return cenas.find(c => t >= c.inicio && t < c.fim) || cenas[cenas.length - 1] || { inicio: 0, fim: DATA.storyboard.duracao || 10, cenario: "floresta", personagens: [{ nome: "nina", acao: "falar", expressao: "feliz", x: 0.5, dir: 1 }] };
}

function activeWord(t) {
  return (DATA.words || []).find(w => t >= w.inicio && t <= w.fim);
}

function drawBackground(cenario, t, scroll) {
  if (cenario === "noite") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#10192b"); g.addColorStop(0.68, "#1e2e46"); g.addColorStop(1, "#2a3b35");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff5d6";
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.18, 56, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 173) % W), sy = ((i * 97) % (H * 0.45));
      ctx.fillStyle = "rgba(255,248,220," + (0.4 + 0.4 * Math.sin(t * 2 + i)) + ")";
      ctx.beginPath(); ctx.arc(sx, sy, (i % 3) + 1.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (cenario === "cidade") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8eb8d6"); g.addColorStop(0.65, "#cde2ee"); g.addColorStop(1, "#6f7782");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const buildings = [220, 340, 260, 410, 290, 360, 240];
    buildings.forEach((bh, i) => {
      const bx = ((i * 190 - scroll * 0.35) % (W + 300) + (W + 300)) % (W + 300) - 150;
      ctx.fillStyle = i % 2 ? "#5a687a" : "#4b5768";
      ctx.fillRect(bx, H * 0.68 - bh, 150, bh);
      ctx.fillStyle = "#dfeaf2";
      for (let wy = H * 0.68 - bh + 24; wy < H * 0.65; wy += 44) {
        for (let wx = bx + 20; wx < bx + 120; wx += 42) ctx.fillRect(wx, wy, 22, 26);
      }
    });
    ctx.fillStyle = "#484e57"; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    ctx.fillStyle = "#e8d282";
    for (let i = 0; i < 7; i++) {
      const rx = ((i * 220 - scroll) % (W + 220) + (W + 220)) % (W + 220) - 110;
      ctx.fillRect(rx, H * 0.82, 95, 14);
    }
    return;
  } else if (cenario === "sala") {
    ctx.fillStyle = "#dfd7c8"; ctx.fillRect(0, 0, W, H * 0.72);
    ctx.fillStyle = "#b38d65"; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillStyle = "#9ec5dc"; ctx.fillRect(W * 0.14, H * 0.16, 260, 240);
    ctx.strokeStyle = "#7a5e42"; ctx.lineWidth = 14; ctx.strokeRect(W * 0.14, H * 0.16, 260, 240);
    ctx.beginPath(); ctx.moveTo(W * 0.14 + 130, H * 0.16); ctx.lineTo(W * 0.14 + 130, H * 0.16 + 240); ctx.stroke();
    return;
  } else {
    // Floresta (referência do vídeo)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8fa883"); g.addColorStop(0.68, "#5d7750"); g.addColorStop(1, "#3f4f32");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Árvores em parallax para floresta/noite
  for (let layer = 0; layer < 2; layer++) {
    const speed = layer === 0 ? 0.25 : 0.6;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const tx = ((i * 260 - scroll * speed) % (W + 300) + (W + 300)) % (W + 300) - 150;
      const trunkW = layer === 0 ? 34 : 52;
      ctx.fillStyle = cenario === "noite" ? "#1d2621" : (layer === 0 ? "#4f5c41" : "#4a3828");
      ctx.fillRect(tx, H * 0.18, trunkW, H * 0.56);
      ctx.fillStyle = cenario === "noite" ? "#26362b" : (layer === 0 ? "#4b6b42" : "#3a5a32");
      ctx.beginPath(); ctx.arc(tx + trunkW / 2, H * 0.2, 110 + (i % 3) * 20, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = cenario === "noite" ? "#273026" : "#877254";
  ctx.fillRect(0, H * 0.71, W, H * 0.29);
  ctx.fillStyle = cenario === "noite" ? "#1e2a1e" : "#446233";
  for (let i = 0; i < 8; i++) {
    const gx = ((i * 180 - scroll * 1.1) % (W + 200) + (W + 200)) % (W + 200) - 100;
    ctx.beginPath(); ctx.ellipse(gx, H * 0.72, 70, 26, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawDinosaur(x, y, t, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const bob = Math.sin(t * 11) * 8;
  ctx.translate(0, bob);
  ctx.strokeStyle = CREAM; ctx.lineWidth = 6;
  // Corpo e cauda
  ctx.fillStyle = "#b85a3a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 95, 58, -0.2, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, -10); ctx.quadraticCurveTo(155, -35, 195, -5); ctx.quadraticCurveTo(135, 30, 50, 25);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Cabeça
  ctx.beginPath();
  ctx.roundRect(-145, -105, 125, 72, 24);
  ctx.fill(); ctx.stroke();
  // Olho
  ctx.fillStyle = "#fff"; ctx.fillRect(-112, -90, 22, 22);
  ctx.fillStyle = "#111"; ctx.fillRect(-108, -86, 10, 14);
  // Dentes
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(-138 + i * 18, -33); ctx.lineTo(-130 + i * 18, -18); ctx.lineTo(-122 + i * 18, -33); ctx.fill();
  }
  // Pernas correndo
  const l1 = Math.sin(t * 11) * 0.45;
  ctx.lineCap = "round"; ctx.lineWidth = 22; ctx.strokeStyle = "#96462c";
  ctx.beginPath(); ctx.moveTo(-15, 42); ctx.lineTo(-15 + Math.sin(l1) * 45, 115); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(25, 42); ctx.lineTo(25 - Math.sin(l1) * 45, 115); ctx.stroke();
  ctx.restore();
}

function drawCharacter(p, t, speaking, scale = 1.15) {
  const spec = DATA.characters[p.nome] || DATA.characters.nina;
  const x = (p.x ?? 0.5) * W;
  const baseY = H * 0.72;
  const acao = p.acao || "parado";
  const expr = p.expressao || "normal";
  const run = acao === "correr";
  const walk = acao === "andar";
  const freq = run ? 12 : walk ? 6 : 2.5;
  const swing = (run ? 0.75 : walk ? 0.42 : 0.06) * Math.sin(t * freq);
  const bob = run ? Math.abs(Math.sin(t * freq)) * -18 : walk ? Math.abs(Math.sin(t * freq)) * -7 : Math.sin(t * 2.5) * 3;

  ctx.save();
  ctx.translate(x, baseY + bob);
  ctx.scale((p.dir || 1) * scale, scale);
  if (run) ctx.rotate(0.12);

  // Sombra no chão
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(0, 0 - bob, 52, 12, 0, 0, Math.PI * 2); ctx.fill();

  const hipY = -125, shoulderY = -230, headY = -305;

  // Pernas finas pretas + tênis
  const drawLeg = (side) => {
    const a = side * swing;
    const kx = Math.sin(a) * 58, ky = hipY + Math.cos(a) * 58;
    const fx = kx + Math.sin(a * 0.7 - (run ? 0.4 : 0)) * 56;
    const fy = Math.min(-10, ky + Math.cos(a * 0.7) * 56);
    ctx.strokeStyle = CREAM; ctx.lineWidth = 22; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(side * 16, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = "#0b0b0c"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(side * 16, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    // Tênis
    ctx.fillStyle = spec.shoes; ctx.strokeStyle = CREAM; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(fx + 10, fy + 4, 22, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  drawLeg(-1); drawLeg(1);

  // Tronco / roupa geométrica
  ctx.fillStyle = spec.shirt; ctx.strokeStyle = CREAM; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-42, shoulderY, 84, 112, 18);
  ctx.fill(); ctx.stroke();
  // Calça / short
  ctx.fillStyle = spec.pants;
  ctx.beginPath();
  ctx.roundRect(-40, hipY - 14, 80, 34, 8);
  ctx.fill(); ctx.stroke();

  // Braços segmentados com articulação no cotovelo e mão esférica
  const drawArm = (side) => {
    let a = -side * swing * 0.9;
    if (acao === "assustado") a = -2.2 + side * 0.3;
    if (acao === "acenar" && side === 1) a = -2.4 + Math.sin(t * 10) * 0.4;
    if (acao === "apontar" && side === 1) a = -1.45;
    const sx = side * 44, sy = shoulderY + 18;
    const ex = sx + Math.sin(a) * 44, ey = sy + Math.cos(a) * 44;
    const hx = ex + Math.sin(a + (run ? 0.8 : 0.3)) * 42, hy = ey + Math.cos(a + (run ? 0.8 : 0.3)) * 42;
    ctx.strokeStyle = CREAM; ctx.lineWidth = 24; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = spec.shirt; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    // Articulação do cotovelo
    ctx.fillStyle = spec.shirt; ctx.strokeStyle = "#0b0b0c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Mão esférica preta
    ctx.fillStyle = "#0b0b0c"; ctx.strokeStyle = CREAM; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  drawArm(-1);

  // Cabeça circular preta + contorno creme
  if (spec.hair === "buns") {
    ctx.fillStyle = "#0b0b0c"; ctx.strokeStyle = CREAM; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(-48, headY - 46, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(48, headY - 46, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = "#0b0b0c"; ctx.strokeStyle = CREAM; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, headY, 62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if (spec.hair === "quiff") {
    ctx.fillStyle = "#f5e2c0"; ctx.strokeStyle = CREAM; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-22, headY - 56); ctx.quadraticCurveTo(8, headY - 96, 36, headY - 58); ctx.quadraticCurveTo(8, headY - 46, -22, headY - 56); ctx.fill(); ctx.stroke();
  }

  // Olhos retangulares brancos + expressão
  const eyeH = expr === "assustado" ? 24 : 18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.roundRect(-24, headY - 14, 13, eyeH, 5); ctx.fill();
  ctx.beginPath(); ctx.roundRect(11, headY - 14, 13, eyeH, 5); ctx.fill();

  if (spec.glasses) {
    ctx.strokeStyle = CREAM; ctx.lineWidth = 3.5;
    ctx.strokeRect(-32, headY - 20, 28, 26);
    ctx.strokeRect(4, headY - 20, 28, 26);
    ctx.beginPath(); ctx.moveTo(-4, headY - 8); ctx.lineTo(4, headY - 8); ctx.stroke();
  }

  // Boca (sincroniza quando falando)
  const mouthOpen = speaking ? 4 + Math.abs(Math.sin(t * 18)) * 10 : expr === "assustado" ? 10 : 0;
  ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 4; ctx.lineCap = "round";
  if (mouthOpen > 2) {
    ctx.beginPath(); ctx.ellipse(0, headY + 24, 12, mouthOpen * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath();
    if (expr === "feliz") ctx.arc(0, headY + 18, 13, 0.15, Math.PI - 0.15);
    else { ctx.moveTo(-10, headY + 24); ctx.lineTo(10, headY + 24); }
    ctx.stroke();
  }

  // Gota de suor quando assustado/suando
  if (expr === "assustado" || expr === "suando") {
    ctx.fillStyle = "#7ed3f7"; ctx.strokeStyle = CREAM; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(42, headY - 38); ctx.quadraticCurveTo(52, headY - 20, 42, headY - 16); ctx.quadraticCurveTo(32, headY - 20, 42, headY - 38); ctx.fill(); ctx.stroke();
  }

  drawArm(1);
  ctx.restore();
}

function drawCaption(word) {
  if (!word?.palavra) return;
  ctx.save();
  ctx.font = "800 62px Inter, 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = word.palavra.toUpperCase();
  const y = H * 0.85;
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(10, 14, 20, 0.85)";
  ctx.strokeText(text, W / 2, y);
  ctx.fillStyle = "#ffe38e";
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}

function renderFrame(t) {
  const scene = activeScene(t);
  const running = (scene.personagens || []).some(p => p.acao === "correr" || p.acao === "andar");
  const scroll = running ? t * 240 : t * 22;
  drawBackground(scene.cenario || DATA.storyboard.ambiente?.cenario || "floresta", t, scroll);

  const w = activeWord(t);
  if ((scene.props || []).includes("dinossauro")) {
    drawDinosaur(W * 0.78, H * 0.65, t, 1.15);
  }
  const chars = scene.personagens?.length ? scene.personagens : [{ nome: "nina", acao: "falar", expressao: "feliz", x: 0.5, dir: 1 }];
  for (const ch of chars) {
    drawCharacter(ch, t, Boolean(w), scene.camera === "close" ? 1.45 : scene.camera === "aberto" ? 0.95 : 1.15);
  }
  drawCaption(w);
}

window.__STUDIO__ = {
  duration: DATA.storyboard.duracao || 10,
  ready: true,
  setTime(t) { renderFrame(Math.max(0, Number(t) || 0)); },
  play() {
    const t0 = performance.now();
    const loop = () => {
      const t = ((performance.now() - t0) / 1000) % (DATA.storyboard.duracao || 10);
      renderFrame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
};
renderFrame(0);
</script>
</body>
</html>`
}

export async function renderStick2dVideo({ storyboard, words, audio, output, preview, onProgress }) {
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), "studio-2d-"))
  try {
    const htmlPath = path.join(stage, "stick2d.html")
    const framesDir = path.join(stage, "frames")
    await fs.writeFile(htmlPath, buildStick2dHtml({ storyboard, words }), "utf8")
    await captureFrames({
      htmlPath,
      framesDir,
      duration: storyboard.duracao,
      workers: preview ? 2 : 2,
      onProgress: ({ frame, frames, pct }) => onProgress?.(`Renderizando quadro 2D ${frame} de ${frames}`, pct),
    })
    await encodeMp4({ framesDir, audioPath: audio, outFile: output })
    return storyboard
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => {})
  }
}
