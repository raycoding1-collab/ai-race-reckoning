import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

/* ───────────────────────── Setup ───────────────────────── */

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const loaderText = $('loader-text'), loaderBar = $('loader-bar');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function stage(text, pct) { loaderText.textContent = text; loaderBar.style.width = pct + '%'; await nextFrame(); }

function fail(msg) {
  loaderText.innerHTML = '<div class="fallback">' + msg + '</div>';
  loaderBar.parentElement.hidden = true;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  fail('This model needs WebGL 2, which this browser or device has turned off. Try a current version of Chrome, Safari, Edge or Firefox with hardware acceleration enabled.');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
$('stage').appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '3D model of an AI accelerator package. Drag to orbit, scroll or pinch to zoom.');
renderer.domElement.setAttribute('role', 'img');

const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
// Phones: touch-first and small. They get full-DPR rendering with lighter effects and dynamic resolution.
const MOBILE = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
const vp = { w: innerWidth, h: innerHeight };
const BG = new THREE.Color('#0a0a0b');

const scene = new THREE.Scene();
scene.background = BG.clone();
scene.fog = new THREE.Fog(BG.clone(), 26, 62);

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 200);
const HOME_DIR = new THREE.Vector3(15.4, 11.3, 19.1).normalize();
const REF_DIST = 27;
const HOME = { pos: HOME_DIR.clone().multiplyScalar(REF_DIST), target: new THREE.Vector3(0, 1.25, 0) };
let fitScale = 1; // camera distances scale with how much free screen the layout leaves
camera.position.set(26, 21, 36);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 4.5;
controls.maxDistance = 42;
controls.maxPolarAngle = Math.PI * 0.64;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.45;
controls.target.copy(HOME.target);
controls.enablePan = true;
controls.screenSpacePanning = true;

/* Seeded RNG so the layout is identical on every load. */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── Procedural texture painter ─────────────────────────
   Paints colour, roughness, metalness, height and emission in lockstep, then derives
   a tangent-space normal map from the height field. */

// Desktop textures are painted at 1.5x; drawing code works in the same logical units either way.
const TEX_SCALE = MOBILE ? 1 : 1.5;
const MAX_TEX = renderer.capabilities.maxTextureSize;
// Heavy texture loops hand control back to the browser every ~12 ms so the page keeps
// scrolling while the model is generated. The pixels produced are identical.
let sliceStart = performance.now();
const yieldNow = () => new Promise((r) => setTimeout(r, 0));
async function maybeYield() {
  if (performance.now() - sliceStart > 12) { await yieldNow(); sliceStart = performance.now(); }
}

class Painter {
  constructor(w, h, base, scale = TEX_SCALE) {
    const s = Math.min(scale, MAX_TEX / Math.max(w, h));
    this.lw = w; this.lh = h; this.s = s;
    this.w = Math.round(w * s); this.h = Math.round(h * s); this.cv = {}; this.ctx = {};
    for (const k of ['c', 'r', 'm', 'h', 'e']) {
      const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
      this.cv[k] = cv; this.ctx[k] = cv.getContext('2d', { willReadFrequently: k === 'h' || k === 'r' || k === 'm' });
      this.ctx[k].scale(s, s);
    }
    this.ctx.e.fillStyle = '#000'; this.ctx.e.fillRect(0, 0, w, h);
    this.paint(base, (x) => x.fillRect(0, 0, w, h));
  }
  static g(v) { const n = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${n},${n},${n})`; }
  paint(p, fn) {
    for (const k of ['c', 'r', 'm', 'h', 'e']) {
      if (p[k] == null) continue;
      const x = this.ctx[k];
      const style = k === 'c' ? p.c : (typeof p[k] === 'string' ? p[k] : Painter.g(p[k]));
      x.save(); x.fillStyle = style; x.strokeStyle = style;
      if (p.a != null) x.globalAlpha = p.a;
      fn(x); x.restore();
    }
  }
  rect(x, y, w, h, p) { this.paint(p, (c) => c.fillRect(x, y, w, h)); }
  circle(x, y, r, p) { this.paint(p, (c) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }); }
  ring(x, y, r, lw, p) { this.paint(p, (c) => { c.lineWidth = lw; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); }); }
  poly(pts, lw, p) {
    this.paint(p, (c) => {
      c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    });
  }
  text(str, x, y, font, p, align = 'left', spacing = 0) {
    this.paint(p, (c) => {
      c.font = font; c.textAlign = align; c.textBaseline = 'middle';
      if ('letterSpacing' in c) c.letterSpacing = spacing + 'px';
      c.fillText(str, x, y);
    });
  }
  /* Soft blotches in roughness: the thumbprints and handling marks that make a surface read as real. */
  smudge(rand, n, strength) {
    const x = this.ctx.r;
    for (let i = 0; i < n; i++) {
      const cx = rand() * this.lw, cy = rand() * this.lh, rad = (0.05 + rand() * 0.18) * Math.max(this.lw, this.lh);
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const v = rand() < 0.5 ? 255 : 0;
      gr.addColorStop(0, `rgba(${v},${v},${v},${strength * (0.4 + rand() * 0.6)})`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = gr; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }
  async grain(rand, amount, keys = ['r', 'h']) {
    const row = this.w * 4;
    for (const k of keys) {
      const x = this.ctx[k];
      const img = x.getImageData(0, 0, this.w, this.h), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (rand() - 0.5) * amount * 255;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
        if (i % (row * 32) === 0) await maybeYield();
      }
      x.putImageData(img, 0, 0);
    }
  }
  _tex(canvas, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    // Once the pixels are on the GPU the CPU copy is not needed; freeing it keeps peak memory down.
    t.onUpdate = () => { canvas.width = canvas.height = 1; };
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = MAX_ANISO;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  }
  async build(normalStrength = 2.0, blur = 0.7, emissive = false) {
    const { w, h } = this;
    await maybeYield();
    // Combined roughness (G) / metalness (B) map, the layout three.js expects.
    const rd = this.ctx.r.getImageData(0, 0, w, h).data, md = this.ctx.m.getImageData(0, 0, w, h).data;
    const ormCv = document.createElement('canvas'); ormCv.width = w; ormCv.height = h;
    const ormCtx = ormCv.getContext('2d'); const orm = ormCtx.createImageData(w, h);
    for (let i = 0; i < orm.data.length; i += 4) { orm.data[i] = 255; orm.data[i + 1] = rd[i]; orm.data[i + 2] = md[i]; orm.data[i + 3] = 255; }
    ormCtx.putImageData(orm, 0, 0);
    this.cv.r.width = this.cv.m.width = 0; // intermediate layers are no longer needed
    await maybeYield();

    // Height → normal (Sobel), after a slight blur so edges bevel instead of alias.
    const hb = document.createElement('canvas'); hb.width = w; hb.height = h;
    const hbx = hb.getContext('2d', { willReadFrequently: true });
    hbx.filter = `blur(${blur}px)`; hbx.drawImage(this.cv.h, 0, 0); hbx.filter = 'none';
    const hd = hbx.getImageData(0, 0, w, h).data;
    hb.width = 0; this.cv.h.width = 0;
    const nCv = document.createElement('canvas'); nCv.width = w; nCv.height = h;
    const nCtx = nCv.getContext('2d'); const nImg = nCtx.createImageData(w, h); const nd = nImg.data;
    const H = (x, y) => hd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) {
      if ((y & 15) === 0) await maybeYield();
      for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
        const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
        let nx = -dx * normalStrength, ny = dy * normalStrength, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * w + x) * 4;
        nd[i] = (nx * 0.5 + 0.5) * 255; nd[i + 1] = (ny * 0.5 + 0.5) * 255; nd[i + 2] = (nz * 0.5 + 0.5) * 255; nd[i + 3] = 255;
      }
    }
    nCtx.putImageData(nImg, 0, 0);
    return {
      map: this._tex(this.cv.c, true),
      orm: this._tex(ormCv, false),
      normal: this._tex(nCv, false),
      emissive: emissive ? this._tex(this.cv.e, true) : (this.cv.e.width = 0, null),
    };
  }
}

/* ───────────────────────── Detail maps ─────────────────────────
   Tiling micro-normal maps blended over the base normal map, so surfaces keep
   resolving new detail when the camera gets very close. */

function detailTexture(size, draw, strength) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, size, size);
  draw(x, size, rng(size + 7));
  const hd = x.getImageData(0, 0, size, size).data;
  const out = x.createImageData(size, size), nd = out.data;
  const H = (i, j) => hd[(((j + size) % size) * size + ((i + size) % size)) * 4] / 255;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let nx = -(H(i + 1, j) - H(i - 1, j)) * strength, ny = (H(i, j + 1) - H(i, j - 1)) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); const k = (j * size + i) * 4;
    nd[k] = (nx / l * 0.5 + 0.5) * 255; nd[k + 1] = (ny / l * 0.5 + 0.5) * 255; nd[k + 2] = (nz / l * 0.5 + 0.5) * 255; nd[k + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO; t.colorSpace = THREE.NoColorSpace;
  return t;
}
const g8 = (v) => { const n = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${n},${n},${n})`; };
const DETAIL = {
  // Standard-cell rows: cells of varying width, with metal tracks running along each row
  cells: () => detailTexture(256, (x, S, r) => {
    for (let y = 0; y < S; y += 16) {
      let cx = 0;
      while (cx < S) {
        const w = Math.min(S - cx, 3 + Math.floor(r() * 22));
        x.fillStyle = g8(0.44 + r() * 0.16); x.fillRect(cx, y + 1, w - 1, 14);
        cx += w;
      }
      x.fillStyle = g8(0.62); x.fillRect(0, y + 4, S, 1); x.fillRect(0, y + 11, S, 1);
      x.fillStyle = g8(0.36); x.fillRect(0, y, S, 1);
    }
  }, 2.2),
  // Brushing: fine streaks running along the rows
  brushed: () => detailTexture(256, (x, S, r) => {
    let v = 0.5;
    for (let y = 0; y < S; y++) { v = 0.5 + (v - 0.5) * 0.35 + (r() - 0.5) * 0.22; x.fillStyle = g8(v); x.fillRect(0, y, S, 1); }
    for (let i = 0; i < 90; i++) { x.fillStyle = g8(0.5 + (r() - 0.5) * 0.5); x.fillRect(r() * S, r() * S, 20 + r() * 120, 1); }
  }, 1.6),
  // Solder-mask orange peel: soft, overlapping dimples
  peel: () => detailTexture(128, (x, S, r) => {
    for (let i = 0; i < 260; i++) {
      const cx = r() * S, cy = r() * S, rad = 3 + r() * 7, up = r() < 0.5;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
        gr.addColorStop(0, up ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
        x.fillStyle = gr; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
      }
    }
  }, 3.0),
};
function addDetail(mat, tex, repeat, scale, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    sh.uniforms.detailMap = { value: tex };
    sh.uniforms.detailRepeat = { value: new THREE.Vector2(repeat[0], repeat[1]) };
    sh.uniforms.detailScale = { value: scale };
    sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detailRepeat;\nuniform float detailScale;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        mapN.xy *= normalScale;
        vec3 dN = texture2D( detailMap, vNormalMapUv * detailRepeat ).xyz * 2.0 - 1.0;
        mapN = normalize( vec3( mapN.xy + dN.xy * detailScale, mapN.z ) );
        normal = normalize( tbn * mapN );
      #else
        #include <normal_fragment_maps>
      #endif`);
  };
  mat.customProgramCacheKey = () => 'detail-' + key;
}

/* Thin slabs with a microscopic edge radius, so diced silicon catches light on its edges.
   Top-face UVs are rebuilt to match BoxGeometry, which the painted layouts assume. */
function slab(w, h, d, r) {
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) / w + 0.5, ny > 0 ? 0.5 - p.getZ(i) / d : 0.5 + p.getZ(i) / d);
  }
  uv.needsUpdate = true;
  return g;
}

/* ───────────────────────── Dimensions (1 unit ≈ 6.5 mm) ───────────────────────── */

const MM = 6.5;
const D = {
  sub: { w: 10, d: 10, t: 0.26 },
  stiff: { ow: 9.6, od: 9.6, iw: 8.3, id: 7.0, t: 0.24 },
  inter: { w: 7.12, d: 5.34, t: 0.08 },
  die: { w: 3.8, d: 4.9, t: 0.16 },
  hbm: { w: 1.3, d: 1.55, gap: 0.12, base: 0.024, layer: 0.013, bond: 0.004, n: 8 },
  bga: { n: 60, pitch: 0.155, r: 0.058, hole: 12 },
};
D.y = {};
D.y.subTop = D.sub.t;
D.y.c4 = D.y.subTop;                 // 0.26 → 0.30
D.y.interBot = D.y.subTop + 0.04;
D.y.interTop = D.y.interBot + D.inter.t;
D.y.dieBot = D.y.interTop + 0.02;
D.y.dieTop = D.y.dieBot + D.die.t;
const hbmX = D.die.w / 2 + 0.14 + D.hbm.w / 2;
const hbmZ = [-(D.hbm.d + D.hbm.gap), 0, D.hbm.d + D.hbm.gap];

