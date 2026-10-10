// DROP: "EVERY / WAFER / is a / WEAPON / NOW". One module, three entries (param n = 1, 2, 3).
// The slam: full-frame Archivo 900, one shot per sung syllable (0.23 s cuts), TPP meter blowing up full-screen.
//   n=1  clean: ink on amber / bone on ink, iridescent wafer -> reticle -> TPP 1,200 -> 4,800 -> zoom into a die.
//   n=2  inverted palette, stacked solid copies, the wafer as a spinning sawblade, TPP 4,800 -> 19,200, the cut opens.
//   n=3  maximal: palette strobe, echo stacks, the wafer shatters into die shrapnel, TPP -> infinity, mosaic.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, SS_TAP, SS_TAP_GLSL, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font, measure, fitSize } from '../engine/type';
import { HEX, LIN } from '../engine/palette';
import { ease, clamp, lerp, pulse, hash, frameIdx, TAU, smoothstep, springStep, mulberry32, keys } from '../engine/util';
// NOTE: _motifs.ts has an unterminated doc comment that swallows beamHead/beamParticles; use the originals.
import { lineByScene, sparkHead as beamHead, sparkParticles as beamParticles, TPP_THRESHOLD } from './_motifs';

const BEAT = 60 / 128;
const CX = W / 2, CY = H / 2;
const RET_R = 470; // reticle / wafer radius (px)
const DIE_P = 70; // die pitch (px) at zoom 1
const DIE_ZOOM_END = 90; // final zoom of the die dive (fins 29 px apart: node1 opens on the same lattice)

type Key = 'ev1' | 'ev2' | 'wa1' | 'wa2' | 'is' | 'a' | 'we1' | 'we2' | 'now' | 'tpp' | 'end';
interface Shot { k: Key; t0: number; t1: number }
interface WordM { text: string; fam: string; size: number; capH: number; width: number }
interface Die { gx: number; gy: number; wave: number; vx: number; vy: number; vz: number; spin: number; ph: number; word: number; slot: number; late: number }

const rgb = (c: [number, number, number]) => new THREE.Vector3(c[0], c[1], c[2]);

