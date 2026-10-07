import * as THREE from 'three';
import { COLORS } from './constants.js';

// Hand-built models: the first-person portal device, the third-person test
// subject seen through portals, and the test-element props (cubes, buttons,
// doors, turrets, launchers, faith plates, droppers, grills and antlines)
// that entities.js places. Everything is built from primitives, lathes and
// extrusions, with small procedural canvas textures for the fine detail. Parts
// that share a material are merged into one geometry to keep draw calls low,
// since the world is drawn several times per frame through portals.

// physically based stand-in for the old Phong materials: shininess maps to roughness
const phong = (o) => {
  const { shininess = 30, specular, ...rest } = o;
  void specular;
  return new THREE.MeshStandardMaterial({ roughness: Math.max(0.18, Math.min(0.9, 1 - shininess / 110)), metalness: 0.05, ...rest });
};
export const std = (color, roughness = 0.5, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

// ---------------------------------------------------------------------------
// Geometry helpers

// Box with rounded edges and corners (k segments per 45 degrees of rounding).
export function roundedBox(w, h, d, r, k = 2) {
  const S = 2 * k + 1;
  const g = new THREE.BoxGeometry(w, h, d, S, S, S);
  const hh = [w / 2, h / 2, d / 2];
  const tables = hh.map((H) => {
    const rr = Math.min(r, H);
    const t = [];
    for (let i = 0; i <= S; i++) {
      if (i <= k) t.push(-(H - rr + rr * Math.tan((Math.PI / 4) * (k - i) / k)));
      else t.push(H - rr + rr * Math.tan((Math.PI / 4) * (i - k - 1) / k));
    }
    return t;
  });
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const p = new THREE.Vector3(), inner = new THREE.Vector3(), dv = new THREE.Vector3();
  const perFace = (S + 1) * (S + 1);
  const faceAxes = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    for (let a = 0; a < 3; a++) {
      const H = hh[a];
      const idx = Math.round(((p.getComponent(a) + H) / (2 * H)) * S);
      p.setComponent(a, tables[a][idx]);
    }
    for (let a = 0; a < 3; a++) {
      const lim = hh[a] - Math.min(r, hh[a]);
      inner.setComponent(a, Math.max(-lim, Math.min(lim, p.getComponent(a))));
    }
    dv.subVectors(p, inner);
    const l = dv.length();
    if (l > 1e-6) {
      dv.divideScalar(l);
      p.copy(inner).addScaledVector(dv, r);
      nor.setXYZ(i, dv.x, dv.y, dv.z);
    }
    pos.setXYZ(i, p.x, p.y, p.z);
    const [ua, va] = faceAxes[Math.floor(i / perFace)];
    const U = uv.getX(i), V = uv.getY(i);
    uv.setXY(i, (tables[ua][Math.round(U * S)] + hh[ua]) / (2 * hh[ua]), (tables[va][Math.round(V * S)] + hh[va]) / (2 * hh[va]));
  }
  g.computeBoundingSphere();
  return g;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
// transform a geometry in place: position, euler rotation (XYZ), scale
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _m4.compose(_s.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return geo.applyMatrix4(_m4);
}

// merge geometries (position / normal / uv) into one non-indexed geometry
export function merge(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Lathe around the Z axis, opening towards -Z. `prof` is a list of
// [forward, radius] pairs (forward = -z). phi = 0 is the top (+y), rising
// towards +x.
function zLathe(prof, seg = 40, phiStart = 0, phiLength = Math.PI * 2) {
  const g = new THREE.LatheGeometry(prof.map(([f, r]) => new THREE.Vector2(r, f)), seg, phiStart, phiLength);
  g.rotateX(-Math.PI / 2);   // lathe axis +y -> -z; phi = 0 (+z) -> +y
  return g;
}

// ---------------------------------------------------------------------------
// Texture helpers
function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
function colorTex(c, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
// tangent-space normal map from a greyscale height canvas
function normalTex(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
function noiseFill(ctx, w, h, amt, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 9301 + 49297) % 233280;
    const n = (s / 233280 - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function heart(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 1.6);
  ctx.bezierCurveTo(cx - r * 2.4, cy + r * 0.2, cx - r * 1.3, cy - r * 1.7, cx, cy - r * 0.5);
  ctx.bezierCurveTo(cx + r * 1.3, cy - r * 1.7, cx + r * 2.4, cy + r * 0.2, cx, cy + r * 1.6);
  ctx.fill();
}

// HDR colour helper for unlit glowing parts (values above 1 bloom)
const glow = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// Shared "lit indicator" colours: blue = off, orange = on (as antlines)
export const IND_OFF = 0x45b4ff, IND_ON = 0xffa233;

// Build a mesh and a portal clone of it with cloned materials. Returns
// { mesh, clone, mats, cloneMats, map } where map takes a material to its clone.
export function withClone(group, mats) {
  const clone = group.clone(true);
  const map = new Map(mats.map((m) => [m, m.clone()]));
  clone.traverse((o) => { if (o.material) o.material = map.get(o.material) || o.material; });
  return { mesh: group, clone, mats, cloneMats: [...map.values()], map };
}

// ---------------------------------------------------------------------------
// First-person portal device
const CoreShader = {
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uFlare; uniform float uSwap;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      // twisting energy bands running along the tube, with a bright filament
      float a = vUv.x * 6.2831;
      float s1 = sin(a * 2.0 + vUv.y * 26.0 - uTime * 7.0);
      float s2 = sin(a * 3.0 - vUv.y * 17.0 + uTime * 4.3);
      float band = smoothstep(0.35, 1.0, s1) * 0.8 + smoothstep(0.55, 1.0, s2) * 0.6;
      float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
      // colour-swap wave travelling down the tube
      float wave = uSwap * smoothstep(0.25, 0.0, abs(vUv.y - (1.0 - uSwap)));
      float k = 0.55 + band * 0.9 + rim * 0.5 + uFlare * 1.6 + wave * 3.0;
      vec3 col = mix(uColor, vec3(1.0), clamp(band * 0.25 + uFlare * 0.3 + wave * 0.5, 0.0, 0.8)) * k;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.5, 400);
    // modest, directional key + cool rim so the white shell keeps its form
    // under ACES and bloom instead of clipping to a flat blob
    this.scene.add(new THREE.HemisphereLight(0xd6e0ee, 0x23272c, 0.45));
    const key = new THREE.DirectionalLight(0xfff6ea, 1.05);
    key.position.set(-0.6, 1, 0.45);
    const rim = new THREE.DirectionalLight(0x9cc6ff, 0.55);
    rim.position.set(1, 0.25, -0.8);
    this.scene.add(key, rim);
    this.root = new THREE.Group();
    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.scene.add(this.root);
    this.build();
    this.gun.scale.setScalar(0.6);

    this.basePos = new THREE.Vector3(8.6, -8.4, -17);
    this.root.position.copy(this.basePos);
    this.gun.rotation.set(0.04, 0.26, 0.04);
    this.bob = 0;
    this.sway = new THREE.Vector2();
    this.recoil = 0;
    this.swap = 0;
    this.holdBlend = 0;
    this.clock = 0;
    this.color = 'blue';
    this.visible = true;
    this.fizzleFlash = 0;
    this._col = new THREE.Color();
    this.setColor('blue');
    this.swap = 0;
  }

  build() {
    const G = this.gun;
    const white = std(0xd9dbdc, 0.24, 0, { envMapIntensity: 1.1 });
    const black = std(0x16181a, 0.42, 0.15);
    const rubber = std(0x101112, 0.75, 0);
    const metal = std(0x7d848a, 0.3, 0.85);
    const inner = std(0x08090a, 0.6, 0.2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLORS.blue });          // emitter + prong tips (HDR)
    this.ringMat = new THREE.MeshBasicMaterial({ color: COLORS.blue });
    this.swirl = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uFlare: { value: 0 }, uSwap: { value: 0 } },
      vertexShader: CoreShader.vertexShader, fragmentShader: CoreShader.fragmentShader,
    });
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.6 });
    const add = (geo, mat, parent = G) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };

    // dark inner body visible through the shell seams
    add(zLathe([[-10, 0], [-9.6, 3.0], [-8, 4.2], [0, 4.85], [6, 4.6], [8.5, 3.8], [10.2, 2.4]], 36), inner);
    // rear cap: black, rounded at the back, slightly flattened sideways
    const rear = zLathe([[-13.2, 0], [-13, 1.8], [-12.4, 3.1], [-11.2, 4.1], [-9.6, 4.55], [-8.2, 4.62], [-7.4, 4.5]], 40);
    rear.scale(0.94, 1, 1);
    add(rear, black);
    // white shell: two rings of three curved panels with dark seams between
    const ringA = [[-8.6, 4.78], [-7.5, 5.02], [-5, 5.26], [-2, 5.42], [0.5, 5.5]];
    const ringB = [[0.85, 5.52], [2.2, 5.55], [3.6, 5.45], [5, 5.2], [6.3, 4.75], [7.2, 4.2], [7.7, 3.7]];
    const gap = 0.04;
    const panels = [];
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2 + Math.PI / 3;
      panels.push(zLathe(ringA, 20, a0 + gap, Math.PI * 2 / 3 - gap * 2));
      panels.push(zLathe(ringB, 20, a0 + gap + 0.5, Math.PI * 2 / 3 - gap * 2));
    }
    add(merge(panels), white);
    // bright metal lip where the shell meets the black cap
    add(zLathe([[-9.0, 4.45], [-8.8, 4.86], [-8.55, 4.84]], 40), metal);
    // black nose and emitter well
    add(zLathe([[7.4, 4.05], [8.1, 3.9], [9.2, 3.5], [10.0, 3.0], [10.4, 2.5], [10.3, 1.9], [9.5, 1.6]], 36), black);
    this.ring = add(zLathe([[10.42, 2.48], [10.55, 2.15], [10.45, 1.85]], 32), this.ringMat);
    this.emitter = add(new THREE.SphereGeometry(1.45, 20, 14), this.coreMat);
    this.emitter.position.z = -9.9;

    // three curved claws on hinges around the nose, with glowing tips
    const claw = new THREE.Shape();
    claw.moveTo(3.4, 5.15);
    claw.quadraticCurveTo(6.5, 6.35, 9.4, 5.95);
    claw.quadraticCurveTo(12.4, 5.2, 14.1, 2.7);
    claw.lineTo(14.2, 2.05);
    claw.lineTo(13.55, 2.15);
    claw.quadraticCurveTo(11.9, 4.0, 9.4, 4.65);
    claw.quadraticCurveTo(6.8, 5.05, 4.2, 4.5);
    claw.closePath();
    const clawGeo = new THREE.ExtrudeGeometry(claw, { depth: 1.15, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.22, bevelSegments: 2, curveSegments: 10 });
    clawGeo.translate(0, 0, -0.575);
    clawGeo.rotateY(Math.PI / 2);               // shape x (forward) -> -z, extrusion -> x
    const tipGeo = new THREE.SphereGeometry(0.42, 10, 8);
    tipGeo.scale(1, 0.8, 1.9);
    this.prongs = [];
    for (let i = 0; i < 3; i++) {
      const phi = (i / 3) * Math.PI * 2;
      const p = new THREE.Group();
      p.rotation.z = -phi;
      const hinge = new THREE.Group();
      hinge.position.set(0, 5.0, -4.0);
      const arm = new THREE.Mesh(clawGeo, black);
      arm.position.set(0, -5.0, 4.0);
      const tip = new THREE.Mesh(tipGeo, this.coreMat);
      tip.position.set(0, -5.0 + 2.55, 4.0 - 13.55);
      hinge.add(arm, tip);
      p.add(hinge);
      G.add(p);
      this.prongs.push(hinge);
    }

    // glass tube on top holding the swirling core, black clamps at both ends
    const TY = 6.25, TZ = 2.0, TL = 10.4;
    const tube = add(new THREE.CylinderGeometry(1.45, 1.45, TL, 24, 1, true), this.glassMat);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, TY, TZ);
    tube.renderOrder = 2;
    this.core = add(new THREE.CylinderGeometry(0.58, 0.58, TL - 0.6, 16, 1, true), this.swirl);
    this.core.rotation.x = Math.PI / 2; this.core.position.set(0, TY, TZ);
    this.bead = add(new THREE.SphereGeometry(0.9, 16, 12), this.coreMat);
    this.bead.position.set(0, TY, 0.6);
    const clampParts = [];
    for (const [z, len, r] of [[TZ - TL / 2, 0.8, 1.68], [TZ + TL / 2 - 0.4, 0.6, 1.62], [TZ, 0.3, 1.6]]) {
      clampParts.push(place(new THREE.CylinderGeometry(r, r, len, 24), 0, TY, z, Math.PI / 2));
    }
    // stands from the clamps down into the body
    clampParts.push(place(roundedBox(1.3, 2.2, 1.0, 0.35), 0, TY - 1.6, TZ - TL / 2));
    // rear socket: the tube runs into a sloped block on top of the rear cap
    clampParts.push(place(roundedBox(2.6, 3.0, 3.6, 0.9), 0, TY - 0.9, TZ + TL / 2 + 1.0, -0.18));
    add(merge(clampParts), black);
    // black fin along the top of the rear carrying the rear clamp
    add(place(roundedBox(2.0, 2.0, 4.6, 0.8), 0, 4.0, 10.2, -0.12), black);

    // grip and trigger guard under the rear housing
    const grip = add(roundedBox(2.9, 7.5, 3.6, 1.1), rubber);
    grip.position.set(0, -6.6, 6.2); grip.rotation.x = 0.32;
    const guard = add(new THREE.TorusGeometry(1.9, 0.38, 6, 16, Math.PI), black);
    guard.position.set(0, -4.6, 3.6); guard.rotation.set(0, Math.PI / 2, Math.PI);

    // small details: screws on the shell, vents on the housing, a hose
    const screws = [];
    for (const [phi, f] of [[1.0, -1.4], [-1.0, -1.4], [2.2, 4.6], [-2.2, 4.6], [1.6, 6.1], [-1.6, 6.1]]) {
      const r = phi === 1.0 || phi === -1.0 ? 5.35 : f > 5 ? 4.85 : 5.3;
      const s = new THREE.CylinderGeometry(0.32, 0.32, 0.35, 10);
      place(s, 0, 0, 0, 0, 0, -phi);   // axis radial on the shell surface
      place(s, Math.sin(phi) * r, Math.cos(phi) * r, -f);
      screws.push(s);
    }
    add(merge(screws), metal);
    const vents = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        vents.push(place(roundedBox(0.5, 0.42, 2.4, 0.18), side * 4.2, -0.9 + i * 0.95, 10.6, 0, 0, side * 0.12));
      }
    }
    add(merge(vents), rubber);
    const hose = new THREE.CatmullRomCurve3([[3.3, -2.8, 10.4], [5.0, -3.6, 7.0], [5.4, -2.8, 2.5], [4.6, -2.2, -1.2]].map((p) => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(hose, 24, 0.42, 8), rubber);
    const ribs = [];
    for (let t = 0.08; t < 0.95; t += 0.085) {
      const r = new THREE.TorusGeometry(0.5, 0.11, 5, 10);
      const pt = hose.getPoint(t), tg = hose.getTangent(t);
      r.applyMatrix4(new THREE.Matrix4().compose(pt, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg), new THREE.Vector3(1, 1, 1)));
      ribs.push(r);
    }
    add(merge(ribs), rubber);

    // light from the core: tints the claws and the nose
    this.light = new THREE.PointLight(COLORS.blue, 6, 26, 2);
    this.light.position.set(0, 0.5, -11.5);
    G.add(this.light);
    this.tubeLight = new THREE.PointLight(COLORS.blue, 1.5, 10, 2);
    this.tubeLight.position.set(0, TY + 0.4, 1);
    G.add(this.tubeLight);
  }

  setColor(c) {
    if (c !== this.color) this.swap = 1;
    this.color = c;
    const hex = COLORS[c];
    this._hex = hex;
    this.swirl.uniforms.uColor.value.setHex(hex);
    this.light.color.setHex(hex);
    this.tubeLight.color.setHex(hex);
  }

  fire(color) { this.setColor(color); this.recoil = 1; }

  update(dt, speed, onGround, lookDX, lookDY, holding, time) {
    this.root.visible = this.visible;
    this.clock += dt;
    const t = this.clock;
    if (onGround) this.bob += dt * Math.min(speed, 260) * 0.055;
    const amp = onGround ? Math.min(1, speed / 175) : 0;
    this.sway.x += (-lookDX * 40 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDY * 40 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-2.5, 2.5);
    this.recoil = Math.max(0, this.recoil - dt * 4.5);
    this.swap = Math.max(0, this.swap - dt * 2.6);
    this.holdBlend += ((holding ? 1 : 0) - this.holdBlend) * Math.min(1, dt * 8);
    const r = this.recoil, hb = this.holdBlend;
    const kick = r * r * (3 - 2 * r);
    // idle breathing, walk bob, look sway, recoil and the carry pose
    const breathe = Math.sin(t * 1.4) * 0.12 * (1 - amp);
    this.root.position.set(
      this.basePos.x + Math.sin(this.bob) * 0.6 * amp + this.sway.x * 0.4 + Math.sin(t * 0.7) * 0.08 - hb * 1.1,
      this.basePos.y - Math.abs(Math.cos(this.bob)) * 0.5 * amp + this.sway.y * 0.4 + breathe - hb * 0.4,
      this.basePos.z + kick * 2.6 + hb * 0.8,
    );
    this.root.rotation.set(
      kick * 0.13 + hb * 0.16 + Math.sin(t * 1.1) * 0.006,
      this.sway.x * 0.01 + hb * 0.12,
      -hb * 0.22 + Math.sin(t * 0.9) * 0.008 + Math.sin(this.bob) * 0.012 * amp,
    );
    // claws: flare on fire, open wide and tremble while carrying
    for (let i = 0; i < 3; i++) {
      const p = this.prongs[i];
      const target = holding ? 0.34 + Math.sin(time * 26 + i * 2.1) * 0.035 : 0.02 + r * 0.22 + Math.sin(t * 1.3 + i) * 0.006;
      p.rotation.x += (target - p.rotation.x) * Math.min(1, dt * 12);
    }
    // core: steady pulse, flare on fire, flicker while carrying, swap glow
    const pulse = 0.85 + Math.sin(t * 5.2) * 0.12 + (holding ? Math.sin(time * 41) * 0.15 : 0);
    const k = 1.25 * pulse + r * 3.5 + this.swap * 1.5;
    this.coreMat.color.setHex(this._hex).multiplyScalar(k);
    this.ringMat.color.setHex(this._hex).multiplyScalar(0.9 + r * 2 + this.swap);
    this.light.intensity = 6 * pulse + r * 40 + this.swap * 8;
    this.tubeLight.intensity = 1.5 + this.swap * 6;
    this.emitter.scale.setScalar(1 + r * 0.45 + (holding ? Math.sin(time * 30) * 0.08 : 0));
    this.bead.scale.setScalar(1 + Math.sin(t * 3.1) * 0.12 + this.swap * 0.5 + r * 0.25);
    this.bead.position.z = 0.6 + Math.sin(t * 0.8) * 1.4;
    const u = this.swirl.uniforms;
    u.uTime.value = t;
    u.uFlare.value = r + hb * 0.3;
    u.uSwap.value = this.swap;
  }

  resize(aspect, fov) {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
export class PlayerModel {
  constructor() {
    this.group = new THREE.Group();
    this.clone = null;
    const orange = phong({ color: 0xe0661c, shininess: 15 });
    const white = phong({ color: 0xf1f1ee, shininess: 10 });
    const skin = phong({ color: 0xc98c6b, shininess: 10 });
    const hair = phong({ color: 0x2a1c14, shininess: 20 });
    const boot = phong({ color: 0x9aa0a6, shininess: 60 });
    const dark = phong({ color: 0x2b2d30 });
    const cap = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 4.5, 36, 0);
      const thigh = cap(4.6, 13, orange); thigh.position.y = -9;
      const shin = cap(4, 12, orange); shin.position.y = -24;
      const bootM = cap(4.2, 6, boot); bootM.position.set(0, -32, 0.5);
      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 9, 6), dark);
      spring.position.set(0, -33, 5); spring.rotation.x = 0.35;
      hip.add(thigh, shin, bootM, spring);
      this.group.add(hip);
      this.legs.push(hip);
    }
    const pelvis = cap(7, 4, orange); pelvis.position.y = 38; pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.8);
    const tied = new THREE.Mesh(new THREE.TorusGeometry(7.5, 1.8, 6, 16), orange);
    tied.rotation.x = Math.PI / 2; tied.position.y = 42;
    const torso = cap(7, 12, white); torso.position.y = 50; torso.scale.set(1, 1, 0.7);
    const neck = cap(2.2, 2, skin); neck.position.y = 60;
    const head = new THREE.Mesh(new THREE.SphereGeometry(5.6, 18, 14), skin); head.position.y = 65.5; head.scale.set(0.95, 1.1, 1);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
    hairM.position.y = 66.5; hairM.rotation.x = 0.25;
    const tail = cap(2.4, 4, hair); tail.position.set(0, 64, 6.2); tail.rotation.x = 0.4;
    this.group.add(pelvis, tied, torso, neck, head, hairM, tail);
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 9.5, 56, 0);
      const upper = cap(2.4, 10, skin); upper.position.y = -7;
      const lower = cap(2.2, 9, skin); lower.position.set(0, -17, -2); lower.rotation.x = -0.4;
      sh.add(upper, lower);
      this.group.add(sh);
      this.arms.push(sh);
    }
    // the device
    const gun = new THREE.Group();
    const gb = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.8, 18, 12), white);
    gb.rotation.x = Math.PI / 2;
    const gn = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 4, 12), dark);
    gn.rotation.x = Math.PI / 2; gn.position.z = -10;
    this.gunCore = new THREE.MeshBasicMaterial({ color: COLORS.blue });
    const gc = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), this.gunCore); gc.position.z = -12;
    gun.add(gb, gn, gc);
    gun.position.set(6, 44, -10);
    this.gun = gun;
    this.group.add(gun);
    this.group.traverse((o) => { o.layers.set(1); o.frustumCulled = false; });
    this.phase = 0;
  }

  makeClone() {
    this.clone = this.group.clone(true);
    this.clone.traverse((o) => {
      if (o.material) o.material = o.material.clone();
      o.layers.set(1);
      o.frustumCulled = false;
    });
    return this.clone;
  }

  update(dt, pos, feetY, yaw, pitch, speed, onGround, color) {
    this.group.position.set(pos.x, feetY, pos.z);
    this.group.rotation.set(0, yaw, 0);
    if (onGround) this.phase += dt * speed * 0.06;
    const amp = onGround ? Math.min(1, speed / 175) * 0.6 : 0.25;
    this.legs[0].rotation.x = Math.sin(this.phase) * amp;
    this.legs[1].rotation.x = -Math.sin(this.phase) * amp;
    this.arms[0].rotation.x = -Math.sin(this.phase) * amp * 0.6;
    this.arms[1].rotation.x = -0.9 - pitch * 0.6;
    this.gun.rotation.x = pitch;
    this.gun.position.y = 44 + pitch * 6;
    this.gunCore.color.setHex(COLORS[color]);
  }
}

