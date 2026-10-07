import * as THREE from 'three';
import { CELL, COLORS, PORTAL } from './constants.js';
import { MAT, PORTALABLE } from './level.js';
import { NOISE_GLSL, OUT_GLSL, premultiplied, trackResolution } from './render.js';

// ---------------------------------------------------------------------------
// Effects layer: portal-shot sparks and flashes, scorch marks on surfaces that
// reject portals, dust motes drifting in the fixture light and faint light
// shafts under the ceiling panels.
//
// Everything is world-space and animated on the GPU from a time uniform, in a
// handful of draw calls, so the recursive portal views can draw it many times
// a frame. All of it is transparent with depthWrite off, and it lives in the
// main scene so the portal renderer's per-view stencil test applies to it.
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();

// ---- sparks: velocity-stretched streaks and soft flash sprites ------------
const MAX_SPARKS = 1024;

class Sparks {
  constructor(group) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPARKS * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(3);   // start
    this.aVel = attr(4);   // velocity, streak length (s)
    this.aInfo = attr(4);  // born, life, size, drag
    this.aCol = attr(4);   // HDR colour, gravity scale
    for (let i = 0; i < MAX_SPARKS; i++) this.aInfo.array[i * 4] = -1e6;
    g.setAttribute('aPos', this.aPos); g.setAttribute('aVel', this.aVel);
    g.setAttribute('aInfo', this.aInfo); g.setAttribute('aCol', this.aCol);
    g.instanceCount = MAX_SPARKS;
    this.mat = premultiplied(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 720) } },
      vertexShader: `
        attribute vec3 aPos; attribute vec4 aVel, aInfo, aCol;
        uniform float uTime; uniform vec2 uRes;
        varying vec3 vCol; varying vec2 vQ; varying float vLen, vW, vA;
        vec3 at(float t){
          float k = aInfo.w, f = k > 0.0 ? (1.0 - exp(-k * t)) / k : t;
          return aPos + aVel.xyz * f - vec3(0.0, 300.0 * aCol.w * t * t, 0.0);
        }
        void main(){
          float t = uTime - aInfo.x;
          if (t < 0.0 || t > aInfo.y) { gl_Position = vec4(0.0); return; }
          float life = t / aInfo.y;
          mat4 vp = projectionMatrix * viewMatrix;
          vec4 c0 = vp * vec4(at(t), 1.0);
          vec4 c1 = vp * vec4(at(max(t - aVel.w, 0.0)), 1.0);
          if (c0.w < 1.0) { gl_Position = vec4(0.0); return; }
          if (c1.w < 1.0) c1 = c0;
          vec2 h = uRes * 0.5;
          vec2 s0 = c0.xy / c0.w * h, s1 = c1.xy / c1.w * h;
          float wt = aInfo.z * projectionMatrix[1][1] * h.y / c0.w;   // true half width in px
          float w = max(wt, 1.2);
          vec2 dir = s0 - s1; float len = length(dir);
          dir = len > 1e-3 ? dir / len : vec2(1.0, 0.0);
          vec2 sp = (position.x < 0.0 ? s1 - dir * w : s0 + dir * w) + vec2(-dir.y, dir.x) * position.y * w;
          gl_Position = vec4(sp / h * c0.w, c0.z, c0.w);
          vQ = vec2(position.x < 0.0 ? -w : len + w, position.y * w);
          vLen = len; vW = w;
          vec3 hot = vec3(1.0, 0.96, 0.9) * max(max(aCol.r, aCol.g), aCol.b);
          vCol = mix(hot, aCol.rgb, smoothstep(0.0, 0.4, life));
          vA = pow(clamp(1.0 - life, 0.0, 1.0), 1.5) * min(1.0, wt / 1.2);
        }`,
      fragmentShader: `varying vec3 vCol; varying vec2 vQ; varying float vLen, vW, vA;
        void main(){
          float dx = max(0.0, -vQ.x) + max(0.0, vQ.x - vLen);
          float d = length(vec2(dx, vQ.y)) / vW;
          float tail = vLen > 0.5 ? mix(0.3, 1.0, clamp(vQ.x / vLen, 0.0, 1.0)) : 1.0;
          float a = exp(-d * d * 3.5) * tail * vA;
          gl_FragColor = vec4(vCol * a, 0.0);
          ${OUT_GLSL}
        }`,
    }));
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    trackResolution(this.mesh, this.mat.uniforms.uRes);
    group.add(this.mesh);
    this.next = 0;
    this.time = 0;
  }

  add(pos, vel, life, size, col, { drag = 0, grav = 0, streak = 0 } = {}) {
    const i = this.next; this.next = (i + 1) % MAX_SPARKS;
    this.aPos.array.set([pos.x, pos.y, pos.z], i * 3);
    this.aVel.array.set([vel.x, vel.y, vel.z, streak], i * 4);
    this.aInfo.array.set([this.time, life, size, drag], i * 4);
    this.aCol.array.set([col.r, col.g, col.b, grav], i * 4);
    this.dirty = true;
  }

  // a cone of hot sparks thrown off a surface
  burst(pos, normal, col, n, speed, opts = {}) {
    const { life = 0.5, size = 0.55, spread = 1, grav = 1, drag = 3, streak = 0.035 } = opts;
    for (let i = 0; i < n; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spread);
      _v.addScaledVector(normal, 0.35 + Math.random() * 0.8).normalize().multiplyScalar(speed * (0.25 + Math.random() * 0.9));
      _c.copy(col).multiplyScalar(0.7 + Math.random() * 0.8);
      this.add(pos, _v, life * (0.5 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.7), _c, { drag, grav, streak });
    }
  }

  // camera-facing glow sprite
  glow(pos, col, size, life, vel = _s.set(0, 0, 0)) {
    this.add(pos, vel, life, size, col, { drag: 4 });
  }

  update(time) {
    this.time = time;
    this.mat.uniforms.uTime.value = time;
    if (this.dirty) {
      for (const a of [this.aPos, this.aVel, this.aInfo, this.aCol]) a.needsUpdate = true;
      this.dirty = false;
    }
  }
}

