import * as THREE from 'three';

// Procedural textures. Every texture is generated at load time so the game
// ships with no image assets and tiles seamlessly in world space.
//
// World UVs are position / 128, so one texture repeat covers 128 units
// (4 grid cells). Surfaces are built as float buffers: an sRGB albedo, a
// height field in world units (turned into a tangent-space normal map) and a
// roughness field, so seams, bevels, grime and gloss all line up.

const UNITS = 128;
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

function canvas(size, h = size, read = false) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return [c, c.getContext('2d', read ? { willReadFrequently: true } : undefined)];
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

// Linear-data texture (normal / roughness). Rows are written bottom-up so it
// lines up with the flipped canvas albedo; the CPU copy is dropped once the
// GPU has it.
function dataTexture(data, n, renderer) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  t.onUpdate = () => { t.image.data = null; t.onUpdate = null; };
  return t;
}

// ---------------------------------------------------------------------------
// Shared tileable noise fields (cached per size, sampled with offsets)

const fieldCache = new Map();
// Value-noise fBm with `period` lattice cells across the texture; normalised
// to roughly [-1, 1]. Smooth fields are computed at up to `res` pixels and
// upsampled, which keeps 1024px surfaces cheap.
function fbm(n, period, octaves, seed, res = 512) {
  const key = `${n}|${period}|${octaves}|${seed}|${res}`;
  if (fieldCache.has(key)) return fieldCache.get(key);
  const nn = Math.min(n, res);
  if (nn < n) {
    // compute at the lower resolution (shared with smaller surfaces) and upsample
    const src = fbm(nn, period, octaves, seed, res), up = new Float32Array(n * n), sh = Math.log2(n / nn);
    for (let y = 0; y < n; y++) {
      const so = (y >> sh) * nn, row = y * n;
      for (let x = 0; x < n; x++) up[row + x] = src[so + (x >> sh)];
    }
    fieldCache.set(key, up);
    return up;
  }
  const out = new Float32Array(nn * nn);
  const xi0 = new Int32Array(nn), xi1 = new Int32Array(nn), tx = new Float32Array(nn);
  let amp = 1, p = period;
  for (let o = 0; o < octaves && p <= nn; o++) {
    const r = rng(seed * 7919 + o * 104729 + 1);
    const L = new Float32Array(p * p);
    for (let i = 0; i < p * p; i++) L[i] = r();
    for (let x = 0; x < nn; x++) {
      const f = x * p / nn, i0 = Math.floor(f), t = f - i0;
      xi0[x] = i0 % p; xi1[x] = (i0 + 1) % p; tx[x] = t * t * (3 - 2 * t);
    }
    // interpolate each lattice row along x, then blend rows along y
    const rows = new Float32Array(p * nn);
    for (let j = 0; j < p; j++) {
      const lr = j * p, rr = j * nn;
      for (let x = 0; x < nn; x++) { const a = L[lr + xi0[x]]; rows[rr + x] = a + (L[lr + xi1[x]] - a) * tx[x]; }
    }
    for (let y = 0; y < nn; y++) {
      const f = y * p / nn, j0 = Math.floor(f), tt = f - j0, ty = tt * tt * (3 - 2 * tt);
      const r0 = (j0 % p) * nn, r1 = ((j0 + 1) % p) * nn, row = y * nn;
      for (let x = 0; x < nn; x++) { const a = rows[r0 + x]; out[row + x] += amp * (a + (rows[r1 + x] - a) * ty); }
    }
    amp *= 0.5; p *= 2;
  }
  const NN = nn * nn;
  let mean = 0, sq = 0;
  for (let i = 0; i < NN; i++) mean += out[i];
  mean /= NN;
  for (let i = 0; i < NN; i++) { const v = out[i] - mean; sq += v * v; }
  const inv = 1 / (3 * Math.sqrt(sq / NN) + 1e-6);
  for (let i = 0; i < NN; i++) out[i] = (out[i] - mean) * inv;
  fieldCache.set(key, out);
  return out;
}

function grain(n) {
  const key = `g${n}`;
  if (fieldCache.has(key)) return fieldCache.get(key);
  const out = new Float32Array(n * n), r = rng(n * 31 + 7);
  for (let i = 0; i < n * n; i++) out[i] = r() * 2 - 1;
  fieldCache.set(key, out);
  return out;
}

// Brushed-metal streaks: per-row random tone with a slow integer-period wobble
// along the row (so it tiles). Sample transposed for vertical brushing.
// Brushed-metal streaks: per-line random tone with a slow integer-period
// wobble along the line (so it tiles). `vertical` runs the streaks along y.
function brushed(n, seed, vertical = false) {
  const key = `b${n}|${seed}|${vertical}`;
  if (fieldCache.has(key)) return fieldCache.get(key);
  const out = new Float32Array(n * n), r = rng(seed);
  const base = new Float32Array(n), amp = new Float32Array(n), frq = new Float32Array(n), ph = new Float32Array(n);
  let prev = 0;
  for (let l = 0; l < n; l++) {
    base[l] = prev = prev * 0.55 + (r() * 2 - 1) * 0.45;
    frq[l] = (1 + Math.floor(r() * 3)) * Math.PI * 2 / n; ph[l] = r() * Math.PI * 2; amp[l] = (0.25 + r() * 0.35) * 0.5;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = vertical ? x : y, p = vertical ? y : x;
    out[y * n + x] = base[l] + amp[l] * Math.sin(p * frq[l] + ph[l]);
  }
  fieldCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Surface buffers

// Buffers are pooled per size: every generator writes every pixel.
const pool = new Map();
function buf(name, n, len) {
  const key = name + n;
  let b = pool.get(key);
  if (!b) { b = new Float32Array(len); pool.set(key, b); }
  return b;
}
class Surf {
  constructor(n) {
    this.n = n;
    this.k = n / UNITS;                            // pixels per world unit
    this.alb = buf('alb', n, n * n * 3);           // sRGB 0..1
    this.h = buf('h', n, n * n);                   // height in world units
    this.rough = buf('rough', n, n * n);
  }
}

// Panel layout on the 4x4 cell grid of one repeat. rects are [x, y, w, h] in
// cells (image space, y down) and may wrap past the edge. Per pixel: panel
// index, distance to the panel edge (units) and nearest side (0 L,1 R,2 T,3 B).
function layout(n, rects) {
  const k = n / UNITS, cell = 32 * k, m = n - 1;
  const id = new Uint8Array(n * n), d = buf('d', n, n * n), side = new Uint8Array(n * n);
  rects.forEach(([x, y, w, h], i) => {
    const X0 = Math.round(x * cell), Y0 = Math.round(y * cell), X1 = Math.round((x + w) * cell), Y1 = Math.round((y + h) * cell);
    for (let py = Y0; py < Y1; py++) {
      const v = (py + 0.5 - Y0) / k, vb = (Y1 - py - 0.5) / k, row = (py & m) * n;
      for (let px = X0; px < X1; px++) {
        const u = (px + 0.5 - X0) / k, ub = (X1 - px - 0.5) / k;
        let dd = u, s = 0;
        if (ub < dd) { dd = ub; s = 1; }
        if (v < dd) { dd = v; s = 2; }
        if (vb < dd) { dd = vb; s = 3; }
        const j = row + (px & m);
        id[j] = i; d[j] = dd; side[j] = s;
      }
    }
  });
  return { id, d, side };
}

const grid4 = () => { const r = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) r.push([x, y, 1, 1]); return r; };