/* ───────────────────────── Textures ───────────────────────── */

async function paintDie() {
  const PX = 400, W = Math.round(D.die.w * PX), H = Math.round(D.die.d * PX);
  const r = rng(7);
  const P = new Painter(W, H, { c: '#8e96a6', r: 0.2, m: 0.88, h: 0.5 });
  const m = Math.round(W * 0.035);

  // I/O ring and bond pads
  P.rect(0, 0, W, m, { c: '#747c8c', r: 0.32, h: 0.46 }); P.rect(0, H - m, W, m, { c: '#747c8c', r: 0.32, h: 0.46 });
  P.rect(0, 0, m, H, { c: '#747c8c', r: 0.32, h: 0.46 }); P.rect(W - m, 0, m, H, { c: '#747c8c', r: 0.32, h: 0.46 });
  const pad = { c: '#cfa75a', r: 0.28, m: 1, h: 0.7 };
  for (let x = m * 0.6; x < W - m * 0.6; x += 21) { P.rect(x, m * 0.25, 11, m * 0.5, pad); P.rect(x, H - m * 0.75, 11, m * 0.5, pad); }
  for (let y = m * 1.3; y < H - m * 1.3; y += 21) { P.rect(m * 0.25, y, m * 0.5, 11, pad); P.rect(W - m * 0.75, y, m * 0.5, 11, pad); }
  // Seal ring
  P.paint({ c: '#a9b0bd', r: 0.14, h: 0.62 }, (c) => { c.lineWidth = 4; c.strokeRect(m + 6, m + 6, W - 2 * m - 12, H - 2 * m - 12); });

  const x0 = m + 22, x1 = W - m - 22, y0 = m + 22, y1 = H - m - 22;
  const bandH = (y1 - y0) * 0.15, bandY = (y0 + y1) / 2 - bandH / 2;

  // L2 cache band: SRAM macros, a fine regular lattice that glints at grazing angles
  const phyW = (x1 - x0) * 0.11;
  P.rect(x0, bandY, x1 - x0, bandH, { c: '#687286', r: 0.16, h: 0.52 });
  const macros = 8, mw = (x1 - x0 - 2 * phyW - 20) / macros;
  for (let i = 0; i < macros; i++) {
    await maybeYield();
    const mx = x0 + phyW + 10 + i * mw + 3, mwid = mw - 6;
    for (const half of [0, 1]) {
      const my = bandY + 8 + half * (bandH / 2), mh = bandH / 2 - 16;
      P.rect(mx, my, mwid, mh, { c: '#5f6a80', r: 0.12, h: 0.55 });
      for (let yy = my + 2; yy < my + mh - 3; yy += 5) {
        const shade = 88 + ((yy / 5) % 2) * 10;
        P.rect(mx + 2, yy, mwid - 4, 2.4, { c: `rgb(${shade},${shade + 8},${shade + 24})`, h: 0.58, r: 0.1 });
      }
      P.rect(mx + mwid / 2 - 3, my, 6, mh, { c: '#7a8498', h: 0.5, r: 0.2 });
    }
  }
  // PHY blocks at either end of the band
  for (const px of [x0, x1 - phyW]) {
    P.rect(px, bandY, phyW, bandH, { c: '#57607a', r: 0.3, h: 0.54 });
    for (let xx = px + 6; xx < px + phyW - 6; xx += 7) P.rect(xx, bandY + 6, 3, bandH - 12, { c: '#9aa3b4', h: 0.62, r: 0.16 });
  }

  // Compute clusters (two halves), each block subdivided into tensor tiles and register files
  const cols = 6, rows = 4, street = 12;
  const tints = ['#5c6680', '#58647e', '#606d87', '#5a6883', '#636a85'];
  for (const [ya, yb] of [[y0, bandY - street], [bandY + bandH + street, y1]]) {
    const bw = (x1 - x0 - (cols - 1) * street) / cols, bh = (yb - ya - (rows - 1) * street) / rows;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      await maybeYield();
      const bx = x0 + cx * (bw + street), by = ya + cy * (bh + street);
      const glow = 0.28 + r() * 0.55;
      P.rect(bx, by, bw, bh, { c: tints[(r() * tints.length) | 0], r: 0.24 + r() * 0.08, h: 0.56, e: glow * 0.35 });
      // four tensor tiles
      const tw = (bw - 18) / 2, th = (bh - 30) / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const tx = bx + 6 + i * (tw + 6), ty = by + 6 + j * (th + 18);
        P.rect(tx, ty, tw, th, { c: '#4b556d', r: 0.2, h: 0.6, e: glow });
        for (let k = 0; k < 7; k++) {
          const lx = tx + 3 + r() * (tw - 16), ly = ty + 3 + r() * (th - 12);
          P.rect(lx, ly, 4 + r() * 12, 2 + r() * 6, { c: r() < 0.5 ? '#6d7892' : '#434b61', h: 0.56 + r() * 0.1 });
        }
        for (let yy = ty + 4; yy < ty + th - 3; yy += 4) P.rect(tx + 3, yy, tw * 0.28, 1.6, { c: '#76819b', h: 0.63 });
      }
      // register file strip between tile rows
      P.rect(bx + 6, by + 6 + th + 4, bw - 12, 10, { c: '#7d879c', r: 0.12, h: 0.6, e: glow * 0.5 });
    }
  }
  // Global interconnect running along the streets
  for (let i = 0; i < 60; i++) {
    const y = y0 + r() * (y1 - y0);
    P.rect(x0, y, x1 - x0, 1.2, { c: '#a7afbd', h: 0.53, r: 0.14, a: 0.35 });
  }
  P.smudge(r, 10, 0.12);
  await P.grain(r, 0.03);
  return P.build(2.4, 0.6, true);
}

async function paintInterposer() {
  const PX = 180, W = Math.round(D.inter.w * PX), H = Math.round(D.inter.d * PX);
  const r = rng(11);
  const P = new Painter(W, H, { c: '#7f8898', r: 0.22, m: 0.9, h: 0.5 });
  const toPx = (x, z) => [(x / D.inter.w + 0.5) * W, (z / D.inter.d + 0.5) * H];
  // Redistribution wiring bridging the die and each HBM site
  for (const s of [-1, 1]) for (const z of hbmZ) {
    const [ax] = toPx(s * (D.die.w / 2 - 0.1), 0), [bx] = toPx(s * (hbmX - D.hbm.w / 2 + 0.1), 0);
    const [, zy] = toPx(0, z);
    const hh = D.hbm.d * PX * 0.8;
    for (let k = 0; k < hh; k += 3.2) P.rect(Math.min(ax, bx), zy - hh / 2 + k, Math.abs(bx - ax), 1.3, { c: '#b9965a', m: 1, r: 0.3, h: 0.56, a: 0.7 });
  }
  // Microbump landing pads under the die and memory
  const pad = { c: '#caa257', m: 1, r: 0.3, h: 0.66 };
  for (const [cx, cz, w, d] of [[0, 0, D.die.w, D.die.d], ...[-1, 1].flatMap((s) => hbmZ.map((z) => [s * hbmX, z, D.hbm.w, D.hbm.d]))]) {
    for (let x = cx - w / 2 + 0.08; x < cx + w / 2 - 0.05; x += 0.1) for (let z = cz - d / 2 + 0.08; z < cz + d / 2 - 0.05; z += 0.1) {
      const [px, py] = toPx(x, z); P.circle(px, py, 3.2, pad);
    }
  }
  // Through-silicon vias in the margins
  for (let i = 0; i < 900; i++) {
    const [px, py] = [r() * W, r() * H];
    const lx = Math.abs(px / W - 0.5) * D.inter.w, lz = Math.abs(py / H - 0.5) * D.inter.d;
    if (lx < D.inter.w / 2 - 0.2 && lz < D.inter.d / 2 - 0.2) continue;
    P.circle(px, py, 1.8, { c: '#5f6778', h: 0.44 });
  }
  await P.grain(r, 0.03);
  return P.build(2.0, 0.5);
}

function capLayout() {
  const r = rng(23), caps = [];
  const L = 0.15;
  // Along the left/right edges: long axis on X
  for (const s of [-1, 1]) for (const x of [3.72, 3.94]) {
    for (let z = -2.56; z <= 2.56; z += 0.16) if (r() > 0.07) caps.push({ x: s * x, z, rot: 0 });
  }
  // Along the front/back edges: long axis on Z
  for (const s of [-1, 1]) for (const z of [2.86, 3.08, 3.3]) {
    for (let x = -3.98; x <= 3.98; x += 0.16) {
      if (Math.round((x + 3.98) / 0.16) % 9 === 4) continue;
      if (r() > 0.06) caps.push({ x, z: s * z, rot: Math.PI / 2 });
    }
  }
  // Land-side capacitors in the BGA keep-out, underneath
  const land = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 9; j++) land.push({ x: -0.7 + i * 0.2, z: -0.8 + j * 0.2, rot: (i + j) % 2 ? 0 : Math.PI / 2 });
  return { caps, land, L };
}
const CAPS = capLayout();

async function paintSubstrate() {
  const PX = 204.8, W = 2048, H = 2048;
  const r = rng(3);
  const P = new Painter(W, H, { c: '#132019', r: 0.4, m: 0, h: 0.5 });
  const toPx = (x, z) => [(x / D.sub.w + 0.5) * W, (z / D.sub.d + 0.5) * H];

  // Buried power planes, faintly visible through the solder mask
  for (let i = 0; i < 14; i++) {
    const [px, py] = toPx((r() - 0.5) * 9, (r() - 0.5) * 9);
    P.rect(px, py, 100 + r() * 400, 60 + r() * 300, { c: '#16261e', h: 0.515, a: 0.9 });
  }
  // Signal traces fanning out from the interposer footprint: Manhattan runs with 45° jogs
  const trace = { c: '#1e3a2b', h: 0.57, r: 0.34 };
  for (let i = 0; i < 700; i++) {
    if ((i & 31) === 0) await maybeYield();
    const side = (r() * 4) | 0;
    let x, z;
    if (side < 2) { x = (side ? 1 : -1) * D.inter.w / 2; z = (r() - 0.5) * D.inter.d; }
    else { z = (side === 3 ? 1 : -1) * D.inter.d / 2; x = (r() - 0.5) * D.inter.w; }
    const pts = [toPx(x, z)];
    const out = side < 2 ? [Math.sign(x), 0] : [0, Math.sign(z)];
    let len = 0.2 + r() * 0.6;
    x += out[0] * len; z += out[1] * len; pts.push(toPx(x, z));
    const jog = (r() - 0.5) * 1.2;
    if (side < 2) { x += out[0] * Math.abs(jog); z += jog; } else { z += out[1] * Math.abs(jog); x += jog; }
    pts.push(toPx(x, z));
    len = 0.3 + r() * 1.6;
    x += out[0] * len; z += out[1] * len; pts.push(toPx(x, z));
    x = Math.max(-4.9, Math.min(4.9, x)); z = Math.max(-4.9, Math.min(4.9, z));
    P.poly(pts, 2.6, trace);
    const [ex, ey] = pts[pts.length - 1];
    P.circle(ex, ey, 6, { c: '#284a37', h: 0.6 }); P.circle(ex, ey, 2.4, { c: '#0c1510', h: 0.42 });
  }
  // Stiffener adhesive band (exposed only in the exploded view)
  P.paint({ c: '#2a2b28', r: 0.7, h: 0.53 }, (c) => {
    const [ax, ay] = toPx(-D.stiff.ow / 2, -D.stiff.od / 2), [bx, by] = toPx(D.stiff.ow / 2, D.stiff.od / 2);
    const [ix, iy] = toPx(-D.stiff.iw / 2, -D.stiff.id / 2), [jx, jy] = toPx(D.stiff.iw / 2, D.stiff.id / 2);
    c.beginPath(); c.rect(ax, ay, bx - ax, by - ay); c.rect(jx, iy, ix - jx, jy - iy); c.fill('evenodd');
  });
  // C4 landing pads under the interposer
  for (let x = -D.inter.w / 2 + 0.12; x < D.inter.w / 2 - 0.08; x += 0.15) for (let z = -D.inter.d / 2 + 0.12; z < D.inter.d / 2 - 0.08; z += 0.15) {
    const [px, py] = toPx(x, z); P.circle(px, py, 7, { c: '#c9a05a', m: 1, r: 0.32, h: 0.62 });
  }
  // Capacitor lands
  const land = { c: '#d2a95a', m: 1, r: 0.26, h: 0.6 };
  for (const c of CAPS.caps) {
    await maybeYield();
    const along = c.rot === 0 ? [1, 0] : [0, 1];
    for (const s of [-1, 1]) {
      const [px, py] = toPx(c.x + along[0] * s * 0.058, c.z + along[1] * s * 0.058);
      const w = (c.rot === 0 ? 0.045 : 0.085) * PX, h = (c.rot === 0 ? 0.085 : 0.045) * PX;
      P.rect(px - w / 2, py - h / 2, w, h, land);
    }
  }
  // Silkscreen and fiducials on the exposed rim
  const silk = { c: '#d9d8cc', r: 0.62, h: 0.56 };
  const [fx, fy] = toPx(0, D.sub.d / 2 - 0.1);
  P.text('R1-A0  ·  65×65  ·  LOT 2639-0417  ·  PB-FREE', fx, fy, '600 20px "IBM Plex Mono", monospace', silk, 'center', 3);
  const [bxx, byy] = toPx(0, -D.sub.d / 2 + 0.1);
  P.text('SUBSTRATE 14-2-14  ·  ABF  ·  REV C', bxx, byy, '600 18px "IBM Plex Mono", monospace', silk, 'center', 3);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const [px, py] = toPx(sx * 4.9, sz * 4.9);
    P.circle(px, py, 11, { c: '#d7ad5c', m: 1, r: 0.2, h: 0.6 }); P.ring(px, py, 17, 3, { c: '#0c140f', h: 0.46 });
  }
  const [p1x, p1y] = toPx(-4.9, 4.72);
  P.paint(silk, (c) => { c.beginPath(); c.moveTo(p1x - 14, p1y - 10); c.lineTo(p1x + 14, p1y - 10); c.lineTo(p1x - 14, p1y + 16); c.fill(); });
  // 2D matrix code
  const [qx, qy] = toPx(4.6, 4.83);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (i === 0 || j === 11 || (i === 11 && j % 2) || (j === 0 && i % 2) || r() < 0.45) P.rect(qx + i * 2.6 - 16, qy + j * 2.6 - 16, 2.6, 2.6, silk);
  P.smudge(r, 8, 0.1);
  await P.grain(r, 0.04);
  return P.build(3.0, 0.8);
}

