// NODE 1: "Two nanometers holding the crown". An engraved GAA nanosheet transistor (3D hatch lines with
// hidden-line removal), numerals 7 / 5 / 3 / 2 slamming on the four syllables of "nanometers", a dolly
// through the gate, then a crane-up into a top-down lattice whose lit transistors form a CROWN.
// In:  the die-dive lattice from drop1 (same shader, same zoom, so the cut is invisible).
// Out: a top-down field of lit cells that grid1 turns into the lights of a town.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT, clearRT, W, H, PW, PH } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { HEX, LIN } from '../engine/palette';
import { ease, clamp, lerp, pulse, hash, frameIdx, smoothstep, TAU } from '../engine/util';
import { Lyrics } from '../engine/lyrics';
import { lineByScene } from './_motifs';
import { DIE_DIVE_GLSL, DIE_PITCH, DIE_ZOOM_END } from './drop-lattice';
import { crownCells, CELL_PX } from './node1-crown';

const NOOCC = false;
const BEAT = 60 / 128;
const FOV = 28;
const TANH = Math.tan((FOV * Math.PI) / 360);
type V3 = [number, number, number];
interface Box { min: V3; max: V3; kind: 'ped' | 'sheet' | 'gate' | 'epi' | 'spacer' | 'post' | 'metal' }

const SHADER = /* glsl */ `
uniform vec2 uC; uniform float uDieZoom, uPitch;
${DIE_DIVE_GLSL}
void main() {
  if (uDieZoom > 0.0) fragColor = vec4(dieDive(FRAG_PX), 1.0); else fragColor = vec4(C_INK, 1.0);
}`;

const lin = (c: [number, number, number], k = 1): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];
const LIGHT = new THREE.Vector3(-0.4, -0.6, 0.7).normalize();

