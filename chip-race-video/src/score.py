"""The score layer: everything the arrangement derives from song.py.

Section lookup, voice-led chord voicings for every chord in song.CHORDS,
bass roots, the hook motif, countermelodies, drop gaps and the event log
that music.py writes to build/events.json for the visuals.
"""
import numpy as np
import song

B, BAR, SR = song.BEAT, song.BAR, song.SR
NB = song.TOTAL_BARS
END = NB * BAR                      # start of the final hit / tail
TOTAL = END + song.TAIL
N = int(TOTAL * SR)

PC = song.NOTE_IDX


def t(bar, beat=0.0):
    return bar * BAR + beat * B


# ---------------------------------------------------------------- sections
SEC_START = {name: a for name, a, _ in song.SECTIONS}
SEC_END = {name: b for name, _, b in song.SECTIONS}


def sec(bar):
    """(section name, bar index inside the section, section length)."""
    for name, a, b in song.SECTIONS:
        if a <= bar < b:
            return name, bar - a, b - a
    return "end", bar - NB, 1


def kind(bar):
    """Section family: intro verse pre chorus post bridge build outro."""
    name = sec(bar)[0]
    return name.rstrip("0123456789")


def bars_of(*names):
    out = []
    for name, a, b in song.SECTIONS:
        if name in names or name.rstrip("0123456789") in names:
            out += list(range(a, b))
    return out


# ---------------------------------------------------------------- gaps
GAPS = [(t(bar, beat), t(bar + 1)) for bar, beat in song.DROP_GAPS]


def in_gap(x):
    return any(a - 1e-6 <= x < b - 1e-6 for a, b in GAPS)


def gap_cut(bar):
    """Time at which this bar's material must stop (gap start) or None."""
    for gb, beat in song.DROP_GAPS:
        if gb == bar:
            return t(bar, beat)
    return None


# ---------------------------------------------------------------- harmony
QUAL = {"m": (0, 3, 7), "": (0, 4, 7)}
KEY_ROOT = {}                                      # bar -> tonic pitch class (F, or G after the lift)
for _b in range(NB):
    KEY_ROOT[_b] = PC["G"] if _b >= SEC_START["build"] else PC["F"]


def chord_pcs(bar):
    root, q = song.CHORDS[min(bar, NB - 1)]
    r = PC[root]
    return [(r + i) % 12 for i in QUAL[q]]


def root_pc(bar):
    return PC[song.CHORDS[min(bar, NB - 1)][0]]


def bass_midi(bar):
    """Bass root in the E1..Eb2 octave (F1 = 29 = 43.65 Hz)."""
    r = root_pc(bar)
    m = 24 + r
    return m + 12 if m < 28 else m


def _voicings(pcs, lo=50, hi=70):
    """All close-position triads (span <= an octave) with notes in [lo, hi]."""
    out = set()
    for base in range(lo, hi):
        if base % 12 not in pcs:
            continue
        rest = [p for p in pcs if p != base % 12]
        for order in (rest, rest[::-1]):
            v, cur = [base], base
            for p in order:
                cur += (p - cur) % 12 or 12
                v.append(cur)
            if v[-1] - v[0] <= 12 and v[-1] <= hi:
                out.add(tuple(sorted(v)))
    return sorted(out)


def _voice_lead():
    prev = (53, 56, 60)            # Fm, matching the choir stem's voicing
    res = []
    for bar in range(NB):
        pcs = chord_pcs(bar)
        cands = _voicings(pcs)
        centre = 58.5 + (1.5 if KEY_ROOT[bar] == PC["G"] else 0)

        def cost(v):
            move = sum(abs(a - b) for a, b in zip(v, prev))
            return move + 0.35 * abs(np.mean(v) - centre)
        best = min(cands, key=cost)
        res.append(list(best))
        prev = best
    return res


VOICES = _voice_lead()           # three-note voice-led triads, one per bar


def voicing(bar):
    return VOICES[min(bar, NB - 1)]


def wall_voicing(bar):
    """Chorus 'wall': the root below the triad, the triad, and its top two notes up an octave."""
    v = voicing(bar)
    r = v[0] - 1
    while r % 12 != root_pc(bar):
        r -= 1
    return [r] + v + [v[1] + 12, v[2] + 12]


def scale(bar):
    """Natural-minor scale pitch classes of the key at this bar."""
    k = KEY_ROOT[bar]
    return [(k + i) % 12 for i in (0, 2, 3, 5, 7, 8, 10)]