// Decal masks drawn with canvas 2D: three independent channels (R, G, B)
// accumulated additively. Shapes are repeated across the edges so they tile.
function decals(n, seed, draw) {
  const [, ctx] = canvas(n, n, true);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const k = n / UNITS;
  const wrap = (x0, y0, x1, y1, f) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const X = ox * n, Y = oy * n;
      if (x1 + X < 0 || x0 + X > n || y1 + Y < 0 || y0 + Y > n) continue;
      f(X, Y);
    }
  };
  const col = (ch, a) => (ch === 0 ? `rgba(255,0,0,${a})` : ch === 1 ? `rgba(0,255,0,${a})` : `rgba(0,0,255,${a})`);
  const api = {
    k, n, r: rng(seed), ctx, col, wrap,
    // soft round blob
    blob(ch, x, y, rad, a, sx = 1, sy = 1) {
      wrap(x - rad * sx, y - rad * sy, x + rad * sx, y + rad * sy, (X, Y) => {
        ctx.save(); ctx.translate(x + X, y + Y); ctx.scale(sx, sy);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
        g.addColorStop(0, col(ch, a)); g.addColorStop(0.5, col(ch, a * 0.55)); g.addColorStop(1, col(ch, 0));
        ctx.fillStyle = g; ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
        ctx.restore();
      });
    },
    // hard dot
    dot(ch, x, y, rad, a) {
      wrap(x - rad, y - rad, x + rad, y + rad, (X, Y) => {
        ctx.fillStyle = col(ch, a); ctx.beginPath(); ctx.arc(x + X, y + Y, rad, 0, Math.PI * 2); ctx.fill();
      });
    },
    // vertical drip streak fading downward (image y down = world down on walls)
    streak(ch, x, y, w, len, a) {
      wrap(x - w, y, x + w, y + len, (X, Y) => {
        const g = ctx.createLinearGradient(0, y + Y, 0, y + Y + len);
        g.addColorStop(0, col(ch, a)); g.addColorStop(0.25, col(ch, a * 0.8)); g.addColorStop(1, col(ch, 0));
        ctx.fillStyle = g; ctx.fillRect(x + X - w / 2, y + Y, w, len);
      });
    },
    // short curved stroke
    scuff(ch, x, y, len, ang, bend, w, a) {
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      wrap(x - len, y - len, x + len, y + len, (X, Y) => {
        ctx.strokeStyle = col(ch, a); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x + X - dx, y + Y - dy);
        ctx.quadraticCurveTo(x + X - dy * bend, y + Y + dx * bend, x + X + dx, y + Y + dy);
        ctx.stroke();
      });
    },
    // branching random-walk crack
    crack(ch, x, y, len, ang, w, a, depth = 0) {
      const r = api.r, pts = [[x, y]];
      let px = x, py = y, an = ang;
      const segs = 6 + Math.floor(len / (3 * k));
      for (let i = 0; i < segs; i++) {
        an += (r() - 0.5) * 0.9;
        px += Math.cos(an) * len / segs; py += Math.sin(an) * len / segs;
        pts.push([px, py]);
        if (depth < 2 && r() < 0.12) api.crack(ch, px, py, len * (0.25 + r() * 0.3), an + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.8), w * 0.7, a * 0.8, depth + 1);
      }
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      wrap(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (X, Y) => {
        ctx.strokeStyle = col(ch, a); ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(pts[0][0] + X, pts[0][1] + Y);
        for (const p of pts) ctx.lineTo(p[0] + X, p[1] + Y);
        ctx.stroke();
      });
    },
  };
  draw(api);
  const d = ctx.getImageData(0, 0, n, n).data;
  const out = [buf('m0', n, n * n), buf('m1', n, n * n), buf('m2', n, n * n)];
  for (let i = 0, j = 0; i < n * n; i++, j += 4) { out[0][i] = d[j] / 255; out[1][i] = d[j + 1] / 255; out[2][i] = d[j + 2] / 255; }
  return out;
}

// Turn a surface into albedo canvas + normal / roughness data, and record its
// mean linear albedo (useful as a radiosity reflectivity).
function finish(S, renderer, bump = 1) {
  const n = S.n, N = n * n, m = n - 1;
  const [c, ctx] = canvas(n);
  const img = ctx.createImageData(n, n), a = img.data;
  let sr = 0, sg = 0, sb = 0;
  for (let i = 0; i < N; i++) {
    const r = clamp01(S.alb[i * 3]), g = clamp01(S.alb[i * 3 + 1]), b = clamp01(S.alb[i * 3 + 2]);
    a[i * 4] = r * 255 + 0.5; a[i * 4 + 1] = g * 255 + 0.5; a[i * 4 + 2] = b * 255 + 0.5; a[i * 4 + 3] = 255;
    if ((i & 15) === 0) { sr += r ** 2.2; sg += g ** 2.2; sb += b ** 2.2; }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, renderer);
  const cnt = N / 16;
  map.userData.avg = [sr / cnt, sg / cnt, sb / cnt];

  const nd = new Uint8Array(N * 4), rd = new Uint8Array(N * 4);
  const H = S.h, s = S.k * 0.5 * bump;
  for (let y = 0; y < n; y++) {
    const up = ((y - 1) & m) * n, dn = ((y + 1) & m) * n, row = y * n, o = (m - y) * n;
    for (let x = 0; x < n; x++) {
      const dx = (H[row + ((x + 1) & m)] - H[row + ((x - 1) & m)]) * s;
      const dy = (H[dn + x] - H[up + x]) * s;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const j = (o + x) * 4;
      nd[j] = (-dx * il * 0.5 + 0.5) * 255 + 0.5;
      nd[j + 1] = (dy * il * 0.5 + 0.5) * 255 + 0.5;
      nd[j + 2] = (il * 0.5 + 0.5) * 255 + 0.5;
      nd[j + 3] = 255;
      const rv = clamp01(S.rough[row + x]) * 255 + 0.5;
      rd[j] = rd[j + 1] = rd[j + 2] = rv; rd[j + 3] = 255;
    }
  }
  return { map, normal: dataTexture(nd, n, renderer), rough: dataTexture(rd, n, renderer) };
}

// Bevelled panel profile. d = distance to the panel edge (units). Sets PH
// (height) and PT (face weight: 0 in the gap, 1 on the face).
let PH = 0, PT = 0;
function panelProfile(d, gap, bev, depth) {
  if (d < gap) { PH = -depth; PT = 0; } else if (d < gap + bev) { const t = (d - gap) / bev, e = 1 - t; PH = -bev * 0.9 * e * e; PT = t; } else { PH = 0; PT = 1; }
}

// ---------------------------------------------------------------------------
// Portalable white panels (Portal 2 cleanliness, Portal 1 grime)

