// SE-look (docs/reference/GAP.md 3.2): one rendering language for the whole film, a scanning-electron-micrograph.
//
//  - SDF library (GLSL): primitives, ops, domain repetition, twist/bend, tetrahedral normal + curvature, cavity,
//    detector shadow and a step-budgeted sphere tracer, all written against a scene-supplied `map()`.
//  - SEGBuffer: half-resolution MRT G-buffer pass (ray distance, signal contrast Z, material/amber, curvature,
//    normal, cavity) from that map.
//  - SEShade (`semShade`): signal model S = Z * tilt * detector * cavity (+ rim), bone rim on every edge from a
//    half-res edge pass, depth as signal loss, ink -> graphite -> ash -> bone ramp (never white), amber only as a
//    mask, raster shot-noise grain (noisier while the camera moves, clean on holds, line jitter and tears), dust.
//  - SEGrade (`semGrade`): the colour-agnostic retrofit applied to any finished plate by Post (post.ts): luminance
//    to the same ramp, rim from luminance, the same scan grain, vignette; amber (and export red) survive via masks.
//  - SEStrip: the 54 px data strip footer. seCamera/seProject: the orbit camera shared by pass and overlays.
//
// Usage. A hero world (see scenes/w7-shield.ts):
//   const shade = new SEShade({ mapGLSL, shadeGLSL, uniforms });     // mapGLSL defines map(), seBounds(), matZ(), matAmber()
//   shade.render(renderer, out, seCamera(target, azDeg, elDeg, pxPerUnit), { frame: frameIdx(t), motion, kick, ... });
//   return sePost({ ... });                                          // se: 0 (no retrofit on top), amber-only bloom, no film grain
// Every other plate is retrofitted by Post (PostParams.se = 1, strength 0..1); opt out with Scene.seGrade = 0 or `se: 0`.
//
// Signal units: S in 0..1 (ink 0, graphite 0.35, ash 0.60, bone 0.92). All output is linear HDR; amber is
// written a little above 1 so that it (and only it) blooms.
import * as THREE from 'three';
import { FSPass, Layer2D, SCALE, SS_TAP, W, H, type Compositor } from './gl';
import { GLSL_COMMON } from './glsl/common';
import { F, font } from './type';
import type { PostOverrides } from './scene';

/** Material signal contrast Z (GAP 3.2) and the ids packed into the G-buffer. */
export const SE = {
  Z: { tape: 0.12, resist: 0.3, oxide: 0.3, silicon: 0.5, metal: 0.85 },
  MAT: { silicon: 0, metal: 1, tape: 2, oxide: 3, resist: 4, ink: 5, beam: 6 },
  /** detector azimuth (degrees, in the image plane, 0 = +x, counter-clockwise) */
  DET_AZ: 215,
} as const;

// ------------------------------------------------------------------------------------------------ GLSL: materials
export const SE_MATS_GLSL = /* glsl */ `
#define SE_SILICON 0.0
#define SE_METAL 1.0
#define SE_TAPE 2.0
#define SE_OXIDE 3.0
#define SE_RESIST 4.0
#define SE_INK 5.0
#define SE_BEAM 6.0
/** default signal contrast of the library materials (ids >= 7 are scene-defined). */
float seMatZ(float id) {
  return id < 0.5 ? 0.50 : id < 1.5 ? 0.85 : id < 2.5 ? 0.12 : id < 3.5 ? 0.30 : id < 4.5 ? 0.30 : id < 5.5 ? 0.0 : 1.25;
}`;

// ------------------------------------------------------------------------------------------------ GLSL: SDF library
export const SE_SDF_GLSL = /* glsl */ `
// ---- primitives (any unit; prefix se*) ----
float seRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float seRoundBox2(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
/** capped cylinder along y: radius r, half height h */
float seCylY(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
/** same with rounded rim (radius rr) */
float seCylYR(vec3 p, float r, float h, float rr) {
  vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr;
}
/** capped cylinder between points a and b (exact, any axis) */
float seCylAxis(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ba = b - a, pa = p - a;
  float baba = dot(ba, ba), paba = dot(pa, ba);
  float x = length(pa * baba - ba * paba) - r * baba;
  float y = abs(paba - baba * 0.5) - baba * 0.5;
  float x2 = x * x, y2 = y * y * baba;
  float d = (max(x, y) < 0.0) ? -min(x2, y2) : (((x > 0.0) ? x2 : 0.0) + ((y > 0.0) ? y2 : 0.0));
  return sign(d) * sqrt(abs(d)) / baba;
}
/** vertical capsule from y=0 to y=h */
float seCapsuleY(vec3 p, float h, float r) { p.y -= clamp(p.y, 0.0, h); return length(p) - r; }
/** torus around the y axis (major R, minor r) */
float seTorusY(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
float seEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
float seTri2(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
/** prism: 2D distance d2 extruded over y in [y0, y1] */
float seExtrude(float d2, float y, float y0, float y1) {
  vec2 w = vec2(d2, abs(y - 0.5 * (y0 + y1)) - 0.5 * (y1 - y0));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

// ---- booleans (x = distance, y = material id) ----
vec2 seUnion(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
vec2 seSmoothUnion(vec2 a, vec2 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);
  return vec2(mix(b.x, a.x, h) - k * h * (1.0 - h), h > 0.5 ? a.y : b.y);
}
/** a minus b (keeps a's material), sharp */
vec2 seSubtract(vec2 a, float db) { return vec2(max(a.x, -db), a.y); }
/** a minus b, smooth fillet of radius k */
vec2 seSmoothSubtract(vec2 a, float db, float k) {
  float h = clamp(0.5 - 0.5 * (a.x + db) / k, 0.0, 1.0);
  return vec2(mix(a.x, -db, h) + k * h * (1.0 - h), a.y);
}
vec2 seIntersect(vec2 a, float db) { return vec2(max(a.x, db), a.y); }

// ---- domain operations ----
/** periodic coordinate in [-s/2, s/2) */
float seRep(float x, float s) { return x - s * floor(x / s + 0.5); }
vec2 seRep2(vec2 p, vec2 s) { return p - s * floor(p / s + 0.5); }
vec3 seRep3(vec3 p, vec3 s) { return p - s * floor(p / s + 0.5); }
/** repetition limited to +-l copies */
vec3 seRepLim(vec3 p, float s, vec3 l) { return p - s * clamp(floor(p / s + 0.5), -l, l); }
float seRepId(float x, float s) { return floor(x / s + 0.5); }
/** twist around y by k radians per unit height */
vec3 seTwistY(vec3 p, float k) { float c = cos(k * p.y), s = sin(k * p.y); return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z); }
/** bend along x by k radians per unit length (about the z axis) */
vec3 seBendX(vec3 p, float k) { float c = cos(k * p.x), s = sin(k * p.x); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
mat3 seRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 seRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 seRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
`;

