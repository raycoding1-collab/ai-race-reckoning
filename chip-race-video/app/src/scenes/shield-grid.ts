// The wafer map shared by key (its last frame), shield and fab (its first frame): geometry of the die grid, the
// heraldic shield mask, and the static drawing of the bare wafer.
import { hash, TAU } from '../engine/util';

export const WAFER = { cx: 960, cy: 540, R: 400, dx: 36, dy: 44 };
/** Shield bounding box on the wafer (px): centred horizontally, hanging from the top edge y0. */
export const SHIELD = { half: 216, y0: 540 - 308, h: 616 };

export interface Die { i: number; j: number; x: number; y: number; inside: boolean; shield: boolean; cross: boolean; fail: boolean }

/** Half width of the heater shield at v in 0..1 (0 = top edge, 1 = the point), in 0..1 of SHIELD.half. */
export function shieldHalfWidth(v: number): number {
  if (v < 0 || v > 1) return 0;
  if (v <= 0.40) return 1.0;
  const k = (v - 0.40) / 0.60;
  return Math.pow(Math.max(0, 1 - Math.pow(k, 1.75)), 0.62);
}
export function inShield(x: number, y: number): boolean {
  const u = (x - WAFER.cx) / SHIELD.half, v = (y - SHIELD.y0) / SHIELD.h;
  return Math.abs(u) <= shieldHalfWidth(v);
}

let DIES: Die[] | null = null;
/** All dies of the wafer (full dies inside the usable circle), row-major from the top. Deterministic. */
export function dies(): Die[] {
  if (DIES) return DIES;
  const out: Die[] = [];
  const cols = Math.ceil((WAFER.R * 2) / WAFER.dx) + 2, rows = Math.ceil((WAFER.R * 2) / WAFER.dy) + 2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = WAFER.cx + (i - (cols - 1) / 2) * WAFER.dx, y = WAFER.cy + (j - (rows - 1) / 2) * WAFER.dy;
    // the die must sit entirely inside the usable circle (edge exclusion)
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => Math.hypot(x + a! * (WAFER.dx / 2 - 2) - WAFER.cx, y + b! * (WAFER.dy / 2 - 2) - WAFER.cy));
    const inside = Math.max(...corners) < WAFER.R - 10;
    if (!inside) continue;
    const sh = inShield(x, y);
    // the cross of the shield: a vertical pale and a horizontal fess
    const u = (x - WAFER.cx) / SHIELD.half, v = (y - SHIELD.y0) / SHIELD.h;
    const cross = sh && (Math.abs(u) < 0.13 || Math.abs(v - 0.33) < 0.085);
    out.push({ i, j, x, y, inside: true, shield: sh, cross, fail: !sh });
  }
  DIES = out;
  return out;
}

/** Wafer outline path (circle with a notch at the bottom). */
export function waferPath(c: CanvasRenderingContext2D, cx = WAFER.cx, cy = WAFER.cy, R = WAFER.R) {
  const n = 0.045;
  c.beginPath();
  c.arc(cx, cy, R, Math.PI / 2 + n, Math.PI / 2 - n + TAU);
  c.lineTo(cx, cy + R * 0.975);
  c.closePath();
}

/** The bare wafer: a dark disc, a bone rim, the die grid as hairlines. alpha scales the whole drawing. */
export function drawWaferStatic(c: CanvasRenderingContext2D, alpha = 1, cx = WAFER.cx, cy = WAFER.cy, R = WAFER.R) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(cx, cy); c.scale(R / WAFER.R, R / WAFER.R); c.translate(-WAFER.cx, -WAFER.cy);
  const g = c.createRadialGradient(WAFER.cx - 120, WAFER.cy - 150, 30, WAFER.cx, WAFER.cy, WAFER.R);
  g.addColorStop(0, '#26262a'); g.addColorStop(0.7, '#17171a'); g.addColorStop(1, '#101012');
  waferPath(c, WAFER.cx, WAFER.cy, WAFER.R); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(238,233,223,0.85)'; c.lineWidth = 2.2; waferPath(c, WAFER.cx, WAFER.cy, WAFER.R); c.stroke();
  c.strokeStyle = 'rgba(238,233,223,0.22)'; c.lineWidth = 1; waferPath(c, WAFER.cx, WAFER.cy, WAFER.R - 9); c.stroke();
  c.strokeStyle = 'rgba(158,152,143,0.38)'; c.lineWidth = 1;
  for (const d of dies()) c.strokeRect(d.x - WAFER.dx / 2 + 1.5, d.y - WAFER.dy / 2 + 1.5, WAFER.dx - 3, WAFER.dy - 3);
  c.restore();
}
