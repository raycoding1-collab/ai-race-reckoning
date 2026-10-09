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


def diatonic(m, steps):
    """Move MIDI note m by `steps` scale degrees in F minor."""
    pc = m % 12
    i = min(range(7), key=lambda k: (SCALE[k] - pc) % 12)
    octave = m - ((pc - SCALE[i]) % 12)
    j = i + steps
    return octave - SCALE[i] + SCALE[j % 7] + 12 * (j // 7)


def analyse(path):
    x, sr = sf.read(path)
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, frame_period=FP, f0_floor=70, f0_ceil=500)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    return sr, f0, sp, ap


def syllable_plan(line, words_phones):
    """Flatten to syllables with source spans and target note(s)."""
    syls = []
    for (disp, _tts, notes), wsyls in zip(line["words"], words_phones):
        nn = song.parse_notes(notes)
        for (m, b, d), phones in zip(nn, wsyls):
            nuc = next((k for k, p in enumerate(phones) if p[0] in tts.VOWELS), 0)
            # coda = trailing phones after the last vowel/sonorant run
            last_v = max(k for k, p in enumerate(phones) if p[0] in tts.VOWELS or k == nuc)
            syls.append(dict(
                midi=m, T=line["bar"] * song.BAR + b * song.BEAT, D=d * song.BEAT,
                src_start=phones[0][1], src_nuc=phones[nuc][1],
                src_coda=phones[last_v][2], src_end=phones[-1][2],
                word=disp))
    return syls


def build_maps(syls):
    """Piecewise-linear (target_time -> source_time) knots per syllable."""
    segs = []
    for k, s in enumerate(syls):
        onset = s["src_nuc"] - s["src_start"]
        coda = s["src_end"] - s["src_coda"]
        prev_end = segs[-1]["t_end"] if segs else -1e9
        on_len = min(onset, 0.11, max(0.0, s["T"] - prev_end - 0.005))
        if onset > 0 and on_len < onset:
            on_len = max(on_len, 0.035)
        nxt = syls[k + 1] if k + 1 < len(syls) else None
        end = s["T"] + s["D"]
        if nxt is not None:
            n_on = min(nxt["src_nuc"] - nxt["src_start"], 0.11)
            if nxt["T"] - n_on < end + 0.02:  # legato: leave room for next onset
                end = min(end, nxt["T"] - max(n_on, 0.0))
        cd_len = min(coda, 0.4 * (end - s["T"]), 0.16)
        knots_t = [s["T"] - on_len, s["T"], end - cd_len, end]
        knots_s = [s["src_start"], s["src_nuc"], s["src_coda"], s["src_end"]]
        segs.append(dict(syl=s, kt=knots_t, ks=knots_s, t_start=knots_t[0], t_end=end))
    return segs


def pitch_curve(segs, t, transpose, rng, vibrato=1.0, scoop=1.0, detune=0.0):
    """Target f0 in Hz on the target time grid, NaN where silent."""
    f0 = np.full_like(t, np.nan)
    prev = None
    for sg in segs:
        s = sg["syl"]
        m = s["midi"] + transpose
        a, b = sg["t_start"], sg["t_end"]
        idx = (t >= a) & (t < b)
        tt = t[idx] - s["T"]
        cents = np.zeros_like(tt)
        # glide from the previous note (legato) or a small scoop from below
        if prev is not None and abs(a - prev[1]) < 0.06:
            start_off = (prev[0] - m) * 100.0
            glide = 0.055
        else:
            start_off, glide = -60.0 * scoop, 0.07
        w = np.clip((tt + 0.03) / glide, 0, 1)
        w = w * w * (3 - 2 * w)
        cents += start_off * (1 - w)
        # vibrato on held notes, fading in after 220 ms
        if s["D"] > 0.4 and vibrato > 0:
            depth = 28.0 * vibrato * np.clip((tt - 0.22) / 0.35, 0, 1)
            cents += depth * np.sin(2 * np.pi * 5.4 * tt + rng.uniform(0, 6.28))
        # slow human drift
        cents += 4.0 * np.sin(2 * np.pi * 0.7 * tt + rng.uniform(0, 6.28)) + detune
        f0[idx] = 440.0 * 2 ** ((m - 69 + cents / 100.0) / 12)
        prev = (m, b)
    return f0


