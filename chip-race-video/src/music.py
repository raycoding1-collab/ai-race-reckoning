"""SILICON SHIELD — instrumental arrangement, mix and master (v4, full song).

Everything is driven by song.SECTIONS / song.CHORDS / song.DROP_GAPS through
score.py; no bar numbers are hard-coded here. Sound concept: a dark cinematic
electro-pop production (tuned kick, clap stack, Szabó supersaw wall, reese +
mono sub, FM plucks, pads, risers, orchestral hits) with NES-authentic chip
voices as the hook layer. The hook motif is heard on bells (intro, bridge,
outro), on the chip lead (intro echo, post-chorus call and response, chorus
doubling) and in the vocal.

Run:  python3 src/music.py   -> audio/silicon_shield.wav + .mp3,
                                build/stems/bus_*.wav, build/events.json,
                                build/spec_full.png and a measurement report.
"""
import os, sys, json, time
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import song
import score as S
import synths as Y
import chip
import cinema
from score import t, sec, kind, N, B, BAR, ev, in_gap
from dsp import *  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEMS = os.path.join(ROOT, "build", "stems")
AUDIO = os.path.join(ROOT, "audio")
NB = S.NB
G_PC = song.NOTE_IDX["G"]
T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


# ================================================================ buses
BUS = {}


def bus(name):
    if name not in BUS:
        BUS[name] = np.zeros((2, N))
    return BUS[name]


def put(name, sig, t0, gain=1.0, pan=0.0, gap_ok=False):
    if not gap_ok and in_gap(t0):
        return False
    s = sig if sig.ndim == 2 else stereo(sig, pan)
    place(bus(name), s, t0, gain)
    return True


def cut_at_gap(sig, t0):
    """Truncate a note so it never sounds into a drop gap."""
    for a, b in S.GAPS:
        if t0 < a < t0 + sig.shape[-1] / SR:
            k = int((a - t0) * SR)
            sig = sig.copy()
            r = min(k, int(0.004 * SR))
            sig[..., k:] = 0
            sig[..., k - r:k] *= np.linspace(1, 0, r)
    return sig


def resample_rate(x, r):
    """Play x at rate r (pitch and speed), mono or stereo."""
    n = int(x.shape[-1] / r)
    idx = np.arange(n) * r
    if x.ndim == 1:
        return np.interp(idx, np.arange(x.shape[-1]), x)
    return np.stack([np.interp(idx, np.arange(x.shape[-1]), c) for c in x])


def kick_root(bar):
    return 49.0 if S.KEY_ROOT[min(bar, NB - 1)] == G_PC else 43.65


# ================================================================ drums
KICKS = []          # (time, velocity) for the sidechain


_SMP = {}


def sample(name):
    """CC0 one-shot from samples/ (onset-trimmed), resampled to SR."""
    if name not in _SMP:
        x, sr = sf.read(os.path.join(ROOT, "samples", f"{name}.flac"), dtype="float64")
        x = x.mean(1) if x.ndim == 2 else x
        if sr != SR:
            from scipy.signal import resample_poly
            x = resample_poly(x, SR, sr)
        _SMP[name] = x
    return _SMP[name]


