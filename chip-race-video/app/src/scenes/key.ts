// key (bars 32-34): "holding the future like a silicon key".
// Idiom: MECHANICAL PRECISION RENDER. A brass key with a silicon blade whose bit is a bond-pad pattern slides
// into a sectioned pin-tumbler lock; five pins, each tagged with a country code of the supply chain, snap to
// the shear line on a beat; the key turns on "key" and a dial reads TPP up to the 4,800 threshold, then the
// dial face irises open on the wafer map.
//  in : island leaves bare bone paper with the compass rose at ROSE_END (north up). The first frame here is
//       that exact paper and rose; an iris grows from the rose centre and its ring becomes the key's bow.
//  out: ink with the bare wafer map (shield-grid drawWaferStatic) at WAFER (centre W/2,H/2; R = 400 px) =
//       shield's first frame.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, makeRT, clearRT, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { TPP_THRESHOLD } from './_motifs';
import { clamp, ease, hash, keys, lerp, pulse, smoothstep, TAU } from '../engine/util';
import { lineByScene } from './_motifs';
import { makeStudioEnv, lin } from './hbm-studio';
import { drawRow, mono } from './hbm-kit';
import { drawRose, ROSE_END, END_Z, ROSE_LONLAT, kmOf } from './island-geo';
import { PAPER_GLSL } from './island-paper';
import { drawWaferStatic, WAFER } from './shield-grid';

// ---- geometry (world units; the key lies along x, bow at +x, tip at -x)
const LX0 = -9.6, LX1 = -6.0;           // lock body extent along x; the face is at LX1
const CH_X = [-9.0, -8.4, -7.8, -7.2, -6.6]; // pin chambers, 0 = deepest
const TIP_FINAL = CH_X[0]! - 0.35;       // key tip when fully inserted
const BOW_X = 4.55;                      // bow centre, relative to the tip
const TIP_START = -BOW_X;                // bow at the origin (the rose position) at the start
const YS = 0.95;                         // the shear line
const REST = 0.2;                        // where an unloaded key pin sits
const KEYWAY = { lo: -0.55, hi: 0.62 };
const BLADE_TOP = 0.55, BLADE_BOT = -0.45, BLADE_LEN = 3.3;
const CUTS = [0.22, 0.05, 0.28, 0.12, 0.18]; // bond-pad depths
const PIN_LEN = CUTS.map((d) => 0.40 + d);
const DRIVER = 0.5;
const TAGS = ['NL', 'JP', 'KR', 'US', 'TW'];
const TAG_NAMES = ['ASML · LITHOGRAPHY', 'TOKYO ELECTRON · MATERIALS', 'SK HYNIX · MEMORY', 'NVIDIA · DESIGN', 'TSMC · FOUNDRY'];

/** Top edge of the blade at distance xr from the tip (a polyline of pad lands and ramps). */
function bladeProfile(): [number, number][] {
  const pts: [number, number][] = [[0, -0.05], [0.14, 0.40]];
  const a0 = 0.35, hw = 0.16;
  CUTS.forEach((d, j) => {
    const top = BLADE_TOP - d, x = a0 + 0.6 * j;
    pts.push([x - hw - 0.1 * 0 - Math.abs(0.5 - top) * 0.0, pts[pts.length - 1]![1]] as [number, number]);
    pts.push([x - hw, top], [x + hw, top]);
  });
  pts.push([BLADE_LEN - 0.34, BLADE_TOP], [BLADE_LEN, BLADE_TOP]);
  // drop the degenerate helper points (same y as the previous one, same x ordering)
  const out: [number, number][] = [];
  for (const p of pts) if (!out.length || p[0] > out[out.length - 1]![0] + 1e-6 || Math.abs(p[1] - out[out.length - 1]![1]) > 1e-6) out.push(p);
  return out;
}
const PROFILE = bladeProfile();
function topAt(xr: number): number {
  if (xr < 0) return -9;
  if (xr > BLADE_LEN) return BLADE_TOP;
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1]!, b = PROFILE[i]!;
    if (xr <= b[0]) return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (xr - a[0]) / (b[0] - a[0]));
  }
  return BLADE_TOP;
}

