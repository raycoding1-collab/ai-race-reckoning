import * as THREE from 'three';
import { CELL, GRAVITY, CUBE, PELLET, PORTAL } from './constants.js';
import { Body, moveBody, groundBelow, funnel } from './physics.js';
import { traceGrid } from './level.js';
import { makeSignTexture, makeGraffiti } from './textures.js';
import {
  buildCube, buildButton, buildDoor, buildTurret, animateTurret, buildWallDevice, buildFaithPlate,
  buildDispenser, buildFizzler, buildAntline, buildGlassFrame, buildRocketTurret, withClone, CUBE_RING, IND_ON, IND_OFF,
} from './models.js';

const C = (v) => v * CELL;
// physically based stand-in for the old Phong materials: shininess maps to roughness
const phong = (o) => {
  const { shininess = 30, specular, ...rest } = o;
  void specular;
  return new THREE.MeshStandardMaterial({ roughness: Math.max(0.18, Math.min(0.9, 1 - shininess / 110)), metalness: 0.05, ...rest });
};

function noCull(o) { o.traverse((c) => { c.frustumCulled = false; }); return o; }

// ---------------------------------------------------------------------------
// Blob shadow: cheap contact shadow projected straight down onto the grid
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
export class BlobShadow {
  constructor(scene, size) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.size = size;
    scene.add(this.mesh);
  }
  update(world, pos, bottom) {
    const hit = traceGrid(world.grid, new THREE.Vector3(pos.x, bottom + 1, pos.z), new THREE.Vector3(0, -1, 0), 400);
    if (!hit) { this.mesh.visible = false; return; }
    const y = bottom + 1 - hit.t;
    const h = bottom - y;
    this.mesh.visible = true;
    this.mesh.position.set(pos.x, y + 0.3, pos.z);
    const s = 1 + h / 120;
    this.mesh.scale.set(s, s, 1);
    this.mesh.material.opacity = Math.max(0, 1 - h / 300);
  }
  dispose(scene) { scene.remove(this.mesh); }
}

// ---------------------------------------------------------------------------
// Weighted storage cube
const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e7);
const _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
const _tq = new THREE.Quaternion(), _tv = new THREE.Vector3();
const _axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
export class Cube {
  constructor(world, pos, opts = {}) {
    this.world = world;
    this.kind = 'cube';
    const h = opts.half || [CUBE.half, CUBE.half, CUBE.half];
    this.body = new Body('cube', h[0], h[1], h[2]);
    this.body.owner = this;
    this.body.pos.copy(pos);
    this.yaw = opts.yaw || 0;
    this.dispenser = opts.dispenser || null;
    this.companion = !!opts.companion;
    this.held = false;
    this.dissolving = -1;
    this.tumble = true;                      // free rotation while airborne
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.spin = new THREE.Vector3();
    this.wasGround = true;
    this.build(world);
    this.clone.visible = false;
    this.mesh.rotation.order = this.clone.rotation.order = 'YXZ';
    noCull(this.mesh); noCull(this.clone);
    world.scene.add(this.mesh, this.clone);
    this.shadow = new BlobShadow(world.scene, 70);
    world.bodies.push(this.body);
    this.planeA = NO_CLIP.clone(); this.planeB = NO_CLIP.clone();
    for (const m of this.mats) m.clippingPlanes = [this.planeA];
    for (const m of this.cloneMats) m.clippingPlanes = [this.planeB];
    this.impactCooldown = 0;
  }

  build() {
    const m = buildCube(this.companion);
    const c = withClone(m.group, m.mats);
    this.mesh = c.mesh; this.clone = c.clone;
    this.mats = c.mats; this.cloneMats = c.cloneMats;
    this.mat = m.bodyMat;
    this.ringMats = [m.ringMat, c.map.get(m.ringMat)];
  }

  // visual only: the emblem ring turns orange while the cube holds a button down
  updateLights() {
    const lit = this.world.time - (this.buttonTime ?? -1) < 0.15;
    if (lit === this.lit || !this.ringMats) return;
    this.lit = lit;
    const hex = lit ? CUBE_RING.on : this.companion ? CUBE_RING.companionOff : CUBE_RING.off;
    for (const m of this.ringMats) m.emissive.setHex(hex);
  }

  push(dir, speed) {
    if (this.held || !this.body.onGround) return;
    const v = this.body.vel;
    const cur = v.x * dir.x + v.z * dir.z;
    const target = speed * 0.7;
    if (cur < target) { v.x += dir.x * (target - cur); v.z += dir.z * (target - cur); }
  }

  update(dt) {
    this.updateLights();
    if (this.dissolving >= 0) {
      this.dissolving += dt;
      const k = Math.min(1, this.dissolving / 0.9);
      this.mat.color.setRGB(1 - k * 0.8, 1 - k * 0.6, 1);
      this.mat.emissive.setRGB(k * 0.3, k * 0.5, k * 0.9);
      this.body.vel.multiplyScalar(0.9);
      this.body.vel.y += 30 * dt;
      this.body.pos.addScaledVector(this.body.vel, dt);
      this.mesh.scale.setScalar(1 - k * 0.3);
      if (k >= 1) this.world.removeCube(this);
      this.sync();
      return;
    }
    const b = this.body;
    if (!this.held) {
      const g = groundBelow(this.world, b, 1.5);
      b.onGround = !!g && b.vel.y <= 50;
      if (b.onGround) {
        if (b.vel.y < 0) b.vel.y = 0;
        // ground friction (kinetic): decelerate horizontally
        const sp = Math.hypot(b.vel.x, b.vel.z);
        if (sp > 0) {
          const ns = Math.max(0, sp - Math.max(sp, 60) * CUBE.friction * dt) / sp;
          b.vel.x *= ns; b.vel.z *= ns;
        }
      } else {
        b.vel.y -= GRAVITY * dt;
        funnel(this.world, b, dt, 250);          // sv_props_funnel_into_portals
      }
      // slide into a floor portal we are mostly over
      for (const P of b.holes) {
        if (!P.linked || P.normal.y < 0.5 || b.pos.y - b.half.y - P.plane > 3) continue;
        if (!P.inRect(b.pos)) continue;
        const toC = new THREE.Vector3().subVectors(P.pos, b.pos); toC.y = 0;
        b.pos.addScaledVector(toC, Math.min(1, dt * 6));
      }
    }
    const pre = b.vel.length();
    moveBody(this.world, b, dt);
    this.updateRotation(dt);
    for (const h of b.hits) {
      if (h.ent && h.ent.isBody && h.ent.owner && h.ent.owner.knock && h.speed > 110) h.ent.owner.knock();
    }
    this.impactCooldown -= dt;
    if (b.hits.length && this.impactCooldown <= 0) {
      const sp = Math.max(...b.hits.map((h) => h.speed));
      if (sp > 160 && pre > 160) { this.world.events.emit('impact', { pos: b.pos, speed: sp }); this.impactCooldown = 0.15; }
    }
    this.sync();
  }

