#!/usr/bin/env python3
"""AudioSet tagging with sherpa-onnx CED on 10 s windows (hop 5 s). Prints top classes and music-relevant groups.

usage: tag_eval.py <model_dir> <wav16k> [--int8] [--json out.json]
"""
import csv, json, sys, time
import numpy as np
import soundfile as sf
import sherpa_onnx

model_dir, wav = sys.argv[1:3]
int8 = "--int8" in sys.argv
jout = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None

x, sr = sf.read(wav, dtype="float32")
assert sr == 16000 and x.ndim == 1
labels = [r["display_name"] for r in csv.DictReader(open(f"{model_dir}/class_labels_indices.csv"))]
assert len(labels) == 527

c0, w0 = time.process_time(), time.perf_counter()
tagger = sherpa_onnx.AudioTagging(sherpa_onnx.AudioTaggingConfig(
    model=sherpa_onnx.AudioTaggingModelConfig(
        ced=f"{model_dir}/model{'.int8' if int8 else ''}.onnx", num_threads=4, debug=False, provider="cpu"),
    labels=f"{model_dir}/class_labels_indices.csv", top_k=527))
print(f"load cpu={time.process_time()-c0:.1f}s wall={time.perf_counter()-w0:.1f}s")

win, hop = 10 * sr, 5 * sr
starts = list(range(0, max(1, len(x) - win + 1), hop))
P = np.zeros((len(starts), 527), dtype=np.float32)
c0, w0 = time.process_time(), time.perf_counter()
for k, s0 in enumerate(starts):
    st = tagger.create_stream()
    st.accept_waveform(sr, x[s0:s0 + win])
    for e in tagger.compute(st):
        P[k, e.index] = e.prob
cpu, wall = time.process_time() - c0, time.perf_counter() - w0
print(f"tag {len(starts)} windows x 10 s: cpu={cpu:.2f}s wall={wall:.2f}s (RTF cpu={cpu/(len(x)/sr):.3f})")

m = P.mean(0)
order = np.argsort(-m)
print("TOP 18 (mean prob over windows):")
for i in order[:18]:
    print(f"  {m[i]:.3f}  {labels[i]}   per-window: {' '.join(f'{p:.2f}' for p in P[:, i])}")

want = ["Music", "Musical instrument", "Singing", "Female singing", "Male singing", "Vocal music", "Choir", "A capella",
        "Synthesizer", "Electronic music", "Techno", "House music", "Electronica", "Dance music", "Pop music", "Dubstep",
        "Drum machine", "Drum kit", "Bass drum", "Bass guitar", "Sampler", "Electronic dance music", "Trance music",
        "Speech", "Female speech, woman speaking", "Noise", "Hiss", "Distortion", "Static", "Clipping",
        "Sad music", "Scary music", "Tender music", "Happy music", "Exciting music", "Angry music", "Music of Bollywood",
        "Ambient music", "New-age music", "Soundtrack music", "Theme music", "Rock music", "Hip hop music", "Opera"]
idx = {n: i for i, n in enumerate(labels)}
print("MUSIC-RELEVANT CLASSES (mean prob):")
row = []
for n in want:
    if n in idx:
        row.append(f"{n}={m[idx[n]]:.2f}")
print("  " + " | ".join(row))
missing = [n for n in want if n not in idx]
if missing:
    print("  (not in label set:", ", ".join(missing), ")")
if jout:
    json.dump({"labels": labels, "starts_s": [s / sr for s in starts], "P": P.round(4).tolist(), "cpu_s": cpu, "wall_s": wall},
              open(jout, "w"))
