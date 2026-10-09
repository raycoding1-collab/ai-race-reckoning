import * as THREE from 'three';

// Toxic sludge: a murky, slowly churning surface that reflects the chamber.
// The material is a standard PBR surface (so the chamber's reflection cube,
// the portals' glow and the ambient cubes all apply) with an animated normal
// field, darker where the pit is deep. On 'high', the main view also gets a
// real planar reflection of the room, rendered at half resolution whenever
// goo is on screen; portal views fall back to the reflection cube.

const NOISE = /* glsl */`
uniform float uTime;
uniform float uFire;
uniform vec4 uBox;
uniform float uPlanar;
uniform sampler2D uReflMap;
uniform mat4 uReflMatrix;
varying vec3 vGooW;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float gNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gHash( i ), gHash( i + vec2( 1, 0 ) ), u.x ), mix( gHash( i + vec2( 0, 1 ) ), gHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
// slow sludge: two drifting octaves plus a lazy swirl
float gooH( vec2 p ) {
  float t = uTime;
  vec2 q = p + 0.35 * vec2( gNoise( p * 0.5 + t * 0.03 ), gNoise( p * 0.5 - t * 0.025 + 7.3 ) );
  return gNoise( q * 1.0 + vec2( t * 0.06, t * 0.025 ) ) * 0.55
    + gNoise( q * 2.7 - vec2( t * 0.045, -t * 0.07 ) ) * 0.3
    + gNoise( q * 6.0 + vec2( t * 0.11, t * 0.05 ) ) * 0.08;
}
`;

