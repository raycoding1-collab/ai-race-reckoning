// down2 + post2: the dashboard (engraved speedometer, odometer rolling transistor counts, side gauges, warning
// lamps, pedals). One pure function of t so that post2 can redraw the exact last frame of down2 as its first.
import { clamp, ease, lerp, prog, springStep, pulse, TAU, hash } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, karaokeWord, drawDial, stepped, DIAL_A0, DIAL_SWEEP } from './node2-kit';
import { drawTPP } from './_motifs';
import type { Word } from '../engine/lyrics';

export const DASH = { cx: 960, cy: 600, R: 380 };
export const T_STUT0 = 85.7812, T_END = 86.25;
export const T_DOWN = 84.84;
export const GRID2_END_FRAC = 0.88;

/** Stutter edit: during the audio's stutter window the picture repeats the last 1/16 note. */
export function dashTime(t: number): number {
  if (t < T_STUT0) return t;
  const p = 60 / 128 / 4;
  return T_STUT0 + ((t - T_STUT0) % p);
}

export function dashFrac(t: number): number {
  // climbs from the grid2 pin through the red zone to the stop on "silicon"; slams past it on "down"
  let f = lerp(GRID2_END_FRAC, 0.97, ease.inQuad(prog(t, 82.5, 84.14)));
  f += 0.04 * ease.outQuad(prog(t, 84.14, 84.84));
  if (t > T_DOWN) f = 1.0 + 0.045 * springStep(t - T_DOWN, 4.2, 0.28) - 0.035 * ease.outQuad(prog(t, T_DOWN + 0.4, T_DOWN + 1.0));
  return f;
}

/** Transistors counter (rolls up fast and accelerating). */
export function dashCount(t: number): number {
  const k = ease.inQuad(prog(t, 82.5, T_DOWN));
  return 80e9 + (208e9 - 80e9) * k + 6e9 * prog(t, T_DOWN, 85.78) * 0.0;
}

export interface DashIn { words: Word[]; tpp: number; kick: number }

