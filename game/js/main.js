import { JOBS, jobById } from './jobs.js';
import {
  SKINS, HAIR_COLORS, OUTFITS, EYE_COLORS, HAIR_STYLES, FACES,
  defaultLook, drawAvatar, faceFromText, headTopOf,
} from './avatar.js';
import { WORLD, SPAWN, PORTALS, collides, buildScene, createFx, drawLayer } from './world.js';
import { createNet, isFirebaseConfigured } from './net.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nowSec = () => performance.now() / 1000;
const show = (name) => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
};
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

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
  profile.name = $('name-input').value.trim().slice(0, 12) || '旅人';
  save(); show('avatar');
};

// ---- アバター選択 ----
const preview = { dir: 'down', face: 'normal', since: -9 };
const DIRS = ['down', 'left', 'up', 'right'];
const setPreviewFace = (id) => { preview.face = id; preview.since = nowSec(); };

const swatchRows = [['肌', 'skin', SKINS], ['髪色', 'hair', HAIR_COLORS], ['目', 'eyes', EYE_COLORS], ['服', 'outfit', OUTFITS]];
function buildAvatarOptions() {
  const box = $('avatar-options'); box.innerHTML = '';
  for (const [label, key, colors] of swatchRows) {
    const row = el('div', 'opt', `<span class="label">${label}</span>`);
    colors.forEach((c, i) => {
      const b = el('button', 'swatch' + (profile.look[key] === i ? ' sel' : ''));
      b.style.background = c; b.title = `${label} ${i + 1}`;
      b.onclick = () => { profile.look[key] = i; buildAvatarOptions(); setPreviewFace('smile'); };
      row.append(b);
    });
    box.append(row);
  }
  const row = el('div', 'opt', '<span class="label">髪型</span>');
  HAIR_STYLES.forEach((n, i) => {
    const b = el('button', 'chip' + (profile.look.hairStyle === i ? ' sel' : ''), n);
    b.onclick = () => { profile.look.hairStyle = i; buildAvatarOptions(); setPreviewFace('smile'); };
    row.append(b);
  });
  box.append(row);
}
function buildFaceRow(box, onPick) {
  box.innerHTML = '';
  for (const f of FACES) {
    const b = el('button', 'face-btn', f.icon);
    b.title = f.label; b.onclick = () => onPick(f.id);
    box.append(b);
  }
}
buildFaceRow($('preview-faces'), setPreviewFace);
$('btn-rot-l').onclick = () => { preview.dir = DIRS[(DIRS.indexOf(preview.dir) + 1) % 4]; };
$('btn-rot-r').onclick = () => { preview.dir = DIRS[(DIRS.indexOf(preview.dir) + 3) % 4]; };
$('btn-avatar-back').onclick = () => show('title');
$('btn-to-job').onclick = () => { save(); show('job'); buildJobs(); };

// ---- ジョブ選択 ----
function buildJobs() {
  const box = $('job-list'); box.innerHTML = '';
  for (const j of JOBS) {
    const d = el('div', 'job' + (profile.job === j.id ? ' sel' : ''),
      `<canvas class="job-cv" width="200" height="260" data-job="${j.id}"></canvas><b>${j.icon} ${j.name}</b><small>${j.desc}</small>`);
    d.onclick = () => { profile.job = j.id; buildJobs(); };
    box.append(d);
  }
}
$('btn-job-back').onclick = () => show('avatar');
$('btn-enter').onclick = () => { save(); enterWorld(); };
buildAvatarOptions();

// 選択画面のアニメーション(プレビューとジョブカード)
function previewLoop(ms) {
  const t = ms / 1000;
  const active = document.querySelector('.screen.active')?.id;
  if (active === 'screen-avatar') {
    const c = $('avatar-preview'), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    drawAvatar(g, c.width / 2, c.height - 56, profile.look, profile.job, {
      dir: preview.dir, face: preview.face, faceAge: t - preview.since, t, scale: 4.7, seed: 0.3,
    });
  } else if (active === 'screen-job') {
    for (const c of document.querySelectorAll('.job-cv')) {
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      drawAvatar(g, c.width / 2, c.height - 22, profile.look, c.dataset.job, { dir: 'down', face: 'smile', t, scale: 1.7, seed: 0.2, faceAge: 9 });
    }
  }
  requestAnimationFrame(previewLoop);
}
requestAnimationFrame(previewLoop);

