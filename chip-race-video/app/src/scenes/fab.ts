// fab (bars 36-37.75, "And nobody sleeps in the fab tonight"): the cleanroom at night, seen through a window wall.
// The shield's lit dies become the window panes (same lattice, same cells); the panes light up outward, an
// amber cleanroom runs away behind them (tool bays, ceiling troffers, hanging shift clocks racing), reflections
// slide over the glass, and the camera pushes through the lattice into the aisle. At 70.25 the tape stops: the
// motion decays, the picture collapses to a line and goes black (70.78-71.25 is the inhale before the drop).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F } from '../engine/type';
import { clamp, ease, hash, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene } from './_motifs';
import { drawRow, drawSegText, mono } from './hbm-kit';
import { dies, inShield, WAFER } from './shield-grid';
import type { Word } from '../engine/lyrics';

const T0 = 67.5, T_STOP = 70.25, T_BLACK = 70.78, W = 1920, H = 1080;
const FX = 960, FY = 500; // push-through focus: inside the shield
const AM = (a: number) => `rgba(255,164,27,${a})`;
const YL = (a: number) => `rgba(255,214,110,${a})`;

/** warped clock: runs with t, then the tape stops (decelerates to a halt by T_BLACK) */
function tape(t: number): number {
  if (t <= T_STOP) return t;
  const D = T_BLACK - T_STOP, u = clamp((t - T_STOP) / D);
  return T_STOP + (D * (1 - Math.pow(1 - u, 3))) / 3;
}

