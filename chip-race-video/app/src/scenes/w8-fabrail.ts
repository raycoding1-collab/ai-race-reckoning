// W8 THE FAB RAIL (bars 36-38, "and nobody sleeps in the fab tonight"): the overhead hoist transport never stops.
// Hand-built SE world (engine/se.ts: SDF -> half-res G-buffer -> semShade), shaded like the rest of the hero worlds.
//
//  Model (world unit = 10 cm; the ceiling lattice is W7's die lattice 13.5 x 16.5, so the shield's lit windows ARE ceiling lights):
//   - the ceiling: a T-bar frame and one light pane per die cell (seal-ring groove, 5 x 6 bumps and a mullion cross on the top
//     exactly as the shield's pillar tops; perforated underside). Shield panes burn amber from frame 0, the rest light outward.
//   - the rail network: hollow OHT rails (slotted, with a mounting plate) on hanger rods every 12 units, one rail per lane (24 apart),
//     lanes forking through quarter-circle switches (switch box + lamp) into a cross rail at z = -62.
//   - FOUP pods: rounded body, 25-wafer window both sides (recess + wafer stripes), door with seam and latch key holes, robot flange
//     with lugs, back handle, kinematic rails; each hangs from a hoist: carriage in the rail slot, four belts, gripper plate and claws.
//   - tool bays: tool bodies with vent grooves, hat, tower lamp, load-port plate with opening, shelf and kinematic pins, parked pods.
//   - the shift-clock sign: a light box on four rods with a seven-segment clock (amber).
//  Lyric to geometry: "and nobody" 67.50/67.73 the pods start (the camera falls through a ceiling hatch onto our pod's lane);
//  "sleeps" 68.44 every pod stops (LEDs die, hoists sway) except ours, which keeps running; "in the fab" 68.91-69.38 our pod brakes and
//  its hoist lowers it to a load port; "tonight" 69.84 the shift clock rolls 23:59 -> 00:00; 70.25 tape stop (decay, line, black).
//  in : w7-shield's last frame: only the shield's windows, flat amber on the lattice, scale 1:1, centre W/2,H/2, everything else ink.
//  out: black (silent gap, inhale) before the drop.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, makeRT, clearRT, type Compositor } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, hash, lerp, smoothstep, clamp, prog, ease, pulse, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { dies, WAFER } from './shield-grid';
import { SEShade, seCamera, seProject, sePpm, sePost, type SECam } from '../engine/se';
import { LIN } from '../engine/palette';
import type { Word } from '../engine/lyrics';

const T0 = 67.5, T_STOP = 70.25, T_BLACK = 70.78, T_SLEEP = 68.44, T_FLIP = 69.84, T_LOW0 = 68.94, T_DOCK = 69.38;
const PPM0 = WAFER.R / 150;
const mm = (px: number) => px / PPM0;
const PITCH = { x: mm(WAFER.dx), z: mm(WAFER.dy) };
const HALF = { x: mm(WAFER.dx - 3) / 2, z: mm(WAFER.dy - 3) / 2 };
const COLS = Math.ceil((WAFER.R * 2) / WAFER.dx) + 2, ROWS = Math.ceil((WAFER.R * 2) / WAFER.dy) + 2;
const ORG = { x: mm((0 - (COLS - 1) / 2) * WAFER.dx), z: mm((0 - (ROWS - 1) / 2) * WAFER.dy) };
const f1 = (x: number) => x.toFixed(4);
const V = 36, A0 = -10, ZI = -62, SIGN_DZ = 24, SIGN_X = -2.0, SIGN_Y = -40;
const HOLE = { x: -4, z: 13, r: 4.6 };
const TAN_Y = Math.tan((28 * Math.PI) / 360);

// ------------------------------------------------------------------------------------------------ motion (pure functions of time)
/** warped clock: runs with t, then the tape stops */
function tape(t: number): number {
  if (t <= T_STOP) return t;
  const D = T_BLACK - T_STOP, u = clamp((t - T_STOP) / D);
  return T_STOP + (D * (1 - Math.pow(1 - u, 3))) / 3;
}
const vOthers = (t: number) => V * smoothstep(67.73, 68.15, t) * (1 - smoothstep(T_SLEEP, 68.6, t));
const vOwn = (t: number) => V * smoothstep(67.73, 68.15, t) * (1 - smoothstep(68.66, 68.98, t));
function integ(fn: (t: number) => number, t: number) {
  let s = 0; const n = Math.max(1, Math.ceil((t - T0) * 400)), dt = (t - T0) / n;
  for (let i = 0; i < n; i++) s += fn(T0 + (i + 0.5) * dt) * dt;
  return s;
}
const A_STOP = A0 + integ(vOwn, 70);
const PH = A_STOP - 5.5;            // tool lattice phase: our port is the +5.5 port of tool cell 0
const ownA = (tau: number) => A0 + integ(vOwn, tau);
const lowerL = (tau: number) => 1 + 24.3 * ease.inOutCubic(prog(tau, T_LOW0, T_DOCK));
const podY = (tau: number) => -27 - lowerL(tau) - 0.18 * pulse(tau, T_DOCK, 0.09) * Math.sin(40 * Math.max(0, tau - T_DOCK));
const Z_SIGN = -A_STOP - SIGN_DZ;

