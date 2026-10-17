# Breakdown B: room, shoggoth, spacetime, ascent

Source: mexicat/pdoom-video `app/src/scenes/{room,room-geo,shoggoth,shoggoth-glsl,spacetime,spacetime-lens,ascent,ascent-eye,ascent-note,ascent-odo}.ts`.
Tempo is 132 bpm, so beat = 0.4545 s and bar = 1.818 s. Beat times below are `0.238 + 0.4545k`. Downbeats are `22.055 + 1.818k`.
Windows come from `timeline.ts`: room 24.33-29.78, shoggoth 29.78-38.42, spacetime 38.42-52.51, ascent 60.24-69.78.
Seconds are song time. I rendered contact sheets of all four plates plus dense stills around the room's cut (the images are in `out/wip/B/` of the clone, not in this repo).

Cross-cutting notes, ahead of the plates:
- Only `shoggoth` is raymarched. `room` is a hand-rolled pinhole camera over thousands of `LineBatch` hairlines. `spacetime` is a lens shader plus a 3D line sheet. `ascent` is four fullscreen fragment shaders plus Canvas2D.
- The same toolbox shows up everywhere: `hatch(u, darkness)` for engraving, `pulse(t, t0, halfLife)` hit envelopes, `springStep` for overshoot, `ease.outExpo` snaps, and the `Frame` beat clock for beat-locked ramps.
- Every beat and word is looked up from `lyrics.json` and `audio.json` at init time. Nothing is a hard-coded second. Each camera cut sits on `audio.timeOfBeat(B0+k)`.
- The post stack is returned per scene: `shake`, `zoom`, `ca`, `exposure`, `flash`, `bloom`. Impacts set all of them from one `pulse()`.

---
## 1. `room` (24.33-29.78, 5.45 s): "'cause the future goes FOOM / Trapped in the Chinese room, / with a bag of shrooms"

### Shot list and motion spec
Part A has no room yet. Its camera is a 2D view transform on the tree, not a 3D camera.

