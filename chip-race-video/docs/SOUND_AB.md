# Sound A/B: v1 vs v2 (Phase 2)

Measured with `tools/listen/listen.py` (Whisper base.en WER per lyric line, LAION-CLAP prompt cosines, CED AudioSet tags, BS.1770 loudness, 4x true peak, band energy, kick onsets vs `data/events.json`). v1 = `audio/silicon_shield_v1.mp3`, v2 = `audio/silicon_shield.mp3`. Timing is locked: `data/` is unchanged, the length is identical, and the video was only re-muxed.

What changed in v2:
- Mix (`src/music.py`): vocal-keyed dynamic EQ that carves 330 Hz and 2.45 kHz out of the pads, synth wall, arps, strings/brass and bass top whenever the voice sings; the unison chip-lead double ducks about 5 dB under the words; chorus vocal +1.6 to +2 dB, lead presence +1.2 dB, shorter chorus reverb; CC0 sampled kick click and snare crack layered on the synth drums (`samples/`), plus a transient shaper; master low shelf -2.5 dB at 140 Hz and +1 dB at 3.2 kHz; master target -12 to -9.5 LUFS.
- Vocal (`src/sing.py`): onset consonants no longer faded out (and lifted ~2.6 dB), a small pitch overshoot after note-to-note glides, a slight formant lift on high notes.

Pitch check (pyin on the lead stem vs lyrics.json): about 1 cent median error after the deliberate octave-down (`O = -12`).

### v1 -> v2

| metric | v1 | v2 | delta |
|---|---|---|---|
| LUFS | -12.3 | -9.5 | +2.8 |
| true peak dBTP | -2.1 | -1.2 | +0.9 WORSE |
| crest dB | 12.0 | 10.6 | -1.5 |
| WER | 0.53 | 0.41 | -0.12 ok |
| CLAP singer-robotic | -0.145 | -0.107 | +0.038 ok |
| CLAP muddy | 0.197 | 0.163 | -0.033 ok |
| CED Singing | 0.02 | 0.02 | +0.00 |
| CED Female singing | 0.01 | 0.01 | -0.00 |
| band sub % | 21.6 | 15.7 | -5.9 |
| band bass % | 48.0 | 44.2 | -3.8 |
| band lowmid % | 10.2 | 11.7 | +1.4 |
| band mid % | 15.0 | 19.1 | +4.1 |
| band himid % | 2.6 | 3.8 | +1.2 |
| band presence % | 1.3 | 2.7 | +1.4 |
| band air % | 1.3 | 2.9 | +1.6 |
| kick matched % | 95 | 99 | +4 ok |
| kick median abs ms | 20.5 | 19.4 | -1.1 ok |
| kick max abs ms | 39.9 | 37.4 | -2.6 ok |

| section | LUFS | WER | gap | muddy | Sing | FSing |
|---|---|---|---|---|---|---|
| intro | -20.2>-17.8 (+2.3) | ->- | -0.204>-0.279 (-0.075) | 0.112>0.081 (-0.031) | 0.02>0.01 (-0.01) | 0.00>0.00 (-0.00) |
| verse1 | -15.5>-12.6 (+2.9) | 0.38>0.21 (-0.17) | -0.083>-0.096 (-0.012) | 0.131>0.124 (-0.007) | 0.02>0.01 (-0.00) | 0.03>0.01 (-0.01) |
| pre1 | -12.5>-9.8 (+2.7) | 0.38>0.12 (-0.25) | -0.164>-0.067 (+0.097) | 0.170>0.186 (+0.016) | 0.01>0.01 (-0.00) | 0.01>0.01 (-0.01) |
| chorus1 | -11.0>-8.0 (+3.0) | 0.48>0.38 (-0.10) | -0.116>0.008 (+0.124) | 0.202>0.157 (-0.045) | 0.01>0.01 (+0.00) | 0.00>0.01 (+0.01) |
| post1 | -11.9>-9.6 (+2.2) | 1.00>1.00 (+0.00) | -0.140>-0.070 (+0.070) | 0.188>0.168 (-0.020) | 0.02>0.03 (+0.00) | 0.00>0.00 (-0.00) |
| verse2 | -14.1>-11.1 (+3.0) | 0.37>0.19 (-0.19) | -0.014>-0.121 (-0.107) | 0.143>0.156 (+0.013) | 0.02>0.02 (+0.00) | 0.00>0.00 (-0.00) |
| pre2 | -12.0>-9.6 (+2.4) | 0.41>0.12 (-0.29) | -0.141>-0.076 (+0.065) | 0.213>0.187 (-0.026) | 0.01>0.01 (+0.00) | 0.02>0.01 (-0.01) |
| chorus2 | -10.3>-7.6 (+2.7) | 0.76>0.43 (-0.33) | -0.164>-0.005 (+0.159) | 0.222>0.172 (-0.050) | 0.01>0.02 (+0.00) | 0.00>0.01 (+0.00) |
| post2 | -11.4>-9.3 (+2.1) | 1.00>1.00 (+0.00) | -0.220>-0.179 (+0.041) | 0.248>0.195 (-0.053) | 0.02>0.03 (+0.00) | 0.00>0.00 (+0.00) |
| bridge | -14.1>-9.8 (+4.3) | 0.13>0.23 (+0.10) | -0.213>-0.276 (-0.063) | 0.191>0.149 (-0.042) | 0.02>0.02 (+0.00) | 0.03>0.03 (+0.00) |
| build | -13.9>-11.2 (+2.6) | 1.00>1.17 (+0.17) | -0.181>-0.071 (+0.110) | 0.267>0.201 (-0.066) | 0.03>0.03 (+0.01) | 0.00>0.00 (-0.00) |
| chorus3 | -9.4>-7.0 (+2.4) | 0.62>0.38 (-0.24) | -0.191>-0.074 (+0.118) | 0.242>0.154 (-0.088) | 0.02>0.02 (-0.00) | 0.00>0.00 (+0.00) |
| outro | -19.5>-13.0 (+6.5) | 1.38>1.62 (+0.25) | -0.199>-0.298 (-0.098) | 0.240>0.267 (+0.027) | 0.02>0.02 (+0.00) | 0.00>0.00 (+0.00) |
