"""SILICON SHIELD (full song, v3): tempo, form, chords, melody and lyrics.

The single source of truth. The audio renderers and the visual timeline are
all generated from this file, so every word's on-screen timing is exact by
construction. The pilot version is kept in song_pilot.py.
"""

BPM = 128
BEAT = 60.0 / BPM
BAR = 4 * BEAT
SR = 44100
KEY = "F minor (final chorus lifts to G minor)"

NOTE_IDX = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7,
            "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def midi(name):
    return 12 * (int(name[-1]) + 1) + NOTE_IDX[name[:-1]]


# Form, in bars: (name, start, end).
SECTIONS = [
    ("intro", 0, 4),
    ("verse1", 4, 12),
    ("pre1", 12, 14),
    ("chorus1", 14, 22),
    ("post1", 22, 26),
    ("verse2", 26, 34),
    ("pre2", 34, 38),
    ("chorus2", 38, 46),
    ("post2", 46, 50),
    ("bridge", 50, 58),
    ("build", 58, 62),
    ("chorus3", 62, 70),
    ("outro", 70, 74),
]
TOTAL_BARS = 74
TAIL = 3.5  # seconds of reverb/impact tail after the last bar

# Gaps: the band stops dead for the last beat(s) before each drop.
DROP_GAPS = [(13, 3), (37, 3), (61, 2)]   # (bar, beat) where silence starts; ends at the next bar

LOOP = [("F", "m"), ("Db", ""), ("Ab", ""), ("Eb", "")]
LOOP_G = [("G", "m"), ("Eb", ""), ("Bb", ""), ("F", "")]   # same loop, up a whole tone
CHORDS = (
    LOOP +                                   # intro
    LOOP * 2 +                               # verse1
    [("Bb", "m"), ("C", "")] +               # pre1
    LOOP * 2 +                               # chorus1
    LOOP +                                   # post1
    LOOP * 2 +                               # verse2
    [("Db", ""), ("Eb", ""), ("Bb", "m"), ("C", "")] +    # pre2
    LOOP * 2 +                               # chorus2
    LOOP +                                   # post2
    [("Db", ""), ("Ab", ""), ("Eb", ""), ("F", "m"),
     ("Db", ""), ("Ab", ""), ("Eb", ""), ("C", "")] +     # bridge (half-time)
    [("C", "m"), ("D", ""), ("C", "m"), ("D", "")] +      # build: iv-V of G minor
    LOOP_G * 2 +                             # chorus3 (key lift)
    [("G", "m"), ("Eb", ""), ("Bb", ""), ("G", "m")]      # outro
)
assert len(CHORDS) == TOTAL_BARS, len(CHORDS)

# Lyrics. Each line starts at a bar; each word is
#   (display text, spelling sent to TTS or None, "NOTE beat dur; NOTE beat dur")
# with one note per TTS syllable; beats are relative to the line's first bar.
# Notes are written in the lead-synth register (the voice sings an octave lower).
# Optional per line: transpose (semitones), style ("sung" | "chant" | "whisper").
V = []


def line(bar, scene, words, **kw):
    V.append(dict(bar=bar, scene=scene, words=words, **kw))


# ---------------------------------------------------------------- verse 1
line(4, "tin", [
    ("Fifty", None, "C5 0 .5; Ab4 .5 .5"), ("thousand", None, "C5 1 .5; Ab4 1.5 .5"),
    ("tin", None, "C5 2 .75"), ("drops", None, "Db5 3 1"),
    ("every", "evry", "C5 4.5 .5; Ab4 5 .5"), ("second", None, "Ab4 5.5 .5; F4 6 1.5")])
line(6, "laser", [
    ("shot", None, "C5 0 .5"), ("by", None, "C5 .5 .5"), ("a", None, "Bb4 1 .5"),
    ("laser,", "laser", "C5 1.5 .5; Ab4 2 1"), ("hotter", None, "Eb5 3 .5; C5 3.5 .5"),
    ("than", None, "Bb4 4 .5"), ("the", None, "Bb4 4.5 .5"), ("sun", None, "G4 5 2.5")])
line(8, "machine", [
    ("One", None, "C5 0 .5"), ("Dutch", None, "C5 .5 .5"), ("machine,", "machine", "Db5 1 .5; C5 1.5 1"),
    ("and", None, "Ab4 3 .5"), ("the", None, "Ab4 3.5 .5"), ("whole", None, "C5 4 .5"),
    ("world's", None, "Ab4 4.5 .5"), ("waiting", None, "Ab4 5 1; F4 6 1.5")])
line(10, "tons", [
    ("Hundred", None, "C5 0 .5; C5 .5 .5"), ("eighty", None, "Eb5 1 .5; C5 1.5 .5"),
    ("tons,", "tons", "C5 2 1"), ("and", None, "Bb4 3 .5"),
    ("everybody", "evrybody", "C5 3.5 .5; Bb4 4 .5; Ab4 4.5 .5; G4 5 .5"),
    ("wants", None, "Bb4 5.5 .5"), ("one", None, "G4 6 1.5")])
