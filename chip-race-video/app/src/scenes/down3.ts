// down3 (chorus 3, "Nobody's slowing the silicon down"): EVERYTHING GOES VERTICAL. A wall of instruments (log charts,
// dials, bar stacks, sparklines) all climbing at once; on "down" every one of them launches straight up out of frame
// on speed lines, DOWN flips 180 degrees, and the camera tilts up after them into black.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { lineByScene } from './_motifs';
import { ease, hash, lerp, prog, pulse, clamp, frameIdx } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, karaokeWord, drawDial, shakeVec } from './node2-kit';
import { drawMiniChart } from './down1';
import type { Word } from '../engine/lyrics';

const T0 = 127.5, T_DOWN = 129.84, T_END = 131.25;
const COLS = 7, ROWS = 3, CW = 240, CHH = 214, GX = 20, X0 = 60, Y0 = 262, GY = 24;

export default class Down3 extends Scene {
  text = new Layer2D();
  words: Word[] = [];

  override init() { this.words = lineByScene(this.ctx.lyrics, 'down3').words; }

  panel(c: CanvasRenderingContext2D, kind: number, i: number, w: number, h: number, t: number) {
    const climb = prog(t, T0, T_DOWN, ease.inQuad);
    const grow = 0.15 + 0.85 * climb;
    c.save();
    c.beginPath(); c.rect(0, 0, w, h); c.clip();
    if (kind === 0) {
      drawMiniChart(c, 0, 0, w, h, 0.25 + 0.75 * prog(t, T0 + 0.1, T_DOWN - 0.1, ease.linear) + 0 * i, t);
    } else if (kind === 1) {
      c.fillStyle = C.ink2; c.fillRect(0, 0, w, h);
      drawDial(c, w / 2, h / 2 + 8, 78, { frac: clamp(0.2 + 0.78 * climb + 0.02 * Math.sin(t * 30 + i), 0, 1.04), labelsA: ['0', '', '', '', ''], titleA: ['TPP', 'GW', 'HBM', 'FAB'][i % 4]!, redFrom: 0.75, shakeDeg: 1 + 3 * climb, t, minor: 2 });
    } else if (kind === 2) {
      c.fillStyle = C.ink2; c.fillRect(0, 0, w, h);
      const n = 12;
      for (let b = 0; b < n; b++) {
        const base = 0.1 + 0.25 * hash(i, b, 1);
        const v = clamp(base + (0.1 + 0.9 * hash(i, b, 2)) * climb * (0.4 + b / n * 0.7));
        const bh = (h - 40) * v;
        c.fillStyle = v > 0.8 ? C.signal : rgbaS(C.bone, 0.85);
        c.fillRect(14 + b * ((w - 28) / n), h - 16 - bh, (w - 28) / n - 4, bh);
      }
      c.fillStyle = C.red; c.fillRect(10, h * 0.28, w - 20, 2);
    } else {
      c.fillStyle = C.bone; c.fillRect(0, 0, w, h);
      c.strokeStyle = C.ink; c.lineWidth = 5; c.lineJoin = 'round';
      c.beginPath();
      const k = 2 + 5 * grow;
      for (let s = 0; s <= 40; s++) {
        const u = s / 40, y = h - 14 - (h - 28) * (Math.exp(k * u) - 1) / (Math.exp(k) - 1) * (0.55 + 0.45 * grow);
        if (s === 0) c.moveTo(12, y); else c.lineTo(12 + (w - 24) * u, y);
      }
      c.stroke();
      c.fillStyle = C.signal; c.beginPath(); c.arc(w - 12, 14 + (h - 28) * (1 - grow) * 0.2, 9, 0, 7); c.fill();
      c.font = font(F.mono(700), 20); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText('x' + (10 + Math.round(990 * grow * grow)), 12, 10);
    }
    c.restore();
    c.strokeStyle = rgbaS(C.bone, 0.9); c.lineWidth = 3; c.strokeRect(0, 0, w, h);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out, LIN.ink);
    this.text.clear();
    const c = this.text.ctx;
    c.fillStyle = C.ink; c.fillRect(0, 0, 1920, 1080);
    const launch = (i: number) => T_DOWN + 0.02 + 0.45 * hash(i, 40);
    // camera tilts up: world slides down the frame, then everything is gone
    const tilt = ease.inCubic(prog(t, T_DOWN, T_END));
    c.save();
    c.translate(0, 1400 * tilt);
    // panels
    for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
      const i = col * ROWS + row;
      const pin = ease.outBack(prog(t, T0 + 0.03 * i, T0 + 0.03 * i + 0.3));
      if (pin <= 0) continue;
      const x = X0 + col * (CW + GX), y = Y0 + row * (CHH + GY);
      const dt = Math.max(0, t - launch(i));
      const lift = dt > 0 ? 1800 * dt * dt + 600 * dt : 0;
      const pre = prog(t, T0, T_DOWN, ease.inQuad);
      const jx = (hash(frameIdx(t), i, 1) - 0.5) * 2 * (0.6 + 6 * pre) * (dt > 0 ? 0.3 : 1);
      const jy = (hash(frameIdx(t), i, 2) - 0.5) * 2 * (0.6 + 6 * pre) * (dt > 0 ? 0.3 : 1) - 14 * pre * pre;
      c.save();
      c.translate(x + CW / 2 + jx, y + CHH / 2 + jy - lift);
      const sk = 1 + 0.4 * ease.inQuad(clamp(dt * 3)); // stretch as it accelerates
      c.scale(pin * (1 - 0.15 * clamp(dt * 3)), pin * sk);
      c.translate(-CW / 2, -CHH / 2);
      this.panel(c, (col + row * 2) % 4, i, CW, CHH, t);
      c.restore();
      // speed lines trailing the launched panel
      if (dt > 0) {
        for (let s = 0; s < 4; s++) {
          const lx = x + 12 + (CW - 24) * hash(i, s, 50);
          const len = Math.min(1500, lift * 0.9) * (0.5 + 0.5 * hash(i, s, 51));
          const g = c.createLinearGradient(0, y + CHH - lift, 0, y + CHH - lift + len);
          g.addColorStop(0, 'rgba(255,210,122,0.95)'); g.addColorStop(1, 'rgba(255,164,27,0)');
          c.fillStyle = g; c.fillRect(lx, y + CHH - lift, 3 + 3 * hash(i, s, 52), len);
        }
      }
    }
    c.restore();
    // lyric row
    const fam = F.archivo(100, 900), sz = 112;
    const full = this.words.slice(0, 4).map((w) => w.w.toUpperCase()).join('  ');
    const fs = Math.min(sz, fitSize(full, fam, 1740));
    let x = 70;
    c.save();
    c.translate(0, -1000 * ease.inCubic(prog(t, T_DOWN + 0.1, T_END)));
    for (let i = 0; i < 4; i++) x += karaokeWord(c, this.words[i]!, t, x, 170, fam, fs, { dim: rgbaS(C.bone, 0.22), settled: C.bone, slam: 0.07 }) + fs * 0.3;
    c.restore();
    // DOWN, flipping
    const dw = this.words[4]!;
    if (t >= dw.start - 0.02) {
      const dk = prog(t, dw.start, dw.start + 0.5, ease.outBack);
      const dfam = F.archivo(125, 900), dsz = Math.min(540, fitSize('DOWN', dfam, 1560));
      c.save();
      c.translate(960, 600 - 700 * ease.inQuad(prog(t, T_DOWN + 0.7, T_END)));
      const sy = Math.cos(lerp(Math.PI, 0, Math.min(1, dk)));
      const wob = 1 + 0.07 * pulse(t, dw.start + 0.5, 0.08);
      c.scale(wob, wob * (Math.abs(sy) < 0.02 ? 0.02 : sy));
      c.font = font(dfam, dsz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.lineJoin = 'round'; c.lineWidth = 24; c.strokeStyle = C.ink; c.strokeText('DOWN', 0, dsz * 0.35);
      c.fillStyle = dk > 0.5 ? C.signal : C.bone; c.fillText('DOWN', 0, dsz * 0.35);
      c.restore();
    }
    // out into black
    const black = ease.inQuad(prog(t, 130.55, 131.1));
    if (black > 0) { c.fillStyle = `rgba(10,10,11,${black})`; c.fillRect(0, 0, 1920, 1080); }
    // vertical speed streaks across the whole frame after the launch
    const sp = prog(t, T_DOWN + 0.1, 130.9);
    if (sp > 0 && black < 1) {
      for (let s = 0; s < 40; s++) {
        const sx = 1920 * hash(s, 60), len = 300 + 700 * hash(s, 61), yy = 1080 - ((sp * (1400 + 1800 * hash(s, 62)) + 1080 * hash(s, 63)) % (1080 + len));
        c.fillStyle = `rgba(255,${180 + 60 * hash(s, 64) | 0},80,${0.55 * (1 - black)})`;
        c.fillRect(sx, yy, 2 + 2 * hash(s, 65), len);
      }
    }
    const tex = this.text.upload();
    comp.draw(renderer, tex, out);
    const down = pulse(t, T_DOWN, 0.1);
    const [sx, sy] = shakeVec(t, 2 + 6 * ease.inQuad(prog(t, T0, T_DOWN)) + 16 * down + 4 * f.a.kick, 6);
    return {
      bloom: 0.7 + 0.6 * down, bloomThreshold: 0.8, shake: [sx, sy] as [number, number],
      zoom: 1 + 0.012 * f.a.kick + 0.05 * down, ca: 0.6 + 3.5 * down + 2 * tilt, flash: 0.25 * down, vignette: 0.45,
    };
  }
}