  onTeleported(P) {
    // carry the full orientation (and any spin) through the portal
    this.q.premultiply(P.toOtherQuat);
    this.spin.applyQuaternion(P.toOtherQuat);
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).applyQuaternion(P.toOtherQuat);
    if (Math.hypot(f.x, f.z) > 0.1) this.yaw = Math.atan2(f.x, f.z);
  }

  // Visual rotation: tumble in flight, settle flat on whichever face lands.
  updateRotation(dt) {
    const b = this.body;
    if (this.held || !this.tumble) {
      _tq.setFromAxisAngle(_up, this.yaw);
      this.q.slerp(_tq, Math.min(1, dt * 14));
      this.spin.set(0, 0, 0);
      this.wasGround = true;
      return;
    }
    if (!b.onGround) {
      if (this.wasGround) {
        // leaving the ground: roll in the direction of travel
        const h = _tv.set(b.vel.x, 0, b.vel.z);
        const sp = h.length();
        if (sp > 60) this.spin.crossVectors(_up, h.divideScalar(sp)).multiplyScalar(Math.min(7, sp / 90));
      }
      const w = this.spin.length();
      if (w > 1e-3) {
        _tq.setFromAxisAngle(_tv.copy(this.spin).divideScalar(w), w * dt);
        this.q.premultiply(_tq).normalize();
      }
      this.spin.multiplyScalar(Math.max(0, 1 - dt * 0.3));
    } else {
      this.spin.set(0, 0, 0);
      // which local axis points most nearly up? rotate it exactly up
      let best = null, bestDot = -2;
      for (const a of _axes) {
        const d = _tv.copy(a).applyQuaternion(this.q).y;
        if (d > bestDot) { bestDot = d; best = a; }
      }
      _tv.copy(best).applyQuaternion(this.q);
      _tq.setFromUnitVectors(_tv, _up).multiply(this.q);
      this.q.slerp(_tq, Math.min(1, dt * 12));
      // keep yaw in sync for picking up
      const f = _tv.set(0, 0, 1).applyQuaternion(this.q);
      if (Math.abs(f.y) < 0.7) this.yaw = Math.atan2(f.x, f.z);
    }
    this.wasGround = b.onGround;
  }

  sync() {
    const b = this.body;
    this.mesh.position.copy(b.pos);
    if (this.tumble) this.mesh.quaternion.copy(this.q);
    else this.mesh.rotation.set(0, this.yaw, 0);
    // render a clipped copy on the far side while passing through a portal
    const P = b.holes.find((p) => p.linked && Math.abs(p.dist(b.pos)) < b.half.y * 1.8);
    if (P && this.dissolving < 0) {
      this.planeA.setFromNormalAndCoplanarPoint(P.normal, P.pos);
      this.planeB.setFromNormalAndCoplanarPoint(P.other.normal, P.other.pos);
      this.clone.visible = true;
      const m = new THREE.Matrix4().compose(b.pos, this.mesh.quaternion, _one);
      m.premultiply(P.toOther);
      m.decompose(this.clone.position, this.clone.quaternion, this.clone.scale);
    } else {
      this.planeA.copy(NO_CLIP); this.planeB.copy(NO_CLIP);
      this.clone.visible = false;
    }
    this.shadow.update(this.world, b.pos, b.pos.y - b.half.y);
  }

  dissolve() {
    if (this.dissolving >= 0) return;
    this.dissolving = 0;
    this.body.solid = false;
    if (this.held) this.world.dropCube?.();
    this.world.events.emit('fizzle', { pos: this.body.pos.clone() });
  }

  dispose() {
    this.world.scene.remove(this.mesh, this.clone);
    this.shadow.dispose(this.world.scene);
    const i = this.world.bodies.indexOf(this.body);
    if (i >= 0) this.world.bodies.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// 1500 megawatt super-colliding super button
export class FloorButton {
  constructor(world, d) {
    this.world = world;
    this.signal = d.signal;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.cubeOnly = !!d.cubeOnly;
    this.pressed = false;
    this.depress = 0;
    const model = buildButton();
    const g = model.group;
    this.ringMat = model.ringMat;
    this.pad = model.pad;
    this.pad.position.y = 3;
    g.position.copy(this.pos);
    world.scene.add(noCull(g));
    this.group = g;
    world.noPortalBoxes.push([this.pos.x - 52, this.pos.y - 1, this.pos.z - 52, this.pos.x + 52, this.pos.y + 14, this.pos.z + 52]);
    world.setSignal(this.signal, false);
  }
  update(dt) {
    const p = this.pos;
    let down = false;
    for (const b of this.world.bodies) {
      if (!b.solid && b.kind !== 'player') continue;
      if (this.cubeOnly && b.kind !== 'cube') continue;
      if (b.owner && b.owner.held) continue;
      const bottom = b.pos.y - b.half.y;
      if (bottom > p.y + 16 || bottom < p.y - 4) continue;
      if (Math.abs(b.pos.x - p.x) < 38 + b.half.x * 0.5 && Math.abs(b.pos.z - p.z) < 38 + b.half.z * 0.5) {
        down = true;
        if (b.owner) b.owner.buttonTime = this.world.time;   // lights the cube's emblem
      }
    }
    if (down !== this.pressed) {
      this.pressed = down;
      this.world.setSignal(this.signal, down);
      this.world.events.emit(down ? 'buttonDown' : 'buttonUp', { pos: p });
    }
    this.depress += ((down ? 1 : 0) - this.depress) * Math.min(1, dt * 14);
    this.pad.position.y = 3 - this.depress * 6;
    this.ringMat.emissive.setHex(down ? IND_ON : IND_OFF);
  }
}

// ---------------------------------------------------------------------------
// Sliding door. `at` is the bottom-centre of the opening (cells), `axis` the
// wall normal axis ('x' or 'z').
export class Door {
  constructor(world, d) {
    this.world = world;
    this.inputs = d.inputs || [];
    this.axis = d.axis === 'x' ? 0 : 2;
    this.w = C(d.width || 2); this.h = C(d.height || 3);
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.open = 0;
    this.isOpen = this.inputs.length === 0 && d.startOpen;
    this.solidState = true;
    const t = 6;
    if (this.axis === 0) this.box = [this.pos.x - t, this.pos.y, this.pos.z - this.w / 2, this.pos.x + t, this.pos.y + this.h, this.pos.z + this.w / 2];
    else this.box = [this.pos.x - this.w / 2, this.pos.y, this.pos.z - t, this.pos.x + this.w / 2, this.pos.y + this.h, this.pos.z + t];
    world.solids.push(this);
    world.shotBlockers.push(this);
    this.model = this.buildModel(world);
    const g = this.model.group;
    g.position.copy(this.pos);
    if (this.axis === 0) g.rotation.y = Math.PI / 2;
    world.scene.add(noCull(g));
    this.group = g;
    const pad = 12;
    world.noPortalBoxes.push([this.box[0] - pad, this.box[1] - pad, this.box[2] - pad, this.box[3] + pad, this.box[4] + pad, this.box[5] + pad]);
  }
  // visual: find the wall faces around the opening so the frame lips sit on
  // them, and put indicator signs on solid wall to the viewer's right
  buildModel(world) {
    const ax = this.axis === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const lat = this.axis === 0 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
    const at = (x, y, z) => this.pos.clone().addScaledVector(lat, x).addScaledVector(ax, z).setY(this.pos.y + y);
    const solid = (v) => world.grid.solidAt(v.x, v.y, v.z);
    let lo = -6, hi = 6;
    if (solid(at(0, this.h + 8, 0))) {
      lo = 0; hi = 0;
      while (lo > -64 && solid(at(0, this.h + 8, lo - 1))) lo--;
      while (hi < 64 && solid(at(0, this.h + 8, hi + 1))) hi++;
      hi += 1;
    }
    const sx = this.w / 2 + 34, sy = this.h * 0.62;
    const wallAt = (x, z) => [-13, 0, 13].every((d) => solid(at(x + d, sy, z)) && solid(at(x + d, sy + 12, z)) && solid(at(x + d, sy - 12, z)));
    const signs = [];
    if (wallAt(-sx, lo + 1)) signs.push({ x: -sx, z: lo, flip: true });
    if (wallAt(sx, hi - 1)) signs.push({ x: sx, z: hi, flip: false });
    return buildDoor(this.w, this.h, [lo, hi], signs);
  }
  isSolid() { return this.solidState; }
  blocksShot() { return this.solidState; }
  update(dt) {
    const want = this.inputs.length ? this.inputs.every((s) => this.world.getSignal(s)) : !!this.isOpen;
    if (want !== this.target) {
      if (this.target !== undefined) this.world.events.emit(want ? 'doorOpen' : 'doorClose', { pos: this.pos });
      this.target = want;
    }
    const speed = 1.6;
    this.open += Math.sign((want ? 1 : 0) - this.open) * Math.min(Math.abs((want ? 1 : 0) - this.open), dt * speed);
    this.model.update(this.open, want);
    this.solidState = this.open < 0.6;
  }
}

// ---------------------------------------------------------------------------
// Material emancipation grill: vaporises cubes and resets your portals.
export class Fizzler {
  constructor(world, d) {
    this.world = world;
    const b = d.box.map(C);
    this.box = b;
    this.axis = b[3] - b[0] < b[5] - b[2] ? 0 : 2;  // thin axis
    if (this.axis === 0) { const m = (b[0] + b[3]) / 2; b[0] = m - 2; b[3] = m + 2; }
    else { const m = (b[2] + b[5]) / 2; b[2] = m - 2; b[5] = m + 2; }
    world.shotBlockers.push(this);
    const w = this.axis === 0 ? b[5] - b[2] : b[3] - b[0];
    const h = b[4] - b[1];
    const model = buildFizzler(w, h);
    this.mat = model.mat;
    const g = model.group;
    g.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    if (this.axis === 0) g.rotation.y = Math.PI / 2;
    world.scene.add(noCull(g));
    this.prevInside = new Map();
  }
  blocksShot() { return true; }
  update() {
    this.mat.uniforms.uTime.value = this.world.time;
    const b = this.box;
    for (const body of this.world.bodies) {
      const inside = body.overlapsBox(b[0], b[1], b[2], b[3], b[4], b[5]);
      if (inside && !this.prevInside.get(body)) {
        if (body.kind === 'player') this.world.fizzlePortals(true);
        else if (body.owner && body.owner.dissolve) body.owner.dissolve();
      }
      this.prevInside.set(body, inside);
    }
    // a cube held across the field is lost too
  }
}

// ---------------------------------------------------------------------------
// Toxic goo
export class Goo {
  constructor(world, d) {
    this.world = world;
    const b = d.box.map(C);
    this.box = b;
    this.top = b[4];
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFire: { value: d.fire ? 1 : 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; uniform float uFire; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float h(vec2 p){ return n(p + vec2(uTime*0.15, uTime*0.07)) * 0.6 + n(p*2.3 - vec2(uTime*0.11, -uTime*0.13)) * 0.4; }
        void main(){
          vec2 p = vW.xz / 90.0;
          float a = h(p);
          // slow sludge: normal from the height field, murky body colour, a dull
          // fresnel sheen and glints of the ceiling lights (all in linear light)
          vec3 nr = normalize(vec3((a - h(p + vec2(0.04, 0.0))) * 1.4, 0.12, (a - h(p + vec2(0.0, 0.04))) * 1.4));
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(nr, v), 0.0), 4.0);
          float spec = pow(max(dot(reflect(-v, nr), vec3(0.0, 1.0, 0.0)), 0.0), 60.0);
          vec3 col = mix(vec3(0.018, 0.013, 0.004), vec3(0.07, 0.05, 0.012), a);
          col += vec3(0.09, 0.085, 0.07) * fr + vec3(1.2, 1.1, 0.9) * spec * 0.6;
          if (uFire > 0.5) {
            float f = n(p * 1.7 + vec2(0.0, -uTime * 1.3)) * 0.6 + n(p * 4.1 - vec2(uTime * 0.7, uTime * 1.9)) * 0.4;
            col = mix(vec3(0.25, 0.02, 0.0), vec3(3.2, 1.2, 0.2), smoothstep(0.35, 0.95, f));   // HDR so it blooms
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b[3] - b[0], b[5] - b[2], 1, 1), this.mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((b[0] + b[3]) / 2, this.top, (b[2] + b[5]) / 2);
    world.scene.add(noCull(m));
    world.noPortalBoxes.push([b[0], b[1] - 40, b[2], b[3], b[4] + 2, b[5]]);
  }
  update() {
    this.mat.uniforms.uTime.value = this.world.time;
    const b = this.box;
    for (const body of this.world.bodies) {
      if (body.pos.x < b[0] || body.pos.x > b[3] || body.pos.z < b[2] || body.pos.z > b[5]) continue;
      if (body.kind === 'player') {
        if (body.pos.y - body.half.y < this.top - 10) this.world.killPlayer('goo');
      } else if (body.pos.y < this.top && body.owner && body.owner.dissolve) {
        body.owner.dissolve();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exit lift
export class Exit {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.radius = d.hidden ? C(d.radius || 2) : 44;
    if (d.hidden) return;
    const g = new THREE.Group();
    const r = 46;
    const tubeMat = new THREE.MeshPhongMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, shininess: 90, side: THREE.DoubleSide, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 150, 40, 1, true), tubeMat);
    tube.position.y = 75;
    tube.renderOrder = 7;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 4, 4, 40), phong({ color: 0x7c8287 }));
    floor.position.y = 2;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 2, 8, 48), this.ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 4.5;
    const top = ring.clone(); top.position.y = 150;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(r - 4, r - 4, 140, 32, 1, true), glowMat);
    beam.position.y = 74;
    g.add(tube, floor, ring, top, beam);
    g.position.copy(this.pos);
    world.scene.add(noCull(g));
    world.noPortalBoxes.push([this.pos.x - 60, this.pos.y - 2, this.pos.z - 60, this.pos.x + 60, this.pos.y + 160, this.pos.z + 60]);
  }
  update() {
    const b = this.world.player.body;
    const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
    if (d < this.radius && b.pos.y - b.half.y < this.pos.y + 20 && b.pos.y > this.pos.y) this.world.completeLevel();
  }
}

