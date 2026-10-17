"""Write web/timeline.js: every line/word/note time, beats, sections, kicks."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import song
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = dict(
    bpm=song.BPM, beat=song.BEAT, bar=song.BAR,
    duration=song.TOTAL_BARS * song.BAR + song.TAIL,
    sections=[dict(name=n, t=a * song.BAR, end=b * song.BAR) for n, a, b in song.SECTIONS],
    chords=[f"{r}{q}" for r, q in song.CHORDS],
    lines=song.timeline(),
)
open(os.path.join(ROOT, "web", "timeline.js"), "w").write("window.TL = " + json.dumps(data, indent=1) + ";\n")
print("lines", len(data["lines"]), "duration", round(data["duration"], 2))
for l in data["lines"]:
    print(f'{l["t"]:6.2f}-{l["end"]:6.2f} {l["scene"]:8s} ' + " ".join(f'{w["text"]}@{w["t"]:.2f}' for w in l["words"]))