export default class Node1 extends Scene {
  T0 = 0;
  words: any[] = [];
  bg!: FSPass;
  layer = new Layer2D();
  rt = makeRT(W, H, { depthTexture: new THREE.DepthTexture(PW, PH) });
  lb = new LineBatch(170000, { screen2D: false, depthTest: true, blend: 'max' });
  cam = new THREE.PerspectiveCamera(FOV, W / H, 0.03, 400);
  occ = new THREE.Scene();
  occMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: false });
  occMeshes: THREE.Mesh[] = [];
  boxGeo = new THREE.BoxGeometry(1, 1, 1);
  numT: number[] = [];
  crown = crownCells();

  override async init() {
    const line = lineByScene(this.ctx.lyrics, 'crown1');
    this.T0 = line.start; this.words = line.words;
    const nm = this.words[1];
    this.numT = nm.syl.map((s: number[]) => s[0] - this.T0);
    this.bg = new FSPass(SHADER, { uC: { value: new THREE.Vector2(W / 2, H / 2) }, uDieZoom: { value: 0 }, uPitch: { value: DIE_PITCH } });
    this.cam.up.set(0, 0, 1);
  }

  // ---------------------------------------------------------------- the hero transistor
  private hero(cut: boolean, ox = 0, oy = 0): Box[] {
    const B: Box[] = [];
    const yA = cut ? 0 : -1.5;
    for (const fx of [-1, 0, 1]) {
      B.push({ min: [fx - 0.25, yA, 0], max: [fx + 0.25, 1.5, 0.45], kind: 'ped' });
      for (const z0 of [0.6, 0.9, 1.2]) B.push({ min: [fx - 0.25, yA, z0], max: [fx + 0.25, 1.5, z0 + 0.14], kind: 'sheet' });
      if (!cut) B.push({ min: [fx - 0.34, -1.5, 0.3], max: [fx + 0.34, -1.05, 1.5], kind: 'epi' });
      B.push({ min: [fx - 0.34, 1.05, 0.3], max: [fx + 0.34, 1.5, 1.5], kind: 'epi' });
      if (!cut) B.push({ min: [fx - 0.05, -1.3 - 0.05, 1.5], max: [fx + 0.05, -1.3 + 0.05, 2.3], kind: 'post' });
      B.push({ min: [fx - 0.05, 1.25 - 0.05, 1.5], max: [fx + 0.05, 1.25 + 0.05, 2.3], kind: 'post' });
    }
    B.push({ min: [-1.5, cut ? 0 : -0.9, 0.3], max: [1.5, 0.9, 1.75], kind: 'gate' });
    if (!cut) B.push({ min: [-1.45, -1.05, 0.35], max: [1.45, -0.9, 1.7], kind: 'spacer' });
    B.push({ min: [-1.45, 0.9, 0.35], max: [1.45, 1.05, 1.7], kind: 'spacer' });
    if (!cut) B.push({ min: [-1.5, -1.3 - 0.07, 2.3], max: [1.5, -1.3 + 0.07, 2.42], kind: 'metal' });
    B.push({ min: [-1.5, 1.25 - 0.07, 2.3], max: [1.5, 1.25 + 0.07, 2.42], kind: 'metal' });
    if (ox || oy) for (const b of B) { b.min = [b.min[0] + ox, b.min[1] + oy, b.min[2]]; b.max = [b.max[0] + ox, b.max[1] + oy, b.max[2]]; }
    return B;
  }

  /** the fins run on beyond the cell: long pedestals and sheets (the dolly keeps a tunnel to run down) */
  private tail(): Box[] {
    const B: Box[] = [];
    for (const fx of [-1, 0, 1]) {
      B.push({ min: [fx - 0.25, 1.5, 0], max: [fx + 0.25, 8, 0.45], kind: 'ped' });
      for (const z0 of [0.6, 0.9, 1.2]) B.push({ min: [fx - 0.25, 1.5, z0], max: [fx + 0.25, 8, z0 + 0.14], kind: 'sheet' });
    }
    return B;
  }

  /** add a 3D segment clipped against the camera's near plane (LineBatch drops a segment with an end behind the camera) */
  private S(lb: LineBatch, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, r: number, g: number, b: number, a = 1) {
    const m = this.cam.matrixWorldInverse.elements;
    const za = m[2]! * ax + m[6]! * ay + m[10]! * az + m[14]!, zb = m[2]! * bx + m[6]! * by + m[10]! * bz + m[14]!;
    const N = -0.05;
    if (za > N && zb > N) return;
    if (za > N || zb > N) {
      const t = (N - za) / (zb - za);
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
      if (za > N) { ax = cx; ay = cy; az = cz; } else { bx = cx; by = cy; bz = cz; }
    }
    lb.seg(ax, ay, az, bx, by, bz, w, r, g, b, a);
  }

  private syncOccluders(B: Box[]) {
    while (this.occMeshes.length < B.length) {
      const m = new THREE.Mesh(this.boxGeo, this.occMat);
      m.frustumCulled = false; this.occ.add(m); this.occMeshes.push(m);
    }
    this.occMeshes.forEach((m, i) => {
      const b = B[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      const ins = 0.02;
      m.scale.set(Math.max(0.001, b.max[0] - b.min[0] - ins), Math.max(0.001, b.max[1] - b.min[1] - ins), Math.max(0.001, b.max[2] - b.min[2] - ins));
    });
  }

  /** engraving hatch on the visible faces of a box: contour lines along the surface's own coordinates; width follows the light */
  private hatchBox(lb: LineBatch, b: Box, cp: THREE.Vector3, sp: number, gain: number) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const rim = b.kind === 'sheet' || b.kind === 'metal' || b.kind === 'post';
    const faces: { n: V3; axis: 'x' | 'y' | 'z' }[] = [
      { n: [0, 0, 1], axis: 'z' }, { n: [0, 0, -1], axis: 'z' }, { n: [-1, 0, 0], axis: 'x' }, { n: [1, 0, 0], axis: 'x' }, { n: [0, -1, 0], axis: 'y' }, { n: [0, 1, 0], axis: 'y' },
    ];
    for (const fc of faces) {
      const n = fc.n;
      const cx = n[0] > 0 ? x1 : n[0] < 0 ? x0 : (x0 + x1) / 2, cy = n[1] > 0 ? y1 : n[1] < 0 ? y0 : (y0 + y1) / 2, cz = n[2] > 0 ? z1 : n[2] < 0 ? z0 : (z0 + z1) / 2;
      if ((cp.x - cx) * n[0] + (cp.y - cy) * n[1] + (cp.z - cz) * n[2] <= 0) continue;
      const d = Math.max(0.0, n[0] * LIGHT.x + n[1] * LIGHT.y + n[2] * LIGHT.z);
      const lit = 0.18 + 0.82 * d + (rim ? 0.25 : 0);
      const wpx = (0.7 + 2.0 * lit) * gain;
      const col = lin(b.kind === 'sheet' ? LIN.ember : LIN.signal, 0.25 + 1.05 * lit);
      const a = Math.min(1, 0.45 + 0.6 * lit);
      if (fc.axis === 'z') { // lines along y, spaced along x
        for (let x = Math.ceil(x0 / sp) * sp; x <= x1 + 1e-6; x += sp) this.S(lb, x, y0, cz, x, y1, cz, wpx, col[0], col[1], col[2], a);
      } else if (fc.axis === 'x') { // contour lines along y, spaced along z
        for (let z = Math.ceil(z0 / sp) * sp; z <= z1 + 1e-6; z += sp) this.S(lb, cx, y0, z, cx, y1, z, wpx, col[0], col[1], col[2], a);
      } else { // lines along x, spaced along z
        for (let z = Math.ceil(z0 / sp) * sp; z <= z1 + 1e-6; z += sp) this.S(lb, x0, cy, z, x1, cy, z, wpx, col[0], col[1], col[2], a);
      }
    }
    // rim re-ink: the box edges in ember
    const E = lin(LIN.ember, 1.3);
    const pts: V3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const ed = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, c] of ed) this.S(lb, pts[a!]![0], pts[a!]![1], pts[a!]![2], pts[c!]![0], pts[c!]![1], pts[c!]![2], 1.5 * gain, E[0], E[1], E[2], 0.9);
  }

  /** the section plane y = 0: gate metal hatched at 45 degrees, nanosheet cross-sections cut out and hatched finely */
  private section(lb: LineBatch, sp: number, gain: number) {
    const gx0 = -1.5, gx1 = 1.5, gz0 = 0.3, gz1 = 1.75;
    const holes: [number, number, number, number][] = [];
    for (const fx of [-1, 0, 1]) {
      holes.push([fx - 0.25, 0, fx + 0.25, 0.45]);
      for (const z0 of [0.6, 0.9, 1.2]) holes.push([fx - 0.25, z0, fx + 0.25, z0 + 0.14]);
    }
    const A = lin(LIN.signal, 0.9), E = lin(LIN.ember, 1.4);
    // gate: lines x + z = c, clipped to the gate rectangle minus the holes
    const clipLine = (c: number, rects: [number, number, number, number][], outer: [number, number, number, number], draw: (xa: number, za: number, xb: number, zb: number) => void, sgn: number) => {
      // parametrise by x: z = sgn * (x) + c' ; here lines are z = c - sgn*x ... use direction (1, sgn)
      const [ox0, oz0, ox1, oz1] = outer;
      let s0 = ox0, s1 = ox1;
      const zAt = (x: number) => c + sgn * x;
      // restrict to the outer z range
      if (sgn !== 0) {
        const xa = (oz0 - c) / sgn, xb = (oz1 - c) / sgn;
        s0 = Math.max(s0, Math.min(xa, xb)); s1 = Math.min(s1, Math.max(xa, xb));
      }
      if (s1 <= s0) return;
      let iv: [number, number][] = [[s0, s1]];
      for (const [rx0, rz0, rx1, rz1] of rects) {
        const xa = (rz0 - c) / sgn, xb = (rz1 - c) / sgn;
        const lo = Math.max(rx0, Math.min(xa, xb)), hi = Math.min(rx1, Math.max(xa, xb));
        if (hi <= lo) continue;
        const nxt: [number, number][] = [];
        for (const [a, b] of iv) {
          if (hi <= a || lo >= b) { nxt.push([a, b]); continue; }
          if (lo > a) nxt.push([a, lo]);
          if (hi < b) nxt.push([hi, b]);
        }
        iv = nxt;
      }
      for (const [a, b] of iv) draw(a, zAt(a), b, zAt(b));
    };
    const s = sp * 1.4;
    for (let c = gz0 - gx1 - 1; c <= gz1 - gx0 + 1; c += s)
      clipLine(c, holes, [gx0, gz0, gx1, gz1], (xa, za, xb, zb) => this.S(lb, xa, 0, za, xb, 0, zb, 1.1 * gain, A[0], A[1], A[2], 0.8), 1);
    // sheets: fine cross hatch, bright
    for (const fx of [-1, 0, 1]) for (const z0 of [0.6, 0.9, 1.2]) {
      for (let c = z0 - (fx + 0.25) - 1; c <= z0 + 0.14 - (fx - 0.25) + 1; c += sp * 0.55)
        clipLine(c, [], [fx - 0.25, z0, fx + 0.25, z0 + 0.14], (xa, za, xb, zb) => this.S(lb, xa, 0, za, xb, 0, zb, 1.0 * gain, E[0] * 0.8, E[1] * 0.8, E[2] * 0.8, 0.9), 1);
    }
    // outlines
    const ol = (r: [number, number, number, number], col: [number, number, number], w: number) => {
      const [a, b, c, d] = r;
      this.S(lb, a, 0, b, c, 0, b, w, col[0], col[1], col[2], 1); this.S(lb, c, 0, b, c, 0, d, w, col[0], col[1], col[2], 1);
      this.S(lb, c, 0, d, a, 0, d, w, col[0], col[1], col[2], 1); this.S(lb, a, 0, d, a, 0, b, w, col[0], col[1], col[2], 1);
    };
    ol([gx0, gz0, gx1, gz1], A, 2.4 * gain);
    for (const h of holes) ol(h, E, 2.2 * gain);
  }

  // ---------------------------------------------------------------- camera
  private camAt(r: number): { pos: V3; tgt: V3; up: V3; cut: boolean } {
    const n = this.numT;
    const t7 = n[0]!, t5 = n[1]!, t3 = n[2]!, t2 = n[3]!;
    const tHold = this.words[2].start - this.T0, tCrown = this.words[4].start - this.T0;
    const L = (a: V3, b: V3, u: number): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    const U: V3 = [0, 0, 1];
    if (r < t5) return { pos: L([3.4, -4.8, 4.6], [3.0, -4.3, 4.2], (r - t7) / (t5 - t7)), tgt: [0, 0, 0.9], up: U, cut: false };
    if (r < t3) return { pos: L([-7, -1.5, 1.9], [-6.2, -1.2, 1.9], (r - t5) / (t3 - t5)), tgt: [0, 0, 1.0], up: U, cut: false };
    if (r < t2) return { pos: L([0.3, -5.4, 1.25], [0.1, -4.2, 1.15], (r - t3) / (t2 - t3)), tgt: [0, 0, 1.0], up: U, cut: true };
    if (r < tHold) return { pos: L([0.55, -2.6, 1.05], [0.12, -1.55, 0.84], ease.outCubic((r - t2) / (tHold - t2))), tgt: [0, 0, 0.84], up: U, cut: true };
    if (r < tCrown) {
      const u = ease.inOutCubic(clamp((r - tHold) / (tCrown - tHold)));
      const y = lerp(-1.55, 1.9, u);
      return { pos: [lerp(0.12, 0, u), y, 0.84 - 0.02 * u], tgt: [0, y + 3, 0.82], up: U, cut: true };
    }
    // crane up: log-distance rise while the view rotates down to a top-down plan
    const T = 3.28 - tCrown;
    const u = clamp((r - tCrown) / T);
    const kz = ease.inOutQuart(u);
    const z = Math.exp(lerp(Math.log(0.82), Math.log(135.6), kz));
    const ky = smoothstep(0.4, 0.9, u);
    const y = lerp(1.9, 0, ky);
    const px = 0.5 * smoothstep(0.05, 0.3, u);
    const wp = ease.inOutCubic(clamp((r - tCrown) / 0.22));
    const tg: V3 = [0, lerp(lerp(y + 3, 0, wp), 0, ky), lerp(0.82, 0, ky)];
    const k2 = smoothstep(0.35, 0.95, u);
    const up: V3 = [0, k2, 1 - k2];
    return { pos: [px, y, z], tgt: tg, up, cut: false };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const r = f.t - this.T0;
    const n = this.numT;
    const tCrown = this.words[4].start - this.T0, tHold = this.words[2].start - this.T0;
    const dive = r < n[0]!;
    // background: the lattice carrying on from drop1's zoom, then ink
    if (dive) {
      const z = DIE_ZOOM_END * Math.exp(0.75 * (1 - Math.exp(-r / 0.07)));
      this.bg.u.uDieZoom!.value = z;
    } else this.bg.u.uDieZoom!.value = 0;
    this.bg.render(renderer, out);

    const lay = this.layer, c = lay.ctx;
    lay.clear();
    let shakeAmp = 0, flash = 0, ca = 1.0;
    let numIdx = -1;
    for (let i = 0; i < 4; i++) if (r >= n[i]!) numIdx = i;
    const inNum = !dive && r < tHold;

    if (!dive) {
      const cam = this.camAt(r);
      this.cam.position.set(...cam.pos);
      this.cam.up.set(...cam.up).normalize();
      this.cam.lookAt(cam.tgt[0], cam.tgt[1], cam.tgt[2]);
      this.cam.updateMatrixWorld(true);
      const dist = this.cam.position.length() < 1e-6 ? 1 : this.cam.position.distanceTo(new THREE.Vector3(...cam.tgt));
      const ppu = (H / 2) / (TANH * Math.max(0.05, Math.min(dist, 400)));
      const sp = Math.min(0.3, Math.max(0.012, 6.5 / ppu));
      const B = this.hero(cam.cut);
      const nb: Box[] = [...this.hero(false, 3, 0), ...this.hero(false, -3, 0), ...this.tail()];
      this.syncOccluders([...B, ...nb]);
      this.lb.clear();
      const lb = this.lb;
      // hero detail fades as the camera leaves the cell
      const nearVis = 1 - smoothstep(20, 45, this.cam.position.length());
      if (nearVis > 0.01) {
        const gain = 1;
        for (const b of B) this.hatchBox(lb, b, this.cam.position, sp, gain);
        for (const b of nb) this.hatchBox(lb, b, this.cam.position, sp * 1.8, 0.6);
        if (cam.cut) this.section(lb, sp, gain);
        // floor: a faint contour field round the cell
        const fl = lin(LIN.signal, 0.22 * nearVis);
        const fsp = Math.max(sp * 2, 0.06);
        for (let x = -7; x <= 7; x += fsp) this.S(lb, x, -6, 0, x, 6, 0, 1.0, fl[0], fl[1], fl[2], 0.5);
      }
      // far field: the fins and gates of the whole array, and the crown of lit cells
      const farVis = smoothstep(8, 35, this.cam.position.length());
      if (farVis > 0.01) this.farField(lb, r, ppu, farVis, tCrown);
      if (false) console.warn('N1', r.toFixed(2), cam.pos.map((v) => v.toFixed(2)).join(','), cam.tgt.map((v) => v.toFixed(2)).join(','), lb.count, nearVis.toFixed(2), farVis.toFixed(2));
      // render: occluders write depth, then the lines
      clearRT(renderer, this.rt, [0, 0, 0], 0);
      renderer.setRenderTarget(this.rt);
      if (!NOOCC) renderer.render(this.occ, this.cam);
      lb.render(renderer, this.rt, this.cam);
      const off = inNum ? -0.095 : 0;
      comp.draw(renderer, this.rt.texture, out, { mode: 'add', offset: [off, 0], premult: false });
    }

    // ---- numerals: 7 5 3 2 slam on the syllables of "nanometers"
    if (!dive && r < tHold + 0.5) {
      const labs = ['7', '5', '3', '2'];
      const i = Math.max(0, numIdx);
      const s = r - n[i]!;
      const fam = F.archivo(100, 900);
      let k = ease.outExpo(clamp(s / 0.16));
      let size = 880, ox = 130, oy = 0, al = 1;
      if (i === 3) {
        const sh = ease.outExpo(clamp((r - tHold) / 0.3));
        size = lerp(880, 250, sh); ox = lerp(130, 96, sh); oy = lerp(0, -330, sh);
        al = 1 - smoothstep(tHold + 0.15, tHold + 0.5, r) * 0.0;
      }
      const sc = 1 + 0.28 * (1 - k);
      c.save();
      c.globalAlpha = al;
      c.font = font(fam, size);
      c.textBaseline = 'alphabetic';
      const m = c.measureText(labs[i]!);
      const capH = c.measureText('H').actualBoundingBoxAscent;
      const bx = ox, by = H / 2 + capH / 2 + oy;
      c.translate(bx + m.width / 2, by - capH / 2); c.scale(sc, sc); c.translate(-(bx + m.width / 2), -(by - capH / 2));
      c.fillStyle = HEX.bone;
      c.fillText(labs[i]!, bx, by);
      // nm superscript
      c.font = font(F.mono(600), size * 0.17); c.fillStyle = HEX.signal;
      c.fillText('nm', bx + m.width + size * 0.03, by - capH + size * 0.12);
      c.restore();
      if (r >= n[0]! && r < tHold) {
        shakeAmp = 16 * pulse(s, 0, 0.06);
        flash = s < 0.1 ? 0.28 * pulse(s, 0, 0.015) : 0;
        ca = 1.2 + 3 * pulse(s, 0, 0.08);
      }
    }
    this.karaoke(c, r);
    // mono furniture
    c.save(); c.globalAlpha = 0.6;
    c.font = font(F.mono(500), 15); c.fillStyle = HEX.bone; (c as any).letterSpacing = '1.5px';
    c.fillText('LOT 7A-0042 · STEP 08/31', 96, 110);
    c.textAlign = 'right';
    const nodeTxt = r < n[0]! ? 'DIE · FIN · GATE' : r < tHold ? 'GAA · 3 NANOSHEETS PER FIN' : r < tCrown ? 'GATE-ALL-AROUND · DOLLY' : 'TRANSISTORS LIT: ' + this.litCount(r);
    c.fillText(nodeTxt, W - 96, 110);
    c.restore();
    comp.draw(renderer, lay.upload(), out);

    // crown lights land with a beat flash
    const e = pulse(f.t, f.t - (r < tHold ? (r - (n[Math.max(0, numIdx)] ?? 0)) : 0), 0.065);
    void e;
    const fi = frameIdx(f.t);
    return {
      shake: [(hash(fi, 1) - 0.5) * 2 * shakeAmp, (hash(fi, 2) - 0.5) * 2 * shakeAmp],
      flash, ca: ca + 0.3, bloom: 0.4, bloomThreshold: 1.0, bloomKnee: 0.4, halation: 0.2, vignette: 0.35, hud: 0,
      invert: !dive && numIdx >= 0 && r < tHold && r - n[numIdx]! < 2 / 60 + 1e-4 ? 1 : 0,
    };
  }

  private litFor(r: number, order: number): number {
    const tCrown = this.words[4].start - this.T0;
    const t0 = tCrown + 0.35 + order * 0.75;
    const k = clamp((r - t0) / 0.18);
    return k;
  }
  private litCount(r: number): string {
    let c = 0;
    for (const cell of this.crown) if (this.litFor(r, cell.order) > 0.5) c++;
    return c.toLocaleString('en-US');
  }

  /** the array: fins and gates of the whole die at distance, and the lit crown cells */
  private farField(lb: LineBatch, r: number, ppu: number, vis: number, tCrown: number) {
    const tEnd = 3.28;
    const fade = 1 - smoothstep(tEnd, tEnd + 0.4, r) * 0.9; // lattice lines drop away at the end: only the lit lights remain
    const fin = lin(LIN.signal, 0.55 * vis * fade);
    const gate = lin(LIN.blood, 1.0 * vis * fade);
    const gw = Math.max(1, 1.8 * ppu);
    for (let j = -16; j <= 16; j++) this.S(lb, -84, j * 3, 0, 84, j * 3, 0, gw, gate[0], gate[1], gate[2], 0.55);
    if (ppu > 5) for (let x = -84; x <= 84; x++) this.S(lb, x, -50, 0, x, 50, 0, Math.max(1, 0.4 * ppu), fin[0], fin[1], fin[2], 0.7);
    // lit cells
    const beat = (r - tCrown) / BEAT;
    const hit = Math.pow(1 - (beat - Math.floor(beat)), 3);
    for (const cell of this.crown) {
      const k = this.litFor(r, cell.order);
      if (k <= 0) continue;
      const pulseK = 1 + (cell.peak ? 0.25 : 0.1) * hit * (r > tCrown + 1.0 ? 1 : 0);
      const base = k * (cell.band ? 1.15 : 1.0) * pulseK * vis;
      const x = cell.i * 3, y = cell.j * 3;
      const a = lin(LIN.signal, 1.3 * base), em = lin(LIN.ember, 1.8 * base);
      this.S(lb, x - 0.6, y, 0, x + 0.6, y, 0, gw * 0.98, a[0], a[1], a[2], Math.min(1, base));
      this.S(lb, x - 0.4, y, 0, x + 0.4, y, 0, gw * 0.45, em[0], em[1], em[2], Math.min(1, base));
    }
  }

  private karaoke(c: CanvasRenderingContext2D, r: number) {
    const t = r + this.T0;
    const fam = F.archivo(100, 700);
    const size = 56;
    c.save();
    c.font = font(fam, size); c.textBaseline = 'alphabetic';
    let x = 96;
    const y = H - 96;
    for (const w of this.words) {
      const p = Lyrics.wordProgress(w, t);
      const wd = c.measureText(w.w).width;
      c.fillStyle = 'rgba(238,233,223,0.28)'; c.fillText(w.w, x, y);
      if (p > 0) {
        c.save(); c.beginPath(); c.rect(x - 2, y - size, wd * p + 4, size * 1.4); c.clip();
        c.fillStyle = p >= 1 ? HEX.bone : HEX.signal; c.fillText(w.w, x, y); c.restore();
      }
      x += wd + c.measureText(' ').width;
    }
    c.restore();
    void TAU; void CELL_PX;
  }
}
