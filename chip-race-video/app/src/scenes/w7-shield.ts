// W7 THE SHIELD (bars 34-36, "They call it a shield made of sand and light"): the title concept as a 3D yield relief,
// hand-built and shaded as a scanning-electron micrograph (engine/se.ts: SDF world -> half-res G-buffer -> semShade).
//
//  Model (world unit = mm; the wafer is the die map of shield-grid, so the lattice is the neighbours' lattice):
//   - a 300 mm wafer slab: rounded rim, V notch at 6 o'clock, darker edge-bead ring, die streets cut as grooves,
//     wider seams between stitched 2 x 2 exposure fields; it rests on a graduated rotary stage (144 ticks) whose
//     lip is the reject bin, on carbon tape.
//   - 265 dies = the yield map of the film (57.7%). A passing die rises as a metal pillar with a seal-ring groove and
//     a 5 x 6 array of solder bumps; the shield's bordure and cross stand taller (a heraldic relief). A failed die
//     sinks: a pit that deepens until it is a hole through the wafer.
//   - sand: ~3,600 grains rain from above through the 112 pits and pile as heaps on the stage under them.
//   - the lyric is geometry: ten extruded letters on the stage in front of the wafer, each rising on its sung word
//     (the word flashes amber, then cools to bone).
//  Lyric to geometry: "They call it a shield" 63.75-64.69 five bands of dies, top to bottom, one per word; "made of
//  sand" 65.16-65.62 sand pours (burst on "sand"); "and light" 66.09-66.33 the beam descends and then outlines the
//  shield, the pillars it passes light up as amber windows.
//  in : key's last frame: ink with the bare wafer at WAFER (centre W/2,H/2, R = 400 px), notch at the bottom, die grid.
//       The first frame is that wafer top-down at the same scale; a raster scan line builds the SE image down the frame.
//  out: fab's first frame: only the shield's dies, as flat amber windows on the lattice (same cells, scale 1:1, centre
//       W/2,H/2), everything else ink; the camera ends straight down on the pillar tops.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SCALE } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, hash, lerp, smoothstep, clamp, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { dies, shieldHalfWidth, SHIELD, WAFER } from './shield-grid';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam } from '../engine/se';
import { GLSL_COMMON } from '../engine/glsl/common';
import type { Word } from '../engine/lyrics';

// ------------------------------------------------------------------------------------------------ constants
const T0 = 63.75, END = 67.5;
const PPM0 = WAFER.R / 150;                      // px per mm of the neighbours' wafer map (2.667)
const mm = (px: number) => px / PPM0;
const WR = 150, TH = 6, FLOORY = -TH, WELLY = -46, WELLR = 146, BEZ_R = 168, HEND = 22;
const PITCH = { x: mm(WAFER.dx), z: mm(WAFER.dy) };   // 13.5 x 16.5 mm
const HALF = { x: mm(WAFER.dx - 3) / 2, z: mm(WAFER.dy - 3) / 2 };   // die footprint: the fab window pane
const COLS = Math.ceil((WAFER.R * 2) / WAFER.dx) + 2, ROWS = Math.ceil((WAFER.R * 2) / WAFER.dy) + 2;
const ORG = { x: mm((0 - (COLS - 1) / 2) * WAFER.dx), z: mm((0 - (ROWS - 1) / 2) * WAFER.dy) };
// lettering on the stage: two rows, atlas 2048 x 512 (a row = 256 px), 3.52 px/mm
const TXPX = 3.52, TXW = 2048 / TXPX, TXRH = 256 / TXPX, Z1 = -181, Z2 = 181, X1 = -90, X2 = 40, LH = 12;
const f1 = (x: number) => x.toFixed(4);
// the sort tag lives in its own small canvas covering (TAGX, TAGY) .. +(TAGW, TAGH) of the frame
const TAGX = 880, TAGY = 230, TAGW = 1000, TAGH = 700;

// ------------------------------------------------------------------------------------------------ the shield's outline (mm)
function outlineMm(): [number, number][] {
  const pts: [number, number][] = [];
  const n = 70, cx = WAFER.cx, y0 = SHIELD.y0;
  const P = (x: number, y: number): [number, number] => [mm(x - cx), mm(y - WAFER.cy)];
  pts.push(P(cx, y0), P(cx + SHIELD.half, y0));
  for (let i = 1; i <= n; i++) { const v = i / n; pts.push(P(cx + SHIELD.half * shieldHalfWidth(v), y0 + SHIELD.h * v)); }
  for (let i = n - 1; i >= 1; i--) { const v = i / n; pts.push(P(cx - SHIELD.half * shieldHalfWidth(v), y0 + SHIELD.h * v)); }
  pts.push(P(cx - SHIELD.half, y0), P(cx, y0));
  return pts;
}
/** nearest point on the polyline: distance (mm) and arc parameter 0..1 */
function nearestOnOutline(o: [number, number][], cum: number[], x: number, z: number) {
  let best = 1e9, bu = 0;
  for (let i = 1; i < o.length; i++) {
    const [ax, az] = o[i - 1]!, [bx, bz] = o[i]!;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const k = clamp(((x - ax) * dx + (z - az) * dz) / L2);
    const d = Math.hypot(x - (ax + dx * k), z - (az + dz * k));
    if (d < best) { best = d; bu = (cum[i - 1]! + (cum[i]! - cum[i - 1]!) * k) / cum[cum.length - 1]!; }
  }
  return { d: best, u: bu };
}

