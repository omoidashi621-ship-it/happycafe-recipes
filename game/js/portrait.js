// 顔のアップ(バストアップ)。等身高めのアニメ調で、表情・まばたき・首ふり・うなずきを描く。
// 論理サイズは 240 x 300。顔の中心は (120, 148)、首の付け根が (120, 252)。
import { SKINS, HAIR_COLORS, OUTFITS, EYE_COLORS, FACE_DEF, blinkAmount, gestureMotion, popScale } from './avatar.js';
import { jobById } from './jobs.js';
import { shade, strand } from './gfx.js';

export const PORTRAIT = { w: 240, h: 300 };
const TAU = Math.PI * 2;

// ---------- 色 ----------
const palCache = new Map();
function palette(look, job) {
  const key = `${look.skin}|${look.hair}|${look.outfit}|${look.eyes}|${job.id}`;
  let C = palCache.get(key);
  if (C) return C;
  const skin = SKINS[look.skin] ?? SKINS[0], hair = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
  const outfit = OUTFITS[look.outfit] ?? OUTFITS[0], eye = EYE_COLORS[look.eyes] ?? EYE_COLORS[0];
  C = {
    skin, skinLight: shade(skin, 0.42), skinShade: shade(skin, -0.14), skinDeep: shade(skin, -0.3), skinLine: shade(skin, -0.5),
    hair, hairLight: shade(hair, 0.45), hairMid: shade(hair, 0.15), hairDark: shade(hair, -0.32), hairLine: shade(hair, -0.62),
    eye, eyeDark: shade(eye, -0.5), eyeMid: shade(eye, -0.2), eyeLight: shade(eye, 0.55), lash: '#2a1b24',
    outfit, outfitLight: shade(outfit, 0.3), outfitDark: shade(outfit, -0.3), outfitLine: shade(outfit, -0.58),
    job: job.color, jobLight: shade(job.color, 0.35), jobDark: shade(job.color, -0.35), jobLine: shade(job.color, -0.62),
  };
  palCache.set(key, C);
  return C;
}

// ---------- 小さな道具 ----------
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
function rad(g, x, y, r0, r1, stops, sx = 1, sy = 1) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}
const mirrored = (g, fn) => { for (const s of [-1, 1]) { g.save(); g.translate(120, 0); g.scale(s, 1); g.translate(-120, 0); fn(s); g.restore(); } };

function blossom(P, a, b, c) {
  const w = [(1 - a) * (1 - b) * (1 - c), a * (1 - b) * (1 - c) + (1 - a) * b * (1 - c) + (1 - a) * (1 - b) * c, a * b * (1 - c) + a * (1 - b) * c + (1 - a) * b * c, a * b * c];
  return [0, 1].map((k) => P[0][k] * w[0] + P[1][k] * w[1] + P[2][k] * w[2] + P[3][k] * w[3]);
}
const sub = (P, t0, t1) => [blossom(P, t0, t0, t0), blossom(P, t0, t0, t1), blossom(P, t0, t1, t1), blossom(P, t1, t1, t1)];
const bez = (g, Q) => g.bezierCurveTo(Q[1][0], Q[1][1], Q[2][0], Q[2][1], Q[3][0], Q[3][1]);
const at = (P, t) => blossom(P, t, t, t);

// ---------- 顔の輪郭 ----------
function facePath(g) {
  g.beginPath();
  g.moveTo(66, 130);
  g.bezierCurveTo(66, 86, 174, 86, 174, 130);
  g.bezierCurveTo(174, 174, 152, 222, 120, 224);
  g.bezierCurveTo(88, 222, 66, 174, 66, 130);
  g.closePath();
}

function drawFaceSkin(g, C, S) {
  facePath(g);
  g.fillStyle = rad(g, 112, 146, 10, 104, [[0, C.skinLight], [0.55, C.skin], [1, C.skinShade]]);
  g.fill();
  g.save(); facePath(g); g.clip();
  // 輪郭ぎわのやわらかい影
  g.fillStyle = rad(g, 120, 150, 58, 100, [[0, 'rgba(210,120,100,0)'], [1, 'rgba(210,120,100,.11)']]);
  g.fillRect(60, 80, 120, 150);
  // 前髪の落とす影
  g.fillStyle = lin(g, 0, 96, 0, 140, [[0, 'rgba(120,60,50,.36)'], [1, 'rgba(120,60,50,0)']]);
  g.fillRect(60, 90, 120, 56);
  // 鼻すじのつや
  g.fillStyle = lin(g, 114, 0, 128, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,.16)'], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(112, 126, 18, 56);
  g.restore();
  facePath(g);
  g.lineWidth = 1.6; g.strokeStyle = C.skinLine; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
  void S;
}

// ---------- 目 ----------
const EYE_X = 95.5, EYE_Y = 152;