// ================= ワールド =================
const canvas = $('world'), ctx = canvas.getContext('2d');
const SPEED = 200;
let scene, fx, net, me, others = {}, keys = {}, target = null, running = false;
let nearPortal = null, lastChatAt = 0, pushTimer = null, lastSent = '', lastSentAt = 0;
let Z = 1.3, zoomMul = 1, lastFrame = 0, lastInput = 0;
const cam = { x: 0, y: 0, snap: true };
const bubbles = new Map(); // id -> {text, until}
const ripples = [];

let sceneTimer = null;
const wantScale = () => clamp(Z * (devicePixelRatio || 1), 1, 2);

function resize() {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  Z = clamp(clamp(Math.min(W / 760, H / 560), 1.15, 1.75) * zoomMul, 0.8, 2.4);
  // 背景は表示倍率に合わせた解像度で作り、等倍で貼る(拡大縮小の計算を避けて軽くする)
  if (scene && Math.abs(wantScale() - scene.scale) / scene.scale > 0.12) {
    clearTimeout(sceneTimer);
    sceneTimer = setTimeout(() => { scene = buildScene(wantScale()); }, 300);
  }
}
addEventListener('resize', () => { if (running) resize(); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomMul = clamp(zoomMul * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.6, 1.6); resize();
}, { passive: false });

const pub = (m) => ({
  name: m.name, look: m.look, job: m.job, x: Math.round(m.x), y: Math.round(m.y),
  dir: m.dir, face: m.face, emote: m.emote || null,
});
function push(force) {
  const s = JSON.stringify(pub(me)), t = performance.now();
  if (!force && s === lastSent && t - lastSentAt < 1000) return;
  lastSent = s; lastSentAt = t;
  net.update(pub(me));
}

// 入口の絨毯のあたりに少しずらして出現する(みんなが重ならないように)
function spawnPoint() {
  for (let i = 0; i < 20; i++) {
    const x = SPAWN.x + (Math.random() - 0.5) * 150, y = SPAWN.y + (Math.random() - 0.5) * 70;
    if (!collides(x, y)) return { x, y };
  }
  return { x: SPAWN.x, y: SPAWN.y };
}

async function enterWorld() {
  show('world'); $('loading').style.display = 'flex';
  resize();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  scene = scene || buildScene(wantScale());
  fx = fx || createFx();
  $('loading').style.display = 'none';

  me = {
    name: profile.name, look: profile.look, job: profile.job, ...spawnPoint(), dir: 'up',
    vx: 0, vy: 0, phase: 0, amt: 0, face: 'smile', faceSince: nowSec(), seed: 0.5, emote: null,
  };
  net = createNet();
  net.onPlayers((p) => syncOthers(p));
  net.onChat((m) => addChat(m));
  try { await net.join(pub(me)); }
  catch (e) { addChat({ name: 'システム', text: '接続に失敗しました: ' + e.message, sys: true }); console.error(e); }
  me.seed = hash(net.id || me.name);
  cam.snap = true; lastInput = nowSec();
  $('hud-room').textContent = '世界樹の図書館';
  addChat({ name: 'システム', text: `${me.name}(${jobById(me.job).name})として入場しました`, sys: true });
  setFace('smile', 2500);
  clearInterval(pushTimer);
  pushTimer = setInterval(() => push(false), 80);
  if (!running) { running = true; lastFrame = performance.now(); requestAnimationFrame(loop); }
}

