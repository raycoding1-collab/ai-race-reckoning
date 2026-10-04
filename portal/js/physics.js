import * as THREE from 'three';
import { CELL, PORTAL, MAX_VELOCITY } from './constants.js';

// Axis-aligned box collision against the voxel grid and dynamic entities,
// with portal "holes": while a body overlaps a linked portal's volume, the
// wall behind that portal's rectangle stops existing for it, exactly like the
// original game swaps collision when you stand in a portal.

const EPS = 0.01;

class BoxList {
  constructor() { this.b = new Float64Array(6 * 512); this.ent = new Array(512); this.n = 0; }
  clear() { this.n = 0; }
  add(x0, y0, z0, x1, y1, z1, ent = null) {
    if (this.n * 6 + 6 > this.b.length) {
      const nb = new Float64Array(this.b.length * 2); nb.set(this.b); this.b = nb;
    }
    const o = this.n * 6;
    const b = this.b;
    b[o] = x0; b[o + 1] = y0; b[o + 2] = z0; b[o + 3] = x1; b[o + 4] = y1; b[o + 5] = z1;
    this.ent[this.n] = ent;
    this.n++;
  }
}
const boxes = new BoxList();

export class Body {
  constructor(kind, hx, hy, hz) {
    this.kind = kind;
    this.isBody = true;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.half = new THREE.Vector3(hx, hy, hz);
    this.onGround = false;
    this.groundEnt = null;
    this.holes = [];
    this.holeExp = [];
    this.hits = [];          // entities blocked by during the last step
    this.solid = true;       // other bodies collide with it
    this.ignore = null;      // entity to ignore (e.g. held cube for the player)
    this.lastTeleport = -1;
  }
  overlapsBox(x0, y0, z0, x1, y1, z1, pos = this.pos) {
    const h = this.half;
    return pos.x - h.x < x1 - 1e-6 && pos.x + h.x > x0 + 1e-6 &&
      pos.y - h.y < y1 - 1e-6 && pos.y + h.y > y0 + 1e-6 &&
      pos.z - h.z < z1 - 1e-6 && pos.z + h.z > z0 + 1e-6;
  }
}

// --- portal holes ----------------------------------------------------------
function zoneOverlap(P, min, max) {
  const a = P.nAxis;
  for (let ax = 0; ax < 3; ax++) {
    let lo, hi;
    if (ax === a) {
      lo = P.nSign > 0 ? P.plane - PORTAL.holeDepth : P.plane - 1;
      hi = P.nSign > 0 ? P.plane + 1 : P.plane + PORTAL.holeDepth;
    } else {
      const c = ax === 0 ? P.pos.x : ax === 1 ? P.pos.y : P.pos.z;
      lo = c - P.ext[ax]; hi = c + P.ext[ax];
    }
    if (min[ax] >= hi || max[ax] <= lo) return false;
  }
  return true;
}

// A body whose centre is over the portal may pass even if its box pokes a
// little past the rectangle (the original is similarly forgiving), so the
// hole is widened by the body's half size along the portal's plane.
export function computeHoles(world, body, pad = 2) {
  body.holes.length = 0;
  body.holeExp.length = 0;
  const p = body.pos, h = body.half;
  const min = [p.x - h.x - pad, p.y - h.y - pad, p.z - h.z - pad];
  const max = [p.x + h.x + pad, p.y + h.y + pad, p.z + h.z + pad];
  const c = [p.x, p.y, p.z], hh = [h.x, h.y, h.z];
  for (const P of world.portalList) {
    if (!P.linked || !zoneOverlap(P, min, max)) continue;
    const pc = [P.pos.x, P.pos.y, P.pos.z];
    const inside = Math.abs(c[P.uAxis] - pc[P.uAxis]) <= P.ext[P.uAxis] && Math.abs(c[P.vAxis] - pc[P.vAxis]) <= P.ext[P.vAxis];
    body.holes.push(P);
    body.holeExp.push(inside ? [Math.min(hh[P.uAxis], P.ext[P.uAxis] * 0.5), Math.min(hh[P.vAxis], P.ext[P.vAxis] * 0.5)] : [0, 0]);
  }
}

