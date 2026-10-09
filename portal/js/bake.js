// Radiosity lightmapper for the voxel world, modelled on Source's VRAD.
//  - Fluorescent fixtures (MAT.LIGHT faces) are area emitters, like VRAD's
//    "texlights": the fixtures themselves light the room.
//  - Direct light is integrated over each emitter with shadow rays to many
//    sample points, which gives soft, correctly shaped penumbrae.
//  - Indirect light is gathered at patch resolution (one patch per cell face,
//    VRAD's default is four luxels) over several bounces, each surface
//    reflecting light by its reflectivity, then interpolated per luxel and
//    combined with short-range contact occlusion.
//  - Dynamic objects are lit from six-sided "ambient cubes" baked on a coarse
//    grid of probes, like VRAD's per-leaf ambient lighting.
// The result is packed into one atlas per chamber. It is produced offline by
// tools/bake.mjs (see README) and loaded as a PNG at run time.
import { CELL } from './constants.js';
import { MAT } from './level.js';

export const BAKE_VERSION = 6;
export const PER = 5;                  // luxels per cell edge
export const LUX = CELL / PER;         // 6.4 world units per luxel (VRAD default: 16; crisper shadows read better here)
export const LM_RANGE = 3;             // stored value = lighting / LM_RANGE, sRGB encoded
export const ATLAS_W = 1024;
const CHUNK = 20;                      // must match the world mesh chunking
export const PROBE_STEP = 2;           // cells between ambient-cube probes

// tunables (display units: a lit white wall at about 1.0 reads as fully lit)
const LE = 2.2;                        // fixture radiance
const POINT = 1.15;                    // scale for extra point lights from level data
const BOUNCES = 4;
const PATCH_RAYS = 128;
const AO_RAYS = 24, AO_LEN = 48;
const PROBE_RAYS = 32;
// Reflectivity per material and orientation [wall, floor, ceiling]: the
// average linear colour of each generated texture, as VRAD derives it from
// each texture's average (textures.albedoAvg).
export const REFLECT = {
  [MAT.WHITE]: [[0.67, 0.669, 0.685], [0.487, 0.486, 0.495], [0.562, 0.562, 0.573]],
  [MAT.METAL]: [[0.04, 0.045, 0.052], [0.028, 0.029, 0.033], [0.02, 0.022, 0.025]],
  [MAT.RUST]: [[0.061, 0.084, 0.076], [0.067, 0.051, 0.046], [0.069, 0.059, 0.052]],
  [MAT.CONCRETE]: [[0.227, 0.224, 0.211], [0.178, 0.176, 0.166], [0.227, 0.224, 0.211]],
};

export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const AXES = DIRS.map((n) => {
  const axis = n[0] ? 0 : n[1] ? 1 : 2;
  return { axis, ua: axis === 0 ? 2 : 0, va: axis === 1 ? 2 : 1, pos: n[axis] > 0 };
});
const dirIndex = (nx, ny, nz) => (nx > 0 ? 0 : nx < 0 ? 1 : ny > 0 ? 2 : ny < 0 ? 3 : nz > 0 ? 4 : 5);

export function levelHash(grid, lights) {
  let h = 2166136261 >>> 0;
  const mix = (b) => { h ^= b & 255; h = Math.imul(h, 16777619) >>> 0; };
  for (const v of [BAKE_VERSION, grid.nx, grid.ny, grid.nz]) { mix(v); mix(v >> 8); }
  for (let i = 0; i < grid.cells.length; i++) mix(grid.cells[i]);
  for (const c of JSON.stringify((lights || []).map((l) => [l.x, l.y, l.z, l.i, l.r]))) mix(c.charCodeAt(0));
  return h.toString(16).padStart(8, '0');
}

