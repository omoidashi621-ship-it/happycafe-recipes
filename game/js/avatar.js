// アバター描画。ベクターで滑らかに描き、表情・まばたき・歩行・呼吸のアニメーションを持つ。
// 座標は足元の中心が原点(0,0)、上がマイナス。身長は約100。左向きは右向きを左右反転して描く。
import { jobById } from './jobs.js';
import { shade, strand } from './gfx.js';

export const SKINS = ['#fde3cf', '#f6cba6', '#dba679', '#a56f4a'];
export const HAIR_COLORS = ['#3a2a20', '#8a5530', '#e2bc62', '#d2506e', '#5b82e0', '#eef1f5', '#4cbf94'];
export const OUTFITS = ['#4a78c2', '#c24f48', '#46a46c', '#8f60c2', '#dcaa40', '#555b68'];
export const EYE_COLORS = ['#7a4a2a', '#3f84dd', '#3fae72', '#9460c8', '#d85a62', '#2f3340', '#d9a53a'];
export const HAIR_STYLES = ['ショート', 'ロング', 'おだんご', 'ツイン', 'ポニー'];

export const FACES = [
  { id: 'normal', label: '通常', icon: '😐' },
  { id: 'smile', label: 'にっこり', icon: '😊' },
  { id: 'laugh', label: '大笑い', icon: '😆' },
  { id: 'angry', label: '怒り', icon: '😠' },
  { id: 'sad', label: '悲しい', icon: '😢' },
  { id: 'surprise', label: '驚き', icon: '😲' },
  { id: 'wink', label: 'ウィンク', icon: '😉' },
  { id: 'love', label: 'ハート', icon: '😍' },
  { id: 'sleepy', label: 'ねむい', icon: '😴' },
  { id: 'shy', label: '照れ', icon: '😳' },
];

export const defaultLook = () => ({ skin: 0, hairStyle: 0, hair: 0, outfit: 0, eyes: 0 });

// チャットの文面から表情を推測する(なければ null)
export function faceFromText(text) {
  const rules = [
    ['love', /[♡❤♥💕]|好き|だいすき|愛してる/],
    ['angry', /怒|むかつ|ムカ|ふざけ|ぷんぷん|💢/],
    ['sad', /悲し|かなし|泣|ぐすん|しょんぼり|涙|うぅ|;;|T_T/],
    ['laugh', /笑|[wｗ]{2,}|草|あはは|ははは|うける|😆|😂/],
    ['shy', /照れ|てれ|はずかし|恥ず|えへへ|\/\/\//],
    ['sleepy', /ねむ|眠|zzz|おやすみ|すやすや/i],
    ['wink', /ウィンク|☆|★|\(\^_-\)|;\)/],
    ['smile', /ありがと|よろしく|こんにちは|こんばんは|おはよう|嬉し|うれし|楽し|たのし|やった|いいね|♪|\^\^|:\)/],
    ['surprise', /[!！]{2,}|[?？]{2,}|えっ|びっくり|驚|うそ|まじか/],
    ['smile', /[!！]$/],
  ];
  for (const [id, re] of rules) if (re.test(text)) return id;
  return null;
}

// 頭の上端(吹き出しの位置合わせ用)
export const headTopOf = (jobId) => ({ mage: 138, bard: 130, alchemist: 110 }[jobId] || 106);

// ---------- 色 ----------
const palCache = new Map();
function palette(look, job) {
  const key = `${look.skin}|${look.hair}|${look.outfit}|${look.eyes}|${job.id}`;
  let C = palCache.get(key);
  if (C) return C;
  const skin = SKINS[look.skin] ?? SKINS[0];
  const hair = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
  const outfit = OUTFITS[look.outfit] ?? OUTFITS[0];
  C = {
    skin, skinLight: shade(skin, 0.4), skinLine: shade(skin, -0.45),
    hair, hairLight: shade(hair, 0.4), hairDark: shade(hair, -0.3), hairLine: shade(hair, -0.6),
    outfit, outfitLight: shade(outfit, 0.3), outfitDark: shade(outfit, -0.3), outfitLine: shade(outfit, -0.58),
    eye: EYE_COLORS[look.eyes] ?? EYE_COLORS[0], lash: '#2a1d22',
    job: job.color, jobDark: shade(job.color, -0.35), jobLine: shade(job.color, -0.62),
    pants: '#3d3f52', pantsLine: '#22232e', boot: '#3a3340', bootLine: '#1b171f',
  };
  palCache.set(key, C);
  return C;
}

// ---------- 表情の定義 ----------
// eye: 目の種類 / open: まぶたの開き / tilt: まぶたの傾き(+怒り -悲しみ) / iris: 瞳の大きさ
// brow: [上下, 角度(+で内側が下がる)] / mouth: 口 / blush: 頬の赤み / look: 視線 / fx: 演出
const FACE_DEF = {
  normal: { eye: 'open', open: 1, tilt: 0, iris: 1, brow: [0, 0], mouth: 'smile', blush: 0.3 },
  smile: { eye: 'open', open: 0.88, tilt: -0.05, iris: 1.05, brow: [-1.2, -0.08], mouth: 'grin', blush: 0.55 },
  laugh: { eye: 'arc', brow: [-2.6, -0.12], mouth: 'laugh', blush: 0.8, fx: ['sparkle'] },
  angry: { eye: 'open', open: 0.84, tilt: 0.62, iris: 0.92, brow: [1.6, 0.55], mouth: 'frown', blush: 0, fx: ['vein'] },
  sad: { eye: 'open', open: 1, tilt: -0.5, iris: 1.12, brow: [-1, -0.5], mouth: 'frown', blush: 0.1, look: [0, 1], fx: ['tear'] },
  surprise: { eye: 'open', open: 1, tilt: 0, iris: 0.66, brow: [-4.4, -0.04], mouth: 'o', blush: 0.1, fx: ['sweat'] },
  wink: { eye: 'wink', open: 1, tilt: 0, iris: 1, brow: [-1.4, -0.06], mouth: 'grin', blush: 0.5, fx: ['sparkle'] },
  love: { eye: 'heart', brow: [-1.8, -0.1], mouth: 'smile', blush: 1, fx: ['hearts'] },
  sleepy: { eye: 'open', open: 0.3, tilt: 0.05, iris: 1, brow: [1.5, 0.06], mouth: 'flat', blush: 0.2, fx: ['zzz'] },
  shy: { eye: 'open', open: 0.85, tilt: -0.25, iris: 0.95, brow: [-0.6, -0.32], mouth: 'wavy', blush: 1, look: [-2, 1.4], fx: ['sweat', 'shy'] },
};

const TAU = Math.PI * 2;

// ---------- 小さな描画部品 ----------
function limb(g, x1, y1, x2, y2, w, fill, line) {
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.lineWidth = w + 2.2; g.strokeStyle = line; g.stroke();
  g.lineWidth = w; g.strokeStyle = fill; g.stroke();
}

function paint(g, fill, line, lw = 1.2) {
  g.fillStyle = fill; g.fill();
  if (line) { g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = line; g.stroke(); }
}

function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
}

function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  g.closePath();
}

function starPath(g, cx, cy, r) {
  g.beginPath();
  g.moveTo(cx, cy - r);
  g.quadraticCurveTo(cx, cy, cx + r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy + r);
  g.quadraticCurveTo(cx, cy, cx - r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy - r);
  g.closePath();
}

function dropPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy - s);
  g.bezierCurveTo(cx + s * 0.8, cy - s * 0.1, cx + s * 0.8, cy + s * 0.9, cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 0.8, cy + s * 0.9, cx - s * 0.8, cy - s * 0.1, cx, cy - s);
  g.closePath();
}

