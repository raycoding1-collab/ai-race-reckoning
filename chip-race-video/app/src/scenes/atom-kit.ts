// Shared kit for the bridge plates (atom, dream, crack, whoscrown): the Cormorant-italic karaoke
// line, and the STM lattice that atom shows and dream melts into a landscape of weights.
import * as THREE from 'three';
import { F, font, glyphX, measure } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { ease, hash, lerp, mulberry32, prog, smoothstep } from '../engine/util';
import { rgba } from '../engine/palette';

// ------------------------------------------------------------------ karaoke (bridge register)
export interface BridgeLineOpts {
  x: number; y: number; size: number;
  align?: 'left' | 'center' | 'right';
  /** alpha of the unsung words (the style bible: ~30-40 % bone) */
  dim?: number;
  /** seconds a word shows dimly before its onset (never lights early) */
  lead?: number;
  /** overall alpha */
  alpha?: number;
  weight?: number;
  /** colour of the word being sung, and of the sung words after it settles */
  hot?: string; done?: string;
  /** pixels the word rises while it appears */
  rise?: number;
}
export interface WordBox { x: number; w: number; y: number; word: Line['words'][number]; i: number }

/** Lay the line out: word boxes at the given anchor (each word at its kerned position inside the line string). */
export function layoutLine(line: Line, o: Pick<BridgeLineOpts, 'x' | 'y' | 'size' | 'align' | 'weight'>): WordBox[] {
  const fam = F.serif(o.weight ?? 400, true);
  const total = measure(line.text, fam, o.size);
  const x0 = o.align === 'center' ? o.x - total / 2 : o.align === 'right' ? o.x - total : o.x;
  const out: WordBox[] = [];
  let ci = 0;
  line.words.forEach((w, i) => {
    const chars = Array.from(w.w);
    const x = x0 + glyphX(line.text, ci, fam, o.size);
    out.push({ x, w: measure(w.w, fam, o.size), y: o.y, word: w, i });
    ci += chars.length + 1;
  });
  return out;
}

/** Draw a lyric line word by word: dim before, an amber wipe along the sung syllables, bone after. */
export function drawBridgeLine(c: CanvasRenderingContext2D, line: Line, t: number, o: BridgeLineOpts): WordBox[] {
  const boxes = layoutLine(line, o);
  const fam = F.serif(o.weight ?? 400, true);
  const dim = o.dim ?? 0.32, lead = o.lead ?? 0.3, A = o.alpha ?? 1, rise = o.rise ?? 10;
  const hot = o.hot ?? rgba('signal'), done = o.done ?? rgba('bone');
  c.save();
  c.font = font(fam, o.size);
  c.textBaseline = 'alphabetic';
  for (const b of boxes) {
    const w = b.word;
    const appear = prog(t, w.start - lead, w.start, ease.outCubic);
    if (appear <= 0) continue;
    const yy = b.y + (1 - appear) * rise;
    // unsung ghost
    c.globalAlpha = A * dim * appear;
    c.fillStyle = rgba('bone');
    c.fillText(w.w, b.x, yy);
    const p = Lyrics.wordProgress(w, t);
    if (p > 0) {
      // sung part: clipped wipe; amber while it is being sung, settling to bone
      const settle = smoothstep(w.end, w.end + 0.5, t);
      c.save();
      c.beginPath();
      c.rect(b.x - 4, yy - o.size * 1.2, (b.w + 8) * (p >= 1 ? 1.2 : p), o.size * 1.8);
      c.clip();
      c.globalAlpha = A;
      c.fillStyle = hot;
      c.fillText(w.w, b.x, yy);
      if (settle > 0) { c.globalAlpha = A * settle; c.fillStyle = done; c.fillText(w.w, b.x, yy); }
      c.restore();
    }
  }
  c.restore();
  return boxes;
}

