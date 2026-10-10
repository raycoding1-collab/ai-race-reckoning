"""Retune Kokoro speech to a sung melody with Rubber Band (pedalboard.time_stretch, per-sample pitch curve, formants preserved)
and compare with WORLD (same target f0).  Isolated venv python."""
import time, resource
import numpy as np, soundfile as sf, librosa, pyworld as pw, parselmouth, pedalboard as pb
from parselmouth.praat import call
from scipy.ndimage import uniform_filter1d

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
OUT = f"{S}/test/nsf"; SR = 44100
def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF); return r.ru_utime + r.ru_stime

x24, sr_k = sf.read(f"{OUT}/0_speech24k.wav")
x44 = librosa.resample(x24, orig_sr=sr_k, target_sr=SR, res_type="soxr_hq").astype(np.float32)
FP = 5.0
f0, t = pw.harvest(x24, sr_k, f0_floor=70.0, f0_ceil=600.0, frame_period=FP); f0 = pw.stonemask(x24, f0, t, sr_k)
voiced = f0 > 0
notes_hz = [174.61, 207.65, 261.63, 311.13, 349.23, 311.13, 261.63, 207.65, 233.08, 261.63, 311.13, 349.23]
f0_t = np.zeros_like(f0); runs, i = [], 0
while i < len(voiced):
    if voiced[i]:
        j = i
        while j < len(voiced) and voiced[j]: j += 1
        if j - i >= 8: runs.append((i, j))
        i = j
    else: i += 1
prev = notes_hz[0]
for n, (a, b) in enumerate(runs):
    tgt = notes_hz[n % len(notes_hz)]; L = b - a
    base = prev * (tgt / prev) ** np.clip(np.arange(L) / 10.0, 0, 1)
    tt = np.arange(L) * FP / 1000
    f0_t[a:b] = base * (1 + 0.0175 * np.clip((tt - 0.12) / 0.15, 0, 1) * np.sin(2 * np.pi * 5.6 * tt)); prev = tgt

# per-sample semitone shift curve
ts = np.arange(len(x44)) / SR
src = np.interp(ts, t, f0); tgt = np.interp(ts, t, f0_t)
ok = (np.interp(ts, t, voiced.astype(float)) > 0.5) & (src > 0) & (tgt > 0)
semi = np.where(ok, 12 * np.log2(np.where(ok, tgt, 1) / np.where(ok, src, 1)), 0.0)
semi = uniform_filter1d(semi, size=int(0.02 * SR)).astype(np.float64)       # 20 ms smoothing
print(f"semitone shift range {semi.min():+.1f}..{semi.max():+.1f} st")

res = {}
for name, kw in [("RB_hq_formants", dict(high_quality=True, preserve_formants=True)),
                 ("RB_hq_noformants", dict(high_quality=True, preserve_formants=False))]:
    w, c = time.perf_counter(), cpu()
    y = pb.time_stretch(x44[None, :].copy(), SR, stretch_factor=1.0, pitch_shift_in_semitones=semi, **kw)[0]
    w, c = time.perf_counter() - w, cpu() - c
    print(f"  {name}: wall {w:.2f}s cpu {c:.2f}s for {len(x44)/SR:.2f}s audio (RTF {w/(len(x44)/SR):.2f}); out len {len(y)/SR:.2f}s")
    sf.write(f"{OUT}/5_{name}.wav", y, SR); res[name] = y

def praat_pitch(y):
    snd = parselmouth.Sound(y.astype(np.float64), SR)
    p = snd.to_pitch_ac(time_step=512 / SR, pitch_floor=70, pitch_ceiling=900, voicing_threshold=0.6)
    return p.selected_array["frequency"], p.xs()
def metrics(label, y):
    fm, xs = praat_pitch(y)
    ft = np.interp(xs, t, f0_t); uv = np.interp(xs, t, (f0_t > 0).astype(float)) > 0.5
    okk = uv & (fm > 0) & (ft > 0); cents = 1200 * np.log2(fm[okk] / ft[okk]); c2 = cents[np.abs(cents) <= 600]
    snd = parselmouth.Sound(y.astype(np.float64), SR)
    hnr = call(snd.to_harmonicity_cc(0.01, 70, 0.1, 1.0), "Get mean", 0, 0)
    print(f"  {label:20s} pitch-found {okk.sum()/max(1,uv.sum())*100:4.0f}% | f0 err median {np.median(c2):+6.1f} c RMS {np.sqrt(np.mean(c2**2)):5.1f} c | >600c {np.mean(np.abs(cents)>600)*100:4.1f}% | HNR {hnr:5.1f} dB")
for k, y in res.items(): metrics(k, y[: len(x44)])
# WORLD for reference (same target)
sp = pw.cheaptrick(x24, f0, t, sr_k); ap = pw.d4c(x24, f0, t, sr_k)
yw = librosa.resample(pw.synthesize(f0_t, sp, ap, sr_k, FP), orig_sr=sr_k, target_sr=SR).astype(np.float32)
metrics("WORLD (reference)", yw)