// ---------------------------------------------------------------------------
// Cube dispenser (drops a fresh cube whenever its cube is destroyed)
export class Dispenser {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));  // bottom of the tube
    this.cube = null;
    this.respawnTimer = 0.2;
    const model = buildDispenser();
    const g = model.group;
    g.position.copy(this.pos);
    world.scene.add(noCull(g));
  }
  update(dt) {
    if (!this.cube || this.cube.removed) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.cube = this.world.spawnCube(new THREE.Vector3(this.pos.x, this.pos.y - CUBE.half - 4, this.pos.z), { dispenser: this });
        this.respawnTimer = 0.8;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Aerial faith plate
export class FaithPlate {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.target = new THREE.Vector3(C(d.target[0]), C(d.target[1]), C(d.target[2]));
    this.apex = C(d.apex ?? 4);
    this.speed = d.speed ?? (d.apex === undefined ? 450 : 0);
    this.exact = !!d.exact;
    this.cool = 0;
    this.flip = 0;
    const model = buildFaithPlate();
    const g = model.group;
    this.lightMat = model.lightMat;
    this.plate = model.plate;
    this.plate.position.set(0, 8, -32);
    model.hingeMesh.position.copy(this.plate.position);
    const dir = new THREE.Vector3().subVectors(this.target, this.pos); dir.y = 0;
    const holder = new THREE.Group();
    holder.add(this.plate, model.hingeMesh);
    holder.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    g.add(holder);
    g.position.copy(this.pos);
    world.scene.add(noCull(g));
    world.noPortalBoxes.push([this.pos.x - 48, this.pos.y - 2, this.pos.z - 48, this.pos.x + 48, this.pos.y + 12, this.pos.z + 48]);
  }
  // Our chambers aim each plate with an apex height. A plate may instead give
  // `speed` (trigger_catapult playerSpeed, default 450): the flight time is
  // distance / speed and the upward velocity is whatever reaches the target
  // in that time ("added upward velocity"). With `exact`, the launch speed is
  // exactly `speed` and the lower of the two ballistic arcs is used.
  launchVelocity(from) {
    const g = GRAVITY;
    if (this.speed) {
      const d = new THREE.Vector3().subVectors(this.target, from);
      const hd = Math.hypot(d.x, d.z), s = this.speed;
      if (this.exact && hd > 1) {
        const disc = s ** 4 - g * (g * hd * hd + 2 * d.y * s * s);
        if (disc >= 0) {
          const tan = (s * s - Math.sqrt(disc)) / (g * hd);
          const c = 1 / Math.sqrt(1 + tan * tan);
          return new THREE.Vector3(d.x / hd * s * c, s * c * tan, d.z / hd * s * c);
        }
      }
      const T = Math.max(0.05, d.length() / s);
      return new THREE.Vector3(d.x / T, d.y / T + 0.5 * g * T, d.z / T);
    }
    const apexY = Math.max(this.apex + this.pos.y, this.target.y + 20, from.y + 20);
    const up = apexY - from.y;
    const vy = Math.sqrt(2 * g * up);
    const tUp = vy / g;
    const tDown = Math.sqrt(2 * Math.max(1, apexY - this.target.y) / g);
    const T = tUp + tDown;
    return new THREE.Vector3((this.target.x - from.x) / T, vy, (this.target.z - from.z) / T);
  }
  update(dt) {
    this.cool -= dt;
    this.flip = Math.max(0, this.flip - dt * 3);
    this.plate.rotation.x = -Math.sin(Math.min(1, this.flip) * Math.PI) * 0.9;
    this.lightMat.emissive.setHex(this.flip > 0 ? IND_ON : IND_OFF);
    if (this.cool > 0) return;
    for (const b of this.world.bodies) {
      if (!b.solid || (b.owner && b.owner.held)) continue;
      const bottom = b.pos.y - b.half.y;
      if (bottom > this.pos.y + 14 || bottom < this.pos.y - 4) continue;
      if (Math.abs(b.pos.x - this.pos.x) > 36 || Math.abs(b.pos.z - this.pos.z) > 36) continue;
      const feet = new THREE.Vector3(b.pos.x, bottom, b.pos.z);
      const v = this.launchVelocity(feet);
      b.vel.copy(v);
      b.pos.y += 2;
      b.onGround = false;
      b.lastTeleport = this.world.time; // suppress ground snap for a moment
      if (b.owner && 'airSuppress' in b.owner) b.owner.airSuppress = 0.25;   // targeted catapults mute air control for 1/4 s
      this.cool = 0.6;
      this.flip = 1;
      this.world.events.emit('faith', { pos: this.pos });
    }
  }
}

