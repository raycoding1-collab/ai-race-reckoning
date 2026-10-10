// GRID 1: "Gigawatts in a cornfield town". Night aerial, long exposure: field rows as fine parallel lines,
// a datacentre campus glowing amber, transmission lines carrying beam pulses inbound on the beat, GIGAWATTS
// painted on the ground in perspective, and a site-load gauge climbing to 1.2 GW.
// In:  node1's crown of lit cells seen from straight above (same world, same camera): the lights shrink to town lights.
// Out: everything falls away except one beam line, which becomes down1's racing line.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, makeRT, clearRT, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { HEX, LIN } from '../engine/palette';
import { ease, clamp, lerp, pulse, hash, frameIdx, smoothstep, TAU, mulberry32, keys } from '../engine/util';
import { Lyrics } from '../engine/lyrics';
import { lineByScene } from './_motifs';
import { crownCells } from './node1-crown';

const BEAT = 60 / 128;
const FOV = 28;
const TANH = Math.tan((FOV * Math.PI) / 360);
type V3 = [number, number, number];
const lin = (c: [number, number, number], k = 1): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

// the datacentre campus
const SUB: V3 = [0, 262, 0]; // substation
const HALL_Y = [300, 352, 404, 456];
const CORRIDORS: V3[][] = [
  [[-430, 80, 0], SUB],
  [[430, 60, 0], SUB],
  [[-300, 520, 0], SUB],
];

