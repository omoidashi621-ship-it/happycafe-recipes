// 世界樹の図書館のマップ。座標は全てワールド座標(px)。
// 背景は高解像度で一度だけ描いておき、世界樹だけ別スプライトにして人物と前後を並べ替える。
import { rng, strand, makeLayer, glowSprite, shade } from './gfx.js';

export const WORLD = { w: 1600, h: 1200 };
export const SPAWN = { x: 800, y: 1030 };
export const BOUNDS = { x0: 150, x1: 1450, y0: 200, y1: 1140 };
export const TREE = { x: 800, y: 620, rx: 150, ry: 62 };
export const TABLES = [
  { x: 250, y: 780, w: 170, h: 84 }, { x: 1180, y: 780, w: 170, h: 84 },
  { x: 250, y: 430, w: 170, h: 84 }, { x: 1180, y: 430, w: 170, h: 84 },
];
export const PLANTS = [{ x: 590, y: 1085, r: 26 }, { x: 1010, y: 1085, r: 26 }];
// ミニゲームへの入口(今は準備中の魔法陣)
export const PORTALS = [{ id: 'minigame-1', x: 1330, y: 1040, r: 54, label: 'ミニゲーム(準備中)' }];

const TAU = Math.PI * 2;
const PILLAR_W = 40, ALCOVES = 8, WALL_H = 185;
const ALCOVE_W = (WORLD.w - PILLAR_W * (ALCOVES + 1)) / ALCOVES;
const LANTERNS = Array.from({ length: 7 }, (_, k) => ({ x: PILLAR_W / 2 + (k + 1) * (ALCOVE_W + PILLAR_W), y: 130 }));

export function collides(x, y, r = 14) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || y < BOUNDS.y0 || y > BOUNDS.y1) return true;
  const ex = (x - TREE.x) / (TREE.rx + r), ey = (y - TREE.y) / (TREE.ry + r);
  if (ex * ex + ey * ey < 1) return true;
  if (TABLES.some((t) => x > t.x - r && x < t.x + t.w + r && y > t.y - r && y < t.y + t.h + r)) return true;
  return PLANTS.some((p) => Math.hypot(x - p.x, y - p.y) < p.r + r);
}

const vgrad = (g, y0, y1, stops) => {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
};
const hgrad = (g, x0, x1, stops) => {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** ワールド座標の矩形 (wx,wy,ww,wh) に置いた画像を、見えている範囲(view)だけ描く */
export function drawLayer(g, img, wx, wy, ww, wh, view) {
  const x0 = Math.max(wx, view.x0), y0 = Math.max(wy, view.y0);
  const x1 = Math.min(wx + ww, view.x1), y1 = Math.min(wy + wh, view.y1);
  if (x1 <= x0 || y1 <= y0) return;
  const kx = img.width / ww, ky = img.height / wh;
  g.drawImage(img, (x0 - wx) * kx, (y0 - wy) * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0);
}

// ---------- 背景 ----------
/** S: 解像度の倍率。戻り値は { bg, scale, sprites } */
export function buildScene(S) {
  const { canvas, g } = makeLayer(WORLD.w, WORLD.h, S);
  drawFloor(g);
  drawFloorLight(g);
  drawCarpet(g);
  drawRuneCircle(g);
  drawRoots(g);
  drawTopWall(g);
  drawSideWalls(g);
  drawBottomWall(g);
  for (const t of TABLES) drawTable(g, t);
  for (const p of PLANTS) drawPlant(g, p);
  for (const p of PORTALS) drawPortalBase(g, p);
  for (const l of LANTERNS) drawLantern(g, l);
  return { bg: canvas, scale: S, sprites: [renderTrunk(S)] };
}

function drawFloor(g) {
  const r = rng(11);
  g.fillStyle = '#2b1f15'; g.fillRect(0, 0, WORLD.w, WORLD.h);
  const ph = 44;
  for (let y = 0, row = 0; y < WORLD.h; y += ph, row++) {
    let x = -((row * 83) % 180);
    while (x < WORLD.w) {
      const len = 150 + Math.floor(r() * 130), l = 27 + r() * 8, h = 27 + r() * 5;
      g.fillStyle = vgrad(g, y, y + ph, [[0, `hsl(${h} 42% ${l + 3}%)`], [1, `hsl(${h} 42% ${l - 3}%)`]]);
      g.fillRect(x + 1, y + 1, len - 2, ph - 2);
      g.fillStyle = 'rgba(255,230,190,.06)'; g.fillRect(x + 1, y + 1, len - 2, 3);
      g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const yy = y + 9 + k * 12 + r() * 4;
        g.beginPath(); g.moveTo(x + 6, yy);
        g.bezierCurveTo(x + len * 0.3, yy + r() * 4 - 2, x + len * 0.6, yy + r() * 4 - 2, x + len - 6, yy + r() * 3);
        g.stroke();
      }
      x += len;
    }
  }
}

