// The lot traveller (card space: 1920 x 1080 layout, card = x 220..1700, y 110..970) and its parts.
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, mulberry32, prog, pulse, smoothstep } from '../engine/util';
import { drawTPP } from './_motifs';

export const CARD = { x0: 220, y0: 110, x1: 1700, y1: 970 };
/** where the grain lands: the middle of the specimen box (card space) */
export const G = { x: 440, y: 532 };
export const STATUS = { x: 1000, y: 792, w: 660, h: 140 };
export const STATUS_C = { x: STATUS.x + STATUS.w / 2, y: STATUS.y + STATUS.h / 2 };

export const STEPS = [
  'QUARTZ SAND', 'REFINE 99.9999999%', 'MELT · CZOCHRALSKI', 'PULL INGOT', 'SAW WAFERS', 'LAP · POLISH', 'EPITAXY', 'OXIDISE', 'SPIN RESIST', 'EUV EXPOSE', 'DEVELOP',
  'ETCH', 'STRIP', 'IMPLANT', 'ANNEAL', 'DEPOSIT HIGH-K', 'GATE-ALL-AROUND', 'SELECTIVE EPI', 'CONTACT', 'METAL 1', 'METAL 2',
  'VIA', 'METAL 3', 'METAL 10', 'PASSIVATE', 'WAFER SORT', 'DICE', 'BOND · HBM STACK', 'PACKAGE', 'BURN-IN', 'DISPOSITION',
];

const INK = (a: number) => `rgba(10,10,11,${a})`;
const UMBER = (a: number) => rgba('blood', a);

/** the typed prefix of s after `cps` chars per second since t0 */
export function typed(s: string, t: number, t0: number, cps = 45): string {
  const n = Math.floor((t - t0) * cps);
  return n <= 0 ? '' : s.slice(0, n);
}
const caret = (t: number) => (Math.floor(t * 3) % 2 === 0 ? '▌' : ' ');

export interface DocTimes {
  start: number; stamp: number;
  whisper: { w: string; start: number; end: number }[];
  lyric: { w: string; start: number; end: number }[];
  nowT: number;
}

