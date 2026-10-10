// node2: the die shot as a city. A procedural floorplan (BSP of functional blocks) in a nearest-filtered
// id texture; the shader generates street/cell/SRAM patterns at any zoom, with fake height shadows (a top-down
// city at low sun), block borders as district lines, amber "traffic" on the NoC highways and a wafer
// of identical dies at the widest zoom.
import * as THREE from 'three';
import { mulberry32 } from '../engine/util';

export const N = 256; // floorplan texels

export interface Floorplan { tex: THREE.DataTexture; target: { x: number; y: number; w: number; h: number }; blocks: { x: number; y: number; w: number; h: number; type: number; id: number }[] }

// types: 0 NoC channel, 1 IO ring, 2 CORE, 3 SRAM, 4 ANALOG, 5 HOT CORE
export function buildFloorplan(seed = 11): Floorplan {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(N * N * 4);
  const blocks: Floorplan['blocks'] = [];
  let nextId = 1;
  const fill = (x: number, y: number, w: number, h: number, type: number, id: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const o = (j * N + i) * 4;
      data[o] = type * 40; data[o + 1] = id; data[o + 2] = 0; data[o + 3] = 255;
    }
  };
  fill(0, 0, N, N, 0, 0);
  // IO ring: pad frame (type 1) of width 9 with a gap channel inside
  const R = 9;
  fill(0, 0, N, R, 1, 250); fill(0, N - R, N, R, 1, 250); fill(0, 0, R, N, 1, 250); fill(N - R, 0, R, N, 1, 250);
  const split = (x: number, y: number, w: number, h: number, depth: number) => {
    const small = w < 22 || h < 22;
    if (depth >= 7 || small || (depth >= 3 && rnd() < 0.2)) {
      let type = rnd() < 0.42 ? 2 : rnd() < 0.7 ? 3 : rnd() < 0.85 ? 2 : 4;
      if (w * h > 60 * 60 && rnd() < 0.5) type = 3;
      const id = nextId++;
      fill(x, y, w, h, type, id);
      blocks.push({ x, y, w, h, type, id });
      return;
    }
    const ch = 3; // channel
    if (w > h) {
      const c = Math.floor(w * (0.35 + rnd() * 0.3));
      split(x, y, c - 1, h, depth + 1); split(x + c + ch - 1, y, w - c - ch + 1, h, depth + 1);
    } else {
      const c = Math.floor(h * (0.35 + rnd() * 0.3));
      split(x, y, w, c - 1, depth + 1); split(x, y + c + ch - 1, w, h - c - ch + 1, depth + 1);
    }
  };
  split(R + 4, R + 4, N - 2 * R - 8, N - 2 * R - 8, 0);
  // the target "hot" core: the biggest CORE
  let best = blocks.filter((b) => b.type === 2).sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? blocks[0]!;
  // make it hot
  fill(best.x, best.y, best.w, best.h, 5, best.id);
  best.type = 5;
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
  // target in die units centred on the die centre (x right, y down), 1 = die width
  return { tex, blocks, target: { x: (best.x + best.w / 2) / N - 0.5, y: (best.y + best.h / 2) / N - 0.5, w: best.w / N, h: best.h / N } };
}

