// DREAM terrain: a model's weight matrix as an engraved landscape. One cell of the matrix = one lattice
// cell of the STM micrograph that `atom` ends on (54 px), so the plate opens straight down on that field
// (defocused) and the same atoms become weights: hills and valleys (low-rank structure, blocks,
// "outlier features") with every individual weight a small bump or dent on top.
// The surface is a rasterised mesh whose fragments evaluate the same height function themselves (crisp
// normals, hatching along z), so it is hidden-line correct and engraved at any resolution.
import * as THREE from 'three';
import { fbm2, mulberry32, smoothstep } from '../engine/util';
import { GLSL_HEIGHT, LAT } from './atom-kit';
import { GLSL_COMMON } from '../engine/glsl/common';

export const TX = { x0: 0, x1: 36, z0: -44, z1: 20 };      // cells
export const BW = 256, BH = 448;                            // landscape texture, 7 texels per cell

/** Four keyframe landscapes in RGBA; breathing is a time-varying mix of them. */
export function buildLandscape(): THREE.DataTexture {
  const data = new Float32Array(BW * BH * 4);
  const rnd = mulberry32(99);
  // outlier columns: massive activations, narrow ridges that run along the matrix
  const outliers = Array.from({ length: 4 }, () => ({ x: 4 + rnd() * 28, a: 1.1 + rnd() * 1.4, w: 0.25 + rnd() * 0.2, z0: TX.z0 + rnd() * 20, z1: TX.z1 - rnd() * 6 }));
  // block structure: heads, 6 x 5 cells, each with a level
  const lev = (i: number, j: number, s: number) => (mulberry32(i * 7919 + j * 104729 + s)() * 2 - 1);
  for (let j = 0; j < BH; j++) {
    for (let i = 0; i < BW; i++) {
      const x = (i / (BW - 1)) * (TX.x1 - TX.x0), z = TX.z0 + (j / (BH - 1)) * (TX.z1 - TX.z0);
      const f0 = fbm2(x * 0.075, z * 0.075, 4, 3) * 2.2;
      const f1 = fbm2(x * 0.11 + 9, z * 0.09 - 4, 4, 11) * 2.2;
      const rid = 1 - Math.abs(fbm2(x * 0.06 + 3, z * 0.06, 3, 17) * 2.8);       // ridged
      const f2 = (rid * rid - 0.35) * 1.5;
      // blocks, softened at their edges
      const bx = x / 6, bz = z / 5;
      const ix = Math.floor(bx), iz = Math.floor(bz);
      const fx = smoothstep(0.0, 0.14, bx - ix) * (1 - smoothstep(0.86, 1.0, bx - ix));
      const fz = smoothstep(0.0, 0.14, bz - iz) * (1 - smoothstep(0.86, 1.0, bz - iz));
      const f3 = lev(ix, iz, 5) * (0.55 + 0.45 * fx * fz) * 0.8 + f0 * 0.25;
      let spikes = 0;
      for (const o of outliers) if (z > o.z0 && z < o.z1) spikes += o.a * Math.exp(-Math.pow((x - o.x) / o.w, 2)) * smoothstep(o.z0, o.z0 + 5, z) * (1 - smoothstep(o.z1 - 5, o.z1, z));
      const k = (j * BW + i) * 4;
      data[k] = f0; data[k + 1] = f1 + spikes * 0.5; data[k + 2] = f2 + spikes * 0.25; data[k + 3] = f3 + spikes * 0.8;
    }
  }
  const tex = new THREE.DataTexture(data, BW, BH, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return tex;
}

/** The mesh: a grid in cell coordinates, x centred on 0 (world x = cell x - 18). Heights are applied in the vertex shader. */
export function buildGrid(nx = 180, nz = 300): THREE.BufferGeometry {
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = (j * (nx + 1) + i) * 3;
    pos[k] = (i / nx) * (TX.x1 - TX.x0) - 18; pos[k + 1] = 0; pos[k + 2] = TX.z0 + (j / nz) * (TX.z1 - TX.z0);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Height function shared by the vertex and fragment stages. Cell coordinates c = (x, z); heights in cells. */
export const GLSL_TERRAIN = /* glsl */ `
precision highp sampler2D;
${GLSL_HEIGHT}
uniform sampler2D uB; uniform vec4 uW;
uniform float uT, uMorph, uBlur, uFlat, uHS, uBump, uBeat;
uniform vec4 uRip[9];
float hh12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hA(vec2 c) { // the atom lattice (defocused by uBlur px), heights halved into cells
  vec2 px = c * 54.0;
  if (px.y < -40.0 || px.y > 1120.0 || px.x < -40.0 || px.x > 1960.0) return 0.0;
  if (uBlur < 0.5) return hTex(px) * 0.5;
  float s = 0.0;
  for (int i = 0; i < 9; i++) s += hTex(px + vec2(float(i % 3 - 1), float(i / 3 - 1)) * uBlur);
  return s / 9.0 * 0.5;
}
float land(vec2 c) {
  vec2 q = vec2((c.x - ${TX.x0.toFixed(1)}) / ${(TX.x1 - TX.x0).toFixed(1)}, (c.y - ${TX.z0.toFixed(1)}) / ${(TX.z1 - TX.z0).toFixed(1)}) * vec2(${BW - 1}.0, ${BH - 1}.0);
  q = clamp(q, vec2(0.0), vec2(${BW - 2}.0, ${BH - 2}.0));
  ivec2 i = ivec2(floor(q)); vec2 f = fract(q);
  vec4 a = mix(mix(texelFetch(uB, i, 0), texelFetch(uB, i + ivec2(1, 0), 0), f.x), mix(texelFetch(uB, i + ivec2(0, 1), 0), texelFetch(uB, i + ivec2(1, 1), 0), f.x), f.y);
  return dot(a, uW);
}
float bumpW(vec2 c) { // every weight a bump or dent on its lattice site
  vec2 id = floor(c + 0.5), d = c - id;
  float w = hh12(id + 17.0) * 2.0 - 1.0;
  w = sign(w) * pow(abs(w), 1.4);
  float br = 0.82 + 0.18 * sin(uT * 0.9 + hh12(id) * 6.2831);
  float g = exp(-dot(d, d) / (2.0 * 0.176 * 0.176));
  return w * br * g;
}
float H(vec2 c) {
  float hnew = land(c) * uHS + bumpW(c) * uBump;
  float h = mix(hA(c), hnew, uMorph);
  for (int i = 0; i < 9; i++) {
    float age = uT - uRip[i].z;
    if (age < 0.0 || age > 2.4) continue;
    float r = length(c - uRip[i].xy);
    float wave = exp(-pow((r - age * 7.5) / 1.1, 2.0)) * cos((r - age * 7.5) * 3.2) * (1.0 - age / 2.4);
    h += uRip[i].w * wave;
  }
  h += uBeat * 0.12 * land(c);
  return h * (1.0 - uFlat);
}`;

export const VERT_TERRAIN = /* glsl */ `
precision highp float;
precision highp int;
in vec3 position;
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
${GLSL_TERRAIN}
out vec3 vP;
void main() {
  vec3 p = position;
  p.y = H(vec2(p.x + 18.0, p.z));
  vP = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

export const FRAG_TERRAIN = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${GLSL_TERRAIN}
in vec3 vP; out vec4 fragColor;
uniform vec3 uCam; uniform float uCoarse, uFog;
float hatchF(float u, float dark) { // like hatch(), with the line faded out before it aliases
  float fw = fwidth(u);
  float f = abs(fract(u) - 0.5);
  float hw = 0.5 * clamp(dark, 0.0, 1.0);
  float a = max(fw, 1e-3);
  return (1.0 - smoothstep(hw - a, hw + a, 0.5 - f)) * (1.0 - smoothstep(0.30, 0.62, fw)) + smoothstep(0.30, 0.62, fw) * dark * 0.5;
}
void main() {
  vec2 c = vec2(vP.x + 18.0, vP.z);
  float h = H(c);
  vec3 P = vec3(vP.x, h, vP.z);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  if (N.y < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.55, 0.62, 0.55));
  float lamRel = max(dot(N, L) - L.y, 0.0);
  float hn = clamp(h / 0.5, 0.0, 1.3);
  float atomK = 1.0 - uMorph;
  float lift = clamp(h * 0.22, -0.2, 1.0);
  float dark = clamp(0.10 + 0.42 * hn * atomK + 1.1 * lamRel + 0.16 * lift, 0.04, 0.92);
  float ln1 = hatchF(vP.z / 0.0926, dark);
  float ln2 = hatchF(vP.z / 0.30, min(1.0, dark * 0.8 + 0.18)) * uCoarse;
  float ln = max(ln1, ln2);
  vec3 lc = heat(0.20 + 0.48 * hn * atomK + 0.55 * lamRel + 0.22 * clamp(h * 0.25, 0.0, 1.0));
  vec3 V = normalize(uCam - P);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 col = C_INK + lc * ln;
  col += C_SIGNAL * 0.55 * rim * lamRel * ln;
  // iso-height contours: faint topographic accents
  col += C_SIGNAL * 0.22 * hatchF(h * 2.2, 0.06) * smoothstep(0.1, 0.5, abs(h)) * uMorph;
  float d = length(uCam - P);
  col *= exp(-pow(d / uFog, 2.0));
  float py = 1080.0 - FRAG_PX.y;
  col *= 1.0 - 0.94 * smoothstep(790.0, 930.0, py);
  fragColor = vec4(col, 1.0);
}`;

export { LAT };
