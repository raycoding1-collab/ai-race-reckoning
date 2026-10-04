// Touch edition entry point. The game itself (engine, physics, rendering,
// chambers) is shared with the desktop build; only input, layout and the
// quality defaults differ.
import * as THREE from 'three';
import { TICK } from '../js/constants.js';
import { Game } from '../js/game.js';
import { Audio } from '../js/audio.js';
import { Hud } from '../js/hud.js';
import { LEVELS } from '../js/levels.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('momentum:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('momentum:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// --- renderer ---------------------------------------------------------------
const canvas = $('game');
const dpr = window.devicePixelRatio || 1;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, stencil: true, powerPreference: 'high-performance' });
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

const defaults = {
  voice: true, subtitles: false, fov: 80, sensitivity: 1, invertY: false, volume: 0.7, depth: 3, showFps: false,
  resolution: dpr >= 3 ? 0.55 : dpr >= 2 ? 0.7 : 1, buttons: 1, duckToggle: false, haptics: true,
};
const settings = Object.assign({}, defaults, store.get('settings-touch', {}));
game.settings = settings;
let unlocked = Math.max(0, Math.min(LEVELS.length - 1, store.get('unlocked', 0)));

// Dynamic resolution: drop render scale when the frame rate sags, raise it
// again when there is headroom, so the game stays smooth on any phone.
let dyn = 1;
// Always landscape: when the phone is held upright (or the frame is taller
// than wide, as inside embeds where orientation lock is not allowed), the
// whole page is rotated 90 degrees so the game still plays sideways.
let rot = false;
const W = () => (rot ? window.innerHeight : window.innerWidth);
const H = () => (rot ? window.innerWidth : window.innerHeight);
function applyRotation() {
  rot = window.innerHeight > window.innerWidth;
  const b = document.body;
  b.classList.toggle('rot', rot);
  b.style.width = rot ? window.innerHeight + 'px' : '';
  b.style.height = rot ? window.innerWidth + 'px' : '';
  b.style.transform = rot ? `translateX(${window.innerWidth}px) rotate(90deg)` : '';
}
// screen point -> point in the (possibly rotated) page
const local = (t) => (rot ? [t.clientY, window.innerWidth - t.clientX] : [t.clientX, t.clientY]);
function resize() {
  applyRotation();
  const w = W(), h = H();
  document.body.classList.toggle('compact', h < 520);
  renderer.setPixelRatio(Math.min(dpr, 2) * settings.resolution * dyn);
  renderer.setSize(w, h, false);
  game.resize(w, h);
  document.documentElement.style.setProperty('--bs', settings.buttons);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// --- input ------------------------------------------------------------------
const input = { forward: 0, side: 0, jump: false, duck: false, use: false, fire1: false, fire2: false };
const look = { dx: 0, dy: 0 };
const touches = new Map();          // identifier -> { role, x, y, ox, oy, el }
const stick = $('stick'), knob = $('stick-knob');
const STICK_R = 54;
let playing = false, started = false, duckLatched = false;

const buzz = (ms) => { if (settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* unsupported */ } };

function press(el, down) {
  el.classList.toggle('down', down);
  if (!down) return;
  buzz(8);
  switch (el.id) {
    case 't-blue': input.fire1 = true; break;
    case 't-orange': input.fire2 = true; break;
    case 't-use': input.use = true; break;
    case 't-duck': if (settings.duckToggle) { duckLatched = !duckLatched; el.classList.toggle('on', duckLatched); } break;
    case 't-pause': pause(); break;
  }
}

function heldButton(id) {
  for (const t of touches.values()) if (t.role === 'btn' && t.el.id === id) return true;
  return false;
}

function onStart(e) {
  if (!playing) return;
  // only the game view and the control buttons belong to the game; let taps
  // on overlays (menus) through as normal clicks
  const t0 = e.changedTouches[0];
  if (t0 && t0.target !== canvas && !(t0.target.closest && t0.target.closest('#touch'))) return;
  e.preventDefault();
  audio.init();
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('.tb');
    if (btn) { touches.set(t.identifier, { role: 'btn', el: btn }); press(btn, true); continue; }
    const [lx, ly] = local(t);
    const leftSide = lx < W() * 0.42;
    const hasStick = [...touches.values()].some((v) => v.role === 'stick');
    if (leftSide && !hasStick) {
      touches.set(t.identifier, { role: 'stick', ox: lx, oy: ly, x: lx, y: ly });
      stick.style.transform = `translate(${lx}px, ${ly}px)`;
      stick.classList.add('on');
      knob.style.transform = '';
    } else {
      touches.set(t.identifier, { role: 'look', x: lx, y: ly });
    }
  }
}

