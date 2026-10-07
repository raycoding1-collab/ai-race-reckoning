import * as THREE from 'three';
import { PORTAL, COLORS } from './constants.js';

// ---------------------------------------------------------------------------
// Recursive stencil portal rendering.
//
// For each visible portal we (1) bump the stencil inside its outline,
// (2) render the world from a virtual camera behind the linked portal with an
// oblique near plane, recursing for portals visible inside that view,
// (3) restore the stencil, then (4) write the portal's depth so the outer
// view occludes it correctly and draw the outer view on top.
// ---------------------------------------------------------------------------

const SEG = 64;

function ovalShape(scale = 1) {
  const pts = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    pts.push([Math.cos(a) * PORTAL.halfWidth * scale, Math.sin(a) * PORTAL.halfHeight * scale]);
  }
  return pts;
}

function discGeometry(z, scale = 1) {
  const pts = ovalShape(scale);
  const pos = [0, 0, z];
  const uv = [0.5, 0.5];
  for (const [x, y] of pts) { pos.push(x, y, z); uv.push(0.5 + x / (2 * PORTAL.halfWidth * scale), 0.5 + y / (2 * PORTAL.halfHeight * scale)); }
  const idx = [];
  for (let i = 0; i < SEG; i++) idx.push(0, 1 + i, 1 + ((i + 1) % SEG));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function tunnelGeometry(z0, z1) {
  const pts = ovalShape(1);
  const pos = [], idx = [];
  for (const [x, y] of pts) pos.push(x, y, z0, x, y, z1);
  for (let i = 0; i < SEG; i++) {
    const a = i * 2, b = ((i + 1) % SEG) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // back cap
  const c = pos.length / 3;
  pos.push(0, 0, z1);
  for (let i = 0; i < SEG; i++) idx.push(c, ((i + 1) % SEG) * 2 + 1, i * 2 + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Oval band between two scales of the portal outline. The shaders work from
// the local position, so the band can be any size without changing the look.
function ringGeometry(inner, outer, seg = 128) {
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * PORTAL.halfWidth * inner, s * PORTAL.halfHeight * inner, 0);
    pos.push(c * PORTAL.halfWidth * outer, s * PORTAL.halfHeight * outer, 0);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Shared GLSL: 3D value noise + fbm (cheap, seamless when sampled on a circle)
export const NOISE_GLSL = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vn3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;
// Shader tail: tone map + colour space when drawing straight to the screen
// (both are no-ops when rendering into the HDR post-processing target).
export const OUT_GLSL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
// Premultiplied "over": rgb is added, alpha darkens what is behind. Keeps
// coloured glows saturated on bright white walls, where additive washes out.
export function premultiplied(mat) {
  mat.transparent = true;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
  mat.depthWrite = false;
  return mat;
}

const LOCAL_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HALF = new THREE.Vector2(PORTAL.halfWidth, PORTAL.halfHeight);

// The animated fiery border: a turbulent band hugging the oval, white-hot at
// the inner edge, flowing around the rim and fading out into a soft glow.
function rimMaterial(color, glow) {
  return premultiplied(new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpen: { value: 1 }, uFlash: { value: 0 }, uSeed: { value: Math.random() * 50 },
      uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) }, uHalf: { value: HALF },
    },
    vertexShader: LOCAL_VS,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime, uOpen, uFlash, uSeed; uniform vec3 uColor, uGlow; uniform vec2 uHalf; varying vec2 vP;
      void main(){
        vec2 q = vP / uHalf;
        float e = max(length(q), 1e-4);
        float d = (e - 1.0) / (length(vP / (uHalf * uHalf)) / e);   // signed distance to the edge (units, + outside)
        vec2 cs = q / e;
        float t = uTime + uSeed;
        // two noise layers sampled on rotating circles: flames flow around the oval
        float n1 = fbm3(vec3(rot2(t * 0.55) * cs * 3.4, d * 0.11 - t * 1.25));
        float n2 = fbm3(vec3(rot2(-t * 0.9) * cs * 7.5 + 4.0, d * 0.24 - t * 2.3));
        float n = smoothstep(0.22, 0.78, n1 * 0.7 + n2 * 0.5 - 0.1);
        float dout = max(d, 0.0);
        float h = 2.6 + 12.0 * n * n;                                      // tongue length
        float flame = (1.0 - smoothstep(h * 0.35, h, dout)) * smoothstep(-5.0, -0.5, d);
        float lick = flame * (0.25 + 0.75 * n) * (0.5 + 1.0 * n2) * (1.0 - 0.5 * dout / h);                           // turbulent brightness
        float core = exp(-abs(d + 0.6) / 1.1);                         // hot inner edge
        float glow = exp(-dout / 9.0) * smoothstep(-6.0, 0.0, d);
        float inner = d < 0.0 ? exp(d / 2.5) : 0.0;                    // light spilling into the opening
        float tint = d < 0.0 ? exp(d / 12.0) : 0.0;                    // faint coloured edge of the view
        float lim = (1.0 - smoothstep(1.3, 1.46, e)) * smoothstep(0.8, 0.86, e);
        vec3 col = uColor * (lick * 1.15 + glow * 0.22 + inner * 0.8 + tint * 0.15)
                 + uGlow * (core * (0.8 + 0.9 * n) + pow(lick, 3.0) * 1.4)
                 + (uColor * 1.6 + uGlow * 0.6) * uFlash * exp(-abs(d) / 7.0) * 2.2;
        float a = clamp(flame * 0.97 + core * 0.9 + glow * 0.25 + inner * 0.55 + tint * 0.12, 0.0, 1.0);
        col *= lim * uOpen; a *= lim * min(uOpen, 1.0);
        gl_FragColor = vec4(col, a);
        ${OUT_GLSL}
      }`,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  }));
}

// Unlinked portal: a churning, swirling coloured vortex instead of a view.
function fillMaterial(color, glow) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) }, uHalf: { value: HALF } },
    vertexShader: LOCAL_VS,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime, uFlash; uniform vec3 uColor, uGlow; uniform vec2 uHalf; varying vec2 vP;
      void main(){
        vec2 q = vP / uHalf;
        float r = length(q);
        float t = uTime;
        vec2 p1 = rot2(t * 0.8 + r * 4.2) * q;          // twist grows outward: spiral arms
        vec2 p2 = rot2(-t * 0.45 + r * 6.5) * q * 1.6;
        float n1 = fbm3(vec3(p1 * 2.4, t * 0.3));
        float n2 = fbm3(vec3(p2 * 3.6 + n1 * 1.4, t * 0.45 + 3.0));
        float arms = 0.5 + 0.5 * sin(atan(p1.y, p1.x) * 3.0 + n2 * 5.0 - r * 3.0);
        float v = clamp(n1 * 0.7 + n2 * 0.75 + arms * 0.3 - 0.45, 0.0, 1.0);
        float edge = smoothstep(0.5, 1.0, r);
        vec3 col = uColor * (0.10 + 1.1 * v + edge * 0.55) + uGlow * (pow(v, 3.0) * 1.4 + edge * edge * edge * 1.1);
        col *= 0.55 + 0.45 * smoothstep(0.0, 0.6, r);   // deeper in the middle
        col += (uColor + uGlow * 0.5) * uFlash * 1.5;
        gl_FragColor = vec4(col, 1.0);
        ${OUT_GLSL}
      }`,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
}

// Embers peeling off the rim and drifting out of the wall (animated on the GPU)
function rimSparksMaterial(glow) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uRes: { value: new THREE.Vector2(1280, 720) }, uGlow: { value: new THREE.Color(glow).multiplyScalar(2.2) }, uHalf: { value: HALF } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uOpen; uniform vec2 uRes, uHalf; varying float vA;
      void main(){
        float age = fract(uTime * aSeed.z + aSeed.y);
        float a = aSeed.x + age * aSeed.w;
        float r = 1.0 + age * (0.08 + 0.1 * fract(aSeed.y * 7.0));
        vec3 p = vec3(cos(a) * uHalf.x * r, sin(a) * uHalf.y * r, 0.8 + age * (6.0 + 8.0 * fract(aSeed.y * 13.0)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = 0.9 * projectionMatrix[1][1] * uRes.y * 0.5 / max(-mv.z, 1.0);
        vA = sin(3.14159 * age) * uOpen * clamp(px / 2.0, 0.15, 1.0);
        gl_PointSize = clamp(px, 2.0, 24.0);
      }`,
    fragmentShader: `uniform vec3 uGlow; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 14.0) * vA; gl_FragColor = vec4(uGlow * a, 0.0); ${OUT_GLSL} }`,
  });
  premultiplied(m);
  return m;
}

// physical viewport height for screen-sized point sprites
const _vp = new THREE.Vector4();
export function trackResolution(obj, uniform) {
  obj.onBeforeRender = (renderer) => { renderer.getCurrentViewport(_vp); uniform.value.set(_vp.z, _vp.w); };
}

const _m = new THREE.Matrix4();
let dotTex = null;
export function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

const OPEN_TIME = 0.25, CLOSE_TIME = 0.25, FLASH_TIME = 0.45;
const LIGHT_POWER = 7000, LIGHT_FLASH = 9000;
let RIM_GEO = null;

// Visual representation of a single portal (rim, idle fill, embers, light).
// `local` is the opening/closing transform relative to the portal's frame; the
// stencil mask uses it too, so the hole grows out of the impact point.
export class PortalVisual {
  constructor(portal, scene) {
    this.portal = portal;
    this.scale = 1;
    this.closing = 0;
    this.local = new THREE.Matrix4();
    this.impact = new THREE.Vector2();
    this.impactVersion = -1;
    this.onEvent = null;            // (type, matrix, portal) for the fx layer
    this.lastMatrix = new THREE.Matrix4();
    this.seenVersion = portal.version;
    const color = COLORS[portal.color], glow = COLORS[portal.color + 'Glow'];
    RIM_GEO ||= ringGeometry(0.8, 1.48);
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.rimMat = rimMaterial(color, glow);
    this.rim = new THREE.Mesh(RIM_GEO, this.rimMat);
    this.rim.position.z = 0.6;
    this.rim.renderOrder = 5;
    this.fillMat = fillMaterial(color, glow);
    this.fill = new THREE.Mesh(discGeometry(PORTAL.surfaceOffset + 0.05), this.fillMat);
    this.group.add(this.rim, this.fill);

    // embers drifting off the rim
    const N = 90;
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      seed[i * 4] = Math.random() * Math.PI * 2;
      seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = 0.5 + Math.random() * 0.9;
      seed[i * 4 + 3] = (Math.random() - 0.5) * 1.6;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.pMat = rimSparksMaterial(glow);
    this.points = new THREE.Points(pg, this.pMat);
    this.points.renderOrder = 6;
    trackResolution(this.points, this.pMat.uniforms.uRes);
    this.group.add(this.points);
    for (const o of [this.rim, this.fill, this.points]) o.frustumCulled = false;
    scene.add(this.group);
    this.group.visible = false;

    // a portal moved while open collapses where it was
    this.ghostMat = rimMaterial(color, glow);
    this.ghost = new THREE.Mesh(RIM_GEO, this.ghostMat);
    this.ghost.matrixAutoUpdate = false;
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 5;
    this.ghost.visible = false;
    this.ghostT = 0;
    this.ghostM = new THREE.Matrix4();
    scene.add(this.ghost);

    // soft coloured light on nearby surfaces; always in the scene (intensity 0
    // when closed) so the light count, and so every shader, stays the same
    this.light = new THREE.PointLight(color, 0, 230, 2);
    scene.add(this.light);
  }

  // where the shot landed, so the opening grows out of that point
  setImpact(point) {
    const P = this.portal;
    const v = point.clone().applyMatrix4(P.inverse);
    const u = v.x / PORTAL.halfWidth, w = v.y / PORTAL.halfHeight, l = Math.hypot(u, w);
    const k = l > 0.85 ? 0.85 / l : 1;     // keep inside the oval (screen bounds stay conservative)
    this.impact.set(u * k * PORTAL.halfWidth, w * k * PORTAL.halfHeight);
    this.impactVersion = P.version;
  }

  update(time, dt) {
    const P = this.portal;
    // re-placed while open: the old one collapses
    if (P.placed && this.wasPlaced && P.version !== this.seenVersion && !this.lastMatrix.equals(P.matrix)) {
      this.ghostT = CLOSE_TIME;
      this.ghostM.copy(this.lastMatrix);
      this.onEvent?.('close', this.lastMatrix, P);
    }
    this.seenVersion = P.version;
    this.updateGhost(time, dt);

    if (!P.placed) {
      if (this.wasPlaced) { this.closing = CLOSE_TIME; this.wasPlaced = false; this.onEvent?.('close', this.lastMatrix, P); }
      this.closing = Math.max(0, this.closing - dt);
      this.group.visible = this.closing > 0;
      this.fill.visible = this.closing > 0;
      const k = this.closing / CLOSE_TIME;
      if (this.closing > 0) {
        // collapse: the oval pinches to a point in a last bright flash
        const s = Math.pow(k, 0.7);
        this.local.makeScale(s, s, 1);
        this.group.matrix.copy(this.lastMatrix).multiply(this.local);
        this.group.matrixWorldNeedsUpdate = true;
        this.setUniforms(time, 1, (1 - k) * 0.8, 1 - k);
      }
      this.light.intensity = this.closing > 0 ? LIGHT_POWER * k + LIGHT_FLASH * 0.5 * (1 - k) * k * 4 : 0;
      return;
    }
    this.wasPlaced = true;
    this.closing = 0;
    this.group.visible = true;
    this.lastMatrix.copy(P.matrix);
    const age = time - P.openedAt;
    const o = Math.min(1, Math.max(0, age / OPEN_TIME));
    const e = 1 - Math.pow(1 - o, 3);
    const flash = Math.pow(Math.max(0, 1 - age / FLASH_TIME), 2);
    this.scale = Math.max(0.02, e);
    const off = this.impactVersion === P.version ? 1 - e : 0;
    this.local.makeScale(this.scale, this.scale, 1).setPosition(this.impact.x * off, this.impact.y * off, 0);
    this.group.matrix.copy(P.matrix).multiply(this.local);
    this.group.matrixWorldNeedsUpdate = true;
    this.setUniforms(time, 0.7 + 0.3 * e, flash, e);
    this.light.position.copy(P.pos).addScaledVector(P.normal, 26);
    const flicker = 0.94 + 0.06 * Math.sin(time * 11.3) * Math.sin(time * 6.7 + 1.3);
    this.light.intensity = LIGHT_POWER * e * flicker + LIGHT_FLASH * flash;
  }

  setUniforms(time, open, flash, sparks) {
    this.rimMat.uniforms.uTime.value = time;
    this.rimMat.uniforms.uOpen.value = open;
    this.rimMat.uniforms.uFlash.value = flash;
    this.fillMat.uniforms.uTime.value = time;
    this.fillMat.uniforms.uFlash.value = flash;
    this.pMat.uniforms.uTime.value = time;
    this.pMat.uniforms.uOpen.value = sparks;
  }

  updateGhost(time, dt) {
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.ghost.visible = this.ghostT > 0;
    if (!this.ghost.visible) return;
    const k = this.ghostT / CLOSE_TIME, s = Math.pow(k, 0.7);
    this.ghost.matrix.copy(this.ghostM).multiply(_m.makeScale(s, s, 1).setPosition(0, 0, 0.6));
    this.ghost.matrixWorld.copy(this.ghost.matrix);
    this.ghostMat.uniforms.uTime.value = time;
    this.ghostMat.uniforms.uFlash.value = (1 - k) * 0.8;
  }

  dispose(scene) {
    scene.remove(this.group, this.ghost, this.light);
  }
}

// ---------------------------------------------------------------------------
const _v = new THREE.Vector3();
const _v4 = new THREE.Vector4();
const _plane = new THREE.Plane();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _scale = new THREE.Matrix4();
const _sub = new THREE.Matrix4();
const _box = new THREE.Box3();

export class PortalRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.maxDepth = 5;
    this.maskScene = new THREE.Scene();
    this.maskMat = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilWriteMask: 0xff, stencilFuncMask: 0xff,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.IncrementStencilOp,
    });
    this.depthMatTunnel = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, side: THREE.DoubleSide,
      stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilWriteMask: 0x00,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
    });
    this.depthMatDisc = this.depthMatTunnel.clone();
    this.depthMatDisc.polygonOffset = true;
    this.depthMatDisc.polygonOffsetFactor = -1;
    this.depthMatDisc.polygonOffsetUnits = -4;
    const disc = discGeometry(PORTAL.surfaceOffset);
    const tunnel = tunnelGeometry(PORTAL.surfaceOffset, -PORTAL.tunnelDepth);
    this.maskDisc = new THREE.Mesh(disc, this.maskMat);
    this.maskTunnel = new THREE.Mesh(tunnel, this.maskMat);
    this.depthTunnel = new THREE.Mesh(tunnel, this.depthMatTunnel);
    this.depthDisc = new THREE.Mesh(disc, this.depthMatDisc);
    this.depthTunnel.renderOrder = 0;
    this.depthDisc.renderOrder = 1;
    for (const m of [this.maskDisc, this.maskTunnel, this.depthTunnel, this.depthDisc]) {
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
    }
    this.vcams = [];
    this.bounds = [];
    this.stats = { views: 0 };
  }

  vcam(level) {
    if (!this.vcams[level]) {
      const c = new THREE.PerspectiveCamera();
      c.matrixAutoUpdate = false;
      c.layers.enableAll();
      c.userData.stdProj = new THREE.Matrix4();
      this.vcams[level] = c;
    }
    return this.vcams[level];
  }

  // Set stencil test (EQUAL ref) on every material in the scene
  setSceneStencil(scene, ref) {
    scene.traverseVisible((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((mm) => applyStencil(mm, ref));
      else applyStencil(m, ref);
    });
  }

  portalMatrix(P, vis) {
    // opening transform (grows out of the impact point, always inside the
    // full oval, so the screen bounds below stay conservative)
    _scale.copy(P.matrix);
    return vis ? _scale.multiply(vis.local) : _scale;
  }

  drawMask(P, vis, cam, ref, op) {
    const r = this.renderer;
    this.maskMat.stencilRef = ref;
    this.maskMat.stencilZPass = op;
    const M = this.portalMatrix(P, vis);
    this.maskDisc.matrix.copy(M); this.maskDisc.matrixWorld.copy(M);
    this.maskTunnel.matrix.copy(M); this.maskTunnel.matrixWorld.copy(M);
    this.maskScene.children.length = 0;
    this.maskScene.add(this.maskTunnel, this.maskDisc);
    this.maskTunnel.matrixWorldNeedsUpdate = false;
    r.render(this.maskScene, cam);
  }

  drawDepth(P, vis, cam, ref) {
    this.depthMatTunnel.stencilRef = ref;
    this.depthMatDisc.stencilRef = ref;
    const M = this.portalMatrix(P, vis);
    this.depthTunnel.matrix.copy(M); this.depthTunnel.matrixWorld.copy(M);
    this.depthDisc.matrix.copy(M); this.depthDisc.matrixWorld.copy(M);
    this.maskScene.children.length = 0;
    this.maskScene.add(this.depthTunnel, this.depthDisc);
    this.renderer.render(this.maskScene, cam);
  }

  // screen-space rectangle of a portal in NDC, or null if off screen
  screenRect(P, cam, parent) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const proj = cam.userData.stdProj || cam.projectionMatrix;
    for (let i = 0; i < 8; i++) {
      const u = (i & 1 ? 1 : -1) * PORTAL.halfWidth, v = (i & 2 ? 1 : -1) * PORTAL.halfHeight;
      const z = i & 4 ? -PORTAL.tunnelDepth : PORTAL.surfaceOffset;
      _v.set(u, v, z).applyMatrix4(P.matrix).applyMatrix4(cam.matrixWorldInverse);
      if (_v.z > -1) return parent ? parent.slice() : [-1, -1, 1, 1];
      _v4.set(_v.x, _v.y, _v.z, 1).applyMatrix4(proj);
      const x = _v4.x / _v4.w, y = _v4.y / _v4.w;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    const p = parent || [-1, -1, 1, 1];
    const r = [Math.max(minx, p[0]), Math.max(miny, p[1]), Math.min(maxx, p[2]), Math.min(maxy, p[3])];
    if (r[0] >= r[2] || r[1] >= r[3]) return null;
    return r;
  }

  visiblePortals(world, cam, skip, rect) {
    const camPos = _v.setFromMatrixPosition(cam.matrixWorld).clone();
    const proj = cam.userData.stdProj || cam.projectionMatrix;
    _pm.multiplyMatrices(proj, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const out = [];
    for (const P of world.portalList) {
      if (!P.linked || P === skip) continue;
      if (P.dist(camPos) < 0.02) continue;
      _sphere.center.copy(P.pos);
      _sphere.radius = PORTAL.halfHeight + PORTAL.tunnelDepth;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const r = this.screenRect(P, cam, rect);
      if (!r) continue;
      out.push({ P, rect: r, d: camPos.distanceToSquared(P.pos) });
    }
    out.sort((a, b) => b.d - a.d);
    return out;
  }

  setupVirtualCamera(vc, cam, P, base) {
    const Q = P.other;
    vc.matrix.multiplyMatrices(P.toOther, cam.matrixWorld);
    vc.matrixWorld.copy(vc.matrix);
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    vc.position.setFromMatrixPosition(vc.matrixWorld);
    vc.userData.stdProj.copy(base.userData.stdProj || base.projectionMatrix);
    vc.projectionMatrix.copy(vc.userData.stdProj);
    // oblique near plane on the exit portal
    _plane.setFromNormalAndCoplanarPoint(Q.normal, Q.pos);
    _plane.constant += 0.1;
    _plane.applyMatrix4(vc.matrixWorldInverse);
    let w = _plane.constant;
    if (w > -0.5) w = -0.5;
    _v4.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, w);
    makeOblique(vc.projectionMatrix, _v4);
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
  }

  setScissor(rect) {
    const r = this.renderer;
    const size = r.getSize(_v);
    const x0 = Math.floor((rect[0] * 0.5 + 0.5) * size.x) - 1, y0 = Math.floor((rect[1] * 0.5 + 0.5) * size.y) - 1;
    const x1 = Math.ceil((rect[2] * 0.5 + 0.5) * size.x) + 1, y1 = Math.ceil((rect[3] * 0.5 + 0.5) * size.y) + 1;
    r.setScissor(x0, y0, x1 - x0, y1 - y0);
    r.setScissorTest(true);
  }

  renderView(world, scene, cam, level, skip, rect, visuals) {
    const r = this.renderer;
    this.stats.views++;
    const visible = this.visiblePortals(world, cam, skip, rect);
    const recurse = level < this.maxDepth;
    const camPos = _v.setFromMatrixPosition(cam.matrixWorld).clone();
    const held = [];
    if (recurse) {
      for (const item of visible) {
        const { P, rect: pr } = item;
        this.setScissor(pr);
        this.drawMask(P, visuals.get(P), cam, level, THREE.IncrementStencilOp);
        const vc = this.vcam(level + 1);
        this.setupVirtualCamera(vc, cam, P, cam);
        this.renderView(world, scene, vc, level + 1, P.other, pr, visuals);
        // Standing in the portal's mouth: everything inside its outline is
        // the far side, so keep it masked while this view's scene is drawn
        // (the wall the portal sits on would otherwise poke through).
        item.mouth = P.dist(camPos) < 3 && P.inOval(camPos, 1.02);
        if (item.mouth) { held.push(item); continue; }
        this.setScissor(pr);
        this.drawMask(P, visuals.get(P), cam, level + 1, THREE.DecrementStencilOp);
      }
    }
    this.setScissor(rect || [-1, -1, 1, 1]);
    r.state.buffers.depth.setMask(true);
    r.clearDepth();
    if (recurse) for (const { P, mouth } of visible) if (!mouth) this.drawDepth(P, visuals.get(P), cam, level);
    // idle fill for portals we did not see through
    for (const [P, vis] of visuals) {
      vis.fill.visible = (P.placed && (!P.linked || !recurse)) || vis.closing > 0;
    }
    world.onBeforeView?.(cam, level, skip);
    const culled = this.cull(scene, cam, rect, skip);
    this.setSceneStencil(scene, level);
    r.render(scene, cam);
    for (const o of culled) o.visible = true;
    for (const { P, rect: pr } of held) {
      this.setScissor(pr);
      this.drawMask(P, visuals.get(P), cam, level + 1, THREE.DecrementStencilOp);
    }
  }

  // Per-view culling of whole top-level objects against the sub-frustum
  // seen through the current portal (its screen rectangle) and the exit
  // portal's plane. Through a small portal most of the level is skipped.
  computeBounds(scene) {
    scene.updateMatrixWorld();
    this.bounds.length = 0;
    for (const o of scene.children) {
      if (o.isLight || o.userData.noCull || o.isPoints || o.isLine || o.isSprite) continue;
      let sph = o.userData.sphere;
      if (!sph || !o.userData.world) {
        _box.setFromObject(o);
        if (_box.isEmpty()) continue;
        sph = o.userData.sphere || (o.userData.sphere = new THREE.Sphere());
        _box.getBoundingSphere(sph);
      }
      this.bounds.push(o);
    }
  }

  cull(scene, cam, rect, skip) {
    const out = [];
    const proj = cam.userData.stdProj || cam.projectionMatrix;
    const r = rect || [-1, -1, 1, 1];
    const sx = 2 / (r[2] - r[0]), sy = 2 / (r[3] - r[1]);
    _sub.set(sx, 0, 0, -(r[2] + r[0]) / (r[2] - r[0]), 0, sy, 0, -(r[3] + r[1]) / (r[3] - r[1]), 0, 0, 1, 0, 0, 0, 0, 1);
    _pm.multiplyMatrices(_sub, proj).multiply(cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    for (const o of this.bounds) {
      if (!o.visible) continue;
      const sph = o.userData.sphere;
      let hide = !_frustum.intersectsSphere(sph);
      if (!hide && skip && skip.dist(sph.center) < -sph.radius) hide = true;   // behind the exit portal
      if (hide) { o.visible = false; out.push(o); }
    }
    return out;
  }

  render(world, scene, camera, visuals) {
    const r = this.renderer;
    this.stats.views = 0;
    this.computeBounds(scene);
    camera.userData.stdProj = camera.projectionMatrix;
    r.setScissorTest(false);
    r.state.buffers.color.setMask(true);
    r.state.buffers.depth.setMask(true);
    r.clear(true, true, true);
    this.renderView(world, scene, camera, 0, null, null, visuals);
    r.setScissorTest(false);
  }
}

function applyStencil(m, ref) {
  if (m.userData.noStencil) return;
  m.stencilWrite = true;
  m.stencilFunc = THREE.EqualStencilFunc;
  m.stencilRef = ref;
  m.stencilFuncMask = 0xff;
  m.stencilWriteMask = 0x00;
  m.stencilFail = THREE.KeepStencilOp;
  m.stencilZFail = THREE.KeepStencilOp;
  m.stencilZPass = THREE.KeepStencilOp;
}

// Eric Lengyel's oblique near-plane clipping
function makeOblique(proj, plane) {
  const e = proj.elements;
  const q = new THREE.Vector4(
    (Math.sign(plane.x) + e[8]) / e[0],
    (Math.sign(plane.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  );
  const c = plane.clone().multiplyScalar(2 / plane.dot(q));
  e[2] = c.x; e[6] = c.y; e[10] = c.z + 1; e[14] = c.w;
}
