// node2 (chorus 2, "Two nanometers holding the crown"): an orthographic DIE SHOT that flies over the chip as a
// city (functional blocks as districts, NoC highways with amber traffic, low-sun shadows), starting on the wafer
// the sawblade of drop2 cut, zooming through the die to one hot core. The crown is a coronation: a laurel of
// interconnect wiring grows (pen-as-data, beam head) and tightens around a single transistor, whose fins rise
// into a crown. The last beat unrolls the laurel into the horizontal busbar that opens grid2.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { sparkHead as beamHead, sparkParticles as beamParticles, drawTPP, TPP, lineByScene } from './_motifs';
import { clamp, ease, lerp, prog, springStep, pulse, TAU, hash } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, amber, hot, karaokeWord, camAt, type Pose, shakeVec, W, H } from './node2-kit';
import { buildFloorplan, DIE_FRAG, type Floorplan } from './node2-die';
import type { Word } from '../engine/lyrics';

const T0 = 75.0;
export const LAUREL_C = { x: 1370, y: 540 };
const LAUREL_R = 380;
const K = 10; // leaves per branch

/** x of the laurel's final feeder stub k (side +1 right / -1 left): shared with grid2. */
export function stubX(side: number, k: number): number {
  const u = 0.1 + 0.85 * (k / (K - 1));
  return side > 0 ? LAUREL_C.x + 90 + u * (W - LAUREL_C.x - 90) : LAUREL_C.x - 90 - u * (LAUREL_C.x - 90);
}

export default class Node2 extends Scene {
  die!: FSPass;
  fp!: Floorplan;
  text = new Layer2D();
  lines = new LineBatch(24000);
  words: Word[] = [];
  rows: { words: Word[]; size: number; x: number; y: number }[] = [];
  tpp!: TPP;
  shots: Pose[] = [];

  override init() {
    this.fp = buildFloorplan(11);
    this.die = new FSPass(DIE_FRAG, {
      uFloor: { value: this.fp.tex }, uCam: { value: new THREE.Vector4(0, 0, 56, 0) }, uT: { value: 0 }, uBeat: { value: 0 },
      uWafer: { value: 7.6 }, uDim: { value: 1 }, uHot: { value: 0.3 }, uPaper: { value: 1 }, uFocus: { value: new THREE.Vector4(960, 540, 600, 1500) }, uSrcWave: { value: 0 }, uBlank: { value: 0 }, uMedal: { value: new THREE.Vector4(1370, 540, 440, 0) },
    });
    const line = lineByScene(this.ctx.lyrics, 'crown2');
    this.words = line.words;
    this.tpp = new TPP(this.ctx.lyrics);
    const fam = F.archivo(112, 900);
    const col = 96, maxW = 880;
    const two = this.words[0]!, nano = this.words[1]!, hold = [this.words[2]!, this.words[3]!], crown = this.words[4]!;
    const sTwo = 190, sNano = Math.min(150, fitSize('NANOMETERS', fam, maxW)), sHold = Math.min(150, fitSize('HOLDING THE', fam, maxW)), sCrown = Math.min(330, fitSize('CROWN', fam, maxW));
    let y = 96;
    const cap = 0.7;
    const gap = 34;
    y += cap * sTwo; this.rows.push({ words: [two], size: sTwo, x: col, y }); y += gap;
    y += cap * sNano; this.rows.push({ words: [nano], size: sNano, x: col, y }); y += gap;
    y += cap * sHold; this.rows.push({ words: hold, size: sHold, x: col, y }); y += gap;
    y += cap * sCrown; this.rows.push({ words: [crown], size: sCrown, x: col, y });
    const tg = this.fp.target;
    const sy = (pr: number) => pr; void sy;
    this.shots = [
      { t: 0, x: 0, y: 0, s: 1250 },
      { t: 75.469, x: -0.14, y: -0.12, s: 2700, r: 0.0, snap: 0.12 },
      { t: 75.9375, x: 0.18, y: 0.2, s: 4600, r: 0.14, snap: 0.12 },
      { t: 76.17, x: tg.x - 0.06, y: tg.y - 0.04, s: 9500, r: -0.06, snap: 0.16 },
      { t: 76.406, x: tg.x, y: tg.y, s: 16000, r: 0.0, snap: 0.12 },
      { t: 76.875, x: tg.x + 0.004, y: tg.y + 0.002, s: 30000, r: 0.0, snap: 0.14 },
    ];
  }