// ------------------------------------------------------------------------------------------------ GLSL: tracer
// Written against the scene's map(): vec2 (distance, material id). Order matters: after the scene code.
export const SE_TRACE_GLSL = /* glsl */ `
#ifndef SE_STEPS
#define SE_STEPS 90
#endif
#ifndef SE_RELAX
#define SE_RELAX 0.92
#endif
#ifndef SE_EPS
#define SE_EPS 0.5
#endif
#ifndef SE_SHADOW_STEPS
#define SE_SHADOW_STEPS 9
#endif
uniform float uPixAng;   // tan(fovY/2) / (G-buffer half height in px): ray angle per G-buffer px
uniform float uCavL;     // cavity length L (world units): ~0.3 x feature width
uniform vec3 uDetDir;    // world direction from the surface toward the side detector

/** Tetrahedral normal and mean curvature (sum of principal curvatures, + convex) from the same 4 taps. */
vec3 seNormalCurv(vec3 p, float e, float d0, out float curv) {
  const vec3 k1 = vec3(1.0, -1.0, -1.0), k2 = vec3(-1.0, -1.0, 1.0), k3 = vec3(-1.0, 1.0, -1.0), k4 = vec3(1.0, 1.0, 1.0);
  float d1 = map(p + k1 * e).x, d2 = map(p + k2 * e).x, d3 = map(p + k3 * e).x, d4 = map(p + k4 * e).x;
  curv = 2.0 * (0.25 * (d1 + d2 + d3 + d4) - d0) / (e * e);
  return normalize(k1 * d1 + k2 * d2 + k3 * d3 + k4 * d4);
}
vec3 seNormal(vec3 p, float e) { float c; return seNormalCurv(p, e, map(p).x, c); }

/** Cavity (1 open .. 0 enclosed): the SE signal loss in trenches and slots, exp(-h/L) from 3 taps along the normal. */
float seCavity(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 0; i < 3; i++) {
    float h = uCavL * (0.25 + 1.1 * float(i));
    occ += clamp((h - map(p + n * h).x) / h, 0.0, 1.0) * w;
    w *= 0.62;
  }
  return exp(-1.15 * occ);
}
/** Soft shadow toward the detector: the side detector cannot see into the lee of a tall form. */
float seDetShadow(vec3 p, vec3 n) {
  vec3 ro = p + n * 0.35;
  float res = 1.0, t = 0.5;
  for (int i = 0; i < SE_SHADOW_STEPS; i++) {
    float h = map(ro + uDetDir * t).x;
    res = min(res, 5.0 * h / t);
    t += clamp(h, 0.6, 8.0);
    if (res < 0.02 || t > 160.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
/** Generic ambient occlusion (1 open .. 0 enclosed): 5 taps along the normal out to length L. */
float seAO(vec3 p, vec3 n, float L) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = L * (0.08 + 0.92 * float(i) / 4.0);
    occ += clamp((h - map(p + n * h).x) / h, 0.0, 1.0) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 0.45 * occ, 0.0, 1.0);
}
/** Generic soft shadow along rd from ro: k ~ 2 (soft) .. 16 (hard). Step-budgeted like the tracer. */
float seSoftShadow(vec3 ro, vec3 rd, float t0, float t1, float k) {
  float res = 1.0, t = t0;
  for (int i = 0; i < SE_SHADOW_STEPS * 2; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, k * h / t);
    t += clamp(h, 0.01 * t, 0.25 * t1);
    if (res < 0.005 || t > t1) break;
  }
  return clamp(res, 0.0, 1.0);
}
/** Step-budgeted sphere tracer. Returns (t, material id, steps used / budget); t < 0 = miss. */
vec3 seTrace(vec3 ro, vec3 rd, float t0, float t1) {
  float t = t0;
  for (int i = 0; i < SE_STEPS; i++) {
    vec2 h = map(ro + rd * t);
    float eps = uPixAng * t * SE_EPS + 0.002;
    if (h.x < eps) return vec3(t, h.y, float(i) / float(SE_STEPS));
    t += h.x * SE_RELAX;
    if (t > t1) return vec3(-1.0, 0.0, float(i) / float(SE_STEPS));
  }
  // budget exhausted: a grazing ray hugging a surface counts as a hit when it is close enough
  vec2 h = map(ro + rd * t);
  if (h.x < uPixAng * t * 3.0) return vec3(t, h.y, 1.0);
  return vec3(-1.0, 0.0, 1.0);
}
`;

