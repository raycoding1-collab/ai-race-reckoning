// Running gag UNIT 0001: the stowaway quartz grain from the opening rides every plate as a tiny faceted crystal (a few
// px to ~40 px) with a deadpan regulatory tag beside it in small mono type. Its status escalates plate by plate
// (NOT CONTROLLED -> LOT HELD -> RESTRICTED -> DECLARED: SOUVENIR -> KILLER DEFECT -> RETURN TO SENDER).
//
// Everything is a pure function of song time: a per-time table (GAG) plus the drawing (drawGag), called from the
// top overlay (Hud.draw in hud.ts), so it sits above every plate's post (grain, shake, CA) without touching them.
// Between consecutive entries the grain hops from its old spot to the new one, so it visibly rides from plate to plate.
// Placement per plate keeps clear of the lyric and the main subject (chosen from the rendered frames; see the notes
// on each row). To retune a plate, edit its row: `at` is the grain's centre in 1920x1080 px, the tag runs to its right.
import { rgba } from './palette';
import { F, font } from './type';
import { clamp, ease, hash, lerp, smoothstep } from './util';
import { nucleusPx } from '../scenes/crack-kit';
import { atomsCounted } from '../scenes/atom-kit';

/** Quartz, ⌀ 0.62 mm (the sand plate's grain), alpha-quartz 2.65 g/cm³, SiO₂ 60.08 g/mol: (π/6)(0.62 mm)³ → 9.9e18 atoms. */
export const GRAIN_ATOMS = '9,900,000,000,000,000,000';

type At = [number, number] | ((t: number) => [number, number]);
interface Stage {
  /** from this time on (song s) the tag reads `tag` */
  t: number;
  tag: string | ((t: number) => string);
  /** export-red stamp box around the status (RESTRICTED) */
  red?: boolean;
  /** amber status (the killer defect) */
  hot?: boolean;
}
export interface Gag {
  id: string;
  t0: number; t1: number;
  at: At;
  /** grain size in px (a few px .. ~40) */
  size: number;
  stages: Stage[];
  /** the plate is light (bone paper): ink grain and ink type */
  light?: boolean;
  /** 0..1 escalation: the tag grows from 13 px and brightens as the gag escalates */
  level: number;
  /** tag to the left of the grain (grain near the right edge) */
  left?: boolean;
  /** second line of the tag (small) */
  line2?: string | ((t: number) => string);
}

const S = (t: number, tag: Stage['tag'], o: Partial<Stage> = {}): Stage => ({ t, tag, ...o });
const st = (status: string) => `UNIT 0001  ${status}`;

