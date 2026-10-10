// Geometry and timing of the fracture in `crack` (world px relative to the wafer centre; y down).
// Cracks run along crystal planes: headings are 90 degrees (down a die street) and the {111} planes,
// 54.7 degrees from the wafer surface in cross-section (heading 54.7 / 125.3 degrees from +x).
import { clamp, ease, prog } from '../engine/util';

export interface V2 { x: number; y: number }
export const WR = 520;                 // wafer radius at zoom 1
export const DIE = { w: 104, h: 70 };
export const O_W: V2 = { x: 24, y: -318 };       // where the stress concentrates: the shield's top notch
export const FLAT_Y = 490;             // the wafer flat
export const A111 = 54.7;

const rad = (d: number) => (d * Math.PI) / 180;
function walk(start: V2, legs: [number, number][]): V2[] {
  const pts = [start];
  let p = start;
  for (const [deg, len] of legs) { p = { x: p.x + Math.cos(rad(deg)) * len, y: p.y + Math.sin(rad(deg)) * len }; pts.push(p); }
  return pts;
}
export interface Path { pts: V2[]; cum: number[]; total: number }
function mk(pts: V2[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return { pts, cum, total: cum[cum.length - 1]! };
}
function at(p: Path, L: number): V2 {
  L = clamp(L, 0, p.total);
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i]! < L) i++;
  const a = p.pts[i - 1]!, b = p.pts[i]!, u = (L - p.cum[i - 1]!) / Math.max(1e-6, p.cum[i]! - p.cum[i - 1]!);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}
/** the polyline up to length L */
export function upTo(p: Path, L: number): V2[] {
  L = clamp(L, 0, p.total);
  const out: V2[] = [p.pts[0]!];
  for (let i = 1; i < p.pts.length; i++) {
    if (p.cum[i]! <= L) out.push(p.pts[i]!);
    else { out.push(at(p, L)); break; }
  }
  return out;
}

export const MAIN = mk(walk(O_W, [[90, 120], [A111, 150], [180 - A111, 170], [90, 90], [A111, 130], [180 - A111, 160], [90, 260]]));
/** side cracks sprouting from the nodes of the main crack: [node index, heading, length] */
export const BRANCH_DEF: [number, number, number][] = [
  [1, 180, 420], [2, 0, 540], [3, 180, 560], [4, 180 - A111, 340], [5, A111, 360], [6, 0, 380],
];
export const BRANCHES: { node: number; path: Path }[] = BRANCH_DEF.map(([n, deg, len]) => ({ node: n, path: mk(walk(MAIN.pts[n]!, [[deg, len]])) }));

// ------------------------------------------------------------------ timing
export const T_CRACK = 102.66;          // "cracks," (the sfx 'crack')
export const T_NUC = 101.40;            // the hairline starts to creep

/** length of the main crack at song time t */
export function mainLen(t: number): number {
  if (t < T_NUC) return 0;
  const creep = 124 * ease.inQuad(prog(t, T_NUC, T_CRACK));
  if (t < T_CRACK) return creep;
  return creep + (MAIN.total - creep) * ease.outQuart(prog(t, T_CRACK, T_CRACK + 0.34));
}
/** time the main crack passes length l */
export function timeAtLen(l: number): number {
  if (l <= 124) { let lo = T_NUC, hi = T_CRACK; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (mainLen(m) < l) lo = m; else hi = m; } return hi; }
  let lo = T_CRACK, hi = T_CRACK + 0.34;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (mainLen(m) < l) lo = m; else hi = m; }
  return hi;
}
export function branchLen(i: number, t: number): number {
  const b = BRANCHES[i]!;
  const t0 = timeAtLen(MAIN.cum[b.node]!) + 0.012 * i;
  const dur = 0.30;
  return b.path.total * ease.outCubic(prog(t, t0, t0 + dur));
}
/** how far the two halves have drawn apart (px, world) */
export function gapAt(t: number): number {
  return 20 * ease.outExpo(prog(t, T_CRACK + 0.04, T_CRACK + 0.7)) + 14 * prog(t, T_CRACK + 0.7, 104.6);
}

/** x of the main crack at the 24 sample rows y = -420 + 40 i (9999 where it has not reached or is gone) */
export function crackXSamples(t: number): number[] {
  const L = mainLen(t);
  const out: number[] = [];
  for (let i = 0; i < 24; i++) {
    const y = -420 + 40 * i;
    let x = 9999;
    if (L > 0) {
      const pts = upTo(MAIN, L);
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1]!, b = pts[k]!;
        if ((y >= a.y && y <= b.y) || (y >= b.y && y <= a.y)) { const u = (y - a.y) / Math.max(1e-6, b.y - a.y); x = a.x + (b.x - a.x) * u; break; }
      }
    }
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ the shield wafer map (pass dies lit)
export const shieldW = (y: number) => (y < 0 ? 300 : 300 * Math.pow(Math.max(1 - y / 330, 0), 0.75));
export const inShield = (x: number, y: number) => y > -315 && y < 330 && Math.abs(x) < shieldW(y);
/** the dies of the shield (centres, world px) */
export function shieldDies(): V2[] {
  const out: V2[] = [];
  for (let iy = -8; iy < 8; iy++) for (let ix = -8; ix < 8; ix++) {
    const cx = (ix + 0.5) * DIE.w, cy = (iy + 0.5) * DIE.h;
    if (Math.hypot(Math.abs(cx) + DIE.w / 2, Math.abs(cy) + DIE.h / 2) < WR - 8 && cy + DIE.h / 2 < FLAT_Y && inShield(cx, cy)) out.push({ x: cx, y: cy });
  }
  return out;
}

// ------------------------------------------------------------------ the blackout, on the beat
export const WAVE_T = [103.125, 103.3594, 103.5938, 103.8281, 104.0625];
export const WAVE_R = [170, 350, 520, 700, 1400];
/** front radius of the blackout (world px from O_W) at time t, and the radius the lights have switched on to */
export function deadR(t: number): number {
  let r = -100;
  for (let i = 0; i < 5; i++) r = Math.max(r, WAVE_R[i]! * ease.outCubic(prog(t, WAVE_T[i]!, WAVE_T[i]! + 0.22)) - (t < WAVE_T[i]! ? 1000 : 0));
  return r;
}
export const onR = (t: number) => 1500 * ease.outCubic(prog(t, 101.34, 102.55));