/** s: 左目 -1 / 右目 +1。kind: open | arc | heart */
function drawEye(g, C, s, kind, E, blink, t) {
  const ex = s < 0 ? EYE_X : 240 - EYE_X, cy = EYE_Y;
  const inn = -s;                                   // 目頭の向き(顔の中心側)
  const open = Math.max(0, E.open * (1 - blink));
  const tl = E.tilt || 0;
  const I = [ex + inn * 17, cy + 4 + tl * 7], O = [ex - inn * 18.6, cy - 2 - tl * 5];

  if (kind === 'heart') return drawHeartEye(g, ex, cy, t);
  if (kind === 'arc' || open < 0.1) return drawClosedEye(g, C, ex, cy, inn, I, O, kind === 'arc');

  const h = 17 * Math.min(1.15, open);
  const upper = [O, [O[0] + inn * 7, O[1] - h - 3], [I[0] - inn * 12, I[1] - h * 1.12], I];
  const lower = [I, [I[0] - inn * 7, I[1] + 5 + 3 * open], [O[0] + inn * 12, O[1] + 8 + 3 * open], O];
  const shape = () => { g.beginPath(); g.moveTo(O[0], O[1]); bez(g, upper); bez(g, lower); g.closePath(); };

  g.save();
  shape(); g.clip();
  // 白目(上にまぶたの影)
  g.fillStyle = lin(g, 0, cy - h - 4, 0, cy + 12, [[0, '#d9d2e0'], [0.35, '#ffffff'], [1, '#efe9f3']]);
  g.fillRect(ex - 24, cy - 26, 48, 44);
  // 虹彩
  const ir = E.iris || 1, look = E.look || [0, 0];
  const ix = ex + inn * -1.2 + look[0] * 0.8, iy = cy - 1 + look[1];
  const rx = 12 * ir, ry = 14.5 * ir;
  g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, TAU);
  g.fillStyle = rad(g, ix, iy + 5, 2, ry * 1.05, [[0, C.eyeLight], [0.42, C.eye], [1, C.eyeDark]]);
  g.fill();
  g.lineWidth = 2.4; g.strokeStyle = C.eyeDark; g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
  // 虹彩のすじ
  g.save(); g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, TAU); g.clip();
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * TAU;
    g.strokeStyle = k % 2 ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.14)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(ix + Math.cos(a) * 5 * ir, iy + Math.sin(a) * 6.4 * ir); g.lineTo(ix + Math.cos(a) * rx, iy + Math.sin(a) * ry); g.stroke();
  }
  g.restore();
  // ひとみ
  g.beginPath(); g.ellipse(ix, iy - 0.5, 5.2 * ir, 6.8 * ir, 0, 0, TAU); g.fillStyle = '#120d17'; g.fill();
  // 光(大・小・下)
  g.fillStyle = 'rgba(255,255,255,.97)';
  g.beginPath(); g.ellipse(ix - 4.6, iy - 6.4, 4.4 * ir, 5.4 * ir, -0.3, 0, TAU); g.fill();
  g.beginPath(); g.arc(ix + 5, iy + 6.4, 2.1 * ir, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(ix + 1.6, iy + 10.5, 1.2 * ir, 0, TAU); g.fill();
  g.strokeStyle = C.eyeLight; g.globalAlpha = 0.55; g.lineWidth = 2.2;
  g.beginPath(); g.ellipse(ix, iy, rx - 2.5, ry - 2.5, 0, 0.35 * Math.PI, 0.78 * Math.PI); g.stroke(); g.globalAlpha = 1;
  // まぶたの落とす影
  g.beginPath(); g.moveTo(O[0], O[1]); bez(g, upper);
  g.lineWidth = 11; g.strokeStyle = 'rgba(50,25,45,.28)'; g.lineJoin = 'round'; g.stroke();
  g.restore();

  // 下まぶた(うすく)
  g.strokeStyle = 'rgba(150,80,80,.4)'; g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath(); const lw = sub(lower, 0.12, 0.88); g.moveTo(lw[0][0], lw[0][1]); bez(g, lw); g.stroke();
  // 涙袋
  g.strokeStyle = 'rgba(230,140,130,.3)'; g.lineWidth = 2.2;
  g.beginPath(); const lw2 = sub(lower, 0.3, 0.8); g.moveTo(lw2[0][0], lw2[0][1] + 4); bez(g, lw2.map((p) => [p[0], p[1] + 4])); g.stroke();
  // 二重まぶた
  if (open > 0.55) {
    g.strokeStyle = 'rgba(150,90,80,.5)'; g.lineWidth = 1.5;
    const cr = sub(upper, 0.14, 0.86); g.beginPath(); g.moveTo(cr[0][0], cr[0][1] - 6); bez(g, cr.map((p) => [p[0], p[1] - 6.5])); g.stroke();
  }
  // 目頭のうるみ
  g.fillStyle = 'rgba(255,140,150,.5)'; g.beginPath(); g.ellipse(I[0] - inn * 2.5, I[1] + 0.5, 3.2, 2.2, 0, 0, TAU); g.fill();
  // 上まつげ(外側ほど太く)
  g.strokeStyle = C.lash; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 3.2; g.beginPath(); g.moveTo(O[0], O[1]); bez(g, upper); g.stroke();
  const th = sub(upper, 0, 0.62);
  g.lineWidth = 5.4; g.beginPath(); g.moveTo(th[0][0], th[0][1] - 0.6); bez(g, th.map((p) => [p[0], p[1] - 0.6])); g.stroke();
  // 目じりのはね
  g.beginPath(); g.moveTo(O[0] + inn * 2, O[1] - 1);
  g.quadraticCurveTo(O[0] - inn * 4, O[1] - 3.5, O[0] - inn * 10.5, O[1] - 8 - tl * -3);
  g.quadraticCurveTo(O[0] - inn * 5.5, O[1] + 1, O[0] + inn * 3, O[1] + 2); g.closePath(); g.fillStyle = C.lash; g.fill();
  // まつげ
  g.lineWidth = 1.7;
  for (const u of [0.18, 0.32, 0.46]) {
    const p = at(upper, u), q = at(upper, u + 0.02);
    const nx = -(q[1] - p[1]), ny = q[0] - p[0], d = Math.hypot(nx, ny) || 1, sgn = ny / d > 0 ? -1 : 1;
    g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] - inn * 3 + (nx / d) * sgn * 3, p[1] - 3.5, p[0] - inn * 6.5, p[1] - 6 - u * 4); g.stroke();
  }
  // 下まつげ(ほんの少し)
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(60,30,45,.55)';
  for (const u of [0.55, 0.7, 0.84]) {
    const p = at(lower, u); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - inn * 2.4, p[1] + 3.2); g.stroke();
  }
}

function drawClosedEye(g, C, ex, cy, inn, I, O, happy) {
  g.strokeStyle = C.lash; g.lineCap = 'round'; g.lineJoin = 'round';
  const sgn = happy ? -1 : 1;                           // 笑い目は上にふくらみ、閉じ目は下にふくらむ
  const y0 = happy ? cy + 6 : cy + 1;
  const P = [[O[0], y0], [O[0] + inn * 8, y0 + sgn * 14], [I[0] - inn * 8, y0 + sgn * 14], [I[0], y0 + 1]];
  g.lineWidth = 3.8; g.beginPath(); g.moveTo(P[0][0], P[0][1]); bez(g, P); g.stroke();
  const th = sub(P, 0, 0.6); g.lineWidth = 5.4; g.beginPath(); g.moveTo(th[0][0], th[0][1]); bez(g, th); g.stroke();
  g.lineWidth = 1.8;
  for (const u of [0.1, 0.25, 0.4]) {
    const p = at(P, u); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] - inn * 3.5, p[1] + (happy ? -1 : 4.5)); g.stroke();
  }
  if (!happy) {
    g.strokeStyle = 'rgba(150,80,80,.3)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(O[0] + inn * 6, y0 + 8); g.quadraticCurveTo(ex, y0 + 13, I[0] - inn * 6, y0 + 8); g.stroke();
  }
}

