// `machine` (bars 8-10, 15-18.75 s): exploded axonometric cutaway, technical-manual engraving.
// It opens face-on on the collector mirror (its zones are laser's isotherm rings, same radii), then the
// camera swings to an axonometric view while the exploded parts collapse into the scanner one per
// syllable (illuminator, reticle stage, projection optics, wafer stage), with dashed assembly guides,
// hidden-line dashes and hatched faces. The beam traces the light path mirror by mirror on the 16ths
// (11 mirrors). "and the whole world's waiting": the camera cranes out one word per decade, through the
// hall roof, to a dot-matrix world map at night; every lit city sends a queue line to Veldhoven, and an
// order counter ticks. Out: the queue lines bundle into one cable that drops to tons' crane hook.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F } from '../engine/type';
import { clamp, ease, keys, lerp, prog, pulse, hash, type Key } from '../engine/util';
import { lineByScene } from './_motifs';
import { BT, H_LASER_MACHINE, H_MACHINE_TONS, beamHead, karaoke, mono, wordP } from './sand-kit';
import { isLand, VELDHOVEN, WANTS } from './machine-world';

type V3 = [number, number, number];
type RGB = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const sc = (c: readonly number[], k: number): RGB => [c[0]! * k, c[1]! * k, c[2]! * k];

interface Cam { r: V3; u: V3; f: V3; s: number; L: V3; Q: [number, number] }
interface Box { name: string; min: V3; max: V3; off: V3; ta: number; label: string; tone: number }
interface Mirror { c: V3; n: V3; rad: number; th: number; box: number }

const COLL: V3 = [-3.5, 1.2, 0];
const R0 = H_LASER_MACHINE.radii[H_LASER_MACHINE.radii.length - 1]!;
const COLL_R = 0.62;
const S0 = R0 / COLL_R; // px per metre on the first frame (rings = laser's rings)
const M_PER_DEG = 111e3;
const mapPt = (lon: number, lat: number): V3 => [(lon - VELDHOVEN.lon) * M_PER_DEG, 0, -(lat - VELDHOVEN.lat) * M_PER_DEG];

export default class MachineScene extends Scene {
  ink = new LineBatch(90000);
  beam = new LineBatch(20000);
  hud = new Layer2D();
  line: any;
  boxes: Box[] = []; mirrors: Mirror[] = []; path: V3[] = []; segT: [number, number][] = [];
  zk: Key[] = []; land: [number, number][] = [];
  queues: { a: V3; ctl: V3; t0: number; t1: number; name: string }[] = [];