/** draw the traveller, in card space. `reveal`: radius of the developed paper (for the colour flip of the early lyric). */
export function drawDoc(c: CanvasRenderingContext2D, t: number, T: DocTimes, reveal: number) {
  c.save();
  c.textBaseline = 'alphabetic';
  const mono = (s: string, x: number, y: number, size: number, a: number, w = 500, align: CanvasTextAlign = 'left', track = 1.5, col = INK) => {
    if (!s) return;
    c.font = font(F.mono(w), size); c.letterSpacing = `${track}px`; c.textAlign = align; c.fillStyle = col(a); c.fillText(s, x, y);
  };
  const t0 = T.start;

  // ---- frame, header
  const frame = ease.outCubic(prog(t, t0 + 0.0, t0 + 0.5));
  c.strokeStyle = INK(0.75 * frame); c.lineWidth = 1.5;
  c.strokeRect(CARD.x0 + 14, CARD.y0 + 14, (CARD.x1 - CARD.x0 - 28) * 1, (CARD.y1 - CARD.y0 - 28) * 1);
  c.lineWidth = 0.8; c.strokeStyle = INK(0.45 * frame);
  c.strokeRect(CARD.x0 + 22, CARD.y0 + 22, CARD.x1 - CARD.x0 - 44, CARD.y1 - CARD.y0 - 44);

  c.font = font(F.archivo(100, 800), 54); c.letterSpacing = '1px'; c.textAlign = 'left'; c.fillStyle = INK(0.92);
  const title = typed('PROCESS TRAVELLER', t, t0 + 0.2, 60);
  c.fillText(title, 262, 190);
  mono(typed('LOT 7A-0042', t, t0 + 0.35, 40) + (t < t0 + 0.9 ? '' : ''), 1658, 190, 46, 0.92, 600, 'right', 1);
  mono(typed('FORM 3A090-31 · REV 31 · THIS COPY TRAVELS WITH THE LOT · NOT TO BE DETACHED', t, t0 + 0.5, 90), 262, 224, 14, 0.6, 500, 'left', 1.2);
  c.fillStyle = INK(0.6 * frame); c.fillRect(262, 240, 1396, 1.5);

  // ---- metadata cells
  const cells: [string, string, number][] = [
    ['PROCESS NODE', 'N2 · GAA NANOSHEET', 262], ['SUBSTRATE', '300 mm · 25 WAFERS', 640], ['ORIGIN', 'SPRUCE PINE, N.C.', 1020], ['DESTINATION', '', 1350],
  ];
  cells.forEach(([lab, val, x], i) => {
    const ts = t0 + 0.55 + i * 0.16;
    mono(lab, x, 276, 12, 0.5 * ease.outCubic(prog(t, ts, ts + 0.2)), 500, 'left', 2);
    mono(typed(val, t, ts + 0.08, 36), x, 312, 20, 0.9, 600, 'left', 1);
  });
  // DESTINATION: redacted when "now" lands
  const red = ease.outExpo(prog(t, T.nowT, T.nowT + 0.12));
  if (t >= t0 + 1.0) {
    const w = 270 * (red > 0 ? red : 0);
    mono('DESTINATION', 1350, 276, 12, 0.5, 500, 'left', 2);
    if (red <= 0) mono(typed('— — — — —', t, t0 + 1.1, 30), 1350, 312, 20, 0.5, 600, 'left', 1);
    c.fillStyle = INK(0.96); c.fillRect(1350, 292, w, 28);
    if (red > 0.8) mono('REDACTED', 1350 + 14, 312, 14, 0.9, 600, 'left', 4, (a) => `rgba(238,233,223,${a})`);
  }
  c.fillStyle = INK(0.25 * frame); c.fillRect(262, 338, 1396, 1);

  // ---- specimen box
  const spec = ease.outCubic(prog(t, t0 + 0.2, t0 + 0.7));
  c.strokeStyle = INK(0.7 * spec); c.lineWidth = 1.2;
  const sx = 280, sy = 372, ss = 320;
  c.beginPath();
  for (const [x, y, dx, dy] of [[sx, sy, 1, 1], [sx + ss, sy, -1, 1], [sx, sy + ss, 1, -1], [sx + ss, sy + ss, -1, -1]] as const) { c.moveTo(x + dx * 34, y); c.lineTo(x, y); c.lineTo(x, y + dy * 34); }
  c.stroke();
  c.lineWidth = 0.7; c.strokeStyle = INK(0.3 * spec);
  c.beginPath(); c.moveTo(G.x - 30, G.y); c.lineTo(G.x + 30, G.y); c.moveTo(G.x, G.y - 30); c.lineTo(G.x, G.y + 30); c.stroke();
  mono('SPECIMEN 01', sx, sy - 10, 12, 0.5 * spec, 500, 'left', 2);
  mono(typed('SiO₂ · ⌀ 0.62 mm · 1 GRAIN', t, t0 + 0.9, 40), sx, sy + ss + 28, 14, 0.7, 500, 'left', 1);

  // ---- remarks: the whispered lyric, typed as sung (it begins on the black, before the paper)
  const rx = 280, ry = 808;
  mono('REMARKS', rx, 760, 12, 0.5 * spec, 500, 'left', 2);
  c.fillStyle = INK(0.4 * spec); c.fillRect(rx, 820, 440, 1); c.fillRect(rx, 858, 440, 1);
  let txt = '';
  T.lyric.forEach((w, i) => {
    if (t < w.start) return;
    const n = clamp((t - w.start) / Math.min(0.32, w.end - w.start));
    txt += (i ? ' ' : '') + w.w.slice(0, Math.ceil(w.w.length * n));
  });
  const lyricDone = T.lyric.length > 0 && t > T.lyric[T.lyric.length - 1]!.end;
  const full = txt + (lyricDone ? '' : caret(t));
  if (txt) {
    // before the paper has developed under it the line is bone on black: clip inside/outside the reveal circle
    c.save();
    c.font = font(F.mono(500), 25); c.letterSpacing = '0.5px'; c.textAlign = 'left';
    const circ = new Path2D(); circ.arc(G.x, G.y, Math.max(0, reveal), 0, Math.PI * 2);
    const outside = new Path2D(); outside.rect(-4000, -4000, 8000, 8000); outside.addPath(circ);
    c.save(); c.clip(outside, 'evenodd'); c.fillStyle = rgba('bone', 0.8); c.fillText(full, rx, ry); c.restore();
    c.save(); c.clip(circ); c.fillStyle = INK(0.92); c.fillText(full, rx, ry); c.restore();
    c.restore();
  }

  // ---- routing table: 31 steps, ticked one by one
  const cols = [{ x: 740, n: 11 }, { x: 1048, n: 10 }, { x: 1356, n: 10 }];
  let k = 0;
  const rowT0 = t0 + 0.7;
  mono('ROUTING', 740, 372, 12, 0.5 * ease.outCubic(prog(t, rowT0, rowT0 + 0.2)), 500, 'left', 2);
  const tickT0 = T.lyric.length ? T.lyric[1]!.start + 0.2 : t0 + 1.3;
  cols.forEach((col) => {
    for (let r = 0; r < col.n; r++, k++) {
      const y = 404 + r * 34;
      const ap = ease.outCubic(prog(t, rowT0 + k * 0.02, rowT0 + k * 0.02 + 0.2));
      if (ap <= 0) continue;
      const done = t >= tickT0 + k * 0.0675;
      const cur = !done && t >= tickT0 + (k - 1) * 0.0675;
      mono(String(k + 1).padStart(2, '0'), col.x, y, 14, 0.5 * ap, 500, 'left', 1);
      mono(STEPS[k]!, col.x + 34, y, 15, (done ? 0.88 : 0.5) * ap, done ? 600 : 400, 'left', 0.6);
      c.strokeStyle = INK(0.55 * ap); c.lineWidth = 1.1;
      c.strokeRect(col.x + 268, y - 13, 15, 15);
      if (done) {
        const tk = ease.outBack(prog(t, tickT0 + k * 0.0675, tickT0 + k * 0.0675 + 0.12));
        c.strokeStyle = UMBER(0.95); c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(col.x + 270, y - 6); c.lineTo(col.x + 274, y - 1.5 * tk); c.lineTo(col.x + 282, y - 13 * tk); c.stroke();
      } else if (cur) {
        c.fillStyle = UMBER(0.5); c.fillRect(col.x + 271, y - 10, 9, 9);
      }
    }
  });

  // ---- TPP
  const tppA = ease.outCubic(prog(t, t0 + 1.2, t0 + 1.6));
  c.save(); c.globalAlpha = tppA;
  const infT = T.nowT;
  const v = t >= infT ? Infinity : 19200;
  drawTPP(c, 740, 818, v, { scale: 1.0, width: 220, ink: INK(0.95), dim: INK(0.5) });
  c.restore();

  // ---- status field and the whisper
  const stA = ease.outCubic(prog(t, t0 + 1.5, t0 + 1.9));
  c.strokeStyle = INK(0.6 * stA); c.lineWidth = 1.2; c.setLineDash([7, 6]);
  c.strokeRect(STATUS.x, STATUS.y, STATUS.w, STATUS.h);
  c.setLineDash([]);
  mono('EXPORT STATUS · ECCN 3A090', STATUS.x + 14, STATUS.y - 10, 12, 0.55 * stA, 500, 'left', 2);
  // the whispered words, Cormorant italic, written into the box as they are sung
  c.font = font(F.serif(600, true), 84); c.letterSpacing = '0px'; c.textAlign = 'left';
  let wx = STATUS.x + 30;
  for (const w of T.whisper) {
    const p = prog(t, w.start, w.start + (w.end - w.start) * 0.9);
    const wd = c.measureText(w.w + ' ').width;
    if (p > 0) {
      c.save();
      c.beginPath(); c.rect(wx - 6, STATUS.y, wd * p + 12, STATUS.h); c.clip();
      c.fillStyle = INK(0.9); c.fillText(w.w, wx, STATUS.y + 92);
      c.restore();
    }
    wx += wd;
  }
  // signature line
  c.fillStyle = INK(0.4 * stA); c.fillRect(740, 940, 220, 1);
  mono('AUTHORISED', 740, 958, 11, 0.45 * stA, 500, 'left', 2);
  c.restore();
}

