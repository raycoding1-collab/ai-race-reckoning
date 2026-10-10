import numpy as np, soundfile as sf, librosa, pyworld as pw, onnxruntime as ort
exec(open('/tmp/claude-0/-home-user-ai-race-reckoning/34377828-749a-5abe-987a-51d5ff6afcf9/scratchpad/hands/scripts/nsf_extra.py').read().split('# speech (24k)')[0])
x24, sr_k = sf.read(f"{OUT}/0_speech24k.wav")
x44 = librosa.resample(x24, orig_sr=sr_k, target_sr=SR, res_type="soxr_hq").astype(np.float32)
f0w, t = pw.harvest(x24, sr_k, f0_floor=70.0, f0_ceil=600.0, frame_period=5.0); f0w = pw.stonemask(x24, f0w, t, sr_k)
mel = mel_ln(x44); T = mel.shape[0]; tt = (np.arange(T) * HOP + HOP // 2) / SR
f0g = np.where(np.interp(tt, t, (f0w > 0).astype(float)) > 0.5, np.interp(tt, t, f0w), 0).astype(np.float32)
s = session(MODELS["v1_2022"], 4)
for label, m in [("ln (x1)", mel), ("log10 (x1/ln10)", (mel / np.log(10)).astype(np.float32))]:
    y, w, c = run(s, m, f0g); n = min(len(y), len(x44))
    m2 = mel_ln(y[:n]); m1 = mel_ln(x44[:n]); k = min(len(m1), len(m2))
    print(f"v1_2022 fed {label:16s}: mean|dln mel| = {np.abs(m1[:k]-m2[:k]).mean():.3f}")