function whiteWall(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = [[0, 0, 2, 2], [2, 0, 1, 2], [3, 0, 1, 1], [3, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [0, 3, 2, 1], [2, 2, 2, 2]];
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.07);
  const warm = rects.map(() => (r() - 0.5) * 0.014);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n), br = brushed(n, seed, true);
  const M = decals(n, seed + 5, (D) => {
    const c = 32 * k;
    // grime smudges, mostly low on each panel
    for (let i = 0; i < 34; i++) {
      const R = rects[Math.floor(D.r() * rects.length)];
      const x = (R[0] + D.r() * R[2]) * c, y = (R[1] + R[3] * (0.55 + D.r() * 0.45)) * c;
      D.blob(0, x, y, (2 + D.r() * 9) * k, 0.10 + D.r() * 0.22, 1 + D.r() * 1.5, 0.5 + D.r() * 0.6);
    }
    // scuffs and knocks near panel bottoms
    for (let i = 0; i < 46; i++) {
      const R = rects[Math.floor(D.r() * rects.length)];
      const x = (R[0] + D.r() * R[2]) * c, y = (R[1] + R[3]) * c - (1 + D.r() * 12) * k;
      const len = (1 + D.r() * 5) * k, an = (D.r() - 0.5) * 0.7, bend = (D.r() - 0.5) * 0.6;
      D.scuff(1, x, y, len, an, bend, (0.8 + D.r() * 1.4) * k, 0.06 + D.r() * 0.1);
      if (D.r() < 0.3) D.scuff(1, x, y, len * 0.6, an, bend, (0.3 + D.r() * 0.3) * k, 0.08 + D.r() * 0.1);
    }
    // faint streaks running down from panel tops and seams
    for (let i = 0; i < 40; i++) {
      const R = rects[Math.floor(D.r() * rects.length)];
      const x = (R[0] + 0.05 + D.r() * (R[2] - 0.1)) * c, y = R[1] * c + D.r() * 3 * k;
      D.streak(2, x, y, (0.3 + D.r() * 1.6) * k, (8 + D.r() * 40) * k, 0.2 + D.r() * 0.35);
    }
    for (let i = 0; i < 18; i++) D.streak(2, D.r() * n, D.r() * n, (2 + D.r() * 6) * k, (20 + D.r() * 60) * k, 0.1 + D.r() * 0.12);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i], sd = P.side[i];
    panelProfile(d, 0.28, 0.7, 1.6); const h = PH, t = PT;
    const o1 = ((y + id * 97) & m) * n + ((x + id * 61) & m);
    // panel face tone: subtle mottling and per-panel variation
    let v = 0.86 * tone[id] + lo[o1] * 0.03 + mid[i] * 0.014 + gr[i] * 0.008;
    // fine vertical weathering streaks (Portal 1 style), patchy
    const vs = br[i] * Math.max(0, lo[((y + 300) & m) * n + ((x + 500) & m)] + 0.15);
    // bevel shading baked lightly (top edges catch light, bottoms shade)
    if (t < 1) v *= 0.92 + 0.08 * t + (sd === 2 ? 0.04 : sd === 3 ? -0.04 : 0) * t;
    if (t === 0) v = 0.30 + gr[i] * 0.02;
    // edge dirt (more on the lower edge where it collects)
    const ed = (d < 7 ? Math.exp(-Math.max(0, d - 0.3) / 1.4) : 0) * (0.6 + 0.4 * fine[i]) * (sd === 3 ? 0.13 : 0.06) * (0.6 + 0.6 * (lo[i] * 0.5 + 0.5));
    const sm = M[0][i] * (0.7 + 0.3 * fine[i]), sc = M[1][i], st = M[2][i] * (0.6 + 0.4 * mid[o1]);
    const dirt = clamp01(ed + sm * 0.2 + st * 0.16 + Math.max(0, lo[o1] - 0.3) * 0.08 + Math.max(0, vs) * 0.12);
    const R = v * (1 - dirt * 0.38) * (1 - sc * 0.32);
    const G = v * (1 - dirt * 0.42) * (1 - sc * 0.33);
    const B = v * (1 - dirt * 0.50) * (1 - sc * 0.34);
    S.alb[i * 3] = R * (1 + warm[id]); S.alb[i * 3 + 1] = G; S.alb[i * 3 + 2] = B * (1.012 - warm[id]);
    S.h[i] = h + t * (fine[i] * 0.025 + gr[i] * 0.004) - sc * 0.05;
    S.rough[i] = t === 0 ? 0.92 : 0.36 + (1 - t) * 0.12 + fine[i] * 0.04 + dirt * 0.5 + sc * 0.25;
  }
  return S;
}

function whiteFloor(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = grid4();
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.09);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n);
  const M = decals(n, seed + 5, (D) => {
    // shoe scuffs: dark rubber marks in all directions
    for (let i = 0; i < 90; i++) {
      const x = D.r() * n, y = D.r() * n, len = (1 + D.r() * 5) * k, an = D.r() * Math.PI * 2, bend = (D.r() - 0.5) * 1.2;
      D.scuff(1, x, y, len, an, bend, (1.0 + D.r() * 1.6) * k, 0.05 + D.r() * 0.1);
      if (D.r() < 0.35) D.scuff(1, x, y, len * 0.6, an, bend, (0.4 + D.r() * 0.4) * k, 0.06 + D.r() * 0.12);
    }
    // dusty patches and drag marks
    for (let i = 0; i < 26; i++) D.blob(0, D.r() * n, D.r() * n, (4 + D.r() * 14) * k, 0.10 + D.r() * 0.18, 1 + D.r(), 0.6 + D.r() * 0.6);
    for (let i = 0; i < 10; i++) D.scuff(2, D.r() * n, D.r() * n, (8 + D.r() * 26) * k, D.r() * Math.PI * 2, (D.r() - 0.5) * 0.3, (0.08 + D.r() * 0.12) * k, 0.2 + D.r() * 0.3);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    panelProfile(d, 0.42, 0.55, 1.2); const h = PH, t = PT;
    const o1 = ((y + id * 113) & m) * n + ((x + id * 71) & m);
    let v = 0.76 * tone[id] + lo[o1] * 0.03 + mid[o1] * 0.018 + gr[i] * 0.012;
    if (t < 1) v *= 0.84 + 0.16 * t;
    if (t === 0) v = 0.24 + gr[i] * 0.03 + lo[i] * 0.03;
    const ed = (d < 7 ? Math.exp(-Math.max(0, d - 0.4) / 1.6) : 0) * 0.12 * (0.6 + 0.4 * fine[i]);
    const dirt = clamp01(ed + M[0][i] * 0.2 + Math.max(0, lo[i] - 0.3) * 0.08);
    const sc = M[1][i], scr = M[2][i];
    const R = v * (1 - dirt * 0.35) * (1 - sc * 0.45) + scr * 0.03;
    const G = v * (1 - dirt * 0.38) * (1 - sc * 0.45) + scr * 0.03;
    const B = v * (1 - dirt * 0.45) * (1 - sc * 0.43) + scr * 0.03;
    S.alb[i * 3] = R; S.alb[i * 3 + 1] = G; S.alb[i * 3 + 2] = B * 1.01;
    S.h[i] = h + t * (fine[i] * 0.03 + gr[i] * 0.006) - scr * 0.04;
    S.rough[i] = t === 0 ? 0.95 : 0.44 + (1 - t) * 0.1 + mid[i] * 0.05 + dirt * 0.4 + sc * 0.2 - scr * 0.1;
  }
  return S;
}

// Matte acoustic ceiling tiles in a light T-bar grid (Portal 1 flavour).
function whiteCeil(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, sh = Math.log2(n);
  const rects = grid4();
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.06);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), gr = grain(n);
  const M = decals(n, seed + 5, (D) => {
    for (let i = 0; i < 3; i++) {
      const x = D.r() * n, y = D.r() * n, rad = (4 + D.r() * 8) * D.k;
      D.blob(0, x, y, rad, 0.18 + D.r() * 0.15);
      D.wrap(x - rad, y - rad, x + rad, y + rad, (X, Y) => { D.ctx.strokeStyle = D.col(1, 0.18); D.ctx.lineWidth = 0.5 * D.k; D.ctx.beginPath(); D.ctx.ellipse(x + X, y + Y, rad * 0.85, rad * 0.7, D.r() * 3, 0, Math.PI * 2); D.ctx.stroke(); });
    }
    for (let i = 0; i < 20; i++) D.blob(0, D.r() * D.n, D.r() * D.n, (3 + D.r() * 10) * D.k, 0.05 + D.r() * 0.08);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    const o1 = ((y + id * 37) & m) * n + ((x + id * 53) & m);
    let v, h, ro;
    if (d < 0.7) { v = 0.72 + gr[i] * 0.01; h = 0.6; ro = 0.55; }               // T-bar
    else if (d < 1.0) { v = 0.45; h = 0.6 - (d - 0.7) / 0.3 * 0.9; ro = 0.8; }  // shadowed lip
    else {
      v = 0.80 * tone[id] + lo[o1] * 0.025 + gr[i] * 0.035; h = -0.3 + gr[i] * 0.05 + mid[i] * 0.04; ro = 0.88;
      v *= 1 - Math.exp(-(d - 1) / 1.2) * 0.25;
    }
    const st = M[0][i], ring = M[1][i];
    const R = v * (1 - st * 0.12 - ring * 0.2), G = v * (1 - st * 0.16 - ring * 0.25), B = v * (1 - st * 0.24 - ring * 0.32);
    S.alb[i * 3] = R; S.alb[i * 3 + 1] = G; S.alb[i * 3 + 2] = B * 1.01;
    S.h[i] = h; S.rough[i] = ro;
  }
  return S;
}

