// WHOSCROWN (bars 56-58, 105.0-108.75): "Who's left holding the crown?"
// The void. After the blackout one amber point is left (the top light, at (960, ~190) px: the handoff
// from `crack`). It warms up; under it an EMPTY CROWN made of transistor fins floats and turns slowly:
// 56 fins in stair-stepped peaks (the silhouette of a crown), wrapped by two gate bands on an oxide
// ring, hatched like an engraving by the one light. The deliberate long hold of the film: the camera
// only breathes (a slow orbit and rise); every syllable of the question makes a glint run round the
// fins. On "crown?" the camera drops edge-on, the crown flattens into a single hot line across the
// frame: the held line `hold` opens on (y = 540, x = 120..1800).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT, W, H, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, keys, lerp, prog, smoothstep, mulberry32, TAU } from '../engine/util';
import { lineByScene, sparkHead } from './_motifs';
import { drawBridgeLine } from './atom-kit';

export const STRING_Y = 540, STRING_X0 = 120, STRING_X1 = 1800;
/** where the last amber point of `crack` sits (and the top light of this plate at its first frame) */
export const STAR_PX = { x: 960, y: 190 };

const N_FIN = 56, R = 0.9;
const FOV = 28;

const VERT = /* glsl */ `
varying vec3 vP; varying vec3 vN;
void main() {
  vec4 lp = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
    vec3 c0 = normalize(instanceMatrix[0].xyz), c1 = normalize(instanceMatrix[1].xyz), c2 = normalize(instanceMatrix[2].xyz);
    n = mat3(c0, c1, c2) * n;
  #endif
  vec4 wp = modelMatrix * lp;
  vP = wp.xyz; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vP; varying vec3 vN;
uniform vec3 uCam; uniform vec3 uLight; uniform float uI;
uniform float uGphi[6]; uniform float uGage[6];
const float PI_ = 3.14159265359;
float hatchL(float u, float dark) { // white-line engraving, width follows the light
  float fw = fwidth(u);
  float f = abs(fract(u) - 0.5);
  float hw = 0.5 * clamp(dark, 0.0, 1.0);
  float a = max(fw, 1e-3);
  float cov = 1.0 - smoothstep(hw - a, hw + a, 0.5 - f);
  return cov * (1.0 - smoothstep(0.35, 0.7, fw)); // fade lines out before they alias
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vP);
  vec3 toL = uLight - vP;
  float dL = length(toL);
  vec3 Ld = toL / dL;
  float dif = max(dot(N, Ld), 0.0);
  // the cone of the one top light, wide enough to take the whole crown
  float cosA = dot(-Ld, vec3(0.0, -1.0, 0.0));
  float cone = smoothstep(cos(1.3), cos(0.5), cosA);
  float fall = 1.0 / (1.0 + 0.10 * dL * dL);
  float slab = mix(1.0, 0.4, step(vP.y, 0.11));
  float tone = dif * cone * fall * 3.0 * uI * slab;
  // glints run round the fins on every sung syllable
  float phi = atan(vP.z, vP.x);
  float gl = 0.0;
  for (int i = 0; i < 6; i++) {
    float d = abs(mod(phi - uGphi[i] + PI_, 2.0 * PI_) - PI_);
    gl += exp(-d * d / (2.0 * 0.16 * 0.16)) * exp(-uGage[i] / 0.45) * step(0.0, uGage[i]);
  }
  float hy = clamp(vP.y / 1.25, 0.0, 1.0);
  tone += gl * (0.35 + 0.9 * hy) * uI;
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
  float top = smoothstep(0.55, 0.95, N.y);
  float dark = clamp(tone * 0.95 + 0.04 + rim * 0.2, 0.0, 1.0);
  // the hatch follows the geometry: rows along y on the sides, rings on the tops
  float u = mix(vP.y * 44.0, length(vP.xz) * 44.0, top);
  float ln = hatchL(u, dark);
  // a second, fine line direction in the highlights (cross-hatch of the engraving)
  float u2 = (vP.x + vP.z) * 34.0 + vP.y * 14.0;
  ln = max(ln, hatchL(u2, clamp(dark * 2.0 - 1.0, 0.0, 1.0)) * 0.8);
  vec3 bone = vec3(0.80, 0.77, 0.70) * 0.80;
  vec3 col = bone * ln * clamp(0.25 + tone * 0.9, 0.0, 1.0);
  col += vec3(1.0, 0.64, 0.10) * (rim * 0.9 + top * 0.5) * clamp(tone, 0.0, 1.2) * ln * 1.35; // amber re-ink on rims and tops
  col += vec3(0.0035, 0.0028, 0.0018) * (cone * fall) * uI; // the barest body so a silhouette reads
  col *= clamp(uI * 4.0, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export default class WhosCrownScene extends Scene {
  layer = new Layer2D();
  glow = new LineBatch(4000, { blend: 'add' });
  rt = makeRT(W, H, { samples: 4 });
  hazePass!: FSPass;
  scene3 = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 50);
  mat!: THREE.ShaderMaterial;
  light = new THREE.Vector3(0, 2.15, 0);
  /** sung syllable onsets of the question, with the azimuth of the glint each sets off */
  syl: { t: number; phi: number }[] = [];

  override init() {
    const line = lineByScene(this.ctx.lyrics, 'whoscrown');
    const phis = [0.4, 1.9, 3.3, 4.2, 5.5, 2.6, 0.9];
    let k = 0;
    for (const w of line.words) for (const s of (w.syl ?? [[w.start, w.end]])) this.syl.push({ t: s[0], phi: phis[k++ % phis.length]! });

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uLight: { value: this.light }, uI: { value: 1 },
        uGphi: { value: new Array(6).fill(0) }, uGage: { value: new Array(6).fill(-1) },
      },
    });
    // fins: stair-stepped peaks round the ring, alternating tall and short crown points
    const box = new THREE.BoxGeometry(1, 1, 1);
    const fins = new THREE.InstancedMesh(box, this.mat, N_FIN);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N_FIN; i++) {
      const th = (i / N_FIN) * TAU;
      const x = (i / N_FIN) * 8;
      const f = x - Math.round(x);
      const peak = Math.round(x) % 2 === 0 ? 1.12 : 0.86;
      const tri = 1 - 2 * Math.abs(f);
      const h = 0.30 + peak * 0.84 * (Math.round(tri * 3.6) / 3.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th);
      s.set(0.15, h, 0.05);
      p.set(Math.cos(th) * R, h / 2, Math.sin(th) * R);
      m.compose(p, q, s);
      fins.setMatrixAt(i, m);
    }
    this.scene3.add(fins);
    // oxide ring and two gate bands wrapped round the fins
    const prof = [new THREE.Vector2(R - 0.16, 0), new THREE.Vector2(R + 0.16, 0), new THREE.Vector2(R + 0.16, 0.09), new THREE.Vector2(R - 0.16, 0.09), new THREE.Vector2(R - 0.16, 0)];
    this.scene3.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 128), this.mat));
    for (const y of [0.19, 0.30]) {
      const tor = new THREE.Mesh(new THREE.TorusGeometry(R, 0.034, 10, 160), this.mat);
      tor.rotation.x = Math.PI / 2; tor.position.y = y;
      this.scene3.add(tor);
    }
    // the light's height is solved so that, at the first frame, it sits exactly at STAR_PX (the handoff from `crack`)
    this.setCam(0, 1);
    let lo = 0.8, hi = 4;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const y = (0.5 - new THREE.Vector3(0, mid, 0).project(this.cam).y * 0.5) * H;
      if (y > STAR_PX.y) lo = mid; else hi = mid;
    }
    this.light.y = (lo + hi) / 2;
    this.cam.clearViewOffset();
    this.hazePass = new FSPass(/* glsl */ `
      uniform vec2 uP; uniform float uI, uT, uCol;
      void main() {
        vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
        float d = px.y - uP.y;
        float hw = 14.0 + max(d, 0.0) * 0.62;
        float x = (px.x - uP.x) / hw;
        float n = 0.82 + 0.18 * snoise(vec2(px.x * 0.004 + uT * 0.05, px.y * 0.006 - uT * 0.04));
        float cone = exp(-x * x * 2.2) * smoothstep(-6.0, 40.0, d) * exp(-max(d, 0.0) / 820.0) * n;
        vec3 col = C_SIGNAL * cone * 0.085 * uI;
        // a faint pool where the beam would meet a floor that is not there
        fragColor = vec4(col + C_INK * 0.0, 1.0);
      }`, { uP: { value: new THREE.Vector2(960, 190) }, uI: { value: 0 }, uT: { value: 0 }, uCol: { value: 0 } });
  }

  /** Camera pose for the plate (local time lt). */
  private pose(lt: number, T: number) {
    const dur = T;
    const k = ease.inOutQuad(clamp(lt / dur));
    const az = -0.5 + 1.1 * k + 0.06 * Math.sin(lt * 0.9);
    let el = keys(lt, [[0, 0.10, ease.linear], [1.6, 0.20, ease.inOutQuad], [2.9, 0.30, ease.inOutQuad], [3.25, 0.20, ease.inOutCubic], [3.55, 0.0, ease.inOutCubic]]);
    const dist = lerp(7.2, 5.8, ease.inOutQuad(clamp(lt / 3.2)));
    return { az, el, dist };
  }

  /** Place the camera for local time lt (lens shift `lift` 1 = crown low in frame, 0 = centred). */
  private setCam(lt: number, lift: number) {
    const T = this.ctx.end - this.ctx.start;
    const { az, el, dist } = this.pose(lt, T);
    const target = new THREE.Vector3(0, 0.52, 0);
    this.cam.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az));
    this.cam.lookAt(target);
    this.cam.setViewOffset(W, H, 0, -30 * lift, W, H);
    this.cam.updateMatrixWorld();
    this.cam.updateProjectionMatrix();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, lyrics } = this.ctx;
    const t = f.t, lt = f.lt, T = this.ctx.end - this.ctx.start;
    const line = lineByScene(lyrics, 'whoscrown');
    const collapse = ease.inQuart(prog(lt, T - 0.62, T - 0.08));      // flatten into the line
    const lift = 1 - ease.inOutCubic(prog(lt, T - 0.9, T - 0.4));     // lens shift returns to centre

    this.setCam(lt, lift);

    // the light warms up from a single point
    const warm = ease.outCubic(prog(lt, 0.15, 1.5));
    const lightI = warm * (1 - smoothstep(T - 0.45, T - 0.1, lt));
    let breath = 0;
    this.syl.forEach((s, i) => { if (t >= s.t) breath = Math.max(breath, Math.pow(0.5, (t - s.t) / 0.18)); });
    const u = this.mat.uniforms;
    u.uCam!.value.copy(this.cam.position);
    u.uI!.value = lightI * (1 + 0.14 * breath);
    // the six most recent syllables drive the glints
    const recent = this.syl.filter((s) => t >= s.t).slice(-6);
    for (let i = 0; i < 6; i++) { const r = recent[i]; (u.uGphi!.value as number[])[i] = r ? r.phi : 0; (u.uGage!.value as number[])[i] = r ? t - r.t : -1; }

    // projected top light
    const lp = this.light.clone().project(this.cam);
    const P = { x: (lp.x * 0.5 + 0.5) * W, y: (0.5 - lp.y * 0.5) * H };

    // ---- 3D crown into its own target (with alpha), cone haze and star on `out`
    this.hazePass.u.uP!.value.set(P.x, P.y);
    this.hazePass.u.uI!.value = lightI * (1 + 0.12 * breath);
    this.hazePass.u.uT!.value = t;
    this.hazePass.render(renderer, out);

    clearRT(renderer, this.rt, [0, 0, 0], 0);
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene3, this.cam);
    const sy = 1 + 260 * collapse * collapse, sx = 1 - 0.46 * collapse;
    comp.draw(renderer, this.rt.texture, out, { scale: [sx, sy], premult: false });

    // ---- lines: star, dust, the final held line
    const lb = this.glow; lb.clear();
    const star = warm * (1 - smoothstep(T - 0.5, T - 0.2, lt));
    if (star > 0.01) {
      // the one amber point: at frame 0 it is all that is left of the blackout
      sparkHead(lb, P.x, P.y, t, 0.7 + 0.5 * warm + 0.5 * breath * warm, 0.55 + 0.45 * star);
    } else if (lt < 0.15) sparkHead(lb, P.x, P.y, t, 0.7, 1);
    // dust in the beam
    const rnd = mulberry32(31);
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.15, y0 = rnd() * 2.2, sp = 0.02 + rnd() * 0.05;
      const y = (y0 + t * sp * (1 + hash(i, 3))) % 2.2;
      const wp = new THREE.Vector3(Math.cos(a + t * 0.04 * (i % 3 - 1)) * r, y, Math.sin(a + t * 0.04) * r).project(this.cam);
      if (wp.z > 1) continue;
      const x = (wp.x * 0.5 + 0.5) * W, yy = (0.5 - wp.y * 0.5) * H;
      const inBeam = Math.exp(-Math.pow((x - P.x) / (14 + Math.max(0, yy - P.y) * 0.62), 2) * 2.2);
      const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + 3 * hash(i, 9)) + i);
      const I = lightI * inBeam * tw * 1.4;
      if (I < 0.02) continue;
      lb.seg2(x, yy, x + 0.01, yy, 1.4 + hash(i, 5) * 1.6, [LIN.ember[0] * I, LIN.ember[1] * I, LIN.ember[2] * I], 0.9);
    }
    // the line the crown becomes: grows from the crown's flattened rim to the string of `hold`
    const lineK = ease.outCubic(prog(lt, T - 0.5, T - 0.02));
    if (lineK > 0.001) {
      const half = lerp(300, (STRING_X1 - STRING_X0) / 2, lineK), cx = 960;
      const wI = 0.35 + 1.4 * lineK;
      lb.seg2(cx - half, STRING_Y, cx + half, STRING_Y, 1.6 + 1.4 * lineK, [LIN.signal[0] * 2.2 * wI, LIN.signal[1] * 2.2 * wI, LIN.signal[2] * 2.2 * wI], 1);
      lb.seg2(cx - half, STRING_Y, cx + half, STRING_Y, 0.8, [3, 2.5, 2], lineK);
    }
    lb.render(renderer, out);

    // ---- type
    const Lr = this.layer; Lr.clear();
    const c = Lr.ctx;
    c.save();
    const ui = 1 - smoothstep(T - 0.6, T - 0.25, lt);
    c.globalAlpha = ui;
    drawBridgeLine(c, line, t, { x: W / 2, y: 984, size: 58, align: 'center', dim: 0.3, lead: 0.35 });
    c.font = font(F.mono(500), 13); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.4); c.textBaseline = 'alphabetic';
    c.fillText('FIG. 9 · CROWN (UNOCCUPIED) · 56 FINS · 8 POINTS · 2 GATES', 96, 70);
    c.restore();
    comp.draw(renderer, Lr.upload(), out);

    this.cam.clearViewOffset();
    return { bloom: 0.75, bloomThreshold: 0.8, vignette: 0.5, ca: 0.3, grain: 0.07 };
  }
}
