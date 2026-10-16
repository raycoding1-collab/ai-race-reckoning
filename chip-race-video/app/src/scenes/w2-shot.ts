// W2 THE SHOT (bars 4-8, 7.5-15.0 s, "Fifty thousand tin drops every second / shot by a laser, hotter than the sun"):
// one tin droplet's 20-microsecond life at the speed the lyric sets, as one continuous SE world (engine/se.ts).
// Merges the old `tin` and `laser` plates; both timeline entries point here and the render is a pure function of
// absolute song time, so the 11.25 s entry boundary (the pre-pulse "shot") is invisible.
//
//  Clock: one 16th note (117 ms) = one 20 us droplet period, 1 : 5,859 (so one real second lasts 1 h 38 min).
//  Model (world unit = 1 um until 14.3 s, then 1 u = 23.8 mm: the collector's own unit, so the last frames are w3's world):
//   - a co-moving column of 27 um tin droplets, spacing 50 um: each a metal SDF sphere with three families of capillary
//     ripples (azimuthal, latitudinal, fine); the hero (index 0) is the one sand's ignited atom becomes.
//   - the pre-pulse pancake: sphere -> ellipsoid disc (volume kept) -> toroidal rim with a thinning membrane (concentric
//     ripples, a hole opening) -> twenty mist droplets flung off the rim that evaporate.
//   - two laser pencils (SE_BEAM amber): a short thin pre-pulse (0.5 um) and a fat main pulse (3 um) arriving from -z;
//     the main pulse ignites a turbulent plasma ball (amber, then white-hot bone as the exposure falls).
//   - a sun bead at 1/40 of the plasma (the plasma is ~40x the sun's surface temperature): FOR COMPARISON.
//   - the collector (Mo/Si dish, laser hole, ~40 ring bands + the 6 zone rings of 70..470 px, hall back wall) is w3's own
//     SDF, 12 u behind the focus; the camera pulls back 3.7 decades from the droplet until the plasma is w3's bone disc.
//  Lyric to geometry: "Fifty" 7.50 / "thousand" 7.97 launch two droplets each (+-1, +-2), "tin" 8.44 tags the hero,
//  "drops" 8.91 dimensions the spacing, the 50,000 drum spools and locks at "second" 11.02, "every second" 9.61-11.0 a sweep
//  bar crawls (AT THIS SPEED, ONE SECOND LASTS 1 H 38 MIN); "shot" 11.25 pre-pulse flattens the hero; "laser" 11.95 main
//  pulse ignites; "hotter" 12.66 .. "sun" 13.59 the readout spools to 220,000 and the exposure falls, the sun bead is stamped;
//  14.0-15.0 the camera pulls back into the collector rings.
//  in : sand's last frame: the ignited lattice atom (amber disc, bone core, r ~ 62 px) at (600,470) = the hero droplet.
//  out: w3-machine's first frame: face-on collector at (960,540), amber zones, bone core disc (plasma), 6 rings 70..470 px.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, fitSize, layout } from '../engine/type';
import { strokeText, drawStrokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { clamp, ease, lerp, prog, pulse, smoothstep, frameIdx } from '../engine/util';
import { lineByScene } from './_motifs';
import { H_SAND_TIN, H_LASER_MACHINE, beamHead, beamParticles, mono } from './sand-kit';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam, type V3 } from '../engine/se';

// ------------------------------------------------------------------------------------------------ constants
const UM = 23800;                                   // um per collector unit u (u = 23.8 mm)
const T_SW = 14.3;                                  // world unit switches from um to u
const OFF_U: V3 = [0, 100, 12];                     // w3's position of the plasma focus P0 (u)
const PPM_W3 = H_LASER_MACHINE.radii[5]! / 24.0;    // px per u of w3's first frame
const PPM_E = PPM_W3 / UM;                          // px per um at the last frame
const RP_END = 3.2 * UM;                            // w3's plasma ball radius, um
const R_D = 13.5, S_D = 50;                         // droplet radius and spacing, um
const T_PB0 = 13.9, T_PB1 = 14.85;                  // the pull-back
const RINGS = H_LASER_MACHINE.radii.map((r) => r / PPM_W3);
const f1 = (x: number) => x.toFixed(4);
const HERO0 = { x: H_SAND_TIN.x, y: H_SAND_TIN.y }; // sand's atom
const HERO1 = { x: 1110, y: 500 };                  // the old laser plate's target
const T_PRE = 11.25, T_MAIN = 11.953;
const AZ_SIDE = 62, EL_SIDE = 14;