def drums():
    rng = np.random.default_rng(11)

    def K(bar, beat, vel=1.0, long=False):
        x = t(bar, beat)
        if in_gap(x):
            return
        put("kick", Y.kick(kick_root(bar), long) * vel, x)
        put("kick_top", sample("kick_top") * vel, x)
        KICKS.append((x, vel))
        ev("kick", x)

    def SN(bar, beat, vel=1.0, clap=True, pitch=0.0, gated=False, snare=True):
        x = t(bar, beat)
        if in_gap(x):
            return
        s = Y.snare()
        if pitch:
            s = resample_rate(s, 2 ** (pitch / 12))
        if snare:
            put("snare", s * vel * 0.85, x)
            put("snare_top", sample("snare_top") * vel, x)
        if clap:
            put("snare", Y.clap(int(rng.integers(0, 3))) * vel * 0.75, x)
        if gated:
            put("gated_send", s * vel, x)
        ev("snare", x)

    def H(bar, beat, vel=0.5, open_=False, pan=0.25, swing=0.0):
        x = t(bar, beat) + rng.uniform(0, 0.003)
        if (beat * 4) % 2 == 1:
            x += swing * B / 4
        if in_gap(x):
            return
        v = vel * 10 ** (rng.uniform(-1.5, 1.5) / 20)
        put("hats", Y.hat(open_, int(rng.integers(0, 3))) * v, x, pan=pan)
        ev("hat", x)

    def CN(bar, beat, vel=0.4, short=True, period=1, dur=0.05, pan=-0.35):
        """NES noise-channel tick (the 8-bit identity under the modern kit)."""
        x = t(bar, beat)
        if in_gap(x):
            return
        nf = chip.frames(dur)
        y = chip.noise_hit(dur, period, short, vol=chip.vol_env(nf, peak=15, decay_frames=nf, sustain=0),
                           seed=int(rng.integers(0, 99)))
        put("chipperc", y * vel, x, pan=pan)

    def SH(bar, beat, vel=0.3, pan=0.45):
        x = t(bar, beat) + rng.uniform(0, 0.004)
        if not in_gap(x):
            put("perc", Y.shaker() * vel * 10 ** (rng.uniform(-2, 1) / 20), x, pan=pan)

    def TOM(bar, beat, m=45, vel=0.6, pan=0.0):
        x = t(bar, beat)
        if not in_gap(x):
            put("perc", Y.tom(m) * vel, x, pan=pan)

    def CR(bar, beat=0, vel=0.7, dur=3.0):
        x = t(bar, beat)
        if not in_gap(x):
            put("cym", Y.crash(dur, int(rng.integers(0, 9))) * vel, x)
            ev("crash", x)

    def roll(bar, a, b, step, v0, v1, p0=0.0, p1=0.0, clap_every=1):
        pts = np.arange(a, b - 1e-9, step)
        for i, s in enumerate(pts):
            q = i / max(1, len(pts) - 1)
            SN(bar, s, v0 + (v1 - v0) * q, clap=(i % clap_every == 0), pitch=p0 + (p1 - p0) * q)

    for bar in range(NB):
        name, rel, L = sec(bar)
        fam = kind(bar)
        last = rel == L - 1
        if fam == "intro":
            if rel >= L - 2:
                for e in range(8):
                    CN(bar, e / 2, (0.25 + 0.25 * (e % 2)) * (0.6 + 0.4 * rel / L), period=1, pan=0.3 * (-1) ** e)
            if last:
                for s in (3, 3.25, 3.5, 3.75):
                    CN(bar, s, 0.35 + 0.15 * (s - 3) * 4, short=False, period=4, dur=0.08, pan=0)
        elif fam == "verse":
            second = name != "verse1"
            if not second:
                if rel < 4:
                    for b in ([0, 2.5] if rel % 2 == 0 else [0, 1.75, 2.5]):
                        K(bar, b, 0.82)
                    for e in (0.5, 1.5, 2.5, 3.5):
                        CN(bar, e, 0.28, period=1, pan=0.35)
                    if rel >= 2:
                        SN(bar, 3, 0.35, clap=True, snare=False)
                else:
                    for b in ([0, 1.5, 2.5] if rel % 2 == 0 else [0, 1.5, 2.5, 3.5]):
                        K(bar, b, 0.9)
                    for b in (1, 3):
                        SN(bar, b, 0.62, snare=rel >= 6)
                    for e in range(8):
                        H(bar, e / 2, 0.42 if e % 2 else 0.2, pan=0.25)
                    for s in (0.75, 2.75):
                        CN(bar, s, 0.2, period=2, pan=-0.4)
            else:
                four = rel >= 6
                for b in ([0, 1, 2, 3] if four else ([0, 1.5, 2.5] if rel % 2 == 0 else [0, 1.5, 2.5, 3.5])):
                    K(bar, b, 0.92)
                for b in (1, 3):
                    SN(bar, b, 0.68)
                steps = [i / 4 for i in range(16)] if rel >= 4 else [i / 2 for i in range(8)]
                for s in steps:
                    H(bar, s, 0.45 if (s * 2) % 2 == 1 else 0.22, pan=0.25, swing=0.06)
                if rel >= 4:                              # tom pulse: the third new element
                    for s, m in ((2.75, 45), (3.5, 41)):
                        TOM(bar, s, m, 0.45, pan=0.3 if m == 45 else -0.3)
                if rel >= 6:
                    for s in range(16):
                        SH(bar, s / 4, 0.18 + 0.1 * (s % 2))
                for s in (0.75, 2.75):
                    CN(bar, s, 0.18, period=2, pan=-0.4)
        elif fam == "pre":
            kick_on = rel < L - 1 if L <= 2 else rel < L - 1
            if kick_on:
                for b in range(4):
                    K(bar, b, 0.95)
            if not last:
                for b in (1, 3):
                    SN(bar, b, 0.75)
            for s in range(16):
                H(bar, s / 4, 0.38 if s % 2 else 0.2, pan=0.25)
            prog = rel / max(1, L - 1)
            if L == 2:
                if rel == 0:
                    roll(bar, 2, 4, 0.5, 0.35, 0.55, 0, 2)
                else:
                    roll(bar, 0, 4, 0.25, 0.5, 1.0, 2, 9)
            else:
                if rel == L - 3:
                    roll(bar, 2, 4, 0.5, 0.3, 0.45, 0, 1)
                elif rel == L - 2:
                    roll(bar, 0, 4, 0.5, 0.45, 0.7, 1, 4)
                elif last:
                    roll(bar, 0, 2, 0.25, 0.65, 0.85, 4, 7)
                    roll(bar, 2, 4, 0.125, 0.85, 1.05, 7, 12, clap_every=2)
        elif fam == "chorus":
            big = 0 if name == "chorus1" else (1 if name == "chorus2" else 2)
            for b in range(4):
                K(bar, b, 1.0, long=(b == 0 and rel % 4 == 0))
            if big == 2 and rel % 2 == 1:
                K(bar, 3.75, 0.55)
            for b in (1, 3):
                SN(bar, b, 0.95)
            for s in range(16):
                q = s / 4
                if q % 1 == 0.5:
                    H(bar, q, 0.42, open_=True, pan=-0.2)
                else:
                    H(bar, q, 0.45 if s % 2 else 0.24, pan=0.28, swing=0.04)
            for s in (0.75, 1.75, 2.75, 3.75):
                CN(bar, s, 0.22, dur=0.04, pan=0.5 * (-1) ** int(s))
            if big >= 1:
                for s in range(16):
                    SH(bar, s / 4, 0.16 + 0.12 * (s % 2))
            if rel % 4 == 3:
                roll(bar, 3, 4, 0.25, 0.45, 0.75, 0, 3)
                if rel == L - 1 and big >= 1:
                    for k, (s, m) in enumerate([(2, 50), (2.25, 47), (2.5, 45), (2.75, 41)]):
                        TOM(bar, s, m, 0.6, pan=0.4 - 0.25 * k)
            if rel % 4 == 0:
                CR(bar, 0, 0.75 + 0.1 * big, 3.5)
        elif fam == "post":
            thin = last
            if not thin:
                for b in range(4):
                    K(bar, b, 0.95, long=(rel == 0 and b == 0))
                for b in (1, 3):
                    SN(bar, b, 0.85)
            else:
                for b in ([0, 1] if name == "post1" else [0]):
                    K(bar, b, 0.9)
                if name == "post1":
                    SN(bar, 1, 0.7)
            for e in range(8):
                if e % 2 == 1 and not thin:
                    H(bar, e / 2, 0.4, open_=True, pan=-0.2)
            for s in range(16):                            # chip-noise 16ths: the post-chorus is the chip section
                if not thin or s < 8:
                    CN(bar, s / 4, 0.32 if s % 2 else 0.16, period=0 if s % 4 else 1, dur=0.035, pan=0.4 * (-1) ** s)
            if rel == 0:
                CR(bar, 0, 0.6, 3.0)
        elif fam == "bridge":
            if rel >= 2:
                K(bar, 0, 0.85)
                if rel % 2 == 1:
                    K(bar, 2.5, 0.55)
                SN(bar, 2, 0.75, clap=True, gated=True)
            if rel >= 4:
                for e in range(8):
                    SH(bar, e / 2, 0.14 + 0.08 * (e % 2), pan=0.4)
            if last:
                for k, s in enumerate(np.arange(2, 4, 0.25)):
                    TOM(bar, s, [52, 50, 47, 45, 43, 41, 40, 38][k], 0.3 + 0.06 * k, pan=0.4 - 0.11 * k)
        elif fam == "build":
            if rel < L - 1:
                for b in range(4):
                    K(bar, b, 0.95)
            if rel < L - 1:
                for s in range(16):
                    H(bar, s / 4, 0.36 if s % 2 else 0.18, pan=0.25)
            step = [1.0, 0.5, 0.25, 0.125][min(3, rel)]
            span = 4 if not last else 4
            pts_v = (0.35 + 0.18 * rel, 0.5 + 0.18 * rel)
            roll(bar, 0, span, step, pts_v[0], pts_v[1], 3 * rel, 3 * rel + 3, clap_every=1 if step >= 0.25 else 2)
        elif fam == "outro":
            if rel in (0, 2):
                K(bar, 0, 0.7, long=True)
            if rel < 2:
                for e in range(8):
                    CN(bar, e / 2, 0.22 * (1 - rel / 2) * (0.6 + 0.4 * (e % 2)), period=1, pan=0.3 * (-1) ** e)
    # crashes into every section boundary that follows a gap, and the reverse swells into the drops
    for a, b in S.GAPS:
        put("gapfx", Y.reverse_swell(b - a + 0.25) * 0.55, b - (b - a + 0.25), gap_ok=True)
        ev("riser", (b - (b - a + 0.25), b))


def sidechain(depth=0.8, tau=0.06, attack=0.002):
    env = np.ones(N)
    n = int(0.5 * SR)
    tt = np.arange(n) / SR
    for x, vel in KICKS:
        d = depth * min(1.0, vel)
        shape = 1 - d * np.exp(-tt / tau) * np.minimum(1, tt / attack + 0.0)
        shape[: int(attack * SR)] = np.linspace(1, 1 - d, int(attack * SR))
        a = int(x * SR)
        b = min(N, a + n)
        env[a:b] = np.minimum(env[a:b], shape[: b - a])
    return env


