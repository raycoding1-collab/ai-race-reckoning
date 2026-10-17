// post2 (and down2's last 0.3 s): an LED matrix. A cell buffer (96x54, pitch 20 px) drawn with a 5x7 pixel font,
// shown through a shader that renders each cell as a round LED (lens highlight, housing, module seams), or samples
// a Canvas2D picture per cell (the dashboard handed over from down2).
import * as THREE from 'three';
import { FSPass } from '../engine/gl';

export const GW = 96, GH = 54, PITCH = 20;

export const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ',': ['.....', '.....', '.....', '.....', '..##.', '..#..', '.#...'], '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'], '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'], '>': ['#....', '##...', '###..', '####.', '###..', '##...', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'], ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '•': ['.....', '.....', '.###.', '.###.', '.###.', '.....', '.....'],
};

export const textWidth = (s: string, sc: number) => s.length * 6 * sc - sc;

const DUMMY = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
DUMMY.needsUpdate = true;

export class LedWall {
  data = new Float32Array(GW * GH * 4);
  tex: THREE.DataTexture;
  pass: FSPass;
  constructor() {
    this.tex = new THREE.DataTexture(this.data, GW, GH, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.pass = new FSPass(LED_FRAG, {
      uCanvas: { value: DUMMY }, uCells: { value: this.tex }, uLed: { value: 1 }, uCellMix: { value: 1 }, uT: { value: 0 }, uScan: { value: 999 },
    });
  }
  clear() { this.data.fill(0); }
  put(x: number, y: number, r: number, g: number, b: number, k = 1) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) return;
    const o = (y * GW + x) * 4;
    this.data[o] = Math.max(this.data[o]!, r * k); this.data[o + 1] = Math.max(this.data[o + 1]!, g * k); this.data[o + 2] = Math.max(this.data[o + 2]!, b * k); this.data[o + 3] = 1;
  }
  /** overwrite (for the survivors / erasing) */
  set(x: number, y: number, r: number, g: number, b: number) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) return;
    const o = (y * GW + x) * 4;
    this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 1;
  }
  get(x: number, y: number): [number, number, number] {
    if (x < 0 || y < 0 || x >= GW || y >= GH) return [0, 0, 0];
    const o = (y * GW + x) * 4; return [this.data[o]!, this.data[o + 1]!, this.data[o + 2]!];
  }
  /** draw text; wipe in 0..1 reveals left to right; returns end x */
  text(s: string, x: number, y: number, sc: number, col: [number, number, number], k = 1, wipe = 1, clipX0 = 0, clipX1 = GW) {
    const total = textWidth(s, sc);
    const lim = x + total * wipe;
    for (let i = 0; i < s.length; i++) {
      const g = G[s[i]!] ?? G[' ']!;
      const gx = x + i * 6 * sc;
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
        if (g[r]![q] !== '#') continue;
        for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
          const cx = gx + q * sc + dx;
          if (cx < clipX0 || cx >= clipX1 || cx >= lim) continue;
          this.put(cx, y + r * sc + dy, col[0], col[1], col[2], k);
        }
      }
    }
    return x + total;
  }
  upload() { this.tex.needsUpdate = true; }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, canvasTex: THREE.Texture | null, led: number, cellMix: number, t: number, scan = 999) {
    this.pass.u.uCanvas!.value = canvasTex ?? DUMMY; this.pass.u.uScan!.value = scan;
    this.pass.u.uLed!.value = led; this.pass.u.uCellMix!.value = cellMix; this.pass.u.uT!.value = t;
    this.pass.render(renderer, out);
  }
}

const LED_FRAG = /* glsl */ `
uniform sampler2D uCanvas; uniform sampler2D uCells;
uniform float uLed; uniform float uCellMix; uniform float uT; uniform float uScan;
const float PITCH = ${PITCH}.0;
vec3 canvasAt(vec2 P) { vec4 s = texture(uCanvas, vec2(P.x / 1920.0, 1.0 - P.y / 1080.0)); return s.rgb * s.a; }
void main() {
  vec2 P = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 cf = P / PITCH;
  ivec2 ci = ivec2(floor(cf));
  vec2 lf = fract(cf) - 0.5;
  vec2 cp = (vec2(ci) + 0.5) * PITCH;
  vec3 cc = vec3(0.0);
  if (uCellMix < 0.999 || uScan < 900.0) {
    cc = canvasAt(cp) * 0.4;
    cc += canvasAt(cp + vec2(-6.0, -6.0)) * 0.15 + canvasAt(cp + vec2(6.0, -6.0)) * 0.15 + canvasAt(cp + vec2(-6.0, 6.0)) * 0.15 + canvasAt(cp + vec2(6.0, 6.0)) * 0.15;
  }
  vec3 dc = texelFetch(uCells, clamp(ci, ivec2(0), ivec2(${GW - 1}, ${GH - 1})), 0).rgb;
  float useData = uCellMix * step(float(ci.y) + 0.5, uScan);
  vec3 col = mix(cc, dc, useData);
  float scanLine = 1.0 - smoothstep(0.0, 1.6, abs(float(ci.y) + 0.5 - uScan));
  float lum = max(col.r, max(col.g, col.b));
  float r = mix(0.2, 0.43, smoothstep(0.0, 1.0, uLed));
  float d = length(lf) - r;
  float aa = fwidth(d) * 1.0;
  float m = 1.0 - smoothstep(-aa, aa, d);
  // lens: brighter centre, rim darker; specular spot
  float lens = 0.75 + 0.4 * (1.0 - smoothstep(0.0, r, length(lf)));
  float spec = smoothstep(0.1, 0.0, length(lf - vec2(-0.13, -0.13)));
  vec3 lit = col * lens * 1.5;
  vec3 housing = vec3(0.0075, 0.0072, 0.007) * (0.7 + 0.3 * lens) + vec3(0.02) * spec * 0.4;
  vec3 ledOut = vec3(0.0035) + m * (housing + lit) + m * spec * 0.12 * lum;
  ledOut += m * vec3(1.6, 1.3, 0.9) * scanLine * step(0.0, uScan) * (uScan < 90.0 ? 1.0 : 0.0);
  // module seams every 16 cells x 18 cells
  vec2 seam = abs(fract(cf / vec2(16.0, 18.0)) - 0.5);
  float seamLine = 1.0 - smoothstep(0.0, 0.02, min(0.5 - seam.x, 0.5 - seam.y) - 0.0);
  ledOut *= 1.0 - 0.5 * seamLine * 0.0;
  // panel glass glint
  vec3 pass = canvasAt(P);
  float k = smoothstep(0.0, 1.0, uLed);
  fragColor = vec4(mix(pass, ledOut, k), 1.0);
}`;