const SHADER = /* glsl */ `
uniform vec2 uC; uniform float uR; uniform mat3 uRot; uniform int uMode; // 0 none, 1 wafer, 2 saw
uniform float uTime, uPitch, uGlint, uTeeth, uPaper;
uniform vec3 uBg, uHatchCol; uniform float uBgHatch;
uniform float uDieZoom, uDieFade;
${SS_TAP_GLSL}

float tri(float x) { return abs(fract(x) - 0.5) * 2.0; }

// the wafer / sawblade: analytic ray vs a thick disc (orthographic), engraved shading
vec4 disc(vec2 px) {
  vec3 o = vec3(px.x - uC.x, uC.y - px.y, 3000.0), d = vec3(0.0, 0.0, -1.0);
  mat3 RT = transpose(uRot);
  vec3 ol = RT * o, dl = RT * d;
  float R = uR, h = (uMode == 2 ? 0.012 : 0.04) * R;
  float best = 1e9; int kind = 0; vec3 hp = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float zc = i == 0 ? h : -h;
    if (abs(dl.z) > 1e-4) {
      float tt = (zc - ol.z) / dl.z; vec3 p = ol + dl * tt;
      float len = length(p.xy);
      float rmax = R;
      if (uMode == 2) { float a = atan(p.y, p.x) / TAU * uTeeth; rmax = R * (0.925 + 0.075 * (1.0 - fract(a))); }
      bool ok = len < rmax && (uMode == 2 ? len > 0.13 * R : p.y > -0.93 * R);
      if (uMode == 2) {
        for (int k = 0; k < 4; k++) { float an = float(k) * 1.5708 + 0.785; if (length(p.xy - vec2(cos(an), sin(an)) * 0.5 * R) < 0.075 * R) ok = false; }
      }
      if (ok && tt > 0.0 && tt < best) { best = tt; kind = i == 0 ? 1 : 2; hp = p; }
    }
  }
  if (uMode == 1) {
    float a = dot(dl.xy, dl.xy), b = dot(ol.xy, dl.xy), c = dot(ol.xy, ol.xy) - R * R;
    float dd = b * b - a * c;
    if (a > 1e-6 && dd > 0.0) {
      float tt = (-b - sqrt(dd)) / a; vec3 p = ol + dl * tt;
      if (tt > 0.0 && abs(p.z) <= h && tt < best && p.y > -0.93 * R) { best = tt; kind = 3; hp = p; }
    }
  }
  if (kind == 0) return vec4(0.0);
  vec3 n = kind == 1 ? vec3(0, 0, 1) : kind == 2 ? vec3(0, 0, -1) : vec3(normalize(hp.xy), 0.0);
  vec3 N = uRot * n;
  vec3 Lg = normalize(vec3(-0.45, 0.55, 0.70)), V = vec3(0, 0, 1), Hh = normalize(Lg + V);
  float spec = pow(max(dot(N, Hh), 0.0), 48.0);
  float dif = clamp(dot(N, Lg), 0.0, 1.0);
  vec2 uv = hp.xy; float rr = length(uv) / R;
  float du = 1.3 / max(0.22, abs(N.z)) / PX_SCALE;
  vec3 col;
  if (kind == 1) {
    float phase; float lane = 0.0; float ho = 0.0;
    if (uMode == 1) {
      vec2 cell = floor(uv / uPitch + 0.5); ho = hash12(cell);
      vec2 f = abs(fract(uv / uPitch + 0.5) - 0.5) * uPitch;
      lane = 1.0 - smoothstep(0.8, 1.8, min(f.x, f.y));
      vec2 fl = fract(uv / uPitch + 0.5); phase = 2.6 * rr + 0.5 * (fl.x * 0.7 + fl.y * 0.45) + ho * 0.07 + uGlint + 0.25 * dot(N.xy, vec2(0.8, 0.6));
    } else {
      phase = 1.2 * dot(N.xy, vec2(0.8, 0.6)) * 3.0 + rr * 1.1 + 0.5 * tri(atan(uv.y, uv.x) / TAU * 8.0) * 0.15 + uGlint;
    }
    float band = 0.5 + 0.5 * cos(TAU * phase);
    float lit = (0.20 + 0.80 * pow(band, 1.5)) * (0.55 + 0.45 * dif) + spec * 0.9;
    if (uMode == 2) lit *= 0.88 + 0.12 * cos(rr * 150.0);
    float darkness = clamp(1.0 - lit, 0.0, 1.0);
    float hu = (uMode == 1 ? uv.y / (uPitch / 9.0) : rr * 90.0);
    float hcov = hatchD(hu, darkness * 0.9, abs(du / (uMode == 1 ? uPitch / 9.0 : R / 90.0)));
    if (uPaper > 0.5) {
      col = mix(C_BONE, mix(C_EMBER, C_SIGNAL, band), 0.35 + 0.5 * band * (1.0 - darkness));
      col = mix(col, C_INK, hcov * 0.78);
      col += spec * 0.5;
    } else {
      col = heat(lit * 0.95 + 0.04);
      col = mix(col, C_INK, hcov * 0.40);
      if (uMode == 1) col = mix(col, C_BLOOD * 0.6, lane * 0.8);
    }
    float rim = smoothstep(0.955, 0.99, rr);
    col = mix(col, uPaper > 0.5 ? C_INK : C_EMBER * 1.5, rim * 0.8);
    if (uMode == 2) { float ar = smoothstep(0.13, 0.15, rr) * (1.0 - smoothstep(0.17, 0.19, rr)); col = mix(col, uPaper > 0.5 ? C_INK : C_EMBER * 1.3, ar); }
  } else if (kind == 3) {
    float ang = atan(hp.y, hp.x);
    float rib = hatchD(ang * R / 6.0, 0.35 + 0.4 * dif, 1.0);
    col = mix(uPaper > 0.5 ? C_ASH : C_BLOOD, uPaper > 0.5 ? C_BONE : C_SIGNAL, pow(dif, 1.6) + spec);
    col = mix(col, C_INK, rib * 0.5);
  } else {
    col = uPaper > 0.5 ? C_ASH : C_INK2 + C_GRAPHITE * 0.2 * dif;
  }
  return vec4(col, 1.0);
}

// zoom into one die: wafer -> die -> blocks -> fins and gates (node1 opens on this lattice)
vec3 dieDive(vec2 px) {
  float Z = uDieZoom;
  vec2 q = (px - uC) / Z;                 // reticle units, die centre at origin
  float P = uPitch;
  vec3 col = C_INK;
  float lane = 0.0;
  // die lanes
  vec2 g0 = abs(fract(q / P + 0.5) - 0.5) * P * Z;
  float d0 = min(g0.x, g0.y);
  col += C_SIGNAL * 0.55 * (1.0 - smoothstep(0.6, 1.7, d0));
  // die interior fill, slightly raised
  vec2 cell = floor(q / P + 0.5);
  float inside = step(max(abs(q.x - cell.x * P), abs(q.y - cell.y * P)), P * 0.5 - 1.0 / Z);
  col += C_BLOOD * 0.10 * inside * (0.5 + hash12(cell));
  // blocks (P/6), cells (P/36)
  float s1 = P / 6.0, s2 = P / 36.0, s3 = P / 216.0;
  float a1 = smoothstep(7.0, 32.0, s1 * Z), a2 = smoothstep(7.0, 30.0, s2 * Z);
  vec2 g1 = abs(fract(q / s1 + 0.5) - 0.5) * s1 * Z;
  col += C_SIGNAL * 0.40 * a1 * (1.0 - smoothstep(0.6, 1.6, min(g1.x, g1.y)));
  vec2 g2 = abs(fract(q / s2 + 0.5) - 0.5) * s2 * Z;
  col += C_SIGNAL * 0.32 * a2 * (1.0 - smoothstep(0.6, 1.5, min(g2.x, g2.y)));
  // fins (vertical, pitch s3) and gates (horizontal bars, pitch s2)
  float a3 = smoothstep(4.0, 22.0, s3 * Z);
  float fx = abs(fract(q.x / s3 + 0.5) - 0.5) * s3 * Z;
  float finW = 0.085 * s3 * Z;
  float fin = 1.0 - smoothstep(finW - 0.7, finW + 0.7, fx);
  float gy = abs(fract(q.y / s2 + 0.5) - 0.5) * s2 * Z;
  float gateW = 0.17 * s2 * Z;
  float gate = 1.0 - smoothstep(gateW - 0.8, gateW + 0.8, gy);
  col = mix(col, col + C_SIGNAL * 0.9 * fin, a3);
  col = mix(col, col * 0.35 + C_BLOOD * 0.9 * gate + C_SIGNAL * 0.25 * gate * fin, a3 * gate);
  return col;
}

void main() {
  vec2 px0 = FRAG_PX;
  vec3 bg = uBg;
  if (uBgHatch > 0.0) bg = mix(bg, uHatchCol, hatch(px0.y / 3.0, 0.16) * uBgHatch);
  if (uDieZoom > 0.0) { fragColor = vec4(mix(bg, dieDive(px0), uDieFade), 1.0); return; }
  if (uMode == 0) { fragColor = vec4(bg, 1.0); return; }
  vec3 acc = vec3(0.0); float al = 0.0;
  for (int k = ssK0(); k < ssK1(); k++) {
    vec4 s = disc(px0 + rgss(k));
    acc += s.rgb * s.a; al += s.a;
  }
  float wgt = ssWeight(); acc *= wgt; al *= wgt;
  fragColor = vec4(bg * (1.0 - al) + acc, 1.0);
}
`;

export default class Drop extends Scene {
  n = 1;
  T0 = 0;
  len = 3.75;
  words: any[] = [];
  shots: Shot[] = [];
  M: Record<string, WordM> = {};
  pass!: FSPass;
  layer = new Layer2D();
  beam = new LineBatch(5000);
  beamN = new LineBatch(5000, { blend: 'normal' });
  rot3 = new THREE.Matrix3();
  dies: Die[] = [];
  tpp: [number, number] = [1200, 4800];

