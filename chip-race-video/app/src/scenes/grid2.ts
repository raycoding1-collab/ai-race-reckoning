// grid2 (chorus 2, "Gigawatts in a cornfield town"): an electrical ONE-LINE DIAGRAM of the grid feeding a datacentre.
// Breakers slam closed on the sung syllables (blade springs shut, flash ring, shake) and current floods the line as
// amber dashes with a white-hot head (the beam). The site-load meter's needle climbs with every hall and pins; in the last
// 0.4 s the camera pushes into that meter so it becomes down2's speedometer, in the same pose.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { sparkHead as beamHead, sparkParticles as beamParticles, drawTPP, TPP, lineByScene } from './_motifs';
import { clamp, ease, lerp, prog, springStep, pulse, TAU, hash, frameIdx } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { C, rgbaS, amber, hot, karaokeWord, shakeVec, stepped, drawDial, W, H, pulses } from './node2-kit';
import type { Word } from '../engine/lyrics';
import { stubX } from './node2';

export const GRID2_DIAL = { x: 1480, y: 270, R: 170 };
export const GRID2_END_FRAC = 0.88;
const BUS_Y = 540;
const FEED_X = [900, 1090, 1280, 1470, 1660];
const HALL_Y = 770;

// slam schedule keyed to the sung syllables (78.75, 78.98, 79.22 = "Gigawatts"; then in / a / cornfield(2) / town)
const SLAM = { cb1: 78.75, t1: 78.98, cb2: 79.22, feed: [79.69, 79.92, 80.16, 80.39, 80.62] };

interface Path { pts: [number, number][]; e0: number; speed: number; len: number; cum: number[] }
function mkPath(pts: [number, number][], e0: number, speed = 1500): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts, e0, speed, len: cum[cum.length - 1]!, cum };
}
function atLen(p: Path, s: number): [number, number] {
  s = clamp(s, 0, p.len);
  for (let i = 1; i < p.pts.length; i++) if (s <= p.cum[i]!) {
    const k = (s - p.cum[i - 1]!) / Math.max(1e-6, p.cum[i]! - p.cum[i - 1]!);
    return [lerp(p.pts[i - 1]![0], p.pts[i]![0], k), lerp(p.pts[i - 1]![1], p.pts[i]![1], k)];
  }
  return p.pts[p.pts.length - 1]!;
}

export default class Grid2 extends Scene {
  bg!: FSPass;
  text = new Layer2D();
  lines = new LineBatch(16000);
  words: Word[] = [];
  paths: Path[] = [];
  tpp!: TPP;
  rowSizes = { a: 160, b: 80 };

  override init() {
    this.bg = new FSPass(`uniform float uT; uniform float uZoom;
      void main(){
        vec2 px = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
        vec3 col = C_INK;
        // registration crosses every 60px
        vec2 g = fract(px / 60.0) - 0.5;
        float cross = max(step(abs(g.x), 0.012) * step(abs(g.y), 0.08), step(abs(g.y), 0.012) * step(abs(g.x), 0.08));
        col += C_BONE * 0.05 * cross;
        float v = length(px / vec2(1920.0, 1080.0) - 0.5);
        col *= 1.0 - 0.55 * smoothstep(0.35, 0.85, v);
        fragColor = vec4(col, 1.0);
      }`, { uT: { value: 0 }, uZoom: { value: 1 } });
    const line = lineByScene(this.ctx.lyrics, 'grid2');
    this.words = line.words;
    this.tpp = new TPP(this.ctx.lyrics);
    const fam = F.archivo(125, 900);
    this.rowSizes.a = Math.min(210, fitSize('GIGAWATTS', fam, 1060));
    this.rowSizes.b = Math.min(86, fitSize('IN A CORNFIELD TOWN', F.archivo(100, 800), 1060));
    const Y = BUS_Y;
    this.paths = [
      mkPath([[150, Y], [300, Y]], SLAM.cb1, 1400),
      mkPath([[300, Y], [470, Y]], SLAM.cb1 + 0.1, 1400),
      mkPath([[470, Y], [650, Y]], SLAM.t1 + 0.06, 1400),
      mkPath([[650, Y], [800, Y]], SLAM.cb2 + 0.04, 1400),
      mkPath([[800, Y], [1760, Y]], SLAM.cb2 + 0.14, 2200),
      ...FEED_X.map((x, i) => mkPath([[x, Y], [x, HALL_Y]], SLAM.feed[i]! + 0.04, 1100)),
    ];
  }

