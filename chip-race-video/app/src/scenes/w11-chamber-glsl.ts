// W11 THE CHAMBER: the GLSL of the world (SDF for the G-buffer pass, patterns for the shade pass). See w11-chamber.ts.
// World unit = 0.1 mm (so the edge pass's 0.7-unit depth threshold is 70 um: every machined step in a stub gets its rim).
// Frame: y up, the stage top at y = 0, the carousel axis on the y axis, the beam at (0, y, RCH) (the front chamber).
//   base disc r 520 (0..50) with a graduated ring; carousel cylinder r 410 (56..300) turning about +y by uRot;
//   six pockets at r 265 (r 80, chamfered), six stubs (r 63.5 head, carbon tape on top, specimen on the tape).
// Chamber k (1..6) sits at azimuth -(30 + 60 (k-1)) deg when uRot = 0; sector m = floor(azimuth / 60 deg) is its fold.
// Materials: 0 silicon, 1 metal, 2 tape, 3 oxide (quartz), 4 resist, 6 beam, 7 carousel body, 8 stub, 9 tin, 11 letters, 12 stage.
const f1 = (x: number) => x.toFixed(4);

/** Shared by both passes: the carousel's sector fold. */
export const SHARED = /* glsl */ `
uniform vec2 uRot;   // cos, sin of the carousel angle (it turns about +y)
const float TOPY = 300.0, BOTY = 56.0, RCYL = 410.0, RCH = 265.0, RPOCK = 80.0, SHEAD = 316.0, SY = 319.5;
/** world -> carousel frame */
vec3 toLocal(vec3 p) { return vec3(p.x * uRot.x - p.z * uRot.y, p.y, p.x * uRot.y + p.z * uRot.x); }
/** carousel frame -> the sector frame of the nearest chamber (x tangential, z radial), and its number 1..6 */
vec3 sectorFrame(vec3 pl, float a, out float k) {
  float m = clamp(floor(a * 0.954929659), -3.0, 2.0);
  float ac = (m + 0.5) * 1.04719755;
  float c = cos(ac), s = sin(ac);
  k = m < -0.5 ? -m : 6.0 - m;
  return vec3(pl.x * c - pl.z * s, pl.y, pl.x * s + pl.z * c);
}
`;

