import * as THREE from 'three';
import { CELL, CUBE, PORTAL, PLAYER, COLORS } from './constants.js';
import { buildWorldMeshes, traceGrid, PORTALABLE } from './level.js';
import { Portal, pairPortals, fitPortal, portalUpFor } from './portal.js';
import { PortalRenderer, PortalVisual, dotTexture } from './render.js';
import { Player } from './player.js';
import { createTextures } from './textures.js';
import { ViewModel, PlayerModel } from './models.js';
import { LEVELS } from './levels.js';
import { Voice } from './voice.js';
import { PostFX, QUALITY } from './post.js';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';
import {
  Cube, FloorButton, Door, Fizzler, Goo, Exit, Dispenser, FaithPlate,
  PelletLauncher, Receptacle, Glass, Sign, Wire, BlobShadow, Turret, Platform,
  RocketTurret, Incinerator, Boss, Pipe, Graffiti,
} from './entities.js';

class Emitter {
  constructor() { this.h = new Map(); }
  on(n, f) { if (!this.h.has(n)) this.h.set(n, []); this.h.get(n).push(f); }
  emit(n, d) { const l = this.h.get(n); if (l) for (const f of l) f(d); }
}

const C = (v) => v * CELL;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _feet = new THREE.Vector3();
export const NO_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e7);   // keeps everything

