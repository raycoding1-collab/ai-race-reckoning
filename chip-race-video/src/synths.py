"""Instrument voices (docs/TECHNIQUES_music.md section 3): drums, supersaw,
reese, FM pluck/bass, pads, leads, risers and impacts. Pure numpy; each
function returns one note/hit, mono (n,) or stereo (2, n)."""
import numpy as np
from functools import lru_cache
from dsp import (SR, hz, saw, pulse, sine, noise, filt, sweep, softclip, os_saturate, stereo, _polyblep, bw)

rng = np.random.default_rng(2026)


def T(n):
    return np.arange(n) / SR


def fade_in(n, sec):
    return np.minimum(1, T(n) / max(sec, 1e-5))


# ================================================================ drums
@lru_cache(maxsize=None)
def kick(root=43.65, long=False, punch=1.0):
    """Tuned kick: sine with exponential pitch drop to the key root, 3 ms click,
    1.5 kHz beater, tanh drive (4x oversampled), LP 6 kHz; plus a clean sub layer."""
    n = int((0.62 if long else 0.42) * SR)
    t = T(n)
    f = root + 150 * np.exp(-t / 0.022) + 520 * np.exp(-t / 0.0022)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.36 if long else 0.24)) * fade_in(n, 0.0006)
    click = bw(noise(n), "hp", 2000) * np.exp(-t / 0.0028) * 0.2 * punch
    beater = np.sin(2 * np.pi * 1500 * t) * np.exp(-t / 0.010) * 0.14 * punch
    k = os_saturate(body + click + beater, 2.4) * 0.62
    k = filt(k, "lp", 6000)
    sub = np.sin(2 * np.pi * root * t) * np.exp(-t / (0.34 if long else 0.22)) * fade_in(n, 0.005) * 0.7
    sub *= np.clip(t / 0.012, 0, 1)
    k = k + sub
    k = filt(filt(k, "hp", 30), "peak", 300, 1.0, -3)
    return k / np.max(np.abs(k))


@lru_cache(maxsize=None)
def snare(tone=1.0, tail=0.11):
    n = int(0.42 * SR)
    t = T(n)
    drop = 1 - 0.12 * (1 - np.exp(-t / 0.03))
    body = (np.sin(2 * np.pi * np.cumsum(185 * tone * drop) / SR) * 0.8 +
            np.sin(2 * np.pi * np.cumsum(330 * tone * drop) / SR) * 0.45) * np.exp(-t / 0.12 * 0.6)
    nz = filt(bw(noise(n), "hp", 1500), "lp", 9000) * np.exp(-t / tail)
    click = bw(noise(n), "hp", 3000) * np.exp(-t / 0.002) * 0.6
    tom = np.sin(2 * np.pi * np.cumsum(180 * (1 + 0.3 * np.exp(-t / 0.01))) / SR) * np.exp(-t / 0.06) * 0.35
    x = os_saturate(0.7 * body + 0.65 * nz + click + tom, 1.6, asym=0.15)
    x = filt(filt(bw(x, "hp", 150), "peak", 200, 1.0, 3), "peak", 5000, 1.0, 2)
    x = filt(x, "peak", 400, 1.2, -3)
    return x / np.max(np.abs(x))


@lru_cache(maxsize=None)
def clap(seed=0):
    """Four 1.2 kHz noise bursts 9-13 ms apart, then a 70 ms tail; Haas-widened."""
    r = np.random.default_rng(100 + seed)
    n = int(0.4 * SR)
    t = T(n)
    nz = filt(r.standard_normal(n), "bp", 1200, 1.5)
    nz = bw(nz, "hp", 500) + 0.35 * filt(r.standard_normal(n), "bp", 2400, 1.2)
    env = np.zeros(n)
    d = 0.0
    for k in range(4):
        a = int(d * SR)
        tau = 0.010 if k < 3 else 0.07
        env[a:] += np.exp(-t[: n - a] / tau) * (0.85 if k < 3 else 1.0)
        d += r.uniform(0.009, 0.013)
    x = nz * env
    x = x / np.max(np.abs(x))
    d8 = int(0.008 * SR)
    wide = bw(np.concatenate([np.zeros(d8), x[:-d8]]), "hp", 500)
    return np.stack([x, 0.75 * x + 0.5 * wide])


HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