function smoothThrough(g, pts) {
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  g.lineTo(l[0], l[1]);
}

function bow(g, x, y, color, line, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 0); g.quadraticCurveTo(-6, -6, -8, -1); g.quadraticCurveTo(-6, 5, 0, 0);
  g.moveTo(0, 0); g.quadraticCurveTo(6, -6, 8, -1); g.quadraticCurveTo(6, 5, 0, 0);
  paint(g, color, line, 1);
  g.beginPath(); g.arc(0, 0, 2, 0, TAU); paint(g, color, line, 1);
  g.restore();
}

// ---------- 姿勢(歩き) ----------
function pose(mode, ph, amt, bodyY) {
  const s = Math.sin(ph) * amt, c = Math.cos(ph) * amt;
  if (mode === 'side') {
    return {
      bodyY,
      legs: [
        { hx: 1, fx: -s * 9, lift: Math.max(0, -c) * 4.5, far: true },
        { hx: 1, fx: s * 9, lift: Math.max(0, c) * 4.5 },
      ],
      arms: [{ sx: 0.5, sy: -46, th: s * 0.75 + 0.07, far: true }, { sx: 0.5, sy: -46, th: -s * 0.75 + 0.07 }],
    };
  }
  return {
    bodyY,
    legs: [
      { hx: -5.6, fx: -5.6, lift: Math.max(0, s) * 5.5 },
      { hx: 5.6, fx: 5.6, lift: Math.max(0, -s) * 5.5 },
    ],
    arms: [{ sx: -12.3, sy: -45.5, th: -0.15 + s * 0.12 }, { sx: 12.3, sy: -45.5, th: 0.15 + s * 0.12 }],
  };
}

// ---------- 本体 ----------
/**
 * o: { dir, phase(歩きの位相), amt(歩きの強さ0..1), t(時間・秒), face, faceAge(表情が変わってからの秒), seed(0..1), scale }
 */
export function drawAvatar(g, x, y, look, jobId, o = {}) {
  const dir = o.dir || 'down';
  const mode = dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side';
  const t = o.t || 0, amt = o.amt || 0, ph = o.phase || 0, seed = o.seed || 0;
  const job = jobById(jobId), C = palette(look, job);
  const F = FACE_DEF[o.face] || FACE_DEF.normal;
  const faceAge = o.faceAge ?? 9;
  const bodyY = -2.4 * amt * (1 - Math.abs(Math.sin(ph)));
  const cyc = (t + seed * 7) % 3.7;
  const S = {
    g, C, job, mode, F, t, ph, amt, seed, look,
    style: Math.max(0, Math.min(4, look.hairStyle | 0)),
    P: pose(mode, ph, amt, bodyY),
    T: mode === 'side' ? 0.68 : 0,
    breathe: Math.sin(t * 2.3 + seed * 6) * (1 - amt),
    sway: Math.sin(t * 2.1 + seed * 5) * 1.3 + Math.sin(ph * 2) * 2.4 * amt,
    blink: cyc < 0.16 ? Math.sin((cyc / 0.16) * Math.PI) : 0,
    pop: 1 + Math.max(0, 0.11 * Math.exp(-faceAge * 7) * Math.cos(faceAge * 20)),
    faceAge,
  };

  g.save();
  g.translate(x, y);
  const sc = o.scale || 1;
  g.scale(sc, sc);

  g.fillStyle = 'rgba(0,0,0,.26)';
  g.beginPath(); g.ellipse(0, 1, 17, 5.2, 0, 0, TAU); g.fill();

  g.save();
  if (dir === 'left') g.scale(-1, 1);
  g.lineJoin = 'round';

  if (mode !== 'back') {
    drawHairBack(S);
    if (job.id === 'knight') drawCape(S);
    if (job.id === 'bard') drawLute(S);
  }
  if (mode === 'side') drawArm(S, S.P.arms[0]);
  drawLegs(S);
  drawTorso(S);
  if (mode === 'back') {
    if (job.id === 'knight') drawCape(S);
    if (job.id === 'bard') drawLute(S);
  }
  const hands = [];
  if (mode === 'side') hands.push(drawArm(S, S.P.arms[1]));
  else for (const a of S.P.arms) hands.push(drawArm(S, a));
  drawHeld(S, hands[hands.length - 1]);
  drawHeadGroup(S);
  g.restore();

  drawFloatFx(S);
  g.restore();
}

// ---------- 脚・胴・腕 ----------
function drawLegs(S) {
  const { g, C, P, mode } = S;
  for (const L of P.legs) {
    const hy = -26 + P.bodyY, fy = -L.lift, toe = mode === 'side' ? 2.4 : 0;
    const pant = L.far ? shade(C.pants, -0.22) : C.pants;
    const boot = L.far ? shade(C.boot, -0.2) : C.boot;
    limb(g, L.hx, hy, L.fx, fy - 9, 8.2, pant, C.pantsLine);
    limb(g, L.fx, fy - 6, L.fx + toe, fy - 4.6, 8.8, boot, C.bootLine);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.ellipse(L.fx + toe - 1.2, fy - 6.4, 2.2, 1, 0, 0, TAU); g.fill();
  }
}