  override async init() {
    this.n = (this.ctx.params.n as number) ?? 1;
    const line = lineByScene(this.ctx.lyrics, 'wafer' + this.n);
    this.T0 = line.start;
    this.words = line.words;
    this.len = this.ctx.end - this.ctx.start;
    const w = this.words;
    const sy = (i: number, j: number) => (w[i].syl && w[i].syl[j] ? w[i].syl[j][0] : w[i].start) - this.T0;
    const st = (i: number) => w[i].start - this.T0;
    const nowT = st(5);
    this.shots = [
      { k: 'ev1', t0: st(0), t1: sy(0, 1) }, { k: 'ev2', t0: sy(0, 1), t1: st(1) },
      { k: 'wa1', t0: st(1), t1: sy(1, 1) }, { k: 'wa2', t0: sy(1, 1), t1: st(2) },
      { k: 'is', t0: st(2), t1: st(3) }, { k: 'a', t0: st(3), t1: st(4) },
      { k: 'we1', t0: st(4), t1: sy(4, 1) }, { k: 'we2', t0: sy(4, 1), t1: nowT },
      { k: 'now', t0: nowT, t1: nowT + BEAT }, { k: 'tpp', t0: nowT + BEAT, t1: w[5].end - this.T0 },
      { k: 'end', t0: w[5].end - this.T0, t1: this.len },
    ];
    this.tpp = this.n === 1 ? [1200, 4800] : this.n === 2 ? [4800, 19200] : [19200, Infinity];
    // type metrics
    const wide = F.archivo(125, 900), thin = F.archivo(62, 300);
    const mk = (text: string, fam: string, maxW: number, max = 1500) => {
      const size = fitSize(text, fam, maxW, max);
      const c = this.layer.ctx; c.font = font(fam, size);
      const m = c.measureText('H');
      return { text, fam, size, capH: m.actualBoundingBoxAscent, width: measure(text, fam, size) } as WordM;
    };
    for (const t of ['EVERY', 'WAFER', 'WEAPON', 'NOW']) this.M[t] = mk(t, wide, 1728);
    this.M.is = { ...mk('is', thin, 900, 1250) };
    this.M.a = { ...mk('a', thin, 900, 1250) };
    this.M.NOW = mk('NOW', wide, this.n === 3 ? 1560 : 1728);
    // wafer dies (n=3 shrapnel): 144 dies nearest the centre of the wafer grid + later waves
    const rnd = mulberry32(77);
    const cells: { gx: number; gy: number; r: number }[] = [];
    for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) cells.push({ gx: i * DIE_P, gy: j * DIE_P, r: Math.hypot(i, j * 1.0) });
    cells.sort((a, b) => a.r - b.r);
    const first = cells.slice(0, 144);
    first.forEach((c, i) => {
      const a = Math.atan2(c.gy, c.gx) + (rnd() - 0.5) * 0.5;
      const sp = 260 + rnd() * 700;
      this.dies.push({ gx: c.gx, gy: c.gy, wave: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 700 + rnd() * 2400, spin: (rnd() - 0.5) * 9, ph: rnd() * TAU, word: Math.floor(rnd() * 6), slot: i, late: rnd() * 0.18 });
    });
    for (let wv = 1; wv <= 5; wv++) for (let i = 0; i < 48; i++) {
      const a = rnd() * TAU, sp = 120 + rnd() * 600;
      this.dies.push({ gx: (rnd() - 0.5) * 200, gy: (rnd() - 0.5) * 200, wave: wv, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 900 + rnd() * 2600, spin: (rnd() - 0.5) * 10, ph: rnd() * TAU, word: Math.floor(rnd() * 6), slot: i, late: rnd() * 0.1 });
    }
    this.pass = new FSPass(SHADER, {
      uC: { value: new THREE.Vector2(CX, CY) }, uR: { value: RET_R }, uRot: { value: this.rot3 }, uMode: { value: 0 },
      uTime: { value: 0 }, uPitch: { value: DIE_P }, uGlint: { value: 0 }, uTeeth: { value: 44 }, uPaper: { value: 0 },
      uBg: { value: rgb(LIN.ink) }, uHatchCol: { value: rgb(LIN.ink2) }, uBgHatch: { value: 0 },
      uDieZoom: { value: 0 }, uDieFade: { value: 1 }, ssTap: SS_TAP,
    });
  }

  private shotAt(r: number): Shot {
    let s = this.shots[0]!;
    for (const x of this.shots) if (r >= x.t0) s = x;
    return s;
  }

  // ------------------------------------------------------------------ helpers
  private slam(s: number, amt: number, dur = 0.16) {
    return (1 + amt * (1 - ease.outExpo(clamp(s / dur)))) * (1 + 0.03 * s);
  }

  /** Draw one big word centred at (cx,cy). `fx` crops: the word-space x (0..width) that goes to the centre at zoom z. */
  private word(c: CanvasRenderingContext2D, key: string, o: { cx?: number; cy?: number; sc?: number; rot?: number; fill: string; stack?: { dx: number; dy: number; fill: string; sc?: number }[]; fx?: number; z?: number; lines?: string }) {
    const m = this.M[key]!;
    c.save();
    c.translate(o.cx ?? CX, o.cy ?? CY);
    c.rotate(o.rot ?? 0);
    const sc = o.sc ?? 1;
    c.scale(sc, sc);
    if (o.z && o.z !== 1) { c.scale(o.z, o.z); c.translate(-((o.fx ?? m.width / 2) - m.width / 2), 0); }
    c.font = font(m.fam, m.size);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const x0 = -m.width / 2, y0 = m.capH / 2;
    if (o.lines) this.rules(c, m, o.lines, x0, y0);
    for (const s of o.stack ?? []) {
      c.save(); c.translate(s.dx, s.dy);
      if (s.sc) c.scale(s.sc, s.sc);
      c.fillStyle = s.fill; c.fillText(m.text, x0, y0);
      c.restore();
    }
    c.fillStyle = o.fill; c.fillText(m.text, x0, y0);
    c.restore();
  }

  /** type-specimen hairlines at baseline and cap height, labelled (they ride the same transform as the word) */
  private rules(c: CanvasRenderingContext2D, m: WordM, col: string, x0: number, y0: number) {
    c.save();
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.2;
    c.globalAlpha = 0.55;
    for (const [yy, lab] of [[y0, 'baseline'], [y0 - m.capH, `cap-height · ${(m.capH / m.size).toFixed(3)} em`]] as const) {
      c.beginPath(); c.moveTo(-W * 3, yy); c.lineTo(W * 3, yy); c.stroke();
      c.font = font(F.mono(500), 13); c.textBaseline = 'bottom'; c.textAlign = 'left';
      c.fillText(lab, x0 - 0, yy - 5);
    }
    c.restore();
  }

  private mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, col: string, size = 15, align: CanvasTextAlign = 'left', weight = 500, track = 0) {
    c.save(); c.font = font(F.mono(weight), size); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
    (c as any).letterSpacing = `${track}px`;
    c.fillText(text, x, y); c.restore();
  }

  private furniture(c: CanvasRenderingContext2D, idx: string, label: string, col: string, alpha = 0.8) {
    c.save(); c.globalAlpha = alpha;
    const step = this.n === 1 ? '07' : this.n === 2 ? '18' : '28';
    this.mono(c, `LOT 7A-0042 · STEP ${step}/31`, 96, 110, col, 15, 'left', 500, 1.5);
    this.mono(c, `${idx}  ${label}`, W - 96, 110, col, 15, 'right', 500, 1.5);
    this.mono(c, `HOOK ${this.n} / 3`, 96, H - 96, col, 15, 'left', 500, 1.5);
    c.restore();
  }

  // ------------------------------------------------------------------ the TPP instrument, full-screen
  private tppValue(s: number): number {
    const [a, b] = this.tpp;
    if (!isFinite(b)) {
      // roll up past the scale, then the infinity slams in
      const p = ease.inQuart(clamp(s / 0.5));
      return a * Math.pow(52, p);
    }
    if (s > 0.5) return b;
    const sp = springStep(s, 2.4, 0.62);
    return a + (b - a) * sp;
  }

  /** odometer drum position of decimal place p: a digit only turns while every lower digit is 9 (carry), the units drum is continuous */
  private odo(v: number, p: number): number {
    let carry = v - Math.floor(v);
    for (let q = 1; q <= p; q++) {
      const dprev = Math.floor(v / Math.pow(10, q - 1)) % 10;
      carry = dprev === 9 ? carry : 0;
    }
    return (Math.floor(v / Math.pow(10, p)) % 10) + carry;
  }

  private drawTPPBig(c: CanvasRenderingContext2D, s: number, fg: string, dim: string, bgFill: string | null, paper: boolean, blow: boolean) {
    const [v0, v1] = this.tpp;
    const v = this.tppValue(s);
    const infinite = !isFinite(v1);
    const settled = infinite ? s > 0.5 : s > 0.34;
    c.save();
    if (bgFill) { c.fillStyle = bgFill; c.fillRect(-10, -10, W + 20, H + 20); }
    // blow-up: scales out of the small readout in the corner
    const k = blow ? ease.outExpo(clamp(s / 0.2)) : 1;
    if (blow) {
      const kk = 0.07 + 0.93 * k;
      c.translate(lerp(190, CX, k), lerp(H - 130, CY, k)); c.scale(kk, kk); c.translate(-CX, -CY);
    }
    const crossed = v >= TPP_THRESHOLD || infinite;
    const amber = HEX.signal;
    // threshold: a full-height red hairline and its label
    const bx0 = 96, bw = W - 192, tx = bx0 + bw * (TPP_THRESHOLD / 20000);
    const flashRed = pulse(s, 0.12, 0.09);
    c.fillStyle = HEX.red; c.globalAlpha = 0.65 + 0.35 * flashRed;
    c.fillRect(tx - 1.5, -20, 3, H + 40);
    c.globalAlpha = 1;
    this.mono(c, 'ECCN 3A090 · RESTRICTED ABOVE 4,800', tx + 14, 150, HEX.red, 16, 'left', 600, 1.5);
    // digits
    const text = isFinite(v1) ? Math.round(v1).toLocaleString('en-US') : '999,999';
    const nd = text.replace(/,/g, '').length, nc = (text.match(/,/g) || []).length;
    const size = Math.min(640, (W - 192) / (nd * 0.6 + nc * 0.3));
    const cell = size * 0.6, comma = size * 0.3;
    const total = nd * cell + nc * comma;
    const cap = size * 0.7, base = 640 + cap / 2 - 70;
    const dcol = crossed ? amber : fg;
    if (!(infinite && settled)) {
      let x = CX - total / 2;
      const ndigits = nd;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === ',') {
          c.fillStyle = dcol; c.font = font(F.mono(600), size); c.textAlign = 'center';
          c.fillText(',', x + comma / 2, base); x += comma; continue;
        }
        const place = ndigits - 1 - text.slice(0, i).replace(/,/g, '').length;
        const pow = Math.pow(10, place);
        const lead = place === 0 || v >= pow;
        if (lead) {
          const pos = this.odo(v, place);
          const whole = Math.floor(pos), fr = pos - whole;
          const lh = cap * 1.5;
          c.save();
          c.beginPath(); c.rect(x - 4, base - cap * 1.08, cell + 8, cap * 1.2); c.clip();
          c.font = font(F.mono(600), size); c.fillStyle = dcol; c.textAlign = 'center';
          for (const off of [-1, 0, 1]) {
            const dgt = (((whole + off) % 10) + 10) % 10;
            c.fillText(String(dgt), x + cell / 2, base + (off - fr) * lh);
          }
          c.restore();
        }
        x += cell;
      }
    } else {
      // infinity: a lemniscate drawn heavy, with the beam running round it
      c.strokeStyle = amber; c.lineWidth = 64; c.lineCap = 'round'; c.lineJoin = 'round';
      const a = 560, pts: [number, number][] = [];
      const drawn = clamp((s - 0.5) / 0.12);
      for (let i = 0; i <= 200; i++) {
        const th = (i / 200) * TAU, d = 1 + Math.sin(th) ** 2;
        pts.push([CX + (a * Math.cos(th)) / d, 560 + (a * 1.0 * Math.sin(th) * Math.cos(th)) / d]);
      }
      c.beginPath();
      const nPts = Math.max(2, Math.floor(drawn * pts.length));
      pts.slice(0, nPts).forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      c.stroke();
    }
    c.globalAlpha = 1;
    // bar: linear scale to 20,000 with ticks; fill overshoots the red line
    const by = 905;
    c.fillStyle = dim; c.fillRect(bx0, by + 10, bw, 2);
    for (let i = 0; i <= 4; i++) {
      c.fillRect(bx0 + (bw * i) / 4 - 1, by - 2, 2, 24);
      this.mono(c, (i * 5000).toLocaleString('en-US'), bx0 + (bw * i) / 4, by + 52, dim, 15, i === 4 ? 'right' : i === 0 ? 'left' : 'center');
    }
    const fr = infinite ? lerp(0.24, 1.06, ease.inQuart(clamp(s / 0.5))) : clamp(v / 20000, 0, 1.06);
    c.fillStyle = amber; c.fillRect(bx0, by - 3, Math.min(bw * fr, W - bx0 + 40), 30);
    this.mono(c, 'TOTAL PROCESSING PERFORMANCE', bx0, 190, dim, 17, 'left', 500, 3);
    this.mono(c, `${infinite ? 'UNBOUNDED' : crossed ? 'CONTROLLED' : 'BELOW THRESHOLD'} · LOT 7A-0042`, W - 96, 190, crossed ? amber : dim, 17, 'right', 600, 3);
    void paper; void v0;
    c.restore();
  }

  // ------------------------------------------------------------------ reticle (NOW) over the wafer
  private drawReticle(c: CanvasRenderingContext2D, col: string, dimCol: string, s: number, zoom = 1, alpha = 1) {
    c.save();
    c.translate(CX, CY); c.scale(zoom, zoom);
    c.globalAlpha = alpha;
    const lw = (v: number) => v / zoom;
    c.strokeStyle = col; c.fillStyle = col;
    // wafer outline and rings
    c.lineWidth = lw(5); c.beginPath(); c.arc(0, 0, RET_R, 0, TAU); c.stroke();
    c.lineWidth = lw(2);
    for (const r of [RET_R * 0.78, RET_R * 0.5, RET_R * 0.22]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    // die scribe grid inside the wafer
    c.save(); c.beginPath(); c.arc(0, 0, RET_R - 2, 0, TAU); c.clip();
    c.strokeStyle = dimCol; c.lineWidth = lw(1);
    c.beginPath();
    for (let i = -8; i <= 8; i++) { const p = (i + 0.5) * DIE_P; c.moveTo(p, -RET_R); c.lineTo(p, RET_R); c.moveTo(-RET_R, p); c.lineTo(RET_R, p); }
    c.stroke(); c.restore();
    // tick ring
    c.strokeStyle = col;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, big = i % 10 === 0, mid = i % 5 === 0;
      const r0 = RET_R + 10, r1 = RET_R + (big ? 38 : mid ? 26 : 16);
      c.lineWidth = lw(big ? 3.5 : 2);
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke();
    }
    // crosshair out to the frame, with a gap round the target die
    c.lineWidth = lw(3);
    const gap = DIE_P * 0.9;
    c.beginPath();
    c.moveTo(-W, 0); c.lineTo(-gap, 0); c.moveTo(gap, 0); c.lineTo(W, 0);
    c.moveTo(0, -H); c.lineTo(0, -gap); c.moveTo(0, gap); c.lineTo(0, H);
    c.stroke();
    // the locked die: corner brackets that snap in
    const kk = 1 + 1.4 * (1 - ease.outExpo(clamp(s / 0.2)));
    const b = DIE_P * 0.5 * kk, bl = 22;
    c.lineWidth = lw(4);
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      c.moveTo(sx * b, sy * (b - bl)); c.lineTo(sx * b, sy * b); c.lineTo(sx * (b - bl), sy * b);
    }
    c.stroke();
    c.restore();
  }

  // ------------------------------------------------------------------ wafer parameters per shot
  private setWafer(mode: number, R: number, tilt: number, yaw: number, spin: number, cx = CX, cy = CY, glint = 0, paper = 0) {
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(new THREE.Matrix4().makeRotationZ(spin));
    this.rot3.setFromMatrix4(m);
    const u = this.pass.u;
    u.uMode!.value = mode; u.uR!.value = R; (u.uC!.value as THREE.Vector2).set(cx, cy); u.uGlint!.value = glint; u.uPaper!.value = paper;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const r = f.t - this.T0;
    const shot = this.shotAt(r);
    const s = r - shot.t0; // time in shot
    const n = this.n;
    const u = this.pass.u;
    const L = (a: [number, number, number]) => rgb(a);
    const INK = HEX.ink, BONE = HEX.bone, AMB = HEX.signal, UMB = HEX.blood, EMB = HEX.ember;

    // ---- shot scheme: background (linear), foreground (css), paper?
    let bg = LIN.ink, fg: string = BONE, paper = false, hatch = 0, hatchCol = LIN.ink2;
    const strobe = Math.floor(r / (BEAT / 2));
    const k = shot.k;
    if (n === 1) {
      if (k === 'ev1' || k === 'ev2' || k === 'we1' || k === 'we2') { bg = LIN.signal; fg = INK; hatch = 0.22; hatchCol = LIN.ember; }
    } else if (n === 2) {
      bg = LIN.ink; fg = AMB;
      if (k === 'wa1' || k === 'wa2' || k === 'is' || k === 'a' || k === 'now' || k === 'tpp' || k === 'end') { bg = LIN.bone; fg = INK; paper = true; hatchCol = LIN.ash; }
    } else {
      // strobe on the 8ths through the words, then hard black for the number
      const cyc = [0, 1, 2, 0, 1, 0][strobe % 6]!;
      if (k === 'ev1' || k === 'we1') { if (cyc === 1) { bg = LIN.signal; fg = INK; } else if (cyc === 2) { bg = LIN.bone; fg = INK; paper = true; } }
      if (k === 'ev2' || k === 'we2') { bg = LIN.signal; fg = INK; }
      if (k === 'is' || k === 'a') { bg = LIN.ink; fg = BONE; }
    }
    if (hatch === 0 && (k === 'ev1' || k === 'ev2' || k === 'we1' || k === 'we2') && bg === LIN.signal) { hatch = 0.22; hatchCol = LIN.ember; }

    // ---- wafer / saw
    let mode = 0, dieZoom = 0;
    const spinT = r * (n === 2 ? 11 : n === 3 ? 1.1 : 0.9);
    if (k === 'wa1' || k === 'wa2') {
      const second = k === 'wa2';
      const R = second ? RET_R * 1.7 : RET_R * 1.2;
      if (n === 1) this.setWafer(1, R, second ? 0.78 : 1.0, second ? -0.35 : 0.25, spinT, CX, CY, r * 0.9);
      else if (n === 2) this.setWafer(2, second ? 640 : 520, second ? 0.55 : 0.35, 0.18, spinT, CX, CY, r * 1.4, 1);
      else this.setWafer(1, RET_R, 0.0, 0.0, 0.6 * r, CX, CY, r * 0.9);
      mode = 1;
      if (n === 3 && second) mode = 0; // shattered: the dies take over
      if (n === 2) mode = 2;
    } else if (k === 'now' && n === 2) {
      this.setWafer(2, 640, 0.18, 0.0, spinT, CX, CY, r * 1.4, 1); mode = 2;
    }
    if (k === 'end' && n === 1) {
      const kk = ease.inExpo(clamp(s / (shot.t1 - shot.t0)));
      dieZoom = Math.exp(lerp(0, Math.log(DIE_ZOOM_END), kk));
    }
    u.uBg!.value = L(bg); u.uHatchCol!.value = L(hatchCol); u.uBgHatch!.value = hatch;
    u.uDieZoom!.value = dieZoom; (u.uC!.value as THREE.Vector2).set(CX, CY);
    if (dieZoom > 0) { u.uC!.value = new THREE.Vector2(CX, CY); u.uPitch!.value = DIE_P; u.uMode!.value = 0; } else u.uMode!.value = mode;
    u.uPitch!.value = DIE_P; u.uDieFade!.value = 1;
    u.uTeeth!.value = 44; u.uTime!.value = f.t;
    // restore wafer centre for the die pass
    if (dieZoom > 0) (u.uC!.value as THREE.Vector2).set(CX, CY);
    this.pass.render(renderer, out);

    // ---- 2D layer
    const lay = this.layer, c = lay.ctx;
    lay.clear();
    this.beam.clear(); this.beamN.clear();
    const post: PostOverrides = {};
    let shakeAmp = 0, flash = 0, ca = 0.9, zoom = 1, invertFrames = true;
    const bloomT = 1.05;
    const isPaper = paper;
    const idxLab = ['01', '01', '02', '02', '03', '04', '05', '05', '06', '06', ''][this.shots.findIndex((x) => x === shot)] ?? '';

    const slamAmt = (amt: number, dur?: number) => this.slam(s, amt, dur);
    const stack2 = (a: string, b: string, d = 14) => [{ dx: d * 2, dy: d * 2, fill: b }, { dx: d, dy: d, fill: a }];

    if (k === 'ev1') {
      const sc = slamAmt(0.22);
      const stack = n === 2 ? stack2(BONE, UMB) : n === 3 ? this.echo(r, s, [AMB, BONE, UMB, AMB, BONE, UMB], fg) : [];
      this.word(c, 'EVERY', { fill: fg, sc, rot: n === 3 ? -0.015 : 0, stack, lines: n === 1 ? INK : undefined });
      this.furniture(c, '01', 'EVERY', fg);
      shakeAmp = [10, 16, 26][n - 1]!; flash = 0.3;
    } else if (k === 'ev2') {
      const m = this.M.EVERY!;
      const sc = slamAmt(0.12);
      const stack = n === 2 ? stack2(BONE, UMB, 22) : n === 3 ? this.echo(r, s, [BONE, AMB, UMB, BONE], fg) : [];
      this.word(c, 'EVERY', { fill: fg, sc, z: 2.05, fx: m.width * 0.68, stack, rot: n === 3 ? 0.03 : 0 });
      this.furniture(c, '01', 'EVERY · 2', fg, 0.6);
      shakeAmp = [14, 22, 34][n - 1]!; flash = 0.2;
    } else if (k === 'wa1' || k === 'wa2') {
      const second = k === 'wa2';
      const sc = slamAmt(second ? 0.1 : 0.17);
      const stack = n === 2 ? [{ dx: 16, dy: 16, fill: AMB }, { dx: 32, dy: 32, fill: UMB }] : n === 3 ? this.echo(r, s, [AMB, BONE, AMB], fg) : [];
      if (n === 3 && second) this.shrapnel(c, r, false, fg);
      this.word(c, 'WAFER', { fill: fg, sc, z: second ? 1.0 : 1.0, stack, cy: CY + (second ? 20 : 0) });
      if (n === 3 && second) this.shrapnel(c, r, true, fg);
      this.furniture(c, '02', second ? 'WAFER · 2' : 'WAFER', isPaper ? INK : BONE, 0.7);
      shakeAmp = [8, 14, 24][n - 1]!; flash = 0.25;
    } else if (k === 'is' || k === 'a') {
      const key = k === 'is' ? 'is' : 'a';
      const sc = this.slam(s, 0.06, 0.12);
      if (n === 3) this.shrapnel(c, r, false, fg);
      const m = this.M[key]!;
      const col = fg;
      this.word(c, key, { fill: col, sc, cy: CY + 40, stack: n === 2 ? [{ dx: 8, dy: 8, fill: AMB }] : [] });
      // hairline box, ruler ticks
      c.save(); c.strokeStyle = col; c.globalAlpha = 0.5; c.lineWidth = 1;
      c.beginPath(); c.moveTo(96, CY + 40 + m.capH / 2); c.lineTo(W - 96, CY + 40 + m.capH / 2); c.stroke();
      c.restore();
      this.furniture(c, k === 'is' ? '03' : '04', k === 'is' ? 'is' : 'a', col, 0.6);
      // the beam crosses the frame over "is a": it IS the hairline
      const bs = (r - this.shots.find((x) => x.k === 'is')!.t0) / (this.shots.find((x) => x.k === 'a')!.t1 - this.shots.find((x) => x.k === 'is')!.t0);
      const hx = lerp(-60, W + 60, ease.inOutCubic(clamp(bs)));
      const hy = CY + 40 + m.capH / 2;
      const bb = isPaper ? this.beamN : this.beam;
      bb.seg2(-60, hy, hx, hy, 2.2, [LIN.signal[0] * 2, LIN.signal[1] * 2, LIN.signal[2] * 2], 1);
      beamParticles(bb, r, (tt: number) => { const q = (tt - this.shots.find((x) => x.k === 'is')!.t0) / (this.shots.find((x) => x.k === 'a')!.t1 - this.shots.find((x) => x.k === 'is')!.t0); return q < 0 || q > 1 ? null : { x: lerp(-60, W + 60, ease.inOutCubic(clamp(q))), y: hy }; }, { rate: 180, life: 0.35, speed: 320, gravity: 700, intensity: 0.8, seed: 5 });
      beamHead(bb, hx, hy, r, 1.2, 1);
      shakeAmp = k === 'is' ? 4 : 7; flash = 0.1;
    } else if (k === 'we1' || k === 'we2') {
      const second = k === 'we2';
      const m = this.M.WEAPON!;
      const sc = slamAmt(second ? 0.1 : 0.3);
      const stack = n === 2 ? stack2(BONE, UMB, 18) : n === 3 ? this.echo(r, s, [BONE, UMB, BONE, UMB, BONE, UMB], fg) : [{ dx: 10, dy: 10, fill: UMB }, { dx: 20, dy: 20, fill: UMB }];
      if (n === 3) this.shrapnel(c, r, false, fg);
      this.word(c, 'WEAPON', { fill: fg, sc, rot: second ? 0.05 : -0.04, z: second ? 2.2 : 1, fx: m.width * 0.78, stack });
      if (n === 3) this.shrapnel(c, r, true, fg);
      this.furniture(c, '05', second ? 'WEAPON · 2' : 'WEAPON', fg, 0.7);
      shakeAmp = [26, 36, 50][n - 1]! * (second ? 1.2 : 1); flash = second ? 0.3 : 0.55; ca = 3.2;
    } else if (k === 'now') {
      if (n === 3) {
        this.shrapnel(c, r, false, fg);
      }
      const sc = slamAmt(0.28);
      const nowFill = n === 2 ? INK : BONE;
      if (n === 1) this.drawReticle(c, AMB, 'rgba(255,164,27,0.30)', s);
      if (n === 2) this.sawCut(c, s, r);
      this.word(c, 'NOW', { fill: nowFill, sc, stack: n === 2 ? [{ dx: 14, dy: 14, fill: AMB }] : n === 3 ? this.echo(r, s, [AMB, BONE, AMB, BONE, AMB, BONE], BONE) : [] });
      if (n === 3) this.shrapnel(c, r, true, fg);
      // the small TPP readout that will blow up
      c.save(); c.translate(96, H - 150);
      this.tinyTPP(c, isPaper ? INK : BONE, isPaper ? 'rgba(10,10,11,0.4)' : 'rgba(238,233,223,0.4)');
      c.restore();
      this.furniture(c, '06', 'NOW', isPaper ? INK : BONE, 0.8);
      this.scanBar(isPaper ? this.beamN : this.beam, s / BEAT);
      shakeAmp = [30, 36, 54][n - 1]!; flash = 0.6; ca = 4;
    } else if (k === 'tpp') {
      const nowS = this.shots.find((x) => x.k === 'now')!;
      const bgFill = n === 2 ? BONE : INK;
      const fgc = n === 2 ? INK : BONE;
      const dimc = n === 2 ? 'rgba(10,10,11,0.4)' : 'rgba(238,233,223,0.4)';
      // ghost NOW behind the number, lit as it is sung
      c.save();
      c.fillStyle = bgFill; c.fillRect(0, 0, W, H);
      c.restore();
      const wn = this.words[5];
      const prog = (r + this.T0 - wn.start) / (wn.end - wn.start);
      this.ghostNow(c, clamp(prog), n === 2 ? INK : BONE);
      this.drawTPPBig(c, s, fgc, dimc, null, isPaper, true);
      this.furniture(c, '06', 'TPP', fgc, 0.0);
      this.scanBar(isPaper ? this.beamN : this.beam, (r - nowS.t0) / BEAT);
      const cross = this.tpp[1] >= TPP_THRESHOLD && this.tpp[0] < TPP_THRESHOLD;
      shakeAmp = pulse(s, 0.12, 0.05) * 22 + pulse(s, 0.0, 0.05) * 18 + (cross ? 0 : 0);
      if (!isFinite(this.tpp[1])) shakeAmp = 22 + pulse(s, 0.5, 0.06) * 60;
      flash = Math.max(0.35 * pulse(s, 0, 0.05), (!isFinite(this.tpp[1]) ? 0.8 * pulse(s, 0.5, 0.05) : 0.45 * pulse(s, 0.12, 0.05)));
      ca = 2.5 + 3 * pulse(s, 0.12, 0.08);
      invertFrames = false;
    } else if (k === 'end') {
      const T = shot.t1 - shot.t0;
      this.drawEnd(c, s, T, r);
      shakeAmp = 6; flash = 0; ca = 1.6; invertFrames = false;
      if (n === 1) {
        const kk = ease.inExpo(clamp(s / T));
        zoom = 1 + 0.0 * kk;
      }
    }

    comp.draw(renderer, lay.upload(), out);
    if (this.beam.count) this.beam.render(renderer, out);
    if (this.beamN.count) this.beamN.render(renderer, out);

    // ---- post: shake + flash + CA on the hits, 2-frame inversion punches
    const fi = frameIdx(f.t);
    const e = pulse(s, 0, 0.065);
    const shx = (hash(fi, 3) - 0.5) * 2 * shakeAmp * e, shy = (hash(fi, 4) - 0.5) * 2 * shakeAmp * e;
    let fl = s < 0.14 ? flash * pulse(s, 0, 0.022) : 0;
    if (r < 0.2 && k === 'ev1') fl = Math.max(fl, r < 0.12 ? 1.35 * pulse(r, 0, 0.03) : 0); // land from the white flash
    const inv = invertFrames && s < 2 / 60 + 1e-4 && k !== 'ev1' ? 1 : 0;
    post.shake = [shx, shy];
    post.flash = fl;
    post.invert = inv;
    post.ca = ca * (0.5 + 0.5 * e) + 0.6;
    post.zoom = zoom * (1 + 0.025 * e);
    post.bloom = isPaper ? 0.25 : 0.6;
    post.bloomThreshold = bloomT;
    post.bloomKnee = 0.3;
    post.halation = 0.18;
    post.vignette = isPaper ? 0.15 : 0.3;
    post.paper = isPaper ? 1 : 0;
    post.hud = 0.0;
    return post;
  }

  // echoes (stacked solid copies, no outlines): scaled-up copies behind the main word, re-slammed per beat
  private echo(r: number, s: number, cols: string[], main: string) {
    const out: { dx: number; dy: number; fill: string; sc?: number }[] = [];
    const age = ((r % BEAT) + BEAT) % BEAT;
    for (let j = cols.length; j >= 1; j--) {
      const grow = 1 + 0.06 * j * (1 + age * 2.2);
      out.push({ dx: 0, dy: 0, fill: cols[j - 1] === main ? cols[(j) % cols.length]! : cols[j - 1]!, sc: grow });
    }
    void s;
    return out;
  }

  private scanBar(lb: LineBatch, beatT: number) {
    const ph = beatT - Math.floor(beatT);
    const y = lerp(-40, H + 40, ease.outCubic(clamp(ph / 0.75)));
    const a = 1 - clamp(ph / 0.8);
    const col = LIN.signal;
    lb.seg2(0, y, W, y, 90, [col[0] * 0.25, col[1] * 0.25, col[2] * 0.25], 0.5 * a);
    lb.seg2(0, y, W, y, 14, [col[0] * 1.2, col[1] * 1.2, col[2] * 1.2], 0.9 * a);
    lb.seg2(0, y, W, y, 2, [col[0] * 3, col[1] * 3, col[2] * 3], a);
  }

  private tinyTPP(c: CanvasRenderingContext2D, fg: string, dim: string) {
    c.font = font(F.mono(500), 13); c.fillStyle = dim; c.textBaseline = 'alphabetic';
    c.fillText('LOT 7A-0042 · TPP', 0, 0);
    c.fillRect(0, 8, 300, 2);
    c.fillStyle = HEX.signal; c.fillRect(0, 6, 300 * (this.tpp[0] / 20000), 6);
    c.fillStyle = HEX.red; c.fillRect(300 * (TPP_THRESHOLD / 20000), 2, 2, 14);
    c.font = font(F.mono(600), 22); c.fillStyle = fg;
    c.fillText(isFinite(this.tpp[0]) ? Math.round(this.tpp[0]).toLocaleString('en-US') : '∞', 0, 40);
  }

  private ghostNow(c: CanvasRenderingContext2D, prog: number, col: string) {
    const m = this.M.NOW!;
    c.save();
    c.translate(CX, CY); c.font = font(m.fam, m.size);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const x0 = -m.width / 2, y0 = m.capH / 2;
    c.globalAlpha = 0.09; c.fillStyle = col; c.fillText('NOW', x0, y0);
    c.globalAlpha = 0.3;
    c.beginPath(); c.rect(x0 - 10, -H, (m.width + 20) * prog, H * 2); c.clip();
    c.fillText('NOW', x0, y0);
    c.restore();
  }

  // n=2: the sawblade cuts the frame along its centreline on NOW
  private sawCut(c: CanvasRenderingContext2D, s: number, r: number) {
    void r;
    const p = ease.outExpo(clamp(s / 0.22));
    const x = lerp(-80, W + 80, p);
    c.save();
    c.strokeStyle = HEX.signal; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, CY); c.lineTo(Math.min(x, W), CY); c.stroke();
    c.restore();
    const bb = this.beamN;
    beamHead(bb, x, CY, r, 1.0, 1);
    beamParticles(bb, r, () => ({ x, y: CY }), { rate: 260, life: 0.4, speed: 380, gravity: 800, intensity: 0.9, seed: 9 });
  }

  // n=3: the wafer shatters into dies that fly at the camera, each stamped with a word
  private shrapnel(c: CanvasRenderingContext2D, r: number, front: boolean, fg: string) {
    const wa2 = this.shots.find((x) => x.k === 'wa2')!;
    const tS = wa2.t0;
    const endT = this.shots.find((x) => x.k === 'end')!.t0;
    const names = ['EVERY', 'WAFER', 'IS', 'A', 'WEAPON', 'NOW'];
    const FOC = 1500;
    const spinBase = 0.6 * wa2.t0;
    for (const d of this.dies) {
      const t0 = tS + d.wave * (BEAT / 2) + d.late;
      const tau = r - t0;
      if (tau < 0 || r >= endT) continue;
      const z = d.vz * tau * (1 + 0.25 * tau);
      if (z > FOC - 120) continue;
      const kz = FOC / (FOC - z);
      const isFront = z > 500;
      if (isFront !== front) continue;
      const rot0 = d.wave === 0 ? spinBase : 0;
      const gx0 = d.gx * Math.cos(rot0) - d.gy * Math.sin(rot0), gy0 = d.gx * Math.sin(rot0) + d.gy * Math.cos(rot0);
      const x = CX + (gx0 + d.vx * tau) * kz, y = CY + (gy0 + d.vy * tau) * kz;
      const sz = (DIE_P - 4) * kz;
      if (x < -sz || x > W + sz || y < -sz || y > H + sz) continue;
      const rot = rot0 + d.spin * tau, flip = Math.cos(d.ph + d.spin * tau * 1.3);
      c.save();
      c.translate(x, y); c.rotate(rot); c.scale(flip, 1);
      const amber = (d.word + d.wave) % 3 === 0;
      c.fillStyle = amber ? HEX.signal : HEX.ink2;
      c.fillRect(-sz / 2, -sz / 2, sz, sz);
      c.strokeStyle = amber ? HEX.ember : HEX.signal; c.lineWidth = Math.max(1, 1.5 * kz);
      c.strokeRect(-sz / 2 + 0.5, -sz / 2 + 0.5, sz - 1, sz - 1);
      const name = names[d.word]!;
      const fam = F.archivo(125, 900);
      const fsz = Math.min(sz * 0.8 / (measure(name, fam, 100) / 100), sz * 0.42);
      c.font = font(fam, fsz); c.fillStyle = amber ? HEX.ink : HEX.bone; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(name, 0, 0);
      c.restore();
    }
    void fg;
  }

  // the last 0.47 s: the handoff
  private drawEnd(c: CanvasRenderingContext2D, s: number, T: number, r: number) {
    const q = clamp(s / T);
    if (this.n === 1) {
      // the reticle zooms into the die; the shader draws the lattice, this layer fades the reticle out as the zoom runs
      const kk = ease.inExpo(q);
      const z = Math.exp(lerp(0, Math.log(DIE_ZOOM_END), kk));
      const a = 1 - smoothstep(0.55, 0.9, kk);
      this.drawReticle(c, HEX.signal, 'rgba(255,164,27,0.0)', 1, z, a * (z < 4 ? 1 : 1 / Math.sqrt(z)));
    } else if (this.n === 2) {
      // the sawblade's cut opens: both halves of the final frame slide apart along the kerf
      const kk = ease.inExpo(q);
      for (const sgn of [-1, 1]) {
        c.save();
        c.beginPath();
        if (sgn < 0) c.rect(0, 0, W, CY); else c.rect(0, CY, W, H);
        c.clip();
        c.translate(0, sgn * kk * (H / 2 + 20));
        this.drawTPPBig(c, 1, HEX.ink, 'rgba(10,10,11,0.4)', HEX.bone, true, false);
        c.restore();
      }
      c.strokeStyle = HEX.signal; c.lineWidth = 2 + 10 * kk;
      c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(0, CY); c.lineTo(W, CY); c.stroke();
      c.globalAlpha = 1;
      void r;
    } else {
      // dies settle into a 16 x 9 mosaic of 120 px tiles (node3 fills them with the earlier plates)
      c.fillStyle = HEX.ink; c.fillRect(0, 0, W, H);
      const rnd = mulberry32(31);
      for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) {
        const idx = j * 16 + i;
        const delay = (rnd() * 0.6) * T;
        const p = ease.outExpo(clamp((s - delay * 0.5) / (T * 0.55)));
        const z = (1 - p) * 900, kz = 1500 / (1500 - z);
        const cx = 60 + i * 120, cy = 60 + j * 120;
        const x = CX + (cx - CX) * kz, y = CY + (cy - CY) * kz;
        const sz = 114 * kz;
        c.save(); c.translate(x, y); c.rotate((1 - p) * (hash(idx, 1) - 0.5) * 3);
        c.fillStyle = HEX.ink2; c.fillRect(-sz / 2, -sz / 2, sz, sz);
        c.strokeStyle = HEX.signal; c.globalAlpha = 0.35 + 0.65 * (1 - p); c.lineWidth = 1.5;
        c.strokeRect(-sz / 2 + 0.5, -sz / 2 + 0.5, sz - 1, sz - 1);
        c.restore();
      }
    }
    void keys;
  }
}
