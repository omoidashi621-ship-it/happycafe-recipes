// ドット絵のアバター。小さなバッファに部品を重ねて描き、陰影と輪郭を自動でつけてから整数倍に拡大して表示する。
// 座標(lx, ly)は足元の中心が原点で、ly は上がマイナス。足の裏は ly=-1 の行。左向きは右向きを反転して描く。
import { SKINS, HAIR_COLORS, OUTFITS, EYE_COLORS, FACES, blinkAmount, gestureMotion } from './avatar.js';
import { jobById } from './jobs.js';
import { shade } from './gfx.js';

const W = 44, H = 52, CX = 22, BASE = 48;
const FACE_IDS = FACES.map((f) => f.id);
const clampI = (v, a, b) => Math.max(a, Math.min(b, v));

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) { const n = parseInt(hex.slice(1), 16); v = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v); }
  return v;
}

// ---------- ドットのバッファ ----------
class Buf {
  constructor() { this.c = new Array(W * H).fill(null); this.p = new Int16Array(W * H).fill(-1); this.mode = []; }
  // 部品の登録。mode: 0=陰影なし 1=上下に陰影 2=上下と右にも陰影
  part(mode = 1) { this.mode.push(mode); return this.mode.length - 1; }
  idx(lx, ly) { const x = CX + lx, y = BASE + ly; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; }
  set(lx, ly, col, id) { const i = this.idx(lx, ly); if (i >= 0) { this.c[i] = col; this.p[i] = id; } }
  clear(lx, ly) { const i = this.idx(lx, ly); if (i >= 0) { this.c[i] = null; this.p[i] = -1; } }
  rect(lx, ly, w, h, col, id) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(lx + x, ly + y, col, id); }
  ell(cx, cy, rx, ry, col, id) {
    for (let ly = Math.floor(cy - ry); ly <= Math.ceil(cy + ry); ly++) {
      for (let lx = Math.floor(cx - rx); lx <= Math.ceil(cx + rx); lx++) {
        const dx = (lx + 0.5 - cx) / rx, dy = (ly + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(lx, ly, col, id);
      }
    }
  }
  pts(list, col, id) { for (const [x, y] of list) this.set(x, y, col, id); }
}

// 陰影と輪郭をつけて canvas にする
function finish(B) {
  const out = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, col = B.c[i];
      if (col == null) continue;
      const id = B.p[i], mode = B.mode[id];
      if (!mode) { out[i] = col; continue; }
      const up = y > 0 && B.p[i - W] === id, dn = y < H - 1 && B.p[i + W] === id, rt = x < W - 1 && B.p[i + 1] === id;
      let c = col;
      if (!dn && up) c = shade(col, -0.26);
      else if (!up && dn) c = shade(col, 0.24);
      else if (mode === 2 && up && dn && !rt) c = shade(col, -0.14);
      out[i] = c;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const im = g.createImageData(W, H), d = im.data;
  const put = (i, hex) => { const [r, gr, b] = rgb(hex); d[i * 4] = r; d[i * 4 + 1] = gr; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (out[i] != null) { put(i, out[i]); continue; }
      const nb = [y < H - 1 ? i + W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1].find((j) => j >= 0 && B.c[j] != null);
      if (nb != null) put(i, shade(B.c[nb], -0.62));
    }
  }
  g.putImageData(im, 0, 0);
  return cv;
}

// ---------- 色 ----------
function pal(look, job) {
  const skin = SKINS[look.skin] ?? SKINS[0], hair = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
  const outfit = OUTFITS[look.outfit] ?? OUTFITS[0], eye = EYE_COLORS[look.eyes] ?? EYE_COLORS[0];
  return {
    skin, skinDark: shade(skin, -0.2), hair, hairLight: shade(hair, 0.4), hairDark: shade(hair, -0.4),
    outfit, outfitDark: shade(outfit, -0.3), eye, eyeDark: shade(eye, -0.5), eyeLight: shade(eye, 0.5),
    job: job.color, jobDark: shade(job.color, -0.4), pants: '#3d3f52', boot: '#2b2833',
    lash: '#2a1d22', mouth: '#8a3d48', mouthIn: '#6a2030', tongue: '#f08a98', blush: '#ff9aa8',
    steel: '#c9d1dc', gold: '#f0cf7a', wood: '#8a5a2c',
  };
}

