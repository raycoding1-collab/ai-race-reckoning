// Geography for the nautical chart (island, and the key's opening frame): coastlines in km on an
// equirectangular plane around 25 N / 121 E, a signed-distance + depth + elevation field baked on the
// CPU, and the compass rose drawn as engraving. Coordinates are simplified, not survey data; the strait
// is nudged so that its narrowest width is exactly 130 km (the figure in the lyric's footnote).
import * as THREE from 'three';
import { hash, lerp, smoothstep, TAU } from '../engine/util';

export type P = { x: number; y: number };
/** The handoff pose: the rose at ROSE_END (screen px) with outer radius ROSE_END.r, camera at END_Z px/km, north up. */
export const ROSE_END = { x: 1440, y: 540, r: 170 };
export const END_Z = 3.0;
const COS25 = Math.cos((25 * Math.PI) / 180);
export const kmOf = (lon: number, lat: number): P => ({ x: (lon - 121) * COS25 * 111.32, y: -(lat - 25) * 110.57 });
export const ROSE_LONLAT = { lon: 122.62, lat: 24.15 };
export const lonLatOf = (p: P) => ({ lon: 121 + p.x / (COS25 * 111.32), lat: 25 - p.y / 110.57 });

const TAIWAN_LL: [number, number][] = [
  [121.55, 25.30], [121.78, 25.28], [121.92, 25.13], [122.00, 25.00], [121.92, 24.80], [121.85, 24.58], [121.78, 24.35],
  [121.65, 24.10], [121.62, 23.90], [121.50, 23.55], [121.40, 23.30], [121.38, 23.10], [121.25, 22.85], [121.10, 22.62],
  [120.92, 22.38], [120.86, 22.10], [120.82, 21.93], [120.70, 22.03], [120.62, 22.30], [120.52, 22.52], [120.30, 22.58],
  [120.20, 22.72], [120.12, 22.98], [120.10, 23.20], [120.06, 23.50], [120.15, 23.78], [120.22, 24.08], [120.45, 24.28],
  [120.62, 24.50], [120.80, 24.72], [120.95, 24.84], [121.15, 25.02], [121.30, 25.12], [121.45, 25.25],
];
// the mainland (Fujian / Guangdong) coast, north to south, closed far inland
const MAIN_LL: [number, number][] = [
  [120.60, 27.60], [120.30, 27.20], [120.05, 26.80], [119.70, 26.55], [119.60, 26.10], [119.75, 25.75], [119.82, 25.52],
  [119.62, 25.38], [119.35, 25.18], [119.08, 25.06], [118.92, 24.90], [118.68, 24.66], [118.30, 24.45], [117.98, 24.32],
  [117.72, 24.05], [117.45, 23.82], [117.08, 23.58], [116.70, 23.38], [116.25, 23.20], [115.80, 22.92], [115.30, 22.76],
  [114.70, 22.55], [114.2, 22.45], [113.0, 22.0], [112.0, 22.0], [112.0, 27.6],
];
function ellipse(lon: number, lat: number, rx: number, ry: number, rot: number, n = 9): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry * (0.85 + 0.3 * hash(lon * 7, i));
    return [lon + x * Math.cos(rot) - y * Math.sin(rot), lat + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number];
  });
}
const ISLETS_LL: [number, number][][] = [
  // Penghu
  ellipse(119.58, 23.57, 0.075, 0.05, 0.6), ellipse(119.52, 23.66, 0.05, 0.03, 0.2, 7), ellipse(119.64, 23.65, 0.04, 0.06, 1.2, 7),
  ellipse(119.50, 23.52, 0.035, 0.045, 0.1, 7), ellipse(119.66, 23.50, 0.03, 0.035, 0.9, 6), ellipse(119.61, 23.76, 0.03, 0.025, 0.3, 6),
  // Kinmen, Matsu, Xiamen's islet
  ellipse(118.38, 24.45, 0.14, 0.06, 0.1), ellipse(119.95, 26.15, 0.05, 0.035, 0.4, 7), ellipse(120.0, 26.16, 0.03, 0.02, 1.0, 6),
  // Pingtan
  ellipse(119.78, 25.52, 0.11, 0.09, 0.5),
];

