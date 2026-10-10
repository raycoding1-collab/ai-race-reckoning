#!/bin/bash
# Install voice-test deps into the scratch venv and fetch Kokoro model files. Research only.
S=/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands
export TIMEFORMAT='%R s wall'
echo "== pip install pyworld praat-parselmouth kokoro-onnx"
time $S/venv/bin/pip install --no-input pyworld praat-parselmouth kokoro-onnx > $S/install_voice.log 2>&1
tail -3 $S/install_voice.log | cut -c1-300
mkdir -p $S/dl/kokoro && cd $S/dl/kokoro
B=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
for f in voices-v1.0.bin kokoro-v1.0.int8.onnx kokoro-v1.0.onnx; do
  echo "== $f"
  time curl -sSL -m 600 -o $f $B/$f
  ls -la $f | awk '{print $5}'
done
echo VOICE_DONE
