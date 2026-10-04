import * as THREE from 'three';

// Procedural textures. Every texture is generated at load time so the game
// ships with no image assets and tiles seamlessly in world space.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, amount, seed, streak = 0) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const r = rng(seed);
  let row = 0;
  for (let y = 0; y < size; y++) {
    if (streak) row = (r() - 0.5) * streak;
    for (let x = 0; x < size; x++) {
      const n = (r() - 0.5) * amount + row;
      const i = (y * size + x) * 4;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function toTexture(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Light concrete panels: 512px covers 128 units, panels every 64 units.
function whitePanels(size, opts) {
  const [c, ctx] = canvas(size);
  const r = rng(opts.seed);
  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);
  const step = size / opts.div;
  for (let y = 0; y < opts.div; y++) {
    for (let x = 0; x < opts.div; x++) {
      const v = Math.floor((r() - 0.5) * opts.vary);
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      ctx.fillRect(x * step, y * step, step, step);
      // soft vignette on each panel to sell the bevel
      const g = ctx.createRadialGradient(
        x * step + step / 2, y * step + step / 2, step * 0.2,
        x * step + step / 2, y * step + step / 2, step * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = g;
      ctx.fillRect(x * step, y * step, step, step);
    }
  }
  noise(ctx, size, opts.noise, opts.seed + 1);
  // seams: dark groove with a light lip, drawn half on each edge so it tiles
  const seam = opts.seam;
  for (let i = 0; i <= opts.div; i++) {
    const p = i * step;
    ctx.fillStyle = opts.seamColor;
    ctx.fillRect(p - seam / 2, 0, seam, size);
    ctx.fillRect(0, p - seam / 2, size, seam);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(p + seam / 2, 0, 1.5, size);
    ctx.fillRect(0, p + seam / 2, size, 1.5);
  }
  if (opts.bolts) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < opts.div; y++) for (let x = 0; x < opts.div; x++) {
      for (const [bx, by] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]]) {
        ctx.beginPath();
        ctx.arc(x * step + bx * step, y * step + by * step, size / 220, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return c;
}

function metalPanels(size, opts) {
  const [c, ctx] = canvas(size);
  const r = rng(opts.seed);
  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, opts.noise, opts.seed, opts.streak);
  const step = size / opts.div;
  for (let y = 0; y < opts.div; y++) for (let x = 0; x < opts.div; x++) {
    const v = (r() - 0.5) * 0.12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(x * step, y * step, step, step);
  }
  for (let i = 0; i <= opts.div; i++) {
    const p = i * step;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p - 2, 0, 4, size);
    ctx.fillRect(0, p - 2, size, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(p + 2, 0, 1, size);
    ctx.fillRect(0, p + 2, size, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let y = 0; y < opts.div; y++) for (let x = 0; x < opts.div; x++) {
    for (let k = 0; k < 4; k++) {
      const bx = x * step + (k % 2 ? step - 10 : 10);
      const by = y * step + (k > 1 ? step - 10 : 10);
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  return c;
}

function metalGrate(size, seed) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#2b2e31';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 18, seed);
  const n = 16, s = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x * s + 3, y * s + 3, s - 6, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  for (let i = 0; i <= 2; i++) {
    ctx.fillRect(i * size / 2 - 3, 0, 6, size);
    ctx.fillRect(0, i * size / 2 - 3, size, 6);
  }
  return c;
}

function lightPanel(size) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#9aa2a8';
  ctx.fillRect(0, 0, size, size);
  const step = size / 4;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const g = ctx.createLinearGradient(0, y * step, 0, y * step + step);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#f4fbff');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(x * step + 6, y * step + 6, step - 12, step - 12);
  }
  return c;
}

function cubeFace(size) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#6b7075';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 14, 77);
  // light inner panel
  const m = size * 0.16;
  ctx.fillStyle = '#c9cdd0';
  ctx.fillRect(m, m, size - 2 * m, size - 2 * m);
  // dark corner bumpers
  ctx.fillStyle = '#3d4145';
  const k = size * 0.3;
  for (const [x, y] of [[0, 0], [size - k, 0], [0, size - k], [size - k, size - k]]) {
    ctx.beginPath();
    ctx.moveTo(x + (x ? k : 0), y + (y ? k : 0));
    ctx.lineTo(x + (x ? 0 : k), y + (y ? k : 0));
    ctx.lineTo(x + (x ? k : 0), y + (y ? 0 : k));
    ctx.closePath();
    ctx.fillRect(x, y, k, k);
  }
  // emblem ring
  ctx.strokeStyle = '#5b6064';
  ctx.lineWidth = size * 0.06;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#8fd0ff';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  return c;
}

export function makeSignTexture(number, title, icons, renderer, last = 9) {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f3f1';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b1d1f';
  ctx.font = '700 300px "Archivo", "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(String(number).padStart(2, '0'), 30, 20);
  ctx.fillRect(30, 330, W - 60, 4);
  ctx.font = '600 34px "IBM Plex Mono", monospace';
  ctx.fillText(String(number).padStart(2, '0') + '/' + String(last).padStart(2, '0'), 34, 352);
  // progress bar
  ctx.fillStyle = '#d4d6d4';
  ctx.fillRect(30, 410, W - 60, 22);
  ctx.fillStyle = '#1b1d1f';
  ctx.fillRect(30, 410, (W - 60) * Math.min(1, (number + 1) / (last + 1)), 22);
  ctx.font = '600 30px "IBM Plex Sans", Arial, sans-serif';
  const words = title.toUpperCase();
  ctx.fillText(words, 34, 456);
  // icon grid
  const all = ['cube', 'button', 'portal', 'fling', 'fizzler', 'pellet', 'plate', 'goo', 'fall', 'drink'];
  const iw = (W - 60) / 5;
  all.forEach((name, i) => {
    const x = 30 + (i % 5) * iw, y = 560 + Math.floor(i / 5) * (iw + 20);
    const on = icons.includes(name);
    ctx.fillStyle = on ? '#1b1d1f' : '#d4d6d4';
    ctx.fillRect(x + 6, y, iw - 12, iw - 12);
    ctx.strokeStyle = on ? '#f2f3f1' : '#b9bcba';
    ctx.fillStyle = on ? '#f2f3f1' : '#b9bcba';
    ctx.lineWidth = 6;
    const cx = x + iw / 2, cy = y + (iw - 12) / 2, s = iw * 0.28;
    ctx.beginPath();
    switch (name) {
      case 'cube': ctx.strokeRect(cx - s, cy - s, 2 * s, 2 * s); break;
      case 'button': ctx.ellipse(cx, cy + s * 0.4, s, s * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillRect(cx - 4, cy - s, 8, s); break;
      case 'portal': ctx.ellipse(cx, cy, s * 0.6, s, 0, 0, Math.PI * 2); ctx.stroke(); break;
      case 'fling': ctx.moveTo(cx - s, cy + s); ctx.quadraticCurveTo(cx, cy - 1.6 * s, cx + s, cy + s); ctx.stroke(); break;
      case 'fizzler': for (let k = -1; k <= 1; k++) { ctx.moveTo(cx + k * s * 0.6, cy - s); ctx.lineTo(cx + k * s * 0.6, cy + s); } ctx.stroke(); break;
      case 'pellet': ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke(); break;
      case 'plate': ctx.moveTo(cx - s, cy + s * 0.6); ctx.lineTo(cx + s, cy + s * 0.6); ctx.moveTo(cx, cy + s * 0.4); ctx.lineTo(cx, cy - s); ctx.lineTo(cx - s * 0.4, cy - s * 0.5); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.4, cy - s * 0.5); ctx.stroke(); break;
      case 'goo': for (let k = 0; k < 2; k++) { ctx.moveTo(cx - s, cy + k * s * 0.7); ctx.quadraticCurveTo(cx - s / 2, cy - s * 0.4 + k * s * 0.7, cx, cy + k * s * 0.7); ctx.quadraticCurveTo(cx + s / 2, cy + s * 0.4 + k * s * 0.7, cx + s, cy + k * s * 0.7); } ctx.stroke(); break;
      case 'fall': ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.5, cy + s * 0.5); ctx.moveTo(cx, cy + s); ctx.lineTo(cx + s * 0.5, cy + s * 0.5); ctx.stroke(); break;
      case 'drink': ctx.moveTo(cx - s * 0.6, cy - s); ctx.lineTo(cx - s * 0.4, cy + s); ctx.lineTo(cx + s * 0.4, cy + s); ctx.lineTo(cx + s * 0.6, cy - s); ctx.stroke(); break;
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  return t;
}

export function createTextures(renderer) {
  const T = (c) => toTexture(c, renderer);
  return {
    whiteWall: T(whitePanels(512, { seed: 11, base: '#dfe2e3', div: 2, vary: 16, noise: 10, seam: 5, seamColor: 'rgba(70,76,80,0.75)', bolts: false })),
    whiteFloor: T(whitePanels(512, { seed: 21, base: '#c9ccce', div: 4, vary: 18, noise: 14, seam: 4, seamColor: 'rgba(60,64,68,0.8)', bolts: true })),
    whiteCeil: T(whitePanels(512, { seed: 31, base: '#d4d7d8', div: 2, vary: 10, noise: 8, seam: 4, seamColor: 'rgba(70,76,80,0.6)', bolts: false })),
    metalWall: T(metalPanels(512, { seed: 41, base: '#4a4e52', div: 2, noise: 22, streak: 10 })),
    metalFloor: T(metalGrate(512, 51)),
    metalCeil: T(metalPanels(512, { seed: 61, base: '#3c3f42', div: 2, noise: 16, streak: 6 })),
    light: T(lightPanel(256)),
    cube: T(cubeFace(256)),
  };
}
