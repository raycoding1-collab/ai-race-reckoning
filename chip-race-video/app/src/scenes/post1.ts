// post1 (chant "weapon now, oh-oh-oh" x2): an 8-bit CRT. A 320x180 NES-ish game, "FAB RUN": a pixel wafer rolls and
// hops to the beat collecting chips, the chant is bouncing pixel text, the score counter is TPP. Scanlines, rounded glass.
// On the second oh-oh-oh the picture breaks into GAME OVER, glitches into LEVEL 2, and the CRT powers off to a line.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { TPP, linesByScene, formatTPP } from './_motifs';
import { clamp, ease, hash, prog, pulse, lerp, frameIdx } from '../engine/util';
import { G, textWidth } from './post2-led';
import { shakeVec } from './node2-kit';
import type { Word } from '../engine/lyrics';

const T0 = 41.25, T1 = 48.75, P = 0.9375, SPEED = 74, PX = 6;
const T_GLITCH = 46.41, T_OVER = 46.88, T_NOISE = 47.45, T_LVL = 47.6, T_OFF = 48.4;
const GROUND = 150, PX_X = 56;
// NES-ish palette (amber stands in for the NES orange)
const K = { blk: '#000000', wht: '#FCFCFC', gry: '#BCBCBC', dgy: '#545454', amb: '#FFA41B', umb: '#7A3A06', red: '#E0312B', blu: '#3C3CFC', cyn: '#3CBCFC', grn: '#00A800', dbl: '#000058' };

const hop = (t: number) => {
  const u = (((t - T0) % P) + P) % P / P;
  return u < 0.8 ? 30 * Math.sin(Math.PI * u / 0.8) : 0;
};
const CHIP_N = 5;
const chipT = (k: number, j: number) => T0 + k * P + (0.08 + 0.15 * j) * P;

export default class Post1 extends Scene {
  game = new Layer2D();
  text = new Layer2D();
  lines: Word[][] = [];
  tpp!: TPP;

