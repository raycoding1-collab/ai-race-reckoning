import * as THREE from 'three';
import { CELL, GRAVITY, CUBE, PELLET, PORTAL, PLAYER } from './constants.js';
import { Body, moveBody, groundBelow, computeHoles } from './physics.js';
import { traceGrid } from './level.js';
import { makeSignTexture } from './textures.js';

const C = (v) => v * CELL;
const lambert = (o) => new THREE.MeshLambertMaterial(o);
const phong = (o) => new THREE.MeshPhongMaterial(o);

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
let cubeGeo = null;
export class Cube {
  constructor(world, pos, opts = {}) {
    this.world = world;
    this.kind = 'cube';
    this.body = new Body('cube', CUBE.half, CUBE.half, CUBE.half);
    this.body.owner = this;
    this.body.pos.copy(pos);
    this.yaw = opts.yaw || 0;
    this.dispenser = opts.dispenser || null;
    this.held = false;
    this.dissolving = -1;
    if (!cubeGeo) {
      cubeGeo = new THREE.BoxGeometry(CUBE.half * 2, CUBE.half * 2, CUBE.half * 2);
    }
    this.mat = phong({ map: world.textures.cube, shininess: 30, specular: 0x333333 });
    this.cloneMat = this.mat.clone();
    this.mesh = new THREE.Mesh(cubeGeo, this.mat);
    this.clone = new THREE.Mesh(cubeGeo, this.cloneMat);
    this.clone.visible = false;
    // little glowing edge so it reads at a distance
    noCull(this.mesh); noCull(this.clone);
    world.scene.add(this.mesh, this.clone);
    this.shadow = new BlobShadow(world.scene, 70);
    world.bodies.push(this.body);
    this.planeA = new THREE.Plane(); this.planeB = new THREE.Plane();
    this.impactCooldown = 0;
  }

  push(dir, speed) {
    if (this.held || !this.body.onGround) return;
    const v = this.body.vel;
    const cur = v.x * dir.x + v.z * dir.z;
    const target = speed * 0.7;
    if (cur < target) { v.x += dir.x * (target - cur); v.z += dir.z * (target - cur); }
  }

  update(dt) {
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
    this.impactCooldown -= dt;
    if (b.hits.length && this.impactCooldown <= 0) {
      const sp = Math.max(...b.hits.map((h) => h.speed));
      if (sp > 160 && pre > 160) { this.world.events.emit('impact', { pos: b.pos, speed: sp }); this.impactCooldown = 0.15; }
    }
    this.sync();
  }

