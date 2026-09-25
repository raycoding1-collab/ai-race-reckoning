// Night flight over a procedural landscape. Towns glow sodium-orange, highways
// carry traffic, and data-center campuses switch on one by one in cold white.
// One full-screen fragment shader, no textures. It renders at a reduced,
// adaptive resolution and stops whenever the hero is off screen.

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLights;
uniform float uPitch;
out vec4 fragColor;

#define PI 3.14159265

float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = m * p; a *= .5; }
  return s;
}

float density(vec2 p) {
  float towns = smoothstep(.56, .82, fbm(p * .02 + vec2(3.1, 7.7)));
  float villages = smoothstep(.68, .88, fbm(p * .07 + 11.3)) * .45;
  return clamp(towns + villages * (1. - towns), 0., 1.);
}

// A point light of radius r0, widened to the pixel footprint so distant lights
// average out instead of shimmering. Energy is kept constant as it widens.
float lamp(vec2 d, float r0, float fp) {
  float r = max(r0, fp * .62);
  return exp(-dot(d, d) / (r * r)) * (r0 * r0) / (r * r);
}

// A row of lamps: d is the offset from the nearest lamp (x along the row,
// y across it). Up close each lamp is a point; once the pixel footprint along
// the row (fa) exceeds the spacing, the lamps merge into a line that stays
// sharp across the row (fn). Total light is the same in both forms.
float lampRow(vec2 d, float r0, float S, float on, float frac, float fa, float fn) {
  float ra = max(r0, fa * .6), rn = max(r0, fn * .6);
  float pt = on * exp(-d.x * d.x / (ra * ra) - d.y * d.y / (rn * rn)) * (r0 * r0) / (ra * rn);
  float ln = frac * exp(-d.y * d.y / (rn * rn)) * (1.7725 * r0 * r0 / S) / rn;
  return mix(pt, ln, smoothstep(.3 * S, 1.1 * S, fa));
}

vec3 townLights(vec2 p, vec2 dpx, vec2 dpy, float dens) {
  if (dens < .015) return vec3(0);
  vec2 dc = floor(p / 17.);
  float a = h12(dc) * 1.5708 + (h12(dc + 4.2) - .5) * .5;
  float c = cos(a), s = sin(a);
  mat2 Rm = mat2(c, -s, s, c);
  vec2 warp = vec2(noise(p * .05), noise(p * .05 + 5.2)) - .5;
  vec2 q = Rm * (p + warp * 7.) + h22(dc) * 9.;
  vec2 qx = Rm * dpx, qy = Rm * dpy;
  float fX = max(abs(qx.x), abs(qy.x)), fY = max(abs(qx.y), abs(qy.y));
  float B = .62 + h12(dc + 1.9) * .55;
  const float S = .16, R = .011;
  float frac = .55 + dens * .4;
  float lineP = min(1., dens * 1.15);
  float avgLine = dens * frac * lineP * PI * R * R / (S * B);
  float vary = .3 + 1.4 * noise(q * .7 + dc * 3.);
  // streets along q.x
  vec2 g1 = vec2(q.x / S, q.y / B), i1 = floor(g1 + .5);
  vec2 d1 = (g1 - i1) * vec2(S, B);
  d1.x -= (h12(i1 + dc * 17.) - .5) * .5 * S;
  float line1 = step(1. - lineP, h12(vec2(i1.y, dc.x * 3. + dc.y)));
  float on1 = step(1. - frac, h12(i1 + dc * 17. + .5)) * (.6 + .8 * h12(i1 + 3.));
  float s1 = mix(line1 * dens * lampRow(d1, R, S, on1, frac * vary, fX, fY), avgLine, smoothstep(.35 * B, 1.2 * B, fY));
  // streets along q.y
  vec2 g2 = vec2(q.x / B, q.y / S), i2 = floor(g2 + .5);
  vec2 d2 = ((g2 - i2) * vec2(B, S)).yx;
  d2.x -= (h12(i2 + dc * 31.) - .5) * .5 * S;
  float line2 = step(1. - lineP, h12(vec2(i2.x, dc.y * 5. + dc.x + 7.)));
  float on2 = step(1. - frac, h12(i2 + dc * 31. + 5.)) * (.6 + .8 * h12(i2 + 8.));
  float s2 = mix(line2 * dens * lampRow(d2, R, S, on2, frac * vary, fY, fX), avgLine, smoothstep(.35 * B, 1.2 * B, fX));
  // windows and yards inside the blocks
  float fpi = max(fX, fY);
  vec2 g3 = q / .19, i3 = floor(g3), o3 = h22(i3 + 9.) * .8 + .1;
  float on3 = step(1. - dens * .3, h12(i3 + 2.7)) * (.25 + .5 * h12(i3 + 1.1));
  float w3 = mix(on3 * lamp((g3 - i3 - o3) * .19, .008, fpi), dens * .3 * .5 * PI * .008 * .008 / (.19 * .19), smoothstep(.2 * .19, .8 * .19, fpi));
  vec3 sodium = vec3(1., .47, .14);
  vec3 white = vec3(1., .8, .58);
  float wl = smoothstep(.3 * S, 1.1 * S, fpi);
  float mixW = step(.84, h12(i1 * 1.7 + 3.3)) * (1. - wl) + .12 * wl;
  return (mix(sodium, white, mixW) * (s1 + s2) * 1.5 + vec3(1., .62, .3) * w3) * 11.;
}