export function drawDash(c: CanvasRenderingContext2D, tRaw: number, o: DashIn) {
  const t = dashTime(tRaw);
  const { cx, cy, R } = DASH;
  const inK = ease.outExpo(prog(t, 82.52, 82.98));
  const frac = dashFrac(t);
  const pre = prog(t, 82.5, T_DOWN);
  const shakeDeg = 3.3 + 8 * ease.inQuad(prog(t, 82.5, T_DOWN)) + (t > T_DOWN ? 4 * pulse(t, T_DOWN, 0.2) : 0);
  const rumble = (0.4 + 5.5 * ease.inQuad(pre)) * (t > T_DOWN ? 1.5 : 1);
  const fi = Math.round(t * 60);
  const jx = (hash(fi, 1) - 0.5) * 2 * rumble, jy = (hash(fi, 2) - 0.5) * 2 * rumble;
  c.save();
  c.translate(jx, jy);
  c.lineCap = 'round';
  // ---- panel engraving: a bezel arc behind the dial and guilloche hairlines
  c.strokeStyle = rgbaS(C.bone, 0.06); c.lineWidth = 1;
  for (let i = 0; i < 46; i++) { c.beginPath(); c.arc(cx, cy, R * 1.12 + i * 11 * inK, Math.PI * 0.9, Math.PI * 2.1); c.stroke(); }
  // ---- side gauges
  const sideR = 140;
  const lx = lerp(-260, 330, inK), rx = lerp(1920 + 260, 1590, inK);
  const gyc = 470;
  drawDial(c, lx, gyc, sideR, {
    frac: 0.35 + 0.55 * ease.inQuad(pre) + 0.02 * Math.sin(t * 40), labelsA: ['0', '25', '50', '75', '100'], titleA: 'JUNCTION °C', redFrom: 0.75,
    shakeDeg: 1 + 2 * pre, t, minor: 4,
  });
  drawDial(c, rx, gyc, sideR, {
    frac: clamp(o.tpp / 20000 * 0.9 + 0.05) + 0.01 * Math.sin(t * 33), labelsA: ['0', '5', '10', '15', '20'], titleA: 'TPP ×1000', redFrom: 0.24,
    shakeDeg: 0.8 + 1.5 * pre, t, minor: 4,
  });
  // ---- warning lamps
  const lamps = ['FAB', 'THERMAL', 'GRID', 'HBM', 'EXPORT', 'TPP'];
  c.textBaseline = 'middle';
  for (let i = 0; i < lamps.length; i++) {
    const side = i < 3 ? -1 : 1, row = i % 3;
    const x = (side < 0 ? 96 : 1824 - 150) + 0;
    const y = 238 + row * 0 + (i % 3) * 0;
    const lx2 = side < 0 ? 96 + row * 124 : 1824 - 114 - (2 - row) * 124 + 0;
    const on = t > 82.9 + i * 0.12 && (Math.sin(t * 7 + i * 1.7) > -0.2 || t > 84.2);
    const a = inK;
    c.globalAlpha = a;
    c.fillStyle = on ? rgbaS(C.signal, 0.95) : rgbaS(C.graphite, 0.35);
    c.fillRect(lx2, 238 - 30 + 0, 112, 40);
    c.strokeStyle = rgbaS(C.bone, 0.5); c.lineWidth = 1.5; c.strokeRect(lx2, 208, 112, 40);
    c.font = font(F.mono(600), 15); c.letterSpacing = '2px'; c.textAlign = 'center';
    c.fillStyle = on ? C.ink : rgbaS(C.bone, 0.5);
    c.fillText(lamps[i]!, lx2 + 56, 229);
    c.letterSpacing = '0px'; c.textAlign = 'left';
    void x; void y;
  }
  c.globalAlpha = 1;
  // ---- pedals (accelerator pressed, brake snaps off on "down")
  const py = lerp(1300, 0, inK);
  c.save(); c.translate(0, py);
  pedal(c, 250, 880, 1, 0.5 + 0.5 * pre, t, false);
  pedal(c, 1670, 880, 1, 0, t, true);
  c.restore();
  // ---- the main dial
  const flip = prog(t, 82.55, 82.95);
  drawDial(c, cx, cy, R, {
    frac, labelsA: ['0', '0.3', '0.6', '0.9', '1.2', '1.5'], labelsB: ['0', '50', '100', '150', '200', '250'], flip,
    titleA: 'SITE LOAD · GW', titleB: 'TRANSISTORS / CHIP · ×10⁹', redFrom: 0.8, shakeDeg, t, hubGlow: 1, minor: 4,
  });
  // numeric readout inside the dial (billions)
  const v = Math.min(260, frac * 250);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = font(F.mono(600), 44); c.fillStyle = frac >= 0.8 ? C.signal : C.bone;
  c.font = font(F.mono(600), 58);
  if (flip > 0.55) c.fillText(`${Math.round(v)} B`, cx, cy - 168);
  c.textAlign = 'left';
  // ---- odometer (rolling drum wheels) in the lower face
  odometer(c, cx, cy + 238, dashCount(t), t, flip);
  // ---- lyric row at the top
  const fam = F.archivo(100, 900);
  const full = o.words.slice(0, 4).map((w) => w.w.toUpperCase()).join('  ');
  const sz = Math.min(110, fitSize(full, fam, 1640));
  let x = 96;
  for (let i = 0; i < 4; i++) {
    const w = o.words[i]!;
    x += karaokeWord(c, w, t, x, 168, fam, sz, { dim: rgbaS(C.bone, 0.2), settled: C.bone, slam: 0.07 }) + sz * 0.3;
  }
  // ---- the glass cracks where the needle is pinned (after "down", on the down_flip sfx)
  if (t >= 85.34) {
    const ck = ease.outExpo(prog(t, 85.34, 85.62));
    const a0 = (DIAL_A0 + DIAL_SWEEP * 1.0) * Math.PI / 180;
    const tx = cx + Math.cos(a0) * R * 0.86, ty = cy + Math.sin(a0) * R * 0.86;
    c.strokeStyle = rgbaS(C.bone, 0.9); c.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      const base = -2.4 + i * 0.52 + (hash(i, 5) - 0.5) * 0.3;
      let px = tx, py = ty; c.beginPath(); c.moveTo(px, py);
      const L = (160 + 380 * hash(i, 6)) * ck;
      for (let s2 = 1; s2 <= 6; s2++) {
        const a = base + (hash(i, s2 + 20) - 0.5) * 0.7;
        px += Math.cos(a) * L / 6; py += Math.sin(a) * L / 6; c.lineTo(px, py);
      }
      c.stroke();
    }
  }
  // ---- dim the dashboard so the word can take the frame
  const dk = ease.outQuad(prog(t, T_DOWN, T_DOWN + 0.2));
  c.fillStyle = `rgba(10,10,11,${0.62 * dk})`; c.fillRect(-40, -40, 2000, 1160);
  // ---- DOWN: stamped across the frame, flipping 180 degrees about the horizontal axis
  const dw = o.words[4]!;
  if (t >= dw.start - 0.02) {
    const k = prog(t, dw.start, dw.start + 0.5, ease.outBack);
    const dfam = F.archivo(125, 900);
    const dsz = Math.min(560, fitSize('DOWN', dfam, 1560));
    const push = 1 + 0.05 * prog(t, dw.start + 0.5, 85.78, ease.linear);
    c.save();
    c.translate(cx, 560);
    const ang = lerp(Math.PI, 0, Math.min(1, k));
    const sy = Math.cos(ang);
    c.scale(push, push * (Math.abs(sy) < 0.02 ? 0.02 : sy));
    c.font = font(dfam, dsz);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const wob = 1 + 0.06 * pulse(t, dw.start + 0.5, 0.08);
    c.scale(wob, wob);
    c.fillStyle = k > 0.5 ? C.bone : C.signal;
    c.fillText('DOWN', 0, dsz * 0.35);
    c.restore();
  }
  // TPP meter
  drawTPP(c, 96, 770, o.tpp, { width: 260 });
  c.restore();
}

