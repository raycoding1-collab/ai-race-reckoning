import * as THREE from 'three';
import { CELL } from './constants.js';

export const MAT = { EMPTY: 0, WHITE: 1, METAL: 2, LIGHT: 3, RUST: 4, CONCRETE: 5 };
export const PORTALABLE = new Set([MAT.WHITE, MAT.CONCRETE]);
const MAT_NAMES = { white: MAT.WHITE, metal: MAT.METAL, light: MAT.LIGHT, rust: MAT.RUST, concrete: MAT.CONCRETE };
const matId = (m) => (typeof m === 'string' ? MAT_NAMES[m] : m);

// A level is a voxel grid of 32-unit cells. Solid cells carry a surface
// material; every face between a solid and an empty cell becomes a wall.
export class Grid {
  constructor(nx, ny, nz) {
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.cells = new Uint8Array(nx * ny * nz).fill(MAT.METAL);
  }
  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz;
  }
  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return MAT.METAL;
    return this.cells[(y * this.nz + z) * this.nx + x];
  }
  set(x, y, z, m) {
    if (this.inBounds(x, y, z)) this.cells[(y * this.nz + z) * this.nx + x] = m;
  }
  solid(x, y, z) { return this.get(x, y, z) !== MAT.EMPTY; }
  solidAt(px, py, pz) {
    return this.solid(Math.floor(px / CELL), Math.floor(py / CELL), Math.floor(pz / CELL));
  }
  matAt(px, py, pz) {
    return this.get(Math.floor(px / CELL), Math.floor(py / CELL), Math.floor(pz / CELL));
  }

  // ---- builder helpers (all ranges half-open, in cells) ----
  fill(x0, y0, z0, x1, y1, z1, m = MAT.METAL) {
    m = matId(m);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) this.set(x, y, z, m);
    return this;
  }
  carve(x0, y0, z0, x1, y1, z1) { return this.fill(x0, y0, z0, x1, y1, z1, MAT.EMPTY); }
  paint(x0, y0, z0, x1, y1, z1, m) {
    m = matId(m);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (this.solid(x, y, z)) this.set(x, y, z, m);
    }
    return this;
  }
  room(x0, y0, z0, x1, y1, z1, o = {}) {
    const floor = o.floor ?? 'white', ceil = o.ceil ?? 'metal';
    const walls = o.walls ?? 'white';
    this.carve(x0, y0, z0, x1, y1, z1);
    this.paint(x0 - 1, y0, z0, x0, y1, z1, o.west ?? walls);
    this.paint(x1, y0, z0, x1 + 1, y1, z1, o.east ?? walls);
    this.paint(x0, y0, z0 - 1, x1, y1, z0, o.north ?? walls);
    this.paint(x0, y0, z1, x1, y1, z1 + 1, o.south ?? walls);
    this.paint(x0, y0 - 1, z0, x1, y0, z1, floor);
    this.paint(x0, y1, z0, x1, y1 + 1, z1, ceil);
    if (o.lights !== false) this.lightStrips(x0, y1, z0, x1, z1, o.lightEvery ?? 4);
    return this;
  }
  lightStrips(x0, y, z0, x1, z1, every = 4) {
    const w = x1 - x0, d = z1 - z0;
    if (w >= d) {
      for (let z = z0 + Math.floor(((d - 1) % every) / 2) + 1; z < z1 - 1; z += every)
        for (let x = x0 + 1; x < x1 - 1; x++) if (this.solid(x, y, z) && !this.solid(x, y - 1, z)) this.set(x, y, z, MAT.LIGHT);
    } else {
      for (let x = x0 + Math.floor(((w - 1) % every) / 2) + 1; x < x1 - 1; x += every)
        for (let z = z0 + 1; z < z1 - 1; z++) if (this.solid(x, y, z) && !this.solid(x, y - 1, z)) this.set(x, y, z, MAT.LIGHT);
    }
  }
}