export function worldGLSL(o: { qa: number[]; qu: number[]; qv: number[]; lw: number; lhz: number; lz: number; lh: number }) {
  const v3 = (a: number[]) => `vec3(${a.map(f1).join(',')})`;
  return /* glsl */ `
${SHARED}
uniform float uT, uVis, uRev, uFocusK, uDet, uSink, uAge, uBeamOn;
uniform float uFlash[6];
uniform float uWordT[2];
uniform sampler2D uTextSdf, uTextId;
//#define SE_SHADOW 0.5
#define SE_STEPS 56
#define SE_RELAX 0.96
#define SE_EPS 0.8
#define SE_SHADOW_STEPS 5
const float LW = ${f1(o.lw)}, LHZ = ${f1(o.lhz)}, LZ = ${f1(o.lz)}, LH = ${f1(o.lh)};
const vec3 QA = ${v3(o.qa)}, QU = ${v3(o.qu)}, QV = ${v3(o.qv)};

float outBack(float x) { x = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + 2.2 * x * x * x + 1.2 * x * x; }
float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float sdOcta(vec3 p, float r) { p = abs(p); return (p.x + p.y + p.z - r) * 0.57735; }

// ------------------------------------------------------------------------------------------------ the stage
float stageD(vec3 p) {
  float d = p.y;
  if (p.y < 40.0) {
    vec2 g = p.xz - 250.0 * floor(p.xz / 250.0 + 0.5);
    float cut = max(length(g) - 21.0, max(-46.0 - p.y, p.y - 6.0));
    d = smax(d, -cut, 3.0);
  }
  return d;
}

// ------------------------------------------------------------------------------------------------ the beam
float beamD(vec3 p) {
  float z = max(dot(p - uCamPos, uCamFwd), 1.0);
  float taper = mix(0.30, 1.0, smoothstep(360.0, 1100.0, p.y));
  float r = 2.5 * z * (uTan.y / (uGres.y * 0.5)) * taper;
  return max(length(p.xz - vec2(0.0, RCH)) - r, SY - 2.0 - p.y);
}

// ------------------------------------------------------------------------------------------------ the lettering
vec2 lettersD(vec3 p) {
  float zr = (p.z - LZ) / LHZ + 0.5, xr = p.x / LW + 0.5;
  if (zr < 0.0 || zr > 1.0 || xr < 0.0 || xr > 1.0) return vec2(1.0e5, 0.0);
  vec2 uv = vec2(xr, zr);
  float d2 = textureLod(uTextSdf, uv, 0.0).r;
  float wi = floor(textureLod(uTextId, uv, 0.0).r * 255.0 + 0.5);
  float h = LH * outBack((uT - uWordT[int(min(wi, 1.0))]) / 0.34) * (1.0 - uSink);
  if (h < 0.05) return vec2(1.0e5, 0.0);
  vec2 w = vec2(d2 + 1.2, abs(p.y - h * 0.5) - h * 0.5 + 1.2);
  return vec2(min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 1.2, wi);
}
float wordIdAt(vec3 p) {
  float zr = (p.z - LZ) / LHZ + 0.5, xr = p.x / LW + 0.5;
  return floor(textureLod(uTextId, vec2(xr, zr), 0.0).r * 255.0 + 0.5);
}

// ------------------------------------------------------------------------------------------------ specimens (s: y up from the tape top, origin under the beam)
// 1: UNIT 0001, a quartz grain: a double-terminated hexagonal crystal lying on the tape, chipped, with fines around it
vec2 specQuartz(vec3 s) {
  vec3 w = s - vec3(-3.0, 18.0, 2.0);
  vec3 c = vec3(dot(w, QU), dot(w, QA), dot(w, QV));
  const float AP = 13.0, LB = 11.0, HC = 9.5;
  const vec2 HD[6] = vec2[6](vec2(0.866025, 0.5), vec2(0.0, 1.0), vec2(-0.866025, 0.5), vec2(-0.866025, -0.5), vec2(0.0, -1.0), vec2(0.866025, -0.5));
  float dq = sdHex(c.xz, AP);
  float ya = abs(c.y) - LB;
  for (int i = 0; i < 6; i++) {
    float sb = (i & 1) == 0 ? 0.7578 : 0.8521, cb = (i & 1) == 0 ? 0.6524 : 0.5234;   // steep major rhombohedron, shallower minor faces
    float di = (HD[i].x * c.x + HD[i].y * c.z) * cb + ya * sb - sb * (HC + (i == 2 ? 0.0 : 0.6 * float(i & 1)));
    dq = smax(dq, di, 0.9);
  }
  dq = smax(dq, -(length(c - vec3(4.5, LB + 5.8, 8.5)) - 4.2), 1.3);        // conchoidal chips
  dq = smax(dq, -(length(c - vec3(-8.0, -LB - 2.5, -6.5)) - 5.2), 1.3);
  dq = smax(dq, -(length(c - vec3(AP - 1.0, 4.0, -3.0)) - 3.0), 1.0);
  dq += 0.20 * sin(c.y * 2.0) * (1.0 - smoothstep(LB - 3.0, LB + 2.0, abs(c.y)));   // growth striations on the prism faces
  float d = dq * 0.88;
  const vec4 FN[5] = vec4[5](vec4(30.0, -12.0, 2.5, 0.54), vec4(-33.0, -21.0, 1.9, -0.8), vec4(25.0, 29.0, 1.6, 0.9), vec4(-24.0, 33.0, 2.9, 0.2), vec4(6.0, -38.0, 1.4, -0.4));
  if (length(s.xz) > 22.0) {
    for (int i = 0; i < 5; i++) {
      vec3 u = s - vec3(FN[i].x, FN[i].z * 0.7, FN[i].y);
      float ca = FN[i].w, sa = sqrt(1.0 - ca * ca);
      u.xz = vec2(u.x * ca - u.z * sa, u.x * sa + u.z * ca);
      d = min(d, sdOcta(u, FN[i].z * 1.5));
    }
  }
  return vec2(d, 3.0);
}

// 2: a tin droplet, ringing after the click: capillary modes, a wetting skirt and satellites
vec2 specTin(vec3 s) {
  vec3 u = s - vec3(0.0, 29.0, 0.0);
  float r = length(u);
  vec3 nn = u / max(r, 1.0e-3);
  float th = acos(clamp(nn.y, -1.0, 1.0)), ph = atan(nn.z, nn.x);
  float amp = exp(-uAge * 3.4);
  float rip = 1.0 + 0.042 * (1.5 * nn.y * nn.y - 0.5) + 0.030 * pow(max(sin(th), 0.0), 3.0) * cos(3.0 * ph + 0.6)
            + (0.020 + 0.030 * amp) * sin(17.0 * th - 30.0 * uAge) * (0.3 + 0.7 * sin(th));
  float d = (r - 29.0 * rip) * 0.80;
  float rs = length(s.xz);
  float skirt = max(rs - 22.0 - 2.0 * s.y, abs(s.y - 1.2) - 1.2) - 1.0;
  d = smin(d, skirt, 9.0);
  d = min(d, length(s - vec3(40.0, 4.2, -9.0)) - 4.2);
  d = min(d, length(s - vec3(-35.0, 3.2, 20.0)) - 3.2);
  d = min(d, length(s - vec3(12.0, 2.2, -43.0)) - 2.2);
  d = min(d, length(s - vec3(-14.0, 1.5, -40.0)) - 1.5);
  return vec2(d, 9.0);
}

// 3: a ball bond: three gold wires from aluminium pads on a die to copper lead fingers (the hero wire is under the beam)
float wireD(vec3 s, float z0, float HL) {
  float x = clamp(s.x, 0.0, 40.0), u = x * 0.025;
  float sn = max(sin(3.14159 * u), 0.002);
  float y = 20.5 - 14.4 * u + HL * pow(sn, 0.65);
  float dy = clamp(-14.4 * 0.025 + HL * 0.65 * pow(sn, -0.35) * cos(3.14159 * u) * 3.14159 * 0.025, -3.0, 3.0);
  return length(vec3(s.x - x, (s.y - y) * inversesqrt(1.0 + dy * dy), s.z - z0)) - 2.3;
}
vec2 specWire(vec3 s) {
  vec2 res = vec2(seRoundBox(s - vec3(-17.0, 2.0, 0.0), vec3(33.0, 2.0, 31.0), 0.6), 1.0);                 // copper die pad
  res = seUnion(res, vec2(seRoundBox(s - vec3(-18.0, 5.0, 0.0), vec3(28.4, 1.0, 26.4), 0.9), 4.0));         // adhesive squeeze-out
  res = seUnion(res, vec2(seRoundBox(s - vec3(-18.0, 9.4, 0.0), vec3(26.5, 4.0, 25.0), 0.7), 0.0));         // the die
  float zr = clamp(floor(s.z / 16.0 + 0.5), -1.0, 1.0), z0 = zr * 16.0;
  float HL = zr < -0.5 ? 14.5 : zr > 0.5 ? 16.5 : 17.5;
  res = seUnion(res, vec2(seRoundBox(s - vec3(0.0, 13.75, z0), vec3(6.6, 0.35, 6.6), 0.3), 1.0));           // aluminium bond pad
  res = seUnion(res, vec2(seRoundBox(s - vec3(45.0, 2.0, z0), vec3(17.5, 2.0, 5.6), 0.7), 1.0));            // lead finger
  float dBall = seEllipsoid(s - vec3(0.0, 17.6, z0), vec3(6.0, 4.0, 6.0));
  float dStitch = seEllipsoid(s - vec3(40.0, 5.6, z0), vec3(7.0, 1.6, 4.6));
  float dW = min(wireD(s, z0, HL), min(dBall, dStitch));
  res = seSmoothUnion(res, vec2(dW, 1.0), 1.4);
  return res;
}

// 4: a wafer coupon: 300 mm in miniature, notch at 6 o'clock, scribe lanes, stitched field seams, edge bead
vec2 specWafer(vec3 s) {
  const float R = 51.0;
  vec2 PIT = vec2(8.8, 10.4);
  float rr = length(s.xz);
  vec2 g = s.xz / PIT;
  vec2 c = floor(g + 0.5), f = g - c;
  vec2 a = PIT * 0.5 - abs(f * PIT);
  float nx = f.x > 0.0 ? c.x + 1.0 : c.x, nz = f.y > 0.0 ? c.y + 1.0 : c.y;
  float wx = mod(nx, 2.0) < 0.5 ? 0.95 : 0.52, wz = mod(nz, 2.0) < 0.5 ? 0.95 : 0.52;
  float gx = 1.0 - smoothstep(wx - 0.10, wx + 0.10, a.x), gz = 1.0 - smoothstep(wz - 0.10, wz + 0.10, a.y);
  float inside = 1.0 - smoothstep(45.5, 47.0, rr);
  float top = -1.5 * max(gx, gz) * inside - 1.0 * (1.0 - inside);
  float dS = (s.y - (6.0 + top)) * 0.8;
  float d = smax(dS, 1.0 - s.y, 0.4);
  float dR = rr - R;
  if (s.z > R - 9.0) {
    float tri = seTri2(s.xz, vec2(-4.4, R + 1.6), vec2(4.4, R + 1.6), vec2(0.0, R - 3.8));
    dR = smax(dR, -tri, 0.9);
  }
  d = smax(d, dR, 1.7);
  return vec2(d, 0.0);
}

// 5: a GPU package: substrate with decoupling caps, interposer, the die and six HBM stacks with their layer lines
vec2 specGpu(vec3 s) {
  vec2 res = vec2(seRoundBox(s - vec3(0.0, 2.6, 0.0), vec3(40.0, 2.6, 40.0), 1.2), 4.0);                 // substrate
  vec3 cp = vec3(seRep(s.x, 7.4), s.y - 6.0, abs(s.z) - 33.5);
  if (abs(s.x) < 37.0 && abs(cp.z) < 6.0) res = seUnion(res, vec2(seRoundBox(cp, vec3(2.6, 0.9, 1.3), 0.35), 1.0));   // caps, z sides
  vec3 cq = vec3(abs(s.x) - 35.5, s.y - 6.0, seRep(s.z, 7.4));
  if (abs(s.z) < 36.0 && abs(cq.x) < 5.0) res = seUnion(res, vec2(seRoundBox(cq, vec3(1.3, 0.9, 2.6), 0.35), 1.0));  // caps, x sides
  res = seUnion(res, vec2(seRoundBox(s - vec3(0.0, 6.5, 0.0), vec3(32.0, 1.3, 25.5), 0.5), 3.0));            // interposer
  // the die: floorplan relief (tiles separated by grooves)
  vec2 dq = abs(s.xz) - vec2(12.5, 18.0);
  float dBox = max(max(dq.x, dq.y), 0.0) + min(max(dq.x, dq.y), 0.0);
  float tz = (s.z + 18.0) / 4.5, tzf = abs(fract(tz) - 0.5);
  float gr = 1.0 - smoothstep(0.045, 0.085, 0.5 - tzf);
  float spine = 1.0 - smoothstep(1.4, 2.0, abs(s.x));
  float relief = 0.55 * gr + 0.5 * spine;
  float dDie = max(dBox, max((s.y - (11.6 - relief)) * 0.75, 7.8 - s.y)) - 0.0;
  res = seUnion(res, vec2(dDie, 0.0));
  // HBM stacks
  vec3 hq = vec3(abs(s.x) - 21.9, s.y - 13.4, s.z);
  float hz = seRep(s.z, 17.5);
  if (abs(s.z) < 27.0 && hq.x < 9.0) {
    vec3 hb = vec3(hq.x, hq.y, hz);
    float lay = abs(fract((s.y - 8.0) / 1.15) - 0.5);
    float groove = (1.0 - smoothstep(0.36, 0.46, lay)) * step(8.8, s.y);
    float dH = seRoundBox(hb, vec3(6.4 - 0.35 * groove, 5.4, 7.0 - 0.35 * groove), 0.5);
    res = seUnion(res, vec2(dH, 0.0));
  }
  return res;
}

// 6: nothing. A bare stub: the tape, a peeled tab, a lint fibre and two specks of dust
vec2 specEmpty(vec3 s) {
  float ca = cos(0.55), sa = sin(0.55);
  vec2 tp = vec2(s.x * ca - s.z * sa, s.x * sa + s.z * ca);
  float tab = seRoundBox(vec3(tp.x - 46.0, s.y - 0.9 - max(tp.x - 46.0, 0.0) * 0.12, tp.y), vec3(15.0, 0.7, 8.0), 0.5);
  float d = tab;
  vec3 hp = s - vec3(-13.0, 0.9, 9.0);
  float fib = length(vec2(hp.z - 4.0 * sin(hp.x * 0.19) - 0.12 * hp.x, hp.y - 0.4 * sin(hp.x * 0.6))) - 0.55;
  d = min(d, max(fib, abs(hp.x) - 17.0));
  d = min(d, sdOcta(s - vec3(26.0, 1.2, 20.0), 2.4));
  d = min(d, sdOcta(s - vec3(-30.0, 0.9, -18.0), 1.8));
  return vec2(d, 2.0);
}

vec2 specimen(float k, vec3 s) {
  if (k < 1.5) return specQuartz(s);
  if (k < 2.5) return specTin(s);
  if (k < 3.5) return specWire(s);
  if (k < 4.5) return specWafer(s);
  if (k < 5.5) return specGpu(s);
  return specEmpty(s);
}

// ------------------------------------------------------------------------------------------------ the base, the carousel, the detent
vec2 baseD(vec3 p) {
  float rr = length(p.xz);
  float d = seCylYR(vec3(p.x, p.y - 25.0, p.z), 520.0, 25.0, 7.0);
  if (p.y > 38.0 && p.y < 60.0 && rr > 440.0 && rr < 516.0) {
    float st = 0.08726646;                    // 5 degrees: 72 graduations, a long one every 30
    float a = atan(p.z, p.x);
    float ai = floor(a / st + 0.5);
    float la = (a - ai * st) * rr;
    bool major = mod(ai, 6.0) < 0.5;
    float r0 = major ? 462.0 : 484.0;
    float tk = max(abs(la) - (major ? 2.6 : 1.6), max(r0 - rr, rr - 508.0));
    d = max(d, -max(tk, 47.2 - p.y));
  }
  if (p.y > 40.0 && p.y < 60.0 && rr > 440.0 && rr < 466.0) {   // retaining groove at the rim
    float gv = max(abs(rr - 452.0) - 3.2, 46.0 - p.y);
    d = max(d, -gv);
  }
  return vec2(d, 7.0);
}

vec2 carouselD(vec3 p) {
  vec3 pl = toLocal(p);
  float rr = length(pl.xz);
  // the plain envelope of the body is a lower bound of every carved distance: the details only where they can matter
  float dEnv = seCylYR(vec3(pl.x, pl.y - 0.5 * (TOPY + BOTY), pl.z), RCYL, 0.5 * (TOPY - BOTY), 7.0);
  vec2 res = vec2(dEnv, 7.0);
  bool nearBody = dEnv < 26.0;
  bool stubZone = pl.y > 185.0 && rr > 188.0 && rr < 346.0;
  bool hubZone = rr < 142.0 && pl.y > 270.0;
  if (!(nearBody || stubZone || hubZone)) return res;
  float az = atan(pl.x, pl.z);
  float k;
  vec3 q = sectorFrame(pl, az, k);
  if (nearBody) {
    // six flutes (stopped, ball-ended), six chamfered pockets, the detent dimple on the flank under each chamber
    float c1 = min(length(q.xz - vec2(220.0, 381.0)), length(q.xz - vec2(-220.0, 381.0)));
    float dFl = length(vec2(c1, max(BOTY + 112.0 - pl.y, 0.0))) - 70.0;
    float d = smax(dEnv, -dFl, 8.0);
    float dP = length(q.xz - vec2(0.0, RCH));
    float mouth = RPOCK + max(pl.y - (TOPY - 14.0), 0.0);
    d = smax(d, -max((dP - mouth) * 0.7071, (TOPY - 80.0) - pl.y), 2.5);
    d = smax(d, -(length(vec3(q.x, pl.y - 178.0, q.z - (RCYL + 2.0))) - 12.0), 2.0);
    res.x = d;
  }
  if (hubZone) {                                    // centre pin, rosette and the ring around it
    float dRos = seExtrude(rr - (112.0 + 11.0 * cos(6.0 * az)), pl.y, 296.0, 308.0) - 1.5;
    res = seUnion(res, vec2(dRos, 7.0));
    float kn = 0.5 + 0.5 * cos(24.0 * az);
    float dCol = seCylYR(vec3(pl.x, pl.y - 316.0, pl.z), 62.0 - 2.4 * kn, 12.0, 3.0);
    res = seUnion(res, vec2(dCol, 1.0));
    float dPin = seCapsuleY(vec3(pl.x, pl.y - 322.0, pl.z), 96.0, 33.0);
    res = seUnion(res, vec2(dPin, 8.0));
  }
  if (stubZone) {                                   // the stub in the nearest pocket
    vec3 s = vec3(q.x, pl.y, q.z - RCH);
    float rs = length(s.xz);
    if (rs < 110.0) {
      float head = seCylYR(vec3(s.x, s.y - 300.0, s.z), 63.5, 16.0, 4.0);
      head = max(head, -max(abs(s.y - 293.0) - 2.2, 60.0 - rs));
      float shank = seCylY(vec3(s.x, s.y - 250.0, s.z), 40.0, 34.0);
      vec2 st = vec2(min(head, shank), 8.0);
      st = seUnion(st, vec2(seCylYR(vec3(s.x, s.y - 317.75, s.z), 55.0, 1.75, 0.5), 2.0));    // carbon tape
      res = seUnion(res, st);
      vec3 ss = vec3(s.x, s.y - SY, s.z);
      if (rs < 66.0 && ss.y < 110.0 && ss.y > -2.0) res = seUnion(res, vec2(length(ss - vec3(0.0, 20.0, 0.0)) - 25.0, 3.0));
      else res.x = min(res.x, max(rs - 63.0, ss.y - 108.0));
    }
  }
  return res;
}

/** The ball detent on a bracket: a spring plunger that rides the flank and drops into the dimple at each lock. */
vec2 pawlD(vec3 p) {
  float z0 = RCYL + 1.0 + uDet;                             // ball centre: seated in the dimple at uDet = 0, riding the flank at 10
  float ball = length(p - vec3(0.0, 178.0, z0)) - 11.0;
  float body = seCylAxis(p, vec3(0.0, 178.0, z0 + 8.0), vec3(0.0, 178.0, 498.0), 17.0);
  float post = seRoundBox(p - vec3(0.0, 118.0, 500.0), vec3(26.0, 70.0, 16.0), 5.0);
  float d = smin(min(ball, body), post, 9.0);
  float nut = seCylAxis(p, vec3(0.0, 178.0, 462.0), vec3(0.0, 178.0, 476.0), 24.0);
  return vec2(min(d, nut), 7.0);
}

vec2 map(vec3 p) {
  vec2 res = vec2(stageD(p), 12.0);
  if (uBeamOn > 0.5) { float db = beamD(p); if (db < res.x) res = vec2(db, 6.0); }
  float rr = length(p.xz);
  float dB = max(rr - 560.0, p.y - 460.0);
  if (dB < 40.0) {
    res = seUnion(res, baseD(p));
    res = seUnion(res, carouselD(p));
    if (p.z > 395.0 && abs(p.x) < 60.0 && p.y > 90.0 && p.y < 270.0) res = seUnion(res, pawlD(p));
  } else res.x = min(res.x, dB);
  float dL = length(max(vec3(abs(p.x) - (0.5 * LW + 10.0), abs(p.z - LZ) - (0.5 * LHZ + 10.0), p.y - (LH * 1.3 + 6.0)), 0.0));
  if (dL < 30.0) {
    vec2 L = lettersD(p);
    if (L.x < res.x) res = vec2(L.x, 11.0);
  } else res.x = min(res.x, dL);
  return res;
}

bool seBounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 lo = vec3(-1500.0, -50.0, -1400.0), hi = vec3(1500.0, 3800.0, 1100.0);
  vec3 inv = 1.0 / (rd + vec3(1.0e-7));
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  t0 = max(max(mn.x, mn.y), max(mn.z, 0.0));
  t1 = min(min(mx.x, mx.y), mx.z);
  return t1 > t0;
}

float matZ(float id, vec3 p, vec3 n) {
  if (id > 5.5 && id < 6.5) return 1.25;
  float Z = id < 6.5 ? seMatZ(id) : id < 7.5 ? 0.46 : id < 8.5 ? 0.74 : id < 9.5 ? 0.92 : id < 11.5 ? 0.62 : 0.30;
  if (id > 11.5) Z *= 1.0 - smoothstep(520.0, 1500.0, length(p.xz));
  if (id < 10.5 || id > 11.5) {            // the beam picks out the stub it is on: the rest sits in the detector's shade
    float dB = length(p.xz - vec2(0.0, RCH));
    Z *= mix(1.0, 0.40 + 0.60 * smoothstep(330.0, 60.0, dB), uFocusK);
  }
  vec3 rel = p - uCamPos;
  float rowF = 0.5 - 0.5 * dot(rel, uCamUp) / (dot(rel, uCamFwd) * uTan.y);
  return Z * uVis * step(rowF, uRev);
}

float matAmber(float id, vec3 p, vec3 n) {
  if (id > 5.5 && id < 6.5) return 0.99;
  float dB = length(p.xz - vec2(0.0, RCH));
  float a = 0.0;
  if (p.y > SY - 6.0 && id < 7.0) {
    a = 0.85 * exp(-dB * dB / 420.0);                                    // the spot the beam is on
    if (dB < 80.0 && uAge < 0.26) {                                      // the raster over the specimen after each lock
      float zs = RCH + 78.0 - 156.0 * (uAge / 0.26);
      a = max(a, 0.80 * exp(-pow((p.z - zs) / 4.0, 2.0)) * smoothstep(80.0, 50.0, dB));
    }
  }
  if (id > 8.5 && id < 9.5) a = max(a, 0.92 * smoothstep(330.0, 90.0, dB));      // tin, on the element map
  if (id > 10.5 && id < 11.5) {
    float tw = uWordT[int(min(wordIdAt(p), 1.0))];
    a = 0.97 * exp(-(uT - tw) / 0.30) * step(tw, uT);
  }
  if (id > 6.5 && id < 8.5 && p.y > TOPY - 26.0) {                        // the "O": a chamber's mouth rings amber while it is sung
    float k;
    vec3 pl = toLocal(p);
    vec3 q = sectorFrame(pl, atan(pl.x, pl.z), k);
    float dP = length(q.xz - vec2(0.0, RCH));
    a = max(a, 0.95 * uFlash[int(k) - 1] * exp(-pow((dP - 86.0) / 13.0, 2.0)));
  }
  return clamp(a, 0.0, 0.99) * uVis * step(0.5 - 0.5 * dot(p - uCamPos, uCamUp) / (dot(p - uCamPos, uCamFwd) * uTan.y), uRev);
}
`;
}