// ---------- 組み立て ----------
function build(look, jobId, dir, o) {
  const job = jobById(jobId), C = pal(look, job), B = new Buf();
  const mode = dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side';
  const step = o.step, by = step % 2 ? -1 : 0;
  const S = {
    B, C, job, mode, step, by, st: clampI(look.hairStyle | 0, 0, 4), face: o.face, blink: o.blink,
    hx: o.hx, hy: o.hy + by, tail: o.tail,
  };
  if (mode !== 'back') hairBack(S);
  if (job.id === 'knight') cape(S);
  if (job.id === 'bard') lute(S);
  if (mode === 'side') arm(S, true);
  legs(S);
  torso(S);
  if (mode === 'back') { if (job.id === 'knight') cape(S); if (job.id === 'bard') lute(S); }
  const hand = mode === 'side' ? arm(S, false) : (arm(S, 'L'), arm(S, 'R'));
  held(S, hand);
  head(S);
  return finish(B);
}

function legs(S) {
  const { B, C, mode, step } = S;
  const pant = B.part(1), boot = B.part(1);
  if (mode !== 'side') {
    for (const [x0, lf] of [[-4, step === 1 ? 2 : 0], [1, step === 3 ? 2 : 0]]) {
      B.rect(x0, -7 - lf, 3, 5, C.pants, pant);
      B.rect(x0, -2 - lf, 3, 2, C.boot, boot);
    }
  } else {
    const s = [0, 2, 0, -2][step];
    for (const [fs, lf, far] of [[-s, step === 3 ? 1 : 0, true], [s, step === 1 ? 1 : 0, false]]) {
      const p = far ? shade(C.pants, -0.25) : C.pants, b = far ? shade(C.boot, -0.2) : C.boot;
      B.rect(-1 + fs, -7 - lf, 3, 5, p, pant);
      B.rect(-1 + fs, -2 - lf, 3, 2, b, boot);
      B.set(2 + fs, -1 - lf, b, boot);
    }
  }
}

function torso(S) {
  const { B, C, job, mode, by } = S;
  const id = B.part(2), acc = B.part(0), side = mode === 'side', back = mode === 'back';
  const x0 = side ? -3 : -5, w = side ? 6 : 10;
  const robe = job.id === 'mage';
  B.rect(x0, -14 + by, w, 8, C.outfit, id);
  if (!side) { B.clear(x0, -14 + by); B.clear(x0 + w - 1, -14 + by); }
  if (robe) {
    B.rect(x0 - 1, -6, w + 2, 3, C.outfit, id);
    B.rect(x0 - 1, -3, w + 2, 1, C.gold, acc);
  }
  B.rect(x0, -8 + by, w, 1, C.jobDark, acc);
  switch (job.id) {
    case 'librarian':
      if (!back) {
        if (!side) { B.rect(-2, -14 + by, 4, 1, '#f6f2ea', acc); B.rect(-2, -13 + by, 4, 1, C.job, acc); B.rect(-1, -12 + by, 2, 1, '#f6f2ea', acc); }
        else { B.set(2, -14 + by, '#f6f2ea', acc); B.set(2, -13 + by, C.job, acc); }
      }
      break;
    case 'mage':
      B.rect(x0, -14 + by, w, 1, C.gold, acc);
      if (!back && !side) { B.set(-1, -10 + by, C.gold, acc); B.set(0, -10 + by, C.gold, acc); }
      B.set(side ? 1 : -3, -4, C.gold, acc);
      break;
    case 'knight': {
      const pl = side ? -2 : -3, pw = side ? 4 : 6;
      B.rect(pl, -13 + by, pw, 5, back ? '#a8b2c0' : C.steel, acc);
      if (!back) B.rect(side ? 0 : -1, -11 + by, 2, 2, C.job, acc);
      for (const sx of side ? [-3] : [-6, 5]) B.rect(sx, -14 + by, 1, 2, C.steel, acc);
      break;
    }
    case 'alchemist':
      if (!back) {
        const al = side ? -2 : -3, aw = side ? 4 : 6;
        B.rect(al, -13 + by, aw, 6, '#efe6d0', acc);
        if (!side) B.rect(-2, -10 + by, 4, 2, '#d9ccab', acc);
      } else B.pts([[-3, -13], [-2, -12], [-1, -11], [0, -11], [1, -12], [2, -13]].map(([x, y]) => [x, y + by]), '#d9ccab', acc);
      break;
    case 'bard':
      if (!back) B.pts([[-5, -14], [-4, -13], [-3, -12], [-2, -11], [-1, -10], [0, -9], [1, -8]].map(([x, y]) => [side ? x + 2 : x, y + by]), C.job, acc);
      B.rect(x0 + 1, -15 + by, w - 2, 1, C.job, acc);
      if (!back) B.pts([[x0 + w - 1, -14 + by], [x0 + w, -13 + by + (S.tail > 0 ? 1 : 0)], [x0 + w, -12 + by]], C.job, acc);
      break;
    default: break;
  }
}

