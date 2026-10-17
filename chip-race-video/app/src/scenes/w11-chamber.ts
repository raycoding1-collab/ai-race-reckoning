// W11 THE CHAMBER (bars 22-26, the post-chorus chant "weapon now, oh oh oh" x2): a six-stub SEM specimen carousel
// shaped like a revolver cylinder (flutes, chamfered chambers, ball detent; no gun body), hand-built and shaded as a
// scanning-electron micrograph (engine/se.ts: SDF world -> half-res G-buffer -> semShade). Replaces the 8-bit game.
//
//  Model (world unit = 0.1 mm): turntable base with a 72-tick graduated ring on a stage with a tapped-hole grid; the
//  carousel cylinder (six flutes, six chamfered pockets, engraved numerals 1-6, a rosette and a centre pin); a ball
//  plunger that rides the flank and drops into a dimple at each lock; six 12.7 mm pin stubs on carbon tape, each holding
//  one hand-built specimen: 1 a quartz grain (UNIT 0001: hexagonal prism, rhombohedral points, chips, striations),
//  2 a tin droplet (capillary modes ringing after each click, wetting skirt, satellites; amber = the tin element map),
//  3 a ball-bond wire loop (die, adhesive, pads, balls, three gold loops, stitches on copper leads), 4 a wafer coupon
//  (notch, scribe lanes, stitched-field seams, edge bead, data-matrix serial), 5 a GPU package (substrate, caps,
//  interposer, die floorplan, six HBM stacks with layer lines), 6 nothing (tape, a peeled tab, a lint fibre).
//  Lyric to geometry: the six "oh"s are the six chambers: each oh locks the next chamber under the beam (the cylinder
//  clicks 60 deg, the first a half step off the land it starts on) and its mouth rings amber while the note is held;
//  "weapon" / "now" raise the extruded words on the stage (amber, then cooling to bone) in both chants. The second chant
//  spins the carousel up one full turn ("weapon now"), then clicks 4, 5 and 6: CHAMBER 6: EMPTY.
//  Joke: the tag beside the beam climbs a status ladder (RESTRICTED, NOT CONTROLLED, NOT CONTROLLED, DUAL-USE, WEAPON)
//  and ends on `CHAMBER 6: EMPTY  NOT CONTROLLED (YET)`. The scale bar tells each specimen's true size.
//  in : down1's last frame: ink with one full-height amber vertical line (10 px) at x = 960. Here the line is the electron
//       beam, the whole world is dark and the image is rastered in behind a scan line while the camera falls down the beam.
//  out: the picture collapses (beam blank) to one full-width 4 px line at y = H/2, HDR (3.2, 2.6, 1.6) on ink: the same
//       line hbm's first frames draw. The last stub (chamber 6, empty) is the base the tower is built on: the camera
//       has dropped to its tape edge-on before the collapse.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { clamp, lerp, smoothstep, frameIdx, TAU } from '../engine/util';
import { linesByScene } from './_motifs';
import { SEShade, SEStrip, seCamera, seProject, sePost, type SECam } from '../engine/se';
import { worldGLSL, SHADE_GLSL } from './w11-chamber-glsl';
import type { Word } from '../engine/lyrics';

// ------------------------------------------------------------------------------------------------ constants
const T0 = 41.25, T1 = 48.75;
const RCH = 265, SY = 319.5;
const BEAT = 60 / 128;
// lettering on the stage in front of the base
const TXPX = 2.1, TXW = 1760 / TXPX, TXH = 256 / TXPX, LZ = 690, LH = 40;
// the chamber tag: its own canvas covering (TAGX, TAGY) .. +(TAGW, TAGH) of the frame
const TAGX = 60, TAGY = 96, TAGW = 940, TAGH = 600;
/** true size of one world unit (mm) for each specimen: the scale bar tells the truth about every chamber */
const MM_PER_UNIT = [0.0135, 0.00045, 0.0057, 2.78, 1.1, 0.1];
const WD = ['4.2 mm', '6.1 mm', '5.3 mm', '3.1 mm', '7.4 mm', '4.2 mm'];