export const SHADE_GLSL = /* glsl */ `
${SHARED}
uniform float uVis;
uniform sampler2D uNum;
float h21(vec2 p) { return hash12(p); }
/** a die-sized layout: bands of fine lines, macros and pad rows (Z multiplier) */
float dieLayout(vec2 u, float seed, float fw) {
  vec2 c = floor(u * vec2(3.0, 5.0));
  float h = h21(c + seed);
  vec2 f = fract(u * vec2(3.0, 5.0));
  float aa = 1.0 - smoothstep(0.25, 0.7, fw * 9.0);
  float line = 0.5 + 0.5 * sign(sin(u.y * 78.0 + h * 6.28));
  float m = 0.78 + 0.46 * h;
  m *= mix(1.0, 0.62 + 0.52 * line, aa * step(0.45, h));
  m *= 1.0 - 0.25 * step(0.9, f.x) - 0.25 * step(0.9, f.y);
  return m;
}

vec2 sePattern(float id, vec3 p, vec3 n, float fw) {
  float mz = 1.0;
  if (id > 11.5) {
    mz *= 1.0 + 0.05 * sin(p.z * 2.4 + 0.8 * sin(p.x * 0.09)) * (1.0 - smoothstep(0.3, 0.9, fw * 2.4));
    return vec2(mz, 0.0);
  }
  vec3 pl = toLocal(p);
  float rr = length(pl.xz);
  float k;
  vec3 q = sectorFrame(pl, atan(pl.x, pl.z), k);
  if (id > 6.5 && id < 7.5) {
    if (n.y > 0.85 && pl.y > TOPY - 3.0) {
      mz *= 1.0 + 0.06 * sin(rr * 1.7) * (1.0 - smoothstep(0.4, 1.0, fw * 1.7));                    // turning marks
      vec2 nu = vec2(q.x / 34.0 + 0.5, 0.5 + (381.0 - q.z) / 36.0);
      if (nu.x > 0.0 && nu.x < 1.0 && nu.y > 0.0 && nu.y < 1.0) {
        float gl = texture(uNum, vec2((k - 1.0 + nu.x) / 6.0, nu.y)).r;
        mz *= 1.0 - 0.72 * gl;                                                                       // engraved numeral
      }
    } else if (abs(n.y) < 0.5) {
      mz *= 1.0 + 0.07 * sin(pl.y * 1.5) * (1.0 - smoothstep(0.4, 1.0, fw * 1.5));                  // milling marks on the flutes
    }
    return vec2(mz, 0.0);
  }
  if (id > 7.5 && id < 8.5) {
    if (n.y > 0.85) mz *= 1.0 + 0.07 * sin(length(q.xz - vec2(0.0, RCH)) * 2.1) * (1.0 - smoothstep(0.4, 1.0, fw * 2.1));
    else mz *= 1.0 + 0.16 * sin(atan(q.x, q.z - RCH) * 96.0) * (1.0 - smoothstep(0.4, 1.0, fw * 1.6));   // knurl
    return vec2(mz, 0.0);
  }
  if (p.y < SY - 4.0 || rr < 150.0 || rr > 400.0) return vec2(1.0, 0.0);
  vec3 s = vec3(q.x, pl.y - SY, q.z - RCH);
  if (id < 0.5) {
    if (k > 3.5 && k < 4.5) {
      // wafer: every die is its own little floorplan; edge bead; laser-marked code near the notch
      float rw = length(s.xz);
      vec2 PIT = vec2(8.8, 10.4);
      vec2 g = s.xz / PIT, c = floor(g + 0.5);
      if (rw < 47.0 && n.y > 0.7) {
        mz *= dieLayout(g - c + 0.5, c.x * 3.1 + c.y * 7.7, fw);
      } else if (n.y > 0.7) {
        mz *= 0.55 + 0.30 * smoothstep(48.0, 49.0, rw);                                            // edge bead ring
        vec2 cu = vec2((s.x + 11.0) / 1.15, (s.z - 41.0) / 1.15);
        if (cu.x > 0.0 && cu.x < 10.0 && cu.y > 0.0 && cu.y < 10.0 && s.z > 0.0)
          mz *= 0.5 + 1.1 * step(0.5, h21(floor(cu)));                                              // data-matrix serial
      }
    } else if (k > 4.5 && k < 5.5) {
      if (n.y > 0.7 && abs(s.x) < 12.6 && abs(s.z) < 18.1 && s.y > 9.0) {
        float row = floor((s.z + 18.0) / 4.5);
        float aa = 1.0 - smoothstep(0.3, 0.8, fw * 2.2);
        float cell = h21(vec2(row, s.x < 0.0 ? 0.0 : 1.0));
        float st = 0.5 + 0.5 * sign(sin(s.z * 14.0 + cell * 6.0));
        mz *= (0.74 + 0.5 * cell) * mix(1.0, 0.7 + 0.6 * st, aa);
        mz *= 1.0 + 0.7 * (1.0 - smoothstep(0.0, 0.5, abs(abs(s.x) - 2.0)));                       // NoC spine
      } else if (n.y > 0.7 && s.y > 12.0) {
        float aa = 1.0 - smoothstep(0.3, 0.8, fw * 2.6);
        mz *= 0.8 + 0.3 * mix(0.5, step(0.5, fract(s.x * 3.2 + s.z * 0.5)), aa);                   // HBM top: TSV field
      }
    }
  } else if (id > 3.5 && id < 4.5 && k > 4.5 && k < 5.5) {
    float aa = 1.0 - smoothstep(0.3, 0.8, fw * 1.8);
    mz *= 0.8 + 0.4 * mix(0.5, step(0.5, fract(s.x * 0.55) * fract(s.z * 0.7) * 2.0), aa);          // substrate traces
  }
  return vec2(mz, 0.0);
}
`;