function drawFloorLight(g) {
  const cx = TREE.x, cy = TREE.y + 60;
  const glow = g.createRadialGradient(cx, cy, 40, cx, cy, 820);
  glow.addColorStop(0, 'rgba(160,255,200,.2)');
  glow.addColorStop(0.35, 'rgba(110,210,150,.07)');
  glow.addColorStop(1, 'rgba(0,10,8,.52)');
  g.fillStyle = glow; g.fillRect(0, 0, WORLD.w, WORLD.h);
}

function drawCarpet(g) {
  const x0 = 738, w = 124, y0 = 690, y1 = WORLD.h - 36;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x0 + 5, y0 + 5, w, y1 - y0);
  g.fillStyle = hgrad(g, x0, x0 + w, [[0, '#561c2a'], [0.5, '#7d2c3f'], [1, '#561c2a']]);
  g.fillRect(x0, y0, w, y1 - y0);
  g.strokeStyle = '#d9b45a'; g.lineWidth = 3; g.strokeRect(x0 + 7, y0 + 7, w - 14, y1 - y0 - 14);
  g.strokeStyle = 'rgba(217,180,90,.55)'; g.lineWidth = 1.2; g.strokeRect(x0 + 14, y0 + 14, w - 28, y1 - y0 - 28);
  for (let y = y0 + 52; y < y1 - 30; y += 78) {
    const cx = x0 + w / 2;
    g.beginPath(); g.moveTo(cx, y - 24); g.lineTo(cx + 22, y); g.lineTo(cx, y + 24); g.lineTo(cx - 22, y); g.closePath();
    g.fillStyle = 'rgba(217,180,90,.25)'; g.fill(); g.strokeStyle = 'rgba(217,180,90,.85)'; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.arc(cx, y, 4, 0, TAU); g.fillStyle = '#d9b45a'; g.fill();
  }
}

function drawRuneCircle(g) {
  g.save();
  g.translate(TREE.x, TREE.y + 20); g.scale(1, 0.4);
  const gr = g.createRadialGradient(0, 0, 100, 0, 0, 340);
  gr.addColorStop(0, 'rgba(232,200,114,0)'); gr.addColorStop(1, 'rgba(232,200,114,.16)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 340, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(240,210,130,.62)'; g.lineWidth = 4;
  for (const rad of [340, 304]) { g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke(); }
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 250, 0, TAU); g.stroke();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU, r0 = 306, r1 = i % 6 === 0 ? 336 : 322;
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.26;
    g.save(); g.translate(Math.cos(a) * 277, Math.sin(a) * 277); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(0, -14); g.lineTo(9, 10); g.lineTo(-9, 10); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 8); g.stroke();
    g.restore();
  }
  g.restore();
}

