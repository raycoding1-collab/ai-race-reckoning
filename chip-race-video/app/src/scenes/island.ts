// island (bars 30-32): "One little island, one narrow sea".
// Idiom: NAUTICAL CHART, bone paper engraving. Ink coast-lining, isobaths, soundings, graticule and rhumb lines
// are all derived from one baked field (island-geo.ts); the island is the only amber-lit thing. A pair of
// dividers stabs the strait and measures 130 km. The camera turns over the chart like a navigator's, then
// flies to the compass rose, the chart dissolves and the rose is the handoff to the key's bow.
//  in : smuggle's sand column (30 px wide, x = W/2, y 0..H/2) pours onto the sea; ripples engrave the chart outward.
//  out: bare bone paper with the compass rose at (ROSE_END.x, ROSE_END.y), outer radius ROSE_END.r, north up
//       (key's first frame draws the same paper and rose).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, pulse, smoothstep, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { buildGeo, drawRose, kmOf, ROSE_END, END_Z, type P } from './island-geo';
import { PAPER_GLSL } from './island-paper';
import { mono } from './hbm-kit';

export { ROSE_END, END_Z };
export const SMUGGLE_COL = { x: W / 2, w: 30, yEnd: H / 2 };
const INK = '#0A0A0B';

const CHART = /* glsl */ `
${PAPER_GLSL}
uniform sampler2D tField; uniform vec2 fMin; uniform vec2 fSize;
uniform vec2 kc; uniform float zoom; uniform float rot; uniform float t;
uniform vec2 impact; uniform float revealR; uniform float islandLit; uniform float chartA; uniform vec2 roseKm; uniform float roseKmR;
uniform float lift; uniform float tipFlash; uniform vec2 colTop;
const float COSL = ${Math.cos((25 * Math.PI) / 180).toFixed(6)};
float hl(float d, float a, float b){ return 1.0 - smoothstep(a, b, d); }
vec4 field(vec2 c){ vec2 uv = (c - fMin) / fSize; vec4 f = texture(tField, uv); return vec4(f.xy * 100.0, f.z * 1000.0, f.w); }
void main(){
  vec2 Ps = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y) - vec2(960.0, 540.0);
  float cr = cos(rot), sr = sin(rot);
  vec2 c = kc + vec2(Ps.x * cr + Ps.y * sr, -Ps.x * sr + Ps.y * cr) / zoom;
  vec4 F = field(c);
  float sT = F.x, sO = F.y, depth = F.z, elev = F.w;
  float s = min(sT, sO);
  bool land = s < 0.0, tai = sT < 0.0;
  float pxkm = zoom;
  vec3 paper = paperCol(c * 3.0);
  float dist = length(c - impact);
  // reveal: everything inside the ring is engraved
  float vis = chartA * (1.0 - smoothstep(revealR - 26.0, revealR, dist));
  float inkA = 0.0;          // black ink
  float umber = 0.0;         // umber (island relief)
  float amberA = 0.0;        // amber wash
  // --- coast line and coast lining
  float dpx = s * pxkm;
  inkA = max(inkA, hl(abs(dpx), 0.7, 1.7) * 0.95);
  if (!land) {
    float q = log(1.0 + s / 1.1) / log(1.5);
    float dq = fwidth(q);
    float lq = abs(fract(q + 0.5) - 0.5) / max(dq, 1e-4);
    float lining = pxLine(lq, 0.35, 1.2) * step(0.6, q) * (1.0 - smoothstep(4.2, 6.5, q));
    inkA = max(inkA, lining * (0.85 - 0.1 * q));
    // isobaths
    float lv[10] = float[10](10.0, 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 3000.0, 4000.0);
    float fd = max(fwidth(depth), 1e-3);
    for (int i = 0; i < 10; i++) {
      float d = abs(depth - lv[i]) / fd;
      float major = (i == 3 || i == 6) ? 1.0 : 0.0;
      inkA = max(inkA, pxLine(d, 0.3 + 0.4 * major, 1.0 + 0.7 * major) * (0.50 + 0.35 * major) * step(2.0, s));
    }
    // shoal stipple and a depth wash
    vec2 sc = floor(c * pxkm / 7.0);
    float stip = step(hash12(sc), 0.16) * hl(length(fract(c * pxkm / 7.0) - 0.5) * 7.0, 0.5, 1.4) * (1.0 - smoothstep(20.0, 45.0, depth)) * step(3.0, s);
    inkA = max(inkA, stip * 0.7);
    paper *= 1.0 - 0.05 * smoothstep(0.0, 900.0, depth);
  } else if (!tai) {
    // mainland and islets: fine elevation contours
    float e10 = elev * 12.0;
    float de = abs(fract(e10 + 0.5) - 0.5) / max(fwidth(e10), 1e-4);
    inkA = max(inkA, pxLine(de, 0.3, 1.0) * 0.40 * step(1.5, -s));
    // coast hachures: short ticks perpendicular to the shore
    float hq = c.x * 0.9 + c.y * 0.9;
    inkA = max(inkA, hl(abs(s + 0.9) * pxkm, 0.2, 0.9) * 0.0);
  } else {
    // Taiwan: relief hatching, contours, amber wash
    vec2 e = vec2(1.6, 0.0);
    float gx = field(c + e.xy).w - field(c - e.xy).w, gy = field(c + e.yx).w - field(c - e.yx).w;
    float shade = clamp(0.5 + 2.2 * dot(vec2(gx, gy), normalize(vec2(-1.0, -1.0))), 0.0, 1.0);
    float rel = hatch(dot(c, vec2(0.7071, 0.7071)) * 1.1 * pxkm / 3.2, shade * 0.62) * smoothstep(0.02, 0.35, elev);
    float e5 = elev * 5.0;
    float dec = abs(fract(e5 + 0.5) - 0.5) / max(fwidth(e5), 1e-4);
    float cont = pxLine(dec, 0.3, 1.0);
    float major = abs(fract(elev + 0.5) - 0.5) / max(fwidth(elev), 1e-4);
    cont = max(cont * 0.65, pxLine(major, 0.5, 1.3) * 0.95) * step(0.03, elev);
    // flood-lit from the north tip southward
    float ny = (c.y + 34.0) / (340.0 + 34.0);
    float lit = 1.0 - smoothstep(islandLit - 0.05, islandLit + 0.002, ny);
    amberA = (0.78 + 0.18 * smoothstep(0.0, 3.5, elev)) * lit;
    umber = max(cont, rel * 0.8) * lit;
    inkA = max(inkA, max(cont * (1.0 - lit) * 0.55, rel * (1.0 - lit) * 0.4));
  }
  // --- graticule: whole degrees, hairline
  {
    float lon = 121.0 + c.x / (COSL * 111.32), lat = 25.0 - c.y / 110.57;
    float dlon = abs(fract(lon + 0.5) - 0.5) * COSL * 111.32 * pxkm;
    float dlat = abs(fract(lat + 0.5) - 0.5) * 110.57 * pxkm;
    float g = max(hl(dlon, 0.35, 1.0), hl(dlat, 0.35, 1.0));
    // minute ticks along the lines (every 10')
    float tl = abs(fract(lon * 6.0 + 0.5) - 0.5) * (COSL * 111.32 / 6.0) * pxkm;
    float tk = abs(fract(lat * 6.0 + 0.5) - 0.5) * (110.57 / 6.0) * pxkm;
    float ticks = max(hl(tl, 0.3, 0.9) * hl(dlat, 0.0, 6.0), hl(tk, 0.3, 0.9) * hl(dlon, 0.0, 6.0));
    inkA = max(inkA, max(g * 0.38, ticks * 0.55));
  }
  // --- rhumb lines from the rose (32 rays)
  {
    vec2 v = c - roseKm; float rr = length(v);
    float ang = atan(v.x, -v.y);
    float step32 = TAU / 32.0;
    float k = floor(ang / step32 + 0.5);
    float dpx2 = abs(sin(ang - k * step32)) * rr * pxkm;
    float major = (mod(k, 4.0) < 0.5) ? 1.0 : 0.0;
    float rh = hl(dpx2, 0.3, 0.95) * smoothstep(roseKmR * 1.32, roseKmR * 1.42, rr) * exp(-rr / 650.0) * (0.34 + 0.2 * major);
    inkA = max(inkA, rh * (land ? 0.6 : 1.0));
  }
  // --- ripples around the impact and the leading ring
  float lead = 0.0, ripple = 0.0;
  {
    float edge = abs(dist - revealR) * pxkm;
    lead = hl(edge, 0.8, 2.4) * (1.0 - smoothstep(0.0, 1.0, revealR / 520.0));
    for (int i = 1; i < 6; i++) {
      float rr = revealR - float(i) * 16.0 + 2.0 * sin(float(i) * 3.0 + atan(c.y - impact.y, c.x - impact.x) * 3.0);
      ripple = max(ripple, hl(abs(dist - rr) * pxkm, 0.3, 1.1) * (1.0 - float(i) / 6.0) * step(0.0, rr));
    }
    ripple *= (1.0 - smoothstep(380.0, 520.0, revealR)) * chartA;
  }
  float ink = clamp(max(inkA * vis, ripple * 0.8), 0.0, 1.0);
  vec3 col = paper;
  col *= mix(vec3(1.0), vec3(1.0, 0.58, 0.08), clamp(amberA * vis, 0.0, 1.0));
  col *= mix(vec3(1.0), vec3(0.48, 0.24, 0.05), clamp(umber * vis, 0.0, 1.0));
  col *= 1.0 - ink * 0.93;
  // amber light bleeding into the sea around the lit island
  float bleed = exp(-max(sT, 0.0) / 7.0) * step(0.0, sT) * islandLit * vis;
  col += vec3(1.0, 0.45, 0.05) * bleed * 0.07;
  col += vec3(1.0, 0.55, 0.1) * lead * 0.65 * chartA;
  // handoff in: the sand column
  float cw = ${(SMUGGLE_COL.w / 2).toFixed(1)};
  float colM = step(abs(FRAG_PX.x - 960.0), cw) * step(1080.0 - FRAG_PX.y, ${SMUGGLE_COL.yEnd.toFixed(1)}) * colTop.x;
  vec3 cc = C_SIGNAL * 1.15 + C_EMBER * 0.5 * exp(-pow((FRAG_PX.x - 960.0) / (cw * 0.5), 2.0));
  col = mix(col, cc, colM);
  col *= 1.0 - 0.18 * smoothstep(0.55, 1.0, length((vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y) - vec2(960.0, 540.0)) / vec2(1100.0, 640.0)));
  fragColor = vec4(col, 1.0);
}`;