// ------------------------------------------------------------------------------------------------ GLSL
const WORLD = /* glsl */ `
uniform float uS, uT, uHot, uHeat, uM1, uM2, uM3, uAlive, uRp, uPlAmb, uTurb, uZone, uPenK, uPenR, uDropK, uRip, uDropOn, uFar;
uniform float uPres[8];
uniform vec3 uOff;
uniform vec4 uB1, uB2, uSun;
const float UM = ${f1(UM)};
const float DR = ${f1(R_D)}, DS = ${f1(S_D)};
const float RR[6] = float[6](${RINGS.map(f1).join(', ')});
#define SE_STEPS 64
#define SE_EPS 1.0
#define SE_SHADOW_STEPS 6

float shSmin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float segD(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }

/** capillary ripples on a sphere (relative radial displacement): azimuthal, latitudinal and fine families */
float ripple(vec3 q, float ph) {
  float L = max(length(q), 1.0e-3);
  vec3 n = q / L;
  float th = acos(clamp(n.y, -1.0, 1.0)), a = atan(n.z, n.x);
  return 0.030 * sin(6.0 * a + 2.4 * uT + ph) * (1.0 - n.y * n.y) + 0.016 * sin(9.0 * th - 4.1 * uT + 1.7 * ph)
       + 0.007 * sin(17.0 * a + 11.0 * th + 6.0 * uT + ph);
}
float sdDrop(vec3 q, float R, float ph) { return length(q) - R * (1.0 + uRip * ripple(q, ph)); }

/** the hero: sphere -> disc (volume kept) -> toroidal rim + thinning membrane (with a hole) */
float sdHero(vec3 q) {
  float R = DR;
  float rip = ripple(q, 0.0) * uRip * (1.0 - uM1);
  if (uM1 < 0.001) return length(q) - R * (1.0 + rip);
  float k = 1.0 + 2.0 * uM1;
  float Rr = R * k, Rz = max(R / (k * k), 2.8);
  float dE = seEllipsoid(q, vec3(Rr, Rr, Rz)) - R * rip;
  if (uM2 < 0.001) return dE;
  float rxy = length(q.xy);
  float Rt = Rr * 0.9;
  float rr = mix(Rz, 3.6, uM2);
  float dT = length(vec2(rxy - Rt, q.z)) - rr;
  float mem = mix(Rz, 0.30, uM2);
  float hole = uM3 * Rt * 0.62;
  float dM = max(max(rxy - Rt, abs(q.z) - mem), hole - rxy);
  float dTor = shSmin(dT, dM, 1.8);
  dTor -= 0.10 * sin(rxy * 1.7 - uT * 18.0) * uM2 * (1.0 - uM3) * (1.0 - smoothstep(Rt - 8.0, Rt - 2.0, rxy)) * smoothstep(0.0, 3.0, rxy);
  return mix(dE, dTor, uM2);
}

/** twenty droplets flung from the rim, evaporating */
float mistD(vec3 p) {
  float d = 1.0e5;
  for (int j = 0; j < 20; j++) {
    float fj = float(j);
    float h1 = fract(sin(fj * 12.9898 + 1.3) * 43758.5453), h2 = fract(sin(fj * 78.233 + 2.1) * 24634.6345), h3 = fract(sin(fj * 39.346 + 5.7) * 13287.2);
    float dt = uT - (11.70 + 0.12 * h3);
    if (dt < 0.0) continue;
    float rad = (0.55 + 0.9 * h2) * (1.0 - smoothstep(0.10, 0.34, dt));
    if (rad < 0.05) continue;
    float ph = 6.2832 * h1;
    vec3 c = vec3(cos(ph), sin(ph), 0.0) * (36.0 + (40.0 + 80.0 * h2) * dt) + vec3(0.0, 0.0, (h3 - 0.5) * 5.0 + (h1 - 0.5) * 30.0 * dt);
    d = min(d, length(p - c) - rad);
  }
  return d;
}

/** the droplet world (um): hero, column, pulses, mist, sun bead */
vec2 dropD(vec3 p) {
  float r = length(p);
  if (r > 1500.0) return vec2(r - 1400.0, 9.0);
  vec2 res = vec2(1.0e4, 9.0);
  if (uAlive > 0.03) res = vec2(sdHero(p / uAlive) * uAlive, 9.0);
  float cr = length(p.xz);
  if (uDropK > 0.01) {
    if (cr > 60.0) res.x = min(res.x, cr - 40.0);
    else {
      float iy = clamp(floor(p.y / DS + 0.5), -3.0, 4.0);
      int ii = int(iy);
      vec3 qq = vec3(p.x, p.y - iy * DS, p.z);
      float edge = DS * 0.5 - abs(qq.y) + 0.2;
      if (ii != 0) {
        float pr = uPres[ii + 3];
        float d = pr > 0.01 ? sdDrop(qq, DR * uDropK * pr, iy * 1.7) : edge + 11.0;
        res.x = min(res.x, d);
      } else res.x = min(res.x, edge + 11.0);
    }
  }
  if (uB1.w > 0.5) { float d = segD(p, vec3(0.0, 0.0, uB1.x), vec3(0.0, 0.0, uB1.y), uB1.z); if (d < res.x) res = vec2(d, 6.0); }
  if (uB2.w > 0.5) { float d = segD(p, vec3(0.0, 0.0, uB2.x), vec3(0.0, 0.0, uB2.y), uB2.z); if (d < res.x) res = vec2(d, 6.0); }
  if (uM2 > 0.6 && uT < 12.2) { if (r < 130.0) { float d = mistD(p); if (d < res.x) res = vec2(d, 9.0); } else res.x = min(res.x, r - 120.0); }
  if (uSun.w > 0.0) { float d = length(p - uSun.xyz) - uSun.w; if (d < res.x) res = vec2(d, 8.0); }
  return res;
}

/** w3's collector: Mo/Si dish with laser hole, ~40 ring bands + 6 zone rings, and the hall's back wall (p in um) */
vec2 collD(vec3 p) {
  vec3 pu = p / UM + vec3(0.0, 100.0, 12.0);
  vec3 q = pu - vec3(0.0, 100.0, 0.0);
  float r = length(q.xy), ly = q.z;
  const float R = 26.0, T = 14.3, k = 1.0 / 48.0;
  float ys = k * r * r;
  float gr = abs(seRep(r - 3.6, 0.55));
  ys -= 0.09 * (1.0 - smoothstep(0.03, 0.10, gr)) * step(3.6, r);
  for (int j = 0; j < 6; j++) ys -= 0.26 * (1.0 - smoothstep(0.05, 0.19, abs(r - RR[j])));
  float sl = inversesqrt(1.0 + 4.0 * k * k * r * r);
  float d = max(max((ly - ys) * sl, -(ly + T)), r - R);
  d = max(d, 3.2 - r);
  if (ly < -T + 0.35 * T) {
    float gb = min(abs(r - 0.52 * R), abs(r - 0.80 * R)) - 0.065 * R;
    d = max(d, -max(gb, ly - (-T + 0.2 * T)));
  }
  vec2 res = vec2(d, (ly - ys) > -0.26 * R ? 40.0 : 0.0);
  float dB = seRoundBox(pu - vec3(200.0, 42.5, -154.0), vec3(348.0, 172.5, 4.0), 0.2);
  if (pu.z < -145.0 && dB < 3.0) {
    float g = min(abs(seRep(pu.x, 40.0)) - 0.32, abs(seRep(pu.y + 30.0, 60.0)) - 0.32);
    dB = max(dB, -max(g, -(pu.z + 150.8)));
  }
  if (dB < res.x) res = vec2(dB, 2.0);
  return vec2(res.x * UM, res.y);
}

vec2 mapU(vec3 p) {
  vec2 res = vec2(1.0e7, 2.0);
  if (uDropOn > 0.5) res = dropD(p);
  if (uRp > 0.5) {
    vec3 n = p / max(length(p), 1.0e-3);
    float tb = sin(3.7 * n.x + uT * 6.0) * sin(3.1 * n.y - uT * 5.0) * sin(3.3 * n.z + uT * 7.0);
    float dp = length(p) - uRp * (1.0 + 0.05 * tb * uTurb);
    if (dp < res.x) res = vec2(dp, 7.0);
  }
  if (uFar > 0.5) {
    float r = length(p);
    if (r > 1.5e5) { vec2 c = collD(p); if (c.x < res.x) res = c; }
    else res.x = min(res.x, 2.5e5 - r);
    if (uPenK > 0.0) {
      float d = segD(p, vec3(0.0), vec3(0.0, 12.0, -9.4) * UM * uPenK, uPenR);
      if (d < res.x) res = vec2(d, 20.0);
    }
  }
  return res;
}
vec2 map(vec3 pw) { vec2 r = mapU((pw - uOff) / uS); return vec2(r.x * uS, r.y); }

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  t0 = 0.0; t1 = (uFar > 0.5 ? 8.0e6 : 3000.0) * uS;
  return true;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id > 39.5 && id < 40.5) return 0.85;
  if (id > 19.5 && id < 20.5) return 1.3;
  if (id > 8.5 && id < 9.5) return 0.80;
  if (id > 7.5 && id < 8.5) return 0.95;
  if (id > 6.5 && id < 7.5) return 1.35;
  return seMatZ(id);
}
float matAmber(float id, vec3 pw, vec3 n) {
  vec3 p = (pw - uOff) / uS;
  if (id > 5.5 && id < 6.5) return 0.99;
  if (id > 6.5 && id < 7.5) return clamp(uPlAmb * (0.84 + 0.16 * sin(p.x * 0.31 / max(uRp * 0.02, 0.1) + uT * 9.0)), 0.0, 0.99);
  if (id > 8.5 && id < 9.5) {
    float facing = -dot(n, uCamFwd);
    float core = 1.0 - 0.88 * smoothstep(0.50, 0.93, facing);
    float heat = uHeat * (0.5 + 0.5 * smoothstep(-0.2, 0.9, 1.0 - facing));
    return clamp(uHot * core + heat, 0.0, 0.99);
  }
  if (id > 19.5 && id < 20.5) return 0.99;
  if (id > 39.5 && id < 40.5) {
    vec3 pu = p / UM + vec3(0.0, 0.0, 12.0);
    return clamp(0.95 * (1.0 - smoothstep(9.5, 16.5, length(pu.xy))) * uZone, 0.0, 0.99);
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
uniform float uS;
uniform vec3 uOff;
const float UM = ${f1(UM)};
vec2 sePattern(float id, vec3 pw, vec3 n, float fw) {
  float mz = 1.0;
  if (id > 39.5 && id < 40.5) {
    // Mo/Si multilayer on the collector: 50 bilayers across the exaggerated coat; 5-layer bands when 50 cannot be resolved
    vec3 q = (pw - uOff) / uS / UM + vec3(0.0, 0.0, 12.0);
    float ly = q.z, r2 = dot(q.xy, q.xy);
    float R = 26.0, k = 1.0 / 48.0;
    float dc = k * r2 - ly;
    float per = 0.26 * R / 50.0;
    float wall = 1.0 - smoothstep(0.45, 0.85, abs(n.z));
    float fwu = fw / (uS * UM);
    float a1 = 1.0 - smoothstep(0.30, 0.85, fwu / per);
    float a2 = 1.0 - smoothstep(0.30, 0.85, fwu / (5.0 * per));
    float st = step(0.42, fract(dc / per));
    float g5 = step(0.5, fract(dc / (5.0 * per)));
    float fine = mix(1.0, mix(1.25, 0.58, st), wall * a1);
    float coarse = mix(1.0, mix(1.12, 0.80, g5), wall * a2 * (1.0 - a1));
    mz *= fine * coarse;
  }
  return vec2(mz, 0.0);
}`;