// ------------------------------------------------------------------ the stamp
let stampCv: HTMLCanvasElement | null = null;
export const STAMP = { w: 700, h: 190 };
/** the rough red stamp image (built once, deterministic) */
export function stampCanvas(): HTMLCanvasElement {
  if (stampCv) return stampCv;
  const cv = document.createElement('canvas');
  const sc = 2;
  cv.width = STAMP.w * sc; cv.height = STAMP.h * sc;
  const c = cv.getContext('2d')!;
  c.scale(sc, sc);
  c.fillStyle = '#E0312B'; c.strokeStyle = '#E0312B';
  c.lineWidth = 8; c.strokeRect(6, 6, STAMP.w - 12, STAMP.h - 12);
  c.lineWidth = 2.5; c.strokeRect(22, 22, STAMP.w - 44, STAMP.h - 44);
  c.textBaseline = 'alphabetic'; c.textAlign = 'center';
  c.font = font(F.archivo(125, 900), 84); c.letterSpacing = '2px';
  c.fillText('EXPORT RESTRICTED', STAMP.w / 2, 112);
  c.font = font(F.mono(700), 30); c.letterSpacing = '6px';
  c.fillText('ECCN 3A090 · LOT 7A-0042', STAMP.w / 2, 158);
  // worn rubber: speckle, scratches and a dry band
  const rnd = mulberry32(5);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1500; i++) { c.globalAlpha = 0.25 + rnd() * 0.6; const r = 0.4 + rnd() * rnd() * 2.2; c.beginPath(); c.arc(rnd() * STAMP.w, rnd() * STAMP.h, r, 0, 6.3); c.fill(); }
  for (let i = 0; i < 14; i++) { c.globalAlpha = 0.5; c.lineWidth = 0.6 + rnd() * 1.3; c.beginPath(); const x = rnd() * STAMP.w, y = rnd() * STAMP.h; c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 140, y + (rnd() - 0.5) * 30); c.stroke(); }
  c.globalAlpha = 0.3; c.fillRect(0, STAMP.h * 0.72, STAMP.w, 7);
  stampCv = cv;
  return cv;
}

