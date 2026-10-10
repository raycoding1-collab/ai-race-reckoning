// CRACK (bars 54-56, 101.25-105.0): "If the shield ever cracks, if the lights go out."
// The flat engraved sheet `dream` ends on develops into a wafer map: dies in the shape of a shield are
// lit like a city at night (every die a block of windows). A hairline nucleates at the shield's top notch
// and creeps; on "cracks," (the sfx at 102.66) it runs the whole wafer along crystal planes (90 degrees
// down a die street, kinking along the {111} planes at 54.7 degrees), the halves draw apart and light
// leaks out of the gap. The camera pulls back; on "the lights go out" the city dies in five waves on the
// 8th notes, each with a surge at its front. Everything fades except one amber point: the top light of
// `whoscrown` (at STAR_PX).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene, sparkHead } from './_motifs';
import { drawBridgeLine } from './atom-kit';
import { STAR_PX } from './whoscrown';
import {
  A111, BRANCHES, DIE, FLAT_Y, MAIN, O_W, T_CRACK, WAVE_R, WAVE_T, WR, crackXSamples, deadR, gapAt, inShield, mainLen, onR, shieldDies, upTo, branchLen, type V2,
} from './crack-kit';

const S_END = 0.71;
const CS_END_Y = STAR_PX.y + WR * S_END;

export default class CrackScene extends Scene {
  layer = new Layer2D();
  lb = new LineBatch(6000, { blend: 'add' });
  pass!: FSPass;
  dies: V2[] = [];

  override init() {
    this.dies = shieldDies();
    this.pass = new FSPass(/* glsl */ `
      uniform vec2 uCs, uO; uniform float uS, uG, uRon, uRdead, uFade, uRrev, uBg, uRim, uT;
      uniform float uCx[24];
      const vec2 DIE = vec2(${DIE.w.toFixed(1)}, ${DIE.h.toFixed(1)});
      const float WR_ = ${WR.toFixed(1)};
      float shieldW(float y) { return y < 0.0 ? 300.0 : 300.0 * pow(max(1.0 - y / 330.0, 0.0), 0.75); }
      bool inShield(vec2 p) { return p.y > -315.0 && p.y < 330.0 && abs(p.x) < shieldW(p.y); }
      float crackX(float y) {
        float f = (y + 420.0) / 40.0;
        if (f < 0.0 || f > 22.999) return 9999.0;
        int i = int(floor(f));
        float a = uCx[i], b = uCx[i + 1];
        if (a > 5000.0 || b > 5000.0) return 9999.0;
        return mix(a, b, fract(f));
      }
      float hatchT(float u, float dark) { // engraved line, faded out before it aliases
        float fw = fwidth(u);
        float f = abs(fract(u) - 0.5);
        float hw = 0.5 * clamp(dark, 0.0, 1.0);
        float a = max(fw, 1e-3);
        float ln = 1.0 - smoothstep(hw - a, hw + a, 0.5 - f);
        float lod = smoothstep(0.34, 0.66, fw);
        return mix(ln, dark * 0.9, lod);
      }
      void main() {
        vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
        vec2 w = (px - uCs) / uS;
        float gapMask = 0.0;
        if (uG > 0.5) {
          float xc = crackX(w.y);
          if (xc < 5000.0) {
            float dx = w.x - xc;
            if (abs(dx) < uG * 0.5) gapMask = 1.0; else w.x += dx < 0.0 ? uG * 0.5 : -uG * 0.5;
          }
        }
        float r = length(w);
        float u = (w.y + 540.0) / 5.0;
        vec3 col = vec3(0.0);
        bool disc = r < WR_ && w.y < ${FLAT_Y.toFixed(1)};
        float revealed = (disc && r < uRrev) ? 1.0 : 0.0;
        // the field outside the wafer: the flat sheet of dream, fading with distance
        float bgA = uBg * (1.0 - smoothstep(560.0, 1250.0, r));
        float bgLn = hatchT(u, 0.08);
        col += heat(0.20) * bgLn * bgA * (1.0 - revealed);
        if (revealed > 0.5) {
          vec2 id = floor(w / DIE);
          vec2 loc = w - id * DIE;
          vec2 cen = (id + 0.5) * DIE;
          bool dieIn = length(abs(cen) + DIE * 0.5) < WR_ - 8.0 && cen.y + DIE.y * 0.5 < ${FLAT_Y.toFixed(1)};
          float bd = min(min(loc.x, DIE.x - loc.x), min(loc.y, DIE.y - loc.y));
          float street = 1.0 - smoothstep(3.0, 5.5, bd);
          bool sh = inShield(cen);
          float dist = length(cen - uO) + (hash12(id + 3.0) - 0.5) * 80.0;
          float on = step(dist, uRon);
          float alive = step(uRdead, dist);
          float lit = on * alive * (sh ? 1.0 : 0.0);
          float surge = (sh && alive > 0.5 && on > 0.5) ? smoothstep(uRdead + 90.0, uRdead, dist) * step(0.0, uRdead) : 0.0;
          float tone = 0.08 + (sh ? 0.08 : 0.0) + 0.16 * lit * (1.0 - 0.0);
          float ln = hatchT(u, tone + 0.20 * surge);
          vec3 lc = heat(0.20 + 0.28 * lit + 0.25 * surge + (sh ? 0.05 : 0.0) + 0.10 * (1.0 - r / WR_));
          float body = dieIn ? 1.0 : 0.55;
          col = lc * ln * (1.0 - 0.80 * street) * body;
          // windows: a city block per die
          vec2 lp = loc - vec2(14.0, 11.0);
          vec2 cell = floor(lp / 10.0);
          if (dieIn && cell.x >= 0.0 && cell.x < 8.0 && cell.y >= 0.0 && cell.y < 4.0) {
            vec2 fp = fract(lp / 10.0) - 0.5;
            float sq = (1.0 - smoothstep(0.26, 0.38, abs(fp.x))) * (1.0 - smoothstep(0.26, 0.38, abs(fp.y)));
            float wh = hash12(id * 7.0 + cell * 1.3 + 11.0);
            float wOn = step(0.40, wh);
            float tw = 0.85 + 0.15 * sin(uT * 3.0 + wh * 40.0);
            vec3 wc = heat(0.62 + 0.30 * hash12(cell + id)) * (1.0 + 2.6 * surge);
            col += wc * sq * wOn * lit * tw * 1.15;
          }
          // the rim of the wafer and the bevel inside it
          float rim = pxLine(abs(r - WR_) * uS, 0.5, 2.3);
          col += heat(0.78) * rim * uRim;
          col += heat(0.34) * pxLine(abs(r - (WR_ - 12.0)) * uS, 0.4, 1.4) * 0.5 * uRim;
        }
        col *= (1.0 - gapMask);
        col *= uFade;
        fragColor = vec4(col, 1.0);
      }`, {
      uCs: { value: new THREE.Vector2(960, 540) }, uO: { value: new THREE.Vector2(O_W.x, O_W.y) }, uS: { value: 1 }, uG: { value: 0 },
      uRon: { value: 0 }, uRdead: { value: -100 }, uFade: { value: 1 }, uRrev: { value: 0 }, uBg: { value: 1 }, uRim: { value: 0 }, uT: { value: 0 },
      uCx: { value: new Array(24).fill(9999) },
    });
  }

