// `laser` (bars 6-8, 11.25-15 s): thermography.
// The pancaked tin target seen through an IR camera: a false-colour field in the single amber ramp with
// isotherm hairlines and a log temperature scale bar on the right. On "laser," the main pulse: two
// white-hot frames, then the plasma ball blows out with breathing isotherms and the spot meter goes OVER
// RANGE. "hotter than the sun": the camera tilts up the scale bar, which runs off the top of the frame,
// past a tiny ☉ 5,500 °C tick where SUN is set tiny, and whips on up to 220,000 °C · ×40. Then it drops
// back onto the plasma, whose isotherms settle into concentric rings: the collector mirror of `machine`.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { clamp, ease, keys, lerp, prog, pulse, hash, frameIdx, type Key } from '../engine/util';
import { lineByScene } from './_motifs';
import { BT, H_TIN_LASER, H_LASER_MACHINE, karaoke, mono, odometer, wordP } from './sand-kit';

const RINGS = H_LASER_MACHINE.radii;

const FRAG = /* glsl */ `
uniform vec2 uP, uQ; uniform float uS;      // screen = (world - P) * s + Q
uniform vec2 uTgt;                           // target centre (world)
uniform float uTime, uPulse, uWhite, uBall, uTurb, uRing, uPre, uDrops;
uniform float uRingR[6];
float profile(float r, float R) { return exp(-pow(r / R, 2.0) * 1.6); }
void main() {
  vec2 sp = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 w = (sp - uQ) / uS + uP;
  vec2 d = w - uTgt; float r = length(d);
  // sensor noise floor
  float T = 0.05 + 0.02 * snoise(w * 0.01 + uTime * 0.3) + 0.012 * hash12(floor(sp / 2.0) + floor(uTime * 60.0));
  // the pancake target (warm from the pre-pulse) and the cooling droplets above and below
  vec2 pe = d / vec2(${H_TIN_LASER.rx.toFixed(1)}, ${H_TIN_LASER.ry.toFixed(1)});
  T = max(T, uPre * (0.48 * exp(-pow(length(pe), 2.0) * 2.2) + 0.1 * exp(-dot(pe, pe) * 0.25)));
  for (int k = -2; k <= 2; k++) {
    if (k == 0) continue;
    vec2 c = uTgt + vec2(0.0, float(k) * 292.0 + uDrops);
    T = max(T, 0.3 * uPre * exp(-pow(length(w - c) / 70.0, 2.0) * 1.4));
  }
  // the plasma
  if (uBall > 0.0) {
    float a = atan(d.y, d.x);
    float turb = fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, uTime * 0.9 - r * 0.004), 4) * uTurb;
    float R = uBall * (1.0 + 0.28 * turb);
    float pT = profile(r, R) * (0.96 + 0.06 * fbm(d * 0.012 + uTime, 3) * uTurb);
    T = max(T, pT);
  }
  // settle into the collector's rings: posterised bands between exact radii
  if (uRing > 0.0) {
    float band = 0.0;
    for (int k = 0; k < 6; k++) band += step(uRingR[k], r);
    float Tb = 1.0 - band / 6.5;
    T = mix(T, max(Tb * 0.95, 0.05), uRing);
  }
  T = mix(T, 1.0, uWhite);
  // false colour (single-hue amber ramp), lightly posterised like a radiometric palette
  float Tq = mix(T, floor(T * 24.0 + 0.5) / 24.0, 0.35);
  vec3 col = heat(Tq);
  col = mix(col, col * 1.0 + vec3(0.6, 0.5, 0.4) * smoothstep(0.92, 1.0, T) * 2.0, 1.0);
  // isotherms: hairlines that breathe outward
  float iso = T * 11.0 - uTime * 0.7 * step(0.0, uBall);
  float fi = fract(iso), di = min(fi, 1.0 - fi) / max(fwidth(iso), 1e-5);
  float lineA = pxLine(di, 0.45, 1.3) * smoothstep(0.07, 0.15, T) * (1.0 - uRing) * (1.0 - uWhite);
  vec3 lc = luma(col) > 0.45 ? C_INK * 0.6 : C_BONE * 0.7;
  col = mix(col, lc, lineA * 0.8);
  // exact ring hairlines at the end
  if (uRing > 0.0) {
    for (int k = 0; k < 6; k++) {
      float dd = abs(r - uRingR[k]) * uS;
      col = mix(col, C_BONE * 1.05, pxLine(dd, 0.6, 1.6) * uRing);
    }
  }
  fragColor = vec4(col, 1.0);
}`;

