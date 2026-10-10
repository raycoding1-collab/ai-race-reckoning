// Shared helpers for chorus 2 and 3 plates (node2, grid2, down2, post2, node3, grid3, down3).
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { F, font, measure } from '../engine/type';
import { frameIdx, hash, lerp, clamp, pulse, TAU, ease } from '../engine/util';

export const W = 1920, H = 1080;
export const C = {
  bone: '#EEE9DF', signal: '#FFA41B', ember: '#FFD27A', ink: '#0A0A0B', ink2: '#151517',
  graphite: '#5E5B57', ash: '#9C978F', umber: '#7A3A06', red: '#E0312B',
};
export const rgbaS = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/** Linear-light amber constants for LineBatch (values may exceed 1 to bloom). */
export const LAMBER: [number, number, number] = [1.0, 0.37, 0.011];
export const LEMBER: [number, number, number] = [1.0, 0.64, 0.19];
export const LBONE: [number, number, number] = [0.85, 0.81, 0.74];
export const amber = (k: number): [number, number, number] => [LAMBER[0] * k, LAMBER[1] * k, LAMBER[2] * k];
export const hot = (k: number): [number, number, number] => [k * 1.0, k * 0.78, k * 0.45];

/** Per-frame deterministic shake vector (px), amplitude amp. */
export function shakeVec(t: number, amp: number, seed = 1): [number, number] {
  const i = frameIdx(t);
  return [(hash(i, seed) - 0.5) * 2 * amp, (hash(i, seed + 9) - 0.5) * 2 * amp];
}

/** Sum of decaying pulses from a list of times (max). */
export function pulses(times: number[], t: number, hl = 0.1): number {
  let v = 0;
  for (const x of times) if (t >= x && t - x < hl * 8) v = Math.max(v, pulse(t, x, hl));
  return v;
}

/** Tick times of the sung syllables of a line (word.syl starts). */
export function sylTimes(line: Line): number[] {
  const out: number[] = [];
  for (const w of line.words) { if (w.syl && w.syl.length) for (const s of w.syl) out.push(s[0]); else out.push(w.start); }
  return out;
}

/**
 * Karaoke word: dim base text, the sung part revealed left-to-right in `sung` (amber hot -> `settled` after the word ends).
 * Draws at (x, baseline y); returns the advance width. Upper-cases by default.
 */
export function karaokeWord(c: CanvasRenderingContext2D, w: Word, t: number, x: number, y: number, fam: string, size: number,
  o: { dim?: string; sung?: string; settled?: string; upper?: boolean; hotFor?: number; alphaIn?: number; slam?: number; tracking?: number } = {}): number {
  const txt = o.upper === false ? w.w : w.w.toUpperCase();
  c.font = font(fam, size);
  if (o.tracking) c.letterSpacing = `${o.tracking}px`;
  const wid = c.measureText(txt).width;
  const p = Lyrics.wordProgress(w, t);
  const hotFor = o.hotFor ?? 0.35;
  const cool = clamp((t - w.end) / hotFor);
  const sungCol = o.sung ?? C.signal, settled = o.settled ?? C.bone;
  c.textBaseline = 'alphabetic';
  const a0 = o.alphaIn ?? 1;
  // slam: scale pulse around the word's left-baseline anchor
  const sl = o.slam ? 1 + o.slam * pulse(t, w.start, 0.07) : 1;
  c.save();
  if (sl !== 1) { c.translate(x + wid / 2, y - size * 0.35); c.scale(sl, sl); c.translate(-(x + wid / 2), size * 0.35 - y); }
  c.globalAlpha = a0;
  c.fillStyle = o.dim ?? rgbaS(C.bone, 0.28);
  c.fillText(txt, x, y);
  if (p > 0) {
    c.save();
    c.beginPath(); c.rect(x - 4, y - size * 1.1, wid * p + 4 + (p >= 1 ? 8 : 0), size * 1.4); c.clip();
    c.fillStyle = p >= 1 ? mix(sungCol, settled, ease.inOutQuad(cool)) : sungCol;
    c.fillText(txt, x, y);
    c.restore();
  }
  c.restore();
  if (o.tracking) c.letterSpacing = '0px';
  return wid;
}