// ===========================================================================
// Test element props
// ===========================================================================

const once = (fn) => { let v; return () => (v === undefined ? (v = fn()) : v); };
const dirQuat = (d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
function onFaces(make, dist) {
  return FACE_DIRS.map((d) => {
    const g = make();
    g.applyMatrix4(new THREE.Matrix4().compose(d.clone().multiplyScalar(dist), dirQuat(d), new THREE.Vector3(1, 1, 1)));
    return g;
  });
}
// glowing parts: standard material, black base, emissive colour (blooms above 1)
const glowMat = (hex, k = 2) => new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, emissive: hex, emissiveIntensity: k });

// --------------------------------------------------------------------------
// Weighted storage cube / companion cube
const CUBE_PX = 512, CUBE_S = 40;        // texture size, cube edge (units)
function cubeFaceCanvases(companion) {
  const S = CUBE_PX, u = S / CUBE_S;
  const [c, g] = canvas(S);
  const [hc, h] = canvas(S);
  g.fillStyle = companion ? '#8d8a8d' : '#868c91'; g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, 10, companion ? 5 : 3);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  // panel joints from the plate out to the edge midpoints
  for (const [ctx, col, w] of [[g, '#4b5054', 3], [h, '#303030', 4]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S * 0.2); ctx.moveTo(S / 2, S * 0.8); ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2); ctx.lineTo(S * 0.2, S / 2); ctx.moveTo(S * 0.8, S / 2); ctx.lineTo(S, S / 2);
    ctx.stroke();
  }
  // inset face plate
  const m = S * 0.19;
  g.fillStyle = companion ? '#a9a5a8' : '#a3a9ad'; rrect(g, m, m, S - 2 * m, S - 2 * m, S * 0.05); g.fill();
  g.strokeStyle = '#4a4f53'; g.lineWidth = 5; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; rrect(g, m + 6, m + 6, S - 2 * m - 12, S - 2 * m - 12, S * 0.04); g.stroke();
  h.fillStyle = '#8c8c8c'; rrect(h, m, m, S - 2 * m, S - 2 * m, S * 0.05); h.fill();
  h.strokeStyle = '#2a2a2a'; h.lineWidth = 7; h.stroke();
  // screws in the plate corners
  for (const [x, y] of [[0.26, 0.26], [0.74, 0.26], [0.26, 0.74], [0.74, 0.74]]) {
    g.fillStyle = '#5c6165'; g.beginPath(); g.arc(x * S, y * S, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x * S - 1.5, y * S - 1.5, 2.5, 0, Math.PI * 2); g.fill();
    h.fillStyle = '#b0b0b0'; h.beginPath(); h.arc(x * S, y * S, 6, 0, Math.PI * 2); h.fill();
  }
  // emblem recess (the lit ring itself is geometry) and the centre disc
  g.fillStyle = '#2c3034'; g.beginPath(); g.arc(S / 2, S / 2, 8.7 * u, 0, Math.PI * 2); g.fill();
  h.fillStyle = '#404040'; h.beginPath(); h.arc(S / 2, S / 2, 8.7 * u, 0, Math.PI * 2); h.fill();
  const rg = g.createRadialGradient(S / 2 - 12, S / 2 - 14, 4, S / 2, S / 2, 5.6 * u);
  rg.addColorStop(0, companion ? '#e4dfe2' : '#d9dee1'); rg.addColorStop(1, companion ? '#b8b0b5' : '#a9b0b5');
  g.fillStyle = rg; g.beginPath(); g.arc(S / 2, S / 2, 5.6 * u, 0, Math.PI * 2); g.fill();
  h.fillStyle = '#9a9a9a'; h.beginPath(); h.arc(S / 2, S / 2, 5.6 * u, 0, Math.PI * 2); h.fill();
  if (companion) {
    g.fillStyle = '#f07fb0'; heart(g, S / 2, S / 2 + 4, S * 0.034);
    g.fillStyle = '#e48ab0';
    for (const [x, y] of [[0.5, 0.1], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]]) heart(g, x * S, y * S, S * 0.012);
  }
  return [c, hc];
}
const cubeTex = { 0: null, 1: null };
function cubeTextures(companion) {
  const k = companion ? 1 : 0;
  if (!cubeTex[k]) {
    const [c, hc] = cubeFaceCanvases(companion);
    cubeTex[k] = { map: colorTex(c, 8), normalMap: normalTex(hc, 3) };
  }
  return cubeTex[k];
}
const cubeGeos = once(() => {
  const H = CUBE_S / 2;
  const body = roundedBox(CUBE_S - 1.6, CUBE_S - 1.6, CUBE_S - 1.6, 2.0, 2);
  const caps = [];
  const c = 6.4;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    caps.push(place(roundedBox(c * 2, c * 2, c * 2, 1.6, 1), x * (H - c), y * (H - c), z * (H - c)));
  }
  const bezel = merge(onFaces(() => new THREE.TorusGeometry(8.1, 0.7, 4, 32), H - 0.7));
  const ring = merge(onFaces(() => new THREE.RingGeometry(6.0, 7.5, 32), H - 0.55));
  return { body, caps: merge(caps), bezel, ring };
});
export const CUBE_RING = { off: 0x58d2ff, on: 0xffa23a, companionOff: 0xff7fb8 };
export function buildCube(companion) {
  const G = cubeGeos();
  const t = cubeTextures(companion);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.map, normalMap: t.normalMap, roughness: 0.55, metalness: 0.1 });
  const capMat = std(companion ? 0xc9c6c8 : 0xc4c8cb, 0.45, 0.05);
  const darkMat = std(0x2a2d31, 0.5, 0.3);
  const ringMat = glowMat(companion ? CUBE_RING.companionOff : CUBE_RING.off, 1.9);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.body, bodyMat), new THREE.Mesh(G.caps, capMat), new THREE.Mesh(G.bezel, darkMat), new THREE.Mesh(G.ring, ringMat));
  return { group: g, mats: [bodyMat, capMat, darkMat, ringMat], bodyMat, ringMat };
}

