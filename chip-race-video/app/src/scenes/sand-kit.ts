// Shared helpers for ACT I (sand, tin, laser, machine, tons, line): beat grid, events, type helpers
// (karaoke wipes, odometer digits), and the handoff positions between the plates.
import { F, font, glyphX, layout } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { rgba } from '../engine/palette';
import { clamp, ease, prog } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';

export { sparkHead as beamHead, sparkParticles as beamParticles };

export const BEAT = 60 / 128;
export const BAR = 4 * BEAT;
/** Song time of beat k (constant 128 BPM grid; the song is synthesized to it). */
export const BT = (k: number) => k * BEAT;
/** Song time of bar b. */
export const BR = (b: number) => b * BAR;

// ---- handoffs (screen px, 1920x1080): computed once, shared by both sides of each cut
/** sand -> tin: the ignited lattice atom IS the first frozen tin droplet. */
export const H_SAND_TIN = { x: 600, y: 470, r: 56 };
/** tin -> laser: the pre-pulsed pancake (screen centre after tin's last punch-in). */
export const H_TIN_LASER = { x: 1110, y: 500, rx: 210, ry: 46 };
/** laser -> machine: the isotherm rings = the collector mirror's zones, face-on. */
export const H_LASER_MACHINE = { x: 960, y: 540, radii: [70, 140, 215, 295, 380, 470] };
/** machine -> tons: the bundled cable, a vertical line from the top edge down to (x, y). */
export const H_MACHINE_TONS = { x: 960, y: 470, w: 7 };
/** tons -> line: the board's flap split lines (y of each horizontal rule). */
export const H_TONS_LINE_Y: number[] = [252, 352, 452, 552, 652, 752, 852, 952];

// ---- events.json (sfx, risers, gaps); falls back to the grid when absent
export interface Events { sfx: { name: string; t: number }[]; kick: number[]; snare: number[]; riser: [number, number][]; gap: [number, number][]; tapestop: [number, number][] }
let evCache: Events | null = null;
export async function loadEvents(): Promise<Events> {
  if (evCache) return evCache;
  try {
    const r = await fetch('data/events.json');
    const j = await r.json();
    evCache = { sfx: j.sfx ?? [], kick: j.kick ?? [], snare: j.snare ?? [], riser: j.riser ?? [], gap: j.gap ?? [], tapestop: j.tapestop ?? [] };
  } catch {
    evCache = { sfx: [], kick: [], snare: [], riser: [], gap: [], tapestop: [] };
  }
  return evCache;
}
export function sfxTime(ev: Events, name: string, near: number, fallback = near): number {
  let best = fallback, bd = 1.0;
  for (const s of ev.sfx) if (s.name === name && Math.abs(s.t - near) < bd) { bd = Math.abs(s.t - near); best = s.t; }
  return best;
}

// ---- type
/** Sung/unsung karaoke wipe of one word drawn at (x, baseline y), left-aligned, with kerning kept. */
export function karaoke(c: CanvasRenderingContext2D, text: string, x: number, y: number, fam: string, size: number, p: number, sung: string, unsung: string, tracking = 0) {
  c.font = font(fam, size);
  c.letterSpacing = `${tracking}px`;
  const lay = layout(text, fam, size, tracking);
  const w = lay.width;
  if (p < 1) { c.fillStyle = unsung; c.fillText(text, x, y); }
  if (p > 0) {
    c.save();
    c.beginPath(); c.rect(x - 4, y - size * 1.2, (w + 8) * clamp(p), size * 1.6); c.clip();
    c.fillStyle = sung; c.fillText(text, x, y);
    c.restore();
  }
  c.letterSpacing = '0px';
  return w;
}
export const wordP = (w: Word, t: number) => Lyrics.wordProgress(w, t);

/**
 * Odometer text: draws `text` where each glyph that differs from `prev` rolls up into place (k = 0..1).
 * Glyph positions come from the kerned layout of `text`.
 */
export function odometer(c: CanvasRenderingContext2D, text: string, prev: string, k: number, x: number, y: number, fam: string, size: number, col: string, align: 'left' | 'right' = 'left') {
  c.font = font(fam, size);
  const lay = layout(text, fam, size);
  const x0 = align === 'right' ? x - lay.width : x;
  const pc = Array.from(prev), tc = Array.from(text);
  const off = pc.length - tc.length; // align from the right (digits)
  const e = ease.outExpo(clamp(k));
  for (const g of lay.glyphs) {
    const old = pc[g.i + off];
    c.fillStyle = col;
    if (old === g.ch || k >= 1) { c.fillText(g.ch, x0 + g.x, y); continue; }
    c.save();
    c.beginPath(); c.rect(x0 + g.x - 2, y - size * 0.8, g.w + 4, size * 0.92); c.clip();
    const dy = size * 1.05;
    c.fillText(g.ch, x0 + g.x, y + dy * (1 - e));
    if (old !== undefined) { c.globalAlpha *= 1 - e; c.fillText(old, x0 + g.x, y - dy * e); }
    c.restore();
  }
  return lay.width;
}

export function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 15, col = rgba('bone', 0.6), weight = 500, align: CanvasTextAlign = 'left', tracking = 0) {
  c.font = font(F.mono(weight), size);
  c.textAlign = align;
  c.letterSpacing = `${tracking}px`;
  c.fillStyle = col;
  c.fillText(text, x, y);
  c.textAlign = 'left';
  c.letterSpacing = '0px';
}
/** Typewriter reveal: the first floor(len * k) chars. */
export const typed = (s: string, t: number, t0: number, cps = 60) => {
  const n = Math.floor(clamp((t - t0) * cps, 0, s.length));
  return Array.from(s).slice(0, n).join('');
};
export { glyphX, prog };