// ------------------------------------------------------------------------------------------------ camera path
// [t, elevation deg, azimuth deg, px per mm, target x, y, z]
const CAMK: number[][] = [
  [63.75, 90, 0, PPM0, 0, 0, 0],
  [63.92, 90, 0, PPM0, 0, 0, 0],
  [64.30, 72, -3, 2.55, 0, 0, -16],
  [64.80, 58, -5, 2.52, 0, -3, 6],
  [65.30, 49, 2, 2.66, 0, -5, 30],
  [65.80, 38, 9, 2.86, 0, -8, 40],
  [66.30, 47, 3, 2.78, 0, -3, 34],
  [66.80, 64, 0, 2.66, 0, 8, 14],
  [67.20, 86, 0, 2.64, 0, 19, 1],
  [67.50, 90, 0, PPM0, 0, HEND, 0],
  [67.80, 90, 0, PPM0, 0, HEND, 0],
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
/** the camera at song time t (exported for layout checks) */
export function camAt(t: number, kick = 0): SECam {
  const punch = 1 + 0.010 * kick * smoothstep(63.9, 64.2, t) * (1 - smoothstep(67.0, 67.3, t));
  return seCamera([hermite(4, t), hermite(5, t), hermite(6, t)], hermite(2, t), hermite(1, t), hermite(3, t) * punch);
}

// ------------------------------------------------------------------------------------------------ text -> signed distance field
function edt(src: Float32Array, w: number, h: number) {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float32Array(n), d = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  const pass = (len: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) { k--; s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1]! < q) k++; d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = src[y * w + x]!; pass(h); for (let y = 0; y < h; y++) src[y * w + x] = d[y]!; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = src[y * w + x]!; pass(w); for (let x = 0; x < w; x++) src[y * w + x] = d[x]!; }
}

/** Two rows of capitals as a signed-distance atlas (mm, + outside) and a word-index atlas. */
function makeLettering(rows: string[][]) {
  const AW = 2048, AH = 512;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, AW, AH);
  const fam = F.archivo(87.5, 900);
  const bounds: number[][] = [];   // per row: x boundaries between words (px)
  rows.forEach((words, r) => {
    const text = words.join(' ');
    c.font = font(fam, 200); (c as any).letterSpacing = '4px';
    const w0 = c.measureText(text).width;
    const size = (200 * 1640) / w0;
    c.font = font(fam, size); (c as any).letterSpacing = `${4 * size / 200}px`;
    const width = c.measureText(text).width, x0 = (AW - width) / 2;
    const cap = c.measureText('H').actualBoundingBoxAscent;
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillText(text, x0, r * 256 + 128 + cap / 2);
    const b: number[] = [];
    const spaceW = c.measureText(' ').width;
    for (let k = 1; k < words.length; k++) b.push(x0 + c.measureText(words.slice(0, k).join(' ')).width + spaceW / 2);
    bounds.push(b);
  });
  const img = c.getImageData(0, 0, AW, AH).data;
  const inside = new Uint8Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) inside[i] = img[i * 4]! > 127 ? 1 : 0;
  const INF = 1e20;
  const a = new Float32Array(AW * AH), b = new Float32Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) { a[i] = inside[i] ? 0 : INF; b[i] = inside[i] ? INF : 0; }
  edt(a, AW, AH); edt(b, AW, AH);
  const sdf = new Uint16Array(AW * AH), ids = new Uint8Array(AW * AH);
  for (let y = 0; y < AH; y++) {
    const r = y < 256 ? 0 : 1;
    for (let x = 0; x < AW; x++) {
      const i = y * AW + x;
      const sd = inside[i] ? -(Math.sqrt(b[i]!) - 0.5) : Math.sqrt(a[i]!) - 0.5;
      sdf[i] = THREE.DataUtils.toHalfFloat(clamp(sd, -40, 40) / TXPX);
      let id = 0;
      for (const bx of bounds[r]!) if (x > bx) id++;
      ids[i] = id + r * 5;
    }
  }
  const tS = new THREE.DataTexture(sdf, AW, AH, THREE.RedFormat, THREE.HalfFloatType);
  tS.minFilter = tS.magFilter = THREE.LinearFilter; tS.generateMipmaps = false; tS.needsUpdate = true;
  const tI = new THREE.DataTexture(ids, AW, AH, THREE.RedFormat, THREE.UnsignedByteType);
  tI.minFilter = tI.magFilter = THREE.NearestFilter; tI.generateMipmaps = false; tI.needsUpdate = true;
  return { sdf: tS, ids: tI };
}