export interface Geo {
  taiwan: P[]; main: P[]; islets: P[][];
  /** where the narrowest part of the strait is: mainland tip and Taiwan point (km) */
  tipA: P; tipB: P; width: number;
  mid: P;
  rose: P;
  field: { tex: THREE.DataTexture; min: P; size: P; n: number };
  depthAt(p: P): number;
  seaDist(p: P): number;
  isLand(p: P): boolean;
}

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function polyDist(p: P, poly: P[]): number {
  let m = 1e9;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, segDist(p, poly[j]!, poly[i]!));
  return m;
}
function inside(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** smooth value noise for terrain */
function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const f = (t: number) => t * t * (3 - 2 * t);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return lerp(lerp(a, b, f(fx)), lerp(c, d, f(fx)), f(fy));
}
function chaikin(poly: P[], iters = 2, closed = true): P[] {
  let p = poly;
  for (let k = 0; k < iters; k++) {
    const q: P[] = [];
    const n = closed ? p.length : p.length - 1;
    if (!closed) q.push(p[0]!);
    for (let i = 0; i < n; i++) {
      const a = p[i]!, b = p[(i + 1) % p.length]!;
      q.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) q.push(p[p.length - 1]!);
    p = q;
  }
  return p;
}

let CACHE: Geo | null = null;
export function buildGeo(): Geo {
  if (CACHE) return CACHE;
  const taiwan = chaikin(TAIWAN_LL.map(([lo, la]) => kmOf(lo, la)), 2);
  let main = MAIN_LL.map(([lo, la]) => kmOf(lo, la));
  // keep the corner points of the closing box sharp: only smooth the coast part
  const coastN = 23;
  main = [...chaikin(main.slice(0, coastN), 2, false), ...main.slice(coastN)].map((q) => ({ ...q }));
  const islets = ISLETS_LL.map((e) => e.map(([lo, la]) => kmOf(lo, la)));
  // narrowest strait: Pingtan's seaward point to the Taiwan coast; shift the mainland and islets in x until it is 130 km
  const pingtan = islets[islets.length - 1]!;
  const nearest = (poly: P[], q: P) => { let best = 1e9, bp = poly[0]!; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j]!, b = poly[i]!; const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)); const c = { x: a.x + t * dx, y: a.y + t * dy }; const d = Math.hypot(q.x - c.x, q.y - c.y); if (d < best) { best = d; bp = c; } } return { d: best, p: bp }; };
  const strait = () => {
    // the pair of closest points between the Taiwan coast and anything on the mainland side (mainland + Pingtan)
    let best = 1e9, A = main[0]!, B = taiwan[0]!;
    for (const poly of [main, pingtan]) for (const q of poly) { const r = nearest(taiwan, q); if (r.d < best) { best = r.d; A = q; B = r.p; } }
    return { d: best, A, B };
  };
  for (let it = 0; it < 14; it++) {
    const shift = (strait().d - 130) * 0.9; // > 0: too wide, so the mainland moves east
    for (const q of main) q.x += shift;
    for (let i = 6; i < islets.length; i++) for (const q of islets[i]!) q.x += shift; // Penghu (0-5) stays mid-strait
  }
  const S = strait();

  // ---- field
  const n = 640, min = { x: -480, y: -310 }, size = { x: 760, y: 740 };
  const data = new Uint16Array(n * n * 4);
  const axisLL: [number, number][] = [[121.55, 24.95], [121.22, 24.38], [121.05, 23.78], [120.96, 23.47], [120.92, 23.0], [120.86, 22.55], [120.82, 22.0]];
  const axis = axisLL.map(([lo, la]) => kmOf(lo, la));
  const axisX = (y: number) => { for (let i = 1; i < axis.length; i++) if (y <= axis[i]!.y || i === axis.length - 1) { const a = axis[i - 1]!, b = axis[i]!; return lerp(a.x, b.x, Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)))); } return axis[0]!.x; };
  const isleAll = islets;
  const half = THREE.DataUtils.toHalfFloat;
  const fieldAt = (p: P) => {
    const dT = polyDist(p, taiwan), inT = inside(p, taiwan);
    let dO = polyDist(p, main), inO = inside(p, main);
    for (const e of isleAll) { const d = polyDist(p, e); if (d < dO) dO = d; if (inside(p, e)) inO = true; }
    const sT = inT ? -dT : dT, sO = inO ? -dO : dO;
    const s = Math.min(sT, sO);
    // depth (m) for sea
    let depth = 0;
    if (s > 0) {
      const ax = axisX(p.y);
      const east = p.x > ax;
      const eastW = smoothstep(-20, 20, p.x - ax) * (1 - smoothstep(60, 140, Math.max(0, -p.y - 0) * 0 + Math.max(0, p.y - 140) * 0));
      const shelf = 14 + Math.min(s, 220) * 1.45;
      const trough = 55 * Math.exp(-Math.pow((p.x - (ax - 46)) / 22, 2)) * smoothstep(-80, 0, p.y) * (1 - smoothstep(60, 140, p.y));
      const steep = 90 + Math.min(s, 260) * 36;
      const southDeep = smoothstep(150, 330, p.y) * 1800;
      const nz = 0.85 + 0.3 * vnoise(p.x * 0.05, p.y * 0.05, 3);
      const wd = Math.min(shelf + trough, 140) * nz;
      depth = Math.min(5500, lerp(wd, steep + southDeep, east ? eastW : 0.0) * (east ? 1 : 1));
      if (!east) depth = Math.min(5500, wd + southDeep * smoothstep(200, 330, p.y));
      depth = Math.max(3, depth);
    }
    // elevation (km) for land
    let elev = 0;
    if (sT < 0) {
      const dAx = Math.min(...axis.slice(1).map((b, i) => segDist(p, axis[i]!, b)));
      const lat = lonLatOf(p).lat;
      const peak = 0.65 + 0.35 * Math.exp(-Math.pow((lat - 23.5) / 0.9, 2));
      elev = (3.95 * peak * Math.exp(-Math.pow(dAx / 20, 2)) + 0.25 * Math.exp(-Math.pow((dAx + 20) / 50, 2))) * (0.75 + 0.25 * vnoise(p.x * 0.09, p.y * 0.09, 5)) * smoothstep(0, 6, -sT);
    } else if (sO < 0) {
      elev = (0.1 + 0.55 * vnoise(p.x * 0.03, p.y * 0.03, 8) * smoothstep(5, 60, -sO) + 0.2 * vnoise(p.x * 0.09, p.y * 0.09, 2) * smoothstep(0, 30, -sO));
    }
    return { sT, sO, depth, elev };
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const p = { x: min.x + ((i + 0.5) / n) * size.x, y: min.y + ((j + 0.5) / n) * size.y };
    const f = fieldAt(p);
    const o = (j * n + i) * 4;
    data[o] = half(f.sT / 100); data[o + 1] = half(f.sO / 100); data[o + 2] = half(f.depth / 1000); data[o + 3] = half(f.elev);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const rose = kmOf(ROSE_LONLAT.lon, ROSE_LONLAT.lat);
  CACHE = {
    taiwan, main, islets, tipA: S.A, tipB: S.B, width: S.d, mid: { x: (S.A.x + S.B.x) / 2, y: (S.A.y + S.B.y) / 2 }, rose,
    field: { tex, min, size, n },
    depthAt: (p) => fieldAt(p).depth,
    seaDist: (p) => { const f = fieldAt(p); return Math.min(f.sT, f.sO); },
    isLand: (p) => { const f = fieldAt(p); return Math.min(f.sT, f.sO) < 0; },
  };
  return CACHE;
}