  loadFrac(t: number) {
    const times = [SLAM.t1, SLAM.cb2, ...SLAM.feed];
    const base = [0, 0.1, 0.1, 0.13, 0.13, 0.13, 0.13, 0.14];
    const vals: number[] = [0]; let acc = 0;
    for (let i = 0; i < times.length; i++) { acc += base[i + 1]!; vals.push(acc); }
    let f = stepped(t, [0, ...times], vals, 3.4, 0.42);
    f += 0.02 * ease.outQuad(prog(t, 80.7, 82.0));
    return f; // ends ~0.86+0.02
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const kick = f.a.kick;
    this.bg.u.uT!.value = t;
    this.bg.render(renderer, out);

    const slams = [SLAM.cb1, SLAM.t1, SLAM.cb2, ...SLAM.feed];
    const slamHit = pulses(slams, t, 0.09);
    const D = GRID2_DIAL;
    // camera push into the dial: 82.12 -> 82.5
    const ck = ease.inOutCubic(prog(t, 82.1, 82.5));
    const scale = lerp(1, 380 / D.R, ck);
    const [sx, sy] = shakeVec(t, 5 * slamHit + 2.0 * kick, 2);

    const c = this.text.ctx;
    this.text.clear();
    c.save();
    c.translate(lerp(D.x, 960, ck) + sx * (1 - ck), lerp(D.y, 600, ck) + sy * (1 - ck));
    c.scale(scale, scale);
    c.translate(-D.x, -D.y);
    this.drawDiagram(c, t);
    c.restore();
    comp.draw(renderer, this.text.upload(), out);

    // current (beam) over the diagram: LineBatch, only before the camera push takes over
    const lb = this.lines; lb.clear();
    const vis = 1 - ck;
    if (vis > 0.01) this.drawCurrent(lb, t, vis, sx, sy);
    lb.render(renderer, out);

    return {
      bloom: 0.75 + 0.5 * slamHit, bloomThreshold: 0.82, zoom: 1 + 0.012 * kick + 0.03 * slamHit, ca: 0.6 + 2.2 * slamHit,
      shake: [sx * 0.5, sy * 0.5] as [number, number], flash: 0.1 * pulse(t, SLAM.feed[4]!, 0.05) + 0.14 * pulse(t, 78.75, 0.05),
    };
  }

  // ---------------------------------------------------------------------------------------------
  energised(p: Path, t: number) { return clamp((t - p.e0) * p.speed, 0, p.len); }