// ---------------------------------------------------------------------------
// Non-portalable dark metal (Portal 2 black panels)

function metalWall(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1], [2, 1, 2, 1], [0, 2, 1, 1], [0, 3, 1, 1],
    [1, 2, 1, 2], [2, 2, 1, 1], [3, 2, 1, 2], [2, 3, 1, 1]];
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.14);
  const vert = rects.map(([, , w, h]) => (h > w ? true : w > h ? false : r() < 0.5));
  const lo = fbm(n, 4, 5, 1), fine = fbm(n, 64, 3, 3), gr = grain(n), br = brushed(n, seed + 3), bv = brushed(n, seed + 3, true);
  const M = decals(n, seed + 5, (D) => {
    for (let i = 0; i < 30; i++) D.blob(0, D.r() * n, D.r() * n, (2 + D.r() * 8) * k, 0.12 + D.r() * 0.25, 1 + D.r(), 0.5 + D.r() * 0.7);
    for (let i = 0; i < 40; i++) D.scuff(1, D.r() * n, D.r() * n, (2 + D.r() * 10) * k, D.r() * Math.PI, (D.r() - 0.5) * 0.3, (0.06 + D.r() * 0.12) * k, 0.25 + D.r() * 0.45);
    for (let i = 0; i < 16; i++) D.streak(2, D.r() * n, D.r() * n, (0.4 + D.r() * 1.5) * k, (10 + D.r() * 30) * k, 0.1 + D.r() * 0.2);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i], sd = P.side[i];
    panelProfile(d, 0.2, 0.55, 1.4); const h = PH, t = PT;
    const b = (vert[id] ? bv : br)[((y + id * 29) & m) * n + ((x + id * 13) & m)];
    let v = 0.245 * tone[id] + b * 0.012 + lo[((y + id * 41) & m) * n + x] * 0.014 + gr[i] * 0.006;
    if (t < 1) v += (0.07 + (sd === 2 ? 0.03 : 0)) * Math.sin(t * Math.PI) - (1 - t) * 0.04;   // bright bevel edge
    if (t === 0) v = 0.05;
    const sm = M[0][i], sc = M[1][i], st = M[2][i];
    v = v * (1 + sm * 0.18) + sc * 0.08 - st * 0.03;
    S.alb[i * 3] = v * 0.95; S.alb[i * 3 + 1] = v * 1.0; S.alb[i * 3 + 2] = v * 1.07;
    S.h[i] = h + t * (b * 0.006 + fine[i] * 0.01) - sc * 0.03;
    S.rough[i] = t === 0 ? 0.9 : 0.34 + b * 0.04 + fine[i] * 0.04 + sm * 0.22 + sc * 0.15 + st * 0.1 - (1 - t) * 0.08;
  }
  return S;
}

// Dark rubbery floor tiles.
function metalFloor(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = grid4();
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.12);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n);
  const st = fbm(n, 128, 2, 9);
  const M = decals(n, seed + 5, (D) => {
    for (let i = 0; i < 110; i++) D.scuff(1, D.r() * n, D.r() * n, (1 + D.r() * 6) * k, D.r() * Math.PI * 2, (D.r() - 0.5) * 1.2, (0.15 + D.r() * 0.5) * k, 0.12 + D.r() * 0.35);
    for (let i = 0; i < 24; i++) D.blob(0, D.r() * n, D.r() * n, (4 + D.r() * 14) * k, 0.10 + D.r() * 0.2, 1 + D.r(), 0.6 + D.r() * 0.6);
    for (let i = 0; i < 70; i++) D.scuff(2, D.r() * n, D.r() * n, (1 + D.r() * 4) * k, D.r() * Math.PI * 2, (D.r() - 0.5) * 1.0, (0.2 + D.r() * 0.5) * k, 0.15 + D.r() * 0.35);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    panelProfile(d, 0.3, 0.6, 1.2); const h = PH, t = PT;
    const o1 = ((y + id * 113) & m) * n + ((x + id * 71) & m);
    const wear = clamp01(lo[o1] * 0.8 + 0.3);
    let v = 0.20 * tone[id] + mid[o1] * 0.012 + st[i] * 0.012 + gr[i] * 0.008 + wear * 0.02;
    if (t < 1) v += 0.04 * Math.sin(t * Math.PI) - (1 - t) * 0.03;
    if (t === 0) v = 0.06;
    // dust settles near the grout and in patches (dust is lighter than rubber)
    const dust = clamp01((d < 6 ? Math.exp(-Math.max(0, d - 0.3) / 1.2) : 0) * 0.35 * (0.5 + 0.5 * fine[i]) + M[0][i] * 0.45 + Math.max(0, lo[i] - 0.35) * 0.3);
    const scL = M[1][i], scD = M[2][i];
    v = v + (0.33 - v) * dust * 0.5 + scL * 0.07 - scD * 0.06;
    S.alb[i * 3] = v * 0.97; S.alb[i * 3 + 1] = v; S.alb[i * 3 + 2] = v * 1.05;
    S.h[i] = h + t * (st[i] * 0.04 + gr[i] * 0.008);
    S.rough[i] = t === 0 ? 0.95 : 0.52 - wear * 0.12 + st[i] * 0.05 + dust * 0.35 + scL * 0.1 - scD * 0.05;
  }
  return S;
}

// Dark ceiling tiles: recessed panels in a T-bar grid.
function metalCeil(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, sh = Math.log2(n);
  const rects = grid4();
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.12);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), gr = grain(n);
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i], sd = P.side[i];
    const o1 = ((y + id * 37) & m) * n + ((x + id * 53) & m);
    let v, h, ro;
    if (d < 0.9) { v = 0.25 + gr[i] * 0.01 + (d > 0.6 ? 0.04 : 0); h = 0.8; ro = 0.45; }       // grid bar
    else if (d < 1.3) { v = 0.07; h = 0.8 - (d - 0.9) / 0.4 * 2.2; ro = 0.8; }                 // drop into recess
    else {
      const sdw = Math.exp(-(d - 1.3) / (sd === 2 || sd === 0 ? 3.0 : 1.4));                    // recess shadow
      v = (0.17 * tone[id] + lo[o1] * 0.012 + mid[i] * 0.008 + gr[i] * 0.012) * (1 - sdw * 0.55);
      h = -1.4 + gr[i] * 0.03; ro = 0.7 + mid[i] * 0.05;
    }
    S.alb[i * 3] = v * 0.96; S.alb[i * 3 + 1] = v; S.alb[i * 3 + 2] = v * 1.06;
    S.h[i] = h; S.rough[i] = ro;
  }
  return S;
}

// ---------------------------------------------------------------------------
// Maintenance areas: rusted plating and stained concrete

