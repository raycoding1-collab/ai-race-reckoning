// `sand` (bars 0-4, 0-7.5 s): Powers-of-ten microscope dive.
// Black; an SEM raster sweeps down and reveals ONE grain of quartz sand: an analytic polyhedron engraved
// in white-line hatching with an amber rim. The bells' eight notes snap the key light round the grain
// (each facet glints in turn). On bar 1 the dive starts: one outExpo snap per beat, a decade each,
// through conchoidal sub-facets and growth terraces (hatch lines split as they zoom, a re-ink band
// rides each snap), into the silicon lattice ([110] dumbbells). On bar 2 the lattice atoms snap out of
// the crystal into the TITLE on the arpeggio's 16ths; on bar 3 they fall back as the dive resumes to
// 0.5 nm, and on the last beat the target atom ignites amber and slides to where tin's first droplet is.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, textPoints } from '../engine/type';
import { clamp, ease, keys, lerp, mulberry32, prog, pulse, hash, type Key } from '../engine/util';
import { NP, SAND_FRAG } from './sand-glsl';
import { BT, BR, H_SAND_TIN, mono, odometer, typed } from './sand-kit';

type V3 = [number, number, number];
const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const slerp = (a: V3, b: V3, k: number): V3 => nrm(add(mul(a, 1 - k), mul(b, k)));

const TAN = Math.tan((36 * Math.PI) / 180 / 2);
const LAT = { cx: 0.384, cy: 0.5431, sites: [[0, 0], [0, 0.1358], [0.192, 0.2716], [0.192, 0.4073]] as [number, number][] };

interface Cam { o: V3; r: V3; u: V3; f: V3; shift: [number, number] }
interface TAtom { gx: number; gy: number; su: number; sv: number; t0: number; t1: number; letter: number }