@lru_cache(maxsize=None)
def hat(open_=False, var=0):
    n = int((0.34 if open_ else 0.09) * SR)
    t = T(n)
    m = sum(pulse(f * (1 + 0.002 * var), n) for f in HAT_F)
    x = bw(bw(m, "hp", 7000), "hp", 7000) * 0.6 + 0.4 * bw(noise(n), "hp", 8000)
    x *= np.exp(-t / (0.11 if open_ else 0.016)) * fade_in(n, 0.0005)
    x = filt(filt(x, "peak", 3000, 1, -2), "highshelf", 10000, 0.7, 2)
    return x / np.max(np.abs(x))


@lru_cache(maxsize=None)
def shaker():
    n = int(0.12 * SR)
    t = T(n)
    x = filt(noise(n), "bp", 6500, 1.2) * (np.minimum(1, t / 0.02) * np.exp(-t / 0.035))
    return x / np.max(np.abs(x))


@lru_cache(maxsize=None)
def tom(m=45):
    n = int(0.6 * SR)
    t = T(n)
    f = hz(m) * (1 + 0.6 * np.exp(-t / 0.03))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    x += filt(noise(n), "bp", 900, 1) * np.exp(-t / 0.02) * 0.3
    return os_saturate(x, 1.5)


def crash(dur=3.0, seed=0):
    n = int(dur * SR)
    t = T(n)
    r = np.random.default_rng(300 + seed)
    m = sum(pulse(f, n) for f in [341.0, 467.0, 611.0, 873.0, 1103.0, 1440.0])
    x = 0.45 * bw(m, "hp", 4000) + bw(r.standard_normal(n), "hp", 3500)
    x = filt(x, "lp", 15000) * np.exp(-t / (dur / 3.2)) * fade_in(n, 0.002)
    L = x
    R = np.roll(bw(r.standard_normal(n), "hp", 3500) * np.exp(-t / (dur / 3.2)), 0) * 0.5 + 0.6 * x
    y = np.stack([L, R])
    return y / np.max(np.abs(y))


def reverse_swell(dur, seed=0):
    """Reverse cymbal: a crash tail played backwards, ending on the downbeat."""
    x = crash(dur * 1.2, seed)[:, ::-1][:, -int(dur * SR):]
    p = np.linspace(0, 1, x.shape[1])
    return x * p ** 1.5


# ================================================================ supersaw (Szabó)
SZ_OFFS = np.array([-0.11002313, -0.06288439, -0.01952356, 0.0, 0.01991221, 0.06216538, 0.10745242])


def szabo_detune(x):
    c = [10028.7312891634, -50818.8652045924, 111363.4808729368, -138150.6761080548, 106649.6679158292,
         -53046.9642751875, 17019.9518580080, -3425.0836591318, 404.2703938388, -24.1878824391, 0.6717417634,
         0.0030115596]
    return float(np.polyval(c, x))


def szabo_mix(y):
    return -0.55366 * y + 0.99785, -0.73764 * y * y + 1.2841 * y + 0.044372


def _saw_bank(freqs, n, phases):
    ph = (phases[:, None] + freqs[:, None] * np.arange(n)[None, :] / SR) % 1.0
    dt = np.broadcast_to((freqs / SR)[:, None], ph.shape)
    return 2 * ph - 1 - _polyblep(ph, dt)


def supersaw(m, n, detune=0.5, mix=0.6, spread=0.8, seed=None, drift=None):
    """Szabó's JP-8000 model: 7 saws, non-linear detune and mix curves, random
    phases, high-pass at the fundamental; voices panned alternately."""
    r = rng if seed is None else np.random.default_rng(seed)
    f0 = float(hz(m))
    freqs = f0 * (1 + SZ_OFFS * szabo_detune(detune))
    x = _saw_bank(freqs, n, r.uniform(0, 1, 7))
    cen, side = szabo_mix(mix)
    g = np.full(7, side); g[3] = cen
    pans = np.array([-1, 1, -0.6, 0, 0.6, -1, 1]) * spread
    p = (pans + 1) * np.pi / 4
    L = (x * (g * np.cos(p))[:, None]).sum(0)
    R = (x * (g * np.sin(p))[:, None]).sum(0)
    y = np.stack([L, R]) / 3.2
    return filt(y, "hp", f0 * 0.9, 0.6)