// ---------------------------------------------------------------------------
// High energy pellets, launchers and receptacles
export class PelletLauncher {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.dir = new THREE.Vector3(...d.dir).normalize();
    this.pellet = null;
    this.timer = 1.0;
    this.speed = d.speed || PELLET.speed;          // point_energy_ball_launcher min/max speed
    this.stopSignal = d.stopSignal;
    world.scene.add(noCull(this.device(false)));
    world.noPortalBoxes.push(boxAround(this.pos, 52));
  }
  update(dt) {
    if (this.stopSignal && this.world.getSignal(this.stopSignal)) { this.coreMat.color.setHex(0x444444); this.ringMat.emissiveIntensity = 0.15; return; }
    if (this.pellet && !this.pellet.dead) return;
    this.timer -= dt;
    this.coreMat.color.setHSL(0.11, 1, 0.5 + 0.3 * Math.sin(this.world.time * 10)).multiplyScalar(1.8);
    this.ringMat.emissiveIntensity = 1.2 + 0.5 * Math.sin(this.world.time * 10);
    if (this.timer <= 0) {
      this.pellet = new Pellet(this.world, this.pos.clone().addScaledVector(this.dir, 22), this.dir.clone().multiplyScalar(this.speed));
      this.world.entities.push(this.pellet);
      this.world.events.emit('pelletLaunch', { pos: this.pos });
      this.timer = 2.0;
    }
  }
}

export class Receptacle {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.dir = new THREE.Vector3(...d.dir).normalize();
    this.signal = d.signal;
    this.active = false;
    world.setSignal(this.signal, false);
    world.scene.add(noCull(this.device(true)));
    world.noPortalBoxes.push(boxAround(this.pos, 52));
    world.receptacles.push(this);
  }
  capture() {
    this.active = true;
    this.coreMat.color.setHex(0xffc65a).multiplyScalar(2.2);
    this.ringMat.emissive.setHex(IND_ON);
    this.world.setSignal(this.signal, true);
    this.world.events.emit('receptacle', { pos: this.pos });
  }
  update() {}
}

function boxAround(p, r) { return [p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r]; }

// round wall housing shared by launchers and receptacles (visual)
function device(catcher) {
  const m = buildWallDevice(catcher);
  this.coreMat = m.coreMat;
  this.ringMat = m.ringMat;
  m.group.position.copy(this.pos);
  m.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
  return m.group;
}
PelletLauncher.prototype.device = device;
Receptacle.prototype.device = device;

