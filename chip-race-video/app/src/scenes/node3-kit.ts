// node3 / grid3 shared: the crown pixel mask on the 20x10 tile grid (tile 96x108 px) and the plate-icon atlas.
import * as THREE from 'three';
import { F, font } from '../engine/type';
import { hash } from '../engine/util';

export const TILE_W = 96, TILE_H = 108, COLS = 20, ROWS = 10;
/** 12 x 6 crown, placed at tile (4, 2). 'X' lit, 'J' jewel, '.' dark. */
export const CROWN_ROWS = [
  'X..X.XX.X..X',
  'XX.XXXXXX.XX',
  'XXXXXXXXXXXX',
  'XXJXXJJXXJXX',
  '............',
  'XXXXXXXXXXXX',
];
export const CROWN_OX = 4, CROWN_OY = 2;
export function crownAt(i: number, j: number): 0 | 1 | 2 {
  const r = j - CROWN_OY, c = i - CROWN_OX;
  if (r < 0 || r >= CROWN_ROWS.length || c < 0 || c >= 12) return 0;
  const ch = CROWN_ROWS[r]![c]!;
  return ch === 'X' ? 1 : ch === 'J' ? 2 : 0;
}
/** tile centres of the lit crown tiles in screen px (head-on pose): the lights grid3 starts from */
export function crownDots(): { x: number; y: number; jewel: boolean; i: number; j: number }[] {
  const out: { x: number; y: number; jewel: boolean; i: number; j: number }[] = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const k = crownAt(i, j);
    if (k) out.push({ x: TILE_W * (i + 0.5), y: TILE_H * (j + 0.5), jewel: k === 2, i, j });
  }
  return out;
}

export const ICON_N = 24;
export function makeAtlas(): THREE.CanvasTexture {
  const S = 256, cv = document.createElement('canvas');
  cv.width = S * 6; cv.height = S * 4;
  const c = cv.getContext('2d')!;
  for (let n = 0; n < ICON_N; n++) {
    c.save();
    c.translate((n % 6) * S, Math.floor(n / 6) * S);
    c.beginPath(); c.rect(0, 0, S, S); c.clip();
    drawIcon(c, n, S);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  tex.flipY = true;
  return tex;
}

function drawIcon(c: CanvasRenderingContext2D, n: number, S: number) {
  c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 11; c.lineCap = 'round'; c.lineJoin = 'round';
  const m = S / 2;
  const P = (pts: [number, number][], close = false) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); c.stroke(); };
  switch (n) {
    case 0: P([[60, 150], [90, 80], [150, 62], [200, 110], [180, 180], [100, 196]], true); P([[100, 120], [160, 120]]); P([[96, 150], [150, 150]]); break; // sand grain
    case 1: for (let i = 0; i < 5; i++) { c.globalAlpha = 1 - i * 0.18; c.beginPath(); c.arc(m, 40 + i * 44, 16 - i, 0, 7); c.fill(); } c.globalAlpha = 1; break; // droplets
    case 2: for (let i = 1; i <= 4; i++) { c.beginPath(); c.arc(m, m, i * 28, 0, 7); c.stroke(); } break; // heat rings
    case 3: P([[30, 220], [90, 90], [170, 150], [230, 30]]); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(60 + i * 46, 60 + (i % 2) * 120, 20, 0, 7); c.stroke(); } break; // mirrors
    case 4: for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.strokeRect(34 + x * 64, 50 + y * 52, 56, 44); break; // containers
    case 5: for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { c.beginPath(); c.arc(36 + x * 46, 36 + y * 46, 4 + ((x + y) % 5) * 3.2, 0, 7); c.fill(); } break; // halftone
    case 6: c.font = font(F.archivo(125, 900), 220); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('W', m, m + 14); break; // slam
    case 7: c.beginPath(); c.arc(m, m, 82, 0, 7); c.stroke(); P([[m, 20], [m, 236]]); P([[20, m], [236, m]]); c.beginPath(); c.arc(m, m, 22, 0, 7); c.stroke(); break; // reticle
    case 8: for (let i = -1; i <= 1; i++) P([[30, m + i * 52], [226, m + i * 52]]); c.lineWidth = 26; P([[m, 40], [m, 216]]); break; // transistor
    case 9: for (let i = -2; i < 8; i++) P([[i * 40, 256], [i * 40 + 120, 0]]); c.clearRect(90, 100, 90, 60); c.strokeRect(90, 100, 90, 60); break; // aerial
    case 10: P([[34, 24], [34, 222], [232, 222]]); P([[40, 210], [100, 190], [150, 150], [190, 90], [214, 30]]); break; // log chart
    case 11: for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (hash(x, y, 11) > 0.42) c.fillRect(30 + x * 34, 30 + y * 34, 28, 28); break; // pixels
    case 12: for (let i = 0; i < 7; i++) c.strokeRect(50, 30 + i * 30, 156, 20); break; // HBM stack
    case 13: c.strokeRect(28, 70, 200, 130); c.strokeRect(70, 100, 116, 70); P([[90, 70], [90, 40], [166, 40], [166, 70]]); break; // x-ray bag
    case 14: for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.2832; P([[m, m], [m + Math.cos(a) * (i % 2 ? 70 : 108), m + Math.sin(a) * (i % 2 ? 70 : 108)]]); } c.beginPath(); c.arc(m, m, 44, 0, 7); c.stroke(); break; // compass
    case 15: c.beginPath(); c.arc(76, m, 40, 0, 7); c.stroke(); P([[116, m], [230, m]]); P([[190, m], [190, m + 40]]); P([[216, m], [216, m + 30]]); break; // key
    case 16: P([[m, 24], [214, 60], [200, 150], [m, 232], [56, 150], [42, 60]], true); P([[m, 60], [m, 200]]); P([[70, 110], [186, 110]]); break; // shield
    case 17: for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) c.strokeRect(24 + x * 76, 50 + y * 96, 64, 80); break; // fab windows
    case 18: for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.2832; P([[m + Math.cos(a) * 80, m + Math.sin(a) * 80], [m + Math.cos(a + 0.2) * 112, m + Math.sin(a + 0.2) * 112]]); } c.beginPath(); c.arc(m, m, 78, 0, 7); c.stroke(); break; // sawblade
    case 19: c.strokeRect(28, 28, 200, 200); c.strokeRect(44, 44, 90, 70); c.strokeRect(150, 44, 62, 100); c.strokeRect(44, 130, 90, 82); c.strokeRect(150, 160, 62, 52); break; // die
    case 20: P([[20, m], [90, m]]); c.strokeRect(90, m - 26, 52, 52); P([[142, m], [236, m]]); P([[116, m - 26], [116, 30]]); c.beginPath(); c.arc(116, 30, 14, 0, 7); c.stroke(); break; // one-line
    case 21: c.beginPath(); c.arc(m, 150, 100, 3.4, 6.03); c.stroke(); P([[m, 150], [m + 50, 80]]); c.beginPath(); c.arc(m, 150, 12, 0, 7); c.fill(); break; // speedo
    case 22: for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { c.globalAlpha = hash(x, y, 3) > 0.45 ? 1 : 0.28; c.beginPath(); c.arc(40 + x * 44, 40 + y * 44, 14, 0, 7); c.fill(); } c.globalAlpha = 1; break; // LEDs
    default: for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const r = 5 + 10 * Math.exp(-(((x - 2) ** 2 + (y - 2) ** 2) / 2)); c.beginPath(); c.arc(40 + x * 44, 40 + y * 44, r, 0, 7); c.fill(); } // atoms
  }
}
