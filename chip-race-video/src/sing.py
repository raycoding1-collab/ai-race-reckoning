"""Singing synthesis: Festival HTS speech -> WORLD analysis -> retimed and
re-pitched onto the melody in song.py -> resynthesis.

Each syllable's vowel lands exactly on its note; onset consonants are
placed just before the beat (as a singer would), codas at the note's end.
Outputs one mono 44.1 kHz stem per vocal layer.
"""
import os, sys
import numpy as np
import soundfile as sf
import pyworld as pw
from scipy.signal import resample_poly

sys.path.insert(0, os.path.dirname(__file__))
import song
import tts

ROOT = tts.ROOT
FP = 5.0  # WORLD frame period, ms
VOWELS = tts.VOWELS | {"l", "r", "m", "n", "ng", "w", "y"}  # sonorants can carry a note
SCALE = [song.NOTE_IDX[n] for n in ["F", "G", "Ab", "Bb", "C", "Db", "Eb"]]
O = -12  # the voice sings an octave below the written (lead-synth) register
# Performance map: 0 = whispered/intimate, 1 = full belt.
INTENSITY = {0: 0.25, 1: 0.4, 2: 0.5, 3: 0.62, 4: 0.8, 5: 0.95, 6: 0.9, 7: 1.0, 8: 1.0, 9: 0.2}


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def tilt_curve(n_bins, sr, db):
    f = np.linspace(0, sr / 2, n_bins)
    shape = np.clip(np.log2(np.maximum(f, 1) / 500) / np.log2(3500 / 500), 0, 1.4)
    return 10 ** (db * shape / 10)


def warp_formants(sp, factor):
    n = sp.shape[1]; bins = np.arange(n)
    fac = np.broadcast_to(np.asarray(factor, dtype=float), (sp.shape[0],))
    return np.stack([np.interp(np.clip(bins / f, 0, n - 1), bins, row) for f, row in zip(fac, sp)])


def diatonic(m, steps):
    """Move MIDI note m by `steps` scale degrees in F minor."""
    pc = m % 12
    i = min(range(7), key=lambda k: (SCALE[k] - pc) % 12)
    octave = m - ((pc - SCALE[i]) % 12)
    j = i + steps
    return octave - SCALE[i] + SCALE[j % 7] + 12 * (j // 7)


_cache = {}


def analyse(path):
    if path in _cache:
        return _cache[path]
    x, sr = sf.read(path)
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, frame_period=FP, f0_floor=70, f0_ceil=500)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    _cache[path] = (sr, f0, sp, ap)
    return _cache[path]


def syllable_plan(line, words_phones):
    syls = []
    for (disp, _tts, notes), wsyls in zip(line["words"], words_phones):
        for (m, b, d), phones in zip(song.parse_notes(notes), wsyls):
            nuc = next((k for k, p in enumerate(phones) if p[0] in tts.VOWELS), 0)
            last_v = max(k for k, p in enumerate(phones) if p[0] in tts.VOWELS or k == nuc)
            syls.append(dict(midi=m, T=line["bar"] * song.BAR + b * song.BEAT, D=d * song.BEAT, beat=b,
                             src_start=phones[0][1], src_nuc=phones[nuc][1],
                             src_coda=phones[last_v][2], src_end=phones[-1][2], word=disp))
    return syls


def build_maps(syls):
    segs = []
    for k, s in enumerate(syls):
        onset, coda = s["src_nuc"] - s["src_start"], s["src_end"] - s["src_coda"]
        prev_end = segs[-1]["t_end"] if segs else -1e9
        on_len = min(onset, 0.11, max(0.0, s["T"] - prev_end - 0.005))
        if onset > 0 and on_len < onset:
            on_len = max(on_len, 0.035)
        nxt = syls[k + 1] if k + 1 < len(syls) else None
        end = s["T"] + s["D"]
        if nxt is not None:
            n_on = min(nxt["src_nuc"] - nxt["src_start"], 0.11)
            if nxt["T"] - n_on < end + 0.02:
                end = min(end, nxt["T"] - max(n_on, 0.0))
        cd_len = min(coda, 0.4 * (end - s["T"]), 0.16)
        segs.append(dict(syl=s, kt=[s["T"] - on_len, s["T"], end - cd_len, end],
                         ks=[s["src_start"], s["src_nuc"], s["src_coda"], s["src_end"]],
                         t_start=s["T"] - on_len, t_end=end, last=nxt is None))
    return segs


