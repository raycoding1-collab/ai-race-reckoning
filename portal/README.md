# Momentum Test Chambers

A browser game recreating portal-gun physics, built from scratch with three.js (vendored in `vendor/`). There is no build step: serve the repo and open `/portal/`.

**Controls:** WASD to move, mouse to look, left/right click for the blue/orange portal, E to pick up, Space to jump, Ctrl or C to crouch, hold R to restart, Esc to pause.

## What's modelled
- **Movement**: Source-style (175 u/s run speed, 600 gravity, friction 4, stop speed 100, air acceleration capped at 30 u/s, jump only on a fresh press, crouch-jump, 3500 u/s per-axis speed cap).
- **Portals**: rendered recursively with the stencil buffer and an oblique near plane. Momentum is conserved through them and orientation is transformed. The wall behind a portal opens up for collision. Floor portals pop you out. Shots pass through portals. Portals nudge themselves to fit near edges and keep clear of each other.
- **Objects**: cubes that tumble in flight and settle on a face, moving platforms you can ride, cubes you can carry through portals, sentry turrets (sight cone, laser, about 2 s to kill you, knocked over by bumping, dropping or hitting them with a cube), buttons, doors, emancipation grids, goo, energy pellets with receptacles, aerial faith plates and cube dispensers.
- **Chambers**: twelve, from 00 to 11. Chamber 11 is a free-play sandbox. Every chamber has been completed by a scripted playthrough that uses only in-game actions (aim, shoot, walk, jump, pick up, drop).

## Performance
Each portal view draws only the objects and 20-cell level chunks visible through that portal's screen rectangle and in front of its exit plane. A frame with several nested portal views stays at about 100 to 250 draw calls.

## Code layout (`js/`)
`physics.js` (box collision, portal holes, teleporting) · `player.js` (movement) · `portal.js` (placement) · `render.js` (recursive portal rendering) · `entities.js` · `levels.js` (chamber layouts on a 32-unit voxel grid) · `game.js` (game loop and interaction) · `main.js` (input and menus).

This is an unofficial fan tribute. It contains no Valve assets.
