import * as THREE from 'three';
import { PLAYER, GRAVITY } from './constants.js';
import { Body, groundBelow, overlapsAnything, stepMove, funnel } from './physics.js';

// First-person controller that follows Source's CGameMovement as Portal used
// it: ground friction with stopspeed, sv_accelerate ground acceleration, air
// acceleration with the 30u/s wishspeed cap (which is what makes air strafing
// and fling steering feel right), 18-unit steps, a 21-unit jump on a fresh
// press with HL2's forward speed bonus, timed ducking and crouch-jumping,
// landing view punch and time-based footsteps. See docs/FIDELITY.md.

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _wish = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _look = new THREE.Vector3(), _eye = new THREE.Vector3(), _half = new THREE.Vector3(), _try = new THREE.Vector3();
const IDENT = new THREE.Quaternion();
const DEG = Math.PI / 180;
const spline = (t) => t * t * (3 - 2 * t);    // SimpleSpline, used for the duck view transition

export class Player {
  constructor(world) {
    this.world = world;
    this.body = new Body('player', PLAYER.halfWidth, PLAYER.height / 2, PLAYER.halfWidth);
    this.body.owner = this;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = new THREE.Quaternion();     // residual roll after going through a portal
    this.ducked = false;                    // the hull is the crouched one
    this.duckFrac = 0;                      // view transition, 0 standing .. 1 crouched
    this.eyeOffset = PLAYER.eyeHeight - PLAYER.height / 2;
    this.jumpHeld = false;
    this.stepTime = 0;
    this.airTime = 0;
    this.fallSpeed = 0;
    this.airSuppress = 0;                   // seconds without air control (after a catapult)
    this.punch = new THREE.Vector3();       // view punch (pitch, yaw, roll) in degrees
    this.punchVel = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.alive = true;
    this.health = 100;
    this.lastHurt = -10;
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
    this.duckFrac = 0;
    this.eyeOffset = PLAYER.eyeHeight - PLAYER.height / 2;
    this.punch.set(0, 0, 0); this.punchVel.set(0, 0, 0);
    this.prevPos.copy(this.body.pos);
    this.alive = true;
  }

  viewQuat(out = new THREE.Quaternion()) {
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    out.setFromEuler(_e);
    return out.premultiply(this.roll);
  }

