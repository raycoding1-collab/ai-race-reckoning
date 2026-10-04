import * as THREE from 'three';
import { TICK } from './constants.js';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('momentum:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('momentum:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// --- renderer ---------------------------------------------------------------
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
} catch (e) {
  $('nowebgl').hidden = false;
  throw e;
}
renderer.localClippingEnabled = true;
renderer.autoClear = false;
renderer.setClearColor(0x0b0c0e, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const audio = new Audio();
const hud = new Hud();
const game = new Game(renderer, audio, hud);
window.__game = game;

const defaults = { fov: 75, sensitivity: 3, invertY: false, volume: 0.7, depth: 5, showFps: false, resolution: 1 };
const settings = Object.assign({}, defaults, store.get('settings', {}));
game.settings = settings;
let unlocked = Math.max(0, Math.min(LEVELS.length - 1, store.get('unlocked', 0)));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.resolution);
  renderer.setSize(w, h, false);
  game.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// --- input ------------------------------------------------------------------
const keys = new Set();
const input = { forward: 0, side: 0, jump: false, duck: false, use: false, fire1: false, fire2: false };
const look = { dx: 0, dy: 0 };
let playing = false;
let restartHeld = 0;

const bind = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], duck: ['ControlLeft', 'ControlRight', 'KeyC'], use: ['KeyE', 'KeyF'], restart: ['KeyR'],
};
const pressed = (name) => bind[name].some((k) => keys.has(k));

window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (bind.use.includes(e.code) && !e.repeat) input.use = true;
  if (e.code === 'Digit1' && !e.repeat) input.fire1 = true;
  if (e.code === 'Digit2' && !e.repeat) input.fire2 = true;
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ControlLeft'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousedown', (e) => {
  if (!playing) return;
  if (e.button === 0) input.fire1 = true;
  if (e.button === 2) input.fire2 = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (!playing || (document.pointerLockElement !== canvas && !freeMouse)) return;
  const k = (settings.sensitivity * 0.022 * Math.PI) / 180;
  const dx = e.movementX * k, dy = e.movementY * k * (settings.invertY ? -1 : 1);
  game.player.look(dx, dy);
  look.dx += dx; look.dy += dy;
});

// Some embeds and browsers refuse pointer lock. Rather than leave the player
// stuck on the menu, fall back to looking with plain mouse movement.
let freeMouse = false;
function playUnlocked() {
  freeMouse = true;
  playing = true;
  showMenu(null);
}
function lockPointer() {
  audio.init();
  audio.setVolume(settings.volume);
  if (freeMouse || !canvas.requestPointerLock) { playUnlocked(); return; }
  const fail = () => { if (document.pointerLockElement !== canvas) playUnlocked(); };
  let p;
  try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
  if (p && p.catch) p.catch(() => {
    // unadjustedMovement is not supported everywhere; retry plainly
    try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(fail); } catch { fail(); }
  });
  setTimeout(fail, 700);   // no answer at all (sandboxed frame)
}
document.addEventListener('pointerlockerror', () => { if (document.pointerLockElement !== canvas) playUnlocked(); });
window.addEventListener('keydown', (e) => { if (freeMouse && playing && (e.code === 'Escape' || e.code === 'KeyP')) { playing = false; keys.clear(); showMenu('pause'); } });
// clicking the game view while paused resumes, like most PC shooters
canvas.addEventListener('click', () => { if (started && !playing) lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    playing = true;
    showMenu(null);
  } else {
    playing = false;
    keys.clear();
    if (started) showMenu('pause');
  }
});

// --- menus ------------------------------------------------------------------
let started = false;
function showMenu(which) {
  for (const id of ['menu-start', 'menu-pause', 'menu-chambers', 'menu-settings', 'menu-help']) $(id).hidden = id !== 'menu-' + which;
  $('overlay').hidden = !which;
  document.body.classList.toggle('in-menu', !!which);
  if (which === 'chambers') buildChambers();
}
let menuBack = 'start';