// Plate windows follow timeline.ts (bars of 1.875 s). The numbers after `at` are the clear region found for the plate.
export const GAG: Gag[] = [
  // sand: the opening grain itself is the picture; its stowaway twin sits in the empty upper right, a specimen label
  { id: 'sand', t0: 0.34, t1: 7.5, at: [1486, 198], size: 30, level: 0, stages: [S(0.34, st('QUARTZ  NOT CONTROLLED'))] },
  { id: 'tin', t0: 7.5, t1: 11.25, at: [84, 818], size: 14, level: 0.05, stages: [S(7.5, st('RIDING DROPLET 1  NOT CONTROLLED'))] },
  { id: 'laser', t0: 11.25, t1: 15, at: [84, 378], size: 12, level: 0.1, stages: [S(11.25, st('IN PLASMA  STILL NOT CONTROLLED'))] },
  { id: 'machine', t0: 15, t1: 18.75, at: [1504, 80], size: 16, level: 0.15, stages: [S(15, st('ON RETICLE  LOT HELD'))] },
  { id: 'tons', t0: 18.75, t1: 22.5, at: [1264, 80], size: 18, level: 0.2, stages: [S(18.75, st('CONTAINER 41  (OVERFLOW)'))] },
  // line: bone paper; RESTRICTED lands with the red stamp on "line" (24.375)
  { id: 'line', t0: 22.5, t1: 25.8, at: [84, 520], size: 22, level: 0.35, light: true, stages: [S(22.5, st('PENDING REVIEW')), S(24.375, st('RESTRICTED'), { red: true })] },
  { id: 'drop1', t0: 26.25, t1: 30, at: [1464, 998], size: 14, level: 0.3, stages: [S(26.25, st('NOT A WEAPON'))] },
  { id: 'node1', t0: 30, t1: 33.75, at: [1424, 238], size: 14, level: 0.3, stages: [S(30, st('310,000 NODES WIDE  OVERSIZE'))] },
  { id: 'grid1', t0: 33.75, t1: 37.5, at: [84, 718], size: 14, level: 0.35, stages: [S(33.75, st('LIGHTS ON  ONE UNACCOUNTED'))] },
  { id: 'down1', t0: 37.5, t1: 41.25, at: [84, 98], size: 14, level: 0.35, light: true, stages: [S(37.5, st('PENDING EXPORT REVIEW'))] },
  { id: 'post1', t0: 41.25, t1: 48.75, at: [1504, 178], size: 16, level: 0.4, stages: [S(41.25, st('CHIP 6 OF 5  RECOUNT'))] },
  { id: 'hbm', t0: 48.75, t1: 52.5, at: [84, 78], size: 16, level: 0.4, stages: [S(48.75, st('STACKED  LAYER 9 OF 8'))] },
  { id: 'smuggle', t0: 52.5, t1: 56.25, at: [1524, 998], size: 20, level: 0.5, stages: [S(52.5, st('DECLARED: SOUVENIR'))] },
  { id: 'island', t0: 56.25, t1: 60, at: [104, 178], size: 16, level: 0.5, light: true, stages: [S(56.25, st('LANDED  NO LICENCE'))] },
  { id: 'key', t0: 60, t1: 63.75, at: [1424, 998], size: 16, level: 0.5, stages: [S(60, st('PIN 6 OF 5  JAMMED'))] },
  { id: 'shield', t0: 63.75, t1: 67.5, at: [1444, 78], size: 16, level: 0.55, stages: [S(63.75, st('POURED THROUGH DIE 112'))] },
  { id: 'fab', t0: 67.5, t1: 71.25, at: [1504, 998], size: 16, level: 0.55, stages: [S(67.5, st('SLOT 25  SLEEPING 0'))] },
  { id: 'drop2', t0: 71.25, t1: 75, at: [1464, 998], size: 16, level: 0.55, stages: [S(71.25, st('RECLASSIFIED: WEAPON'))] },
  { id: 'node2', t0: 75, t1: 78.75, at: [84, 818], size: 16, level: 0.6, stages: [S(75, st('DIE 112  ASSIGNED'))] },
  { id: 'grid2', t0: 78.75, t1: 82.5, at: [104, 658], size: 16, level: 0.6, stages: [S(78.75, st('LOAD +1 GRAIN'))] },
  { id: 'down2', t0: 82.5, t1: 86.25, at: [424, 998], size: 16, level: 0.6, stages: [S(82.5, st('TPP 0  EXEMPT'))] },
  { id: 'post2', t0: 86.25, t1: 93.75, at: [1524, 878], size: 16, level: 0.65, stages: [S(86.25, st('LED 5,185 OF 5,184'))] },
  // atom: the tally with the grain's whole atom budget (quartz, ⌀ 0.62 mm): the first line is the live counter
  {
    id: 'atom', t0: 93.75, t1: 97.5, at: [1366, 1038], size: 16, level: 0.7,
    stages: [S(93.75, (t) => `ATOMS COUNTED ${atomsCounted(t - 93.75).toLocaleString('en-US')} / ${GRAIN_ATOMS}`)],
    line2: 'UNIT 0001  QUARTZ ⌀ 0.62 mm  2.65 g/cm³',
  },
  { id: 'dream', t0: 97.5, t1: 101.25, at: [1544, 998], size: 18, level: 0.7, stages: [S(97.5, st('FOUND IN WEIGHTS'))] },
  // crack: the marker sits on the notch the hairline grows from (DIE 112), through the push-in and the pull-back
  {
    id: 'crack', t0: 101.25, t1: 105, size: 20, level: 1,
    at: (t) => { const p = nucleusPx(t); return [p.x + 6, p.y - 40]; },
    stages: [S(101.25, st('SUSPECT  DIE 112')), S(101.9, st('KILLER DEFECT  DIE 112'), { hot: true })],
  },
  { id: 'whoscrown', t0: 105, t1: 108.75, at: [84, 138], size: 16, level: 0.8, stages: [S(105, st('WITNESS  NO COMMENT'))] },
  { id: 'hold', t0: 108.75, t1: 115.5, at: [1484, 998], size: 16, level: 0.8, stages: [S(108.75, st('UNDER TENSION  HOLDING'))] },
  { id: 'drop3', t0: 116.25, t1: 120, at: [1464, 998], size: 16, level: 0.85, stages: [S(116.25, st('RECLASSIFIED: SHRAPNEL'))] },
  { id: 'node3', t0: 120, t1: 123.75, at: [84, 56], size: 16, level: 0.85, stages: [S(120, st('PRESENT IN EVERY TILE'))] },
  { id: 'grid3', t0: 123.75, t1: 127.5, at: [84, 838], size: 16, level: 0.9, stages: [S(123.75, st('CAUSE OF OUTAGE: PENDING'))] },
  { id: 'down3', t0: 127.5, t1: 131.25, at: [104, 998], size: 16, level: 0.9, stages: [S(127.5, st('INCIDENT REPORT FILED'))] },
  { id: 'outro', t0: 131.25, t1: 141.55, at: [264, 1034], size: 22, level: 1, stages: [S(131.25, st('RETURN TO SENDER'))] },
];