// --------------------------------------------------------------------------
// Floor button (the big red one)
const buttonGeos = once(() => {
  const L = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const base = L([[53, 0], [53.2, 1.6], [51.5, 4.4], [48, 6.6], [44.5, 7.2], [43.2, 7.0]]);
  const pit = L([[43.2, 7.0], [42.2, 5.0], [41.6, 1.2], [30, 1.0], [0, 1.0]]);
  // pad profile: top with a groove ring, rounded rim, skirt down into the pit
  const pad = L([[0, 6.4], [19, 6.4], [19.5, 5.9], [21, 5.9], [21.5, 6.4], [34, 6.2], [36.4, 5.5], [37.6, 4.0], [37.8, -3]].reverse(), 64);
  const lobes = [], lights = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const lb = roundedBox(12, 5.2, 18, 2);
    place(lb, 0, 2.6, 0); lb.rotateY(a); lb.translate(Math.sin(a) * 50, 0, Math.cos(a) * 50);
    lobes.push(lb);
    const li = roundedBox(1.6, 1.2, 9, 0.5);
    place(li, 0, 5.3, 1); li.rotateY(a); li.translate(Math.sin(a) * 50, 0, Math.cos(a) * 50);
    lights.push(li);
  }
  const ring = new THREE.RingGeometry(45.6, 47.0, 72); ring.rotateX(-Math.PI / 2); ring.translate(0, 6.98, 0);
  return { base, pit, pad, lobes: merge(lobes), glow: merge([...lights, ring]) };
});
export function buildButton() {
  const G = buttonGeos();
  const ringMat = glowMat(IND_OFF, 1.8);
  const g = new THREE.Group();
  const pad = new THREE.Mesh(G.pad, std(0xc4211d, 0.38, 0.0));
  g.add(new THREE.Mesh(G.base, std(0xe2e4e5, 0.36)), new THREE.Mesh(G.pit, std(0x1d2023, 0.6, 0.2)),
    new THREE.Mesh(G.lobes, std(0x34383c, 0.45, 0.4)), new THREE.Mesh(G.glow, ringMat), pad);
  return { group: g, pad, ringMat };
}

