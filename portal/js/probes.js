import * as THREE from 'three';
import { sampleAmbientCube, ambientCubeToSH } from './lightmap.js';

// Per-object ambient lighting, as Source does for models: every lit dynamic
// mesh samples the baked ambient cubes at its own position, so a cube in a
// dark corner is dark and a turret under a fixture is bright.

const CHUNK = /* glsl */`
uniform vec3 probeSH[ 9 ];
vec3 probeIrradiance( vec3 n ) {
  vec3 w = normalize( ( vec4( n, 0.0 ) * viewMatrix ).xyz );
  float x = w.x, y = w.y, z = w.z;
  vec3 r = probeSH[ 0 ] * 0.886227;
  r += probeSH[ 1 ] * 1.023328 * y;
  r += probeSH[ 2 ] * 1.023328 * z;
  r += probeSH[ 3 ] * 1.023328 * x;
  r += probeSH[ 4 ] * 0.858086 * x * y;
  r += probeSH[ 5 ] * 0.858086 * y * z;
  r += probeSH[ 6 ] * ( 0.743125 * z * z - 0.247708 );
  r += probeSH[ 7 ] * 0.858086 * x * z;
  r += probeSH[ 8 ] * 0.429043 * ( x * x - y * y );
  return max( r, vec3( 0.0 ) );
}
`;

const patched = new WeakSet();
const _p = new THREE.Vector3();
const _cube = new Array(18).fill(0);

function patchMaterial(mat) {
  if (patched.has(mat) || !mat.isMeshStandardMaterial) return;
  patched.add(mat);
  const sh = { value: Array.from({ length: 9 }, () => new THREE.Vector3()) };
  mat.userData.probeSH = sh;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.uniforms.probeSH = sh;
    s.fragmentShader = s.fragmentShader
      .replace('#include <lights_pars_begin>', '#include <lights_pars_begin>\n' + CHUNK)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );', 'irradiance += probeIrradiance( geometryNormal );'));
  };
  const key = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => key.call(mat) + '|probe';
  mat.needsUpdate = true;
}

export class ObjectProbes {
  constructor(game) { this.game = game; this.frame = 0; this.scanT = 0; }
  // find new lit meshes (entities spawn throughout a chamber)
  scan(scene) {
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.world || o.userData.probe) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => m && m.isMeshStandardMaterial)) return;
      for (const m of mats) patchMaterial(m);
      o.userData.probe = { frame: -1, sh: new THREE.SphericalHarmonics3() };
      const prev = o.onBeforeRender;
      o.onBeforeRender = (renderer, sc, cam, geo, material, group) => {
        prev?.call(o, renderer, sc, cam, geo, material, group);
        this.apply(o, material);
      };
    });
  }
  apply(o, material) {
    const g = this.game, pr = o.userData.probe;
    const u = material.userData.probeSH;
    if (!u || !g.lm) return;
    if (pr.frame !== this.frame) {
      pr.frame = this.frame;
      o.getWorldPosition(_p);
      if (sampleAmbientCube(g.lm, g.grid, _p, _cube)) ambientCubeToSH(_cube, pr.sh);
      else pr.sh.copy(g.probe.sh);
    }
    for (let i = 0; i < 9; i++) u.value[i].copy(pr.sh.coefficients[i]);
  }
  update(dt, scene) {
    this.frame++;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.scan(scene); }
  }
}
