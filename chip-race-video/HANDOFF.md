# HANDOFF: Silicon Shield (read this first; everything you need is here)

Goal: finish the full-song code-rendered music video. Branch `ccr-c467948d-jdmj79` (open PR: https://github.com/raycoding1-collab/ai-race-reckoning/pull/13; pushing to the branch updates it, so do not create another PR), project `chip-race-video/`. User-approved scope: MASTERPIECE_PLAN.md (do not re-read the whole plan unless needed).

## PHASE 2 (current task): upgrade the song's sound
Phase 1 is done: `chip-race-video/silicon_shield.mp4` (1080p30, 2:22, 92 MB) is finished and the user loves the animation. The user now wants the song to sound like music people want to replay. **User's choice (2026-10-10): upgrade the current song in place.** Keep the exact tempo, structure and lyric timing, so the new audio drops into the finished video with **no re-render**.

**Hard constraints**
- `src/song.py` is the single source of truth (BPM 128, SECTIONS, lyrics with a note per syllable). Don't change any timing: every word and syllable onset, section boundary, gap, tape stop and impact stays put. Keep the drum hits (kick, snare, crash, impact) at the same times, because the rendered visuals pulse on them; how they *sound* may change. After a rebuild, `data/lyrics.json` and `data/events.json` must be unchanged (`git diff --stat data/`); `audio.json` may change.
- Length stays 142.25 s. Key: F minor, lifting to G minor at chorus 3. Keep the melody notes (they are in lyrics.json); harmonies and new layers are fine.
- The video is not re-rendered: the last step re-muxes the new audio with `-c:v copy`.

**Pipeline** (README): `pip install numpy scipy soundfile pyworld`, then `python3 src/tts.py && python3 src/sing.py && python3 src/music.py && python3 src/export_timeline.py`. Vocal stems (`audio/*.wav`) and the Kokoro models are not in git. Get the models from GitHub release assets (Hugging Face is blocked); see `docs/TECHNIQUES_music.md` §1 (kokoro-onnx `model-files-v1.0`). Code: `music.py` (arrangement and mix), `synths.py`, `dsp.py` (buses, compressor, limiter, vocoder, sidechain, master chain), `cinema.py` (FX), `sing.py` (TTS → WORLD retime/re-pitch, doubles, gang), `score.py`, `chip.py`. First copy the current mix to `audio/silicon_shield_v1.mp3` and commit it, for A/B.

**What to improve, in priority order.** The recipes are already researched in `docs/TECHNIQUES_music.md` §1–4; don't re-research.
1. **Vocal realism** (§1, "WORLD improvements"): delayed vibrato, overshoot, portamento, scoops and fall-offs, formant tracking on high notes, breathiness, consonant handling, doubles with per-word offsets, a chorus gang, and the vocal chain. A deliberate "synthetic diva" or vocoder sheen on the chorus hooks suits the silicon theme.
2. **Hook and contrast** (§2): the chorus and the "weapon now, oh-oh-oh" post-chorus must be the most memorable part. Add an 8-bit lead doubling the vocal hook, a counter-melody, a thin pre-chorus into a full chorus, and fills and ear candy at section changes, without moving any hit.
3. **Drums and bass**: punchier kick and snare (layering, transient shaping), and a bass sidechained to the kick with saturation so it survives phone speakers.
4. **Mix and master** (§4): balance, EQ, glue compression, reverb and delay sends, stereo width with a mono-safe low end. Target about -9 to -10 LUFS integrated, with true peak at or below -1 dBTP.

**Judging (you can't hear audio):** measure in code. Check integrated LUFS and true peak; per-section loudness (choruses at least 3 LU above verses); spectral balance against a pop-style tilt; vocal f0 against the melody (cents error); stem RMS balance; clipping; and kick onsets against events.json. Use at most 3 downscaled spectrogram images. The user is the ears: send them the MP3 and ask for feedback.

**Deliver**
1. Write the new `audio/silicon_shield.mp3`, keeping v1 alongside.
2. Re-mux with `ffmpeg -i silicon_shield.mp4 -i audio/silicon_shield.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart` into a temp file, then replace `silicon_shield.mp4` (it must stay under 100 MB).
3. Make a preview from the 1080p file: 720p, two-pass, about 1450k video plus 128k audio, under 30 MB, in `build/` (gitignored).
4. SendUserFile the new MP3 and the preview MP4. Tell the user what changed and ask them to listen. Commit, push, schedule nothing.

**Lessons from Phase 1:** tracked background Bash jobs are killed after 2 h. Detached (`setsid nohup`) processes die when the container is reclaimed, which happened while the session sat idle. Keep long jobs under 2 h as tracked background jobs, and make them resumable. ffmpeg is `/usr/bin/ffmpeg`; the machine has 4 CPU cores and no GPU. The user is in UTC+2, so give times in their time zone.

## Done (don't redo)
- **Song, final:** `audio/silicon_shield.mp3` (142.25 s, 128 BPM, F minor, key lift to G minor at chorus 3). Exact lyric and event timings are in `data/lyrics.json`, `data/audio.json` and `data/events.json`. Don't regenerate audio (Kokoro models aren't in git).
- **Engine:** `app/` (a fork of the MIT mexicat/pdoom-video engine). Timeline: `app/src/timeline.ts` (32 plates). Shared motifs: `app/src/scenes/_motifs.ts` (beam, TPP meter, lineByScene).
- **Design docs:** `docs/STYLE_BIBLE.md`, `docs/STORYBOARD.md` (one row per plate) and `docs/SCENE_BRIEF.md` (rules and render commands).
- **Scenes written (about 10k lines; quality unverified):** sand, tin, laser, machine, tons, line, drop (×3), node1, grid1, grid2, grid3, node2, node3, down2, post2, hbm, smuggle, island, key, atom, dream, crack, whoscrown, hold, plus helper files. Unverified means they may not compile or render.

## Remaining (PHASE 1, all done 2026-10-10)
1. Setup on a fresh container:
   ```
   cd chip-race-video/app && bun install || (npm i -g bun@1.2.23 && bun install)
   pip install opencv-python-headless
   ```
   Chrome is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (render.ts already uses the SwiftShader flags).
2. Typecheck: `bunx tsc --noEmit -p tsconfig.json`. Fix compile errors cheaply.
3. **Missing modules:** `down1`, `post1`, `shield`, `fab`, `down3`, `outro` (STORYBOARD rows). Note `shield-grid.ts` and `outro-doc.ts` helpers exist.
4. Render one cut-sheet of the whole timeline (`bun scripts/render.ts sheet --from 0 --to 142 --n 48 --cols 8 --out ../build/all.png`, then downscale it to 1600 px before you Read it) and fix crashes and blank plates.
5. Polish only the weakest 3–4 plates. Priority: the opening (sand, tin, laser) and the drops.
6. Final render, encode, deliver:
   ```
   CHROME_PATH=... bun scripts/render.ts video --samples 4 --workers 2 --out ../silicon_shield.mp4
   ```
   - Try `--fps 30` if render.ts supports it; check `render.ts --help` first.
   - Then encode a preview under 30 MB with ffmpeg and send it with SendUserFile.
   - Commit (the MP4 must stay under 100 MB) and push.

## Token rules (the user hit the 5-hour limit twice; follow these strictly)
- **Agents:** at most one or two sub-agents at a time, never more. Use `model: "sonnet"` for scene coding, `"haiku"` for mechanical tasks (fixing type errors, renames), and the main session for decisions only.
- **Briefs:** give sub-agents short briefs with exact file paths. Don't let them read the reference repo or the breakdown docs unless it's essential.
- **Images:** downscale them before Read (contact sheets ≤1600 px wide, few stills). Image tokens are the biggest cost.
- **Logs:** filter command output (`| tail`, `| grep error`).
- **Commits:** commit and push after every finished step (run `git add -A chip-race-video` first).
- **Before the window ends:** if the work is unfinished when you notice you're near the limit (or after about 4 hours), write progress into this file, commit, and schedule the next fresh session with the `create_trigger` tool (`create_new_session_on_fire: true`, `run_once_at` about 5 h 5 min after this session started), using the same prompt as this one. If the video is finished and delivered, schedule nothing.
- Never buy or use extra usage credits; only use the plan's 5-hour windows.

## Progress log (append here)
- 2026-10-10 10:30 UTC: scenes partially written by 5 agents before the limit. Next: steps 1–6 above.

## How to continue after a window (this overrides the create_trigger instruction above)
Sessions from `create_trigger` with `create_new_session_on_fire` get no repo push access (403). Instead:
1. When near the limit and unfinished, update this file, commit and push.
2. Call `send_later` (it fires into this same session, which keeps push access) with `delay_minutes` set to about 5 h 05 min after this session started. The message: "Usage window reset: start a fresh continuation session with mcp__claude-code-remote__create_session (source_url https://github.com/raycoding1-collab/ai-race-reckoning, source_revision ccr-c467948d-jdmj79, outcome_branch ccr-c467948d-jdmj79, same prompt as yours), then stop."
- 2026-10-10 11:16 UTC (session 2 start): typecheck clean; cut-sheet renders. Missing: down1/post1/down3/shield/fab/outro (agents writing), tons/line are placeholders.

## Hand off when the conversation gets long (user's rule)
Long sessions burn tokens. When your own context gets long (after a compaction, roughly 60–80 tool calls, or many images viewed), append progress to this file, commit and push, then start a fresh session with `mcp__claude-code-remote__create_session` (source_url https://github.com/raycoding1-collab/ai-race-reckoning, source_revision ccr-c467948d-jdmj79, outcome_branch ccr-c467948d-jdmj79) using the same prompt you were given, and stop. Repeat as often as the project needs.
- 11:47 UTC: all 32 plates exist and render; full render running (30fps, samples 1, ~1.5h) -> build/silicon_shield_master.mp4. Next: encode preview <30MB, commit mp4 (<100MB), SendUserFile.
- 14:01 UTC: the full render was killed at its 2 h background-tool limit (frame 3180/4268), and the MP4 can't be recovered (no moov). Now rendering two detached segments (setsid nohup, --noaudio): build/seg1.mp4 (0–106 s) and build/seg2.mp4 (106 s–end); logs are build/seg1.log and build/seg2.log. When both finish: `ffmpeg -f concat` them, mux audio/silicon_shield.mp3 (-shortest), encode a commit copy (<100 MB) and a preview (<30 MB), commit, push, SendUserFile. Never run long renders as tool background jobs (2 h cap); use setsid nohup.
- 14:41 UTC: the container restarted at 14:25 and killed the detached renders. Now using `render_chunks.sh` (resumable 6 s chunks into build/chunks/cNN.mp4, skips finished ones), run as a tracked background Bash job (timeout 7200000) and re-launched when it stops. When all 24 chunks are done: concat them (ffmpeg concat demuxer, -c copy), mux audio/silicon_shield.mp3 (-shortest), make the commit copy (<100 MB) and preview (<30 MB), commit, push, SendUserFile.
- 15:20 UTC: fixed the laser 220,000/LASER overlap and the blue invert flash on the amber drop slams. Chunks c02 and c04 were rendered before the fix: delete them and re-run render_chunks.sh once the rest are done.
- 17:20 UTC: DONE. All 24 chunks rendered; build/master.mp4 (1.1 GB, local only). Committed chip-race-video/silicon_shield.mp4 (1080p30, 92 MB); the 720p preview (28 MB) was sent to the user. Nothing scheduled.