function pedal(c: CanvasRenderingContext2D, x: number, y: number, _s: number, press: number, t: number, brake: boolean) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = rgbaS(C.bone, 0.9); c.lineWidth = 3; c.fillStyle = C.ink2;
  const lever = (px: number, py: number) => { c.beginPath(); c.moveTo(-60, -240); c.lineTo(px, py); c.stroke(); };
  const snap = brake && t >= T_DOWN;
  const dt = Math.max(0, t - T_DOWN);
  const padRot = brake ? 0 : -press * 0.35;
  // lever arm
  c.lineWidth = 12; c.strokeStyle = rgbaS(C.graphite, 0.95);
  c.beginPath(); c.moveTo(-60, -240); c.lineTo(0, snap ? -30 : 0); c.stroke();
  if (snap) {
    // broken stub: jagged end
    c.strokeStyle = rgbaS(C.bone, 0.9); c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, -40); c.lineTo(4, -28); c.lineTo(-4, -22); c.lineTo(10, -14); c.stroke();
  }
  // pad
  c.save();
  if (snap) {
    const vx = -180, vy = -980, g = 2300;
    c.translate(vx * dt, vy * dt + 0.5 * g * dt * dt);
    c.rotate(-7 * dt);
  } else c.rotate(padRot);
  c.fillStyle = C.ink2; c.strokeStyle = rgbaS(C.bone, 0.95); c.lineWidth = 3;
  c.beginPath(); c.rect(-62, 0, 124, 190); c.fill(); c.stroke();
  // grip ribs (engraved)
  c.lineWidth = 1.5; c.strokeStyle = rgbaS(C.bone, 0.45);
  for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo(-50, i * 19); c.lineTo(50, i * 19); c.stroke(); }
  c.restore();
  c.font = font(F.mono(600), 15); c.letterSpacing = '3px'; c.textAlign = 'center'; c.fillStyle = rgbaS(C.bone, 0.6);
  c.fillText(brake ? 'BRAKE' : 'THROTTLE', 0, 230);
  void lever;
  c.restore();
}

function odometer(c: CanvasRenderingContext2D, cx: number, cy: number, v: number, t: number, flip: number) {
  const nd = 12, dw = 30, dh = 54, gap = 3;
  const total = nd * dw + 3 * 10 + (nd - 1) * gap;
  const x0 = cx - total / 2;
  c.save();
  c.fillStyle = '#050506'; c.strokeStyle = rgbaS(C.bone, 0.85); c.lineWidth = 2.5;
  c.beginPath(); c.rect(x0 - 12, cy - dh / 2 - 8, total + 24, dh + 16); c.fill(); c.stroke();
  c.font = font(F.mono(600), 40); c.textAlign = 'center'; c.textBaseline = 'middle';
  let x = x0;
  for (let k = nd - 1; k >= 0; k--) {
    // wheel k (0 = units)
    const q = v / Math.pow(10, k);
    const d = Math.floor(q) % 10, fr = q - Math.floor(q);
    const rolling = k < 9; // top wheels only roll on carries (shown steady)
    c.save();
    c.beginPath(); c.rect(x, cy - dh / 2, dw, dh); c.clip();
    const blur = k <= 3;
    if (blur) {
      c.fillStyle = rgbaS(C.ember, 0.55);
      c.fillRect(x + 3, cy - 18, dw - 6, 36);
      c.fillStyle = rgbaS(C.ink, 0.5);
      for (let i = -2; i <= 2; i++) c.fillRect(x + 3, cy + i * 9 + ((t * 600 + k * 17) % 9), dw - 6, 2);
    } else {
      const off = (rolling ? fr : 0);
      for (let j = 0; j <= 1; j++) {
        const dd = (d + j) % 10;
        c.fillStyle = k >= 9 ? C.bone : C.ember;
        c.fillText(String(dd), x + dw / 2, cy + (j - off) * dh + 2);
      }
    }
    c.restore();
    c.strokeStyle = rgbaS(C.bone, 0.3); c.lineWidth = 1; c.strokeRect(x, cy - dh / 2, dw, dh);
    x += dw + gap;
    if (k % 3 === 0 && k > 0) { c.fillStyle = rgbaS(C.bone, 0.7); c.font = font(F.mono(600), 30); c.fillText(',', x + 3, cy + 14); c.font = font(F.mono(600), 40); x += 10; }
  }
  c.font = font(F.mono(500), 12); c.letterSpacing = '3px'; c.fillStyle = rgbaS(C.bone, 0.55);
  c.fillText('TRANSISTORS ON DIE', cx, cy + dh / 2 + 24);
  c.restore();
  void flip; void TAU; void DIAL_A0; void DIAL_SWEEP; void stepped;
}
