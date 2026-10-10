#!/usr/bin/env python3
"""Classic DSP 'ears': pyloudnorm + librosa + essentia numbers, and a 4-panel PNG Claude can look at.

usage: dsp_eval.py <wav44k_stereo> <win_start_s> <lyrics.json> <out.png>
"""
import json, sys, time
import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import librosa
import pyloudnorm as pyln
from scipy.signal import resample_poly

wav, t0, lyr, png = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
T = {}


def tick(name, c0, w0):
    T[name] = (time.process_time() - c0, time.perf_counter() - w0)


x, sr = sf.read(wav, dtype="float32")          # (n, 2)
mono = x.mean(1)
dur = len(x) / sr
print(f"audio {dur:.1f}s sr={sr} ch={x.shape[1]}")

# ---- loudness (BS.1770 / EBU R128 style)
c0, w0 = time.process_time(), time.perf_counter()
meter = pyln.Meter(sr)
lufs = meter.integrated_loudness(x)
st = []                                          # short-term (3 s window, 1 s hop)
for a in range(0, len(x) - 3 * sr + 1, sr):
    st.append(meter.integrated_loudness(x[a:a + 3 * sr]))
st = np.array(st)
tp = 20 * np.log10(np.abs(resample_poly(x, 4, 1, axis=0)).max() + 1e-12)     # 4x-oversampled true-peak estimate
rms = np.sqrt((x ** 2).mean()); peak = np.abs(x).max()
crest = 20 * np.log10(peak / rms)
tick("pyloudnorm", c0, w0)
print(f"LOUDNESS integrated={lufs:.1f} LUFS | short-term(3s) min/med/max={st.min():.1f}/{np.median(st):.1f}/{st.max():.1f} "
      f"| LRA~{np.percentile(st, 95) - np.percentile(st, 10):.1f} LU | true-peak~{tp:.1f} dBTP | crest={crest:.1f} dB")

# ---- stereo + spectral balance
M, S = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
width = 10 * np.log10((S ** 2).mean() / ((M ** 2).mean() + 1e-12) + 1e-12)
corr = np.corrcoef(x[:, 0], x[:, 1])[0, 1]
c0, w0 = time.process_time(), time.perf_counter()
n_fft = 4096
Sp = np.abs(librosa.stft(mono, n_fft=n_fft, hop_length=1024)) ** 2
f = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
bands = [("sub 20-60", 20, 60), ("bass 60-250", 60, 250), ("lowmid 250-500", 250, 500), ("mid 0.5-2k", 500, 2000),
         ("himid 2-4k", 2000, 4000), ("presence 4-6k", 4000, 6000), ("air 6-16k", 6000, 16000)]
e = np.array([Sp[(f >= lo) & (f < hi)].sum() for _, lo, hi in bands])
rel = 10 * np.log10(e / e.sum() + 1e-12)
print(f"STEREO side/mid={width:.1f} dB corr={corr:.2f} | BAND SHARE (dB re total): " +
      " ".join(f"{n.split()[0]}={r:.1f}" for (n, _, _), r in zip(bands, rel)))
cent = librosa.feature.spectral_centroid(y=mono, sr=sr, n_fft=n_fft, hop_length=1024)[0]
flat = librosa.feature.spectral_flatness(y=mono, n_fft=n_fft, hop_length=1024)[0]
roll = librosa.feature.spectral_rolloff(y=mono, sr=sr, n_fft=n_fft, hop_length=1024, roll_percent=0.95)[0]
print(f"SPECTRAL centroid={cent.mean():.0f} Hz rolloff95={roll.mean():.0f} Hz flatness={flat.mean():.4f}")

# ---- rhythm / harmony (librosa)
oenv = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=512)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=512)
tempo = float(np.atleast_1d(tempo)[0])
btimes = librosa.frames_to_time(beats, sr=sr, hop_length=512)
ibi = np.diff(btimes)
onsets = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=512)
chroma = librosa.feature.chroma_cqt(y=mono, sr=sr, hop_length=512)
cm = chroma.mean(1)
names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
sc = [(np.corrcoef(cm, np.roll(p, k))[0, 1], f"{names[k]} {m}") for m, p in (("maj", maj), ("min", mnr)) for k in range(12)]
sc.sort(reverse=True)
tick("librosa", c0, w0)
print(f"RHYTHM librosa tempo={tempo:.1f} BPM beats={len(btimes)} beat-interval cv={ibi.std() / ibi.mean():.3f} onsets/s={len(onsets) / dur:.2f}")
print("KEY (Krumhansl corr): " + ", ".join(f"{n} {c:.2f}" for c, n in sc[:3]))