// 腕。side のとき far=true で奥側の腕、false で手前の腕。front/back は 'L' / 'R'
function arm(S, which) {
  const { B, C, mode, step, by } = S;
  const id = B.part(1), hid = B.part(1);
  const mage = S.job.id === 'mage';
  if (mode === 'side') {
    const sw = [0, -1, 0, 1][step] * (which === true ? -1 : 1);
    const far = which === true;
    const x = (far ? -1 : -1) + sw + (far ? 0 : 0);
    const col = far ? C.outfitDark : C.outfit;
    B.rect(x, -13 + by, 2, 5, col, id);
    B.rect(x, -8 + by, 2, 1, far ? shade(C.skin, -0.15) : C.skin, hid);
    return { x, y: -8 + by };
  }
  const left = which === 'L';
  const dy = (left ? 1 : -1) * [0, -1, 0, 1][step];
  const x = left ? -7 : 5;
  B.rect(x, -13 + by + dy, 2, 5, C.outfit, id);
  if (mage) B.rect(x - (left ? 1 : 0), -9 + by + dy, 3, 1, C.outfitDark, id);
  B.rect(x, -8 + by + dy, 2, 1, C.skin, hid);
  return { x, y: -8 + by + dy };
}

function held(S, hand) {
  const { B, C, job, mode, by } = S;
  if (!hand || mode === 'back') return;
  const id = B.part(1), acc = B.part(0), hx = hand.x;
  switch (job.id) {
    case 'librarian':
      B.rect(hx + (mode === 'side' ? 1 : 2), -10 + by, 3, 4, C.job, id);
      B.rect(hx + (mode === 'side' ? 3 : 4), -10 + by, 1, 4, '#f6efd6', acc);
      B.set(hx + (mode === 'side' ? 1 : 2), -9 + by, C.gold, acc);
      break;
    case 'mage': {
      const x = hx + (mode === 'side' ? 2 : 3);
      B.rect(x, -39, 1, 38, C.wood, id);
      B.rect(x - 1, -41, 3, 3, '#d8c9ff', acc);
      B.set(x, -40, '#ffffff', acc);
      B.rect(x - 1, -38, 3, 1, C.gold, acc);
      break;
    }
    case 'knight': {
      const x = hx + (mode === 'side' ? 0 : 2);
      B.rect(x, -13 + by, 6, 7, C.steel, id);
      B.clear(x, -13 + by); B.clear(x + 5, -13 + by); B.clear(x, -7 + by); B.clear(x + 5, -7 + by);
      B.rect(x + 2, -11 + by, 2, 3, C.job, acc);
      break;
    }
    case 'alchemist': {
      const x = hx + (mode === 'side' ? 1 : 2);
      B.rect(x, -10 + by, 3, 3, '#5fd68a', id);
      B.rect(x + 1, -12 + by, 1, 2, '#cfeef7', acc);
      B.set(x, -10 + by, '#c9ffd9', acc);
      break;
    }
    default: break;
  }
}

function cape(S) {
  const { B, mode, by, step } = S;
  const id = B.part(1);
  const col = '#b23a48';
  if (mode === 'side') {
    const k = step % 2 ? 1 : 0;
    B.rect(-8 - k, -14 + by, 5, 9, col, id);
    B.rect(-9 - k, -7, 3, 3, col, id);
  } else {
    B.rect(-6, -14 + by, 12, 7, col, id);
    B.rect(-7, -7, 14, 4, col, id);
  }
}