async function paintSubstrateEdge() {
  const W = 64, H = 256;
  const P = new Painter(W, H, { c: '#233026', r: 0.55, m: 0, h: 0.5 });
  const layers = [[0, 8, '#15221a'], [8, 3, '#b87a4b'], [11, 9, '#2d2b21'], [20, 3, '#b87a4b'], [23, 9, '#2d2b21'], [32, 3, '#b87a4b'], [35, 9, '#2d2b21'], [44, 4, '#b87a4b'],
    [48, 160, '#6e6246'], [208, 4, '#b87a4b'], [212, 9, '#2d2b21'], [221, 3, '#b87a4b'], [224, 9, '#2d2b21'], [233, 3, '#b87a4b'], [236, 12, '#2d2b21'], [248, 8, '#15221a']];
  for (const [y, h, c] of layers) {
    const metal = c === '#b87a4b';
    P.rect(0, y, W, h, { c, m: metal ? 1 : 0, r: metal ? 0.35 : 0.6, h: metal ? 0.58 : 0.5 });
  }
  // Glass-weave texture in the core
  for (let y = 52; y < 204; y += 6) for (let x = (y / 6) % 2 ? 0 : 4; x < W; x += 8) P.rect(x, y, 5, 3, { c: '#7c6f51', h: 0.54 });
  const t = await P.build(1.5, 0.4);
  for (const k of ['map', 'orm', 'normal']) { t[k].wrapS = THREE.RepeatWrapping; t[k].repeat.set(40, 1); }
  return t;
}

async function paintStiffener() {
  const W = 1536, H = 1536, S = D.stiff.ow;
  const r = rng(5);
  const P = new Painter(W, H, { c: '#bdbab2', r: 0.3, m: 1, h: 0.5 });
  // Brushing: long, faint streaks in roughness and height
  for (let i = 0; i < 2600; i++) {
    if ((i & 127) === 0) await maybeYield();
    const y = r() * H, v = r();
    P.rect(0, y, W, 0.6 + r() * 1.4, { r: 0.22 + v * 0.2, h: 0.47 + v * 0.06, a: 0.35 });
  }
  const toPx = (x, z) => [(x / S + 0.5) * W, (z / S + 0.5) * H];
  const etch = { c: '#6e6a63', r: 0.66, h: 0.44 };
  // Front band (toward +z) — laser marking
  const [tx, ty] = toPx(-D.stiff.ow / 2 + 0.5, 4.08);
  P.text('R1', tx, ty, '800 72px Archivo, sans-serif', etch, 'left', 4);
  const [sx, sy] = toPx(-D.stiff.ow / 2 + 0.5, 4.52);
  P.text('ACCELERATOR PACKAGE  ·  3NM CLASS  ·  1000 W  ·  WW39’26  ·  ES', sx, sy, '500 26px "IBM Plex Mono", monospace', etch, 'left', 3);
  // Data matrix
  const [qx, qy] = toPx(3.7, 3.95);
  const cell = 7.5;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    if (i === 0 || j === 15 || (i === 15 && j % 2 === 0) || (j === 0 && i % 2 === 0) || r() < 0.46) P.rect(qx + i * cell, qy + j * cell, cell, cell, etch);
  }
  // Back band: handling note
  const [bx, by] = toPx(0, -4.15);
  P.text('DO NOT PRESS ON DIE  ·  ESD SENSITIVE', bx, by, '500 24px "IBM Plex Mono", monospace', etch, 'center', 5);
  // Pin-1 triangle, front-left corner
  const [px, py] = toPx(-4.3, 4.3);
  P.paint(etch, (c) => { c.beginPath(); c.moveTo(px - 26, py + 26); c.lineTo(px + 22, py + 26); c.lineTo(px - 26, py - 22); c.fill(); });
  P.smudge(r, 14, 0.14);
  await P.grain(r, 0.03);
  const t = await P.build(1.6, 0.5);
  for (const k of ['map', 'orm', 'normal']) { t[k].repeat.set(1 / S, 1 / S); t[k].offset.set(0.5, 0.5); }
  return t;
}

async function paintHBMTop() {
  const W = 390, H = 465;
  const r = rng(17);
  const P = new Painter(W, H, { c: '#17191e', r: 0.12, m: 0.55, h: 0.5 });
  const etch = { c: '#3c3f47', r: 0.5, h: 0.46 };
  P.text('HBM', 34, 60, '700 44px Archivo, sans-serif', etch, 'left', 3);
  P.text('24 GB · 8-HI', 34, 104, '500 22px "IBM Plex Mono", monospace', etch, 'left', 1);
  P.text('9.2 GT/s', 34, 134, '500 22px "IBM Plex Mono", monospace', etch, 'left', 1);
  P.circle(W - 40, H - 40, 12, etch);
  P.smudge(r, 5, 0.12);
  await P.grain(r, 0.03);
  return P.build(1.2, 0.4);
}

/* ───────────────────────── Studio environment ─────────────────────────
   A small scene of emissive "light formers", pre-filtered into an environment map.
   This is what gives the metals their soft-box reflections. */

const pmrem = new THREE.PMREMGenerator(renderer);

function buildEnvironment(kind) {
  const s = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(kind === 'hall' ? '#0b1318' : '#121212') }, bottom: { value: new THREE.Color('#010101') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.2, 0.9, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  }));
  s.add(shell);
  const g = new THREE.PlaneGeometry(1, 1);
  const panel = (hex, k, pos, scale, rotY = 0) => {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.scale.set(...scale); m.lookAt(0, 0, 0); m.rotateZ(rotY);
    s.add(m); return m;
  };
  if (kind === 'hall') {
    // Rows of cold LED strips like a data-hall aisle, plus a teal status wash
    for (let i = -3; i <= 3; i++) panel('#cfe6ff', 5, [i * 3.2, 12, 0], [0.5, 26, 1]);
    panel('#39d0ff', 3.5, [-14, 3, 2], [0.8, 10, 1]);
    panel('#39d0ff', 3.5, [14, 3, -2], [0.8, 10, 1]);
    panel('#9ff3ff', 1.8, [0, 6, -16], [18, 1.2, 1]);
    panel('#ff9a5c', 1.4, [0, 1.5, 16], [10, 0.4, 1]);
  } else {
    // Product setup: overhead soft box, a broken ring of soft boxes at ~35° elevation so
    // flat metal catches a highlight from any orbit angle, two tall strips, one red kicker.
    panel('#ffffff', 2.6, [0, 15, 0], [12, 8, 1]);
    const ring = [[0, 3.4, 11, '#ffffff'], [70, 1.6, 7, '#fff3e6'], [140, 2.6, 9, '#eef3ff'], [215, 1.2, 6, '#ffffff'], [285, 2.2, 8, '#fff6ee']];
    for (const [deg, k, wdt, hex] of ring) {
      const a = THREE.MathUtils.degToRad(deg);
      panel(hex, k, [Math.sin(a) * 14, 9, Math.cos(a) * 14], [wdt, 4.5, 1]);
    }
    panel('#fff4ea', 5, [-13, 4, 6], [1.4, 10, 1]);
    panel('#eef4ff', 4, [13, 5, 4], [1.1, 10, 1]);
    panel('#ffa066', 2.6, [-7, 1.6, -14], [8, 0.7, 1]);
  }
  const tex = pmrem.fromScene(s, 0.035).texture;
  s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}

/* ───────────────────────── Model ───────────────────────── */

const chip = new THREE.Group();
scene.add(chip);
const parts = {}; // name → { obj, base: y, off: exploded y offset, delay }
function register(name, obj, off, delay) { parts[name] = { obj, base: obj.position.y, off, delay }; }

function shadowed(o, cast = true, recv = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; }

let partCount = 0; // instances + meshes, reported on the loader
const GEO = {};
let MAT = {};