function drawArm(S, a) {
  const { g, C, job, P } = S;
  const sx = a.sx, sy = a.sy + P.bodyY, len = 18.5;
  const hx = sx + Math.sin(a.th) * len, hy = sy + Math.cos(a.th) * len;
  const w = job.id === 'mage' ? 8.6 : 7.2;
  const col = a.far ? shade(C.outfit, -0.2) : C.outfit;
  limb(g, sx, sy, hx, hy - 3, w, col, C.outfitLine);
  g.fillStyle = a.far ? shade(C.job, -0.2) : C.job;
  g.beginPath(); g.ellipse(hx, hy - 4.2, w / 2 + 0.6, 1.6, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(hx, hy, 3.7, 0, TAU);
  paint(g, a.far ? shade(C.skin, -0.12) : C.skin, C.skinLine, 1);
  return { x: hx, y: hy };
}

function torsoPath(g, X, Y) {
  g.beginPath();
  g.moveTo(X(-9.5), Y(-24));
  g.quadraticCurveTo(X(-13), Y(-34), X(-12.5), Y(-45));
  g.quadraticCurveTo(X(-12), Y(-50.5), X(-6), Y(-50.5));
  g.lineTo(X(6), Y(-50.5));
  g.quadraticCurveTo(X(12), Y(-50.5), X(12.5), Y(-45));
  g.quadraticCurveTo(X(13), Y(-34), X(9.5), Y(-24));
  g.closePath();
}

function robePath(g, X, Y, sw) {
  g.beginPath();
  g.moveTo(X(-12.5), Y(-45));
  g.quadraticCurveTo(X(-12), Y(-50.5), X(-6), Y(-50.5));
  g.lineTo(X(6), Y(-50.5));
  g.quadraticCurveTo(X(12), Y(-50.5), X(12.5), Y(-45));
  g.bezierCurveTo(X(14), Y(-34), X(17), Y(-20), X(19 + sw), Y(-8));
  g.quadraticCurveTo(X(10 + sw), Y(-4), X(sw), Y(-6.5));
  g.quadraticCurveTo(X(-10 + sw), Y(-4), X(-19 + sw), Y(-8));
  g.bezierCurveTo(X(-17), Y(-20), X(-14), Y(-34), X(-12.5), Y(-45));
  g.closePath();
}

function drawTorso(S) {
  const { g, C, job, mode, P } = S;
  const tw = mode === 'side' ? 0.62 : 1;
  const X = (v) => v * tw, Y = (v) => v + P.bodyY;
  const robe = job.id === 'mage';
  const front = mode === 'front', back = mode === 'back';

  if (robe) robePath(g, X, Y, S.sway * 0.8); else torsoPath(g, X, Y);
  paint(g, vgrad(g, Y(-50), Y(robe ? -6 : -24), [[0, C.outfitLight], [0.5, C.outfit], [1, C.outfitDark]]), C.outfitLine, 1.3);

  switch (job.id) {
    case 'librarian': {
      if (front) {
        g.beginPath(); g.moveTo(-5.5, Y(-50.5)); g.lineTo(0, Y(-39)); g.lineTo(5.5, Y(-50.5)); g.closePath();
        paint(g, '#f6f2ea', C.outfitLine, 1);
        g.fillStyle = '#e8c872';
        for (const yy of [-35, -30]) { g.beginPath(); g.arc(0, Y(yy), 1.2, 0, TAU); g.fill(); }
      }
      if (!back) bow(g, mode === 'side' ? 4 : 0, Y(-47.5), C.job, C.jobLine, 0.9);
      break;
    }
    case 'mage': {
      const sw = S.sway * 0.8;
      g.strokeStyle = '#f0cf7a'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X(-17.2 + sw), Y(-11)); g.quadraticCurveTo(X(sw), Y(-8), X(17.2 + sw), Y(-11)); g.stroke();
      if (front) { g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, Y(-49)); g.lineTo(0, Y(-9)); g.stroke(); }
      g.beginPath(); g.moveTo(X(-12.6), Y(-32)); g.lineTo(X(12.6), Y(-32)); g.lineTo(X(12.9), Y(-28)); g.lineTo(X(-12.9), Y(-28)); g.closePath();
      paint(g, C.job, C.jobLine, 1);
      if (!back) {
        g.fillStyle = 'rgba(255,224,130,.9)';
        starPath(g, X(-7), Y(-18), 2.6); g.fill();
        starPath(g, X(8), Y(-15), 2); g.fill();
      }
      break;
    }
    case 'knight': {
      if (!back) {
        g.beginPath();
        g.moveTo(X(-9.5), Y(-48.5)); g.lineTo(X(9.5), Y(-48.5)); g.lineTo(X(8.2), Y(-31)); g.quadraticCurveTo(0, Y(-26), X(-8.2), Y(-31)); g.closePath();
        paint(g, vgrad(g, Y(-48), Y(-27), [[0, '#f1f4f8'], [1, '#8d97a8']]), '#4b5361', 1.2);
        g.beginPath(); g.arc(X(0), Y(-39), 3.2, 0, TAU); paint(g, C.job, '#7a5a1c', 1.1);
      } else {
        g.beginPath(); g.moveTo(X(-9.5), Y(-48.5)); g.lineTo(X(9.5), Y(-48.5)); g.lineTo(X(8.2), Y(-31)); g.quadraticCurveTo(0, Y(-26), X(-8.2), Y(-31)); g.closePath();
        paint(g, vgrad(g, Y(-48), Y(-27), [[0, '#d9dfe8'], [1, '#7a8494']]), '#4b5361', 1.2);
      }
      g.beginPath(); g.rect(X(-11.5), Y(-27.5), X(23), 3.4); paint(g, '#6b4a2c', '#33220f', 1);
      if (front) { g.beginPath(); g.rect(-2.6, Y(-28), 5.2, 4.4); paint(g, '#e8c872', '#7a5a1c', 1); }
      for (const sd of [-1, 1]) {
        if (mode === 'side' && sd === -1) continue;
        g.beginPath(); g.arc(X(sd * 13.4), Y(-46), mode === 'side' ? 5.8 : 6.6, 0, TAU);
        paint(g, vgrad(g, Y(-52), Y(-40), [[0, '#f1f4f8'], [1, '#8d97a8']]), '#4b5361', 1.2);
      }
      break;
    }
    case 'alchemist': {
      if (!back) {
        g.beginPath(); g.moveTo(X(-8), Y(-50)); g.lineTo(X(8), Y(-50)); g.lineTo(X(10.8), Y(-18)); g.lineTo(X(-10.8), Y(-18)); g.closePath();
        paint(g, vgrad(g, Y(-50), Y(-18), [[0, '#fbf3df'], [1, '#d9ccab']]), '#7a6a44', 1.1);
        if (front) {
          g.beginPath(); g.rect(-5.2, Y(-33), 10.4, 7); paint(g, '#efe4c8', '#7a6a44', 1);
          g.fillStyle = '#c9983f';
          for (const sx of [-6.4, 6.4]) { g.beginPath(); g.arc(sx, Y(-46.5), 1.3, 0, TAU); g.fill(); }
        }
      } else {
        g.strokeStyle = '#d9ccab'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-7, Y(-48)); g.lineTo(7, Y(-30)); g.moveTo(7, Y(-48)); g.lineTo(-7, Y(-30)); g.stroke();
        bow(g, 0, Y(-28), '#d9ccab', '#7a6a44', 0.9);
      }
      g.beginPath(); g.rect(X(-11), Y(-26.5), X(22), 2.6); paint(g, '#6b4a2c', '#33220f', 1);
      break;
    }
    case 'bard': {
      if (!back) {
        g.beginPath();
        g.moveTo(X(-11), Y(-49)); g.lineTo(X(-5.5), Y(-49)); g.lineTo(X(11), Y(-27)); g.lineTo(X(5.5), Y(-25)); g.closePath();
        paint(g, C.job, C.jobLine, 1);
      }
      g.beginPath(); g.ellipse(0, Y(-50.5), X(8.8), 3.4, 0, 0, TAU);
      paint(g, vgrad(g, Y(-54), Y(-47), [[0, shade(C.job, 0.25)], [1, C.job]]), C.jobLine, 1.1);
      if (!back) {
        g.beginPath();
        g.moveTo(X(4), Y(-50)); g.quadraticCurveTo(X(10 + S.sway), Y(-44), X(9 + S.sway * 1.6), Y(-34));
        g.lineTo(X(5.5 + S.sway * 1.6), Y(-35)); g.quadraticCurveTo(X(6), Y(-43), X(1), Y(-48.5)); g.closePath();
        paint(g, C.job, C.jobLine, 1);
      }
      break;
    }
  }
}

function drawCape(S) {
  const { g, mode, P, sway, amt } = S;
  const tw = mode === 'side' ? 0.62 : 1;
  const bk = mode === 'side' ? -(4 + amt * 7) : 0;
  const X = (v, w = 0) => v * tw + bk * w, Y = (v) => v + P.bodyY * 0.5;
  g.beginPath();
  g.moveTo(X(-11), Y(-48));
  g.lineTo(X(11), Y(-48));
  g.bezierCurveTo(X(15, 0.3), Y(-34), X(19, 0.8), Y(-22), X(18 + sway, 1), Y(-9));
  g.quadraticCurveTo(X(9 + sway, 1), Y(-5), X(sway, 1), Y(-8));
  g.quadraticCurveTo(X(-9 + sway, 1), Y(-4), X(-18 + sway, 1), Y(-9));
  g.bezierCurveTo(X(-19, 0.8), Y(-22), X(-15, 0.3), Y(-34), X(-11), Y(-48));
  g.closePath();
  paint(g, vgrad(g, Y(-48), Y(-6), [[0, '#d24a58'], [1, '#8a2433']]), '#5a1620', 1.3);
}