// Greedy-merge exposed faces into rectangles (per direction, plane, material
// and 20-cell chunk) and pack every lit rectangle into the atlas. This is
// deterministic, so the run time rebuilds exactly the charts the baker used.
export function buildCharts(grid) {
  const dims = [grid.nx, grid.ny, grid.nz];
  const rects = [];
  const c = [0, 0, 0];
  for (let d = 0; d < 6; d++) {
    const n = DIRS[d], { axis, ua, va } = AXES[d];
    const U = dims[ua], V = dims[va], S = dims[axis];
    const mask = new Uint8Array(U * V);
    for (let s = 0; s < S; s++) {
      let any = false;
      for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
        c[axis] = s; c[ua] = u; c[va] = v;
        const m = grid.get(c[0], c[1], c[2]);
        let e = 0;
        if (m !== MAT.EMPTY) {
          const ex = c[0] + n[0], ey = c[1] + n[1], ez = c[2] + n[2];
          if (grid.inBounds(ex, ey, ez) && !grid.solid(ex, ey, ez)) e = m;
        }
        mask[v * U + u] = e;
        if (e) any = true;
      }
      if (!any) continue;
      for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
        const m = mask[v * U + u];
        if (!m) continue;
        const cu = Math.floor(u / CHUNK), cv = Math.floor(v / CHUNK);
        let w = 1;
        while (u + w < U && mask[v * U + u + w] === m && Math.floor((u + w) / CHUNK) === cu) w++;
        let h = 1;
        grow: while (v + h < V && Math.floor((v + h) / CHUNK) === cv) {
          for (let k = 0; k < w; k++) if (mask[(v + h) * U + u + k] !== m) break grow;
          h++;
        }
        for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) mask[(v + j) * U + u + k] = 0;
        rects.push({ d, s, u0: u, v0: v, w, h, m, cx: -1, cy: -1 });
      }
    }
  }
  const order = [];
  for (let i = 0; i < rects.length; i++) if (rects[i].m !== MAT.LIGHT) order.push(i);
  order.sort((a, b) => (rects[b].h - rects[a].h) || (rects[b].w - rects[a].w) || a - b);
  let x = 0, y = 0, rowH = 0;
  for (const i of order) {
    const r = rects[i];
    const cw = r.w * PER + 2, ch = r.h * PER + 2;
    if (x + cw > ATLAS_W) { x = 0; y += rowH; rowH = 0; }
    r.cx = x; r.cy = y;
    x += cw; rowH = Math.max(rowH, ch);
  }
  return { rects, W: ATLAS_W, H: y + rowH };
}

// world-space corner of a rectangle's plane and its in-plane axes
export function rectFrame(r) {
  const { axis, ua, va, pos } = AXES[r.d];
  const o = [0, 0, 0];
  o[axis] = (r.s + (pos ? 1 : 0)) * CELL;
  o[ua] = r.u0 * CELL; o[va] = r.v0 * CELL;
  return { o, axis, ua, va, n: DIRS[r.d] };
}

export function probeDims(grid) {
  return [Math.ceil(grid.nx / PROBE_STEP), Math.ceil(grid.ny / PROBE_STEP), Math.ceil(grid.nz / PROBE_STEP)];
}

