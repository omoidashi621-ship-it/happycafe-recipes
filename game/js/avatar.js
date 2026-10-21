import { jobById } from './jobs.js';

export const SKINS = ['#fbe0c8', '#f3c9a4', '#d9a577', '#9c6b48'];
export const HAIR_COLORS = ['#2b2118', '#7a4a26', '#d9b45a', '#c94f6a', '#5a7be0', '#e9eef2', '#4fb28a'];
export const OUTFITS = ['#3f6fb5', '#b5453f', '#3f9a62', '#8a5ab5', '#d8a23a', '#4a4f5a'];
export const HAIR_STYLES = ['ショート', 'ロング', 'おだんご'];

export const defaultLook = () => ({ skin: 0, hairStyle: 0, hair: 0, outfit: 0 });

const dirOf = { down: 0, up: 1, left: 2, right: 3 };

/** x,y は足元の中心。scale で拡大。 */
export function drawAvatar(ctx, x, y, look, jobId, dir = 'down', walk = 0, scale = 1) {
  const skin = SKINS[look.skin] ?? SKINS[0];
  const hair = HAIR_COLORS[look.hair] ?? HAIR_COLORS[0];
  const outfit = OUTFITS[look.outfit] ?? OUTFITS[0];
  const job = jobById(jobId);
  const d = dirOf[dir] ?? 0;
  const bob = Math.sin(walk * 10) * 1.5 * scale;
  const step = Math.sin(walk * 10) * 3 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); ctx.fill();

  // 脚
  ctx.fillStyle = '#2b2a35';
  ctx.fillRect(-6, -10 + (walk ? step / scale : 0) * 0.2, 5, 10);
  ctx.fillRect(1, -10 - (walk ? step / scale : 0) * 0.2, 5, 10);

  ctx.translate(0, bob / scale);

  // 長髪は体の後ろ
  if (look.hairStyle === 1) { ctx.fillStyle = hair; roundRect(ctx, -11, -40, 22, 28, 8); ctx.fill(); }

  // 胴体(ジョブ色の帯つき)
  ctx.fillStyle = outfit; roundRect(ctx, -10, -26, 20, 18, 5); ctx.fill();
  ctx.fillStyle = job.color; ctx.fillRect(-10, -17, 20, 3);
  ctx.fillStyle = skin;
  ctx.fillRect(-13, -25, 4, 11); ctx.fillRect(9, -25, 4, 11);

  // 頭
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -35, 11, 0, Math.PI * 2); ctx.fill();

  // 髪
  ctx.fillStyle = hair;
  if (d === 1) { ctx.beginPath(); ctx.arc(0, -35, 11.5, 0, Math.PI * 2); ctx.fill(); }
  else {
    ctx.beginPath(); ctx.arc(0, -37, 11.5, Math.PI, 0); ctx.fill();
    if (d === 2) ctx.fillRect(2, -38, 9, 8);
    if (d === 3) ctx.fillRect(-11, -38, 9, 8);
  }
  if (look.hairStyle === 2) { ctx.beginPath(); ctx.arc(0, -48, 5, 0, Math.PI * 2); ctx.fill(); }

  // 目
  if (d !== 1) {
    ctx.fillStyle = '#222';
    const ox = d === 2 ? -3 : d === 3 ? 3 : 0;
    if (d === 0) { ctx.fillRect(-5, -35, 2.5, 3.5); ctx.fillRect(2.5, -35, 2.5, 3.5); }
    else ctx.fillRect(ox - 1 + (d === 2 ? -2 : 2), -35, 2.5, 3.5);
  }

  drawJobGear(ctx, job.id, d);
  ctx.restore();
}

function drawJobGear(ctx, id, d) {
  switch (id) {
    case 'librarian':
      if (d !== 1) { ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.strokeRect(-7, -37, 6, 5); ctx.strokeRect(1, -37, 6, 5); }
      ctx.fillStyle = '#7a3b2a'; ctx.fillRect(10, -22, 6, 8);
      break;
    case 'mage':
      ctx.fillStyle = '#5a3fa8';
      ctx.beginPath(); ctx.moveTo(-13, -43); ctx.lineTo(13, -43); ctx.lineTo(2, -66); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd95a'; ctx.fillRect(-13, -45, 26, 3);
      break;
    case 'knight':
      ctx.fillStyle = '#b9c0cc'; ctx.beginPath(); ctx.arc(0, -39, 11.5, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.fillRect(-1.5, -58, 3, 10);
      ctx.fillStyle = '#d6dbe3'; ctx.fillRect(14, -30, 3, 20);
      break;
    case 'alchemist':
      ctx.fillStyle = '#e0a53a'; ctx.fillRect(-9, -42, 18, 5);
      ctx.fillStyle = '#7fd0e8'; ctx.fillRect(-7, -41, 5, 3); ctx.fillRect(2, -41, 5, 3);
      ctx.fillStyle = '#6fe08f'; ctx.fillRect(10, -20, 5, 6);
      break;
    case 'bard':
      ctx.fillStyle = '#c0394f';
      ctx.beginPath(); ctx.ellipse(0, -45, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -46); ctx.lineTo(12, -60); ctx.stroke();
      ctx.fillStyle = '#b4763a'; ctx.beginPath(); ctx.ellipse(-14, -14, 5, 7, 0.4, 0, Math.PI * 2); ctx.fill();
      break;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
