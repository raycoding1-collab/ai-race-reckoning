"""Kokoro-82M speech source for the singing pipeline.

1. synth(): speaks a lyric line with Kokoro (kokoro-onnx, fp32, CPU) and caches
   the 24 kHz WAV in build/kokoro/<voice>/<hash>.wav (Kokoro is slow here).
2. align(): DTW-aligns the Kokoro take to the Festival rendering of the same
   line (whose phone times tts.parse() gives us) on cepstrally normalised
   log-mel/MFCC features, and maps every Festival phone boundary onto the
   Kokoro timeline, snapping vowel onsets to nearby voicing onsets.
3. validate(): checks the mapped vowels against Kokoro's own voicing; a line
   whose alignment fails falls back to the Festival source in sing.py.

Model files: github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/
(kokoro-v1.0.onnx, voices-v1.0.bin) in build/kokoro/models/.
"""
import os, sys, hashlib, json
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from scipy.fft import dct

sys.path.insert(0, os.path.dirname(__file__))
import song
import tts

ROOT = tts.ROOT
KDIR = os.path.join(ROOT, "build", "kokoro")
MODELS = os.path.join(KDIR, "models")
SR_K = 24000
VOICE = "af_heart"        # lead voice (chosen by measurement, see choose_voice())
VOICE_DOUBLE = "af_bella"  # the double track is a second "singer"
SPEED = 1.0
_k = None


def _engine():
    global _k
    if _k is None:
        import onnxruntime as ort
        from kokoro_onnx import Kokoro
        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.environ.get("KOKORO_THREADS", "4"))
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        model = os.path.join(MODELS, "kokoro-v1.0.onnx")
        if not os.path.exists(model):
            model = os.path.join(MODELS, "kokoro-v1.0.int8.onnx")
        sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
        _k = Kokoro.from_session(sess, os.path.join(MODELS, "voices-v1.0.bin"))
    return _k


def line_text(li):
    return song.line_text(song.LINES[li])


def path(text, voice=VOICE, speed=SPEED):
    h = hashlib.sha1(f"{text}|{speed}".encode()).hexdigest()[:12]
    return os.path.join(KDIR, voice, f"{h}.wav")


def synth(text, voice=VOICE, speed=SPEED):
    p = path(text, voice, speed)
    if os.path.exists(p):
        return p
    os.makedirs(os.path.dirname(p), exist_ok=True)
    y, sr = _engine().create(text, voice=voice, speed=speed, lang="en-us")
    y = np.asarray(y, dtype=np.float64)
    # pad 60 ms each side so onsets/codas are never at the file edge
    pad = np.zeros(int(0.06 * sr))
    sf.write(p + ".tmp.wav", np.concatenate([pad, y, pad]), sr, subtype="FLOAT")
    os.replace(p + ".tmp.wav", p)
    with open(os.path.join(KDIR, voice, "index.jsonl"), "a") as f:
        f.write(json.dumps(dict(file=os.path.basename(p), text=text, speed=speed)) + "\n")
    return p


# ------------------------------------------------------------------ features
FRAME = 0.005  # s, same as WORLD's frame period in sing.py


def _mel_fb(sr, n_fft, n_mels=40, fmin=80, fmax=7600):
    def hz2mel(f): return 2595 * np.log10(1 + f / 700)
    def mel2hz(m): return 700 * (10 ** (m / 2595) - 1)
    pts = mel2hz(np.linspace(hz2mel(fmin), hz2mel(fmax), n_mels + 2))
    f = np.fft.rfftfreq(n_fft, 1 / sr)
    fb = np.zeros((n_mels, len(f)))
    for i in range(n_mels):
        lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.clip(np.minimum((f - lo) / (c - lo), (hi - f) / (hi - c)), 0, None)
    return fb