  /** screen position of a world point after pull-back, with the halves' separation */
  private scr(p: V2, t: number, s: number, cs: V2, g: number, xc: number | null): V2 {
    let x = p.x;
    if (xc !== null && g > 0.5) x += p.x < xc ? -g / 2 : g / 2;
    return { x: cs.x + x * s, y: cs.y + p.y * s };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, lt = f.lt, T = this.ctx.end - this.ctx.start;
    const line = lineByScene(lyrics, 'crack');
    const kick = f.a.kick;

    // camera (pull-back after the crack has run)
    const pb = ease.inOutCubic(prog(t, 102.95, 103.8));
    const push = 0.05 * ease.inQuad(prog(t, 101.3, T_CRACK));
    const s = lerp(1, S_END, pb) * (1 + push + 0.012 * pulse(t, 101.25, 0.12) + 0.008 * kick + 0.012 * pulse(t, T_CRACK, 0.1));
    const cs = { x: 960, y: lerp(540, CS_END_Y, pb) };
    const g = gapAt(t);
    const xs = crackXSamples(t);
    const fade = 1 - ease.inCubic(prog(t, 104.06, 104.7));
    const Ron = onR(t), Rdead = deadR(t);

    const u = this.pass.u;
    u.uCs!.value.set(cs.x, cs.y);
    u.uS!.value = s; u.uG!.value = g; u.uRon!.value = Ron; u.uRdead!.value = Rdead; u.uFade!.value = fade;
    u.uRrev!.value = WR * 1.2 * ease.outExpo(prog(t, 101.3, 102.05));
    u.uBg!.value = lerp(0.9, 0.18, ease.outCubic(prog(t, 101.3, 102.2))) * (1 - ease.inCubic(prog(t, 103.9, 104.5)));
    u.uRim!.value = ease.outCubic(prog(t, 101.5, 102.2));
    u.uT!.value = t;
    (u.uCx!.value as number[]).splice(0, 24, ...xs);
    this.pass.render(renderer, out);

    // ---- lines: the crack with its leak, tip sparks, the lone survivor
    const lb = this.lb; lb.clear();
    const flick = 0.78 + 0.22 * hash(frameIdx(t), 5);
    const live = 1 - smoothstep(104.0, 104.35, t);
    const edges = (path0: V2[], width: number, I: number, a: number, shift: boolean) => {
      const path = clipDisc(path0);
      for (let i = 1; i < path.length; i++) {
        const A = this.scr(path[i - 1]!, t, s, cs, g, shift ? xcAt(path[i - 1]!.y, xs) : null);
        const B = this.scr(path[i]!, t, s, cs, g, shift ? xcAt(path[i]!.y, xs) : null);
        lb.seg2(A.x, A.y, B.x, B.y, width, [LIN.signal[0] * I * flick, LIN.signal[1] * I * flick, LIN.signal[2] * I * flick], a);
      }
    };
    const Lm = mainLen(t);
    if (Lm <= 0.5) { const o = this.scr(O_W, t, s, cs, 0, null); sparkHead(lb, o.x, o.y, t, 0.5, 0.8); }
    const dim = (1 - smoothstep(104.0, 104.4, t)) * (1 - 0.0);
    if (Lm > 0.5) {
      const mp = clipDisc(upTo(MAIN, Lm));
      if (g < 1) {
        edges(mp, 1.3, 2.4, 1 * dim, false);
        edges(mp, 6, 0.55, 0.5 * dim, false);
        // the hot hairline: bright from the tip back
      } else {
        // two lips with the leak between them: draw the polyline displaced to each side
        for (const side of [-1, 1]) {
          const pts = mp.map((p) => ({ x: p.x + side * g / 2, y: p.y }));
          for (let i = 1; i < pts.length; i++) {
            const A = this.scr(pts[i - 1]!, t, s, cs, 0, null), B = this.scr(pts[i]!, t, s, cs, 0, null);
            lb.seg2(A.x, A.y, B.x, B.y, 1.4, [LIN.signal[0] * 2.6 * flick, LIN.signal[1] * 2.6 * flick, LIN.signal[2] * 2.6 * flick], dim);
            lb.seg2(A.x, A.y, B.x, B.y, 8, [LIN.signal[0] * 0.5 * flick, LIN.signal[1] * 0.5 * flick, LIN.signal[2] * 0.5 * flick], 0.5 * dim);
          }
        }
        // light spilling out of the gap, between the lips
        const mid = mp.map((p) => this.scr(p, t, s, cs, 0, null));
        for (let i = 1; i < mid.length; i++) lb.seg2(mid[i - 1]!.x, mid[i - 1]!.y, mid[i]!.x, mid[i]!.y, Math.max(2, g * s - 3), [LIN.ember[0] * 0.7 * flick, LIN.ember[1] * 0.7 * flick, LIN.ember[2] * 0.7 * flick], 0.4 * dim);
      }
      // growing tip
      if (t < T_CRACK + 0.5) { const tip = this.scr(mp[mp.length - 1]!, t, s, cs, 0, null); sparkHead(lb, tip.x, tip.y, t, 0.5 + 0.7 * Math.min(1, Lm / 130), 0.8); }
    }
    BRANCHES.forEach((b, i) => {
      const L = branchLen(i, t);
      if (L < 0.5) return;
      const pts = upTo(b.path, L);
      edges(pts, 1.2, 2.0, dim, true);
      edges(pts, 5, 0.4, 0.45 * dim, true);
      if (L < b.path.total - 1) { const tip = this.scr(pts[pts.length - 1]!, t, s, cs, g, xcAt(pts[pts.length - 1]!.y, xs)); sparkHead(lb, tip.x, tip.y, t, 0.45, 0.7); }
    });
    // stress rings: one hairline circle leaves the notch on every beat while the crack creeps
    if (t > 101.4 && t < T_CRACK + 0.2) {
      const o = this.scr(O_W, t, s, cs, 0, null);
      const k0 = Math.ceil((t - 1.6) / 0.46875);
      for (let k = k0; k * 0.46875 <= t; k++) {
        const age = t - k * 0.46875;
        if (age < 0 || age > 1.6) continue;
        const rr = 260 * s * ease.outCubic(age / 1.6), a = (1 - age / 1.6) * 0.5 * smoothstep(101.4, 101.8, t);
        const n = 72;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          lb.seg2(o.x + Math.cos(a0) * rr, o.y + Math.sin(a0) * rr, o.x + Math.cos(a1) * rr, o.y + Math.sin(a1) * rr, 1, [LIN.signal[0], LIN.signal[1], LIN.signal[2]], a);
        }
      }
    }
    // the survivor: the one point that stays (it is the top light of whoscrown)
    if (t > 104.2) {
      const k = ease.outCubic(prog(t, 104.2, 104.95));
      sparkHead(lb, STAR_PX.x, STAR_PX.y, t, lerp(0.25, 0.7, k), lerp(0.2, 0.55, k));
    }
    lb.render(renderer, out);