// --------------------------------------------------------------------------
// Chamber door: white frame lips on both wall faces, two sliding panels that
// carry a split round motif, lit status strips and an indicator sign.
function doorArt() {
  const S = 512;
  const [c, g] = canvas(S);
  const [hc, h] = canvas(S);
  g.fillStyle = '#dcdfe0'; g.fillRect(0, 0, S, S); noiseFill(g, S, S, 6, 11);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  const groove = (draw, wG = 4, wH = 6) => {
    g.strokeStyle = '#6d7276'; g.lineWidth = wG; draw(g); g.stroke();
    h.strokeStyle = '#303030'; h.lineWidth = wH; draw(h); h.stroke();
  };
  // outer border and horizontal panel joints
  groove((x) => rrect(x, 14, 14, S - 28, S - 28, 10));
  groove((x) => { x.beginPath(); x.moveTo(14, S * 0.17); x.lineTo(S - 14, S * 0.17); x.moveTo(14, S * 0.83); x.lineTo(S - 14, S * 0.83); });
  // the round centre motif: raised ring with a dark inner disc
  const R = S * 0.3;
  g.fillStyle = '#c9cdcf'; g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.fill();
  h.fillStyle = '#a0a0a0'; h.beginPath(); h.arc(S / 2, S / 2, R, 0, Math.PI * 2); h.fill();
  groove((x) => { x.beginPath(); x.arc(S / 2, S / 2, R, 0, Math.PI * 2); });
  g.fillStyle = '#2b2f33'; g.beginPath(); g.arc(S / 2, S / 2, R * 0.66, 0, Math.PI * 2); g.fill();
  h.fillStyle = '#505050'; h.beginPath(); h.arc(S / 2, S / 2, R * 0.66, 0, Math.PI * 2); h.fill();
  g.fillStyle = '#3b4045'; g.beginPath(); g.arc(S / 2, S / 2, R * 0.42, 0, Math.PI * 2); g.fill();
  // small vents low on each side
  for (const sx of [0.22, 0.78]) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#4a4f53'; rrect(g, sx * S - 22, S * 0.88 + i * 9, 44, 4, 2); g.fill();
      h.fillStyle = '#404040'; rrect(h, sx * S - 22, S * 0.88 + i * 9, 44, 4, 2); h.fill();
    }
  }
  // centre seam shadow
  g.fillStyle = '#4a4f53'; g.fillRect(S / 2 - 2, 0, 4, S);
  return [c, hc];
}
const doorTex = once(() => {
  const [c, hc] = doorArt();
  return { map: colorTex(c, 8), normalMap: normalTex(hc, 2.5) };
});
function signCanvas(on) {
  const S = 128;
  const [c, g] = canvas(S);
  g.fillStyle = '#15181b'; rrect(g, 4, 4, S - 8, S - 8, 14); g.fill();
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 15;
  g.beginPath();
  if (on) { g.moveTo(32, 66); g.lineTo(55, 89); g.lineTo(97, 40); } else { g.moveTo(38, 38); g.lineTo(90, 90); g.moveTo(90, 38); g.lineTo(38, 90); }
  g.stroke();
  return colorTex(c);
}
const signTex = once(() => ({ off: signCanvas(false), on: signCanvas(true) }));