const HOP = 0.42; // s: the grain's hop from the previous plate's spot
const ENTRY = 0.32; // s: the first appearance (no previous plate)
const TYPE_CPS = 62; // typewriter speed of a tag, chars per second

// ---------------------------------------------------------------------------------------------------- the grain
// A double-terminated quartz crystal (hexagonal prism, rhombohedral points at both ends), drawn as flat-shaded
// facets with painter's order, a slow spin and a roll in the image plane. 3 px to ~40 px.
const R_HEX = 0.46, H_BODY = 0.62, H_TIP = 0.34;
const TOTAL_H = H_BODY + 2 * H_TIP;
type V3 = [number, number, number];
const LIGHT: V3 = (() => { const l: V3 = [-0.42, 0.62, 0.66]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
const HALF: V3 = (() => { const h: V3 = [LIGHT[0], LIGHT[1], LIGHT[2] + 1]; const n = Math.hypot(...h); return [h[0] / n, h[1] / n, h[2] / n]; })();

function drawGrain(c: CanvasRenderingContext2D, cx: number, cy: number, size: number, t: number, o: { light: boolean; alpha: number; seed: number; glintBeat: number }) {
  if (size < 1 || o.alpha <= 0.01) return;
  const spin = 0.7 * t + o.seed * 6.28, tilt = 0.52 + 0.06 * Math.sin(t * 0.9 + o.seed * 9), roll = -0.62 + 0.1 * Math.sin(t * 0.6 + o.seed * 5);
  const k = size / TOTAL_H;
  const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tilt), st2 = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
  const view = (x: number, y: number, z: number): V3 => {
    const x1 = x * cs + z * sn, z1 = -x * sn + z * cs; // spin about the c axis (model y)
    const y2 = y * ct - z1 * st2, z2 = y * st2 + z1 * ct; // tilt towards the viewer
    return [x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2]; // roll in the image plane
  };
  const ring = (y: number): V3[] => Array.from({ length: 6 }, (_, i) => view(R_HEX * Math.cos((i * Math.PI) / 3), y, R_HEX * Math.sin((i * Math.PI) / 3)));
  const yT = H_BODY / 2, yB = -H_BODY / 2;
  const top = ring(yT), bot = ring(yB), apT = view(0, yT + H_TIP, 0), apB = view(0, yB - H_TIP, 0);
  const faces: { p: V3[]; z: number; n: V3; cap: boolean }[] = [];
  const add = (p: V3[], cap: boolean) => {
    const a = p[0]!, b = p[1]!, d = p[2]!;
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: V3 = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]]; // outward (the faces are listed clockwise from outside)
    const m = Math.hypot(...n) || 1;
    n[0] /= m; n[1] /= m; n[2] /= m;
    faces.push({ p, z: p.reduce((s, q) => s + q[2], 0) / p.length, n, cap });
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    add([top[j]!, top[i]!, bot[i]!, bot[j]!], false);
    add([top[i]!, top[j]!, apT], true);
    add([bot[j]!, bot[i]!, apB], true);
  }
  // visible = facing the viewer (+z)
  const vis = faces.filter((f) => f.n[2] > 0.0).sort((a, b) => a.z - b.z);
  c.save();
  c.globalAlpha *= o.alpha;
  c.translate(cx, cy);
  const px = (q: V3) => [q[0] * k, -q[1] * k] as const;
  // a soft halo disc behind the crystal so it reads on any plate (dark in the dark plates, bone on paper)
  if (size >= 9) {
    const g = c.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.78);
    const h = o.light ? '238,233,223' : '10,10,11';
    g.addColorStop(0, `rgba(${h},0.55)`); g.addColorStop(1, `rgba(${h},0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, size * 0.78, 0, Math.PI * 2); c.fill();
  }
  let glint: { x: number; y: number; s: number } | null = null;
  const lw = Math.max(0.5, size / 38);
  for (const f of vis) {
    const d = Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
    const sp = Math.pow(Math.max(0, f.n[0] * HALF[0] + f.n[1] * HALF[1] + f.n[2] * HALF[2]), f.cap ? 26 : 40);
    const q = 0.16 + 0.84 * d;
    let col: string;
    if (o.light) {
      // ink specimen on paper: dark facets, a pale edge light on the lit ones
      const v = Math.round(lerp(14, 150, q * q) + 60 * sp);
      col = `rgb(${v},${Math.round(v * 0.985)},${Math.round(v * 0.96)})`;
    } else {
      // bone facets with the sand plate's amber rim light on the shadow side
      const r = lerp(70, 238, q) + 16 * sp, g = lerp(66, 233, q) + 16 * sp, b = lerp(62, 223, q) + 16 * sp;
      const rim = (1 - q) * Math.max(0, f.n[0]) * 0.55;
      col = `rgb(${Math.round(lerp(r, 255, rim))},${Math.round(lerp(g, 164, rim))},${Math.round(lerp(b, 27, rim))})`;
    }
    c.beginPath();
    f.p.forEach((q2, i) => { const [x, y] = px(q2); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); });
    c.closePath();
    c.fillStyle = col;
    c.fill();
    if (size >= 8) {
      c.lineWidth = lw; c.lineJoin = 'round';
      c.strokeStyle = o.light ? 'rgba(238,233,223,0.55)' : 'rgba(10,10,11,0.62)';
      c.stroke();
    }
    if (sp > 0.35 && (!glint || sp > glint.s)) {
      const mx = f.p.reduce((s, q2) => s + q2[0], 0) / f.p.length, my = f.p.reduce((s, q2) => s + q2[1], 0) / f.p.length;
      glint = { x: mx * k, y: -my * k, s: sp };
    }
  }
  // glint: a four-point star where a facet catches the key light (and a beat-locked twinkle)
  const tw = o.glintBeat;
  if (glint || tw > 0.05) {
    const gx = glint ? glint.x : 0, gy = glint ? glint.y : -size * 0.3;
    const a = clamp((glint ? glint.s : 0) * 1.4 + tw * 0.8);
    const L = size * (0.16 + 0.34 * a);
    c.globalCompositeOperation = o.light ? 'source-over' : 'lighter';
    c.strokeStyle = o.light ? `rgba(238,233,223,${0.9 * a})` : `rgba(255,214,150,${0.85 * a})`;
    c.lineWidth = Math.max(0.6, size / 30);
    c.beginPath();
    c.moveTo(gx - L, gy); c.lineTo(gx + L, gy); c.moveTo(gx, gy - L); c.lineTo(gx, gy + L);
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------------------------------------------- the tag
const tagSize = (e: Gag) => Math.round(lerp(13, 19, ease.inQuad(e.level)));
const fontOf = (stage: Stage, size: number) => font(F.mono(stage.red || stage.hot ? 700 : 500), size);

/** Width of the whole tag line (prefix + gap + status) at its size and letter-spacing. */
function tagMetrics(c: CanvasRenderingContext2D, text: string, e: Gag, stage: Stage) {
  const size = tagSize(e), ls = Math.max(1.5, size * 0.15);
  c.save();
  c.letterSpacing = `${ls}px`;
  c.font = fontOf(stage, size);
  const prefix = text.startsWith('UNIT 0001') ? 'UNIT 0001' : '';
  const status = prefix ? text.slice(prefix.length).trimStart() : text;
  const gap = prefix ? size * 1.1 : 0;
  const pw = prefix ? c.measureText(prefix).width : 0;
  const sw = c.measureText(status).width;
  c.restore();
  return { size, ls, prefix, status, gap, pw, sw, w: pw + gap + sw };
}

/** The tag: a small specimen label (hairline box on a dark or paper backing, so it reads on any plate) with typed mono text. */
function drawTag(c: CanvasRenderingContext2D, x: number, y: number, left: boolean, stage: Stage, since: number, t: number, e: Gag, alpha: number) {
  const text = typeof stage.tag === 'function' ? stage.tag(t) : stage.tag;
  const n = Math.min(text.length, Math.floor(since * TYPE_CPS));
  if (n <= 0 || alpha <= 0.01) return;
  const m = tagMetrics(c, text, e, stage);
  const x0 = left ? x - m.w : x;
  const pad = 8, hgt = m.size + 12;
  const ink = !!e.light;
  c.save();
  c.globalAlpha *= alpha;
  c.textBaseline = 'alphabetic';
  // backing label
  c.fillStyle = ink ? 'rgba(238,233,223,0.92)' : 'rgba(10,10,11,0.78)';
  c.fillRect(x0 - pad, y - m.size - 3, m.w + 2 * pad, hgt);
  c.strokeStyle = ink ? 'rgba(10,10,11,0.4)' : 'rgba(238,233,223,0.24)';
  c.lineWidth = 1;
  c.strokeRect(x0 - pad + 0.5, y - m.size - 3 + 0.5, m.w + 2 * pad - 1, hgt - 1);
  c.letterSpacing = `${m.ls}px`;
  c.font = fontOf(stage, m.size);
  const shown = text.slice(0, n);
  const dim = ink ? 'rgba(10,10,11,0.6)' : rgba('bone', 0.6);
  const bright = stage.red ? rgba('red', 1) : stage.hot ? rgba('signal', 1) : ink ? 'rgba(10,10,11,0.96)' : rgba('bone', lerp(0.84, 0.98, e.level));
  let cx = x0;
  if (m.prefix) {
    c.fillStyle = dim;
    c.fillText(shown.slice(0, m.prefix.length), cx, y);
    cx += m.pw + m.gap;
  }
  const typed = shown.length > m.prefix.length ? shown.slice(m.prefix.length).trimStart() : '';
  if (stage.red && typed) {
    // the stamp: a slightly crooked red box round the status
    c.save();
    c.translate(cx - 5, y - m.size + 1);
    c.rotate(-0.03);
    c.strokeStyle = rgba('red', 1); c.lineWidth = 1.6;
    c.strokeRect(0, -3, m.sw + 10, m.size + 8);
    c.restore();
  }
  c.fillStyle = bright;
  c.fillText(typed, cx, y);
  c.restore();
  return m;
}

const posOf = (e: Gag, t: number): [number, number] => (typeof e.at === 'function' ? e.at(t) : e.at);

function entryAt(t: number): number {
  for (let i = 0; i < GAG.length; i++) if (t >= GAG[i]!.t0 && t < GAG[i]!.t1) return i;
  return -1;
}

/**
 * Draw the gag for song time `t` into a 1920x1080 overlay context. `beat` is the beat phase 0..1 (optional) for the glint.
 * Called by Hud.draw after everything else, so the grain and its tag sit on top of every plate.
 */
export function drawGag(c: CanvasRenderingContext2D, t: number, beatPhase = 0) {
  const i = entryAt(t);
  if (i < 0) return;
  const e = GAG[i]!;
  const prev = i > 0 && Math.abs(GAG[i - 1]!.t1 - e.t0) < 0.06 ? GAG[i - 1]! : null;
  const age = t - e.t0;
  let [gx, gy] = posOf(e, t);
  let size = e.size;
  let alpha = 1;
  let tagFrom = 0.18; // when the tag starts typing (s after the entry)
  let hop = 1;
  if (prev && age < HOP) {
    hop = ease.inOutCubic(age / HOP);
    const [px, py] = posOf(prev, e.t0);
    gx = lerp(px, gx, hop);
    gy = lerp(py, gy, hop) - 60 * Math.sin(Math.PI * hop);
    size = lerp(prev.size, e.size, hop);
    tagFrom = HOP * 0.7;
  } else if (!prev && age < ENTRY) {
    const k = ease.outBack(age / ENTRY);
    size = e.size * k;
    gy -= 26 * (1 - ease.outCubic(age / ENTRY));
    tagFrom = ENTRY * 0.8;
  }
  // leave: fade in the last 0.2 s when nothing follows at once
  const next = GAG[i + 1];
  if (!(next && Math.abs(next.t0 - e.t1) < 0.06)) alpha *= 1 - smoothstep(e.t1 - 0.22, e.t1, t);
  const seed = hash(i, 11);
  // the tag stage in force
  let stage = e.stages[0]!, since = age - tagFrom;
  for (const s of e.stages) if (t >= s.t) { stage = s; since = s === e.stages[0] ? age - tagFrom : t - s.t; }
  // a stage change retypes (a short breath of empty field), except the first
  if (stage !== e.stages[0]) since = t - stage.t;
  // keep the whole label inside the safe margin whatever the tag says (a long tag shifts the grain left)
  {
    const tx0 = typeof stage.tag === 'function' ? stage.tag(t) : stage.tag;
    const mm = tagMetrics(c, tx0, e, stage);
    const w2 = e.line2 ? 8.8 * (typeof e.line2 === 'function' ? e.line2(t) : e.line2).length + 16 : 0;
    const span = size * 0.5 + 16 + Math.max(mm.w + 16, w2);
    if (!e.left) gx -= Math.max(0, gx + span - (1920 - 48));
    else gx += Math.max(0, 48 - (gx - span));
  }
  c.save();
  c.globalAlpha = 1;
  const light = !!e.light;
  const beatTw = Math.pow(1 - clamp(beatPhase), 6) * (0.4 + 0.6 * hash(Math.floor(t * 2), 5)) * smoothstep(0.55, 1, e.level + 0.25);
  drawGrain(c, gx, gy, size, t, { light, alpha, seed, glintBeat: beatTw * 0.5 });
  // tag (starts once the hop has landed)
  if (hop >= 0.35) {
    const tx = gx + (e.left ? -1 : 1) * (size * 0.5 + 16);
    const fs = tagSize(e);
    const ty = gy + fs * 0.36;
    drawTag(c, tx, ty, !!e.left, stage, since, t, e, alpha);
    if (e.line2) {
      const t2 = typeof e.line2 === 'function' ? e.line2(t) : e.line2;
      const w2 = 12 * 0.6 * t2.length + 1.6 * t2.length;
      c.save();
      c.globalAlpha *= alpha * smoothstep(0.2, 0.8, since);
      c.font = font(F.mono(400), 12);
      c.letterSpacing = '1.6px';
      const x2 = e.left ? tx - w2 : tx;
      c.fillStyle = light ? 'rgba(238,233,223,0.9)' : 'rgba(10,10,11,0.66)';
      c.fillRect(x2 - 8, ty + 9, w2 + 16, 22);
      c.fillStyle = light ? 'rgba(10,10,11,0.7)' : rgba('bone', 0.62);
      c.fillText(t2, x2, ty + 24);
      c.restore();
    }
  }
  c.restore();
}
