// W10 THE WIRE (bars 56-62, 105.0-116.25 s; one module for the timeline entries `whoscrown` and `hold`): "Hold the line"
// is a 25 um gold bond wire, hand-built and shaded as a scanning-electron micrograph (engine/se.ts, units: um).
//
//  Model: the empty crown of W4 (56 fins in stair-stepped peaks, two gate bands, an oxide ring) hangs in the void under one
//  amber lamp. On "crown?" the camera drops edge-on and the crown squashes flat; its two end fins become the two ends of a
//  wire: a ball bond (squashed sphere, the same shape as the tin droplet) on an aluminium die pad, 2.9 mm of 25 um wire
//  (heel flare, loop), a flattened stitch bond on a plated lead finger. Neighbouring pads and fingers stand empty.
//  The wire is an exact function of song time: arch + standing-wave modes (hold.ts' mode steps and 9:8 at 112.5) + a
//  whip. Lyric letters ride the projected wire; the HUD joke is a leader tag on it.
//  Lyric to geometry: "who's" 105.00 .. "crown?" 107.34 the crown grows (a ring of fins per syllable) and turns, each
//  syllable runs a glint round the fins; 108.0 camera edge-on, crown flat; "Hold" 108.75 tension, "line" 109.45 first mode
//  (push in on the ball bond); 112.50 "hold" steps a mode; the amplitude climbs with the snare roll; the 32nd roll
//  stutters and the tape stops (picture time); 115.3125 the stitch lifts off its finger and the wire whips away; black.
//  in : crack's last frame: one amber point at STAR_PX (960,190) on ink. out: black until 116.25 (drop's hit).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { frameIdx, hash, smoothstep, clamp, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { drawBridgeLine } from './atom-kit';
import { STAR_PX } from './whoscrown';
import { Lyrics } from '../engine/lyrics';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam, type V3 } from '../engine/se';

// ------------------------------------------------------------------------------------------------ constants
const T0 = 105, T_HOLD = 108.75, T_V = 112.5, T_ROLL32 = 114.375, T_STOP = 114.8625, T_SNAP = 115.3125;
const TR = T_SNAP - T_HOLD;
const BALL: V3 = [-1450, 22, 0];                       // wire start (inside the ball's apex)
const STITCH: V3 = [1450, -56.5, 0];                   // wire end on the finger plating
const LC = Math.hypot(STITCH[0] - BALL[0], STITCH[1] - BALL[1]);
const PSI0 = Math.atan2(STITCH[1] - BALL[1], STITCH[0] - BALL[0]);
const f1 = (x: number) => x.toFixed(4);

// ------------------------------------------------------------------------------------------------ picture time (tape stutter / stop)
function tapeTime(t: number): number {
  if (t < T_ROLL32) return t;
  if (t < T_STOP) {
    const d = 0.0586, k = Math.floor((t - T_ROLL32) / d);
    return T_ROLL32 + k * d - (hash(k, 3) > 0.62 ? 2 * d : 0);
  }
  if (t < T_SNAP) {
    const D = T_SNAP - T_STOP, u = (t - T_STOP) / D;
    const raw = D * (u - (u * u) / 2), q = 0.04 + 0.16 * u;
    return T_STOP + Math.floor(raw / q) * q;
  }
  return T_SNAP;
}
const F0 = 3.2;
const F_BASE = (tau: number) => { const u = clamp((tau - T_HOLD) / TR); return F0 * ((tau - T_HOLD) + 0.9 * TR * Math.pow(u, 2.5) / 2.5); };
function phase1(tau: number): number {
  if (tau <= T_V) return F_BASE(tau);
  return F_BASE(T_V) + 1.125 * (F_BASE(tau) - F_BASE(T_V));          // iv -> V: the 9:8 step
}
const MODES: [number, number][] = [[T_HOLD, 2], [109.45, 3], [T_V, 4], [113.2, 5], [T_ROLL32, 6]];
function modeWeights(tau: number): Map<number, number> {
  const w = new Map<number, number>(), sm = 0.1;
  MODES.forEach(([ts, n], i) => {
    const on = i === 0 ? 1 : smoothstep(ts - sm, ts + sm, tau);
    const off = i + 1 < MODES.length ? 1 - smoothstep(MODES[i + 1]![0] - sm, MODES[i + 1]![0] + sm, tau) : 1;
    w.set(n, on * off);
  });
  return w;
}