| Time | Beat | Spec |
|---|---|---|
| 24.33 | open | The plate opens on the hook's `P(DOOM)` as a hairline outline of 38 px debris segments (the code also holds it with a flicker `0.75+0.25 sin(60t)sin(37t)` if the plate opens before 'cause; here 'cause starts at 24.32, so the shatter is the first frame). |
| 24.32 ('cause) | shatter | Each segment flies out radially: speed 900-1400+, `tau=(1-e^-5dt)/5` (exponential drag), gravity 300, spin. Life is 0.3-0.7 s. The colour is white-hot, then signal, then bone (`exp(-dt/0.05)`). |
| 24.32-26.146 | branching | One 215 px spark stroke starts at `root=(960,572)`. A new generation is born on every eighth note (`gens[]`). Each branch splits in two (+-0.95 rad for g<2, +-0.42 after) and grows with `pu = 1-(1-u)^1.5`. After FOOM (25.58) the generations come on **sixteenths** (150 px strokes, twice as fast). The count is 2^k, shown in a mono counter `BRANCHES 0001 -> 1024`. |
| tree cooling | | Colour per vertex is `white (hot=exp(-age/.07))` then `signal (exp(-age/.35))`, then `bone .82`, then `ash .62`. A radial burst of 10-2g sparks fires on each of the first 4 splits. |
| view | | `zoom = 1.75 * (0.72/1.75)^(zp^0.9)`. The pull-back is exponential, so the growth front stays near the frame edge. Rotation is -0.07 rad, eased `inOutQuad`. |
| 25.58 FOOM | slam | The word is set at `targetW = lerp(900, 2300, u^1.7)` px. Its Archivo width steps 62, 75, 87.5, 100, 112.5, 125 **one step per sixteenth**: `step=floor((beatAt(t)-bF)*4)`. The scale is `0.75+0.25*springStep(dt, 3.2, 0.35)`. The two O's are drawn **hollow, as strokes** (`strokeText`, ember on the sixteenth flash). Each sixteenth, every O emits an analytic shockwave ring: `r = o.r + 2300(1-e^(-2.4 age))`, width `4.5e^(-5age)`, and it pushes tree vertices outward through `xf()` (`amp 42 e^(-2.5 age)`, gaussian 80 px band). Post: shake 16 px (`pulse 0.1`), `ca` +2.5, `exposure +0.9` (`pulse 0.03`), zoom +2.5%. |
| 26.00-26.146 | burn-out | `exposure += 5*smoothstep(tB-.12, tB, t)^2`. The plate whites out into the cut. |
| **26.146 hard cut** | B1 "Trapped" | **Crash through the door.** Key A is at `[0.28,1.45,ZF+.55]`, looking at `[.05,1.95,-8]`, roll -0.5 rad (dutch), f=520. Key B is at `[-.35,1.72,-1.15]`, roll -0.02, f=900. The path eases with `0.8*outCubic(x)+0.2x`. Roll is driven by a spring: `rollSpring [1.25, 0.36]` (underdamped, overshoots). A door panel (`drawDoor`) is blown ahead of the camera on a falling arc `fall=min(pi/2, 2.2tau+7tau^2)`, white-hot for `exp(-tau/.08)`. A 120-segment blast ring expands 220 to 2720 px in 0.42 s (two rings, 0.07 s apart, `outCubic`). The room lights flicker for 0.4 s (`lightK`: hash-gated on/off at 30 Hz, probability rising 0.45 to 1). |
| 26.60 | B2 "in the" | **Snap to a new camera** right and dutch. Position `[1.3,1.2,-1.55]`, roll +0.14, tracking `-1.55 to -3.2` linearly (shelves stream past). `snap: 0.13`: for the first 0.13 s the old shot's pose is lerped to the new one with `ease.outExpo`, so the move is a whip-pan. `kick 0.05` adds a damped roll wobble `kick*sin(2pi*2.6*dt)*e^(-6dt)`. |
| 27.055 | B3 "Chinese" | **Low hero angle** from the left, `[-1.55,0.6,-2.9]`, roll -0.16, f=780. Snap 0.12. The slot starts firing cards on the kicks. |
| 27.51 (downbeat) | B4 "room," | **Punch-in** on the board, f 1150 to 1250, camera `[.35,2.15,-3.1]` to `[.12,2.35,-4.45]`, `outCubic`, snap 0.09. |
| 27.96 | C "with a bag of shrooms" | **Whip up into a high orbit** around the desk (`orbitKey`): `phi = lerp(.78,-.8, .6u+.4u^2)` (accelerating), radius 2.45 to 2.05, camera Y 3.15. From tb[7] (29.33) it rolls up to -1.15 rad (`inCubic`). f is `700*(1+.14*trip*breath+.12*land+.035*kick)`. Snap 0.16. |
| 27.85 | board flip | The lyric board flips on its axle: `th = pi*springStep(dt, 2.4, 0.5)`. |
| 28.38-28.87 | bag | The bag falls with `y = d.h + (RH+1.5-d.h)(1-u^2)` and lands on the beat at 28.873. It squashes by `0.18*pulse(.06)`, bounces `0.18|sin(14a)|e^(-9a)` and puffs 48 acid particles. Shake 14 px, zoom +2%, camera pushes in on the desk (`tg` lerped 25% toward `[.25,.9,-5.9]`). |
| 28.87- | mycelium | Grows in beat bursts: `front = (floor(b8)+outExpo(frac))*1.5+0.4` on eighths. Tips go acid-bright (`exp(-(front-birth)/.3)`). Mushrooms pop on the sixteenths with `springStep(dt, 3.2, 0.32)`. |
| 29.12 shrooms | trip | `tripK` ramps in (0.35 at the bag, 0.65 at "shrooms"). It adds a screen-space sine-sum warp (8+22*beatPulse px, +30 px toward the end), three trailing echoes (`dt=0.055` apart, acid then signal), and `ca`/bloom. The slot also fires cards on the off-beat eighths. |
| 29.22-29.78 | tear-off | SHROOMS leaves the board. Each glyph's affine is lerped from the board plane to a fixed screen layout (`shroomsAffine`, shared in `room-shrooms.ts`) with `inOutCubic`, so the next plate (`shoggoth`) starts on the same pixels. Three trailing copies fade at 0.32*0.6^(e-1). |

### Camera system (the "crash-dolly cut on every beat")
- `shots[]` is an array of {t0,t1, key A, key B, ease, snap, kick, rollSpring}. Keys are `{pos, target, roll, focal}`. `keyAt(t)` picks the active shot. If `t-s.t0 < snap`, it lerps the previous shot's pose into the new one with `ease.outExpo`. That makes every cut a 0.09-0.16 s whip, not a hard jump.
- Impact jitter comes from `hitK(t)`: `pulse` at the cut (0.08), at every stamp (0.07, x0.6) and at the bag landing. It adds noise to position (0.05 m) and roll (0.012 rad).
- Fake motion blur (`smearAmt`): reference points are projected at `t` and `t-1/60`. If they move more than 8 px/frame, the static room is redrawn 4 more times at earlier times (`te = t - e/4*(1/24)*smear`) at alpha 0.3 to 0.
- The per-frame cost is low: roughly 40k line segments, each near-clipped, projected, depth-faded (`al*(1-.5*clamp(depth/13))`) and put into one of four batches.

### Rendering technique
- **No mesh or shader 3D.** `buildRoom()` (`room-geo.ts`) emits flat `Float32Array`s of 3D segments in metres: shell, floor and ceiling grids, shelves and **individual books** (so they can slide out on hi-hats), fluorescent panels, desk, slot, door. Aisle 12 m long, 6 m wide, 4 m high. Long edges are subdivided into 0.5 m pieces so that the near plane clips them cleanly and the warp bends them.
- `proj()`/`clipSeg()` do the pinhole math by hand: a camera basis with roll, focal length in px, and near-clip at 0.1 m.
- Lines are drawn with `LineBatch(blend:'max')` so overlapping hairlines never double-brighten (ink). Hot things go in `blend:'add'` (glow).
- **Depth sorting without a z-buffer.** The flip-board is a Canvas2D plane. Lines are split by which side of the board's plane they fall on (`front()`): behind lines draw before the board, in front lines (`inkF`/`glowF`) after. Cards use a second Canvas2D layer the same way.
- Text on 3D planes: `planeAffine()` projects the origin plus two unit axes and builds a canvas affine (`setTransform`). Glyphs are stamped one by one (`outExpo` over 0.12 s, a 0.45 m lift, scale 1.7 to 1, `ember` hot then `bone`). Every stamp throws 22 hot splinters in the board's plane.
- The back wall is a single projected quad (a point-in-quad test in the shader) one step lighter than the void, plus a faint blood-orange pool at the slot (the only warm light).
- Everything is deterministic. Noise is `noise1` of `t`, and hashes are of word start times.

### Why it's impressive
- A whole room is told in hairlines, yet it reads as depth: alpha falls with distance, edges are clipped, books are real boxes that slide out.
- The cut is not a cut: every shot snaps into place with an `outExpo` whip, and a roll spring or damped wobble follows. The beat grid decides every move, and the ring/flash/shake fire on the same frame.
- Typography is a set piece: FOOM's O's are the shockwave emitters, "TRAPPED" etc. are stamped onto a physical board that flips, and SHROOMS ends in exactly the framing the next plate starts with.

### Reusable techniques
1. **Hairline 3D without WebGL meshes**: store the scene as `Float32Array` segments, project on CPU, draw in `max`-blend capsule batches. Depth fade plus near clip.
2. **Beat-grid camera director**: shots are `{a,b,ease,snap,kick,rollSpring}`. Between shots, interpolate the *previous* pose into the new one with `outExpo` over 0.1 s. Add a damped sine on roll.
3. **Exponential branching on the grid**: `n = 2^floor(beat*k)`, a pull-back zoom of `(end/start)^(u^0.9)` so the front stays at the frame edge, and rings whose positions come from glyph geometry.
4. **Smear by redrawing**: redraw past times at falling alpha when the projected motion exceeds a threshold. This is cheap motion blur for line art.

---
## 2. `shoggoth` (29.78-38.42, 8.64 s): "See through the shoggoth's lies, / with your shinigami eyes"

### Shot list and motion spec
Constants: `tSee=29.91, tThrough=30.01, tLies=31.14, tCut2=32.963 (first downbeat after tLies+0.8), tWith=33.40, tClose0=36.14, tCollapse=37.96`.

| Time | Spec |
|---|---|
| 29.78-29.91 | Hangover: SHROOMS (acid, 3 trailing copies) finishes wobbling in the same screen layout as the end of `room` while the mask rushes in. Camera distance is `lerp(7.5, 0.95, ease.inCubic)` from the mask. |
| 29.91-31.14 | **Camera A**: parked 0.95 to 0.90 units in front of the mask so it fills the frame, with a sway. The mask is an analytic disc (bone, engraved dome hatch, 2 dots, a smile from `sdMaskInk`). "see through the" is printed small on its forehead in Archivo 112.5/300, and wipes ink to signal as sung. |
| 30.01 ("through") | **X-ray band 1**: a 130 px half-width band travels right to left: `bandX = lerp(W+130, -130, inOutQuad)` over `through` to `the`. Inside it the mask is transparent and the creature shows. The edges are two 1.2 px bone lines. A signal glow is on the leading edge (`exp(-x/6)`), 2.1 px scanlines (`sin(py*2.1+40t)`), and a mono HUD `XR 063% / SEE-THROUGH MODE`. |
| 30.58 ("shoggoth's") | **X-ray band 2**: left to right. The leading edge is the **karaoke cursor** of the engraved word SHOGGOTH'S: `shogCursor()` projects the sung boundary in the glyph row to a screen x. The wake stays transparent. The words printed on the mask turn bone inside the band (a two-pass clipped draw). |
| 31.14 ("lies,") | **Yank**: the mask is snatched by a tentacle (`ease.outExpo` over 0.5 s to `MASK_YANK`). Camera: `outExpo` 0.75 s pull-back from A to `posB=(.75,.3,4.6)`, roll -0.05. Shake 8 px. The body reveal (`outsideK` 0.14 to 1) takes 0.5 s. LIES, is stamped in (scale 1.55 to 1, `outExpo 0.14`) and then steps one Archivo width per beat (62 to 125, `LIES_W`), with a 7% punch each step. |
| 32.963 (downbeat) | **Hard reframe** C: low angle from the left (`posC=(-2,-.6,3.9)` to `(-1.75,-.5,3.55)`, roll 0.12), shake 5 px, exposure +0.6. |
| 33.40 ("with") | **Camera D**: frontal, slow push (`inOutQuad` to `posD2`), mass sits right of centre, tags on the left. A 0.1 push on each downbeat (`pulse .12`). The mask moves aside to `MASK_ASIDE` (upper right). |
| 33.42- | **Eyes open** on eighths (first 6) then sixteenths (last 6). Each is `springStep(dt, 3.4, 0.42)`, so it overshoots to 1.15. Pupil darts for 0.2 s after opening, then follows the camera. Each eye gets a detection box (flicker 35% in the first 0.12 s, scale 1.35 to 1 `outExpo 0.16`). |
| shinigami tags | See below. |
| 36.14-37.96 | **Eyes close** in an accelerating sequence: offsets `[0,1,2,2.5,3,3.25,3.5,3.625,3.75,3.8125,3.875,4]` beats from 36.14, each closing in 0.07 s (`inCubic`). The smallest go first, the big central eye last, exactly on 37.96. Each tag reads `t-00:00.00 EXPIRED`, with a strike bar, fading to 45%. |
| 37.96-38.26 | **Flatline**: `squash = 1 - outQuart(k)*0.9975` over 0.3 s. The G-buffer and composite use the squashed `camRay`, so the picture collapses vertically like a CRT. Then a white-hot 1 px line at y=540 (`exp(-dy^2/0.6)`, plus signal halos), `ca` +1.5. The next plate (`spacetime`) starts on the same line. |

**Shinigami tags** (`drawLegend`): four tags are laid out in the left margin at sizes 50/50/70/100 px (Plex Mono 600). The words of "with your shinigami eyes" are set big as detection labels, each wired to eyes: WITH, YOUR, SHINIGAMI (4 eyes, one per syllable: `ta = max(word.start, openT) + j*0.022`) and EYES (all 12). Under each name a mono line `t-MM:SS.SS` counts down to that tag's last-eye-close time. Leader lines are drawn as an L-shaped polyline that grows with `outCubic 0.14`. They go from the word's right edge to an elbow at `x=660+si*18`, then to the eye's rim (ring radius `1.35r`). They are signal while the word is sung and bone afterwards, and are redrawn each frame with live eye screen positions (`eyeScr`, from `project()`). Each eye's box carries a name, a confidence (`SYCOPHANCY 0.91`, `GOAL: ??? 0.51`, `HELPFULNESS (SIMULATED) 0.99`) and its own lifespan. A P(doom) readout appears and is itself detected (`NOT A CONFIDENCE SCORE`) and all the eyes glance at it. A final `YOU` box with a 47-year lifespan frames the whole screen.

### Rendering technique (the raymarched, engraved 3D)
- **Pass 1, G-buffer (`GBUF_FRAG`, half resolution 960x540, 2-target float MRT)**: sphere-trace (96 steps, `eps = 0.0007t`, step `*0.8`) a `mapP()` SDF:
  - a core sphere with fold lines (`abs(sin(...))` displacement);
  - 4 torus-knot tubes (`sdKnot`, (p,q) = (2,3), (3,2), (2,5), (3,7)), which output `along` (arc length) and `around` (angle*radius) tube coordinates, plus rotating phase and radius wobble;
  - 8 bent, waving tentacles (`sdTent`: tapered tube, double bend, sine wave, tip curl);
  - 12 eye pods with a lid shell that opens by `eOpen[i]`;
  - all joined with a polynomial `smin` (k 0.06-0.16).
  - It writes (depth, along, around, id) to target 0 and (key light with 14-step soft shadow, rim, AO, up-facing) to target 1. A tetrahedral normal and 3-tap AO are used.
- **Pass 2, composite (full res)**: a depth- and id-aware bilinear upsample of the half-res buffer (weights are zeroed when id or depth differs by more than 6%). It computes `edge = 1 - ws/cov`, which becomes **ink crevice lines** between tubes.
- **The engraving**: `u = along/hatchSp` (0.019), `v = around/(hatchSp*0.8)`. Lines are drawn at integer `u`, so they **run around the tube** like a hose, and `v` gives a longitudinal set that appears only in light (`light*1.6-0.95`). Width follows light: `wA = light^1.25*0.9`. A hand-cut wobble is added to `u` (`0.22 sin(0.21v+0.013u)`). Line spacing is kept at about 6 px by `elineLod`, which blends two octaves of line density (mip-style, `exp2(floor(k))`) as the camera moves. Where lines are too dense (grazing angles, `fwidth>0.6`) or coverage is partial (silhouettes), it falls back to tone.
- **Rim light**: `fres = pow(1-n.v, 2.5)`, multiplied by `0.35+0.65*max(n.rimDir,0)`, with `rimDir` behind-right. Where `rim>0.08..0.5`, the bone lines are replaced by **ember lines** (`C_EMBER*1.3`) and `C_SIGNAL*0.8*rim^3*ao` is added. Crevices multiply by `1-0.95*smoothstep(.08,.4,edge)`.
- **Fog**: `c *= exp(-max(depth - fogNear, 0) * 0.32)` into black, with `fogNear = camDist - 0.9`.
- **Eyes** are analytic at full res on top of the buffer: ray vs lid-shell sphere, an aperture test, then an iris of two fibre families built with `hatchD` (angular derivative taken from whichever of the wrapped and unwrapped angle is continuous), a pupil, a dark limbal ring, sclera latitude hatch, a specular `pow(.,180)`, and a lid contour.
- **Engraved lyric**: SHOGGOTH'S and LIES, are drawn in Canvas2D as coverage masks (R, G, B = sung) with per-glyph perspective affines. The shader ray-intersects the word's plane, then draws **burin lines in the plane** (`v/sp` horizontal lines, thicker toward the cap line, plus a short cross-hatch at the foot). It is occluded by the body (`tp - tBody`) and the mask, and passes through the x-ray only behind the mask.
- `tileMasked` and `maxSamples: 108` handle the half-res noise during export.

### Why it's impressive
- The scan band is the **karaoke cursor**. Its edge sits on the sung letter of an engraved word that is physically behind the mask. So the singer's word is both a UI and an object.
- The hatching is not a screen filter. It is parametrised by the SDF's own tube coordinates, so lines wrap the tentacles, change density with camera distance without shimmering, and turn orange at the back-lit edge.
- Comedy and tension through data design: 12 eyes, each with a satirical detector label and confidence. Tags with live countdown lifespans expire as the eyes shut on an accelerating beat sequence, then the CRT collapse hands the next plate its first frame.

### Reusable techniques
1. **Surface-parametrised hatching**: have the SDF output `(along, around)` per primitive, use `hatch(u)` with `u = coord/spacing`, add a tiny wobble, and blend density octaves so spacing stays about 6 px.
2. **Rim as orange re-inking**: replace the line colour with ember where `fresnel*backlight` is high, plus a `rim^3` hot contour. Use depth fog to black.
3. **Half-res MRT G-buffer with an edge-aware upsample and full-res analytic details** (eyes, text planes, mask).
4. **Typography as scene geometry**: draw glyph coverage into a texture with projected affines, then ray-plane intersect in the shader to engrave it with its own hatch.
5. **Tag-and-leader HUD**: attach labels to tracked 3D points through live `project()`, with a growing L-shaped leader (`outCubic`) and an expiry state.

---
## 3. `spacetime` (38.42-52.51, 14.1 s): four movements

Constants: `tBut=41.34, tNow=41.60 (beat), tPlunge=42.05 (downbeat), tDb2=43.87, tFall0=44.88, tM3=45.24 (beat), tOpt=46.16, tCutB=47.26 (tAcc, beat), tTop ~ 49.56 (tI), tAtoms=50.48, tRe=51.38`.

### Shot list and motion spec
**I (38.42-41.34): the scope, locked off.**
- A phosphor trace `0.5*sin(2pi/4*x + ph)`, with `ph=-2pi*beat/16`, so it drifts 1/16 wavelength per beat. It is drawn as 560 segments in two layers: a core of width `2.1+1.1glow` (colour `signal` toward `ember`) and a 10 px halo at `0.07` intensity. The "beam" is a sparkHead sweeping `x = -8.3 + 16.6*beatPhase`, so it repaints once per beat. Intensity is `0.42+2.9*exp(-d/2.6)` behind the beam.
- 3 long-persistence echoes (`k=1..3`, 0.16*0.5^(k-1)) are each drifted a sixteenth wavelength. A dim CH2 trace is the muted P(doom) channel.
- The lyric is written in the vector `osmotron` stroke font with `writtenLen()` synced per character to word times. It is hot (`ember`) at the pen and cools. It rides the wave (`+0.75*traceY`).
- The glass graticule (the lens shader's grid) parallaxes over the phosphor: `phos()` uses `0.985` scale and `0.8*dx`. The camera push is `1 + 0.06 sineInOut` over the movement, `dx -18`. Readouts are mono (`CH1 0.2 V/div`, `f = 2.200 Hz`, `loss 0.0213 . stable`, `TRIG'D CH1`).
- The first 0.55 s: the handoff flatline from `shoggoth` is still white-hot, then becomes the trace (`ign = 1 - outCubic`).

**II (41.34-45.24): black hole.**
- 41.34 "But": the trace goes (`traceAmp -> 0`, `outCubic 0.16`). The picture **squeezes horizontally like a CRT switching off** (`squeeze = inCubic(prog(tBut+.03, tNow))`, intensity `1+3sq^2`). `BUT` appears (Archivo 118 px, heat colour `lerp(233,150)` over 0.28 s) and slides in 10%. A faint lens grows (`thE = 22*inQuad`). The readout flips to `NO SIGNAL` (blinking) and `f -> infinity`.
- 41.60 "now": a **black hole is born as the O of NOW** (380 px Archivo). `Rs = 0.44*96*outBack(.3, 2.2)`, `thE` from 22 to 96 with `outExpo 0.22`, ring flash `1+2.5*pulse(.12)`, an ember shockwave ring of 160 segments (`outCubic 0.55`, 1300 px), shake 16 px, `ca` +4, `flash 0.05`. The camera rolls -0.07 rad and springs back (`springStep 2.2/0.3`).
- 42.05 (downbeat): **plunge** through the O: `Z` goes from 1.06 to 2.05 with `outExpo` over 0.45 s. NOW/BUT/THE fly apart (`exp(4.2*fly)` scale, alpha-out) while the plane behind the hole tips into a floor (`pitch 0.42` slow lean). Roll `+0.16 outExpo`. Second shockwave, shake 12 px. Crash zoom on every beat after: `Z *= 1+0.04*pulse(.1)`.
- 42.29 "singularity's": the word is set **on a source circle** of radius `1.32*thE`, letter by letter as sung (spread over 80% of the held word), and the lens bends it onto the photon ring. Unsung letters are 1.6 px bone outlines. The infall field is 260 ember streaks spiralling in (`r = Rs + (r0-Rs)(1-u)^1.4`, a log spiral `2.4*ln(r0/r)`).
- 43.87 (second downbeat): `Z *= 1+0.12*outExpo(.3)` slam, pitch +0.72 `outExpo`, roll -0.1. 44.08 "begun": BEGUN is a straight word below the hole at `y = thE*0.98`. The lens curves it around the bottom of the ring, and the flipped secondary image shows inside.
- 44.88-45.24: **fall through the horizon**: `Rs` to 1500 px and `thE` to 3400 with `inExpo`, swirl `+1.2*inQuad`.

**III (45.24-49.56): out of the throat** (a different renderer, a 3D line sheet).
- Hard cut to the sheet at 45.24. Camera 1 is a **corkscrew crane**: target Y -4.2 to -2.2 and distance 7.5 to 18.5 over 1 s (`outExpo`), yaw `-1.6 -> -0.5` plus `spin`, pitch 1.45 to 0.72, roll -0.9 to -0.06, fov 50 to 34. Shake 7 px, `ca` +3 at the emerge.
- 47.26 (beat): **hard cut** to a high three-quarter orbit (distance 15.5, roll 0.1, fov 38), shake 6 px. `spin = flow(t)*0.35`, so the camera is carried by the flow clock.
- Flow clock: speed `0.14*1.2^k`, where `k = floor(nb) + outExpo(frac/0.35)`, so the speed **steps up on every beat from "And"** (capped 14 steps).
- The words ("AND YOU'RE OPTIMIZING, ACCELERATING,") sit on a marquee ring of radius 6.2 on the sheet. Each glyph is in its own Archivo width instance. The two long words **stretch 62 to 125 as each glyph is sung** (`outCubic 0.35`), with kerning added between instances. Glyphs are mapped by projecting two ring points to a per-glyph affine. Unsung is an outline, sung is ember heat to bone.
- ~47.9: fov `-1.8*pulse` on each beat (a camera "breath").

**IV (49.56-52.51): atoms to paperclip.**
- ~49.7: hard cut on a beat: straight down into the vortex (`pitch 1.5`, distance 20 to 23 minus 1.1l, roll -0.2 - 0.45l: a slow corkscrew, fov 40 to 34).
- "I feel my atoms" and "rearranging" are `textPoints` (6.2 px pitch) drawn as 4.6 px points that appear with the word (`outCubic`, hot `exp(-dt/.25)`). From 51.38 the first row's dots **leave on spiral paths** (radius `*(1-0.7 sin(pi u))`, angle lerped, hot at mid-flight) to points along a paperclip outline (900 samples, sorted left-to-right, `inOutCubic`). Arrival is staggered so the spark's draw head (`inOutQuad`, `tClip0=51.78` to `tClip1=52.41`) leads the dots. "rearranging" stays readable with growing jitter `1.2+5*prog`. Each landing pulses 1.2x. Dots settle to signal.

### Rendering technique
- **Lens shader (`spacetime-lens.ts`)**: one fullscreen pass. Each pixel is traced to the source plane with the **thin-lens equation** `beta = theta(1 - thetaE^2/|theta|^2)`, followed by a frame-dragging swirl (`sw = uSwirl*min(k,6)`). The source plane holds (a) an analytic **box-filtered graticule** (`gridCov`, after Quilez, with `N = gridPx/lineWidth`), which can be pitched into a receding floor with a ray-plane intersection, and (b) a Canvas2D "source layer" with the lyric, uploaded with mipmaps and premultiplied alpha so lensed minification does not alias. Inside the Einstein ring this gives the **flipped secondary image** of text for free. Inside `Rs` the colour is multiplied by a smoothstep to black.
- **Photon ring**: `core` (gauss 1.3 px) in near-white, `glow` and `wide` in ember and signal, a fainter secondary ring at `1.045Rs`, all modulated by a Doppler term `0.55+0.45cos(ang-ph)` that rotates over time. A warm haze `exp(-(r-Rs)/(0.9Rs))` with 3-lobe modulation hugs the hole.
- Everything else is additive `LineBatch`: scope trace, infall streaks (2D), the sheet and 2000-3200 streamlines (3D `LineBatch` with the engine camera). The spacetime well is `-9*tanh(K/sqrt(r^2+e^2)*exp(-r^2/81)/9)`, and grid lines are sampled non-uniformly (`GN*|u|^1.7`) so the near field is dense. Streamlines are log spirals `ph = ph0 + 1.9ln(r0/r)` falling in with `r = r0(1-u)^0.62`, coloured bone to ember by depth.
- Post: bloom 0.8, halation 0.3, `bloomRadius 0.75` for the glow in I, `ca 1.2+4*born+3*pl`, vignette 0.45-0.5.

### Why it's impressive
- A physical lens gives all the "wow" in one shader: the text really does wrap the ring and show its flipped ghost inside, and a grid bends around the hole.
- Movement I is a calm, locked-off instrument. This makes the cut-in of the CRT squeeze and the beat-sync'd birth of the hole land hard. Camera behaviour is characterised per movement: still, handheld with crash zooms, crane, overhead corkscrew.
- Word-level typographic wit: the hole *is* the O in NOW; "optimizing/accelerating" stretch as sung while the flow speeds up each beat; the atoms of the lyric re-form into a paperclip, which foreshadows the next plate.

### Reusable techniques
1. **Lensed type**: render the lyric flat into a mipmapped Canvas2D, then sample it in a shader with `beta = theta(1 - thetaE^2/r^2)`. Pitch or roll the source plane for free. Add a swirl and a Doppler-modulated photon ring.
2. **CRT switch-off**: squeeze x by `inCubic`, boost intensity by `1+3sq^2`, end on a point. The reverse (a hairline growing from a flatline) gives the handoff.
3. **Beat-stepped flow clock**: integrate a speed that jumps `x1.2` per beat with an `outExpo` ramp, and drive both streamlines and the camera spin from the integral (precomputed table, deterministic).
4. **Marquee ring text on a 3D sheet**: per-glyph affines from two projected points, per-glyph width instance driven by sung progress.
5. **Dots to shape**: `textPoints`, sort by x, map to arc length on an outline, stagger arrival, and have the drawing spark lead the dots.

---
## 4. `ascent` (60.24-69.78, 9.5 s): "I hear the basilisk boom / NVDA to the moon / The Omega Point's coming soon / One E thirty FLOPs a second"

Cuts: `boom=62.02`, `cutB=62.50` (beat), `cutC=64.10`, `cutD=66.14` (beat), `tE0=66.52` ("thirty"), `tL=67.50` (beat of "second").

### Shot list and motion spec
**A (60.24-62.50): the basilisk eye.**
- Hard cut on a beat into an engraved serpent eye, almost closed. A hairline orange seam is the only light (`uLeak = 0.45+0.9*beatPulse+0.5*inQuad` before boom). The camera steps in on every word: `zoom *= 1.075^(outExpo(dt/0.2))` and leans alternately (`leans = [-.07,-.03,-.055,-.015,.02]`).
- Each syllable of "basilisk" cracks the lid open a hair: `open = (0.025+0.012i)e^(-dt/.1)`. The raking light angle flips on every beat (`uLightA` 2.05+0.3*rock).
- The lyric is set **on the eyelid seam**, split in two halves clipped to the upper and lower lid, so it opens with the lid (`up = open*HU*K`).
- **62.02 boom**: `open = outExpo(.12)*(1+.05 sin(34dt)e^(-10dt))` (a snap with ring-back). A shockwave pushes the geometry (`q += n*sw*0.07`, gaussian 0.09 band, speed 3.4/s, `exp(-dt/.28)`) plus a hairline ember ring. Shake `30*e^(-dt/.12)` px, `ca +7`, flash 0.2, zoom +6%. "BOOM" is set on **three expanding arcs** (`textOnArc`), staggered 0.09 s, the first in bone and the others signal.
- 62.02-62.50: the pupil narrows from 0.22 to 0.07 (`outCubic`), then 0.07 to **0.004 hairline slit** (`inCubic`). It goes white-hot (`uSlitGlow`). The camera does `zoom *= 3.2^inCubic(prog(lerp(boom,cutB,.35), cutB))`, a push into the slit.

**B (62.50-64.10): the chart becomes a banknote.**
- **Match cut**: the white slit becomes a vertical orange price line on a log chart. Camera `reveal`: `z = 8^(1-e) * 0.8^e` with `outExpo` (zooming out from the line), screen anchor from (960,-420) to (1390,250).
- NVDA is lettered per syllable (the N, V, D, A each land on a sung syllable, `sc = 1+0.35e^(-dt/.05)`, signal-filled while hot, then bone with ink scan lines). The price steps up per syllable: +2.9, +6.0, +6.5, +8.9 decades, each `outExpo` 0.22-0.32 s, plus shake `0.35*e^(-dt/.09)` and zoom +2.5% per syllable. The camera follows 0.035 s late, then eases (`outCubic`) to the moon on "to the moon", with `inQuad` acceleration into the moon's south limb.
- Axis notes: `$1, $10, ... $1T, $10^13`, and deadpan labels (`<- still log scale`, `<- yes, still log scale`, `<- analysts: "fair value"`, `<- we checked the axis`).
- **63.82 "moon"**: impact. A glow at the south limb (`exp(-d/70)`), `uImpact` ripples the rosettes (`sin(18r - 40t)`), shake `impact^2*14`, flash 0.18, price tag `$m x 10^e`.
- The world is a chart paper that has become a **"LUNAR RESERVE NOTE"**: a frame with woven band, corner `10^30` numerals, serials `NV 10^30 000001 A`, an arc caption, and "In Scaling We Trust".

**C (64.10-66.14): Omega.**
- 64.10: the whole note is **inverted to bone-on-ink** (`uDark`, 0.12 s) and warped into a point: `g = exp(uWarp*(0.6+0.4 smoothstep(0,900,d)))`, `uWarp up to 4.5`, `uSwirl 1.2`, radial streaks, and a white-hot core `exp(-d/4)*40`.
- 180 engraved rays are drawn from the edge inward (`inQuad` drawn over 0.25 s), rotating one click per sung word (`0.045*outExpo(.25)`). A ring of light rides in on **every beat** (`wr = 1250(1-inQuad(beatPhase))`) and 12% of rays carry a heat pulse. The lyric is Cormorant italic, above and below the point, shrinking `0.95*e^(-0.42 dt)` into it. At 66.0 (`collapse`, `inCubic` 0.2 s) everything pulls into the point.

**D (66.14-69.78): the odometer.**
- Hard cut to 31 mechanical drums (3-digit groups with commas). `E = 30*inOutCubic((t-66.52)/(67.50-66.52))`. Drum j at position `10^(E-j) mod 10` with blur `ln10*dE*v/120` digits, so each drum spins at 10x the speed of its right neighbour. Drums more than 14 orders away are random noise (`hash(j, frameIdx)`) with 12 digits of blur.
- Camera: from `zoom 3.0` and x at the ones drum, tracking the leading edge, `pull` back to 0.97 over the roll.
- **67.50 lock**: the spin-down is a wave of zeros settling left to right (`ts = tL + .05 + .013(27-j)`; `p = 10 - 0.35 e^(-e/.06) cos(55e)`, blur `12 e^(-e/.025)`). The leading `1` drum glows signal and rings (`1+.12e^(-e/.07)sin(60e)`). `uThunk` flashes the counter, shake 18 px, zoom +2%.
- Then the camera reframes on the beat (zoom 2.25 to 2.5) and tracks along the zeros toward the 1. A sheen sweeps across on every beat.
- The notation `1 E 30 FLOP/s` is on top in five tokens, one per sung word (`sc = 1+0.25e^(-dt/.045)`), each with a mono gloss. A footnote is typed after the lock: `1 One nonillion floating-point operations per second. Rounded down, for safety.` Then `2 P(doom): <live value>. Also rounded down.`

### Rendering technique
- **Eye (`ascent-eye.ts`)**: one shader in eye space. The head is a Voronoi mosaic of scales (growing away from the eye), the periocular ring is a hex lattice, and the lid margin is granular scales. Each scale is **engraved with contour hatching** (`hatch(u, light)`, with `u = dot(pos, dir)*lines + dome*0.9 + rnd*0.3`, so lines bend over each dome), with a sharp lit lip on the edges that face the light and an imbricated tuck on the lower side. A macro head normal from a height field gives the big form. The iris is radial fibres (`hatch(fu)`) with a hot collarette and a vertical-vesica slit pupil. A specular "window with a mullion" glints.
- **Note (`ascent-note.ts`)**: paper with fibre noise. The **guilloché is made from `rosette()`**: K curves `r = R + a sin(n*theta + phi_k)` evaluated by distance-to-curve (`d = (r - rk)/sqrt(1+slope^2)`, line AA), so a 36-lobe, 10-curve family interlaces into a rosette. A woven band between the frame rules uses two `sin` offsets. Two interlaced sine families of faint hatches (`hatch((y +- 22 sin(.011x) +- 7 sin(.037x))/11, .07)`) form the security field. The moon is **line-relief engraving**: horizontal `hatch` lines whose `u` is lifted by height (`m.y*R - H*R*0.28`), plus a cross-hatch in deep shade. The height field is a bowl+rim set of crater functions, with maria masks.
- **Chart**: ink `LineBatch` candles (bull = hatched body, bear = solid), a decade grid with minor log lines, and the spark as the price line.
- **Comp (`COMP_FRAG`)**: 14-tap directional motion blur from the camera's screen velocity (`camB(t) - camB(t-1/120)`) and the Omega warp, inversion and core, all in one pass.
- **Odometer (`ascent-odo.ts`)**: a ray-less cylinder: for each drum window, `th = asin(y/R)`, digit coordinate `d = pos - th/(2pi/10)`, a 10-digit atlas lookup (mipmapped, anisotropic), shade `cos(th)^1.4` and latitude hatch near the edges. Blur is a 10-tap average of atlas lookups along `d`. A knurled rim hatch sits between drums, and a lip shadow. The leading drum is signal.

### Why it's impressive
- Four different visual languages (scratchboard reptile, ink-on-paper chart, banknote, mechanical counter) are joined by **match cuts**: the slit becomes the price line, the price line lands on the moon, the note collapses to a point, the point becomes the one on the counter.
- The satire is in the details (axis annotations, "In Scaling We Trust", "Rounded down, for safety") and each token of `1E30 FLOP/s` lights up on its sung word.
- The odometer's maths is honest: each drum is exactly `10^(E-j)` with proper motion blur, then a settle wave.

### Reusable techniques
1. **Engraved texture from a cell shader**: Voronoi or hex cells, each with its own dome and hatch direction bent by `dome`, lit with a normal from a macro height field.
2. **Guilloché**: families of `r = R + a sin(n*theta + k*2pi/K)` with distance-to-curve AA, layered with 2 concentric/offset families.
3. **Match cut by geometry**: end shot A on a line that is the same screen shape as shot B's key element, with a 3.2x zoom into it plus a white-hot glow.
4. **Beat-stepped number animation**: an exponent-driven odometer (drum j moves at `10^(E-j)`), blur proportional to speed, then a left-to-right settle wave with a damped cos.
5. **Convergence to a point**: `warpSrc(fc) = uP + rot(swirl/(d/260+.35)) * (fc-uP) * exp(warp*...)`, with an inversion to bone-on-ink and one ring of light per beat down radial rays.

---
## Top 3 to steal across group B
1. **Surface-parametrised engraving** (shoggoth, ascent): hatch lines driven by the geometry's own coordinates plus a light-width term, and rim light as re-inking in orange.
2. **Beat-grid camera director** (room): shots as `{poseA, poseB, ease, snap, kick, rollSpring}` with an `outExpo` snap between them, on every beat, plus impact noise and fake smear.
3. **Lens-shader type** (spacetime): lyric rendered flat then bent through thin-lens math, with the hole as the O of the word.