async function buildModel() {
  await stage('Generating die texture', 8);
  const dieT = await paintDie();
  await stage('Generating interposer', 26);
  const intT = await paintInterposer();
  await stage('Generating substrate', 40);
  const subT = await paintSubstrate();
  const edgeT = await paintSubstrateEdge();
  await stage('Generating stiffener', 56);
  const stT = await paintStiffener();
  const hbmT = await paintHBMTop();
  await stage('Preparing lighting', 66);

  const ENV = { studio: buildEnvironment('studio'), hall: buildEnvironment('hall') };
  pmrem.dispose(); // the environment maps are kept; the generator's working targets are not
  scene.environment = ENV.studio;

  /* Materials */
  MAT = {
    dieTop: new THREE.MeshPhysicalMaterial({
      map: dieT.map, roughnessMap: dieT.orm, metalnessMap: dieT.orm, normalMap: dieT.normal, normalScale: new THREE.Vector2(0.55, 0.55),
      emissiveMap: dieT.emissive, emissive: new THREE.Color('#ff5a1f'), emissiveIntensity: 0.0,
      roughness: 1, metalness: 1,
      iridescence: 0.55, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 620],
      clearcoat: 0.55, clearcoatRoughness: 0.06,
    }),
    dieSide: new THREE.MeshPhysicalMaterial({ color: '#4a505b', metalness: 0.75, roughness: 0.34, iridescence: 0.3, iridescenceThicknessRange: [200, 500] }),
    interTop: new THREE.MeshPhysicalMaterial({ map: intT.map, roughnessMap: intT.orm, metalnessMap: intT.orm, normalMap: intT.normal, roughness: 1, metalness: 1, iridescence: 0.35, iridescenceThicknessRange: [240, 520] }),
    interSide: new THREE.MeshStandardMaterial({ color: '#5e6674', metalness: 0.8, roughness: 0.3 }),
    subTop: new THREE.MeshPhysicalMaterial({ map: subT.map, roughnessMap: subT.orm, metalnessMap: subT.orm, normalMap: subT.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.25 }),
    subSide: new THREE.MeshStandardMaterial({ map: edgeT.map, roughnessMap: edgeT.orm, metalnessMap: edgeT.orm, normalMap: edgeT.normal, roughness: 1, metalness: 1 }),
    subBottom: new THREE.MeshStandardMaterial({ color: '#12201a', roughness: 0.45 }),
    stiff: new THREE.MeshPhysicalMaterial({ map: stT.map, roughnessMap: stT.orm, metalnessMap: stT.orm, normalMap: stT.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, metalness: 1, anisotropy: 0.65, anisotropyRotation: 0 }),
    hbmLayer: new THREE.MeshPhysicalMaterial({ color: '#50565f', metalness: 0.8, roughness: 0.28, iridescence: 0.45, iridescenceThicknessRange: [220, 560] }),
    hbmBond: new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 0.5, metalness: 0 }),
    hbmTop: new THREE.MeshPhysicalMaterial({ map: hbmT.map, roughnessMap: hbmT.orm, metalnessMap: hbmT.orm, normalMap: hbmT.normal, roughness: 1, metalness: 1, clearcoat: 0.8, clearcoatRoughness: 0.04, emissive: new THREE.Color('#ff5a1f'), emissiveIntensity: 0 }),
    underfill: new THREE.MeshPhysicalMaterial({ color: '#15100c', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    capBody: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.62, metalness: 0, sheen: 0.3, sheenColor: new THREE.Color('#a08060'), sheenRoughness: 0.6 }),
    capEnd: new THREE.MeshStandardMaterial({ color: '#d4d3cc', roughness: 0.3, metalness: 1 }),
    solder: new THREE.MeshStandardMaterial({ color: '#d7d9dc', roughness: 0.22, metalness: 1 }),
    copper: new THREE.MeshStandardMaterial({ color: '#d98a57', roughness: 0.3, metalness: 1 }),
  };

  // Animated per-tile activity flicker on the die's emission (visible in Thermal)
  MAT.dieTop.userData.uTime = { value: 0 };
  MAT.dieTop.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = MAT.dieTop.userData.uTime;
    sh.fragmentShader = 'uniform float uTime;\nfloat hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec2 cell = floor(vEmissiveMapUv * vec2(6.0, 9.0));
        float ph = hash12(cell) * 6.2831;
        float act = 0.55 + 0.45 * sin(uTime * (1.2 + hash12(cell + 7.0) * 2.4) + ph);
        totalEmissiveRadiance *= mix(0.35, 1.25, act);
      `);
  };

  const cells = DETAIL.cells(), brushed = DETAIL.brushed(), peel = DETAIL.peel();
  addDetail(MAT.dieTop, cells, [12, 15.5], 0.32, 'die');
  addDetail(MAT.interTop, cells, [22, 16.5], 0.22, 'inter');
  addDetail(MAT.stiff, brushed, [3, 11], 0.3, 'stiff');
  addDetail(MAT.subTop, peel, [44, 44], 0.35, 'sub');
  addDetail(MAT.hbmTop, peel, [5, 6], 0.18, 'hbm');

  await stage('Building geometry', 76);

  /* Substrate */
  const sub = new THREE.Mesh(slab(D.sub.w, D.sub.t, D.sub.d, 0.02), [MAT.subSide, MAT.subSide, MAT.subTop, MAT.subBottom, MAT.subSide, MAT.subSide]);
  sub.position.y = D.sub.t / 2;
  const subG = new THREE.Group(); subG.add(sub); chip.add(subG);
  shadowed(subG);
  register('substrate', subG, 0, 0);

  /* Capacitors (top side, on the substrate group) */
  const capBodyGeo = new RoundedBoxGeometry(0.086, 0.07, 0.074, 2, 0.012);
  const capEndGeo = new RoundedBoxGeometry(0.034, 0.075, 0.078, 2, 0.012);
  function capMeshes(list, y, parent) {
    const body = new THREE.InstancedMesh(capBodyGeo, MAT.capBody, list.length);
    const ends = new THREE.InstancedMesh(capEndGeo, MAT.capEnd, list.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const r = rng(41);
    list.forEach((c, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
      p.set(c.x, y, c.z); m.compose(p, q, sc); body.setMatrixAt(i, m);
      col.setHSL(0.075 + r() * 0.02, 0.32 + r() * 0.1, 0.24 + r() * 0.06); body.setColorAt(i, col);
      for (const s of [-1, 1]) {
        const dx = Math.cos(c.rot) * s * 0.058, dz = -Math.sin(c.rot) * s * 0.058;
        p.set(c.x + dx, y, c.z + dz); m.compose(p, q, sc); ends.setMatrixAt(i * 2 + (s > 0), m);
      }
    });
    body.instanceMatrix.needsUpdate = true; ends.instanceMatrix.needsUpdate = true;
    parent.add(shadowed(body), shadowed(ends));
    partCount += list.length * 3;
  }
  capMeshes(CAPS.caps, D.y.subTop + 0.037, subG);
  capMeshes(CAPS.land, -0.038, subG);

  /* Stiffener ring */
  const rr = (w, h, rad) => {
    const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
    s.moveTo(x + rad, y); s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad);
    s.lineTo(x + w, y + h - rad); s.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    s.lineTo(x + rad, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rad);
    s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y); return s;
  };
  const ringShape = rr(D.stiff.ow - 0.03, D.stiff.od - 0.03, 0.34);
  ringShape.holes.push(rr(D.stiff.iw + 0.03, D.stiff.id + 0.03, 0.28));
  const bev = 0.015;
  const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: D.stiff.t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 18 });
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, MAT.stiff);
  GEO.ring = ringGeo;
  ring.position.y = D.y.subTop + bev;
  const stiffG = new THREE.Group(); stiffG.add(shadowed(ring)); chip.add(stiffG);
  register('stiffener', stiffG, 0.62, 0.04);

  /* BGA balls */
  const ballGeo = new THREE.SphereGeometry(D.bga.r, 14, 10);
  const balls = [];
  const half = (D.bga.n - 1) / 2;
  for (let i = 0; i < D.bga.n; i++) for (let j = 0; j < D.bga.n; j++) {
    if (Math.abs(i - half) < D.bga.hole / 2 && Math.abs(j - half) < D.bga.hole / 2) continue;
    balls.push([(i - half) * D.bga.pitch, (j - half) * D.bga.pitch]);
  }
  const bga = new THREE.InstancedMesh(ballGeo, MAT.solder, balls.length);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 0.82, 1), p = new THREE.Vector3();
    balls.forEach(([x, z], i) => { p.set(x, -0.042, z); m.compose(p, q, sc); bga.setMatrixAt(i, m); }); }
  const bgaG = new THREE.Group(); bgaG.add(shadowed(bga)); chip.add(bgaG);
  register('bga', bgaG, -0.75, 0);
  partCount += balls.length;

  /* Bump arrays */
  function bumpField(fields, pitch, radius, height, y, mat) {
    const pts = [];
    for (const [cx, cz, w, d] of fields) for (let x = cx - w / 2 + 0.08; x < cx + w / 2 - 0.05; x += pitch) for (let z = cz - d / 2 + 0.08; z < cz + d / 2 - 0.05; z += pitch) pts.push([x, z]);
    const g = new THREE.CylinderGeometry(radius, radius, height, 10, 1);
    const im = new THREE.InstancedMesh(g, mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m.makeTranslation(x, y + height / 2, z); im.setMatrixAt(i, m); });
    partCount += pts.length;
    return shadowed(im);
  }
  const c4G = new THREE.Group();
  c4G.add(bumpField([[0, 0, D.inter.w, D.inter.d]], 0.15, 0.034, 0.04, D.y.c4, MAT.solder));
  chip.add(c4G); register('c4', c4G, 0.5, 0.08);

  const ubG = new THREE.Group();
  const hbmSites = [-1, 1].flatMap((s) => hbmZ.map((z) => [s * hbmX, z, D.hbm.w, D.hbm.d]));
  ubG.add(bumpField([[0, 0, D.die.w, D.die.d], ...hbmSites], 0.1, 0.022, 0.02, D.y.interTop, MAT.copper));
  chip.add(ubG); register('ubump', ubG, 1.4, 0.2);

  /* Interposer */
  const inter = new THREE.Mesh(slab(D.inter.w, D.inter.t, D.inter.d, 0.008), [MAT.interSide, MAT.interSide, MAT.interTop, MAT.interSide, MAT.interSide, MAT.interSide]);
  inter.position.y = D.y.interBot + D.inter.t / 2;
  const interG = new THREE.Group(); interG.add(shadowed(inter)); chip.add(interG);
  register('interposer', interG, 0.95, 0.14);

  /* Underfill fillets */
  const ufG = new THREE.Group();
  const ufDie = new THREE.Mesh(new RoundedBoxGeometry(D.die.w + 0.1, 0.05, D.die.d + 0.1, 3, 0.022), MAT.underfill);
  ufDie.position.y = D.y.interTop + 0.022;
  ufG.add(ufDie);
  for (const [x, z] of hbmSites.map((h) => [h[0], h[1]])) {
    const f = new THREE.Mesh(new RoundedBoxGeometry(D.hbm.w + 0.08, 0.045, D.hbm.d + 0.08, 3, 0.02), MAT.underfill);
    f.position.set(x, D.y.interTop + 0.02, z); ufG.add(f);
  }
  chip.add(shadowed(ufG)); register('underfill', ufG, 1.55, 0.26);

  /* Compute die */
  const die = new THREE.Mesh(slab(D.die.w, D.die.t, D.die.d, 0.01), [MAT.dieSide, MAT.dieSide, MAT.dieTop, MAT.dieSide, MAT.dieSide, MAT.dieSide]);
  die.position.y = D.y.dieBot + D.die.t / 2;
  const dieG = new THREE.Group(); dieG.add(shadowed(die)); chip.add(dieG);
  register('die', dieG, 1.85, 0.32);

  /* HBM stacks: base logic die + 8 DRAM dies with bond layers between them */
  const hbmLayerGeo = slab(D.hbm.w, D.hbm.layer, D.hbm.d, 0.004);
  const hbmBondGeo = new THREE.BoxGeometry(D.hbm.w - 0.04, D.hbm.bond, D.hbm.d - 0.04);
  const hbmBaseGeo = slab(D.hbm.w, D.hbm.base, D.hbm.d, 0.006);
  const topMats = [MAT.hbmLayer, MAT.hbmLayer, MAT.hbmTop, MAT.hbmLayer, MAT.hbmLayer, MAT.hbmLayer];
  hbmSites.forEach(([x, z], si) => {
    const baseG = new THREE.Group();
    const base = new THREE.Mesh(hbmBaseGeo, MAT.dieSide);
    base.position.set(x, D.y.dieBot + D.hbm.base / 2, z); baseG.add(shadowed(base));
    chip.add(baseG); register('hbm' + si + '_base', baseG, 1.85, 0.34 + si * 0.02);
    let y = D.y.dieBot + D.hbm.base;
    for (let k = 0; k < D.hbm.n; k++) {
      const lg = new THREE.Group();
      const bond = new THREE.Mesh(hbmBondGeo, MAT.hbmBond); bond.position.set(x, y + D.hbm.bond / 2, z);
      const layer = new THREE.Mesh(hbmLayerGeo, k === D.hbm.n - 1 ? topMats : MAT.hbmLayer);
      layer.position.set(x, y + D.hbm.bond + D.hbm.layer / 2, z);
      lg.add(shadowed(bond), shadowed(layer));
      y += D.hbm.bond + D.hbm.layer;
      chip.add(lg);
      register('hbm' + si + '_' + k, lg, 1.85 + (k + 1) * 0.085, 0.36 + si * 0.02 + k * 0.012);
      partCount += 2;
    }
    partCount += 1;
  });
  partCount += 5 + hbmSites.length;

  return ENV;
}

/* ───────────────────────── Floor with contact shadow ───────────────────────── */

const CS = { size: 16, res: 512, far: 4.5, blur: 2.6, darkness: 1.6, opacity: 0.92 };
const csRT = new THREE.WebGLRenderTarget(CS.res, CS.res);
const csBlurRT = new THREE.WebGLRenderTarget(CS.res, CS.res);
csRT.texture.generateMipmaps = csBlurRT.texture.generateMipmaps = false;
const csCam = new THREE.OrthographicCamera(-CS.size / 2, CS.size / 2, CS.size / 2, -CS.size / 2, 0, CS.far);
csCam.rotation.x = Math.PI / 2;
const csDepth = new THREE.MeshDepthMaterial();
csDepth.userData.darkness = { value: CS.darkness };
csDepth.onBeforeCompile = (sh) => {
  sh.uniforms.darkness = csDepth.userData.darkness;
  sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace(
    'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
    'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * darkness );');
};
csDepth.depthTest = false; csDepth.depthWrite = false;
const hBlur = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader)); hBlur.material.depthTest = false;
const vBlur = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader)); vBlur.material.depthTest = false;

const floorMat = new THREE.MeshStandardMaterial({ color: '#181615', roughness: 0.7, metalness: 0, envMapIntensity: 0.14 });
floorMat.onBeforeCompile = (sh) => {
  sh.uniforms.uCs = { value: csRT.texture };
  sh.uniforms.uCsSize = { value: CS.size };
  sh.uniforms.uCsOpacity = { value: CS.opacity };
  sh.vertexShader = 'uniform float uCsSize;\nvarying vec2 vCsUv;\n' + sh.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n vCsUv = (modelMatrix * vec4(transformed, 1.0)).xz / uCsSize + 0.5;');
  sh.fragmentShader = 'uniform sampler2D uCs;\nuniform float uCsOpacity;\nvarying vec2 vCsUv;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
    float csIn = step(0.0, vCsUv.x) * step(vCsUv.x, 1.0) * step(0.0, vCsUv.y) * step(vCsUv.y, 1.0);
    float csA = texture2D(uCs, clamp(vCsUv, 0.0, 1.0)).a * csIn;
    outgoingLight *= 1.0 - clamp(csA, 0.0, 1.0) * uCsOpacity;
    #include <opaque_fragment>`);
};
const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

