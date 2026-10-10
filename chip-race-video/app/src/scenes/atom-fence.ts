// The border of atoms that `atom` builds one by one; shared so `dream` can open on the finished lattice.
import { clamp, mulberry32 } from '../engine/util';
import { LAT, siteX, siteY, splat } from './atom-kit';

export interface Move { r: number; c: number; sx: number; sy: number; dx: number; dy: number; src: number }

/** 14 moves down the lattice: a random walk of columns, each atom hopping into the hollow SE of its site. */
export function fenceMoves(amp: Float32Array): Move[] {
  const rnd = mulberry32(21);
  const out: Move[] = [];
  let c = 15;
  for (let r = 0; r < 14; r++) {
    const a = amp[r * LAT.cols + c]!;
    out.push({ r, c, sx: siteX(c), sy: siteY(r), dx: siteX(c) + LAT.pitch / 2, dy: siteY(r) + LAT.pitch / 2, src: a });
    const s = rnd();
    c = clamp(c + (s < 0.3 ? -1 : s > 0.7 ? 1 : 0), 12, 19);
  }
  return out;
}

/** Apply all moves to a height array (vacate the source, add the atom at its destination). */
export function applyFence(data: Float32Array, _amp: Float32Array, moves: Move[]) {
  for (const m of moves) { splat(data, m.sx, m.sy, -m.src); splat(data, m.dx, m.dy, 1.4); }
}