function drawLute(S) {
  const { g, mode, P } = S;
  const by = P.bodyY;
  g.save();
  if (mode === 'back') {
    g.translate(0, by - 36); g.rotate(0.35);
    g.fillStyle = '#7a4a22'; g.fillRect(-1.8, -34, 3.6, 24);
    g.fillStyle = '#4a2c12'; g.fillRect(-4, -38, 8, 5);
    g.beginPath(); g.ellipse(0, 0, 11.5, 14.5, 0, 0, TAU);
    paint(g, vgrad(g, -14, 14, [[0, '#d99a52'], [1, '#a8672c']]), '#5a3515', 1.3);
    g.beginPath(); g.arc(0, 0, 3.8, 0, TAU); g.fillStyle = '#3a2210'; g.fill();
  } else {
    const sd = mode === 'side' ? -1 : 1;
    g.translate(sd * (mode === 'side' ? 5 : 14), by - 56); g.rotate(sd * 0.55);
    g.fillStyle = '#7a4a22'; g.fillRect(-1.8, -24, 3.6, 22);
    g.fillStyle = '#4a2c12'; g.fillRect(-4, -28, 8, 5);
    if (mode === 'side') {
      g.beginPath(); g.ellipse(0, 4, 9, 11, 0, 0, TAU);
      paint(g, '#c98a46', '#5a3515', 1.2);
    }
  }
  g.restore();
}

function drawHeld(S, hand) {
  const { g, C, job, t, mode } = S;
  if (!hand) return;
  const hx = hand.x, hy = hand.y;
  g.save();
  switch (job.id) {
    case 'librarian': {
      g.translate(hx + (mode === 'side' ? 3 : 1), hy - 2); g.rotate(mode === 'side' ? 0.1 : -0.12);
      g.beginPath(); g.rect(-5, -7, 10, 14);
      paint(g, vgrad(g, -7, 7, [[0, shade(C.job, 0.2)], [1, C.jobDark]]), C.jobLine, 1.1);
      g.fillStyle = '#f6efd6'; g.fillRect(4.2, -6, 1.6, 12);
      g.fillStyle = '#e8c872'; g.fillRect(-3.4, -4, 5.8, 1.6); g.fillRect(-3.4, -1, 4, 1.2);
      break;
    }
    case 'mage': {
      const lean = mode === 'side' ? 0.08 : 0.04;
      g.translate(hx + 1.5, hy + 6); g.rotate(lean);
      g.lineCap = 'round';
      g.strokeStyle = '#4a2c12'; g.lineWidth = 5.4; g.beginPath(); g.moveTo(0, 16); g.lineTo(0, -108); g.stroke();
      g.strokeStyle = '#a8672c'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(0, 16); g.lineTo(0, -108); g.stroke();
      g.strokeStyle = '#f0cf7a'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-4.6, -110); g.quadraticCurveTo(0, -101, 4.6, -110); g.stroke();
      const pulse = 0.75 + 0.25 * Math.sin(t * 3.2);
      const gl = g.createRadialGradient(0, -116, 1, 0, -116, 16);
      gl.addColorStop(0, `rgba(190,170,255,${0.65 * pulse})`); gl.addColorStop(1, 'rgba(190,170,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(0, -116, 16, 0, TAU); g.fill();
      g.beginPath(); g.arc(0, -116, 5.6, 0, TAU);
      paint(g, vgrad(g, -122, -110, [[0, '#f1ebff'], [1, '#8b6fe0']]), '#4a3a8a', 1.1);
      break;
    }
    case 'knight': {
      g.translate(hx + (mode === 'side' ? 3 : 7), hy - 4);
      g.beginPath(); g.arc(0, 0, 10.5, 0, TAU);
      paint(g, vgrad(g, -10, 10, [[0, '#f1f4f8'], [1, '#8d97a8']]), '#4b5361', 1.4);
      g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.lineWidth = 1.2; g.strokeStyle = '#c9983f'; g.stroke();
      starPath(g, 0, 0, 5); paint(g, C.job, '#7a5a1c', 1);
      break;
    }
    case 'alchemist': {
      g.translate(hx + 1.5, hy - 5);
      g.beginPath(); g.arc(0, 1, 5.8, 0, TAU);
      paint(g, 'rgba(210,245,255,.55)', '#4a7a8a', 1.2);
      g.save(); g.beginPath(); g.arc(0, 1, 5.8, 0, TAU); g.clip();
      g.fillStyle = vgrad(g, -3, 7, [[0, '#9cf0b4'], [1, '#2fb86a']]); g.fillRect(-7, -1.5 + Math.sin(t * 4) * 0.5, 14, 9);
      g.restore();
      g.beginPath(); g.rect(-2.2, -9, 4.4, 5); paint(g, 'rgba(210,245,255,.6)', '#4a7a8a', 1.1);
      g.fillStyle = '#8b5a2b'; g.fillRect(-2.6, -10.6, 5.2, 2.2);
      const b1 = (t * 1.3) % 1, b2 = (t * 1.3 + 0.5) % 1;
      g.fillStyle = `rgba(160,255,190,${1 - b1})`; g.beginPath(); g.arc(-1 + Math.sin(t * 5) * 1.2, -10 - b1 * 9, 1.5, 0, TAU); g.fill();
      g.fillStyle = `rgba(160,255,190,${1 - b2})`; g.beginPath(); g.arc(1.4, -10 - b2 * 9, 1.1, 0, TAU); g.fill();
      break;
    }
    default: break;
  }
  g.restore();
  g.beginPath(); g.arc(hx, hy, 3.7, 0, TAU);
  paint(g, C.skin, C.skinLine, 1);
}

// ---------- 頭 ----------
function headPath(g) {
  g.beginPath();
  g.moveTo(-22.5, -76);
  g.bezierCurveTo(-22.5, -104, 22.5, -104, 22.5, -76);
  g.bezierCurveTo(22.5, -62, 11, -51, 0, -51);
  g.bezierCurveTo(-11, -51, -22.5, -62, -22.5, -76);
  g.closePath();
}

function drawHeadGroup(S) {
  const { g, C, mode, P } = S;
  g.save();
  g.translate(0, P.bodyY + S.breathe * 0.6);
  g.translate(0, -52); g.scale(S.pop, S.pop); g.translate(0, 52);

  // 首
  g.beginPath(); g.rect(-3.8, -57, 7.6, 9);
  paint(g, vgrad(g, -57, -48, [[0, C.skin], [1, shade(C.skin, -0.18)]]), C.skinLine, 1);

  if (mode === 'front') {
    headPath(g);
    const gr = g.createRadialGradient(-5, -80, 3, 0, -72, 32);
    gr.addColorStop(0, C.skinLight); gr.addColorStop(1, C.skin);
    paint(g, gr, C.skinLine, 1.3);
    g.save(); headPath(g); g.clip();
    g.fillStyle = vgrad(g, -92, -72, [[0, 'rgba(120,60,40,.3)'], [1, 'rgba(120,60,40,0)']]);
    g.fillRect(-25, -92, 50, 22);
    g.restore();
    drawFace(S);
    drawFaceGear(S);
    drawHairFront(S);
    drawBrows(S);
  } else if (mode === 'side') {
    drawSideHead(S);
    drawFace(S);
    drawFaceGear(S);
    drawSideFringe(S);
    drawBrows(S);
  } else {
    drawHairBackView(S);
  }
  drawHeadGear(S);
  g.restore();
}

// ---------- 顔 ----------
const FACE_R = 20.5, EYE_PHI = 0.47, EYE_Y = -68;
const px = (T, phi) => FACE_R * Math.sin(T + phi);
const ps = (T, phi) => Math.max(0.34, Math.cos(T + phi));
const vis = (T, phi) => Math.abs(T + phi) < 1.42;