    // ---- type, gauge, kink label
    const Lr = this.layer; Lr.clear();
    const c = Lr.ctx;
    c.save();
    c.textBaseline = 'alphabetic';
    // site load: the city's dies that are still lit
    const alive = this.dies.filter((d) => Math.hypot(d.x - O_W.x, d.y - O_W.y) >= Rdead && Math.hypot(d.x - O_W.x, d.y - O_W.y) < Ron).length;
    const load = 1.2 * (alive / this.dies.length);
    const gA = ease.outCubic(prog(t, 101.4, 101.9)) * (1 - smoothstep(104.3, 104.7, t));
    c.globalAlpha = gA;
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.5);
    c.fillText('SITE LOAD', 96, 70);
    c.font = font(F.mono(500), 40); c.letterSpacing = '0px';
    c.fillStyle = load < 0.01 ? rgba('bone', 0.5) : rgba('bone', 0.95);
    c.fillText(`${load.toFixed(2)} GW`, 96, 118);
    c.fillStyle = rgba('bone', 0.18); c.fillRect(96, 134, 200, 2);
    c.fillStyle = rgba('signal', 0.95); c.fillRect(96, 133, 200 * (load / 1.2), 4);
    // the plane label at the first kink
    const k1 = MAIN.pts[2]!;
    const lab = ease.outCubic(prog(t, T_CRACK + 0.25, T_CRACK + 0.55)) * (1 - smoothstep(103.9, 104.2, t));
    if (lab > 0.01 && g > 1) {
      const q = this.scr(k1, t, s, cs, 0, null);
      c.globalAlpha = lab;
      c.strokeStyle = rgba('bone', 0.6); c.lineWidth = 1;
      c.setLineDash([3, 4]); c.beginPath(); c.moveTo(q.x - 20, q.y); c.lineTo(q.x + 150, q.y); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(q.x, q.y, 54 * s, 0, (A111 * Math.PI) / 180); c.stroke();
      c.font = font(F.mono(500), 14); c.letterSpacing = '1.5px'; c.fillStyle = rgba('bone', 0.8);
      c.fillText('{111} · 54.7°', q.x + 64, q.y + 30);
      c.font = font(F.mono(400), 11); c.fillStyle = rgba('bone', 0.4);
      c.fillText('cleavage plane, silicon', q.x + 64, q.y + 48);
    }
    c.globalAlpha = 1;
    c.restore();
    drawBridgeLine(c, line, t, { x: W / 2, y: 984, size: 62, align: 'center', dim: 0.32, lead: 0.3, alpha: 1 - smoothstep(104.3, 104.7, t) });
    comp.draw(renderer, Lr.upload(), out);

    // ---- post: the crack lands hard, every wave surges
    const hit = pulse(t, T_CRACK, 0.07);
    let wv = 0;
    for (const tw of WAVE_T) wv = Math.max(wv, pulse(t, tw, 0.06));
    return {
      bloom: 0.7 + 0.5 * hit, bloomThreshold: 0.8, vignette: 0.45, ca: 0.4 + 2.5 * hit + 0.8 * wv,
      flash: 0.10 * hit + 0.04 * wv,
      shake: [(hash(frameIdx(t), 1) - 0.5) * 22 * hit, (hash(frameIdx(t), 2) - 0.5) * 22 * hit],
    };
  }
}

