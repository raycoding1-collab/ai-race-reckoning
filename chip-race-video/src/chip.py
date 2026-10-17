"""NES 2A03 voices, rendered the way the hardware (and FamiTracker drivers) work:

- pulse: duty 12.5 / 25 / 50 %, pitch quantised to the 11-bit timer
  f = CPU / (16 (t + 1)), 4-bit volume, software envelopes, duty and
  vibrato sequences ticked at the 60 Hz frame rate;
- triangle: 32-step 4-bit sequencer, f = CPU / (32 (t + 1)), no volume;
- noise: 15-bit LFSR (long mode and 93-step 'metallic' short mode) clocked
  from the NTSC period table;
- the APU's non-linear DAC mixer and its output filters (HP 90 Hz, LP 14 kHz).
Waveform edges are polyBLEP band-limited so nothing aliases at 44.1 kHz.
"""
import numpy as np
from dsp import SR, hz, _polyblep, filt, lfsr_sequence, bw

CPU = 1789773.0
FRAME = 1 / 60.0
NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]


def timer_hz(f, tri=False):
    div = 32.0 if tri else 16.0
    tm = np.clip(np.round(CPU / (div * np.asarray(f, dtype=float)) - 1), 8, 2047)
    return CPU / (div * (tm + 1))


def frames(dur):
    return max(1, int(np.ceil(dur / FRAME)))


def per_sample(seq, n):
    """Hold a per-frame sequence for 1/60 s per value (stepped, like the driver)."""
    idx = np.minimum((np.arange(n) / SR / FRAME).astype(int), len(seq) - 1)
    return np.asarray(seq)[idx]


def vol_env(nf, attack=0, peak=15, decay_frames=12, sustain=6, release_at=None, release_frames=6):
    """Software volume envelope, quantised to 4 bits."""
    v = np.zeros(nf)
    for i in range(nf):
        if i < attack:
            x = peak * (i + 1) / (attack + 1)
        else:
            k = i - attack
            x = sustain + (peak - sustain) * max(0.0, 1 - k / max(1, decay_frames))
        if release_at is not None and i >= release_at:
            x *= max(0.0, 1 - (i - release_at + 1) / max(1, release_frames))
        v[i] = x
    return np.clip(np.round(v), 0, 15)


def pulse_dac(p):
    """APU pulse mixer: 95.88 / (8128 / p + 100), normalised so p = 15 -> 1."""
    p = np.asarray(p, dtype=float)
    y = np.where(p > 0, 95.88 / (8128.0 / np.maximum(p, 1e-9) + 100), 0.0)
    return y / (95.88 / (8128.0 / 15 + 100))


def tnd_dac(tri, nse):
    den = tri / 8227.0 + nse / 12241.0
    y = np.where(den > 0, 159.79 / (1.0 / np.maximum(den, 1e-12) + 100), 0.0)
    return y / (159.79 / (1.0 / (15 / 8227.0) + 100))


def pulse_note(m, dur, duty_seq=(0.25,), vol=None, vib_cents=0.0, vib_rate=6.0, vib_delay=0.25,
               bend_from=0.0, bend_frames=3, arp=None, tail=0.06, phase=0.0):
    """One pulse-channel note -> (mono float, DAC-mixed, DC-free)."""
    nf = frames(dur + tail)
    n = int((dur + tail) * SR)
    fi = np.arange(nf)
    semis = np.full(nf, float(m))
    if arp is not None:                                  # 60 Hz chord arpeggio (the 'chip chord')
        semis = m + np.asarray(arp)[fi % len(arp)]
    if bend_from:
        semis = semis + bend_from * np.clip(1 - fi / max(1, bend_frames), 0, 1)
    if vib_cents:
        ft = fi * FRAME
        depth = vib_cents / 100 * np.clip((ft - vib_delay) / 0.25, 0, 1)
        semis = semis + depth * np.sin(2 * np.pi * vib_rate * ft)
    f = per_sample(timer_hz(hz(semis)), n)
    duty = per_sample([duty_seq[min(i, len(duty_seq) - 1)] for i in range(nf)], n)
    if vol is None:
        vol = vol_env(nf, release_at=frames(dur))
    v = per_sample(np.pad(vol, (0, max(0, nf - len(vol))))[:nf], n)
    ph = (phase + np.cumsum(f) / SR) % 1.0
    dt = f / SR
    raw = np.where(ph < duty, 1.0, -1.0) + _polyblep(ph, dt) - _polyblep((ph - duty) % 1.0, dt)
    u = 0.5 * (raw + 1)                                 # unipolar 0..1 like the hardware
    lvl = pulse_dac(v)
    return lvl * u - lvl * duty                         # remove each note's DC (no thumps)


def triangle_note(m, dur, tail=0.01):
    n = int((dur + tail) * SR)
    f = timer_hz(hz(m), tri=True)
    ph = (np.arange(n) * f / SR) % 1.0
    step = (ph * 32).astype(int)
    seq = np.concatenate([np.arange(15, -1, -1), np.arange(0, 16)])
    lvl = seq[step]
    g = np.ones(n)
    a = int(dur * SR)
    r = int(0.001 * SR)                                 # the linear counter silences it; 1 ms ramp
    g[a:] = 0
    g[max(0, a - r):a] = np.linspace(1, 0, min(r, a))
    return (tnd_dac(lvl, 0) - tnd_dac(7.5, 0)) * g


def noise_hit(dur, period_idx=2, short=False, vol=None, period_seq=None, seed=0):
    """Noise channel: LFSR stepped at CPU / period; optional per-frame period sequence."""
    n = int(dur * SR)
    nf = frames(dur)
    seq = lfsr_sequence(short)
    pidx = per_sample(period_seq if period_seq is not None else [period_idx] * nf, n)
    rate = CPU / np.asarray(NOISE_PERIODS)[pidx]
    pos = (np.cumsum(rate / SR) + seed * 1013).astype(np.int64) % len(seq)
    bit = 0.5 * (seq[pos] + 1)
    if vol is None:
        vol = vol_env(nf, decay_frames=nf, sustain=0)
    v = per_sample(np.pad(vol, (0, max(0, nf - len(vol))))[:nf], n)
    y = tnd_dac(0, v * bit)
    return y - np.mean(y)


def apu_out(x):
    """APU output stage: first-order HP 90 Hz and LP 14 kHz."""
    x = bw(x, "hp", 90, 1)
    return bw(x, "lp", 14000, 1)