/** The G-buffer pass: one ray per half-res texel; writes (t, Z, id+amber, curvature) and (normal, cavity). */
function gbufferFrag(userGLSL: string) {
  return /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
layout(location = 0) out highp vec4 gb0;
layout(location = 1) out highp vec4 gb1;
${GLSL_COMMON}
${SE_MATS_GLSL}
${SE_SDF_GLSL}
uniform int ssTap;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform vec2 uTan, uGres;
${userGLSL}
${SE_TRACE_GLSL}
void main() {
  vec2 jit = ssTap >= 0 ? rgss(ssTap) : vec2(0.0);
  vec2 nd = ((gl_FragCoord.xy + jit) / uGres) * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * (nd.x * uTan.x) + uCamUp * (nd.y * uTan.y));
  vec3 ro = uCamPos;
  gb0 = vec4(1.0e4, 0.0, 0.0, 0.0);
  gb1 = vec4(0.0, 1.0, 0.0, 1.0);
  float t0, t1;
  if (!seBounds(ro, rd, t0, t1)) return;
  vec3 h = seTrace(ro, rd, t0, t1);
  if (h.x < 0.0) return;
  vec3 p = ro + rd * h.x;
  float e = max(0.12, h.x * uPixAng * 1.4);
  float curv;
  vec3 n = seNormalCurv(p, e, map(p).x, curv);
  float cav = seCavity(p, n);
  #ifdef SE_SHADOW
  cav *= mix(1.0, seDetShadow(p, n), float(SE_SHADOW));
  #endif
  float id = floor(h.y + 0.5);
  float amb = clamp(matAmber(id, p, n), 0.0, 0.99);
  gb0 = vec4(h.x, matZ(id, p, n), id + amb, clamp(curv, -8.0, 8.0));
  gb1 = vec4(n, cav);
}`;
}

// ------------------------------------------------------------------------------------------------ GLSL: ramp + scan
export const SE_RAMP_GLSL = /* glsl */ `
uniform float uContrast;   // 1.15 about 0.4
/** ink -> graphite -> ash -> bone in linear light; clips at bone (never white). */
vec3 seRamp(float s) {
  s = max(0.4 + (s - 0.4) * uContrast, 0.0);
  vec3 c = mix(C_INK, C_GRAPHITE, clamp(s / 0.35, 0.0, 1.0));
  c = mix(c, C_ASH, clamp((s - 0.35) / 0.25, 0.0, 1.0));
  return mix(c, C_BONE, clamp((s - 0.60) / 0.32, 0.0, 1.0));
}
/** amber element-map colour: bright where the signal is, a dim umber where it is not; > 1 so only amber blooms */
vec3 seAmberTone(float s) { return C_SIGNAL * (0.20 + 1.18 * clamp(s, 0.0, 1.0)); }`;

export const SE_SCAN_GLSL = /* glsl */ `
uniform float uFrame;     // output frame index (constant over the motion-blur shutter)
uniform float uMotion;    // 0..1 camera / scene motion (1 = moving: full grain; 0 = hold: clean)
uniform float uKick;      // kick pulse 0..1 (re-noises for ~80 ms)
uniform float uVig;       // detector vignette strength (0.30)
uniform float uDust;      // dust density per px (0.0008)
float seMotionK() { return max(uMotion, uKick); }
float seN(vec2 c) { return (hash12(c) + hash12(c + 37.7) - 1.0) * 2.449; }   // ~ N(0, 1)
/** per-row horizontal jitter of the scan, px (sigma 0.35) */
float seRowJitter(float row) {
  return seN(vec2(row * 1.37, uFrame * 5.71 + 3.0)) * 0.35 * (0.45 + 0.55 * seMotionK());
}
/** a line tear (+-3 px) on one row about every 55 rows (random phase per frame) */
float seTear(float row) {
  const float P = 55.0;
  float ph = hash11(uFrame * 0.173) * P;
  float k = floor((row + ph) / P);
  float at = k * P - ph + floor(hash12(vec2(k, uFrame * 0.37 + 11.0)) * P);
  float on = step(abs(row - at), 0.5) * step(0.62, hash12(vec2(k + 71.0, uFrame * 0.61)));
  return on * (hash12(vec2(k, uFrame + 5.0)) - 0.5) * 5.0 * (0.3 + 0.7 * seMotionK());
}
/** shot noise, correlated ~4 px along the scan: sigma = 0.045 / sqrt(S + 0.04), x (0.35 + 0.65 motion) */
float seGrain(vec2 pL, float S, float extra) {
  float row = floor(pL.y), fr = uFrame * 13.17;
  float x4 = pL.x * 0.25, i = floor(x4), f = x4 - i;
  f = f * f * (3.0 - 2.0 * f);
  float nc = mix(seN(vec2(i + fr, row)), seN(vec2(i + 1.0 + fr, row)), f);
  float nf = seN(vec2(floor(pL.x) * 1.31 + fr + 911.0, row + 0.37));
  float n = 0.80 * nc + 0.55 * nf;
  float sig = 0.045 / sqrt(max(S, 0.0) + 0.04) * (0.35 + 0.65 * seMotionK()) * (1.0 + extra);
  sig *= 0.25 + 0.75 * smoothstep(0.0, 0.15, S);   // the ink stays ink
  return n * sig;
}
/** sparse bright specks with a 1 px halo: the film is full of sand */
float seDustAdd(vec2 pL) {
  vec2 cell = floor(pL / 4.0);
  vec2 id = cell + floor(uFrame / 14.0) * vec2(23.1, 41.7);
  float h = hash12(id);
  if (h > uDust * 16.0) return 0.0;
  vec2 c = cell * 4.0 + 0.5 + hash22(id + 5.0) * 3.0;
  vec2 d = pL + 0.5 - c;
  float r2 = dot(d, d);
  return (exp(-r2 / 0.30) + 0.22 * exp(-r2 / 2.4)) * (0.35 + 0.65 * hash12(id + 9.0));
}
`;

// ------------------------------------------------------------------------------------------------ GLSL: shading
// Edge pass (half res): bone rim on the near side of silhouettes and convex creases, dark contact on the far side.
const EDGE_FRAG = /* glsl */ `
uniform sampler2D uG0, uG1;
uniform vec2 uGres, uTan;
uniform vec3 uCamFwd, uCamRight, uCamUp;
uniform float uPixAng;
vec3 rayAt(ivec2 i) {
  vec2 nd = ((vec2(i) + 0.5) / uGres) * 2.0 - 1.0;
  return normalize(uCamFwd + uCamRight * (nd.x * uTan.x) + uCamUp * (nd.y * uTan.y));
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy), lim = ivec2(uGres) - 1;
  vec4 a = texelFetch(uG0, c, 0), b = texelFetch(uG1, c, 0);
  float t = a.r;
  if (t > 5.0e3) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 n = b.xyz, rc = rayAt(c), pc = rc * t;
  float thr = t * uPixAng * 2.5 + 0.7;
  float nd = dot(n, pc);
  float rim = 0.0, crease = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec2 o = k == 0 ? ivec2(-1, 0) : k == 1 ? ivec2(1, 0) : k == 2 ? ivec2(0, -1) : k == 3 ? ivec2(0, 1)
            : k == 4 ? ivec2(-1, -1) : k == 5 ? ivec2(1, -1) : k == 6 ? ivec2(-1, 1) : ivec2(1, 1);
    float w = k < 4 ? 1.0 : 0.72;
    ivec2 q = clamp(c + o, ivec2(0), lim);
    vec4 a2 = texelFetch(uG0, q, 0), b2 = texelFetch(uG1, q, 0);
    float t2 = a2.r;
    if (t2 > 5.0e3) { rim = max(rim, w); continue; }
    vec3 r2 = rayAt(q);
    // where this surface's tangent plane would put the neighbour: a real step is a depth jump off that plane
    float den = dot(n, r2);
    float tp = abs(den) > 0.06 ? nd / den : t;
    float dz = t2 - tp;
    if (dz > thr) rim = max(rim, smoothstep(thr, 2.0 * thr, dz) * w);
    else if (dz < -thr) crease = max(crease, smoothstep(thr, 2.0 * thr, -dz) * w * 0.7);
    else {
      float s = smoothstep(0.30, 0.55, acos(clamp(dot(n, b2.xyz), -1.0, 1.0)));
      float cv = dot(n - b2.xyz, pc - r2 * t2);
      if (cv > 0.0) rim = max(rim, s * w); else crease = max(crease, s * w);
    }
  }
  fragColor = vec4(rim, crease, 0.0, 1.0);
}`;

const SHADE_MAIN = /* glsl */ `
uniform sampler2D uG0, uG1, uEdge;
uniform vec2 uGres, uTan;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uRimGain;    // 0..1 rim strength (1 = 1.6 above the base signal)
uniform float uHaze;       // depth haze strength (0.35)
uniform float uHazeL;      // haze length
uniform float uFocus;      // distance with no haze
uniform float uAmberGain;
uniform float uReveal;     // raster reveal: rows above this fraction are built (>1 = all), below show uDim
uniform float uDim;
uniform float uCurvGain;
const vec2 SE_DETD = vec2(-0.81915, -0.57358);   // detector azimuth 215 degrees

