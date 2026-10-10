// `line` (bars 12-13.75, 22.5-26.25 s): newsprint halftone on bone paper. The split-flap rules arrive as horizontal
// newsprint lines whose bands swell into the paper; a broadsheet front page whose picture is the world map in halftone
// dots, mono dateline. The amber beam writes a line across the page with a single-stroke plotter pen as the words are
// sung; the dots split and push apart along it; RESTRICTED (export red) stamps on "line"; the camera pushes in until
// the dots fill the frame and read as sand; the tape stop slows everything to a halt; black by 25.8 s.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, keys, prog, pulse, smoothstep } from '../engine/util';
import { lineByScene, sparkHead2D } from './_motifs';
import { H_TONS_LINE_Y, karaoke, mono, wordP } from './sand-kit';
import { isLand } from './machine-world';
import { shakeVec } from './node2-kit';
import type { Word } from '../engine/lyrics';

const T0 = 22.5, T_STOP = 25.05, T_END = 25.78;
const MX0 = 60, MX1 = 1860, MY0 = 222, LAT0 = 82, PITCH = 12, KX = (MX1 - MX0) / 360, KY = KX;
const LINE_Y = MY0 + (LAT0 - 38.9) * KY, FOCUS = { x: MX0 + (180 - 77) * KX, y: LINE_Y };
const BONE = '#EEE9DF', INK = '#0A0A0B', GRAPH = '#5E5B57';
interface Dot { x: number; y: number; d: number; h: number }

export default class Line extends Scene {
  text = new Layer2D();
  words: Word[] = [];
  dots: Dot[] = [];
  tw: number[] = [];

