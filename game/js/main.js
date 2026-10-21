import { JOBS, jobById } from './jobs.js';
import { SKINS, HAIR_COLORS, OUTFITS, HAIR_STYLES, defaultLook, drawAvatar } from './avatar.js';
import { WORLD, SPAWN, TREE, PORTALS, collides, renderBackground } from './world.js';
import { createNet, isFirebaseConfigured } from './net.js';

const $ = (id) => document.getElementById(id);
const show = (name) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
};

// ---- 保存された設定 ----
const saved = (() => { try { return JSON.parse(localStorage.getItem('wtl-profile')) || {}; } catch { return {}; } })();
const profile = {
  name: saved.name || '',
  look: { ...defaultLook(), ...(saved.look || {}) },
  job: saved.job || JOBS[0].id,
};
const save = () => { try { localStorage.setItem('wtl-profile', JSON.stringify(profile)); } catch {} };

$('name-input').value = profile.name;
$('mode-note').textContent = isFirebaseConfigured()
  ? ''
  : 'ローカルモード:同じブラウザの別タブ同士でのみ会話できます(Firebase 設定後に全員と会話可能)';

// ---- タイトル ----
$('btn-to-avatar').onclick = () => {
  profile.name = $('name-input').value.trim() || '旅人';
  save(); show('avatar'); drawPreview();
};

// ---- アバター選択 ----
const optionDefs = [
  ['肌', 'skin', SKINS], ['髪色', 'hair', HAIR_COLORS], ['服', 'outfit', OUTFITS],
];
function buildAvatarOptions() {
  const box = $('avatar-options'); box.innerHTML = '';
  for (const [label, key, colors] of optionDefs) {
    const row = el('div', 'opt', `<span class="label">${label}</span>`);
    colors.forEach((c, i) => {
      const b = el('button', 'swatch' + (profile.look[key] === i ? ' sel' : ''));
      b.style.background = c;
      b.onclick = () => { profile.look[key] = i; buildAvatarOptions(); drawPreview(); };
      row.append(b);
    });
    box.append(row);
  }
  const row = el('div', 'opt', '<span class="label">髪型</span>');
  HAIR_STYLES.forEach((n, i) => {
    const b = el('button', 'chip' + (profile.look.hairStyle === i ? ' sel' : ''), n);
    b.onclick = () => { profile.look.hairStyle = i; buildAvatarOptions(); drawPreview(); };
    row.append(b);
  });
  box.append(row);
}
function drawPreview() {
  const c = $('avatar-preview'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  drawAvatar(g, 100, 180, profile.look, profile.job, 'down', 0, 2.4);
}
$('btn-avatar-back').onclick = () => show('title');
$('btn-to-job').onclick = () => { save(); show('job'); buildJobs(); };

// ---- ジョブ選択 ----
function buildJobs() {
  const box = $('job-list'); box.innerHTML = '';
  for (const j of JOBS) {
    const d = el('div', 'job' + (profile.job === j.id ? ' sel' : ''),
      `<div class="ic">${j.icon}</div><b>${j.name}</b><small>${j.desc}</small>`);
    d.onclick = () => { profile.job = j.id; buildJobs(); drawPreview(); };
    box.append(d);
  }
}
$('btn-job-back').onclick = () => show('avatar');
$('btn-enter').onclick = () => { save(); enterWorld(); };

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
buildAvatarOptions();

// ================= ワールド =================
const canvas = $('world'), ctx = canvas.getContext('2d');
let bg, net, me, others = {}, keys = {}, target = null, particles = [], last = 0, running = false;
let nearPortal = null, lastChatAt = 0, pushTimer = null;
const bubbles = new Map(); // id -> {text, until}

function resize() {
  const dpr = devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
}
addEventListener('resize', resize);

async function enterWorld() {
  show('world'); resize();
  bg = bg || renderBackground();
  me = { name: profile.name, look: profile.look, job: profile.job, x: SPAWN.x, y: SPAWN.y, dir: 'down', walk: 0, emote: null };
  net = createNet();
  net.onPlayers((p) => syncOthers(p));
  net.onChat((m) => addChat(m));
  try { await net.join(pub(me)); }
  catch (e) { addChat({ name: 'システム', text: '接続に失敗しました: ' + e.message, sys: true }); console.error(e); }
  $('hud-room').textContent = '世界樹の図書館';
  addChat({ name: 'システム', text: `${me.name}(${jobById(me.job).name})として入場しました`, sys: true });
  if (!running) { running = true; requestAnimationFrame(loop); }
  clearInterval(pushTimer);
  pushTimer = setInterval(() => net.update(pub(me)), 100);
}
const pub = (m) => ({ name: m.name, look: m.look, job: m.job, x: Math.round(m.x), y: Math.round(m.y), dir: m.dir, emote: m.emote || null });

function syncOthers(p) {
  for (const id of Object.keys(others)) if (!p[id]) delete others[id];
  for (const [id, v] of Object.entries(p)) {
    const o = others[id];
    if (o) { Object.assign(o, v, { tx: v.x, ty: v.y }); o.x = o.x ?? v.x; o.y = o.y ?? v.y; }
    else others[id] = { ...v, tx: v.x, ty: v.y, walk: 0 };
  }
  $('hud-count').textContent = `ログイン中: ${Object.keys(others).length + 1}人`;
}

// ---- 入力 ----
const typing = () => document.activeElement === $('chat-input');
addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.key === 'Enter' && !typing()) { $('chat-input').focus(); e.preventDefault(); return; }
  if (typing()) { if (e.key === 'Escape') $('chat-input').blur(); return; }
  keys[e.key.toLowerCase()] = true; target = null;
  if (e.key === ' ' && nearPortal) portalAction(nearPortal);
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('pointerdown', (e) => setTarget(e));
canvas.addEventListener('pointermove', (e) => { if (e.buttons) setTarget(e); });
canvas.addEventListener('pointerup', () => {});
function setTarget(e) {
  const r = canvas.getBoundingClientRect(), cam = camera();
  target = { x: e.clientX - r.left + cam.x, y: e.clientY - r.top + cam.y };
  document.activeElement?.blur();
}