// ------------------------------------------------------------------------------------------------ camera
// world keys: [t, pos xyz, target xyz] (the fall through the ceiling hatch), blended into the pod-relative ride
const CK: number[][] = [
  [67.50, 0, 813.4, 0.01, 0, 0, 0],
  [67.70, -2, 330, 2, -3, -20, 0],
  [67.86, -4, 60, 6, -4, -26, -14],
  [67.98, -4, -8, 14, -4, -30, -6],
  [68.15, -4, -26, 26, -3, -30, -2],
  [68.45, -3.6, -26, 27, -1, -28, 2],
];
// pod-relative: [t, cam offset xyz, target offset xyz] from the pod centre (x = 0, y = podY, z = -ownA)
const RK: number[][] = [
  [68.0, -3.6, 2.2, 24, -1.0, 0.8, -2],
  [68.94, -3.7, 2.6, 23, -0.5, 0.2, -3],
  [69.38, -3.4, 6.0, 20, 0.3, -0.8, -2.5],
  [69.64, -3.5, 6.5, 34, 1.0, 3.0, -21],
  [69.9, -3.5, 6.0, 36, 1.0, 3.0, -23],
  [70.4, -3.5, 6.0, 36, 1.0, 3.0, -23],
];
function hermite(K: number[][], col: number, t: number): number {
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
/** the camera at world time tau */
export function camAt(tau: number, kick = 0): SECam {
  const t = Math.max(tau, T0);
  const w = smoothstep(67.98, 68.38, t);
  const P: [number, number, number] = [0, podY(t), -ownA(t)];
  const g = (i: number) => lerp(hermite(CK, i, t), (i < 4 ? P[i - 1]! + hermite(RK, i, t) : P[i - 4]! + hermite(RK, i, t)), w);
  const pos: [number, number, number] = [g(1), g(2), g(3)], tgt: [number, number, number] = [g(4), g(5), g(6)];
  const dx = pos[0] - tgt[0], dy = pos[1] - tgt[1], dz = pos[2] - tgt[2];
  const hz = Math.hypot(dx, dz), dist = Math.hypot(dx, dy, dz);
  const el = (Math.atan2(dy, hz) * 180) / Math.PI;
  const az = ((Math.atan2(dx, dz) * 180) / Math.PI) * smoothstep(0.3, 3, hz);
  const ppm = H / 2 / (dist * TAN_Y) * (1 + 0.006 * kick);
  return seCamera(tgt, az, el, ppm);
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const WORLD = /* glsl */ `
uniform float uT, uWin, uPhi, uOwnA, uOwnL, uLed, uSway, uDock, uSign, uPh;
uniform vec3 uHole;
uniform sampler2D uDie;
const vec2 ORG = vec2(${f1(ORG.x)}, ${f1(ORG.z)}), PIT = vec2(${f1(PITCH.x)}, ${f1(PITCH.z)}), HALF = vec2(${f1(HALF.x)}, ${f1(HALF.z)});
const ivec2 GN = ivec2(${COLS}, ${ROWS});
const float PX = 24.0, RY = -20.0, FLOORY = -66.0, ZI = ${f1(ZI)}, RR = 8.0, SP = 11.5, TP = 24.0;
const float SIGNZ = ${f1(Z_SIGN)}, SIGNX = ${f1(SIGN_X)}, SIGNY = ${f1(SIGN_Y)};
#define SE_SHADOW 0.5
#define SE_STEPS 92
#define SE_SHADOW_STEPS 6

vec4 dieAt(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= GN.x || c.y >= GN.y) return vec4(0.0, 1.0e3, 0.5, 0.0);
  return texelFetch(uDie, c, 0);
}
vec2 u2(vec2 a, float d, float m) { return d < a.x ? vec2(d, m) : a; }

// ---- the ceiling: T-bar frame (id 13) + one light pane per lattice cell (id 1)
vec2 ceilD(vec3 p) {
  vec2 gq = (p.xz - ORG) / PIT;
  ivec2 c0 = ivec2(floor(gq + 0.5));
  vec2 q = (gq - vec2(c0)) * PIT;
  vec2 sd = PIT * 0.5 - abs(q);
  float street = min(sd.x, sd.y);
  float dB = max(street - 0.5, abs(p.y + 0.85) - 0.65);
  vec2 res = vec2(dB, 13.0);
  float dP = seRoundBox(vec3(q.x, p.y + 0.8, q.y), vec3(HALF.x, 0.8, HALF.y), 0.3);
  if (p.y > -0.6) {
    float ringD = abs(seRoundBox2(q, HALF - 1.05, 0.3)) - 0.22;                         // seal ring groove
    dP = max(dP, -max(ringD, -0.25 - p.y));
    vec2 bi = vec2(clamp(floor(q.x / 2.1 + 0.5), -2.0, 2.0), clamp(floor(q.y / 2.3), -3.0, 2.0) + 0.5);   // 5 x 6 bumps
    dP = smin(dP, length(vec3(q.x - bi.x * 2.1, p.y + 0.3, q.y - bi.y * 2.3)) - 0.8, 0.15);
    float cr = max(min(abs(q.x), abs(q.y)) - 0.45, -1.0 - p.y);                          // mullion cross
    dP = max(dP, -cr);
  }
  res = u2(res, dP, 1.0);
  float dh = length(p.xz - uHole.xy) - uHole.z;
  res.x = smax(res.x, -dh, 0.25);
  return res;
}

// ---- a rail section (box with an open slot underneath) in (across, y) coordinates
float railSec(vec2 q) {
  float d = seRoundBox2(q, vec2(1.15, 0.95), 0.12);
  float slot = max(abs(q.x) - 0.48, q.y - 0.1);
  d = max(d, -slot);
  d = min(d, seRoundBox2(q - vec2(0.0, 1.1), vec2(1.55, 0.15), 0.04));
  return d;
}

// ---- a FOUP with its hoist. q = pod-local (door +x, up +y); cy = carriage height above the pod centre; led = id of the lamp strip
vec2 podGear(vec3 q, float cy, float led) {
  float bb = seRoundBox(q - vec3(0.0, (cy - 1.5) * 0.5, 0.0), vec3(2.9, (cy + 3.6) * 0.5, 2.4), 0.0);
  if (bb > 0.6) return vec2(bb, 7.0);
  float d = seRoundBox(q, vec3(2.1, 2.0, 1.95), 0.32);
  vec3 wq = vec3(q.x + 0.15, q.y, abs(q.z) - 1.95);                                      // the 25-wafer window, both sides
  d = max(d, -seRoundBox(wq, vec3(1.2, 1.3, 0.16), 0.1));
  float dwP = seRoundBox(wq + vec3(0.0, 0.0, 0.12), vec3(1.15, 1.25, 0.02), 0.01);
  vec3 dq = q - vec3(2.1, 0.0, 0.0);                                                      // the door: seam groove and two latch keys
  float seam = abs(seRoundBox2(dq.zy, vec2(1.55, 1.7), 0.2)) - 0.04;
  d = max(d, -max(seam, 2.03 - q.x));
  d = max(d, -max(length(vec2(abs(q.z) - 0.8, q.y)) - 0.28, 2.0 - q.x));
  vec2 r = vec2(d, 7.0);
  r = u2(r, dwP, 12.0);
  r = u2(r, seRoundBox(q - vec3(0.0, 2.66, 0.0), vec3(1.55, 0.12, 1.15), 0.08), 13.0);   // robot flange
  r = u2(r, seCylY(q - vec3(0.0, 2.3, 0.0), 0.5, 0.35), 13.0);
  r = u2(r, seCylY(vec3(abs(q.x) - 1.15, q.y - 2.9, abs(q.z) - 0.8), 0.16, 0.14), 13.0);
  r = u2(r, seCylAxis(q, vec3(-2.55, 0.2, -0.95), vec3(-2.55, 0.2, 0.95), 0.12), 13.0);  // back handle
  r = u2(r, seCylAxis(vec3(q.x, q.y, abs(q.z)), vec3(-2.55, 0.2, 0.95), vec3(-2.0, 0.2, 0.95), 0.12), 13.0);
  r = u2(r, seRoundBox(vec3(q.x, q.y + 2.08, abs(q.z) - 1.3), vec3(1.7, 0.14, 0.22), 0.05), 13.0);   // kinematic rails
  r = u2(r, seRoundBox(q - vec3(1.45, 1.98, 0.0), vec3(0.28, 0.05, 0.9), 0.02), led);                   // lamp strip
  if (q.y > 2.4) {
    r = u2(r, seRoundBox(q - vec3(0.0, 3.65, 0.0), vec3(1.9, 0.5, 1.5), 0.12), 13.0);                  // gripper plate
    r = u2(r, seRoundBox(vec3(abs(q.x) - 1.72, q.y - 2.75, q.z), vec3(0.12, 0.5, 0.9), 0.03), 13.0);   // claws
  }
  if (q.y > 3.8) {
    float bt = max(length(vec2(abs(q.x) - 1.4, abs(q.z) - 1.0)) - 0.09, max(4.1 - q.y, q.y - (cy - 0.8)));
    r = u2(r, bt, 13.0);                                                                                // belts
    r = u2(r, seRoundBox(q - vec3(0.0, cy, 0.0), vec3(2.0, 0.85, 1.5), 0.15), 13.0);                    // carriage
    r = u2(r, seRoundBox(q - vec3(0.0, cy + 1.2, 0.0), vec3(0.35, 0.45, 1.0), 0.05), 13.0);             // neck into the rail slot
  }
  return r;
}

// ---- a tool and its two load ports. q = (across from the lane, y, along); n = cell id, s = +-1 port side
vec2 toolD(vec3 q, float la, float k, float n) {
  float bb = seRoundBox(q - vec3(6.3, -55.0, 0.0), vec3(9.4, 11.6, 11.4), 0.0);
  if (bb > 0.6) return vec2(bb, 0.0);
  float d = seRoundBox(q - vec3(8.8, -55.0, 0.0), vec3(6.2, 11.0, 10.8), 0.45);
  float vx = max(abs(seRep(q.x, 1.3)) - 0.2, max(abs(q.x - 8.5) - 4.4, abs(q.z) - 9.0));
  d = max(d, -max(vx, -44.45 - q.y));                                                    // vent grooves in the roof
  float s = la >= 0.0 ? 1.0 : -1.0;
  float lp = la - s * 5.5;
  vec2 r = vec2(d, 0.0);
  r = u2(r, seRoundBox(q - vec3(9.5, -42.7, -2.0), vec3(3.6, 1.6, 6.0), 0.3), 0.0);   // hat
  float plate = seRoundBox(vec3(q.x - 2.4, q.y + 51.6, lp), vec3(0.3, 4.8, 3.4), 0.1);
  plate = max(plate, -seRoundBox(vec3(q.x - 2.55, q.y + 51.6, lp), vec3(0.45, 3.2, 2.0), 0.1));       // port opening
  r = u2(r, plate, 3.0);
  r = u2(r, seRoundBox(vec3(q.x + 0.2, q.y + 54.9, lp), vec3(2.9, 0.35, 2.7), 0.1), 13.0);            // shelf
  vec3 pq = vec3(q.x, q.y + 54.45, lp);
  float pins = min(length(pq - vec3(-1.2, 0.0, -1.5)), min(length(pq - vec3(-1.2, 0.0, 1.5)), length(pq - vec3(1.2, 0.0, 0.0)))) - 0.3;
  r = u2(r, pins, 13.0);
  bool ours = k == 0.0 && n == 0.0 && s > 0.0;
  r = u2(r, seRoundBox(vec3(q.x - 2.0, q.y + 46.7, lp), vec3(0.15, 0.2, 0.8), 0.04), ours ? 8.0 : 10.0);   // port status lamp
  r = u2(r, seCylY(q - vec3(13.2, -41.5, -8.0), 0.45, 2.6), 11.0);                                     // tower lamp
  // parked pods on the other ports
  bool taken = ours || hash12(vec2(n * 3.7 + k * 11.1, s)) < 0.42;
  if (!taken) { vec2 pp = podGear(vec3(q.x, q.y + 52.22, lp), 5.5, 7.0); if (pp.x < r.x) r = pp; }
  return r;
}

// ---- lane space: rails, hangers, switches, the cross rail, tools, moving pods
vec2 laneD(vec3 p) {
  float k = floor(p.x / PX + 0.5);
  float cx = p.x - k * PX;
  float a = -p.z;
  vec2 res = vec2(1.0e5, 0.0);
  // rail + hanger rods
  float bR = max(abs(p.y - RY) - 1.3, 0.0);
  if (bR < 3.0 && p.z > ZI + RR - 2.0) {
    float d = max(railSec(vec2(cx, p.y - RY)), ZI + RR - p.z);
    res = u2(res, d, 13.0);
  }
  if (p.y > RY && p.z > ZI + RR - 2.0) {
    float zr = seRep(p.z, 12.0);
    float rod = max(length(vec2(cx, zr)) - 0.18, max(abs(p.y + 9.4) - 9.4, 0.0));
    float col = max(length(vec2(cx, zr)) - 0.36, abs(p.y + 3.0) - 0.2);
    res = u2(res, min(rod, col), 13.0);
  }
  // switches: the lane forks into two quarter circles that meet the cross rail
  if (bR < 4.0 && p.z < ZI + RR + 4.0 && p.z > ZI - 3.0) {
    float sg = cx >= 0.0 ? 1.0 : -1.0;
    vec2 c = vec2(sg * RR, ZI + RR);
    vec2 v = vec2(cx, p.z) - c;
    float dA = abs(length(v) - RR) - 1.0;
    if (v.x * sg > 0.0 || v.y > 0.0) dA = min(length(vec2(cx, p.z) - vec2(0.0, ZI + RR)), length(vec2(cx, p.z) - vec2(sg * RR, ZI))) - 1.0;
    res = u2(res, max(dA, abs(p.y - RY) - 0.95), 13.0);
    res = u2(res, seRoundBox(vec3(cx, p.y - RY, p.z - (ZI + RR + 1.6)), vec3(1.9, 1.3, 2.4), 0.2), 13.0);      // switch box
    res = u2(res, seRoundBox(vec3(cx, p.y - RY + 1.35, p.z - (ZI + RR + 1.6)), vec3(0.5, 0.08, 1.2), 0.03), 10.0);   // its lamp
  }
  // tools and their ports (tool cells along the lane, phase uPh)
  if (p.y < -38.0 && p.z > ZI + 4.0 && k >= 0.0) {
    float ap = a - uPh;
    float n = floor(ap / TP + 0.5);
    float la = ap - n * TP;
    vec2 T = toolD(vec3(cx, p.y, la), la, k, n);
    res = u2(res, T.x, T.y);
  } else if (p.y < -38.0) {
    res.x = min(res.x, k >= 0.0 ? 2.0 : 6.0);
  }
  // other pods on this lane (not lane 0: that is ours)
  if (k != 0.0 && p.y < -16.0 && p.y > -37.0 && p.z > ZI + 2.0) {
    float dir = mod(k, 2.0) == 0.0 ? 1.0 : -1.0;
    float aa = a - dir * uPhi;
    float n = floor(aa / SP + 0.5);
    float lz = aa - n * SP;
    float present = step(hash12(vec2(n * 7.31, k * 13.7)), 0.64);
    float edge = max(SP * 0.5 - abs(lz), 0.0) + 0.3;
    if (present > 0.5) {
      lz += uSway * dir * 0.7 * (0.5 + hash12(vec2(n, k)));
      vec2 pd = podGear(vec3(cx, p.y + 28.0, lz), 5.5, 10.0);
      res = u2(res, pd.x, pd.y);
    } else res.x = min(res.x, edge);
  }
  return res;
}

vec2 map(vec3 p) {
  vec2 res = vec2(p.y - FLOORY, 2.0);
  float bc = max(abs(p.y + 0.9) - 1.5, 0.0);
  if (bc < res.x) { vec2 C = ceilD(p); res = u2(res, C.x, C.y); }
  if (p.y < 3.0 && p.y > -67.0) {
    vec2 L = laneD(p);
    res = u2(res, L.x, L.y);
    // our pod, hoisted on lane 0
    vec3 qo = vec3(p.x, p.y + 27.0 + uOwnL, p.z + uOwnA);
    float bo = seRoundBox(vec3(p.x, p.y + 14.0 + uOwnL * 0.5, p.z + uOwnA), vec3(3.0, 16.0 + uOwnL * 0.5, 2.5), 0.0);
    if (bo < res.x) {
      vec2 po = podGear(qo, 4.5 + uOwnL, 8.0);
      res = u2(res, po.x, po.y);
    }
    // the shift-clock sign: light box on four rods
    vec3 sq = vec3(p.x - SIGNX, p.y - SIGNY, p.z - SIGNZ);
    float bs = seRoundBox(sq, vec3(9.5, 42.0, 3.0), 0.0);
    if (bs < res.x) {
      float sb = seRoundBox(sq, vec3(8.2, 2.9, 0.6), 0.15);
      sb = max(sb, -seRoundBox(sq - vec3(0.0, 0.0, 0.55), vec3(7.5, 2.3, 0.2), 0.1));
      res = u2(res, sb, 13.0);
      res = u2(res, seRoundBox(sq - vec3(0.0, 0.0, 0.38), vec3(7.45, 2.25, 0.02), 0.01), 9.0);
      float rod = max(length(vec2(abs(sq.x) - 6.5, sq.z)) - 0.22, max(abs(p.y + 18.6) - 18.6, 0.0));
      res = u2(res, rod, 13.0);
    }
  }
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-160.0, FLOORY - 1.0, -160.0), hi = vec3(160.0, 900.0, 160.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

bool shieldTop(vec3 p, vec3 n) {
  vec4 cd = dieAt(ivec2(floor((p.xz - ORG) / PIT + 0.5)));
  return n.y > 0.8 && cd.x > 0.5 && cd.x < 1.5 && p.y > -0.6;
}
float matZ(float id, vec3 p, vec3 n) {
  float fl = 1.0 - smoothstep(35.0, 110.0, length(p.xz - vec2(0.0, -10.0)));
  float Z = id < 0.5 ? 0.36 : id < 1.5 ? 0.70 : id < 2.5 ? 0.14 : id < 3.5 ? 0.30 : id < 7.5 ? (id < 6.5 ? 0.3 : 0.46) :
            id < 8.5 ? 1.25 : id < 9.5 ? 0.16 : id < 10.5 ? 1.25 : id < 11.5 ? 1.25 : id < 12.5 ? 0.30 : 0.58;
  if (id > 1.5 && id < 2.5) Z *= fl;
  if (id > 0.5 && id < 1.5 && uWin > 0.0) Z = mix(Z, 1.3, uWin * (shieldTop(p, n) ? 1.0 : 0.0));
  float keep = (id > 0.5 && id < 1.5 && shieldTop(p, n)) ? 1.0 : 0.0;
  return Z * mix(1.0, keep, uWin);
}
float matAmber(float id, vec3 p, vec3 n) {
  if (id > 0.5 && id < 1.5) {
    vec4 cd = dieAt(ivec2(floor((p.xz - ORG) / PIT + 0.5)));
    float face = smoothstep(0.55, 0.9, abs(n.y));
    float lit = cd.x < 0.5 ? step(cd.y, uT) * 0.82 : (cd.x < 1.5 ? 0.99 : 0.0);
    float fl = cd.x < 0.5 ? exp(-(uT - cd.y) / 0.12) * step(cd.y, uT) * 0.17 : 0.0;
    return clamp((lit + fl) * face, 0.0, 0.99);
  }
  if (id > 7.5 && id < 8.5) return 0.99;
  if (id > 8.5 && id < 9.5) return 0.30 * uSign;
  if (id > 9.5 && id < 10.5) return 0.95 * uLed;
  if (id > 10.5 && id < 11.5) {
    float k = floor(p.x / PX + 0.5);
    float n = floor((-p.z - uPh) / TP + 0.5);
    return hash12(vec2(k * 3.7 + n * 1.31, 4.0)) < 0.55 ? 0.92 : 0.0;
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
const float TP = 24.0, PX = 24.0;
uniform float uPh;
float rep1(float x, float s) { return x - s * floor(x / s + 0.5); }
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  if (id > 1.5 && id < 2.5) {
    vec2 g = abs(fract(p.xz / 6.0 + 0.5) - 0.5) * 6.0;                       // raised-floor tile seams
    float aa = 1.0 - smoothstep(0.3, 1.2, fw / 0.3);
    mz *= 1.0 + 1.1 * aa * (1.0 - smoothstep(0.1, 0.22, min(g.x, g.y)));
  } else if (id > 0.5 && id < 1.5) {
    if (n.y < -0.5) {                                                         // perforated diffuser underside
      vec2 f = abs(fract(p.xz / 0.9 + 0.5) - 0.5) * 0.9;
      float aa = 1.0 - smoothstep(0.35, 0.9, fw / 0.9);
      mz *= 1.0 - 0.55 * aa * (1.0 - smoothstep(0.16, 0.26, length(f)));
    }
  } else if (id < 0.5) {                                                      // tool panel seams
    float aa = 1.0 - smoothstep(0.4, 1.0, fw / 1.4);
    float sa = abs(rep1(-p.z - uPh, 5.4)), sy = abs(rep1(p.y + 55.0, 5.5));
    float ln = min(abs(n.x) > 0.5 ? sa : 9.0, abs(n.z) > 0.5 ? abs(rep1(p.x - 8.8, 5.4)) : 9.0);
    mz *= 1.0 - 0.55 * aa * (1.0 - smoothstep(0.03, 0.09, min(ln, sy)));
  } else if (id > 11.5 && id < 12.5) {                                        // the 25 wafers in the window
    float s = fract(p.y / 0.1);
    float aa = 1.0 - smoothstep(0.3, 0.8, fw / 0.1);
    mz *= 0.55 + 1.9 * aa * smoothstep(0.1, 0.25, s) * (1.0 - smoothstep(0.55, 0.7, s)) + 0.7 * (1.0 - aa);
  } else if (id > 12.5) {                                                     // rail joints
    float aa = 1.0 - smoothstep(0.2, 0.6, fw / 0.2);
    float j = abs(rep1(p.z - 6.0, 12.0));
    mz *= 1.0 - 0.5 * aa * (1.0 - smoothstep(0.03, 0.09, j));
  }
  return vec2(mz, add);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W8FabRail extends Scene {
  override seGrade = 0;
  words: Word[] = [];
  shade!: SEShade;
  text = new Layer2D();
  tmp = makeRT();
  private uni!: Record<string, THREE.IUniform>;
  private dieTex!: THREE.DataTexture;

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'fab').words;
    const D = dies();
    const sh = new Set(D.filter((d) => d.shield).map((d) => d.j * COLS + d.i));
    const arr = new Float32Array(COLS * ROWS * 4);
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const o = (j * COLS + i) * 4;
      const x = (i - (COLS - 1) / 2) * PITCH.x, z = (j - (ROWS - 1) / 2) * PITCH.z;
      const h = hash(i, j, 7);
      const isSh = sh.has(j * COLS + i);
      const dead = !isSh && hash(i, j, 3) < 0.09;
      arr[o] = isSh ? 1 : dead ? 2 : 0;
      arr[o + 1] = 67.62 + 0.9 * clamp(Math.hypot(x, z) / 190) + 0.25 * h;
      arr[o + 2] = h;
    }
    this.dieTex = new THREE.DataTexture(arr, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.dieTex.minFilter = this.dieTex.magFilter = THREE.NearestFilter; this.dieTex.generateMipmaps = false; this.dieTex.needsUpdate = true;
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uWin: v(1), uPhi: v(0), uOwnA: v(A0), uOwnL: v(1), uLed: v(1), uSway: v(0), uDock: v(0), uSign: v(0), uPh: v(PH),
      uHole: { value: new THREE.Vector3(HOLE.x, HOLE.z, HOLE.r) }, uDie: { value: this.dieTex },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 1.2 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    if (t >= T_BLACK) { clearRT(renderer, out, LIN.ink); return { bloom: 0, fade: 1, vignette: 0 }; }
    const tau = tape(t);
    const u = this.uni;
    const dS = tau - T_SLEEP;
    u.uT!.value = tau;
    (u.uHole!.value as THREE.Vector3).z = HOLE.r * smoothstep(67.72, 67.85, tau);
    u.uWin!.value = 1 - smoothstep(67.56, 68.02, tau);
    u.uPhi!.value = integ(vOthers, tau);
    u.uOwnA!.value = ownA(tau);
    u.uOwnL!.value = lowerL(tau);
    u.uLed!.value = 1 - smoothstep(T_SLEEP, T_SLEEP + 0.08, tau);
    u.uSway!.value = dS > 0 ? Math.exp(-dS / 0.45) * Math.sin(13 * dS) : 0;
    u.uSign!.value = smoothstep(69.4, 69.7, tau) * (0.6 + 0.4 * pulse(tau, T_FLIP, 0.2) + 0.0);
    const cam = camAt(tau, kick);
    const a = camAt(tau - 1 / 30, 0), b = camAt(tau + 1 / 30, 0);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / 300 + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.6;
    const stopK = 1 - prog(t, T_STOP, T_BLACK);
    const motion = clamp((0.2 + sp) * stopK, 0, 1);
    this.shade.render(renderer, this.tmp, cam, {
      frame: frameIdx(t), motion, kick, reveal: 2, dim: 0.4, rim: 1.0, focus: cam.dist * 0.75, hazeL: Math.max(160, cam.dist * 1.5), zHaze: 0.5,
    });
    this.overlays(comp, renderer, cam, tau, t);

    // tape stop: the picture collapses to a line
    clearRT(renderer, out, LIN.ink);
    const sq = 1 - 0.985 * ease.inExpo(prog(t, 70.5, T_BLACK));
    comp.draw(renderer, this.tmp.texture, out, { mode: 'replace', scale: [1, 1 / sq] });
    return sePost({ ca: 2.5 * kick * stopK + 4 * pulse(t, T_STOP, 0.08) });
  }

  private overlays(comp: Compositor, renderer: THREE.WebGLRenderer, cam: SECam, tau: number, t: number) {
    const c = this.text.ctx;
    this.text.clear();
    const mono = (s: string, x: number, y: number, size: number, col: string, wgt = 500, ls = 1.5, align: CanvasTextAlign = 'left') => {
      c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textBaseline = 'alphabetic'; c.textAlign = align;
      (c as any).letterSpacing = `${ls}px`; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    // ---- HUD: appears on "sleeps"
    const ha = smoothstep(T_SLEEP, T_SLEEP + 0.12, tau) * (1 - smoothstep(70.3, 70.5, t));
    if (ha > 0.01) {
      const fl = pulse(tau, T_SLEEP, 0.18);
      c.save(); c.globalAlpha = ha;
      c.strokeStyle = `rgba(238,233,223,${0.5 + 0.3 * fl})`; c.lineWidth = 1.2;
      c.strokeRect(70, 62, 470, 62);
      mono('OHT CONTROLLER  FAB 3  BAY 7', 86, 84, 12, 'rgba(156,151,143,0.95)', 500, 1.5);
      mono('PODS 4,117', 86, 112, 24, 'rgba(238,233,223,0.97)', 600, 1.5);
      mono('SLEEPING', 270, 112, 24, 'rgba(238,233,223,0.97)', 600, 1.5);
      mono('0', 424, 112, 24, `rgba(255,164,27,${0.9 + 0.1 * fl})`, 700, 1.5);
      c.restore();
    }
    // ---- the lyric as thin written type hanging in the aisle (written where the camera was looking when the word began;
    //      an amber write-head sweeps each word on, then it cools to bone)
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i]!;
      const age = tau - w.start, dur = w.end - w.start;
      if (age < -0.02 || age > dur + 0.35) continue;
      const c0 = camAt(Math.min(w.start, 69.9));
      const ab = [0, 1, 0.6, -0.3, 0.4, -0.5, 0.2][i % 7]!;
      const wp: [number, number, number] = [
        c0.pos[0] + c0.fwd[0] * 24 + c0.right[0] * (-3.2 + ab * 1.2) + c0.up[0] * (1.8 + ab),
        c0.pos[1] + c0.fwd[1] * 24 + c0.right[1] * (-3.2 + ab * 1.2) + c0.up[1] * (1.8 + ab),
        c0.pos[2] + c0.fwd[2] * 24 + c0.right[2] * (-3.2 + ab * 1.2) + c0.up[2] * (1.8 + ab),
      ];
      const P = seProject(cam, wp);
      if (P.z <= 1) continue;
      const size = clamp(1.0 * sePpm(cam, P.z), 12, 46);
      const txt = w.w.toUpperCase();
      const fade = smoothstep(0, 0.06, age) * (1 - smoothstep(dur + 0.05, dur + 0.35, age));
      const sweep = clamp(age / 0.16);
      c.save();
      c.globalAlpha = fade;
      c.font = font(F.mono(400), size); (c as any).letterSpacing = `${size * 0.28}px`;
      const wd = c.measureText(txt).width;
      c.beginPath(); c.rect(P.x - wd / 2 - 4, P.y - size * 1.2, (wd + 8) * sweep, size * 1.6); c.clip();
      const cool = smoothstep(0.16, 0.6, age);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = `rgba(${Math.round(lerp(255, 238, cool))},${Math.round(lerp(164, 233, cool))},${Math.round(lerp(27, 223, cool))},${lerp(0.98, 0.85, cool)})`;
      c.fillText(txt, P.x - wd / 2, P.y);
      c.restore();
      if (sweep < 1) {
        c.save(); c.globalAlpha = fade; c.fillStyle = 'rgba(255,164,27,0.95)';
        c.fillRect(P.x - wd / 2 - 4 + (wd + 8) * sweep, P.y - size * 1.0, 2, size * 1.2); c.restore();
      }
    }
    // ---- the shift clock on the sign (seven segments, affine-fitted to the light box face)
    const sa = smoothstep(69.4, 69.7, tau);
    if (sa > 0.01) {
      const S: [number, number, number] = [SIGN_X, SIGN_Y, Z_SIGN];
      const L = seProject(cam, [S[0] - 7.3, S[1] + 2.0, S[2] + 0.75]), R = seProject(cam, [S[0] + 7.3, S[1] + 2.0, S[2] + 0.75]), B = seProject(cam, [S[0] - 7.3, S[1] - 2.0, S[2] + 0.75]);
      if (L.z > 1 && R.z > 1 && B.z > 1) {
        const UW = 1000, UH = 274;
        c.save();
        c.setTransform((R.x - L.x) / UW, (R.y - L.y) / UW, (B.x - L.x) / UH, (B.y - L.y) / UH, L.x, L.y);
        c.globalAlpha = sa;
        const secs = Math.floor(((86400 - (T_FLIP - tau) * 8) % 86400 + 86400) % 86400);
        const hh = Math.floor(secs / 3600), mi = Math.floor((secs % 3600) / 60), ss = secs % 60;
        const str = [hh, mi, ss].map((n) => String(n).padStart(2, '0')).join('');
        const flare = pulse(tau, T_FLIP, 0.14);
        const SEG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
        const dw = 96, dh = 178, th = 17, gx = 24;
        const total = 6 * dw + 5 * gx + 2 * 26;
        let x = (UW - total) / 2;
        const y0 = (UH - dh) / 2;
        const seg = (ch: string, x0: number, on: boolean) => {
          const hz = (yy: number) => { c.beginPath(); c.moveTo(x0 + th * 0.6, yy); c.lineTo(x0 + th * 1.2, yy - th / 2); c.lineTo(x0 + dw - th * 1.2, yy - th / 2); c.lineTo(x0 + dw - th * 0.6, yy); c.lineTo(x0 + dw - th * 1.2, yy + th / 2); c.lineTo(x0 + th * 1.2, yy + th / 2); c.closePath(); c.fill(); };
          const vt = (xx: number, ya: number, yb: number) => { c.beginPath(); c.moveTo(xx, ya + th * 0.6); c.lineTo(xx + th / 2, ya + th * 1.2); c.lineTo(xx + th / 2, yb - th * 1.2); c.lineTo(xx, yb - th * 0.6); c.lineTo(xx - th / 2, yb - th * 1.2); c.lineTo(xx - th / 2, ya + th * 1.2); c.closePath(); c.fill(); };
          const m = y0 + dh / 2;
          const draw = (k: string) => {
            if (k === 'a') hz(y0 + th / 2); if (k === 'g') hz(m); if (k === 'd') hz(y0 + dh - th / 2);
            if (k === 'f') vt(x0 + th / 2, y0, m); if (k === 'b') vt(x0 + dw - th / 2, y0, m);
            if (k === 'e') vt(x0 + th / 2, m, y0 + dh); if (k === 'c') vt(x0 + dw - th / 2, m, y0 + dh);
          };
          for (const k of 'abcdefg') {
            const lit = on && SEG[+ch]!.includes(k);
            c.fillStyle = lit ? `rgba(255,${176 + 40 * flare},${40 + 70 * flare},${0.98})` : 'rgba(255,164,27,0.07)';
            draw(k);
          }
        };
        for (let i = 0; i < 6; i++) {
          seg(str[i]!, x, true);
          x += dw + gx;
          if (i === 1 || i === 3) {
            c.fillStyle = 'rgba(255,164,27,0.95)';
            c.fillRect(x - gx + 3, y0 + dh * 0.32, 12, 12); c.fillRect(x - gx + 3, y0 + dh * 0.66, 12, 12);
            x += 26 - 0;
          }
        }
        c.globalAlpha = sa * 0.8;
        c.font = font(F.mono(500), 20); (c as any).letterSpacing = '5px'; c.fillStyle = 'rgba(238,233,223,0.8)'; c.textAlign = 'left';
        c.fillText('NIGHT SHIFT', 24, 32); c.textAlign = 'right'; c.fillText('LOT 7A-0042', UW - 24, 32);
        c.restore();
      }
    }
    comp.draw(renderer, this.text.upload(), this.tmp);
  }

  override dispose() { this.shade.dispose(); this.tmp.dispose(); this.dieTex.dispose(); }
}