export default class Grid1 extends Scene {
  T0 = 0;
  words: any[] = [];
  rt = makeRT(W, H);
  base = new LineBatch(160000, { screen2D: false, blend: 'max' });
  glow = new LineBatch(40000, { screen2D: false, blend: 'add' });
  cam = new THREE.PerspectiveCamera(FOV, W / H, 0.5, 4000);
  layer = new Layer2D();
  ground = new Layer2D(2048, 1024, 1);
  gScene = new THREE.Scene();
  gMat = new THREE.MeshBasicMaterial({ map: this.ground.texture, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
  gMesh!: THREE.Mesh;
  crown = crownCells();
  pylons: V3[][] = [];
  wires: V3[][][] = []; // per corridor, per conductor: polyline
  pathLen: number[][] = [];

  override async init() {
    const line = lineByScene(this.ctx.lyrics, 'grid1');
    this.T0 = line.start; this.words = line.words;
    this.cam.up.set(0, 0, 1);
    const geo = new THREE.PlaneGeometry(400, 200);
    this.gMesh = new THREE.Mesh(geo, this.gMat);
    this.gMesh.position.set(0, 135, 0.2);
    this.gMesh.frustumCulled = false;
    this.gScene.add(this.gMesh);
    // transmission corridors: pylons every ~48 units, three conductors with sag
    for (const [a, b] of CORRIDORS) {
      const n = Math.max(3, Math.round(Math.hypot(b![0] - a![0], b![1] - a![1]) / 48));
      const ps: V3[] = [];
      for (let i = 0; i < n; i++) { const u = i / n; ps.push([lerp(a![0], b![0], u), lerp(a![1], b![1], u), 0]); }
      this.pylons.push(ps);
      const dir = [b![0] - a![0], b![1] - a![1]]; const dl = Math.hypot(dir[0]!, dir[1]!);
      const nx = -dir[1]! / dl, ny = dir[0]! / dl; // sideways
      const cons: V3[][] = [];
      for (const off of [-5, 0, 5]) {
        const pts: V3[] = [];
        const all = [...ps, [b![0], b![1], 0] as V3];
        for (let i = 0; i < all.length - 1; i++) {
          const p0 = all[i]!, p1 = all[i + 1]!;
          for (let k = 0; k < 10; k++) {
            const u = k / 10;
            const sag = 4 * u * (1 - u) * 3.5;
            pts.push([lerp(p0[0], p1[0], u) + nx * off, lerp(p0[1], p1[1], u) + ny * off, 19.5 - sag + (off === 0 ? 3 : 0)]);
          }
        }
        pts.push([b![0] + nx * off * 0.2, b![1] + ny * off * 0.2, 11]);
        cons.push(pts);
      }
      this.wires.push(cons);
      this.pathLen.push(cons.map((c) => c.length));
    }
    this.drawGround(0, 0);
  }

  // ------------------------------------------------------------------ camera
  private camAt(r: number): { pos: V3; tgt: V3; up: V3 } {
    const T = 3.28;
    const u = clamp(r / T);
    const e = ease.inOutCubic(u);
    const pos: V3 = [lerp(0, 0, e), lerp(0, -128, ease.inOutQuad(clamp(u * 1.0))), lerp(135.6, 150, ease.outCubic(u)) + 30 * Math.sin(u * Math.PI)];
    const tgt: V3 = [0, lerp(0, 118, e), 0];
    const k = smoothstep(0.02, 0.5, u);
    const up: V3 = [0, 1 - k, k];
    // the slow glide north on the last bars
    const glide = smoothstep(0.5, 1, u);
    pos[1] += 36 * glide; tgt[1] += 36 * glide;
    return { pos, tgt, up };
  }

  private S(lb: LineBatch, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, c: [number, number, number], a = 1) {
    const m = this.cam.matrixWorldInverse.elements;
    const za = m[2]! * ax + m[6]! * ay + m[10]! * az + m[14]!, zb = m[2]! * bx + m[6]! * by + m[10]! * bz + m[14]!;
    const N = -0.6;
    if (za > N && zb > N) return;
    if (za > N || zb > N) {
      const t = (N - za) / (zb - za);
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
      if (za > N) { ax = cx; ay = cy; az = cz; } else { bx = cx; by = cy; bz = cz; }
    }
    lb.seg(ax, ay, az, bx, by, bz, w, c[0], c[1], c[2], a);
  }

  private ppu(x: number, y: number, z: number): number {
    const d = Math.hypot(x - this.cam.position.x, y - this.cam.position.y, z - this.cam.position.z);
    return H / 2 / (TANH * Math.max(1, d));
  }

  // ------------------------------------------------------------------ the painted ground text
  private drawGround(r: number, hit: number) {
    const c = this.ground.ctx;
    this.ground.clear();
    const t = r + this.T0;
    const g = this.words[0];
    const sy = g.syl as number[][];
    const fam = F.archivo(125, 900);
    c.save();
    c.fillStyle = 'rgba(0,0,0,0)';
    c.font = font(fam, 300);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const full = 'GIGAWATTS';
    const wFull = c.measureText(full).width;
    const x0 = (2048 - wFull) / 2, y0 = 360;
    // syllable chunks: GI / GA / WATTS ignite like floodlights
    const chunks = [['GI', 0], ['GA', 1], ['WATTS', 2]] as const;
    let x = x0;
    for (const [txt, i] of chunks) {
      const w = c.measureText(txt).width;
      const k = clamp((t - sy[i]![0]) / 0.12);
      const p = i === 2 ? Lyrics.wordProgress(g, t) : k;
      const al = 0.1 + 0.9 * (k > 0 ? ease.outExpo(k) : 0);
      c.fillStyle = `rgba(255,164,27,${al})`;
      c.fillText(txt, x, y0);
      if (k > 0 && k < 1) { c.fillStyle = `rgba(255,236,190,${(1 - k) * 0.9})`; c.fillText(txt, x, y0); }
      void p;
      x += w;
    }
    // second line: "in a cornfield town" in the rows themselves
    c.font = font(F.archivo(100, 700), 120);
    let xx = (2048 - c.measureText('in a cornfield town').width) / 2;
    for (let wi = 1; wi < this.words.length; wi++) {
      const w = this.words[wi];
      const p = Lyrics.wordProgress(w, t);
      const tw = c.measureText(w.w).width;
      c.fillStyle = 'rgba(255,164,27,0.16)'; c.fillText(w.w, xx, 560);
      if (p > 0) {
        c.save(); c.beginPath(); c.rect(xx - 4, 400, tw * p + 8, 260); c.clip();
        c.fillStyle = p >= 1 ? 'rgba(255,210,122,0.85)' : 'rgba(255,164,27,1)'; c.fillText(w.w, xx, 560); c.restore();
      }
      xx += tw + c.measureText(' ').width;
    }
    c.restore();
    void hit;
    this.ground.upload();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const r = f.t - this.T0;
    const cam = this.camAt(r);
    this.cam.position.set(...cam.pos);
    this.cam.up.set(...cam.up).normalize();
    this.cam.lookAt(...cam.tgt);
    this.cam.updateMatrixWorld(true);
    clearRT(renderer, out, [LIN.ink[0], LIN.ink[1], LIN.ink[2]]);
    this.base.clear(); this.glow.clear();
    const B = this.base, G = this.glow;
    const beatK = r / BEAT, beatPh = beatK - Math.floor(beatK);
    const kick = Math.pow(1 - beatPh, 3);
    const endK = smoothstep(3.28, 3.62, r); // the world falls away

    // ---- the first 0.3 s: node1's lit cells (same world), shrinking to town lights
    const shrink = smoothstep(0.0, 0.32, r);
    const latticeFade = 1 - smoothstep(0.0, 0.18, r);
    const dot = (x: number, y: number, k: number, hl: number, size: number) => {
      const a = lin(LIN.signal, k), e = lin(LIN.ember, k * 1.4);
      const pp = this.ppu(x, y, 0);
      G.seg(x - hl, y, 0, x + hl, y, 0, Math.max(1.6, size * pp), a[0], a[1], a[2], Math.min(1, k));
      G.seg(x - hl * 0.7, y, 0, x + hl * 0.7, y, 0, Math.max(1.0, size * pp * 0.45), e[0], e[1], e[2], Math.min(1, k));
    };
    const hitK = r < 0.5 ? Math.pow(1 - r / 0.5, 3) : 0;
    for (const cell of this.crown) {
      const base = (cell.band ? 1.15 : 1.0) * (1 + (cell.peak ? 0.25 : 0.1) * hitK);
      const x = cell.i * 3, y = cell.j * 3;
      const k = lerp(base, 0.9 + 0.5 * hash(cell.i, cell.j), shrink);
      dot(x, y, k * (1 - endK), lerp(0.6, 0.05, shrink), lerp(1.8, 0.7 + 0.25 * hash(cell.i, cell.j, 3), shrink));
    }
    // a few stragglers round the crown: the rest of the town
    const rnd = mulberry32(5);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU, d = 50 + rnd() * rnd() * 150;
      const x = Math.cos(a) * d * 1.4, y = Math.sin(a) * d * 0.8;
      const lit = smoothstep(0.1 + rnd() * 0.5, 0.5 + rnd() * 0.5, r) * (0.5 + 0.5 * rnd());
      dot(x, y, lit * 0.8 * (1 - endK), 0.05, 0.6);
    }
    // faint lattice from node1 (a trace of the die) before the ground comes up
    if (latticeFade > 0.01) {
      const fin = lin(LIN.signal, 0.055 * latticeFade * 10);
      const pp = this.ppu(0, 0, 0);
      for (let x = -70; x <= 70; x++) this.S(B, x, -40, 0, x, 40, 0, Math.max(1, 0.4 * pp), fin, 0.7 * latticeFade);
    }

    // ---- the landscape: patchwork of fields, rows converge in perspective
    const ground = smoothstep(0.08, 0.5, r) * (1 - endK);
    if (ground > 0.01) {
      const P = 60;
      for (let gx = -8; gx <= 8; gx++) for (let gy = -4; gy <= 11; gy++) {
        const x0 = gx * P, y0 = gy * P;
        const h = hash(gx, gy, 9);
        const alongY = h < 0.55;
        const dim = (0.05 + 0.12 * hash(gx, gy, 2)) * ground;
        const sp = 1.7 + 0.5 * hash(gx, gy, 4);
        const cx = x0 + P / 2, cy = y0 + P / 2;
        const dd = Math.hypot(cx - cam.pos[0], cy - cam.pos[1]);
        const fall = clamp(1.25 - dd / 520, 0, 1);
        if (fall <= 0.02) continue;
        const col = lin(h > 0.8 ? LIN.ember : LIN.signal, dim * fall);
        const w = Math.max(0.8, 0.55 * this.ppu(cx, cy, 0) * 0.35);
        if (alongY) for (let x = x0; x <= x0 + P; x += sp) this.S(B, x, y0, 0, x, y0 + P, 0, w, col, 0.8);
        else for (let y = y0; y <= y0 + P; y += sp) this.S(B, x0, y, 0, x0 + P, y, 0, w, col, 0.8);
        // plot border (a road or hedge)
        const rc = lin(LIN.signal, 0.2 * ground * fall);
        this.S(B, x0, y0, 0, x0 + P, y0, 0, 1.2, rc, 1); this.S(B, x0, y0, 0, x0, y0 + P, 0, 1.2, rc, 1);
      }
      // the road to town
      const rc2 = lin(LIN.ember, 0.35 * ground);
      this.S(B, 0, -240, 0, 0, 262, 0, 2.2, rc2, 1);
    }

    // ---- the campus: four halls, rooftop fans, a substation, glowing from within
    const campus = smoothstep(0.2, 0.9, r) * (1 - endK);
    if (campus > 0.01) {
      for (let hi = 0; hi < HALL_Y.length; hi++) {
        const y = HALL_Y[hi]!, x0 = -70, x1 = 70, d = 18, h = 12;
        const on = smoothstep(0.35 + hi * 0.12, 0.6 + hi * 0.12, r) * campus;
        const amb = lin(LIN.signal, 0.75 * on), emb = lin(LIN.ember, 1.5 * on);
        // roof outline + hatch along the hall
        for (const [ax, ay, bx, by] of [[x0, y - d, x1, y - d], [x1, y - d, x1, y + d], [x1, y + d, x0, y + d], [x0, y + d, x0, y - d]] as const)
          this.S(B, ax, ay, h, bx, by, h, 1.6, amb, 1);
        for (let yy = y - d + 1.6; yy < y + d; yy += 1.6) this.S(B, x0, yy, h, x1, yy, h, 0.9, lin(LIN.signal, 0.28 * on), 1);
        // the south face glows: windows
        this.S(B, x0, y - d, 0, x0, y - d, h, 1.2, amb, 1);
        this.S(B, x1, y - d, 0, x1, y - d, h, 1.2, amb, 1);
        this.S(B, x0, y - d, 0, x1, y - d, 0, 1.2, amb, 1);
        const pp = this.ppu(0, y - d, 5);
        this.S(G, x0 + 4, y - d - 0.2, 5, x1 - 4, y - d - 0.2, 5, Math.max(1.5, 3 * pp), lin(LIN.signal, 0.55 * on * (0.85 + 0.15 * kick)), 0.9);
        this.S(G, x0 + 4, y - d - 0.2, 5, x1 - 4, y - d - 0.2, 5, Math.max(1, 0.9 * pp), emb, 0.9);
        // rooftop fans
        for (let fx = x0 + 8; fx < x1; fx += 14) for (const fy of [y - 7, y + 7]) {
          const pts: { x: number; y: number }[] = [];
          for (let k = 0; k <= 10; k++) pts.push({ x: fx + Math.cos((k / 10) * TAU) * 4.2, y: fy + Math.sin((k / 10) * TAU) * 4.2 });
          for (let k = 1; k < pts.length; k++) this.S(B, pts[k - 1]!.x, pts[k - 1]!.y, h, pts[k]!.x, pts[k]!.y, h, 1.0, lin(LIN.ember, 0.55 * on), 1);
        }
      }
      // substation: three transformers and the bus
      const sc = lin(LIN.ember, 0.9 * campus);
      for (const tx of [-24, 0, 24]) {
        for (const [ax, ay, bx, by] of [[-6, -6, 6, -6], [6, -6, 6, 6], [6, 6, -6, 6], [-6, 6, -6, -6]] as const)
          this.S(B, SUB[0] + tx + ax, SUB[1] + ay, 9, SUB[0] + tx + bx, SUB[1] + by, 9, 1.4, sc, 1);
        this.S(B, SUB[0] + tx, SUB[1], 0, SUB[0] + tx, SUB[1], 9, 5 * this.ppu(tx, SUB[1], 5), lin(LIN.signal, 0.3 * campus), 0.6);
      }
      this.S(B, -30, SUB[1] + 12, 9, 30, SUB[1] + 12, 9, 1.4, sc, 1);
      this.S(B, 0, SUB[1] + 12, 9, 0, HALL_Y[0]! - 18, 9, 1.4, sc, 1);
    }

    // ---- transmission lines: pylons, conductors, beam pulses inbound on the beat
    const lines = smoothstep(0.35, 0.8, r) * (1 - endK);
    if (lines > 0.01) {
      this.pylons.forEach((ps, ci) => {
        const toSub = [SUB[0] - ps[0]![0], SUB[1] - ps[0]![1]]; const tl = Math.hypot(toSub[0]!, toSub[1]!);
        const sx = -toSub[1]! / tl, sy2 = toSub[0]! / tl;
        const pc = lin(LIN.signal, 0.5 * lines);
        for (const p of ps) {
          const hh = 22;
          for (const s of [-3, 3]) { this.S(B, p[0] + sx * s, p[1] + sy2 * s, 0, p[0] + sx * s * 0.25, p[1] + sy2 * s * 0.25, hh, 1.1, pc, 1); }
          this.S(B, p[0] - sx * 8, p[1] - sy2 * 8, 19.5, p[0] + sx * 8, p[1] + sy2 * 8, 19.5, 1.1, pc, 1);
          // cross braces
          for (const zz of [6, 12]) { const k = 3 * (1 - zz / hh * 0.75); this.S(B, p[0] - sx * k, p[1] - sy2 * k, zz, p[0] + sx * k, p[1] + sy2 * k, zz, 0.8, lin(LIN.signal, 0.3 * lines), 1); }
        }
        this.wires[ci]!.forEach((w, wi) => {
          const wc = lin(LIN.signal, 0.55 * lines);
          for (let i = 1; i < w.length; i++) this.S(B, w[i - 1]![0], w[i - 1]![1], w[i - 1]![2], w[i]![0], w[i]![1], w[i]![2], 0.9, wc, 1);
          // a pulse leaves the far end on every beat and arrives a bar-fraction later
          if (wi !== 1) return;
          const dur = 0.62;
          for (let k = Math.floor((r - dur) / BEAT); k <= Math.floor(r / BEAT); k++) {
            const tb = k * BEAT + ci * 0.11, a = (r - tb) / dur;
            if (a < 0 || a > 1) continue;
            const ea = ease.inQuad(a) * 0.6 + a * 0.4;
            const idx = Math.min(w.length - 1, Math.floor(ea * (w.length - 1)));
            const p0 = w[Math.max(0, idx - 4)]!, p1 = w[idx]!;
            const hp = this.ppu(p1[0], p1[1], p1[2]);
            const tail = lin(LIN.signal, 2.0 * lines);
            this.S(G, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], Math.max(2, 0.9 * hp), tail, 0.9);
            this.S(G, p1[0], p1[1], p1[2], p1[0], p1[1], p1[2], Math.max(7, 4.5 * hp), [LIN.signal[0] * 0.7, LIN.signal[1] * 0.7, LIN.signal[2] * 0.7], 0.4 * lines);
            this.S(G, p1[0], p1[1], p1[2], p1[0], p1[1], p1[2], Math.max(4, 1.8 * hp), [5 * lines, 4.2 * lines, 3.4 * lines], 1);
          }
        });
      });
    }

    // ---- render 3D
    clearRT(renderer, this.rt, [0, 0, 0], 0);
    renderer.setRenderTarget(this.rt);
    // the painted ground text: floodlight surges on the syllables
    this.drawGround(r, kick);
    const gk = (1.0 + 0.0 * kick) * (1 - endK) * smoothstep(0.1, 0.4, r);
    this.gMat.color.setRGB(1.2 * gk, 1.2 * gk, 1.2 * gk);
    renderer.render(this.gScene, this.cam);
    B.render(renderer, this.rt, this.cam);
    G.render(renderer, this.rt, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'add', premult: false });

