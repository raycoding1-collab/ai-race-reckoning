import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';

export default class Test extends Scene {
  bg = new FSPass(`uniform float t; void main(){ vec2 p = vUv - 0.5; float r = length(p);
    fragColor = vec4(C_INK + C_SIGNAL * 1.4 * exp(-r * 18.0) * (0.6 + 0.4 * sin(t * 6.0)), 1.0); }`, { t: { value: 0 } });
  text = new Layer2D();
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.t!.value = f.t; this.bg.render(renderer, out);
    const c = this.text.ctx; this.text.clear();
    const l = lyrics.lines.find((x) => f.t >= x.start - 0.3 && f.t < x.end + 0.5);
    c.font = font(F.archivo(100, 900), 96); c.fillStyle = '#EEE9DF'; c.fillText(l ? l.text : '—', 120, 900);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.7 };
  }
}