function drawHeartEye(g, ex, cy, t) {
  const s = 1 + 0.07 * Math.sin(t * 8);
  g.save(); g.translate(ex, cy + 1); g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 17);
  g.bezierCurveTo(-26, 2, -17, -17, 0, -6);
  g.bezierCurveTo(17, -17, 26, 2, 0, 17);
  g.closePath();
  g.fillStyle = lin(g, 0, -14, 0, 17, [[0, '#ff9ab8'], [1, '#e0245e']]); g.fill();
  g.lineWidth = 2; g.strokeStyle = '#9a1f45'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.ellipse(-8, -6, 3.6, 5, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.arc(7, 6, 1.8, 0, TAU); g.fill();
  g.restore();
}

function drawBrows(g, C, E) {
  const [lift, ang] = E.brow;
  for (const s of [-1, 1]) {
    const x = s < 0 ? EYE_X : 240 - EYE_X, inn = -s;
    g.save(); g.translate(x, 124 + lift); g.rotate(ang * -s * 1);
    g.fillStyle = C.hairDark; g.globalAlpha = 0.92;
    strand(g, [inn * 14, 1], [inn * 0, -6], [-inn * 17, 1.5], 4.6, 1.3);
    g.fill(); g.globalAlpha = 1;
    g.restore();
  }
}

function drawNose(g, C) {
  g.strokeStyle = shade(C.skin, -0.32); g.globalAlpha = 0.5; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(124, 168); g.quadraticCurveTo(126, 178, 120, 182); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(118, 176, 2.2, 4.4, 0.1, 0, TAU); g.fill();
}

function drawMouth(g, C, kind, t) {
  const line = '#9a3f4c', dark = '#7a2432', edge = '#5a1a26', lip = '#ee8a99';
  g.save(); g.translate(120, 200); g.lineCap = 'round'; g.lineJoin = 'round';
  const gloss = (x, y, w) => { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x, y, w, 1.6, 0, 0, TAU); g.fill(); };
  switch (kind) {
    case 'smile':
      g.fillStyle = lip; g.beginPath(); g.moveTo(-11, -1); g.quadraticCurveTo(0, 6, 11, -1); g.quadraticCurveTo(0, 12, -11, -1); g.fill();
      g.strokeStyle = line; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-13, -3); g.quadraticCurveTo(0, 6, 13, -3); g.stroke();
      gloss(0, 5, 4.5);
      break;
    case 'grin': {
      const path = () => { g.beginPath(); g.moveTo(-13, -3); g.quadraticCurveTo(0, 4, 13, -3); g.quadraticCurveTo(11, 15, 0, 15); g.quadraticCurveTo(-11, 15, -13, -3); g.closePath(); };
      path(); g.fillStyle = dark; g.fill();
      g.save(); path(); g.clip();
      g.fillStyle = '#fff'; g.fillRect(-14, -5, 28, 9);
      g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(-14, 3, 28, 1.5);
      g.fillStyle = '#f08a98'; g.beginPath(); g.ellipse(0, 14, 9, 6, 0, 0, TAU); g.fill();
      g.restore();
      path(); g.lineWidth = 2; g.strokeStyle = edge; g.stroke();
      break;
    }
    case 'laugh': {
      const path = () => { g.beginPath(); g.moveTo(-17, -5); g.quadraticCurveTo(0, 3, 17, -5); g.quadraticCurveTo(15, 22, 0, 22); g.quadraticCurveTo(-15, 22, -17, -5); g.closePath(); };
      path(); g.fillStyle = dark; g.fill();
      g.save(); path(); g.clip();
      g.fillStyle = '#fff'; g.fillRect(-18, -7, 36, 12);
      g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(-18, 4, 36, 1.5);
      g.fillStyle = '#f08a98'; g.beginPath(); g.ellipse(0, 20, 12, 8, 0, 0, TAU); g.fill();
      g.restore();
      path(); g.lineWidth = 2.2; g.strokeStyle = edge; g.stroke();
      break;
    }
    case 'frown':
      g.strokeStyle = line; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-12, 5); g.quadraticCurveTo(0, -4, 12, 5); g.stroke();
      g.fillStyle = 'rgba(238,138,153,.55)'; g.beginPath(); g.moveTo(-7, 6); g.quadraticCurveTo(0, 12, 7, 6); g.quadraticCurveTo(0, 3, -7, 6); g.fill();
      break;
    case 'o':
      g.beginPath(); g.ellipse(0, 4, 8, 10, 0, 0, TAU); g.fillStyle = dark; g.fill(); g.lineWidth = 2; g.strokeStyle = edge; g.stroke();
      g.fillStyle = '#f08a98'; g.beginPath(); g.ellipse(0, 9, 5, 3.4, 0, 0, TAU); g.fill();
      break;
    case 'wavy':
      g.strokeStyle = line; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(-13, 1); g.quadraticCurveTo(-9.5, -5, -6.5, 1); g.quadraticCurveTo(-3, 7, 0, 1); g.quadraticCurveTo(3, -5, 6.5, 1); g.quadraticCurveTo(9.5, 7, 13, 1); g.stroke();
      break;
    case 'flat':
      g.beginPath(); g.ellipse(0, 3 + Math.sin(t * 2) * 0.8, 4.4, 5.4, 0, 0, TAU); g.fillStyle = '#c95a6a'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = edge; g.stroke();
      break;
    default: break;
  }
  g.restore();
}

