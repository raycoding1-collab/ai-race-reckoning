// `tin` (bars 4-6, 7.5-11.25 s): Edgerton stroboscope photography.
// A black vacuum chamber. A capillary nozzle fires molten tin droplets; a strobe on every 16th freezes
// the stream and each exposure stays on the "film" as a fading ghost, so every droplet drags a trail of
// frozen copies (the stream steps down per flash). The droplets are rendered liquid metal (analytic
// spheres reflecting the strobe softbox and the amber bay light). The lyric is the high-speed camera's
// slate: FIFTY THOUSAND clacks the counter up one syllable at a time to 50,000 and locks; "tin drops every
// second" is chalked by the beam. A timing diagram (strobe / droplet / laser) scrolls under the column.
// Out: the last flash is the pre-pulse; one droplet pancakes and the camera punches in on it.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, fitSize } from '../engine/type';
import { strokeText, drawStrokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { clamp, ease, lerp, prog, pulse } from '../engine/util';
import { lineByScene } from './_motifs';
import { BT, H_SAND_TIN, H_TIN_LASER, beamHead, beamParticles, karaoke, mono, odometer, wordP } from './sand-kit';

const T0 = 7.5;
const DT = BT(0.25); // one 16th: the strobe period
const S = 210; // droplet spacing (px)
const XS = H_SAND_TIN.x;
const R = H_SAND_TIN.r;
const K_PP = 29; // the 29th flash is the laser pre-pulse
const T_PP = T0 + K_PP * DT;
const Y_PP = 560; // the pre-pulsed droplet's y
// stream: y_i(t) = Y0 + V (t - T0) + i S ; droplet i=3 sits at H_SAND_TIN.y at T0, and one lands at Y_PP at T_PP
const V = (Y_PP - H_SAND_TIN.y + 14 * S) / (T_PP - T0); // ~S/2 per flash: ghosts interleave
const Y0 = H_SAND_TIN.y - 3 * S;
const NG = 7; // ghosts kept on the film

const FRAG = /* glsl */ `
#define NG ${NG}
uniform float uPhase[NG]; uniform float uExpo[NG];
uniform float uS, uR, uX;
uniform vec4 uCam; // s, Px, Py, unused  (screen = (world - P) * s + Q)
uniform vec2 uQ;
uniform float uHot, uPan, uPanY, uAmb, uPP, uFade;
// environment seen in liquid tin: the strobe softbox (upper left), the amber bay light (right), a dark floor
vec3 env(vec3 r) {
  vec3 c = vec3(0.004);
  // softbox: a rounded rectangle in direction space
  vec2 a = vec2(atan(r.x, r.z), asin(clamp(r.y, -1.0, 1.0)));
  float sb = sdBox(a - vec2(-0.62, 0.55), vec2(0.34, 0.22)) - 0.05;
  c += vec3(2.6, 2.5, 2.35) * (1.0 - smoothstep(-0.01, 0.01, sb));
  float sb2 = sdBox(a - vec2(0.55, 0.62), vec2(0.12, 0.08)) - 0.02;
  c += vec3(1.2) * (1.0 - smoothstep(-0.01, 0.01, sb2));
  c += C_SIGNAL * 1.2 * smoothstep(0.2, 1.0, r.x) * smoothstep(0.5, -0.2, r.y);
  c += C_GRAPHITE * 0.25 * smoothstep(0.0, -0.6, r.y);
  return c;
}
vec3 drop(vec2 d, float r, float hot) {
  vec2 q = d / r; float r2 = dot(q, q);
  if (r2 >= 1.0) return vec3(0.0);
  float nz = sqrt(1.0 - r2);
  vec3 n = vec3(q.x, -q.y, nz);
  vec3 rf = reflect(vec3(0.0, 0.0, -1.0), n);
  float fres = 0.62 + 0.38 * pow(1.0 - nz, 4.0);
  vec3 col = env(rf) * fres * vec3(0.92, 0.9, 0.86);
  col = mix(col, heat(0.55 + 0.45 * nz) * (1.4 + 2.2 * nz), hot);
  float aa = 1.0 - smoothstep(1.0 - 1.6 / r, 1.0, sqrt(r2));
  return col * aa;
}
void main() {
  vec2 sp = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);           // screen px, y down
  vec2 w = (sp - uQ) / uCam.x + uCam.yz;                    // world px
  vec3 col = C_INK;
  // chamber: viewport rings and a faint wall gradient lit by the strobe
  float rr = length(w - vec2(960.0, 540.0));
  col += C_GRAPHITE * 0.05 * (0.4 + 2.5 * uAmb) * smoothstep(1500.0, 300.0, rr);
  float ring = pxLine(abs(rr - 1010.0) * uCam.x, 0.5, 1.4) + pxLine(abs(rr - 1030.0) * uCam.x, 0.4, 1.2) * 0.6;
  col += C_ASH * ring * (0.18 + 0.6 * uAmb);
  // nozzle: a tapered capillary, engraved as a cylinder (vertical lines that thicken toward the edges)
  float ny = w.y; float hw = mix(34.0, 9.0, sat(ny / 112.0));
  if (ny < 112.0 && abs(w.x - uX) < hw) {
    float u = (w.x - uX) / hw;
    float lit = sat(0.25 + 0.75 * (1.0 - abs(u + 0.35)));
    float ln = hatchD(u * 7.0, 0.15 + 0.55 * (1.0 - lit), fwidth(u * 7.0));
    col = C_INK2 + C_BONE * 0.55 * (1.0 - ln) * lit * (0.5 + 0.8 * uAmb);
    col += C_BONE * pxLine((hw - abs(w.x - uX)) * uCam.x, 0.5, 1.4) * 0.8;
  }
  // the droplets: every ghost exposure, summed like film
  for (int k = 0; k < NG; k++) {
    float e = uExpo[k]; if (e < 0.004) continue;
    float y0 = uPhase[k];
    float i = floor((w.y - y0) / uS + 0.5);
    vec2 c = vec2(uX, y0 + i * uS);
    if (c.y < 118.0) continue;
    vec2 d = w - c;
    // the pre-pulsed droplet pancakes (newest exposure only)
    float rx = uR, ry = uR;
    bool isPP = k == 0 && uPan > 0.0 && abs(c.y - uPanY) < 2.0;
    if (isPP) { rx = mix(uR, uR * 2.7, uPan); ry = mix(uR, uR * 0.56, uPan); d = vec2(d.x * uR / rx, d.y * uR / ry); }
    float hot = (abs(i - 3.0) < 0.5) ? uHot * (k == 0 ? 1.0 : 0.6) : 0.0;
    if (isPP) hot = max(hot, uPP * 0.8);
    vec3 dc = drop(d, uR, hot);
    float ghost = k == 0 ? 1.0 : 0.85;
    col += dc * e * ghost * mix(vec3(1.0), vec3(1.0, 0.86, 0.66), float(k) / float(NG));
  }
  // pre-pulse laser: a thin amber line from the right edge into the droplet
  if (uPP > 0.0) {
    float d = abs(w.y - uPanY);
    float on = step(uX, w.x);
    col += (C_SIGNAL * 2.0 * exp(-d * uCam.x / 2.5) + C_EMBER * 3.0 * exp(-d * uCam.x / 0.9)) * on * uPP;
  }
  col *= 1.0 - uFade;
  fragColor = vec4(col, 1.0);
}`;

export default class TinScene extends Scene {
  bg = new FSPass(FRAG, {
    uPhase: { value: new Array(NG).fill(0) }, uExpo: { value: new Array(NG).fill(0) },
    uS: { value: S }, uR: { value: R }, uX: { value: XS },
    uCam: { value: new THREE.Vector4(1, 0, 0, 0) }, uQ: { value: new THREE.Vector2(0, 0) },
    uHot: { value: 0 }, uPan: { value: 0 }, uPanY: { value: Y_PP }, uAmb: { value: 0 }, uPP: { value: 0 }, uFade: { value: 0 },
  });
  hud = new Layer2D();
  lb = new LineBatch(20000);
  line: any;
  st!: StrokeText;
  chalkTimes: [number, number][] = [];
  chalkX = 862; chalkY = 800;

  override init() {
    this.line = lineByScene(this.ctx.lyrics, 'tin');
    // "tin drops every second" chalked by the beam, timed per word
    const words = this.line.words.slice(2);
    const text = words.map((w: any) => w.w).join(' ');
    this.st = strokeText(text, 'script', 138, 2);
    let ci = 0;
    words.forEach((w: any, wi: number) => {
      const n = Array.from(w.w as string).length;
      for (let i = 0; i < n; i++) this.chalkTimes[ci++] = [lerp(w.start, w.end, i / n), lerp(w.start, w.end, (i + 1) / n)];
      if (wi < words.length - 1) { this.chalkTimes[ci++] = [w.end, w.end]; }
    });
  }

  /** 2D camera: screen = (world - P) s + Q. Locked, then the punch-in onto the pancake. */
  cam(t: number) {
    const k = ease.outExpo(prog(t, T_PP + 0.12, 11.25));
    const s = lerp(1, H_TIN_LASER.rx / (R * 2.7), k);
    return { s, P: [lerp(0, XS, k), lerp(0, Y_PP, k)] as [number, number], Q: [lerp(0, H_TIN_LASER.x, k), lerp(0, H_TIN_LASER.y, k)] as [number, number] };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const u = this.bg.u;
    const kNow = Math.min(K_PP, Math.floor((t - T0) / DT + 1e-6));
    const ph = u.uPhase!.value as number[], ex = u.uExpo!.value as number[];
    for (let g = 0; g < NG; g++) {
      const k = kNow - g;
      if (k < 0) { ex[g] = 0; continue; }
      const tk = T0 + k * DT;
      ph[g] = Y0 + V * (tk - T0);
      // film: the newest exposure is full; older ones fade with age (and after the pre-pulse, all fade but the pancake)
      const age = t - tk;
      ex[g] = g === 0 ? 1.0 : Math.pow(0.52, g) * Math.exp(-age * 1.2);
      if (t > T_PP + 0.05 && g > 0) ex[g]! *= 1 - prog(t, T_PP + 0.05, T_PP + 0.25);
    }
    const c = this.cam(t);
    (u.uCam!.value as THREE.Vector4).set(c.s, c.P[0], c.P[1], 0);
    (u.uQ!.value as THREE.Vector2).set(c.Q[0], c.Q[1]);
    u.uHot!.value = 1 - prog(t, T0, T0 + 0.7, ease.outQuad);
    const amb = pulse(t, T0 + kNow * DT, 0.035);
    u.uAmb!.value = amb;
    u.uPan!.value = ease.outExpo(prog(t, T_PP + 0.02, T_PP + 0.3));
    u.uPP!.value = pulse(t, T_PP, 0.05) * (t >= T_PP ? 1 : 0);
    u.uFade!.value = 0;
    this.bg.render(renderer, out);

    // ---- timing diagram + beam (LineBatch, additive)
    const L = this.lb; L.clear();
    const T = this.hud; T.clear();
    const x = T.ctx;
    const ui = 1 - prog(t, T_PP + 0.1, T_PP + 0.3);
    this.drawDiagram(t, L, x, ui);
    this.drawSlate(t, x, L, ui);
    comp.draw(renderer, T.upload(), out);
    L.render(renderer, out);

    const down = Math.max(pulse(t, T0, 0.09), pulse(t, BT(20), 0.09));
    return {
      bloom: 0.7, bloomThreshold: 1.15, vignette: 0.45, grain: 0.05,
      zoom: 1 + 0.03 * down + 0.004 * amb, flash: 0.02 * amb + 0.08 * u.uPP!.value,
      shake: [0, 6 * pulse(t, T0, 0.06)],
    };
  }

  drawDiagram(t: number, L: LineBatch, x: CanvasRenderingContext2D, a: number) {
    if (a <= 0) return;
    const y0 = 902, gap = 40, pxs = 560; // px per second
    const x0 = 112, x1 = 1808;
    const X = (tau: number) => XS + (tau - t) * pxs;
    const rows: { name: string; period: number; width: number; phase: number }[] = [
      { name: 'STROBE', period: DT, width: 0.012, phase: T0 },
      { name: 'DROPLET', period: S / V, width: 0.03, phase: T0 - 3 * S / V },
      { name: 'LASER', period: 1e9, width: 0.02, phase: T_PP },
    ];
    rows.forEach((r, ri) => {
      const yb = y0 + ri * gap, hgt = 18;
      const pts: { x: number; y: number }[] = [{ x: x0, y: yb }];
      const t0 = t - (XS - x0) / pxs, t1 = t + (x1 - XS) / pxs;
      const n0 = Math.ceil((t0 - r.phase) / r.period), n1 = Math.floor((t1 - r.phase) / r.period);
      for (let n = Math.max(n0, ri === 2 ? 0 : -999); n <= Math.min(n1, ri === 2 ? 0 : 999); n++) {
        const ta = r.phase + n * r.period;
        if (ri === 0 && ta > T_PP + 1e-3) break;
        if (ta < 7.0) continue;
        const xa = X(ta), xb = X(ta + r.width);
        if (xb < x0 || xa > x1) continue;
        pts.push({ x: xa, y: yb }, { x: xa, y: yb - hgt }, { x: xb, y: yb - hgt }, { x: xb, y: yb });
      }
      pts.push({ x: x1, y: yb });
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1]!, q = pts[i]!;
        const past = (p.x + q.x) / 2 <= XS;
        const col: [number, number, number] = past ? (ri === 2 ? [LIN.signal[0] * 2, LIN.signal[1] * 2, LIN.signal[2] * 2] : [LIN.bone[0] * 0.8, LIN.bone[1] * 0.8, LIN.bone[2] * 0.8]) : [LIN.graphite[0] * 0.8, LIN.graphite[1] * 0.8, LIN.graphite[2] * 0.8];
        L.seg2(p.x, p.y, q.x, q.y, 1.3, col, a);
      }
      mono(x, r.name, x0, yb - hgt - 6, 13, rgba('bone', 0.5 * a), 500, 'left', 2);
    });
    // the now-cursor through the stream
    L.seg2(XS, y0 - 40, XS, y0 + 2 * gap + 10, 1, [LIN.signal[0] * 1.2, LIN.signal[1] * 1.2, LIN.signal[2] * 1.2], a);
    const nFl = Math.max(0, Math.min(K_PP + 1, Math.floor((t - T0) / DT) + 1));
    mono(x, `FLASH ${String(nFl).padStart(3, '0')} · Δt ${(DT * 1000).toFixed(1)} ms (song) · 20 µs (real)`, XS + 12, y0 + 2 * gap + 26, 13, rgba('bone', 0.55 * a), 500);
  }

  drawSlate(t: number, x: CanvasRenderingContext2D, L: LineBatch, a: number) {
    if (a <= 0) return;
    x.globalAlpha = a;
    const w = this.line.words;
    const X0 = 860, X1 = 1808;
    // slate frame: hairline rules
    x.fillStyle = rgba('bone', 0.35);
    x.fillRect(X0, 112, X1 - X0, 1.2);
    x.fillRect(X0, 160, X1 - X0, 1.2);
    mono(x, 'SCENE 02 · Sn DROPLET GENERATOR', X0, 145, 16, rgba('bone', 0.85), 600, 'left', 1.5);
    mono(x, 'STROBE 1/16 · ROLL 7A', X1, 145, 16, rgba('bone', 0.5), 500, 'right', 1.5);
    // FIFTY THOUSAND, per word
    const fam = F.archivo(75, 900);
    let xx = X0;
    for (const wi of [0, 1]) {
      const wd = w[wi];
      const p = wordP(wd, t);
      const ww = karaoke(x, wd.w.toUpperCase(), xx, 292, fam, 118, p, rgba('bone', 1), rgba('bone', 0.2));
      xx += ww + 30;
    }
    // the counter: clacks up per syllable, then locks in amber
    const syl: number[] = [...w[0].syl.map((s: number[]) => s[0]), ...w[1].syl.map((s: number[]) => s[0])];
    const vals = ['00,000', '12,500', '25,000', '37,500', '50,000'];
    let si = 0; for (let i = 0; i < syl.length; i++) if (t >= syl[i]!) si = i + 1;
    const lock = t >= w[1].end;
    const kk = si === 0 ? 1 : clamp((t - syl[si - 1]!) / 0.12);
    const col = lock ? rgba('signal', 1) : rgba('bone', 0.95);
    const cy = 590 + 14 * (si > 0 ? pulse(t, syl[si - 1]!, 0.05) : 0);
    const cf = F.archivo(87.5, 900);
    odometer(x, vals[si]!, vals[Math.max(0, si - 1)]!, kk, X0 - 6, cy, cf, Math.min(290, fitSize('50,000', cf, X1 - X0 + 6)), col);
    mono(x, 'DROPS / SECOND', X0, 640, 16, rgba('bone', 0.6), 600, 'left', 3);
    mono(x, 'Sn · ⌀ 27 µm · 50,000 Hz', X1, 640, 16, rgba('bone', 0.5), 500, 'right', 1);
    // "tin drops every second": chalked by the beam
    const len = writtenLength(this.st, this.chalkTimes, t);
    x.save();
    x.translate(this.chalkX, this.chalkY);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = rgba('bone', 0.95); x.lineWidth = 5;
    const head = drawStrokeText(x, this.st, len);
    x.restore();
    x.globalAlpha = 1;
    const writing = t > w[2].start - 0.02 && t < w[5].end + 0.05;
    if (head && writing) {
      const hx = this.chalkX + head.x, hy = this.chalkY + head.y;
      beamHead(L, hx, hy, t, 0.9, a);
      beamParticles(L, t, (tb) => {
        if (tb < w[2].start || tb > w[5].end) return null;
        const h = drawStrokeHead(this.st, writtenLength(this.st, this.chalkTimes, tb));
        return h ? { x: this.chalkX + h.x, y: this.chalkY + h.y } : null;
      }, { rate: 110, speed: 200, life: 0.35, intensity: a });
    }
    void font;
  }
}

/** Head position of a stroke text at written length `len` (no drawing). */
function drawStrokeHead(st: StrokeText, len: number): { x: number; y: number } | null {
  for (let i = 0; i < st.strokes.length; i++) {
    const s0 = st.startLen[i]!, L = st.lens[i]!, pts = st.strokes[i]!;
    const tot = L[L.length - 1] ?? 0;
    if (len > s0 + tot && i < st.strokes.length - 1) continue;
    const r = clamp(len - s0, 0, tot);
    let j = 1; while (j < pts.length - 1 && L[j]! < r) j++;
    const a = pts[j - 1]!, b = pts[j]!;
    const u = (r - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!);
    return { x: a.x + (b.x - a.x) * clamp(u), y: a.y + (b.y - a.y) * clamp(u) };
  }
  return null;
}