# ================================================================ bass
def sub_note(m, dur, glide_from=None, a=0.004, rel=0.012):
    n = int((dur + rel) * SR)
    t = T(n)
    f = np.full(n, float(hz(m)))
    if glide_from is not None:
        f = hz(m + (glide_from - m) * np.exp(-t / 0.03))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR)
    e = np.minimum(1, t / a)
    g = int(dur * SR)
    e[g:] *= np.exp(-(t[g:] - t[g]) / (rel / 3))
    return y * e


def reese_note(m, dur, cutoff=700, drive=3.0, phase=0.0):
    """Reese top: 3 detuned saws (-12/+9/+3 cents) with slow phasing, resonant LP,
    tanh(3x) at 4x oversampling, then HP 100 Hz (the sub is a separate clean sine)."""
    n = int((dur + 0.02) * SR)
    t = T(n)
    f = float(hz(m))
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.45 * t + phase)
    x = (saw(f * 2 ** (-12 / 1200) * (1 + 0.0015 * lfo), n, 0.1) + saw(f * 2 ** (9 / 1200), n, 0.6) +
         0.8 * saw(f * 2 ** (3 / 1200) * (1 - 0.001 * lfo), n, 0.33) + 0.5 * saw(2 * f * 2 ** (-6 / 1200), n, 0.8))
    fc = cutoff * (0.75 + 0.5 * lfo)
    x = sweep(x * 0.4, "lp", fc, q=1.6, block=128)
    x = os_saturate(x, drive)
    x = bw(bw(x, "hp", 100), "hp", 100)
    x = filt(x, "peak", 320, 1.0, -2)
    e = np.minimum(1, t / 0.004) * np.clip((dur + 0.02 - t) / 0.02, 0, 1)
    return x * e


def fm_note(m, dur, ratio=1.0, idx_hi=4.0, idx_lo=0.5, idx_tau=0.04, amp_tau=0.25, click=0.15, sus=0.0):
    """2-operator FM pluck/bass: index envelope 4 -> 0.5 over ~120 ms."""
    n = int((dur + 0.05) * SR)
    t = T(n)
    f = float(hz(m))
    I = idx_lo + (idx_hi - idx_lo) * np.exp(-t / idx_tau)
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    e = fade_in(n, 0.002) * (sus + (1 - sus) * np.exp(-t / amp_tau))
    g = int(dur * SR)
    e[g:] *= np.exp(-(t[g:] - t[g]) / 0.02)
    y = y * e
    if click:
        y += click * bw(noise(n), "hp", 3000) * np.exp(-t / 0.002)
    return y


def saw_pluck(m, dur, bright=4000, q=4.0, amp_tau=0.25):
    """3 detuned saws (+-8 cents) through an enveloped resonant LP 4 kHz -> 400 Hz."""
    n = int((dur + 0.3) * SR)
    t = T(n)
    f = float(hz(m))
    x = saw(f * 2 ** (-8 / 1200), n, 0.2) + saw(f, n, 0.5) + saw(f * 2 ** (8 / 1200), n, 0.8)
    fc = 400 + (bright - 400) * np.exp(-t / 0.05)
    x = sweep(x / 3, "lp", fc, q=q, block=64)
    return x * fade_in(n, 0.002) * np.exp(-t / amp_tau)


def pad_note(m, dur, attack=0.6, release=1.5, cutoff=2200, seed=0):
    """3 detuned saws (+-5..+-12 cents) + a triangle, LP 1.5-3 kHz, slow ADSR; stereo."""
    r = np.random.default_rng(500 + seed)
    n = int((dur + release) * SR)
    t = T(n)
    f = float(hz(m))
    L = saw(f * 2 ** (-11 / 1200), n, r.uniform()) + saw(f * 2 ** (5 / 1200), n, r.uniform())
    R = saw(f * 2 ** (11 / 1200), n, r.uniform()) + saw(f * 2 ** (-5 / 1200), n, r.uniform())
    tri = 2 * np.abs(2 * ((f * t + r.uniform()) % 1) - 1) - 1
    y = np.stack([L + 0.6 * tri, R + 0.6 * tri]) * 0.4
    y = bw(y, "lp", cutoff, 2)
    e = np.minimum(1, t / attack) ** 1.5
    g = int(dur * SR)
    e[g:] *= np.exp(-(t[g:] - t[g]) / (release / 4))
    return y * e