function drawBlush(g, C, b, shy) {
  if (b <= 0.02) return;
  for (const x of [80, 160]) {
    g.fillStyle = rad(g, x, 180, 0, 24, [[0, `rgba(255,100,125,${0.52 * b})`], [1, 'rgba(255,100,125,0)']]);
    g.beginPath(); g.ellipse(x, 180, 24, 13, 0, 0, TAU); g.fill();
    if (shy) {
      g.strokeStyle = 'rgba(235,70,100,.7)'; g.lineWidth = 1.8; g.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 8 - 3, 186); g.lineTo(x + i * 8 + 3, 174); g.stroke(); }
    }
  }
  void C;
}

// ---------- 髪 ----------
const hairFill = (g, C, y0 = 50, y1 = 250) => lin(g, 0, y0, 0, y1, [[0, C.hairLight], [0.22, C.hairMid], [0.5, C.hair], [1, C.hairDark]]);

function strokeHair(g, C, w = 1.4) { g.lineWidth = w; g.strokeStyle = C.hairLine; g.globalAlpha = 0.55; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1; }

function hairShine(g, cx, cy, rx, ry, a0 = Math.PI * 1.1, a1 = Math.PI * 1.9) {
  g.save(); g.lineCap = 'round';
  for (const [w, al] of [[18, 0.1], [11, 0.16], [5, 0.3]]) {
    g.strokeStyle = `rgba(255,255,255,${al})`; g.lineWidth = w;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, a0, a1); g.stroke();
  }
  g.restore();
}