// ---- textures
function padTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#16161a'; c.fillRect(0, 0, 512, 512);
  const pitch = 64;
  c.strokeStyle = '#3b3833'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, i * pitch + 32); c.lineTo(512, i * pitch + 32); c.stroke(); c.beginPath(); c.moveTo(i * pitch + 32, 0); c.lineTo(i * pitch + 32, 512); c.stroke(); }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    c.fillStyle = (i + j) % 5 === 0 ? '#e9c47a' : '#c98a22';
    c.fillRect(i * pitch + 14, j * pitch + 14, 36, 36);
    c.fillStyle = '#16161a'; c.fillRect(i * pitch + 24, j * pitch + 24, 16, 16);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.repeat.set(1 / 0.88, 1 / 0.88);
  return t;
}
function hatchTexture(base: string, line: string) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = base; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = line; c.lineWidth = 2.2;
  for (let k = -256; k <= 256; k += 16) for (const off of [-256, 0, 256]) { c.beginPath(); c.moveTo(k + off, 0); c.lineTo(k + off + 256, 256); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.repeat.set(1 / 0.24, 1 / 0.24);
  return t;
}
function tagTexture(code: string, lit: boolean) {
  const cv = document.createElement('canvas'); cv.width = 224; cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = lit ? '#FFA41B' : '#d9d3c6'; c.fillRect(0, 0, 224, 128);
  c.strokeStyle = '#0A0A0B'; c.lineWidth = 6; c.strokeRect(4, 4, 216, 120);
  c.fillStyle = '#0A0A0B'; c.font = `700 74px "Plex-700", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(code, 112, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const FINAL = /* glsl */ `
${PAPER_GLSL}
uniform sampler2D scene; uniform vec2 kc; uniform float zoom; uniform float irisR; uniform vec2 irisC; uniform float edgeOn;
uniform float fadeOut; uniform float t; uniform float glow;
void main(){
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 c = kc + (P - vec2(960.0, 540.0)) / zoom;
  vec3 paper = paperCol(c * 3.0);
  paper *= 1.0 - 0.18 * smoothstep(0.55, 1.0, length((P - vec2(960.0, 540.0)) / vec2(1100.0, 640.0)));
  float r = length(P - irisC);
  // studio ground: ink with an amber haze behind the work
  vec2 q = (P - vec2(960.0, 500.0)) / vec2(1100.0, 560.0);
  vec3 dark = C_INK * (1.0 + 0.6 * smoothstep(1.0, 0.0, q.y * 0.5 + 0.5)) + C_SIGNAL * (0.018 + 0.030 * glow) * exp(-dot(q, q) * 1.4) + C_BONE * 0.004;
  vec4 sc = texture(scene, vUv);
  vec3 inside = mix(dark, sc.rgb, sc.a);
  float m = 1.0 - smoothstep(irisR - 1.2, irisR + 1.2, r);
  vec3 col = mix(paper, inside, m);
  col += (C_SIGNAL * 1.5 + C_EMBER * 0.4) * exp(-pow((r - irisR) / 2.2, 2.0)) * edgeOn;
  float rr = length(P - vec2(960.0, 540.0));
  col *= 1.0 - fadeOut * smoothstep(${WAFER.R - 6}.0, ${WAFER.R + 26}.0, rr);
  fragColor = vec4(col, 1.0);
}`;

interface CamPose { tx: number; ty: number; tz: number; az: number; el: number; D: number; sx: number; sy: number }
const rad = (d: number) => (d * Math.PI) / 180;

export default class Key extends Scene {
  final = new FSPass(FINAL, {
    scene: { value: null }, kc: { value: new THREE.Vector2() }, zoom: { value: END_Z }, irisR: { value: 0 }, irisC: { value: new THREE.Vector2(ROSE_END.x, ROSE_END.y) },
    edgeOn: { value: 0 }, fadeOut: { value: 0 }, t: { value: 0 }, glow: { value: 0 },
  });
  sceneRT = makeRT();
  text = new Layer2D();
  lines = new LineBatch(6000, { blend: 'add' });
  three = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(20, W / H, 0.1, 200);
  keyG = new THREE.Group();
  cutG = new THREE.Group();
  extG = new THREE.Group();
  pinKey: THREE.Mesh[] = []; pinDrv: THREE.Mesh[] = []; springs: THREE.Mesh[] = []; tags: THREE.Mesh[] = [];
  tagLit: THREE.Texture[] = []; tagDim: THREE.Texture[] = [];
  plugDisc!: THREE.Mesh; dialTex!: THREE.CanvasTexture; dialCv!: HTMLCanvasElement;
  lineRef: any; T0 = 0;
  roseKm = kmOf(ROSE_LONLAT.lon, ROSE_LONLAT.lat);

  override async init() {
    const { renderer } = this.ctx;
    this.T0 = this.ctx.start;
    this.lineRef = lineByScene(this.ctx.lyrics, 'key');
    const env = makeStudioEnv(renderer);
    this.three.environment = env;
    this.buildKey(); this.buildCutaway(); this.buildExterior();
    this.three.add(this.keyG, this.cutG, this.extG);
    const keyL = new THREE.DirectionalLight(lin(LIN.bone), 2.2); keyL.position.set(-6, 9, 12); this.three.add(keyL);
    const rim = new THREE.DirectionalLight(lin(LIN.signal), 4.0); rim.position.set(8, 4, -8); this.three.add(rim);
  }

  buildKey() {
    const brass = new THREE.MeshPhysicalMaterial({ color: lin([0.86, 0.50, 0.14]), metalness: 1, roughness: 0.28, envMapIntensity: 1.25, clearcoat: 0.25, clearcoatRoughness: 0.3 });
    const silicon = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: padTexture(), metalness: 0.9, roughness: 0.22, envMapIntensity: 1.1 });
    const inlay = new THREE.MeshStandardMaterial({ color: lin(LIN.ember), metalness: 1, roughness: 0.2, envMapIntensity: 1.2, emissive: lin(LIN.signal, 0.25) });
    // bow: a disc with an 8-point star cut-out (the rose's star), bevelled
    const sh = new THREE.Shape(); sh.absarc(0, 0, 1.0, 0, TAU, false);
    const hole = new THREE.Path();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, r = i % 4 === 0 ? 0.80 : i % 2 === 0 ? 0.56 : 0.30;
      const x = Math.sin(a) * r, y = Math.cos(a) * r;
      i ? hole.lineTo(x, y) : hole.moveTo(x, y);
    }
    hole.closePath(); sh.holes.push(hole);
    const bowGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 64 });
    bowGeo.translate(0, 0, -0.08);
    const bow = new THREE.Mesh(bowGeo, brass); bow.position.x = BOW_X; this.keyG.add(bow);
    // inlaid ring on the bow
    const ring = new THREE.Shape(); ring.absarc(0, 0, 0.925, 0, TAU, false);
    const rh = new THREE.Path(); rh.absarc(0, 0, 0.905, 0, TAU, true); ring.holes.push(rh);
    const rg = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.012, bevelEnabled: false, curveSegments: 96 }), inlay);
    rg.position.set(BOW_X, 0, 0.1); this.keyG.add(rg);
    // neck and collar
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 24), brass); neck.rotation.z = Math.PI / 2; neck.position.x = BLADE_LEN + 0.15; this.keyG.add(neck);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.12, 40), brass); collar.rotation.z = Math.PI / 2; collar.position.x = BLADE_LEN + 0.04; this.keyG.add(collar);
    // blade: extruded profile
    const b = new THREE.Shape();
    b.moveTo(0, BLADE_BOT + 0.1); b.lineTo(0.08, BLADE_BOT);
    b.lineTo(BLADE_LEN, BLADE_BOT); b.lineTo(BLADE_LEN, BLADE_TOP);
    for (let i = PROFILE.length - 1; i >= 0; i--) b.lineTo(PROFILE[i]![0], PROFILE[i]![1]);
    b.closePath();
    const bg = new THREE.ExtrudeGeometry(b, { depth: 0.10, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    bg.translate(0, 0, -0.05);
    this.keyG.add(new THREE.Mesh(bg, silicon));
  }

  buildCutaway() {
    const hatchH = hatchTexture('#1e1e22', 'rgba(238,233,223,0.38)');
    const hatchP = hatchTexture('#3a2a12', 'rgba(255,164,27,0.55)');
    const mk = (map: THREE.Texture, rough = 0.5) => [new THREE.MeshStandardMaterial({ map, metalness: 0.55, roughness: rough, envMapIntensity: 0.9 }), new THREE.MeshStandardMaterial({ color: lin([0.5, 0.48, 0.45]), metalness: 1, roughness: 0.3, envMapIntensity: 1.1 })];
    const matH = mk(hatchH), matP = mk(hatchP);
    const back = new THREE.MeshStandardMaterial({ color: lin([0.07, 0.07, 0.08]), metalness: 0.9, roughness: 0.4, envMapIntensity: 0.6 });
    const ext = (s: THREE.Shape, z0: number, z1: number, mats: THREE.Material[] | THREE.Material) => {
      const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false });
      g.translate(0, 0, z0);
      const m = new THREE.Mesh(g, mats); this.cutG.add(m); return m;
    };
    // back slab: one solid block behind the section plane
    const bs = new THREE.Shape(); bs.moveTo(LX0, -1.9); bs.lineTo(LX1, -1.9); bs.lineTo(LX1, 2.05); bs.lineTo(LX0, 2.05); bs.closePath();
    ext(bs, -0.9, -0.3, back);
    // housing front slab: outer rect with the bore + five chamber notches as its hole
    const hs = new THREE.Shape(); hs.moveTo(LX0, -1.9); hs.lineTo(LX1, -1.9); hs.lineTo(LX1, 2.05); hs.lineTo(LX0, 2.05); hs.closePath();
    const hole = new THREE.Path(); const P = YS + 0.02;
    hole.moveTo(LX0 + 0.0, -P); hole.lineTo(LX1, -P); hole.lineTo(LX1, P);
    for (let j = 4; j >= 0; j--) { const x = CH_X[j]!; hole.lineTo(x + 0.16, P); hole.lineTo(x + 0.16, 1.78); hole.lineTo(x - 0.16, 1.78); hole.lineTo(x - 0.16, P); }
    hole.lineTo(LX0, P); hole.closePath(); hs.holes.push(hole);
    ext(hs, -0.3, 0, matH);
    // plug front: C-shaped body (back wall, bottom wall) + top-wall teeth between the chambers
    const ps = new THREE.Shape();
    const kb = LX0 + 0.16;
    ps.moveTo(LX0 + 0.02, -YS); ps.lineTo(LX1, -YS); ps.lineTo(LX1, KEYWAY.lo); ps.lineTo(kb, KEYWAY.lo); ps.lineTo(kb, KEYWAY.hi); ps.lineTo(kb - 0.0, YS); ps.lineTo(LX0 + 0.02, YS); ps.closePath();
    ext(ps, -0.3, 0, matP);
    const edges = [LX0 + 0.02, ...CH_X.flatMap((x) => [x - 0.16, x + 0.16]), LX1];
    for (let k = 0; k < edges.length; k += 2) {
      const x0 = edges[k]!, x1 = edges[k + 1]!;
      if (x1 - x0 < 0.05) continue;
      const ts = new THREE.Shape(); ts.moveTo(Math.max(x0, kb), KEYWAY.hi); ts.lineTo(x1, KEYWAY.hi); ts.lineTo(x1, YS); ts.lineTo(Math.max(x0, kb), YS); ts.closePath();
      if (x1 > kb + 0.02) ext(ts, -0.3, 0, matP);
    }
    // pins, springs, tags
    const steel = new THREE.MeshStandardMaterial({ color: lin([0.8, 0.78, 0.74]), metalness: 1, roughness: 0.2, envMapIntensity: 1.3 });
    const drv = new THREE.MeshStandardMaterial({ color: lin([0.72, 0.62, 0.5]), metalness: 1, roughness: 0.22, envMapIntensity: 1.3, emissive: lin(LIN.signal, 0.0) });
    const springMat = new THREE.MeshStandardMaterial({ color: lin(LIN.signal), metalness: 1, roughness: 0.3, envMapIntensity: 1.0, emissive: lin(LIN.signal, 0.15) });
    // unit spring: a helix of height 1 along y
    const sp: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU * 6; sp.push(new THREE.Vector3(Math.cos(a) * 0.085, i / 96, Math.sin(a) * 0.085)); }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 220, 0.014, 6, false);
    for (let j = 0; j < 5; j++) {
      const lp = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0.115, 0.06), new THREE.Vector2(0.12, PIN_LEN[j]! - 0.02), new THREE.Vector2(0.105, PIN_LEN[j]!), new THREE.Vector2(0, PIN_LEN[j]!)], 28);
      const kp = new THREE.Mesh(lp, steel); kp.position.z = -0.12; this.cutG.add(kp); this.pinKey.push(kp);
      const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, DRIVER, 28), drv); dp.position.z = -0.12; this.cutG.add(dp); this.pinDrv.push(dp);
      const s = new THREE.Mesh(springGeo, springMat); s.position.z = -0.12; this.cutG.add(s); this.springs.push(s);
      this.tagDim.push(tagTexture(TAGS[j]!, false)); this.tagLit.push(tagTexture(TAGS[j]!, true));
      const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.172), new THREE.MeshBasicMaterial({ map: this.tagDim[j]! }));
      tg.position.z = 0.012; this.cutG.add(tg); this.tags.push(tg);
    }
  }

  buildExterior() {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, LX1 - LX0, 96), new THREE.MeshStandardMaterial({ color: lin([0.42, 0.40, 0.38]), metalness: 1, roughness: 0.34, envMapIntensity: 1.2 }));
    body.rotation.z = Math.PI / 2; body.position.x = (LX0 + LX1) / 2 - 0.02; this.extG.add(body);
    this.dialCv = document.createElement('canvas'); this.dialCv.width = this.dialCv.height = 1024;
    this.dialTex = new THREE.CanvasTexture(this.dialCv); this.dialTex.colorSpace = THREE.SRGBColorSpace; this.dialTex.anisotropy = 8;
    const dg = new THREE.CircleGeometry(2.0, 96); dg.rotateY(Math.PI / 2);
    const dial = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ map: this.dialTex, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.8 }));
    dial.position.x = LX1 + 0.002; this.extG.add(dial);
    // plug disc (turns with the key)
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(256, 256, 20, 256, 256, 256); g.addColorStop(0, '#c58a2a'); g.addColorStop(1, '#8e5f17');
    c.fillStyle = g; c.beginPath(); c.arc(256, 256, 256, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(10,10,11,0.5)'; c.lineWidth = 3;
    for (let r = 40; r < 256; r += 18) { c.beginPath(); c.arc(256, 256, r, 0, TAU); c.stroke(); }
    c.fillStyle = '#0a0a0b'; c.fillRect(256 - 14, 256 - 150, 28, 300);
    const pt = new THREE.CanvasTexture(cv); pt.colorSpace = THREE.SRGBColorSpace;
    const pg = new THREE.CircleGeometry(0.95, 64); pg.rotateY(Math.PI / 2);
    this.plugDisc = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: pt, metalness: 0.8, roughness: 0.35, envMapIntensity: 1.0 }));
    this.plugDisc.position.x = LX1 + 0.012; this.extG.add(this.plugDisc);
  }

  drawDial(v: number, readout: boolean) {
    const c = this.dialCv.getContext('2d')!;
    const S = 1024, R = 500;
    c.clearRect(0, 0, S, S);
    const g = c.createRadialGradient(S / 2 - 120, S / 2 - 160, 30, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#2a2a2e'); g.addColorStop(1, '#101012');
    c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, R, 0, TAU); c.fill();
    c.strokeStyle = '#EEE9DF'; c.lineWidth = 5; c.beginPath(); c.arc(S / 2, S / 2, R - 4, 0, TAU); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.arc(S / 2, S / 2, R - 20, 0, TAU); c.stroke();
    // the scale: 270 degrees, 0 .. 20,000
    const A0 = -225, SW = 270; // degrees from +x going clockwise (canvas): start lower-left
    const ang = (val: number) => ((A0 + (SW * val) / 20000) * Math.PI) / 180;
    for (let k = 0; k <= 80; k++) {
      const val = k * 250, big = k % 8 === 0, mid = k % 4 === 0;
      const a = ang(val), r0 = R - (big ? 92 : mid ? 70 : 52), r1 = R - 28;
      c.strokeStyle = '#EEE9DF'; c.lineWidth = big ? 6 : mid ? 3.5 : 2;
      c.beginPath(); c.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0); c.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); c.stroke();
      if (big) {
        c.fillStyle = '#EEE9DF'; c.font = `500 34px "Plex-500", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(val / 1000) + 'k', S / 2 + Math.cos(a) * (R - 128), S / 2 + Math.sin(a) * (R - 128));
      }
    }
    // the threshold tick, in export red: the only red here
    const at = ang(TPP_THRESHOLD);
    c.strokeStyle = '#E0312B'; c.lineWidth = 12;
    c.beginPath(); c.moveTo(S / 2 + Math.cos(at) * (R - 118), S / 2 + Math.sin(at) * (R - 118)); c.lineTo(S / 2 + Math.cos(at) * (R - 22), S / 2 + Math.sin(at) * (R - 22)); c.stroke();
    c.fillStyle = '#E0312B'; c.font = `600 28px "Plex-600", monospace`; c.textAlign = 'center';
    c.fillText('4,800', S / 2 + Math.cos(at) * (R - 150), S / 2 + Math.sin(at) * (R - 150));
    c.fillStyle = 'rgba(238,233,223,0.7)'; c.font = `500 30px "Plex-500", monospace`;
    c.fillText('TPP · ECCN 3A090', S / 2, S / 2 + 330);
    // needle
    const an = ang(v);
    c.save(); c.translate(S / 2, S / 2); c.rotate(an);
    c.fillStyle = '#FFA41B'; c.beginPath(); c.moveTo(R - 46, 0); c.lineTo(80, -9); c.lineTo(80, 9); c.closePath(); c.fill();
    c.fillStyle = '#FFD27A'; c.fillRect(R - 46 - 70, -2, 70, 4);
    c.restore();
    if (readout) { c.fillStyle = '#FFA41B'; c.font = `700 64px "Plex-700", monospace`; c.textAlign = 'center'; c.fillText(Math.round(v).toLocaleString('en-US'), S / 2, S / 2 + 400); }
    this.dialTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the director
  poses(): { t: number; pose: CamPose }[] {
    const T = this.T0;
    return [
      { t: T, pose: { tx: 0, ty: 0, tz: 0, az: 0, el: 0, D: 18, sx: ROSE_END.x, sy: ROSE_END.y } },
      { t: T + 0.47, pose: { tx: -4.6, ty: 0.15, tz: 0, az: rad(-12), el: rad(4), D: 25.5, sx: 960, sy: 470 } },
      { t: T + 0.94, pose: { tx: -7.2, ty: 0.35, tz: 0, az: rad(-18), el: rad(6), D: 15.5, sx: 960, sy: 450 } },
      { t: T + 1.875, pose: { tx: -7.8, ty: 0.85, tz: 0, az: rad(-24), el: rad(9), D: 12.2, sx: 960, sy: 440 } },
      { t: T + 2.58, pose: { tx: -6.0, ty: 0.2, tz: 0, az: rad(40), el: rad(13), D: 17.5, sx: 960, sy: 540 } },
      { t: T + 3.0, pose: { tx: -6.0, ty: 0, tz: 0, az: 0, el: 0, D: 15.7, sx: 960, sy: 540 } },
    ];
  }
  camAt(t: number): CamPose {
    const shots = this.poses();
    let cur = shots[0]!.pose;
    for (let i = 1; i < shots.length; i++) {
      const a = shots[i - 1]!.pose, b = shots[i]!;
      if (t < b.t) break;
      const last = i === shots.length - 1;
      const dur = i === 4 ? 0.14 : last ? 0.75 : i === 1 ? 0.2 : 0.16;
      const e = last ? ease.inOutCubic(clamp((t - b.t) / dur)) : ease.outExpo(clamp((t - b.t) / dur));
      cur = Object.fromEntries(Object.keys(b.pose).map((k) => [k, lerp((a as any)[k], (b.pose as any)[k], e)])) as unknown as CamPose;
      if (e < 1) break;
    }
    return cur;
  }

  /** Key tip position (world x) over time. */
  tipX(t: number): number {
    const T = this.T0;
    if (t < T + 0.47) return TIP_START;
    const x1 = -5.95; // tip meets the face
    if (t < T + 0.94) return lerp(TIP_START, x1, ease.inOutCubic(clamp((t - (T + 0.47)) / 0.47)));
    if (t < T + 1.875) return lerp(x1, TIP_FINAL, ease.inQuad(clamp((t - (T + 0.94)) / 0.935)));
    return TIP_FINAL;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, T = this.T0, lt = t - T, END = this.ctx.end;
    const words = this.lineRef.words as any[];
    const alignT = T + 1.875, turnT = words[words.length - 1].start, swapT = turnT;
    const tipX = this.tipX(t);
    const turnU = ease.outBack(clamp((t - turnT) / 0.5), 1.1);
    const theta = (Math.PI / 2) * turnU;
    // ---- key
    this.keyG.position.set(tipX, 0, 0);
    this.keyG.rotation.set(theta, 0, 0);
    // a little tremor in the held key, and a roll kick when it bottoms out
    const tremor = lt < 0.94 ? 0.012 * Math.sin(t * 38) * smoothstep(0.1, 0.4, lt) : 0;
    this.keyG.rotation.z = tremor + (t >= alignT && t < alignT + 0.4 ? 0.02 * Math.exp(-(t - alignT) / 0.07) * Math.cos((t - alignT) * 60) : 0);
    // ---- pins ride the blade's profile
    const cutVisible = t < swapT;
    this.cutG.visible = cutVisible; this.extG.visible = !cutVisible;
    let nLit = 0;
    for (let j = 0; j < 5; j++) {
      const xr = CH_X[j]! - tipX;
      const aligned = t >= alignT + j * 0.04;
      let yb = Math.max(REST, topAt(xr));
      if (t >= alignT) yb = BLADE_TOP - CUTS[j]!;
      // a pin that has just been lifted over a ramp has a little spring play
      const pk = this.pinKey[j]!, pd = this.pinDrv[j]!, sp = this.springs[j]!, tg = this.tags[j]!;
      pk.position.set(CH_X[j]!, yb, -0.12);
      const topKey = yb + PIN_LEN[j]!;
      pd.position.set(CH_X[j]!, topKey + DRIVER / 2, -0.12);
      const springBase = topKey + DRIVER, springTop = 1.78;
      sp.position.set(CH_X[j]!, springBase, -0.12); sp.scale.set(1, Math.max(0.05, springTop - springBase), 1);
      tg.position.set(CH_X[j]!, topKey + DRIVER / 2, 0.012);
      const lit = aligned && t >= alignT;
      if (lit) nLit++;
      (tg.material as THREE.MeshBasicMaterial).map = lit ? this.tagLit[j]! : this.tagDim[j]!;
      (pd.material as THREE.MeshStandardMaterial).emissive.copy(lin(LIN.signal, lit ? 0.35 * (0.6 + 0.4 * pulse(t, alignT + j * 0.04, 0.3)) : 0));
    }
    // ---- dial and plug
    const tppV = lerp(1200, 4800, ease.inOutCubic(clamp((t - turnT) / 0.55)));
    if (!cutVisible) { this.drawDial(tppV, t > turnT + 0.45); this.plugDisc.rotation.x = theta; }

    // ---- camera
    const p = this.camAt(t);
    const shake = pulse(t, alignT, 0.08);
    this.cam.position.set(p.tx + Math.sin(p.az) * Math.cos(p.el) * p.D, p.ty + Math.sin(p.el) * p.D, p.tz + Math.cos(p.az) * Math.cos(p.el) * p.D);
    this.cam.up.set(0, 1, 0); this.cam.lookAt(p.tx, p.ty, p.tz);
    this.cam.setViewOffset(W, H, -(p.sx - 960), -(p.sy - 540), W, H);
    this.cam.updateMatrixWorld(true); this.cam.updateProjectionMatrix();
    clearRT(renderer, this.sceneRT, [0, 0, 0], 0);
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(this.three, this.cam);

    // ---- composite: paper / iris / ink studio
    const irisR = keys(lt, [[0, 0], [0.12, 176, ease.outQuad], [0.47, 2400, ease.inCubic], [0.48, 4000]]);
    const exitStart = END - 0.55, exitU = clamp((t - exitStart) / 0.45);
    const fu = this.final.u;
    fu.scene!.value = this.sceneRT.texture;
    (fu.kc!.value as THREE.Vector2).set(this.roseKm.x - (ROSE_END.x - 960) / END_Z, this.roseKm.y - (ROSE_END.y - 540) / END_Z);
    fu.zoom!.value = END_Z; fu.irisR!.value = irisR; fu.edgeOn!.value = lt < 0.6 ? 1 : 0;
    fu.fadeOut!.value = smoothstep(0.35, 0.9, exitU); fu.t!.value = t; fu.glow!.value = nLit / 5;
    this.final.render(renderer, out);

    // ---- overlays
    const proj = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(this.cam); return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H }; };
    const lb = this.lines; lb.clear();
    const tx = this.text; tx.clear(); const c = tx.ctx;
    // the rose on paper, until the iris takes over
    if (lt < 0.2) {
      c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(ROSE_END.x, ROSE_END.y, irisR, 0, TAU, true); c.clip('evenodd');
      drawRose(c, ROSE_END.x, ROSE_END.y, ROSE_END.r, 0, '#0A0A0B', { alpha: 1 });
      c.restore();
    }
    // iris-edge hairline bloom
    // shear line, annotations
    if (cutVisible && t >= alignT) {
      const a = proj(LX0, YS, 0.0), b = proj(LX1, YS, 0.0);
      const k = ease.outExpo(clamp((t - alignT) / 0.25));
      const glow = 0.8 + 0.5 * pulse(t, alignT, 0.3);
      lb.seg2(a.x, a.y, lerp(a.x, b.x, k), lerp(a.y, b.y, k), 2, [LIN.signal[0] * 2.6 * glow, LIN.signal[1] * 2.6 * glow, LIN.signal[2] * 2.6 * glow], 0.95);
      c.save(); c.globalAlpha = clamp((t - alignT - 0.15) / 0.15) * (1 - smoothstep(turnT - 0.1, turnT + 0.05, t));
      mono(c, 'SHEAR LINE', b.x - 4, a.y + 32 + (b.y - a.y), 13, rgba('signal', 0.95), 600, 'right', 2);
      mono(c, '5 / 5 PINS SET', b.x - 4, a.y + 52 + (b.y - a.y), 13, rgba('bone', 0.8), 500, 'right', 1.5);
      c.restore();
    }
    if (cutVisible && t >= T + 1.0) {
      // pin names as the key passes: mono callouts above each chamber
      c.save();
      for (let j = 0; j < 5; j++) {
        const tj = alignT + j * 0.04;
        const a = clamp((t - tj) / 0.15) * (1 - smoothstep(turnT - 0.1, turnT, t));
        if (a <= 0) continue;
        const q = proj(CH_X[j]!, 2.18, 0);
        c.globalAlpha = a; c.strokeStyle = rgba('bone', 0.4); c.lineWidth = 1;
        c.beginPath(); c.moveTo(q.x, q.y + 30); c.lineTo(q.x, proj(CH_X[j]!, 1.95, 0).y); c.stroke();
        c.save(); c.translate(q.x, q.y + 20); c.rotate(-Math.PI / 2);
        mono(c, TAG_NAMES[j]!, 0, 4, 12, rgba('bone', 0.75), 500, 'left', 1.2);
        c.restore();
      }
      c.restore();
    }
    // TPP readout while the dial reads
    if (!cutVisible && t > turnT + 0.1) {
      const q = proj(LX1, -2.15, 0);
      const a = clamp((t - turnT - 0.1) / 0.2) * (1 - smoothstep(END - 0.5, END - 0.3, t));
      c.save(); c.globalAlpha = a;
      mono(c, `TPP ${Math.round(tppV).toLocaleString('en-US')}`, 960, 988, 26, rgba('bone', 0.95), 700, 'center', 2);
      c.restore();
    }
    // lyric rows (two-tone across the iris edge)
    const row1 = words.slice(0, 3), row2 = words.slice(3);
    const sz = 100, fam = F.archivo(87.5, 900);
    const rowsOn = 1 - smoothstep(END - 0.7, END - 0.5, t);
    const drawRows = (ink: boolean) => {
      const o = ink ? { size: sz, family: fam, sung: 'ink', dim: 'ink', hot: '#B86A00', dimAlpha: 0.25, sungAlpha: 0.95, slam: 0.2, slide: 22 } : { size: sz, family: fam, slam: 0.2, slide: 22 };
      drawRow(c, row1, t, 96, 880, o); drawRow(c, row2, t, 96, 984, o);
    };
    c.save(); c.globalAlpha = rowsOn;
    if (irisR < 2300) {
      c.save(); c.beginPath(); c.arc(ROSE_END.x, ROSE_END.y, irisR, 0, TAU); c.clip(); drawRows(false); c.restore();
      c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(ROSE_END.x, ROSE_END.y, irisR, 0, TAU, true); c.clip('evenodd'); drawRows(true); c.restore();
    } else drawRows(false);
    c.restore();
    // the wafer map, revealed by an iris from the dial centre
    if (exitU > 0) {
      const r = WAFER.R * ease.inOutCubic(clamp(exitU / 0.55));
      c.save(); c.beginPath(); c.arc(WAFER.cx, WAFER.cy, r, 0, TAU); c.clip();
      c.fillStyle = '#0A0A0B'; c.fillRect(0, 0, W, H);
      drawWaferStatic(c, 1);
      c.restore();
      lb.seg2(WAFER.cx + r, WAFER.cy, WAFER.cx + r + 0.01, WAFER.cy, 1, [0, 0, 0], 0);
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        lb.seg2(WAFER.cx + Math.cos(a0) * r, WAFER.cy + Math.sin(a0) * r, WAFER.cx + Math.cos(a1) * r, WAFER.cy + Math.sin(a1) * r, 2.4, [LIN.signal[0] * 1.8, LIN.signal[1] * 1.8, LIN.signal[2] * 1.8], 1 - smoothstep(0.75, 1.0, exitU));
      }
    }
    lb.render(renderer, out);
    comp.draw(renderer, tx.upload(), out);
    const paperK = 1 - smoothstep(0.1, 0.4, lt);
    return { paper: paperK > 0.5 ? 1 : 0, bloom: 0.5, bloomThreshold: 1.0, halation: 0.12, vignette: 0.3, ca: 1.0 + 3.5 * shake, zoom: 1 + 0.03 * shake + 0.02 * pulse(t, turnT, 0.1), shake: [Math.sin(t * 150) * 5 * shake, Math.cos(t * 170) * 6 * shake] as [number, number] };
  }
}