function lute(S) {
  const { B, C, mode, by } = S;
  const id = B.part(1), acc = B.part(0);
  if (mode === 'back') {
    B.ell(0, -9.5 + by, 3.6, 4.6, '#c98a46', id);
    B.rect(0, -19 + by, 1, 6, C.wood, id);
    B.set(0, -10 + by, '#3a2210', acc); B.set(-1, -10 + by, '#3a2210', acc);
    B.rect(-1, -21 + by, 3, 2, '#4a2c12', acc);
  } else if (mode === 'front') {
    B.rect(7, -21 + by, 1, 7, C.wood, id);
    B.rect(7, -23 + by, 3, 2, '#4a2c12', acc);
  } else {
    B.ell(-6, -10 + by, 3, 4, '#c98a46', id);
    B.rect(-6, -20 + by, 1, 6, C.wood, id);
  }
}

// ---------- 髪 ----------
function hairBack(S) {
  const { B, C, mode, st, hx, hy, tail } = S;
  const id = B.part(1), rib = B.part(0);
  const R = (x, y, w, h, col = C.hair) => B.rect(x + hx, y + hy, w, h, col, id);
  const tailsFront = () => {
    for (const x0 of [-11, 8]) {
      R(x0, -26, 3, 6);
      R(x0 + tail, -20, 3, 4);
      R(x0 + tail * 2 + (x0 > 0 ? 1 : 0), -16, 2, 3);
      B.rect(x0 + hx, -26 + hy, 3, 1, C.job, rib);
    }
  };
  if (mode === 'front') {
    if (st === 1) R(-8, -24, 16, 15);
    if (st === 2) { B.ell(hx, -31.5 + hy, 3.6, 3.2, C.hair, id); B.rect(-2 + hx, -29 + hy, 4, 1, C.job, rib); }
    if (st === 3) tailsFront();
    if (st === 4) { R(7, -28, 3, 6); R(8 + tail, -22, 3, 6); R(8 + tail * 2, -16, 2, 4); B.rect(7 + hx, -28 + hy, 3, 1, C.job, rib); }
  } else if (mode === 'side') {
    if (st === 1) R(-10, -23, 7, 14);
    if (st === 2) { B.ell(-3 + hx, -31.5 + hy, 3.6, 3.2, C.hair, id); B.rect(-5 + hx, -29 + hy, 4, 1, C.job, rib); }
    if (st === 3) { R(-11 + tail, -26, 3, 6); R(-12 + tail * 2, -20, 3, 5); R(-12 + tail * 3, -15, 2, 3); B.rect(-11 + tail + hx, -26 + hy, 3, 1, C.job, rib); }
    if (st === 4) { R(-11, -28, 3, 6); R(-12 + tail, -22, 3, 6); R(-12 + tail * 2, -16, 2, 4); B.rect(-11 + hx, -28 + hy, 3, 1, C.job, rib); }
  }
}

// 前髪の下端(列 -6..5)。行は上がマイナス
const FRINGE = [
  [-24, -25, -24, -24, -25, -24, -24, -25, -24, -24, -25, -24],
  [-22, -23, -24, -25, -26, -26, -26, -26, -25, -24, -23, -22],
  [-24, -24, -25, -24, -24, -25, -25, -24, -24, -25, -24, -24],
  [-24, -25, -24, -24, -25, -24, -24, -25, -24, -24, -25, -24],
  [-26, -26, -25, -25, -24, -24, -24, -24, -23, -23, -23, -24],
];
const SIDE_ROW = [-18, -10, -19, -19, -19];

function hairCap(S, bottom, cxs = 0) {
  const { B, C, hx, hy } = S, id = S.hairId;
  const cy = -21.5, rx = 8.3, ry = 8;
  for (let lx = -10; lx <= 9; lx++) {
    const dx = (lx + 0.5 - cxs) / rx;
    if (Math.abs(dx) > 1) continue;
    const top = Math.ceil(cy - ry * Math.sqrt(1 - dx * dx) - 0.5), bot = bottom(lx);
    for (let ly = top; ly <= bot; ly++) B.set(lx + hx, ly + hy, C.hair, id);
  }
}

