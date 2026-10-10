#!/usr/bin/env python3
"""PANNs Cnn14 AudioSet tagging via ONNX (ailia-models export on GCS). usage: panns_eval.py <onnx> <labels.csv> <wav>"""
import csv, sys, time
import numpy as np, librosa, onnxruntime as ort
onnx_path, lab, wav = sys.argv[1:4]
labels = [r["display_name"] for r in csv.DictReader(open(lab))]
so = ort.SessionOptions(); so.intra_op_num_threads = 4
c0, w0 = time.process_time(), time.perf_counter()
s = ort.InferenceSession(onnx_path, so, providers=["CPUExecutionProvider"])
print("load cpu=%.1fs wall=%.1fs" % (time.process_time() - c0, time.perf_counter() - w0))
print("inputs", [(i.name, i.shape, i.type) for i in s.get_inputs()], "outputs", [(o.name, o.shape) for o in s.get_outputs()])
y, _ = librosa.load(wav, sr=32000, mono=True)
N = s.get_inputs()[0].shape[1]                                  # fixed 224000 samples = 7 s
starts = list(range(0, max(1, len(y) - N + 1), 96000))          # 7 s windows, 3 s hop
c0, w0 = time.process_time(), time.perf_counter()
P, E = [], []
for st in starts:
    seg = y[st:st + N]
    seg = np.pad(seg, (0, N - len(seg)))
    outs = s.run(None, {s.get_inputs()[0].name: seg[None].astype(np.float32)})
    P.append(outs[0][0]); E.append(outs[1][0] if len(outs) > 1 else None)
cpu, wall = time.process_time() - c0, time.perf_counter() - w0
print("run %d windows x 7 s (%.0f s audio): cpu=%.2fs wall=%.2fs" % (len(starts), len(y) / 32000, cpu, wall), [o.shape for o in outs])
p = np.mean(P, 0)
idx = np.argsort(-p)[:14]
print("TOP:", " | ".join(f"{labels[i]}={p[i]:.2f}" for i in idx))
want = ["Music", "Singing", "Female singing", "Vocal music", "Synthesizer", "Electronic music", "Techno", "Pop music", "Dubstep",
        "Speech", "Drum machine", "Bass drum", "Sampler", "Dance music", "Electronica", "Rhythm and blues", "Soundtrack music"]
print("KEY:", " | ".join(f"{n}={p[labels.index(n)]:.2f}" for n in want if n in labels))
if E[0] is not None:
    print("embedding dim", E[0].shape)