def saw_lead(m, dur, vib=0.25, bright=5000, glide_from=None):
    """Legato-ish saw/square lead for countermelodies (2 saws + a square, LP)."""
    n = int((dur + 0.12) * SR)
    t = T(n)
    semis = np.full(n, float(m))
    if glide_from is not None:
        semis = m + (glide_from - m) * np.exp(-t / 0.04)
    semis = semis + vib * np.clip((t - 0.2) / 0.3, 0, 1) * np.sin(2 * np.pi * 5.6 * t)
    f = hz(semis)
    x = saw(f * 1.003, n, 0.1) + saw(f * 0.997, n, 0.7) + 0.5 * pulse(f * 0.5, n, 0.5, 0.3)
    x = sweep(x / 2.5, "lp", 900 + (bright - 900) * (0.6 + 0.4 * np.exp(-t / 0.3)), q=0.9, block=128)
    e = fade_in(n, 0.012) * (0.75 + 0.25 * np.exp(-t / 0.2))
    g = int(dur * SR)
    e[g:] *= np.exp(-(t[g:] - t[g]) / 0.04)
    return x * e


# ================================================================ risers and impacts
def noise_riser(dur, f0=300, f1=12000, q=2.0, trem=True, seed=0):
    n = int(dur * SR)
    p = np.linspace(0, 1, n)
    r = np.random.default_rng(700 + seed)
    x = np.stack([r.standard_normal(n), r.standard_normal(n)])
    x = sweep(x, "bp", f0 * (f1 / f0) ** p, q=q, block=128)
    amp = 10 ** ((p - 1) * 30 / 20)                   # +30 dB over the riser
    if trem:
        rate = 4 + 16 * p                              # tremolo accelerates 4 -> 20 Hz
        amp = amp * (0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(rate) / SR))
    return x * amp * 2.2


def saw_riser(m, dur, semis=12, seed=0):
    """Detuned saw stack rising `semis` semitones with the LP opening."""
    n = int(dur * SR)
    p = np.linspace(0, 1, n)
    r = np.random.default_rng(900 + seed)
    curve = hz(m + semis * p ** 1.4)
    L = np.zeros(n); R = np.zeros(n)
    for k, c in enumerate([-14, -7, -2, 0, 3, 8, 15]):
        y = saw(curve * 2 ** (c / 1200), n, r.uniform()) + 0.6 * saw(2 * curve * 2 ** (-c / 1200), n, r.uniform())
        if k % 2:
            L += y
        else:
            R += y
    y = np.stack([L, R]) / 6
    y = sweep(y, "lp", 500 * 24 ** p, q=1.1, block=128)
    return y * p ** 2


def shepard_riser(dur, layers=6, fmin=55.0, octaves_per_s=0.22, accel=1.8, seed=0):
    """Endless rise: octave-spaced tones gliding up under a Gaussian (log-f) window."""
    n = int(dur * SR)
    t = T(n)
    p = t / dur
    pos = octaves_per_s * (t + (accel - 1) * t ** 2 / (2 * dur))
    L = np.zeros(n); R = np.zeros(n)
    r = np.random.default_rng(800 + seed)
    for k in range(layers):
        oc = (k + pos) % layers
        f = fmin * 2 ** oc
        a = np.exp(-0.5 * ((oc - layers / 2) / (layers / 5)) ** 2)
        ph = 2 * np.pi * np.cumsum(f) / SR + r.uniform(0, 6.28)
        tone = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
        L += a * tone * (0.8 if k % 2 else 1.0)
        R += a * tone * (1.0 if k % 2 else 0.8)
    y = np.stack([L, R]) / layers * 2
    return y * (0.25 + 0.75 * p ** 1.2) * fade_in(n, 0.3)


def sub_drop(dur=1.2, f0=120, f1=30):
    n = int(dur * SR)
    t = T(n)
    f = f1 + (f0 - f1) * np.exp(-t / (dur / 4))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur / 2.2)) * fade_in(n, 0.002)


def boom(dur=2.4, root=43.65):
    n = int(dur * SR)
    t = T(n)
    f = root * (1 + 2.0 * np.exp(-t / 0.05))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur / 2.3)) * fade_in(n, 0.001)
    y += filt(noise(n), "lp", 2500) * np.exp(-t / 0.18) * 0.35
    return os_saturate(y, 1.4)


def inhale(dur=0.35):
    """A synthetic inhale (0.5-4 kHz noise swell), for the drop-gap 'breath'."""
    n = int(dur * SR)
    p = np.linspace(0, 1, n)
    x = filt(filt(noise(n), "bp", 1600, 0.6), "lp", 4000)
    return x * np.sin(np.pi * p ** 0.7) ** 2