export function makeGooMaterial(box, fire) {
  const uniforms = {
    uTime: { value: 0 },
    uFire: { value: fire ? 1 : 0 },
    uBox: { value: new THREE.Vector4(box[0], box[2], box[3], box[5]) },
    uPlanar: { value: 0 },
    uReflMap: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a1406, roughness: 0.1, metalness: 0, envMapIntensity: 1 });
  mat.userData.goo = uniforms;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = 'varying vec3 vGooW;\n' + s.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGooW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    s.fragmentShader = NOISE + s.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 gp = vGooW.xz / 70.0;
        float gh = gooH( gp );
        vec2 ge = vec2( 0.035, 0.0 );
        // calmer with distance, where the ripples would only sparkle
        float gk = 0.2 / ( 1.0 + length( fwidth( gp ) ) * 25.0 );
        vec3 gooN = normalize( vec3( ( gh - gooH( gp + ge.xy ) ) * gk, 0.1, ( gh - gooH( gp + ge.yx ) ) * gk ) );
        // depth: shallow and lighter near the pit walls, near black in the middle
        float edge = min( min( vGooW.x - uBox.x, uBox.z - vGooW.x ), min( vGooW.z - uBox.y, uBox.w - vGooW.z ) );
        float shallow = exp( - max( edge, 0.0 ) / 26.0 );
        float scum = smoothstep( 0.62, 0.8, gooH( gp * 0.6 + 3.1 ) ) * 0.6 + shallow * 0.35;
        diffuseColor.rgb = mix( vec3( 0.022, 0.015, 0.005 ), vec3( 0.1, 0.072, 0.024 ), clamp( gh * 0.7 + shallow * 0.7, 0.0, 1.0 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.105, 0.045 ), scum * 0.55 );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = 0.05 + scum * 0.35;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize( ( viewMatrix * vec4( gooN, 0.0 ) ).xyz );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if ( uFire > 0.5 ) {
          float f = gNoise( gp * 2.4 + vec2( 0.0, - uTime * 1.3 ) ) * 0.6 + gNoise( gp * 5.7 - vec2( uTime * 0.7, uTime * 1.9 ) ) * 0.4;
          totalEmissiveRadiance = mix( vec3( 0.25, 0.02, 0.0 ), vec3( 3.2, 1.2, 0.2 ), smoothstep( 0.35, 0.95, f ) );
          diffuseColor.rgb *= 0.1;
        }
        {
          // a dull sheen so it never reads as a black hole (lit only by the ambient cubes on 'low')
          vec3 gv = normalize( cameraPosition - vGooW );
          float gfr = pow( 1.0 - max( dot( gooN, gv ), 0.0 ), 3.0 );
          totalEmissiveRadiance += vec3( 0.022, 0.02, 0.014 ) * gfr;
          #ifndef USE_ENVMAP
          // no reflection cube on 'low': the old self-lit look, with glints of the fixtures
          float gsp = pow( max( dot( reflect( - gv, gooN ), vec3( 0.0, 1.0, 0.0 ) ), 0.0 ), 60.0 );
          totalEmissiveRadiance += diffuseColor.rgb * 0.8 + vec3( 0.09, 0.08, 0.06 ) * gfr + vec3( 0.7, 0.62, 0.48 ) * gsp;
          #endif
        }`)
      .replace('radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );', `
        if ( uPlanar > 0.5 ) {
          vec4 pc = uReflMatrix * vec4( vGooW, 1.0 );
          vec2 ruv = pc.xy / pc.w + gooN.xz * 0.06;
          radiance += textureLod( uReflMap, ruv, 0.8 + roughnessFactor * 5.0 ).rgb;
        } else {
          radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
        }
        // the oily film tints what it reflects
        radiance *= vec3( 0.72, 0.58, 0.36 );`);
  };
  mat.customProgramCacheKey = () => 'goo';
  return mat;
}

// One half-resolution planar reflection per frame, for the goo surface the
// player is most likely looking at.
const _rp = new THREE.Vector3(), _cp = new THREE.Vector3(), _n = new THREE.Vector3(0, 1, 0);
const _view = new THREE.Vector3(), _look = new THREE.Vector3(), _target = new THREE.Vector3();
const _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _box = new THREE.Box3();
const _size = new THREE.Vector2();

export class GooReflection {
  constructor(renderer) {
    this.renderer = renderer;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0);
    this.rt = null;
    this.enabled = false;
    this.active = null;            // goo whose surface is reflected this frame
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.rt?.dispose(); this.rt = null; }
  }

  update(game) {
    const goos = game.entities.filter((e) => e.gooMat);
    for (const g of goos) g.gooMat.userData.goo.uPlanar.value = 0;
    this.active = null;
    if (!this.enabled || !goos.length || game.elevator?.active || !game.quality.pbr) return;
    const cam = game.camera;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    _cp.setFromMatrixPosition(cam.matrixWorld);
    let best = null, bestD = Infinity;
    for (const g of goos) {
      const b = g.box;
      if (_cp.y < g.top + 1) continue;
      _box.min.set(b[0], g.top - 1, b[2]); _box.max.set(b[3], g.top + 1, b[5]);
      if (!_frustum.intersectsBox(_box)) continue;
      const d = _box.distanceToPoint(_cp);
      if (d < bestD) { bestD = d; best = g; }
    }
    if (!best || bestD > 2600) return;
    const r = this.renderer;
    r.getDrawingBufferSize(_size);
    const w = Math.max(64, Math.round(_size.x / 2)), h = Math.max(64, Math.round(_size.y / 2));
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      });
    } else if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    // mirror the camera in the goo plane (as three's Reflector does), with an
    // oblique near plane on the surface
    _rp.set(_cp.x, best.top, _cp.z);
    _view.subVectors(_rp, _cp).reflect(_n).negate().add(_rp);
    _rot.extractRotation(cam.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _target.subVectors(_rp, _look).reflect(_n).negate().add(_rp);
    const vc = this.cam;
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vc.lookAt(_target);
    vc.near = cam.near; vc.far = cam.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(cam.projectionMatrix);
    const tm = best.gooMat.userData.goo.uReflMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _rp).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = vc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1; e[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    // draw the room (the player's own body included) without the goo
    const scene = game.scene, pm = game.playerModel;
    const pmVis = pm.group.visible;
    pm.group.visible = game.player.alive;
    for (const g of goos) g.mesh.visible = false;
    const prevTarget = r.getRenderTarget(), prevScissor = r.getScissorTest(), prevAuto = r.autoClear;
    r.setScissorTest(false);
    r.setRenderTarget(this.rt);
    r.state.buffers.depth.setMask(true);
    r.autoClear = false;
    r.clear(true, true, false);
    r.render(scene, vc);
    r.autoClear = prevAuto;
    r.setRenderTarget(prevTarget);
    r.setScissorTest(prevScissor);
    for (const g of goos) g.mesh.visible = true;
    pm.group.visible = pmVis;
    const u = best.gooMat.userData.goo;
    u.uReflMap.value = this.rt.texture;
    this.active = best;
    this.mainCamera = cam;
  }

  // per view: the planar image only matches the main camera
  beforeDraw(goo, camera) {
    goo.gooMat.userData.goo.uPlanar.value = this.active === goo && camera === this.mainCamera ? 1 : 0;
  }

  dispose() { this.rt?.dispose(); this.rt = null; }
}
