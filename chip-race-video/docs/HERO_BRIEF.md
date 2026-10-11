# Hero-world agent brief (template; fill WORLD, WINDOW, CONCEPT)
Build one hero world for our code-rendered music video "Silicon Shield" (three.js engine in /home/user/ai-race-reckoning/chip-race-video/app; 1920x1080, 30 fps). Quality bar: the reference's hand-built raymarched SDF worlds (docs/reference/ANIMATION_SCRIPT.md section 2: real hand-built detail, the lyric drives the geometry, geometric match cuts, one deadpan joke). Do not commit or push. Keep output terse; filter logs. Other agents edit other scene files at the same time: touch only your new scene file(s) and your timeline entries.

World: WORLD (WINDOW s), per its entry in docs/reference/GAP.md section 4 (read that entry, section 3.2 for the SE-look, and the UNIT 0001 gag notes). CONCEPT. Lyric timing: data/lyrics.json.

Use the shared foundation: app/src/engine/se.ts (header usage notes: SDF lib, half-res G-buffer, semShade, data strip, seCamera/seProject, sePost) and follow app/src/scenes/w7-shield.ts as the reference implementation. Read the hand-off comments in the headers of the neighbouring scenes (app/src/timeline.ts) so first and last frames match-cut cleanly.
Constraints: <= 4 s/frame at 1080p on SwiftShader (CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome; `bun scripts/render.ts --help` from app/); amber #FFA41B is the only hue; no captions (the lyric lives in the scene, as thin etched/e-beam-written type, not chunky extrusions); `bunx tsc --noEmit -p tsconfig.json` clean.
Verify with stills at 4-5 times (include first and last frame), tiled into one <= 1600 px montage; view at most 8 images. Iterate until hand-built and premium.
Final reply (under 25 lines): files, s/frame, what the stills show, hand-off check, open issues.