// subtract portal rectangles from a solid cell box and add the pieces
const pieceStack = [];
function addCellWithHoles(x0, y0, z0, x1, y1, z1, holes, exps) {
  if (!holes.length) { boxes.add(x0, y0, z0, x1, y1, z1); return; }
  pieceStack.length = 0;
  pieceStack.push([x0, y0, z0, x1, y1, z1]);
  for (let hi = 0; hi < holes.length; hi++) {
    const P = holes[hi], ex = exps[hi];
    const a = P.nAxis;
    const behindLo = P.nSign > 0 ? P.plane - PORTAL.holeDepth : P.plane;
    const behindHi = P.nSign > 0 ? P.plane : P.plane + PORTAL.holeDepth;
    const ua = P.uAxis, va = P.vAxis;
    const pc = [P.pos.x, P.pos.y, P.pos.z];
    const u0 = pc[ua] - P.ext[ua] - ex[0], u1 = pc[ua] + P.ext[ua] + ex[0];
    const v0 = pc[va] - P.ext[va] - ex[1], v1 = pc[va] + P.ext[va] + ex[1];
    const next = [];
    for (const b of pieceStack) {
      const bmin = [b[0], b[1], b[2]], bmax = [b[3], b[4], b[5]];
      if (bmax[a] <= behindLo + 1e-6 || bmin[a] >= behindHi - 1e-6 ||
          bmax[ua] <= u0 || bmin[ua] >= u1 || bmax[va] <= v0 || bmin[va] >= v1) {
        next.push(b); continue;
      }
      const piece = (lo, hi) => next.push([lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]);
      if (bmin[ua] < u0) { const hi = bmax.slice(); hi[ua] = u0; piece(bmin, hi); }
      if (bmax[ua] > u1) { const lo = bmin.slice(); lo[ua] = u1; piece(lo, bmax); }
      const mlo = bmin.slice(), mhi = bmax.slice();
      mlo[ua] = Math.max(bmin[ua], u0); mhi[ua] = Math.min(bmax[ua], u1);
      if (bmin[va] < v0) { const hi = mhi.slice(); hi[va] = v0; piece(mlo, hi); }
      if (bmax[va] > v1) { const lo = mlo.slice(); lo[va] = v1; piece(lo, mhi); }
      // the part of the cell deeper than the hole stays solid
      if (bmin[a] < behindLo) { const hi = mhi.slice(); hi[a] = behindLo; const lo = mlo.slice(); lo[va] = Math.max(bmin[va], v0); hi[va] = Math.min(bmax[va], v1); piece(lo, hi); }
      if (bmax[a] > behindHi) { const lo = mlo.slice(); lo[a] = behindHi; const hi = mhi.slice(); lo[va] = Math.max(bmin[va], v0); hi[va] = Math.min(bmax[va], v1); piece(lo, hi); }
    }
    pieceStack.length = 0;
    pieceStack.push(...next);
  }
  for (const b of pieceStack) boxes.add(b[0], b[1], b[2], b[3], b[4], b[5]);
}

// Collect every solid box overlapping [min,max] for `body`.
function gather(world, body, minx, miny, minz, maxx, maxy, maxz) {
  boxes.clear();
  const g = world.grid;
  const cx0 = Math.floor(minx / CELL), cy0 = Math.floor(miny / CELL), cz0 = Math.floor(minz / CELL);
  const cx1 = Math.floor(maxx / CELL), cy1 = Math.floor(maxy / CELL), cz1 = Math.floor(maxz / CELL);
  for (let y = cy0; y <= cy1; y++) for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
    if (g.solid(x, y, z)) addCellWithHoles(x * CELL, y * CELL, z * CELL, (x + 1) * CELL, (y + 1) * CELL, (z + 1) * CELL, body.holes, body.holeExp);
  }
  for (const s of world.solids) {
    if (!s.isSolid(body)) continue;
    const b = s.box;
    if (b[3] > minx && b[0] < maxx && b[4] > miny && b[1] < maxy && b[5] > minz && b[2] < maxz) {
      boxes.add(b[0], b[1], b[2], b[3], b[4], b[5], s);
    }
  }
  for (const o of world.bodies) {
    if (o === body || !o.solid || o === body.ignore || body === o.ignore) continue;
    const p = o.pos, h = o.half;
    if (p.x + h.x > minx && p.x - h.x < maxx && p.y + h.y > miny && p.y - h.y < maxy && p.z + h.z > minz && p.z - h.z < maxz) {
      boxes.add(p.x - h.x, p.y - h.y, p.z - h.z, p.x + h.x, p.y + h.y, p.z + h.z, o);
    }
  }
}

