import * as THREE from 'three';

// The ride between chambers: a glass elevator tube climbing a dark service
// shaft, light rings and girders sliding past, like the transitions in both
// games. It is its own small scene; the player can look around while riding.

const SHAFT_R = 230, BAND = 420;

export class Elevator {
  constructor(textures) {
    this.active = false;
    this.t = 0;
    this.y = 0;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x05070a);
    s.fog = new THREE.FogExp2(0x0c141b, 0.0009);
    s.add(new THREE.HemisphereLight(0x9fb4c8, 0x101214, 0.35));

    const white = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.5, metalness: 0.3 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xdfefff, emissiveIntensity: 3.0 });

    // --- the car (stays at the origin; the shaft moves)
    const car = this.car = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(52, 56, 10, 48), dark); floor.position.y = -5;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(54, 3, 8, 64), white); rim.rotation.x = Math.PI / 2;
    const plate = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6 }));
    plate.rotation.x = -Math.PI / 2; plate.position.y = 0.3;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(56, 52, 14, 48, 1, true), white); top.position.y = 160;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(56, 48), dark); cap.rotation.x = Math.PI / 2; cap.position.y = 167;
    const ringLight = new THREE.Mesh(new THREE.TorusGeometry(40, 2.2, 8, 64), glow); ringLight.rotation.x = Math.PI / 2; ringLight.position.y = 152;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 150, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xbfe0e8, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = 78;
    car.add(floor, rim, plate, top, cap, ringLight, glass);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(3, 152, 3), white);
      strut.position.set(Math.cos(a) * 53, 78, Math.sin(a) * 53); strut.rotation.y = -a;
      car.add(strut);
    }
    const lamp = new THREE.PointLight(0xe6f2ff, 3500, 0, 2); lamp.position.y = 140;
    car.add(lamp);
    s.add(car);

    // --- the shaft: a dark lined tube with repeating light rings and girders
    const shaft = this.shaft = new THREE.Group();
    const winTex = (textures.whiteWall || textures.light).clone();
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.repeat.set(1.4, 0.8); winTex.needsUpdate = true;
    const winMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xbfd8e6, emissiveIntensity: 1.1, emissiveMap: winTex });
    const amber = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 3 });
    const wallTex = (textures.metalWall || textures.concWall).clone();
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(10, 6); wallTex.needsUpdate = true;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, BAND * 6, 40, 1, true),
      new THREE.MeshStandardMaterial({ map: wallTex, color: 0x8a96a0, roughness: 0.6, side: THREE.BackSide }));
    shaft.add(wall);
    this.bands = [];
    for (let k = 0; k < 6; k++) {
      const band = new THREE.Group();
      band.position.y = (k - 3) * BAND;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(SHAFT_R - 6, 4, 6, 80), glow); ring.rotation.x = Math.PI / 2;
      band.add(ring);
      // girders cross the shaft but stop short of the car
      for (let j = 0; j < 4; j++) {
        const girder = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_R - 80, 14, 18).translate((SHAFT_R + 80) / 2, 0, 0), dark);
        girder.position.y = -60 - (j >> 1) * 26;
        girder.rotation.y = k * 0.7 + (j >> 1) * Math.PI / 2 + (j & 1) * Math.PI;
        band.add(girder);
      }
      // lit observation windows into other test chambers
      for (let w = 0; w < 2; w++) {
        const a = k * 2.1 + w * 2.6;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(170, 96), winMat);
        win.position.set(Math.cos(a) * (SHAFT_R - 3), 150 + w * 40, Math.sin(a) * (SHAFT_R - 3));
        win.lookAt(0, win.position.y, 0);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(184, 110, 6), dark);
        frame.position.copy(win.position).multiplyScalar(1.012); frame.lookAt(0, win.position.y, 0);
        band.add(frame, win);
      }
      // small status lamps
      for (let m = 0; m < 6; m++) {
        const a = m * 1.05 + k;
        const lampM = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), m % 3 ? glow : amber);
        lampM.position.set(Math.cos(a) * (SHAFT_R - 4), -20 + (m % 2) * 30, Math.sin(a) * (SHAFT_R - 4));
        band.add(lampM);
      }
      shaft.add(band);
      this.bands.push(band);
    }
    // guide rails and cable bundles running the full height
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(6, BAND * 6, 6), white);
      rail.position.set(Math.cos(a) * 84, 0, Math.sin(a) * 84); rail.rotation.y = -a;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, BAND * 6, 10), dark);
      cable.position.set(Math.cos(a + 0.5) * (SHAFT_R - 20), 0, Math.sin(a + 0.5) * (SHAFT_R - 20));
      s.add(rail, cable);
    }
    // the passing ring lights: three lamps spaced around the ring
    this.bandLights = [0, 1, 2].map((i) => {
      const l = new THREE.PointLight(0xdfefff, 11000, 0, 2);
      l.userData.a = i * 2.094;
      s.add(l);
      return l;
    });
    s.add(shaft);
  }

  start() { this.active = true; this.t = 0; this.y = 0; }
  stop() { this.active = false; }

  update(dt) {
    this.t += dt;
    // ease in, cruise, ease out
    const v = 260 * Math.min(1, this.t / 1.2) * Math.min(1, Math.max(0, (6.2 - this.t) / 1.2));
    this.y += v * dt;
    for (const b of this.bands) {
      let y = b.userData.base ?? (b.userData.base = b.position.y);
      y = ((y - this.y) % (BAND * 6) + BAND * 6) % (BAND * 6) - BAND * 3;
      b.position.y = y;
    }
    // the nearest ring lights the car as it passes
    let near = this.bands[0];
    for (const b of this.bands) if (Math.abs(b.position.y - 80) < Math.abs(near.position.y - 80)) near = b;
    for (const l of this.bandLights) l.position.set(Math.cos(l.userData.a) * (SHAFT_R - 30), near.position.y, Math.sin(l.userData.a) * (SHAFT_R - 30));
    this.car.position.y = Math.sin(this.t * 7) * 0.4 * Math.min(1, v / 200);     // a little rattle
  }

  render(renderer, camera, player, eyeHeight) {
    camera.position.set(0, this.car.position.y + eyeHeight, 0);
    camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
    camera.updateMatrixWorld();
    renderer.clear(true, true, true);
    renderer.render(this.scene, camera);
  }
}
