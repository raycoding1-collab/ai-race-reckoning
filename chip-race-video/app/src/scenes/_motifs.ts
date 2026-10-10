// Shared motifs for Silicon Shield. The beam head and particles are adapted from mexicat/pdoom-video's
// spark (MIT, see ../../LICENSE-engine-mexicat). The beam is our EUV light; see docs/STYLE_BIBLE.md.
// Shared motifs used by several plates so they look identical everywhere:
//  - the SPARK: orange point with white-hot core, glow, and sputtering particles
//  - the MASK: the bland "assistant smile" (bone disc, two dots, one curve)
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { hash, TAU } from '../engine/util';

type P2 = { x: number; y: number };

/**
 * Sputtering particles for a spark whose head position over time is `headAt(t)`.
 * Deterministic: particles are born at fixed times (rate per second) with hashed velocities.
 * A rate that changes over time is a function of the birth time with its maximum `rateMax`: particles
 * are then born on the constant rateMax clock and thinned by hash, so each one keeps its identity
 * whatever t it is drawn at (a rate read at the current t would re-time them all from one
 * motion-blur sub-frame to the next).
 * Draws into a 2D LineBatch as short streaks (motion-blurred), additive.
 */
export function sparkParticles(lb: LineBatch, t: number, headAt: (t: number) => P2 | null, o: { rate?: number | ((tb: number) => number); rateMax?: number; life?: number; speed?: number; gravity?: number; intensity?: number; seed?: number; width?: number } = {}) {
  const life = o.life ?? 0.45, speed = o.speed ?? 260, g = o.gravity ?? 520, I = o.intensity ?? 1, seed = o.seed ?? 1;
  const rateAt = typeof o.rate === 'function' ? o.rate : null;
  const rate = rateAt ? o.rateMax! : (o.rate as number | undefined) ?? 90;
  if (!(rate > 0)) return;
  const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
  for (let n = n0; n <= n1; n++) {
    const tb = n / rate;
    if (tb > t) continue;
    if (rateAt && hash(n, seed + 3) * rate >= rateAt(tb)) continue;
    const age = t - tb;
    const h = headAt(tb);
    if (!h) continue;
    const a = hash(n, seed) * TAU, sp = speed * (0.25 + hash(n, seed + 1) ** 2 * 1.2);
    const lf = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - speed * 0.3;
    const x = h.x + vx * age, y = h.y + vy * age + 0.5 * g * age * age;
    const dtb = 0.018; // streak length in time
    const x0 = h.x + vx * Math.max(0, age - dtb), y0 = h.y + vy * Math.max(0, age - dtb) + 0.5 * g * Math.max(0, age - dtb) ** 2;
    const k = 1 - age / lf;
    const heat = k * k;
    const col: [number, number, number] = [
      (LIN.signal[0] + (1 - LIN.signal[0]) * heat) * 2.2 * I,
      (LIN.signal[1] + (0.8 - LIN.signal[1]) * heat) * 2.2 * I,
      (LIN.signal[2] + (0.5 - LIN.signal[2]) * heat) * 2.2 * I,
    ];
    lb.seg2(x0, y0, x, y, (o.width ?? 1.6) * (0.5 + k * 0.7), col, Math.min(1, k * 1.4));
  }
}

/** The spark head: a white-hot core and an orange halo (draw after the line it drags). 2D LineBatch. */
export function sparkHead(lb: LineBatch, x: number, y: number, t: number, scale = 1, intensity = 1) {
  const flick = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
  const I = intensity * flick;
  // halo: a few concentric short segments (dots) with decreasing intensity
  lb.seg2(x, y, x + 0.01, y, 26 * scale, [LIN.signal[0] * 0.5 * I, LIN.signal[1] * 0.5 * I, LIN.signal[2] * 0.5 * I], 0.35);
  lb.seg2(x, y, x + 0.01, y, 12 * scale, [LIN.ember[0] * 2.5 * I, LIN.ember[1] * 2.5 * I, LIN.ember[2] * 2.5 * I], 0.8);
  lb.seg2(x, y, x + 0.01, y, 5 * scale, [6 * I, 5 * I, 4 * I], 1);
  // four tiny rays
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + t * 3 + 0.4;
    const r = (9 + 5 * hash(Math.floor(t * 30), i)) * scale;
    lb.seg2(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.2 * scale, [3 * I, 1.2 * I, 0.4 * I], 0.8);
  }
}