let shadowsDirty = true;
function renderContactShadow() {
  const bg = scene.background, fog = scene.fog;
  scene.background = null; scene.fog = null; floor.visible = false;
  const prevClear = renderer.getClearAlpha(); const cc = renderer.getClearColor(new THREE.Color());
  renderer.setClearColor(0x000000, 0);
  scene.overrideMaterial = csDepth;
  renderer.setRenderTarget(csRT); renderer.clear(); renderer.render(scene, csCam);
  scene.overrideMaterial = null;
  for (const amt of [CS.blur, CS.blur * 0.45]) {
    hBlur.material.uniforms.tDiffuse.value = csRT.texture; hBlur.material.uniforms.h.value = amt / 256;
    renderer.setRenderTarget(csBlurRT); hBlur.render(renderer);
    vBlur.material.uniforms.tDiffuse.value = csBlurRT.texture; vBlur.material.uniforms.v.value = amt / 256;
    renderer.setRenderTarget(csRT); vBlur.render(renderer);
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(cc, prevClear);
  scene.background = bg; scene.fog = fog; floor.visible = true;
}

/* ───────────────────────── Lights ───────────────────────── */

const key = new THREE.SpotLight('#fff1e2', 3.2, 0, 0.4, 0.9, 0);
key.position.set(6.5, 15, 8);
key.target.position.set(0, 0.8, 0);
key.castShadow = true;
key.shadow.mapSize.setScalar(2048);
key.shadow.camera.near = 8; key.shadow.camera.far = 30;
key.shadow.bias = -0.00015; key.shadow.normalBias = 0.012;
key.shadow.radius = 3;
scene.add(key, key.target);

const rim = new THREE.SpotLight('#ffa066', 1.6, 0, 0.2, 0.9, 0);
rim.position.set(-9, 3.6, -10);
rim.target.position.set(0, 3.6, 0);
scene.add(rim, rim.target);

const fillL = new THREE.DirectionalLight('#cfd9ff', 0.25);
fillL.position.set(-6, 4, 8);
scene.add(fillL);

const heat = new THREE.PointLight('#ff4a14', 0, 7, 2);
heat.position.set(0, 2.1, 0);
scene.add(heat);

/* ───────────────────────── Post-processing ───────────────────────── */

let composer, gtao, bloom, finish, bokeh;
function buildComposer() {
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 2, thickness: 1.2, scale: 1.0, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  // Macro depth of field; enabled only while a close-up asks for it
  bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0, maxblur: 0.009 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth * pr, innerHeight * pr) }, uGrain: { value: 0.014 }, uVig: { value: 0.4 }, uCA: { value: 0.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVig, uCA; uniform vec2 uRes; varying vec2 vUv;
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);
        vec2 off = d * r2 * uCA;
        vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
        vec2 dv = d * vec2(uRes.x / uRes.y, 1.0);
        float vig = smoothstep(1.15, 0.25, length(dv));
        col *= mix(1.0, vig, uVig);
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float n = hash(vUv * uRes + fract(uTime * 7.13) * 400.0) - 0.5;
        col += n * uGrain * (1.0 - lum * 0.7);
        col += (hash(vUv * uRes * 1.37) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(finish);
}

/* ───────────────────────── Lighting presets ───────────────────────── */

const PRESETS = {
  studio: { env: 'studio', envI: 1.0, key: 3.2, keyC: '#fff1e2', rim: 1.6, rimC: '#ffa066', fill: 0.25, heat: 0, dieE: 0.0, hbmE: 0, eC: '#ff5a1f', bloom: 0.3, exp: 1.0, bg: '#0a0a0b' },
  hall: { env: 'hall', envI: 1.15, key: 1.9, keyC: '#d6e6ff', rim: 3.4, rimC: '#20c8ff', fill: 0.4, heat: 0, dieE: 0.35, hbmE: 0, eC: '#36c8ff', bloom: 0.45, exp: 1.05, bg: '#06090b' },
  thermal: { env: 'studio', envI: 0.28, key: 0.45, keyC: '#ffd9c2', rim: 4.0, rimC: '#ff5a1f', fill: 0.05, heat: 9, dieE: 5.5, hbmE: 0.06, eC: '#ff4a14', bloom: 0.95, exp: 1.0, bg: '#0c0706' },
};
let ENVMAPS = null;
const lp = { t: 1, from: null, to: PRESETS.studio, swapEnv: false };
let curEnvName = 'studio';
const cur = { envI: 1, key: 3.2, rim: 1.6, fill: 0.25, heat: 0, dieE: 0, hbmE: 0, bloom: 0.32, exp: 1, keyC: new THREE.Color(), rimC: new THREE.Color(), eC: new THREE.Color(), bg: new THREE.Color() };
function snapshot() {
  return { envI: scene.environmentIntensity, key: key.intensity, rim: rim.intensity, fill: fillL.intensity, heat: heat.intensity, dieE: MAT.dieTop.emissiveIntensity, hbmE: MAT.hbmTop.emissiveIntensity,
    bloom: bloom.strength, exp: renderer.toneMappingExposure, keyC: key.color.clone(), rimC: rim.color.clone(), eC: MAT.dieTop.emissive.clone(), bg: scene.background.clone() };
}
function setPreset(name) {
  lp.from = snapshot(); lp.to = PRESETS[name]; lp.t = 0; lp.swapEnv = PRESETS[name].env !== curEnvName;
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === name)));
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function updatePreset(dt) {
  if (lp.t >= 1) return;
  lp.t = Math.min(1, lp.t + dt / (reduceMotion ? 0.01 : 1.1));
  const k = ease(lp.t), a = lp.from, b = lp.to;
  const L = (x, y) => x + (y - x) * k;
  // Environment swap happens through a dip in its intensity so it never pops.
  if (lp.swapEnv && lp.t >= 0.5 && curEnvName !== b.env) { scene.environment = ENVMAPS[b.env]; curEnvName = b.env; }
  scene.environmentIntensity = L(a.envI, b.envI) * (lp.swapEnv ? 1 - Math.sin(Math.PI * lp.t) * 0.85 : 1);
  key.intensity = L(a.key, b.key); rim.intensity = L(a.rim, b.rim); fillL.intensity = L(a.fill, b.fill); heat.intensity = L(a.heat, b.heat);
  MAT.dieTop.emissiveIntensity = L(a.dieE, b.dieE); MAT.hbmTop.emissiveIntensity = L(a.hbmE, b.hbmE);
  bloom.strength = L(a.bloom, b.bloom); renderer.toneMappingExposure = L(a.exp, b.exp);
  key.color.copy(a.keyC).lerp(cur.keyC.set(b.keyC), k); rim.color.copy(a.rimC).lerp(cur.rimC.set(b.rimC), k);
  MAT.dieTop.emissive.copy(a.eC).lerp(cur.eC.set(b.eC), k); MAT.hbmTop.emissive.copy(MAT.dieTop.emissive);
  scene.background.copy(a.bg).lerp(cur.bg.set(b.bg), k); scene.fog.color.copy(scene.background);
}

/* ───────────────────────── Explode ───────────────────────── */

let explodeTarget = 0, explodeT = 0;
function setExploded(on) {
  explodeTarget = on ? 1 : 0;
  $('btn-assembled').setAttribute('aria-pressed', String(!on));
  $('btn-exploded').setAttribute('aria-pressed', String(on));
}
let MAXD = 0;
function updateExplode(dt) {
  const dir = Math.sign(explodeTarget - explodeT);
  if (dir === 0) return;
  shadowsDirty = true;
  const before = ease(explodeT);
  explodeT = THREE.MathUtils.clamp(explodeT + dir * dt / (reduceMotion ? 0.01 : 2.2), 0, 1);
  for (const p of Object.values(parts)) {
    // Stagger: lower parts lead when opening, upper parts lead when closing.
    const local = THREE.MathUtils.clamp(explodeT * (1 + MAXD) - p.delay, 0, 1);
    p.obj.position.y = p.base + p.off * ease(local);
  }
  // Raise the camera with the stack's centre so the framing holds.
  const lift = (ease(explodeT) - before) * 0.9;
  if (mode === 'viewer' && fly.t >= 1 && !tour.active) { controls.target.y += lift; camera.position.y += lift; }
}

/* ───────────────────────── Parts / hotspots ───────────────────────── */

const HOTSPOTS = [
  { id: 'die', part: 'die', title: 'Compute die', at: [0.9, D.y.dieTop, -1.1], view: [0.45, 0.9, 0.75], dist: 8,
    body: 'A single piece of silicon, close to the largest area a lithography scanner can expose in one pass. The outer regions hold the matrix engines; the band across the middle is on-chip cache.',
    specs: () => [`${Math.round(D.die.w * MM * D.die.d * MM)}\u00a0mm²`, '3\u00a0nm class process', 'About 170 billion transistors'] },
  { id: 'hbm', part: 'hbm2_7', title: 'Stacked memory', at: [-hbmX, D.y.dieTop, hbmZ[2]], view: [-0.75, 0.75, 0.7], dist: 6.5,
    body: 'Eight DRAM layers per stack, each thinned to about 30\u00a0µm and connected vertically by through-silicon vias. A logic die at the base of each stack handles the interface.',
    specs: () => ['6 stacks, 8 DRAM layers each', 'About 1.2\u00a0TB/s per stack', '144\u00a0GB in total'] },
  { id: 'interposer', part: 'interposer', title: 'Silicon interposer', at: [0, D.y.interTop, D.inter.d / 2 - 0.05], view: [0.25, 0.4, 1], dist: 6.5,
    body: 'A passive slab of silicon with fine wiring that connects the die to the memory stacks. Choose Exploded to see the bump arrays above and below it.',
    specs: () => [`${Math.round(D.inter.w * MM * D.inter.d * MM).toLocaleString()}\u00a0mm² of silicon`, 'Microbumps at 40–55\u00a0µm pitch'] },
  { id: 'caps', part: 'substrate', title: 'Decoupling capacitors', at: [3.83, D.y.subTop + 0.075, 1.2], view: [1, 0.55, 0.45], dist: 4.8,
    body: 'Ceramic capacitors close to the die supply the short bursts of current it draws when load changes, keeping the core voltage stable.',
    specs: () => [`${CAPS.caps.length} on top, ${CAPS.land.length} underneath`, '0402 case, 1.0 × 0.5\u00a0mm', 'Multilayer ceramic (MLCC)'] },
  { id: 'stiffener', part: 'stiffener', title: 'Stiffener ring', at: [-1.6, D.y.subTop + D.stiff.t, 4.1], view: [0.05, 0.75, 1], dist: 7.5,
    body: 'A plated copper frame bonded to the substrate. It keeps the thin organic laminate flat as the package heats and cools over thousands of power cycles.',
    specs: () => ['Nickel-plated copper, brushed', `${Math.round(D.sub.w * MM)} × ${Math.round(D.sub.d * MM)}\u00a0mm package`, 'Laser-marked lot and date code'] },
  { id: 'bga', part: 'bga', title: 'Ball grid array', at: [3.2, -0.09, 3.2], view: [0.8, -0.42, 0.9], dist: 8,
    body: 'Power and signals reach the board through solder balls on the underside. Most carry power and ground, since the core runs below 1\u00a0V and draws over 1,000\u00a0A.',
    specs: () => [`${(D.bga.n * D.bga.n - D.bga.hole * D.bga.hole).toLocaleString()} solder balls`, '1.0\u00a0mm pitch'] },
];

const hsLayer = $('hotspots');
const anchors = HOTSPOTS.map((h, i) => {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'hotspot';
  btn.innerHTML = `<i></i><span>${h.title}</span>`;
  btn.setAttribute('aria-label', `Inspect ${h.title}`);
  btn.addEventListener('click', () => select(i, true));
  hsLayer.appendChild(btn);
  return { el: btn, obj: null, h };
});

let selected = 0;
function select(i, fly) {
  selected = (i + HOTSPOTS.length) % HOTSPOTS.length;
  const h = HOTSPOTS[selected];
  $('detail-title').textContent = h.title;
  $('detail-count').textContent = `${selected + 1} of ${HOTSPOTS.length}`;
  $('detail-body').textContent = h.body;
  const ul = $('detail-specs'); ul.innerHTML = '';
  for (const s of h.specs()) { const li = document.createElement('li'); li.textContent = s; ul.appendChild(li); }
  anchors.forEach((a, j) => a.el.classList.toggle('active', j === selected));
  if (fly) flyToPart(selected);
}