# ---- essentia (pip wheel; classic algorithms, no TF models)
c0, w0 = time.process_time(), time.perf_counter()
try:
    import essentia.standard as es
    m44 = mono.astype(np.float32)
    bpm, bticks, conf, _, _ = es.RhythmExtractor2013(method="multifeature")(m44)
    key, scale, strength = es.KeyExtractor()(m44)
    dance, _ = es.Danceability()(m44)
    dyn, dyn_loud = es.DynamicComplexity()(m44)
    print(f"ESSENTIA bpm={bpm:.1f} (conf {conf:.2f}) key={key} {scale} (strength {strength:.2f}) danceability={dance:.2f} "
          f"dynamic_complexity={dyn:.2f} (loud {dyn_loud:.1f} dB)")
except Exception as ex:                               # keep the run going if essentia misbehaves
    print("ESSENTIA failed:", type(ex).__name__, str(ex)[:160])
tick("essentia", c0, w0)

print("CPU/wall seconds: " + " | ".join(f"{k} {v[0]:.2f}/{v[1]:.2f}" for k, v in T.items()))

# ---- picture: mel spectrogram + chroma + loudness/centroid + onset strength, with lyric-line markers
lines = [l for l in json.load(open(lyr))["lines"] if l["start"] >= t0 - 0.5 and l["end"] <= t0 + dur + 0.5]
mel = librosa.power_to_db(librosa.feature.melspectrogram(y=mono, sr=sr, n_fft=2048, hop_length=512, n_mels=128, fmax=16000), ref=np.max)
fig, ax = plt.subplots(4, 1, figsize=(15, 11), sharex=True, gridspec_kw={"height_ratios": [3, 1.6, 1.2, 1]})
ext = [t0, t0 + dur]
im = ax[0].imshow(mel, origin="lower", aspect="auto", extent=[t0, t0 + dur, 0, 128], cmap="magma", vmin=-70, vmax=0)
ticks_hz = [100, 250, 500, 1000, 2000, 4000, 8000, 16000]
mf = librosa.mel_frequencies(n_mels=128, fmax=16000)
ax[0].set_yticks([int(np.argmin(abs(mf - h))) for h in ticks_hz]); ax[0].set_yticklabels([str(h) for h in ticks_hz])
ax[0].set_ylabel("mel Hz (dB re max)"); fig.colorbar(im, ax=ax[0], pad=0.01, fraction=0.025)
ax[1].imshow(chroma, origin="lower", aspect="auto", extent=[t0, t0 + dur, 0, 12], cmap="viridis")
ax[1].set_yticks(np.arange(12) + 0.5); ax[1].set_yticklabels(names, fontsize=7); ax[1].set_ylabel("chroma (CQT)")
tt = t0 + np.arange(len(cent)) * 1024 / sr
ax[2].plot(t0 + 1.5 + np.arange(len(st)), st, "o-", ms=3, label="short-term LUFS (3 s)")
ax[2].set_ylabel("LUFS"); ax2 = ax[2].twinx(); ax2.plot(tt, cent, color="tab:orange", lw=0.8, label="centroid Hz"); ax2.set_ylabel("centroid Hz")
ax[3].plot(t0 + np.arange(len(oenv)) * 512 / sr, oenv, lw=0.7); ax[3].vlines(t0 + btimes, 0, oenv.max(), color="r", alpha=0.25, lw=0.6)
ax[3].set_ylabel("onset str + beats"); ax[3].set_xlabel("song time (s)")
for a in ax:
    for l in lines:
        a.axvline(l["start"], color="w" if a is ax[0] else "k", ls="--", lw=0.6, alpha=0.7)
for l in lines:
    ax[0].text(l["start"] + 0.05, 124, f"L{l['i']} {l['section']}", color="w", fontsize=7, va="top")
ax[0].set_xlim(*ext)
fig.suptitle(f"silicon_shield.mp3 {t0:.1f}-{t0 + dur:.1f}s | {lufs:.1f} LUFS | {tempo:.0f} BPM | key {sc[0][1]} | centroid {cent.mean():.0f} Hz", fontsize=11)
fig.tight_layout(); fig.savefig(png, dpi=75); print("wrote", png)
