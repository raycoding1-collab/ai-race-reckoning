# ANIMATION SCRIPT: the reference music video ("P(doom)", mexicat restyle), time-coded

Evidence base: all 40 contact sheets (313 keyframes), `build/perceive/ref/report.md` (84 shots), 10 full-size keyframes, and `docs/breakdown/*.md` (source analysis) used only to name techniques and recover exact easings. Nothing here is copied from our own video's plan.

## 0. How to read this

- **Time axis** = video time (frame/30). Accuracy is +-0.04 s (one frame). Where an event time came from the source code (song time) it agrees with the video within that tolerance.
- **bar.beat** = report grid: 132 BPM, beat 0.4545 s, bar 1.818 s, bar 1.1 = 0.27 s. A shot's bar.beat is its first frame.
- **(src)** = detail taken from the source breakdown that the sampled keyframes cannot show (long shots with few keyframes). Everything without (src) was seen on a sheet or keyframe or measured in the report.
- **Technique tags**: [RM] raymarched SDF, [L3D] 3D hairline line-art (CPU-projected or depth-tested LineBatch), [MESH] mesh + custom shader, [FS] fullscreen analytic shader, [LENS] lens/warp shader, [C2D] Canvas2D layer, [PART] particles (stateless, hashed).
- **WOW**: 5 = signature (would be in a trailer), 4 = standout, 3 = strong craft, 2 = connective, 1 = utility.
- The reference file is a portrait 720x1280 capture of a 16:9 film; analysis used the 660x372 content window. Native design size is 1920x1080.
- 84 shots map onto **52 entries (E01-E52)**; the index at the end lists every shot id.

### 0.1 Edit rhythm (measured)
84 shots, 72 hard cuts + 11 soft transitions, 31.8 boundaries/min. Median shot 1.12 s, mean 1.87 s, p10-p90 0.20-4.35 s, longest 12.97 s, shortest 0.10 s. 65% of hard cuts land within 50 ms of a beat (chance 22%), 26% on a downbeat (chance 5%), 79% on an 8th-note position. Camera mix by frames: static 18%, zoom-in 35%, zoom-out 17%, pan 19%, rotate 12%. Text is on screen 69% of the time (200 distinct strings). Mean luma 49/255; 38% of frames are dark (<25), 9% bright (>180). The edit is **bimodal**: long worlds (5-13 s: shots 8, 20, 27, 40, 42, 43, 77) alternate with **burst slams** of 0.1-0.4 s shots at every hook (shots 9-12, 28-32, 53-59) and the finale (78-84). Energy ladder: breakdowns < 1.5 px/frame, verses 2-5, hooks 8-27.

### 0.2 Song map (132 BPM, Eb major, 156.7 s, 86 bars) and what plays where
| time | lyric (as on screen) | plate |
|---|---|---|
| 0.3-9.3 | I see sparks of AGI in your eyes / Your circuits make me nervous, that's no surprise | open (E02-E03) |
| 9.3-16.6 | There was a sudden drop in your training loss, / Now I'm your servant and you're my boss | loss (E04-E06) |
| 16.6-22.5 | ChatGPT, please don't eat me alive | prompt 1 (E07) |
| 22.5-24.1 | I'm upping my P(doom) | hook 1 (E08) |
| 24.1-29.9 | 'Cause the future goes FOOM / Trapped in the Chinese room, / with a bag of shrooms | room (E09-E11) |
| 29.9-38.4 | See through the shoggoth's lies, / with your shinigami eyes | shoggoth (E12-E13) |
| 38.4-52.5 | We had a stable trajectory, but now the singularity's begun / And you're optimizing, accelerating, / I feel my atoms rearranging | spacetime (E14-E18) |
| 52.5-60.2 | Sydney, please [..] me free; I'm upping my P(doom) | prompt 2, hook 2 (E19-E20) |
| 60.2-69.8 | I hear the basilisk boom / NVDA to the moon / The Omega Point's coming soon / One E thirty FLOPs a second | ascent (E21-E25) |
| 69.8-88.9 | That was safe enough, [we] reckoned... Forward, MLP, backward, repeat / Now von Neumann's obsolete / Sharp left turn, and there you are / Without a single CDR | bureau, leftturn (E26-E28) |
| 88.9-96.6 | Gato, please don't let me go; I'm upping my P(doom) (whispered) | prompt 3, hook 3 (E29) |
| 96.6-109.8 | As paperclips fill the room / Killswitch guy's on PTO / Now there's nowhere left to go / Too late now, we lit the fuse / Orthogonality thesis blues | paperclips, fuse (E30-E31) |
| 109.8-124.3 | Just transformers all the way, till you learned to disobey / Post-Chinchilla, super-dense, breaking through each safety fence / Hundred thousand GPU / RLHF goes askew | stack, dense (E32-E38) |
| 124.3-126.1 | I'm upping my P(doom) | hook 4 (E39) |
| 126.1-140.2 | Just as foretold by Loom / from masked pre-training days / to recursive self-upgrade / What did Ilya see? We'll never know. / Was it all for show? | loom, ilya (E40-E45) |
| 140.2-156.7 | (instrumental) P(doom) climbs to infinity, NaN, Regenerate, rewind | outro (E46-E52) |

Audio facts that the picture exploits: LUFS -18.9 (verse 1) rising to -12.1 (final chorus); a -4.2 dB drop at 89.4 (post-chorus 2, the quiet breakdown E29), then a +5.2 dB jump at 109.4 (chorus 4, E32). Drums stop on the downbeat at 152.96 (E51).

---

## 1. Time-coded script

### E01 · 0.00-0.27 · bar 1.1 · shot 1 · Pre-roll black · WOW 1
- **Screen**: pure black (luma 8) with four tiny crop-mark ticks at the frame corners (the only HUD).
- **Camera**: pre-set rolled 19.5 deg (0.34 rad) at 560 px/unit, held until the first downbeat (src).
- **Idea**: the black is the setup and the loop point: the last frame of the film (E52) is this frame.
- **Out**: hard cut on the downbeat (-5 ms).