// ---------------------------------------------------------------------------
// Fast voxel ray marching (Amanatides & Woo) straight on the cell array.
function makeTracer(grid) {
  const { nx, ny, nz, cells } = grid;
  const hit = { t: 0, x: 0, y: 0, z: 0, axis: 0, sign: 0 };
  // returns true on a hit within maxT; fills `hit`
  function trace(ox, oy, oz, dx, dy, dz, maxT) {
    let x = Math.floor(ox / CELL), y = Math.floor(oy / CELL), z = Math.floor(oz / CELL);
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false;
    if (cells[(y * nz + z) * nx + x] !== 0) { hit.t = 0; hit.x = x; hit.y = y; hit.z = z; hit.axis = -1; return true; }
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const ix = Math.abs(dx) < 1e-12 ? 1e30 : 1 / Math.abs(dx);
    const iy = Math.abs(dy) < 1e-12 ? 1e30 : 1 / Math.abs(dy);
    const iz = Math.abs(dz) < 1e-12 ? 1e30 : 1 / Math.abs(dz);
    let tmx = (sx > 0 ? (x + 1) * CELL - ox : ox - x * CELL) * ix;
    let tmy = (sy > 0 ? (y + 1) * CELL - oy : oy - y * CELL) * iy;
    let tmz = (sz > 0 ? (z + 1) * CELL - oz : oz - z * CELL) * iz;
    const tdx = CELL * ix, tdy = CELL * iy, tdz = CELL * iz;
    for (;;) {
      let t, axis;
      if (tmx < tmy && tmx < tmz) { t = tmx; axis = 0; x += sx; tmx += tdx; if (x < 0 || x >= nx) return false; }
      else if (tmy < tmz) { t = tmy; axis = 1; y += sy; tmy += tdy; if (y < 0 || y >= ny) return false; }
      else { t = tmz; axis = 2; z += sz; tmz += tdz; if (z < 0 || z >= nz) return false; }
      if (t > maxT) return false;
      if (cells[(y * nz + z) * nx + x] !== 0) {
        hit.t = t; hit.x = x; hit.y = y; hit.z = z; hit.axis = axis;
        hit.sign = axis === 0 ? -sx : axis === 1 ? -sy : -sz;
        return true;
      }
    }
  }
  return { trace, hit };
}

// deterministic hash -> [0,1)
const hash = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

// cosine-weighted direction around normal n (orthonormal basis t, b)
function cosDir(n, t, b, u1, u2, out) {
  const r = Math.sqrt(u1), ph = 2 * Math.PI * u2;
  const a = r * Math.cos(ph), c = r * Math.sin(ph), z = Math.sqrt(Math.max(0, 1 - u1));
  out[0] = t[0] * a + b[0] * c + n[0] * z;
  out[1] = t[1] * a + b[1] * c + n[1] * z;
  out[2] = t[2] * a + b[2] * c + n[2] * z;
}
function basis(n) {
  const t = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0];
  const l = Math.hypot(t[0], t[1], t[2]); t[0] /= l; t[1] /= l; t[2] /= l;
  const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  return [t, b];
}