def render_line(li, transpose=0, harmony=0, seed=0, timing=0.0, vibrato=1.0,
                detune=0.0, formant=1.0, breath=0.0):
    line = song.LINES[li]
    base = os.path.join(ROOT, "build", "tts", f"line{li:02d}")
    sr, f0s, sps, aps = analyse(base + ".wav")
    words = tts.parse(base)
    syls = syllable_plan(line, words)
    if harmony:
        for s in syls:
            s["midi"] = diatonic(s["midi"], harmony)
    for s in syls:
        s["T"] += timing
    segs = build_maps(syls)
    rng = np.random.default_rng(seed)

    t0 = segs[0]["t_start"] - 0.05
    t1 = segs[-1]["t_end"] + 0.05
    t = np.arange(t0, t1, FP / 1000.0)
    src_t = np.full_like(t, np.nan)
    for sg in segs:
        idx = (t >= sg["t_start"]) & (t < sg["t_end"])
        src_t[idx] = np.interp(t[idx], sg["kt"], sg["ks"])
    f0_t = pitch_curve(segs, t, transpose, rng, vibrato=vibrato, detune=detune)

    nfr = sps.shape[0]
    pos = np.clip(np.nan_to_num(src_t, nan=0.0) / (FP / 1000.0), 0, nfr - 1.001)
    i0 = pos.astype(int)
    fr = (pos - i0)[:, None]
    sp = sps[i0] * (1 - fr) + sps[np.minimum(i0 + 1, nfr - 1)] * fr
    ap = aps[i0] * (1 - fr) + aps[np.minimum(i0 + 1, nfr - 1)] * fr
    voiced_src = (f0s[i0] > 0) | (f0s[np.minimum(i0 + 1, nfr - 1)] > 0)
    active = ~np.isnan(src_t)
    f0 = np.where(active & voiced_src, np.nan_to_num(f0_t), 0.0)

    if formant != 1.0:  # warp the spectral envelope (formant shift)
        n = sp.shape[1]
        src_bins = np.clip(np.arange(n) / formant, 0, n - 1)
        sp = np.stack([np.interp(src_bins, np.arange(n), row) for row in sp])
    if breath > 0:  # a touch more aperiodicity = breathier tone
        ap = np.clip(ap + breath * (1 - ap) * np.linspace(0.3, 1, ap.shape[1]), 0, 0.999)
    silent = ~active
    sp[silent] = 1e-12
    ap[silent] = 0.999

    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(sp),
                      np.ascontiguousarray(ap), sr, frame_period=FP)
    # gate with a smoothed activity envelope to kill residual noise between notes
    env = np.repeat(active.astype(float), int(sr * FP / 1000.0))[: len(y)]
    k = int(0.006 * sr)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    y = y[: len(env)] * env
    y = resample_poly(y, 441, 320)
    return t0, y


def render_layer(name, lines, total, **kw):
    out = np.zeros(int(total * song.SR) + song.SR)
    for li in lines:
        t0, y = render_line(li, seed=hash((name, li)) % 2**32, **kw)
        a = int(round(t0 * song.SR))
        if a < 0:
            y, a = y[-a:], 0
        out[a:a + len(y)] += y[: len(out) - a]
    peak = np.max(np.abs(out)) + 1e-9
    out *= 0.5 / peak
    sf.write(os.path.join(ROOT, "build", "stems", f"vox_{name}.wav"), out, song.SR)
    return out


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build", "stems"), exist_ok=True)
    total = song.TOTAL_BARS * song.BAR + song.TAIL
    all_lines = list(range(len(song.LINES)))
    hooks = [i for i, l in enumerate(song.LINES) if l.get("hook")]
    O = -12  # sing an octave below the written (lead-synth) register
    render_layer("lead", all_lines, total, transpose=O, vibrato=1.0)
    render_layer("double", all_lines, total, transpose=O, timing=0.012, vibrato=0.6,
                 detune=6.0, breath=0.15)
    render_layer("oct", hooks, total, transpose=0, vibrato=0.5, formant=1.08, breath=0.2)
    render_layer("harm", hooks, total, transpose=O, harmony=2, vibrato=0.4, detune=-5.0, breath=0.2)
    render_layer("harm_lo", hooks, total, transpose=O, harmony=-5, vibrato=0.3, breath=0.25)
    print("vocal stems written")
