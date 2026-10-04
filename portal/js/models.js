import * as THREE from 'three';
import { COLORS } from './constants.js';

// First-person portal device and the third-person test subject that you see
// of yourself through portals. Both are built from primitives.

// physically based stand-in for the old Phong materials: shininess maps to roughness
const phong = (o) => {
  const { shininess = 30, specular, ...rest } = o;
  void specular;
  return new THREE.MeshStandardMaterial({ roughness: Math.max(0.18, Math.min(0.9, 1 - shininess / 110)), metalness: 0.05, ...rest });
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.5, 400);
    this.scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x4a4f55, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 1.1);
    d.position.set(-0.3, 1, 0.6);
    this.scene.add(d);
    this.root = new THREE.Group();
    this.gun = new THREE.Group();
    this.root.add(this.gun);
    this.scene.add(this.root);

    const white = phong({ color: 0xeeeeee, shininess: 70, specular: 0x666666 });
    const black = phong({ color: 0x1c1e20, shininess: 40, specular: 0x333333 });
    const grey = phong({ color: 0x8e9499, shininess: 50 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: COLORS.blue });
    this.glassMat = new THREE.MeshPhongMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.35, shininess: 120, depthWrite: false });

    const zCyl = (rt, rb, h, mat, z, seg = 28) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      m.rotation.x = -Math.PI / 2; m.position.z = z;
      return m;
    };
    // rear shell
    const shell = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 20), white);
    shell.scale.set(1, 0.96, 1.9); shell.position.z = 6;
    const seam = zCyl(5.05, 5.05, 0.5, black, 2.6);
    // black waist, white cowl, black nozzle
    const waist = zCyl(4.3, 4.7, 5, black, -1.8);
    const cowl = zCyl(3.0, 4.3, 5, white, -6.2);
    const nozzle = zCyl(2.2, 3.0, 3, black, -9.6);
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), this.coreMat);
    emitter.position.z = -11.2;
    this.emitter = emitter;
    // glass tube with the coloured core on top
    const tube = zCyl(1.35, 1.35, 9, this.glassMat, -0.5, 16);
    tube.position.y = 5.2;
    const tubeCore = zCyl(0.6, 0.6, 8.4, this.coreMat, -0.5, 12);
    tubeCore.position.y = 5.2;
    const tubeCapA = zCyl(1.6, 1.6, 1, black, 4.2, 16); tubeCapA.position.y = 5.2;
    const tubeCapB = zCyl(1.6, 1.6, 1, black, -5.2, 16); tubeCapB.position.y = 5.2;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3.6), black);
    grip.position.set(0, -6, 4); grip.rotation.x = 0.3;
    // three claws around the nozzle
    this.prongs = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      p.rotation.z = (i / 3) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.position.set(0, 3.6, -7.5);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 8), black);
      arm.position.z = -3.6;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.6), grey);
      tip.position.set(0, -0.7, -7.6);
      hinge.add(arm, tip);
      hinge.rotation.x = 0.12;
      p.add(hinge);
      this.prongs.push(hinge);
      this.gun.add(p);
    }
    this.gun.add(shell, seam, waist, cowl, nozzle, emitter, tube, tubeCore, tubeCapA, tubeCapB, grip);
    this.gun.scale.setScalar(0.62);

    this.light = new THREE.PointLight(COLORS.blue, 40, 40, 2);
    this.light.position.set(0, 0, -14);
    this.gun.add(this.light);

    this.basePos = new THREE.Vector3(7.2, -7.4, -16);
    this.root.position.copy(this.basePos);
    this.gun.rotation.set(0.04, 0.1, 0);
    this.bob = 0;
    this.sway = new THREE.Vector2();
    this.recoil = 0;
    this.holdBlend = 0;
    this.color = 'blue';
    this.visible = true;
    this.fizzleFlash = 0;
  }

  setColor(c) {
    this.color = c;
    const hex = COLORS[c];
    this.coreMat.color.setHex(hex);
    this.light.color.setHex(hex);
  }

  fire(color) { this.setColor(color); this.recoil = 1; }

  update(dt, speed, onGround, lookDX, lookDY, holding, time) {
    this.root.visible = this.visible;
    if (onGround) this.bob += dt * Math.min(speed, 260) * 0.055;
    const amp = onGround ? Math.min(1, speed / 175) : 0;
    this.sway.x += (-lookDX * 40 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (lookDY * 40 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-2.5, 2.5);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.holdBlend += ((holding ? 1 : 0) - this.holdBlend) * Math.min(1, dt * 8);
    const r = this.recoil;
    this.root.position.set(
      this.basePos.x + Math.sin(this.bob) * 0.6 * amp + this.sway.x * 0.4,
      this.basePos.y - Math.abs(Math.cos(this.bob)) * 0.5 * amp + this.sway.y * 0.4 - this.holdBlend * 1.2,
      this.basePos.z + r * 3,
    );
    this.root.rotation.set(r * 0.12 + this.holdBlend * 0.08, this.sway.x * 0.01, -this.holdBlend * 0.1);
    for (const p of this.prongs) {
      const target = holding ? 0.32 + Math.sin(time * 18) * 0.05 : 0.12 + r * 0.25;
      p.rotation.x += (target - p.rotation.x) * Math.min(1, dt * 10);
    }
    const pulse = 0.85 + Math.sin(time * 6) * 0.15 + r * 0.6;
    this.light.intensity = 40 * pulse;
    this.emitter.scale.setScalar(1 + r * 0.5 + (holding ? Math.sin(time * 30) * 0.1 : 0));
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