// ---- material micro-texture: silicon 4%, SiO2 smooth with charging gloss, metal grain +-12%, resist porous 10%
float seMicro(float id, float Z, vec3 p, vec3 n, float fw) {
  float m = 1.0;
  if (Z < 0.04) return m;
  if (id < 0.5 || id > 6.5) {
    float a1 = 1.0 - smoothstep(0.35, 0.9, fw * 0.9);
    m += 0.050 * a1 * snoise(p * 0.9);
    if (fw < 0.26) m += 0.025 * (1.0 - smoothstep(0.35, 0.9, fw * 3.4)) * snoise(p * 3.4 + 7.0);
  } else if (id < 1.5) {
    // metal: polycrystalline grain (cell brightness) with darker boundaries, on the dominant face plane
    vec3 an = abs(n);
    vec2 q = (an.y > 0.6 ? p.xz : (an.x > an.z ? p.zy : p.xy)) / 1.3;
    float aa = 1.0 - smoothstep(0.4, 0.95, fw / 1.3);
    float n1 = snoise(q * 1.15 + 3.0);
    float ridge = 1.0 - smoothstep(0.0, 0.10, abs(n1));
    m += aa * (0.11 * snoise(q * 0.62 + 9.0) - 0.12 * ridge);
  } else if (id < 2.5) {
    float a1 = 1.0 - smoothstep(0.35, 0.9, fw * 2.5);
    m += 0.30 * a1 * snoise(vec3(p.x * 0.5, p.y * 2.2, p.z * 2.6) * 1.8);
  } else if (id < 3.5) {
    // oxide / quartz: smooth with charging gloss and bright conchoidal facets
    vec3 an = abs(n);
    vec2 q = (an.y > 0.6 ? p.xz : (an.x > an.z ? p.zy : p.xy)) / 0.85;
    float cid = hash12(floor(q) + 2.3);
    float aa = 1.0 - smoothstep(0.4, 0.95, fw / 0.85);
    m += aa * (0.34 * (cid - 0.5) + 0.55 * step(0.93, cid)) + 0.05 * snoise(p * 0.31);
  } else if (id < 4.5) {
    float a1 = 1.0 - smoothstep(0.35, 0.9, fw * 3.0);
    m += 0.10 * a1 * snoise(p * 3.0 + 2.0);
  }
  return m;
}

vec3 seRayDir(vec2 uv) {
  vec2 nd = uv * 2.0 - 1.0;
  return normalize(uCamFwd + uCamRight * (nd.x * uTan.x) + uCamUp * (nd.y * uTan.y));
}