// ---- marks left by shots on surfaces that reject portals ------------------
const MAX_MARKS = 32;

class Marks {
  constructor(group) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aMark = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MARKS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_MARKS; i++) this.aMark.array[i * 4] = -1e6;
    geo.setAttribute('aMark', this.aMark);   // born, seed, colour (0 blue, 1 orange)
    this.mat = premultiplied(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBlue: { value: new THREE.Color(COLORS.blueGlow) }, uOrange: { value: new THREE.Color(COLORS.orangeGlow) } },
      vertexShader: `attribute vec4 aMark; varying vec2 vUv; varying vec4 vMark;
        void main(){ vUv = uv; vMark = aMark; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${NOISE_GLSL}
        uniform float uTime; uniform vec3 uBlue, uOrange; varying vec2 vUv; varying vec4 vMark;
        void main(){
          float age = uTime - vMark.x;
          if (age < 0.0) discard;
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float n = fbm3(vec3(p * 3.0, vMark.y));
          float spl = fbm3(vec3(normalize(p + 1e-4) * 2.5, vMark.y + 7.0));   // ragged splash outline
          float rr = r / (0.55 + 0.45 * spl);
          float fade = 1.0 - smoothstep(9.0, 12.0, age);
          float dark = (1.0 - smoothstep(0.35, 1.0, rr + (n - 0.5) * 0.4)) * 0.55 * fade;
          vec3 c = mix(uBlue, uOrange, vMark.z);
          float ember = exp(-rr * rr * 5.0) * pow(max(0.0, 1.0 - age / 0.9), 2.0);
          float stain = (1.0 - smoothstep(0.3, 0.9, rr)) * (0.5 + 0.5 * n) * pow(max(0.0, 1.0 - age / 2.5), 1.5);
          float ring = exp(-pow((rr - 0.25 - age * 1.2) * 5.0, 2.0)) * max(0.0, 1.0 - age / 0.35);
          vec3 col = c * (ember * 3.5 + ring * 2.0 + stain * 0.35) + vec3(1.0) * ember * ember * 1.5;
          gl_FragColor = vec4(col, dark);
          ${OUT_GLSL}
        }`,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    }));
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_MARKS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_MARKS; i++) this.mesh.setMatrixAt(i, _m);
    group.add(this.mesh);
    this.next = 0;
  }

  add(pos, normal, color, time) {
    const i = this.next; this.next = (i + 1) % MAX_MARKS;
    _q.setFromUnitVectors(_z, normal);
    _m.makeRotationAxis(_z, Math.random() * Math.PI * 2).premultiply(_m.clone().makeRotationFromQuaternion(_q));
    const size = 13 + Math.random() * 4;
    _m.scale(_s.set(size, size, 1)).setPosition(_v.copy(pos).addScaledVector(normal, 0.2));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aMark.array.set([time, Math.random() * 40, color === 'orange' ? 1 : 0, 0], i * 4);
    this.aMark.needsUpdate = true;
  }
}

