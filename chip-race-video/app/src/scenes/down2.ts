// down2 (chorus 2, "Nobody's slowing the silicon down"): an engraved DASHBOARD. The grid2 meter arrives as the
// speedometer (same pose), its labels flip from GW to billions of transistors; the needle runs through the redline to
// the stop while the odometer rolls the transistor count, the cluster rattles harder and harder; on "down" the brake
// pedal snaps off, DOWN flips 180 degrees onto the dial, and the picture stutters and dissolves into an LED matrix.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { TPP, lineByScene } from './_motifs';
import { ease, prog, pulse } from '../engine/util';
import { shakeVec } from './node2-kit';
import { drawDash, T_DOWN, T_STUT0 } from './down2-dash';
import { LedWall } from './post2-led';
import type { Word } from '../engine/lyrics';

export default class Down2 extends Scene {
  text = new Layer2D();
  wall = new LedWall();
  words: Word[] = [];
  tpp!: TPP;

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'down2').words;
    this.tpp = new TPP(this.ctx.lyrics);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out, LIN.ink);
    const c = this.text.ctx;
    this.text.clear();
    drawDash(c, t, { words: this.words, tpp: this.tpp.value(t), kick: f.a.kick });
    const tex = this.text.upload();
    const led = ease.inOutQuad(prog(t, 85.95, 86.2));
    if (led <= 0) comp.draw(renderer, tex, out);
    else this.wall.render(renderer, out, tex, led, 0, t);
    const down = pulse(t, T_DOWN, 0.1);
    const rumble = 1.5 + 9 * ease.inQuad(prog(t, 82.5, T_DOWN)) + 16 * down;
    const [sx, sy] = shakeVec(t, rumble * (t < T_STUT0 ? 1 : 0.3), 4);
    return {
      bloom: 0.7 + 0.5 * down, bloomThreshold: 0.82, shake: [sx, sy] as [number, number], zoom: 1 + 0.012 * f.a.kick + 0.05 * down,
      ca: 0.7 + 3.5 * down + 1.2 * ease.inQuad(prog(t, 83.5, T_DOWN)), flash: 0.25 * down, vignette: 0.45,
    };
  }
}
