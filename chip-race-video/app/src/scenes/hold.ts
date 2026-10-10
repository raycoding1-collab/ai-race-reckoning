// HOLD (bars 58-62, 108.75-116.25): "Hold the line... hold the line..."
// The line the crown collapsed into (y = 540, x = 120..1800) is a string held in two clamps. It vibrates
// as standing waves: the dominant mode steps up with the sung pitch (the nodes are marked), the
// amplitude climbs with the snare roll, the lyric is set ON the string and shakes with it ("condense
// under pressure"; "line" stretches across its held note). iv -> V is shown as the 9:8 step of its
// pitch at 112.5. TPP flickers toward infinity. Stutter frames (the roll in 32nds) and a tape stop
// freeze the string at full tension; on the downbeat of the gap (115.3125, silence) it SNAPS: two ends
// whip off-frame, an inhale of black, and a white flash into the drop at 116.25.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT, clearRT, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { Lyrics } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, noise1, prog, pulse, smoothstep } from '../engine/util';
import { drawTPP, lineByScene, sparkHead, sparkParticles } from './_motifs';
import { STRING_X0, STRING_X1, STRING_Y } from './whoscrown';

const T0 = 108.75, T_END = 116.25;
const T_SNAP = 115.3125, T_STOP = 114.8625, T_ROLL32 = 114.375, T_V = 112.5;
const XL = STRING_X0, XR = STRING_X1, LEN = XR - XL;
const F0 = 3.2;           // Hz, the fundamental at the start
const TR = T_SNAP - T0;   // seconds of rising tension

/** Visual time: the 32nd-note roll stutters (frames repeat), the tape stop decelerates to a halt. */
export function tapeTime(t: number): number {
  if (t < T_ROLL32) return t;
  if (t < T_STOP) {
    const d = 0.0586, k = Math.floor((t - T_ROLL32) / d);
    return T_ROLL32 + k * d - (hash(k, 3) > 0.62 ? 2 * d : 0);
  }
  if (t < T_SNAP) {
    const D = T_SNAP - T_STOP, u = (t - T_STOP) / D;
    const raw = D * (u - (u * u) / 2);          // speed 1 -> 0: the tape dies
    const q = 0.04 + 0.16 * u;                  // and the picture steps ever slower
    return T_STOP + Math.floor(raw / q) * q;
  }
  return T_SNAP;
}

const F_BASE = (tau: number) => { const u = clamp((tau - T0) / TR); return F0 * ((tau - T0) + 0.9 * TR * Math.pow(u, 2.5) / 2.5); };
/** phase (cycles) of the fundamental: the 9:8 step of iv -> V at 112.5 */
export function phase1(tau: number): number {
  if (tau <= T_V) return F_BASE(tau);
  return F_BASE(T_V) + 1.125 * (F_BASE(tau) - F_BASE(T_V));
}
/** the dominant mode steps up with the sung notes */
const MODES: [number, number][] = [[T0, 2], [109.45, 3], [T_V, 4], [113.2, 5], [T_ROLL32, 6]];
function modeWeights(tau: number): Map<number, number> {
  const w = new Map<number, number>();
  const sm = 0.1;
  MODES.forEach(([ts, n], i) => {
    const on = i === 0 ? 1 : smoothstep(ts - sm, ts + sm, tau);
    const off = i + 1 < MODES.length ? 1 - smoothstep(MODES[i + 1]![0] - sm, MODES[i + 1]![0] + sm, tau) : 1;
    w.set(n, on * off);
  });
  return w;
}
export function domMode(tau: number): number { let n = 2; for (const [ts, m] of MODES) if (tau >= ts) n = m; return n; }

/** amplitude envelope (px): climbs with the snare roll */
const AMP = (tau: number) => 3 + 117 * Math.pow(clamp((tau - T0) / TR), 2.2);

function stringY(x: number, tau: number, kickBoost: number): number {
  const xi = clamp((x - XL) / LEN);
  const w = modeWeights(tau);
  const ph = phase1(tau);
  let s = 0;
  for (const [n, wt] of w) {
    if (wt < 1e-3) continue;
    const a = Math.sin(n * Math.PI * xi) * Math.cos(2 * Math.PI * n * ph + n * 1.3);
    s += wt * a;
    // neighbours: a little organic overtone
    s += wt * 0.16 * Math.sin((n + 3) * Math.PI * xi) * Math.cos(2 * Math.PI * (n + 3) * ph + 0.7);
  }
  return STRING_Y + AMP(tau) * (1 + 0.25 * kickBoost) * s * 0.9;
}