let pelletGlowTex = null;
export class Pellet {
  constructor(world, pos, vel) {
    this.world = world;
    this.pos = pos; this.vel = vel;
    this.age = 0;
    this.dead = false;
    if (!pelletGlowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,220,120,0.9)'); gr.addColorStop(1, 'rgba(255,140,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      pelletGlowTex = new THREE.CanvasTexture(c);
    }
    this.mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(PELLET.radius * 0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: pelletGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(PELLET.radius * 6);
    this.mesh.add(core, glow);
    world.scene.add(noCull(this.mesh));
    this.mesh.position.copy(pos);
  }
  update(dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.age > PELLET.lifetime) return this.explode();
    const w = this.world;
    const steps = Math.ceil(this.vel.length() * dt / 4);
    const sdt = dt / steps;
    for (let s = 0; s < steps && !this.dead; s++) {
      const from = this.pos.clone();
      const to = from.clone().addScaledVector(this.vel, sdt);
      // portals
      let ported = false;
      for (const P of w.portalList) {
        if (!P.linked) continue;
        const d0 = P.dist(from), d1 = P.dist(to);
        if (d0 >= 0 && d1 < 0) {
          const hit = from.clone().lerp(to, d0 / (d0 - d1));
          if (P.inOval(hit, 0.92)) {
            to.applyMatrix4(P.toOther);
            this.vel.applyQuaternion(P.toOtherQuat);
            ported = true;
            if (PELLET.lifetime - this.age < PELLET.minLifeAfterPortal) this.age = PELLET.lifetime - PELLET.minLifeAfterPortal;   // portals recharge pellets
            w.events.emit('pelletPortal', {});
            break;
          }
        }
      }
      if (!ported) {
        // bounce off grid (per-axis reflection)
        const r = PELLET.radius * 0.5;
        for (let a = 0; a < 3; a++) {
          const probe = from.clone();
          probe.setComponent(a, to.getComponent(a) + Math.sign(this.vel.getComponent(a)) * r);
          if (w.grid.solidAt(probe.x, probe.y, probe.z) && !inPortalHole(w, probe)) {
            this.vel.setComponent(a, -this.vel.getComponent(a));
            to.setComponent(a, from.getComponent(a));
            w.events.emit('pelletBounce', { pos: from });
          }
        }
        // solid entities (doors, glass) and cubes
        for (const sld of w.solids) {
          if (!sld.isSolid()) continue;
          const b = sld.box;
          if (to.x > b[0] && to.x < b[3] && to.y > b[1] && to.y < b[4] && to.z > b[2] && to.z < b[5]) {
            this.reflectFromBox(from, b, to);
          }
        }
        for (const body of w.bodies) {
          if (body.kind === 'player') continue;
          const p = body.pos, h = body.half;
          const b = [p.x - h.x, p.y - h.y, p.z - h.z, p.x + h.x, p.y + h.y, p.z + h.z];
          if (to.x > b[0] && to.x < b[3] && to.y > b[1] && to.y < b[4] && to.z > b[2] && to.z < b[5]) {
            this.reflectFromBox(from, b, to);
            body.owner?.knock?.();                      // pellets bowl turrets over
          }
        }
      }
      this.pos.copy(to);
      // receptacles
      for (const R of w.receptacles) {
        if (R.active) continue;
        if (this.pos.distanceTo(R.pos.clone().addScaledVector(R.dir, 14)) < 26) {
          R.capture();
          this.dead = true;
          w.scene.remove(this.mesh);
          return;
        }
      }
      // the player
      const pb = w.player.body;
      if (w.player.alive && Math.abs(this.pos.x - pb.pos.x) < pb.half.x + PELLET.radius && Math.abs(this.pos.y - pb.pos.y) < pb.half.y + PELLET.radius && Math.abs(this.pos.z - pb.pos.z) < pb.half.z + PELLET.radius) {
        w.killPlayer('pellet');
        this.explode();
        return;
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.children[1].material.rotation = this.age * 3;
  }
  reflectFromBox(from, b, to) {
    let hit = false;
    for (let a = 0; a < 3; a++) {
      const f = from.getComponent(a);
      if (f <= b[a] || f >= b[a + 3]) {
        this.vel.setComponent(a, -this.vel.getComponent(a));
        to.setComponent(a, f);
        hit = true;
      }
    }
    if (hit) return;
    // the box moved onto the pellet (a carried cube): leave by the nearest face, heading outward
    let best = 0, side = 0, depth = Infinity;
    for (let a = 0; a < 3; a++) {
      const f = from.getComponent(a);
      if (f - b[a] < depth) { depth = f - b[a]; best = a; side = -1; }
      if (b[a + 3] - f < depth) { depth = b[a + 3] - f; best = a; side = 1; }
    }
    to.copy(from).setComponent(best, side < 0 ? b[best] - 0.5 : b[best + 3] + 0.5);
    this.vel.setComponent(best, side * Math.abs(this.vel.getComponent(best)));
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    this.world.scene.remove(this.mesh);
    this.world.events.emit('pelletExplode', { pos: this.pos.clone() });
    this.world.spawnBurst(this.pos, 0xffc060);
  }
  dispose() { this.world.scene.remove(this.mesh); }
}

function inPortalHole(world, p) {
  for (const P of world.portalList) {
    if (!P.linked) continue;
    const d = P.dist(p);
    if (d < 0 && d > -PORTAL.holeDepth && P.inOval(p, 0.95)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Glass panel (blocks bodies and portal shots, not light)
export class Glass {
  constructor(world, d) {
    this.world = world;
    this.box = d.box.map(C);
    const b = this.box;
    world.solids.push(this);
    world.shotBlockers.push(this);
    const geo = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    // frosted observation glass glows from the lit booth behind it
    const mat = d.frosted
      ? new THREE.MeshStandardMaterial({ color: 0xe6f2ff, emissive: 0xcfe6ff, emissiveIntensity: 0.75, roughness: 0.25, transparent: true, opacity: 0.62 })
      : new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.5 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    m.renderOrder = 7;
    this.mesh = m;
    this.breakable = !!d.breakable;
    this.broken = false;
    this.signal = d.signal;
    m.add(buildGlassFrame([b[3] - b[0], b[4] - b[1], b[5] - b[2]]));
    world.scene.add(noCull(m));
  }
  isSolid() { return !this.broken; }
  blocksShot() { return !this.broken; }
  shatter() {
    if (!this.breakable || this.broken) return;
    this.broken = true;
    this.mesh.visible = false;
    const b = this.box;
    const c = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    this.world.spawnBurst(c, 0xcfe8ff, 90, 260);
    this.world.events.emit('glassBreak', { pos: c });
    if (this.signal) this.world.setSignal(this.signal, true);
  }
  update() {}
}

// ---------------------------------------------------------------------------
// Chamber sign (number, title, hazard icons)
export class Sign {
  constructor(world, d) {
    const tex = makeSignTexture(d.number, d.title, d.icons || [], world.renderer, world.lastLevel);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(56, 112), new THREE.MeshBasicMaterial({ map: tex }));
    const back = new THREE.Mesh(new THREE.BoxGeometry(60, 116, 3), phong({ color: 0x8b9094 }));
    back.position.z = -1.6;
    const g = new THREE.Group();
    g.add(back, m);
    const n = new THREE.Vector3(...d.dir);
    g.position.set(C(d.at[0]), C(d.at[1]), C(d.at[2])).addScaledVector(n, 3.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    world.scene.add(noCull(g));
    this.world = world;
  }
  update() {}
}

// ---------------------------------------------------------------------------
// Indicator dots between an input and what it controls
export class Wire {
  constructor(world, d) {
    this.world = world;
    this.signal = d.signal;
    const pts = d.points.map((p) => new THREE.Vector3(C(p[0]), C(p[1]), C(p[2])));
    this.ant = buildAntline(pts);
    this.mesh = this.ant.mesh;
    this.mesh.frustumCulled = false;
    world.scene.add(this.mesh);
  }
  update() {
    this.ant.set(this.world.getSignal(this.signal));
  }
}


// ---------------------------------------------------------------------------
// Sentry turret: a carryable body with a sight cone and a laser. Knocking it
// over (push, drop, fall, hit with a cube) shuts it down for good.
const TURRET_RANGE = 1500;                  // fixed in Portal 1
const TURRET_COS = Math.cos(Math.PI / 3);   // 120 degree sight cone
export class Turret extends Cube {
  constructor(world, pos, opts = {}) {
    super(world, pos, { ...opts, half: [12, 30, 12] });
    this.kind = 'turret';
    this.tumble = false;
    this.tipped = false;
    this.tip = 0;
    this.alert = 0;
    this.shotTimer = 0;
    this.pushTime = 0;
    this.air = 0;
    this.aim = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos, pos]),
      new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.frustumCulled = false;
    world.scene.add(this.laser);
  }

  build() {
    const m = buildTurret();
    const c = withClone(m.group, [m.white, m.dark, m.eyeMat, m.glowMat]);
    this.mesh = c.mesh; this.clone = c.clone;
    this.mats = c.mats; this.cloneMats = c.cloneMats;
    this.eyeMat = m.eyeMat;
    this.cloneEye = c.map.get(m.eyeMat);
    this.mat = m.white;
    this.deploy = 0;
    this.eyeState = 1;
  }

  // visual only: shells part while the turret is alert; eye glow by state
  animateModel(dt) {
    const want = !this.tipped && !this.held && this.alert > 0.05 ? 1 : 0;
    this.deploy += Math.sign(want - this.deploy) * Math.min(Math.abs(want - this.deploy), dt * 3.5);
    animateTurret(this.mesh, this.deploy, this.eyeState, this.eyeMat, this.world.time);
    animateTurret(this.clone, this.deploy, this.eyeState, this.cloneEye, this.world.time);
  }

  knock() {
    if (this.tipped || this.dissolving >= 0) return;
    this.tipped = true;
    this.frantic = 1.4;
    this.eyeState = 0;
    this.laser.visible = false;
    this.world.events.emit('turretTip', { pos: this.body.pos });
  }

  push() {}   // turrets don't slide when walked into; they topple (see update)

  onDropped(speed) { if (speed > 250) this.knock(); }

  update(dt) {
    super.update(dt);
    this.animateModel(dt);
    if (this.removed || this.dissolving >= 0) { this.laser.visible = false; return; }
    const b = this.body, w = this.world;
    // walking into a turret shoves it over
    const pb = w.player.body;
    const gapX = Math.abs(pb.pos.x - b.pos.x) - pb.half.x - b.half.x;
    const gapZ = Math.abs(pb.pos.z - b.pos.z) - pb.half.z - b.half.z;
    const toT = new THREE.Vector3(b.pos.x - pb.pos.x, 0, b.pos.z - pb.pos.z).normalize();
    const shoving = !this.held && Math.max(gapX, gapZ) < 3 && Math.abs(pb.pos.y - b.pos.y) < 60 &&
      (w.player.wish ? w.player.wish.dot(toT) > 0.5 : false);
    this.pushTime = shoving ? this.pushTime + dt : Math.max(0, this.pushTime - dt);
    if (this.pushTime > 0.25) this.knock();
    if (!this.held && !b.onGround) this.air += dt;
    else { if (this.air > 0.35 && !this.held) this.knock(); this.air = 0; }
    if (this.tipped) {
      // a toppled turret sprays wildly for a moment before it shuts down
      if (this.frantic > 0) {
        this.frantic -= dt;
        this.shotTimer -= dt;
        if (this.shotTimer <= 0) {
          this.shotTimer = 0.07;
          const eye = b.pos.clone(); eye.y += 4;
          const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.3) * 0.6, Math.random() - 0.5).normalize();
          const hit = traceGrid(w.grid, eye, dir, 900);
          w.spawnTracer(eye, eye.clone().addScaledVector(dir, hit ? hit.t : 900), 0xffd28a);
          w.events.emit('turretShot', { pos: b.pos });
        }
      }
      this.tip = Math.min(1.45, this.tip + dt * 4);
      this.mesh.rotation.x = this.tip;
      this.mesh.position.y = b.pos.y - 18 * this.tip / 1.45;   // lie on the floor
      return;
    }
    // look for the player
    const eye = b.pos.clone(); eye.y += 12;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const pl = w.player;
    const target = pl.body.pos.clone(); target.y += 12;
    const to = target.clone().sub(eye);
    const d = to.length();
    to.divideScalar(d);
    let seen = false;
    if (pl.alive && !this.held && d < TURRET_RANGE && to.dot(fwd) > TURRET_COS) {
      const r = w.traceRay(eye, to, d, { blockers: true, cubes: true, ignoreCube: this });
      seen = r.type === 'none' && r.passes.length === 0;
    }
    if (seen) {
      if (this.alert <= 0) w.events.emit('turretAlert', { pos: b.pos });
      this.alert += dt;
      this.aim.lerp(to, Math.min(1, dt * 8)).normalize();
      if (this.alert > 0.55) {
        this.shotTimer -= dt;
        while (this.shotTimer <= 0) {
          this.shotTimer += 0.1;
          if (Math.random() < 0.6) w.damagePlayer(3);
          const end = target.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30));
          w.spawnTracer(eye.clone().addScaledVector(fwd, 10), end, 0xffd28a);
          w.events.emit('turretShot', { pos: b.pos });
        }
      }
    } else {
      this.alert = Math.max(0, this.alert - dt * 0.6);
      const sweep = Math.sin(w.time * 0.9 + this.yaw) * 0.25;
      this.aim.lerp(new THREE.Vector3(Math.sin(this.yaw + sweep), -0.05, Math.cos(this.yaw + sweep)), Math.min(1, dt * 3)).normalize();
    }
    // laser sight
    this.laser.visible = true;
    const hit = traceGrid(w.grid, eye, this.aim, 3000);
    const end = eye.clone().addScaledVector(this.aim, hit ? hit.t : 3000);
    if (seen && d < (hit ? hit.t : 3000)) end.copy(target);
    const a = this.laser.geometry.attributes.position.array;
    a[0] = eye.x + fwd.x * 9; a[1] = eye.y; a[2] = eye.z + fwd.z * 9;
    a[3] = end.x; a[4] = end.y; a[5] = end.z;
    this.laser.geometry.attributes.position.needsUpdate = true;
    this.eyeState = seen ? 2 : 1;
  }

  dispose() {
    super.dispose();
    this.world.scene.remove(this.laser);
  }
}

