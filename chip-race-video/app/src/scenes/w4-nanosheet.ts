// W4 THE NANOSHEET (bars 16-18, "Two nanometers holding the crown"; recap 120-123.75 with { recap: true }):
// the transistor changes architecture while you watch, hand-built and shaded as a scanning-electron micrograph
// (engine/se.ts: SDF world -> half-res G-buffer -> semShade). World unit = 1 nm.
//
//  Model: a die-wide lattice of 7 nm FinFETs (fin pitch 30, gate pitch 90, 40 nm fins, 46 nm gate bars; cell = 3 fins x
//  1 gate = 90 nm). The hero is cell (0,0). Each fin is three 12 nm segments; on the ratchet the fin narrows 7, 5, 3, 2 and
//  on "2" the three segments each turn 90 degrees and lie down as three stacked 22 x 5 nm nanosheets, wrapped by a gate
//  (hi-k shell + metal) that is subtracted around them. Spacers, raised S/D epi (faceted) and contacts + M0 are
//  deposited as the architecture changes. A cross-section plane sweeps down the channel and the camera dives through the gate
//  (the cut face reads silicon / hi-k / metal / spacer / epi). On "the crown" every device sinks in a ripple and the crown
//  cells (node1-crown, or the 12x6 tile crown of node3-kit in the recap) rise in order from the base, each lit by an amber lamp.
//  The recap swaps each device for an SE-look tile (sand heap, tin droplet + pancake, collector rings, mirror dish, wafer,
//  HBM stack, shield, atom) = earlier worlds.
//  Lyric to geometry: "Two" 30.00 the 7 nm fin; "na-no-me-ters" 30.23-31.17 calipers 7, 5, 3, 2; at "2" the fin lies down;
//  "holding" 31.17 the dive through the gate; "the crown" 31.64/31.88 the array rises into the crown.
//  in : drop's last frame: top-down die-dive lattice, fins 58.3 px apart, gates 175 px apart, hero fin/gate at W/2,H/2.
//  out: top-down, cells 48 px apart (96 x 108 px tiles in the recap) on the crown, one amber lamp per crown cell on a faint
//       lattice trace; centred on W/2,H/2 exactly like node1/node3's last frame, so grid1/grid3 can shrink the lights to town lights.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, hash, lerp, smoothstep, smootherstep, clamp, TAU } from '../engine/util';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam } from '../engine/se';
import { crownCells } from './node1-crown';
import { crownAt, CROWN_OY } from './node3-kit';

const NI = 21, NJ = 13;                       // lattice cells |i| <= 21, |j| <= 13
const PPM0 = 58.3333 / 30;                    // px per nm of the die-dive lattice (fin pitch 30 nm = 58.3 px)
const PPMF = 48 / 90;                         // px per nm at the top-down end (a 90 nm cell = 48 px)
const f1 = (x: number) => x.toFixed(4);
const ss01 = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeIO = (x: number) => ss01(x);

