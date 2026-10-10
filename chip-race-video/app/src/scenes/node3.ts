// node3 (chorus 3, G minor, "Two nanometers holding the crown"): the RECAP MOSAIC. A contact sheet of dies, each tile
// carrying the icon of an earlier plate, flipping like split-flaps on every beat while a wild camera (homography tilt,
// beat-snapped poses) flies over it. On "crown" the tiles of a pixel crown light amber from the base up; the camera
// settles head-on (the exact pose grid3 starts from) and the tile bodies fade leaving one amber light per crown tile:
// the lights of grid3's town.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { TPP, drawTPP, lineByScene } from './_motifs';
import { clamp, ease, lerp, prog, pulse } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, karaokeWord, camAt, type Pose, shakeVec, W, H, pulses } from './node2-kit';
import { makeAtlas, CROWN_ROWS, CROWN_OX, CROWN_OY, TILE_W, TILE_H, crownAt, ICON_N } from './node3-kit';
import type { Word } from '../engine/lyrics';

const T0 = 120.0;
const T_CROWN = 121.875;
const T_SETTLE0 = 123.3;

const FRAG = /* glsl */ `
uniform vec4 uCam; uniform float uTilt;
uniform float uT, uBeat, uBeatPh, uArrive, uLight0, uSettle, uKick, uFlash;
uniform sampler2D uAtlas, uCrown;
const vec2 TS = vec2(${TILE_W}.0, ${TILE_H}.0);
float h21(vec2 p) { return hash12(p); }
float iconAt(vec2 tile, float b, float lit) {
  // the icon shown by this tile at beat index b (changes on ~40% of beats until the crown lights it)
  float v = floor(b);
  for (int k = 0; k < 6; k++) { if (h21(tile + vec2(v - float(k), 31.7)) < 0.4) break; v -= 1.0; }
  return floor(float(${ICON_N}) * h21(tile * 1.37 + vec2(v, 5.3)));
}
vec4 atlasSample(float id, vec2 uv) {
  float col = mod(id, 6.0), row = floor(id / 6.0);
  vec2 a = vec2((col + uv.x) / 6.0, 1.0 - (row + uv.y) / 4.0);
  return texture(uAtlas, a);
}
void main() {
  vec2 s = vec2(FRAG_PX.x - 960.0, 540.0 - FRAG_PX.y);
  float den = max(1.0 + uTilt * s.y / 540.0, 0.08);
  vec2 q = rot2(uCam.w) * (s / den);
  vec2 wp = uCam.xy + q / uCam.z;
  vec2 tcoord = wp / TS;
  vec2 tile = floor(tcoord);
  vec2 lp = tcoord - tile;                       // 0..1, y down
  float fwT = max(fwidth(tcoord.x), fwidth(tcoord.y));
  ivec2 ti = ivec2(tile);
  bool inGrid = ti.x >= 0 && ti.x < ${20} && ti.y >= 0 && ti.y < ${10};
  float cm = inGrid ? texelFetch(uCrown, ti, 0).r * 255.0 : 0.0;
  float crown = step(40.0, cm), jewel = step(200.0, cm);
  float h = h21(tile + 3.1);
  // crown light time: bottom row first
  float rowIdx = float(${CROWN_ROWS.length - 1 + CROWN_OY}) - tile.y;
  float tl = uLight0 + rowIdx * 0.085 + h * 0.05;
  float lit = crown * smoothstep(tl - 0.001, tl + 0.06, uT);
  float lightHit = crown * exp(-max(uT - tl, 0.0) * 9.0) * step(tl, uT);
  // arrival wave
  float dC = length(tile - vec2(9.5, 4.5));
  float tArr = uArrive + 0.38 * clamp(dC / 14.0, 0.0, 1.0) + 0.1 * h;
  float arrived = step(tArr, uT);
  float arrHit = exp(-max(uT - tArr, 0.0) * 14.0) * arrived;
  // beat shuffles
  float b = uBeat;
  float icon = iconAt(tile, b, lit);
  float prevIcon = iconAt(tile, b - 1.0, lit);
  float changedNow = (icon != prevIcon) ? 1.0 : 0.0;
  float ph = clamp(uBeatPh / 0.3, 0.0, 1.0);
  float sx = 1.0;
  float shown = icon;
  if (changedNow > 0.5 && lit < 0.5) {
    if (ph < 0.5) { shown = prevIcon; sx = cos(ph * 3.14159); } else { shown = icon; sx = cos((1.0 - ph) * 3.14159); }
  }
  // once the crown has lit, the crown tiles freeze on a fixed icon; the rest slow down (dim)
  float afterCrown = smoothstep(uLight0 - 0.05, uLight0 + 0.4, uT);
  if (afterCrown > 0.5) { if (crown > 0.5) { shown = floor(float(${ICON_N}) * h21(tile * 1.9 + 8.0)); sx = 1.0; } }
  vec2 c = lp - 0.5;
  c.x /= max(sx, 0.03);
  vec3 col = C_INK;
  // tile body (rounded die with a scribe gap)
  vec2 hlf = vec2(0.5 - 0.045, 0.5 - 0.04);
  float dBody = length(max(abs(c) - (hlf - 0.04), 0.0)) - 0.04;
  float body = 1.0 - smoothstep(-fwT * 1.2, fwT * 1.2, dBody);
  float hatchv = 0.0;
  // unlit look
  vec3 bodyCol = C_INK2 * 0.75 + C_BONE * 0.012 * (0.5 + 0.5 * sin((wp.x + wp.y) * 0.9));
  vec3 iconCol = mix(C_ASH, C_BONE, 0.25) * 0.55;
  // lit (crown) look
  float k = lit;
  float pulseB = 1.0 + 0.5 * pow(1.0 - uBeatPh, 3.0) * uKick;
  vec3 litBody = mix(C_SIGNAL * 0.55, C_SIGNAL * 0.85, 0.5 + 0.5 * (0.5 - lp.y)) * pulseB;
  litBody = mix(litBody, C_EMBER * 1.1 * pulseB, jewel);
  litBody += C_EMBER * 2.2 * lightHit;
  vec2 iuv = c / 0.36 * 0.5 + 0.5;
  float inIcon = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
  vec4 ic = atlasSample(shown, clamp(iuv, 0.0, 1.0));
  float ia = ic.a * inIcon;
  vec3 tileCol = mix(bodyCol, litBody, k);
  vec3 icCol = mix(iconCol, C_INK * 1.3, k);
  tileCol = mix(tileCol, icCol, ia * (0.9 - 0.2 * k));
  // dim non-crown tiles after the crown lights
  float dimK = (1.0 - crown) * afterCrown * 0.62 * smoothstep(0.0, 1.0, 1.0);
  tileCol *= 1.0 - dimK;
  tileCol += C_EMBER * 1.4 * arrHit * (1.0 - k) * 0.6;
  // hairline border (bone)
  float edge = 1.0 - smoothstep(0.0, fwT * 1.6, abs(dBody));
  tileCol += C_BONE * 0.22 * edge * (1.0 - 0.7 * k);
  col = mix(col, tileCol, body * arrived);
  // handoff to grid3: fade the tiles, leave one amber light per lit tile
  float centreDot = (1.0 - smoothstep(0.0, 0.1 + fwT * 1.5, length((lp - 0.5) * TS) / 96.0 * 0.9));
  float dotMask = 1.0 - smoothstep(0.045, 0.075 + fwT * 1.2, length((lp - 0.5) * vec2(1.0, TS.y / TS.x)));
  col = mix(col, vec3(0.0), uSettle * body);
  col = mix(col, C_INK, uSettle * (1.0 - body));
  col += (C_SIGNAL * 2.2 + C_EMBER * (0.6 + 1.2 * jewel)) * dotMask * lit * uSettle;
  // fog toward the horizon of the tilt
  col *= smoothstep(0.08, 0.5, den);
  col += vec3(1.0, 0.95, 0.85) * uFlash * 0.0;
  fragColor = vec4(col, 1.0);
}`;

