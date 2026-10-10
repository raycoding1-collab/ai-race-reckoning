// grid3 (chorus 3, "Gigawatts in a cornfield town"): the night aerial in OVERLOAD. It opens on node3's last frame (the
// crown's tile lights are the town's lights, now the datacentre campus in a crown-shaped footprint), the camera tips forward
// into a tilted aerial; GIGAWATTS is painted on the ground; transmission lines carry beam pulses and then lightning arcs
// everywhere; the site meter pins, its needle snaps and the glass shatters; halls burn in toward white and the frame whites out
// to bone paper (down3's first frame).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { sparkHead as beamHead, sparkParticles as beamParticles, drawTPP, TPP, lineByScene } from './_motifs';
import { clamp, ease, lerp, prog, pulse, hash, frameIdx, TAU, mulberry32 } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, amber, hot, karaokeWord, camAt, type Pose, shakeVec, drawDial, stepped, W, H, pulses } from './node2-kit';
import { TILE_W, TILE_H, crownAt, CROWN_OX, CROWN_OY } from './node3-kit';
import type { Word } from '../engine/lyrics';
import * as THREE_ from 'three';
void THREE_;

const T0 = 123.75, T_END = 127.5, T_TOWN = 125.625;

const FRAG = /* glsl */ `
uniform vec4 uCam; uniform float uTilt, uT, uOver, uIgn, uFrame, uBeatPh, uSettle;
uniform sampler2D uCrown, uGround;
const vec2 TS = vec2(${TILE_W}.0, ${TILE_H}.0);
float crownAtT(ivec2 ti) { if (ti.x < 0 || ti.x >= 20 || ti.y < 0 || ti.y >= 10) return 0.0; return step(40.0, texelFetch(uCrown, ti, 0).r * 255.0) + step(200.0, texelFetch(uCrown, ti, 0).r * 255.0); }
void main() {
  vec2 s = vec2(FRAG_PX.x - 960.0, 540.0 - FRAG_PX.y);
  float den = max(1.0 + uTilt * s.y / 540.0, 0.06);
  vec2 q = rot2(uCam.w) * (s / den);
  vec2 wp = uCam.xy + q / uCam.z;
  float aaw = max(fwidth(wp.x), fwidth(wp.y));
  vec2 tc = wp / TS; vec2 tile = floor(tc); vec2 lp = fract(tc); vec2 pc = (lp - 0.5) * TS;
  vec3 col = C_INK * 0.8;
  // fields: crop rows, patches of 3x3 tiles with their own tint
  vec2 pch = floor(tc / 3.0);
  float ph = hash12(pch);
  float rows = hatch(wp.y / (9.0 + 4.0 * ph), 0.2 + 0.2 * ph);
  col += C_ASH * 0.022 * rows * (0.5 + ph);
  // roads along the tile edges
  float dx = (0.5 - abs(lp.x - 0.5)) * TS.x, dy = (0.5 - abs(lp.y - 0.5)) * TS.y;
  float road = 1.0 - smoothstep(1.4, 1.4 + aaw * 1.3, min(dx, dy));
  col += C_GRAPHITE * 0.28 * road;
  // town lights near the campus
  float dc = length(tile - vec2(9.5, 4.5));
  float town = 1.0 - smoothstep(10.0, 24.0, dc);
  float ex = step(0.38, hash12(tile + 7.0));
  float house = (1.0 - smoothstep(3.0, 3.0 + aaw * 1.2, length(pc))) * ex * town;
  float tw = 0.7 + 0.3 * sin(uT * (2.0 + 6.0 * hash12(tile)) + hash12(tile) * 6.0);
  col += (C_SIGNAL * 0.5 + C_EMBER * 0.15) * house * tw * (0.35 + 0.8 * uOver);
  // campus halls (crown tiles) + halo
  float halo = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 n = ivec2(tile) + ivec2(i, j);
    float cn = crownAtT(n);
    if (cn > 0.5) halo += exp(-length(wp - (vec2(n) + 0.5) * TS) / (60.0 + 40.0 * uOver));
  }
  float cm = crownAtT(ivec2(tile));
  float hlit = step(0.5, cm);
  float h = hash12(tile + 2.0);
  float ign = smoothstep(0.0, 1.0, (uT - ${T0.toFixed(2)} - 0.06 * h) / 0.3) * uIgn;
  float flick = 1.0 + uOver * 0.9 * (hash12(tile + vec2(uFrame, 3.0)) - 0.5);
  float dh = sdBox(pc, vec2(31.0, 38.0));
  float fill = (1.0 - smoothstep(-aaw, aaw, dh)) * hlit;
  float roof = hatch(pc.y / 6.5, 0.5);
  vec3 hallCol = (C_SIGNAL * (0.55 + 0.4 * roof) + C_EMBER * 0.5 * (1.0 - roof) * 0.6) * (1.0 + 1.1 * uOver) * flick * ign;
  float rim = (1.0 - smoothstep(0.0, aaw * 2.0 + 1.5, abs(dh))) * hlit;
  hallCol += C_EMBER * 1.2 * rim * ign * (1.0 + uOver * 1.2);
  col += hallCol * fill + C_EMBER * 1.4 * rim * ign * 0.4;
  col += (C_SIGNAL * 0.5) * halo * ign * (0.45 + 0.9 * uOver);
  // sky glow of the campus on the fields
  col += C_BLOOD * 0.12 * exp(-length(wp - vec2(960.0, 540.0)) / 620.0) * (0.3 + uOver) * ign;
  // GIGAWATTS painted on the ground (world window 1920x1080)
  vec2 gu = vec2(wp.x / 1920.0, 1.0 - wp.y / 1080.0);
  if (gu.x > 0.0 && gu.x < 1.0 && gu.y > 0.0 && gu.y < 1.0) { vec4 gt = texture(uGround, gu); col += gt.rgb * gt.a * 1.2; }
  // node3's crown lights: one amber dot per lit tile, which the halls grow out of
  float dotMask = (1.0 - smoothstep(0.045, 0.075 + aaw / 96.0 * 1.2, length((lp - 0.5) * vec2(1.0, TS.y / TS.x)))) * hlit;
  col += (C_SIGNAL * 2.2 + C_EMBER * (0.6 + 1.2 * step(1.5, cm))) * dotMask * (1.0 - smoothstep(0.0, 1.0, ign * 2.5));
  col *= smoothstep(0.05, 0.4, den);
  // handoff: before ignition only tile dots (node3's lights) exist
  fragColor = vec4(col, 1.0);
}`;

