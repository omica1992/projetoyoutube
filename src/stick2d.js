import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { parseJsonLoose } from "./opencode.js"
import { askStudioGo } from "./studio-go.js"
import { captureFrames, encodeMp4 } from "./render.js"
import { FPS, HEIGHT, WIDTH } from "./config.js"

export const STICK_STYLES = {
  "2d-palito": { label: "2D Boneco de Palito (Nina, Beto, Léo)", theme: "flat" },
  b1: { label: "B1 · Traço minimalista (papel & lápis)", theme: "b1" },
  b2: { label: "B2 · Desenho à mão colorido", theme: "b2" },
  b3: { label: "B3 · TV retrô (CRT / mistério)", theme: "b3" },
  b4: { label: "B4 · Suspense de sobrevivência", theme: "b4" },
  b5: { label: "B5 · Explicação com personagem", theme: "b5" },
  b6: { label: "B6 · Meme dinâmico", theme: "b6" },
  b7: { label: "B7 · Teatro pixel (8-bit)", theme: "b7" },
  b8: { label: "B8 · Mitologia grega (papiro & ouro)", theme: "b8" },
}

export const isStickStyle = (style) => Boolean(style && Object.hasOwn(STICK_STYLES, style))

const CHARACTERS = {
  caio: {
    name: "Caio",
    kind: "runner",
    shirt: "#e06d24",
    skin: "#df9b62",
    pants: "#0b0b0c",
    shoes: "#ece5d2",
    backpack: "#788652",
    hair: "tuft",
  },
  nina: {
    name: "Nina",
    kind: "shorts",
    shirt: "#c87a72",
    pants: "#f5e6cc",
    shoes: "#c87a72",
    hair: "buns",
  },
  beto: {
    name: "Beto",
    kind: "shirt",
    shirt: "#d1a654",
    pocket: "#b58b3e",
    pants: "#4b4b4b",
    shoes: "#d1a654",
    hair: "none",
    glasses: true,
  },
  leo: {
    name: "Léo",
    kind: "pullover",
    shirt: "#647e91",
    pants: "#4b4b4b",
    shoes: "#f5e2c0",
    hair: "quiff",
    sleepy: true,
  },
}