export default class HoldScene extends Scene {
  rt = makeRT();
  layer = new Layer2D();
  lb = new LineBatch(24000, { blend: 'add' });
  glitch!: FSPass;
  lines: any[] = [];

  override init() {
    this.lines = [lineByScene(this.ctx.lyrics, 'hold1'), lineByScene(this.ctx.lyrics, 'hold2')];
    this.glitch = new FSPass(/* glsl */ `
      uniform sampler2D tex; uniform float uG, uF, uVig;
      void main() {
        vec2 uv = vUv;
        float band = floor(uv.y * 28.0);
        float hh = hash12(vec2(band, uF));
        float on = step(1.0 - uG * 0.55, hh);
        float off = (hash12(vec2(band + 40.0, uF)) - 0.5) * 0.22 * uG * on;
        // slow vertical roll while the tape is dying
        uv.y = fract(uv.y + uG * uG * 0.02 * sin(uF * 0.7));
        vec2 uvr = uv + vec2(off + 0.004 * uG, 0.0), uvb = uv + vec2(off - 0.004 * uG, 0.0), uvg = uv + vec2(off, 0.0);
        vec3 c = vec3(texture(tex, uvr).r, texture(tex, uvg).g, texture(tex, uvb).b);
        // a bright tear line
        float tear = on * step(0.995, hash12(vec2(band, uF + 7.0)));
        c += tear * vec3(0.5, 0.35, 0.2) * uG;
        fragColor = vec4(c, 1.0);
      }`, { tex: { value: null }, uG: { value: 0 }, uF: { value: 0 }, uVig: { value: 0 } });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const tau = tapeTime(t);
    const u = clamp((tau - T0) / TR);
    // kick boosts (quarter-note plucks until 113.9)
    const kickB = f.a.kick;
    const snapped = t >= T_SNAP;
    const ageSnap = Math.max(0, t - T_SNAP);

    clearRT(renderer, this.rt, [0, 0, 0], 1);
    const lb = this.lb; lb.clear();
    const fl = 0.8 + 0.2 * hash(frameIdx(t), 17);
    const I = (0.7 + 0.8 * u) * fl;
    const fadeIn = 1;

    if (!snapped) {
      // ghost exposures (stroboscopic trail), then the string
      const N = 120;
      const pts = (tt: number) => { const a: { x: number; y: number }[] = []; for (let i = 0; i <= N; i++) { const x = XL + (LEN * i) / N; a.push({ x, y: stringY(x, tt, kickB) }); } return a; };
      if (t - T0 > 0.5) {
        for (let k = 3; k >= 1; k--) {
          const g = pts(tau - 0.011 * k);
          lb.polyline(g, 1.6, [LIN.signal[0] * 1.2 * I, LIN.signal[1] * 1.2 * I, LIN.signal[2] * 1.2 * I], 0.22 / k * Math.min(1, u * 3 + 0.2));
        }
      }
      const s = pts(tau);
      lb.polyline(s, 16, [LIN.signal[0] * 0.30 * I, LIN.signal[1] * 0.30 * I, LIN.signal[2] * 0.30 * I], 0.55 * fadeIn);
      lb.polyline(s, 5.5, [LIN.signal[0] * 1.5 * I, LIN.signal[1] * 1.5 * I, LIN.signal[2] * 1.5 * I], fadeIn);
      lb.polyline(s, 2.1, [4.2 * I, 3.4 * I, 2.2 * I], fadeIn);
      // sparks fly off the antinodes once the string is straining
      if (u > 0.35) {
        const n = domMode(tau);
        for (let k = 0; k < n; k++) {
          const xk = XL + (LEN * (k + 0.5)) / n;
          sparkParticles(lb, t, (tb) => ({ x: xk, y: stringY(xk, Math.min(tapeTime(tb), tau), 0) }), { rate: (tb) => 14 * Math.pow(clamp((tb - T0) / TR), 2), rateMax: 14, life: 0.4, speed: 170, gravity: 400, intensity: 0.8, seed: 40 + k, width: 1.3 });
        }
      }
    } else {
      this.drawSnap(lb, t, ageSnap, tau);
    }
    lb.render(renderer, this.rt);

    // ---- 2D: clamps, nodes, type, readouts
    const Lr = this.layer; Lr.clear();
    const c = Lr.ctx;
    this.drawClamps(c, t, ease.outCubic(prog(t, T0, T0 + 0.25)), snapped, ageSnap);
    if (!snapped) this.drawNodes(c, t, tau);
    this.drawLyric(c, t, tau, kickB);
    this.drawReadouts(c, t, tau, u);
    comp.draw(renderer, Lr.upload(), this.rt);

    // ---- glitch pass into out
    const gl = this.glitchAmt(t);
    this.glitch.u.tex!.value = this.rt.texture;
    this.glitch.u.uG!.value = gl;
    this.glitch.u.uF!.value = frameIdx(t) * 0.1;
    this.glitch.render(renderer, out);

    // ---- post
    const A = AMP(tau);
    const flash = smoothstep(T_END - 0.07, T_END - 0.005, t) * 1.6 + 0.3 * pulse(t, T_SNAP, 0.05);
    const inhale = smoothstep(T_SNAP + 0.25, T_END - 0.15, t);
    const tremble = (!snapped ? 1 : 0) * (t < T_STOP ? 1 : 0.0);
    return {
      bloom: 0.8 + 0.4 * u, bloomThreshold: 0.8, vignette: 0.42 + 0.45 * inhale, ca: 0.4 + 0.8 * u + 3 * gl,
      zoom: 1 + 0.035 * u + 0.012 * kickB + 0.02 * pulse(t, T_V, 0.1),
      shake: [noise1(t * 60, 4) * 0.07 * A * tremble * u, noise1(t * 57, 9) * 0.05 * A * tremble * u],
      flash, grain: 0.06 + 0.04 * gl,
    };
  }