function head(S) {
  const { B, C, mode, st, hx, hy } = S;
  const skin = B.part(2);
  S.hairId = B.part(2);
  B.ell(hx, -21 + hy, 7, 6.5, C.skin, skin);

  if (mode === 'front') {
    const fr = FRINGE[st], sr = SIDE_ROW[st];
    hairCap(S, (lx) => (lx <= -7 || lx >= 6 ? sr : fr[lx + 6]));
    hairShine(S, -3);
    faceFront(S);
    gearFront(S);
  } else if (mode === 'side') {
    const sr = st === 1 ? -9 : -16, fr = [-25, -24, -24, -25, -24, -24];
    hairCap(S, (lx) => (lx <= -2 ? sr : lx <= 1 ? -20 : fr[Math.min(5, lx - 2)]), -1);
    B.pts([[-2, -19], [-1, -19], [-2, -18]].map(([x, y]) => [x + hx, y + hy]), C.skinDark, skin);
    hairShine(S, -4);
    faceSide(S);
    gearSide(S);
  } else {
    hairCap(S, (lx) => (lx <= -7 || lx >= 6 ? -19 : lx <= -6 || lx >= 5 ? -17 : -16), 0);
    hairShine(S, -3);
    gearBack(S);
  }
}

function hairShine(S, x) {
  const { B, C, hx, hy } = S;
  B.pts([[x, -27], [x + 1, -27], [x + 2, -28]].map(([a, b]) => [a + hx, b + hy]), C.hairLight, B.part(0));
}

// ---------- 顔 ----------
const EYE_KIND = {
  normal: 'open', smile: 'open', laugh: 'arc', angry: 'angry', sad: 'sad', surprise: 'wide', wink: 'wink', love: 'heart', sleepy: 'shut', shy: 'open',
};

// 目の 1 つ分。lx は左端の列、top は上端の行
function eyePx(S, kind, lx, top, right) {
  const { B, C, hx, hy } = S, id = B.part(0);
  const P = (x, y, col) => B.set(x + hx, y + hy, col, id);
  switch (kind) {
    case 'open': case 'angry': case 'sad':
      P(lx, top, C.lash); P(lx + 1, top, C.lash);
      P(lx, top + 1, '#ffffff'); P(lx + 1, top + 1, C.eyeDark);
      P(lx, top + 2, C.eye); P(lx + 1, top + 2, C.eyeLight);
      if (kind === 'angry') P(right ? lx + 1 : lx, top - 1, C.lash);
      if (kind === 'sad') P(right ? lx : lx + 1, top - 1, C.lash);
      break;
    case 'wide':
      P(lx, top - 1, '#ffffff'); P(lx + 1, top - 1, '#ffffff');
      P(lx, top, C.lash); P(lx + 1, top, C.lash);
      P(lx, top + 1, '#ffffff'); P(lx + 1, top + 1, C.eyeDark);
      P(lx, top + 2, C.eye); P(lx + 1, top + 2, C.eyeLight);
      break;
    case 'shut':
      P(lx, top + 1, C.lash); P(lx + 1, top + 1, C.lash);
      break;
    case 'arc': {
      const x = right ? lx - 1 : lx - 1;
      P(x, top + 2, C.lash); P(x + 1, top + 1, C.lash); P(x + 2, top + 2, C.lash);
      break;
    }
    case 'heart': {
      const x = right ? lx - 1 : lx - 1;
      B.pts([[x, top], [x + 2, top], [x, top + 1], [x + 1, top + 1], [x + 2, top + 1], [x + 1, top + 2]].map(([a, b]) => [a + hx, b + hy]), '#ff4f86', id);
      P(x, top, '#ffd0e0');
      break;
    }
    default: break;
  }
}

