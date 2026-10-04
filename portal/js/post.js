import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { Pass } from '../vendor/addons/postprocessing/Pass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { FXAAShader } from '../vendor/addons/shaders/FXAAShader.js';

// Quality presets. "high" renders the whole recursive portal view into an
// HDR, multisampled, stencil-capable target and finishes it with bloom,
// ACES tone mapping and a soft vignette; "medium" keeps PBR materials but
// draws straight to the screen; "low" uses unlit baked materials.
export const QUALITY = {
  high: { post: true, pbr: true, msaa: 4, bloom: true },
  medium: { post: false, pbr: true, msaa: 0, bloom: false },
  low: { post: false, pbr: false, msaa: 0, bloom: false },
};

class DrawPass extends Pass {
  constructor() { super(); this.needsSwap = false; this.draw = null; }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(readBuffer);
    this.draw?.();
  }
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.32 }, grain: { value: 0.025 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform float grain; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - strength * smoothstep(0.25, 0.75, dot(d, d) * 2.0);
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
    if (preset.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 1.05);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    if (!samples) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
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
