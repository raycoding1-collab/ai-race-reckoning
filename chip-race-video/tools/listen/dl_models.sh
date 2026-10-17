#!/bin/bash
# Idempotent model download into build/models/ (gitignored). No torch.
# pip deps: pip install sherpa-onnx jiwer onnxruntime librosa pyloudnorm tokenizers soundfile
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
M="$ROOT/build/models"; mkdir -p "$M/clap"
pip install -q sherpa-onnx jiwer onnxruntime librosa pyloudnorm tokenizers soundfile 2>&1 | tail -1

get() {  # get URL DEST  (resumable, retried)
  [ -s "$2" ] && return 0
  for i in 1 2 3 4 5 6 7 8; do
    curl -sSL -C - --retry 3 -m 900 -o "$2.part" "$1" && mv "$2.part" "$2" && return 0
    sleep 2
  done
  echo "FAILED $1" >&2; return 1
}
tarball() {  # tarball URL DIRNAME
  [ -d "$M/$2" ] && [ -n "$(ls -A "$M/$2" 2>/dev/null)" ] && return 0
  get "$1" "$M/$2.tar.bz2" && tar -xjf "$M/$2.tar.bz2" -C "$M" && rm -f "$M/$2.tar.bz2"
}
R=https://github.com/k2-fsa/sherpa-onnx/releases/download
tarball $R/asr-models/sherpa-onnx-whisper-base.en.tar.bz2 sherpa-onnx-whisper-base.en
tarball $R/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2 sherpa-onnx-whisper-tiny.en
tarball $R/audio-tagging-models/sherpa-onnx-ced-mini-audio-tagging-2024-04-19.tar.bz2 sherpa-onnx-ced-mini-audio-tagging-2024-04-19
G=https://storage.googleapis.com/ailia-models/clap
for f in CLAP_audio_LAION-Audio-630K_with_fusion.onnx CLAP_text_text_branch_RobertaModel_roberta-base.onnx CLAP_text_projection_LAION-Audio-630K_with_fusion.onnx; do get $G/$f "$M/clap/$f"; done
for f in vocab.json merges.txt; do get https://raw.githubusercontent.com/axinc-ai/ailia-models/master/audio_processing/clap/tokenizer/$f "$M/clap/$f"; done
ls "$M" "$M/clap"
