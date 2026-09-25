var fe=`#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`,J=`#version 300 es
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
}`;function Q(o,e={}){if(!o)return null;let d=matchMedia("(prefers-reduced-motion: reduce)").matches,n=o.getContext("webgl2",{antialias:!1,alpha:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!!e.still,powerPreference:"high-performance"});if(!n)return null;let u=e.debug?J.replace("precision highp float;",`precision highp float;
#define DEBUG ${e.debug}`):J,c=n.createProgram(),r=[[n.VERTEX_SHADER,fe],[n.FRAGMENT_SHADER,u]].map(([x,q])=>{let L=n.createShader(x);return n.shaderSource(L,q),n.compileShader(L),n.attachShader(c,L),L});n.bindAttribLocation(c,0,"p"),n.linkProgram(c);let t=n.getExtension("KHR_parallel_shader_compile"),l=matchMedia("(pointer: coarse)").matches,a=e.scale||(l?.6:.8),p=.45,m=e.scale||1,h=innerWidth,i=innerHeight,s=null,f=()=>{let q=Math.min(a,Math.sqrt((l?6e5:13e5)/Math.max(1,h*i))),L=Math.max(2,Math.round(h*q)),R=Math.max(2,Math.round(i*q));(o.width!==L||o.height!==R)&&(o.width=L,o.height=R),n.viewport(0,0,L,R)},v=0,g=0,E=0,w=!0,y=0,b=0,A=16,M=0,k=1,N=0,P=x=>{if(!s)return;let q=g+(x-v)/1e3,L=e.lights!=null?e.lights:q;n.uniform2f(s.res,o.width,o.height),n.uniform1f(s.time,q),n.uniform1f(s.lights,L),n.uniform1f(s.pitch,e.pitch!=null?e.pitch:-.2-E*.36),n.drawArrays(n.TRIANGLES,0,3)},T=x=>{if(y=0,!(!w||document.hidden)&&(y=requestAnimationFrame(T),!(++N%k))){if(b){let q=(x-b)/k;A=A*.9+Math.min(q,100)*.1,++M%40===0&&(A>24?a>p?(a=Math.max(p,a*.85),f()):k<3&&k++:A<12&&k>1?k--:A<15&&k===1&&a<m&&(a=Math.min(m,a*1.08),f()))}b=x,P(x)}},C=()=>{y||!s||d||e.still||(b=0,y=requestAnimationFrame(T))},Y=()=>{if(!n.getProgramParameter(c,n.LINK_STATUS)){console.warn("hero shader unavailable",n.getProgramInfoLog(c),r.map(q=>n.getShaderInfoLog(q)).join(" "));return}n.useProgram(c);let x=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,x),n.bufferData(n.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),n.STATIC_DRAW),n.enableVertexAttribArray(0),n.vertexAttribPointer(0,2,n.FLOAT,!1,0,0),s={res:n.getUniformLocation(c,"uRes"),time:n.getUniformLocation(c,"uTime"),lights:n.getUniformLocation(c,"uLights"),pitch:n.getUniformLocation(c,"uPitch")},d&&!e.still&&(e.time=24,e.lights=30),g=e.time!=null?e.time:0,v=performance.now(),f(),P(v),requestAnimationFrame(()=>o.classList.add("is-live")),C()},W=()=>{if(t&&!n.getProgramParameter(c,t.COMPLETION_STATUS_KHR)){requestAnimationFrame(W);return}Y()};requestAnimationFrame(W);let I=o.closest(".hero")||o.parentElement;return new ResizeObserver(x=>{let q=x[0].contentRect;q.width&&q.height&&(h=q.width,i=q.height),s&&(f(),(d||e.still)&&P(performance.now()))}).observe(o),new IntersectionObserver(x=>{w=x[0].isIntersecting,w&&C()},{threshold:0}).observe(I),document.addEventListener("visibilitychange",()=>{document.hidden||C()}),addEventListener("scroll",()=>{let x=I.offsetHeight||1;E=Math.min(1,Math.max(0,scrollY/x))},{passive:!0}),o.addEventListener("webglcontextlost",x=>{x.preventDefault(),w=!1,o.classList.remove("is-live")}),{draw:P}}var de="http://www.w3.org/2000/svg",ue=matchMedia("(prefers-reduced-motion: reduce)").matches,pe=0;function $(o,e,d){let n=document.createElementNS(de,o);if(e)for(let u in e)n.setAttribute(u,e[u]);return d&&d.appendChild(n),n}function S(o,e,d,n,u,c="start"){let r=$("text",{x:e,y:d,class:u||"","text-anchor":c},o);return r.textContent=n,r}function H(o,e){return $("svg",{viewBox:`0 0 ${o} ${e}`,width:o,height:e,"aria-hidden":"true",focusable:"false"})}function z(o,e,d,n,u){let[c,r,t,l]=u.map(a=>Math.max(0,Math.min(a,d/2,n/2)));return`M${o+c},${e}H${o+d-r}${r?`A${r},${r} 0 0 1 ${o+d},${e+r}`:""}V${e+n-t}${t?`A${t},${t} 0 0 1 ${o+d-t},${e+n}`:""}H${o+l}${l?`A${l},${l} 0 0 1 ${o},${e+n-l}`:""}V${e+c}${c?`A${c},${c} 0 0 1 ${o+c},${e}`:""}Z`}var he=o=>1-Math.pow(1-o,3);function U(o,e,d){if(ue||o<=0)return e(1),d&&d(),()=>{};let n=0,u=performance.now(),c=r=>{let t=Math.min(1,(r-u)/o);e(he(t)),t<1?n=requestAnimationFrame(c):d&&d()};return n=requestAnimationFrame(c),()=>cancelAnimationFrame(n)}var me=o=>o.toLocaleString("en-US");function ee(o,e){if(!o.closest(".scrolly-graphic"))return 1/0;let d=0;for(let u of o.children){if(u===e||u.tagName==="SCRIPT")continue;let c=getComputedStyle(u);c.display!=="none"&&(d+=u.offsetHeight+parseFloat(c.marginTop)+parseFloat(c.marginBottom))}let n=innerWidth<1e3?innerHeight*.64:innerHeight-56-36;return Math.max(160,n-d)}var te=()=>document.querySelector("[data-tip]"),ve={accent:"--accent",accent2:"--accent-2",cool:"--cool",context:"--context"};function V(o,e,d,n,u){let c=te();if(!c)return;c.replaceChildren();let r=document.createElement("span");if(r.className="tip-v",r.textContent=d,c.appendChild(r),n){let p=document.createElement("span");if(p.className="tip-l",u){let h=document.createElement("i");h.className="tip-key",h.style.background=`var(${ve[u]||"--ink-3"})`,p.appendChild(h)}let m=document.createElement("span");m.textContent=n,p.appendChild(m),c.appendChild(p)}c.hidden=!1;let t=c.getBoundingClientRect(),l=o+14,a=e-t.height-12;l+t.width>innerWidth-8&&(l=o-t.width-14),a<64&&(a=e+18),c.style.transform=`translate(${Math.max(8,l)}px, ${a}px)`}function D(){let o=te();o&&(o.hidden=!0)}function F(o,e){let d=u=>{let c=e(u);if(!c)return D();let r,t;if(u&&"clientX"in u&&u.clientX)r=u.clientX,t=u.clientY;else{let l=(c.anchor||o).getBoundingClientRect();r=l.left+l.width/2,t=l.top}V(r,t,c.value,c.label,c.color),c.onHot&&c.onHot(!0)},n=()=>{D();let u=e(null);u&&u.onHot&&u.onHot(!1)};o.addEventListener("pointermove",d),o.addEventListener("pointerdown",d),o.addEventListener("pointerleave",n),o.addEventListener("focus",d),o.addEventListener("blur",n)}function O(o,e){let d=o.querySelector("[data-legend]");if(d){d.replaceChildren();for(let n of e){let u=document.createElement("span");u.className="key";let c=document.createElement("i");c.className=`sw c-${n.color}${n.dot?" sw-dot":""}`,u.appendChild(c);let r=document.createElement("span");if(r.textContent=n.label,u.appendChild(r),n.value!=null){let t=document.createElement("b");t.textContent=n.value,u.appendChild(t)}d.appendChild(u)}}}function G(o,e,d){let n=o.querySelector("[data-body]"),u=e.groups.reduce((h,i)=>h+i.v,0),c=[];e.groups.forEach((h,i)=>{for(let s=0;s<Math.round(h.v);s++)c.push(i)});let r=d.unitLabel||(h=>`${h.v}${d.suffix||""}`);O(o,e.groups.map(h=>({label:h.label,color:h.color,value:r(h)})));let t=[],l=!1,a=-1;function p(h){t.forEach((i,s)=>{let f=e.groups[c[s]];i.style.setProperty("--d",h?`${Math.round(s*d.stagger)}ms`:"0ms"),i.setAttribute("class",`cell mark ${l?`f-${f.color}`:"f-empty"}${a===c[s]?" is-hot":""}`)})}function m(h){let i=d.cols(h),s=Math.ceil(u/i),f=d.gap||2,v=Math.min(d.max,(h-f*(i-1))/i),g=i*v+f*(i-1),E=s*v+f*(s-1),w=H(g,E);w.style.maxWidth=`${g}px`,t=[];for(let y=0;y<u;y++){let b=y%i,A=Math.floor(y/i),M=d.round?$("circle",{cx:b*(v+f)+v/2,cy:A*(v+f)+v/2,r:v/2},w):$("rect",{x:b*(v+f),y:A*(v+f),width:v,height:v,rx:Math.min(3,v*.16)},w);M.dataset.i=y,t.push(M)}n.replaceChildren(w),n.classList.toggle("is-hovering",a>=0),p(!1),F(w,y=>{if(!y)return a=-1,n.classList.remove("is-hovering"),p(!1),null;let b=y.target&&y.target.dataset?y.target.dataset.i:void 0;if(b===void 0||!l)return null;let A=c[+b],M=e.groups[A];return a!==A&&(a=A,n.classList.add("is-hovering"),p(!1)),{value:r(M),label:M.label,color:M.color}})}return{render:m,enter(){l||(l=!0,p(!0))}}}function xe(o,e){let d=o.querySelector("[data-body]"),n=document.createElement("p");n.className="readout",n.innerHTML='<span class="readout-v"></span><span class="readout-l"></span>',o.querySelector(".viz-head").after(n);let u=n.firstChild,c=n.lastChild,r=[],t=0,l=0,a={0:{v:"$0",l:"Scroll to count",legend:[]},1:{v:"$410bn",l:"spent in 2025",legend:[{label:"2025 spending",color:"context",value:"$410bn"}]},2:{v:"$725bn",l:"planned for 2026",legend:[{label:"2025 level",color:"context",value:"$410bn"},{label:"Added for 2026",color:"accent",value:"+$315bn"}]},3:{v:"$200bn",l:"Amazon alone, 2026",legend:[{label:"Amazon",color:"cool",value:"$200bn"},{label:"Alphabet, Microsoft and Meta",color:"context",value:"$525bn"}]}};function p(i,s){return s>=3?i<e.amazon?"f-cool":"f-context":s>=2?i<e.base?"f-context":"f-accent":s>=1&&i<e.base?"f-context":"f-empty"}function m(i){let s=t>l;r.forEach((v,g)=>{let E=0;i&&s&&(t===1?E=g*1.1:t===2?E=Math.max(0,g-e.base)*1.6:t===3&&(E=(g<e.amazon?g:g-e.amazon)*.6)),v.style.setProperty("--d",`${Math.round(E)}ms`),v.setAttribute("class",`cell ${p(g,t)}`)});let f=a[t];u.textContent=f.v,c.textContent=f.l,O(o,f.legend)}function h(i){let s=i>=620?29:25,f=Math.ceil(e.total/s),v=2,g=Math.min((i-v*(s-1))/s,(ee(o,d)-v*(f-1))/f),E=s*g+v*(s-1),w=f*g+v*(f-1),y=H(E,w);y.style.maxWidth=`${E}px`,r=[];for(let b=0;b<e.total;b++){let A=b%s,M=Math.floor(b/s),k=$("rect",{x:A*(g+v),y:M*(g+v),width:g,height:g,rx:Math.min(2.5,g*.18)},y);k.dataset.i=b,r.push(k)}d.replaceChildren(y),l=t,m(!1),F(y,b=>{if(!b)return null;let A=b.target&&b.target.dataset?b.target.dataset.i:void 0;if(A===void 0||t===0)return null;let M=+A;return t>=3?M<e.amazon?{value:"$200bn",label:"Amazon, planned for 2026",color:"cool"}:{value:"$525bn",label:"Alphabet, Microsoft and Meta, 2026",color:"context"}:M<e.base?{value:"$410bn",label:"Spent by the four in 2025",color:"context"}:t>=2?{value:"+$315bn",label:"Added for 2026",color:"accent"}:null})}return{render:h,step(i){i!==t&&(l=t,t=i,m(!0))},enter(){}}}function ge(o,e){let d=o.querySelector("[data-body]"),n=document.createElement("p");n.className="readout",n.innerHTML='<span class="readout-v"></span><span class="readout-l"></span>',o.querySelector(".viz-head").after(n);let u=n.firstChild,c=n.lastChild,r=Math.round(e.steps[e.steps.length-1].v/e.per),t=e.steps.map(i=>Math.round(i.v/e.per)),l=[],a=0,p=0;function m(i){let s=a===0?0:t[a-1],f=a>p&&p>0?t[p-1]:0;if(l.forEach((v,g)=>{let E=i&&a>p&&g>=f?(g-f)*(a===1?14:2.2):0;v.style.setProperty("--d",`${Math.round(E)}ms`),v.setAttribute("class",`cell ${g<s?a===2&&g<t[0]?"f-context":"f-accent":"f-empty"}`)}),a===0)u.textContent="0",c.textContent="Scroll to count";else{let v=e.steps[a-1];u.textContent=v.label,c.textContent=`deepfakes shared in ${v.year}`}}function h(i){let s=i>=620?25:20,f=Math.ceil(r/s),v=i>=620?6:4,g=Math.min(22,(i-v*(s-1))/s,(ee(o,d)-v*(f-1))/f),E=s*g+v*(s-1),w=f*g+v*(f-1),y=H(E,w);y.style.maxWidth=`${E}px`,l=[];for(let b=0;b<r;b++){let A=b%s,M=Math.floor(b/s),k=$("circle",{cx:A*(g+v)+g/2,cy:M*(g+v)+g/2,r:g/2},y);k.dataset.i=b,l.push(k)}d.replaceChildren(y),p=a,m(!1),F(y,b=>{if(!b||a===0)return null;let A=b.target&&b.target.dataset?b.target.dataset.i:void 0;return A===void 0?null:+A<t[0]?{value:"500,000",label:"Shared in 2023",color:a===2?"context":"accent"}:a===2?{value:"8 million",label:"Shared in 2025",color:"accent"}:null})}return{render:h,step(i){i!==a&&(p=a,a=i,m(!0))},enter(){}}}function ye(o,e){let d=o.querySelector("[data-body]"),n=!1,u=null,c=null;function r(t){let l=t<560,a={t:22,r:l?58:170,b:30,l:46},p=Math.round(Math.max(250,Math.min(380,t*.44))),m=t-a.l-a.r,h=p-a.t-a.b,i=x=>a.l+(x-e.xMin)/(e.xMax-e.xMin)*m,s=x=>a.t+h-x/e.yMax*h,f=H(t,p);e.yTicks.forEach((x,q)=>{$("line",{x1:a.l,x2:a.l+m,y1:s(x),y2:s(x),class:x===0?"axis":"grid"},f),S(f,a.l-10,s(x)+4,me(x),"","end"),q===e.yTicks.length-1&&S(f,a.l+6,s(x)-8,e.unit,"","start")}),(l?[2024,2026,2028,2030]:[2024,2025,2026,2027,2028,2029,2030]).forEach(x=>S(f,i(x),p-8,String(x),"","middle"));let g=`clip${++pe}`,E=$("rect",{x:a.l-12,y:0,width:n?t:0,height:p},$("clipPath",{id:g},$("defs",null,f))),w=$("g",{"clip-path":`url(#${g})`},f),y=e.points,b=y.filter(x=>!x.proj),A=b[b.length-1],M=y.filter(x=>x.proj),k=(x,q)=>$("path",{d:`M${i(x[0].x)},${s(0)}${x.map(L=>`L${i(L.x)},${s(L.y)}`).join("")}L${i(x[x.length-1].x)},${s(0)}Z`,fill:q},w);k(b,"var(--accent-wash)"),k([A,...M],"rgba(212, 120, 46, 0.045)"),$("path",{d:`M${b.map(x=>`${i(x.x)},${s(x.y)}`).join("L")}`,fill:"none",class:"s-accent","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"},w),$("path",{d:`M${i(A.x)},${s(A.y)}${M.map(x=>`L${i(x.x)},${s(x.y)}`).join("")}`,fill:"none",class:"s-accent","stroke-width":2,"stroke-dasharray":"2 6","stroke-linecap":"round"},w);let N=$("line",{x1:0,x2:0,y1:a.t,y2:a.t+h,class:"axis",opacity:0},f),P=y.map(x=>$("circle",{cx:i(x.x),cy:s(x.y),r:4.5,class:"f-accent",stroke:"var(--bg)","stroke-width":2,tabindex:0,role:"img","aria-label":`${x.x}${x.proj?", projected":""}: ${x.y} ${e.unit}`},w)),T=$("g",null,w);S(T,i(y[0].x)+8,s(y[0].y)+20,y[0].label,"t-val"),S(T,i(y[1].x)+8,s(y[1].y)-12,y[1].label,"t-val");let C=y[y.length-1];S(T,i(C.x)+12,s(C.y)+5,`${C.label}${l?"":" TWh"}`,"t-val"),!l&&C.note&&(S(T,i(C.x)+12,s(C.y)+24,"projected, 2030","t-note"),S(T,i(C.x)+12,s(C.y)+42,C.note,"t-note"));let Y=$("rect",{x:a.l,y:a.t,width:m+12,height:h,fill:"transparent"},f);d.replaceChildren(f),c={clip:E,w:t};let W=x=>{let q=0;return y.forEach((L,R)=>{Math.abs(i(L.x)-x)<Math.abs(i(y[q].x)-x)&&(q=R)}),q},I=x=>{if(P.forEach((q,L)=>q.setAttribute("r",L===x?6:4.5)),x<0){N.setAttribute("opacity",0);return}N.setAttribute("x1",i(y[x].x)),N.setAttribute("x2",i(y[x].x)),N.setAttribute("opacity",1)},_=x=>({value:`${y[x].label.replace("\u2248","about ")} ${e.unit}`,label:y[x].proj?`${y[x].x}, IEA projection`:String(y[x].x),color:"accent"});Y.addEventListener("pointermove",x=>{if(!n)return;let q=f.getBoundingClientRect(),L=W(x.clientX-q.left);I(L);let R=P[L].getBoundingClientRect(),j=_(L);V(R.left+R.width/2,R.top,j.value,j.label,j.color)}),Y.addEventListener("pointerleave",()=>{I(-1),D()}),P.forEach((x,q)=>{x.addEventListener("focus",()=>{I(q);let L=x.getBoundingClientRect(),R=_(q);V(L.left+L.width/2,L.top,R.value,R.label,R.color)}),x.addEventListener("blur",()=>{I(-1),D()})})}return{render:r,enter(){if(n)return;n=!0,u&&u();let t=c.w;u=U(1800,l=>c.clip.setAttribute("width",t*l))}}}function be(o,e){let d=o.querySelector("[data-body]"),n=!1,u=null,c=0;function r(t){c=t;let l=104,a=44,p=14,m=s=>s/100*t,h=H(t,l);$("path",{d:z(0,a,t,p,[4,4,4,4]),class:"f-accent",opacity:.18},h),u=$("path",{d:z(0,a,n?m(e.value):0,p,[0,4,4,0]),class:"f-accent mark",tabindex:0,role:"img","aria-label":e.valueLabel},h),S(h,m(e.value),a-12,e.valueLabel,"t-val","start");let i=t<560;e.marks.forEach((s,f)=>{$("line",{x1:m(s.v),x2:m(s.v),y1:a-5,y2:a+p+6,stroke:"var(--ink-2)","stroke-width":1},h);let v=`${s.label} \xB7 ${s.sub}`;i&&f===e.marks.length-1?S(h,m(s.v)-6,a-12,v,"t-note","end"):S(h,m(s.v),a+p+22,v,"t-note",i?"start":s.v>15?"end":"middle")}),S(h,0,l-2,"0%","","start"),S(h,t,l-2,"100%","","end"),d.replaceChildren(h),F(u,s=>s?{value:`${e.value}%`,label:"Share of Ireland\u2019s metered electricity, 2025",color:"accent",anchor:u}:null)}return{render:r,enter(){if(n)return;n=!0;let t=e.value/100*c;U(1400,l=>u.setAttribute("d",z(0,44,t*l,14,[0,4,4,0])))}}}function we(o,e){let d=o.querySelector("[data-body]");O(o,[{label:"Baseline year = 100",color:"context",dot:!0},{label:"2025",color:"accent",dot:!0}]);let n=!1,u=[];function c(r){let l={t:6,r:48,b:28,l:r<520?96:150},a=58,p=l.t+e.rows.length*a+l.b,m=r-l.l-l.r,h=e.xMin||0,i=f=>l.l+(f-h)/(e.xMax-h)*m,s=H(r,p);e.xTicks.forEach(f=>{$("line",{x1:i(f),x2:i(f),y1:l.t,y2:p-l.b,class:f===100?"axis":"grid"},s),S(s,i(f),p-8,String(f),"","middle")}),u=e.rows.map((f,v)=>{let g=l.t+v*a+a/2;S(s,0,g-2,f.name,"t-name"),S(s,0,g+15,`vs ${f.base}`,"");let E=$("line",{x1:i(100),x2:i(n?f.v:100),y1:g,y2:g,class:"s-context","stroke-width":2,"stroke-linecap":"round"},s);$("circle",{cx:i(100),cy:g,r:5,class:"f-context",stroke:"var(--bg)","stroke-width":2},s);let w=$("circle",{cx:i(n?f.v:100),cy:g,r:6,class:"f-accent mark",stroke:"var(--bg)","stroke-width":2,tabindex:0,role:"img","aria-label":`${f.name}: ${f.v} in 2025, ${f.base} = 100`},s),y=S(s,n?i(f.v)+14:i(100)+14,g+5,String(f.v),"t-val");return n||y.setAttribute("opacity",0),F(w,b=>b?{value:`${f.v}`,label:`${f.name}, 2025 (${f.base} = 100)`,color:"accent",anchor:w}:null),{conn:E,end:w,val:y,from:i(100),to:i(f.v)}}),d.replaceChildren(s)}return{render:c,enter(){n||(n=!0,U(1500,r=>u.forEach(t=>{let l=t.from+(t.to-t.from)*r;t.conn.setAttribute("x2",l),t.end.setAttribute("cx",l),t.val.setAttribute("x",l+14),t.val.setAttribute("opacity",r)})))}}}function $e(o,e){let d=o.querySelector("[data-body]");O(o,e.groups.map(r=>({label:r.label,color:r.color,value:`${r.v}%`})));let n=!1,u=[];function c(r){let m=r-2*(e.groups.length-1),h=H(r,64),i=0;u=e.groups.map((s,f)=>{let v=s.v/100*m,g=[f===0?4:0,f===e.groups.length-1?4:0,f===e.groups.length-1?4:0,f===0?4:0],E=$("path",{d:z(i,30,n?v:0,24,g),class:`f-${s.color} mark`,tabindex:0,role:"img","aria-label":`${s.label}: ${s.v}%`},h),w=`${s.v}%`,y=v>w.length*8+10?S(h,i,20,w,"t-val"):null;y&&!n&&y.setAttribute("opacity",0),F(E,A=>A?{value:`${s.v}%`,label:s.label,color:s.color,anchor:E}:null);let b={path:E,t:y,x:i,w:v,r:g};return i+=v+2,b}),d.replaceChildren(h)}return{render:c,enter(){n||(n=!0,U(1500,r=>{u.forEach((t,l)=>{let a=Math.max(0,Math.min(1,r*u.length-l*.6));t.path.setAttribute("d",z(t.x,30,t.w*a,24,t.r)),t.t&&t.t.setAttribute("opacity",a)})},()=>u.forEach(r=>{r.path.setAttribute("d",z(r.x,30,r.w,24,r.r)),r.t&&r.t.setAttribute("opacity",1)})))}}}function Ee(o,e){let d=o.querySelector("[data-body]");O(o,[{label:e.neg.label,color:"accent"},{label:e.pos.label,color:"cool"}]);let n=!1,u=null;function c(r){let p=r/2,m=w=>w/e.max*(r/2-4),h=H(r,124),i=$("path",{d:z(p-(n?m(e.neg.v):0),36,n?m(e.neg.v):0,24,[4,0,0,4]),class:"f-accent mark",tabindex:0,role:"img","aria-label":`${e.neg.label}: ${e.neg.v} million`},h),s=$("path",{d:z(p+1,36,n?m(e.pos.v):0,24,[0,4,4,0]),class:"f-cool mark",tabindex:0,role:"img","aria-label":`${e.pos.label}: ${e.pos.v} million`},h);$("line",{x1:p,x2:p,y1:24,y2:72,class:"axis"},h);let f=S(h,p-m(e.neg.v),24,`${e.neg.v}m ${e.neg.label.toLowerCase()}`,"t-val","start"),v=S(h,p+m(e.pos.v),24,`${e.pos.v}m ${e.pos.label.toLowerCase()}`,"t-val","end"),g=86;$("line",{x1:p,x2:p+m(e.net),y1:g,y2:g,stroke:"var(--ink-2)","stroke-width":1},h),$("line",{x1:p+m(e.net),x2:p+m(e.net),y1:g-5,y2:g+5,stroke:"var(--ink-2)","stroke-width":1},h);let E=S(h,p+m(e.net),g+22,`Net +${e.net}m`,"t-strong","middle");[f,v,E].forEach(w=>w.setAttribute("opacity",n?1:0)),F(i,w=>w?{value:`${e.neg.v} million`,label:`${e.neg.label}, 2025\u20132030`,color:"accent",anchor:i}:null),F(s,w=>w?{value:`${e.pos.v} million`,label:`${e.pos.label}, 2025\u20132030`,color:"cool",anchor:s}:null),d.replaceChildren(h),u={neg:i,pos:s,labels:[f,v,E],mid:p,kn:m(e.neg.v),kp:m(e.pos.v)}}return{render:c,enter(){n||(n=!0,U(1500,r=>{u.neg.setAttribute("d",z(u.mid-u.kn*r,36,u.kn*r,24,[4,0,0,4])),u.pos.setAttribute("d",z(u.mid+1,36,u.kp*r,24,[0,4,4,0])),u.labels.forEach(t=>t.setAttribute("opacity",r))}))}}}function qe(o,e){let d=o.querySelector("[data-body]"),n=!1,u=[],c=e.suffix||"";function r(t){let a={t:4,r:48,b:28,l:t<520?116:156},p=36,m=18,h=a.t+e.rows.length*p+a.b,i=t-a.l-a.r,s=v=>a.l+v/e.max*i,f=H(t,h);e.ticks.forEach(v=>{$("line",{x1:s(v),x2:s(v),y1:a.t,y2:h-a.b,class:v===0?"axis":"grid"},f),S(f,s(v),h-8,`${v}${c}`,"","middle")}),u=e.rows.map((v,g)=>{let E=a.t+g*p+(p-m)/2;S(f,a.l-12,E+m/2+4.5,v.name,"t-name","end");let w=$("path",{d:z(a.l,E,n?s(v.v)-a.l:0,m,[0,4,4,0]),class:"f-accent mark",tabindex:0,role:"img","aria-label":`${v.name}: ${v.v}${c}${e.unit?` ${e.unit}`:""}`},f),y=S(f,(n?s(v.v):a.l)+8,E+m/2+4.5,`${v.v}${c}`,"t-val");return n||y.setAttribute("opacity",0),F(w,b=>b?{value:`${v.v}${c}${e.unit?` ${e.unit}`:""}`,label:v.name,color:"accent",anchor:w}:null),{bar:w,val:y,y:E,len:s(v.v)-a.l,x0:a.l}}),d.replaceChildren(f)}return{render:r,enter(){n||(n=!0,U(1400,t=>u.forEach((l,a)=>{let p=Math.max(0,Math.min(1,t*1.4-a*.08));l.bar.setAttribute("d",z(l.x0,l.y,l.len*p,18,[0,4,4,0])),l.val.setAttribute("x",l.x0+l.len*p+8),l.val.setAttribute("opacity",p)}),()=>u.forEach(t=>{t.bar.setAttribute("d",z(t.x0,t.y,t.len,18,[0,4,4,0])),t.val.setAttribute("x",t.x0+t.len+8),t.val.setAttribute("opacity",1)})))}}}function Ae(o,e){let d=o.querySelector("[data-body]"),n=document.createElement("div");n.className="timer";let u=86,c=2*Math.PI*u,r=$("svg",{viewBox:"0 0 200 200","aria-hidden":"true"});$("circle",{cx:100,cy:100,r:u,class:"timer-track"},r);let t=$("circle",{cx:100,cy:100,r:u,class:"timer-arc","stroke-dasharray":c,"stroke-dashoffset":c},r),l=S(r,100,108,"0.0","timer-num","middle");S(r,100,136,`of ${e.seconds} seconds`,"timer-unit","middle");let a=document.createElement("div");a.className="timer-copy";let p=document.createElement("p");p.setAttribute("aria-live","polite"),p.textContent="Press start and sit with it. Nothing else happens.";let m=document.createElement("button");m.type="button",m.className="btn",m.textContent="Start",a.append(p,m),n.append(r,a),d.replaceChildren(n);let h=0,i=Math.round(3600/e.seconds);return m.addEventListener("click",()=>{if(h)return;m.classList.add("is-running"),m.textContent="Running",m.disabled=!0,p.classList.remove("timer-done"),p.textContent="One target.";let s=performance.now(),f=v=>{let g=Math.min(e.seconds,(v-s)/1e3);if(t.setAttribute("stroke-dashoffset",c*(1-g/e.seconds)),l.textContent=g.toFixed(1),g<e.seconds){h=requestAnimationFrame(f);return}h=0,m.classList.remove("is-running"),m.disabled=!1,m.textContent="Again",p.classList.add("timer-done"),p.textContent=`That was one review. At this pace, a single officer could sign off on ${i} targets in an hour.`};h=requestAnimationFrame(f)}),{render(){},enter(){}}}var Se={capex:xe,dots:ge,line:ye,meter:be,dumbbell:we,stack:$e,diverge:Ee,bars:qe,timer:Ae,waffle:(o,e)=>G(o,e,{cols:()=>10,max:30,gap:3,stagger:9,suffix:"%"}),survey:(o,e)=>G(o,e,{cols:()=>10,max:26,gap:5,round:!0,stagger:11,unitLabel:d=>String(d.v)}),seats:(o,e)=>G(o,e,{cols:d=>d>=640?e.cols.wide:e.cols.narrow,max:22,gap:2,stagger:e.groups.reduce((d,n)=>d+n.v,0)>120?4:7,unitLabel:d=>String(d.v)})};function ne(){let o=[];document.querySelectorAll("figure[data-chart]").forEach(t=>{let l=Se[t.dataset.chart],a=t.querySelector("script.viz-data");if(!l||!a)return;let p;try{p=l(t,JSON.parse(a.textContent))}catch(f){console.error("chart failed",t.dataset.chart,f);return}let m=t.querySelector("[data-body]"),h=0,i=()=>{let f=Math.floor(m.getBoundingClientRect().width);f>0&&Math.abs(f-h)>1&&(h=f,p.render(f))},s=()=>{if(i(),new ResizeObserver(i).observe(m),t.closest(".scrolly-graphic")){let f=innerHeight;addEventListener("resize",()=>{Math.abs(innerHeight-f)>40&&(f=innerHeight,p.render(h))})}};o.push({fig:t,chart:p,start:s})});let e=new IntersectionObserver(t=>{t.forEach(l=>{if(!l.isIntersecting)return;let a=o.find(p=>p.fig===l.target);a&&a.start(),e.unobserve(l.target)})},{rootMargin:"120% 0px 120% 0px"});o.forEach(t=>e.observe(t.fig));let d=new IntersectionObserver(t=>{t.forEach(l=>{if(!l.isIntersecting)return;let a=o.find(p=>p.fig===l.target);a&&a.chart.enter(),d.unobserve(l.target)})},{threshold:.35});o.forEach(t=>{t.fig.closest("[data-scrolly]")||d.observe(t.fig)});let n=[...document.querySelectorAll("[data-scrolly]")].map(t=>({el:t,steps:[...t.querySelectorAll(".step")],chart:o.find(l=>t.contains(l.fig))?.chart,active:-1,near:!1})),u=new IntersectionObserver(t=>{t.forEach(l=>{let a=n.find(p=>p.el===l.target);a&&(a.near=l.isIntersecting,a.near&&c())})},{rootMargin:"50% 0px 50% 0px"});n.forEach(t=>u.observe(t.el));let c=()=>{let t=innerHeight*(innerWidth<1e3?.8:.62);n.forEach(l=>{if(!l.near)return;let a=0;l.steps.forEach((p,m)=>{p.getBoundingClientRect().top<t&&(a=m+1)}),a!==l.active&&(l.active=a,l.steps.forEach((p,m)=>p.classList.toggle("is-active",m+1===a)),l.chart&&l.chart.step&&l.chart.step(a))})},r=!1;addEventListener("scroll",()=>{r||(r=!0,requestAnimationFrame(()=>{r=!1,c()}))},{passive:!0}),addEventListener("resize",c),document.addEventListener("pointerdown",t=>{(!t.target.closest||!t.target.closest(".viz-body"))&&D()}),addEventListener("scroll",D,{passive:!0})}var Z=matchMedia("(prefers-reduced-motion: reduce)").matches,X=365*24*3600,K={capex:725e9/X,power:485e9/X,fakes:8e6/X,jobs:16e3*12/X},oe={usd:o=>`$${Math.floor(o).toLocaleString("en-US")}`,kwh:o=>`${Math.floor(o).toLocaleString("en-US")} kWh`,int:o=>Math.floor(o).toLocaleString("en-US")};function re(){let o=performance.now(),e=[...document.querySelectorAll("[data-ledger]")].map(c=>({n:c,rate:K[c.dataset.ledger],f:oe[c.dataset.format]||oe.int,last:""})),d=document.querySelector("[data-ledger-next]"),n=document.querySelector("[data-ledger-minutes]"),u=()=>{if(document.hidden)return;let c=(performance.now()-o)/1e3;for(let r of e){let t=r.f(c*r.rate);t!==r.last&&(r.n.textContent=t,r.last=t)}if(d){let r=c*K.jobs,t=Math.ceil((Math.floor(r)+1-r)/K.jobs);d.textContent=`at 16,000 a month \xB7 next in ${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`}if(n){let r=Math.floor(c/60);n.textContent=r<1?"less than a minute":r===1?"1 minute":`${r} minutes`}};u(),setInterval(u,100)}function ae(){let o=document.querySelector("[data-mast]"),e=document.querySelector("[data-progress]"),d=document.querySelector("[data-mast-num]"),n=document.querySelector("[data-mast-title]"),u=document.querySelector(".hero"),c=[...document.querySelectorAll(".chapter")],r=new Map([...document.querySelectorAll(".toc-list a")].map(m=>[m.hash.slice(1),m])),t=null,l=()=>{let m=scrollY,h=document.documentElement.scrollHeight-innerHeight;e.style.setProperty("--p",h>0?(m/h).toFixed(4):0),o.classList.toggle("is-top",u&&m<u.offsetHeight-80);let i=innerHeight*.4,s=null;for(let f of c)f.getBoundingClientRect().top<i&&(s=f);s!==t&&(t=s,d.textContent=s?s.dataset.num:"",n.textContent=s?s.dataset.title:"",r.forEach((f,v)=>f.classList.toggle("is-current",s&&v===s.id)))},a=!1;addEventListener("scroll",()=>{a||(a=!0,requestAnimationFrame(()=>{a=!1,l()}))},{passive:!0}),addEventListener("resize",l),requestAnimationFrame(l);let p=()=>{c.forEach(m=>{let h=r.get(m.id);if(!h)return;let i=m.getBoundingClientRect(),s=Math.min(1,Math.max(0,(innerHeight*.5-i.top)/i.height)),f=parseFloat(h.style.getPropertyValue("--read")||0);s>f&&h.style.setProperty("--read",s.toFixed(3))})};addEventListener("scroll",p,{passive:!0}),requestAnimationFrame(p)}function se(){let o=document.querySelector("[data-toc]"),e=document.querySelector("[data-toc-open]"),d=document.querySelector("[data-toc-close]");if(!o||!e)return;o.querySelectorAll(".toc-list a").forEach((r,t)=>r.style.setProperty("--i",t));let n=null,u=()=>{n=document.activeElement,o.hidden=!1,e.setAttribute("aria-expanded","true"),document.documentElement.style.overflow="hidden",requestAnimationFrame(()=>{o.classList.add("is-open"),d.focus({preventScroll:!0})})},c=(r=!0)=>{o.classList.remove("is-open"),e.setAttribute("aria-expanded","false"),document.documentElement.style.overflow="",setTimeout(()=>{o.hidden=!0},Z?0:300),r&&n&&n.focus({preventScroll:!0})};e.addEventListener("click",u),d.addEventListener("click",()=>c()),o.addEventListener("click",r=>{r.target.closest("a")&&c(!1)}),document.addEventListener("keydown",r=>{if(!o.hidden&&(r.key==="Escape"&&(r.preventDefault(),c()),r.key==="Tab")){let t=[...o.querySelectorAll("a, button")],l=t[0],a=t[t.length-1];r.shiftKey&&document.activeElement===l?(r.preventDefault(),a.focus()):!r.shiftKey&&document.activeElement===a&&(r.preventDefault(),l.focus())}})}function ce(){let o=document.querySelector("[data-notepop]");if(!o)return;let e=null,d=c=>{let r=c.getBoundingClientRect(),t=o.getBoundingClientRect(),l=Math.min(Math.max(12,r.left+r.width/2-t.width/2),innerWidth-t.width-12),a=r.bottom+10;a+t.height>innerHeight-12&&(a=Math.max(12,r.top-t.height-10)),o.style.transform=`translate(${Math.round(l)}px, ${Math.round(a)}px)`},n=()=>{e&&(e.classList.remove("is-open"),e.setAttribute("aria-expanded","false"),e=null,o.hidden=!0)},u=c=>{let r=c.dataset.fn,t=document.getElementById(`s${r}`);if(!t)return;e&&n(),o.replaceChildren();let l=document.createElement("span");l.className="note-pop-n",l.textContent=`Source ${r}`;let a=document.createElement("div");a.className="note-pop-src",a.append(...[...t.childNodes].map(i=>i.cloneNode(!0)));let p=document.createElement("div");p.className="note-pop-foot";let m=document.createElement("a");m.href=`#s${r}`,m.textContent="All sources",m.addEventListener("click",()=>{n(),t.classList.add("is-flash"),setTimeout(()=>t.classList.remove("is-flash"),1800)});let h=document.createElement("a");h.href="#",h.textContent="Close",h.addEventListener("click",i=>{i.preventDefault();let s=e;n(),s&&s.focus()}),p.append(m,h),o.append(l,a,p),o.hidden=!1,d(c),e=c,c.classList.add("is-open"),c.setAttribute("aria-expanded","true")};document.querySelectorAll("sup.fn a").forEach(c=>{c.setAttribute("aria-haspopup","dialog"),c.setAttribute("aria-expanded","false"),c.addEventListener("click",r=>{r.preventDefault(),e===c?n():u(c)})}),document.addEventListener("pointerdown",c=>{e&&!o.contains(c.target)&&!c.target.closest("sup.fn")&&n()}),document.addEventListener("keydown",c=>{if(c.key==="Escape"&&e){let r=e;n(),r.focus()}}),addEventListener("scroll",()=>{e&&d(e)},{passive:!0}),addEventListener("resize",n)}function le(){let o=document.querySelectorAll("[data-reveal]");if(Z||!("IntersectionObserver"in window)){o.forEach(d=>d.classList.add("is-in"));return}let e=new IntersectionObserver(d=>{d.forEach(n=>{n.isIntersecting&&(n.target.classList.add("is-in"),e.unobserve(n.target))})},{rootMargin:"0px 0px -8% 0px",threshold:.08});o.forEach(d=>e.observe(d))}function ie(){document.querySelectorAll("[data-scrub] p").forEach(o=>{let e=o.textContent.trim();o.setAttribute("aria-label",e),o.replaceChildren(...e.split(/\s+/).flatMap((r,t)=>{let l=document.createElement("span");return l.className="w",l.setAttribute("aria-hidden","true"),l.textContent=r,t?[document.createTextNode(" "),l]:[l]}));let d=[...o.querySelectorAll(".w")];if(Z){d.forEach(r=>r.classList.add("on"));return}let n=!1,u=-1,c=()=>{if(!n)return;let r=o.getBoundingClientRect(),t=(innerHeight*.8-r.top)/(r.height+innerHeight*.35),l=Math.round(Math.min(1,Math.max(0,t))*d.length);l!==u&&(u=l,d.forEach((a,p)=>a.classList.toggle("on",p<l)))};new IntersectionObserver(r=>{n=r[0].isIntersecting,c()},{rootMargin:"30% 0px 30% 0px"}).observe(o),addEventListener("scroll",c,{passive:!0})})}window.__reckoning=!0;var B=(o,e)=>{let d=performance.now();try{e()}catch(n){console.error(`${o} failed`,n)}performance.measure(`init:${o}`,{start:d,end:performance.now()})};B("hero",()=>{let o=document.querySelector("[data-hero]"),e=new URLSearchParams(location.search),d=e.get("still"),n=e.get("pitch");Q(o,d!=null?{still:!0,time:+d||0,lights:+(e.get("lights")??d)||0,scale:+(e.get("scale")||1),pitch:n!=null?+n:void 0}:{})});B("mast",ae);B("toc",se);B("notes",ce);B("reveal",le);B("ledger",re);var Le=o=>"requestIdleCallback"in window?requestIdleCallback(o,{timeout:500}):setTimeout(o,50);Le(()=>{B("scrub",ie),B("charts",ne)});
