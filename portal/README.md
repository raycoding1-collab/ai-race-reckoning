# Momentum Test Chambers

A browser game recreating portal-gun physics, built from scratch with three.js (vendored in `vendor/`). There is no build step: serve the repo and open `/portal/`.

**Controls:** WASD to move, mouse to look, left/right click for the blue/orange portal, E to pick up, Space to jump, Ctrl or C to crouch, hold R to restart, Esc to pause.

## What's modelled
- **Movement**: Source-style (175 u/s run speed, 600 gravity, friction 4, stop speed 100, air acceleration capped at 30 u/s, jump only on a fresh press, crouch-jump, 3500 u/s per-axis speed cap).
- **Portals**: rendered recursively with the stencil buffer and an oblique near plane. Momentum is conserved through them and orientation is transformed. The wall behind a portal opens up for collision. Floor portals pop you out. Shots pass through portals. Portals nudge themselves to fit near edges and keep clear of each other.
- **Objects**: cubes that tumble in flight and settle on a face (including a Weighted Companion Cube), moving platforms you can ride, cubes you can carry through portals and use as a shield against energy pellets, sentry turrets (sight cone, laser, about 2 s to kill you, knocked over by bumping, dropping or hitting them with a cube), buttons, doors, emancipation grids, goo, energy pellets with receptacles, aerial faith plates, cube dispensers, an emergency incinerator, breakable observation windows, a rocket sentry (locks on, then fires a rocket that flies through portals and explodes with splash damage and knockback) and the facility AI itself, a hanging chassis whose personality cores are knocked loose by redirected rockets and must be burned before a neurotoxin timer runs out.
- **Chambers**: sixteen, from 00 to 15, following the shape of the original campaign. Chambers 00 to 10 teach the mechanics, with observation booths overlooking most of them. 11 is the companion cube test, 12 the final test that ends on a platform heading into a fire pit, 13 the escape through rusted maintenance areas past a rocket sentry, and 14 the confrontation in the AI's chamber. 15 is a free-play sandbox. Every chamber has been completed by a scripted playthrough that uses only in-game actions (aim, shoot, walk, jump, pick up, drop).

## Touch edition (`mobile/`)
Served from the same page: phones and tablets are detected automatically (or add `?touch` / `?desktop` to the URL). The game always plays in landscape; when the device is held upright, the page rotates itself. The same game for phones and tablets: all chambers, mechanics, recursive portals and settings, played with touch controls. The left thumb drives an analog stick and the right thumb looks around. On-screen buttons cover blue and orange portals, grab, jump, crouch (hold or toggle) and pause, with vibration feedback. It opens fullscreen in landscape and scales resolution automatically to keep the frame rate up. Announcer lines are reworded for touch. Progress is shared with the desktop edition on the same browser. All sixteen chambers pass the scripted playthrough in this edition too.

## Graphics
Three presets in Settings. **High** renders the whole recursive portal view into an HDR, 4x multisampled target, then applies bloom, ACES filmic tone mapping and a subtle vignette with film grain (FXAA where multisampling is unavailable). **Medium** keeps the physically based materials and draws straight to the screen (the default on touch devices). **Low** uses unlit materials with the baked lighting only. Surfaces use generated albedo, normal and roughness maps (white test panels, dark metal, rusted maintenance plating, rough concrete) with a room environment map for reflections. Light is baked into the level per vertex from every ceiling strip, with traced shadows.

## Music
A small generative score built in Web Audio: slow detuned pads and sparse glassy notes in the test chambers, a filtered drone with distant metal in the maintenance areas, and a driving pulse in the final confrontation. It can be switched off in Settings.

## Announcer voice
Every announcer line is pre-rendered with the Kokoro neural text-to-speech model (voice `af_heart`). It is then processed the way the original announcer is generally described as having been made: a calm, deliberate read that is pitch-corrected onto a hard semitone grid with the natural melody mostly removed. Each syllable sits on its own flat note, with odd step changes between syllables, which gives the sing-song, synthetic inflection. On top of that, formants are lifted about 7%, a faint tremor is added, the mid-range is pushed forward, and a compressor and a short public-address slap finish it off. The pitch work uses the WORLD vocoder; the EQ and dynamics use ffmpeg. The clips live in `voice/` (about 2.4 MB of MP3 in total) and play through Web Audio. Subtitles are off by default (the voice carries the lines); they can be switched on in Settings and appear automatically if the voice is turned off. Lines without a clip fall back to the browser's speech synthesiser. To regenerate after editing lines, install `kokoro-onnx pyworld soundfile numpy` and run `python tools/genvoice.py tools/touchwords.json <dir with kokoro.onnx and voices.bin>`.

## Performance
Shaders are compiled when a chamber loads, and clipping planes stay attached to their materials, so the first portal, burst or pass-through doesn't stutter. Each portal view draws only the objects and 20-cell level chunks visible through that portal's screen rectangle and in front of its exit plane. A frame with several nested portal views stays at about 100 to 250 draw calls.

## Code layout (`js/`)
`physics.js` (box collision, portal holes, teleporting) · `player.js` (movement) · `portal.js` (placement) · `render.js` (recursive portal rendering) · `entities.js` · `levels.js` (chamber layouts on a 32-unit voxel grid) · `game.js` (game loop and interaction) · `main.js` (input and menus).

This is an unofficial fan tribute. It contains no Valve assets.