  override init() {
    this.lines = linesByScene(this.ctx.lyrics, 'post1').map((l) => l.words);
    this.tpp = new TPP(this.ctx.lyrics);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out, LIN.ink);
    this.game.clear();
    this.drawGame(this.game.ctx, t, f.a.kick);
    const c = this.text.ctx;
    this.text.clear();
    c.fillStyle = '#000'; c.fillRect(0, 0, 1920, 1080);
    this.composite(c, t);
    const tex = this.text.upload();
    comp.draw(renderer, tex, out);
    const glitch = prog(t, T_GLITCH, T_OVER) * (t < T_LVL ? 1 : 0);
    const off = prog(t, T_OFF, T1);
    const [sx, sy] = shakeVec(t, 1.5 * f.a.kick + 10 * glitch * hash(frameIdx(t), 4), 5);
    return {
      bloom: 0.8 + 0.5 * off, bloomThreshold: 0.72, bloomRadius: 0.7, shake: [sx, sy] as [number, number], zoom: 1 + 0.008 * f.a.kick,
      ca: 0.9 + 4 * glitch, flash: 0.15 * pulse(t, T0, 0.06) + 0.15 * pulse(t, T_LVL, 0.06), vignette: 0.5,
    };
  }

  // ---- game screen at 320x180 virtual pixels (each is PX canvas px) ----------------------------------------
  drawGame(c: CanvasRenderingContext2D, t: number, kick: number) {
    const r = (x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x) * PX, Math.round(y) * PX, Math.round(w) * PX, Math.round(h) * PX); };
    const text = (s: string, x: number, y: number, sc: number, col: string, shadow?: string) => {
      let cx = Math.round(x);
      for (const ch of s) {
        const g = G[ch];
        if (g) for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j]![i] === '#') {
          if (shadow) r(cx + i * sc + sc * 0.5, y + j * sc + sc * 0.5, sc, sc, shadow);
        }
        if (g) for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j]![i] === '#') r(cx + i * sc, y + j * sc, sc, sc, col);
        cx += 6 * sc;
      }
    };
    const tw = (s: string, sc: number) => textWidth(s, sc);
    const sc0 = (t - T0) * SPEED;
    const lvl2 = t >= T_LVL;
    // sky + parallax
    r(0, 0, 320, 180, lvl2 ? K.dbl : K.blk);
    for (let i = 0; i < 28; i++) {
      const x = ((hash(i, 1) * 400 - sc0 * 0.1) % 320 + 320) % 320, y = hash(i, 2) * 90;
      r(x, y, 1, 1, hash(i, 3) > 0.6 ? K.dgy : K.dbl === K.blk ? K.dgy : '#3c3c90');
    }
    // far fab skyline: towers with amber windows
    const sk = sc0 * 0.35;
    for (let i = -1; i < 12; i++) {
      const bw = 34, bx = i * bw - (sk % bw), id = Math.floor((sk + i * bw) / bw);
      const bh = 34 + Math.floor(hash(id, 9) * 40);
      r(bx, GROUND - bh, bw - 4, bh, K.dgy);
      r(bx, GROUND - bh, bw - 4, 2, '#7c7c7c');
      if (hash(id, 11) > 0.5) r(bx + 12, GROUND - bh - 12, 4, 12, K.dgy);
      for (let wy = 0; wy < bh - 8; wy += 8) for (let wx = 4; wx < bw - 8; wx += 8) {
        const on = hash(id, wx, wy) > 0.45;
        r(bx + wx, GROUND - bh + 6 + wy, 3, 3, on ? K.umb : '#202020');
      }
    }
    // ground
    r(0, GROUND, 320, 30, K.umb);
    r(0, GROUND, 320, 4, K.amb);
    const gs = sc0 % 16;
    for (let x = -16; x < 336; x += 16) { r(x - gs, GROUND + 4, 1, 26, K.blk); }
    for (let y = GROUND + 12; y < 180; y += 8) r(0, y, 320, 1, K.blk);
    // chips
    let got = 0;
    const kMax = Math.ceil((t - T0) / P) + 3;
    for (let k = 0; k < kMax; k++) for (let j = 0; j < CHIP_N; j++) {
      const tj = chipT(k, j), x = PX_X + (tj - t) * SPEED;
      if (tj <= t) { got++; const age = t - tj; if (age < 0.3) { for (let s = 0; s < 6; s++) { const a = s / 6 * Math.PI * 2 + hash(k, j, s); r(PX_X + Math.cos(a) * age * 90, GROUND - 22 - hop(tj) + Math.sin(a) * age * 90, 2, 2, s % 2 ? K.wht : K.amb); } } continue; }
      if (x > 330) continue;
      const y = GROUND - 22 - hop(tj) - 4 + Math.round(Math.sin(t * 8 + j));
      this.chip(r, x - 4, y - 4);
    }
    // player: the wafer
    const hy = hop(t), py = GROUND - 7 - hy;
    this.wafer(r, PX_X, py, sc0 * 0.35, t);
    if (hy === 0 && hop(t - 0.03) > 0) for (let s = 0; s < 5; s++) r(PX_X - 6 + s * 3, GROUND - 2 - hash(frameIdx(t), s) * 3, 2, 2, K.gry);
    // HUD
    const score = this.tpp.value(t);
    text('TPP', 10, 8, 2, K.wht);
    text(formatTPP(score).padStart(6, '0'), 10, 24, 2, K.amb);
    const title = 'FAB RUN';
    text(title, 160 - tw(title, 1) / 2, 10, 1, K.wht);
    text('WORLD ' + (lvl2 ? '2-1' : '1-1'), 160 - tw('WORLD 1-1', 1) / 2, 24, 1, K.gry);
    const cs = 'CHIPS ' + String(got).padStart(2, '0');
    text(cs, 310 - tw(cs, 2), 8, 2, K.wht);
    // lyric chant as bouncing pixel text
    const li = t < 44.65 ? 0 : 1;
    const ws = this.lines[li]!;
    const sizes = [4, 4, 5, 5, 5];
    let ox = 0;
    const widths = ws.map((w, i) => tw(w.w.toUpperCase(), sizes[i]!));
    const total = widths.slice(0, 2).reduce((a, b) => a + b + 12, -12);
    const rowA = ws.slice(0, 2), rowB = ws.slice(2);
    const totalB = widths.slice(2).reduce((a, b) => a + b + 14, -14);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]!, sc = sizes[i]!, s = w.w.toUpperCase();
      const first = i < 2;
      if (i === 0) ox = 160 - total / 2; else if (i === 2) ox = 160 - totalB / 2;
      const y0 = first ? 50 : 84;
      const on = t >= w.start;
      const age = t - w.start;
      const bounce = on ? 12 * Math.abs(Math.sin(Math.min(age, 0.5) * 9)) * Math.pow(0.5, age / 0.18) : 0;
      const ridge = on ? 1.5 * Math.sin((t - T0) * 6.5 + i) : 0;
      const sung = on && t < w.end;
      if (on || t > w.start - 0.25) {
        const col = sung ? K.amb : on ? K.wht : K.dgy;
        const dx = first || i === 2 ? 0 : 0;
        text(s, ox + dx, y0 - bounce + ridge, sc, col, K.blk === col ? undefined : sung ? K.umb : K.dgy);
      }
      ox += widths[i]! + (first ? 12 : 14);
    }
    // game over, level 2, glitch
    if (t >= T_OVER && t < T_NOISE) {
      const f2 = frameIdx(t);
      r(0, 0, 320, 180, K.blk);
      const s1 = 'GAME OVER';
      const jit = hash(f2, 7) > 0.8 ? Math.round((hash(f2, 8) - 0.5) * 8) : 0;
      text(s1, 160 - tw(s1, 6) / 2 + jit, 62, 6, hash(f2, 2) > 0.85 ? K.wht : K.red, K.dgy);
      const s2 = 'CONTINUE?  ' + String(9 - Math.min(9, Math.floor((t - T_OVER) / 0.06))).padStart(2, '0');
      text(s2, 160 - tw(s2, 2) / 2, 124, 2, K.wht);
      text('TPP ' + formatTPP(score), 160 - tw('TPP ' + formatTPP(score), 2) / 2, 144, 2, K.amb);
    }
    if (t >= T_NOISE && t < T_LVL) {
      const f2 = frameIdx(t);
      for (let y = 0; y < 180; y += 3) for (let x = 0; x < 320; x += 4) {
        const h = hash(x, y, f2);
        if (h > 0.55) r(x, y, 4, 3, h > 0.9 ? K.wht : h > 0.75 ? K.amb : K.dgy);
      }
    }
    if (lvl2) {
      // cover the running game with the level card for the first moment
      const k = ease.outExpo(prog(t, T_LVL, T_LVL + 0.12));
      const lk = prog(t, T_LVL, T_LVL + 0.5, ease.outBack);
      const hx = hash(frameIdx(t), 3) > 0.9 ? 1 : 0;
      r(0, 0, 320, 180, K.dbl);
      for (let i = 0; i < 12; i++) r(0, i * 16 + ((t * 40) % 16) - 16, 320, 1, '#18188c');
      const s1 = 'LEVEL 2';
      const sz = 7;
      text(s1, 160 - tw(s1, sz) / 2 + hx, 54 + (1 - lk) * 40, sz, K.amb, K.umb);
      const s2 = 'WORLD 2-1  THE FOUNDRY';
      if (t > T_LVL + 0.3) text(s2, 160 - tw(s2, 2) / 2, 128, 2, K.wht);
      const s3 = 'PRESS START';
      if (Math.floor(t * 4) % 2 === 0 && t > T_LVL + 0.4) text(s3, 160 - tw(s3, 2) / 2, 152, 2, K.gry);
      c.globalAlpha = 1 - k; r(0, 0, 320, 180, K.wht); c.globalAlpha = 1;
    }
    void kick; void clamp; void lerp;
  }

  chip(r: (x: number, y: number, w: number, h: number, col: string) => void, x: number, y: number) {
    for (let i = 0; i < 4; i++) { r(x - 1, y + 1 + i * 2, 1, 1, K.amb); r(x + 8, y + 1 + i * 2, 1, 1, K.amb); }
    r(x, y, 8, 8, K.dgy); r(x + 1, y + 1, 6, 6, K.blk); r(x + 2, y + 2, 4, 4, K.wht); r(x + 3, y + 3, 2, 2, K.amb);
    r(x, y, 8, 1, K.gry);
  }

  wafer(r: (x: number, y: number, w: number, h: number, col: string) => void, cx: number, cy: number, spin: number, t: number) {
    const over = t >= T_GLITCH;
    const sh = over ? Math.round((hash(frameIdx(t), 1) - 0.5) * 3) : 0;
    for (let dy = -7; dy <= 6; dy++) {
      const hw = Math.round(Math.sqrt(49 - (dy + 0.5) * (dy + 0.5)));
      for (let dx = -hw; dx < hw; dx++) {
        const gx = Math.floor((dx + spin) / 3), gy = Math.floor(dy / 3);
        const edge = Math.abs(dx) >= hw - 1 || dy === -7 || dy === 6;
        const col = edge ? K.wht : ((gx + gy) & 1) ? K.gry : K.cyn;
        const notch = dy > 4 && Math.abs(dx) < 2;
        r(cx + dx + sh, cy + dy, 1, 1, notch ? K.blk : (dx + spin) % 3 === 0 ? K.dgy : col);
      }
    }
    // eyes, because it is a game character
    r(cx - 3 + sh, cy - 3, 2, 3, K.blk); r(cx + 2 + sh, cy - 3, 2, 3, K.blk);
    if (over) { for (let i = -6; i <= 6; i++) { r(cx + i, cy + i * 0.8, 1, 1, K.red); } }
  }

  // ---- the glass: glitch slices, scanlines, rounded corners, power-off ---------------------------------------
  composite(c: CanvasRenderingContext2D, t: number) {
    const src = this.game.canvas, kf = src.width / 1920;
    const f2 = frameIdx(t);
    const on = ease.outExpo(prog(t, T0, T0 + 0.28));
    const off = ease.inExpo(prog(t, T_OFF, T_OFF + 0.2));
    const visH = lerp(1080, 5, off) * (0.02 + 0.98 * on);
    const visW = off >= 1 ? 1920 : 1920 * (0.004 + 0.996 * on);
    c.save();
    c.beginPath(); c.rect(960 - visW / 2, 540 - visH / 2, visW, visH); c.clip();
    // slices
    const g = prog(t, T_GLITCH, T_OVER, ease.inQuad) * (t < T_NOISE ? 1 : 0) + (t >= T_NOISE && t < T_LVL + 0.2 ? 1 : 0) * 0.8;
    const bands = g > 0 ? 36 : 1;
    const bh = 1080 / bands;
    for (let i = 0; i < bands; i++) {
      let dx = 0;
      if (g > 0 && hash(i, f2) < 0.25 * g + 0.05) dx = (hash(i, f2, 5) - 0.5) * 340 * g;
      c.drawImage(src, 0, i * bh * kf, src.width, bh * kf, dx, i * bh, 1920, bh + 0.5);
      if (g > 0.3 && hash(i, f2, 9) < 0.07 * g) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35; c.drawImage(src, 0, i * bh * kf, src.width, bh * kf, dx + 22, i * bh, 1920, bh + 0.5); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    }
    // a rolling hum bar
    const roll = ((t * 0.25) % 1) * 1300 - 150;
    const grad = c.createLinearGradient(0, roll, 0, roll + 150);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad; c.fillRect(0, roll, 1920, 150);
    // scanlines
    c.fillStyle = 'rgba(0,0,0,0.34)';
    for (let y = 0; y < 1080; y += 6) c.fillRect(0, y + 3, 1920, 2);
    // vignette
    const vg = c.createRadialGradient(960, 540, 420, 960, 540, 1150);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg; c.fillRect(0, 0, 1920, 1080);
    // power-off: white-hot collapse
    if (off > 0) { c.fillStyle = `rgba(255,236,200,${0.9 * off})`; c.fillRect(0, 540 - visH / 2, 1920, visH); }
    c.restore();
    // glass corners (only while the screen is full height)
    if (off < 0.5) {
      c.save();
      c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, 1920, 1080);
      const m = 10, rad = 80;
      c.moveTo(m + rad, m); c.arcTo(1920 - m, m, 1920 - m, 1080 - m, rad); c.arcTo(1920 - m, 1080 - m, m, 1080 - m, rad);
      c.arcTo(m, 1080 - m, m, m, rad); c.arcTo(m, m, 1920 - m, m, rad); c.closePath();
      c.fill('evenodd'); c.restore();
    }
  }
}
