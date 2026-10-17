# GAP: Silicon Shield versus the reference, and the redesign plan

Evidence: `docs/reference/ANIMATION_SCRIPT.md` (sections 2-4, appendices), all 44 contact sheets of our render (350 keyframes), 6 full-size keyframes (k059 machine, k098 node1, k139 hbm, k154 key, k174 fab, k255 dream), `build/perceive/{ours,ref}/report.md` global stats, `app/src/timeline.ts`, `docs/STORYBOARD.md`, scene headers in `app/src/scenes/*.ts` (intent only), `data/lyrics.json`. Times are video seconds (128 BPM, bar = 1.875 s). Caveat: `whoscrown` and parts of `grid1` have almost no sampled keyframes, so those rows rely on the code header; I flag them.

## 0. Verdict in eight lines

1. We have the same number of worlds as the reference (32 plates vs 33 worlds) but 72% of ours are flat graphic design (23 of 32 are 2D shader or canvas). Only 9 plates have a camera travelling through lit 3D, and only two (`key`, `node1`) have hand-built sub-structure. The reference has about 14 true-3D worlds, almost all very detailed.
2. The song's two subject objects, the EUV machine and the GPU, are the worst-rendered things in the film. At 16.70 s, under the words "One Dutch machine", the machine is a 150 px parallelogram on black (k059). No chip or GPU is ever shown as an object.
3. We have no single look. `STYLE_BIBLE.md` literally says every plate has "its own visual instrument and idiom". The result is 61 colour clusters (reference 30), engraved hatch, PBR chrome, PBR brass, flat low-poly, LED, 8-bit navy, bone paper and thermography in one film.
4. The lyric is a caption in 11 plates (bottom-left text under the picture). In the reference the lyric is the physics. We have about 4 true proofs (`hold` pitch-to-string, `tons` containers spell 180 t, `shield` beam outlines "light", `tin` pen script).
5. The edit is 1.7x as dense (53.6 vs 31.8 boundaries per minute), with 68 shots under half a second, 4x the flashes per minute (26 vs 7), and 14 of 18 soft transitions are plain dissolves. Our cuts are on the beat (66%), but motion inside plates is not (r = -0.03 vs +0.07).
6. Best jokes exist (SOLD OUT / YOUR TOWN, the sun tick, LEVEL 2 THE FOUNDRY, NL-JP-KR-US-TW pins, the $30,000 tag) but nothing recurs and escalates. The TPP counter is a number nobody cares about, not a character.
7. The ending does not loop. It fades on a grey parallelogram of lines (k348-350). The storyboard's promised "dive into the grain" is not in the render.
8. Fix: one rendering language (SEM micrograph), 12 hero worlds built once and revisited in escalated state across the three choruses (93 s of 142 s), a stowaway-grain running gag ("UNIT 0001"), an edit diet, and a loop that ends on the film's own first frame.

---

## 1. Our plates, one row each (follows `timeline.ts`)

Technique tags: **3D** = camera travelling through lit 3D geometry; **2D shader** = fullscreen analytic shader; **canvas** = Canvas2D/UI layer; **mixed** = both. WOW 1-5 uses the reference's scale (5 = trailer shot).