function drawRoots(g) {
  const cx = TREE.x, cy = TREE.y + 14;
  // 幹の根元に落ちる影
  const sh = g.createRadialGradient(cx, cy + 30, 60, cx, cy + 30, 260);
  sh.addColorStop(0, 'rgba(0,0,0,.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.beginPath(); g.ellipse(cx, cy + 30, 260, 110, 0, 0, TAU); g.fill();

  // [始点, 制御点, 終点, 根元の太さ, 先の太さ]  (中心からの相対座標、左右対称に描く)
  const roots = [
    [[100, 20], [270, -50], [480, 30], 56, 9],
    [[90, 50], [250, 80], [350, 235], 50, 9],
    [[60, 62], [170, 120], [195, 285], 42, 8],
    [[80, -20], [250, -110], [410, -80], 40, 8],
    [[110, 36], [240, 40], [410, 150], 32, 7],
  ];
  const lit = vgrad(g, cy - 110, cy + 300, [[0, '#7a5330'], [0.45, '#4d321b'], [1, '#22140a']]);
  for (const [a, b, c, w0, w1] of roots) {
    for (const s of [-1, 1]) {
      const P = (p) => [cx + s * p[0], cy + p[1]];
      strand(g, P(a), P(b), P(c), w0, w1);
      g.fillStyle = lit; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1b1008'; g.lineJoin = 'round'; g.stroke();
      // 上面のつや
      g.save(); strand(g, P(a), P(b), P(c), w0, w1); g.clip();
      g.strokeStyle = 'rgba(255,225,170,.22)'; g.lineWidth = w0 * 0.22; g.lineCap = 'round';
      g.beginPath(); g.moveTo(...P([a[0], a[1] - w0 * 0.25])); g.quadraticCurveTo(...P([b[0], b[1] - w0 * 0.3]), ...P([c[0] * 0.92, c[1] - w1 * 0.3])); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = w0 * 0.3;
      g.beginPath(); g.moveTo(...P([a[0], a[1] + w0 * 0.3])); g.quadraticCurveTo(...P([b[0], b[1] + w0 * 0.35]), ...P([c[0] * 0.92, c[1] + w1 * 0.3])); g.stroke();
      g.restore();
      // 根の先に宿る淡い光
      const e = P(c), gr = g.createRadialGradient(e[0], e[1], 0, e[0], e[1], 26);
      gr.addColorStop(0, 'rgba(150,255,200,.5)'); gr.addColorStop(1, 'rgba(150,255,200,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(e[0], e[1], 26, 0, TAU); g.fill();
    }
  }
  const r = rng(5);
  for (let i = 0; i < 46; i++) {
    const x = cx + (r() - 0.5) * 800, y = cy + (r() - 0.25) * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, 16);
    gr.addColorStop(0, 'rgba(110,200,120,.45)'); gr.addColorStop(1, 'rgba(110,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 16, 7, 0, 0, TAU); g.fill();
  }
}

// ---------- 壁 ----------
function drawBooks(g, x, y, w, h, seed, vertical = false) {
  const r = rng(seed);
  const cols = ['#b5453f', '#3f6fb5', '#3f9a62', '#d8a23a', '#8a5ab5', '#e9e0c8', '#2f7f8f', '#a8602e'];
  g.fillStyle = '#0a110d'; g.fillRect(x, y, w, h);
  const rowH = vertical ? 30 : 34;
  for (let yy = y; yy < y + h; yy += rowH) {
    let xx = x + 3;
    while (xx < x + w - 6) {
      const bw = 6 + r() * 6, bh = (rowH - 8) * (0.72 + r() * 0.28);
      const c = cols[Math.floor(r() * cols.length)];
      if (r() < 0.07) { xx += bw; continue; }
      g.fillStyle = hgrad(g, xx, xx + bw, [[0, shade(c, 0.18)], [0.5, c], [1, shade(c, -0.3)]]);
      g.fillRect(xx, yy + rowH - 5 - bh, bw, bh);
      g.fillStyle = 'rgba(232,200,114,.7)'; g.fillRect(xx, yy + rowH - 5 - bh * 0.7, bw, 1.2);
      xx += bw + 0.6;
    }
    g.fillStyle = vgrad(g, yy + rowH - 6, yy + rowH, [[0, '#6b4a2c'], [1, '#2a1a0c']]);
    g.fillRect(x, yy + rowH - 6, w, 6);
  }
}
function drawTopWall(g) {
  g.fillStyle = vgrad(g, 0, WALL_H, [[0, '#0b1511'], [1, '#1b2b22']]);
  g.fillRect(0, 0, WORLD.w, WALL_H);
  for (let k = 0; k < ALCOVES; k++) {
    const x = PILLAR_W + k * (ALCOVE_W + PILLAR_W), top = 58, bottom = WALL_H - 14, rad = ALCOVE_W / 2;
    const arch = () => {
      g.beginPath(); g.moveTo(x, bottom); g.lineTo(x, top);
      g.arc(x + rad, top, rad, Math.PI, 0); g.lineTo(x + ALCOVE_W, bottom); g.closePath();
    };
    g.save(); arch(); g.clip();
    drawBooks(g, x, 0, ALCOVE_W, WALL_H, 100 + k);
    const glow = g.createRadialGradient(x + rad, top + 30, 8, x + rad, top + 30, 140);
    glow.addColorStop(0, 'rgba(255,214,140,.28)'); glow.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = glow; g.fillRect(x, 0, ALCOVE_W, WALL_H);
    g.restore();
    arch(); g.lineWidth = 6; g.strokeStyle = '#5a3d22'; g.stroke();
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,225,170,.45)'; g.stroke();
    g.beginPath(); g.arc(x + rad, top - rad - 10, 5, 0, TAU);
    g.fillStyle = 'rgba(143,227,255,.9)'; g.fill();
  }
  for (let k = 0; k <= ALCOVES; k++) {
    const x = k * (ALCOVE_W + PILLAR_W);
    g.fillStyle = hgrad(g, x, x + PILLAR_W, [[0, '#2e3f35'], [0.5, '#16231b'], [1, '#2e3f35']]);
    g.fillRect(x, 0, PILLAR_W, WALL_H);
    g.fillStyle = '#3c5245'; g.fillRect(x - 3, 0, PILLAR_W + 6, 14); g.fillRect(x - 3, WALL_H - 22, PILLAR_W + 6, 10);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1.4;
    for (const o of [10, 20, 30]) { g.beginPath(); g.moveTo(x + o, 16); g.lineTo(x + o, WALL_H - 24); g.stroke(); }
  }
  g.fillStyle = vgrad(g, WALL_H - 14, WALL_H + 4, [[0, '#4a5a50'], [1, '#222d27']]);
  g.fillRect(0, WALL_H - 14, WORLD.w, 18);
  g.fillStyle = vgrad(g, WALL_H + 4, WALL_H + 56, [[0, 'rgba(0,0,0,.5)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, WALL_H + 4, WORLD.w, 52);
}

function drawSideWalls(g) {
  for (const s of [0, 1]) {
    const x = s ? WORLD.w - 140 : 0;
    g.save(); g.beginPath(); g.rect(x, WALL_H, 140, WORLD.h - WALL_H - 50); g.clip();
    drawBooks(g, x + 8, WALL_H, 124, WORLD.h - WALL_H, 300 + s, true);
    g.restore();
    g.fillStyle = hgrad(g, x, x + 140, s ? [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.55)']] : [[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x, WALL_H, 140, WORLD.h - WALL_H - 50);
    for (let y = WALL_H; y < WORLD.h - 50; y += 190) {
      g.fillStyle = hgrad(g, x, x + 140, [[0, '#33473b'], [0.5, '#1c2a22'], [1, '#33473b']]);
      g.fillRect(x, y, 140, 16);
    }
    const ex = s ? x - 56 : x + 140;
    g.fillStyle = hgrad(g, ex, ex + 56, s ? [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.45)']] : [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(ex, WALL_H, 56, WORLD.h - WALL_H - 50);
  }
}

function drawBottomWall(g) {
  const y = WORLD.h - 50;
  g.fillStyle = vgrad(g, y, WORLD.h, [[0, '#2a3a31'], [1, '#101a15']]); g.fillRect(0, y, WORLD.w, 50);
  g.fillStyle = vgrad(g, y - 40, y, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]); g.fillRect(0, y - 40, WORLD.w, 40);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (let x = 0; x < WORLD.w; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, WORLD.h); g.stroke(); }
  // 出入口(外の光がさしこむアーチ)
  const spill = g.createLinearGradient(0, y, 0, y - 150);
  spill.addColorStop(0, 'rgba(200,235,255,.28)'); spill.addColorStop(1, 'rgba(200,235,255,0)');
  g.fillStyle = spill; g.beginPath(); g.moveTo(742, y); g.lineTo(858, y); g.lineTo(930, y - 150); g.lineTo(670, y - 150); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(738, WORLD.h); g.lineTo(738, y + 24); g.quadraticCurveTo(738, y - 2, 800, y - 2); g.quadraticCurveTo(862, y - 2, 862, y + 24); g.lineTo(862, WORLD.h); g.closePath();
  g.fillStyle = vgrad(g, y - 2, WORLD.h, [[0, '#f2fbff'], [1, '#8fb4d4']]); g.fill();
  g.lineWidth = 7; g.strokeStyle = '#16221c'; g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(217,180,90,.8)'; g.stroke();
}

// ---------- 家具・小物 ----------
function drawTable(g, t) {
  const cx = t.x + t.w / 2;
  g.fillStyle = 'rgba(0,0,0,.34)'; g.beginPath(); g.ellipse(cx, t.y + t.h + 2, t.w / 2 + 12, 15, 0, 0, TAU); g.fill();
  g.fillStyle = '#2d1b0f';
  g.fillRect(t.x + 8, t.y + t.h - 26, 13, 30); g.fillRect(t.x + t.w - 21, t.y + t.h - 26, 13, 30);
  roundRect(g, t.x, t.y + t.h - 34, t.w, 24, 5);
  g.fillStyle = vgrad(g, t.y + t.h - 34, t.y + t.h - 10, [[0, '#6b4526'], [1, '#3e2915']]); g.fill();
  roundRect(g, t.x - 5, t.y, t.w + 10, t.h - 30, 9);
  g.fillStyle = vgrad(g, t.y, t.y + t.h - 30, [[0, '#a87a48'], [1, '#7d5632']]); g.fill();
  g.lineWidth = 1.6; g.strokeStyle = '#3e2915'; g.stroke();
  g.fillStyle = 'rgba(255,235,200,.25)'; g.fillRect(t.x + 4, t.y + 3, t.w - 8, 3);
  g.fillStyle = '#2f6b52'; g.fillRect(cx - 26, t.y + 2, 52, t.h - 34);
  g.fillStyle = 'rgba(217,180,90,.8)'; g.fillRect(cx - 26, t.y + 2, 52, 2); g.fillRect(cx - 26, t.y + t.h - 34, 52, 2);
  // 開いた本
  g.save(); g.translate(cx - 10, t.y + 26); g.rotate(-0.1);
  g.beginPath(); g.moveTo(-18, -8); g.quadraticCurveTo(-9, -12, 0, -8); g.lineTo(0, 10); g.quadraticCurveTo(-9, 6, -18, 10); g.closePath();
  g.fillStyle = '#f6efd6'; g.fill(); g.strokeStyle = '#8a7a5a'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(9, -12, 18, -8); g.lineTo(18, 10); g.quadraticCurveTo(9, 6, 0, 10); g.closePath();
  g.fillStyle = '#efe6c8'; g.fill(); g.stroke();
  g.strokeStyle = 'rgba(90,70,40,.5)';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-15, -4 + i * 3.4); g.lineTo(-3, -4 + i * 3.4); g.moveTo(3, -4 + i * 3.4); g.lineTo(15, -4 + i * 3.4); g.stroke(); }
  g.restore();
  // ろうそく
  g.fillStyle = '#f3ead0'; g.fillRect(cx + 30, t.y + 10, 7, 20);
  g.fillStyle = '#3a2a1a'; g.fillRect(cx + 28, t.y + 29, 11, 3);
  g.fillStyle = '#ffd36a'; g.beginPath(); g.ellipse(cx + 33.5, t.y + 6, 3, 6, 0, 0, TAU); g.fill();
}

function drawPlant(g, p) {
  g.fillStyle = 'rgba(0,0,0,.34)'; g.beginPath(); g.ellipse(p.x, p.y + 6, 34, 11, 0, 0, TAU); g.fill();
  const r = rng(p.x);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.34 + (r() - 0.5) * 0.2, len = 44 + r() * 26;
    g.save(); g.translate(p.x, p.y - 22); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14, -len * 0.5, 0, -len); g.quadraticCurveTo(-14, -len * 0.5, 0, 0);
    g.fillStyle = vgrad(g, -len, 0, [[0, '#8fe3b0'], [1, '#1f6b46']]); g.fill();
    g.strokeStyle = '#14402b'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }
  for (const [dx, dy, c] of [[-14, -66, '#8fe3ff'], [10, -76, '#ffb0d8'], [20, -52, '#8fe3ff']]) {
    const gr = g.createRadialGradient(p.x + dx, p.y + dy, 0, p.x + dx, p.y + dy, 11);
    gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(p.x + dx, p.y + dy, 11, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x + dx, p.y + dy, 2.6, 0, TAU); g.fill();
  }
  g.beginPath(); g.moveTo(p.x - 24, p.y - 28); g.lineTo(p.x + 24, p.y - 28); g.lineTo(p.x + 18, p.y + 4); g.quadraticCurveTo(p.x, p.y + 10, p.x - 18, p.y + 4); g.closePath();
  g.fillStyle = hgrad(g, p.x - 24, p.x + 24, [[0, '#5a7a8a'], [0.4, '#8fb0c0'], [1, '#3e5666']]); g.fill();
  g.lineWidth = 1.6; g.strokeStyle = '#27404e'; g.stroke();
  g.fillStyle = '#d9b45a'; g.fillRect(p.x - 25, p.y - 31, 50, 5);
}