// ------------------------------------------------------------------------------------------------ GLSL: the world
const WORLD = /* glsl */ `
uniform float uT, uEq, uWin, uCross, uLetterSink, uBz;
uniform sampler2D uDie, uTextSdf, uTextId;
uniform float uWordT[10];
uniform vec4 uBeam;      // x, bottom y, z of the beam; w = on
const float WR = ${f1(WR)}, TH = ${f1(TH)}, FLOORY = ${f1(FLOORY)}, WELLY = ${f1(WELLY)}, WELLR = ${f1(WELLR)}, BEZ_R = ${f1(BEZ_R)}, HEND = ${f1(HEND)}, HMAXB = 32.5;
const vec2 ORG = vec2(${f1(ORG.x)}, ${f1(ORG.z)}), PIT = vec2(${f1(PITCH.x)}, ${f1(PITCH.z)}), HALF = vec2(${f1(HALF.x)}, ${f1(HALF.z)});
const ivec2 GN = ivec2(${COLS}, ${ROWS});
const float TXW = ${f1(TXW)}, TXRH = ${f1(TXRH)}, Z1 = ${f1(Z1)}, Z2 = ${f1(Z2)}, X1 = ${f1(X1)}, X2 = ${f1(X2)}, LH = ${f1(LH)};
#define SE_SHADOW 0.55
#define SE_STEPS 72
#define SE_SHADOW_STEPS 6

float outBack(float x) { x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + 2.2 * x * x * x + 1.2 * x * x; }
vec4 dieAt(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= GN.x || c.y >= GN.y) return vec4(0.0);
  return texelFetch(uDie, c, 0);
}
float pillarH(vec4 cd) {
  float hs = cd.x < 2.5 ? 15.0 : (cd.x < 3.5 ? 21.0 : 27.0);
  return mix(hs, HEND, uEq) * outBack((uT - cd.y) / 0.36);
}
float pitDepth(vec4 cd) { float x = clamp((uT - cd.y) / 0.5, 0.0, 1.0); return (TH + 0.6) * x * x * (3.0 - 2.0 * x); }
float heapH(vec4 cd) { return 8.5 * (0.65 + 0.5 * cd.z) * pow(clamp((uT - 65.85) / 1.5, 0.0, 1.0), 0.7); }

float sdWafer2(vec2 q) {
  float d = length(q) - WR;
  float tri = seTri2(q, vec2(-9.2, WR + 1.2), vec2(9.2, WR + 1.2), vec2(0.0, WR - 3.75));   // the notch, 6 o'clock
  return smax(d, -tri, 0.9);
}

/** The wafer slab (grooved streets, seams, bead ring), the pits, the pillars and the sand heaps. */
vec2 waferLayer(vec3 p) {
  vec2 gq = (p.xz - ORG) / PIT;
  ivec2 c0 = ivec2(floor(gq + 0.5));
  vec2 f0 = gq - vec2(c0);
  ivec2 sg = ivec2(f0.x >= 0.0 ? 1 : -1, f0.y >= 0.0 ? 1 : -1);
  vec2 q0 = f0 * PIT;
  vec2 res;
  if (p.y < 2.0) {
    // the slab: street grooves (wider at the stitched exposure-field seams), edge bead, rounded rim, notch
    float rr = length(p.xz);
    float sx = PIT.x * 0.5 - abs(q0.x), sz = PIT.y * 0.5 - abs(q0.y);
    int nx = f0.x > 0.0 ? c0.x + 1 : c0.x, nz = f0.y > 0.0 ? c0.y + 1 : c0.y;
    bool seamX = (nx & 1) == 0, seamZ = (nz & 1) == 0;       // 2 x 2 dies = one 26 x 33 mm reticle field
    float wx = seamX ? 1.15 : 0.5625, wz = seamZ ? 1.15 : 0.5625;
    float gx = (1.0 - smoothstep(wx - 0.08, wx + 0.08, sx)) * (seamX ? 0.9 : 0.45);
    float gz = (1.0 - smoothstep(wz - 0.08, wz + 0.08, sz)) * (seamZ ? 0.9 : 0.45);
    float gate = 1.0 - smoothstep(WR - 14.0, WR - 11.0, rr);
    float ring = smoothstep(WR - 4.3, WR - 4.1, rr) * (1.0 - smoothstep(WR - 1.6, WR - 1.4, rr)) * 0.35;
    float top = -max(max(gx, gz) * gate, ring);
    float dS = smax((p.y - top) * 0.75, -TH - p.y, 0.5);
    float dO = rr - WR;
    if (p.z > WR - 14.0) dO = sdWafer2(p.xz);               // only near the notch
    res = vec2(smax(dS, dO, 0.9), SE_SILICON);
  } else res = vec2(p.y * 0.75, SE_SILICON);                 // above the slab: a bound (the slab top is at y <= 0)
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    if (k > 0) {                                              // a neighbour can only matter if it is nearer than what we have
      vec2 gap = vec2(o.x == 1 ? PIT.x * 0.5 - abs(q0.x) : 0.0, o.y == 1 ? PIT.y * 0.5 - abs(q0.y) : 0.0);
      if (length(gap) > res.x + 1.2) continue;
    }
    ivec2 c = c0 + o * sg;
    vec4 cd = dieAt(c);
    if (cd.x < 0.5) continue;
    vec2 q = q0 - vec2(c - c0) * PIT;
    if (cd.x < 1.5) {
      float dep = pitDepth(cd);
      if (dep > 0.01 && p.y < 2.0) {
        float dH = seRoundBox(vec3(q.x, p.y + dep - 12.0, q.y), vec3(HALF.x - 2.2, 12.0, HALF.y - 2.2), 0.9);
        res.x = smax(res.x, -dH, 0.35);
      }
      float hh = heapH(cd);
      if (hh > 0.3 && p.y < WELLY + hh + 6.0) {
        float dh = seEllipsoid(vec3(q.x, p.y - WELLY, q.y), vec3(6.4, hh, 7.4));
        res = seSmoothUnion(res, vec2(dh, SE_OXIDE), 1.2);
      }
    } else {
      float h = pillarH(cd);
      if (h > 0.02) {
        float hp = h * 0.5;
        float dP = seRoundBox(vec3(q.x, p.y - hp, q.y), vec3(HALF.x, hp, HALF.y), 0.45);
        if (p.y > h - 1.4) {
          float ringD = abs(seRoundBox2(q, HALF - 1.05, 0.3)) - 0.22;                 // seal ring groove
          dP = max(dP, -max(ringD, (h - 0.25) - p.y));
          vec2 bi = vec2(clamp(floor(q.x / 2.1 + 0.5), -2.0, 2.0), clamp(floor(q.y / 2.3), -3.0, 2.0) + 0.5);   // 5 x 6 bumps
          dP = smin(dP, length(vec3(q.x - bi.x * 2.1, p.y - (h - 0.3), q.y - bi.y * 2.3)) - 0.8, 0.15);
          float cr = max(min(abs(q.x), abs(q.y)) - 0.45 * uCross, (h - uCross) - p.y);   // window mullion cross
          dP = max(dP, -cr);
        }
        res = seSmoothUnion(res, vec2(dP, SE_METAL), 0.5);
      }
    }
  }
  return res;
}

/** The graduated bezel around the wafer: a raised ring on the table with 144 ticks cut into it. */
vec2 bezelD(vec3 p, float rr) {
  float yc = p.y - (FLOORY + 1.5);
  float d = smax(smax(rr - BEZ_R, 151.5 - rr, 0.5), abs(yc) - 1.5 * uBz, 0.5);
  if (rr > 151.0 && rr < BEZ_R + 0.5 && yc > -1.2) {
    float st = 0.04363323;                       // 2.5 degrees
    float a = atan(p.z, p.x);
    float ai = floor(a / st + 0.5);
    float la = (a - ai * st) * rr;
    bool major = mod(ai, 4.0) == 0.0;            // long tick every 10 degrees
    float r0 = major ? 153.0 : 159.0;
    float tk = max(abs(la) - (major ? 0.55 : 0.38), max(r0 - rr, rr - (BEZ_R - 2.0)));
    d = max(d, -max(tk, (FLOORY + 3.0 - 0.8) - p.y));
  }
  return vec2(d, 8.0);
}

/** Extruded capitals on the stage (distance, word index). */
vec2 lettersD(vec3 p) {
  float yy = p.y - FLOORY;
  if (yy > LH * 1.3 + 3.0) return vec2(1.0e5, 0.0);
  float d = 1.0e5, wid = 0.0;
  for (int r = 0; r < 2; r++) {
    float zc = r == 0 ? Z1 : Z2, xc = r == 0 ? X1 : X2;
    float zr = (p.z - zc) / TXRH + 0.5, xr = (p.x - xc) / TXW + 0.5;
    if (zr < 0.0 || zr > 1.0 || xr < 0.0 || xr > 1.0) continue;
    vec2 uv = vec2(xr, (float(r) + zr) * 0.5);
    float d2 = textureLod(uTextSdf, uv, 0.0).r;
    float wi = floor(textureLod(uTextId, uv, 0.0).r * 255.0 + 0.5);
    float h = LH * outBack((uT - uWordT[int(wi)]) / 0.34) * (1.0 - uLetterSink);
    if (h < 0.05) continue;
    vec2 w = vec2(d2 + 0.7, abs(yy - h * 0.5) - h * 0.5 + 0.7);
    float dd = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.7;
    if (dd < d) { d = dd; wid = wi; }
  }
  return vec2(d, wid);
}

vec2 map(vec3 p) {
  float rr = length(p.xz);
  // the specimen table (carbon tape) with the round bin well under the wafer
  float dWell = max(rr - WELLR, WELLY - p.y);
  vec2 res = vec2(smax(p.y - FLOORY, -dWell, 0.6), SE_TAPE);
  if (uBeam.w > 0.5) {
    float db = max(max(length(p.xz - uBeam.xz) - 0.8, uBeam.y - p.y), p.y - 332.0);
    if (db < res.x) res = vec2(db, SE_BEAM);
  }
  if (p.y < FLOORY + 34.0) {
    if (uBz > 0.04 && p.y < FLOORY + 6.0 && rr > 148.0 && rr < BEZ_R + 3.0) res = seUnion(res, bezelD(p, rr));
    if (abs(p.z) > 164.0) {
      vec2 L = lettersD(p);
      if (L.x < res.x) res = vec2(L.x, 7.0);
    }
  }
  if (rr < WR + 8.0 && p.y < HMAXB) res = seSmoothUnion(res, waferLayer(p), 0.5);
  else res.x = min(res.x, max(rr - WR - 1.0, p.y - 31.5));
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-360.0, WELLY - 1.0, -300.0), hi = vec3(360.0, 332.0, 300.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float wordIdAt(vec3 p) {
  float best = 0.0, bd = 1.0e5;
  for (int r = 0; r < 2; r++) {
    float zc = r == 0 ? Z1 : Z2, xc = r == 0 ? X1 : X2;
    float zr = (p.z - zc) / TXRH + 0.5, xr = (p.x - xc) / TXW + 0.5;
    if (zr < 0.0 || zr > 1.0 || xr < 0.0 || xr > 1.0) continue;
    vec2 uv = vec2(xr, (float(r) + zr) * 0.5);
    float d2 = textureLod(uTextSdf, uv, 0.0).r;
    if (d2 < bd) { bd = d2; best = floor(textureLod(uTextId, uv, 0.0).r * 255.0 + 0.5); }
  }
  return best;
}

float matZ(float id, vec3 p, vec3 n) {
  float Z = id < 6.5 ? seMatZ(id) : (id < 7.5 ? 0.64 : 0.40);
  float rr = length(p.xz);
  if (id > 1.5 && id < 2.5) Z *= (1.0 - smoothstep(150.0, 290.0, rr)) * (1.0 - 0.35 * smoothstep(-8.0, -30.0, p.y));   // the tape fades into the dark
  bool top = id > 0.5 && id < 1.5 && n.y > 0.8;
  if (top) Z = mix(Z, 1.3, uWin);
  float keep = (top || (id > 5.5 && id < 6.5)) ? 1.0 : 0.0;
  return Z * mix(1.0, keep, uWin);
}
float matAmber(float id, vec3 p, vec3 n) {
  if (id > 5.5 && id < 6.5) return 0.99;
  if (id > 6.5 && id < 7.5) {
    float tw = uWordT[int(wordIdAt(p))];
    return 0.97 * exp(-(uT - tw) / 0.30) * step(tw, uT);
  }
  if (id > 0.5 && id < 1.5) {
    vec4 cd = dieAt(ivec2(floor((p.xz - ORG) / PIT + 0.5)));
    float topK = smoothstep(0.55, 0.9, n.y);
    float lit = smoothstep(cd.w, cd.w + 0.14, uT);
    float fl = exp(-(uT - cd.y) / 0.13) * step(cd.y, uT);
    return clamp(max(lit, fl * 0.9) * topK + lit * 0.30 * (1.0 - topK), 0.0, 0.99);
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
const float WR = ${f1(WR)};
const vec2 ORG = vec2(${f1(ORG.x)}, ${f1(ORG.z)}), PIT = vec2(${f1(PITCH.x)}, ${f1(PITCH.z)});
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  float rr = length(p.xz);
  if (id < 0.5) {
    // darker edge-bead ring; test keys (bright dashes) in the streets
    mz *= 1.0 - 0.38 * smoothstep(WR - 4.5, WR - 4.2, rr) * (1.0 - smoothstep(WR - 1.7, WR - 1.4, rr));
    vec2 f = (p.xz - ORG) / PIT; f -= floor(f + 0.5);
    float inX = step(0.455, abs(f.x)), inZ = step(0.46, abs(f.y));
    float dashZ = step(0.55, fract(p.z / 3.1)) * inX, dashX = step(0.55, fract(p.x / 3.1)) * inZ;
    float aa = 1.0 - smoothstep(0.4, 0.9, fw / 0.6);
    mz *= 1.0 + 0.9 * aa * max(dashZ, dashX) * (1.0 - smoothstep(WR - 14.0, WR - 11.0, rr));
  } else if (id < 1.5) {
    // etch scalloping on the pillar walls: pitch ~ wall height / 40
    float wall = 1.0 - smoothstep(0.25, 0.6, abs(n.y));
    float pitch = 0.62;
    float a = 1.0 - smoothstep(0.30, 0.65, fw / pitch);
    mz *= 1.0 + wall * a * 0.16 * sin(p.y / pitch * 6.2832);
  }
  return vec2(mz, add);
}`;