// ---------------------------------------------------------------------------
export function bake(grid, extraLights = [], onProgress = () => {}) {
  const { rects, W, H } = buildCharts(grid);
  const { nx, ny, nz } = grid;
  const { trace, hit } = makeTracer(grid);
  const N = W * H;
  const direct = new Float32Array(N * 3);
  const ldir = new Float32Array(N * 3);            // dominant direct-light direction x strength
  const total = new Float32Array(N * 3);
  const ao = new Float32Array(N).fill(1);
  const owner = new Int32Array(N).fill(-1);       // which rect owns each interior luxel

  // face lookup: (cell, direction) -> rect index
  const faceRect = new Int32Array(nx * ny * nz * 6).fill(-1);
  rects.forEach((r, ri) => {
    const { axis, ua, va } = AXES[r.d];
    const c = [0, 0, 0];
    c[axis] = r.s;
    for (let j = 0; j < r.h; j++) for (let k = 0; k < r.w; k++) {
      c[ua] = r.u0 + k; c[va] = r.v0 + j;
      faceRect[((c[1] * nz + c[2]) * nx + c[0]) * 6 + r.d] = ri;
    }
    if (r.cx >= 0) for (let j = 0; j < r.h * PER; j++) for (let i = 0; i < r.w * PER; i++) owner[(r.cy + 1 + j) * W + r.cx + 1 + i] = ri;
  });

  // emitters: one per fixture rectangle
  const emitters = rects.filter((r) => r.m === MAT.LIGHT).map((r) => {
    const f = rectFrame(r);
    const lu = r.w * CELL, lv = r.h * CELL;
    const cx = f.o.slice(); cx[f.ua] += lu / 2; cx[f.va] += lv / 2;
    for (let a = 0; a < 3; a++) cx[a] += f.n[a] * 0.6;
    return { f, lu, lv, c: cx, area: lu * lv };
  });

  // radiance leaving a surface point, for gathers (uses current `total`)
  const radianceAt = (out) => {
    // hit cell + face normal -> rect -> luxel
    if (hit.axis < 0) { out[0] = out[1] = out[2] = 0; return; }
    const nAx = [0, 0, 0]; nAx[hit.axis] = hit.sign;
    const d = dirIndex(nAx[0], nAx[1], nAx[2]);
    const ri = faceRect[((hit.y * nz + hit.z) * nx + hit.x) * 6 + d];
    if (ri < 0) { out[0] = out[1] = out[2] = 0; return; }
    const r = rects[ri];
    if (r.m === MAT.LIGHT) { out[0] = out[1] = out[2] = LE; return; }
    out.p = out.p || [0, 0, 0];
    const { ua, va } = AXES[r.d];
    const p = out.p;
    p[ua] = hitPos[ua]; p[va] = hitPos[va];
    let i = Math.floor(p[ua] / LUX - r.u0 * PER), j = Math.floor(p[va] / LUX - r.v0 * PER);
    i = Math.max(0, Math.min(r.w * PER - 1, i)); j = Math.max(0, Math.min(r.h * PER - 1, j));
    const k = ((r.cy + 1 + j) * W + r.cx + 1 + i) * 3;
    const rf = (REFLECT[r.m] || REFLECT[MAT.METAL])[r.d === 2 ? 1 : r.d === 3 ? 2 : 0];
    out[0] = total[k] * rf[0]; out[1] = total[k + 1] * rf[1]; out[2] = total[k + 2] * rf[2];
  };
  const hitPos = [0, 0, 0];
  const gather = (o, n, rays, seed, out, maxT = 6000) => {
    const [t, b] = basis(n);
    const dir = [0, 0, 0], rad = [0, 0, 0];
    let r0 = 0, g0 = 0, b0 = 0;
    const side = Math.sqrt(rays) | 0;
    const rot1 = hash(seed, 7), rot2 = hash(seed, 13);
    for (let k = 0; k < rays; k++) {
      const u1 = (((k % side) + hash(seed, k * 2 + 1)) / side + rot1) % 1;
      const u2 = ((Math.floor(k / side) + hash(seed, k * 2 + 2)) / side + rot2) % 1;
      cosDir(n, t, b, u1, u2, dir);
      if (!trace(o[0], o[1], o[2], dir[0], dir[1], dir[2], maxT)) continue;
      hitPos[0] = o[0] + dir[0] * hit.t; hitPos[1] = o[1] + dir[1] * hit.t; hitPos[2] = o[2] + dir[2] * hit.t;
      radianceAt(rad);
      r0 += rad[0]; g0 += rad[1]; b0 += rad[2];
    }
    out[0] = r0 / rays; out[1] = g0 / rays; out[2] = b0 / rays;
  };

  // ---- 1. direct light per luxel -----------------------------------------
  const lit = rects.filter((r) => r.cx >= 0);
  const p = [0, 0, 0], q = [0, 0, 0];
  let done = 0;
  for (const r of lit) {
    const f = rectFrame(r);
    const n = f.n;
    for (let j = 0; j < r.h * PER; j++) for (let i = 0; i < r.w * PER; i++) {
      const li = (r.cy + 1 + j) * W + r.cx + 1 + i;
      p[0] = f.o[0] + n[0] * 0.5; p[1] = f.o[1] + n[1] * 0.5; p[2] = f.o[2] + n[2] * 0.5;
      p[f.ua] += (i + 0.5) * LUX; p[f.va] += (j + 0.5) * LUX;
      let er = 0, ax = 0, ay = 0, az = 0;
      for (let ei = 0; ei < emitters.length; ei++) {
        const e = emitters[ei];
        // receiver must be in front of the emitter and the emitter in front of the receiver
        const ex = p[0] - e.c[0], ey = p[1] - e.c[1], ez = p[2] - e.c[2];
        const en = e.f.n;
        if (ex * en[0] + ey * en[1] + ez * en[2] <= 0) continue;
        if (-(ex * n[0] + ey * n[1] + ez * n[2]) <= -e.lu - e.lv) continue;
        // distance to the emitter rectangle (for culling and sample density)
        let dd = 0;
        const du = Math.abs(p[e.f.ua] - e.c[e.f.ua]) - e.lu / 2, dv = Math.abs(p[e.f.va] - e.c[e.f.va]) - e.lv / 2;
        const dn = p[e.f.axis] - e.c[e.f.axis];
        dd = Math.hypot(Math.max(0, du), Math.max(0, dv), dn);
        if (LE * e.area / (Math.PI * (dd * dd + 1)) < 0.0015) continue;
        const step = Math.max(10, dd * 0.3);
        const su = Math.min(24, Math.max(1, Math.ceil(e.lu / step))), sv = Math.min(24, Math.max(1, Math.ceil(e.lv / step)));
        const dA = e.area / (su * sv);
        const jit = hash(li, ei);
        for (let a = 0; a < su; a++) for (let c2 = 0; c2 < sv; c2++) {
          q[0] = e.c[0]; q[1] = e.c[1]; q[2] = e.c[2];
          q[e.f.ua] += ((a + (jit + a * 0.618) % 1) / su - 0.5) * e.lu;
          q[e.f.va] += ((c2 + (jit * 1.7 + c2 * 0.382) % 1) / sv - 0.5) * e.lv;
          const lx = q[0] - p[0], ly = q[1] - p[1], lz = q[2] - p[2];
          const d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
          const cr = (lx * n[0] + ly * n[1] + lz * n[2]) / d;
          const ce = -(lx * en[0] + ly * en[1] + lz * en[2]) / d;
          if (cr <= 0 || ce <= 0) continue;
          if (trace(p[0], p[1], p[2], lx / d, ly / d, lz / d, d - 1.5)) continue;
          const k = LE * cr * ce * dA / (Math.PI * d2 + dA);
          er += k; ax += k * lx / d; ay += k * ly / d; az += k * lz / d;
        }
      }
      for (const L of extraLights) {
        const lx = L.x - p[0], ly = L.y - p[1], lz = L.z - p[2];
        const d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2) + 1e-3;
        const ndl = (lx * n[0] + ly * n[1] + lz * n[2]) / d;
        if (ndl <= 0) continue;
        const k = POINT * L.i * 0.42 * ndl / (1 + d2 / (L.r * L.r));
        if (k < 0.003) continue;
        if (trace(p[0], p[1], p[2], lx / d, ly / d, lz / d, d - 12)) continue;
        er += k; ax += k * lx / d; ay += k * ly / d; az += k * lz / d;
      }
      // fixtures are cool white
      if (er > 0) { ldir[li * 3] = ax / er; ldir[li * 3 + 1] = ay / er; ldir[li * 3 + 2] = az / er; }
      direct[li * 3] = er * 0.94; direct[li * 3 + 1] = er * 0.98; direct[li * 3 + 2] = er * 1.04;
    }
    done += r.w * r.h;
    onProgress('direct', done);
  }
  // soften sampling noise: a small blur inside each chart
  blurCharts(direct, owner, W, H, 1);

  // ---- 2. contact occlusion per luxel ---------------------------------------
  for (const r of lit) {
    const f = rectFrame(r);
    const n = f.n;
    const [t, b] = basis(n);
    const dir = [0, 0, 0];
    for (let j = 0; j < r.h * PER; j++) for (let i = 0; i < r.w * PER; i++) {
      const li = (r.cy + 1 + j) * W + r.cx + 1 + i;
      p[0] = f.o[0] + n[0] * 0.5; p[1] = f.o[1] + n[1] * 0.5; p[2] = f.o[2] + n[2] * 0.5;
      p[f.ua] += (i + 0.5) * LUX; p[f.va] += (j + 0.5) * LUX;
      let occ = 0;
      for (let k = 0; k < AO_RAYS; k++) {
        cosDir(n, t, b, (k + hash(li, k)) / AO_RAYS, hash(li, k + 99), dir);
        if (trace(p[0], p[1], p[2], dir[0], dir[1], dir[2], AO_LEN)) occ += 1 - hit.t / AO_LEN;
      }
      ao[li] = 1 - occ / AO_RAYS;
    }
  }
  blurCharts(ao, owner, W, H, 1, 1);

  // ---- 3. radiosity bounces at patch resolution --------------------------------
  const patchOf = new Map();
  for (const r of lit) patchOf.set(r, new Float32Array(r.w * r.h * 3));
  total.set(direct);
  const tmp = [0, 0, 0];
  for (let bounce = 0; bounce < BOUNCES; bounce++) {
    for (const r of lit) {
      const f = rectFrame(r);
      const pr = patchOf.get(r);
      for (let j = 0; j < r.h; j++) for (let k = 0; k < r.w; k++) {
        const o = [f.o[0] + f.n[0] * 1, f.o[1] + f.n[1] * 1, f.o[2] + f.n[2] * 1];
        o[f.ua] += (k + 0.5) * CELL; o[f.va] += (j + 0.5) * CELL;
        gather(o, f.n, PATCH_RAYS, (r.cx * 7919 + r.cy) * 131 + j * 31 + k + bounce * 100003, tmp);
        pr.set(tmp, (j * r.w + k) * 3);
      }
    }
    // indirect -> luxels (bilinear over patch centres), modulated by contact occlusion
    for (const r of lit) {
      const pr = patchOf.get(r);
      for (let j = 0; j < r.h * PER; j++) for (let i = 0; i < r.w * PER; i++) {
        const li = (r.cy + 1 + j) * W + r.cx + 1 + i;
        const fu = Math.max(0, Math.min(r.w - 1, (i + 0.5) / PER - 0.5)), fv = Math.max(0, Math.min(r.h - 1, (j + 0.5) / PER - 0.5));
        const u0 = Math.floor(fu), v0 = Math.floor(fv), u1 = Math.min(r.w - 1, u0 + 1), v1 = Math.min(r.h - 1, v0 + 1);
        const au = fu - u0, av = fv - v0;
        const a = Math.pow(ao[li], 1.6);       // contact shadows in corners and under ledges
        for (let ch = 0; ch < 3; ch++) {
          const v = (pr[(v0 * r.w + u0) * 3 + ch] * (1 - au) + pr[(v0 * r.w + u1) * 3 + ch] * au) * (1 - av) +
            (pr[(v1 * r.w + u0) * 3 + ch] * (1 - au) + pr[(v1 * r.w + u1) * 3 + ch] * au) * av;
          total[li * 3 + ch] = direct[li * 3 + ch] + v * a;
        }
      }
    }
    onProgress('bounce', bounce + 1);
  }
  // directionality only applies to the direct share of the light
  for (let i = 0; i < N; i++) {
    const t = total[i * 3 + 1];
    const k = t > 1e-5 ? Math.min(1, direct[i * 3 + 1] / t) : 0;
    ldir[i * 3] *= k; ldir[i * 3 + 1] *= k; ldir[i * 3 + 2] *= k;
  }
  blurCharts(ldir, owner, W, H, 1);
  dilate(total, owner, W, H);
  dilate(ldir, owner, W, H);

  // ---- 4. ambient cubes -------------------------------------------------------
  const [px, py, pz] = probeDims(grid);
  const probes = new Float32Array(px * py * pz * 18);
  for (let y = 0; y < py; y++) for (let z = 0; z < pz; z++) for (let x = 0; x < px; x++) {
    const o = [(x * PROBE_STEP + PROBE_STEP / 2) * CELL, (y * PROBE_STEP + PROBE_STEP / 2) * CELL, (z * PROBE_STEP + PROBE_STEP / 2) * CELL];
    if (grid.solidAt(o[0], o[1], o[2])) continue;
    const base = ((y * pz + z) * px + x) * 18;
    for (let d = 0; d < 6; d++) {
      gather(o, DIRS[d], PROBE_RAYS, base + d * 17, tmp);
      probes[base + d * 3] = tmp[0]; probes[base + d * 3 + 1] = tmp[1]; probes[base + d * 3 + 2] = tmp[2];
    }
  }
  return { W, H, lightmap: total, dir: ldir, probes, probeDims: [px, py, pz] };
}

