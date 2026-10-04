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

function ringGeometry(inner, outer) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * PORTAL.halfWidth * inner, s * PORTAL.halfHeight * inner, 0);
    pos.push(c * PORTAL.halfWidth * outer, s * PORTAL.halfHeight * outer, 0);
    uv.push(i / SEG, 0, i / SEG, 1);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const NOISE_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
`;

function rimMaterial(color, glow) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) }, uOpen: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime; uniform vec3 uColor; uniform vec3 uGlow; uniform float uOpen; varying vec2 vUv;
      void main(){
        float a = vUv.x * 6.2831853;
        float r = vUv.y;                       // 0 inner edge -> 1 outer edge
        float n = fbm(vec2(a * 2.0 + uTime * 1.7, r * 3.0 - uTime * 2.3));
        float n2 = fbm(vec2(a * 5.0 - uTime * 2.9, r * 6.0 + uTime));
        float core = smoothstep(0.0, 0.18, r) * (1.0 - smoothstep(0.18, 0.55 + n * 0.35, r));
        float wisps = (1.0 - smoothstep(0.1, 1.0, r)) * smoothstep(0.45, 0.85, n2) * 0.9;
        float inner = 1.0 - smoothstep(0.0, 0.08, r);
        float i = core * 1.4 + wisps + inner * 0.6;
        vec3 col = mix(uColor, uGlow, clamp(core * 1.2 + inner, 0.0, 1.0));
        gl_FragColor = vec4(col * i * uOpen, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
}

function fillMaterial(color, glow) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime; uniform vec3 uColor; uniform vec3 uGlow; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = fbm(vec2(a * 1.5 + r * 4.0 - uTime * 1.2, r * 3.0 - uTime * 0.6));
        float s2 = fbm(vec2(a * 3.0 - r * 6.0 + uTime * 0.8, uTime * 0.3 + r));
        vec3 base = uColor * (0.25 + 0.55 * swirl) + uGlow * pow(s2, 3.0) * 0.8;
        base = mix(base, uGlow, smoothstep(0.75, 1.0, r) * 0.7);
        gl_FragColor = vec4(base, 1.0);
      }`,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
}

const _close = new THREE.Matrix4();
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

// Visual representation of a single portal (rim, idle fill, particles)
export class PortalVisual {
  constructor(portal, scene) {
    this.portal = portal;
    this.scale = 1;
    const color = COLORS[portal.color], glow = COLORS[portal.color + 'Glow'];
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.rimMat = rimMaterial(color, glow);
    this.rim = new THREE.Mesh(ringGeometry(0.98, 1.32), this.rimMat);
    this.rim.position.z = 0.6;
    this.rim.renderOrder = 5;
    this.fillMat = fillMaterial(color, glow);
    this.fill = new THREE.Mesh(discGeometry(PORTAL.surfaceOffset + 0.05), this.fillMat);
    // soft light splash on the wall around the portal
    this.splashMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpen: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpen; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0 / vec2(${(2 / 4.2).toFixed(4)}, ${(2 / 3.2).toFixed(4)});
          float e = length(p);                 // 1.0 on the portal's edge
          if (e < 1.0) discard;
          float a = (1.0 - smoothstep(1.0, 2.0, e)) * 0.3 * uOpen;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    });
    const splash = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL.halfWidth * 4.2, PORTAL.halfHeight * 3.2), this.splashMat);
    splash.position.z = 0.4;
    splash.renderOrder = 4;
    this.group.add(this.rim, this.fill, splash);

    // particles drifting off the rim
    const N = 70;
    this.pData = new Float32Array(N * 4);
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    for (let i = 0; i < N; i++) this.resetParticle(i, Math.random());
    this.pMat = new THREE.PointsMaterial({
      color: glow, size: 3.2, map: dotTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(pg, this.pMat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    for (const o of [this.rim, this.fill, splash]) o.frustumCulled = false;
    scene.add(this.group);
    this.group.visible = false;
  }
  resetParticle(i, age = 0) {
    const a = Math.random() * Math.PI * 2;
    this.pData[i * 4] = a;
    this.pData[i * 4 + 1] = age;
    this.pData[i * 4 + 2] = 0.4 + Math.random() * 0.8; // speed
    this.pData[i * 4 + 3] = (Math.random() - 0.5) * 0.6;  // swirl
  }
  update(time, dt) {
    const P = this.portal;
    // closing animation when a portal is fizzled: shrink where it was
    if (!P.placed) {
      if (this.wasPlaced) { this.closing = 0.22; this.wasPlaced = false; this.fill.visible = true; }
      this.closing = Math.max(0, (this.closing || 0) - dt);
      this.group.visible = this.closing > 0;
      if (this.closing > 0) {
        const k = this.closing / 0.22;
        this.group.matrix.copy(P.matrix).multiply(_close.makeScale(k, k, 1));
        this.group.matrixWorldNeedsUpdate = true;
        this.rimMat.uniforms.uTime.value = time;
        this.fillMat.uniforms.uTime.value = time;
      }
      return;
    }
    this.wasPlaced = true;
    this.closing = 0;
    this.group.visible = true;
    const open = Math.min(1, (time - P.openedAt) / 0.28);
    const e = 1 - Math.pow(1 - open, 3);
    this.scale = Math.max(0.02, e);
    this.group.matrix.copy(P.matrix).multiply(new THREE.Matrix4().makeScale(this.scale, this.scale, 1));
    this.group.matrixWorldNeedsUpdate = true;
    this.rimMat.uniforms.uTime.value = time;
    this.rimMat.uniforms.uOpen.value = 0.6 + 0.4 * e;
    this.fillMat.uniforms.uTime.value = time;
    this.splashMat.uniforms.uOpen.value = e;
    const N = this.pPos.length / 3;
    for (let i = 0; i < N; i++) {
      let age = this.pData[i * 4 + 1] + dt * this.pData[i * 4 + 2];
      if (age > 1) { this.resetParticle(i); age = 0; }
      this.pData[i * 4 + 1] = age;
      const a = this.pData[i * 4] + age * this.pData[i * 4 + 3] * 3;
      const r = 1.0 + age * 0.25;
      this.pPos[i * 3] = Math.cos(a) * PORTAL.halfWidth * r;
      this.pPos[i * 3 + 1] = Math.sin(a) * PORTAL.halfHeight * r;
      this.pPos[i * 3 + 2] = 1 + age * 10;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.pMat.opacity = 0.8 * e;
  }
  dispose(scene) {
    scene.remove(this.group);
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
    const s = vis ? vis.scale : 1;
    return _scale.copy(P.matrix).multiply(new THREE.Matrix4().makeScale(s, s, 1));
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
