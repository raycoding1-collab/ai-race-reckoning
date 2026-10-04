# Render every announcer line with a neural voice (Kokoro), then process it the
# way the facility AI's voice is known to have been made: a calm, warm read
# that is pitch-corrected onto a hard semitone grid with the natural melody
# mostly suppressed, so each syllable sits on its own flat note and the
# inflection lands in odd places; formants lifted for a synthetic timbre, a
# faint tremor, mid-range presence, a light compressor and a short PA slap.
# Usage: genvoice.py tools/touchwords.json <dir with kokoro.onnx + voices.bin>
# Output: portal/voice/*.mp3 and lines.json.
import re, json, hashlib, subprocess, sys, os
import numpy as np, pyworld as pw, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f'{ROOT}/voice'
os.makedirs(OUT, exist_ok=True)
src = open(f'{ROOT}/js/levels.js').read() + open(f'{ROOT}/js/game.js').read()
Q = r"'((?:[^'\\]|\\.)*)'"
lines = re.findall(r"\[\s*[\d.]+,\s*" + Q + r"\s*\]", src) + re.findall(r"(?:say|finale):\s*" + Q, src)
for arr in re.findall(r"(?:hit|burn):\s*\[([^\]]*)\]", src): lines += re.findall(Q, arr)
lines += re.findall(r"this\.def\.finale \|\| " + Q, src)
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
FF = 'ffmpeg'
FP = 5                                          # WORLD frame period, ms
# per-syllable note offsets (semitones) cycled through each line: the odd,
# sing-song inflection of a synthesized announcer
STEPS = [0, 2, -1, 3, 1, -2, 0, 4, -1, 1]
CHAIN = ','.join([
    'highpass=f=110',
    'equalizer=f=2600:t=q:w=1.1:g=4',           # mid-range presence / resonance
    'equalizer=f=320:t=q:w=1.0:g=-2.5',         # less chest, more speaker
    'acompressor=threshold=-20dB:ratio=4:attack=4:release=80:makeup=3',
    'aecho=0.9:0.6:28|61:0.13|0.07',            # short public-address slap
    'alimiter=limit=0.93',
])

manifest = {}
old = json.load(open(f'{OUT}/lines.json')) if os.path.exists(f'{OUT}/lines.json') else {}
for text in lines:
    audio, sr = kokoro.create(text, voice='af_heart', speed=0.88, lang='en-us')
    x = audio.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=70, f0_ceil=500, frame_period=FP)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    voiced = f0 > 0
    st = np.zeros_like(f0)
    st[voiced] = 12 * np.log2(f0[voiced] / 440.0)
    med = np.median(st[voiced])
    seed = int(hashlib.sha1(text.encode()).hexdigest()[:6], 16)
    out = np.zeros_like(st)
    # each voiced run (roughly a syllable) is flattened almost to a single note
    i, run = 0, seed % len(STEPS)
    n = len(st)
    while i < n:
        if not voiced[i]: i += 1; continue
        j = i
        while j < n and voiced[j]: j += 1
        seg = st[i:j]
        centre = np.median(seg)
        note = med + 0.35 * (centre - med) + STEPS[run % len(STEPS)] * 0.6 + 2.0
        glide = 0.12 * (seg - centre)            # keep a whisper of the natural contour
        out[i:j] = np.round(note) + glide
        run += 1
        i = j
    # faint tremor
    out += 0.1 * np.sin(2 * np.pi * 5.6 * t)
    f0n = np.where(voiced, 440.0 * 2 ** (out / 12), 0.0)
    # lift formants ~7% for a synthetic, slightly smaller-than-human timbre
    bins = sp.shape[1]
    idx = np.clip(np.arange(bins) / 1.07, 0, bins - 1)
    lo = np.floor(idx).astype(int); hi = np.minimum(lo + 1, bins - 1); fr = idx - lo
    spn = sp[:, lo] * (1 - fr) + sp[:, hi] * fr
    y = pw.synthesize(np.ascontiguousarray(f0n), np.ascontiguousarray(spn), np.ascontiguousarray(ap), sr, frame_period=FP)
    fade = int(sr * 0.01); y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    y = np.concatenate([y, np.zeros(int(sr * 0.15))])
    y *= 0.5 / max(np.max(np.abs(y)), 1e-6)
    name = hashlib.sha1(text.encode()).hexdigest()[:10] + '.mp3'
    sf.write('/tmp/_v.wav', y.astype(np.float32), sr)
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', '/tmp/_v.wav', '-af', CHAIN + ',loudnorm=I=-17:TP=-1.5:LRA=7', '-ac', '1', '-ar', '24000',
                    '-c:a', 'libmp3lame', '-b:a', '64k', f'{OUT}/{name}'], check=True)
    manifest[text] = {'file': name, 'dur': round(len(y) / sr, 2)}
    print(f'{manifest[text]["dur"]:5.2f}s  {text[:70]}', flush=True)
for k, v in old.items():
    if k not in manifest and os.path.exists(f'{OUT}/{v["file"]}'): os.remove(f'{OUT}/{v["file"]}')
json.dump(manifest, open(f'{OUT}/lines.json', 'w'), indent=0)
