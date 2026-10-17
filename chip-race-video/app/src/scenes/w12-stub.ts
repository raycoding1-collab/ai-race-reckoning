// W12 THE STUB, the loop ending (bar 70 to the end, 131.25-142.2 s; timeline entry `outro`).
//
// The traveller form (outro-doc.ts) is a tiny sheet stuck to an SEM pin stub with carbon tape, shaded as a scanning-electron
// micrograph (engine/se.ts: SDF world -> half-res G-buffer -> semShade). World unit = 0.1 mm.
//  131.25-134.5  the whispered line and the last fields fill the form (the form is a canvas texture on the paper SDF).
//  135.47        a rubber stamp comes down on the specimen box, UNIT 0001 under it, and lands on "restricted" (amber ink).
//  136.9         pull back: the paper is on a stub, in a stub holder in the chamber.
//  138.0         a vacuum pen lifts UNIT 0001 off the stamp ink, 139.5 sets it on a fresh tape-topped stub.
//  140.45        push in on the grain, the picture goes dark; 140.6 beam on: the opening plate (sand.ts) is rendered with its own
//                clock, so the raster reveal is its first frames; 141.55 the beam blanks to a line, then a dot;
//                142.1 sand at t = 0 (ink + film grain), identical to frame 0, so the film loops.
//  HUD: gag.ts shows `UNIT 0001  RETURN TO SENDER`; the strip then types `NEXT SAMPLE: 0001 (SAME)`.
//  in : down3's last frame (hand-off is a hard cut to the paper, as before). out: sand's first frame.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, SCALE, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp, mulberry32, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene } from './_motifs';
import { CARD, drawDoc, type DocTimes } from './outro-doc';
import { SEShade, SEStrip, seCamera, sePost, seScaleBar } from '../engine/se';
import SandScene from './sand';
import type { Word } from '../engine/lyrics';

const T0 = 131.25, T_NOW = 133.12, T_STAMP = 135.47, T_BEAM = 140.6, T_BLANK = 141.55, T_FLAT = 142.1;
const CW = CARD.x1 - CARD.x0, CH = CARD.y1 - CARD.y0;     // 1480 x 860 card px = 96 x 55.8 world units
const PX_U = CW / 96;                                      // card px per world unit
const PHW = 48, PHH = 27.9, PY = 2.3;
const STC: [number, number] = [-29.85, -0.52], SANG = -0.0593;
const INK = (a: number) => `rgba(10,10,11,${a})`;
const s3 = (k: number) => { k = clamp(k); return k * k * (3 - 2 * k); };
const seg = (t: number, a: number, b: number) => s3((t - a) / (b - a));
const typedN = (s: string, t: number, t0: number, cps = 38) => { const n = Math.floor((t - t0) * cps); return n <= 0 ? '' : s.slice(0, n); };