// ------------------------------------------------------------------------------------------------ the wire as a function of time (mirrors wireY in GLSL)
interface WireState {
  psi: number; ha: number; r: number; hb: number; pAmp: number; pU: number; modes: number[]; rem: number; alive: number; whip: number;
}
function wireState(t: number, kick: number): WireState {
  const tt = tapeTime(t), tau = tt;
  const r = smoothstep(108.35, 108.75, t);
  const ha = 120 * smoothstep(108.45, 109.0, t) * (1 - 0.82 * Math.pow(clamp((tau - 109.2) / (T_SNAP - 109.2)), 1.6));
  const amp = (8 + 190 * Math.pow(clamp((tau - T_HOLD) / TR), 2.2)) * smoothstep(108.6, 108.95, t) * 0.9 * (1 + 0.25 * kick);
  const modes = new Array(10).fill(0);
  const ph = phase1(tau);
  for (const [n, wt] of modeWeights(tau)) {
    if (wt < 1e-3) continue;
    modes[n] += amp * wt * Math.cos(TAU * n * ph + n * 1.3);
    modes[n + 3] += amp * wt * 0.16 * Math.cos(TAU * (n + 3) * ph + 0.7);
  }
  const tw = Math.max(0, t - T_SNAP);
  const damp = 1 - smoothstep(0, 0.12, tw);
  for (let n = 0; n < 10; n++) modes[n] *= damp;
  const whip = 2.4 * Math.pow(Math.min(tw / 0.2, 1), 2) + 3 * Math.max(tw - 0.2, 0);
  const pAmp = 700 * Math.exp(-tw / 0.09) * (tw > 0 ? 1 : 0);
  const hb = ha + modes.reduce((a, b) => a + Math.abs(b), 0) + pAmp + 40;
  return {
    psi: PSI0 + whip, ha, r, hb, pAmp, pU: clamp(tw / 0.12), modes, rem: smoothstep(0, 0.05, tw), whip: tw > 0 ? 1 : 0,
    alive: 1 - smoothstep(115.40, 115.62, t),
  };
}
function wireY(s: WireState, u: number): number {
  let y = s.ha * Math.pow(Math.max(Math.sin(Math.PI * u), 1e-3), 0.62);
  let m = 0;
  for (let n = 1; n < 10; n++) m += s.modes[n]! * Math.sin(n * Math.PI * u);
  y += m * smoothstep(0, 0.1, u) * smoothstep(0, 0.25, 1 - u);
  y += s.pAmp * Math.exp(-Math.pow((u - s.pU) / 0.1, 2)) * Math.sin(Math.PI * u);
  return y + (Math.max(y, 0) - y) * smoothstep(0.86, 0.9, u) * (1 - s.whip);
}
function wireWorld(s: WireState, u: number): V3 {
  const x = u * LC, y = wireY(s, u), c = Math.cos(s.psi), sn = Math.sin(s.psi);
  return [BALL[0] + c * x - sn * y, BALL[1] + sn * x + c * y, 0];
}