# ---------------------------------------------------------------- pre 1
line(12, "line", [
    ("Then", None, "F4 0 .5"), ("Washington", None, "Bb4 .5 .5; Bb4 1 .5; Bb4 1.5 .5"),
    ("drew", None, "Db5 2 1"), ("a", None, "C5 3 .5"), ("line", None, "E5 4 1"),
    ("in", None, "C5 5 .5"), ("the", None, "C5 5.5 .5"), ("sand", None, "C5 6 .9")])
# ---------------------------------------------------------------- chorus (x3)
CHORUS = [
    ("wafer", [("Every", "evry", "C5 0 .5; Ab4 .5 .5"), ("wafer", None, "C5 1 .5; Db5 1.5 .5"),
               ("is", None, "C5 2 .5"), ("a", None, "Ab4 2.5 .5"),
               ("weapon", None, "C5 3 .5; Ab4 3.5 .5"), ("now", None, "F5 4 3")]),
    ("crown", [("Two", None, "C5 0 .5"), ("nanometers", None, "C5 .5 .5; Eb5 1 .5; C5 1.5 .5; Bb4 2 .5"),
               ("holding", None, "C5 2.5 .5; Bb4 3 .5"), ("the", None, "Ab4 3.5 .5"), ("crown", None, "Bb4 4 3")]),
    ("grid", [("Gigawatts", None, "C5 0 .5; Ab4 .5 .5; C5 1 1"), ("in", None, "Db5 2 .5"),
              ("a", None, "C5 2.5 .5"), ("cornfield", None, "C5 3 .5; Ab4 3.5 .5"), ("town", None, "F5 4 3")]),
    ("down", [("Nobody's", None, "Eb5 0 .5; Eb5 .5 .5; C5 1 .5"), ("slowing", None, "Eb5 1.5 1; C5 2.5 .5"),
              ("the", None, "Bb4 3 .5"), ("silicon", None, "C5 3.5 .5; Bb4 4 .5; Ab4 4.5 .5"), ("down", None, "G4 5 2.5")]),
]
for n, start in enumerate((14, 38, 62)):
    for k, (scene, words) in enumerate(CHORUS):
        line(start + 2 * k, f"{scene}{n + 1}", words, hook=True, transpose=2 if n == 2 else 0)
# ---------------------------------------------------------------- post-choruses (chant)
POST = [[("weapon", None, "C5 0 .5; Ab4 .5 .5"), ("now", None, "C5 1 1.5"),
         ("oh", "oh", "Eb5 3 .5"), ("oh", "owe", "Db5 3.5 .5"), ("oh", "oh", "C5 4 2.5")],
        [("weapon", None, "C5 0 .5; Ab4 .5 .5"), ("now", None, "C5 1 1.5"),
         ("oh", "oh", "Eb5 3 .5"), ("oh", "owe", "Db5 3.5 .5"), ("oh", "oh", "Bb4 4 2.5")]]
for n, start in enumerate((22, 46)):
    for k, words in enumerate(POST):
        line(start + 2 * k, f"post{n + 1}", words, style="chant")
# ---------------------------------------------------------------- verse 2
line(26, "hbm", [
    ("Twelve-", "twelve", "C5 0 .5"), ("high", None, "Ab4 .5 .5"), ("memory", "memry", "C5 1 .5; Ab4 1.5 .5"),
    ("stacked", None, "C5 2 .75"), ("like", None, "Db5 3 .5"), ("a", None, "C5 3.5 .5"),
    ("tower", None, "C5 4.5 .5; F4 5 2")])
line(28, "smuggle", [
    ("smuggled", None, "C5 0 .5; C5 .5 .5"), ("in", None, "Bb4 1 .5"),
    ("suitcases,", "suitcases", "C5 1.5 .5; Ab4 2 .5; Ab4 2.5 .5"), ("rented", None, "Eb5 3 .5; C5 3.5 .5"),
    ("by", None, "Bb4 4 .5"), ("the", None, "Bb4 4.5 .5"), ("hour", None, "Ab4 5 .75; G4 5.75 1.75")])
line(30, "island", [
    ("One", None, "C5 0 .5"), ("little", None, "C5 .5 .5; Db5 1 .5"), ("island,", "island", "C5 1.5 .5; C5 2 1"),
    ("one", None, "Ab4 3 .5"), ("narrow", None, "Ab4 3.5 .5; C5 4 .5"), ("sea", None, "F4 4.5 2.5")])
line(32, "key", [
    ("holding", None, "C5 0 .5; C5 .5 .5"), ("the", None, "Bb4 1 .5"), ("future", None, "Eb5 1.5 .5; C5 2 1"),
    ("like", None, "Bb4 3 .5"), ("a", None, "C5 3.5 .5"), ("silicon", None, "Bb4 4 .5; Ab4 4.5 .5; G4 5 .5"),
    ("key", None, "Bb4 5.5 1.5")])
