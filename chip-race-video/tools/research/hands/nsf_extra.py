"""Extra NSF-HiFiGAN checks: copy-synthesis fidelity (validates mel recipe), unvoiced/sibilant retention,
thread scaling, long-clip scaling + peak RSS. Isolated venv python."""
import sys, time, resource
import numpy as np, soundfile as sf, librosa, pyworld as pw
import onnxruntime as ort

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
OUT = f"{S}/test/nsf"
SR, HOP, WIN, NFFT, NMEL, FMIN, FMAX = 44100, 512, 2048, 2048, 128, 40, 16000
MODELS = {"pc2025": f"{S}/dl/nsf/oudep25/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx",
          "v1_2022": f"{S}/dl/nsf/onnxv1/nsf_hifigan_onnx/nsf_hifigan.onnx"}
_MEL = librosa.filters.mel(sr=SR, n_fft=NFFT, n_mels=NMEL, fmin=FMIN, fmax=FMAX)

def mel_ln(y):
    pad = (WIN - HOP) // 2
    yp = np.pad(y.astype(np.float32), (pad, (WIN - HOP + 1) // 2), mode="reflect")
    spec = np.abs(librosa.stft(yp, n_fft=NFFT, hop_length=HOP, win_length=WIN, window="hann", center=False))
    return np.log(np.clip(_MEL @ spec, 1e-5, None)).T.astype(np.float32)

def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF); return r.ru_utime + r.ru_stime

def session(path, threads):
    so = ort.SessionOptions(); so.intra_op_num_threads = threads
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])

def run(sess, mel, f0):
    w, c = time.perf_counter(), cpu()
    y = sess.run(None, {"mel": mel[None], "f0": f0[None]})[0][0]
    return y, time.perf_counter() - w, cpu() - c

# speech (24k) -> 44.1k, f0 of the speech itself on the NSF grid
x24, sr_k = sf.read(f"{OUT}/0_speech24k.wav")
x44 = librosa.resample(x24, orig_sr=sr_k, target_sr=SR, res_type="soxr_hq").astype(np.float32)
f0w, t = pw.harvest(x24, sr_k, f0_floor=70.0, f0_ceil=600.0, frame_period=5.0)
f0w = pw.stonemask(x24, f0w, t, sr_k)
mel = mel_ln(x44); T = mel.shape[0]
tt = (np.arange(T) * HOP + HOP // 2) / SR
f0g = np.where(np.interp(tt, t, (f0w > 0).astype(float)) > 0.5, np.interp(tt, t, f0w), 0).astype(np.float32)
uv = f0g == 0

print("A) copy-synthesis (mel + own f0, no shift): validates the mel recipe")
for name, p in MODELS.items():
    s = session(p, 4); run(s, mel[:86], f0g[:86])  # warm-up
    y, w, c = run(s, mel, f0g)
    n = min(len(y), len(x44))
    m2 = mel_ln(y[:n]); m1 = mel_ln(x44[:n]); k = min(len(m1), len(m2))
    d = np.abs(m1[:k] - m2[:k])
    # unvoiced-frame energy above 4 kHz, speech vs resynth (dB)
    fr = librosa.mel_frequencies(n_mels=NMEL + 2, fmin=FMIN, fmax=FMAX)[1:-1]
    hi = fr >= 4000
    uvk = uv[:k]
    e1 = np.log(np.exp(m1[:k][uvk][:, hi]).mean()) if uvk.any() else np.nan
    e2 = np.log(np.exp(m2[:k][uvk][:, hi]).mean()) if uvk.any() else np.nan
    print(f"  {name:8s} mean|dln mel|={d.mean():.3f}  voiced={d[~uvk[:k]].mean():.3f} unvoiced={d[uvk[:k]].mean():.3f} | "
          f"unvoiced >4k energy resynth-vs-source = {10*(e2-e1)/np.log(10):+.1f} dB | wall={w:.2f}s cpu={c:.2f}s for {len(x44)/SR:.2f}s audio")
    sf.write(f"{OUT}/4_copysynth_{name}.wav", y, SR)

print("B) thread scaling (pc2025, 4.35 s clip)")
for th in (1, 2, 4):
    s = session(MODELS["pc2025"], th); run(s, mel[:86], f0g[:86])
    y, w, c = run(s, mel, f0g)
    print(f"  threads={th}: wall={w:.2f}s cpu={c:.2f}s  RTF(wall)={w/(len(x44)/SR):.2f}")

print("C) long clip scaling (loop speech to ~60 s), 4 threads, peak RSS")
reps = int(np.ceil(60 / (len(x44) / SR)))
melL = np.tile(mel, (reps, 1)); f0L = np.tile(f0g, reps)
s = session(MODELS["pc2025"], 4); run(s, mel[:86], f0g[:86])
y, w, c = run(s, melL, f0L)
rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
print(f"  {len(y)/SR:.1f}s audio: wall={w:.1f}s cpu={c:.1f}s RTF(wall)={w/(len(y)/SR):.2f}  peak RSS={rss:.0f} MB")
print(f"  => extrapolated 142 s vocal: wall ~{142*w/(len(y)/SR):.0f}s, cpu ~{142*c/(len(y)/SR):.0f}s (chunk in ~10 s pieces if RAM tight)")