// ------------------------------------------------------------------------------------------------ the world
const WORLD = /* glsl */ `
uniform float uR, uRecap, uFw, uPed, uSp, uEpi, uCon, uZc;
uniform vec4 uSegA[3];     // seg y centre, half x, half y (before the turn), corner radius
uniform vec2 uSegB[3];     // cos, sin of the turn
uniform sampler2D uCell;   // ${2 * NI + 1} x ${2 * NJ + 1}: crown flag, hash, order, icon
uniform sampler2D uTile;   // 20 x 10 (recap crown): 0 / 1 / 2 (jewel), hash, order, icon
const float PP = 90.0, PPMF = ${f1(PPMF)};
const float TPX = 96.0 / ${f1(PPMF)}, TPZ = 108.0 / ${f1(PPMF)};
#define SE_SHADOW 0.5
#define SE_STEPS 100
#define SE_SHADOW_STEPS 6

float outBack(float x) { x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + 2.2 * x * x * x + 1.2 * x * x; }

/** fins (3 per cell) as three segments that turn 90 degrees into stacked sheets; q: x across, y up, z along the channel */
float sheetsD(vec3 q) {
  float fx = q.x - 30.0 * clamp(floor(q.x / 30.0 + 0.5), -1.0, 1.0);
  float d = seRoundBox(vec3(fx, q.y - 2.2, q.z), vec3(uPed, 2.2, 45.6), 0.4);   // sub-fin pedestal
  for (int k = 0; k < 3; k++) {
    vec4 A = uSegA[k]; vec2 B = uSegB[k];
    vec2 r = vec2(fx, q.y - A.x);
    r = vec2(B.x * r.x + B.y * r.y, -B.y * r.x + B.x * r.y);
    d = min(d, seRoundBox(vec3(r, q.z), vec3(A.y, A.z, 45.6), A.w));
  }
  return d;
}

/** one transistor of the lattice (local frame: cell centre on the ground, channel along z). lit > 0 adds the amber lamp. */
vec2 deviceD(vec3 q) {
  vec2 res = vec2(1.0e5, SE_SILICON);
  float dB = seRoundBox(q - vec3(0.0, 48.0, 0.0), vec3(45.6, 50.0, 45.6), 0.0);
  if (dB > 4.0) return seUnion(res, vec2(dB + 8.0, SE_SILICON));
  float dS = sheetsD(q);
  res = seUnion(res, vec2(dS, SE_SILICON));
  // gate: hi-k shell + metal wrapped around the sheets (subtracted)
  float dG = seRoundBox(q - vec3(0.0, 23.0, 0.0), vec3(44.0, 23.0, 9.0), 1.5);
  res = seUnion(res, vec2(max(dG, -(dS - 1.2)), SE_METAL));
  res = seUnion(res, vec2(max(max(dS - 1.2, -dS), dG), SE_OXIDE));
  float zz = abs(q.z);
  float fx = q.x - 30.0 * clamp(floor(q.x / 30.0 + 0.5), -1.0, 1.0);
  // spacers
  if (uSp > 0.01) {
    float t = 4.0 * uSp;
    float dSp = seRoundBox(vec3(q.x, q.y - 23.0, zz - (9.0 + t * 0.5)), vec3(44.0, 23.0, t * 0.5), 0.3 * uSp);
    res = seUnion(res, vec2(max(dSp, -dS), SE_OXIDE));
  }
  // raised S/D epi: faceted lumps on each fin
  if (uEpi > 0.02) {
    float s = uEpi;
    vec3 e = vec3(fx, q.y - 22.0, zz - 29.8) / s;
    float d0 = seRoundBox(e, vec3(13.0, 17.0, 15.8), 2.5);
    float dc = abs(e.x) * 0.6 + abs(e.y) * 0.8 - 15.0;
    res = seUnion(res, vec2(max(d0, dc) * s, 7.0));
  }
  // contacts, M0 rails and the gate via
  if (uCon > 0.02) {
    float s = uCon;
    float dCy = seCylYR(vec3(fx, q.y - (39.0 + 13.0 * s), zz - 29.8), 4.5, 13.0 * s, 0.5);
    float dRail = seRoundBox(vec3(q.x, q.y - 66.0, zz - 29.8), vec3(40.0, 2.5, 3.5) * s, 0.4 * s);
    float dVia = seCylYR(vec3(q.x, q.y - (46.0 + 10.0 * s), q.z), 3.6, 10.0 * s, 0.5);
    res = seUnion(res, vec2(min(dCy, min(dRail, dVia)), SE_METAL));
  }
  return res;
}

void ut(inout float d, inout float id, float d2, float id2) { if (d2 < d) { d = d2; id = id2; } }
/** SE-look tiles of the earlier worlds (recap): local frame, tile half size 40, plinth top at y = 6 */
vec2 tileD(vec3 q, float ic) {
  float d = seRoundBox(q - vec3(0.0, 3.0, 0.0), vec3(40.0, 3.0, 40.0), 1.2), id = SE_OXIDE;
  if (q.y > 60.0 || length(q.xz) > 60.0) return vec2(d, id);
  vec3 a = q - vec3(0.0, 6.0, 0.0);
  if (ic < 0.5) {            // sand: a heap of grains
    float h = seEllipsoid(a - vec3(0.0, 2.0, 0.0), vec3(24.0, 9.0, 24.0));
    for (int k = 0; k < 6; k++) { float fk = float(k); h = min(h, length(a - vec3(cos(fk * 2.1) * (10.0 + 3.0 * fk), 11.0 + 2.0 * sin(fk * 3.7), sin(fk * 2.1) * (9.0 + 2.0 * fk))) - (2.6 + 0.3 * fk)); }
    ut(d, id, h, SE_OXIDE);
  } else if (ic < 1.5) {     // tin: the droplet over its pancake
    ut(d, id, length(a - vec3(0.0, 17.0, 0.0)) - 10.0, SE_METAL);
    ut(d, id, seTorusY(a - vec3(0.0, 3.0, 0.0), 22.0, 3.0), SE_SILICON);
  } else if (ic < 2.5) {     // collector rings
    ut(d, id, seTorusY(a - vec3(0.0, 2.0, 0.0), 32.0, 2.2), SE_SILICON);
    ut(d, id, seTorusY(a - vec3(0.0, 3.5, 0.0), 23.0, 2.2), SE_SILICON);
    ut(d, id, seTorusY(a - vec3(0.0, 5.0, 0.0), 14.0, 2.2), SE_SILICON);
    ut(d, id, length(a - vec3(0.0, 9.0, 0.0)) - 4.0, SE_METAL);
  } else if (ic < 3.5) {     // mirror dish
    vec3 b = a - vec3(0.0, 30.0, 0.0);
    ut(d, id, max(abs(length(b) - 26.0) - 1.4, b.y + 8.0), SE_METAL);
  } else if (ic < 4.5) {     // wafer with its die streets
    float w = seCylYR(a - vec3(0.0, 1.5, 0.0), 30.0, 1.5, 0.4);
    float g = min(abs(seRep(a.x, 8.0)), abs(seRep(a.z, 8.0))) - 0.35;
    ut(d, id, max(w, -max(g, a.y - 2.2)), SE_SILICON);
  } else if (ic < 5.5) {     // HBM tower: 12 dies and TSV columns
    float yy = a.y - 1.0;
    float kk = clamp(floor(yy / 2.8 + 0.5), 0.0, 11.0);
    ut(d, id, seRoundBox(vec3(a.x, yy - kk * 2.8, a.z), vec3(14.0, 1.0, 14.0), 0.35), SE_SILICON);
    ut(d, id, seRoundBox(vec3(a.x - 7.0 * clamp(floor(a.x / 7.0 + 0.5), -1.0, 1.0), a.y - 17.0, a.z - 14.2), vec3(0.9, 16.5, 0.9), 0.3), SE_METAL);
  } else if (ic < 6.5) {     // shield
    float sx = a.x, sy = a.y - 1.0;
    float box2 = seRoundBox2(vec2(sx, sy - 17.0), vec2(15.0, 16.0), 1.0);
    float curve = (3.0 + 16.0 * (sx / 15.0) * (sx / 15.0) - sy) * 0.7;
    ut(d, id, max(max(box2, curve), abs(a.z) - 4.0), SE_METAL);
  } else {                   // atom
    ut(d, id, length(a - vec3(0.0, 18.0, 0.0)) - 5.0, SE_METAL);
    for (int k = 0; k < 3; k++) ut(d, id, seTorusY(seRotX(1.1) * (seRotY(float(k) * 1.047) * (a - vec3(0.0, 18.0, 0.0))), 20.0, 0.9), SE_SILICON);
  }
  return vec2(d, id);
}

vec2 map(vec3 p) {
  vec2 res = vec2(max(p.y, -60.0 - p.y), p.y > -14.0 ? SE_OXIDE : SE_SILICON);   // STI oxide over silicon
  // device lattice
  vec2 ij = vec2(clamp(floor(p.x / PP + 0.5), -${NI}.0, ${NI}.0), clamp(floor(-p.z / PP + 0.5), -${NJ}.0, ${NJ}.0));
  vec3 q0 = p - vec3(ij.x * PP, 0.0, -ij.y * PP);
  // lattice trace: fin lines and gate bars, always there
  float fx = q0.x - 30.0 * clamp(floor(q0.x / 30.0 + 0.5), -1.0, 1.0);
  res = seUnion(res, vec2(seRoundBox(vec3(fx, q0.y - 1.2, q0.z), vec3(3.5, 1.3, 46.0), 0.4), SE_SILICON));
  res = seUnion(res, vec2(seRoundBox(q0 - vec3(0.0, 0.9, 0.0), vec3(44.0, 0.95, 9.0), 0.4), SE_METAL));
  bool tiles = uRecap > 0.5 && uR > 2.26;
  if (!tiles) {
    vec4 cd = texelFetch(uCell, ivec2(int(ij.x) + ${NI}, int(ij.y) + ${NJ}), 0);
    float d01 = length(ij) / 14.0;
    float sink = uRecap > 0.5 ? smoothstep(1.7 + 0.25 * d01, 1.95 + 0.25 * d01, uR) : smoothstep(1.85 + 0.35 * d01, 2.15 + 0.35 * d01, uR);
    float rise = outBack((uR - (2.56 + 0.52 * cd.z)) / 0.38) * cd.x;
    float settle = smoothstep(3.05, 3.4, uR);
    float L = uRecap > 0.5 ? 1.0 - sink : max(1.0 - sink, rise) * (1.0 - settle * cd.x);
    float lit = uRecap > 0.5 ? 0.0 : cd.x * smoothstep(2.71 + 0.52 * cd.z, 3.0 + 0.52 * cd.z, uR);
    if (L > 0.002) {
      vec3 qd = q0 + vec3(0.0, (1.0 - L) * 110.0, 0.0);
      vec2 dv = uR > 2.3 ? vec2(seRoundBox(qd - vec3(0.0, 33.0, 0.0), vec3(32.0, 33.0, 32.0), 3.0), SE_SILICON) : deviceD(qd);   // sub-pixel detail from here on: a clean block
      dv.x = max(dv.x, -p.y);
      res = seUnion(res, dv);
    }
    if (lit > 0.01) {                       // the amber lamp of a crown cell: floats at 86 nm and stays when the device sinks
      float h = 26.0 * ss(lit);
      float ly = 86.0 - (1.0 - clamp(rise, 0.0, 1.0)) * 110.0;
      if (h > 0.4) res = seUnion(res, vec2(max(seRoundBox(q0 - vec3(0.0, ly, 0.0), vec3(h, 2.3, h), min(h, 1.8)), -p.y), SE_BEAM));
    }
  } else {
    // recap: the crown as a field of tiles, 96 x 108 px each at the end scale
    vec2 tij = vec2(clamp(floor(p.x / TPX + 10.0), 0.0, 19.0), clamp(floor(p.z / TPZ + 5.0), 0.0, 9.0));
    vec4 td = texelFetch(uTile, ivec2(tij), 0);
    if (td.x > 0.5) {
      vec3 c = vec3((tij.x - 9.5) * TPX, 0.0, (tij.y - 4.5) * TPZ);
      float rise = outBack((uR - (2.3 + 0.5 * td.z)) / 0.38);
      float out_ = smoothstep(3.4, 3.7, uR);
      float Lt = rise * (1.0 - out_);
      if (Lt > 0.002) {
        vec3 qt = (p - c) * 0.5 + vec3(0.0, (1.0 - Lt) * 115.0, 0.0);
        float dBt = seRoundBox(qt - vec3(0.0, 28.0, 0.0), vec3(44.0, 32.0, 44.0), 0.0) * 2.0;
        vec2 tv = dBt > 8.0 ? vec2(dBt, SE_OXIDE) : tileD(qt, td.w);
        if (dBt <= 8.0) tv.x *= 2.0;
        tv.x = max(tv.x, -p.y);
        res = seUnion(res, tv);
      }
      float lit = smoothstep(2.45 + 0.5 * td.z, 2.72 + 0.5 * td.z, uR);
      float cy = 100.0 - (1.0 - clamp(rise, 0.0, 1.0)) * 230.0;
      float h = 28.0 * ss(lit) * (td.x > 1.5 ? 1.25 : 1.0);
      if (h > 0.4) res = seUnion(res, vec2(max(seRoundBox(p - c - vec3(0.0, cy, 0.0), vec3(h, 2.3, h), min(h, 1.8)), -p.y), SE_BEAM));
    }
  }
  res.x = max(res.x, p.z - uZc);      // the sweeping cross-section plane
  return res;
}

float ss(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-2300.0, -70.0, -1800.0), hi = vec3(2300.0, 110.0, 1800.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}
float matZ(float id, vec3 p, vec3 n) {
  float Z = id < 6.5 ? seMatZ(id) : (id < 7.5 ? 0.66 : 0.72);
  if (id > 5.5 && id < 6.5) return Z;
  float far = smoothstep(48.0, 70.0, max(abs(p.x), abs(p.z))) * (1.0 - smoothstep(1.85, 2.05, uR));
  Z *= 1.0 - 0.58 * far;
  if (id < 0.5) Z *= 1.0 + 0.45 * (1.0 - far) * (1.0 - smoothstep(1.85, 2.05, uR));   // the hero's silicon is the brightest thing
  if (!(uRecap > 0.5 && uR > 2.26)) Z *= 1.0 - 0.5 * smoothstep(700.0, 2400.0, length(p - uCamPos));                         // sub-pixel detail loses contrast with distance
  if (p.y < 2.8 && p.y > -0.5) Z *= 0.5;                                                  // lattice trace
  return Z;
}
float matAmber(float id, vec3 p, vec3 n) { return (id > 5.5 && id < 6.5) ? 0.99 : 0.0; }
`.replace('float outBack', 'float ss(float x);\nfloat outBack');