const fly = { t: 1, dur: 1.6, p0: new THREE.Vector3(), p1: new THREE.Vector3(), t0: new THREE.Vector3(), t1: new THREE.Vector3() };
function flyTo(pos, target, dur = 1.6) {
  fly.p0.copy(camera.position); fly.t0.copy(controls.target);
  fly.p1.copy(pos); fly.t1.copy(target); fly.t = 0; fly.dur = reduceMotion ? 0.01 : dur;
}
function flyToPart(i) {
  const a = anchors[i]; const h = a.h;
  const target = new THREE.Vector3(); a.obj.getWorldPosition(target);
  const dir = new THREE.Vector3(...h.view).normalize();
  setAutoRotate(false);
  flyTo(target.clone().add(dir.multiplyScalar(h.dist * Math.max(1, fitScale * 0.85))), target);
}
function resetView() { setAutoRotate(!reduceMotion); flyTo(HOME.pos, HOME.target.clone().setY(HOME.target.y + ease(explodeTarget) * 0.9), 1.8); }
function updateFly(dt) {
  if (fly.t >= 1) return;
  fly.t = Math.min(1, fly.t + dt / fly.dur);
  const k = ease(fly.t);
  // Arc the camera slightly outward mid-flight so it never cuts through the model.
  const mid = Math.sin(Math.PI * k) * 0.12;
  camera.position.lerpVectors(fly.p0, fly.p1, k);
  camera.position.addScaledVector(camera.position.clone().sub(controls.target).normalize(), mid * camera.position.distanceTo(controls.target));
  controls.target.lerpVectors(fly.t0, fly.t1, k);
}

function setAutoRotate(on) { controls.autoRotate = on; $('btn-rotate').setAttribute('aria-pressed', String(on)); }

/* Hotspot projection: follow parts as they move; fade when facing away. */
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
function updateHotspots() {
  const w = innerWidth, h = innerHeight;
  for (const a of anchors) {
    a.obj.getWorldPosition(_v);
    _n.copy(camera.position).sub(_v).normalize();
    const facing = a.h.id === 'bga' ? _n.y < 0.05 : _n.y > -0.05;
    _c.copy(_v).project(camera);
    const off = _c.z > 1 || Math.abs(_c.x) > 1.05 || Math.abs(_c.y) > 1.05;
    a.el.classList.toggle('hidden', off);
    a.el.classList.toggle('dim', !off && !facing);
    a.el.style.transform = `translate(${((_c.x + 1) / 2) * w}px, ${((1 - _c.y) / 2) * h}px)`;
  }
}

/* ───────────────────────── Quality ───────────────────────── */

let quality = 'high';
// Phones start at full desktop quality and step down this ladder only if frame time demands it:
// first a little resolution, then ambient occlusion, then more resolution.
const LADDER = (() => {
  const m = Math.min(devicePixelRatio, 2), l = [{ pr: m, ao: true, dof: true }];
  if (m > 1.75) l.push({ pr: 1.75, ao: true, dof: true });
  l.push({ pr: Math.min(m, 1.75), ao: true, dof: false });
  if (m > 1.5) l.push({ pr: 1.5, ao: true, dof: false });
  l.push({ pr: Math.min(m, 1.5), ao: false, dof: false }, { pr: Math.min(m, 1.25), ao: false, dof: false }, { pr: 1, ao: false, dof: false });
  return l;
})();
const dyn = { lvl: 0, frames: 0, acc: 0, cool: 3 };
function applyLevel() { const L = LADDER[dyn.lvl]; applyPixelRatio(L.pr); gtao.enabled = L.ao; }
const dofAllowed = () => quality === 'high' || (quality === 'mobile' && LADDER[dyn.lvl].dof);
function applyPixelRatio(pr) {
  if (typeof forceFrames !== 'undefined') forceFrames = 3;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  composer.setSize(vp.w, vp.h);
  finish.uniforms.uRes.value.set(vp.w * pr, vp.h * pr);
}
function setQuality(q, manual) {
  quality = q;
  const pr = q === 'mobile' ? LADDER[dyn.lvl].pr : q === 'high' ? Math.max(Math.min(devicePixelRatio, 2), 1.5) : q === 'balanced' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 1);
  applyPixelRatio(pr);
  gtao.enabled = q === 'high' || (q === 'mobile' && LADDER[dyn.lvl].ao);
  bloom.enabled = q !== 'fast';
  key.shadow.mapSize.setScalar(q === 'fast' ? 1024 : 2048);
  if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  shadowsDirty = true;
  document.querySelectorAll('[data-quality]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.quality === q)));
  if (manual) perf.locked = true;
}
const perf = { frames: 0, acc: 0, locked: false, settle: 0 };
// On phones, resolution tracks frame time continuously (in quarter steps, with a cooldown)
// so scrolling stays smooth without giving up sharpness when the device can afford it.
function dynamicResolution(dt) {
  dyn.cool -= dt; dyn.frames++; dyn.acc += dt;
  if (dyn.frames < 40) return;
  const avg = dyn.acc / dyn.frames; dyn.frames = 0; dyn.acc = 0;
  if (dyn.cool > 0) return;
  if (avg > 1 / 40 && dyn.lvl < LADDER.length - 1) { dyn.lvl++; applyLevel(); dyn.cool = 2.5; }
  else if (avg < 1 / 57 && dyn.lvl > 0) { dyn.lvl--; applyLevel(); dyn.cool = 6; }
}
function autoQuality(dt) {
  if (quality === 'mobile') { dynamicResolution(dt); return; }
  if (perf.locked) return;
  perf.settle += dt; if (perf.settle < 3) return; // let shaders compile and the intro finish
  perf.frames++; perf.acc += dt;
  if (perf.frames < 60) return;
  const avg = perf.acc / perf.frames; perf.frames = 0; perf.acc = 0;
  if (avg > 1 / 32 && quality === 'high') setQuality('balanced');
  else if (avg > 1 / 26 && quality === 'balanced') { setQuality('fast'); perf.locked = true; }
  else perf.locked = true;
}

/* ───────────────────────── UI wiring ───────────────────────── */

$('btn-assembled').addEventListener('click', () => setExploded(false));
$('btn-exploded').addEventListener('click', () => setExploded(true));
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => setPreset(b.dataset.preset)));
document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => setQuality(b.dataset.quality, true)));
$('btn-rotate').addEventListener('click', () => setAutoRotate(!controls.autoRotate));
$('btn-reset').addEventListener('click', resetView);
$('btn-reset-2').addEventListener('click', resetView);
$('btn-prev').addEventListener('click', () => select(selected - 1, true));
$('btn-next').addEventListener('click', () => select(selected + 1, true));
controls.addEventListener('start', () => { fly.t = 1; });
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (tour.active) {
    if (e.key === 'Escape') endTour(false);
    else if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); setTourPaused(!tour.paused); }
    else if (e.key === 'ArrowRight') enterShot(Math.min(tour.i + 1, SHOTS.length - 1), true);
    else if (e.key === 'ArrowLeft') enterShot(Math.max(tour.i - 1, 0), true);
    return;
  }
  if (e.key.toLowerCase() === 'p') { startTour(); return; }
  if (mode !== 'viewer') return;
  const k = e.key.toLowerCase();
  if (k === 'e') setExploded(explodeTarget === 0);
  else if (k === '1') setPreset('studio');
  else if (k === '2') setPreset('hall');
  else if (k === '3') setPreset('thermal');
  else if (k === 'r') setAutoRotate(!controls.autoRotate);
  else if (e.key === 'ArrowRight') select(selected + 1, true);
  else if (e.key === 'ArrowLeft') select(selected - 1, true);
  else if (e.key === 'Escape') resetView();
});

/* The showcase hides the interface, so it frames against the full screen instead:
   subject a touch right of and above centre, clear of the captions. */
const layoutCentre = new THREE.Vector2(innerWidth / 2, innerHeight / 2);

/* Frame the model inside the screen area the interface leaves free: shift the projection
   centre there and pick a home distance that fits the package into it. */
function frameModel() {
  const W = innerWidth, H = innerHeight, R = 6.0;
  let fx = 0, fy = 0, fw = W, fh = H;
  if (W <= 860) {
    const top = $('title-block').getBoundingClientRect().bottom, bot = $('detail').getBoundingClientRect().top;
    fy = top; fh = Math.max(140, bot - top);
  } else {
    fw = $('controls').getBoundingClientRect().left;
  }
  const cx = fx + fw / 2, cy = fy + fh / 2;
  layoutCentre.set(cx, cy);
  const ppu = Math.min(fw * 0.86, fh * 1.45) / (2 * R);
  const dist = (H / ppu) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const atHome = camera.position.distanceTo(HOME.pos) < 0.01;
  fitScale = dist / REF_DIST;
  HOME.pos.copy(HOME_DIR).multiplyScalar(dist).add(new THREE.Vector3(0, HOME.target.y, 0));
  controls.maxDistance = Math.max(42, dist * 1.7);
  if (atHome) camera.position.copy(HOME.pos);
}

function onResize() {
  // Mobile browsers resize the viewport as the address bar slides; keep the canvas as it is
  // for those, since reallocating the render targets mid-scroll causes a visible hitch.
  if (MOBILE && composer && innerWidth === vp.w && Math.abs(innerHeight - vp.h) < vp.h * 0.25) return;
  vp.w = innerWidth; vp.h = innerHeight;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth / innerHeight < 0.8 ? 34 : 28;
  frameModel();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) {
    composer.setSize(innerWidth, innerHeight);
    const pr = renderer.getPixelRatio();
    finish.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr);
  }
}
addEventListener('resize', onResize);

/* ───────────────────────── Showcase ─────────────────────────
   A directed sequence of shots. Each shot orbits a live target (so the camera follows parts
   while they move), from one spherical pose to another. "cut" shots dip through black;
   the others continue from wherever the previous shot left the camera. */

const _off = new THREE.Vector3();
const anchorOf = (id) => anchors.find((a) => a.h.id === id).obj;
const AT = (id, dx = 0, dy = 0, dz = 0) => (out) => anchorOf(id).getWorldPosition(out).add(_off.set(dx, dy, dz));
const MID = (y) => (out) => out.set(0, chip.position.y + y + ease(explodeT) * 0.9, 0);
const dieMM = () => Math.round(D.die.w * MM * D.die.d * MM);

const SHOTS = [
  { eyebrow: 'General arrangement', title: 'R1 accelerator package', sub: '65 × 65\u00a0mm. The kind of hardware frontier AI models are trained on.',
    dur: 6.5, cut: true, target: MID(0.25), from: [-72, 5, 22], to: [-22, 15, 17], state: { x: false, p: 'studio' } },
  { eyebrow: 'Detail', title: 'Stiffener ring', sub: 'A plated copper frame keeps the substrate flat through thermal cycling.',
    dur: 5.5, cut: false, target: AT('stiffener', 0.4, 0, -0.1), to: [8, 30, 6] },
  { dof: 1, eyebrow: 'Detail A', title: 'Compute die', sub: () => `${dieMM()}\u00a0mm² of logic, close to the largest area a scanner can expose.`,
    dur: 6.5, cut: true, target: AT('die', -0.9, 0, 1.1), from: [58, 58, 7.5], to: [112, 36, 5.2] },
  { dof: 1.3, eyebrow: 'Detail D', title: 'Decoupling capacitors', sub: () => `${CAPS.caps.length + CAPS.land.length} ceramic capacitors keep the core voltage stable.`,
    dur: 5, cut: true, target: AT('caps', -2.83, -0.02, -4.27), from: [30, 24, 2.7], to: [-18, 31, 2.3] },
  { eyebrow: 'Section C–C', title: 'Exploded view', sub: () => `${partCount.toLocaleString()} parts, separated by layer.`,
    dur: 8.5, cut: true, target: MID(0.4), from: [24, 18, 21], to: [78, 27, 20], state: { x: false, p: 'hall' }, events: [[0.9, () => setExploded(true)]] },
  { dof: 1, eyebrow: 'Detail B', title: 'Stacked memory', sub: 'Eight DRAM layers per stack, connected by through-silicon vias.',
    dur: 6, cut: true, target: AT('hbm', 0, -0.35, 0), from: [-100, 6, 4.4], to: [-58, 16, 4.0], state: { x: true } },
  { dof: 1, eyebrow: 'Section C–C', title: 'Silicon interposer', sub: 'Microbump arrays join die and memory at about 45\u00a0µm pitch.',
    dur: 5.5, cut: true, target: AT('interposer', 0.6, 0, -0.4), from: [26, 11, 5.4], to: [-8, 17, 4.6], state: { x: true } },
  { dof: 1, eyebrow: 'View E', title: 'Ball grid array', sub: () => `${(D.bga.n * D.bga.n - D.bga.hole * D.bga.hole).toLocaleString()} solder balls carry power and signals to the board.`,
    dur: 5.5, cut: true, target: AT('bga', -1.4, 0, -1.4), from: [150, -26, 6.4], to: [104, -16, 5.8], state: { x: true }, under: true },
  { eyebrow: 'Detail F', title: 'Power and heat', sub: 'About 1,000\u00a0W, almost all of it released as heat.',
    dur: 8.5, cut: true, target: MID(0.3), from: [-34, 34, 16], to: [18, 26, 13], state: { x: true, p: 'thermal' }, events: [[0.4, () => setExploded(false)]] },
  { eyebrow: 'General arrangement', title: 'Accelerator Anatomy', sub: 'Scroll the page to look at each part in detail.',
    dur: 6.5, cut: false, target: (out) => out.copy(HOME.target), home: true, events: [[1.4, () => setPreset('studio')]] },
];

