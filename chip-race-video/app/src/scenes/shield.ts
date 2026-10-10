// shield (bars 34-36, "They call it a shield made of sand and light"): the wafer map as heraldry. The bare wafer
// of key's last frame is probed top to bottom; passing dies light up and form a heater SHIELD, the failed dies
// open and sand pours through them; on "light" the beam outlines the shield, and the passing dies become
// lit windows (fab's first frame).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F } from '../engine/type';
import { clamp, ease, hash, prog, pulse, smoothstep, TAU } from '../engine/util';
import { lineByScene, sparkHead2D } from './_motifs';
import { drawRow, mono } from './hbm-kit';
import { dies, drawWaferStatic, inShield, SHIELD, shieldHalfWidth, WAFER } from './shield-grid';
import type { Word } from '../engine/lyrics';

const T0 = 63.75, T_SCAN0 = 63.82, T_SCAN1 = 64.62, T_SHIELD = 64.69, T_SAND = 65.62, T_LIGHT = 66.33, T_LIGHT_END = 67.0, T_WIN = 66.9, END = 67.5;

/** closed outline of the shield as a polyline (top centre, clockwise) */
function outline(): [number, number][] {
  const pts: [number, number][] = [];
  const n = 70;
  pts.push([WAFER.cx, SHIELD.y0]);
  pts.push([WAFER.cx + SHIELD.half, SHIELD.y0]);
  for (let i = 1; i <= n; i++) { const v = i / n; pts.push([WAFER.cx + SHIELD.half * shieldHalfWidth(v), SHIELD.y0 + SHIELD.h * v]); }
  for (let i = n - 1; i >= 1; i--) { const v = i / n; pts.push([WAFER.cx - SHIELD.half * shieldHalfWidth(v), SHIELD.y0 + SHIELD.h * v]); }
  pts.push([WAFER.cx - SHIELD.half, SHIELD.y0]);
  pts.push([WAFER.cx, SHIELD.y0]);
  return pts;
}