const SHADE = /* glsl */ `
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0;
  if (id > 2.5 && id < 3.5 && n.y > 0.8) {      // STI oxide: a faint quartz-like charging gloss
    mz *= 0.92 + 0.08 * sin(p.x * 0.31) * sin(p.z * 0.27);
  }
  return vec2(mz, 0.0);
}`;

// ------------------------------------------------------------------------------------------------ timing
const WSTEP = [[0.4688, 2.5], [0.7031, 1.5], [0.9375, 1.0]] as const;
/** fin half width: 3.5 (7 nm) ratcheting to 2.5, 1.5, 1.0 on the syllables na-NO-ME-TERS, each a quick settle */
function finHalf(r: number) {
  let w = 3.5;
  for (const [t, v] of WSTEP) {
    const k = clamp((r - t) / 0.11);
    const e = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.06;
    w = lerp(w, v, k >= 1 ? 1 : e);
  }
  return w;
}
const NM_LABEL = (r: number) => (r < WSTEP[0][0] ? 7 : r < WSTEP[1][0] ? 5 : r < WSTEP[2][0] ? 3 : 2);
const morphAt = (r: number) => smoothstep(0.96, 1.5, r);
function zcAt(r: number, recap = false) {
  const rs = recap ? 1.75 : 2.0, rd = recap ? 0.45 : 0.6;
  if (r < 0.85) return 1e4;
  if (r < 1.17) return lerp(170, 9, easeIO((r - 0.85) / 0.32));
  if (r < 1.5) return lerp(9, -9, easeIO((r - 1.17) / 0.33));
  if (r < 1.7) return lerp(-9, -50, easeIO((r - 1.5) / 0.2));
  if (r < rs) return -50;
  if (r < rs + rd) return lerp(-50, 700, easeIO((r - rs) / rd));
  return 1e4;
}
interface Pose { az: number; el: number; ppm: number; tgt: [number, number, number] }
function pose(r: number): Pose {
  const ln = Math.log;
  if (r < 0.6) {
    const u = smootherstep(0, 0.6, r);
    return { az: lerp(0, -34, u), el: lerp(90, 40, u), ppm: Math.exp(lerp(ln(PPM0), ln(7.0), u)), tgt: [0, lerp(0, 22, u), 0] };
  }
  if (r < 1.17) {
    const u = (r - 0.6) / 0.57;
    return { az: lerp(-34, -40, u), el: lerp(40, 35, u), ppm: lerp(7.0, 7.8, u), tgt: [0, lerp(22, 24, u), lerp(0, 9, u)] };
  }
  if (r < 1.64) {
    const u = ss01((r - 1.17) / 0.47);
    return { az: lerp(-40, 0, u), el: lerp(35, 4, u), ppm: Math.exp(lerp(ln(7.8), ln(15), u)), tgt: [0, 24, zcAt(r)] };
  }
  const u = clamp((r - 1.64) / 1.66), e = ss01(u);
  return { az: 0, el: 4 + 86 * smoothstep(0.02, 0.8, u), ppm: Math.exp(lerp(ln(15), ln(PPMF), e)), tgt: [0, lerp(24, 0, e), lerp(zcAt(1.64), 0, e)] };
}
const camOf = (r: number): SECam => { const p = pose(r); return seCamera(p.tgt, p.az, p.el, p.ppm); };