function blurCharts(buf, owner, W, H, radius, comps = 3) {
  const src = buf.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = owner[y * W + x];
    if (o < 0) continue;
    for (let c = 0; c < comps; c++) {
      let s = 0, w = 0;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || owner[yy * W + xx] !== o) continue;
        const k = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        s += src[(yy * W + xx) * comps + c] * k; w += k;
      }
      buf[(y * W + x) * comps + c] = s / w;
    }
  }
}

// copy each chart's edge luxels into its one-luxel border so bilinear filtering never sees a neighbour chart
function dilate(buf, owner, W, H) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (owner[y * W + x] >= 0) continue;
    let best = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && owner[yy * W + xx] >= 0) { best = yy * W + xx; break; }
    }
    if (best >= 0) for (let c = 0; c < 3; c++) buf[(y * W + x) * 3 + c] = buf[best * 3 + c];
  }
}

// ---------------------------------------------------------------------------
// Encoding: lightmap rows, then the ambient cubes (6 texels per probe) appended
// below. Values are divided by LM_RANGE and stored with the sRGB curve.
const toSRGB = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
export const fromSRGB = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function encode(result) {
  const { W, H, lightmap, probes } = result;
  const nProbeTex = probes.length / 3;
  const rows = H + Math.ceil(nProbeTex / W);
  const px = new Uint8ClampedArray(W * rows * 4);
  const put = (i, r, g, b, seed) => {
    const d = (hash(seed, 3) + hash(seed, 5) - 1) * 0.5;      // triangular dither
    px[i * 4] = toSRGB(Math.min(1, Math.max(0, r / LM_RANGE))) * 255 + 0.5 + d;
    px[i * 4 + 1] = toSRGB(Math.min(1, Math.max(0, g / LM_RANGE))) * 255 + 0.5 + d;
    px[i * 4 + 2] = toSRGB(Math.min(1, Math.max(0, b / LM_RANGE))) * 255 + 0.5 + d;
    px[i * 4 + 3] = 255;
  };
  for (let i = 0; i < W * H; i++) put(i, lightmap[i * 3], lightmap[i * 3 + 1], lightmap[i * 3 + 2], i);
  for (let k = 0; k < nProbeTex; k++) put(W * H + k, probes[k * 3], probes[k * 3 + 1], probes[k * 3 + 2], k + 7777777);
  // dominant light direction (world space, scaled by how directional the light is), linear
  const dp = new Uint8ClampedArray(W * rows * 4);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) dp[i * 4 + c] = (result.dir[i * 3 + c] * 0.5 + 0.5) * 255 + 0.5;
    dp[i * 4 + 3] = 255;
  }
  for (let i = W * H; i < W * rows; i++) { dp[i * 4] = dp[i * 4 + 1] = dp[i * 4 + 2] = 128; dp[i * 4 + 3] = 255; }
  return { pixels: px, dirPixels: dp, width: W, height: rows };
}

// decode the ambient cubes back from the atlas image's pixels
export function decodeProbes(pixels, W, H, count) {
  const out = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const i = (W * H + k) * 4;
    for (let c = 0; c < 3; c++) out[k * 3 + c] = fromSRGB(pixels[i + c] / 255) * LM_RANGE;
  }
  return out;
}