def performance(segs, t, transpose, rng, inten, vibrato=1.0, detune=0.0, fall=True):
    """Expressive f0 (Hz, NaN = silent) and amplitude on the target grid."""
    f0 = np.full_like(t, np.nan); amp = np.zeros_like(t)
    prev = None
    vib_depth, scoop_c = (16 + 26 * inten) * vibrato, 35 + 90 * inten
    for sg in segs:
        s = sg["syl"]; m = s["midi"] + transpose
        a, b = sg["t_start"], sg["t_end"]
        idx = (t >= a) & (t < b)
        tt = t[idx] - s["T"]; D = b - s["T"]
        if prev is not None and abs(a - prev[1]) < 0.06:
            off, glide = (prev[0] - m) * 100.0, 0.05 + 0.03 * (1 - inten)
        else:
            off, glide = -scoop_c, 0.06 + 0.05 * inten
        cents = off * (1 - smooth((tt + 0.03) / glide))
        if s["D"] > 0.4 and vibrato > 0:
            rate = 5.0 + 0.9 * smooth(tt / 1.2)
            ph = 2 * np.pi * np.cumsum(rate) * FP / 1000.0 + rng.uniform(0, 6.28)
            cents = cents + vib_depth * smooth((tt - 0.2) / 0.45) * np.sin(ph)
        cents = cents + 5.0 * np.sin(2 * np.pi * 0.6 * tt + rng.uniform(0, 6.28)) + detune
        g = np.full_like(tt, 1.12 if s["beat"] % 1 == 0 else 0.95)       # downbeat accents
        if s["D"] > 0.6:
            g *= 0.88 + 0.3 * inten * smooth(tt / max(0.3, D * 0.7))      # swell on held notes
        if sg["last"] and fall:                                            # phrase-final release
            rel = smooth((tt - (D - 0.22)) / 0.22)
            cents = cents - (90 + 160 * (1 - inten)) * rel ** 2
            g *= 1 - 0.85 * rel
        g *= smooth((tt + 0.06) / 0.05)
        f0[idx] = 440.0 * 2 ** ((m - 69 + cents / 100.0) / 12)
        amp[idx] = g
        prev = (m, b)
    return f0, amp


def render_line(li, transpose=O, harmony=0, seed=0, timing=0.0, vibrato=1.0, detune=0.0,
                formant=1.0, breath=0.0, whisper=False, inten=None, fall=True):
    line = song.LINES[li]
    inten = INTENSITY[li] if inten is None else inten
    base = os.path.join(ROOT, "build", "tts", f"line{li:02d}")
    sr, f0s, sps, aps = analyse(base + ".wav")
    syls = syllable_plan(line, tts.parse(base))
    for s in syls:
        if harmony:
            s["midi"] = diatonic(s["midi"], harmony)
        s["T"] += timing
    segs = build_maps(syls)
    rng = np.random.default_rng(seed)
    t0, t1 = segs[0]["t_start"] - 0.05, segs[-1]["t_end"] + 0.05
    t = np.arange(t0, t1, FP / 1000.0)
    src_t = np.full_like(t, np.nan)
    for sg in segs:
        idx = (t >= sg["t_start"]) & (t < sg["t_end"])
        src_t[idx] = np.interp(t[idx], sg["kt"], sg["ks"])
    f0_t, amp = performance(segs, t, transpose, rng, inten, vibrato, detune, fall)
    nfr = sps.shape[0]
    pos = np.clip(np.nan_to_num(src_t, nan=0.0) / (FP / 1000.0), 0, nfr - 1.001)
    i0 = pos.astype(int); i1 = np.minimum(i0 + 1, nfr - 1); fr = (pos - i0)[:, None]
    sp = sps[i0] * (1 - fr) + sps[i1] * fr
    ap = aps[i0] * (1 - fr) + aps[i1] * fr
    active = ~np.isnan(src_t)
    f0 = np.where(active & ((f0s[i0] > 0) | (f0s[i1] > 0)), np.nan_to_num(f0_t), 0.0)
    # timbre follows intensity: brighter, slightly raised formants when belting;
    # slow formant drift keeps held vowels alive
    drift = 1 + 0.012 * np.sin(2 * np.pi * 0.9 * t + rng.uniform(0, 6.28))
    sp = warp_formants(sp, formant * (1 + 0.035 * inten) * drift)
    sp *= tilt_curve(sp.shape[1], sr, -5 + 11 * inten)[None, :]
    br = breath + 0.3 * (1 - inten)
    ap = np.clip(ap + br * (1 - ap) * np.linspace(0.2, 1, ap.shape[1]), 0, 0.999)
    if whisper:
        f0[:] = 0.0; ap[:] = 0.999
    sp *= (amp ** 2)[:, None]
    sp[~active] = 1e-12; ap[~active] = 0.999
    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(sp + 1e-16), np.ascontiguousarray(ap), sr, frame_period=FP)
    env = np.repeat(active.astype(float), int(sr * FP / 1000.0))[: len(y)]
    k = int(0.006 * sr)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    return t0, resample_poly(y[: len(env)] * env, 441, 320)