function rustPlates(n, seed, paint) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = [[0, 0, 2, 2], [2, 0, 2, 2], [1, 2, 2, 2], [3, 2, 2, 2]];
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.12);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n);
  const rivet = new Float32Array(N);
  // rivets along every plate edge, 4 units apart, 1.8 units in
  for (const [rx, ry, rw, rh] of rects) {
    const X0 = rx * 32, Y0 = ry * 32, X1 = (rx + rw) * 32, Y1 = (ry + rh) * 32, pts = [];
    for (let u = X0 + 2; u <= X1 - 2; u += 4) pts.push([u, Y0 + 1.8], [u, Y1 - 1.8]);
    for (let v = Y0 + 6; v <= Y1 - 6; v += 4) pts.push([X0 + 1.8, v], [X1 - 1.8, v]);
    const R = 0.7 * k;
    for (const [u, v] of pts) {
      const cx = u * k, cy = v * k;
      for (let py = Math.floor(cy - R); py <= Math.ceil(cy + R); py++) for (let px = Math.floor(cx - R); px <= Math.ceil(cx + R); px++) {
        const q = 1 - ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2) / (R * R);
        if (q > 0) { const j = (py & m) * n + (px & m); rivet[j] = Math.max(rivet[j], Math.sqrt(q)); }
      }
    }
  }
  const M = decals(n, seed + 5, (D) => {
    // rust runs from rivet rows and plate seams
    for (let i = 0; i < 70; i++) {
      const R = rects[Math.floor(D.r() * rects.length)];
      const x = (R[0] * 32 + 2 + D.r() * (R[2] * 32 - 4)) * k, y = (R[1] * 32 + (D.r() < 0.6 ? 1.8 : R[3] * 32 * D.r())) * k;
      D.streak(0, x, y, (0.5 + D.r() * 2.2) * k, (6 + D.r() * 40) * k, 0.25 + D.r() * 0.45);
    }
    for (let i = 0; i < 30; i++) D.blob(1, D.r() * n, D.r() * n, (2 + D.r() * 10) * k, 0.2 + D.r() * 0.35, 1 + D.r(), 0.6 + D.r() * 0.8);
    for (let i = 0; i < 20; i++) D.scuff(2, D.r() * n, D.r() * n, (3 + D.r() * 12) * k, D.r() * Math.PI, (D.r() - 0.5) * 0.4, (0.1 + D.r() * 0.2) * k, 0.4 + D.r() * 0.4);
  });
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    panelProfile(d, 0.3, 0.7, 1.5); const ph = PH, t = PT;
    const o1 = ((y + id * 57) & m) * n + ((x + id * 89) & m);
    // where the paint survives: less near edges and rivets, chipped by noise
    const edge = Math.exp(-Math.max(0, d - 0.3) / 3);
    const pv = lo[o1] * 0.55 + mid[i] * 0.55 + fine[i] * 0.3 - edge * 0.45 - rivet[i] * 0.3 - M[1][i] * 0.5 + paint.cover;
    const pa = sstep(-0.03, 0.03, pv);
    const rim = Math.exp(-Math.abs(pv) / 0.025) * (pv > 0 ? 1 : 0);
    // rust: dark brown to orange, pitted
    const rt = clamp01(0.5 + mid[o1] * 0.8 + gr[i] * 0.15);
    let rr = 0.17 + rt * 0.2, rg = 0.115 + rt * 0.1, rb = 0.085 + rt * 0.045;
    const pit = gr[i] * 0.5 + fine[o1] * 0.5;
    rr *= 0.85 + pit * 0.15; rg *= 0.85 + pit * 0.15; rb *= 0.85 + pit * 0.15;
    // aged paint
    const fade = 1 + lo[i] * 0.08 + gr[i] * 0.02;
    let cr = paint.c[0] * tone[id] * fade, cg = paint.c[1] * tone[id] * fade, cb = paint.c[2] * tone[id] * fade;
    const run = M[0][i];
    cr += (0.33 - cr) * run * 0.6; cg += (0.21 - cg) * run * 0.6; cb += (0.13 - cb) * run * 0.6;
    let R = rr + (cr - rr) * pa, G = rg + (cg - rg) * pa, B = rb + (cb - rb) * pa;
    R += rim * 0.06; G += rim * 0.06; B += rim * 0.06;
    if (t < 1) { const s = 0.7 + 0.3 * t; R *= s; G *= s; B *= s; }
    if (t === 0) { R = 0.06; G = 0.045; B = 0.035; }
    const sc = M[2][i] * pa;
    R += sc * 0.12; G += sc * 0.12; B += sc * 0.12;
    const rv = rivet[i];
    if (rv > 0) { const s = 0.75 + rv * 0.35; R *= s; G *= s; B *= s; }
    S.alb[i * 3] = R; S.alb[i * 3 + 1] = G; S.alb[i * 3 + 2] = B;
    S.h[i] = ph + pa * 0.12 + (1 - pa) * pit * 0.08 + rv * 0.55;
    S.rough[i] = t === 0 ? 0.95 : 0.55 * pa + 0.9 * (1 - pa) - sc * 0.2 - rv * 0.15;
  }
  return S;
}

// Rusted diamond tread plate.
function treadPlate(n, seed) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const rects = [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]];
  const P = layout(n, rects);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n);
  const pitch = 4, ca = Math.SQRT1_2;
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    panelProfile(d, 0.35, 0.5, 1.2); const ph = PH, t = PT;
    const ux = (x + 0.5) / k, uy = (y + 0.5) / k;
    const cx = Math.floor(ux / pitch), cy = Math.floor(uy / pitch);
    const lx = ux - (cx + 0.5) * pitch, ly = uy - (cy + 0.5) * pitch;
    const sgn = (cx + cy) & 1 ? 1 : -1;
    const a = (lx + sgn * ly) * ca, b = (-sgn * lx + ly) * ca;
    const e = (a / 1.55) ** 2 + (b / 0.42) ** 2;
    const lug = e < 1 ? Math.sqrt(1 - e) : 0;
    const o1 = ((y + id * 57) & m) * n + ((x + id * 89) & m);
    const rust = clamp01(0.3 + lo[o1] * 0.8 + mid[i] * 0.4 - lug * 0.8 + Math.exp(-d / 3) * 0.4);
    const steel = 0.33 + mid[o1] * 0.03 + gr[i] * 0.02 + lug * 0.12;
    const rt = clamp01(0.5 + fine[o1] * 0.8 + gr[i] * 0.2);
    let R = steel + (0.17 + rt * 0.18 - steel) * rust, G = steel + (0.12 + rt * 0.09 - steel) * rust, B = steel * 1.03 + (0.09 + rt * 0.04 - steel * 1.03) * rust;
    if (t < 1) { const s = 0.7 + 0.3 * t; R *= s; G *= s; B *= s; }
    if (t === 0) { R = 0.05; G = 0.045; B = 0.04; }
    S.alb[i * 3] = R; S.alb[i * 3 + 1] = G; S.alb[i * 3 + 2] = B;
    S.h[i] = ph + lug * 0.35 * t + rust * gr[i] * 0.04;
    S.rough[i] = t === 0 ? 0.95 : 0.4 + rust * 0.5 - lug * 0.08;
  }
  return S;
}

