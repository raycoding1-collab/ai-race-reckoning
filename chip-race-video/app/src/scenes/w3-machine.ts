// W3 THE MACHINE (bars 8-10, 15.0-18.75 s, "One Dutch machine, and the whole world's waiting"): ride the 13.5 nm light through
// the 11 mirrors of an EUV scanner, leave through the roof of the hall, crane out to the world map. SE-look hero world
// (engine/se.ts: SDF world -> half-res G-buffer -> semShade), then the dot-matrix map of the old `machine` plate.
//
//  Model (world unit u = 23.8 mm, so the 1.2 m collector is 52 u and the 1.8 m figure 75 u):
//   - 11 aspheric dishes: a glass-ceramic substrate (oxide) under a Mo/Si coating that is exaggerated to 26% of the radius and
//     laid out as 50 bilayers (fine Mo/Si stripes in the shade pass, 5-layer bands when too small to resolve); each dish has a
//     radial cutaway slot that opens just before the beam arrives, showing the layers on its walls and rim; back pockets,
//     a stem with a nut and three mounting pads. The collector (M1) carries its laser hole and 40 + 6 ring bands whose
//     radii are the rings of the `laser` plate (70..470 px on the first frame).
//   - the beam is a polyline plasma -> M1 -> .. -> M5 -> reticle -> M6 -> .. -> M11 -> wafer; the head advances on the 8ths
//     (M1-M5: 15.00, 15.23, 15.47, 15.70, 15.94) and the remaining six mirrors are crossed across the held note to 16.41.
//     Every mirror keeps 70%: segment k carries 0.7^k (amber drawn at 0.12 + 0.87 sqrt(0.7^k) so the last 2% stays legible).
//   - a reflective reticle (patterned face down) on a scanning carriage with rails; the wafer stage (granite base, rails,
//     table scanning under a fixed slit, chuck, 300 mm wafer with notch and die grid, interferometer bars).
//   - the hall in section: perforated raised floor (6.25 u pitch holes, 25 u tile seams), back and side walls with panel
//     grooves, an FFU ceiling grid, a roof deck with a hatch (coaming), parapet, HVAC boxes and stacks.
//   - two faceless 1.8 m figures (one on the floor by the stage, one on the roof by the hatch) with a dimension caliper.
//  Lyric to geometry: "One" 15.00 beam enters (collector zones amber); "Dutch" 15.23 / "machine," 15.47 mirrors 2-3 (push-in
//  on the cutaway edge of M3), M4 15.70, M5 15.94, M6-M11 16.07-16.34, wafer 16.41 (slit lights, LIGHT REMAINING: 2%);
//  "and the" 16.41/16.64 the camera rises through the hatch looking down at the machine it leaves (THE OTHER 98% IS HEAT), then clears the roof and cranes out; "whole
//  world's waiting" 16.88-17.34 crane-out one decade per word; the map, the queue lines and the cable are the old `machine`
//  code verbatim (ink dots, ember queue lines, ORDERS IN QUEUE).
//  in : laser's last frame: concentric amber zones with a bone disc, centre (960,540), rings at 70..470 px.
//  out: tons' first frame: the bundled cable, a vertical line from the top edge down to (960,470), 7 px.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, keys, lerp, prog, pulse, hash, smoothstep, frameIdx, type Key } from '../engine/util';
import { lineByScene } from './_motifs';
import { H_LASER_MACHINE, H_MACHINE_TONS, beamHead, karaoke, mono, wordP } from './sand-kit';
import { isLand, VELDHOVEN, WANTS } from './machine-world';
import { SEShade, SEStrip, seProject, sePost, type SECam, type V3 } from '../engine/se';

// ------------------------------------------------------------------------------------------------ constants
const T0 = 15.0, T_END = 18.75;
const U_M = 0.0238;                       // metres per world unit
const R_PX = H_LASER_MACHINE.radii;
const PPM0 = R_PX[R_PX.length - 1]! / 24.0;     // px per u on the first frame: the outer ring (470 px) is r = 24 u
const RINGS = R_PX.map((r) => r / PPM0);
const f1 = (x: number) => x.toFixed(4);
const TAN_Y = Math.tan((28 * Math.PI) / 360);
const ROOF_Y = 229, HATCH: V3 = [322, 0, 130];
const WAF: V3 = [320, -62, 130], RET: V3 = [205, 160, 150];
const FIG_IN: V3 = [415, -130, 185], FIG_ROOF: V3 = [346, ROOF_Y, 72];

// mirror dishes: centre (= hit point except M1), radius
const MC: V3[] = [[0, 100, 0], [62, 138, 72], [126, 104, 100], [108, 150, 158], [170, 122, 176], [250, 118, 120], [222, 80, 150], [276, 56, 112], [240, 20, 150], [300, 0, 110], [270, -34, 140]];
const MR = [26, 9, 8, 7.5, 7, 7, 11, 6, 15, 8, 12];
const P0: V3 = [0, 100, 12], H1: V3 = [0, 112, 2.6];
// beam polyline: plasma, M1..M5, reticle, M6..M11, wafer
const BP: V3[] = [P0, H1, MC[1]!, MC[2]!, MC[3]!, MC[4]!, RET, MC[5]!, MC[6]!, MC[7]!, MC[8]!, MC[9]!, MC[10]!, WAF];
const BT_: number[] = [14.9, 15.0, 15.234, 15.469, 15.703, 15.938, 16.015, 16.075, 16.13, 16.18, 16.23, 16.285, 16.34, 16.41];
const MPT = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];       // mirror k -> beam point index

// ------------------------------------------------------------------------------------------------ small vector helpers
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
type RGB = [number, number, number];
const sc = (c: readonly number[], k: number): RGB => [c[0]! * k, c[1]! * k, c[2]! * k];