function drawFace(S) {
  const { g, C, T, F, t } = S;
  const sideLook = S.mode === 'side' ? 1.3 : 0;
  const idle = Math.sin(t * 0.8 + S.seed * 9) * 0.35;
  const lk = [(F.look ? F.look[0] : 0) + sideLook + idle, F.look ? F.look[1] : 0];

  // 頬
  for (const s of [-1, 1]) {
    const phi = s * 0.88;
    if (!vis(T, phi)) continue;
    drawBlush(g, px(T, phi), EYE_Y + 5.6, ps(T, phi), F.blush, F.fx && F.fx.includes('shy'));
  }

  // 目
  for (const s of [-1, 1]) {
    const phi = s * EYE_PHI;
    if (!vis(T, phi)) continue;
    let kind = F.eye;
    if (kind === 'wink') kind = s === 1 ? 'arc' : 'open';
    drawEye(g, C, px(T, phi), EYE_Y, ps(T, phi), kind, F, -s, S.blink, lk, t);
  }

  // 涙
  if (F.fx && F.fx.includes('tear')) {
    for (const s of [-1, 1]) {
      const phi = s * EYE_PHI;
      if (!vis(T, phi)) continue;
      const x = px(T, phi) + s * 1.5 * ps(T, phi);
      const ph = (t * 0.9 + (s + 1) * 0.3) % 1;
      g.fillStyle = 'rgba(140,215,255,.75)';
      g.beginPath(); g.moveTo(x - 1.4, EYE_Y + 6); g.lineTo(x + 1.4, EYE_Y + 6); g.lineTo(x + 0.8 * s, -53); g.lineTo(x - 0.8 * s, -53); g.closePath(); g.fill();
      dropPath(g, x, EYE_Y + 8 + ph * 12, 2.2);
      g.fillStyle = `rgba(160,225,255,${1 - ph * 0.7})`; g.fill();
    }
  }

  // 口
  drawMouth(g, px(T, 0) + (T ? 1.2 : 0), -57.3, ps(T, 0), F.mouth);

  // 鼻(横向きのとき少しだけ)
  if (T > 0.3) {
    g.strokeStyle = shade(C.skin, -0.28); g.lineWidth = 1.2; g.lineCap = 'round';
    const nx = px(T, 0) + 7;
    g.beginPath(); g.moveTo(nx, -66); g.quadraticCurveTo(nx + 2.6, -63.5, nx + 0.4, -62); g.stroke();
  }

  // 汗
  if (F.fx && F.fx.includes('sweat')) {
    const ph = (t * 0.7) % 1;
    const x = T ? 16 : 19.5, y = -86 + Math.sin(t * 3) * 0.8 + ph * 2;
    dropPath(g, x, y, 3.6);
    g.fillStyle = '#8ed8ff'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#4aa8d8'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(x - 1.2, y + 0.4, 0.9, 0, TAU); g.fill();
  }

  // 怒りマーク
  if (F.fx && F.fx.includes('vein')) {
    const k = 1 + 0.12 * Math.sin(t * 9), cx = T ? 11 : 15.5, cy = -92;
    g.save(); g.translate(cx, cy); g.scale(k, k);
    g.strokeStyle = '#e8353d'; g.lineWidth = 2; g.lineCap = 'round';
    for (const [sx, sy, a0] of [[1, 1, Math.PI], [-1, 1, Math.PI * 1.5], [1, -1, Math.PI * 0.5], [-1, -1, 0]]) {
      g.beginPath(); g.arc(sx * 3.8, sy * 3.8, 3.4, a0, a0 + Math.PI / 2); g.stroke();
    }
    g.restore();
  }
}

function drawBlush(g, x, y, sx, a, lines) {
  if (a <= 0.01) return;
  g.save(); g.translate(x, y); g.scale(sx, 1);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 6.8);
  gr.addColorStop(0, `rgba(255,92,118,${0.55 * a})`); gr.addColorStop(1, 'rgba(255,92,118,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 6.8, 4.2, 0, 0, TAU); g.fill();
  if (lines) {
    g.strokeStyle = 'rgba(235,70,100,.75)'; g.lineWidth = 0.9; g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 2.6 - 1, 2.4); g.lineTo(i * 2.6 + 1, -2.2); g.stroke(); }
  }
  g.restore();
}

function drawEye(g, C, x, y, sx, kind, F, inner, blink, look, t) {
  g.save(); g.translate(x, y); g.scale(sx, 1);
  const rx = 5.3, ry = 6.5;
  if (kind === 'arc') {
    g.strokeStyle = C.lash; g.lineWidth = 2.3; g.lineCap = 'round';
    g.beginPath(); g.arc(0, 2.8, 5.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.moveTo(-inner * 5.4, -1.6); g.lineTo(-inner * 7.4, -3.4); g.lineWidth = 1.4; g.stroke();
  } else if (kind === 'heart') {
    const s = 5.2 * (1 + 0.08 * Math.sin(t * 8));
    heartPath(g, 0, 0.4, s);
    paint(g, vgrad(g, -5, 6, [[0, '#ff8fb0'], [1, '#e8305f']]), '#9a1f45', 1);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(-2.2, -1.8, 1.3, 0, TAU); g.fill();
  } else {
    const open = Math.max(0.05, F.open * (1 - blink));
    const ir = F.iris ?? 1;
    g.save();
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.clip();
    g.fillStyle = '#fff'; g.fillRect(-rx, -ry, rx * 2, ry * 2);
    const gr = g.createLinearGradient(0, -ry, 0, ry);
    gr.addColorStop(0, shade(C.eye, -0.4)); gr.addColorStop(0.55, C.eye); gr.addColorStop(1, shade(C.eye, 0.5));
    g.fillStyle = gr;
    const ix = look[0], iy = look[1];
    g.beginPath(); g.ellipse(ix, iy + 0.5, rx * 0.9 * ir, ry * 0.97 * ir, 0, 0, TAU); g.fill();
    g.fillStyle = '#17121c';
    g.beginPath(); g.ellipse(ix, iy + 0.2, rx * 0.42 * ir, ry * 0.5 * ir, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.96)';
    g.beginPath(); g.arc(ix - 1.9 * ir, iy - 2.7 * ir, 1.95, 0, TAU); g.fill();
    g.beginPath(); g.arc(ix + 1.9 * ir, iy + 2.5 * ir, 1, 0, TAU); g.fill();
    // まぶた(肌色で上から覆う)
    const cover = (1 - open) * ry * 2, tl = F.tilt || 0;
    if (cover > 0.05 || Math.abs(tl) > 0.02) {
      const yl = -ry + cover - tl * inner * (rx + 1), yr = -ry + cover + tl * inner * (rx + 1);
      g.fillStyle = C.skin;
      g.beginPath(); g.moveTo(-rx - 1, -ry - 3); g.lineTo(rx + 1, -ry - 3); g.lineTo(rx + 1, yr); g.lineTo(-rx - 1, yl); g.closePath(); g.fill();
      g.strokeStyle = C.lash; g.lineWidth = 2.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-rx - 1, yl); g.quadraticCurveTo(0, (yl + yr) / 2 + 1.2, rx + 1, yr); g.stroke();
    }
    g.restore();
    // 上まつげと下の輪郭
    g.strokeStyle = C.lash; g.lineWidth = 2; g.lineCap = 'round';
    if (blink < 0.5 && cover < ry * 0.9) {
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-inner * rx * 0.95, -ry * 0.38); g.lineTo(-inner * (rx + 2.6), -ry * 0.82); g.stroke();
    }
    g.strokeStyle = 'rgba(70,40,40,.3)'; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
  }
  g.restore();
}

function drawBrows(S) {
  const { g, C, T, F } = S;
  const [lift, ang] = F.brow;
  for (const s of [-1, 1]) {
    const phi = s * EYE_PHI;
    if (!vis(T, phi)) continue;
    g.save();
    g.translate(px(T, phi), -78.6 + lift); g.scale(ps(T, phi), 1); g.rotate(ang * -s);
    g.strokeStyle = C.hairDark; g.lineWidth = 1.9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4.8, 0.7); g.quadraticCurveTo(0, -1.5, 4.8, 0.7); g.stroke();
    g.restore();
  }
}