# ================================================================ bass
def bass():
    for bar in range(NB):
        name, rel, L = sec(bar)
        fam = kind(bar)
        r = S.bass_midi(bar)
        nxt = S.bass_midi(bar + 1) if bar + 1 < NB else r
        last = rel == L - 1

        def sub8(beats, vel=1.0, oct_pops=(), glide_last=False):
            for i, b in enumerate(beats):
                x = t(bar, b)
                if in_gap(x):
                    continue
                m = r + (12 if b in oct_pops else 0)
                d = 0.5 * B * 0.92
                y = Y.sub_note(m, d, glide_from=m + 0.6)
                put("sub", cut_at_gap(y, x) * vel, x)

        def subhold(dur_beats, vel=1.0, beat=0.0):
            x = t(bar, beat)
            if in_gap(x):
                return
            y = Y.sub_note(r, dur_beats * B - 0.02, a=0.02, rel=0.08)
            put("sub", cut_at_gap(y, x) * vel, x)

        def reese(vel=1.0, cutoff=700, drive=3.0, m=None):
            x = t(bar)
            y = Y.reese_note((m or r) + 12, BAR, cutoff=cutoff, drive=drive, phase=bar * 0.7)
            # quarter-note filter 'wobble' through a gentle amplitude contour
            tt = np.arange(y.shape[-1]) / SR
            y = y * (0.8 + 0.2 * np.cos(2 * np.pi * tt / B))
            put("reese", cut_at_gap(y, x) * vel, x)

        def tri(beats, vel=1.0, octs=()):
            for b in beats:
                x = t(bar, b)
                if in_gap(x):
                    continue
                m = r + 12 + (12 if b in octs else 0)
                y = chip.triangle_note(m, 0.5 * B * 0.8)
                put("tri", cut_at_gap(y, x) * vel, x)

        def fmb(beats, vel=1.0, octs=()):
            for b in beats:
                x = t(bar, b)
                if in_gap(x):
                    continue
                m = r + 12 + (12 if b in octs else 0)
                y = Y.fm_note(m, 0.5 * B * 0.8, ratio=1.0, idx_hi=3.5, idx_lo=0.6, idx_tau=0.035, amp_tau=0.18, click=0.05)
                put("fmbass", cut_at_gap(y, x) * vel, x)

        eighths = [i / 2 for i in range(8)]
        if fam == "intro":
            if rel == 0:
                x = t(bar)
                d = cinema.drone(L * BAR + 0.6, root=r)
                put("drone", filt(d, "hp", 40), x)
        elif fam == "verse":
            if name == "verse1" and rel < 4:
                tri([0, 0.75, 2, 2.75, 3.5], 0.9, octs=(3.5,))
                subhold(4, 0.55)
            else:
                fmb(eighths, 0.85, octs=(1.5, 3.5))
                sub8(eighths, 0.8)
                if name == "verse2" and rel >= 2:
                    tri([0, 0.75, 2, 2.75], 0.5)
                if name == "verse2" and rel >= 6:
                    reese(0.45, cutoff=450, drive=2.0)
        elif fam == "pre":
            sub8(eighths, 0.9)
            prog = (rel + 1) / L
            reese(0.4 + 0.45 * prog, cutoff=400 + 900 * prog, drive=2.5)
            fmb([i / 4 for i in range(16)] if last else eighths, 0.55 + 0.3 * prog)
        elif fam == "chorus":
            big = 0 if name == "chorus1" else (1 if name == "chorus2" else 2)
            sub8(eighths, 1.0)
            reese(0.95 + 0.1 * big, cutoff=650 + 200 * big, drive=3.0)
            if big == 2:                                     # rolling offbeat octave
                fmb([0.5, 1.5, 2.5, 3.5], 0.55, octs=(0.5, 1.5, 2.5, 3.5))
            if rel == L - 1:                                  # walk-up into the next phrase
                for k, b in enumerate((3, 3.5)):
                    x = t(bar, b)
                    m = r + (1 if k == 0 else 2) if nxt - r in (2, -10) else r + 12 * (k == 1)
                    put("fmbass", Y.fm_note(m + 12, 0.45 * B, idx_hi=4, amp_tau=0.2) * 0.6, x)
        elif fam == "post":
            if not last:
                sub8(eighths, 0.95)
                tri([i / 4 for i in range(16)], 0.75, octs=tuple(i / 4 for i in range(16) if i % 4 == 2))
            else:
                subhold(2, 0.8)
        elif fam == "bridge":
            if rel >= 2:
                subhold(4, 0.7, 0)
            if rel >= 4:
                tri([0, 1.5, 2, 3.5], 0.35)
        elif fam == "build":
            if rel < 2:
                sub8(eighths, 0.95)
            else:
                for i in range(16):
                    x = t(bar, i / 4)
                    if in_gap(x):
                        continue
                    y = Y.sub_note(r + (12 if i % 4 == 2 else 0), 0.25 * B * 0.9)
                    put("sub", y * 0.95, x)
            reese(0.4 + 0.2 * rel, cutoff=350 + 350 * rel, drive=2.5 + 0.5 * rel)
        elif fam == "outro":
            if rel < 2:
                subhold(4, 0.6 - 0.2 * rel)


# ================================================================ chords
def chords():
    for bar in range(NB):
        name, rel, L = sec(bar)
        fam = kind(bar)
        v = S.voicing(bar)
        wv = S.wall_voicing(bar)
        x0 = t(bar)
        last = rel == L - 1
        prog = rel / max(1, L - 1)

        def pad(gain=1.0, cutoff=2000, attack=0.6, release=1.5, notes=None, dur=BAR):
            for k, m in enumerate(notes or (v + [v[0] + 12])):
                y = Y.pad_note(m, dur, attack=attack, release=release, cutoff=cutoff, seed=bar * 7 + k)
                put("pad", cut_at_gap(y, x0) * gain, x0)

        def wall(gain=1.0, layer="wall", octave=0, detune=0.5, notes=None, gate=None):
            for k, m in enumerate(notes or wv):
                n = int((BAR + 0.25) * SR)
                y = Y.supersaw(m + 12 * octave, n, detune=detune, mix=0.6, seed=bar * 13 + k + 100 * octave)
                tt = np.arange(n) / SR
                e = np.minimum(1, tt / 0.005) * np.where(tt < BAR, 1.0, np.exp(-(tt - BAR) / 0.06))
                if gate is not None:
                    e = e * gate(tt)
                put(layer, cut_at_gap(y * e, x0) * gain, x0)

        def pluck_arp(gain=1.0, pattern=(0, 1, 2, 1, 2, 3, 2, 1), step=0.5, base=12):
            tones = v + [v[0] + 12]
            for i, s in enumerate(np.arange(0, 4, step)):
                x = t(bar, s)
                if in_gap(x):
                    continue
                m = tones[pattern[i % len(pattern)]] + base
                y = Y.fm_note(m, step * B * 0.9, ratio=2.0, idx_hi=2.6, idx_lo=0.3, idx_tau=0.05, amp_tau=0.22, click=0.02)
                put("pluck", cut_at_gap(y, x) * gain * (1.0 if i % 2 == 0 else 0.8), x, pan=0.3 * (-1) ** i)

        def stabs(gain=1.0, beats=(0.5, 1.5, 2.5, 3.5)):
            for s in beats:
                x = t(bar, s)
                if in_gap(x):
                    continue
                for k, m in enumerate(v + [v[0] + 12]):
                    y = Y.saw_pluck(m + 12, 0.4 * B, bright=4500, q=3.5, amp_tau=0.16)
                    put("pluck", y * gain * 0.6, x, pan=0.5 * (k - 1.5) / 1.5)

        def strings16(gain=1.0, bright=3800, oct_=12):
            for s in range(16):
                x = t(bar, s / 4)
                if in_gap(x):
                    continue
                m = v[[0, 2, 1, 2][s % 4]] + oct_
                y = cinema.string_hit(m, B / 4 * 1.4, bright) * (1.0 + 0.3 * (s % 4 == 0))
                put("strings", y * gain, x, pan=0.45 * (-1) ** s)

        def trem(gain=1.0, bright=3500, oct_=12):
            for k, m in enumerate(v):
                y = cinema.string_trem(m + oct_, BAR, bright)
                put("strings", cut_at_gap(y, x0) * gain, x0, pan=(k - 1) * 0.5)

        def brass_stab(gain=1.0, beat=0.0, dur=1.2, up=0):
            x = t(bar, beat)
            if in_gap(x):
                return
            for k, m in enumerate(v + [v[0] - 12]):
                put("brass", cinema.brass(m + up, B * dur) * gain, x, pan=(k - 1.5) * 0.25)

        if fam == "intro":
            pad(0.9, cutoff=700 + 900 * prog, attack=1.2, release=2.0)
        elif fam == "verse":
            if name == "verse1":
                pad(0.75, cutoff=1100 if rel < 4 else 1700)
                if rel >= 4:
                    pluck_arp(0.8)
                if rel >= 6:
                    strings16(0.35, 2600)
            else:
                pad(0.8, cutoff=1500 + 600 * prog)
                pluck_arp(0.75 + 0.15 * prog)
                if rel >= 4:
                    strings16(0.45, 3000)
                if rel >= 6:
                    wall(0.35, layer="rise", detune=0.4)
        elif fam == "pre":
            pad(0.8, cutoff=2200)
            wall(0.55 + 0.35 * prog, layer="rise", detune=0.45 + 0.1 * prog)
            trem(0.5 + 0.5 * prog, 2500 + 2500 * prog)
            if last:
                brass_stab(0.6, 0, 3.0)
        elif fam == "chorus":
            big = 0 if name == "chorus1" else (1 if name == "chorus2" else 2)
            wall(1.0)
            if big >= 1:
                wall(0.45, layer="wall_hi", octave=1, detune=0.55, notes=wv[2:])
            if big == 2:
                wall(0.4, layer="wall_hi", octave=2, detune=0.6, notes=wv[3:])
            pad(0.7, cutoff=2600, attack=0.2, release=1.0)
            if rel % 2 == 0:
                brass_stab(0.8 + 0.2 * big)
                if big == 2:
                    brass_stab(0.5, 2.5, 0.8)
            if big == 2 or (big == 1 and rel >= 4) or (big == 0 and rel >= 6):
                strings16(0.55 if big else 0.4, 4200, 24)
        elif fam == "post":
            pad(0.75, cutoff=2400, attack=0.3)
            if not last:
                stabs(0.9)
            if name == "post2":
                wall(0.3, layer="rise", detune=0.4)
        elif fam == "bridge":
            pad(0.95, cutoff=1500 + 500 * (rel >= 4), attack=1.0, release=2.5, dur=BAR)
            if rel >= 4:
                for k, m in enumerate(v):          # sustained high strings, legato, very soft
                    y = cinema.string_trem(m + 12, BAR, 2200) * 0.6
                    put("strings", y * 0.35, x0, pan=(k - 1) * 0.6)
        elif fam == "build":
            gate = lambda tt: 0.25 + 0.75 * (((tt / (B / 2)) % 1) < 0.55)
            wall(0.5 + 0.2 * rel, layer="rise", detune=0.5, gate=gate)
            trem(0.6 + 0.2 * rel, 3000 + 1500 * rel)
            pad(0.6, cutoff=2400)
            if S.chord_pcs(bar)[0] == song.NOTE_IDX["D"]:
                brass_stab(0.5 + 0.2 * rel, 0, 3.0)
        elif fam == "outro":
            pad(0.9 - 0.15 * rel, cutoff=1400 - 200 * rel, attack=0.8, release=2.5)