export async function planStick2dVideo({ model, title, script, duration, words, style = "2d-palito" }) {
  const total = Math.round((duration + 0.4) * 1000) / 1000
  const styleInfo = STICK_STYLES[style]?.label || style
  const plan = await askStudioGo({
    model,
    text: `Você é o diretor de animação 2D no estilo "${styleInfo}" (Skill directing-stickman-videos).
Retorne SOMENTE JSON válido: {"ambiente":{"cenario":"floresta|cidade|sala|noite"},"cenas":[{"inicio":0,"fim":5,"cenario":"floresta","camera":"medio|aberto|close","plano":"A|B|C|D","descricaoVisual":"frase curta em português","personagens":[{"nome":"caio|nina|beto|leo","acao":"correr|andar|parado|falar|assustado|acenar|apontar","expressao":"normal|feliz|assustado|suando|cansado","x":0.36,"dir":1}],"props":["dinossauro|poeira|particulas"]}]}
Regras:
- As cenas devem cobrir exatamente de 0 a ${total} segundos, sem lacunas.
- Personagens disponíveis: "caio" (camiseta laranja e mochila verde), "nina" (blusa terracota e coques), "beto" (camisa mostarda e óculos), "leo" (camisa azul-acinzentada e topete loiro).
- Cenários disponíveis: "floresta", "cidade", "sala", "noite".
- Ações: "correr", "andar", "parado", "falar", "assustado", "acenar", "apontar".
- Expressões: "normal", "feliz", "assustado", "suando", "cansado".
- x é posição horizontal de 0.18 a 0.82; dir é 1 (olhando/indo p/ direita) ou -1 (indo p/ esquerda, ex: fugindo da direita para a esquerda).
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
    estilo: style,
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
Personagens: caio, nina, beto, leo. Cenários: floresta, cidade, sala, noite.
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
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #181c20; }
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
const CREAM = "#f3e3c6";
const INK = "#181818";

// Offscreen canvas para gerar o contorno creme ÚNICO ao redor da silhueta inteira
const off = document.createElement("canvas");
off.width = W; off.height = H;
const octx = off.getContext("2d");
const sil = document.createElement("canvas");
sil.width = W; sil.height = H;
const sctx = sil.getContext("2d");

function stampWithCreamOutline(drawFn, thickness = 5.5) {
  octx.clearRect(0, 0, W, H);
  drawFn(octx);

  // Cria máscara sólida cor creme da silhueta
  sctx.clearRect(0, 0, W, H);
  sctx.drawImage(off, 0, 0);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = CREAM;
  sctx.fillRect(0, 0, W, H);
  sctx.globalCompositeOperation = "source-over";

  // Carimba a silhueta creme em 16 direções para formar o contorno externo contínuo
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(a) * thickness, Math.sin(a) * thickness);
  }
  ctx.drawImage(off, 0, 0);
}

function activeScene(t) {
  const cenas = DATA.storyboard.cenas || [];
  return cenas.find(c => t >= c.inicio && t < c.fim) || cenas[cenas.length - 1] || {
    inicio: 0, fim: DATA.storyboard.duracao || 10, cenario: "floresta",
    personagens: [{ nome: "caio", acao: "correr", expressao: "assustado", x: 0.34, dir: -1 }],
    props: ["dinossauro"]
  };
}

function activeWord(t) {
  return (DATA.words || []).find(w => t >= w.inicio && t <= w.fim);
}

function drawFern(c, x, y, scale, flip = 1) {
  c.save();
  c.translate(x, y);
  c.scale(flip * scale, scale);
  const fronds = [
    { rot: -0.55, len: 180, col: "#3d5e2b" },
    { rot: -0.2, len: 220, col: "#4c7236" },
    { rot: 0.2, len: 200, col: "#355324" },
    { rot: 0.58, len: 160, col: "#588040" }
  ];
  for (const f of fronds) {
    c.save();
    c.rotate(f.rot);
    c.strokeStyle = "#263d19";
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(f.len * 0.5, -25, f.len, -10); c.stroke();
    c.fillStyle = f.col;
    for (let i = 18; i < f.len; i += 18) {
      const u = i / f.len;
      const lw = (1 - u * 0.65) * 28;
      c.beginPath(); c.ellipse(i, -14 - lw * 0.4, 7, lw, 0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(i, -10 + lw * 0.4, 7, lw, -0.25, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  c.restore();
}

function drawBackground(cenario, t, scroll) {
  if (cenario === "cinza" || cenario === "ficha") {
    ctx.fillStyle = "#9a9a9a";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (cenario === "cidade") {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    g.addColorStop(0, "#b8c9d4"); g.addColorStop(1, "#e5dec9");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const buildings = [260, 390, 310, 440, 290, 370, 250];
    buildings.forEach((bh, i) => {
      const bx = ((i * 195 - scroll * 0.3) % (W + 300) + (W + 300)) % (W + 300) - 150;
      ctx.fillStyle = i % 2 ? "#6b7a8a" : "#596777";
      ctx.fillRect(bx, H * 0.68 - bh, 165, bh);
      ctx.fillStyle = "#e8dfc8";
      for (let wy = H * 0.68 - bh + 28; wy < H * 0.64; wy += 46) {
        for (let wx = bx + 22; wx < bx + 135; wx += 44) ctx.fillRect(wx, wy, 24, 28);
      }
    });
    ctx.fillStyle = "#4d5259"; ctx.fillRect(0, H * 0.68, W, H * 0.32);
    ctx.fillStyle = "#d9c17a";
    for (let i = 0; i < 7; i++) {
      const rx = ((i * 220 - scroll) % (W + 220) + (W + 220)) % (W + 220) - 110;
      ctx.fillRect(rx, H * 0.82, 95, 12);
    }
    return;
  }
  if (cenario === "sala") {
    ctx.fillStyle = "#dfd5c3"; ctx.fillRect(0, 0, W, H * 0.72);
    ctx.fillStyle = "#9e7b56"; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillStyle = "#b5cad6"; ctx.fillRect(W * 0.14, H * 0.16, 260, 240);
    ctx.strokeStyle = "#6e5236"; ctx.lineWidth = 12; ctx.strokeRect(W * 0.14, H * 0.16, 260, 240);
    return;
  }

  // Floresta rica em camadas (idêntica aos quadros do vídeo de referência)
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
  if (cenario === "noite") {
    sky.addColorStop(0, "#1c2a24"); sky.addColorStop(1, "#2f4438");
  } else {
    sky.addColorStop(0, "#c8d7b4"); sky.addColorStop(0.55, "#9bb388"); sky.addColorStop(1, "#6b855c");
  }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // Feixes suaves de luz solar na mata
  if (cenario !== "noite") {
    ctx.save();
    ctx.fillStyle = "rgba(238, 247, 215, 0.16)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(120 + i * 320, 0); ctx.lineTo(280 + i * 320, 0);
      ctx.lineTo(620 + i * 320, H * 0.72); ctx.lineTo(390 + i * 320, H * 0.72);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Camada 1 (fundo distante): silhuetas de árvores e palmeiras na névoa
  for (let i = 0; i < 8; i++) {
    const tx = ((i * 190 - scroll * 0.18) % (W + 260) + (W + 260)) % (W + 260) - 130;
    ctx.fillStyle = "#7c946e";
    ctx.fillRect(tx, 0, 38 + (i % 3) * 14, H * 0.65);
    ctx.beginPath(); ctx.arc(tx + 20, H * 0.18 + (i % 2) * 50, 95, 0, Math.PI * 2); ctx.fill();
  }

  // Arbustos médios ao fundo
  ctx.fillStyle = "#4d693b";
  for (let i = 0; i < 9; i++) {
    const bx = ((i * 170 - scroll * 0.42) % (W + 240) + (W + 240)) % (W + 240) - 120;
    ctx.beginPath(); ctx.arc(bx, H * 0.64, 88 + (i % 3) * 18, 0, Math.PI * 2); ctx.fill();
  }

  // Camada 2: Troncos detalhados com casca, raízes e cipós
  for (let i = 0; i < 4; i++) {
    const tx = ((i * 390 - scroll * 0.55) % (W + 460) + (W + 460)) % (W + 460) - 230;
    const tw = 96 + (i % 2) * 28;
    ctx.fillStyle = "#52422e";
    ctx.beginPath();
    ctx.moveTo(tx, 0); ctx.lineTo(tx + tw, 0);
    ctx.lineTo(tx + tw + 18, H * 0.63);
    ctx.quadraticCurveTo(tx + tw + 65, H * 0.68, tx + tw + 90, H * 0.7);
    ctx.lineTo(tx - 65, H * 0.7);
    ctx.quadraticCurveTo(tx - 20, H * 0.66, tx, H * 0.62);
    ctx.closePath(); ctx.fill();
    // Textura vertical da casca
    ctx.fillStyle = "#3b2f20";
    for (let b = 0; b < 4; b++) {
      ctx.fillRect(tx + 14 + b * 22, 40 + (b % 2) * 60, 8, H * 0.52);
    }
    // Cipós pendurados
    ctx.strokeStyle = "#3e542c"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tx - 40, 80); ctx.quadraticCurveTo(tx - 15, 290, tx - 30, 420); ctx.stroke();
  }

  // Copa escura no topo
  ctx.fillStyle = "#2f4422";
  for (let i = 0; i < 10; i++) {
    const cx = ((i * 150 - scroll * 0.5) % (W + 200) + (W + 200)) % (W + 200) - 100;
    ctx.beginPath(); ctx.arc(cx, 25 + (i % 2) * 25, 95, 0, Math.PI * 2); ctx.fill();
  }

  // Chão: trilha de terra com manchas orgânicas, pedras e grama nas bordas
  ctx.fillStyle = "#556e3b";
  ctx.fillRect(0, H * 0.66, W, H * 0.34);
  ctx.fillStyle = "#9b7d52";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.69); ctx.lineTo(W, H * 0.67);
  ctx.lineTo(W, H * 0.94); ctx.lineTo(0, H * 0.96);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = "#7d623d";
  for (let i = 0; i < 7; i++) {
    const px = ((i * 230 - scroll) % (W + 280) + (W + 280)) % (W + 280) - 140;
    ctx.beginPath(); ctx.ellipse(px, H * 0.78 + (i % 2) * 45, 95, 18, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Pedras na trilha
  ctx.fillStyle = "#6c7064";
  for (let i = 0; i < 6; i++) {
    const rx = ((i * 270 - scroll) % (W + 270) + (W + 270)) % (W + 270) - 100;
    ctx.beginPath(); ctx.ellipse(rx, H * 0.74 + (i % 3) * 32, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawForegroundFoliage(scroll) {
  for (let i = 0; i < 5; i++) {
    const fx = ((i * 310 - scroll * 1.28) % (W + 360) + (W + 360)) % (W + 360) - 180;
    drawFern(ctx, fx, H * 0.98, 1.15, i % 2 ? 1 : -1);
  }
}

function drawDinosaur(x, y, t, scale = 1.05) {
  // Sombra de contato plana no chão
  ctx.fillStyle = "rgba(35, 28, 18, 0.28)";
  ctx.beginPath(); ctx.ellipse(x - 10, y + 150 * scale, 130 * scale, 22 * scale, 0, 0, Math.PI * 2); ctx.fill();

  stampWithCreamOutline((c) => {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    const runCycle = t * 11;
    const bob = Math.abs(Math.sin(runCycle)) * -14;
    c.translate(0, bob);
    c.lineJoin = "round"; c.lineCap = "round";

    // Perna traseira (fundo)
    const drawHindLeg = (phase, dark) => {
      const s = Math.sin(runCycle + phase);
      const kneeX = -10 + s * 45, kneeY = 68 + Math.cos(runCycle + phase) * 14;
      const ankleX = kneeX + 35 - s * 30, ankleY = 122;
      const footX = ankleX - 38, footY = 148 - Math.max(0, -s) * 26;
      c.fillStyle = dark ? "#963c20" : "#b84b29";
      c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-25, 10);
      c.quadraticCurveTo(kneeX - 35, kneeY, ankleX - 16, ankleY);
      c.lineTo(footX, footY);
      c.lineTo(footX + 55, footY);
      c.lineTo(ankleX + 18, ankleY - 6);
      c.quadraticCurveTo(kneeX + 35, kneeY - 10, 35, 22);
      c.closePath(); c.fill(); c.stroke();
      // Garras brancas dos pés
      c.fillStyle = "#f5ecd8";
      for (let g = 0; g < 3; g++) {
        c.beginPath();
        c.moveTo(footX + g * 14, footY);
        c.lineTo(footX - 14 + g * 14, footY + 6);
        c.lineTo(footX + 8 + g * 14, footY - 8);
        c.closePath(); c.fill(); c.stroke();
      }
    };
    drawHindLeg(Math.PI, true);

    // Corpo + Cauda + Pescoço
    c.fillStyle = "#b84b29"; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-95, -95); // nuca
    c.quadraticCurveTo(-45, -25, 45, -18); // costas
    c.quadraticCurveTo(165, -12, 245, -25); // cauda topo
    c.quadraticCurveTo(165, 35, 35, 46); // cauda base
    c.quadraticCurveTo(-45, 55, -88, -10); // barriga
    c.closePath(); c.fill(); c.stroke();

    // Papo e barriga creme (#f2dec4)
    c.fillStyle = "#f2dec4";
    c.beginPath();
    c.moveTo(-185, -72);
    c.quadraticCurveTo(-125, -68, -105, -52);
    c.quadraticCurveTo(-92, 10, -25, 44);
    c.quadraticCurveTo(-78, 42, -105, -8);
    c.quadraticCurveTo(-118, -48, -185, -56);
    c.closePath(); c.fill(); c.stroke();

    // Cabeça / focinho esculpido de raptor
    c.fillStyle = "#b84b29";
    c.beginPath();
    c.moveTo(-205, -92);
    c.quadraticCurveTo(-202, -128, -155, -135);
    c.quadraticCurveTo(-122, -154, -85, -142);
    c.quadraticCurveTo(-65, -110, -82, -72);
    c.quadraticCurveTo(-135, -70, -205, -72);
    c.closePath(); c.fill(); c.stroke();

    // Crista e listras amarelo-ocre (#d6a75a)
    c.fillStyle = "#d6a75a";
    c.beginPath();
    c.moveTo(-175, -128);
    c.lineTo(-125, -156); c.lineTo(-120, -144);
    c.lineTo(-98, -158); c.lineTo(-94, -144);
    c.lineTo(-76, -148);
    c.quadraticCurveTo(-68, -112, -74, -82);
    c.quadraticCurveTo(-88, -118, -125, -122);
    c.closePath(); c.fill(); c.stroke();
    // Listras nas costas
    for (let s = 0; s < 4; s++) {
      const sx = -45 + s * 42;
      c.beginPath();
      c.moveTo(sx, -24); c.lineTo(sx + 22, -21);
      c.lineTo(sx + 8, 12); c.closePath(); c.fill();
    }

    // Dentes brancos afiados
    c.fillStyle = "#ffffff"; c.strokeStyle = INK; c.lineWidth = 2;
    for (let d = 0; d < 7; d++) {
      const dx = -196 + d * 12;
      c.beginPath();
      c.moveTo(dx, -72); c.lineTo(dx + 6, -59); c.lineTo(dx + 12, -72);
      c.closePath(); c.fill(); c.stroke();
    }

    // Olho furioso
    c.fillStyle = "#ffffff"; c.strokeStyle = INK; c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-142, -120); c.lineTo(-114, -126); c.lineTo(-114, -108); c.lineTo(-142, -108);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#111";
    c.fillRect(-128, -121, 6, 12);

    // Perna dianteira (frente)
    drawHindLeg(0, false);

    // Bracinhos com garras
    const drawClawArm = (ox, oy) => {
      c.strokeStyle = INK; c.lineWidth = 3; c.fillStyle = "#b84b29";
      c.beginPath();
      c.moveTo(ox, oy); c.lineTo(ox - 28, oy + 26); c.lineTo(ox - 22, oy + 52);
      c.lineTo(ox - 8, oy + 48); c.lineTo(ox - 10, oy + 26); c.lineTo(ox + 14, oy + 8);
      c.closePath(); c.fill(); c.stroke();
    };
    drawClawArm(-92, -18);
    drawClawArm(-64, -10);
    c.restore();
  }, 5);
}

function drawCharacter(p, t, speaking, scale = 1.08) {
  const spec = DATA.characters[p.nome] || DATA.characters.beto;
  const x = (p.x ?? 0.5) * W;
  const baseY = H * 0.77;
  const acao = p.acao || "parado";
  const expr = p.expressao || "normal";
  const run = acao === "correr";
  const walk = acao === "andar";
  const freq = run ? 11 : walk ? 5.5 : 2.2;
  const phase = t * freq;
  const swing = (run ? 0.68 : walk ? 0.35 : 0) * Math.sin(phase);
  const bob = run ? Math.abs(Math.sin(phase)) * -20 : walk ? Math.abs(Math.sin(phase)) * -7 : 0;

  // Sombra de contato plana no chão
  ctx.fillStyle = "rgba(25, 22, 16, 0.26)";
  ctx.beginPath(); ctx.ellipse(x, baseY + 8, 56 * scale, 13 * scale, 0, 0, Math.PI * 2); ctx.fill();

  stampWithCreamOutline((c) => {
    c.save();
    c.translate(x, baseY + bob);
    c.scale((p.dir || 1) * scale, scale);
    c.lineJoin = "round"; c.lineCap = "round";

    const hipY = -185;
    const shoulderY = -318;
    const headY = -396;

    // 1. Mochila (para Caio nas costas)
    if (spec.backpack) {
      c.fillStyle = spec.backpack; c.strokeStyle = INK; c.lineWidth = 3;
      c.beginPath(); c.roundRect(14, shoulderY + 6, 72, 118, 22); c.fill(); c.stroke();
      c.fillStyle = "#687544";
      c.beginPath(); c.roundRect(42, shoulderY + 56, 38, 52, 10); c.fill(); c.stroke();
    }

    // 2. Braço de trás
    const drawArm = (side, isFront) => {
      let a = -side * swing * 0.95;
      let elbowBend = run ? -1.15 : walk ? -0.35 : 0.08 * side;
      if (acao === "assustado") { a = side * 0.85; elbowBend = -0.5; }
      if (acao === "acenar" && isFront) { a = 0.75; elbowBend = -1.8 + Math.sin(t * 10) * 0.25; }
      if (acao === "apontar" && isFront) { a = -0.95; elbowBend = -0.2; }

      const sx = run ? 0 : side * 52;
      const sy = shoulderY + 20;
      const uLen = 56, fLen = 54;
      const ex = sx + Math.sin(a) * uLen;
      const ey = sy + Math.cos(a) * uLen;
      const hx = ex + Math.sin(a + elbowBend) * fLen;
      const hy = ey + Math.cos(a + elbowBend) * fLen;

      if (spec.kind === "runner") {
        // Manga curta laranja + braço pele + cotovelo articulado
        c.strokeStyle = INK; c.lineWidth = 22; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        c.strokeStyle = spec.skin; c.lineWidth = 16; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        // Manga curta por cima do início do braço
        const mx = sx + Math.sin(a) * 28, my = sy + Math.cos(a) * 28;
        c.strokeStyle = INK; c.lineWidth = 30; c.beginPath(); c.moveTo(sx, sy); c.lineTo(mx, my); c.stroke();
        c.strokeStyle = spec.shirt; c.lineWidth = 24; c.beginPath(); c.moveTo(sx, sy); c.lineTo(mx, my); c.stroke();
        c.fillStyle = spec.skin; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath(); c.arc(ex, ey, 9.5, 0, Math.PI * 2); c.fill(); c.stroke();
      } else {
        // Manga comprida na cor da camisa com círculo de articulação no cotovelo e punho
        c.strokeStyle = INK; c.lineWidth = 28; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        c.strokeStyle = spec.shirt; c.lineWidth = 22; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
        c.fillStyle = spec.shirt; c.strokeStyle = INK; c.lineWidth = 2.2;
        c.beginPath(); c.arc(ex, ey, 11.5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      // Mão esférica preta
      c.fillStyle = "#080808"; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath(); c.arc(hx, hy, 15, 0, Math.PI * 2); c.fill(); c.stroke();
    };

    drawArm(-1, false);

    // 3. Pernas e Calças (compridas até o tornozelo para Beto/Léo, short creme para Nina, pretas para Caio)
    const drawLeg = (side) => {
      const a = side * swing;
      const hipX = run ? 0 : side * 20;
      const thighLen = 84, shinLen = 86;
      const kx = hipX + Math.sin(a) * thighLen;
      const ky = hipY + Math.cos(a) * thighLen;
      const kneeBend = run ? (a > 0 ? 0.85 : 0.25) : walk ? (a > 0 ? 0.25 : 0.05) : 0;
      const fx = kx + Math.sin(a + kneeBend) * shinLen;
      const fy = ky + Math.cos(a + kneeBend) * shinLen;

      if (spec.kind === "shirt" || spec.kind === "pullover") {
        // Calça comprida cinza-chumbo (#4b4b4b) até o tornozelo + canela preta curta
        const ankleX = kx + Math.sin(a + kneeBend) * (shinLen - 14);
        const ankleY = ky + Math.cos(a + kneeBend) * (shinLen - 14);
        c.strokeStyle = INK; c.lineWidth = 20;
        c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(ankleX, ankleY); c.lineTo(fx, fy); c.stroke();
        c.strokeStyle = "#080808"; c.lineWidth = 12;
        c.beginPath(); c.moveTo(ankleX, ankleY); c.lineTo(fx, fy); c.stroke();
        c.strokeStyle = spec.pants; c.lineWidth = 22;
        c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(kx, ky); c.lineTo(ankleX, ankleY); c.stroke();
        // Contorno fino interno da perna da calça
        c.strokeStyle = INK; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(hipX - 9, hipY + 10); c.lineTo(ankleX - 7, ankleY); c.stroke();
        c.beginPath(); c.moveTo(hipX + 9, hipY + 10); c.lineTo(ankleX + 7, ankleY); c.stroke();
      } else {
        // Pernas pretas finas (Nina / Caio)
        c.strokeStyle = "#080808"; c.lineWidth = 17;
        c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
      }

      // Sapato / Tênis
      c.save();
      c.translate(fx, fy);
      if (run) c.rotate(a * 0.45);
      if (spec.kind === "runner") {
        // Tênis creme detalhado com cadarços
        c.fillStyle = spec.shoes; c.strokeStyle = INK; c.lineWidth = 2.8;
        c.beginPath();
        c.moveTo(-14, -12); c.lineTo(8, -12); c.lineTo(28, 4); c.lineTo(26, 14); c.lineTo(-18, 14);
        c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(-18, 9); c.lineTo(26, 9); c.stroke();
      } else {
        const dirShoe = run ? -1 : side;
        c.fillStyle = spec.shoes; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath();
        c.roundRect(dirShoe < 0 ? -30 : -10, -4, 40, 16, [8, 8, 3, 3]);
        c.fill(); c.stroke();
      }
      c.restore();
    };
    drawLeg(-1);
    drawLeg(1);

    // 4. Quadril da calça / Short (Nina, Beto, Léo)
    if (spec.kind === "shorts") {
      c.fillStyle = spec.pants; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-42, hipY - 12); c.lineTo(42, hipY - 12);
      c.lineTo(46, hipY + 34); c.lineTo(4, hipY + 34); c.lineTo(0, hipY + 14);
      c.lineTo(-4, hipY + 34); c.lineTo(-46, hipY + 34);
      c.closePath(); c.fill(); c.stroke();
    } else if (spec.kind === "shirt" || spec.kind === "pullover") {
      c.fillStyle = spec.pants; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(-41, hipY - 14, 82, 34, 8);
      c.fill(); c.stroke();
      // Bolsos frontais curvos da calça (idênticos ao Beto/Léo)
      c.beginPath(); c.arc(-32, hipY - 6, 12, 0.1, 1.4); c.stroke();
      c.beginPath(); c.arc(32, hipY - 6, 12, 1.7, 3.0); c.stroke();
    }

    // 5. Tronco / Camisa
    c.fillStyle = spec.shirt; c.strokeStyle = INK; c.lineWidth = 2.8;
    c.beginPath();
    c.roundRect(-45, shoulderY, 90, 126, [24, 24, 8, 8]);
    c.fill(); c.stroke();

    if (spec.kind === "shirt" || spec.kind === "pullover") {
      // Gola social dobrada (Beto e Léo)
      c.fillStyle = spec.shirt; c.strokeStyle = INK; c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(0, shoulderY + 24); c.lineTo(-18, shoulderY + 34); c.lineTo(-26, shoulderY + 4); c.lineTo(0, shoulderY + 8);
      c.closePath(); c.fill(); c.stroke();
      c.beginPath();
      c.moveTo(0, shoulderY + 24); c.lineTo(18, shoulderY + 34); c.lineTo(26, shoulderY + 4); c.lineTo(0, shoulderY + 8);
      c.closePath(); c.fill(); c.stroke();
    }
    if (spec.kind === "shirt") {
      // Linha vertical de botões e bolso no peito (Beto)
      c.strokeStyle = "#8a6726"; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(0, shoulderY + 24); c.lineTo(0, hipY - 12); c.stroke();
      c.fillStyle = "#c29645";
      c.fillRect(12, shoulderY + 42, 22, 24);
      c.fillStyle = spec.pocket;
      c.fillRect(12, shoulderY + 42, 22, 7);
    }
    if (spec.backpack) {
      // Alças verdes da mochila do Caio passando pelos ombros
      c.strokeStyle = INK; c.lineWidth = 16;
      c.beginPath(); c.moveTo(-36, shoulderY + 6); c.quadraticCurveTo(-34, shoulderY + 62, -26, shoulderY + 100); c.stroke();
      c.strokeStyle = spec.backpack; c.lineWidth = 11;
      c.beginPath(); c.moveTo(-36, shoulderY + 6); c.quadraticCurveTo(-34, shoulderY + 62, -26, shoulderY + 100); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 16;
      c.beginPath(); c.moveTo(16, shoulderY + 6); c.quadraticCurveTo(22, shoulderY + 60, 42, shoulderY + 92); c.stroke();
      c.strokeStyle = spec.backpack; c.lineWidth = 11;
      c.beginPath(); c.moveTo(16, shoulderY + 6); c.quadraticCurveTo(22, shoulderY + 60, 42, shoulderY + 92); c.stroke();
    }

    // 6. Cabeça circular preta + cabelo/coques/óculos/expressão
    if (spec.hair === "buns") {
      // Coques da Nina com elástico creme
      for (const side of [-1, 1]) {
        const bx = side * 48, by = headY - 46;
        c.fillStyle = "#080808"; c.strokeStyle = INK; c.lineWidth = 2.5;
        c.beginPath(); c.arc(bx, by, 21, 0, Math.PI * 2); c.fill(); c.stroke();
        c.strokeStyle = CREAM; c.lineWidth = 6;
        c.beginPath(); c.moveTo(bx - side * 14, by + 12); c.lineTo(bx + side * 6, by + 22); c.stroke();
      }
    }

    c.fillStyle = "#070708"; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(0, headY, 58, 0, Math.PI * 2); c.fill(); c.stroke();

    if (spec.hair === "tuft") {
      c.fillStyle = "#070708";
      c.beginPath();
      c.arc(-8, headY - 58, 12, 0, Math.PI * 2);
      c.arc(7, headY - 56, 10, 0, Math.PI * 2);
      c.fill();
    }
    if (spec.hair === "quiff") {
      // Topete loiro do Léo (idêntico à ficha)
      c.fillStyle = "#f5e2c0"; c.strokeStyle = "#c9b18a"; c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(-36, headY - 42);
      c.quadraticCurveTo(-18, headY - 82, 14, headY - 86);
      c.quadraticCurveTo(24, headY - 96, 28, headY - 76);
      c.quadraticCurveTo(42, headY - 88, 38, headY - 58);
      c.quadraticCurveTo(18, headY - 38, -36, headY - 42);
      c.closePath(); c.fill(); c.stroke();
    }

    // Olhos e Óculos
    if (spec.glasses) {
      // Óculos retangulares creme do Beto
      c.strokeStyle = CREAM; c.lineWidth = 4.2;
      c.beginPath(); c.roundRect(-41, headY - 17, 34, 22, 4); c.stroke();
      c.beginPath(); c.roundRect(7, headY - 17, 34, 22, 4); c.stroke();
      c.beginPath(); c.moveTo(-7, headY - 7); c.lineTo(7, headY - 7); c.stroke();
      c.beginPath(); c.moveTo(-58, headY - 10); c.lineTo(-41, headY - 9); c.stroke();
      c.beginPath(); c.moveTo(41, headY - 9); c.lineTo(58, headY - 10); c.stroke();
      c.fillStyle = CREAM;
      c.beginPath(); c.roundRect(-27, headY - 12, 6, 12, 2); c.fill();
      c.beginPath(); c.roundRect(21, headY - 12, 6, 12, 2); c.fill();
    } else if (spec.sleepy && expr !== "assustado") {
      // Olhos relaxados + sobrancelhas creme do Léo
      c.fillStyle = "#f5e2c0";
      c.save(); c.translate(-22, headY - 18); c.rotate(-0.08); c.fillRect(-10, -3, 20, 6); c.restore();
      c.save(); c.translate(22, headY - 18); c.rotate(0.08); c.fillRect(-10, -3, 20, 6); c.restore();
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(-22, headY - 4, 8, 0, Math.PI); c.fill();
      c.beginPath(); c.arc(22, headY - 4, 8, 0, Math.PI); c.fill();
      c.strokeStyle = "#555"; c.lineWidth = 2;
      c.beginPath(); c.arc(-22, headY + 2, 7, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(22, headY + 2, 7, 0.2, Math.PI - 0.2); c.stroke();
    } else {
      // Olhos brancos retangulares arredondados (Nina / Caio)
      const eyeH = expr === "assustado" ? 24 : 18;
      const eyeW = expr === "assustado" ? 13 : 9;
      c.fillStyle = "#f7f3e8";
      c.beginPath(); c.roundRect(-22 - eyeW / 2, headY - eyeH / 2 - 4, eyeW, eyeH, 4.5); c.fill();
      c.beginPath(); c.roundRect(22 - eyeW / 2, headY - eyeH / 2 - 4, eyeW, eyeH, 4.5); c.fill();
      if (expr === "assustado" || expr === "suando") {
        c.strokeStyle = "#f7f3e8"; c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(-30, headY - 22); c.quadraticCurveTo(-20, headY - 28, -12, headY - 24); c.stroke();
        c.beginPath(); c.moveTo(12, headY - 24); c.quadraticCurveTo(20, headY - 28, 30, headY - 22); c.stroke();
      }
    }

    // Boca
    const mouthOpen = speaking ? 4 + Math.abs(Math.sin(t * 18)) * 8 : expr === "assustado" ? 9 : 0;
    if (mouthOpen > 3) {
      c.fillStyle = "#f7f3e8";
      c.beginPath(); c.roundRect(-14, headY + 18, 28, mouthOpen + 4, 6); c.fill();
      if (expr === "assustado") {
        c.strokeStyle = "#222"; c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(-5, headY + 18); c.lineTo(-5, headY + 22 + mouthOpen); c.stroke();
        c.beginPath(); c.moveTo(5, headY + 18); c.lineTo(5, headY + 22 + mouthOpen); c.stroke();
      }
    } else {
      c.strokeStyle = "#f7f3e8"; c.lineWidth = 3.2;
      c.beginPath(); c.arc(0, headY + 14, 15, 0.25, Math.PI - 0.25); c.stroke();
    }

    // Gota de suor azul quando assustado/suando
    if (expr === "assustado" || expr === "suando") {
      c.fillStyle = "#77c8eb";
      c.beginPath();
      c.moveTo(38, headY - 34);
      c.quadraticCurveTo(46, headY - 18, 38, headY - 14);
      c.quadraticCurveTo(30, headY - 18, 38, headY - 34);
      c.fill();
    }

    // 7. Braço da frente
    drawArm(1, true);
    c.restore();
  }, 5);
}

function drawStyleOverlay(style, scene, t, w) {
  if (!style || style === "2d-palito") return
  if (style === "b1") {
    // Papel claro minimalista + marca-texto amarelo na palavra ativa
    ctx.fillStyle = "rgba(250, 246, 237, 0.22)";
    ctx.fillRect(0, 0, W, H);
  } else if (style === "b3") {
    // TV retrô CRT: scanlines + vinheta + selo 03:14 AM
    ctx.fillStyle = "rgba(10, 18, 28, 0.28)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 3);
    ctx.strokeStyle = "rgba(120, 230, 255, 0.35)"; ctx.lineWidth = 14;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.fillStyle = "#8ff3ff"; ctx.font = "700 32px monospace"; ctx.textAlign = "left";
    ctx.fillText("REC ● 03:14 AM", 54, 78);
  } else if (style === "b4") {
    // Suspense de sobrevivência: vinheta escura dramática + holofote
    const g = ctx.createRadialGradient(W * 0.5, H * 0.52, 120, W * 0.5, H * 0.52, W * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(6,8,14,0.72)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (style === "b5") {
    // Explicação com personagem: cartão lateral explicativo
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "#2457c6"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(W * 0.52, H * 0.16, W * 0.42, H * 0.28, 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#17233c"; ctx.font = "800 34px Inter, sans-serif"; ctx.textAlign = "left";
    const desc = (scene.descricaoVisual || DATA.storyboard.titulo || "").slice(0, 56);
    ctx.fillText(desc.slice(0, 26), W * 0.55, H * 0.23);
    if (desc.length > 26) ctx.fillText(desc.slice(26, 54), W * 0.55, H * 0.28);
  } else if (style === "b6") {
    // Meme dinâmico: linhas de velocidade nas bordas
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.sin(t * 8) * 0.08;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * 420, H / 2 + Math.sin(a) * 580);
      ctx.lineTo(W / 2 + Math.cos(a) * 760, H / 2 + Math.sin(a) * 980);
      ctx.stroke();
    }
  } else if (style === "b7") {
    // Teatro Pixel: grade sutil + borda arcade
    ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, W - 40, H - 40);
  } else if (style === "b8") {
    // Mitologia Grega: moldura dourada + tom papiro
    ctx.fillStyle = "rgba(218, 180, 108, 0.14)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#d4a24c"; ctx.lineWidth = 12;
    ctx.strokeRect(28, 28, W - 56, H - 56);
  }
}

function drawCaption(style, word) {
  if (!word?.palavra) return;
  ctx.save();
  const text = word.palavra.toUpperCase();
  const y = H * 0.86;
  ctx.font = style === "b3" || style === "b7"
    ? "800 58px monospace"
    : "900 66px Inter, 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (style === "b1" || style === "b5") {
    const m = ctx.measureText(text).width + 44;
    ctx.fillStyle = style === "b1" ? "#ffe066" : "#2457c6";
    ctx.beginPath(); ctx.roundRect(W / 2 - m / 2, y - 42, m, 84, 16); ctx.fill();
    ctx.fillStyle = style === "b1" ? "#141414" : "#ffffff";
    ctx.fillText(text, W / 2, y);
  } else {
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(10, 14, 20, 0.9)";
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = style === "b8" ? "#ffd875" : style === "b3" ? "#8ff3ff" : "#ffe38e";
    ctx.fillText(text, W / 2, y);
  }
  ctx.restore();
}

function renderFrame(t) {
  const scene = activeScene(t);
  const style = DATA.storyboard.estilo || "2d-palito";
  const running = (scene.personagens || []).some(p => p.acao === "correr" || p.acao === "andar");
  const scroll = running ? t * 240 : t * 18;
  const cenario = scene.cenario || DATA.storyboard.ambiente?.cenario || (style === "b3" || style === "b4" ? "noite" : "floresta");
  drawBackground(cenario, t, scroll);

  const w = activeWord(t);
  const chars = scene.personagens?.length ? scene.personagens : [{ nome: "caio", acao: "correr", expressao: "assustado", x: 0.34, dir: -1 }];
  for (const ch of chars) {
    drawCharacter(ch, t, Boolean(w), scene.camera === "close" ? 1.35 : scene.camera === "aberto" ? 0.92 : 1.08);
  }
  if ((scene.props || []).includes("dinossauro")) {
    drawDinosaur(W * 0.78, H * 0.65, t, 1.05);
  }
  if (cenario === "floresta" || cenario === "noite") {
    drawForegroundFoliage(scroll);
  }
  drawStyleOverlay(style, scene, t, w);
  drawCaption(style, w);
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
    await fs.rm(stage, { recursive: true, force: true }).catch(() => { })
  }
}
