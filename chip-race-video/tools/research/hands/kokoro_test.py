"""Time Kokoro-82M (kokoro-onnx) on CPU for a short phrase; write wav under scratchpad/hands/test."""
import sys, time, resource
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
which = sys.argv[1]            # int8 | fp32
text = sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
model = f"{S}/dl/kokoro/kokoro-v1.0.int8.onnx" if which == "int8" else f"{S}/dl/kokoro/kokoro-v1.0.onnx"

def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF)
    return r.ru_utime + r.ru_stime

t0, c0 = time.perf_counter(), cpu()
k = Kokoro(model, f"{S}/dl/kokoro/voices-v1.0.bin")
t1, c1 = time.perf_counter(), cpu()
is_ph = text.startswith("ph:")
samples, sr = k.create(text[3:] if is_ph else text, voice=voice, speed=1.0, lang="en-us", is_phonemes=is_ph)
t2, c2 = time.perf_counter(), cpu()
dur = len(samples) / sr
out = f"{S}/test/kokoro_{which}_{voice}.wav"
sf.write(out, samples, sr)
print(f"[{which}] load wall={t1-t0:.2f}s cpu={c1-c0:.2f}s | synth wall={t2-t1:.2f}s cpu={c2-c1:.2f}s "
      f"for {dur:.2f}s audio @ {sr} Hz -> RTF(wall)={(t2-t1)/dur:.2f} | {out}")
