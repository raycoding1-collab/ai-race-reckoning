// Shared helpers for the Act III plates (hbm, smuggle, island, key, shield, fab): karaoke word drawing,
// small mono utilities, a camera-pose director and a seven-segment display.
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { clamp, ease, lerp } from '../engine/util';

export interface WordOpts {
  family?: string;
  size: number;
  /** show the word faintly before it is sung (alpha), 0 = hidden until its start */
  ghost?: number;
  /** slam: scale overshoot at the onset (0 = none) and its time constant */
  slam?: number;
  slamTau?: number;
  /** slide-in distance (px) at the onset */
  slide?: number;
  /** colours */
  sung?: string; // after the word: palette key or css, default bone
  hot?: string; // sweeping colour, default signal
  dim?: string; // unsung colour
  sungAlpha?: number;
  dimAlpha?: number;
  /** keep the hot colour after the word ends for this many seconds then settle to `sung` (default 0.45) */
  afterglow?: number;
  /** pivot of the slam scale: 'l' left baseline (default) or 'c' centre */
  pivot?: 'l' | 'c';
  baseline?: CanvasTextBaseline;
}

/** Draws one sung word at (x, y) (baseline-left). Returns its advance width. */
export function drawWord(c: CanvasRenderingContext2D, w: Word, t: number, x: number, y: number, o: WordOpts): number {
  const fam = o.family ?? F.archivo(100, 900);
  c.font = font(fam, o.size);
  c.textBaseline = o.baseline ?? 'alphabetic';
  const width = c.measureText(w.w).width;
  const a = t - w.start;
  if (a < -0.0001 && !(o.ghost && o.ghost > 0)) return width;
  c.save();
  const sungAmt = clamp(a / 0.03);
  if (a < 0) {
    c.fillStyle = rgba(o.dim ?? 'bone', o.ghost ?? 0);
    c.fillText(w.w, x, y);
    c.restore();
    return width;
  }
  const sl = 1 + (o.slam ?? 0.28) * Math.exp(-a / (o.slamTau ?? 0.07));
  const dx = -(o.slide ?? 40) * Math.exp(-a / 0.09);
  c.translate(x + dx + (o.pivot === 'c' ? width / 2 : 0), y);
  c.scale(sl, sl);
  const ox = o.pivot === 'c' ? -width / 2 : 0;
  c.globalAlpha = sungAmt;
  const done = t >= w.end;
  const p = Lyrics.wordProgress(w, t);
  c.fillStyle = rgba(done ? o.sung ?? 'bone' : o.dim ?? 'bone', done ? o.sungAlpha ?? 0.92 : o.dimAlpha ?? 0.34);
  c.fillText(w.w, ox, 0);
  const hot = o.hot ?? 'signal';
  if (!done) {
    c.save();
    c.beginPath(); c.rect(ox - 6, -o.size * 1.1, width * p + 6, o.size * 1.5); c.clip();
    c.fillStyle = rgba(hot, 1); c.fillText(w.w, ox, 0);
    c.restore();
  } else {
    const fa = clamp(1 - (t - w.end) / (o.afterglow ?? 0.45));
    if (fa > 0) { c.globalAlpha *= fa; c.fillStyle = rgba(hot, 1); c.fillText(w.w, ox, 0); }
  }
  c.restore();
  return width;
}

/** Laid-out words of a row: x advance with a normal space. */
export function drawRow(c: CanvasRenderingContext2D, words: Word[], t: number, x: number, y: number, o: WordOpts, spaceScale = 0.28): number {
  const fam = o.family ?? F.archivo(100, 900);
  c.font = font(fam, o.size);
  const sp = c.measureText(' ').width * (spaceScale / 0.28);
  let xx = x;
  for (const w of words) xx += drawWord(c, w, t, xx, y, o) + sp;
  return xx - x - sp;
}

export function rowWidth(c: CanvasRenderingContext2D, words: Word[], o: WordOpts, spaceScale = 0.28): number {
  c.font = font(o.family ?? F.archivo(100, 900), o.size);
  const sp = c.measureText(' ').width * (spaceScale / 0.28);
  return words.reduce((s, w) => s + c.measureText(w.w).width, 0) + sp * (words.length - 1);
}