def features(x, sr):
    """log-mel (40) -> MFCC c1..c19 + deltas, cepstral mean/var normalised; 5 ms hop.
    Resampled to 16 kHz first so both voices see the same band (Festival is 32 kHz)."""
    if sr != 16000:
        g = np.gcd(sr, 16000)
        x = resample_poly(x, 16000 // g, sr // g)
    sr = 16000
    n_fft, hop = 512, int(FRAME * sr)
    win = int(0.025 * sr)
    x = np.concatenate([np.zeros(win // 2), x, np.zeros(win)])
    nfr = (len(x) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(nfr)[:, None]
    fr = x[idx] * np.hanning(win)
    P = np.abs(np.fft.rfft(fr, n_fft)) ** 2
    lm = np.log(P @ _mel_fb(sr, n_fft).T + 1e-8)
    energy = lm.max(1)
    c = dct(lm, type=2, norm="ortho", axis=1)[:, 1:20]
    d = np.gradient(c, axis=0) * 2
    F = np.hstack([c, d])
    F = (F - F.mean(0)) / (F.std(0) + 1e-6)
    return F, energy


def dtw(A, B, band=0.25):
    """Symmetric DTW (steps (1,1) w=2, (1,0) and (0,1) w=1) with a Sakoe-Chiba
    band around the diagonal. Returns path as arrays (i, j)."""
    n, m = len(A), len(B)
    # cosine distance
    An = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)
    Bn = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)
    C = 1 - An @ Bn.T
    w = int(max(abs(n - m) + 10, band * max(n, m)))
    D = np.full((n + 1, m + 1), np.inf); D[0, 0] = 0
    ptr = np.zeros((n + 1, m + 1), dtype=np.int8)
    for i in range(1, n + 1):
        jc = int(round(i * m / n))
        lo, hi = max(1, jc - w), min(m, jc + w)
        for j in range(lo, hi + 1):
            c = C[i - 1, j - 1]
            d0, d1, d2 = D[i - 1, j - 1] + 2 * c, D[i - 1, j] + c, D[i, j - 1] + c
            if d0 <= d1 and d0 <= d2:
                D[i, j] = d0; ptr[i, j] = 0
            elif d1 <= d2:
                D[i, j] = d1; ptr[i, j] = 1
            else:
                D[i, j] = d2; ptr[i, j] = 2
    i, j, pi, pj = n, m, [], []
    while i > 0 and j > 0:
        pi.append(i - 1); pj.append(j - 1)
        p = ptr[i, j]
        if p == 0: i, j = i - 1, j - 1
        elif p == 1: i -= 1
        else: j -= 1
    pi, pj = np.array(pi[::-1]), np.array(pj[::-1])
    return pi, pj, D[n, m] / (n + m), C


def voicing(x, sr):
    """Frame voicing that does not bridge voiceless consonants the way
    Harvest's f0 does: harvest f0 > 0 AND low-band (100-1000 Hz) D4C
    aperiodicity < 0.5 AND low/high band energy ratio > 5 dB AND not silence.
    Calibrated on Festival's labelled renders: vowels 0.98-1.0 voiced,
    voiceless consonants 0.17-0.26 (mostly label-edge frames), silence < 0.1."""
    import pyworld as pw
    f0, t = pw.harvest(x, sr, frame_period=FRAME * 1000, f0_floor=70, f0_ceil=600)
    sp = pw.cheaptrick(x, f0, t, sr); ap = pw.d4c(x, f0, t, sr)
    return t, f0, voiced_from(f0, sp, ap, sr)


def voiced_from(f0, sp, ap, sr):
    fb = np.linspace(0, sr / 2, sp.shape[1])
    apl = ap[:, (fb > 100) & (fb < 1000)].mean(1)
    lr = 10 * np.log10(sp[:, (fb > 80) & (fb < 1000)].sum(1) / (sp[:, fb >= 2500].sum(1) + 1e-20) + 1e-20)
    e = 10 * np.log10(sp.sum(1) + 1e-20)
    v = (f0 > 0) & (apl < 0.5) & (lr > 5) & (e > e.max() - 50)
    # debounce: drop voiced runs < 3 frames, fill unvoiced gaps < 2 frames
    v = v.copy()
    for val, mn in ((True, 3), (False, 2)):
        k = 0
        while k < len(v):
            j = k
            while j < len(v) and v[j] == v[k]:
                j += 1
            if v[k] == val and j - k < mn and k > 0 and j < len(v):
                v[k:j] = not val
            k = j
    return v


def onsets(t, v):
    return t[1:][v[1:] & ~v[:-1]]


def _trim_bounds(energy, thr_db=35):
    e = energy / np.log(10) * 10  # natural log -> dB
    on = np.where(e > e.max() - thr_db)[0]
    return on[0], on[-1]


def _map_from_path(pi, pj, xf_dur, xk_dur):
    ui = np.unique(pi)
    mj = np.array([pj[pi == u].mean() for u in ui])
    tf_u = np.concatenate([[0.0], ui * FRAME, [xf_dur]])
    tk_u = np.maximum.accumulate(np.concatenate([[0.0], mj * FRAME, [xk_dur]]))
    return lambda tt: float(np.interp(tt, tf_u, tk_u))


def align(fest_base, kpath, method="dtw"):
    """Map Festival phone times (tts.parse) onto the Kokoro take.
    Returns (words_phones in Kokoro time, report dict)."""
    xf, srf = sf.read(fest_base + ".wav"); xk, srk = sf.read(kpath)
    xf = xf.astype(np.float64); xk = xk.astype(np.float64)
    Ff, ef = features(xf, srf); Fk, ek = features(xk, srk)
    af, bf = _trim_bounds(ef); ak, bk = _trim_bounds(ek)
    tk_, f0k, vk = voicing(xk, srk)
    tf_, f0f, vf = voicing(xf, srf)
    # voicing as an extra feature dimension pulls voiced/voiceless edges together
    def add_v(F, v):
        v = np.interp(np.arange(len(F)), np.arange(len(v)), v.astype(float))
        return np.hstack([F, 2.0 * (v[:, None] - 0.5)])
    Ffv, Fkv = add_v(Ff, vf), add_v(Fk, vk)
    if method == "dtw":
        pi, pj, cost, _ = dtw(Ffv[af:bf + 1], Fkv[ak:bk + 1])
        pi += af; pj += ak
    else:  # linear baseline: stretch the speech region uniformly
        pi = np.arange(af, bf + 1); pj = ak + (pi - af) * (bk - ak) / max(1, bf - af); cost = np.nan
    fmap = _map_from_path(pi, pj, len(xf) / srf, len(xk) / srk)
    words = tts.parse(fest_base)
    out = [[[(ph, fmap(a), fmap(b)) for ph, a, b in syl] for syl in w] for w in words]
    on_k = onsets(tk_, vk)
    # snap each vowel onset that follows a voiceless consonant to the nearest
    # Kokoro voicing onset within 40 ms (moving the consonant's end with it)
    flat = [(wi, si, k) for wi, w in enumerate(out) for si, s in enumerate(w) for k in range(len(s))]
    pre = validate(out, tk_, vk)
    snapped = 0
    for n, (wi, si, k) in enumerate(flat):
        ph, a, b = out[wi][si][k]
        if ph not in tts.VOWELS or n == 0 or not len(on_k):
            continue
        pw_, ps_, pk_ = flat[n - 1]
        prev = out[pw_][ps_][pk_]
        if prev[0] not in UNVOICED:
            continue
        near = on_k[np.argmin(np.abs(on_k - a))]
        if abs(near - a) < 0.04 and prev[1] + 0.01 < near < b - 0.02:
            out[wi][si][k] = (ph, float(near), b)
            out[pw_][ps_][pk_] = (prev[0], prev[1], float(near))
            snapped += 1
    rep = validate(out, tk_, vk)
    rep.update(cost=float(cost), snapped=snapped, onset_err_pre_snap_ms=pre["onset_err_ms"],
               vowel_voiced_pre=pre["vowel_voiced"])
    return out, rep


UNVOICED = set("p t k f th s sh hh ch".split())


def validate(words, t, voiced):
    """Fraction of mapped vowel time that Kokoro voices, and the median
    distance from each post-voiceless vowel onset to the nearest voicing onset."""
    on_k = onsets(t, voiced)
    vt, vv, errs, durs = 0, 0, [], []
    flat = [p for w in words for s in w for p in s]
    for n, (ph, a, b) in enumerate(flat):
        if ph in tts.VOWELS:
            sel = (t >= a) & (t < b)
            vt += sel.sum(); vv += voiced[sel].sum(); durs.append(b - a)
            if n > 0 and flat[n - 1][0] in UNVOICED and len(on_k):
                errs.append(np.min(np.abs(on_k - a)))
    return dict(vowel_voiced=float(vv / max(1, vt)), onset_err_ms=1000 * float(np.median(errs)) if errs else 0.0,
                onset_err_max_ms=1000 * float(np.max(errs)) if errs else 0.0,
                n_onset=len(errs), min_vowel_ms=1000 * min(durs) if durs else 0.0)


def ok(rep):
    # vowel nuclei are forced voiced in sing.py, so a partly devoiced vowel is fine; reject only real misalignment
    return rep["vowel_voiced"] >= 0.7 and rep["onset_err_ms"] <= 40 and rep["onset_err_max_ms"] <= 140 and rep["min_vowel_ms"] >= 5


_aligned = {}


def aligned(li, voice=VOICE):
    """(kokoro wav path, words_phones on its timeline, report) or None if bad."""
    key = (li, voice)
    if key in _aligned:
        return _aligned[key]
    fest = os.path.join(ROOT, "build", "tts", f"line{li:02d}")
    kp = path(line_text(li), voice)
    cache = kp[:-4] + ".align.json"
    if os.path.exists(cache) and os.path.getmtime(cache) > max(os.path.getmtime(kp), os.path.getmtime(fest + ".txt")):
        d = json.load(open(cache)); words, rep = d["words"], d["rep"]
        words = [[[tuple(p) for p in s] for s in w] for w in words]
    else:
        words, rep = align(fest, kp)
        json.dump(dict(words=words, rep=rep), open(cache, "w"))
    res = (kp, words, rep) if ok(rep) else None
    _aligned[key] = res
    return res


# ------------------------------------------------------------------ voice choice
def quality(p):
    """Naturalness proxies on a take: voiced ratio of the speech region,
    harmonic clarity (1 - mean D4C aperiodicity below 4 kHz on voiced frames),
    f0 jitter (median abs frame-to-frame cents change) and spectral flatness."""
    import pyworld as pw
    x, sr = sf.read(p); x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, frame_period=5, f0_floor=70, f0_ceil=600)
    ap = pw.d4c(x, f0, t, sr)
    h = int(0.005 * sr); xx = np.concatenate([x, np.zeros(2 * h)])
    rms = np.array([np.sqrt(np.mean(xx[int(a * sr):int(a * sr) + h] ** 2) + 1e-12) for a in t])
    db = 20 * np.log10(rms)
    speech = db > db.max() - 40
    v = (f0 > 0) & speech
    nb = ap.shape[1]; fb = np.linspace(0, sr / 2, nb)
    clarity = 1 - ap[v][:, fb < 4000].mean()
    c = 1200 * np.log2(f0[v][1:] / f0[v][:-1]); c = c[np.abs(c) < 200]
    return dict(voiced=v.sum() / speech.sum(), clarity=float(clarity), jitter_c=float(np.median(np.abs(c))),
                f0_med=float(np.median(f0[v])))


if __name__ == "__main__":
    voices = sys.argv[1:] or [VOICE, VOICE_DOUBLE]
    texts = []
    for i in range(len(song.LINES)):
        tx = line_text(i)
        if tx not in texts:
            texts.append(tx)
    import time
    for v in voices:
        for tx in texts:
            t0 = time.time(); p = synth(tx, v)
            print(f"{v} {time.time() - t0:5.1f}s {tx}", flush=True)
