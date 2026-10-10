# Silicon Shield: techniques survey

Sources read in full or in part: `awesome-opus5-5-videos` (README, `data/videos.json` = 513 entries, ~100
prompts opened), `PDoomVideo` (p5.brush original: README, STORYBOARD, ANIMATION_GUIDE), and `pdoom-video`
(mexicat's three.js restyle: README, `docs/TREATMENT.md`, `docs/ENGINE.md`, `app/src/timeline.ts`). I only had
the prompts and post text, not the videos themselves, so "what's striking" is inferred from the brief or
caption. No web fetches were needed. Claims about EUV physics are from memory and marked (verify) where a
number goes on screen.
Slugs below are prompt files in `awesome-opus5-5-videos/prompts/<slug>.md`; the post URL is on X.

## 1. The picks (12)

1. **Desk to single atom, one shot** (`acoramaa-053577`, x.com/Acoramaa/status/2103833991879053577). Desk, PC case, cooler lifts, CPU lid off, die,
   one core, copper wiring, logic cells, fins and gates, one silicon atom bonded to four neighbours. No cuts. A ruler on the right tracks scale from
   ~1 m to ~2 nm the whole time. Stack: three.js + GLSL, all procedural. Pattern: name every waypoint in order in the prompt, ask for "one continuous
   shot, no cuts", and make a persistent instrument (the ruler) carry the narrative. Directly on-topic for 2 nm.
2. **Phone to atoms in 20 s** (`irinatoxi-962937`, x.com/irinatoxi/status/2104212841657962937). Glass, motherboard, chip, semiconductor structure,
   atomic scale. Three.js + GLSL. Prompt was not published, so the lesson is the brief shape: a 20 s budget, five stations, one dive. Pair with #1 for
   the two ways to do the same dive (we should pick a different route: wafer to fab to EUV).
3. **Cabo da Roca to observable universe** (`kgonia7-746268`, x.com/kgonia7/status/2103835848575746268). Cinematic zoom-out, three.js, "no external
   assets". Cost note: ~3 h, 662k output tokens, $54 API-equivalent, from an older prompt. Lesson: a big procedural film is a ~$50, few-hour job;
   budget for it. The outward zoom is the mirror of #1 (die to Earth to the supply chain).
4. **BUILD THE FLOOR** (`gdgtify-929495`, x.com/Gdgtify/status/2103458245213929495). 20 s kinetic spoken-word film where each word has an
   architectural role (WAIT is a lintel, VOICE a support, the O's counter in ROOM an aperture). Canvas/SVG. Best brief in the set: exact words in
   order, per-second storyboard, "roles must emerge from the actual letterforms", a 400 ms stillness, critically damped settling, `seek(t)` purity,
   `render(0)=render(20)`, and a QUALITY GATE ("inspect eight frames, check reading order, check the final platform is visibly built from earlier
   elements"). The ending reveals the opening frame under full occlusion.
5. **Print-poster bumper** (`techhalla-498547`, x.com/techhalla/status/2103411244468498547). Strict 3-colour palette, three-font type system with
   tracking values, locked message order, a "CONCRETE TECHNIQUES (required)" list, and a long BANNED list. Techniques: per-glyph springs, seeded
   scramble then snap on a 1/16 note, magenta/green misregistration on impact frames only, destination text revealed through the outgoing word's
   outline, beat-only camera punch-ins, 4 subframes blended for motion blur, one still per beat before the full render.
6. **One shape, never cut** (`annacher-433425`, x.com/AnnaCher___/status/2103571096549433425). Every state is the same element morphing size, radius
   and colour; a cursor drives it; last frame equals first. Springs are closed-form step responses, so a value retargeted many times is a sum of
   springs and stays a pure function of time; the two edges of a toggle ride different springs so the leading edge stretches. The prompt ends: "Show
   me the state list on the beat grid before writing any code."
7. **Magic eye that listens** (`acoramaa-248467`, x.com/Acoramaa/status/2104145227573248467). 72 plates, a 9-blade iris, lens that slides out on bass;
   kick flips plates, highs light the core, the breakdown closes the eye and the drop blows it open. Key line: "Opus listened to the track first,
   found the tempo, the breakdown and the drop, and built the whole thing around it." Mechanical iris maps to a lithography shutter/reticle.
8. **Inside an AI data centre** (`mdaman010-111079`, `sayan-shanky-868515`). The whole prompt is one sentence; both are three.js + GLSL. Evidence that
   on-topic subject matter alone gets a decent 3D scene; we should add art direction (see section 2) rather than rely on that.
9. **Music video in PDoomVideo's style** (`doubleunplussed-181894`, x.com/doubleunplussed/status/2103697580421181894). Lineage for this very project.
   Asks for obscure lore references ("especially if obscure"), a rendered video file, choice of tools left open, and shows two feedback rounds (stop
   the character lip-syncing; fix unnatural arms, re-render). Lesson: reference repo plus "use your own taste", then fix concrete defects in short
   follow-ups.
10. **Claude Pop, 9.6k-char brief** (`anabology-491441`, x.com/anabology/status/2103534482930491441). Hook strategy: lyrics huge at the start for
    attention, subtitle-size elsewhere, characters opposite the text; concept audit of current memes; style sheet first; "watch the whole video
    multiple times, screenshot individual parts"; rotoscope idea (generate base footage, then paint over it in JS so only the overlay shows). The
    image/video-gen parts do not apply to us.
11. **Gravitational-lensing lab with a night shift** (`voxyz-ai-345550`, x.com/Voxyz_ai/status/2103117246860345550). One prompt, then three review
    rounds of 3 agents each: two reviewers rank 9-10 issues P0/P1/P2, a third fixes; a design director decides if it ships; backup before each round,
    screenshots after, rollback on failure; disagreements resolved with the reason written down. 5 h 28 m, ~$90.
12. **Autonomous explainer brief** (`astrothewizard-618782`, x.com/AstroTheWizard/status/2103629247751618782). "Work autonomously, make the calls,
    tell me what you decided"; "simulate the real thing" (an actual random walk); real numbers with honest uncertainty; "one strong formal idea per
    scene"; cites Pudding/3Blue1Brown as the bar; verification loops (stills of every scene, transitions frame by frame, audio measured numerically).
Runners-up: `zeezomb-726206` (glass-and-gold-leaf tiles that lift, flip, fly and click back; figures are
flocks of tiles; WebGL2, no libs), `0xsolty-735200` (procedural planet incl. night city lights),
`pound75423-464968` (beat-per-cut edit rules, RGB tear, kaleidoscope, difference-blend bar numerals,
Playwright + ffmpeg), `nathanwilbanks-981110` (GPU fluid fire with blackbody colour, audio derived from the
render, ~40 self-critique loops with a vision model), `alexalbert-274839` (every model traces to a sourced
data file with a confidence level), `aijipusi75693-284735` (Suno song, per-character lyric timing, Remotion +
three.js 3D lyrics), `stokebuilder-356793` (style bible + component kit first; one judge agent, only egregious
fixes go back), `apoorvjain25-309680` (music and visuals read the same beat file).

## 2. (a) Prompt and brief patterns that produce the best results

- **Lock the words, free the pictures.** gdgtify and techhalla fix the copy exactly and in order, then specify what each line does to the frame. For
  us: lock the lyric file and a fact sheet (node names, dates, rule names); never let the model invent numbers ("no invented results" in
  `ik-builds-585923`).
- **Time-coded storyboard in the prompt**, in seconds, one idea per row (gdgtify, brainextends-606193's 0.0-0.6 s, 0.6-1.5 s rows). For music: anchor
  rows to lyric lines and beats, as `pdoom-video/timeline.ts` does (`cut('Sharp left turn')` snaps to the last beat at or before the sung word).
- **Required techniques plus a banned list.** techhalla bans "brains, robots, neural nets, sparkles, glassmorphism, purple/blue neon, particle
  explosions"; TREATMENT.md bans "glowing brains, Matrix rain, lens-flare soup, generic particle nebulae". Our ban list should add: glowing blue
  circuit-board stock look, binary rain, floating holographic HUDs, "AI brain" chips, flag-colour cartoons of China/US.
- **Strict palette, type system and one rare accent.** pdoom: ink/bone/signal-orange, one acid-green accent for ~2 s. techhalla: three hues only. A
  restrained palette is what makes it read as art-directed instead of AI-generated.
- **Determinism as a hard contract.** `seek(t)`/`renderAt(t)` pure function of time, seeded randomness, no accumulated physics, last frame equals
  first for loops. Everything else (parallel rendering, motion blur, stills for QA) depends on it.
- **Self-check built into the brief.** "Render one still per beat first", "inspect eight representative frames", "show me the state list on the beat
  grid before writing any code", "measure audio numerically". Make the QA loop a deliverable, not a hope.
- **Analyse the audio first** (acoramaa eye; gandamu demoscene prompt: "see how to best play and analyze the track ... synchronization is essential";
  pdoom: Demucs stems, CTC alignment, beat/downbeat/section JSON). We own the song, so emit a timing JSON from `song.py` and make every scene read it.
- **Autonomy plus accountability.** "Work until done, make the calls, report what you decided" (astrothewizard), and "a design director decides
  whether it ships" (voxyz). Pair with explicit user taste statements ("not GPT slop", "don't fit too heavily to Pixar").
- **Make the first seconds the thesis.** anabology: "very strong, compelling visual hook". Our user already said the opening must be the strongest
  part; a scale-dive or EUV drop-shot in the first 10 s is the natural hook.
- **Feedback in small, concrete corrections** (doubleunplussed: mouth, arms) beats vague "make it better"; keep a rollback.
- **Humour and lore density** (doubleunplussed, TREATMENT.md "funny the way a straight-faced scientist is funny"): deadpan stamps, footnotes,
  probability bars. Chip-war equivalents: ECCN codes, "licence: DENIED p=0.87", yield percentages, "pellicle" jokes.

## 3. (b) Sixteen distinct visual techniques for Silicon Shield

Each is a different mechanism; assign at most one per scene.
1. **Log-scale dive with a persistent ruler** (#1, #2). One camera path, exponential zoom with each segment's duration proportional to log(zoom)
   (koldo2k-778767), LOD handoffs between procedural layers, ruler ticking m, mm, um, nm, with a mono readout. Use for the "2 nm" verse: wafer, die,
   metal stack, fin, atom.
2. **EUV source as plasma physics.** Instanced tin droplets falling at a fixed rhythm, a pre-pulse flattens the drop, the main pulse flashes it; HDR
   bloom only on the plasma, with a blackbody colour ramp (nathanwilbanks; pdoom `heat(x)`); mirror collector bounce. Droplet/pulse/wavelength figures
   (50k/s, 13.5 nm, ~220 W-class) need verification before they go on screen.
3. **Thin-film / multilayer-mirror iridescence shader.** Angle-dependent hue from interference on the Mo/Si stack; same shader reused on wafer sheen.
   A distinct "expensive material" look without textures.
4. **Tile-flock wafer** (zeezomb). A wafer made of 10k+ instanced dies that lift, flip, swarm into a silhouette (Taiwan, a flag-less "fab" outline, a
   datacenter) and click back; yield map flips dies green/red on the beat. Instanced quads with a pure-function-of-time flock.
5. **Export-control globe of severed arcs.** GPU capsule `LineBatch` great-circle arcs between fabs and customers (pdoom `lines.ts` handles 10k-200k
   segments); on "controls" the arcs snap, retract with a spark, and reroute via third countries.
6. **Glyph-as-architecture type** (gdgtify). Words with roles: NODE sits on fins, the O counter of "2 nm" becomes an aperture the next scene is seen
   through, "SHIELD" is built from earlier words. opentype.js glyph paths already in our deps.
7. **Mask-through-outgoing-word wipe + overlay-error print offset** (techhalla). Exit word's outline reveals the next; on impact frames a 2-4 px
   misregistration of two ink layers, which doubles as the lithography "overlay error" joke (readout "OVERLAY 3.1 nm" then re-aligns).
8. **Next-token distribution prompt** (pdoom `prompt`). Lines typed as tokens with candidate bars: "Who ships the machine? ASML 0.97 / Nikon 0.02 /
   Canon 0.01"; ⏎ launches the chorus. Policy as a language model is on theme.
9. **Raymarched engraving / hatch material** (pdoom `hatch`, `engrave`). Die shot and wafer in banknote-style line shading with one orange rim light;
   strongly distinct from everything glossy elsewhere.
10. **Datacenter aisle flight.** Instanced racks to a vanishing point, LED texture blinking on beat, cold-aisle haze; cut to a top-down grid of 100k
    cells flickering in waves with a mono counter (pdoom `dense-gpu`). Power meter as a rising odometer.
11. **Audio-reactive iris / reticle blades** (acoramaa eye). Blades open on kick, a lens extends on bass, the whole mechanism closes in the breakdown;
    reads as a lithography shutter and as a surveillance eye.
12. **One-shape closed-form spring morph chain** (annacher). A single wafer disc becomes a coin, a globe, a chip package, a rack floor; matched edges
    so no cut is needed; springs summed analytically.
13. **Diffraction / moiré grating shader.** Two line gratings at pitches near the resolution limit produce interference fringes; sweeping the pitch
    shows why 193 nm cannot print what 13.5 nm can. Pure fragment shader, cheap, abstract, very different look.
14. **Droste / recursion** (pdoom `loom`/`stack`). Chiplet inside package inside server inside datacenter inside a chip; continuous zoom with the same
    frame returning, for the "chips design chips" line.
15. **Bureaucratic forms and stamps on inverted bone paper** (pdoom `bureau`). Export licence form, ECCN field typed as sung, DENIED stamp slams with
    shake. Gives a light/dark rhythm against the dark 3D scenes.
16. **Log-chart with camera that tilts up an exponential** (pdoom `ascent`: hatched candles, odometer of 31 digit drums). Moore's-law dots drawn by a
    spark, camera follows the slope, ends in a FLOP/s odometer that overflows. Add honest uncertainty bands (astrothewizard).
Cross-cutting render tech: N-subframe motion blur averaged over a 0.2 shutter (pdoom ENGINE: adaptive
12/36/108/324), HDR linear target with bloom only above 0.85, `frameIdx(t)` for per-frame flicker, film grain,
Archivo width/weight animation for emphasis (62-125 width, 300-900 weight), single-stroke plotter fonts for
text a pen writes.

## 4. (c) PDoomVideo multi-agent workflow lessons

How the p5.brush original is organised:
- **Two documents, two jobs.** `STORYBOARD.md` (what happens) and `ANIMATION_GUIDE.md` (how to write code). The README says both were written by Opus:
  the storyboard after a first full generation, when told to use brushstrokes, make each scene interesting and make every scene transition into the
  next; the guide to brief its own parallel subagents. The human gave two directions only: use the Clawd design, give each lyric interesting visuals
  and transitions. Everything else, including scene ideas, was model-generated; the first generation (`legacy/`) was a draft that the storyboard then
  improved.
- **Storyboard structure.** One-paragraph idea with a twist ending (the apocalypse was a play), a "rule for every shot" (something must happen), a
  text-light rule, a cast table, "what ties it together" (sets not cards, motivated transitions, emotion morphs, a camera move per shot, a palette
  arc), then one table per chapter with columns Time | Lyric | Shot | **Out**. The Out column is the linked-transition mechanism: every row names the
  handoff to the next (chomp to black, mouth-shaped iris, rocket tilt, black hole, heart bubble pop, falling, SLAM to darkness). Chapter heads carry a
  palette. Choruses return to one stage that escalates (party, pyro, flood, red alarm); a meter prop (8, 34, 61, 86, 99.9) is the through-line; the
  finale recontextualises earlier sets.
- **Guide structure.** Context and user direction quote; chapter file layout (one IIFE per file, `chapter(name,start,end,shots)`, shot signature
  `fn(t, lt, dur)`); purity rules (frames render in parallel and out of order, so no state, no `Math.random`, use `hash(i)` and a `jit` that reseeds
  12x/s for boiling linework); file-ownership rules (edit only your own chapter; shared files listed; report shared bugs, don't edit); canvas facts
  and safe areas; API tables; character and prop APIs with a size guide; style rules (look, colour, motion on beat, readability, perf budget <= 2.5
  s/frame); a checking recipe (contact sheet command, then "look carefully": first and last frame of every shot, motion across 0.1 s steps,
  transitions in and out, nothing under the karaoke band).
- **mexicat's three.js restyle adds** a treatment doc with a plate table that has an owner column (A1..A8, B1, lead), a per-plate "revision N" log
  recording client feedback (realistic eyes removed as uncanny; ultramarine plate retired; FIG captions dropped; crop-mark frame only at the bookends
  so the video loops), a list of recurring motifs (the spark, the mask, the prompt, the hook slam, a staged value readout), and `ENGINE.md` with the
  scene contract (`render(f, out)` pure of `f.t`, HDR target, post overrides, perf <25 ms, "don't edit outside your scene files; ask the lead"). Scene
  windows are derived from the aligned lyrics, never hard-coded.

What to copy:
1. Write the **linked-transition storyboard** first, with an Out column, and give every scene its own named technique so no mechanism repeats (matches
   our MASTERPIECE_PLAN rule).
2. Give agents a **compact engine/API guide plus ownership rules** (own file only, shared files read-only, report bugs). Keep agent returns to a short
   summary.
3. Make scenes **pure functions of time** so agents can render stills independently and the lead can render frames in parallel.
4. Use **recurring motifs** to tie unrelated techniques together (a spark or a bright "node" line that travels through every scene; a staged number
   such as nm or FLOP/s that steps down or up each chorus).
5. Keep a **palette arc and a light/dark rhythm**, and one rare accent owned by a single moment.
6. **Escalating returns**: the hook scene reappears four times with a different look each time (clean, heavy, hairline-quiet, maximal).
7. **Revision log per scene** with the reason (what the viewer disliked), so later agents do not reintroduce it.
8. Review by **contact sheets and stills at sync points**, with `--only <scene>` isolation so a broken scene does not block others.
9. **Lyric-anchored timeline** (`cut('text')` snapped to beats) so re-timing the song only needs a data refresh.
10. Add what the originals lack: a final **judge pass** (voxyz design director), and a **cost/time budget** per scene (kgonia: ~$50 for a big
    procedural film).

