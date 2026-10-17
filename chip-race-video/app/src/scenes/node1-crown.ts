// The crown of node1 as a set of lit transistor cells (a cell = 3 fins x 1 gate), shared with grid1,
// whose first frame turns these lit cells into the lights of a town at night.
import { hash } from '../engine/util';

export const CELL_PX = 48; // screen px per cell at the top-down end of node1 (cell = 3 world units)
export const CROWN_HALF = 520; // half width of the crown in px
export interface CrownCell { i: number; j: number; order: number; band: boolean; peak: boolean }

// normalised crown outline (x -1..1, y up), five points, base band
const POLY: [number, number][] = [
  [-1, -0.7], [-1, 0.5], [-0.75, 0.12], [-0.5, 0.5], [-0.25, 0.12], [0, 0.78], [0.25, 0.12], [0.5, 0.5], [0.75, 0.12], [1, 0.5], [1, -0.7],
];
function inside(x: number, y: number): boolean {
  let c = false;
  for (let a = 0, b = POLY.length - 1; a < POLY.length; b = a++) {
    const [xa, ya] = POLY[a]!, [xb, yb] = POLY[b]!;
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
  }
  return c;
}
let cache: CrownCell[] | null = null;
/** Lit cells; (i,j) are cell indices from the screen centre (j up), px offset = (i, -j) * CELL_PX. */
export function crownCells(): CrownCell[] {
  if (cache) return cache;
  const out: CrownCell[] = [];
  for (let j = -12; j <= 12; j++) for (let i = -14; i <= 14; i++) {
    const nx = (i * CELL_PX) / CROWN_HALF, ny = (j * CELL_PX) / CROWN_HALF;
    if (inside(nx, ny)) out.push({ i, j, order: 0, band: ny < -0.35, peak: ny > 0.4 });
  }
  out.sort((a, b) => a.j - b.j || hash(a.i, a.j) - hash(b.i, b.j));
  out.forEach((c, k) => (c.order = k / out.length));
  cache = out;
  return out;
}