interface Pose { kx: number; ky: number; z: number; rot: number }

export default class Island extends Scene {
  chart!: FSPass;
  text = new Layer2D();
  geo = buildGeo();
  lineRef: any;
  soundings: { p: P; txt: string }[] = [];
  T0 = 0;

  override async init() {
    this.T0 = this.ctx.start;
    this.lineRef = lineByScene(this.ctx.lyrics, 'island');
    const g = this.geo;
    this.chart = new FSPass(CHART, {
      tField: { value: g.field.tex }, fMin: { value: new THREE.Vector2(g.field.min.x, g.field.min.y) }, fSize: { value: new THREE.Vector2(g.field.size.x, g.field.size.y) },
      kc: { value: new THREE.Vector2() }, zoom: { value: 2.3 }, rot: { value: 0 }, t: { value: 0 }, impact: { value: new THREE.Vector2() }, revealR: { value: 0 },
      islandLit: { value: 0 }, chartA: { value: 1 }, roseKm: { value: new THREE.Vector2(g.rose.x, g.rose.y) }, roseKmR: { value: ROSE_END.r / END_Z },
      lift: { value: 0 }, tipFlash: { value: 0 }, colTop: { value: new THREE.Vector2(1, 0) },
    });
    // soundings on a jittered lattice
    const step = 21;
    for (let y = g.field.min.y + 10; y < g.field.min.y + g.field.size.y - 10; y += step)
      for (let x = g.field.min.x + 10; x < g.field.min.x + g.field.size.x - 10; x += step) {
        const jx = (hash(x, y, 1) - 0.5) * step * 0.8, jy = (hash(x, y, 2) - 0.5) * step * 0.8;
        const p = { x: x + jx, y: y + jy };
        if (hash(x, y, 3) < 0.25) continue;
        const s = g.seaDist(p);
        if (s < 3.5) continue;
        const d = g.depthAt(p);
        const txt = d < 40 ? d.toFixed(0) : d < 400 ? String(Math.round(d)) : String(Math.round(d / 10) * 10);
        this.soundings.push({ p, txt });
      }
  }