  onTeleported(P) {
    // rotate the yaw through the portal (cube stays upright)
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).applyQuaternion(P.toOtherQuat);
    if (Math.hypot(f.x, f.z) > 0.1) this.yaw = Math.atan2(f.x, f.z);
  }

  sync() {
    const b = this.body;
    this.mesh.position.copy(b.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
    // render a clipped copy on the far side while passing through a portal
    const P = b.holes.find((p) => p.linked && Math.abs(p.dist(b.pos)) < CUBE.half * 1.8);
    if (P && this.dissolving < 0) {
      this.planeA.setFromNormalAndCoplanarPoint(P.normal, P.pos);
      this.planeB.setFromNormalAndCoplanarPoint(P.other.normal, P.other.pos);
      this.mat.clippingPlanes = [this.planeA];
      this.cloneMat.clippingPlanes = [this.planeB];
      this.clone.visible = true;
      const m = new THREE.Matrix4().compose(b.pos, new THREE.Quaternion().setFromEuler(this.mesh.rotation), new THREE.Vector3(1, 1, 1));
      m.premultiply(P.toOther);
      m.decompose(this.clone.position, this.clone.quaternion, this.clone.scale);
    } else {
      if (this.mat.clippingPlanes && this.mat.clippingPlanes.length) this.mat.clippingPlanes = [];
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
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(46, 50, 7, 40), phong({ color: 0x9aa0a4, shininess: 40 }));
    base.position.y = 3.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 2.2, 8, 40), new THREE.MeshBasicMaterial({ color: 0x3aa8ff }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 7.2;
    this.ringMat = ring.material;
    this.pad = new THREE.Mesh(new THREE.CylinderGeometry(36, 37, 6, 40), phong({ color: 0xc7262b, shininess: 60, specular: 0x552222 }));
    this.pad.position.y = 9;
    g.add(base, ring, this.pad);
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
      if (Math.abs(b.pos.x - p.x) < 38 + b.half.x * 0.5 && Math.abs(b.pos.z - p.z) < 38 + b.half.z * 0.5) down = true;
    }
    if (down !== this.pressed) {
      this.pressed = down;
      this.world.setSignal(this.signal, down);
      this.world.events.emit(down ? 'buttonDown' : 'buttonUp', { pos: p });
    }
    this.depress += ((down ? 1 : 0) - this.depress) * Math.min(1, dt * 14);
    this.pad.position.y = 9 - this.depress * 4.5;
    this.ringMat.color.setHex(down ? 0xffa030 : 0x3aa8ff);
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
    const g = new THREE.Group();
    const panelMat = phong({ color: 0xdfe3e6, shininess: 20 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x2a2d30 });
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0x3aa8ff });
    this.left = new THREE.Group(); this.right = new THREE.Group();
    for (const [side, grp] of [[-1, this.left], [1, this.right]]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(this.w / 2, this.h, 8), panelMat);
      panel.position.x = side * this.w / 4;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(6, this.h * 0.9, 8.6), stripeMat);
      stripe.position.x = side * 6;
      const light = new THREE.Mesh(new THREE.BoxGeometry(3, this.h * 0.6, 8.8), this.lightMat);
      light.position.x = side * 14;
      grp.add(panel, stripe, light);
      grp.position.y = this.h / 2;
      g.add(grp);
    }
    // frame
    const frameMat = phong({ color: 0x55595d, shininess: 30 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(this.w + 16, 10, 14), frameMat);
    top.position.y = this.h + 1;
    const l = new THREE.Mesh(new THREE.BoxGeometry(8, this.h, 14), frameMat); l.position.set(-this.w / 2 - 2, this.h / 2, 0);
    const r = l.clone(); r.position.x = this.w / 2 + 2;
    g.add(top, l, r);
    g.position.copy(this.pos);
    if (this.axis === 0) g.rotation.y = Math.PI / 2;
    world.scene.add(noCull(g));
    this.group = g;
    const pad = 12;
    world.noPortalBoxes.push([this.box[0] - pad, this.box[1] - pad, this.box[2] - pad, this.box[3] + pad, this.box[4] + pad, this.box[5] + pad]);
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
    const e = this.open * this.open * (3 - 2 * this.open);
    this.left.position.x = -e * this.w / 2;
    this.right.position.x = e * this.w / 2;
    this.solidState = this.open < 0.6;
    this.lightMat.color.setHex(want ? 0xffa030 : 0x3aa8ff);
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
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main(){
          vec2 p = vUv * uSize / 8.0;
          float lines = 0.0;
          for (int i=0;i<3;i++){
            float fi=float(i);
            float y = p.y * (0.6 + fi*0.3) + uTime * (1.5 + fi) + sin(p.x*0.7 + uTime*2.0 + fi)*0.6;
            lines += smoothstep(0.92, 1.0, fract(y)) * (0.4 + 0.3*fi);
          }
          float sparkle = step(0.995, h(floor(p*2.0) + floor(uTime*12.0)));
          float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(0.0, 0.04, 1.0-vUv.x);
          vec3 col = vec3(0.35, 0.65, 1.0) * (0.10 + lines * 0.6) + vec3(0.8,0.9,1.0)*sparkle;
          gl_FragColor = vec4(col * edge, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    plane.renderOrder = 6;
    const g = new THREE.Group();
    g.add(plane);
    // emitter strips on both sides
    const emMat = phong({ color: 0x3c4044 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x8cc8ff });
    for (const s of [-1, 1]) {
      const em = new THREE.Mesh(new THREE.BoxGeometry(8, h, 10), emMat);
      em.position.x = s * (w / 2 - 2);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(2, h * 0.96, 11), glow);
      gl.position.x = s * (w / 2 - 6);
      g.add(em, gl);
    }
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
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        void main(){
          vec2 p = vW.xz / 90.0;
          float a = n(p + vec2(uTime*0.15, uTime*0.07)) * 0.6 + n(p*2.3 - vec2(uTime*0.11, -uTime*0.13)) * 0.4;
          float spec = pow(smoothstep(0.55, 0.95, a), 3.0);
          vec3 col = mix(vec3(0.16,0.12,0.05), vec3(0.32,0.27,0.10), a) + vec3(0.6,0.55,0.35)*spec*0.5;
          gl_FragColor = vec4(col, 1.0);
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
    if (d < 44 && b.pos.y - b.half.y < this.pos.y + 20 && b.pos.y > this.pos.y) this.world.completeLevel();
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
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 40, 32, 1, true), phong({ color: 0xd8dcdf, side: THREE.DoubleSide }));
    tube.position.y = 20;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 4, 8, 32), phong({ color: 0x4a4e52 }));
    ring.rotation.x = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(33, 33, 60, 32, 1, true),
      new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.y = -30;
    g.add(tube, ring, glass);
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
    this.apex = C(d.apex);
    this.cool = 0;
    this.flip = 0;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(76, 6, 76), phong({ color: 0x3e4246 }));
    base.position.y = 3;
    this.plate = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(64, 4, 64), phong({ color: 0xe2e5e7 }));
    const arrowCanvas = document.createElement('canvas'); arrowCanvas.width = arrowCanvas.height = 128;
    const ac = arrowCanvas.getContext('2d');
    ac.fillStyle = '#e2e5e7'; ac.fillRect(0, 0, 128, 128);
    ac.fillStyle = '#ff9a2e';
    ac.beginPath(); ac.moveTo(64, 14); ac.lineTo(104, 62); ac.lineTo(78, 62); ac.lineTo(78, 112); ac.lineTo(50, 112); ac.lineTo(50, 62); ac.lineTo(24, 62); ac.closePath(); ac.fill();
    const at = new THREE.CanvasTexture(arrowCanvas); at.colorSpace = THREE.SRGBColorSpace;
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({ map: at }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.y = 2.1;
    const dir = new THREE.Vector3().subVectors(this.target, this.pos); dir.y = 0;
    arrow.rotation.z = Math.atan2(-dir.x, -dir.z);
    top.add(arrow);
    top.position.set(0, 0, 32);
    this.plate.add(top);
    this.plate.position.set(0, 8, -32);
    const holder = new THREE.Group();
    holder.add(this.plate);
    holder.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    g.add(base, holder);
    g.position.copy(this.pos);
    world.scene.add(noCull(g));
    world.noPortalBoxes.push([this.pos.x - 48, this.pos.y - 2, this.pos.z - 48, this.pos.x + 48, this.pos.y + 12, this.pos.z + 48]);
  }
  launchVelocity(from) {
    const g = GRAVITY;
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
    this.stopSignal = d.stopSignal;
    world.scene.add(noCull(wallDevice(this.pos, this.dir, 0xffd27a, (m) => { this.coreMat = m; })));
    world.noPortalBoxes.push(boxAround(this.pos, 52));
  }
  update(dt) {
    if (this.stopSignal && this.world.getSignal(this.stopSignal)) { this.coreMat.color.setHex(0x444444); return; }
    if (this.pellet && !this.pellet.dead) return;
    this.timer -= dt;
    this.coreMat.color.setHSL(0.11, 1, 0.5 + 0.3 * Math.sin(this.world.time * 10));
    if (this.timer <= 0) {
      this.pellet = new Pellet(this.world, this.pos.clone().addScaledVector(this.dir, 22), this.dir.clone().multiplyScalar(PELLET.speed));
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
    world.scene.add(noCull(wallDevice(this.pos, this.dir, 0x3a3e42, (m) => { this.coreMat = m; }, true)));
    world.noPortalBoxes.push(boxAround(this.pos, 52));
    world.receptacles.push(this);
  }
  capture() {
    this.active = true;
    this.coreMat.color.setHex(0xffc65a);
    this.world.setSignal(this.signal, true);
    this.world.events.emit('receptacle', { pos: this.pos });
  }
  update() {}
}

