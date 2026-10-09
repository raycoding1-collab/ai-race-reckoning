import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { Pass } from '../vendor/addons/postprocessing/Pass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { SMAAPass } from '../vendor/addons/postprocessing/SMAAPass.js';

// Quality presets. "high" renders the whole recursive portal view into an
// HDR, multisampled, stencil-capable target and finishes it with bloom,
// ACES tone mapping, a colour grade and subtle lens effects (SMAA where
// multisampling is unavailable), with dynamic shadows, parallax panels and a
// planar goo reflection; "medium" keeps PBR materials and dynamic shadows but
// draws straight to the screen; "low" uses unlit baked materials.
export const QUALITY = {
  high: { post: true, pbr: true, msaa: 4, bloom: true, shadows: 2048, pom: true, planar: true },
  medium: { post: false, pbr: true, msaa: 0, bloom: false, shadows: 1024, pom: false },
  low: { post: false, pbr: false, msaa: 0, bloom: false, shadows: 0, pom: false },
};

class DrawPass extends Pass {
  constructor() { super(); this.needsSwap = false; this.draw = null; }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(readBuffer);
    this.draw?.();
  }
}

// Replace any non-finite pixel (NaN/Inf from a shader edge case) before bloom
// can smear it across the screen; also caps values to the half-float range.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = min(c, vec4(60000.0));
    }`,
};

// Display-space finish: colour grade tuned against the reference shots (cool,
// contrasty test-chamber look with deep blacks), a touch of lateral chromatic
// aberration toward the corners, vignette and film grain.
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.38 }, grain: { value: 0.02 }, time: { value: 0 }, aberration: { value: 0.0007 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform float grain; uniform float time; uniform float aberration; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 ca = d * aberration * r2 * 4.0;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + ca).r;
      c.b = texture2D(tDiffuse, vUv - ca).b;
      // colour grade in display space: the cool, contrasty test-chamber look
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 0.86);                                   // a little less saturated
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.36);       // S-curve
      c.rgb = clamp((c.rgb - 0.01) / 0.99, 0.0, 1.0);                      // deeper blacks
      c.rgb += pow(1.0 - c.rgb, vec3(3.0)) * vec3(-0.012, 0.010, 0.026);   // teal shadows
      c.rgb *= vec3(0.975, 1.0, 1.03);                                     // cool highlights
      float v = 1.0 - strength * smoothstep(0.25, 0.75, r2 * 2.0);
      c.rgb *= v;
      c.rgb += (h(vUv * 917.0) - 0.5) * grain;
      gl_FragColor = c;
    }`,
};

export class PostFX {
  constructor(renderer, preset) {
    this.renderer = renderer;
    const samples = renderer.capabilities.isWebGL2 ? preset.msaa : 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: true, samples,
    });
    this.composer = new EffectComposer(renderer, this.rt);
    this.drawPass = new DrawPass();
    this.composer.addPass(this.drawPass);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    if (preset.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.5, 1.6);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    // morphological AA where the HDR target cannot be multisampled
    if (!samples) {
      this.smaa = new SMAAPass(4, 4);
      this.composer.addPass(this.smaa);
    }
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(draw, time) {
    this.drawPass.draw = draw;
    this.vignette.material.uniforms.time.value = time % 100;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
    this.rt.dispose();
  }
}
