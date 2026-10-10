# Brief for scene-builder agents (Phase 5)

You build plates of **Silicon Shield**, a code-rendered music video (three.js + TypeScript), aiming for masterpiece quality: it must beat the reference video (mexicat/pdoom-video) on craft, motion and wit. The user's notes so far: the drop slams ("EVERY / WAFER / is a / WEAPON / NOW") are great; everything else must be just as **bold, alive and kinetic**. **No objects that look drawn in paint**: everything is rendered or engraved with precision. No static stretches. Every scene has its own animation idea; never reuse one technique to fill time.

## Read first (all short)
1. `docs/STYLE_BIBLE.md` (palette, type, motion grammar, karaoke rules, through-lines).
2. `docs/STORYBOARD.md`: your plates' rows, plus the rows before and after yours (handoffs!).
3. The engine guide at `/tmp/claude-0/-home-user-ai-race-reckoning/80932282-0ae1-5a2e-af84-f9486aaf032b/scratchpad/refs/pdoom-video/docs/ENGINE.md`. Our engine in `app/` is a fork of it, and the APIs are the same: Scene, Frame, FSPass, Layer2D, LineBatch, the type and stroke fonts, `hatch`/`engrave` GLSL, `ease`/`keys`/springs, and post overrides.
4. The craft lessons from the reference, in `docs/breakdown/*.md` (A–D) and `docs/breakdown/MOTION_STATS.md`. Steal techniques, never code verbatim. The best ones:
   - **Pen-as-data plotter:** every mark is `{points, t0, t1, ease}`; invert the ease for per-point arrival, and derive the line, the beam head, the glow and any typed listing from one list.
   - **Beat-grid camera director:** shots as `{poseA, poseB, ease, snap, kick, rollSpring}` on `audio.timeOfBeat(k)`; `outExpo` snaps over 0.09–0.16 s; small roll springs.
   - **Surface-parametrised engraving:** hatch lines following the geometry's own coordinates, with width following the light and an amber rim re-ink.
   - **Lens and warp shaders on flat Canvas2D type**, for lensed or bent lyrics.
   - **Geometry-matched handoffs:** compute the next plate's first-frame element position and end your plate with that element in that exact place.
   - **Syllable-driven hits** from `word.syl`.
   - **Graph-to-world transitions:** the chart's axis becomes the terrain.
   - The reference to study for any plate: render its own scenes yourself (see ENGINE.md in the reference clone; its `app/` runs with `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

## Our project specifics
- App: `/home/user/ai-race-reckoning/chip-race-video/app`. The timeline is `src/timeline.ts`, with `PLATES` (ids, modules, bar windows; 128 BPM, bar = 1.875 s); don't edit it. A plate with param `n` (drop ×3) serves several entries.
- Write **only** `app/src/scenes/<module>.ts` and your own helpers `app/src/scenes/<module>-*.ts`. `_motifs.ts` is read-only (the lead owns it). It provides the beam (`beamHead`, `beamParticles`, `beamHead2D`), the TPP meter (`TPP`, `drawTPP`, `formatTPP`, `TPP_THRESHOLD`) and `lineByScene(lyrics, id)` / `linesByScene`. Our lyric lines carry `scene` ids: tin, laser, machine, tons, line, wafer1-3, crown1-3, grid1-3, down1-3, post1, post2 (two lines each), hbm, smuggle, island, key, shield, fab, atom, dream, crack, whoscrown, hold1, hold2, outro1, outro2. Each word has `start`, `end` and `syl` ([start, end] per sung note), plus `midi` (pitch per note, if you want visuals that follow the melody).
- Music data: `data/audio.json` (beats, downbeats, sections, envelopes rms/low/mid/high/drums/vocal) and `data/events.json` (kick/snare/hat/crash/impact times, riser/gap/tapestop/stutter windows, named sfx). It may still be filling in while music is finalised; fall back to the beat grid.
- Palette (`engine/palette.ts`): signal = **cleanroom amber** `#FFA41B` (C_SIGNAL), ember `#FFD27A`, blood = umber, **C_RED/'red' export red only for RESTRICTED stamps and the TPP threshold**. Bone type never blooms.

## Commands (run from app/)
```
CH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
CHROME_PATH=$CH bun scripts/render.ts stills --t 9.0,9.5 --only <entryId> --out ../build/wip/<id>
CHROME_PATH=$CH bun scripts/render.ts sheet --from A --to B --n 16 --cols 4 --only <entryId> --out ../build/wip/<id>/sheet.png
CHROME_PATH=$CH bun scripts/render.ts video --from A --to B --only <entryId> --samples 1 --out ../build/wip/<id>/clip.mp4 --preset veryfast
python3 -I ../src/motion_qa.py ../build/wip/<id>/clip.mp4     # flags static stretches > 1.2 s
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/<module>
```
Rendering is CPU-only (SwiftShader) and shared by several agents: keep stills few and targeted, use sheets of 12–16 frames, and clips with `--samples 1` at low counts. Look at your PNGs with Read; that is how you see your work. Iterate until it is excellent: at least 2 review rounds per plate. Check the handoff frames into and out of your plate.

## Quality bar (self-check before you finish)
- **Bold:** big type, strong compositions, high contrast, generous negative space. Don't bury the lyric in tiny details; small mono details are seasoning, never the main act.
- **Alive:** something lands every 1–2 beats; camera punches on kicks; no floaty drift; holds only when intentional.
- **Precise:** rendered or engraved (SDF, hatching, hairlines, real lighting), never clip-art. Physically plausible details, with real facts as deadpan footnotes.
- **Karaoke:** each word appears or highlights exactly on its sung time, readable, and integrated graphically (not subtitles).
- **Deterministic:** a pure function of `f.t` (seeded randomness only); performance under about 200 ms per frame on this CPU.
- Final reply (15 lines or fewer): what each plate does (one line each), techniques used, known weaknesses, and the handoff positions you assumed.

## Work in two stages (usage budget is limited)
1. **Stage 1 (do it first, for all your plates):** a complete, working, good-looking version of every plate that typechecks and renders, with its karaoke, its key moves on the right times, and its handoffs. Render one sheet per plate to verify. Don't polish one plate while others don't exist yet.
2. **Stage 2:** polish, in this priority order: the plate's signature move, motion energy, handoffs, then details. Do at most 2 review rounds per plate.

The lead commits your files periodically. Keep the files compiling at all times (prefer small, safe edits).