// 前髪の下端を右から左へ。pts は [x, y] の列(なめらかにつなぐ)
function smoothLine(g, pts) {
  for (let i = 1; i < pts.length - 1; i++) {
    g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

// 髪の流れを表すうすい線(毛束のつやと立体感)
function strandLines(g, C, lines) {
  g.save(); g.lineCap = 'round';
  for (const [x0, y0, cx, cy, x1, y1, light] of lines) {
    g.strokeStyle = light ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.16)'; g.lineWidth = light ? 2.2 : 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  }
  g.restore();
  void C;
}

function hairBack(g, C, st, sway) {
  g.fillStyle = hairFill(g, C); g.strokeStyle = C.hairLine;
  const mass = (bottom, wobble = 0) => {
    g.beginPath();
    g.moveTo(52, bottom);
    g.bezierCurveTo(34, 150, 38, 86, 70, 64);
    g.bezierCurveTo(98, 46, 142, 46, 170, 64);
    g.bezierCurveTo(202, 86, 206, 150, 188, bottom);
    if (wobble) { g.quadraticCurveTo(176, bottom + 16, 146, bottom + 12); g.lineTo(94, bottom + 12); g.quadraticCurveTo(64, bottom + 16, 52, bottom); }
    g.closePath();
  };
  if (st === 1) {
    g.beginPath();
    g.moveTo(52, 170);
    g.bezierCurveTo(30, 200, 40, 262, 28, 304);
    g.lineTo(212, 304);
    g.bezierCurveTo(200, 262, 210, 200, 188, 170);
    g.lineTo(188, 120); g.lineTo(52, 120); g.closePath();
    g.fill(); strokeHair(g, C);
    mass(176); g.fill(); strokeHair(g, C);
    strandLines(g, C, [[44, 200, 40, 250, 38, 296, 0], [60, 190, 56, 250, 52, 298, 1], [196, 200, 200, 250, 202, 296, 0], [180, 190, 184, 250, 188, 298, 1]]);
  } else {
    mass(176, 6); g.fill(); strokeHair(g, C);
  }
  if (st === 2) {
    g.beginPath(); g.arc(120, 46, 27, 0, TAU); g.fillStyle = lin(g, 0, 20, 0, 72, [[0, C.hairLight], [0.4, C.hairMid], [1, C.hairDark]]); g.fill(); strokeHair(g, C);
    hairShine(g, 120, 46, 15, 13, Math.PI * 1.05, Math.PI * 1.7);
  }
  if (st === 3) {
    mirrored(g, () => {
      g.beginPath();
      g.moveTo(58, 96);
      g.bezierCurveTo(26, 112 + sway, 10, 190, 34, 252 + sway);
      g.bezierCurveTo(40, 274, 62, 276, 66, 258);
      g.bezierCurveTo(52, 214, 62, 160, 82, 118);
      g.closePath();
      g.fillStyle = lin(g, 0, 96, 0, 276, [[0, C.hairMid], [1, C.hairDark]]); g.fill(); strokeHair(g, C);
      strandLines(g, C, [[48, 130, 24, 190, 40, 258, 1], [60, 124, 44, 190, 58, 262, 0]]);
    });
  }
  if (st === 4) {
    g.beginPath();
    g.moveTo(158, 70);
    g.bezierCurveTo(212, 58 + sway, 240, 140, 214, 236 + sway);
    g.bezierCurveTo(208, 258, 186, 262, 184, 244);
    g.bezierCurveTo(196, 196, 192, 130, 150, 98);
    g.closePath();
    g.fillStyle = lin(g, 0, 60, 0, 262, [[0, C.hairMid], [1, C.hairDark]]); g.fill(); strokeHair(g, C);
    strandLines(g, C, [[184, 90, 220, 140, 204, 236, 1], [170, 90, 204, 150, 192, 238, 0]]);
  }
}

// 前髪・横髪の毛束 [根元x, 根元y, 制御x, 制御y, 先端x, 先端y, 根元の太さ, 先の太さ]。左右対称の髪型は右半分だけ書く
const LOCKS = [
  // ショート
  { right: [[170, 112, 178, 130, 172, 158, 22, 3], [158, 102, 164, 116, 156, 134, 24, 3], [143, 98, 148, 114, 142, 132, 24, 3], [128, 96, 132, 114, 128, 138, 22, 3]],
    center: [[114, 96, 112, 114, 112, 138, 22, 3]] },
  // ロング(分け目から流れる前髪)
  { right: [[124, 98, 152, 98, 170, 132, 24, 3], [128, 98, 158, 108, 178, 150, 24, 3], [138, 96, 168, 114, 184, 176, 22, 3]], center: [] },
  // おだんご(ぱっつん+姫カット)
  { right: [[170, 112, 182, 150, 176, 198, 24, 4], [158, 102, 160, 114, 156, 128, 24, 3], [144, 98, 146, 114, 142, 129, 24, 3], [130, 96, 130, 114, 128, 130, 22, 3]],
    center: [[116, 96, 116, 114, 114, 130, 22, 3]] },
  // ツイン
  { right: [[170, 112, 180, 136, 172, 176, 22, 3], [158, 102, 166, 116, 154, 134, 24, 3], [144, 98, 150, 114, 140, 130, 24, 3], [130, 96, 134, 114, 126, 138, 22, 3]],
    center: [[114, 96, 114, 116, 110, 136, 22, 3]] },
  // ポニー(右から左へ流れる前髪)
  { right: [[172, 108, 180, 130, 174, 168, 22, 3], [160, 98, 150, 112, 126, 130, 28, 3], [146, 96, 134, 108, 106, 128, 28, 3]],
    center: [[128, 96, 108, 106, 88, 130, 26, 3], [108, 98, 94, 108, 76, 134, 24, 3], [74, 110, 66, 132, 72, 160, 20, 3]] },
];

function quadToCubic(p0, c, p2) { return [p0, [p0[0] + (c[0] - p0[0]) * 2 / 3, p0[1] + (c[1] - p0[1]) * 2 / 3], [p2[0] + (c[0] - p2[0]) * 2 / 3, p2[1] + (c[1] - p2[1]) * 2 / 3], p2]; }

function drawLock(g, C, [x0, y0, cx, cy, x1, y1, w0, w1]) {
  strand(g, [x0, y0], [cx, cy], [x1, y1], w0, w1);
  g.fillStyle = hairFill(g, C); g.fill(); strokeHair(g, C, 1.2);
  const hl = sub(quadToCubic([x0, y0 + 6], [cx, cy], [x1, y1]), 0.1, 0.62);
  g.strokeStyle = 'rgba(255,255,255,.26)'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(hl[0][0] - 2, hl[0][1]); bez(g, hl.map((p) => [p[0] - 2, p[1]])); g.stroke();
}

function hairFront(g, C, st, sway) {
  const L = LOCKS[st];
  // 毛束(キャップの下から出る)
  mirrored(g, (s) => { for (const k of L.right) drawLock(g, C, k); void s; });
  for (const k of L.center) drawLock(g, C, k);

  // 頭頂の髪(生え際より上)
  const outer = () => { g.moveTo(64, 132); g.bezierCurveTo(42, 108, 48, 70, 80, 58); g.bezierCurveTo(100, 50, 140, 50, 160, 58); g.bezierCurveTo(192, 70, 198, 108, 176, 132); };
  g.beginPath(); outer();
  g.bezierCurveTo(166, 104, 142, 96, 120, 96); g.bezierCurveTo(98, 96, 74, 104, 64, 132); g.closePath();
  g.fillStyle = hairFill(g, C); g.fill();
  g.save(); g.clip();
  hairShine(g, 120, 100, 56, 36);
  strandLines(g, C, [
    [120, 54, 100, 72, 84, 112, 1], [120, 54, 140, 72, 156, 112, 1], [120, 56, 92, 66, 66, 100, 0], [120, 56, 148, 66, 174, 100, 0],
    [104, 60, 96, 84, 98, 106, 0], [136, 60, 144, 84, 142, 106, 0],
  ]);
  g.restore();
  g.beginPath(); outer(); strokeHair(g, C, 1.5);

  // ロングの前に垂れる髪
  if (st === 1) {
    mirrored(g, () => {
      g.beginPath();
      g.moveTo(180, 130);
      g.bezierCurveTo(198, 168, 192, 220, 200 + sway * 0.5, 278);
      g.bezierCurveTo(188, 282, 176, 272, 174, 260);
      g.bezierCurveTo(176, 216, 178, 176, 170, 142);
      g.closePath();
      g.fillStyle = lin(g, 0, 130, 0, 282, [[0, C.hairMid], [0.5, C.hair], [1, C.hairDark]]); g.fill(); strokeHair(g, C);
      strandLines(g, C, [[188, 150, 194, 206, 194, 268, 1], [180, 158, 186, 214, 184, 264, 0]]);
    });
  }
}

// ---------- 首・体 ----------
function drawBody(g, C, job, S) {
  const by = S.breath;
  g.save(); g.translate(0, by);
  // 首
  g.beginPath(); g.moveTo(100, 196); g.bezierCurveTo(102, 226, 100, 244, 94, 262); g.lineTo(146, 262); g.bezierCurveTo(140, 244, 138, 226, 140, 196); g.closePath();
  g.fillStyle = lin(g, 96, 0, 144, 0, [[0, C.skinShade], [0.35, C.skin], [0.7, C.skin], [1, C.skinShade]]); g.fill();
  g.save(); g.clip(); g.fillStyle = rad(g, 120, 206, 6, 40, [[0, 'rgba(150,80,70,.45)'], [1, 'rgba(150,80,70,0)']]); g.fillRect(90, 196, 60, 50); g.restore();

  // 肩・服
  const body = () => {
    g.beginPath(); g.moveTo(6, 306); g.lineTo(6, 280);
    g.bezierCurveTo(14, 258, 56, 246, 98, 242); g.lineTo(142, 242);
    g.bezierCurveTo(184, 246, 226, 258, 234, 280); g.lineTo(234, 306); g.closePath();
  };
  body();
  g.fillStyle = lin(g, 0, 250, 0, 306, [[0, C.outfitLight], [0.4, C.outfit], [1, C.outfitDark]]); g.fill();
  g.lineWidth = 2; g.strokeStyle = C.outfitLine; g.stroke();
  g.save(); body(); g.clip();
  g.fillStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.ellipse(60, 280, 50, 14, -0.15, 0, TAU); g.fill();
  switch (job.id) {
    case 'librarian':
      g.beginPath(); g.moveTo(98, 248); g.lineTo(120, 292); g.lineTo(142, 248); g.closePath(); g.fillStyle = '#f6f2ea'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = C.outfitLine; g.stroke();
      g.beginPath(); g.moveTo(98, 248); g.lineTo(104, 262); g.lineTo(120, 252); g.lineTo(136, 262); g.lineTo(142, 248); g.strokeStyle = 'rgba(0,0,0,.18)'; g.stroke();
      bowTie(g, 120, 266, C.job, C.jobLine);
      break;
    case 'mage':
      g.fillStyle = lin(g, 0, 244, 0, 270, [[0, '#f6dc8a'], [1, '#c9983f']]);
      g.beginPath(); g.moveTo(92, 248); g.quadraticCurveTo(120, 276, 148, 248); g.lineTo(158, 252); g.quadraticCurveTo(120, 290, 82, 252); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(120, 270); g.lineTo(124, 278); g.lineTo(133, 279); g.lineTo(126, 285); g.lineTo(128, 294); g.lineTo(120, 289); g.lineTo(112, 294); g.lineTo(114, 285); g.lineTo(107, 279); g.lineTo(116, 278); g.closePath();
      g.fillStyle = '#fff3b8'; g.fill(); g.strokeStyle = '#a07a20'; g.lineWidth = 1.2; g.stroke();
      break;
    case 'knight':
      for (const x of [34, 206]) {
        g.beginPath(); g.ellipse(x, 276, 40, 30, 0, 0, TAU); g.fillStyle = lin(g, 0, 246, 0, 306, [[0, '#f1f4f8'], [1, '#8d97a8']]); g.fill(); g.lineWidth = 2; g.strokeStyle = '#4b5361'; g.stroke();
        g.beginPath(); g.ellipse(x, 270, 28, 18, 0, Math.PI * 1.1, Math.PI * 1.9); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.stroke();
      }
      g.beginPath(); g.moveTo(94, 252); g.quadraticCurveTo(120, 286, 146, 252); g.lineTo(146, 268); g.quadraticCurveTo(120, 300, 94, 268); g.closePath();
      g.fillStyle = lin(g, 0, 250, 0, 296, [[0, '#f1f4f8'], [1, '#8d97a8']]); g.fill(); g.strokeStyle = '#4b5361'; g.lineWidth = 1.8; g.stroke();
      g.beginPath(); g.arc(120, 278, 7, 0, TAU); g.fillStyle = C.job; g.fill(); g.strokeStyle = '#7a5a1c'; g.stroke();
      break;
    case 'alchemist':
      g.beginPath(); g.moveTo(88, 250); g.lineTo(152, 250); g.lineTo(176, 306); g.lineTo(64, 306); g.closePath(); g.fillStyle = lin(g, 0, 250, 0, 306, [[0, '#fbf3df'], [1, '#d9ccab']]); g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#7a6a44'; g.stroke();
      g.strokeStyle = '#6b4a2c'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(94, 250); g.lineTo(60, 306); g.moveTo(146, 250); g.lineTo(180, 306); g.stroke();
      g.fillStyle = '#c9983f'; for (const x of [96, 144]) { g.beginPath(); g.arc(x, 262, 3.2, 0, TAU); g.fill(); }
      break;
    case 'bard':
      g.beginPath(); g.moveTo(40, 252); g.lineTo(70, 252); g.lineTo(190, 306); g.lineTo(150, 306); g.closePath(); g.fillStyle = C.job; g.fill(); g.lineWidth = 1.6; g.strokeStyle = C.jobLine; g.stroke();
      g.beginPath(); g.ellipse(120, 252, 40, 14, 0, 0, TAU); g.fillStyle = lin(g, 0, 238, 0, 266, [[0, C.jobLight], [1, C.job]]); g.fill(); g.strokeStyle = C.jobLine; g.stroke();
      g.beginPath(); g.moveTo(138, 258); g.quadraticCurveTo(160 + S.sway * 0.5, 276, 152, 302); g.lineTo(138, 300); g.quadraticCurveTo(142, 280, 128, 264); g.closePath(); g.fillStyle = C.job; g.fill(); g.stroke();
      break;
    default: break;
  }
  g.restore();
  g.restore();
}

function bowTie(g, x, y, col, line) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-14, -12, -20, -2); g.quadraticCurveTo(-14, 10, 0, 0);
  g.moveTo(0, 0); g.quadraticCurveTo(14, -12, 20, -2); g.quadraticCurveTo(14, 10, 0, 0);
  g.fillStyle = col; g.fill(); g.lineWidth = 1.6; g.strokeStyle = line; g.stroke();
  g.beginPath(); g.ellipse(0, 0, 4.5, 5, 0, 0, TAU); g.fill(); g.stroke();
  g.restore();
}