function onMove(e) {
  if (!playing) return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier);
    if (!s) continue;
    const [lx, ly] = local(t);
    if (s.role === 'look') {
      // radians per CSS pixel, scaled with field of view so it feels the same at any FOV
      const k = settings.sensitivity * 0.0052 * (settings.fov / 80);
      const dx = (lx - s.x) * k, dy = (ly - s.y) * k * (settings.invertY ? -1 : 1);
      game.player.look(dx, dy);
      look.dx += dx; look.dy += dy;
    }
    s.x = lx; s.y = ly;
    if (s.role === 'stick') {
      let dx = s.x - s.ox, dy = s.y - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        // drag the stick base along when the thumb overshoots
        s.ox += (dx / len) * (len - STICK_R); s.oy += (dy / len) * (len - STICK_R);
        dx = s.x - s.ox; dy = s.y - s.oy;
        stick.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
}

function onEnd(e) {
  for (const t of e.changedTouches) {
    const s = touches.get(t.identifier);
    if (!s) continue;
    if (s.role === 'btn') press(s.el, false);
    if (s.role === 'stick') stick.classList.remove('on');
    touches.delete(t.identifier);
  }
}

for (const ev of ['touchstart']) document.addEventListener(ev, onStart, { passive: false });
document.addEventListener('touchmove', onMove, { passive: false });
document.addEventListener('touchend', onEnd);
document.addEventListener('touchcancel', onEnd);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

function readStick() {
  for (const s of touches.values()) {
    if (s.role !== 'stick') continue;
    let x = (s.x - s.ox) / STICK_R, y = (s.y - s.oy) / STICK_R;
    const m = Math.hypot(x, y);
    if (m < 0.14) return [0, 0];
    // rescale past the dead zone so small pushes still give fine control
    const k = Math.min(1, (m - 0.14) / 0.86) / m;
    x *= k; y *= k;
    return [x, -y];
  }
  return [0, 0];
}

// hardware keyboards and gamepads still work on tablets
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'KeyE' && !e.repeat) input.use = true;
  if (e.code === 'Escape') pause();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// --- menus ------------------------------------------------------------------
let menuBack = 'start';
function showMenu(which) {
  for (const id of ['menu-start', 'menu-pause', 'menu-chambers', 'menu-settings', 'menu-help']) $(id).hidden = id !== 'menu-' + which;
  $('overlay').hidden = !which;
  document.body.classList.toggle('in-menu', !!which);
  playing = !which && started;
  if (which === 'chambers') buildChambers();
  if (which) { touches.clear(); stick.classList.remove('on'); for (const b of document.querySelectorAll('.tb')) b.classList.remove('down'); }
}

function goFullscreen() {
  audio.init();
  audio.setVolume(settings.volume);
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch { /* not allowed */ }
  }
}

function resume() { goFullscreen(); showMenu(null); }
function pause() { if (started) showMenu('pause'); }

function startLevel(i) {
  started = true;
  game.loadLevel(i);
  duckLatched = false;
  $('t-duck').classList.remove('on');
  resume();
}


