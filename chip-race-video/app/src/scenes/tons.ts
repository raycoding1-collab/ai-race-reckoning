// `tons` (bars 10-12, 18.75-22.5 s): a freight-crane top-down on an engraved container yard, then a split-flap board.
// The machine's bundled cable arrives as the crane hook; 40 containers drop on 16ths and spell 180 t (shake on "tons").
// On "and everybody wants one" it cuts to an airport departures board: every row a destination, ONE · WAITLIST, and
// the last row flips to SOLD OUT. The board's rules (H_TONS_LINE_Y) become the newsprint lines of `line`.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, prog, pulse } from '../engine/util';
import { lineByScene } from './_motifs';
import { BEAT, H_MACHINE_TONS, H_TONS_LINE_Y, karaoke, mono, wordP } from './sand-kit';
import { shakeVec } from './node2-kit';
import type { Word } from '../engine/lyrics';

const T0 = 18.75, S16 = BEAT / 4;
const GLYPH: Record<string, string[]> = {
  '1': ['010', '110', '010', '010', '111'], '8': ['111', '101', '111', '101', '111'],
  '0': ['111', '101', '101', '101', '111'], 't': ['010', '111', '010', '010', '010'],
};
const PX = 116, PY = 124, CW = 104, CH = 112; // container pitch / size (top-down: long axis vertical)
const COLS = 16, X0 = (1920 - COLS * PX) / 2 + PX / 2, Y0 = 540 - 2 * PY; // centre of cell (0,0)

interface Box { x: number; y: number; td: number; g: number; id: number; slot: number }
const DEST = ['HSINCHU', 'PYEONGTAEK', 'TOKYO', 'SHANGHAI', 'DRESDEN', 'PHOENIX', 'YOUR TOWN'];
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ·0123456789';
const NC = 12, NS = 14, CELLW = 56, CELLH = 78, X_DEST = 78, X_STAT = 78 + NC * CELLW + 70;