// ------------------------------------------------------------------------------------------------ camera, stamp, pen
type K = [number, number, number, number, number, number, number];   // t, target xyz, az, el, px per unit
const KEYS: K[] = [
  [T0, 0, 2, 0, 0, 88, 15.5], [135.4, 0, 2, 0, 0, 88, 16.8], [136.9, 0, 2, 0, 0, 88, 16.8],
  [138.1, 80, -10, 0, -6, 48, 3.5], [138.85, 80, -5, 0, -6, 50, 3.5], [139.45, 150, 2, 0, -3, 62, 6.0], [140.5, 160, 3.4, 0, 0, 90, 128],
];
function camAt(t: number, kick = 0) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1]![0]) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!, k = s3((t - a[0]) / (b[0] - a[0]));
  const m = (j: number) => lerp(a[j]!, b[j]!, k);
  return seCamera([m(1), m(2), m(3)], m(4), m(5), Math.exp(lerp(Math.log(a[6]), Math.log(b[6]), k)) * (1 + 0.012 * kick - 0.02 * pulse(t, T_STAMP, 0.1)));
}
/** height of the die above the paper */
function stampH(t: number) {
  if (t < 134.55) return 400;
  if (t < 135.3) return lerp(400, 22, 1 - Math.pow(1 - (t - 134.55) / 0.75, 3));
  if (t < 135.4) return 22 + 3 * s3((t - 135.3) / 0.1);
  if (t < T_STAMP) return 25 * (1 - Math.pow((t - 135.4) / (T_STAMP - 135.4), 3));
  if (t < 135.62) return 0;
  if (t < 136.4) return 60 * Math.pow((t - 135.62) / 0.78, 2);
  return 60 + (t - 136.4) * 600;
}
const paperTop = (x: number, z: number) => {
  const w = 0.4 * Math.sin(x * 0.09 + 0.6) * Math.cos(z * 0.12) + 0.12 * Math.sin(x * 0.27 + z * 0.23);
  const ex = Math.max(Math.abs(x) / PHW - 0.74, 0), ez = Math.max(Math.abs(z) / PHH - 0.66, 0);
  return PY + w + 16 * (ex * ex + ez * ez);
};
const GRAIN_A: [number, number, number] = [-33.75, paperTop(-33.75, -0.52) + 2.7, -0.52];
const GRAIN_B: [number, number, number] = [160, 4.5, 0];
const HD = new THREE.Vector3(0.8, 0.55, -0.25).normalize();     // pen axis, tip towards handle
const TIPOFF = HD.clone().multiplyScalar(3.2);
/** grain centre */
function grainAt(t: number): [number, number, number] {
  const [ax, ay, az] = GRAIN_A, [bx, by, bz] = GRAIN_B;
  if (t < 138.78) return [ax, ay, az];
  if (t < 139.12) { const k = seg(t, 138.8, 139.12); return [ax, ay + 28 * k + 0.7 * pulse(t, 138.8, 0.04), az]; }
  if (t < 139.42) { const k = seg(t, 139.12, 139.42); return [lerp(ax, bx, k), ay + 28 + 10 * Math.sin(Math.PI * k) - (28 + ay - by - 0) * 0, lerp(az, bz, k)]; }
  if (t < 139.5) return [bx, lerp(ay + 28, by, seg(t, 139.42, 139.5)), bz];
  return [bx, by, bz];
}
/** pen tip */
function tipAt(t: number): [number, number, number] | null {
  if (t < 137.6 || t > 140.3) return null;
  const O = TIPOFF;
  const away = (g: [number, number, number]): [number, number, number] => [g[0] + 200, g[1] + 120, g[2] - 40];
  const hov1: [number, number, number] = [GRAIN_A[0] + O.x, GRAIN_A[1] + O.y + 20, GRAIN_A[2] + O.z];
  const from = away(GRAIN_A);
  if (t < 138.5) { const k = seg(t, 137.6, 138.5); return [lerp(from[0], hov1[0], k), lerp(from[1], hov1[1], k), lerp(from[2], hov1[2], k)]; }
  if (t < 138.78) { const k = seg(t, 138.5, 138.78); return [hov1[0], lerp(hov1[1], GRAIN_A[1] + O.y, k), hov1[2]]; }
  if (t < 139.52) { const g = grainAt(t); return [g[0] + O.x, g[1] + O.y, g[2] + O.z]; }
  const h2: [number, number, number] = [GRAIN_B[0] + O.x, GRAIN_B[1] + O.y + 22, GRAIN_B[2] + O.z], bt: [number, number, number] = [GRAIN_B[0] + O.x, GRAIN_B[1] + O.y, GRAIN_B[2] + O.z];
  if (t < 139.66) { const k = seg(t, 139.54, 139.66); return [bt[0], lerp(bt[1], h2[1], k), bt[2]]; }
  const to = away(GRAIN_B), k = seg(t, 139.66, 140.3);
  return [lerp(h2[0], to[0], k), lerp(h2[1], to[1], k), lerp(h2[2], to[2], k)];
}

