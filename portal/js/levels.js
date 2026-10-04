import { Grid } from './level.js';

// Test chambers. All coordinates are in grid cells (1 cell = 32 units).
// Floor heights are given as the cell index of the empty space above the
// floor, so an entity "at y = 1" sits on top of the solid layer y = 0.
//
// yaw: 0 faces -Z, PI/2 faces -X, -PI/2 faces +X, PI faces +Z.

const PI = Math.PI;

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
      return {
        grid: G,
        start: { at: [7, 1, 9.5], yaw: 0 },
        fixedPortals: [
          { color: 'blue', at: [7, 2.75, 2], normal: [0, 0, 1], up: [0, 1, 0] },
          { color: 'orange', at: [16, 2.75, 6], normal: [1, 0, 0], up: [0, 1, 0] },
        ],
        entities: [
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
      return {
        grid: G,
        start: { at: [6, 1, 5], yaw: PI },
        fixedPortals: [
          { color: 'orange', at: [13, 8.75, 22], normal: [0, 0, -1], up: [0, 1, 0] },
        ],
        entities: [
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
      return {
        grid: G,
        start: { at: [6, 3, 10], yaw: -PI / 2 },
        entities: [
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
      return {
        grid: G,
        start: { at: [6, 1, 16], yaw: -PI / 2 },
        entities: [
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
      return {
        grid: G,
        start: { at: [24, 1, 10], yaw: PI / 2 },
        entities: [
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
      return {
        grid: G,
        start: { at: [5, 3, 14], yaw: -PI / 2 },
        entities: [
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
      return {
        grid: G,
        start: { at: [28, 1, 12], yaw: 0 + PI },
        entities: [
          { type: 'sign', number: 8, title: 'Free Testing', icons: ['cube', 'button', 'portal', 'fling', 'pellet', 'plate'], at: [2, 3.2, 26], dir: [1, 0, 0] },
          { type: 'dispenser', at: [30, 14.75, 20] },
          { type: 'dispenser', at: [36, 14.75, 20] },
          { type: 'cube', at: [8, 7.66, 46] },
          { type: 'cube', at: [46, 4.66, 10] },
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
