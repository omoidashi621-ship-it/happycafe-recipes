// 世界樹の図書館のマップ。座標は全てワールド座標(px)。
export const WORLD = { w: 1600, h: 1200 };
export const SPAWN = { x: 800, y: 1000 };
export const TREE = { x: 800, y: 520, r: 120 };

export const SHELVES = [];
for (let i = 0; i < 9; i++) SHELVES.push({ x: 60 + i * 170, y: 40, w: 150, h: 90 });
for (let i = 0; i < 4; i++) {
  SHELVES.push({ x: 40, y: 200 + i * 190, w: 70, h: 150 });
  SHELVES.push({ x: 1490, y: 200 + i * 190, w: 70, h: 150 });
}
export const TABLES = [{ x: 300, y: 820, w: 160, h: 70 }, { x: 1140, y: 820, w: 160, h: 70 }];
export const SOLIDS = [...SHELVES, ...TABLES];

// ミニゲームへの入口(今は準備中の魔法陣)
export const PORTALS = [
  { id: 'minigame-1', x: 1350, y: 1010, r: 50, label: 'ミニゲーム(準備中)' },
];

export function collides(x, y, r = 12) {
  if (x < r || y < r + 100 || x > WORLD.w - r || y > WORLD.h - r) return true;
  const dx = x - TREE.x, dy = (y - TREE.y) * 1.4;
  if (Math.hypot(dx, dy) < TREE.r + r) return true;
  return SOLIDS.some((s) => x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r);
}

/** 静的な背景を一度だけオフスクリーンに描く */
export function renderBackground() {
  const c = document.createElement('canvas');
  c.width = WORLD.w; c.height = WORLD.h;
  const g = c.getContext('2d');

  // 床(木板)
  g.fillStyle = '#3b2b1c'; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += 40) {
    for (let x = ((y / 40) % 2) * 60 - 60; x < c.width; x += 120) {
      const l = 24 + ((x * 7 + y * 3) % 9);
      g.fillStyle = `hsl(28 32% ${l}%)`;
      g.fillRect(x + 1, y + 1, 118, 38);
    }
  }
  // 中央の光
  const glow = g.createRadialGradient(TREE.x, TREE.y, 40, TREE.x, TREE.y, 700);
  glow.addColorStop(0, 'rgba(150,255,190,.35)'); glow.addColorStop(1, 'rgba(0,20,10,.55)');
  g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height);

  // 上の壁
  g.fillStyle = '#1a2a22'; g.fillRect(0, 0, c.width, 130);

  // 世界樹: 根
  g.strokeStyle = '#4a3220'; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.05 + i * 0.112);
    g.lineWidth = 22 - i % 3 * 5;
    g.beginPath(); g.moveTo(TREE.x, TREE.y + 50);
    g.quadraticCurveTo(TREE.x + Math.cos(a) * 160, TREE.y + 90 + Math.sin(a) * 60, TREE.x + Math.cos(a) * 250, TREE.y + 60 + Math.sin(a) * 150);
    g.stroke();
  }
  // 幹
  const bark = g.createLinearGradient(TREE.x - TREE.r, 0, TREE.x + TREE.r, 0);
  bark.addColorStop(0, '#3a2616'); bark.addColorStop(.5, '#6b4a2c'); bark.addColorStop(1, '#3a2616');
  g.fillStyle = bark;
  g.beginPath(); g.ellipse(TREE.x, TREE.y, TREE.r, TREE.r / 1.4 + 20, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(160,255,200,.5)'; g.lineWidth = 2;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(TREE.x + i * 28, TREE.y - 70); g.quadraticCurveTo(TREE.x + i * 34, TREE.y, TREE.x + i * 28, TREE.y + 70); g.stroke(); }

  // 書架
  for (const s of SHELVES) drawShelf(g, s);
  // 机
  for (const t of TABLES) {
    g.fillStyle = '#6b4a2c'; g.fillRect(t.x, t.y, t.w, t.h);
    g.fillStyle = '#85603a'; g.fillRect(t.x, t.y, t.w, 10);
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(t.x + t.w / 2, t.y + 30, 8, 0, 7); g.fill();
  }
  // 魔法陣
  for (const p of PORTALS) {
    g.strokeStyle = '#8fe3ff'; g.lineWidth = 3;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke();
    g.beginPath(); g.arc(p.x, p.y, p.r * 0.65, 0, 7); g.stroke();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(p.x + Math.cos(a) * p.r * .65, p.y + Math.sin(a) * p.r * .65); g.lineTo(p.x + Math.cos(a + 2.09) * p.r * .65, p.y + Math.sin(a + 2.09) * p.r * .65); g.stroke(); }
  }
  return c;
}

function drawShelf(g, s) {
  g.fillStyle = '#4a3220'; g.fillRect(s.x, s.y, s.w, s.h);
  const rows = Math.max(2, Math.floor(s.h / 45));
  const cols = [ '#b5453f', '#3f6fb5', '#3f9a62', '#d8a23a', '#8a5ab5', '#e9e0c8' ];
  for (let r = 0; r < rows; r++) {
    const y = s.y + 6 + r * (s.h / rows);
    g.fillStyle = '#2a1c10'; g.fillRect(s.x + 3, y + s.h / rows - 8, s.w - 6, 4);
    for (let x = s.x + 6, i = 0; x < s.x + s.w - 8; x += 9, i++) {
      g.fillStyle = cols[(i * 7 + r * 3 + Math.floor(s.x / 10)) % cols.length];
      g.fillRect(x, y, 7, s.h / rows - 12);
    }
  }
}
