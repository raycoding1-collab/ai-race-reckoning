# Silicon Shield: masterpiece brief (approved by the user)

Scope: upgrade every part (song, vocals, music, visuals, pipeline) and build the full song as a music video. Use parallel agents. Every scene must use its own distinct animation idea; never reuse one technique to fill time. Budget: the full 5-hour usage window after the reset, and the next one too if needed. Keep quality at maximum and spend tokens efficiently.

## References (study them; never copy code verbatim)
- The video the user sent is mexicat's restyle, source at https://github.com/mexicat/pdoom-video (TypeScript, three.js, bun/Vite; Demucs and Whisper for alignment; headless Chrome and ffmpeg). MIT licence.
- The original is https://github.com/JohnHeibel/PDoomVideo (p5.js and p5.brush). Study its STORYBOARD.md (every transition leads into the next scene), ANIMATION_GUIDE.md (brief for parallel sub-agents) and render.mjs (resumable, multi-worker rendering).
- https://github.com/yihui-dev/awesome-opus5-5-videos: 282 Claude-made videos with their prompts. Pick about 10 relevant standouts.
- Tools to consider: GSAP seekable timelines (HyperFrames: heygen-com/hyperframes), Remotion agent skills. Stay on our deterministic three.js plus `renderAt(t)` renderer unless research shows a clear win.
- The user's upload is at /root/.claude/uploads/80932282-0ae1-5a2e-af84-f9486aaf032b/034b8316-Video-82615.mp4 (it may be gone after a container reset; the repo is the stronger source).

## Phases
1. **Ground truth.** Clone both repos (use the add_repo tool, or git through the proxy) into the scratchpad. Read the scene code and render a few of mexicat's scenes. If the upload still exists, analyse every frame: cuts, a motion-energy curve per shot, whether cuts land on beats, frame strips. Write `chip-race-video/docs/BREAKDOWN.md`: for every shot, its technique, model, camera, easing, sync point and the transition into the next shot.
   - **Precision on motion, not concepts (user's explicit request).** Screenshots of ideas aren't enough. For each shot, capture the animation itself:
     - read the exact keyframes, easing functions, durations, camera paths and shader parameters in mexicat's source;
     - render their scenes at 60 fps and make dense frame strips (every 2nd frame) of each move;
     - measure motion with optical flow (pip `opencv-python-headless`; Farnebäck) to get speed-over-time curves, direction, and acceleration/overshoot shape;
     - compute frame-difference maps to see what moves versus what holds.
     Write a precise "motion spec" per shot: what moves, distance, duration, easing shape, overshoot, beat alignment, and handoff to the next shot.
   - **Find the most impressive moments.** Rank the top 10 most striking parts of the original (for example the TikZ unicorn drawn by a spark, the loss-landscape fly-through, the token-probability terminal, the shoggoth with HUD callouts, the singularity text wrapped around the black hole, the Form 7-B stamp, the P(doom) counter going to NaN, the Regenerate-button ending). Explain exactly why each works (craft, timing, wit) and how Silicon Shield will match or beat that level in its own way.
2. **Survey.** Go through the catalogue and write `docs/TECHNIQUES.md` with ideas and prompt patterns to adopt.
3. **Song v3 (full length).** Write verse 2, a pre-chorus 2, a bridge, a final chorus with a key lift, and an outro, keeping the pilot lyrics; the user previously liked the lines in `suno_prompt.md`. Extend `song.py`. Upgrade the vocals (expressiveness, intelligibility) and the arrangement (each section with its own identity, picture-synced sound design). Verify with loudness per section, a spectrogram, reference matching and pitch accuracy. Research better singing or vocal techniques if useful.
4. **System.** Write `docs/STYLE_BIBLE.md` (palette, type, materials, grain, HUD) and `docs/STORYBOARD.md` (every lyric line: concept, unique technique, sync points, how it transitions into the next scene). Build a shared library (`web/lib/`: renderer and post, type/kinetic, materials, transitions, timeline/kick helpers) and add a motion-energy QA script that flags static stretches. Add parallel render workers (aim for under 10 minutes per full render).
5. **Parallel scene build.** Run one agent per group of scenes. Give each a compact brief: the style bible, its storyboard rows, the library API, and a self-check (render stills at its sync points, run the motion check). Then the main session integrates, reviews contact sheets and strips, and fixes.
6. **Polish and final.** Do a full render, run motion QA, make a review sheet, encode a full-quality file plus a preview under 30 MB, commit, push, and send to the user.

## Token-efficiency rules
- Agents get file paths and short specs, not long pasted context. Agents return only a short summary.
- Review using contact sheets (many frames in one image), not single frames.
- Do mechanical work (frame extraction, encoding) in Bash, not agent reasoning.
- Commit after each phase so a reset or compaction loses nothing.

## Environment notes
- If the container was reset, reinstall: `apt-get install espeak-ng festival festvox-us-slt-hts rubberband-cli sox`; `pip install scipy soundfile pyworld`; `cd chip-race-video && npm install`; Playwright is global (`PW_PATH=$(npm root -g)/playwright`); WebGL needs the SwiftShader flags already in `src/render.mjs`.
- Hugging Face is blocked, so there are no Whisper or Demucs models. Our own song has exact timings, so this doesn't matter.
- Work autonomously. Send the user proactive progress previews (contact sheets, style frames) at each phase. Pause only if blocked.

## Research rule (user's explicit request)
Research online whenever it would improve any part, not only in Phase 2. When a scene, sound or technique feels weak, or when a better method might exist, search before settling. Examples:
- singing and vocal synthesis or vocoders
- mixing and mastering for drama
- three.js techniques (GPU particles, raymarching, refraction, volumetrics, text effects)
- kinetic-typography craft and motion-design principles (easing, anticipation, overlap)
- how top motion designers transition between scenes
- standout Claude-made videos and their prompts.

Note the useful findings and sources in `docs/TECHNIQUES.md`.
