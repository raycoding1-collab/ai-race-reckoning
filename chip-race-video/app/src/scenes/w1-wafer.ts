// W1 THE WAFER (the three chorus drops: drop1 26.25-30, drop2 71.25-75, drop3 116.25-120; params { n }):
// "Every wafer is a weapon now." The same 300 mm wafer treated worse each time, hand-built and shaded as a scanning
// electron micrograph (engine/se.ts). The slam rhythm, the TPP odometer / threshold and the 2D hand-offs are drop.ts
// (this class extends Drop and reuses its shots, TPP code and inverted tpp/end of n=2).
//
//  Model (world unit = mm, same wafer family as w7-shield: 13.5 x 16.5 mm die pitch, 2 x 2 dies per stitched reticle field):
//   300 mm disc (775 um shown at 4 mm), chamfered rim, V notch at 6 o'clock, darker edge-bead ring, laser-marked serial
//   LOT 7A-0042 S25 along the margin, raised metal-bright die pads with seal-ring grooves, wider scribe lanes at the field
//   seams. It rests on dicing tape on a chuck, on a graduated tray (ring ticks, ruler, an etched product label).
//   n=1 whole:   the wafer slides in, "WAFER" is etched as a die mask (pixel font, the dies sink), the chuck turns the notch
//                to 12, the camera pitches to top-down, the lanes' crosshair graticule rises, one die locks.
//   n=2 diced:   a toothed saw (40 teeth, flange, spindle) cuts one street per ~47 ms sweep, the chuck turns 90 degrees and
//                cuts the other way; every die pops up 0.5 mm when its streets are open. Inverted TPP like the old drop.
//   n=3 shrapnel: no wafer: 4 mm die slabs on the tape, each etched with a lyric word, thrown outward and at the camera with
//                drag and spin, in waves from the middle; the centre slab stays and locks.
//  Lyric to geometry (rel. to the line start): Every 0 / wafer .47 / is .94 / a 1.17 / weapon 1.41 / now 1.875.
//   0-.47 a quartz grain falls on a lit die pad, the camera pulls back and the pad turns out to be on the wafer (scale rhyme)
//   .47 W,A and .70 F,E,R sink as die pits;  .94-1.41 notch to 12;  1.41 pitch + graticule;  1.875 lock + TPP.
//  Etched label joke on the tray, written by e-beam: PRODUCT: WAFER, SILICON, 300 mm  NOT A WEAPON / (DUAL-USE) / WEAPON.
//  in : hbm/line/fab/hold all end on black (hold on a white flash): first frame is the drop's flash on a dark stage.
//  out: n=1, n=3 the locked die zooms top-down; a hard match cut to drop-lattice's die dive at the die's own scale, ending on the
//       lattice w4-nanosheet opens on (fins 58.3 px apart). n=2 ends as drop.ts (kerf opens) into w9-diecity.
import * as THREE from 'three';
import { type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SCALE } from '../engine/gl';
import { F, font } from '../engine/type';
import { HEX } from '../engine/palette';
import { clamp, ease, frameIdx, hash, lerp, pulse, smoothstep, TAU } from '../engine/util';
import { SEShade, SEStrip, seCamera, sePost, type SECam, type V3 } from '../engine/se';
import { GLSL_COMMON } from '../engine/glsl/common';
import { dies, WAFER } from './shield-grid';
import Drop from './drop';

// ------------------------------------------------------------------------------------------------ constants
const PPM0 = WAFER.R / 150;
const mm = (px: number) => px / PPM0;
const WR = 150, TH = 4, PADH = 0.7;
const PITCH = { x: mm(WAFER.dx), z: mm(WAFER.dy) };               // 13.5 x 16.5
const COLS = Math.ceil((WAFER.R * 2) / WAFER.dx) + 2, ROWS = Math.ceil((WAFER.R * 2) / WAFER.dy) + 2;
const ORG = { x: mm((0 - (COLS - 1) / 2) * WAFER.dx), z: mm((0 - (ROWS - 1) / 2) * WAFER.dy) };
const COLC = (COLS - 1) / 2, ROWC = (ROWS - 1) / 2;
const HALF = { x: mm(WAFER.dx - 3) / 2, z: mm(WAFER.dy - 3) / 2 };
const f1 = (x: number) => x.toFixed(4);
const BEAT = 60 / 128;

