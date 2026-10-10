// smuggle (bars 28-30): "smuggled in suitcases, rented by the hour".
// Idiom: AIRPORT X-RAY. A line-scan detector reads suitcases off a conveyor and draws them as an
// engraved density map (ink -> umber -> amber -> ember -> white). GPUs hide inside the bags; the belt
// halts on a beat, flag brackets snap on, then a taxi-meter panel prices the hour while a sand hourglass
// flips on the downbeat. The camera dives into the hourglass neck and the sand stream is the handoff.
//  in : hbm leaves a hairline across the frame at y = 0.64 H; here it is the conveyor's top edge.
//  out: a 30 px amber column at x = W/2 from y = 0 to H/2 on ink (the sand stream); island's first frame
//       is that same column pouring onto the sea.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, makeRT, clearRT, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, keys, lerp, pulse, smoothstep, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { drawRow, drawWord, drawSegText, mono, rowWidth } from './hbm-kit';

export const SMUGGLE_BELT_Y = 0.64 * H;
export const SMUGGLE_COLUMN = { x: W / 2, w: 30, yEnd: H / 2 };
const SCAN_X = 1190;
const HG = { x: 1612, y: 585, H: 235, R: 96 };

const BAGS = [
  // cx at s=0, half size, seed, gpu count
  { x: 700, hx: 300, hy: 195, seed: 3.1, gpu: 0 },
  { x: 1700, hx: 345, hy: 215, seed: 7.7, gpu: 2 },
  { x: 2750, hx: 320, hy: 230, seed: 12.3, gpu: 1 },
  { x: 3700, hx: 300, hy: 200, seed: 19.9, gpu: 1 },
];