function syncOthers(p) {
  const now = nowSec();
  for (const id of Object.keys(others)) if (!p[id]) delete others[id];
  for (const [id, v] of Object.entries(p)) {
    if (!v || typeof v !== 'object') continue;
    let o = others[id];
    const x = Number(v.x) || 0, y = Number(v.y) || 0;
    if (!o) o = others[id] = { x, y, phase: 0, amt: 0, seed: hash(id), faceSince: now - 9 };
    const face = FACES.some((f) => f.id === v.face) ? v.face : 'normal';
    if (o.face !== face) o.faceSince = now;
    Object.assign(o, {
      name: String(v.name || '旅人').slice(0, 12), look: v.look || defaultLook(), job: v.job,
      dir: v.dir || 'down', face, emote: v.emote || null, tx: x, ty: y,
    });
  }
  $('hud-count').textContent = `ログイン中: ${Object.keys(others).length + 1}人`;
}

// ---- 表情 ----
let faceTimer = null;
function setFace(id, ms = 6000) {
  if (!me) return;
  me.face = id; me.faceSince = nowSec();
  clearTimeout(faceTimer);
  if (id !== 'normal') faceTimer = setTimeout(() => setFace('normal'), ms);
  document.querySelectorAll('#emote-bar .face-btn').forEach((b, i) => b.classList.toggle('on', FACES[i].id === id && id !== 'normal'));
  if (net) push(true);
}
buildFaceRow($('emote-bar'), (id) => { lastInput = nowSec(); setFace(me.face === id ? 'normal' : id); });

// ---- 入力 ----
const typing = () => document.activeElement === $('chat-input');
const touchInput = () => { lastInput = nowSec(); if (me && me.face === 'sleepy') setFace('normal'); };
addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.key === 'Enter' && !typing()) { $('chat-input').focus(); e.preventDefault(); return; }
  if (typing()) { if (e.key === 'Escape') $('chat-input').blur(); return; }
  touchInput();
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  keys[e.key.toLowerCase()] = true; target = null;
  if (e.key === ' ' && nearPortal) portalAction(nearPortal);
  const n = '1234567890'.indexOf(e.key);
  if (n >= 0 && FACES[n]) setFace(FACES[n].id);
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('pointerdown', (e) => setTarget(e));
canvas.addEventListener('pointermove', (e) => { if (e.buttons) setTarget(e); });
function setTarget(e) {
  touchInput();
  const r = canvas.getBoundingClientRect();
  target = { x: (e.clientX - r.left) / Z + cam.x, y: (e.clientY - r.top) / Z + cam.y };
  if (e.type === 'pointerdown') ripples.push({ x: target.x, y: target.y, t: nowSec() });
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
  touchInput();
  const f = faceFromText(text);
  if (f) setFace(f, 4500);
  net.chat(text);
  inp.blur();
};
$('btn-emote').onclick = () => {
  touchInput();
  me.emote = jobById(me.job).emote;
  setTimeout(() => { me.emote = null; push(true); }, 2500);
  push(true);
};
$('hint').onclick = () => { if (nearPortal) portalAction(nearPortal); };

// 発言した瞬間の表情を丸い顔アイコンにする(後ろ向きや遠くにいても表情がわかる)
function faceIcon(p) {
  const c = document.createElement('canvas');
  c.width = c.height = 56; c.className = 'chat-face';
  const g = c.getContext('2d');
  g.beginPath(); g.arc(28, 28, 28, 0, Math.PI * 2); g.clip();
  g.fillStyle = 'rgba(120,200,160,.25)'; g.fillRect(0, 0, 56, 56);
  drawAvatar(g, 28, 28 + 74 * 1.05, p.look, p.job, { dir: 'down', face: p.face || 'normal', faceAge: 9, t: 1.2, seed: 0.3, scale: 1.05 });
  return c;
}

function addChat(m) {
  const log = $('chat-log');
  const d = document.createElement('div');
  if (m.sys) { d.className = 'sys'; d.textContent = m.text; }
  else {
    d.className = 'line';
    const p = net && m.id === net.id ? me : others[m.id];
    if (p && p.look) d.append(faceIcon(p));
    const t = document.createElement('div');
    t.innerHTML = '<span class="who"></span>: <span class="t"></span>';
    t.querySelector('.who').textContent = m.name; t.querySelector('.t').textContent = m.text;
    d.append(t);
  }
  log.append(d); log.scrollTop = log.scrollHeight;
  while (log.children.length > 80) log.firstChild.remove();
  if (!m.sys && m.id) bubbles.set(m.id, { text: String(m.text), until: Date.now() + 6000 });
}