$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const inp = $('chat-input'), text = inp.value.trim().slice(0, 60);
  inp.value = '';
  if (!text) return inp.blur();
  const now = Date.now();
  if (now - lastChatAt < 700) return;
  lastChatAt = now;
  net.chat(text);
};
$('btn-emote').onclick = () => {
  me.emote = jobById(me.job).emote;
  setTimeout(() => { me.emote = null; }, 2500);
  net.update(pub(me));
};

function addChat(m) {
  const log = $('chat-log');
  const d = document.createElement('div');
  if (m.sys) { d.className = 'sys'; d.textContent = m.text; }
  else { d.innerHTML = '<span class="who"></span>: <span class="t"></span>'; d.querySelector('.who').textContent = m.name; d.querySelector('.t').textContent = m.text; }
  log.append(d); log.scrollTop = log.scrollHeight;
  while (log.children.length > 80) log.firstChild.remove();
  if (!m.sys && m.id) bubbles.set(m.id, { text: m.text, until: Date.now() + 5000 });
}

function portalAction(p) {
  addChat({ name: 'システム', text: `${p.label}:魔法陣はまだ光っていない…(近日公開)`, sys: true });
}

// ---- メインループ ----
function camera() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  return {
    x: Math.max(0, Math.min(WORLD.w - w, me.x - w / 2)),
    y: Math.max(0, Math.min(WORLD.h - h, me.y - h / 2 - 20)),
  };
}

function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  update(dt); draw(t / 1000);
  requestAnimationFrame(loop);
}

function update(dt) {
  let vx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
  let vy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
  if (target) {
    const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy);
    if (d < 6) target = null; else { vx = dx / d; vy = dy / d; }
  }
  const len = Math.hypot(vx, vy);
  if (len > 0) {
    const sp = 190 * dt / Math.max(1, len);
    const nx = me.x + vx * sp, ny = me.y + vy * sp;
    if (!collides(nx, me.y)) me.x = nx;
    if (!collides(me.x, ny)) me.y = ny;
    me.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    me.walk += dt;
  } else me.walk = 0;

  for (const o of Object.values(others)) {
    const dx = o.tx - o.x, dy = o.ty - o.y;
    o.moving = Math.hypot(dx, dy) > 2;
    o.x += dx * Math.min(1, dt * 10); o.y += dy * Math.min(1, dt * 10);
    o.walk = o.moving ? o.walk + dt : 0;
  }

  nearPortal = PORTALS.find((p) => Math.hypot(p.x - me.x, p.y - me.y) < p.r + 30) || null;
  const hint = $('hint');
  hint.style.display = nearPortal ? 'block' : 'none';
  if (nearPortal) hint.textContent = `${nearPortal.label} — スペースキーで調べる`;

  if (particles.length < 60 && Math.random() < 0.5) {
    particles.push({ x: TREE.x + (Math.random() - .5) * 900, y: WORLD.h * (0.3 + Math.random() * 0.7), vy: -10 - Math.random() * 20, life: 4 + Math.random() * 4, age: 0 });
  }
  for (const p of particles) { p.y += p.vy * dt; p.x += Math.sin(p.age * 2) * 10 * dt; p.age += dt; }
  particles = particles.filter((p) => p.age < p.life);
}

function draw(time) {
  const dpr = devicePixelRatio || 1, cam = camera();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  ctx.drawImage(bg, 0, 0);

  // 魔法陣の脈動
  for (const p of PORTALS) {
    ctx.fillStyle = `rgba(143,227,255,${0.12 + 0.08 * Math.sin(time * 2)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }

  // 人物をY順に描画
  const list = [{ ...me, id: 'me', self: true }, ...Object.entries(others).map(([id, o]) => ({ ...o, id }))];
  list.sort((a, b) => a.y - b.y);
  for (const p of list) {
    drawAvatar(ctx, p.x, p.y, p.look, p.job, p.dir, p.self ? me.walk : p.walk);
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(p.name, p.x + 1, p.y + 17);
    ctx.fillStyle = p.self ? '#ffe9a8' : '#fff'; ctx.fillText(p.name, p.x, p.y + 16);
    ctx.fillStyle = jobById(p.job).color; ctx.font = '10px sans-serif';
    ctx.fillText(jobById(p.job).name, p.x, p.y + 28);
    if (p.emote) { ctx.font = '22px sans-serif'; ctx.fillText(p.emote, p.x + 18, p.y - 62 + Math.sin(time * 5) * 3); }
    const key = p.self ? net.id : p.id, b = bubbles.get(key);
    if (b && b.until > Date.now()) drawBubble(p.x, p.y - 76, b.text);
  }

  // 光の粒
  for (const p of particles) {
    const a = Math.sin((p.age / p.life) * Math.PI) * 0.8;
    ctx.fillStyle = `rgba(190,255,210,${a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawBubble(x, y, text) {
  ctx.font = '13px sans-serif';
  const w = Math.min(220, ctx.measureText(text).width + 16);
  ctx.fillStyle = 'rgba(255,255,255,.93)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 24, w, 24, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 7); ctx.fill();
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.fillText(text, x, y - 7, w - 12);
}