// ------------------------------------------------------------------------------------------------ GLSL
const f1 = (x: number) => x.toFixed(4);
const COMMON_U = /* glsl */ `
uniform sampler2D uForm, uStampTex;
uniform float uLod, uInk;
const float PHW = ${f1(PHW)}, PHH = ${f1(PHH)}, PY = ${f1(PY)};
vec2 formUV(vec2 xz) { return vec2(xz.x / (2.0 * PHW) + 0.5, 1.0 - (xz.y / (2.0 * PHH) + 0.5)); }
`;
const WORLD = /* glsl */ `
uniform float uStampY, uGrainA, uTwOn;
uniform vec3 uGrainP, uTwP, uTwX, uTwY, uTwZ;
${COMMON_U}
#define SE_SHADOW 0.5
#define SE_STEPS 84
#define SE_SHADOW_STEPS 6
const vec2 STC = vec2(${f1(STC[0])}, ${f1(STC[1])});
const float SANG = ${f1(SANG)};
const vec3 GN[14] = vec3[14](vec3(0.15, 1.0, 0.1), vec3(-0.70, 0.65, 0.30), vec3(0.78, 0.55, 0.25), vec3(0.10, 0.60, -0.85), vec3(0.20, 0.55, 0.80), vec3(0.95, -0.1, 0.2), vec3(-0.98, 0.1, 0.15),
  vec3(0.1, -0.1, 0.98), vec3(0.05, 0.0, -1.0), vec3(0.7, -0.6, 0.4), vec3(-0.6, -0.65, 0.5), vec3(0.3, -1.0, -0.2), vec3(-0.4, -0.6, -0.8), vec3(0.75, -0.5, -0.55));
const float GH[14] = float[14](2.85, 3.1, 3.0, 2.95, 3.05, 2.9, 3.1, 3.0, 2.9, 3.05, 3.0, 2.7, 3.1, 3.0);

float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float paperTop(vec2 q) {
  float w = 0.4 * sin(q.x * 0.09 + 0.6) * cos(q.y * 0.12) + 0.12 * sin(q.x * 0.27 + q.y * 0.23);
  vec2 e = max(abs(q) / vec2(PHW, PHH) - vec2(0.74, 0.66), 0.0);
  return PY + w + 16.0 * dot(e, e);
}
float sdGrain(vec3 q) {
  q.y *= 1.08;
  float d = -1.0e4;
  for (int i = 0; i < 14; i++) d = max(d, dot(q, normalize(GN[i])) - GH[i]);
  return d;
}

vec2 mapPen(vec3 p) {
  vec3 d = p - uTwP;
  vec3 q = vec3(dot(d, uTwX), dot(d, uTwY), dot(d, uTwZ));
  float bound = length(q - vec3(clamp(q.x, -10.0, 1200.0), 0.0, 0.0)) - 45.0;
  if (bound > 3.0) return vec2(bound, 1.0);
  float r = length(q.yz);
  // rubber suction cup with a bore
  float rc = mix(3.4, 5.6, clamp(q.x / 14.0, 0.0, 1.0));
  float dCup = max(r - rc, max(-q.x, q.x - 14.0));
  dCup = max(dCup, -max(r - 1.7, q.x - 9.0));
  // steel needle
  float rn = mix(5.6, 9.0, clamp((q.x - 14.0) / 226.0, 0.0, 1.0));
  float dN = max(r - rn, max(14.0 - q.x, q.x - 240.0));
  // plastic barrel with grooves and a knurled grip
  float ang = atan(q.z, q.y);
  float rb = 38.0 - 2.2 * smoothstep(0.7, 1.0, abs(sin(q.x * 0.05))) + 0.9 * abs(sin(ang * 22.0)) * step(300.0, q.x) * step(q.x, 520.0);
  float dBar = max(r - rb, max(240.0 - q.x, q.x - 640.0));
  float dHose = max(r - 22.0, q.x - 1200.0);
  dHose = max(dHose, 630.0 - q.x);
  vec2 res = vec2(dCup, 8.0);
  res = seUnion(res, vec2(dN, 1.0));
  res = seUnion(res, vec2(dBar, 3.0));
  res = seUnion(res, vec2(dHose, 4.0));
  return res;
}

vec2 map(vec3 p) {
  vec2 res;
  // the stub holder: anodised bar with 4 sockets (2 filled, 2 empty), steel collars
  {
    float d = seRoundBox(p - vec3(220.0, -57.0, 0.0), vec3(360.0, 25.0, 130.0), 3.0);
    d = max(d, -seCylY(p - vec3(320.0, -33.0, 0.0), 17.5, 8.0));
    d = max(d, -seCylY(p - vec3(480.0, -33.0, 0.0), 17.5, 8.0));
    res = vec2(d, 3.0);
    for (int i = 0; i < 4; i++) {
      float sx = 160.0 * float(i);
      float rg = i < 2 ? seTorusY(p - vec3(sx, -31.0, 0.0), 68.0, 2.2) : seTorusY(p - vec3(sx, -32.0, 0.0), 19.5, 1.3);
      res = seUnion(res, vec2(rg, 1.0));
    }
  }
  // the stubs: A carries the traveller, B is fresh (tape only)
  for (int i = 0; i < 2; i++) {
    vec3 q = p - vec3(160.0 * float(i), 0.0, 0.0);
    float rb = length(q.xz);
    if (rb < 76.0 && q.y > -37.0 && q.y < 17.0) {
      float a = atan(q.z, q.x);
      float rr = 63.5 - 0.55 * sqrt(abs(sin(a * 36.0)));
      res = seUnion(res, vec2(seCylYR(q - vec3(0.0, -16.0, 0.0), rr, 16.0, 1.4), 1.0));
      if (q.y > -3.0) {
        float dT = seCylYR(q - vec3(0.0, 0.8, 0.0), 59.0, 0.8, 0.3);
        dT -= (0.22 * vn(q.xz * 0.9) + 0.08 * vn(q.xz * 3.7) + 0.03 * vn(q.xz * 13.0)) * 0.8;
        res = seUnion(res, vec2(dT, 2.0));
        if (i == 0 && abs(q.x) < 54.0 && abs(q.z) < 34.0) {
          float top = paperTop(q.xz);
          float d2 = seRoundBox2(q.xz, vec2(PHW, PHH), 1.5);
          vec2 w = vec2(d2, abs(q.y - (top - 0.35)) - 0.35);
          res = seUnion(res, vec2(min(max(w.x, w.y), 0.0) + length(max(w, 0.0)), 7.0));
        }
      }
    } else {
      res = seUnion(res, vec2(max(rb - 75.0, abs(q.y + 10.0) - 26.0), 1.0));
    }
  }
  // UNIT 0001
  {
    vec3 q = p - uGrainP;
    float bd = length(q) - 7.5;
    if (bd > 2.0) res = seUnion(res, vec2(bd, 9.0));
    else {
      float c = cos(uGrainA), s = sin(uGrainA);
      q.xz = vec2(c * q.x + s * q.z, -s * q.x + c * q.z);
      res = seUnion(res, vec2(sdGrain(q), 9.0));
    }
  }
  // the rubber stamp
  if (uStampY < 200.0) {
    vec3 ps = p - vec3(STC.x, PY + uStampY, STC.y);
    float c = cos(SANG), s = sin(SANG);
    vec3 q = vec3(c * ps.x + s * ps.z, ps.y, -s * ps.x + c * ps.z);
    float db = seRoundBox(q - vec3(0.0, 17.0, 0.0), vec3(24.0, 26.0, 14.0), 1.0);
    if (db > 3.0) res = seUnion(res, vec2(db, 8.0));
    else {
      vec2 st = vec2(seRoundBox(q - vec3(0.0, 0.5, 0.0), vec3(16.9, 0.5, 4.55), 0.25), 8.0);
      st = seUnion(st, vec2(seRoundBox(q - vec3(0.0, 6.3, 0.0), vec3(18.5, 5.0, 6.0), 1.0), 4.0));
      st = seUnion(st, vec2(seCylY(q - vec3(0.0, 17.0, 0.0), 4.5, 7.0), 1.0));
      st = seUnion(st, vec2(seEllipsoid(q - vec3(0.0, 29.0, 0.0), vec3(11.0, 9.0, 11.0)), 4.0));
      res = seUnion(res, st);
    }
  }
  if (uTwOn > 0.5) res = seUnion(res, mapPen(p));
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-200.0, -90.0, -200.0), hi = vec3(700.0, 420.0, 200.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id > 8.5) return 0.78;
  if (id > 7.5) return 0.38;
  if (id > 6.5) { float m = textureLod(uStampTex, formUV(p.xz), uLod).a; return 0.86 + 0.4 * m * uInk; }
  if (id > 2.5 && id < 3.5) return 0.42;
  return seMatZ(id);
}
float matAmber(float id, vec3 p, vec3 n) {
  if (id > 6.5 && id < 7.5) {
    float m = textureLod(uStampTex, formUV(p.xz), uLod).a;
    return 0.95 * smoothstep(0.3, 0.65, m) * uInk * smoothstep(0.5, 0.9, n.y);
  }
  if (id > 8.5) return 0.97 * smoothstep(0.80, 0.88, dot(n, normalize(vec3(0.65, 0.25, 0.72))));
  return 0.0;
}
`;