const TAGS = [
  { name: 'QUARTZ GRAIN', spec: 'DIA 0.62 mm   SiO2   UNIT 0001', status: 'RESTRICTED' },
  { name: 'TIN DROPLET', spec: 'DIA 27 um   Sn', status: 'NOT CONTROLLED' },
  { name: 'BOND WIRE', spec: 'DIA 25 um   Au', status: 'NOT CONTROLLED' },
  { name: 'WAFER', spec: 'DIA 300 mm   Si', status: 'DUAL-USE' },
  { name: 'GPU DIE', spec: '814 mm2   Si   6 HBM', status: 'WEAPON' },
  { name: 'EMPTY', spec: 'NO SAMPLE', status: 'NOT CONTROLLED (YET)' },
];

// ------------------------------------------------------------------------------------------------ the carousel's motion
/** step response of the detent: fast, damped, ~4% overshoot */
function lockStep(tau: number) {
  if (tau <= 0) return 0;
  const w = 64, z = 0.72, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * tau));
}
const D30 = Math.PI / 6, D60 = Math.PI / 3;
const SPIN_T0 = 45.0, SPIN_T1 = 46.3;

// ------------------------------------------------------------------------------------------------ camera path
// [t, elevation deg, azimuth deg, px per unit, target x, y, z]
const CAMK: number[][] = [
  [41.25, 7, 0, 0.62, 0, 1500, RCH],
  [41.40, 14, -1, 0.70, 0, 900, RCH],
  [41.62, 30, -5, 0.84, 0, 420, 200],
  [42.00, 40, -7, 0.93, 0, 330, 150],
  [42.40, 42, -3, 1.00, 0, 320, 160],
  [42.66, 38, 0, 1.45, 0, 322, 230],
  [43.13, 36, 0, 1.85, 0, 322, 252],
  [44.20, 32, 2, 2.80, 4, 326, 258],
  [44.70, 46, -10, 1.00, 0, 320, 120],
  [45.50, 54, -4, 0.92, 0, 300, 40],
  [46.30, 48, 10, 1.00, 0, 306, 90],
  [46.41, 40, 4, 1.55, 0, 322, 225],
  [46.88, 38, 0, 1.95, 0, 322, 250],
  [47.70, 30, 0, 2.60, 0, 324, 262],
  [48.25, 12, 0, 3.90, 0, 324, 264],
  [48.60, 4, 0, 5.50, 0, 322, 265],
  [48.80, 3, 0, 5.80, 0, 322, 265],
];
function hermite(col: number, t: number, lg = false): number {
  const K0 = CAMK;
  const K = lg ? K0.map((r) => r.map((x, i) => (i === col ? Math.log(x) : x))) : K0;
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
export function camAt(t: number, kick = 0): SECam {
  const punch = 1 + 0.012 * kick * smoothstep(42.3, 42.6, t) * (1 - smoothstep(48.0, 48.3, t));
  // ppm is interpolated in log space (a zoom is exponential)
  const ppm = Math.exp(hermite(3, t, true));
  return seCamera([hermite(4, t), hermite(5, t), hermite(6, t)], hermite(2, t), hermite(1, t), ppm * punch);
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

/** "WEAPON NOW" in Archivo 900 as a signed-distance atlas (world units, + outside) and a word-index atlas. */
function makeLettering(words: string[]) {
  const AW = 2048, AH = 256;
  const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, AW, AH);
  const fam = F.archivo(87.5, 900);
  const text = words.join(' ');
  c.font = font(fam, 200); (c as any).letterSpacing = '4px';
  const w0 = c.measureText(text).width;
  const size = (200 * 1760) / w0;
  c.font = font(fam, size); (c as any).letterSpacing = `${4 * size / 200}px`;
  const width = c.measureText(text).width, x0 = (AW - width) / 2;
  const cap = c.measureText('H').actualBoundingBoxAscent;
  c.fillStyle = '#fff'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillText(text, x0, AH / 2 + cap / 2);
  const b: number[] = [];
  const spaceW = c.measureText(' ').width;
  for (let k = 1; k < words.length; k++) b.push(x0 + c.measureText(words.slice(0, k).join(' ')).width + spaceW / 2);
  const img = c.getImageData(0, 0, AW, AH).data;
  const inside = new Uint8Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) inside[i] = img[i * 4]! > 127 ? 1 : 0;
  const INF = 1e20;
  const a = new Float32Array(AW * AH), bb = new Float32Array(AW * AH);
  for (let i = 0; i < AW * AH; i++) { a[i] = inside[i] ? 0 : INF; bb[i] = inside[i] ? INF : 0; }
  edt(a, AW, AH); edt(bb, AW, AH);
  const sdf = new Uint16Array(AW * AH), ids = new Uint8Array(AW * AH);
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      const i = y * AW + x;
      const sd = inside[i] ? -(Math.sqrt(bb[i]!) - 0.5) : Math.sqrt(a[i]!) - 0.5;
      sdf[i] = THREE.DataUtils.toHalfFloat(clamp(sd, -40, 40) / TXPX);
      let id = 0;
      for (const bx of b) if (x > bx) id++;
      ids[i] = id;
    }
  }
  const tS = new THREE.DataTexture(sdf, AW, AH, THREE.RedFormat, THREE.HalfFloatType);
  tS.minFilter = tS.magFilter = THREE.LinearFilter; tS.generateMipmaps = false; tS.needsUpdate = true;
  const tI = new THREE.DataTexture(ids, AW, AH, THREE.RedFormat, THREE.UnsignedByteType);
  tI.minFilter = tI.magFilter = THREE.NearestFilter; tI.generateMipmaps = false; tI.needsUpdate = true;
  return { sdf: tS, ids: tI };
}

