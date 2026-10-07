import * as THREE from 'three';
import { MAT } from './level.js';
import { buildCharts, rectFrame, probeDims, decodeProbes, levelHash, LM_RANGE, PROBE_STEP, ATLAS_W } from './bake.js';
import { CELL } from './constants.js';

// Run-time half of the lightmapper (see bake.js): loads each chamber's baked
// atlas, builds the merged world geometry with lightmap UVs, and lights
// dynamic objects from the baked ambient cubes.

const KEYS = { [MAT.WHITE]: ['whiteWall', 'whiteFloor', 'whiteCeil'], [MAT.METAL]: ['metalWall', 'metalFloor', 'metalCeil'], [MAT.RUST]: ['rustWall', 'rustFloor', 'rustCeil'], [MAT.CONCRETE]: ['concWall', 'concFloor', 'concCeil'] };

export class Lightmaps {
  constructor() {
    this.available = null;        // Set of baked hashes
    this.cache = new Map();       // hash -> Promise<entry> | entry
    this.ready = fetch(new URL('../lightmaps/index.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { this.available = new Set(list); })
      .catch(() => { this.available = new Set(); });
  }
  hashFor(grid, lights) { return levelHash(grid, lights); }
  has(hash) { return !!this.available?.has(hash); }
  get(hash) { const e = this.cache.get(hash); return e && !(e instanceof Promise) ? e : null; }
  load(hash, grid) {
    if (this.cache.has(hash)) return Promise.resolve(this.cache.get(hash));
    const loadImg = (src) => new Promise((res, rej) => { const im = new window.Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const base = new URL(`../lightmaps/${hash}`, import.meta.url).href;
    const p = Promise.all([loadImg(base + '.png'), loadImg(base + '.dir.png')]).then(([img, dimg]) => {
      {
        const tex = new THREE.Texture(img);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.channel = 1;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        // ambient cubes live in the rows under the lightmap
        const charts = buildCharts(grid);
        const dims = probeDims(grid);
        const count = dims[0] * dims[1] * dims[2] * 6;
        const cv = document.createElement('canvas');
        const rows = img.height - charts.H;
        cv.width = ATLAS_W; cv.height = rows;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, -charts.H);
        const px = ctx.getImageData(0, 0, ATLAS_W, rows).data;
        const probes = decodeProbes(px, ATLAS_W, 0, count);
        const dir = new THREE.Texture(dimg);
        dir.flipY = false;
        dir.colorSpace = THREE.NoColorSpace;
        dir.generateMipmaps = false;
        dir.minFilter = THREE.LinearFilter;
        dir.needsUpdate = true;
        const entry = { hash, texture: tex, dir, charts, rows: img.height, probes, dims };
        this.cache.set(hash, entry);
        return entry;
      }
    }).catch((e) => { this.cache.delete(hash); throw e; });
    this.cache.set(hash, p);
    return p;
  }
}

// World geometry from the baker's merged rectangles, with two UV sets: world
// space for the surface textures and atlas space for the lightmap.
const RECESS = 5;
export function buildLightmappedMeshes(grid, textures, lm, pbr) {
  const hous = { pos: [], nrm: [] };
  // four inner walls of a fixture's recess (drawn double sided)
  const housing = (f, r, sink) => {
    const W0 = r.w * 32, H0 = r.h * 32;
    const edges = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
    for (const [[a0, b0], [a1, b1]] of edges) {
      const q = [];
      for (const [cu, cv, dz] of [[a0, b0, 0], [a1, b1, 0], [a1, b1, sink], [a0, b0, sink]]) {
        const p = f.o.slice();
        p[f.ua] += cu * W0; p[f.va] += cv * H0; p[f.axis] -= f.n[f.axis] * dz;
        q.push(p);
      }
      for (const i of [0, 1, 2, 0, 2, 3]) { hous.pos.push(...q[i]); hous.nrm.push(...f.n); }
    }
  };
  const { rects, W } = lm.charts;
  const rows = lm.rows;
  const groups = new Map();
  const PER = CELL / 8;
  for (const r of rects) {
    const f = rectFrame(r);
    const n = f.n;
    const orient = n[1] > 0 ? 1 : n[1] < 0 ? 2 : 0;
    const cell = [0, 0, 0]; cell[f.axis] = r.s; cell[f.ua] = r.u0; cell[f.va] = r.v0;
    const key = `${r.m * 3 + orient}|${Math.floor(cell[0] / 20)},${Math.floor(cell[1] / 20)},${Math.floor(cell[2] / 20)}`;
    if (!groups.has(key)) groups.set(key, { pos: [], uv: [], uv1: [], nrm: [], idx: [] });
    const g = groups.get(key);
    const vi = g.pos.length / 3;
    // fixtures sit in a shallow recessed housing
    const sink = r.m === MAT.LIGHT ? RECESS : 0;
    if (sink) housing(f, r, sink);
    for (const [cu, cv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = f.o.slice();
      p[f.axis] -= n[f.axis] * sink;
      p[f.ua] += cu * r.w * CELL; p[f.va] += cv * r.h * CELL;
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(n[0], n[1], n[2]);
      g.uv.push(p[f.ua] / 128, p[f.va] / 128);
      if (r.cx >= 0) g.uv1.push((r.cx + 1 + cu * r.w * PER) / W, (r.cy + 1 + cv * r.h * PER) / rows);
      else g.uv1.push(0, 0);
    }
    const uvec = [0, 0, 0], vvec = [0, 0, 0];
    uvec[f.ua] = 1; vvec[f.va] = 1;
    const cz = [uvec[1] * vvec[2] - uvec[2] * vvec[1], uvec[2] * vvec[0] - uvec[0] * vvec[2], uvec[0] * vvec[1] - uvec[1] * vvec[0]];
    const rh = cz[0] * n[0] + cz[1] * n[1] + cz[2] * n[2] > 0;
    for (const t of rh ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) g.idx.push(vi + t);
  }
  const mats = new Map();
  const meshes = [];
  if (hous.pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(hous.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(hous.nrm, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2a2e33, side: THREE.DoubleSide }));
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.userData.world = true;
    meshes.push(mesh);
  }
  for (const [key, g] of groups) {
    const k = parseInt(key, 10);
    const m = Math.floor(k / 3), orient = k % 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('uv1', new THREE.Float32BufferAttribute(g.uv1, 2));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    if (!mats.has(k)) mats.set(k, worldMaterial(m, orient, textures, lm, pbr));
    const mesh = new THREE.Mesh(geo, mats.get(k));
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.userData.world = true;
    meshes.push(mesh);
  }
  return meshes;
}

function worldMaterial(m, orient, textures, lm, pbr) {
  const lightMap = lm.texture;
  if (m === MAT.LIGHT) {
    return pbr
      ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: textures.light, emissiveIntensity: 3.2, roughness: 0.4 })
      : new THREE.MeshBasicMaterial({ map: textures.light, color: 0xffffff });
  }
  const key = (KEYS[m] || KEYS[MAT.METAL])[orient];
  if (!pbr) return new THREE.MeshBasicMaterial({ map: textures[key], lightMap, lightMapIntensity: LM_RANGE * Math.PI });
  const mat = new THREE.MeshStandardMaterial({
    map: textures[key], normalMap: textures[key + 'N'], roughnessMap: textures[key + 'R'],
    roughness: 1, metalness: 0, lightMap, lightMapIntensity: LM_RANGE * Math.PI,
    normalScale: new THREE.Vector2(1, 1),
    envMapIntensity: m === MAT.METAL ? 1.0 : m === MAT.WHITE ? 0.8 : 0.5,
  });
  // All static light is in the lightmap: ignore the ambient light probe (it is
  // there for dynamic objects), but keep point lights such as the portals' glow.
  // Bumped lightmaps (Source's radiosity normal mapping, simplified): the baker
  // stores the dominant direction of the direct light per luxel, so normal
  // map detail catches the light from the actual fixtures.
  mat.onBeforeCompile = (s) => {
    s.uniforms.lmDir = { value: lm.dir };
    s.fragmentShader = 'uniform sampler2D lmDir;\n' + s.fragmentShader
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace(
        'irradiance += lightMapIrradiance;',
        `vec3 dv = texture2D( lmDir, vLightMapUv ).rgb * 2.0 - 1.0;
        float dl = length( dv );
        if ( dl > 0.02 ) {
          vec3 L = normalize( ( viewMatrix * vec4( dv / dl, 0.0 ) ).xyz );
          float ng = max( dot( nonPerturbedNormal, L ), 0.25 );
          lightMapIrradiance *= clamp( 1.0 + min( dl, 1.0 ) * ( max( dot( normal, L ), 0.0 ) / ng - 1.0 ), 0.25, 1.9 );
        }
        irradiance += lightMapIrradiance;`))
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = vec3( 0.0 );')
        .replace('irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );', ''));
  };
  mat.customProgramCacheKey = () => 'lm-world';
  return mat;
}

