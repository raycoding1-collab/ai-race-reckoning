"""NSF-HiFiGAN (ONNX, onnxruntime CPU) vocal re-synthesis test vs a WORLD baseline.

Source voice: Kokoro-82M fp32 (phonemes given directly), ~5 s.
Target: piecewise-constant sung notes (F minor) + glide + vibrato, same timing as the speech.
Paths:
  WORLD    : pyworld analysis -> synthesize at target f0 (what the song pipeline does today)
  NSF_A    : mel(WORLD output) + target f0 -> NSF-HiFiGAN (neural 'repair' of WORLD output)
  NSF_B    : mel(original speech) + target f0 -> NSF-HiFiGAN (pitch-controllable, formant-preserving)
Run with: venv python -I (isolated).
"""
import sys, time, resource, json
import numpy as np, soundfile as sf, librosa, pyworld as pw, parselmouth
import onnxruntime as ort
from parselmouth.praat import call
from kokoro_onnx import Kokoro

S = "/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands"
OUT = f"{S}/test/nsf"
import os; os.makedirs(OUT, exist_ok=True)
ONNX = sys.argv[1] if len(sys.argv) > 1 else f"{S}/dl/nsf/oudep25/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.onnx"
TAG = sys.argv[2] if len(sys.argv) > 2 else "pc2025"
SR, HOP, WIN, NFFT, NMEL, FMIN, FMAX = 44100, 512, 2048, 2048, 128, 40, 16000


def cpu():
    r = resource.getrusage(resource.RUSAGE_SELF)
    return r.ru_utime + r.ru_stime


class Timer:
    def __init__(self, name): self.name = name
    def __enter__(self): self.w, self.c = time.perf_counter(), cpu(); return self
    def __exit__(self, *a):
        self.wall, self.cpu = time.perf_counter() - self.w, cpu() - self.c
        print(f"  [{self.name}] wall={self.wall:.2f}s cpu={self.cpu:.2f}s")


_MEL = librosa.filters.mel(sr=SR, n_fft=NFFT, n_mels=NMEL, fmin=FMIN, fmax=FMAX)  # slaney scale+norm (librosa default)


