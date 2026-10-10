# Research scripts (Phase 2: sound upgrade)

These are the working test scripts from the two research agents (2026-10-10). Their findings are in `docs/RESEARCH_ears.md` (measuring the song) and `docs/RESEARCH_hands.md` (improving it).

The scripts ran in a scratchpad that no longer exists. Hard-coded paths such as `/tmp/claude-0/.../scratchpad/ears` or `.../hands` point at the model, sample and pip download folders, so re-download those (see the download commands in the RESEARCH files and `ears/dl_models.sh`) and fix the paths before running anything.

- `ears/`: `asr_eval.py` and `asr_multi.py` (sherpa-onnx Whisper and Parakeet, word error rate per lyric line), `clap_score.py` (+ `clap_utils.py`; LAION-CLAP ONNX prompt scores), `tag_eval.py` and `panns_eval.py` (AudioSet tags), `dsp_eval.py` (LUFS, key, tempo, spectrum), `madmom_eval.py` (+ `madmom_patch_install.sh`).
- `hands/`: sampled-instrument, drum, effects, mastering and vocal tests (tinysoundfont, sfizz, pedalboard, Faust/DawDreamer, matchering, Kokoro, NSF-HiFiGAN).