// ---- ceiling fixtures: runs of light cells with open space below ----------
function findFixtures(grid) {
  const lit = (x, y, z) => grid.get(x, y, z) === MAT.LIGHT && !grid.solid(x, y - 1, z);
  const used = new Set();
  const runs = [];
  for (let y = 1; y < grid.ny; y++) for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) {
    const key = (y * grid.nz + z) * grid.nx + x;
    if (used.has(key) || !lit(x, y, z)) continue;
    // extend along x or z, whichever is longer
    let lx = 0; while (lit(x + lx, y, z)) lx++;
    let lz = 0; while (lit(x, y, z + lz)) lz++;
    const alongX = lx >= lz, len = alongX ? lx : lz;
    for (let i = 0; i < len; i++) used.add(alongX ? key + i : key + i * grid.nx);
    // clear height under the middle of the run
    const mx = alongX ? x + (len >> 1) : x, mz = alongX ? z : z + (len >> 1);
    let h = 0; while (y - 1 - h >= 0 && !grid.solid(mx, y - 1 - h, mz)) h++;
    runs.push({
      cx: (alongX ? x + len / 2 : x + 0.5) * CELL, cz: (alongX ? z + 0.5 : z + len / 2) * CELL,
      y: y * CELL, half: len * CELL / 2, alongX, height: h * CELL,
    });
  }
  return runs;
}

// ---- dust motes ------------------------------------------------------------
// A periodic field of motes (one tile of BOX units repeated through space),
// windowed around whichever camera is drawing it, so every portal view sees
// the same world-space dust. Motes glow where they fall inside the light
// under a fixture.
const DUST = 420, BOX = 340, MAX_STRIPS = 24;

