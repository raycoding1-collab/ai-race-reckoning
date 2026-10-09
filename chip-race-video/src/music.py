"""SILICON SHIELD — instrumental + mix.

Sound concept: it is a song about *chips*, so the hook layer is real
chiptune (NES-style pulse/triangle/LFSR-noise voices) sitting inside a
modern electro-pop production (punchy kick, clap stack, sidechained
supersaws, sub + reese bass, risers and impacts).
"""
import os, sys, json
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import song
from dsp import *  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEMS = os.path.join(ROOT, "build", "stems")
B, BAR = song.BEAT, song.BAR
TOTAL = song.TOTAL_BARS * BAR + song.TAIL
N = int(TOTAL * SR)


def bar_t(bar, beat=0.0):
    return bar * BAR + beat * B


def buf():
    return np.zeros((2, N))


VOICING = {  # written MIDI, close voicings with smooth voice-leading
    ("F", "m"): [53, 56, 60], ("Db", ""): [53, 56, 61], ("Ab", ""): [51, 56, 60],
    ("Eb", ""): [51, 55, 58], ("Bb", "m"): [53, 58, 61], ("C", ""): [52, 55, 60],
}
ROOT_MIDI = {"F": 29, "Ab": 32, "Bb": 34, "C": 36, "Db": 37, "Eb": 39}


def section_of(bar):
    for name, a, b in song.SECTIONS:
        if a <= bar < b:
            return name
    return "end"


# =============================================================== drums
def kick_one(vel=1.0, long=False):
    n = int((0.55 if long else 0.38) * SR)
    t = np.arange(n) / SR
    f = 46 + 150 * np.exp(-t / 0.028) + 40 * np.exp(-t / 0.004)
    body = sine(f, n) * (np.exp(-t / (0.42 if long else 0.26)) * np.minimum(1, t / 0.0015))
    click = filt(noise(n), "hp", 2500) * np.exp(-t / 0.003) * 0.35
    k = softclip(1.6 * body + click, 1.8)
    return vel * k


