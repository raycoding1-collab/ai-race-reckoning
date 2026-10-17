#!/usr/bin/env python3
"""madmom (patched build) beats/downbeats/chords on an excerpt. usage: madmom_eval.py <wav44k>"""
import sys, time
import numpy as np
import madmom
from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
from madmom.features.key import CNNKeyRecognitionProcessor, key_prediction_to_label

wav = sys.argv[1]
print("madmom", madmom.__version__)
c0, w0 = time.process_time(), time.perf_counter()
act = RNNBeatProcessor()(wav)
beats = DBNBeatTrackingProcessor(fps=100)(act)
ibi = np.diff(beats)
print(f"BEATS n={len(beats)} median tempo={60 / np.median(ibi):.1f} BPM  ibi-cv={ibi.std() / ibi.mean():.3f}  [cpu {time.process_time() - c0:.1f}s wall {time.perf_counter() - w0:.1f}s]")
c0, w0 = time.process_time(), time.perf_counter()
dact = RNNDownBeatProcessor()(wav)
db = DBNDownBeatTrackingProcessor(beats_per_bar=[4], fps=100)(dact)
print(f"DOWNBEATS n_bars={int((db[:, 1] == 1).sum())} first bars at {db[db[:, 1] == 1][:4, 0].round(2).tolist()} s  [cpu {time.process_time() - c0:.1f}s wall {time.perf_counter() - w0:.1f}s]")
c0, w0 = time.process_time(), time.perf_counter()
feat = CNNChordFeatureProcessor()(wav)
ch = CRFChordRecognitionProcessor()(feat)
print("CHORDS (start,end,label): " + " | ".join(f"{a:.1f}-{b:.1f} {l}" for a, b, l in ch[:14]) + f"  [cpu {time.process_time() - c0:.1f}s wall {time.perf_counter() - w0:.1f}s]")
c0, w0 = time.process_time(), time.perf_counter()
k = CNNKeyRecognitionProcessor()(wav)
print("KEY:", key_prediction_to_label(k), f"[cpu {time.process_time() - c0:.1f}s wall {time.perf_counter() - w0:.1f}s]")