function portalAction(p) {
  addChat({ name: 'システム', text: `${p.label}:魔法陣はまだ光っていない…(近日公開)`, sys: true });
}

// ---- 更新 ----
function loop(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000 || 0); lastFrame = t;
  const time = t / 1000;
  update(dt, time);
  draw(time);
  requestAnimationFrame(loop);
}

function update(dt, time) {
  let ix = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
  let iy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
  if (target) {
    const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy);
    if (d < 8) target = null; else { ix = dx / d; iy = dy / d; }
  }
  const len = Math.hypot(ix, iy);
  // 加減速をつけて、動き出しと止まりをなめらかにする
  const k = Math.min(1, dt * (len ? 12 : 16));
  me.vx += ((len ? (ix / len) * SPEED : 0) - me.vx) * k;
  me.vy += ((len ? (iy / len) * SPEED : 0) - me.vy) * k;
  const sp = Math.hypot(me.vx, me.vy);
  if (sp > 1) {
    const nx = me.x + me.vx * dt, ny = me.y + me.vy * dt;
    if (!collides(nx, me.y)) me.x = nx; else me.vx = 0;
    if (!collides(me.x, ny)) me.y = ny; else me.vy = 0;
  }
  if (len) {
    if (Math.abs(ix) > Math.abs(iy) + 0.15) me.dir = ix > 0 ? 'right' : 'left';
    else if (Math.abs(iy) > Math.abs(ix) + 0.15) me.dir = iy > 0 ? 'down' : 'up';
  }
  animate(me, sp > 25, sp / SPEED, dt);

  for (const o of Object.values(others)) {
    const dx = o.tx - o.x, dy = o.ty - o.y, dist = Math.hypot(dx, dy);
    const f = Math.min(1, dt * 9);
    o.x += dx * f; o.y += dy * f;
    animate(o, dist > 3, 1, dt);
  }

  if (me.face === 'normal' && time - lastInput > 45) setFace('sleepy', 1e9);

  nearPortal = PORTALS.find((p) => Math.hypot(p.x - me.x, p.y - me.y) < p.r + 30) || null;
  const hint = $('hint');
  hint.style.display = nearPortal ? 'block' : 'none';
  if (nearPortal) hint.textContent = `${nearPortal.label} — スペースキー/タップで調べる`;

  fx.update(dt);
  updateCamera(dt);
}

function animate(p, moving, speedRatio, dt) {
  p.amt += ((moving ? 1 : 0) - p.amt) * Math.min(1, dt * 10);
  if (p.amt > 0.02) p.phase += dt * 9.5 * Math.max(0.45, Math.min(1, speedRatio));
  else p.phase = 0;
}

function updateCamera(dt) {
  const vw = canvas.clientWidth / Z, vh = canvas.clientHeight / Z;
  const fit = (want, size, world) => (size >= world ? (world - size) / 2 : clamp(want, 0, world - size));
  const tx = fit(me.x - vw / 2, vw, WORLD.w), ty = fit(me.y - vh * 0.6, vh, WORLD.h);
  const k = cam.snap ? 1 : Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.snap = false;
}