function project(cam: { x: number; y: number; s: number; r: number; tilt: number }, wx: number, wy: number): [number, number, number] {
  // inverse of the shader's homography (see FRAG): world -> screen px, plus the local scale factor (den)
  const vx = (wx - cam.x) * cam.s, vy = (wy - cam.y) * cam.s;
  const cr = Math.cos(cam.r), sr = Math.sin(cam.r);
  const ux = cr * vx - sr * vy, uy = sr * vx + cr * vy;
  const k = 1 - (cam.tilt * uy) / 540;
  const den = 1 / Math.max(0.05, k);
  return [960 + ux * den, 540 + uy * den, den];
}

export default class Grid3 extends Scene {
  bg!: FSPass;
  whiteout!: FSPass;
  ground = new Layer2D();
  hud = new Layer2D();
  lines = new LineBatch(30000);
  words: Word[] = [];
  tpp!: TPP;
  shots: Pose[] = [];
  crownTex!: THREE.DataTexture;
  halls: { x: number; y: number }[] = [];
  pylons: { x: number; y: number }[][] = [];
  kicks: number[] = [];

  override init() {
    const data = new Uint8Array(20 * 10 * 4);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 20; i++) {
      const k = crownAt(i, j); data[(j * 20 + i) * 4] = k === 2 ? 255 : k === 1 ? 128 : 0; data[(j * 20 + i) * 4 + 3] = 255;
      if (k) this.halls.push({ x: (i + 0.5) * TILE_W, y: (j + 0.5) * TILE_H });
    }
    this.crownTex = new THREE.DataTexture(data, 20, 10, THREE.RGBAFormat);
    this.crownTex.magFilter = THREE.NearestFilter; this.crownTex.minFilter = THREE.NearestFilter; this.crownTex.needsUpdate = true;
    this.bg = new FSPass(FRAG, {
      uCam: { value: new THREE.Vector4(960, 540, 1, 0) }, uTilt: { value: 0 }, uT: { value: 0 }, uOver: { value: 0 }, uIgn: { value: 1 }, uFrame: { value: 0 }, uBeatPh: { value: 0 }, uSettle: { value: 0 },
      uCrown: { value: this.crownTex }, uGround: { value: this.ground.texture },
    });
    this.whiteout = new FSPass(`uniform float uK; void main(){ fragColor = vec4(C_BONE, uK); }`, { uK: { value: 0 } }, { transparent: true, blending: THREE.NormalBlending });
    this.words = lineByScene(this.ctx.lyrics, 'grid3').words;
    this.tpp = new TPP(this.ctx.lyrics);
    this.kicks = this.ctx.audio.events('kick', T0 - 0.1, T_END).map((e) => e[0]);
    // two transmission lines run south along x = 560 and x = 1360, pylons every 190 px, from far north to the campus roof
    for (const x of [560, 1360]) { const L: { x: number; y: number }[] = []; for (let y = -2200; y <= 190; y += 190) L.push({ x, y }); this.pylons.push(L); }
    this.shots = [
      { t: 0, x: 960, y: 540, s: 1.0, r: 0, tilt: 0 },
      { t: 123.8, x: 960, y: 560, s: 1.3, r: 0, tilt: 0.42, snap: 0.45 },
      { t: 124.219, x: 900, y: 820, s: 1.9, r: -0.07, tilt: 0.55, snap: 0.11 },
      { t: 124.6875, x: 1280, y: 540, s: 1.5, r: 0.11, tilt: 0.42, snap: 0.11 },
      { t: 125.156, x: 700, y: 470, s: 2.2, r: -0.15, tilt: 0.5, snap: 0.1 },
      { t: 125.625, x: 960, y: 700, s: 1.15, r: 0.0, tilt: 0.32, snap: 0.09 },
      { t: 126.094, x: 960, y: 520, s: 1.75, r: 0.07, tilt: 0.45, snap: 0.1 },
      { t: 126.5625, x: 1120, y: 470, s: 2.6, r: -0.11, tilt: 0.55, snap: 0.1 },
      { t: 127.03, x: 960, y: 540, s: 3.4, r: 0.04, tilt: 0.3, snap: 0.2 },
    ];
  }

  gwAt(t: number) { return 1.2 * Math.pow(10, 5 * prog(t, T0, T_TOWN, ease.inQuad)); }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const cam = camAt(this.shots, t);
    const kick = pulses(this.kicks, t, 0.1);
    const over = ease.inQuad(prog(t, 123.9, 127.05));
    const town = pulse(t, T_TOWN, 0.15);
    const settleIn = ease.outQuad(prog(t, T0, T0 + 0.35));
    const punch = 1 + 0.04 * kick;
    const camP = { ...cam, s: cam.s * punch };
    // ---- ground text layer (world window)
    const g = this.ground.ctx; this.ground.clear();
    const w0 = this.words[0]!;
    const fam = F.archivo(125, 900);
    const gsz = Math.min(260, fitSize('GIGAWATTS', fam, 1560));
    g.globalAlpha = 1;
    karaokeWord(g, w0, t, 180, 1040, fam, gsz, { dim: rgbaS(C.bone, 0.12), sung: C.signal, settled: C.ember, hotFor: 0.7 });
    this.ground.upload();
    // ---- the aerial
    const U = this.bg.u;
    (U.uCam!.value as THREE.Vector4).set(camP.x, camP.y, camP.s, camP.r);
    U.uTilt!.value = camP.tilt; U.uT!.value = t; U.uOver!.value = over; U.uFrame!.value = frameIdx(t);
    U.uIgn!.value = settleIn;
    this.bg.render(renderer, out);

    // ---- beam lines, pylons, lightning
    const lb = this.lines; lb.clear();
    this.drawGridLines(lb, camP, t, over, kick);
    this.drawLightning(lb, camP, t, over);
    lb.render(renderer, out);

    // ---- HUD (screen space): line 2 of the lyric, the dying meter
    const c = this.hud.ctx; this.hud.clear();
    const gT = c.createLinearGradient(0, 0, 0, 260); gT.addColorStop(0, 'rgba(10,10,11,0.88)'); gT.addColorStop(0.7, 'rgba(10,10,11,0.8)'); gT.addColorStop(1, 'rgba(10,10,11,0)');
    c.fillStyle = gT; c.fillRect(0, 0, W, 260);
    const fam2 = F.archivo(100, 800);
    const sz2 = Math.min(92, fitSize('IN A CORNFIELD TOWN', fam2, 1100));
    let x = 96;
    for (let i = 1; i < this.words.length; i++) { const w = this.words[i]!; x += karaokeWord(c, w, t, x, 188, fam2, sz2, { dim: rgbaS(C.bone, 0.3), settled: C.bone, slam: 0.12, sung: C.signal }) + sz2 * 0.28; }
    // site meter pinned, then the needle snaps off and the glass goes
    const D = { x: 1560, y: 270, R: 150 };
    const broken = t >= T_TOWN;
    const pin = 0.8 + 0.22 * ease.outCubic(prog(t, T0, 124.4)) + 0.02 * Math.sin(t * 90);
    drawDial(c, D.x, D.y, D.R, { frac: Math.min(pin, 1.03), labelsA: ['0', '0.3', '0.6', '0.9', '1.2', '1.5'], titleA: 'SITE LOAD · GW', redFrom: 0.8, shakeDeg: 3 + 8 * over, t, noNeedle: broken, hubGlow: 1 });
    if (broken) {
      const dt = t - T_TOWN;
      // needle flies at the camera
      const a0 = (135 + 270 * 1.03) * Math.PI / 180, spin = dt * 14;
      const nx = D.x + dt * 900, ny = D.y - dt * 500 + 1400 * dt * dt;
      const L = D.R * 0.9 * (1 + dt * 2);
      c.save(); c.translate(nx, ny); c.rotate(a0 + spin); c.strokeStyle = C.ember; c.lineWidth = 7 * (1 + dt * 2); c.lineCap = 'round';
      c.beginPath(); c.moveTo(-L * 0.2, 0); c.lineTo(L, 0); c.stroke(); c.restore();
      // glass shards
      const rnd = mulberry32(21);
      c.globalAlpha = clamp(1 - dt / 0.9);
      for (let i = 0; i < 16; i++) {
        const a = rnd() * TAU, r0 = D.R * (0.2 + rnd() * 0.7), sp = 260 + rnd() * 700, rot = (rnd() - 0.5) * 12;
        const cx = D.x + Math.cos(a) * r0 + Math.cos(a) * sp * dt, cy = D.y + Math.sin(a) * r0 + Math.sin(a) * sp * dt + 900 * dt * dt;
        c.save(); c.translate(cx, cy); c.rotate(rot * dt);
        c.fillStyle = rgbaS(C.bone, 0.28); c.strokeStyle = rgbaS(C.bone, 0.95); c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -26 * (0.5 + rnd())); c.lineTo(22 * (0.5 + rnd()), 14); c.lineTo(-24 * (0.5 + rnd()), 18); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
      c.globalAlpha = 1;
      // cracked face lines
      c.strokeStyle = rgbaS(C.bone, 0.7); c.lineWidth = 1.5;
      const r2 = mulberry32(5);
      for (let i = 0; i < 8; i++) { let px = D.x, py = D.y; c.beginPath(); c.moveTo(px, py); const a = (i / 8) * TAU + r2() * 0.4; for (let s2 = 1; s2 <= 5; s2++) { const aa = a + (r2() - 0.5) * 0.6; px += Math.cos(aa) * D.R * 0.22; py += Math.sin(aa) * D.R * 0.22; c.lineTo(px, py); } c.stroke(); }
    }
    // digital readout
    const gw = this.gwAt(t);
    c.textAlign = 'center';
    c.font = font(F.mono(600), 40);
    c.fillStyle = broken ? (frameIdx(t) % 4 < 2 ? C.signal : C.bone) : (gw > 100 ? C.signal : C.bone);
    const txt = broken ? '∞ GW' : gw < 1000 ? `${gw.toFixed(1)} GW` : `${Math.round(gw).toLocaleString('en-US')} GW`;
    c.fillText(txt, D.x, D.y + D.R + 62);
    c.font = font(F.mono(500), 13); c.letterSpacing = '3px'; c.fillStyle = rgbaS(C.bone, 0.55);
    c.fillText(broken ? 'METER OVER-RANGE · FAULT' : 'SITE LOAD', D.x, D.y + D.R + 88); c.letterSpacing = '0px'; c.textAlign = 'left';
    drawTPP(c, 96, 960, this.tpp.value(t), { width: 260 });
    comp.draw(renderer, this.hud.upload(), out);

    // ---- whiteout to bone paper (down3's first frame)
    const wk = ease.inQuad(prog(t, 126.75, 127.42));
    if (wk > 0) { this.whiteout.u.uK!.value = wk; this.whiteout.render(renderer, out); }
    void audio;
    const [sx, sy] = shakeVec(t, 8 * kick + 34 * town + 10 * over, 13);
    const flat = prog(t, 127.25, 127.42);
    return {
      bloom: (0.9 + 0.9 * over + 0.6 * town) * (1 - flat) + 0.55 * flat, bloomThreshold: 0.8 + 0.05 * flat, halation: (0.25 + 0.9 * over) * (1 - flat) + 0.25 * flat,
      exposure: 1 + 0.3 * over * (1 - flat), shake: [sx * (1 - flat), sy * (1 - flat)] as [number, number], zoom: 1 + 0.03 * kick + 0.06 * town,
      ca: (1 + 3 * town + 2.5 * over) * (1 - flat) + 1.2 * flat, flash: 0.3 * pulse(t, T0 + 0.03, 0.05) + 0.3 * town, vignette: 0.35,
    };
  }

  // ---------------------------------------------------------------------------------------------
  drawGridLines(lb: LineBatch, cam: { x: number; y: number; s: number; r: number; tilt: number }, t: number, over: number, kick: number) {
    const P = (x: number, y: number) => project(cam, x, y);
    const beat = this.ctx.audio.beatAt(t);
    for (let li = 0; li < this.pylons.length; li++) {
      const L = this.pylons[li]!;
      // wires between crossbar tips, with beam pulses travelling south on the beat
      for (let i = 0; i < L.length; i++) {
        const p = L[i]!;
        const [sx, sy, d] = P(p.x, p.y);
        if (d < 0.1 || Math.abs(sx - 960) > 4000) continue;
        const wsc = Math.min(1.8, Math.max(0.5, d)) * cam.s;
        const arm = 26 * wsc, hgt = 52 * wsc;
        const I = 0.55 + 0.9 * over;
        lb.seg2(sx - arm * 0.5, sy, sx, sy - hgt, 1.6, hot(0.45 * (0.6 + over)), 0.8);
        lb.seg2(sx + arm * 0.5, sy, sx, sy - hgt, 1.6, hot(0.45 * (0.6 + over)), 0.8);
        lb.seg2(sx - arm, sy - hgt * 0.8, sx + arm, sy - hgt * 0.8, 1.4, hot(0.5 * (0.6 + over)), 0.9);
        if (i + 1 < L.length) {
          const q = L[i + 1]!; const [qx, qy, qd] = P(q.x, q.y);
          const wq = Math.min(1.8, Math.max(0.5, qd)) * cam.s;
          for (const sgn of [-1, 0, 1]) {
            lb.seg2(sx + sgn * arm, sy - hgt * 0.8, qx + sgn * 26 * wq, qy - 52 * wq * 0.8, 1.3, amber(0.35 + 0.8 * over), 0.9);
          }
        }
        void I;
      }
      // pulses: head positions along the line, one per beat, speed 1200 px/s world, more with overload
      const nP = 1 + Math.floor(over * 4);
      for (let k = 0; k < nP; k++) {
        const ph = ((beat * 0.5 + k / nP) % 1 + 1) % 1;
        const wy = lerp(-2200, 190, ph);
        const [sx, sy, d] = P(L[0]!.x, wy);
        const [tx, ty] = P(L[0]!.x, wy - 120);
        if (d < 0.1) continue;
        lb.seg2(tx, ty - 40 * cam.s * d * 0.8, sx, sy - 40 * cam.s * d * 0.8, 3.5 * Math.min(1.5, d), amber(1.5 + 2 * over), 1);
        beamHead(lb, sx, sy - 40 * cam.s * d * 0.8, t + k, 0.8 * Math.min(1.4, d) , 1);
      }
    }
    void kick;
  }

  drawLightning(lb: LineBatch, cam: { x: number; y: number; s: number; r: number; tilt: number }, t: number, over: number) {
    const P = (x: number, y: number) => project(cam, x, y);
    const beat = Math.floor(this.ctx.audio.beatAt(t));
    const rnd = (a: number, b: number) => hash(a, b, 41);
    const fi = frameIdx(t);
    // bolts: each beat spawns more; a bolt lives 0.14 s and re-rolls its jag every frame (flicker)
    const nBolts = (b: number) => Math.min(9, 1 + Math.floor((b - 263) * 1.4));
    const sub = 1 / (128 / 60 * 4); // sixteenth
    for (let bi = beat - 1; bi <= beat; bi++) {
      const bt = this.ctx.audio.timeOfBeat(bi);
      const n = nBolts(bi);
      for (let k = 0; k < n; k++) {
        const t0 = bt + k * sub * 0.9;
        const age = t - t0;
        if (age < 0 || age > 0.16) continue;
        const hall = this.halls[Math.floor(rnd(bi, k) * this.halls.length)]!;
        const pl = this.pylons[k % this.pylons.length]!;
        const py = pl[pl.length - 1 - Math.floor(rnd(bi, k + 9) * 5)]!;
        const [ax, ay, ad] = P(py.x, py.y);
        const [bx, by, bd] = P(hall.x + (rnd(bi, k + 3) - 0.5) * 50, hall.y + (rnd(bi, k + 4) - 0.5) * 50);
        if (ad < 0.1 || bd < 0.1) continue;
        // top of bolt in the sky for the long ones
        const topY = ay - 420 * cam.s * ad * (0.4 + rnd(bi, k + 5));
        this.bolt(lb, ax, topY, bx, by, fi * 7 + k * 13 + bi, (1 - age / 0.16) * (0.8 + over * 1.5), 3.0 * Math.min(1.6, bd));
        // impact flash on the hall
        lb.seg2(bx, by, bx + 0.01, by, 46 * Math.min(1.6, bd) * (1 - age / 0.16), hot(2.2), 0.8);
        // anamorphic streak
        lb.seg2(bx - 260 * Math.min(1.5, bd), by, bx + 260 * Math.min(1.5, bd), by, 2.2, amber(0.9 * (1 - age / 0.16) * (0.5 + over)), 0.7);
      }
    }
    // the big strike on "town": fireball flares on a handful of halls
    const dt = t - T_TOWN;
    if (dt >= 0 && dt < 0.9) {
      for (let i = 0; i < 6; i++) {
        const hall = this.halls[Math.floor(hash(i, 77) * this.halls.length)]!;
        const [bx, by, bd] = P(hall.x, hall.y);
        const r = (40 + 380 * ease.outExpo(dt / 0.9)) * Math.min(1.6, bd);
        for (let a = 0; a < 28; a++) {
          const a0 = (a / 28) * TAU, a1 = ((a + 1) / 28) * TAU;
          lb.seg2(bx + Math.cos(a0) * r, by + Math.sin(a0) * r, bx + Math.cos(a1) * r, by + Math.sin(a1) * r, 4, hot(1.8 * (1 - dt / 0.9)), 1 - dt / 0.9);
        }
        beamParticles(lb, t, (tb: number) => (tb >= T_TOWN && tb < T_TOWN + 0.2 ? { x: bx, y: by } : null), { rate: 120, rateMax: 120, life: 0.6, speed: 700, gravity: 900, seed: 30 + i, intensity: 1.3 });
      }
    }
  }

  bolt(lb: LineBatch, x0: number, y0: number, x1: number, y1: number, seed: number, I: number, w: number) {
    const N = 14;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    let px = x0, py = y0;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const jag = (hash(seed, i, 2) - 0.5) * len * 0.13 * Math.sin(Math.PI * u) * 1.6;
      const x = lerp(x0, x1, u) + nx * jag, y = lerp(y0, y1, u) + ny * jag;
      lb.seg2(px, py, x, y, w * 2.6, amber(0.7 * I), 0.55);
      lb.seg2(px, py, x, y, w, hot(2.6 * I), 1);
      // a branch now and then
      if (hash(seed, i, 7) > 0.8) {
        const bl = len * 0.18 * hash(seed, i, 8), ba = Math.atan2(dy, dx) + (hash(seed, i, 9) - 0.5) * 2.2;
        lb.seg2(x, y, x + Math.cos(ba) * bl, y + Math.sin(ba) * bl, w * 0.8, hot(1.6 * I), 0.9);
      }
      px = x; py = y;
    }
  }
}