  override init() {
    this.line = lineByScene(this.ctx.lyrics, 'machine');
    const w = this.line.words;
    const sy = (i: number, j: number) => w[i].syl[j][0];
    // parts (assembled positions, metres) and where they fly in from
    this.boxes = [
      { name: 'src', min: [-4.2, 0.3, -0.75], max: [-2.6, 2.1, 0.75], off: [0, 0, 0], ta: 0, label: 'Sn PLASMA SOURCE · COLLECTOR', tone: 0.5 },
      { name: 'ill', min: [-1.3, 0.55, -0.6], max: [0.55, 2.75, 0.6], off: [-0.6, 2.6, 1.8], ta: w[1].start, label: 'ILLUMINATOR · 4 MIRRORS', tone: 0.6 },
      { name: 'ret', min: [-0.5, 3.0, -0.8], max: [2.0, 3.28, 0.8], off: [0.4, 2.4, -0.5], ta: sy(2, 0) - BT(0.25) * 0.0, label: 'RETICLE STAGE', tone: 0.4 },
      { name: 'pob', min: [0.05, 0.12, -0.62], max: [1.65, 2.85, 0.62], off: [3.0, 0.4, 1.2], ta: sy(2, 1), label: 'PROJECTION OPTICS · 6 MIRRORS', tone: 0.7 },
      { name: 'waf', min: [-0.4, -0.62, -0.9], max: [2.2, -0.36, 0.9], off: [0.2, -2.6, 0.6], ta: sy(2, 1) + BT(0.5), label: 'WAFER STAGE · 300 mm', tone: 0.45 },
    ];
    // light path: plasma -> collector -> IF -> 4 illuminator mirrors -> reticle -> 6 POB mirrors -> wafer
    const P: V3[] = [[-2.95, 1.2, 0], [-3.5, 1.2, 0], [-1.6, 1.25, 0], [-1.0, 0.85, 0], [-0.6, 2.4, 0.05], [-0.15, 0.95, 0], [0.3, 2.55, 0], [0.75, 3.0, 0],
      [1.4, 2.4, 0], [0.35, 2.0, 0], [1.4, 1.55, 0], [0.35, 1.1, 0], [1.4, 0.7, 0], [0.55, 0.3, 0], [0.85, -0.36, 0]];
    this.path = P;
    const mirrorIdx = [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13];
    const boxOf = (i: number) => (i === 1 ? 0 : i <= 6 ? 1 : 3);
    this.segT = [];
    const tB = this.ctx.start;
    this.segT.push([tB, tB + 0.06], [tB + 0.06, tB + 0.117]);
    for (let k = 2; k < P.length - 1; k++) { const a = tB + 0.117 + (k - 2) * 0.1055; this.segT.push([a, a + 0.1055]); }
    this.mirrors = mirrorIdx.map((i) => {
      const din = nrm(sub(P[i]!, P[i - 1]!)), dout = nrm(sub(P[i + 1]!, P[i]!));
      return { c: P[i]!, n: nrm(sub(dout, din)), rad: i === 1 ? COLL_R : i <= 6 ? 0.2 : 0.17, th: this.segT[i - 1]![1], box: boxOf(i) };
    });
    // crane-out: log10(px per metre), one decade-ish per word
    const X = ease.outExpo;
    const lgW = Math.log10(1790 / (360 * M_PER_DEG));
    this.zk = [[0, Math.log10(S0)], [this.ctx.start, Math.log10(S0)], [this.ctx.start + 0.5, Math.log10(205), X], [w[3].start, Math.log10(190), ease.linear],
      [w[3].start + 0.2, 1.35, X], [w[4].start, 1.28, ease.linear], [w[4].start + 0.2, 0.5, X], [w[5].start, 0.42, ease.linear],
      [w[5].start + 0.22, -3.3, X], [w[6].start, -3.36, ease.linear], [w[6].start + 0.3, lgW, X], [18.75, lgW + 0.05, ease.linear]];
    for (let lat = -58; lat <= 82; lat += 0.5) for (let lon = -179.75; lon <= 179.75; lon += 0.5) if (isLand(lon, lat)) this.land.push([lon, lat]);
    const tq0 = w[6].start + 0.12;
    this.queues = WANTS.map(([name, lon, lat], i) => {
      const a = mapPt(lon, lat), b = mapPt(VELDHOVEN.lon, VELDHOVEN.lat);
      const mid = mul(add(a, b), 0.5), d = sub(b, a);
      const ctl = add(mid, [d[2] * 0.22, 0, -Math.abs(d[0]) * 0.18 - d[0] * 0.0]);
      const t0 = tq0 + (i / WANTS.length) * 0.95 + hash(i, 4) * 0.08;
      return { a, ctl, t0, t1: t0 + 0.42 + 0.25 * hash(i, 5), name };
    });
  }

