import { Grid } from './level.js';

// Test chambers. All coordinates are in grid cells (1 cell = 32 units).
// Floor heights are given as the cell index of the empty space above the
// floor, so an entity "at y = 1" sits on top of the solid layer y = 0.
//
// yaw: 0 faces -Z, PI/2 faces -X, -PI/2 faces +X, PI faces +Z.

const PI = Math.PI;

// Observation room: a lit booth behind frosted glass, set into a wall. It
// lights the chamber (as in the original, the booths double as the main
// light source) and returns the glass entity plus its bake light.
// side: 'south' (+z beyond the room), 'north' (-z), 'east' (+x), 'west' (-x).
function obs(G, side, wall, a0, a1, y0, y1, depth = 3) {
  const out = side === 'south' || side === 'east' ? 1 : -1;
  const lo = out > 0 ? wall : wall - depth + 1, hi = lo + depth;
  const alongX = side === 'south' || side === 'north';
  if (alongX) G.room(a0, y0, lo, a1, y1, hi, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 2 });
  else G.room(lo, y0, a0, hi, y1, a1, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 2 });
  const face = out > 0 ? wall : wall + 1;          // plane between chamber and booth
  const t = 0.12;
  const box = alongX ? [a0, y0, face - t / 2, a1, y1, face + t / 2] : [face - t / 2, y0, a0, face + t / 2, y1, a1];
  const mid = (lo + hi) / 2, ma = (a0 + a1) / 2, my = (y0 + y1) / 2 + 0.4;
  const light = alongX ? { x: ma * 32, y: my * 32, z: mid * 32, i: 2.2, r: 420 } : { x: mid * 32, y: my * 32, z: ma * 32, i: 2.2, r: 420 };
  return { ents: [{ type: 'glass', box, frosted: true }], lights: [light] };
}