  drawDiagram(c: CanvasRenderingContext2D, t: number) {
    const Y = BUS_Y;
    const bone = C.bone;
    c.lineCap = 'round'; c.lineJoin = 'round';
    // cornfield: crop rows across the lower band (engraved parallels, perspective-free)
    c.strokeStyle = rgbaS(C.ash, 0.1); c.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = 40 + i * 48; c.beginPath(); c.moveTo(x, 700); c.lineTo(x - 60, 1080); c.stroke(); }
    // drawing frame + title block
    c.strokeStyle = rgbaS(bone, 0.35); c.lineWidth = 1.5; c.strokeRect(60, 60, W - 120, H - 120);
    c.strokeStyle = rgbaS(bone, 0.2); c.strokeRect(70, 70, W - 140, H - 140);
    c.font = font(F.mono(500), 13); c.fillStyle = rgbaS(bone, 0.5); c.textBaseline = 'alphabetic'; c.letterSpacing = '2px';
    c.fillText('DWG SS-3A090-E1 · ONE-LINE DIAGRAM · CORNFIELD CAMPUS · REV C', 96, 110);
    c.fillText('500 kV / 138 kV / 34.5 kV · 60 Hz · ALL BREAKERS SHOWN OPEN UNLESS ENERGISED', 96, 1000);
    c.letterSpacing = '0px';
    // base (dead) conductor lines in graphite
    c.strokeStyle = rgbaS(C.graphite, 0.9); c.lineWidth = 2.5;
    for (const p of this.paths) { c.beginPath(); c.moveTo(p.pts[0]![0], p.pts[0]![1]); for (const q of p.pts.slice(1)) c.lineTo(q[0], q[1]); c.stroke(); }
    // handoff from node2: the whole bus is still amber for the first beat of the plate, dying at 78.82
    const inh = 1 - ease.inQuad(prog(t, 78.76, 78.92));
    if (inh > 0.01) {
      c.strokeStyle = rgbaS(C.signal, inh); c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, Y); c.lineTo(W, Y); c.stroke();
      // node2's feeder stubs at the leaf x positions
      for (const side of [1, -1]) for (let k = 0; k < 10; k++) {
        const x = stubX(side, k); const sgn = k % 2 ? 1 : -1;
        c.beginPath(); c.moveTo(x, Y); c.lineTo(x, Y + sgn * 34 * (1 - 0.0)); c.stroke();
      }
    }
    // source
    const cx0 = 150;
    c.fillStyle = C.ink; c.strokeStyle = bone; c.lineWidth = 2.5;
    c.beginPath(); c.arc(cx0, Y, 46, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = t >= SLAM.cb1 ? C.signal : rgbaS(bone, 0.9);
    c.beginPath();
    for (let i = 0; i <= 40; i++) { const x = cx0 - 28 + i * 1.4; const y = Y - Math.sin((i / 40) * TAU + t * 0) * 14; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    this.label(c, cx0, Y - 74, 'UTILITY', '500 kV GRID');
    // breakers on the main line
    this.breaker(c, 300, Y, false, SLAM.cb1, t, 'CB-1');
    this.transformer(c, 470, Y, SLAM.t1, t, 'T1', '500/138 kV · 1.5 GVA');
    this.breaker(c, 650, Y, false, SLAM.cb2, t, 'CB-2');
    // busbar (thick)
    const busE = this.energised(this.paths[4]!, t) / this.paths[4]!.len;
    c.lineWidth = 10; c.strokeStyle = rgbaS(C.graphite, 0.95); c.beginPath(); c.moveTo(800, Y); c.lineTo(1760, Y); c.stroke();
    c.fillStyle = rgbaS(bone, 0.5); c.font = font(F.mono(500), 13); c.letterSpacing = '2px';
    c.fillText('BUS 138 kV', 800, Y - 20); c.letterSpacing = '0px';
    // feeders: breaker + hall
    for (let i = 0; i < FEED_X.length; i++) {
      const x = FEED_X[i]!;
      this.breaker(c, x, 640, true, SLAM.feed[i]!, t, `CB-${3 + i}`);
      this.hall(c, x, HALL_Y, SLAM.feed[i]! + 0.1, t, i);
    }
    // site meter
    const D = GRID2_DIAL;
    const frac = this.loadFrac(t);
    const pinned = clamp((t - 80.7) / 1.0);
    drawDial(c, D.x, D.y, D.R, {
      frac, labelsA: ['0', '0.3', '0.6', '0.9', '1.2', '1.5'], titleA: 'SITE LOAD · GW', redFrom: 0.8,
      shakeDeg: 0.7 + 2.6 * pinned + 3 * pulses([...SLAM.feed], t, 0.05), t, hubGlow: pinned,
    });
    // digital GW readout
    const gw = frac * 1.5;
    c.font = font(F.mono(600), 34); c.fillStyle = frac >= 0.8 ? C.signal : bone; c.textAlign = 'center';
    c.fillText(`${gw.toFixed(2)} GW`, D.x, D.y + D.R + 58); c.textAlign = 'left';
    // lyric: GIGAWATTS huge, "in a cornfield town" under it
    const fam = F.archivo(125, 900);
    const w0 = this.words[0]!;
    karaokeWord(c, w0, t, 96, 312, fam, this.rowSizes.a, { dim: rgbaS(bone, 0.2), settled: bone, slam: 0.05, hotFor: 0.5 });
    let x = 100;
    for (let i = 1; i < this.words.length; i++) {
      const w = this.words[i]!;
      x += karaokeWord(c, w, t, x, 424, F.archivo(100, 800), this.rowSizes.b, { dim: rgbaS(bone, 0.24), settled: bone, slam: 0.08 }) + this.rowSizes.b * 0.28;
    }
    drawTPP(c, 96, 905, this.tpp.value(t), { width: 280 });
  }

  label(c: CanvasRenderingContext2D, x: number, y: number, a: string, b: string) {
    c.save(); c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.textAlign = 'center';
    c.fillStyle = rgbaS(C.bone, 0.9); c.fillText(a, x, y); c.fillStyle = rgbaS(C.bone, 0.45); c.fillText(b, x, y + 18);
    c.restore();
  }

  breaker(c: CanvasRenderingContext2D, x: number, y: number, vertical: boolean, tSlam: number, t: number, name: string) {
    const closed = t >= tSlam;
    // blade angle springs from 40deg open to 0 with overshoot
    const k = closed ? springStep(t - tSlam, 3.0, 0.38) : 0;
    const ang = (1 - k) * 0.7;
    const flash = pulse(t, tSlam, 0.08);
    c.save();
    c.translate(x, y);
    if (vertical) c.rotate(Math.PI / 2);
    // body square
    c.lineWidth = 2.5;
    c.fillStyle = closed ? rgbaS(C.signal, 0.9) : C.ink;
    c.strokeStyle = rgbaS(C.bone, 0.95);
    c.beginPath(); c.rect(-20, -20, 40, 40); c.fill(); c.stroke();
    // contacts and blade
    c.strokeStyle = closed ? C.ink : rgbaS(C.bone, 0.95); c.lineWidth = 3;
    c.beginPath(); c.moveTo(-20, 0); c.lineTo(20 * Math.cos(-ang) - 0, 20 * Math.sin(-ang) * 1.0); c.stroke();
    c.fillStyle = closed ? C.ink : C.bone; c.beginPath(); c.arc(20, 0, 3, 0, TAU); c.fill();
    if (flash > 0.02) { c.strokeStyle = `rgba(255,240,215,${flash})`; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 26 + 60 * (1 - flash), 0, TAU); c.stroke(); }
    c.restore();
    c.save(); c.font = font(F.mono(500), 12); c.letterSpacing = '2px'; c.fillStyle = rgbaS(C.bone, closed ? 0.9 : 0.45);
    if (vertical) c.fillText(name, x + 30, y + 4); else { c.textAlign = 'center'; c.fillText(name, x, y - 32); }
    c.restore();
  }

  transformer(c: CanvasRenderingContext2D, x: number, y: number, tOn: number, t: number, name: string, sub: string) {
    const on = t >= tOn;
    const hum = on ? 1 + 0.03 * Math.sin(t * 120) : 1;
    c.save();
    c.lineWidth = 2.5; c.fillStyle = C.ink;
    for (const dx of [-17, 17]) {
      c.strokeStyle = on ? C.signal : rgbaS(C.bone, 0.95);
      c.beginPath(); c.arc(x + dx, y, 34 * hum, 0, TAU); c.fill(); c.stroke();
    }
    // winding hatch inside (engraved)
    c.lineWidth = 1; c.strokeStyle = on ? rgbaS(C.ember, 0.7) : rgbaS(C.bone, 0.3);
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x - 40, y + i * 8); c.lineTo(x + 40, y + i * 8); c.stroke(); }
    c.restore();
    this.label(c, x, y - 70, name, sub);
  }

  hall(c: CanvasRenderingContext2D, x: number, y: number, tOn: number, t: number, i: number) {
    const w = 170, h = 150;
    const on = t >= tOn;
    c.save();
    c.fillStyle = C.ink2; c.strokeStyle = rgbaS(C.bone, 0.85); c.lineWidth = 2;
    c.beginPath(); c.rect(x - w / 2, y, w, h); c.fill(); c.stroke();
    // rack rows
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const yy = y + 12 + r * 14;
      const lit = on && (t - tOn) > r * 0.035;
      const fl = 0.75 + 0.25 * hash(frameIdx(t) * 0.1, r + i * 11);
      c.fillStyle = lit ? rgbaS(C.signal, 0.9 * fl) : rgbaS(C.graphite, 0.5);
      c.fillRect(x - w / 2 + 12, yy, w - 24, 6);
      if (lit) { c.fillStyle = rgbaS(C.ember, 0.9 * fl); c.fillRect(x - w / 2 + 12 + ((t * 120 + r * 37) % (w - 40)), yy, 14, 6); }
    }
    c.font = font(F.mono(600), 15); c.letterSpacing = '2px'; c.textAlign = 'center';
    c.fillStyle = rgbaS(C.bone, 0.85); c.fillText(`HALL ${'ABCDE'[i]}`, x, y + h + 24);
    const mw = on ? Math.round(240 * ease.outExpo(prog(t, tOn, tOn + 0.5))) : 0;
    c.fillStyle = on ? C.signal : rgbaS(C.bone, 0.35); c.fillText(`${mw} MW`, x, y + h + 46);
    c.restore();
  }

  drawCurrent(lb: LineBatch, t: number, vis: number, sx: number, sy: number) {
    for (const p of this.paths) {
      const e = this.energised(p, t);
      if (e <= 0) continue;
      const steady = clamp((t - p.e0 - p.len / p.speed) / 0.1);
      // energised conductor
      const N = Math.max(2, Math.ceil(e / 40));
      let prev = atLen(p, 0);
      for (let i = 1; i <= N; i++) {
        const q = atLen(p, (e * i) / N);
        lb.seg2(prev[0] + sx, prev[1] + sy, q[0] + sx, q[1] + sy, 3.4, amber(0.9 * vis), 1);
        prev = q;
      }
      // moving dashes: white-hot, pitch 54, speed 520 px/s
      const pitch = 54, off = (t * 520) % pitch;
      for (let s = off; s < e; s += pitch) {
        const a = atLen(p, s), b = atLen(p, Math.min(e, s + 16));
        lb.seg2(a[0] + sx, a[1] + sy, b[0] + sx, b[1] + sy, 4.6, hot(1.7 * vis), 1);
      }
      // the head
      if (steady < 1) {
        const h = atLen(p, e);
        beamHead(lb, h[0] + sx, h[1] + sy, t, 0.9, vis);
      }
    }
    // slam rings and sparks at the breakers
    const spots: [number, number, number][] = [[300, BUS_Y, SLAM.cb1], [470, BUS_Y, SLAM.t1], [650, BUS_Y, SLAM.cb2], ...FEED_X.map((x, i): [number, number, number] => [x, 640, SLAM.feed[i]!])];
    for (const [x, y, ts] of spots) {
      const dt = t - ts;
      if (dt < 0 || dt > 0.45) continue;
      const k = dt / 0.45;
      const r = 20 + 130 * ease.outExpo(k);
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU;
        lb.seg2(x + Math.cos(a0) * r + sx, y + Math.sin(a0) * r + sy, x + Math.cos(a1) * r + sx, y + Math.sin(a1) * r + sy, 2.5, hot(2.2 * (1 - k) * vis), 1 - k);
      }
      beamParticles(lb, t, (tb: number) => (tb >= ts && tb < ts + 0.12 ? { x: x + sx, y: y + sy } : null), { rate: 260, rateMax: 260, life: 0.3, speed: 420, gravity: 700, seed: Math.floor(ts * 10), intensity: 1 * vis });
    }
    // dial hub glow
    void TAU;
  }
}