vec3 highways(vec2 p, vec2 dpx, vec2 dpy, float fp, float t) {
  vec3 col = vec3(0);
  for (int k = 0; k < 2; k++) {
    vec2 pp = k == 0 ? p : vec2(p.y, -p.x);
    vec2 ddx = k == 0 ? dpx : vec2(dpx.y, -dpx.x);
    vec2 ddy = k == 0 ? dpy : vec2(dpy.y, -dpy.x);
    float sp = k == 0 ? 29. : 41.;
    float lane = floor(pp.x / sp + .5);
    if (h12(vec2(lane, float(k) * 3.1)) < .42) continue;
    float ph = lane * 1.7 + float(k);
    float x0 = lane * sp + 6. * sin(pp.y * .021 + ph) + 2.5 * sin(pp.y * .057 + ph * 1.3);
    float slope = 6. * .021 * cos(pp.y * .021 + ph) + 2.5 * .057 * cos(pp.y * .057 + ph * 1.3);
    vec2 n = normalize(vec2(1., -slope));
    float dx = (pp.x - x0) * n.x;
    float fn = max(abs(dot(ddx, n)), abs(dot(ddy, n)));
    float rw = max(.02, fn * .6);
    col += vec3(1., .5, .18) * exp(-dx * dx / (rw * rw)) * (.02 / rw) * .5;
    float fade = 1. - smoothstep(.12, .5, fp);
    if (fade <= 0.) continue;
    for (int dir = 0; dir < 2; dir++) {
      float sg = dir == 0 ? 1. : -1.;
      float zz = pp.y - sg * 1.9 * t;
      float cell = floor(zz / .75);
      float has = step(.5, h12(vec2(cell, lane * 7. + float(dir) + float(k) * 13.)));
      float zc = (cell + .5) * .75;
      vec2 dd = vec2(dx - sg * .035, (zz - zc) * .45);
      vec3 cc = dir == 0 ? vec3(1., .12, .07) : vec3(1., .93, .82);
      col += cc * has * lamp(dd, .011, fp) * 4. * fade;
    }
  }
  return col;
}