// Cast-in-place concrete: form panel joints, tie holes, stains, cracks.
function concrete(n, seed, kind) {
  const S = new Surf(n), N = n * n, m = n - 1, k = S.k, sh = Math.log2(n);
  const wall = kind !== 'floor';
  const rects = wall ? [[0, 0, 2, 4], [2, 0, 2, 4]] : [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]];
  const P = layout(n, rects), r = rng(seed);
  const tone = rects.map(() => 1 + (r() - 0.5) * 0.1);
  const lo = fbm(n, 4, 5, 1), mid = fbm(n, 16, 4, 2), fine = fbm(n, 64, 3, 3), gr = grain(n);
  const ties = [];
  if (wall) for (const ty of [24, 88]) for (const tx of [16, 48, 80, 112]) ties.push([tx, ty]);
  const M = decals(n, seed + 5, (D) => {
    // bug holes and pits
    for (let i = 0; i < 520; i++) D.dot(0, D.r() * n, D.r() * n, (0.12 + D.r() * D.r() * 0.45) * k, 0.6 + D.r() * 0.4);
    // cracks
    for (let i = 0; i < (wall ? 4 : 6); i++) D.crack(1, D.r() * n, D.r() * n, (14 + D.r() * 30) * k, D.r() * Math.PI * 2, (0.18 + D.r() * 0.2) * k, 0.8);
    if (wall) {
      // water stains from the top joint and rust bleeding from tie holes
      for (let i = 0; i < 22; i++) D.streak(2, D.r() * n, D.r() * 2 * k, (2 + D.r() * 10) * k, (20 + D.r() * 80) * k, 0.12 + D.r() * 0.25);
      for (let i = 0; i < 26; i++) D.streak(2, D.r() * n, D.r() * n, (0.3 + D.r() * 1.2) * k, (8 + D.r() * 30) * k, 0.12 + D.r() * 0.2);
      for (const [tx, ty] of ties) if (D.r() < 0.7) D.streak(1, (tx + (D.r() - 0.5) * 0.6) * k, (ty + 0.5) * k, (0.6 + D.r() * 1.2) * k, (6 + D.r() * 22) * k, 0.25 + D.r() * 0.35);
    } else {
      for (let i = 0; i < 14; i++) D.blob(2, D.r() * n, D.r() * n, (4 + D.r() * 16) * k, 0.2 + D.r() * 0.35, 1 + D.r() * 0.8, 0.6 + D.r() * 0.7);
      for (let i = 0; i < 50; i++) D.scuff(2, D.r() * n, D.r() * n, (2 + D.r() * 8) * k, D.r() * Math.PI * 2, (D.r() - 0.5), (0.2 + D.r() * 0.4) * k, 0.15 + D.r() * 0.3);
    }
  });
  const tieR = 0.95;
  for (let i = 0; i < N; i++) {
    const x = i & m, y = i >> sh;
    const id = P.id[i], d = P.d[i];
    const o1 = ((y + id * 57) & m) * n + ((x + id * 89) & m);
    let v = (wall ? 0.52 : 0.47) * tone[id] + lo[o1] * 0.06 + mid[o1] * 0.035 + fine[i] * 0.02 + gr[i] * 0.03;
    let h = mid[i] * 0.08 + fine[i] * 0.05 + gr[i] * 0.02;
    let ro = 0.86 + fine[i] * 0.04;
    // form joints: a fin on walls, saw cuts on floors
    if (wall) { if (d < 0.35) { h += 0.25; v += 0.03; } else if (d < 0.7) v -= 0.04 * (1 - (d - 0.35) / 0.35); }
    else if (d < 0.3) { h -= 0.8; v = 0.15; ro = 0.95; } else if (d < 0.6) v *= 0.85;
    const pit = M[0][i];
    v *= 1 - pit * 0.45; h -= pit * 0.25;
    const ck = M[1][i];
    // stains: darker, slightly warm water runs; rust from tie holes in G mask
    const stn = M[2][i] * (0.6 + 0.4 * mid[o1]);
    let R = v * (1 - stn * 0.38), G = v * (1 - stn * 0.4), B = v * (1 - stn * 0.43);
    if (wall) {
      const rr = ck;   // on walls G channel carries both cracks (thin) and rust runs
      R *= 1 - rr * 0.28; G *= 1 - rr * 0.36; B *= 1 - rr * 0.46;
    } else { R *= 1 - ck * 0.6; G *= 1 - ck * 0.6; B *= 1 - ck * 0.6; }
    h -= ck * 0.3;
    S.alb[i * 3] = R; S.alb[i * 3 + 1] = G * 0.995; S.alb[i * 3 + 2] = B * 0.97;
    S.h[i] = h; S.rough[i] = ro + stn * 0.05 - (wall ? 0 : stn * 0.25);
  }
  // form-tie holes: small conical recesses with a darker rim
  const ext = Math.ceil((tieR + 0.7) * k);
  for (const [tx, ty] of ties) {
    for (let py = Math.floor(ty * k) - ext; py <= Math.ceil(ty * k) + ext; py++) for (let px = Math.floor(tx * k) - ext; px <= Math.ceil(tx * k) + ext; px++) {
      const rr = Math.hypot((px + 0.5) / k - tx, (py + 0.5) / k - ty);
      const j = (py & m) * n + (px & m);
      let s = 1;
      if (rr < tieR) { const q = rr / tieR; S.h[j] -= (1 - q * q) * 0.9; s = 0.35 + 0.5 * q; S.rough[j] = 0.95; }
      else if (rr < tieR + 0.6) s = 0.9 + 0.1 * (rr - tieR) / 0.6;
      S.alb[j * 3] *= s; S.alb[j * 3 + 1] *= s; S.alb[j * 3 + 2] *= s;
    }
  }
  return S;
}

