import * as THREE from 'three';
import { CELL } from './constants.js';
import { MAT, traceGrid } from './level.js';
import { AXES, DIRS, LUX, LM_RANGE } from './bake.js';
import { patchLitSurface } from './lightmap.js';
import { makeDecalTextures, DECAL_CELLS } from './textures.js';
import { Goo, Fizzler, Door, Exit, PelletLauncher } from './entities.js';

// Set dressing painted onto the world: hazard stripes along goo pits, floor
// arrows at exits, warning labels near hazards, stencilled chamber numbers,
// grime and scorch marks. Decals are cut to the world's lightmap charts, so
// each piece is lit by exactly the baked light (and dynamic shadows) of the
// surface under it, and anything hanging over an edge is simply dropped.
//
// API: game.decals.add(type, pos, normal, size, opts) with pos/normal as
// arrays or vectors in world units, size = [width, height] (or one number),
// opts = { up: [x, y, z], text: number (for 'number') }. Levels may also list
// decals as { type, at: [cells], normal, size: [units], up } in `decals`.
// Types: hazard, arrow, chevron, label_touch, label_goo, label_field, grime,
// drip, scorch, number.

const LIFT = 0.12;                 // units off the surface
const HAZARD_PERIOD = 64;          // units per stripe repeat

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const v3 = (p) => (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone());
const hash = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

export class Decals {
  constructor(game) {
    this.game = game;
    this.user = [];                // added through the API
    this.meshes = [];
  }

  add(type, pos, normal, size, opts = {}) {
    const s = Array.isArray(size) ? size : [size, size];
    const d = { type, pos: v3(pos), normal: v3(normal).normalize(), w: s[0], h: s[1], ...opts };
    this.user.push(d);
    if (this.game.lm && this.meshes.length) this.rebuild();
    return d;
  }

  clear() { this.user = []; }

