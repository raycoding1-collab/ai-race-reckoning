// ATOM (bars 50-52, 93.75-97.5): "Every atom counted, every border drawn."
// A scanning-tunnelling micrograph, engraved: the height field of a copper surface is drawn as scan
// lines (width follows the height, the lines bend over every atom). The probe scans one lattice row
// per 8th note (the whole field in exactly one bar), a tally mark is cut for every atom it passes,
// and on the bar-51 downbeat the tip starts moving atoms one by one, on the 16ths, into a fence of
// atoms in the hollows: a border. Half-time, quiet; Cormorant italic lyric. The last 0.3 s defocus the
// lattice into the heightmap that `dream` opens on.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, mulberry32, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene, sparkHead2D as beamHead2D } from './_motifs';
import { fenceMoves, type Move } from './atom-fence';
import { LAT, buildLattice, makeHeightTexture, splat, siteX, siteY, drawBridgeLine, GLSL_HEIGHT } from './atom-kit';

const DT_ROW = 0.125;        // one lattice row per 0.125 s: 15 rows = 1.875 s = exactly one bar
const T_FENCE = 1.875;       // the border starts one bar in
const DT_MOVE = 0.1171875;   // a 16th

export default class AtomScene extends Scene {
  layer = new Layer2D();
  base!: Float32Array;
  work!: Float32Array;
  tex!: THREE.DataTexture;
  amps!: Float32Array;
  moves: Move[] = [];
  sparse: { x: number; y: number }[] = [];
  pass!: FSPass;