void main() {
  vec2 pL = floor(FRAG_PX);
  float row = floor(1080.0 - FRAG_PX.y);
  float rowF = row / 1080.0;
  float jx = seRowJitter(row) + seTear(row);
  vec2 uv = vUv + vec2(jx / 1920.0, 0.0);

  // ---- depth/normal-aware upsample of the half-res G-buffer
  vec2 gp = uv * uGres - 0.5;
  ivec2 i0 = ivec2(floor(gp)), lim = ivec2(uGres) - 1;
  vec2 fr = gp - vec2(i0);
  vec4 A[4], B[4];
  for (int k = 0; k < 4; k++) {
    ivec2 q = clamp(i0 + ivec2(k & 1, k >> 1), ivec2(0), lim);
    A[k] = texelFetch(uG0, q, 0); B[k] = texelFetch(uG1, q, 0);
  }
  int rf = (fr.x > 0.5 ? 1 : 0) + (fr.y > 0.5 ? 2 : 0);
  float tRef = A[rf].r; vec3 nRef = B[rf].xyz; float idRef = floor(A[rf].b + 1.0e-3);
  bool missRef = tRef > 5.0e3;
  vec4 GA = vec4(0.0), GB = vec4(0.0); float ws = 0.0;
  for (int k = 0; k < 4; k++) {
    float bw = ((k & 1) == 1 ? fr.x : 1.0 - fr.x) * ((k >> 1) == 1 ? fr.y : 1.0 - fr.y);
    bool m2 = A[k].r > 5.0e3;
    float ok = missRef ? (m2 ? 1.0 : 0.0) : (m2 ? 0.0 : step(abs(A[k].r - tRef) / tRef, 0.05) * step(0.6, dot(B[k].xyz, nRef)) * step(abs(floor(A[k].b + 1.0e-3) - idRef), 0.5));
    float w = bw * ok;
    vec4 ak = A[k]; ak.b = ak.b - floor(ak.b + 1.0e-3);       // blend the amber part only; the id comes from the reference texel
    GA += ak * w; GB += B[k] * w; ws += w;
  }
  if (ws < 1.0e-4) { GA = A[rf]; GA.b -= floor(GA.b + 1.0e-3); GB = B[rf]; ws = 1.0; }
  GA /= ws; GB /= ws;
  GA.b += idRef;

  float S = 0.0, amber = 0.0, haze = 0.0, hazeK = 0.0;
  vec3 col;
  float t = GA.r;
  bool miss = t > 5.0e3;
  if (!miss) {
    vec3 rd = seRayDir(uv);
    vec3 p = uCamPos + rd * t;
    vec3 n = normalize(GB.xyz);
    float Z = GA.g;
    float id = floor(GA.b + 1.0e-3);
    amber = GA.b - id;
    float cav = GB.w, curv = GA.a;
    vec3 nV = vec3(dot(n, uCamRight), dot(n, uCamUp), dot(n, -rd));
    float tilt = pow(1.0 / max(nV.z, 0.25), 0.8);
    float det = 0.65 + 0.35 * dot(nV.xy, SE_DETD);
    float fw = t * uTan.y / 540.0;     // world size of one logical px here
    vec2 pat = sePattern(id, p, n, fw);
    float mic = seMicro(id, Z, p, n, fw);
    float dimK = rowF < uReveal ? 1.0 : uDim;
    S = Z * pat.x * mic * dimK * tilt * det * cav + pat.y;
    S *= exp(min(curv, 0.0) * 0.30);                                             // concave creases darken
    S += uCurvGain * Z * tilt * smoothstep(0.5, 2.4, curv);                      // rounded convex edges glow
    // ---- SE edge effect: bone rim 2.2 px (wider on steep faces), 1 px dark undercut inside it
    vec3 E = texture(uEdge, uv).rgb;
    float ws2 = clamp(tilt / 1.2, 1.0, 2.2);
    float lo = 0.55 - 0.30 * (ws2 - 1.0) / 1.2;
    float rim = smoothstep(lo, lo + 0.28, E.r);
    float under = smoothstep(lo - 0.38, lo, E.r) * (1.0 - rim);
    float rimZ = smoothstep(0.0, 0.10, Z) * (0.30 + 0.70 * clamp(Z / 0.6, 0.0, 1.0));
    S *= 1.0 - 0.45 * under * rimZ;
    S *= 1.0 - 0.35 * E.g;
    S = 1.0 - (1.0 - S) * (1.0 - clamp(uRimGain * 1.15 * rim * rimZ * mix(1.0, dimK, 0.3), 0.0, 1.0));   // the rim screens toward bone
    amber = clamp(amber + 0.8 * rim * amber, 0.0, 1.0);
    // ---- depth is signal loss
    haze = uHaze * (1.0 - exp(-max(t - uFocus, 0.0) / uHazeL));
    S = S > 0.30 ? mix(S, 0.30, haze) : S;     // far detail loses contrast toward ash; the ink does not lift
    hazeK = haze;
  }
  // raster line of the reveal
  float scanLine = (uReveal > 0.0 && uReveal < 1.0) ? exp(-pow((rowF - uReveal) * 540.0, 2.0)) : 0.0;
  S += seGrain(pL, S, 1.2 * hazeK) + 0.55 * seDustAdd(pL);
  S += 0.9 * scanLine;
  S *= 1.0 - uVig * smoothstep(0.30, 0.95, length((vUv - 0.5) * vec2(1.0, 0.85)));
  col = seRamp(S);
  float aM = clamp(amber * uAmberGain + scanLine * 0.8, 0.0, 1.0);
  col = mix(col, seAmberTone(S), aM);
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------------------ TS: camera
export type V3 = [number, number, number];
export interface SECam { pos: V3; fwd: V3; right: V3; up: V3; tanX: number; tanY: number; fovY: number; dist: number }

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Orbit camera around `target`. az = 0 puts the camera on +z looking toward -z; el = 90 deg looks straight
 * down with image-up = -z. `ppm`: pixels (of 1080p) per world unit at the target distance (sets the distance).
 */
export function seCamera(target: V3, azDeg: number, elDeg: number, ppm: number, fovDeg = 28): SECam {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  const dist = H / 2 / (ppm * tanY);
  const dir: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const pos: V3 = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
  const fwd = norm3(sub3(target, pos));
  const right = norm3([Math.cos(az), 0, -Math.sin(az)]);
  const up = norm3(cross3(right, fwd));
  return { pos, fwd, right, up, tanX: (tanY * W) / H, tanY, fovY: (fovDeg * Math.PI) / 180, dist };
}

/** World point -> 1920x1080 px (origin top-left) and view depth (z along the axis). */
export function seProject(cam: SECam, p: V3): { x: number; y: number; z: number } {
  const rel = sub3(p, cam.pos);
  const z = dot3(rel, cam.fwd);
  const nx = dot3(rel, cam.right) / (z * cam.tanX), ny = dot3(rel, cam.up) / (z * cam.tanY);
  return { x: (nx * 0.5 + 0.5) * W, y: (1 - (ny * 0.5 + 0.5)) * H, z };
}

/** px per world unit at view depth z */
export const sePpm = (cam: SECam, z: number) => H / 2 / (z * cam.tanY);

// ------------------------------------------------------------------------------------------------ TS: G-buffer + shade
export interface SEShadeOpts {
  /**
   * GLSL for the G-buffer pass (declare your own uniforms): `vec2 map(vec3 p)` (distance, material id),
   * `bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1)`, `float matZ(float id, vec3 p, vec3 n)` (signal
   * contrast; SE_MATS_GLSL's seMatZ for the library ids) and `float matAmber(float id, vec3 p, vec3 n)` (0..1).
   * `#define SE_SHADOW 0.5` before it turns on detector shadowing (x strength).
   */
  mapGLSL: string;
  /** GLSL for the shade pass: `vec2 sePattern(float id, vec3 p, vec3 n, float footprint)` -> (Z multiplier, added S). */
  shadeGLSL: string;
  /** uniform objects shared by both passes (and any sampler they declare) */
  uniforms?: Record<string, THREE.IUniform>;
  /** G-buffer size as a fraction of the logical frame (0.5 = half res) */
  scale?: number;
  /** cavity length L (world units) */
  cavL?: number;
}

export interface SEFrame {
  /** output frame index (use frameIdx(t)) */
  frame: number;
  /** 0..1 camera/scene motion (1 moving) */
  motion: number;
  /** kick pulse 0..1 */
  kick: number;
  rim?: number; zHaze?: number; hazeL?: number; focus?: number;
  /** raster reveal fraction from the top (> 1 = whole frame built) and the signal of the rows not yet built */
  reveal?: number; dim?: number;
  amber?: number; vignette?: number; dust?: number; curvGain?: number;
}

const FS_VERT = /* glsl */ `precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
let fsGeom: THREE.BufferGeometry | null = null;
function fsGeometry() {
  if (!fsGeom) {
    fsGeom = new THREE.BufferGeometry();
    fsGeom.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  }
  return fsGeom;
}

/** Half-resolution MRT G-buffer: ray distance etc. from a scene-supplied SDF. */
export class SEGBuffer {
  rt: THREE.WebGLRenderTarget;
  u: Record<string, THREE.IUniform>;
  private mat: THREE.RawShaderMaterial;
  private mesh: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly w: number;
  readonly h: number;
  constructor(mapGLSL: string, uniforms: Record<string, THREE.IUniform>, scale = 0.5, cavL = 0.6) {
    this.w = Math.max(2, Math.round(W * SCALE * scale));
    this.h = Math.max(2, Math.round(H * SCALE * scale));
    this.rt = new THREE.WebGLRenderTarget(this.w, this.h, {
      count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
    });
    this.u = {
      ssTap: SS_TAP, uCamPos: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() }, uCamRight: { value: new THREE.Vector3() },
      uCamUp: { value: new THREE.Vector3() }, uTan: { value: new THREE.Vector2() }, uGres: { value: new THREE.Vector2(this.w, this.h) },
      uPixAng: { value: 0.001 }, uCavL: { value: cavL }, uDetDir: { value: new THREE.Vector3() }, ...uniforms,
    };
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FS_VERT, fragmentShader: gbufferFrag(mapGLSL), uniforms: this.u,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.mesh = new THREE.Mesh(fsGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  setCamera(cam: SECam) {
    const u = this.u;
    (u.uCamPos!.value as THREE.Vector3).set(...cam.pos);
    (u.uCamFwd!.value as THREE.Vector3).set(...cam.fwd);
    (u.uCamRight!.value as THREE.Vector3).set(...cam.right);
    (u.uCamUp!.value as THREE.Vector3).set(...cam.up);
    (u.uTan!.value as THREE.Vector2).set(cam.tanX, cam.tanY);
    u.uPixAng!.value = cam.tanY / (this.h / 2);
    // side detector: in the image plane at the detector azimuth, tipped a little toward the camera
    const a = (SE.DET_AZ * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const d: V3 = [0, 1, 2].map((i) => (cam.right[i]! * c + cam.up[i]! * s) * 0.85 - cam.fwd[i]! * 0.5) as V3;
    (u.uDetDir!.value as THREE.Vector3).set(...norm3(d));
  }
  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); }
}

/** `semShade`: G-buffer -> edge pass -> full-res SE shading with raster grain, written into `out` (linear HDR). */
export class SEShade {
  gbuf: SEGBuffer;
  edgeRT: THREE.WebGLRenderTarget;
  private edge: FSPass;
  private shade: FSPass;
  u: Record<string, THREE.IUniform>;
  constructor(o: SEShadeOpts) {
    const sc = o.scale ?? 0.5;
    this.u = o.uniforms ?? {};
    this.gbuf = new SEGBuffer(o.mapGLSL, this.u, sc, o.cavL ?? 0.6);
    const g = this.gbuf;
    this.edgeRT = new THREE.WebGLRenderTarget(g.w, g.h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const cam = { uCamPos: g.u.uCamPos!, uCamFwd: g.u.uCamFwd!, uCamRight: g.u.uCamRight!, uCamUp: g.u.uCamUp!, uTan: g.u.uTan!, uGres: g.u.uGres! };
    this.edge = new FSPass(EDGE_FRAG, { uG0: { value: g.rt.textures[0] }, uG1: { value: g.rt.textures[1] }, uPixAng: g.u.uPixAng!, ...cam });
    const v = (x: number) => ({ value: x });
    const su: Record<string, THREE.IUniform> = {
      uG0: { value: g.rt.textures[0] }, uG1: { value: g.rt.textures[1] }, uEdge: { value: this.edgeRT.texture }, ...cam, ...this.u,
      uFrame: v(0), uMotion: v(0.5), uKick: v(0), uVig: v(0.3), uDust: v(0.0008), uContrast: v(1.15), uRimGain: v(1), uHaze: v(0.35), uHazeL: v(600),
      uFocus: v(0), uAmberGain: v(1), uReveal: v(2), uDim: v(0.3), uCurvGain: v(0.25),
    };
    this.shade = new FSPass(`${SE_MATS_GLSL}\n${SE_RAMP_GLSL}\n${SE_SCAN_GLSL}\n${o.shadeGLSL}\n${SHADE_MAIN}`, su);
  }
  /** Run the three passes for this frame into `out` (the scene's target). */
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: SECam, f: SEFrame) {
    this.gbuf.setCamera(cam);
    this.gbuf.render(renderer);
    this.edge.render(renderer, this.edgeRT);
    const u = this.shade.u;
    u.uFrame!.value = f.frame % 4096;
    u.uMotion!.value = f.motion;
    u.uKick!.value = f.kick;
    u.uRimGain!.value = f.rim ?? 1;
    u.uHaze!.value = f.zHaze ?? 0.35;
    u.uHazeL!.value = f.hazeL ?? 600;
    u.uFocus!.value = f.focus ?? cam.dist * 0.8;
    u.uReveal!.value = f.reveal ?? 2;
    u.uDim!.value = f.dim ?? 0.3;
    u.uAmberGain!.value = f.amber ?? 1;
    u.uVig!.value = f.vignette ?? 0.3;
    u.uDust!.value = f.dust ?? 0.0008;
    u.uCurvGain!.value = f.curvGain ?? 0.25;
    this.shade.render(renderer, out);
  }
  dispose() { this.gbuf.dispose(); this.edgeRT.dispose(); }
}

/** Post overrides every SE hero world returns (its own grain/vignette: global grade off, amber-only bloom). */
export function sePost(o: PostOverrides = {}): PostOverrides {
  return { se: 0, bloom: 0.6, bloomThreshold: 1.0, bloomKnee: 0.08, halation: 0, grain: 0.012, vignette: 0, ca: 0.6, ...o };
}

// ------------------------------------------------------------------------------------------------ semGrade (retrofit)
const GRADE_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;       // 1 logical px in uv
uniform float uStrength, uAmberGain, uRim;
${SE_RAMP_GLSL}
${SE_SCAN_GLSL}
/** plate luminance -> signal S (a gamma-2 encode of the luma: ink 0 .. bone ~0.9) */
float toneS(vec3 c) { return sqrt(clamp(luma(max(c, vec3(0.0))), 0.0, 1.4)); }
void main() {
  vec2 pL = floor(FRAG_PX);
  float row = floor(1080.0 - FRAG_PX.y);
  vec2 uv = vUv + vec2((seRowJitter(row) + seTear(row)) / 1920.0, 0.0);
  vec3 c = texture(uSrc, uv).rgb;
  float S0 = toneS(c);
  // rim: the bright side of an edge gets a bone rim, the dark side a thin undercut (4 taps at 1.5 px)
  vec2 o = uTexel * 1.5;
  float s1 = toneS(texture(uSrc, uv + vec2(-o.x, 0.0)).rgb), s2 = toneS(texture(uSrc, uv + vec2(o.x, 0.0)).rgb);
  float s3 = toneS(texture(uSrc, uv + vec2(0.0, -o.y)).rgb), s4 = toneS(texture(uSrc, uv + vec2(0.0, o.y)).rgb);
  float avg = 0.25 * (s1 + s2 + s3 + s4);
  float g = max(abs(s1 - s2), abs(s3 - s4));
  float d = S0 - avg;
  float rim = clamp(d * 3.5, 0.0, 1.0) * smoothstep(0.05, 0.30, g) * (1.05 - S0);
  float under = clamp(-d * 3.5, 0.0, 1.0) * smoothstep(0.05, 0.30, g);
  float S = S0 * (1.0 - 0.30 * under) + uRim * 0.55 * rim;
  // masks: amber survives (hue test on the source colour), export red survives
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 1.0e-4);
  float gr = c.g / max(c.r, 1.0e-4);
  float amberM = smoothstep(0.28, 0.5, sat) * smoothstep(0.12, 0.22, gr) * (1.0 - smoothstep(0.82, 0.96, gr)) * step(c.b, c.g) * step(c.g, c.r) * step(0.01, mx);
  float redM = smoothstep(0.45, 0.7, sat) * (1.0 - smoothstep(0.10, 0.16, gr)) * smoothstep(0.02, 0.08, c.r);
  // amber marks what is hot: where it is no brighter than its surroundings (a lit field, not a lit element) it goes grey
  if (amberM > 0.01) {
    vec2 R = uTexel * 24.0;
    float bg = 0.25 * (toneS(texture(uSrc, uv + vec2(R.x, 0.0)).rgb) + toneS(texture(uSrc, uv - vec2(R.x, 0.0)).rgb)
                     + toneS(texture(uSrc, uv + vec2(0.0, R.y)).rgb) + toneS(texture(uSrc, uv - vec2(0.0, R.y)).rgb));
    amberM *= max(smoothstep(0.03, 0.14, S0 - bg), smoothstep(0.58, 0.68, S0));
  }
  S += seGrain(pL, S, 0.0) + 0.5 * seDustAdd(pL);
  S *= 1.0 - uVig * smoothstep(0.30, 0.95, length((vUv - 0.5) * vec2(1.0, 0.85)));
  vec3 g3 = seRamp(S);
  g3 = mix(g3, seAmberTone(S0), clamp(amberM * uAmberGain, 0.0, 1.0));
  g3 = mix(g3, c, clamp(redM, 0.0, 1.0));
  fragColor = vec4(mix(c, g3, uStrength), 1.0);
}`;

export interface SEGradeParams { strength: number; frame: number; motion: number; kick: number; amber?: number; rim?: number; vignette?: number; dust?: number }

/** `semGrade`: colour-agnostic retrofit. Turns any finished HDR plate into the SE-look. */
export class SEGrade {
  private pass: FSPass;
  constructor() {
    const v = (x: number) => ({ value: x });
    this.pass = new FSPass(GRADE_FRAG, {
      uSrc: { value: null }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uStrength: v(1), uAmberGain: v(1), uRim: v(1),
      uFrame: v(0), uMotion: v(0.6), uKick: v(0), uVig: v(0.3), uDust: v(0.0008), uContrast: v(1.15),
    });
  }
  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, out: THREE.WebGLRenderTarget, p: SEGradeParams) {
    const u = this.pass.u;
    u.uSrc!.value = src;
    u.uStrength!.value = p.strength;
    u.uFrame!.value = p.frame % 4096;
    u.uMotion!.value = p.motion;
    u.uKick!.value = p.kick;
    u.uAmberGain!.value = p.amber ?? 1;
    u.uRim!.value = p.rim ?? 1;
    u.uVig!.value = p.vignette ?? 0.3;
    u.uDust!.value = p.dust ?? 0.0008;
    this.pass.render(renderer, out);
  }
}

