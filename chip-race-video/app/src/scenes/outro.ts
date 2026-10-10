// outro (bar 70 to the end, 131.25-142.25 s): the lot traveller on bone paper. Whispered "Every wafer is a weapon now /
// Export restricted": it fills its last fields in mono, the EXPORT RESTRICTED stamp slams on the final hit, then the
// camera pulls back and dives into the specimen box, into the one grain of sand the film began with, and fades to black.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene } from './_motifs';
import { CARD, drawDoc, drawGrain, G, STATUS, STATUS_C, type DocTimes } from './outro-doc';
import type { Word } from '../engine/lyrics';

const T0 = 131.25, T_NOW = 133.12, T_STAMP = 138.75, T_PULL = 139.55, T_DIVE = 140.25, T_DIVE_END = 141.75, T_FADE = 141.85, END = 142.25;
const W = 1920, H = 1080;
const INK = (a: number) => `rgba(10,10,11,${a})`;
const typedN = (s: string, t: number, t0: number, cps = 38) => { const n = Math.floor((t - t0) * cps); return n <= 0 ? '' : s.slice(0, n); };

export default class Outro extends Scene {
  text = new Layer2D();
  w1: Word[] = [];
  w2: Word[] = [];
  T!: DocTimes;
  stampCv: HTMLCanvasElement | null = null;

  override init() {
    this.w1 = lineByScene(this.ctx.lyrics, 'outro1').words;
    this.w2 = lineByScene(this.ctx.lyrics, 'outro2').words;
    // the card is already filled when the plate opens (its frame and headers typed in before T0); the routing ticks run on
    this.T = { start: T0 - 1.3, stamp: T_STAMP, whisper: [], lyric: [], nowT: T_NOW };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    clearRT(renderer, out, LIN.ink);
    const c = this.text.ctx;
    this.text.clear();

    // ---- camera: slow push, pull-back, then the dive into the grain
    const k1 = ease.inOutCubic(prog(t, T_PULL, T_DIVE));
    const k2 = ease.inOutCubic(prog(t, T_DIVE, T_DIVE_END));
    const slam = Math.exp(-Math.max(0, t - T0) / 0.09);
    const hit = pulse(t, T_STAMP, 0.09);
    let s = lerp(1 + 0.035 * prog(t, T0, T_PULL), 0.8, k1);
    s *= Math.pow(8.2 / 0.8, k2);
    s *= 1 + 0.1 * slam - 0.012 * hit + 0.004 * kick;
    const px = lerp(960, G.x, ease.inOutCubic(prog(t, T_DIVE, T_DIVE_END - 0.1))), py = lerp(540, G.y, ease.inOutCubic(prog(t, T_DIVE, T_DIVE_END - 0.1)));
    const rot = -0.04 * k1 * (1 - k2) + 0.004 * Math.sin(t * 0.9) * (1 - k1);
    const paper = 1 - smoothstep(139.9, 140.9, t);

    c.save();
    c.translate(W / 2, H / 2); c.rotate(rot); c.scale(s, s); c.translate(-px, -py);
    if (paper > 0.001) {
      c.save(); c.globalAlpha = paper;
      // the paper: bone, with a soft darker fold toward the edges
      const bg = c.createRadialGradient(960, 520, 120, 960, 540, 900);
      bg.addColorStop(0, '#EFEADF'); bg.addColorStop(1, '#D9D3C5');
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40;
      c.fillStyle = bg; c.fillRect(CARD.x0, CARD.y0, CARD.x1 - CARD.x0, CARD.y1 - CARD.y0);
      c.shadowBlur = 0;
      drawDoc(c, t, this.T, 0);
      this.fields(c, t);
      this.whisper(c, t);
      this.stamp(c, t);
      c.restore();
    }
    // the grain: sits in the specimen box all along, and is what is left at the end
    const spin = 0.02 * Math.sin(t * 0.8) + 0.5 * k2;
    drawGrain(c, G.x, G.y, 26, spin);
    c.restore();

    comp.draw(renderer, this.text.upload(), out);
    const sh = 22 * hit;
    return {
      paper: paper > 0.5 ? 1 : 0, bloom: 0.35 + 0.3 * k2, bloomThreshold: 0.85, vignette: 0.5, halation: 0.05,
      shake: [Math.sin(t * 210) * sh, Math.cos(t * 190) * sh] as [number, number],
      zoom: 1 + 0.025 * hit, ca: 0.6 + 4 * hit + 1.5 * k2, flash: 0.07 * hit,
      fade: ease.inQuad(prog(t, T_FADE, END)),
    };
  }