// ------------------------------------------------------------------------------------------------ camera (micro units, px per um)
interface CamS { az: number; el: number; ppm: number; dx: number; dy: number; e: number; tz: number }
const baseP = (t: number) => {
  if (t < T_PRE) return lerp(4.5, 4.9, prog(t, 7.5, T_PRE));
  if (t < 11.65) return lerp(4.9, 5.2, ease.outExpo(prog(t, T_PRE, 11.65)));
  return lerp(5.2, 4.2, prog(t, 11.65, T_PB0));
};
const pbK = (t: number) => ease.inOutCubic(prog(t, T_PB0, T_PB1));
function camS(t: number): CamS {
  const e = pbK(t);
  const sw = ease.inOutCubic(prog(t, 10.55, T_PRE));
  const pan = ease.outExpo(prog(t, T_PRE, 11.7));
  const ppm = Math.exp(lerp(Math.log(baseP(Math.min(t, T_PB0))), Math.log(PPM_E), e));
  return {
    az: AZ_SIDE * sw * (1 - e), el: EL_SIDE * sw * (1 - e), ppm, e,
    dx: lerp(HERO0.x - 960, HERO1.x - 960, pan) * (1 - e), dy: lerp(540 - HERO0.y, 540 - HERO1.y, pan) * (1 - e), tz: -12 * UM * e,
  };
}
/** the camera in micro coordinates (world = um, origin at the plasma focus) */
function camMicro(t: number): SECam {
  const c = camS(t);
  const c0 = seCamera([0, 0, c.tz], c.az, c.el, c.ppm);
  const tg: V3 = [0, 0, c.tz].map((v, i) => v - (c0.right[i]! * c.dx + c0.up[i]! * c.dy) / c.ppm) as V3;
  return seCamera(tg, c.az, c.el, c.ppm);
}
const rpAt = (t: number) => {
  if (t < T_MAIN) return 0;
  const grow = t < T_PB0 ? lerp(6, 55, ease.outExpo(prog(t, T_MAIN, 12.5))) + 13 * prog(t, 12.5, T_PB0) : 68;
  return t < T_PB0 ? grow : Math.exp(lerp(Math.log(68), Math.log(RP_END), pbK(t)));
};