/** the six engraved numerals as a 768 x 128 atlas */
function makeNumerals() {
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, 768, 128);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = font(F.mono(700), 104);
  const cap = c.measureText('8').actualBoundingBoxAscent;
  for (let i = 0; i < 6; i++) c.fillText(String(i + 1), i * 128 + 64, 64 + cap / 2);
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ the final pass: stage-move smear and the beam-blank collapse
const FINAL = /* glsl */ `
uniform sampler2D uSrc;
uniform float uC, uSm, uLine;
void main() {
  float k = max(1.0 - uC, 0.0015);
  vec2 su = vec2(vUv.x, 0.5 + (vUv.y - 0.5) / k);
  vec3 col = vec3(0.0);
  if (uC < 0.999 && su.y > 0.0 && su.y < 1.0) {
    if (uSm < 0.5) col = texture(uSrc, su).rgb;
    else {
      float ws = 0.0;
      for (int i = -5; i <= 5; i++) {
        float w = 1.0 - abs(float(i)) / 6.0;
        col += w * texture(uSrc, su + vec2(float(i) * 0.2 * uSm / 1920.0, 0.0)).rgb; ws += w;
      }
      col /= ws;
    }
  }
  float dpx = abs(vUv.y - 0.5) * 1080.0;
  col += vec3(3.2, 2.6, 1.6) * uLine * (1.0 - smoothstep(1.6, 2.6, dpx));
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ the scene
export default class W11Chamber extends Scene {
  override seGrade = 0;
  shade!: SEShade;
  strip = new SEStrip();
  tag = new Layer2D(TAGW, TAGH);
  private rtA = makeRT(W, H, { depthBuffer: false });
  private fin!: FSPass;
  private uni!: Record<string, THREE.IUniform>;
  private texs: THREE.Texture[] = [];
  /** the six "oh"s: lock times and note ends; the "weapon" / "now" starts of each chant */
  oh: Word[] = [];
  wn: Word[][] = [];

  override init() {
    const L = linesByScene(this.ctx.lyrics, 'post1') as { words: Word[] }[];
    this.wn = L.map((l) => l.words.slice(0, 2));
    this.oh = L.flatMap((l) => l.words.slice(2, 5));
    // the quartz crystal's frame: c-axis, and two perpendicular axes
    const A = norm([0.82, 0.30, 0.48]);
    const U = norm(cross(A, [0, 1, 0]));
    const V = cross(A, U);
    const lt = makeLettering(['WEAPON', 'NOW']);
    const num = makeNumerals();
    this.texs.push(lt.sdf, lt.ids, num);
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(T0), uRot: { value: new THREE.Vector2(1, 0) }, uVis: v(1), uRev: v(2), uFocusK: v(0.85), uDet: v(0), uSink: v(0), uAge: v(9), uBeamOn: v(1),
      uFlash: { value: [0, 0, 0, 0, 0, 0] }, uWordT: { value: [T0, T0] },
      uTextSdf: { value: lt.sdf }, uTextId: { value: lt.ids }, uNum: { value: num },
    };
    this.shade = new SEShade({
      mapGLSL: worldGLSL({ qa: A, qu: U, qv: V, lw: TXW, lhz: TXH, lz: LZ, lh: LH }),
      shadeGLSL: SHADE_GLSL, uniforms: this.uni, cavL: 7,
    });
    this.fin = new FSPass(FINAL, { uSrc: { value: this.rtA.texture }, uC: v(0), uSm: v(0), uLine: v(0) });
  }

  /** carousel angle (rad): a half step off the land, then a click per "oh"; the second chant spins up a full turn first */
  private theta(t: number) {
    let th = 0;
    for (let j = 0; j < 6; j++) th += (j === 0 ? D30 : D60) * lockStep(t - this.oh[j]!.start);
    const u = clamp((t - SPIN_T0) / (SPIN_T1 - SPIN_T0));
    th += TAU * u * u * (3 - 2 * u);
    return th;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    const u = this.uni;
    const th = this.theta(t);
    (u.uRot!.value as THREE.Vector2).set(Math.cos(th), Math.sin(th));
    u.uT!.value = t;
    // detent: seated at each lock angle (30 deg + 60 deg n), riding the flank between
    const rm = (((th - D30) % D60) + D60) % D60, dd = Math.min(rm, D60 - rm);
    u.uDet!.value = 10 * smoothstep(0.012, 0.09, dd);
    // letters: the current chant's words; they sink between the chants and at the end
    const chant = t < 44.7 ? 0 : 1;
    (u.uWordT!.value as number[])[0] = this.wn[chant]![0]!.start;
    (u.uWordT!.value as number[])[1] = this.wn[chant]![1]!.start;
    u.uSink!.value = chant === 0 ? smoothstep(44.30, 44.62, t) : smoothstep(48.05, 48.35, t);
    // chamber mouths ring amber while their "oh" is sung, then cool
    const fl = u.uFlash!.value as number[];
    for (let j = 0; j < 6; j++) {
      const w = this.oh[j]!;
      const on = smoothstep(w.start - 0.01, w.start + 0.02, t) * (1 - smoothstep(w.end, w.end + 0.32, t));
      fl[j] = on * (0.5 + 0.5 * Math.exp(-(t - w.start) / 0.14));
    }
    let lastLock = -9;
    for (let j = 0; j < 6; j++) if (t >= this.oh[j]!.start) lastLock = this.oh[j]!.start;
    u.uAge!.value = t - lastLock;
    u.uFocusK!.value = lerp(0.85, 0.30, smoothstep(44.55, 44.8, t) * (1 - smoothstep(46.25, 46.4, t)));

    // ---- camera and the raster reveal
    const cam = camAt(t, kick);
    const a = camAt(t - 1 / 30), b = camAt(t + 1 / 30);
    const sp = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 30 / 900 + Math.hypot(b.fwd[0] - a.fwd[0], b.fwd[1] - a.fwd[1], b.fwd[2] - a.fwd[2]) * 30 / 0.6;
    const spin = Math.abs(this.theta(t + 1 / 60) - this.theta(t - 1 / 60)) * 30;      // rad per s
    const motion = clamp(0.20 + sp + 0.06 * spin, 0, 1);
    const rev = clamp((t - T0 - 0.03) / 0.40);
    u.uRev!.value = t < T0 + 0.5 ? rev * rev * (3 - 2 * rev) : 2;
    const ppmUnit = cam.dist > 0 ? H / 2 / (cam.dist * cam.tanY) : 1;

    this.shade.render(renderer, this.rtA, cam, {
      frame: frameIdx(t), motion, kick, reveal: t < T0 + 0.5 ? rev * rev * (3 - 2 * rev) : 2, dim: 1, rim: 0.95,
      focus: cam.dist * 0.74, hazeL: 520, zHaze: 0.30,
    });

    // ---- the chamber tag and the data strip
    const c = this.tag.ctx;
    this.tag.clear();
    if (this.drawTag(c, cam, t)) {
      const sx = W / TAGW, sy = H / TAGH;
      comp.draw(renderer, this.tag.upload(), this.rtA, { scale: [sx, sy], offset: [W / (2 * TAGW) - 0.5 - TAGX / TAGW, 0.5 - H / (2 * TAGH) + TAGY / TAGH] });
    }
    // strip: scale bar in the specimen's own size (log-interpolated between chambers while the carousel turns)
    const cu = (((th - D30) / D60) % 6 + 6) % 6;           // 0 = chamber 1 under the beam
    const i0 = Math.floor(cu), fr = cu - i0;
    const mpu = Math.exp(lerp(Math.log(MM_PER_UNIT[i0 % 6]!), Math.log(MM_PER_UNIT[(i0 + 1) % 6]!), fr * fr * (3 - 2 * fr)));
    const ci = Math.round(cu) % 6;
    const sa = smoothstep(T0 + 0.25, T0 + 0.5, t) * (1 - smoothstep(48.3, 48.5, t));
    this.strip.composite(renderer, comp, this.rtA, { ppm: ppmUnit / mpu, unit: 'mm', alpha: sa, wd: WD[ci] });

    // ---- final pass: smear along the stage move, then the collapse to the line
    const col = t < 48.36 ? 0 : 1 - Math.pow(1 - clamp((t - 48.36) / 0.30), 3);
    const cEase = col > 0 ? Math.pow(col, 2.2) : 0;
    const fu = this.fin.u;
    fu.uSrc!.value = this.rtA.texture;
    fu.uC!.value = t >= 48.66 ? 1 : cEase;
    fu.uSm!.value = clamp((spin - 2.0) * 14, 0, 70);
    fu.uLine!.value = smoothstep(0.55, 0.98, t >= 48.66 ? 1 : cEase);
    this.fin.render(renderer, out);

    return sePost({ ca: 3.0 * kick * smoothstep(42.3, 42.6, t) * (1 - smoothstep(48.0, 48.3, t)) });
  }

  private drawTag(c: CanvasRenderingContext2D, cam: SECam, t: number): boolean {
    let j = 0;
    for (let i = 0; i < 6; i++) if (t >= this.oh[i]!.start) j = i + 1;
    if (j === 0) return false;
    const a = (j === 3 ? 1 - smoothstep(44.9, 45.05, t) : 1) * (1 - smoothstep(48.2, 48.4, t));
    if (a <= 0.01) return false;
    const tg = TAGS[j - 1]!;
    const age = t - this.oh[j - 1]!.start;
    const x0 = 112, y0 = 150;
    const cps = 70;
    const typed = (s: string, a0: number) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((age - a0) * cps))));
    const strike = seProject(cam, [0, SY + 6, RCH]);
    c.save();
    c.translate(-TAGX, -TAGY);
    c.globalAlpha = a;
    const m = (s: string, x: number, y: number, size: number, col: string, wgt = 500, ls = 1.5) => {
      c.font = font(F.mono(wgt), size); c.fillStyle = col; c.textBaseline = 'alphabetic'; (c as any).letterSpacing = `${ls}px`; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    const bone = 'rgba(238,233,223,0.96)', ash = 'rgba(156,151,143,0.95)';
    m(typed(`CHAMBER ${j} / 6`, 0), x0, y0, 17, ash);
    m(typed(tg.name, 0.10), x0, y0 + 50, 44, bone, 600, 1);
    m(typed(tg.spec, 0.22), x0, y0 + 84, 19, ash);
    const stLab = 'STATUS';
    m(typed(stLab, 0.34), x0, y0 + 122, 19, ash);
    const stX = x0 + 96;
    const stCol = j === 5 ? '#FFA41B' : bone;
    m(typed(tg.status, 0.40), stX, y0 + 122, 24, stCol, 700, 1.2);
    // rule and leader to the beam's foot
    c.strokeStyle = 'rgba(238,233,223,0.55)'; c.lineWidth = 1.2;
    const ruleH = Math.min(1, age / 0.5);
    c.beginPath(); c.moveTo(x0 - 22, y0 - 18); c.lineTo(x0 - 22, y0 - 18 + 150 * ruleH); c.stroke();
    // leader: out of the tag's top right, then straight down the diagonal to the beam's foot (drawn on as the tag types)
    const lx = x0 + 340, ly = y0 + 2, kx = lx + 36;
    const pr = Math.min(1, age / 0.40);
    const seg1 = 36, seg2 = Math.hypot(strike.x - kx, strike.y - ly), L = seg1 + seg2, dl = pr * L;
    c.beginPath(); c.moveTo(lx, ly);
    if (dl <= seg1) c.lineTo(lx + dl, ly);
    else { c.lineTo(kx, ly); const k2 = (dl - seg1) / seg2; c.lineTo(lerp(kx, strike.x, k2), lerp(ly, strike.y, k2)); }
    c.stroke();
    if (pr >= 1) { c.fillStyle = 'rgba(238,233,223,0.9)'; c.beginPath(); c.arc(strike.x, strike.y, 2.8, 0, TAU); c.fill(); }
    c.restore();
    return true;
  }

  override dispose() { this.shade.dispose(); this.rtA.dispose(); for (const t of this.texs) t.dispose(); }
}

function norm(a: number[]): number[] { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; }
function cross(a: number[], b: number[]): number[] { return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]; }
