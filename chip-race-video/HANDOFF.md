# HANDOFF: Silicon Shield (read this first; everything you need is here)

Goal: finish the full-song code-rendered music video. Branch `ccr-c467948d-jdmj79` (open PR: https://github.com/raycoding1-collab/ai-race-reckoning/pull/13; pushing to the branch updates it, so do not create another PR), project `chip-race-video/`. User-approved scope: MASTERPIECE_PLAN.md (do not re-read the whole plan unless needed).

## Done (don't redo)
- **Song, final:** `audio/silicon_shield.mp3` (142.25 s, 128 BPM, F minor, key lift to G minor at chorus 3). Exact lyric and event timings are in `data/lyrics.json`, `data/audio.json` and `data/events.json`. Don't regenerate audio (Kokoro models aren't in git).
- **Engine:** `app/` (a fork of the MIT mexicat/pdoom-video engine). Timeline: `app/src/timeline.ts` (32 plates). Shared motifs: `app/src/scenes/_motifs.ts` (beam, TPP meter, lineByScene).
- **Design docs:** `docs/STYLE_BIBLE.md`, `docs/STORYBOARD.md` (one row per plate) and `docs/SCENE_BRIEF.md` (rules and render commands).
- **Scenes written (about 10k lines; quality unverified):** sand, tin, laser, machine, tons, line, drop (×3), node1, grid1, grid2, grid3, node2, node3, down2, post2, hbm, smuggle, island, key, atom, dream, crack, whoscrown, hold, plus helper files. Unverified means they may not compile or render.

## Remaining
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