function drawMouth(g, x, y, sx, kind) {
  g.save(); g.translate(x, y); g.scale(sx, 1);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = '#8a3d48', dark = '#7a2a3a', edge = '#5a1f2c';
  switch (kind) {
    case 'smile':
      g.strokeStyle = line; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-3.4, -0.2); g.quadraticCurveTo(0, 2.8, 3.4, -0.2); g.stroke();
      break;
    case 'grin':
      g.beginPath(); g.moveTo(-4.8, -1); g.quadraticCurveTo(0, 0.5, 4.8, -1); g.quadraticCurveTo(3.8, 6.6, 0, 6.6); g.quadraticCurveTo(-3.8, 6.6, -4.8, -1); g.closePath();
      g.save(); g.clip(); g.fillStyle = dark; g.fillRect(-6, -2, 12, 10);
      g.fillStyle = '#f58a9a'; g.beginPath(); g.ellipse(0, 5.8, 3.2, 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-5, -2, 10, 2.4);
      g.restore();
      g.strokeStyle = edge; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4.8, -1); g.quadraticCurveTo(0, 0.5, 4.8, -1); g.quadraticCurveTo(3.8, 6.6, 0, 6.6); g.quadraticCurveTo(-3.8, 6.6, -4.8, -1); g.stroke();
      break;
    case 'laugh':
      g.beginPath(); g.moveTo(-7, -1.8); g.quadraticCurveTo(0, 0.8, 7, -1.8); g.bezierCurveTo(6.4, 6.5, 3.4, 11, 0, 11); g.bezierCurveTo(-3.4, 11, -6.4, 6.5, -7, -1.8); g.closePath();
      g.save(); g.clip(); g.fillStyle = dark; g.fillRect(-8, -3, 16, 16);
      g.fillStyle = '#f58a9a'; g.beginPath(); g.ellipse(0, 9, 4.6, 3.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-8, -3, 16, 3.8);
      g.restore();
      g.strokeStyle = edge; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-7, -1.8); g.quadraticCurveTo(0, 0.8, 7, -1.8); g.bezierCurveTo(6.4, 6.5, 3.4, 11, 0, 11); g.bezierCurveTo(-3.4, 11, -6.4, 6.5, -7, -1.8); g.stroke();
      break;
    case 'frown':
      g.strokeStyle = line; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-3.2, 2.2); g.quadraticCurveTo(0, -1.6, 3.2, 2.2); g.stroke();
      break;
    case 'o':
      g.beginPath(); g.ellipse(0, 2, 2.8, 3.7, 0, 0, TAU);
      paint(g, dark, edge, 1.2);
      g.fillStyle = '#f58a9a'; g.beginPath(); g.ellipse(0, 3.6, 1.6, 1.1, 0, 0, TAU); g.fill();
      break;
    case 'wavy':
      g.strokeStyle = line; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-4.4, 0.6); g.quadraticCurveTo(-3, -1.8, -1.5, 0.4); g.quadraticCurveTo(0, 2.6, 1.5, 0.4); g.quadraticCurveTo(3, -1.8, 4.4, 0.6); g.stroke();
      break;
    case 'flat':
      g.beginPath(); g.ellipse(0, 1.6, 1.8, 2.3, 0, 0, TAU);
      paint(g, dark, edge, 1);
      break;
  }
  g.restore();
}

// ---------- 髪 ----------
const hairGrad = (g, C) => vgrad(g, -102, -60, [[0, C.hairLight], [0.45, C.hair], [1, C.hairDark]]);

const FRINGES = [
  [[19.8, -71], [17, -80], [13.5, -73], [10, -84], [6, -76], [2, -85.5], [-2.5, -76.5], [-7, -85], [-11, -75], [-15, -82], [-18, -72], [-19.8, -70]],
  [[19.8, -67], [18, -75], [14.5, -79.5], [9, -84], [4, -87.5], [0, -89], [-4, -87.5], [-9, -84], [-14.5, -79.5], [-18, -75], [-19.8, -67]],
  [[19.8, -72], [16, -79.5], [12.5, -76], [8, -80.5], [4, -77], [0, -81], [-4, -77], [-8, -80.5], [-12.5, -76], [-16, -79.5], [-19.8, -72]],
  [[19.8, -71], [16, -81], [12, -74], [8, -84], [3, -76.5], [-2, -85], [-6, -76.5], [-11, -83], [-14, -74.5], [-18, -80], [-19.8, -70]],
  [[19.8, -77], [15, -83.5], [9, -86], [2, -85], [-5, -81], [-11, -76], [-15, -70], [-19.8, -66]],
];
const SIDE_Y = [-63, -56, -62, -61, -63];

function drawHairFront(S) {
  const { g, C, style } = S;
  const fringe = FRINGES[style], sy = SIDE_Y[style];
  g.beginPath();
  g.moveTo(-23.2, sy);
  g.lineTo(-25.3, -76);
  g.ellipse(0, -77, 25.4, 25, 0, Math.PI, Math.PI * 2);
  g.lineTo(23.2, sy);
  g.lineTo(19.8, sy + 1.5);
  g.lineTo(fringe[0][0], fringe[0][1]);
  smoothThrough(g, fringe);
  g.lineTo(-19.8, sy + 1.5);
  g.closePath();
  paint(g, hairGrad(g, C), C.hairLine, 1.3);
  hairShine(g, 0, -84, 16, 12);
  if (style === 1) {
    for (const s of [-1, 1]) {
      strand(g, [s * 23.5, -66], [s * 29, -52], [s * 20.5 + S.sway * 0.5 * s, -34], 8.5, 4);
      paint(g, vgrad(g, -66, -34, [[0, C.hair], [1, C.hairDark]]), C.hairLine, 1.2);
    }
  }
}

function hairShine(g, cx, cy, rx, ry) {
  g.save();
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
  g.restore();
}

function drawHairBack(S) {
  const { g, C, mode, style, sway } = S;
  const fill = () => paint(g, vgrad(g, -100, -30, [[0, C.hair], [1, C.hairDark]]), C.hairLine, 1.3);
  if (mode === 'front') {
    if (style === 1) {
      g.beginPath();
      g.moveTo(-24.5, -82);
      g.bezierCurveTo(-31, -66, -30, -44, -27 + sway, -29);
      g.quadraticCurveTo(-20 + sway, -24, -13 + sway, -29);
      g.quadraticCurveTo(-6 + sway, -25, sway, -29);
      g.quadraticCurveTo(6 + sway, -24, 13 + sway, -29);
      g.quadraticCurveTo(20 + sway, -25, 27 + sway, -29);
      g.bezierCurveTo(30, -44, 31, -66, 24.5, -82);
      g.closePath(); fill();
    } else if (style === 2) {
      bun(S, 0, -107);
    } else if (style === 3) {
      for (const s of [-1, 1]) {
        strand(g, [s * 21, -88], [s * 42, -82], [s * 33 + sway * s, -42], 13, 6); fill();
        bow(g, s * 22.5, -89, S.C.job, S.C.jobLine, 0.95);
      }
    } else if (style === 4) {
      strand(g, [8, -97], [46, -102], [35 + sway, -50], 13, 5); fill();
      scrunchie(S, 9, -96);
    }
  } else {
    if (style === 1) {
      g.beginPath();
      g.moveTo(-6, -96);
      g.bezierCurveTo(-31, -98, -35, -66, -30 + sway, -31);
      g.quadraticCurveTo(-22 + sway, -25, -14 + sway, -31);
      g.bezierCurveTo(-12, -48, -6, -64, -2, -70);
      g.closePath(); fill();
    } else if (style === 2) {
      bun(S, -6, -107);
    } else if (style === 3) {
      g.save(); g.globalAlpha = 0.9;
      strand(g, [-11, -94], [-38, -94], [-23 + sway * 0.7, -54], 12, 5); paint(g, C.hairDark, C.hairLine, 1.2);
      g.restore();
      strand(g, [-16, -91], [-46, -88], [-32 + sway, -50], 13, 6); fill();
      bow(g, -17, -91, C.job, C.jobLine, 0.95);
    } else if (style === 4) {
      strand(g, [-19, -95], [-54, -92], [-36 + sway, -56], 13, 5); fill();
      scrunchie(S, -19, -95);
    }
  }
}