const _prev = new THREE.Vector3();
function moveAxis(world, body, axis, d) {
  const p = body.pos, h = body.half;
  _prev.copy(p);
  if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
  const minx = Math.min(_prev.x, p.x) - h.x, maxx = Math.max(_prev.x, p.x) + h.x;
  const miny = Math.min(_prev.y, p.y) - h.y, maxy = Math.max(_prev.y, p.y) + h.y;
  const minz = Math.min(_prev.z, p.z) - h.z, maxz = Math.max(_prev.z, p.z) + h.z;
  gather(world, body, minx - 1, miny - 1, minz - 1, maxx + 1, maxy + 1, maxz + 1);
  const B = boxes.b;
  let limit = d > 0 ? Infinity : -Infinity, hitEnt = null, hit = false;
  for (let i = 0; i < boxes.n; i++) {
    const o = i * 6;
    if (!body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5])) continue;
    if (body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5], _prev)) continue; // already stuck: let it escape
    hit = true;
    if (d > 0) { const lim = B[o + axis] - (axis === 0 ? h.x : axis === 1 ? h.y : h.z) - EPS; if (lim < limit) { limit = lim; hitEnt = boxes.ent[i]; } }
    else { const lim = B[o + 3 + axis] + (axis === 0 ? h.x : axis === 1 ? h.y : h.z) + EPS; if (lim > limit) { limit = lim; hitEnt = boxes.ent[i]; } }
  }
  if (hit) {
    // never move backwards past the start position
    if (d > 0) limit = Math.max(Math.min(limit, axis === 0 ? p.x : axis === 1 ? p.y : p.z), axis === 0 ? _prev.x : axis === 1 ? _prev.y : _prev.z);
    else limit = Math.min(Math.max(limit, axis === 0 ? p.x : axis === 1 ? p.y : p.z), axis === 0 ? _prev.x : axis === 1 ? _prev.y : _prev.z);
    if (axis === 0) p.x = limit; else if (axis === 1) p.y = limit; else p.z = limit;
    return { ent: hitEnt };
  }
  return null;
}

// Is there something directly under the body (within `dist` units)?
export function groundBelow(world, body, dist = 2) {
  const p = body.pos, h = body.half;
  gather(world, body, p.x - h.x, p.y - h.y - dist - 1, p.z - h.z, p.x + h.x, p.y - h.y + 1, p.z + h.z);
  const B = boxes.b;
  const test = _prev.copy(p); test.y -= dist;
  let best = null, bestTop = -Infinity;
  for (let i = 0; i < boxes.n; i++) {
    const o = i * 6;
    if (!body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5], test)) continue;
    if (body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5], p)) continue;
    if (B[o + 4] > bestTop) { bestTop = B[o + 4]; best = { ent: boxes.ent[i], top: B[o + 4] }; }
  }
  return best;
}

// Does the body's box (optionally at another position/size) overlap anything?
export function overlapsAnything(world, body, pos = body.pos, half = body.half) {
  const save = body.half;
  body.half = half;
  gather(world, body, pos.x - half.x, pos.y - half.y, pos.z - half.z, pos.x + half.x, pos.y + half.y, pos.z + half.z);
  let r = false;
  const B = boxes.b;
  for (let i = 0; i < boxes.n && !r; i++) {
    const o = i * 6;
    if (body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5], pos)) r = true;
  }
  body.half = save;
  return r;
}

// Push a body out of anything it is stuck inside (doors closing, portals
// vanishing while the body is in the hole, etc.). Tries all six directions
// and takes the shortest move that frees the body from every box.
const _dp = new THREE.Vector3();
function overlappingStatic(world, body, pos) {
  const h = body.half;
  gather(world, body, pos.x - h.x, pos.y - h.y, pos.z - h.z, pos.x + h.x, pos.y + h.y, pos.z + h.z);
  const B = boxes.b, out = [];
  for (let i = 0; i < boxes.n; i++) {
    const o = i * 6;
    if (boxes.ent[i] && boxes.ent[i].isBody) continue;   // bodies resolve themselves
    if (body.overlapsBox(B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5], pos)) out.push([B[o], B[o + 1], B[o + 2], B[o + 3], B[o + 4], B[o + 5]]);
  }
  return out;
}
export function depenetrate(world, body) {
  const p = body.pos, h = body.half;
  if (!overlappingStatic(world, body, p).length) return;
  const hv = [h.x, h.y, h.z];
  let best = null;
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      let d = 0, ok = false;
      for (let iter = 0; iter < 8; iter++) {
        _dp.copy(p).setComponent(axis, p.getComponent(axis) + sign * d);
        const over = overlappingStatic(world, body, _dp);
        if (!over.length) { ok = true; break; }
        let need = d;
        for (const b of over) {
          const c = _dp.getComponent(axis);
          const req = sign > 0 ? b[axis + 3] + hv[axis] - c : c - (b[axis] - hv[axis]);
          need = Math.max(need, d + req + EPS);
        }
        d = need;
        if (d > 160) break;
      }
      if (ok && (!best || d < best.d)) best = { axis, sign, d };
    }
  }
  if (best) p.setComponent(best.axis, p.getComponent(best.axis) + best.sign * best.d);
}