/** Lay out words of a line in a row starting at x (baseline y); returns final x. gap in px. */
export function karaokeRow(c: CanvasRenderingContext2D, words: Word[], t: number, x: number, y: number, fam: string, size: number, gap: number, o: Parameters<typeof karaokeWord>[7] = {}): number {
  let cx = x;
  for (const w of words) { const wd = karaokeWord(c, w, t, cx, y, fam, size, o); cx += wd + gap; }
  return cx;
}
export function rowWidth(words: Word[], fam: string, size: number, gap: number, upper = true): number {
  let s = 0;
  for (const w of words) s += measure(upper ? w.w.toUpperCase() : w.w, fam, size) + gap;
  return s - gap;
}

/** mix two #rrggbb colours (sRGB-ish, fine for UI) */
export function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = lerp((pa >> 16) & 255, (pb >> 16) & 255, k), g = lerp((pa >> 8) & 255, (pb >> 8) & 255, k), bl = lerp(pa & 255, pb & 255, k);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

/** Stepped spring: value goes through `vals` at `times` with spring overshoot (see breakdown D). */
export function stepped(t: number, times: number[], vals: number[], freq = 3, damp = 0.45): number {
  let v = vals[0]!;
  for (let i = 1; i < times.length; i++) {
    const dt = t - times[i]!;
    if (dt <= 0) break;
    const k = 1 - Math.exp(-damp * TAU * freq * dt) * Math.cos(TAU * freq * Math.sqrt(1 - damp * damp) * dt);
    v += (vals[i]! - vals[i - 1]!) * k;
  }
  return v;
}

/** Camera shots in log-scale: poses {t,x,y,s,r,k?} where each shot snaps from the previous with outExpo over `snap` s. */
export interface Pose { t: number; x: number; y: number; s: number; r?: number; tilt?: number; snap?: number }
export function camAt(shots: Pose[], t: number): { x: number; y: number; s: number; r: number; tilt: number } {
  let i = 0;
  while (i + 1 < shots.length && shots[i + 1]!.t <= t) i++;
  const b = shots[i]!;
  if (i === 0) return { x: b.x, y: b.y, s: b.s, r: b.r ?? 0, tilt: b.tilt ?? 0 };
  const a = shots[i - 1]!;
  const sn = b.snap ?? 0.14;
  const k = ease.outExpo(clamp((t - b.t) / sn));
  return {
    x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)),
    r: lerp(a.r ?? 0, b.r ?? 0, k), tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, k),
  };
}

export { F, font };

// ---------------------------------------------------------------------------------------------
// The shared engraved dial (grid2's site-load meter becomes down2's speedometer: same pose, same face).
export interface DialOpts {
  frac: number;            // needle position 0..1 of the 270deg sweep (may exceed 1 slightly when pinned and shaking)
  labelsA: string[]; labelsB?: string[]; flip?: number; // 0..1 label flip A->B
  titleA: string; titleB?: string;
  redFrom?: number;        // fraction where the redline zone starts
  shakeDeg?: number;       // needle vibration (deg)
  t?: number;
  minor?: number;          // minor ticks between majors
  alpha?: number;
  hubGlow?: number;
}
export const DIAL_A0 = 135;      // deg, canvas (clockwise from +x): bottom-left
export const DIAL_SWEEP = 270;

