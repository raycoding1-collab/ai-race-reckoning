// down1 (chorus 1, "Nobody's slowing the silicon down"): a LOG CHART AS A RACE. A bone-paper chart of transistors per
// chip (log y, 1971-2026); the amber beam rides the curve like a racing line while the camera tracks it low and close.
// The lyric is set along the curve, karaoke-timed. On "down" the curve goes vertical and breaks through the chart's
// top border; DOWN flips 180 degrees; what is left is one vertical line down the middle of black (-> post1 scanline).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { lineByScene, sparkHead2D } from './_motifs';
import { clamp, ease, lerp, prog, pulse, polylineLengths, pointAtLength, TAU, type V2 } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, karaokeWord, shakeVec } from './node2-kit';
import type { Word } from '../engine/lyrics';

export const T_START = 37.5, T_DOWN = 39.84, T_END = 41.25;

// chart box in world units
export const CH = { x0: 160, x1: 2760, y0: 140, y1: 1180, lgLo: 3, lgHi: 12 };
const yearX = (yr: number) => lerp(CH.x0 + 80, CH.x1 - 260, (yr - 1971) / 55);
const lgY = (lg: number) => lerp(CH.y1, CH.y0, (lg - CH.lgLo) / (CH.lgHi - CH.lgLo));

// (year, transistors)
const DATA: [number, number][] = [
  [1971, 2.3e3], [1974, 6e3], [1978, 2.9e4], [1982, 1.34e5], [1985, 2.75e5], [1989, 1.2e6], [1993, 3.1e6], [1997, 7.5e6], [2000, 4.2e7],
  [2004, 1.25e8], [2008, 7.3e8], [2011, 2.6e9], [2014, 5.6e9], [2017, 1.9e10], [2020, 5.4e10], [2023, 1.3e11], [2026, 2.08e11],
];
export const LABELS: [number, string][] = [[1971, '4004 · 2,300'], [1985, '386 · 275 K'], [1999, 'PENTIUM III · 9.5 M'], [2010, 'WESTMERE · 2.3 B'], [2020, 'A100 · 54 B'], [2026, 'B200 · 208 B']];