/** draw the stamp at its slam state (card space): returns the impact pulse for the scene's shake */
export function drawStamp(c: CanvasRenderingContext2D, t: number, tStamp: number) {
  if (t < tStamp - 0.003) return;
  const age = t - tStamp;
  const k = ease.inExpo(clamp(1 - age / 0.075));          // 1 at the swing start, 0 at contact
  const scale = 1 + 0.9 * k - 0.025 * pulse(t, tStamp + 0.075, 0.07) + 0.0;
  const rot = (-3.4 * Math.PI) / 180 + 0.06 * k;
  const a = smoothstep(tStamp - 0.003, tStamp + 0.03, t);
  c.save();
  c.translate(STATUS_C.x + 6, STATUS_C.y + 8);
  c.rotate(rot); c.scale(scale, scale);
  c.globalAlpha = a;
  // ink bleed: a soft red halo that tightens
  c.shadowColor = 'rgba(224,49,43,0.55)'; c.shadowBlur = 10 + 30 * k;
  c.drawImage(stampCanvas(), -STAMP.w / 2, -STAMP.h / 2, STAMP.w, STAMP.h);
  c.restore();
}

/** a sand grain as a small engraved polyhedron (ink body, bone hairline, hatch, amber rim) */
export function drawGrain(c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, alpha = 1) {
  const rnd = mulberry32(11);
  const n = 9, pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rot, r = size * (0.68 + 0.32 * rnd()) * (i % 2 ? 0.92 : 1.0); pts.push([x + Math.cos(a) * r * 1.25, y + Math.sin(a) * r * 0.9]); }
  c.save(); c.globalAlpha = alpha;
  c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
  c.fillStyle = '#0A0A0B'; c.fill();
  c.save(); c.clip();
  c.strokeStyle = rgba('bone', 0.55); c.lineWidth = Math.max(0.6, size * 0.035);
  c.beginPath();
  for (let i = -size * 2; i < size * 2; i += size * 0.2) { c.moveTo(x + i - size, y - size); c.lineTo(x + i + size * 0.4, y + size); }
  c.stroke();
  c.restore();
  c.strokeStyle = rgba('bone', 0.9); c.lineWidth = Math.max(0.8, size * 0.05); c.stroke();
  c.strokeStyle = rgba('signal', 0.95); c.lineWidth = Math.max(0.8, size * 0.07);
  c.beginPath(); c.moveTo(pts[5]![0], pts[5]![1]); c.lineTo(pts[6]![0], pts[6]![1]); c.lineTo(pts[7]![0], pts[7]![1]); c.stroke();
  c.restore();
}
void lerp; void hash;