// ---------------------------------------------------------------------------
// Light fixture (emissive map): each 32-unit cell is a dark metal housing
// holding three fluorescent tubes behind a lightly frosted diffuser.
function lightPanel(size) {
  const [c, ctx] = canvas(size);
  const cell = size / 4, u = cell / 32;
  ctx.fillStyle = '#060707';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const X = x * cell, Y = y * cell;
    // housing lip and inner frame
    ctx.fillStyle = '#1a1d20'; ctx.fillRect(X + 0.6 * u, Y + 0.6 * u, cell - 1.2 * u, cell - 1.2 * u);
    ctx.fillStyle = '#25292c'; ctx.fillRect(X + 0.9 * u, Y + 0.9 * u, cell - 1.8 * u, 0.4 * u);
    ctx.fillStyle = '#0a0b0c'; ctx.fillRect(X + 1.6 * u, Y + 1.6 * u, cell - 3.2 * u, cell - 3.2 * u);
    // diffuser: glows between the tubes, dimmer toward the frame
    const ix = X + 2.1 * u, iy = Y + 2.1 * u, iw = cell - 4.2 * u;
    const g = ctx.createLinearGradient(ix, 0, ix + iw, 0);
    g.addColorStop(0, '#5d6a73'); g.addColorStop(0.1, '#8996a0'); g.addColorStop(0.5, '#9aa7b1'); g.addColorStop(0.9, '#8996a0'); g.addColorStop(1, '#5d6a73');
    ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, iw);
    const g2 = ctx.createLinearGradient(0, iy, 0, iy + iw);
    g2.addColorStop(0, 'rgba(0,0,0,0.5)'); g2.addColorStop(0.08, 'rgba(0,0,0,0)'); g2.addColorStop(0.92, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g2; ctx.fillRect(ix, iy, iw, iw);
    // tubes
    for (const f of [0.25, 0.5, 0.75]) {
      const ty = Y + cell * f, th = 4.8 * u, tx0 = ix + 0.6 * u, tx1 = ix + iw - 0.6 * u;
      const halo = ctx.createLinearGradient(0, ty - th * 1.5, 0, ty + th * 1.5);
      halo.addColorStop(0, 'rgba(210,230,245,0)'); halo.addColorStop(0.5, 'rgba(210,230,245,0.4)'); halo.addColorStop(1, 'rgba(210,230,245,0)');
      ctx.fillStyle = halo; ctx.fillRect(tx0, ty - th * 1.5, tx1 - tx0, th * 3);
      const tg = ctx.createLinearGradient(0, ty - th / 2, 0, ty + th / 2);
      tg.addColorStop(0, '#a9c0cf'); tg.addColorStop(0.3, '#f0f8ff'); tg.addColorStop(0.5, '#ffffff'); tg.addColorStop(0.7, '#f0f8ff'); tg.addColorStop(1, '#a9c0cf');
      ctx.fillStyle = tg; ctx.fillRect(tx0 + 1.1 * u, ty - th / 2, tx1 - tx0 - 2.2 * u, th);
      // end caps
      ctx.fillStyle = '#30353a';
      ctx.fillRect(tx0, ty - th * 0.55, 1.2 * u, th * 1.1);
      ctx.fillRect(tx1 - 1.2 * u, ty - th * 0.55, 1.2 * u, th * 1.1);
    }
    // frosting: a faint prismatic ribbing across the diffuser
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 0.35 * u;
    for (let p = ix; p < ix + iw; p += 1.2 * u) { ctx.beginPath(); ctx.moveTo(p, iy); ctx.lineTo(p, iy + iw); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  return c;
}

function cubeFace(size, companion = false) {
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#6b7075';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size), d = img.data, r = rng(77);
  for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 14; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  ctx.putImageData(img, 0, 0);
  // light inner panel
  const m = size * 0.16;
  ctx.fillStyle = '#c9cdd0';
  ctx.fillRect(m, m, size - 2 * m, size - 2 * m);
  // dark corner bumpers
  ctx.fillStyle = '#3d4145';
  const k = size * 0.3;
  for (const [x, y] of [[0, 0], [size - k, 0], [0, size - k], [size - k, size - k]]) ctx.fillRect(x, y, k, k);
  // emblem ring
  ctx.strokeStyle = '#5b6064';
  ctx.lineWidth = size * 0.06;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.2, 0, Math.PI * 2); ctx.stroke();
  if (companion) {
    ctx.fillStyle = '#f08fb4';
    const cx = size / 2, cy = size / 2 + size * 0.02, rr = size * 0.075;
    ctx.beginPath();
    ctx.moveTo(cx, cy + rr * 1.6);
    ctx.bezierCurveTo(cx - rr * 2.4, cy + rr * 0.2, cx - rr * 1.3, cy - rr * 1.7, cx, cy - rr * 0.5);
    ctx.bezierCurveTo(cx + rr * 1.3, cy - rr * 1.7, cx + rr * 2.4, cy + rr * 0.2, cx, cy + rr * 1.6);
    ctx.fill();
    // small hearts in the corner bumpers
    ctx.fillStyle = '#e981a8';
    for (const [x, y] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      ctx.beginPath(); ctx.arc(x * size, y * size, size * 0.03, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.05, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  return c;
}

// ---------------------------------------------------------------------------
// Chamber sign: tall backlit panel, big thin number, progress, hazard icons.

// Thin rounded digits drawn as strokes (box w x h, h ~ 2w).
function digitPath(ctx, ch, x, y, w, h) {
  const cx = x + w / 2, rr = w / 2;
  ctx.beginPath();
  switch (ch) {
    case '0': ctx.roundRect(x, y, w, h, rr); break;
    case '1': ctx.moveTo(x + w * 0.2, y + w * 0.35); ctx.lineTo(x + w * 0.62, y); ctx.lineTo(x + w * 0.62, y + h); break;
    case '2': ctx.moveTo(x, y + rr); ctx.arc(cx, y + rr, rr, Math.PI, 0); ctx.lineTo(x + w, y + rr * 1.3); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); break;
    case '3': ctx.moveTo(x + w * 0.05, y); ctx.lineTo(x + w, y); ctx.lineTo(cx, y + h - 2 * rr); ctx.arc(cx, y + h - rr, rr, -Math.PI / 2, Math.PI * 0.86); break;
    case '4': ctx.moveTo(x + w * 0.72, y + h); ctx.lineTo(x + w * 0.72, y); ctx.lineTo(x, y + h * 0.68); ctx.lineTo(x + w, y + h * 0.68); break;
    case '5': ctx.moveTo(x + w, y); ctx.lineTo(x + w * 0.1, y); ctx.lineTo(x + w * 0.04, y + h * 0.47); ctx.arc(cx, y + h - rr, rr, -Math.PI * 0.78, Math.PI * 0.86); break;
    case '6': ctx.moveTo(x + w * 0.85, y); ctx.quadraticCurveTo(x, y + h * 0.3, x, y + h - rr); ctx.arc(cx, y + h - rr, rr, Math.PI, Math.PI * 3); break;
    case '7': ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.3, y + h); break;
    case '8': ctx.arc(cx, y + rr * 0.86, rr * 0.86, Math.PI / 2, Math.PI * 2.5); ctx.moveTo(cx + rr, y + h - rr); ctx.arc(cx, y + h - rr, rr, 0, Math.PI * 2); break;
    case '9': ctx.arc(cx, y + rr, rr, 0, Math.PI * 2); ctx.moveTo(x + w, y + rr); ctx.quadraticCurveTo(x + w, y + h * 0.72, x + w * 0.15, y + h); break;
  }
  ctx.stroke();
}

function drawIcon(ctx, name, cx, cy, s) {
  const P = Math.PI;
  ctx.beginPath();
  switch (name) {
    case 'cube': {
      const a = s * 0.87;
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + a, cy - s / 2); ctx.lineTo(cx + a, cy + s / 2); ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - a, cy + s / 2); ctx.lineTo(cx - a, cy - s / 2); ctx.closePath();
      ctx.moveTo(cx - a, cy - s / 2); ctx.lineTo(cx, cy); ctx.lineTo(cx + a, cy - s / 2); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s);
      ctx.stroke(); break;
    }
    case 'button':
      ctx.ellipse(cx, cy + s * 0.55, s, s * 0.32, 0, 0, P * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.4, s * 0.55, s * 0.4, 0, P, P * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - s * 0.15); ctx.moveTo(cx - s * 0.3, cy - s * 0.45); ctx.lineTo(cx, cy - s * 0.15); ctx.lineTo(cx + s * 0.3, cy - s * 0.45); ctx.stroke();
      break;
    case 'portal':
      ctx.ellipse(cx - s * 0.5, cy, s * 0.36, s * 0.85, 0, 0, P * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + s * 0.5, cy, s * 0.36, s * 0.85, 0, 0, P * 2); ctx.stroke();
      break;
    case 'fling':
      ctx.arc(cx - s * 0.7, cy + s * 0.6, s * 0.2, 0, P * 2); ctx.fill();
      ctx.beginPath(); ctx.setLineDash([s * 0.18, s * 0.16]);
      ctx.moveTo(cx - s * 0.5, cy + s * 0.4); ctx.quadraticCurveTo(cx, cy - s * 1.3, cx + s * 0.8, cy + s * 0.3); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx + s * 0.45, cy + s * 0.15); ctx.lineTo(cx + s * 0.85, cy + s * 0.4); ctx.lineTo(cx + s * 0.95, cy - s * 0.05); ctx.stroke();
      break;
    case 'fizzler':
      for (let k = -1; k <= 1; k++) { ctx.moveTo(cx + k * s * 0.55, cy - s); ctx.lineTo(cx + k * s * 0.55, cy + s); }
      ctx.stroke(); ctx.beginPath();
      ctx.moveTo(cx - s * 0.9, cy - s * 0.3); ctx.lineTo(cx + s * 0.9, cy + s * 0.3); ctx.moveTo(cx - s * 0.9, cy + s * 0.3); ctx.lineTo(cx + s * 0.9, cy - s * 0.3);
      ctx.stroke(); break;
    case 'pellet':
      ctx.arc(cx + s * 0.3, cy, s * 0.42, 0, P * 2); ctx.fill();
      ctx.beginPath();
      for (const dy of [-0.3, 0, 0.3]) { ctx.moveTo(cx - s, cy + dy * s); ctx.lineTo(cx - s * 0.3, cy + dy * s); }
      ctx.stroke(); break;
    case 'plate':
      ctx.fillRect(cx - s, cy + s * 0.55, s * 1.1, s * 0.3);
      ctx.moveTo(cx - s * 0.45, cy + s * 0.4); ctx.quadraticCurveTo(cx, cy - s * 1.2, cx + s * 0.8, cy - s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.4, cy - s * 0.5); ctx.lineTo(cx + s * 0.85, cy - s * 0.15); ctx.lineTo(cx + s * 0.5, cy + s * 0.2); ctx.stroke();
      break;
    case 'goo':
      for (let k = 0; k < 2; k++) {
        const yy = cy + s * 0.15 + k * s * 0.55;
        ctx.moveTo(cx - s, yy); ctx.quadraticCurveTo(cx - s / 2, yy - s * 0.35, cx, yy); ctx.quadraticCurveTo(cx + s / 2, yy + s * 0.35, cx + s, yy);
      }
      ctx.stroke(); ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx + s * 0.32, cy - s * 0.45, cx, cy - s * 0.3); ctx.quadraticCurveTo(cx - s * 0.32, cy - s * 0.45, cx, cy - s); ctx.fill();
      break;
    case 'fall':
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s * 0.5); ctx.moveTo(cx - s * 0.4, cy + s * 0.1); ctx.lineTo(cx, cy + s * 0.5); ctx.lineTo(cx + s * 0.4, cy + s * 0.1);
      ctx.moveTo(cx - s, cy + s * 0.9); ctx.lineTo(cx + s, cy + s * 0.9); ctx.stroke(); break;
    case 'drink':
      ctx.moveTo(cx - s * 0.55, cy - s * 0.8); ctx.lineTo(cx - s * 0.4, cy + s * 0.9); ctx.lineTo(cx + s * 0.4, cy + s * 0.9); ctx.lineTo(cx + s * 0.55, cy - s * 0.8);
      ctx.moveTo(cx - s * 0.5, cy - s * 0.2); ctx.lineTo(cx + s * 0.5, cy - s * 0.2); ctx.stroke(); break;
  }
}

