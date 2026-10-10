#!/usr/bin/env python3
"""Per-lyric-line ASR intelligibility with sherpa-onnx engines (whisper | parakeet | moonshine).

usage: asr_multi.py <engine> <model_dir> <wav16k> <win_start_s> <lyrics.json> [--prefix tiny.en] [--int8] [--quiet] [--json out.json]
Each lyric line is cut at [start-0.25, end+0.25] (times come from lyrics.json) and decoded alone; WER/CER vs the line text.
"""
import json, re, sys, time
import numpy as np
import soundfile as sf
import jiwer
import sherpa_onnx

engine, mdir, wav, t0, lyr = sys.argv[1:6]
t0 = float(t0)
prefix = sys.argv[sys.argv.index("--prefix") + 1] if "--prefix" in sys.argv else ""
int8 = "--int8" in sys.argv
quiet = "--quiet" in sys.argv
jout = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
NUMS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight",
        "9": "nine", "10": "ten", "12": "twelve", "180": "hundred eighty"}


def norm(s):
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^\w\s']", " ", s)
    s = re.sub(r"'s\b", "s", s)
    return re.sub(r"\s+", " ", " ".join(NUMS.get(w, w) for w in s.split())).strip()


x, sr = sf.read(wav, dtype="float32")
assert sr == 16000 and x.ndim == 1
dur = len(x) / sr
sfx = ".int8.onnx" if int8 else ".onnx"
c0, w0 = time.process_time(), time.perf_counter()
if engine == "whisper":
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f"{mdir}/{prefix}-encoder{sfx}", decoder=f"{mdir}/{prefix}-decoder{sfx}",
                                                     tokens=f"{mdir}/{prefix}-tokens.txt", language="en", task="transcribe", num_threads=4)
elif engine == "parakeet":
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=f"{mdir}/encoder.int8.onnx", decoder=f"{mdir}/decoder.int8.onnx",
                                                        joiner=f"{mdir}/joiner.int8.onnx", tokens=f"{mdir}/tokens.txt",
                                                        num_threads=4, model_type="nemo_transducer")
elif engine == "moonshine":
    rec = sherpa_onnx.OfflineRecognizer.from_moonshine(preprocessor=f"{mdir}/preprocess.onnx", encoder=f"{mdir}/encode.int8.onnx",
                                                       uncached_decoder=f"{mdir}/uncached_decode.int8.onnx",
                                                       cached_decoder=f"{mdir}/cached_decode.int8.onnx", tokens=f"{mdir}/tokens.txt", num_threads=4)
else:
    raise SystemExit("engine?")
lc, lw = time.process_time() - c0, time.perf_counter() - w0

lines = [l for l in json.load(open(lyr))["lines"] if l["start"] >= t0 and l["end"] <= t0 + dur]
tot = dict(S=0, D=0, I=0, H=0)
res = []
c0, w0 = time.process_time(), time.perf_counter()
for l in lines:
    a, b = max(0.0, l["start"] - 0.25 - t0), min(dur, l["end"] + 0.25 - t0)
    s = rec.create_stream(); s.accept_waveform(sr, x[int(a * sr):int(b * sr)]); rec.decode_stream(s)
    h = s.result.text.strip()
    r = norm(l["text"]); o = jiwer.process_words(r, norm(h))
    for k, v in zip("SDIH", (o.substitutions, o.deletions, o.insertions, o.hits)):
        tot[k] += v
    res.append(dict(i=l["i"], section=l["section"], start=l["start"], ref=l["text"], hyp=h, wer=o.wer))
    if not quiet:
        print(f"  L{l['i']:<2} {l['section']:<7} WER={o.wer:.2f} | REF: {l['text']}\n{'':>26}| HYP: {h}")
cpu, wall = time.process_time() - c0, time.perf_counter() - w0
n = tot["S"] + tot["D"] + tot["H"]
print(f"[{engine} {prefix}{' int8' if int8 else ''}] load cpu={lc:.1f}s | {len(lines)} lines ({dur:.0f}s audio) decode cpu={cpu:.1f}s wall={wall:.1f}s | "
      f"WER={(tot['S'] + tot['D'] + tot['I']) / max(1, n):.3f} (S{tot['S']} D{tot['D']} I{tot['I']} of {n} ref words)")
if jout:
    json.dump(res, open(jout, "w"), indent=1)