  override init() {
    const lat = buildLattice(7);
    this.base = lat.data; this.amps = lat.amp;
    this.work = new Float32Array(lat.data.length);
    this.tex = makeHeightTexture(this.work);
    this.moves = fenceMoves(this.amps);
    // the LED dots that survive from the board before: sparse lattice sites already lit at frame 0
    const sr = mulberry32(5);
    for (let k = 0; k < 14; k++) this.sparse.push({ x: siteX(2 + Math.floor(sr() * 28)), y: siteY(Math.floor(sr() * 15)) });
    this.pass = new FSPass(/* glsl */ `
      precision highp sampler2D;
      ${GLSL_HEIGHT}
      uniform float uScan, uT, uBlur, uSpA, uFade;
      uniform vec2 uSp[14];
      float hB(vec2 p) {
        if (uBlur < 0.5) return hTex(p);
        float s = 0.0;
        for (int i = 0; i < 9; i++) s += hTex(p + vec2(float(i % 3 - 1), float(i / 3 - 1)) * uBlur);
        return s / 9.0;
      }
      void main() {
        vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
        float rev = step(px.y, uScan);
        // scan-line jitter: the row being written wobbles sideways a little
        float jit = (hash12(vec2(floor(px.y / 3.0), floor(uT * 30.0))) - 0.5) * 2.0 * exp(-max(uScan - px.y, 0.0) / 14.0);
        float h = hB(px + vec2(jit, 0.0));
        float sp = 5.0;
        float u = (px.y + 12.0 * h) / sp;
        float dark = clamp(0.10 + 0.50 * clamp(h, 0.0, 1.5), 0.0, 0.92);
        float ln = hatch(u, dark);
        vec3 lc = heat(0.20 + 0.48 * clamp(h, 0.0, 1.4));
        float tipglow = smoothstep(0.7, 1.2, h);
        vec3 col = C_INK + ln * lc * rev * (1.0 + 0.5 * tipglow);
        // LED remnants
        float d = 0.0;
        for (int k = 0; k < 14; k++) d += exp(-dot(px - uSp[k], px - uSp[k]) / (2.0 * 7.0 * 7.0));
        col += C_SIGNAL * 1.2 * d * uSpA * (1.0 - rev);
        // the scan head: a hot hairline on the current row with a soft wake
        float dh = px.y - uScan;
        float head = exp(-abs(dh) / 1.6);
        float wake = exp(-max(-dh, 0.0) / 22.0) * step(dh, 0.0);
        col += (vec3(1.0, 0.82, 0.55) * 2.4 * head + C_SIGNAL * 0.35 * wake * ln) * step(0.5, uFade) * step(0.0, uScan);
        // fade the field into the panel band at the bottom, faint vignette at the sides
        col *= 1.0 - smoothstep(790.0, 900.0, px.y);
        fragColor = vec4(col, 1.0);
      }`, {
      uH: { value: this.tex }, uHsize: { value: new THREE.Vector2(LAT.tw, LAT.th) },
      uScan: { value: 0 }, uT: { value: 0 }, uBlur: { value: 0 }, uSpA: { value: 1 }, uFade: { value: 1 },
      uSp: { value: this.sparse.map((s) => new THREE.Vector2(s.x, s.y)) },
    });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, lt = f.lt;
    const line = lineByScene(lyrics, 'atom');

    // -------- the height field: base lattice plus the atoms the tip has moved
    this.work.set(this.base);
    type Carry = { x: number; y: number; k: number; u: number };
    let carrying = null as Carry | null;
    for (let k = 0; k < this.moves.length; k++) {
      const m = this.moves[k]!;
      const tk = T_FENCE + k * DT_MOVE;
      if (lt < tk) break;
      const u = (lt - tk) / DT_MOVE;
      splat(this.work, m.sx, m.sy, -m.src);
      if (u >= 1) { splat(this.work, m.dx, m.dy, 1.4); continue; }
      // phase 0-0.3 the tip arrives (atom still), 0.3-0.9 carry with a small lift, then set down
      if (u < 0.3) { splat(this.work, m.sx, m.sy, m.src); carrying = { x: m.sx, y: m.sy, k, u }; continue; }
      const q = ease.inOutCubic(prog(u, 0.3, 0.9));
      const x = lerp(m.sx, m.dx, q), y = lerp(m.sy, m.dy, q);
      splat(this.work, x, y, 1.4 + 0.35 * Math.sin(Math.PI * q));
      carrying = { x, y, k, u };
    }
    this.tex.needsUpdate = true;

    const scanY = LAT.y0 - 28 + (lt / DT_ROW) * LAT.pitch;
    const scanDone = lt > 15 * DT_ROW + 0.05;
    const blur = 18 * ease.inCubic(prog(lt, 3.45, 3.75));
    const u = this.pass.u;
    u.uScan!.value = scanDone ? 4000 : scanY;
    u.uT!.value = t; u.uBlur!.value = blur;
    u.uSpA!.value = 0.25 + 0.75 * pulse(lt, 0, 0.35);
    u.uFade!.value = scanDone ? 0 : 1;
    this.pass.render(renderer, out);

    // -------- overlay
    const L = this.layer; L.clear();
    const c = L.ctx;
    const ui = 1 - smoothstep(3.35, 3.65, lt); // the instruments leave as the image defocuses
    c.save();
    c.globalAlpha = ui;
    // header + scale bar
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('bone', 0.5);
    c.fillText('STM · Cu(100) · 4.2 K · Vbias 50 mV · It 1.0 nA', LAT.x0, 34);
    c.textAlign = 'right';
    c.fillText('LOT 7A-0042 · STEP 31/31', W - 96, 34);
    c.textAlign = 'left';
    c.letterSpacing = '0px';

    // tally marks: one stroke cut per atom as the head passes it
    let counted = 0;
    c.lineWidth = 1.3; c.strokeStyle = rgba('bone', 0.7); c.lineCap = 'butt';
    for (let j = 0; j < LAT.rows; j++) {
      const f0 = (lt / DT_ROW) - j; // row progress, <0 not yet
      if (f0 <= 0) break;
      const fr = clamp(f0);
      const dirR = j % 2 === 0;
      const n = LAT.cols;
      const passed = Math.min(n, Math.floor(fr * n + 0.5));
      counted += passed;
      const y = siteY(j);
      const tx = 26, sp = 3.1, gw = 4 * sp + 6;
      for (let s = 0; s < passed; s++) {
        const idx = dirR ? s : s; // tally order is left to right regardless of sweep direction
        const g = Math.floor(idx / 5), w = idx % 5;
        const gx = tx + g * gw;
        c.beginPath();
        if (w < 4) { c.moveTo(gx + w * sp, y - 8); c.lineTo(gx + w * sp, y + 8); }
        else { c.moveTo(gx - 2, y + 6); c.lineTo(gx + 3 * sp + 2, y - 6); }
        c.stroke();
      }
    }
    // the border hairline as each atom lands
    const placed = Math.min(14, Math.max(0, Math.floor((lt - T_FENCE) / DT_MOVE)));
    c.lineWidth = 1; c.strokeStyle = rgba('ember', 0.8);
    if (placed >= 1) {
      c.beginPath();
      for (let k = 0; k < placed; k++) {
        const m = this.moves[k]!;
        if (k === 0) c.moveTo(m.dx, m.dy - 40); else c.lineTo(m.dx, m.dy);
      }
      if (carrying && carrying.u > 0.3 && placed < 14) {
        const m = this.moves[carrying.k]!;
        c.lineTo(lerp(this.moves[placed - 1]!.dx, m.dx, ease.outCubic(prog(carrying.u, 0.5, 1))), lerp(this.moves[placed - 1]!.dy, m.dy, ease.outCubic(prog(carrying.u, 0.5, 1))));
      }
      c.setLineDash([2, 5]); c.stroke(); c.setLineDash([]);
    }
    // panel: counters
    const px0 = 1488, py0 = 858;
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.5);
    c.fillText('ATOMS COUNTED', px0, py0);
    c.font = font(F.mono(500), 64); c.letterSpacing = '0px';
    c.fillStyle = rgba('bone', 0.95);
    c.fillText(counted.toLocaleString('en-US').padStart(3, '0'), px0, py0 + 62);
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.5);
    const row = Math.min(15, Math.max(0, Math.ceil(lt / DT_ROW)));
    c.fillText(`ROW ${String(row).padStart(2, '0')} / 15`, px0 + 215, py0 + 62 - 28);
    const bl = placed;
    c.fillStyle = bl > 0 ? rgba('signal', 0.95) : rgba('bone', 0.35);
    c.fillText(`BORDER  ${String(bl).padStart(2, '0')} / 14 ATOMS · ${(bl * 0.255).toFixed(2)} nm`, px0, py0 + 96);
    c.fillStyle = rgba('bone', 0.38);
    c.fillText('Xe/Ni(110), 1989: 35 atoms spelled three letters.', px0, py0 + 124);
    c.letterSpacing = '0px';
    // scale bar 1 nm = 212 px (pitch 54 px = 0.255 nm)
    c.strokeStyle = rgba('bone', 0.6); c.lineWidth = 1.2;
    const sbx = W - 96 - 212, sby = 850;
    c.beginPath(); c.moveTo(sbx, sby); c.lineTo(sbx + 212, sby); c.moveTo(sbx, sby - 5); c.lineTo(sbx, sby + 5); c.moveTo(sbx + 212, sby - 5); c.lineTo(sbx + 212, sby + 5); c.stroke();
    c.font = font(F.mono(500), 13); c.fillStyle = rgba('bone', 0.55); c.textAlign = 'right'; c.fillText('1 nm', sbx + 212, sby - 12); c.textAlign = 'left';

    // probe tip: apex rides the carried atom; between moves it hovers at the next source
    this.drawTip(c, t, lt, carrying);
    c.restore();

    // lyric
    drawBridgeLine(c, line, t, { x: LAT.x0 - 6, y: 972, size: 82, alpha: 1, dim: 0.34, lead: 0.3 });
    comp.draw(renderer, L.upload(), out);

    // tip highlight (beam head at the apex while carrying)
    const bump = pulse(lt, 0, 0.1);
    return {
      bloom: 0.55, bloomThreshold: 0.8, vignette: 0.4, ca: 0.4,
      flash: 0.05 * bump, zoom: 1 + 0.004 * placedPulse(lt),
    };
  }

  private drawTip(c: CanvasRenderingContext2D, t: number, lt: number, carrying: { x: number; y: number; k: number; u: number } | null) {
    if (lt < T_FENCE - 0.35 || lt > 3.45) return;
    const last = this.moves[13]!;
    let tx: number, ty: number;
    if (carrying) { tx = carrying.x; ty = carrying.y; }
    else if (lt < T_FENCE) { const m = this.moves[0]!; const q = ease.outCubic(prog(lt, T_FENCE - 0.35, T_FENCE)); tx = lerp(m.sx + 200, m.sx, q); ty = lerp(m.sy - 190, m.sy, q); }
    else { tx = last.dx; ty = last.dy; }
    const appear = smoothstep(T_FENCE - 0.35, T_FENCE - 0.2, lt) * (1 - smoothstep(3.2, 3.4, lt));
    c.save();
    c.globalAlpha *= appear;
    // a slender tungsten cone leaning up and to the right, drawn as hairline + hatch
    const ax = 0.42, ay = -0.91; // direction from the apex up the shaft
    const len = 760, w0 = 1.5, w1 = 34;
    const nx = -ay, ny = ax;
    const p = (s: number, side: number) => {
      const wd = lerp(w0, w1, Math.pow(s / len, 0.8));
      return [tx + ax * s + nx * wd * side, ty + ay * s + ny * wd * side] as const;
    };
    c.beginPath();
    c.moveTo(tx, ty);
    for (let s = 4; s <= len; s += 20) c.lineTo(...p(s, 1));
    for (let s = len; s >= 4; s -= 20) c.lineTo(...p(s, -1));
    c.closePath();
    c.fillStyle = 'rgba(10,10,11,0.82)'; c.fill();
    c.lineWidth = 1.1; c.strokeStyle = rgba('bone', 0.8); c.stroke();
    c.lineWidth = 0.8; c.strokeStyle = rgba('bone', 0.35);
    c.beginPath();
    for (let s = 40; s < len; s += 16) { const a = p(s, 1), b = p(s + 9, -1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
    c.restore();
    if (carrying && carrying.u > 0.25 && carrying.u < 0.95) { c.save(); c.globalCompositeOperation = 'lighter'; beamHead2D(c, tx, ty, t, 0.55); c.restore(); }
  }
}

/** a tiny camera tick on every atom set down */
function placedPulse(lt: number) {
  let v = 0;
  for (let k = 0; k < 14; k++) { const tk = T_FENCE + k * DT_MOVE + 0.9 * DT_MOVE; if (lt >= tk) v = Math.max(v, Math.pow(0.5, (lt - tk) / 0.05)); }
  return v;
}
