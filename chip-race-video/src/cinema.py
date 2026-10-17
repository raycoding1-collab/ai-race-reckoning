"""Cinematic layer: orchestral-ish synth voices (bells, brass, strings, taiko,
clang), picture-synced sound design keyed to song.timeline() words, and
time effects (tape stop, stutter). Used by music.py."""
import numpy as np
import song
from dsp import *  # noqa

B, BAR = song.BEAT, song.BAR
WORDS = {(l["scene"], i): w for l in song.timeline() for i, w in enumerate(l["words"])}


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


# ---------------------------------------------------------------- v4 voices
def bell(m, dur=3.0, bright=1.0, pan=0.0):
    """Stereo FM bell: two slightly detuned 3.5:1 FM pairs plus a 'tine' partial."""
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    out = []
    for det in (0.9985, 1.0015):
        mod = 3.0 * bright * np.exp(-t / 0.5) * np.sin(2 * np.pi * f * det * 3.5 * t)
        y = np.sin(2 * np.pi * f * det * t + mod) * np.exp(-t / (dur / 3.2))
        y += 0.25 * np.sin(2 * np.pi * f * det * 2.0 * t) * np.exp(-t / 0.35)
        out.append(y * np.minimum(1, t / 0.0015))
    y = np.stack(out)
    p = (pan + 1) * np.pi / 4
    return y * np.array([[np.cos(p) * 1.41], [np.sin(p) * 1.41]]) * 0.5


def string_trem(m, dur, bright=3000):
    """String tremolo as one note: 3 detuned saws with 32nd-note amplitude tremolo."""
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(saw(hz(m) * d * (1 + 0.002 * np.sin(2 * np.pi * 5.3 * t + k)), n, phase0=k * 0.3)
            for k, d in enumerate((0.996, 1.0, 1.005)))
    trem = 0.6 + 0.4 * np.abs(np.sin(np.pi * t / (B / 8)))
    return filt(x, "lp", bright) * trem * np.minimum(1, t / 0.05) * np.minimum(1, (dur - t) / 0.05 + 1e-3)


def glass_crack(vel=1.0):
    n = int(1.6 * SR); t = np.arange(n) / SR
    rng = np.random.default_rng(41)
    x = np.zeros(n)
    for k in range(9):                           # splinters: short resonant pings
        a = int(rng.uniform(0, 0.12) * SR)
        f0 = rng.uniform(2500, 9000)
        y = np.sin(2 * np.pi * f0 * t[: n - a]) * np.exp(-t[: n - a] / rng.uniform(0.05, 0.3))
        x[a:] += y * rng.uniform(0.2, 0.6)
    x += filt(noise(n), "hp", 3000) * np.exp(-t / 0.03) * 1.2
    x += sine(hz(40) * (1 + np.exp(-t / 0.03)), n) * np.exp(-t / 0.2) * 0.8
    return vel * x * 0.5


def power_down(vel=1.0, dur=1.4):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 120 * np.exp(-t / (dur / 2.5)) + 25
    x = saw(f, n) + 0.5 * saw(f * 2.01, n)
    x = sweep(x, "lp", 300 + 2500 * np.exp(-t / 0.3), q=2.0)
    return vel * x * np.exp(-t / (dur / 2)) * 0.5


def chip_jingle(vel=1.0, notes=(84, 88, 91, 96)):
    """Key-pickup jingle on a 50% pulse (classic console item-get)."""
    out = np.zeros(int((len(notes) * 0.07 + 0.35) * SR))
    for k, m in enumerate(notes):
        n = int(0.3 * SR); tt = np.arange(n) / SR
        y = pulse(hz(m), n, 0.5) * np.exp(-tt / 0.08)
        a = int(k * 0.07 * SR); out[a:a + n] += y[: len(out) - a]
    return vel * out * 0.4


def sand_trickle(dur, vel=1.0, seed=5):
    """Granular hiss of falling sand: dense tiny high clicks."""
    n = int(dur * SR); rng = np.random.default_rng(seed)
    x = np.zeros(n)
    idx = rng.integers(0, n, int(dur * 900))
    x[idx] = rng.uniform(-1, 1, len(idx))
    x = filt(filt(x, "hp", 3500), "lp", 11000)
    p = np.linspace(0, 1, n)
    return vel * x * np.sin(np.pi * p) ** 0.8 * 2.0