  override init() {
    this.words = lineByScene(this.ctx.lyrics, 'line').words;
    this.tw = [1, 2, 3, 4, 5, 6, 7].map((i) => this.words[i]?.start ?? T0 + i * 0.45);
    for (let y = MY0 + PITCH / 2; y < MY0 + 140 * KY; y += PITCH) {
      for (let x = MX0 + PITCH / 2; x < MX1; x += PITCH) {
        const lon = (x - MX0) / KX - 180, lat = LAT0 - (y - MY0) / KY;
        let a = 0;
        for (const [ox, oy] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]] as const) a += isLand(lon + ox, lat + oy);
        a /= 5;
        // halftone density: land dark, sea a light screen, with a gentle tone ramp by latitude
        const d = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(lon * 0.09)) + a * (0.62 + 0.14 * hash(Math.round(x), Math.round(y), 5));
        this.dots.push({ x, y, d: clamp(d, 0.05, 0.9), h: hash(Math.round(x), Math.round(y)) });
      }
    }
  }

  /** Warped story time: everything slows to a halt with the tape stop. */
  story(t: number) {
    if (t <= T_STOP) return t;
    const D = T_END - T_STOP, u = clamp((t - T_STOP) / D);
    return T_STOP + D * (u - u * u / 2);
  }
  /** Pen progress 0..1 along the page: one quarter per word Washington..line. */
  pen(s: number) {
    const w = this.tw;
    return keys(s, [[w[0]! - 0.05, 0, ease.linear], [w[1]!, 0.25, ease.linear], [w[2]!, 0.5, ease.linear], [w[3]!, 0.75, ease.linear], [w[3]! + 0.42, 1, ease.outQuad]]);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, s = this.story(t);
    clearRT(renderer, out, [0.004, 0.004, 0.004]);
    if (t >= T_END) return { vignette: 0.5 };
    const c = this.text.ctx;
    this.text.clear(INK);
    const lt = s - T0;
    const tLine = this.tw[3]!;
    // ---- camera: slow drift, then the push-in to the sand from "in"
    const tPush = this.tw[4]!;
    const zk = ease.inCubic(prog(s, tPush - 0.35, T_END + 0.05));
    const Z = (1 + 0.05 * prog(s, T0, tPush)) * Math.exp(Math.log(90) * zk);
    const cx = 960 + (FOCUS.x - 960) * zk, cy = 540 + (FOCUS.y - 540) * zk;
    const fx = (x: number) => 960 + (x - cx) * Z, fy = (y: number) => 540 + (y - cy) * Z;
    // ---- arrival: flap rules swell into paper
    const arrive = ease.outCubic(prog(lt, 0, 0.38));
    const penP = this.pen(s);
    const penX = MX0 + penP * (MX1 - MX0);
    const gapMax = 8 + 54 * prog(s, tLine - 0.1, tLine + 1.3, ease.outQuad) + 120 * zk;

    c.save();
    // paper bands (full page once arrive = 1)
    c.fillStyle = BONE;
    for (const y of [52, 152, ...H_TONS_LINE_Y, H_TONS_LINE_Y[7]! + 100]) {
      const half = 50 * arrive + 1.5;
      c.fillRect(0, fy(y) - half * Z, 1920, 2 * half * Z);
    }
    c.fillStyle = BONE; c.fillRect(0, fy(152) - 60 * Z * arrive, 1920, 120 * Z * arrive);
    c.restore();
    const ink = 'rgba(10,10,11,';
    if (arrive > 0.6) {
      const pa = clamp((arrive - 0.6) / 0.4);
      c.save(); c.globalAlpha = pa;
      // masthead, dateline, rules (hairline, page-space transforms)
      c.save(); c.translate(960, 540); c.scale(Z, Z); c.translate(-cx, -cy);
      c.fillStyle = INK; c.textBaseline = 'alphabetic'; c.textAlign = 'center';
      c.font = font(F.serif(600), 84); c.fillText('The Daily Ledger', 960, 98);
      c.textAlign = 'left';
      c.fillRect(MX0, 116, MX1 - MX0, 4); c.fillRect(MX0, 126, MX1 - MX0, 1.5);
      mono(c, 'WASHINGTON, OCT. 7, 2022 · VOL. CLXXI · NO. 59,302 · LATE CITY EDITION', MX0, 154, 15, ink + '0.85)', 600, 'left', 2);
      mono(c, 'FRONT PAGE · SECTION A', MX1, 154, 15, ink + '0.55)', 600, 'right', 2);
      c.fillRect(MX0, 166, MX1 - MX0, 1.5);
      c.font = font(F.archivo(70, 900), 44); c.fillStyle = INK;
      c.fillText('THE WORLD, RE-DRAWN BY ORDER', MX0, 206);
      c.restore();
      c.restore();
    }
    // ---- halftone world: dots split about the line, grow denser and grainier with the zoom
    const sand = smoothstep(2, 9, Z);
    const nearL = (Z > 3);
    const pitchPx = PITCH * Z;
    const gseed = Math.floor(s * 18);
    if (sand > 0.05) { c.fillStyle = `rgba(176,140,84,${0.85 * sand})`; c.fillRect(0, 0, 1920, 1080); }
    for (const d of this.dots) {
      const px = fx(d.x);
      if (px < -pitchPx || px > 1920 + pitchPx) continue;
      const reached = clamp((penP - (d.x - MX0) / (MX1 - MX0)) * 7);
      const dy0 = d.y - LINE_Y;
      const open = ease.outCubic(reached) * gapMax * Math.exp(-Math.abs(dy0) / 70) * (dy0 < 0 ? -1 : 1);
      const py = fy(d.y + open);
      if (py < -pitchPx || py > 1080 + pitchPx) continue;
      const grow = ease.outCubic(clamp((lt - 0.2 - (d.x - MX0) / 3600 - (d.y - MY0) / 5000 * 0.0) / 0.35));
      if (grow <= 0) continue;
      let dens = d.d + (0.98 - d.d) * sand * 0.8;
      // dots near the pen sparkle
      const r = 0.5 * PITCH * Math.sqrt(dens) * 1.12 * grow * Z;
      if (r < 0.2) continue;
      if (sand < 0.1 || r < 4) {
        c.fillStyle = INK; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      } else {
        // sand: each dot is a heap of irregular grains in umber / amber / ash / bone tones
        const n = Math.min(380, Math.floor(10 + r * 1.6));
        for (let k = 0; k < n; k++) {
          const a = hash(d.h * 997, k, 1) * Math.PI * 2, rr = Math.sqrt(hash(d.h * 997, k, 2)) * r * 1.05;
          const gs = 1.5 + hash(d.h * 997, k, 3) * (2 + r * 0.035);
          const q = hash(d.h * 997, k, 4);
          c.fillStyle = q < 0.3 ? '#7A3A06' : q < 0.55 ? '#B0731E' : q < 0.75 ? '#9C978F' : q < 0.9 ? '#FFD27A' : INK;
          c.fillRect(px + Math.cos(a) * rr, py + Math.sin(a) * rr, gs, gs * (0.6 + hash(k, d.h, 5)));
        }
      }
    }
    void nearL; void gseed;
    // ---- the cut: dark seam between the split dots, then the plotter line itself
    const yL = fy(LINE_Y);
    if (penP > 0) {
      const x0 = fx(MX0), x1 = fx(penX);
      c.fillStyle = INK; c.fillRect(x0, yL - gapMax * 0.2 * Z, x1 - x0, gapMax * 0.4 * Z);
      // single-stroke plotter pen: a thin hot line with plotted tick marks (the draughtsman's tail)
      c.strokeStyle = rgba('signal', 1); c.lineWidth = Math.max(2, 3 * Math.min(Z, 5));
      c.beginPath(); c.moveTo(x0, yL); c.lineTo(x1, yL); c.stroke();
      c.strokeStyle = rgba('ember', 0.9); c.lineWidth = Math.max(1, Z > 5 ? 2 : 1);
      c.beginPath(); c.moveTo(x0, yL); c.lineTo(x1, yL); c.stroke();
      if (Z < 4) {
        c.strokeStyle = rgba('signal', 0.9); c.lineWidth = 1.5; c.beginPath();
        for (let x = MX0; x < penX; x += 60) { c.moveTo(fx(x), yL - 10 * Z); c.lineTo(fx(x), yL + 10 * Z); }
        c.stroke();
        mono(c, '38.9072 N  77.0369 W', fx(FOCUS.x) + 14, yL - 18 * Z, 13, rgba('ember', 0.95 * clamp(penP * 3)), 600, 'left', 1);
      }
      if (penP < 1) { sparkHead2D(c, x1, yL, s, 1.3 + 0.6 * pulse(s, this.tw[0]!, 0.2)); c.fillStyle = rgba('ember'); c.fillRect(x1 - 1, yL - 24, 2, 48); }
    }
    // ---- RESTRICTED stamp on "line"
    const st = prog(s, tLine, tLine + 0.12, ease.outQuad);
    if (st > 0 && Z < 6) {
      const sc = (1 + 1.3 * (1 - st)) * (1 + 0.03 * pulse(s, tLine, 0.1));
      c.save();
      c.translate(fx(560), fy(300 + 30)); c.rotate(-0.1); c.scale(sc * Z, sc * Z);
      c.globalAlpha = st * (1 - smoothstep(5, 6, Z));
      c.strokeStyle = '#E0312B'; c.fillStyle = '#E0312B'; c.lineWidth = 7; c.strokeRect(-190, -50, 380, 100);
      c.lineWidth = 2; c.strokeRect(-182, -42, 364, 84);
      c.font = font(F.archivo(110, 900), 66); c.textAlign = 'center'; c.fillText('RESTRICTED', 0, 20);
      c.font = font(F.mono(700), 12); c.fillText('EXPORT CONTROL · ECCN 3A090', 0, 40);
      // worn ink: erase flecks
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) c.fillRect(-190 + hash(i, 9) * 380, -50 + hash(i, 10) * 100, 1 + hash(i, 11) * 5, 1 + hash(i, 12) * 2);
      c.restore();
    }
    // ---- lyric strip (ink on a paper plate), fades as the push-in begins
    const la = 1 - smoothstep(0.0, 0.6, zk * 14);
    if (la > 0.01 && arrive > 0.8) {
      c.save(); c.globalAlpha = la;
      c.fillStyle = BONE; c.fillRect(0, 944, 1920, 136);
      c.fillStyle = INK; c.fillRect(MX0, 948, MX1 - MX0, 3);
      let x = MX0;
      for (const w of this.words) x += karaoke(c, w.w, x, 1034, F.serif(600), 66, wordP(w, t), INK, 'rgba(10,10,11,0.28)', 0) + 24;
      c.restore();
    }
    // ---- fade to black with the tape stop
    const fade = smoothstep(T_END - 0.3, T_END - 0.02, t);
    if (fade > 0) { c.fillStyle = `rgba(0,0,0,${fade})`; c.fillRect(0, 0, 1920, 1080); }
    comp.draw(renderer, this.text.upload(), out);
    const hit = pulse(s, tLine, 0.1), slow = 1 - prog(t, T_STOP, T_END);
    const [sx, sy] = shakeVec(t, (1 + 12 * hit + 5 * zk) * slow, 5);
    return { bloom: 0.5, bloomThreshold: 0.96, vignette: 0.38, grain: 0.09, shake: [sx, sy] as [number, number], zoom: 1 + 0.012 * f.a.kick * slow + 0.02 * hit, ca: 0.5 + 2 * hit, flash: 0 };
  }
}