// ---------- 小物 ----------
function drawFaceGear(g, C, job) {
  if (job.id !== 'librarian') return;
  g.save();
  g.lineWidth = 2.6; g.strokeStyle = '#5a4e6a'; g.lineJoin = 'round';
  for (const x of [EYE_X, 240 - EYE_X]) {
    g.beginPath(); g.ellipse(x, EYE_Y + 1, 22.5, 20, 0, 0, TAU);
    g.fillStyle = 'rgba(200,230,255,.12)'; g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(x, EYE_Y + 1, 17, 14.5, 0, Math.PI * 1.1, Math.PI * 1.42); g.stroke();
    g.strokeStyle = '#5a4e6a'; g.lineWidth = 2.6;
  }
  g.beginPath(); g.moveTo(EYE_X + 22, EYE_Y - 4); g.quadraticCurveTo(120, EYE_Y - 11, 240 - EYE_X - 22, EYE_Y - 4); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(EYE_X - 22.5, EYE_Y - 2); g.lineTo(64, EYE_Y - 4); g.moveTo(240 - EYE_X + 22.5, EYE_Y - 2); g.lineTo(176, EYE_Y - 4); g.stroke();
  g.restore();
  void C;
}

function drawHeadGear(g, C, job, S) {
  switch (job.id) {
    case 'mage': {
      g.save();
      g.fillStyle = lin(g, 0, 70, 0, 112, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.0)']]);
      // つば
      g.beginPath(); g.ellipse(120, 92, 112, 24, 0, 0, TAU);
      g.fillStyle = lin(g, 0, 70, 0, 116, [[0, C.job], [1, C.jobDark]]); g.fill(); g.lineWidth = 2; g.strokeStyle = C.jobLine; g.stroke();
      // とんがり
      g.beginPath(); g.moveTo(62, 92);
      g.bezierCurveTo(72, 60, 98, 38, 112, 14);
      g.quadraticCurveTo(128, 2, 150 + S.sway * 0.6, 14);
      g.bezierCurveTo(138, 34, 160, 64, 178, 92);
      g.ellipse(120, 92, 58, 14, 0, 0, Math.PI);
      g.closePath();
      g.fillStyle = lin(g, 0, 10, 0, 100, [[0, C.jobLight], [1, C.job]]); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(120, 88, 57, 13, 0, 0.06, Math.PI - 0.06); g.lineWidth = 9; g.strokeStyle = '#f0cf7a'; g.stroke();
      g.strokeStyle = '#c9983f'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(120, 92, 57, 14, 0, 0.06, Math.PI - 0.06); g.stroke();
      g.save(); g.translate(104, 52); g.fillStyle = '#fff3b8'; g.strokeStyle = '#c9983f'; g.lineWidth = 1.2;
      g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 10, a = -Math.PI / 2 + (i / 10) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); g.restore();
      // ひさしの影
      g.restore();
      g.fillStyle = lin(g, 0, 104, 0, 136, [[0, 'rgba(40,20,50,.35)'], [1, 'rgba(40,20,50,0)']]);
      g.beginPath(); g.ellipse(120, 112, 66, 20, 0, 0, TAU); g.fill();
      break;
    }
    case 'knight': {
      g.beginPath(); g.moveTo(58, 116); g.quadraticCurveTo(120, 92, 182, 116); g.lineTo(182, 128); g.quadraticCurveTo(120, 104, 58, 128); g.closePath();
      g.fillStyle = lin(g, 0, 98, 0, 128, [[0, '#f6f8fb'], [1, '#8d97a8']]); g.fill(); g.lineWidth = 2; g.strokeStyle = '#4b5361'; g.stroke();
      g.beginPath(); g.ellipse(120, 109, 9, 11, 0, 0, TAU); g.fillStyle = lin(g, 0, 98, 0, 120, [[0, C.jobLight], [1, C.job]]); g.fill(); g.strokeStyle = '#7a5a1c'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(117, 105, 2.4, 3.6, -0.3, 0, TAU); g.fill();
      mirrored(g, () => {
        g.beginPath(); g.moveTo(176, 110); g.quadraticCurveTo(204, 96, 222, 62); g.quadraticCurveTo(206, 66, 196, 62); g.quadraticCurveTo(204, 76, 188, 84);
        g.quadraticCurveTo(196, 94, 176, 102); g.closePath();
        g.fillStyle = lin(g, 0, 60, 0, 112, [[0, '#ffffff'], [1, '#dfe6ee']]); g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#4b5361'; g.stroke();
      });
      break;
    }
    case 'alchemist': {
      g.beginPath(); g.moveTo(56, 104); g.quadraticCurveTo(120, 86, 184, 104); g.lineTo(184, 116); g.quadraticCurveTo(120, 98, 56, 116); g.closePath();
      g.fillStyle = '#6b4a2c'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#33220f'; g.stroke();
      for (const x of [92, 148]) {
        g.beginPath(); g.arc(x, 86, 23, 0, TAU); g.fillStyle = lin(g, 0, 62, 0, 110, [[0, '#e8c060'], [1, '#a8782c']]); g.fill(); g.lineWidth = 2; g.strokeStyle = '#5a3d12'; g.stroke();
        g.beginPath(); g.arc(x, 86, 16.5, 0, TAU); g.fillStyle = lin(g, 0, 70, 0, 102, [[0, '#dff8ff'], [1, '#6fc0dc']]); g.fill(); g.strokeStyle = '#3d6a7a'; g.lineWidth = 1.6; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(x, 86, 11, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
      }
      g.fillStyle = '#c9983f'; g.fillRect(114, 82, 12, 8);
      break;
    }
    case 'bard': {
      g.save(); g.translate(108, 74); g.rotate(-0.2);
      g.beginPath(); g.ellipse(0, 0, 84, 28, 0, 0, TAU); g.fillStyle = lin(g, 0, -28, 0, 28, [[0, C.jobLight], [1, C.jobDark]]); g.fill(); g.lineWidth = 2; g.strokeStyle = C.jobLine; g.stroke();
      g.beginPath(); g.ellipse(0, 14, 70, 12, 0, 0.1, Math.PI - 0.1); g.lineWidth = 8; g.strokeStyle = '#f0cf7a'; g.stroke();
      g.restore();
      g.beginPath(); g.moveTo(150, 62);
      g.bezierCurveTo(176 + S.sway, 40, 204, 22, 226, 6);
      g.bezierCurveTo(222, 40, 190, 66, 158, 76);
      g.closePath(); g.fillStyle = lin(g, 0, 6, 0, 76, [[0, '#ffffff'], [1, '#e8dcc6']]); g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#8a7a5a'; g.stroke();
      g.strokeStyle = '#b8a888'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(156, 70); g.quadraticCurveTo(190, 50, 222, 12); g.stroke();
      break;
    }
    default: break;
  }
  void C;
}

