# Silicon Shield: chip-race lyric video (pilot)

A 44-second lyric video about the AI chip race. Everything (song, vocals, visuals) is generated from code in this folder.

- `silicon_shield_pilot.mp4`: the rendered pilot (1920×1080, 30 fps)
- `audio/silicon_shield.mp3`: the song on its own

## Pipeline

| Step | File | What it does |
|---|---|---|
| Song definition | `src/song.py` | Tempo (128 BPM), key (F minor), chords, arrangement, and the lyrics with a note for every syllable. This is the single source of truth. |
| Speech | `src/tts.py`, `src/festdump.scm` | Festival (HTS voice) speaks each line and exports phoneme and syllable timings. |
| Singing | `src/sing.py` | WORLD vocoder: retimes each syllable so its vowel lands on the beat, sets pitch to the melody (slides, vibrato), and renders the lead, double, octave and harmony layers. |
| Instrumental and mix | `src/music.py`, `src/dsp.py` | Chiptune voices (NES-style pulse, 4-bit triangle, LFSR noise) inside an electro-pop production: synthesized kick, clap and 808-style hats, sidechained supersaws, sub and reese bass, risers, impacts, a channel-vocoder "robot choir", plate reverb, ping-pong throws, a reference-matched master EQ and a limiter. |
| Timeline | `src/export_timeline.py` | Writes `web/timeline.js` with every word's exact time, so the karaoke sync is exact by construction. |
| Visuals | `web/index.html` | A deterministic canvas renderer (`renderAt(t)`) with 12 scenes. Open `web/index.html?play` over a local server to preview it with audio. |
| Render | `src/render.mjs` | Headless Chromium captures every frame; ffmpeg muxes them with the audio. |

## Rebuild

```bash
apt-get install espeak-ng festival festvox-us-slt-hts
pip install numpy scipy soundfile pyworld
python3 src/tts.py && python3 src/sing.py && python3 src/music.py && python3 src/export_timeline.py
PW_PATH=$(npm root -g)/playwright node src/render.mjs frames build/frames 30
ffmpeg -framerate 30 -i build/frames/f%05d.jpg -i audio/silicon_shield.wav -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest silicon_shield_pilot.mp4
```

Fonts: Archivo, JetBrains Mono, Instrument Serif and Bricolage Grotesque (all SIL OFL, from Google Fonts).