export default class Fab extends Scene {
  text = new Layer2D();
  words: Word[] = [];
  d0 = dies()[0]!;

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'fab').words;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    clearRT(renderer, out, LIN.ink);
    if (t >= T_BLACK) return { bloom: 0, fade: 1, vignette: 0 };
    const c = this.text.ctx;
    this.text.clear();
    const tau = tape(t);
    const x = tau - T0;
    const u = prog(tau, T0 + 0.3, 70.05);
    const S = Math.exp(4.4 * Math.pow(u, 2.2));
    const rumble = 0.4 + 6 * ease.inQuad(prog(t, T0, T_STOP));
    const cross = pulse(t, 69.76, 0.12);

    // squeeze to a line on the tape stop
    const sq = 1 - 0.985 * ease.inExpo(prog(t, 70.5, T_BLACK));
    c.save();
    c.translate(0, H / 2); c.scale(1, sq); c.translate(0, -H / 2);

    // ---- glass lattice (the die grid at S = 1), lit cells
    const dx = WAFER.dx, dy = WAFER.dy, d0 = this.d0;
    const cells: { x: number; y: number; w: number; h: number; wash: number; lit: boolean }[] = [];
    if (S < 70) {
      const xa = FX + (0 - FX) / S, xb = FX + (W - FX) / S, ya = FY + (0 - FY) / S, yb = FY + (H - FY) / S;
      const ci0 = Math.floor((xa - d0.x) / dx) - 1, ci1 = Math.ceil((xb - d0.x) / dx) + 1;
      const cj0 = Math.floor((ya - d0.y) / dy) - 1, cj1 = Math.ceil((yb - d0.y) / dy) + 1;
      for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
        const px = d0.x + ci * dx, py = d0.y + cj * dy;
        let lit: boolean, wash = 0;
        if (inShield(px, py) && Math.hypot(px - WAFER.cx, py - WAFER.cy) < WAFER.R - 10) { lit = true; wash = Math.exp(-(tau - T0) / 0.5); }
        else {
          const dist = Math.hypot(px - 960, py - 420);
          const tl = T0 + 0.12 + 1.15 * clamp(dist / 1150) + hash(ci, cj, 1) * 0.45;
          const dead = hash(ci, cj, 3) < 0.1;
          lit = t >= tl && (!dead || Math.sin(t * 23 + hash(ci, cj, 4) * 40) > 0.6);
          wash = lit ? Math.exp(-(t - tl) / 0.14) : 0;
        }
        if (!lit) continue;
        const sx = FX + S * (px - dx / 2 + 1.5 - FX), sy = FY + S * (py - dy / 2 + 1.5 - FY);
        cells.push({ x: sx, y: sy, w: S * (dx - 3), h: S * (dy - 3), wash, lit });
      }
    }

    // ---- interior through the panes (one clip over all lit cells; no lattice once we are through)
    c.save();
    if (S < 70) {
      c.beginPath();
      for (const q of cells) c.rect(q.x, q.y, q.w, q.h);
      c.clip();
    }
    const reveal = smoothstep(T0 + 0.05, T0 + 0.7, t);
    this.interior(c, tau, x, t, kick);
    if (reveal < 1 && S < 70) { c.fillStyle = `rgba(255,194,74,${0.93 * (1 - reveal)})`; c.fillRect(0, 0, W, H); }
    // glass reflections: slanted bands sliding across, and a faint ceiling-light double
    const ra = 0.1 * (1 - smoothstep(6, 60, S)) + 0.05 + 0.2 * cross;
    for (let k = 0; k < 4; k++) {
      const bx = ((tau * (230 + 70 * k) + k * 610) % 2800) - 500;
      const wd = 60 + 70 * hash(k, 9);
      const g = c.createLinearGradient(bx, 0, bx + wd, 0);
      g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(0.5, `rgba(255,240,210,${ra})`); g.addColorStop(1, 'rgba(255,240,210,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(bx + 380, 0); c.lineTo(bx + 380 + wd, 0); c.lineTo(bx + wd, H); c.lineTo(bx, H); c.closePath(); c.fill();
    }
    c.restore();

    // ---- pane washes, mullion cross, rim
    if (S < 70) {
      const rim = Math.max(1, 1.2 * Math.sqrt(S));
      c.lineWidth = rim; c.strokeStyle = YL(0.55 * (1 - smoothstep(10, 60, S)));
      c.beginPath();
      for (const q of cells) c.rect(q.x, q.y, q.w, q.h);
      c.stroke();
      const cr = (1 - reveal) * 0.6 + 0.16 * (1 - smoothstep(4, 30, S));
      c.fillStyle = `rgba(10,10,11,${cr})`;
      for (const q of cells) {
        if (q.wash > 0.02) { c.fillStyle = `rgba(255,214,110,${0.8 * q.wash})`; c.fillRect(q.x, q.y, q.w, q.h); c.fillStyle = `rgba(10,10,11,${cr})`; }
        const th = Math.max(1.5, 2 * S);
        c.fillRect(q.x + q.w / 2 - th / 2, q.y, th, q.h); c.fillRect(q.x, q.y + q.h / 2 - th / 2, q.w, th);
      }
    }
    c.restore();

    // ---- bottom scrim, lyric, HUD (screen space)
    const gr = c.createLinearGradient(0, 760, 0, H);
    gr.addColorStop(0, 'rgba(10,10,11,0)'); gr.addColorStop(1, 'rgba(10,10,11,0.82)');
    c.save(); c.globalAlpha = sq > 0.5 ? 1 : sq * 2; c.fillStyle = gr; c.fillRect(0, 760, W, 320);
    const o = { size: 92, family: F.archivo(87.5, 900), slam: 0.2, slide: 22 };
    drawRow(c, this.words.slice(0, 3), t, 96, 900, o);
    drawRow(c, this.words.slice(3), t, 96, 1008, o);
    c.restore();

    const ha = smoothstep(T0 + 0.5, T0 + 1.0, t) * (1 - smoothstep(70.3, 70.55, t));
    if (ha > 0) {
      c.save(); c.globalAlpha = ha;
      mono(c, 'NIGHT SHIFT · BAY 07 · ISO 1', 64, 78, 17, YL(0.8), 600, 'left', 2.5);
      mono(c, 'TOOLS RUNNING', 64, 108, 14, rgba('bone', 0.45), 500, 'left', 2);
      const secs = 22 * 3600 + 47 * 60 + x * 1500;
      const hh = Math.floor(secs / 3600) % 24, mm = Math.floor(secs / 60) % 60, ss = Math.floor(secs) % 60;
      const p2 = (n: number) => String(n).padStart(2, '0');
      drawSegText(c, `${p2(hh)}:${p2(mm)}:${p2(ss)}`, 1420, 46, 62, AM(0.95), AM(0.1));
      mono(c, 'SHIFT C · NO HANDOVER', 1420, 128, 14, rgba('bone', 0.45), 500, 'left', 2);
      mono(c, `WIP ${Math.round(4800 + 1800 * x + 40 * Math.sin(t * 9)).toLocaleString('en-US')} WAFERS`, 1420, 152, 15, YL(0.8), 600, 'left', 1.5);
      c.restore();
    }
    // riser: an amber hairline growing across the top, thicker as it nears the stop
    const rp = prog(t, T0, T_STOP, ease.inQuad);
    c.fillStyle = AM(0.95); c.fillRect(0, 0, W * rp, 3 + 5 * rp);
    // the collapse line
    if (sq < 0.5) { c.fillStyle = `rgba(255,236,190,${0.9 * (1 - smoothstep(70.7, T_BLACK, t))})`; c.fillRect(W / 2 - W * 0.45 * sq * 2, H / 2 - 1.5, W * 0.9 * sq * 2, 3); }

    comp.draw(renderer, this.text.upload(), out);
    const sh = rumble + 14 * cross;
    return {
      bloom: 0.8 + 0.6 * cross, bloomThreshold: 0.78, halation: 0.18, vignette: 0.45 + 0.3 * smoothstep(70.2, T_BLACK, t),
      shake: [Math.sin(t * 190) * sh, Math.cos(t * 170) * sh] as [number, number],
      zoom: 1 + 0.01 * kick + 0.05 * cross, ca: 0.9 + 1.4 * x / 3 + 5 * cross + 4 * smoothstep(T_STOP, T_BLACK, t),
      flash: 0.35 * cross, fade: ease.inQuad(prog(t, 70.6, T_BLACK)),
    };
  }

  /** the cleanroom aisle in perspective, camera pushing forward */
  private interior(c: CanvasRenderingContext2D, tau: number, x: number, t: number, kick: number) {
    const zc = 2 * x + 1.7 * x * x;
    const vx = 960 + 26 * Math.sin(tau * 1.3), vy = 500 + 8 * Math.sin(tau * 2.1);
    const Fo = 1100;
    const P = (X: number, Y: number, Z: number): [number, number] => { const s = Fo / (Z - zc); return [vx + X * s, vy + Y * s]; };
    const poly = (pts: [number, number][], fill: string) => { c.fillStyle = fill; c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill(); };
    // ground + horizon glow
    c.fillStyle = '#0c0a07'; c.fillRect(0, 0, W, H);
    const hg = c.createRadialGradient(vx, vy, 10, vx, vy, 900);
    hg.addColorStop(0, 'rgba(255,200,90,0.55)'); hg.addColorStop(0.35, 'rgba(255,150,30,0.18)'); hg.addColorStop(1, 'rgba(255,150,30,0)');
    c.fillStyle = hg; c.fillRect(0, 0, W, H);
    const fl = c.createLinearGradient(0, vy, 0, H);
    fl.addColorStop(0, 'rgba(255,170,50,0.22)'); fl.addColorStop(1, 'rgba(30,22,10,0.9)');
    c.fillStyle = fl; c.fillRect(0, vy, W, H - vy);

    const SP = 6, i1 = Math.floor((zc + 120) / SP), i0 = Math.ceil((zc + 1.4) / SP);
    const flick = (i: number) => (Math.sin(tau * (9 + 30 * clamp(x / 3)) + i * 7.1) > 0.8 - 1.6 * (1 - clamp(x / 3)) * 0 ? 0.75 : 1);
    for (let i = i1; i >= i0; i--) {
      const z = i * SP, dz = z - zc;
      const fog = Math.pow(clamp(1 - dz / 115), 1.4);
      if (fog <= 0.003) continue;
      c.globalAlpha = fog;
      const dep = 3.6;
      for (const sgn of [-1, 1]) {
        const xi = 2.8 * sgn, xo = 7.5 * sgn, y0 = -0.2, y1 = 1.7;
        // top face (lit by troffers), inner side face, front face
        poly([P(xi, y0, z), P(xo, y0, z), P(xo, y0, z + dep), P(xi, y0, z + dep)], 'rgba(150,120,60,0.9)');
        poly([P(xi, y0, z), P(xi, y0, z + dep), P(xi, y1, z + dep), P(xi, y1, z)], `rgba(58,50,36,1)`);
        // amber control panel + screen + LEDs
        poly([P(xi, 0.15, z + 0.4), P(xi, 0.15, z + 3.2), P(xi, 1.0, z + 3.2), P(xi, 1.0, z + 0.4)], AM(0.35 + 0.35 * hash(i, sgn, 1)));
        const on = hash(i, sgn, 2) > 0.45;
        poly([P(xi, 0.28, z + 0.7), P(xi, 0.28, z + 1.9), P(xi, 0.82, z + 1.9), P(xi, 0.82, z + 0.7)], on ? YL(0.95) : 'rgba(20,16,10,0.9)');
        for (let k = 0; k < 3; k++) {
          const [lx, ly] = P(xi, 0.05, z + 2.3 + k * 0.3), r = Math.max(1, 0.07 * Fo / dz);
          c.fillStyle = k === 0 && Math.sin(tau * 12 + i) > 0 ? 'rgba(224,49,43,1)' : AM(0.95);
          c.beginPath(); c.arc(lx, ly, r, 0, 6.3); c.fill();
        }
        poly([P(xi, y0, z), P(xo, y0, z), P(xo, y1, z), P(xi, y1, z)], 'rgba(30,26,18,1)');
        // floor reflection of the panel
        poly([P(xi, y1, z + 0.4), P(xi, y1, z + 3.2), P(xi - 0.5 * sgn, y1, z + 3.2), P(xi - 0.5 * sgn, y1, z + 0.4)], AM(0.14));
      }
      // ceiling troffer and its floor reflection
      const fa = flick(i);
      poly([P(-1.3, -2.3, z + 0.3), P(1.3, -2.3, z + 0.3), P(1.3, -2.3, z + 2.9), P(-1.3, -2.3, z + 2.9)], `rgba(255,236,170,${fa})`);
      poly([P(-1.3, 1.7, z + 0.3), P(1.3, 1.7, z + 0.3), P(1.3, 1.7, z + 2.9), P(-1.3, 1.7, z + 2.9)], `rgba(255,214,110,${0.2 * fa})`);
      // floor lane marks
      poly([P(1.35, 1.7, z), P(1.5, 1.7, z), P(1.5, 1.7, z + 3), P(1.35, 1.7, z + 3)], YL(0.65));
      poly([P(-1.5, 1.7, z), P(-1.35, 1.7, z), P(-1.35, 1.7, z + 3), P(-1.5, 1.7, z + 3)], YL(0.65));
      // hanging shift clock every third bay
      if (i % 3 === 0 && dz > 1.8) {
        const zz = z + 1.8, s = Fo / (zz - zc), [px, py] = P(0, -1.75, zz);
        const secs = 22 * 3600 + 47 * 60 + x * 1500 + i * 17, hh = Math.floor(secs / 3600) % 24, mm = Math.floor(secs / 60) % 60, ss = Math.floor(secs) % 60;
        const str = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        const h = 0.34 * s, w = 4.9 * h;
        c.fillStyle = 'rgba(8,7,5,0.95)'; c.fillRect(px - w / 2 - h * 0.3, py - h * 0.35, w + h * 0.6, h * 1.7);
        c.strokeStyle = AM(0.8); c.lineWidth = Math.max(1, h * 0.05); c.strokeRect(px - w / 2 - h * 0.3, py - h * 0.35, w + h * 0.6, h * 1.7);
        drawSegText(c, str, px - w / 2, py, h, AM(1), AM(0.1));
        c.fillStyle = 'rgba(90,80,60,1)'; c.fillRect(px - 1, P(0, -2.3, zz)[1], 2, py - h * 0.35 - P(0, -2.3, zz)[1]);
      }
    }
    c.globalAlpha = 1;
    // kick: troffers pulse brighter at the vanishing point
    c.fillStyle = `rgba(255,214,110,${0.1 * kick})`; c.fillRect(0, 0, W, H);
    void t;
  }
}