// ---------------------------------------------------------------------------
// Moving platform: a solid slab shuttling between two points. With inputs it
// only runs while they are all active (and returns home otherwise). Bodies
// standing on it ride along.
export class Platform {
  constructor(world, d) {
    this.world = world;
    const b = d.box.map(C);
    this.home = b.slice();
    this.offset = new THREE.Vector3(...d.to.map(C));
    this.inputs = d.inputs || [];
    this.once = !!d.once;
    this.delay = d.delay || 0;
    this.speed = C(d.speed || 3) / this.offset.length();
    this.t = 0; this.dir = 1; this.wait = 0;
    this.box = b.slice();
    world.solids.push(this);
    world.shotBlockers.push(this);
    const w = b[3] - b[0], h = b[4] - b[1], dz = b[5] - b[2];
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), phong({ color: 0x55595e, shininess: 40 }));
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 6, 1, dz - 6), phong({ color: 0xd9dcde, shininess: 20 }));
    top.position.y = h / 2 + 0.5;
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0x3aa8ff });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 3, dz + 0.6), this.lightMat);
    edge.position.y = h / 2 - 4;
    g.add(slab, top, edge);
    this.group = noCull(g);
    world.scene.add(g);
    this.place();
  }
  place() {
    const e = this.t * this.t * (3 - 2 * this.t);
    for (let a = 0; a < 3; a++) {
      const o = this.offset.getComponent(a) * e;
      this.box[a] = this.home[a] + o; this.box[a + 3] = this.home[a + 3] + o;
    }
    this.group.position.set((this.box[0] + this.box[3]) / 2, (this.box[1] + this.box[4]) / 2, (this.box[2] + this.box[5]) / 2);
  }
  isSolid() { return true; }
  blocksShot() { return true; }
  update(dt) {
    const active = this.inputs.every((s) => this.world.getSignal(s));
    this.lightMat.color.setHex(active ? 0xffa030 : 0x3aa8ff);
    const prev = this.box.slice();
    if (this.delay > 0) { this.delay -= dt; return; }
    if (this.once) { if (active) this.t = Math.min(1, this.t + this.speed * dt); }
    else if (this.wait > 0) this.wait -= dt;
    else if (active || this.t > 0) {
      const dir = active ? this.dir : -1;
      this.t = Math.min(1, Math.max(0, this.t + dir * this.speed * dt));
      if (active && (this.t === 1 || this.t === 0)) { this.dir = this.t === 1 ? -1 : 1; this.wait = 1.2; }
    }
    this.place();
    const dx = this.box[0] - prev[0], dy = this.box[1] - prev[1], dz = this.box[2] - prev[2];
    if (!dx && !dy && !dz) return;
    // carry riders
    for (const body of this.world.bodies) {
      const p = body.pos, h = body.half;
      const onTop = Math.abs(p.y - h.y - prev[4]) < 3 &&
        p.x + h.x > prev[0] && p.x - h.x < prev[3] && p.z + h.z > prev[2] && p.z - h.z < prev[5];
      if (onTop && !(body.owner && body.owner.held)) { p.x += dx; p.y += dy; p.z += dz; if (body.owner?.prevPos) body.owner.prevPos.add(_tv.set(dx, dy, dz)); }
    }
  }
}

// ---------------------------------------------------------------------------
// Rocket turret: a personality-core head on an arm. It tracks slowly with a
// targeting laser (eye green = idle, yellow = locked, red = firing) and fires
// slow rockets that fly straight, pass through portals and explode on impact.
export class RocketTurret {
  constructor(world, d) {
    this.world = world;
    this.base = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.head = this.base.clone(); this.head.y += 64;
    this.aim = new THREE.Vector3(...(d.face || [0, 0, 1])).normalize();
    this.lock = 0; this.cool = 1.5; this.state = 'idle';
    this.inputs = d.inputs || [];
    const model = buildRocketTurret();
    const g = model.group;
    this.pivot = model.pivot;
    this.eyeMat = model.eyeMat;
    this.eyeGlow = model.glowMat;
    g.position.copy(this.base);
    world.scene.add(noCull(g));
    this.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.head, this.head]),
      new THREE.LineBasicMaterial({ color: 0x5fffd0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.frustumCulled = false;
    world.scene.add(this.laser);
    world.noPortalBoxes.push(boxAround(this.head, 40));
  }
  update(dt) {
    const w = this.world, pl = w.player;
    const active = this.inputs.every((s) => w.getSignal(s));
    const target = pl.body.pos.clone(); target.y += 16;
    const to = target.clone().sub(this.head);
    const d = to.length(); to.divideScalar(d);
    let seen = false;
    if (active && pl.alive) {
      const r = w.traceRay(this.head, to, d, { blockers: true, cubes: true });
      seen = r.type === 'none' && r.passes.length === 0;
    }
    // slow, deliberate tracking
    if (seen) {
      const maxTurn = dt * 1.6;
      const ang = this.aim.angleTo(to);
      this.aim.lerp(to, ang > 1e-4 ? Math.min(1, maxTurn / ang) : 1).normalize();
    }
    this.cool -= dt;
    const onTarget = seen && this.aim.angleTo(to) < 0.06;
    if (onTarget && this.cool <= 0) {
      this.lock += dt;
      if (this.lock > 1.1) {
        this.lock = 0; this.cool = 3.2;
        const muzzle = this.head.clone().addScaledVector(this.aim, 26);
        w.entities.push(new Rocket(w, muzzle, this.aim.clone().multiplyScalar(430)));
        w.events.emit('rocketLaunch', { pos: this.head });
        this.firedAt = w.time;
      }
    } else this.lock = Math.max(0, this.lock - dt * 2);
    const firing = this.firedAt && w.time - this.firedAt < 0.4;
    this.eyeMat.color.setHex(firing ? 0xff3020 : this.lock > 0 ? 0xffd030 : 0x40ff70);
    this.eyeGlow.color.copy(this.eyeMat.color);
    this.eyeMat.color.multiplyScalar(1.8);
    this.pivot.rotation.set(0, Math.atan2(this.aim.x, this.aim.z), 0);
    this.pivot.rotateX(-Math.asin(Math.max(-1, Math.min(1, this.aim.y))));
    // targeting laser
    const hit = traceGrid(w.grid, this.head, this.aim, 4000);
    const end = this.head.clone().addScaledVector(this.aim, hit ? hit.t : 4000);
    const a = this.laser.geometry.attributes.position.array;
    a[0] = this.head.x; a[1] = this.head.y; a[2] = this.head.z; a[3] = end.x; a[4] = end.y; a[5] = end.z;
    this.laser.geometry.attributes.position.needsUpdate = true;
    this.laser.visible = active;
  }
}