// ------------------------------------------------------------------------------------------------ the scene
export default class W4Nanosheet extends Scene {
  override seGrade = 0;
  recap = false;
  T0 = 30.0;
  shade!: SEShade;
  strip = new SEStrip();
  text = new Layer2D(W, H);
  private uni!: Record<string, THREE.IUniform>;
  private texs: THREE.Texture[] = [];

  override init() {
    this.recap = !!this.ctx.params.recap;
    this.T0 = this.recap ? 120.0 : 30.0;
    const NX = 2 * NI + 1, NY = 2 * NJ + 1;
    const cells = new Float32Array(NX * NY * 4);
    for (let j = -NJ; j <= NJ; j++) for (let i = -NI; i <= NI; i++) {
      const o = ((j + NJ) * NX + (i + NI)) * 4;
      cells[o + 1] = hash(i, j, 7); cells[o + 3] = Math.floor(hash(i, j, 9) * 7);
    }
    for (const c of crownCells()) {
      const o = ((c.j + NJ) * NX + (c.i + NI)) * 4;
      cells[o] = 1; cells[o + 2] = c.order;
    }
    const cellTex = new THREE.DataTexture(cells, NX, NY, THREE.RGBAFormat, THREE.FloatType);
    const tiles = new Float32Array(20 * 10 * 4);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 20; i++) {
      const k = crownAt(i, j), o = (j * 20 + i) * 4;
      const row = j - CROWN_OY;
      tiles[o] = k; tiles[o + 1] = hash(i, j, 3);
      tiles[o + 2] = k ? clamp(((5 - row) / 5) * 0.85 + 0.15 * hash(i, j, 4)) : 0;
      tiles[o + 3] = Math.floor(hash(i, j, 5) * 7);
    }
    // the crown's icons walk through the worlds in order along each row so every earlier world appears
    for (let j = 0; j < 10; j++) for (let i = 0; i < 20; i++) tiles[(j * 20 + i) * 4 + 3] = (i * 3 + j * 2) % 7;
    const tileTex = new THREE.DataTexture(tiles, 20, 10, THREE.RGBAFormat, THREE.FloatType);
    for (const t of [cellTex, tileTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
    this.texs.push(cellTex, tileTex);
    const v = (x: number) => ({ value: x });
    this.uni = {
      uR: v(0), uRecap: v(this.recap ? 1 : 0), uFw: v(3.5), uPed: v(3.5), uSp: v(0), uEpi: v(0), uCon: v(0), uZc: v(1e4),
      uSegA: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uSegB: { value: [new THREE.Vector2(1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 0)] },
      uCell: { value: cellTex }, uTile: { value: tileTex },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 2.0 });
  }

