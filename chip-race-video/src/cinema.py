"""v2 cinematic layer: orchestral-ish synth voices, picture-synced sound
design and time effects (tape stop, stutter). Used by music.py."""
import numpy as np
import song
from dsp import *  # noqa

B, BAR = song.BEAT, song.BAR
WORDS = {(l["scene"], i): w for l in song.timeline() for i, w in enumerate(l["words"])}
VO = {("F", "m"): [53, 56, 60], ("Db", ""): [53, 56, 61], ("Ab", ""): [51, 56, 60],
      ("Eb", ""): [51, 55, 58], ("Bb", "m"): [53, 58, 61], ("C", ""): [52, 55, 60]}


def bt(bar, beat=0.0):
    return bar * BAR + beat * B


def fm_bell(m, dur, idx=3.0, ratio=3.5):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    mod = idx * np.exp(-t / 0.6) * np.sin(2 * np.pi * f * ratio * t)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (dur / 3)) * np.minimum(1, t / 0.002)


def brass(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(m) * (1 - 0.02 * np.exp(-t / 0.04))
    x = sum(saw(f * d, n) for d in (0.997, 1.0, 1.004)) + 0.5 * saw(f * 0.5, n)
    x = sweep(x, "lp", 500 + 4200 * np.exp(-t / 0.18) + 600 * np.exp(-t / 1.0), q=1.1)
    return softclip(x * 0.6, 1.5) * np.minimum(1, t / 0.012) * np.exp(-t / 0.5)


def string_hit(m, dur, bright=2600):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(saw(hz(m) * d, n, phase0=k * 0.3) for k, d in enumerate((0.996, 1.0, 1.005)))
    return filt(x, "lp", bright) * np.minimum(1, t / 0.006) * np.exp(-t / 0.09)


def taiko(vel=1.0, f0=72):
    n = int(1.2 * SR); t = np.arange(n) / SR
    body = sine(f0 * (1 + 0.8 * np.exp(-t / 0.03)), n) * np.exp(-t / 0.45)
    skin = filt(noise(n), "bp", 900, 0.7) * np.exp(-t / 0.05) * 0.5
    return vel * softclip(1.4 * body + skin, 1.6)


def clang(vel=1.0):
    n = int(2.8 * SR); t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * 142 * r * t) * np.exp(-t / d) for r, a, d in
            [(1, 1, 1.2), (2.76, .7, .8), (5.40, .5, .5), (8.93, .35, .35), (13.3, .25, .2)])
    x += filt(noise(n), "hp", 1500) * np.exp(-t / 0.04) * 0.8
    boom = sine(hz(29) * (1 + 2 * np.exp(-t / 0.05)), n) * np.exp(-t / 0.9) * 1.6
    return vel * softclip(0.5 * x + boom, 1.2)


def zap(vel=1.0, dur=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 200 + 4200 * np.exp(-t / 0.05)
    return vel * (0.6 * pulse(f, n, 0.3) + 0.4 * filt(noise(n), "hp", 4000) * np.exp(-t / 0.02)) * np.exp(-t / 0.12)


def stamp(vel=1.0):
    n = int(0.5 * SR); t = np.arange(n) / SR
    thud = sine(hz(36) * (1 + 1.5 * np.exp(-t / 0.02)), n) * np.exp(-t / 0.12)
    slap = filt(noise(n), "bp", 1800, 0.6) * np.exp(-t / 0.025)
    return vel * softclip(1.3 * thud + 0.7 * slap, 1.4)


def scratch(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = filt(noise(n), "bp", 2600, 1.4)
    am = 0.6 + 0.4 * np.sin(2 * np.pi * 23 * t) * np.sin(2 * np.pi * 3.1 * t)
    return x * am * np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.05)


def whoosh(dur, up=True):
    n = int(dur * SR); p = np.linspace(0, 1, n)
    curve = 300 * 25 ** (p if up else 1 - p)
    return sweep(noise(n), "bp", curve, q=1.6) * np.sin(np.pi * p) ** 2


def drone(dur, root=29):
    n = int(dur * SR); t = np.arange(n) / SR
    x = saw(hz(root) * 1.002, n) + saw(hz(root + 12) * 0.998, n) + 0.5 * saw(hz(root + 19), n)
    x = sweep(x, "lp", 180 + 260 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * t)), q=1.8)
    return x * np.minimum(1, t / 1.2)