function boxAround(p, r) { return [p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r]; }

function wallDevice(pos, dir, coreColor, setCore, catcher = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(56, 56, 16), phong({ color: 0xcfd3d6, shininess: 30 }));
  body.position.z = 8;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(20, 4, 10, 32), phong({ color: 0x2f3236 }));
  rim.position.z = 17;
  const coreMat = new THREE.MeshBasicMaterial({ color: coreColor });
  setCore(coreMat);
  const core = new THREE.Mesh(catcher ? new THREE.CircleGeometry(17, 32) : new THREE.SphereGeometry(10, 16, 12), coreMat);
  core.position.z = catcher ? 16.5 : 14;
  g.add(body, rim, core);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  return g;
}

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
          if (to.x > b[0] && to.x < b[3] && to.y > b[1] && to.y < b[4] && to.z > b[2] && to.z < b[5]) this.reflectFromBox(from, b, to);
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
    for (let a = 0; a < 3; a++) {
      const f = from.getComponent(a);
      if (f <= b[a] || f >= b[a + 3]) {
        this.vel.setComponent(a, -this.vel.getComponent(a));
        to.setComponent(a, f);
      }
    }
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
    const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.18, shininess: 100, depthWrite: false }));
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    m.renderOrder = 7;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x8a9298 }));
    m.add(edges);
    world.scene.add(noCull(m));
  }
  isSolid() { return true; }
  blocksShot() { return true; }
  update() {}
}

// ---------------------------------------------------------------------------
// Chamber sign (number, title, hazard icons)
export class Sign {
  constructor(world, d) {
    const tex = makeSignTexture(d.number, d.title, d.icons || [], world.renderer);
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
    const positions = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      const n = Math.max(1, Math.floor(len / 20));
      for (let k = 0; k < n; k++) positions.push(a.clone().lerp(b, k / n));
    }
    positions.push(pts[pts.length - 1]);
    const geo = new THREE.BoxGeometry(5, 0.6, 5);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x3aa8ff });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => { m.makeTranslation(p.x, p.y + 0.4, p.z); this.mesh.setMatrixAt(i, m); });
    this.mesh.frustumCulled = false;
    world.scene.add(this.mesh);
  }
  update() {
    this.mat.color.setHex(this.world.getSignal(this.signal) ? 0xffa030 : 0x3aa8ff);
  }
}

export const PLAYER_DIMS = PLAYER;
export { computeHoles };