// w, h: opening size; faces: local z of the two wall faces [front(-), back(+)];
// signs: list of { x, z, flip } for indicator signs
export function buildDoor(w, h, faces, signs = []) {
  const g = new THREE.Group();
  const t = doorTex();
  const white = std(0xe4e6e7, 0.38, 0.02);
  const dark = std(0x2f3337, 0.55, 0.35);
  const edge = std(0x9aa0a4, 0.4, 0.5);
  const lightMat = new THREE.MeshBasicMaterial({ color: glow(IND_OFF, 1.6) });
  const halves = [];
  const T = 8;
  for (const side of [-1, 1]) {
    const grp = new THREE.Group();
    const map = t.map.clone(), nmap = t.normalMap.clone();
    for (const tx of [map, nmap]) { tx.repeat.set(0.5, 1); tx.offset.set(side < 0 ? 0 : 0.5, 0); tx.needsUpdate = true; }
    const faceMat = new THREE.MeshStandardMaterial({ map, normalMap: nmap, roughness: 0.42, metalness: 0.02 });
    const geo = new THREE.BoxGeometry(w / 2, h, T);
    // back face: mirror u so the motif sits on the centre line from both sides
    const uv = geo.attributes.uv;
    for (let i = 20; i < 24; i++) uv.setX(i, 1 - uv.getX(i));
    geo.clearGroups(); geo.addGroup(0, 24, 0); geo.addGroup(24, 12, 1);   // edges, faces: two draws
    const panel = new THREE.Mesh(geo, [edge, faceMat]);
    panel.position.x = side * w / 4;
    // lit half ring and centre strips, on both faces
    const R = w * 0.3 * 0.83, parts = [];
    for (const fz of [-1, 1]) {
      const arc = new THREE.TorusGeometry(R, 0.9, 6, 40, Math.PI);
      arc.rotateZ(side < 0 ? Math.PI / 2 : -Math.PI / 2);
      arc.translate(0, h / 2 - 0, fz * (T / 2 + 0.05));
      parts.push(arc);
      for (const sy of [-1, 1]) {
        const len = h / 2 - R - 14;
        parts.push(place(new THREE.BoxGeometry(2, len, 1), side * 5, h / 2 + sy * (R + 6 + len / 2), fz * (T / 2 + 0.3)));
      }
    }
    const lights = new THREE.Mesh(merge(parts), lightMat);
    lights.position.y = -h / 2;
    grp.add(panel, lights);
    grp.position.y = h / 2;
    g.add(grp);
    halves.push(grp);
  }
  // frame lips on both wall faces (U shape, open at the floor)
  const X0 = w / 2 + 16, Y1 = h + 12, x0 = w / 2 - 2, y1 = h - 2, ro = 14, ri = 8;
  const sh = new THREE.Shape();
  sh.moveTo(-X0, 0); sh.lineTo(-X0, Y1 - ro); sh.quadraticCurveTo(-X0, Y1, -X0 + ro, Y1);
  sh.lineTo(X0 - ro, Y1); sh.quadraticCurveTo(X0, Y1, X0, Y1 - ro); sh.lineTo(X0, 0);
  sh.lineTo(x0, 0); sh.lineTo(x0, y1 - ri); sh.quadraticCurveTo(x0, y1, x0 - ri, y1);
  sh.lineTo(-x0 + ri, y1); sh.quadraticCurveTo(-x0, y1, -x0, y1 - ri); sh.lineTo(-x0, 0);
  const lipGeo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2, curveSegments: 8 });
  const lipParts = [];
  for (const [fz, dir] of [[faces[0], -1], [faces[1], 1]]) {
    const l = lipGeo.clone();
    if (dir < 0) { l.translate(0, 0, -3); l.translate(0, 0, fz - 1.2); } else l.translate(0, 0, fz + 1.2);
    lipParts.push(l);
  }
  // dark jamb lining inside the opening, a slot for the panels
  const depth = faces[1] - faces[0];
  const mid = (faces[0] + faces[1]) / 2;
  const jamb = [
    place(new THREE.BoxGeometry(3, h, depth), -w / 2 + 1.5, h / 2, mid),
    place(new THREE.BoxGeometry(3, h, depth), w / 2 - 1.5, h / 2, mid),
    place(new THREE.BoxGeometry(w, 3, depth), 0, h - 1.5, mid),
  ];
  // status strip across the header on both faces
  const strip = [];
  for (const fz of [faces[0] - 4.6, faces[1] + 4.6]) strip.push(place(new THREE.BoxGeometry(w * 0.5, 1.6, 0.8), 0, h + 6, fz));
  g.add(new THREE.Mesh(merge(lipParts), white), new THREE.Mesh(merge(jamb), dark), new THREE.Mesh(merge(strip), lightMat));
  // indicator signs (checkmark / X) next to the frame
  const signMats = [];
  const st = signTex();
  const back = [];
  for (const s of signs) {
    const m = new THREE.MeshBasicMaterial({ map: st.off, color: glow(IND_OFF, 1.4) });
    signMats.push(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), m);
    p.position.set(s.x, h * 0.62, s.z + (s.flip ? -1.6 : 1.6));
    if (s.flip) p.rotation.y = Math.PI;
    g.add(p);
    back.push(place(roundedBox(26, 26, 1.4, 0.6), s.x, h * 0.62, s.z + (s.flip ? -0.7 : 0.7)));
  }
  if (back.length) g.add(new THREE.Mesh(merge(back), dark));
  return {
    group: g, left: halves[0], right: halves[1], lightMat, signMats, lit: null,
    // open: 0..1 (as the entity's open value); on: inputs satisfied
    update(open, on) {
      // unlatch (small pop back into the slot), then an eased slide apart
      const e0 = Math.max(0, Math.min(1, (open - 0.05) / 0.95));
      const e = e0 * e0 * (3 - 2 * e0);
      const pop = Math.min(1, open / 0.05) * (1 - e) * 1.5;
      this.left.position.set(-e * w / 2, h / 2, pop);
      this.right.position.set(e * w / 2, h / 2, pop);
      if (this.lit !== on) {
        this.lit = on;
        lightMat.color.copy(glow(on ? IND_ON : IND_OFF, 1.6));
        for (const m of signMats) { m.map = on ? st.on : st.off; m.color.copy(glow(on ? IND_ON : IND_OFF, 1.4)); }
      }
    },
  };
}

