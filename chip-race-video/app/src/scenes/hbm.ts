// hbm (bars 26-28): "Twelve-high memory stacked like a tower".
// Idiom: PHYSICAL STACKING. Twelve PBR dies (polished silicon, copper microbumps between) slam down onto
// an interposer, one per sung syllable (nine syllables plus three dies on the longest gaps), while a
// low-angle camera climbs with the tower. TSVs light up through the finished stack; the camera then
// rises over the top face and hands off to the x-ray (smuggle).
//  in : post1's CRT collapses to one horizontal line at y = H/2; here it is the interposer seen edge-on.
//  out: the camera ends looking down on the top die, whose near edge sits at EDGE_Y (a bright hairline across
//       the frame) = the first frame of smuggle's x-ray portal edge.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, pulse, smoothstep, TAU, springStep } from '../engine/util';
import { lineByScene, sparkHead as beamHead } from './_motifs';
import { makeStudioEnv, lin } from './hbm-studio';

/** Handoff constants shared with smuggle (smuggle re-declares them: keep in sync). */
export const HBM_EDGE_Y = 0.64 * H;

// ---- tower geometry (world units)
const DIE_W = 2.0, DIE_D = 1.5, DIE_T = 0.22, BASE_W = 2.35, BASE_D = 1.8, BASE_T = 0.34, BUMP = 0.07;
const SLAB_W = 2.8, SLAB_D = 2.2, SLAB_T = 0.16;
const dieBottom = (k: number) => (k === 0 ? 0 : BASE_T + BUMP + (k - 1) * (DIE_T + BUMP));
const dieThick = (k: number) => (k === 0 ? BASE_T : DIE_T);
const dieTop = (k: number) => dieBottom(k) + dieThick(k);
const FALL = 0.12;
const CX = 1370; // screen x of the tower axis

function topTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 768; cv.height = 576;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1b1b1d'; c.fillRect(0, 0, 768, 576);
  c.strokeStyle = '#4a4843'; c.lineWidth = 3; c.strokeRect(14, 14, 740, 548);
  c.lineWidth = 1; c.strokeRect(24, 24, 720, 528);
  // eight macro banks of fine array lines either side of a pad spine
  for (let bx = 0; bx < 2; bx++) for (let by = 0; by < 4; by++) {
    const x0 = 40 + bx * 360, y0 = 40 + by * 130, w = 328, h = 118;
    c.fillStyle = '#222224'; c.fillRect(x0, y0, w, h);
    c.strokeStyle = '#3a3935'; c.lineWidth = 1;
    for (let i = 0; i < 24; i++) { c.beginPath(); c.moveTo(x0, y0 + 3 + i * 4.8); c.lineTo(x0 + w, y0 + 3 + i * 4.8); c.stroke(); }
    c.strokeStyle = '#2c2b29';
    for (let i = 0; i < 40; i++) { c.beginPath(); c.moveTo(x0 + 4 + i * 8, y0); c.lineTo(x0 + 4 + i * 8, y0 + h); c.stroke(); }
  }
  c.fillStyle = '#b6761a';
  for (let i = 0; i < 36; i++) for (const yy of [276, 292]) c.fillRect(48 + i * 19.6, yy, 9, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export default class Hbm extends Scene {
  bg = new FSPass(/* glsl */ `
    uniform float t; uniform vec2 cx; uniform float glow;
    void main(){
      vec2 p = (vUv - vec2(cx.x, cx.y)) * vec2(1920.0, 1080.0);
      float r = length(p * vec2(0.8, 0.55));
      vec3 col = C_INK * (1.0 + 0.5 * (1.0 - vUv.y));
      col += C_SIGNAL * 0.05 * glow * exp(-r * r / (2.0 * 520.0 * 520.0));
      col += C_BONE * 0.012 * exp(-r * r / (2.0 * 900.0 * 900.0));
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 }, cx: { value: { x: 0.69, y: 0.5 } as any }, glow: { value: 0 } });
  lines = new LineBatch(40000, { blend: 'add' });
  text = new Layer2D();
  three = new THREE.Scene();
  reflScene = new THREE.Scene();
  floorScene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  tower = new THREE.Group();
  dies: THREE.Group[] = [];
  dieMesh: THREE.Mesh[] = [];
  slab!: THREE.Mesh;
  land: number[] = [];
  rows: { words: number[]; size: number; weight: number; width: number; base: number }[] = [];
  lineRef: any;
  T0 = 0;

  override async init() {
    const { renderer, lyrics } = this.ctx;
    this.T0 = this.ctx.start;
    this.lineRef = lineByScene(lyrics, 'hbm');
    // ---- landing schedule: every sung syllable, then split the longest gaps until twelve
    const L: number[] = [];
    for (const w of this.lineRef.words) for (const s of (w.syl ?? [[w.start, w.end]])) L.push(s[0]);
    const end = this.lineRef.end;
    while (L.length < 12) {
      let bi = 0, bg = -1;
      for (let i = 0; i < L.length; i++) { const g = (i + 1 < L.length ? L[i + 1]! : end) - L[i]!; if (g > bg + 1e-6) { bg = g; bi = i; } }
      L.splice(bi + 1, 0, L[bi]! + bg / 2);
    }
    this.land = L.slice(0, 12);
    this.land[0] = this.T0; // die 0 is the line itself
    // ---- scene
    const env = makeStudioEnv(renderer);
    this.three.environment = env; this.reflScene.environment = env;
    const top = topTexture();
    const mkMat = (rough: number, map?: THREE.Texture) => new THREE.MeshPhysicalMaterial({ color: lin([0.55, 0.54, 0.52]), metalness: 1, roughness: rough, map: map ?? null, envMapIntensity: 1.25, clearcoat: 0.3, clearcoatRoughness: 0.25 });
    const side = mkMat(0.2), topM = mkMat(0.32, top), bot = mkMat(0.5);
    const bumpMat = new THREE.MeshStandardMaterial({ color: lin(LIN.signal, 0.9), metalness: 1, roughness: 0.28, envMapIntensity: 1.1, emissive: lin(LIN.signal, 0.0) });
    const bumpGeo = new THREE.CylinderGeometry(0.036, 0.036, BUMP * 0.96, 10);
    const mkDie = (k: number) => {
      const g = new THREE.Group();
      const w = k === 0 ? BASE_W : DIE_W, d = k === 0 ? BASE_D : DIE_D, t = dieThick(k);
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, t, d, 3, 0.028), [side, side, topM, bot, side, side]);
      g.add(m); this.dieMesh.push(m);
      if (k > 0) {
        const nx = 14, nz = 10, im = new THREE.InstancedMesh(bumpGeo, bumpMat, nx * nz);
        const mat4 = new THREE.Matrix4();
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          mat4.setPosition((i / (nx - 1) - 0.5) * (w - 0.34), -t / 2 - BUMP / 2, (j / (nz - 1) - 0.5) * (d - 0.3));
          im.setMatrixAt(i * nz + j, mat4);
        }
        g.add(im);
      }
      g.visible = false;
      this.tower.add(g); this.dies.push(g);
    };
    for (let k = 0; k < 12; k++) mkDie(k);
    this.slab = new THREE.Mesh(new RoundedBoxGeometry(SLAB_W, SLAB_T, SLAB_D, 3, 0.03), [side, side, topM, bot, side, side]);
    this.slab.position.y = -SLAB_T / 2;
    this.tower.add(this.slab);
    this.three.add(this.tower);
    // lights: bone key front-left, amber rim back-right
    const key = new THREE.DirectionalLight(lin(LIN.bone, 1.0), 2.4); key.position.set(-5, 6, 7); this.three.add(key);
    const rim = new THREE.DirectionalLight(lin(LIN.signal, 1.0), 5.0); rim.position.set(6, 3, -5); this.three.add(rim);
    // floor veil (hides most of the mirrored copy, strongest near the base)
    const seg = 40, size = 30;
    const fg = new THREE.PlaneGeometry(size, size, seg, seg); fg.rotateX(-Math.PI / 2);
    const pos = fg.attributes.position!, col = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      col.set([0.0013, 0.0013, 0.0015, 0.5 + 0.5 * smoothstep(0.5, 6.0, r)], i * 4);
    }
    fg.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.floorScene.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false })));
  }

  /** The stack's state: height of the top after n dies landed. */
  topAfter(k: number) { return k < 0 ? 0 : dieTop(k); }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, T0 = this.T0, lt = t - T0;
    const L = this.land;
    // ---- die states
    let nLanded = 0;
    for (let k = 0; k < 12; k++) if (t >= L[k]!) nLanded = k + 1;
    const lastLand = nLanded > 0 ? L[nLanded - 1]! : T0;
    const impact = pulse(t, lastLand, 0.09) * (nLanded > 1 ? 1 : 0.6);
    for (let k = 0; k < 12; k++) {
      const g = this.dies[k]!, tl = L[k]!;
      const bot = dieBottom(k), th = dieThick(k);
      let y = bot + th / 2, sy = 1, vis = true;
      if (k === 0) {
        sy = 0.05 + 0.95 * ease.outExpo(clamp((t - T0) / 0.16));
        y = bot + (th * sy) / 2;
        vis = t >= T0;
      } else if (t < tl - FALL) vis = false;
      else if (t < tl) {
        const u = (t - (tl - FALL)) / FALL;
        y = lerp(bot + th / 2 + 5.5, bot + th / 2, u * u);
      } else {
        const a = t - tl;
        sy = 1 - 0.2 * Math.exp(-a / 0.05) * Math.cos(a * 70);
        y = bot + (th * sy) / 2 - 0.03 * Math.exp(-a / 0.06) * (1 - k / 12);
      }
      g.visible = vis;
      g.scale.set(1 + (1 - sy) * 0.18, sy, 1 + (1 - sy) * 0.18);
      g.position.y = y;
    }
    this.slab.visible = t >= T0 + 0.02;
    // ---- camera director: poses snap on each landing (outExpo over 0.13 s)
    const poseOf = (n: number) => { const tp = this.topAfter(n - 1); return { cy: 0.0 + 0.30 * tp, ty: 0.02 + 0.52 * tp, az: lerp(28, 10, n / 12) }; };
    let cyA = 0, tyA = 0, azA = 28;
    {
      const nn = Math.max(1, nLanded);
      const pa = poseOf(nn - 1), pb = poseOf(nn);
      const k = nLanded === 0 ? 0 : ease.outExpo(clamp((t - L[nn - 1]!) / 0.13));
      cyA = lerp(pa.cy, pb.cy, k); tyA = lerp(pa.ty, pb.ty, k); azA = lerp(pa.az, pb.az, k);
    }
    // final rise over the top (52.03 -> end): camera climbs, pitches down onto the top face
    const tEnd = this.ctx.end, tTsv = L[11]! + 0.1;
    const rise = ease.inOutCubic(clamp((t - (this.lineRef.end - 0.02)) / (tEnd - this.lineRef.end + 0.02)));
    const topY = dieTop(11);
    const dist = 9 - 1.0 * rise;
    cyA = lerp(cyA, topY + 3.6, rise);
    tyA = lerp(tyA, topY + 0.1, rise);
    azA = lerp(azA, 0, rise);
    const az = (azA * Math.PI) / 180;
    this.cam.position.set(Math.sin(az) * dist, cyA, Math.cos(az) * dist);
    this.cam.up.set(0, 1, 0);
    // roll spring per landing (alternating)
    const roll = nLanded > 0 ? ((nLanded % 2) * 2 - 1) * 0.012 * Math.exp(-(t - lastLand) / 0.12) * Math.cos((t - lastLand) * 30) : 0;
    this.cam.lookAt(0, tyA, 0);
    this.cam.rotateZ(roll * (1 - rise));
    this.cam.setViewOffset(W, H, -(CX - W / 2), 0, W, H);
    this.cam.updateMatrixWorld(true);
    this.cam.updateProjectionMatrix();

    // ---- draw
    this.bg.u.glow!.value = smoothstep(L[11]! - 0.1, L[11]! + 0.4, t) * 0.8 + 0.3;
    (this.bg.u.cx!.value as any) = { x: CX / W, y: 0.5 };
    this.bg.render(renderer, out);
    const mainVis = lt > 0.01;
    if (mainVis) {
      renderer.setRenderTarget(out);
      // reflection pass
      this.tower.scale.y = -1;
      renderer.clearDepth();
      renderer.render(this.three, this.cam);
      renderer.clearDepth();
      renderer.render(this.floorScene, this.cam);
      this.tower.scale.y = 1;
      renderer.clearDepth();
      renderer.render(this.three, this.cam);
    }

    // ---- 2D overlay: lines (sparks, streaks, TSV, rulers, the CRT line) and text
    const lb = this.lines; lb.clear();
    const v = new THREE.Vector3();
    const proj = (x: number, y: number, z: number) => { v.set(x, y, z).project(this.cam); return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H }; };
    // world rulers behind the tower: horizontal graduations climb past as the camera rises
    for (let i = -6; i <= 14; i++) {
      const y = i * 0.5, major = i % 4 === 0;
      const a = proj(-7, y, -2.5), b = proj(7, y, -2.5);
      const al = (major ? 0.16 : 0.06) * (1 - rise * 0.6);
      lb.seg2(a.x, a.y, b.x, b.y, major ? 1.2 : 0.8, [LIN.bone[0], LIN.bone[1], LIN.bone[2]], al);
    }
    // CRT line (handoff in): full width at y = H/2, shrinking to the die as die 0 grows
    {
      const u = clamp(lt / 0.2);
      const half = lerp(W / 2 + 10, 300, ease.outExpo(u));
      const a = 1 - smoothstep(0.1, 0.3, lt);
      if (a > 0) lb.seg2(CX - half, H / 2, CX + half, H / 2, lerp(4, 2, u), [3.2, 2.6, 1.6], a);
    }
    // streaks above falling dies + contact sparks
    for (let k = 1; k < 12; k++) {
      const tl = L[k]!;
      if (t > tl - FALL && t < tl) {
        const u = (t - (tl - FALL)) / FALL, rest = dieBottom(k) + dieThick(k) / 2;
        const y = lerp(rest + 5.5, rest, u * u);
        for (let s = 0; s < 7; s++) {
          const xx = (hash(k, s) - 0.5) * DIE_W * 0.9, zz = (hash(k, s + 9) - 0.5) * DIE_D * 0.8;
          const a = proj(xx, y + dieThick(k) / 2 + 0.05, zz), b = proj(xx, y + 0.8 + 1.4 * u * hash(k, s + 3), zz);
          lb.seg2(a.x, a.y, b.x, b.y, 1.4, [LIN.signal[0] * 1.4, LIN.signal[1] * 1.4, LIN.signal[2] * 1.4], 0.55);
        }
      }
      const age = t - tl;
      if (age >= 0 && age < 0.45) {
        const yb = dieBottom(k);
        const cl = pulse(t, tl, 0.07);
        for (let s = 0; s < 22; s++) {
          const side = hash(k, s + 40) < 0.5 ? -1 : 1;
          const p0 = proj(side * (DIE_W / 2 + 0.02), yb, (hash(k, s + 50) - 0.5) * DIE_D);
          const ang = (side < 0 ? Math.PI : 0) + (hash(k, s + 60) - 0.5) * 1.4 - 0.25;
          const sp = 380 * (0.3 + hash(k, s + 70));
          const x1 = p0.x + Math.cos(ang) * sp * age, y1 = p0.y + Math.sin(ang) * sp * age + 700 * age * age;
          const x0 = p0.x + Math.cos(ang) * sp * Math.max(0, age - 0.02), y0 = p0.y + Math.sin(ang) * sp * Math.max(0, age - 0.02) + 700 * Math.max(0, age - 0.02) ** 2;
          const kk = 1 - age / 0.45;
          lb.seg2(x0, y0, x1, y1, 1.6, [2.2 * kk, 1.1 * kk, 0.3 * kk], kk);
        }
        // contact flash across the seam
        const a = proj(-DIE_W / 2 - 0.1, yb, DIE_D / 2), b = proj(DIE_W / 2 + 0.1, yb, DIE_D / 2);
        lb.seg2(a.x, a.y, b.x, b.y, 2 + 5 * cl, [5 * cl, 3.5 * cl, 1.5 * cl], clamp(cl * 1.2));
      }
    }
    // TSVs: a light runs up the front face once the stack is complete, and stays lit
    {
      const tc = L[11]!, run = clamp((t - tc) / 0.38);
      if (t >= tc) {
        const yb = dieBottom(1) - BUMP, yt = dieTop(11);
        const cols = 7;
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * (DIE_W - 0.5);
          const hh = lerp(yb, yt, ease.outCubic(run));
          const a = proj(x, yb, DIE_D / 2 + 0.004), b = proj(x, hh, DIE_D / 2 + 0.004);
          const settle = 0.55 + 0.45 * pulse(t, tc, 0.5) + 0.25 * f.a.kick;
          lb.seg2(a.x, a.y, b.x, b.y, 2.2, [LIN.signal[0] * 1.6 * settle, LIN.signal[1] * 1.6 * settle, LIN.signal[2] * 1.6 * settle], 0.8);
          for (let k = 1; k < 12; k++) {
            const yy = dieBottom(k) - BUMP / 2;
            if (yy > hh) break;
            const p = proj(x, yy, DIE_D / 2 + 0.005);
            lb.seg2(p.x - 0.1, p.y, p.x + 0.1, p.y, 7, [5, 3.4, 1.5], 0.9);
          }
          if (run < 1) { const hp = proj(x, hh, DIE_D / 2 + 0.006); lb.seg2(hp.x, hp.y, hp.x + 0.1, hp.y, 14, [6, 5, 4], 1); }
        }
      }
    }
    // die ruler (D01..D12 on the right, world-anchored)
    const tx = this.text; tx.clear();
    const c = tx.ctx;
    for (let k = 0; k < 12; k++) {
      if (!this.dies[k]!.visible || (t < L[k]!)) continue;
      const p = proj(SLAB_W / 2 + 0.12, this.dies[k]!.position.y, 0.3);
      const age = t - L[k]!;
      const a = clamp(age / 0.1);
      c.font = font(F.mono(500), 13); c.fillStyle = rgba('bone', 0.55 * a); c.textBaseline = 'middle';
      c.fillText(`D${String(k + 1).padStart(2, '0')}`, p.x + 22, p.y);
      c.fillStyle = rgba('bone', 0.35 * a); c.fillRect(p.x, p.y, 16, 1);
    }
    if (nLanded >= 12) {
      const a = smoothstep(L[11]! + 0.1, L[11]! + 0.3, t) * (1 - rise);
      c.font = font(F.mono(500), 13); c.fillStyle = rgba('signal', 0.9 * a); c.textBaseline = 'alphabetic';
      c.fillText('12-HI · TSV 1024 I/O · 9.8 Gb/s/pin', CX - 250, 1000);
    }
    // ---- karaoke rows (left column, stacked bottom-up)
    this.drawRows(c, lyrics, t, rise);
    // beam head riding the TSV run
    if (t >= L[11]! && t < L[11]! + 0.4) {
      const run = clamp((t - L[11]!) / 0.38), hp = proj(0, lerp(dieBottom(1), dieTop(11), ease.outCubic(run)), DIE_D / 2 + 0.02);
      beamHead(lb, hp.x, hp.y, t, 0.8, 1.2 * (1 - run * 0.5));
    }
    // handoff out: the top die's near edge as a hairline across the frame at HBM_EDGE_Y
    if (rise > 0) {
      const u = smoothstep(0.55, 1.0, rise);
      lb.seg2(0, HBM_EDGE_Y, W, HBM_EDGE_Y, lerp(1, 3, u), [LIN.signal[0] * 2.4, LIN.signal[1] * 2.4, LIN.signal[2] * 2.4], u);
    }

    lb.render(renderer, out);
    comp.draw(renderer, tx.upload(), out);

    const kick = Math.max(impact, f.a.kick * 0.6);
    return { bloom: 0.55 + 0.25 * kick, bloomThreshold: 1.05, zoom: 1 + 0.035 * impact, shake: [Math.sin(t * 190) * 5 * impact, Math.cos(t * 170) * 7 * impact] as [number, number], ca: 1.2 + 4 * impact, flash: 0 };
  }

  drawRows(c: CanvasRenderingContext2D, lyrics: Lyrics, t: number, rise: number) {
    const words = this.lineRef.words as any[];
    const rowsDef = [[0, 1], [2], [3], [4, 5], [6]];
    const sizes = [128, 190, 190, 110, 280];
    const widths = [75, 100, 100, 87.5, 100];
    const weights = [900, 900, 900, 500, 900];
    const maxW = 800;
    let base = 960;
    const out = 1 - smoothstep(0, 1, rise) * 0.0;
    rowsDef.forEach((ids, ri) => {
      const fam = F.archivo(widths[ri]!, weights[ri]!);
      let size = sizes[ri]!;
      const txt = ids.map((i) => words[i].w).join(' ');
      c.font = font(fam, size);
      let mw = c.measureText(txt).width;
      if (mw > maxW) { size *= maxW / mw; c.font = font(fam, size); mw = c.measureText(txt).width; }
      const capH = size * 0.72;
      const yB = base;
      base -= capH + 34;
      if (t < words[ids[0]!].start - 0.01) return;
      let xx = 96;
      c.textBaseline = 'alphabetic';
      ids.forEach((wi, n) => {
        const w = words[wi];
        const ww = c.measureText(w.w + (n < ids.length - 1 ? ' ' : '')).width;
        if (t >= w.start) {
          const a = t - w.start;
          const sl = 1 + 0.32 * Math.exp(-a / 0.07);
          const dx = -50 * Math.exp(-a / 0.09);
          const p = Lyrics.wordProgress(w, t);
          c.save();
          c.translate(xx + dx, yB); c.scale(sl, sl);
          c.globalAlpha = clamp(a / 0.03) * out;
          const sungDone = t > w.end;
          c.fillStyle = sungDone ? rgba('bone', 0.9) : rgba('bone', 0.36);
          c.fillText(w.w, 0, 0);
          if (!sungDone) {
            c.save(); c.beginPath(); c.rect(-4, -size, c.measureText(w.w).width * p + 4, size * 1.3); c.clip();
            c.fillStyle = rgba('signal', 1); c.fillText(w.w, 0, 0); c.restore();
          } else {
            const fa = clamp(1 - (t - w.end) / 0.5);
            if (fa > 0) { c.globalAlpha *= fa; c.fillStyle = rgba('signal', 1); c.fillText(w.w, 0, 0); }
          }
          c.restore();
        }
        xx += ww;
      });
      // row index rule
      const rr = clamp((t - words[ids[0]!].start) / 0.2);
      c.fillStyle = rgba('bone', 0.3 * rr * out); c.fillRect(96, yB + 12, 52 * rr, 1.5);
    });
  }
}