    // ---- 2D: karaoke, the site-load gauge, the handoff line
    const lay = this.layer, c = lay.ctx;
    lay.clear();
    this.hud(c, r, 1 - endK);
    this.handoff(c, r);
    comp.draw(renderer, lay.upload(), out);

    const fi = frameIdx(f.t);
    const sh = 7 * pulse(r, 0, 0.06) + 4 * kick * smoothstep(0.5, 1, r);
    return {
      shake: [(hash(fi, 1) - 0.5) * 2 * sh, (hash(fi, 2) - 0.5) * 2 * sh],
      flash: 0.0, ca: 1.0 + 1.5 * pulse(r, 0, 0.08), bloom: 0.6, bloomThreshold: 0.95, bloomKnee: 0.4, halation: 0.3, vignette: 0.4, hud: 0,
      zoom: 1 + 0.012 * kick * smoothstep(0.4, 1, r),
    };
  }

  private hud(c: CanvasRenderingContext2D, r: number, al: number) {
    const t = r + this.T0;
    const fam = F.archivo(100, 700);
    c.save();
    c.globalAlpha = al;
    // karaoke caption, bottom left
    c.font = font(fam, 56); c.textBaseline = 'alphabetic';
    let x = 96; const y = H - 96;
    for (const w of this.words) {
      const p = Lyrics.wordProgress(w, t);
      const wd = c.measureText(w.w).width;
      c.fillStyle = 'rgba(238,233,223,0.28)'; c.fillText(w.w, x, y);
      if (p > 0) { c.save(); c.beginPath(); c.rect(x - 2, y - 56, wd * p + 4, 80); c.clip(); c.fillStyle = p >= 1 ? HEX.bone : HEX.signal; c.fillText(w.w, x, y); c.restore(); }
      x += wd + c.measureText(' ').width;
    }
    // site-load gauge, bottom right
    const v = 1.2 * ease.outCubic(clamp((r - 0.7) / 2.5));
    const gx = W - 96, gy = H - 150;
    c.textAlign = 'right';
    c.font = font(F.mono(500), 15); c.fillStyle = 'rgba(238,233,223,0.55)';
    (c as any).letterSpacing = '2px';
    c.fillText('CAMPUS SITE LOAD', gx, gy - 118);
    c.font = font(F.mono(600), 112); c.fillStyle = v >= 1.19 ? HEX.signal : HEX.bone; (c as any).letterSpacing = '0px';
    c.fillText(v.toFixed(2), gx - 96, gy);
    c.font = font(F.mono(600), 44); c.fillStyle = HEX.signal;
    c.fillText('GW', gx, gy);
    // bar with 0.2 GW ticks
    const bw = 460, bx = gx - bw;
    c.fillStyle = 'rgba(238,233,223,0.25)'; c.fillRect(bx, gy + 26, bw, 2);
    for (let i = 0; i <= 6; i++) c.fillRect(bx + (bw * i) / 6 - 1, gy + 20, 2, 14);
    c.fillStyle = HEX.signal; c.fillRect(bx, gy + 22, (bw * v) / 1.2, 10);
    c.textAlign = 'left';
    c.font = font(F.mono(500), 15); c.fillStyle = 'rgba(238,233,223,0.55)';
    c.fillText('LOT 7A-0042 · STEP 09/31', 96, 110);
    c.textAlign = 'right';
    c.fillText('NIGHT · LONG EXPOSURE · 32 s', W - 96, 110);
    c.restore();
  }

  /** the last 0.47 s: one beam line is left, running from the lower left to the upper right: down1's racing line */
  private handoff(c: CanvasRenderingContext2D, r: number) {
    const k = smoothstep(3.28, 3.45, r);
    if (k <= 0) return;
    const draw = ease.outExpo(clamp((r - 3.28) / 0.3));
    c.save();
    c.fillStyle = `rgba(10,10,11,${k * 0.0})`;
    c.restore();
    this.handoffPts = this.handoffPts ?? [];
    void draw;
  }
  handoffPts: { x: number; y: number }[] | null = null;
  keysRef = keys;
}