  // regenerate all decal geometry for the current chamber
  rebuild() {
    const g = this.game;
    for (const m of this.meshes) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.meshes = [];
    if (!g.lm || !g.scene) return;
    this.lm = g.lm;
    this.planes = new Map();
    for (const r of g.lm.charts.rects) {
      if (r.cx < 0 || r.m === MAT.LIGHT) continue;
      const k = r.d * 4096 + r.s;
      if (!this.planes.has(k)) this.planes.set(k, []);
      this.planes.get(k).push(r);
    }
    const list = [...this.auto(g), ...(g.levelDecals || []).map((d) => ({
      type: d.type, pos: v3(d.at).multiplyScalar(CELL), normal: v3(d.normal || [0, 1, 0]),
      w: (Array.isArray(d.size) ? d.size[0] : d.size) || 48, h: (Array.isArray(d.size) ? d.size[1] : d.size) || 48,
      up: d.up, text: d.text,
    })), ...this.user];
    const tex = makeDecalTextures(g.renderer);
    const groups = new Map();      // texture -> buffers
    for (const d of list) {
      const t = d.type === 'hazard' ? tex.hazard : d.type === 'number' ? tex.number(d.text ?? g.levelIndex) : tex.atlas;
      if (!groups.has(t)) groups.set(t, { pos: [], nrm: [], uv: [], uv1: [], idx: [] });
      this.emit(d, groups.get(t));
    }
    const pbr = g.quality.pbr;
    for (const [t, b] of groups) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('uv1', new THREE.Float32BufferAttribute(b.uv1, 2));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const common = {
        map: t, lightMap: g.lm.texture, lightMapIntensity: LM_RANGE * Math.PI, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      };
      const mat = pbr
        ? patchLitSurface(new THREE.MeshStandardMaterial({ ...common, roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }), g.lm,
          { decal: true, shadows: g.quality.shadows > 0, spec: 0.25 })
        : new THREE.MeshBasicMaterial(common);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.world = true;
      mesh.renderOrder = 1;
      g.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  // Cut one decal to the lightmap charts of the face it lies on.
  emit(d, b) {
    const n = d.normal;
    const ax = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    const sign = n.getComponent(ax) > 0 ? 1 : -1;
    const dir = DIRS.findIndex((v) => v[ax] === sign);
    const { ua, va } = AXES[dir];
    const plane = d.pos.getComponent(ax);
    const s = Math.round(plane / CELL) - (sign > 0 ? 1 : 0);
    const rects = this.planes.get(dir * 4096 + s);
    if (!rects) return;
    // decal frame: up in the plane (world +y on walls), right = up x n
    const up = d.up ? v3(d.up) : ax === 1 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    up.addScaledVector(n, -up.dot(n)).normalize();
    const right = _a.crossVectors(up, n).clone();
    const c = d.pos;
    // extent in the plane's (ua, va) coordinates
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      _b.copy(c).addScaledVector(right, sx * d.w / 2).addScaledVector(up, sy * d.h / 2);
      u0 = Math.min(u0, _b.getComponent(ua)); u1 = Math.max(u1, _b.getComponent(ua));
      v0 = Math.min(v0, _b.getComponent(va)); v1 = Math.max(v1, _b.getComponent(va));
    }
    const cell = DECAL_CELLS[d.type];
    const lm = this.lm, W = lm.charts.W, rows = lm.rows;
    const p = new THREE.Vector3();
    for (const r of rects) {
      const ru0 = r.u0 * CELL, ru1 = (r.u0 + r.w) * CELL, rv0 = r.v0 * CELL, rv1 = (r.v0 + r.h) * CELL;
      const a0 = Math.max(u0, ru0), a1 = Math.min(u1, ru1), b0 = Math.max(v0, rv0), b1 = Math.min(v1, rv1);
      if (a0 >= a1 - 0.01 || b0 >= b1 - 0.01) continue;
      const vi = b.pos.length / 3;
      for (const [pu, pv] of [[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) {
        p.setComponent(ax, plane + sign * LIFT); p.setComponent(ua, pu); p.setComponent(va, pv);
        b.pos.push(p.x, p.y, p.z);
        b.nrm.push(n.x, n.y, n.z);
        _b.subVectors(p, c);
        let tu = _b.dot(right) / d.w + 0.5, tv = _b.dot(up) / d.h + 0.5;
        if (d.type === 'hazard') tu = p.dot(right) / HAZARD_PERIOD;
        else if (cell) {
          tu = (cell[0] + tu * cell[2]) / 1024;
          tv = 1 - (cell[1] + (1 - tv) * cell[3]) / 1024;
        }
        b.uv.push(tu, tv);
        b.uv1.push((r.cx + 1 + (pu - ru0) / LUX) / W, (r.cy + 1 + (pv - rv0) / LUX) / rows);
      }
      // keep the winding facing along n
      const e1 = [b.pos[(vi + 1) * 3] - b.pos[vi * 3], b.pos[(vi + 1) * 3 + 1] - b.pos[vi * 3 + 1], b.pos[(vi + 1) * 3 + 2] - b.pos[vi * 3 + 2]];
      const e2 = [b.pos[(vi + 2) * 3] - b.pos[vi * 3], b.pos[(vi + 2) * 3 + 1] - b.pos[vi * 3 + 1], b.pos[(vi + 2) * 3 + 2] - b.pos[vi * 3 + 2]];
      const cz = (e1[0] * e2[1] - e1[1] * e2[0]) * n.z + (e1[1] * e2[2] - e1[2] * e2[1]) * n.x + (e1[2] * e2[0] - e1[0] * e2[2]) * n.y;
      if (cz > 0) b.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      else b.idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Procedural placement from the grid and the chamber's entities.
  auto(g) {
    const out = [];
    const grid = g.grid;
    const ents = g.entities || [];
    const solid = (x, y, z) => grid.solid(x, y, z);
    const floorBelow = (p, max = 400) => {
      const h = traceGrid(grid, _a.set(p.x, p.y + 1, p.z), _b.set(0, -1, 0), max);
      return h ? p.y + 1 - h.t : null;
    };
    const wallHit = (o, dir, max) => {
      const h = traceGrid(grid, o, dir, max);
      if (!h || h.t < 2 || Math.abs(dir.y) > 0.01) return null;
      return { t: h.t, p: o.clone().addScaledVector(dir, h.t), n: dir.clone().negate() };
    };

    // hazard stripes and warning labels around goo pits
    for (const e of ents) {
      if (!(e instanceof Goo)) continue;
      const bx = e.box, top = e.top;
      const inPit = (x, z) => (x + 0.5) * CELL > bx[0] && (x + 0.5) * CELL < bx[3] && (z + 0.5) * CELL > bx[2] && (z + 0.5) * CELL < bx[5];
      const x0 = Math.floor(bx[0] / CELL) - 1, x1 = Math.ceil(bx[3] / CELL) + 1, z0 = Math.floor(bx[2] / CELL) - 1, z1 = Math.ceil(bx[5] / CELL) + 1;
      const y0 = Math.floor(top / CELL), y1 = Math.min(grid.ny - 1, y0 + 4);
      let lip = Infinity;
      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
        if (inPit(x, z)) continue;
        for (let y = y0; y <= y1; y++) {
          if (!solid(x, y, z) || solid(x, y + 1, z)) continue;     // a floor top
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!inPit(x + dx, z + dz) || solid(x + dx, y, z + dz)) continue;
            const lipY = (y + 1) * CELL;
            lip = Math.min(lip, lipY);
            const edge = new THREE.Vector3((x + 0.5 + dx * 0.5) * CELL, lipY, (z + 0.5 + dz * 0.5) * CELL);
            const toPit = new THREE.Vector3(dx, 0, dz);
            // on the floor, a band along the lip
            out.push({ type: 'hazard', pos: edge.clone().addScaledVector(toPit, -6).setY(lipY), normal: new THREE.Vector3(0, 1, 0), w: CELL, h: 12, up: toPit });
            // and down the lip's face, above the sludge
            if (lipY - top > 10) out.push({ type: 'hazard', pos: edge.clone().setY(lipY - 6), normal: toPit, w: CELL, h: 12, up: [0, 1, 0] });
          }
          break;
        }
      }
      // labels on the nearest walls, at eye height above the lip
      if (lip === Infinity) lip = top + 0.6 * CELL;
      const c = new THREE.Vector3((bx[0] + bx[3]) / 2, lip + 50, (bx[2] + bx[5]) / 2);
      const hits = [];
      for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((v) => new THREE.Vector3(...v))) {
        const h = wallHit(c, dir, 1600);
        if (h) hits.push(h);
      }
      hits.sort((a, b) => a.t - b.t);
      for (const h of hits.slice(0, 2)) {
        // slide along the wall, away from the pit centre line, to sit beside it
        const side = new THREE.Vector3().crossVectors(h.n, new THREE.Vector3(0, 1, 0));
        out.push({ type: 'label_goo', pos: h.p.clone().addScaledVector(side, 40), normal: h.n, w: 36, h: 22.5 });
      }
    }

    // fizzlers: a label on the wall at each end of the field
    for (const e of ents) {
      if (!(e instanceof Fizzler)) continue;
      const bx = e.box;
      const c = new THREE.Vector3((bx[0] + bx[3]) / 2, bx[1] + 52, (bx[2] + bx[5]) / 2);
      const along = e.axis === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const across = e.axis === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      for (const s of [1, -1]) {
        const o = c.clone().addScaledVector(across, 40 * s);
        const h = wallHit(o, along.clone().multiplyScalar(s), 800);
        if (h) { out.push({ type: 'label_field', pos: h.p, normal: h.n, w: 32, h: 20 }); break; }
      }
    }

    // floor arrows leading to the exit door
    const exits = ents.filter((e) => e instanceof Exit && e.ringMat);
    for (const e of ents) {
      if (!(e instanceof Door)) continue;
      const ex = exits[0];
      if (!ex) continue;
      const a = e.axis;
      const s = Math.sign(ex.pos.getComponent(a) - e.pos.getComponent(a)) || 1;
      const fwd = new THREE.Vector3(); fwd.setComponent(a, s);
      for (const [dist, type, size] of [[70, 'arrow', 44], [150, 'chevron', 40]]) {
        const p = e.pos.clone().addScaledVector(fwd, -dist);
        const fy = floorBelow(p.clone().setY(p.y + 20), 80);
        if (fy === null) continue;
        out.push({ type, pos: p.setY(fy), normal: new THREE.Vector3(0, 1, 0), w: size, h: size, up: fwd });
      }
    }

    // the chamber number, stencilled large on a wall facing the start
    const st = g.player?.body?.pos;
    if (st && g.levelIndex !== undefined && g.def && !g.def.noNumber) {
      const eye = st.clone(); eye.y += 30;
      const yaw = g.player.yaw ?? 0;
      let best = null;
      for (const k of [0, 1, -1, 2]) {
        const a = yaw + k * Math.PI / 2;
        const d = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
        d.set(Math.round(d.x), 0, Math.round(d.z));
        const h = wallHit(eye, d, 1400);
        if (h && h.t > 120 && (!best || (k === 0 && h.t < 1000))) { best = h; if (k === 0) break; }
      }
      if (best) {
        const ceil = traceGrid(grid, best.p.clone().addScaledVector(best.n, 4), new THREE.Vector3(0, 1, 0), 600);
        const room = ceil ? ceil.t : 200;
        const p = best.p.clone(); p.y += Math.min(110, room - 50);
        if (room > 120) out.push({ type: 'number', pos: p, normal: best.n, w: 128, h: 64, text: g.levelIndex });
      }
    }

    // scorch where pellet launchers fire
    for (const e of ents) {
      if (!(e instanceof PelletLauncher)) continue;
      const h = traceGrid(grid, e.pos.clone().addScaledVector(e.dir, 30), e.dir, 3000);
      if (!h) continue;
      const p = e.pos.clone().addScaledVector(e.dir, 30 + h.t);
      out.push({ type: 'scorch', pos: p, normal: e.dir.clone().negate(), w: 70, h: 70, up: Math.abs(e.dir.y) > 0.5 ? [0, 0, 1] : [0, 1, 0] });
    }

    // grime: stains at the foot of walls, more in the older chambers
    const grimy = [MAT.CONCRETE, MAT.RUST, MAT.METAL];
    let count = 0;
    for (const r of this.lm.charts.rects) {
      if (r.d !== 2 || r.cx < 0) continue;              // floors
      const y = r.s + 1;
      for (let j = 0; j < r.h && count < 60; j++) for (let k = 0; k < r.w && count < 60; k++) {
        const x = r.u0 + k, z = r.v0 + j;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!solid(x + dx, y, z + dz) || !solid(x + dx, y + 1, z + dz)) continue;
          const m = grid.get(x + dx, y, z + dz);
          const rnd = hash(x * 73 + z * 19 + dx * 5 + dz * 3, y * 11 + g.levelIndex);
          if (rnd > (grimy.includes(m) ? 0.07 : 0.025)) continue;
          count++;
          const n = new THREE.Vector3(-dx, 0, -dz);
          const wp = new THREE.Vector3((x + 0.5 + dx * 0.5) * CELL, y * CELL + 20, (z + 0.5 + dz * 0.5) * CELL);
          out.push({ type: 'drip', pos: wp, normal: n, w: 40 + rnd * 300, h: 40 });
          if (rnd < 0.012) out.push({ type: 'grime', pos: new THREE.Vector3((x + 0.5) * CELL - dx * 6, y * CELL, (z + 0.5) * CELL - dz * 6), normal: new THREE.Vector3(0, 1, 0), w: 60, h: 50, up: [dz, 0, dx] });
        }
      }
    }
    return out;
  }

  dispose() {
    for (const m of this.meshes) { this.game.scene?.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.meshes = [];
  }
}