/** Canvas2D version of the spark head (for scenes drawing in 2D layers). Use with additive-ish bloom. */
export function sparkHead2D(c: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, 22 * scale);
  g.addColorStop(0, 'rgba(255,250,240,1)');
  g.addColorStop(0.18, 'rgba(255,170,90,0.95)');
  g.addColorStop(0.45, rgba('signal', 0.45));
  g.addColorStop(1, rgba('signal', 0));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, 22 * scale, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- the mask
/**
 * Canonical mask geometry in units of the disc radius R (centre at 0,0, y down):
 * disc radius 1; eyes: dots at (±0.30, -0.16) radius 0.075;
 * smile: arc centred (0, -0.08) radius 0.50 from 25° to 155° (y-down angles), stroke 0.06.

import { F, font } from '../engine/type';

// The beam: same drawing as the spark, our name for it.
export const beamHead = sparkHead;
export const beamParticles = sparkParticles;
export const beamHead2D = sparkHead2D;

/** TPP (Total Processing Performance, ECCN 3A090) climbs at every chorus. Values are display strings. */
export const TPP_THRESHOLD = 4800;
export class TPP {
  steps: { t: number; v: number }[];
  constructor(lyrics: { lines: { text: string; start: number }[] }) {
    const drops = lyrics.lines.filter((l) => /^Every wafer is a weapon now/.test(l.text)).map((l) => l.start);
    // drops[0..2] are the three choruses; the whispered outro line is drops[3]
    const vals = [4800, 19200, Infinity, Infinity];
    this.steps = [{ t: -1, v: 1200 }, ...drops.map((t, i) => ({ t, v: vals[i] ?? Infinity }))];
  }
  value(t: number): number {
    let i = 0;
    while (i + 1 < this.steps.length && this.steps[i + 1]!.t <= t) i++;
    const cur = this.steps[i]!, prev = this.steps[Math.max(0, i - 1)]!;
    if (!isFinite(cur.v)) return Infinity;
    const k = i === 0 ? 1 : Math.min(1, Math.max(0, (t - cur.t) / 0.9));
    const e = 1 - Math.pow(2, -10 * k);
    return prev.v + (cur.v - prev.v) * e;
  }
  /** Seconds since the last step (Infinity before the first). */
  since(t: number): number { let s = -Infinity; for (const x of this.steps) if (x.t > 0 && x.t <= t) s = x.t; return t - s; }
}
export function formatTPP(v: number): string {
  if (!isFinite(v)) return '∞';
  return Math.round(v).toLocaleString('en-US');
}
/** Draw the TPP instrument (mono label, bar with the red threshold tick, value) at x,y in Canvas2D. */
export function drawTPP(c: CanvasRenderingContext2D, x: number, y: number, v: number, o: { scale?: number; ink?: string; dim?: string; width?: number } = {}) {
  const s = o.scale ?? 1, w = (o.width ?? 300) * s, ink = o.ink ?? '#EEE9DF', dim = o.dim ?? 'rgba(238,233,223,0.4)';
  c.save();
  c.font = font(F.mono(500), 13 * s); c.fillStyle = dim; c.textBaseline = 'alphabetic';
  c.fillText('LOT 7A-0042 · TPP', x, y);
  const max = 20000, fr = isFinite(v) ? Math.min(1, v / max) : 1.08;
  c.fillStyle = dim; c.fillRect(x, y + 8 * s, w, 2 * s);
  c.fillStyle = '#FFA41B'; c.fillRect(x, y + 6 * s, w * fr, 6 * s);
  const tx = x + w * (TPP_THRESHOLD / max);
  c.fillStyle = '#E0312B'; c.fillRect(tx, y + 2 * s, 2 * s, 14 * s);
  c.font = font(F.mono(600), 22 * s); c.fillStyle = v >= TPP_THRESHOLD ? '#FFA41B' : ink;
  c.fillText(formatTPP(v), x, y + 40 * s);
  c.restore();
}