function buildCurve(): V2[] {
  const pts = DATA.map(([y, n]) => ({ x: yearX(y), y: lgY(Math.log10(n)) }));
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < 12; k++) {
      const u = k / 12, u2 = u * u, u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
const CURVE = buildCurve();
const LC = polylineLengths(CURVE)[CURVE.length - 1]!;
// the break-out: from the last data point the curve bends up to vertical and runs off the top
const END = CURVE[CURVE.length - 1]!;
const PATH: V2[] = (() => {
  const p = CURVE.slice();
  const a0 = Math.atan2(END.y - CURVE[CURVE.length - 6]!.y, END.x - CURVE[CURVE.length - 6]!.x);
  const R = 420;
  for (let i = 1; i <= 24; i++) {
    const a = lerp(a0, -Math.PI / 2, i / 24);
    const last = p[p.length - 1]!;
    p.push({ x: last.x + Math.cos(a) * R / 24 * 1.6, y: last.y + Math.sin(a) * R / 24 * 1.6 });
  }
  const last = p[p.length - 1]!;
  for (let i = 1; i <= 30; i++) p.push({ x: last.x, y: last.y - i * 150 });
  return p;
})();
const PL = polylineLengths(PATH);
const PTOT = PL[PATH.length - 1]!;
const LBEND = PL[CURVE.length - 1]! + 0;

/** Arc length of the beam head along PATH. Racing: eases in, accelerates through the end, then shoots up. */
export function beamS(t: number): number {
  const a = prog(t, T_START + 0.05, T_DOWN - 0.05);
  const s = LC * (0.55 * a + 0.45 * a * a) + 520 * ease.inQuad(prog(t, T_DOWN - 0.05, T_DOWN + 0.3));
  const up = ease.inQuad(prog(t, T_DOWN + 0.25, T_END));
  return Math.min(PTOT, s + 3800 * up);
}

/** The chart plate (paper, grid, log axis, ticks) in world space. */
export function drawChartPaper(c: CanvasRenderingContext2D, o: { labels?: boolean; fine?: boolean } = {}) {
  const { x0, x1, y0, y1 } = CH;
  c.fillStyle = C.bone; c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.lineCap = 'butt';
  for (let lg = CH.lgLo; lg <= CH.lgHi; lg++) {
    const y = lgY(lg);
    c.strokeStyle = 'rgba(10,10,11,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    if (o.fine !== false && lg < CH.lgHi) {
      c.strokeStyle = 'rgba(10,10,11,0.13)'; c.lineWidth = 1;
      for (let m = 2; m < 10; m++) { const yy = lgY(lg + Math.log10(m)); c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
    }
    if (o.labels !== false) {
      c.font = font(F.mono(600), 26); c.fillStyle = 'rgba(10,10,11,0.75)'; c.textAlign = 'left'; c.textBaseline = 'bottom';
      c.fillText(`10^${lg}`, x0 + 14, y - 6);
    }
  }
  for (let yr = 1975; yr <= 2025; yr += 5) {
    const x = yearX(yr);
    c.strokeStyle = 'rgba(10,10,11,0.28)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
    if (o.labels !== false) { c.font = font(F.mono(600), 26); c.fillStyle = 'rgba(10,10,11,0.75)'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(String(yr), x, y1 + 18); }
  }
  // border
  c.strokeStyle = C.ink; c.lineWidth = 8; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if (o.labels !== false) {
    c.font = font(F.mono(700), 30); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText('TRANSISTORS PER CHIP · LOG SCALE', x0, y0 - 20);
  }
}

/** The curve with the head at arc length s: ink line behind, amber beam trail near the head, data labels. Returns head. */
export function drawCurve(c: CanvasRenderingContext2D, s: number, t: number, o: { w?: number; trail?: number; labels?: boolean } = {}) {
  const w = o.w ?? 7, trail = o.trail ?? 640;
  const n = PATH.length;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // ahead: faint dashed
  c.setLineDash([14, 14]); c.strokeStyle = 'rgba(10,10,11,0.22)'; c.lineWidth = 3;
  c.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) c.moveTo(PATH[i]!.x, PATH[i]!.y); else c.lineTo(PATH[i]!.x, PATH[i]!.y); } c.stroke();
  c.setLineDash([]);
  // behind: solid ink
  c.strokeStyle = C.ink; c.lineWidth = w;
  c.beginPath(); c.moveTo(PATH[0]!.x, PATH[0]!.y);
  for (let i = 1; i < n && PL[i]! < s; i++) c.lineTo(PATH[i]!.x, PATH[i]!.y);
  const h = pointAtLength(PATH, PL, s); c.lineTo(h.x, h.y); c.stroke();
  // beam trail, brighter toward the head
  const seg = 28;
  for (let k = 0; k < seg; k++) {
    const s0 = Math.max(0, s - trail * (1 - k / seg)), s1 = Math.max(0, s - trail * (1 - (k + 1) / seg));
    const a = pointAtLength(PATH, PL, s0), b = pointAtLength(PATH, PL, s1);
    const u = (k + 1) / seg;
    c.strokeStyle = `rgba(255,${Math.round(150 + 100 * u * u)},${Math.round(30 + 150 * u * u * u)},${0.25 + 0.75 * u})`;
    c.lineWidth = w * (0.8 + 2.4 * u);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  // data markers
  if (o.labels !== false) {
    for (const [yr, txt] of LABELS) {
      const x = yearX(yr);
      let i = 0; while (i < CURVE.length - 1 && CURVE[i]!.x < x) i++;
      const p = CURVE[i]!;
      if (PL[i]! > s) continue;
      c.fillStyle = C.ink; c.beginPath(); c.arc(p.x, p.y, 11, 0, TAU); c.fill();
      c.fillStyle = C.signal; c.beginPath(); c.arc(p.x, p.y, 5, 0, TAU); c.fill();
      c.font = font(F.mono(700), 24); c.fillStyle = C.ink; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText(txt, p.x - 16, p.y + 20);
    }
  }
  sparkHead2D(c, h.x, h.y, t, 2.6);
  return h;
}

/** A thumbnail chart (paper + curve to progress p in 0..1 + head) in the rect x,y,w,h. For the chorus-3 reprise. */
export function drawMiniChart(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number, t: number) {
  c.save();
  c.translate(x, y);
  c.scale(w / (CH.x1 - CH.x0 + 40), h / (CH.y1 - CH.y0 + 300));
  c.translate(-CH.x0 + 20, -CH.y0 + 120);
  drawChartPaper(c, { labels: false, fine: false });
  c.save(); c.beginPath(); c.rect(CH.x0, CH.y0, CH.x1 - CH.x0, CH.y1 - CH.y0); c.clip();
  drawCurve(c, LC * clamp(p), t, { w: 14, trail: 500, labels: false });
  c.restore();
  c.restore();
}

export default class Down1 extends Scene {
  text = new Layer2D();
  words: Word[] = [];
  base = { x: 0, y: 0 };