def write(name, x):
    sf.write(os.path.join(ROOT, "build", "stems", f"vox_{name}.wav"), (x * 0.5 / (np.max(np.abs(x)) + 1e-9)).T, song.SR)


def render_layer(name, lines, total, gains=None, **kw):
    out = np.zeros(int(total * song.SR) + song.SR)
    for li in lines:
        t0, y = render_line(li, seed=abs(hash((name, li))) % 2**32, **kw)
        a = int(round(t0 * song.SR))
        if a < 0:
            y, a = y[-a:], 0
        out[a:a + len(y)] += (1.0 if gains is None else gains[li]) * y[: len(out) - a]
    write(name, out)


def breaths(total):
    """Inhales before each phrase; a big one in the silence before the drop."""
    from scipy.signal import butter, lfilter
    sr = song.SR; out = np.zeros(int(total * sr) + sr); rng = np.random.default_rng(3)
    lines = song.timeline()
    for i, l in enumerate(lines):
        gap = l["t"] - (lines[i - 1]["end"] if i else -9)
        if gap < 0.18:
            continue
        dur = min(0.42, gap - 0.04); n = int(dur * sr)
        x = lfilter(*butter(2, [900 / (sr / 2), 5200 / (sr / 2)], btype="band"), rng.standard_normal(n))
        x = x + 1.5 * lfilter(*butter(2, [1500 / (sr / 2), 2300 / (sr / 2)], btype="band"), x)
        u = np.linspace(0, 1, n)
        g = 1.6 if l["scene"] == "wafer" else 0.25 + 0.75 * INTENSITY[i]
        a0 = int((l["t"] - dur - 0.03) * sr)
        out[a0:a0 + n] += g * x * smooth(u / 0.75) * (1 - smooth((u - 0.88) / 0.12))
    write("breath", out)


def vowel(name):
    sr, f0, sp, ap = analyse(os.path.join(ROOT, "build", "tts", f"vowel_{name}.wav"))
    a, b = int(0.22 / (FP / 1000)), int(0.38 / (FP / 1000))
    return sr, np.exp(np.mean(np.log(sp[a:b] + 1e-16), axis=0)), np.mean(ap[a:b], axis=0)


def choir_note(vw, m, dur, rng, formant=1.0, attack=0.25, release=0.4, breathy=0.2, bright=0.0):
    sr, sp0, ap0 = vw
    n = int(dur / (FP / 1000.0)) + 1; t = np.arange(n) * FP / 1000.0
    cents = 14 * smooth((t - 0.3) / 0.6) * np.sin(2 * np.pi * rng.uniform(4.6, 5.6) * t + rng.uniform(0, 6.28))
    cents += rng.uniform(-9, 9) + 4 * np.sin(2 * np.pi * 0.3 * t + rng.uniform(0, 6.28))
    f0 = 440.0 * 2 ** ((m - 69 + cents / 100) / 12)
    sp = warp_formants(np.tile(sp0, (n, 1)), formant * (1 + 0.015 * np.sin(2 * np.pi * rng.uniform(0.2, 0.5) * t)))
    sp *= tilt_curve(sp.shape[1], sr, bright)[None, :]
    env = smooth(t / attack) * (1 - smooth((t - (dur - release)) / release))
    sp *= (env ** 2)[:, None]
    ap = np.tile(np.clip(ap0 + breathy * (1 - ap0) * np.linspace(0.2, 1, len(ap0)), 0, 0.999), (n, 1))
    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(sp + 1e-16), np.ascontiguousarray(ap), sr, frame_period=FP)
    return resample_poly(y, 441, 320)


