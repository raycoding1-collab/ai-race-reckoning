// W5 THE CORNFIELD ("Gigawatts in a cornfield town": grid1 33.75-37.5, grid2 78.75-82.5, grid3 123.75-127.5): a chip die
// and a farm are the same picture. One shared SE-look SDF world (engine/se.ts), three choruses ({ n: 1 | 2 | 3 }).
//
//  Model (world unit = 1 m):
//   - a night field of instanced corn (cell-repeated stalks, six arching leaves each, perfect SE edges up close, a ridged
//     canopy far away), rows 0.9 m apart; GIGAWATTS / IN A CORNFIELD TOWN are rows of lit crop (a text mask sampled by the leaves).
//   - a datacentre shed whose footprint is the crown (union of the very cells of node1/node3's last frame), flat roof with
//     one lamp per crown cell, louvred walls, a double row of chillers with fans, five halls (the crown's five teeth).
//   - a lattice transmission corridor (tower every 90 m, catenary conductors) whose beam pulses ride the 8ths, a village
//     of lit windows (the town), a grain silo (callback to sand), and the field-edge sign.
//   - C2 moves the same picture inside the hall: racks are crop rows (6 rows, 0.75 m pitch), an overhead busbar with a
//     breaker that clicks shut on every beat; the lyric is lit on the far wall. C3 overloads: arcs along the lines, stalks
//     rim-lit, halls burn toward white.
//  Lyric to geometry: "Gigawatts" 0.00 GI-GA-WATTS rows light; "in a" the camera rises; "cornfield" through the leaves;
//  "town" the five halls light on the 16ths, site meter to 1.2 GW (C1: field-edge sign `POPULATION 1,900  LOAD 1.2 GW (ONE REACTOR)`).
//  in : C1 node1's last frame: cells 48 px apart, one amber lamp per crown cell (here the roof lamps, top-down, 16 px/m on the
//       roof plane), shrinking to town lights. C3: node3's tile crown (96 x 108 px tiles). C2: w9's busbar frame (ink, inset
//       frame, amber busbar at y = 540 with feeder stubs), drawn here for the first 0.3 s and dissolving into the hall.
//  out: C1: everything dims except one conductor, which straightens into the ring where down1's racing line starts.
//       C2: the site meter pushes in to down2's speedometer pose. C3: the halls burn to white, bone paper (as before).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, hash, lerp, smoothstep, clamp, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { SEShade, seCamera, seProject, sePost, type SECam, type V3 } from '../engine/se';
import { crownCells } from './node1-crown';
import { crownAt } from './node3-kit';
import { C, rgbaS, drawDial } from './node2-kit';
import { stubX } from './node2';
import { DASH, GRID2_END_FRAC } from './down2-dash';
import type { Word } from '../engine/lyrics';

const BEAT = 60 / 128;
const T0S = [33.75, 78.75, 123.75];
const DUR = 3.75;
const GRID2_DIAL = { x: 1480, y: 270, R: 170 };
const RING = { x: 100, y: 706 };                 // down1's first-frame ring (where its racing line starts)
const HALL_T = [1.875, 1.992, 2.109, 2.226, 2.343];   // "town" + 16ths
const TXW = 2048, TXH = 1024, TXR = 768;          // text canvas: field/wall region (top 768 px) + sign strip (bottom 256 px)
const f1 = (x: number) => x.toFixed(4);

// ------------------------------------------------------------------------------------------------ cameras
type Key = [number, number, number, number, number, number, number];   // r, tx, ty, tz, az, el, ppm
const K_FIELD: Key[] = [
  [0.00, 0, 8, 0, 0, 90, 16],
  [0.50, 0, 5, 22, 0, 68, 7.5],
  [1.00, 0, 4, 48, 3, 50, 4.8],
  [1.28, 0, 3, 58, 0, 26, 14],
  [1.50, 2, 1.35, 62, 0, 3, 220],
  [1.80, 4, 1.3, 52, -6, 2, 230],
  [2.20, 0, 8, 10, 6, 24, 14],
  [2.90, -12, 5, 60, 8, 13, 26],
  [3.30, -15, 5, 63, 5, 12, 28],
  [3.75, -16, 5, 64, 4, 11, 29],
];
function fieldCam(r: number, mirror: boolean): SECam {
  const K = K_FIELD;
  r = clamp(r, 0, DUR);
  let i = 0;
  while (i < K.length - 2 && r > K[i + 1]![0]) i++;
  const a = K[i]!, b = K[i + 1]!;
  const dt = b[0] - a[0], u = (r - a[0]) / dt;
  const val = (k: Key) => [k[1], k[2], k[3], k[4], k[5], Math.log(k[6])];
  const va = val(a), vb = val(b);
  const tan = (j: number) => {
    const p = K[j - 1] ?? K[j]!, n = K[j + 1] ?? K[j]!;
    const vp = val(p), vn = val(n), v = val(K[j]!);
    const span = Math.max(1e-6, n[0] - p[0]);
    return v.map((_, c) => ((vn[c]! - vp[c]!) / span));
  };
  const ta = tan(i), tb = tan(i + 1);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const o = va.map((_, c) => h00 * va[c]! + h10 * dt * ta[c]! + h01 * vb[c]! + h11 * dt * tb[c]!);
  const s = mirror ? -1 : 1;
  return seCamera([o[0]! * s, o[1]!, o[2]!], o[3]! * s, clamp(o[4]!, 1, 90), Math.exp(o[5]!));
}
function lookCam(pos: V3, tgt: V3, fovDeg = 28): SECam {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const f = sub(tgt, pos), dist = Math.hypot(...f), fwd = nrm(f);
  const right = nrm(crs(fwd, [0, 1, 0])), up = crs(right, fwd);
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  return { pos, fwd, right, up, tanX: (tanY * W) / H, tanY, fovY: (fovDeg * Math.PI) / 180, dist };
}
const HALL_X = 1000;
function hallCam(r: number): SECam {
  const z = 26 - 6.4 * r, sw = Math.sin(r * 1.7);
  return lookCam([HALL_X + 0.25 + 0.12 * sw, 1.8 + 0.05 * Math.sin(r * 2.3), z], [HALL_X + 0.0, 2.7, z - 26]);
}

