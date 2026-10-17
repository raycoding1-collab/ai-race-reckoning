# Silicon Shield: style bible

## The idea
The video is a **process traveller**: the document that follows one wafer lot (LOT 7A-0042) through a fab. It follows that lot from a grain of sand to a datacentre to the border, and back to sand. Each plate is a **step of the process** and has **its own visual instrument and idiom**: a microscope zoom, stroboscope photography, thermography, an exploded cutaway, a freight crane, newspaper halftone, slam type, an engraved transistor, a night aerial, a log chart, an 8-bit game, an airport x-ray, a nautical chart, an STM atom image, fracture and blackout. The video changes look often, but every plate shares one palette, one type system, one grain and the same deadpan humour. Subjects are concrete things treated as **visual puns and transformations**, never literal clip-art illustrations.

## Through-lines (they make it one film, not a playlist)
1. **The beam.** One amber line of light with a white-hot head: the EUV light. It is the laser that hits the tin, the light path through the mirrors, the line Washington draws in the sand, the power line to the datacentre, the line that's "held" in the build, and the line that snaps into the final chorus. It appears in most plates. Draw it with `LineBatch` plus a hot head and a few sputtering particles; it is the only thing that blooms everywhere.
2. **The traveller and the TPP meter.** A small mono instrument staged inside plates (not a fixed corner HUD): `LOT 7A-0042 · STEP 14/31 · TPP ████ 1,200`. TPP (Total Processing Performance, the export-control metric of ECCN 3A090) **climbs at every hook**: 1,200 → 4,800 (the red threshold line) → 19,200 → ∞ → `EXPORT RESTRICTED`. The hooks blow the number up full-screen.
3. **Sand.** The first frame is a grain of sand and the last frame returns to it, so the video loops. Grains reappear: the line in the sand, the gap's dissolving "sand", the hourglass of "rented by the hour", and the crack in the bridge.
4. **The wafer.** The hero object. The chorus turns it into a weapon (a reticle, then shrapnel); it escalates across the three choruses.

## Palette (linear values; only signal and ember may exceed ~0.85, i.e. glow)
- **ink** `#0A0A0B` background, **ink2** `#151517` panels, **graphite** `#5E5B57`, **ash** `#9C978F`, **bone** `#EEE9DF` (paper and type).
- **signal** `#FFA41B`: **cleanroom amber** (lithography bays are lit yellow). The beam, the sung word, highlights.
- **ember** `#FFD27A`: hot cores. **umber** `#7A3A06`: deep amber shadows.
- One rare accent, owned by one idea: **export red** `#E0312B`, used **only** for the RESTRICTED stamps and the TPP threshold line (at most about 4 moments in the whole film). No other hues: no cyan, no purple, no green.
- Some plates invert to **bone paper with ink lines** (newspaper, forms, the chart, the nautical chart), which gives a light/dark rhythm. Amber stays amber on both.

## Typography
- **Archivo** (width 62–125, weight 300–900): the voice of the lyrics. Animate width and weight for expression: stretch on held notes, condense under pressure, expand on belts.
- **IBM Plex Mono**: the machine voice: labels, the traveller, counters, footnotes, forms.
- **Cormorant Garamond italic**: the rare sacred and elegiac register, for the bridge only (and the final "Export restricted" whisper).
- **Single-stroke plotter fonts**: text *written* by the beam or a pen.
- Swiss-grid discipline, asymmetric compositions, hairline rules, small mono annotations beside huge display type. Kerned, with typographic punctuation; no outlined or haloed type; bone type never blooms.

## Motion grammar (measured from the reference; see docs/breakdown/MOTION_STATS.md)
- **Long plates** (8–18 s, one world with an evolving camera) alternate with **burst sequences** (0.2–0.35 s shots) at hooks and transitions.
- Every 1–2 beats something lands. Strong eases (`outExpo`, `inOutCubic`, springs), then holds, then snaps. **No floaty screensaver drift.** Camera punches synced to kicks are +2–5% scale with a fast decay.
- Hard cuts on downbeats by default; every plate ends with a **handoff** that becomes the next plate's opening (a match cut, a morph, or a camera move carrying through). The handoff is specified in the storyboard and is not optional.
- Energy ladder: breakdown below about 1.5 px/frame of optical flow, verse 2–5, chorus and hook 8+. The motion QA flags static stretches longer than 1.2 s that aren't marked as holds.
- Each plate integrates the lyric **graphically and differently**: written by the beam, stamped, typed into a manifest, split-flapped, x-rayed, engraved into a chart, set in pixels, counted in atoms. Never generic subtitles.

## Karaoke rules (all plates)
- Every lyric line is readable and synced per word: a word appears or highlights exactly at its `start` (the note onset) and completes by `end`. It may anticipate by ≤0.4 s at dim levels, but the highlight never runs ahead of the voice. Use `Lyrics.wordProgress`, and syllable times from `word.syl`.
- Sung portion in signal or bone; unsung portion at about 30–40% bone or graphite.
- Keep text ≥96 px from the edges.

## Tone
Impressive, not cute. Deadpan engineering humour: real facts in tiny mono footnotes, delivered straight. These have been checked and can be used:
- EUV uses tin droplets about 27 µm across, at roughly 50,000 per second.
- The plasma is about 220,000 °C, around 40× the sun's surface.
- An EUV scanner weighs about 180 tonnes and ships in about 40 containers, on 20 trucks and 3 cargo planes.
- An EUV scanner has about 11 mirrors.
- 2 nm uses gate-all-around (GAA) nanosheets.
- HBM stacks 12 dies high.
- ECCN 3A090 is the export-control category for advanced computing chips.
- The Taiwan Strait is about 130 km wide at its narrowest.

**Not slop:** no glowing brains, no Matrix rain, no purple neon, no generic particle nebulae, no stock "AI" imagery, no drawn-in-paint clip-art objects. Things must look **rendered or engraved with precision**: raymarched SDFs with hatching, real lighting, hairlines. No logos, no real company UIs, no people's faces.

## Post (engine defaults; override per plate)
Bloom only on signal and ember; halation subtle; grain always on; chromatic aberration only on hits; motion blur from sub-frame averaging at export.