function drawPortalBase(g, p) {
  g.save(); g.translate(p.x, p.y); g.scale(1, 0.62);
  g.fillStyle = 'rgba(30,60,90,.55)'; g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(143,227,255,.95)'; g.lineWidth = 3.2;
  g.beginPath(); g.arc(0, 0, p.r, 0, TAU); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, p.r * 0.72, 0, TAU); g.stroke();
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + k * Math.PI / 3 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * p.r * 0.72, Math.sin(a) * p.r * 0.72);
    }
    g.closePath(); g.stroke();
  }
  g.restore();
}

function drawLantern(g, l) {
  g.strokeStyle = '#2a2018'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(l.x, 0); g.lineTo(l.x, l.y - 22); g.stroke();
  g.fillStyle = '#c9983f'; g.fillRect(l.x - 9, l.y - 24, 18, 6);
  g.beginPath(); g.moveTo(l.x - 10, l.y - 18); g.lineTo(l.x + 10, l.y - 18); g.lineTo(l.x + 12, l.y + 14); g.lineTo(l.x - 12, l.y + 14); g.closePath();
  g.fillStyle = vgrad(g, l.y - 18, l.y + 14, [[0, '#fff0c0'], [1, '#ffb347']]); g.fill();
  g.strokeStyle = '#c9983f'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(l.x, l.y - 18); g.lineTo(l.x, l.y + 14); g.stroke();
  g.fillStyle = '#c9983f'; g.fillRect(l.x - 13, l.y + 14, 26, 5);
}

