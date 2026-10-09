import * as THREE from 'three';
import { CELL } from './constants.js';
import { MAT, traceGrid } from './level.js';
import { rectFrame } from './bake.js';

// Dynamic shadows on top of the baked lighting, in the spirit of Source's
// render-to-texture shadows: once per frame the moving props (cubes, turrets,
// the player's body, platforms...) are drawn into a depth map from a single
// shadow camera aimed down the dominant fixture light around the player. The
// world shader (lightmap.js) samples that map with soft PCF and removes the
// direct share of the baked light where it is occluded, so shadows fall
// correctly in every portal view at the cost of one small render.

export const SHADOW_LAYER = 5;
const MAX_OCC = 16;

// shared by every world material (the same objects, so updates propagate)
export const shadowUniforms = {
  dynShadowMap: { value: null },
  dynShadowDepth: { value: null },
  // x: shadow depth range (units), y: shadow-map uv per world unit
  dynShadowRange: { value: new THREE.Vector2(1, 0) },
  dynOcc: { value: Array.from({ length: MAX_OCC }, () => new THREE.Vector4()) },
  dynOccN: { value: 0 },
  dynShadowMatrix: { value: new THREE.Matrix4() },
  dynShadowDir: { value: new THREE.Vector3(0, 1, 0) },
  // x: penumbra per unit of caster distance, y: enabled, z: depth bias, w: normal offset (units)
  dynShadowParams: { value: new THREE.Vector4(0, 0, 0, 0) },
};