const XRAY = /* glsl */ `
uniform float t; uniform vec4 bag[4]; uniform vec4 info[4]; uniform float beltS; uniform float flash; uniform float fade;
uniform float edgeHot; uniform float beltY; uniform float scanX; uniform float hotBag;
float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float ln(float d, float hw){ float f = max(fwidth(d) * 0.8, 1e-3); return 1.0 - smoothstep(hw - f, hw + f, abs(d)); }
float fillA(float d){ float f = max(fwidth(d) * 0.8, 1e-3); return 1.0 - smoothstep(-f, f, d); }
float capsule(vec2 p, vec2 a, vec2 b, float r){ return sdSegment(p, a, b) - r; }

// a graphics card seen from above, ~330 x 124, centred; density 0..1.2
float gpuD(vec2 q){
  float D = 0.0;
  float sd = sdRB(q, vec2(165.0, 58.0), 9.0);
  D += fillA(sd) * 0.30;
  D += ln(sd + 3.0, 2.0) * 0.55;
  // finned heatsink block
  vec2 fq = q - vec2(-12.0, 0.0);
  float fin = fillA(sdRB(fq, vec2(128.0, 44.0), 4.0));
  D += fin * (0.22 + 0.30 * (0.5 + 0.5 * cos(q.x * TAU / 4.2)));
  // heat pipes
  for (int i = 0; i < 4; i++) {
    float yy = -24.0 + float(i) * 16.0;
    D += ln(q.y - yy - 5.0 * sin(q.x * 0.035 + float(i)), 2.3) * fillA(sdRB(fq, vec2(150.0, 44.0), 4.0)) * 0.55;
  }
  // two fans
  for (int i = 0; i < 2; i++) {
    vec2 c = vec2(-72.0 + float(i) * 104.0, 0.0);
    vec2 d = q - c; float r = length(d), a = atan(d.y, d.x);
    D += ln(r - 46.0, 2.0) * 0.85;
    D += fillA(r - 12.0) * 0.95;
    float blades = smoothstep(0.45, 0.55, abs(fract(a * 9.0 / TAU + r * 0.016) - 0.5) * 2.0);
    D += (1.0 - blades) * fillA(r - 44.0) * (1.0 - fillA(r - 13.0)) * 0.42;
  }
  // die and VRM
  D += fillA(sdRB(q - vec2(125.0, 0.0), vec2(15.0, 15.0), 2.0)) * 0.9;
  for (int i = 0; i < 5; i++) {
    D += fillA(sdRB(q - vec2(105.0 + float(i) * 9.0, -45.0), vec2(3.5, 4.0), 1.0)) * 0.8;
    D += fillA(sdRB(q - vec2(105.0 + float(i) * 9.0, 45.0), vec2(3.5, 4.0), 1.0)) * 0.8;
  }
  // power connector and PCIe fingers
  D += fillA(sdRB(q - vec2(40.0, -64.0), vec2(34.0, 7.0), 2.0)) * 0.7;
  float fing = step(0.5, fract(q.x / 4.4)) * step(abs(q.y - 66.0), 7.0) * step(abs(q.x + 30.0), 100.0);
  D += fing * 0.85;
  // I/O bracket
  D += fillA(sdRB(q - vec2(-164.0, 6.0), vec2(5.0, 76.0), 1.0)) * 0.95;
  return D;
}

float bagD(vec2 p, vec2 hs, float seed, float gpuN, float hot, out float gpuMask){
  gpuMask = 0.0;
  float D = 0.0;
  float sd = sdRB(p, hs, 30.0);
  // handle, wheels, feet
  D += ln(capsule(p, vec2(-58.0, -hs.y - 34.0), vec2(58.0, -hs.y - 34.0), 0.0), 4.0) * 0.55;
  D += ln(capsule(p, vec2(-58.0, -hs.y - 34.0), vec2(-58.0, -hs.y + 4.0), 0.0), 3.0) * 0.5;
  D += ln(capsule(p, vec2(58.0, -hs.y - 34.0), vec2(58.0, -hs.y + 4.0), 0.0), 3.0) * 0.5;
  for (int i = 0; i < 2; i++) {
    vec2 wc = vec2((i == 0 ? -1.0 : 1.0) * (hs.x - 62.0), hs.y + 24.0);
    float wr = length(p - wc);
    D += (ln(wr - 19.0, 3.0) * 0.75 + fillA(wr - 7.0) * 0.8);
  }
  if (sd > 4.0) return D;
  // hard shell, corner reinforcement, zipper track
  float cornerW = smoothstep(hs.x - 110.0, hs.x - 50.0, abs(p.x)) * smoothstep(hs.y - 80.0, hs.y - 36.0, abs(p.y));
  D += ln(sd + 5.0, 4.0) * (0.50 + 0.5 * cornerW);
  float teeth = 0.55 + 0.45 * step(0.5, fract((p.x + p.y) * 0.45));
  D += ln(sd + 24.0, 1.8) * 0.40 * teeth;
  // ribs of the shell (engraved corrugation) near the left and right edges
  float rib = step(0.5, fract(p.x / 17.0)) * smoothstep(-26.0, -34.0, sd) * smoothstep(hs.x - 70.0, hs.x - 40.0, abs(p.x));
  D += rib * 0.10;
  float inside = fillA(sd + 30.0);
  // clothes: soft folds
  float cl = 0.18 + 0.15 * (0.5 + 0.5 * snoise(p * 0.010 + seed)) + 0.10 * abs(snoise(p * vec2(0.018, 0.045) + seed * 3.1));
  // divider between lid and base
  D += ln(p.y - hs.y * 0.18, 2.5) * 0.45 * inside;
  D += cl * inside;
  // shoes, rolls, bottle, cable
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2((hash12(vec2(seed, fi)) - 0.5) * (hs.x - 90.0), (hash12(vec2(fi, seed)) - 0.5) * (hs.y - 60.0));
    float ang = hash12(vec2(seed * 2.0, fi)) * 3.1;
    vec2 d = rot2(ang) * (p - c);
    float cs = capsule(d, vec2(-34.0, 0.0), vec2(34.0, 0.0), 15.0);
    D += (fillA(cs) * 0.30 + ln(cs + 2.0, 1.6) * 0.38) * inside;
  }
  D += ln(p.y - (hs.y * 0.45) - 10.0 * sin(p.x * 0.02 + seed), 1.5) * 0.65 * inside * step(abs(p.x), hs.x - 50.0);
  // lock plates
  D += fillA(sdRB(p - vec2(0.0, hs.y - 30.0), vec2(28.0, 8.0), 2.0)) * 0.8;
  // GPUs
  if (gpuN > 0.5) {
    for (int g = 0; g < 2; g++) {
      if (float(g) >= gpuN) break;
      vec2 gc = vec2(hs.x * (g == 0 ? 0.02 : -0.05), g == 0 ? -hs.y * 0.18 : hs.y * 0.34);
      float ga = (g == 0 ? -0.10 : 0.08) + (hash12(vec2(seed, 9.0)) - 0.5) * 0.12;
      vec2 q = rot2(ga) * (p - gc) / (hs.x / 262.0);
      float gd = gpuD(q);
      if (g == 0) gpuMask = fillA(sdRB(q, vec2(170.0, 66.0), 10.0));
      D += gd * (0.92 + hot * 0.4) * inside;
      D += hot * 0.18 * fillA(sdRB(q, vec2(170.0, 66.0), 10.0)) * (g == 0 ? 1.0 : 0.0);
    }
  }
  return D;
}

vec3 xcol(float d){
  vec3 c = mix(C_INK, C_BLOOD * 0.8, smoothstep(0.02, 0.25, d));
  c = mix(c, C_SIGNAL * 0.85, smoothstep(0.22, 0.62, d));
  c = mix(c, C_EMBER * 1.0, smoothstep(0.58, 1.0, d));
  c = mix(c, vec3(0.98, 0.93, 0.82), smoothstep(1.0, 1.5, d));
  return c;
}

void main(){
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float D = 0.0, gm = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 c = bag[i].xy, hs = bag[i].zw;
    if (abs(P.x - c.x) > hs.x + 90.0) continue;
    float g;
    float kk = hs.x / 250.0;
    D += bagD((P - c) / kk, hs / kk, info[i].x, info[i].y, i == int(hotBag + 0.5) ? info[i].z : 0.0, g);
    gm = max(gm, g * step(0.5, info[i].y));
  }
  // the detector bar: image is formed as bags pass it
  float reveal = smoothstep(scanX + 6.0, scanX - 30.0, P.x);
  float pre = 0.10;
  float Dv = D * mix(pre, 1.0, reveal);
  // belt: band under the bags
  float bt = P.y - beltY;
  float belt = step(0.0, bt) * step(bt, 74.0);
  float slat = ln(fract((P.x + beltS) / 52.0) - 0.5 + 0.5, 0.012) * 0.0; // (kept for clarity: slats drawn below)
  float slats = (1.0 - smoothstep(0.0, 0.06, abs(fract((P.x + beltS) / 52.0) - 0.5) * 2.0 - 0.92 + 0.0)) * belt;
  Dv += belt * 0.11 + slats * 0.12 * reveal + belt * 0.05 * (0.5 + 0.5 * sin((P.x + beltS) * 0.4));
  // rollers underneath: engraved hatch
  float roll = step(74.0, bt) * step(bt, 168.0);
  float rr = hash11(floor((P.x + beltS * 0.6) / 38.0));
  Dv += roll * (0.05 + 0.10 * ln(fract((P.x + beltS * 0.6) / 38.0) - 0.5, 0.20)) * mix(0.3, 1.0, reveal);
  // detector bar glow
  float bar = exp(-pow((P.x - scanX) / 3.0, 2.0)) * 0.9 + exp(-pow((P.x - scanX) / 26.0, 2.0)) * 0.12;
  bar *= step(60.0, P.y) * step(P.y, beltY + 190.0) * (0.75 + 0.25 * sin(t * 60.0));
  // line-scan rows: density modulates the line weight (engraved look)
  float rowI = 0.80 + 0.20 * cos(P.y * TAU / 3.0);
  vec3 col = xcol(Dv) * mix(1.0, rowI, smoothstep(0.05, 0.4, Dv));
  col += C_SIGNAL * bar * 0.55;
  // faint registration grid
  vec2 gq = P / 96.0; vec2 gf = abs(fract(gq) - 0.5);
  col += C_BONE * 0.012 * (1.0 - smoothstep(0.0, 0.012, min(gf.x, gf.y) - 0.488)) * 0.0;
  float gridL = (1.0 - smoothstep(0.0, fwidth(P.x) * 1.2 / 96.0 * 2.0, abs(fract(gq.x) - 0.5) - 0.5 + fwidth(P.x) / 96.0)) ;
  // belt top edge: the handoff hairline
  float edge = ln(P.y - beltY, 1.3);
  col += (C_SIGNAL * 1.2 + C_EMBER * 0.5) * edge * (0.45 + 1.6 * edgeHot);
  // vignette to the detector tunnel
  col *= 0.55 + 0.45 * smoothstep(0.0, 160.0, P.y) * smoothstep(0.0, 120.0, 1080.0 - P.y + 120.0);
  col += C_BONE * 0.0;
  col = mix(col, vec3(0.0) + C_INK, 1.0 - fade);
  col += vec3(1.0, 0.9, 0.7) * flash;
  fragColor = vec4(col, 1.0);
}`;

