import * as THREE from 'three';
import { CELL, PORTAL } from './constants.js';
import { PORTALABLE } from './level.js';

const R_Y_PI = new THREE.Matrix4().makeRotationY(Math.PI);
const axisOf = (v) => (Math.abs(v.x) > 0.5 ? 0 : Math.abs(v.y) > 0.5 ? 1 : 2);
const comp = (v, a) => (a === 0 ? v.x : a === 1 ? v.y : v.z);

// A portal is an oriented rectangle (rendered as an oval) lying flat on an
// axis-aligned grid face. Local frame: +X right, +Y up, +Z out of the wall.
export class Portal {
  constructor(color) {
    this.color = color;
    this.placed = false;
    this.fixed = false;
    this.other = null;
    this.pos = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.matrix = new THREE.Matrix4();
    this.inverse = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.toOther = new THREE.Matrix4();       // transforms points from this side to the other
    this.toOtherQuat = new THREE.Quaternion();
    this.openedAt = -10;
    this.version = 0;
  }

  get linked() { return this.placed && this.other && this.other.placed; }

  set(pos, normal, up, time = 0) {
    this.pos.copy(pos);
    this.normal.copy(normal).round();
    this.up.copy(up).round();
    this.right.crossVectors(this.up, this.normal).round();
    this.matrix.makeBasis(this.right, this.up, this.normal).setPosition(this.pos);
    this.inverse.copy(this.matrix).invert();
    this.quat.setFromRotationMatrix(this.matrix);
    this.nAxis = axisOf(this.normal);
    this.nSign = comp(this.normal, this.nAxis);
    this.uAxis = axisOf(this.right);
    this.vAxis = axisOf(this.up);
    this.plane = comp(this.pos, this.nAxis);
    // world-axis extents of the rectangle within the plane
    this.ext = [0, 0, 0];
    this.ext[this.uAxis] = PORTAL.halfWidth;
    this.ext[this.vAxis] = PORTAL.halfHeight;
    this.placed = true;
    this.openedAt = time;
    this.version++;
    updateLink(this);
  }

  clear() {
    this.placed = false;
    this.version++;
    if (this.other) updateLink(this.other);
  }

  // signed distance from the portal plane (positive in front)
  dist(p) { return (comp(p, this.nAxis) - this.plane) * this.nSign; }

  // is a point (already on/near the plane) inside the portal rectangle?
  inRect(p, shrinkU = 0, shrinkV = 0) {
    const du = Math.abs(comp(p, this.uAxis) - comp(this.pos, this.uAxis));
    const dv = Math.abs(comp(p, this.vAxis) - comp(this.pos, this.vAxis));
    return du <= PORTAL.halfWidth - shrinkU && dv <= PORTAL.halfHeight - shrinkV;
  }

  inOval(p, scale = 1) {
    const du = (comp(p, this.uAxis) - comp(this.pos, this.uAxis)) / (PORTAL.halfWidth * scale);
    const dv = (comp(p, this.vAxis) - comp(this.pos, this.vAxis)) / (PORTAL.halfHeight * scale);
    return du * du + dv * dv <= 1;
  }

  // in-plane AABB [min,max] arrays (axis along normal is the plane value)
  rectBox() {
    const min = [this.pos.x, this.pos.y, this.pos.z], max = [...min];
    for (let a = 0; a < 3; a++) { min[a] -= this.ext[a]; max[a] += this.ext[a]; }
    return [min, max];
  }
}

function updateLink(p) {
  const o = p.other;
  if (!o) return;
  if (p.placed && o.placed) {
    p.toOther.copy(o.matrix).multiply(R_Y_PI).multiply(p.inverse);
    o.toOther.copy(p.matrix).multiply(R_Y_PI).multiply(o.inverse);
    p.toOtherQuat.setFromRotationMatrix(p.toOther);
    o.toOtherQuat.setFromRotationMatrix(o.toOther);
  }
}

export function pairPortals(a, b) {
  a.other = b; b.other = a;
}

// ---------------------------------------------------------------------------
// Placement: find a spot for a portal on the surface that was hit, nudging it
// so it fits entirely on one flat portalable surface (like the original
// does when you shoot near an edge).

function surfaceOk(world, p, n) {
  const g = world.grid;
  const bx = p.x - n.x * 1, by = p.y - n.y * 1, bz = p.z - n.z * 1;
  const fx = p.x + n.x * 1, fy = p.y + n.y * 1, fz = p.z + n.z * 1;
  const m = g.matAt(bx, by, bz);
  if (!PORTALABLE.has(m)) return false;
  if (g.solidAt(fx, fy, fz)) return false;
  for (const b of world.noPortalBoxes) {
    if (fx > b[0] && fx < b[3] && fy > b[1] && fy < b[4] && fz > b[2] && fz < b[5]) return false;
  }
  return true;
}

const _p = new THREE.Vector3();
function rectOk(world, c, n, right, up) {
  const hw = PORTAL.halfWidth - 1, hh = PORTAL.halfHeight - 1;
  for (let u = -hw; u <= hw + 0.01; u += hw / 4) {
    for (let v = -hh; v <= hh + 0.01; v += hh / 7) {
      _p.copy(c).addScaledVector(right, u).addScaledVector(up, v);
      if (!surfaceOk(world, _p, n)) return false;
    }
  }
  return true;
}