export default class Node3 extends Scene {
  mosaic!: FSPass;
  text = new Layer2D();
  words: Word[] = [];
  tpp!: TPP;
  shots: Pose[] = [];
  kicks: number[] = [];
  crownTex!: THREE.DataTexture;

  override init() {
    const data = new Uint8Array(20 * 10 * 4);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 20; i++) { const k = crownAt(i, j); data[(j * 20 + i) * 4] = k === 2 ? 255 : k === 1 ? 128 : 0; data[(j * 20 + i) * 4 + 3] = 255; }
    this.crownTex = new THREE.DataTexture(data, 20, 10, THREE.RGBAFormat);
    this.crownTex.magFilter = THREE.NearestFilter; this.crownTex.minFilter = THREE.NearestFilter; this.crownTex.needsUpdate = true;
    this.mosaic = new FSPass(FRAG, {
      uCam: { value: new THREE.Vector4(960, 540, 1, 0) }, uTilt: { value: 0 }, uT: { value: 0 }, uBeat: { value: 0 }, uBeatPh: { value: 0 }, uArrive: { value: T0 },
      uLight0: { value: T_CROWN }, uSettle: { value: 0 }, uKick: { value: 0 }, uFlash: { value: 0 }, uAtlas: { value: makeAtlas() }, uCrown: { value: this.crownTex },
    });
    this.words = lineByScene(this.ctx.lyrics, 'crown3').words;
    this.tpp = new TPP(this.ctx.lyrics);
    this.kicks = this.ctx.audio.events('kick', 119.9, 123.8).map((e) => e[0]);
    this.shots = [
      { t: 0, x: 1900, y: 260, s: 2.8, r: -0.3, tilt: 0.62 },
      { t: 120.469, x: 620, y: 820, s: 2.1, r: 0.22, tilt: 0.55, snap: 0.11 },
      { t: 120.9375, x: 1320, y: 540, s: 1.7, r: -0.12, tilt: 0.42, snap: 0.11 },
      { t: 121.406, x: 760, y: 470, s: 1.35, r: 0.09, tilt: 0.28, snap: 0.11 },
      { t: 121.875, x: 960, y: 560, s: 1.12, r: -0.03, tilt: 0.14, snap: 0.1 },
      { t: 122.34, x: 960, y: 540, s: 1.04, r: 0.0, tilt: 0.04, snap: 0.14 },
      { t: 122.81, x: 960, y: 540, s: 1.08, r: 0.0, tilt: 0.0, snap: 0.12 },
      { t: 123.28, x: 960, y: 540, s: 1.0, r: 0.0, tilt: 0.0, snap: 0.2 },
    ];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const cam = camAt(this.shots, t);
    const kick = pulses(this.kicks, t, 0.1);
    // small punches on every kick (scale) until the final settle
    const settleK = prog(t, T_SETTLE0, 123.7, ease.inOutCubic);
    const punch = 1 + 0.045 * kick * (1 - settleK);
    const U = this.mosaic.u;
    (U.uCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.s * punch, cam.r);
    U.uTilt!.value = cam.tilt;
    U.uT!.value = t;
    const bt = audio.beatAt(t);
    U.uBeat!.value = Math.floor(bt); U.uBeatPh!.value = bt - Math.floor(bt);
    U.uKick!.value = kick;
    U.uSettle!.value = settleK;
    this.mosaic.render(renderer, out);