function bun(S, x, y) {
  const { g, C } = S;
  g.beginPath(); g.arc(x, y, 9.6, 0, TAU);
  paint(g, vgrad(g, y - 10, y + 10, [[0, C.hairLight], [1, C.hairDark]]), C.hairLine, 1.3);
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.arc(x, y, 6, Math.PI * 1.15, Math.PI * 1.65); g.stroke();
  g.beginPath(); g.ellipse(x, y + 8.4, 8, 2.6, 0, 0, TAU); paint(g, C.job, C.jobLine, 1);
}

function scrunchie(S, x, y) {
  const { g, C } = S;
  g.beginPath(); g.ellipse(x, y, 5, 4, 0.6, 0, TAU); paint(g, C.job, C.jobLine, 1.1);
}

// 横向きの頭(髪のシルエット → 顔の肌)
const sideHairShape = (g) => { g.beginPath(); g.ellipse(-2.5, -77.5, 24, 25, 0, 0, TAU); };

function drawSideHead(S) {
  const { g, C } = S;
  const hg = hairGrad(g, C);
  // 輪郭線(二重描きで内側の線を消す)
  g.lineWidth = 2.6; g.strokeStyle = C.hairLine;
  headPath(g); g.stroke();
  sideHairShape(g); g.stroke();
  headPath(g); g.fillStyle = hg; g.fill();
  sideHairShape(g); g.fillStyle = hg; g.fill();

  // 顔
  const region = () => {
    g.beginPath();
    g.moveTo(40, -120); g.lineTo(21, -100);
    g.bezierCurveTo(14, -93, 8, -86, 4, -78);
    g.bezierCurveTo(1, -73, 0, -69, -2, -62);
    g.lineTo(-6, -52); g.lineTo(40, -45); g.closePath();
  };
  g.save(); headPath(g); g.clip(); region();
  const gr = g.createRadialGradient(8, -78, 3, 6, -70, 30);
  gr.addColorStop(0, C.skinLight); gr.addColorStop(1, C.skin);
  g.fillStyle = gr; g.fill();
  g.save(); region(); g.clip();
  headPath(g); g.lineWidth = 2.6; g.strokeStyle = C.skinLine; g.stroke();
  g.restore();
  g.restore();
  // 生え際の線
  g.save(); headPath(g); g.clip();
  g.strokeStyle = C.hairLine; g.lineWidth = 1.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(21, -100); g.bezierCurveTo(14, -93, 8, -86, 4, -78); g.bezierCurveTo(1, -73, 0, -69, -2, -62); g.stroke();
  g.restore();
  // 耳
  g.beginPath(); g.ellipse(-4.4, -66, 3, 4, 0.1, 0, TAU); paint(g, C.skin, C.skinLine, 1.1);
  g.strokeStyle = shade(C.skin, -0.25); g.lineWidth = 0.9;
  g.beginPath(); g.arc(-4.2, -66, 1.3, 0.4, Math.PI * 1.6); g.stroke();
  // 髪のつや
  hairShine(g, -3, -84, 15, 12);
}

function drawSideFringe(S) {
  const { g, C } = S;
  const outer = () => {
    g.moveTo(23.4, -80.5);
    g.quadraticCurveTo(22.8, -86.5, 18.3, -90);
    g.ellipse(-2.5, -77.5, 24, 25, 0, -0.5236, -1.9, true);
  };
  const tips = () => {
    g.quadraticCurveTo(5.2, -82, 6.2, -76);
    g.quadraticCurveTo(9.4, -76.6, 10.4, -81.4);
    g.quadraticCurveTo(13, -81, 14.6, -75.6);
    g.quadraticCurveTo(17.6, -77, 18.4, -82.6);
    g.quadraticCurveTo(21, -86, 23.4, -80.5);
  };
  g.beginPath(); outer(); g.lineTo(-4, -93); g.lineTo(1.4, -85.4); tips(); g.closePath();
  g.fillStyle = vgrad(g, -100, -75, [[0, C.hairLight], [0.5, C.hair], [1, C.hairDark]]); g.fill();
  g.lineWidth = 1.3; g.strokeStyle = C.hairLine; g.lineJoin = 'round';
  g.beginPath(); outer(); g.stroke();
  g.beginPath(); g.moveTo(1.4, -85.4); tips(); g.stroke();
}

function drawHairBackView(S) {
  const { g, C, style, sway } = S;
  const fill = () => paint(g, hairGrad(g, C), C.hairLine, 1.3);
  const back = () => paint(g, vgrad(g, -100, -30, [[0, C.hair], [1, C.hairDark]]), C.hairLine, 1.3);
  if (style === 1) {
    g.beginPath();
    g.moveTo(-24.5, -78);
    g.bezierCurveTo(-29, -66, -28, -50, -25.5 + sway, -38);
    g.quadraticCurveTo(-19 + sway, -33, -12.5 + sway, -38);
    g.quadraticCurveTo(-6 + sway, -34, sway, -38);
    g.quadraticCurveTo(6 + sway, -33, 12.5 + sway, -38);
    g.quadraticCurveTo(19 + sway, -34, 25.5 + sway, -38);
    g.bezierCurveTo(28, -50, 29, -66, 24.5, -78);
    g.closePath(); back();
  } else if (style === 3) {
    for (const s of [-1, 1]) {
      strand(g, [s * 21, -88], [s * 41, -84], [s * 31 + sway * s, -46], 13, 6); back();
    }
  } else if (style === 4) {
    strand(g, [0, -98], [6 + sway * 0.5, -78], [2 + sway, -38], 13, 5); back();
  }
  // 頭全体を覆う髪
  g.beginPath();
  g.moveTo(-23.5, -60);
  g.lineTo(-25.5, -76);
  g.ellipse(0, -77, 25.5, 25.2, 0, Math.PI, Math.PI * 2);
  g.lineTo(23.5, -60);
  g.quadraticCurveTo(0, -50, -23.5, -60);
  g.closePath(); fill();
  hairShine(g, 0, -84, 15, 12);
  if (style === 2) bun(S, 0, -107);
  if (style === 3) for (const s of [-1, 1]) bow(g, s * 22.5, -89, C.job, C.jobLine, 0.95);
  if (style === 4) scrunchie(S, 0, -97);
}