function rayBox(o, d, b) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-9) { if (oa < b[a] || oa > b[a + 3]) return null; continue; }
    let t1 = (b[a] - oa) / da, t2 = (b[a + 3] - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export class Game {
  constructor(renderer, audio, hud) {
    this.renderer = renderer;
    this.audio = audio;
    this.hud = hud;
    this.textures = createTextures(renderer);
    this.events = new Emitter();
    this.portals = { blue: new Portal('blue'), orange: new Portal('orange') };
    pairPortals(this.portals.blue, this.portals.orange);
    this.portalList = [this.portals.blue, this.portals.orange];
    this.portalRenderer = new PortalRenderer(renderer);
    this.viewModel = new ViewModel();
    this.camera = new THREE.PerspectiveCamera(75, 1, 1, 24000);
    this.camera.layers.set(0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.quality = QUALITY.high;
    this.settings = { fov: 75, sensitivity: 1, invertY: false, volume: 0.7, depth: 5, showFps: false };
    this.levelIndex = 0;
    this.time = 0;
    this.player = null;
    this.held = null;
    this.fireCooldown = 0;
    this.scene = null;
    this.bursts = [];
    this.voice = new Voice(audio);
    hud.onClear = () => this.voice.stop();
    this.wireAudio();
  }

  wireAudio() {
    const a = this.audio, ev = this.events;
    const near = (p, r = 1600) => !p || !this.player || p.distanceTo(this.player.body.pos) < r;
    ev.on('teleport', (e) => { if (e.body.kind === 'player') a.portalEnter(); });
    ev.on('jump', () => a.jump());
    ev.on('land', (e) => a.land(e.speed));
    ev.on('footstep', () => a.footstep());
    ev.on('buttonDown', () => a.buttonDown());
    ev.on('buttonUp', () => a.buttonUp());
    ev.on('doorOpen', (e) => near(e.pos) && a.door(true));
    ev.on('doorClose', (e) => near(e.pos) && a.door(false));
    ev.on('fizzle', (e) => { a.fizzle(); this.spawnBurst(e.pos, 0x9fd4ff, 40); });
    ev.on('impact', (e) => near(e.pos, 1000) && a.impact(e.speed));
    ev.on('pelletLaunch', (e) => near(e.pos) && a.pelletLaunch());
    ev.on('pelletBounce', (e) => near(e.pos, 900) && a.pelletBounce());
    ev.on('pelletExplode', () => a.pelletExplode());
    ev.on('receptacle', () => a.receptacle());
    ev.on('faith', () => a.faith());
    ev.on('turretShot', (e) => near(e.pos, 2200) && a.turretShot());
    ev.on('turretAlert', (e) => near(e.pos, 2200) && a.turretAlert());
    ev.on('turretTip', (e) => near(e.pos, 2200) && a.turretTip());
    ev.on('rocketLaunch', (e) => near(e.pos, 2600) && a.rocketLaunch());
    ev.on('explosion', (e) => { a.explosion(Math.max(0.25, 1 - e.pos.distanceTo(this.player.body.pos) / 2400)); this.shake = Math.max(this.shake || 0, 1 - e.pos.distanceTo(this.player.body.pos) / 700); });
    ev.on('coreDrop', () => a.coreDrop());
    ev.on('incinerated', () => a.incinerate());
    ev.on('glassBreak', () => a.glassBreak());
  }

  // ------------------------------------------------------------------
  setSignal(n, v) { this.signals.set(n, v); }
  getSignal(n) { return !!this.signals.get(n); }

  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((o) => {
      if (o.geometry && o.userData.world) o.geometry.dispose();
    });
    this.audio.stopHold();
  }

  loadLevel(index) {
    this.disposeScene();
    this.levelIndex = index;
    const def = LEVELS[index];
    const L = def.build();
    this.def = def;
    this.audio.setMood?.(def.music || 'test');
    this.grid = L.grid;
    this.time = 0;
    this.signals = new Map();
    this.bodies = [];
    this.solids = [];
    this.shotBlockers = [];
    this.noPortalBoxes = [];
    this.receptacles = [];
    this.rocketTargets = [];
    this.timer = null;
    this.ending = false;
    this.entities = [];
    this.cubes = [];
    this.bursts = [];
    this.held = null;
    this.completing = false;
    this.gun = def.gun;
    this.lastLevel = LEVELS.length - 1;

    const scene = this.scene = new THREE.Scene();
    const pbr = this.quality.pbr;
    scene.add(new THREE.HemisphereLight(0xf0f5ff, 0x55595f, pbr ? 0.32 : 2.4));
    const sun = new THREE.DirectionalLight(0xfff8f0, pbr ? 0.4 : 1.6);
    if (pbr) { scene.environment = this.envMap(); scene.environmentIntensity = 0.42; }
    sun.position.set(0.35, 1, 0.25);
    scene.add(sun);
    this.worldMeshes = buildWorldMeshes(this.grid, this.textures, L.lights || [], pbr);
    for (const m of this.worldMeshes) scene.add(m);

    // portals
    for (const P of this.portalList) { P.placed = false; P.fixed = false; P.version++; }
    this.visuals = new Map();
    for (const P of this.portalList) this.visuals.set(P, new PortalVisual(P, scene));
    for (const fp of L.fixedPortals || []) {
      const P = this.portals[fp.color];
      P.set(new THREE.Vector3(C(fp.at[0]), C(fp.at[1]), C(fp.at[2])), new THREE.Vector3(...fp.normal), new THREE.Vector3(...fp.up), -10);
      P.fixed = true;
    }

    // player
    this.player = new Player(this);
    this.player.spawn(new THREE.Vector3(C(L.start.at[0]), C(L.start.at[1]), C(L.start.at[2])), L.start.yaw);
    this.bodies.push(this.player.body);
    this.playerModel = new PlayerModel();
    scene.add(this.playerModel.group);
    scene.add(this.playerModel.makeClone());
    this.playerModel.clone.visible = false;
    this.pmMats = [], this.pmCloneMats = [];
    this.playerModel.group.traverse((o) => { if (o.material) this.pmMats.push(o.material); });
    this.playerModel.clone.traverse((o) => { if (o.material) this.pmCloneMats.push(o.material); });
    this.playerShadow = new BlobShadow(scene, 56);
    this.pmPlaneA = NO_CLIP.clone(); this.pmPlaneB = NO_CLIP.clone();
    for (const m of this.pmMats) m.clippingPlanes = [this.pmPlaneA];
    for (const m of this.pmCloneMats) m.clippingPlanes = [this.pmPlaneB];

    // entities
    for (const e of L.entities) this.spawnEntity(e);
    this.lines = (L.lines || []).slice();
    const bossLines = L.entities.flatMap((e) => (e.lines ? [...(e.lines.hit || []), ...(e.lines.burn || [])] : []));
    this.voice.preload([...this.lines.map((l) => this.wordsFor(l[1])), ...(L.triggers || []).map((t) => this.wordsFor(t.say)), ...bossLines, ...(L.finale ? [L.finale] : [])]);
    this.triggers = (L.triggers || []).map((t) => ({ ...t, done: false }));
    this.viewModel.visible = this.gun !== 'none';
    this.viewModel.setColor('blue');
    this.hud.setGun(this.gun);
    this.hud.chamber(index, def.title);
    this.hud.clearSay();
    this.updateCrosshair();
    this.precompile();
    this.onLevelLoaded?.(index);
  }

  precompile() {
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const dummy = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
      new THREE.PointsMaterial({ size: 4, map: dotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(dummy, line);
    this.camera.updateMatrixWorld();
    try {
      // with and without the stencil test, as the portal passes use both
      this.portalRenderer.setSceneStencil(this.scene, 0);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.viewModel.scene, this.viewModel.camera);
    } catch { /* compile is only an optimisation */ }
    this.scene.remove(dummy, line);
    for (const o of hidden) o.visible = false;
  }

  spawnEntity(e) {
    const map = {
      cube: () => this.spawnCube(new THREE.Vector3(C(e.at[0]), C(e.at[1]), C(e.at[2])), { companion: e.companion }),
      rocket: () => new RocketTurret(this, e),
      incinerator: () => new Incinerator(this, e),
      boss: () => new Boss(this, e),
      pipe: () => new Pipe(this, e),
      graffiti: () => new Graffiti(this, e),
      turret: () => this.spawnCube(new THREE.Vector3(C(e.at[0]), C(e.at[1]) + 30.05, C(e.at[2])), { yaw: e.yaw || 0 }, Turret),
      button: () => new FloorButton(this, e),
      door: () => new Door(this, e),
      fizzler: () => new Fizzler(this, e),
      goo: () => new Goo(this, e),
      exit: () => new Exit(this, e),
      dispenser: () => new Dispenser(this, e),
      plate: () => new FaithPlate(this, e),
      launcher: () => new PelletLauncher(this, e),
      receptacle: () => new Receptacle(this, e),
      glass: () => new Glass(this, e),
      sign: () => new Sign(this, e),
      wire: () => new Wire(this, e),
      platform: () => new Platform(this, e),
    };
    const ent = map[e.type]();
    if (e.type !== 'cube' && e.type !== 'turret') this.entities.push(ent);
    return ent;
  }

  spawnCube(pos, opts = {}, Kind = Cube) {
    const c = new Kind(this, pos, opts);
    c.body.onTeleport = (P) => c.onTeleported(P);
    this.cubes.push(c);
    c.sync();
    return c;
  }

  removeCube(c) {
    c.removed = true;
    if (this.held === c) this.dropCube();
    c.dispose();
    const i = this.cubes.indexOf(c);
    if (i >= 0) this.cubes.splice(i, 1);
  }

  spawnBurst(pos, color, n = 24, speed = 140) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random())));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: 4, map: dotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.bursts.push({ pts, v, age: 0, life: 0.7 });
  }

  spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.bursts.push({ line, age: 0, life: 0.14 });
  }

  // ------------------------------------------------------------------
  traceRay(origin, dir, maxDist, opts = {}) {
    const o = origin.clone(), d = dir.clone().normalize();
    let remaining = maxDist, total = 0;
    const passes = [];
    for (let pass = 0; pass < 6; pass++) {
      const g = traceGrid(this.grid, o, d, remaining);
      let best = { t: g ? g.t : Infinity, type: g ? 'grid' : null, g };
      if (opts.blockers) {
        for (const b of this.shotBlockers) {
          if (!b.blocksShot()) continue;
          const t = rayBox(o, d, b.box);
          if (t !== null && t < best.t) best = { t, type: 'blocker', ent: b };
        }
      }
      if (opts.cubes) {
        for (const c of this.cubes) {
          if (c === opts.ignoreCube || c.dissolving >= 0) continue;
          const p = c.body.pos, h = c.body.half;
          const t = rayBox(o, d, [p.x - h.x, p.y - h.y, p.z - h.z, p.x + h.x, p.y + h.y, p.z + h.z]);
          if (t !== null && t < best.t) best = { t, type: 'cube', ent: c };
        }
      }
      let portalHit = null;
      for (const P of this.portalList) {
        if (!P.linked) continue;
        const dn = d.dot(P.normal);
        if (dn >= -1e-6) continue;
        const t = -P.dist(o) / dn;
        if (t < 0 || t > remaining || t > best.t + 0.75) continue;
        _v.copy(o).addScaledVector(d, t);
        if (!P.inOval(_v)) continue;
        if (!portalHit || t < portalHit.t) portalHit = { t, P };
      }
      if (portalHit && (best.type !== 'cube' || portalHit.t < best.t)) {
        const P = portalHit.P;
        o.addScaledVector(d, portalHit.t).applyMatrix4(P.toOther);
        d.applyQuaternion(P.toOtherQuat);
        o.addScaledVector(d, 0.05);
        remaining -= portalHit.t; total += portalHit.t;
        passes.push(P);
        continue;
      }
      if (!best.type || best.t > remaining) {
        return { type: 'none', point: o.clone().addScaledVector(d, remaining), dir: d, origin: o, passes, total: total + remaining };
      }
      return {
        type: best.type, t: best.t, ent: best.ent, g: best.g,
        point: o.clone().addScaledVector(d, best.t), dir: d, origin: o, passes, total: total + best.t,
      };
    }
    return { type: 'none', point: o.clone(), dir: d, origin: o, passes, total };
  }

  // Camera pose. When the eye has crossed a portal plane that the body has
  // not (e.g. head-first through a ceiling portal), view through the portal,
  // the way the original renders the player's view mid-transition.
  viewPose(alpha = 1, pos = new THREE.Vector3(), quat = new THREE.Quaternion()) {
    const p = this.player;
    p.eyePos(pos, alpha);
    p.viewQuat(quat);
    for (const P of p.body.holes) {
      if (!P.linked || P.dist(pos) >= 0 || P.dist(pos) < -PORTAL.holeDepth) continue;
      if (!P.inRect(pos, -8, -8)) continue;
      pos.applyMatrix4(P.toOther);
      quat.premultiply(P.toOtherQuat);
      break;
    }
    return { pos, quat };
  }

  eye(out = new THREE.Vector3()) { return this.viewPose(1, out).pos; }
  aim() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.viewPose(1).quat); }

  firePortal(color) {
    if (!this.player.alive) return;
    // a click during the refire delay is remembered and fires as soon as it can
    if (this.fireCooldown > 0) { if (this.fireCooldown < 0.3) this.queuedShot = color; return; }
    if (this.gun === 'none' || (this.gun === 'blue' && color !== 'blue')) return;
    if (this.held) { this.dropCube(); this.fireCooldown = 0.25; return; }
    this.fireCooldown = 0.33;
    this.queuedShot = null;
    const P = this.portals[color];
    const { pos: eye, quat: q } = this.viewPose(1);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const r = this.traceRay(eye, fwd, PORTAL.shotRange, { blockers: true, cubes: true });
    this.viewModel.fire(color);
    this.playerModel.gunCore.color.setHex(COLORS[color]);
    this.audio.shoot(color);
    const muzzle = new THREE.Vector3(9, -8, -26).applyQuaternion(q).add(eye);
    this.spawnTracer(muzzle, r.passes.length ? eye.clone().addScaledVector(fwd, 400) : r.point, COLORS[color + 'Glow']);
    let ok = false;
    if (r.type === 'grid' && PORTALABLE.has(r.g.mat) && !P.fixed) {
      const n = new THREE.Vector3(...r.g.normal);
      const up = portalUpFor(n, r.dir);
      const fit = fitPortal(this, r.point, n, up, P);
      if (fit) {
        if (P.placed) this.spawnBurst(P.pos.clone().addScaledVector(P.normal, 4), COLORS[color + 'Glow'], 30, 120);
        P.set(fit.pos, fit.normal, fit.up, this.time);
        this.audio.portalOpen(color);
        ok = true;
      }
    }
    if (!ok) {
      this.audio.portalFail();
      if (r.type !== 'none') this.spawnBurst(r.point.clone().addScaledVector(r.dir, -2), COLORS[color + 'Glow'], 18, 90);
    }
    this.updateCrosshair();
  }

  fizzlePortals(fromGrid) {
    let any = false;
    for (const P of this.portalList) if (P.placed && !P.fixed) { P.clear(); any = true; }
    if (any) this.audio.portalsReset();
    if (fromGrid && this.held) this.held.dissolve();
    this.updateCrosshair();
  }

  updateCrosshair() {
    this.hud.crosshair(this.portals.blue.placed, this.portals.orange.placed, this.gun);
  }

  use() {
    if (!this.player.alive) return;
    if (this.held) { this.dropCube(); return; }
    const eye = this.eye(), fwd = this.aim();
    const r = this.traceRay(eye, fwd, PLAYER.useDistance, { blockers: true, cubes: true });
    let cube = r.type === 'cube' ? r.ent : null;
    if (!cube) {
      // a little forgiveness, like the original's use cone
      let best = 36;
      for (const c of this.cubes) {
        if (c.dissolving >= 0) continue;
        const to = _v.subVectors(c.body.pos, eye);
        const along = to.dot(fwd);
        if (along < 0 || along > PLAYER.useDistance + 20) continue;
        const off = _v2.copy(fwd).multiplyScalar(along).sub(to).length();
        if (off < best) { best = off; cube = c; }
      }
    }
    if (cube && this.player.body.groundEnt !== cube.body) this.pickUp(cube);
    else this.audio.portalFail();
  }

  pickUp(c) {
    this.held = c;
    c.held = true;
    c.body.ignore = this.player.body;
    this.player.body.ignore = c.body;
    c.holdYaw = c.yaw - this.player.yaw;
    this.heldFar = 0;
    this.audio.pickup();
  }

  dropCube() {
    const c = this.held;
    if (!c) return;
    c.held = false;
    c.body.ignore = null;
    this.player.body.ignore = null;
    // you can nudge a cube, but not really throw it
    const pv = this.player.body.vel;
    const rel = c.body.vel.clone().sub(pv);
    if (rel.length() > 260) rel.setLength(260);
    c.body.vel.copy(pv).add(rel);
    c.onDropped?.(rel.length());
    this.held = null;
    this.audio.drop();
  }

  updateHeld(dt) {
    const c = this.held;
    if (!c) return;
    if (c.dissolving >= 0 || c.removed) { this.dropCube(); return; }
    if (this.player.body.groundEnt === c.body && this.player.body.onGround) { this.dropCube(); return; }
    const eye = this.eye(), fwd = this.aim();
    const reach = CUBE.holdDistance + CUBE.half;
    const r = this.traceRay(eye, fwd, reach, { blockers: true });
    const target = r.type === 'none' ? r.point : r.point.clone().addScaledVector(r.dir, -CUBE.half * 1.25);
    let yaw = this.player.yaw + c.holdYaw;
    for (const P of r.passes) yaw = rotateYaw(yaw, P.toOtherQuat);
    // pick the target that is nearest to the cube, possibly via a portal
    let best = target.clone(), bestD = target.distanceTo(c.body.pos), bestYaw = yaw;
    for (const P of this.portalList) {
      if (!P.linked) continue;
      const t2 = target.clone().applyMatrix4(P.toOther);
      const d2 = t2.distanceTo(c.body.pos);
      if (d2 < bestD) { best = t2; bestD = d2; bestYaw = rotateYaw(yaw, P.toOtherQuat); }
    }
    const to = best.sub(c.body.pos);
    const v = to.multiplyScalar(16);
    if (v.length() > CUBE.holdMaxSpeed) v.setLength(CUBE.holdMaxSpeed);
    c.body.vel.copy(v);
    let dy = bestYaw - c.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * Math.min(1, dt * 12);
    if (bestD > CUBE.dropDistance) { this.heldFar += dt; if (this.heldFar > 0.25) this.dropCube(); }
    else this.heldFar = 0;
  }

  damagePlayer(n) {
    const p = this.player;
    if (!p.alive || this.completing) return;
    p.health -= n;
    p.lastHurt = this.time;
    if (p.health <= 0) this.killPlayer();
  }

  // Final chamber cleared: the facility comes apart, then the credits.
  bossDefeated() {
    if (this.ending) return;
    this.ending = true;
    this.say(this.def.finale || 'Shutdown sequence initiated.');
    this.audio.explosion(1);
    this.shake = 1.5;
    setTimeout(() => {
      this.hud.ending();
      this.audio.setMood?.('test');
      this.audio.complete();
      this.onComplete?.(this.levelIndex);
      setTimeout(() => { this.hud.death(false); this.loadLevel(Math.min(this.levelIndex + 1, LEVELS.length - 1)); }, 14000);
    }, 4500);
  }

  killPlayer() {
    if (!this.player.alive || this.completing) return;
    this.player.alive = false;
    this.deathTime = this.time;
    if (this.held) this.dropCube();
    this.audio.death();
    this.hud.death(true);
  }

  completeLevel() {
    if (this.completing || !this.player.alive) return;
    this.completing = true;
    this.completeTime = this.time;
    this.audio.complete();
    this.hud.complete(this.levelIndex, this.def.title);
    this.onComplete?.(this.levelIndex);
  }

  restart() { this.hud.death(false); this.loadLevel(this.levelIndex); }

  // ------------------------------------------------------------------
  update(dt, input) {
    this.time += dt;
    this.fireCooldown -= dt;
    const p = this.player;

    if (p.alive && !this.completing) {
      if (this.queuedShot && this.fireCooldown <= 0) this.firePortal(this.queuedShot);
      if (input.fire1) this.firePortal('blue');
      if (input.fire2) this.firePortal('orange');
      if (input.use) this.use();
      p.update(dt, input);
    } else if (!p.alive) {
      p.update(dt, { forward: 0, side: 0, jump: false, duck: false });
      if (this.time - this.deathTime > 2.2) { this.restart(); return; }
    } else {
      p.update(dt, { forward: 0, side: 0, jump: false, duck: false });
      if (this.time - this.completeTime > 2.4) {
        const next = this.levelIndex + 1;
        if (next < LEVELS.length) this.loadLevel(next);
        else { this.completing = false; this.hud.finished(); this.onFinished?.(); }
        return;
      }
    }
    input.fire1 = input.fire2 = input.use = false;
    if (p.alive && this.time - p.lastHurt > 1.2) p.health = Math.min(100, p.health + 45 * dt);
    this.hud.hurt(p.alive ? 1 - p.health / 100 : 0);

    this.updateHeld(dt);
    for (const c of this.cubes.slice()) c.update(dt);
    for (const e of this.entities) e.update(dt);
    this.entities = this.entities.filter((e) => !e.dead);

    // fell out of the world
    if (p.body.pos.y < -400) this.killPlayer();

    // neurotoxin countdown in the final chamber
    if (this.timer !== null && p.alive && !this.completing) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.killPlayer(); }
    }
    this.hud.timer(this.timer !== null && p.alive ? this.timer : null);
    for (const c of this.cubes) if (c.body.pos.y < -400 && c.dissolving < 0) c.dissolve();

    // announcer
    while (this.lines.length && this.time >= this.lines[0][0]) this.say(this.lines.shift()[1]);
    for (const t of this.triggers) {
      if (t.done) continue;
      const b = t.cells || (t.cells = t.box.map(C)), q = p.body.pos;
      if (q.x > b[0] && q.x < b[3] && q.y > b[1] && q.y < b[4] && q.z > b[2] && q.z < b[5]) { t.done = true; this.say(t.say); }
    }
  }

  // front ends may reword lines (the touch edition does)
  wordsFor(text) { return this.reword ? this.reword(text) : text; }

  say(text) {
    text = this.wordsFor(text);
    this.audio.chime();
    const v = this.voice;
    if (v && this.settings.voice !== false) {
      v.volume = Math.min(1, this.settings.volume * 1.3);
      // voice only, unless subtitles are switched on in Settings
      this.hud.say(text, { speak: (t, done) => v.say(t, done), silent: !this.settings.subtitles });
    } else {
      this.hud.say(text, { blip: () => this.audio.voiceBlip() });
    }
  }

  // ------------------------------------------------------------------
  updateVisuals(frameDt, alpha) {
    const p = this.player, b = p.body;
    for (const vis of this.visuals.values()) vis.update(this.time, frameDt);
    for (const br of this.bursts) {
      br.age += frameDt;
      if (br.pts) {
        const pos = br.pts.geometry.attributes.position.array;
        br.v.forEach((v, i) => {
          v.y -= 200 * frameDt;
          pos[i * 3] += v.x * frameDt; pos[i * 3 + 1] += v.y * frameDt; pos[i * 3 + 2] += v.z * frameDt;
        });
        br.pts.geometry.attributes.position.needsUpdate = true;
        br.pts.material.opacity = Math.max(0, 1 - br.age / br.life);
      }
      if (br.line) br.line.material.opacity = Math.max(0, 1 - br.age / br.life);
      if (br.age > br.life) { this.scene.remove(br.pts || br.line); (br.pts || br.line).geometry.dispose(); }
    }
    this.bursts = this.bursts.filter((br) => br.age <= br.life);

    // third-person body, seen through portals
    const speed = Math.hypot(b.vel.x, b.vel.z);
    const feet = _feet.lerpVectors(p.prevPos, b.pos, alpha);
    const feetY = feet.y - b.half.y;
    this.playerModel.update(frameDt, feet, feetY, p.yaw, p.pitch, speed, b.onGround, this.viewModel.color);
    const scaleY = p.ducked ? 0.62 : 1;
    this.playerModel.group.scale.set(1, scaleY, 1);
    const P = b.holes.find((h) => h.linked && Math.abs(h.dist(b.pos)) < 40);
    if (P) {
      this.pmPlaneA.setFromNormalAndCoplanarPoint(P.normal, P.pos);
      this.pmPlaneB.setFromNormalAndCoplanarPoint(P.other.normal, P.other.pos);
      this.playerModel.group.updateMatrix();
      const M = this.playerModel.group.matrix.clone().premultiply(P.toOther);
      M.decompose(this.playerModel.clone.position, this.playerModel.clone.quaternion, this.playerModel.clone.scale);
      this.playerModel.clone.visible = true;
      this.playerModel.clone.userData.active = true;
      this.playerModel.clone.updateMatrixWorld();
      this.clipActive = true;
    } else {
      if (this.clipActive) {
        this.pmPlaneA.copy(NO_CLIP); this.pmPlaneB.copy(NO_CLIP);
        this.clipActive = false;
      }
      this.playerModel.clone.visible = false;
      this.playerModel.clone.userData.active = false;
    }
    this.playerModel.clone.children.forEach((c, i) => {
      c.rotation.copy(this.playerModel.group.children[i].rotation);
      c.position.copy(this.playerModel.group.children[i].position);
    });
    this.playerShadow.update(this, feet, feetY);
    this.playerShadow.mesh.visible = this.playerShadow.mesh.visible && p.alive;
  }

  render(frameDt, alpha, look) {
    const p = this.player;
    this.updateVisuals(frameDt, alpha);
    const cam = this.camera;
    this.viewPose(alpha, cam.position, cam.quaternion);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - frameDt * 1.6);
      const k = this.shake * this.shake * 6;
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k;
    }
    if (!p.alive) {
      const k = Math.min(1, (this.time - this.deathTime) / 0.8);
      cam.position.y -= k * 40;
      cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, k * 1.2)));
    }
    cam.updateMatrixWorld();
    this.portalRenderer.maxDepth = this.settings.depth;
    const r = this.renderer;
    const draw = () => {
      this.portalRenderer.render(this, this.scene, cam, this.visuals);
      // first-person device on top
      if (this.viewModel.visible && p.alive) {
        r.setScissorTest(false);
        r.state.buffers.depth.setMask(true);
        r.clearDepth();
        r.render(this.viewModel.scene, this.viewModel.camera);
      }
    };
    if (this.viewModel.visible && p.alive) {
      const speed = Math.hypot(p.body.vel.x, p.body.vel.z);
      this.viewModel.update(frameDt, speed, p.body.onGround, look.dx, look.dy, !!this.held, this.time);
    }
    if (this.post) this.post.render(draw, this.time);
    else { r.setRenderTarget(null); draw(); }
  }

  envMap() {
    if (!this._env) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this._env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    return this._env;
  }

  // 'high' | 'medium' | 'low' (see post.js)
  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    const changedPbr = this.quality && q.pbr !== this.quality.pbr;
    this.qualityName = name;
    this.quality = q;
    this.post?.dispose();
    this.post = q.post ? new PostFX(this.renderer, q) : null;
    this.viewModel.scene.environment = q.pbr ? this.envMap() : null;
    if (this.size) this.resize(this.size[0], this.size[1]);
    if (changedPbr && this.scene) this.loadLevel(this.levelIndex);
  }

  // Called before each (possibly virtual) view is drawn: hide the portal we
  // are looking out of, and any copy of the player's body that sits on the
  // camera itself.
  onBeforeView(cam, level, skip) {
    _v.setFromMatrixPosition(cam.matrixWorld);
    for (const [P, vis] of this.visuals) {
      vis.group.visible = (P.placed || vis.closing > 0) && P !== skip;
      vis.points.visible = _v.distanceTo(P.pos) > 70;   // sparks right on the lens look like blobs
    }
    const pm = this.playerModel;
    _v2.copy(pm.group.position); _v2.y += 60 * pm.group.scale.y;
    pm.group.visible = level > 0 && _v.distanceTo(_v2) > 40;
    if (pm.clone.userData.active) pm.clone.visible = _v.distanceTo(_v2.set(0, 60, 0).applyMatrix4(pm.clone.matrixWorld)) > 40;
  }

  resize(w, h) {
    this.size = [w, h];
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.viewModel.resize(w / h, 54);
  }
}

function rotateYaw(yaw, q) {
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).applyQuaternion(q);
  if (Math.hypot(f.x, f.z) < 0.1) return yaw;
  return Math.atan2(f.x, f.z);
}