// ------------------------------------------------------------------------------------------------ data strip
export interface SEStripInfo {
  /** px (logical) per world unit at the focus distance, and the unit: sets the scale bar and the magnification */
  ppm: number;
  unit?: 'mm' | 'um';
  eht?: string; wd?: string; signal?: string; lot?: string; unitTag?: string;
  /** 0..1 */
  alpha?: number;
}

/** 1-2-5 scale bar: a length in world units that draws 90..200 px, and its label */
export function seScaleBar(ppm: number, unit: 'mm' | 'um' = 'mm') {
  let best = 1, px = ppm;
  for (let e = -6; e <= 8; e++) for (const m of [1, 2, 5]) {
    const L = m * Math.pow(10, e), p = L * ppm;
    if (p >= 90 && p <= 200) { best = L; px = p; }
  }
  const label = unit === 'mm' ? (best >= 1 ? `${best} mm` : best >= 0.001 ? `${best * 1000} µm` : `${best * 1e6} nm`) : (best >= 1 ? `${best} µm` : `${best * 1000} nm`);
  return { len: best, px, label };
}

/** The 54 px SEM data strip: scale bar, EHT, WD, Mag, detector, lot and UNIT 0001. Drawn into a Layer2D. */
export class SEStrip {
  static readonly H = 54;
  layer = new Layer2D(W, SEStrip.H);
  /** Draw the strip (into its own 1920 x 54 canvas) and composite it over the bottom of `out`. */
  composite(renderer: THREE.WebGLRenderer, comp: Compositor, out: THREE.WebGLRenderTarget, i: SEStripInfo) {
    if ((i.alpha ?? 1) <= 0.001) return;
    comp.draw(renderer, this.draw(i), out, { scale: [1, H / SEStrip.H], offset: [0, 0.5 - H / (2 * SEStrip.H) + (H - SEStrip.H) / SEStrip.H] });
  }
  draw(i: SEStripInfo) {
    const c = this.layer.ctx;
    this.layer.clear();
    const a = i.alpha ?? 1;
    if (a <= 0.001) return this.layer.upload();
    const y0 = 0;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = '#0A0A0B'; c.fillRect(0, y0, W, SEStrip.H);
    c.fillStyle = 'rgba(94,91,87,0.9)'; c.fillRect(0, y0, W, 1);
    const unit = i.unit ?? 'mm';
    const bar = seScaleBar(i.ppm, unit);
    const fovMm = (W / i.ppm) * (unit === 'um' ? 1e-3 : 1);
    const mag = 127 / fovMm;          // the print-width convention: 127 mm across the field of view
    const magS = mag >= 1000 ? `${(mag / 1000).toFixed(1)} K X` : mag >= 10 ? `${mag.toFixed(0)} X` : `${mag.toFixed(2)} X`;
    const mono = (s: string, x: number, y: number, col: string, align: CanvasTextAlign = 'left', size = 14) => {
      c.font = font(F.mono(500), size); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
      (c as any).letterSpacing = '1px'; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    // scale bar with end ticks
    const bx = 40, by = y0 + 31;
    c.fillStyle = 'rgba(238,233,223,0.95)';
    c.fillRect(bx, by, bar.px, 2); c.fillRect(bx, by - 5, 2, 12); c.fillRect(bx + bar.px - 2, by - 5, 2, 12);
    mono(bar.label, bx + bar.px + 16, by + 5, 'rgba(238,233,223,0.9)', 'left', 15);
    const col = 'rgba(238,233,223,0.78)', dim = 'rgba(156,151,143,0.85)';
    let x = bx + bar.px + 170;
    const fields: [string, string][] = [['EHT', i.eht ?? '5.00 kV'], ['WD', i.wd ?? '4.2 mm'], ['Mag', magS], ['Signal A', i.signal ?? 'SE2'], ['LOT', i.lot ?? '7A-0042']];
    for (const [k, v] of fields) {
      mono(k, x, y0 + 22, dim, 'left', 12);
      mono(v, x, y0 + 40, col, 'left', 15);
      x += 70 + (k.length + v.length) * 9;
    }
    mono(i.unitTag ?? 'UNIT 0001', W - 40, y0 + 36, 'rgba(238,233,223,0.95)', 'right', 16);
    c.restore();
    return this.layer.upload();
  }
}

/** The names of the GAP spec: `semShade` (hero worlds, G-buffer) and `semGrade` (retrofit of any plate). */
export const semShade = SEShade;
export const semGrade = SEGrade;