// --- teleporting -----------------------------------------------------------
const _seg = new THREE.Vector3();
function checkTeleport(world, body, from, to) {
  for (const P of body.holes) {
    if (!P.linked) continue;
    const d0 = P.dist(from), d1 = P.dist(to);
    if (d0 >= 0 && d1 < 0) {
      const t = d0 / (d0 - d1);
      _seg.copy(from).lerp(to, t);
      if (P.inRect(_seg)) return P;
    }
  }
  return null;
}

const _m3 = new THREE.Matrix3();
export function teleportBody(world, body, P) {
  const Q = P.other;
  body.pos.applyMatrix4(P.toOther);
  _m3.setFromMatrix4(P.toOther);
  body.vel.applyMatrix3(_m3);
  // make the box fit inside the exit rectangle
  const pc = [Q.pos.x, Q.pos.y, Q.pos.z];
  const hp = [body.half.x, body.half.y, body.half.z];
  const pos = [body.pos.x, body.pos.y, body.pos.z];
  for (const ax of [Q.uAxis, Q.vAxis]) {
    const lo = pc[ax] - Q.ext[ax] + hp[ax] + 0.05, hi = pc[ax] + Q.ext[ax] - hp[ax] - 0.05;
    pos[ax] = lo > hi ? pc[ax] : Math.min(hi, Math.max(lo, pos[ax]));
  }
  const a = Q.nAxis;
  const front = (pos[a] - Q.plane) * Q.nSign;
  if (front < 0.05) pos[a] = Q.plane + Q.nSign * 0.05;
  body.pos.set(pos[0], pos[1], pos[2]);
  // floor portals pop you out so you don't fall straight back in
  if (Q.normal.y > 0.5) {
    if (body.vel.y < PORTAL.minFloorExitSpeed) {
      body.vel.y = PORTAL.minFloorExitSpeed;
      const hs = Math.hypot(body.vel.x, body.vel.z);
      if (hs < PORTAL.floorExitNudge) body.vel.addScaledVector(Q.up, PORTAL.floorExitNudge - hs);
    }
  } else if (Math.abs(Q.normal.y) < 0.5) {
    const out = body.vel.dot(Q.normal);
    if (out < 20) body.vel.addScaledVector(Q.normal, 20 - out);
  }
  body.lastTeleport = world.time;
  body.onGround = false;
  computeHoles(world, body);
  if (body.onTeleport) body.onTeleport(P, Q);
  world.events.emit('teleport', { body, from: P, to: Q });
}

// --- main integrator ------------------------------------------------------
const _from = new THREE.Vector3();
export function moveBody(world, body, dt) {
  const v = body.vel;
  v.x = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v.x));
  v.y = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v.y));
  v.z = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v.z));
  body.hits.length = 0;
  body.blockedDown = false;
  let travel = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  computeHoles(world, body, travel + 2);
  depenetrate(world, body);
  const steps = Math.max(1, Math.ceil(travel / 6));
  for (let s = 0; s < steps; s++) {
    _from.copy(body.pos);
    for (const axis of [1, 0, 2]) {
      const d = (axis === 0 ? v.x : axis === 1 ? v.y : v.z) * dt / steps;
      if (d === 0) continue;
      const hit = moveAxis(world, body, axis, d);
      if (hit) {
        if (axis === 1 && d < 0) { body.blockedDown = true; body.groundEnt = hit.ent; }
        body.hits.push({ axis, sign: Math.sign(d), ent: hit.ent, speed: Math.abs(axis === 0 ? v.x : axis === 1 ? v.y : v.z) });
        if (axis === 0) v.x = 0; else if (axis === 1) v.y = 0; else v.z = 0;
      }
    }
    const P = checkTeleport(world, body, _from, body.pos);
    if (P) {
      teleportBody(world, body, P);
      travel = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
      computeHoles(world, body, travel + 2);
    }
  }
}