class Dust {
  constructor(group, fixtures) {
    this.fixtures = fixtures;
    const seed = new Float32Array(DUST * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.strips = Array.from({ length: MAX_STRIPS }, () => new THREE.Vector4(0, -1e5, 0, 0));
    this.mat = premultiplied(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(1280, 720) },
        uStrips: { value: this.strips },
      },
      vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform vec2 uRes; uniform vec4 uStrips[${MAX_STRIPS}];
        varying float vA;
        void main(){
          float t = uTime, s = aSeed.w * 6.2831;
          vec3 drift = vec3(sin(t * 0.031 + s) * 40.0, -t * 1.6, cos(t * 0.027 + s * 1.7) * 40.0);
          vec3 p = aSeed.xyz * ${BOX.toFixed(1)} + drift;
          p = uCam + mod(p - uCam + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
          p += vec3(sin(t * 0.7 + s * 7.0), sin(t * 0.53 + s * 3.0), sin(t * 0.61 + s * 5.0)) * 2.5;
          // light: soft wedge of light under each nearby fixture run
          float L = 0.0;
          for (int i = 0; i < ${MAX_STRIPS}; i++) {
            vec4 f = uStrips[i];
            float dy = f.y - p.y;
            if (dy < 0.0) continue;
            vec2 rel = p.xz - vec2(f.x, f.z);
            vec2 ax = f.w > 0.0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            float along = dot(rel, ax), across = dot(rel, vec2(ax.y, ax.x));
            float out_ = max(abs(along) - abs(f.w), 0.0);
            float spread = 22.0 + dy * 0.45;
            L += exp(-(across * across + out_ * out_) / (spread * spread)) * exp(-dy / 260.0);
          }
          float dc = length(p - uCam);
          float win = smoothstep(${(BOX * 0.5).toFixed(1)}, ${(BOX * 0.3).toFixed(1)}, dc) * smoothstep(6.0, 24.0, dc);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = 0.38 * projectionMatrix[1][1] * uRes.y * 0.5 / max(-mv.z, 1.0);
          float twinkle = 0.6 + 0.4 * sin(t * (1.0 + aSeed.x * 2.0) + s * 11.0);
          vA = win * (0.05 + 1.1 * min(L, 1.5)) * twinkle * min(1.0, px / 1.5);
          gl_PointSize = clamp(px, 1.5, 6.0) * 2.0;
        }`,
      fragmentShader: `varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = exp(-dot(c, c) * 18.0) * vA;
          gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * a * 0.9, 0.0); ${OUT_GLSL} }`,
    }));
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    const res = this.mat.uniforms.uRes, cam = this.mat.uniforms.uCam;
    this.points.onBeforeRender = (renderer, scene, camera) => {
      renderer.getCurrentViewport(_vp); res.value.set(_vp.z, _vp.w);
      cam.value.setFromMatrixPosition(camera.matrixWorld);
    };
    group.add(this.points);
    this.refresh = 0;
  }

  update(time, dt, camPos) {
    this.mat.uniforms.uTime.value = time;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.4;
    // nearest fixture runs to the player's camera
    const near = this.fixtures
      .map((f) => ({ f, d: Math.hypot(Math.max(0, Math.abs((f.alongX ? camPos.x : camPos.z) - (f.alongX ? f.cx : f.cz)) - f.half), (f.alongX ? camPos.z - f.cz : camPos.x - f.cx), camPos.y - f.y) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < MAX_STRIPS; i++) {
      const n = near[i];
      if (!n || n.d > BOX) { this.strips[i].set(0, -1e5, 0, 0); continue; }
      const f = n.f;
      this.strips[i].set(f.cx, f.y, f.cz, f.alongX ? f.half : -f.half);
    }
  }
}
const _vp = new THREE.Vector4();

// ---- light shafts: faint additive V of cards under tall fixture runs -------
class Shafts {
  constructor(group, fixtures) {
    const pos = [], uv = [], idx = [];
    for (const f of fixtures) {
      if (f.height < 5 * CELL || f.half < CELL) continue;
      const len = Math.min(f.height * 0.85, 9 * CELL);
      const ax = f.alongX ? [1, 0] : [0, 1], pe = [ax[1], ax[0]];
      for (const side of [-1, 1]) {
        const tilt = 0.32 * side, top = 9, bot = 9 + len * Math.abs(tilt) + 22;
        const base = pos.length / 3;
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const a = (u * 2 - 1) * (f.half - 4);
          const w = v ? bot * side : top * side * 0.4;
          const y = f.y - 1 - v * len;
          pos.push(f.cx + ax[0] * a + pe[0] * w, y, f.cz + ax[1] * a + pe[1] * w);
          uv.push(u, v, f.half * 2);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    this.mesh = null;
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.mat = premultiplied(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute vec3 aUv; varying vec3 vUv; varying vec3 vW; varying vec3 vN;
        void main(){ vUv = aUv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${NOISE_GLSL}
        uniform float uTime; varying vec3 vUv; varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 V = cameraPosition - vW;
          float dist = length(V);
          float facing = abs(dot(normalize(vN + 1e-6), V / max(dist, 1e-3)));
          float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float fall = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2);
          float rays = 0.5 + 0.5 * vn3(vec3(vUv.x * vUv.z / 18.0, vUv.y * 1.2, uTime * 0.05));
          float a = ends * fall * rays * smoothstep(0.05, 0.5, facing) * smoothstep(40.0, 160.0, dist) * 0.09;
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a, 0.0);
          ${OUT_GLSL}
        }`,
      side: THREE.DoubleSide,
    }));
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    group.add(this.mesh);
  }

  update(time) { if (this.mesh) this.mat.uniforms.uTime.value = time; }
}

