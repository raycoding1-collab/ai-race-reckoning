#!/usr/bin/env python3
"""Listening kit: measure a mix. usage: listen.py MIX [--label v1] [--vocal VOCAL_WAV] [--asr base.en|tiny.en]
Writes build/listen/<label>.json and prints a compact table. CPU only, <=4 threads, no torch."""
import argparse, collections, json, os, re, sys, time
os.environ.setdefault("OMP_NUM_THREADS", "4"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "4")
import numpy as np
import librosa, soundfile as sf, scipy.signal as ss
import pyloudnorm as pyln

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
import song
M = os.path.join(ROOT, "build", "models")
CLAPD = f"{M}/clap"; CEDD = f"{M}/sherpa-onnx-ced-mini-audio-tagging-2024-04-19"
PROMPTS = {"singer": "a clear female pop singer", "robotic": "a robotic text-to-speech voice",
           "muddy": "a muddy boomy bass-heavy mix"}
BANDS = [("sub", 0, 60), ("bass", 60, 250), ("lowmid", 250, 500), ("mid", 500, 2000),
         ("himid", 2000, 4000), ("presence", 4000, 8000), ("air", 8000, 1e9)]
T0 = time.time()


def log(*a): print(f"[{time.time()-T0:5.0f}s]", *a, file=sys.stderr, flush=True)


def norm(s):
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^\w\s']", " ", s)
    s = re.sub(r"'s\b", "s", s)
    s = s.replace("'", "")
    return re.sub(r"\s+", " ", s).strip()


def lufs(x, sr):
    if len(x) / sr < 0.5: return None
    v = pyln.Meter(sr).integrated_loudness(x)
    return None if not np.isfinite(v) else float(v)


def true_peak_db(x):
    up = ss.resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(max(np.abs(up).max(), 1e-9)))


def band_shares(mono, sr):
    f, p = ss.welch(mono, sr, nperseg=8192)
    tot = p.sum()
    return {n: float(p[(f >= lo) & (f < hi)].sum() / tot) for n, lo, hi in BANDS}


def wavg(vals):
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None


# ---------------- ASR
def run_asr(y16, lines, which):
    import sherpa_onnx, jiwer
    d = f"{M}/sherpa-onnx-whisper-{which}"
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=f"{d}/{which}-encoder.int8.onnx", decoder=f"{d}/{which}-decoder.int8.onnx",
        tokens=f"{d}/{which}-tokens.txt", language="en", task="transcribe", num_threads=4)
    out = []
    for l in lines:
        a, b = max(0, int((l["start"] - 0.3) * 16000)), min(len(y16), int((l["end"] + 0.3) * 16000))
        s = rec.create_stream(); s.accept_waveform(16000, y16[a:b]); rec.decode_stream(s)
        hyp = s.result.text.strip(); r = norm(l["text"]); h = norm(hyp)
        o = jiwer.process_words(r, h if h else "")
        rw, hw = r.split(), h.split(); missed = []
        for ch in o.alignments[0]:
            if ch.type in ("delete", "substitute"): missed += rw[ch.ref_start_idx:ch.ref_end_idx]
        out.append(dict(i=l["i"], t=l["start"], text=l["text"], hyp=hyp, nref=len(rw),
                        err=o.substitutions + o.deletions + o.insertions, wer=(o.substitutions + o.deletions + o.insertions) / max(1, len(rw)),
                        missed=missed))
        log(f"asr L{l['i']} wer={out[-1]['wer']:.2f}")
    return out


