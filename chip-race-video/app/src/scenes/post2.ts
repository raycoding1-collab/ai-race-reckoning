// post2 (chorus 2 chant, "weapon now, oh oh oh" x2): a STADIUM LED BOARD. 96x54 round LEDs with lens highlights and
// bloom. The dashboard from down2 arrives as LED dots, a scan bar sweeps down and replaces it with the board's
// content: a TPP score ticker scrolling along the top, WEAPON / NOW in a 5x7 pixel face, three big "O" lamps that
// flash with shock rings on each oh, a pixel crowd doing the wave and confetti. At the end the board powers down
// LED by LED, leaving a sparse lattice of lit LEDs: atoms (handoff to atom).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { TPP, lineByScene, formatTPP } from './_motifs';
import { clamp, ease, hash, prog, pulse, TAU, frameIdx } from '../engine/util';
import { drawDash } from './down2-dash';
import { LedWall, GW, GH, textWidth } from './post2-led';
import { shakeVec, pulses } from './node2-kit';
import type { Word } from '../engine/lyrics';

type RGB = [number, number, number];
const AMB: RGB = [1.0, 0.37, 0.011], EMB: RGB = [1.0, 0.64, 0.19], HOT: RGB = [1.7, 1.45, 1.1], BON: RGB = [0.85, 0.81, 0.74];
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export const T0 = 86.25;
export const T1 = 93.75;
const KILL0 = 93.0;
/** survivors lattice for the atom handoff: cell (6+12a, 4+9b) -> px centre (130+240a, 90+180b) */
const isSurvivor = (i: number, j: number) => i % 12 === 6 && j % 9 === 4;

export default class Post2 extends Scene {
  wall = new LedWall();
  text = new Layer2D();
  lines: Word[][] = [];
  dashWords: Word[] = [];
  tpp!: TPP;
  kicks: number[] = [];