// ---------- 顔まわりの小物・帽子 ----------
function drawFaceGear(S) {
  if (S.job.id !== 'librarian') return;
  const { g, T } = S;
  const pts = [-1, 1].map((s) => ({ x: px(T, s * EYE_PHI), sx: Math.max(0.42, ps(T, s * EYE_PHI)) }));
  g.save();
  g.lineWidth = 1.5; g.strokeStyle = '#3a3040'; g.lineCap = 'round';
  for (const p of pts) {
    g.save(); g.translate(p.x, EYE_Y); g.scale(p.sx, 1);
    g.beginPath(); g.ellipse(0, 0, 7.5, 8, 0, 0, TAU);
    g.fillStyle = 'rgba(190,225,255,.15)'; g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(0, 0, 5.6, Math.PI * 1.15, Math.PI * 1.42); g.stroke();
    g.restore();
  }
  g.strokeStyle = '#3a3040'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(pts[0].x + 7.5 * pts[0].sx, EYE_Y - 1.5); g.quadraticCurveTo((pts[0].x + pts[1].x) / 2, EYE_Y - 4, pts[1].x - 7.5 * pts[1].sx, EYE_Y - 1.5); g.stroke();
  if (T > 0.3) { g.beginPath(); g.moveTo(pts[0].x - 7.5 * pts[0].sx, EYE_Y - 1); g.lineTo(-3, -69.5); g.stroke(); }
  g.restore();
}

function drawHeadGear(S) {
  const { g, C, job, mode, sway } = S;
  switch (job.id) {
    case 'mage': {
      const lean = mode === 'side' ? -5 : 0, tipX = 9 + lean - sway * 0.8;
      const hat = C.job, hatDark = shade(C.job, -0.28);
      g.beginPath(); g.ellipse(0, -91.5, 31, 7.4, 0, 0, TAU);
      paint(g, vgrad(g, -99, -84, [[0, hat], [1, hatDark]]), C.jobLine, 1.3);
      g.beginPath();
      g.moveTo(-18, -92);
      g.bezierCurveTo(-15, -108, -2 + lean, -120, tipX - 2, -132);
      g.quadraticCurveTo(tipX + 8, -135, tipX + 13, -127);
      g.bezierCurveTo(tipX + 8, -118, 17, -104, 18, -92);
      g.ellipse(0, -92, 18, 4.6, 0, 0, Math.PI);
      g.closePath();
      paint(g, vgrad(g, -134, -88, [[0, shade(hat, 0.25)], [1, hat]]), C.jobLine, 1.3);
      g.beginPath(); g.ellipse(0, -94.4, 17.6, 4.4, 0, 0.05, Math.PI - 0.05);
      g.lineWidth = 3.6; g.strokeStyle = '#f0cf7a'; g.stroke();
      g.fillStyle = '#fff3b8'; starPath(g, -3 + lean * 0.4, -107, 3.6); g.fill();
      break;
    }
    case 'knight': {
      g.beginPath(); g.moveTo(-23, -86); g.quadraticCurveTo(0, -80.5, 23, -86); g.lineTo(23, -90.4); g.quadraticCurveTo(0, -85, -23, -90.4); g.closePath();
      paint(g, vgrad(g, -91, -80, [[0, '#f1f4f8'], [1, '#8d97a8']]), '#4b5361', 1.2);
      g.beginPath(); g.arc(mode === 'side' ? 12 : 0, -86.6, 3, 0, TAU); paint(g, C.job, '#7a5a1c', 1);
      for (const s of mode === 'side' ? [-1] : [-1, 1]) {
        g.beginPath(); g.moveTo(s * 22, -88); g.quadraticCurveTo(s * 33, -92, s * 36, -102); g.quadraticCurveTo(s * 28, -98, s * 21, -93); g.closePath();
        paint(g, '#f6f8fb', '#4b5361', 1.1);
      }
      break;
    }
    case 'alchemist': {
      const lenses = mode === 'side' ? [6] : mode === 'back' ? [] : [-8.6, 8.6];
      g.beginPath(); g.moveTo(-23, -88); g.quadraticCurveTo(0, -80, 23, -88); g.lineTo(23, -92.6); g.quadraticCurveTo(0, -85, -23, -92.6); g.closePath();
      paint(g, '#6b4a2c', '#33220f', 1.1);
      for (const lx of lenses) {
        g.beginPath(); g.arc(lx, -93.5, 7.4, 0, TAU);
        paint(g, vgrad(g, -101, -86, [[0, '#e0b457'], [1, '#a8782c']]), '#5a3d12', 1.2);
        g.beginPath(); g.arc(lx, -93.5, 5.2, 0, TAU);
        paint(g, vgrad(g, -99, -88, [[0, '#d5f6ff'], [1, '#6fc0dc']]), '#3d6a7a', 1);
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.4; g.lineCap = 'round';
        g.beginPath(); g.arc(lx, -93.5, 3.4, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
      }
      if (mode === 'back') { g.beginPath(); g.rect(-3, -93, 6, 5); paint(g, '#c9983f', '#5a3d12', 1); }
      break;
    }
    case 'bard': {
      g.save(); g.translate(-2 + (mode === 'side' ? -3 : 0), -97); g.rotate(-0.16);
      g.beginPath(); g.ellipse(0, 0, 21, 8.2, 0, 0, TAU);
      paint(g, vgrad(g, -8, 8, [[0, shade(C.job, 0.25)], [1, C.jobDark]]), C.jobLine, 1.3);
      g.beginPath(); g.ellipse(0, 4.6, 17.5, 3.2, 0, 0.1, Math.PI - 0.1); g.lineWidth = 2.6; g.strokeStyle = '#f0cf7a'; g.stroke();
      const fx = 11 + sway * 0.6;
      g.beginPath(); g.moveTo(8, -3);
      g.bezierCurveTo(16, -12, 22 + sway, -26, 26 + fx * 0.3, -34);
      g.bezierCurveTo(28, -22, 22, -10, 13, -1);
      g.closePath();
      paint(g, vgrad(g, -34, 0, [[0, '#ffffff'], [1, '#e8dcc6']]), '#8a7a5a', 1.1);
      g.strokeStyle = '#b8a888'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(10, -2); g.quadraticCurveTo(18, -14, 25, -30); g.stroke();
      g.restore();
      break;
    }
    default: break;
  }
}

// ---------- 浮かぶ演出(ハート・きらきら・Zzz) ----------
function drawFloatFx(S) {
  const { g, F, t, faceAge, P, mode } = S;
  if (!F.fx) return;
  const k = Math.min(1, faceAge * 5);
  const top = headTopOf(S.job.id);
  g.save();
  g.translate(0, P.bodyY);
  for (const f of F.fx) {
    if (f === 'hearts') {
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.7 + i / 3) % 1;
        const x = (i - 1) * 15 + Math.sin(u * 6 + i * 2) * 4, y = -top - 6 - u * 26;
        heartPath(g, x, y, 4.4 * (0.7 + 0.5 * Math.sin(u * Math.PI)));
        g.fillStyle = `rgba(255,96,150,${Math.sin(u * Math.PI) * k})`; g.fill();
      }
    } else if (f === 'sparkle') {
      for (const [x, y, ph] of [[-29, -90, 0], [30, -82, 1.7], [-22, -108, 3.1]]) {
        const s = (0.55 + 0.45 * Math.abs(Math.sin(t * 4 + ph))) * 5.4 * k;
        g.fillStyle = '#fff6b0'; g.shadowColor = '#ffcf4a'; g.shadowBlur = 6;
        starPath(g, x, y, s); g.fill();
      }
      g.shadowBlur = 0;
    } else if (f === 'zzz' && mode !== 'back') {
      g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.45 + i / 3) % 1;
        g.save();
        g.translate(14 + u * 18, -top + 4 - u * 24); g.scale(0.7 + u * 0.8, 0.7 + u * 0.8);
        g.fillStyle = `rgba(214,230,255,${Math.sin(u * Math.PI) * k})`; g.strokeStyle = `rgba(60,80,140,${Math.sin(u * Math.PI) * k * 0.6})`;
        g.lineWidth = 1.4; g.strokeText('Z', 0, 0); g.fillText('Z', 0, 0);
        g.restore();
      }
    }
  }
  g.restore();
}