// ---------- 顔まわりの演出 ----------
function drawFx(g, C, E, t, faceAge) {
  if (!E.fx) return;
  const k = Math.min(1, faceAge * 5);
  for (const f of E.fx) {
    if (f === 'sweat') {
      const y = 106 + Math.sin(t * 3) * 1.5;
      g.beginPath(); g.moveTo(184, y - 12); g.bezierCurveTo(194, y + 2, 194, y + 16, 184, y + 16); g.bezierCurveTo(174, y + 16, 174, y + 2, 184, y - 12); g.closePath();
      g.fillStyle = lin(g, 0, y - 12, 0, y + 16, [[0, '#cdeeff'], [1, '#6fc3ee']]); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#4aa8d8'; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(180, y + 7, 2.2, 4, 0.3, 0, TAU); g.fill();
    } else if (f === 'vein') {
      const s = 1 + 0.12 * Math.sin(t * 9);
      g.save(); g.translate(176, 92); g.scale(s, s); g.strokeStyle = '#e8353d'; g.lineWidth = 3.4; g.lineCap = 'round';
      for (const [sx, sy, a0] of [[1, 1, Math.PI], [-1, 1, Math.PI * 1.5], [1, -1, Math.PI * 0.5], [-1, -1, 0]]) { g.beginPath(); g.arc(sx * 6, sy * 6, 5.4, a0, a0 + Math.PI / 2); g.stroke(); }
      g.restore();
    } else if (f === 'tear') {
      for (const x of [EYE_X - 6, 240 - EYE_X + 6]) {
        const ph = (t * 0.8 + (x > 120 ? 0.4 : 0)) % 1;
        g.fillStyle = 'rgba(160,220,255,.7)'; g.beginPath(); g.moveTo(x - 2.5, EYE_Y + 14); g.lineTo(x + 2.5, EYE_Y + 14); g.lineTo(x + (x > 120 ? 3 : -3), 204); g.lineTo(x + (x > 120 ? -1 : 1), 204); g.closePath(); g.fill();
        const y = EYE_Y + 22 + ph * 40;
        g.beginPath(); g.moveTo(x, y - 6); g.bezierCurveTo(x + 5, y, x + 5, y + 7, x, y + 7); g.bezierCurveTo(x - 5, y + 7, x - 5, y, x, y - 6);
        g.fillStyle = `rgba(190,235,255,${1 - ph * 0.6})`; g.fill();
      }
    }
  }
  void C; void k;
}