export function drawDial(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, o: DialOpts) {
  const k = R / 170;
  const t = o.t ?? 0;
  const ang = (f: number) => (DIAL_A0 + DIAL_SWEEP * f) * Math.PI / 180;
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  // face
  c.beginPath(); c.arc(cx, cy, R * 1.06, 0, TAU); c.fillStyle = C.ink2; c.fill();
  c.lineWidth = 3 * k; c.strokeStyle = rgbaS(C.bone, 0.9); c.beginPath(); c.arc(cx, cy, R * 1.06, 0, TAU); c.stroke();
  c.lineWidth = 1.2 * k; c.strokeStyle = rgbaS(C.bone, 0.5); c.beginPath(); c.arc(cx, cy, R * 1.0, 0, TAU); c.stroke();
  c.beginPath(); c.arc(cx, cy, R * 0.74, 0, TAU); c.strokeStyle = rgbaS(C.bone, 0.18); c.stroke();
  // radial engraving ring between 0.76R and 0.99R: short hairlines, denser toward the redline
  const red = o.redFrom ?? 0.8;
  c.lineWidth = 1 * k;
  for (let i = 0; i <= 135; i++) {
    const f = i / 135, a = ang(f);
    const inRed = f >= red;
    c.strokeStyle = inRed ? rgbaS(C.signal, 0.55) : rgbaS(C.bone, 0.12);
    c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); c.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97); c.stroke();
  }
  // redline arc (amber hatch band)
  c.lineWidth = 7 * k; c.strokeStyle = rgbaS(C.signal, 0.9);
  c.beginPath(); c.arc(cx, cy, R * 0.985, ang(red), ang(1)); c.stroke();
  // ticks
  const nMaj = o.labelsA.length - 1, nMin = o.minor ?? 4;
  for (let i = 0; i <= nMaj; i++) {
    for (let j = 0; j < nMin + 1; j++) {
      const f = (i + j / (nMin + 1)) / nMaj;
      if (f > 1.0001) break;
      const a = ang(f), major = j === 0;
      const r0 = R * (major ? 0.8 : 0.86), r1 = R * 0.9;
      c.lineWidth = (major ? 3 : 1.4) * k;
      c.strokeStyle = f >= red ? rgbaS(C.ember, 0.95) : rgbaS(C.bone, major ? 0.95 : 0.55);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
    }
  }
  // numerals (flip A -> B)
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const flip = o.flip ?? 0;
  for (let i = 0; i <= nMaj; i++) {
    const a = ang(i / nMaj);
    const fl = clamp(flip * 1.6 - (i / nMaj) * 0.6);
    const useB = fl > 0.5 && !!o.labelsB;
    const sy = Math.abs(Math.cos(fl * Math.PI));
    const txt = useB ? o.labelsB![i]! : o.labelsA[i]!;
    c.save();
    c.translate(cx + Math.cos(a) * R * 0.63, cy + Math.sin(a) * R * 0.63);
    c.scale(1, Math.max(0.04, sy));
    c.font = font(F.archivo(100, 700), 25 * k);
    c.fillStyle = i / nMaj >= red ? C.ember : C.bone;
    c.fillText(txt, 0, 0);
    c.restore();
  }
  // title
  const ft = clamp(flip * 1.6 - 0.2);
  const tTxt = ft > 0.5 && o.titleB ? o.titleB : o.titleA;
  c.save();
  c.translate(cx, cy + R * 0.42); c.scale(1, Math.max(0.04, Math.abs(Math.cos(ft * Math.PI))));
  c.font = font(F.mono(500), 14 * k); c.fillStyle = rgbaS(C.bone, 0.72); c.letterSpacing = `${2.4 * k}px`;
  c.fillText(tTxt, 0, 0); c.letterSpacing = '0px';
  c.restore();
  // needle
  const sh = (o.shakeDeg ?? 0) * Math.sin(t * 190) * 0.6 + (o.shakeDeg ?? 0) * Math.sin(t * 331 + 1) * 0.4;
  const a = ang(o.frac) + sh * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  // soft shadow
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.beginPath(); c.moveTo(cx + ux * R * 0.88 + 5 * k, cy + uy * R * 0.88 + 7 * k); c.lineTo(cx + px * 7 * k + 5 * k, cy + py * 7 * k + 7 * k); c.lineTo(cx - ux * R * 0.2 + 5 * k, cy - uy * R * 0.2 + 7 * k); c.lineTo(cx - px * 7 * k + 5 * k, cy - py * 7 * k + 7 * k); c.closePath(); c.fill();
  const g = c.createLinearGradient(cx - ux * R * 0.2, cy - uy * R * 0.2, cx + ux * R * 0.88, cy + uy * R * 0.88);
  g.addColorStop(0, C.umber); g.addColorStop(0.5, C.signal); g.addColorStop(1, C.ember);
  c.fillStyle = g;
  c.beginPath(); c.moveTo(cx + ux * R * 0.88, cy + uy * R * 0.88); c.lineTo(cx + px * 6.5 * k, cy + py * 6.5 * k); c.lineTo(cx - ux * R * 0.2, cy - uy * R * 0.2); c.lineTo(cx - px * 6.5 * k, cy - py * 6.5 * k); c.closePath(); c.fill();
  c.strokeStyle = rgbaS(C.ember, 0.9); c.lineWidth = 1 * k; c.beginPath(); c.moveTo(cx - ux * R * 0.1, cy - uy * R * 0.1); c.lineTo(cx + ux * R * 0.86, cy + uy * R * 0.86); c.stroke();
  // hub
  c.beginPath(); c.arc(cx, cy, 15 * k, 0, TAU); c.fillStyle = C.ink; c.fill();
  c.lineWidth = 3 * k; c.strokeStyle = rgbaS(C.bone, 0.9); c.stroke();
  c.beginPath(); c.arc(cx, cy, 5 * k, 0, TAU); c.fillStyle = o.hubGlow ? C.ember : C.signal; c.fill();
  c.restore();
}