export default class Shield extends Scene {
  text = new Layer2D();
  words: Word[] = [];
  outl = outline();
  cum: number[] = [];
  fails = dies().filter((d) => d.fail);

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'shield').words;
    let L = 0;
    this.cum = [0];
    for (let i = 1; i < this.outl.length; i++) { L += Math.hypot(this.outl[i]![0] - this.outl[i - 1]![0], this.outl[i]![1] - this.outl[i - 1]![1]); this.cum.push(L); }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    clearRT(renderer, out, LIN.ink);
    const c = this.text.ctx;
    this.text.clear();

    const win = smoothstep(T_WIN, 1 * 67.3, t); // wafer + failed dies fall away, passing dies become windows
    const lightHit = pulse(t, T_LIGHT, 0.12);
    const shHit = pulse(t, T_SHIELD, 0.14);
    const scale = 1 + 0.07 * prog(t, T0, END, ease.inOutQuad) + 0.012 * kick;

    c.save();
    c.translate(WAFER.cx, WAFER.cy); c.scale(scale, scale); c.translate(-WAFER.cx, -WAFER.cy + 14 * Math.sin(prog(t, T0, END) * Math.PI) * 0);

    // ---- wafer (fades as the shield turns into windows)
    drawWaferStatic(c, 1 - win);

    // ---- probe scan
    const scanY = 130 + 820 * prog(t, T_SCAN0, T_SCAN1);
    const D = dies();
    let nPass = 0, nFail = 0;
    for (const d of D) {
      const tS = T_SCAN0 + ((d.y - 130) / 820) * (T_SCAN1 - T_SCAN0);
      const age = t - tS;
      if (age < 0) continue;
      const x = d.x - WAFER.dx / 2 + 1.5, y = d.y - WAFER.dy / 2 + 1.5, w = WAFER.dx - 3, h = WAFER.dy - 3;
      if (!d.fail) {
        nPass++;
        const flash = Math.exp(-age / 0.22);
        const afterShield = pulse(t, T_SHIELD + (d.y - 232) / 4000, 0.16);
        const settle = 0.34 + 0.12 * kick + 0.5 * afterShield + 0.15 * lightHit;
        const a = Math.min(1, settle + 0.6 * flash);
        c.fillStyle = d.cross ? rgba('bone', Math.min(1, 0.55 * (a + 0.2))) : rgba(flash > 0.4 ? 'ember' : 'signal', a);
        if (win > 0) c.fillStyle = d.cross ? rgba('bone', 0.9) : rgba('#FFC24A', 0.88 + 0.12 * win);
        c.fillRect(x, y, w, h);
        if (win > 0.01) { c.fillStyle = `rgba(10,10,11,${0.55 * win})`; c.fillRect(x + w / 2 - 1, y, 2, h); c.fillRect(x, y + h / 2 - 1, w, 2); }
      } else {
        nFail++;
        const fl = Math.exp(-age / 0.18);
        const open = smoothstep(T_SHIELD, T_SHIELD + 0.5, t - hash(d.i, d.j) * 0.35);
        c.fillStyle = rgba('red', (0.8 * fl + 0.12) * (1 - win));
        c.fillRect(x, y, w, h);
        if (open > 0) { c.fillStyle = `rgba(10,10,11,${0.92 * open * (1 - win)})`; c.fillRect(x + 2, y + 2, w - 4, h - 4); }
        else if (age > 0.1) {
          c.strokeStyle = rgba('red', 0.5 * (1 - win)); c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(x + 8, y + 10); c.lineTo(x + w - 8, y + h - 10); c.moveTo(x + w - 8, y + 10); c.lineTo(x + 8, y + h - 10); c.stroke();
        }
      }
    }
    // scan bar
    if (t > T_SCAN0 - 0.05 && t < T_SCAN1 + 0.12) {
      const half = Math.sqrt(Math.max(0, WAFER.R * WAFER.R - (scanY - WAFER.cy) ** 2)) + 40;
      const g = c.createLinearGradient(0, scanY - 40, 0, scanY + 3);
      g.addColorStop(0, 'rgba(255,164,27,0)'); g.addColorStop(1, 'rgba(255,164,27,0.35)');
      c.fillStyle = g; c.fillRect(WAFER.cx - half, scanY - 40, half * 2, 43);
      c.fillStyle = rgba('ember', 1); c.fillRect(WAFER.cx - half, scanY - 1.5, half * 2, 3);
    }

    // ---- sand through the failed dies
    if (t > T_SHIELD + 0.15 && t < END) {
      const rate = 0.25 + 0.75 * smoothstep(T_SHIELD, T_SAND, t) + 0.0;
      const N = 760;
      const fade = 1 - smoothstep(T_WIN, END - 0.05, t) * 0;
      for (let g = 0; g < N; g++) {
        const gate = hash(g, 7);
        if (gate > rate * (1 + 0.9 * smoothstep(T_SAND - 0.05, T_SAND + 0.2, t))) continue;
        const d = this.fails[Math.floor(hash(g, 1) * this.fails.length)]!;
        const P = 0.9 + hash(g, 2) * 0.7;
        const a = (((t - T_SHIELD) * (1 + 0.5 * hash(g, 3)) + hash(g, 4) * P) % P);
        const vy = 70 + 1000 * a;
        const y = d.y + 70 * a + 500 * a * a;
        const x = d.x + (hash(g, 5) - 0.5) * 22 + Math.sin(a * 9 + g) * 3;
        const al = Math.min(1, a * 12) * (1 - a / P) * fade * (1 - 0.6 * win);
        c.strokeStyle = rgba(hash(g, 6) > 0.7 ? 'ember' : 'bone', 0.75 * al); c.lineWidth = 1.6 + hash(g, 8) * 1.4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - Math.min(40, vy * 0.035)); c.stroke();
      }
    }

    // ---- shield outline hairline, and the beam on "light"
    const total = this.cum[this.cum.length - 1]!;
    const p = ease.inOutQuad(prog(t, T_LIGHT, T_LIGHT_END));
    const s = p * total;
    if (t > T_SHIELD) {
      c.strokeStyle = rgba('signal', 0.28 + 0.4 * shHit); c.lineWidth = 1.5;
      this.stroke(c, total);
    }
    if (p > 0) {
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = 'rgba(255,164,27,0.9)'; c.shadowBlur = 22;
      c.strokeStyle = rgba('ember', 1); c.lineWidth = 6;
      this.stroke(c, s);
      c.shadowBlur = 0; c.strokeStyle = '#FFF6DC'; c.lineWidth = 2.4;
      this.stroke(c, s);
      c.restore();
      if (p < 1) { const h = this.at(s); sparkHead2D(c, h[0], h[1], t, 1.2); }
    }
    c.restore();

    // ---- lyric: top row and bottom row, so the wafer stays whole
    const o = { size: 80, family: F.archivo(87.5, 900), slam: 0.2, slide: 22 };
    const rowsOn = 1 - smoothstep(END - 0.3, END - 0.05, t);
    c.save(); c.globalAlpha = rowsOn;
    drawRow(c, this.words.slice(0, 5), t, 96, 112, o);
    drawRow(c, this.words.slice(5), t, 96, 1018, o);
    c.restore();

    // ---- sort readouts
    const ra = 1 - win;
    const hudX = 1420;
    c.save(); c.globalAlpha = ra;
    mono(c, 'WAFER SORT · LOT 7A-0042', hudX, 250, 15, rgba('bone', 0.55), 500, 'left', 2);
    mono(c, `BIN 1 PASS ${String(nPass).padStart(3, '0')}`, hudX, 290, 24, rgba('signal', 0.95), 700, 'left', 1);
    mono(c, `BIN 9 FAIL ${String(nFail).padStart(3, '0')}`, hudX, 326, 24, rgba('red', 0.9), 700, 'left', 1);
    const tot = Math.max(1, nPass + nFail);
    mono(c, `YIELD ${(100 * nPass / tot).toFixed(1)}%`, hudX, 372, 20, rgba('bone', 0.7), 500, 'left', 1);
    mono(c, `PROBE Y ${Math.round(scanY)}`, hudX, 408, 14, rgba('bone', 0.4), 500, 'left', 1.5);
    c.restore();

    comp.draw(renderer, this.text.upload(), out);
    const sh = 3 * lightHit + 2 * shHit;
    return {
      bloom: 0.75 + 0.5 * lightHit, bloomThreshold: 0.8, halation: 0.1, vignette: 0.4,
      shake: [Math.sin(t * 180) * sh, Math.cos(t * 160) * sh] as [number, number],
      zoom: 1 + 0.01 * kick + 0.03 * shHit, ca: 0.8 + 2.5 * shHit + 2 * lightHit, flash: 0.15 * shHit + 0.1 * lightHit,
    };
  }

  /** the outline polyline point at arc length s */
  private at(s: number): [number, number] {
    const cum = this.cum, o = this.outl;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const k = clamp((s - cum[i - 1]!) / Math.max(1e-6, cum[i]! - cum[i - 1]!));
    return [o[i - 1]![0] + (o[i]![0] - o[i - 1]![0]) * k, o[i - 1]![1] + (o[i]![1] - o[i - 1]![1]) * k];
  }
  private stroke(c: CanvasRenderingContext2D, s: number) {
    const o = this.outl, cum = this.cum;
    c.beginPath(); c.moveTo(o[0]![0], o[0]![1]);
    for (let i = 1; i < o.length && cum[i - 1]! < s; i++) {
      if (cum[i]! <= s) c.lineTo(o[i]![0], o[i]![1]);
      else { const q = this.at(s); c.lineTo(q[0], q[1]); }
    }
    c.stroke();
  }
}
void TAU; void inShield;