function drawFloat(g, E, t, faceAge, top) {
  if (!E.fx) return;
  const k = Math.min(1, faceAge * 5);
  g.save();
  for (const f of E.fx) {
    if (f === 'hearts') {
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.7 + i / 3) % 1, x = 120 + (i - 1) * 46 + Math.sin(u * 6 + i * 2) * 8, y = top - u * 40;
        g.save(); g.translate(x, y); const s = 0.7 + 0.5 * Math.sin(u * Math.PI);
        g.beginPath(); g.moveTo(0, 12 * s); g.bezierCurveTo(-20 * s, 0, -12 * s, -14 * s, 0, -5 * s); g.bezierCurveTo(12 * s, -14 * s, 20 * s, 0, 0, 12 * s);
        g.fillStyle = `rgba(255,96,150,${Math.sin(u * Math.PI) * k})`; g.fill(); g.restore();
      }
    } else if (f === 'sparkle') {
      for (const [x, y, ph] of [[34, 100, 0], [208, 132, 1.7], [48, 40, 3.1]]) {
        const r = (0.55 + 0.45 * Math.abs(Math.sin(t * 4 + ph))) * 11 * k;
        g.fillStyle = '#fff6b0'; g.shadowColor = '#ffcf4a'; g.shadowBlur = 8;
        g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
      }
      g.shadowBlur = 0;
    } else if (f === 'zzz') {
      g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.45 + i / 3) % 1;
        g.save(); g.translate(176 + u * 34, top + 30 - u * 36); g.scale(0.7 + u * 0.9, 0.7 + u * 0.9);
        g.fillStyle = `rgba(214,230,255,${Math.sin(u * Math.PI) * k})`; g.strokeStyle = `rgba(60,80,140,${Math.sin(u * Math.PI) * k * 0.6})`; g.lineWidth = 2.4;
        g.strokeText('Z', 0, 0); g.fillText('Z', 0, 0); g.restore();
      }
    }
  }
  g.restore();
}

// ---------- 本体 ----------
/**
 * (x, y) を左上に、幅 w で描く(高さは w * 1.25)。
 * o: { face, faceAge, t, seed, gest, gestAge }
 */
export function drawPortrait(g, x, y, w, look, jobId, o = {}) {
  const job = jobById(jobId), C = palette(look, job);
  const t = o.t || 0, seed = o.seed || 0;
  const E = FACE_DEF[o.face] || FACE_DEF.normal;
  const faceAge = o.faceAge ?? 9;
  const blink = blinkAmount(t, seed);
  const gm = gestureMotion(o.gest, o.gestAge ?? 99);
  const st = Math.max(0, Math.min(4, look.hairStyle | 0));
  const S = {
    breath: Math.sin(t * 1.8 + seed * 5) * 1.4,
    sway: Math.sin(t * 1.6 + seed * 3) * 5 + gm.shake * 8,
  };
  const rot = Math.sin(t * 0.9 + seed * 4) * 0.012 + gm.shake * 0.14 + (o.face === 'sad' ? 0.03 : 0) + (o.face === 'shy' ? -0.04 : 0);
  const dy = gm.nod * 10 + (o.face === 'sad' ? 4 : 0);
  const pop = popScale(faceAge);

  g.save();
  g.translate(x, y); g.scale(w / PORTRAIT.w, w / PORTRAIT.w);
  const headT = () => { g.translate(120, 252); g.rotate(rot); g.scale(pop, pop); g.translate(-120, -252 + dy + S.breath * 0.5); };

  g.save(); headT(); hairBack(g, C, st, S.sway); g.restore();
  drawBody(g, C, job, S);
  g.save(); headT();
  drawFaceSkin(g, C, S);
  drawBlush(g, C, E.blush, E.fx && E.fx.includes('shy'));
  for (const s of [-1, 1]) {
    let kind = E.eye;
    if (kind === 'wink') kind = s === 1 ? 'arc' : 'open';
    drawEye(g, C, s, kind, E, blink, t);
  }
  drawNose(g, C);
  drawMouth(g, C, E.mouth, t);
  drawFaceGear(g, C, job);
  hairFront(g, C, st, S.sway);
  drawBrows(g, C, E);
  drawHeadGear(g, C, job, S);
  drawFx(g, C, E, t, faceAge);
  g.restore();
  g.save(); headT(); drawFloat(g, E, t, faceAge, job.id === 'mage' ? 24 : 46); g.restore();
  g.restore();
}