// ------------------------------------------------------------------ the compass rose (engraved)
/** Draw the rose at (cx, cy), outer radius R (px), rotated by rot radians. ink: css colour. */
export function drawRose(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot: number, ink: string, o: { alpha?: number; ticks?: boolean; star?: number; font?: string } = {}) {
  c.save();
  c.translate(cx, cy); c.rotate(rot);
  c.globalAlpha = o.alpha ?? 1;
  c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'butt';
  const lw = Math.max(1, R / 85);
  // rings
  c.lineWidth = lw * 1.8; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
  c.lineWidth = lw * 0.9; c.beginPath(); c.arc(0, 0, R * 0.90, 0, TAU); c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.745, 0, TAU); c.stroke();
  if (o.ticks !== false) {
    for (let d = 0; d < 360; d++) {
      const a = (d / 360) * TAU, big = d % 30 === 0, mid = d % 10 === 0, five = d % 5 === 0;
      const r0 = R * (big ? 0.90 : mid ? 0.935 : five ? 0.95 : 0.965), r1 = R;
      c.lineWidth = lw * (big ? 1.6 : 0.8);
      c.beginPath(); c.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); c.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1); c.stroke();
    }
    // degree numerals every 30
    c.font = `500 ${Math.max(7, R * 0.062)}px "IBM Plex Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 30) {
      const a = (d / 360) * TAU, rr = R * 0.82;
      c.save(); c.translate(Math.sin(a) * rr, -Math.cos(a) * rr); c.rotate(a);
      c.fillText(String(d).padStart(3, '0'), 0, 0); c.restore();
    }
  }
  // 32-point star
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 32; i++) {
    const card = i % 8 === 0, inter = i % 4 === 0, sec = i % 2 === 0;
    const L = (card ? 0.88 : inter ? 0.66 : sec ? 0.50 : 0.36) * (o.star ?? 0.84) * R / 0.84 * (card ? 1.0 : 1.0);
    const W = (card ? 0.115 : inter ? 0.085 : sec ? 0.06 : 0.04) * R;
    pts.push([(i / 32) * TAU, Math.min(L, R * 0.86), W]);
  }
  const order = pts.map((p, i) => i).sort((a, b) => pts[a]![1] - pts[b]![1]);
  for (const i of order) {
    const [a, L, W] = pts[i]!;
    const tx = Math.sin(a) * L, ty = -Math.cos(a) * L;
    const nx = Math.cos(a) * W, ny = Math.sin(a) * W;
    // right half: solid ink; left half: paper with hatching
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(0, 0); c.lineTo(nx, ny); c.closePath(); c.fill();
    c.lineWidth = lw * 0.8;
    c.beginPath(); c.moveTo(tx, ty); c.lineTo(-nx, -ny); c.lineTo(0, 0); c.closePath();
    c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
    c.stroke();
    if (i % 8 === 0 || i % 4 === 0) {
      c.save(); c.beginPath(); c.moveTo(tx, ty); c.lineTo(-nx, -ny); c.lineTo(0, 0); c.closePath(); c.clip();
      c.lineWidth = lw * 0.6;
      const steps = Math.round(L / (R * 0.025));
      for (let s = 1; s < steps; s++) { const k = s / steps; c.beginPath(); c.moveTo(Math.sin(a) * L * k - nx * 1.2, -Math.cos(a) * L * k - ny * 1.2); c.lineTo(Math.sin(a) * L * k + nx * 1.2, -Math.cos(a) * L * k + ny * 1.2); c.stroke(); }
      c.restore();
    }
  }
  // N mark: a fleur-like arrowhead above the ring and the letter
  c.beginPath(); c.moveTo(0, -R * 1.02); c.lineTo(R * 0.07, -R * 1.14); c.lineTo(0, -R * 1.10); c.lineTo(-R * 0.07, -R * 1.14); c.closePath(); c.fill();
  c.font = `700 ${R * 0.16}px "Cormorant-600", serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText('N', 0, -R * 1.20);
  c.beginPath(); c.arc(0, 0, R * 0.045, 0, TAU); c.fill();
  c.restore();
}