const tour = { active: false, paused: false, i: 0, t: 0, fired: new Set(), sT: new THREE.Vector3(), sSph: [0, 0, 0], capOn: false, fill: 0 };
const tourFill = new THREE.DirectionalLight('#dfe8ff', 0);
tourFill.position.set(2, -10, 4);
scene.add(tourFill);

const tourEls = { root: document.body, fade: $('tour-fade'), cap: $('tour-cap'), eyebrow: $('tc-eyebrow'), title: $('tc-title'), sub: $('tc-sub'), chapter: $('tour-chapter'), track: $('tour-track'), pause: $('tour-pause') };
const segs = SHOTS.map((sh, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tour-seg'; b.style.flexGrow = sh.dur;
  b.setAttribute('aria-label', `Chapter ${i + 1}: ${sh.title}`);
  b.innerHTML = '<i><b></b></i>';
  b.addEventListener('click', () => enterShot(i, true));
  tourEls.track.appendChild(b);
  return b.querySelector('b');
});
{
  const secs = Math.round(SHOTS.reduce((a, s) => a + s.dur, 0));
  document.querySelectorAll('.film-len').forEach((el) => { el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; });
}

const deg = THREE.MathUtils.degToRad;
const val = (v) => (typeof v === 'function' ? v() : v);
function sphOf(pos, target) {
  const d = _off.copy(pos).sub(target); const r = d.length();
  return [THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)), THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y / r, -1, 1))), r];
}
function lerpAngle(a, b, k) { let d = ((b - a + 540) % 360) - 180; return a + d * k; }
const camEase = (k) => 0.45 * k + 0.55 * (0.5 - 0.5 * Math.cos(Math.PI * k));

function setTourPaused(p) { tour.paused = p; tourEls.pause.textContent = p ? 'Play' : 'Pause'; }

function enterShot(i, jump = false) {
  tour.i = i; if (jump) tour.t = 0;
  tour.fired = new Set();
  const sh = SHOTS[i];
  tour.sT.copy(controls.target);
  tour.sSph = sphOf(camera.position, controls.target);
  if (sh.state && (sh.cut || jump)) {
    if (sh.state.x !== undefined && (explodeTarget === 1) !== sh.state.x) setExploded(sh.state.x);
    if (sh.state.p && lp.to !== PRESETS[sh.state.p]) setPreset(sh.state.p);
  }
  tourEls.eyebrow.textContent = val(sh.eyebrow);
  tourEls.title.textContent = val(sh.title);
  tourEls.sub.textContent = val(sh.sub);
  tourEls.cap.classList.remove('show'); tour.capOn = false;
  tourEls.chapter.textContent = `${i + 1} of ${SHOTS.length}`;
  segs.forEach((b, j) => { b.style.width = j < i ? '100%' : '0%'; b.parentElement.parentElement.classList.toggle('now', j === i); });
}

let wasAutoRotate = false, idleTimer = 0;
function markActive() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (tour.active) idleTimer = setTimeout(() => document.body.classList.add('idle'), 2200);
}
addEventListener('pointermove', markActive);

function startTour(src) {
  if (!modelReady || tour.active) return;
  tour.returnFocus = src instanceof HTMLElement ? src : document.activeElement;
  tour.active = true; setTourPaused(false);
  wasAutoRotate = controls.autoRotate; setAutoRotate(false);
  controls.enabled = false; fly.t = 1;
  document.body.classList.add('touring');
  markActive();
  enterShot(0, true);
  tourEls.pause.focus({ preventScroll: true });
}
function endTour(completed) {
  if (!tour.active) return;
  tour.active = false;
  document.body.classList.remove('touring', 'idle');
  tourEls.fade.style.opacity = 0; tourEls.cap.classList.remove('show');
  if (mode === 'viewer') {
    controls.enabled = true;
    if (!completed) {
      if (explodeTarget) setExploded(false);
      if (lp.to !== PRESETS.studio) setPreset('studio');
      resetView();
    } else setAutoRotate(wasAutoRotate);
    select(0, false);
  } else storyNear = -1; // the story re-applies its lighting and assembly for wherever the reader is
  if (tour.returnFocus && tour.returnFocus.focus) tour.returnFocus.focus({ preventScroll: true });
}

const _tg = new THREE.Vector3();
function updateTour(dt, time) {
  if (!tour.active) return;

  if (!tour.paused) tour.t += dt;
  let sh = SHOTS[tour.i];
  if (tour.t >= sh.dur) {
    if (tour.i + 1 >= SHOTS.length) { endTour(true); return; }
    tour.t -= sh.dur; enterShot(tour.i + 1); sh = SHOTS[tour.i];
  }
  for (const [k, [et, fn]] of (sh.events || []).entries()) if (!tour.fired.has(k) && tour.t >= et) { tour.fired.add(k); fn(); }

  const k = THREE.MathUtils.clamp(tour.t / sh.dur, 0, 1);
  const e = reduceMotion ? 1 : camEase(k);
  sh.target(_tg);
  const target = sh.cut ? _tg : _tg.lerp(tour.sT, 1 - e);
  const ds = Math.max(1, fitScale * 0.8);
  const to = sh.home ? sphOf(HOME.pos, HOME.target) : [sh.to[0], sh.to[1], sh.to[2] * ds];
  const from = sh.cut ? [sh.from[0], sh.from[1], sh.from[2] * ds] : tour.sSph;
  let az = lerpAngle(from[0], to[0], e), el = from[1] + (to[1] - from[1]) * e;
  const d = from[2] + (to[2] - from[2]) * e;
  if (!reduceMotion && !sh.home) { az += Math.sin(time * 0.53) * 0.5; el += Math.sin(time * 0.37 + 1.3) * 0.35; } // a breath of handheld drift
  const ca = Math.cos(deg(el));
  camera.position.set(target.x + d * ca * Math.sin(deg(az)), target.y + d * Math.sin(deg(el)), target.z + d * ca * Math.cos(deg(az)));
  controls.target.copy(target);
  camera.lookAt(target);

  // Dip to black around cuts
  let f = 0;
  if (sh.cut) f = Math.max(f, 1 - THREE.MathUtils.clamp(tour.t / 0.5, 0, 1));
  const next = SHOTS[tour.i + 1];
  if (next && next.cut) f = Math.max(f, THREE.MathUtils.clamp((tour.t - (sh.dur - 0.35)) / 0.35, 0, 1));
  tourEls.fade.style.opacity = f.toFixed(3);

  const on = tour.t > 0.6 && tour.t < sh.dur - 0.75;
  if (on !== tour.capOn) { tour.capOn = on; tourEls.cap.classList.toggle('show', on); }
  segs[tour.i].style.width = (k * 100).toFixed(2) + '%';
}

document.querySelectorAll('[data-film]').forEach((b) => b.addEventListener('click', () => startTour(b)));
$('tour-pause').addEventListener('click', () => setTourPaused(!tour.paused));
$('tour-exit').addEventListener('click', () => endTour(false));

/* ───────────────────────── Scroll story ─────────────────────────
   Each section carries a camera pose. The page's scroll position picks the two poses either
   side of the viewport centre and blends them; each pose holds while its section is centred. */

let mode = 'story';
const STORY = [
  { m: 1.45, view: 'General arrangement', scale: '1 : 1', target: MID(0.2), sph: [-30, 18, 27], side: 'right', spin: true, state: { x: false, p: 'studio', field: false } },
  { dof: 1, view: 'Detail A, compute die', scale: '3 : 1', target: AT('die', -0.9, 0, 1.1), sph: [62, 50, 7.2], side: 'right', state: { x: false, p: 'studio', field: false } },
  { dof: 1, view: 'Detail B, HBM stack', scale: '4 : 1', target: AT('hbm', 0, -0.1, -0.2), sph: [-112, 22, 5.6], side: 'left', state: { x: false, p: 'studio', field: false } },
  { m: 1.6, view: 'Section C–C, exploded', scale: '1 : 1', target: MID(0.45), sph: [34, 22, 17], side: 'right', state: { x: true, p: 'hall', field: false } },
  { dof: 1.3, view: 'Detail D, capacitors', scale: '8 : 1', target: AT('caps', -2.83, -0.02, -4.27), sph: [8, 28, 2.7], side: 'left', state: { x: false, p: 'studio', field: false } },
  { dof: 0.8, view: 'View E, underside', scale: '3 : 1', target: AT('bga', -1.4, 0, -1.4), sph: [128, -20, 6.8], side: 'right', state: { x: false, p: 'studio', field: false, under: true } },
  { m: 1.2, view: 'Detail F, thermal', scale: '1.5 : 1', target: MID(0.3), sph: [-24, 30, 16], side: 'left', state: { x: false, p: 'thermal', field: false } },
  { m: 2.3, view: 'Plan view', scale: '1 : 1', target: MID(0.2), sph: [8, 70, 20], side: 'right', state: { x: false, p: 'studio', field: false } },
  { m: 1.5, view: 'Array, 224 packages', scale: '1 : 6', target: MID(0.1), sph: [36, 28, 50], side: 'right', state: { x: false, p: 'hall', field: true } },
  { m: 1.4, view: 'General arrangement', scale: '1 : 1', target: MID(0.25), sph: [39, 24, 27], side: 'centre', spin: true, state: { x: false, p: 'studio', field: false } },
];
const tbView = $('tb-view'), tbScale = $('tb-scale'), tbSheet = $('tb-sheet');
const NAV_OF = ['', 'anatomy', 'anatomy', 'anatomy', 'anatomy', 'anatomy', 'anatomy', 'specs', 'scale', 'explore'];
const storyEls = [...document.querySelectorAll('[data-shot]')];
const navLinks = [...document.querySelectorAll('[data-nav]')];
let revealed = -1;
function markSections() {
  const vc = innerHeight / 2;
  let best = 0, bestD = Infinity;
  storyEls.forEach((el, k) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - vc); if (d < bestD) { bestD = d; best = k; } });
  if (best === revealed) return;
  revealed = best;
  storyEls.forEach((el, k) => el.classList.toggle('active', k === best));
}
addEventListener('scroll', markSections, { passive: true });
markSections();
document.documentElement.classList.add('story-ready');
const storyCentre = new THREE.Vector2(innerWidth / 2, innerHeight / 2);
let storyNear = -1;
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sp = new THREE.Vector3();

function sideCentre(side, out) {
  const W = vp.w, H = vp.h;
  if (W <= 860) return out.set(W * 0.5, H * (side === 'centre' ? 0.38 : 0.42));
  return out.set(W * (side === 'right' ? 0.69 : side === 'left' ? 0.31 : 0.5), H * (side === 'centre' ? 0.33 : 0.5));
}
function applyStoryState(st) {
  if ((explodeTarget === 1) !== st.x) setExploded(st.x);
  if (lp.to !== PRESETS[st.p]) setPreset(st.p);
  fieldTarget = st.field ? 1 : 0;
}
const _c1 = new THREE.Vector2(), _c2 = new THREE.Vector2();
function updateStory(dt, time) {
  const vc = innerHeight / 2;
  const off = storyEls.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 - vc; });
  let i = 0;
  while (i < off.length - 1 && off[i + 1] <= 0) i++;
  const j = Math.min(i + 1, STORY.length - 1);
  const raw = i < off.length - 1 && off[i] <= 0 ? -off[i] / (off[j] - off[i]) : 0;
  const e = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(raw, 0, 1), 0.18, 0.82);
  const near = e < 0.5 ? i : j;
  if (near !== storyNear) {
    storyNear = near; applyStoryState(STORY[near].state);
    tbView.textContent = STORY[near].view;
    tbScale.textContent = STORY[near].scale.replace(/ /g, '\u200a');
    tbSheet.textContent = `${near + 1} of ${STORY.length}`;
    navLinks.forEach((a) => a.classList.toggle('on', a.dataset.nav === NAV_OF[near]));
  }
  const A = STORY[i], B = STORY[j];
  A.target(_sa); B.target(_sb);
  const target = _sa.lerp(_sb, e);
  const spin = reduceMotion ? 0 : time * 4;
  // Wide screens put text beside the model rather than below it, so the camera stands further back.
  const ds = vp.w > 860 ? 1.4 : Math.max(0.9, fitScale * 0.7);
  par.x += (parTarget.x - par.x) * Math.min(1, dt * 2); par.y += (parTarget.y - par.y) * Math.min(1, dt * 2);
  const az = lerpAngle(A.sph[0] + (A.spin ? spin : 0), B.sph[0] + (B.spin ? spin : 0), e) + par.x * 2.4;
  const el = A.sph[1] + (B.sph[1] - A.sph[1]) * e - par.y * 1.4;
  // Phones get per-shot distances: the wide establishing shots pull back so the whole package reads.
  const mA = vp.w > 860 ? 1 : A.m || 1, mB = vp.w > 860 ? 1 : B.m || 1;
  const d = (A.sph[2] * mA + (B.sph[2] * mB - A.sph[2] * mA) * e) * ds;
  const ca = Math.cos(deg(el));
  _sp.set(target.x + d * ca * Math.sin(deg(az)), target.y + d * Math.sin(deg(el)), target.z + d * ca * Math.cos(deg(az)));
  storyCentre.copy(sideCentre(A.side, _c1).lerp(sideCentre(B.side, _c2), e));
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2);
  camera.position.lerp(_sp, k);
  controls.target.lerp(target, k);
  camera.lookAt(controls.target);
}

