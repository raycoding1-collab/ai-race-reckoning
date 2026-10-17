"""Write the engine's data files from our own song: data/lyrics.json, data/audio.json, data/events.json.

Timings come from song.py (exact by construction); envelopes from the rendered mix
and stems; drum onsets from build/events.json (written by music.py) when present.
"""
import os, sys, json
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

sys.path.insert(0, os.path.dirname(__file__))
import song

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 100


def lyrics():
    lines = []
    for l in song.timeline():
        lines.append(dict(i=l["index"], text=" ".join(w["text"] for w in l["words"]), start=round(l["t"], 4),
                          end=round(l["end"], 4), scene=l["scene"], section=l["section"], style=l["style"], hook=l["hook"],
                          words=[dict(w=w["text"], start=round(w["notes"][0]["t"], 4), end=round(w["end"], 4), conf=1.0,
                                      syl=[[round(n["t"], 4), round(n["t"] + n["dur"], 4)] for n in w["notes"]],
                                      midi=[n["midi"] for n in w["notes"]]) for w in l["words"]]))
    lines.sort(key=lambda l: l["start"])
    return dict(lines=lines, extras=[], notes="Generated from src/song.py; times are exact (the song is synthesized to them).")


def env(x, sr, sos=None):
    if x.ndim > 1:
        x = x.mean(1)
    if sos is not None:
        x = sosfilt(sos, x)
    hop = sr // FPS
    n = len(x) // hop
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1))
    e = np.convolve(e, np.ones(3) / 3, mode="same")
    return (e / (np.percentile(e, 99.5) + 1e-9)).clip(0, 1)


def load(path):
    x, sr = sf.read(path)
    return x, sr


def audio():
    dur = song.TOTAL_BARS * song.BAR + song.TAIL
    beats = [round(i * song.BEAT, 5) for i in range(int(dur / song.BEAT) + 1)]
    downs = beats[::4]
    j = dict(duration=round(dur, 4), bpm=song.BPM, beat_period=song.BEAT, time_signature=4, fps=FPS, beats=beats,
             downbeats=downs, sections=[dict(name=n, start=round(a * song.BAR, 4), end=round(b * song.BAR, 4))
                                        for n, a, b in song.SECTIONS], features={}, onsets={})
    mix_p = os.path.join(ROOT, "audio", "silicon_shield.wav")
    st = os.path.join(ROOT, "build", "stems")
    if os.path.exists(mix_p):
        x, sr = load(mix_p)
        j["features"]["rms"] = env(x, sr).round(4).tolist()
        for k, lo, hi in [("low", 20, 250), ("mid", 250, 4000), ("high", 4000, 16000)]:
            sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
            j["features"][k] = env(x, sr, sos).round(4).tolist()
        j["features"]["bass"] = j["features"]["low"]
    for k, f in [("drums", "bus_drums.wav"), ("other", "bus_music.wav"), ("vocal", "vox_lead.wav")]:
        p = os.path.join(st, f)
        if os.path.exists(p):
            x, sr = load(p)
            j["features"][k] = env(x, sr).round(4).tolist()
    ev_p = os.path.join(ROOT, "build", "events.json")
    ev = json.load(open(ev_p)) if os.path.exists(ev_p) else {}
    for k in ("kick", "snare", "hat"):
        j["onsets"][k] = [[round(t, 4), 1.0] for t in sorted(ev.get(k, []))]
    j["onsets"]["vocal"] = [[round(n["t"], 4), 1.0] for l in song.timeline() for w in l["words"] for n in w["notes"]]
    return j, ev


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump(lyrics(), open(os.path.join(ROOT, "data", "lyrics.json"), "w"))
    a, ev = audio()
    json.dump(a, open(os.path.join(ROOT, "data", "audio.json"), "w"))
    json.dump(ev, open(os.path.join(ROOT, "data", "events.json"), "w"))
    print("lyrics lines", len(lyrics()["lines"]), "| audio features", list(a["features"]), "| onsets",
          {k: len(v) for k, v in a["onsets"].items()}, "| events", list(ev))
