// 描画の共有部品(アバターと世界で使う)
const colorCache = new Map();

/** '#rrggbb' を明るく(f>0)・暗く(f<0)する */
export function shade(hex, f) {
  const key = hex + f;
  let c = colorCache.get(key);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    const m = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    const h = (v) => m(v).toString(16).padStart(2, '0');
    c = `#${h(n >> 16)}${h((n >> 8) & 255)}${h(n & 255)}`;
    colorCache.set(key, c);
  }
  return c;
}

/** 再現できる乱数(背景が毎回同じ形になる) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 二次ベジェに沿って幅 w0 → w1 に細くなる帯(髪の毛束・木の根)のパスを作る */
export function strand(g, p0, p1, p2, w0, w1) {
  const N = 14, L = [], R = [];
  let tx = 0, ty = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    const x = a * p0[0] + b * p1[0] + c * p2[0], y = a * p0[1] + b * p1[1] + c * p2[1];
    const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]);
    const dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
    const d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const w = ((w0 + (w1 - w0) * u) / 2) * (1 + 0.18 * Math.sin(u * Math.PI));
    L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
    tx = dx / d; ty = dy / d;
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  g.quadraticCurveTo(p2[0] + tx * (w1 + 2), p2[1] + ty * (w1 + 2), R[N][0], R[N][1]);
  for (let i = N; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
}

/** ワールド座標のまま描ける高解像度レイヤー(s 倍の解像度) */
export function makeLayer(w, h, s) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  const g = canvas.getContext('2d');
  g.scale(s, s);
  return { canvas, g };
}

/** やわらかい光の玉(加算合成で重ねる用) */
export function glowSprite(rgb, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.35, `rgba(${rgb},.35)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