$('btn-play').addEventListener('click', () => startLevel(Math.min(unlocked, LEVELS.length - 1)));
$('btn-new').addEventListener('click', () => startLevel(0));
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { game.restart(); resume(); });
for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => { menuBack = b.dataset.from || (started ? 'pause' : 'start'); showMenu(b.dataset.open); });
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
    store.set('settings-touch', settings);
    if (key === 'volume') audio.setVolume(settings.volume);
    if (key === 'resolution') dyn = 1;
    if (['fov', 'resolution', 'buttons'].includes(key)) resize();
    if (key === 'duckToggle') { duckLatched = false; $('t-duck').classList.remove('on'); }
  });
}
const pct = (v) => Math.round(v * 100) + '%';
{ const r = $('set-sens'); r.min = '0.3'; r.max = '3'; r.step = '0.05'; }
if ($('sens-label')) $('sens-label').textContent = 'Look sensitivity';
if ($('invert-label')) $('invert-label').textContent = 'Invert look Y';
bindSetting('set-sens', 'sensitivity', parseFloat, (v) => v.toFixed(2));
bindSetting('set-fov', 'fov', parseInt);
bindSetting('set-depth', 'depth', parseInt);
bindSetting('set-res', 'resolution', parseFloat, pct);
bindSetting('set-btn', 'buttons', parseFloat, pct);
bindSetting('set-vol', 'volume', parseFloat, pct);
bindSetting('set-invert', 'invertY');
bindSetting('set-ducktoggle', 'duckToggle');
bindSetting('set-haptics', 'haptics');
bindSetting('set-fps', 'showFps');
bindSetting('set-voice', 'voice');
bindSetting('set-subs', 'subtitles');

game.onComplete = (i) => {
  unlocked = Math.max(unlocked, Math.min(LEVELS.length - 1, i + 1));
  store.set('unlocked', unlocked);
};
game.onFinished = () => { setTimeout(() => { started = false; showMenu('start'); }, 4000); };

// announcer lines are written for keyboard and mouse; reword them for touch
const TOUCH_WORDS = [
  ['W, A, S, D to move. Mouse to look.', 'Drag on the left of the screen to move and on the right to look.'],
  ['Press E to pick it up, and E again to put it down.', 'Tap Grab to pick it up, and Grab again to put it down.'],
  ['Left mouse places the blue portal', 'The blue button places the blue portal'],
  ['Right mouse now places the orange portal.', 'The orange button now places the orange portal.'],
];
game.reword = (text) => TOUCH_WORDS.reduce((t, [a, b]) => t.replace(a, b), text);

// feedback: buzz when hurt, longer on death
let lastHp = 100;
game.events.on('fizzle', () => buzz(20));
game.events.on('land', (e) => { if (e.speed > 500) buzz(15); });

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
document.addEventListener('fullscreenchange', () => setTimeout(resize, 100));

$('btn-play').textContent = unlocked > 0 ? `Continue · Chamber ${String(unlocked).padStart(2, '0')}` : 'Start testing';
$('btn-new').hidden = unlocked === 0;

resize();
game.loadLevel(Math.min(unlocked, LEVELS.length - 1));
hud.clearSay();
showMenu('start');

// --- main loop -------------------------------------------------------------
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, fpsV = 60, slow = 0, fast = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) {
    fpsV = fpsN / fpsT; fpsT = 0; fpsN = 0;
    if (playing) {
      // adapt render scale every couple of seconds
      // react within a second to drops, recover slowly to avoid see-sawing
      if (fpsV < 50) { slow++; fast = 0; } else if (fpsV > 58) { fast++; slow = 0; } else { slow = fast = 0; }
      if (slow >= 2 && dyn > 0.5) { dyn = Math.max(0.5, dyn - (fpsV < 35 ? 0.2 : 0.1)); slow = 0; resize(); }
      if (fast >= 10 && dyn < 1) { dyn = Math.min(1, dyn + 0.05); fast = 0; resize(); }
    }
  }
  hud.fps(fpsV, settings.showFps && playing);

  if (playing) {
    const [sx, sy] = readStick();
    const kf = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const ks = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    input.forward = kf || sy;
    input.side = ks || sx;
    input.jump = heldButton('t-jump') || keys.has('Space');
    input.duck = settings.duckToggle ? duckLatched : heldButton('t-duck') || keys.has('ControlLeft');
    acc += dt;
    let n = 0;
    while (acc >= TICK && n < 12) { game.update(TICK, input); acc -= TICK; n++; }
    if (n === 12) acc = 0;
    const hp = game.player.health;
    if (hp < lastHp - 2) buzz(hp <= 0 ? 120 : 10);
    lastHp = hp;
  } else if (!started && !window.__test) {
    game.player.yaw += dt * 0.05;
    game.time += dt;
    acc = 0;
  }
  game.render(dt, playing ? acc / TICK : 1, look);
  look.dx = look.dy = 0;
}
requestAnimationFrame(frame);