def diatonic(m, steps, bar):
    sc = sorted(scale(bar))
    pc = m % 12
    if pc not in sc:
        return m + steps
    i = sc.index(pc)
    j = i + steps
    return m - pc + sc[j % 7] + 12 * (j // 7)


def chord_tones_in(bar, lo, hi):
    pcs = chord_pcs(bar)
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


# ---------------------------------------------------------------- melody
TL = song.timeline()


def notes_of(pred):
    out = []
    for ln in TL:
        if pred(ln):
            for w in ln["words"]:
                out += [dict(n, line=ln) for n in w["notes"]]
    return out


HOOK_LINE = song.CHORUS[0][1]                       # "Every wafer is a weapon now"
HOOK = []                                            # [(midi, beat, dur)] written register
for _disp, _tts, _notes in HOOK_LINE:
    HOOK += song.parse_notes(_notes)


def hook_at(bar, beat, transpose=0, octave=0, speed=1.0, diat=0):
    """The hook motif placed at (bar, beat): list of (time, dur, midi)."""
    out = []
    for m, b, d in HOOK:
        mm = diatonic(m, diat, bar) if diat else m
        out.append((t(bar, beat + b * speed), d * speed * B, mm + transpose + 12 * octave))
    return out


def vocal_activity(pad=0.06):
    """Per-sample 0/1 mask of when any sung word sounds (for 'move when the vocal holds')."""
    m = np.zeros(N, dtype=bool)
    for ln in TL:
        for w in ln["words"]:
            a, b = int((w["t"] - pad) * SR), int((w["end"] + pad) * SR)
            m[max(0, a):b] = True
    return m


# Chorus countermelody: moves in the vocal's long holds (beats 4-8 of each
# two-bar line), contrary to the vocal, a register above it; rests or holds
# softly while the vocal is busy. (beat, dur, note, vel) per chorus line.
COUNTER = [
    [(0, 3.5, "Ab5", .45), (4, .5, "Ab5", .9), (4.5, .5, "Bb5", .8), (5, .5, "C6", .85), (5.5, 1, "Db6", 1.0),
     (6.5, .5, "C6", .8), (7, 1, "Ab5", .85)],
    [(0, 3.5, "C6", .45), (4, .5, "G5", .9), (4.5, .5, "Bb5", .8), (5, 1, "Eb6", 1.0), (6, .5, "Db6", .8),
     (6.5, .5, "Bb5", .8), (7, 1, "C6", .9)],
    [(0, 3.5, "Ab5", .45), (4, .5, "C6", .9), (4.5, .5, "Db6", .8), (5, .5, "Eb6", .85), (5.5, 1, "F6", 1.0),
     (6.5, .5, "Eb6", .8), (7, .5, "Db6", .8), (7.5, .5, "C6", .8)],
    [(0, 4.5, "Bb5", .45), (5, .5, "Bb5", .85), (5.5, .5, "C6", .85), (6, .5, "Db6", .9), (6.5, .5, "Eb6", .9),
     (7, .5, "F6", .95), (7.5, .5, "G6", 1.0)],
]


def counter_notes(start_bar, transpose=0):
    out = []
    for k, line in enumerate(COUNTER):
        for beat, dur, nm, vel in line:
            out.append((t(start_bar + 2 * k, beat), dur * B, song.midi(nm) + transpose, vel))
    return out


def hole_fills(bars, lo=72, hi=88, min_hold=1.25):
    """Answer figures for the holes/long holds at the end of each vocal line in `bars`:
    16th-note arpeggios through the chord, moving contrary to the vocal's last step."""
    out = []
    for ln in TL:
        if ln["bar"] not in bars:
            continue
        last = ln["words"][-1]["notes"][-1]
        prev = [n for w in ln["words"] for n in w["notes"]][-2]
        start = last["t"] + 0.5 * B if last["dur"] >= min_hold * B else last["t"] + last["dur"]
        stop = ln["t"] + 8 * B - 0.25 * B
        bar = int((start + 1e-6) // BAR)
        tones = chord_tones_in(bar, lo, hi)
        up = last["midi"] <= prev["midi"]            # vocal fell -> answer rises
        seq = tones if up else tones[::-1]
        k, x = 0, start
        while x < stop - 1e-6 and k < len(seq):
            out.append((x, 0.25 * B, seq[k], 0.7 + 0.3 * k / max(1, len(seq))))
            x += 0.25 * B
            k += 1
    return out


# ---------------------------------------------------------------- events for the visuals
EVENTS = {"kick": [], "snare": [], "hat": [], "crash": [], "impact": [], "riser": [], "gap": [],
          "tapestop": [], "stutter": [], "sfx": []}


def ev(kind_, x, name=None):
    if kind_ in ("riser", "gap", "tapestop", "stutter"):
        EVENTS[kind_].append([round(float(x[0]), 4), round(float(x[1]), 4)])
    elif kind_ == "sfx":
        EVENTS["sfx"].append({"name": name, "t": round(float(x), 4)})
    else:
        EVENTS[kind_].append(round(float(x), 4))


def events_json():
    out = {}
    for k, v in EVENTS.items():
        if k == "sfx":
            out[k] = sorted(v, key=lambda e: e["t"])
        else:
            out[k] = sorted({(tuple(e) if isinstance(e, list) else e) for e in v})
            out[k] = [list(e) if isinstance(e, tuple) else e for e in out[k]]
    return out
