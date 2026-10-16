// W9 THE DIE CITY (node2 bars 40-42, 75.0-78.75, "low sun"; dream bars 52-54, 97.5-101.25, "night"): one GPU die
// modelled as a city, hand-built and shaded as a scanning-electron micrograph (engine/se.ts).
//
//  Model (world unit = mm; the die is 30.4 x 34.2, the package 62 x 53):
//   - 132 SM districts (12 columns x 11 rows): each a block of its own height with a recessed roof panel, groove-cut
//     sub-blocks and raised cores; the streets between them are the NoC boulevards, with amber traffic running on lanes
//     (the central boulevard has three). 6 rows north of the SRAM lake (L2) and 5 south of it.
//   - the L2 lake: a basin across the middle with a rippling floor and a grid of SRAM islets.
//   - six HBM PHY harbours on the east and west shores (basin, comb of PHY piers), facing the six HBM stacks.
//   - power-grid pillars (collar + cap) and bump lamp-posts (pole + head) on the street corners and the die rim.
//   - the package: interposer with routing ridges, six laminated HBM stacks, the organic substrate (lid-seat groove,
//     corner chamfer, SMD capacitors).
//  Entry `node2` (params {}): low-sun fly-over, then to one SM, where five interconnect pillars (pearl-tipped, joined
//    by a band and staples) rise on "crown" into a crown silhouette.
//  Entry `dream` (params { night: true }): SMs light in travelling attention diagonals on "every", "model", "dreaming";
//    the camera rises to the package on "on a chip"; the $30,000 tag drops on its thread on "never" and is yanked on
//    "own"; the last 0.6 s the camera returns straight down and only the SMs of a shield-shaped region stay lit
//    (flat amber windows) = the wafer map `crack` opens on.
//  in : node2 follows drop2 (hard cut); dream follows atom's defocused lattice (top-down, hazy grid of districts).
//  out: node2 ends on the crown silhouette, side-on, pillars centred (grid2 starts with its horizontal busbar);
//       dream ends top-down, shield-shaped lit SMs on ink.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, lerp, smoothstep, clamp, ease, prog } from '../engine/util';
import { lineByScene } from './_motifs';
import { DIE as CDIE, O_W, shieldDies } from './crack-kit';
import { stubX } from './node2';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam, type V3 } from '../engine/se';
import { rgba } from '../engine/palette';

// ------------------------------------------------------------------------------------------------ constants
const PX = 2.2, PZ = 2.6, LAKEH = 1.5, STW = 0.17, ZC = -1.3;
const CROWN: V3 = [5.5, 0, -(LAKEH + 3.5 * PZ)];       // SM column 8, north row 3
const HTS = [3.5, 4.2, 5.0, 4.2, 3.5];
const f1 = (x: number) => x.toFixed(4);