const LOG0 = 1, PXDEC = 400, YBAR0 = 980; // scale bar: 10 °C at world y 980, 400 px per decade upward
const yOfC = (c: number) => YBAR0 - (Math.log10(c) - LOG0) * PXDEC;

export default class LaserScene extends Scene {
  bg = new FSPass(FRAG, {
    uP: { value: new THREE.Vector2() }, uQ: { value: new THREE.Vector2() }, uS: { value: 1 },
    uTgt: { value: new THREE.Vector2(H_TIN_LASER.x, H_TIN_LASER.y) },
    uTime: { value: 0 }, uPulse: { value: 0 }, uWhite: { value: 0 }, uBall: { value: 0 }, uTurb: { value: 1 }, uRing: { value: 0 }, uPre: { value: 1 }, uDrops: { value: 0 },
    uRingR: { value: RINGS.slice() },
  });
  hud = new Layer2D();
  line: any; tm = 11.953; camK: Key[] = [];

  override init() {
    this.line = lineByScene(this.ctx.lyrics, 'laser');
    const w = this.line.words;
    this.tm = w[3].start; // "laser,": the main pulse
    const sun = w[7].start, hot = w[4].start;
    const yS = yOfC(5500), yTop = yOfC(220000);
    // camera tilt (world y shown at screen 540 is 540 - Q.y): keys on the syllables
    this.camK = [
      [0, 0], [hot, 0], [w[4].syl[1][0], 180, ease.outExpo], [w[5].start, 300, ease.outExpo], [w[6].start, 430, ease.outExpo],
      [sun, 540 - yS + 20, ease.outExpo], [BT(30) - 0.02, 540 - yS + 50, ease.linear], [BT(30) + 0.3, 400 - yTop, ease.outExpo],
      [BT(31), 410 - yTop, ease.linear], [BT(31) + 0.36, 0, ease.inOutExpo],
    ];
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, w = this.line.words, tm = this.tm;
    const u = this.bg.u;
    const tilt = keys(t, this.camK);
    const back = ease.inOutExpo(prog(t, BT(31), BT(31) + 0.36));
    const P = [lerp(0, H_TIN_LASER.x, back), lerp(0, H_TIN_LASER.y, back)];
    const Q = [lerp(0, H_LASER_MACHINE.x, back), lerp(tilt, H_LASER_MACHINE.y, back)];
    (u.uP!.value as THREE.Vector2).set(P[0]!, P[1]!);
    (u.uQ!.value as THREE.Vector2).set(Q[0]!, Q[1]!);
    u.uTime!.value = t;
    const white = t >= tm && t < tm + 2 / 60 ? 1 : 0;
    u.uWhite!.value = white;
    const age = t - tm;
    u.uBall!.value = age > 0 ? 60 + 460 * ease.outExpo(clamp(age / 0.9)) + 25 * age : 0;
    u.uTurb!.value = 1 - prog(t, BT(31), BT(31) + 0.3);
    u.uRing!.value = ease.inOutCubic(prog(t, BT(31) + 0.05, BT(31) + 0.4));
    u.uPre!.value = 1 - prog(t, tm, tm + 0.5);
    u.uDrops!.value = (t - 11.25) * 40;
    this.bg.render(renderer, out);

    const T = this.hud; T.clear();
    const x = T.ctx;
    const scr = (wx: number, wy: number): [number, number] => [(wx - P[0]!) + Q[0]!, (wy - P[1]!) + Q[1]!];
    const ringA = 1 - prog(t, BT(31) + 0.1, BT(31) + 0.35);
    x.globalAlpha = ringA;
    // ---- scale bar (world): log decades, extends off the top
    const bx = 1754, bw = 22;
    const [sx0, sy0] = scr(bx, YBAR0);
    const [, syTop] = scr(bx, yOfC(300000));
    const grd = x.createLinearGradient(0, sy0, 0, scr(0, yOfC(1500))[1]);
    grd.addColorStop(0, '#0A0A0B'); grd.addColorStop(0.3, '#7A3A06'); grd.addColorStop(0.62, '#FFA41B'); grd.addColorStop(0.85, '#FFD27A'); grd.addColorStop(1, '#FFF4E6');
    x.fillStyle = grd; x.fillRect(sx0, syTop, bw, sy0 - syTop);
    x.strokeStyle = rgba('bone', 0.7); x.lineWidth = 1.2; x.strokeRect(sx0 + 0.5, syTop, bw - 1, sy0 - syTop);
    for (let dec = 1; dec <= 5; dec++) for (let m = 1; m <= 9; m++) {
      const c = m * 10 ** dec; if (c > 300000) break;
      const [, yy] = scr(bx, yOfC(c));
      if (yy < -40 || yy > 1120) continue;
      const major = m === 1;
      x.fillStyle = rgba('bone', major ? 0.9 : 0.45);
      x.fillRect(sx0 - (major ? 18 : 8), yy - 0.6, major ? 18 : 8, 1.2);
      if (major) mono(x, `${c.toLocaleString('en-US')} °C`, sx0 - 26, yy + 5, 15, rgba('bone', 0.8), 500, 'right');
    }
    // the sun tick, tiny
    const [, ySun] = scr(bx, yOfC(5500));
    x.fillStyle = rgba('signal', 1); x.fillRect(sx0 - 30, ySun - 1, 30 + bw, 2);
    mono(x, '☉ 5,500 °C', sx0 - 36, ySun + 5, 13, rgba('signal', 1), 600, 'right');
    const sunW = w[7];
    if (t >= sunW.start - 0.05) {
      const k = clamp((t - sunW.start) / 0.12);
      x.font = font(F.archivo(100, 900), 22); x.fillStyle = rgba('bone', k);
      x.fillText('SUN', sx0 - 170 + 0 * k, ySun + 7);
      mono(x, '(the surface)', sx0 - 172, ySun + 26, 11, rgba('bone', 0.5 * k), 400, 'left');
    }
    // the top: 220,000 °C · ×40
    const [, yTop] = scr(bx, yOfC(220000));
    x.fillStyle = rgba('ember', 1); x.fillRect(sx0 - 40, yTop - 1.5, 40 + bw, 3);
    const topK = prog(t, BT(30), BT(30) + 0.12);
    if (topK > 0) {
      const big = F.archivo(100, 900);
      const pop = 1 + 0.08 * pulse(t, BT(30), 0.06);
      x.save(); x.translate(sx0 - 60, yTop + 70); x.scale(pop, pop);
      odometer(x, '220,000 °C', '000,000 °C', prog(t, BT(30), BT(30) + 0.25), 0, 0, big, 150, rgba('ember', 1), 'right');
      x.restore();
      x.font = font(F.archivo(125, 900), 96); x.fillStyle = rgba('bone', topK); x.textAlign = 'right';
      x.fillText('×40', sx0 - 60, yTop + 190); x.textAlign = 'left';
      mono(x, 'Sn PLASMA · ~40× THE SUN’S SURFACE', sx0 - 60, yTop + 226, 15, rgba('bone', 0.65 * topK), 500, 'right', 1);
    }
    // ---- spot meter on the target (world)
    const [tx, ty] = scr(H_TIN_LASER.x, H_TIN_LASER.y);
    const meterA = 1 - prog(t, w[4].start, w[4].start + 0.3);
    if (meterA > 0) {
      x.strokeStyle = rgba('bone', 0.85 * meterA); x.lineWidth = 1.4;
      x.beginPath();
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) { x.moveTo(tx + a * 14, ty + b * 14); x.lineTo(tx + a * 40, ty + b * 40); }
      x.stroke();
      const over = t >= tm;
      const temp = over ? 'OVER RANGE' : `${Math.round(lerp(290, 340, prog(t, 11.25, tm))).toString()} °C`;
      const blink = over ? (frameIdx(t) % 8 < 5 ? 1 : 0.3) : 1;
      mono(x, `SP1  ${temp}`, tx + 50, ty - 18, 18, rgba(over ? 'ember' : 'bone', meterA * blink), 600);
      mono(x, 'Sn TARGET · PRE-PULSED · ⌀ 0.3 mm', tx + 50, ty + 4, 13, rgba('bone', 0.55 * meterA), 500);
    }
    x.globalAlpha = 1;
    // ---- camera HUD (screen)
    const hudA = ringA;
    x.globalAlpha = hudA;
    x.strokeStyle = rgba('bone', 0.5); x.lineWidth = 1.5;
    x.beginPath();
    for (const [cx, cy, sx, sy] of [[96, 96, 1, 1], [1824, 96, -1, 1], [96, 984, 1, -1], [1824, 984, -1, -1]] as const) { x.moveTo(cx + sx * 34, cy); x.lineTo(cx, cy); x.lineTo(cx, cy + sy * 34); }
    x.stroke();
    mono(x, 'IR · MWIR 3–5 µm · ε 0.30 · 1,000 fps', 112, 128, 15, rgba('bone', 0.7), 500, 'left', 1);
    mono(x, 'LOT 7A-0042 · STEP 03/31 · EUV SOURCE', 112, 1002 - 18, 14, rgba('bone', 0.5), 500, 'left', 1.5);
    // ---- the lyric
    const lyr = F.archivo(100, 900);
    let xx = 112;
    for (const i of [0, 1, 2]) {
      const p = wordP(w[i], t);
      if (t < w[i].start - 0.3) continue;
      const ww = karaoke(x, w[i].w.toUpperCase(), xx, 300, lyr, 128, p, rgba('bone', 1), rgba('bone', 0.25));
      xx += ww + 34;
    }
    if (t >= tm) {
      const pop = 1 + 0.12 * pulse(t, tm, 0.06);
      x.save(); x.translate(104, 640); x.scale(pop, pop);
      x.font = font(F.archivo(125, 900), 300); x.fillStyle = rgba('bone', 1 - 0.82 * prog(t, BT(30) - 0.1, BT(30) + 0.15));
      x.fillText('LASER,', 0, 0);
      x.restore();
    }
    // hotter than the
    if (t >= w[4].start - 0.05) {
      const hf = F.archivo(112.5, 900);
      karaoke(x, 'HOTTER', 112, 860, hf, 150, wordP(w[4], t), rgba('ember', 1), rgba('bone', 0.25));
      const lw = layout('HOTTER', hf, 150).width;
      karaoke(x, 'THAN', 112 + lw + 30, 860, F.archivo(100, 700), 70, wordP(w[5], t), rgba('bone', 1), rgba('bone', 0.25));
      karaoke(x, 'THE', 112 + lw + 30, 790, F.archivo(100, 700), 70, wordP(w[6], t), rgba('bone', 1), rgba('bone', 0.25));
    }
    x.globalAlpha = 1;
    comp.draw(renderer, T.upload(), out);

    const hitL = pulse(t, tm, 0.08);
    return {
      bloom: 0.55, bloomThreshold: 0.95, vignette: 0.4, grain: 0.06, halation: 0.35,
      flash: 0.5 * pulse(t, tm, 0.04) + 0.08 * pulse(t, BT(30), 0.05),
      shake: [16 * hitL * (hash(frameIdx(t), 1) - 0.5) + 8 * pulse(t, BT(30), 0.05) * (hash(frameIdx(t), 3) - 0.5), 16 * hitL * (hash(frameIdx(t), 2) - 0.5)],
      zoom: 1 + 0.04 * hitL + 0.02 * pulse(t, BT(30), 0.08) + 0.012 * pulse(t, w[0].start, 0.08),
      ca: 1 + 6 * hitL,
    };
  }
}