export default class Tons extends Scene {
  text = new Layer2D();
  words: Word[] = [];
  boxes: Box[] = [];
  tCut = 21; tOne = 22; tTons = 20.6;

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'tons').words;
    const w = this.words;
    this.tTons = w[2]?.start ?? 20.6; this.tCut = w[3]?.start ?? 21.1; this.tOne = w[6]?.start ?? 22;
    // 40 containers: "180" (33) sweep left to right on 16ths before "tons"; the "t" (7) slams down on "tons"
    const cells: { c: number; r: number; g: number }[] = [];
    [['1', 0], ['8', 4], ['0', 8], ['t', 13]].forEach(([ch, c0], g) => {
      GLYPH[ch as string]!.forEach((row, r) => { for (let k = 0; k < 3; k++) if (row[k] === '1') cells.push({ c: (c0 as number) + k, r, g }); });
    });
    cells.sort((a, b) => a.c - b.c || a.r - b.r);
    const nA = Math.max(6, Math.floor((this.tTons - 0.12 - T0 - 0.3) / S16));
    const A = cells.filter((q) => q.g < 3), Tn = cells.filter((q) => q.g === 3);
    this.boxes = [
      ...A.map((q, i) => ({ x: X0 + q.c * PX, y: Y0 + q.r * PY, g: q.g, id: i, slot: Math.floor((i * nA) / A.length), td: T0 + 0.3 + Math.floor((i * nA) / A.length) * S16 })),
      ...Tn.map((q, i) => ({ x: X0 + q.c * PX, y: Y0 + q.r * PY, g: q.g, id: A.length + i, slot: nA + i, td: this.tTons + (i % 4) * S16 * 0.5 })),
    ];
  }

  container(c: CanvasRenderingContext2D, b: Box, t: number) {
    const k = clamp((t - b.td) / 0.2);
    if (t < b.td - 0.02) return;
    const air = k < 1 ? 1 - ease.inQuad(k) : 0; // height above the stack
    const land = pulse(t, b.td + 0.2, 0.07);
    const s = 1 + 0.7 * air;
    const tone = b.g === 3 ? 'signal' : b.g === 1 ? 'bone' : 'bone';
    const x = b.x, y = b.y + 6 * Math.sin(Math.min(1, Math.max(0, (t - b.td - 0.2) * 14)) * Math.PI) * 0;
    const w = CW * s, h = CH * s;
    c.save();
    c.globalAlpha = clamp(k * 6);
    // shadow slides in as it drops
    c.fillStyle = rgba('ink', 0.7); c.fillRect(x - w / 2 + 26 * air + 6, y - h / 2 + 36 * air + 6, w, h);
    c.fillStyle = b.g === 3 ? rgba('blood', 0.55 + 0.4 * land) : '#1b1b1d';
    c.fillRect(x - w / 2, y - h / 2, w, h);
    // corrugation ribs along the long axis
    c.strokeStyle = rgba(tone, 0.5); c.lineWidth = 1;
    c.beginPath();
    for (let rx = x - w / 2 + 7 * s; rx < x + w / 2 - 4; rx += 7 * s) { c.moveTo(rx, y - h / 2 + 10 * s); c.lineTo(rx, y + h / 2 - 12 * s); }
    c.stroke();
    // end frames, door end with handle bars, hairline cross-hatch on a third of the boxes
    c.strokeStyle = rgba(tone, 0.95); c.lineWidth = 2;
    c.strokeRect(x - w / 2, y - h / 2, w, h);
    c.lineWidth = 1; c.strokeRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, 8 * s); c.strokeRect(x - w / 2 + 3, y + h / 2 - 11 * s, w - 6, 8 * s);
    c.beginPath(); c.moveTo(x - 10 * s, y + h / 2 - 7 * s); c.lineTo(x + 10 * s, y + h / 2 - 7 * s); c.stroke();
    if (hash(b.id, 3) < 0.4) {
      c.strokeStyle = rgba(tone, 0.22);
      c.save(); c.beginPath(); c.rect(x - w / 2, y - h / 2, w, h); c.clip(); c.beginPath();
      for (let d = -h; d < w; d += 9) { c.moveTo(x - w / 2 + d, y - h / 2); c.lineTo(x - w / 2 + d + h, y + h / 2); }
      c.stroke(); c.restore();
    }
    // landing flash
    if (land > 0.02) { c.globalAlpha = 0.85 * land; c.fillStyle = b.g === 3 ? rgba('ember') : rgba('bone'); c.fillRect(x - w / 2, y - h / 2, w, h); }
    c.restore();
  }

  yard(c: CanvasRenderingContext2D, t: number) {
    // faint ground: bay lines, cell outlines of every slot, lane arrows
    c.strokeStyle = rgba('graphite', 0.35); c.lineWidth = 1;
    for (let i = -1; i <= COLS; i++) { const x = X0 + (i - 0.5) * PX; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1080); c.stroke(); }
    for (let r = -5; r <= 9; r++) { const y = Y0 + (r - 0.5) * PY; c.beginPath(); c.moveTo(0, y); c.lineTo(1920, y); c.stroke(); }
    // dim stacked boxes outside the lettering (the rest of the yard), outline only
    for (let r = -4; r <= 8; r++) for (let q = -1; q <= COLS; q++) {
      if (r >= 0 && r < 5 && q >= 0 && q < COLS) continue;
      if (hash(q, r, 7) > 0.62) continue;
      const x = X0 + q * PX, y = Y0 + r * PY;
      c.strokeStyle = rgba('ash', 0.16); c.strokeRect(x - CW / 2, y - CH / 2, CW, CH);
      c.beginPath(); for (let rx = x - CW / 2 + 8; rx < x + CW / 2; rx += 8) { c.moveTo(rx, y - CH / 2 + 8); c.lineTo(rx, y + CH / 2 - 8); } c.stroke();
    }
    // slot ticks for the lettering cells
    c.strokeStyle = rgba('graphite', 0.7);
    for (const b of this.boxes) if (t < b.td) { c.strokeRect(b.x - CW / 2, b.y - CH / 2, CW, CH); }
  }

  drawYard(c: CanvasRenderingContext2D, t: number, kick: number) {
    this.yard(c, t);
    // crane: gantry rail + trolley following the next box to drop; the bundled cable arrives as the hook
    const cur = this.boxes.filter((b) => b.td <= t + 0.03).length;
    const nxt = this.boxes[Math.min(cur, this.boxes.length - 1)]!;
    const lastD = this.boxes[Math.max(0, cur - 1)]!;
    const done = cur >= this.boxes.length;
    const gx = done ? lastD.x : nxt.x, gy = nxt.y;
    const arrive = prog(t, T0, T0 + 0.35, ease.outCubic);
    const hx = H_MACHINE_TONS.x + (gx - H_MACHINE_TONS.x) * arrive, hy = H_MACHINE_TONS.y + (gy - H_MACHINE_TONS.y) * arrive;
    // gantry beam across the full width at the trolley's row, with trolley
    c.fillStyle = rgba('bone', 0.12); c.fillRect(0, gy - 8, 1920, 16);
    c.strokeStyle = rgba('bone', 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(0, gy - 8); c.lineTo(1920, gy - 8); c.moveTo(0, gy + 8); c.lineTo(1920, gy + 8); c.stroke();
    c.fillStyle = rgba('signal', 0.95); c.fillRect(hx - 16, gy - 16, 32, 32);
    c.strokeStyle = rgba('ink'); c.lineWidth = 2; c.strokeRect(hx - 16, gy - 16, 32, 32);
    // hook / cable line (7px at the handoff, thinning), retracting upward as the first box drops
    const cab = 1 - prog(t, T0 + 0.15, T0 + 0.5, ease.inQuad);
    if (cab > 0.01) { c.fillStyle = rgba('bone'); c.fillRect(hx - 3.5 * cab, 0, 7 * cab, hy); c.beginPath(); c.arc(hx, hy, 10, 0, Math.PI * 2); c.fill(); }
    // target reticle
    if (!done) {
      const a = 0.9;
      c.strokeStyle = rgba('signal', a); c.lineWidth = 2;
      const rr = CW / 2 + 8;
      c.strokeRect(nxt.x - rr + 4, nxt.y - CH / 2 - 8, 2 * rr - 8, CH + 16);
      c.beginPath(); c.moveTo(nxt.x - 60, nxt.y); c.lineTo(nxt.x + 60, nxt.y); c.moveTo(nxt.x, nxt.y - 70); c.lineTo(nxt.x, nxt.y + 70); c.stroke();
    }
    for (const b of this.boxes) this.container(c, b, t);
    // counters
    const n = this.boxes.filter((b) => b.td + 0.2 <= t).length;
    mono(c, `TEU ${String(n).padStart(2, '0')} / 40`, 60, 80, 22, rgba('bone', 0.85), 600, 'left', 2);
    mono(c, 'YARD 7 · BAY 01-16 · TOP VIEW · ORTHO', 60, 112, 13, rgba('ash', 0.8), 500, 'left', 1);
    const tot = Math.min(180, Math.round((n / 40) * 180));
    mono(c, `${tot} t`, 1860, 80, 26, rgba(n >= 40 ? 'signal' : 'bone', 0.9), 700, 'right', 1);
    mono(c, `CRANE 1 · ${String(Math.round(kick * 9)).padStart(1, '0')}`, 1860, 112, 13, rgba('ash', 0.8), 500, 'right', 1);
  }

  // ---- split-flap
  charAt(target: string, i: number, t: number, tstart: number, seed: number): { cur: string; nxt: string; u: number; flipping: boolean } {
    const tc = target || ' ';
    const ti = Math.max(0, CHARS.indexOf(tc));
    const ts = tstart + i * 0.012 + hash(i, seed) * 0.05;
    const nFlips = 3 + Math.floor(hash(i, seed + 1) * 5) + (ti % 5);
    const dt = 0.055;
    const k = (t - ts) / dt;
    if (k >= nFlips || tstart > 1e8) return { cur: tc, nxt: tc, u: 0, flipping: false };
    if (k < 0) return { cur: ' ', nxt: ' ', u: 0, flipping: false };
    const j = Math.floor(k);
    const at = (m: number) => (m >= nFlips ? tc : CHARS[(ti + nFlips - m + 11 * m) % CHARS.length]!);
    return { cur: at(j), nxt: at(j + 1), u: k - j, flipping: true };
  }

  flapCell(c: CanvasRenderingContext2D, x: number, yc: number, ch: { cur: string; nxt: string; u: number; flipping: boolean }, col: string, bg: string) {
    const w = CELLW - 8, h = CELLH, half = h / 2, top = yc - half;
    const glyph = (s: string, cy: number, clipTop: boolean, sy: number) => {
      c.save();
      c.beginPath(); c.rect(x - w / 2, clipTop ? top : yc, w, half); c.clip();
      c.translate(x, yc); c.scale(1, sy); c.translate(-x, -yc);
      c.fillStyle = col; c.font = font(F.archivo(88, 800), 62); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText(s, x, yc + 22);
      c.restore();
    };
    const panel = (clipTop: boolean, sy: number, shade: number, s: string) => {
      c.save();
      c.translate(x, yc); c.scale(1, sy); c.translate(-x, -yc);
      c.fillStyle = bg; c.fillRect(x - w / 2, clipTop ? top : yc, w, half);
      c.fillStyle = `rgba(0,0,0,${shade})`; c.fillRect(x - w / 2, clipTop ? top : yc, w, half);
      c.restore();
      glyph(s, yc, clipTop, sy);
    };
    // static halves: top shows the new char once the flap has fallen; bottom the old
    const u = ch.u;
    panel(true, 1, 0, ch.flipping ? ch.nxt : ch.cur);
    panel(false, 1, 0, ch.cur);
    if (ch.flipping) {
      // falling flap with motion-blur ghosts
      for (let g = 0; g < 3; g++) {
        const uu = clamp(u - g * 0.09);
        c.save(); c.globalAlpha = g === 0 ? 1 : 0.28;
        if (uu < 0.5) panel(true, Math.max(0.02, Math.cos(uu * Math.PI)), 0.15 + 0.5 * uu, ch.cur);
        else panel(false, Math.max(0.02, -Math.cos(uu * Math.PI)), 0.5 - 0.5 * (uu - 0.5), ch.nxt);
        c.restore();
      }
      // blur smear of the cell
      c.fillStyle = col; c.globalAlpha = 0.1 * Math.sin(u * Math.PI); c.fillRect(x - w / 2, top, w, h); c.globalAlpha = 1;
    }
    // split line / flap edge
    c.fillStyle = '#050506'; c.fillRect(x - w / 2 - 2, yc - 1.5, w + 4, 3);
    c.fillStyle = 'rgba(238,233,223,0.18)'; c.fillRect(x - w / 2, yc + 1.5, w, 1);
    c.strokeStyle = 'rgba(238,233,223,0.28)'; c.lineWidth = 1; c.strokeRect(x - w / 2, top, w, h);
  }

  drawBoard(c: CanvasRenderingContext2D, t: number, kick: number) {
    const lt = t - this.tCut;
    // header
    c.fillStyle = rgba('bone'); c.font = font(F.archivo(110, 900), 108); c.textBaseline = 'alphabetic';
    c.fillText('DEPARTURES', 78, 150);
    mono(c, 'ALL FLIGHTS · ONE WAY · NO RETURNS', 80, 188, 18, rgba('ash', 0.9), 500, 'left', 2);
    mono(c, 'DESTINATION', X_DEST, 238, 14, rgba('signal', 0.9), 600, 'left', 3);
    mono(c, 'STATUS', X_STAT, 238, 14, rgba('signal', 0.9), 600, 'left', 3);
    mono(c, 'EXE:5000 · 180 t', 1842, 150, 22, rgba('bone', 0.85), 600, 'right', 2);
    mono(c, `${String(21 + Math.floor(lt * 10) % 3).padStart(2, '0')}:${String(Math.floor(lt * 60) % 60).padStart(2, '0')}`, 1842, 188, 22, rgba('signal', 0.95), 600, 'right', 2);
    // rules (these become the newsprint lines)
    c.fillStyle = rgba('bone', 0.9);
    for (const y of H_TONS_LINE_Y) c.fillRect(0, y - 1.5, 1920, 3);
    for (let r = 0; r < 7; r++) {
      const yc = (H_TONS_LINE_Y[r]! + H_TONS_LINE_Y[r + 1]!) / 2;
      const rowT = this.tCut + 0.04 + r * S16 * 1.5;
      // row backing + index
      c.fillStyle = r % 2 ? 'rgba(238,233,223,0.035)' : 'rgba(238,233,223,0.07)'; c.fillRect(0, H_TONS_LINE_Y[r]! + 2, 1920, 96);
      const last = r === 6;
      const dest = DEST[r]!;
      for (let i = 0; i < NC; i++) this.flapCell(c, X_DEST + CELLW * (i + 0.5), yc, this.charAt(dest[i] ?? ' ', i, t, rowT, r), '#EEE9DF', '#1a1a1c');
      const st1 = 'ONE · WAITLIST', st2 = 'SOLD OUT';
      const tSold = this.tOne + 0.02;
      for (let i = 0; i < NS; i++) {
        let ch;
        if (last && t >= tSold) ch = this.charAt(st2[i] ?? ' ', i, t, tSold, 40 + r);
        else ch = this.charAt(st1[i] ?? ' ', i, t, rowT + 0.14, 20 + r);
        const sold = last && t >= tSold;
        const col = sold ? '#E0312B' : (i === 3 ? '#FFA41B' : '#EEE9DF');
        this.flapCell(c, X_STAT + CELLW * (i + 0.5), yc, ch, col, sold ? '#240a09' : '#1a1a1c');
      }
      mono(c, String(r + 1).padStart(2, '0'), 30, yc + 7, 20, rgba('ash', 0.8), 600, 'left', 0);
    }
    const sold = pulse(t, this.tOne + 0.02, 0.15);
    if (sold > 0.02) { c.fillStyle = `rgba(224,49,43,${0.18 * sold})`; c.fillRect(0, H_TONS_LINE_Y[6]!, 1920, 100); }
    c.fillStyle = rgba('bone', 0.5 * kick);
    c.fillRect(0, H_TONS_LINE_Y[7]! - 1, 1920, 3);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, w = this.words;
    clearRT(renderer, out, [0.004, 0.004, 0.004]);
    const c = this.text.ctx;
    this.text.clear(rgba('ink'));
    const board = t >= this.tCut;
    if (!board) this.drawYard(c, t, f.a.kick); else this.drawBoard(c, t, f.a.kick);
    // karaoke line (footer)
    const sung = rgba('signal'), unsung = rgba('bone', 0.4);
    const size = board ? 40 : 44, y = board ? 1034 : 1010;
    let x = 80;
    c.fillStyle = 'rgba(10,10,11,0.9)'; if (board) c.fillRect(0, 956, 1920, 124);
    for (const wd of w) {
      const wid = karaoke(c, wd.w, x, y, F.archivo(100, 800), size, wordP(wd, t), sung, unsung, 1);
      x += wid + 18;
    }
    comp.draw(renderer, this.text.upload(), out);
    const tons = pulse(t, this.tTons, 0.12), cut = pulse(t, this.tCut, 0.1), one = pulse(t, this.tOne, 0.1);
    let hit = 0;
    for (const b of this.boxes) hit = Math.max(hit, 0.35 * pulse(t, b.td + 0.2, 0.05));
    const amp = 2 + 18 * tons + 10 * cut + 6 * one + 7 * hit;
    const [sx, sy] = shakeVec(t, amp, 4);
    return { bloom: 0.45, bloomThreshold: 0.88, vignette: 0.4, grain: 0.04, shake: [sx, sy] as [number, number], zoom: 1 + 0.04 * tons + 0.01 * f.a.kick + 0.02 * cut, ca: 0.4 + 2.5 * tons + 1.5 * cut, flash: 0.3 * cut };
  }
}