const SHADE = /* glsl */ `
${COMMON_U}
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  if (id > 6.5 && id < 7.5) {
    float lod = log2(max(1.0, fw * ${f1(PX_U * 1.5)}));
    float ink = textureLod(uForm, formUV(p.xz), lod).a;
    mz *= 1.0 - 0.94 * ink;
    float aa = 1.0 - smoothstep(0.3, 0.8, fw / 0.35);
    mz *= 1.0 + 0.16 * aa * (hash12(floor(p.xz / 0.35)) - 0.5);
  } else if (id > 1.5 && id < 2.5) {
    float aa = 1.0 - smoothstep(0.4, 1.0, fw / 0.5);
    mz *= 1.0 + aa * (0.9 * (hash12(floor(p.xz * vec2(1.3, 5.0))) - 0.5) + 0.5 * (hash12(floor(p.xz * 2.1)) - 0.5));
  } else if (id > 2.5 && id < 3.5) {
    float aa = 1.0 - smoothstep(0.35, 0.9, fw / 1.2);
    float tk = step(abs(p.x - 10.0 * floor(p.x / 10.0 + 0.5)), 0.5) * step(112.0, p.z) * step(p.z, 124.0);
    float tm = step(abs(p.x - 40.0 * floor(p.x / 40.0 + 0.5)), 0.7) * step(104.0, p.z) * step(p.z, 124.0);
    mz *= 1.0 - 0.8 * aa * max(tk, tm) * step(0.8, n.y);
  } else if (id > 0.5 && id < 1.5) {
    float aa = 1.0 - smoothstep(0.3, 0.8, fw / 0.6);
    mz *= 1.0 + 0.05 * aa * sin(length(p.xz - vec2(160.0 * floor(p.x / 160.0 + 0.5), 0.0)) * 5.0);
  }
  return vec2(mz, add);
}`;