// ---------------------------------------------------------------------------
export class FX {
  constructor(game, scene) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.userData.noCull = true;     // the portal renderer's per-view culling skips it
    scene.add(this.group);
    this.scene = scene;
    this.sparks = new Sparks(this.group);
    this.marks = new Marks(this.group);
    const fixtures = findFixtures(game.grid);
    this.dust = new Dust(this.group, fixtures);
    this.shafts = new Shafts(this.group, fixtures);
    this.clock = 0;
    for (const vis of game.visuals.values()) vis.onEvent = (type, M, P) => this.portalClosed(M, P);
  }

  // a portal shot landed (ok: a portal opened there)
  shot(P, r, ok, color) {
    this.sparks.time = this.game.time;
    const glow = new THREE.Color(COLORS[color + 'Glow']), base = new THREE.Color(COLORS[color]);
    if (ok) {
      this.game.visuals.get(P)?.setImpact(r.point);
      const n = P.normal, p = _v.copy(r.point).addScaledVector(n, 1.5).clone();
      this.sparks.burst(p, n, base.clone().multiplyScalar(3.2), 40, 330, { life: 0.6, spread: 1.1, grav: 0.8 });
      this.sparks.burst(p, n, glow.clone().multiplyScalar(2.5), 18, 160, { life: 0.4, size: 0.4, spread: 1.4, grav: 0.3 });
      this.sparks.glow(p.clone().addScaledVector(n, 5), base.clone().multiplyScalar(1.1), 18, 0.2);
      this.sparks.glow(p.clone().addScaledVector(n, 3), glow.clone().multiplyScalar(1.8), 5, 0.12);
      return;
    }
    if (r.type === 'none') return;
    const n = r.type === 'grid' ? new THREE.Vector3(...r.g.normal) : r.dir.clone().negate();
    const p = r.point.clone().addScaledVector(n, 1);
    this.sparks.burst(p, n, glow.clone().multiplyScalar(2.6), 16, 190, { life: 0.4, spread: 1.2 });
    this.sparks.glow(p.clone().addScaledVector(n, 2), glow.clone().multiplyScalar(1.1), 10, 0.3, n.clone().multiplyScalar(30));
    if (r.type === 'grid' && !PORTALABLE.has(r.g.mat)) this.marks.add(r.point, n, color, this.game.time);
  }

  // a portal fizzled or moved: a ring of sparks pinched off the old oval
  portalClosed(M, P) {
    this.sparks.time = this.game.time;
    const col = new THREE.Color(COLORS[P.color + 'Glow']).multiplyScalar(2.6);
    const n = _s.setFromMatrixColumn(M, 2).clone();
    const c = new THREE.Vector3().setFromMatrixPosition(M).addScaledVector(n, 2);
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * PORTAL.halfWidth, Math.sin(a) * PORTAL.halfHeight, 2).applyMatrix4(M);
      const v = c.clone().sub(p).multiplyScalar(2.5 + Math.random() * 2).addScaledVector(n, 40 + Math.random() * 80);
      this.sparks.add(p, v, 0.3 + Math.random() * 0.25, 0.5, col, { drag: 2, grav: 0.4, streak: 0.04 });
    }
    this.sparks.glow(c.addScaledVector(n, 4), col.clone().multiplyScalar(0.8), 22, 0.3);
  }

  update(time, dt) {
    this.clock += dt;
    this.sparks.update(time);
    this.marks.mat.uniforms.uTime.value = time;
    this.dust.update(this.clock, dt, this.game.camera.position);
    this.shafts.update(this.clock);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
