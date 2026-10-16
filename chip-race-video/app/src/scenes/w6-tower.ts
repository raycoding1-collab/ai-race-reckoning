// W6 THE TOWER (bars 26-28, "Twelve-high memory stacked like a tower"): HBM as a skyscraper, hand-built and shaded as a
// scanning-electron micrograph (engine/se.ts: SDF world -> half-res G-buffer -> semShade).
//
//  Model (world unit ~ 0.275 mm; the DRAM die is 40 x 40 wide, a floor is 7.8 tall, the tower 104):
//   - substrate (graphite) with decoupling caps; a silicon interposer on it; a 150 x 140 GPU die beside the tower
//     standing on its own microbump layer; pad fields (the bump foundations) around both footprints and 24 PHY traces
//     running from the GPU shore to the tower's foundation.
//   - the tower: a logic base die on a 9 x 9 microbump foundation, then 12 thinned DRAM dies, each separated from the one
//     below by a microbump layer (7 x 7 balls). A cutaway quadrant exposes dark silicon in which the copper TSV columns
//     (bead chains: neck through the gap, a bulge at every bump) glow bright (Z contrast); one shaft carries an elevator
//     cabin riding the beat. Windows are recessed in the street face; a rooftop tower crane (lattice mast and jib,
//     trolley, hoisted spare die) goes up after the last floor.
//  Lyric to geometry: one die per sixteenth from "Twelve-" 48.75 (D1, D2 on the two sixteenths of "Twelve-", D3, D4 "high",
//  D5-D8 "memory"), "stacked" 49.69 slams D9, "like" D10, "a" D11, "tower" 50.86 D12; each slam flashes the floor amber
//  and shakes the frame. At "tower" the beam runs up the TSV columns and the floors light as windows (an office block)
//  while the camera dollies back; then the cutaway seals, the camera rises over the roof and looks straight down.
//  The lyric is etched as thin type on a floor directory beside the tower; callouts D01-D12 are floor numbers.
//  Joke: the lease sign `FULLY LEASED THROUGH 2026`.
//  in : post1/chamber's last frame is one full-width 4 px HDR line at y = H/2: here it is the interposer edge-on (an ink
//       aperture opens around it and the world is revealed).
//  out: the aperture closes onto the roof's near edge: one full-width HDR hairline at y = 0.64 H (smuggle's belt edge).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { F, font } from '../engine/type';
import { frameIdx, hash, lerp, smoothstep, clamp, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam } from '../engine/se';
import type { Word } from '../engine/lyrics';

// ------------------------------------------------------------------------------------------------ constants
const T0 = 48.75, END = 52.5;
const SIX = 60 / 128 / 4;                       // a sixteenth at 128 BPM
const PT = 7.8, YC1 = 15.8, DT = 5.2, TOPY = YC1 + 11 * PT + DT / 2;   // floor pitch, centre of D1, roof
const UNIT_MM = 0.275;
const FALL = 0.11;
/** landing time of die k (0..11) */
const LAND: number[] = [];
for (let k = 0; k < 9; k++) LAND.push(T0 + k * SIX);
LAND.push(T0 + 12 * SIX, T0 + 14 * SIX, 50.859375);
const EDGE_Y = 0.64 * H;
const yc = (k: number) => YC1 + k * PT;
const f1 = (x: number) => x.toFixed(4);