// ------------------------------------------------------------------------------------------------ camera paths
// [t, elevation deg, azimuth deg, px per mm, target x, y, z]
const CAM_DAY: number[][] = [
  [75.00, 34, 14, 15, 0, -1.0, -2],
  [75.60, 27, 9, 25, 1, 0, -6],
  [76.20, 18, -3, 44, 4, 0.3, -9],
  [76.70, 11, -5, 62, 5.5, 0.9, -10.4],
  [77.30, 7, -3, 92, 5.5, 2.3, -10.6],
  [78.20, 4, 0, 98, 5.5, 2.4, -10.6],
  [78.75, 3.5, 0, 104, 5.5, 2.4, -10.6],
  [79.0, 3.5, 0, 106, 5.5, 2.4, -10.6],
];
const CAM_NIGHT: number[][] = [
  [97.50, 90, 0, 21, 0, 0, -1.3],
  [97.90, 80, -2, 21.5, 0, 0, -1.6],
  [98.45, 58, -10, 23, 0, 0, -2],
  [98.91, 52, -8, 22, 0, -0.4, -2],
  [99.38, 55, 3, 16.5, 0, -1.0, -1.5],
  [100.30, 54, -4, 17.5, 0, -1.0, -1.5],
  [100.70, 62, -2, 15.5, 0, -0.6, -1.4],
  [101.00, 90, 0, 24, 0, 0, -1.3],
  [101.25, 90, 0, 24, 0, 0, -1.3],
  [101.5, 90, 0, 24, 0, 0, -1.3],
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
function camAt(K: number[][], t: number, kick = 0): SECam {
  const punch = 1 + 0.008 * kick;
  return seCamera([hermite(K, 4, t), hermite(K, 5, t), hermite(K, 6, t)], hermite(K, 2, t), hermite(K, 1, t), hermite(K, 3, t) * punch);
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const worldGLSL = (night: boolean) => /* glsl */ `
uniform float uT, uNight, uShield, uWin, uBand, uGlow;
uniform float uCr[5];
uniform float uWT[3];
#define SE_SHADOW ${night ? '0.5' : '0.95'}
#define SE_STEPS 88
#define SE_SHADOW_STEPS 6
const float PX = ${f1(PX)}, PZ = ${f1(PZ)}, LAKEH = ${f1(LAKEH)}, STW = ${f1(STW)}, ZC = ${f1(ZC)};
const float BX = ${f1(PX / 2 - STW)}, BZ = ${f1(PZ / 2 - STW)};
const vec3 CROWN = vec3(${f1(CROWN[0])}, 0.0, ${f1(CROWN[2])});
const float HTS[5] = float[5](${HTS.map(f1).join(', ')});
const vec2 WD[3] = vec2[3](vec2(0.7071, 0.7071), vec2(0.7071, -0.7071), vec2(0.4472, 0.8944));

// one SM district: (column 0..11, row 0..10 from the north edge), local coords q (mm from the district centre)
bool smCell(vec2 xz, out vec2 q, out vec2 ij) {
  q = vec2(0.0); ij = vec2(0.0);
  float i = floor(xz.x / PX + 6.0);
  float az = abs(xz.y);
  if (i < 0.0 || i > 11.0 || az < LAKEH) return false;
  float k = floor((az - LAKEH) / PZ);
  bool up = xz.y < 0.0;
  if (k > (up ? 5.0 : 4.0)) return false;
  float zc = (up ? -1.0 : 1.0) * (LAKEH + (k + 0.5) * PZ);
  q = vec2(xz.x - (i - 5.5) * PX, xz.y - zc);
  ij = vec2(i, up ? 5.0 - k : 6.0 + k);
  return true;
}
float blockH(vec2 ij) { return 0.42 + 0.5 * hash12(ij + 3.1); }

float shieldHW(float v) { return v <= 0.4 ? 1.0 : pow(max(0.0, 1.0 - pow((v - 0.4) / 0.6, 1.75)), 0.62); }
/** how lit a district is, 0..1: attention diagonals (flash at the front, striped wake), then the shield region */
float smLight(vec2 ij) {
  float L = 0.0, g = 0.0;
  vec2 u = vec2((ij.x - 5.5) / 5.5, (ij.y - 5.0) / 5.0);
  for (int n = 0; n < 3; n++) {
    float pr = dot(u, WD[n]);
    float a = uWT[n] + 0.66 * (pr + 1.45) / 2.9;
    float dt = uT - a;
    if (dt > 0.0) {
      L = max(L, exp(-dt / 0.24));
      g = max(g, 0.09 + 0.15 * step(0.5, fract(pr * 2.5 + float(n) * 0.37)));
    }
  }
  L = max(L, g);
  float sh = abs(u.x) <= shieldHW((ij.y + 0.5) / 11.0) + 0.04 ? 1.0 : 0.0;
  return mix(L, sh, uShield);
}

vec2 blockD(vec3 pl, vec2 ij) {
  float h = blockH(ij);
  float d = seRoundBox(vec3(pl.x, pl.y - h * 0.5, pl.z), vec3(BX, h * 0.5, BZ), 0.05);
  if (pl.y > h - 0.24) {
    float din = seRoundBox2(pl.xz, vec2(BX - 0.1, BZ - 0.1), 0.04);
    d = max(d, -max(din, (h - 0.035) - pl.y));                                           // recessed roof panel
    float gx = abs(seRep(pl.x, 0.62)) - 0.014, gz = abs(pl.z) - 0.014;
    d = max(d, -max(min(gx, gz), (h - 0.075) - pl.y));                                    // grooves between sub-blocks
    vec2 sid = vec2(seRepId(pl.x, 0.62), pl.z < 0.0 ? 0.0 : 1.0);
    float hs = hash12(ij * 5.1 + sid * 1.37);
    if (hs > 0.45) {                                                                     // raised cores
      float dc = seRoundBox(vec3(seRep(pl.x, 0.62), pl.y - (h - 0.035 + 0.03), pl.z - (pl.z < 0.0 ? -0.55 : 0.55)), vec3(0.16, 0.035, 0.26), 0.015);
      d = min(d, dc);
    }
  }
  return vec2(d, pl.y > h - 0.1 ? SE_METAL : SE_SILICON);
}

/** power pillars and bump lamp-posts on the street corners (and the die rim) */
vec2 postsD(vec3 p) {
  float ix = clamp(floor(p.x / PX + 0.5), -6.0, 6.0);
  float sg = p.z < 0.0 ? -1.0 : 1.0;
  float kk = clamp(floor((abs(p.z) - LAKEH) / PZ + 0.5), 0.0, sg < 0.0 ? 6.0 : 5.0);
  float zl = sg * (LAKEH + kk * PZ);
  vec2 q = vec2(p.x - ix * PX, p.z - zl);
  float h = hash12(vec2(ix + 9.0, kk + sg * 17.0));
  if (kk < 0.5) return vec2(1.0e5, 8.0);
  if (h < 0.2) {
    float d = seCylY(vec3(q.x, p.y - 0.78, q.y), 0.075, 0.78);
    d = min(d, seCylY(vec3(q.x, p.y - 1.5, q.y), 0.15, 0.04));
    d = min(d, seCylY(vec3(q.x, p.y - 0.05, q.y), 0.13, 0.05));
    return vec2(d, 8.0);
  }
  if (h < 0.62) {
    float d = seCapsuleY(vec3(q.x, p.y, q.y), 0.42, 0.028);
    d = min(d, length(vec3(q.x, p.y - 0.5, q.y)) - 0.075);
    return vec2(d, 8.0);
  }
  return vec2(1.0e5, 8.0);
}

vec2 dieD(vec3 p) {
  vec2 res = vec2(seRoundBox(vec3(p.x, p.y + 0.4, p.z - ZC), vec3(15.2, 0.4, 17.1), 0.08), SE_SILICON);
  // the L2 lake: a basin with a rippling floor and a grid of SRAM islets
  float dL = seRoundBox2(p.xz, vec2(13.2, LAKEH), 0.3);
  if (dL < 0.6 && p.y < 0.3) {
    float fy = -0.32 + 0.012 * sin(p.x * 2.7 + uT * 0.7) * sin(p.z * 3.1);
    res.x = smax(res.x, -max(dL, p.y - fy), 0.05);
    float zq = p.z - 0.85 * clamp(floor(p.z / 0.85 + 0.5), -1.0, 1.0);
    float il = seRoundBox(vec3(seRep(p.x, 1.1), p.y + 0.25, zq), vec3(0.42, 0.11, 0.26), 0.04);
    il = max(il, dL + 0.3);
    res = seUnion(res, vec2(il, SE_SILICON));
  }
  // HBM PHY harbours on the east and west shores
  float zl = p.z - ZC, zq6 = zl - 10.5 * clamp(floor(zl / 10.5 + 0.5), -1.0, 1.0);
  if (abs(p.x) > 12.8 && p.y < 0.4) {
    float dB = seRoundBox2(vec2(abs(p.x) - 14.4, zq6), vec2(0.85, 4.0), 0.12);
    res.x = smax(res.x, -max(dB, -0.22 - p.y), 0.04);
    float zf = zq6 - 0.2 * clamp(floor(zq6 / 0.2 + 0.5), -19.0, 19.0);
    float dp = seRoundBox(vec3(abs(p.x) - 14.5, p.y + 0.12, zf), vec3(0.62, 0.1, 0.035), 0.012);
    dp = max(dp, dB + 0.1);
    res = seUnion(res, vec2(dp, SE_METAL));
  }
  if (p.y < 1.75) {
    vec2 q, ij;
    if (smCell(p.xz, q, ij)) {
      vec2 b = blockD(vec3(q.x, p.y, q.y), ij);
      b.x *= 0.85;
      res = seUnion(res, b);
    } else {
      float gap = (abs(p.x) < 13.2 && abs(p.z) < LAKEH) ? LAKEH - abs(p.z) : max(seRoundBox2(p.xz - vec2(0.0, -1.3), vec2(13.2, 15.8), 0.0), 0.0);
      res.x = min(res.x, max(gap, 0.03));
    }
    vec2 po = postsD(p);
    if (po.x < res.x) res = vec2(po.x * 0.9, 8.0);
  } else res.x = min(res.x, max(p.y - 1.65, 0.12));
  return res;
}

vec2 packageD(vec3 p) {
  vec3 pz = vec3(p.x, p.y, p.z - ZC);
  // organic substrate: chamfered corner, lid-seat groove, SMD capacitors on the long edges
  float ds = seRoundBox(vec3(pz.x, pz.y + 1.9, pz.z), vec3(31.0, 0.6, 26.5), 0.15);
  ds = max(ds, ((-pz.x + pz.z) - (31.0 + 26.5 - 3.4)) * 0.7071);
  float ring = abs(seRoundBox2(pz.xz, vec2(28.4, 23.9), 0.8)) - 0.05;
  ds = max(ds, -max(ring, -1.36 - p.y));
  vec2 res = vec2(ds, SE_OXIDE);
  float c1 = seRoundBox(vec3(seRep(pz.x, 1.5), p.y + 1.22, abs(pz.z) - 25.2), vec3(0.32, 0.08, 0.16), 0.03);
  c1 = max(c1, abs(pz.x) - 27.0);
  float c2 = seRoundBox(vec3(abs(pz.x) - 29.9, p.y + 1.22, seRep(pz.z, 1.5)), vec3(0.16, 0.08, 0.32), 0.03);
  c2 = max(c2, abs(pz.z) - 22.5);
  res = seUnion(res, vec2(min(c1, c2), SE_METAL));
  // interposer with routing ridges between the die and the HBM stacks
  float di = seRoundBox(vec3(pz.x, pz.y + 1.05, pz.z), vec3(26.5, 0.25, 21.5), 0.08);
  float zr = pz.z - 0.14 * clamp(floor(pz.z / 0.14 + 0.5), -100.0, 100.0);
  float rd = seRoundBox(vec3(abs(pz.x) - 15.9, p.y + 0.79, zr), vec3(0.65, 0.012, 0.02), 0.005);
  rd = max(rd, abs(pz.z) - 14.8);
  res = seUnion(res, vec2(min(di, rd), SE_SILICON));
  // six HBM stacks: laminated dies
  float zq = pz.z - 10.5 * clamp(floor(pz.z / 10.5 + 0.5), -1.0, 1.0);
  float ph = fract((p.y + 0.75) / 0.2);
  float inset = 0.09 * smoothstep(0.80, 0.98, abs(ph - 0.5) * 2.0) * step(-0.75, p.y) * step(p.y, 0.25);
  float dh = seRoundBox(vec3(abs(pz.x) - 19.7, p.y + 0.225, zq), vec3(3.2 - inset, 0.575, 4.3 - inset), 0.03) * 0.85;
  res = seUnion(res, vec2(dh, SE_SILICON));
  return res;
}

/** the crown: five pearl-tipped interconnect pillars, a band and staples */
vec2 crownD(vec3 p) {
  vec3 q = p - CROWN;
  if (length(q) > 8.0) return vec2(length(q) - 7.0, 7.0);
  float d = 1.0e5;
  for (int i = 0; i < 5; i++) {
    float g = uCr[i];
    if (g < 0.01) continue;
    float H = HTS[i] * g, xo = (float(i) - 2.0) * 0.36;
    vec3 r = q - vec3(xo, 0.0, 0.0);
    d = min(d, seCapsuleY(r, H, 0.115));
    d = min(d, length(r - vec3(0.0, H + 0.04, 0.0)) - 0.17 * smoothstep(0.85, 1.0, g));
  }
  float bw = 0.64 * uBand;
  if (bw > 0.01) {
    d = min(d, seRoundBox(q - vec3(0.0, 1.65, 0.0), vec3(bw, 0.07, 0.1), 0.03));
    for (int k = 0; k < 4; k++) {
      float xm = (float(k) - 1.5) * 0.36, yy = (k & 1) == 0 ? 2.35 : 3.05;
      d = min(d, seRoundBox(q - vec3(xm, yy, 0.0), vec3(0.15, 0.035, 0.05), 0.012) + (1.0 - uBand) * 0.2);
    }
  }
  return vec2(d, 7.0);
}

vec2 map(vec3 p) {
  vec2 res = packageD(p);
  res = seUnion(res, dieD(p));
  if (uBand > 0.0 || uCr[2] > 0.0) res = seUnion(res, crownD(p));
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-45.0, -3.2, -40.0), hi = vec3(45.0, 7.0, 36.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  float Z = id < 6.5 ? seMatZ(id) : (id < 7.5 ? 1.0 : 0.7);
  if (id < 0.5 && p.y < -0.2 && abs(p.z) < 1.7 && abs(p.x) < 13.5) Z *= 0.45;     // the lake floor, dark water
  Z *= mix(1.0, 0.55, uNight);
  bool roof = id > 0.5 && id < 1.5 && n.y > 0.7 && p.y > 0.3;
  return roof ? Z : Z * (1.0 - 0.93 * uWin);
}

float traffic(vec2 xz) {
  vec2 q, ij;
  if (!smCell(xz, q, ij)) return 0.0;
  float a = 0.0;
  // x-streets (between rows)
  float cl = abs(abs(q.y) - PZ * 0.5);
  float bid = ij.y + (q.y > 0.0 ? 0.5 : -0.5);
  float dir = hash12(vec2(bid, 3.3)) > 0.5 ? 1.0 : -1.0;
  float f = fract((xz.x * dir - uT * 1.7) / 0.9 + hash12(vec2(bid, 7.7)));
  float on = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.22, 0.27, f));
  a = max(a, on * (1.0 - smoothstep(0.02, 0.036, cl)));
  // y-streets (between columns); the central boulevard has three lanes
  float bid2 = ij.x + (q.x > 0.0 ? 0.5 : -0.5);
  if (abs(bid2 - 5.5) < 0.1) {
    for (int l = 0; l < 3; l++) {
      float L = (float(l) - 1.0) * 0.09, dr = l == 1 ? -1.0 : 1.0;
      float f2 = fract((xz.y * dr - uT * 2.1) / 0.8 + 0.31 * float(l));
      float on2 = smoothstep(0.0, 0.05, f2) * (1.0 - smoothstep(0.30, 0.35, f2));
      a = max(a, on2 * (1.0 - smoothstep(0.016, 0.03, abs(xz.x - L))));
    }
  } else {
    float cl2 = abs(abs(q.x) - PX * 0.5);
    float dir2 = hash12(vec2(bid2, 9.1)) > 0.5 ? 1.0 : -1.0;
    float f2 = fract((xz.y * dir2 - uT * 1.7) / 0.9 + hash12(vec2(bid2, 1.9)));
    float on2 = smoothstep(0.0, 0.05, f2) * (1.0 - smoothstep(0.22, 0.27, f2));
    a = max(a, on2 * (1.0 - smoothstep(0.02, 0.036, cl2)));
  }
  return a * (0.85 - 0.25 * uNight);
}

float roofLight(vec3 p) {
  vec2 q, ij;
  if (!smCell(p.xz, q, ij)) return 0.0;
  float L = smLight(ij);
  if (L < 0.01) return 0.0;
  vec2 wq = q / 0.155;
  vec2 wc = floor(wq), wf = fract(wq) - 0.5;
  float hs = hash12(ij * 7.3 + wc * 1.31 + 0.5);
  float win = step(hs, clamp(L * 1.25, 0.0, 1.0)) * step(abs(wf.x), 0.36) * step(abs(wf.y), 0.36);
  float inner = step(abs(q.x), BX - 0.12) * step(abs(q.y), BZ - 0.12);
  float gr = step(0.035, abs(seRep(q.x, 0.62))) * step(0.035, abs(q.y));
  return win * inner * gr * (0.5 + 0.49 * clamp(L * 1.4, 0.0, 1.0));
}

float matAmber(float id, vec3 p, vec3 n) {
  float a = 0.0;
  if (id < 0.5) { if (n.y > 0.8 && p.y > -0.06 && p.y < 0.06) a = traffic(p.xz); }
  else if (id < 1.5) { if (n.y > 0.7 && p.y > 0.3) a = roofLight(p); }
  else if (id > 6.5 && id < 7.5) {
    float tip = smoothstep(2.6, 4.7, p.y);
    float band = (1.0 - smoothstep(0.06, 0.1, abs(p.y - 1.65))) * 0.5;
    a = uGlow * (0.14 + 0.85 * tip + band);
  } else if (id > 7.5 && id < 8.5) {
    if (p.y > 0.44 && p.y < 0.62) a = 0.55 + 0.35 * uNight;
  }
  return clamp(a, 0.0, 0.99);
}
`;

const SHADE = /* glsl */ `
vec2 sePattern(float id, vec3 p, vec3 n, float fw) { return vec2(1.0, 0.0); }`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W9DieCity extends Scene {
  override seGrade = 0;
  night = false;
  shade!: SEShade;
  text = new Layer2D();
  strip = new SEStrip();
  line: any;
  private uni!: Record<string, THREE.IUniform>;

  override init() {
    this.night = !!this.ctx.params.night;
    this.line = lineByScene(this.ctx.lyrics, this.night ? 'dream' : 'crown2');
    const v = (x: number) => ({ value: x });
    const ws = this.night ? this.line.words : null;
    this.uni = {
      uT: v(0), uNight: v(this.night ? 1 : 0), uShield: v(0), uWin: v(0), uBand: v(0), uGlow: v(0),
      uCr: { value: [0, 0, 0, 0, 0] },
      uWT: { value: ws ? [ws[0].start, ws[1].start, ws[2].start] : [999, 999, 999] },
    };
    this.shade = new SEShade({ mapGLSL: worldGLSL(this.night), shadeGLSL: SHADE, uniforms: this.uni, cavL: 0.5 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick, u = this.uni, night = this.night;
    const K = night ? CAM_NIGHT : CAM_DAY;
    u.uT!.value = t;
    if (night) {
      u.uShield!.value = 0;
      u.uWin!.value = 0;
    } else {
      const cw = this.line.words.find((w: any) => /crown/i.test(w.w));
      const c0 = cw ? cw.start : 76.88;
      u.uCr!.value = [2, 1, 0, 1, 2].map((d) => ease.outBack(prog(t, c0 + 0.07 * d, c0 + 0.07 * d + 0.42), 1.5));
      u.uBand!.value = ease.outCubic(prog(t, c0 + 0.3, c0 + 0.75));
      u.uGlow!.value = smoothstep(c0 + 0.2, c0 + 0.9, t);
    }
    const cam = camAt(K, t, kick);
    const a = camAt(K, t - 1 / 30), b = camAt(K, t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / 40 + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.18 + sp, 0, 1);
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, dim: 0.4, rim: 0.95, focus: cam.dist * 0.7, hazeL: 90, zHaze: night ? 0.45 : 0.38,
    });

    // ---- overlays: signs, tags, the lyric, the data strip
    const c = this.text.ctx;
    this.text.clear();
    const T = f.start;
    if (night) {
      const a1 = smoothstep(97.55, 97.8, t) * (1 - smoothstep(98.55, 98.85, t));
      this.sign(c, cam, [-5.5, -0.3, 0], 'L2 CACHE (LAKE)', -150, 70, a1);
      this.sign(c, cam, [0, 0.05, -7.8], 'NoC BOULEVARD', 120, -60, a1 * smoothstep(97.7, 97.95, t));
      this.packageTag(c, cam, smoothstep(99.15, 99.5, t) * (1 - smoothstep(100.45, 100.75, t)));
      this.priceTag(c, t);
    } else {
      const a1 = smoothstep(T + 0.05, T + 0.3, t) * (1 - smoothstep(76.0, 76.35, t));
      this.sign(c, cam, [-5.5, -0.3, 0], 'L2 CACHE (LAKE)', -170, -80, a1);
      this.sign(c, cam, [0, 0.05, -7.8], 'NoC BOULEVARD', 130, -70, a1 * smoothstep(T + 0.2, T + 0.45, t));
      this.sign(c, cam, [CROWN[0], 0.1, CROWN[2]], 'SM 073', 150, 110, smoothstep(76.35, 76.6, t) * (1 - smoothstep(76.95, 77.2, t)));
    }
    this.drawLyric(c, t, 1 - smoothstep(night ? 100.7 : 78.4, night ? 101.0 : 78.6, t));
    // ---- hand-offs: ink-out plus the next plate's first frame
    const ink = night ? smoothstep(100.75, 101.15, t) : smoothstep(78.45, 78.72, t);
    if (ink > 0.01) {
      c.save(); c.globalAlpha = ink; c.fillStyle = '#0A0A0B'; c.fillRect(0, 0, W, H); c.restore();
      if (night) this.shieldMap(c, smoothstep(100.85, 101.2, t));
      else this.busbar(c, smoothstep(78.5, 78.7, t));
    }
    comp.draw(renderer, this.text.upload(), out);
    this.strip.composite(renderer, comp, out, { ppm: H / 2 / (cam.dist * cam.tanY), alpha: 1 - ink });
    return sePost({ ca: 2.5 * kick });
  }


  /** thin etched lyric in clear space (top left), amber while sung, then bone */
  private drawLyric(c: CanvasRenderingContext2D, t: number, alpha: number) {
    if (alpha <= 0.01) return;
    const ws = this.line.words;
    c.save(); c.globalAlpha = alpha;
    c.font = font(F.archivo(112, 300), 34); c.textBaseline = 'alphabetic'; (c as any).letterSpacing = '5px';
    const gap = 22, X0 = 116, Y = 112;
    let tw = 0; const xs: number[] = [];
    for (const w of ws) { xs.push(X0 + tw); tw += c.measureText(w.w.toUpperCase()).width + gap; }
    c.fillStyle = 'rgba(10,10,11,0.72)'; c.fillRect(X0 - 24, Y - 50, tw + 40, 74);
    c.fillStyle = 'rgba(238,233,223,0.55)'; c.fillRect(X0 - 24, Y + 24, tw + 40, 1);
    ws.forEach((w: any, i: number) => {
      const ap = smoothstep(w.start - 0.3, w.start, t);
      if (ap <= 0) return;
      const k = Math.exp(-Math.max(t - w.start, 0) / 0.3) * (t >= w.start ? 1 : 0);
      c.fillStyle = `rgba(${Math.round(lerp(238, 255, k))},${Math.round(lerp(233, 164, k))},${Math.round(lerp(223, 27, k))},${(t >= w.start ? 0.95 : 0.3) * ap})`;
      c.fillText(w.w.toUpperCase(), xs[i]!, Y);
    });
    c.restore();
  }

  /** crack's first frame: the shield wafer map at its die pitch (104 x 70, centre 960,540), SM windows lit, the stress spark */
  private shieldMap(c: CanvasRenderingContext2D, a: number) {
    if (a <= 0.01) return;
    c.save(); c.globalAlpha = a;
    for (const d of shieldDies()) {
      const x0 = 960 + d.x - CDIE.w / 2, y0 = 540 + d.y - CDIE.h / 2;
      c.strokeStyle = 'rgba(255,164,27,0.32)'; c.lineWidth = 1.2; c.strokeRect(x0 + 3, y0 + 3, CDIE.w - 6, CDIE.h - 6);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const fr = Math.sin(d.x * 12.9 + d.y * 78.2 + i * 3.1 + j * 7.7) * 43758.5, on = 0.55 + 0.45 * (fr - Math.floor(fr));
        c.fillStyle = `rgba(255,164,27,${0.9 * Math.min(1, on)})`;
        c.fillRect(x0 + 14 + i * 10 + 1.5, y0 + 11 + j * 10 + 1.5, 7, 7);
      }
    }
    c.fillStyle = 'rgba(255,200,120,1)'; c.beginPath(); c.arc(960 + O_W.x, 540 + O_W.y, 4, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /** grid2's first frame: the amber busbar across the frame with node2's feeder stubs, on its drawing frame */
  private busbar(c: CanvasRenderingContext2D, a: number) {
    if (a <= 0.01) return;
    c.save(); c.globalAlpha = a;
    c.strokeStyle = 'rgba(238,233,223,0.35)'; c.lineWidth = 1.5; c.strokeRect(60, 60, W - 120, H - 120);
    c.strokeStyle = 'rgba(238,233,223,0.2)'; c.strokeRect(70, 70, W - 140, H - 140);
    c.strokeStyle = '#FFA41B'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 540); c.lineTo(W, 540); c.stroke();
    for (const side of [1, -1]) for (let k = 0; k < 10; k++) {
      const x = stubX(side, k), sg = k % 2 ? 1 : -1;
      c.beginPath(); c.moveTo(x, 540); c.lineTo(x, 540 + sg * 34); c.stroke();
    }
    c.restore();
  }

  private sign(c: CanvasRenderingContext2D, cam: SECam, wp: V3, text: string, dx: number, dy: number, alpha: number) {
    if (alpha <= 0.01) return;
    const p = seProject(cam, wp);
    if (p.z <= 0 || p.x < 40 || p.x > W - 40 || p.y < 40 || p.y > H - 120) return;
    const ex = p.x + dx, ey = p.y + dy;
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = 'rgba(238,233,223,0.6)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(ex, ey); c.lineTo(ex + (dx < 0 ? -1 : 1) * 250, ey); c.stroke();
    c.fillStyle = 'rgba(238,233,223,0.95)'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
    c.font = font(F.mono(500), 19); c.textBaseline = 'alphabetic'; (c as any).letterSpacing = '2px';
    c.textAlign = dx < 0 ? 'right' : 'left';
    c.fillText(text, ex + (dx < 0 ? -1 : 1) * 244, ey - 8);
    c.restore();
  }

  /** `NOT FOR SALE TO: YOU`, tied to the substrate corner */
  private packageTag(c: CanvasRenderingContext2D, cam: SECam, alpha: number) {
    if (alpha <= 0.01) return;
    const p = seProject(cam, [25.5, -1.3, ZC + 23.5]);
    const tx = Math.min(W - 230, p.x + 120), ty = Math.min(H - 150, p.y + 90);
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = 'rgba(238,233,223,0.7)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + 30, p.y + 60, tx - 150, ty - 6); c.stroke();
    c.fillStyle = 'rgba(238,233,223,0.95)'; c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
    c.translate(tx, ty); c.rotate(-0.04);
    const w = 330, h = 52;
    c.beginPath();
    c.moveTo(-w / 2 + 16, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2 + 16, h / 2); c.lineTo(-w / 2, h / 2 - 16); c.lineTo(-w / 2, -h / 2 + 16); c.closePath();
    c.fillStyle = 'rgba(238,233,223,0.95)'; c.fill();
    c.fillStyle = 'rgba(10,10,11,1)'; c.beginPath(); c.arc(-w / 2 + 20, 0, 4.5, 0, Math.PI * 2); c.fill();
    c.font = font(F.mono(600), 19); c.textBaseline = 'middle'; (c as any).letterSpacing = '1.5px';
    c.fillText('NOT FOR SALE TO: YOU', -w / 2 + 38, 1);
    c.restore();
  }

  /** The $30,000 price tag: dangles in on "never", is yanked away on "own". */
  private priceTag(c: CanvasRenderingContext2D, t: number) {
    const ws = this.line.words;
    const never = ws.find((w: any) => /never/i.test(w.w)), own = ws.find((w: any) => /own/i.test(w.w));
    if (!never || !own) return;
    const tin = ease.outBack(prog(t, never.start - 0.15, never.start + 0.5), 1.2);
    const slip = ease.inBack(prog(t, own.start, own.start + 0.6), 1.9);
    if (tin <= 0 || slip >= 1) return;
    const ax = 1560, ay = lerp(-260, 70, tin) - 900 * slip;
    const sway = 0.14 * Math.sin((t - never.start) * 3.1) * (1 - prog(t, never.start, own.start)) + 0.6 * slip * (1 - slip);
    const L = 190;
    c.save();
    c.translate(ax, ay); c.rotate(sway);
    c.strokeStyle = rgba('bone', 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, -600); c.lineTo(0, L); c.stroke();
    c.translate(0, L);
    const w = 236, h = 150;
    c.beginPath();
    c.moveTo(-w / 2 + 22, -h / 2); c.lineTo(w / 2 - 22, -h / 2); c.lineTo(w / 2, -h / 2 + 22); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.lineTo(-w / 2, -h / 2 + 22); c.closePath();
    c.fillStyle = rgba('bone', 0.94); c.fill();
    c.strokeStyle = rgba('ink', 1); c.lineWidth = 1.2;
    c.beginPath(); c.arc(0, -h / 2 + 18, 6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = rgba('ink', 1);
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(600), 12); (c as any).letterSpacing = '2px';
    c.fillText('TITLE · 1 ACCELERATOR', -w / 2 + 18, -h / 2 + 48);
    c.font = font(F.mono(500), 11); (c as any).letterSpacing = '1px';
    c.fillText('OWNER', -w / 2 + 18, -h / 2 + 72); c.fillText('——', -w / 2 + 84, -h / 2 + 72);
    c.fillText('STATUS', -w / 2 + 18, -h / 2 + 90); c.fillText('LEASED', -w / 2 + 84, -h / 2 + 90);
    c.font = font(F.archivo(100, 800), 38); (c as any).letterSpacing = '0px';
    c.fillText('$30,000', -w / 2 + 18, h / 2 - 16);
    for (let i = 0; i < 18; i++) c.fillRect(w / 2 - 74 + i * 3.4, h / 2 - 40, 1 + (i * 7 % 3) * 0.7, 24);
    c.restore();
  }

  override dispose() { this.shade.dispose(); }
}