# ---------------------------------------------------------------- pre 2
line(34, "shield", [
    ("They", None, "F4 0 .5"), ("call", None, "Ab4 .5 .5"), ("it", None, "Ab4 1 .5"), ("a", None, "Ab4 1.5 .5"),
    ("shield", None, "C5 2 1"), ("made", None, "Bb4 3 .5"), ("of", None, "Ab4 3.5 .5"), ("sand", None, "Bb4 4 1"),
    ("and", None, "C5 5 .5"), ("light", None, "Db5 5.5 1.5")])
line(36, "fab", [
    ("and", None, "C5 0 .5"), ("nobody", None, "Db5 .5 .5; C5 1 .5; Bb4 1.5 .5"), ("sleeps", None, "C5 2 1"),
    ("in", None, "Bb4 3 .5"), ("the", None, "C5 3.5 .5"), ("fab", None, "Db5 4 1"),
    ("tonight", None, "C5 5 .5; E5 5.5 1.3")])
# ---------------------------------------------------------------- bridge (half-time)
line(50, "atom", [
    ("Every", "evry", "Ab4 0 .5; Ab4 .5 .5"), ("atom", None, "C5 1 .5; Bb4 1.5 .5"),
    ("counted,", "counted", "Ab4 2 .5; F4 2.5 .5"), ("every", "evry", "Ab4 3 .5; Ab4 3.5 .5"),
    ("border", None, "C5 4 .5; Db5 4.5 .5"), ("drawn", None, "C5 5 2.5")])
line(52, "dream", [
    ("every", "evry", "Ab4 0 .5; Ab4 .5 .5"), ("model", None, "C5 1 .5; Bb4 1.5 .5"),
    ("dreaming", None, "Ab4 2 .5; F4 2.5 .5"), ("on", None, "Ab4 3 .5"), ("a", None, "Bb4 3.5 .5"),
    ("chip", None, "C5 4 .5"), ("we'll", "weel", "Eb5 4.5 .5"), ("never", None, "Db5 5 .5; C5 5.5 .5"),
    ("own", None, "Bb4 6 1.5")])
line(54, "crack", [
    ("If", None, "C5 0 .5"), ("the", None, "C5 .5 .5"), ("shield", None, "Eb5 1 1"),
    ("ever", None, "Db5 2 .5; C5 2.5 .5"), ("cracks,", "cracks", "Bb4 3 1"), ("if", None, "C5 4 .5"),
    ("the", None, "C5 4.5 .5"), ("lights", None, "Eb5 5 .5"), ("go", None, "Db5 5.5 .5"), ("out", None, "C5 6 1.5")])
line(56, "whoscrown", [
    ("who's", None, "C5 0 1"), ("left", None, "Db5 1 1"), ("holding", None, "Eb5 2 1; Db5 3 1"),
    ("the", None, "C5 4 1"), ("crown?", "crown", "E5 5 2.9")])
# ---------------------------------------------------------------- build
line(58, "hold1", [("Hold", None, "C5 0 1"), ("the", None, "C5 1 .5"), ("line", None, "C5 1.5 2.5")], style="whisper")
line(60, "hold2", [("hold", None, "D5 0 1"), ("the", None, "D5 1 .5"), ("line", None, "Gb5 1.5 1.4")], style="whisper")
# ---------------------------------------------------------------- outro
line(70, "outro1", [("Every", "evry", "C5 0 .5; Ab4 .5 .5"), ("wafer", None, "C5 1 .5; Db5 1.5 .5"),
                    ("is", None, "C5 2 .5"), ("a", None, "Ab4 2.5 .5"), ("weapon", None, "C5 3 .5; Ab4 3.5 .5"),
                    ("now", None, "F4 4 3")], transpose=2, style="whisper")
line(72, "outro2", [("export", None, "C5 0 .5; C5 .5 .5"), ("restricted", None, "Bb4 1 .5; Ab4 1.5 .5; G4 2 2")],
     transpose=2, style="whisper")

LINES = V


def parse_notes(s, transpose=0):
    out = []
    for chunk in s.split(";"):
        n, b, d = chunk.split()
        out.append((midi(n) + transpose, float(b), float(d)))
    return out


def line_text(line, tts=True):
    return " ".join((w[1] or w[0]) if tts else w[0] for w in line["words"])


def section_at(bar):
    for name, a, b in SECTIONS:
        if a <= bar < b:
            return name
    return "end"


def timeline():
    """Absolute seconds for every line, word and note."""
    lines = []
    for li, ln in enumerate(LINES):
        t0 = ln["bar"] * BAR
        words = []
        for disp, tts, notes in ln["words"]:
            ns = [dict(midi=m, t=t0 + b * BEAT, dur=d * BEAT) for m, b, d in parse_notes(notes, ln.get("transpose", 0))]
            words.append(dict(text=disp, tts=(tts or disp).strip(",.?"), t=ns[0]["t"],
                              end=ns[-1]["t"] + ns[-1]["dur"], notes=ns))
        lines.append(dict(index=li, scene=ln["scene"], hook=ln.get("hook", False), style=ln.get("style", "sung"),
                          section=section_at(ln["bar"]), bar=ln["bar"], t=t0, end=words[-1]["end"], words=words))
    return lines
