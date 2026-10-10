#!/usr/bin/env python3
"""song_perceive.py - a "perception kit" for a song, so an AI that cannot hear can read it like a score.

    python3 tools/perceive/song_perceive.py AUDIO --label L [--mdx voc_ft|kim] [--asr small.en|base.en|tiny.en]
                                            [--force stage,stage] [--only stage,stage] [--no-clap]

Output (build/perceive/L/):
    song.json        everything (tempo, beats, key, chords, structure, lyrics+timing, melody, bass, drums, sound)
    LEAD_SHEET.md    one row per bar: section, chord, lyric words, melody (note@beat), bass, drum pattern id
    SOUND.md         per-section instrumentation / production notes + energy arc
    piano_roll.png   melody + bass notes with section bands and chord labels   (<=1600 px wide)
    spectrogram.png  section-coloured spectrogram                              (<=1600 px wide)
    vocals.wav, instrumental.wav   MDX-Net separation (instrumental = mix - vocals)
    cache/           per-stage caches (delete or use --force to recompute)

Stages (in order): separate, rhythm, chords, melody, bass, drums, lyrics, structure, sound, render.
CPU only, <=4 threads, no torch: onnxruntime (MDX-Net, Whisper via sherpa-onnx, CLAP, CED), madmom, librosa.
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import math
import os
import re
import subprocess
import sys
import time
import warnings

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "4")
os.environ.setdefault("NUMBA_NUM_THREADS", "4")
warnings.filterwarnings("ignore")

import numpy as np
import scipy.signal as ss
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "build", "models")
SR = 44100
T0 = time.time()
NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def log(*a):
    print(f"[{time.time() - T0:5.0f}s]", *a, file=sys.stderr, flush=True)


# ============================================================================ small helpers
def midi_name(m):
    m = int(round(m))
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def hz_to_midi(f):
    return 69.0 + 12.0 * np.log2(np.asarray(f, dtype=float) / 440.0)


def midi_to_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def db(x, floor=1e-10):
    return 10.0 * np.log10(np.maximum(x, floor))


def jdump(obj, path, indent=None):
    def default(o):
        if isinstance(o, (np.integer,)): return int(o)
        if isinstance(o, (np.floating,)): return None if not np.isfinite(o) else float(o)
        if isinstance(o, np.ndarray): return o.tolist()
        raise TypeError(type(o))
    with open(path, "w") as f:
        json.dump(obj, f, default=default, indent=indent, separators=(",", ":") if indent is None else None)


def fmt_time(t):
    t = max(0.0, float(t))
    return f"{int(t // 60)}:{t % 60:04.1f}"


def resample(x, sr_from, sr_to):
    if sr_from == sr_to:
        return x
    import librosa
    return librosa.resample(x, orig_sr=sr_from, target_sr=sr_to, res_type="soxr_hq" if _has_soxr() else "kaiser_fast")


_SOXR = None


def _has_soxr():
    global _SOXR
    if _SOXR is None:
        try:
            import soxr  # noqa
            _SOXR = True
        except Exception:
            _SOXR = False
    return _SOXR


def load_audio(path, sr=SR):
    """Decode anything ffmpeg can read to float32 stereo [2, n] at sr."""
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()


def to_mono(x):
    return x.mean(0) if x.ndim == 2 else x


class Ctx:
    """Shared state for the pipeline."""

    def __init__(self, audio, label, out, args):
        self.audio, self.label, self.out, self.args = audio, label, out, args
        self.cache_dir = os.path.join(out, "cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self.R = {}            # results per stage (JSON-able)
        self._mix = self._voc = self._ins = None
        self._mono = {}

    # lazily loaded audio ---------------------------------------------------------------
    @property
    def mix(self):
        if self._mix is None:
            self._mix = load_audio(self.audio)
        return self._mix

    @property
    def dur(self):
        return self.mix.shape[1] / SR

    @property
    def voc(self):
        if self._voc is None:
            self._voc = load_audio(os.path.join(self.out, "vocals.wav"))
        return self._voc

    @property
    def ins(self):
        if self._ins is None:
            self._ins = load_audio(os.path.join(self.out, "instrumental.wav"))
        return self._ins

    def mono(self, which, sr):
        k = (which, sr)
        if k not in self._mono:
            x = to_mono(getattr(self, which))
            self._mono[k] = resample(x, SR, sr).astype(np.float32)
        return self._mono[k]

    def need(self, stage):
        """results of an earlier stage (computed or loaded from cache on demand)."""
        if stage not in self.R:
            globals()["stage_" + stage](self)
        return self.R.get(stage)

    # caches ----------------------------------------------------------------------------
    def cpath(self, name):
        return os.path.join(self.cache_dir, name)

    def cached(self, stage):
        if stage in self.args.force_set:
            return None
        p = self.cpath(stage + ".json")
        if os.path.exists(p):
            try:
                with open(p) as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    def save(self, stage, obj):
        jdump(obj, self.cpath(stage + ".json"))


# ============================================================================ 1. MDX-Net separation
MDX_MODELS = {
    # name: (file, n_fft, hop, dim_f, dim_t(bits), compensate)
    "voc_ft": ("UVR-MDX-NET-Voc_FT.onnx", 7680, 1024, 3072, 256, 1.021),
    "kim": ("Kim_Vocal_2.onnx", 7680, 1024, 3072, 256, 1.009),
}


def _stft(x, n_fft, hop, win):
    """torch.stft(center=True, reflect pad, return_complex) equivalent; x [C,N] -> [C,F,T]."""
    pad = n_fft // 2
    xp = np.pad(x, ((0, 0), (pad, pad)), mode="reflect")
    fr = np.lib.stride_tricks.sliding_window_view(xp, n_fft, axis=1)[:, ::hop]
    X = np.fft.rfft(fr * win, axis=-1)
    return X.transpose(0, 2, 1)


def _istft(X, n_fft, hop, win):
    """torch.istft(center=True) equivalent; X [C,F,T] -> [C, hop*(T-1)]."""
    C, F, T = X.shape
    fr = np.fft.irfft(X.transpose(0, 2, 1), n=n_fft, axis=-1) * win
    n = n_fft + hop * (T - 1)
    y = np.zeros((C, n))
    ws = np.zeros(n)
    w2 = win ** 2
    for t in range(T):
        y[:, t * hop:t * hop + n_fft] += fr[:, t]
        ws[t * hop:t * hop + n_fft] += w2
    y /= np.maximum(ws, 1e-8)
    return y[:, n_fft // 2:n - n_fft // 2]


def mdx_separate(x, model="voc_ft", denoise=False, progress=None):
    """x: float32 [2, n] at 44.1 kHz. Returns the vocal estimate [2, n] (float32)."""
    import onnxruntime as ort
    fname, n_fft, hop, dim_f, dim_t, comp = MDX_MODELS[model]
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.inter_op_num_threads = 1
    sess = ort.InferenceSession(os.path.join(MODELS, "mdx", fname), so, providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    chunk = hop * (dim_t - 1)
    trim = n_fft // 2
    gen = chunk - 2 * trim
    n_bins = n_fft // 2 + 1
    win = np.hanning(n_fft + 1)[:-1]  # periodic hann (torch.hann_window default)
    n = x.shape[1]
    pad = gen - n % gen
    xp = np.concatenate([np.zeros((2, trim), np.float32), x, np.zeros((2, pad + trim), np.float32)], axis=1)
    outs = []
    starts = list(range(0, n + pad, gen))
    for ci, i in enumerate(starts):
        wav = xp[:, i:i + chunk].astype(np.float64)
        if wav.shape[1] < chunk:
            wav = np.pad(wav, ((0, 0), (0, chunk - wav.shape[1])))
        X = _stft(wav, n_fft, hop, win)[:, :dim_f]
        spec = np.stack([X[0].real, X[0].imag, X[1].real, X[1].imag]).astype(np.float32)
        spec[:, :3, :] = 0.0
        if denoise:
            Y = 0.5 * sess.run(None, {in_name: spec[None]})[0][0] - 0.5 * sess.run(None, {in_name: -spec[None]})[0][0]
        else:
            Y = sess.run(None, {in_name: spec[None]})[0][0]
        Y[:, :3, :] = 0.0
        Yc = np.zeros((2, n_bins, dim_t), np.complex128)
        Yc[0, :dim_f] = Y[0] + 1j * Y[1]
        Yc[1, :dim_f] = Y[2] + 1j * Y[3]
        y = _istft(Yc, n_fft, hop, win)
        outs.append(y[:, trim:-trim].astype(np.float32))
        if progress:
            progress(ci + 1, len(starts))
    v = np.concatenate(outs, axis=1)[:, :n] * comp
    return v.astype(np.float32)


def stage_separate(C):
    vp, ip = os.path.join(C.out, "vocals.wav"), os.path.join(C.out, "instrumental.wav")
    if os.path.exists(vp) and os.path.exists(ip) and "separate" not in C.args.force_set:
        log("separate: cached")
        return
    def prog(i, n):
        if i == 1 or i % 5 == 0 or i == n:
            log(f"separate: chunk {i}/{n}")
    v = mdx_separate(C.mix, C.args.mdx, progress=prog)
    ins = C.mix - v
    sf.write(vp, v.T, SR, subtype="PCM_16")
    sf.write(ip, ins.T, SR, subtype="PCM_16")
    C._voc, C._ins = v, ins.astype(np.float32)


# ============================================================================ bar / beat grid
class Grid:
    """Beat and bar grid. beat_t: every beat time covering the audio; beat_bar/beat_pos: bar index and 0-based position
    of each beat; bar_t: bar start times (n_bars + 1 entries, last = end of the last bar). Bar 0 is the first bar that starts
    within [-0.25 bar, +0.75 bar) of t=0; audio before it is a pickup (bar index -1)."""

    def __init__(self, d):
        self.bpb = int(d["beats_per_bar"])
        self.beat_t = np.asarray(d["beat_times"], float)
        self.beat_bar = np.asarray(d["beat_bar"], int)
        self.beat_pos = np.asarray(d["beat_pos"], int)
        self.bar_t = np.asarray(d["bar_starts"], float)
        self.n_bars = len(self.bar_t) - 1
        self.bpm = float(d["bpm"])
        self.beat_idx = np.arange(len(self.beat_t), dtype=float)
        # global beat index (float) -> within-bar beat position
        self._first_bar_beat = {}
        for i, (b, p) in enumerate(zip(self.beat_bar, self.beat_pos)):
            if p == 0 and b not in self._first_bar_beat:
                self._first_bar_beat[int(b)] = i

    def bar_span(self, b):
        return float(self.bar_t[b]), float(self.bar_t[b + 1])

    def bar_of(self, t):
        b = int(np.searchsorted(self.bar_t, t, side="right") - 1)
        return min(max(b, -1), self.n_bars - 1) if t < self.bar_t[-1] else self.n_bars

    def locate(self, t):
        """(bar index, 1-based fractional beat in bar). Pickup times give bar -1 with the beat counted from the bar end."""
        b = self.bar_of(t)
        s = float(np.interp(t, self.beat_t, self.beat_idx))     # fractional global beat index (linear extrapolation clipped)
        if t < self.beat_t[0]:
            s = (t - self.beat_t[0]) / (self.beat_t[1] - self.beat_t[0])
        elif t > self.beat_t[-1]:
            s = len(self.beat_t) - 1 + (t - self.beat_t[-1]) / (self.beat_t[-1] - self.beat_t[-2])
        if b < 0:
            # pickup: express relative to the start of bar 0 (negative beats wrapped into the previous bar)
            s0 = float(np.interp(self.bar_t[0], self.beat_t, self.beat_idx))
            return -1, self.bpb + 1 + (s - s0)
        i0 = self._first_bar_beat.get(b)
        if i0 is None:
            return b, 1.0
        return b, 1.0 + s - i0

    def step_times(self, b, n_steps):
        """times of n_steps equally spaced positions inside bar b (piecewise-linear in beats)."""
        s0, s1 = self.bar_span(b)
        return s0 + (s1 - s0) * np.arange(n_steps) / n_steps


def make_grid(bt, bp, dur):
    """bt: detected beat times, bp: their position in bar (1..bpb). Returns the dict stored in rhythm.json."""
    bt = np.asarray(bt, float)
    bp = np.asarray(bp, int)
    ibi = np.diff(bt)
    period = float(np.median(ibi))
    # beats per bar = most common distance between detected downbeats (in beats), default by max position
    db_idx = np.where(bp == 1)[0]
    if len(db_idx) >= 2:
        lens = np.diff(db_idx)
        bpb = int(np.bincount(lens).argmax())
    else:
        bpb = int(bp.max()) if len(bp) else 4
    bpb = bpb if bpb in (2, 3, 4, 5, 6, 7) else 4
    k = np.arange(len(bt))
    inl = np.ones(len(bt), bool)
    for _ in range(8):                                        # robust (trimmed) line fit: t = icpt + slope * k
        slope, icpt = np.polyfit(k[inl], bt[inl], 1)
        resid = bt - (icpt + slope * k)
        new_inl = np.abs(resid) < 0.03
        if new_inl.sum() < 0.5 * len(bt):
            break
        inl = new_inl
    steady = bool(inl.mean() >= 0.9 and resid[inl].std() < 0.015)
    # downbeat phase: beat k is a downbeat when (k - phase) % bpb == 0
    ph = np.bincount((db_idx % bpb) if len(db_idx) else np.array([0]), minlength=bpb).argmax()
    if steady:
        # robust re-fit through downbeat-labelled beats only is not needed; LSQ over all beats is exact enough
        j0 = -int(math.ceil(icpt / slope)) - 2                 # earliest beat index at/after t<=0
        j1 = int(math.ceil((dur - icpt) / slope)) + 2
        js = np.arange(j0, j1 + 1)
        beat_t = icpt + slope * js
        pos = (js - ph) % bpb
        keep = beat_t > -slope * bpb - 1e-6
        beat_t, pos = beat_t[keep], pos[keep]
        bpm = 60.0 / slope
        period = float(slope)
    else:
        # variable tempo: keep detected beats, extrapolate at both ends with the local period
        head = max(float(np.median(ibi[:8])), 0.2)
        tail = max(float(np.median(ibi[-8:])), 0.2)
        pre = []
        t = bt[0] - head
        while t > -head * bpb:
            pre.append(t)
            t -= head
        post = []
        t = bt[-1] + tail
        while t < dur + tail * bpb:
            post.append(t)
            t += tail
        beat_t = np.array(pre[::-1] + list(bt) + post)
        n_pre = len(pre)
        pos = np.empty(len(beat_t), int)
        pos[n_pre:n_pre + len(bt)] = (bp - 1) % bpb
        for i in range(n_pre - 1, -1, -1):
            pos[i] = (pos[i + 1] - 1) % bpb
        for i in range(n_pre + len(bt), len(beat_t)):
            pos[i] = (pos[i - 1] + 1) % bpb
        bpm = 60.0 / period
    # bar starts = beats with pos == 0
    dbs = beat_t[pos == 0]
    bar_len = float(np.median(np.diff(dbs))) if len(dbs) > 1 else bpb * period
    first = None
    for d in dbs:
        if d >= -0.25 * bar_len:
            first = float(d)
            break
    # snap: first bar start in [-0.25, 0.75) bars
    while first - bar_len >= -0.25 * bar_len:
        first -= bar_len
    bar_starts = [t for t in dbs if t >= first - 1e-6]
    # extend at the end until the audio is covered
    while bar_starts[-1] < dur - 0.05 * bar_len:
        bar_starts.append(bar_starts[-1] + bar_len)
    # drop a final bar that starts within 5% of the end
    if len(bar_starts) > 2 and bar_starts[-2] >= dur - 0.05 * bar_len:
        bar_starts = bar_starts[:-1]
    bar_starts = np.array(bar_starts)
    # per-beat bar index
    beat_bar = np.searchsorted(bar_starts, beat_t, side="right") - 1
    sel = (beat_bar >= 0) & (beat_bar < len(bar_starts) - 1)
    if not steady:
        bpm = 60.0 / float((bt[-1] - bt[0]) / max(1, len(bt) - 1))
    loc = 60.0 / np.convolve(ibi, np.ones(16) / 16, mode="valid") if len(ibi) >= 16 else np.array([bpm])
    return dict(beats_per_bar=bpb, bpm=float(bpm), steady=steady, bar_len=bar_len,
                bpm_range=[float(np.percentile(loc, 5)), float(np.percentile(loc, 95))], beat_inlier_frac=float(inl.mean()),
                beat_resid_ms=float(1000 * resid[inl].std()), beat_resid_max_ms=float(1000 * np.abs(resid).max()),
                beat_times=beat_t[sel], beat_bar=beat_bar[sel], beat_pos=pos[sel], bar_starts=bar_starts,
                n_beats_detected=int(len(bt)))


# ============================================================================ 2. tempo / beats / downbeats / key
KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MODE_PROFILES = {"major": KK_MAJOR, "minor": KK_MINOR}


def ks_scores(chroma_vec):
    """Pearson correlation of a 12-bin chroma vector with all 24 rotated key profiles -> dict {(pc, mode): r}."""
    v = np.asarray(chroma_vec, float)
    out = {}
    for mode, prof in MODE_PROFILES.items():
        for pc in range(12):
            pr = np.roll(prof, pc)
            if v.std() < 1e-9:
                out[(pc, mode)] = 0.0
            else:
                out[(pc, mode)] = float(np.corrcoef(v, pr)[0, 1])
    return out


def key_label(pc, mode, flats=True):
    return f"{(NOTE_NAMES if flats else PC_NAMES_SHARP)[pc]} {mode}"


def uses_flats(pc, mode):
    """Spell a key with flats or sharps (conventional key signature)."""
    major_pc = pc if mode == "major" else (pc + 3) % 12
    return major_pc in (5, 10, 3, 8, 1, 6)       # F Bb Eb Ab Db Gb majors (and their relative minors)


def mix_wav_path(C):
    if C.audio.lower().endswith(".wav"):
        try:
            if sf.info(C.audio).samplerate == SR:
                return C.audio
        except Exception:
            pass
    p = C.cpath("mix.wav")
    if not os.path.exists(p):
        sf.write(p, C.mix.T, SR, subtype="PCM_16")
    return p


def chroma_of(x22, sr=22050, hop=512):
    import librosa
    tuning = float(librosa.estimate_tuning(y=x22, sr=sr))
    ch = librosa.feature.chroma_cqt(y=x22, sr=sr, hop_length=hop, tuning=tuning, n_chroma=12, bins_per_octave=36)
    return ch, tuning


def stage_rhythm(C):
    r = C.cached("rhythm")
    if r:
        C.R["rhythm"] = r
        log("rhythm: cached")
        return
    wav = mix_wav_path(C)
    method = "madmom"
    act = None
    try:
        from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
        pa = C.cpath("rnn_downbeat_act.npy")
        if os.path.exists(pa) and "rhythm_act" not in C.args.force_set:
            act = np.load(pa)
        else:
            act = RNNDownBeatProcessor()(wav)
            np.save(pa, act)
        trk = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)(act)
        bt, bp = trk[:, 0], trk[:, 1].astype(int)
        if len(bt) < 8:
            raise RuntimeError("too few beats")
    except Exception as e:                                    # librosa fallback
        log("rhythm: madmom failed (%s); librosa fallback" % e)
        import librosa
        method = "librosa"
        y = C.mono("mix", 22050)
        tempo, frames = librosa.beat.beat_track(y=y, sr=22050, hop_length=512, units="frames")
        bt = librosa.frames_to_time(frames, sr=22050, hop_length=512)
        bp = (np.arange(len(bt)) % 4) + 1
        # choose the downbeat phase with the strongest low-band onset
        env = librosa.onset.onset_strength(y=y, sr=22050, hop_length=512, fmax=200)
        et = librosa.times_like(env, sr=22050, hop_length=512)
        ev = np.interp(bt, et, env)
        ph = int(np.argmax([ev[i::4].sum() for i in range(4)]))
        bp = ((np.arange(len(bt)) - ph) % 4) + 1
    g = make_grid(bt, bp, C.dur)
    # tempo sanity: compare with an independent onset-periodicity estimate (half/double-time hint)
    import librosa
    y22 = C.mono("mix", 22050)
    oenv = librosa.onset.onset_strength(y=y22, sr=22050, hop_length=512)
    tempo_lib = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=oenv, sr=22050, hop_length=512))[0])
    g["bpm_librosa"] = tempo_lib
    g["method"] = method
    g["first_downbeat"] = float(g["bar_starts"][0])
    C.R["rhythm"] = g
    C.save("rhythm", g)
    log(f"rhythm: {g['bpm']:.2f} bpm ({method}), steady={g['steady']} resid {g['beat_resid_ms']:.1f} ms, {len(g['bar_starts'])-1} bars, "
        f"bar0 at {g['bar_starts'][0]:.3f}s, bpb={g['beats_per_bar']}, librosa tempo {tempo_lib:.1f}")


# ============================================================================ 3. chords (madmom CNN + CRF on the instrumental)
def parse_chord(label):
    """'F:min' -> (5, 'min'); 'N' -> None."""
    if not label or label == "N" or label == "X":
        return None
    root, _, q = label.partition(":")
    flat = {"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10, "Cb": 11, "Fb": 4}
    sharp = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11, "E#": 5, "B#": 0}
    pc = flat.get(root, sharp.get(root))
    if pc is None:
        return None
    return pc, ("min" if q.startswith("min") else "maj")


def chord_name(pc, q, flats=True):
    if pc is None:
        return "N"
    return (NOTE_NAMES if flats else PC_NAMES_SHARP)[pc] + ("m" if q == "min" else "")


def stage_chords(C):
    r = C.cached("chords")
    if r:
        C.R["chords"] = r
        log("chords: cached")
        return
    from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
    src = C.args.chord_src
    wav = os.path.join(C.out, "instrumental.wav") if src == "instrumental" else mix_wav_path(C)
    fp = C.cpath(f"chord_feat_{src}.npy")
    if os.path.exists(fp) and "chord_feat" not in C.args.force_set:
        feat = np.load(fp)
    else:
        feat = CNNChordFeatureProcessor()(wav)
        np.save(fp, feat)
    segs = CRFChordRecognitionProcessor()(feat)
    raw = [(float(a), float(b), str(l)) for a, b, l in segs]
    G = Grid(C.need("rhythm"))
    bars = []
    for b in range(G.n_bars):
        s, e = G.bar_span(b)
        halves = []
        for h in range(2):
            hs, he = s + (e - s) * h / 2, s + (e - s) * (h + 1) / 2
            votes = collections.Counter()
            for a, z, l in raw:
                ov = min(z, he) - max(a, hs)
                if ov > 0:
                    votes[l] += ov
            halves.append(votes)
        whole = halves[0] + halves[1]
        top, topv = (whole.most_common(1)[0] if whole else ("N", 0.0))
        tot = sum(whole.values()) or 1.0
        h1 = halves[0].most_common(1)[0] if halves[0] else ("N", 0.0)
        h2 = halves[1].most_common(1)[0] if halves[1] else ("N", 0.0)
        half = (e - s) / 2
        split = (h1[0] != h2[0] and h1[1] >= 0.7 * half and h2[1] >= 0.7 * half)
        bars.append(dict(bar=b, label=top, share=topv / tot, split=bool(split), first=h1[0], second=h2[0]))
    res = dict(source=src, raw=raw, bars=bars)
    C.R["chords"] = res
    C.save("chords", res)
    log(f"chords: {len(raw)} segments, {sum(1 for x in bars if x['split'])} split bars")


# ============================================================================ note segmentation (shared by melody and bass)
def viterbi_notes(midi_f, voiced, lo, hi, sigma=0.5, j_base=3.0, j_slope=0.3, rest_enter=2.0, rest_exit=2.0,
                  unv_cost=1.2, voiced_rest=3.0, cap=8.0):
    """Quantise a frame-wise pitch track to semitone-state notes (HMM-style segmentation, Viterbi).
    midi_f: fractional MIDI per frame (nan allowed); voiced: bool per frame. Returns int array: MIDI state or -1 (rest)."""
    T = len(midi_f)
    states = np.arange(lo, hi + 1)
    S = len(states)
    v = np.isfinite(midi_f) & voiced
    E = np.zeros((T, S + 1))
    d = np.where(v, midi_f, 0.0)[:, None] - states[None, :]
    c = np.minimum(d * d / (2 * sigma * sigma), cap)
    E[:, :S] = np.where(v[:, None], c, unv_cost)
    E[:, S] = np.where(v, voiced_rest, 0.0)
    Tm = np.zeros((S + 1, S + 1))
    dd = np.abs(states[:, None] - states[None, :])
    Tm[:S, :S] = j_base + j_slope * dd
    np.fill_diagonal(Tm, 0.0)
    Tm[:S, S] = rest_enter
    Tm[S, :S] = rest_exit
    D = np.empty((T, S + 1))
    P = np.zeros((T, S + 1), np.int16)
    D[0] = E[0]
    for t in range(1, T):
        cand = D[t - 1][:, None] + Tm
        P[t] = cand.argmin(0)
        D[t] = cand[P[t], np.arange(S + 1)] + E[t]
    path = np.empty(T, np.int16)
    path[-1] = D[-1].argmin()
    for t in range(T - 1, 0, -1):
        path[t - 1] = P[t, path[t]]
    return np.where(path == S, -1, states[np.minimum(path, S - 1)])


def runs_of(path):
    """[(start_idx, end_idx_exclusive, state)] for runs of equal state in an int array."""
    out = []
    if len(path) == 0:
        return out
    a = 0
    for i in range(1, len(path) + 1):
        if i == len(path) or path[i] != path[a]:
            out.append((a, i, int(path[a])))
            a = i
    return out


def rms_db(x, sr, hop, frame):
    import librosa
    r = librosa.feature.rms(y=x, frame_length=frame, hop_length=hop, center=True)[0]
    return 20 * np.log10(np.maximum(r, 1e-7))


def split_by_energy(path, edb, hop_s, min_dip=3.0, edge=0.05, win=0.12, min_len=0.16):
    """Split constant-pitch runs where the loudness dips (re-articulated notes of equal pitch)."""
    out = path.copy()
    nxt = max(int(path.max()) + 1000, 1000)
    sm = np.convolve(edb, np.ones(3) / 3, mode="same")
    w = max(2, int(win / hop_s))
    e = max(1, int(edge / hop_s))
    splits = 0
    for a, b, st in runs_of(path):
        if st < 0 or (b - a) * hop_s < min_len:
            continue
        seg = sm[a:b]
        n = len(seg)
        cuts = []
        for i in range(e, n - e):
            if seg[i] == seg[max(0, i - w):min(n, i + w + 1)].min() and (i == 0 or seg[i] < seg[i - 1] or seg[i] <= seg[i + 1]):
                left = seg[max(0, i - w):i].max() if i > 0 else seg[i]
                right = seg[i + 1:min(n, i + w + 1)].max() if i < n - 1 else seg[i]
                if min(left, right) - seg[i] >= min_dip and (not cuts or i - cuts[-1] > e):
                    cuts.append(i)
        for c in cuts:
            nxt += 1
            out[a + c:b] = nxt            # unique id for the following piece(s); fixed below
            splits += 1
            # subsequent cuts re-assign further down
        # map the temporary ids back to the original pitch state with a flag array
    return out, splits


def notes_from_path(path, midi_f, vprob, f0hz, t_frames, hop_s, min_dur=0.06, state_of=None):
    """Turn a (possibly id-split) state path into note dicts. state_of maps temporary ids to semitone states."""
    notes = []
    for a, b, st in runs_of(path):
        if st < 0:
            continue
        dur = (b - a) * hop_s
        if dur < min_dur:
            continue
        seg = midi_f[a:b]
        fin = np.isfinite(seg)
        if fin.sum() < 2:
            continue
        lo_i, hi_i = int(0.15 * (b - a)), max(int(0.85 * (b - a)), int(0.15 * (b - a)) + 1)
        core = seg[lo_i:hi_i]
        core = core[np.isfinite(core)]
        med = float(np.median(core if len(core) else seg[fin]))
        pitch = int(state_of[st]) if state_of is not None else int(st)
        notes.append(dict(t=float(t_frames[a] - hop_s / 2), dur=float(dur), midi=pitch, f0_midi=med,
                          cents=float(100 * (med - pitch)), conf=float(np.nanmean(vprob[a:b])), i0=int(a), i1=int(b)))
    return notes


def clean_notes(notes, short=0.09, gap=0.04, dsemi=2, margin=7):
    """Absorb very short glide/scoop fragments into a neighbour and flag notes far outside the core range
    (bass/hat leakage, octave errors). The core range comes from loud, confident notes."""
    if not notes:
        return notes
    loud = np.array([n["loud_db"] for n in notes])
    qual = [n for n in notes if n["loud_db"] >= np.median(loud) - 15 and n["conf"] >= 0.2] or notes
    ms = np.array([n["midi"] for n in qual])
    du = np.array([n["dur"] for n in qual])
    o = np.argsort(ms)
    cs = np.cumsum(du[o]) / du.sum()
    p05, p95 = ms[o][min(np.searchsorted(cs, 0.05), len(ms) - 1)], ms[o][min(np.searchsorted(cs, 0.95), len(ms) - 1)]
    res = []
    for i, d in enumerate(notes):
        d = dict(d)
        d["outlier"] = bool(d["midi"] < p05 - margin or d["midi"] > p95 + margin or d["loud_db"] < np.median(loud) - 22)
        if d["dur"] < short:
            prv = res[-1] if res else None
            nxt = notes[i + 1] if i + 1 < len(notes) else None
            if prv and abs(prv["midi"] - d["midi"]) <= dsemi and d["t"] - (prv["t"] + prv["dur"]) < gap:
                prv["dur"] = d["t"] + d["dur"] - prv["t"]
                prv["i1"] = d["i1"]
                continue
            if nxt and abs(nxt["midi"] - d["midi"]) <= dsemi and nxt["t"] - (d["t"] + d["dur"]) < gap:
                continue
        res.append(d)
    return res


def segment_notes(f0hz, vflag, vprob, edb, t_frames, hop_s, lo, hi, split_energy=True, min_dur=0.06, **kw):
    midi_f = np.where(np.isfinite(f0hz), hz_to_midi(np.where(np.isfinite(f0hz), f0hz, 440.0)), np.nan)
    path = viterbi_notes(midi_f, vflag & np.isfinite(f0hz), lo, hi, **kw)
    state_of = {int(s): int(s) for s in np.unique(path)}
    if split_energy:
        # temporary ids >= 1000 keep the original pitch in state_of
        orig = path.copy()
        newp, ns = split_by_energy(path, edb, hop_s)
        for i in np.unique(newp):
            if i >= 1000:
                state_of[int(i)] = int(orig[np.where(newp == i)[0][0]])
        path = newp
    notes = notes_from_path(path, midi_f, vprob, f0hz, t_frames, hop_s, min_dur=min_dur, state_of=state_of)
    for n in notes:
        n["loud_db"] = float(np.mean(edb[n["i0"]:n["i1"]]))
    return notes


# ============================================================================ 5. melody (pyin) + vibrato + doubles
def pyin_track(x, sr, fmin, fmax, frame, hop, cache_path=None, force=False, **kw):
    import librosa
    if cache_path and os.path.exists(cache_path) and not force:
        z = np.load(cache_path)
        return z["f0"], z["vflag"], z["vprob"]
    f0, vflag, vprob = librosa.pyin(x, fmin=fmin, fmax=fmax, sr=sr, frame_length=frame, hop_length=hop, fill_na=np.nan, **kw)
    if cache_path:
        np.savez_compressed(cache_path, f0=f0, vflag=vflag, vprob=vprob)
    return f0, vflag, vprob


def vibrato_stats(note, f0hz, hop_s):
    """rate (Hz), depth (cents, half peak-to-peak) of vibrato on a held note, or None."""
    a, b = note["i0"], note["i1"]
    seg = f0hz[a:b]
    if len(seg) * hop_s < 0.38:
        return None
    ok = np.isfinite(seg)
    if ok.mean() < 0.85:
        return None
    idx = np.arange(len(seg))
    seg = np.interp(idx, idx[ok], seg[ok])
    c = 1200 * np.log2(seg / np.median(seg))
    k = max(3, int(round(0.20 / hop_s)) | 1)
    trend = np.convolve(np.pad(c, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    d = c - trend
    d = d[int(0.06 / hop_s):len(d) - int(0.04 / hop_s)] if len(d) > 12 else d
    if len(d) * hop_s < 0.3:
        return None
    n = 1 << int(np.ceil(np.log2(len(d) * 8)))
    sp = np.abs(np.fft.rfft((d - d.mean()) * np.hanning(len(d)), n)) ** 2
    fr = np.fft.rfftfreq(n, hop_s)
    band = (fr >= 3.5) & (fr <= 9.0)
    if not band.any() or sp.sum() <= 0:
        return None
    pk = int(np.argmax(np.where(band, sp, 0)))
    near = (fr >= fr[pk] - 0.8) & (fr <= fr[pk] + 0.8)
    frac = float(sp[near].sum() / sp[fr >= 1.0].sum())
    depth = float((np.percentile(d, 95) - np.percentile(d, 5)) / 2)
    cycles = fr[pk] * len(d) * hop_s
    if frac >= 0.30 and depth >= 10 and cycles >= 1.8:
        return dict(rate=float(fr[pk]), depth=depth, frac=frac)
    return None


def stage_melody(C):
    r = C.cached("melody")
    if r:
        C.R["melody"] = r
        log("melody: cached")
        return
    import librosa
    G = Grid(C.need("rhythm"))
    sr, hop, frame = 22050, 256, 2048
    x = C.mono("voc", sr)
    hop_s = hop / sr
    f0, vflag, vprob = pyin_track(x, sr, 65.4, 1046.5, frame, hop, cache_path=C.cpath("pyin_vocals.npz"),
                                  force="pyin_vocals" in C.args.force_set)
    t_frames = librosa.times_like(f0, sr=sr, hop_length=hop)
    edb = rms_db(x, sr, hop, 1024)[:len(f0)]
    edb = np.pad(edb, (0, max(0, len(f0) - len(edb))), constant_values=-120)
    notes = clean_notes(segment_notes(f0, vflag, vprob, edb, t_frames, hop_s, 36, 96, split_energy=True, min_dur=C.args.min_note))
    for i, n in enumerate(notes):
        prev = notes[i - 1] if i else None
        gap = n["t"] - (prev["t"] + prev["dur"]) if prev else 9.9
        dp = abs(n["midi"] - prev["midi"]) if prev else 12
        k0 = n["i0"]
        left = edb[max(0, k0 - 8):k0 + 1].max() if k0 > 0 else edb[0]
        right = edb[k0:k0 + 8].max()
        valley = edb[max(0, k0 - 4):k0 + 4].min()
        n["onset_db"] = float(min(left, right) - valley)
        # how clearly this note starts a new syllable: after a rest or a pitch change = 1, a loudness dip alone = depth / 8 dB
        n["onset_strength"] = 1.0 if (gap >= 0.04 or dp >= 1) else float(np.clip(n["onset_db"] / 8.0, 0.1, 0.9))
    for n in notes:
        n["vib"] = vibrato_stats(n, f0, hop_s)
        n["bar"], n["beat"] = G.locate(n["t"])
        n["name"] = midi_name(n["midi"])
    # vocal range / vibrato / doubles summary ------------------------------------------------------------------------
    core = [n for n in notes if not n["outlier"]]
    ms = np.array([n["midi"] for n in core])
    du = np.array([n["dur"] for n in core])
    rng = {}
    if len(ms):
        def wperc(q):
            o = np.argsort(ms)
            cs = np.cumsum(du[o]) / du.sum()
            return int(ms[o][np.searchsorted(cs, q)])
        rng = dict(lowest=midi_name(ms.min()), highest=midi_name(ms.max()), p05=midi_name(wperc(0.05)), p95=midi_name(wperc(0.95)),
                   median=midi_name(wperc(0.5)), tessitura=[midi_name(wperc(0.25)), midi_name(wperc(0.75))],
                   span_semitones=int(wperc(0.95) - wperc(0.05)), n_notes=len(core), n_outliers=len(notes) - len(core))
    held = [n for n in core if n["dur"] >= 0.4]
    vib = [n["vib"] for n in held if n["vib"]]
    vibs = dict(n_held=len(held), n_vibrato=len(vib), share=(len(vib) / len(held)) if held else 0.0,
                rate_hz=float(np.median([v["rate"] for v in vib])) if vib else None,
                depth_cents=float(np.median([v["depth"] for v in vib])) if vib else None)
    # side-channel energy of the vocal stem per bar (doubled / harmonised vocals are wider than a centred lead)
    v = C.voc
    mid, side = (v[0] + v[1]) / 2, (v[0] - v[1]) / 2
    bars = []
    for b in range(G.n_bars):
        s0, s1 = G.bar_span(b)
        a, z = max(0, int(s0 * SR)), min(v.shape[1], int(s1 * SR))
        if z - a < 1000:
            bars.append(dict(bar=b, voc_db=-120.0, side_db=None)); continue
        m_e, s_e = float(np.mean(mid[a:z] ** 2)), float(np.mean(side[a:z] ** 2))
        bars.append(dict(bar=b, voc_db=float(db(m_e)), side_db=float(db(s_e) - db(m_e))))
    res = dict(notes=notes, range=rng, vibrato=vibs, vocal_bars=bars, params=dict(sr=sr, hop=hop, frame=frame),
               voiced_frac=float(np.mean(vflag)))
    C.R["melody"] = res
    C.save("melody", res)
    log(f"melody: {len(notes)} notes, range {rng.get('lowest')}-{rng.get('highest')}, vibrato {vibs['n_vibrato']}/{vibs['n_held']} held")


# ============================================================================ 7. drums (HPSS percussive -> K / S / H grid)
def otsu_thr(vals, power=1.0, min_ratio=2.0, min_frac=0.02, floor_rel=0.06):
    """Otsu threshold (on vals**power) between 'hit' and 'no hit' step activations, with sanity guards. inf = no hits."""
    v = np.asarray(vals, float)
    v = v[np.isfinite(v)]
    if len(v) < 8 or v.max() <= 0:
        return np.inf
    w = v ** power
    hist, edges = np.histogram(w, bins=64)
    ctr = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist).astype(float)
    w1 = w0[-1] - w0
    m0 = np.cumsum(hist * ctr) / np.maximum(w0, 1)
    m1 = (np.sum(hist * ctr) - np.cumsum(hist * ctr)) / np.maximum(w1, 1)
    i = int(np.argmax(w0 * w1 * (m0 - m1) ** 2))
    thr = ctr[i] ** (1.0 / power)
    hi, lo = v[v > thr], v[v <= thr]
    if len(hi) < min_frac * len(v) or len(lo) == 0 or np.mean(hi) < min_ratio * max(np.mean(lo), 1e-9):
        return np.inf
    return float(max(thr, floor_rel * np.percentile(v, 99)))


# band (Hz), percentile across bins (robust to tonal onsets), frame lag of the flux, Otsu power, threshold multiplier
DRUM_BANDS = {"K": (30.0, 140.0, 50, 3, 1.0, 1.0), "S": (150.0, 10000.0, 75, 2, 0.5, 0.6), "H": (7000.0, 16000.0, 75, 1, 0.5, 1.0)}


def band_flux_curve(P, freqs, lo, hi, pct, dn, gamma=30.0):
    k = (freqs >= lo) & (freqs < hi)
    Pb = P[k]
    scale = np.percentile(Pb.max(0), 98) + 1e-9
    L = np.log1p(gamma * Pb / scale)
    d = np.maximum(0.0, L[:, dn:] - L[:, :-dn])
    d = np.concatenate([np.zeros((d.shape[0], dn)), d], axis=1)
    return np.percentile(d, pct, axis=0)


def stage_drums(C):
    r = C.cached("drums")
    if r:
        C.R["drums"] = r
        log("drums: cached")
        return
    import librosa
    G = Grid(C.need("rhythm"))
    n_fft, hop = 2048, 512
    x = to_mono(C.ins).astype(np.float32)
    mag = np.abs(librosa.stft(x, n_fft=n_fft, hop_length=hop))
    H, P = librosa.decompose.hpss(mag, kernel_size=(31, 31), margin=(1.0, 2.5))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=n_fft)
    flux = {k: band_flux_curve(P, freqs, v[0], v[1], v[2], v[3]) for k, v in DRUM_BANDS.items()}
    hop_s = hop / SR
    steps = 4 * G.bpb
    nb = G.n_bars
    act = {k: np.zeros((nb, steps)) for k in flux}
    tpk = {k: np.zeros((nb, steps)) for k in flux}
    nfr = len(flux["K"])
    for b in range(nb):
        s0, s1 = G.bar_span(b)
        st = (s1 - s0) / steps
        for si in range(steps):
            tc = s0 + si * st
            a = max(0, int(round((tc - 0.40 * st) / hop_s)))
            z = min(nfr, int(round((tc + 0.40 * st) / hop_s)) + 1)
            if z <= a:
                continue
            for k in flux:
                seg = flux[k][a:z]
                j = int(np.argmax(seg))
                act[k][b, si] = seg[j]
                tpk[k][b, si] = (a + j) * hop_s + 0.006
    bar_rms = np.array([np.sqrt(np.mean(x[max(0, int(G.bar_span(b)[0] * SR)):max(1, int(G.bar_span(b)[1] * SR))] ** 2) + 1e-12)
                        for b in range(nb)])
    live = db(bar_rms ** 2) > db(np.percentile(bar_rms, 95) ** 2) - 45          # silent bars never contain hits
    thr = {k: otsu_thr(act[k][live].ravel(), power=DRUM_BANDS[k][4]) * DRUM_BANDS[k][5] for k in act}
    hits = {k: (act[k] > thr[k]) & live[:, None] for k in act}
    if G.bpb == 4:      # a kick's broadband click looks like a clap: off the backbeat, a snare on a kick step is not trusted
        bb = np.zeros(steps, bool)
        bb[[4, 12]] = True
        hits["S"] = hits["S"] & (~hits["K"] | bb[None, :])
    pats = []
    for b in range(nb):
        k = "".join("K" if v else "." for v in hits["K"][b])
        sn = "".join("S" if v else "." for v in hits["S"][b])
        h = "".join("H" if v else "." for v in hits["H"][b])
        pats.append(f"{k} | {sn} | {h}")
    # pattern ids: merge rare near-duplicates into the nearest frequent pattern
    cnt = collections.Counter(pats)

    def dist(a, b2):
        d = 0.0
        for la, lb, w in zip(a.split(" | "), b2.split(" | "), (1.0, 1.0, 0.4)):
            d += w * sum(1 for u, v in zip(la, lb) if u != v)
        return d

    def is_empty(p):
        return p.replace(".", "").replace("|", "").replace(" ", "") == ""

    order = [p for p, _ in cnt.most_common()]
    canon = {}
    for p in order:
        if cnt[p] <= 3 and not is_empty(p):
            best = None
            for q in order:
                if q == p or cnt[q] <= cnt[p] or is_empty(q):
                    continue
                dq = dist(p, q)
                if dq <= 3.0 and (best is None or dq < best[0]):
                    best = (dq, q)
            canon[p] = best[1] if best else p
        else:
            canon[p] = p
    final = [canon[p] for p in pats]
    ids, seen = {}, 0
    ids[" | ".join(["." * steps] * 3)] = "D0"
    for p in final:
        if p not in ids:
            seen += 1
            ids[p] = f"D{seen}"
    legend = collections.OrderedDict()
    for p in final:
        legend.setdefault(ids[p], dict(pattern=p, bars=0))["bars"] += 1
    times = {k: [float(tpk[k][b, si]) for b, si in zip(*np.where(hits[k]))] for k in hits}
    res = dict(steps=steps, thresholds={k: (None if not np.isfinite(v) else float(v)) for k, v in thr.items()},
               bars=[dict(bar=b, pattern=final[b], raw=pats[b], id=ids[final[b]], variant=bool(final[b] != pats[b]), live=bool(live[b]))
                     for b in range(nb)],
               legend=legend, times=times, density={k: float(hits[k][live].mean()) if live.any() else 0.0 for k in hits})
    C.R["drums"] = res
    C.save("drums", res)
    log(f"drums: thr { {k: (round(float(v), 3) if np.isfinite(v) else None) for k, v in thr.items()} }, {len(legend)} patterns, hits "
        f"{ {k: int(v.sum()) for k, v in hits.items()} }")


# ============================================================================ 6. bass (mono pitch under 250 Hz)
def grid_str_from_times(G, b, times, n_steps):
    """string with 'X' at the grid step nearest to each time inside bar b."""
    s0, s1 = G.bar_span(b)
    out = ["."] * n_steps
    for t in times:
        if s0 - 0.02 <= t < s1 + 0.02:
            k = int(round((t - s0) / (s1 - s0) * n_steps))
            if 0 <= k < n_steps:
                out[k] = "X"
            elif k == n_steps:
                pass
    return "".join(out)


def chord_lookup(C):
    """function t -> (root_pc, quality) | None from the raw chord segments."""
    raw = C.need("chords")["raw"]
    st = np.array([r[0] for r in raw])
    en = np.array([r[1] for r in raw])
    labs = [parse_chord(r[2]) for r in raw]

    def at(t):
        i = int(np.searchsorted(st, t, side="right") - 1)
        if 0 <= i < len(raw) and t < en[i] + 1e-6:
            return labs[i]
        return None
    return at


def octave_fix(seg, sr, midi):
    """pyin sometimes reports the sub-octave of a pure low tone: move up an octave when the spectrum has much more at 2f than at f."""
    if len(seg) < 256:
        return midi
    w = np.hanning(len(seg))
    n = 1 << int(np.ceil(np.log2(len(seg) * 8)))
    X = np.abs(np.fft.rfft(seg * w, n))
    fr = np.fft.rfftfreq(n, 1.0 / sr)

    def peak(f):
        m = (fr > f * 2 ** (-0.5 / 12)) & (fr < f * 2 ** (0.5 / 12))
        return X[m].max() if m.any() else 0.0
    f = float(midi_to_hz(midi))
    if 2 * f < 300 and peak(2 * f) > 2.0 * peak(f):
        return midi + 12
    return midi


def stage_bass(C):
    r = C.cached("bass")
    if r:
        C.R["bass"] = r
        log("bass: cached")
        return
    import librosa
    G = Grid(C.need("rhythm"))
    kicks = np.array(C.need("drums")["times"]["K"])
    chord_at = chord_lookup(C)
    sr_b, hop, frame = 4000, 32, 1024
    x = to_mono(C.ins).astype(np.float64)
    sos = ss.butter(4, 250, "low", fs=SR, output="sos")
    xl = ss.sosfiltfilt(sos, x)
    xb = ss.resample_poly(xl, 40, 441).astype(np.float32)          # 44100 -> 4000
    hop_s = hop / sr_b
    f0, vflag, vprob = pyin_track(xb, sr_b, 32.0, 300.0, frame, hop, cache_path=C.cpath("pyin_bass.npz"),
                                  force="pyin_bass" in C.args.force_set)
    t_frames = librosa.times_like(f0, sr=sr_b, hop_length=hop)
    edb = rms_db(xb, sr_b, hop, 256)[:len(f0)]
    edb = np.pad(edb, (0, max(0, len(f0) - len(edb))), constant_values=-120)
    ref = np.percentile(edb, 90)
    # a tuned kick sits in the same band as the bass: ignore the first ~180 ms after every detected kick
    kzone = np.zeros(len(f0), bool)
    for kt in kicks:
        kzone[(t_frames >= kt - 0.02) & (t_frames < kt + 0.18)] = True
    vflag2 = vflag & (edb > ref - 30) & ~kzone
    notes = segment_notes(f0, vflag2, vprob, edb, t_frames, hop_s, 22, 64, split_energy=False, min_dur=0.07, sigma=0.7, j_base=3.5)
    for n in notes:                                   # the bass is ducked under its kick: snap the attack back to the kick
        j = np.searchsorted(kicks, n["t"]) - 1
        if j >= 0 and 0.0 <= n["t"] - (kicks[j] + 0.18) < 0.06:
            n["dur"] += n["t"] - kicks[j]
            n["t"] = float(kicks[j])
        n["bar"], n["beat"] = G.locate(n["t"])
        n["name"] = midi_name(n["midi"])
    # one note per beat: duration-weighted vote with a preference for chord tones (a leaked kick is rarely one)
    reg = float(np.median([n["midi"] for n in notes])) if notes else 36.0
    low_gate = np.percentile(edb, 90) - 25
    per_beat = []
    for bi in range(len(G.beat_t) - 1):
        a, z = G.beat_t[bi], G.beat_t[bi + 1]
        if G.beat_bar[bi] < 0 or a >= C.dur:
            continue
        ch = chord_at((a + z) / 2)
        tones = {ch[0], (ch[0] + (3 if ch[1] == "min" else 4)) % 12, (ch[0] + 7) % 12} if ch else set()
        votes = collections.Counter()
        raw_tot = 0.0
        for n in notes:
            ov = min(z, n["t"] + n["dur"]) - max(a, n["t"])
            if ov > 0:
                raw_tot += ov
                w = 1.0
                if ch:
                    rel = (n["midi"] - ch[0]) % 12
                    w += 0.8 * (rel == 0) + 0.3 * (rel == 7) + 0.2 * (rel == (3 if ch[1] == "min" else 4))
                votes[n["midi"]] += ov * w
        src, m, share = "tracked", None, 0.0
        if votes and raw_tot >= 0.30 * (z - a):
            m, v = votes.most_common(1)[0]
            share = float(v / sum(votes.values()))
            m = octave_fix(xb[int(a * sr_b):int(z * sr_b)], sr_b, m)
        # beats whose tracked pitch is not a chord tone (kick/sub leakage), or that were fully masked, fall back to the chord root
        loud = float(np.mean(edb[(t_frames >= a) & (t_frames < z)])) > low_gate if np.any((t_frames >= a) & (t_frames < z)) else False
        if ch and loud and (m is None or (m % 12) not in tones):
            octs = [ch[0] + 12 * k for k in range(1, 7)]
            m = int(min(octs, key=lambda q: abs(q - reg)))
            src, share = "chord-root", 0.0
        per_beat.append(dict(beat=bi, t=float(a), bar=int(G.beat_bar[bi]), pos=int(G.beat_pos[bi]) + 1,
                             midi=(int(m) if m is not None else None), name=(midi_name(m) if m is not None else "-"),
                             source=(src if m is not None else None), share=share))
    steps = 4 * G.bpb
    attacks = [grid_str_from_times(G, b, [n["t"] for n in notes], steps) for b in range(G.n_bars)]
    res = dict(notes=notes, per_beat=per_beat, attacks=attacks, register=dict(
        lowest=midi_name(min((n["midi"] for n in notes), default=0)), highest=midi_name(max((n["midi"] for n in notes), default=0))))
    C.R["bass"] = res
    C.save("bass", res)
    log(f"bass: {len(notes)} notes, {sum(1 for p in per_beat if p['midi'] is not None)}/{len(per_beat)} beats pitched")


# ============================================================================ 4. lyrics (phrases -> Whisper -> word timing)
def otsu_db(vals):
    v = np.asarray(vals, float)
    hist, edges = np.histogram(v, bins=80)
    ctr = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist).astype(float)
    w1 = w0[-1] - w0
    m0 = np.cumsum(hist * ctr) / np.maximum(w0, 1)
    m1 = (np.sum(hist * ctr) - np.cumsum(hist * ctr)) / np.maximum(w1, 1)
    return float(ctr[int(np.argmax(w0 * w1 * (m0 - m1) ** 2))])


def vocal_phrases(x16, gap=0.20, min_len=0.30, max_len=12.0, hop=160, dip_db=15.0, dip_len=0.12):
    """Segment a vocal stem into phrases by energy: [(start, end)] in seconds."""
    edb = rms_db(x16, 16000, hop, 400)
    hop_s = hop / 16000
    sm = np.convolve(edb, np.ones(3) / 3, mode="same")
    active_lvls = sm[sm > -75]
    if len(active_lvls) < 10:
        return [], sm, hop_s
    thr_otsu = otsu_db(active_lvls)
    top = np.percentile(active_lvls, 95)
    thr = max(thr_otsu - 3.0, top - 40.0)          # between 'residual leakage' and 'voice', never more than 40 dB under the peak
    act = sm > thr
    # fill short gaps (consonants, breaths), then drop short blips
    idx = np.where(act)[0]
    if len(idx) == 0:
        return [], sm, hop_s
    segs = []
    a = idx[0]
    prev = idx[0]
    for i in idx[1:]:
        if (i - prev) * hop_s > gap:
            segs.append((a, prev + 1))
            a = i
        prev = i
    segs.append((a, prev + 1))
    # split at clear loudness valleys (>= 12 dB under the local maxima for >= 100 ms): breaths and rests between lines
    from scipy.ndimage import maximum_filter1d
    lmax = maximum_filter1d(sm, size=int(1.2 / hop_s))
    deep = sm < lmax - dip_db
    split_segs = []
    for a, b in segs:
        cuts, i = [], a
        while i < b:
            if deep[i]:
                j = i
                while j < b and deep[j]:
                    j += 1
                if (j - i) * hop_s >= dip_len and i > a + 5 and j < b - 5:
                    cuts.append((i, j))
                i = j
            else:
                i += 1
        prev = a
        for (i, j) in cuts:
            split_segs.append((prev, i))
            prev = j
        split_segs.append((prev, b))
    segs = [(a * hop_s, b * hop_s) for a, b in split_segs if (b - a) * hop_s >= min_len]
    # split overly long phrases at the deepest valley near the middle
    out = []
    todo = list(segs)
    while todo:
        a, b = todo.pop(0)
        if b - a <= max_len:
            out.append((a, b))
            continue
        lo, hi = a + 0.30 * (b - a), a + 0.70 * (b - a)
        i0, i1 = int(lo / hop_s), int(hi / hop_s)
        cut = i0 + int(np.argmin(sm[i0:i1]))
        tc = cut * hop_s
        todo.insert(0, (tc + 0.02, b))
        todo.insert(0, (a, tc - 0.02))
    return out, sm, hop_s


SYL_EXC = {"fifty": 2, "thousand": 2, "every": 2, "everybody": 4, "washington": 3, "nanometers": 4, "gigawatts": 3, "silicon": 3,
           "restricted": 3, "tower": 2, "hour": 1, "fire": 1, "wafer": 2, "memory": 3, "laser": 2, "hotter": 2, "second": 2}


def count_syllables(w):
    if re.search(r"\d", w) and not re.search(r"[a-zA-Z]", w):
        return 2
    w = re.sub(r"[^a-z']", "", w.lower())
    if not w:
        return 1
    if w in SYL_EXC:
        return SYL_EXC[w]
    w2 = re.sub(r"'", "", w)
    n = len(re.findall(r"[aeiouy]+", w2))
    if w2.endswith("e") and not w2.endswith(("le", "ee", "ie", "ye")) and n > 1:
        n -= 1
    if w2.endswith(("ed",)) and not w2.endswith(("ted", "ded")) and n > 1:
        n -= 1
    if re.search(r"[^aeiou]le$", w2) and len(w2) > 2:
        pass
    return max(1, n)


def align_syllables(sylls, note_t, t0, t1, note_dur=None, note_os=None, c_skip_syl=0.30, w_pos=0.08):
    """Monotone alignment of S syllables to N note onsets (DP). Skipping a long note is expensive, skipping a short one is cheap;
    a mild relative-position term breaks ties. Returns for each syllable a note index or None."""
    S, N = len(sylls), len(note_t)
    if S == 0:
        return []
    if N == 0:
        return [None] * S
    span = max(t1 - t0, 1e-3)
    r = np.array([(i + 0.5) / S for i in range(S)])
    q = (np.asarray(note_t) - t0) / span
    dur = np.asarray(note_dur) if note_dur is not None else np.full(N, 0.2)
    os_ = np.asarray(note_os) if note_os is not None else np.ones(N)
    c_note = 0.03 + 0.30 * os_ * (0.5 + 0.5 * np.clip(dur / 0.25, 0, 1))      # cost of leaving note j without a syllable
    INF = 1e9
    dp = np.full((S + 1, N + 1), INF)
    bp = np.zeros((S + 1, N + 1, 2), int)
    dp[0, 0] = 0
    for i in range(S + 1):
        for j in range(N + 1):
            if dp[i, j] >= INF:
                continue
            if i < S and j < N:
                c = dp[i, j] + w_pos * abs(r[i] - q[j])
                if c < dp[i + 1, j + 1]:
                    dp[i + 1, j + 1], bp[i + 1, j + 1] = c, (i, j)
            if j < N:
                c = dp[i, j] + c_note[j]
                if c < dp[i, j + 1]:
                    dp[i, j + 1], bp[i, j + 1] = c, (i, j)
            if i < S:
                c = dp[i, j] + c_skip_syl
                if c < dp[i + 1, j]:
                    dp[i + 1, j], bp[i + 1, j] = c, (i, j)
    i, j = S, N
    match = [None] * S
    while i > 0 or j > 0:
        pi, pj = bp[i, j]
        if pi == i - 1 and pj == j - 1:
            match[i - 1] = j - 1
        i, j = pi, pj
    return match


def asr_phrases(C, phrases, x16):
    import sherpa_onnx
    which = C.args.asr
    cp = C.cpath(f"asr_{which}_{C.args.asr_src}.json")
    cache = {}
    if os.path.exists(cp) and "asr" not in C.args.force_set:
        cache = json.load(open(cp))
    d = os.path.join(MODELS, f"sherpa-onnx-whisper-{which}")
    rec = None
    out = []
    for (a, b) in phrases:
        key = f"{a:.2f}-{b:.2f}"
        if key in cache:
            out.append(cache[key])
            continue
        if rec is None:
            rec = sherpa_onnx.OfflineRecognizer.from_whisper(
                encoder=f"{d}/{which}-encoder.int8.onnx", decoder=f"{d}/{which}-decoder.int8.onnx",
                tokens=f"{d}/{which}-tokens.txt", language="en", task="transcribe", num_threads=4)
        i0, i1 = max(0, int((a - 0.25) * 16000)), min(len(x16), int((b + 0.25) * 16000))
        seg = x16[i0:i1].astype(np.float32)
        pk = np.abs(seg).max()
        if pk > 1e-4:
            seg = seg * min(0.7 / pk, 30.0)
        st = rec.create_stream()
        st.accept_waveform(16000, seg)
        rec.decode_stream(st)
        txt = st.result.text.strip()
        cache[key] = txt
        out.append(txt)
        log(f"asr {a:6.1f}-{b:6.1f}s: {txt[:70]}")
    json.dump(cache, open(cp, "w"))
    return out


HALLU = re.compile(r"^\W*(thank you( so much)?( for watching)?|thanks for watching|you|bye|\.+|music|applause|silence|oh)\W*$", re.I)


_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def int_to_words(n):
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    if n < 1000:
        return _ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + int_to_words(n % 100))
    for div, name in ((10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
        if n >= div:
            return int_to_words(n // div) + " " + name + ("" if n % div == 0 else " " + int_to_words(n % div))
    return str(n)


def spell_numbers(txt):
    """'50,000' -> 'fifty thousand', '2' -> 'two', '1999' -> 'nineteen ninety nine' (ASR writes digits; lyrics are words)."""
    def rep(m):
        raw = m.group(0)
        try:
            n = int(raw.replace(",", ""))
        except ValueError:
            return raw
        if n >= 10 ** 12:
            return raw
        if 1100 <= n <= 2099 and n % 100 != 0 and "," not in raw:
            return int_to_words(n // 100) + " " + int_to_words(n % 100)
        return int_to_words(n)
    out = re.sub(r"\d[\d,]*\d|\d", rep, txt)
    return re.sub(r"\s+", " ", out).strip()


def clean_asr(txt):
    txt = spell_numbers(txt)
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫♬♩]+", " ", txt)
    t = re.sub(r"\s+", " ", t).strip()
    w = t.split()
    out = []
    for x in w:                                              # break whisper repetition loops
        if len(out) >= 3 and all(o.lower().strip(",.!?") == x.lower().strip(",.!?") for o in out[-3:]):
            continue
        out.append(x)
    return " ".join(out)


def stage_lyrics(C):
    r = C.cached("lyrics")
    if r:
        C.R["lyrics"] = r
        log("lyrics: cached")
        return
    G = Grid(C.need("rhythm"))
    mel = C.need("melody")
    src = C.args.asr_src
    x16 = C.mono("voc" if src == "vocals" else "mix", 16000)
    xv16 = C.mono("voc", 16000)
    phr, sm, hop_s = vocal_phrases(xv16)
    log(f"lyrics: {len(phr)} phrases")
    texts = asr_phrases(C, phr, x16)
    notes = [n for n in mel["notes"] if not n["outlier"]]
    note_t = np.array([n["t"] for n in notes])
    out = []
    for (a, b), raw in zip(phr, texts):
        txt = clean_asr(raw)
        if not txt or HALLU.match(txt):
            out.append(dict(start=a, end=b, text="", raw=raw, words=[], kind="vocalise" if b - a > 0.3 else "noise"))
            continue
        words = [w for w in txt.split() if re.search(r"[A-Za-z0-9]", w)]
        if not words:
            out.append(dict(start=a, end=b, text="", raw=raw, words=[], kind="vocalise"))
            continue
        syl = [count_syllables(w) for w in words]
        flat = [(wi, k) for wi, n in enumerate(syl) for k in range(n)]
        sel = np.where((note_t >= a - 0.08) & (note_t <= b))[0]
        nt = note_t[sel]
        # voiced region of the phrase (first / last energy above threshold) for the interpolation fallback
        match = align_syllables(flat, nt, a, b, note_dur=np.array([notes[k]["dur"] for k in sel]),
                                note_os=np.array([notes[k].get("onset_strength", 1.0) for k in sel]))
        times = [None] * len(flat)
        for si, m in enumerate(match):
            if m is not None:
                times[si] = float(nt[m])
        # interpolate unmatched syllables between neighbours
        known = [i for i, t in enumerate(times) if t is not None]
        if len(known) < max(2, 0.4 * len(flat)):              # too few anchors (rap / whisper): spread proportionally
            times = [a + (b - a) * (i / max(1, len(flat))) for i in range(len(flat))]
        else:
            ks = np.array(known)
            kt = np.array([times[i] for i in known])
            for i in range(len(flat)):
                if times[i] is None:
                    if i < ks[0]:
                        times[i] = max(a, kt[0] - 0.2 * (ks[0] - i))
                    elif i > ks[-1]:
                        times[i] = min(b, kt[-1] + 0.2 * (i - ks[-1]))
                    else:
                        times[i] = float(np.interp(i, ks, kt))
        ws = []
        for wi, w in enumerate(words):
            idx = [i for i, (wj, k) in enumerate(flat) if wj == wi]
            ws.append(dict(w=w, start=float(times[idx[0]]), syll=len(idx)))
        for wi in range(len(ws)):
            ws[wi]["end"] = float(ws[wi + 1]["start"] if wi + 1 < len(ws) else b)
        for w in ws:
            w["bar"], w["beat"] = G.locate(w["start"])
        out.append(dict(start=a, end=b, text=txt, raw=raw, words=ws, kind="lyric"))
    for p in out:
        p["bar"], p["beat"] = G.locate(p["start"])
    res = dict(phrases=out, asr=C.args.asr, src=src, n_words=sum(len(p["words"]) for p in out))
    C.R["lyrics"] = res
    C.save("lyrics", res)
    log(f"lyrics: {res['n_words']} words in {len(out)} phrases")


# ============================================================================ 3. structure
def bar_features(C, G):
    """Per-bar feature groups used for the self-similarity matrix (all aligned to the bar grid)."""
    import librosa
    nb = G.n_bars
    cp = C.cpath("bar_features.npz")
    if os.path.exists(cp) and "structure_feat" not in C.args.force_set:
        z = np.load(cp)
        if z["chroma"].shape[0] == nb:
            return {k: z[k] for k in z.files}
    sr, hop = 22050, 512
    ins22 = C.mono("ins", sr)
    mix22 = C.mono("mix", sr)
    chroma, _ = chroma_of(ins22, sr, hop)
    tfr = librosa.times_like(chroma[0], sr=sr, hop_length=hop)
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=mix22, sr=sr, n_fft=2048, hop_length=hop, n_mels=40, fmax=11025))
    onset = librosa.onset.onset_strength(S=mel, sr=sr, hop_length=hop)
    low = np.abs(librosa.stft(mix22, n_fft=2048, hop_length=hop))
    fr = librosa.fft_frequencies(sr=sr, n_fft=2048)
    lowshare = low[fr < 200].sum(0) / (low.sum(0) + 1e-9)
    feats = {k: [] for k in ("chroma", "mel", "rms", "onset", "lowshare", "centroid")}
    cent = librosa.feature.spectral_centroid(S=low, sr=sr)[0]
    mixm = C.mono("mix", SR)
    for b in range(nb):
        s0, s1 = G.bar_span(b)
        m = (tfr >= s0) & (tfr < s1)
        if m.sum() == 0:
            m = np.zeros_like(tfr, bool)
            m[min(len(tfr) - 1, int(s0 * sr / hop))] = True
        feats["chroma"].append(chroma[:, m].mean(1))
        feats["mel"].append(mel[:, m].mean(1))
        feats["onset"].append(onset[m].mean())
        feats["lowshare"].append(lowshare[m].mean())
        feats["centroid"].append(cent[m].mean())
        a, z = max(0, int(s0 * SR)), min(len(mixm), int(s1 * SR))
        feats["rms"].append(float(db(np.mean(mixm[a:z] ** 2))) if z > a else -90.0)
    out = {k: np.array(v) for k, v in feats.items()}
    np.savez_compressed(cp, **out)
    return out


def vocal_presence_per_bar(C, G):
    """Fraction of each bar covered by detected vocal phrases (sung, spoken or vocalised)."""
    ph = [(p["start"], p["end"]) for p in C.need("lyrics")["phrases"] if p["kind"] != "noise"]
    out = np.zeros(G.n_bars)
    for b in range(G.n_bars):
        s0, s1 = G.bar_span(b)
        cov = sum(max(0.0, min(s1, e) - max(s0, a)) for a, e in ph)
        out[b] = min(1.0, cov / (s1 - s0))
    return out


def zs(x, axis=0):
    x = np.asarray(x, float)
    sd = x.std(axis=axis, keepdims=True)
    return (x - x.mean(axis=axis, keepdims=True)) / np.where(sd < 1e-9, 1.0, sd)


def build_bar_matrix(F, vocal, drums_density):
    ch = np.sqrt(F["chroma"] / (F["chroma"].sum(1, keepdims=True) + 1e-9))
    parts = [
        (zs(ch), 1.0 / math.sqrt(12)),
        (zs(F["mel"]), 1.2 / math.sqrt(40)),
        (zs(F["rms"])[:, None], 0.9),
        (zs(F["onset"])[:, None], 0.5),
        (zs(F["lowshare"])[:, None], 0.4),
        (zs(F["centroid"])[:, None], 0.5),
        (zs(vocal)[:, None], 0.9),
        (zs(drums_density)[:, None], 0.6),
    ]
    return np.concatenate([w * p for p, w in parts], axis=1)


def ssm_of(X, ctx=2):
    """cosine self-similarity of bar vectors, each stacked with its next ctx-1 bars (so a bar is compared with its context)."""
    n = len(X)
    Xs = np.concatenate([X[np.minimum(np.arange(n) + k, n - 1)] for k in range(ctx)], axis=1)
    Xs = Xs - Xs.mean(0)
    nrm = np.linalg.norm(Xs, axis=1, keepdims=True)
    Xn = Xs / np.where(nrm < 1e-9, 1.0, nrm)
    return Xn @ Xn.T


def novelty_curve(S, half=4):
    n = S.shape[0]
    k = np.zeros((2 * half, 2 * half))
    g = np.exp(-0.5 * (np.arange(-half + 0.5, half) / (half * 0.6)) ** 2)
    G2 = np.outer(g, g)
    sgn = np.outer(np.r_[-np.ones(half), np.ones(half)], np.r_[-np.ones(half), np.ones(half)])
    k = G2 * sgn
    Sp = np.pad(S, half, mode="edge")
    nov = np.zeros(n + 1)
    for b in range(n + 1):                                  # boundary before bar b
        blk = Sp[b:b + 2 * half, b:b + 2 * half]
        nov[b] = (blk * k).sum()
    nov = np.maximum(nov, 0)
    return nov


def dp_segments(nov, n, lam=0.30, minlen=2):
    """boundaries maximising novelty minus a per-segment penalty with a preference for 2/4/8/16-bar sections."""
    prior = {1: -1.2, 2: -0.05, 3: -0.5, 4: 0.12, 5: -0.5, 6: -0.15, 7: -0.45, 8: 0.2, 9: -0.5, 10: -0.35, 12: -0.1, 16: 0.0}
    nv = nov / (np.percentile(nov[1:-1], 95) + 1e-9) if n > 3 else nov
    best = np.full(n + 1, -1e9)
    prev = np.zeros(n + 1, int)
    best[0] = 0.0
    for b in range(1, n + 1):
        for a in range(max(0, b - 32), b):
            L = b - a
            if L < minlen and not (b == n):
                continue
            pr = prior.get(L, -0.6 if L < 24 else -1.0)
            sc = best[a] + (nv[b] if b < n else 0.0) + pr - lam
            if sc > best[b]:
                best[b], prev[b] = sc, a
    cuts, b = [], n
    while b > 0:
        cuts.append(b)
        b = prev[b]
    cuts = sorted(cuts)
    return [0] + cuts


def segment_similarity(S, segs):
    k = len(segs)
    M = np.zeros((k, k))
    for i, (a, b) in enumerate(segs):
        for j, (c, d) in enumerate(segs):
            L = min(b - a, d - c)
            vals = [S[a + t, c + t] for t in range(L)]
            lenpen = min(b - a, d - c) / max(b - a, d - c)
            M[i, j] = np.mean(vals) * (0.75 + 0.25 * lenpen)
    return M


def cluster_letters(M, thr=0.55):
    from scipy.cluster.hierarchy import linkage, fcluster
    from scipy.spatial.distance import squareform
    D = 1 - M
    np.fill_diagonal(D, 0)
    D = (D + D.T) / 2
    if len(M) < 2:
        return [0]
    Z = linkage(squareform(np.clip(D, 0, None), checks=False), method="average")
    lab = fcluster(Z, t=thr, criterion="distance")
    # relabel by first appearance
    order, out = {}, []
    for l in lab:
        if l not in order:
            order[l] = len(order)
        out.append(order[l])
    return out


def letter(i):
    return chr(ord("A") + i) if i < 26 else f"A{i}"


STOP = set("a an the and or of to in on at is are was were be it its i you we they he she me my our your their this that for with as by but so if oh uh yeah".split())


def seg_tokens(C, a_t, b_t):
    ph = C.need("lyrics")["phrases"]
    toks = []
    for p in ph:
        for w in p["words"]:
            if a_t <= w["start"] < b_t:
                t = re.sub(r"[^a-z0-9]", "", w["w"].lower())
                if t and t not in STOP:
                    toks.append(t)
    return toks


def jaccard(x, y):
    X, Y = set(x), set(y)
    if len(X) < 3 or len(Y) < 3:
        return None
    return len(X & Y) / len(X | Y)


def label_sections(C, G, segs, letters, vocal, rms, dens):
    """Guess verse / pre-chorus / chorus / post-chorus / bridge / build / break / intro / outro for each segment."""
    n = len(segs)
    med_rms = float(np.median(rms))
    info = []
    for i, ((a, b), L) in enumerate(zip(segs, letters)):
        sl = slice(a, b)
        info.append(dict(i=i, a=a, b=b, L=L, n=b - a, V=float(np.mean(vocal[sl])), E=float(np.mean(rms[sl]) - med_rms),
                         D=float(np.mean(dens[sl])), toks=seg_tokens(C, G.bar_t[a], G.bar_t[b]),
                         trend=float(np.mean(rms[max(a, b - 2):b]) - np.mean(rms[a:min(b, a + 2)]))))
    by_letter = collections.defaultdict(list)
    for x in info:
        by_letter[x["L"]].append(x)
    # lyric repetition and chorus score per letter
    best, best_score = None, -1e9
    scores = {}
    for L, xs in by_letter.items():
        reps = [jaccard(x["toks"], y["toks"]) for i, x in enumerate(xs) for y in xs[i + 1:]]
        reps = [r for r in reps if r is not None]
        rep = float(np.mean(reps)) if reps else 0.0
        V = float(np.mean([x["V"] for x in xs]))
        E = float(np.mean([x["E"] for x in xs]))
        D = float(np.mean([x["D"] for x in xs]))
        nbars = float(np.mean([x["n"] for x in xs]))
        sc = (E / 3.0) + 1.6 * rep + 0.8 * D + (0.4 if nbars >= 6 else 0.0)
        scores[L] = dict(rep=rep, V=V, E=E, D=D, count=len(xs), score=sc)
        if len(xs) >= 2 and V >= 0.45 and sc > best_score:
            best, best_score = L, sc
    chorus_letters = {best} if best is not None else set()
    # other repeating letters whose lyrics match the chorus lyrics are choruses too
    for L, xs in by_letter.items():
        if best is not None and L != best and len(xs) >= 1:
            ch_toks = [t for x in by_letter[best] for t in x["toks"]]
            r = [jaccard(x["toks"], ch_toks) for x in xs]
            if all(v is not None and v >= 0.5 for v in r) and scores[L]["V"] >= 0.45:
                chorus_letters.add(L)
    labels = [None] * n
    for x in info:
        if x["L"] in chorus_letters:
            labels[x["i"]] = "chorus"
    ch_idx = [x["i"] for x in info if labels[x["i"]] == "chorus"]
    first_chorus = ch_idx[0] if ch_idx else None
    last_chorus = ch_idx[-1] if ch_idx else None
    chorus_len = float(np.median([info[i]["n"] for i in ch_idx])) if ch_idx else 8.0
    pos_dens = dens[dens > 0] if (dens > 0).any() else np.array([1.0])
    # intro: leading segments before any vocal
    i = 0
    while i < n and info[i]["V"] < 0.35 and labels[i] is None:
        labels[i] = "intro"
        i += 1
    # outro: everything after the last chorus (unless it is the repeated post-chorus hook)
    if last_chorus is not None:
        post_letters = {info[j]["L"] for j in range(last_chorus) if j > 0 and labels[j - 1] == "chorus" and info[j]["L"] not in chorus_letters}
        for j in range(last_chorus + 1, n):
            if j == last_chorus + 1 and info[j]["L"] in post_letters and info[j]["V"] >= 0.5 and info[j]["n"] <= 0.75 * chorus_len:
                labels[j] = "post-chorus"
            else:
                labels[j] = "outro"
    # bridge: the first new-material vocal section between the second chorus and the last chorus
    seen_letters = set()
    for j in range(n):
        if labels[j] is None:
            pass
        if labels[j] in (None,) and j > 0:
            pass
    n_ch_before = 0
    for j in range(n):
        if labels[j] == "chorus":
            n_ch_before += 1
            continue
        if labels[j] is None and last_chorus is not None and j < last_chorus and n_ch_before >= max(1, len(ch_idx) - 1) \
                and info[j]["V"] >= 0.35 and info[j]["n"] >= 4 and info[j]["L"] not in seen_letters and "bridge" not in labels \
                and labels[j + 1 if j + 1 < n else j] != "chorus":
            labels[j] = "bridge"
        if labels[j] is None or labels[j] in ("bridge",):
            pass
        # letters already used by an earlier unlabeled-or-verse section are not new material
        if info[j]["V"] >= 0.35 and labels[j] != "chorus":
            seen_letters.add(info[j]["L"])
    for x in info:
        i = x["i"]
        if labels[i]:
            continue
        prev_l = labels[i - 1] if i > 0 else None
        next_l = labels[i + 1] if i + 1 < n else None
        short = x["n"] <= 0.75 * chorus_len
        if next_l == "chorus" and short:
            labels[i] = "build" if (prev_l == "bridge" or x["V"] < 0.4) else "pre-chorus"
        elif prev_l == "chorus" and short:
            labels[i] = "post-chorus" if x["V"] >= 0.25 else "instrumental break"
    for x in info:
        i = x["i"]
        if labels[i]:
            continue
        labels[i] = "instrumental break" if x["V"] < 0.35 else "verse"
    # merge consecutive intro / outro segments into one section
    merged_info, merged_labels = [], []
    for x, lb in zip(info, labels):
        if merged_info and lb in ("outro", "intro") and merged_labels[-1] == lb:
            m = merged_info[-1]
            tot = m["n"] + x["n"]
            m.update(b=x["b"], n=tot, V=(m["V"] * m["n"] + x["V"] * x["n"]) / tot, E=(m["E"] * m["n"] + x["E"] * x["n"]) / tot,
                     D=(m["D"] * m["n"] + x["D"] * x["n"]) / tot)
            continue
        merged_info.append(dict(x))
        merged_labels.append(lb)
    cnt = collections.Counter()
    out = []
    for x, base in zip(merged_info, merged_labels):
        cnt[base] += 1
        total = sum(1 for l in merged_labels if l == base)
        name = base if (total == 1 and base in ("intro", "outro", "bridge", "build")) else f"{base} {cnt[base]}"
        out.append(dict(x, label=base, name=name))
    return out, scores, sorted(chorus_letters)


def stage_structure(C):
    r = C.cached("structure")
    if r:
        C.R["structure"] = r
        log("structure: cached")
        return
    G = Grid(C.need("rhythm"))
    nb = G.n_bars
    F = bar_features(C, G)
    vocal = vocal_presence_per_bar(C, G)
    dr = C.need("drums")
    dens = np.array([sum(ch != "." for ch in b["pattern"] if ch in "KSH") / 16.0 for b in dr["bars"]])
    X = build_bar_matrix(F, vocal, dens)
    S = ssm_of(X, ctx=1)
    n2, n3 = novelty_curve(S, 2), novelty_curve(S, 3)
    nov = n2 / (np.percentile(n2[1:-1], 95) + 1e-9) / 2 + n3 / (np.percentile(n3[1:-1], 95) + 1e-9) / 2
    cuts = [int(c) for c in dp_segments(nov, nb, lam=C.args.seg_lambda)]
    segs = [(a, b) for a, b in zip(cuts[:-1], cuts[1:])]
    M = segment_similarity(S, segs)
    lab = cluster_letters(M, thr=C.args.seg_thr)
    letters = [letter(l) for l in lab]
    secs, scores, chorus_letters = label_sections(C, G, segs, letters, vocal, F["rms"], dens)
    sections = []
    for x in secs:
        sections.append(dict(start_bar=x["a"], end_bar=x["b"], start=float(G.bar_t[x["a"]]), end=float(G.bar_t[x["b"]]), letter=x["L"],
                             label=x["label"], name=x["name"], bars=x["n"], vocal=x["V"], rms_rel_db=x["E"], drum_density=x["D"]))
    res = dict(cuts=cuts, sections=sections, letter_scores=scores, chorus_letters=chorus_letters, novelty=nov,
               vocal_presence=vocal, rms_db=F["rms"], onset=F["onset"], centroid=F["centroid"], lowshare=F["lowshare"],
               similarity=M)
    C.R["structure"] = res
    C.save("structure", res)
    log("structure: " + " | ".join(f"{x['letter']}:{x['name']}[{x['start_bar']}-{x['end_bar']}]" for x in sections))


# ============================================================================ 2b. key, chord consensus, roman numerals
MAJ_DEG = {0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV", 6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII"}
MIN_DEG = {0: "I", 1: "bII", 2: "II", 3: "III", 4: "#III", 5: "IV", 6: "bV", 7: "V", 8: "VI", 9: "#VI", 10: "VII", 11: "#VII"}


def roman(pc, qual, tonic, mode):
    if pc is None:
        return "N"
    iv = (pc - tonic) % 12
    base = (MIN_DEG if mode == "minor" else MAJ_DEG)[iv]
    return base.lower() if qual == "min" else base


def diatonic_triads(tonic, mode):
    """{(pc, quality): weight} of the triads built on the scale degrees (natural minor plus the harmonic-minor V)."""
    if mode == "major":
        degs = [(0, "maj", 1.0), (2, "min", .7), (4, "min", .6), (5, "maj", .9), (7, "maj", 1.0), (9, "min", .9)]
    else:
        degs = [(0, "min", 1.0), (3, "maj", .9), (5, "min", .9), (7, "min", .6), (7, "maj", .7), (8, "maj", .9), (10, "maj", .9)]
    return {((tonic + d) % 12, q): w for d, q, w in degs}


def chord_key_evidence(bar_chords, first_bars, tonic, mode, last_bar=None):
    """how well a chord sequence argues for the key (tonic, mode): diatonic fit, tonic-chord share, section-start chords."""
    tri = diatonic_triads(tonic, mode)
    tq = "maj" if mode == "major" else "min"
    ch = [c for c in bar_chords if c is not None]
    if not ch:
        return 0.0
    dia = np.mean([tri.get(c, 0.0) for c in ch])
    ton = np.mean([c == (tonic, tq) for c in ch])
    fb = [bar_chords[b] for b in first_bars if b < len(bar_chords) and bar_chords[b] is not None]
    first = np.mean([c == (tonic, tq) for c in fb]) if fb else 0.0
    last = 1.0 if (last_bar is not None and bar_chords[last_bar] == (tonic, tq)) else 0.0
    return (1.0 * dia + 1.2 * ton + 1.5 * first + 0.5 * last) / 4.2


def key_scores_from_chroma(ch_vec):
    sc = ks_scores(ch_vec)
    vals = np.array(list(sc.values()))
    lo, hi = vals.min(), vals.max()
    return {k: (v - lo) / max(hi - lo, 1e-9) for k, v in sc.items()}


def cnn_key_scores(C):
    cp = C.cpath("cnn_key.npy")
    try:
        if os.path.exists(cp):
            pr = np.load(cp)
        else:
            from madmom.features.key import CNNKeyRecognitionProcessor
            pr = np.asarray(CNNKeyRecognitionProcessor()(os.path.join(C.out, "instrumental.wav"))).ravel()
            np.save(cp, pr)
        # madmom order: C major..B major, C minor..B minor
        pr = pr / max(pr.max(), 1e-9)
        return {(pc, "major"): float(pr[pc]) for pc in range(12)} | {(pc, "minor"): float(pr[12 + pc]) for pc in range(12)}
    except Exception as e:
        log("cnn key failed:", e)
        return None


def consensus_chords(bars, sections):
    """Fix isolated chord errors by voting among repeats of a loop inside a section. bars: list of dict(chord=(pc,q)|None, conf)."""
    n = len(bars)
    out = [dict(b) for b in bars]
    for b in out:
        b["corrected"] = False
    loops = []
    for sec in sections:
        a, z = sec["start_bar"], min(sec["end_bar"], n)
        L = z - a
        best = None
        for P in (1, 2, 3, 4, 6, 8):
            if P > L // 2 or L < 2 * P:
                continue
            slots = [[(bars[a + j + k * P]["chord"], bars[a + j + k * P]["conf"]) for k in range(L // P + (1 if (L % P) > j else 0))] for j in range(P)]
            win, agree, tot = [], 0, 0
            for sl in slots:
                votes = collections.Counter()
                for c, cf in sl:
                    votes[c] += cf ** 2
                w = votes.most_common(1)[0][0]
                win.append(w)
                agree += sum(1 for c, _ in sl if c == w)
                tot += len(sl)
            if agree / tot >= 0.7:
                best = (P, win, agree / tot, slots)
                break
        if best is None:
            loops.append(dict(section=sec["name"], period=None, chords=None))
            continue
        P, win, ag, slots = best
        for j in range(P):
            for k, (c, cf) in enumerate(slots[j]):
                bi = a + j + k * P
                n_rep = len(slots[j])
                other = max((cf2 for c2, cf2 in slots[j] if c2 == win[j]), default=0.0)
                if c != win[j] and (cf < 0.8 and (n_rep >= 3 or other > 0.85)):
                    out[bi]["chord"] = win[j]
                    out[bi]["corrected"] = True
        loops.append(dict(section=sec["name"], period=P, chords=win, agreement=ag))
    return out, loops


def stage_harmony(C):
    r = C.cached("harmony")
    if r:
        C.R["harmony"] = r
        log("harmony: cached")
        return
    G = Grid(C.need("rhythm"))
    ch = C.need("chords")
    st = C.need("structure")
    bs = C.need("bass")
    F = bar_features(C, G)
    nb = G.n_bars
    bars = []
    for b in range(nb):
        x = ch["bars"][b]
        c1 = parse_chord(x["label"])
        d = dict(chord=c1, conf=float(x["share"]), split=bool(x["split"]),
                 first=parse_chord(x["first"]) if x["split"] else None, second=parse_chord(x["second"]) if x["split"] else None)
        bars.append(d)
    cons, loops = consensus_chords(bars, st["sections"])
    chords_final = [b["chord"] for b in cons]
    raw_chords = [b["chord"] for b in bars]
    first_bars = [s_["start_bar"] for s_ in st["sections"] if s_["label"] not in ("intro", "build", "outro")]
    last_bar = max([s_["end_bar"] for s_ in st["sections"] if s_["label"] != "outro"] + [1]) - 1
    # ---- global key
    chroma_all = F["chroma"].mean(0)
    ks = key_scores_from_chroma(chroma_all)
    cnn = cnn_key_scores(C)
    tot = {}
    detail = {}
    for tonic in range(12):
        for mode in ("major", "minor"):
            ce = chord_key_evidence(chords_final, first_bars, tonic, mode, last_bar)
            v = 1.0 * ks[(tonic, mode)] + (1.0 * cnn[(tonic, mode)] if cnn else 0.0) + 1.5 * ce
            tot[(tonic, mode)] = v
            detail[(tonic, mode)] = dict(ks=ks[(tonic, mode)], cnn=(cnn[(tonic, mode)] if cnn else None), chords=ce)
    ranked = sorted(tot, key=lambda k: -tot[k])
    gk = ranked[0]
    top_other = next(k for k in ranked[1:] if k != gk)
    rel = ((gk[0] + 9) % 12, "minor") if gk[1] == "major" else ((gk[0] + 3) % 12, "major")
    flats = uses_flats(*gk)
    key_g = dict(tonic=gk[0], mode=gk[1], name=key_label(gk[0], gk[1], flats), relative=key_label(rel[0], rel[1], uses_flats(*rel)),
                 margin=float(tot[gk] - tot[top_other]), runner_up=key_label(top_other[0], top_other[1], uses_flats(*top_other)),
                 detail={f"{key_label(*k)}": detail[k] for k in ranked[:3]},
                 relative_score_gap=float(tot[gk] - tot[rel]))
    # ---- per-section keys (modulations): chroma + chords of the section only
    sec_keys = []
    for sec in st["sections"]:
        a, z = sec["start_bar"], min(sec["end_bar"], nb)
        if z - a < 3:
            sec_keys.append(None)
            continue
        chv = F["chroma"][a:z].mean(0)
        ks_s = key_scores_from_chroma(chv)
        sc = {}
        for tonic in range(12):
            for mode in ("major", "minor"):
                ce = chord_key_evidence(chords_final[a:z], [0], tonic, mode, None)
                sc[(tonic, mode)] = ks_s[(tonic, mode)] + 1.5 * ce
        rk = sorted(sc, key=lambda k: -sc[k])
        sec_keys.append(dict(key=rk[0], score=float(sc[rk[0]]), margin=float(sc[rk[0]] - sc[rk[1]])))
    changes = []
    sec_key_use = []
    tri_g = diatonic_triads(*gk)
    for sec, sk in zip(st["sections"], sec_keys):
        k_use = gk
        if sk is not None and sk["key"] not in (gk, rel):
            k = sk["key"]
            a, z = sec["start_bar"], min(sec["end_bar"], nb)
            cs = [c for c in chords_final[a:z] if c is not None]
            tri_n = diatonic_triads(*k)
            dia_n = np.mean([tri_n.get(c, 0.0) > 0 for c in cs]) if cs else 0.0
            dia_g = np.mean([tri_g.get(c, 0.0) > 0 for c in cs]) if cs else 1.0
            tonic_chord = (k[0], "major" if k[1] == "major" else "min")
            has_tonic = any(c == (k[0], "maj" if k[1] == "major" else "min") for c in cs)
            if dia_n >= 0.85 and dia_g <= 0.75 and has_tonic and sk["margin"] > 0.05:
                k_use = k
                changes.append(dict(section=sec["name"], start_bar=sec["start_bar"], key=key_label(k[0], k[1], uses_flats(*k)),
                                    semitones=int((k[0] - gk[0]) % 12) if k[1] == gk[1] else None, margin=sk["margin"]))
        sec_key_use.append(k_use)
    # ---- final per-bar chord table with spelling and roman numerals
    sec_of_bar = {}
    for si, sec in enumerate(st["sections"]):
        for b in range(sec["start_bar"], min(sec["end_bar"], nb)):
            sec_of_bar[b] = si
    table = []
    for b in range(nb):
        k = sec_key_use[sec_of_bar[b]] if b in sec_of_bar else gk
        fl = uses_flats(*k)
        c = cons[b]["chord"]
        item = dict(bar=b, chord=chord_name(c[0], c[1], fl) if c else "N", root=(c[0] if c else None), quality=(c[1] if c else None),
                    roman=roman(c[0], c[1], k[0], k[1]) if c else "N", conf=float(bars[b]["conf"]), corrected=bool(cons[b]["corrected"]),
                    raw=chord_name(raw_chords[b][0], raw_chords[b][1], fl) if raw_chords[b] else "N")
        if bars[b]["split"] and bars[b]["first"] and bars[b]["second"]:
            f1, f2 = bars[b]["first"], bars[b]["second"]
            item["half"] = [chord_name(f1[0], f1[1], fl), chord_name(f2[0], f2[1], fl)]
            item["half_roman"] = [roman(f1[0], f1[1], k[0], k[1]), roman(f2[0], f2[1], k[0], k[1])]
        table.append(item)
    loop_table = []
    for lp, sec, k in zip(loops, st["sections"], sec_key_use):
        fl = uses_flats(*k)
        if lp["chords"]:
            names = [chord_name(c[0], c[1], fl) if c else "N" for c in lp["chords"]]
            rn = [roman(c[0], c[1], k[0], k[1]) if c else "N" for c in lp["chords"]]
            loop_table.append(dict(section=sec["name"], letter=sec["letter"], bars=[sec["start_bar"], sec["end_bar"]], period=lp["period"],
                                   chords=names, roman=rn, agreement=lp["agreement"]))
        else:
            loop_table.append(dict(section=sec["name"], letter=sec["letter"], bars=[sec["start_bar"], sec["end_bar"]], period=None,
                                   chords=[t["chord"] for t in table[sec["start_bar"]:sec["end_bar"]]],
                                   roman=[t["roman"] for t in table[sec["start_bar"]:sec["end_bar"]]], agreement=None))
    res = dict(key=key_g, key_changes=changes, bars=table, loops=loop_table, n_corrected=int(sum(1 for t in table if t["corrected"])),
               section_keys=[dict(section=sec["name"], key=key_label(k[0], k[1], uses_flats(*k))) for sec, k in zip(st["sections"], sec_key_use)])
    C.R["harmony"] = res
    C.save("harmony", res)
    log(f"harmony: key {key_g['name']} (rel {key_g['relative']}, margin {key_g['margin']:.2f}); changes {[(c['section'], c['key']) for c in changes]}; "
        f"{res['n_corrected']} bars corrected by loop consensus")


# ============================================================================ 8. sound + production per section
CLAP_PROMPTS = collections.OrderedDict([
    ("instrument", [
        ("piano", "a piano"), ("acoustic guitar", "an acoustic guitar"), ("electric guitar", "an electric guitar"),
        ("strings", "a string section"), ("choir", "a choir singing"), ("brass", "brass instruments"),
        ("synth lead", "a synthesizer lead melody"), ("synth pad", "a warm synth pad"), ("808 bass", "an 808 sub bass"),
        ("chiptune", "chiptune video game music"), ("drum machine", "an electronic drum machine beat"), ("live drums", "a live acoustic drum kit")]),
    ("vocal", [
        ("female singer", "a female singer"), ("male singer", "a male singer"), ("rap", "rapping"), ("spoken word", "spoken word"),
        ("robotic voice", "a robotic voice"), ("vocoder", "a vocoder voice"), ("whisper", "a whispered voice"),
        ("backing vocals", "layered backing vocal harmonies")]),
    ("style", [
        ("EDM drop", "an EDM drop"), ("trap", "trap music"), ("rock", "rock music"), ("orchestral", "orchestral music"),
        ("lo-fi", "lo-fi music"), ("musical theatre", "musical theatre"), ("comedic", "comedic music"), ("pop", "pop music"),
        ("cinematic", "dark cinematic music")]),
])


class Clap:
    def __init__(self):
        import onnxruntime as ort
        from tokenizers import Tokenizer, models, pre_tokenizers
        d = os.path.join(MODELS, "clap")
        so = ort.SessionOptions()
        so.intra_op_num_threads = 4
        P = ["CPUExecutionProvider"]
        self.a = ort.InferenceSession(f"{d}/CLAP_audio_LAION-Audio-630K_with_fusion.onnx", so, providers=P)
        self.t = ort.InferenceSession(f"{d}/CLAP_text_text_branch_RobertaModel_roberta-base.onnx", so, providers=P)
        self.p = ort.InferenceSession(f"{d}/CLAP_text_projection_LAION-Audio-630K_with_fusion.onnx", so, providers=P)
        v = json.load(open(f"{d}/vocab.json"))
        mg = [tuple(l.split()) for l in open(f"{d}/merges.txt", encoding="utf8").read().split("\n")[1:] if l.strip()]
        self.tok = Tokenizer(models.BPE(v, mg))
        self.tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)

    def text(self, prompts):
        enc = [[0] + self.tok.encode(t).ids[:75] + [2] for t in prompts]
        ids = np.array([e + [1] * (77 - len(e)) for e in enc], dtype=np.int64)
        o = self.t.run(None, {"input_ids": ids, "attention_mask": (ids != 1).astype(np.int64)})
        T = self.p.run(None, {"x": o[1]})[0]
        return T / np.linalg.norm(T, axis=1, keepdims=True)

    def audio(self, seg48):
        import librosa
        n = 480000
        if len(seg48) < n:
            seg48 = np.tile(seg48, int(np.ceil(n / max(1, len(seg48)))))
        seg48 = seg48[:n]
        seg48 = (np.clip(seg48, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32767.0
        m = librosa.feature.melspectrogram(y=seg48, sr=48000, n_fft=1024, hop_length=480, win_length=1024, center=True, pad_mode="reflect",
                                           power=2.0, n_mels=64, norm=None, htk=True, fmin=50, fmax=14000)
        m = (10.0 * np.log10(np.maximum(m, 1e-10))).T.astype(np.float32)
        e = self.a.run(None, {"longer": np.array([[True]]), "mel_fusion": np.stack([m] * 4, 0)[None]})[0][0]
        return e / np.linalg.norm(e)


class Ced:
    def __init__(self):
        import sherpa_onnx
        d = os.path.join(MODELS, "sherpa-onnx-ced-mini-audio-tagging-2024-04-19")
        self.labels = [r["display_name"] for r in csv.DictReader(open(f"{d}/class_labels_indices.csv"))]
        self.tg = sherpa_onnx.AudioTagging(sherpa_onnx.AudioTaggingConfig(
            model=sherpa_onnx.AudioTaggingModelConfig(ced=f"{d}/model.int8.onnx", num_threads=4, provider="cpu"),
            labels=f"{d}/class_labels_indices.csv", top_k=527))

    def probs(self, seg16):
        n = 160000
        if len(seg16) < n:
            seg16 = np.tile(seg16, int(np.ceil(n / max(1, len(seg16)))))
        st = self.tg.create_stream()
        st.accept_waveform(16000, seg16[:n].astype(np.float32))
        pr = np.zeros(len(self.labels))
        for e in self.tg.compute(st):
            pr[e.index] = e.prob
        return pr


def section_windows(a, b, w=10.0, hop=5.0, max_n=3):
    """start times of up to max_n windows of w seconds inside [a, b] (one tiled window if the section is shorter than w)."""
    if b - a <= w:
        return [a]
    n = min(max_n, int(np.ceil((b - a - w) / hop)) + 1)
    return list(np.linspace(a, b - w, n)) if n > 1 else [a]


def stage_sound(C):
    r = C.cached("sound")
    if r:
        C.R["sound"] = r
        log("sound: cached")
        return
    import librosa
    import pyloudnorm as pyln
    G = Grid(C.need("rhythm"))
    st = C.need("structure")
    dr = C.need("drums")
    mix = C.mix
    mono22 = C.mono("mix", 22050)
    meter = pyln.Meter(SR)
    secs = st["sections"]
    out = []
    onset_t = librosa.onset.onset_detect(y=mono22, sr=22050, hop_length=512, units="time")
    S = np.abs(librosa.stft(mono22, n_fft=2048, hop_length=512))
    cent = librosa.feature.spectral_centroid(S=S, sr=22050)[0]
    rolloff = librosa.feature.spectral_rolloff(S=S, sr=22050, roll_percent=0.9)[0]
    tfr = librosa.times_like(cent, sr=22050, hop_length=512)
    bands = [("sub", 20, 60), ("bass", 60, 250), ("low-mid", 250, 500), ("mid", 500, 2000), ("hi-mid", 2000, 4000), ("presence", 4000, 8000), ("air", 8000, 20000)]
    for sec in secs:
        a, b = max(0.0, sec["start"]), min(sec["end"], C.dur)
        seg = mix[:, int(a * SR):int(b * SR)]
        d = max(b - a, 1e-6)
        lufs = None
        if seg.shape[1] >= int(0.45 * SR):
            try:
                v = meter.integrated_loudness(seg.T)
                lufs = float(v) if np.isfinite(v) else None
            except Exception:
                lufs = None
        pk = float(np.abs(seg).max())
        rms = float(np.sqrt(np.mean(seg ** 2)))
        mid, side = (seg[0] + seg[1]) / 2, (seg[0] - seg[1]) / 2
        width_db = float(db(np.mean(side ** 2)) - db(np.mean(mid ** 2)))
        corr = float(np.corrcoef(seg[0], seg[1])[0, 1]) if seg.shape[1] > 100 and seg[0].std() > 1e-9 and seg[1].std() > 1e-9 else 1.0
        m = (tfr >= a) & (tfr < b)
        f, pxx = ss.welch(mid, SR, nperseg=8192)
        tot = pxx.sum() + 1e-18
        shares = {n: float(pxx[(f >= lo) & (f < hi)].sum() / tot) for n, lo, hi in bands}
        nb_ = max(1, sec["end_bar"] - sec["start_bar"])
        hits = sum(1 for k in dr["times"] for t_ in dr["times"][k] if a <= t_ < b)
        out.append(dict(name=sec["name"], letter=sec["letter"], start=a, end=b, bars=nb_, lufs=lufs, peak_db=float(db(pk ** 2)),
                        rms_db=float(db(rms ** 2)), crest_db=float(db(pk ** 2) - db(rms ** 2)),
                        centroid_hz=float(np.mean(cent[m])) if m.any() else None, rolloff90_hz=float(np.mean(rolloff[m])) if m.any() else None,
                        onset_density=float(np.sum((onset_t >= a) & (onset_t < b)) / d), drum_hits_per_bar=hits / nb_,
                        stereo_width_db=width_db, lr_correlation=corr, bands=shares))
    # ---- CLAP / CED
    if not C.args.no_clap:
        mono48 = C.mono("mix", 48000)
        mono16 = C.mono("mix", 16000)
        cp = C.cpath("clap_ced_sections.json")
        sig = [(round(x["start"], 2), round(x["end"], 2)) for x in out]
        cached = json.load(open(cp)) if (os.path.exists(cp) and "clap" not in C.args.force_set) else None
        if cached and cached.get("sig") == sig:
            clap_sc, ced_top = np.array(cached["clap"]), cached["ced"]
        else:
            clap = Clap()
            flat = [(g, k, txt) for g, items in CLAP_PROMPTS.items() for k, txt in items]
            T = clap.text([t for _, _, t in flat])
            ced = Ced()
            clap_sc, ced_top = [], []
            for x in out:
                wins = section_windows(x["start"], x["end"])
                embs, prs = [], []
                for w0 in wins:
                    a0, a1 = int(w0 * 48000), int(min(w0 + 10.0, x["end"]) * 48000)
                    embs.append(clap.audio(mono48[a0:a1]))
                    b0, b1 = int(w0 * 16000), int(min(w0 + 10.0, x["end"]) * 16000)
                    prs.append(ced.probs(mono16[b0:b1]))
                e = np.mean(embs, 0)
                e /= np.linalg.norm(e)
                clap_sc.append((T @ e).tolist())
                pr = np.mean(prs, 0)
                top = np.argsort(-pr)[:5]
                ced_top.append([[ced.labels[i], float(pr[i])] for i in top])
                log(f"clap/ced {x['name']}")
            clap_sc = np.array(clap_sc)
            json.dump(dict(sig=sig, clap=clap_sc.tolist(), ced=ced_top), open(cp, "w"))
        flat = [(g, k) for g, items in CLAP_PROMPTS.items() for k, _ in items]
        mean = clap_sc.mean(0)
        for x, row, tags in zip(out, clap_sc, ced_top):
            x["clap"] = {f"{g}/{k}": float(v) for (g, k), v in zip(flat, row)}
            x["clap_delta"] = {f"{g}/{k}": float(v - m_) for (g, k), v, m_ in zip(flat, row, mean)}
            x["ced_top5"] = tags
    # ---- whole-song numbers
    seg = mix
    whole = dict(lufs=float(meter.integrated_loudness(seg.T)), true_peak_db=float(db(np.abs(ss.resample_poly(seg, 4, 1, axis=1)).max() ** 2)),
                 crest_db=float(db(np.abs(seg).max() ** 2) - db(np.mean(seg ** 2))), duration=C.dur)
    res = dict(sections=out, whole=whole)
    C.R["sound"] = res
    C.save("sound", res)
    log("sound: " + " | ".join(f"{x['name']} {x['lufs']:.1f}LUFS" if x["lufs"] is not None else x["name"] for x in out))


# ============================================================================ main
STAGE_ORDER = ["separate", "rhythm", "chords", "melody", "drums", "bass", "lyrics", "structure", "harmony", "sound"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--mdx", default="voc_ft", choices=list(MDX_MODELS))
    ap.add_argument("--asr", default="small.en")
    ap.add_argument("--asr-src", default="vocals", choices=["vocals", "mix"])
    ap.add_argument("--force", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--no-clap", action="store_true")
    ap.add_argument("--seg-lambda", type=float, default=0.45)
    ap.add_argument("--seg-thr", type=float, default=0.55)
    ap.add_argument("--min-note", type=float, default=0.06)
    ap.add_argument("--chord-src", default="instrumental", choices=["instrumental", "mix"])
    args = ap.parse_args()
    args.force_set = set(s for s in args.force.split(",") if s)
    only = [s for s in args.only.split(",") if s]
    out = args.out or os.path.join(ROOT, "build", "perceive", args.label)
    os.makedirs(out, exist_ok=True)
    C = Ctx(args.audio, args.label, out, args)
    log(f"{args.label}: {args.audio} ({C.dur:.1f}s)")
    for st in STAGE_ORDER:
        if only and st not in only:
            continue
        t = time.time()
        globals()["stage_" + st](C)
        log(f"stage {st}: {time.time() - t:.0f}s")


if __name__ == "__main__":
    main()