// ---------------------------------------------------------------------------
// Ambient cubes -> a spherical-harmonic light probe for whatever is near the
// camera (cubes, turrets, the gun in your hands).
const SAMPLE_DIRS = (() => {
  const out = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), ph = i * 2.399963;
    out.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r));
  }
  return out;
})();
const _basis = new Array(9).fill(0);
const _c = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export function sampleAmbientCube(lm, grid, pos, out = _c) {
  const [px, py, pz] = lm.dims;
  const fx = pos.x / (PROBE_STEP * CELL) - 0.5, fy = pos.y / (PROBE_STEP * CELL) - 0.5, fz = pos.z / (PROBE_STEP * CELL) - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  out.fill(0);
  let wsum = 0;
  for (let k = 0; k < 8; k++) {
    const x = x0 + (k & 1), y = y0 + ((k >> 1) & 1), z = z0 + ((k >> 2) & 1);
    if (x < 0 || y < 0 || z < 0 || x >= px || y >= py || z >= pz) continue;
    const cx = (x + 0.5) * PROBE_STEP * CELL, cy = (y + 0.5) * PROBE_STEP * CELL, cz = (z + 0.5) * PROBE_STEP * CELL;
    if (grid.solidAt(cx, cy, cz)) continue;
    const w = (1 - Math.abs(fx - x)) * (1 - Math.abs(fy - y)) * (1 - Math.abs(fz - z)) + 1e-4;
    const base = ((y * pz + z) * px + x) * 18;
    for (let i = 0; i < 18; i++) out[i] += lm.probes[base + i] * w;
    wsum += w;
  }
  if (wsum > 0) for (let i = 0; i < 18; i++) out[i] /= wsum;
  return wsum > 0;
}

export function ambientCubeToSH(cube, sh) {
  for (const c of sh.coefficients) c.set(0, 0, 0);
  const w = (4 * Math.PI) / SAMPLE_DIRS.length;
  for (const d of SAMPLE_DIRS) {
    // ambient-cube evaluation, as Source does for models
    const x2 = d.x * d.x, y2 = d.y * d.y, z2 = d.z * d.z;
    const ix = d.x > 0 ? 0 : 1, iy = d.y > 0 ? 2 : 3, iz = d.z > 0 ? 4 : 5;
    const r = x2 * cube[ix * 3] + y2 * cube[iy * 3] + z2 * cube[iz * 3];
    const g = x2 * cube[ix * 3 + 1] + y2 * cube[iy * 3 + 1] + z2 * cube[iz * 3 + 1];
    const b = x2 * cube[ix * 3 + 2] + y2 * cube[iy * 3 + 2] + z2 * cube[iz * 3 + 2];
    THREE.SphericalHarmonics3.getBasisAt(d, _basis);
    for (let k = 0; k < 9; k++) sh.coefficients[k].x += r * _basis[k] * w, sh.coefficients[k].y += g * _basis[k] * w, sh.coefficients[k].z += b * _basis[k] * w;
  }
  return sh;
}