// ------------------------------------------------------------------------------------------------ camera
// [t, elevation deg, azimuth deg, px per unit, target x, y, z]
const FIN_PPM = 9, FIN_TZ = 20 - (EDGE_Y - H / 2) / FIN_PPM;
const CAMK: number[][] = [
  [48.75, 3.5, 27, 14, -34, 0, 0],
  [48.95, 5.0, 28, 13, -30, 6, 0],
  [49.40, 7.0, 30, 10.4, -28, 26, 0],
  [49.72, 9.0, 31, 8.8, -28, 40, 0],
  [50.20, 9.0, 31, 8.0, -27, 47, 0],
  [50.86, 10, 31, 7.4, -26, 52, 0],
  [51.45, 13, 34, 6.3, -40, 56, 0],
  [51.95, 38, 22, 6.6, -18, 84, 0],
  [52.30, 80, 3, 8.6, 0, TOPY, 4.0],
  [52.50, 90, 0, FIN_PPM, 0, TOPY, FIN_TZ],
  [52.70, 90, 0, FIN_PPM, 0, TOPY, FIN_TZ],
];
function hermite(col: number, t: number): number {
  const K = CAMK;
  if (t <= K[0]![0]!) return K[0]![col]!;
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i]![0]!) {
      const a = K[i - 1]!, b = K[i]!, h = b[0]! - a[0]!, u = (t - a[0]!) / h;
      const slope = (j: number) => (j <= 0 || j >= K.length - 1 ? 0 : (K[j + 1]![col]! - K[j - 1]![col]!) / (K[j + 1]![0]! - K[j - 1]![0]!));
      const m0 = slope(i - 1) * h, m1 = slope(i) * h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[col]! + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[col]! + (u3 - u2) * m1;
    }
  }
  return K[K.length - 1]![col]!;
}
export function camAt(t: number): SECam {
  return seCamera([hermite(4, t), hermite(5, t), hermite(6, t)], hermite(2, t), hermite(1, t), hermite(3, t));
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const WORLD = /* glsl */ `
uniform float uT, uNLand, uTop, uCutX, uCutZ, uCutOn, uCab, uRunY, uCrane, uCrA, uTr, uCL, uPay, uFlyK, uFlyOff;
uniform float uLandT[12];
const float PT = ${f1(PT)}, YC1 = ${f1(YC1)}, TOPY = ${f1(TOPY)};
#define SE_SHADOW 0.5
#define SE_STEPS 80
#define SE_SHADOW_STEPS 6
#define SE_EPS 0.45

float twH(float a, float b) { return fract(sin(a * 127.1 + b * 311.7) * 43758.5453); }
float twTri(float x) { return abs(fract(x) * 2.0 - 1.0) * 2.0 - 1.0; }

/** microbump foundation: a lattice of pads (r 1.7) with a barrel solder ball on the inner (nBall) part of it */
vec2 bumpField(vec3 p, vec2 c, vec2 nBall, vec2 nPad, float pitch) {
  vec2 q = p.xz - c;
  vec2 g = clamp(floor(q / pitch + 0.5), -nPad, nPad);
  vec2 l = q - g * pitch;
  float d = seCylY(vec3(l.x, p.y - 0.2, l.y), 1.7, 0.2);
  if (abs(g.x) <= nBall.x && abs(g.y) <= nBall.y) d = min(d, seEllipsoid(vec3(l.x, p.y - 1.3, l.y), vec3(1.55, 1.5, 1.55)));
  return vec2(d, SE_METAL);
}

/** substrate, interposer, GPU die, foundations, PHY traces, caps */
vec2 lowLayer(vec3 p) {
  vec2 res = vec2(seRoundBox(p - vec3(-80.0, -16.0, 0.0), vec3(225.0, 10.0, 150.0), 0.8), SE_TAPE);
  res = seUnion(res, vec2(seRoundBox(p - vec3(-80.0, -3.0, 0.0), vec3(190.0, 3.0, 115.0), 0.7), SE_SILICON));
  if (p.y > -0.6 && p.y < 3.4) {
    if (abs(p.x) < 48.0 && abs(p.z) < 48.0) res = seUnion(res, bumpField(p, vec2(0.0), vec2(5.0), vec2(10.0), 4.0));
    if (p.x < -60.0) res = seUnion(res, bumpField(p, vec2(-155.0, 0.0), vec2(14.0, 13.0), vec2(18.0, 17.0), 5.0));
    if (p.y < 0.7 && p.x > -66.0 && p.x < -27.0 && abs(p.z) < 14.6) {       // 24 PHY traces
      float l = mod(p.z + 0.6, 1.2) - 0.6;
      res = seUnion(res, vec2(max(abs(l) - 0.22, abs(p.y - 0.16) - 0.16), SE_METAL));
    }
  }
  if (p.y > 2.0 && p.x < -70.0) {
    float dg = seRoundBox(p - vec3(-155.0, 7.3, 0.0), vec3(75.0, 4.7, 70.0), 0.8);
    res = seUnion(res, vec2(dg, SE_SILICON));
  }
  if (p.y < -3.5 && p.y > -8.0 && abs(p.z) > 117.0 && abs(p.z) < 143.0) {      // decoupling caps on the substrate
    float ix = clamp(floor((p.x + 80.0) / 14.0 + 0.5), -15.0, 15.0);
    float sg = p.z > 0.0 ? 1.0 : -1.0;
    if (twH(ix, sg) > 0.32) res = seUnion(res, vec2(seRoundBox(p - vec3(-80.0 + ix * 14.0, -5.1, sg * 130.0), vec3(2.4, 0.9, 1.2), 0.2), SE_METAL));
  }
  return res;
}

/** the tower: base die, dies, bump layers, cutaway, windows, TSV bead chains, elevator cabin */
vec2 stackD(vec3 p) {
  float ly1 = mod(p.y - YC1 + PT * 0.5, PT) - PT * 0.5;
  float kk = floor((p.y - YC1 + PT * 0.5) / PT);
  vec2 res = vec2(seRoundBox(p - vec3(0.0, 6.6, 0.0), vec3(26.0, 4.0, 26.0), 0.6), SE_SILICON);
  if (kk >= 0.0 && kk < uNLand) res = seUnion(res, vec2(seRoundBox(vec3(p.x, ly1, p.z), vec3(20.0, 2.6, 20.0), 0.5), SE_SILICON));
  if (uFlyK >= 0.0) res = seUnion(res, vec2(seRoundBox(vec3(p.x, p.y - (YC1 + uFlyK * PT + uFlyOff), p.z), vec3(20.0, 2.6, 20.0), 0.5), SE_SILICON));
  // microbump layers between dies (and between the base die and D1)
  float kb = floor((p.y - YC1) / PT);
  if (kb >= -1.0 && kb + 1.0 < uNLand) {
    float lyb = mod(p.y - YC1, PT) - PT * 0.5;
    vec2 g = clamp(floor(p.xz / 4.0 + 0.5), vec2(-4.0), vec2(4.0));
    vec2 l = p.xz - g * 4.0;
    res = seUnion(res, vec2(seEllipsoid(vec3(l.x, lyb, l.y), vec3(1.5, 1.62, 1.5)), SE_METAL));
  }
  // cutaway quadrant, the elevator slot and the street-face windows
  float dcut = max(uCutX - p.x, uCutZ - p.z);
  res.x = smax(res.x, -dcut, 0.25);
  res.x = smax(res.x, -seRoundBox(p - vec3(12.0, 55.0, uCutZ), vec3(1.7, 120.0, 2.4), 0.3), 0.2);
  if (p.z > 14.0 && p.x < -2.0 && p.y > 13.0) {
    float sxc = p.x < -12.0 ? -15.2 : -8.8;
    res.x = smax(res.x, -seRoundBox(vec3(p.x - sxc, ly1, p.z - 20.0), vec3(2.1, 1.3, 0.9), 0.25), 0.12);
  }
  // TSV columns: bead chains on the cut faces (row z = 4, column x = -4); x = 12 is the elevator shaft
  if (p.y > 3.0 && p.y < uTop && p.z > 1.0 && p.x > -7.0) {
    float ix = clamp(floor((p.x + 4.0) / 4.0 + 0.5), 0.0, 5.0);
    if (ix == 4.0) ix = p.x > 12.0 ? 5.0 : 3.0;
    float iz = clamp(floor((p.z - 4.0) / 4.0 + 0.5), 1.0, 3.0);
    float ay = abs(ly1);
    float r = p.y < 10.4 ? 1.05 : 1.05 - 0.5 * smoothstep(2.4, 3.0, ay) + 0.95 * smoothstep(3.2, 3.9, ay);
    float dA = length(vec2(p.x - (-4.0 + 4.0 * ix), p.z - 4.0)) - r;
    float dB = length(vec2(p.x + 4.0, p.z - (4.0 + 4.0 * iz))) - r;
    float dT = max(min(dA, dB), p.y - uTop);
    res = seUnion(res, vec2(dT, 9.0));
  }
  if (uCutOn > 0.5) {
    vec3 q = p - vec3(12.0, uCab, 2.8);
    float dc = seRoundBox(q, vec3(1.35, 2.0, 1.0), 0.25);
    dc = max(dc, -(max(abs(q.x) - 0.08, abs(q.y) - 1.6)) + 0.0);
    res = seUnion(res, vec2(dc, 8.0));
  }
  return res;
}

/** the rooftop tower crane (lattice mast and jib, trolley, cable, hoisted spare die) */
vec2 craneD(vec3 p) {
  vec3 c = p - vec3(-12.0, TOPY, -12.0);
  float bd = max(max(abs(c.x) - 60.0, abs(c.z) - 60.0), max(-c.y - 0.5, c.y - 62.0));
  if (bd > 2.0) return vec2(bd, 11.0);
  float H = 40.0 * smoothstep(0.0, 0.6, uCrane);
  float lo = max(-c.y, c.y - H);
  float d = max(length(abs(c.xz) - 1.2) - 0.34, lo);
  d = min(d, max(max(max(abs(c.x) - 1.3, abs(c.z) - 1.3), abs(mod(c.y, 3.0) - 1.5) - 0.15), lo));
  d = min(d, max(max(abs(abs(c.z) - 1.2) - 0.12, abs(c.x - twTri(c.y / 5.0) * 1.2) - 0.14), max(abs(c.x) - 1.35, lo)));
  float jk = smoothstep(0.55, 1.0, uCrane);
  if (jk > 0.0) {
    float ca = cos(uCrA), sa = sin(uCrA);
    vec3 j = vec3(c.x * ca + c.z * sa, c.y - H - 1.9, -c.x * sa + c.z * ca);
    d = min(d, seRoundBox(vec3(c.x, c.y - H - 0.6, c.z), vec3(1.7, 0.7, 1.7), 0.15));
    float jl = 46.0 * jk;
    float clip = abs(j.x - (jl - 13.0) * 0.5) - (jl + 13.0) * 0.5;
    float chT = length(vec2(j.y - 1.0, j.z)) - 0.24;
    float chB = length(vec2(j.y + 0.7, abs(j.z) - 0.9)) - 0.24;
    float web = max(abs(j.y - 0.15 - twTri(j.x / 3.6) * 0.85) - 0.13, abs(j.z) - 0.9);
    d = min(d, max(min(min(chT, chB), web), clip));
    d = min(d, seRoundBox(j - vec3(-11.0, -0.8, 0.0), vec3(2.0, 1.4, 1.5), 0.2));
    vec3 t = j - vec3(uTr, -0.9, 0.0);
    d = min(d, seRoundBox(t, vec3(1.1, 0.7, 1.2), 0.15));
    d = min(d, max(max(length(t.xz) - 0.17, t.y + 0.2), -(t.y + 0.2 + uCL)));
    if (uPay > 0.5) {
      vec3 h = t - vec3(0.0, -uCL - 0.4, 0.0);
      d = min(d, seRoundBox(h, vec3(1.0, 0.7, 1.0), 0.15));
      float rods = max(length(vec2(abs(h.x) - 5.0, h.z)) - 0.16, max(abs(h.y + 1.6) - 1.6, 0.0));
      d = min(d, rods);
      float dp = seRoundBox(h - vec3(0.0, -3.4, 0.0), vec3(8.0, 1.0, 6.0), 0.4);
      return seUnion(vec2(d, 11.0), vec2(dp, SE_SILICON));
    }
  }
  return vec2(d, 11.0);
}

vec2 map(vec3 p) {
  vec2 res = lowLayer(p);
  float bd = max(max(abs(p.x) - 28.0, abs(p.z) - 28.0), max(-p.y - 1.0, p.y - TOPY - 12.0));
  if (bd > 3.0) res.x = min(res.x, bd);
  else res = seUnion(res, stackD(p));
  if (uCrane > 0.0) res = seUnion(res, craneD(p));
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-310.0, -32.0, -155.0), hi = vec3(150.0, 175.0, 155.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id < 0.5) {
    float inS = step(abs(p.x), 30.0) * step(abs(p.z), 30.0) * step(0.0, p.y) * step(p.y, TOPY + 1.0);
    float onZ = step(abs(p.z - uCutZ), 0.22) * step(0.9, n.z) * step(uCutX - 0.4, p.x);
    float onX = step(abs(p.x - uCutX), 0.22) * step(0.9, n.x) * step(uCutZ - 0.4, p.z);
    return mix(0.50, 0.15, max(onZ, onX) * inS * uCutOn);        // the cut faces are dark silicon: the copper stands out
  }
  return id < 2.5 ? seMatZ(id) : id < 8.5 ? 0.60 : id < 9.5 ? 1.15 : 0.40;
}
float matAmber(float id, vec3 p, vec3 n) {
  float kk = clamp(floor((p.y - YC1) / PT + 0.5), 0.0, 11.0);
  float tk = uLandT[int(kk)];
  float fl = step(tk, uT) * exp(-(uT - tk) / 0.16);
  if (id > 7.5 && id < 8.5) return 0.95;
  if (id > 8.5 && id < 9.5) {
    float seg = twH(kk, floor(p.x * 0.25 + 10.0) + floor(p.z * 0.25));
    float behind = step(p.y, uRunY);
    float head = exp(-abs(p.y - uRunY) / 2.4) * step(0.0, uRunY) * step(uRunY, 150.0);
    return clamp(max(behind * (0.35 + 0.55 * step(0.30, seg)) + 0.6 * head, 0.9 * fl), 0.0, 0.99);
  }
  if (id < 0.5 && abs(p.x) < 30.0 && abs(p.z) < 30.0 && p.y > 0.0 && p.y < TOPY + 1.0) {
    if (n.z > 0.9 && abs(p.z - 19.1) < 0.2 && p.x < -2.0) {
      float sx = p.x < -12.0 ? 0.0 : 1.0;
      float on = step(0.28, twH(kk, sx + 7.0)) * smoothstep(50.92 + kk * 0.032, 50.98 + kk * 0.032, uT);
      return max(0.85 * on, 0.9 * fl);
    }
    return clamp(fl * (0.25 + 0.6 * smoothstep(0.55, 0.9, n.y)), 0.0, 0.9);
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
float twH(float a, float b) { return fract(sin(a * 127.1 + b * 311.7) * 43758.5453); }
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  if (id < 0.5 && n.y > 0.85) {
    float aa = 1.0 - smoothstep(0.3, 0.7, fw / 0.5);
    if (p.y > 9.0 && p.x < -78.0) {                                  // GPU floorplan: 4 x 4 SM blocks, channels, PHY strip
      vec2 q = p.xz - vec2(-155.0, 0.0);
      vec2 u = vec2((q.x + 70.0) / 30.0, (q.y + 60.0) / 30.0);
      if (u.x > 0.0 && u.x < 4.0 && u.y > 0.0 && u.y < 4.0) {
        vec2 f = fract(u);
        float ch = step(f.x, 0.05) + step(0.95, f.x) + step(f.y, 0.05) + step(0.95, f.y);
        mz *= (0.78 + 0.5 * twH(floor(u.x), floor(u.y))) * (1.0 - 0.6 * min(ch, 1.0));
        mz *= 1.0 + 0.10 * aa * sin(q.y * 6.2832);
      }
      if (q.x > 58.0 && q.x < 73.0) mz *= 1.0 + 0.55 * aa * step(0.5, fract(q.y / 1.6));
      float ring = max(75.0 - abs(q.x) - 1.5, 70.0 - abs(q.y) - 1.5);
      mz *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.4, abs(ring)));
      mz *= 0.92;
    } else if (p.y > 12.0 && abs(p.x) < 21.0 && abs(p.z) < 21.0) {   // DRAM top: seal ring, centre bond pads, fine lines
      float ring = max(abs(p.x), abs(p.z)) - 17.6;
      mz *= 1.0 - 0.55 * (1.0 - smoothstep(0.1, 0.45, abs(ring)));
      if (abs(p.z) < 1.3 && abs(p.x) < 15.0) mz *= 1.0 + 0.6 * aa * step(0.45, fract(p.x / 2.0 + 0.5));
      mz *= 1.0 + 0.05 * aa * sin(p.z * 12.566);
    } else if (p.y > 9.0 && p.y < 12.0 && abs(p.x) < 28.0 && abs(p.z) < 28.0) {   // base die ledge: landing pads
      mz *= 1.0 + 0.35 * aa * step(fract(p.x / 2.0), 0.4) * step(fract(p.z / 2.0), 0.4);
    } else if (p.y < 1.0) {                                          // interposer: redistribution traces
      mz *= 0.70 * (1.0 - 0.18 * aa * (step(fract(p.x / 2.5), 0.12) + step(fract(p.z / 2.5), 0.12)));
    }
  }
  return vec2(mz, add);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W6Tower extends Scene {
  override seGrade = 0;
  words: Word[] = [];
  shade!: SEShade;
  strip = new SEStrip();
  text = new Layer2D(W, H);
  lines = new LineBatch(64, { blend: 'add' });
  private mask!: FSPass;
  private uni!: Record<string, THREE.IUniform>;
  private wordFloor: number[] = [];

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'hbm').words;
    this.wordFloor = this.words.map((w) => {
      let best = 0;
      for (let k = 1; k < 12; k++) if (Math.abs(LAND[k]! - w.start) < Math.abs(LAND[best]! - w.start)) best = k;
      return best;
    });
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uNLand: v(0), uTop: v(10.6), uCutX: v(-4), uCutZ: v(4), uCutOn: v(1), uCab: v(8), uRunY: v(-10), uCrane: v(0), uCrA: v(0.6),
      uTr: v(14), uCL: v(10), uPay: v(0), uFlyK: v(-1), uFlyOff: v(0), uLandT: { value: LAND.slice() },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 1.8 });
    this.mask = new FSPass(/* glsl */ `
uniform float uCy, uGap;
void main() {
  float y = (1.0 - vUv.y) * ${H}.0;
  float a = smoothstep(-0.5, 0.5, abs(y - uCy) - uGap * 0.5);
  fragColor = vec4(C_INK * a, a);
}`, { uCy: { value: H / 2 }, uGap: { value: 4 } }, { blending: THREE.CustomBlending, transparent: true });
    const m = this.mask.mat;
    m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick, u = this.uni;
    // ---- build state
    let n = 0, fly = -1, off = 0, impact = 0;
    for (let k = 0; k < 12; k++) {
      if (t >= LAND[k]!) { n++; impact = Math.max(impact, Math.exp(-(t - LAND[k]!) / 0.07)); }
      else if (t > LAND[k]! - FALL && fly < 0) { const w = (t - (LAND[k]! - FALL)) / FALL; fly = k; off = 46 * (1 - w * w); }
    }
    const top = n === 0 ? 10.6 : yc(n - 1) + DT / 2;
    const seal = smoothstep(51.75, 52.25, t);
    u.uT!.value = t; u.uNLand!.value = n; u.uFlyK!.value = fly; u.uFlyOff!.value = off;
    u.uTop!.value = top - 0.4;
    u.uCutX!.value = -4 + 30 * seal; u.uCutZ!.value = 4 + 30 * seal; u.uCutOn!.value = seal < 0.5 ? 1 : 0;
    const ph = (t / (0.46875 * 2)) % 1, tri = 1 - Math.abs(2 * ph - 1);
    u.uCab!.value = 8 + Math.max(0, top - 13) * smoothstep(0, 1, tri);
    const run = clamp((t - 50.86) / 0.45);
    u.uRunY!.value = t < 50.86 ? -10 : run >= 1 ? 200 : lerp(3, TOPY, run * run * (3 - 2 * run));
    const cr = smoothstep(50.9, 51.55, t);
    u.uCrane!.value = cr;
    u.uCrA!.value = 0.55 + 0.38 * (t - 50.9);
    u.uTr!.value = 16 + 12 * smoothstep(51.2, 52.3, t);
    u.uCL!.value = 6 + 16 * smoothstep(51.35, 52.2, t);
    u.uPay!.value = t > 51.3 ? 1 : 0;

    const cam = camAt(t);
    const a = camAt(t - 1 / 30), b = camAt(t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / 400 + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    this.shade.render(renderer, out, cam, { frame: frameIdx(t), motion: clamp(0.2 + sp + impact * 0.3, 0, 1), kick, dim: 0.42, rim: 1, focus: cam.dist * 0.8, hazeL: 650, zHaze: 0.3 });

    // ---- overlays: floor directory (lyric), floor numbers, lease sign, data strip
    this.text.clear();
    this.drawText(this.text.ctx, cam, t);
    comp.draw(renderer, this.text.upload(), out);
    const ppm = H / 2 / (cam.dist * cam.tanY) / UNIT_MM;
    this.strip.composite(renderer, comp, out, { ppm, alpha: smoothstep(48.95, 49.15, t) * (1 - smoothstep(52.1, 52.25, t)) });

    // ---- aperture: the ink closes onto the line (in: y = H/2, out: y = 0.64 H)
    const open = 1 - Math.exp(-(t - T0) / 0.07);
    const close = smoothstep(52.30, 52.49, t);
    const gapIn = 4 + (H * 1.2) * clamp(open) * (t > T0 + 0.5 ? 1 : 1);
    const gap = lerp(gapIn, 3, close);
    const cy = lerp(H / 2, EDGE_Y, smoothstep(52.2, 52.35, t));
    if (gap < H * 1.1) { this.mask.u.uCy!.value = cy; this.mask.u.uGap!.value = gap; this.mask.render(renderer, out); }
    const lb = this.lines; lb.clear();
    const inA = 1 - smoothstep(0.0, 0.12, t - T0), outA = smoothstep(52.28, 52.4, t);
    if (inA > 0) lb.seg2(0, H / 2, W, H / 2, lerp(4, 2, 1 - inA), [3.2, 2.6, 1.6], inA);
    if (outA > 0) lb.seg2(0, EDGE_Y, W, EDGE_Y, lerp(1, 3, outA), [LIN.signal[0] * 2.4, LIN.signal[1] * 2.4, LIN.signal[2] * 2.4], outA);
    lb.render(renderer, out);

    return sePost({ ca: 1.0 + 3.5 * impact, bloom: 0.55 + 0.2 * impact, shake: [Math.sin(t * 190) * 4 * impact * (1 - close), Math.cos(t * 170) * 6 * impact * (1 - close)] } as PostOverrides);
  }

  private drawText(c: CanvasRenderingContext2D, cam: SECam, t: number) {
    const mono = (s: string, x: number, y: number, size: number, col: string, wgt = 500, align: CanvasTextAlign = 'left', ls = 2) => {
      c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
      (c as any).letterSpacing = `${ls}px`; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    const fade = 1 - smoothstep(52.0, 52.2, t);
    if (fade <= 0.01) return;
    const proj = (x: number, y: number, z: number) => seProject(cam, [x, y, z]);
    c.save();
    c.strokeStyle = 'rgba(238,233,223,0.45)'; c.lineWidth = 1;
    for (let k = 0; k < 12; k++) {
      const al = smoothstep(LAND[k]! + 0.05, LAND[k]! + 0.2, t) * fade;
      if (al <= 0.01) continue;
      const y = yc(k);
      const L = Math.min(proj(-21, y, 21).x, proj(-21, y, -21).x), R = Math.max(proj(21, y, 21).x, proj(21, y, -21).x, proj(26, y, 0).x);
      const yy = proj(0, y, 0).y;
      c.globalAlpha = al;
      c.beginPath(); c.moveTo(L - 4, yy); c.lineTo(L - 14, yy); c.stroke();
      mono('D' + String(k + 1).padStart(2, '0'), L - 20, yy + 5, 13, 'rgba(156,151,143,0.95)', 500, 'right', 1.5);
      // directory: the lyric word that opened this floor, amber while sung, then bone
      const wi = this.wordFloor.indexOf(k);
      if (wi >= 0) {
        const w = this.words[wi]!;
        const amb = Math.exp(-Math.max(0, t - w.start) / 0.35);
        const x0 = R + 22;
        c.globalAlpha = al * smoothstep(w.start - 0.02, w.start + 0.04, t);
        c.beginPath(); c.moveTo(R + 4, yy); c.lineTo(x0 - 6, yy); c.stroke();
        const cl = (v: number) => Math.round(v);
        mono(w.w.toUpperCase(), x0, yy + 8, 24, `rgb(${cl(lerp(226, 255, amb))},${cl(lerp(221, 164, amb))},${cl(lerp(211, 27, amb))})`, 600, 'left', 6);
      }
    }
    // the lease sign
    const sa = smoothstep(51.1, 51.35, t) * (1 - smoothstep(51.95, 52.15, t));
    if (sa > 0.01) {
      const tip = proj(-20, yc(7), 21), x0 = 110, y0 = 200;
      c.globalAlpha = sa;
      c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(x0 + 300, y0 + 30); c.lineTo(x0 + 290, y0 + 30); c.stroke();
      c.fillStyle = 'rgba(238,233,223,0.9)'; c.beginPath(); c.arc(tip.x, tip.y, 2.6, 0, TAU); c.fill();
      mono('FULLY LEASED', x0, y0, 22, 'rgba(238,233,223,0.95)', 600, 'left', 5);
      mono('THROUGH 2026', x0, y0 + 26, 22, 'rgba(238,233,223,0.95)', 600, 'left', 5);
    }
    c.restore();
  }

  override dispose() { this.shade.dispose(); }
}