function startLevel(i) {
  started = true;
  game.loadLevel(i);
  lockPointer();
}

$('btn-play').addEventListener('click', () => startLevel(Math.min(unlocked, LEVELS.length - 1)));
$('btn-new').addEventListener('click', () => startLevel(0));
$('btn-resume').addEventListener('click', () => lockPointer());
$('btn-restart').addEventListener('click', () => { game.restart(); lockPointer(); });
for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => {
    menuBack = b.dataset.from || (started ? 'pause' : 'start');
    showMenu(b.dataset.open);
  });
}
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => showMenu(menuBack));

function buildChambers() {
  const list = $('chamber-list');
  list.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.className = 'chamber';
    b.disabled = i > unlocked;
    b.innerHTML = `<span class="num">${String(i).padStart(2, '0')}</span><span class="name">${L.title}</span>`;
    b.addEventListener('click', () => startLevel(i));
    list.appendChild(b);
  });
}

function bindSetting(id, key, parse, fmt) {
  const el = $(id), out = $(id + '-v');
  const show = () => { if (out) out.textContent = fmt ? fmt(settings[key]) : settings[key]; };
  if (el.type === 'checkbox') el.checked = !!settings[key]; else el.value = settings[key];
  show();
  el.addEventListener('input', () => {
    settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
    show();
    store.set('settings', settings);
    if (key === 'volume') audio.setVolume(settings.volume);
    if (key === 'fov' || key === 'resolution') resize();
  });
}
bindSetting('set-sens', 'sensitivity', parseFloat, (v) => v.toFixed(1));
bindSetting('set-fov', 'fov', parseInt);
bindSetting('set-depth', 'depth', parseInt);
bindSetting('set-vol', 'volume', parseFloat, (v) => Math.round(v * 100) + '%');
bindSetting('set-res', 'resolution', parseFloat, (v) => Math.round(v * 100) + '%');
bindSetting('set-invert', 'invertY');
bindSetting('set-fps', 'showFps');

game.onComplete = (i) => {
  unlocked = Math.max(unlocked, Math.min(LEVELS.length - 1, i + 1));
  store.set('unlocked', unlocked);
};
game.onFinished = () => {
  setTimeout(() => { document.exitPointerLock?.(); started = false; showMenu('start'); }, 4000);
};

$('btn-play').textContent = unlocked > 0 ? `Continue · Chamber ${String(unlocked).padStart(2, '0')}` : 'Start testing';
$('btn-new').hidden = unlocked === 0;

// preview level behind the start menu
game.loadLevel(Math.min(unlocked, LEVELS.length - 1));
hud.clearSay();
showMenu('start');

// --- main loop -------------------------------------------------------------
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, fpsV = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { fpsV = fpsN / fpsT; fpsT = 0; fpsN = 0; }
  hud.fps(fpsV, settings.showFps && playing);

  if (playing) {
    input.forward = (pressed('forward') ? 1 : 0) - (pressed('back') ? 1 : 0);
    input.side = (pressed('right') ? 1 : 0) - (pressed('left') ? 1 : 0);
    input.jump = pressed('jump');
    input.duck = pressed('duck');
    if (pressed('restart')) {
      restartHeld += dt;
      if (restartHeld > 1) { restartHeld = 0; keys.delete('KeyR'); game.restart(); }
    } else restartHeld = 0;
    hud.restartProgress(restartHeld);
    acc += dt;
    let n = 0;
    while (acc >= TICK && n < 12) { game.update(TICK, input); acc -= TICK; n++; }
    if (n === 12) acc = 0;
  } else if (!started && !window.__test) {
    // slow attract-mode camera pan on the start screen
    game.player.yaw += dt * 0.05;
    game.time += dt;
    acc = 0;
  }
  game.render(dt, playing ? acc / TICK : 1, look);
  look.dx = look.dy = 0;
}
requestAnimationFrame(frame);