def orch_hit(tones, root):
    """Final orchestral hit: brass chord, string stab, taiko pair, clang, sub boom (stereo)."""
    dur = 5.0
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros((2, n))
    for k, m in enumerate(tones):
        y = brass(m, dur) * 0.22
        out += stereo(y, 0.5 * np.sin(k * 1.7))
        out += stereo(string_hit(m + 12, dur, 3600) * 0.18, -0.5 * np.sin(k * 1.3))
    padn = lambda y: np.pad(y, (0, max(0, n - len(y))))[:n]
    out += stereo(padn(taiko(1.2, 55)), 0)
    out += stereo(padn(taiko(0.8, 70)), -0.4) * 0.8
    out += stereo(padn(clang(0.6)), 0.2)
    boom_ = sine(hz(root) * (1 + 1.8 * np.exp(-t / 0.06)), n) * np.exp(-t / 1.3) * 0.9
    out += stereo(boom_)
    return out


def sfx_layer(N, ev, in_gap):
    """Picture-synced sound design keyed to song.timeline() words. Returns a stereo bus.
    `ev(kind, t, name)` logs each placed effect for build/events.json."""
    out = np.zeros((2, N))

    def w(scene, i):
        return WORDS.get((scene, i))

    def put(sig, t0, name, gain=1.0, pan=0.0):
        if t0 is None or t0 < 0:
            return
        place(out, stereo(sig, pan) if sig.ndim == 1 else sig, t0, gain)
        ev("sfx", t0, name)

    # tin: molten droplets (soft chip plinks, falling pitch) across the line
    if w("tin", 2):
        t0 = w("tin", 0)["t"]
        r = np.random.default_rng(3)
        for s in range(14):
            m = 96 - s % 5 * 2
            n = int(0.09 * SR); tt = np.arange(n) / SR
            y = pulse(hz(m) * (1 - 0.35 * tt / 0.09), n, 0.25) * np.exp(-tt / 0.025)
            put(y, t0 + s * B / 2 + r.uniform(0, 0.03), "droplet", 0.05, 0.6 * (-1) ** s)
    if w("laser", 3):
        put(zap(1.0), w("laser", 3)["t"], "laser", 0.35)
        put(whoosh(0.9) * 0.8, w("laser", 7)["t"], "sun_flare", 0.12, 0.3)
    if w("tons", 2):
        put(whoosh(0.6), w("tons", 2)["t"] - 0.6, "whoosh", 0.18)
        put(clang(1.0), w("tons", 2)["t"], "slam", 0.42)
    if w("tons", 6):
        put(stamp(1.0), w("tons", 6)["t"], "sold_out", 0.42, 0.3)
    if w("line", 2) and w("line", 4):
        a, b = w("line", 2)["t"], w("line", 4)["t"] + 0.4
        put(scratch(b - a), a, "marker", 0.11, -0.2)
        put(stamp(1.0), w("line", 4)["t"] + 0.2, "restricted", 0.36, 0.4)
    for n_ in (1, 2, 3):
        for i in (0, 1, 4):
            ww = w(f"wafer{n_}", i)
            if ww:
                put(stamp(1.0), ww["t"], "slam_word", 0.2 + 0.05 * n_)
                put(whoosh(0.15), ww["t"] - 0.15, "whoosh", 0.08)
        ww = w(f"down{n_}", 4)
        if ww:
            put(whoosh(0.5, up=False), ww["t"] + 0.5, "down_flip", 0.2)
    if w("hbm", 3):                                           # memory dies stacking up
        for k in range(4):
            n = int(0.25 * SR); tt = np.arange(n) / SR
            y = sine(hz(48 + 5 * k) * (1 + np.exp(-tt / 0.01)), n) * np.exp(-tt / 0.06)
            y += filt(noise(n), "bp", 2400 + 600 * k, 1.5) * np.exp(-tt / 0.012) * 0.6
            put(y, w("hbm", 3)["t"] + k * B / 4, "stack", 0.16)
    if w("key", 6):
        put(chip_jingle(1.0), w("key", 6)["end"] - 0.05, "key_get", 0.22, 0.2)
    if w("crack", 4):
        put(glass_crack(1.0), w("crack", 4)["t"], "crack", 0.3, -0.2)
    if w("crack", 9):
        put(power_down(1.0), w("crack", 9)["t"], "lights_out", 0.22)
    if w("outro2", 1):
        put(stamp(1.0), w("outro2", 1)["t"] + 0.1, "restricted", 0.3, -0.3)
    return out


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