/** Beat-grid camera pose director: poses are keyed to times, each snap uses an expo ease. */
export interface Pose { [k: string]: number }
export interface Shot { t: number; pose: Pose; dur?: number; ease?: (t: number) => number }
export function directPose(shots: Shot[], t: number): Pose {
  let cur = shots[0]!.pose;
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i]!;
    if (t < s.t) break;
    const k = (s.ease ?? ease.outExpo)(clamp((t - s.t) / (s.dur ?? 0.14)));
    const prev = shots[i - 1]!.pose;
    cur = Object.fromEntries(Object.keys(s.pose).map((key) => [key, lerp(prev[key] ?? s.pose[key]!, s.pose[key]!, k)]));
    if (k < 1) return cur;
  }
  return cur;
}

// ---- seven-segment display (amber on dim ghosts), for meters and clocks
const SEG: Record<string, number> = { '0': 0b1111110, '1': 0b0110000, '2': 0b1101101, '3': 0b1111001, '4': 0b0110011, '5': 0b1011011, '6': 0b1011111, '7': 0b1110000, '8': 0b1111111, '9': 0b1111011, '-': 0b0000001, ' ': 0 };
// bit order: a b c d e f g (a = top, going clockwise, g = middle)
export function drawSeg(c: CanvasRenderingContext2D, ch: string, x: number, y: number, h: number, on: string, off: string) {
  const w = h * 0.52, th = h * 0.13;
  const bits = SEG[ch] ?? 0;
  const seg = (i: number, pts: [number, number][]) => {
    c.fillStyle = bits & (1 << (6 - i)) ? on : off;
    c.beginPath();
    pts.forEach(([px, py], n) => (n ? c.lineTo(x + px, y + py) : c.moveTo(x + px, y + py)));
    c.closePath(); c.fill();
  };
  const hw = (a: number, b: number, yy: number): [number, number][] => [[a, yy], [a + th * 0.6, yy - th / 2], [b - th * 0.6, yy - th / 2], [b, yy], [b - th * 0.6, yy + th / 2], [a + th * 0.6, yy + th / 2]];
  const vt = (xx: number, a: number, b: number): [number, number][] => [[xx, a], [xx + th / 2, a + th * 0.6], [xx + th / 2, b - th * 0.6], [xx, b], [xx - th / 2, b - th * 0.6], [xx - th / 2, a + th * 0.6]];
  const g = 0.03 * h;
  seg(0, hw(th * 0.5 + g, w - th * 0.5 - g, 0));
  seg(1, vt(w, th * 0.5 + g, h / 2 - g));
  seg(2, vt(w, h / 2 + g, h - th * 0.5 - g));
  seg(3, hw(th * 0.5 + g, w - th * 0.5 - g, h));
  seg(4, vt(0, h / 2 + g, h - th * 0.5 - g));
  seg(5, vt(0, th * 0.5 + g, h / 2 - g));
  seg(6, hw(th * 0.5 + g, w - th * 0.5 - g, h / 2));
  return w + h * 0.22;
}
export function drawSegText(c: CanvasRenderingContext2D, s: string, x: number, y: number, h: number, on: string, off: string): number {
  let xx = x;
  for (const ch of s) {
    if (ch === '.' || ch === ':') {
      c.fillStyle = on; c.beginPath(); c.arc(xx + h * 0.06, y + h * (ch === '.' ? 0.97 : 0.3), h * 0.06, 0, Math.PI * 2); c.fill();
      if (ch === ':') { c.beginPath(); c.arc(xx + h * 0.06, y + h * 0.7, h * 0.06, 0, Math.PI * 2); c.fill(); }
      xx += h * 0.22;
    } else xx += drawSeg(c, ch, xx, y, h, on, off);
  }
  return xx - x;
}

/** Mono label helper. */
export function mono(c: CanvasRenderingContext2D, s: string, x: number, y: number, size = 13, color = 'rgba(238,233,223,0.6)', weight = 500, align: CanvasTextAlign = 'left', tracking = 0) {
  c.font = font(F.mono(weight), size);
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  (c as any).letterSpacing = `${tracking}px`;
  c.fillText(s, x, y);
  (c as any).letterSpacing = '0px';
  c.textAlign = 'left';
}