// pixel-font mask "WAFER" for the dies (rows 5..9, cols 2..22); the centre die (12, 10) is never part of it
const GLYPH: Record<string, string[]> = {
  W: ['X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
};
const WORD_ROW0 = 5, WORD_COL0 = 2;
const LBL = { cw: 2400, ch: 176, X0: 168, X1: 190, ZL: 300 };   // label canvas: 300 mm along z (bottom to top) x 22 mm
const WORDS = ['EVERY', 'WAFER', 'IS', 'A', 'WEAPON', 'NOW'];

// ------------------------------------------------------------------------------------------------ GLSL: the world
const COMMON_U = /* glsl */ `
uniform float uT, uN, uRot, uCross, uLock, uLblRev, uLblHold, uLblTailT;
uniform vec3 uWafPos;
uniform vec4 uCut;       // H street 0 time, dt, V street 0 time, dt
uniform vec4 uLb;        // head end u, tail start u, end u, (unused)
uniform sampler2D uDie, uLbl, uMark;
const float WR = ${f1(WR)}, TH = ${f1(TH)}, PADH = ${f1(PADH)};
const vec2 ORG = vec2(${f1(ORG.x)}, ${f1(ORG.z)}), PIT = vec2(${f1(PITCH.x)}, ${f1(PITCH.z)}), HALF = vec2(${f1(HALF.x)}, ${f1(HALF.z)});
const ivec2 GN = ivec2(${COLS}, ${ROWS});
const ivec2 CEN = ivec2(${COLC}, ${ROWC});
vec3 wl(vec3 p) {                      // world -> wafer local (yaw about y, then the slide)
  vec3 q = p - uWafPos;
  float c = cos(uRot), s = sin(uRot);
  return vec3(q.x * c - q.z * s, q.y, q.x * s + q.z * c);
}
vec4 dieAt(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= GN.x || c.y >= GN.y) return vec4(0.0);
  return texelFetch(uDie, c, 0);
}
`;

const WORLD = /* glsl */ `
${COMMON_U}
uniform vec4 uSaw;       // x, z, spin, on
uniform vec4 uGrain;     // world x, y, z, 1
#define SE_SHADOW 0.55
#define SE_STEPS 72
#define SE_SHADOW_STEPS 6
const float TRAYY = ${f1(-TH - 1.9)};
const float RB = 56.0;

float sdWafer2(vec2 q) {
  float d = length(q) - WR;
  float tri = seTri2(q, vec2(-9.2, WR + 1.2), vec2(9.2, WR + 1.2), vec2(0.0, WR - 3.75));   // the notch, 6 o'clock
  return smax(d, -tri, 0.9);
}

/** is the kerf of street k open at world x? sweep runs along +x */
bool kerfOpen(float tK, float dur, float wx) {
  float q = (uT - tK) / dur;
  return q >= 1.0 || (q > 0.0 && wx < mix(-175.0, 175.0, q));
}

vec2 waferLayer(vec3 p, float wx) {
  vec2 gq = (p.xz - ORG) / PIT;
  ivec2 c0 = ivec2(floor(gq + 0.5));
  vec2 f0 = gq - vec2(c0);
  ivec2 sg = ivec2(f0.x >= 0.0 ? 1 : -1, f0.y >= 0.0 ? 1 : -1);
  vec2 q0 = f0 * PIT;
  vec2 res;
  if (p.y < 3.0) {
    float d2 = sdWafer2(p.xz);
    vec2 w = vec2(d2, abs(p.y + TH * 0.5) - TH * 0.5) + 1.4;           // chamfered rim
    float dS = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 1.4;
    if (uN > 1.5 && uN < 2.5) {                                       // dicing kerfs
      float sx = PIT.x * 0.5 - abs(q0.x), sz = PIT.y * 0.5 - abs(q0.y);
      int nx = f0.x > 0.0 ? c0.x + 1 : c0.x, nz = f0.y > 0.0 ? c0.y + 1 : c0.y;
      float dH = 1.0e3, dV = 1.0e3;
      if (kerfOpen(uCut.x + float(nz) * uCut.y, uCut.y * 0.8, wx)) dH = sz - 0.45;
      if (uCut.z < 1000.0 && kerfOpen(uCut.z + float(nx) * uCut.w, uCut.w * 0.8, wx)) dV = sx - 0.45;
      dS = smax(dS, -min(dH, dV), 0.08);
    }
    res = vec2(dS, SE_SILICON);
  } else res = vec2((p.y - 2.0) * 0.75, SE_SILICON);
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    if (k > 0) {
      vec2 gap = vec2(o.x == 1 ? PIT.x * 0.5 - abs(q0.x) : 0.0, o.y == 1 ? PIT.y * 0.5 - abs(q0.y) : 0.0);
      if (length(gap) > res.x + 2.0) continue;
    }
    ivec2 c = c0 + o * sg;
    vec4 cd = dieAt(c);
    if (cd.x < 0.5) continue;
    vec2 q = q0 - vec2(c - c0) * PIT;
    bool sL = (c.x & 1) == 0, sR = ((c.x + 1) & 1) == 0, sB = (c.y & 1) == 0, sT = ((c.y + 1) & 1) == 0;   // stitched field seams
    float xl = PIT.x * 0.5 - (sL ? 1.15 : 0.5625), xr = PIT.x * 0.5 - (sR ? 1.15 : 0.5625);
    float zl = PIT.y * 0.5 - (sB ? 1.15 : 0.5625), zr = PIT.y * 0.5 - (sT ? 1.15 : 0.5625);
    float hx = (xl + xr) * 0.5, cx = (xr - xl) * 0.5, hz = (zl + zr) * 0.5, cz = (zr - zl) * 0.5;
    float pop = 0.0;
    if (uN > 1.5 && uN < 2.5 && uCut.z < 1000.0) {
      float tp = max(uCut.x + float(c.y + 1) * uCut.y, uCut.z + float(c.x + 1) * uCut.w) + uCut.w * 0.8;
      pop = 0.5 * smoothstep(0.0, 0.10, uT - tp);
    }
    bool cen = c == CEN;
    float sink = smoothstep(0.0, 0.12, uT - cd.y) * 1.25;
    float top = PADH + pop - sink + (cen ? 0.9 * uLock : 0.0);
    float bot = -0.5 + pop;
    if (top - bot < 0.12) continue;
    float dP = seRoundBox(vec3(q.x - cx, p.y - 0.5 * (top + bot), q.y - cz), vec3(hx, 0.5 * (top - bot), hz), 0.22);
    if (p.y > top - 0.5) {                                             // seal-ring groove
      float rg = abs(seRoundBox2(q - vec2(cx, cz), vec2(hx, hz) - 1.0, 0.3)) - 0.16;
      dP = max(dP, -max(rg, (top - 0.14) - p.y));
    }
    res = seSmoothUnion(res, vec2(dP, cen ? 12.0 : SE_METAL), 0.1);
  }
  return res;
}

/** the toothed dicing blade: 40 teeth, flange, spindle, cooling slots; axis along z */
vec2 sawD(vec3 p) {
  vec3 q = p - vec3(uSaw.x, -TH - 0.4 + RB, uSaw.y);
  float r = length(q.xy);
  if (r > RB + 8.0) return vec2(r - RB - 5.0, 9.0);
  float ang = atan(q.y, q.x) + uSaw.z;
  float t = fract(ang / ${TAU.toFixed(5)} * 40.0);
  float rt = RB - 3.2 * t;
  float d = max((r - rt) * 0.85, abs(q.z) - 0.55);
  float slot = seRoundBox2(vec2((fract(ang / ${TAU.toFixed(5)} * 12.0) - 0.5) * r * ${TAU.toFixed(5)} / 12.0, r - 33.0), vec2(1.7, 6.0), 1.0);
  d = max(d, -max(slot, abs(q.z) - 2.0));
  float fl = max(r - 17.0, abs(q.z) - 3.2);
  d = min(d, fl);
  float bolts = max(length(vec2((fract(ang / ${TAU.toFixed(5)} * 6.0) - 0.5) * r * ${TAU.toFixed(5)} / 6.0, r - 11.5)) - 1.4, abs(q.z) - 4.0);
  d = min(d, bolts);
  d = min(d, max(r - 6.0, abs(q.z - 38.0) - 36.0));
  return vec2(d, 9.0);
}

/** the quartz grain: faceted, a rounded box cut by planes and a sphere */
vec2 grainD(vec3 p) {
  vec3 q = p - uGrain.xyz;
  if (length(q) > 3.0) return vec2(length(q) - 2.4, 11.0);
  float c = 0.83, s = 0.56;
  q.xz = mat2(c, -s, s, c) * q.xz;
  q.xy = mat2(0.92, -0.39, 0.39, 0.92) * q.xy;
  float d = max(seRoundBox(q, vec3(1.0, 0.85, 0.95), 0.12), length(q) - 1.18);
  d = max(d, dot(q, vec3(0.62, 0.55, 0.56)) - 1.0);
  d = max(d, dot(q, vec3(-0.55, 0.7, 0.45)) - 0.95);
  d = max(d, dot(q, vec3(0.3, -0.5, 0.81)) - 0.98);
  return vec2(d, 11.0);
}

vec2 map(vec3 p) {
  float rr = length(p.xz);
  // the tray, the dicing tape on its chuck, the ring ticks live in the shade pass
  vec2 res = vec2(seRoundBox(p - vec3(0.0, TRAYY, 0.0), vec3(232.0, 1.5, 205.0), 1.0), 8.0);
  float dChuck = seCylYR(p - vec3(0.0, -TH - 0.25, 0.0), 172.0, 0.35, 0.2);
  if (dChuck < res.x) res = vec2(dChuck, SE_TAPE);
  if (p.y < 12.0) {
    if (uN < 2.5 && rr < WR + 6.0) {
      vec3 pl = wl(p);
      res = seSmoothUnion(res, waferLayer(pl, p.x), 0.3);
    }
    // graticule: the lanes become a crosshair with a gap round the die, three rings
    if (uCross > 0.01 && p.y > -1.0) {
      float hh = 0.28 * uCross, ax = abs(p.x), az = abs(p.z);
      float dc = 1.0e3;
      float bx = max(max(abs(p.z) - 0.28, abs(p.y - 1.5) - hh), max(12.0 - ax, ax - 185.0 * uCross));
      float bz = max(max(abs(p.x) - 0.28, abs(p.y - 1.5) - hh), max(14.0 - az, az - 185.0 * uCross));
      dc = min(bx, bz);
      float dr = min(min(abs(rr - 117.0), abs(rr - 75.0)), abs(rr - 33.0)) - 0.2;
      dc = min(dc, max(dr, abs(p.y - 1.5) - hh));
      if (dc < res.x) res = vec2(dc, SE_BEAM);
    }
    if (uLock > 0.01) {                                              // the die locks: four corner brackets snap in
      vec2 b = abs(p.xz);
      float sp = 1.0 + 2.2 * (1.0 - uLock);
      vec2 bb = vec2(HALF.x + 1.4, HALF.y + 1.4) * sp;
      float dl = min(seRoundBox2(b - vec2(bb.x - 2.2, bb.y), vec2(2.2, 0.3), 0.1), seRoundBox2(b - vec2(bb.x, bb.y - 2.4), vec2(0.3, 2.4), 0.1));
      dl = max(dl, abs(p.y - 1.9) - 0.4);
      if (dl < res.x) res = vec2(dl, SE_BEAM);
    }
    if (uN > 1.5 && uN < 2.5 && uSaw.w > 0.5) {
      vec2 sw = sawD(p);
      if (sw.x < res.x) res = sw;
    }
    if (uGrain.w > 0.5) {
      vec2 g = grainD(p);
      if (g.x < res.x) res = g;
    }
  } else {
    res.x = min(res.x, max(p.y - 11.5, 0.05));
    if (uN > 1.5 && uN < 2.5 && uSaw.w > 0.5 && p.y < 125.0) {
      vec2 sw = sawD(p);
      if (sw.x < res.x) res = sw;
    }
  }
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-340.0, -12.0, -270.0), hi = vec3(340.0, 130.0, 270.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float lblAlpha(vec3 p, out float u) {
  u = (150.0 - p.z) / 300.0;
  vec2 uv = vec2(u, (p.x - ${f1(LBL.X0)}) / ${f1(LBL.X1 - LBL.X0)});
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uLbl, uv).r * step(u, uLblRev);
}

float matZ(float id, vec3 p, vec3 n) {
  float Z = id < 6.5 ? seMatZ(id) : (id < 8.5 ? 0.44 : (id < 9.5 ? 0.97 : (id < 11.5 ? 0.80 : (id < 12.5 ? 1.25 : 0.85))));
  if (id > 1.5 && id < 2.5) Z *= (1.0 - 0.5 * smoothstep(60.0, 180.0, length(p.xz)));
  return Z;
}
float matAmber(float id, vec3 p, vec3 n) {
  if (id > 5.5 && id < 6.5) return 0.99;
  if (id > 11.5 && id < 12.5) return 0.95 * uLock * smoothstep(0.5, 0.9, n.y);
  if (id > 0.5 && id < 1.5) {
    vec3 pl = wl(p);
    vec4 cd = dieAt(ivec2(floor((pl.xz - ORG) / PIT + 0.5)));
    float fl = exp(-(uT - cd.y) / 0.32) * step(cd.y, uT);
    return 0.97 * fl * smoothstep(0.55, 0.9, n.y);
  }
  if (id < 0.5 && uSaw.w > 0.5) {                                  // the kerf glows under the blade
    float d = length(vec2(p.x - uSaw.x, p.z - uSaw.y));
    return 0.9 * exp(-d * 0.45) * step(p.y, 0.2);
  }
  if (id > 7.5 && id < 8.5 && p.x > ${f1(LBL.X0)} && p.x < ${f1(LBL.X1)}) {
    float u; float a = lblAlpha(p, u);
    float tail = step(uLb.y, u);
    float lit = uLblHold > 0.5 ? 1.0 : exp(-max(uT - uLblTailT, 0.0) / 0.55);
    return 0.95 * a * tail * lit;
  }
  return 0.0;
}
`;

const SHADE = /* glsl */ `
${COMMON_U}
float hh21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0, add = 0.0;
  vec3 pl = wl(p);
  float rr = length(pl.xz);
  if (id < 0.5) {
    // darker edge-bead ring, the laser-marked serial in the margin
    mz *= 1.0 - 0.38 * smoothstep(WR - 4.5, WR - 4.2, rr) * (1.0 - smoothstep(WR - 1.7, WR - 1.4, rr));
    if (rr > WR - 6.0 && n.y > 0.5) {
      float m = texture(uMark, (pl.xz + 160.0) / 320.0).r;
      mz *= 1.0 + 2.4 * m; add += 0.28 * m;
    }
  } else if (id < 1.5 || id > 11.5) {
    // etch scalloping on the die walls, fine diffraction streaks on the tops
    float wall = 1.0 - smoothstep(0.25, 0.6, abs(n.y));
    float pitch = 0.26;
    float a = 1.0 - smoothstep(0.30, 0.65, fw / pitch);
    mz *= 1.0 + wall * a * 0.18 * sin(p.y / pitch * 6.2832);
    vec2 cc = floor((pl.xz - ORG) / PIT + 0.5);
    mz *= 1.0 + 0.05 * (1.0 - wall) * (hh21(cc) - 0.5) + 0.03 * (1.0 - wall) * sin(pl.x * 5.1 + hh21(cc.yx) * 9.0);
  } else if (id > 7.5 && id < 8.5) {
    float rt = length(p.xz);
    float ang = atan(p.z, p.x), st = 0.04363323;
    float ai = floor(ang / st + 0.5), la = (ang - ai * st) * rt;
    bool major = mod(ai, 4.0) == 0.0;
    float tk = (1.0 - smoothstep(0.30, 0.55, abs(la))) * step(rt, major ? 181.0 : 177.0) * step(173.0, rt);
    float ru = (1.0 - smoothstep(0.12, 0.3, abs(fract(p.z / 5.0 + 0.5) - 0.5) * 5.0)) * step(abs(p.x + 214.0), (mod(floor(p.z / 5.0 + 0.5), 5.0) == 0.0) ? 9.0 : 4.5);
    mz *= 1.0 + 1.1 * max(tk, ru);
    if (p.x > ${f1(LBL.X0)} && p.x < ${f1(LBL.X1)}) {
      float u; float a = 0.0;
      u = (150.0 - p.z) / 300.0;
      vec2 uv = vec2(u, (p.x - ${f1(LBL.X0)}) / ${f1(LBL.X1 - LBL.X0)});
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) a = texture(uLbl, uv).r * step(u, uLblRev);
      mz *= 1.0 + 2.6 * a; add += 0.34 * a;
    }
  } else if (id > 8.5 && id < 9.5) {
    // blade: a fine concentric lapping pattern
    mz *= 1.0 + 0.08 * sin(p.y * 2.7 + p.x * 0.4);
  }
  return vec2(mz, add);
}`;

// ------------------------------------------------------------------------------------------------ n=3: the thrown slabs
const SLAB_VERT = /* glsl */ `precision highp float;
precision highp int;
in vec3 position;
in vec3 normal;
in vec4 aP;   // x0, z0, throw time, hash
in vec4 aV;   // vx, vy, vz, spin rate
in vec4 aA;   // axis xyz, word
uniform float uT, uRot;
uniform vec3 uWafPos, uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan;
out vec3 vW; out vec3 vN; out vec3 vL; out float vTop; out vec4 vI;
vec3 rot(vec3 v, vec3 a, float t) { float c = cos(t), s = sin(t); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
void main() {
  float tau = max(uT - aP.z, 0.0);
  float k = 1.5;
  float e = (1.0 - exp(-k * tau)) / k;
  float ang = aV.w * (1.0 - exp(-1.1 * tau)) / 1.1;
  vec3 ax = normalize(aA.xyz);
  vec3 loc = position;
  vec3 r = rot(loc, ax, ang);
  float c = cos(uRot), s = sin(uRot);
  vec3 base = vec3(aP.x * c + aP.y * s, -2.0, -aP.x * s + aP.y * c) + uWafPos;
  vec3 w = base + vec3(aV.x, aV.y, aV.z) * e + r;
  vec3 rel = w - uCamPos;
  float z = dot(rel, uCamFwd);
  vW = w; vN = rot(normal, ax, ang); vL = position; vTop = normal.y > 0.5 ? 1.0 : 0.0;
  vI = vec4(aA.w, aP.w, tau, aP.z > 1.0e8 ? 1.0 : 0.0);
  gl_Position = vec4(dot(rel, uCamRight) / (z * uTan.x), dot(rel, uCamUp) / (z * uTan.y), 0.0, 1.0);
}`;
const SLAB_FRAG = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
in vec3 vW; in vec3 vN; in vec3 vL; in float vTop; in vec4 vI;
out vec4 fragColor;
${GLSL_COMMON}
uniform sampler2D uG0, uWordTex;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform float uLock, uSlabHx, uSlabHz;
void main() {
  vec3 view = normalize(vW - uCamPos);
  if (dot(vN, view) > 0.0) discard;
  float tSurf = textureLod(uG0, gl_FragCoord.xy / uRes, 0.0).r;
  if (length(vW - uCamPos) > tSurf + 2.5) discard;
  vec3 N = normalize(vN);
  vec3 Lg = normalize(vec3(-0.35, 0.85, 0.40));
  float dif = clamp(dot(N, Lg), 0.0, 1.0);
  vec3 e = abs(vL) / vec3(uSlabHx, 2.0, uSlabHz);
  float e1 = max(max(min(e.x, e.y), min(e.y, e.z)), min(e.x, e.z));          // second largest component
  float edge = smoothstep(0.90, 0.985, e1);
  float S = 0.30 + 0.36 * dif + 0.5 * edge;
  float amber = 0.0;
  if (vTop > 0.5) {
    vec2 uv = vec2(vL.x / uSlabHx * 0.5 + 0.5, vL.z / uSlabHz * 0.5 + 0.5);
    float cell = vI.x;
    float a = texture(uWordTex, vec2((cell + uv.x) / 6.0, uv.y)).r;
    S = mix(S, 0.12 + 0.3 * dif, a * 0.85);
    amber = a * exp(-vI.z / 0.30) * step(0.001, vI.z);
    S += 0.18 * (1.0 - a) * (0.5 + 0.5 * sin(vL.x * 6.0 + vI.y * 40.0));
  }
  if (vI.w > 0.5 && vTop > 0.5) amber = max(amber, 0.95 * uLock);
  S += (hash12(floor(gl_FragCoord.xy) + vI.y * 37.0) - 0.5) * 0.06;
  float k = clamp(S, 0.0, 0.92);
  vec3 col = mix(C_INK, C_GRAPHITE, clamp(k / 0.35, 0.0, 1.0));
  col = mix(col, C_ASH, clamp((k - 0.35) / 0.25, 0.0, 1.0));
  col = mix(col, C_BONE, clamp((k - 0.60) / 0.32, 0.0, 1.0));
  col = mix(col, C_SIGNAL * (0.20 + 1.18 * clamp(S, 0.0, 1.0)), clamp(amber, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ canvases
function makeMark(): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 1024);
  const k = 1024 / 320;                                           // 3.2 px/mm; canvas (x, y) = wafer local (x, z)
  const text = 'LOT 7A-0042 S25';
  const fam = F.mono(600);
  c.font = font(fam, 2.6 * k * 1.35); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const R = 147.3 * k, cx = 512, cy = 512;
  const step = 2.35 * k / R;                                       // angular advance per glyph
  const a0 = Math.PI / 2 + 0.17 - (text.length * step) / 2 + 0.34;
  for (let i = 0; i < text.length; i++) {
    const a = a0 + i * step + step / 2;
    c.save(); c.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.rotate(a - Math.PI / 2 + Math.PI); c.fillText(text[i]!, 0, 0); c.restore();
  }
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
/** product label along the tray's right edge (text bottom to top); returns the texture and the u fractions */
function makeLabel(n: number): { tex: THREE.Texture; headEnd: number; tailStart: number; end: number } {
  const cv = document.createElement('canvas'); cv.width = LBL.cw; cv.height = LBL.ch;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, LBL.cw, LBL.ch);
  const head = 'PRODUCT: WAFER, SILICON, 300 mm', tail = n === 1 ? 'NOT A WEAPON' : n === 2 ? '(DUAL-USE)' : 'WEAPON';
  c.font = font(F.mono(500), 74); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left';
  (c as any).letterSpacing = '3px';
  const wh = c.measureText(head).width, wg = c.measureText('   ').width, wt = c.measureText(tail).width;
  const total = wh + wg + wt, x0 = (LBL.cw - total) / 2;
  c.fillText(head, x0, LBL.ch / 2 + 3); c.fillText(tail, x0 + wh + wg, LBL.ch / 2 + 3);
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return { tex: t, headEnd: (x0 + wh) / LBL.cw, tailStart: (x0 + wh + wg - 4) / LBL.cw, end: (x0 + total) / LBL.cw };
}
function makeWordTex(): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 6 * 128; cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  WORDS.forEach((w, i) => {
    const size = Math.min(40, 114 / (w.length * 0.62));
    c.font = font(F.mono(700), size);
    c.save(); c.translate(i * 128 + 64, 64); c.fillText(w, 0, 0); c.restore();
  });
  const t = new THREE.CanvasTexture(cv); t.flipY = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ camera script
interface Cam { tg: V3; az: number; el: number; ppm: number }
const L = (a: number, b: number, t: number) => a + (b - a) * t;

/** world centre of the wafer slide at rel time r (the pad with the grain rides with it) */
const slideX = (r: number) => -90 * (1 - ease.outCubic(clamp((r - 0.234) / 0.236)));
const GRAIN_L = { x: -94.5 + 2.4, z: 1.6 };

interface Priv {
  shotAt(r: number): { k: string; t0: number; t1: number };
  drawTPPBig(c: CanvasRenderingContext2D, s: number, fg: string, dim: string, bg: string | null, paper: boolean, blow: boolean): void;
  tinyTPP(c: CanvasRenderingContext2D, fg: string, dim: string): void;
  scanBar(lb: unknown, beatT: number): void;
  slam(s: number, amt: number, dur?: number): number;
}

export default class W1Wafer extends Drop {
  shade!: SEShade;
  strip = new SEStrip();
  uni!: Record<string, THREE.IUniform>;
  private texs: THREE.Texture[] = [];
  private slabScene = new THREE.Scene();
  private slabCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private slabMat!: THREE.RawShaderMaterial;
  private slabGeo!: THREE.InstancedBufferGeometry;
  private slabBase: { p: Float32Array; v: Float32Array; a: Float32Array; n: number } = { p: new Float32Array(0), v: new Float32Array(0), a: new Float32Array(0), n: 0 };
  private lbl!: ReturnType<typeof makeLabel>;
  override seGrade = 0;

  override async init() {
    await super.init();
    const n = this.n;
    const D = dies();
    // ---- per-die data: present, letter sink time, hash
    const arr = new Float32Array(COLS * ROWS * 4);
    const sink = new Map<number, number>();
    let li = 0, col = WORD_COL0;
    for (const ch of 'WAFER') {
      const g = GLYPH[ch]!;
      const base = li < 2 ? 0.47 : 0.703;
      for (let y = 0; y < 5; y++) for (let x = 0; x < g[0]!.length; x++) {
        if (g[y]![x] === 'X') sink.set((WORD_ROW0 + y) * COLS + (col + x), base + 0.035 * y + 0.012 * x + 0.02 * li);
      }
      col += g[0]!.length + 1; li++;
    }
    for (let i = 0; i < arr.length; i += 4) arr[i + 1] = 1e5;
    for (const d of D) {
      const o = (d.j * COLS + d.i) * 4;
      arr[o] = 1; arr[o + 1] = sink.get(d.j * COLS + d.i) ?? 1e5; arr[o + 2] = hash(d.i, d.j, 3);
    }
    const dieTex = new THREE.DataTexture(arr, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType);
    dieTex.minFilter = dieTex.magFilter = THREE.NearestFilter; dieTex.generateMipmaps = false; dieTex.needsUpdate = true;
    const mark = makeMark();
    this.lbl = makeLabel(n);
    const wordTex = makeWordTex();
    this.texs.push(dieTex, mark, this.lbl.tex, wordTex);
    const v = (x: number) => ({ value: x });
    this.uni = {
      uT: v(0), uN: v(n), uRot: v(0), uCross: v(0), uLock: v(0), uLblRev: v(0), uLblHold: v(n === 3 ? 1 : 0), uLblTailT: v(1.41),
      uWafPos: { value: new THREE.Vector3() }, uCut: { value: new THREE.Vector4(1e5, 1, 1e5, 1) }, uLb: { value: new THREE.Vector4(this.lbl.headEnd, this.lbl.tailStart, this.lbl.end, 0) },
      uDie: { value: dieTex }, uLbl: { value: this.lbl.tex }, uMark: { value: mark },
      uSaw: { value: new THREE.Vector4(500, 0, 0, 0) }, uGrain: { value: new THREE.Vector4(0, 0, 0, 1) },
    };
    this.shade = new SEShade({ mapGLSL: WORLD, shadeGLSL: SHADE, uniforms: this.uni, cavL: 2.4 });
    // ---- slabs (n=3)
    if (n === 3) {
      const m = D.length;
      const pp = new Float32Array(m * 4), vv = new Float32Array(m * 4), aa = new Float32Array(m * 4);
      D.forEach((d, i) => {
        const x = mm(d.x - WAFER.cx), z = mm(d.y - WAFER.cy);
        const rad = Math.hypot(x, z), ang = Math.atan2(z, x) + (hash(i, 5) - 0.5) * 0.7;
        const centre = d.i === COLC && d.j === ROWC;
        const wave = 0.70 + 1.15 * Math.pow(rad / 150, 1.1) + 0.12 * hash(i, 6);
        const sp = 70 + 150 * hash(i, 7);
        pp[i * 4] = x; pp[i * 4 + 1] = z; pp[i * 4 + 2] = centre ? 1e9 : wave; pp[i * 4 + 3] = hash(i, 8);
        vv[i * 4] = Math.cos(ang) * sp; vv[i * 4 + 1] = 160 + 520 * hash(i, 9); vv[i * 4 + 2] = Math.sin(ang) * sp; vv[i * 4 + 3] = (hash(i, 10) < 0.5 ? -1 : 1) * (2.5 + 7 * hash(i, 11));
        const ax = [hash(i, 12) - 0.5, hash(i, 13) - 0.5, hash(i, 14) - 0.5];
        aa[i * 4] = ax[0]!; aa[i * 4 + 1] = ax[1]!; aa[i * 4 + 2] = ax[2]!; aa[i * 4 + 3] = Math.floor(hash(i, 15) * 6);
      });
      this.slabBase = { p: pp, v: vv, a: aa, n: m };
      const box = new THREE.BoxGeometry(HALF.x * 2, 4, HALF.z * 2);
      this.slabGeo = new THREE.InstancedBufferGeometry();
      this.slabGeo.setAttribute('position', box.getAttribute('position'));
      this.slabGeo.setAttribute('normal', box.getAttribute('normal'));
      this.slabGeo.setIndex(box.getIndex());
      for (const [name, a] of [['aP', pp], ['aV', vv], ['aA', aa]] as const) this.slabGeo.setAttribute(name, new THREE.InstancedBufferAttribute(a.slice(), 4));
      this.slabGeo.instanceCount = m;
      const g = this.shade.gbuf.u;
      this.slabMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: SLAB_VERT, fragmentShader: SLAB_FRAG, side: THREE.DoubleSide,
        depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending,
        uniforms: {
          uT: this.uni.uT!, uRot: this.uni.uRot!, uWafPos: this.uni.uWafPos!, uLock: this.uni.uLock!,
          uCamPos: g.uCamPos!, uCamFwd: g.uCamFwd!, uCamRight: g.uCamRight!, uCamUp: g.uCamUp!, uTan: g.uTan!,
          uG0: { value: this.shade.gbuf.rt.textures[0] }, uRes: { value: new THREE.Vector2(W * SCALE * 0.5, H * SCALE * 0.5) },
          uWordTex: { value: wordTex }, uSlabHx: { value: HALF.x }, uSlabHz: { value: HALF.z },
        },
      });
      const mesh = new THREE.Mesh(this.slabGeo, this.slabMat);
      mesh.frustumCulled = false;
      this.slabScene.add(mesh);
    }
  }

  // ---- slab position at time t (mirror of the vertex shader), for painter's order
  private slabPos(i: number, t: number, rot: number, wx: number): V3 {
    const { p, v } = this.slabBase;
    const tau = Math.max(t - p[i * 4 + 2]!, 0), e = (1 - Math.exp(-1.5 * tau)) / 1.5;
    const c = Math.cos(rot), s = Math.sin(rot);
    return [p[i * 4]! * c + p[i * 4 + 1]! * s + wx + v[i * 4]! * e, -2 + v[i * 4 + 1]! * e, -p[i * 4]! * s + p[i * 4 + 1]! * c + v[i * 4 + 2]! * e];
  }

  /** camera for the 3D shots */
  private camFor(k: string, r: number, s: number, T: number, wx: number): Cam {
    const q = clamp(s / Math.max(T, 1e-3));
    const gy = this.n === 3 ? 0 : PADH;
    switch (k) {
      case 'ev1': case 'ev2': {
        const e = smoothstep(0.15, 0.47, r), eo = e * e * (3 - 2 * e);
        const g: V3 = [wx + GRAIN_L.x, gy, GRAIN_L.z];
        return { tg: [L(g[0], 0, eo), L(g[1], 0, eo), L(g[2], 6, eo)], az: L(-14, -22, eo), el: L(36, 52, eo), ppm: Math.exp(L(Math.log(88), Math.log(2.55), eo)) };
      }
      case 'wa1': return { tg: [0, -1, 8], az: L(-22, -16, q), el: L(52, 46, q), ppm: L(2.55, 2.75, q) };
      case 'wa2': return { tg: [0, 0, -34], az: L(22, 28, q), el: L(27, 24, q), ppm: L(4.1, 4.5, q) };
      case 'is': return { tg: [0, 0, 0], az: 0, el: 80, ppm: L(2.8, 3.0, q) };
      case 'a': return { tg: [L(0, 6, q), 0, L(-30, -118, q)], az: L(-40, -30, q), el: L(58, 52, q), ppm: L(3.5, 4.1, q) };
      case 'we1': { const e = ease.inOutCubic(q); return { tg: [0, 0, 0], az: L(-10, 0, e), el: L(38, 90, e), ppm: L(2.7, 3.13, e) }; }
      case 'we2': return { tg: [0, 0, 0], az: 0, el: 90, ppm: L(3.13, 3.9, ease.outCubic(q)) };
      case 'now': return { tg: [0, 0, 0], az: 0, el: 90, ppm: L(3.9, 3.13, ease.outExpo(clamp(s / 0.2))) };
      case 'end': { const u = clamp(q / 0.5); return { tg: [0, 0, 0], az: 0, el: 90, ppm: Math.exp(L(Math.log(3.13), Math.log(25.4), u * u)) }; }
      default: return { tg: [0, 0, 0], az: 0, el: 90, ppm: 3.13 };
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const P = this as unknown as Priv;
    const n = this.n, r = f.t - this.T0;
    const shot = P.shotAt(r);
    const k = shot.k, s = r - shot.t0, T = shot.t1 - shot.t0;
    if (n === 2 && (k === 'tpp' || k === 'end')) return super.render(f, out);   // drop.ts: inverted TPP, then the kerf opens

    const { renderer, comp } = this.ctx;
    const kick = f.a.kick;
    const u = this.uni;
    const wx = slideX(r);
    // ---- wafer state
    let yaw = 0;
    if (n === 1) yaw = Math.PI * ease.inOutCubic(clamp((r - 0.94) / 0.47));
    else if (n === 2) yaw = (Math.PI / 2) * ease.inOutCubic(clamp((r - 1.27) / 0.13));
    const dtH = 0.047, dtV = 0.04;
    const cut = n === 2 ? [0.47 - 2 * dtH, dtH, 1.41 - 2 * dtV, dtV] : [1e5, 1, 1e5, 1];
    u.uT!.value = r; u.uRot!.value = yaw;
    (u.uWafPos!.value as THREE.Vector3).set(wx, 0, 0);
    (u.uCut!.value as THREE.Vector4).set(cut[0]!, cut[1]!, cut[2]!, cut[3]!);
    u.uCross!.value = ease.outExpo(clamp((r - 1.41) / 0.22));
    u.uLock!.value = ease.outExpo(clamp((r - 1.875) / 0.2));
    // label: head written from 'wafer', tail on 'weapon'
    const lb = this.lbl;
    const ph = clamp((r - 0.5) / 0.42), pt = clamp((r - 1.41) / 0.36);
    u.uLblRev!.value = r < 1.41 ? lb.headEnd * ph : lb.tailStart + (lb.end - lb.tailStart) * pt + 0.002;
    u.uLblTailT!.value = 1.41;
    // saw
    const sw = u.uSaw!.value as THREE.Vector4;
    sw.set(500, 0, 0, 0);
    if (n === 2) {
      let tK = -1, zc = 0, dur = 0;
      if (r < cut[2]!) { const m = Math.floor((r - cut[0]!) / dtH); if (m >= 2 && m <= 19) { tK = cut[0]! + m * dtH; zc = ORG.z + (m - 0.5) * PITCH.z; dur = dtH * 0.8; } }
      else { const m = Math.floor((r - cut[2]!) / dtV); if (m >= 2 && m <= 23) { tK = cut[2]! + m * dtV; zc = -(ORG.x + (m - 0.5) * PITCH.x); dur = dtV * 0.8; } }
      if (tK >= 0) { const qq = clamp((r - tK) / dur); if (qq < 1) sw.set(L(-175, 175, qq), zc, r * 80, 1); }
    }
    // grain: falls on the pad, then rides the wafer
    const gp = u.uGrain!.value as THREE.Vector4;
    const gy0 = n === 3 ? 0 : PADH;
    const fall = r < 0.11 ? 1 - (r / 0.11) ** 2 : 0;
    const bounce = r > 0.11 && r < 0.17 ? 0.9 * Math.sin(((r - 0.11) / 0.06) * Math.PI) : 0;
    gp.set(wx + GRAIN_L.x, gy0 + 1.0 + 15 * fall + bounce, GRAIN_L.z, r < 1.2 ? 1 : 0);

    // ---- camera, G-buffer, shade
    const cam3 = this.camFor(k, r, s, T, wx);
    const cam: SECam = seCamera(cam3.tg, cam3.az, cam3.el, cam3.ppm);
    const camB = this.camFor(k, r + 1 / 30, s + 1 / 30, T, slideX(r + 1 / 30));
    const dm = Math.abs(Math.log(camB.ppm / cam3.ppm)) * 6 + Math.hypot(camB.tg[0] - cam3.tg[0], camB.tg[2] - cam3.tg[2]) / 20 + Math.abs(camB.el - cam3.el) / 60;
    const motion = clamp(0.22 + dm, 0, 1);
    const qEnd = k === 'end' ? s / T : 0;
    const dive = k === 'end' && qEnd >= 0.5;
    const tppK = k === 'tpp';

    let shaded = false;
    if (!dive) {
      this.shade.render(renderer, out, cam, { frame: frameIdx(f.t), motion, kick, reveal: 2, dim: 0.42, rim: 0.95, focus: cam.dist * 0.72, hazeL: 520, zHaze: 0.32 });
      shaded = true;
      if (n === 3) this.drawSlabs(renderer, out, cam, r, yaw, wx);
      const ppm = H / 2 / (cam.dist * cam.tanY);
      this.strip.composite(renderer, comp, out, { ppm, alpha: k === 'end' ? 1 - smoothstep(0.1, 0.45, qEnd) : 1, lot: '7A-0042' });
    }

    // ---- 2D layer: the odometer (reuse of drop.ts), the small readout, the scan bar
    const lay = this.layer, c = lay.ctx;
    lay.clear(); this.beam.clear(); this.beamN.clear();
    let shakeAmp = 0, flash = 0, ca = 0.9;
    const cutIdx = k === 'ev1' || k === 'ev2' ? 0 : 1;
    void cutIdx;
    const amp = (a: number[]) => a[n - 1]!;
    if (k === 'ev1') shakeAmp = amp([10, 16, 26]);
    else if (k === 'ev2') shakeAmp = amp([14, 22, 34]);
    else if (k === 'wa1' || k === 'wa2') shakeAmp = amp([8, 14, 24]);
    else if (k === 'is') shakeAmp = 4;
    else if (k === 'a') shakeAmp = 7;
    else if (k === 'we1' || k === 'we2') { shakeAmp = amp([26, 36, 50]) * (k === 'we2' ? 1.2 : 1); ca = 3.2; }
    else if (k === 'now') {
      shakeAmp = amp([30, 36, 54]); flash = 0.6; ca = 4;
      c.save(); c.translate(96, H - 150); P.tinyTPP(c, HEX.bone, 'rgba(238,233,223,0.4)'); c.restore();
      P.scanBar(this.beam, s / BEAT);
    } else if (tppK) {
      const nowS = this.shots.find((x) => x.k === 'now')!;
      c.fillStyle = 'rgba(10,10,11,0.9)'; c.fillRect(0, 0, W, H);
      P.drawTPPBig(c, s, HEX.bone, 'rgba(238,233,223,0.4)', null, false, true);
      P.scanBar(this.beam, (r - nowS.t0) / BEAT);
      const cross = this.tpp[1] >= 4800 && this.tpp[0] < 4800;
      shakeAmp = pulse(s, 0.12, 0.05) * 22 + pulse(s, 0.0, 0.05) * 18 + (cross ? 0 : 0);
      if (!isFinite(this.tpp[1])) shakeAmp = 22 + pulse(s, 0.5, 0.06) * 60;
      ca = 2.5 + 3 * pulse(s, 0.12, 0.08);
    } else if (k === 'end') { shakeAmp = 6; ca = 1.6; }

    if (dive) {
      // match cut: the die-dive lattice (drop-lattice) from the die's own scale to zoom 90
      const prog = clamp((qEnd - 0.5) / 0.5);
      const Z = 4.9 * Math.pow(90 / 4.9, ease.inExpo(prog) * 0.9 + 0.1 * prog);
      const pu = this.pass.u;
      pu.uBg!.value = new THREE.Vector3(0, 0, 0); pu.uBgHatch!.value = 0; pu.uMode!.value = 0;
      pu.uDieZoom!.value = qEnd >= 1 - 1e-6 ? 90 : Z; pu.uPitch!.value = 70; pu.uDieFade!.value = 1; pu.uTime!.value = f.t;
      (pu.uC!.value as THREE.Vector2).set(W / 2, H / 2);
      this.pass.render(renderer, out);
    } else if (!shaded) this.pass.render(renderer, out);
    comp.draw(renderer, lay.upload(), out);
    if (this.beam.count) this.beam.render(renderer, out);

    // ---- post: shake + flash + CA on the hits (the engine's grade is ours in the 3D shots)
    const fi = frameIdx(f.t);
    const e = pulse(s, 0, 0.065);
    const shx = (hash(fi, 3) - 0.5) * 2 * shakeAmp * e, shy = (hash(fi, 4) - 0.5) * 2 * shakeAmp * e;
    let fl = s < 0.14 ? flash * pulse(s, 0, 0.022) : 0;
    if (r < 0.2 && k === 'ev1') fl = Math.max(fl, r < 0.12 ? 1.35 * pulse(r, 0, 0.03) : 0);
    const inv = k === 'now' && s < 2 / 60 + 1e-4 ? 1 : 0;
    const post = sePost({ shake: [shx, shy], flash: fl, invert: inv, ca: ca * (0.5 + 0.5 * e) + 0.6, zoom: 1 + 0.025 * e, bloom: 0.6 + 0.22 * e });
    if (dive || tppK) { post.se = dive ? 1 : 0.5; post.grain = 0.055; post.vignette = 0.3; post.halation = 0.18; post.bloomThreshold = 1.05; }
    return post;
  }

  private drawSlabs(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: SECam, r: number, yaw: number, wx: number) {
    const { n, p, v, a } = this.slabBase;
    if (!n) return;
    const order: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const w = this.slabPos(i, r, yaw, wx);
      order.push([(w[0] - cam.pos[0]) * cam.fwd[0] + (w[1] - cam.pos[1]) * cam.fwd[1] + (w[2] - cam.pos[2]) * cam.fwd[2], i]);
    }
    order.sort((x, y) => y[0] - x[0]);                    // far to near
    const attrs = ['aP', 'aV', 'aA'] as const, srcs = [p, v, a];
    attrs.forEach((nm, j) => {
      const at = this.slabGeo.getAttribute(nm) as THREE.InstancedBufferAttribute;
      const dst = at.array as Float32Array, src = srcs[j]!;
      order.forEach(([, i], o) => { for (let q = 0; q < 4; q++) dst[o * 4 + q] = src[i * 4 + q]!; });
      at.needsUpdate = true;
    });
    renderer.setRenderTarget(out);
    renderer.render(this.slabScene, this.slabCam);
  }

  override dispose() {
    this.shade.dispose();
    this.slabGeo?.dispose(); this.slabMat?.dispose();
    for (const t of this.texs) t.dispose();
  }
}