# ================================================================ leads (chip, counter, bells)
def chip_lead_note(m, dur, vel=1.0, duty=0.25, vib=22, bend=-0.7):
    nf = chip.frames(dur + 0.06)
    vol = chip.vol_env(nf, attack=0, peak=15, decay_frames=10, sustain=10, release_at=chip.frames(dur),
                       release_frames=4)
    seq = (0.5, 0.5, duty)                          # 2 frames of 50 % on the attack, then the lead duty
    return chip.pulse_note(m, dur, duty_seq=seq, vol=vol, vib_cents=vib if dur > 0.3 else 0,
                           vib_rate=6.2, vib_delay=0.22, bend_from=bend, bend_frames=3) * vel


def chip_arp_note(m, dur, vel=1.0, duty=0.125):
    nf = chip.frames(dur + 0.03)
    vol = chip.vol_env(nf, peak=12, decay_frames=6, sustain=4, release_at=chip.frames(dur), release_frames=2)
    return chip.pulse_note(m, dur, duty_seq=(duty,), vol=vol, tail=0.03) * vel


def leads():
    hook_bars = set(S.bars_of("chorus"))
    # --- intro: bells state the hook, the chip lead echoes it as the console boots
    a = S.SEC_START["intro"]
    L = S.SEC_END["intro"] - a
    for x, d, m in S.hook_at(a, 0, octave=1):
        put("bells", cinema.bell(m, 3.2, 0.9, 0.35 * np.sin(x)), x)
    for x, d, m in S.hook_at(a + L // 2, 0, octave=0):
        y = chip_lead_note(m, d * 0.9, 0.7, duty=0.25)
        put("chiplead", y, x, pan=-0.1)
    for bar in range(a + L // 2, a + L):            # console-boot arpeggio
        v = S.voicing(bar)
        seq = [v[0] + 24, v[1] + 24, v[2] + 24, v[1] + 36, v[2] + 24, v[0] + 36, v[1] + 24, v[2] + 24]
        for s in range(16):
            x = t(bar, s / 4)
            put("arp", chip_arp_note(seq[s % 8], B / 4 * 0.9, 0.5 + 0.5 * (bar - a - L // 2 + s / 16) / (L - L // 2)),
                x, pan=0.35 * (-1) ** s)

    # --- chorus: chip lead doubles the vocal (octave-up lead in the last chorus), answer riffs in the holds
    for ln in S.TL:
        if not ln["hook"]:
            continue
        name, rel, Ls = sec(ln["bar"])
        big = int(name[-1]) - 1
        for w in ln["words"]:
            for nt in w["notes"]:
                if big == 0 and rel < 4:
                    continue                          # chorus1 grows: the double enters halfway
                vel = 0.55 if big < 2 else 0.6
                put("chiplead", chip_lead_note(nt["midi"], nt["dur"] * 0.95, vel, duty=0.25), nt["t"], pan=0.0)
                if big == 2:
                    put("chiplead", chip_lead_note(nt["midi"] + 12, nt["dur"] * 0.95, 0.5, duty=0.125, vib=28),
                        nt["t"], pan=0.0)
        # answer riff: the 1.5 beats after each line's held note
        bar2 = ln["bar"] + 1
        v = S.voicing(bar2)
        riff = [v[2] + 24, v[1] + 24, v[0] + 24, v[2] + 12, v[1] + 24, v[0] + 36]
        for k, m in enumerate(riff):
            x = t(ln["bar"], 6.5 + k * 0.25)
            put("arp", chip_arp_note(m, B / 4 * 0.9, 0.8, duty=0.25), x, pan=0.4 * (-1) ** k)

    # --- chorus2/3 countermelody: moves in the vocal's holds
    for name in ("chorus2", "chorus3"):
        if name not in S.SEC_START:
            continue
        a = S.SEC_START[name]
        tr = 2 if S.KEY_ROOT[a] == G_PC else 0
        prev = None
        for x, d, m, vel in S.counter_notes(a, tr):
            y = Y.saw_lead(m, d * 0.95, vib=0.2 if d > 0.6 * B else 0.0, glide_from=prev if prev and abs(prev - m) <= 4 else None)
            put("counter", cut_at_gap(y, x) * vel, x, pan=0.15)
            prev = m

    # --- post-chorus: chip-lead hook as the response to the chant
    for ln in S.TL:
        if ln["style"] != "chant":
            continue
        k = (ln["bar"] - S.SEC_START[sec(ln["bar"])[0]]) // 2
        diat = 0 if k % 2 == 0 else -1
        notes = S.hook_at(ln["bar"], 4.5, octave=1, speed=0.5, diat=diat)
        for i, (x, d, m) in enumerate(notes):
            dur = d if i < len(notes) - 1 else 1.4 * B
            put("chiplead", chip_lead_note(m, dur * 0.92, 0.95, duty=0.25 if i < len(notes) - 1 else 0.125), x)
        # pickup in the half-beat hole after "now"
        v = S.voicing(ln["bar"])
        for j, m in enumerate([v[2] + 24, v[0] + 36]):
            put("arp", chip_arp_note(m, B / 4 * 0.9, 0.7), t(ln["bar"], 2.5 + 0.25 * j), pan=0.3)
        if sec(ln["bar"])[0] == "post2":                 # bells join the answer an octave up
            for x, d, m in notes:
                put("bells", cinema.bell(m + 12, 1.6, 0.6, 0.4), x, 0.5)
    # under the post-chorus: 16th chip arps (soft)
    for bar in S.bars_of("post"):
        name, rel, L = sec(bar)
        if rel == L - 1:
            continue
        v = S.voicing(bar)
        seq = [v[0] + 12, v[1] + 12, v[2] + 12, v[1] + 24]
        for s in range(16):
            put("arp", chip_arp_note(seq[s % 4], B / 4 * 0.8, 0.45), t(bar, s / 4), pan=-0.35 * (-1) ** s)

    # --- verse 2: chip counter-line in the holes (the second new element), soft arps later
    vb = S.bars_of("verse2")
    if vb:
        fills = S.hole_fills(set(vb[2:]), lo=72, hi=89)
        for x, d, m, vel in fills:
            put("arp", chip_arp_note(m, d * 0.9, 0.8 * vel, duty=0.125), x, pan=0.35)
    # --- verse 1 second half: two quiet chip echoes of the vocal tail
    # --- bridge: bells answer the vocal with the hook's head; the last bar pivots
    for ln in S.TL:
        if ln["section"] != "bridge":
            continue
        bar2 = ln["bar"] + 1
        if S.chord_pcs(bar2)[0] == song.NOTE_IDX["C"] and song.CHORDS[bar2][1] == "":
            for k, m in enumerate([72, 76, 79, 84, 88]):
                put("bells", cinema.bell(m, 3.5, 0.7, 0.5 * (-1) ** k), t(bar2, 1 + k * 0.5))
            continue
        head = S.hook_at(ln["bar"], 5.5, octave=1, speed=1.0)[:5]
        for x, d, m in head:
            put("bells", cinema.bell(m, 2.8, 0.7, 0.45), x)
    # --- outro: the hook on bells in the new key, with the whispered line; then a falling answer
    oa = S.SEC_START.get("outro")
    if oa is not None:
        tr = 2 if S.KEY_ROOT[oa] == G_PC else 0
        for x, d, m in S.hook_at(oa, 0, transpose=tr, octave=1):
            put("bells", cinema.bell(m, 3.6, 1.0, 0.3 * np.sin(3 * x)), x)
        v = S.voicing(oa + 2)
        for k, m in enumerate([v[2] + 24, v[1] + 24, v[0] + 24, v[2] + 12]):
            put("bells", cinema.bell(m, 4.0, 0.8, 0.5 * (-1) ** k), t(oa + 2, 1 + k))
        for bar in range(oa, oa + 3):                   # chip arp alone, fading out
            v = S.voicing(bar)
            seq = [v[0] + 24, v[1] + 24, v[2] + 24, v[1] + 36]
            for s in range(16):
                fade = 1 - ((bar - oa) * 16 + s) / 48
                put("arp", chip_arp_note(seq[s % 4], B / 4 * 0.8, 0.55 * fade), t(bar, s / 4), pan=0.35 * (-1) ** s)


# ================================================================ orchestral percussion, fx, impacts
def orchestra_fx():
    for bar in range(NB):
        name, rel, L = sec(bar)
        fam = kind(bar)
        big = int(name[-1]) - 1 if fam == "chorus" else 0
        if fam == "chorus":
            if rel % 2 == 0 or big >= 1:
                put("taiko", cinema.taiko(0.8, 60), t(bar))
            if rel % 2 == 0:
                put("taiko", cinema.taiko(0.45, 80), t(bar, 2.5), pan=0.3)
        if fam in ("pre", "build"):
            hits = [i / 2 for i in range(8)] if rel < L - 1 else [i / 4 for i in range(16)]
            for i, s in enumerate(hits):
                x = t(bar, s)
                if not in_gap(x):
                    put("taiko", cinema.taiko(0.18 + 0.35 * (rel + s / 4) / L, 64 + (i % 2) * 14), x, pan=0.4 * (-1) ** i)
    # risers: into every chorus and into the build (from the section before)
    for name, a, b in song.SECTIONS:
        fam = name.rstrip("0123456789")
        if fam in ("pre",):
            x0, x1 = t(a), next((ga for ga, gb in S.GAPS if t(a) <= ga <= t(b)), t(b))
            y = Y.noise_riser(x1 - x0, 300, 12000) * 0.5 + Y.saw_riser(41, x1 - x0, 12) * 0.35
            put("fx", y, x0)
            ev("riser", (x0, x1))
        if fam == "build":
            x0, x1 = t(a), next((ga for ga, gb in S.GAPS if t(a) <= ga <= t(b)), t(b))
            put("fx", Y.shepard_riser(x1 - x0, accel=2.2) * 0.9, x0)
            put("fx", Y.noise_riser(x1 - x0, 400, 14000, q=1.6) * 0.45, x0)
            ev("riser", (x0, x1))
        if fam == "intro":
            x0, x1 = t(b - 2), t(b)
            put("fx", Y.noise_riser(x1 - x0, 300, 6000, trem=False) * 0.25, x0)
            ev("riser", (x0, x1))
        if fam == "post" and name == "post2":
            # downlifter into the bridge
            n = int(BAR * SR)
            p = np.linspace(0, 1, n)
            dl = sweep(np.stack([noise(n), noise(n)]), "bp", 8000 * 0.04 ** p, q=1.2) * (1 - p) ** 1.5
            put("fx", dl * 0.35, t(b - 1))
            put("impact", stereo(Y.sub_drop(1.6, 110, 32) * 0.9), t(b - 1))
            ev("impact", t(b - 1))
        if fam == "chorus" or fam == "intro":
            # downbeat impacts: boom on every chorus (bigger each time); the intro opens on one
            vel = {"intro": 0.8, "chorus1": 0.9, "chorus2": 1.0, "chorus3": 1.15}.get(name, 0.9)
            put("impact", stereo(Y.boom(2.6, kick_root(a)) * vel), t(a), gap_ok=True)
            put("taiko", cinema.taiko(1.1 * vel, 55), t(a), gap_ok=True)
            ev("impact", t(a))
            if name == "chorus3":
                put("impact", stereo(cinema.clang(0.7)), t(a))
                for m in S.voicing(a):
                    put("brass", cinema.brass(m + 12, 1.4), t(a))
    # the post-chorus -> verse2 transition: reverse swell into verse 2
    if "verse2" in S.SEC_START:
        a = S.SEC_START["verse2"]
        put("fx", Y.reverse_swell(1.2 * B * 2) * 0.35, t(a) - 2.4 * B)
    if "bridge" in S.SEC_START:
        a = S.SEC_START["bridge"]
        put("impact", stereo(Y.boom(4.0, 43.65) * 0.5), t(a))
        ev("impact", t(a))
    # final orchestral hit with a long tail (ringing past the last bar)
    tones = [m - 12 for m in S.voicing(NB - 1)] + S.voicing(NB - 1) + [S.voicing(NB - 1)[0] + 12]
    put("final", cinema.orch_hit(tones, kick_root(NB - 1)), S.END, gap_ok=True)
    put("final", Y.crash(4.5, 3) * 0.5, S.END, gap_ok=True)
    put("final", stereo(Y.kick(kick_root(NB - 1), True)), S.END, gap_ok=True)
    put("fx", Y.reverse_swell(2 * B) * 0.6, S.END - 2 * B, gap_ok=True)
    ev("impact", S.END)
    ev("crash", S.END)
    ev("kick", S.END)


# ================================================================ vocals
def active_db(x, floor=25.0):
    m = np.atleast_2d(x).mean(0) if np.ndim(x) == 2 else x
    blk = int(0.4 * SR)
    nb = len(m) // blk
    if nb == 0:
        return -120.0
    p = (m[: nb * blk].reshape(nb, blk) ** 2).mean(1)
    db = 10 * np.log10(p + 1e-14)
    sel = db > db.max() - floor
    return 10 * np.log10(np.mean(p[sel]) + 1e-14)


def load_stem(name, stereo_=False):
    path = os.path.join(STEMS, f"vox_{name}.wav")
    if not os.path.exists(path):
        log("missing stem", name)
        return np.zeros((2, N)) if stereo_ else np.zeros(N)
    x, sr = sf.read(path, dtype="float64")
    if sr != SR:
        from scipy.signal import resample_poly
        x = resample_poly(x, SR, sr, axis=0)
    if stereo_:
        x = x.T if x.ndim == 2 else np.stack([x, x])
        y = np.zeros((2, N)); y[:, : min(N, x.shape[1])] = x[:, :N]
    else:
        x = x.mean(1) if x.ndim == 2 else x
        y = np.zeros(N); y[: min(N, len(x))] = x[:N]
    return y


def norm_to(x, db):
    a = active_db(x)
    return x * 10 ** ((db - a) / 20) if a > -100 else x


def vchain(x, presence=2.5, air=3.0, hp=100, c1=True, deess=True):
    """Vocal chain (doc section 1): HPF -> -2.5 dB 300 Hz -> 4:1 comp -> presence -> air
    -> de-ess -> 2:1 comp -> 10 % parallel tanh."""
    from pedalboard import HighpassFilter, PeakFilter, HighShelfFilter, Compressor
    x = norm_to(x, -20)
    chain = [HighpassFilter(hp), HighpassFilter(hp), PeakFilter(300, -2.5, 1.0)]
    if c1:
        chain.append(Compressor(-17, 4, 3, 60))
    chain += [PeakFilter(3500, presence, 0.8), HighShelfFilter(10000, air, 0.7)]
    x = pb(x, *chain)
    if deess:
        s = filt(filt(x, "hp", 5000), "lp", 9000)
        s_c = pb(s, Compressor(-30, 6, 1, 40))
        x = x - s + s_c
    x = pb(x, Compressor(-15, 2, 20, 120))
    return 0.9 * x + 0.1 * np.tanh(1.2 * x)


def section_curve(values, smooth_s=0.25, default=0.0):
    """Per-section automation curve from {section name or family: value}."""
    c = np.full(N, default, dtype=float)
    for name, a, b in song.SECTIONS:
        v = values.get(name, values.get(name.rstrip("0123456789"), default))
        if isinstance(v, tuple):
            i, j = int(t(a) * SR), int(t(b) * SR)
            c[i:j] = np.linspace(v[0], v[1], j - i)
        else:
            c[int(t(a) * SR):int(t(b) * SR)] = v
    tail = values.get("end", c[int(S.END * SR) - 1])
    c[int(S.END * SR):] = tail
    return smooth(c, smooth_s)


def vocals():
    log("vocals")
    lead = vchain(load_stem("lead"), presence=4.0, air=3.0)
    dbl = vchain(load_stem("double"), presence=1.0, air=0.0, hp=200)
    dbl = filt(dbl, "highshelf", 8000, 0.7, -3)
    octv = vchain(load_stem("oct"), presence=1.5, air=4.0, hp=200)
    octv = filt(octv, "peak", 8000, 1.0, 4)
    harm = vchain(load_stem("harm"), presence=1.0, air=3.0, hp=180)
    harm_lo = vchain(load_stem("harm_lo"), presence=0.0, air=2.0, hp=150)
    gangs = [vchain(load_stem(f"gang{g}"), presence=1.5, air=2.5, hp=200) for g in range(4)]
    whisper = vchain(load_stem("whisper"), presence=0.0, air=4.0, c1=False)
    breath = filt(norm_to(load_stem("breath"), -30), "hp", 400)
    choir = load_stem("choir", stereo_=True)
    choir = norm_to(filt(choir, "hp", 140), -24)

    # levels relative to the lead (doc: doubles -10, harmonies -12, gang -14 each)
    lead = norm_to(lead, -18)
    ref = -18
    lv = lambda x, rel: norm_to(x, ref + rel)
    dbl, octv = lv(dbl, -10), lv(octv, -15)
    harm, harm_lo = lv(harm, -12), lv(harm_lo, -13)
    gangs = [lv(g, -17) for g in gangs]
    # whispers: a texture under the verses, the main voice in the build/outro (handled by the stem's own gain)
    whisper = lv(whisper, -7)
    choir_g = section_curve({"intro": 0.8, "pre": 0.75, "chorus": 0.85, "post": 0.8, "verse": 0.6, "bridge": 1.0,
                             "build": 0.8, "chorus3": 1.0, "outro": 0.9, "end": 1.0})
    choir = choir * choir_g

    dry = stereo(lead)
    dry += stereo(dbl, -0.55) + stereo(np.roll(dbl, int(0.023 * SR)) * 0.7, 0.55)
    dry += stereo(octv, 0.3) + stereo(np.roll(octv, int(0.017 * SR)) * 0.8, -0.3)
    dry += stereo(harm, -0.65) + stereo(harm_lo, 0.65)
    for g, (x, p) in enumerate(zip(gangs, (-0.85, -0.35, 0.35, 0.85))):
        dry += stereo(x, p)
    dry += stereo(whisper, 0.0) * 0.7 + stereo(np.roll(whisper, int(0.013 * SR)) * 0.5, 0.6)
    dry += stereo(breath)
    # parallel 'smash' on the lead, blended low
    from pedalboard import Compressor
    smash = pb(lead, Compressor(-32, 10, 1, 40))
    dry += stereo(norm_to(smash, -28))

    # sends: plate on everything, dotted-quarter throws on line endings, cathedral at transitions
    wet_auto = section_curve({"intro": 1.3, "verse": 0.8, "pre": 1.0, "chorus": 0.75, "post": 1.05, "bridge": 1.8,
                              "build": 1.6, "outro": 1.8, "end": 2.0})
    duck = 1 - 0.5 * np.clip(env_follow(lead, 0.01, 0.15) / (np.percentile(np.abs(lead), 99.5) + 1e-9), 0, 1)
    plate_in = (dry.mean(0) - 0.6 * lead * 0) * wet_auto * duck
    throw = np.zeros(N)
    for ln in S.TL:
        w = ln["words"][-1]
        a, b = int(w["t"] * SR), int(min(N, (w["end"] + 0.05) * SR))
        throw[a:b] = (lead + whisper)[a:b]
    cath_in = np.zeros(N)
    for ga, gb in S.GAPS:                          # the last word before each gap rings into the silence
        a, b = int((ga - 1.0) * SR), int(ga * SR)
        cath_in[a:b] = (lead + whisper)[a:b]
    for name, a0, b0 in song.SECTIONS:
        if name.rstrip("0123456789") in ("bridge", "outro"):
            cath_in[int(t(a0) * SR):int(t(b0) * SR)] += 0.5 * lead[int(t(a0) * SR):int(t(b0) * SR)] + \
                0.5 * whisper[int(t(a0) * SR):int(t(b0) * SR)]
    sends = dict(plate=stereo(plate_in), delay=stereo(throw), cath=stereo(cath_in))
    # reverse-reverb swells into each drop: the last sung word, reversed through the cathedral
    gapfx = np.zeros((2, N))
    ir = cathedral_ir()
    for ga, gb in S.GAPS:
        a, b = int((ga - 1.2) * SR), int(ga * SR)
        seg = (lead + whisper)[a:b]
        tail = convolve(np.concatenate([seg, np.zeros(int(2.0 * SR))]), ir)
        rev = tail[:, ::-1]
        L_ = int((gb - ga + 0.6) * SR)
        rev = rev[:, -L_:] * np.linspace(0, 1, L_) ** 2
        place(gapfx, rev * 0.6, gb - L_ / SR)
    return dict(dry=dry, sends=sends, choir=choir, lead=lead, gapfx=gapfx)


# ================================================================ reverbs
_IR = {}


def room_ir():
    if "room" not in _IR:
        _IR["room"] = reverb_ir(0.8, damp=7000, predelay=0.01, seed=31)
    return _IR["room"]


def plate_ir():
    if "plate" not in _IR:
        _IR["plate"] = filt(filt(reverb_ir(2.0, damp=8000, predelay=0.03, seed=32), "hp", 300), "lp", 6000)
    return _IR["plate"]


def cathedral_ir():
    if "cath" not in _IR:
        _IR["cath"] = filt(reverb_ir(5.5, damp=4500, predelay=0.06, seed=33), "hp", 200)
    return _IR["cath"]


# ================================================================ mix
def gain_stage(targets, ref=-18.0):
    """Set every bus so its active RMS sits at targets[name] dB relative to the lead (ref)."""
    for name, rel in targets.items():
        if name in BUS:
            a = active_db(BUS[name])
            if a > -100:
                BUS[name] *= 10 ** ((ref + rel - a) / 20)


TARGETS = {  # dB relative to the lead vocal's active RMS (doc section 4)
    "kick": -5.5, "snare": -8.5, "hats": -17, "chipperc": -21, "perc": -18, "cym": -19, "taiko": -14,
    "sub": -7.5, "reese": -12, "tri": -12, "fmbass": -13, "drone": -16,
    "wall": -10.5, "wall_hi": -17, "rise": -14, "pad": -15, "pluck": -15, "strings": -17, "brass": -15,
    "arp": -15, "chiplead": -11.5, "counter": -12.5, "bells": -14,
    "fx": -17, "impact": -9, "final": -6, "gated_send": -14, "gapfx": -14,
}


def seg_process(x, a_t, b_t, fn, pre=0.3):
    """Apply fn to x[:, a:b] with a little pre-roll for filter state, in place."""
    a, b = int(max(0, a_t - pre) * SR), int(b_t * SR)
    a0 = int(a_t * SR)
    y = fn(x[:, a:b].copy(), a_t - pre)
    x[:, a0:b] = y[:, a0 - a:]
    return x


def mix_and_master():
    log("drums"); drums()
    log("bass"); bass()
    log("chords"); chords()
    log("leads"); leads()
    log("orchestra/fx"); orchestra_fx()
    log("sfx")
    BUS["sfx"] = cinema.sfx_layer(N, ev, in_gap)
    TARGETS["sfx"] = -17
    vox = vocals()
    BUS["gapfx"] = BUS.get("gapfx", np.zeros((2, N))) + vox["gapfx"] * 0
    gain_stage(TARGETS)
    # the reversed-reverb swells are staged against the gap cymbals
    BUS["gapfx"] += norm_to(vox["gapfx"], -18 - 13)

    log("bus processing")
    from pedalboard import Compressor, PeakFilter, HighShelfFilter, LowShelfFilter, HighpassFilter, Chorus, Phaser
    sc_bass = sidechain(0.78, 0.07)
    sc_pad = sidechain(0.42, 0.065)
    sc_lead = sidechain(0.2, 0.05)
    sc_rev = sidechain(0.3, 0.08)
    venv = env_follow(vox["lead"], 0.05, 0.12)
    venv = np.clip(venv / (np.percentile(venv[venv > 1e-5], 90) + 1e-9), 0, 1)

    # ---- drums: per-element EQ, parallel compression, tape-ish saturation, room
    BUS["kick"] = filt(filt(filt(BUS["kick"], "hp", 30), "peak", 55, 1.0, 3), "peak", 3000, 1.0, 2)
    if "kick_top" in BUS:      # v2: CC0 sampled click/body on top of the synth kick
        BUS["kick"] += norm_to(filt(BUS["kick_top"], "hp", 900), active_db(BUS["kick"]) - 9)
    if "snare_top" in BUS:     # v2: real snare crack under the synth snare + clap
        BUS["snare"] += norm_to(filt(BUS["snare_top"], "hp", 180), active_db(BUS["snare"]) - 4)
    BUS["kick"] = transient(BUS["kick"], 4.0)
    BUS["snare"] = transient(BUS["snare"], 3.0)
    BUS["hats"] = filt(filt(filt(BUS["hats"], "hp", 400), "peak", 3000, 1.0, -2), "highshelf", 10000, 0.7, 2)
    BUS["chipperc"] = filt(filt(BUS["chipperc"], "hp", 300), "lp", 12000)
    gated = convolve(BUS["gated_send"].mean(0), reverb_ir(0.4, damp=7000, predelay=0.005, seed=40))
    gl = int(0.25 * SR)                           # gate the tail at 250 ms
    gate_env = np.zeros(N)
    for x in S.EVENTS["snare"]:
        if kind(int(x // BAR)) == "bridge":
            a = int(x * SR); gate_env[a:a + gl] = 1
    gated = gated * smooth(gate_env, 0.005) * 1.4
    drums_dry = BUS["kick"] + BUS["snare"] + BUS["hats"] + BUS["chipperc"] + BUS["perc"] + BUS["cym"] + \
        BUS["taiko"] * 0.9 + gated
    smash = pb(drums_dry, Compressor(-30, 8, 10, 80))
    smash = norm_to(smash, active_db(drums_dry) - 6)
    drum_bus = drums_dry + 0.45 * smash
    drum_bus = os_saturate(drum_bus * 1.0, 1.3, asym=0.1, mix=0.5)
    room_send = (BUS["snare"] + BUS["perc"] * 0.6 + BUS["taiko"] * 0.8).mean(0)
    drum_room = convolve(filt(room_send, "hp", 300), room_ir()) * 0.22
    drum_bus = drum_bus + drum_room * sc_rev

    # ---- bass: mono sub below 120, distorted reese top above, sidechained hard
    sub = filt(BUS["sub"].mean(0), "lp", 120) if "sub" in BUS else np.zeros(N)
    sub = os_saturate(sub, 1.6, mix=0.3)                  # 2nd/3rd harmonics for small speakers
    sub = stereo(sub)
    top = BUS["reese"] + BUS["fmbass"] + BUS["tri"]
    top = filt(top, "peak", 320, 1.0, -2)
    top = os_saturate(top, 1.5, mix=0.6)
    top = dyn_band_duck(top, venv, 320, 0.8, 3.0)        # v2: clear the vocal's low-mids
    bass_bus = (sub + bw(top, "hp", 100)) * sc_bass + BUS["drone"] * sc_pad

    # ---- music: EQ, chorus/phaser on pads, vocal-keyed 1.5-4 kHz dip on pads/arps, sidechain
    pads = BUS["pad"]
    pads = pb(pads, HighpassFilter(200), PeakFilter(300, -3, 1.0), Chorus(0.3, 0.25, 6, 0, 0.35),
              Phaser(0.2, 0.4, 900, 0.2, 0.25))
    wall = pb(BUS["wall"] + BUS["wall_hi"] + BUS["rise"], HighpassFilter(200), PeakFilter(320, -4, 1.0),
              HighShelfFilter(8000, 2, 0.7))
    wall = filt(wall, "lp", 9500)
    wall = mono_below(wall, 300)
    arps = filt(filt(BUS["arp"] + BUS["pluck"], "hp", 150), "lp", 12000)
    chipl = filt(filt(BUS["chiplead"], "hp", 120), "lp", 12000)
    chipl = filt(chipl, "peak", 2500, 1.0, -1)
    # v2: vocal-keyed dynamic EQ, deeper presence dip plus a low-mid (200-500 Hz) carve
    pads = dyn_band_duck(dyn_band_duck(pads, venv, 2450, 0.9, 4.5), venv, 330, 0.8, 4.0)
    wall = dyn_band_duck(dyn_band_duck(wall, venv, 2450, 0.9, 4.5), venv, 330, 0.8, 4.0)
    arps = dyn_band_duck(dyn_band_duck(arps, venv, 2450, 0.9, 4.0), venv, 330, 0.8, 3.0)
    chipl = dyn_band_duck(chipl, venv, 2500, 1.0, 2.5)
    orch = filt(BUS["strings"] + BUS["brass"], "hp", 220)
    orch = dyn_band_duck(dyn_band_duck(orch, venv, 2450, 0.9, 4.0), venv, 330, 0.8, 4.0)
    bells = filt(BUS["bells"], "hp", 250)
    counter = dyn_band_duck(filt(BUS["counter"], "hp", 200), venv, 2450, 0.9, 3.0)
    music = (pads + wall) * sc_pad + (arps + chipl + counter) * sc_lead + orch * sc_pad + bells

    # ---- echoes: dotted-8th ping-pong on chip and plucks, vocal throws
    echo = pingpong((BUS["arp"] + BUS["chiplead"] * 0.6 + BUS["pluck"] * 0.8).mean(0), 0.75 * B, fb=0.38, n_taps=5, lp=4000)
    echo = filt(echo, "hp", 300) * 0.32
    vthrow = pingpong(vox["sends"]["delay"].mean(0), 1.5 * B, fb=0.4, n_taps=5, lp=4000)
    vthrow = filt(vthrow, "hp", 300) * 0.22

    # ---- reverbs: plate (vox + synths), cathedral (transitions, bridge, bells)
    cath_auto = section_curve({"intro": 1.0, "verse": 0.15, "pre": 0.3, "chorus": 0.15, "post": 0.3, "bridge": 1.0,
                               "build": 0.6, "outro": 1.0, "end": 1.2})
    plate_src = vox["sends"]["plate"].mean(0) + 0.35 * (pads + BUS["pluck"] + counter + chipl * 0.3).mean(0)
    plate = convolve(plate_src, plate_ir()) * 0.2
    cath_src = vox["sends"]["cath"].mean(0) * 0.8 + ((bells * 0.9 + pads * 0.3 + vox["choir"] * 0.5).mean(0)) * cath_auto
    cath = convolve(cath_src, cathedral_ir()) * 0.3
    choir_plate = convolve(vox["choir"].mean(0), plate_ir()) * 0.3
    rev = (plate + choir_plate) * sc_rev + cath

    fx_bus = BUS["fx"] + BUS["impact"] + BUS["sfx"]
    fx_bus = filt(fx_bus, "hp", 25)

    band = drum_bus + bass_bus + music + echo * sc_lead + fx_bus
    # ---- energy arc (arrangement does most of it; this trims each section)
    arc = section_curve(ARC, 0.15, 1.0)
    band *= arc
    rev *= np.sqrt(arc)

    # ---- transitions: HP sweeps into the drops, tape stops, a stutter, dead-stop gaps
    for name, a0, b0 in song.SECTIONS:
        fam = name.rstrip("0123456789")
        if fam in ("pre", "build") and b0 - a0 >= 4:
            ga = next((g0 for g0, g1 in S.GAPS if t(a0) <= g0 <= t(b0)), t(b0))
            a_t = t(b0 - 2)

            def hp_sweep(seg, s0, ga=ga, a_t=a_t):
                n = seg.shape[1]
                tt = s0 + np.arange(n) / SR
                p = np.clip((tt - a_t) / (ga - a_t), 0, 1)
                return sweep(seg, "hp", 20 * 30 ** (p ** 1.5), q=0.7, block=128)
            seg_process(band, a_t, ga, hp_sweep)
    for ga, gb in S.GAPS:
        dur = min(0.45, 0.6 * (gb - ga))
        band = cinema.tape_stop(band, ga, dur)
        ev("tapestop", (ga - dur, ga))
        ev("gap", (ga, gb))
    st = next(((t(b0 - 1, 3), t(b0)) for name, a0, b0 in song.SECTIONS if name == "chorus2"), None)
    if st:
        band = cinema.stutter(band, *st)
        ev("stutter", st)
    mute = np.ones(N)
    for ga, gb in S.GAPS:
        mute[int(ga * SR):int(gb * SR)] = 0
    mute = np.minimum(mute, smooth(mute, 0.004) + (mute == 1) * 0)    # 4 ms edge on the cut, hard on the drop
    band *= mute
    rev *= np.maximum(mute, 0.0)

    vgain = section_curve(VOX_ARC, 0.2, 1.0)
    vox_bus = (vox["dry"] + vox["choir"]) * vgain * 10 ** (1.0 / 20)     # v2: lead +1 dB
    vox_bus = mono_below(vox_bus, 150)
    mix = band + rev + vox_bus + vthrow + BUS["gapfx"] + BUS["final"]
    mix = mono_below(mix, 120)
    stems = dict(drums=drum_bus * arc * mute, bass=bass_bus * arc * mute, music=(music + echo) * arc * mute,
                 fx=(fx_bus * arc * mute + BUS["gapfx"] + BUS["final"]), vox=vox_bus + vthrow, reverb=rev)
    return mix, stems


ARC = {"intro": 0.9, "verse1": (0.62, 0.7), "pre1": (0.8, 0.9), "chorus": 1.0, "post": 0.94,
       "verse2": (0.7, 0.8), "pre2": (0.82, 0.95), "bridge": 0.7, "build": (0.8, 0.95), "chorus3": 1.05,
       "outro": (0.8, 0.6), "end": 1.0}
VOX_ARC = {"verse": 0.9, "bridge": 0.95, "chorus": 1.0, "chorus3": 1.03, "outro": 1.0}


# ================================================================ master
REF_EDGES = [20, 40, 60, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000]
REF_BANDS = [-14.8, -1.5, 0.0, -2.3, -3.6, -6.7, -6.2, -7.5, -8.1, -10.7, -13.1, -14.1, -15.4, -16.7]


def band_profile(x, regions):
    m = np.concatenate([np.atleast_2d(x)[:, int(a * SR):int(b * SR)].mean(0) for a, b in regions])
    n = 4096
    fr = np.lib.stride_tricks.sliding_window_view(m, n)[::2048] * np.hanning(n)
    P = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(0)
    f = np.fft.rfftfreq(n, 1 / SR)
    bands = np.array([10 * np.log10(P[(f >= lo) & (f < hi)].sum() + 1e-12)
                      for lo, hi in zip(REF_EDGES[:-1], REF_EDGES[1:])])
    return bands - bands.max()


def chorus_regions():
    return [(t(a), t(b)) for name, a, b in song.SECTIONS if name.startswith("chorus")]


def band_diff(x):
    d = band_profile(x, chorus_regions()) - np.array(REF_BANDS)
    return d - np.median(d)


def match_eq(x, strength=0.7, limit=5.0, iters=3):
    for _ in range(iters):
        d = band_diff(x)
        for (lo, hi), g in zip(zip(REF_EDGES[:-1], REF_EDGES[1:]), d):
            g = float(np.clip(-g * strength, -limit, limit))
            if abs(g) > 0.4 and lo >= 40:
                x = filt(x, "peak", np.sqrt(lo * hi), 1.4, g)
    return x


def master(mix, target=-9.5, ceiling=-1.0):
    from pedalboard import Compressor, PeakFilter, HighShelfFilter
    log("master")
    x = bw(bw(mix, "hp", 25), "hp", 25)
    x = pb(x, PeakFilter(250, -1.5, 0.7), PeakFilter(3000, 1.0, 0.8), HighShelfFilter(10000, 1.5, 0.7))
    x = match_eq(x)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.5                # pre-dynamics gain staging (-6 dBFS peaks)
    # bass-band compression keeps the kick/sub consistent
    lo, hi = lr4_split(x, 150)
    lo = pb(lo, Compressor(-14, 2, 15, 120))
    x = lo + hi
    x = pb(x, Compressor(-12, 1.8, 30, 200))               # glue
    x = mono_below(x, 120)
    m, s = ms(x)                                            # side lift above 300 Hz (+1.5 dB) and +1.5 dB air
    s = s + (10 ** (1.5 / 20) - 1) * bw(s, "hp", 300)
    s = filt(s, "highshelf", 10000, 0.7, 1.5)
    x = lr(m, s)
    # loudness: find the drive into soft clip + true-peak limiter that lands on target LUFS
    def chain(gain):
        y = os_saturate(x * gain, 1.25, mix=1.0) if True else x * gain
        y, g = tp_limiter(y, ceiling - 0.25, 0.005, 0.08)
        return y, g
    gain = 10 ** ((target - lufs_integrated(x)) / 20)
    for i in range(6):
        y, g = chain(gain)
        cur = lufs_integrated(y)
        if abs(cur - target) < 0.05:
            break
        gain *= 10 ** ((target - cur) / 20)
    tp = true_peak_db(y)
    if tp > ceiling:
        y *= 10 ** ((ceiling - 0.02 - tp) / 20)
    gr = -20 * np.log10(np.min(g) + 1e-9)
    log(f"master: limiter max GR {gr:.1f} dB, median GR {-20*np.log10(np.median(g)):.2f} dB")
    fade = np.ones(N)
    fl = int(1.0 * SR)
    fade[-fl:] = np.linspace(1, 0, fl) ** 2
    return y * fade


def lufs(x):
    """Integrated loudness (BS.1770 via pyloudnorm). Kept for src/sections.py."""
    return lufs_integrated(x)


def main():
    os.makedirs(STEMS, exist_ok=True)
    os.makedirs(AUDIO, exist_ok=True)
    mix, stems = mix_and_master()
    out = master(mix)
    wav = os.path.join(AUDIO, "silicon_shield.wav")
    sf.write(wav, tpdf_dither(out).T, SR, subtype="PCM_16")
    log("wrote", wav)
    import subprocess
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "320k",
                    os.path.join(AUDIO, "silicon_shield.mp3")], check=False)
    for name, s in stems.items():
        sf.write(os.path.join(STEMS, f"bus_{name}.wav"), (s / (np.max(np.abs(s)) + 1e-9) * 0.9).T.astype(np.float32),
                 SR, subtype="PCM_16")
    with open(os.path.join(ROOT, "build", "events.json"), "w") as f:
        json.dump(S.events_json(), f, indent=1)
    log("wrote stems + events.json")
    try:
        import analyze
        analyze.report(wav)
    except ImportError:
        pass


if __name__ == "__main__":
    main()