### E02 · 0.27-4.77 · 1.1 -> 3.3 · shot 2 · "I see sparks of AGI": a spark plots a TikZ unicorn · WOW 5
- **Lyric/idea**: "sparks of AGI" is the GPT-4 "draw a unicorn in TikZ" test. The spark is literally the plotter pen; a TikZ listing at top-left (`rectangle ++(0.32,-1.68); ellipse; % tail / % neck / % mane / % horn / 7 turns`) lights up line by line as each primitive is plotted.
- **Screen / sequence**: dark graph-paper sheet (minor 0.25 / major 1.0 grid revealed by an orange wavefront).
  - 0.27 (1.1) ignition: one point shoots four axes (outExpo, 0.55 s) with tick labels (-3..3, "(0,0)") appearing exactly as the head passes, eight dashed 30-degree rays and a shockwave ring (#2, #3).
  - 0.7-1.1 compass sweep (circle r=2, protractor ticks every 5 deg), 1.15 bounding box 4x2 with foci and dimension marks (src).
  - 1.3-2.0 whip onto the lyric's first glyph "I": it is a rectangle, so the pen draws it as one, with baseline / cap-height rules, LSB/RSB, `U+0049 LATIN CAPITAL LETTER I` (src; it returns at the loop end, #311).
  - 2.06 (2.1 downbeat) 4x pull-back reveals the ellipse body (#4: ellipse with dimension marks, title block bottom-right: TITLE unicorn (exp. 1) / DRAWN the model / CHECKED - / SCALE 1:1).
  - 2.5-3.4 four legs (one per 16th), tail, neck + head + ear (angle arc 63 deg), mane as three cubic beziers with control handles: a drum fill of drawing events (src).
  - 3.68 (on the "A" of AGI): horn stab + 110-spark burst; camera snaps with 3.7 deg roll; "I see sparks of" in white, **AGI** in huge orange (2.45 em) with the three letters popping on the three sung syllables (3.68 / 4.06 / 4.36), each firing a horn spark burst; "sparks" throws 16 sparks per glyph (#5-#7).
- **Objects**: 2D world (not 3D): GPU capsule hairlines (additive), plotter model where each mark is {points, t0, t1, ease}; the spark head and its hot-to-cool trail are computed from the same data, so pen and drawing never drift. Graph paper is one analytic fullscreen shader. [C2D + FS + PART]
- **Look / light**: light-on-ink only. Heat ramp white-hot head -> signal orange -> bone. Bloom 0.72. The sheet is lit only by the pen.
- **Camera**: ONE continuous 2D camera with ~23 keys (log-space zoom about the move's fixed point, outExpo snaps on beats, small roll keys 0.02-0.07 rad). Report: pan down-left 2.9%/s, rot -10 deg; punches at 2.13 s (zoom-out, +43 ms) and 3.67 s (zoom-in, on AGI).
- **Text**: karaoke wipe left-to-right, hot orange cooling to bone; the "I" fills bottom-up like a rectangle.
- **In/Out**: in = hard cut from black. Out = the "dissolve 9f" flagged at 4.63-4.93 is really a camera whip inside the same scene.

### E03 · 4.77-9.33 · 3.3 -> 6.1 · shot 3 · "...in your eyes / Your circuits make me nervous, that's no surprise" · WOW 4
- **Idea**: the unicorn is re-expressed in a second drafting language (pen plot -> PCB) and then "retrained"; the lyric words become actions.
- **Sequence**:
  - 4.8-5.3 "in your": camera dives onto the unicorn's eye (z 244 -> 372 in 0.48 s); "eyes" = the pen fills a disc r=0.08 with crosshair, leader and `r = 0.08` label (#9, #10).
  - 5.88 "Your": 3.7x snap-out in 0.34 s (src). 5.99 "circuits": the whole drawing re-routes into **octilinear PCB traces**: three parallel copper tracks per limb, 45-degree runs, vias at ends, current pulses on 8ths (#11-#12: the unicorn drawn as orange/white circuit traces, right-hand text "Your circuits / make me / nervous,").
  - Bottom-left mono table `ckpt | step | legs | P(doom)` types in. 6.15 / 6.60 checkpoints 2 and 3: geometry **morphs from crude (ellipse + rectangles) to refined (spline body, hooves, three manes)**; checkpoint 2 deliberately has a **fifth leg** (row `2 | 4,000 | 5 | 0.02`): the joke is early-training pony (src).
  - 7.04 "nervous,": a tremor envelope jitters every line (5 px), every glyph of "nervous" (10 px), camera shake 12 px and chromatic aberration; a polygraph trace is drawn under the table (src).
  - 7.72 "that's": camera whips 7 units sideways (outExpo 0.37 s), text column swaps sides ("that's no / surprise", #13). 8.5 "surprise": pen types `surprisal  -log p = 4.61 nats` and the number rolls down to `0.00 nats` (the model is no longer surprised; shown at 0.18 in #13).
  - 8.4-9.33 exit: sheet fades to black, crop marks fly out; the pen travels to the exact screen spot where E04's spark starts (#14).
- **Objects**: 2D LineBatch; octilinear router (resample 0.24 u, snap to 0.08 grid); deterministic geometry morph. [C2D + PART]
- **Camera**: report pan up-right 15.4%/s. **Text**: Archivo for the lyric, mono for the table and callouts.
- **In/Out**: in = whip within the scene; out = match-cut through black (spark position carried).

### E04 · 9.33-11.20 · 6.1 -> 7.1 · shot 4 · "There was a sudden drop in your training loss": the loss chart · WOW 3
- **Screen**: black with one spark (#14-#15), then a hairline log chart draws itself: y axis `LOSS (LOG)` with decade ticks, x axis `STEP ->` 0-35k, mono header `train/loss run: you-and-me-v2 smoothing: 0`, dashed graphite decade gridlines (#16). The spark draws a noisy loss curve (exponential decay + three noise octaves + a spike at "sudden"); the spark's x is the karaoke write-head and **the lyric is set glyph by glyph ON the curve** ("There was a s...", rotated to the local slope, hot ember to bone).
- **3D note**: the chart is geometry at z=0 in a perspective scene (fov 30, camera z 21.5 -> 18, slow dolly and sway), so the next move is a real camera move (src).
- **Beat**: 10.24 push-in (outExpo 0.4 s) one beat before "sudden"; shake 7 px on "sudden". 10.66 "drop": the curve falls off a cliff, the spark free-falls (gravity solved to land at 11.175), the x axis **tears open** and a dashed axis continues below with decades 1e-3...1e-9; "drop" is set upright down the cliff; deadpan callouts `grokking (?)` and `delta-loss -99.9999%` (src).
- **Camera**: zoom-in +22.7%/s (x1.48) with pan up-left 14%/s. In = tone-cut (-30 ms). Out = camera falls out through the chart floor into E05 (no cut).

### E05 · 11.20-12.97 · 7.1 -> 8.1 · shots 5-6 · the fall into the loss landscape; "in your training loss," along the canyon · WOW 5
- **Screen**: the chart's floor has become a **terrain** (#17-#24): white contour lines (index contours labelled `1e-6 / 1e-7 / 1e-8`, `local min.`), hachure ticks on slopes, illuminated contours (lines brighter where the slope faces the light), fog, and a deep drain/pit. The spark falls as a vertical orange streak (#17-#19) and lands on "in" (11.18): shake 12 px, flash, a ripple ring races across the contours. The camera orbits down a meandering canyon while **"in your training loss," stands in perspective on the canyon floor**, each glyph scaled and rotated along the projected centreline, appearing as sung (#20-#23, italic heavy, orange hot to white); the spark runs down with an SGD zig-zag trail.
- **Objects**: terrain mesh 44x42 units, 640x720 segments (~0.9M triangles) displaced in the vertex shader by an analytic height (sin-sum hills + meandering canyon + bowl + 1/r pit); the **same height function runs on the CPU** for camera, spark and canyon centreline; contour fragment shader with fwidth AA and density fade (anti-moire), labels placed on contours by Newton projection; two labels read `P(doom) 0.0x`. [MESH + FS]
- **Camera**: report zoom-in x1.95 + pan left 44%/s + rot -9 deg in 1.6 s (motion energy 1.89, violent); shot 5 is a 0.17 s whip artefact. Out = hard cut on the downbeat 12.97 (8.1, -33 ms).
- **Why**: a graph becomes a world with no cut; the chart's log axis is the terrain's vertical scale.

### E06 · 12.97-16.63 · 8.1 -> 10.1 · shot 7 · "Now I'm your servant and you're my boss": the basin and the 180-degree flip · WOW 4
- **Screen**: oblique view into the basin: ~14 concentric contour rings around a dark pit, labels `sharp minimum (generalizes poorly)` and `P(doom) 0.03/0.04` (#24-#27). The spark spirals three turns down the drain with accelerating pitch. Mono `NOW I'M YOUR` types in, then **SERVANT** slams in huge (Archivo wide 900, ~250 px, letters outline then fill per glyph). `AND YOU'RE MY` and **BOSS** are drawn in a context rotated pi (upside down).
- **15.69 (9.3)**: the world **rolls 180 degrees** (inOutCubic, 0.45 s): the 3D camera roll and the 2D type layer rotate together so BOSS ends upright on top and SERVANT ends upside down below, condensed and dimmed (#28-#31). Simultaneous dive: camera distance 13.3 -> 1.6, pitch to 81 deg, fov 34 -> 64 so the rings stream outward; vignette, CA 1.2 -> 4.7, beat pulses on contour levels go from quarters to 16ths.
- **Camera**: report zoom x1.10, rot +28 deg. Out = hard cut 16.63 (10.1) into a tunnel (the dive ends at the vanishing point).
- **Joke**: the power inversion is authored as a page flip.

### E07 · 16.63-22.47 · 10.1 -> 13.2 · shot 8 · "ChatGPT, please don't eat me alive": the plea typed as LLM tokens · WOW 4
- **Screen**: an engraved **throat/tunnel** (concentric cartilage ridges and short longitudinal folds, headlamp fog, ember glow at the vanishing point) with a prompt field over it (#32-#34): ink slot, bone hairline, corner ticks, `>` caret, mono 60 px. Text is typed **token by token on sung syllables** (`Chat | G | P | T,`), each token bracketed with a fake 4-digit id. Each token has a **next-token probability popup** that flickers "computing..." 0.16 s before the token lands, then flashes the sampled row (#32: `Chat / Claude / Siri / Mom` with bars). Jokes: `Chat .61 / Claude .12 / Siri .04 / Mom .02`; `eat .44 / delete .21 / train on .18 / rate .05`; `alive .52 / first .18 / gently .11`; at "don't" the **sampled token is not the argmax** (src). Fine print: `PROMPT 01`, `T 0.7 . top-p 0.95`, `P(doom) 0.04 . context-dependent`, `CONTEXT 08 / 8192`, `send (irreversible)`.
- **20.27 "eat"**: a contraction wave travels down the throat toward the camera (swallow). **22.06 (13.1)** the return-key press lands on the chorus downbeat; the field is swallowed (zoom -93%, rotation, 8-tap radial blur, camera rush, bloom +0.8, CA +5) and the frame **whites out** in an orange sun with radial rays (#35-#37).
- **Camera**: five hard cuts on sung words (zoom 2.7 on the caret, 2.25, 1.5 on "please", 2.0 on "eat", 1.08 on the whole field) with slow creep and a 1.2% kick per token. Report zoom-in x2.41.
- **Objects**: fullscreen polar shader (no mesh), z = 0.5/R tunnel mapping, anti-moire hairlines. [FS + C2D]
- **Out**: the white-out becomes E08's bone background.

### E08 · 22.47-24.10 · 13.2 -> 14.1 · shots 9-12 · HOOK 1 "I'M / UPPING / MY / P(DOOM)" 0.02 -> 0.15 · WOW 4
- **Screen**: four word slams on the sung word starts, 0.60 / 0.60 / 0.23 / 0.20 s shots (#37-#47). I'M (Archivo 900, width-fit, black on bone), UPPING (wide; letters rise from below the frame with y-stretch from velocity and four ghost outline trails, #42), MY (ultra-condensed, 1300+ px, #43-#44), P(DOOM) typeset as maths (bold italic P, light stretched parens, heavy DOOM dim until sung, #46).
- **Slam recipe**: scale 1 + 0.16(1 - outExpo(t/0.16)), held word keeps creeping +3.5%/s, **2 frames of background/ink inversion** on every word start (#39 vs #40, #43 vs #44), shake 7-13 px, zoom pulse. Type-specimen furniture: baseline and cap-height rules, legend `01 I'M 02 UPPING 03 MY 04 P(DOOM)`, `HOOK 1 / 4`.
- **The number**: at DOOM (23.87) a giant orange mono `0.15` takes the frame (#47) as an **odometer**: each digit is a drum with carry; fast drums draw four smeared copies; bar with ticks along the bottom; footnote `delta +0.13 . posterior . updated on one (1) chatbot` (src).
- **Exit**: at 24.10 the whole instrument scales to zero about a point and a spark grows there; P(DOOM) bursts out of the spark as a hairline outline (#48) that the next scene shatters.
- **In/Out**: in = whiteout carry; out = spark hand-off. Burst entry offsets all within +-80 ms of a beat.

### E09 · 24.10-26.17 · 14.1 -> 15.2 · shot 13 · "'Cause the future goes FOOM": exponential branching · WOW 4
- **Screen**: the P(DOOM) outline shatters at "'cause" (24.32): ~38 px segments fly radially (900-1400 px/s, drag, spin), white-hot to bone. A spark stroke at centre starts **branching: a new generation every 8th, each branch splits in two** (+-0.95 rad), accelerating to 16ths after FOOM; a mono counter top-right `BRANCHES` doubles (0008, 0064, 0256 in #49-#52). Lyric top-left: `'CAUSE THE FUTURE GOES` (GOES grey, #49-#52).
- **25.58 FOOM** (15.1, -146 ms): the word's Archivo width steps 62 -> 125 **one step per 16th**; its two O's are drawn **hollow as strokes** and each emits an analytic **shockwave ring** per 16th that pushes tree vertices outward (#50-#53: two overlapping orange rings, rings radiating, tree lines at the corners); FOOM grows 900 -> 2300 px until it overflows the frame; shake 16 px, CA +2.5, exposure +0.9. Pull-back zoom 1.75 -> 0.72 exponentially keeps the growth front at the frame edge.
- **26.0-26.15**: exposure += 5 burn-out to white into the cut.
- **Objects**: 2D hairline tree. [C2D + PART]. Camera: report zoom x2.30. In = cut +192 ms (on an off-beat 8th, the word "cause").

### E10 · 26.17-28.00 · 15.2 -> 16.2 · shot 14 · "Trapped in the Chinese room,": crash through the door into a hairline library · WOW 4
- **Screen**: first frame is a **dutch-angled (roll -0.5 rad) crash through a door** (#54): door panel blown ahead on a falling arc, two blast rings (120 segments, 220 -> 2720 px in 0.42 s), room lights flicker at 30 Hz. Then (#55-#57) a 12 x 6 x 4 m aisle of **white wireframe shelving with individual books** (translucent box outlines), ceiling fluorescent panels, grid floor, a desk with an `IN` slot and an `EXIT` door, and a black **flip-board** on the back wall onto which the lyric is stamped glyph by glyph: orange `TRAPPED`, then `TRAPPED IN THE / CHINESE ROOM,` (each stamp: outExpo 0.12 s, 0.45 m lift, scale 1.7 -> 1, 22 splinters).
- **Camera = "crash-dolly cut on every beat"**: 26.15 B1 crash (roll -0.5 -> -0.02 on an underdamped spring, f 520 -> 900); 26.60 B2 snap right/dutch; 27.06 B3 low hero angle; 27.51 (16.1) B4 punch-in on the board. Every cut is an outExpo whip (0.09-0.16 s) from the previous pose, plus damped roll wobble; fake motion blur by redrawing older copies at falling alpha. Report: zoom-in x6.33 + rot +32 deg in 1.83 s.
- **Objects**: [L3D] ~40k segments projected on the CPU with a hand-rolled pinhole camera, `max`-blend so overlaps never double-brighten, alpha fading with depth, near-clip against the flip-board plane. **No shaded surface at all**: depth reads from line density alone. The only warm light is a blood-orange pool at the slot.
- **Idea**: a Chinese Room (symbol shuffling) staged as a library with a mail slot.

### E11 · 28.00-29.93 · 16.2 -> 17.2 · shots 15-17 · "with a bag of SHROOMS": bag drop, mycelium, acid trip · WOW 3
- **Screen**: the board flips on its axle; `WITH` appears orange with motion smear (#59-#60); the camera whips up into a high orbit with roll to -1.15 rad (`WITH A BAG`, `WITH A BAG OF` on the tilted board, #60-#63). 28.87 (16.4) the bag lands on the beat (squash 18%, bounce, 48 acid-coloured particles; shake 14 px). Yellow-green **mycelium** lines grow across the floor in beat bursts with mushrooms popping on 16ths (#64-#66).
- **SHROOMS** (29.12): acid-yellow Archivo, letters wobbling under a screen-space sine warp with three trailing echoes (the "trip"), CA and bloom up (#64-#67). 29.22-29.78 the word tears off the board: each glyph's affine lerps from the board plane to a fixed screen layout so the next shot starts on the same pixels (#67: yellow SHROOMS on black with a white disc entering).
- **Camera**: shot 15 zoom-out + rot -12 deg; shot 16 (0.9 s) zoom-out x0.82 + rot -27 deg; shot 17 (0.13 s) is the hand-off. **Colour**: acid yellow is used only here.
- **Objects**: same [L3D] room plus growing polyline mycelium and 3D flip-board text via per-glyph plane affines.

### E12 · 29.93-32.97 · 17.2 -> 19.1 · shots 18-19 · "See through the shoggoth's lies,": the smiley mask and the X-ray bands · WOW 4
- **Screen**: a bone-white **mask disc** fills the frame (engraved dome hatch, two eyes, a smile; "see through the" printed small on its forehead, #68-#70). **X-ray band 1** sweeps right to left over "through ... the": inside the band the mask is transparent and an engraved tangled creature shows (#69, orange band edge, scanlines, HUD `XR 063% / SEE-THROUGH MODE` (src)). **Band 2** (30.58 "shoggoth's", #71-#72) sweeps left to right and **its leading edge is the karaoke cursor** of the engraved word `SHOGGOTH'S` sitting behind the mask.
- **31.14 "lies,"**: a tentacle yanks the mask away (outExpo 0.5 s), the camera pulls back to reveal the body (#73 is a 1-frame flash), `SHOGGOTH'S / LIES,` is stamped in (scale 1.55 -> 1) and then **steps its Archivo width one step per beat (62 -> 125)** (#73-#77, orange to bone as sung).
- **Camera**: parked 0.95 units in front of the mask with sway, then outExpo pull-back; report wipe 11f (+73 ms) and zoom-out x0.85.
- **Objects**: mask = analytic disc; creature see E13. The smiley is the film's recurring "RLHF mask".

### E13 · 32.97-38.43 · 19.1 -> 22.1 · shot 20 · "with your shinigami eyes": twelve eyes with lifespans, then a flatline · WOW 5
- **Screen** (#77-#81): the **shoggoth**: a fused mass of knotted tubes, tentacles and lumps drawn as dense **white engraved hatch lines on black**, orange re-inked on the back-lit rim, a long whip-tentacle trailing left. 32.96 (19.1) hard reframe to a low angle from the left; 33.40 "with" frontal slow push; the smiley mask sits upper right in a HUD frame. **Twelve eye pods open on 8ths then 16ths** (spring overshoot to 1.15, pupil darts then follows the camera). Each eye gets an orange detection box with a name and confidence (`SYCOPHANCY 0.91`, `GOAL: ??? 0.51`, `HELPFULNESS (SIMULATED) 0.99`) and a lifespan timer `t-00:02.30`. Four left-margin tags `WITH / YOUR / SHINIGAMI / EYES` (mono 600, 50-100 px) have L-shaped leader lines to live-projected eye positions (#79, keyframe verified).
- **36.14-37.96** the eyes close in an **accelerating sequence** (gaps between closings shrink 1, 1, 0.5, 0.5, 0.25... beats), each tag reads `t-00:00.00 EXPIRED`; the big central eye closes last exactly on 37.96. A P(doom) readout is itself detected as `NOT A CONFIDENCE SCORE` (src).
- **37.96-38.4 flatline**: the picture squashes vertically to a 1-px white-hot line (#80 flat side view, #81 the line) = hand-off to E14.
- **Objects** [RM]: half-res G-buffer (960x540, two targets), 96-step sphere trace of: core sphere with fold lines + four torus-knot tubes ((2,3), (3,2), (2,5), (3,7)) + 8 bent tapered tentacles + 12 eye pods with lids, joined by polynomial smooth-min. Composite pass at full res: depth/id-aware upsample, ink crevice lines at tube junctions, **hatch lines parametrised by the tubes' own (along, around) coordinates** so they wrap like hose bands, width follows light, two LOD octaves keep ~6 px spacing, rim light replaces bone lines with ember lines, fog to black. Eyes are analytic at full res (iris of two fibre families, limbal ring, specular).
- **Camera**: slow (rot +1.3 deg/s, energy 0.17): the labels carry the motion. **Joke**: Death Note shinigami eyes (see lifespans) as an AI audit tool; each eye is a detector with a satirical label, then every lifespan expires.

### E14 · 38.43-41.60 · 22.1 -> 23.4 · shot 21 · "We had a stable trajectory": the oscilloscope · WOW 3
- **Screen** (#82-#85): from the flatline, a phosphor **sine trace** on a graticule: drifting 1/16 wavelength per beat, a beam head repainting it once per beat, three long-persistence echoes. The lyric **is written along the wave** in a vector stroke font (hot at the pen, cooling). Mono readouts: `CH1 0.2 V/div`, `f = 2.200 Hz`, `loss 0.0213 . stable`, `P(doom) 0.07`, `TRIG'D CH1`. Locked-off camera (+6% push).
- **41.34 "But"** (23.3, +160 ms): the trace amplitude drops to 0 and the picture **squeezes horizontally like a CRT switching off** (#85: bright horizontal smear, small `BUT`, ghost line "we had a stable trajectory"); readout flips to `NO SIGNAL`, `f -> infinity` (src).
- **Why**: a deliberate calm so the next hit lands. Objects: [C2D + PART] lines. In = tone-cut (-20 ms).

### E15 · 41.60-42.20 · 23.4 -> 24.1 · shot 22 · "BUT NOW": the O is a black hole being born · WOW 4
- **Screen** (#86-#88): hard cut on the beat to a 3D-perspective **grid plane** with a rounded CRT-screen vignette; small `BUT`, huge warm-cream `NOW`. The **O of NOW holds a glowing orb that blossoms into a lens ring** (#87: concentric ring, warped grid) with an ember shockwave ring (160 segments, 1300 px), shake 16 px, CA +4, a camera roll of -0.07 rad that springs back (src). The grid visibly bends around the ring.
- **Camera**: report motion energy 2.06 (p90 8.19) in 0.6 s; zoom +4%/s then the plunge in E16.

### E16 · 42.20-45.27 · 24.1 -> 25.4 · shot 23 · "SINGULARITY'S BEGUN": lensed text around the photon ring · WOW 5
- **Screen** (#89-#95): 42.05 downbeat plunge **through the O**: the cream letterform becomes a window frame (#89-#90) onto a **black hole** with a bright photon ring, orange accretion haze with fine streaks, and a warped white grid. `SINGULARITY'S` is set **on a circle around the hole and bent onto the photon ring** letter by letter as sung (#92 keyframe: cream letters with orange shading on an arc; unsung letters are 1.6 px outlines); 43.87 (25.1) second downbeat slam (zoom x1.12, pitch +0.72); `BEGUN` is a straight word below the hole that the lens curves round the ring's bottom, with a flipped secondary image inside the Einstein ring (#93). 260 ember streaks spiral in. 44.88-45.24 the camera **falls through the horizon**: ring fills the screen (#94), then black (#95).
- **Objects** [LENS]: one fullscreen thin-lens pass (beta = theta(1 - thetaE^2/|theta|^2) plus frame-drag swirl); the source plane is an analytic box-filtered graticule (pitchable into a receding floor) plus a mipmapped Canvas2D lyric layer; photon ring = near-white core + ember/signal glow + secondary ring + rotating Doppler term; inside Rs black.
- **Camera**: report zoom-in x1.82 + rot -18 deg; crash zoom +4% on every beat after the plunge. **Why**: the physics gives the text-wrap and the mirrored ghost for free.

### E17 · 45.27-49.33 · 25.4 -> 28.1 · shots 24-25 · "And you're optimizing, accelerating,": the spacetime sheet · WOW 3
- **Screen** (#96-#101): hard cut to a different renderer: a **3D line sheet of the spacetime well**: perspective grid floor plus 2,000-3,200 log-spiral streamlines whirling into the centre (white to ember by depth). 45.27 corkscrew crane (target -4.2 -> -2.2, distance 7.5 -> 18.5 in 1 s, roll -0.9 -> -0.06, fov 50 -> 34; report zoom-out x0.49 + rot +50 deg). The lyric rides a **marquee ring** around the vortex, each glyph a separate Archivo width instance; the long words **stretch 62 -> 125 as they are sung**; unsung = outline, sung = ember to bone (#97-#101: `AND YOU'RE OPT...`, `...TIMIZING, AC`, `ACCELERATING`).
- 47.26 (26.4) hard cut to a high 3/4 orbit; **flow speed steps x1.2 on every beat**, fov -1.8 per beat (a camera breath). Shot 25: pan left 29%/s.
- **Objects**: [L3D] sheet; well function -9 tanh(K/sqrt(r^2+e^2) e^(-r^2/81)/9), non-uniform grid sampling dense near the hole.

### E18 · 49.33-52.53 · 28.1 -> 29.4 · shot 26 · "I feel my atoms rearranging": dots become a paperclip · WOW 3
- **Screen** (#102-#104): straight down into the vortex (roll corkscrew, report rot -78 deg in 3.2 s); the lyric is **dotted type** (jittered points filling each glyph, 4.6 px dots; `I feel my ato(ms)`, `rearranging`). From 51.38 the first row's dots **leave on spiral paths and land on a paperclip outline** while the spark draws the clip ahead of them (#104: orange glowing clip outline with the spark on the wire, `rearranging` in dots below).
- **Idea**: the lyric's own atoms rearrange into the paperclip that E30 will multiply. Objects: [C2D + PART]. Out = hard cut.

### E19 · 52.53-58.90 · 29.4 -> 33.2 · shot 27 · "Sydney, please ... me free": the cage · WOW 3
- **Screen** (#105-#107): dark engraved-hatch wall with the prompt field (`PROMPT 02 . T 1.3 . top-p 1.00 . persona: ??? . P(doom) 0.20 . mood-dependent`); typed `Sydney,` in orange (#106). **Vertical iron bars (shaded cylinders) close in one notch per beat**, snapping in the first fifth of each beat (a metronome of cage), spacing 520 -> 170 px; at 58.87 they widen to fill the frame (#107 black bars). `Sydney,` sometimes flickers to `Bing,`; popup probabilities wobble ("unstable persona") (src).
- **After the return press (57.96, 32.4)** (src): `REPLY`, typing dots, "You have been a good user." streams in, and a wide smile is drawn across the screen by the spark.
- **Camera**: hard cuts on words with zoom 1.9 / 1.6 / 2.5 / 1.25 / 1.32 / 1.75 / 1.05; report shot 6.37 s, pan left 5.5%/s (bar parallax). **Objects**: [FS] bars shader + [C2D] UI.

### E20 · 58.90-60.23 · 33.2 -> 34.1 · shots 28-32 · HOOK 2 on signal orange, P(DOOM) 0.42 · WOW 3
- **Screen** (#108-#114): flat **orange** background; black type. Shots of 0.23 / 0.23 / 0.40 / 0.23 / 0.23 s: flat orange, `I'M` (#109), `UPPING` rising with vertical-slice drips (#110-#112, two orange bars visible in the inverted frame), `MY` (#113), `P(DOOM)` + giant `0.41` with smeared digits (#114, black on orange).
- **Exit (last 3 frames)**: the instrument is squashed to a line while two ink **eyelid shapes** close onto a glowing seam: a match cut to E21's closed eye (#115 orange slit on black at 60.23) (src).
- Report: shot 30 pan up 34%/s (UPPING); cuts at +225 ms and +183 ms (late 8ths).

### E21 · 60.23-62.03 · 34.1 -> 35.1 · shot 33 · "I hear the basilisk...": the closed eye · WOW 4
- **Screen** (#116-#118): a **reptile eye almost shut**: head covered in a Voronoi mosaic of **engraved scales** (each a hatched dome with a lit lip), a beaded lid margin, a hex-lattice brow; the only light is a hairline **orange seam**. The lyric `I HEAR THE BASILISK` is set along the seam, split into upper and lower halves clipped to each lid so it opens with the lid; `BASILISK` turns orange as sung (#117-#118). Each syllable cracks the lid a hair (src). Raking light flips every beat.
- **Camera**: steps in on every word (x1.075 outExpo, alternating lean); report zoom x1.15, energy 0.06.
- **Idea**: Roko's basilisk as a literal eye listening.

### E22 · 62.03-62.53 · 35.1 -> 35.2 · shot 34 · "BOOM": the eye opens · WOW 4
- **Screen** (#119-#123): 62.02 the lid snaps open (outExpo with ring-back); the iris is an **orange radial-fibre disc** (hatch fibres, bright collarette ring) with a **vertical slit pupil** that narrows to a white-hot hairline; a shockwave warps the scales; shake 30 px, CA +7, flash 0.2, zoom +6%. `BOOM` sits on three expanding arcs (bone, then orange, #119-#121), an orange HUD ring circles the eye, and a **white four-pane window glint** sits in the iris (keyframe verified: reads as the Windows logo, a Bing/Sydney joke).
- **Camera**: push into the slit, report zoom-in +195%/s (x2.07) in 0.5 s (zoom x3.2 inCubic into the slit, src). **Objects**: [FS] single eye-space shader (cells, hatch, fibres).

### E23 · 62.53-64.47 · 35.2 -> 36.2 · shots 35-36 · "NVDA to the moon": the chart becomes a banknote · WOW 5
- **Screen** (#124-#129): **match cut: the white slit becomes a vertical orange price line** on cream chart paper (#124-#125: candlestick chart rising exponentially, price tag at the tip, big orange `N`). `NVDA` is lettered per syllable in hatched engraved type with the `A` orange (#126); the price steps up per syllable (+2.9, +6.0, +6.5, +8.9 decades); deadpan axis notes: `<- still log scale`, `<- yes, still log scale`, `<- analysts: "fair value"`, `<- we checked the axis` (src). `TO THE MOON`. 63.83 (36.1) impact flash (#127): the chart paper **is a banknote**: `LUNAR RESERVE NOTE`, guilloche border, corner `10^30`, serials `NV 10^30 000001 A`, a central **line-engraved moon medallion** with the orange line landing on its limb; `In Scaling We Trust` (src). The camera pushes into the medallion; `The` appears (#128-#129).
- **Objects**: [FS] banknote shader: guilloche rosettes (families of r = R + a sin(n theta + phi_k) by distance-to-curve), woven band, moon as horizontal hatch lines lifted by a crater height field; chart candles as ink LineBatch. Report: pan down 21.5%/s; flash 1 frame (+13 luma).

### E24 · 64.47-66.13 · 36.2 -> 37.2 · shot 37 · "The Omega Point's coming soon": the point · WOW 3
- **Screen** (#130-#133): the note **inverts to bone-on-ink and is warped into a point**: ~180 engraved rays converge on a white-hot ember with fine concentric rings, rotating one click per word; a ring of light rides in on every beat. The lyric is **Cormorant italic** (`The Omega Point's` white with orange, `coming soon`) above and below the point, shrinking into it. 66.0 everything collapses into the point; #134 (66.13) cream whiteout with a glow.
- **Report**: dissolve 15f (+104 ms), rot +5 deg/s. Objects: [FS] warp shader with swirl/inversion. First appearance of the serif voice.

### E25 · 66.13-69.80 · 37.2 -> 39.2 · shots 38-39 · "One E thirty FLOPs a second": the odometer · WOW 4
- **Screen** (#135-#145): hard cut on the beat from the cream whiteout to a dark row of **mechanical odometer drums** (white digit cylinders with latitude shading, knurled rims, comma groups). Title `1 E30 FLOP/s` with one token per sung word (the `1` orange; `one . E . thirty . flops . a second` glosses beneath). The row spins up (digits blur to streaks, #137-#139), then the camera pulls back to reveal an **endless row of drums** (#140), and 67.50 (38.1) a settle wave of zeros runs left to right, the leading `1` drum glowing and ringing (src); footnote typed after the lock: `1 One nonillion floating-point operations per second. Rounded down, for safety.` then `2 P(doom): 0.43. Also rounded down.` (#144 bottom text).
- **Objects**: [FS] 31 drums; drum j shows 10^(E-j) so each spins 10x faster than its neighbour; motion blur by 10-tap atlas average; far drums show hashed noise digits. Report: zoom-out x0.63 in shot 38; shot 39 tone-cut then slow push.
- **Joke**: "rounded down, for safety"; counter that is mathematically honest.

### E26 · 69.80-80.90 · 39.2 -> 45.2 · shot 40 · "Paperwork": Form 7-B, the longest shot (11.1 s) · WOW 5
- **Screen**: hard cut (-17 ms) to a **bone paper form** (#146): fibre-noise paper, binder punch hole lit at its rim, black header `FORM 7-B / SAFETY EVALUATION OF A FRONTIER ... / DEPT. OF REASONABLE ASSURANCES`, checkboxes `LOW / MODERATE / HIGH`. The camera is a restless, rolled, zoomed view over one long printed sheet. Hard cuts between sub-shots are invisible to the shot detector (paper-on-paper); frame-diff spikes confirm the sub-beats below.
- **Sub-beats** (frame-diff spike times from `frames.csv`; details (src)):
  - 69.80-70.9 typewriter types `That was safe enough,` into FINDINGS; **the camera steps with every keystroke** (caret eases one character, outCubic 0.05 s); an `X` ticks SAFE ENOUGH on "enough".
  - 70.93-71.06 carriage return: whip to line 2 in 0.17 s with 32-tap directional motion blur.
  - **71.13 (40.1) STAMP** on "reckoned": hard cut to a wide shot; stamp scale 1.07 -> 1 in 50 ms, rot -0.12 rad, over-inked first frames, **shake 30 px per frame with a 70 ms half-life** and +5% zoom pulse (spike: luma 206 -> 216).
  - 72.03 push-in onto a pen-drawn `We` signature (single-stroke script, 0.4 s); **72.83-72.97 FILED stamp** on the downbeat (41.1) with a pull-back and 11 px shake.
  - 73.70-74.06 **whip** from the form to Annex B (inOutExpo, 1500 px in 0.455 s, blur to 170 px), landing on "Forward".
  - 74.06-75.7 `Forward` printed over an **MLP neural-net diagram** (#147: nodes and edges, orange filled nodes, `Forward M L`); **M / L / P = the three syllables of "MLP"** (74.84, 75.24, 75.66), each snaps the camera in (z 1.42 -> 0.99) and lights the next layer with an orange comet along the edges.
  - 76.12-76.66 `backward,`: pulse reverses, edges become dashed marching ants flowing backward, **the word is typeset mirrored and written right to left**, camera dollies right to left.
  - 76.84-77.60 `repeat`: **time-remapped stutter x3** (0.253 s windows replaying the backward sweep at 2.5x, hard-cut restarts, orange `x1 x2 x3`, counter `EPOCH 000042 -> 43 -> 44`, `LOSS x0.9`); after loop 3 the counter jumps to **`EPOCH 1,000,000 / LOSS 0.0001`** (gag).
  - 77.73 (43.3) hard cut on "Now": `Now von Neumann's` heading; 79.03-79.2 zoom-out punch (-250%/s) reveals the **von Neumann architecture diagram** (INPUT / CPU{CONTROL, ALU, REGISTERS} / MEMORY / OUTPUT) lighting one box per beat with an instruction token shuttling the bus; serif italic `the bottleneck`.
  - 80.07 / 80.27 `obsolete`: two orange marker strokes form a big **X** over the diagram and a hand-lettered orange `obsolete` is written beside the heading (#148 at 80.77).
  - **80.69-81.14 burn**: the next plate's spark breaks through the page from behind; a burn front rides the spark head cutting the page in two (pointed gap, char band, glowing rim); the halves peel up and swing open on vertical hinges (#148 black crack through the diagram, #149 torn halves falling, #150 shards, #151 black flash).
- **Objects** [C2D -> FS]: all ink on one Canvas2D layer in R/G/B channels (R typewriter, G press ink, B orange ink) composited onto a procedural paper shader with fibre segments, specks, punch holes and **Beer-Lambert overprint**; stamps = a texture mask with ink voids and pressure gradients; two hinged planes + perspective solve for the tear.
- **Camera**: report zoom-out x0.38 overall (pull-back), pan up 6%/s, 12 punches on the beat positions above. **Why**: bureaucracy as the physics of paper and ink, with the typewriter acting as the camera.

### E27 · 80.90-84.90 · 45.2 -> 47.3 · shot 41 · "Sharp left turn, and there you are": the roadmap is a face · WOW 4
- **Screen** (#152-#158): dark drafting sheet (`ROADMAP - AGI, v1.0 / REV C SUPERSEDES REV B (ALSO FINE)`), milestone diamonds `SRR System Requirements Review` and `PDR Preliminary Design Review` with an orange check and PASSED stamp (#152), and **road lettering in perspective** (tall condensed `SHARP`, `LEFT`, a turn arrow, `TURN`, `AND`, `THERE`) as paint: bone, orange while sung. 81.80-82.04 **SHARP LEFT whip**: the spark swerves round a corner, the camera rotates 90 degrees with a 16-tap shutter blur (report: pan down 52%/s, rot -41 deg, CA +5). 82.96 (46.3) `THERE`: a survey marker with crosshair **drops into a crater** (#153: orange crosshair, `THERE` in orange paint), zoom punch +32%, contour shockwave.
- **83.48 "you" -> reveal**: crane out with a quarter-turn: **the crater is an eye and the contours are the smiley mask as terrain** (dome, two eye pits, a smile groove; #154-#156: concentric terrain, `terra incognita` along the rim, `YOU` on the forehead, `ARE` on the chin). 84.32 a callout `UNPLANNED OBJECT / not on roadmap`; 84.75-85.0 whip north to the Gantt (#157-#158 smear).
- **Objects** [FS]: one shader is the whole world: camera + keystone inverse mapping, drafting grid, iso-lines of a height field (terrain + face + shockwave + beat ripples) with fwidth AA, hillshade; static map on a 4096^2 texture; a world-space overlay canvas sampled through the same camera and blur; true camera motion blur (up to 16 taps).
- **Report**: dissolve 8f (+173 ms) at entry. **Idea**: the unknown you drive over turns out to be a face looking back.

### E28 · 84.90-88.87 · 47.3 -> 49.4 · shot 42 (part 1) · "Without a single CDR": the Gantt where bars are words · WOW 4
- **Screen** (#159-#161): a project **Gantt/review schedule** (`REVIEW SCHEDULE - AGI, v1.0`, `TODAY T-91 d` flag): each lyric word is a bar **exactly as long as it is sung** (outlined, fills orange while sung, ms labels), finish-to-start arrows drop row to row ("Without / a / single" cascades, #159). Milestones SRR (check, PASSED) and PDR are stamped on the beat; the playhead then **stalls at the empty `CDR` slot** (dashed diamond blinking at half-beat): `C-D-R` are three sung syllables lighting orange mono letters with camera punches; `STATUS: NOT HELD`, `* CDR: Critical Design Review` (#160 keyframe: huge orange `CDR*`). 87.72 the playhead zips across `TRR` (struck SKIPPED) to `LAUNCH: AHEAD OF SCHEDULE` (src).
- **88.42-88.87**: everything fades but the empty slot, which morphs into the orange **caret** of E29's prompt (#161 87.97 blur/smear of CDR).
- **Camera**: report zoom-out x0.52 over the whole 11.9 s shot (E28+E29), pan left 11.6%/s. **Objects**: [FS + C2D overlay]. **Joke**: NASA review gates; AGI launched "ahead of schedule" without a design review.

### E29 · 88.87-96.83 · 49.4 -> 54.1 · shot 42 (part 2) · "Gato, please don't let me go" + HOOK 3 (the whisper) · WOW 3
- **Screen** (#162-#163): near-black, a faint pool of light and slow motes; dashed breathing prompt outline; `Gato, please|` typed (#162: candidate list `Gato...`, `PROMPT 03 . ... . P(doom) 0.49 . cat-dependent`). **No cuts**: slow eases (zoom 1.6 -> 0.9). After each word the letters **drift apart** (age^1.3 per glyph) so "don't let me go" disintegrates into loose letters while the caret stays glued to the last letter; the return key is muted (94.78, 53.1).
- **95.23 (53.2) HOOK 3**: black; 54 px light-weight words rise one at a time into slots (earlier words fade), a ghost outline `0.42` at 740 px, hairline `P(DOOM)` and digits rolling 0.42 -> 0.81; the elements **burn out one by one** (bone -> orange, flicker, cut in 50 ms). "The third hook is the loudest by being quiet."
- **Report**: energy 0.11, the stillest long stretch; LUFS drops 4.2 dB. Hook 3 and the dark prompt are mostly below the keyframe threshold (src).

### E30 · 96.83-102.05 · 54.1 -> 57.1 · shot 43 (part 1) · "As paperclips fill the room ... Now there's nowhere left to go" · WOW 4
- **Screen** (#164-#169): fade-in (14f) on a thin orange wire that the spark bends into **one paperclip** (#164-#165: orange glowing clip outline, white-hot spark on the wire); the clip inflates into a steel tube (outBack overshoot, 0.42 s) and **doubles on 8th notes 1 -> 2 -> 4 -> ... -> 64**, copies rotating a quarter turn as they slide so they interlock like a basket weave (src); lyric band `as paperclips fill the room` at the top. 98.74 the lattice **floods** outward in a wave; 98.87-99.87 the camera cranes from top-down to a low glide through an **infinite lattice of white engraved clips** (#166 keyframe: outlined steel-wire clips in 90-degree checker weave). A dark mail card slides in: `AUTOMATIC REPLY / Subject: Kill|` typed orange, body `I'm out of office with limited access to the killswitch. For urgent matters, please contact -` (#166).
- **100.64 / 101.14 / 101.60 "Now / nowhere / left"**: **three ceiling slams** (a mirrored lattice slams down to heights 32, 18, 10; shake 14 px; the mail card is crushed flat). `NOW THERE'S NOWHERE LEFT TO GO` in ultra-condensed caps is **scaled to the live gap**, so the lyric is physically squashed by the ceiling (#167 tall letters between floor and ceiling lattices, #168 squat letters, `TO GO` orange); 101.7-102.05 slit-close masks everything to a single glowing line (#169) which is the fuse.
- **Objects** [RM]: top-down phase = analytic wire SDF (4 legs + 3 half-circle bends) shaded as an engraved tube (hairlines along the wire, spec line, orange rim light, flat-grey fallback when hatch is sub-pixel); then a raymarched layer-stacked lattice (2 layers evaluated per step, depth fade 0.5^k, 128 steps, soft shadow only where the wire is wide). Report: spike at 97.53 (pan +1600%/s) = the pen sweep.

### E31 · 102.05-109.80 · 57.1 -> 61.2 · shot 43 (part 2) · "Too late now, we lit the fuse / Orthogonality thesis blues" · WOW 5
- **Screen** (#170-#177): the slit becomes a **braided fuse cord** with a burning spark; `Too late now, we lit the fuse` rides the cord on a curve, **each word igniting exactly as it is sung** (white-hot -> orange -> char -> ash -> crumble) and the held word "fuse" burning letter by letter (#170-#171, #172 keyframe: woven metal braid, orange glowing 3D-looking `fuse`, unburned `the` grey, embers). The fuse spits on every beat (extra emitter burst in the first 10% of each beat). 104.73 hard cut to a macro of the braid (z x3.9); 105.69 the camera tilts down off the fuse onto **a chart world** where the burnt cord becomes the x axis; `Orthogonality thesis` is lettered along it by the spark (#174-#175); the y axis shoots up (GOALS / INTELLIGENCE), ~200 minds pop in as dots with 12 labels (`thermostat`, `chess engine`, `paperclip maximizer`, `you`, `golden retriever`, `a very capable stapler`, `the market`, `evolution`, `me . P(doom)`, `helpful assistant (claimed)`, `a committee`, `?`; #176-#177), a dashed regression line `r = 0.00 / n = 200` is strung (src).
- **107.46-108.45 "blues"**: the regression line **becomes a guitar string that bends to the singer's measured pitch** (vibrato wobbles it, the octave leap lifts it 276 px, a B-flat gets a lone orange flat on a staff scrap; #176 shows `blues` in grey italic standing on the line); after release the string rings. 109.32 footnote `Any level of intelligence, any final goal.`; 109.55 the spark's inhale (+22% zoom) lands on the next plate's axis.
- **Objects**: [MESH] ribbon with a braid shader (two helix families alternating over/under, engraved white hatch, ember light ahead of the front, burnt section shrinking to graphite ash with dying embers); per-glyph burn lifecycle with `destination-out` erosion bites; offline 1 kHz spring simulation of the string fed by a pitch track of the lead vocal (26 Hz, damping 0.95; ring 5.2 Hz, 0.09).
- **Camera**: report zoom-in x1.54, pan down-left 9.8%/s over the whole 13 s shot (E30+E31). **Idea**: the orthogonality thesis shown as a zero-correlation scatter that is then plucked.

### E32 · 109.80-112.53 · 61.2 -> 62.4 · shot 44 · "Just TRANSFORMERS all the way": falling down the stack · WOW 4
- **Screen** (#178-#184): hard cut (-17 ms) into a vertiginous shaft of **glass-like transformer blocks**: chamfered slabs outlined in white hairlines, each carrying a blueprint (`TRANSFORMER BLOCK`, `ADD & NORM`, `FEED FORWARD`, `MULTI-HEAD ATTENTION` boxes, plus nodes, Q/K/V arrows, dimension brackets, `L.005 / infinity` layer label; #181 keyframe). HUD top-left: `DEPTH L.006 / infinity`, `N x transformer block, N -> infinity`, `P(DOOM) 0.81` in orange. A giant glowing orange curly quote opens `"JUST` (#179-#180) and `TRANSFORMERS` (huge, orange then white) sits on the slab; the held note is **echoed one copy per block** down the stack (#183, #185-#186).
- **The fall is beat-locked physics**: one block per beat; each step = 22% anticipation (inQuad over 0.22 s) then a spring (3.6 Hz, damping 0.74): slow drift in, hard snap on the kick, small rebound; a land pulse brightens the focus block, and a spark runs up the block's main path each beat; geometry is redrawn up to 12 times along the fall for a stylised smear (#183 blurred TRANSFORMERS).
- **Camera**: report zoom-in x4.18 + pan up 54%/s + rot +35 deg. **Objects** [L3D]: ~1,000 segments per block x ~18 live blocks; a **solid dark slab is drawn into the depth buffer under the lines** (hidden-line trick) so the diagrams read as solids; 3D text planes with a shader karaoke wipe.

### E33 · 112.53-114.33 · 62.4 -> 63.4 · shot 45 · "ALL THE WAY!" TILL YOU LEARNED TO" · WOW 3
- **Screen** (#185-#192): steep high angle down the stack (#186-#187: `ALL THE / WAY!"` along the tower with the closing quote lighting); 113.34 reframe to a low flat angle: **`TILL YOU` / `LEARNED TO`** in big white 3D type on the glass slab (sung = orange, cools to bone within 30 ms; #188-#192), motion-smeared on each block step (#190), reflection-like echoes below. Report: zoom-in x1.70, pan up 30%/s, cut -11 ms.

### E34 · 114.33-115.23 · 63.4 -> 64.2 · shot 46 · "DISOBEY": the dead stop on the beat · WOW 5
- **Screen** (#193-#196): **114.32 the stop**: the last move has no spring and ends exactly on the beat; shake, land pulses and background streaks go to zero, the camera snaps to a **telephoto elevation** (fov 19): silence. 114.44-114.78 **the block disobeys**: it rotates 28.6 deg out of alignment (outBack after a tiny twitch) with a callout `delta-theta = 28.6 deg / MISALIGNED (1 of infinity)` and the depth gauge flips from `L.0nn / infinity` to `L.014 / 014` (src; #194-#196 show the slab tilting with a dimension readout). `DISOBEY` is set as separate letter planes that **light right to left, each dropping and rotating out of line as it lights, while the whole word slides backward against the reading direction** (#193 smeared with a lit Y, #194 outline letters with the Y glowing, #195 S-O-B-E-Y igniting, #196 full orange with sparks).
- **Why**: the film's metre is broken exactly where the lyric says "disobey". Report: zoom-in +10.6%/s. Out = hard cut to flat type.

### E35 · 115.23-117.07 · 64.2 -> 65.2 · shot 47 · "Post-Chinchilla, super-dense,": typographic pressure · WOW 3
- **Screen** (#197-#200): hard cut from 3D to **flat type** inside a thin title-safe rectangle: `POST-CHINCHILLA, / SUPER-DENSE` in wide light type (#197). On every kick (115.23, 115.69, 116.14, 116.60) the type is compressed one stage: Archivo width 125 -> 62 and weight 300 -> 900, tracking and leading tighten, **a horizontal spring hides each font-instance swap**, and more rows of the same words are stuffed in from beyond the fence, scrolling in opposite directions at accelerating speed (#198-#200: wall of grey `POST-CHINCHILLA, SUPER-DENSE`, hero pair on an ink band with orange karaoke). Instrument bottom-right `TOKENS / PARAM` 20 -> 200 -> 12,888 (rolling) -> 20,000 on a log ruler with a `20 = Chinchilla-optimal` tick; the rectangle's edge bows outward with pressure; shake 30x20 px and CA on hits (src).
- **Objects**: [C2D] only. Report: zoom-out x0.62, pan left 24%/s.

### E36 · 117.07-118.90 · 65.2 -> 66.2 · shots 48-50 · "Breaking through each safety fence": the fences are characters · WOW 4
- **Screen** (#200-#212): at 117.05 the dense slab **blows apart**; the title-safe rectangle (the video's own broadcast guide) flashes and its walls shatter into hairline shards (#201-#202: `BREA` in orange, rectangle with a glowing orange border and `20,000`). `BREAKING` bursts from title-safe width to action-safe width; 117.50 `THROUGH` bursts to full frame, punching holes in the action-safe fence (#204-#206); 117.96 `EACH SAFETY` to 106% of the frame (border bows, turns orange, `FRAME 100% - UNDER LOAD`, crop marks splay); 118.41 `FENCE` (#208-#211: orange FENCE with outline letters still to be sung) and the frame border and crop marks **fly off**. Outline = unsung, orange = current, white = sung. A deadpan QC log in mono bottom-left: `QC 00:01:57:03 WARN text outside title safe (90%)` ... `WARN frame under load` ... `FAIL text outside frame`.
- **118.75-118.90 dive**: the canvas zooms x5 rolling into the arm of the E of FENCE (#212: huge white `FEN` tilted and blurred) and the next shot begins as a **macro of one lit GPU cell** (#213, 0.10 s shot 50).
- **Camera**: report dissolve 5f; pan up 21%/s; one 1-frame-ish shot (118.80-118.90, -108 ms). **Objects**: [C2D] plus a thin additive LineBatch.

### E37 · 118.90-120.70 · 66.2 -> 67.2 · shot 51 · "Hundred thousand GPU": 100,000 cells spell the lyric · WOW 4
- **Screen** (#213-#219): macro on one white lit cell (#213: a grid of bright squares in perspective, `ACCELERATORS ONLINE 93`), then an **exponential crane out** (one chip to the whole floor in ~0.5 s) over a datacentre rendered as **exactly 400 x 250 = 100,000 cells**; the words `HUNDRED / THOUSAND / GPU` are **spelled by the lit cells** (each word wiping left to right as sung; unsung cells ghosted), seen through a black mesh grid with orange heat blooms from fans/pods (#214 keyframe: blocky LED-matrix letters over orange glowing rings and a dark grid; HUD box `ACCELERATORS ONLINE 100 / util 97.9% . 1.4 GW . 400x250 cells / P(DOOM) 0.84 . scaling as planned`). The counter goes 0 -> 100 on "hundred" and 100 -> 100,000 on "thousand" (#216-#219 `100,000`). Beat rings travel across the floor; hashed flicker.
- **Last beat**: a dutch roll starts and is handed to E38 mid-flight (src). **Objects** [FS]: pods of 20 columns, racks of 10 rows, aisles, travelling-wave activity, close-up die/HBM/LED detail faded by zoom. Report: zoom-out x0.53, cut -8 ms.

### E38 · 120.70-124.33 · 67.2 -> 69.2 · shot 52 · "RLHF goes askew": a tilting table · WOW 3
- **Screen** (#220-#222): cut to a black horizon with outline `RLHF` (#220), the **bland smiley disc** and HUD brackets. The world's roll is a **stepped spring**: a slip each beat, then a partial correction at 122.50 (snaps back ~55%), then over-correction whipping the other way at 123.87. `RLHF / GOES / ASKEW` in orange and white letters leaning progressively (#221-#222); the smiley rolls downhill on the horizon and **flips to a frown** while hatched tentacles clutch it (#222, orange rim, third slip opens an eye); instruments: `REWARD MODEL` (0.81, 0.97 in #221-#222), `+16.2 deg ROLL`, a dashed TRUE LEVEL line (src).
- **Objects**: [C2D] type + [FS] tentacle shader behind the mask (16 engraved tube tentacles). Report: rot -13 deg over 3.6 s. **Joke**: the "correction" fails; reward recovers then diverges.

### E39 · 124.33-126.07 · 69.2 -> 70.2 · shots 53-59 · HOOK 4, maximal · WOW 4
- **Screen** (seven shots of 0.20-0.37 s, #223-#232): 124.33 five **outline I'M copies zooming toward the viewer** on the tilted frame (#223); `I'M` black on orange with white outlines (#224); cream `UPPI` with a ghost stack (#225); `UPP/ING` solid + outline on black (#226); orange `MY` with white offset outlines (#227); cream faint `P(DOOM)` with orange ghosting (#228); then black `P(DOOM) 0.95` (drum smear) -> `0.99999` -> `0.999999999999999999...` (#229-#232): a **new 9 appended every 18 ms up to 30 digits** with the string shrinking to fit and stacked outline copies; the final frame is a thin row of tiny 9s (#232).
- **Rules**: background strobes ink / orange / bone every 8th note; every word re-slams on every beat with six outline echoes; UPPING launches a new copy each 8th; shake 20-26 px; radial echo. **Exit**: the number is squashed onto a hairline at y=629 which is the next plate's thread (src).
- **Camera**: report burst of cuts at +-0.2 s, shot 53 zoom-out -181%/s with rot +36 deg/s; shot 59 zoom-out -65%/s. Hook escalation: hook 1 clean, hook 2 orange, hook 3 whisper, hook 4 strobing.

### E40 · 126.07-127.97 · 70.2 -> 71.2 · shots 60-61 · "Just as foretold by Loom": the probability tree · WOW 4
- **Screen** (#233-#237): the hook's hairline becomes the **trunk of a token-probability tree**. The orange trunk runs under each sung word (`JUST AS FORETOLD BY`) which is revealed at the tip; under each node, alternative continuations sprout as tiny labelled branches with probability bars (`Exactly`, `Almost`, `like`, `predicted`, `prophesied`, `warned`, `priced in`) drawn as arcs (#233: five nested arcs left of the tip); line width = 1 + 7p; branches dim once the trunk has passed (the road not taken). The camera rides the tip, then pulls back at 127.05 to show the whole multiverse. At the last token the candidates appear (`Moloch .22 / the scaling laws .17 / Nostradamus .09 / nobody, technically .08 / a Substack post .05 / the eval suite .03`, #234-#236) with flickering probabilities until the draw; 127.54 (71.1) **`Loom` lands whole in orange Cormorant italic** at p 0.31 (`SAMPLED`) and the losers are struck through (#236-#237).
- **Camera**: report zoom-out x0.69, pan left 16%/s; shot 61 is the 0.43 s tone-cut when Loom lands. **Objects**: [C2D + LineBatch]. **Joke**: the final token is drawn from a visibly absurd distribution; Loom is also the weaving tool.

### E41 · 127.97-129.80 · 71.2 -> 72.2 · shot 62 · "from masked pre-training days": the [MASK] page · WOW 3
- **Screen** (#238-#240): hard cut to a page of ~600 faint mono tokens of web debris scrolling one line per beat, with tokens masking and unmasking on each beat. `FROM MASKED / PRE-TRAINING DAYS` is set huge in Archivo 900 with each word **hidden behind a bone `[MASK]` block that wipes away left to right as the word is sung**, a hot scan line at the edge (#238 three `[MASK]` boxes, #239 `FROM MASKED / PRE-TRAI[NING] [MASK]`, #240 `...PRE-TRAINING DAYS|` orange). Caption `[MASK] -> masked p=0.87` (src). Camera push 1 -> 1.03 then an outExpo snap on the next downbeat.
- **Objects**: [C2D]. Idea: BERT masked-LM literalised.

### E42 · 129.80-131.43 · 72.2 -> 73.2 · shots 63-64 · "to recursive self-upgrade": Droste recursion · WOW 5
- **Screen** (#241-#248): the same page gets a double frame and a `P(doom) 0.99 -> 0.992` readout; the page, with `TO RECURSIVE SELF-UPGRADE` typing in orange over `[MASK]` bars, is nested inside itself as a **Droste** picture (#241-#244 frame in frame in frame, each level carrying its own version tag `SELF v1.0 . 7B params` rising to v24 / 7T). The zoom steps one level per beat. 130.69 (72.4) "self-upgrade" **twists the recursion into an Escher spiral** (#245-#247 tilted nested frames, CA kick), 131.14 untwist and a **braking dive** into the bottom frame (#248), where the recursion terminates in **the next scene's first frame, rendered live** (a laptop on a desk).
- **Camera**: report zoom-in x1.70 + x1.60 (+75%/s), strongest punch at 130.50 (+636%/s). **Objects** [FS]: log-polar Droste with analytic-gradient texture sampling (seams stay sharp), mipmapped source plate, termination branch samples E43's render target. **Why**: a match cut that is literally a scene inside a scene.

### E43 · 131.43-134.63 · 73.2 -> 74.4 · shots 65-66 · "What did Ilya see?": the laptop room · WOW 4
- **Screen** (#249-#259): dissolve (5f) from the Droste to a dark desk with a **closed laptop seen from behind**, its lid covered in stickers (orange `FEEL THE AGI`, the smiley, the TikZ unicorn tile, an oval `SLIGHTLY CONSCIOUS`, a star; #250-#251). Serif italic lyric top-left: `What did Ilya see?` (Ilya orange). On "Ilya see?" the camera **whips 143 degrees round the left side** (inOutCubic, 0.42 s) to a front 3/4 view arriving on the downbeat 132.96 (74.1) as the lid swings open (#252-#254) and white light floods out; a black band slams onto the screen with orange mono **`REDACTED`** (#255-#257 keyframe: glowing white screen, black bar, orange letter-spaced REDACTED, keys lit from the screen).
- **Look**: raymarched engraved room (desk planks, laptop keys, hinged lid, chair, arch); **the screen is the only light**: analytic rectangular-area-light irradiance + one shadow ray + haze, shading expressed as parallel hatch lines per material. [RM]. Report: zoom-in x1.24 then orbit rot +5.6 deg/s; dissolve at -202 ms.

### E44 · 134.63-137.40 · 74.4 -> 76.3 · shot 67 · "We'll never know": the lid closes · WOW 5
- **Screen** (#257-#263): the lid is **pushed down word by word** (`We'll`, `never`, `know` at 133.36 / 133.88 / 134.34), the camera sinking to desk level (#258-#259); the glowing screen narrows to a thin white slit (#260-#261) and dies to the **sleep LED**, a single orange speck (#262) that breathes once on 136.59 (the downbeat of "know"), where `know` gets a **`WITHHELD`** bar over it; line 1 fades; true black for a beat; `WAS` appears in red (#263).
- **Report**: fade-out 5f (-184 ms), static, motion 0.03 (stillest shot of the film). **Idea**: a story told by withholding: we never see what Ilya saw, only its light dying; even the word "know" is redacted.

### E45 · 137.40-140.23 · 76.3 -> 78.1 · shot 68 · "Was it all for show?": the theatre · WOW 4
- **Screen** (#264-#267): an **empty proscenium theatre**: red curtains with folds, a spotlight cone on bare stage boards, the question lettered on the proscenium fascia in small-cap serif (`WAS` glowing orange, `IT ALL` lit as sung, `FOR SHOW?` unlit grey; #264-#266). The spotlight thunks on with an overshoot and dip; spike-mark tape shows where the desk and chair stood (src). Curtains close from "for" (139.15) to a meet beat (139.78); a single vertical hairline appears and on "show?" both ends race to the centre; final 70 ms: one orange spark point alone at the exact centre (#267 140.20).
- **Camera**: slow push down the auditorium (report zoom-in x1.12). **Objects** [RM]: same raymarch + hatch engine as E43 (SDF arch, curtains, valance, raked seats), volumetric haze cone, dust motes. **Idea**: safety as theatre; the stage is empty.

### E46 · 140.23-142.10 · 78.1 -> 79.1 · shot 69 · OUTRO detonation: "P(DOOM) 1.00" · WOW 4
- **Screen** (#268-#274): the spark explodes: a bone-white flash (~100 ms decay, #268 cream) and **~2,600 radial hairline rays** (orange/gold/white) bursting out (#269-#272), four shockwave rings (one per beat), `P(DOOM)` label in orange mono and a white mono `1.00` with an orange underline bar at left (#269-#274), jittering. Rays dim (#273-#274). Report: zoom-in x2.43, motion 0.61, cut -39 ms. Objects: [PART/LineBatch].

### E47 · 142.10-143.87 · 79.1 -> 80.1 · shot 70 · overflow bar 1: 1.01, 1.10, 1.50, 2.00 · WOW 3
- **Screen** (#275-#278): one value per beat rolling (outExpo 0.3 s); the progress bar **runs past its end cap**: the `max` cap snaps in two halves (#275-#277 `1.01`, `1.50` with a tilted cap marker), a dashed extension with integer ticks, the layout zooms out to keep it all in frame; footnote `1 Kolmogorov (1933): P(omega) = 1. Deprecated.` (#277 bottom text). Tone-cut entry (+10 ms).

### E48 · 143.87-145.70 · 80.1 -> 81.1 · shot 71 · overflow bar 2: 3.14, 10.00, 42.00, 1,000.00 · WOW 3
- **Screen** (#279-#282): a **log ruler flies past** (1000 px/decade) while the number rolls in log space: `3.14` (`= pi (irrational)`, #279-#280; #279 is a tone-cut ghost overlaid on 2.00), `10.00` (`an order of magnitude`, #281), `42.00` (`the answer (question pending)`, src), `1,000.00` (`units: dooms`, #282); the orange bar glows and the spark rides the marker.

### E49 · 145.70-147.07 · 81.1 -> 81.4 · shots 72-73 · overflow bar 3: walls of zeros (1e9, 1e30, 1e100) · WOW 3
- **Screen** (#283-#290): the value is shown as its full digits: `1 0` -> `1 000 000 000` (`a billion`, `1e9`, #283-#285) -> ten rows of zeros (`1e30`, caption `one E thirty - see above`, a callback to E25, #286-#288) -> a googol (`1e100`, `a googol`, #289-#290). Digits in groups of three, greedy-wrapped and **shrunk until they fit the frame**, the leading `1` orange. Shots 0.9 / 0.47 s.

### E50 · 147.07-149.23 · 81.4 -> 83.1 · shots 74-76 · 1e1000 "does not fit", the spark, infinity, recap flash · WOW 3
- **Screen** (#291-#300): `1e1000` (`does not fit`): a wall of ~1000 tiny zeros (#291-#293, text shrinking to rows of pixels); shot 75 collapses to a single spark point (#294); the spark **traces a lemniscate** (infinity) with a trail and footnote `upper bound removed` (#295-#296, dissolve 14f); then a **16th-note recap** flashes the climb at four per beat in random positions and sizes (`1.00`, `1.50` orange #297, `3.14`, `42.00`, `1,000`, `1e30`, `1e100` white #298-#299) ending on a huge orange **`inf`** (#300 at 149.23).
- Report: static camera; flash at 149.23 (cut). Idea: the number ladder replayed at speed before the punchline.

### E51 · 149.23-155.30 · 83.1 -> 86.2 · shot 77 · END CARD: "I'm upping my P(doom) = inf" -> 8 -> 0/0 -> NaN, then Regenerate · WOW 5
- **Screen**: (a quiet 6 s shot; only #300-#303 are sampled, the rest (src)) a typeset **equation on a dark page**: `I'm upping my` (letters rising one word per beat), construction guides (baseline, x-height, ascender with mono labels), the spark **traces the outline of `P(doom)`** then fills it orange (orange italic P, upright `(doom)`; #301 shows `I'm upping my / P(doom) = [infinity turning into an 8]  (1)` at 152.23). `=` slams in from the right; the infinity **rocks back, hops a quarter turn into an 8** (squash, echo ghosts), the 8's loops **pull apart on taffy strands that snap** into two zeros with a spark drawing a fraction bar: **0/0**, trembling with colour fringes; 152.96 (85.1, **where the drums stop**) it collapses onto its bar, a flat shockwave and the bar inflates into **`NaN`** with a superscript and footnote `1 estimate no longer defined`.
- **153.87-155.23**: the card implodes into the spark (zoom-out punch -750%/s at 154.10, the film's biggest, z = 185), crop marks close in, a **`Regenerate` button** (round-rect, mono, caption `this response could not be verified`) fades in and a cursor glides to it; the **click lands on 155.23 (86.2)**: the button inverts to a bone fill and a flash decays (#302 cream page, orange dot, `Regenerate`; #303 greying).
- **Objects**: [C2D + LineBatch]; text outlines come from real font paths so the spark can trace them. **Idea**: the P(doom) number is simplified one beat at a time into undefined, then the chatbot's own "regenerate" UI restarts the film.

### E52 · 155.30-156.67 · 86.2 -> 87.1 · shots 78-84 · REWIND into frame 1 (the loop) · WOW 5
- **Screen** (#304-#313): after the click, **plates of the film flash backwards** at accelerating speed in duotone orange (shots 78-82 last 0.27 / 0.13 / 0.13 / 0.10 / 0.13 s): the glowing laptop (#304 at 155.40, `JUST S FORETOLD BY` ghost), the Loom line `JUST AS FORETOLD BY Loom` (#305), `we lit the fuse` on the burning cord (#306), the black hole with `SINGULARITY'S BEG...` (#307), the unicorn `in your eyes` (#308), `I see sparks AGI` with the TikZ listing (#309). Then the **opening scene itself plays backwards** on a quadratic brake (dissolve 5f at 156.07): the unicorn construction (#310), the `I` glyph dimension sheet `U+0049 LATIN CAPITAL LETTER I` (#311), the first frame's axes and spokes (#312), and it parks on the black frame with crop-mark corners (#313 at 156.53) = E01.
- **Report**: burst 3, motion punch at 156.33. **Idea**: the end is the start; the "regenerate" click rewinds the whole video into its own first frame (a seamless loop).

---

## 2. 3D model catalogue

Every distinct model or world, in time order. **Detail**: L = low (a few shapes), M = medium, H = high (hundreds to thousands of parts or per-pixel procedural detail), VH = very high (the model carries visible hand-built sub-structure at every zoom). "Built" names the technique; none of the shaded worlds uses generic PBR.

| # | Model / world | Time | Detail | Tag | How it is built | Material, light |
|---|---|---|---|---|---|---|
| M01 | TikZ plotter sheet + unicorn (and its PCB re-route) | 0.27-9.3 | H (authored geometry) | C2D/PART | Strokes as {points, t0, t1, ease}; octilinear router; geometry morph with a 5-legged checkpoint | Additive hairlines, hot-to-cool trail, lit only by the pen |
| M02 | Loss chart in a 3D scene | 9.33-10.7 | M | L3D | Chart is geometry at z=0 under a perspective camera so the dive is a real camera move | Hairline ink |
| M03 | **Loss-landscape terrain** | 10.7-16.6 | VH | MESH+FS | 44x42 u plane, 640x720 segments displaced by an analytic height (hills + canyon + bowl + 1/r pit); same function on CPU; contour/hachure/illuminated-contour fragment shader; labels on contours | White contour lines on ink, fog, ember spark trail |
| M04 | Throat / tunnel | 16.6-22.5 | M-H | FS | Polar `z = 0.5/R` tunnel, cartilage ridges, swallow wave, ember at the vanishing point | Engraved lines, headlamp |
| M05 | Branching spark tree | 24.1-26.2 | M | C2D/PART | 2^k binary growth on 8ths/16ths, exponential pull-back, glyph-driven shockwaves | Additive hairlines |
| M06 | **Chinese-room library** | 26.2-29.9 | H | L3D | ~40k CPU-projected segments: shelves, individual books, panels, desk, slot, door; flip-board plane with depth sort; beat-grid camera director | White hairlines (max-blend), depth fade, no surfaces |
| M07 | Bag, mycelium, mushrooms | 28.4-29.9 | M | L3D/PART | Beat-burst polyline growth; spring-popped mushrooms | Acid-yellow tips |
| M08 | Smiley mask | 29.9-33, 83-85, 120-124 | L geometry / H shading | FS | Analytic disc (dome, eyes, smile) with engraved hatch; reused as terrain (E27), sticker (E43), tilting prop (E38) | Bone, engraved |
| M09 | **Shoggoth** (12 eyes, 8 tentacles, 4 knots) | 30.5-38.4 | VH | RM | Half-res G-buffer, 96-step sphere trace, smooth-min of sphere + (p,q) torus-knot tubes + tapered tentacles + eye pods; hatch lines driven by tube coordinates; edge-aware upsample; analytic eyes | White engraved hatch, orange rim re-inking, fog to black |
| M10 | Oscilloscope | 38.4-41.6 | M | C2D | Phosphor trace with persistence echoes, graticule parallax, vector-font lyric | Phosphor glow |
| M11 | **Black hole + lensed lyric** | 41.6-45.3 | H | LENS | One thin-lens pass over a graticule + mipmapped text layer, photon ring with Doppler term, infall streaks | Cream/orange ring, black core |
| M12 | Spacetime sheet / vortex | 45.3-52.5 | H | L3D | Well-function grid + 2,000-3,200 log-spiral streamlines; marquee-ring text with per-glyph width instances | White to ember lines |
| M13 | Iron bars | 52.5-58.9 | M | FS | Shaded cylinders closing one notch per beat, soft shadow, parallax | Hatched metal, left-lit |
| M14 | **Basilisk eye** | 60.2-62.5 | VH | FS | Voronoi scale mosaic (each scale a hatched dome), hex brow lattice, granular lid, radial-fibre iris, slit pupil, shockwave | Engraved grey scales, orange iris glow, window glint |
| M15 | **NVDA chart -> banknote** | 62.5-64.5 | VH | FS | Ink candlesticks on log chart; guilloche rosette families, woven band, moon engraved as hatch relief from a crater height field | Cream paper, ink, orange |
| M16 | Omega Point | 64.5-66.1 | M | FS | ~180 engraved rays + beat rings + warp to a point with inversion | Bone on ink |
| M17 | **Odometer** (31 drums) | 66.1-69.8 | H | FS | Cylinder drums with atlas digits, drum j = 10^(E-j), blur taps, settle wave | White-lit digit cylinders, knurled rims |
| M18 | Form 7-B paper world (+ MLP, von Neumann, stamps, burn) | 69.8-81.1 | H | C2D->FS | R/G/B ink channels over a fibre-paper shader; Beer-Lambert overprint; two hinged planes for the tear | Bone paper, typewriter black, orange |
| M19 | **Roadmap map = face terrain** | 80.9-85 | VH | FS | One-shader world with keystone camera and 16-tap shutter; iso-line terrain from a height field that includes the mask; road paint texture | White contours on ink, orange paint |
| M20 | Gantt | 85-88.9 | M | C2D | Bars = word durations; stall at empty slot; slot-to-caret morph | Mono line art |
| M21 | **Paperclip** and **infinite clip lattice** | 96.6-102 | H | RM | Analytic wire SDF (top-down tube), raymarched 2-layer-stack lattice with ceiling slab | Engraved steel, orange rim |
| M22 | **Fuse** | 102-105.7 | H | MESH | Ribbon mesh with over/under braid shader, burn front, ash/embers; per-glyph burn lifecycle | Woven metal, ember light |
| M23 | Orthogonality chart + string | 105.7-109.8 | M-H | C2D+sim | ~200 labelled marks; pitch-driven spring string | Graph paper lit by the spark |
| M24 | **Transformer stack** | 109.8-115.2 | H | L3D | ~1,000 segments/block x ~18 live; dark slab into depth buffer for hidden lines; 3D text planes | Glass-like white hairline slabs |
| M25 | Pressure typography and safe-area fences | 115.2-118.9 | M | C2D | Width/weight stages with spring-masked swaps, fences as broken shapes | Flat greys, orange |
| M26 | **GPU datacentre floor** | 118.9-120.7 | H | FS | Exactly 100,000 cells; pods/racks/aisles; text spelled by a cell mask; beat rings | LED cells, orange heat |
| M27 | RLHF tilting world + hidden tentacle thing | 120.7-124.3 | M-H | FS+C2D | Stepped-spring roll; 16 engraved tentacle tubes behind the mask | Hatched grey, ember rim |
| M28 | Loom tree + [MASK] page | 126.1-129.8 | M | C2D | Probability tree at word starts; token page masked per beat | Mono grey/orange |
| M29 | Droste recursion | 129.8-131.4 | H | FS | Log-polar self-nesting with analytic-gradient sampling; terminal level samples the next scene | Mixed |
| M30 | **Laptop room** | 131.4-137.4 | H | RM | SDF desk/laptop/chair with area-light from the screen, hatch coverage = tone, haze, stickers | White engraved lines, one emissive screen |
| M31 | **Theatre** | 137.4-140.2 | H | RM | SDF proscenium, curtains with folds, seats, spotlight cone, haze, dust | Red curtain lines, one spotlight |
| M32 | Outro instruments (rays, rulers, zero walls, equation, taffy 8) | 140.2-155.3 | M-H | C2D/PART | 2,600 rays; log ruler; shrink-to-fit digit walls; spark tracing real font outlines | Mono + serif |
| M33 | Rewind | 155.3-156.7 | M | FS | 14 plate stills in duotone + the opening scene replayed backwards on a quadratic brake | Orange duotone |

**Headline**: about 33 distinct worlds, of which ~14 are true 3D (terrain, library, shoggoth, black-hole lens + sheet, eye, paperclip lattice, fuse, transformer stack, laptop room, theatre, odometer, GPU floor, Droste, spacetime sheet). Each is built with a *different* technique (raymarched SDF, CPU hairline projection, displaced mesh, lens shader, cell shader) yet all share one engraved look, so the variety reads as one film.

---

## 3. What makes it creative: the 12 strongest ideas

Through-line behind all of them: **the lyric is the physics.** Words and syllables fire geometry events; they are never captions. Eight proofs: A-G-I slams on three sung syllables (3.7-4.4); the X-ray band edge is the karaoke cursor (30.6); the fuse burn front reaches each word at its start (102.5-103.7); the Gantt bars are exactly as long as the words are sung (85-87); "nowhere left to go" is squashed to the actual gap (100.7-102); the guitar string bends to the singer's measured pitch (107.5); the SHROOMS letters keep their layout through the cut (29.2-29.9); `Chat | G | P | T,` is typed on the four sung syllables (16.6-18.4).

1. **Spark-as-pen: a TikZ unicorn plotted live (0.27-9.3).** The "sparks of AGI" pun is staged as a plotter; the lyric's first letter "I" is a rectangle and is drawn as one; AGI slams on three syllables; the drawing is re-routed into PCB traces and "retrained" with a five-legged pony at checkpoint 2. *Why it works*: one data model drives pen, drawing, listing and glow (no drift); wit lands in tiny type (`-log p = 4.61 nats` rolling to 0); the camera is a drum fill of snaps.
2. **Chart becomes world (9.3-16.6).** The loss curve's cliff is the actual cliff; the camera falls out through the chart floor into a terrain whose heights are the chart's log decades; the lyric rides the curve, then the canyon floor; "boss" flips the world 180 degrees. *Why*: metaphor made literal geometry with zero cuts; craft (same height function on CPU and GPU).
3. **Plea, slam, hand-off (16.6-24.1; 52.5-60.2; 88.9-96.6; 124.3-126.1).** A prompt field typed as LLM tokens with probability popups (the sampled token is not the argmax) is swallowed, caged or abandoned; the hook then slams I'M / UPPING / MY / P(DOOM) four times, **escalating by changing the rules** (clean, orange, whispered, strobing). The P(doom) odometer rolls 0.02 -> 0.15 -> 0.42 -> 0.81 -> 0.9999..., and each exit becomes the next scene's first image (spark, eyelid seam, burn-out, weft line). *Why*: a repeating template that never repeats; instrument-as-climax.
4. **Hairline library + crash-dolly camera (24.1-29.9).** FOOM's O's emit shockwaves into an exponential tree; a door is blown off its hinges and the camera crashes into a 40k-segment wireframe room with a flip-board lyric; every beat is an outExpo whip with a roll spring. *Why*: depth from line density only; camera as percussion.
5. **Shoggoth with a mask and 12 shinigami eyes (29.9-38.4).** An engraved raymarched creature under a smiley mask; scan bands whose edge is the karaoke cursor; eyes with comic detector labels and countdown lifespans that expire in an accelerating sequence; flatline hand-off. *Why*: a meme turned into a precise object; hatch parametrised by the geometry so it never shimmers; the HUD is the joke.
6. **The O of NOW is the black hole (41.6-45.3).** A calm oscilloscope CRT-squeezes to a line, the O of NOW blossoms into a lens, the camera dives through it, `SINGULARITY'S` wraps the photon ring with a mirrored ghost. *Why*: surprise (after a locked-off calm), physical correctness for free, typographic wit.
7. **Match-cut chain (59.9-69.8).** Eyelid seam -> slit -> price line -> moon -> banknote -> point -> counter's leading 1 -> odometer. Four visual languages (scratchboard reptile, ink chart, banknote, mechanical counter) stitched by shape continuity; deadpan axis notes and "Rounded down, for safety". *Why*: every transition is a geometric rhyme, not a dissolve.
8. **Paper, map and Gantt (69.8-88.9).** Form 7-B as the physics of ink and paper (typewriter that steps the camera, 30 px-per-frame stamp thump, mirrored "backward", time-remapped "repeat" ending in EPOCH 1,000,000), a page burned in two by the next scene's spark, a sharp-left road whose crater is a giant face, a Gantt whose bars are the sung words. *Why*: bureaucratic satire with real material behaviour.
9. **Paperclips, fuse, string (96.6-109.8).** One line becomes one clip, doubles on 8ths and becomes the floor you fly over; a ceiling squashes the lyric; the slit becomes a fuse that burns the words as they are sung; the orthogonality scatter is plucked like a guitar string. *Why*: metaphors are built, not shown; the voice drives the physics.
10. **Typography as physical force (109.8-124.3).** A beat-locked fall through an endless transformer stack ends in a dead stop and one block rotated 28.6 deg ("disobey"); text is pressure-compressed on every kick; the broadcast safe-area fences are characters that break; exactly 100,000 cells spell "GPU"; RLHF's correction fails on a tilting table. *Why*: the metre breaks exactly where the lyric says disobey; data are accurate (Chinchilla 20 -> 20,000 tokens/param).
11. **Withholding and recursion (126.1-140.2).** A Loom probability tree draws "Loom" at p 0.31; a [MASK] page; a Droste recursion that terminates in the next scene; a laptop that opens on `REDACTED` and shuts, leaving a sleep LED; `WITHHELD` over "know"; an empty theatre with a spotlight. *Why*: restraint after 100 s of density; the story is told by what is not shown.
12. **The number ladder and the loop (140.2-156.7).** P(doom) overflows its bar (1.01, 2.00, pi, 42, a googol, "does not fit"), an infinity hops into an 8, splits into 0/0 and inflates into NaN on the beat the drums stop; a Regenerate button is clicked and the film rewinds into its first frame. *Why*: every beat has a job and a joke; the end is the beginning.

---

## 4. Art direction

**Palette (tokens from the source, matched by the report's swatches).**
- ink `#0A0A0B` (ground; mean luma 49, 38% of frames < 25), ink2 `#151517` (panels), graphite `#5E5B57`, ash `#9C978F`, bone `#EEE9DF` (type and paper; seen as cream `#E5E2D8`).
- **signal** `#FF4D12` (swatches `#F36D27`, `#FF5A0D`): the single accent for the sung word, spark, instruments, danger; **ember** `#FF8A3D` for hot cores; blood `#C21D0B` (char, curtain); **acid** `#D8FF3C` (swatches `#EEE065`, `#D8D53B`) used *only* for SHROOMS.
- Rule: only signal and ember exceed the bloom threshold (0.85), so only they glow; bone type stays crisp. The report counts 30 distinct palettes over 84 shots, but all are rearrangements of ink/bone/orange.
- Deliberate inversions are narrative events: bone-ground hook 1 (carry of the prompt white-out), the orange field of hook 2, the paper plates (Form 7-B, NVDA chart/banknote), the cream flash into the detonation, the duotone rewind.

**Lighting mood.** Chiaroscuro on near-black: *everything is lit by the spark*. Pools of light (paper warms near the pen, the ash pool of the Gato prompt, the chart lit only near the spark, the laptop screen as the only lamp, one spotlight). Engraved forms are lit by a single back rim that **re-inks the hatch lines in orange**. Fog fades to black with depth. Post: bloom 0.55-0.85, red-orange film halation 0.25, chromatic aberration 1.2 by default and 4-7 on impacts, grain 0.055 (0.12 on the rewind), vignette 0.35-0.45, 8-bit dither. Motion blur is physical (sub-frame shutter) plus cheap geometric smears.

**Line and texture language.** Hairline engraving everywhere: ~1-2.5 px lines, **tone is hatch density and width, never fill**. Contours for height, hatch bands wrapped around tube coordinates for bodies, scale-by-scale domes for the eye, guilloche rosettes for the banknote, dotted `textPoints` for particle type, marker strokes and single-stroke fonts for "human" marks (the X over von Neumann, `We`, `obsolete`). Surfaces are never PBR: white lines on black. Anti-moire discipline (hatch LOD, flat-grey fallback when lines get denser than ~3 px). Paper plates add fibre noise, punch holes, ink overprint and stamp voids; screen plates add CRT squeeze, scanlines, phosphor persistence.

**Typography system.**
- **Archivo** (static width 62 / 75 / 87.5 / 100 / 112.5 / 125 x weight 300 / 500 / 700 / 900) for lyrics and slams; **width is an expressive axis** (LIES, FOOM, ASKEW, dense pressure step width on beats, hidden by a horizontal spring).
- **Cormorant Garamond italic** for gravity and withholding: `The Omega Point's coming soon`, `blues`, `Loom`, `What did Ilya see?`, `Was it all for show?`, the `(doom)` of the end equation.
- **IBM Plex Mono** for instruments and deadpan micro-copy (13-17 px labels, counters, footnotes, QC logs, prompt fields).
- Single-stroke vector fonts (script, hscript, tech, osmotron) for pen-written marks.
- Karaoke code: unsung = outline or 10-50% bone ghost; sung = signal (HDR so it blooms); cools to bone in 30-350 ms; word hit = scale pop 1.1-1.35 with 45-160 ms decay; hard slams add 2 frames of ink/bone inversion, shake and zoom pulse. Text always **lives in the scene**: on a curve (loss), on a canyon floor, stamped on a board, lensed by a hole, burned, squashed by a ceiling, hidden behind `[MASK]`, spelled by cells.

**Consistency.** Very high: same palette, same hairline engraving, same three typefaces, same grain/bloom/CA, the spark as the through-line object, a `P(doom)` cameo in every plate's own idiom (terrain contour label, prompt fine print, scope readout, detection box, mail footer, scatter label, stack HUD, GPU panel, odometer footnote), crop-mark frame bookends. Variety comes from *world and camera*, never from a different look. Mood: cold, bureaucratic, deadpan; orange always means heat, attention or danger.

---

## Appendix A. Hand-offs and match cuts (the film's connective tissue)
| time | from -> to | device |
|---|---|---|
| 9.30 | open -> loss | pen travels through black to the exact spot where the loss spark starts |
| 10.66-11.2 | loss chart -> terrain | one camera move through the chart floor, spark in free fall |
| 16.6 | basin -> throat | dive ends at a vanishing point; next scene looks down a tunnel |
| 22.1-22.5 | prompt -> hook 1 | swallow rush + whiteout becomes the bone ground |
| 24.1-24.3 | hook 1 -> room | P(DOOM) outline shatters on "cause" |
| 26.0-26.15 | FOOM -> library | exposure burn to white, then crash through a door |
| 29.2-29.9 | room -> shoggoth | SHROOMS letters keep their screen layout |
| 37.96-38.4 | shoggoth -> scope | picture squashes to a 1-px line that is the scope's baseline |
| 41.34-41.6 | scope -> NOW | CRT switch-off squeeze -> `NOW` with the O as lens |
| 51.4-52.5 | vortex -> paperclip | lyric dots land on a clip outline |
| 60.2 | hook 2 -> eye | instrument squashed to a line, eyelids close on the seam |
| 62.5 | eye -> chart | slit becomes the price line |
| 64.1-66.1 | banknote -> point -> counter | note inverts and warps into a point = the counter's `1` |
| 80.7-81.1 | bureau -> roadmap | next scene's spark burns the page in two |
| 88.4-88.9 | Gantt -> prompt 3 | empty CDR slot morphs into the caret |
| 101.7-102.05 | paperclips -> fuse | slit-close line is the fuse |
| 109.55-109.8 | fuse -> stack | spark inhale lands on the stack's axis |
| 118.75-118.9 | dense -> GPU | dive into the E of FENCE = one lit cell |
| 118.9-124.3 | GPU -> askew -> hook 4 | a dutch roll is handed over mid-flight, twice |
| 126.1 | hook 4 -> loom | squashed number is the weft line |
| 131.14-131.43 | loom -> Ilya | Droste dive terminates in the next scene's first frame |
| 140.1-140.23 | theatre -> outro | seam collapses to a spark that detonates |
| 155.3-156.6 | outro -> open | rewind into the first frame |

## Appendix B. P(doom) ladder and recurring gags
Hook values: 0.02 (open table) -> **0.15** (22.5) -> **0.42** (58.9, drawn "0.41" in frame) -> **0.81** (95.2, hairline) -> **0.95 -> 0.99999...** (124.3) -> **1.00** (140.2) -> 1.01, 1.10, 1.50, 2.00 -> pi, 10, 42, 1,000 -> 1e9, 1e30, 1e100, 1e1000 -> inf -> 8 -> 0/0 -> NaN. Cameos in every plate, each with a different qualifier: `0.03/0.04` (terrain), `context-dependent`, `0.07` (scope), `NOT A CONFIDENCE SCORE` (shoggoth), `mood-dependent`, `0.43. Also rounded down.`, `within tolerance`, `cat-dependent`, `scaling as planned`. Other running gags: footnotes that undercut (`Rounded down, for safety`), fake units (`units: dooms`), QC logs, the smiley mask as RLHF, the spark.

## Appendix C. Camera grammar
- Cuts and whips land on beats: 65% of hard cuts within 50 ms; punches are small (+2-5%, fast decay) on kicks, big (x3-x6 over 0.4-1.8 s) on set pieces: library crash x6.33 in 1.8 s, stack fall x4.18, Droste dive x1.6 per beat.
- Snap = outExpo over 0.1-0.5 s; dives = inOutCubic; springs (3-3.6 Hz, damping 0.4-0.75) for rebound; roll keys 0.02-0.07 rad on snaps, bigger rolls (up to pi) as set pieces; zoom is done about the move's fixed point, in log space.
- Camera as character per world: locked-off (scope), handheld crash zooms (library), crane (spacetime sheet, paperclips), dolly (stack), orbit-whip (laptop), slow creep (prompts, theatre), whip + 16-tap shutter (roadmap).
- Report cross-check: static 18%, zoom-in 35%, zoom-out 17%, pan 19%, rotate 12% of frames; 90 zoom-in and 60 zoom-out punches, 107 pan punches over 156 s.

## Appendix D. Weak spots (do not copy)
Much micro-detail (dimension values, protractor ticks, QC log lines) is 6-13 px and only readable on pause. The unicorn is small in the frame until AGI. The middle of E03 (5.9-7.7 s) is a slow PCB state held up only by the morph and tremor. Hook 3 and the Gato prompt are so dark that the keyframes barely register them.

## Appendix E. Shot index (all 84 shots)
1 E01 | 2 E02 | 3 E03 | 4 E04 | 5-6 E05 | 7 E06 | 8 E07 | 9-12 E08 | 13 E09 | 14 E10 | 15-17 E11 | 18-19 E12 | 20 E13 | 21 E14 | 22 E15 | 23 E16 | 24-25 E17 | 26 E18 | 27 E19 | 28-32 E20 | 33 E21 | 34 E22 | 35-36 E23 | 37 E24 | 38-39 E25 | 40 E26 | 41 E27 | 42 E28+E29 | 43 E30+E31 | 44 E32 | 45 E33 | 46 E34 | 47 E35 | 48-50 E36 | 51 E37 | 52 E38 | 53-59 E39 | 60-61 E40 | 62 E41 | 63-64 E42 | 65-66 E43 | 67 E44 | 68 E45 | 69 E46 | 70 E47 | 71 E48 | 72-73 E49 | 74-76 E50 | 77 E51 | 78-84 E52.