  /** wafer zoom for the first 0.4 s: log zoom from the whole disc to a single die */
  cam(t: number) {
    const b = camAt(this.shots, t);
    const z = ease.outExpo(clamp((t - T0) / 0.42));
    let s = Math.exp(lerp(Math.log(56), Math.log(1250), z));
    if (t >= 75.469) s = b.s * (1 + 0.04 * clamp((t - 75.469) / 1.4)); // slow push inside shots
    if (t >= 76.875) s = b.s * (1 + 0.1 * clamp((t - 76.875) / 1.4));
    else if (t >= 75.469) s = b.s * (1 + 0.05 * clamp((t - 75.469) / 1.0));
    return { x: b.x, y: b.y, s, r: b.r };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, kick = f.a.kick;
    const cam = this.cam(t);
    const U = this.die.u;
    (U.uCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.s, cam.r);
    U.uT!.value = t;
    U.uBeat!.value = kick * 0.25;
    const waferOn = t < 75.5;
    U.uWafer!.value = waferOn ? 7.6 : 0;
    U.uPaper!.value = 1 - prog(t, T0 + 0.05, T0 + 0.3, ease.outQuad);
    U.uHot!.value = 0.35 + 0.65 * prog(t, 75.3, 76.0) ;
    const roll = prog(t, 78.30, 78.72, ease.inOutCubic);
    U.uBlank!.value = 0.88 * roll;
    // darker under the text early, centred on the laurel late
    const lc = prog(t, 76.0, 76.5, ease.inOutQuad);
    (U.uFocus!.value as THREE.Vector4).set(lerp(960, LAUREL_C.x, lc), lerp(540, LAUREL_C.y, lc), lerp(700, 420, lc), lerp(1700, 900, lc));
    U.uDim!.value = 1;
    (U.uMedal!.value as THREE.Vector4).set(LAUREL_C.x, LAUREL_C.y, 440, 0.78 * prog(t, 76.2, 76.7) * (1 - roll));
    this.die.render(renderer, out);

    // ---- text layer
    const c = this.text.ctx;
    this.text.clear();
    // scrim for the left column
    const sc = prog(t, T0 + 0.1, T0 + 0.5);
    const g = c.createLinearGradient(0, 0, 1180, 0);
    g.addColorStop(0, `rgba(10,10,11,${0.9 * sc})`); g.addColorStop(0.6, `rgba(10,10,11,${0.78 * sc})`); g.addColorStop(1, 'rgba(10,10,11,0)');
    c.fillStyle = g; c.fillRect(0, 0, 1180, H);
    const fam = F.archivo(112, 900);
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]!;
      const w0 = r.words[0]!;
      const aIn = ease.outCubic(prog(t, w0.start - 0.35, w0.start - 0.05));
      let x = r.x;
      const slide = (1 - ease.outExpo(prog(t, w0.start - 0.12, w0.start + 0.22))) * -120;
      c.save();
      c.translate(slide, 0);
      for (const w of r.words) {
        x += karaokeWord(c, w, t, x, r.y, fam, r.size, { alphaIn: aIn, slam: 0.07, dim: rgbaS(C.bone, 0.2), settled: C.bone, hotFor: 0.45 }) + r.size * 0.22;
      }
      c.restore();
    }
    // node counter (7 -> 5 -> 3 -> 2) on the four syllables of "nanometers"
    const nano = this.words[1]!;
    const syl = nano.syl ?? [[nano.start, nano.end]];
    const nodes = ['N7', 'N5', 'N3', 'N2'];
    let ni = -1;
    for (let i = 0; i < syl.length; i++) if (t >= syl[i]![0]) ni = i;
    const nodeTxt = ni < 0 ? 'N--' : nodes[Math.min(ni, 3)]!;
    c.save();
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(500), 15); c.fillStyle = rgbaS(C.bone, 0.55);
    c.letterSpacing = '3px';
    c.fillText('PROCESS NODE', 96, 1010);
    c.letterSpacing = '0px';
    const nsz = 70 * (1 + 0.25 * (ni >= 0 ? pulse(t, syl[Math.min(ni, syl.length - 1)]![0], 0.08) : 0));
    c.font = font(F.archivo(100, 900), nsz); c.fillStyle = t >= syl[syl.length - 1]![0] ? C.signal : C.bone;
    c.fillText(nodeTxt, 330, 1012);
    // scale bar
    const mmPx = cam.s / 26.0; // 26 mm die
    const units: [number, string][] = [[10, '10 mm'], [1, '1 mm'], [0.1, '100 µm'], [0.01, '10 µm'], [0.001, '1 µm'], [0.0001, '100 nm']];
    let u = units[0]!;
    for (const q of units) if (q[0] * mmPx <= 340) { u = q; break; }
    const bl = u[0] * mmPx;
    const bx = 1920 - 96 - bl, by = 1010;
    c.fillStyle = rgbaS(C.bone, 0.8); c.fillRect(bx, by, bl, 2); c.fillRect(bx, by - 7, 2, 16); c.fillRect(bx + bl - 2, by - 7, 2, 16);
    c.font = font(F.mono(500), 15); c.textAlign = 'right'; c.fillText(u[1], bx + bl, by - 14); c.textAlign = 'left';
    drawTPP(c, 1920 - 96 - 300, 94, this.tpp.value(t), { width: 300 });
    c.restore();
    comp.draw(renderer, this.text.upload(), out);

    // ---- laurel, transistor, crown (beam-drawn wires)
    const lb = this.lines; lb.clear();
    this.drawWires(lb, t);
    lb.render(renderer, out);

    const crownHit = pulse(t, 76.875, 0.12);
    const [sx, sy2] = shakeVec(t, 14 * crownHit + 6 * kick * (t > 75.4 ? 1 : 0), 3);
    return {
      bloom: 0.8 + 0.5 * crownHit, bloomThreshold: 0.8, flash: 0.3 * crownHit + 0.18 * pulse(t, T0, 0.05), shake: [sx, sy2] as [number, number],
      zoom: 1 + 0.03 * kick + 0.05 * crownHit, ca: 0.8 + 3.0 * crownHit, vignette: 0.45,
    };
  }

  // -------------------------------------------------------------------------
  drawWires(lb: LineBatch, t: number) {
    const C0 = LAUREL_C;
    const grow0 = 76.17, grow1 = 76.88;
    const pen = prog(t, grow0, grow1, ease.inOutQuad);
    const roll = prog(t, 78.30, 78.72, ease.inOutCubic);
    const tight = springStep(t - 76.875, 2.6, 0.5);
    const R = LAUREL_R - 110 * tight + 6 * Math.sin(t * 6) * (t > 76.9 ? 0.4 : 0);
    const beat = pulse(t, 76.875, 0.2);
    const stemW = 2.2;
    const inten = 1.0 + 0.8 * beat + 0.5 * Math.max(0, Math.sin((t - 76.9) * TAU * 128 / 60 / 2)) * (t > 76.9 ? 1 : 0);
    if (t < 76.1) {
      // pre-growth: a lone pen dot (the beam) low on the die, ready
    }
    for (const side of [1, -1]) {
      const ang = (u: number) => lerp(98, -74, u) * Math.PI / 180;
      const arc = (u: number) => {
        const a = ang(u);
        return { x: C0.x + side * R * Math.cos(a), y: C0.y + R * Math.sin(a), a };
      };
      const line = (u: number) => ({ x: side > 0 ? C0.x + 90 + u * (W - C0.x - 90) : C0.x - 90 - u * (C0.x - 90), y: C0.y });
      const pos = (u: number) => {
        const a = arc(u), l = line(u);
        return { x: lerp(a.x, l.x, roll), y: lerp(a.y, l.y, roll), a: a.a };
      };
      // double-trace stem
      const N = 64;
      const endU = pen;
      let prev: { x: number; y: number } | null = null, prevN: { x: number; y: number } | null = null;
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * endU;
        if (endU <= 0) break;
        const p = pos(u);
        const a = ang(u);
        // normal (outward) for offsets
        const nx = side * Math.cos(a), ny = Math.sin(a);
        const off = lerp(3.5, 0, roll);
        const q = { x: p.x + nx * off, y: p.y + ny * off };
        const q2 = { x: p.x - nx * off, y: p.y - ny * off };
        if (prev && prevN) {
          const age = 1 - (i / N); // older = dimmer
          const k = 0.55 + 0.45 * (1 - age * 0.5);
          lb.seg2(prev.x, prev.y, q.x, q.y, stemW, amber(k * inten), 0.95);
          lb.seg2(prevN.x, prevN.y, q2.x, q2.y, stemW * 0.8, amber(k * 0.7 * inten), 0.8);
        }
        prev = q; prevN = q2;
      }
      // leaves
      for (let k = 0; k < K; k++) {
        const uL = 0.1 + 0.85 * (k / (K - 1));
        // leaf grows after the pen passes uL (in time terms): invert the pen ease approximately
        const q = clamp((pen - uL) / 0.12);
        if (q <= 0) continue;
        const p = pos(uL);
        const a = p.a;
        const nx = side * Math.cos(a), ny = Math.sin(a); // outward
        // tangent toward tip: derivative of angle (decreasing a) -> direction
        const tx = side * Math.sin(a), ty = -Math.cos(a);
        for (const inward of [false, true]) {
          const sgn = inward ? -1 : 1;
          const LfBase = (inward ? 52 : 78) * (0.75 + 0.25 * Math.sin(Math.PI * uL)) * (R / LAUREL_R + 0.1);
          // roll: leaves straighten into a vertical stub (36 px, alternating up/down)
          const stubDir = inward ? 1 : -1;
          const dirArc = { x: nx * sgn * 0.62 + tx * 0.78, y: ny * sgn * 0.62 + ty * 0.78 };
          const dirStub = { x: 0, y: stubDir };
          let dx = lerp(dirArc.x, dirStub.x, roll), dy = lerp(dirArc.y, dirStub.y, roll);
          const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          const Lf = lerp(LfBase, 34, roll) * ease.outBack(q);
          const e = { x: p.x + dx * Lf, y: p.y + dy * Lf };
          const m = { x: p.x + dx * Lf * 0.48, y: p.y + dy * Lf * 0.48 };
          const wv = Lf * 0.17 * (1 - roll);
          const m1 = { x: m.x - dy * wv, y: m.y + dx * wv }, m2 = { x: m.x + dy * wv, y: m.y - dx * wv };
          const I = (0.8 + 0.6 * beat) * (0.7 + 0.3 * q);
          lb.seg2(p.x, p.y, m1.x, m1.y, 1.6, amber(I)); lb.seg2(m1.x, m1.y, e.x, e.y, 1.6, amber(I));
          lb.seg2(p.x, p.y, m2.x, m2.y, 1.6, amber(I)); lb.seg2(m2.x, m2.y, e.x, e.y, 1.6, amber(I));
          lb.seg2(p.x, p.y, e.x, e.y, 1.0, hot(0.55 * I));
          // via at the tip
          if (q > 0.6) lb.seg2(e.x - 3.5, e.y, e.x + 3.5, e.y, 6.5, hot(1.4 * I), 1);
        }
      }
      // pen head (the beam), sputtering
      if (pen > 0 && pen < 1) {
        const hp = pos(pen);
        beamHead(lb, hp.x, hp.y, t, 1.0, 1);
      }
    }
    // pen particles
    if (t >= grow0 && t < grow1 + 0.3) {
      beamParticles(lb, t, (tb: number) => {
        const pn = prog(tb, grow0, grow1, ease.inOutQuad);
        if (pn <= 0 || pn >= 1) return null;
        const a = lerp(98, -74, pn) * Math.PI / 180;
        return { x: C0.x + R * Math.cos(a), y: C0.y + R * Math.sin(a) };
      }, { rate: 140, life: 0.4, speed: 220, gravity: 300, seed: 5 });
    }

    // ---- the transistor at the laurel's centre (top-down: 3 fins x gate)
    const tr = prog(t, 76.3, 76.8, ease.outCubic);
    const crownK = ease.outBack(prog(t, 76.875, 77.2));
    const glow = 0.4 + 0.9 * prog(t, 76.875, 77.3) + 0.5 * beat;
    if (tr > 0) {
      const x0 = C0.x, y0 = C0.y;
      const finLen = 150 * tr;
      for (let i = -1; i <= 1; i++) {
        const fy = y0 + i * 34;
        lb.seg2(x0 - finLen / 2, fy, x0 + finLen / 2, fy, 13, amber(0.5 + 0.3 * glow), 0.95);
        lb.seg2(x0 - finLen / 2, fy - 3.5, x0 + finLen / 2, fy - 3.5, 1.4, hot(0.8), 0.8);
        // source/drain contacts
        lb.seg2(x0 - finLen / 2 - 6, fy, x0 - finLen / 2 - 6, fy, 12, hot(1.2 * glow), 1);
        lb.seg2(x0 + finLen / 2 + 6, fy, x0 + finLen / 2 + 6, fy, 12, hot(1.2 * glow), 1);
      }
      // gate bar
      lb.seg2(x0, y0 - 66 * tr, x0, y0 + 66 * tr, 24, amber(0.55 + 0.6 * glow), 0.96);
      lb.seg2(x0 - 7, y0 - 66 * tr, x0 - 7, y0 + 66 * tr, 2, hot(1.3 * glow), 1);
      lb.seg2(x0 + 7, y0 - 66 * tr, x0 + 7, y0 + 66 * tr, 2, hot(0.8 * glow), 1);
    }
    // ---- the crown above the transistor: five fins rising, with a base rail
    const ck = clamp(crownK * (1 - roll), 0, 1.15);
    if (ck > 0.01) {
      const bx = C0.x, by = C0.y - 100;
      const pts: [number, number][] = [[-96, 0], [-96, -78], [-48, -40], [0, -96], [48, -40], [96, -78], [96, 0]];
      const sc = ck * 1.3;
      const P = pts.map(([x, y]) => ({ x: bx + x * sc, y: by + y * sc }));
      const I = 1.1 + 0.7 * beat + 0.4 * glow;
      for (let i = 1; i < P.length; i++) lb.seg2(P[i - 1]!.x, P[i - 1]!.y, P[i]!.x, P[i]!.y, 5.5, amber(I), 1);
      lb.seg2(P[0]!.x, P[0]!.y, P[P.length - 1]!.x, P[P.length - 1]!.y, 5.5, amber(I), 1);
      for (const i of [1, 3, 5]) { lb.seg2(P[i]!.x, P[i]!.y, P[i]!.x, P[i]!.y, 14, hot(2.4), 1); }
      // fin hairlines
      for (let i = 0; i <= 8; i++) { const x = bx + (-96 + i * 24) * sc; lb.seg2(x, by, x, by - 20 * sc * (1 + 0.5 * Math.sin(i * 3.1)), 1.2, hot(0.7), 0.8); }
      // a halo ring where the wreath clasps
      if (t < 78.3) beamHead(lb, bx, by - 96 * sc, t, 0.9 * sc, 1);
    }
    // wreath clasp ring pulse on crown
    if (t >= 76.875 && t < 77.6) {
      const k = (t - 76.875) / 0.7, rr = lerp(60, 500, ease.outExpo(k));
      for (let i = 0; i < 48; i++) {
        const a0 = (i / 48) * TAU, a1 = ((i + 1) / 48) * TAU;
        lb.seg2(C0.x + Math.cos(a0) * rr, C0.y + Math.sin(a0) * rr, C0.x + Math.cos(a1) * rr, C0.y + Math.sin(a1) * rr, 2.5, hot(2 * (1 - k)), 1 - k);
      }
    }
    // the horizontal busbar fades in during the roll (the line itself is the unrolled stems; add centre bridge)
    if (roll > 0) {
      lb.seg2(C0.x - 90, C0.y, C0.x + 90, C0.y, 2.2, amber(1.0), roll);
    }
    void hash;
  }
}