  private glitchAmt(t: number): number {
    let g = 0;
    g = Math.max(g, 0.5 * pulse(t, T_V, 0.09), 0.45 * pulse(t, T_ROLL32, 0.12));
    if (t > T_ROLL32 && t < T_SNAP) g = Math.max(g, 0.25 + 0.45 * smoothstep(T_ROLL32, T_SNAP, t));
    if (t > T_STOP && t < T_SNAP) g = Math.max(g, 0.55 + 0.35 * smoothstep(T_STOP, T_SNAP, t));
    g = Math.max(g, 0.9 * pulse(t, T_SNAP, 0.06));
    return clamp(g);
  }

  /** The two broken ends whip away; the break point sparks. */
  private drawSnap(lb: LineBatch, t: number, age: number, tauFreeze: number) {
    const xb = XL + LEN * 0.58;
    const side = [-1, 1] as const;
    for (const sd of side) {
      const L = sd < 0 ? xb - XL : XR - xb;
      const N = 80;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= N; i++) {
        const q = i / N;                              // 0 at the break, 1 at the clamp
        const x0 = xb + sd * L * q;
        const y0 = stringY(x0, tauFreeze, 0) - STRING_Y;
        const shift = 1900 * Math.pow(age, 1.55);   // the piece is thrown away from the break, outwards
        const whip = 150 * Math.sin(14 * q - 26 * age) * Math.exp(-age * 2.2) * (0.3 + q);
        pts.push({ x: x0 + sd * shift * (0.3 + 0.7 * q), y: STRING_Y + y0 * Math.exp(-age * 5) + whip + 220 * age * age * (1 - q) * sd * 0.0 + 140 * age * (q - 0.5) * (sd) });
      }
      const fade = 1 - smoothstep(0.5, 0.75, age);
      lb.polyline(pts, 16, [LIN.signal[0] * 0.3, LIN.signal[1] * 0.3, LIN.signal[2] * 0.3], 0.55 * fade);
      lb.polyline(pts, 5.5, [LIN.signal[0] * 1.5, LIN.signal[1] * 1.5, LIN.signal[2] * 1.5], fade);
      lb.polyline(pts, 2.1, [4.2, 3.4, 2.2], fade);
      // the whipping tip
      const tip = pts[0]!;
      if (fade > 0.05) sparkHead(lb, tip.x, tip.y, t, 0.6, fade);
    }
    // the break itself
    if (age < 0.5) {
      const yb = STRING_Y + (stringY(xb, tauFreeze, 0) - STRING_Y);
      sparkParticles(lb, t, (tb) => (tb >= T_SNAP ? { x: xb, y: yb } : null), { rate: 400, life: 0.5, speed: 520, gravity: 900, intensity: 1.2, seed: 77, width: 1.8 });
      const a = pulse(t, T_SNAP, 0.07);
      lb.seg2(xb, yb, xb + 0.01, yb, 90 * a + 8, [LIN.ember[0] * 2 * a, LIN.ember[1] * 2 * a, LIN.ember[2] * 2 * a], 0.8 * a);
    }
  }

  private drawClamps(c: CanvasRenderingContext2D, t: number, fadeIn: number, snapped: boolean, age: number) {
    const a = fadeIn * (1 - 0.0 * age) * (snapped ? 0.35 + 0.65 * Math.exp(-age * 2) : 1);
    c.save();
    c.globalAlpha = a;
    for (const [x, d] of [[XL, 1], [XR, -1]] as const) {
      c.strokeStyle = rgba('bone', 0.75); c.lineWidth = 1.2;
      // a post with a head and teeth, engraved with hairlines
      c.beginPath();
      c.rect(x - (d > 0 ? 34 : 0), STRING_Y - 70, 34, 140);
      c.moveTo(x, STRING_Y - 70); c.lineTo(x, STRING_Y + 70);
      c.stroke();
      c.lineWidth = 0.8; c.strokeStyle = rgba('bone', 0.35);
      c.beginPath();
      for (let i = -64; i <= 64; i += 8) { const x0 = x - (d > 0 ? 34 : 0); c.moveTo(x0, STRING_Y + i); c.lineTo(x0 + 34, STRING_Y + i + 8 * 0.0); }
      c.stroke();
      // hex nut
      c.strokeStyle = rgba('bone', 0.75); c.lineWidth = 1.2;
      c.beginPath();
      for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2; const px = x - d * 48 + Math.cos(an) * 16, py = STRING_Y + Math.sin(an) * 16; if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); }
      c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(x - d * 32, STRING_Y); c.lineTo(x, STRING_Y); c.stroke();
    }
    c.restore();
  }

  /** nodes of the dominant mode: tick marks on the string, with a mode readout */
  private drawNodes(c: CanvasRenderingContext2D, t: number, tau: number) {
    const n = domMode(tau);
    const a = ease.outCubic(prog(t, T0 + 0.3, T0 + 0.8));
    c.save();
    c.globalAlpha = a * 0.9;
    c.strokeStyle = rgba('bone', 0.7); c.lineWidth = 1.1;
    for (let k = 1; k < n; k++) {
      const x = XL + (LEN * k) / n;
      c.beginPath(); c.moveTo(x, STRING_Y - 16); c.lineTo(x, STRING_Y + 16); c.stroke();
      c.beginPath(); c.arc(x, STRING_Y, 4, 0, Math.PI * 2); c.stroke();
    }
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.55); c.textBaseline = 'alphabetic';
    c.fillText(`MODE n = ${n} · ${n - 1} NODE${n > 2 ? 'S' : ''}`, XL + 44, STRING_Y - 92);
    c.restore();
  }

  private drawLyric(c: CanvasRenderingContext2D, t: number, tau: number, kickB: number) {
    c.save();
    c.textBaseline = 'alphabetic';
    const A = AMP(tau);
    for (let li = 0; li < 2; li++) {
      const ln = this.lines[li];
      const t0 = ln.start - 0.35, t1 = li === 0 ? 111.55 : T_SNAP - 0.25;
      if (t < t0 || t > t1 + 0.4) continue;
      const out = 1 - smoothstep(t1, t1 + 0.35, t);
      // size and weight escalate; the width condenses with the strain and widens on the held "line"
      const base = li === 0 ? 196 : 232;
      const press = clamp((tau - T0) / TR);
      const widths = [] as { w: any; fam: string; size: number; lay: ReturnType<typeof layout> }[];
      let total = 0;
      const gap = base * 0.26;
      ln.words.forEach((w: any, i: number) => {
        const sung = Lyrics.wordProgress(w, t);
        const held = i === ln.words.length - 1 ? ease.inOutCubic(clamp((t - w.start) / Math.max(0.3, w.end - w.start))) : 0;
        const wd = clamp(lerp(100, 75, press * 0.8) + 40 * held, 62, 125);
        const fam = F.archivo(wd, li === 0 ? 800 : 900);
        const lay = layout(w.w, fam, base);
        widths.push({ w, fam, size: base, lay });
        total += lay.width + (i ? gap : 0);
        void sung;
      });
      // the ellipsis trails after the last word once it is sung
      let x = 960 - total / 2;
      widths.forEach(({ w, fam, size, lay }, wi) => {
        const appear = ease.outExpo(prog(t, w.start - 0.35, w.start - 0.35 + 0.28));
        const slam = 1 + 0.22 * pulse(t, w.start, 0.09);
        const p = Lyrics.wordProgress(w, t);
        c.font = font(fam, size);
        lay.glyphs.forEach((g, gi) => {
          const cx = x + g.x + g.w / 2;
          const y0 = stringY(cx, tau, kickB), y1 = stringY(cx + 6, tau, kickB);
          const slope = Math.atan2(y1 - y0, 6) * 0.9;
          const nch = lay.glyphs.length;
          const sungG = clamp(p * nch - gi);       // 0..1 sung state of this glyph
          const lift = 18 + 0.0 * A;
          c.save();
          c.translate(cx, y0 - lift);
          c.rotate(slope);
          c.scale(slam, slam);
          c.globalAlpha = out * appear * (0.32 + 0.0);
          c.fillStyle = rgba('bone');
          c.fillText(g.ch, -g.w / 2, 0);
          if (sungG > 0) {
            c.globalAlpha = out * appear * sungG;
            const settle = smoothstep(w.end, w.end + 0.35, t);
            c.fillStyle = settle > 0.5 ? rgba('bone') : rgba('signal');
            c.fillText(g.ch, -g.w / 2, 0);
          }
          c.restore();
        });
        x += lay.width + gap;
        void wi;
      });
      // the ellipsis
      const lastW = ln.words[ln.words.length - 1];
      const ell = prog(t, lastW.end - 0.1, lastW.end + 0.3);
      if (ell > 0) {
        c.font = font(F.archivo(100, 800), base);
        const cx = x - gap + 12, y0 = stringY(cx, tau, kickB) - 18;
        c.globalAlpha = out * ell; c.fillStyle = rgba('bone');
        c.fillText('…', cx, y0);
      }
    }
    c.restore();
  }

  private drawReadouts(c: CanvasRenderingContext2D, t: number, tau: number, u: number) {
    c.save();
    const a = ease.outCubic(prog(t, T0 + 0.4, T0 + 1.0)) * (t >= T_SNAP ? Math.exp(-(t - T_SNAP) * 9) : 1);
    c.globalAlpha = a;
    // TPP flickers toward infinity
    let v = 19200 * Math.pow(10, 3.2 * Math.pow(u, 1.6));
    const flick = u > 0.7 ? hash(frameIdx(t), 31) : 0;
    if (flick > 0.55 + (1 - u) * 1.2) v = Infinity;
    if (u >= 0.999) v = Infinity;
    drawTPP(c, 120, 850, v, { scale: 1.9, width: 480 });
    // tension and the 9:8 step
    const stepK = t >= T_V ? 1 : 0;
    const ratio = 1 + 0.9 * Math.pow(u, 1.5) * 0.0 + 0;
    void ratio;
    c.font = font(F.mono(500), 14); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.55); c.textBaseline = 'alphabetic';
    c.textAlign = 'right';
    const f1 = F0 * (1 + 0.9 * Math.pow(u, 1.5)) * (stepK ? 1.125 : 1);
    c.fillText(`TENSION ×${(f1 / F0 * f1 / F0).toFixed(2)}   f₁ = ${f1.toFixed(2)} Hz`, XR, 836);
    c.fillStyle = stepK ? rgba('signal', 0.95) : rgba('bone', 0.4);
    c.fillText(stepK ? 'iv → V  ·  9 : 8  (+204 cents)' : 'iv  ·  held', XR, 866);
    c.restore();
  }
}