  /** The camera poses (km centre, px/km, rotation rad) at each shot. */
  poses(): { t: number; pose: Pose }[] {
    const g = this.geo, W0 = this.ctx.start;
    const mid = g.mid;
    const taiwanC = kmOf(121.0, 23.7);
    const rad = (d: number) => (d * Math.PI) / 180;
    const roseKc = { x: g.rose.x - (ROSE_END.x - 960) / END_Z, y: g.rose.y - (ROSE_END.y - 540) / END_Z };
    return [
      { t: W0, pose: { kx: mid.x, ky: mid.y, z: 2.4, rot: rad(-7) } },
      { t: W0 + 0.7, pose: { kx: taiwanC.x - 40, ky: taiwanC.y - 40, z: 2.1, rot: rad(-3) } },
      { t: W0 + 1.4, pose: { kx: mid.x + 6, ky: mid.y - 8, z: 3.9, rot: rad(4) } },
      { t: W0 + 2.11, pose: { kx: mid.x + 14, ky: mid.y - 16, z: 3.55, rot: rad(9) } },
      { t: W0 + 2.81, pose: { kx: roseKc.x, ky: roseKc.y, z: END_Z, rot: 0 } },
    ];
  }

  camAt(t: number): Pose {
    const shots = this.poses();
    let cur = shots[0]!.pose;
    for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1]!.pose, b = shots[i]!;
      if (t < b.t) break;
      const last = i === shots.length - 1;
      const dur = last ? this.ctx.end - b.t : 0.16;
      const e = last ? ease.inOutCubic(clamp((t - b.t) / dur)) : ease.outExpo(clamp((t - b.t) / dur));
      const n = b.pose;
      cur = { kx: lerp(a.kx, n.kx, e), ky: lerp(a.ky, n.ky, e), z: lerp(a.z, n.z, e), rot: lerp(a.rot, n.rot, e) };
      if (e < 1) break;
    }
    // slow navigator's turn between snaps
    const drift = clamp((t - this.T0) / (this.ctx.end - this.T0));
    return { ...cur, rot: cur.rot + (t < this.T0 + 2.81 ? 0.05 * Math.sin(drift * Math.PI) : 0) };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, T0 = this.T0, lt = t - T0, END = this.ctx.end;
    const g = this.geo;
    const cam = this.camAt(t);
    const words = this.lineRef.words as any[];
    const wIsland = words[2], wOne2 = words[3], wNarrow = words[4], wSea = words[5];
    // handoff in: ripples spread from the impact point; the sand column retracts to nothing in 0.2 s
    const impact = { x: cam.kx, y: cam.ky }; // fixed chart point: the strait centre
    const imp = g.mid;
    const reveal = lerp(0, 760, ease.outCubic(clamp(lt / 1.35)));
    const flood = ease.inOutCubic(clamp((t - wIsland.start) / 1.5));
    const fade = 1 - smoothstep(END - 1.0, END - 0.35, t); // chart dissolves into bare paper
    const u = this.chart.u;
    (u.kc!.value as THREE.Vector2).set(cam.kx, cam.ky);
    u.zoom!.value = cam.z; u.rot!.value = cam.rot; u.t!.value = t;
    (u.impact!.value as THREE.Vector2).set(imp.x, imp.y);
    u.revealR!.value = reveal; u.islandLit!.value = flood; u.chartA!.value = fade;
    (u.colTop!.value as THREE.Vector2).set(1 - smoothstep(0.0, 0.16, lt), 0);
    this.chart.render(renderer, out);

    // ---- 2D overlay
    const tx = this.text; tx.clear(); const c = tx.ctx;
    const toScreen = (p: P) => {
      const dx = (p.x - cam.kx) * cam.z, dy = (p.y - cam.ky) * cam.z, cr = Math.cos(cam.rot), sr = Math.sin(cam.rot);
      return { x: 960 + dx * cr - dy * sr, y: 540 + dx * sr + dy * cr };
    };
    const chartTx = () => { c.translate(960, 540); c.rotate(cam.rot); c.scale(cam.z, cam.z); c.translate(-cam.kx, -cam.ky); };
    c.save();
    c.globalAlpha = fade;
    // chart-space layer: soundings, names, rose
    {
      c.save(); chartTx();
      const inv = 1 / cam.z;
      c.font = font(F.mono(400, true), 11 * inv); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const s of this.soundings) {
        const d = Math.hypot(s.p.x - imp.x, s.p.y - imp.y);
        if (d > reveal - 20) continue;
        const sp = toScreen(s.p);
        if (sp.x < 40 || sp.x > W - 40 || sp.y < 40 || sp.y > H - 40) continue;
        // keep clear of the lyric cartouche and the rose
        if (sp.x < 1330 && sp.y > 715) continue;
        if (Math.hypot(s.p.x - g.rose.x, s.p.y - g.rose.y) < (ROSE_END.r / END_Z) * 1.5) continue;
        c.fillStyle = rgba(INK, 0.62);
        c.fillText(s.txt, s.p.x, s.p.y);
      }
      // names, set in spaced serif capitals
      const label = (txt: string, lon: number, lat: number, size: number, spacing: number, rot: number, a: number, family = F.serif(600, true)) => {
        const p = kmOf(lon, lat);
        if (Math.hypot(p.x - imp.x, p.y - imp.y) > reveal - 40) return;
        c.save(); c.translate(p.x, p.y); c.rotate(rot);
        c.font = font(family, size); (c as any).letterSpacing = `${spacing}px`;
        c.fillStyle = rgba(INK, a); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, 0, 0); (c as any).letterSpacing = '0px';
        c.restore();
      };
      const tl = clamp((t - wIsland.start - 0.2) / 0.3);
      label('TAIWAN', 120.98, 23.75, 40, 14, rad(-72), 0.9 * tl, F.serif(600, true));
      label('TAIWAN  STRAIT', 119.72, 24.55, 15, 6, rad(-70), 0.7);
      label('CHINA', 118.0, 26.0, 26, 10, 0, 0.55);
      label('PACIFIC  OCEAN', 123.1, 25.9, 20, 9, rad(-18), 0.55);
      label('BASHI  CHANNEL', 121.2, 21.35, 15, 6, 0, 0.6);
      label('Penghu', 119.58, 23.9, 8, 1, 0, 0.7, F.serif(400, true));
      // rose
      const ra = clamp((t - T0 - 0.5) / 0.5);
      drawRose(c, g.rose.x, g.rose.y, ROSE_END.r / END_Z, 0, INK, { alpha: ra });
      mono(c, 'VAR 3° 20′ W', g.rose.x - 18, g.rose.y + (ROSE_END.r / END_Z) * 1.38, 8 * inv * 1.4, rgba(INK, 0.6 * ra), 500, 'left', 0.5);
      c.restore();
    }
    c.restore();
    function rad(d: number) { return (d * Math.PI) / 180; }

    // dividers (screen space, over everything chart-ish)
    this.drawDividers(c, t, cam, toScreen, fade);
    c.save(); c.globalAlpha = fade;
    // screen furniture: neatline and scale bar, header
    c.strokeStyle = rgba(INK, 0.8); c.lineWidth = 1.2; c.strokeRect(64.5, 64.5, W - 129, H - 129);
    c.lineWidth = 0.8; c.strokeRect(70.5, 70.5, W - 141, H - 141);
    mono(c, 'CHART 7A-0042 · TAIWAN STRAIT · SOUNDINGS IN METRES · STEP 17/31', 96, 98, 12, rgba(INK, 0.75), 500, 'left', 1.2);
    {
      const targetPx = 380, kms = [10, 20, 25, 50, 100, 200];
      let L = kms[0]!; for (const k of kms) if (k * cam.z <= targetPx) L = k;
      const x0 = W - 96 - L * cam.z, y0 = H - 104;
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? rgba(INK, 0) : rgba(INK, 0.9); c.fillRect(x0 + (i * L * cam.z) / 4, y0, (L * cam.z) / 4, 5); }
      c.strokeStyle = rgba(INK, 0.9); c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, L * cam.z, 5);
      mono(c, '0', x0, y0 - 6, 11, rgba(INK, 0.8), 500, 'center'); mono(c, `${L} km`, x0 + L * cam.z, y0 - 6, 11, rgba(INK, 0.8), 500, 'right');
    }
    c.restore();
    // lyric cartouche (screen space): ink on a paper block, amber highlighter sweeps behind the sung word
    this.drawCartouche(c, t, words, fade);
    comp.draw(renderer, tx.upload(), out);
    const kickP = pulse(t, T0 + 1.4, 0.1);
    return { paper: 1, bloom: 0.1, bloomThreshold: 1.6, halation: 0.05, vignette: 0.25, grain: 0.05, ca: 0.6 + 2 * kickP, zoom: 1 + 0.02 * kickP, shake: [Math.sin(t * 150) * 4 * kickP, Math.cos(t * 130) * 5 * kickP] as [number, number] };
  }

  drawDividers(c: CanvasRenderingContext2D, t: number, cam: Pose, toScreen: (p: P) => { x: number; y: number }, fade: number) {
    const g = this.geo, words = this.lineRef.words as any[];
    const stabT = words[3].start;
    if (t < stabT - 0.7) return;
    const u = ease.outExpo(clamp((t - (stabT - 0.5)) / 0.5));
    const A = toScreen(g.tipA), B = toScreen(g.tipB);
    const drop = (1 - u) * 900 + 10 * Math.exp(-Math.max(0, t - stabT) / 0.08) * Math.cos(Math.max(0, t - stabT) * 60);
    const span = Math.hypot(B.x - A.x, B.y - A.y);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 - drop;
    const Ld = Math.max(span * 1.12, 520);
    const hgt = Math.sqrt(Math.max(1, Ld * Ld - (span / 2) * (span / 2)));
    const ux = (B.x - A.x) / span, uy = (B.y - A.y) / span;
    let nx = uy, ny = -ux; if (ny > 0) { nx = -nx; ny = -ny; }
    const apex = { x: mx + nx * hgt, y: my + ny * hgt };
    const tipA = { x: A.x, y: A.y - drop }, tipB = { x: B.x, y: B.y - drop };
    c.save(); c.globalAlpha = fade * clamp((t - (stabT - 0.7)) / 0.15);
    const leg = (tip: { x: number; y: number }, side: number) => {
      const dx = apex.x - tip.x, dy = apex.y - tip.y, l = Math.hypot(dx, dy), px = -dy / l, py = dx / l;
      c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(apex.x + px * 15, apex.y + py * 15); c.lineTo(apex.x - px * 15, apex.y - py * 15); c.closePath();
      c.fillStyle = rgba(INK, 0.94); c.fill();
      // engraved highlight along the leg
      c.strokeStyle = rgba('bone', 0.55); c.lineWidth = 1.4; c.beginPath(); c.moveTo(tip.x + px * 0.3, tip.y + py * 0.3); c.lineTo(apex.x + px * 6 * side, apex.y + py * 6 * side); c.stroke();
      c.strokeStyle = rgba('bone', 0.25); c.lineWidth = 1;
      for (let k = 1; k < 9; k++) { const q = k / 9; const x = lerp(tip.x, apex.x, q), y = lerp(tip.y, apex.y, q), w = 15 * q; c.beginPath(); c.moveTo(x - px * w, y - py * w); c.lineTo(x + px * w, y + py * w); c.stroke(); }
    };
    leg(tipA, -1); leg(tipB, 1);
    // hinge: a screw with a slot, amber jewel
    c.fillStyle = rgba(INK, 1); c.beginPath(); c.arc(apex.x, apex.y, 24, 0, TAU); c.fill();
    c.strokeStyle = rgba('bone', 0.8); c.lineWidth = 1.4; c.beginPath(); c.arc(apex.x, apex.y, 17, 0, TAU); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(apex.x - 12, apex.y - 5); c.lineTo(apex.x + 12, apex.y + 5); c.stroke();
    c.fillStyle = rgba('signal', 1); c.beginPath(); c.arc(apex.x, apex.y, 4, 0, TAU); c.fill();
    c.restore();
    // puncture marks and the dimension line, once the points have landed
    if (t >= stabT) {
      c.save(); c.globalAlpha = fade;
      const a = clamp((t - stabT) / 0.1);
      for (const q of [A, B]) {
        c.strokeStyle = rgba(INK, 0.9 * a); c.lineWidth = 1.4;
        const r = 14 + 40 * (1 - Math.exp(-(t - stabT) / 0.12));
        c.globalAlpha = fade * Math.exp(-(t - stabT) / 0.25);
        c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.stroke();
        c.globalAlpha = fade;
        c.fillStyle = rgba('signal', 1); c.beginPath(); c.arc(q.x, q.y, 6, 0, TAU); c.fill();
        c.strokeStyle = rgba(INK, 1); c.lineWidth = 1.4; c.beginPath(); c.arc(q.x, q.y, 6, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(q.x - 18, q.y); c.lineTo(q.x + 18, q.y); c.moveTo(q.x, q.y - 18); c.lineTo(q.x, q.y + 18); c.stroke();
      }
      // dimension line with end ticks, drawn out as "narrow" is sung
      const wn = words[4], dl = clamp((t - wn.start) / 0.3);
      if (dl > 0) {
        const ex = lerp(A.x, B.x, ease.outCubic(dl)), ey = lerp(A.y, B.y, ease.outCubic(dl));
        c.strokeStyle = rgba(INK, 1); c.lineWidth = 2;
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(ex, ey); c.stroke();
        // value
        const km = 130 * ease.outCubic(clamp((t - wn.start) / 0.5));
        const label = `${km.toFixed(km >= 129.95 ? 0 : 1)} km`;
        const sz = 74;
        c.save(); c.translate((A.x + B.x) / 2, (A.y + B.y) / 2 - 56);
        c.rotate(Math.atan2(B.y - A.y, B.x - A.x) * 0.0);
        c.font = font(F.archivo(100, 900), sz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        const wd = c.measureText('130 km').width;
        c.fillStyle = rgba('signal', 1); c.fillRect(-wd / 2 - 14, -sz * 0.78, wd + 28, sz * 0.98);
        c.fillStyle = rgba(INK, 1); c.fillText(label, 0, 0);
        c.font = font(F.mono(500), 13); c.fillStyle = rgba(INK, 0.9); c.fillText('= 70.2 NM · NARROWEST POINT OF THE STRAIT', 0, 30);
        c.restore();
      }
      c.restore();
    }
  }

  drawCartouche(c: CanvasRenderingContext2D, t: number, words: any[], fade: number) {
    const rows = [words.slice(0, 3), words.slice(3)];
    const size = 112, fam = F.archivo(87.5, 900);
    c.save();
    c.font = font(fam, size);
    const sp = c.measureText(' ').width;
    const widths = rows.map((r) => r.reduce((s, w) => s + c.measureText(w.w).width, 0) + sp * (r.length - 1));
    const bx = 72, by = 726, bw = Math.max(...widths) + 2 * 40 + 24, bh = 2 * 126 + 52;
    const a = clamp((t - words[0].start + 0.1) / 0.12) * fade;
    c.globalAlpha = a;
    // paper block with a double rule
    c.fillStyle = rgba('bone', 0.97); c.fillRect(bx, by, bw, bh);
    c.strokeStyle = rgba(INK, 0.9); c.lineWidth = 1.6; c.strokeRect(bx + 8.5, by + 8.5, bw - 17, bh - 17);
    c.lineWidth = 0.8; c.strokeRect(bx + 14.5, by + 14.5, bw - 29, bh - 29);
    rows.forEach((r, ri) => {
      let x = 96 + 12; const y = by + 28 + 112 + ri * 126;
      for (const w of r) {
        const ww = c.measureText(w.w).width;
        const prog = Lyrics.wordProgress(w, t), started = t >= w.start;
        if (started) {
          // amber highlighter behind the sung part
          c.fillStyle = rgba('signal', 1);
          c.fillRect(x - 6, y - size * 0.78, (ww + 12) * prog, size * 0.96);
        }
        const pop = started ? Math.exp(-(t - w.start) / 0.08) : 0;
        c.save(); c.translate(x + ww / 2, y); c.scale(1 + 0.12 * pop, 1 + 0.12 * pop);
        c.fillStyle = rgba(INK, t >= w.end ? 0.96 : started ? 0.96 : 0.24);
        c.fillText(w.w, -ww / 2, 0);
        c.restore();
        x += ww + sp;
      }
    });
    c.restore();
  }
}