# ---------------- CLAP
def run_clap(y48, wins):
    import onnxruntime as ort
    from tokenizers import Tokenizer, models, pre_tokenizers
    so = ort.SessionOptions(); so.intra_op_num_threads = 4
    P = ["CPUExecutionProvider"]
    a_s = ort.InferenceSession(f"{CLAPD}/CLAP_audio_LAION-Audio-630K_with_fusion.onnx", so, providers=P)
    t_s = ort.InferenceSession(f"{CLAPD}/CLAP_text_text_branch_RobertaModel_roberta-base.onnx", so, providers=P)
    p_s = ort.InferenceSession(f"{CLAPD}/CLAP_text_projection_LAION-Audio-630K_with_fusion.onnx", so, providers=P)
    v = json.load(open(f"{CLAPD}/vocab.json"))
    mg = [tuple(l.split()) for l in open(f"{CLAPD}/merges.txt", encoding="utf8").read().split("\n")[1:] if l.strip()]
    tok = Tokenizer(models.BPE(v, mg)); tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    txt = list(PROMPTS.values())
    enc = [[0] + tok.encode(t).ids[:75] + [2] for t in txt]
    ids = np.array([e + [1] * (77 - len(e)) for e in enc], dtype=np.int64)
    o = t_s.run(None, {"input_ids": ids, "attention_mask": (ids != 1).astype(np.int64)})
    T = p_s.run(None, {"x": o[1]})[0]; T /= np.linalg.norm(T, axis=1, keepdims=True)
    n = 480000; cos = []
    for s0, e0 in wins:
        seg = y48[int(s0 * 48000):int(s0 * 48000) + n]
        if len(seg) < n:
            k = max(1, n // max(1, len(seg))); seg = np.pad(np.tile(seg, k), (0, max(0, n - len(seg) * k)))[:n]
        seg = (np.clip(seg, -1, 1) * 32767).astype(np.int16).astype(np.float32) / 32767.0
        m = librosa.feature.melspectrogram(y=seg, sr=48000, n_fft=1024, hop_length=480, win_length=1024, center=True,
                                           pad_mode="reflect", power=2.0, n_mels=64, norm=None, htk=True, fmin=50, fmax=14000)
        m = (10.0 * np.log10(np.maximum(m, 1e-10))).T.astype(np.float32)
        e = a_s.run(None, {"longer": np.array([[True]]), "mel_fusion": np.stack([m] * 4, 0)[None]})[0][0]
        cos.append(T @ (e / np.linalg.norm(e)))
        log(f"clap win {s0:.0f}")
    return np.array(cos)  # (W,3) singer, robotic, muddy


# ---------------- CED
def run_ced(y16, wins):
    import sherpa_onnx, csv
    labels = [r["display_name"] for r in csv.DictReader(open(f"{CEDD}/class_labels_indices.csv"))]
    tg = sherpa_onnx.AudioTagging(sherpa_onnx.AudioTaggingConfig(
        model=sherpa_onnx.AudioTaggingModelConfig(ced=f"{CEDD}/model.int8.onnx", num_threads=4, provider="cpu"),
        labels=f"{CEDD}/class_labels_indices.csv", top_k=527))
    ix = {"sing": labels.index("Singing"), "fsing": labels.index("Female singing")}
    out = []
    for s0, e0 in wins:
        st = tg.create_stream(); st.accept_waveform(16000, y16[int(s0 * 16000):int(s0 * 16000) + 160000])
        pr = {e.index: e.prob for e in tg.compute(st)}
        out.append([pr.get(ix["sing"], 0.0), pr.get("fsing", pr.get(ix["fsing"], 0.0))])
    return np.array(out)


def windows(dur, w, hop):
    st = list(np.arange(0, max(1e-9, dur - w) + 1e-9, hop)) or [0.0]
    return [(s, min(dur, s + w)) for s in st]


def sec_mean(arr, wins, a, b):
    c = np.array([(s + e) / 2 for s, e in wins])
    idx = [i for i, ci in enumerate(c) if a <= ci < b]
    if not idx: idx = [int(np.argmin(np.abs(c - (a + b) / 2)))]
    return arr[idx].mean(0)


# ---------------- kick alignment
def kick_align(mono22, sr, kicks):
    b = ss.butter(4, 150, "low", fs=sr, output="sos")
    lp = ss.sosfiltfilt(b, mono22)
    hop = 64
    env = librosa.onset.onset_strength(y=lp, sr=sr, hop_length=hop, n_fft=1024, fmax=150)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", backtrack=False)
    offs = []
    for k in kicks:
        if len(on) == 0: break
        j = np.argmin(np.abs(on - k)); d = on[j] - k
        if abs(d) <= 0.040: offs.append(d * 1000)
    offs = np.array(offs)
    return dict(n_kicks=len(kicks), n_onsets=int(len(on)), pct_matched=float(100 * len(offs) / max(1, len(kicks))),
                median_abs_ms=float(np.median(np.abs(offs))) if len(offs) else None,
                max_abs_ms=float(np.abs(offs).max()) if len(offs) else None,
                median_signed_ms=float(np.median(offs)) if len(offs) else None)


# ---------------- pitch
def pitch_err(vocal_path, lines):
    y, sr = librosa.load(vocal_path, sr=22050, mono=True)
    f0, vf, _ = librosa.pyin(y, fmin=65, fmax=1100, sr=sr, frame_length=2048, hop_length=256)
    t = librosa.times_like(f0, sr=sr, hop_length=256)
    errs = []
    for l in lines:
        for w in l.get("words", []):
            for (a, b), m in zip(w.get("syl", []), w.get("midi", [])):
                pad = 0.2 * (b - a); mk = (t >= a + pad) & (t <= b - pad) & vf & np.isfinite(f0)
                if mk.sum() < 3: continue
                tgt = 440 * 2 ** ((m - 69) / 12)
                errs.append(1200 * np.log2(np.median(f0[mk]) / tgt))
    e = np.array(errs)
    return dict(n_notes=int(len(e)), median_abs_cents=float(np.median(np.abs(e))) if len(e) else None,
                median_signed_cents=float(np.median(e)) if len(e) else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mix"); ap.add_argument("--label", default="run"); ap.add_argument("--vocal")
    ap.add_argument("--asr", default="base.en")
    a = ap.parse_args()
    lyr = json.load(open(f"{ROOT}/data/lyrics.json"))["lines"]
    kicks = json.load(open(f"{ROOT}/data/events.json"))["kick"]
    x, sr = sf.read(a.mix, dtype="float32", always_2d=True) if not a.mix.endswith(".mp3") else (None, None)
    if x is None:
        y, sr = librosa.load(a.mix, sr=None, mono=False); x = np.atleast_2d(y).T
    mono = x.mean(1); dur = len(mono) / sr
    y16 = librosa.resample(mono, orig_sr=sr, target_sr=16000)
    y48 = librosa.resample(mono, orig_sr=sr, target_sr=48000)
    y22 = librosa.resample(mono, orig_sr=sr, target_sr=22050)
    secs = [(n, s * song.BAR, e * song.BAR) for n, s, e in song.SECTIONS]
    t0 = time.time(); asr = run_asr(y16, lyr, a.asr); t_asr = time.time() - t0
    wins = windows(dur, 10.0, 5.0)
    clap = run_clap(y48, wins); ced = run_ced(y16, windows(dur, 10.0, 2.5)); cwins = windows(dur, 10.0, 2.5)
    rows = []
    for n, s, e in secs:
        ls = [r for r in asr if s <= r["t"] < e]
        nref = sum(r["nref"] for r in ls); err = sum(r["err"] for r in ls)
        c = sec_mean(clap, wins, s, e); g = sec_mean(ced, cwins, s, e)
        rows.append(dict(section=n, start=s, end=e, lufs=lufs(x[int(s * sr):int(e * sr)], sr),
                         wer=(err / nref) if nref else None, n_words=nref,
                         clap_gap=float(c[0] - c[1]), clap_muddy=float(c[2]), clap_singer=float(c[0]), clap_robotic=float(c[1]),
                         ced_singing=float(g[0]), ced_female_singing=float(g[1])))
    allref = sum(r["nref"] for r in asr); allerr = sum(r["err"] for r in asr)
    missed = collections.Counter(w for r in asr for w in r["missed"])
    cs = clap.mean(0)
    whole = dict(lufs=lufs(x, sr), true_peak_dbtp=true_peak_db(x),
                 crest_db=float(20 * np.log10(np.abs(x).max() / max(1e-9, np.sqrt((x ** 2).mean())))),
                 bands=band_shares(mono, sr), wer=allerr / max(1, allref), n_words=allref,
                 clap_gap=float(cs[0] - cs[1]), clap_muddy=float(cs[2]),
                 ced_singing=float(ced[:, 0].mean()), ced_female_singing=float(ced[:, 1].mean()),
                 worst_lines=[dict(i=r["i"], t=round(r["t"], 1), wer=round(r["wer"], 2), ref=r["text"], hyp=r["hyp"])
                              for r in sorted(asr, key=lambda r: -r["wer"])[:8]],
                 words_missed=missed.most_common(25), kick=kick_align(y22, 22050, kicks), asr_model=a.asr, asr_seconds=round(t_asr))
    if a.vocal: whole["pitch"] = pitch_err(a.vocal, lyr)
    res = dict(label=a.label, mix=a.mix, duration=dur, sections=rows, whole=whole, runtime_s=round(time.time() - T0))
    os.makedirs(f"{ROOT}/build/listen", exist_ok=True)
    json.dump(res, open(f"{ROOT}/build/listen/{a.label}.json", "w"), indent=1)
    f = lambda v, p=1: "  -" if v is None else f"{v:.{p}f}"
    print(f"{a.label}  {a.mix}  {dur:.0f}s  asr={a.asr}")
    print(f"{'section':8}{'LUFS':>7}{'WER':>6}{'nW':>4}{'gap':>7}{'muddy':>7}{'Sing':>6}{'FSing':>6}")
    for r in rows:
        print(f"{r['section']:8}{f(r['lufs']):>7}{f(r['wer'],2):>6}{r['n_words']:>4}{f(r['clap_gap'],3):>7}{f(r['clap_muddy'],3):>7}"
              f"{f(r['ced_singing'],2):>6}{f(r['ced_female_singing'],2):>6}")
    w = whole
    print(f"{'WHOLE':8}{f(w['lufs']):>7}{f(w['wer'],2):>6}{w['n_words']:>4}{f(w['clap_gap'],3):>7}{f(w['clap_muddy'],3):>7}"
          f"{f(w['ced_singing'],2):>6}{f(w['ced_female_singing'],2):>6}")
    print(f"TP {w['true_peak_dbtp']:.1f} dBTP | crest {w['crest_db']:.1f} dB | bands% " + " ".join(f"{k}={100*v:.0f}" for k, v in w['bands'].items()))
    k = w["kick"]
    print(f"kick: matched {k['pct_matched']:.0f}% ({k['n_kicks']}) median|off| {f(k['median_abs_ms'])} ms max {f(k['max_abs_ms'])} ms signed-med {f(k['median_signed_ms'])}")
    if "pitch" in w: print(f"pitch: median|err| {f(w['pitch']['median_abs_cents'],0)} cents over {w['pitch']['n_notes']} notes")
    print("worst lines:")
    for r in w["worst_lines"]: print(f"  L{r['i']:<2} {r['t']:6.1f}s WER {r['wer']:.2f} | {r['ref']} | {r['hyp']}")
    print("missed: " + ", ".join(f"{k}x{n}" for k, n in w["words_missed"][:20]))
    print(f"runtime {res['runtime_s']}s (asr {w['asr_seconds']}s)")


main()