export function makeSignTexture(number, title, icons, renderer, last = 9) {
  const W = 512, H = 1024;
  const [c, ctx] = canvas(W, H);
  const ink = '#1d1f21';
  // backlit panel: brighter in the middle, falling off toward the frame
  ctx.fillStyle = '#e4e7e6'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, H * 0.62);
  g.addColorStop(0, '#fbfcfb'); g.addColorStop(0.7, '#f1f3f2'); g.addColorStop(1, '#dadedd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);

  // chamber number
  const num = String(number).padStart(2, '0');
  ctx.strokeStyle = ink; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < num.length; i++) digitPath(ctx, num[i], 46 + i * 150, 52, 112, 236);
  ctx.lineCap = 'butt';

  ctx.fillStyle = ink;
  ctx.fillRect(36, 336, W - 72, 3);
  ctx.font = '500 30px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'top';
  const total = last + 1;
  ctx.fillText(`${num}/${String(last).padStart(2, '0')}`, 38, 356);
  // progress: one block per chamber
  const bx = 190, bw = W - 36 - bx, seg = bw / total;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i <= number ? ink : '#cdd1d0';
    ctx.fillRect(bx + i * seg + 1.5, 362, seg - 3, 18);
  }
  ctx.font = '600 22px "IBM Plex Sans", Arial, sans-serif';
  ctx.fillStyle = '#5a5f62';
  ctx.fillText(title.toUpperCase().split('').join(String.fromCharCode(8202)), 38, 408);
  ctx.fillStyle = ink;
  ctx.fillRect(36, 452, W - 72, 3);

  // hazard icons, two rows of five
  const all = ['cube', 'button', 'portal', 'fling', 'fizzler', 'pellet', 'plate', 'goo', 'fall', 'drink'];
  const tile = 80, gap = (W - 72 - tile * 5) / 4;
  all.forEach((name, i) => {
    const x = 36 + (i % 5) * (tile + gap), y = 482 + Math.floor(i / 5) * (tile + gap + 6);
    const on = icons.includes(name);
    ctx.fillStyle = on ? ink : '#d5d8d7';
    ctx.beginPath(); ctx.roundRect(x, y, tile, tile, 6); ctx.fill();
    const fg = on ? '#f4f6f5' : '#eef0ef';
    ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawIcon(ctx, name, x + tile / 2, y + tile / 2, tile * 0.3);
  });
  ctx.lineCap = 'butt';

  // fine print rows
  ctx.fillStyle = '#c3c7c6';
  for (let i = 0; i < 4; i++) ctx.fillRect(38, 700 + i * 18, (W - 76) * (i === 3 ? 0.45 : 0.9 - i * 0.07), 6);

  // logo mark (original): ring with an orbiting dot and its trail
  const lx = 66, ly = 940;
  ctx.strokeStyle = ink; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(lx, ly, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(lx, ly, 14, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.arc(lx + 14 * Math.cos(Math.PI * 1.9), ly + 14 * Math.sin(Math.PI * 1.9), 5, 0, Math.PI * 2); ctx.fill();
  ctx.font = '700 22px "Archivo", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('MOMENTUM', 104, 920);
  ctx.font = '500 15px "IBM Plex Sans", Arial, sans-serif';
  ctx.fillStyle = '#4b5053';
  ctx.fillText('RESEARCH ANNEX', 105, 946);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  return t;
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

// ---------------------------------------------------------------------------

export function createTextures(renderer) {
  const t0 = performance.now();
  const hi = COARSE ? 512 : 1024, lo = COARSE ? 256 : 512;
  const T = (c) => toTexture(c, renderer);
  // [generator, normal strength]
  const defs = {
    whiteWall: [() => whiteWall(hi, 11), 1],
    whiteFloor: [() => whiteFloor(hi, 21), 1],
    whiteCeil: [() => whiteCeil(lo, 31), 1],
    metalWall: [() => metalWall(hi, 41), 1],
    metalFloor: [() => metalFloor(hi, 51), 1],
    metalCeil: [() => metalCeil(lo, 61), 1],
    rustWall: [() => rustPlates(lo, 71, { c: [0.30, 0.37, 0.36], cover: 0.3 }), 1],
    rustFloor: [() => treadPlate(lo, 81), 1],
    rustCeil: [() => rustPlates(lo, 91, { c: [0.33, 0.33, 0.32], cover: 0.22 }), 1],
    concWall: [() => concrete(hi, 101, 'wall'), 1],
    concFloor: [() => concrete(lo, 111, 'floor'), 1],
    concCeil: [() => concrete(lo, 121, 'ceil'), 1],
  };
  const out = {};
  const albedoAvg = {};
  for (const [key, [gen, bump]] of Object.entries(defs)) {
    const f = finish(gen(), renderer, bump);
    out[key] = f.map; out[key + 'N'] = f.normal; out[key + 'R'] = f.rough;
    albedoAvg[key] = f.map.userData.avg;
  }
  fieldCache.clear();
  pool.clear();
  const res = {
    ...out,
    light: T(lightPanel(COARSE ? 256 : 512)),
    cube: T(cubeFace(256)),
    companion: T(cubeFace(256, true)),
  };
  // non-enumerable extras: mean linear albedo per surface, generation time
  Object.defineProperty(res, 'albedoAvg', { value: albedoAvg });
  Object.defineProperty(res, 'genMs', { value: performance.now() - t0 });
  return res;
}
