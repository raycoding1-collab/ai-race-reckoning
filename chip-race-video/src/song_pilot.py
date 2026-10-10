"""SILICON SHIELD — song definition (pilot: intro, verse, build, chorus, tag).

Single source of truth for tempo, chords, melody and lyrics. The audio
renderers and the visual timeline are all generated from this file, so
every word's on-screen timing is exact by construction.
"""

BPM = 128
BEAT = 60.0 / BPM
BAR = 4 * BEAT
SR = 44100
KEY = "F minor"

NOTE_IDX = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7,
            "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def midi(name):
    return 12 * (int(name[-1]) + 1) + NOTE_IDX[name[:-1]]


# Arrangement, in bars.
SECTIONS = [
    ("intro", 0, 2),
    ("verse", 2, 10),
    ("build", 10, 12),
    ("chorus", 12, 20),
    ("tag", 20, 22),
]
TOTAL_BARS = 22
TAIL = 3.0  # seconds of reverb/impact tail after the last bar

# One chord per bar: (root, quality). Voicings are built in music.py.
CHORDS = (
    [("F", "m")] * 2 +                                        # intro
    [("F", "m"), ("Db", ""), ("Ab", ""), ("Eb", "")] * 2 +    # verse
    [("Bb", "m"), ("C", "")] +                                # build (V for lift)
    [("F", "m"), ("Db", ""), ("Ab", ""), ("Eb", "")] * 2 +    # chorus
    [("F", "m"), ("F", "m")]                                  # tag
)
assert len(CHORDS) == TOTAL_BARS

# Lyrics. Each line starts at a bar; each word is
#   (display text, spelling sent to TTS or None, "NOTE beat dur; NOTE beat dur")
# with one note per TTS syllable; beats are relative to the line's first bar.
LINES = [
    dict(bar=2, scene="tin", words=[
        ("Fifty", None, "C5 0 .5; Ab4 .5 .5"),
        ("thousand", None, "C5 1 .5; Ab4 1.5 .5"),
        ("tin", None, "C5 2 .75"),
        ("drops", None, "Db5 3 1"),
        ("every", "evry", "C5 4.5 .5; Ab4 5 .5"),
        ("second", None, "Ab4 5.5 .5; F4 6 1.5"),
    ]),
    dict(bar=4, scene="laser", words=[
        ("shot", None, "C5 0 .5"),
        ("by", None, "C5 .5 .5"),
        ("a", None, "Bb4 1 .5"),
        ("laser,", "laser", "C5 1.5 .5; Ab4 2 1"),
        ("hotter", None, "Eb5 3 .5; C5 3.5 .5"),
        ("than", None, "Bb4 4 .5"),
        ("the", None, "Bb4 4.5 .5"),
        ("sun", None, "G4 5 2.5"),
    ]),
    dict(bar=6, scene="machine", words=[
        ("One", None, "C5 0 .5"),
        ("Dutch", None, "C5 .5 .5"),
        ("machine,", "machine", "Db5 1 .5; C5 1.5 1"),
        ("and", None, "Ab4 3 .5"),
        ("the", None, "Ab4 3.5 .5"),
        ("whole", None, "C5 4 .5"),
        ("world's", None, "Ab4 4.5 .5"),
        ("waiting", None, "Ab4 5 1; F4 6 1.5"),
    ]),
    dict(bar=8, scene="tons", words=[
        ("Hundred", None, "C5 0 .5; C5 .5 .5"),
        ("eighty", None, "Eb5 1 .5; C5 1.5 .5"),
        ("tons,", "tons", "C5 2 1"),
        ("and", None, "Bb4 3 .5"),
        ("everybody", "evrybody", "C5 3.5 .5; Bb4 4 .5; Ab4 4.5 .5; G4 5 .5"),
        ("wants", None, "Bb4 5.5 .5"),
        ("one", None, "G4 6 1.5"),
    ]),
    dict(bar=10, scene="line", words=[
        ("Then", None, "F4 0 .5"),
        ("Washington", None, "Bb4 .5 .5; Bb4 1 .5; Bb4 1.5 .5"),
        ("drew", None, "Db5 2 1"),
        ("a", None, "C5 3 .5"),
        ("line", None, "E5 4 1"),
        ("in", None, "C5 5 .5"),
        ("the", None, "C5 5.5 .5"),
        ("sand", None, "C5 6 .9"),
    ]),
    dict(bar=12, scene="wafer", hook=True, words=[
        ("Every", "evry", "C5 0 .5; Ab4 .5 .5"),
        ("wafer", None, "C5 1 .5; Db5 1.5 .5"),
        ("is", None, "C5 2 .5"),
        ("a", None, "Ab4 2.5 .5"),
        ("weapon", None, "C5 3 .5; Ab4 3.5 .5"),
        ("now", None, "F5 4 3"),
    ]),
    dict(bar=14, scene="crown", hook=True, words=[
        ("Two", None, "C5 0 .5"),
        ("nanometers", None, "C5 .5 .5; Eb5 1 .5; C5 1.5 .5; Bb4 2 .5"),
        ("holding", None, "C5 2.5 .5; Bb4 3 .5"),
        ("the", None, "Ab4 3.5 .5"),
        ("crown", None, "Bb4 4 3"),
    ]),
    dict(bar=16, scene="grid", hook=True, words=[
        ("Gigawatts", None, "C5 0 .5; Ab4 .5 .5; C5 1 1"),
        ("in", None, "Db5 2 .5"),
        ("a", None, "C5 2.5 .5"),
        ("cornfield", None, "C5 3 .5; Ab4 3.5 .5"),
        ("town", None, "F5 4 3"),
    ]),
    dict(bar=18, scene="down", hook=True, words=[
        ("Nobody's", None, "Eb5 0 .5; Eb5 .5 .5; C5 1 .5"),
        ("slowing", None, "Eb5 1.5 1; C5 2.5 .5"),
        ("the", None, "Bb4 3 .5"),
        ("silicon", None, "C5 3.5 .5; Bb4 4 .5; Ab4 4.5 .5"),
        ("down", None, "G4 5 2.5"),
    ]),
    dict(bar=20, scene="tag", words=[
        ("weapon", None, "C5 0 .5; Ab4 .5 .5"),
        ("now", None, "F4 1 3"),
    ]),
]


def parse_notes(s):
    out = []
    for chunk in s.split(";"):
        n, b, d = chunk.split()
        out.append((midi(n), float(b), float(d)))
    return out


def line_text(line, tts=True):
    return " ".join((w[1] or w[0]) if tts else w[0] for w in line["words"])


def timeline():
    """Absolute seconds for every line, word and note."""
    lines = []
    for li, line in enumerate(LINES):
        t0 = line["bar"] * BAR
        words = []
        for disp, tts, notes in line["words"]:
            ns = [dict(midi=m, t=t0 + b * BEAT, dur=d * BEAT) for m, b, d in parse_notes(notes)]
            words.append(dict(text=disp, tts=(tts or disp).strip(",."),
                              t=ns[0]["t"], end=ns[-1]["t"] + ns[-1]["dur"], notes=ns))
        lines.append(dict(index=li, scene=line["scene"], hook=line.get("hook", False),
                          bar=line["bar"], t=t0, end=words[-1]["end"], words=words))
    return lines