| # | id | time (s) | lyric | on screen | technique | WOW | main weakness |
|---|---|---|---|---|---|---|---|
| 1 | sand | 0-7.5 | (intro) | Raster line reveals one engraved quartz grain, facets, contour field, silicon lattice, SILICON SHIELD spelled by atoms, one atom ignites | 3D (raymarched grain, instanced lattice) | 4 | Best plate. The 2.8-4.8 s dive is a texture zoom (contour field reads as a topo map; lattice is a stock sphere grid); title is held about 1 s. |
| 2 | tin | 7.5-11.25 | Fifty thousand tin drops every second | Column of mirror-sphere droplets, giant FIFTY THOUSAND slate to 50,000, pen-written script, timing diagram | 2D shader | 2 | A slide, not stroboscopy: counter fills 60% of frame, droplets are 40 px, 6 shots in 0.8 s at 8.0-8.8. |
| 3 | laser | 11.25-15 | shot by a laser, hotter than the sun | White flash, thermal field with isotherms, stacked type, scale bar to 220,000 C x40, rings | 2D shader | 3 | Type lies on a flat blob. No laser, tin or mirror in space. The best beat (the sun tick) is 20 px. |
| 4 | machine | 15-18.75 | One Dutch machine, and the whole world's waiting | Mirror rings, a 150 px parallelogram "HALL 4", crane-out to a dot-matrix world map with queue lines to one point, cable | mixed | 3 | The title object never appears (k059). The only strong image is the map at 18.4 s. |
| 5 | tons | 18.75-22.5 | Hundred eighty tons, and everybody wants one | Top-down yard of 40 containers spells 180 t; split-flap board ONE WAITLIST x6, YOUR TOWN flips to SOLD OUT | mixed | 3 | Best joke in the film, staged as a UI board. Containers are grey boxes. |
| 6 | line | 22.5-26.25 | Then Washington drew a line in the sand | Newsprint stripes, bone broadsheet with halftone world map, drawn line, dots become sand, tape stop, black | canvas | 3 | Brightest plate between two dark ones; flat. "Dots are sand" resolves in one frame (#73). |
| 7 | drop1 | 26.25-30 | Every wafer is a weapon now | Cream flash, EVERY on amber, WAFER on a wafer, is / a / WEAPON, NOW on a reticle, TPP 4,800 | 2D shader (one 3D prop) | 3 | 10 shots in 3.75 s. The hero wafer is a brown checker waffle: no notch, serial or die detail (#82-83). |
| 8 | node1 | 30-33.75 | Two nanometers holding the crown | Orange-hatched GAA transistor, numerals 7/5/3/2 as white slabs, dolly through gate, crown of lit cells | 3D (hairline) | 4 | Best model, but numerals cover half of it; 8 shots and 5 flashes (31.5-33.8) shred the dolly. |
| 9 | grid1 | 33.75-37.5 | Gigawatts in a cornfield town | Crown dots scatter into a perspective field of lit rectangles, GW counter | 3D | 3 | 3 keyframes in 3.75 s; no cornfield, no datacentre; lyric is a 14 px bottom caption. |
| 10 | down1 | 37.5-41.25 | Nobody's slowing the silicon down | Tilted bone log chart, beam rides the curve, words along it, curve goes vertical, DOWN flips | mixed | 4 | Chart has axes but no data (no 4004, no B200 point). Third light/dark swap in 15 s. |
| 11 | post1 | 41.25-48.75 | weapon now, oh oh oh (x2) | 8-bit CRT "FAB RUN" skyline game, GAME OVER glitch, LEVEL 2 in navy | canvas | 2 | Off-palette (navy at 47.8 s), no chip content for 7.5 s, glitch uses 3 flashes. Pastiche. |
| 12 | hbm | 48.75-52.5 | Twelve-high memory stacked like a tower | Twelve chrome slabs with orange TSV fringe on a reflective floor, 90 px lowercase type left | 3D (PBR) | 3 | Generic chrome render: 12 identical dies, no cutaway, no base die. Type competes with model (k139). |
| 13 | smuggle | 52.5-56.25 | smuggled in suitcases, rented by the hour | Amber x-ray suitcases with GPU outlines, ITEM FLAGGED, $ meter, sand hourglass | 2D shader | 3 | Right idea at icon scale (suitcase 250 px, GPU 60 px); no declared-item gag. |
| 14 | island | 56.25-60 | One little island, one narrow sea | Bone nautical chart, amber contour island, dividers 126.0 km, compass rose | 2D shader | 3 | Flat chart, not a model. Prints 126.0 km where the bible says 130. Second bone plate in 7 s. |
| 15 | key | 60-63.75 | holding the future like a silicon key | Brass key, compass-rose bow, sectioned pin-tumbler lock, pins tagged NL JP KR US TW, bond-pad bit, barrel becomes wafer | 3D (PBR) | 4 | The one model with a joke in the geometry (k154). Tags are 10 px; brass PBR is another material language. |
| 16 | shield | 63.75-67.5 | They call it a shield made of sand and light | Dark wafer circle, passing dies fill a heraldic shield, sand pours through failed dies, beam outlines | canvas | 3 | The film's title idea is a 2D grid. The shield deserves the best 3D object. |
| 17 | fab | 67.5-71.25 | and nobody sleeps in the fab tonight | Shield dies dissolve into windows, flat-shaded amber cleanroom corridor, shift clock, tape stop | 3D (flat low-poly) | 3 | Game-level look (k174), no tools or overhead rails, mid-tone yellow reads as another film. |
| 18 | drop2 | 71.25-75 | Every wafer is a weapon now | Stacked-copy slam in bone/ink, engraved sawblade, grey-blue flashes, TPP 19,200 | 2D shader | 3 | Same slam with a palette swap, 8 shots; grey-blue (#788090) flashes break the palette. |
| 19 | node2 | 75-78.75 | Two nanometers holding the crown | Wafer, procedural die-shot zoom (brown mosaic), laurel around a crown icon, stacked left type | 2D shader | 3 | Die reads as a pixel mosaic; laurel plus crown icon is the clip-art the bible bans. |
| 20 | grid2 | 78.75-82.5 | Gigawatts in a cornfield town | One-line electrical diagram, breakers close, GW gauge | canvas | 2 | Dashboard UI. Same gauge appears in grid1, grid2, down2, grid3. |
| 21 | down2 | 82.5-86.25 | Nobody's slowing the silicon down | Dashboard speedometer, transistor odometer, pedals, DOWN flips | canvas | 3 | Skeuomorphic UI; the brake-pedal gag is invisible at 1080p. |
| 22 | post2 | 86.25-93.75 | weapon now, oh oh oh (x2) | LED stadium board, WEAPON NOW in 5x7 pixels, three O lamps, TPP ticker, powers down | 2D shader | 3 | 7.5 s of nearly one frame. |
| 23 | atom | 93.75-97.5 | Every atom counted, every border drawn | STM scan of copper, tally 038/098/474, probe drags atoms into a border, Cormorant caption | 2D shader | 3 | Closest to the new look. The border is 40 px; the out-blur eats the last 0.5 s. |
| 24 | dream | 97.5-101.25 | every model dreaming on a chip we'll never own | Engraved corduroy terrain of a weight matrix, $30,000 price tag swings in, flattens | 3D (displaced mesh) | 2 | Terrain reads as noise (k255); "the chip we'll never own" is never shown. |
| 25 | crack | 101.25-105 | If the shield ever cracks, if the lights go out | Lit shield-shaped wafer map, crack runs, city lights die in waves, one amber dot | 2D shader | 4 | Story peak, but flat; the crack is a polyline. |
| 26 | whoscrown | 105-108.75 | who's left holding the crown? | Per code: void, empty crown of 56 fins turns under one light, collapses to a line | 3D | 2 | No sampled frame shows the crown: this window and `hold` are one 10.9 s shot with 2 keyframes. Verify exposure. |
| 27 | hold | 108.75-116.25 | Hold the line / hold the line | Glowing string, standing-wave modes follow sung pitch, lyric on the string, TPP flickers, snaps at 115.3 | canvas | 4 | Best lyric-as-physics we have; one flat line for 7.5 s with 10 px labels. |
| 28 | drop3 | 116.25-120 | Every wafer is a weapon now | Palette strobe, echo stacks, die-shrapnel tiles with words, infinity over NOW | 2D shader | 3 | Third copy of the slam; shrapnel is flat tiles; 10 shots, 3 flashes. |
| 29 | node3 | 120-123.75 | Two nanometers holding the crown | Perspective floor of icon tiles flips, tiles light into a crown | mixed | 3 | "Recap" is generic line icons, not the film's own worlds. |
| 30 | grid3 | 123.75-127.5 | Gigawatts in a cornfield town | Tilted aerial of lit rectangles in overload, lightning, whiteout | 3D | 3 | 4 s of orange blow-out ending in a bone frame; still no cornfield. |
| 31 | down3 | 127.5-131.25 | Nobody's slowing the silicon down | Wall of 28 mini charts and gauges, DOWN flips, all launch upward | canvas | 2 | Tiles are 80 px; third DOWN flip in the film. |
| 32 | outro | 131.25-142.2 | (whisper) Every wafer is a weapon now / export restricted | PROCESS TRAVELLER form fills, EXPORT RESTRICTED stamp, tilts into a plotted line parallelogram that fades | canvas | 3 | 8.8 s of static paper (motion 0.02); no grain, no loop; ends on grey lines. |

Tally: technique 3D 9, 2D shader 11, canvas 8, mixed 4. WOW: 0 fives, 6 fours, 20 threes, 6 twos (mean 3.0). Reference: 12 fives, 22 fours, 17 threes, 1 one (mean 3.85; 65% of its entries are 4 or 5, ours 19%).

---

## 2. The gap, area by area

### 2.1 Measured edit rhythm

| stat | ours | reference | note |
|---|---|---|---|
| shots / length | 128 / 142 s | 84 / 157 s | 1.5x the shots in 0.9x the time |
| boundaries per min (hard cuts) | 53.6 (46.0) | 31.8 (27.6) | 1.7x |
| median shot | 0.47 s | 1.12 s | |
| shots under 0.5 s (share of runtime) | 68 (12%) | 31 (5%) | |
| runtime inside shots of 3 s or more | 43% | 57% | 5 s or more: 22% vs 38% |
| flashes (per min) | 26 (11.0) | 7 (2.7) | 4.1x per minute |
| soft transitions | 18, of which 14 plain dissolves | 11 | |
| cuts within 50 ms of a beat | 66% | 65% | equal: cutting is not the problem |
| motion energy vs onsets (r, lag 0) | -0.03 | +0.07 | motion inside shots is off the beat |
| half-beat fold z / beat fold z | +0.6 / +0.5 | +3.4 / +1.5 | the reference moves on the 8th note |
| mean luma / frames under 25 | 75 / 11% | 49 / 38% | ours is mid-grey |
| text on screen / distinct strings | 84% / 379 | 69% / 200 | |
| camera mix static/in/out/pan/rot | 28/15/33/18/5 | 18/35/17/19/12 | we zoom out twice as much, they dive in twice as much |

The three drops alone carry 28 of 128 shots (10 + 8 + 10). The reference's bimodal shape (long worlds of 5-13 s, bursts only at hooks and the finale) is ours inverted: we burst everywhere, so a burst means nothing.

### 2.2 3D models and detail

- Reference: about 14 true-3D worlds with hand-built sub-structure at every zoom (40k-segment library, shoggoth with 12 eyes and 8 tentacles, 31 odometer drums, 100,000 GPU cells, roadmap that is a face). Every model carries a count and a mechanism, and is held for 5-13 s so the detail pays off.
- Ours: the hero objects of our own story are the weakest. Machine: absent (k059). Droplet: a column of identical 40 px spheres. Wafer: a brown checker slab (#82-83). HBM: 12 identical chrome slabs (k139). GPU: never shown. Island: a flat chart. Shield: a 2D grid. Terrain (dream): noise (k255).
- Exceptions to copy: `key` (springs, 5 labelled pins, bond-pad bit, k154), `node1` (hidden-line GAA, k098), `sand` (grain).
- Models are not built to be looked at: median shot is 0.47 s.

### 2.3 One rendering language

The reference varies the world and the camera, never the look (ink, bone, one orange, hairline engraving, three typefaces, same grain). We vary the look per plate by policy. Eight materials in 142 s: engraved hatch (sand, node1, atom, dream), PBR chrome (hbm, drop wafer), PBR brass (key), flat-shaded low-poly (fab), LED and pixel (post1 navy, post2), bone paper (line, island, down1, outro), thermography (laser), UI dashboards (grid2, down2). Mean luma 75 vs 49 because of bone plates, amber fields and white flashes; we are rarely dark. Root cause: `STYLE_BIBLE.md` ("each plate has its own visual instrument and idiom"). The fix is in section 3.

### 2.4 Lyric as physics

- Reference proofs: A-G-I slam on sung syllables, X-ray band edge is the karaoke cursor, fuse burn front reaches each word as sung, Gantt bars are as long as the words, guitar string bends to the measured pitch.
- Ours: real proofs in `hold` (mode steps with pitch), `tons` (40 containers spell 180 t on 16ths), `shield` (beam outlines "light"), `tin` (pen writes the words). In 11 plates (node1, grid1, hbm, smuggle, island, key, shield, fab, atom, dream, crack) the lyric is a subtitle under the picture, coloured amber as it is sung. That is styling, not physics: no geometry changes at syllable times.
- Rule going forward: every sung word that has an object must trigger a geometry event at its `start` (times in `data/lyrics.json`). Bottom captions allowed in at most 3 plates.

### 2.5 Transitions and match cuts

- Good ones we have: atom ignites into droplet (7.2-7.5), plasma rings become mirror rings (14.7-15.0), queue lines bundle into a cable into the crane hook (18.4-18.7), flap rules become newsprint (22.5), crown cells become town lights (33.8), shield dies become fab windows (67-68).
- Weak: 14 of 18 soft transitions are plain dissolves of 5-13 frames, six black or white interstitials, and many hand-offs are UI to UI (meter becomes speedometer, LED dots become atoms). The reference's cuts change scale and category (eyelid seam, price line, moon, banknote, point, counter).
- Our native rhyme should be **scale** (a chip looks like a city, a stack like a tower, a wafer like a shield; section 4).

### 2.6 Wit and running jokes

- Reference: P(doom) cameo in every plate in that plate's idiom, with a deadpan qualifier each time, escalating 0.02 to NaN and paying off in the ending.
- Ours: TPP appears in about 7 plates (drops, post1, post2, hold, outro) as a plain counter. Scattered one-offs are the strongest material: SOLD OUT / YOUR TOWN, the sun tick, LEVEL 2 THE FOUNDRY, the country-tagged pins, the price tag. Micro-copy is 6-13 px and unreadable at 1080p; the reference has the same weakness (its Appendix D), do not copy it.

### 2.7 Typography

Reference: Archivo width as an expressive axis, Cormorant for gravity, Plex Mono for instruments, and text that lives in the scene (lensed, burned, squashed, spelled by cells). Ours: giant Archivo overlays that cover the hero object (node1 numerals, hbm type, laser type, node2 block), stacked-copy extrusion in drop2/3, 84% of runtime has text on screen (379 strings), serif only in the bridge. Type is placed on top of images, not made of them.

### 2.8 Ending

Reference: P(doom) overflows, becomes NaN on the beat the drums stop, a Regenerate click rewinds the film into frame 1. Ours: the traveller form, a stamp, a tilt into plotted lines, fade to grey (k345-350). `outro.ts` promises "dive into the specimen box, into the one grain of sand the film began with"; it is not in the render, and the first frame (warm grey `#3B3837`, then an amber line at 0.07 s) is not matched by the last.

---

## 3. A unified rendering language that is ours

### 3.1 Three candidates

| criterion | SEM micrograph | Photomask / lithography | Blueprint |
|---|---|---|---|
| Fit to subject | Very high: SEM is the actual fab inspection tool; works from a sand grain to a transistor to a bond wire; our opening already reads "SAMPLE 01 SEM 15 kV" | High for EUV and dies, low for sand, cities, wire, key | Generic "tech explainer" |
| Works on true-3D hero models | Yes: continuous tone, rim light on every edge, cavities go dark, so depth comes free from SDF/mesh normals | Poor: mostly flat layouts, colour-coded layers (rainbow) conflict with palette | Wireframe only; reads as the engraving again |
| Distinct from the reference | Yes: filled surfaces, continuous grey, edge glow, noise; reference is white hairlines, tone by hatch density | Yes, but flat | No: same line-on-dark logic; cyan is banned |
| Palette fit (ink, bone, amber, red stamps) | Native: grey ramp = ink to bone; amber = element-map overlay | Needs layer colours | Needs blue |
| Free motion and transitions | Raster reveal, beam blank, charging streaks, mag jump, detector swap | Exposure slit, field stitching | None |
| Cost | One shared pass plus a data strip | Per-plate art | Cheap, cheap-looking |
| Risk | Grey monotony: mitigated by rim, amber, and big type | Flat | Cliche |

**Pick: SEM micrograph ("SE-look").** Steal from photomask only a transition: a rectangular exposure-slit wipe (26 x 33 mm field stepping across the frame) and stitched-field seams on the wafer. Nothing from blueprint.

### 3.2 SE-look specification

- **Signal model (shading).** There is no PBR, no specular, no Fresnel. Signal `S = Z * tilt * det * cav + edge`. `Z` material contrast: carbon tape 0.12, resist and SiO2 0.30, silicon 0.50, copper/tungsten/tin/gold 0.85. `tilt = 1/max(cos(theta),0.25)^0.8` where theta is the angle between surface normal and view axis (steep faces glow). `det = 0.65 + 0.35 * dot(n_xy, d)` with a side detector at azimuth 215 degrees, so one side of every form is lit like an SEM detector. `cav = exp(-h/L)` with L = 0.3 x feature width: trenches and slots go dark (depth for free). `edge` = 1.6 x clamp(normal discontinuity or depth Laplacian), see rim below.
- **Tone mapping.** Output ramp in linear: ink `#0A0A0B` at S=0, graphite `#5E5B57` at 0.35, ash `#9C978F` at 0.60, bone `#EEE9DF` at 0.92, clipping at bone (never pure white; pure white is reserved for three designed events). Contrast 1.15 about 0.4. Targets: mean luma 45-55, at least 30% of frames under 25, under 10% over 180 (paper plates and flashes excepted).
- **Colour.** Monochrome except one hue. Amber `#FFA41B` is the "element map" overlay (EDS false colour for tin): it marks the beam, plasma, whatever is hot or fresh, and the sung word. Scenes write amber into a separate one-channel target, composited by screen at that mask. Export red `#E0312B` only on stamps and the TPP threshold line (at most 4 moments). No other hue, ever.
- **Edge and rim.** The SE edge effect is the hero effect: every silhouette and crease (normal discontinuity above 0.35 rad, or depth step) gets a bone rim 2.2 px wide at 1080p, scaled by tilt, clamped at 5 px, with a 1 px dark inner undercut for crispness. Features thinner than 2 px flare to full rim (thin edges sparkle in real SEM). Amber re-inks the rim only on the edge nearest the beam.
- **Texture.** Every surface carries 3-octave micro-roughness (silicon 4%, SiO2 smooth with a charging gloss, metals with 3 um Voronoi grain boundaries +-12%, resist porous 10%). Vertical walls get scalloping (etch striations, pitch = wall height / 40). Dust: 0.3% sub-pixel bright specks with a 1 px halo on every frame, so the film is literally full of sand. Charging streaks (horizontal smear up to 60 px on insulators) trigger on kicks instead of generic chromatic aberration.
- **Raster grain.** Shot noise `sigma = 0.045 / sqrt(S + 0.04)` (dark areas are noisier), correlated 4 px along the scan axis; per-row jitter 0.35 px sigma and a line tear (+-3 px) every 55 +- 20 rows. Frame averaging is the motion language: `sigma *= 0.35 + 0.65 * exp(-t_still/0.35 s)`. The image is noisy while the camera moves and clean when it holds, and every kick punch re-noises for 80 ms. This makes every hold feel alive and ties the grain to the beat.
- **Depth haze.** No coloured fog. Depth is signal loss: contrast lerps toward ash by `0.35 * (1 - exp(-z/Lz))`, noise rises with distance, a detector vignette of 0.30, and focus pulls (blur 1-3 px) as a beat-synced camera tool.
- **Bloom.** Amber and charging halos only: threshold 1.0, strength 0.6 for amber, 0.15 at radius 10 px for bone over 0.95. Bone rim never blooms. Film halation off (it is not a film). Chromatic aberration only on hits (up to 3 px).
- **Data strip.** A 54 px black footer on every world plate (hidden during chorus slams): Plex Mono 13 px `EHT 5.00 kV  WD 4.2 mm  Mag 12.4 K X  Signal A = SE2  LOT 7A-0042  UNIT 0001`, with a live scale bar at left whose length and label follow the camera. The lyric never sits in the strip.
- **Typography.** Lyric words are objects in the specimen: (1) extruded Archivo 900 letters shaded by the same SE pass; (2) e-beam-written single-stroke text (the beam draws it in amber and it cools to bone in 30-350 ms); (3) etched trench text in silicon; (4) letters built from the scene's own parts (lit rows, dies, pods). Sung word flashes amber then cools. Cormorant italic only for the bridge and the last two lines. Mono for instruments (13-17 px). Bottom captions allowed in at most 3 plates.
- **Transition vocabulary (replaces dissolves and flashes).** Raster reveal (image builds top to bottom behind a bright scan line), beam blank (collapse to a line then a dot), magnification jump (scale bar rolls a decade per beat), detector swap SE to BSE (2 frames of tone inversion on the chorus entry; this is the one allowed flash), stage move (pan), exposure-slit wipe.
- **Paper plates.** At most four bone-paper intermissions (`line`, `island`, `down1`, traveller), about 12% of runtime, as palette inversions.
- **Retrofit for kept plates.** A colour-agnostic `semGrade` pass (luminance to ramp, Sobel rim from luminance, scan grain, vignette; amber survives only through the amber mask) turns any existing plate into the look in about an hour. Hero worlds use the full G-buffer version (`semShade`: depth, normal, material Z, curvature). Both live in a new `engine/se.ts`.

---

## 4. Redesign plan

### 4.1 Structural moves

1. **Build once, revisit three times.** 14 of our 32 plates are chorus lines or chants (12 chorus lines plus 2 chants). Each chorus line gets one hero world; chorus 2 and 3 revisit it in an escalated state with a new camera. W1, W4, W5 and W9 alone cover 11 slots.
2. **Scale rhyme is the match-cut engine.** Wafer ~ shield, die ~ town, stack ~ tower, crop rows ~ bitlines, fab pods ~ trains, stub carousel ~ revolver, grain ~ defect.
3. **Edit diet.** 128 shots to 80 or fewer; median at least 0.9 s; flashes at most 8; dissolves at most 4 (everything else a rhyme cut or hard on the beat); bursts only in the three drops (6-8 shots each, still the user's favourite slam) and the shrapnel; at least 6 shots of 5 s or more covering at least 35% of runtime; every plate gets kick-locked camera punches (+2-5%, events from `data/events.json`) so motion goes on the beat.

### 4.2 Ranking by creative payoff per hour

Payoff 1-10, hours are rough single-owner estimates (the shared SE pass is built first; "after" means depends on another row). Ratio = payoff / hours.

| rank | item | slots | payoff | hours | ratio | note |
|---|---|---|---|---|---|---|
| 1 | Running gag UNIT 0001 ladder | 14 plates | 7 | 4 | 1.75 | one overlay function, one grain sprite |
| 2 | Edit diet and merges | whole film | 8 | 6 | 1.33 | retime, delete flashes, merge `tin`+`laser`, `whoscrown`+`hold` |
| 3 | W7 The Shield | 63.75-67.5 | 8 | 8 | 1.00 | after W1 |
| 4 | W11 The Chamber | 41.25-48.75 | 7 | 8 | 0.88 | after W1-W4 (reuses their models) |
| 5 | W12 The Stub (loop ending) | 131.25-142.2 | 8 | 10 | 0.80 | needs gag and SE |
| 6 | W10 The Wire | 105-116.25 | 9 | 12 | 0.75 | reuses `hold` physics |
| 7 | SE pass, data strip, raster transitions | all | 10 | 14 | 0.71 | build first |
| 8 | W6 The Tower | 48.75-52.5 | 7 | 10 | 0.70 | reuses `hbm` mesh |
| 9 | W4 The Nanosheet | 30-33.75, 120-123.75 | 8 | 12 | 0.67 | reuses `node1` geometry |
| 10 | W8 The Fab Rail | 67.5-71.25 | 7 | 12 | 0.58 | |
| 11 | W9 The Die City | 75-78.75, 97.5-101.25 | 8 | 14 | 0.57 | two slots |
| 12 | W1 The Wafer | 26.25-30, 71.25-75, 101.25-105, 116.25-120 | 10 | 18 | 0.56 | four slots, build second |
| 13 | W2 The Shot | 7.5-15 | 9 | 16 | 0.56 | |
| 14 | W5 The Cornfield | 33.75-37.5, 78.75-82.5, 123.75-127.5 | 7 | 14 | 0.50 | three slots |
| 15 | W3 The Machine | 15-18.75 | 9 | 20 | 0.45 | the signature object; do not drop |
| 16 | Retrofit kept plates (`semGrade` plus fixes) | 11 plates | 6 | 14 | 0.43 | |

Build order by dependency (about 190 h total): SE pass, gag, edit diet; then W1, W2, W3, W4; then W7, W10, W12, W6; then W9, W8, W5, W11; retrofit last. If time is short, tier 1 is SE pass, gag, edit diet, W1, W7, W2, W3, W4, W10, W12 (about 120 h); tier 2 adds W6, W9, W8, W5, W11 (about 58 h).

### 4.3 Hero worlds (bespoke true 3D, 12 worlds, about 93 s of 142 s)

Each: concept, hero model with hand-built detail, lyric to geometry (word times from `lyrics.json`), match cut, deadpan joke.

**W1 THE WAFER (26.25-30, 71.25-75, 101.25-105, 116.25-120).** The chorus escalates by the same object being treated worse: whole, diced, shrapnel, cracked.
- Model: 300 mm disc, 775 um edge with a chamfer that catches the rim light, notch at 6 o'clock, laser-marked serial `LOT 7A-0042 S25` in the margin, die grid with stitched reticle-field seams and scribe lanes, darker edge-bead ring, metal-bright die tops so every die edge rims. C2: a 3D toothed saw blade cuts one street per beat and dies pop up 0.5 mm. C3: dies as 4 mm slabs, each etched with a lyric word, thrown with drag and spin. Bridge: cleaves along {110} planes with 54.7 degree kinks.
- Lyric to geometry (C1): "Every" 26.25 wafer slides onto the stage; "wafer" 26.72 lands, the word is etched as a die mask; "is a" 27.19/27.42 notch rotates to 12; "weapon" 27.66 wafer pitches to camera and its scribe lanes become a crosshair graticule; "now" 28.12 one die locks; TPP odometer 1,200 to 4,800 across 28.12-29.5, red threshold line crossed on the carry. Shots cut 10 to 6, slam rhythm kept.
- In: in the silent gap 25.78-26.25 one grain falls and lands on a lit stage, camera pulls back to reveal it sits on a wafer (grain to wafer scale rhyme). Out: the locked die zooms into W4.
- Joke: etched label escalates `PRODUCT: WAFER, SILICON, 300 mm  NOT A WEAPON` then `(DUAL-USE)` then `WEAPON`.

**W2 THE SHOT (7.5-15.0, merges tin and laser).** One droplet's 20-microsecond life at the speed the lyric sets.
- Model: 27 um tin droplet as an SDF sphere with capillary ripples; the pre-pulse pancake (sphere to disc to toroidal rim to mist); the elliptical Mo/Si collector mirror with a laser hole and 40 hand-built ring bands; two laser pulses as thin amber pencils (short pre-pulse, fat main); a sun bead at true size ratio.
- Lyric to geometry: slow-motion clock set so one 16th note (117 ms) equals one 20 us droplet period, i.e. 1 : 5,859. "Fifty" 7.50 and "thousand" 7.97 launch two droplets each and a strobe-ghost stack records the spacing (one ghost per droplet); the 50,000 odometer spools as a fast drum and locks at "second" 11.02; "tin" 8.44 tags the droplet; "drops" 8.91; "every second" 9.61-11.0 a sweep bar crawls with the footnote `AT THIS SPEED, ONE SECOND LASTS 1 H 38 MIN`; "shot" 11.25 pre-pulse flattens it; "laser" 11.95 main pulse ignites plasma; "hotter" 12.66 to "sun" 13.59 exposure falls and the sun bead is stamped at scale; 14.0-15.0 camera pulls back into the collector rings.
- In: sand's ignited lattice atom is the droplet (exists). Out: plasma rings are mirror 1 of W3 (exists).
- Joke: tag on the pancake `TARGET 1 OF 50,000. HIT TWICE: ONCE TO FLATTEN, ONCE TO IGNITE.`; the sun bead footnote `FOR COMPARISON`.

**W3 THE MACHINE (15.0-18.75).** Ride the 13.5 nm light through the 11 mirrors, then leave through the roof.
- Model: 11 aspheric mirror dishes with a cutaway edge showing about 50 Mo/Si bilayers; reflective reticle on its stage; wafer stage with the scanning slit; the 180 t hall shell with a faceless 1.8 m silhouette for scale at the exit; the beam as a path that dims by x0.7 at every mirror (exposure physically falls, so the lyric dims with it).
- Lyric to geometry: "One" 15.00 beam enters; "Dutch" 15.23 and "machine," 15.47 mirrors 1-5 on the 8ths; mirrors 6-11 across the held note to 16.4; "and the" 16.41/16.64 camera exits the roof; "whole world's waiting" 16.88-17.34 crane-out to the dot-matrix world map and queue lines to one point (exists); queue lines bundle into a cable (exists, hand-off to `tons`).
- Joke: wafer-end footnote `LIGHT REMAINING: 2%` then `THE OTHER 98% IS HEAT` (0.7^11 = 1.98%; reflectivity to be fact-checked).

**W4 THE NANOSHEET (30-33.75, recap 120-123.75).** The transistor changes architecture while you watch.
- Model: FinFET (fin, 3 gates) that rotates into 3 stacked 5 nm nanosheets wrapped by a gate, with spacers, source/drain epi, contacts and a sweeping cross-section plane; hairline hatch is dropped for SE shading.
- Lyric to geometry: "Two" 30.00 shows the 7 nm fin; "na-no-me-ters" 30.23-31.17: each syllable ratchets 7, 5, 3, 2 as dimension calipers (no slab numerals), at "2" the fin lies down into sheets; "holding" 31.17 camera dives through the gate; "the crown" 31.64/31.88 fins of a 56-device array rise into a crown silhouette (exists).
- Recap (C3, 120-123.75): the crown is assembled from tiles that are live mini-renders of the earlier worlds (scenes are deterministic functions of time, so they can be re-rendered at a past `t`).
- In: crosshair to die to transistor (exists). Out: crown cells shrink into town lights (exists).
- Joke: footnote `"2 nm" IS A NAME, NOT A MEASUREMENT` (smallest real pitch is about 45 nm; to be fact-checked).

**W5 THE CORNFIELD (33.75-37.5, 78.75-82.5, 123.75-127.5).** A chip die and a farm are the same picture.
- Model: night field of about 40k instanced corn stalks whose leaves are perfect SE edges; a datacentre shed with louvres and chillers whose footprint is the crown silhouette; 3 transmission towers with catenary lines carrying beam pulses on the 8ths; a grain silo (callback to sand).
- Lyric to geometry (C1): "Gigawatts" 33.75 letters appear as rows of lit crop between the corn; "in a" 34.69/34.92 camera rises; "cornfield" 35.16 through the leaves; "town" 35.62 five halls light, site meter to 1.2 GW. C2: inside the hall, racks are crop rows, camera tracks a bus-bar with a breaker click per beat (replaces the dashboard diagram). C3: overload, lightning along the lines, stalks rim-lit by arcs, burn to white.
- In: crown cells to town lights (exists). Out: one beam line becomes the racing line of `down1` (exists).
- Joke: sign at the field edge `POPULATION 1,900  LOAD 1.2 GW (ONE REACTOR)`.

**W6 THE TOWER (48.75-52.5).** HBM as a skyscraper.
- Model: base logic die on an interposer, 12 thinned DRAM dies, a cutaway where copper TSV columns glow bright in dark silicon (Z contrast) and microbump layers sit between dies, rooftop crane.
- Lyric to geometry: one die per syllable from "Twelve-" 48.75 to "tower" 50.86, "stacked" 49.69 slams die 9; at "tower" the camera dollies back and the stack's windows (TSV rows) read as an office block.
- In: carousel's final stub is the base die. Out: camera rises over the top die to the x-ray (exists).
- Joke: a lease sign `FULLY LEASED THROUGH 2026` (HBM supply sold out; to be fact-checked); callouts D01-D12 as floor numbers.

**W7 THE SHIELD (63.75-67.5).** The title concept becomes a 3D relief.
- Model: the W1 wafer, 3D yield map: passing dies pop up as luminous pillars forming a heraldic shield, failed dies sink into dark pits; instanced sand grains (physics) pour through the pits into a bin.
- Lyric to geometry: "They call it a shield" 63.75-64.69 dies rise top to bottom per word; "made of sand" 65.16-65.62 sand pours; "and light" 66.09-66.33 beam outlines the shield and pillars light as windows (exists, hand-off to fab).
- In: key barrel becomes the wafer (exists). Out: dive through a lit die into the fab ceiling grid.
- Joke: tag `YIELD 57.7%. THE REST IS SAND AGAIN.`

**W8 THE FAB RAIL (67.5-71.25).** Nobody sleeps: the overhead hoist transport never stops.
- Model: ceiling rail network with switches, hoist cables, FOUP pods (handle, latch, 25-wafer window), fan-filter ceiling lights, tool load ports below; camera rides on a pod.
- Lyric to geometry: "and nobody" 67.50/67.73 pods start; "sleeps" 68.44 every pod stops except ours; "in the fab" 68.91-69.38 pod lowers to a tool; "tonight" 69.84 shift clock rolls over 23:59 to 00:00; tape-stop 70.25 (exists).
- In: shield pillars become ceiling lights. Out: silent gap, inhale.
- Joke: HUD `PODS 4,117  SLEEPING 0`.

**W9 THE DIE CITY (75-78.75 and 97.5-101.25).** One GPU die modelled as a city.
- Model: die floorplan as terrain: 132 SM districts, an SRAM lake (L2), HBM PHY harbours on the edges, NoC boulevards with amber traffic, power-grid pillars, bump lamp-posts, then pull-up to the full package (die plus six HBM stacks plus substrate).
- Node2 (low sun): fly over to one SM, where five bright interconnect pillars rise in a crown silhouette (replaces the laurel icon). Dream (night): SMs light in travelling attention diagonals; "every" 97.50, "model" 97.97, "dreaming" 98.44 sweep; "on a chip" 98.91-99.38 camera rises to the package; "we'll never own" 99.61-100.31 the $30,000 tag drops on its thread and is yanked at "own" (exists).
- In: atom lattice defocuses into the die (exists). Out: the lit shield-shaped region becomes the wafer map for the crack.
- Joke: district signs `L2 CACHE (LAKE)`, `NoC BOULEVARD`, and on the package a tag `NOT FOR SALE TO: YOU`.

**W10 THE WIRE (105-116.25, merges whoscrown and hold).** "Hold the line" is a 25 um gold bond wire.
- Model: ball bond on the die pad (a bright sphere, the same shape as the first tin droplet), stitch bond on a lead finger, SE rim on a thin white thread over black; the empty crown (fins from W4) hangs in the void first.
- Lyric to geometry: "who's" 105.00 to "crown?" 107.34 the crown turns; at 108.0 camera drops edge-on and the crown collapses to the line; "Hold" 108.75 tension; "line" 109.45 first mode; 112.50 "hold" steps up a mode (9:8 ratio, exists); amplitude rises with the snare roll; lyric letters ride the wire. On the 115.31 downbeat the stitch lifts off its pad and the wire whips away; silence; black; 116.25 hit.
- Joke: HUD `BREAK LOAD ABOUT 10 gf (A 10 g WEIGHT)`; thinner than a hair (to be fact-checked).

**W11 THE CHAMBER (41.25-48.75).** The chant becomes a rotating specimen carousel, a revolver cylinder of 6 stubs.
- Model: multi-stub holder with each pin carrying a tiny W1-W4 specimen (grain, droplet, mirror, wafer, transistor, die). Click-lock on every "oh" (kick-locked). The second chant (45.0) spins up and swaps in Act II specimens (tower, suitcase, key).
- In: down1's lone vertical line is the centre pin. Out: the last stub's top face becomes the HBM interposer. Replaces the 8-bit game.
- Joke: stub tags `SAMPLE 02: DROPLET`, ... and a final `CHAMBER 6: EMPTY`. (Tone check: keep the revolver abstract, no gun body.)

**W12 THE STUB, the loop (131.25-142.2).**
- Model: traveller form stuck to an SE stub with carbon tape, a rubber stamp, vacuum-tweezer arm, specimen chamber, the first-frame grain.
- Sequence: 131.25-134.5 whispered line fills the form (exists); 135.47 "restricted" stamp lands on the beat; 136.9 pull back, the paper is on a stub; 138.0 tweezers lift UNIT 0001 off the stamp ink; 139.5 set it on a fresh stub; 140.6 beam on, raster reveals the grain (this is frame 3 of the film); 141.6 beam blank to a line then a dot; 142.1 black `#3B3837`, identical to frame 1.
- Joke: HUD `UNIT 0001  RETURN TO SENDER`, then `NEXT SAMPLE: 0001 (SAME)`.

### 4.4 Kept plates, with small fixes (about 49 s)

| plate | time | fix |
|---|---|---|
| sand | 0-7.5 | Re-skin in SE-look (the 0.07-0.17 s raster sweep becomes the real raster reveal); make 2.8-4.8 s a continuous camera dive; hold the title 2 s; add UNIT 0001 tag |
| tons | 18.75-22.5 | SE-grade the containers; dolly down into the yard; keep the split-flap board; add a row `YOUR TOWN WAITLIST 2031` before SOLD OUT |
| line | 22.5-26.25 | Keep (bone plate 1 of 4); first red stamp is on a grain `UNIT 0001 RESTRICTED`; dots-to-sand ends on a single falling grain (hand-off to W1) |
| down1 | 37.5-41.25 | Plot real chips on the curve (4004 to B200, 208 B); label axes legibly; keep the DOMN flip; vertical line becomes the carousel pin |
| smuggle | 52.5-56.25 | GPU at 35% of frame inside the bag; add declared-item tag `DECLARED: SOUVENIR`; SE-grade |
| island | 56.25-60 | Contours extrude into a relief on "island" 56.95; fix 126.0 vs 130 km; grain on the beach `LANDED, NO LICENCE` |
| key | 60-63.75 | Keep the model; re-render brass as bone with amber pins; tags to 18 px; SE-grade |
| down2 | 82.5-86.25 | Remove duplicate gauge (comes from W5 C2 as a bus-bar); shorten the dashboard shake |
| post2 | 86.25-93.75 | Keep LED board; add a wave that travels across and a power-down by columns; SE-grade for glow |
| atom | 93.75-97.5 | Enlarge the border to 40% of frame; count `474 / 9,900,000,000,000,000,000` atoms (one grain; fact-checked: 79e18 is 1 mm³ of quartz, the sand plate's grain is ⌀ 0.62 mm = 0.125 mm³ = 9.9e18); remove the out-blur |
| down3 | 127.5-131.25 | Replace the wall of charts with a powers-of-ten zoom-out (one decade per beat, transistor to die to wafer to fab to field to map), ending on the traveller |

### 4.5 Merges and cuts

Merge `tin` + `laser` into W2. Merge `whoscrown` + `hold` into W10. Cut `post1` (8-bit game) for W11. Rebuild `fab` as W8, `shield` as W7. Cut `grid2` (UI diagram) into W5 C2, `node3` icon mosaic into W4 recap, `crack` into W1 state four, `node2` and `dream` into W9. The 32 timeline entries become 30; same song timing.

### 4.6 Run of show (song timing unchanged)

| t (s) | plate | status |
|---|---|---|
| 0-7.5 | sand | keep + SE |
| 7.5-15 | W2 The Shot | hero |
| 15-18.75 | W3 The Machine | hero |
| 18.75-22.5 | tons | keep |
| 22.5-26.25 | line | keep |
| 26.25-30 | W1 Wafer, whole | hero |
| 30-33.75 | W4 Nanosheet | hero |
| 33.75-37.5 | W5 Cornfield, night | hero |
| 37.5-41.25 | down1 | keep |
| 41.25-48.75 | W11 Chamber | hero |
| 48.75-52.5 | W6 Tower | hero |
| 52.5-56.25 | smuggle | keep |
| 56.25-60 | island | keep + relief |
| 60-63.75 | key | keep + SE |
| 63.75-67.5 | W7 Shield | hero |
| 67.5-71.25 | W8 Fab Rail | hero |
| 71.25-75 | W1 Wafer, diced | hero |
| 75-78.75 | W9 Die City, day | hero |
| 78.75-82.5 | W5 Cornfield, inside | hero |
| 82.5-86.25 | down2 | keep |
| 86.25-93.75 | post2 | keep |
| 93.75-97.5 | atom | keep |
| 97.5-101.25 | W9 Die City, night | hero |
| 101.25-105 | W1 Wafer, cracked | hero |
| 105-116.25 | W10 The Wire | hero |
| 116.25-120 | W1 Wafer, shrapnel | hero |
| 120-123.75 | W4 Nanosheet, recap crown | hero |
| 123.75-127.5 | W5 Cornfield, overload | hero |
| 127.5-131.25 | down3 | keep, rebuilt small |
| 131.25-142.2 | W12 The Stub | hero |

Hero worlds cover 93.5 s (66%); kept plates 48.7 s. Target: a rhyme cut at every plate boundary (no dissolves except 4). Planned hand-offs: grain falls onto a wafer (25.8), die zoom (30), crown to town (33.75), line to pin (41.25), stub to interposer (48.75), hourglass sand to sea (56.25, exists), compass to key (60, exists), key barrel to wafer (63.75, exists), pillars to ceiling lights (67.5), saw cut to die (75), die city lights to town lights (78.75), meter to speedometer (82.5, exists), LED dots to atoms (93.75, exists), defocus to die (97.5, exists), city to wafer pull-out (101.25), crown to line to wire (105-108), snap to flash (115.3), shrapnel to tiles (120), overload to paper (127.5), zoom-out to traveller (131.25), stub to loop (142.2).

### 4.7 Running gag: UNIT 0001

A single quartz grain (the opening's grain, the stowaway) rides through the film as a tiny SE sprite (20-40 px) plus a status tag in the data strip. Its regulatory status changes in every plate, deadpan, escalating, with a payoff. It is the P(doom) of this film: a character, not a number. TPP stays as the hook number (4,800 to 19,200 to infinity).

| t | plate | tag |
|---|---|---|
| 0 | sand | `UNIT 0001  QUARTZ  NOT CONTROLLED` |
| 7.5 | shot | `UNIT 0001  RIDING DROPLET 1  NOT CONTROLLED` |
| 15 | machine | `UNIT 0001  ON RETICLE  LOT HELD  (tweezers, 1 beat)` |
| 18.75 | tons | `UNIT 0001  CONTAINER 41  (OVERFLOW)` |
| 22.5 | line | `UNIT 0001  RESTRICTED` (first red stamp) |
| 26.25 | wafer | label `NOT A WEAPON` (grain on the wafer) |
| 52.5 | smuggle | `UNIT 0001  DECLARED: SOUVENIR` |
| 56.25 | island | `UNIT 0001  LANDED  NO LICENCE` |
| 63.75 | shield | `UNIT 0001  POURED THROUGH DIE 112` |
| 67.5 | fab rail | `UNIT 0001  SLOT 25  SLEEPING 0` |
| 93.75 | atom | `ATOMS COUNTED 474 / 9,900,000,000,000,000,000` (live counter / the ⌀ 0.62 mm grain's atoms; was 79e18, which is 1 mm³) |
| 101.25 | crack | `UNIT 0001  KILLER DEFECT  DIE 112` (the crack nucleates at it) |
| 131.25 | outro | `UNIT 0001  RETURN TO SENDER` |

The shield is made of sand, and a single grain is what cracks it: this closes the lyrics' own loop ("shield made of sand and light", "if the shield ever cracks").

### 4.8 Loop ending

See W12. The last 1.5 s of the film is the first 0.17 s of the film: beam on, raster line, grain half-revealed, then beam blank to a dot, then black `#3B3837` equal to frame 1. The `outro` promise (dive into the grain) becomes a physical act: tweezers return the grain to a stub, the SEM images it, the film restarts. A one-line deadpan HUD closes it, `NEXT SAMPLE: 0001 (SAME)`.

### 4.9 Risks and checks

- Grey monotony: mitigated by rim, amber and big type; run a 2 h look test first by applying `semGrade` to k139 (hbm), k154 (key), k098 (node1) before committing to the pass.
- G-buffer: raymarched worlds write depth, normal and material directly; mesh worlds need an override-material normal/depth pass. Decide once in `engine/se.ts`.
- Fact-check before locking text: 0.7 reflectivity x 11 mirrors, "2 nm" naming, 45 nm pitch, 25 um wire break load, HBM sold-out claim, atoms per mm of quartz, 130 vs 126 km strait.
- `whoscrown` frames are unseen in the sampled sheets; verify exposure before reusing its crown in W10.
- Tone: keep the carousel as a revolver cylinder only in shape, no gun body.
- Do not copy from the reference: spark-as-pen, engraved hairline hatch, chat UI and Regenerate button, P(doom) numbers.