// Data-center campuses: long halls with service lanes lit in cold LED white,
// a floodlit perimeter, a substation and a haze of their own light.
vec3 campuses(vec2 p, vec2 dpx, vec2 dpy, float fp, float lights, out float roof) {
  roof = 0.;
  const float G = 24.;
  vec2 cell = floor(p / G);
  float h = h12(cell + 91.7);
  if (h < .36) return vec3(0);
  vec2 rnd = h22(cell + 3.7);
  vec2 center = (cell + .5 + (rnd - .5) * .4) * G;
  vec2 size = vec2(5. + rnd.x * 6.5, 2. + rnd.y * 2.2);
  vec2 q = p - center;
  vec2 qdx = dpx, qdy = dpy;
  if (h12(cell + 7.1) > .5) { q = q.yx; qdx = qdx.yx; qdy = qdy.yx; }
  float fX = max(abs(qdx.x), abs(qdy.x)), fY = max(abs(qdx.y), abs(qdy.y));
  vec2 hs = size * .5;
  vec2 dq = abs(q) - hs;
  float sd = length(max(dq, 0.)) + min(max(dq.x, dq.y), 0.);
  if (sd < 0.) roof = 1.;
  float onT = .6 + h12(cell + 5.5) * 7.5;
  float on = smoothstep(onT, onT + 1.4, lights);
  if (on <= 0. || sd > 6.) return vec3(0);
  vec3 cool = vec3(.74, .86, 1.);
  vec3 col = cool * (exp(-max(sd, 0.) * .7) * .07 + exp(-max(sd, 0.) * 3.) * .07);
  float rows = floor(3. + rnd.y * 4.);
  float rowH = size.y / rows;
  if (sd < 0.) {
    float fy = fract((q.y + hs.y) / rowH);
    float ly = (fy < .5 ? fy : fy - 1.) * rowH;
    const float L = .12;
    float lx = (fract(q.x / L + .5) - .5) * L;
    float lane = mix(lampRow(vec2(lx, ly), .016, L, 1., 1., fX, fY), PI * .016 * .016 / (L * rowH) * .3, smoothstep(.35 * rowH, 1.2 * rowH, fY));
    col += cool * lane * 11.;
    vec2 g = q / .3, gi = floor(g);
    float hh = h12(gi + cell);
    col += mix(vec3(1., .7, .45), vec3(1., .1, .06), step(.985, hh)) * step(.95, hh) * lamp((g - gi - .5) * .3, .012, max(fX, fY)) * 4.;
  }
  // floodlit perimeter fence, as four rows of lamps
  const float F = .16, off = .3;
  float inX = step(abs(q.x), hs.x + off), inY = step(abs(q.y), hs.y + off);
  vec2 e1 = vec2((fract(q.x / F + .5) - .5) * F, abs(q.y) - (hs.y + off));
  vec2 e2 = vec2((fract(q.y / F + .5) - .5) * F, abs(q.x) - (hs.x + off));
  col += cool * (inX * lampRow(e1, .02, F, 1., 1., fX, fY) + inY * lampRow(e2, .02, F, 1., 1., fY, fX)) * 11.;
  // substation and parking beside the site
  float fpi = max(fX, fY);
  vec2 sq = q - vec2(hs.x + 1.3, -hs.y + .8);
  if (max(abs(sq.x), abs(sq.y)) < .7) {
    vec2 g = sq / .12, gi = floor(g);
    col += vec3(1., .96, .88) * mix(lamp((g - gi - .5) * .12, .012, fpi), PI * .012 * .012 / (.12 * .12), smoothstep(.04, .12, fpi)) * 9.;
  }
  vec2 pk = q - vec2(-hs.x - 1.2, 0.);
  if (abs(pk.x) < .8 && abs(pk.y) < hs.y * .8) {
    vec2 g = pk / vec2(.4, .3), gi = floor(g);
    col += vec3(1., .5, .16) * mix(lamp((g - gi - .5) * vec2(.4, .3), .02, fpi), PI * .02 * .02 / .12, smoothstep(.1, .3, fpi)) * 5.;
  }
  return col * on;
}