export const DIE_FRAG = /* glsl */ `
uniform sampler2D uFloor;
uniform vec4 uCam;      // x,y (die units, y down), px per die unit, rotation
uniform float uT;
uniform float uBeat;    // kick pulse 0..1
uniform float uWafer;   // wafer radius in die units (0 = no wafer, infinite dies)
uniform float uDim;     // 1 = full, <1 darker (under lyrics)
uniform float uHot;     // global hot level
uniform float uPaper;   // 0..1 bone paper outside the wafer
uniform vec4 uFocus;    // screen px centre (xy), inner radius, outer radius : vignette darkening around centre
uniform float uSrcWave; // time of the last downbeat wave origin
uniform float uBlank;   // 0..1 fade whole die to ink (for handoff)
uniform vec4 uMedal;    // screen px centre xy, radius, strength (darkens inside the disc so wires read)

const float NN = ${N}.0;
int typeAt(ivec2 q) { if (q.x < 0 || q.y < 0 || q.x >= ${N} || q.y >= ${N}) return 0; return int(texelFetch(uFloor, q, 0).r * 255.0 / 40.0 + 0.5); }
int idAt(ivec2 q) { if (q.x < 0 || q.y < 0 || q.x >= ${N} || q.y >= ${N}) return 0; return int(texelFetch(uFloor, q, 0).g * 255.0 + 0.5); }
float heightOf(int ty) { return ty == 2 || ty == 5 ? 1.0 : ty == 3 ? 0.55 : ty == 4 ? 0.8 : ty == 1 ? 0.25 : 0.0; }

float lineAA(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }

void main() {
  vec2 px = vec2(FRAG_PX.x - 960.0, 540.0 - FRAG_PX.y);
  float fw = 1.0 / uCam.z; // die units per px
  px = rot2(-uCam.w) * px;
  vec2 w = uCam.xy + px * fw;
  vec2 dieId = floor(w + 0.5);
  vec2 d = w - dieId;
  vec2 uv = d + 0.5;
  float aa = fw;                      // one px in die units
  vec3 col = C_INK;
  // wafer mask
  float inWafer = 1.0;
  if (uWafer > 0.0) inWafer = 1.0 - smoothstep(uWafer - 0.5 * aa, uWafer + 0.5 * aa, length(dieId) + 0.0);
  float waferEdge = 1.0;
  if (uWafer > 0.0) { float rr = length(w); inWafer = 1.0 - smoothstep(uWafer - aa, uWafer + aa, rr); }
  // scribe lane and die
  float dieB = max(abs(d.x), abs(d.y));
  float inDie = 1.0 - smoothstep(0.455 - aa, 0.455 + aa, dieB);
  // scribe lane marks (dashes)
  float lane = (1.0 - inDie);
  vec3 laneCol = C_GRAPHITE * 0.25 * lane;
  float laneLine = lineAA(dieB - 0.475, 0.0015, aa * 1.2);
  laneCol += C_GRAPHITE * 0.45 * laneLine;
  col += laneCol;
  if (inDie > 0.0) {
    ivec2 q = ivec2(floor(uv * NN));
    vec2 fr = uv * NN - vec2(q);
    int ty = typeAt(q);
    int id = idAt(q);
    float texPx = uCam.z / NN;              // px per texel
    // borders: distance to the nearest texel edge across which the block id changes
    float e = 1e3;
    if (idAt(q + ivec2(-1, 0)) != id) e = min(e, fr.x);
    if (idAt(q + ivec2( 1, 0)) != id) e = min(e, 1.0 - fr.x);
    if (idAt(q + ivec2(0, -1)) != id) e = min(e, fr.y);
    if (idAt(q + ivec2(0,  1)) != id) e = min(e, 1.0 - fr.y);
    float ePx = e * texPx;
    float border = 1.0 - smoothstep(0.7, 1.7, ePx);
    float border2 = lineAA(ePx - 5.0, 0.55, 1.0) * step(3.0, texPx * 0.5);
    float hgt = heightOf(ty);
    // fake sun shadow: march toward light direction (up-left) over a few texels
    float sh = 0.0;
    vec2 L = normalize(vec2(-0.7, -0.55));
    for (int k = 1; k <= 5; k++) {
      float st = float(k) * 1.6;
      ivec2 q2 = ivec2(floor(uv * NN + L * st));
      float h2 = heightOf(typeAt(q2));
      sh = max(sh, step(hgt + 0.02 + float(k) * 0.05, h2));
    }
    // activity per block: waves of heat across the city
    float bh = hash11(float(id) * 7.31);
    float wave = 0.5 + 0.5 * sin(uT * 4.2 - float(id) * 0.9 + bh * 6.0);
    float act = (ty == 5 ? 0.8 + 0.2 * wave : (ty == 2 || ty == 3 ? smoothstep(0.55, 1.0, wave) * 0.7 * step(0.3, bh) : 0.0)) * uHot;
    float ink = 0.0, sig = 0.0;   // engraved ink strength, amber strength
    vec2 p = uv * NN;             // texel space
    if (ty == 2 || ty == 5) {
      // macro bands (ALU columns / register files), then standard-cell rows, then cells
      float band = hash12(vec2(floor(p.x / 5.0), float(id)));
      ink = 0.18 + 0.28 * band;
      float bedge = lineAA((fract(p.x / 5.0) - 0.5) * 5.0 * texPx - 2.5 * texPx + 0.5, 0.7, 0.8);
      ink = max(ink, (1.0 - smoothstep(0.6, 1.6, min(fract(p.x / 5.0), 1.0 - fract(p.x / 5.0)) * 5.0 * texPx)) * 0.55);
      float pitch = 0.5;
      float fine = smoothstep(2.0, 6.0, pitch * texPx);
      vec2 cid = floor(vec2(p.x / 0.9, p.y / pitch));
      vec2 cf = fract(vec2(p.x / 0.9, p.y / pitch));
      float cell = step(0.3, hash12(cid + float(id)));
      float rowEdge = lineAA((cf.y - 0.5) * pitch * texPx, 0.55, 0.7);
      float blob = step(0.16, cf.x) * step(cf.x, 0.84) * step(0.2, cf.y) * step(cf.y, 0.8) * cell;
      ink = mix(ink, 0.12 + (rowEdge * 0.5 + blob * 0.8) * (0.5 + 0.5 * band), fine);
      sig = blob * fine * act * (0.35 + 0.65 * hash12(cid * 1.7 + floor(uT * 6.0)));
      sig += act * 0.18 * (1.0 - fine) * (0.4 + band);
    } else if (ty == 3) {
      // SRAM: macro tiles then the bitcell lattice
      float mt = 3.2;
      vec2 mf = fract(p / mt);
      float tileEdge = 1.0 - smoothstep(0.5, 1.4, min(min(mf.x, 1.0 - mf.x), min(mf.y, 1.0 - mf.y)) * mt * texPx);
      ink = 0.12 + 0.2 * hash12(floor(p / mt) + float(id)) + 0.35 * tileEdge;
      float pitch = 0.16;
      float fine = smoothstep(1.8, 5.0, pitch * texPx);
      vec2 cf = fract(p / pitch) - 0.5;
      vec2 cid = floor(p / pitch);
      float bit = step(max(abs(cf.x), abs(cf.y)), 0.3);
      ink = mix(ink, 0.1 + bit * 0.65 * (0.7 + 0.3 * hash12(cid)), fine);
      sig = bit * fine * act * step(0.72, hash12(cid + floor(uT * 5.0)));
      sig += act * 0.14 * (1.0 - fine) * hash12(floor(p / mt) + floor(uT * 3.0));
    } else if (ty == 4) {
      vec2 c0 = floor(p / 18.0) * 18.0 + 9.0;
      float rr = length(p - c0);
      ink = lineAA((fract(rr * 0.5) - 0.5) / 0.5 * texPx * 0.5, 0.7, 0.8) * 0.7 + 0.12;
    } else if (ty == 1) {
      vec2 pf = fract(p / 1.7) - 0.5;
      ink = step(max(abs(pf.x), abs(pf.y)), 0.30) * 0.7 + 0.1;
      sig = step(0.8, hash12(floor(p / 1.7))) * 0.4 * smoothstep(0.35, 0.9, wave) * uHot;
    } else {
      // NoC streets: a lattice of channels with traffic
      vec2 g = p / 0.7;
      vec2 lf = fract(g) - 0.5;
      float rail = max(lineAA(lf.y * 0.7 * texPx, 0.6, 0.7) * step(0.35, hash12(vec2(floor(g.y), 3.0))),
                       lineAA(lf.x * 0.7 * texPx, 0.6, 0.7) * step(0.5, hash12(vec2(floor(g.x), 9.0))));
      ink = rail * 0.5 + 0.03;
      float lane = floor(g.y);
      float spd = (3.0 + 5.0 * hash11(lane)) * (0.5 + 0.5 * uHot);
      float dash = step(0.88, fract(g.x * 0.15 - uT * spd * 0.09 + hash11(lane * 3.3)));
      float onLane = lineAA(lf.y * 0.7 * texPx, 0.9, 0.7) * step(0.5, hash11(lane + 4.0));
      sig = dash * onLane * uHot * 1.3;
      float lx = floor(g.x);
      float spy = (2.0 + 4.0 * hash11(lx + 31.0)) * (0.5 + 0.5 * uHot);
      float dashY = step(0.88, fract(g.y * 0.15 - uT * spy * 0.09 + hash11(lx * 2.1)));
      float onLaneY = lineAA(lf.x * 0.7 * texPx, 0.9, 0.7) * step(0.5, hash11(lx + 17.0));
      sig = max(sig, dashY * onLaneY * uHot * 1.3);
    }
    // engraved roofs: constant-px diagonal hatch whose darkness follows the sun shadow and the type
    float hz = hatch((FRAG_PX.x - FRAG_PX.y) / 5.5, 0.16 + 0.42 * sh + (ty == 3 ? 0.08 : 0.0) + (ty == 0 ? 0.25 : 0.0));
    float shade = (0.05 + hgt * 0.07) * (1.0 - 0.75 * sh);
    vec3 base = C_BONE * shade * (1.0 - 0.55 * hz);
    base += (C_BONE * 0.5 + C_ASH * 0.25) * ink * (1.0 - sh * 0.7) * 0.42;
    vec3 c2 = base + (C_SIGNAL * 0.75 + C_EMBER * 0.35 * act) * sig * (1.0 - sh * 0.6);
    if (ty == 5) c2 += C_BLOOD * (0.3 + 0.3 * wave) * uHot * (1.0 - sh * 0.6);
    vec3 bc = ty == 5 ? C_SIGNAL * 1.1 : (C_BONE * 0.5);
    c2 = mix(c2, bc, border * (ty == 0 ? 0.0 : 0.85));
    c2 += bc * border2 * 0.4 * (ty == 0 ? 0.0 : 1.0);
    // kick breathing
    c2 *= 1.0 + 0.35 * uBeat;
    col = mix(col, c2, inDie);
    // die outline: bright seal ring
    float seal = lineAA(dieB - 0.455, 0.0035, aa * 1.2);
    col += C_BONE * 0.45 * seal;
  }
  // wafer edge ring & outside
  if (uWafer > 0.0) {
    float rr = length(w);
    col *= inWafer;
    float ring = lineAA(rr - uWafer, 0.012, aa * 1.2);
    col += C_BONE * 0.8 * ring;
    // outside the wafer is paper (inverted palette of the previous drop) fading to ink
    vec3 paper = C_BONE * 0.92;
    col = mix(col, paper, uPaper * (1.0 - inWafer));
  }
  // vignette around focus
  float vr = length(vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y) - uFocus.xy);
  col *= mix(1.0, 0.22, smoothstep(uFocus.z, uFocus.w, vr));
  float mr = length(vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y) - uMedal.xy);
  col *= 1.0 - uMedal.w * (1.0 - smoothstep(uMedal.z * 0.7, uMedal.z * 1.05, mr));
  col *= uDim * (1.0 - uBlank);
  fragColor = vec4(col, 1.0);
}`;