// ---- 描画 ----
function draw(time) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#04100b'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = scene.scale > Z * dpr * 1.4 ? 'medium' : 'low';

  // 背景は見えている範囲だけ切り出す
  const bs = scene.scale, vw = W / Z, vh = H / Z;
  const view = { x0: cam.x - 40, y0: cam.y - 40, x1: cam.x + vw + 40, y1: cam.y + vh + 40 };
  const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y);
  const ex = Math.min(WORLD.w, cam.x + vw), ey = Math.min(WORLD.h, cam.y + vh);
  if (ex > sx && ey > sy) {
    ctx.drawImage(scene.bg, sx * bs, sy * bs, (ex - sx) * bs, (ey - sy) * bs, (sx - cam.x) * Z, (sy - cam.y) * Z, (ex - sx) * Z, (ey - sy) * Z);
  }

  // ここからワールド座標
  ctx.setTransform(dpr * Z, 0, 0, dpr * Z, -cam.x * Z * dpr, -cam.y * Z * dpr);
  fx.drawGround(ctx, time, view);
  drawRipples(time);

  const items = scene.sprites.map((s) => ({ y: s.sortY, sprite: s }));
  items.push({ y: me.y, p: me, self: true });
  for (const o of Object.values(others)) items.push({ y: o.y, p: o });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.sprite) drawSprite(it.sprite, time, view);
    else {
      const p = it.p;
      drawAvatar(ctx, p.x, p.y, p.look, p.job, { dir: p.dir, phase: p.phase, amt: p.amt, t: time, face: p.face, faceAge: time - p.faceSince, seed: p.seed });
    }
  }
  fx.drawAir(ctx, time, view);

  drawPortrait(time);

  // ここから画面座標(文字をくっきり描く)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toScreen = (x, y) => [(x - cam.x) * Z, (y - cam.y) * Z];
  for (const it of items) {
    if (!it.p) continue;
    const p = it.p, [px, py] = toScreen(p.x, p.y);
    if (px < -80 || px > W + 80 || py < -60 || py > H + 260) continue;
    drawTag(px, py, p, !!it.self);
    const top = toScreen(p.x, p.y - headTopOf(p.job) - 6)[1];
    const b = bubbles.get(it.self ? net.id : Object.keys(others).find((k) => others[k] === p));
    if (b && b.until > Date.now()) drawBubble(px, top, b.text, clamp((b.until - Date.now()) / 600, 0, 1));
    if (p.emote) {
      ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.emote, px + 34 * Z * 0.8, top + 18 + Math.sin(time * 5) * 4);
    }
  }
}

function drawPortrait(time) {
  const c = $('portrait'), g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
  drawAvatar(g, c.width / 2, c.height / 2 + 74 * 2.3, me.look, me.job, {
    dir: 'down', face: me.face, faceAge: time - me.faceSince, t: time, seed: me.seed, scale: 2.3,
  });
}

function drawSprite(s, time, view) {
  drawLayer(ctx, s.img, s.x, s.y, s.w, s.h, view);
  if (s.glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.3 * Math.sin(time * 1.3);
    drawLayer(ctx, s.glow, s.x, s.y, s.w, s.h, view);
    ctx.restore();
  }
}

function drawRipples(time) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i], a = (time - r.t) / 0.7;
    if (a >= 1) { ripples.splice(i, 1); continue; }
    ctx.strokeStyle = `rgba(255,236,170,${0.8 * (1 - a)})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 6 + a * 26, (6 + a * 26) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

function pill(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawTag(sx, sy, p, self) {
  const job = jobById(p.job);
  ctx.font = '600 14px "Hiragino Sans","Noto Sans JP",sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(p.name).width + 22, h = 22, x = sx - w / 2, y = sy + 9;
  pill(x, y, w, h, 11);
  ctx.fillStyle = 'rgba(8,22,15,.66)'; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = self ? 'rgba(255,233,168,.8)' : job.color; ctx.stroke();
  ctx.fillStyle = self ? '#ffe9a8' : '#fff'; ctx.fillText(p.name, sx, y + 16);
  ctx.font = '11px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  const label = `${job.icon} ${job.name}`;
  ctx.strokeText(label, sx, y + h + 13); ctx.fillStyle = job.color; ctx.fillText(label, sx, y + h + 13);
}

function wrapText(text, maxW) {
  const lines = []; let cur = '';
  for (const ch of text) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function drawBubble(sx, topY, text, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = '14px "Hiragino Sans","Noto Sans JP",sans-serif'; ctx.textAlign = 'center';
  const lines = wrapText(text, 168), lh = 19;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22, h = lines.length * lh + 12;
  const x = sx - w / 2, y = topY - h - 10;
  pill(x + 2, y + 3, w, h, 12); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
  pill(x, y, w, h, 12); ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(sx - 6, y + h - 1); ctx.lineTo(sx + 6, y + h - 1); ctx.lineTo(sx, y + h + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1d2a22';
  lines.forEach((l, i) => ctx.fillText(l, sx, y + 6 + lh * (i + 1) - 5));
  ctx.restore();
}