function faceFront(S) {
  const { B, C, face, blink, hx, hy } = S, id = B.part(0);
  const P = (x, y, col) => B.set(x + hx, y + hy, col, id);
  const kind = EYE_KIND[face] || 'open';
  const shutIf = (k) => (blink && (k === 'open' || k === 'angry' || k === 'sad' || k === 'wide') ? 'shut' : k);
  const top = -21;
  if (kind === 'wink') { eyePx(S, shutIf('open'), -5, top, false); eyePx(S, 'arc', 3, top, true); }
  else { eyePx(S, shutIf(kind), -5, top, false); eyePx(S, shutIf(kind), 3, top, true); }

  // まゆ(怒り・悲しみ・驚きで目立たせる)
  const brow = C.lash;
  if (face === 'angry') B.pts([[-6, -24], [-5, -23], [-4, -22], [5, -24], [4, -23], [3, -22]].map(([x, y]) => [x + hx, y + hy]), brow, id);
  if (face === 'sad') B.pts([[-6, -22], [-5, -23], [-4, -24], [5, -22], [4, -23], [3, -24]].map(([x, y]) => [x + hx, y + hy]), brow, id);
  if (face === 'shy') B.pts([[-6, -22], [-5, -23], [3, -23], [4, -22]].map(([x, y]) => [x + hx, y + hy]), brow, id);

  // ほほ
  const bl = face === 'shy' || face === 'love' ? 2 : face === 'angry' || face === 'surprise' ? 0 : 1;
  if (bl >= 1) { P(-7, -18, C.blush); P(-6, -18, C.blush); P(5, -18, C.blush); P(4, -18, C.blush); }
  if (bl >= 2) { P(-7, -17, C.blush); P(-6, -17, C.blush); P(5, -17, C.blush); P(4, -17, C.blush); }

  // 口
  const m = C.mouth;
  switch (face) {
    case 'smile': case 'wink': B.pts([[-2, -18], [-1, -17], [0, -17], [1, -18]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'love': B.pts([[-2, -18], [-1, -17], [0, -17], [1, -18]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'laugh':
      B.rect(-2 + hx, -18 + hy, 4, 1, C.mouthIn, id); B.rect(-1 + hx, -17 + hy, 2, 1, C.tongue, id); break;
    case 'angry': case 'sad': B.pts([[-2, -16], [-1, -17], [0, -17], [1, -16]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'surprise': B.rect(-1 + hx, -18 + hy, 2, 2, C.mouthIn, id); break;
    case 'shy': B.pts([[-2, -17], [-1, -16], [0, -17], [1, -16]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'sleepy': P(0, -17, m); break;
    default: P(-1, -17, m); P(0, -17, m); break;
  }

  // 涙・汗・怒りマーク
  if (face === 'sad') { P(-5, -18, '#8fd8ff'); P(-5, -17, '#8fd8ff'); P(4, -18, '#8fd8ff'); }
  if (face === 'surprise' || face === 'shy') { P(7, -24, '#8fd8ff'); P(7, -23, '#8fd8ff'); P(7, -22, '#cfeeff'); }
  if (face === 'angry') B.pts([[5, -27], [6, -26], [4, -26], [5, -25], [6, -27], [4, -27]].map(([x, y]) => [x + hx, y + hy]), '#e8353d', B.part(0));
}

function faceSide(S) {
  const { B, C, face, blink, hx, hy } = S, id = B.part(0);
  const P = (x, y, col) => B.set(x + hx, y + hy, col, id);
  const kind = EYE_KIND[face] || 'open';
  const k = blink && kind !== 'arc' && kind !== 'heart' && kind !== 'shut' ? 'shut' : kind === 'wink' ? 'open' : kind;
  eyePx(S, k, 1, -21, true);
  // 奥の目(細い)
  if (k === 'arc' || k === 'shut') P(5, -20, C.lash);
  else if (k === 'heart') P(5, -20, '#ff4f86');
  else { P(5, -21, C.lash); P(5, -20, C.eyeDark); P(5, -19, C.eye); }
  P(7, -19, C.skin);            // はな
  if (face !== 'angry' && face !== 'surprise') { P(-1, -18, C.blush); P(0, -18, C.blush); }
  const m = C.mouth;
  switch (face) {
    case 'laugh': B.rect(3 + hx, -18 + hy, 3, 1, C.mouthIn, id); B.rect(4 + hx, -17 + hy, 2, 1, C.tongue, id); break;
    case 'surprise': B.rect(4 + hx, -18 + hy, 2, 2, C.mouthIn, id); break;
    case 'angry': case 'sad': B.pts([[3, -16], [4, -17], [5, -17]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'smile': case 'wink': case 'love': B.pts([[3, -18], [4, -17], [5, -17], [6, -18]].map(([x, y]) => [x + hx, y + hy]), m, id); break;
    case 'sleepy': P(5, -17, m); break;
    default: P(4, -17, m); P(5, -17, m); break;
  }
  if (face === 'sad') P(1, -18, '#8fd8ff');
  if (face === 'angry') B.pts([[-1, -27], [0, -26], [-2, -26], [-1, -25]].map(([x, y]) => [x + hx, y + hy]), '#e8353d', B.part(0));
}

// ---------- 帽子・小物 ----------
function gearFront(S) { gear(S, 'front'); }
function gearSide(S) { gear(S, 'side'); }
function gearBack(S) { gear(S, 'back'); }

function gear(S, mode) {
  const { B, C, job, hx, hy } = S;
  const id = B.part(1), acc = B.part(0);
  const R = (x, y, w, h, col, pid = id) => B.rect(x + hx, y + hy, w, h, col, pid);
  const P = (x, y, col, pid = acc) => B.set(x + hx, y + hy, col, pid);
  const ox = mode === 'side' ? -1 : 0;
  switch (job.id) {
    case 'librarian':
      if (mode === 'back') break;
      if (mode === 'front') {
        for (const x0 of [-6, 2]) {
          R(x0, -22, 4, 1, '#6b7d96', acc); R(x0, -18, 4, 1, '#6b7d96', acc);
          R(x0, -21, 1, 3, '#6b7d96', acc); R(x0 + 3, -21, 1, 3, '#6b7d96', acc);
        }
        R(-2, -21, 4, 1, '#6b7d96', acc);
      } else {
        R(0, -22, 4, 1, '#6b7d96', acc); R(0, -18, 4, 1, '#6b7d96', acc);
        R(0, -21, 1, 3, '#6b7d96', acc); R(3, -21, 1, 3, '#6b7d96', acc);
        R(-3, -21, 3, 1, '#6b7d96', acc);
      }
      break;
    case 'mage': {
      R(-11 + ox, -31, 22, 1, shade(C.job, -0.1), id);
      R(-10 + ox, -30, 20, 1, C.job, id);
      R(-8 + ox, -32, 16, 1, C.job, id);
      for (let i = 0; i < 10; i++) {
        const w = Math.max(2, 10 - i), x0 = -Math.floor(w / 2) + ox + (i > 5 ? i - 5 : 0);
        R(x0, -33 - i, w, 1, C.job, id);
      }
      R(-5 + ox, -33, 10, 1, C.gold, acc);
      P(-1 + ox, -37, '#fff3b8');
      break;
    }
    case 'knight':
      R(-8 + ox, -27, 16, 1, C.steel, id);
      R(-1 + ox, -27, 2, 1, C.job, acc);
      if (mode !== 'side') {
        for (const s of [-1, 1]) { P(s * 9 + (s > 0 ? -1 : 0), -27, '#ffffff'); P(s * 10 + (s > 0 ? -1 : 0), -28, '#ffffff'); P(s * 11 + (s > 0 ? -1 : 0), -29, '#ffffff'); P(s * 10 + (s > 0 ? -1 : 0), -27, '#dfe6ee'); }
      } else {
        P(-9, -27, '#ffffff'); P(-10, -28, '#ffffff'); P(-11, -29, '#ffffff'); P(-10, -27, '#dfe6ee');
      }
      break;
    case 'alchemist':
      R(-8 + ox, -26, 16, 1, '#6b4a2c', acc);
      if (mode === 'front') for (const x0 of [-6, 3]) { R(x0, -28, 3, 3, '#c9983f', id); P(x0 + 1, -27, '#8fe3ff'); }
      else if (mode === 'side') { R(1, -28, 3, 3, '#c9983f', id); P(2, -27, '#8fe3ff'); }
      else R(-1, -28, 2, 3, '#c9983f', id);
      break;
    case 'bard':
      B.ell(-1 + hx + ox, -29 + hy, 8.5, 2.8, C.job, id);
      for (let i = 0; i < 9; i++) { const fx = 3 + Math.floor(i * 0.7) + ox; P(fx, -31 - i, '#fff6e0', acc); if (i > 1 && i < 8) P(fx + 1, -31 - i, '#e4d8b8', acc); }
      P(4 + ox, -31, '#f0cf7a');
      break;
    default: break;
  }
}

// ---------- 描画 ----------
const cache = new Map();
function sprite(look, jobId, dir, o) {
  const key = [look.skin, look.hair, look.outfit, look.eyes, look.hairStyle, jobId, dir, o.step, o.face, o.blink ? 1 : 0, o.hx, o.hy, o.tail].join('|');
  let s = cache.get(key);
  if (!s) {
    if (cache.size > 600) cache.clear();
    s = build(look, jobId, dir, o);
    cache.set(key, s);
  }
  return s;
}

/** 頭の上までの高さ(ドット数)。吹き出しなどの位置合わせ用 */
export function pixelTop(look, jobId) {
  if (jobId === 'mage') return 43;
  if (jobId === 'bard') return 40;
  return (look.hairStyle | 0) === 2 ? 35 : 31;
}

/**
 * (sx, sy) は足元の中心(画面座標)。k は 1 ドットの大きさ(画面の px)。
 * o: { dir, phase, amt, t, face, faceAge, seed, gest, gestAge, dpr }
 */
export function drawPixelAvatar(ctx, sx, sy, k, look, jobId, o = {}) {
  const dir = o.dir || 'down', t = o.t || 0, amt = o.amt || 0, seed = o.seed || 0;
  const dpr = o.dpr || 1, snap = (v) => Math.round(v * dpr) / dpr;
  const moving = amt > 0.35;
  const step = moving ? Math.floor((o.phase || 0) / (Math.PI / 2)) % 4 : 0;
  const face = FACE_IDS.includes(o.face) ? o.face : 'normal';
  const faceAge = o.faceAge ?? 9;
  const gm = gestureMotion(o.gest, o.gestAge ?? 99);
  let hx = Math.round(gm.shake * 1.3), hy = Math.round(gm.nod * 1.4);
  if (face === 'sad') hy += 1;
  if (face === 'laugh' && Math.floor(t * 9) % 2) hy -= 1;
  if (!moving && Math.sin(t * 2.2 + seed * 6) > 0.72) hy += 1;
  const tail = moving ? [0, 1, 0, -1][step] : Math.round(Math.sin(t * 2 + seed * 5) * 0.8);
  const blink = blinkAmount(t, seed) > 0.45;
  const spr = sprite(look, jobId, dir, { step, face, blink, hx, hy: clampI(hy, -1, 2), tail });

  const jump = face === 'surprise' && faceAge < 0.3 ? Math.sin((faceAge / 0.3) * Math.PI) * 3 * k : 0;
  const ox = snap(sx), oy = snap(sy - BASE * k - jump);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(ox, snap(sy), 7 * k, 2 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = false;
  if (dir === 'left') { ctx.translate(ox, 0); ctx.scale(-1, 1); ctx.drawImage(spr, -CX * k, oy, W * k, H * k); }
  else ctx.drawImage(spr, ox - CX * k, oy, W * k, H * k);
  ctx.restore();
  drawPixelFx(ctx, ox, oy + (BASE - pixelTop(look, jobId)) * k, k, face, t, faceAge);
}

const HEART = ['01010', '11111', '11111', '01110', '00100'];
const SPARK = ['010', '111', '010'];
const ZZZ = ['111', '001', '010', '100', '111'];

function pat(ctx, rows, x, y, k, color) {
  ctx.fillStyle = color;
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '1') ctx.fillRect(Math.round(x + i * k), Math.round(y + j * k), Math.ceil(k), Math.ceil(k)); });
}

// 頭の上にただようドットの演出(ハート・きらきら・Zzz)
function drawPixelFx(ctx, cx, topY, k, face, t, faceAge) {
  const a = Math.min(1, faceAge * 4);
  ctx.save();
  if (face === 'love') {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI) * a;
      pat(ctx, HEART, cx + (i - 1) * 7 * k - 2.5 * k + Math.sin(u * 6 + i) * k, topY - 3 * k - u * 10 * k, k, '#ff5c8a');
    }
  } else if (face === 'laugh' || face === 'wink') {
    for (const [dx, dy, ph] of [[-12, 6, 0], [11, 3, 1.7]]) {
      ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(t * 4 + ph))) * a;
      pat(ctx, SPARK, cx + dx * k, topY + dy * k, k, '#fff6b0');
    }
  } else if (face === 'sleepy') {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.45 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(u * Math.PI) * a;
      pat(ctx, ZZZ, cx + 6 * k + u * 8 * k, topY + 2 * k - u * 9 * k, k * (0.6 + u * 0.5), '#d6e6ff');
    }
  }
  ctx.restore();
}