/** clip a polyline (world px) to the wafer disc, keeping the part inside */
function clipDisc(pts: V2[]): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const inside = Math.hypot(p.x, p.y) < WR - 2 && p.y < FLAT_Y;
    if (inside) { out.push(p); continue; }
    if (i > 0 && Math.hypot(pts[i - 1]!.x, pts[i - 1]!.y) < WR - 2 && pts[i - 1]!.y < FLAT_Y) {
      const a = pts[i - 1]!;
      let lo = 0, hi = 1;
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; const x = a.x + (p.x - a.x) * m, y = a.y + (p.y - a.y) * m; if (Math.hypot(x, y) < WR - 2 && y < FLAT_Y) lo = m; else hi = m; }
      out.push({ x: a.x + (p.x - a.x) * lo, y: a.y + (p.y - a.y) * lo });
    }
    break;
  }
  return out;
}

/** x of the main crack at world y (null when it has not reached it) */
function xcAt(y: number, xs: number[]): number | null {
  const f = (y + 420) / 40;
  if (f < 0 || f > 22.999) return null;
  const i = Math.floor(f);
  const a = xs[i]!, b = xs[i + 1]!;
  if (a > 5000 || b > 5000) return null;
  return lerp(a, b, f - i);
}
void WAVE_R; void inShield; void clamp;