// --------------------------------------------------------------------------
// Sentry turret. Local +z is forward, origin at the body centre, feet at -30.
const turretGeos = once(() => {
  const prof = [[0, -13], [5, -12], [8.2, -9], [9.9, -4], [10.5, 2], [10.3, 8], [9.4, 14], [7.7, 19.5], [5.3, 23.8], [2.7, 26.6], [0, 27.6]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const gp = 0.075;
  const half = (s) => {
    const geo = new THREE.LatheGeometry(prof, 18, s > 0 ? gp : Math.PI + gp, Math.PI - gp * 2);
    geo.scale(0.86, 1, 1);
    return geo;
  };
  const coreGeo = new THREE.LatheGeometry(prof.map((v) => new THREE.Vector2(v.x * 0.9, v.y * 0.97)), 20);
  coreGeo.scale(0.86, 1, 1);
  const dark = [coreGeo];
  // legs: two at the front corners, one behind
  for (const a of [Math.PI * 0.28, -Math.PI * 0.28, Math.PI]) {
    const pts = [[3.5, -10], [8.5, -14.5], [12.5, -21], [13.6, -29.2]].map(([r, y]) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
    dark.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.85, 6));
    dark.push(place(new THREE.CylinderGeometry(1.7, 2.0, 0.9, 10), Math.sin(a) * 13.6, -29.5, Math.cos(a) * 13.6));
  }
  // gun barrels hidden in the core, seen when the shells part
  for (const sx of [-1, 1]) for (const y of [3, 7.5]) {
    dark.push(place(new THREE.CylinderGeometry(0.75, 0.75, 5, 10), sx * 2.4, y, 7.0, Math.PI / 2));
  }
  // eye housing and a small antenna at the back
  dark.push(place(new THREE.CylinderGeometry(2.7, 3.0, 2.4, 20), 0, 13, 8.6, Math.PI / 2));
  dark.push(place(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), 0, 27, -5, -0.6));
  const lens = new THREE.SphereGeometry(1.9, 18, 12); lens.scale(1, 1, 0.55); lens.translate(0, 13, 9.8);
  return { left: half(-1), right: half(1), dark: merge(dark), lens };
});
let glowSpriteTex = null;
function glowSprite(color, size) {
  if (!glowSpriteTex) {
    const [c, g] = canvas(64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowSpriteTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}
export function buildTurret() {
  const G = turretGeos();
  const white = std(0xe8eaeb, 0.26, 0.02);
  const dark = std(0x24272a, 0.5, 0.35);
  const eyeMat = new THREE.MeshBasicMaterial({ color: glow(0xff2a20, 2.2) });
  const g = new THREE.Group();
  const L = new THREE.Mesh(G.left, white); L.name = 'shellL';
  const R = new THREE.Mesh(G.right, white); R.name = 'shellR';
  const eyeGlow = glowSprite(0xff3020, 9); eyeGlow.position.set(0, 13, 10.6); eyeGlow.name = 'eyeGlow';
  g.add(L, R, new THREE.Mesh(G.dark, dark), new THREE.Mesh(G.lens, eyeMat), eyeGlow);
  return { group: g, white, dark, eyeMat, glowMat: eyeGlow.material };
}
// deploy 0..1 (shells part), eye 0 = off, 1 = idle, 2 = locked on
export function animateTurret(group, deploy, eye, eyeMat, time) {
  const L = group.getObjectByName('shellL'), R = group.getObjectByName('shellR'), gl = group.getObjectByName('eyeGlow');
  const d = deploy * deploy * (3 - 2 * deploy) * 3.6;
  L.position.x = -d; R.position.x = d;
  const k = eye === 0 ? 0.08 : eye === 2 ? 3.2 + Math.sin(time * 40) * 0.6 : 2.2;
  eyeMat.color.setRGB(1, 0.16, 0.12).multiplyScalar(k);
  gl.material.opacity = eye === 0 ? 0 : eye === 2 ? 1 : 0.7;
  gl.scale.setScalar(eye === 2 ? 12 : 9);
}

// --------------------------------------------------------------------------
// Pellet launcher / receptacle: round wall housing (local +z out of the wall)
const deviceGeos = once(() => {
  const out = (prof, seg = 48) => { const geo = zLathe(prof, seg); geo.rotateY(Math.PI); return geo; };
  const housing = out([[0, 27], [3, 27.6], [8, 26.2], [12.5, 22.8], [15, 18.5], [15.8, 15], [15.2, 13.6], [13, 13.1]]);
  const well = out([[13, 13.1], [6, 12.6], [4.5, 11], [4.4, 0]]);
  const back = place(roundedBox(62, 62, 4, 1.6), 0, 0, 2);
  const ring = new THREE.TorusGeometry(19.6, 0.85, 8, 64); ring.translate(0, 0, 13.9);
  // three claws reaching forward around the opening
  const shape = new THREE.Shape();
  shape.moveTo(0, 21); shape.quadraticCurveTo(10, 23.5, 20, 17); shape.lineTo(21.5, 13.5); shape.lineTo(19, 13.5); shape.quadraticCurveTo(10, 19, 2, 17.5); shape.closePath();
  const claw = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 1, curveSegments: 6 });
  claw.translate(0, 0, -1.5); claw.rotateY(-Math.PI / 2);   // shape x -> +z (outward), extrusion -> x
  const claws = [];
  for (let i = 0; i < 3; i++) { const c = claw.clone(); c.rotateZ((i / 3) * Math.PI * 2 + Math.PI / 6); claws.push(c); }
  const dish = out([[4.6, 10.8], [6.5, 8], [7.5, 0]]);
  return { housing, well, back, ring, claws: merge([...claws, back]), dish };
});
export function buildWallDevice(catcher) {
  const G = deviceGeos();
  const g = new THREE.Group();
  const dark = std(0x2e3236, 0.5, 0.4);
  const ringMat = glowMat(catcher ? IND_OFF : 0xffb347, 1.6);
  const coreMat = new THREE.MeshBasicMaterial({ color: catcher ? 0x3a3e42 : 0xffd27a });
  g.add(new THREE.Mesh(G.housing, std(0xdcdfe1, 0.32, 0.02)), new THREE.Mesh(G.well, std(0x121416, 0.7, 0.2, { side: THREE.DoubleSide })),
    new THREE.Mesh(G.claws, dark), new THREE.Mesh(G.ring, ringMat));
  if (catcher) {
    g.add(new THREE.Mesh(G.dish, std(0x3a3f44, 0.35, 0.6)));
    const c = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), coreMat); c.position.z = 7.6; g.add(c);
  } else {
    const c = new THREE.Mesh(new THREE.SphereGeometry(6.5, 20, 14), coreMat); c.position.z = 8; g.add(c);
  }
  return { group: g, coreMat, ringMat };
}

