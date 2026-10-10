// `line`: placeholder (being built).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { clearRT } from '../engine/gl';
export default class Placeholder extends Scene {
  override render(_f: Frame, out: THREE.WebGLRenderTarget) { clearRT(this.ctx.renderer, out, [0.004, 0.004, 0.004]); }
}
