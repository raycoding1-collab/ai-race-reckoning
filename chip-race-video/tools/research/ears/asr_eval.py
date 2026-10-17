#!/usr/bin/env python3
"""Lyric-intelligibility check: sherpa-onnx Whisper ASR vs the known lyric lines.

usage: asr_eval.py <model_dir> <model_prefix e.g. tiny.en> <wav16k> <win_start_s> <lyrics.json> [--int8]
Prints whole-window transcript + per-line WER/CER and CPU/wall time. Read-only on inputs.
"""
import json, re, sys, time
import numpy as np
import soundfile as sf
import jiwer
import sherpa_onnx

model_dir, prefix, wav, t0, lyr = sys.argv[1:6]
int8 = "--int8" in sys.argv
t0 = float(t0)
sr_expect = 16000

NUMS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
        "7": "seven", "8": "eight", "9": "nine", "10": "ten", "12": "twelve", "180": "hundred eighty"}


def norm(s: str) -> str:
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^\w\s']", " ", s)
    s = re.sub(r"'s\b", "s", s)  # nobody's -> nobodys (same on both sides)
    s = " ".join(NUMS.get(w, w) for w in s.split())
    return re.sub(r"\s+", " ", s).strip()


x, sr = sf.read(wav, dtype="float32")
assert sr == sr_expect and x.ndim == 1, (sr, x.shape)
dur = len(x) / sr
suffix = ".int8.onnx" if int8 else ".onnx"

c0, w0 = time.process_time(), time.perf_counter()
rec = sherpa_onnx.OfflineRecognizer.from_whisper(
    encoder=f"{model_dir}/{prefix}-encoder{suffix}",
    decoder=f"{model_dir}/{prefix}-decoder{suffix}",
    tokens=f"{model_dir}/{prefix}-tokens.txt",
    language="en", task="transcribe", num_threads=4, decoding_method="greedy_search")
load_cpu, load_wall = time.process_time() - c0, time.perf_counter() - w0


def decode(samples):
    s = rec.create_stream()
    s.accept_waveform(sr, samples)
    rec.decode_stream(s)
    return s.result.text.strip()


lines = [l for l in json.load(open(lyr))["lines"] if l["start"] >= t0 and l["end"] <= t0 + dur]
ref_all = " ".join(l["text"] for l in lines)

c0, w0 = time.process_time(), time.perf_counter()
hyp_all = decode(x)
win_cpu, win_wall = time.process_time() - c0, time.perf_counter() - w0
o = jiwer.process_words(norm(ref_all), norm(hyp_all))
print(f"[{prefix}{' int8' if int8 else ' fp32'}] load cpu={load_cpu:.1f}s wall={load_wall:.1f}s | "
      f"WINDOW {dur:.0f}s decode cpu={win_cpu:.1f}s wall={win_wall:.1f}s  (RTF cpu={win_cpu/dur:.2f})")
print(f"  window WER={o.wer:.2f} (S{o.substitutions} D{o.deletions} I{o.insertions} H{o.hits} of {len(norm(ref_all).split())} ref words)")
print(f"  HYP: {hyp_all}")

tot = dict(S=0, D=0, I=0, H=0)
c0, w0 = time.process_time(), time.perf_counter()
for l in lines:
    a, b = max(0.0, l["start"] - 0.25 - t0), min(dur, l["end"] + 0.25 - t0)
    h = decode(x[int(a * sr):int(b * sr)])
    r = norm(l["text"])
    oo = jiwer.process_words(r, norm(h))
    for k, v in zip("SDIH", (oo.substitutions, oo.deletions, oo.insertions, oo.hits)):
        tot[k] += v
    print(f"  L{l['i']:<2} {l['section']:<7} WER={oo.wer:.2f} CER={jiwer.cer(r, norm(h)):.2f} | REF: {l['text']}\n"
          f"{'':>28}| HYP: {h}")
n_ref = tot["S"] + tot["D"] + tot["H"]
print(f"  per-line total: WER={(tot['S']+tot['D']+tot['I'])/max(1,n_ref):.2f} over {len(lines)} lines; "
      f"decode cpu={time.process_time()-c0:.1f}s wall={time.perf_counter()-w0:.1f}s")