  // The view punch moves only the camera, never the aim: Source adds
  // m_vecPunchAngle to the view, while the portal gun fires along EyeAngles.
  punchQuat(out = new THREE.Quaternion()) {
    _e.set(-this.punch.x * DEG, this.punch.y * DEG, -this.punch.z * DEG, 'YXZ');
    return out.setFromEuler(_e);
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

  // Swap between the standing and crouched hull. On the ground the feet stay
  // put; in the air the head stays put, which is what makes crouch-jumping
  // lift the feet. The camera height follows duckFrac, so it doesn't jump.
  setDuck(d, force = false) {
    if (d === this.ducked && !force) return true;
    const b = this.body;
    const H = PLAYER.height, DH = PLAYER.duckHeight;
    const onGround = b.onGround;
    const y0 = b.pos.y;
    if (d) {
      b.half.y = DH / 2;
      b.pos.y += onGround ? -(H - DH) / 2 : (H - DH) / 2;
      this.ducked = true;
      if (!onGround && overlapsAnything(this.world, b)) b.pos.y -= (H - DH);
    } else {
      // standing up needs room
      _half.set(b.half.x, H / 2, b.half.z);
      _try.copy(b.pos);
      _try.y += onGround ? (H - DH) / 2 : -(H - DH) / 2;
      if (overlapsAnything(this.world, b, _try, _half)) {
        _try.copy(b.pos); _try.y += (H - DH) / 2;
        if (overlapsAnything(this.world, b, _try, _half) && !force) return false;
      }
      b.pos.copy(_try);
      b.half.y = H / 2;
      this.ducked = false;
    }
    this.prevPos.y += b.pos.y - y0;
    this.updateEye();
    return true;
  }

  canUnduck() {
    const b = this.body, H = PLAYER.height, DH = PLAYER.duckHeight;
    _half.set(b.half.x, H / 2, b.half.z);
    _try.copy(b.pos); _try.y += (H - DH) / 2;
    return !overlapsAnything(this.world, b, _try, _half);
  }

  updateEye() {
    const k = spline(Math.max(0, Math.min(1, this.duckFrac)));
    const aboveFeet = PLAYER.eyeHeight + (PLAYER.duckEyeHeight - PLAYER.eyeHeight) * k;
    this.eyeOffset = aboveFeet - this.body.half.y;
  }

  // Source's Duck(): crouching on the ground takes TIME_TO_DUCK and the hull
  // only shrinks at the end of it; standing up takes TIME_TO_UNDUCK and needs
  // headroom. In the air both happen at once.
  updateDuck(dt, want) {
    const b = this.body;
    if (want) {
      if (this.ducked) this.duckFrac = 1;
      else if (!b.onGround) { this.duckFrac = 1; this.setDuck(true); }
      else {
        this.duckFrac = Math.min(1, this.duckFrac + dt / PLAYER.duckTime);
        if (this.duckFrac >= 1) this.setDuck(true);
      }
    } else if (this.ducked) {
      if (!b.onGround) { if (this.setDuck(false)) this.duckFrac = 0; }
      else if (!this.canUnduck()) this.duckFrac = 1;
      else {
        this.duckFrac = Math.max(0, this.duckFrac - dt / PLAYER.unduckTime);
        if (this.duckFrac <= 0 && !this.setDuck(false)) this.duckFrac = 1;
      }
    } else {
      this.duckFrac = Math.max(0, this.duckFrac - dt / PLAYER.unduckTime);
    }
    this.updateEye();
  }

  // damped spring back to zero (DecayPunchAngle: damping 9, spring 65)
  decayPunch(dt) {
    const p = this.punch, v = this.punchVel;
    if (p.lengthSq() < 0.001 && v.lengthSq() < 0.001) { p.set(0, 0, 0); v.set(0, 0, 0); return; }
    p.addScaledVector(v, dt);
    v.multiplyScalar(Math.max(0, 1 - 9 * dt));
    v.addScaledVector(p, -Math.min(2, 65 * dt));
  }

  update(dt, input) {
    const b = this.body;
    const w = this.world;
    this.prevPos.copy(b.pos);
    this.decayPunch(dt);

    // --- categorize position ---
    const g = groundBelow(w, b, 2);
    const wasOnGround = b.onGround;
    b.onGround = !!g && b.vel.y <= PLAYER.groundLaunchSpeed && w.time - b.lastTeleport > 0.05;
    if (b.vel.y < 0) this.fallSpeed = -b.vel.y;
    let landed = b.onGround && !wasOnGround;
    if (b.onGround) {
      b.groundEnt = g.ent;
      const target = g.top + b.half.y + 0.01;
      if (b.pos.y > target) b.pos.y = target;   // snap down onto the ground
      if (b.vel.y < 0) b.vel.y = 0;
    }

    // --- duck ---
    this.updateDuck(dt, !!input.duck);

    // --- wish direction from view yaw ---
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.set(0, 0, 0).addScaledVector(_f, input.forward).addScaledVector(_r, input.side);
    let wishspeed = _wish.length();
    if (wishspeed > 0) _wish.divideScalar(wishspeed);
    this.wish = _wish;
    // the move keys are scaled down to the max speed, then cropped while ducked
    const moveScale = Math.max(1, Math.hypot(input.forward, input.side));
    const crop = this.ducked && b.onGround ? PLAYER.duckSpeedScale : 1;
    const fmove = input.forward / moveScale * PLAYER.maxSpeed * crop;
    wishspeed = Math.min(1, wishspeed) * PLAYER.maxSpeed * crop;

    // --- jump (requires a fresh press, like HL2/Portal) ---
    let jumped = false;
    if (input.jump && !this.jumpHeld && b.onGround) {
      b.vel.y = PLAYER.jumpSpeed;
      // CheckJumpButton's bonus: part of the forward move is added along the
      // view, clipped so that speed doesn't pass 1.5x (1.1x ducked) max speed
      const perc = this.ducked ? 0.1 : PLAYER.jumpBoost;
      let add = Math.abs(fmove * perc);
      const maxS = PLAYER.maxSpeed * (1 + perc);
      const ns = add + Math.hypot(b.vel.x, b.vel.z);
      if (ns > maxS) add -= ns - maxS;
      if (fmove < 0) add = -add;
      b.vel.x += _f.x * add; b.vel.z += _f.z * add;
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
      if (this.airSuppress > 0) this.airSuppress -= dt;
      else airAccelerate(b.vel, _wish, wishspeed, PLAYER.airAccelerate, dt);
      b.vel.y -= GRAVITY * dt;
      // steer cleanly into a portal we are about to fly into while facing it
      funnel(w, b, dt, 250, this.forward(_look), this.eyePos(_eye));
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

    if (b.vel.y < 0) this.fallSpeed = -b.vel.y;
    const airborne = !b.onGround;
    stepMove(w, b, dt, b.onGround ? PLAYER.stepSize : 0);

    // landing: CheckFalling's view punch, and a landing step sound
    if (b.blockedDown && airborne && !jumped) landed = true;
    if (landed) {
      const fall = this.fallSpeed;
      if (this.airTime > 0.15) w.events.emit('land', { speed: fall });
      if (fall >= PLAYER.fallPunchThreshold) {
        this.punch.z = fall * 0.013;            // degrees of roll
        this.punchVel.set(0, 0, 0);
        this.stepTime = PLAYER.stepSoundTime;
      }
      this.fallSpeed = 0;
    }
    this.airTime = b.onGround || b.blockedDown ? 0 : this.airTime + dt;

    // footsteps every 400 ms while walking (500 crouched); Portal plays them
    // at any speed, as long as the player is moving along the ground
    this.stepTime -= dt;
    if (b.onGround && Math.hypot(b.vel.x, b.vel.z) > 1 && this.stepTime <= 0) {
      this.stepTime = PLAYER.stepSoundTime + (this.ducked ? 0.1 : 0);
      w.events.emit('footstep', {});
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
