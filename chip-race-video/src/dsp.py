"""Small DSP toolkit: band-limited oscillators, envelopes, biquads,
time-varying filters, reverb, delay, compression and limiting."""
import numpy as np
from scipy.signal import lfilter, fftconvolve

SR = 44100


def hz(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def tsamples(dur):
    return np.arange(int(dur * SR)) / SR


# ---------------------------------------------------------------- oscillators
def _phase(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = phase0 + np.cumsum(f) / SR
    return ph % 1.0, f / SR


def _polyblep(t, dt):
    out = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a]
    out[a] = x + x - x * x - 1
    b = t > 1 - dt
    x = (t[b] - 1) / dt[b]
    out[b] = x * x + x + x + 1
    return out


def saw(freq, n, phase0=0.0):
    t, dt = _phase(freq, n, phase0)
    return 2 * t - 1 - _polyblep(t, dt)


def pulse(freq, n, duty=0.5, phase0=0.0):
    t, dt = _phase(freq, n, phase0)
    duty = np.broadcast_to(np.asarray(duty, dtype=float), (n,))
    y = np.where(t < duty, 1.0, -1.0)
    y += _polyblep(t, dt)
    t2 = (t - duty) % 1.0
    y -= _polyblep(t2, dt)
    return y - (2 * duty - 1)


def nes_triangle(freq, n):
    """4-bit stepped triangle like the NES APU triangle channel."""
    t, _ = _phase(freq, n)
    tri = 1 - 4 * np.abs(t - 0.5)
    return np.round(tri * 7.5) / 7.5


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(2 * np.pi * (phase0 + np.cumsum(f) / SR))


def lfsr_noise(n, rate_hz=22000, short=False, seed=1):
    """NES-style 15-bit LFSR noise (short mode = metallic periodic noise)."""
    reg = seed or 1
    steps = int(n * rate_hz / SR) + 2
    bits = np.empty(steps)
    tap = 6 if short else 1
    for i in range(steps):
        fb = (reg & 1) ^ ((reg >> tap) & 1)
        reg = (reg >> 1) | (fb << 14)
        bits[i] = 1.0 if reg & 1 else -1.0
    idx = (np.arange(n) * rate_hz / SR).astype(int)
    return bits[idx]


_noise_rng = np.random.default_rng(7)


def noise(n):
    return _noise_rng.standard_normal(n)


def supersaw(m, n, voices=7, detune=0.18, stereo=True, seed=0):
    rng = np.random.default_rng(seed)
    f = hz(m)
    offs = np.linspace(-1, 1, voices)
    L = np.zeros(n); R = np.zeros(n)
    for k, o in enumerate(offs):
        cents = o * detune * 100 * (1 + 0.1 * rng.standard_normal())
        y = saw(f * 2 ** (cents / 1200), n, phase0=rng.uniform())
        pan = 0.5 + 0.5 * o * (0.9 if stereo else 0)
        g = 1.0 if k == voices // 2 else 0.8
        L += y * g * np.cos(pan * np.pi / 2); R += y * g * np.sin(pan * np.pi / 2)
    return np.stack([L, R]) / voices


# ---------------------------------------------------------------- envelopes
def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, gate=None):
    gate = n / SR if gate is None else gate
    t = np.arange(n) / SR
    env = np.where(t < a, t / max(a, 1e-6),
                   np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = t > gate
    if np.any(rel):
        g_level = env[min(int(gate * SR), n - 1)]
        env = np.where(rel, g_level * np.exp(-(t - gate) / max(r / 4, 1e-4)), env)
    return env


def expdecay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


# ---------------------------------------------------------------- filters
def biquad(kind, f0, q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "bp":
        b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "peak":
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "lowshelf":
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    elif kind == "highshelf":
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.707, gain_db=0.0):
    b, a = biquad(kind, f0, q, gain_db)
    return lfilter(b, a, x, axis=-1)


def sweep(x, kind, f_curve, q=0.707, block=64):
    """Time-varying biquad; f_curve is per-sample cutoff (Hz). Mono or stereo."""
    x2 = np.atleast_2d(x)
    out = np.zeros_like(x2)
    f_curve = np.broadcast_to(np.asarray(f_curve, dtype=float), (x2.shape[1],))
    zi = np.zeros((x2.shape[0], 2))
    for i in range(0, x2.shape[1], block):
        f = float(np.clip(f_curve[i], 20, SR * 0.45))
        b, a = biquad(kind, f, q)
        out[:, i:i + block], zi = lfilter(b, a, x2[:, i:i + block], axis=-1, zi=zi)
    return out if x.ndim == 2 else out[0]


# ---------------------------------------------------------------- effects
def stereo(x, pan=0.0):
    """Mono -> stereo with constant-power pan in [-1, 1]."""
    p = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(p), x * np.sin(p)])