  override init() {
    const L = this.ctx.lyrics.lines.filter((l: any) => l.scene === 'post2');
    this.lines = L.map((l) => l.words);
    this.dashWords = lineByScene(this.ctx.lyrics, 'down2').words;
    this.tpp = new TPP(this.ctx.lyrics);
    this.kicks = this.ctx.audio.events('kick', T0, T1).map((e) => e[0]);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out, LIN.ink);
    const kick = pulses(this.kicks, t, 0.1);
    // handoff: for the first scan the LED wall shows down2's last frame through the same LED shader
    const scan = prog(t, T0 + 0.02, T0 + 0.42, ease.inQuad) * (GH + 4);
    if (t < T0 + 0.5) {
      this.text.clear();
      drawDash(this.text.ctx, 86.2499, { words: this.dashWords, tpp: this.tpp.value(86.2), kick: 0 });
    }
    this.drawBoard(t, kick);
    this.wall.upload();
    this.wall.render(renderer, out, t < T0 + 0.5 ? this.text.upload() : null, 1, 1, t, t < T0 + 0.5 ? scan : 999);
    void comp;
    const imp = pulse(t, 91.875, 0.1);
    const [sx, sy] = shakeVec(t, 6 * kick + 18 * imp, 7);
    return {
      bloom: 0.95, bloomThreshold: 0.78, bloomRadius: 0.8, halation: 0.3, zoom: 1 + 0.012 * kick + 0.04 * imp, shake: [sx, sy] as [number, number],
      ca: 0.7 + 2.5 * imp, flash: 0.1 * imp + 0.1 * pulse(t, T0, 0.05), vignette: 0.4,
    };
  }

  // ---------------------------------------------------------------------------------------------
  drawBoard(t: number, kick: number) {
    const w = this.wall;
    w.clear();
    const gain = (0.85 + 0.3 * kick) * (1 - 0.5 * prog(t, 92.7, KILL0 + 0.1));
    // marquee border: chasing lights around the perimeter
    const per = 2 * (GW + GH) - 4;
    for (let n = 0; n < per; n++) {
      let x = 0, y = 0;
      if (n < GW) { x = n; y = 0; } else if (n < GW + GH - 1) { x = GW - 1; y = n - GW + 1; } else if (n < 2 * GW + GH - 2) { x = GW - 1 - (n - (GW + GH - 2)); y = GH - 1; } else { x = 0; y = GH - 1 - (n - (2 * GW + GH - 3)); }
      const ph = ((n - t * 38) % 6 + 6) % 6;
      if (ph < 1.2) w.put(x, y, AMB[0], AMB[1], AMB[2], 0.9 * gain); else w.put(x, y, 0.1, 0.04, 0.004, 1);
    }
    // ticker strip (rows 2..8), score-ticker style
    const segs: { s: string; c: RGB }[] = [
      { s: 'TPP ', c: sc(BON, 0.7) }, { s: formatTPP(this.tpp.value(t)), c: EMB }, { s: '  >  ', c: sc(AMB, 0.8) },
      { s: 'ECCN 3A090', c: sc(BON, 0.7) }, { s: '  >  ', c: sc(AMB, 0.8) }, { s: 'LOT 7A-0042', c: sc(BON, 0.7) }, { s: '  >  ', c: sc(AMB, 0.8) },
      { s: 'WEAPON NOW', c: HOT }, { s: '  >  ', c: sc(AMB, 0.8) },
    ];
    const total = segs.reduce((a, s) => a + s.s.length * 6, 0);
    const off = (t * 24) % total;
    for (let rep = -1; rep <= 1; rep++) {
      let x = 3 - off + rep * total;
      for (const sg of segs) { x = w.text(sg.s, Math.round(x), 2, 1, sg.c, gain, 1, 2, GW - 2) + 1; }
    }
    for (let x = 2; x < GW - 2; x++) w.put(x, 10, 0.18, 0.07, 0.01, 1);
    // chant cycles
    for (let ci = 0; ci < this.lines.length; ci++) this.drawCycle(t, this.lines[ci]!, gain, ci);
    // crowd (rows 45..53) and confetti
    this.drawCrowd(t, gain, kick);
    // dashboard handoff: before the scan reaches a row, the shader shows the canvas; nothing more to do here
    // power down
    if (t > KILL0 - 0.35) {
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const surv = isSurvivor(i, j);
        const kt = KILL0 + hash(i, j, 3) * (T1 - 0.15 - KILL0);
        if (surv) {
          const k = prog(t, KILL0 + 0.15, T1 - 0.2);
          w.set(i, j, AMB[0] * (0.9 + 0.2 * Math.sin(t * 5 + i)) * (0.6 + 0.8 * k), AMB[1] * (0.6 + 0.8 * k), AMB[2]);
          // set() above wrote r,g,b; recolour (alpha is already 1)
          const o = (j * GW + i) * 4; w.data[o] = AMB[0] * (0.7 + 0.5 * k); w.data[o + 1] = AMB[1] * (0.7 + 0.5 * k); w.data[o + 2] = AMB[2] * (0.7 + 0.5 * k); w.data[o + 3] = 1;
        } else if (t >= kt) {
          w.set(i, j, 0, 0, 0);
        } else if (t > kt - 0.07 && hash(frameIdx(t), i, j) > 0.5) {
          w.set(i, j, 0, 0, 0);
        }
      }
    }
  }

  drawCycle(t: number, words: Word[], gain: number, ci: number) {
    const w = this.wall;
    const [weapon, now, oh1, oh2, oh3] = words as [Word, Word, Word, Word, Word];
    const cs = weapon.start;
    const pB = oh1.start - 0.05;
    const end = ci === 0 ? this.lines[1]![0]!.start - 0.001 : T1;
    if (t < cs - 0.3 || t >= end + 0.0) {
      // between the two cycles keep a dim ghost of the last content
    }
    // visibility window of this cycle's content
    if (t < cs - 0.02 || t >= end) return;
    const wipeX = clamp((t - pB) / 0.16) * GW;
    // ---- A: WEAPON / NOW (before the ohs)
    const dim: RGB = [0.07, 0.03, 0.004];
    const drawWord = (word: Word, txt: string, x: number, y: number, scl: number) => {
      const p = clamp((t - word.start) / Math.max(0.05, word.end - word.start));
      const since = t - word.start;
      w.text(txt, x, y, scl, dim, 1, 1, 0, GW);
      if (since > -0.02) {
        const heat = clamp(1 - since / 0.25);
        const col = mixc(AMB, HOT, heat * heat);
        w.text(txt, x, y, scl, sc(col, 1.25 * gain), 1, Math.min(1, ease.outQuad(p) + 0.08), 0, GW);
      }
    };
    if (wipeX < GW) {
      // text A is clipped to the part not yet wiped away (x >= wipeX): clip by drawing then erasing
      drawWord(weapon, 'WEAPON', Math.round((GW - textWidth('WEAPON', 2)) / 2), 12, 2);
      drawWord(now, 'NOW', Math.round((GW - textWidth('NOW', 3)) / 2), 25, 3);
      // erase the wiped columns
      for (let x = 0; x < wipeX; x++) for (let y = 11; y < 46; y++) w.set(x, y, 0, 0, 0);
      // the wipe bar
      if (wipeX > 0) for (let y = 11; y < 46; y++) w.put(Math.floor(wipeX), y, HOT[0], HOT[1], HOT[2], 1);
    }
    // ---- B: three O lamps with shock rings
    if (wipeX > 0) {
      const ohs = [oh1, oh2, oh3];
      const xs = [20, 48, 76];
      const cy = 28;
      for (let n = 0; n < 3; n++) {
        const cx = xs[n]!;
        const o = ohs[n]!;
        const since = t - o.start;
        const lit = since >= -0.02;
        const heat = lit ? clamp(1 - since / 0.3) : 0;
        const R = 11;
        for (let y = cy - 14; y <= cy + 14; y++) for (let x = cx - 14; x <= cx + 14; x++) {
          if (x >= wipeX) continue;
          const d = Math.hypot(x - cx + 0.0, (y - cy) * 1.0);
          const ring = Math.abs(d - R) < 1.35;
          if (ring) {
            const k = lit ? 1.25 * gain : 0.5;
            const c2 = lit ? mixc(AMB, HOT, heat * heat) : dim;
            w.put(x, y, c2[0], c2[1], c2[2], k);
          } else if (lit && d < R - 2.2) {
            const pat = ((x + y) & 1) === 0 ? 0.5 : 0.28;
            const sparkle = hash(frameIdx(t) * 0.2, x, y) > 0.93 ? 1.0 : 0;
            w.put(x, y, AMB[0], AMB[1], AMB[2], (pat * (0.7 + 0.5 * heat) + sparkle * 0.6) * gain);
          }
        }
        if (lit) {
          // shock rings expanding from the lamp
          for (let s = 0; s < 3; s++) {
            const ts = since - s * 0.09;
            if (ts < 0 || ts > 0.7) continue;
            const rr = R + 2 + ts * 34;
            const kk = (1 - ts / 0.7);
            for (let a = 0; a < 90; a++) {
              const ang = (a / 90) * TAU;
              const x = Math.round(cx + Math.cos(ang) * rr), y = Math.round(cy + Math.sin(ang) * rr * 0.9);
              if (x >= wipeX) continue;
              w.put(x, y, AMB[0], AMB[1], AMB[2], 0.9 * kk * gain);
            }
          }
        }
      }
      // sustained last oh: the wave of light across the lamps on each beat
      if (t > oh3.start) {
        const wv = ((t - oh3.start) * 40) % (GW + 30) - 15;
        for (let y = 12; y < 44; y++) for (let x = Math.floor(wv) - 2; x <= Math.floor(wv) + 2; x++) if (x < wipeX) w.put(x, y, 0.5, 0.2, 0.02, 0.5 * gain);
      }
      // OH! caption in pixels beneath
      const cap = t >= oh3.start ? 'OH OH OH' : t >= oh2.start ? 'OH OH' : 'OH';
      w.text(cap, Math.round((GW - textWidth(cap, 1)) / 2), 41, 1, sc(EMB, 0.8 * gain), 1, 1, 0, Math.floor(wipeX));
    }
  }

  drawCrowd(t: number, gain: number, kick: number) {
    const w = this.wall;
    const cheer = Math.max(
      pulses(this.lines.flatMap((l) => l.map((x) => x.start)), t, 0.35),
      (this.lines.some((l) => t > l[4]!.start && t < l[4]!.end) ? 1 : 0) * 0.8,
    );
    // confetti: cells falling from above on each chant word
    const starts = this.lines.flatMap((l) => l.map((x) => x.start)).filter((s) => s <= t && t - s < 1.6);
    for (const s of starts) {
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash(s, i, 1) * GW);
        const y0 = 11 + hash(s, i, 2) * 4, vy = 12 + hash(s, i, 3) * 14;
        const y = Math.floor(y0 + (t - s) * vy);
        if (y < 11 || y > 52) continue;
        const c = hash(s, i, 4) > 0.5 ? AMB : HOT;
        w.put(x, y, c[0], c[1], c[2], 0.9 * gain);
      }
    }
    for (let p = 0; p < 19; p++) {
      const x = p * 5 + 1;
      const wave = 0.5 + 0.5 * Math.sin(t * 9 - p * 0.55);
      const up = clamp(0.15 + cheer * (0.35 + 0.65 * wave) + 0.5 * kick);
      const bob = Math.round(up * 2);
      const baseY = 52;
      const head = (1 - 0.0) * 1;
      // body (3x3) and head (2x2)
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) w.put(x + dx, baseY - 2 + dy - 0, 0.2, 0.08, 0.008, 1);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) w.put(x + dx + (dx === 0 ? 0 : 0), baseY - 4 - bob + dy, 0.55, 0.25, 0.03, 1);
      // arms: raised cells
      const armH = Math.round(up * 4);
      for (let h = 0; h < armH; h++) {
        const c = h === armH - 1 ? sc(EMB, gain) : sc(AMB, 0.8 * gain);
        w.put(x - 1, baseY - 3 - h - 0, c[0], c[1], c[2], 1);
        w.put(x + 3, baseY - 3 - h - 0, c[0], c[1], c[2], 1);
      }
      void head;
    }
  }
}