// ------------------------------------------------------------------------------------------------ sand grain sprites
// Closed-form ballistic grains (a pure function of t): spawned above the frame, falling through the pits. Each is a
// camera-facing capsule (streak = where it was 1/80 s ago), depth-tested against the G-buffer.
const GRAIN_VERT = /* glsl */ `precision highp float;
precision highp int;
in vec3 position;
in vec4 aA;   // pit x, pit z, arrival time at the wafer top, gravity
in vec4 aB;   // jitter x, jitter z, radius (world), seed
uniform float uT;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
out vec2 vLocal;
out vec3 vW;
out vec4 vP;   // radius px, tail length px, seed, world y
const float Y0 = 300.0, FLOORY = ${f1(WELLY)};
vec3 proj(vec3 w) {
  vec3 rel = w - uCamPos;
  float z = dot(rel, uCamFwd);
  return vec3(dot(rel, uCamRight) / (z * uTan.x), dot(rel, uCamUp) / (z * uTan.y), z);
}
void main() {
  float g = aA.w;
  float tau = uT - (aA.z - sqrt(2.0 * Y0 / g));
  float y = Y0 - 0.5 * g * tau * tau;
  if (tau < 0.0 || y < FLOORY + 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLocal = vec2(0.0); vW = vec3(0.0); vP = vec4(0.0); return; }
  vec3 w = vec3(aA.x + aB.x, y, aA.y + aB.y);
  vec3 c = proj(w);
  vec3 c2 = proj(w + vec3(0.0, g * tau * 0.0125, 0.0));
  vec2 hs = vec2(960.0, 540.0);
  vec2 pc = c.xy * hs, tail = (c2.xy - c.xy) * hs;
  float rad = max(1.5, aB.z * 540.0 / (c.z * uTan.y));
  float L = length(tail);
  vec2 dir = L > 0.5 ? tail / L : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float across = position.x * (rad + 1.0);
  float along = position.y > 0.0 ? L + rad + 1.0 : -(rad + 1.0);
  vLocal = vec2(across, along);
  vW = w;
  vP = vec4(rad, L, aB.w, y);
  gl_Position = vec4((pc + perp * across + dir * along) / hs, 0.0, 1.0);
}`;
const GRAIN_FRAG = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vLocal;
in vec3 vW;
in vec4 vP;
out vec4 fragColor;
${GLSL_COMMON}
uniform sampler2D uG0;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform float uWin;
void main() {
  float rad = vP.x, L = vP.y;
  if (rad <= 0.0) discard;
  float y = vLocal.y;
  float d = length(vec2(vLocal.x, y - clamp(y, 0.0, L))) - rad;
  float a = (1.0 - smoothstep(-0.6, 0.6, d)) * (1.0 - uWin);
  if (a <= 0.0) discard;
  float tSurf = textureLod(uG0, gl_FragCoord.xy / uRes, 0.0).r;
  if (length(vW - uCamPos) > tSurf + 1.2) discard;
  // faceted quartz: bright facets, a bone rim; dimmer inside the pits and under the wafer
  float facet = hash12(floor(vLocal / max(rad * 0.8, 1.0)) + vP.z * 91.7);
  float S = 0.40 + 0.46 * facet + 0.30 * smoothstep(-1.4, -0.2, d);
  S *= mix(0.5, 1.0, smoothstep(-10.0, 2.0, vP.w));
  float k = clamp(S, 0.0, 0.92);
  vec3 col = mix(C_INK, C_GRAPHITE, clamp(k / 0.35, 0.0, 1.0));
  col = mix(col, C_ASH, clamp((k - 0.35) / 0.25, 0.0, 1.0));
  col = mix(col, C_BONE, clamp((k - 0.60) / 0.32, 0.0, 1.0));
  float fade = L > 0.5 ? mix(1.0, 0.3, clamp(y / (L + rad), 0.0, 1.0)) : 1.0;
  fragColor = vec4(col * a * fade, a * fade);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W7Shield extends Scene {
  override seGrade = 0;
  words: Word[] = [];
  shade!: SEShade;
  text = new Layer2D(TAGW, TAGH);
  strip = new SEStrip();
  // data
  tEv: number[] = [];
  nPassT: number[] = []; nFailT: number[] = [];
  outl = outlineMm();
  cum: number[] = [0];
  // grains
  private grainScene = new THREE.Scene();
  private grainCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private grainMat!: THREE.RawShaderMaterial;
  private grainGeo!: THREE.InstancedBufferGeometry;
  private uni!: Record<string, THREE.IUniform>;
  private texs: THREE.Texture[] = [];

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'shield').words;
    for (let i = 1; i < this.outl.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(this.outl[i]![0] - this.outl[i - 1]![0], this.outl[i]![1] - this.outl[i - 1]![1]));
    const D = dies();
    // ---- per-die data: state, event time, hash, light time
    const arr = new Float32Array(COLS * ROWS * 4);
    const ys = D.map((d) => d.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const ws = this.words.slice(0, 5);
    let maxIn = 0;
    const near = D.map((d) => nearestOnOutline(this.outl, this.cum, mm(d.x - WAFER.cx), mm(d.y - WAFER.cy)));
    D.forEach((d, i) => { if (!d.fail) maxIn = Math.max(maxIn, near[i]!.d); });
    D.forEach((d, i) => {
      const yn = (d.y - y0) / (y1 - y0);
      const band = Math.min(4, Math.floor(yn * 5)), fr = yn * 5 - band;
      const hh = hash(d.i, d.j, 3);
      const tEv = ws[band]!.start + 0.05 + 0.14 * fr + 0.04 * hh;
      const border = !d.fail && near[i]!.d < 14;
      const state = d.fail ? 1 : d.cross ? 4 : border ? 3 : 2;
      // the beam outlines the shield on "light": bordure dies light as it passes, the interior floods in behind it
      const tLight = border ? 66.33 + 0.62 * near[i]!.u : 66.5 + 0.5 * (near[i]!.d / maxIn) + 0.05 * hash(d.i, d.j, 5);
      const o = (d.j * COLS + d.i) * 4;
      arr[o] = state; arr[o + 1] = tEv; arr[o + 2] = hh; arr[o + 3] = tLight;
      this.tEv.push(tEv);
    });
    const dieTex = new THREE.DataTexture(arr, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType);
    dieTex.minFilter = dieTex.magFilter = THREE.NearestFilter; dieTex.generateMipmaps = false; dieTex.needsUpdate = true;
    D.forEach((d, i) => (d.fail ? this.nFailT : this.nPassT).push(this.tEv[i]!));
    // ---- lettering
    const rows = [this.words.slice(0, 5).map((w) => w.w.toUpperCase()), this.words.slice(5).map((w) => w.w.toUpperCase())];
    const lt = makeLettering(rows);
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uEq: v(0), uWin: v(0), uCross: v(0), uLetterSink: v(0), uBz: v(0), uBeam: { value: new THREE.Vector4(0, 400, 0, 0) },
      uDie: { value: dieTex }, uTextSdf: { value: lt.sdf }, uTextId: { value: lt.ids },
      uWordT: { value: this.words.map((w) => w.start) },
    };
    this.texs.push(dieTex, lt.sdf, lt.ids);
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 2.4 });
    // ---- sand
    const fails = D.filter((d) => d.fail);
    const NG = 3600;
    const aA = new Float32Array(NG * 4), aB = new Float32Array(NG * 4);
    for (let i = 0; i < NG; i++) {
      const pit = fails[i % fails.length]!;
      const u = hash(i, 11), r = hash(i, 12);
      const arrive = u < 0.2 ? 65.16 + 0.46 * r : u < 0.5 ? 65.62 + 0.34 * r : 65.96 + 1.3 * r;
      aA[i * 4] = mm(pit.x - WAFER.cx); aA[i * 4 + 1] = mm(pit.y - WAFER.cy); aA[i * 4 + 2] = arrive; aA[i * 4 + 3] = 2800 * (0.86 + 0.28 * hash(i, 13));
      aB[i * 4] = (hash(i, 14) - 0.5) * 8.4; aB[i * 4 + 1] = (hash(i, 15) - 0.5) * 10.4; aB[i * 4 + 2] = 1.35 * (0.75 + 0.5 * hash(i, 16)); aB[i * 4 + 3] = hash(i, 17);
    }
    this.grainGeo = new THREE.InstancedBufferGeometry();
    this.grainGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    this.grainGeo.setIndex([0, 1, 2, 2, 1, 3]);
    this.grainGeo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
    this.grainGeo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
    this.grainGeo.instanceCount = NG;
    const g = this.shade.gbuf.u;
    this.grainMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: GRAIN_VERT, fragmentShader: GRAIN_FRAG,
      uniforms: {
        uT: this.uni.uT!, uCamPos: g.uCamPos!, uCamFwd: g.uCamFwd!, uCamRight: g.uCamRight!, uCamUp: g.uCamUp!, uTan: g.uTan!,
        uG0: { value: this.shade.gbuf.rt.textures[0] }, uRes: { value: new THREE.Vector2(W * SCALE, H * SCALE) }, uWin: this.uni.uWin!,
      },
      side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(this.grainGeo, this.grainMat);
    mesh.frustumCulled = false;
    this.grainScene.add(mesh);
  }

  /** counts of probed dies by t (for the sort readout) */
  private tally(t: number) {
    let p = 0, q = 0;
    for (const x of this.nPassT) if (x <= t) p++;
    for (const x of this.nFailT) if (x <= t) q++;
    return [p, q] as const;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    const u = this.uni;
    const eq = smoothstep(66.9, 67.25, t);
    u.uT!.value = t;
    u.uEq!.value = eq;
    u.uWin!.value = smoothstep(66.95, 67.3, t);
    u.uCross!.value = smoothstep(67.0, 67.35, t);
    u.uLetterSink!.value = smoothstep(66.75, 67.05, t);
    u.uBz!.value = smoothstep(63.9, 64.4, t) * (1 - smoothstep(66.9, 67.25, t));
    // the beam: descends on "and", outlines the shield on "light", then lifts away
    const bT0 = 66.09, bT1 = 66.33, bT2 = 66.95;
    const bOn = t > bT0 && t < 67.25;
    const prog = clamp((t - bT1) / (bT2 - bT1));
    const e = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
    const s = e * this.cum[this.cum.length - 1]!;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i]! < s) i++;
    const k = clamp((s - this.cum[i - 1]!) / Math.max(1e-6, this.cum[i]! - this.cum[i - 1]!));
    const hx = lerp(this.outl[i - 1]![0], this.outl[i]![0], k), hz = lerp(this.outl[i - 1]![1], this.outl[i]![1], k);
    const by = t < bT1 ? lerp(330, 27, Math.pow(smoothstep(bT0, bT1, t), 1.6)) : t < bT2 ? 27 : lerp(27, 330, smoothstep(bT2, 67.2, t));
    (u.uBeam!.value as THREE.Vector4).set(t < bT1 ? 0 : hx, by, t < bT1 ? mm(SHIELD.y0 - WAFER.cy) : hz, bOn ? 1 : 0);

    const cam = camAt(t, kick);
    // motion: how fast the camera is moving (noisy while it moves, clean on holds)
    const a = camAt(t - 1 / 30), b = camAt(t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / 400 + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.18 + sp, 0, 1);
    const reveal = t < 64.3 ? clamp((t - 63.78) / 0.42) : 2;
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, reveal, dim: 0.42, rim: 0.9 + 0.1 * smoothstep(63.9, 64.3, t),
      focus: cam.dist * 0.72, hazeL: 520, zHaze: 0.32,
    });

    // ---- sand grains over the shaded frame
    renderer.setRenderTarget(out);
    renderer.render(this.grainScene, this.grainCam);

    // ---- overlays: the sort tag (leader to the shield's point) and the data strip
    const c = this.text.ctx;
    this.text.clear();
    if (this.drawTag(c, cam, t)) {
      const sx = W / TAGW, sy = H / TAGH;
      comp.draw(renderer, this.text.upload(), out, { scale: [sx, sy], offset: [W / (2 * TAGW) - 0.5 - TAGX / TAGW, 0.5 - H / (2 * TAGH) + TAGY / TAGH] });
    }
    const ppm = H / 2 / (cam.dist * cam.tanY);
    const sa = smoothstep(63.85, 64.15, t) * (1 - smoothstep(67.2, 67.42, t));
    this.strip.composite(renderer, comp, out, { ppm, alpha: sa });

    return sePost({ ca: 3.0 * kick * smoothstep(63.95, 64.15, t) * (1 - smoothstep(67.0, 67.3, t)) });
  }

  private drawTag(c: CanvasRenderingContext2D, cam: SECam, t: number): boolean {
    const a = smoothstep(64.35, 64.6, t) * (1 - smoothstep(66.55, 66.8, t));
    if (a <= 0.01) return false;
    const [np, nf] = this.tally(t);
    const tot = Math.max(1, np + nf);
    const x0 = 1410, y0 = 318;
    const tip = seProject(cam, [0, 14, mm(SHIELD.y0 + SHIELD.h - WAFER.cy) - 6]);
    c.save();
    c.translate(-TAGX, -TAGY);
    c.globalAlpha = a;
    c.strokeStyle = 'rgba(238,233,223,0.55)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(x0 - 18, y0 + 150); c.lineTo(x0 - 18, y0 - 6); c.stroke();
    c.fillStyle = 'rgba(238,233,223,0.9)'; c.beginPath(); c.arc(tip.x, tip.y, 2.6, 0, TAU); c.fill();
    const m = (s: string, x: number, y: number, size: number, col: string, wgt = 500) => {
      c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textBaseline = 'alphabetic'; (c as any).letterSpacing = '1.5px'; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    m('WAFER SORT  LOT 7A-0042', x0, y0, 14, 'rgba(156,151,143,0.9)');
    m(`BIN 1  PASS ${String(np).padStart(3, '0')}`, x0, y0 + 36, 22, 'rgba(238,233,223,0.95)', 600);
    m(`BIN 9  FAIL ${String(nf).padStart(3, '0')}`, x0, y0 + 68, 22, 'rgba(156,151,143,0.95)', 600);
    m(`YIELD ${((100 * np) / tot).toFixed(1)}%`, x0, y0 + 124, 40, 'rgba(238,233,223,0.98)', 700);
    m('THE REST IS SAND AGAIN.', x0, y0 + 156, 16, 'rgba(238,233,223,0.8)');
    c.restore();
    return true;
  }

  override dispose() { this.shade.dispose(); this.grainGeo.dispose(); this.grainMat.dispose(); for (const t of this.texs) t.dispose(); }
}
