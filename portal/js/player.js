import * as THREE from 'three';
import { PLAYER, GRAVITY } from './constants.js';
import { Body, moveBody, groundBelow, overlapsAnything } from './physics.js';

// First-person controller that follows Source's CGameMovement: ground
// friction with stopspeed, sv_accelerate ground acceleration, air
// acceleration with the 30u/s wishspeed cap (which is what makes air
// strafing and fling steering feel right), jump-on-press and duck/crouch-jump.

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _wish = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const IDENT = new THREE.Quaternion();

export class Player {
  constructor(world) {
    this.world = world;
    this.body = new Body('player', PLAYER.halfWidth, PLAYER.height / 2, PLAYER.halfWidth);
    this.body.owner = this;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = new THREE.Quaternion();     // residual roll after going through a portal
    this.ducked = false;
    this.eyeOffset = PLAYER.eyeHeight - PLAYER.height / 2;
    this.jumpHeld = false;
    this.stepDist = 0;
    this.airTime = 0;
    this.prevPos = new THREE.Vector3();
    this.alive = true;
    this.body.onTeleport = (P) => this.onTeleport(P);
  }

  spawn(pos, yaw) {
    this.body.pos.copy(pos);
    this.body.pos.y += PLAYER.height / 2 + 0.05;
    this.body.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.roll.identity();
    this.body.half.y = PLAYER.height / 2;
    this.ducked = false;
    this.eyeOffset = PLAYER.eyeHeight - PLAYER.height / 2;
    this.prevPos.copy(this.body.pos);
    this.alive = true;
  }

  viewQuat(out = new THREE.Quaternion()) {
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    out.setFromEuler(_e);
    return out.premultiply(this.roll);
  }