  /** the export-red stamp (own image so the full text fits), slammed on the final hit */
  private stamp(c: CanvasRenderingContext2D, t: number) {
    if (t < T_STAMP - 0.003) return;
    if (!this.stampCv) {
      const SW = 760, SH = 200, cv = document.createElement('canvas');
      cv.width = SW * 2; cv.height = SH * 2;
      const g = cv.getContext('2d')!;
      g.scale(2, 2); g.fillStyle = '#E0312B'; g.strokeStyle = '#E0312B';
      g.lineWidth = 8; g.strokeRect(6, 6, SW - 12, SH - 12); g.lineWidth = 2.5; g.strokeRect(22, 22, SW - 44, SH - 44);
      g.textBaseline = 'alphabetic'; g.textAlign = 'center';
      g.font = font(F.archivo(125, 900), 64); g.letterSpacing = '1px';
      const mw = g.measureText('EXPORT RESTRICTED').width;
      g.font = font(F.archivo(125, 900), Math.floor(64 * Math.min(1, (SW - 90) / mw)));
      g.fillText('EXPORT RESTRICTED', SW / 2, 106);
      g.font = font(F.mono(700), 32); g.letterSpacing = '5px';
      g.fillText('ECCN 3A090', SW / 2, 156);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 1400; i++) { g.globalAlpha = 0.25 + hash(i, 1) * 0.6; g.beginPath(); g.arc(hash(i, 2) * SW, hash(i, 3) * SH, 0.4 + hash(i, 4) * hash(i, 5) * 2.2, 0, 6.3); g.fill(); }
      this.stampCv = cv;
    }
    const age = t - T_STAMP;
    const k = ease.inExpo(clamp(1 - age / 0.075));
    const sc = 1 + 0.9 * k - 0.025 * pulse(t, T_STAMP + 0.075, 0.07);
    c.save();
    c.translate(STATUS_C.x + 4, STATUS_C.y + 8); c.rotate((-3.4 * Math.PI) / 180 + 0.06 * k); c.scale(sc, sc);
    c.globalAlpha = smoothstep(T_STAMP - 0.003, T_STAMP + 0.03, t);
    c.shadowColor = 'rgba(224,49,43,0.55)'; c.shadowBlur = 10 + 30 * k;
    c.drawImage(this.stampCv, -380, -100, 760, 200);
    c.restore();
  }

  /** the last mono fields of the traveller, typed in under REMARKS and on the signature line */
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
    const l3 = 'VALID: ALL WAFERS · ALL DESTINATIONS', a3 = typedN(l3, t, 134.1, 34);
    mono(a3, 280, 888, 15, 0.6, 500);
    const sg = typedN('M. OKAFOR · 3A090', t, 133.7, 22);
    mono(sg, 740, 934, 20, 0.85, 500);
    // a stamped serial that counts on, a tick per beat
    mono(`SERIAL 7A-0042-${String(Math.floor((t - T0) * 8) + 1).padStart(4, '0')}`, 1356, 958, 12, 0.5, 500);
  }

  /** the whisper, Cormorant italic, written into the status box word by word (two lines, fitted to the box) */
  private whisper(c: CanvasRenderingContext2D, t: number) {
    const lines: [Word[], number][] = [[this.w1, STATUS.y + 58], [this.w2, STATUS.y + 118]];
    c.save();
    c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.letterSpacing = '0px';
    for (const [words, y] of lines) {
      let size = 54;
      c.font = font(F.serif(600, true), size);
      const full = words.map((w) => w.w).join(' ');
      const tw = c.measureText(full).width;
      if (tw > STATUS.w - 50) { size = Math.floor((size * (STATUS.w - 50)) / tw); c.font = font(F.serif(600, true), size); }
      let wx = STATUS.x + 26;
      for (const w of words) {
        const wd = c.measureText(w.w + ' ').width;
        const p = prog(t, w.start, w.start + (w.end - w.start) * 0.9);
        if (p > 0) {
          c.save(); c.beginPath(); c.rect(wx - 6, STATUS.y, wd * p + 12, STATUS.h); c.clip();
          c.fillStyle = INK(0.9); c.fillText(w.w, wx, y);
          c.restore();
        }
        wx += wd;
      }
    }
    c.restore();
    void rgba; void clamp;
  }
}