VOICING = {("F", "m"): [53, 56, 60], ("Db", ""): [53, 56, 61], ("Ab", ""): [51, 56, 60],
           ("Eb", ""): [51, 55, 58], ("Bb", "m"): [53, 58, 61], ("C", ""): [52, 55, 60]}


def choir(total):
    """Stereo choir from the same voice: 'ooh' intro/tag, 'aah' build/chorus, final chord."""
    sr = song.SR; out = np.zeros((2, int(total * sr) + sr)); rng = np.random.default_rng(21)
    vw = {"oo": vowel("ooh"), "aa": vowel("ah")}

    def add(y, t, pan, g):
        a = int(t * sr); p = (np.clip(pan, -1, 1) + 1) * np.pi / 4; nn = min(len(y), out.shape[1] - a)
        out[0, a:a + nn] += g * np.cos(p) * y[:nn]; out[1, a:a + nn] += g * np.sin(p) * y[:nn]

    plan = [(0, "oo", 0, 0.35), (1, "oo", 0, 0.45), (10, "aa", 0, 0.4), (11, "aa", 1, 0.6)]
    plan += [(b, "aa", int(b >= 16), 0.75 if b < 16 else 0.95) for b in range(12, 20)]
    plan += [(20, "oo", 0, 0.6), (21, "oo", 0, 0.4)]
    for bar, v, up, g in plan:
        tones = VOICING[song.CHORDS[bar]]
        voices = [m - 12 for m in tones] + [tones[0]] + ([tones[1], tones[2]] if up else [])
        dur = 3 * song.BEAT if bar == 11 else song.BAR * 1.15
        for k, m in enumerate(voices):
            for dup in range(2):  # two singers per part
                y = choir_note(vw[v], m, dur, rng, formant=rng.uniform(0.9, 1.08), attack=0.35 if bar < 12 else 0.12,
                               breathy=0.25 if v == "oo" else 0.12, bright=4 if bar >= 16 else 0)
                add(y, bar * song.BAR + rng.uniform(0, 0.025), (k - len(voices) / 2) / len(voices) * 1.4 + (dup - 0.5) * 0.5, g)
    for k, m in enumerate([41, 48, 53, 56, 60, 65, 68]):
        for dup in range(2):
            y = choir_note(vw["aa"], m, song.TAIL, rng, formant=rng.uniform(0.92, 1.06), attack=0.02, release=2.2, bright=3)
            add(y, 22 * song.BAR, (k - 3) / 4 + (dup - 0.5) * 0.4, 0.9)
    write("choir", out)


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build", "stems"), exist_ok=True)
    total = song.TOTAL_BARS * song.BAR + song.TAIL
    lines = list(range(len(song.LINES)))
    hooks = [i for i, l in enumerate(song.LINES) if l.get("hook")]
    dyn = {i: 0.55 + 0.45 * INTENSITY[i] for i in lines}
    render_layer("lead", lines, total, gains=dyn)
    render_layer("double", lines, total, gains=dyn, timing=0.014, vibrato=0.5, detune=7.0, breath=0.1)
    render_layer("whisper", [0, 1, 2, 3, 4, 9], total, whisper=True, timing=0.006, formant=1.03)
    render_layer("oct", hooks, total, transpose=0, vibrato=0.5, formant=1.06, breath=0.15)
    render_layer("harm", hooks, total, harmony=2, vibrato=0.4, detune=-5.0, breath=0.15)
    render_layer("harm_lo", hooks, total, harmony=-5, vibrato=0.3, breath=0.2)
    for g, f in enumerate([0.9, 0.95, 1.05, 1.1]):  # gang vocal: four more 'singers'
        render_layer(f"gang{g}", hooks, total, formant=f, timing=(g - 1.5) * 0.011, detune=(g - 1.5) * 6,
                     vibrato=0.3, breath=0.2, inten=0.9)
    breaths(total)
    choir(total)
    print("vocal stems written")