let flameTex = null;
export class Rocket {
  constructor(world, pos, vel) {
    this.world = world; this.pos = pos; this.vel = vel; this.age = 0; this.dead = false;
    if (!flameTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,170,60,0.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      flameTex = new THREE.CanvasTexture(c);
    }
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 22, 10), phong({ color: 0xd9dcdf, shininess: 60 }));
    body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 10), phong({ color: 0xc23a2a }));
    nose.rotation.x = Math.PI / 2; nose.position.z = 14;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
    flame.scale.setScalar(22); flame.position.z = -14;
    this.mesh.add(body, nose, flame);
    world.scene.add(noCull(this.mesh));
    this.smokeT = 0;
    this.sync();
  }
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.vel.clone().normalize());
  }
  update(dt) {
    if (this.dead) return;
    const w = this.world;
    this.age += dt;
    if (this.age > 20) return this.explode();
    const steps = Math.ceil(this.vel.length() * dt / 5);
    for (let s = 0; s < steps && !this.dead; s++) {
      const from = this.pos.clone();
      const to = from.clone().addScaledVector(this.vel, dt / steps);
      let ported = false;
      for (const P of w.portalList) {
        if (!P.linked) continue;
        const d0 = P.dist(from), d1 = P.dist(to);
        if (d0 >= 0 && d1 < 0 && P.inOval(from.clone().lerp(to, d0 / (d0 - d1)), 0.95)) {
          to.applyMatrix4(P.toOther); this.vel.applyQuaternion(P.toOtherQuat); ported = true; break;
        }
      }
      if (!ported) {
        if (w.grid.solidAt(to.x, to.y, to.z) && !inPortalHole(w, to)) { this.pos.copy(from); return this.explode(); }
        for (const sld of w.solids) {
          if (!sld.isSolid()) continue;
          const b = sld.box;
          if (to.x > b[0] && to.x < b[3] && to.y > b[1] && to.y < b[4] && to.z > b[2] && to.z < b[5]) { this.pos.copy(from); return this.explode(); }
        }
        for (const body of w.bodies) {
          const p = body.pos, h = body.half;
          if (Math.abs(to.x - p.x) < h.x + 3 && Math.abs(to.y - p.y) < h.y + 3 && Math.abs(to.z - p.z) < h.z + 3) { this.pos.copy(from); return this.explode(); }
        }
        for (const t of w.rocketTargets) {
          if (t.hitTest(to)) { this.pos.copy(from); t.onRocket(this); return this.explode(); }
        }
      }
      this.pos.copy(to);
    }
    this.smokeT -= dt;
    if (this.smokeT <= 0) { this.smokeT = 0.05; w.spawnBurst(this.pos.clone().addScaledVector(this.vel, -0.04), 0x8a8a8a, 3, 25); }
    this.sync();
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    const w = this.world;
    w.scene.remove(this.mesh);
    w.spawnBurst(this.pos, 0xffa040, 70, 320);
    w.spawnBurst(this.pos, 0x666666, 40, 140);
    w.events.emit('explosion', { pos: this.pos.clone() });
    const pb = w.player.body;
    const d = pb.pos.distanceTo(this.pos);
    if (d < 150) {
      w.damagePlayer(Math.round(80 * (1 - d / 150)));
      pb.vel.addScaledVector(pb.pos.clone().sub(this.pos).normalize(), 300 * (1 - d / 150));
    }
    for (const body of w.bodies) if (body.owner?.knock && body.pos.distanceTo(this.pos) < 140) body.owner.knock();
    for (const sld of w.solids) {
      if (!sld.shatter) continue;
      const b = sld.box;
      const cx = Math.max(b[0], Math.min(this.pos.x, b[3])), cy = Math.max(b[1], Math.min(this.pos.y, b[4])), cz = Math.max(b[2], Math.min(this.pos.z, b[5]));
      if (Math.hypot(cx - this.pos.x, cy - this.pos.y, cz - this.pos.z) < 90) sld.shatter();
    }
  }
  dispose() { this.world.scene.remove(this.mesh); }
}

// ---------------------------------------------------------------------------
// Emergency incinerator: a glowing hatch in the wall. Anything dropped into
// it (a cube, a core) is burned.
export class Incinerator {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.dir = new THREE.Vector3(...d.dir).normalize();
    this.signal = d.signal;
    if (this.signal) world.setSignal(this.signal, false);
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(96, 72, 10), phong({ color: 0x3a3d41, shininess: 30 }));
    frame.position.z = 4;
    this.fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.1, 0.25) });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(78, 54), this.fireMat); glow.position.z = 9.6;
    const grill = new THREE.Group();
    for (let i = -3; i <= 3; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 54, 2), phong({ color: 0x1d1f21 })); bar.position.set(i * 11, 0, 10.5); grill.add(bar); }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(100, 6, 36), phong({ color: 0x55595d })); lip.position.set(0, -39, 18);
    g.add(frame, glow, lip);
    g.position.copy(this.pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    world.scene.add(noCull(g));
    world.noPortalBoxes.push(boxAround(this.pos, 70));
    // intake: the volume in front of the hatch
    const c = this.pos.clone().addScaledVector(this.dir, 30);
    this.zone = [c.x - 50, c.y - 60, c.z - 50, c.x + 50, c.y + 40, c.z + 50];
  }
  update() {
    const t = this.world.time;
    this.fireMat.color.setRGB(2.6 + Math.sin(t * 13) * 0.4, 0.9 + Math.sin(t * 7) * 0.2, 0.2);
    const z = this.zone;
    for (const c of this.world.cubes) {
      if (c.held || c.dissolving >= 0 || c.burned) continue;
      const p = c.body.pos;
      if (p.x > z[0] && p.x < z[3] && p.y > z[1] && p.y < z[4] && p.z > z[2] && p.z < z[5]) {
        c.burned = true;
        c.body.vel.copy(this.dir).multiplyScalar(-120);
        c.dissolve();
        this.world.spawnBurst(p, 0xff8a30, 60, 200);
        this.world.events.emit('incinerated', { cube: c });
        if (this.signal) this.world.setSignal(this.signal, true);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Personality core: a carryable sphere that falls off the AI when it is hit.
export class Core extends Cube {
  constructor(world, pos, opts = {}) {
    super(world, pos, { ...opts, half: [15, 15, 15] });
    this.kind = 'core';
    if (opts.eye) for (const m of [this.coreEye, this.cloneMats[2]]) m.color.copy(opts.eye);
    this.tumble = true;
  }
  build() {
    const shell = phong({ color: 0xe6e9eb, shininess: 70 });
    const dark = phong({ color: 0x2a2c2f });
    this.coreEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.2) });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(15, 24, 18), shell));
    const band = new THREE.Mesh(new THREE.TorusGeometry(15.2, 2, 8, 32), dark); g.add(band);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 6, 20, Math.PI), dark); handle.position.y = 14; g.add(handle);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(5, 20), this.coreEye); eye.position.z = 15.1; g.add(eye);
    this.mesh = g;
    this.clone = g.clone(true);
    this.mats = [shell, dark, this.coreEye];
    const map = new Map(this.mats.map((m) => [m, m.clone()]));
    this.clone.traverse((o) => { if (o.material) o.material = map.get(o.material); });
    this.cloneMats = [...map.values()];
    this.mat = shell;
  }
}