const HOURGLASS = /* glsl */ `
uniform float t; uniform vec2 ctr; uniform float zoom; uniform float ang; uniform float VT; uniform float VB; uniform float flow;
uniform float wall; uniform float yEnd; uniform float colW;
const float HH = ${HG.H}.0; const float RR = ${HG.R}.0; const float NK = 5.0;
float prof(float y){
  float u = clamp(abs(y) / HH, 0.0, 1.0);
  if (u < 0.60) { float k = u / 0.60; return NK + (RR - NK) * pow(sin(k * 1.5708), 0.8); }
  return RR * (1.0 - 0.18 * pow((u - 0.60) / 0.40, 2.0));
}
float ln(float d, float hw){ float f = max(fwidth(d) * 0.8, 1e-3); return 1.0 - smoothstep(hw - f, hw + f, abs(d)); }
float fillA(float d){ float f = max(fwidth(d) * 0.8, 1e-3); return 1.0 - smoothstep(-f, f, d); }
void main(){
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 L = vec2(P.x - ctr.x, ctr.y - P.y) / zoom; // y up, neck at origin
  float pxu = 1.0 / zoom;                          // one screen px in glass units
  vec2 Lr = rot2(ang) * L;                         // glass-local (for the frame)
  float r = prof(L.y), slope = (prof(L.y + 1.0) - prof(L.y - 1.0)) * 0.5 * sign(L.y);
  float cosT = inversesqrt(1.0 + slope * slope);
  float dEdge = (r - abs(L.x)) * cosT;             // >0 inside glass
  bool inY = abs(L.y) < HH;
  vec3 col = vec3(0.0); float a = 0.0;
  if (inY) {
    // glass body: faint fill + outline + a long highlight on the left, amber rim on the right
    float gl = fillA(-dEdge) * 0.06;
    float outline = ln(dEdge * zoom, 1.5);
    float hi = exp(-pow((L.x + r * 0.62) / max(r * 0.05, pxu * 1.5), 2.0)) * smoothstep(0.0, 6.0, dEdge) * 0.35;
    float rimR = ln((dEdge - 2.0) * zoom, 1.0) * step(0.0, L.x) * 0.9;
    col += C_BONE * (gl + outline * 0.85 + hi) * wall + C_SIGNAL * rimR * wall;
    a = max(a, (gl * 3.0 + outline + hi + rimR) * wall);
    // sand in the screen frame: top bulb heap on the funnel, bottom mound
    float lt = VT * HH * 0.80, lb = -HH * 0.985 + VB * HH * 0.80;
    float surfT = lt - 22.0 * flow * (1.0 - smoothstep(0.0, r * 0.9, abs(L.x)));
    float surfB = lb + 30.0 * flow * max(0.0, 1.0 - abs(L.x) / (r * 0.95));
    bool top = L.y > 0.0 && L.y < surfT && VT > 0.004;
    bool bot = L.y < 0.0 && L.y < surfB && VB > 0.004;
    float inside = fillA(-dEdge + 1.5);
    if ((top || bot) && dEdge > 0.0) {
      float surfD = top ? (surfT - L.y) : (surfB - L.y);
      float u = dEdge / 4.0;
      float ink = hatch(u * 1.0, 0.18 + 0.5 * (1.0 - smoothstep(0.0, 46.0, dEdge)));
      float cross = hatch((L.y + L.x * 0.4) / 5.0, 0.12) * 0.5;
      float grain = snoise(L * 0.9) * 0.5 + 0.5;
      vec3 sc = mix(C_SIGNAL * 0.95, C_BLOOD * 0.6, clamp(ink * 0.85 + cross * 0.5, 0.0, 1.0));
      sc *= 0.86 + 0.28 * grain;
      sc += C_EMBER * 0.9 * (1.0 - smoothstep(0.0, 3.0, surfD)) ;      // lit surface
      col = mix(col, sc * wall, 0.97 * step(0.0, 1.0) * wall);
      a = max(a, wall);
    }
    // falling stream from the dip to the mound
    // (drawn below, outside the glass test, so it can outlive the glass in the zoom)
  }
  // stream (screen frame)
  {
    float lt = VT * HH * 0.80, lb = -HH * 0.985 + VB * HH * 0.80;
    float top = lt - 22.0 * flow, bot = lb + 30.0 * flow;
    float sw = (2.1 + 0.4 * sin(L.y * 0.4 - t * 40.0)) * 0.5 * flow;
    float inS = step(abs(L.x), max(sw, pxu * 0.8)) * step(L.y, top) * step(bot, L.y) * step(0.003, VT);
    float grains = 0.7 + 0.3 * step(0.5, fract(L.y * 0.18 + t * 11.0 + hash11(floor(L.x)) ));
    if (colW > 0.0) {
      // handoff column: a plain 30 px column ending at yEnd
      float cw = colW * 0.5;
      float inC = step(abs(P.x - ctr.x), cw) * step(P.y, yEnd);
      vec3 cc = C_SIGNAL * 1.15 + C_EMBER * 0.5 * exp(-pow((P.x - ctr.x) / (cw * 0.5), 2.0));
      col = mix(col, cc, inC); a = max(a, inC);
    } else if (inS > 0.0) {
      vec3 cc = (C_SIGNAL * 1.4 + C_EMBER * 1.0) * grains;
      col = mix(col, cc, 0.95); a = max(a, 1.0);
    }
  }
  // brass frame (rotates with the glass): plates and three spindles
  if (wall > 0.001) {
    float capY = abs(Lr.y) - HH - 9.0;
    float plate = fillA(max(capY, abs(Lr.x) - (RR * 0.98 + 26.0)) + 8.0) * 0.9 * step(HH - 4.0, abs(Lr.y));
    float pe = ln(max(abs(capY) - 8.0, abs(Lr.x) - (RR * 0.98 + 26.0)), 1.1);
    float hs = hatch(Lr.x / 3.0, 0.35);
    col += (C_ASH * 0.35 * plate * (0.4 + 0.6 * hs) + C_BONE * 0.8 * pe) * wall;
    a = max(a, (plate * 0.9 + pe) * wall);
    for (int i = 0; i < 3; i++) {
      float sx = (float(i) - 1.0) * (RR + 24.0);
      float sp = ln(Lr.x - sx, 2.2) * step(abs(Lr.y), HH + 2.0) * 0.8;
      col += C_ASH * 0.7 * sp * wall; a = max(a, sp * wall);
    }
  }
  fragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

export default class Smuggle extends Scene {
  xray = new FSPass(XRAY, {
    t: { value: 0 }, bag: { value: BAGS.map(() => new THREE.Vector4()) }, info: { value: BAGS.map(() => new THREE.Vector4()) },
    beltS: { value: 0 }, flash: { value: 0 }, fade: { value: 1 }, edgeHot: { value: 0 }, beltY: { value: SMUGGLE_BELT_Y }, scanX: { value: SCAN_X }, hotBag: { value: 1 },
  });
  hg = new FSPass(HOURGLASS, {
    t: { value: 0 }, ctr: { value: new THREE.Vector2() }, zoom: { value: 1 }, ang: { value: 0 }, VT: { value: 0 }, VB: { value: 1 }, flow: { value: 0 },
    wall: { value: 1 }, yEnd: { value: 1080 }, colW: { value: 0 },
  });
  hgRT = makeRT();
  text = new Layer2D();
  lines = new LineBatch(4000, { blend: 'add' });
  lineRef: any;
  T0 = 0;

  override async init() {
    this.T0 = this.ctx.start;
    this.lineRef = lineByScene(this.ctx.lyrics, 'smuggle');
    // keep the info array in sync with the bag list
    const info = this.xray.u.info!.value as THREE.Vector4[];
    BAGS.forEach((b, i) => info[i]!.set(b.seed, b.gpu, 0, 0));
  }

  /** Belt travel (px) since T0: cruising, a braked stop on the beat, a second push, then a long glide. */
  beltS(t: number): number {
    const T0 = this.T0;
    const stopT = T0 + 0.9375; // beat 3 of the bar: 53.4375
    const go = T0 + 1.8; // belt restarts as the meter runs
    const sStop = BAGS[1]!.x - 700;
    const cruise = sStop / (0.9375 - 0.2 + 0.11);
    if (t < stopT - 0.2) return cruise * (t - T0);
    if (t < stopT) { const u = (t - (stopT - 0.2)) / 0.2; return cruise * (stopT - 0.2 - T0) + cruise * 0.2 * (u - 0.45 * u * u); }
    if (t < go) return sStop;
    return sStop + 1100 * Math.pow(Math.min(t - go, 0.5), 2) / (2 * 0.5) + 1100 * Math.max(0, t - go - 0.5);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, T0 = this.T0, lt = t - T0, END = this.ctx.end;
    const words = this.lineRef.words as any[];
    const dur = END - T0;
    const flagT = T0 + 0.9375; // 53.4375: brackets snap on
    const meterT = words[3].start, flipT = T0 + 1.875; // downbeat 54.375
    const hourEnd = words[words.length - 1].end;
    const zoomT0 = END - 1.0;
    // ---- belt and bags
    const s = this.beltS(t);
    const bag = this.xray.u.bag!.value as THREE.Vector4[];
    const beltY = SMUGGLE_BELT_Y;
    BAGS.forEach((b, i) => bag[i]!.set(b.x - s, beltY - b.hy - 24 * (b.hx / 250) - 4, b.hx, b.hy));
    const hero = BAGS[1]!;
    const heroX = hero.x - s, heroY = beltY - hero.hy - 24 * (hero.hx / 250) - 4;
    const flagU = ease.outExpo(clamp((t - flagT) / 0.16));
    const zoomU = clamp((t - zoomT0) / (END - zoomT0));
    const dive = ease.inCubic(zoomU);
    this.xray.u.t!.value = t;
    this.xray.u.beltS!.value = s;
    this.xray.u.edgeHot!.value = 1 - smoothstep(0.0, 0.35, lt) + 0.5 * pulse(t, flagT, 0.12);
    this.xray.u.flash!.value = 0.22 * pulse(t, flagT, 0.035);
    this.xray.u.fade!.value = 1 - smoothstep(0.0, 1, zoomU * 1.0) * (zoomU > 0.55 ? 1 : 0.0) - 0;
    this.xray.u.hotBag!.value = 1;
    ((this.xray.u.info!.value as THREE.Vector4[])[1]!).z = flagU;
    this.xray.u.fade!.value = 1 - smoothstep(0.35, 0.8, zoomU);
    this.xray.render(renderer, out);

    // ---- hourglass (own pass, composited over)
    const hgIn = ease.outExpo(clamp((t - (meterT - 0.05)) / 0.42));
    const flipU = clamp((t - flipT) / 0.55);
    const ang = Math.PI * ease.outBack(flipU, 1.2);
    const lift = 46 * Math.sin(Math.PI * flipU) * (flipU < 1 ? 1 : 0);
    const mid = smoothstep(0.35, 0.65, flipU);
    const VT = t < flipT ? 0 : mid * (1 - clamp((t - (flipT + 0.55)) / 2.6) * 0.62);
    const VB = t < flipT ? 1 : (1 - mid) + mid * clamp((t - (flipT + 0.55)) / 2.6) * 0.62;
    const flow = t > flipT + 0.55 ? clamp((t - flipT - 0.55) / 0.12) : 0;
    const neckX = lerp(HG.x, W / 2, dive), neckY = lerp(HG.y + lift, H / 2, dive);
    const zoom = Math.exp(Math.log(14) * dive) * lerp(0.82, 1, hgIn);
    const u = this.hg.u;
    (u.ctr!.value as THREE.Vector2).set(neckX + (1 - hgIn) * 500, neckY);
    u.zoom!.value = zoom; u.ang!.value = ang; u.VT!.value = VT; u.VB!.value = VB; u.flow!.value = flow;
    u.t!.value = t;
    u.wall!.value = (1 - smoothstep(0.7, 0.93, zoomU)) * clamp(hgIn * 1.2);
    const colOn = zoomU > 0.7;
    u.colW!.value = colOn ? SMUGGLE_COLUMN.w : 0;
    u.yEnd!.value = lerp(1300, SMUGGLE_COLUMN.yEnd, ease.outExpo(clamp((zoomU - 0.78) / 0.2)));
    if (t >= meterT - 0.1 && t < END) {
      clearRT(renderer, this.hgRT, [0, 0, 0], 0);
      this.hg.render(renderer, this.hgRT);
      comp.draw(renderer, this.hgRT.texture, out);
    }

    // ---- overlay: karaoke rows, flag brackets, header, meter panel
    const tx = this.text; tx.clear(); const c = tx.ctx;
    const out01 = 1 - smoothstep(0.1, 0.5, zoomU);
    c.save(); c.globalAlpha = out01;
    // header (mono) and detector status
    mono(c, 'XR-7 · SCAN 07 · BELT 2 · DUAL-ENERGY', 96, 118, 13, 'rgba(238,233,223,0.55)', 500, 'left', 1.5);
    mono(c, `0.22 m/s · ${Math.round(clamp(Math.abs(this.beltS(t + 0.01) - this.beltS(t - 0.01)) / 0.02 / 880) * 220) / 1000 > 0 ? 'SCANNING' : 'HALT'}`, 96, 140, 13, 'rgba(255,164,27,0.85)', 500, 'left', 1.5);
    const clk = 7 * 3600 + 14 * 60 + Math.floor(t * 4) % 60;
    mono(c, `T ${String(Math.floor(clk / 3600) % 24).padStart(2, '0')}:${String(Math.floor(clk / 60) % 60).padStart(2, '0')}:${String(clk % 60).padStart(2, '0')}`, SCAN_X - 20, 118, 13, 'rgba(238,233,223,0.4)', 500, 'right', 1);
    // detector bar tag
    mono(c, 'DETECTOR', SCAN_X + 12, 170, 11, 'rgba(255,164,27,0.7)', 500, 'left', 2);
    // flag brackets around the hero GPU
    if (t >= flagT) {
      const gx = heroX + hero.hx * 0.02, gy = heroY - hero.hy * 0.18;
      const bw = 190 * (hero.hx / 262) + 40, bh = 82 * (hero.hx / 262) + 40;
      const e = 1 + (1 - flagU) * 2.2;
      const L = bw * e, Hh = bh * e, a = Math.min(1, flagU * 2);
      c.strokeStyle = rgba('signal', a); c.lineWidth = 3;
      const k = 26;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x0 = gx + sx * L, y0 = gy + sy * Hh;
        c.beginPath(); c.moveTo(x0 - sx * k, y0); c.lineTo(x0, y0); c.lineTo(x0, y0 - sy * k); c.stroke();
      }
      // callout
      const ca = clamp((t - flagT - 0.1) / 0.12) * out01;
      if (ca > 0) {
        const lx = gx + bw + 30, ly = gy - Hh - 30;
        c.globalAlpha = ca * out01;
        c.strokeStyle = rgba('signal', 0.8); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(gx + bw * 0.9, gy - Hh); c.lineTo(lx, ly); c.lineTo(lx + 300, ly); c.stroke();
        c.fillStyle = rgba('ink', 0.0);
        mono(c, 'ITEM FLAGGED', lx, ly - 12, 24, rgba('signal', 1), 700, 'left', 2);
        mono(c, 'CLASS  ACCELERATOR CARD ×2', lx, ly + 22, 13, 'rgba(238,233,223,0.8)', 500);
        mono(c, 'ECCN 3A090 · NO LICENCE ON FILE', lx, ly + 42, 13, 'rgba(238,233,223,0.8)', 500);
        mono(c, `DENSITY ${(0.92 + 0.04 * Math.sin(t * 9)).toFixed(2)} · HOLD FOR SECONDARY`, lx, ly + 62, 13, 'rgba(238,233,223,0.55)', 500);
        c.globalAlpha = out01;
      }
    }
    // lyric rows (bottom, left aligned): the sung words ride just under the belt
    const row1 = words.slice(0, 3), row2 = words.slice(3);
    const sz = 124;
    const wopt = { size: sz, family: F.archivo(87.5, 900), slam: 0.2, slide: 22 };
    drawRow(c, row1, t, 96, 872, wopt);
    drawRow(c, row2, t, 96, 996, wopt);
    // meter panel
    if (t >= meterT - 0.1) {
      const pu = ease.outExpo(clamp((t - (meterT - 0.05)) / 0.35));
      const px = lerp(W + 40, 1396, pu), py = 96, pw = 428, ph = 190;
      c.fillStyle = rgba('ink2', 0.97); c.fillRect(px, py, pw, ph);
      c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, pw, ph);
      mono(c, 'CLOUD GPU · ON-DEMAND', px + 22, py + 30, 12, 'rgba(238,233,223,0.6)', 500, 'left', 1.5);
      const hrs = clamp((t - words[3].start) / (hourEnd - words[3].start));
      const price = 2.49;
      const cost = 8 * price * hrs;
      const txt = cost.toFixed(2).padStart(7, ' ');
      c.fillStyle = rgba('signal', 0.9); c.font = font(F.mono(700), 30); c.fillText('$', px + 22, py + 112);
      drawSegText(c, txt, px + 60, py + 62, 64, rgba('signal', 1), rgba('signal', 0.07));
      mono(c, `8 GPU × $${price.toFixed(2)}/GPU-HR × ${(hrs).toFixed(2)} H`, px + 22, py + 160, 13, 'rgba(238,233,223,0.7)', 500, 'left', 0.5);
      // tick marks (an hour fills up)
      c.fillStyle = rgba('bone', 0.2); c.fillRect(px + 22, py + 172, pw - 44, 2);
      c.fillStyle = rgba('signal', 1); c.fillRect(px + 22, py + 171, (pw - 44) * hrs, 4);
    }
    c.restore();
    comp.draw(renderer, tx.upload(), out);
    // flag flash across the frame
    return { bloom: 0.5, bloomThreshold: 1.0, zoom: 1 + 0.025 * pulse(t, flagT, 0.1) + 0.02 * pulse(t, flipT, 0.1), ca: 1.2 + 3 * pulse(t, flagT, 0.08), shake: [0, 0] as [number, number] };
  }
}