// --------------------------------------------------------------------------
// Aerial faith plate
function plateArt() {
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#dfe2e3'; g.fillRect(0, 0, S, S); noiseFill(g, S, S, 6, 21);
  g.strokeStyle = '#8d9397'; g.lineWidth = 3; rrect(g, 8, 8, S - 16, S - 16, 8); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.moveTo(8, S * 0.5); g.lineTo(S - 8, S * 0.5); g.moveTo(S * 0.5, 8); g.lineTo(S * 0.5, S - 8); g.stroke();
  // chevron arrow pointing "up" the texture (towards the hinge)
  g.fillStyle = '#2b2f33';
  g.beginPath(); g.moveTo(128, 40); g.lineTo(196, 120); g.lineTo(160, 120); g.lineTo(160, 210); g.lineTo(96, 210); g.lineTo(96, 120); g.lineTo(60, 120); g.closePath(); g.fill();
  g.fillStyle = '#ff9a2e';
  g.beginPath(); g.moveTo(128, 56); g.lineTo(178, 112); g.lineTo(150, 112); g.lineTo(150, 198); g.lineTo(106, 198); g.lineTo(106, 112); g.lineTo(78, 112); g.closePath(); g.fill();
  return colorTex(c, 8);
}
const plateTex = once(plateArt);
export function buildFaithPlate() {
  const g = new THREE.Group();
  const dark = std(0x30343a, 0.5, 0.45);
  const lightMat = glowMat(IND_OFF, 1.4);
  // base frame flush with the floor, a dark pit and glowing edge strips
  const base = place(roundedBox(86, 6, 86, 2), 0, 3, 0);
  const strips = [];
  for (let i = 0; i < 4; i++) {
    const s = place(new THREE.BoxGeometry(62, 0.8, 1.6), 0, 6.1, 37.5);
    s.rotateY((i * Math.PI) / 2);
    strips.push(s);
  }
  g.add(new THREE.Mesh(base, dark), new THREE.Mesh(merge(strips), lightMat));
  const pit = new THREE.Mesh(new THREE.PlaneGeometry(68, 68), std(0x0c0d0e, 0.8));
  pit.rotation.x = -Math.PI / 2; pit.position.y = 6.05;
  g.add(pit);
  // hinged plate: origin at the hinge line (local -z edge), plate extends +z
  const plate = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: plateTex(), roughness: 0.4, metalness: 0.02 });
  const topGeo = roundedBox(64, 3, 64, 1.2);
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.set(0, 0, 32);
  const under = [place(new THREE.BoxGeometry(56, 2, 56), 0, -2.4, 32)];
  for (const x of [-16, 16]) under.push(place(new THREE.CylinderGeometry(2.2, 2.2, 16, 12), x, -9, 46));
  plate.add(top, new THREE.Mesh(merge(under), dark));
  const hinge = [];
  hinge.push(place(new THREE.CylinderGeometry(1.8, 1.8, 60, 16), 0, -1.2, 0, 0, 0, Math.PI / 2));
  for (const x of [-26, 0, 26]) hinge.push(place(roundedBox(6, 5, 7, 1.5), x, -2.4, -1));
  const hingeMesh = new THREE.Mesh(merge(hinge), dark);
  return { group: g, plate, hingeMesh, lightMat };
}

// --------------------------------------------------------------------------
// Cube dropper hanging from the ceiling. Origin at the bottom of the housing.
export function buildDispenser() {
  const g = new THREE.Group();
  const panels = [];
  const prof = [[36, 0], [37.6, 2.5], [37.8, 37], [36.5, 40]].map(([r, y]) => new THREE.Vector2(r, y));
  for (let i = 0; i < 8; i++) panels.push(new THREE.LatheGeometry(prof, 6, (i / 8) * Math.PI * 2 + 0.02, Math.PI / 4 - 0.04));
  const darkParts = [
    new THREE.CylinderGeometry(35.5, 35.5, 40, 32, 1, true).translate(0, 20, 0),
    place(new THREE.CylinderGeometry(45, 45, 3, 40), 0, 40, 0),
    place(new THREE.TorusGeometry(37.5, 2.6, 8, 48), 0, 0, 0, Math.PI / 2),
    place(new THREE.TorusGeometry(36, 1.7, 8, 48), 0, -52, 0, Math.PI / 2),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    darkParts.push(place(new THREE.CylinderGeometry(0.9, 0.9, 52, 6), Math.sin(a) * 36, -26, Math.cos(a) * 36));
  }
  const lightMat = glowMat(IND_OFF, 1.5);
  const ring = place(new THREE.TorusGeometry(37.6, 0.7, 6, 64), 0, -2.4, 0, Math.PI / 2);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 52, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.y = -26;
  glass.renderOrder = 7;
  g.add(new THREE.Mesh(merge(panels), std(0xdfe2e3, 0.35, 0.02, { side: THREE.DoubleSide })),
    new THREE.Mesh(merge(darkParts), std(0x2c3034, 0.5, 0.4, { side: THREE.DoubleSide })),
    new THREE.Mesh(ring, lightMat), glass);
  return { group: g, lightMat };
}