// GLSL (needs <packing>): percentage-closer soft shadows. Four wide
// hardware-filtered compare taps find pixels with no caster nearby (most of
// them) and return early; elsewhere a blocker search on the packed depth
// sizes the penumbra from the caster-receiver distance, so a cube's contact
// edge is crisp and a raised prop's shadow is soft, as under big fixtures.
export const SHADOW_GLSL = /* glsl */`
uniform sampler2DShadow dynShadowMap;
uniform sampler2D dynShadowDepth;
uniform mat4 dynShadowMatrix;
uniform vec3 dynShadowDir;
uniform vec4 dynShadowParams;
uniform vec2 dynShadowRange;
const vec2 DYN_PD[ 12 ] = vec2[](
  vec2( -0.94201624, -0.39906216 ), vec2( 0.94558609, -0.76890725 ), vec2( -0.09418410, -0.92938870 ), vec2( 0.34495938, 0.29387760 ),
  vec2( -0.91588581, 0.45771432 ), vec2( -0.81544232, -0.87912464 ), vec2( -0.38277543, 0.27676845 ), vec2( 0.97484398, 0.75648379 ),
  vec2( 0.44323325, -0.97511554 ), vec2( 0.53742981, -0.47373420 ), vec2( -0.26496911, -0.41893023 ), vec2( 0.79197514, 0.19090188 ) );
// Light visibility from the shadow map
float dynShadow( vec3 wp, vec3 wn ) {
  if ( dynShadowParams.y < 0.5 ) return 1.0;
  float ndl = dot( wn, dynShadowDir );
  if ( ndl <= 0.02 ) return 1.0;
  vec3 p = wp + wn * dynShadowParams.w * ( 1.0 + 2.0 * ( 1.0 - ndl ) );
  vec4 sc = dynShadowMatrix * vec4( p, 1.0 );
  if ( sc.x <= 0.002 || sc.y <= 0.002 || sc.x >= 0.998 || sc.y >= 0.998 || sc.z >= 1.0 ) return 1.0;
  float z = sc.z - dynShadowParams.z;
  float uvPerUnit = dynShadowRange.y;
  // 1. anything nearby?
  float rs = 9.0 * uvPerUnit;
  float s = texture( dynShadowMap, vec3( sc.xy + vec2( rs, rs * 0.3 ), z ) )
    + texture( dynShadowMap, vec3( sc.xy + vec2( - rs * 0.3, rs ), z ) )
    + texture( dynShadowMap, vec3( sc.xy + vec2( - rs, - rs * 0.3 ), z ) )
    + texture( dynShadowMap, vec3( sc.xy + vec2( rs * 0.3, - rs ), z ) );
  if ( s > 3.999 ) return 1.0;
  // 2. average caster depth
  float zb = 0.0, nb = 0.0;
  for ( int i = 0; i < 12; i += 2 ) {
    float d = unpackRGBAToDepth( texture2D( dynShadowDepth, sc.xy + DYN_PD[ i ] * rs ) );
    if ( d < z ) { zb += d; nb += 1.0; }
  }
  float dc = unpackRGBAToDepth( texture2D( dynShadowDepth, sc.xy ) );
  if ( dc < z ) { zb += dc * 2.0; nb += 2.0; }
  zb = nb > 0.5 ? zb / nb : z - 20.0 / dynShadowRange.x;
  // 3. penumbra from the caster-receiver distance (units)
  float pen = clamp( ( z - zb ) * dynShadowRange.x * dynShadowParams.x, 1.2, 9.0 ) * uvPerUnit;
  s = texture( dynShadowMap, vec3( sc.xy, z ) );
  for ( int i = 0; i < 12; i ++ ) s += texture( dynShadowMap, vec3( sc.xy + DYN_PD[ i ] * pen, z ) );
  return s / 13.0;
}

// Contact occlusion: the props as spheres (cheap and smooth), darkening the
// floor and walls right around them, like the bounce light they hide.
uniform vec4 dynOcc[ ${MAX_OCC} ];
uniform int dynOccN;
float dynOcclusion( vec3 wp, vec3 wn ) {
  float occ = 0.0;
  for ( int i = 0; i < ${MAX_OCC}; i ++ ) {
    if ( i >= dynOccN ) break;
    vec3 v = dynOcc[ i ].xyz - wp;
    float d2 = dot( v, v );
    float r2 = dynOcc[ i ].w * dynOcc[ i ].w;
    if ( d2 > r2 * 9.0 ) continue;
    float d = sqrt( d2 );
    occ += clamp( dot( wn, v ) / d, 0.0, 1.0 ) * r2 / d2 * clamp( 3.0 - d / dynOcc[ i ].w, 0.0, 1.0 );
  }
  return clamp( occ, 0.0, 1.0 );
}
`;

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _cc = new THREE.Color();
const _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class DynamicShadows {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = 0;
    this.rt = null;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    this.cam.layers.set(SHADOW_LAYER);
    this.mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.dir = new THREE.Vector3(0, 1, 0);
    this.target = new THREE.Vector3(0, 1, 0);
    this.global = new THREE.Vector3(0, 1, 0);
    this.emitters = [];
    this.active = false;
    this.scanT = 0;
    this.aimT = 0;
    this.snap = true;
  }

  // 0 disables
  setResolution(size) {
    if (size === this.size) return;
    this.size = size;
    this.rt?.dispose();
    this.rt = null;
    if (!size) { shadowUniforms.dynShadowMap.value = shadowUniforms.dynShadowDepth.value = null; return; }
    const dt = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    dt.format = THREE.DepthFormat;
    dt.compareFunction = THREE.LessEqualCompare;
    dt.minFilter = dt.magFilter = THREE.LinearFilter;
    // the colour target holds the same depth, packed, for the blocker search
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: true, depthTexture: dt, type: THREE.UnsignedByteType, generateMipmaps: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    shadowUniforms.dynShadowMap.value = dt;
    shadowUniforms.dynShadowDepth.value = this.rt.texture;
    // allocate it now: an unrendered depth texture is not a valid shadow sampler
    this.clear();
  }

  clear() {
    const r = this.renderer, prev = r.getRenderTarget();
    const cc = r.getClearColor(_cc), ca = r.getClearAlpha();
    r.setClearColor(0xffffff, 1);
    r.setRenderTarget(this.rt);
    r.state.buffers.depth.setMask(true);
    r.clear(true, true, false);
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }

  // emitters for picking the shadow direction: the baked fixtures plus any
  // extra point lights of the level
  setLevel(game) {
    this.emitters = [];
    this.snap = true;
    this.scanT = 0;
    const lm = game.lm;
    if (lm) {
      for (const r of lm.charts.rects) {
        if (r.m !== MAT.LIGHT) continue;
        const f = rectFrame(r);
        const c = new THREE.Vector3(...f.o);
        c.setComponent(f.ua, c.getComponent(f.ua) + r.w * CELL / 2);
        c.setComponent(f.va, c.getComponent(f.va) + r.h * CELL / 2);
        const n = new THREE.Vector3(...f.n);
        c.addScaledVector(n, 2);
        this.emitters.push({ c, n, power: r.w * r.h * CELL * CELL });
      }
    }
    for (const L of game.levelLights || []) {
      this.emitters.push({ c: new THREE.Vector3(L.x, L.y, L.z), n: null, power: (L.i || 1) * (L.r || 300) * (L.r || 300) * 0.25 });
    }
    // the chamber-wide average keeps shadows from swinging as the player walks
    const g = game.grid;
    this.bounds = [0, 0, 0, g.nx * CELL, g.ny * CELL, g.nz * CELL];
    this.global.set(0, 1, 0);
    if (this.emitters.length) {
      const acc = new THREE.Vector3();
      for (let i = 0; i < 24; i++) {
        _c.set(((i * 0.618) % 1) * g.nx * CELL, CELL * 1.5, ((i * 0.381 + 0.5) % 1) * g.nz * CELL);
        if (g.solidAt(_c.x, _c.y, _c.z)) continue;
        if (this.lightDir(game, _c, _d, 6)) acc.add(_d);
      }
      if (acc.lengthSq() > 1e-6) this.global.copy(acc.normalize());
    }
  }

  // dominant direction towards the fixtures seen from p (false if none)
  lightDir(game, p, out, maxTraces = 16) {
    const cand = [];
    for (const e of this.emitters) {
      _v.subVectors(e.c, p);
      const d2 = _v.lengthSq();
      if (d2 < 1) continue;
      const d = Math.sqrt(d2);
      const ce = e.n ? -(_v.x * e.n.x + _v.y * e.n.y + _v.z * e.n.z) / d : 1;
      if (ce <= 0.05) continue;
      cand.push({ e, w: e.power * ce / (d2 + 4000), d });
    }
    cand.sort((a, b) => b.w - a.w);
    out.set(0, 0, 0);
    let any = false;
    for (let i = 0; i < Math.min(maxTraces, cand.length); i++) {
      const { e, w, d } = cand[i];
      _v.subVectors(e.c, p).divideScalar(d);
      if (traceGrid(game.grid, p, _v, d - 4)) continue;
      out.addScaledVector(_v, w);
      any = true;
    }
    if (!any || out.lengthSq() < 1e-12) return false;
    out.normalize();
    return true;
  }

  // lit, opaque, moving things go on the shadow layer
  scan(scene) {
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.world || o.userData.shadowScanned) return;
      o.userData.shadowScanned = true;
      if (o.userData.noShadow) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const ok = mats.some((m) => m && (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) && !(m.transparent && m.opacity < 0.85) && m.colorWrite !== false);
      if (ok) o.layers.enable(SHADOW_LAYER);
    });
  }

  update(game, dt) {
    const U = shadowUniforms;
    if (!this.rt || !game.lm || !game.quality.pbr || game.elevator?.active) {
      U.dynShadowParams.value.y = 0;
      U.dynOccN.value = 0;
      this.active = false;
      return;
    }
    this.active = true;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.scan(game.scene); }

    // aim: dominant light near the player, steadied by the chamber average
    const p = game.player.body.pos;
    this.aimT -= dt;
    if (this.aimT <= 0 || this.snap) {
      this.aimT = 0.25;
      _c.copy(p);
      if (this.lightDir(game, _c, _d)) this.target.copy(_d).lerp(this.global, 0.45).normalize();
      else this.target.copy(this.global);
      // keep the projection away from grazing so shadows stay compact
      if (this.target.y < 0.45) { this.target.y = 0.45; this.target.normalize(); }
    }
    if (this.snap) this.dir.copy(this.target);
    else this.dir.lerp(this.target, 1 - Math.exp(-dt * 1.5)).normalize();
    this.snap = false;

    // fit an orthographic box around the chamber (or the 2200-unit window
    // around the player in big chambers)
    const b = this.bounds, W = 1100;
    const x0 = Math.max(b[0], Math.min(p.x - W, b[3] - 2 * W)), x1 = Math.min(b[3], x0 + 2 * W);
    const z0 = Math.max(b[2], Math.min(p.z - W, b[5] - 2 * W)), z1 = Math.min(b[5], z0 + 2 * W);
    const cam = this.cam;
    _c.set((x0 + x1) / 2, (b[1] + b[4]) / 2, (z0 + z1) / 2);
    cam.up.copy(Math.abs(this.dir.y) > 0.99 ? _v.set(0, 0, 1) : UP);
    cam.position.copy(_c).addScaledVector(this.dir, 4000);
    cam.lookAt(_c);
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? x1 : x0, i & 2 ? b[4] : b[1], i & 4 ? z1 : z0).applyMatrix4(inv);
      mnx = Math.min(mnx, _v.x); mxx = Math.max(mxx, _v.x); mny = Math.min(mny, _v.y); mxy = Math.max(mxy, _v.y);
      mnz = Math.min(mnz, _v.z); mxz = Math.max(mxz, _v.z);
    }
    const ext = Math.ceil(Math.max(mxx - mnx, mxy - mny) / 64 + 0.5) * 64;
    const texel = ext / this.size;
    const cx = Math.round((mnx + mxx) / 2 / texel) * texel, cy = Math.round((mny + mxy) / 2 / texel) * texel;
    cam.left = cx - ext / 2; cam.right = cx + ext / 2; cam.bottom = cy - ext / 2; cam.top = cy + ext / 2;
    cam.near = -mxz - 20; cam.far = -mnz + 20;
    cam.updateProjectionMatrix();
    U.dynShadowMatrix.value.multiplyMatrices(_bias, cam.projectionMatrix).multiply(inv);
    U.dynShadowDir.value.copy(this.dir);
    const range = cam.far - cam.near;
    // the fixtures are big area lights: about 1 unit of penumbra per 4 units
    // between caster and receiver
    U.dynShadowParams.value.set(0.1, 1, 2.0 / range, Math.max(1.2, texel * 0.8));
    this.updateOccluders(game);
    U.dynShadowRange.value.set(range, 1 / ext);

    // draw the casters; the player's own body only exists in portal views,
    // but it should still shade the floor
    const r = this.renderer, scene = game.scene;
    const pm = game.playerModel;
    const pmVis = pm.group.visible;
    pm.group.visible = game.player.alive;
    const prevTarget = r.getRenderTarget(), prevAuto = r.autoClear, prevOverride = scene.overrideMaterial;
    const prevScissor = r.getScissorTest();
    r.setScissorTest(false);
    this.clear();
    scene.overrideMaterial = this.mat;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setScissorTest(prevScissor);
    scene.overrideMaterial = prevOverride;
    pm.group.visible = pmVis;
  }

  // nearest props to the player as occlusion spheres
  updateOccluders(game) {
    const occ = shadowUniforms.dynOcc.value, p = game.player.body.pos;
    const list = [];
    for (const c of game.cubes) {
      if (c.dissolving >= 0 || c.removed) continue;
      const b = c.body, r = Math.max(b.half.x, b.half.y, b.half.z) * 1.1;
      list.push([b.pos.x, b.pos.y, b.pos.z, r]);
    }
    if (game.player.alive) {
      const b = game.player.body, foot = b.pos.y - b.half.y;
      list.push([b.pos.x, foot + 14, b.pos.z, 15], [b.pos.x, foot + Math.max(30, b.half.y * 2 - 22), b.pos.z, 13]);
    }
    list.sort((a, b) => ((a[0] - p.x) ** 2 + (a[2] - p.z) ** 2) - ((b[0] - p.x) ** 2 + (b[2] - p.z) ** 2));
    const n = Math.min(MAX_OCC, list.length);
    for (let i = 0; i < n; i++) occ[i].set(...list[i]);
    shadowUniforms.dynOccN.value = n;
  }

  dispose() { this.rt?.dispose(); this.rt = null; this.size = 0; }
}