  cam(t: number): Cam {
    const w = this.line.words, t0 = this.ctx.start;
    const k0 = ease.outExpo(prog(t, t0, t0 + 0.5));
    const kc = ease.inOutCubic(prog(t, w[3].start, w[5].start + 0.2));
    let yaw = lerp(Math.PI / 2, 0.52, k0); yaw = lerp(yaw, 0, kc);
    const pitch = lerp(lerp(0, 0.47, k0), 1.53, kc);
    const s = Math.pow(10, keys(t, this.zk));
    const mc: V3 = [-0.8, 1.3, 0];
    let L: V3 = add(mul(COLL, 1 - k0), mul(mc, k0));
    // on the world view the map's centre comes to the frame centre
    const km = ease.inOutCubic(prog(t, w[6].start, w[6].start + 0.3));
    L = add(mul(L, 1 - km), mul(mapPt(10, 18), km));
    let Q: [number, number] = [960, 540];
    // out: Veldhoven slides to the top edge for the cable drop
    const ko = ease.inOutExpo(prog(t, 18.28, 18.62));
    L = add(mul(L, 1 - ko), mul(mapPt(VELDHOVEN.lon, VELDHOVEN.lat), ko));
    Q = [960, lerp(540, -6, ko)];
    const f: V3 = nrm([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
    const upW: V3 = pitch > 1.2 ? nrm([0, Math.cos(pitch), -1]) : [0, 1, 0];
    const r = nrm(cross(upW, f));
    const u = cross(f, r);
    return { r, u, f, s, L, Q };
  }
  P(c: Cam, p: V3): [number, number] {
    const d = sub(p, c.L);
    return [c.Q[0] + dot(d, c.r) * c.s, c.Q[1] - dot(d, c.u) * c.s];
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, w = this.line.words;
    clearRT(renderer, out, LIN.ink);
    const c = this.cam(t);
    const I = this.ink; I.clear();
    const B = this.beam; B.clear();
    const T = this.hud; T.clear();
    const x = T.ctx;
    const lgS = Math.log10(c.s);
    const machA = 1 - prog(lgS, 0.3, -0.7);
    const seg = (a: [number, number], b: [number, number], wd: number, col: RGB, al = 1) => I.seg2(a[0], a[1], b[0], b[1], wd, col, al);
    const dash = (a: [number, number], b: [number, number], wd: number, col: RGB, al: number, on = 7, off = 6) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
      for (let s = 0; s < L; s += on + off) {
        const e = Math.min(L, s + on);
        I.seg2(lerp(a[0], b[0], s / L), lerp(a[1], b[1], s / L), lerp(a[0], b[0], e / L), lerp(a[1], b[1], e / L), wd, col, al);
      }
    };
    const bone = LIN.bone, ash = LIN.ash, gra = LIN.graphite;
    if (machA > 0.001) {
      // ---- the parts
      for (let bi = 0; bi < this.boxes.length; bi++) {
        const b = this.boxes[bi]!;
        const k = bi === 0 ? 1 : ease.outExpo(prog(t, b.ta - 0.03, b.ta + 0.2));
        const o = mul(b.off, 1 - k);
        if (bi > 0 && k < 1) {
          // assembly guide: dashed line from the part to its slot
          const cA = mul(add(b.min, b.max), 0.5);
          dash(this.P(c, add(cA, o)), this.P(c, cA), 1, sc(ash, 0.5 * machA), 1, 4, 5);
        }
        this.drawBox(c, b, o, seg, dash, machA * prog(t, this.ctx.start + 0.04, this.ctx.start + 0.22), t);
      }
      // ---- the collector rings (face-on first: laser's isotherms)
      const ringsA = machA;
      const coll = this.mirrors[0]!;
      for (let k = 0; k < H_LASER_MACHINE.radii.length; k++) {
        const rad = (H_LASER_MACHINE.radii[k]! / R0) * COLL_R;
        this.circle(c, coll.c, coll.n, rad, (a, b2, front) => (front ? seg(a, b2, 1.3, sc(bone, 0.85 * ringsA)) : dash(a, b2, 1, sc(gra, 0.8 * ringsA), 1, 5, 5)), 72);
      }
      // ---- mirrors
      for (let mi = 0; mi < this.mirrors.length; mi++) {
        const m = this.mirrors[mi]!;
        const b = this.boxes[m.box]!;
        const k = m.box === 0 ? 1 : ease.outExpo(prog(t, b.ta - 0.03, b.ta + 0.2));
        const cc = add(m.c, mul(b.off, 1 - k));
        const hit = t >= m.th ? 1 : 0;
        const hot = pulse(t, m.th, 0.12) * hit;
        if (mi > 0) {
          this.circle(c, cc, m.n, m.rad, (a, b2, front) => (front ? seg(a, b2, 1.4, sc(hit ? LIN.signal : bone, (hit ? 1.4 + 3 * hot : 0.9) * machA)) : dash(a, b2, 1, sc(gra, machA), 1, 4, 4)), 36);
          // hatched back: chords
          const e1 = nrm(cross(m.n, [0, 0, 1])), e2 = cross(m.n, e1);
          for (let h = -4; h <= 4; h++) {
            const v = (h / 5) * m.rad, hw = Math.sqrt(Math.max(0, m.rad * m.rad - v * v));
            const a = add(cc, add(mul(e2, v), mul(e1, -hw))), b2 = add(cc, add(mul(e2, v), mul(e1, hw)));
            seg(this.P(c, a), this.P(c, b2), 0.9, sc(hit ? LIN.signal : ash, (hit ? 0.6 + 2 * hot : 0.45) * machA));
          }
        }
      }
      // ---- the beam: one segment per 16th
      let head: [number, number] | null = null;
      for (let i = 0; i < this.path.length - 1; i++) {
        const [ta, tb] = this.segT[i]!;
        if (t < ta) break;
        const bA = this.boxOfPt(i), bB = this.boxOfPt(i + 1);
        const pa = add(this.path[i]!, this.offAt(bA, t)), pb = add(this.path[i + 1]!, this.offAt(bB, t));
        const k = clamp((t - ta) / (tb - ta));
        const sa = this.P(c, pa), sb = this.P(c, pb);
        const e: [number, number] = [lerp(sa[0], sb[0], k), lerp(sa[1], sb[1], k)];
        B.seg2(sa[0], sa[1], e[0], e[1], 7, sc(LIN.signal, 0.35 * machA), 1);
        B.seg2(sa[0], sa[1], e[0], e[1], 2.2, sc(LIN.ember, 2.4 * machA), 1);
        if (k < 1) head = e;
      }
      if (head) beamHead(B, head[0], head[1], t, 0.9, machA);
      // the plasma point
      const pp = this.P(c, this.path[0]!);
      beamHead(B, pp[0], pp[1], t, 0.8 + 0.3 * Math.sin(t * 40), machA * (t < this.segT[0]![0] ? 0 : 1));
    }

    // ---- the hall roof (crane-out), then the world map at night
    const hallA = prog(lgS, 1.6, 1.0) * (1 - prog(lgS, -0.4, -1.1));
    if (hallA > 0.001) {
      const H: V3 = [-25, 0, -14], H2: V3 = [25, 14, 14];
      for (let xx = H[0]; xx <= H2[0] + 1e-6; xx += 5) {
        dash(this.P(c, [xx, H2[1], H[2]]), this.P(c, [xx, H2[1], H2[2]]), 1, sc(ash, 0.7 * hallA), 1, 10, 4);
      }
      for (const zz of [H[2], H2[2]]) seg(this.P(c, [H[0], H2[1], zz]), this.P(c, [H2[0], H2[1], zz]), 1.4, sc(bone, 0.85 * hallA));
      for (const xx of [H[0], H2[0]]) seg(this.P(c, [xx, H2[1], H[2]]), this.P(c, [xx, H2[1], H2[2]]), 1.4, sc(bone, 0.85 * hallA));
      mono(x, 'HALL 4 · CLEANROOM ISO 1', ...this.P(c, [H[0], H2[1], H[2]]).map((v, i) => v + (i ? -10 : 0)) as [number, number], 14, rgba('bone', 0.7 * hallA), 500);
    }
    const mapA = prog(lgS, -0.6, -1.6);
    const outK = prog(t, 18.45, 18.72);
    if (mapA > 0.001) {
      const stepDeg = [0.5, 1, 2].find((d) => d * M_PER_DEG * c.s >= 8.5) ?? 2;
      const dotR = clamp(stepDeg * M_PER_DEG * c.s * 0.34, 1.6, 7);
      for (const [lon, lat] of this.land) {
        if (stepDeg > 0.5 && (Math.abs(((lon + 179.75) / stepDeg) % 1) > 1e-6 || Math.abs(((lat + 58) / stepDeg) % 1) > 1e-6)) continue;
        const p = this.P(c, mapPt(lon, lat));
        if (p[0] < -10 || p[0] > 1930 || p[1] < -10 || p[1] > 1090) continue;
        I.seg2(p[0], p[1], p[0] + 0.01, p[1], dotR, sc(gra, 1.3 * mapA * (1 - outK)), 1);
      }
      // lit cities and their queue lines to Veldhoven
      const V = this.P(c, mapPt(VELDHOVEN.lon, VELDHOVEN.lat));
      let arrived = 0;
      for (let i = 0; i < this.queues.length; i++) {
        const q = this.queues[i]!;
        const pa = this.P(c, q.a);
        const lit = prog(t, q.t0 - 0.15, q.t0);
        I.seg2(pa[0], pa[1], pa[0] + 0.01, pa[1], 6, sc(LIN.signal, 1.6 * lit * mapA * (1 - outK)), 1);
        if (t < q.t0) continue;
        const k = ease.inOutCubic(clamp((t - q.t0) / (q.t1 - q.t0)));
        if (k >= 1) arrived++;
        const pc = this.P(c, q.ctl), N = 28;
        let prev = pa;
        for (let j = 1; j <= N * k; j++) {
          const s = j / N, a = (1 - s) * (1 - s), bb = 2 * (1 - s) * s, cc2 = s * s;
          const p: [number, number] = [a * pa[0] + bb * pc[0] + cc2 * V[0], a * pa[1] + bb * pc[1] + cc2 * V[1]];
          B.seg2(prev[0], prev[1], p[0], p[1], 1.4, sc(LIN.signal, 0.9 * mapA * (1 - 0.85 * outK)), 1);
          prev = p;
        }
        if (k < 1) B.seg2(prev[0], prev[1], prev[0] + 0.01, prev[1], 4, sc(LIN.ember, 3 * mapA), 1);
        if (k < 1 && lit > 0.5 && c.s < 1e-4) mono(x, q.name, pa[0] + 8, pa[1] - 6, 11, rgba('bone', 0.55 * mapA * (1 - k)), 500);
      }
      beamHead(B, V[0], V[1], t, 1.1 + 0.4 * pulse(t, w[7].start, 0.2), mapA);
      if (c.s < 1e-3) {
        mono(x, 'VELDHOVEN', V[0] + 14, V[1] + 26, 15, rgba('ember', mapA * (1 - outK)), 600, 'left', 1);
        x.globalAlpha = mapA * (1 - outK);
        mono(x, 'ORDERS IN QUEUE', 1808, 128, 15, rgba('bone', 0.6), 500, 'right', 2);
        x.font = `130px "${F.archivo(100, 900)}"`; x.fillStyle = rgba('signal', 1); x.textAlign = 'right';
        x.fillText(String(arrived).padStart(2, '0'), 1808, 250); x.textAlign = 'left';
        x.globalAlpha = 1;
      }
      // out: the cable
      const kc = ease.outExpo(prog(t, 18.42, 18.66));
      if (kc > 0) {
        const y1 = lerp(V[1], H_MACHINE_TONS.y, kc);
        B.seg2(H_MACHINE_TONS.x, V[1], H_MACHINE_TONS.x, y1, H_MACHINE_TONS.w, sc(LIN.bone, 0.9), 1);
        B.seg2(H_MACHINE_TONS.x, V[1], H_MACHINE_TONS.x, y1, 2, sc(LIN.ember, 1.6 * (1 - kc * 0.6)), 1);
      }
    }
    I.render(renderer, out);
    B.render(renderer, out);

    // ---- type
    const tf = F.archivo(100, 900);
    const topA = 1 - prog(t, w[3].start, w[3].start + 0.25);
    if (topA > 0) {
      x.globalAlpha = topA;
      let xx = 112;
      for (const i of [0, 1, 2]) {
        const p = wordP(w[i], t);
        const ww = karaoke(x, w[i].w.toUpperCase(), xx, 248, tf, 140, p, rgba(i === 0 ? 'signal' : 'bone', 1), rgba('bone', 0.22));
        xx += ww + 36;
      }
      mono(x, 'EUV SCANNER · 11 MIRRORS · λ 13.5 nm · EXPLODED VIEW', 116, 292, 15, rgba('bone', 0.6), 500, 'left', 1.5);
      mono(x, 'LOT 7A-0042 · STEP 04/31 · EXPOSURE', 1808, 1002, 14, rgba('bone', 0.5), 500, 'right', 1.5);
      // part labels with leaders
      for (let bi = 0; bi < this.boxes.length; bi++) {
        const b = this.boxes[bi]!;
        const k = bi === 0 ? 1 : ease.outExpo(prog(t, b.ta - 0.03, b.ta + 0.2));
        const top = this.P(c, add([b.max[0], b.max[1], b.min[2]], mul(b.off, 1 - k)));
        const la = prog(t, this.ctx.start + 0.3 + bi * 0.05, this.ctx.start + 0.45 + bi * 0.05) * machA;
        if (la <= 0) continue;
        x.strokeStyle = rgba('bone', 0.5 * la); x.lineWidth = 1;
        x.beginPath(); x.moveTo(top[0], top[1]); x.lineTo(top[0] + 28, top[1] - 28); x.lineTo(top[0] + 60, top[1] - 28); x.stroke();
        mono(x, b.label, top[0] + 64, top[1] - 24, 13, rgba('bone', 0.75 * la), 500, 'left', 1);
      }
      x.globalAlpha = 1;
    }
    // and the whole world's waiting
    if (t > w[3].start - 0.3) {
      x.globalAlpha = 1 - outK;
      const yb = 1000;
      let xx = 112;
      const big = F.archivo(100, 900);
      for (const i of [3, 4, 5]) { const ww = karaoke(x, w[i].w.toUpperCase(), xx, yb - 150, big, 120, wordP(w[i], t), rgba('bone', 1), rgba('bone', 0.2)); xx += ww + 30; }
      xx = 112;
      for (const i of [6, 7]) { const ww = karaoke(x, w[i].w.toUpperCase(), xx, yb, big, 150, wordP(w[i], t), rgba(i === 7 ? 'signal' : 'bone', 1), rgba('bone', 0.2)); xx += ww + 34; }
      x.globalAlpha = 1;
    }
    comp.draw(renderer, T.upload(), out);

    let punch = 0;
    for (const b of this.boxes) if (b.ta > 0) punch = Math.max(punch, 0.018 * pulse(t, b.ta + 0.02, 0.07));
    for (const i of [3, 4, 5, 6, 7]) punch = Math.max(punch, 0.012 * pulse(t, w[i].start, 0.08));
    return { bloom: 0.6, bloomThreshold: 0.9, vignette: 0.42, grain: 0.05, zoom: 1 + punch, shake: [0, 5 * punch / 0.018 * 0.6] };
  }

  boxOfPt(i: number) { return i <= 2 ? 0 : i <= 6 ? 1 : i === 7 ? 2 : i <= 13 ? 3 : 4; }
  offAt(bi: number, t: number): V3 {
    const b = this.boxes[bi]!; if (bi === 0) return [0, 0, 0];
    return mul(b.off, 1 - ease.outExpo(prog(t, b.ta - 0.03, b.ta + 0.2)));
  }

  circle(c: Cam, ctr: V3, n: V3, rad: number, draw: (a: [number, number], b: [number, number], front: boolean) => void, N = 48) {
    const e1 = nrm(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])), e2 = cross(n, e1);
    let prev: [number, number] | null = null;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dir = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)));
      const p = add(ctr, mul(dir, rad));
      const s = this.P(c, p);
      if (prev) draw(prev, s, dot(dir, c.f) > -0.02 || Math.abs(dot(n, c.f)) > 0.97);
      prev = s;
    }
  }

  drawBox(c: Cam, b: Box, o: V3, seg: (a: [number, number], b: [number, number], w: number, col: RGB, al?: number) => void, dash: (a: [number, number], b: [number, number], w: number, col: RGB, al: number, on?: number, off?: number) => void, al: number, _t: number) {
    if (al <= 0) return;
    const mn = add(b.min, o), mx = add(b.max, o);
    const V = (i: number): V3 => [i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]];
    // faces: normal, and the 4 corner indices
    const faces: { n: V3; v: number[] }[] = [
      { n: [-1, 0, 0], v: [0, 2, 6, 4] }, { n: [1, 0, 0], v: [1, 3, 7, 5] },
      { n: [0, -1, 0], v: [0, 1, 5, 4] }, { n: [0, 1, 0], v: [2, 3, 7, 6] },
      { n: [0, 0, -1], v: [0, 1, 3, 2] }, { n: [0, 0, 1], v: [4, 5, 7, 6] },
    ];
    const vis = faces.map((fc) => dot(fc.n, c.f) > 0.001);
    const edges: [number, number][] = [];
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([i, i | bit]);
    for (const [a, bb] of edges) {
      const adj = faces.map((fc, fi) => (fc.v.includes(a) && fc.v.includes(bb) ? fi : -1)).filter((x) => x >= 0);
      const visible = adj.some((fi) => vis[fi]);
      const pa = this.P(c, V(a)), pb = this.P(c, V(bb));
      if (visible) seg(pa, pb, 1.5, sc(LIN.bone, 0.92 * al));
      else dash(pa, pb, 1, sc(LIN.graphite, 1.1 * al), 1, 6, 5);
    }
    // engraved hatching on the visible faces: spacing by tone (top lit, sides darker)
    faces.forEach((fc, fi) => {
      if (!vis[fi]) return;
      const lit = fc.n[1] > 0 ? 0.3 : fc.n[0] !== 0 ? 0.65 : 0.5;
      const dens = clamp(lit * b.tone * 1.6, 0.15, 1);
      const p0 = V(fc.v[0]!), p1 = V(fc.v[1]!), p3 = V(fc.v[3]!);
      const ea = sub(p1, p0), eb = sub(p3, p0);
      const lenA = Math.hypot(...ea) * c.s;
      const n = Math.floor((lenA / 9) * dens);
      for (let i = 1; i < n; i++) {
        const s = i / n;
        const a = add(p0, mul(ea, s)), bb = add(a, eb);
        seg(this.P(c, a), this.P(c, bb), 0.8, sc(LIN.ash, 0.42 * al));
      }
    });
  }
}