vec3 beacons(vec2 p, float fp, float t) {
  const float G = 6.5;
  vec2 cell = floor(p / G);
  float h = h12(cell + 44.4);
  if (h < .86) return vec3(0);
  vec2 c = (cell + .2 + .6 * h22(cell + 1.3)) * G;
  float blink = step(fract(t * .5 + h * 7.), .1);
  return vec3(1., .07, .04) * blink * lamp(p - c, .02, fp) * 7.;
}

vec3 sky(vec3 rd, float t) {
  float y = max(rd.y, 0.);
  vec3 zen = vec3(.0035, .0058, .012);
  vec3 hor = vec3(.0125, .009, .0075);
  vec3 col = mix(hor, zen, smoothstep(0., .14, y));
  vec2 cp = rd.xz / max(rd.y, .03) * 1.4 + vec2(t * .015, t * .04);
  float cl = smoothstep(.48, .86, fbm(cp * .55));
  float low = 1. - smoothstep(.0, .3, y);
  col = mix(col, vec3(.011, .0085, .007) * low + zen * .9, cl * .45 * (1. - smoothstep(.04, .3, y)));
  vec2 sp = rd.xz / (rd.y + .3) * 260.;
  vec2 sid = floor(sp);
  vec2 so = fract(sp) - h22(sid);
  float star = step(.988, h12(sid)) * exp(-dot(so, so) * 110.) * smoothstep(.1, .45, y) * (1. - cl);
  col += vec3(.8, .86, 1.) * star * .25;
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float t = uTime;
  vec3 ro = vec3(sin(t * .031) * 6., 4.2, t * .85);
#ifdef DEBUG
  ro.y = 40.;
#endif
  float yaw = sin(t * .023) * .09 + .06;
  float pitch = uPitch;
  vec3 fw = normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)));
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.6 + uv.x * rt + uv.y * up);

  float ry = min(rd.y, -.0004);
  float tt = -ro.y / ry;
  vec2 p = ro.xz + rd.xz * tt;
  vec2 dpx = dFdx(p), dpy = dFdy(p);
  float fp = max(length(dpx), length(dpy));

  vec3 col;
  if (rd.y < -.0004) {
    float dens = density(p);
    float f = fbm(p * .3);
    vec3 alb = vec3(.0016, .002, .003) * (.4 + f) + vec3(.004, .0022, .001) * dens;
    float roof;
    vec3 L = townLights(p, dpx, dpy, dens) + highways(p, dpx, dpy, fp, t) + campuses(p, dpx, dpy, fp, uLights, roof) + beacons(p, fp, t);
    alb = mix(alb, vec3(.006, .0066, .0075), roof * .85);
    col = alb + L;
#ifdef DEBUG
    if (DEBUG == 1) { fragColor = vec4(campuses(p, dpx, dpy, fp, uLights, roof) * 3. + vec3(roof * .25, dens * .15, 0), 1.); return; }
    if (DEBUG == 2) { fragColor = vec4(vec3(dens), 1.); return; }
#endif
    float fog = 1. - exp(-tt * .014);
    col = mix(col, vec3(.0095, .0072, .0058), fog);
  } else {
    col = sky(rd, t);
  }
  col += vec3(.02, .012, .0075) * exp(-abs(rd.y + .008) * 26.);

  // Hejl-Burgess-Dawson filmic curve (includes display gamma, crushes the toe)
  vec3 x = max(vec3(0), col * 1.25 - .004);
  col = (x * (6.2 * x + .5)) / (x * (6.2 * x + 1.7) + .06);
  vec2 q = gl_FragCoord.xy / uRes;
  col *= .5 + .5 * pow(16. * q.x * q.y * (1. - q.x) * (1. - q.y), .16);
  col += (h12(gl_FragCoord.xy + fract(t * 7.3) * 91.) - .5) / 255.;
  fragColor = vec4(col, 1.);
}`;

export function initHero(canvas, opts = {}) {
  if (!canvas) return null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: !!opts.still, powerPreference: 'high-performance',
  });
  if (!gl) return null;

  // Compile without blocking the page: with KHR_parallel_shader_compile the
  // driver works in the background and we check back on each frame.
  const frag = opts.debug ? FRAG.replace('precision highp float;', `precision highp float;\n#define DEBUG ${opts.debug}`) : FRAG;
  const prog = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]].map(([type, src]) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
    return sh;
  });
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  const parallel = gl.getExtension('KHR_parallel_shader_compile');

  const coarse = matchMedia('(pointer: coarse)').matches;
  let scale = opts.scale || (coarse ? 0.6 : 0.8);
  const minScale = 0.45;
  const maxScale = opts.scale || 1;
  // The canvas fills the viewport; the ResizeObserver below corrects this
  // guess without forcing a layout during startup.
  let cssW = innerWidth;
  let cssH = innerHeight;
  let U = null;

  const resize = () => {
    const budget = coarse ? 600000 : 1300000;
    const s = Math.min(scale, Math.sqrt(budget / Math.max(1, cssW * cssH)));
    const w = Math.max(2, Math.round(cssW * s));
    const h = Math.max(2, Math.round(cssH * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  };

  let t0 = 0;
  let startAt = 0;
  let scrollP = 0;
  let visible = true;
  let raf = 0;
  let last = 0;
  let avg = 16;
  let frames = 0;
  // When frames run slow, lower the resolution first; at the floor, draw on
  // every second or third display frame instead. The flight is slow enough
  // that a lower frame rate reads as smooth.
  let every = 1;
  let tickN = 0;

  const draw = (now) => {
    if (!U) return;
    const t = startAt + (now - t0) / 1000;
    const lights = opts.lights != null ? opts.lights : t;
    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.time, t);
    gl.uniform1f(U.lights, lights);
    gl.uniform1f(U.pitch, opts.pitch != null ? opts.pitch : -0.2 - scrollP * 0.36);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = (now) => {
    raf = 0;
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
    if (++tickN % every) return;
    if (last) {
      const dt = (now - last) / every;
      avg = avg * 0.9 + Math.min(dt, 100) * 0.1;
      if (++frames % 40 === 0) {
        if (avg > 24) {
          if (scale > minScale) { scale = Math.max(minScale, scale * 0.85); resize(); }
          else if (every < 3) every++;
        } else if (avg < 12 && every > 1) every--;
        else if (avg < 15 && every === 1 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.08); resize(); }
      }
    }
    last = now;
    draw(now);
  };

  const start = () => {
    if (raf || !U || reduced || opts.still) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  };

  const ready = () => {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('hero shader unavailable', gl.getProgramInfoLog(prog), shaders.map((sh) => gl.getShaderInfoLog(sh)).join(' '));
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    U = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      lights: gl.getUniformLocation(prog, 'uLights'),
      pitch: gl.getUniformLocation(prog, 'uPitch'),
    };
    // Without motion, show the finished scene: every campus already lit.
    if (reduced && !opts.still) { opts.time = 24; opts.lights = 30; }
    startAt = opts.time != null ? opts.time : 0;
    t0 = performance.now();
    resize();
    draw(t0);
    requestAnimationFrame(() => canvas.classList.add('is-live'));
    start();
  };

  const waitForCompile = () => {
    if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) { requestAnimationFrame(waitForCompile); return; }
    ready();
  };
  requestAnimationFrame(waitForCompile);

  const hero = canvas.closest('.hero') || canvas.parentElement;
  new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    if (r.width && r.height) { cssW = r.width; cssH = r.height; }
    if (U) { resize(); if (reduced || opts.still) draw(performance.now()); }
  }).observe(canvas);
  const io = new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) start();
  }, { threshold: 0 });
  io.observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  addEventListener('scroll', () => {
    const h = hero.offsetHeight || 1;
    scrollP = Math.min(1, Math.max(0, scrollY / h));
  }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); visible = false; canvas.classList.remove('is-live'); });

  return { draw };
}
