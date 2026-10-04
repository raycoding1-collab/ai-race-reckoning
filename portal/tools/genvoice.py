# Render every announcer line with a neural voice (Kokoro), then give it a
# facility-AI treatment with the WORLD vocoder: pitch flattened toward a
# monotone, gently auto-tuned to semitone steps and raised, formants nudged,
# plus a faint metallic comb. Output: portal/voice/*.mp3 and lines.json.
import re, json, hashlib, subprocess, sys, os
import numpy as np, pyworld as pw, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = '/home/user/ai-race-reckoning/portal'
OUT = f'{ROOT}/voice'
os.makedirs(OUT, exist_ok=True)
src = open(f'{ROOT}/js/levels.js').read()
lines = re.findall(r"\[\s*[\d.]+,\s*'((?:[^'\\]|\\.)*)'\s*\]", src) + re.findall(r"say:\s*'((?:[^'\\]|\\.)*)'", src)
lines = [l.replace("\\'", "'") for l in lines]
touch = json.load(open(sys.argv[1]))           # [[desktop phrase, touch phrase], ...]
extra = []
for l in lines:
    t = l
    for a, b in touch: t = t.replace(a, b)
    if t != l: extra.append(t)
lines = list(dict.fromkeys(lines + extra))
print(len(lines), 'lines')

kokoro = Kokoro(f'{sys.argv[2]}/kokoro.onnx', f'{sys.argv[2]}/voices.bin')
FF = '/usr/bin/ffmpeg'
manifest = {}
for text in lines:
    audio, sr = kokoro.create(text, voice='af_heart', speed=0.9, lang='en-us')
    x = audio.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=70, f0_ceil=500, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    voiced = f0 > 0
    st = np.zeros_like(f0)
    st[voiced] = 12 * np.log2(f0[voiced] / 440.0)
    med = np.median(st[voiced])
    # flatten the melody, lift it, then snap most of the way to semitones
    flat = med + 0.38 * (st - med) + 2.5
    snapped = np.round(flat)
    tuned = flat + 0.7 * (snapped - flat)
    f0n = np.where(voiced, 440.0 * 2 ** (tuned / 12), 0.0)
    # nudge formants up ~5% for a synthetic timbre
    bins = sp.shape[1]
    idx = np.clip(np.arange(bins) / 1.05, 0, bins - 1)
    lo = np.floor(idx).astype(int); hi = np.minimum(lo + 1, bins - 1); fr = idx - lo
    spn = sp[:, lo] * (1 - fr) + sp[:, hi] * fr
    y = pw.synthesize(np.ascontiguousarray(f0n), np.ascontiguousarray(spn), np.ascontiguousarray(ap), sr, frame_period=5)
    # faint metallic resonance + a touch of the dry signal for clarity
    d = int(sr * 0.0028)
    comb = np.copy(y); comb[d:] += 0.28 * y[:-d]
    y = 0.85 * comb + 0.15 * np.pad(x, (0, max(0, len(y) - len(x))))[:len(y)]
    # tidy edges and normalise
    fade = int(sr * 0.01); y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    y = np.concatenate([y, np.zeros(int(sr * 0.08))])
    rms = np.sqrt(np.mean(y[np.abs(y) > 1e-4] ** 2))
    y *= min(0.12 / max(rms, 1e-6), 0.95 / max(np.max(np.abs(y)), 1e-6))
    name = hashlib.sha1(text.encode()).hexdigest()[:10] + '.mp3'
    sf.write('/tmp/_v.wav', y.astype(np.float32), sr)
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', '/tmp/_v.wav', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '56k', f'{OUT}/{name}'], check=True)
    manifest[text] = {'file': name, 'dur': round(len(y) / sr, 2)}
    print(f'{manifest[text]["dur"]:5.2f}s  {text[:70]}')
json.dump(manifest, open(f'{OUT}/lines.json', 'w'), indent=0)