const SQUEEZE = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uSq;
uniform float uHot;
void main() {
  vec2 c = vUv - 0.5;
  vec2 hw = max(0.5 * uSq, vec2(0.0016, 0.0016));
  vec2 s = c / max(uSq, vec2(1.0e-4)) + 0.5;
  bool inside = abs(c.x) < 0.5 * uSq.x && abs(c.y) < 0.5 * uSq.y;
  vec3 col = inside ? texture(uSrc, s).rgb : vec3(0.0);
  float pxy = 1.0 / ${H.toFixed(1)};
  float line = exp(-pow(c.y / (1.6 * pxy), 2.0)) * (1.0 - smoothstep(hw.x - 0.0012, hw.x, abs(c.x)));
  float dotv = exp(-dot(c, c) / pow(2.6 * pxy, 2.0)) * 0.9;
  col += vec3(1.0, 0.45, 0.04) * uHot * (3.2 * line + 2.0 * dotv * smoothstep(0.02, 0.0, uSq.x));
  float a = inside ? 1.0 : clamp(uHot * (line + dotv), 0.0, 1.0);
  fragColor = vec4(col, a);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W12Stub extends Scene {
  override seGrade = 0;
  form = new Layer2D(CW, CH, 1.5);
  stamp = new Layer2D(CW, CH, 1.5);
  text = new Layer2D();
  strip = new Layer2D(W, SEStrip.H);
  w1: Word[] = [];
  w2: Word[] = [];
  T!: DocTimes;
  uni!: Record<string, THREE.IUniform>;
  shade!: SEShade;
  sand!: SandScene;
  rt!: THREE.WebGLRenderTarget;
  sq!: FSPass;
  stampDone = false;
  formKey = -1;

  override async init() {
    this.w1 = lineByScene(this.ctx.lyrics, 'outro1').words;
    this.w2 = lineByScene(this.ctx.lyrics, 'outro2').words;
    this.T = { start: T0 - 1.3, stamp: T_STAMP, whisper: [], lyric: [], nowT: T_NOW };
    for (const l of [this.form, this.stamp]) { l.texture.generateMipmaps = true; l.texture.minFilter = THREE.LinearMipmapLinearFilter; l.texture.anisotropy = 4; }
    const v = (x: number) => ({ value: x }), v3 = () => ({ value: new THREE.Vector3() });
    this.uni = {
      uForm: { value: this.form.texture }, uStampTex: { value: this.stamp.texture }, uLod: v(0), uInk: v(0),
      uStampY: v(400), uGrainA: v(0.6), uTwOn: v(0), uGrainP: v3(), uTwP: v3(), uTwX: v3(), uTwY: v3(), uTwZ: v3(),
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 2.4 });
    this.sand = new SandScene(this.ctx);
    await this.sand.init();
    // sand's HUD at t = 0 would show on the loop's last frame (the film's frame 0 has none)
    { const o = this.sand.drawHud.bind(this.sand); this.sand.drawHud = (t: number, c: any, x: any) => { if (t < 0.01) return; return o(t, c, x); }; }
    this.rt = new THREE.WebGLRenderTarget(Math.round(W * SCALE), Math.round(H * SCALE), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.sq = new FSPass(SQUEEZE, { uSrc: { value: this.rt.texture }, uSq: { value: new THREE.Vector2(1, 1) }, uHot: { value: 0 } }, { blending: THREE.NormalBlending, transparent: true });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return f.t >= T_BEAM ? this.tail(f, out) : this.world(f, out);
  }

  // ---- the chamber: form on a stub, stamp, pen
  private world(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick, u = this.uni;
    // the form and the stamp mask (card space textures)
    const key = t < 135.7 ? t : 999;
    if (key !== this.formKey) { this.formKey = key; this.drawForm(t); }
    if (!this.stampDone && t >= 134.5) { this.drawStampMask(); this.stampDone = true; }
    const cam = camAt(t, kick);
    const ppm = H / 2 / (cam.dist * cam.tanY);
    u.uLod!.value = Math.log2(Math.max(1, (PX_U * 1.5 * 1.5) / ppm));
    u.uInk!.value = t >= T_STAMP ? 1 : 0;
    u.uStampY!.value = stampH(t);
    const g = grainAt(t);
    (u.uGrainP!.value as THREE.Vector3).set(g[0], g[1], g[2]);
    u.uGrainA!.value = 0.6 + 0.9 * smoothstep(138.8, 139.45, t);
    const tip = tipAt(t);
    u.uTwOn!.value = tip ? 1 : 0;
    if (tip) {
      const ex = HD, ey = new THREE.Vector3(0, 1, 0).addScaledVector(ex, -ex.y).normalize(), ez = new THREE.Vector3().crossVectors(ex, ey);
      (u.uTwP!.value as THREE.Vector3).set(tip[0], tip[1], tip[2]);
      (u.uTwX!.value as THREE.Vector3).copy(ex); (u.uTwY!.value as THREE.Vector3).copy(ey); (u.uTwZ!.value as THREE.Vector3).copy(ez);
    }
    const a = camAt(t - 1 / 30), b = camAt(t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / (cam.dist * 0.6) + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.5;
    const motion = clamp(0.15 + sp, 0, 1);
    this.shade.render(renderer, out, cam, { frame: frameIdx(t), motion, kick, reveal: 2, dim: 0.42, rim: 0.9, focus: cam.dist * 0.8, hazeL: cam.dist * 1.6, zHaze: 0.28 });
    // data strip; the joke types in once the grain is on the fresh stub
    const nx = typedN('NEXT SAMPLE: 0001 (SAME)', t, 139.6, 30);
    this.drawStrip(renderer, comp, out, ppm * 10, 1 - smoothstep(140.4, 140.6, t), nx || 'UNIT 0001');
    const hit = pulse(t, T_STAMP, 0.09), sh = 14 * hit;
    return sePost({
      ca: 0.6 + 3 * hit, shake: [Math.sin(t * 210) * sh, Math.cos(t * 190) * sh] as [number, number], zoom: 1 + 0.012 * hit,
      fade: ease.inQuad(prog(t, 140.38, T_BEAM)),
    });
  }

  // ---- the loop: the opening plate with its own clock, beam blank, then its first frame
  private tail(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const sandT = 0.46 * prog(t, T_BEAM, T_BEAM + 0.8);
    const bl = prog(t, T_BLANK, T_FLAT);
    let ov: PostOverrides;
    // film frame 0 is bare ink (the opening plate at t = 0): its post settings come from sand itself, its picture is cleared here
    const ov0 = (this.sand.render({ ...f, t: 0 }, this.rt) ?? {}) as PostOverrides;
    if (t >= T_FLAT) {
      clearRT(renderer, out, LIN.ink);
      ov = ov0;
    } else if (bl <= 0) {
      ov = (this.sand.render({ ...f, t: sandT }, out) ?? {}) as PostOverrides;
    } else {
      // beam blank: the picture collapses to a line (vertical), the line shrinks to a dot, the dot dies
      clearRT(renderer, out, LIN.ink);
      ov = ov0;
      this.sand.render({ ...f, t: sandT }, this.rt);
      const kv = ease.inQuad(prog(bl, 0, 0.55)), kh = ease.inOutQuad(prog(bl, 0.55, 0.9));
      (this.sq.u.uSq!.value as THREE.Vector2).set(Math.max(0, 1 - kh), Math.max(0.0035, 1 - kv));
      this.sq.u.uHot!.value = bl < 0.55 ? kv : 1 - ease.inQuad(prog(bl, 0.8, 1));
      renderer.setRenderTarget(out);
      this.sq.render(renderer, out);
    }
    // the second line of the joke
    const nx = typedN('NEXT SAMPLE: 0001 (SAME)', t, 139.6, 30);
    const a = 1 - smoothstep(141.7, 141.95, t);
    if (nx && a > 0.01) {
      const c = this.text.ctx; this.text.clear();
      c.save(); c.globalAlpha = a; c.font = font(F.mono(500), 16); c.letterSpacing = '1px'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.fillStyle = 'rgba(238,233,223,0.9)'; c.fillText(nx, W - 40, H - 30); c.restore();
      comp.draw(renderer, this.text.upload(), out);
    }
    return { ...ov, se: ov.se ?? this.sand.seGrade };
  }

  /** the SE data strip, with its fields moved right of the gag's label (gag.ts parks `UNIT 0001  RETURN TO SENDER` at x 264) */
  private drawStrip(renderer: THREE.WebGLRenderer, comp: any, out: THREE.WebGLRenderTarget, ppm: number, alpha: number, tag: string) {
    if (alpha <= 0.001) return;
    const c = this.strip.ctx, SH = SEStrip.H;
    this.strip.clear();
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = '#0A0A0B'; c.fillRect(0, 0, W, SH);
    c.fillStyle = 'rgba(94,91,87,0.9)'; c.fillRect(0, 0, W, 1);
    const bar = seScaleBar(ppm, 'mm'), mono = (x: number, y: number, s: string, col: string, al: CanvasTextAlign = 'left', size = 14) => {
      c.font = font(F.mono(500), size); c.fillStyle = col; c.textAlign = al; c.textBaseline = 'alphabetic'; c.letterSpacing = '1px'; c.fillText(s, x, y); c.letterSpacing = '0px';
    };
    c.fillStyle = 'rgba(238,233,223,0.95)'; c.fillRect(40, 31, bar.px, 2); c.fillRect(40, 26, 2, 12); c.fillRect(38 + bar.px, 26, 2, 12);
    mono(40 + bar.px + 14, 36, bar.label, 'rgba(238,233,223,0.9)', 'left', 15);
    const mag = 127 / (W / ppm), magS = mag >= 1000 ? `${(mag / 1000).toFixed(1)} K X` : `${mag.toFixed(mag >= 10 ? 0 : 2)} X`;
    let x = 760;
    for (const [k, v] of [['EHT', '5.00 kV'], ['WD', '4.2 mm'], ['Mag', magS], ['Signal A', 'SE2'], ['LOT', '7A-0042']] as const) {
      mono(x, 22, k, 'rgba(156,151,143,0.85)', 'left', 12); mono(x, 40, v, 'rgba(238,233,223,0.78)', 'left', 15); x += 70 + (k.length + v.length) * 9;
    }
    mono(W - 40, 36, tag, 'rgba(238,233,223,0.95)', 'right', 16);
    c.restore();
    comp.draw(renderer, this.strip.upload(), out, { scale: [1, H / SH], offset: [0, 0.5 - H / (2 * SH) + (H - SH) / SH] });
  }

  // ---- the traveller as a texture (alpha = ink)
  private drawForm(t: number) {
    const c = this.form.ctx;
    this.form.clear();
    c.save();
    c.translate(-CARD.x0, -CARD.y0);
    drawDoc(c, t, this.T, 0);
    this.fields(c, t);
    this.whisper(c, t);
    c.restore();
    this.form.upload();
  }

  /** the stamp, as a mask: RESTRICTED in a double rule, worn rubber */
  private drawStampMask() {
    const c = this.stamp.ctx;
    this.stamp.clear();
    const cx = STC[0] * PX_U + (CARD.x0 + CARD.x1) / 2 - CARD.x0, cy = STC[1] * PX_U + (CARD.y0 + CARD.y1) / 2 - CARD.y0;
    const SW = 520, SH = 140;
    c.save();
    c.translate(cx, cy); c.rotate(SANG);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.lineWidth = 6; c.strokeRect(-SW / 2 + 3, -SH / 2 + 3, SW - 6, SH - 6); c.lineWidth = 2; c.strokeRect(-SW / 2 + 13, -SH / 2 + 13, SW - 26, SH - 26);
    c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    c.font = font(F.archivo(125, 900), 70); c.letterSpacing = '1px';
    const mw = c.measureText('RESTRICTED').width;
    c.font = font(F.archivo(125, 900), Math.floor(70 * Math.min(1, (SW - 60) / mw)));
    c.fillText('RESTRICTED', 0, 12);
    c.font = font(F.mono(700), 16); c.letterSpacing = '4px';
    c.fillText('ECCN 3A090 · LOT 7A-0042', 0, 44);
    const rnd = mulberry32(5);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) { c.globalAlpha = 0.25 + rnd() * 0.6; c.beginPath(); c.arc((rnd() - 0.5) * SW, (rnd() - 0.5) * SH, 0.4 + rnd() * rnd() * 1.8, 0, 6.3); c.fill(); }
    c.restore();
    this.stamp.upload();
    void hash;
  }

  /** the last mono fields of the traveller (as outro.ts) */
  private fields(c: CanvasRenderingContext2D, t: number) {
    const mono = (s: string, x: number, y: number, size: number, a: number, w = 600) => {
      if (!s) return;
      c.font = font(F.mono(w), size); c.letterSpacing = '0.8px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = INK(a); c.fillText(s, x, y);
      c.letterSpacing = '0px';
    };
    const caret = (on: boolean) => (on && Math.floor(t * 3) % 2 === 0 ? '▌' : '');
    const l1 = 'HELD AT SORT · NO LICENCE ON FILE', l2 = 'DISPOSITION: HOLD · RELEASE DENIED';
    const a1 = typedN(l1, t, T0 + 0.3), a2 = typedN(l2, t, T_NOW);
    mono(a1 + caret(a1.length < l1.length), 280, 812, 19, 0.9);
    mono(a2 + caret(a1.length >= l1.length && a2.length < l2.length && t < T_STAMP), 280, 850, 19, 0.9);
    mono(typedN('VALID: ALL WAFERS · ALL DESTINATIONS', t, 134.1, 34), 280, 888, 15, 0.6, 500);
    mono(typedN('M. OKAFOR · 3A090', t, 133.7, 22), 740, 934, 20, 0.85, 500);
    mono(`SERIAL 7A-0042-${String(Math.floor((Math.min(t, 135.7) - T0) * 8) + 1).padStart(4, '0')}`, 1356, 958, 12, 0.5, 500);
  }

  /** the whisper, written into the status box word by word (as outro.ts) */
  private whisper(c: CanvasRenderingContext2D, t: number) {
    const Y = 792, X = 1000, WD = 660, HT = 140;
    const lines: [Word[], number][] = [[this.w1, Y + 58], [this.w2, Y + 118]];
    c.save();
    c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.letterSpacing = '0px';
    for (const [words, y] of lines) {
      let size = 54;
      c.font = font(F.serif(600, true), size);
      const tw = c.measureText(words.map((w) => w.w).join(' ')).width;
      if (tw > WD - 50) { size = Math.floor((size * (WD - 50)) / tw); c.font = font(F.serif(600, true), size); }
      let wx = X + 26;
      for (const w of words) {
        const wd = c.measureText(w.w + ' ').width;
        const p = prog(t, w.start, w.start + (w.end - w.start) * 0.9);
        if (p > 0) { c.save(); c.beginPath(); c.rect(wx - 6, Y, wd * p + 12, HT); c.clip(); c.fillStyle = INK(0.9); c.fillText(w.w, wx, y); c.restore(); }
        wx += wd;
      }
    }
    c.restore();
  }

  override dispose() { this.shade.dispose(); this.rt.dispose(); this.sand.dispose(); this.form.texture.dispose(); this.stamp.texture.dispose(); }
}