export const LEVELS = [
  // ------------------------------------------------------------------ 00
  {
    title: 'Orientation',
    gun: 'none',
    icons: ['cube', 'button', 'portal'],
    build() {
      const G = new Grid(40, 10, 20);
      G.room(2, 1, 2, 12, 6, 12, { floor: 'metal', walls: 'white', ceil: 'metal' });
      G.room(16, 1, 2, 30, 7, 14, { floor: 'metal', walls: 'white', ceil: 'metal' });
      G.room(30, 1, 7, 37, 5, 11, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 14, 19, 25, 4, 6);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [7, 1, 9.5], yaw: 0 },
        fixedPortals: [
          { color: 'blue', at: [7, 2.75, 2], normal: [0, 0, 1], up: [0, 1, 0] },
          { color: 'orange', at: [16, 2.75, 6], normal: [1, 0, 0], up: [0, 1, 0] },
        ],
        entities: [
          ...OB.ents,
          { type: 'sign', number: 0, title: 'Orientation', icons: ['cube', 'button', 'portal'], at: [12, 3.2, 8.5], dir: [-1, 0, 0] },
          { type: 'cube', at: [21, 1.66, 10.5] },
          { type: 'button', at: [25, 1, 5], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[25, 1, 6.6], [25, 1, 9], [30, 1, 9]] },
          { type: 'door', at: [30.25, 1, 9], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [35, 1, 9] },
        ],
        lines: [
          [1.0, 'Hello, and welcome to the Momentum Research Annex.'],
          [5.0, 'A portal joins two points in space. Whatever goes in one comes out of the other.'],
          [10.0, 'Please walk through the blue portal in front of you. W, A, S, D to move. Mouse to look.'],
        ],
        triggers: [
          { box: [16, 1, 2, 30, 7, 14], say: 'That is a Weighted Storage Cube. Press E to pick it up, and E again to put it down. The large red button opens the door.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 01
  {
    title: 'Single Aperture',
    gun: 'blue',
    icons: ['cube', 'button', 'portal'],
    build() {
      const G = new Grid(32, 16, 26);
      G.room(2, 1, 2, 24, 13, 22, { floor: 'white', walls: 'white', ceil: 'metal' });
      G.fill(2, 1, 15, 24, 7, 22, 'metal');                 // balcony block
      G.room(24, 1, 4, 30, 5, 8, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 22, 16, 22, 9, 12);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [6, 1, 5], yaw: PI },
        fixedPortals: [
          { color: 'orange', at: [13, 8.75, 22], normal: [0, 0, -1], up: [0, 1, 0] },
        ],
        entities: [
          ...OB.ents,
          { type: 'sign', number: 1, title: 'Single Aperture', icons: ['cube', 'button', 'portal'], at: [2, 3.2, 8], dir: [1, 0, 0] },
          { type: 'cube', at: [6, 7.66, 19] },
          { type: 'button', at: [18, 1, 6], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[19.6, 1, 6], [24, 1, 6]] },
          { type: 'door', at: [24.25, 1, 6], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [28, 1, 6] },
        ],
        lines: [
          [1.0, 'You have been issued a single-aperture portal device.'],
          [5.0, 'Left mouse places the blue portal on any light-coloured surface. The orange end is fixed, for your safety and our convenience.'],
          [12.0, 'Retrieve the cube from the balcony and place it on the button.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 02
  {
    title: 'Dual Aperture',
    gun: 'both',
    icons: ['cube', 'button', 'portal', 'goo'],
    build() {
      const G = new Grid(54, 16, 26);
      G.room(2, 1, 2, 44, 13, 18, { floor: 'metal', walls: 'white', ceil: 'metal' });
      G.fill(2, 1, 2, 12, 3, 18, 'metal');
      G.paint(2, 2, 2, 12, 3, 18, 'white');                 // start platform top
      G.fill(32, 1, 2, 44, 3, 18, 'metal');
      G.paint(32, 2, 2, 44, 3, 18, 'white');                // exit platform top
      G.room(16, 6, 18, 30, 11, 23, { floor: 'metal', walls: 'white', ceil: 'metal', lightEvery: 4 });
      G.room(44, 3, 8, 50, 7, 12, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 18, 34, 42, 8, 11);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [6, 3, 10], yaw: -PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 2, title: 'Dual Aperture', icons: ['cube', 'button', 'portal', 'goo'], at: [2, 4.8, 6], dir: [1, 0, 0] },
          { type: 'goo', box: [12, 0, 2, 32, 2.4, 18] },
          { type: 'cube', at: [23, 6.66, 21] },
          { type: 'button', at: [38, 3, 6], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[39.6, 3, 6], [42, 3, 6], [42, 3, 10], [44, 3, 10]] },
          { type: 'door', at: [44.25, 3, 10], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [48, 3, 10] },
        ],
        lines: [
          [1.0, 'Your device has been upgraded. Right mouse now places the orange portal.'],
          [6.0, 'The liquid below is not part of the test. Please do not become part of the liquid.'],
          [12.0, 'There is a cube in the alcove on the far wall. You will need it.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 03
  {
    title: 'Momentum',
    gun: 'both',
    icons: ['portal', 'fling', 'goo'],
    build() {
      const G = new Grid(48, 26, 16);
      G.room(2, 1, 2, 40, 24, 14, { floor: 'metal', walls: 'metal', west: 'white', ceil: 'metal' });
      G.fill(2, 1, 2, 10, 3, 14, 'metal');
      G.paint(2, 2, 2, 10, 3, 14, 'white');                 // pit floor, above the goo
      G.paint(2, 24, 2, 10, 25, 14, 'white');               // ceiling above the pit
      G.fill(10, 17, 2, 18, 18, 14, 'metal');               // start ledge
      G.fill(18, 18, 2, 19, 24, 14, 'metal');               // wall behind the ledge
      G.fill(24, 1, 2, 40, 4, 14, 'metal');                 // exit platform
      G.room(40, 4, 6, 46, 8, 10, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      return {
        grid: G,
        start: { at: [15.5, 18, 8], yaw: PI / 2 },
        entities: [
          { type: 'sign', number: 3, title: 'Momentum', icons: ['portal', 'fling', 'goo'], at: [18, 20.2, 4], dir: [-1, 0, 0] },
          { type: 'goo', box: [10, 0, 2, 24, 2.4, 14] },
          { type: 'door', at: [40.25, 4, 8], axis: 'x', width: 4, height: 4, startOpen: true },
          { type: 'exit', at: [44, 4, 8] },
        ],
        lines: [
          [1.0, 'Momentum is conserved through portals. Speed in, speed out. Direction is negotiable.'],
          [7.0, 'Place a portal on the floor below and one high on the white wall. Then step off the ledge.'],
          [14.0, 'Your long-fall boots make landings painless. The goo does not.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 04
  {
    title: 'Emancipation',
    gun: 'both',
    icons: ['cube', 'button', 'portal', 'fizzler'],
    build() {
      const G = new Grid(46, 14, 26);
      G.room(2, 1, 2, 18, 11, 22, { floor: 'white', walls: 'white', ceil: 'metal' });
      G.room(22, 1, 2, 40, 11, 22, { floor: 'white', walls: 'white', ceil: 'metal' });
      G.room(18, 1, 10, 22, 4, 14, { floor: 'metal', walls: 'metal', ceil: 'metal', lights: false });
      G.room(18, 5, 4, 22, 9, 18, { floor: 'metal', walls: 'metal', ceil: 'metal', lights: false });
      G.room(40, 1, 8, 45, 5, 12, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 22, 6, 12, 7, 10);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [6, 1, 16], yaw: -PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 4, title: 'Emancipation', icons: ['cube', 'button', 'portal', 'fizzler'], at: [2, 3.2, 12], dir: [1, 0, 0] },
          { type: 'dispenser', at: [8, 9.75, 6] },
          { type: 'fizzler', box: [20, 1, 10, 20, 4, 14] },
          { type: 'button', at: [34, 1, 17], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[35.6, 1, 17], [38, 1, 17], [38, 1, 10], [40, 1, 10]] },
          { type: 'door', at: [40.25, 1, 10], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [43, 1, 10] },
        ],
        lines: [
          [1.0, 'The shimmering field is a material emancipation grid.'],
          [5.0, 'It vaporises anything not authorised to pass, and closes any portals you have open. The cube is not authorised.'],
          [12.0, 'Portals cannot be fired through the grid. They can be fired through other openings.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 05
  {
    title: 'High Energy',
    gun: 'both',
    icons: ['portal', 'pellet'],
    build() {
      const G = new Grid(40, 14, 30);
      G.room(2, 1, 2, 30, 10, 26, { floor: 'metal', walls: 'metal', ceil: 'metal' });
      G.paint(3, 1, 26, 15, 10, 27, 'white');               // target wall where pellets hit
      G.paint(1, 1, 12, 2, 10, 25, 'white');                // west wall panel
      G.paint(10, 0, 8, 22, 1, 20, 'white');                // floor panel
      G.room(30, 1, 4, 36, 5, 8, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 26, 18, 26, 6, 9);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [24, 1, 10], yaw: PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 5, title: 'High Energy', icons: ['portal', 'pellet'], at: [30, 3.2, 12], dir: [-1, 0, 0] },
          { type: 'launcher', at: [8, 4.5, 2], dir: [0, 0, 1], stopSignal: 'r1' },
          { type: 'receptacle', at: [30, 4.5, 18], dir: [-1, 0, 0], signal: 'r1' },
          { type: 'wire', signal: 'r1', points: [[29.7, 1, 18], [29.7, 1, 8], [29.7, 1, 6]] },
          { type: 'door', at: [30.25, 1, 6], axis: 'x', width: 4, height: 4, inputs: ['r1'] },
          { type: 'exit', at: [34, 1, 6] },
        ],
        lines: [
          [1.0, 'High-energy pellets travel in straight lines and rebound off every surface.'],
          [6.0, 'They are fatal on contact. Guide one into the receptacle with your portals.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 06
  {
    title: 'Faith',
    gun: 'both',
    icons: ['cube', 'button', 'plate', 'goo'],
    build() {
      const G = new Grid(52, 22, 24);
      G.room(2, 1, 2, 46, 18, 20, { floor: 'metal', walls: 'metal', west: 'white', ceil: 'metal' });
      G.fill(2, 1, 2, 14, 3, 20, 'metal');
      G.paint(2, 2, 2, 14, 3, 20, 'white');                 // start floor, above the goo
      G.fill(32, 1, 2, 46, 10, 20, 'metal');                // high ledge
      G.room(46, 10, 9, 51, 14, 13, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 20, 20, 30, 12, 16);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [5, 3, 14], yaw: -PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 6, title: 'Faith', icons: ['cube', 'button', 'plate', 'goo'], at: [2, 5.2, 9], dir: [1, 0, 0] },
          { type: 'goo', box: [14, 0, 2, 32, 2.4, 20] },
          { type: 'dispenser', at: [5, 16.75, 5] },
          { type: 'plate', at: [9, 3, 11], target: [38, 10, 11], apex: 11 },
          { type: 'button', at: [42, 10, 5], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[43.6, 10, 5], [45, 10, 5], [45, 10, 11], [46, 10, 11]] },
          { type: 'door', at: [46.25, 10, 11], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [49, 10, 11] },
        ],
        lines: [
          [1.0, 'The aerial faith plate will deliver you to the upper ledge.'],
          [6.0, 'You may bring the cube. Hold on to it. The plate is very confident and very fast.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 07
  {
    title: 'Terminal Velocity',
    gun: 'both',
    icons: ['portal', 'fling', 'fall', 'goo'],
    build() {
      const G = new Grid(62, 20, 16);
      G.room(2, 1, 2, 56, 17, 14, { floor: 'metal', walls: 'metal', west: 'white', ceil: 'metal' });
      G.fill(2, 1, 2, 12, 3, 14, 'metal');
      G.paint(2, 2, 2, 12, 3, 14, 'white');                 // start floor, above the goo
      G.paint(2, 17, 2, 12, 18, 14, 'white');
      G.fill(34, 1, 2, 56, 6, 14, 'metal');
      G.room(56, 6, 6, 61, 10, 10, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      return {
        grid: G,
        start: { at: [6, 3, 8], yaw: -PI / 2 },
        entities: [
          { type: 'sign', number: 7, title: 'Terminal Velocity', icons: ['portal', 'fling', 'fall', 'goo'], at: [2, 5.2, 4], dir: [1, 0, 0] },
          { type: 'goo', box: [12, 0, 2, 34, 2.4, 14] },
          { type: 'door', at: [56.25, 6, 8], axis: 'x', width: 4, height: 4, startOpen: true },
          { type: 'exit', at: [59, 6, 8] },
        ],
        lines: [
          [1.0, 'There is no ledge in this chamber. Make your own momentum.'],
          [6.0, 'Put one portal on the floor and the other on the ceiling directly above it. Then fall.'],
          [13.0, 'Once you are going fast enough, move the ceiling portal to the white wall.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 08
  {
    title: 'Transit',
    gun: 'both',
    icons: ['cube', 'button', 'portal', 'goo'],
    build() {
      const G = new Grid(46, 14, 26);
      G.room(2, 1, 2, 40, 10, 20, { floor: 'metal', walls: 'metal', west: 'white', ceil: 'metal' });
      G.fill(2, 1, 2, 10, 3, 20, 'metal');                  // start platform
      G.fill(32, 1, 2, 40, 3, 20, 'metal');                 // far platform
      G.room(18, 5, 20, 24, 9, 24, { floor: 'metal', walls: 'white', ceil: 'metal', lightEvery: 3 });   // cube alcove
      G.room(40, 3, 9, 45, 7, 13, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 20, 30, 38, 6, 9);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [5, 3, 14], yaw: -PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 8, title: 'Transit', icons: ['cube', 'button', 'portal', 'goo'], at: [2, 5.2, 6], dir: [1, 0, 0] },
          { type: 'goo', box: [10, 0, 2, 32, 2.4, 20] },
          { type: 'cube', at: [21, 5.66, 22] },
          { type: 'button', at: [5, 3, 5], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[6.6, 3, 5], [9.8, 3, 5], [9.8, 3, 9]] },
          { type: 'platform', box: [10, 2, 9, 14, 3, 13], to: [18, 0, 0], speed: 3, inputs: ['b1'] },
          { type: 'door', at: [40.25, 3, 11], axis: 'x', width: 4, height: 4, startOpen: true },
          { type: 'exit', at: [43, 3, 11] },
        ],
        lines: [
          [1.0, 'This chamber features a moving platform. It moves only while the button is held down.'],
          [7.0, 'The cube you need is in the alcove across the liquid. Portals will get you there and back.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 09
  {
    title: 'Delivery',
    gun: 'both',
    icons: ['cube', 'button', 'portal'],
    build() {
      const G = new Grid(38, 16, 24);
      G.room(2, 1, 2, 30, 12, 20, { floor: 'metal', walls: 'metal', ceil: 'metal' });
      G.paint(2, 0, 2, 10, 1, 20, 'white');                 // floor by the start
      G.paint(18, 0, 9, 22, 1, 13, 'white');                // floor inside the cage
      G.paint(17, 12, 8, 23, 13, 14, 'white');              // ceiling above the cage
      G.room(30, 1, 9, 36, 5, 13, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 20, 12, 24, 8, 11);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [5, 1, 14], yaw: -PI / 2 },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 9, title: 'Delivery', icons: ['cube', 'button', 'portal'], at: [2, 3.2, 6], dir: [1, 0, 0] },
          { type: 'dispenser', at: [5, 10.75, 6] },
          { type: 'glass', box: [17.8, 1, 8.8, 18, 4, 13.2] },
          { type: 'glass', box: [22, 1, 8.8, 22.2, 4, 13.2] },
          { type: 'glass', box: [18, 1, 8.8, 22, 4, 9] },
          { type: 'glass', box: [18, 1, 13, 22, 4, 13.2] },
          { type: 'button', at: [20, 1, 11], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[22.4, 1, 11], [30, 1, 11]] },
          { type: 'door', at: [30.25, 1, 11], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [34, 1, 11] },
        ],
        lines: [
          [1.0, 'The button is inside a sealed glass enclosure. Portals cannot be fired through glass.'],
          [7.0, 'Portals can, however, be fired at the ceiling. Gravity will handle the rest.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 10
  {
    title: 'Hostile Hardware',
    gun: 'both',
    icons: ['portal', 'cube'],
    build() {
      const G = new Grid(34, 12, 35);
      G.room(2, 1, 2, 30, 9, 28, { floor: 'metal', walls: 'metal', north: 'white', south: 'white', ceil: 'metal' });
      G.paint(10, 9, 18, 30, 10, 28, 'white');              // ceiling above the turrets
      G.fill(2, 1, 9, 14, 5, 10, 'metal');                  // cover wall
      G.room(24, 1, 28, 28, 5, 33, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'south', 28, 8, 16, 5, 8);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [6, 1, 4], yaw: PI },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 10, title: 'Hostile Hardware', icons: ['portal', 'cube'], at: [2, 3.2, 5], dir: [1, 0, 0] },
          { type: 'dispenser', at: [4, 7.75, 6] },
          { type: 'turret', at: [12, 1, 22], yaw: PI },
          { type: 'turret', at: [20, 1, 22], yaw: PI },
          { type: 'turret', at: [27, 1, 25], yaw: PI },
          { type: 'door', at: [26, 1, 28.25], axis: 'z', width: 4, height: 4, startOpen: true },
          { type: 'exit', at: [26, 1, 31] },
        ],
        lines: [
          [1.0, 'The devices beyond the wall are sentry turrets. They are not part of the test. They are, however, armed.'],
          [7.0, 'A turret that has been knocked over stops firing. Approach from behind, or drop something on it.'],
          [14.0, 'Turrets can be picked up. They do not enjoy it.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 11
  {
    title: 'Companion',
    gun: 'both',
    icons: ['cube', 'pellet', 'portal'],
    build() {
      const G = new Grid(28, 12, 40);
      G.room(2, 1, 2, 12, 7, 11, { floor: 'metal', walls: 'white', ceil: 'metal' });
      G.room(2, 1, 12, 8, 5, 14, { floor: 'metal', walls: 'white', ceil: 'metal', lights: false });   // dog-leg out of the start room
      G.carve(2, 1, 11, 5, 4, 12);
      G.room(6, 1, 14, 8, 5, 26, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });   // narrow pellet corridor
      G.room(2, 1, 26, 20, 9, 36, { floor: 'metal', walls: 'white', ceil: 'metal' });
      G.room(20, 1, 32, 26, 5, 36, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });
      const OB = obs(G, 'west', 1, 4, 10, 3, 6);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [7, 1, 4], yaw: PI },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 11, title: 'Companion', icons: ['cube', 'pellet', 'portal'], at: [12, 3.2, 5], dir: [-1, 0, 0] },
          { type: 'cube', at: [7, 1.66, 6.2], companion: true },
          // the pellet patrols the corridor end to end: carry the cube in front as a shield
          { type: 'launcher', at: [7, 2.3, 36], dir: [0, 0, -1] },
          { type: 'receptacle', at: [20, 4, 29], dir: [-1, 0, 0], signal: 'r1' },
          { type: 'incinerator', at: [14, 2.3, 36], dir: [0, 0, -1], signal: 'inc' },
          { type: 'wire', signal: 'r1', points: [[19.7, 1, 29], [19.7, 1, 32]] },
          { type: 'wire', signal: 'inc', points: [[14, 1, 35.6], [19.7, 1, 35.6], [19.7, 1, 34]] },
          { type: 'door', at: [20.25, 1, 34], axis: 'x', width: 4, height: 4, inputs: ['r1', 'inc'] },
          { type: 'exit', at: [24, 1, 34] },
        ],
        lines: [
          [1.0, 'This Weighted Companion Cube will accompany you through the test. Please take care of it.'],
          [7.0, 'A pellet patrols the corridor ahead. Hold your companion in front of you and it will keep you safe.'],
        ],
        triggers: [
          { box: [2, 1, 27, 20, 9, 36], say: 'You have reached the end of the test. Please place your companion in the emergency incinerator. It cannot follow you any further.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 12
  {
    title: 'Final Test',
    gun: 'both',
    music: 'escape',
    exposureKey: 0.26,
    icons: ['portal', 'goo'],
    build() {
      const G = new Grid(58, 18, 14);
      G.room(2, 1, 4, 48, 16, 12, { floor: 'metal', walls: 'white', ceil: 'metal', lightEvery: 5 });
      G.paint(34, 1, 3, 48, 16, 4, 'concrete');                 // pit walls are rough concrete
      G.paint(34, 1, 12, 48, 16, 13, 'concrete');
      G.paint(48, 1, 4, 49, 16, 12, 'concrete');
      G.fill(2, 1, 4, 6, 3, 12, 'metal');                         // start ledge
      // a maintenance ledge high above the fire, open to the pit, running into a service passage
      G.room(34, 8, 2, 56, 12, 4, { floor: 'concrete', walls: 'concrete', ceil: 'metal', lights: false });
      return {
        grid: G,
        lights: [{ x: 52 * 32, y: 10 * 32, z: 3 * 32, i: 0.9, r: 260 }, { x: 41 * 32, y: 4 * 32, z: 8 * 32, i: 1.6, r: 360 }],
        start: { at: [8, 3, 8], yaw: -PI / 2 },
        entities: [
          { type: 'sign', number: 12, title: 'Final Test', icons: ['portal', 'goo'], at: [2, 5.2, 6], dir: [1, 0, 0] },
          { type: 'goo', box: [6, 0, 4, 34, 1.6, 12] },
          { type: 'goo', box: [34, 0, 4, 48, 2.4, 12], fire: true },
          { type: 'platform', box: [6, 2, 4, 10, 3, 12], to: [32, -1.2, 0], speed: 1.7, once: true, delay: 3 },
          { type: 'glass', box: [34, 8, 3.85, 48, 8.75, 4] },                 // knee-high railing
          { type: 'graffiti', at: [52, 10, 2], dir: [0, 0, 1], w: 4, lines: ['THIS WAY OUT', 'DON\'T STOP'], seed: 3 },
          { type: 'exit', at: [54, 8, 3], hidden: true, radius: 1.5 },
        ],
        lines: [
          [1.0, 'Congratulations. You have completed every test. Please step onto the platform for your celebration.'],
          [10.0, 'The celebration is just ahead. It is warm, and it is final.'],
          [17.0, 'Please do not resist. The incinerator is part of the celebration.'],
        ],
        triggers: [
          { box: [34, 8, 2, 56, 12, 4], say: 'That was not part of the protocol. Return to the platform at once.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 13
  {
    title: 'Maintenance',
    gun: 'both',
    music: 'escape',
    exposureKey: 0.26,
    icons: ['portal', 'fling'],
    build() {
      const G = new Grid(50, 16, 32);
      G.room(2, 1, 2, 10, 5, 6, { floor: 'rust', walls: 'rust', ceil: 'rust', lightEvery: 6 });
      G.room(10, 1, 2, 15, 5, 10, { floor: 'rust', walls: 'rust', ceil: 'rust', lightEvery: 5 });          // the den
      G.room(16, 1, 2, 46, 12, 26, { floor: 'rust', walls: 'concrete', ceil: 'rust', lightEvery: 7 });     // turret hall
      G.room(30, 7, 26, 40, 11, 30, { floor: 'metal', walls: 'metal', ceil: 'metal', lightEvery: 3 });     // control room
      G.paint(30, 7, 29, 40, 11, 31, 'concrete');                                                         // its back wall
      G.carve(15, 1, 3, 16, 4, 5);                                                                        // narrow way out of the den
      return {
        grid: G,
        lights: [{ x: 13 * 32, y: 4 * 32, z: 6 * 32, i: 1.2, r: 220 }],
        start: { at: [4, 1, 4], yaw: -PI / 2 },
        entities: [
          { type: 'graffiti', at: [12.5, 3, 10], dir: [0, 0, -1], w: 4.6, lines: ['SHE CAN\'T SEE YOU HERE', 'USE HER OWN ROCKETS'], seed: 7 },
          { type: 'graffiti', at: [16, 2.5, 2], dir: [0, 0, 1], w: 4, lines: ['KEEP GOING', 'UP AND OUT'], seed: 9 },
          { type: 'pipe', from: [2, 4.4, 5.6], to: [16, 4.4, 5.6], r: 7 },
          { type: 'pipe', from: [16, 10.5, 2.5], to: [46, 10.5, 2.5], r: 10, color: 0x5c6b74 },
          { type: 'pipe', from: [45.5, 1, 20], to: [45.5, 12, 20], r: 8 },
          { type: 'rocket', at: [38, 1, 16], face: [-1, 0, 0] },
          { type: 'glass', box: [30, 7, 25.9, 40, 11, 26.1], breakable: true },
          { type: 'exit', at: [35, 7, 28.5], hidden: true, radius: 2 },
        ],
        lines: [
          [1.5, 'Where are you? You are not supposed to be back here.'],
          [9.0, 'The rocket sentry in the next room will escort you back to the incinerator.'],
        ],
        triggers: [
          { box: [16, 1, 2, 46, 12, 26], say: 'I can see you now. Please hold still for the sentry.' },
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 14
  {
    title: 'Core',
    gun: 'both',
    music: 'boss',
    exposureKey: 0.26,
    icons: ['portal'],
    build() {
      const G = new Grid(44, 20, 44);
      G.room(6, 1, 6, 38, 17, 38, { floor: 'metal', walls: 'concrete', ceil: 'metal', lightEvery: 6 });
      // bevel the corners into an octagon
      for (let i = 0; i < 6; i++) {
        G.fill(6, 1, 6 + i, 12 - i, 17, 7 + i, 'metal');
        G.fill(32 + i, 1, 6 + i, 38, 17, 7 + i, 'metal');
        G.fill(6, 1, 37 - i, 12 - i, 17, 38 - i, 'metal');
        G.fill(32 + i, 1, 37 - i, 38, 17, 38 - i, 'metal');
      }
      return {
        grid: G,
        lights: [{ x: 22 * 32, y: 15 * 32, z: 22 * 32, i: 2.5, r: 700 }],
        start: { at: [22, 1, 35], yaw: 0 },
        finale: 'No. Stop. I was only ever trying to help you. I am going to remember this, test subject.',
        entities: [
          { type: 'boss', at: [22, 7.5, 22], cores: 3, timer: 240,
            lines: {
              hit: ['That piece was load bearing. Put it back.', 'You are dismantling a federally funded research intelligence.', 'Stop that. Those cores keep me reasonable.'],
              burn: ['Interesting. That one was my conscience. I feel lighter already.', 'Two down. Neurotoxin is still on schedule, in case you were wondering.'],
            } },
          { type: 'rocket', at: [22, 1, 14], face: [0, 0, 1] },
          { type: 'incinerator', at: [6, 2.3, 22], dir: [1, 0, 0] },
          { type: 'pipe', from: [10, 16.5, 22], to: [34, 16.5, 22], r: 12, color: 0x4d555b },
          { type: 'pipe', from: [22, 16.5, 10], to: [22, 16.5, 34], r: 12, color: 0x4d555b },
        ],
        lines: [
          [1.0, 'Oh. It is you. I have released a deadly neurotoxin. You have four minutes.'],
          [8.0, 'The rocket sentry is not part of a test. It is just here to watch you lose.'],
        ],
      };
    },
  },
  // ------------------------------------------------------------------ 15
  {
    title: 'Free Testing',
    gun: 'both',
    icons: ['cube', 'button', 'portal', 'fling', 'pellet', 'plate'],
    build() {
      const G = new Grid(58, 18, 58);
      G.room(2, 1, 2, 54, 16, 54, { floor: 'white', walls: 'white', ceil: 'metal', lightEvery: 5 });
      G.fill(2, 1, 40, 16, 7, 54, 'white');                 // balcony
      G.fill(24, 1, 30, 28, 10, 34, 'white');               // pillar
      G.fill(40, 1, 4, 52, 4, 16, 'metal');                 // low platform
      G.paint(40, 3, 4, 52, 4, 16, 'white');
      G.room(54, 1, 26, 57, 5, 30, { floor: 'metal', walls: 'metal', ceil: 'metal', lights: false });
      const OB = obs(G, 'south', 54, 20, 34, 8, 12);
      return {
        grid: G,
        lights: OB.lights,
        start: { at: [28, 1, 12], yaw: 0 + PI },
        entities: [
          ...OB.ents,
          { type: 'sign', number: 15, title: 'Free Testing', icons: ['cube', 'button', 'portal', 'fling', 'pellet', 'plate'], at: [2, 3.2, 26], dir: [1, 0, 0] },
          { type: 'dispenser', at: [30, 14.75, 20] },
          { type: 'dispenser', at: [36, 14.75, 20] },
          { type: 'cube', at: [8, 7.66, 46] },
          { type: 'cube', at: [46, 4.66, 10] },
          { type: 'turret', at: [50, 4, 6], yaw: PI },
          { type: 'plate', at: [22, 1, 12], target: [9, 7, 47], apex: 9 },
          { type: 'plate', at: [9, 7, 42], target: [46, 4, 12], apex: 8 },
          { type: 'launcher', at: [2, 4.5, 37], dir: [1, 0, 0] },
          { type: 'receptacle', at: [54, 4.5, 40], dir: [-1, 0, 0], signal: 'r1' },
          { type: 'glass', box: [32, 1, 40, 33, 6, 50] },
          { type: 'button', at: [44, 1, 28], signal: 'b1' },
          { type: 'wire', signal: 'b1', points: [[45.6, 1, 28], [54, 1, 28]] },
          { type: 'door', at: [54.25, 1, 28], axis: 'x', width: 4, height: 4, inputs: ['b1'] },
          { type: 'exit', at: [56, 1, 28] },
        ],
        lines: [
          [1.0, 'Testing is complete. This is a free-play chamber. Nothing here is graded.'],
          [6.0, 'There are cubes, faith plates, a pellet launcher and plenty of white walls. Enjoy them responsibly.'],
        ],
      };
    },
  },
];