def reverb_ir(seconds=2.4, damp=5500, predelay=0.02, seed=3, width=1.0):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    env = np.exp(-6.9 * t / seconds)
    L = rng.standard_normal(n) * env
    R = rng.standard_normal(n) * env
    R = width * R + (1 - width) * L
    # frequency-dependent decay: progressively darker tail
    L = sweep(L, "lp", damp * np.exp(-t * 1.2) + 800, block=512)
    R = sweep(R, "lp", damp * np.exp(-t * 1.2) + 800, block=512)
    pd = np.zeros(int(predelay * SR))
    ir = np.stack([np.concatenate([pd, L]), np.concatenate([pd, R])])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir):
    """x stereo (2, n) or mono; ir stereo. Output trimmed to len(x)."""
    x2 = np.atleast_2d(x)
    if x2.shape[0] == 1:
        x2 = np.vstack([x2, x2])
    out = np.stack([fftconvolve(x2[c], ir[c])[: x2.shape[1]] for c in range(2)])
    return out


def pingpong(x, delay_s, fb=0.45, n_taps=6, lp=5000):
    """Stereo ping-pong delay of a mono or stereo signal (wet only)."""
    m = x if x.ndim == 1 else x.mean(0)
    out = np.zeros((2, len(m)))
    d = int(delay_s * SR)
    tap = m.copy()
    for k in range(1, n_taps + 1):
        tap = filt(tap, "lp", lp)
        g = fb ** k
        side = (k - 1) % 2
        if k * d < len(m):
            out[side, k * d:] += g * tap[: len(m) - k * d]
    return out


def compress(x, thresh_db=-18, ratio=4, attack=0.005, release=0.08, makeup_db=0.0, knee=6):
    x2 = np.atleast_2d(x)
    lvl = np.max(np.abs(x2), axis=0)
    # envelope follower (block-wise one-pole via lfilter on attack/release approximation)
    env = np.zeros_like(lvl)
    a_a = np.exp(-1 / (attack * SR)); a_r = np.exp(-1 / (release * SR))
    # vectorised approximation: smooth with release, then max with fast-attack smoothing
    rel = lfilter([1 - a_r], [1, -a_r], lvl)
    att = lfilter([1 - a_a], [1, -a_a], lvl)
    env = np.maximum(att, rel * 0.98)
    db = 20 * np.log10(env + 1e-9)
    over = db - thresh_db
    gr = np.where(over <= -knee / 2, 0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = 10 ** ((-gr + makeup_db) / 20)
    out = x2 * g
    return out if x.ndim == 2 else out[0]


def limiter(x, ceiling_db=-1.0, lookahead=0.004, release=0.06):
    """Look-ahead peak limiter (gain never exceeds what each sample needs)."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    ceil = 10 ** (ceiling_db / 20)
    peak = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceil / (peak + 1e-12))
    la = max(2, int(lookahead * SR))
    g = minimum_filter1d(need, size=2 * la + 1)
    g = uniform_filter1d(g, size=la)            # smooth attack, still <= need
    a_r = np.exp(-1 / (release * SR))
    inv = 1 - g
    sm = lfilter([1 - a_r], [1, -a_r], inv)      # slow release of gain reduction
    g = np.minimum(g, 1 - np.maximum(inv, sm * 0.999))
    return np.clip(x * g, -ceil, ceil)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def bitcrush(x, bits=6, hold=2):
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    if hold > 1:
        y = np.repeat(y[..., ::hold], hold, axis=-1)[..., : x.shape[-1]]
    return y


def place(buf, sig, t, gain=1.0):
    """Add sig (mono or stereo) into stereo buf at time t (s)."""
    a = int(round(t * SR))
    if a >= buf.shape[1]:
        return
    s = sig if sig.ndim == 2 else np.stack([sig, sig])
    if a < 0:
        s = s[:, -a:]; a = 0
    n = min(s.shape[1], buf.shape[1] - a)
    buf[:, a:a + n] += gain * s[:, :n]