def clap_one(vel=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    nz = filt(filt(noise(n), "bp", 1500, 0.8), "hp", 600)
    env = np.zeros(n)
    for k, d in enumerate([0, 0.009, 0.018, 0.026]):
        a = int(d * SR)
        env[a:] += np.exp(-(t[: n - a]) / (0.006 if k < 3 else 0.11)) * (0.8 if k < 3 else 1.0)
    body = sine(185 * (1 + 0.5 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.05) * 0.5
    snr = filt(noise(n), "hp", 3000) * np.exp(-t / 0.09) * 0.35
    return vel * softclip(nz * env + body + snr, 1.3)


def hat_one(vel=1.0, open_=False):
    n = int((0.32 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    # 808-style metallic: six detuned square waves
    m = sum(pulse(f, n) for f in [205.3, 304.4, 369.6, 522.7, 540.0, 800.0])
    m = filt(filt(m, "bp", 9500, 0.9), "hp", 7000)
    nz = filt(noise(n), "hp", 9000)
    env = np.exp(-t / (0.11 if open_ else 0.018))
    return vel * (0.6 * m + 0.4 * nz) * env


def crash_one(vel=1.0, reverse=False, dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    m = sum(pulse(f, n) for f in [341.0, 467.0, 611.0, 873.0, 1103.0])
    x = filt(0.5 * filt(m, "hp", 4000) + filt(noise(n), "hp", 3500), "lp", 14000)
    x *= np.exp(-t / 0.9) * np.minimum(1, t / 0.002)
    if reverse:
        x = x[::-1] * np.linspace(0, 1, n) ** 2
    return vel * stereo(x * 0.7, -0.2) + vel * stereo(np.roll(x, 300) * 0.7, 0.2)


def chip_noise_hit(vel=1.0, short=True, dur=0.06, rate=30000):
    n = int(dur * SR)
    return vel * filt(lfsr_noise(n, rate, short=short), "hp", 500) * expdecay(n, dur / 3)


def drums():
    kick, clap, hats, perc, cym = buf(), buf(), buf(), buf(), buf()
    kick_times = []
    K, Kl = kick_one(), kick_one(long=True)
    C = clap_one()
    hat_rng = np.random.default_rng(11)
    for bar in range(song.TOTAL_BARS):
        sec = section_of(bar)
        rel = bar - dict((s, a) for s, a, _ in song.SECTIONS)[sec]
        if sec == "intro":
            for e in range(8):  # NES noise-channel hats
                place(perc, stereo(chip_noise_hit(0.22 if e % 2 else 0.32), 0.25 * (-1) ** e), bar_t(bar, e / 2))
            if bar == 1:
                place(perc, stereo(chip_noise_hit(0.5, short=False, dur=0.5, rate=9000), 0), bar_t(bar, 3))
        elif sec == "verse":
            if rel < 4:
                hits = [0, 2.5] if rel % 2 == 0 else [0, 1.75, 2.5]
                for b in hits:
                    place(kick, stereo(K * 0.9), bar_t(bar, b)); kick_times.append(bar_t(bar, b))
                place(clap, stereo(C * 0.8), bar_t(bar, 2))
                steps = [i / 2 for i in range(8)]
            else:
                for b in range(4):
                    place(kick, stereo(K), bar_t(bar, b)); kick_times.append(bar_t(bar, b))
                for b in (1, 3):
                    place(clap, stereo(C * 0.85), bar_t(bar, b))
                steps = [i / 4 for i in range(16)]
            for s in steps:
                v = (0.55 if (s * 2) % 2 == 1 else 0.35) * hat_rng.uniform(0.85, 1.05)
                place(hats, stereo(hat_one(v), 0.3), bar_t(bar, s) + hat_rng.uniform(0, 0.004))
            # chip noise ghost notes keep the 8-bit identity under the modern kit
            for s in (0.75, 2.75, 3.25):
                place(perc, stereo(chip_noise_hit(0.12), -0.4), bar_t(bar, s))
        elif sec == "build":
            if rel == 0:
                for b in range(4):
                    place(kick, stereo(K), bar_t(bar, b)); kick_times.append(bar_t(bar, b))
                roll = [i / 2 for i in range(8)]
            else:
                for b in (0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75):
                    place(kick, stereo(K * 0.85), bar_t(bar, b)); kick_times.append(bar_t(bar, b))
                roll = [i / 4 for i in range(8)] + [2 + i / 8 for i in range(8)]
            for i, s in enumerate(roll):
                if bar_t(bar, s) >= bar_t(11, 3):
                    continue  # the drop gap: everything stops on beat 3 of bar 11
                p = (bar - 10) * 4 + s
                v = 0.35 + 0.65 * (p / 7)
                place(clap, stereo(clap_one(v) * 0.7), bar_t(bar, s))
            for s in [i / 4 for i in range(16)]:
                if bar_t(bar, s) < bar_t(11, 3):
                    place(hats, stereo(hat_one(0.35), 0.3), bar_t(bar, s))
        elif sec == "chorus":
            for b in range(4):
                kk = Kl if (b == 0 and rel % 4 == 0) else K
                place(kick, stereo(kk), bar_t(bar, b)); kick_times.append(bar_t(bar, b))
            for b in (1, 3):
                place(clap, stereo(C), bar_t(bar, b))
            for s in [i / 4 for i in range(16)]:
                if s % 1 == 0.5:
                    place(hats, stereo(hat_one(0.42, open_=True), -0.25), bar_t(bar, s))
                else:
                    v = (0.5 if (s * 4) % 2 == 1 else 0.3) * hat_rng.uniform(0.85, 1.05)
                    place(hats, stereo(hat_one(v), 0.3), bar_t(bar, s) + hat_rng.uniform(0, 0.004))
            for s in (0.75, 1.75, 2.75, 3.75):
                place(perc, stereo(chip_noise_hit(0.16, dur=0.04), 0.5 * (-1) ** int(s)), bar_t(bar, s))
            if rel in (3, 7):  # fills into the next phrase
                for s in (3.25, 3.5, 3.75, 3.875):
                    place(clap, stereo(clap_one(0.55)), bar_t(bar, s))
        elif sec == "tag":
            if rel == 0:
                place(kick, stereo(Kl * 1.1), bar_t(bar, 0)); kick_times.append(bar_t(bar, 0))
    for bar in (12, 16):
        place(cym, crash_one(0.55), bar_t(bar))
    place(cym, crash_one(0.6, dur=4.0), bar_t(20))
    place(cym, crash_one(0.7, dur=song.TAIL), bar_t(22))
    place(kick, stereo(kick_one(1.1, long=True)), bar_t(22))
    place(cym, crash_one(0.55, reverse=True, dur=bar_t(12) - bar_t(11, 3)), bar_t(11, 3))
    return dict(kick=kick, clap=clap, hats=hats, perc=perc, cym=cym), kick_times


def sidechain_curve(kick_times, depth=0.8, release=0.16):
    env = np.ones(N)
    shape_n = int(0.45 * SR)
    t = np.arange(shape_n) / SR
    duck = 1 - depth * np.exp(-((t / release) ** 1.6))
    duck = np.minimum(duck, 1 - depth * np.clip(1 - t / 0.004, 0, 1) + 0)  # fast attack
    for kt in kick_times:
        a = int(kt * SR)
        b = min(N, a + shape_n)
        env[a:b] = np.minimum(env[a:b], duck[: b - a])
    return env


# =============================================================== tonal parts
def note_env(n, a=0.004, tau=0.25, sus=0.0, gate=None, rel=0.05):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * (sus + (1 - sus) * np.exp(-t / tau))
    if gate is not None:
        g = int(gate * SR)
        if g < n:
            e[g:] *= np.exp(-(t[g:] - t[g]) / rel)
    return e


def chip_arp():
    """Fast NES arpeggios through the chord tones, 25% pulse, with echo."""
    out = buf()
    for bar in range(0, 12):
        root, q = song.CHORDS[bar]
        tones = VOICING[(root, q)]
        seq = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[1] + 24,
               tones[2] + 12, tones[0] + 24, tones[1] + 12, tones[2] + 24]
        sec = section_of(bar)
        for s in range(16):
            t0 = bar_t(bar, s / 4)
            if sec == "build" and t0 >= bar_t(11, 3):
                continue
            m = seq[s % 8]
            dur = B / 4
            n = int(dur * 1.6 * SR)
            duty = 0.25 if s % 4 else 0.125
            y = pulse(hz(m), n, duty) * note_env(n, tau=0.07, gate=dur * 0.9, rel=0.02)
            g = 0.16
            if sec == "intro":
                g *= 0.55 + 0.45 * (bar * 16 + s) / 32
            place(out, stereo(y * g, 0.35 if s % 2 else -0.35), t0)
    # intro: low-pass opening, like a console booting
    curve = np.full(N, 18000.0)
    a, b = 0, int(bar_t(2) * SR)
    curve[a:b] = np.geomspace(500, 12000, b - a)
    out = sweep(out, "lp", curve, q=1.2)
    out += 0.55 * np.roll(pingpong(out, 3 * B / 4, fb=0.35, n_taps=4, lp=3500), 0, axis=1)
    return out


def chip_lead():
    """Chorus: 12.5%-pulse lead doubling the vocal hook at the written octave,
    plus answer phrases in the vocal gaps; tag: 'game over' descent."""
    out = buf()
    rng = np.random.default_rng(5)
    for line in song.timeline():
        if not line["hook"]:
            continue
        for w in line["words"]:
            for nt in w["notes"]:
                n = int((nt["dur"] + 0.08) * SR)
                t = np.arange(n) / SR
                vib = 0.18 * np.clip((t - 0.18) / 0.2, 0, 1) * np.sin(2 * np.pi * 6.0 * t)
                bend = -0.6 * np.exp(-t / 0.025)
                f = hz(nt["midi"] + vib + bend)
                duty = 0.125 + 0.1 * (0.5 + 0.5 * np.sin(2 * np.pi * 1.5 * t))
                y = pulse(f, n, duty) * note_env(n, tau=0.6, sus=0.55, gate=nt["dur"], rel=0.04)
                place(out, stereo(y * 0.11, 0.0), nt["t"])
        # answer riff in the 1.5-beat hole after each hook line
        root, q = song.CHORDS[line["bar"] + 1]
        tones = VOICING[(root, q)]
        riff = [tones[2] + 24, tones[1] + 24, tones[0] + 24, tones[2] + 12, tones[1] + 24, tones[0] + 36]
        for k, m in enumerate(riff):
            t0 = bar_t(line["bar"], 6.5 + k * 0.25)
            n = int(B / 4 * SR)
            y = pulse(hz(m), n, 0.25) * note_env(n, tau=0.05)
            place(out, stereo(y * 0.09, 0.4 if k % 2 else -0.4), t0)
    # tag: descending 'game over' arpeggio + pitch dive
    t0 = bar_t(21)
    for k, m in enumerate([77, 72, 68, 65, 60, 56, 53, 48]):
        n = int(B / 2 * SR)
        y = pulse(hz(m), n, 0.5) * note_env(n, tau=0.12)
        place(out, stereo(y * 0.1), t0 + k * B / 4)
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    dive = pulse(hz(48 - 30 * t), n, 0.5) * np.exp(-t / 0.4) * 0.08
    place(out, stereo(bitcrush(dive, 5, 3)), t0 + 2 * B)
    out += 0.4 * pingpong(out, 3 * B / 4, fb=0.4, n_taps=5, lp=4000)
    return out


def tri_bass():
    """Verse: NES triangle bass in 8ths with octave pops."""
    out = buf()
    for bar in range(2, 12):
        root, _ = song.CHORDS[bar]
        r = ROOT_MIDI[root] + 12
        for e in range(8):
            t0 = bar_t(bar, e / 2)
            if t0 >= bar_t(11, 3):
                continue
            m = r + (12 if e in (3, 7) else 0)
            n = int(B / 2 * SR)
            y = nes_triangle(hz(m), n) * note_env(n, tau=0.3, sus=0.6, gate=B / 2 * 0.85, rel=0.01)
            place(out, stereo(y * 0.32), t0)
    return out


def sub_and_reese():
    sub, reese = buf(), buf()
    for bar in range(2, 22):
        sec = section_of(bar)
        root, _ = song.CHORDS[bar]
        r = ROOT_MIDI[root]
        if sec in ("verse", "build"):
            t0, dur = bar_t(bar), BAR
            if sec == "build" and bar == 11:
                dur = 3 * B
            n = int(dur * SR)
            y = sine(hz(r), n) * note_env(n, a=0.01, tau=10, sus=1, gate=dur - 0.02, rel=0.01)
            place(sub, stereo(y * (0.35 if sec == "verse" else 0.45)), t0)
        elif sec == "chorus":
            for e in range(8):  # 8th-note pumping sub + reese
                t0 = bar_t(bar, e / 2)
                n = int(B / 2 * SR)
                t = np.arange(n) / SR
                y = sine(hz(r) * (1 + 0.02 * np.exp(-t / 0.01)), n) * note_env(n, a=0.003, tau=10, sus=1,
                                                                                 gate=B / 2 * 0.92, rel=0.008)
                place(sub, stereo(y * 0.55), t0)
            n = int(BAR * SR)
            t = np.arange(n) / SR
            rs = saw(hz(r + 12) * 1.004, n) + saw(hz(r + 12) * 0.996, n) + 0.5 * pulse(hz(r + 24), n, 0.3)
            wob = 380 + 1700 * (0.5 + 0.5 * np.sin(2 * np.pi * (2 / B) * t - np.pi / 2)) ** 2
            rs = sweep(rs, "lp", wob, q=2.2)
            rs = filt(rs, "hp", 90)
            place(reese, stereo(softclip(rs * 1.3, 2.0) * 0.17), bar_t(bar))
        elif sec == "tag" and bar == 20:
            n = int(3.5 * SR)
            t = np.arange(n) / SR
            boom = sine(hz(r) * (1.6 * np.exp(-t / 0.08) + 1), n) * np.exp(-t / 1.4)
            place(sub, stereo(boom * 0.7), bar_t(bar))
    # widen reese slightly
    reese[0] = np.roll(reese[0], 90)
    return sub, reese


def pads():
    """Supersaw chords: soft filtered pad in verse, wide bright stabs in chorus."""
    verse, chorus = buf(), buf()
    for bar in range(0, 22):
        sec = section_of(bar)
        ch = song.CHORDS[bar]
        tones = VOICING[ch]
        if sec in ("intro", "verse", "build", "tag"):
            dur = BAR if not (sec == "build" and bar == 11) else 3 * B
            if sec == "tag":
                dur = BAR * (2 if bar == 20 else 0)
                if dur == 0:
                    continue
            n = int((dur + 0.3) * SR)
            x = sum(supersaw(m, n, voices=5, detune=0.12, seed=bar * 7 + k) for k, m in enumerate(tones + [tones[0] + 12]))
            e = note_env(n, a=0.08, tau=10, sus=1, gate=dur, rel=0.25)
            g = 0.10 if sec != "build" else 0.13
            place(verse, x * e * g, bar_t(bar))
        elif sec == "chorus":
            n = int((BAR + 0.2) * SR)
            x = sum(supersaw(m, n, voices=7, detune=0.22, seed=bar * 11 + k)
                    for k, m in enumerate(tones + [tones[0] + 12, tones[2] + 12]))
            x += 0.6 * supersaw(ROOT_MIDI[ch[0]] + 24, n, voices=5, detune=0.15, seed=bar)
            e = note_env(n, a=0.006, tau=10, sus=1, gate=BAR, rel=0.12)
            place(chorus, x * e * 0.12, bar_t(bar))
    # verse pad: dark, slowly opening; build: opening fast
    t = np.arange(N) / SR
    cut = np.full(N, 1800.0)
    vb, bb, cb = int(bar_t(2) * SR), int(bar_t(10) * SR), int(bar_t(11, 3) * SR)
    cut[:vb] = 900
    cut[vb:bb] = np.linspace(1100, 2600, bb - vb)
    cut[bb:cb] = np.geomspace(2600, 12000, cb - bb)
    verse = sweep(verse, "lp", cut, q=0.9)
    chorus = filt(chorus, "hp", 180)
    chorus = filt(chorus, "lp", 11000)
    return verse, chorus


def fx():
    out = buf()
    # intro riser (noise + rising chip blip), into the verse
    n = int(bar_t(2) * SR)
    t = np.arange(n) / SR
    r = sweep(noise(n), "bp", np.geomspace(300, 6000, n), q=2.0) * (t / t[-1]) ** 2 * 0.12
    place(out, stereo(r), 0)
    # build riser: 2 bars, noise sweep + rising saw stack
    a, b = bar_t(10), bar_t(11, 3)
    n = int((b - a) * SR)
    t = np.arange(n) / SR
    p = t / t[-1]
    nz = sweep(np.stack([noise(n), noise(n)]), "bp", 400 * 30 ** p, q=1.5) * p ** 1.5 * 0.3
    rise = saw(hz(41 + 24 * p ** 1.3), n) + saw(hz(53 + 24 * p ** 1.3) * 1.005, n)
    rise = filt(rise, "hp", 200) * p ** 2 * 0.05
    place(out, nz + stereo(rise), a)
    # impact on the chorus downbeat
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    imp = sine(hz(29) * (1 + 2.5 * np.exp(-t / 0.05)), n) * np.exp(-t / 0.9) * 0.6
    imp += filt(noise(n), "lp", 3000) * np.exp(-t / 0.25) * 0.25
    place(out, stereo(imp), bar_t(12))
    # chip 'power-up' sweep right before the drop gap ends (classic coin pickup)
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    coin = pulse(np.where(t < 0.06, hz(83), hz(88)), n, 0.5) * np.exp(-t / 0.12) * 0.06
    place(out, stereo(coin), bar_t(12) - 0.24)
    # downlifter into the tag
    n = int(BAR * SR)
    t = np.arange(n) / SR
    p = t / t[-1]
    dl = sweep(noise(n), "bp", 8000 * 0.05 ** p, q=1.2) * (1 - p) ** 1.5 * 0.25
    place(out, stereo(dl), bar_t(20))
    # final button: sub boom + chord stab ringing into the tail
    n = int(song.TAIL * SR)
    t = np.arange(n) / SR
    boom = sine(hz(29) * (1 + 1.8 * np.exp(-t / 0.06)), n) * np.exp(-t / 1.1) * 0.55
    stab = sum(supersaw(m, n, voices=7, detune=0.2, seed=90 + k) for k, m in enumerate([53, 56, 60, 65, 72]))
    stab = filt(stab * np.exp(-t / 0.9) * 0.16, "lp", 6000)
    place(out, stereo(boom) + stab, bar_t(22))
    return out


# =============================================================== vocals
def vocal_bus():
    def load(name):
        x, _ = sf.read(os.path.join(STEMS, f"vox_{name}.wav"))
        y = np.zeros(N); y[: min(N, len(x))] = x[:N]
        return y

    def chain(x, presence=3.0, air=3.0, comp=True):
        x = filt(x, "hp", 110)
        x = filt(x, "peak", 320, 1.0, -2.5)
        x = filt(x, "peak", 3200, 0.8, presence)
        x = filt(x, "highshelf", 9000, 0.7, air)
        if comp:
            x = compress(x, thresh_db=-20, ratio=4, attack=0.003, release=0.06, makeup_db=6)
        # de-ess: compress only the 5-9 kHz band
        s = filt(filt(x, "hp", 5000), "lp", 9500)
        s_c = compress(s, thresh_db=-28, ratio=6, attack=0.001, release=0.04)
        x = x - s + s_c
        return softclip(x * 1.2, 1.2)

    lead = chain(load("lead"))
    dbl = chain(load("double"), presence=1.5)
    octv = chain(load("oct"), presence=2.0, air=4.0)
    harm = chain(load("harm"), presence=1.0, air=4.0)
    harm_lo = chain(load("harm_lo"), presence=0.0, air=2.0)

    dry = stereo(lead * 0.9)
    dry += np.stack([dbl * 0.32, np.roll(dbl, int(0.011 * SR)) * 0.30])
    dry += np.stack([octv * 0.26, np.roll(octv, int(0.017 * SR)) * 0.26])
    dry += stereo(harm * 0.26, -0.7) + stereo(harm_lo * 0.22, 0.7)

    # throw delay: only the last word of each line
    throw = np.zeros(N)
    for line in song.timeline():
        w = line["words"][-1]
        a, b = int(w["t"] * SR), int(min(N, (w["end"] + 0.05) * SR))
        throw[a:b] = lead[a:b]
    dly = pingpong(throw, 3 * B / 4, fb=0.42, n_taps=5, lp=4200) * 0.35
    plate = convolve(filt(dry.mean(0), "hp", 300), reverb_ir(2.2, damp=7000, predelay=0.03, seed=9)) * 0.16
    return dry + dly + plate, lead


def vocoder(mod, carrier, n_bands=28, fmin=120, fmax=9000):
    """Channel vocoder: imposes the vocal's band envelopes on a synth carrier."""
    from scipy.signal import stft, istft
    nper = 1024
    f, _, M = stft(mod, SR, nperseg=nper)
    _, _, Cl = stft(carrier[0], SR, nperseg=nper)
    _, _, Cr = stft(carrier[1], SR, nperseg=nper)
    edges = np.geomspace(fmin, fmax, n_bands + 1)
    gain_m = np.zeros(M.shape)
    for lo, hi in zip(edges[:-1], edges[1:]):
        band = (f >= lo) & (f < hi)
        if not band.any():
            continue
        me = np.sqrt(np.mean(np.abs(M[band]) ** 2, axis=0))
        ce = np.sqrt(np.mean(np.abs(Cl[band]) ** 2 + np.abs(Cr[band]) ** 2, axis=0) / 2) + 1e-6
        gain_m[band] = me / ce
    # keep the vocal's own sibilance above fmax for intelligibility
    hi = f >= fmax
    _, yl = istft(Cl * gain_m, SR, nperseg=nper)
    _, yr = istft(Cr * gain_m, SR, nperseg=nper)
    _, ys = istft(M * hi[:, None], SR, nperseg=nper)
    fit = lambda y: np.pad(y, (0, max(0, N - len(y))))[:N]
    out = np.stack([fit(yl), fit(yr)]) + 0.6 * stereo(fit(ys))
    return out


def vocoder_layer(lead):
    """Robot choir in the chorus: vocal envelopes on a supersaw chord carrier."""
    car = buf()
    for bar in range(12, 21):
        tones = VOICING[song.CHORDS[bar]]
        n = int((BAR + 0.05) * SR)
        x = sum(supersaw(m + 12, n, voices=5, detune=0.1, seed=bar + k) for k, m in enumerate(tones))
        x += 0.5 * np.stack([noise(n), noise(n)]) * 0.15  # consonant energy
        place(car, x, bar_t(bar))
    mask = np.zeros(N)
    mask[int(bar_t(12) * SR):int(bar_t(21) * SR)] = 1
    v = vocoder(lead * mask, car)
    v = filt(v, "hp", 200)
    return v / (np.max(np.abs(v)) + 1e-9) * 0.5


# =============================================================== mix
def lufs(x):
    """Approximate BS.1770 integrated loudness (K-weighting, abs + relative gate)."""
    k = filt(filt(x, "highshelf", 1500, 0.7, 4.0), "hp", 38)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([np.sum(np.mean(k[:, i:i + blk] ** 2, axis=1)) for i in range(0, k.shape[1] - blk, hop)])
    lk = -0.691 + 10 * np.log10(z + 1e-12)
    z = z[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(z)) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return -0.691 + 10 * np.log10(np.mean(z))


# Long-term average spectrum of the reference track (relative dB per band),
# measured once with src/compare.py; used as a tonal-balance target.
REF_EDGES = [20, 40, 60, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000]
REF_BANDS = [-14.8, -1.5, 0.0, -2.3, -3.6, -6.7, -6.2, -7.5, -8.1, -10.7, -13.1, -14.1, -15.4, -16.7]


def band_profile(x, a, b):
    m = x[:, int(a * SR):int(b * SR)].mean(0)
    n = 4096
    fr = np.lib.stride_tricks.sliding_window_view(m, n)[::2048] * np.hanning(n)
    P = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(0)
    f = np.fft.rfftfreq(n, 1 / SR)
    bands = np.array([10 * np.log10(P[(f >= lo) & (f < hi)].sum() + 1e-12)
                      for lo, hi in zip(REF_EDGES[:-1], REF_EDGES[1:])])
    return bands - bands.max()


def match_eq(mix, strength=0.6, limit=6.0):
    mine = band_profile(mix, bar_t(12), bar_t(20))
    diff = np.array(REF_BANDS) - mine
    diff -= np.median(diff)
    for (lo, hi), g in zip(zip(REF_EDGES[:-1], REF_EDGES[1:]), diff):
        g = float(np.clip(g * strength, -limit, limit))
        if abs(g) > 0.3 and lo >= 30:
            mix = filt(mix, "peak", np.sqrt(lo * hi), 1.2, g)
    return mix


def main():
    os.makedirs(STEMS, exist_ok=True)
    d, kick_times = drums()
    sc = sidechain_curve(kick_times, depth=0.75)
    sc_soft = sidechain_curve(kick_times, depth=0.45)
    arp = chip_arp()
    lead_chip = chip_lead()
    tri = tri_bass()
    sub, reese = sub_and_reese()
    pad_v, pad_c = pads()
    efx = fx()
    vox, lead_dry = vocal_bus()
    voc = vocoder_layer(lead_dry)

    drum_bus = d["kick"] * 0.85 + d["clap"] * 0.75 + d["hats"] * 0.6 + d["perc"] * 0.6 + d["cym"] * 0.32
    drum_room = convolve(filt((d["clap"] * 0.55 + d["perc"] * 0.3).mean(0), "hp", 400),
                         reverb_ir(1.4, damp=6000, seed=4)) * 0.12
    drum_bus = compress(drum_bus + drum_room, thresh_db=-14, ratio=3, attack=0.01, release=0.1, makeup_db=2)

    music = (arp * 1.0 + lead_chip * 1.0 + tri * 1.0) * sc_soft
    music += (sub * 0.6 + reese * 1.5) * sc
    music += (pad_v * 1.3 + pad_c * 1.35) * sc
    music += voc * 0.2 * sc_soft
    music_rev = convolve(filt((arp * 0.5 + pad_v + lead_chip * 0.6).mean(0), "hp", 250),
                         reverb_ir(2.8, damp=5000, seed=8)) * 0.18
    # duck the music a little under the vocal (keeps words intelligible)
    from scipy.ndimage import uniform_filter1d
    venv = uniform_filter1d(np.abs(lead_dry), int(0.05 * SR))
    vduck = 1 - 0.25 * np.clip(venv / (np.percentile(venv[venv > 1e-4], 90) + 1e-9), 0, 1)
    music = music * vduck + music_rev

    mix = drum_bus + music + vox * 1.6 + efx
    # silence everything in the drop gap except the vocal tail and the reverse cymbal/coin
    gap_a, gap_b = int(bar_t(11, 3) * SR), int(bar_t(12) * SR)
    keep = vox[:, gap_a:gap_b] * 1.6 + d["cym"][:, gap_a:gap_b] * 0.28 + efx[:, gap_a:gap_b]
    mix[:, gap_a:gap_b] = keep

    # master: glue, tilt EQ, soft clip, limit, normalise loudness
    mix = filt(mix, "hp", 28)
    mix = compress(mix, thresh_db=-16, ratio=2, attack=0.02, release=0.2, makeup_db=2, knee=8)
    mix = match_eq(mix, strength=0.6)
    mix = mix / np.max(np.abs(mix)) * 0.9
    target = -10.0
    for _ in range(4):
        cur = lufs(np.clip(softclip(mix * 1.0, 1.0), -1, 1))
        mix *= 10 ** ((target - cur) / 20)
    mix = softclip(mix, 1.1)
    mix = limiter(mix, ceiling_db=-1.0)
    fade = np.ones(N)
    fl = int(1.5 * SR)
    fade[-fl:] = np.linspace(1, 0, fl) ** 2
    mix *= fade
    print("loudness ~", round(lufs(mix), 1), "LUFS; peak", round(20 * np.log10(np.max(np.abs(mix))), 2), "dBFS")
    sf.write(os.path.join(ROOT, "audio", "silicon_shield.wav"), mix.T, SR, subtype="PCM_16")
    # stems for analysis
    for name, s in [("drums", drum_bus), ("music", music), ("vox_bus", vox)]:
        sf.write(os.path.join(STEMS, f"bus_{name}.wav"), (s / (np.max(np.abs(s)) + 1e-9) * 0.9).T, SR)


if __name__ == "__main__":
    main()