    // ---- ribbons with the karaoke lyric (screen space)
    const c = this.text.ctx; this.text.clear();
    const fade = 1 - settleK;
    c.globalAlpha = 1;
    const gTop = c.createLinearGradient(0, 0, 0, 250);
    gTop.addColorStop(0, `rgba(10,10,11,${0.94 * fade})`); gTop.addColorStop(0.78, `rgba(10,10,11,${0.9 * fade})`); gTop.addColorStop(1, 'rgba(10,10,11,0)');
    c.fillStyle = gTop; c.fillRect(0, 0, W, 250);
    const gBot = c.createLinearGradient(0, 830, 0, H);
    gBot.addColorStop(0, 'rgba(10,10,11,0)'); gBot.addColorStop(0.22, `rgba(10,10,11,${0.9 * fade})`); gBot.addColorStop(1, `rgba(10,10,11,${0.94 * fade})`);
    c.fillStyle = gBot; c.fillRect(0, 830, W, H - 830);
    c.globalAlpha = fade;
    const fam = F.archivo(112, 900);
    const sTop = Math.min(130, fitSize('TWO NANOMETERS', fam, 1300)), sBot = Math.min(130, fitSize('HOLDING THE CROWN', fam, 1600));
    let x = 96;
    for (let i = 0; i < 2; i++) { const w = this.words[i]!; x += karaokeWord(c, w, t, x, 196, fam, sTop, { dim: rgbaS(C.bone, 0.25), settled: C.bone, slam: 0.12 }) + sTop * 0.26; }
    x = 96;
    for (let i = 2; i < 5; i++) { const w = this.words[i]!; x += karaokeWord(c, w, t, x, 1004, fam, sBot, { dim: rgbaS(C.bone, 0.25), settled: C.bone, slam: 0.12, sung: C.signal }) + sBot * 0.26; }
    drawTPP(c, 1920 - 96 - 300, 100, this.tpp.value(t), { width: 300 });
    c.globalAlpha = 1;
    comp.draw(renderer, this.text.upload(), out);

    const crownHit = pulse(t, T_CROWN, 0.12);
    const a0 = pulse(t, T0, 0.06);
    const [sx, sy] = shakeVec(t, 10 * kick * (1 - settleK) + 26 * crownHit + 20 * a0, 11);
    return {
      bloom: 0.85 + 0.6 * crownHit, bloomThreshold: 0.8, shake: [sx, sy] as [number, number], zoom: 1 + 0.02 * kick + 0.06 * crownHit,
      ca: 1.0 + 4 * crownHit + 3 * a0, flash: 0.55 * a0 + 0.3 * crownHit, vignette: 0.4,
    };
  }
}