// ---------- 世界樹(人物と前後を並べ替えるスプライト) ----------
function renderTrunk(S) {
  const X0 = 450, W = 700, H = 740;
  const base = makeLayer(W, H, S), lit = makeLayer(W, H, Math.max(1, S * 0.6));
  const g = base.g, q = lit.g;
  g.translate(-X0, 0); q.translate(-X0, 0);
  const cx = TREE.x, by = TREE.y + 8, r = rng(21);

  const nodes = [[0, 350], [70, 272], [140, 186], [300, 124], [430, 114], [540, 148], [by - 24, 172]];
  const hw = (y) => {
    for (let i = 1; i < nodes.length; i++) {
      if (y <= nodes[i][0]) {
        const [y0, w0] = nodes[i - 1], [y1, w1] = nodes[i];
        const u = (1 - Math.cos(Math.PI * (y - y0) / (y1 - y0))) / 2;
        return w0 + (w1 - w0) * u;
      }
    }
    return nodes[nodes.length - 1][1];
  };
  const silhouette = (ctx) => {
    ctx.beginPath();
    for (let y = 0; y <= by - 24; y += 8) ctx[y ? 'lineTo' : 'moveTo'](cx - hw(y), y);
    ctx.lineTo(cx - 172, by);
    ctx.ellipse(cx, by, 172, 66, 0, Math.PI, 0, true);
    for (let y = by - 24; y >= 0; y -= 8) ctx.lineTo(cx + hw(y), y);
    ctx.closePath();
  };

  // 幹の地色と陰影
  silhouette(g);
  g.fillStyle = hgrad(g, cx - 350, cx + 350, [[0, '#1d120a'], [0.2, '#3b2616'], [0.4, '#6f4c2c'], [0.52, '#8a6038'], [0.64, '#6a4729'], [0.84, '#33200f'], [1, '#1a0f08']]);
  g.fill();
  g.save(); silhouette(g); g.clip();
  g.fillStyle = vgrad(g, 0, by + 60, [[0, 'rgba(4,22,12,.62)'], [0.4, 'rgba(4,22,12,.12)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.25)']]);
  g.fillRect(cx - 360, 0, 720, by + 70);
  // 樹皮のうねり(太く間引いて、わらのように見えないようにする)
  for (let i = 0; i < 34; i++) {
    const u = -0.96 + 1.92 * ((i + r()) / 34), ph = r() * 6;
    const pts = [];
    for (let y = 0; y <= by + 10; y += 36) pts.push([cx + u * hw(y) + Math.sin(y * 0.021 + ph) * 9 * (1 - Math.abs(u)), y]);
    const trace = (dx) => {
      g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) g.quadraticCurveTo(pts[k][0] + dx, pts[k][1], (pts[k][0] + pts[k + 1][0]) / 2 + dx, (pts[k][1] + pts[k + 1][1]) / 2);
      g.lineTo(pts[pts.length - 1][0] + dx, pts[pts.length - 1][1]);
    };
    g.lineCap = 'round';
    trace(0); g.strokeStyle = `rgba(14,7,3,${0.16 + r() * 0.18})`; g.lineWidth = 3.5 + r() * 4; g.stroke();
    trace(3.4); g.strokeStyle = 'rgba(255,225,180,.12)'; g.lineWidth = 2.4; g.stroke();
  }
  // 横のしわ
  for (let i = 0; i < 160; i++) {
    const y = r() * (by + 10), x = cx + (r() * 2 - 1) * hw(y) * 0.92, w = 14 + r() * 26;
    g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + (r() - 0.5) * 8, x + w / 2, y + (r() - 0.5) * 3);
    g.strokeStyle = `rgba(20,10,4,${0.1 + r() * 0.1})`; g.lineWidth = 1.8; g.stroke();
  }
  // 根元に向かって暗く
  g.fillStyle = vgrad(g, by - 90, by + 70, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]);
  g.fillRect(cx - 200, by - 90, 400, 170);
  // 苔
  for (let i = 0; i < 26; i++) {
    const x = cx + (r() - 0.5) * 330, y = by - 20 - r() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, 28);
    gr.addColorStop(0, 'rgba(110,200,120,.5)'); gr.addColorStop(1, 'rgba(110,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 28, 14, 0, 0, TAU); g.fill();
  }
  // うろ
  g.beginPath(); g.ellipse(cx + 24, 392, 30, 48, 0.05, 0, TAU);
  g.fillStyle = vgrad(g, 344, 440, [[0, '#0b0603'], [1, '#2a170a']]); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#5a3b20'; g.stroke();
  g.restore();
  silhouette(g); g.lineWidth = 3; g.strokeStyle = '#1b1008'; g.stroke();

  // 光る樹液(加算合成で脈動させる別レイヤー)
  q.save(); silhouette(q); q.clip();
  q.lineCap = 'round'; q.shadowColor = '#6fffc0'; q.shadowBlur = 14;
  for (let i = 0; i < 9; i++) {
    const u = -0.8 + i * 0.2 + (r() - 0.5) * 0.1, endY = 360 + r() * 280;
    q.beginPath();
    for (let y = 20; y <= endY; y += 18) {
      const x = cx + u * hw(y) * (1 - 0.25 * y / endY) + Math.sin(y * 0.03 + i * 1.7) * 10;
      q[y === 20 ? 'moveTo' : 'lineTo'](x, y);
    }
    q.strokeStyle = 'rgba(120,255,190,.8)'; q.lineWidth = 3.2; q.stroke();
    q.strokeStyle = 'rgba(230,255,240,.9)'; q.lineWidth = 1.1; q.stroke();
  }
  q.shadowBlur = 0;
  const hole = q.createRadialGradient(cx + 24, 392, 2, cx + 24, 392, 60);
  hole.addColorStop(0, 'rgba(210,255,225,.95)'); hole.addColorStop(0.4, 'rgba(120,255,190,.45)'); hole.addColorStop(1, 'rgba(120,255,190,0)');
  q.fillStyle = hole; q.beginPath(); q.arc(cx + 24, 392, 60, 0, TAU); q.fill();
  q.restore();

  // 天井へ広がる枝葉
  for (let i = 0; i < 150; i++) {
    const x = cx + (r() - 0.5) * 700, y = r() * 130 * (0.4 + Math.abs(x - cx) / 500), rx = 9 + r() * 9, ry = 4.5 + r() * 3.5, a = r() * Math.PI;
    for (const [ctx, glowy] of [[g, false], [q, r() < 0.18]]) {
      if (ctx === q && !glowy) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.fillStyle = ctx === g
        ? vgrad(ctx, -ry, ry, [[0, '#8fe3b0'], [1, '#1f6b46']])
        : 'rgba(150,255,200,.7)';
      ctx.fill();
      if (ctx === g) { ctx.strokeStyle = '#14402b'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }
  }
  return { img: base.canvas, glow: lit.canvas, x: X0, y: 0, w: W, h: H, sortY: TREE.y + 14 };
}

