# Brief for breakdown agents (Phase 1)

Goal: describe the original video precisely enough that a new video can match or beat its craft. You are studying mexicat/pdoom-video (MIT), cloned at
REF=/tmp/claude-0/-home-user-ai-race-reckoning/80932282-0ae1-5a2e-af84-f9486aaf032b/scratchpad/refs/pdoom-video
Read $REF/docs/TREATMENT.md (the plate list) and $REF/docs/ENGINE.md (the toolbox) first; both are short. Timing data is in $REF/data/lyrics.json and $REF/data/audio.json, and the edit is in $REF/app/src/timeline.ts.

## Rendering the original to see the motion (use it; don't render too much)
```
cd $REF/app && CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome bun scripts/render.ts sheet --from A --to B --n 16 --cols 4 --only <entryId> --out ../out/wip/<you>/<name>.png
CHROME_PATH=... bun scripts/render.ts stills --t 12.5,12.55,12.6 --only <entryId> --out ../out/wip/<you>/x
```
Entry ids are in timeline.ts (open, loss, prompt1, hook1, room, ...). It's CPU-only rendering (SwiftShader, about 1–5 s per frame), so cap yourself at about 6 sheets plus a few stills. For fast moves, render dense stills around the move (for example every 1/30 s for 0.3 s) and tile them with ffmpeg, then Read the image.

## What to write
For each plate in your group, write $OUT/<group>.md (OUT=/home/user/ai-race-reckoning/chip-race-video/docs/breakdown) containing:
1. **Shot list with a precise motion spec.** For each shot or beat-move: time window, what moves, from/to values, duration, the exact easing (name the function from the code, e.g. `ease.outExpo` or a spring), overshoot or hold, what it syncs to (word start, kick, downbeat), camera move (type, path, speed), and the transition in and out (hard cut, whip, match move, morph). Quote the key numbers from the code.
2. **Rendering technique.** How the look is made: shaders (hatching, raymarching, SDF), LineBatch hairlines, Canvas2D layers, text-on-path, stroke fonts, particles, post overrides (bloom, flash, shake, zoom, ca). Be concrete.
3. **Why it's impressive.** The specific craft, timing or wit, in 2–4 bullets.
4. **Reusable techniques.** Name the technique and how to rebuild it (the idea, not pasted code; quote at most a few short lines).

Keep each plate to about 40–80 lines; dense, no filler. Finish by replying with a summary of 10 lines or fewer, plus your top 3 "must steal" techniques.