// contiguous valid extent along `dir` from `c` (checking a line of samples
// along `across` with half-length `acrossHalf`)
function extent(world, c, n, dir, across, acrossHalf, max) {
  const lineOk = (off) => {
    for (let a = -acrossHalf; a <= acrossHalf + 0.01; a += Math.max(4, acrossHalf / 6)) {
      _p.copy(c).addScaledVector(dir, off).addScaledVector(across, a);
      if (!surfaceOk(world, _p, n)) return false;
    }
    return true;
  };
  if (!lineOk(0)) return null;
  let lo = 0, hi = 0;
  while (hi < max && lineOk(hi + 2)) hi += 2;
  while (lo > -max && lineOk(lo - 2)) lo -= 2;
  return [lo, hi];
}

function fitAt(world, hitPoint, normal, up, self) {
  const n = normal.clone().round();
  const right = new THREE.Vector3().crossVectors(up, n).round();
  const c = hitPoint.clone();
  // snap onto the exact plane
  const a = axisOf(n);
  const planeVal = Math.round(comp(c, a) / CELL) * CELL;
  if (a === 0) c.x = planeVal; else if (a === 1) c.y = planeVal; else c.z = planeVal;
  c.addScaledVector(n, 0); // stays on plane

  const HW = PORTAL.halfWidth, HH = PORTAL.halfHeight;
  for (let iter = 0; iter < 3; iter++) {
    // vertical extent (along up) on a thin centre line
    const ev = extent(world, c, n, up, right, 2, HH * 3);
    if (!ev || ev[1] - ev[0] < 2 * HH - 2) return null;
    let sv = 0;
    if (-HH < ev[0]) sv = ev[0] + HH; else if (HH > ev[1]) sv = ev[1] - HH;
    c.addScaledVector(up, sv);
    // horizontal extent with the full height
    const eu = extent(world, c, n, right, up, HH - 1, HW * 3);
    if (!eu || eu[1] - eu[0] < 2 * HW - 2) return null;
    let su = 0;
    if (-HW < eu[0]) su = eu[0] + HW; else if (HW > eu[1]) su = eu[1] - HW;
    c.addScaledVector(right, su);
    if (rectOk(world, c, n, right, up)) break;
    if (iter === 2) return null;
  }

  // keep clear of the other portal on the same plane
  const other = self.other;
  if (other && other.placed && other.nAxis === a && Math.sign(comp(other.normal, a)) === Math.sign(comp(n, a)) &&
      Math.abs(other.plane - comp(c, a)) < 0.5) {
    const ext = [0, 0, 0];
    ext[axisOf(right)] = HW; ext[axisOf(up)] = HH;
    const tries = [];
    for (let ax = 0; ax < 3; ax++) {
      if (ax === a) continue;
      const d = comp(c, ax) - comp(other.pos, ax);
      const need = ext[ax] + other.ext[ax] + 1;
      if (Math.abs(d) >= need) return finish(c, n, up);
      // which other axis overlaps? we need to separate on at least one
      tries.push({ ax, shift: (d >= 0 ? 1 : -1) * (need - Math.abs(d)) });
      tries.push({ ax, shift: (d >= 0 ? -1 : 1) * (need + Math.abs(d)) });
    }
    tries.sort((x, y) => Math.abs(x.shift) - Math.abs(y.shift));
    for (const t of tries) {
      const cc = c.clone();
      if (t.ax === 0) cc.x += t.shift; else if (t.ax === 1) cc.y += t.shift; else cc.z += t.shift;
      if (rectOk(world, cc, n, right, up)) return finish(cc, n, up);
    }
    return null;
  }
  return finish(c, n, up);
}

function finish(c, n, up) {
  return { pos: c, normal: n, up: up.clone() };
}

// Choose the "up" direction for a portal on a given face. Walls use world
// up; floors and ceilings align with the shot direction (snapped to an axis).
export function portalUpFor(normal, shotDir) {
  if (Math.abs(normal.y) < 0.5) return new THREE.Vector3(0, 1, 0);
  const d = shotDir.clone(); d.y = 0;
  if (Math.abs(d.x) > Math.abs(d.z)) return new THREE.Vector3(Math.sign(d.x) || 1, 0, 0);
  return new THREE.Vector3(0, 0, Math.sign(d.z) || 1);
}

// Robust placement: try the shot point, then (for floors and ceilings) the
// other orientation, then a widening ring of nearby points on the same
// surface, and take the candidate closest to where the player aimed.
const RING = [];
for (const r of [12, 24, 40, 56, 72, 96]) {
  const n = Math.max(8, Math.round(r / 4));
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; RING.push([Math.cos(a) * r, Math.sin(a) * r]); }
}
export function fitPortal(world, hitPoint, normal, up, self) {
  const n = normal.clone().round();
  const ups = [up.clone()];
  if (Math.abs(n.y) > 0.5) ups.push(new THREE.Vector3(up.z, 0, -up.x));   // floors/ceilings: also try turned 90 degrees
  let best = null, bestD = Infinity;
  const consider = (fit) => {
    if (!fit) return;
    const d = fit.pos.distanceToSquared(hitPoint);
    if (d < bestD) { best = fit; bestD = d; }
  };
  // keep the orientation the player aimed with whenever it fits
  for (const u of ups) { const f = fitAt(world, hitPoint, n, u, self); if (f) return f; }
  const right = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const u of ups) {
    if (best) break;
    right.crossVectors(u, n).round();
    for (const [du, dv] of RING) {
      p.copy(hitPoint).addScaledVector(right, du).addScaledVector(u, dv);
      // the nudged point must still be on the same flat, portalable face
      if (!surfaceOk(world, p, n)) continue;
      consider(fitAt(world, p, n, u, self));
      if (best && bestD < (Math.hypot(du, dv) + 1) ** 2) return best;
    }
  }
  return best;
}