// ---------------------------------------------------------------------------
// The facility AI: a huge chassis hanging from the ceiling. Rockets that hit
// it knock a personality core loose; every core must go in the incinerator
// before the neurotoxin timer runs out.
const _hv = new THREE.Vector3();
export class Boss {
  constructor(world, d) {
    this.world = world;
    this.pos = new THREE.Vector3(C(d.at[0]), C(d.at[1]), C(d.at[2]));
    this.cores = d.cores || 3;
    this.burned = 0;
    this.scale = d.scale || 1.5;
    this.radius = 78 * this.scale;
    this.timer = d.timer || 240;
    this.lines = d.lines || {};
    this.out = 0;          // cores knocked loose but not yet burned
    this.hitFlash = 0;
    world.rocketTargets.push(this);
    const g = new THREE.Group();
    const white = phong({ color: 0xe6e8ea, shininess: 75 });
    const dark = phong({ color: 0x24272b, shininess: 40 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.8 });
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    // ceiling socket and a segmented spine curving down to the chassis
    add(new THREE.CylinderGeometry(52, 58, 26, 32), dark, 0, 196, 0);
    add(new THREE.CylinderGeometry(34, 34, 14, 28), metal, 0, 180, 0);
    const spine = new THREE.CatmullRomCurve3([[0, 186, 0], [6, 140, 6], [-8, 96, 0], [0, 62, -4], [6, 34, 0]].map((p) => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(spine, 48, 12, 12), dark);
    for (let t = 0.12; t < 0.9; t += 0.13) {
      const r = add(new THREE.TorusGeometry(16, 4.5, 8, 24), white, ...spine.getPoint(t).toArray());
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spine.getTangent(t));
    }
    // slack service cables
    for (const [x, z, bx, bz] of [[-62, 40, -26, 22], [58, 34, 22, 26], [-40, -58, -18, -30], [50, -46, 26, -18]]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 200, z), new THREE.Vector3(x * 0.9, 110, z * 0.9), new THREE.Vector3(bx, 30, bz)]);
      add(new THREE.TubeGeometry(c, 24, 3.2, 6), dark);
    }
    // the chassis: a white shell with a dark waistband
    const prof = [[0, 44], [24, 41], [42, 28], [50, 8], [47, -12], [36, -30], [18, -40], [0, -42]].map(([r, y]) => new THREE.Vector2(r, y));
    const shell = add(new THREE.LatheGeometry(prof, 36), white, 0, 8, 0); shell.scale.set(1, 1, 0.82);
    const band = add(new THREE.TorusGeometry(50, 3.5, 8, 40), dark, 0, 12, 0); band.rotation.x = Math.PI / 2; band.scale.set(1, 0.82, 1);
    add(new THREE.TorusGeometry(40, 2.5, 8, 36), dark, 0, -20, 0).rotation.x = Math.PI / 2;
    // neck and head, leaning forward (local +x) and down
    const neck = add(new THREE.CylinderGeometry(15, 18, 56, 16), dark, 36, -30, 0); neck.rotation.z = 1.05;
    const head = new THREE.Group(); head.position.set(68, -52, 0); head.rotation.z = -0.32; g.add(head); this.head = head;
    add(new THREE.SphereGeometry(40, 36, 24), white, 0, 0, 0, head).scale.set(1.45, 0.72, 0.82);
    add(new THREE.BoxGeometry(56, 5, 34), white, -8, 26, 0, head).rotation.z = 0.22;          // top fin
    add(new THREE.TorusGeometry(42, 2.2, 6, 36), dark, 0, 0, 0, head).scale.set(1.42, 0.8, 1);  // seam
    const face = add(new THREE.CylinderGeometry(22, 26, 10, 28), dark, 54, -2, 0, head); face.rotation.z = Math.PI / 2;
    const ring = add(new THREE.TorusGeometry(14, 3, 8, 28), metal, 59.5, -2, 0, head); ring.rotation.y = Math.PI / 2;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.3) });
    add(new THREE.CircleGeometry(11, 28), this.eyeMat, 60, -2, 0, head).rotation.y = Math.PI / 2;
    this.eyeLight = new THREE.PointLight(0xffc040, 0.6, 300, 1.5); this.eyeLight.position.set(80, -2, 0); head.add(this.eyeLight);
    // personality cores clamped around the chassis
    this.coreColors = [new THREE.Color(1.4, 0.5, 2.0), new THREE.Color(2.0, 0.9, 0.2), new THREE.Color(0.3, 1.2, 2.0), new THREE.Color(2.0, 0.3, 0.25)];
    this.coreMounts = [];
    const spots = [[-14, -26, 46], [-40, -14, -30], [14, -38, -34], [-46, -10, 18]];
    for (let i = 0; i < this.cores; i++) {
      const dir = new THREE.Vector3(...spots[i % spots.length]).normalize();
      const m = add(new THREE.SphereGeometry(15, 24, 16), phong({ color: 0xd9dcde, shininess: 70 }), ...spots[i % spots.length]);
      const e = add(new THREE.CircleGeometry(5, 20), new THREE.MeshBasicMaterial({ color: this.coreColors[i % 4] }), ...dir.clone().multiplyScalar(15.2).toArray(), m);
      e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      add(new THREE.TorusGeometry(15.4, 1.8, 6, 28), dark, 0, 0, 0, m).quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dir.z, 0, -dir.x).normalize());
      m.userData.eye = this.coreColors[i % 4];
      this.coreMounts.push(m);
    }
    this.yaw = 0;
    g.position.copy(this.pos);
    g.scale.setScalar(this.scale);
    this.group = g;
    world.scene.add(noCull(g));
    world.setSignal('bossDone', false);
    world.events.on('incinerated', (e) => { if (e.cube.kind === 'core') this.coreBurned(); });
    world.timer = this.timer;
  }
  hitTest(p) { return p.distanceTo(this.pos) < this.radius || p.distanceTo(this.head.getWorldPosition(_hv)) < 50 * this.scale; }
  onRocket() {
    const w = this.world;
    this.hitFlash = 1;
    const mount = this.coreMounts.find((m) => m.visible);
    if (!mount) return;
    mount.visible = false;
    const at = mount.getWorldPosition(new THREE.Vector3());
    const core = w.spawnCube(at, { eye: mount.userData.eye }, Core);
    core.body.vel.set((Math.random() - 0.5) * 120, 80, (Math.random() - 0.5) * 120);
    this.out++;
    w.events.emit('coreDrop', { pos: at });
    const lines = this.lines.hit || [];
    if (lines[this.burned + this.out - 1]) w.say(lines[this.burned + this.out - 1]);
  }
  coreBurned() {
    this.out = Math.max(0, this.out - 1);
    this.burned++;
    const w = this.world;
    const lines = this.lines.burn || [];
    if (this.burned >= this.cores) { w.timer = null; w.setSignal('bossDone', true); w.bossDefeated?.(); }
    else if (lines[this.burned - 1]) w.say(lines[this.burned - 1]);
  }
  update(dt) {
    const w = this.world;
    // turn slowly to watch the player, with a restless sway
    const pp = w.player.body.pos;
    const want = Math.atan2(-(pp.z - this.pos.z), pp.x - this.pos.x) + Math.sin(w.time * 0.4) * 0.25;
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 0.9);
    this.group.rotation.y = this.yaw;
    this.eyeLight.intensity = 0.6 + this.hitFlash * 2;
    this.group.position.y = this.pos.y + Math.sin(w.time * 0.9) * 6;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);
    this.eyeMat.color.setRGB(2.2 + this.hitFlash * 3, 1.5 - this.hitFlash, 0.3);
    this.group.position.x = this.pos.x + (Math.random() - 0.5) * this.hitFlash * 8;
  }
}

// ---------------------------------------------------------------------------
// Props for the maintenance areas
export class Pipe {
  constructor(world, d) {
    const a = new THREE.Vector3(C(d.from[0]), C(d.from[1]), C(d.from[2]));
    const b = new THREE.Vector3(C(d.to[0]), C(d.to[1]), C(d.to[2]));
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(d.r || 6, d.r || 6, len, 14), phong({ color: d.color || 0x6c5a48, shininess: 45 }));
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    world.scene.add(noCull(m));
    for (const p of [a, b]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry((d.r || 6) + 3, (d.r || 6) + 3, 4, 14), phong({ color: 0x3a3330 }));
      flange.position.copy(p); flange.quaternion.copy(m.quaternion);
      world.scene.add(noCull(flange));
    }
  }
  update() {}
}

export class Graffiti {
  constructor(world, d) {
    const tex = makeGraffiti(d.lines, d.seed || 1, world.renderer);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(C(d.w || 6), C(d.w || 6) / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const n = new THREE.Vector3(...d.dir);
    m.position.set(C(d.at[0]), C(d.at[1]), C(d.at[2])).addScaledVector(n, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.renderOrder = 3;
    world.scene.add(noCull(m));
  }
  update() {}
}