def build_layer(N):
    """Everything the v2 arrangement adds, as named stereo buses."""
    orch, sfx, perc = np.zeros((2, N)), np.zeros((2, N)), np.zeros((2, N))
    # --- intro: drone + bell motif foreshadowing the hook (C Ab F = "weapon now")
    place(orch, stereo(filt(drone(bt(2) + 0.4), "hp", 45) * 0.16), 0)
    for k, (m, b) in enumerate([(84, 0), (80, 1), (77, 2), (84, 4), (80, 5), (85, 6)]):
        place(orch, stereo(fm_bell(m, 2.5) * 0.16, 0.5 * (-1) ** k), bt(0, b))
    # --- verse: string ostinato in the second half
    for bar in range(6, 10):
        tones = VO[song.CHORDS[bar]]
        for s in range(16):
            m = tones[[0, 1, 2, 1][s % 4]] + 12
            place(orch, stereo(string_hit(m, B / 4 * 1.5) * (0.05 + 0.02 * (s % 4 == 0)), 0.3 * (-1) ** s), bt(bar, s / 4))
    # --- build: taiko roll + string tremolo crescendo, cut for the gap
    cut = bt(11, 3)
    hits = [bt(10, i / 2) for i in range(8)] + [bt(11, i / 4) for i in range(12)]
    for i, h in enumerate(hits):
        if h < cut:
            place(perc, stereo(taiko(0.25 + 0.4 * i / len(hits), 64 + (i % 2) * 14), 0.4 * (-1) ** i), h)
    for bar in (10, 11):
        tones = VO[song.CHORDS[bar]]
        for s in range(32):
            h = bt(bar, s / 8)
            if h < cut:
                v = 0.03 + 0.07 * ((bar - 10) * 32 + s) / 64
                place(orch, stereo(string_hit(tones[s % 3] + 12, B / 8 * 1.3, 3800) * v, 0.5 * (-1) ** s), h)
    # --- chorus: taiko + brass stabs on chord changes; strings in the 2nd half
    for bar in range(12, 20):
        tones = VO[song.CHORDS[bar]]
        if (bar - 12) % 2 == 0:
            place(perc, stereo(taiko(0.9, 60)), bt(bar))
            place(perc, stereo(taiko(0.5, 80), 0.3), bt(bar, 2.5))
        for m in tones + [tones[0] - 12]:
            place(orch, stereo(brass(m, B * 1.2) * 0.07), bt(bar))
        if bar in (15, 19):  # pickup stab into the next phrase
            for m in tones:
                place(orch, stereo(brass(m + 12, B * 0.4) * 0.05), bt(bar, 3.5))
        if bar >= 16:
            for s in range(16):
                m = tones[[0, 2, 1, 2][s % 4]] + 24
                place(orch, stereo(string_hit(m, B / 4 * 1.4, 4200) * 0.045, 0.45 * (-1) ** s), bt(bar, s / 4))
    # --- tag: drone + bells answering the vocal
    place(orch, stereo(filt(drone(2 * BAR, 29), "hp", 45) * 0.14), bt(20))
    for k, (m, b) in enumerate([(84, 0), (80, 0.5), (77, 1), (72, 4), (68, 4.5), (65, 5)]):
        place(orch, stereo(fm_bell(m, 3.0) * 0.14, 0.6 * (-1) ** k), bt(20, b))
    # --- final orchestral hit
    for m in [41, 53, 60, 65, 68, 72]:
        place(orch, stereo(brass(m, 2.5) * 0.08), bt(22))
    place(perc, stereo(taiko(1.2, 55)), bt(22)); place(perc, stereo(taiko(0.8, 70), -0.4), bt(22) + 0.02)
    # --- picture-synced sound design
    place(sfx, stereo(zap(0.5)), WORDS[("laser", 3)]["t"])                        # main laser pulse
    for s in range(32):                                                           # droplet hits (tin scene)
        place(sfx, stereo(zap(0.05, 0.08), 0.6), bt(2, s / 4))
    place(sfx, stereo(whoosh(0.6) * 0.25), WORDS[("tons", 2)]["t"] - 0.6)
    place(sfx, stereo(clang(0.55)), WORDS[("tons", 2)]["t"])                      # 180-ton slam
    place(sfx, stereo(stamp(0.6), 0.3), WORDS[("tons", 6)]["t"])                  # SOLD OUT
    a, b = WORDS[("line", 2)]["t"], WORDS[("line", 4)]["t"] + 0.4
    place(sfx, stereo(scratch(b - a) * 0.12, -0.2), a)                            # marker line
    place(sfx, stereo(stamp(0.5), 0.4), WORDS[("line", 4)]["t"] + 0.2)            # RESTRICTED
    for i in (0, 1, 4):                                                           # slam words
        place(sfx, stereo(stamp(0.35)), WORDS[("wafer", i)]["t"]); place(sfx, stereo(whoosh(0.15) * 0.1), WORDS[("wafer", i)]["t"] - 0.15)
    place(sfx, stereo(whoosh(0.4, up=False) * 0.3), WORDS[("down", 4)]["t"] + 0.5)  # DOWN flip
    return orch, sfx, perc


def tape_stop(x, end_t, dur=0.28):
    """Slow the signal to a halt over `dur` seconds ending at end_t."""
    a, b = int((end_t - dur) * SR), int(end_t * SR)
    n = b - a
    rate = (1 - np.linspace(0, 1, n)) ** 1.5
    pos = a + np.cumsum(rate)
    for c in range(x.shape[0]):
        x[c, a:b] = np.interp(pos, np.arange(x.shape[1]), x[c]) * np.linspace(1, 0.2, n)
    return x


def stutter(x, a_t, b_t, slice_beats=0.25):
    """Beat-repeat: loop the first 1/16 slice of [a_t, b_t), gated and rising."""
    a, b = int(a_t * SR), int(b_t * SR)
    L = int(slice_beats * B * SR)
    sl = x[:, a:a + L].copy()
    k = 0
    for s in range(a, b, L):
        r = 2 ** (k / 12 * 2)  # each repeat two semitones higher
        idx = np.clip((np.arange(L) * r).astype(int), 0, L - 1)
        seg = sl[:, idx] * np.minimum(1, (L - np.arange(L)) / (0.004 * SR))
        n = min(L, b - s)
        x[:, s:s + n] = seg[:, :n]
        k += 1
    return x