  private setState(r: number) {
    const u = this.uni;
    const fw = finHalf(r), m = morphAt(r);
    u.uR!.value = r; u.uFw!.value = fw;
    u.uPed!.value = lerp(fw, 9, ss01(m));
    u.uSp!.value = smoothstep(1.05, 1.25, r);
    u.uEpi!.value = smoothstep(1.15, 1.5, r);
    u.uCon!.value = smoothstep(1.3, 1.6, r);
    u.uZc!.value = zcAt(r, this.recap);
    const A = u.uSegA!.value as THREE.Vector4[], B = u.uSegB!.value as THREE.Vector2[];
    for (let k = 0; k < 3; k++) {
      const mk = ss01(clamp((m - 0.1 * k) / 0.62));
      const ex = lerp(fw, 2.5, mk), ey = lerp(5.8, 11, mk), a = mk * Math.PI / 2;
      A[k]!.set(lerp(10 + 12 * k, 12 + 12 * k, mk), ex, ey, Math.min(Math.min(ex, ey) * 0.9, 1.3));
      B[k]!.set(Math.cos(a), Math.sin(a));
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, r = t - this.T0, kick = f.a.kick;
    this.setState(r);
    const cam = camOf(r), pp = pose(r);
    const a = camOf(r - 1 / 30), b = camOf(r + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / (cam.dist * 1.2) + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.15 + sp, 0, 1);
    this.shade.gbuf.u.uCavL!.value = clamp(14 / pp.ppm, 1.6, 12);
    const reveal = r < 0.25 ? clamp((r + 0.02) / 0.25) : 2;
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, rim: 0.95 - 0.4 * smoothstep(1.9, 2.7, r), focus: cam.dist * 0.8, hazeL: cam.dist * 1.6, zHaze: 0.3,
      reveal: 2, dim: 0.5,
    });
    void reveal;