def mel_ln(y):
    """Exact openvpi/DiffSinger recipe: reflect pad (win-hop)//2, hann, center=False, |STFT|, slaney mel, ln(clip(1e-5))."""
    pad = (WIN - HOP) // 2
    yp = np.pad(y.astype(np.float32), (pad, (WIN - HOP + 1) // 2), mode="reflect")
    spec = np.abs(librosa.stft(yp, n_fft=NFFT, hop_length=HOP, win_length=WIN, window="hann", center=False))
    return np.log(np.clip(_MEL @ spec, 1e-5, None)).T.astype(np.float32)  # [T,128]


def frame_times(n_frames):  # center of frame i with center=False + pad
    return (np.arange(n_frames) * HOP + HOP // 2) / SR


# ---------------------------------------------------------------- 1. voice source
print("1) Kokoro speech")
k = Kokoro(f"{S}/dl/kokoro/kokoro-v1.0.onnx", f"{S}/dl/kokoro/voices-v1.0.bin")
phrases = ["hˈOld mˈi ɪn ðə dˈɑɹk tənˈIt", "ðə sˈɪlɪkən ɪz sˈɪŋɪŋ", "ˈɔl ðə lˈIts gˌO dˈWn"]
chunks, sr_k = [], 24000
with Timer("kokoro x3") as tk:
    for p in phrases:
        a, sr_k = k.create(p, voice="af_heart", speed=1.0, lang="en-us", is_phonemes=True)
        chunks += [a.astype(np.float64), np.zeros(int(0.12 * sr_k))]
x24 = np.concatenate(chunks)
dur = len(x24) / sr_k
print(f"  speech {dur:.2f}s @ {sr_k} Hz")
sf.write(f"{OUT}/0_speech24k.wav", x24, sr_k)
x44 = librosa.resample(x24, orig_sr=sr_k, target_sr=SR, res_type="soxr_hq").astype(np.float32)

# ---------------------------------------------------------------- 2. WORLD analysis + sung-pitch target
print("2) WORLD analysis / baseline")
FP = 5.0
with Timer("world analysis") as tw:
    f0, t = pw.harvest(x24, sr_k, f0_floor=70.0, f0_ceil=600.0, frame_period=FP)
    f0 = pw.stonemask(x24, f0, t, sr_k)
    sp = pw.cheaptrick(x24, f0, t, sr_k)
    ap = pw.d4c(x24, f0, t, sr_k)
voiced = f0 > 0
print(f"  voiced frames {voiced.mean()*100:.0f}%  speech f0 median {np.median(f0[voiced]):.0f} Hz")
# runs of voiced frames -> notes (F minor), with glide + vibrato
notes_hz = [174.61, 207.65, 261.63, 311.13, 349.23, 311.13, 261.63, 207.65, 233.08, 261.63, 311.13, 349.23]
f0_t = np.zeros_like(f0)
runs, i = [], 0
while i < len(voiced):
    if voiced[i]:
        j = i
        while j < len(voiced) and voiced[j]: j += 1
        if j - i >= 8: runs.append((i, j))
        i = j
    else: i += 1
prev = notes_hz[0]
for n, (a, b) in enumerate(runs):
    tgt = notes_hz[n % len(notes_hz)]
    L = b - a
    glide = np.clip(np.arange(L) / 10.0, 0, 1)                    # 50 ms glide
    base = prev * (tgt / prev) ** glide
    tt = np.arange(L) * FP / 1000
    vib = 1 + 0.0175 * np.clip((tt - 0.12) / 0.15, 0, 1) * np.sin(2 * np.pi * 5.6 * tt)  # ~30 cents
    f0_t[a:b] = base * vib
    prev = tgt
print(f"  {len(runs)} voiced runs -> notes; target f0 {f0_t[f0_t>0].min():.0f}..{f0_t.max():.0f} Hz "
      f"(shift {12*np.log2(f0_t[f0_t>0].min()/np.median(f0[voiced])):+.1f}..{12*np.log2(f0_t.max()/np.median(f0[voiced])):+.1f} st vs median)")
with Timer("world synth") as tws:
    y_world24 = pw.synthesize(f0_t, sp, ap, sr_k, FP)
y_world44 = librosa.resample(y_world24, orig_sr=sr_k, target_sr=SR, res_type="soxr_hq").astype(np.float32)
sf.write(f"{OUT}/1_world_baseline.wav", y_world44, SR)

# target f0 on NSF frame grid
def f0_on_grid(n_frames):
    tt = frame_times(n_frames)
    fi = np.interp(tt, t, f0_t)
    uv = np.interp(tt, t, (f0_t > 0).astype(float)) > 0.5
    return np.where(uv, fi, 0.0).astype(np.float32)

# ---------------------------------------------------------------- 3. NSF-HiFiGAN
print(f"3) NSF-HiFiGAN ONNX [{TAG}]")
so = ort.SessionOptions(); so.intra_op_num_threads = 4
sess = ort.InferenceSession(ONNX, so, providers=["CPUExecutionProvider"])

def vocode(mel, f0g):
    return sess.run(None, {"mel": mel[None], "f0": f0g[None]})[0][0]

# warm-up (JIT/arena alloc) on 1 s
_ = vocode(np.zeros((86, 128), np.float32) - 8, np.zeros(86, np.float32))
res = {}
for name, src in [("NSF_A_world_mel", y_world44), ("NSF_B_speech_mel_shiftedf0", x44)]:
    with Timer(f"mel+vocode {name}") as tm:
        mel = mel_ln(src); T = mel.shape[0]
        f0g = f0_on_grid(T)
        y = vocode(mel, f0g)
    sf.write(f"{OUT}/{'2' if 'A' in name else '3'}_{TAG}_{name}.wav", y, SR)
    res[name] = (y, tm)
    print(f"    frames={T} out={len(y)/SR:.2f}s  RTF(wall)={tm.wall/(len(y)/SR):.2f}  CPU-s per audio-s={tm.cpu/(len(y)/SR):.2f}")

# ---------------------------------------------------------------- 4. objective checks
print("4) objective checks vs target f0")
def praat_pitch(y):
    snd = parselmouth.Sound(y.astype(np.float64), SR)
    p = snd.to_pitch_ac(time_step=HOP / SR, pitch_floor=70, pitch_ceiling=900, voicing_threshold=0.6)
    return p.selected_array["frequency"], p.xs()

def metrics(label, y):
    fm, xs = praat_pitch(y)
    ft = np.interp(xs, t, f0_t); uv = np.interp(xs, t, (f0_t > 0).astype(float)) > 0.5
    ok = uv & (fm > 0) & (ft > 0)
    cents = 1200 * np.log2(fm[ok] / ft[ok])
    oct_err = np.mean(np.abs(cents) > 600) * 100
    c2 = cents[np.abs(cents) <= 600]
    snd = parselmouth.Sound(y.astype(np.float64), SR)
    hnr = call(snd.to_harmonicity_cc(0.01, 70, 0.1, 1.0), "Get mean", 0, 0)
    S_ = np.abs(librosa.stft(y, n_fft=2048, hop_length=512)) ** 2
    fr = librosa.fft_frequencies(sr=SR, n_fft=2048)
    hf = S_[fr >= 8000].sum() / S_.sum() * 100
    flat = librosa.feature.spectral_flatness(S=np.sqrt(S_)).mean()
    print(f"  {label:34s} pitch-found {ok.sum()/max(1,(uv).sum())*100:4.0f}% | f0 err median {np.median(c2):+6.1f} c, RMS {np.sqrt(np.mean(c2**2)):5.1f} c, "
          f">600c {oct_err:4.1f}% | HNR {hnr:5.1f} dB | E>8k {hf:5.2f}% | flatness {flat:.4f}")
metrics("WORLD baseline", y_world44)
for name, (y, _) in res.items(): metrics(name, y)
# mel reconstruction error: NSF_A output re-analysed vs input mel (the vocoder's own fidelity)
y, _ = res["NSF_A_world_mel"]
ma, mb = mel_ln(y_world44), mel_ln(y[: len(y_world44)])
n = min(len(ma), len(mb))
print(f"  NSF_A re-analysed mel vs WORLD-output mel: mean |dln| = {np.mean(np.abs(ma[:n]-mb[:n])):.3f} (ln units)")
print("done")