// ------------------------------------------------------------------------------------------------ camera
// [t, elevation deg, azimuth deg, px per um, target x, y, z, fov deg] (the G-buffer treats t > 5000 as a miss: wide shots use a wide lens, not distance)
const CAMK: number[][] = [
  [105.00, 21, 0, 0.255, 0, 720, 0, 55],
  [106.00, 19, -4, 0.26, 0, 720, 0, 55],
  [107.25, 16, 5, 0.275, 0, 700, 0, 54],
  [108.00, 9, 0, 0.34, 0, 380, 0, 44],
  [108.40, 5, 0, 0.56, 0, 12, 0, 28],
  [108.75, 8, -3, 0.58, 0, 12, 0, 28],
  [109.30, 10, -6, 0.62, -350, 15, 0, 28],
  [109.90, 17, -14, 2.2, -1330, 20, 0, 28],
  [110.60, 16, -10, 2.1, -1290, 20, 0, 28],
  [111.40, 11, -2, 0.95, -520, 10, 0, 28],
  [112.30, 8, 4, 0.60, 0, 12, 0, 28],
  [114.00, 6, 8, 0.66, 150, 12, 0, 28],
  [114.375, 7, 9, 0.72, 400, 5, 0, 28],
  [115.3125, 15, 11, 2.0, 1420, -40, 0, 28],
  [116.25, 15, 11, 2.0, 1420, -40, 0, 28],
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
/** camera at song time t (picture time: it stutters and stops with the tape) */
export function camAt(t: number, kick = 0): SECam {
  const tc = tapeTime(t);
  const punch = 1 + 0.008 * kick;
  const ppm = Math.exp(Math.log(hermite(3, tc)) * 1) * punch;
  return seCamera([hermite(4, tc), hermite(5, tc), hermite(6, tc)], hermite(2, tc), hermite(1, tc), ppm, hermite(7, tc));
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const WORLD = /* glsl */ `
uniform float uT, uTh, uK, uBob, uLamp, uHeat, uRig, uWireR, uHb, uRem, uAlive, uBallHeat, uWhip;
uniform vec3 uLampP, uEndP;
uniform vec4 uWire;      // psi, Lc, pulse centre u, pulse amplitude
uniform float uMode[10];
uniform vec2 uGl[6];     // glint angle, age (s; < 0 = off)
const float WPI = 3.14159265, NF = 56.0, RC = 1450.0;
const vec3 BALLP = vec3(${f1(BALL[0])}, ${f1(BALL[1])}, 0.0);
#define SE_SHADOW 0.5
#define SE_STEPS 90
#define SE_SHADOW_STEPS 4
#define SE_EPS 0.6

float outBack(float x) { x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + 2.2 * x * x * x + 1.2 * x * x; }
float finH(float i) {
  float k = mod(i, 7.0);
  float pr = k < 0.5 ? 0.0 : k < 1.5 ? 0.28 : k < 2.5 ? 0.62 : k < 3.5 ? 1.0 : k < 4.5 ? 0.62 : k < 5.5 ? 0.28 : 0.0;
  return 380.0 + 1120.0 * pr;
}

/** the empty crown: 56 fins (8 stair-stepped peaks), two gate bands wrapped round them, an oxide ring */
vec2 crownD(vec3 p0) {
  vec3 p = p0 - vec3(0.0, uBob, 0.0);
  float rr = length(p.xz);
  float bnd = max(rr - (RC + 300.0), max(p.y - (1650.0 * uK + 60.0), -p.y - 80.0));
  if (bnd > 50.0) return vec2(bnd + 60.0, 0.0);      // the bound has >= 80 um of margin: overshoot it so grazing rays do not crawl
  float stp = 6.2831853 / NF;
  float a = atan(p.z, p.x) - uTh;
  float cell = floor(a / stp + 0.5);
  vec2 res = vec2(1.0e5, 0.0);
  float sg = (a - cell * stp) >= 0.0 ? 1.0 : -1.0;
  for (int k = 0; k <= 1; k++) {               // own cell and the nearer neighbour (the peaks step by fin, so a neighbour can be nearer)
    float ck = cell + float(k) * sg;
    float la = a - ck * stp;
    float xr = rr * cos(la), xt = rr * sin(la);
    float idx = mod(ck, NF);
    float grow = outBack((uT - 105.12 - 1.1 * idx / NF) / 0.55);
    float h = finH(idx) * uK * grow;
    if (h > 1.5) {
      float rd = min(6.0, h * 0.4);
      res = seUnion(res, vec2(seRoundBox(vec3(xr - RC, p.y - h * 0.5, xt), vec3(18.0, h * 0.5, 58.0), rd), SE_SILICON));
    }
  }
  res.x *= 0.6;                                // conservative inside the bound: tangent rays along the fin row must not overstep thin fins
  float gg = smoothstep(106.0, 106.7, uT) * uK;
  if (gg > 0.02) {
    for (int g = 0; g < 2; g++) {
      float yc = (g == 0 ? 150.0 : 310.0) * uK;
      float dg = seRoundBox2(vec2(rr - RC, p.y - yc), vec2(26.0, 15.0 * gg), 5.0);
      res = seUnion(res, vec2(dg, 9.0));
    }
  }
  float og = smoothstep(105.05, 105.7, uT) * uK;
  if (og > 0.02) res = seUnion(res, vec2(seRoundBox2(vec2(rr - RC, p.y - 16.0 * uK), vec2(112.0, 16.0 * og), 6.0), SE_OXIDE));
  return res;
}

`;
const WORLD2 = WORLD + /* glsl */ `
uniform float uHa;
float wireY(float u, out float dY) {
  float su = sin(WPI * u), cu = cos(WPI * u);
  float sh = pow(max(su, 1.0e-3), 0.62);
  float Y = uHa * sh;
  float dU = uHa * 0.62 * WPI * cu * pow(max(su, 1.0e-3), -0.38);
  float env = smoothstep(0.0, 0.1, u) * smoothstep(0.0, 0.25, 1.0 - u);
  float M = 0.0, dM = 0.0;
  for (int n = 1; n < 10; n++) { float k = float(n) * WPI; M += uMode[n] * sin(k * u); dM += uMode[n] * k * cos(k * u); }
  Y += M * env; dU += dM * env;
  float g = exp(-pow((u - uWire.z) / 0.10, 2.0));
  Y += uWire.w * g * su;
  dU += uWire.w * g * (-2.0 * (u - uWire.z) / 0.01 * su + WPI * cu);
  dY = dU / uWire.y;
  return mix(Y, max(Y, 0.0), smoothstep(0.86, 0.9, u) * (1.0 - uWhip));
}

/** the 25 um wire: a tube along the loop function, heel flare at the ball, flattened stitch at the far end */
vec2 wireD(vec3 p) {
  if (uWireR < 0.02) return vec2(1.0e5, 1.0);
  vec3 q = p - BALLP;
  float c = cos(uWire.x), s = sin(uWire.x);
  vec2 xy = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  float Lc = uWire.y;
  float dB = seRoundBox(vec3(xy.x - Lc * 0.5, xy.y, q.z), vec3(Lc * 0.5 + 30.0, uHb, 70.0), 0.0);
  if (dB > 30.0) return vec2(dB + 25.0, SE_METAL);
  float u = clamp(xy.x / Lc, 0.0, 1.0);
  float dY;
  float Y = wireY(u, dY);
  float r = 12.5 * uWireR, x = xy.x;
  float flare = 1.0 + 0.8 * exp(-max(x, 0.0) / 45.0);
  float sf = smoothstep(Lc - 100.0, Lc - 25.0, x);
  float ry = r * flare * mix(1.0, 0.42, sf), rz = r * flare * mix(1.0, 1.9, sf);
  vec2 qq = vec2((xy.y - Y) / ry, q.z / rz);
  float k = max(inversesqrt(1.0 + dY * dY), 0.3);
  float d = (length(qq) - 1.0) * min(ry, rz) * k;
  float dx = max(-x, x - (Lc + 18.0));
  d = length(vec2(max(d, 0.0), max(dx, 0.0))) + min(max(d, dx), 0.0);
  return vec2(d, SE_METAL);
}

/** ball bond: a squashed sphere with a pressed skirt on the pad */
vec2 ballD(vec3 p) {
  vec3 q = p - vec3(BALLP.x, 4.0, 0.0);
  if (length(q) > 140.0) return vec2(length(q) - 100.0, 8.0);
  float d = seEllipsoid(q, vec3(31.0, 22.0, 31.0));
  float sk = seCylYR(q - vec3(0.0, -16.0, 0.0), 35.0, 4.0, 2.5);
  return vec2(smin(d, sk, 6.0), 8.0);
}

/** die with its pad row, seal-ring groove; lead fingers with plating; the stitch remnant */
vec2 rigD(vec3 p) {
  float bnd = max(p.y - 90.0, abs(p.z) - 900.0);
  if (bnd > 40.0) return vec2(bnd + 15.0, 12.0);
  vec3 dc = vec3(-1800.0, -219.0, 0.0);
  float d = seRoundBox(p - dc, vec3(900.0, 201.0, 880.0), 8.0);
  float zi = clamp(floor(p.z / 200.0 + 0.5), -3.0, 3.0);
  vec2 q = vec2(p.x + 1450.0, p.z - zi * 200.0);
  float dw = seRoundBox2(q, vec2(64.0), 9.0);
  d = smax(d, -max(dw, -(p.y + 14.0)), 2.0);
  float gr = max(abs(seRoundBox2(p.xz - dc.xz, vec2(840.0, 820.0), 14.0)) - 7.0, -(p.y + 27.0));
  d = max(d, -gr);
  vec2 res = vec2(d, 12.0);
  res = seUnion(res, vec2(seRoundBox(vec3(q.x, p.y + 15.0, q.y), vec3(61.0, 3.0, 61.0), 2.0), SE_METAL));
  float fi = clamp(floor(p.z / 320.0 + 0.5), -1.0, 1.0);
  float fz = p.z - fi * 320.0;
  float tip = 1150.0 + 70.0 * abs(fi);
  float fcx = (tip + 3400.0) * 0.5, fhx = (3400.0 - tip) * 0.5;
  res = seUnion(res, vec2(seRoundBox(vec3(p.x - fcx, p.y + 110.0, fz), vec3(fhx, 40.0, 105.0), 10.0), 13.0));
  res = seUnion(res, vec2(seRoundBox(vec3(p.x - (tip + 330.0), p.y + 66.0, fz), vec3(210.0, 4.0, 85.0), 2.0), 11.0));
  if (fi == 0.0 && uRem > 0.01) {
    res = seUnion(res, vec2(seRoundBox(vec3(p.x - 1452.0, p.y + 59.0, p.z), vec3(40.0 * uRem, 2.5 * uRem, 27.0 * uRem), 2.0), 11.0));
  }
  return res;
}

vec2 map(vec3 p) {
  vec2 res = vec2(1.0e5, 0.0);
  if (uLamp > 0.01) res = vec2(length(p - uLampP) - 46.0, SE_BEAM);
  if (uK > 0.004) res = seUnion(res, crownD(p));
  if (uRig > 0.01) {
    res = seUnion(res, rigD(p));
    res = seUnion(res, seSmoothUnion(ballD(p), wireD(p), 7.0));
  }
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-4800.0, -600.0, -1700.0), hi = vec3(3800.0, 6500.0, 1700.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float glintAt(vec3 p) {
  float a = atan(p.z, p.x) - uTh, g = 0.0;
  for (int k = 0; k < 6; k++) {
    float age = uGl[k].y;
    if (age < 0.0) continue;
    float dA = abs(mod(a - uGl[k].x + WPI, 6.2831853) - WPI);
    g += exp(-age / 0.30) * exp(-dA * dA / 0.06);
  }
  return g;
}

float matZ(float id, vec3 p, vec3 n) {
  float Z = id < 6.5 ? seMatZ(id) : (id < 8.5 ? (id < 7.5 ? 0.6 : 0.96) : (id < 9.5 ? 0.80 : (id < 11.5 ? 0.85 : (id < 12.5 ? 0.22 : 0.55))));
  if (id > 10.5) {
    float fade = (1.0 - smoothstep(350.0, 900.0, abs(p.z))) * (1.0 - smoothstep(300.0, 1500.0, max(-1450.0 - p.x, p.x - 1450.0)));
    Z *= (id > 11.5 ? fade : mix(1.0, fade, 0.5)) * uRig;
  } else if (id > 7.5 && id < 8.5) Z *= uRig;
  else if (id > 0.5 && id < 1.5) Z *= step(0.0001, uRig);
  return Z * uAlive;
}
float matAmber(float id, vec3 p, vec3 n) {
  float a = 0.0;
  if (id > 5.5 && id < 6.5) a = 0.99 * uLamp;
  else if (id < 0.5) a = clamp(0.9 * glintAt(p) + uHeat * 0.8 * smoothstep(0.55, 0.9, n.y), 0.0, 0.97);
  else if (id > 8.5 && id < 9.5) a = clamp(0.8 * glintAt(p) + uHeat * 0.9, 0.0, 0.97);
  else if (id > 7.5 && id < 8.5) a = clamp(uBallHeat, 0.0, 0.97);
  else if (id > 0.5 && id < 1.5) a = uWhip * exp(-length(p - uEndP) / 70.0) * 0.95;
  return a * uAlive;
}
`;

const SHADE = /* glsl */ `
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0;
  if (id < 0.5) {
    // etch banding on the fin walls: pitch 26 um
    float wall = 1.0 - smoothstep(0.25, 0.6, abs(n.y));
    float a = 1.0 - smoothstep(0.30, 0.65, fw / 26.0);
    mz *= 1.0 + wall * a * 0.20 * sin(p.y / 26.0 * 6.2832);
  } else if (id > 11.5 && id < 12.5) {
    // passivation: a faint mesh of the top metal under the glass, pitch 24 um
    vec2 g = abs(fract(p.xz / 24.0) - 0.5);
    float a = 1.0 - smoothstep(0.3, 0.8, fw / 24.0);
    mz *= 1.0 + 0.22 * a * step(0.46, max(g.x, g.y)) * step(0.7, n.y);
  } else if (id > 12.5) {
    float a = 1.0 - smoothstep(0.3, 0.8, fw / 9.0);
    mz *= 1.0 + 0.10 * a * sin(p.z / 9.0 * 6.2832);        // rolled lead-frame lines
  }
  return vec2(mz, 0.0);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W10Wire extends Scene {
  override seGrade = 0;
  shade!: SEShade;
  layer = new Layer2D();
  strip = new SEStrip();
  syl: { t: number; phi: number }[] = [];
  qLine!: any;
  hold1!: any;
  hold2!: any;
  lampY = 2200;
  private uni!: Record<string, THREE.IUniform>;

  override init() {
    const q = lineByScene(this.ctx.lyrics, 'whoscrown');
    this.qLine = q; this.hold1 = lineByScene(this.ctx.lyrics, 'hold1'); this.hold2 = lineByScene(this.ctx.lyrics, 'hold2');
    const phis = [0.4, 1.9, 3.3, 4.2, 5.5, 2.6];
    let k = 0;
    for (const w of q.words) for (const s of (w.syl ?? [[w.start, w.end]])) this.syl.push({ t: s[0], phi: phis[k++ % phis.length]! });
    // the lamp's height: it sits at STAR_PX on the first frame (hand-off from crack)
    const cam = camAt(T0);
    let lo = 600, hi = 6000;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (seProject(cam, [0, m, 0]).y > STAR_PX.y) lo = m; else hi = m; }
    this.lampY = (lo + hi) / 2;
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uTh: v(0), uK: v(1), uBob: v(0), uLamp: v(0.7), uHeat: v(0), uRig: v(0), uWireR: v(0), uHb: v(200), uRem: v(0), uAlive: v(1), uBallHeat: v(0), uWhip: v(0), uHa: v(0),
      uLampP: { value: new THREE.Vector3(0, this.lampY, 0) }, uEndP: { value: new THREE.Vector3() },
      uWire: { value: new THREE.Vector4(PSI0, LC, 0, 0) }, uMode: { value: new Array(10).fill(0) },
      uGl: { value: Array.from({ length: 6 }, () => new THREE.Vector2(0, -1)) },
    };
    this.shade = new SEShade({ mapGLSL: WORLD2, shadeGLSL: SHADE, uniforms: this.uni, cavL: 6 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    const u = this.uni;
    const ws = wireState(t, kick);
    const kk = 1 - smoothstep(108.0, 108.65, t);
    u.uT!.value = t;
    u.uTh!.value = 0.42 * (t - T0);
    u.uK!.value = kk;
    u.uBob!.value = 16 * Math.sin(0.9 * (t - T0)) * kk;
    u.uLamp!.value = (0.62 + 0.38 * smoothstep(105.0, 106.6, t)) * (1 - smoothstep(107.6, 108.2, t));
    u.uHeat!.value = 0.55 * smoothstep(107.9, 108.35, t) * (1 - smoothstep(108.35, 108.9, t));
    u.uRig!.value = smoothstep(108.25, 108.9, t);
    u.uWireR!.value = ws.r;
    u.uHa!.value = ws.ha;
    u.uHb!.value = ws.hb;
    u.uRem!.value = ws.rem;
    u.uAlive!.value = ws.alive;
    u.uWhip!.value = ws.whip * (1 - smoothstep(0.0, 0.25, t - T_SNAP));
    u.uBallHeat!.value = 0.95 * smoothstep(108.3, 108.6, t) * Math.exp(-Math.max(0, t - 108.6) / 0.55);
    (u.uWire!.value as THREE.Vector4).set(ws.psi, LC, ws.pU, ws.pAmp);
    u.uMode!.value = ws.modes;
    const end = wireWorld(ws, 1);
    (u.uEndP!.value as THREE.Vector3).set(end[0], end[1], end[2]);
    u.uGl!.value.forEach((g: THREE.Vector2, i: number) => {
      const s = this.syl[i];
      const age = s ? t - s.t : -1;
      if (s && age >= 0 && age < 1.4) g.set(s.phi + 2.2 * age, age); else g.set(0, -1);
    });

    const cam = camAt(t, kick);
    const a = camAt(t - 1 / 30), b = camAt(t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / (cam.dist * 0.6) + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.18 + sp + 0.5 * ws.whip, 0, 1);
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, reveal: 2, dim: 0.3, rim: 1, focus: cam.dist * 0.85, hazeL: 3500, zHaze: 0.25, vignette: 0.32,
    });

    // ---- overlays: lyric, labels, HUD joke, data strip
    const c = this.layer.ctx;
    this.layer.clear();
    this.drawOverlay(c, cam, ws, t);
    comp.draw(renderer, this.layer.upload(), out);
    const ppm = H / 2 / (cam.dist * cam.tanY);
    const sa = smoothstep(105.3, 105.8, t) * (1 - smoothstep(T_SNAP - 0.02, T_SNAP + 0.08, t));
    this.strip.composite(renderer, comp, out, { ppm, unit: 'um', alpha: sa });
    return sePost({ ca: 2.4 * kick * smoothstep(108.7, 108.9, t) * ws.alive });
  }

  private mono(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, wgt = 500, align: CanvasTextAlign = 'left') {
    c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
    (c as any).letterSpacing = '1.5px'; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
  }

  private drawOverlay(c: CanvasRenderingContext2D, cam: SECam, ws: WireState, t: number) {
    // the question, under the crown (bridge register)
    const qa = smoothstep(104.95, 105.2, t) * (1 - smoothstep(108.45, 108.85, t));
    if (qa > 0.01) drawBridgeLine(c, this.qLine, t, { x: W / 2, y: 972, size: 58, align: 'center', dim: 0.3, lead: 0.35, alpha: qa });
    // etched figure label
    const fa = smoothstep(105.4, 105.9, t) * (1 - smoothstep(107.8, 108.2, t));
    if (fa > 0.01) this.mono(c, 'FIG. 9 · CROWN (UNOCCUPIED) · 56 FINS · 8 POINTS · 2 GATES', 96, 66, 15, `rgba(238,233,223,${0.78 * fa})`);
    // lyric letters ride the wire
    const poly: { x: number; y: number }[] = [];
    if (t > 108.7 && t < 115.2) for (let i = 0; i <= 200; i++) { const p = seProject(cam, wireWorld(ws, i / 200)); poly.push({ x: p.x, y: p.y }); }
    const lines: [any, number, number][] = [[this.hold1, 108.6, 111.45], [this.hold2, 112.35, 114.7]];
    for (const [ln, a0, a1] of lines) {
      const al = smoothstep(a0, a0 + 0.2, t) * (1 - smoothstep(a1 - 0.35, a1, t));
      if (al > 0.01 && poly.length) this.rideWire(c, poly, ln, t, al, 22 + 12.5 * ws.r * (H / 2 / (cam.dist * cam.tanY)));
    }
    // the joke: a leader tag on the wire
    const ha = smoothstep(111.3, 111.8, t) * (1 - smoothstep(T_SNAP - 0.25, T_SNAP - 0.05, t));
    if (ha > 0.01 && poly.length) {
      const m = poly[Math.round(200 * 0.66)]!;
      const x0 = clamp(m.x - 300, 96, 1300), y0 = 880;
      c.save(); c.globalAlpha = ha;
      c.strokeStyle = 'rgba(238,233,223,0.55)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(m.x, m.y + 14); c.lineTo(m.x, y0 - 34); c.lineTo(x0 - 14, y0 - 34); c.lineTo(x0 - 14, y0 + 40); c.stroke();
      c.fillStyle = 'rgba(238,233,223,0.9)'; c.beginPath(); c.arc(m.x, m.y + 14, 2.6, 0, TAU); c.fill();
      this.mono(c, 'WIRE  AU  ⌀ 25 µm', x0, y0 - 8, 14, 'rgba(156,151,143,0.9)');
      this.mono(c, 'BREAK LOAD ABOUT 10 gf', x0, y0 + 24, 24, 'rgba(238,233,223,0.97)', 600);
      this.mono(c, '(A 10 g WEIGHT)', x0, y0 + 52, 18, 'rgba(238,233,223,0.8)');
      this.mono(c, 'THINNER THAN A HAIR', x0, y0 + 82, 14, 'rgba(156,151,143,0.9)');
      c.restore();
    }
  }

  /** set the line's letters along the projected wire polyline, tangent-aligned, amber while sung */
  private rideWire(c: CanvasRenderingContext2D, poly: { x: number; y: number }[], line: any, t: number, alpha: number, lift: number) {
    const size = 60, fam = F.serif(400, true);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1]! + Math.hypot(poly[i]!.x - poly[i - 1]!.x, poly[i]!.y - poly[i - 1]!.y));
    let ic = 0, bd = 1e9;
    poly.forEach((p, i) => { const d = Math.abs(p.x - W / 2); if (d < bd) { bd = d; ic = i; } });
    // layout: letters with tracking; the last word stretches across its held note
    const letters: { ch: string; w: number; word: any; li: number; n: number }[] = [];
    const words: any[] = line.words;
    words.forEach((w, wi) => {
      const chs = Array.from(w.w as string);
      const ext = wi === words.length - 1 ? 30 * smoothstep(w.start, w.end, t) : 0;
      chs.forEach((ch, li) => letters.push({ ch, w: measure(ch, fam, size) + 3 + ext, word: w, li, n: chs.length }));
      if (wi < words.length - 1) letters.push({ ch: ' ', w: size * 0.3, word: null, li: 0, n: 0 });
    });
    const total = letters.reduce((s, l) => s + l.w, 0);
    let s = cum[ic]! - total / 2;
    c.save();
    c.font = font(fam, size); c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    for (const l of letters) {
      const sc = s + l.w / 2; s += l.w;
      if (!l.word || sc < 0 || sc > cum[cum.length - 1]!) continue;
      let j = 1; while (j < cum.length - 1 && cum[j]! < sc) j++;
      const k = clamp((sc - cum[j - 1]!) / Math.max(1e-6, cum[j]! - cum[j - 1]!));
      const px = poly[j - 1]!.x + (poly[j]!.x - poly[j - 1]!.x) * k, py = poly[j - 1]!.y + (poly[j]!.y - poly[j - 1]!.y) * k;
      const ang = Math.atan2(poly[j]!.y - poly[j - 1]!.y, poly[j]!.x - poly[j - 1]!.x);
      const w = l.word, appear = clamp((t - (w.start - 0.35)) / 0.3);
      if (appear <= 0) continue;
      const p = Lyrics.wordProgress(w, t), lp = clamp(p * l.n - l.li), settle = smoothstep(w.end, w.end + 0.5, t);
      c.save();
      c.translate(px, py); c.rotate(ang); c.translate(0, -(lift + 8 * (1 - appear)));
      c.globalAlpha = alpha * 0.34 * appear; c.fillStyle = 'rgba(238,233,223,1)'; c.fillText(l.ch, 0, 0);
      if (lp > 0) {
        c.globalAlpha = alpha; c.fillStyle = 'rgba(255,164,27,1)'; c.fillText(l.ch, 0, 0);
        if (settle > 0) { c.globalAlpha = alpha * settle; c.fillStyle = 'rgba(238,233,223,1)'; c.fillText(l.ch, 0, 0); }
      }
      c.restore();
    }
    c.restore();
  }

  override dispose() { this.shade.dispose(); }
}