// ---------------------------------------------------------------------------
// Ray casting through the voxel grid (Amanatides & Woo DDA).
// Returns { t, cell:[x,y,z], normal:[nx,ny,nz], mat } or null.
export function traceGrid(grid, o, d, maxT) {
  let x = Math.floor(o.x / CELL), y = Math.floor(o.y / CELL), z = Math.floor(o.z / CELL);
  if (grid.solid(x, y, z)) return { t: 0, cell: [x, y, z], normal: [0, 0, 0], mat: grid.get(x, y, z) };
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const inv = (v) => (Math.abs(v) < 1e-12 ? 1e30 : 1 / Math.abs(v));
  const tdx = CELL * inv(d.x), tdy = CELL * inv(d.y), tdz = CELL * inv(d.z);
  const nextB = (p, c, s) => (s > 0 ? (c + 1) * CELL - p : p - c * CELL);
  let tmx = nextB(o.x, x, sx) * inv(d.x);
  let tmy = nextB(o.y, y, sy) * inv(d.y);
  let tmz = nextB(o.z, z, sz) * inv(d.z);
  let t = 0;
  for (let i = 0; i < 4096; i++) {
    let axis;
    if (tmx < tmy && tmx < tmz) { axis = 0; t = tmx; x += sx; tmx += tdx; }
    else if (tmy < tmz) { axis = 1; t = tmy; y += sy; tmy += tdy; }
    else { axis = 2; t = tmz; z += sz; tmz += tdz; }
    if (t > maxT) return null;
    if (!grid.inBounds(x, y, z)) return null;
    if (grid.solid(x, y, z)) {
      const n = [0, 0, 0];
      n[axis] = axis === 0 ? -sx : axis === 1 ? -sy : -sz;
      return { t, cell: [x, y, z], normal: n, mat: grid.get(x, y, z) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mesh generation with baked lighting (ambient occlusion + ceiling lights).
const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

export function buildWorldMeshes(grid, textures, extraLights = [], pbr = false) {
  // gather light sources: exposed undersides of light panels
  const lights = [...extraLights];
  for (let y = 0; y < grid.ny; y++) for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) {
    if (grid.get(x, y, z) === MAT.LIGHT && !grid.solid(x, y - 1, z)) {
      lights.push({ x: (x + 0.5) * CELL, y: y * CELL - 6, z: (z + 0.5) * CELL, i: 0.11, r: 300 });
    }
  }
  // spatial hash for lights so per-vertex lighting stays fast
  const LB = 256;
  const buckets = new Map();
  const bkey = (a, b, c) => `${a},${b},${c}`;
  for (const L of lights) {
    const k = bkey(Math.floor(L.x / LB), Math.floor(L.y / LB), Math.floor(L.z / LB));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(L);
  }
  const nearLights = (px, py, pz) => {
    const out = [];
    const bx = Math.floor(px / LB), by = Math.floor(py / LB), bz = Math.floor(pz / LB);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const b = buckets.get(bkey(bx + i, by + j, bz + k));
      if (b) out.push(...b);
    }
    return out;
  };

  const groups = new Map(); // key -> {pos, uv, col, idx}
  const group = (key) => {
    if (!groups.has(key)) groups.set(key, { pos: [], uv: [], col: [], nrm: [], idx: [] });
    return groups.get(key);
  };

  const ambientFor = (n) => (n[1] > 0 ? 0.30 : n[1] < 0 ? 0.24 : 0.28);
  const AO = [0.5, 0.68, 0.84, 1.0];

  for (let y = 0; y < grid.ny; y++) for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) {
    const m = grid.get(x, y, z);
    if (m === MAT.EMPTY) continue;
    for (const n of DIRS) {
      const ex = x + n[0], ey = y + n[1], ez = z + n[2];
      if (!grid.inBounds(ex, ey, ez) || grid.solid(ex, ey, ez)) continue;
      const axis = n[0] ? 0 : n[1] ? 1 : 2;
      const orient = n[1] > 0 ? 1 : n[1] < 0 ? 2 : 0;
      const CH = 20;   // spatial chunks so portal views can cull walls they can't see
      const g = group(`${m * 3 + orient}|${Math.floor(x / CH)},${Math.floor(y / CH)},${Math.floor(z / CH)}`);
      const ua = axis === 0 ? 2 : 0;           // in-plane axes
      const va = axis === 1 ? 2 : 1;
      const base = [x * CELL, y * CELL, z * CELL];
      if (n[axis] > 0) base[axis] += CELL;
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const vi = g.pos.length / 3;
      const aos = [];
      for (const [cu, cv] of corners) {
        const p = base.slice();
        p[ua] += cu * CELL; p[va] += cv * CELL;
        // AO from the empty layer in front of the face
        const du = [0, 0, 0], dv = [0, 0, 0];
        du[ua] = cu ? 1 : -1; dv[va] = cv ? 1 : -1;
        const s1 = grid.solid(ex + du[0], ey + du[1], ez + du[2]) ? 1 : 0;
        const s2 = grid.solid(ex + dv[0], ey + dv[1], ez + dv[2]) ? 1 : 0;
        const c = grid.solid(ex + du[0] + dv[0], ey + du[1] + dv[1], ez + du[2] + dv[2]) ? 1 : 0;
        const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
        aos.push(ao);
        let lum;
        if (m === MAT.LIGHT) lum = 1.15;
        else {
          lum = ambientFor(n);
          // sample point just in front of the face, nudged toward the face centre
          const q = [p[0] + n[0] * 2, p[1] + n[1] * 2, p[2] + n[2] * 2];
          q[ua] += cu ? -1.5 : 1.5; q[va] += cv ? -1.5 : 1.5;
          for (const L of nearLights(q[0], q[1], q[2])) {
            const lx = L.x - q[0], ly = L.y - q[1], lz = L.z - q[2];
            const d2 = lx * lx + ly * ly + lz * lz;
            const d = Math.sqrt(d2) + 1e-3;
            const ndl = (lx * n[0] + ly * n[1] + lz * n[2]) / d;
            if (ndl <= 0) continue;
            let k = L.i * 0.42 * ndl / (1 + d2 / (L.r * L.r));
            if (k < 0.01) continue;
            // traced shadow: geometry between the surface and the light blocks it
            _o.x = q[0]; _o.y = q[1]; _o.z = q[2];
            _d.x = lx / d; _d.y = ly / d; _d.z = lz / d;
            const hit = traceGrid(grid, _o, _d, d - 12);
            if (hit && hit.t > 0) k *= 0.12;
            lum += k;
          }
          lum = Math.min(lum, 1.12) * AO[ao];
        }
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(n[0], n[1], n[2]);
        g.uv.push(p[ua] / 128, p[va] / 128);
        const tint = L_TINT[m] || L_TINT[1];
        g.col.push(lum * tint[0], lum * tint[1], lum * tint[2]);
      }
      // winding: make triangles face +n; flip diagonal to hide AO anisotropy
      const uvec = [0, 0, 0], vvec = [0, 0, 0];
      uvec[ua] = 1; vvec[va] = 1;
      const cz = [
        uvec[1] * vvec[2] - uvec[2] * vvec[1],
        uvec[2] * vvec[0] - uvec[0] * vvec[2],
        uvec[0] * vvec[1] - uvec[1] * vvec[0],
      ];
      const rightHanded = cz[0] * n[0] + cz[1] * n[1] + cz[2] * n[2] > 0;
      const flip = aos[0] + aos[2] < aos[1] + aos[3];
      let tris = flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
      if (!rightHanded) tris = flip ? [0, 3, 1, 1, 3, 2] : [0, 2, 1, 0, 3, 2];
      for (const t of tris) g.idx.push(vi + t);
    }
  }

  const texFor = (m, orient) => {
    if (m === MAT.LIGHT) return textures.light;
    const keys = KEYS[m] || KEYS[MAT.METAL];
    return textures[keys[orient]];
  };

  const meshes = [];
  const mats = new Map();
  for (const [key, g] of groups) {
    const k = parseInt(key, 10);
    const m = Math.floor(k / 3), orient = k % 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    if (!mats.has(k)) mats.set(k, pbr ? pbrMaterial(m, orient, textures) : new THREE.MeshBasicMaterial({ map: texFor(m, orient), vertexColors: true }));
    const mat = mats.get(k);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.userData.world = true;
    meshes.push(mesh);
  }
  return meshes;
}

// Physically based surface: albedo x baked light (vertex colour), with
// normal and roughness maps and image-based reflections from the scene's
// environment. Light panels are emissive above 1.0 so they bloom.
const KEYS = { [MAT.WHITE]: ['whiteWall', 'whiteFloor', 'whiteCeil'], [MAT.METAL]: ['metalWall', 'metalFloor', 'metalCeil'], [MAT.RUST]: ['rustWall', 'rustFloor', 'rustCeil'], [MAT.CONCRETE]: ['concWall', 'concFloor', 'concCeil'] };
function pbrMaterial(m, orient, textures) {
  if (m === MAT.LIGHT) {
    return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: textures.light, emissiveIntensity: 2.6, roughness: 0.4 });
  }
  const key = KEYS[m][orient];
  return new THREE.MeshStandardMaterial({
    map: textures[key], normalMap: textures[key + 'N'], roughnessMap: textures[key + 'R'],
    roughness: 1, metalness: m === MAT.METAL ? 0.35 : m === MAT.RUST ? 0.45 : 0.0, vertexColors: true,
    normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: m === MAT.WHITE ? 0.6 : m === MAT.CONCRETE ? 0.3 : 0.8,
  });
}

// subtle colour grading per material (white panels read slightly cool)
const L_TINT = {
  1: [0.97, 1.0, 1.03],
  2: [0.95, 0.98, 1.02],
  3: [1, 1, 1],
};