// ------------------------------------------------------------------------------------------------ scene
const outlineWord = (c: CanvasRenderingContext2D, text: string, x: number, y: number, fam: string, size: number, p: number, colS: string, colU: string, lw = 1.5) => {
  c.font = font(fam, size); c.lineWidth = lw; c.lineJoin = 'round';
  const w = layout(text, fam, size).width;
  c.strokeStyle = colU; c.strokeText(text, x, y);
  if (p > 0) { c.save(); c.beginPath(); c.rect(x - 4, y - size * 1.2, (w + 8) * clamp(p), size * 1.6); c.clip(); c.strokeStyle = colS; c.strokeText(text, x, y); c.restore(); }
  return w;
};

export default class W2Shot extends Scene {
  override seGrade = 0;
  shade!: SEShade;
  strip = new SEStrip();
  hud = new Layer2D();
  lb = new LineBatch(20000);
  tinL: any; laserL: any;
  st!: StrokeText;
  chalkTimes: [number, number][] = [];
  chalkX = 862; chalkY = 800;
  uni!: Record<string, THREE.IUniform>;
  private pres = new Array(8).fill(1) as number[];

  override init() {
    this.tinL = lineByScene(this.ctx.lyrics, 'tin');
    this.laserL = lineByScene(this.ctx.lyrics, 'laser');
    const words = this.tinL.words.slice(2);
    this.st = strokeText(words.map((w: any) => w.w).join(' '), 'script', 138, 2);
    let ci = 0;
    words.forEach((w: any, wi: number) => {
      const n = Array.from(w.w as string).length;
      for (let i = 0; i < n; i++) this.chalkTimes[ci++] = [lerp(w.start, w.end, i / n), lerp(w.start, w.end, (i + 1) / n)];
      if (wi < words.length - 1) this.chalkTimes[ci++] = [w.end, w.end];
    });
    const v = (x: number) => ({ value: x });
    this.uni = {
      uS: v(1), uT: v(7.5), uHot: v(1), uHeat: v(0), uM1: v(0), uM2: v(0), uM3: v(0), uAlive: v(1), uRp: v(0), uPlAmb: v(0), uTurb: v(1), uZone: v(0),
      uPenK: v(0), uPenR: v(0.37 * UM), uDropK: v(1), uRip: v(1), uDropOn: v(1), uFar: v(0), uPres: { value: this.pres },
      uOff: { value: new THREE.Vector3() },
      uB1: { value: new THREE.Vector4(0, 0, 0.5, 0) }, uB2: { value: new THREE.Vector4(0, 0, 3, 0) }, uSun: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 1.5, scale: 0.4 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick, u = this.uni;
    const uMode = t >= T_SW;
    const S = uMode ? 1 / UM : 1;
    // ---- uniforms
    u.uS!.value = S; u.uT!.value = t;
    (u.uOff!.value as THREE.Vector3).set(...(uMode ? OFF_U : [0, 0, 0] as V3));
    u.uDropOn!.value = uMode ? 0 : 1;
    u.uFar!.value = t >= T_PB0 ? 1 : 0;
    u.uHot!.value = 1 - prog(t, 7.5, 8.2, ease.outQuad);
    u.uHeat!.value = t < T_PRE ? 0 : 0.30 * smoothstep(T_PRE, T_PRE + 0.12, t) + 0.45 * smoothstep(11.6, T_MAIN, t);
    u.uM1!.value = ease.outCubic(prog(t, T_PRE, 11.50));
    u.uM2!.value = ease.inOutQuad(prog(t, 11.42, 11.78));
    u.uM3!.value = prog(t, 11.62, 11.95);
    u.uAlive!.value = t < T_MAIN ? 1 : Math.max(0.02, 1 - ease.outQuad(prog(t, T_MAIN, 12.12)));
    u.uRip!.value = 1 + 2.5 * pulse(t, T_PRE, 0.1) * (t >= T_PRE ? 1 : 0);
    u.uDropK!.value = 1 - smoothstep(T_PRE, 11.6, t);
    u.uRp!.value = rpAt(t);
    u.uPlAmb!.value = 0.97 * (1 - smoothstep(12.66, 13.59, t));
    u.uTurb!.value = 1 - smoothstep(13.7, 14.2, t);
    u.uZone!.value = smoothstep(14.0, 14.7, t);
    u.uPenK!.value = smoothstep(14.55, 14.85, t);
    for (let i = -3; i <= 4; i++) {
      const tl = 7.5 + 0.469 * (Math.abs(i) - 1), k = clamp((t - tl) / 0.16);
      this.pres[i + 3] = i === 0 ? 1 : ease.outBack(k);
      if (i !== 0 && t < tl) this.pres[i + 3] = 0;
    }
    // pulses: thin pre-pulse, fat main pulse, both arriving from -z along the laser axis
    const b1 = u.uB1!.value as THREE.Vector4, b2 = u.uB2!.value as THREE.Vector4;
    if (t >= T_PRE && t < 11.33) {
      const head = Math.min(-300 + ((t - T_PRE) / 0.035) * 300, -4);
      const tail = t < 11.285 ? head - 110 : -4 - 110 + ((t - 11.285) / 0.04) * 110;
      b1.set(tail, head, 0.5, 1);
    } else b1.set(0, 0, 0.5, 0);
    if (t >= T_MAIN && t < 12.36) {
      const head = Math.min(-300 + ((t - T_MAIN) / 0.04) * 300, -6);
      b2.set(-300, head, 3.0 * (1 - 0.5 * prog(t, 12.0, 12.36)), 1);
    } else b2.set(0, 0, 3, 0);
    const rp = rpAt(t);
    const bead = t >= 13.59 && t < T_SW ? ease.outBack(prog(t, 13.59, 13.75)) : 0;
    (u.uSun!.value as THREE.Vector4).set(0, 0, -(Math.min(rp, 68) + 26), (Math.min(rp, 68) / 40) * bead);

    // ---- camera (micro), converted to the current world
    const cm = camMicro(t);
    const off = uMode ? OFF_U : ([0, 0, 0] as V3);
    const cam: SECam = { ...cm, pos: [cm.pos[0] * S + off[0], cm.pos[1] * S + off[1], cm.pos[2] * S + off[2]], dist: cm.dist * S };
    u.uPenR!.value = clamp((cm.dist / UM) * 0.0034, 0.26, 2.4) * UM;
    this.shade.gbuf.u.uCavL!.value = uMode ? 1.2 : 1.5;
    const cs = camS(t);
    const c1 = camS(t - 1 / 30), c2 = camS(t + 1 / 30);
    const motion = clamp(0.2 + 0.35 * Math.abs(Math.log(c2.ppm / c1.ppm)) * 30 + (Math.abs(c2.az - c1.az) * 30) / 90 + ((Math.abs(c2.dx - c1.dx) + Math.abs(c2.dy - c1.dy)) * 30) / 900, 0, 0.75);
    this.shade.render(renderer, out, cam, {
      frame: frameIdx(t), motion, kick, reveal: 2, rim: 0.95, focus: cam.dist * 0.9, hazeL: cam.dist * 6.329, zHaze: 0.32,
    });

    // ---- overlays
    const T = this.hud; T.clear();
    const L = this.lb; L.clear();
    const x = T.ctx;
    this.drawHud(x, L, cm, cs, t);
    comp.draw(renderer, T.upload(), out);
    L.render(renderer, out);
    this.strip.composite(renderer, comp, out, { ppm: cs.ppm, unit: 'um', alpha: smoothstep(7.7, 8.0, t) * (1 - smoothstep(14.3, 14.6, t)), unitTag: 'UNIT 0001' });

    const down = pulse(t, 7.5, 0.09);
    return sePost({
      ca: 0.6 + 3 * kick * smoothstep(7.6, 7.8, t) * (1 - smoothstep(14.4, 14.8, t)) + 5 * pulse(t, T_MAIN, 0.08),
      zoom: 1 + 0.02 * down + 0.012 * pulse(t, T_PRE, 0.08) + 0.03 * pulse(t, T_MAIN, 0.08),
      shake: [10 * pulse(t, T_MAIN, 0.06) * Math.sin(t * 913), 10 * pulse(t, T_MAIN, 0.06) * Math.cos(t * 701)],
    });
  }

  private drawHud(x: CanvasRenderingContext2D, L: LineBatch, cm: SECam, cs: CamS, t: number) {
    const fade = 1 - smoothstep(14.4, 14.85, t);
    if (fade <= 0.001) return;
    const bone = (a: number) => rgba('bone', a * fade);
    const amber = (a: number) => rgba('signal', a * fade);
    const hero = seProject(cm, [0, 0, 0]);
    const lyr = F.archivo(100, 900);
    x.globalAlpha = 1;
    // ---- chrome: header and the slow-motion clock
    mono(x, 'EUV SOURCE · STEP 03/31 · LOT 7A-0042', 112, 96, 14, bone(0.5), 500, 'left', 1.5);
    mono(x, 'SLOW-MOTION  1 : 5,859   ·   1 / 16 NOTE (117 ms)  =  20 µs  (REAL)', 112, 1004, 14, bone(0.55 * smoothstep(7.8, 8.1, t)), 500, 'left', 1.5);

    // ---- bars 4-5: the slate (right) and the hero's tag / spacing (left)
    const ui = (1 - smoothstep(T_PRE, T_PRE + 0.1, t)) * fade;
    if (ui > 0.001) {
      x.globalAlpha = ui;
      const w = this.tinL.words, X0 = 860, X1 = 1808;
      x.fillStyle = rgba('bone', 0.35); x.fillRect(X0, 112, X1 - X0, 1.2); x.fillRect(X0, 160, X1 - X0, 1.2);
      mono(x, 'SCENE 02 · Sn DROPLET GENERATOR', X0, 145, 16, rgba('bone', 0.85), 600, 'left', 1.5);
      mono(x, 'STROBE 1/4 · ROLL 7A', X1, 145, 16, rgba('bone', 0.5), 500, 'right', 1.5);
      const fam = F.archivo(75, 900);
      let xx = X0;
      for (const wi of [0, 1]) { const ww = outlineWord(x, w[wi].w.toUpperCase(), xx, 292, fam, 118, wordP(w[wi], t), rgba('bone', 1), rgba('bone', 0.28)); xx += ww + 30; }
      this.drum(x, t, X0, X1, 590);
      mono(x, 'DROPS / SECOND', X0, 640, 16, rgba('bone', 0.6), 600, 'left', 3);
      mono(x, 'Sn · ⌀ 27 µm · 50,000 Hz', X1, 640, 16, rgba('bone', 0.5), 500, 'right', 1);
      // "tin drops every second", chalked by the beam
      const len = writtenLength(this.st, this.chalkTimes, t);
      x.save(); x.translate(this.chalkX, this.chalkY); x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = rgba('bone', 0.95); x.lineWidth = 3.2;
      const head = drawStrokeText(x, this.st, len);
      x.restore();
      const writing = t > w[2].start - 0.02 && t < w[5].end + 0.05;
      if (head && writing) {
        beamHead(L, this.chalkX + head.x, this.chalkY + head.y, t, 0.9, ui);
        beamParticles(L, t, (tb) => {
          if (tb < w[2].start || tb > w[5].end) return null;
          const h = headAt(this.st, writtenLength(this.st, this.chalkTimes, tb));
          return h ? { x: this.chalkX + h.x, y: this.chalkY + h.y } : null;
        }, { rate: 110, speed: 200, life: 0.35, intensity: ui });
      }
      // the sweep bar: at this speed one second lasts 1 h 38 min
      const sp = prog(t, 9.6094, 11.0156);
      if (sp > 0) {
        x.fillStyle = rgba('bone', 0.3); x.fillRect(862, 904, X1 - 862, 1.2);
        x.fillStyle = rgba('signal', 1); x.fillRect(862, 902.5, (X1 - 862) * sp, 3);
        mono(x, 'AT THIS SPEED, ONE SECOND LASTS 1 H 38 MIN', 862, 936, 15, rgba('bone', 0.75), 500, 'left', 1.5);
      }
      // "tin": the hero is tagged; "drops": the spacing is dimensioned
      const R = R_D * cs.ppm;
      const tg = smoothstep(8.44, 8.6, t);
      if (tg > 0) {
        x.strokeStyle = rgba('bone', 0.6 * tg); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(hero.x - R * 0.72, hero.y - R * 0.72); x.lineTo(hero.x - R * 1.1 - 30, hero.y - R * 1.1 - 30); x.lineTo(330, hero.y - R * 1.1 - 30); x.stroke();
        mono(x, 'Sn DROPLET', 330, hero.y - R * 1.1 - 40, 16, rgba('bone', 0.95 * tg), 600, 'left', 1.5);
        mono(x, '⌀ 27 µm', 330, hero.y - R * 1.1 - 18, 14, rgba('bone', 0.6 * tg), 500, 'left', 1.5);
      }
      const dk = smoothstep(8.91, 9.1, t);
      if (dk > 0) {
        const p1 = seProject(cm, [0, S_D, 0]), p2 = seProject(cm, [0, -S_D, 0]);
        const bx = hero.x + R + 40;
        x.strokeStyle = rgba('bone', 0.6 * dk); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(bx, p1.y); x.lineTo(bx, p2.y);
        for (const yy of [p1.y, hero.y, p2.y]) { x.moveTo(bx - 8, yy); x.lineTo(bx + 8, yy); }
        x.stroke();
        mono(x, `Δ ${S_D} µm`, bx + 14, (hero.y + p1.y) / 2 + 5, 15, rgba('bone', 0.9 * dk), 600, 'left', 1);
        mono(x, '= 1 DROPLET PERIOD', bx + 14, (hero.y + p1.y) / 2 + 25, 12, rgba('bone', 0.55 * dk), 500, 'left', 1);
      }
      x.globalAlpha = 1;
    }

    // ---- bars 6-7: the laser plate's layout
    const lw = this.laserL.words;
    if (t >= T_PRE - 0.3) {
      const la = (1 - smoothstep(14.3, 14.75, t)) * fade;
      x.globalAlpha = la;
      let lx = 112;
      for (const i of [0, 1, 2]) {
        const wi = layout(lw[i].w.toUpperCase(), lyr, 128).width, x0 = lx; lx += wi + 40;
        if (t < lw[i].start - 0.3) continue;
        outlineWord(x, lw[i].w.toUpperCase(), x0, 300, lyr, 128, wordP(lw[i], t), rgba('bone', 1), rgba('bone', 0.28));
      }
      if (t >= T_MAIN) {
        const pop = 1 + 0.10 * pulse(t, T_MAIN, 0.06);
        x.save(); x.translate(104, 660); x.scale(pop, pop);
        outlineWord(x, 'LASER,', 0, 0, F.archivo(125, 900), 250, 1, rgba('bone', 1 - 0.5 * prog(t, 13.0, 14.0)), rgba('bone', 0.3), 1.8);
        x.restore();
      }
      if (t >= lw[4].start - 0.05) {
        const hf = F.archivo(112.5, 900);
        outlineWord(x, 'HOTTER', 112, 880, hf, 150, wordP(lw[4], t), rgba('signal', 1), rgba('bone', 0.28));
        const hw = layout('HOTTER', hf, 150).width;
        const thin = F.archivo(100, 700);
        const tw = outlineWord(x, 'THAN', 112 + hw + 30, 880, thin, 70, wordP(lw[5], t), rgba('bone', 1), rgba('bone', 0.28));
        outlineWord(x, 'THE', 112 + hw + 30, 810, thin, 70, wordP(lw[6], t), rgba('bone', 1), rgba('bone', 0.28));
        if (t >= lw[7].start - 0.05) outlineWord(x, 'SUN', 112 + hw + 30 + tw + 22, 880, thin, 70, wordP(lw[7], t), rgba('signal', 1), rgba('bone', 0.28));
      }
      x.globalAlpha = fade;
      // the pulses name themselves
      const pa = (a: number, b: number, c: number, d: number) => smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
      mono(x, 'PRE-PULSE · CO2 10.6 µm · FLATTENS', 1500, hero.y - 50, 15, rgba('signal', pa(T_PRE, T_PRE + 0.05, 11.7, 11.9) * fade), 600, 'left', 1.5);
      mono(x, 'MAIN PULSE · CO2 10.6 µm · IGNITES', 1500, hero.y - 50, 15, rgba('signal', pa(T_MAIN, T_MAIN + 0.05, 12.4, 12.6) * fade), 600, 'left', 1.5);
      // the joke tag on the pancake
      const ja = pa(11.4, 11.55, 11.8, 11.95) * fade;
      if (ja > 0.01) {
        const rim = seProject(cm, [0, -R_D * 2.7 * 0.9, 0]);
        x.strokeStyle = rgba('bone', 0.65 * ja); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(rim.x, rim.y); x.lineTo(rim.x + 40, 700); x.lineTo(1150, 700); x.stroke();
        x.fillStyle = rgba('bone', 0.9 * ja); x.beginPath(); x.arc(rim.x, rim.y, 2.6, 0, Math.PI * 2); x.fill();
        mono(x, 'TARGET 1 OF 50,000.', 1150, 694, 17, rgba('bone', 0.95 * ja), 600, 'left', 1.5);
        mono(x, 'HIT TWICE: ONCE TO FLATTEN,', 1150, 720, 15, rgba('bone', 0.8 * ja), 500, 'left', 1.5);
        mono(x, 'ONCE TO IGNITE.', 1150, 742, 15, rgba('signal', ja), 600, 'left', 1.5);
      }
      // 220,000 C: the readout spools while the exposure falls
      const ra = smoothstep(lw[4].start, lw[4].start + 0.15, t) * (1 - smoothstep(14.3, 14.75, t)) * fade;
      if (ra > 0.01) {
        const v = Math.round(220000 * ease.outCubic(prog(t, lw[4].start, 13.6)));
        const s = `${v.toLocaleString('en-US')} °C`;
        x.globalAlpha = ra;
        const pop = 1 + 0.05 * pulse(t, 13.6, 0.08) * (t >= 13.6 ? 1 : 0);
        x.save(); x.translate(1790, 210); x.scale(pop, pop); x.textAlign = 'right';
        x.font = font(F.archivo(100, 900), 88); x.lineWidth = 1.8; x.strokeStyle = t >= 13.6 ? rgba('ember', 1) : rgba('bone', 0.95); x.strokeText(s, 0, 0);
        x.restore();
        const kx = smoothstep(13.6, 13.75, t);
        if (kx > 0) {
          x.textAlign = 'right'; x.font = font(F.archivo(125, 900), 72); x.lineWidth = 1.6; x.strokeStyle = rgba('bone', kx); x.strokeText('×40', 1790, 300);
          mono(x, 'Sn PLASMA · ~40× THE SUN’S SURFACE', 1790, 332, 15, rgba('bone', 0.65 * kx), 500, 'right', 1);
        }
        x.textAlign = 'left';
      }
      // the sun bead, stamped at scale
      if (t >= 13.59 && t < T_SW) {
        const bp = seProject(cm, [0, 0, -(68 + 26)]);
        const ba = smoothstep(13.62, 13.8, t) * (1 - smoothstep(14.1, 14.3, t)) * fade;
        x.globalAlpha = ba;
        x.strokeStyle = rgba('bone', 0.6); x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(bp.x, bp.y + 12); x.lineTo(bp.x, bp.y + 46); x.stroke();
        mono(x, '☉ SUN  5,500 °C', bp.x, bp.y + 66, 15, rgba('bone', 0.95), 600, 'center', 1);
        mono(x, 'FOR COMPARISON', bp.x, bp.y + 86, 13, rgba('signal', 1), 600, 'center', 2);
        x.textAlign = 'left';
      }
      x.globalAlpha = 1;
    }
    void amber; void bone;
  }

  /** the 50,000 odometer: a fast drum that locks (in amber) at "second" */
  private drum(x: CanvasRenderingContext2D, t: number, X0: number, X1: number, y: number) {
    const cf = F.archivo(87.5, 900);
    const size = Math.min(290, fitSize('50,000', cf, X1 - X0 + 6));
    const lay = layout('50,000', cf, size);
    const lock = t >= 11.0156;
    const v = 50000 * ease.inOutQuad(prog(t, 7.55, 11.0156));
    const pop = lock ? 1 + 0.04 * pulse(t, 11.0156, 0.08) : 1;
    x.save(); x.translate(X0 - 6, y); x.scale(pop, pop);
    x.font = font(cf, size); x.lineWidth = 2.2; x.lineJoin = 'round';
    x.strokeStyle = lock ? rgba('signal', 1) : rgba('bone', 0.95);
    const posOf: Record<number, number> = { 0: 4, 1: 3, 3: 2, 4: 1, 5: 0 };
    for (const g of lay.glyphs) {
      const pos = posOf[g.i];
      if (pos === undefined || lock) { x.strokeText(g.ch, g.x, 0); continue; }
      const val = v / Math.pow(10, pos), d = Math.floor(val) % 10, fr = val - Math.floor(val);
      x.save(); x.beginPath(); x.rect(g.x - 2, -size * 0.8, g.w + 4, size * 0.92); x.clip();
      x.strokeText(String(d), g.x, size * -fr * 1.05);
      x.strokeText(String((d + 1) % 10), g.x, size * 1.05 * (1 - fr));
      x.restore();
    }
    x.restore();
  }

  override dispose() { this.shade.dispose(); }
}

import { Lyrics, type Word } from '../engine/lyrics';
const wordP = (w: Word, t: number) => Lyrics.wordProgress(w, t);

/** head position of a stroke text at written length `len` (no drawing) */
function headAt(st: StrokeText, len: number): { x: number; y: number } | null {
  for (let i = 0; i < st.strokes.length; i++) {
    const s0 = st.startLen[i]!, Ls = st.lens[i]!, pts = st.strokes[i]!;
    const tot = Ls[Ls.length - 1] ?? 0;
    if (len > s0 + tot && i < st.strokes.length - 1) continue;
    const r = clamp(len - s0, 0, tot);
    let j = 1; while (j < pts.length - 1 && Ls[j]! < r) j++;
    const a = pts[j - 1]!, b = pts[j]!;
    const k = (r - Ls[j - 1]!) / Math.max(1e-6, Ls[j]! - Ls[j - 1]!);
    return { x: a.x + (b.x - a.x) * clamp(k), y: a.y + (b.y - a.y) * clamp(k) };
  }
  return null;
}
