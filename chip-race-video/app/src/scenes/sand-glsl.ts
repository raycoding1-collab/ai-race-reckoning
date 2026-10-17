// GLSL for `sand`: one quartz grain as an analytic convex polyhedron (ray vs half-spaces, no marching),
// shaded as a white-line engraving (hatching in each facet's own coordinates, LOD-doubled so lines split
// as the zoom dives), conchoidal sub-facets (3 Voronoi octaves), growth terraces (2 octaves of step
// contours), and, at the bottom of the dive, the silicon lattice in [110] projection (dumbbells,
// hairline bonds, engraved spheres). All coordinates are local to the dive target (origin = target), so
// the 10^6 zoom stays precise in float32.
export const NP = 26;

export const SAND_FRAG = /* glsl */ `
#define NP ${NP}
uniform vec3 uO, uR, uU, uFw; uniform float uTan; uniform vec2 uShift;
uniform vec3 uN[NP]; uniform float uC[NP]; uniform vec3 uP[NP];
uniform vec3 uT0, uB0;
uniform vec3 uKey, uRim; uniform float uKeyI;
uniform float uScan;      // 0..1.2 raster reveal (screen fraction from the top)
uniform float uReink;     // position of a re-ink band (screen fraction, <0 off)
uniform float uFar;       // 1 = whole-grain view (back edges), 0 deep
uniform float uLatDim;    // 0..1 the lattice dims while the title is up
uniform float uIgnite;    // 0..1 the target atom ignites
uniform float uGlint;     // flash on the facet glints (bell notes)
uniform float uFade;      // 0..1 everything but the ignited atom fades to black
uniform float uTime;
uniform float uKeepR;  // px radius of the ignited atom

// hatch with LOD: line spacing ~7 px in object space; levels double as the footprint shrinks
float hatchLOD(float u, float tone, float fw) {
  float lv = log2(7.0 * fw);
  float l0 = floor(lv), fr = lv - l0;
  float s0 = exp2(l0), s1 = s0 * 2.0;
  float h0 = hatchD(u / s0, tone, fw / s0), h1 = hatchD(u / s1, tone, fw / s1);
  return mix(h0, h1, smoothstep(0.0, 1.0, fr));
}

// Voronoi in cell units; the cell holding the origin has its point exactly at the origin.
vec3 voro(vec2 x, float seed) {
  vec2 ip = floor(x), fp = fract(x);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), c = ip + g;
    vec2 o = (c == vec2(0.0)) ? vec2(0.0) : hash22(c + seed * 17.31) * 0.9 + 0.05;
    float d = length(g + o - fp);
    if (d < d1) { d2 = d1; d1 = d; id = c; } else if (d < d2) d2 = d;
  }
  return vec3(0.5 * (d2 - d1), hash12(id + seed * 3.7), hash12(id + seed * 9.1 + 4.0));
}

void main() {
  vec2 px = FRAG_PX;
  float yTop = 1080.0 - px.y;
  vec2 sp = vec2(px.x - 960.0 - uShift.x, (px.y - 540.0) + uShift.y) / 960.0;
  vec3 rd = normalize(uFw + uR * sp.x * uTan + uU * sp.y * uTan);
  vec3 ro = uO;

  float tE = -1e9, tX = 1e9; int jE = -1, jX = -1;
  for (int i = 0; i < NP; i++) {
    float den = dot(uN[i], rd), num = uC[i] - dot(uN[i], ro);
    if (abs(den) < 1e-9) { if (num < 0.0) { tE = 1e9; } continue; }
    float tt = num / den;
    if (den < 0.0) { if (tt > tE) { tE = tt; jE = i; } }
    else { if (tt < tX) { tX = tt; jX = i; } }
  }
  vec3 col = C_INK;
  float lat = 0.0;
  bool hit = jE >= 0 && tE < tX && tE > 0.0;
  if (hit) {
    vec3 p = ro + rd * tE;
    vec3 n = vec3(0.0); vec3 T, B; vec2 uv;
    for (int i = 0; i < NP; i++) if (i == jE) n = uN[i];
    if (jE == 0) { T = uT0; B = uB0; uv = vec2(dot(p, T), dot(p, B)); }
    else {
      vec3 pf = vec3(0.0); for (int i = 0; i < NP; i++) if (i == jE) pf = uP[i];
      T = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))); B = cross(n, T);
      uv = vec2(dot(p - pf, T), dot(p - pf, B));
    }
    float cosv = abs(dot(n, -rd));
    float fw = tE * uTan / 960.0 / max(0.12, cosv);       // mm per px on the surface
    // in-plane distance to the facet's edges
    float em = 1e9;
    for (int i = 0; i < NP; i++) {
      if (i == jE) continue;
      float c = dot(uN[i], n); float s = sqrt(max(1e-4, 1.0 - c * c));
      em = min(em, (uC[i] - dot(uN[i], p)) / s);
    }
    float spacingPx = 0.384e-6 / fw;
    lat = smoothstep(4.0, 9.0, spacingPx);
    float fac = float(jE) * 1.618;

    // ---- conchoidal sub-facets: 3 octaves of Voronoi tilt the normal and add hairline borders
    vec3 nn = n; float ang = 0.35 + hash11(fac) * 2.4; float borders = 0.0;
    for (int k = 0; k < 3; k++) {
      float s = 0.05 * pow(0.1, float(k));
      float cellPx = s / fw;
      float w = smoothstep(70.0, 200.0, cellPx) * (1.0 - lat);
      if (w < 0.002) continue;
      vec3 v = voro(uv / s, fac + float(k) * 5.0);
      vec2 r = vec2(v.y, v.z) * 2.0 - 1.0;
      nn += (T * r.x + B * r.y) * 0.2 * w;
      ang += (v.y - 0.5) * 0.9 * w;
      borders = max(borders, pxLine(v.x * s / fw, 0.4, 1.2) * w * (0.35 + 0.65 * v.z));
    }
    nn = normalize(nn);
    // ---- growth terraces (step contours) at 150 nm and 15 nm
    float terr = 0.0, terrLit = 0.0;
    for (int k = 0; k < 2; k++) {
      float s = 1.6e-4 * pow(0.1, float(k));
      float w = smoothstep(60.0, 220.0, s / fw) * (1.0 - lat * 0.85);
      if (w < 0.002) continue;
      vec2 q = uv / s;
      float h0 = snoise(vec2(float(k) * 7.0)) + 0.25 * snoise(vec2(float(k) * 3.0));
      float h = snoise(q * vec2(0.5, 0.33) + float(k) * 7.0) + 0.25 * snoise(q * 1.1 + float(k) * 3.0);
      float hv = (h - h0) * 2.2 + 0.5;
      float fwv = fwidth(hv);
      float f = fract(hv), dd = min(f, 1.0 - f) / max(fwv, 1e-6);
      float ln = pxLine(dd, 0.6, 1.5) * w;
      vec2 gr = vec2(dFdx(hv), dFdy(hv));
      float lit = smoothstep(0.55, 0.95, dot(normalize(gr + 1e-6), normalize(vec2(-uKey.x, uKey.y))));
      terr = max(terr, ln); terrLit = max(terrLit, ln * lit);
    }

    // ---- shading: white-line engraving on ink
    float dif = sat(dot(nn, uKey)) * uKeyI;
    float tone = 0.03 + 0.8 * pow(dif, 1.7);
    vec2 hd = vec2(cos(ang), sin(ang));
    float uh = dot(uv, hd);
    float cov = hatchLOD(uh, tone, fw);
    float rim = pow(1.0 - sat(cosv), 2.2) * sat(dot(nn, uRim) * 0.9 + 0.35);
    float covR = hatchLOD(dot(uv, vec2(-hd.y, hd.x)), sat(rim * 1.3), fw);
    float spec = pow(sat(dot(reflect(-uKey, nn), -rd)), 70.0) * uKeyI;
    vec3 surf = C_BONE * 0.74 * cov;
    surf += C_SIGNAL * (0.22 * rim + 1.05 * rim * covR);
    surf += C_EMBER * spec * (2.2 + 4.0 * uGlint);
    surf += C_BONE * 0.95 * pxLine(em / fw, 0.5, 1.5) * (1.0 - lat);
    surf += C_BONE * 0.3 * borders;
    surf += mix(C_BONE * 0.4, C_SIGNAL * 1.3, terrLit) * terr;
    // re-ink band during the dive snaps
    if (uReink > -0.5) {
      float b = exp(-abs(yTop / 1080.0 - uReink) * 26.0);
      surf += C_SIGNAL * 1.6 * cov * b + C_EMBER * 0.6 * b * terr;
    }
    col = C_INK + surf * (1.0 - 0.9 * lat);

    // ---- silicon lattice, [110] projection (nm)
    if (lat > 0.001) {
      vec2 q = uv * 1e6;
      float fwn = fw * 1e6;                                  // nm per px
      vec2 cs = vec2(0.3840, 0.5431);
      vec2 ci = floor(q / cs);
      float R = 0.058;
      float bd = 1e9; float ad = 1e9; vec2 ac = vec2(0.0); bool tgt = false;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 o = (ci + vec2(float(i), float(j))) * cs;
        vec2 A = o, Bq = o + vec2(0.0, 0.1358), Cq = o + vec2(0.192, 0.2716), Dq = o + vec2(0.192, 0.4073);
        vec2 sites[4] = vec2[4](A, Bq, Cq, Dq);
        for (int s = 0; s < 4; s++) {
          float d = length(q - sites[s]);
          if (d < ad) { ad = d; ac = sites[s]; tgt = (s == 0 && ci + vec2(float(i), float(j)) == vec2(0.0)); }
        }
        bd = min(bd, sdSegment(q, A, Bq)); bd = min(bd, sdSegment(q, Bq, Cq)); bd = min(bd, sdSegment(q, Bq, o + vec2(-0.192, 0.2716)));
        bd = min(bd, sdSegment(q, Cq, Dq)); bd = min(bd, sdSegment(q, Dq, o + vec2(0.0, 0.5431))); bd = min(bd, sdSegment(q, Dq, o + vec2(0.384, 0.5431)));
      }
      float Rpx = R / fwn;
      float dim = 1.0 - uLatDim * 0.88;
      vec3 lc = C_INK;
      // bonds: hairlines that stop at the atoms
      float bond = pxLine(bd / fwn, 0.35, 1.2) * smoothstep(R * 1.15, R * 1.5, ad);
      lc += C_ASH * 0.55 * bond * dim;
      vec2 qa = (q - ac) / R; float r2 = dot(qa, qa);
      if (r2 < 1.0) {
        float nz = sqrt(1.0 - r2);
        vec3 sn = normalize(T * qa.x + B * qa.y + n * nz);
        float d2 = sat(dot(sn, uKey));
        float tn = 0.08 + 0.88 * pow(d2, 0.8);
        float lines = hatchD(qa.y * 4.5 + qa.x * 1.2, tn, fwidth(qa.y * 4.5 + qa.x * 1.2));
        float cvA = mix(tn * 0.85, lines, smoothstep(9.0, 18.0, Rpx));
        float rimA = smoothstep(0.55, 1.0, sqrt(r2)) * sat(dot(sn, uRim) + 0.25);
        lc = C_INK + C_BONE * 0.9 * cvA * dim + C_SIGNAL * 1.1 * rimA * dim;
        lc += C_EMBER * pow(sat(dot(reflect(-uKey, sn), -rd)), 40.0) * 1.5 * dim;
      }
      lc += C_BONE * 0.75 * pxLine(abs(sqrt(r2) - 1.0) * R / fwn, 0.4, 1.2) * dim;
      if (tgt && uIgnite > 0.0) {
        float k = uIgnite;
        float core = 1.0 - smoothstep(0.0, 1.0, sqrt(r2));
        lc = mix(lc, heat(0.62 + 0.38 * core) * (1.0 + 2.5 * core) * 1.6, k * (1.0 - smoothstep(0.98, 1.06, sqrt(r2))));
      }
      col = mix(col, lc, lat);
    }

    // ---- back edges through the translucent quartz (whole-grain view only), dashed
    if (uFar > 0.01 && jX >= 0) {
      vec3 qx = ro + rd * tX; vec3 nx = vec3(0.0);
      for (int i = 0; i < NP; i++) if (i == jX) nx = uN[i];
      float ex = 1e9; vec3 edir = vec3(1.0, 0.0, 0.0);
      for (int i = 0; i < NP; i++) {
        if (i == jX) continue;
        float c = dot(uN[i], nx); float s = sqrt(max(1e-4, 1.0 - c * c));
        float e = (uC[i] - dot(uN[i], qx)) / s;
        if (e < ex) { ex = e; edir = cross(uN[i], nx); }
      }
      float fwx = tX * uTan / 960.0;
      float dash = step(0.45, fract(dot(qx, normalize(edir)) / (fwx * 14.0)));
      col += C_ASH * 0.42 * pxLine(ex / fwx, 0.4, 1.2) * dash * uFar;
    }
  }
  // ignition halo (around the target atom; in front of everything)
  if (uIgnite > 0.0) {
    vec2 c0 = vec2(960.0 + uShift.x, 540.0 - uShift.y);
    float r = length(px - c0);
    col += C_SIGNAL * uIgnite * 0.9 * exp(-r / (uKeepR * 2.2)) * step(uKeepR, r) + C_EMBER * uIgnite * 0.5 * exp(-r / uKeepR) * step(uKeepR, r);
  }
  // fade: keep only the ignited atom
  if (uFade > 0.0) {
    vec2 c0 = vec2(960.0 + uShift.x, 540.0 - uShift.y);
    float keep = 1.0 - smoothstep(uKeepR * 1.05, uKeepR * 1.2, length(px - c0));
    col = mix(col, mix(C_INK, col, keep), uFade);
  }
  // raster reveal (SEM scan) with a hot scanline
  float sy = yTop / 1080.0;
  if (uScan < 1.15) {
    float below = step(uScan, sy);
    col = mix(col, C_INK, below);
    float band = exp(-abs(sy - uScan) * 1080.0 / 5.0);
    col += (C_SIGNAL * 1.4 + C_EMBER * (hit ? 1.6 : 0.0)) * band * (hit ? 1.0 : 0.25);
  }
  fragColor = vec4(col, 1.0);
}`;