// ------------------------------------------------------------------ STM lattice
/** Square lattice of atoms, 54 px apart, on a half-resolution float height texture (shared by atom and dream). */
export const LAT = {
  pitch: 54, cols: 32, rows: 15, x0: 156, y0: 60,
  /** texture size (1 texel = 2 logical px) */
  tw: 960, th: 540, texel: 2,
  sigma: 9.5,
};
export const siteX = (i: number) => LAT.x0 + LAT.pitch * i;
export const siteY = (j: number) => LAT.y0 + LAT.pitch * j;

/** The atom bump kernel, sampled at continuous position (cx, cy) in logical px, added into `arr` (row 0 = bottom). */
export function splat(arr: Float32Array, cx: number, cy: number, amp: number, sigma = LAT.sigma) {
  const { tw, th, texel } = LAT;
  const R = sigma * 3.2;
  const tx0 = Math.max(0, Math.floor((cx - R) / texel)), tx1 = Math.min(tw - 1, Math.ceil((cx + R) / texel));
  const ty0 = Math.max(0, Math.floor((cy - R) / texel)), ty1 = Math.min(th - 1, Math.ceil((cy + R) / texel));
  const k = 1 / (2 * sigma * sigma);
  for (let ty = ty0; ty <= ty1; ty++) {
    const dy = (ty + 0.5) * texel - cy;
    const row = (th - 1 - ty) * tw;
    for (let tx = tx0; tx <= tx1; tx++) {
      const dx = (tx + 0.5) * texel - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      arr[row + tx] += amp * Math.exp(-d2 * k);
    }
  }
}

export interface LatticeBase {
  data: Float32Array;
  /** per site amplitude (0 = vacancy) so a moved atom can be lifted out of its site */
  amp: Float32Array;
}

/** Static base: terrace step, impurities, vacancies, faint noise, and every lattice atom. */
export function buildLattice(seed = 7): LatticeBase {
  const { tw, th, cols, rows } = LAT;
  const data = new Float32Array(tw * th);
  const rnd = mulberry32(seed);
  // terrace: a monatomic step running diagonally, with a soft shoulder
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const x = (tx + 0.5) * LAT.texel, y = (ty + 0.5) * LAT.texel;
      // line from (0,700) to (1920,300): signed distance along its normal
      const d = (y - (700 - x * (400 / 1920))) * 0.9;
      const step = smoothstep(-8, 8, -d) * 0.2; // higher terrace above/left of the line
      const n = 0.035 * (Math.sin(x * 0.011 + y * 0.017) + Math.sin(x * 0.023 - y * 0.009 + 1.3));
      data[(th - 1 - ty) * tw + tx] = step + n + 0.04;
    }
  }
  const amp = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let a = 0.93 + rnd() * 0.12;
      const h = hash(i, j, seed);
      if (h < 0.012) a = 0; // vacancy
      else if (h > 0.985) a = 1.45; // impurity
      amp[j * cols + i] = a;
      if (a > 0) splat(data, siteX(i), siteY(j), a);
    }
  }
  return { data, amp };
}

export function makeHeightTexture(arr: Float32Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(arr, LAT.tw, LAT.th, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** GLSL: manual bilinear fetch of the float height texture (no float-linear extension needed). */
export const GLSL_HEIGHT = /* glsl */ `
uniform sampler2D uH; uniform vec2 uHsize;
float hTex(vec2 px) { // px in logical px, y down from the top
  vec2 q = vec2(px.x, 1080.0 - px.y) / ${LAT.texel.toFixed(1)} - 0.5;
  vec2 i = floor(q), f = fract(q);
  ivec2 s = ivec2(uHsize);
  ivec2 a = clamp(ivec2(i), ivec2(0), s - 1), b = clamp(ivec2(i) + 1, ivec2(0), s - 1);
  float h00 = texelFetch(uH, ivec2(a.x, a.y), 0).r, h10 = texelFetch(uH, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(uH, ivec2(a.x, b.y), 0).r, h11 = texelFetch(uH, ivec2(b.x, b.y), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}`;

export { lerp };