  override init() { this.words = lineByScene(this.ctx.lyrics, 'down1').words; }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out, LIN.ink);
    this.text.clear();
    const c = this.text.ctx;
    c.fillStyle = C.ink; c.fillRect(0, 0, 1920, 1080);
    const s = beamS(t);
    const head = pointAtLength(PATH, PL, s);
    // camera: tracks the head low and close; zooms in on the run, then pulls the head to centre for the vertical
    const vert = ease.inOutCubic(prog(t, T_DOWN - 0.1, T_DOWN + 0.45));
    const zoom = lerp(1.35, 1.9, ease.inQuad(prog(t, T_START, T_DOWN))) * lerp(1, 0.78, vert);
    const ax = lerp(640, 960, vert), ay = lerp(760, 860, vert);
    const camY = head.y, camX = head.x;
    const wind = 1 - ease.outExpo(prog(t, T_START, T_START + 0.35)); // opening drop-in
    c.save();
    c.translate(ax, ay + 120 * wind);
    c.scale(zoom, zoom);
    c.rotate(-0.07 * (1 - vert) + 0.01 * Math.sin(t * 9));
    c.translate(-camX, -camY);
    drawChartPaper(c);
    // everything beyond the top border is cut: the curve is clipped to the paper until it breaks through
    drawCurve(c, s, t);
    // lyric words along the curve, below it, karaoke-timed
    const fam = F.archivo(100, 900), sz = 118;
    for (let i = 0; i < 4; i++) {
      const w = this.words[i]!;
      const sw = Math.min(LC * 0.97, LC * (0.18 + 0.2 * i));
      const p = pointAtLength(PATH, PL, sw);
      const k = prog(t, w.start - 0.5, w.start, ease.outQuad);
      if (k <= 0) continue;
      c.save();
      c.translate(p.x, p.y); c.rotate(p.angle);
      c.translate(0, 120 + (1 - k) * 90);
      c.font = font(fam, sz);
      c.globalAlpha = k;
      karaokeWord(c, w, t, 0, sz * 0.7, fam, sz, { dim: 'rgba(10,10,11,0.28)', settled: C.ink, sung: '#E07A00', slam: 0.1 });
      c.restore();
    }
    c.restore();
    // the vertical line: after the break it is the one thing left on screen
    const fin = ease.inQuad(prog(t, 40.55, T_END));
    if (fin > 0) {
      c.fillStyle = `rgba(10,10,11,${0.97 * fin})`; c.fillRect(0, 0, 1920, 1080);
      const g = c.createLinearGradient(0, 0, 0, 1080);
      g.addColorStop(0, 'rgba(255,210,122,1)'); g.addColorStop(1, 'rgba(255,164,27,1)');
      c.fillStyle = g; c.fillRect(960 - 3 - 2 * fin, 0, 6 + 4 * fin, 1080);
    }
    // DOWN: flips 180 degrees about the horizontal axis, stamped across the middle
    const dw = this.words[4]!;
    const dk = prog(t, dw.start, dw.start + 0.5, ease.outBack);
    if (t >= dw.start - 0.02 && fin < 0.98) {
      const dfam = F.archivo(125, 900), dsz = Math.min(520, fitSize('DOWN', dfam, 1500));
      c.save();
      c.translate(960, 540);
      const sy = Math.cos(lerp(Math.PI, 0, Math.min(1, dk)));
      const wob = 1 + 0.07 * pulse(t, dw.start + 0.5, 0.08);
      c.scale(wob, wob * (Math.abs(sy) < 0.02 ? 0.02 : sy));
      c.font = font(dfam, dsz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.lineJoin = 'round'; c.lineWidth = 22; c.strokeStyle = C.ink; c.strokeText('DOWN', 0, dsz * 0.35);
      c.fillStyle = dk > 0.5 ? C.signal : C.bone; c.fillText('DOWN', 0, dsz * 0.35);
      c.restore();
    }
    const tex = this.text.upload();
    comp.draw(renderer, tex, out);
    const down = pulse(t, T_DOWN, 0.1);
    const [sx, sy2] = shakeVec(t, 2 + 14 * down + 4 * f.a.kick, 3);
    return {
      bloom: 0.55 + 0.6 * down + 0.4 * fin, bloomThreshold: 0.8, shake: [sx, sy2] as [number, number],
      zoom: 1 + 0.012 * f.a.kick + 0.05 * down, ca: 0.5 + 3 * down, flash: 0.2 * down, vignette: 0.4,
    };
  }
}