// ------------------------------------------------------------------------------------------------ GLSL
const CRN = { x: 14, z: 12 };
const WORLD = /* glsl */ `
uniform float uT, uR, uVar, uLamp, uTown, uStorm, uSignOn, uHalfW, uGap;
uniform float uHallT[5];
uniform vec2 uPitch, uCen, uOrg, uDimN;
uniform vec4 uArcA[4], uArcB[4];
uniform sampler2D uCells, uTxt;
const float BEAT = ${f1(BEAT)};
const float HSH = 8.0;
const float HX = ${f1(HALL_X)};

float txtAt(vec2 cv) { return textureLod(uTxt, vec2(cv.x, 1.0 - cv.y), 0.0).a; }
vec4 cellAt(ivec2 ij) {
  ivec2 q = ij + ivec2(uOrg);
  if (q.x < 0 || q.y < 0 || q.x >= int(uDimN.x) || q.y >= int(uDimN.y)) return vec4(0.0);
  return texelFetch(uCells, q, 0);
}
float footD(vec2 p) {
  vec2 g = p / uPitch - uCen;
  ivec2 c0 = ivec2(floor(g + 0.5));
  float d = 1e5;
  vec2 hs = uPitch * 0.5 - vec2(uGap);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = c0 + ivec2(i, j);
    if (cellAt(c).x < 0.5) continue;
    vec2 q = abs(p - (vec2(c) + uCen) * uPitch) - hs;
    d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  return d;
}
float hallIdx(float x) { return clamp(floor((x / uHalfW + 1.0) * 2.5), 0.0, 4.0); }
float hallLit(float x) { float tt = uHallT[int(hallIdx(x))]; return smoothstep(tt, tt + 0.10, uT) * (0.0 + 1.0); }
float backOut(float x) { x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + 2.6 * x * x * x + 1.6 * x * x; }

// ---- corn
float plantD(vec3 p) {
  vec2 id = floor(p.xz / 0.9);
  float hs = hash12(id), h2 = hash12(id + 17.3);
  vec2 cc = (id + 0.5) * 0.9 + (vec2(hs, h2) - 0.5) * 0.12;
  vec3 q = vec3(p.x - cc.x, p.y, p.z - cc.y);
  float H = 2.05 + 0.4 * hs;
  float dcell = 0.45 - max(abs(p.x - (id.x + 0.5) * 0.9), abs(p.z - (id.y + 0.5) * 0.9));
  float bnd = max(length(q.xz) - 0.46, q.y - H - 0.1);
  if (bnd > 0.2) return min(bnd, dcell + 0.03);
  float dS = max(length(q.xz) - (0.05 - 0.015 * q.y / H), q.y - H);
  float dl = 1e5;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float ang = fk * 2.399 + hs * 6.2832;
    float y0 = (0.32 + 0.30 * fk) * (H / 2.3);
    float L = 0.40 - 0.015 * fk;
    vec2 cs = vec2(cos(ang), sin(ang));
    float u = dot(q.xz, cs), w = dot(q.xz, vec2(-cs.y, cs.x));
    float uu = clamp(u, 0.0, L);
    float yc = y0 + 1.6 * uu - 3.2 * uu * uu;
    float sl = 1.6 - 6.4 * uu;
    float dv = (q.y - yc) * inversesqrt(1.0 + sl * sl);
    float x01 = uu / L;
    float hw = 0.085 * sqrt(4.0 * x01 * (1.0 - x01)) + 0.006;
    float dd = max(max(abs(dv) - 0.011, abs(w) - hw), max(-u, u - L));
    dl = min(dl, dd);
  }
  return min(min(dS, dl * 0.85), dcell + 0.03);
}
float canopyH(vec2 p, float dcam) { float k = 1.0 - smoothstep(35.0, 110.0, dcam); return 2.15 + k * (0.22 * cos(6.2832 * (p.y / 0.9 - 0.5)) + 0.08 * cos(6.2832 * (p.x / 0.9 - 0.5))); }
float cornD(vec3 p, float dcam) {
  if (p.y > 2.7) return p.y - 2.65;
  float dC = (p.y - canopyH(p.xz, dcam)) * 0.7;
  float w = smoothstep(22.0, 48.0, dcam);
  if (w > 0.999) return dC;
  float dP = plantD(p);
  return w < 0.001 ? dP : mix(dP, dC, w);
}

// ---- transmission tower (base at origin, x along the line, z across) and conductors
float towerD(vec3 q) {
  float y = q.y;
  float w = mix(2.4, 0.55, smoothstep(0.0, 24.0, y));
  vec2 a = abs(q.xz);
  float dleg = length(a - vec2(w)) - 0.16;
  float fr = max(abs(max(a.x, a.y) - w) - 0.07, abs(seRep(y - 2.0, 4.0)) - 0.07);
  float d = min(dleg, fr);
  d = max(d, max(-y, y - 27.5));
  d = min(d, seRoundBox(q - vec3(0.0, 20.5, 0.0), vec3(0.28, 0.24, 7.0), 0.05));
  d = min(d, seRoundBox(q - vec3(0.0, 24.2, 0.0), vec3(0.28, 0.24, 5.5), 0.05));
  d = min(d, seCapsuleY(q - vec3(0.0, 26.0, 0.0), 3.5, 0.12));
  // insulator strings
  vec3 s = vec3(q.x, y, abs(q.z));
  d = min(d, seCylAxis(s, vec3(0.0, 20.3, 7.0), vec3(0.0, 17.9, 7.0), 0.16));
  d = min(d, seCylAxis(s, vec3(0.0, 24.0, 5.5), vec3(0.0, 21.5, 5.5), 0.16));
  return d;
}
vec2 corridorD(vec3 p, float dcam) {
  float cid = clamp(floor(p.x / 90.0 + 0.5), -4.0, 4.0);
  vec3 q = vec3(p.x - 90.0 * cid, p.y, p.z + 48.0);
  vec2 res = vec2(towerD(q), SE_METAL);
  float xl = q.x;
  float sag = 6.0 * (xl / 45.0) * (xl / 45.0);
  float rw = max(0.12, dcam * 0.0011);
  for (int k = 0; k < 4; k++) {
    float zc = k < 2 ? (k == 0 ? -7.0 : 7.0) : (k == 2 ? -5.5 : 5.5);
    float yc = k < 2 ? 17.9 : 21.5;
    vec2 dd = vec2(q.z - zc, q.y - (yc - sag));
    float dw = length(dd) * 0.95 - rw;
    if (dw < res.x) res = vec2(dw, 8.0);
  }
  return res;
}

float arcD(vec3 p, vec3 A, vec3 B, float seed, float amp) {
  float d = 1e5; vec3 prev = A; vec3 dir = B - A;
  for (int i = 1; i <= 7; i++) {
    float u = float(i) / 7.0;
    vec3 P = A + dir * u + (hash33(vec3(seed, float(i), 3.1)) - 0.5) * 2.0 * amp * sin(3.14159 * u);
    vec3 pa = p - prev, ba = P - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
    prev = P;
  }
  return d;
}

// ---- datacentre shed
vec2 shedD(vec3 p, float dcam) {
  float d2 = footD(p.xz);
  float dB = length(max(vec2(d2, p.y - HSH), 0.0)) + min(max(d2, p.y - HSH), 0.0);
  vec2 res = vec2(dB, SE_OXIDE);
  if (dB < 1.5) {
    if (dcam < 140.0 && p.y < HSH - 1.3 && p.y > 0.8) {
      float groove = abs(seRep(p.y, 0.5)) - 0.09;
      float carve = max(groove, -(d2 + 0.3));
      res.x = max(res.x, -carve);
    }
    // lamps: one per crown cell on the roof
    if (p.y > HSH - 0.4 && p.y < HSH + 1.5) {
      vec2 g = p.xz / uPitch - uCen;
      ivec2 c = ivec2(floor(g + 0.5));
      vec4 cd = cellAt(c);
      if (cd.x > 0.5) {
        vec2 ctr = (vec2(c) + uCen) * uPitch;
        float hl = (uVar > 2.5 ? 0.94 : 0.875) * (cd.x > 1.5 ? 1.25 : 1.0) * 1.035;
        float f = mix(1.0, 0.28 + 0.4 * cd.g, uLamp);
        float dl = seRoundBox(vec3(p.x - ctr.x, p.y - (HSH + 0.06), p.z - ctr.y), vec3(hl * f, 0.06 + 0.1 * f, hl * f), 0.04);
        if (dl < res.x) res = vec2(dl, 7.0);
      }
    }
  }
  // chillers: two rows north of the shed, fans on top
  if (p.z < -27.0 && p.z > -41.0 && abs(p.x) < 38.0 && p.y < 4.2) {
    for (int r = 0; r < 2; r++) {
      float zc = r == 0 ? -31.0 : -37.0;
      float xo = r == 0 ? 0.0 : 2.75;
      vec3 q = vec3(p.x - xo - 5.5 * clamp(floor((p.x - xo) / 5.5 + 0.5), -6.0, 6.0), p.y, p.z - zc);
      float db = seRoundBox(q - vec3(0.0, 1.35, 0.0), vec3(2.3, 1.35, 1.6), 0.08);
      if (db < 1.0) {
        float fan = seCylY(q - vec3(0.0, 2.7, 0.0), 1.35, 0.3);
        db = max(db, -fan);
        db = min(db, seCylY(q - vec3(0.0, 2.45, 0.0), 0.28, 0.2));
        float a = uT * 7.0;
        vec2 bq = rot2(a) * q.xz;
        float blade = seRoundBox(vec3(bq.x, q.y - 2.5, bq.y), vec3(1.2, 0.025, 0.2), 0.01);
        blade = min(blade, seRoundBox(vec3(bq.y, q.y - 2.5, -bq.x), vec3(1.2, 0.025, 0.2), 0.01));
        db = min(db, blade);
        db = min(db, seCylY(q - vec3(0.0, 2.72, 0.0), 1.42, 0.04) - 0.0 + 0.0 * blade);
      }
      if (db < res.x) res = vec2(db, SE_METAL);
    }
  }
  return res;
}

// ---- the town: houses with lit windows
vec2 townD(vec3 p) {
  vec2 id = floor(p.xz / 15.0);
  float h = hash12(id + 3.7);
  vec2 res = vec2(1e5, 0.0);
  if (h < 0.38) return res;
  vec2 c = (id + 0.5) * 15.0 + (hash22(id) - 0.5) * 3.0;
  vec3 q = vec3(p.x - c.x, p.y, p.z - c.y);
  float hh = 2.6 + 1.2 * hash12(id + 9.1);
  float d = seRoundBox(q - vec3(0.0, hh * 0.5, 0.0), vec3(3.4, hh * 0.5, 2.6), 0.08);
  float roof = seRoundBox(q - vec3(0.0, hh + 0.45, 0.0), vec3(3.8, 0.12, 3.0), 0.06);
  res = vec2(min(d, roof), SE_OXIDE);
  float dw = seRoundBox(vec3(abs(q.x) - 1.4, q.y - 1.5, q.z - 2.62), vec3(0.45, 0.35, 0.06), 0.02);
  if (dw < res.x) res = vec2(dw, 7.0);
  return res;
}

vec2 siloD(vec3 p) {
  vec3 q = p - vec3(-60.0, 0.0, 12.0);
  float r = length(q.xz);
  float d = max(r - 4.2, q.y - 17.0);
  d = max(d, -(max(abs(seRep(q.y, 1.9)) - 0.07, 4.0 - r)) * 1.0 + 0.0 * d);
  float dome = seEllipsoid(q - vec3(0.0, 17.0, 0.0), vec3(4.2, 2.4, 4.2));
  d = min(d, dome);
  d = min(d, seCylAxis(q, vec3(4.4, 0.0, 0.0), vec3(4.4, 17.5, 0.0), 0.08));
  d = min(d, seRoundBox(q - vec3(-8.0, 3.0, 0.0), vec3(3.2, 3.0, 2.4), 0.1));
  return vec2(d, SE_OXIDE);
}

vec2 signD(vec3 p) {
  vec3 q = p - vec3(-28.0, 4.4, 82.0);
  vec2 res = vec2(seRoundBox(q, vec3(10.0, 1.25, 0.14), 0.04), 9.0);
  float dp = seRoundBox(vec3(abs(q.x) - 7.0, p.y - 1.6, q.z), vec3(0.15, 1.6, 0.15), 0.03);
  if (dp < res.x) res = vec2(dp, SE_METAL);
  return res;
}

float boxB(vec3 p, vec3 lo, vec3 hi) { vec3 q = abs(p - 0.5 * (lo + hi)) - 0.5 * (hi - lo); return length(max(q, 0.0)); }
vec2 mapField(vec3 p) {
  float dcam = length(p - uCamPos);
  bool apron = abs(p.x) < 46.0 && p.z > -42.0 && p.z < 33.0;
  vec2 res = vec2(p.y, apron ? SE_OXIDE : SE_RESIST);
  if (p.z > 84.0 && p.z < 96.0) res.y = SE_TAPE;
  if (!apron && p.x < 105.0 && p.x > -330.0 && p.z < 80.0 && p.z > -290.0) {
    float c = cornD(p, dcam);
    if (c < res.x) res = vec2(c, SE_SILICON);
  }
  float b;
  b = boxB(p, vec3(-50.0, 0.0, -44.0), vec3(50.0, 16.0, 36.0));
  if (b < 1.0) { vec2 s = shedD(p, dcam); if (s.x < res.x) res = s; } else res.x = min(res.x, b);
  b = boxB(p, vec3(-340.0, 0.0, -64.0), vec3(340.0, 31.0, -33.0));
  if (b < 1.0) { vec2 s = corridorD(p, dcam); if (s.x < res.x) res = s; } else res.x = min(res.x, b);
  b = boxB(p, vec3(96.0, 0.0, -50.0), vec3(205.0, 9.0, 70.0));
  if (b < 1.0) { vec2 s = townD(p); if (s.x < res.x) res = s; } else res.x = min(res.x, b);
  b = boxB(p, vec3(-76.0, 0.0, -2.0), vec3(-46.0, 24.0, 26.0));
  if (b < 1.0) { vec2 s = siloD(p); if (s.x < res.x) res = s; } else res.x = min(res.x, b);
  if (uSignOn > 0.0) {
    b = boxB(p, vec3(-40.0, 0.0, 79.0), vec3(-16.0, 6.5, 85.0));
    if (b < 1.0) { vec2 s = signD(p); if (s.x < res.x) res = s; } else res.x = min(res.x, b);
  }
  if (uStorm > 0.01) {
    for (int k = 0; k < 4; k++) {
      if (uArcB[k].w < 0.01) continue;
      vec3 A = uArcA[k].xyz, B = uArcB[k].xyz;
      vec3 mid = 0.5 * (A + B);
      float rr = 0.5 * length(B - A) + 5.0;
      if (length(p - mid) > rr + 3.0) continue;
      float da = arcD(p, A, B, uArcA[k].w, 0.12 * length(B - A)) - max(0.35, dcam * 0.004);
      if (da < res.x) res = vec2(da, SE_BEAM);
    }
  }
  return res;
}

// ---- hall (C2): local frame around x = HX
vec2 mapHall(vec3 p) {
  float dy = min(p.y, 10.0 - p.y), dx = 16.0 - abs(p.x), dz = p.z + 34.0;
  float dr = min(min(dy, dx), dz);
  vec2 res = vec2(dr, dz <= min(dy, dx) + 0.001 ? 11.0 : (10.0 - p.y < p.y ? SE_TAPE : SE_OXIDE));
  float xr = abs(p.x);
  // racks: three rows each side, 0.75 m pitch along z
  if (p.y > 2.5) { res.x = min(res.x, p.y - 2.45); }
  else if (xr > 1.9 && xr < 12.0) {
    float kx = clamp(floor((xr - 3.0) / 3.7 + 0.5), 0.0, 2.0);
    float qx = xr - 3.0 - 3.7 * kx;
    float zi = floor(p.z / 0.75 + 0.5);
    float zl = p.z - 0.75 * zi;
    float db = seRoundBox(vec3(qx, p.y - 1.1, zl), vec3(0.55, 1.1, 0.3), 0.015);
    if (db < res.x) res = vec2(db, 10.0);
    if (db < 0.3) {
      float dl = min(seRoundBox(vec3(qx + 0.555, p.y - 1.85, zl), vec3(0.014, 0.03, 0.2), 0.005),
                     seRoundBox(vec3(qx + 0.555, p.y - 1.45, zl), vec3(0.014, 0.03, 0.2), 0.005));
      if (dl < res.x) res = vec2(dl, 7.0);
    }
  }
  // overhead busbar, hangers, breakers, cross trays
  if (p.y > 3.5 && abs(p.x) < 12.5) {
    float db = seRoundBox(vec3(p.x, p.y - 6.4, p.z - 13.0), vec3(0.32, 0.22, 47.0), 0.04);
    if (db < res.x) res = vec2(db, 8.0);
    float zh = seRep(p.z - 3.0, 6.0);
    float dh = seRoundBox(vec3(p.x, p.y - 8.4, zh), vec3(0.05, 1.7, 0.05), 0.01);
    if (dh < res.x) res = vec2(dh, SE_METAL);
    float zt = seRep(p.z - 22.0, 3.0);
    float nI = floor((22.0 - p.z) / 3.0 + 0.5);
    float tb = seRoundBox(vec3(p.x, p.y - 5.55, zt), vec3(0.42, 0.34, 0.3), 0.03);
    if (tb < res.x) res = vec2(tb, SE_METAL);
    float tc = uR - nI * BEAT;
    float ang = nI < 0.0 ? 0.0 : mix(1.15, 0.0, backOut(tc / 0.10));
    vec3 pv = vec3(0.0, 5.55, 0.31);
    vec3 tip = pv + 0.3 * vec3(0.0, cos(ang), sin(ang));
    vec3 pl = vec3(p.x, p.y, zt);
    float dlv = seCylAxis(pl, pv, tip, 0.035);
    dlv = min(dlv, length(pl - tip) - 0.075);
    if (dlv < res.x) res = vec2(dlv, 7.0);
    float tr = seRoundBox(vec3(p.x, p.y - 4.7, seRep(p.z - 19.0, 6.0)), vec3(11.5, 0.04, 0.12), 0.01);
    if (tr < res.x) res = vec2(tr, SE_METAL);
  }
  return res;
}

vec2 map(vec3 p) {
  if (p.x > 600.0) return mapHall(p - vec3(HX, 0.0, 0.0));
  return mapField(p);
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = uVar > 1.5 && uVar < 2.5 ? vec3(HX - 16.5, -0.5, -35.0) : vec3(-340.0, -1.0, -300.0);
  vec3 hi = uVar > 1.5 && uVar < 2.5 ? vec3(HX + 16.5, 10.5, 60.0) : vec3(340.0, 40.0, 130.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id < 6.5) {
    float Z = seMatZ(id);
    if (id < 0.5) { float fr = smoothstep(30.0, 110.0, length(p - uCamPos)); Z *= mix(0.6 + 0.4 * hash12(floor(p.xz / 0.9)), 0.5, fr); }
    return Z;
  }
  return id < 7.5 ? 1.0 : id < 8.5 ? 0.75 : id < 9.5 ? 0.45 : id < 10.5 ? 0.42 : 0.3;
}

float arcRim(vec3 p) {
  float s = 0.0;
  for (int k = 0; k < 4; k++) {
    vec3 m = 0.5 * (uArcA[k].xyz + uArcB[k].xyz);
    vec3 d = p - m;
    s += uArcB[k].w * exp(-dot(d, d) / 1800.0);
  }
  return s;
}

float matAmber(float id, vec3 p, vec3 n) {
  if (id > 5.5 && id < 6.5) return 0.99;
  if (p.x > 600.0) {
    vec3 h = p - vec3(HX, 0.0, 0.0);
    float zs = floor((22.0 - h.z) / 3.0 + 0.5);
    float tcs = uR - zs * BEAT;
    if (id > 6.5 && id < 7.5) {      // rack LEDs and breaker levers
      if (h.y > 4.0) return zs < 0.0 || tcs > 0.0 ? 0.95 : 0.0;
      float zi = floor(h.z / 0.75 + 0.5);
      float zr = floor((22.0 - 0.75 * zi) / 3.0 + 0.5);
      float tc = uR - zr * BEAT - 0.04 * hash12(vec2(zi, 1.0));
      return tc > 0.0 || zr < 0.0 ? 0.55 + 0.4 * exp(-max(tc, 0.0) / 0.25) : 0.0;
    }
    if (id > 7.5 && id < 8.5) {      // the busbar: energised behind the closing front, pulses on the 8ths
      float front = 22.0 - 3.0 * (uR / BEAT) + 3.0;
      float on = smoothstep(front + 0.6, front - 0.3, h.z);
      float ph = fract((h.z - 0.0) / 3.0 * 0.5 + uR / (BEAT * 0.5) * 0.0 + uR / (BEAT * 0.5));
      return clamp(on * (0.35 + 0.6 * exp(-ph * 9.0)), 0.0, 0.99);
    }
    if (id > 10.5 && id < 11.5) {    // the lit lyric on the far wall
      vec2 cv = vec2((h.x + 12.0) / 24.0, (9.6 - h.y) / 9.0 * 0.75);
      if (cv.x > 0.0 && cv.x < 1.0 && cv.y > 0.0 && cv.y < 0.75) return 0.97 * txtAt(cv);
    }
    return 0.0;
  }
  if (id < 0.5) {                    // corn: lit crop rows (the lyric), rim-lit by arcs
    float a = 0.0;
    vec2 cv = vec2((p.x + 80.0) / 160.0, (p.z - 34.0) / 60.0 * 0.75);
    if (cv.x > 0.0 && cv.x < 1.0 && cv.y > 0.0 && cv.y < 0.75) {
      float ridge = mix(0.5 + 0.5 * cos(6.2832 * (p.z / 0.9 - 0.5)), 0.6, smoothstep(30.0, 110.0, length(p - uCamPos)));
      a = 0.97 * txtAt(cv) * (0.4 + 0.6 * ridge) * smoothstep(0.1, 0.9, p.y / 2.4 + 0.25);
    }
    if (uStorm > 0.01) a = max(a, clamp(arcRim(p) * 0.9, 0.0, 0.8) * smoothstep(0.2, 2.0, p.y));
    return a;
  }
  if (id > 6.5 && id < 7.5) {         // roof lamps, village windows
    if (p.x > 96.0) return step(hash12(floor(p.xz / 15.0) + 3.7) - 0.38, uTown * 0.62) * 0.9;
    vec2 g = p.xz / uPitch - uCen;
    ivec2 c = ivec2(floor(g + 0.5));
    vec4 cd = cellAt(c);
    float hl = hallLit(p.x);
    float base = mix(1.0, 0.22 + 0.78 * step(0.42, cd.g), uLamp);
    return clamp(max(base * 0.95, hl), 0.0, 0.99);
  }
  if (id > 2.5 && id < 3.5) {         // louvre glow of the lit halls
    if (p.y < HSH - 0.2 && p.y > 0.8 && p.x < 60.0 && p.z > -44.0) {
      float d2 = footD(p.xz);
      if (d2 < -0.2 && d2 > -0.45 && abs(seRep(p.y, 0.5)) < 0.1) return 0.8 * hallLit(p.x);
    }
    return 0.0;
  }
  if (id > 7.5 && id < 8.5) {          // conductors: pulses on the 8ths, inbound to the substation
    float sp = 45.0;
    float ph = (abs(p.x) + 192.0 * uT) / sp;
    float f = fract(ph);
    return clamp(exp(-f * 14.0) * 1.1 * (1.0 - smoothstep(250.0, 330.0, abs(p.x))), 0.0, 0.99);
  }
  if (id > 8.5 && id < 9.5) {          // the sign: lit lettering
    float u = (p.x + 28.0) / 20.0 + 0.5, v = 0.75 + (5.65 - p.y) / 2.5 * 0.25;
    if (u > 0.0 && u < 1.0 && v > 0.75 && v < 1.0 && n.z > 0.5) return 0.92 * txtAt(vec2(u, v)) * uSignOn;
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  if (id > 9.5 && id < 10.5 && p.x > 600.0) {
    float aa = 1.0 - smoothstep(0.02, 0.05, fw);
    mz *= 1.0 - 0.28 * aa * step(0.5, fract(p.y / 0.06)) * smoothstep(0.5, 0.9, abs(n.x));
  }
  return vec2(mz, add);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W5Cornfield extends Scene {
  override seGrade = 0;
  n = 1;
  T0 = 33.75;
  shade!: SEShade;
  words: Word[] = [];
  tx = new Layer2D(TXW, TXH, 1);
  ov = new Layer2D();
  strip = new Layer2D(W, 54, 1);
  private uni!: Record<string, THREE.IUniform>;
  private texs: THREE.Texture[] = [];
  private cells!: THREE.DataTexture;

  override init() {
    this.n = (this.ctx.params.n as number) || 1;
    this.T0 = T0S[this.n - 1]!;
    this.words = lineByScene(this.ctx.lyrics, this.ctx.id).words;
    // ---- the crown cells: C1 = node1's lamp cells (3 m pitch), C3 = node3's tile crown (6 x 6.75 m)
    let dims: [number, number], org: [number, number], pitch: [number, number], cen: number, data: Float32Array, halfW: number, gap: number;
    if (this.n === 3) {
      dims = [20, 10]; org = [10, 5]; pitch = [6, 6.75]; cen = 0.5; halfW = 36; gap = 0.4;
      data = new Float32Array(20 * 10 * 4);
      for (let j = 0; j < 10; j++) for (let i = 0; i < 20; i++) {
        const k = crownAt(i, j), o = (j * 20 + i) * 4;
        data[o] = k; data[o + 1] = hash(i, j, 3); data[o + 2] = j / 10;
      }
    } else {
      dims = [29, 25]; org = [CRN.x, CRN.z]; pitch = [3, 3]; cen = 0; halfW = 32.5; gap = 0;
      data = new Float32Array(29 * 25 * 4);
      for (const c of crownCells()) {
        // node1 cell (i, j up) -> world (3i, -3j): grid row index kz = -j
        const o = ((-c.j + CRN.z) * 29 + (c.i + CRN.x)) * 4;
        data[o] = 1; data[o + 1] = hash(c.i, c.j, 3); data[o + 2] = c.order;
      }
    }
    this.cells = new THREE.DataTexture(data, dims[0], dims[1], THREE.RGBAFormat, THREE.FloatType);
    this.cells.minFilter = this.cells.magFilter = THREE.NearestFilter; this.cells.generateMipmaps = false; this.cells.needsUpdate = true;
    const v = (x: number) => ({ value: x });
    const v4s = () => ({ value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) });
    this.uni = {
      uT: v(this.T0), uR: v(0), uVar: v(this.n), uLamp: v(0), uTown: v(0), uStorm: v(0), uSignOn: v(0), uHalfW: v(halfW), uGap: v(gap),
      uHallT: { value: HALL_T.map((x) => this.T0 + x) },
      uPitch: { value: new THREE.Vector2(...pitch) }, uCen: { value: new THREE.Vector2(cen, cen) },
      uOrg: { value: new THREE.Vector2(...org) }, uDimN: { value: new THREE.Vector2(...dims) },
      uArcA: v4s(), uArcB: v4s(), uCells: { value: this.cells }, uTxt: { value: this.tx.texture },
    };
    this.texs.push(this.cells);
    this.shade = new SEShade({ mapGLSL: `#define SE_STEPS 80\n${WORLD}`, shadeGLSL: SHADE, uniforms: this.uni, cavL: 1.2 });
  }

  // ---- the lit lyric (field rows / hall wall) and the sign, in one alpha mask
  private drawMask(t: number) {
    const c = this.tx.ctx;
    this.tx.clear();
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const lv = (s: number) => (t < s ? 0 : 0.5 + 0.5 * Math.exp(-(t - s) / 0.28));
    const w = this.words;
    const fit = (txt: string, fam: string, px: number) => { c.font = font(fam, 200); return (200 * px) / c.measureText(txt).width; };
    // row 1: GIGAWATTS as three syllable chunks
    const fam1 = F.archivo(125, 900);
    const s1 = fit('GIGAWATTS', fam1, 1792);
    c.font = font(fam1, s1);
    const chunks = ['GI', 'GA', 'WATTS'], sy = w[0]!.syl ?? [[w[0]!.start, 0], [w[0]!.start + 0.23, 0], [w[0]!.start + 0.47, 0]];
    const wAll = c.measureText('GIGAWATTS').width, x0 = (TXW - wAll) / 2, y1 = 256;
    let pre = '';
    chunks.forEach((ch, i) => {
      const xa = x0 + c.measureText(pre).width;
      const a = lv(sy[i]![0]);
      pre += ch;
      if (a <= 0) return;
      c.save(); c.globalAlpha = a; c.fillStyle = '#fff'; c.fillText(ch, xa, y1); c.restore();
    });
    // row 2: IN A CORNFIELD TOWN
    const fam2 = F.archivo(100, 800);
    const s2 = fit('IN A CORNFIELD TOWN', fam2, 1408);
    c.font = font(fam2, s2);
    const full = 'IN A CORNFIELD TOWN', x2 = (TXW - c.measureText(full).width) / 2, y2 = 440;
    let off = 0;
    for (let i = 1; i < w.length; i++) {
      const wd = w[i]!.w.toUpperCase();
      const xa = x2 + c.measureText(full.slice(0, off)).width;
      off += wd.length + 1;
      const a = lv(w[i]!.start);
      if (a <= 0) continue;
      c.save(); c.globalAlpha = a; c.fillStyle = '#fff'; c.fillText(wd, xa, y2); c.restore();
    }
    // the sign (bottom 256 px strip, 20 m x 2.5 m board)
    c.fillStyle = '#fff'; c.textAlign = 'center';
    c.font = font(F.mono(700), 74); (c as any).letterSpacing = '3px';
    c.fillText('POPULATION 1,900', TXW / 2, TXR + 98);
    c.fillText('LOAD 1.2 GW (ONE REACTOR)', TXW / 2, TXR + 216);
    (c as any).letterSpacing = '0px';
    this.tx.upload();
  }

  private camAt(r: number): SECam { return this.n === 2 ? hallCam(r) : fieldCam(r, this.n === 3); }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, r = t - this.T0, kick = f.a.kick, n = this.n;
    const u = this.uni;
    u.uT!.value = t; u.uR!.value = r;
    u.uLamp!.value = n === 2 ? 0 : smoothstep(0.02, 0.34, r);
    u.uTown!.value = smoothstep(0.25, 2.0, r);
    u.uSignOn!.value = n === 1 ? smoothstep(2.0, 2.45, r) : 0;
    // storm (C3): arcs along the lines, the shed, the ground; flicker on the 16ths
    let storm = 0;
    if (n === 3) {
      storm = smoothstep(1.55, 1.9, r);
      const sd = Math.floor(r / (BEAT / 4));
      const A = u.uArcA!.value as THREE.Vector4[], B = u.uArcB!.value as THREE.Vector4[];
      const defs: [V3, V3][] = [[[-45, 16, -55], [-20, HSHT, -18]], [[45, 16, -55], [20, HSHT, -18]], [[0, 22, -55], [2, HSHT, 0]], [[-30, HSHT, 6], [-52, 0, 16]]];
      defs.forEach((d, k) => {
        const on = hash(sd, k, 5) < 0.28 + 0.5 * smoothstep(1.55, 2.6, r) ? 1 : 0;
        A[k]!.set(d[0][0], d[0][1], d[0][2], sd * 7.3 + k * 3.1);
        B[k]!.set(d[1][0], d[1][1], d[1][2], on * storm);
      });
    }
    u.uStorm!.value = storm;
    this.drawMask(t);

    const cam = this.camAt(r);
    const a = this.camAt(r - 1 / 30), b = this.camAt(r + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / (100 * (n === 2 ? 0.2 : 1)) + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.18 + sp, 0, 1);
    const burn = n === 3 ? smoothstep(2.5, 3.3, r) : 0;
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, reveal: 2, dim: 0.4, rim: 0.95, amber: 1 + 2.5 * burn,
      focus: cam.dist * 0.75, hazeL: n === 2 ? 70 : 600, zHaze: n === 2 ? 0.5 : 0.32,
    });

    // ---- overlays: hand-off frames, HUD, dial, the surviving beam line
    const c = this.ov.ctx;
    this.ov.clear();
    let any = false;
    const ink = (al: number) => { if (al > 0.002) { c.save(); c.globalAlpha = al; c.fillStyle = '#0A0A0B'; c.fillRect(0, 0, W, H); c.restore(); any = true; } };
    if (n === 2 && r < 0.34) {
      const al = 1 - smoothstep(0.04, 0.34, r);
      ink(al);
      this.busbar(c, al);
    }
    const loadK = smoothstep(1.875, 2.6, r);
    if (n !== 2 && r > 1.7 && r < 3.5) {
      const al = smoothstep(1.7, 1.95, r) * (1 - smoothstep(3.3, 3.45, r));
      this.hud(c, r, al);
      any = true;
    }
    if (n === 2) {
      const push = smoothstep(2.95, 3.65, r);
      const al = smoothstep(1.85, 2.15, r);
      ink(smoothstep(3.0, 3.5, r));
      const gx = lerp(GRID2_DIAL.x, DASH.cx, push), gy = lerp(GRID2_DIAL.y, DASH.cy, push), gR = lerp(GRID2_DIAL.R, DASH.R, push);
      if (al > 0.01) {
        const frac = GRID2_END_FRAC * smoothstep(1.875, 3.0, r) ** 0.8;
        drawDial(c, gx, gy, gR, {
          frac, labelsA: ['0', '0.3', '0.6', '0.9', '1.2', '1.5'], titleA: 'SITE LOAD · GW', redFrom: 0.8,
          shakeDeg: 0.7 + 2.6 * smoothstep(2.4, 3.2, r), t, hubGlow: smoothstep(2.4, 3.2, r), minor: 4, alpha: al,
        });
        any = true;
      }
    }
    if (n === 1) {
      const out1 = smoothstep(3.45, 3.68, r);
      ink(out1);
      if (out1 > 0) this.beamLine(c, cam, smoothstep(3.42, 3.72, r), out1);
    }
    if (n === 3) {
      const wh = smoothstep(3.0, 3.38, r);
      if (wh > 0.002) { c.save(); c.globalAlpha = wh; c.fillStyle = C.bone; c.fillRect(0, 0, W, H); c.restore(); any = true; }
    }
    if (any) comp.draw(renderer, this.ov.upload(), out);
    // data strip
    const sa = smoothstep(0.1, 0.3, r) * (1 - smoothstep(3.4, 3.6, r));
    if (sa > 0.01) {
      this.drawStrip(H / 2 / (cam.dist * cam.tanY), sa);
      comp.draw(renderer, this.strip.upload(), out, { scale: [1, H / 54], offset: [0, 0.5 - H / 108 + (H - 54) / 54] });
    }
    void loadK;
    return sePost({ ca: 2.5 * kick + 2 * storm * 0.5 });
  }

  private hud(c: CanvasRenderingContext2D, r: number, al: number) {
    const k = HALL_T.reduce((s, ht) => s + smoothstep(ht, ht + 0.1, r), 0) / 5;
    let gw = 1.2 * k;
    if (this.n === 3) gw = 1.2 * k + 2.4 * smoothstep(2.2, 3.1, r);
    c.save(); c.globalAlpha = al;
    c.fillStyle = 'rgba(10,10,11,0.7)'; c.fillRect(56, H - 168, 360, 92);
    c.fillStyle = 'rgba(238,233,223,0.55)'; c.fillRect(56, H - 168, 360, 1);
    c.font = font(F.mono(500), 14); c.fillStyle = 'rgba(156,151,143,0.95)'; c.textBaseline = 'alphabetic'; (c as any).letterSpacing = '2px';
    c.fillText('SITE LOAD', 72, H - 142);
    c.font = font(F.mono(700), 40); c.fillStyle = gw > 1.25 ? '#FFA41B' : 'rgba(238,233,223,0.97)'; c.fillText(`${gw.toFixed(2)} GW`, 72, H - 98);
    c.fillStyle = 'rgba(238,233,223,0.22)'; c.fillRect(300, H - 112, 100, 3);
    c.fillStyle = '#FFA41B'; c.fillRect(300, H - 112, Math.min(100, (gw / 1.2) * 100), 3);
    (c as any).letterSpacing = '0px';
    c.restore();
  }

  /** w9's busbar frame (C2's first frame): inset frame, amber busbar at y = 540, feeder stubs */
  private busbar(c: CanvasRenderingContext2D, a: number) {
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

  /** C1's out: the corridor's conductor (projected) straightens into the ring where down1's racing line starts */
  private beamLine(c: CanvasRenderingContext2D, cam: SECam, m: number, al: number) {
    const pts: [number, number][] = [];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const x = -300 + (600 * i) / N;
      const sag = 6 * Math.pow((((x % 90) + 135) % 90 - 45) / 45, 2);
      const p = seProject(cam, [x, 17.9 - sag, -55]);
      const sx = 1960 - (2060 * i) / N, sy = lerp(640, RING.y, i / N);
      pts.push([lerp(p.x, sx, m), lerp(p.y, sy, m)]);
    }
    c.save(); c.globalAlpha = al; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#FFA41B'; c.lineWidth = 3;
    c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke();
    c.strokeStyle = 'rgba(238,233,223,0.95)'; c.lineWidth = 2.2; c.beginPath(); c.arc(RING.x, RING.y, 6, 0, TAU); c.stroke();
    c.restore();
  }

  private drawStrip(ppm: number, alpha: number) {
    const c = this.strip.ctx;
    this.strip.clear();
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = '#0A0A0B'; c.fillRect(0, 0, W, 54);
    c.fillStyle = 'rgba(94,91,87,0.9)'; c.fillRect(0, 0, W, 1);
    let best = 1, px = ppm;
    for (let e = -3; e <= 4; e++) for (const m of [1, 2, 5]) { const L = m * Math.pow(10, e), p = L * ppm; if (p >= 90 && p <= 200) { best = L; px = p; } }
    const label = best >= 1000 ? `${best / 1000} km` : best >= 1 ? `${best} m` : `${best * 100} cm`;
    const mono = (s: string, x: number, y: number, col: string, al: CanvasTextAlign = 'left', size = 14) => {
      c.font = font(F.mono(500), size); c.fillStyle = col; c.textAlign = al; c.textBaseline = 'alphabetic';
      (c as any).letterSpacing = '1px'; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    c.fillStyle = 'rgba(238,233,223,0.95)'; c.fillRect(40, 31, px, 2); c.fillRect(40, 26, 2, 12); c.fillRect(40 + px - 2, 26, 2, 12);
    mono(label, 40 + px + 16, 36, 'rgba(238,233,223,0.9)', 'left', 15);
    const fovM = W / ppm, mag = 127 / (fovM * 1000);
    const magS = mag >= 1 ? `${mag.toFixed(1)} X` : `${mag.toFixed(3)} X`;
    let x = 40 + px + 170;
    for (const [k, v] of [['EHT', '5.00 kV'], ['WD', '4.2 mm'], ['Mag', magS], ['Signal A', 'SE2'], ['LOT', '7A-0042']] as [string, string][]) {
      mono(k, x, 22, 'rgba(156,151,143,0.85)', 'left', 12); mono(v, x, 40, 'rgba(238,233,223,0.78)', 'left', 15);
      x += 70 + (k.length + v.length) * 9;
    }
    mono('UNIT 0001', W - 40, 36, 'rgba(238,233,223,0.95)', 'right', 16);
    c.restore();
  }

  override dispose() { this.shade.dispose(); for (const t of this.texs) t.dispose(); }
}
const HSHT = 8.3;
void rgbaS;