// ---------- 動く演出 ----------
export function createFx() {
  const rnd = rng(7);
  const spr = {
    gold: glowSprite('255,214,140'), green: glowSprite('150,255,190'),
    blue: glowSprite('143,227,255'), white: glowSprite('225,255,238', 64),
  };
  // 差し込む光の筋は一度だけ描いておく(やわらかい光なので粗い解像度でよい)
  const shafts = makeLayer(WORLD.w, WORLD.h, 0.5);
  for (let i = 0; i < 4; i++) {
    const x0 = 260 + i * 360, w = 90 + i * 12, g = shafts.g;
    const gr = g.createLinearGradient(x0, 0, x0 + 260, WORLD.h);
    gr.addColorStop(0, 'rgba(210,255,225,.12)'); gr.addColorStop(1, 'rgba(210,255,225,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.lineTo(x0 + w + 330, WORLD.h); g.lineTo(x0 + 250, WORLD.h); g.closePath(); g.fill();
  }
  const motes = Array.from({ length: 90 }, () => ({
    x: rnd() * WORLD.w, y: rnd() * WORLD.h, vy: -(6 + rnd() * 16), ph: rnd() * TAU, sz: 5 + rnd() * 9, sp: 0.4 + rnd(),
  }));
  let time = 0;
  const seen = (v, x, y, w, h) => x < v.x1 && x + w > v.x0 && y < v.y1 && y + h > v.y0;
  return {
    update(dt) {
      time += dt;
      for (const m of motes) {
        m.y += m.vy * dt; m.x += Math.sin(time * m.sp + m.ph) * 12 * dt;
        if (m.y < -20) { m.y = WORLD.h + 10; m.x = rnd() * WORLD.w; }
      }
    },
    drawGround(g, t, v) {
      g.save(); g.globalCompositeOperation = 'lighter';
      if (seen(v, TREE.x - 420, TREE.y - 150, 840, 420)) {
        g.globalAlpha = 0.3 + 0.12 * Math.sin(t * 1.4);
        g.drawImage(spr.green, TREE.x - 420, TREE.y - 150, 840, 420);
      }
      for (const p of PORTALS) {
        if (!seen(v, p.x - p.r * 1.8, p.y - p.r * 1.2, p.r * 3.6, p.r * 2.4)) continue;
        g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 2);
        g.drawImage(spr.blue, p.x - p.r * 1.8, p.y - p.r * 1.2, p.r * 3.6, p.r * 2.4);
      }
      // 漂う光の粒(顔の表情が隠れないよう、キャラクターの後ろに描く)
      for (const m of motes) {
        if (!seen(v, m.x - m.sz, m.y - m.sz, m.sz * 2, m.sz * 2)) continue;
        g.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(time * m.sp * 1.3 + m.ph));
        g.drawImage(spr.white, m.x - m.sz, m.y - m.sz, m.sz * 2, m.sz * 2);
      }
      g.restore();
    },
    drawAir(g, t, v) {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.6);
      drawLayer(g, shafts.canvas, 0, 0, WORLD.w, WORLD.h, v);
      // ランタンとろうそくのゆらめき
      for (const [i, l] of LANTERNS.entries()) {
        if (!seen(v, l.x - 100, l.y - 90, 200, 200)) continue;
        g.globalAlpha = 0.5 + 0.12 * Math.sin(t * 5 + i * 2.3) + 0.06 * Math.sin(t * 11 + i);
        g.drawImage(spr.gold, l.x - 100, l.y - 90, 200, 200);
      }
      for (const [i, tb] of TABLES.entries()) {
        const x = tb.x + tb.w / 2 + 33.5 - 55, y = tb.y + 6 - 55;
        if (!seen(v, x, y, 110, 110)) continue;
        g.globalAlpha = 0.45 + 0.12 * Math.sin(t * 7 + i * 1.7);
        g.drawImage(spr.gold, x, y, 110, 110);
      }
      g.restore();
    },
  };
}