// mirror frames: axis n (concave side), slot axis a, radius, thickness, sag coefficient
interface MirrorGeo { n: V3; a: V3; R: number; T: number; k: number; cutT: number }
const MIR: MirrorGeo[] = MC.map((c, i) => {
  const pi = MPT[i]!;
  let n: V3;
  if (i === 0) n = [0, 0, 1];
  else n = nrm(sub(nrm(sub(BP[pi + 1]!, BP[pi]!)), nrm(sub(BP[pi]!, BP[pi - 1]!))));
  const w: V3 = [0.5, 0.25, 0.85];
  let eb = sub(w, mul(n, dot(w, n)));
  if (Math.hypot(...eb) < 0.2) eb = sub([1, 0, 0], mul(n, n[0]));
  eb = nrm(eb);
  const a = nrm(cross(eb, n));
  const R = MR[i]!;
  return { n, a, R, T: 0.55 * R, k: i === 0 ? 1 / 48 : 1 / (10.4 * R), cutT: i === 0 ? 15.02 : BT_[pi]! - 0.28 };
});

// ------------------------------------------------------------------------------------------------ camera
/** the beam head position at time t (clamped to the path), and a smoothed, slightly leading version for the camera */
function headAt(t: number): V3 {
  if (t <= BT_[0]!) return BP[0]!;
  for (let k = 0; k < BP.length - 1; k++) if (t < BT_[k + 1]!) return lerp3(BP[k]!, BP[k + 1]!, (t - BT_[k]!) / (BT_[k + 1]! - BT_[k]!));
  return BP[BP.length - 1]!;
}
function headSmooth(t: number): V3 {
  let s: V3 = [0, 0, 0];
  const o = [-0.14, -0.07, 0, 0.07, 0.14];
  for (const d of o) s = add(s, headAt(t + d + 0.03));
  return mul(s, 1 / o.length);
}
const ang = (pos: V3, yaw: number, pitch: number, dist: number): SECam => {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const f: V3 = [cp * sy, sp, -cp * cy], r: V3 = [cy, 0, sy];
  return { pos, fwd: f, right: r, up: cross(r, f), tanX: (TAN_Y * W) / H, tanY: TAN_Y, fovY: (28 * Math.PI) / 180, dist };
};
const wm = (a: number, e = 0): V3 => [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
/** orbit camera about a target: az 0 = on +z looking -z */
function orbit(tgt: V3, azDeg: number, elDeg: number, ppm: number): SECam {
  const dist = H / 2 / (ppm * TAN_Y);
  const d = wm((azDeg * Math.PI) / 180, (elDeg * Math.PI) / 180);
  const pos = add(tgt, mul(d, dist));
  const pitch = -(elDeg * Math.PI) / 180, yaw = -(azDeg * Math.PI) / 180;
  return ang(pos, yaw, pitch, dist);
}
const T_EXIT = 16.41;
function orbitAt(t: number): { cam: SECam; ppm: number } {
  const wA = smoothstep(15.03, 15.30, t);
  const hs = headSmooth(t);
  let tgt = lerp3(MC[0]!, hs, wA);
  let az = wA * (26 - 38 * prog(t, 15.2, T_EXIT));
  const el = wA * (13 + 7 * prog(t, 15.7, T_EXIT));
  let ppm = Math.exp(lerp(Math.log(PPM0), Math.log(9.0 + 2.5 * prog(t, 15.9, T_EXIT)), wA));
  // push-in on the cutaway edge of M3 (Mo/Si bilayers)
  const g = MIR[2]!;
  const slot = add(MC[2]!, mul(g.a, 0.78 * g.R));
  const pb = Math.exp(-Math.pow((t - 15.60) / 0.12, 2));
  tgt = lerp3(tgt, slot, pb);
  ppm *= 1 + 7.2 * pb;
  az += 14 * pb;
  return { cam: orbit(tgt, az, el, ppm), ppm };
}
// world map zoom, log10 px per metre (the old plate's decade-per-word schedule, with the hall roof in front of it)
const lgW = Math.log10(1790 / (360 * 111e3));
const ZK: Key[] = [[0, 2.32], [16.84, 2.32], [16.875, 2.30], [17.12, -3.3, ease.inOutCubic], [17.14, -3.36, ease.linear], [17.409, lgW, ease.outExpo], [T_END, lgW + 0.05, ease.linear]];
const lgSAt = (t: number) => keys(t, ZK);
const yTop = (t: number) => ROOF_Y + H / 2 / (Math.pow(10, lgSAt(t)) * U_M * TAN_Y);
function camAt(t: number): { cam: SECam; ppm: number } {
  if (t < T_EXIT) return orbitAt(t);
  const o = orbitAt(T_EXIT).cam;
  const p0 = Math.asin(o.fwd[1]), y0 = Math.atan2(o.fwd[0], -o.fwd[2]);
  const kx = ease.inOutCubic(prog(t, T_EXIT, 16.50));
  const pos: V3 = [lerp(o.pos[0], HATCH[0], kx), 0, lerp(o.pos[2], HATCH[2], kx)];
  pos[1] = keys(t, [[T_EXIT, o.pos[1]], [16.58, 215, ease.linear], [16.66, 270, ease.linear], [16.84, yTop(16.84), ease.inOutCubic], [99, 0, ease.linear]]);
  if (t > 16.84) pos[1] = yTop(t);
  const pitch = keys(t, [[T_EXIT, p0], [16.58, -Math.PI / 2, ease.inOutCubic]]);
  const yaw = lerp(y0, 0, ease.inOutCubic(prog(t, T_EXIT, 16.55)));
  const ppm = Math.pow(10, lgSAt(t)) * U_M;
  const dist = Math.max(60, pos[1] - ROOF_Y);
  return { cam: ang(pos, yaw, pitch, t < 16.84 ? 260 : dist), ppm: t > 16.84 ? ppm : lerp(PPM0 * 0.4, ppm, smoothstep(16.6, 16.84, t)) };
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const UNIFS = /* glsl */ `
uniform float uT, uFP, uBr, uHeat, uSlit, uCoat;
uniform vec3 uMC[11], uMN[11], uMA[11], uMH[11];
uniform vec4 uMP[11];
uniform float uMT[11], uMK[11];
uniform vec3 uBP[14];
uniform float uBT[14], uBG[13];
`;
const WORLD = /* glsl */ `
${UNIFS}
const vec3 WAFP = vec3(${f1(WAF[0])}, ${f1(WAF[1])}, ${f1(WAF[2])});
const vec3 RETP = vec3(${f1(RET[0])}, ${f1(RET[1])}, ${f1(RET[2])});
const vec3 FIGI = vec3(${f1(FIG_IN[0])}, ${f1(FIG_IN[1])}, ${f1(FIG_IN[2])});
const vec3 FIGR = vec3(${f1(FIG_ROOF[0])}, ${f1(FIG_ROOF[1])}, ${f1(FIG_ROOF[2])});
const float RR[6] = float[6](${RINGS.map(f1).join(', ')});
#define SE_STEPS 56
#define SE_EPS 0.8
#define SE_SHADOW_STEPS 6

float segD(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float bx(vec3 p, vec3 c, vec3 h, float r) { return seRoundBox(p - c, h, r); }

/** One aspheric dish (distance, id): coat = 40 + i over a glass-ceramic substrate (3), radial cutaway slot, back pockets, stem, pads. */
vec2 mirrorD(vec3 p, int i) {
  vec3 q = p - uMC[i];
  vec3 n = uMN[i], ea = uMA[i], eb = cross(n, ea);
  float a = dot(q, ea), b = dot(q, eb), ly = dot(q, n);
  vec4 P = uMP[i];
  float R = P.x, T = P.y, k = P.z;
  float r = length(vec2(a, b));
  float ys = k * r * r;
  if (i == 0) {
    float gr = abs(seRep(r - 3.6, 0.55));
    ys -= 0.09 * (1.0 - smoothstep(0.03, 0.10, gr)) * step(3.6, r);
    for (int j = 0; j < 6; j++) ys -= 0.26 * (1.0 - smoothstep(0.05, 0.19, abs(r - RR[j])));
  }
  float sl = inversesqrt(1.0 + 4.0 * k * k * r * r);
  float d = max(max((ly - ys) * sl, -(ly + T)), r - R);
  if (i == 0) d = max(d, 3.2 - r);
  // back pockets (two annular lightweighting grooves)
  if (ly < -T + 0.35 * T) {
    float gb = min(abs(r - 0.52 * R), abs(r - 0.80 * R)) - 0.065 * R;
    d = max(d, -max(gb, ly - (-T + 0.2 * T)));
  }
  // the cutaway slot
  float cs = mix(R * 1.1, 0.42 * R, uMK[i]);
  d = max(d, -max(cs - a, abs(b) - 0.16 * R));
  vec2 res = vec2(d, (ly - ys) > -${f1(0.26)} * R ? 40.0 + float(i) : 3.0);
  // stem, nut and three pads (mount hardware)
  float dS = max(r - 0.10 * R, max(ly - (-T + 0.3), (-T - 0.9 * R) - ly));
  float dN = seRoundBox(vec3(a, ly + T + 0.9 * R, b), vec3(0.17 * R, 0.07 * R, 0.17 * R), 0.02 * R);
  float ar = atan(b, a), sec = 2.0943951;
  float ra = seRep(ar - 1.5708, sec);
  vec2 pq = vec2(cos(ra), sin(ra)) * r;
  float dP = seRoundBox(vec3(pq.x - 0.72 * R, ly + T + 0.07 * R, pq.y), vec3(0.11 * R, 0.07 * R, 0.11 * R), 0.02 * R);
  float dH = min(min(dS, dN), dP);
  if (dH < res.x) res = vec2(dH, 1.0);
  return res;
}

/** faceless 1.8 m figure in a bunny suit, feet at the origin, 75 u tall */
vec2 figD(vec3 q) {
  if (length(q - vec3(0.0, 38.0, 0.0)) > 52.0) return vec2(length(q - vec3(0.0, 38.0, 0.0)) - 46.0, 2.0);
  float d = seCapsuleY(q - vec3(4.3, 1.0, 0.0), 32.0, 4.5);
  d = min(d, seCapsuleY(q - vec3(-4.3, 1.0, 0.0), 32.0, 4.5));
  d = min(d, seEllipsoid(q - vec3(0.0, 35.0, 0.0), vec3(9.6, 6.0, 6.6)));
  d = min(d, seEllipsoid(q - vec3(0.0, 47.0, 0.0), vec3(10.6, 14.0, 7.6)));
  d = min(d, segD(q, vec3(10.0, 58.0, 0.0), vec3(12.8, 33.0, 1.4), 3.3));
  d = min(d, segD(q, vec3(-10.0, 58.0, 0.0), vec3(-12.8, 33.0, 1.4), 3.3));
  d = min(d, length(q - vec3(12.9, 31.0, 1.6)) - 3.1);
  d = min(d, length(q - vec3(-12.9, 31.0, 1.6)) - 3.1);
  d = min(d, seCapsuleY(q - vec3(0.0, 58.0, 0.0), 6.0, 3.6));
  d = min(d, seEllipsoid(q - vec3(0.0, 67.5, 0.3), vec3(5.9, 7.2, 6.5)));
  return vec2(d, 2.0);
}

vec2 hallD(vec3 p) {
  vec2 res = vec2(p.y + 130.0, 2.0);
  if (p.y < -123.0) {
    vec2 f = seRep2(p.xz, vec2(6.25));
    float hole = max(length(f) - 1.15, -(p.y + 131.6));
    float seam = max(min(abs(seRep(p.x, 25.0)), abs(seRep(p.z, 25.0))) - 0.14, -(p.y + 130.7));
    res.x = max(res.x, -min(hole, seam));
  }
  // back wall and side walls (a section: the front is open)
  float dB = bx(p, vec3(200.0, 42.5, -154.0), vec3(348.0, 172.5, 4.0), 0.2);
  if (p.z < -145.0 && dB < 3.0) {
    float g = min(abs(seRep(p.x, 40.0)) - 0.32, abs(seRep(p.y + 30.0, 60.0)) - 0.32);
    dB = max(dB, -max(g, -(p.z + 150.8)));
  }
  float dL = bx(p, vec3(-144.0, 42.5, 115.0), vec3(4.0, 172.5, 265.0), 0.2);
  float dR = bx(p, vec3(544.0, 42.5, 115.0), vec3(4.0, 172.5, 265.0), 0.2);
  if (p.x > 535.0 && dR < 3.0) dR = max(dR, -max(abs(seRep(p.z, 40.0)) - 0.32, p.x - 540.8));
  float dW = min(dB, min(dL, dR));
  if (dW < res.x) res = vec2(dW, 2.0);
  // ceiling / roof deck with the hatch
  if (p.y > 190.0) {
    vec3 rq = p - vec3(200.0, 222.0, 115.0);
    float dS = seRoundBox(rq, vec3(348.0, 7.0, 265.0), 0.3);
    float dh = max(abs(p.x - ${f1(HATCH[0])}) - 28.0, abs(p.z - ${f1(HATCH[2])}) - 28.0);
    dS = max(dS, -dh);
    if (p.y < 220.0) {                                   // underside: FFU grid (tile seams and recessed filter faces)
      vec2 f = seRep2(p.xz, vec2(25.0));
      float seam = max(min(abs(f.x), abs(f.y)) - 0.35, (p.y - 216.4));
      float ffu = max(max(abs(f.x) - 9.5, abs(f.y) - 9.5), p.y - 219.0);
      dS = max(dS, -min(seam, ffu));
    } else if (p.y > 226.0) {                            // roof: standing seams
      dS = max(dS, -max(abs(seRep(p.z, 20.0)) - 0.25, p.y - 228.4));
    }
    float dh2 = bx(p, vec3(${f1(HATCH[0])}, 233.0, ${f1(HATCH[2])}), vec3(34.5, 7.0, 34.5), 0.4);
    dh2 = max(dh2, -(max(abs(p.x - ${f1(HATCH[0])}) - 28.0, abs(p.z - ${f1(HATCH[2])}) - 28.0)));
    float d2 = max(abs(rq.x) - 348.0, abs(rq.z) - 265.0);
    float dPar = max(abs(d2 + 3.0) - 3.0, abs(p.y - 235.0) - 6.0);
    float dHv = min(bx(p, vec3(262.0, 240.0, 30.0), vec3(22.0, 9.0, 16.0), 0.6), min(bx(p, vec3(392.0, 240.0, -30.0), vec3(26.0, 9.0, 18.0), 0.6), min(bx(p, vec3(290.0, 238.0, -100.0), vec3(24.0, 7.0, 14.0), 0.6), bx(p, vec3(60.0, 238.0, 250.0), vec3(24.0, 7.0, 16.0), 0.6))));
    float sk = clamp(floor((p.x - 20.0) / 70.0 + 0.5), 0.0, 4.0);
    vec3 sq = vec3(p.x - 20.0 - 70.0 * sk, p.y - 240.0, p.z - 20.0);
    float dSt = max(length(vec2(sq.x, sq.z)) - 6.0, abs(sq.y) - 11.0);
    float dg = min(min(dh2, dPar), min(dHv, dSt));
    dS = min(dS, dg);
    if (dS < res.x) res = vec2(dS, p.y > 224.0 ? 3.0 : 2.0);
  } else {
    res.x = min(res.x, 190.0 - p.y + 25.0 * 0.0);
  }
  return res;
}

vec2 stageD(vec3 p) {
  vec3 q = p - WAFP;
  if (length(q) > 125.0) return vec2(length(q) - 112.0, 1.0);
  float zo = mix(-6.0, 6.0, smoothstep(16.0, 16.7, uT));
  vec2 res = vec2(bx(q, vec3(0.0, -60.0, 0.0), vec3(62.0, 8.0, 50.0), 1.0), 3.0);                 // granite base
  float rl = min(bx(q, vec3(0.0, -50.0, 38.0), vec3(58.0, 2.0, 2.2), 0.5), bx(q, vec3(0.0, -50.0, -38.0), vec3(58.0, 2.0, 2.2), 0.5));
  rl = min(rl, bx(q, vec3(40.0, -48.0, 0.0), vec3(3.0, 3.0, 40.0), 0.6));
  res = seUnion(res, vec2(rl, 1.0));
  vec3 s = q - vec3(0.0, 0.0, zo);
  float tb = bx(s, vec3(0.0, -34.0, 0.0), vec3(38.0, 10.0, 30.0), 1.0);                             // long-stroke table
  tb = min(tb, bx(s, vec3(0.0, -16.0, 0.0), vec3(30.0, 8.0, 25.0), 1.2));                            // short-stroke table
  tb = min(tb, bx(s, vec3(0.0, -6.0, 27.0), vec3(28.0, 3.0, 0.8), 0.2));                             // interferometer bars
  tb = min(tb, bx(s, vec3(31.5, -6.0, 0.0), vec3(0.8, 3.0, 25.0), 0.2));
  res = seUnion(res, vec2(tb, 1.0));
  float ch = seCylY(s - vec3(0.0, -3.1, 0.0), 8.6, 2.9);                                              // chuck
  res = seUnion(res, vec2(ch, 1.0));
  float wf = seCylY(s - vec3(0.0, -0.175, 0.0), 6.3, 0.175);                                          // the 300 mm wafer
  wf = max(wf, -seRoundBox(vec3(s.x, s.y + 0.2, s.z - 6.35), vec3(0.28, 0.5, 0.3), 0.05));
  if (wf < res.x) res = vec2(wf, 0.0);
  return res;
}

vec2 retD(vec3 p) {
  vec3 q = p - RETP;
  if (length(q) > 100.0) return vec2(length(q) - 92.0, 1.0);
  q.x -= mix(-4.0, 4.0, smoothstep(15.95, 16.45, uT));
  vec2 res = vec2(seRoundBox(q - vec3(0.0, 0.35, 0.0), vec3(7.0, 0.35, 7.0), 0.08), q.y < 0.2 ? 70.0 : 1.0);
  float c = bx(q, vec3(0.0, 2.2, 0.0), vec3(10.0, 1.5, 9.0), 0.3);
  c = min(c, bx(q, vec3(0.0, 8.0, 0.0), vec3(24.0, 4.0, 16.0), 0.8));
  float cb = max(c, -seRoundBox(q - vec3(0.0, 8.0, 0.0), vec3(18.0, 1.0, 10.0), 0.5));
  c = min(cb, 1.0e3);
  vec3 r = vec3(0.0, 14.0, 0.0);
  c = min(c, min(bx(q, r + vec3(0.0, 0.0, 19.0), vec3(70.0, 1.8, 1.8), 0.4), bx(q, r + vec3(0.0, 0.0, -19.0), vec3(70.0, 1.8, 1.8), 0.4)));
  c = min(c, min(bx(q, vec3(72.0, 8.0, 0.0), vec3(2.0, 8.0, 24.0), 0.4), bx(q, vec3(-72.0, 8.0, 0.0), vec3(2.0, 8.0, 24.0), 0.4)));
  c = min(c, bx(q, vec3(0.0, 24.0, 0.0), vec3(3.0, 10.0, 3.0), 0.5));
  return seUnion(res, vec2(c, 1.0));
}

vec2 map(vec3 p) {
  vec2 res = hallD(p);
  float dPl = length(p - uBP[0]) - 3.2;
  if (dPl < res.x) res = vec2(dPl, 60.0);
  for (int i = 0; i < 11; i++) {
    float bs = length(p - uMC[i]) - uMP[i].x * 1.8;
    if (bs > res.x) continue;
    vec2 m = mirrorD(p, i);
    if (m.x < res.x) res = m;
  }
  for (int k = 0; k < 13; k++) {
    float t0 = uBT[k];
    if (uT <= t0) break;
    float f = clamp((uT - t0) / (uBT[k + 1] - t0), 0.0, 1.0);
    vec3 a = uBP[k];
    float d = segD(p, a, a + (uBP[k + 1] - a) * f, uBr);
    if (d < res.x) res = vec2(d, 20.0 + float(k));
  }
  vec2 s = stageD(p); if (s.x < res.x) res = s;
  vec2 r = retD(p); if (r.x < res.x) res = r;
  vec2 f1 = figD(p - FIGI); if (f1.x < res.x) res = f1;
  vec2 f2 = figD(p - FIGR); if (f2.x < res.x) res = f2;
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-170.0, -165.0, -175.0), hi = vec3(560.0, 1500.0, 400.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id > 19.5 && id < 39.5) return 1.3;
  if (id > 39.5 && id < 50.5) return 0.85;
  if (id > 59.5 && id < 60.5) return 1.35;
  if (id > 69.5 && id < 70.5) return 0.85;
  return seMatZ(id);
}
float matAmber(float id, vec3 p, vec3 n) {
  if (id > 19.5 && id < 39.5) return uBG[int(id - 19.5)];
  if (id > 39.5 && id < 50.5) {
    int i = int(id - 39.5);
    float R = uMP[i].x;
    float v;
    if (i == 0) {
      float r = length(p.xy - uMC[0].xy);
      v = 0.95 * (1.0 - smoothstep(9.5, 16.5, r)) * exp(-max(uT - 15.0, 0.0) / 0.40);
    } else {
      vec3 dq = p - uMH[i];
      v = step(uMT[i], uT) * exp(-(uT - uMT[i]) / 0.30) * (0.55 + 0.45 * exp(-dot(dq, dq) / (0.32 * R * R)));
    }
    return clamp(max(v, uHeat), 0.0, 0.99);
  }
  if (id < 0.5 && n.y > 0.9) {
    vec3 dq = p - WAFP;
    float dz = dq.z;
    return length(dq.xz) < 6.4 ? uSlit * exp(-dz * dz / 0.06) : 0.0;
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
${UNIFS}
const vec3 RETP = vec3(${f1(RET[0])}, ${f1(RET[1])}, ${f1(RET[2])});
const vec3 WAFP = vec3(${f1(WAF[0])}, ${f1(WAF[1])}, ${f1(WAF[2])});
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0;
  if (id > 39.5 && id < 50.5) {
    // Mo/Si multilayer: 50 bilayers across the exaggerated coat; 5-layer bands when 50 cannot be resolved
    int i = int(id - 39.5);
    vec3 q = p - uMC[i];
    float ly = dot(q, uMN[i]);
    float r2 = dot(q, q) - ly * ly;
    float R = uMP[i].x, k = uMP[i].z;
    float dc = k * r2 - ly;
    float per = 0.26 * R / 50.0;
    float wall = 1.0 - smoothstep(0.45, 0.85, abs(dot(n, uMN[i])));
    float a1 = 1.0 - smoothstep(0.30, 0.85, fw / per);
    float a2 = 1.0 - smoothstep(0.30, 0.85, fw / (5.0 * per));
    float st = step(0.42, fract(dc / per));
    float g5 = step(0.5, fract(dc / (5.0 * per)));
    float fine = mix(1.0, mix(1.25, 0.58, st), wall * a1);
    float coarse = mix(1.0, mix(1.12, 0.80, g5), wall * a2 * (1.0 - a1));
    mz *= fine * coarse;
  } else if (id > 69.5 && id < 70.5) {
    vec2 g = (p.xz - RETP.xz) / 3.4;
    vec2 f = fract(g + 0.5) - 0.5;
    float cell = step(abs(f.x), 0.40) * step(abs(f.y), 0.40);
    float inner = step(0.5, fract(p.x * 1.9)) * step(0.5, fract(p.z * 1.5));
    float a = 1.0 - smoothstep(0.35, 0.9, fw / 0.25);
    mz *= 1.0 - a * (0.55 * cell + 0.18 * cell * inner);
  } else if (id < 0.5 && n.y > 0.9 && length(p.xz - WAFP.xz) < 6.4) {
    vec2 f = abs(fract(p.xz / vec2(1.1, 1.4) + 0.5) - 0.5) * vec2(1.1, 1.4);
    float line = 1.0 - smoothstep(0.02, 0.05, min(f.x, f.y));
    float a = 1.0 - smoothstep(0.3, 0.9, fw / 0.2);
    mz *= 1.0 - 0.45 * line * a;
  }
  return vec2(mz, 0.0);
}`;

// ------------------------------------------------------------------------------------------------ the scene
interface Queue { a: V3; ctl: V3; t0: number; t1: number; name: string }
const M_PER_DEG = 111e3;
const mapPt = (lon: number, lat: number): V3 => [(lon - VELDHOVEN.lon) * M_PER_DEG, 0, -(lat - VELDHOVEN.lat) * M_PER_DEG];

export default class W3Machine extends Scene {
  override seGrade = 0;
  shade!: SEShade;
  strip = new SEStrip();
  hud = new Layer2D();
  veil = new Layer2D(16, 9);
  ink = new LineBatch(90000);
  beam = new LineBatch(20000);
  line: any;
  land: [number, number][] = [];
  queues: Queue[] = [];
  uni!: Record<string, THREE.IUniform>;
  private arrK = new Array(11).fill(0) as number[];
  private arrBG = new Array(13).fill(0) as number[];

  override init() {
    this.line = lineByScene(this.ctx.lyrics, 'machine');
    const w = this.line.words;
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uFP: v(0.001), uBr: v(0.3), uHeat: v(0), uSlit: v(0), uCoat: v(0),
      uMC: { value: MC.map((c) => new THREE.Vector3(...c)) },
      uMN: { value: MIR.map((m) => new THREE.Vector3(...m.n)) },
      uMA: { value: MIR.map((m) => new THREE.Vector3(...m.a)) },
      uMH: { value: MIR.map((_, i) => new THREE.Vector3(...BP[MPT[i]!]!)) },
      uMP: { value: MIR.map((m) => new THREE.Vector4(m.R, m.T, m.k, 0)) },
      uMT: { value: MIR.map((_, i) => BT_[MPT[i]!]!) },
      uMK: { value: this.arrK },
      uBP: { value: BP.map((p) => new THREE.Vector3(...p)) },
      uBT: { value: BT_.slice() },
      uBG: { value: this.arrBG },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 1.2, scale: 0.4 });
    for (let lat = -58; lat <= 82; lat += 0.5) for (let lon = -179.75; lon <= 179.75; lon += 0.5) if (isLand(lon, lat)) this.land.push([lon, lat]);
    const tq0 = w[6].start + 0.12;
    this.queues = WANTS.map(([name, lon, lat], i) => {
      const a = mapPt(lon, lat), b = mapPt(VELDHOVEN.lon, VELDHOVEN.lat);
      const mid = mul(add(a, b), 0.5), d = sub(b, a);
      const ctl = add(mid, [d[2] * 0.22, 0, -Math.abs(d[0]) * 0.18]);
      const t0 = tq0 + (i / WANTS.length) * 0.95 + hash(i, 4) * 0.08;
      return { a, ctl, t0, t1: t0 + 0.42 + 0.25 * hash(i, 5), name };
    });
  }

  /** mirrors passed by time t, and the intensity left (0.7 per mirror) */
  private passed(t: number) { let n = 0; for (const p of MPT) if (t >= BT_[p]!) n++; return n; }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick, w = this.line.words;
    const u = this.uni;
    const { cam, ppm } = camAt(t);
    const lgS = lgSAt(t);
    // ---- uniforms
    u.uT!.value = t;
    u.uHeat!.value = 0.34 * smoothstep(16.42, 16.8, t);
    u.uSlit!.value = 0.55 * smoothstep(16.40, 16.46, t);
    u.uFP!.value = cam.tanY / (this.shade.gbuf.h / 2);
    u.uBr!.value = clamp(cam.dist * 0.0034, 0.26, 2.4);
    for (let i = 0; i < 11; i++) this.arrK[i] = smoothstep(MIR[i]!.cutT, MIR[i]!.cutT + 0.22, t);
    for (let k = 0; k < 13; k++) {
      const m = k <= 5 ? k : k - 1;
      this.arrBG[k] = 0.12 + 0.87 * Math.sqrt(Math.pow(0.7, m));
    }
    // ---- motion (noisy while the camera moves)
    const a = camAt(t - 1 / 30).cam, b = camAt(t + 1 / 30).cam;
    const sp = (Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30) / Math.max(120, cam.dist * 1.2)
      + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.2 + sp, 0, 0.75);
    const sdfA = t < 16.84 ? 1 : smoothstep(0.0, 1.1, lgS) ;
    if (sdfA > 0.001) {
      this.shade.render(renderer, out, cam, { frame: frameIdx(t), motion, kick, reveal: 2, rim: 0.95, focus: Math.max(60, cam.dist) * 0.9, hazeL: 700, zHaze: 0.32 });
    } else clearRT(renderer, out, LIN.ink);
    // ---- veil: the SDF world fades to ink as the hall becomes a speck
    const I = this.ink; I.clear();
    const B = this.beam; B.clear();
    const T = this.hud; T.clear();
    const x = T.ctx;
    const gone = 1 - sdfA;
    if (gone > 0.001) {
      this.veil.clear();
      this.veil.ctx.fillStyle = rgba('ink', gone); this.veil.ctx.fillRect(0, 0, 16, 9);
      comp.draw(renderer, this.veil.upload(), out);
    }
    // ---- overlays on the SE world
    const nPass = this.passed(t);
    const stripA = smoothstep(15.0, 15.2, t) * (t > 16.84 ? smoothstep(0.1, 0.9, lgS) : 1);
    if (t < 16.99) this.drawSE(x, cam, t, nPass, w);
    // ---- the map (old machine code): hall roof gives way to the world at night
    const mapA = prog(lgS, -0.6, -1.6);
    const outK = prog(t, 18.45, 18.72);
    if (mapA > 0.001) this.drawMap(I, B, x, t, w, lgS, mapA, outK);
    I.render(renderer, out);
    B.render(renderer, out);
    // ---- lyric: thin type in the scene (the beam's exposure dims it)
    this.drawLyric(x, t, w, nPass, outK);
    comp.draw(renderer, T.upload(), out);
    this.strip.composite(renderer, comp, out, { ppm: ppm / (U_M * 1000), unit: 'mm', alpha: stripA, unitTag: 'UNIT 0001' });

    // ---- post: SE grain while the SE world shows; the old plate's grade for the map
    let punch = 0;
    for (const i of [3, 4, 5, 6, 7]) punch = Math.max(punch, 0.012 * pulse(t, w[i].start, 0.08));
    if (t < 17.14) return sePost({ ca: 2.0 * kick * smoothstep(15.0, 15.2, t) });
    return { se: 1, bloom: 0.6, bloomThreshold: 0.9, vignette: 0.42, grain: 0.05, zoom: 1 + punch, shake: [0, (5 * punch) / 0.018 * 0.6] };
  }

  /** instrument tags, the figure's caliper, labels and the footnote */
  private drawSE(c: CanvasRenderingContext2D, cam: SECam, t: number, nPass: number, w: any) {
    const bone = (a: number) => `rgba(238,233,223,${a})`;
    const mn = (s: string, X: number, Y: number, size: number, col: string, align: CanvasTextAlign = 'left', tr = 1.5) => mono(c, s, X, Y, size, col, 500, align, tr);
    const proj = (p: V3) => seProject(cam, p);
    // instrument readout: wavelength, mirror count and what is left of the light
    const rA = smoothstep(15.05, 15.25, t) * (1 - smoothstep(16.80, 16.95, t));
    if (rA > 0.01) {
      const I = Math.pow(0.7, nPass);
      c.globalAlpha = rA;
      mn('EUV  λ 13.5 nm', 116, 112, 15, bone(0.85), 'left', 2);
      mn(`MIRROR ${String(nPass).padStart(2, '0')} / 11`, 116, 138, 15, bone(0.7), 'left', 2);
      mn(`I / I0  ${(I * 100).toFixed(I < 0.1 ? 1 : 0)} %`, 116, 164, 15, nPass >= 11 ? rgba('signal', 1) : bone(0.7), 'left', 2);
      c.globalAlpha = 1;
    }
    const tag = (p: V3, dx: number, dy: number, s: string, a: number) => {
      if (a < 0.01) return;
      const q = proj(p);
      if (q.z < 1 || q.x < 20 || q.x > W - 20 || q.y < 20 || q.y > H - 70) return;
      c.save(); c.globalAlpha = a;
      c.strokeStyle = bone(0.55); c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x + dx * 0.5, q.y + dy); c.lineTo(q.x + dx, q.y + dy); c.stroke();
      c.fillStyle = bone(0.9); c.beginPath(); c.arc(q.x, q.y, 2.4, 0, Math.PI * 2); c.fill();
      mn(s, q.x + dx + (dx > 0 ? 8 : -8), q.y + dy + 5, 13, bone(0.85), dx > 0 ? 'left' : 'right', 1.2);
      c.restore();
    };
    const win = (a: number, b: number, fi = 0.12, fo = 0.12) => smoothstep(a, a + fi, t) * (1 - smoothstep(b - fo, b, t));
    tag(add(MC[0]!, [0, 0, 6]), 150, -110, 'COLLECTOR  Mo/Si  Ø 1.2 m', win(15.05, 15.45));
    const g = MIR[2]!;
    tag(add(MC[2]!, mul(g.a, 0.9 * g.R)), 90, -70, 'Mo/Si  50 BILAYERS  (COAT SHOWN x800)', win(15.36, 15.70));
    tag(add(RET, [0, -2, 0]), 80, 80, 'RETICLE  REFLECTIVE', win(15.9, 16.3));
    tag(add(WAF, [0, 0, 0]), -120, -90, 'WAFER STAGE  300 mm', win(16.2, 16.55));
    // caliper beside the floor figure: 1.8 m
    const cA = win(16.0, 16.5);
    if (cA > 0.01) {
      const a0 = proj([FIG_IN[0] + 26, FIG_IN[1], FIG_IN[2]]), a1 = proj([FIG_IN[0] + 26, FIG_IN[1] + 75, FIG_IN[2]]);
      if (a0.z > 1 && a0.x > 0 && a0.x < W) {
        c.save(); c.globalAlpha = cA; c.strokeStyle = bone(0.8); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(a1.x, a1.y);
        c.moveTo(a0.x - 7, a0.y); c.lineTo(a0.x + 7, a0.y); c.moveTo(a1.x - 7, a1.y); c.lineTo(a1.x + 7, a1.y); c.stroke();
        mn('1.8 m', a0.x + 12, (a0.y + a1.y) / 2 + 5, 14, bone(0.9), 'left', 1.5);
        c.restore();
      }
    }
    // the footnote: written by the beam in amber, cooling to bone
    const writ = (s: string, t0: number, Y: number, size: number) => {
      if (t < t0) return;
      const n = Math.floor(clamp((t - t0) * 70, 0, s.length));
      const txt = s.slice(0, n);
      const age = t - t0 - n / 70;
      const k = n < s.length ? 1 : Math.exp(-Math.max(age, 0) / 0.30);
      const col = `rgb(${Math.round(lerp(238, 255, k))},${Math.round(lerp(233, 164, k))},${Math.round(lerp(223, 27, k))})`;
      c.save(); c.globalAlpha = 1 - smoothstep(16.78, 16.88, t);
      mn(txt, 1330, Y, size, col, 'left', 3);
      c.restore();
    };
    writ('LIGHT REMAINING: 2%', 16.43, 900, 26);
    writ('THE OTHER 98% IS HEAT', 16.66, 940, 26);
  }

  private drawLyric(x: CanvasRenderingContext2D, t: number, w: any, nPass: number, outK: number) {
    const fam = F.archivo(112, 300);
    const col = (i: number, dimK: number) => {
      const age = t - w[i].start, k = Math.exp(-Math.max(age, 0) / 0.30);
      return `rgba(${Math.round(lerp(238, 255, k))},${Math.round(lerp(233, 164, k))},${Math.round(lerp(223, 27, k))},${clamp(dimK, 0, 1)})`;
    };
    // first line: One Dutch machine, (exposure falls with the beam: 0.7 per mirror)
    const dim = Math.max(0.28, Math.pow(0.7, nPass) * 0.9 + 0.1);
    const a1 = smoothstep(14.99, 15.0, t) * (1 - smoothstep(16.41, 16.55, t));
    if (a1 > 0.01) {
      x.save(); x.globalAlpha = a1;
      let X = 116;
      for (const i of [0, 1, 2]) {
        if (t < w[i].start - 0.0) break;
        X += karaoke(x, w[i].w.toUpperCase(), X, 968, fam, 74, wordP(w[i], t), col(i, dim), `rgba(120,116,110,${0.9 * dim + 0.1})`, 5) + 34;
      }
      x.restore();
    }
    // second line: and the whole world's waiting
    if (t > w[3].start - 0.05) {
      x.save(); x.globalAlpha = 1 - outK;
      let X = 116;
      const yb = t < 16.9 ? 968 : 1000;
      if (t < 16.9) {
        for (const i of [3, 4]) X += karaoke(x, w[i].w.toUpperCase(), X, yb, fam, 74, wordP(w[i], t), col(i, 1), 'rgba(94,91,87,0.7)', 5) + 34;
      } else {
        for (const i of [3, 4, 5]) { X += karaoke(x, w[i].w.toUpperCase(), X, yb - 150, fam, 120, wordP(w[i], t), col(i, 1), 'rgba(94,91,87,0.5)', 6) + 30; }
        X = 116;
        for (const i of [6, 7]) { X += karaoke(x, w[i].w.toUpperCase(), X, yb, fam, 150, wordP(w[i], t), col(i, 1), 'rgba(94,91,87,0.5)', 7) + 34; }
      }
      x.restore();
    }
  }

  private drawMap(I: LineBatch, B: LineBatch, x: CanvasRenderingContext2D, t: number, w: any, lgS: number, mapA: number, outK: number) {
    const s = Math.pow(10, lgS);
    const km = ease.inOutCubic(prog(t, w[6].start, w[6].start + 0.3));
    const ko = ease.inOutExpo(prog(t, 18.28, 18.62));
    let L: V3 = mul(mapPt(10, 18), km);
    L = add(mul(L, 1 - ko), mul(mapPt(VELDHOVEN.lon, VELDHOVEN.lat), ko));
    const Qy = lerp(540, -6, ko);
    const SP = 0.99917;     // sin(pitch 1.53): the old camera's slight tilt
    const P = (p: V3): [number, number] => [960 + (p[0] - L[0]) * s, Qy + (p[2] - L[2]) * SP * s];
    const gra = LIN.graphite;
    const stepDeg = [0.5, 1, 2].find((d) => d * M_PER_DEG * s >= 8.5) ?? 2;
    const dotR = clamp(stepDeg * M_PER_DEG * s * 0.34, 1.6, 7);
    for (const [lon, lat] of this.land) {
      if (stepDeg > 0.5 && (Math.abs(((lon + 179.75) / stepDeg) % 1) > 1e-6 || Math.abs(((lat + 58) / stepDeg) % 1) > 1e-6)) continue;
      const p = P(mapPt(lon, lat));
      if (p[0] < -10 || p[0] > 1930 || p[1] < -10 || p[1] > 1090) continue;
      I.seg2(p[0], p[1], p[0] + 0.01, p[1], dotR, sc(gra, 1.3 * mapA * (1 - outK)), 1);
    }
    const V = P(mapPt(VELDHOVEN.lon, VELDHOVEN.lat));
    let arrived = 0;
    for (const q of this.queues) {
      const pa = P(q.a);
      const lit = prog(t, q.t0 - 0.15, q.t0);
      I.seg2(pa[0], pa[1], pa[0] + 0.01, pa[1], 6, sc(LIN.signal, 1.6 * lit * mapA * (1 - outK)), 1);
      if (t < q.t0) continue;
      const k = ease.inOutCubic(clamp((t - q.t0) / (q.t1 - q.t0)));
      if (k >= 1) arrived++;
      const pc = P(q.ctl), N = 28;
      let prev = pa;
      for (let j = 1; j <= N * k; j++) {
        const ss = j / N, a = (1 - ss) * (1 - ss), bb = 2 * (1 - ss) * ss, cc = ss * ss;
        const p: [number, number] = [a * pa[0] + bb * pc[0] + cc * V[0], a * pa[1] + bb * pc[1] + cc * V[1]];
        B.seg2(prev[0], prev[1], p[0], p[1], 1.4, sc(LIN.signal, 0.9 * mapA * (1 - 0.85 * outK)), 1);
        prev = p;
      }
      if (k < 1) B.seg2(prev[0], prev[1], prev[0] + 0.01, prev[1], 4, sc(LIN.ember, 3 * mapA), 1);
      if (k < 1 && lit > 0.5 && s < 1e-4) mono(x, q.name, pa[0] + 8, pa[1] - 6, 11, rgba('bone', 0.55 * mapA * (1 - k)), 500);
    }
    beamHead(B, V[0], V[1], t, 1.1 + 0.4 * pulse(t, w[7].start, 0.2), mapA);
    if (s < 1e-3) {
      mono(x, 'VELDHOVEN', V[0] + 14, V[1] + 26, 15, rgba('ember', mapA * (1 - outK)), 600, 'left', 1);
      x.globalAlpha = mapA * (1 - outK);
      mono(x, 'ORDERS IN QUEUE', 1808, 128, 15, rgba('bone', 0.6), 500, 'right', 2);
      x.font = font(F.archivo(100, 300), 130); x.fillStyle = rgba('signal', 1); x.textAlign = 'right';
      x.fillText(String(arrived).padStart(2, '0'), 1808, 250); x.textAlign = 'left';
      x.globalAlpha = 1;
    }
    const kc = ease.outExpo(prog(t, 18.42, 18.66));
    if (kc > 0) {
      const y1 = lerp(V[1], H_MACHINE_TONS.y, kc);
      B.seg2(H_MACHINE_TONS.x, V[1], H_MACHINE_TONS.x, y1, H_MACHINE_TONS.w, sc(LIN.bone, 0.9), 1);
      B.seg2(H_MACHINE_TONS.x, V[1], H_MACHINE_TONS.x, y1, 2, sc(LIN.ember, 1.6 * (1 - kc * 0.6)), 1);
    }
  }

  override dispose() { this.shade.dispose(); }
}