    // ---- overlays: calipers, section plane, etched lyric, footnote
    const c = this.text.ctx;
    this.text.clear();
    this.drawOverlay(c, cam, r);
    comp.draw(renderer, this.text.upload(), out, { scale: [1, 1], offset: [0, 0] });
    const sa = smoothstep(0.1, 0.35, r) * (1 - smoothstep(3.1, 3.4, r));
    this.strip.composite(renderer, comp, out, { ppm: pp.ppm * 1000, unit: 'um', alpha: sa });
    return sePost({ ca: 1.6 * kick * smoothstep(0.2, 0.5, r) * (1 - smoothstep(3.0, 3.3, r)) });
  }

  private drawOverlay(c: CanvasRenderingContext2D, cam: SECam, r: number) {
    const P = (x: number, y: number, z: number) => seProject(cam, [x, y, z]);
    const BONE = 'rgba(238,233,223,', AMB = '#FFA41B';
    const mono = (s: string, x: number, y: number, size: number, col: string, wgt = 400, ls = 2) => {
      c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      (c as any).letterSpacing = `${ls}px`; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    const line = (x0: number, y0: number, x1: number, y1: number, col: string, w = 1.2) => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    };
    // ---- dimension calipers on the fin: 7, 5, 3, 2
    const ca = smoothstep(0.12, 0.26, r) * (1 - smoothstep(1.02, 1.18, r));
    if (ca > 0.01) {
      const fw = finHalf(r), zc = 30;
      c.save(); c.globalAlpha = ca;
      const A = P(-fw, 40, zc), B = P(fw, 40, zc), DA = P(-fw, 55, zc), DB = P(fw, 55, zc);
      const col = BONE + '0.88)';
      line(A.x, A.y - 4, DA.x, DA.y - 7, col); line(B.x, B.y - 4, DB.x, DB.y - 7, col);
      const wpx = DB.x - DA.x, ay = (DA.y + DB.y) / 2;
      const tri = (x: number, y: number, dir: number) => {
        c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dir * 12, y - 4); c.lineTo(x + dir * 12, y + 4); c.closePath(); c.fill();
      };
      if (wpx > 44) { line(DA.x, ay, DB.x, ay, col); tri(DA.x, ay, 1); tri(DB.x, ay, -1); }
      else { line(DA.x - 30, ay, DB.x + 30, ay, col); tri(DA.x, ay, -1); tri(DB.x, ay, 1); }
      const nm = NM_LABEL(r), step = [WSTEP[0][0], WSTEP[1][0], WSTEP[2][0]][nm === 5 ? 0 : nm === 3 ? 1 : 2]!;
      const pop = nm === 7 ? 0 : Math.max(0, 1 - (r - step) / 0.25);
      const sz = 30 + 14 * pop * pop;
      const lx = Math.max(DB.x, DA.x) + (wpx > 44 ? 22 : 40);
      mono(String(nm), lx, ay + 10, sz, AMB, 600, 1);
      mono(nm === 2 ? '* NM' : ' NM', lx + sz * 0.62 + 4, ay + 10, 17, BONE + '0.85)', 500, 2);
      c.restore();
    }
    // ---- the sweeping section plane: a thin amber frame at z = zc
    const zc = zcAt(r, this.recap);
    const pa = smoothstep(0.85, 1.0, r) * (1 - smoothstep(2.0, 2.3, r));
    if (zc < 400 && pa > 0.01) {
      c.save(); c.globalAlpha = pa * 0.9;
      const k = [[-50, -4], [50, -4], [50, 76], [-50, 76]].map(([x, y]) => P(x!, y!, zc));
      c.strokeStyle = AMB; c.lineWidth = 1.6; c.beginPath(); c.moveTo(k[0]!.x, k[0]!.y);
      for (let i = 1; i < 4; i++) c.lineTo(k[i]!.x, k[i]!.y);
      c.closePath(); c.stroke();
      mono('SECTION A-A', k[3]!.x + 8, k[3]!.y - 10, 14, AMB, 500, 3);
      c.restore();
    }
    // ---- the lyric, etched small and tied to the geometry it drives
    const word = (txt: string, r0: number, r1: number, ax: number, ay: number, ox: number, oy: number) => {
      const al = smoothstep(r0, r0 + 0.12, r) * (1 - smoothstep(r1 - 0.25, r1, r));
      if (al < 0.01) return;
      const cur = r < r0 + 0.5 ? 1 : 0.62;
      c.save(); c.globalAlpha = al * cur;
      line(ax, ay, ax + ox * 0.6, ay + oy, BONE + '0.6)', 1);
      line(ax + ox * 0.6, ay + oy, ax + ox, ay + oy, BONE + '0.6)', 1);
      c.fillStyle = BONE + '0.9)'; c.beginPath(); c.arc(ax, ay, 2.4, 0, TAU); c.fill();
      mono(txt, ax + ox + 8, ay + oy + 6, 18, BONE + '0.95)', 400, 5);
      c.restore();
    };
    const fin = P(0, 41, 0);
    word('TWO', 0.04, 1.0, fin.x, fin.y, 90, -90);
    const cal = P(0, 55, 30);
    word('NANOMETERS', 0.23, 1.15, cal.x, cal.y, -150, -70);
    const gate = P(44, 46, Math.min(zc, 9));
    word('HOLDING', 1.17, 2.1, clamp(gate.x, 200, W - 480), clamp(gate.y, 160, H - 200), 70, -80);
    const hero = P(0, 70, Math.min(zc, 0));
    word('THE CROWN', 1.64, 3.0, clamp(hero.x, 300, W - 520), clamp(hero.y, 200, H - 260), 90, -100);
    // ---- the joke, as a footnote
    const fa = smoothstep(1.95, 2.2, r) * (1 - smoothstep(3.0, 3.25, r));
    if (fa > 0.01) {
      c.save(); c.globalAlpha = fa;
      line(96, H - 118, 96 + 120, H - 118, BONE + '0.6)', 1);
      mono('* "2 NM" IS A NAME, NOT A MEASUREMENT', 96, H - 92, 17, BONE + '0.92)', 400, 3);
      c.restore();
    }
  }

  override dispose() { this.shade.dispose(); for (const t of this.texs) t.dispose(); }
}