/* Shared per-frame state: the underside fill light and where on screen the model is centred. */
const viewCentre = new THREE.Vector2(innerWidth / 2, innerHeight / 2), _want = new THREE.Vector2();
// A slight camera drift toward the pointer on desktop, while reading
const par = { x: 0, y: 0 }, parTarget = { x: 0, y: 0 };
if (matchMedia('(pointer: fine)').matches && !reduceMotion) {
  addEventListener('pointermove', (e) => { parTarget.x = e.clientX / innerWidth * 2 - 1; parTarget.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
}

let dofA = 0;
function updateFocus(dt) {
  let want = 0;
  if (dofAllowed()) {
    if (tour.active) want = SHOTS[tour.i].dof || 0;
    else if (mode === 'story') want = storyNear >= 0 ? STORY[storyNear].dof || 0 : 0;
    else { const d = camera.position.distanceTo(controls.target); want = d < 10 ? (10 - Math.max(d, 4.5)) / 5.5 : 0; }
  }
  dofA += (want - dofA) * Math.min(1, dt * (reduceMotion ? 60 : 2.2));
  bokeh.enabled = dofA > 0.03;
  bokeh.uniforms.aperture.value = dofA * 0.0021;
  bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
}

function updateAmbient(dt) {
  const under = tour.active ? SHOTS[tour.i].under : mode === 'story' && storyNear >= 0 && STORY[storyNear].state.under;
  tour.fill += ((under ? 1.5 : 0) - tour.fill) * Math.min(1, dt * 2.5);
  tourFill.intensity = tour.fill;
  const W = vp.w, H = vp.h;
  if (tour.active && !SHOTS[tour.i].home) _want.set(W * (W > 860 ? 0.56 : 0.5), H * 0.44);
  else if (tour.active) _want.copy(mode === 'viewer' ? layoutCentre : storyCentre);
  else _want.copy(mode === 'viewer' ? layoutCentre : storyCentre);
  viewCentre.lerp(_want, reduceMotion ? 1 : 1 - Math.exp(-dt * 3.5));
  camera.setViewOffset(W, H, W / 2 - viewCentre.x, H / 2 - viewCentre.y, W, H);
  camera.updateProjectionMatrix();
}

/* ───────────────────────── The field: 224 more packages for the scale section ───────────────────────── */

let field = null, fieldT = 0, fieldTarget = 0;
function buildField() {
  const N = 7, S = 13, cells = [];
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) if (i || j) cells.push({ x: i * S, z: j * S, r: Math.hypot(i, j) / (N * Math.SQRT2) });
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const mk = (geo, mat, per, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, cells.length * per); m.frustumCulled = false; m.castShadow = m.receiveShadow = shadow; g.add(m); return m; };
  const blobCv = document.createElement('canvas'); blobCv.width = blobCv.height = 128;
  const bx = blobCv.getContext('2d'), gr = bx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  bx.fillStyle = gr; bx.fillRect(0, 0, 128, 128);
  const blobGeo = new THREE.PlaneGeometry(15, 15); blobGeo.rotateX(-Math.PI / 2);
  field = {
    g, cells,
    sub: mk(new THREE.BoxGeometry(D.sub.w, D.sub.t, D.sub.d), [MAT.subSide, MAT.subSide, MAT.subTop, MAT.subBottom, MAT.subSide, MAT.subSide], 1),
    ring: mk(GEO.ring, MAT.stiff, 1),
    die: mk(new THREE.BoxGeometry(D.die.w, D.die.t, D.die.d), [MAT.dieSide, MAT.dieSide, MAT.dieTop, MAT.dieSide, MAT.dieSide, MAT.dieSide], 1),
    hbm: mk(new THREE.BoxGeometry(D.hbm.w, 0.16, D.hbm.d), [MAT.hbmLayer, MAT.hbmLayer, MAT.hbmTop, MAT.hbmLayer, MAT.hbmLayer, MAT.hbmLayer], 6),
    blob: mk(blobGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCv), transparent: true, depthWrite: false, opacity: 0.8 }), 1, false),
    hs: [-1, 1].flatMap((s) => hbmZ.map((z) => [s * hbmX, z])),
  };
}
const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fs = new THREE.Vector3(), _fp = new THREE.Vector3();
function updateField(dt) {
  if (!field) return;
  const dir = Math.sign(fieldTarget - fieldT);
  if (!dir) return;
  shadowsDirty = true;
  fieldT = THREE.MathUtils.clamp(fieldT + dir * dt / (reduceMotion ? 0.01 : 2.6), 0, 1);
  field.g.visible = fieldT > 0;
  field.cells.forEach((c, k) => {
    // Packages rise out of the floor in a ripple spreading from the centre.
    const s = ease(THREE.MathUtils.clamp(fieldT * 1.8 - c.r * 0.8, 0, 1)), sc = Math.max(s, 0.0001);
    const by = chipLift - (1 - s) * 1.6;
    const put = (mesh, idx, lx, ly, lz) => { _fm.compose(_fp.set(c.x + lx * sc, by + ly * sc, c.z + lz * sc), _fq, _fs.set(sc, sc, sc)); mesh.setMatrixAt(idx, _fm); };
    put(field.sub, k, 0, D.sub.t / 2, 0);
    put(field.ring, k, 0, D.y.subTop + 0.015, 0);
    put(field.die, k, 0, D.y.dieBot + D.die.t / 2, 0);
    field.hs.forEach(([hx, hz], h) => put(field.hbm, k * 6 + h, hx, D.y.dieBot + 0.08, hz));
    _fm.compose(_fp.set(c.x, 0.012, c.z), _fq, _fs.set(sc, 1, sc)); field.blob.setMatrixAt(k, _fm);
  });
  for (const m of [field.sub, field.ring, field.die, field.hbm, field.blob]) m.instanceMatrix.needsUpdate = true;
}

/* ───────────────────────── Modes: the scrolling story and the full viewer ───────────────────────── */

function setMode(m) {
  if (m === mode || tour.active) return;
  mode = m;
  document.body.classList.toggle('mode-viewer', m === 'viewer');
  controls.enabled = m === 'viewer';
  fly.t = 1;
  if (m === 'viewer') {
    if (explodeTarget) setExploded(false);
    if (lp.to !== PRESETS.studio) setPreset('studio');
    fieldTarget = 0;
    setAutoRotate(!reduceMotion);
    flyTo(HOME.pos, HOME.target, 1.8);
    select(0, false);
    requestAnimationFrame(() => $('btn-back').focus({ preventScroll: true }));
    if (location.hash !== '#viewer') history.replaceState(null, '', '#viewer');
  } else {
    setAutoRotate(false);
    storyNear = -1;
    if (location.hash === '#viewer') history.replaceState(null, '', location.pathname + location.search);
    const src = document.querySelector('#explore [data-viewer]');
    if (src) src.focus({ preventScroll: true });
  }
}
document.querySelectorAll('[data-viewer]').forEach((b) => b.addEventListener('click', () => setMode('viewer')));
$('btn-back').addEventListener('click', () => setMode('story'));
addEventListener('hashchange', () => { if (modelReady) setMode(location.hash === '#viewer' ? 'viewer' : 'story'); });


/* ───────────────────────── Boot ───────────────────────── */

let modelReady = false;

const lastSig = new Float64Array(16);
let stillFrames = 0, forceFrames = 2;
function frameIsStill() {
  const q = camera.quaternion, p = camera.position, tg = controls.target;
  const sig = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, tg.x, tg.y, tg.z, viewCentre.x, viewCentre.y, explodeT, fieldT, lp.t, dofA];
  let moved = false;
  for (let i = 0; i < sig.length; i++) { if (Math.abs(sig[i] - lastSig[i]) > 1e-6) moved = true; lastSig[i] = sig[i]; }
  // Things that animate on their own even with a still camera
  const animating = tour.active || fly.t < 1 || shadowsDirty || MAT.dieTop.emissiveIntensity > 0.001 || MAT.hbmTop.emissiveIntensity > 0.001
    || (mode === 'viewer' && controls.autoRotate) || (!reduceMotion && !MOBILE);
  if (moved || animating || forceFrames > 0) { stillFrames = 0; if (forceFrames > 0) forceFrames--; return false; }
  return ++stillFrames > 2;
}
addEventListener('resize', () => { forceFrames = 3; });

// If the browser drops the WebGL context (usually to reclaim memory), say so plainly.
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  const l = $('loader');
  l.classList.remove('done');
  loaderText.innerHTML = '<div class="fallback">The browser paused the 3D view to free up memory. <button type="button" class="btn btn-secondary" id="btn-reload">Reload</button></div>';
  loaderBar.parentElement.hidden = true;
  $('btn-reload').addEventListener('click', () => location.reload());
});

const chipLift = 1.0;
chip.position.y = chipLift;

async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 72px Archivo'), document.fonts.load('500 24px "IBM Plex Mono"'), document.fonts.load('600 20px "IBM Plex Mono"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fonts are a nicety for the laser marks */ }

  ENVMAPS = await buildModel();
  buildComposer();
  onResize();

  anchors.forEach((a) => {
    const p = parts[a.h.part].obj;
    const o = new THREE.Object3D(); o.position.set(...a.h.at);
    p.add(o); a.obj = o;
  });
  MAXD = Math.max(...Object.values(parts).map((p) => p.delay));
  setAutoRotate(!reduceMotion);
  $('spec-die').textContent = `${Math.round(D.die.w * MM * D.die.d * MM)}\u00a0mm²`;
  buildField();
  select(0, false);

  await stage('Compiling shaders', 88);
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older drivers: compile on first frame */ }
  setQuality(MOBILE ? 'mobile' : innerWidth < 860 ? 'balanced' : 'high');
  await stage('Ready', 100);

  const clock = new THREE.Clock();
  let first = true;
  camera.position.copy(HOME.pos).multiplyScalar(reduceMotion ? 1 : 1.6);
  controls.target.copy(HOME.target);
  controls.enabled = false;
  setAutoRotate(false);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    updatePreset(dt);
    updateExplode(dt);
    updateField(dt);
    if (!reduceMotion && !MOBILE) { chip.position.y = chipLift + Math.sin(t * 0.8) * 0.035; shadowsDirty = true; }
    if (tour.active) updateTour(dt, t);
    else if (mode === 'viewer') { updateFly(dt); controls.update(dt); }
    else updateStory(dt, t);
    updateAmbient(dt);
    updateFocus(dt);
    // Fog only ever eats the floor's horizon, never the model, whatever the zoom.
    const camD = camera.position.distanceTo(controls.target);
    scene.fog.near = camD + 6; scene.fog.far = camD + 40;
    MAT.dieTop.userData.uTime.value = t;
    finish.uniforms.uTime.value = t;
    // Skip frames that would be pixel-identical to the last one: the camera has settled and
    // nothing is animating. Saves battery and heat (and the throttling that follows) on phones.
    if (frameIsStill() && !first) { if (mode === 'viewer' && !tour.active) updateHotspots(); return; }
    if (shadowsDirty) { renderContactShadow(); renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    composer.render(dt);
    if (mode === 'viewer' && !tour.active) updateHotspots();
    autoQuality(dt);
    if (first) {
      first = false; modelReady = true;
      document.querySelectorAll('[data-film], [data-viewer]').forEach((b) => { b.disabled = false; });
      $('loader').classList.add('done'); $('stage').classList.add('ready');
      if (location.hash === '#viewer') setMode('viewer');
    }
  });
}

boot().catch((e) => {
  console.error(e);
  fail('The model could not be built on this device. Reloading usually fixes it; if not, try a desktop browser with hardware acceleration turned on.');
});