  eyePos(out = new THREE.Vector3(), alpha = 1) {
    out.lerpVectors(this.prevPos, this.body.pos, alpha);
    out.y += this.eyeOffset;
    return out;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.viewQuat(_q));
  }

  onTeleport(P) {
    // rotate the full view orientation through the portal, then split it back
    // into yaw/pitch plus a roll that is smoothed away over a few frames
    const q = this.viewQuat(new THREE.Quaternion());
    q.premultiply(P.toOtherQuat);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    if (Math.abs(f.y) > 0.999) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      this.yaw = Math.atan2(f.y > 0 ? up.x : -up.x, f.y > 0 ? up.z : -up.z);
    } else {
      this.yaw = Math.atan2(-f.x, -f.z);
    }
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    const upright = new THREE.Quaternion().setFromEuler(_e);
    this.roll.copy(q).multiply(upright.invert());
    this.prevPos.copy(this.body.pos);
  }

  setDuck(d, force = false) {
    if (d === this.ducked && !force) return true;
    const b = this.body;
    const H = PLAYER.height, DH = PLAYER.duckHeight;
    if (d) {
      const onGround = this.body.onGround;
      b.half.y = DH / 2;
      // on the ground the feet stay put; in the air the head stays put (crouch-jump)
      b.pos.y += onGround ? -(H - DH) / 2 : (H - DH) / 2;
      this.ducked = true;
      if (!onGround && overlapsAnything(this.world, b)) b.pos.y -= (H - DH);
      if (!onGround) this.eyeOffset -= (H - DH) / 2; // keep eye steady
      else this.eyeOffset += (H - DH) / 2;
      return true;
    }
    // unduck needs room
    const half = new THREE.Vector3(b.half.x, H / 2, b.half.z);
    const onGround = this.body.onGround;
    const tryPos = b.pos.clone();
    tryPos.y += onGround ? (H - DH) / 2 : -(H - DH) / 2;
    if (overlapsAnything(this.world, b, tryPos, half)) {
      const alt = b.pos.clone(); alt.y += (H - DH) / 2;
      if (overlapsAnything(this.world, b, alt, half)) { if (!force) return false; }
      else tryPos.copy(alt);
    }
    const dy = tryPos.y - b.pos.y;
    b.pos.copy(tryPos);
    b.half.y = H / 2;
    this.ducked = false;
    this.eyeOffset -= dy;
    this.prevPos.y += dy;
    return true;
  }

  update(dt, input) {
    const b = this.body;
    const w = this.world;
    this.prevPos.copy(b.pos);

    // --- categorize position ---
    const g = groundBelow(w, b, 2);
    const wasOnGround = b.onGround;
    b.onGround = !!g && b.vel.y <= PLAYER.groundLaunchSpeed && w.time - b.lastTeleport > 0.05;
    if (b.onGround) {
      b.groundEnt = g.ent;
      const target = g.top + b.half.y + 0.01;
      if (b.pos.y > target) b.pos.y = target;   // snap down onto the ground
      if (b.vel.y < 0) b.vel.y = 0;
    }

    // --- duck ---
    if (input.duck && !this.ducked) this.setDuck(true);
    else if (!input.duck && this.ducked) this.setDuck(false);
    const targetEye = (this.ducked ? PLAYER.duckEyeHeight - PLAYER.duckHeight / 2 : PLAYER.eyeHeight - PLAYER.height / 2);
    this.eyeOffset += (targetEye - this.eyeOffset) * Math.min(1, dt / PLAYER.duckTime * 4);

    // --- wish direction from view yaw ---
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.set(0, 0, 0).addScaledVector(_f, input.forward).addScaledVector(_r, input.side);
    let wishspeed = _wish.length();
    if (wishspeed > 0) _wish.divideScalar(wishspeed);
    wishspeed = Math.min(1, wishspeed) * PLAYER.maxSpeed * (this.ducked && b.onGround ? PLAYER.duckSpeedScale : 1);

    // --- jump (requires a fresh press, like HL2/Portal) ---
    let jumped = false;
    if (input.jump && !this.jumpHeld && b.onGround) {
      b.vel.y = PLAYER.jumpSpeed;
      b.onGround = false;
      jumped = true;
      w.events.emit('jump', {});
    }
    this.jumpHeld = input.jump;

    if (b.onGround) {
      friction(b.vel, dt);
      accelerate(b.vel, _wish, wishspeed, PLAYER.accelerate, dt);
      b.vel.y = 0;
    } else {
      airAccelerate(b.vel, _wish, wishspeed, PLAYER.airAccelerate, dt);
      b.vel.y -= GRAVITY * dt;
    }

    // let the player slip into a floor portal they are standing mostly over
    for (const P of b.holes) {
      if (!P.linked || P.normal.y < 0.5) continue;
      if (b.pos.y - b.half.y - P.plane > 3) continue;
      const pc = [P.pos.x, P.pos.y, P.pos.z];
      const pp = [b.pos.x, b.pos.y, b.pos.z];
      const hh = [b.half.x, b.half.y, b.half.z];
      let inside = true;
      for (const ax of [P.uAxis, P.vAxis]) if (Math.abs(pp[ax] - pc[ax]) > P.ext[ax]) inside = false;
      if (!inside) continue;
      for (const ax of [P.uAxis, P.vAxis]) {
        const lim = P.ext[ax] - hh[ax] - 0.5;
        const d = pp[ax] - pc[ax];
        if (Math.abs(d) > lim) {
          const push = -Math.sign(d) * Math.min(Math.abs(d) - lim, 120 * dt);
          if (ax === 0) b.pos.x += push; else b.pos.z += push;
        }
      }
    }

    const preVel = b.vel.clone();
    moveBody(w, b, dt);

    // landing / footsteps
    if (b.blockedDown && !wasOnGround && !jumped && this.airTime > 0.15) {
      w.events.emit('land', { speed: -preVel.y });
    }
    this.airTime = b.onGround || b.blockedDown ? 0 : this.airTime + dt;
    if (b.onGround) {
      this.stepDist += Math.hypot(b.vel.x, b.vel.z) * dt;
      if (this.stepDist > 72) { this.stepDist = 0; w.events.emit('footstep', {}); }
    }

    // nudge cubes we walk into
    for (const h of b.hits) {
      if (h.axis !== 1 && h.ent && h.ent.isBody && h.ent.owner && h.ent.owner.push) {
        h.ent.owner.push(_wish, wishspeed);
      }
    }

    // smooth away roll left over from portal transitions
    this.roll.slerp(IDENT, 1 - Math.exp(-dt * 7));
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(-1.553, Math.min(1.553, this.pitch - dy));
  }
}

function friction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.1) { vel.x = 0; vel.z = 0; return; }
  const control = Math.max(speed, PLAYER.stopSpeed);
  const drop = control * PLAYER.friction * dt;
  const ns = Math.max(0, speed - drop) / speed;
  vel.x *= ns; vel.z *= ns;
}

function accelerate(vel, wishdir, wishspeed, accel, dt) {
  const cur = vel.x * wishdir.x + vel.z * wishdir.z;
  const add = wishspeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishspeed, add);
  vel.x += a * wishdir.x; vel.z += a * wishdir.z;
}

function airAccelerate(vel, wishdir, wishspeed, accel, dt) {
  const wishspd = Math.min(wishspeed, PLAYER.airWishCap);
  const cur = vel.x * wishdir.x + vel.z * wishdir.z;
  const add = wishspd - cur;
  if (add <= 0) return;
  const a = Math.min(accel * wishspeed * dt, add);
  vel.x += a * wishdir.x; vel.z += a * wishdir.z;
}