export default class SandScene extends Scene {
  bg = new FSPass(SAND_FRAG, {
    uO: { value: new THREE.Vector3() }, uR: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uFw: { value: new THREE.Vector3() },
    uTan: { value: TAN }, uShift: { value: new THREE.Vector2() },
    uN: { value: Array.from({ length: NP }, () => new THREE.Vector3()) }, uC: { value: new Array(NP).fill(0) }, uP: { value: Array.from({ length: NP }, () => new THREE.Vector3()) },
    uT0: { value: new THREE.Vector3() }, uB0: { value: new THREE.Vector3() },
    uKey: { value: new THREE.Vector3() }, uRim: { value: new THREE.Vector3() }, uKeyI: { value: 1 },
    uScan: { value: 2 }, uReink: { value: -1 }, uFar: { value: 1 }, uLatDim: { value: 0 }, uIgnite: { value: 0 }, uGlint: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 },
  });
  hud = new Layer2D();
  atoms = new LineBatch(60000, { blend: 'normal' });
  glow = new LineBatch(4000);

  n: V3[] = []; h: number[] = []; Tg: V3 = [0, 0, 0]; T0: V3 = [1, 0, 0]; B0: V3 = [0, 1, 0]; n0: V3 = [0, 0, 1];
  zk: Key[] = [];
  tAtoms: TAtom[] = []; bonds: [number, number][] = [];
  labelChanges: { t: number; prev: string; next: string }[] = [];
  notes: number[] = [];

  override async init() {
    // ---- the grain: a convex polyhedron (26 half-spaces) around an ellipsoid; facet 0 is the dive target
    const rnd = mulberry32(11);
    const n0 = nrm(v3(0.16, 0.2, 1));
    const raw: V3[] = [];
    const N = NP;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996 + 0.4;
      raw.push(nrm(add(v3(Math.cos(a) * r, y, Math.sin(a) * r), v3((rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35))));
    }
    let best = 0;
    raw.forEach((v, i) => { if (dot(v, n0) > dot(raw[best]!, n0)) best = i; });
    raw.splice(best, 1);
    this.n = [n0, ...raw];
    const sup = (v: V3) => Math.hypot(0.34 * v[0], 0.27 * v[1], 0.25 * v[2]);
    this.h = this.n.map((v, i) => sup(v) * (i === 0 ? 0.9 : 0.93 + 0.07 * rnd()));
    this.n0 = n0;
    let Tg = mul(n0, this.h[0]!);
    for (let it = 0; it < 20; it++) {
      const bad = this.n.some((v, i) => i > 0 && dot(v, Tg) > this.h[i]! - 0.01);
      if (!bad) break;
      Tg = mul(Tg, 0.97);
    }
    this.Tg = Tg;
    this.T0 = nrm(cross(v3(0, 1, 0), n0));
    this.B0 = cross(n0, this.T0);
    const u = this.bg.u;
    this.n.forEach((v, i) => {
      (u.uN!.value as THREE.Vector3[])[i]!.set(...v);
      (u.uC!.value as number[])[i] = this.h[i]! - dot(v, Tg);
      (u.uP!.value as THREE.Vector3[])[i]!.set(...sub(mul(v, this.h[i]!), Tg));
    });
    (u.uT0!.value as THREE.Vector3).set(...this.T0);
    (u.uB0!.value as THREE.Vector3).set(...this.B0);
    (u.uRim!.value as THREE.Vector3).set(...nrm(v3(0.62, 0.5, -0.6)));

    // ---- the zoom: log10(field width in mm); a decade per beat on bar 1, snaps start on the beat
    const X = ease.outExpo, L = ease.linear;
    this.zk = [
      [0, 0.23], [BT(4), 0.12, L],
      [BT(4) + 0.42, -0.62, X], [BT(5), -0.66, L],
      [BT(5) + 0.36, -1.62, X], [BT(6), -1.68, L],
      [BT(6) + 0.36, -2.62, X], [BT(7), -2.7, L],
      [BT(7) + 0.36, -3.62, X], [BT(8), -3.7, L],
      [BT(8) + 0.36, -4.45, X], [BT(12), -4.55, L],
      [BT(12) + 0.33, -4.85, X], [BT(13), -4.9, L],
      [BT(13) + 0.3, -5.1, X], [BT(14), -5.14, L],
      [BT(14) + 0.3, -5.3, X], [BT(15), -5.33, L],
      [BT(15) + 0.28, -Math.log10(1e6 / (0.058 * 1920 / H_SAND_TIN.r)) , X], [7.6, -5.4, L],
    ];
    this.notes = Array.from({ length: 8 }, (_, k) => k * BT(1) / 2);

    // ---- scale-bar label changes (for the odometer roll)
    let prev = this.barFor(0).label;
    for (let t = 0; t < 7.5; t += 1 / 240) {
      const l = this.barFor(t).label;
      if (l !== prev) { this.labelChanges.push({ t, prev, next: l }); prev = l; }
    }

    // ---- the title made of lattice atoms
    const fam = F.archivo(100, 900), size = 292, step = 13;
    const lines = [{ s: 'SILICON', x: 132, y: 492 }, { s: 'SHIELD', x: 132, y: 790 }];
    const camT = this.cam(BT(8) + 0.45);
    const proj = (su: number, sv: number) => this.project(camT, add(mul(this.T0, su * 1e-6), mul(this.B0, sv * 1e-6)));
    // candidate lattice sites in a window around the frame
    const cand: { su: number; sv: number; x: number; y: number; used: boolean }[] = [];
    const span = 40; // nm
    for (let j = -Math.ceil(span / LAT.cy); j <= Math.ceil(span / LAT.cy); j++)
      for (let i = -Math.ceil(span / LAT.cx); i <= Math.ceil(span / LAT.cx); i++)
        for (const [sx, sy] of LAT.sites) {
          const su = i * LAT.cx + sx, sv = j * LAT.cy + sy;
          const p = proj(su, sv);
          if (p && p[0] > -200 && p[0] < 2120 && p[1] > -200 && p[1] < 1280) cand.push({ su, sv, x: p[0], y: p[1], used: false });
        }
    const G = 40, grid = new Map<string, number[]>();
    cand.forEach((c, i) => { const k = `${Math.floor(c.x / G)},${Math.floor(c.y / G)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
    let letter = 0;
    lines.forEach((ln, li) => {
      const lay = layout(ln.s, fam, size);
      const pts = textPoints(ln.s, fam, size, step, 3 + li);
      const order = pts.map((p, i) => ({ p, k: hash(i, li, 5) })).sort((a, b) => a.k - b.k);
      for (const { p } of order) {
        const gx = ln.x + p.x, gy = ln.y + p.y;
        let gi = lay.glyphs.findIndex((g) => p.x < g.x + g.w);
        if (gi < 0) gi = lay.glyphs.length - 1;
        // nearest free lattice site
        let bi = -1, bd = 1e9;
        const cx = Math.floor(gx / G), cy = Math.floor(gy / G);
        for (let r = 0; r < 8 && bi < 0; r++) {
          for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
            for (const i of grid.get(`${xx},${yy}`) ?? []) {
              const c = cand[i]!; if (c.used) continue;
              const d = (c.x - gx) ** 2 + (c.y - gy) ** 2;
              if (d < bd) { bd = d; bi = i; }
            }
          }
        }
        if (bi < 0) continue;
        cand[bi]!.used = true;
        const L0 = letter + gi;
        const lt = li === 0 ? BT(8) + gi * BT(0.25) : BT(10) + gi * BT(0.25);
        this.tAtoms.push({ gx, gy, su: cand[bi]!.su, sv: cand[bi]!.sv, t0: lt + hash(gx, gy) * 0.05, t1: BT(12) + 0.04 + hash(gy, gx, 2) * 0.3, letter: L0 });
      }
      letter += lay.glyphs.length;
    });
    // bonds between neighbouring title atoms (in glyph space)
    const g2 = new Map<string, number[]>();
    this.tAtoms.forEach((a, i) => { const k = `${Math.floor(a.gx / 20)},${Math.floor(a.gy / 20)}`; (g2.get(k) ?? g2.set(k, []).get(k)!).push(i); });
    this.tAtoms.forEach((a, i) => {
      const cx = Math.floor(a.gx / 20), cy = Math.floor(a.gy / 20);
      for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++)
        for (const j of g2.get(`${xx},${yy}`) ?? []) {
          if (j <= i) continue;
          const b = this.tAtoms[j]!;
          if (Math.hypot(a.gx - b.gx, a.gy - b.gy) < step * 1.22) this.bonds.push([i, j]);
        }
    });
  }

  Z(t: number) { return keys(t, this.zk); }
  Fmm(t: number) { return Math.pow(10, this.Z(t)); }

  /** Camera at time t (local coords: origin = dive target, mm). */
  cam(t: number): Cam {
    const F = this.Fmm(t);
    const d = F / (2 * TAN);
    const kL = ease.inOutCubic(clamp((Math.log10(1.25) - this.Z(t)) / (Math.log10(1.25) - Math.log10(0.22))));
    const yaw = 0.22 * prog(t, 0, BR(1) + 0.4, ease.outCubic) - 0.1;
    const w0 = nrm(v3(Math.sin(yaw) * 0.97 + 0.08, 0.26, Math.cos(yaw)));
    const wF = nrm(add(this.n0, add(mul(this.T0, 0.17), mul(this.B0, -0.2))));
    const w = slerp(w0, wF, kL);
    const look = mul(this.Tg, -(1 - kL));
    const o = add(look, mul(w, d));
    const f = mul(w, -1);
    const upW: V3 = slerp(v3(0, 1, 0), this.B0, kL);
    const r = nrm(cross(f, upW));
    const u = cross(r, f);
    const sh = ease.inOutCubic(prog(t, BT(15) + 0.06, BT(15) + 0.4));
    return { o, r, u, f, shift: [(H_SAND_TIN.x - 960) * sh, (H_SAND_TIN.y - 540) * sh] };
  }
  /** Screen px (y down) of a local point. */
  project(c: Cam, p: V3): [number, number] | null {
    const q = sub(p, c.o);
    const z = dot(q, c.f);
    if (z <= 0) return null;
    return [960 + c.shift[0] + (dot(q, c.r) / z / TAN) * 960, 540 + c.shift[1] - (dot(q, c.u) / z / TAN) * 960];
  }

  barFor(t: number) {
    const F = this.Fmm(t);
    const nice: number[] = [];
    for (let e = -8; e <= 1; e++) for (const m of [1, 2, 5]) nice.push(m * 10 ** e);
    let v = nice[0]!;
    for (const x of nice) if ((x / F) * 1920 <= 430) v = x;
    const px = (v / F) * 1920;
    const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(1));
    const label = v >= 0.999 ? `${fmt(v)} mm` : v >= 0.999e-3 ? `${fmt(v * 1e3)} µm` : `${fmt(v * 1e6)} nm`;
    return { v, px, label };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = this.cam(t);
    const u = this.bg.u;
    (u.uO!.value as THREE.Vector3).set(...c.o);
    (u.uR!.value as THREE.Vector3).set(...c.r);
    (u.uU!.value as THREE.Vector3).set(...c.u);
    (u.uFw!.value as THREE.Vector3).set(...c.f);
    (u.uShift!.value as THREE.Vector2).set(c.shift[0], c.shift[1]);
    // the key light snaps round the grain on each bell note
    let az = -0.95;
    for (const tn of this.notes) az += 0.3 * ease.outExpo(prog(t, tn, tn + 0.09));
    const el = 0.72;
    (u.uKey!.value as THREE.Vector3).set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    u.uKeyI!.value = 0.3 + 0.7 * ease.outCubic(prog(t, 0.02, 0.5));
    let glint = 0; for (const tn of this.notes) glint = Math.max(glint, pulse(t, tn, 0.07));
    u.uGlint!.value = glint;
    u.uScan!.value = t < 0.6 ? lerp(-0.02, 1.2, ease.inOutQuad(prog(t, 0.0, 0.46))) : 2;
    // re-ink band on each dive snap
    let rk = -1;
    for (const k of [4, 5, 6, 7, 8]) { const a = prog(t, BT(k), BT(k) + 0.3); if (a > 0 && a < 1) rk = ease.outCubic(a) * 1.2 - 0.1; }
    u.uReink!.value = rk;
    u.uFar!.value = 1 - prog(this.Z(t), Math.log10(0.9), Math.log10(0.4));
    const titleOn = prog(t, BT(8), BT(8) + 0.2) * (1 - prog(t, BT(12), BT(12) + 0.45));
    u.uLatDim!.value = titleOn;
    const tIg = BT(15);
    u.uIgnite!.value = ease.outExpo(prog(t, tIg, tIg + 0.1));
    u.uFade!.value = ease.inOutQuad(prog(t, tIg + 0.12, BT(16) - 0.06));
    u.uTime!.value = t;
    this.bg.render(renderer, out);

    // ---- title atoms (LineBatch, normal blend: they occlude)
    const A = this.atoms; A.clear();
    const G = this.glow; G.clear();
    if (t > BT(8) - 0.05 && t < BT(13) + 0.3) this.drawTitle(t, c, A, G);
    A.render(renderer, out);
    G.render(renderer, out);

    // ---- HUD (scale bar, decade squares, footnotes)
    const T = this.hud; T.clear();
    this.drawHud(t, c, T.ctx);
    comp.draw(renderer, T.upload(), out);

    let punch = 0;
    for (const tn of this.notes) punch = Math.max(punch, 0.006 * pulse(t, tn, 0.07));
    for (const k of [4, 5, 6, 7, 8, 12, 13, 14]) punch = Math.max(punch, 0.014 * pulse(t, BT(k), 0.08));
    punch = Math.max(punch, 0.02 * pulse(t, tIg, 0.09));
    return {
      bloom: 0.62, bloomThreshold: 0.9, vignette: 0.4, grain: 0.05, halation: 0.2,
      zoom: 1 + punch, flash: 0.05 * pulse(t, 0.0, 0.06) + 0.06 * pulse(t, tIg, 0.05),
      ca: 1 + 3 * pulse(t, tIg, 0.08),
    };
  }

  drawTitle(t: number, c: Cam, A: LineBatch, G: LineBatch) {
    const N = this.tAtoms.length;
    const pos = new Float32Array(N * 2), kk = new Float32Array(N), hot = new Float32Array(N);
    const R = 5.3;
    for (let i = 0; i < N; i++) {
      const a = this.tAtoms[i]!;
      const s = this.project(c, add(mul(this.T0, a.su * 1e-6), mul(this.B0, a.sv * 1e-6)));
      if (!s) { kk[i] = 0; continue; }
      const kin = ease.outBack(clamp((t - a.t0) / 0.15), 1.3);
      const kout = ease.inOutCubic(clamp((t - a.t1) / 0.32));
      const k = t < a.t0 ? 0 : kin * (1 - kout);
      pos[i * 2] = lerp(s[0], a.gx, k); pos[i * 2 + 1] = lerp(s[1], a.gy, k);
      kk[i] = t < a.t0 ? 0 : clamp(1 - kout);
      hot[i] = pulse(t, a.t0 + 0.1, 0.12) + 0.6 * pulse(t, a.t1, 0.1) * (t > a.t1 ? 1 : 0);
    }
    // bonds
    for (const [i, j] of this.bonds) {
      const k = Math.min(kk[i]!, kk[j]!);
      if (k < 0.05) continue;
      const settled = Math.min(clamp((t - this.tAtoms[i]!.t0 - 0.12) / 0.1), clamp((t - this.tAtoms[j]!.t0 - 0.12) / 0.1)) * (1 - clamp((t - Math.min(this.tAtoms[i]!.t1, this.tAtoms[j]!.t1)) / 0.12));
      if (settled <= 0) continue;
      const hh = Math.max(hot[i]!, hot[j]!);
      const col: [number, number, number] = [lerp(LIN.ash[0], LIN.signal[0] * 1.4, hh), lerp(LIN.ash[1], LIN.signal[1] * 1.4, hh), lerp(LIN.ash[2], LIN.signal[2] * 1.4, hh)];
      A.seg2(pos[i * 2]!, pos[i * 2 + 1]!, pos[j * 2]!, pos[j * 2 + 1]!, 1.3, col, 0.85 * settled);
    }
    const ink = LIN.ink, bone = LIN.bone, sig = LIN.signal;
    for (let i = 0; i < N; i++) {
      const k = kk[i]!;
      if (k <= 0.01) continue;
      const x = pos[i * 2]!, y = pos[i * 2 + 1]!, h = clamp(hot[i]!);
      const mix3 = (a: number[], b: number[], m: number): [number, number, number] => [lerp(a[0]!, b[0]!, m), lerp(a[1]!, b[1]!, m), lerp(a[2]!, b[2]!, m)];
      A.seg2(x, y, x + 0.01, y, 2 * (R + 1.6), ink, k);
      A.seg2(x, y, x + 0.01, y, 2 * R, mix3(mul(bone as V3, 0.42), mul(sig as V3, 1.2), h), k);
      A.seg2(x - R * 0.22, y - R * 0.24, x - R * 0.22 + 0.01, y - R * 0.24, 2 * R * 0.62, mix3(mul(bone as V3, 0.8), mul(sig as V3, 1.8), h), k);
      A.seg2(x - R * 0.36, y - R * 0.4, x - R * 0.36 + 0.01, y - R * 0.4, 2 * R * 0.24, mix3(bone, [3, 2.6, 2.1], h), k);
      if (h > 0.05) G.seg2(x, y, x + 0.01, y, 2 * R * 2.6, [sig[0] * h * 0.6, sig[1] * h * 0.6, sig[2] * h * 0.6], 0.5);
    }
  }

  drawHud(t: number, c: Cam, x: CanvasRenderingContext2D) {
    const tIg = BT(15);
    const hudA = prog(t, 0.25, 0.6) * (1 - prog(t, tIg + 0.05, tIg + 0.3));
    if (hudA <= 0) return;
    x.globalAlpha = hudA;
    // decade squares (Powers of Ten), centred on the dive target
    const Fm = this.Fmm(t);
    const ctr = this.project(c, [0, 0, 0]) ?? [960, 540];
    for (let e = -9; e <= 1; e++) {
      const side = (10 ** e / Fm) * 1080;
      if (side < 36 || side > 1500) continue;
      const a = prog(side, 36, 110) * (1 - prog(side, 900, 1500)) * 0.75;
      const hx = side / 2, k = Math.min(18, side * 0.12);
      x.strokeStyle = rgba('bone', 0.55 * a); x.lineWidth = 1.2;
      x.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const px = ctr[0] + sx * hx, py = ctr[1] + sy * hx;
        x.moveTo(px - sx * k, py); x.lineTo(px, py); x.lineTo(px, py - sy * k);
      }
      x.stroke();
      const em = e - 3;
      const sup = String(em).replace('-', '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]!);
      mono(x, `10${sup} m`, ctr[0] - hx + 6, ctr[1] - hx - 8, 14, rgba('bone', 0.7 * a), 500);
    }
    // scale bar, bottom left: the bar length follows the zoom; the label rolls when it changes
    const b = this.barFor(t);
    const bx = 112, by = 968;
    x.fillStyle = rgba('bone', 0.92);
    x.fillRect(bx, by, b.px, 5);
    for (let i = 0; i <= 10; i++) x.fillRect(bx + (b.px * i) / 10 - 0.6, by - (i % 5 === 0 ? 16 : 8), 1.2, i % 5 === 0 ? 16 : 8);
    let ch = { t: -1, prev: b.label, next: b.label };
    for (const lc of this.labelChanges) if (lc.t <= t) ch = lc;
    const kRoll = clamp((t - ch.t) / 0.2);
    odometer(x, b.label, ch.prev, kRoll, bx, by - 34, F.archivo(100, 900), 76, rgba('bone', 1));
    mono(x, 'SCALE', bx, by + 34, 14, rgba('bone', 0.55), 500, 'left', 2);
    // footnotes: what we are looking at, per decade
    const Z = this.Z(t);
    const tag = Z > -0.5 ? ['SAMPLE 01 · QUARTZ SAND', 'SiO₂ · ⌀ 0.62 mm', 'SEM · 15 kV · BACKSCATTER']
      : Z > -2.4 ? ['CONCHOIDAL FRACTURE', 'QUARTZ · NO CLEAVAGE PLANE', 'SEM · 15 kV']
      : Z > -4.2 ? ['GROWTH TERRACES', 'STEP HEIGHT ≈ 0.3 nm', 'AFM · TAPPING MODE']
      : ['Si · DIAMOND CUBIC · a = 0.543 nm', '[110] PROJECTION', 'SiO₂ → Si · 99.9999999% AFTER REFINING'];
    const t0 = Z > -0.5 ? 0.3 : Z > -2.4 ? BT(5) : Z > -4.2 ? BT(7) : BT(8);
    tag.forEach((s, i) => mono(x, typed(s, t, t0 + i * 0.08, 70), 112, 122 + i * 24, i === 0 ? 17 : 15, rgba('bone', i === 0 ? 0.9 : 0.55), i === 0 ? 600 : 400, 'left', 1));
    // traveller, bottom right
    mono(x, 'LOT 7A-0042 · STEP 01/31 · RAW MATERIAL', 1808, 1002, 14, rgba('bone', 0.5), 500, 'right', 1.5);
    mono(x, `×${Math.round(25 / Fm).toLocaleString('en-US')}`, 1808, 976, 22, rgba('signal', 0.95), 600, 'right');
    // title caption
    const titleOn = prog(t, BT(10) + 0.5, BT(10) + 0.7) * (1 - prog(t, BT(12), BT(12) + 0.2));
    if (titleOn > 0) mono(x, typed('A PROCESS TRAVELLER · LOT 7A-0042 · 31 STEPS', t, BT(10) + 0.5, 80), 140, 872, 18, rgba('bone', 0.75 * titleOn), 500, 'left', 2);
    x.globalAlpha = 1;
  }
}