// --------------------------------------------------------------------------
// Emancipation grill: emitter posts and a shimmering field
export function buildFizzler(w, h) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
      float h1(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h1(i),h1(i+vec2(1,0)),f.x), mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vUv * uSize;                      // units
        // fine vertical shimmer and slow drifting haze
        float haze = n2(vec2(p.x / 14.0 + uTime * 0.6, p.y / 40.0 - uTime * 0.25)) * 0.6 + n2(vec2(p.x / 5.0 - uTime * 1.3, p.y / 9.0)) * 0.4;
        float lines = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float y = p.y / (9.0 + fi * 5.0) + uTime * (0.8 + fi * 0.5) + sin(p.x / 13.0 + uTime * 1.7 + fi * 2.0) * 0.5;
          lines += smoothstep(0.9, 1.0, fract(y)) * (0.35 + 0.2 * fi);
        }
        // a brighter scan band sweeping upwards
        float scan = smoothstep(0.06, 0.0, abs(fract(vUv.y * 0.9 - uTime * 0.35) - 0.5)) * 0.8;
        // drifting sparks: one per cell, moving sideways
        vec2 cell = vec2(10.0, 10.0);
        vec2 q = p + vec2(uTime * 22.0, sin(uTime * 0.7) * 6.0);
        vec2 id = floor(q / cell);
        vec2 off = vec2(h1(id), h1(id + 7.1)) * 0.7 + 0.15;
        float d = length(fract(q / cell) - off) * cell.x;
        float tw = step(0.55, h1(id + floor(uTime * 2.0 + h1(id) * 10.0)));
        float spark = smoothstep(1.1, 0.0, d) * tw;
        // fade towards the emitters' inner edges is handled by an edge glow
        float ex = min(vUv.x, 1.0 - vUv.x) * uSize.x;
        float edge = smoothstep(0.0, 6.0, ex);
        float edgeGlow = smoothstep(14.0, 0.0, ex) * 0.35;
        float k = 0.06 + haze * 0.1 + lines * 0.45 + scan * 0.25 + spark * 1.6 + edgeGlow;
        vec3 col = vec3(0.3, 0.62, 1.0) * k + vec3(0.7, 0.85, 1.0) * spark * 0.8;
        gl_FragColor = vec4(col * edge, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.renderOrder = 6;
  g.add(plane);
  const shell = [], darkP = [], glowP = [];
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 2);
    shell.push(place(roundedBox(9, h - 2, 16, 2.4), x + s * 1.5, 0, 0));
    shell.push(place(roundedBox(13, 7, 19, 2.2), x + s * 1, h / 2 - 4.5, 0));
    shell.push(place(roundedBox(13, 7, 19, 2.2), x + s * 1, -h / 2 + 4.5, 0));
    darkP.push(place(new THREE.BoxGeometry(3, h - 12, 9), x - s * 3, 0, 0));
    for (let i = 0; i < 6; i++) darkP.push(place(new THREE.BoxGeometry(9.4, 0.8, 16.4), x + s * 1.5, -h / 2 + 14 + i * ((h - 28) / 5), 0));
    glowP.push(place(new THREE.BoxGeometry(1.2, h - 14, 4), x - s * 4.6, 0, 0));
  }
  g.add(new THREE.Mesh(merge(shell), std(0xcfd3d5, 0.38, 0.05)), new THREE.Mesh(merge(darkP), std(0x23272b, 0.6, 0.3)),
    new THREE.Mesh(merge(glowP), new THREE.MeshBasicMaterial({ color: glow(0x6cc4ff, 2.2) })));
  return { group: g, mat };
}

// --------------------------------------------------------------------------
// Antline: a row of small round dots (blue off, orange on)
export function buildAntline(points) {
  const positions = [];
  const step = 9;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(b) / step));
    for (let k = 0; k < n; k++) positions.push(a.clone().lerp(b, k / n));
  }
  positions.push(points[points.length - 1]);
  const geo = new THREE.CylinderGeometry(1.75, 1.75, 0.5, 12);
  const mat = new THREE.MeshBasicMaterial({ color: glow(IND_OFF, 1.5) });
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => { m.makeTranslation(p.x, p.y + 0.3, p.z); mesh.setMatrixAt(i, m); });
  mesh.computeBoundingSphere();
  let lit = null;
  return {
    mesh,
    set(on) { if (on !== lit) { lit = on; mat.color.copy(glow(on ? IND_ON : IND_OFF, 1.5)); } },
  };
}

// --------------------------------------------------------------------------
// Glass panel frame: dark metal rim around the large face plus mullions.
// size: [x, y, z] extents of the glass box (centred at the origin).
export function buildGlassFrame(size) {
  const thin = size.indexOf(Math.min(...size));
  const [ua, va] = [0, 1, 2].filter((a) => a !== thin);   // in-plane axes
  const U = size[ua], V = size[va], D = size[thin] + 2.4, t = 3.2;
  const bars = [];
  const bar = (cu, cv, su, sv) => {
    const dims = [0, 0, 0], pos = [0, 0, 0];
    dims[ua] = su; dims[va] = sv; dims[thin] = D;
    pos[ua] = cu; pos[va] = cv;
    bars.push(place(roundedBox(dims[0], dims[1], dims[2], 0.8, 1), pos[0], pos[1], pos[2]));
  };
  bar(0, V / 2 - t / 2, U, t); bar(0, -V / 2 + t / 2, U, t);
  bar(U / 2 - t / 2, 0, t, V - 2 * t); bar(-U / 2 + t / 2, 0, t, V - 2 * t);
  const n = Math.max(1, Math.round(U / 64));
  for (let i = 1; i < n; i++) bar(-U / 2 + (U * i) / n, 0, t * 0.7, V - 2 * t);
  return new THREE.Mesh(merge(bars), std(0x2b2f34, 0.45, 0.5));
}

// --------------------------------------------------------------------------
// Rocket sentry: plinth and column with a white head on a ball joint.
export function buildRocketTurret() {
  const g = new THREE.Group();
  const dark = std(0x26292d, 0.48, 0.45);
  const white = std(0xe4e7e9, 0.3, 0.02);
  const L = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const darkParts = [
    L([[27, 0], [27, 2.5], [24, 6], [16, 8.5], [11, 9]]),
    place(new THREE.CylinderGeometry(8.5, 11, 44, 20), 0, 30, 0),
    place(new THREE.SphereGeometry(11, 20, 14), 0, 52, 0),
  ];
  const whiteParts = [
    place(new THREE.CylinderGeometry(11.5, 11.5, 4, 24), 0, 14, 0),
    place(new THREE.CylinderGeometry(10.5, 10.5, 4, 24), 0, 40, 0),
  ];
  g.add(new THREE.Mesh(merge(darkParts), dark), new THREE.Mesh(merge(whiteParts), white));
  const pivot = new THREE.Group();
  pivot.position.y = 64;
  const head = [new THREE.SphereGeometry(17, 28, 20)];
  const headDark = [
    new THREE.TorusGeometry(17.1, 1.6, 6, 40).rotateY(Math.PI / 2),
    place(new THREE.CylinderGeometry(7, 9, 8, 20), 0, -15, 0),                               // neck socket
    place(new THREE.CylinderGeometry(8.6, 9.6, 5, 28), 0, 0, 15.5, Math.PI / 2),          // eye bezel
    place(new THREE.CylinderGeometry(4.8, 4.8, 30, 16), 16, -2, 6, Math.PI / 2),          // launch tube
    place(new THREE.TorusGeometry(5.2, 1.1, 6, 20), 16, -2, 21.2),
    place(roundedBox(6, 6, 10, 1.5), 12, -2, -2),
  ];
  const headWhite = [place(new THREE.CylinderGeometry(5.6, 5.6, 6, 16), 16, -2, 2, Math.PI / 2)];
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x40ff70 });
  const eye = new THREE.Mesh(new THREE.CircleGeometry(6, 28), eyeMat); eye.position.z = 18.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.6, 6, 32), std(0x9aa1a7, 0.3, 0.8)); ring.position.z = 18.1;
  const eg = glowSprite(0x60ffa0, 16); eg.position.z = 19.5; eg.material.opacity = 0.5;
  pivot.add(new THREE.Mesh(merge(head), white), new THREE.Mesh(merge([...headDark]), dark), new THREE.Mesh(merge(headWhite), white), eye, ring, eg);
  g.add(pivot);
  return { group: g, pivot, eyeMat, glowMat: eg.material };
}
