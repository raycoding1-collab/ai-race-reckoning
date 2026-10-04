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

function cubeFace(size, companion = false) {
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
  if (companion) {
    ctx.fillStyle = '#f08fb4';
    const cx = size / 2, cy = size / 2 + size * 0.02, r = size * 0.075;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 1.6);
    ctx.bezierCurveTo(cx - r * 2.4, cy + r * 0.2, cx - r * 1.3, cy - r * 1.7, cx, cy - r * 0.5);
    ctx.bezierCurveTo(cx + r * 1.3, cy - r * 1.7, cx + r * 2.4, cy + r * 0.2, cx, cy + r * 1.6);
    ctx.fill();
  } else {
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.11, 0, Math.PI * 2); ctx.fill();
  }
  if (!companion) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.05, 0, Math.PI * 2); ctx.fill();
  } else {
    // small hearts in the corner bumpers
    ctx.fillStyle = '#e981a8';
    for (const [x, y] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      ctx.beginPath(); ctx.arc(x * size, y * size, size * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  }
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

// Rusty industrial metal for the maintenance areas behind the test chambers.
function rustPanels(size, seed) {
  const [c, ctx] = canvas(size);
  const r = rng(seed);
  ctx.fillStyle = '#5a534b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = r() * size, y = r() * size, rad = 6 + r() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() < 0.6;
    g.addColorStop(0, warm ? `rgba(${120 + r() * 40},${60 + r() * 30},${30},${0.25 + r() * 0.3})` : `rgba(20,20,20,${0.2 + r() * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  noise(ctx, size, 26, seed + 3, 8);
  // drip streaks
  for (let i = 0; i < 40; i++) {
    const x = r() * size, len = 40 + r() * 200;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(90,45,20,0.35)'); g.addColorStop(1, 'rgba(90,45,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x, r() * size, 2 + r() * 3, len);
  }
  const step = size / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let i = 0; i <= 2; i++) { ctx.fillRect(i * step - 3, 0, 6, size); ctx.fillRect(0, i * step - 3, size, 6); }
  ctx.fillStyle = 'rgba(200,170,140,0.25)';
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) for (let k = 0; k < 8; k++) {
    const bx = x * step + 10 + (k % 4) * (step - 20) / 3, by = y * step + (k < 4 ? 10 : step - 10);
    ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

// Rough poured concrete (portalable, like the original's escape areas).
function concrete(size, seed) {
  const [c, ctx] = canvas(size);
  const r = rng(seed);
  ctx.fillStyle = '#8d8a84';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    const x = r() * size, y = r() * size, rad = 2 + r() * 30;
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.07})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  noise(ctx, size, 30, seed + 1);
  // form-work lines and tie holes
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, size / 2 - 1, size, 2); ctx.fillRect(0, 0, size, 1);
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    ctx.beginPath(); ctx.arc(x * size, y * size, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  }
  return c;
}

// Graffiti for the hidden dens: scrawls drawn in marker on a transparent sheet.
export function makeGraffiti(lines, seed, renderer) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  lines.forEach((t, i) => {
    ctx.save();
    ctx.translate(60 + r() * 120, 110 + i * 150 + r() * 30);
    ctx.rotate((r() - 0.5) * 0.12);
    ctx.font = `${52 + r() * 20}px "Comic Sans MS", "Marker Felt", "Segoe Print", cursive`;
    const w = ctx.measureText(t).width, room = W - 260;
    if (w > room) ctx.scale(room / w, room / w);
    ctx.fillStyle = ['#d8d2c4', '#e3b35b', '#c4d6e0'][i % 3];
    ctx.globalAlpha = 0.85;
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
  // arrow and a few cube doodles
  ctx.strokeStyle = 'rgba(230,220,200,0.8)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(700, 420); ctx.lineTo(960, 420); ctx.moveTo(920, 385); ctx.lineTo(962, 420); ctx.lineTo(920, 455); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const x = 760 + i * 70, y = 90 + r() * 120;
    ctx.strokeRect(x, y, 46, 46);
    ctx.beginPath(); ctx.moveTo(x + 23, y + 34); ctx.bezierCurveTo(x + 6, y + 22, x + 12, y + 8, x + 23, y + 16); ctx.bezierCurveTo(x + 34, y + 8, x + 40, y + 22, x + 23, y + 34); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  return t;
}

// Tangent-space normal map derived from a texture's brightness (grooves and
// seams are darker, so they read as recessed). Wraps at the edges so it tiles.
function normalFrom(src, strength, renderer) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const [c, ctx] = canvas(w);
  const img = ctx.createImageData(w, h);
  const o = img.data;
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    o[i] = (nx * 0.5 + 0.5) * 255; o[i + 1] = (ny * 0.5 + 0.5) * 255; o[i + 2] = (nz * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, renderer);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Roughness map: base roughness plus variation from the albedo (stains and
// seams are rougher, clean panel faces a little glossier).
function roughFrom(src, base, spread, renderer) {
  const w = src.width;
  const d = src.getContext('2d').getImageData(0, 0, w, w).data;
  const [c, ctx] = canvas(w);
  const img = ctx.createImageData(w, w);
  const o = img.data;
  for (let i = 0; i < w * w; i++) {
    const l = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    const v = Math.max(0, Math.min(1, base + (0.6 - l) * spread)) * 255;
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, renderer);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createTextures(renderer) {
  const T = (c) => toTexture(c, renderer);
  const src = {
    whiteWall: whitePanels(512, { seed: 11, base: '#dfe2e3', div: 2, vary: 16, noise: 10, seam: 5, seamColor: 'rgba(70,76,80,0.75)', bolts: false }),
    whiteFloor: whitePanels(512, { seed: 21, base: '#c9ccce', div: 4, vary: 18, noise: 14, seam: 4, seamColor: 'rgba(60,64,68,0.8)', bolts: true }),
    whiteCeil: whitePanels(512, { seed: 31, base: '#d4d7d8', div: 2, vary: 10, noise: 8, seam: 4, seamColor: 'rgba(70,76,80,0.6)', bolts: false }),
    metalWall: metalPanels(512, { seed: 41, base: '#4a4e52', div: 2, noise: 22, streak: 10 }),
    metalFloor: metalGrate(512, 51),
    metalCeil: metalPanels(512, { seed: 61, base: '#3c3f42', div: 2, noise: 16, streak: 6 }),
    rustWall: rustPanels(512, 71),
    rustFloor: metalGrate(512, 81),
    rustCeil: rustPanels(512, 91),
    concWall: concrete(512, 101),
    concFloor: concrete(512, 111),
    concCeil: concrete(512, 121),
  };
  const out = {};
  for (const [k, c] of Object.entries(src)) {
    out[k] = T(c);
    const white = k.startsWith('white') || k.startsWith('conc');
    out[k + 'N'] = normalFrom(c, white ? 2.2 : 3.2, renderer);
    out[k + 'R'] = roughFrom(c, white ? 0.62 : 0.5, white ? 0.6 : 0.5, renderer);
  }
  return {
    ...out,
    light: T(lightPanel(256)),
    cube: T(cubeFace(256)),
    companion: T(cubeFace(256, true)),
  };
}
