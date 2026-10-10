#!/usr/bin/env python3
"""video_perceive.py - a "perception kit" for a video.

Lets an AI that can only look at a few still images understand a music video's exact animation:
every cut, every distinct visual state, how things move, and how it all syncs to the music.

    python3 tools/perceive/video_perceive.py VIDEO --label L [--beats beats.json] [options]

Output (default build/perceive/L/):
    report.md       global stats + one table row per shot (camera move, motion, palette, OCR text, keyframes)
                    + flashes, text timeline, beat sync, motion punches
    shots.json      everything machine-readable (global stats, shots, cuts, flashes, transitions, punches,
                    beat sync, keyframes, text timeline, palettes)
    frames.csv      per-frame signals (luma, colourfulness, diffs, histogram distance, camera zoom/rot/pan,
                    object-motion energy, ...)
    events.csv      every cut / flash / transition / motion punch with offset to the nearest beat
    video_beats.json the beat grid used (estimated from the video's audio, or loaded from --beats)
    ocr.json        raw OCR (text, confidence, box) of every keyframe at full resolution
    sheets/         sheet_NN.jpg contact sheets (<=1600 px wide, 2 rows) with burned-in labels + index.md
    keyframes/      kNNN.jpg change-driven keyframes (higher resolution, label burned in)

Pipeline: content-window detection (letterboxed phone recordings are cropped) -> ffmpeg rawvideo pipe at ~160 px
short side -> per-frame features + Farneback flow + robust similarity camera fit (zoom / rotation / pan + residual
object motion) in 4 processes -> shots (hard cuts, flashes, dissolves / wipes / fades) -> change-driven keyframes
(+ first / middle / last of every shot) -> contact sheets -> OCR (rapidocr) -> beats + sync (librosa) -> palettes
(k-means) -> report.

Conventions: frame i is shown during [i/fps, (i+1)/fps); a cut at frame i is the first frame of the new shot and its
time is i/fps. Camera model per frame (prev->cur): zoom = fractional scale change per frame (>0 zoom-in),
rot = rotation in rad/frame (>0 clockwise on screen), tx/ty = content translation in px/frame (+x right, +y down) at
the analysis scale (160 px short side). "Object motion" = flow left over after removing the camera model.

Beats: tempo / phase from a constant-tempo grid fit on the audio onset envelope (200 fps spectral flux, full + low band), librosa
beat_track only as the fallback for drifting tempo; downbeats = every 4th beat starting at the strongest-onset phase.
--beats accepts: {"beats":[s...], "downbeats":[s...], "bpm":..} (also keys beat_times / downbeat_times),
a bare list of beat times, or a list of {"t"|"time":s, "beat":1..4, "bar":n} dicts.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

import numpy as np
import cv2

T_START = time.time()


def log(*a):
    print(f"[{time.time() - T_START:7.1f}s]", *a, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------
# constants
# --------------------------------------------------------------------------------------
HIST_BINS = 103          # 7 gray/black levels (log-spaced, fine at the dark end) + 12 hue x 2 sat x 4 val
GRID = 8                 # 8x8 block grid of mean RGB per frame
PAL_SAMPLES = 256        # fixed random pixel positions per frame, for palettes
TEX_THR = 24.0           # Sobel magnitude (about a 6 grey-level step) = "textured" pixel
FLOW_TAU = 0.5           # px (at analysis scale) inlier tolerance of the camera fit
DSAT_LO = 6.0            # per-pixel change ramps from 0 at this many levels ...
DSAT_HI = 16.0           # ... to 1 at this many (change-driven keyframes; dead zone swallows codec noise)
VQ_EDGES = [6, 12, 24, 48, 96, 160]
ANALYSIS_SHORT = 160     # analysis frames: this many px on the short side
ZS_DIV = 2               # change-measure frames: analysis size / ZS_DIV
ROOT = Path(__file__).resolve().parents[2]


def jdefault(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        f = float(o)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def clean(o):
    """recursively replace NaN/inf floats by None (valid JSON)"""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        f = float(o)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def dump_json(path, obj, indent=None):
    with open(path, "w") as f:
        json.dump(clean(obj), f, default=jdefault, indent=indent, ensure_ascii=False)


def rnd(x, k=3):
    """round for JSON/markdown; None for NaN"""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return x
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, k)


# --------------------------------------------------------------------------------------
# probe + content window + decode
# --------------------------------------------------------------------------------------
def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,start_time:format=duration",
         "-of", "json", str(path)], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    s = j["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    dur = float(s.get("duration") or j["format"]["duration"])
    nb = int(s["nb_frames"]) if s.get("nb_frames", "N/A") not in ("N/A", None) else int(round(dur * fps))
    a = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                        "stream=codec_name,start_time", "-of", "json", str(path)], capture_output=True, text=True)
    astreams = json.loads(a.stdout or "{}").get("streams", [])
    def _f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return 0.0
    return dict(width=int(s["width"]), height=int(s["height"]), fps=fps, duration=dur, nb_frames=nb,
                has_audio=bool(astreams), v_start=_f(s.get("start_time")),
                a_start=_f(astreams[0].get("start_time")) if astreams else 0.0)


def analysis_size(w, h, short=ANALYSIS_SHORT):
    """analysis frame size: `short` px on the short side, even dimensions"""
    if w >= h:
        hh = short
        ww = int(round(w * short / h / 2) * 2)
    else:
        ww = short
        hh = int(round(h * short / w / 2) * 2)
    return ww, hh


def _grab_gray(path, t, W, H):
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{t:.3f}", "-i", str(path), "-an", "-frames:v", "1",
           "-vf", f"scale={W}:{H}:flags=area:in_color_matrix=bt709", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    if len(raw) != W * H * 3:
        return None
    a = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
    return a.astype(np.float32).mean(axis=2)


def _longest_run(frac, thr, gap):
    idx = np.nonzero(frac > thr)[0]
    if len(idx) == 0:
        return None
    runs, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > gap + 1:
            runs.append((start, prev))
            start = i
        prev = i
    runs.append((start, prev))
    return max(runs, key=lambda r: r[1] - r[0])


def detect_content_window(path, info, n=40):
    """Content window (x, y, w, h) in source pixels of the part of the frame that actually changes over time.

    Letterbox / pillarbox bars are black and static; a phone recording of a 16:9 video also has static UI around it.
    So: grab `n` frames evenly across the video (fast seeks), take the per-pixel temporal std of luma, and keep the
    biggest block of rows / columns where most pixels vary. Returns the full frame when that block covers >= 90%.
    """
    w, h = info["width"], info["height"]
    full = (0, 0, w, h)
    sc = min(1.0, 1280.0 / max(w, h))
    W, H = int(round(w * sc / 2)) * 2, int(round(h * sc / 2)) * 2
    ts = [(k + 0.5) * info["duration"] / n for k in range(n)]
    with ThreadPoolExecutor(4) as ex:
        gs = [g for g in ex.map(lambda t: _grab_gray(path, t, W, H), ts) if g is not None]
    if len(gs) < 8:
        return full, dict(method="too few frames")
    g = np.stack(gs)
    sd = g.std(axis=0)
    mask = sd > 8.0
    method = "temporal std > 8"
    if mask.mean() < 0.02:                       # nearly static video: fall back to "ever lit"
        mask = g.max(axis=0) > 40
        method = "ever lit > 40"
    rows = mask.mean(axis=1)
    r = _longest_run(rows, 0.5 * np.percentile(rows, 98), max(2, H // 100))
    if r is None:
        return full, dict(method=method + " (nothing)")
    cols = mask[r[0]:r[1] + 1].mean(axis=0)
    c = _longest_run(cols, 0.5 * np.percentile(cols, 98), max(2, W // 100))
    if c is None:
        return full, dict(method=method + " (nothing)")
    rows = mask[:, c[0]:c[1] + 1].mean(axis=1)
    r = _longest_run(rows, 0.5 * np.percentile(rows, 98), max(2, H // 100)) or r
    y0, y1, x0, x1 = r[0] / sc, (r[1] + 1) / sc, c[0] / sc, (c[1] + 1) / sc
    if (x1 - x0) * (y1 - y0) >= 0.90 * w * h:
        return full, dict(method=method, window="full frame")
    # shave 1 source px off every side (anti-aliased letterbox edge), even sizes
    x0, y0 = int(math.ceil(x0)) + 1, int(math.ceil(y0)) + 1
    x1, y1 = int(math.floor(x1)) - 1, int(math.floor(y1)) - 1
    x0, y0 = x0 + (x0 & 1), y0 + (y0 & 1)
    cw, ch = (x1 - x0) // 2 * 2, (y1 - y0) // 2 * 2
    if cw < 64 or ch < 64:
        return full, dict(method=method, window="too small, using full frame")
    return (x0, y0, cw, ch), dict(method=method, window=f"{cw}x{ch} at ({x0},{y0}) of {w}x{h}")


def vf_chain(crop, info, W=None, H=None):
    """ffmpeg filter chain: crop to the content window, optional scale; colour matrix pinned to bt709 so that
    tagged and untagged files convert identically"""
    x, y, cw, ch = crop
    f = []
    if (x, y, cw, ch) != (0, 0, info["width"], info["height"]):
        f.append(f"crop={cw}:{ch}:{x}:{y}")
    if W is None:
        f.append("scale=in_color_matrix=bt709")
    else:
        f.append(f"scale={W}:{H}:flags=area:in_color_matrix=bt709")
    return ",".join(f)


def decode_small(path, crop, info, W, H, mm_path, est_frames):
    """decode every frame (passthrough, no dup/drop) to W x H rgb24 via an ffmpeg rawvideo pipe -> memmap"""
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-an", "-vf", vf_chain(crop, info, W, H),
           "-pix_fmt", "rgb24", "-fps_mode", "passthrough", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=1 << 24)
    fb = W * H * 3
    cap = int(est_frames * 1.03) + 16
    mm = np.memmap(mm_path, dtype=np.uint8, mode="w+", shape=(cap, H, W, 3))
    buf = bytearray(fb)
    view = memoryview(buf)
    n = 0
    while n < cap:
        got = 0
        while got < fb:
            k = p.stdout.readinto(view[got:])
            if not k:
                break
            got += k
        if got < fb:
            break
        mm[n] = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        n += 1
    p.stdout.close()
    p.wait()
    mm.flush()
    del mm
    return n


# --------------------------------------------------------------------------------------
# per-frame analysis (runs in worker processes)
# --------------------------------------------------------------------------------------
def _quant_hist(hsv):
    """103-bin quantised HSV histogram: grays/darks by log-spaced value (7), colours by hue x sat x val (96)"""
    Hh, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    vq = np.digitize(V, VQ_EDGES)                   # 0..6
    chrom = (S >= 50) & (V >= 24)
    hq = (Hh.astype(np.int32) * 12) // 180          # 0..11
    sq = (S >= 140).astype(np.int32)
    idx_col = 7 + (hq * 2 + sq) * 4 + np.clip(vq - 3, 0, 3)
    idx = np.where(chrom, idx_col, vq)
    return np.bincount(idx.ravel(), minlength=HIST_BINS).astype(np.float32) / idx.size


def fit_camera(flow, gray_prev, rng):
    """Robust similarity camera model from dense flow (prev->cur), on textured pixels.

    u = tx + a*x - b*y ; v = ty + b*x + a*y  with (x, y) relative to the image centre.
    a = zoom rate (fractional scale change per frame, >0 = zoom-in), b = rotation (rad/frame, >0 = clockwise
    on screen), (tx, ty) = content translation in px/frame (+x right, +y down) at the analysis scale.
    Returns dict(zoom, rot, tx, ty, inl, expl, fmag, me, act, ntex).
    """
    H, W = gray_prev.shape
    gx = cv2.Sobel(gray_prev, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray_prev, cv2.CV_32F, 0, 1, ksize=3)
    gm = cv2.magnitude(gx, gy)
    ys, xs = np.nonzero(gm[::2, ::2] > TEX_THR)
    ys = ys * 2
    xs = xs * 2
    N = len(xs)
    nan = float("nan")
    out = dict(zoom=nan, rot=nan, tx=nan, ty=nan, inl=nan, expl=nan, fmag=0.0, me=0.0, act=0.0, ntex=N / (H * W / 4))
    if N < 40:
        return out
    u = flow[ys, xs, 0].astype(np.float64)
    v = flow[ys, xs, 1].astype(np.float64)
    x = xs - (W - 1) / 2.0
    y = ys - (H - 1) / 2.0
    fm = np.hypot(u, v)
    out["fmag"] = float(fm.mean())
    tau_pt = FLOW_TAU + 0.1 * fm                   # tolerance grows with the observed flow (Farneback error)
    tau2 = tau_pt * tau_pt
    M = min(N, 600)
    sel = rng.choice(N, M, replace=False) if N > M else np.arange(N)
    xs_, ys_, us_, vs_, t2_ = x[sel], y[sel], u[sel], v[sel], tau2[sel]
    Hn = 120
    i1 = rng.integers(0, M, Hn)
    i2 = rng.integers(0, M, Hn)
    dx = xs_[i1] - xs_[i2]
    dy = ys_[i1] - ys_[i2]
    D = dx * dx + dy * dy
    ok = D > (0.2 * min(H, W)) ** 2
    i1, i2, dx, dy, D = i1[ok], i2[ok], dx[ok], dy[ok], D[ok]
    du = us_[i1] - us_[i2]
    dv = vs_[i1] - vs_[i2]
    a = (du * dx + dv * dy) / D
    b = (dv * dx - du * dy) / D
    tx = us_[i1] - a * xs_[i1] + b * ys_[i1]
    ty = vs_[i1] - b * xs_[i1] - a * ys_[i1]
    P = np.stack([a, b, tx, ty], axis=1)
    P = np.vstack([np.zeros((1, 4)), np.array([[0, 0, np.median(u), np.median(v)]]), P])   # identity, translation, pairs
    ru = us_[None, :] - (P[:, 2:3] + P[:, 0:1] * xs_[None, :] - P[:, 1:2] * ys_[None, :])
    rv = vs_[None, :] - (P[:, 3:4] + P[:, 1:2] * xs_[None, :] + P[:, 0:1] * ys_[None, :])
    score = ((ru * ru + rv * rv) < t2_[None, :]).sum(axis=1)
    best = int(np.argmax(score))
    if score[best] <= score[0] * 1.02:
        best = 0                                  # tie -> prefer identity as the starting point
    p = P[best].copy()
    for _ in range(3):                            # LS refit on inliers, all textured points
        ru = u - (p[2] + p[0] * x - p[1] * y)
        rv = v - (p[3] + p[1] * x + p[0] * y)
        inl_mask = (ru * ru + rv * rv) < tau2
        if inl_mask.sum() < 20:
            break
        xi, yi, ui, vi = x[inl_mask], y[inl_mask], u[inl_mask], v[inl_mask]
        xm, ym, um, vm = xi.mean(), yi.mean(), ui.mean(), vi.mean()
        xc, yc, uc, vc = xi - xm, yi - ym, ui - um, vi - vm
        den = (xc * xc + yc * yc).sum()
        if den < 1e-6:
            break
        a_ = (xc * uc + yc * vc).sum() / den
        b_ = (xc * vc - yc * uc).sum() / den
        p = np.array([a_, b_, um - a_ * xm + b_ * ym, vm - b_ * xm - a_ * ym])
    ru = u - (p[2] + p[0] * x - p[1] * y)
    rv = v - (p[3] + p[1] * x + p[0] * y)
    res2 = ru * ru + rv * rv
    res = np.sqrt(res2)
    inl = float((res2 < tau2).mean())
    tot = float((fm * fm).sum())
    expl = float(1.0 - res2.sum() / tot) if tot > 1e-3 * N else nan
    npts = H * W / 4.0
    out.update(zoom=float(p[0]), rot=float(p[1]), tx=float(p[2]), ty=float(p[3]), inl=inl, expl=expl,
               me=float(res.sum() / npts), act=float((res > 0.7).sum() / npts))
    return out


F32_KEYS = ("luma", "lstd", "colf", "dpix", "dgray", "dsat", "dmc", "ncc", "zoom", "rot", "tx", "ty", "inl", "expl",
            "fmag", "me", "act", "ntex")


def _analyse_chunk(job):
    mm_path, n_total, H, W, a, b = job
    cv2.setNumThreads(1)
    mm = np.memmap(mm_path, dtype=np.uint8, mode="r", shape=(n_total, H, W, 3))
    n = b - a
    zh, zw = H // ZS_DIV, W // ZS_DIV
    o = {k: np.full(n, np.nan, np.float32) for k in F32_KEYS}
    o["hist"] = np.zeros((n, HIST_BINS), np.float32)
    o["grid"] = np.zeros((n, GRID, GRID, 3), np.uint8)
    o["samp"] = np.zeros((n, PAL_SAMPLES, 3), np.uint8)
    o["zs"] = np.zeros((n, zh, zw, 3), np.uint8)
    pos = np.random.default_rng(1234).integers(0, H * W, PAL_SAMPLES)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    prev = np.array(mm[a - 1]) if a > 0 else None
    prev_gray = cv2.cvtColor(prev, cv2.COLOR_RGB2GRAY) if prev is not None else None
    prev_blur = cv2.GaussianBlur(prev_gray, (0, 0), 1.5).astype(np.float32) if prev is not None else None
    for k in range(n):
        i = a + k
        cur = np.array(mm[i])
        gray = cv2.cvtColor(cur, cv2.COLOR_RGB2GRAY)
        o["luma"][k] = gray.mean()
        o["lstd"][k] = gray.std()
        f = cur.astype(np.float32)
        rg = f[..., 0] - f[..., 1]
        yb = 0.5 * (f[..., 0] + f[..., 1]) - f[..., 2]
        o["colf"][k] = math.hypot(rg.std(), yb.std()) + 0.3 * math.hypot(rg.mean(), yb.mean())
        o["hist"][k] = _quant_hist(cv2.cvtColor(cur, cv2.COLOR_RGB2HSV))
        o["grid"][k] = cv2.resize(cur, (GRID, GRID), interpolation=cv2.INTER_AREA)
        o["samp"][k] = cur.reshape(-1, 3)[pos]
        o["zs"][k] = cv2.resize(cur, (zw, zh), interpolation=cv2.INTER_AREA)
        blur = cv2.GaussianBlur(gray, (0, 0), 1.5).astype(np.float32)
        if prev is not None:
            d = cv2.absdiff(cur, prev)
            o["dpix"][k] = d.mean()
            o["dgray"][k] = cv2.absdiff(gray, prev_gray).mean()
            o["dsat"][k] = np.clip((d.max(axis=2).astype(np.float32) - DSAT_LO) / (DSAT_HI - DSAT_LO), 0.0, 1.0).mean()
            # structural similarity of blurred luma (NCC): ~1 for the same picture (even if it moved a little),
            # ~0 across a cut.  Flat frames: 1 if both flat and equal, else 0.
            s1, s2 = float(prev_blur.std()), float(blur.std())
            if s1 > 1.0 and s2 > 1.0:
                o["ncc"][k] = float(((prev_blur - prev_blur.mean()) * (blur - blur.mean())).mean() / (s1 * s2))
            else:
                o["ncc"][k] = 1.0 if abs(float(prev_blur.mean()) - float(blur.mean())) < 4.0 and abs(s1 - s2) < 1.0 else 0.0
            flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            # backward-warp cur onto prev with the prev->cur flow: residual = what the flow cannot explain
            warped = cv2.remap(gray, xx + flow[..., 0], yy + flow[..., 1], cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
            o["dmc"][k] = cv2.absdiff(warped, prev_gray).mean()
            cam = fit_camera(flow, prev_gray, np.random.default_rng(i))
            for key, val in cam.items():
                o[key][k] = val
        prev, prev_gray, prev_blur = cur, gray, blur
    return a, o


def analyse_video(path, info, crop, W, H, work, nproc, reuse, keep_frames=False):
    cache = work / "analysis.npz"
    if reuse and cache.exists():
        z = np.load(cache, allow_pickle=False)
        if int(z["W"]) == W and int(z["H"]) == H and abs(float(z["fps"]) - info["fps"]) < 1e-6 \
                and tuple(int(v) for v in z["crop"]) == tuple(crop):
            log("analysis cache hit", cache)
            return {k: z[k] for k in z.files}
    mm_path = work / "frames_small.u8"
    meta_path = work / "frames_small.json"
    t0 = time.time()
    n = None
    if keep_frames and mm_path.exists() and meta_path.exists():
        m = json.load(open(meta_path))
        if m.get("W") == W and m.get("H") == H and tuple(m.get("crop", ())) == tuple(crop):
            n = int(m["n"])
            log(f"reusing decoded frames ({n})")
    if n is None:
        n = decode_small(path, crop, info, W, H, mm_path, info["nb_frames"])
        json.dump(dict(W=W, H=H, n=n, crop=list(crop)), open(meta_path, "w"))
        log(f"decoded {n} frames at {W}x{H} in {time.time() - t0:.1f}s")
    # ~4 jobs per worker, contiguous chunks (each reads the previous frame for flow)
    nj = max(nproc * 4, 1)
    edges = np.linspace(0, n, nj + 1).astype(int)
    jobs = [(str(mm_path), n, H, W, int(edges[j]), int(edges[j + 1])) for j in range(nj) if edges[j + 1] > edges[j]]
    parts = []
    with ProcessPoolExecutor(max_workers=nproc) as ex:
        for res in ex.map(_analyse_chunk, jobs):
            parts.append(res)
    parts.sort(key=lambda r: r[0])
    A = {k: np.concatenate([p[1][k] for p in parts], axis=0) for k in parts[0][1]}
    A.update(W=W, H=H, fps=info["fps"], n=n, crop=np.array(crop))
    log(f"analysed {n} frames in {time.time() - t0:.1f}s")
    np.savez(cache, **A)
    if not keep_frames:
        for q in (mm_path, meta_path):
            try:
                os.remove(q)
            except OSError:
                pass
    return A


# --------------------------------------------------------------------------------------
# audio: onset envelope, beat grid
# --------------------------------------------------------------------------------------
class BeatGrid:
    """beats / downbeats (seconds, video timeline) + helpers: nearest beat, bar.beat labels"""

    def __init__(self, beats, downbeats, bpm, mode, meta=None):
        self.beats = np.asarray(sorted(float(b) for b in beats), float)
        self.bpm = float(bpm) if bpm else float("nan")
        self.mode = mode
        self.meta = meta or {}
        if len(self.beats) > 1:
            self.period = float(np.median(np.diff(self.beats)))
        else:
            self.period = 60.0 / self.bpm if self.bpm == self.bpm else 0.5
        if len(downbeats):
            self.downbeats = np.asarray(sorted(float(d) for d in downbeats), float)
        else:
            self.downbeats = self.beats[::4].copy() if len(self.beats) else np.zeros(0)
        self.bar = np.zeros(len(self.beats), int)
        self.bib = np.zeros(len(self.beats), int)          # beat in bar 1..4
        for k, b in enumerate(self.beats):
            j = int(np.searchsorted(self.downbeats, b + 0.02, side="right")) - 1   # last downbeat <= b
            if j >= 0:
                d = self.downbeats[j]
                nb = int(np.sum((self.beats >= d - 0.02) & (self.beats < b - 0.02)))
                self.bar[k] = j + 1
                self.bib[k] = nb % 4 + 1
            else:                                          # pick-up beats before the first downbeat
                nb = int(np.sum((self.beats > b + 0.02) & (self.beats < self.downbeats[0] - 0.02))) if len(self.downbeats) else 0
                self.bar[k] = 0
                self.bib[k] = max(4 - nb, 1)

    def locate(self, t):
        """nearest beat info for time t: dict(beat_t, off_ms (t - beat), bar, beat, beat_pos, down_off_ms)"""
        if len(self.beats) == 0:
            return dict(beat_t=None, off_ms=None, bar=None, beat=None, beat_pos=None, down_off_ms=None)
        i = int(np.searchsorted(self.beats, t))
        cand = [k for k in (i - 1, i) if 0 <= k < len(self.beats)]
        k = min(cand, key=lambda q: abs(t - self.beats[q]))
        off = (t - self.beats[k]) * 1000.0
        di = int(np.searchsorted(self.downbeats, t))
        dc = [q for q in (di - 1, di) if 0 <= q < len(self.downbeats)]
        doff = (t - self.downbeats[min(dc, key=lambda q: abs(t - self.downbeats[q]))]) * 1000.0 if dc else None
        return dict(beat_t=float(self.beats[k]), off_ms=float(off), bar=int(self.bar[k]), beat=int(self.bib[k]),
                    beat_pos=float(self.bib[k] + off / 1000.0 / self.period), down_off_ms=doff)

    def label(self, t):
        if len(self.beats) == 0:
            return "bar -"
        L = self.locate(t)
        return f"bar {L['bar']}.{L['beat']}"

    def to_json(self):
        return dict(mode=self.mode, bpm=rnd(self.bpm, 3), period_s=rnd(self.period, 5), n_beats=len(self.beats),
                    beats=[rnd(b, 4) for b in self.beats], downbeats=[rnd(d, 4) for d in self.downbeats], **self.meta)


def extract_audio(video, wav_path, sr=22050):
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", str(sr),
                    "-c:a", "pcm_f32le", str(wav_path)], check=True)
    import soundfile as sf
    y, s = sf.read(str(wav_path), dtype="float32")
    return y, s


def onset_envelopes(y, sr, n_fft=512, hop=110):
    """full-band and low-band (kick / bass) positive spectral flux of log-mel, 200 fps; short window so that the
    envelope peak sits on the onset (a 2048 window is ~15 ms early)"""
    import librosa
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop)) ** 2
    mel = librosa.feature.melspectrogram(S=S, sr=sr, n_mels=64, fmin=30, fmax=10000)
    lm = librosa.power_to_db(mel, ref=np.max)
    flux = np.maximum(0.0, np.diff(lm, axis=1, prepend=lm[:, :1]))

    def nz(x):
        x = x - np.median(x)
        return x / (np.percentile(x, 95) + 1e-9)

    return nz(flux.sum(0)), nz(flux[:12].sum(0)), sr / hop


def _interp_env(env, fe, t):
    idx = np.asarray(t) * fe
    i0 = np.clip(np.floor(idx).astype(int), 0, len(env) - 2)
    fr = idx - np.floor(idx)
    return env[i0] * (1 - fr) + env[i0 + 1] * fr


def estimate_beats(full, low, fe, duration):
    """Constant-tempo grid fit (coarse 70-190 BPM scan with a mild 120 BPM prior, then fine tempo + phase), a
    stability check on 20 s windows (falls back to librosa beat_track with the fitted tempo when the grid
    drifts), downbeats = every 4th beat starting at the strongest-onset phase."""
    env = np.maximum(full + low, 0.0)
    t_end = len(env) / fe

    def gs(P, ph, a=0.0, b=None):
        b = t_end if b is None else b
        ts = np.arange(ph, b, P)
        ts = ts[ts >= a]
        if len(ts) == 0:
            return 0.0
        return float(_interp_env(env, fe, ts).mean())

    coarse = []
    for bpm in np.arange(70.0, 190.0, 0.05):
        P = 60.0 / bpm
        sc, ph = max((gs(P, p), p) for p in np.arange(0, P, 0.01))
        w = math.exp(-0.5 * (math.log2(bpm / 120.0) / 0.7) ** 2)
        coarse.append((sc * w, sc, bpm, ph))
    coarse.sort(reverse=True)
    bpm0 = coarse[0][2]
    fine = []
    for bpm in np.arange(bpm0 - 0.5, bpm0 + 0.5, 0.005):
        P = 60.0 / bpm
        for p in np.arange(0, P, 0.002):
            fine.append((gs(P, p), bpm, p))
    sc, bpm, ph = max(fine)
    P = 60.0 / bpm
    drift = []
    for a in np.arange(0, t_end - 10, 20.0):
        b = min(a + 20.0, t_end)
        lp = max((gs(P, p, a, b), p) for p in np.arange(0, P, 0.004))[1]
        drift.append(((lp - ph + P / 2) % P - P / 2) * 1000.0)
    max_drift = float(np.max(np.abs(drift))) if drift else 0.0
    # a single odd window is just an off-beat-heavy passage; real tempo drift moves many windows
    n_off = int(np.sum(np.abs(drift) > 30.0)) if drift else 0
    mode = "grid"
    if n_off <= max(1, int(0.25 * len(drift))):
        t0 = ph - P * math.ceil((ph + 0.02) / P)          # earliest grid beat >= -20 ms
        beats = np.arange(t0 if t0 > -0.02 else t0 + P, duration, P)
        bpm_final = bpm
    else:                                                  # tempo drifts: follow the music instead
        import librosa
        hop = int(round(22050 / fe))
        _, bt = librosa.beat.beat_track(onset_envelope=env, sr=22050, hop_length=hop, bpm=bpm, units="time",
                                        tightness=200, trim=False)
        beats = np.asarray(bt, float)
        mode = "dynamic"
        bpm_final = 60.0 / float(np.median(np.diff(beats))) if len(beats) > 2 else bpm
    downs, dmeta = strongest_phase_downbeats(beats, full, low, fe)
    meta = dict(score=rnd(sc, 3), max_window_drift_ms=rnd(max_drift, 1), windows_off_grid=n_off, windows=len(drift), **dmeta,
                source="estimated from the video's audio")
    return BeatGrid(beats, downs, bpm_final, mode, meta)


def strongest_phase_downbeats(beats, full, low, fe):
    """downbeats = every 4th beat, starting at the phase (beat index mod 4) whose beats carry the strongest onsets
    (full-band + low-band flux within +-30 ms of the beat)"""
    beats = np.asarray(beats, float)
    env = np.maximum(full + low, 0.0)
    w = int(0.03 * fe)
    strength = np.array([env[max(int(round(b * fe)) - w, 0):int(round(b * fe)) + w + 1].max()
                         if 0 <= b * fe < len(env) - 1 else 0.0 for b in beats])
    ph_score = [float(strength[p::4].mean()) if len(strength[p::4]) else 0.0 for p in range(4)]
    best = int(np.argmax(ph_score))
    srt = sorted(ph_score, reverse=True)
    return beats[best::4], dict(downbeat_phase=best, downbeat_phase_scores=[rnd(q, 3) for q in ph_score],
                                downbeat_confidence=rnd((srt[0] - srt[1]) / (srt[0] + 1e-9), 3))


def load_beats(path, duration):
    """--beats file -> BeatGrid; accepts several layouts (see module docstring)"""
    j = json.load(open(path))
    beats, downs, bpm = [], [], None
    if isinstance(j, dict):
        for k in ("beats", "beat_times", "beat_t"):
            if k in j and isinstance(j[k], list):
                beats = j[k]
                break
        for k in ("downbeats", "downbeat_times", "downbeat_t"):
            if k in j and isinstance(j[k], list):
                downs = j[k]
                break
        bpm = j.get("bpm") or j.get("tempo")
    elif isinstance(j, list):
        beats = j
    norm_b, norm_d = [], []
    for b in beats:
        if isinstance(b, dict):
            t = b.get("t", b.get("time", b.get("start")))
            norm_b.append(float(t))
            if b.get("beat") == 1 or b.get("is_downbeat"):
                norm_d.append(float(t))
        elif isinstance(b, (list, tuple)):
            norm_b.append(float(b[0]))
            if len(b) > 1 and int(b[1]) == 1:
                norm_d.append(float(b[0]))
        else:
            norm_b.append(float(b))
    for d in downs:
        norm_d.append(float(d["t"] if isinstance(d, dict) else d))
    norm_d = sorted(set(round(d, 4) for d in norm_d))
    if not norm_b:
        raise SystemExit(f"--beats {path}: no beats found")
    if not bpm and len(norm_b) > 2:
        bpm = 60.0 / float(np.median(np.diff(sorted(norm_b))))
    return norm_b, norm_d, bpm


# --------------------------------------------------------------------------------------
# derived per-frame signals, cuts, flashes, soft transitions, shots
# --------------------------------------------------------------------------------------
CUT_THR = 0.45           # composite change score at/above which a frame is a cut candidate
CUT_THR_MAX = 0.80       # adaptive threshold never exceeds this (dense strobe passages still yield cuts)


def _edge_maps(zs):
    """blurred Sobel magnitude of every half-res frame (structure, insensitive to brightness / polarity changes)"""
    n = len(zs)
    E = np.zeros(zs.shape[:3], np.float16)
    for i in range(n):
        g = cv2.cvtColor(zs[i], cv2.COLOR_RGB2GRAY)
        gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        E[i] = cv2.GaussianBlur(cv2.magnitude(gx, gy), (0, 0), 1.2)
    return E


def _ncc(a, b, flat=0.3):
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    sa, sb = float(a.std()), float(b.std())
    if sa < flat and sb < flat:
        return 1.0                      # both flat: nothing structural changed
    if sa < flat or sb < flat:
        return 0.0                      # structure appeared / vanished
    return float(((a - a.mean()) * (b - b.mean())).mean() / (sa * sb))


def derive_signals(A):
    n = int(A["n"])
    hist = A["hist"]
    S = {}
    dh = np.zeros(n, np.float32)
    dh[1:] = 0.5 * np.abs(hist[1:] - hist[:-1]).sum(1)
    S["dh"] = dh
    g = A["grid"].astype(np.float32).reshape(n, -1)
    dg = np.zeros(n, np.float32)
    dg[1:] = np.abs(g[1:] - g[:-1]).mean(1) / 255.0
    S["dg"] = dg
    E = _edge_maps(A["zs"])
    S["E"] = E
    se = np.zeros(n, np.float32)
    for i in range(1, n):
        se[i] = 1.0 - _ncc(E[i - 1], E[i])
    S["se"] = np.clip(se, 0.0, 2.0)
    P = np.nan_to_num(A["dsat"]).astype(np.float32)
    S["score"] = 0.5 * dh + 0.3 * P + 0.2 * np.minimum(S["se"], 1.0)
    S["score"][0] = 0.0
    return S


def _similar(A, S, i, j):
    """are frames i and j the same picture (colour distribution and structure)?"""
    tv = 0.5 * float(np.abs(A["hist"][i] - A["hist"][j]).sum())
    nc = _ncc(S["E"][i], S["E"][j])
    return tv < 0.30 and nc > 0.45, tv, nc


def detect_cuts_flashes(A, S, fps):
    """cut candidates = peaks of the composite change score above an adaptive threshold; a candidate pair <= 3
    frames apart whose before/after pictures match is an excursion = flash, not two cuts.  Extra luma spikes
    (1-3 frames, robust vs a 9-frame median) that never made a cut candidate are flashes too."""
    from scipy.ndimage import median_filter, maximum_filter1d
    n = int(A["n"])
    sc = S["score"].astype(np.float64)
    med = median_filter(sc, size=61, mode="nearest")
    mad = median_filter(np.abs(sc - med), size=61, mode="nearest")
    thr = np.clip(med + 4.0 * 1.4826 * mad, CUT_THR, CUT_THR_MAX)
    mx = maximum_filter1d(sc, size=5, mode="nearest")
    cand = [i for i in range(1, n) if sc[i] >= thr[i] and sc[i] >= mx[i] - 1e-9 and sc[i] > sc[i - 1] - 1e-9
            and (i + 1 >= n or sc[i] >= sc[i + 1])]
    # de-duplicate plateaus (equal maxima next to each other)
    ded = []
    for c in cand:
        if ded and c - ded[-1] <= 1:
            continue
        ded.append(c)
    cand = ded
    luma = A["luma"]
    flashes, used = [], set()
    for c in cand:
        if c in used:
            continue
        for k in range(1, 4):
            c2 = c + k
            if c2 >= n:
                break
            if sc[c2] < 0.5 * CUT_THR:
                continue
            ok, tv, nc = _similar(A, S, c - 1, c2)
            if ok:
                seg = luma[c:c2]
                base = 0.5 * (luma[c - 1] + luma[c2])
                dl = float(seg.max() - base) if abs(seg.max() - base) >= abs(seg.min() - base) else float(seg.min() - base)
                flashes.append(dict(frame=c, length=k, peak_frame=int(c + np.argmax(np.abs(seg - base))), delta_luma=dl,
                                    kind=("bright" if dl > 12 else "dark" if dl < -12 else "colour"),
                                    peak_luma=float(luma[c + int(np.argmax(np.abs(seg - base)))]), pre_post_tv=tv,
                                    strength=float(max(sc[c], sc[c2])), via="excursion"))
                used.update([c, c2])
                break
    cuts = [c for c in cand if c not in used]
    # luma spikes that were not cut candidates
    base = median_filter(luma.astype(np.float64), size=9, mode="nearest")
    dl = luma - base
    loc = 1.4826 * median_filter(np.abs(dl), size=61, mode="nearest")
    flag = np.abs(dl) > np.maximum(12.0, 5.0 * loc)
    covered = np.zeros(n, bool)
    for f in flashes:
        covered[max(f["frame"] - 1, 0):f["frame"] + f["length"] + 2] = True
    if cuts:
        covered[np.array(cuts, int)] = True
    i = 0
    while i < n:
        if flag[i]:
            j = i
            while j + 1 < n and flag[j + 1] and np.sign(dl[j + 1]) == np.sign(dl[i]):
                j += 1
            L = j - i + 1
            near_cut = any(abs(i - c) <= 1 or abs(j + 1 - c) <= 1 for c in cuts)
            if L <= 3 and not covered[i:j + 1].any() and not near_cut and i > 0 and j < n - 1:
                seg = dl[i:j + 1]
                pk = int(i + np.argmax(np.abs(seg)))
                flashes.append(dict(frame=i, length=L, peak_frame=pk, delta_luma=float(dl[pk]),
                                    kind="bright" if dl[pk] > 0 else "dark", peak_luma=float(luma[pk]),
                                    pre_post_tv=None, strength=float(abs(dl[pk]) / 255.0), via="luma spike"))
            i = j + 1
        else:
            i += 1
    flashes.sort(key=lambda f: f["frame"])
    return cuts, flashes, thr


def detect_soft_transitions(A, S, fps, cuts, flashes):
    """dissolves / wipes / fades: a 5-30 frame run, free of hard cuts, in which the picture is replaced (colour
    distribution AND structure differ clearly before vs after), the change is steady (straight path through
    histogram space) and the camera model cannot explain it (motion-compensated residual ~ plain frame diff)."""
    n = int(A["n"])
    hist, dh, dmc, dgray, luma = A["hist"], S["dh"], A["dmc"], A["dgray"], A["luma"]
    blocked = np.zeros(n, bool)
    for c in cuts:
        blocked[max(c - 1, 0):c + 2] = True
    for f in flashes:
        blocked[max(f["frame"] - 1, 0):f["frame"] + f["length"] + 1] = True
    cum = np.concatenate([[0.0], np.cumsum(dh[1:])])
    found = []
    for w in (6, 10, 16, 24, 30):
        for b in range(w, n):
            a = b - w
            if blocked[a + 1:b + 1].any():
                continue
            if S["score"][a + 1:b + 1].max() >= 0.5:
                continue
            D = 0.5 * float(np.abs(hist[b] - hist[a]).sum())
            if D < 0.35:
                continue
            path = cum[b] - cum[a]
            if path <= 1e-6 or D / path < 0.65:
                continue
            nc = _ncc(S["E"][a], S["E"][b])
            if 1.0 - nc < 0.6:
                continue
            ratio = float(np.nanmedian(dmc[a + 1:b + 1] / np.maximum(dgray[a + 1:b + 1], 0.5)))
            if ratio < 0.6:
                continue
            found.append((D * (1.0 - nc), a, b, D, 1.0 - nc, D / path, ratio))
    found.sort(reverse=True)
    out, taken = [], np.zeros(n, bool)
    for q, a, b, D, sd, st, ratio in found:
        if taken[a:b + 1].any():
            continue
        # tighten to the frames where 10-90% of the change happens
        prog = np.array([0.5 * float(np.abs(hist[j] - hist[a]).sum()) for j in range(a, b + 1)]) / max(D, 1e-6)
        ins = np.nonzero((prog >= 0.1) & (prog <= 0.9))[0]
        if len(ins) < 5:                      # shorter than ~0.17 s is a cut with a blended frame, not a transition
            continue
        s0, s1 = a + int(ins[0]), a + int(ins[-1])
        lseg = luma[a:b + 1]
        kind = "dissolve"
        if lseg.min() < 12 and min(luma[a], luma[b]) > 30 and (b - a) >= 6:
            kind = "fade-black"
        elif lseg.max() > 243 and max(luma[a], luma[b]) < 215:
            kind = "fade-white"
        elif min(luma[a], luma[b]) < 8 and max(luma[a], luma[b]) > 20:
            kind = "fade-in" if luma[a] < luma[b] else "fade-out"
        else:
            kind = _wipe_or_dissolve(A, a, b)
        out.append(dict(frame=s0, end=s1, length=s1 - s0 + 1, mid=(s0 + s1) // 2, kind=kind, pre=a, post=b,
                        tv=float(D), struct_change=float(sd), straightness=float(st), mc_ratio=float(ratio)))
        taken[a:b + 1] = True
    out.sort(key=lambda t: t["frame"])
    return out


def _wipe_or_dissolve(A, a, b):
    """wipe if the 8x8 cells flip at clearly different times along one direction, dissolve if they flip together"""
    g = A["grid"][a:b + 1].astype(np.float32)               # (T, 8, 8, 3)
    tot = np.abs(g[-1] - g[0]).sum(axis=2)                  # (8, 8)
    cells = np.argwhere(tot > 40)
    if len(cells) < 10:
        return "dissolve"
    t50 = []
    for (r, c) in cells:
        pr = np.abs(g[:, r, c] - g[0, r, c]).sum(axis=1) / tot[r, c]
        k = np.nonzero(pr >= 0.5)[0]
        t50.append(k[0] / max(len(pr) - 1, 1) if len(k) else 1.0)
    t50 = np.array(t50)
    if t50.std() < 0.12:
        return "dissolve"
    X = np.c_[cells[:, 1], cells[:, 0], np.ones(len(cells))].astype(float)
    coef, res, *_ = np.linalg.lstsq(X, t50, rcond=None)
    pred = X @ coef
    r2 = 1.0 - ((t50 - pred) ** 2).sum() / max(((t50 - t50.mean()) ** 2).sum(), 1e-9)
    return "wipe" if r2 > 0.5 else "dissolve"


def build_shots(n, fps, cuts, softs, flashes, S):
    """shots from hard cuts (boundary = first frame of new content) and soft transitions (boundary = middle)."""
    bounds = {0: dict(kind="start", frame=0, length=0)}
    for c in cuts:
        # a cut that sits inside a soft transition span is part of it
        bounds[c] = dict(kind="cut", frame=c, length=0, score=float(S["score"][c]))
    for t in softs:
        for c in list(bounds):
            if c != 0 and t["frame"] <= c <= t["end"]:
                del bounds[c]
        bounds[t["mid"]] = dict(kind=t["kind"], frame=t["frame"], length=t["length"], end=t["end"], mid=t["mid"],
                                tv=t["tv"], struct_change=t["struct_change"])
    fl_start = {f["frame"]: f for f in flashes}
    keys = sorted(bounds)
    shots = []
    for k, b in enumerate(keys):
        e = (keys[k + 1] - 1) if k + 1 < len(keys) else n - 1
        ent = dict(bounds[b])
        shots.append(dict(id=k + 1, start=b, end=e, entry=ent))
    # clean spans (exclude transition frames) used for keyframes / palettes / stats
    for k, s in enumerate(shots):
        cs, ce = s["start"], s["end"]
        ent = s["entry"]
        if ent["kind"] not in ("start", "cut"):
            cs = max(cs, ent["end"] + 1)
        if k + 1 < len(shots):
            nx = shots[k + 1]["entry"]
            if nx["kind"] not in ("start", "cut"):
                ce = min(ce, nx["frame"] - 1)
        if ce < cs:
            cs, ce = s["start"], s["end"]
        s["clean"] = (cs, ce)
    return shots


# --------------------------------------------------------------------------------------
# camera classification, per-shot motion statistics
# --------------------------------------------------------------------------------------
CAM_ZOOM_THR = 1.5       # %/s     (|zoom| above this = a zoom)
CAM_ROT_THR = 1.0        # deg/s
CAM_PAN_THR = 2.5        # % of the short side per second
ME_BINS = [(0.0, 0.05, "static"), (0.05, 0.3, "gentle"), (0.3, 1.0, "moderate"), (1.0, 3.0, "strong"), (3.0, 1e9, "violent")]


def camera_series(A, cuts, flashes, softs):
    """smoothed per-frame camera rates + validity mask + per-frame label"""
    from scipy.ndimage import median_filter
    n = int(A["n"])
    fps = float(A["fps"])
    short = float(min(A["W"], A["H"]))
    bad = np.zeros(n, bool)
    bad[0] = True
    for c in cuts:
        bad[max(c - 1, 0):c + 2] = True
    for f in flashes:
        bad[max(f["frame"] - 1, 0):f["frame"] + f["length"] + 2] = True
    for s in softs:
        bad[max(s["frame"] - 1, 0):s["end"] + 2] = True
    raw_nan = np.isnan(A["zoom"])
    zoom, rot, tx, ty = [np.nan_to_num(A[k]).astype(np.float64) for k in ("zoom", "rot", "tx", "ty")]
    C = dict(
        zoom_ps=100.0 * median_filter(zoom, 5, mode="nearest") * fps,          # %/s
        rot_ps=np.degrees(median_filter(rot, 5, mode="nearest")) * fps,        # deg/s
        pan_x=100.0 * median_filter(tx, 5, mode="nearest") * fps / short,      # % of short side per s (+ = content right)
        pan_y=100.0 * median_filter(ty, 5, mode="nearest") * fps / short)      # (+ = content down)
    C["pan_ps"] = np.hypot(C["pan_x"], C["pan_y"])
    C["valid"] = ~bad & ~raw_nan
    C["bad"] = bad
    C["nan"] = raw_nan
    lab = np.full(n, "n/a", dtype=object)
    mz, mr, mp = np.abs(C["zoom_ps"]) / CAM_ZOOM_THR, np.abs(C["rot_ps"]) / CAM_ROT_THR, C["pan_ps"] / CAM_PAN_THR
    for i in range(n):
        if not C["valid"][i]:
            continue
        m = max(mz[i], mr[i], mp[i])
        if m < 1.0:
            lab[i] = "static"
        elif m == mz[i]:
            lab[i] = "zoom-in" if C["zoom_ps"][i] > 0 else "zoom-out"
        elif m == mp[i]:
            lab[i] = "pan"
        else:
            lab[i] = "rotate"
    C["label"] = lab
    return C


def _dir_word(px, py, thr=0.25):
    """direction the CONTENT drifts on screen"""
    w = []
    if abs(py) > thr * max(abs(px), abs(py)):
        w.append("down" if py > 0 else "up")
    if abs(px) > thr * max(abs(px), abs(py)):
        w.append("right" if px > 0 else "left")
    return "-".join(w) if w else "-"


def shot_motion(A, C, a, b):
    """camera numbers + motion energy for frames a..b (inclusive)"""
    fps = float(A["fps"])
    m = C["valid"][a:b + 1]
    out = dict(frames=b - a + 1, analysed=int(m.sum()))
    me = A["me"][a:b + 1][m]
    act = A["act"][a:b + 1][m]
    out["me_mean"] = float(me.mean()) if len(me) else float("nan")
    out["me_p90"] = float(np.percentile(me, 90)) if len(me) else float("nan")
    out["me_max"] = float(me.max()) if len(me) else float("nan")
    out["act_mean"] = float(act.mean()) if len(act) else float("nan")
    if m.sum() == 0:
        out.update(zoom_pct_s=float("nan"), zoom_total=float("nan"), rot_deg_s=float("nan"), rot_total_deg=float("nan"),
                   pan_pct_s=float("nan"), pan_x=float("nan"), pan_y=float("nan"), move="n/a", labels={})
        return out
    dur = m.sum() / fps
    z = C["zoom_ps"][a:b + 1][m]
    r = C["rot_ps"][a:b + 1][m]
    px = C["pan_x"][a:b + 1][m]
    py = C["pan_y"][a:b + 1][m]
    out["zoom_pct_s"] = float(z.mean())
    out["zoom_total"] = float(np.exp(np.sum(np.log1p(z / 100.0 / fps))))
    out["rot_deg_s"] = float(r.mean())
    out["rot_total_deg"] = float(r.sum() / fps)
    out["pan_x"] = float(px.mean())
    out["pan_y"] = float(py.mean())
    out["pan_pct_s"] = float(np.hypot(px.mean(), py.mean()))
    labs = Counter(C["label"][a:b + 1][m])
    out["labels"] = {k: round(v / m.sum(), 3) for k, v in labs.most_common()}
    parts = []
    if abs(out["zoom_pct_s"]) >= CAM_ZOOM_THR:
        parts.append(f"{'zoom-in' if out['zoom_pct_s'] > 0 else 'zoom-out'} {out['zoom_pct_s']:+.1f}%/s (x{out['zoom_total']:.2f})")
    if out["pan_pct_s"] >= CAM_PAN_THR:
        parts.append(f"pan {_dir_word(out['pan_x'], out['pan_y'])} {out['pan_pct_s']:.1f}%/s")
    if abs(out["rot_deg_s"]) >= CAM_ROT_THR:
        parts.append(f"rot {out['rot_deg_s']:+.1f}deg/s ({out['rot_total_deg']:+.0f}deg)")
    out["move"] = ", ".join(parts) if parts else "static"
    return out


# --------------------------------------------------------------------------------------
# change-driven keyframes
# --------------------------------------------------------------------------------------
_KER = np.ones((5, 5), np.uint8)


def _ref_bounds(z):
    """per-channel 5x5 min / max of the reference picture: a pixel only counts as changed when it falls outside the
    range its neighbourhood had, so slow camera drift (a few px) does not trigger keyframes but new elements do"""
    zu = np.ascontiguousarray(z)
    return cv2.erode(zu, _KER).astype(np.int16), cv2.dilate(zu, _KER).astype(np.int16)


def _change(zi, bounds):
    lo, hi = bounds
    c = zi.astype(np.int16)
    d = np.maximum(c - hi, lo - c).max(axis=2).astype(np.float32)
    return float(np.clip((d - DSAT_LO) / (DSAT_HI - DSAT_LO), 0.0, 1.0).mean())


def _kf_pass(Z, shots, forced, skip, T, gap):
    """walk every shot in order; a frame becomes a keyframe when it differs from the previous keyframe by more than T
    (fraction of the picture that changed visibly, camera drift tolerated); forced frames (first / mid / last /
    flash / transition) reset the reference"""
    kfs = dict(forced)
    for s in shots:
        cs, ce = s["clean"]
        ref = None
        last = -10 ** 9
        for i in range(cs, ce + 1):
            if i in forced or ref is None:
                ref, last = _ref_bounds(Z[i]), i
                continue
            if skip[i] or i - last < gap:
                continue
            if _change(Z[i], ref) >= T:
                kfs[i] = "change"
                ref, last = _ref_bounds(Z[i]), i
    return kfs


def select_keyframes(A, shots, flashes, softs, fps, target, gap=4, max_flash_kf=40):
    Z = A["zs"]
    n = int(A["n"])
    forced = {}
    for s in shots:
        cs, ce = s["clean"]
        L = ce - cs + 1
        if L <= 6:
            forced[(cs + ce) // 2] = "mid"
        elif L <= 15:
            forced[cs] = "first"
            forced[ce] = "last"
        else:
            forced[cs] = "first"
            forced[(cs + ce) // 2] = "mid"
            forced[ce] = "last"
    skip = np.zeros(n, bool)
    for f in flashes:
        skip[f["frame"]:f["frame"] + f["length"] + 1] = True
    for t in softs:
        skip[t["frame"]:t["end"] + 1] = True
    fl = sorted(flashes, key=lambda f: -abs(f["delta_luma"]))[:max_flash_kf]
    for f in fl:
        forced.setdefault(int(f["peak_frame"]), "flash")
    for t in sorted(softs, key=lambda t: -t["tv"])[:30]:
        forced.setdefault(int(t["mid"]), "transition")
    # dedupe forced frames that are adjacent (<= 1 frame) to a higher-priority one
    prio = {"first": 0, "last": 1, "mid": 2, "flash": 3, "transition": 4, "change": 5}
    fr = sorted(forced)
    keep = {}
    for f in fr:
        near = [g for g in keep if abs(g - f) <= 1]
        if near and all(prio[keep[g]] <= prio[forced[f]] for g in near):
            continue
        for g in near:
            del keep[g]
        keep[f] = forced[f]
    forced = keep
    hi_T = 0.95
    # the change-driven keyframes get at least a quarter of the budget on top of the forced ones
    target = int(min(max(target, len(forced) + 0.25 * target), max(target, 350)))
    kfs = _kf_pass(Z, shots, forced, skip, hi_T, gap)
    best = (hi_T, kfs)
    if len(kfs) < target:
        lo, hi = 0.01, hi_T
        for _ in range(9):
            T = math.sqrt(lo * hi)
            kfs = _kf_pass(Z, shots, forced, skip, T, gap)
            cnt = len(kfs)
            if abs(cnt - target) < abs(len(best[1]) - target):
                best = (T, kfs)
            if cnt > target:
                lo = T
            else:
                hi = T
            if abs(cnt - target) <= max(3, 0.02 * target):
                break
    T, kfs = best
    return T, kfs


# --------------------------------------------------------------------------------------
# keyframe extraction (exact frame index, content window, burned-in labels) + contact sheets
# --------------------------------------------------------------------------------------
KF_MAX_SIDE = 1280
FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
                   "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"]


def _font(size):
    from PIL import ImageFont
    for f in FONT_CANDIDATES:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def burn_label(rgb, text, size):
    """white text on a translucent black band in the top-left corner"""
    from PIL import Image, ImageDraw
    im = Image.fromarray(np.ascontiguousarray(rgb))
    dr = ImageDraw.Draw(im, "RGBA")
    f = _font(size)
    l, t, r, b = dr.textbbox((0, 0), text, font=f)
    pad = max(2, size // 5)
    dr.rectangle([0, 0, r + 2 * pad, b - t + 2 * pad], fill=(0, 0, 0, 175))
    dr.text((pad, pad - t), text, font=f, fill=(255, 255, 255, 255))
    return np.asarray(im)


def kf_label(kf):
    return f"#{kf['id']}  t={kf['t']:.2f}s  shot {kf['shot']}  {kf['bar_label']}"


def sheet_geometry(cw, ch):
    vertical = ch > cw
    cols, cell_w = (6, 260) if vertical else (4, 390)
    cell_h = int(round(cell_w * ch / cw))
    return vertical, cols, 2, cell_w, cell_h


def extract_keyframes(video, crop, info, kfs, outdir, work):
    """one ffmpeg pass: select the exact frame indices, crop to the content window; for each frame write the labelled
    keyframe jpg, a labelled thumbnail for the sheets and the raw frame into a memmap (for OCR)."""
    x, y, cw, ch = crop
    frames = [k["frame"] for k in kfs]
    order = np.argsort(frames)
    sel = "+".join(f"eq(n\\,{frames[i]})" for i in order)
    vf = f"select='{sel}'," + vf_chain(crop, info)
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(video), "-an", "-vf", vf, "-fps_mode", "passthrough",
           "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    kdir = outdir / "keyframes"
    shutil.rmtree(kdir, ignore_errors=True)
    kdir.mkdir(parents=True)
    K = len(kfs)
    mm_path = work / "kf_full.u8"
    mm = np.memmap(mm_path, dtype=np.uint8, mode="w+", shape=(K, ch, cw, 3))
    vertical, cols, rows, cell_w, cell_h = sheet_geometry(cw, ch)
    thumbs = [None] * K
    sc = min(1.0, KF_MAX_SIDE / max(cw, ch))
    ow, oh = int(round(cw * sc / 2)) * 2, int(round(ch * sc / 2)) * 2
    fsize_kf = max(13, int(round(min(ow, oh) / 26)))
    fsize_th = 11 if vertical else 14
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=1 << 24)
    fb = cw * ch * 3
    got_n = 0
    for pos, i in enumerate(order):
        raw = p.stdout.read(fb)
        while raw is not None and len(raw) < fb:
            more = p.stdout.read(fb - len(raw))
            if not more:
                break
            raw += more
        if raw is None or len(raw) < fb:
            log(f"WARNING: ffmpeg delivered only {pos} of {K} keyframes")
            break
        got_n += 1
        fr = np.frombuffer(raw, np.uint8).reshape(ch, cw, 3)
        mm[i] = fr
        kf = kfs[i]
        label = kf_label(kf)
        big = cv2.resize(fr, (ow, oh), interpolation=cv2.INTER_AREA) if sc < 1.0 else fr
        from PIL import Image
        Image.fromarray(burn_label(big, label, fsize_kf)).save(kdir / f"k{kf['id']:03d}.jpg", quality=88)
        th = cv2.resize(fr, (cell_w, cell_h), interpolation=cv2.INTER_AREA)
        thumbs[i] = burn_label(th, label, fsize_th)
    p.stdout.close()
    p.wait()
    mm.flush()
    del mm
    return dict(mm_path=mm_path, K=K, h=ch, w=cw, got=got_n), thumbs, (vertical, cols, rows, cell_w, cell_h)


def build_sheets(thumbs, kfs, geom, outdir, name):
    from PIL import Image
    vertical, cols, rows, cell_w, cell_h = geom
    sdir = outdir / "sheets"
    shutil.rmtree(sdir, ignore_errors=True)
    sdir.mkdir(parents=True)
    gap = 2
    per = cols * rows
    nsheet = int(math.ceil(len(kfs) / per))
    sheets = []
    for si in range(nsheet):
        W = cols * cell_w + (cols + 1) * gap
        H = rows * cell_h + (rows + 1) * gap
        img = np.full((H, W, 3), 22, np.uint8)
        idx = list(range(si * per, min((si + 1) * per, len(kfs))))
        for q, ki in enumerate(idx):
            r, c = divmod(q, cols)
            if thumbs[ki] is None:
                continue
            y0, x0 = gap + r * (cell_h + gap), gap + c * (cell_w + gap)
            img[y0:y0 + cell_h, x0:x0 + cell_w] = thumbs[ki]
        fn = f"sheet_{si + 1:02d}.jpg"
        Image.fromarray(img).save(sdir / fn, quality=80)
        sheets.append(dict(file=fn, width=W, height=H, keyframes=[kfs[k]["id"] for k in idx],
                           t0=kfs[idx[0]]["t"], t1=kfs[idx[-1]]["t"],
                           shots=[kfs[idx[0]]["shot"], kfs[idx[-1]]["shot"]]))
    L = [f"# Contact sheets: {name}", "",
         f"{len(kfs)} keyframes, {len(sheets)} sheets ({cols} columns x {rows} rows of {cell_w} px cells, "
         f"{'vertical' if vertical else 'landscape'} content), time order left-to-right, top-to-bottom. "
         "Cell label: `#keyframe  t=seconds  shot  bar.beat`. Full-size frames are in `../keyframes/kNNN.jpg`.", "",
         "| sheet | time span (s) | shots | keyframes |", "|---|---|---|---|"]
    for sh in sheets:
        ids = sh["keyframes"]
        L.append(f"| {sh['file']} | {sh['t0']:.2f} - {sh['t1']:.2f} | {sh['shots'][0]}-{sh['shots'][1]} | #{ids[0]}-#{ids[-1]} ({len(ids)}) |")
    L += ["", "## Keyframes per sheet", ""]
    for sh in sheets:
        L.append(f"**{sh['file']}** ({sh['t0']:.2f} - {sh['t1']:.2f} s)")
        row = []
        for kid in sh["keyframes"]:
            kf = kfs[kid - 1]
            row.append(f"#{kid} {kf['t']:.2f}s s{kf['shot']} {kf['bar_label'].replace('bar ', '')} {kf['kind']}")
        L.append("; ".join(row))
        L.append("")
    (sdir / "index.md").write_text("\n".join(L))
    return sheets


# --------------------------------------------------------------------------------------
# OCR (rapidocr) of every keyframe at full resolution + text timeline
# --------------------------------------------------------------------------------------
_OCR = None


def _ocr_init():
    """one RapidOCR per worker process, onnxruntime pinned to a single thread (4 workers x 1 thread is ~1.6x faster
    than 1 worker x 4 threads here)"""
    global _OCR
    import onnxruntime as ort
    import rapidocr_onnxruntime.utils as ru
    Orig = ort.SessionOptions

    class _SO(Orig):
        def __init__(self):
            super().__init__()
            self.intra_op_num_threads = 1
            self.inter_op_num_threads = 1

    ru.SessionOptions = _SO
    from rapidocr_onnxruntime import RapidOCR
    _OCR = RapidOCR()


def _ocr_job(job):
    path, K, h, w, idx = job
    mm = np.memmap(path, dtype=np.uint8, mode="r", shape=(K, h, w, 3))
    img = cv2.cvtColor(np.array(mm[idx]), cv2.COLOR_RGB2BGR)
    try:
        res, _ = _OCR(img)
    except Exception as e:                                   # a bad frame must not kill the run
        return idx, [], repr(e)
    out = []
    for r in (res or []):
        box, text, conf = r[0], r[1], r[2]
        out.append(dict(text=str(text), conf=float(conf), box=[[round(float(px), 1), round(float(py), 1)] for px, py in box]))
    return idx, out, None


def run_ocr(ex_info, nproc):
    K = ex_info["K"]
    jobs = [(str(ex_info["mm_path"]), K, ex_info["h"], ex_info["w"], i) for i in range(K)]
    res = [None] * K
    errs = 0
    with ProcessPoolExecutor(max_workers=nproc, initializer=_ocr_init) as ex:
        for idx, out, err in ex.map(_ocr_job, jobs, chunksize=2):
            res[idx] = out
            errs += err is not None
    if errs:
        log(f"WARNING: OCR failed on {errs} keyframes")
    return res


def norm_text(s):
    return " ".join(re.sub(r"[^0-9a-zÀ-ɏЀ-ӿ぀-鿿 ]+", " ", s.lower()).split())


def plausible_text(text, conf):
    """cheap junk filter for the timeline (raw OCR stays in ocr.json): mostly letters / digits, at least 2 letters or 3
    digits, and a confidence that rises with how odd the string looks"""
    t = text.strip()
    if not t:
        return False
    alnum = sum(c.isalnum() for c in t)
    letters = sum(c.isalpha() for c in t)
    digits = sum(c.isdigit() for c in t)
    if alnum / len(t) < 0.7 or (letters < 2 and digits < 3):
        return False
    if letters >= 2 and not re.search(r"[AEIOUYaeiouy\u00c0-\u024f]", t) and len(t) > 3 and conf < 0.85:
        return False                                    # consonant soup
    return True


def _box_geom(box, w, h):
    pts = np.array(box, float)
    cx, cy = pts[:, 0].mean() / w, pts[:, 1].mean() / h
    hl = 0.5 * (np.hypot(*(pts[3] - pts[0])) + np.hypot(*(pts[2] - pts[1])))      # left / right edge = text height
    wl = 0.5 * (np.hypot(*(pts[1] - pts[0])) + np.hypot(*(pts[2] - pts[3])))
    return float(cx), float(cy), float(hl), float(wl)


def pos_word(cx, cy):
    v = "top" if cy < 1 / 3 else ("centre" if cy < 2 / 3 else "bottom")
    hh = "left" if cx < 1 / 3 else ("centre" if cx < 2 / 3 else "right")
    if v == "centre" and hh == "centre":
        return "centre"
    if hh == "centre":
        return v
    if v == "centre":
        return hh
    return f"{v}-{hh}"


def size_word(hn):
    return "tiny" if hn < 0.03 else "small" if hn < 0.055 else "medium" if hn < 0.10 else "large" if hn < 0.18 else "huge"


def build_text_timeline(kfs, ocr, w, h, fps, duration, min_conf=0.65, min_chars=2):
    """link OCR lines of consecutive keyframes into on-screen text tracks (same text = fuzzy match >= 0.8, gap of at
    most 3 keyframes / 6 s).  first / last seen are keyframe times; `appear_window` / `vanish_window` bracket the
    true appearance / disappearance between the neighbouring keyframes."""
    tracks = []
    order = sorted(range(len(kfs)), key=lambda i: kfs[i]["frame"])
    for pos, ki in enumerate(order):
        kf = kfs[ki]
        used = set()
        for o in ocr[ki] or []:
            tx = norm_text(o["text"])
            if o["conf"] < min_conf or len(tx.replace(" ", "")) < min_chars or not plausible_text(o["text"], o["conf"]):
                continue
            cx, cy, hl, wl = _box_geom(o["box"], w, h)
            best, br = None, 0.0
            for tr in tracks:
                if id(tr) in used or tr["last_pos"] < pos - 3 or kf["t"] - tr["last_t"] > 6.0:
                    continue
                r = difflib.SequenceMatcher(None, tr["norm"], tx).ratio()
                if r >= 0.8 and r > br:
                    best, br = tr, r
            if best is None:
                best = dict(norm=tx, texts=[], first_pos=pos, first_t=kf["t"], first_frame=kf["frame"], kfs=[], obs=[])
                tracks.append(best)
            used.add(id(best))
            best["texts"].append((o["conf"], o["text"]))
            best["last_pos"], best["last_t"], best["last_frame"] = pos, kf["t"], kf["frame"]
            best["kfs"].append(kf["id"])
            best["obs"].append((cx, cy, hl / h, wl / w, o["conf"]))
            bp = np.array(o["box"], float)
            best.setdefault("boxes", []).append((kf["frame"], bp[:, 0].min(), bp[:, 1].min(), bp[:, 0].max(), bp[:, 1].max()))
            if len(tx) > len(best["norm"]) and o["conf"] >= 0.8:
                best["norm"] = tx
    out = []
    tk = [kfs[i]["t"] for i in order]
    for tr in tracks:
        ob = np.array(tr["obs"])
        txt = max(tr["texts"], key=lambda q: (q[0] + 0.02 * len(q[1])))[1]
        cx, cy = float(np.median(ob[:, 0])), float(np.median(ob[:, 1]))
        hn = float(np.median(ob[:, 2]))
        a, b = tr["first_pos"], tr["last_pos"]
        out.append(dict(
            text=txt, first_seen=tr["first_t"], last_seen=tr["last_t"],
            first_frame=tr["first_frame"], last_frame=tr["last_frame"], n_obs=len(ob),
            keyframes=sorted(set(tr["kfs"])), conf=float(ob[:, 4].mean()),
            pos=pos_word(cx, cy), cx=cx, cy=cy, size=size_word(hn), height_frac=hn,
            height_px=hn * h, width_frac=float(np.median(ob[:, 3])),
            first_seen_kf=tr["first_t"], last_seen_kf=tr["last_t"],
            box_first=[round(float(v), 1) for v in tr["boxes"][0][1:]], box_last=[round(float(v), 1) for v in tr["boxes"][-1][1:]],
            appear_window=[tk[a - 1] if a > 0 else 0.0, tr["first_t"]],
            vanish_window=[tr["last_t"], tk[b + 1] if b + 1 < len(tk) else duration]))
    out.sort(key=lambda t: (t["first_seen"], t["cy"]))
    for i, t in enumerate(out):
        t["id"] = i + 1
    return out


def refine_text_times(tracks, small, W, H, cw, ch, fps, thr=0.75):
    """First / last seen are keyframe times.  Tighten them to frame accuracy by following the text's box in the
    analysis-size frames: from the keyframe where it was read, step outwards (towards the neighbouring keyframes where
    it was not read) while the box content still correlates (NCC >= thr) with the keyframe's.  Static text over a
    changing background, or text that is still sliding / fading in, may stop early; fields `*_refined` say what was done."""
    n = small.shape[0]
    sx, sy = W / cw, H / ch
    cache = {}

    def g(f):
        if f not in cache:
            if len(cache) > 400:
                cache.clear()
            cache[f] = cv2.cvtColor(np.array(small[f]), cv2.COLOR_RGB2GRAY).astype(np.float32)
        return cache[f]

    for tr in tracks:
        tr["first_refined"] = tr["last_refined"] = False
        for which in ("first", "last"):
            fr = tr["first_frame"] if which == "first" else tr["last_frame"]
            x0, y0, x1, y1 = tr["box_first"] if which == "first" else tr["box_last"]
            bx_x0, bx_x1 = max(int(math.floor(x0 * sx)) - 1, 0), min(int(math.ceil(x1 * sx)) + 1, W)
            bx_y0, bx_y1 = max(int(math.floor(y0 * sy)) - 1, 0), min(int(math.ceil(y1 * sy)) + 1, H)
            if bx_x1 - bx_x0 < 4 or bx_y1 - bx_y0 < 3 or not (0 <= fr < n):
                continue
            ref = g(fr)[bx_y0:bx_y1, bx_x0:bx_x1]
            if float(ref.std()) < 4.0:
                continue
            if which == "first":
                lo = int(round(tr["appear_window"][0] * fps))
                rng = range(fr - 1, max(lo, 0), -1)
            else:
                hi = int(round(tr["vanish_window"][1] * fps))
                rng = range(fr + 1, min(hi, n))
            f_ok = fr
            for f in rng:
                pt = g(f)[bx_y0:bx_y1, bx_x0:bx_x1]
                if float(pt.std()) < 1.0 or _ncc(pt, ref, flat=1.0) < thr:
                    break
                f_ok = f
            if which == "first":
                tr["first_frame"], tr["first_seen"], tr["first_refined"] = f_ok, f_ok / fps, f_ok != fr
            else:
                tr["last_frame"], tr["last_seen"], tr["last_refined"] = f_ok, f_ok / fps, f_ok != fr
    return tracks


def text_coverage(tracks, duration):
    """fraction of the video during which at least one text is visible (union of track intervals, each stretched half
    way towards the neighbouring keyframes where it was not seen, at most 1 s)"""
    iv = []
    for t in tracks:
        a = t["first_seen"] - min(0.5 * (t["first_seen"] - t["appear_window"][0]), 1.0)
        b = t["last_seen"] + min(0.5 * (t["vanish_window"][1] - t["last_seen"]), 1.0)
        iv.append((a, b))
    iv.sort()
    tot, cur = 0.0, None
    for a, b in iv:
        if cur is None or a > cur[1]:
            if cur:
                tot += cur[1] - cur[0]
            cur = [a, b]
        else:
            cur[1] = max(cur[1], b)
    if cur:
        tot += cur[1] - cur[0]
    return tot / max(duration, 1e-6)


# --------------------------------------------------------------------------------------
# palettes
# --------------------------------------------------------------------------------------
def shot_palette(samp, a, b, k=5, max_pts=6000, seed=0):
    """k-means (Lab) over the fixed random pixel samples of frames a..b -> [(hex, share)] sorted by share"""
    px = samp[a:b + 1].reshape(-1, 3)
    if len(px) > max_pts:
        px = px[np.random.default_rng(seed).choice(len(px), max_pts, replace=False)]
    if len(px) == 0:
        return []
    lab = cv2.cvtColor(px.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    kk = int(min(k, len(np.unique(px, axis=0))))
    if kk < 1:
        return []
    cv2.setRNGSeed(seed)
    _, labels, _ = cv2.kmeans(lab, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3,
                              cv2.KMEANS_PP_CENTERS)
    labels = labels.ravel()
    out = []
    for c in range(kk):
        m = labels == c
        if not m.any():
            continue
        rgb = px[m].mean(axis=0).round().astype(int)
        out.append(("#%02x%02x%02x" % tuple(int(v) for v in rgb), float(m.mean())))
    out.sort(key=lambda q: -q[1])
    return out


def palette_clusters(shots, hist, thr=0.30):
    """number of distinct colour 'looks': agglomerative clustering of the per-shot mean colour histograms"""
    from scipy.cluster.hierarchy import fcluster, linkage
    if len(shots) < 2:
        return len(shots), [1] * len(shots)
    H = np.stack([hist[s["clean"][0]:s["clean"][1] + 1].mean(axis=0) for s in shots])
    Z = linkage(H, method="average", metric="cityblock")       # L1 = 2 x total-variation distance
    lab = fcluster(Z, t=2.0 * thr, criterion="distance")
    return int(lab.max()), [int(x) for x in lab]


# --------------------------------------------------------------------------------------
# motion punches, beat sync, audio-visual correlation
# --------------------------------------------------------------------------------------
def _frame_env(env, fe, n, fps):
    """mean onset envelope over each video frame interval"""
    c = np.concatenate([[0.0], np.cumsum(env)])
    a = np.clip(np.round(np.arange(n) / fps * fe).astype(int), 0, len(env))
    b = np.clip(np.round((np.arange(n) + 1) / fps * fe).astype(int), 0, len(env))
    return (c[b] - c[a]) / np.maximum(b - a, 1)


def _spikes(x, valid, fps, k, floor, min_gap=5, win=61):
    """peaks of x above its rolling median by k robust sigmas (sigma >= floor/4) and by the absolute floor"""
    from scipy.ndimage import median_filter, uniform_filter1d
    from scipy.signal import find_peaks
    xx = np.where(valid, x, np.nan)
    med0 = np.nanmedian(xx) if np.isfinite(xx).any() else 0.0
    fill = np.where(np.isnan(xx), med0 if np.isfinite(med0) else 0.0, xx)
    xs = uniform_filter1d(fill, 3, mode="nearest")
    med = median_filter(xs, size=win, mode="nearest")
    sig = np.maximum(1.4826 * median_filter(np.abs(xs - med), size=win, mode="nearest"), 0.25 * floor)
    z = (xs - med) / sig
    pk, props = find_peaks(xs, height=floor, distance=min_gap)
    out = []
    for p in pk:
        if z[p] >= k and valid[p]:
            lo, hi = max(p - 1, 0), min(p + 2, len(x))
            q = lo + int(np.argmax(np.where(valid[lo:hi], x[lo:hi], -np.inf)))      # the raw maximum next to the smoothed peak
            out.append((int(q), float(x[q]), float(z[p]), float(med[p])))
    return out


def detect_punches(A, C, fps):
    n = int(A["n"])
    valid = C["valid"]
    zraw = np.nan_to_num(A["zoom"]) * 100.0 * fps                       # %/s signed
    P = []
    for p, v, z, med in _spikes(np.abs(zraw), valid, fps, k=4.0, floor=12.0):
        P.append(dict(kind="zoom-in punch" if zraw[p] > 0 else "zoom-out punch", frame=p, value=float(zraw[p]),
                      unit="%/s", z=z, baseline=med))
    for p, v, z, med in _spikes(A["me"].astype(np.float64), valid, fps, k=4.0, floor=1.0):
        P.append(dict(kind="motion punch", frame=p, value=v, unit="px/frame@160", z=z, baseline=med))
    ts = np.hypot(np.nan_to_num(A["tx"]), np.nan_to_num(A["ty"])) * fps / float(min(A["W"], A["H"])) * 100.0
    for p, v, z, med in _spikes(ts, valid, fps, k=4.0, floor=25.0):
        P.append(dict(kind="pan punch", frame=p, value=v, unit="%short/s", z=z, baseline=med))
    P.sort(key=lambda q: q["frame"])
    return P


def subdivision_offsets(offs_ms, period_ms, div):
    """signed offset (ms) to the nearest multiple of period/div, for beat-relative offsets in [-P/2, P/2]"""
    q = period_ms / div
    o = np.asarray(offs_ms, float)
    return (o + q / 2) % q - q / 2


def sync_stats(times, grid, tol_ms=50.0):
    """how well do event times sit on the beat grid?  beat / downbeat / 8th / 16th hit rates with chance levels"""
    if len(times) == 0 or len(grid.beats) == 0:
        return dict(n=int(len(times)))
    locs = [grid.locate(t) for t in times]
    off = np.array([l["off_ms"] for l in locs], float)
    doff = np.array([l["down_off_ms"] if l["down_off_ms"] is not None else np.nan for l in locs], float)
    P = grid.period * 1000.0
    out = dict(n=int(len(times)), tol_ms=tol_ms, period_ms=P)

    def hit(o, per):
        o = o[~np.isnan(o)]
        return (float(np.mean(np.abs(o) <= tol_ms)) if len(o) else float("nan")), min(1.0, 2 * tol_ms / per)

    out["beat"], out["beat_chance"] = hit(off, P)
    out["downbeat"], out["downbeat_chance"] = hit(doff, 4 * P)
    out["eighth"], out["eighth_chance"] = hit(subdivision_offsets(off, P, 2), P / 2)
    out["sixteenth"], out["sixteenth_chance"] = hit(subdivision_offsets(off, P, 4), P / 4)
    out["within_1_frame_of_beat"] = float(np.mean(np.abs(off) <= 1000.0 / 30.0 + 1e-6))
    out["median_abs_offset_ms"] = float(np.median(np.abs(off)))
    # circular mean offset within a beat (where in the beat the events cluster)
    ang = off / P * 2 * np.pi
    out["mean_offset_ms"] = float(np.angle(np.mean(np.exp(1j * ang))) / (2 * np.pi) * P)
    out["offset_concentration"] = float(np.abs(np.mean(np.exp(1j * ang))))      # 0 = uniform, 1 = all at one phase
    bpos = np.array([l["beat"] for l in locs])
    out["by_beat_in_bar"] = {str(b): int(np.sum(bpos == b)) for b in (1, 2, 3, 4)}
    return out


def audio_visual_sync(A, C, env_frames, grid, fps):
    """correlation of motion signals with the audio onset envelope (+- 10 frames) and phase-folded modulation at the
    beat / half-beat / bar rate with a circular-shift surrogate z-score"""
    from scipy.ndimage import uniform_filter1d
    n = int(A["n"])
    valid = C["valid"]
    sigs = {"object_motion": A["me"].astype(np.float64), "flow_magnitude": A["fmag"].astype(np.float64),
            "abs_zoom_rate": np.abs(np.nan_to_num(A["zoom"])) * fps * 100.0,
            "frame_diff": np.nan_to_num(A["dgray"]).astype(np.float64), "luma": A["luma"].astype(np.float64)}
    env = env_frames
    res = {}
    rng = np.random.default_rng(7)

    def detrend(x):
        return x - uniform_filter1d(x, int(fps * 1.5), mode="nearest")

    ev = detrend(uniform_filter1d(env, 3, mode="nearest"))
    for nm, x in sigs.items():
        x = np.where(valid, x, np.nan)
        fillv = np.where(np.isnan(x), np.nanmedian(x), x)
        xd = detrend(uniform_filter1d(fillv, 3, mode="nearest"))
        r_by_lag = {}
        for lag in range(-10, 11):
            if lag >= 0:
                a, b = xd[lag:], ev[:n - lag]
                m = valid[lag:]
            else:
                a, b = xd[:n + lag], ev[-lag:]
                m = valid[:n + lag]
            if m.sum() > 50 and a[m].std() > 1e-9 and b[m].std() > 1e-9:
                r_by_lag[lag] = float(np.corrcoef(a[m], b[m])[0, 1])
        e = dict(r_lag0=r_by_lag.get(0))
        if r_by_lag:
            bl = max(r_by_lag, key=lambda q: r_by_lag[q])
            e["best_r"], e["best_lag_ms"] = r_by_lag[bl], bl * 1000.0 / fps       # + = picture lags the sound
        # phase folding
        if len(grid.beats) > 8:
            t = (np.arange(n) + 0.5) / fps
            P = grid.period
            t0 = float(grid.beats[0])
            fold = {}
            for nm2, per, nb in (("beat", P, 8), ("half_beat", P / 2, 6), ("bar", 4 * P, 16)):
                ph = ((t - t0) / per) % 1.0
                b_idx = np.minimum((ph * nb).astype(int), nb - 1)

                def depth(sig):
                    prof = np.array([np.nanmean(sig[(b_idx == q) & valid]) if np.any((b_idx == q) & valid) else np.nan
                                     for q in range(nb)])
                    mu = np.nanmean(prof)
                    return (np.nanmax(prof) - np.nanmin(prof)) / (abs(mu) + 1e-9), prof
                d0, prof = depth(xd + np.nanmean(fillv))
                null = []
                for _ in range(60):
                    sh = int(rng.integers(int(2 * fps), n - int(2 * fps)))
                    null.append(depth(np.roll(xd, sh) + np.nanmean(fillv))[0])
                z = (d0 - np.mean(null)) / (np.std(null) + 1e-9)
                pk = int(np.nanargmax(prof))
                fold[nm2] = dict(depth=float(d0), z=float(z), peak_offset_ms=float((pk + 0.5) / nb * per * 1000.0),
                                 profile=[rnd(v, 3) for v in prof])
            e["fold"] = fold
        res[nm] = e
    res["_onset_corr_signal"] = "audio onset envelope (full + low band), per-frame mean"
    return res


# --------------------------------------------------------------------------------------
# assembly: per-shot records, global statistics, outputs
# --------------------------------------------------------------------------------------
def fmt_t(t):
    return f"{t:.2f}"


def bar_beat_str(grid, t):
    if len(grid.beats) == 0:
        return "-"
    L = grid.locate(t)
    return f"{L['bar']}.{L['beat']}"


def entry_label(ent, grid, fps):
    k = ent["kind"]
    if k == "start":
        return "start"
    if k in ("cut", "tone-cut"):
        t = ent["frame"] / fps
        off = grid.locate(t)["off_ms"] if len(grid.beats) else None
        return f"{k}" + (f" @{off:+.0f}ms" if off is not None else "")
    t = ent["mid"] / fps
    off = grid.locate(t)["off_ms"] if len(grid.beats) else None
    return f"{k} {ent['length']}f" + (f" @{off:+.0f}ms" if off is not None else "")


def mark_bursts(shots, max_len=12, min_run=3):
    run = []
    bid = 0
    for s in shots + [None]:
        if s is not None and (s["end"] - s["start"] + 1) <= max_len and s["entry"]["kind"] != "start":
            run.append(s)
            continue
        if len(run) >= min_run:
            bid += 1
            for r in run:
                r["burst"] = bid
        run = []
    return bid


def ranges_str(ids):
    ids = sorted(set(ids))
    out, i = [], 0
    while i < len(ids):
        j = i
        while j + 1 < len(ids) and ids[j + 1] == ids[j] + 1:
            j += 1
        out.append(f"#{ids[i]}" if i == j else f"#{ids[i]}-{ids[j]}")
        i = j + 1
    return ",".join(out)


def md_escape(s):
    return str(s).replace("|", "/").replace("\n", " ")


def build_report(R):
    """R: dict with everything; returns report.md text"""
    info, st, grid, sync, shots = R["info"], R["stats"], R["grid"], R["sync"], R["shots_out"]
    L = []
    a = L.append
    a(f"# Perception report: {R['label']}")
    a("")
    cw = R["crop"]
    a(f"`{R['video']}`  {info['width']}x{info['height']} @ {info['fps']:g} fps, {info['duration']:.2f} s, {info['nb_frames']} frames. "
      f"Content window: {cw[2]}x{cw[3]} at ({cw[0]},{cw[1]})" + (" (letterboxed source: bars / UI cropped)" if (cw[2], cw[3]) != (info['width'], info['height']) else " (full frame)") +
      f". Analysis at {R['W']}x{R['H']} (every frame). Kit run took {R['runtime_s']:.0f} s.")
    a("")
    a("Time `t` = frame/fps, the instant the frame is first shown; a cut at frame i is the first frame of the new shot. "
      "`bar.beat` = nearest beat of the beat grid (bar 1 starts at the first downbeat). `@+12ms` = event minus nearest beat "
      "(negative = early). Frame quantisation is 33.3 ms, so offsets are +-17 ms accurate at best.")
    a("")
    a("## Global stats")
    a("")
    a("| stat | value |")
    a("|---|---|")
    for k, v in st["table"]:
        a(f"| {k} | {md_escape(v)} |")
    a("")
    a("## Beat sync")
    a("")
    a(R["sync_md"])
    a("")
    a("## Shots")
    a("")
    a("`entry` = how the shot starts (hard cut / tone-cut = same picture, colours jump / dissolve / wipe / fade; `@ms` = offset to nearest beat). "
      "`camera` = global camera model fitted to dense optical flow (zoom %/s and total factor, pan = direction the CONTENT drifts, % of short side/s, rotation deg/s). "
      "`motion` = residual object motion after removing the camera (px/frame at 160 px short side): mean (p90). "
      "`burst` = rapid-cut passage (>=3 consecutive shots of <=12 frames).")
    a("")
    a("| id | time (s) | bar.beat | dur s | entry | camera | motion | palette | text (OCR) | keyframes |")
    a("|---|---|---|---|---|---|---|---|---|---|")
    for s in shots:
        a("| {id} | {t0}-{t1} | {bb} | {dur} | {entry}{burst} | {cam} | {me} | {pal} | {txt} | {kf} |".format(
            id=s["id"], t0=fmt_t(s["start_s"]), t1=fmt_t(s["end_s"]), bb=s["bar_beat"], dur=f"{s['duration_s']:.2f}",
            entry=md_escape(s["entry_label"]), burst=(f" [burst {s['burst']}]" if s.get("burst") else ""),
            cam=md_escape(s["camera"]["move"]),
            me=("-" if s["motion"]["me_mean"] is None else f"{s['motion']['me_mean']:.2f} ({s['motion']['me_p90']:.2f})"),
            pal=" ".join(c["hex"] for c in s["palette"]), txt=md_escape(s["text_str"]), kf=s["keyframes_str"]))
    a("")
    if R["flashes"]:
        a("## Flashes (1-3 frame excursions)")
        a("")
        a("| # | t (s) | frame | frames | kind | peak luma | d luma | bar.beat | beat offset | via |")
        a("|---|---|---|---|---|---|---|---|---|---|")
        for i, f in enumerate(R["flashes"]):
            a(f"| {i + 1} | {f['t']:.2f} | {f['frame']} | {f['length']} | {f['kind']} | {f['peak_luma']:.0f} | {f['delta_luma']:+.0f} | {f['bar_beat']} | "
              f"{'-' if f['beat_off_ms'] is None else format(f['beat_off_ms'], '+.0f') + ' ms'} | {f['via']} |")
        a("")
    if R["soft"]:
        a("## Soft transitions")
        a("")
        a("| # | frames | t (s) | kind | length | bar.beat | mid offset | tv | struct change |")
        a("|---|---|---|---|---|---|---|---|---|")
        for i, t in enumerate(R["soft"]):
            a(f"| {i + 1} | {t['frame']}-{t['end']} | {t['t0']:.2f}-{t['t1']:.2f} | {t['kind']} | {t['length']} | {t['bar_beat']} | "
              f"{'-' if t['beat_off_ms'] is None else format(t['beat_off_ms'], '+.0f') + ' ms'} | {t['tv']:.2f} | {t['struct_change']:.2f} |")
        a("")
    a(f"## Motion punches (spikes in zoom rate / object motion / pan speed, hits within 2 frames merged; strongest {len(R['punch_top'])} of {len(R['punches'])} individual spikes, all in events.csv)")
    a("")
    a("| t (s) | kind | value | z | bar.beat | beat offset |")
    a("|---|---|---|---|---|---|")
    for p in R["punch_top"]:
        a(f"| {p['t']:.2f} | {p['kind']} | {', '.join(f'{k} {v}' for k, v in p['values'].items())} | {p['z']:.1f} | {p['bar_beat']} | "
          f"{'-' if p['beat_off_ms'] is None else format(p['beat_off_ms'], '+.0f') + ' ms'} |")
    a("")
    a("## Text timeline (OCR of keyframes)")
    a("")
    a(f"{len(R['text'])} on-screen texts kept (read on >= 2 keyframes or with confidence >= 0.8; the other {R['stats']['text_tracks_all'] - len(R['text'])} "
      "single, low-confidence reads are only in shots.json / ocr.json).")
    a("")
    if R["text"]:
        a("`seen` = first-last time the text is on screen: read by OCR on keyframes, edges tightened to frame accuracy by following the text box "
          "(`~` = refined; the keyframe-only bracket is `appear in` / `gone in`). pos = where in the content window, size = text height / window height (px at native resolution).")
        a("")
        a("| # | seen (s) | bar.beat | text | pos | size (px) | conf | appear in | gone in | shots |")
        a("|---|---|---|---|---|---|---|---|---|---|")
        for t in R["text"]:
            a(f"| {t['id']} | {t['first_seen']:.2f}{'~' if t.get('first_refined') else ''}-{t['last_seen']:.2f}{'~' if t.get('last_refined') else ''} | {t['bar_beat']} | {md_escape(t['text'])} | {t['pos']} | {t['size']} ({t['height_px']:.0f}) | "
              f"{t['conf']:.2f} | {t['appear_window'][0]:.2f}-{t['appear_window'][1]:.2f} | {t['vanish_window'][0]:.2f}-{t['vanish_window'][1]:.2f} | {t['shots_str']} |")
    else:
        a("No text recognised.")
    a("")
    a("## Files")
    a("")
    a("`shots.json` (everything), `frames.csv` (per-frame signals), `events.csv` (cuts / flashes / transitions / punches with beat offsets), "
      "`video_beats.json` (beat grid), `ocr.json` (raw OCR), `sheets/sheet_NN.jpg` + `sheets/index.md` (contact sheets), `keyframes/kNNN.jpg` (labelled full-size keyframes).")
    a("")
    a("## Caveats")
    a("")
    for c in R["caveats"]:
        a(f"- {c}")
    a("")
    return "\n".join(L)


def pct(x, d=0):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{100.0 * x:.{d}f}%"


def top_punches(punches, n_top=40, join=2):
    """punches that fire within `join` frames of each other are one camera / motion hit; return the strongest n_top of
    those groups (by the highest z of their members), time ordered.  Each group: t, frame, kinds, values, z, beat info."""
    groups = []
    for p in sorted(punches, key=lambda q: q["frame"]):
        if groups and p["frame"] - groups[-1]["last"] <= join:
            g = groups[-1]
            g["members"].append(p)
            g["last"] = p["frame"]
        else:
            groups.append(dict(members=[p], last=p["frame"]))
    out = []
    for g in groups:
        m = g["members"]
        best = max(m, key=lambda q: q["z"])
        vals = {}
        for q in m:
            vals.setdefault(q["kind"].replace(" punch", ""), f"{q['value']:+.1f} {q['unit']}")
        out.append(dict(t=best["t"], frame=best["frame"], kind=" + ".join(sorted(vals)) + " punch", z=best["z"], unit="",
                        value=best["value"], values=vals, bar_beat=best["bar_beat"], beat_off_ms=best["beat_off_ms"], members=len(m)))
    out.sort(key=lambda q: -q["z"])
    return sorted(out[:n_top], key=lambda q: q["t"])


def sync_table_md(sync_by_type, av, grid):
    L = []
    if len(grid.beats) == 0:
        return "No audio / beat grid: sync not computed."
    L.append(f"Beat grid: **{grid.bpm:.2f} BPM** (period {grid.period * 1000:.1f} ms), mode `{grid.mode}`"
             f"{', stability check: ' + str(grid.meta.get('windows_off_grid')) + ' of ' + str(grid.meta.get('windows')) + ' 20-s windows off the fitted grid' if grid.meta.get('windows') is not None else ''}"
             f"; downbeat phase {grid.meta.get('downbeat_phase', '-')} (confidence {grid.meta.get('downbeat_confidence', '-')}); "
             f"{len(grid.beats)} beats, {len(grid.downbeats)} downbeats; source: {grid.meta.get('source', 'given')}.")
    L.append("")
    L.append("Share of events within +-50 ms of: beat / downbeat / 8th-note / 16th-note grid (random chance in brackets). "
             "`mean off` = circular mean of the offset to the nearest beat (negative = events lead the beat), `conc` = how tightly "
             "the offsets cluster (0 = uniform, 1 = identical).")
    L.append("")
    L.append("| events | n | beat | downbeat | 8th | 16th | median abs off | mean off | conc | beat 1/2/3/4 |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for nm, s in sync_by_type.items():
        if s.get("n", 0) == 0 or "beat" not in s:
            L.append(f"| {nm} | {s.get('n', 0)} | - | - | - | - | - | - | - | - |")
            continue
        bib = s["by_beat_in_bar"]
        L.append(f"| {nm} | {s['n']} | {pct(s['beat'])} ({pct(s['beat_chance'])}) | {pct(s['downbeat'])} ({pct(s['downbeat_chance'])}) | "
                 f"{pct(s['eighth'])} ({pct(s['eighth_chance'])}) | {pct(s['sixteenth'])} ({pct(s['sixteenth_chance'])}) | "
                 f"{s['median_abs_offset_ms']:.0f} ms | {s['mean_offset_ms']:+.0f} ms | {s['offset_concentration']:.2f} | "
                 f"{bib['1']}/{bib['2']}/{bib['3']}/{bib['4']} |")
    if av:
        L.append("")
        L.append("Motion vs music. `r` = Pearson correlation of the (detrended) signal with the audio onset envelope at zero lag / best lag within +-333 ms "
                 "(positive lag = picture lags the sound). `fold z` = how much more the signal varies with beat phase than a circularly shifted copy does "
                 "(|z| > 3 is real); `peak` = where in the beat (ms after the beat) it is strongest.")
        L.append("")
        L.append("| signal | r (lag 0) | best r @ lag | beat fold z (depth) | peak | half-beat z | bar z |")
        L.append("|---|---|---|---|---|---|---|")
        for k, v in av.items():
            if k.startswith("_"):
                continue
            f = v.get("fold", {})
            L.append(f"| {k} | {v.get('r_lag0', float('nan')):+.3f} | {v.get('best_r', float('nan')):+.3f} @ {v.get('best_lag_ms', 0):+.0f} ms | "
                     f"{f.get('beat', {}).get('z', float('nan')):+.1f} ({f.get('beat', {}).get('depth', float('nan')):.2f}) | "
                     f"{f.get('beat', {}).get('peak_offset_ms', float('nan')):.0f} ms | {f.get('half_beat', {}).get('z', float('nan')):+.1f} | "
                     f"{f.get('bar', {}).get('z', float('nan')):+.1f} |")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description="video perception kit: shots, keyframes, sheets, OCR, beat sync, palettes")
    ap.add_argument("video")
    ap.add_argument("--label", required=True)
    ap.add_argument("--beats", help="beats json (see module docstring); default: estimate from the video's audio")
    ap.add_argument("--out", help="output dir (default build/perceive/LABEL)")
    ap.add_argument("--nproc", type=int, default=min(4, os.cpu_count() or 4))
    ap.add_argument("--short", type=int, default=ANALYSIS_SHORT, help="analysis size: px on the short side")
    ap.add_argument("--kf-target", type=int, help="target keyframe count (default 2 per second, clamped to 150-350)")
    ap.add_argument("--crop", help="content window x,y,w,h in source pixels (default: auto-detect)")
    ap.add_argument("--no-crop", action="store_true")
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--reuse", action="store_true", help="reuse the cached decode / analysis in OUT/_video_work")
    ap.add_argument("--keep-work", action="store_true", help="keep OUT/_video_work (decoded small frames, analysis cache)")
    args = ap.parse_args()

    video = Path(args.video).resolve()
    out = Path(args.out) if args.out else ROOT / "build" / "perceive" / args.label
    work = out / "_video_work"
    work.mkdir(parents=True, exist_ok=True)
    info = probe(video)
    fps, n_exp = info["fps"], info["nb_frames"]
    log(f"{video.name}: {info['width']}x{info['height']} {fps:g} fps {info['duration']:.1f}s {n_exp} frames audio={info['has_audio']}")

    # 1. content window
    cj = work / "crop.json"
    if args.no_crop:
        crop, cdesc = (0, 0, info["width"], info["height"]), dict(method="disabled")
    elif args.crop:
        crop, cdesc = tuple(int(v) for v in args.crop.split(",")), dict(method="given")
    elif args.reuse and cj.exists():
        j = json.load(open(cj))
        crop, cdesc = tuple(j["crop"]), j["desc"]
    else:
        crop, cdesc = detect_content_window(video, info)
        json.dump(dict(crop=list(crop), desc=cdesc), open(cj, "w"))
    log(f"content window x,y,w,h = {crop}  ({cdesc})")
    W, H = analysis_size(crop[2], crop[3], args.short)

    # 2. every frame: features, flow, camera model
    A = analyse_video(video, info, crop, W, H, work, args.nproc, args.reuse, keep_frames=True)
    n = int(A["n"])
    dur = n / fps
    A = {k: A[k] for k in A}
    if abs(n - n_exp) > 2:
        log(f"WARNING: decoded {n} frames, container says {n_exp}")

    # 3. audio: onset envelope + beat grid
    grid, env_frames = BeatGrid([], [], None, "none"), None
    if info["has_audio"]:
        y, sr = extract_audio(video, work / "audio.wav")
        full, low, fe = onset_envelopes(y, sr)
        a_off = info["a_start"] - info["v_start"]
        if args.beats:
            bts, dbs, bpm = load_beats(args.beats, dur)
            if not dbs:
                dbs, dmeta = strongest_phase_downbeats(bts, full, low, fe)
            else:
                dmeta = {}
            grid = BeatGrid(bts, dbs, bpm, "given", dict(source=f"--beats {args.beats}", **dmeta))
        else:
            grid = estimate_beats(full, low, fe, len(y) / sr)
            if abs(a_off) > 0.001:
                grid = BeatGrid(grid.beats + a_off, grid.downbeats + a_off, grid.bpm, grid.mode,
                                dict(grid.meta, audio_offset_s=a_off))
        env_frames = _frame_env(np.maximum(full + low, 0.0), fe, n, fps)
        log(f"beats: {grid.bpm:.2f} BPM mode={grid.mode} {len(grid.beats)} beats {len(grid.downbeats)} downbeats")
    else:
        log("no audio stream: beat sync skipped")

    # 4. shots
    S = derive_signals(A)
    cuts, flashes, thr = detect_cuts_flashes(A, S, fps)
    softs = detect_soft_transitions(A, S, fps, cuts, flashes)
    shots = build_shots(n, fps, cuts, softs, flashes, S)
    for s in shots:                                    # cut flavour: tone-cut = same structure, colours jump
        if s["entry"]["kind"] == "cut" and S["se"][s["start"]] < 0.3 and S["dh"][s["start"]] >= 0.5:
            s["entry"]["kind"] = "tone-cut"
    n_burst = mark_bursts(shots)
    log(f"{len(shots)} shots: {len(cuts)} cuts, {len(softs)} soft transitions, {len(flashes)} flashes, {n_burst} bursts")
    C = camera_series(A, cuts, flashes, softs)
    start_frames = np.array([s["start"] for s in shots])

    def shot_of(f):
        return int(np.searchsorted(start_frames, f, side="right")) - 1

    # 5. keyframes
    target = args.kf_target or int(np.clip(round(2.0 * dur), 150, 350))
    kT, kd = select_keyframes(A, shots, flashes, softs, fps, target)
    kfs = []
    for i, f in enumerate(sorted(kd)):
        t = f / fps
        kfs.append(dict(id=i + 1, frame=int(f), t=t, shot=shots[shot_of(f)]["id"], kind=kd[f], bar_label=grid.label(t)))
    log(f"{len(kfs)} keyframes (change threshold {kT:.3f}, target {target})")
    ex_info, thumbs, geom = extract_keyframes(video, crop, info, kfs, out, work)
    for k in kfs:
        k["file"] = f"keyframes/k{k['id']:03d}.jpg"
    sheets = build_sheets(thumbs, kfs, geom, out, args.label)
    log(f"{len(sheets)} contact sheets, keyframe jpgs written")

    # 6. OCR + text timeline
    if args.no_ocr:
        ocr = [[] for _ in kfs]
    else:
        ocr = run_ocr(ex_info, args.nproc)
        log("OCR done: " + str(sum(len(o) for o in ocr)) + " text lines on " + str(sum(1 for o in ocr if o)) + " keyframes")
    cw_, ch_ = ex_info["w"], ex_info["h"]
    tracks = build_text_timeline(kfs, ocr, cw_, ch_, fps, dur)
    sm_path, sm_meta = work / "frames_small.u8", work / "frames_small.json"
    if tracks and sm_path.exists() and sm_meta.exists():
        smj = json.load(open(sm_meta))
        if smj.get("W") == W and smj.get("H") == H:
            small = np.memmap(sm_path, dtype=np.uint8, mode="r", shape=(int(smj["n"]), H, W, 3))
            refine_text_times(tracks, small, W, H, cw_, ch_, fps)
            del small
    kf_shot = {k["id"]: k["shot"] for k in kfs}
    for t in tracks:
        t["shots"] = sorted({kf_shot[i] for i in t["keyframes"]})
        t["shots_str"] = ranges_str(t["shots"]).replace("#", "")
        t["bar_beat"] = bar_beat_str(grid, t["first_seen"])
    for t in tracks:                                  # junk filter: read on >= 2 keyframes, or one confident read
        t["keep"] = bool(t["n_obs"] >= 2 or t["conf"] >= 0.8)
    kept = [t for t in tracks if t["keep"]]
    cov = text_coverage(kept, dur)

    # 7. palettes
    n_pal, pal_lab = palette_clusters(shots, A["hist"])
    shots_out = []
    for s, plab in zip(shots, pal_lab):
        cs, ce = s["clean"]
        pal = shot_palette(A["samp"], cs, ce)
        mo = shot_motion(A, C, s["start"], s["end"])
        ids = [k["id"] for k in kfs if k["shot"] == s["id"]]
        txt = []
        for t in kept:
            if s["id"] in t["shots"] and t["text"] not in txt:
                txt.append(t["text"])
        t0 = s["start"] / fps
        shots_out.append(dict(
            id=s["id"], start_frame=s["start"], end_frame=s["end"], start_s=t0, end_s=(s["end"] + 1) / fps,
            duration_s=(s["end"] - s["start"] + 1) / fps, frames=s["end"] - s["start"] + 1,
            bar_beat=bar_beat_str(grid, t0), beat=grid.locate(t0) if len(grid.beats) else None,
            entry=s["entry"], entry_label=entry_label(s["entry"], grid, fps), burst=s.get("burst"),
            camera=mo, motion=dict(me_mean=rnd(mo["me_mean"], 3), me_p90=rnd(mo["me_p90"], 3), me_max=rnd(mo["me_max"], 3),
                                   act_mean=rnd(mo["act_mean"], 3)),
            palette=[dict(hex=h, share=rnd(sh, 3)) for h, sh in pal], palette_group=plab,
            mean_luma=rnd(float(np.mean(A["luma"][cs:ce + 1])), 1), mean_colourfulness=rnd(float(np.mean(A["colf"][cs:ce + 1])), 1),
            text=txt, text_str=" | ".join(txt)[:140], keyframes=ids, keyframes_str=ranges_str(ids),
            clean_span=[int(cs), int(ce)]))
    # camera objects: keep numbers JSON-clean
    for so in shots_out:
        so["camera"] = {k: (rnd(v, 3) if isinstance(v, float) else v) for k, v in so["camera"].items()}

    # 8. events + sync
    events = []

    def add_ev(typ, frame, t, **kw):
        L = grid.locate(t) if len(grid.beats) else {}
        events.append(dict(type=typ, frame=int(frame), t=float(t), shot=shots[shot_of(frame)]["id"],
                           bar=L.get("bar"), beat=L.get("beat"), beat_pos=L.get("beat_pos"), beat_off_ms=L.get("off_ms"),
                           down_off_ms=L.get("down_off_ms"), **kw))
    cut_kind = {s["start"]: s["entry"]["kind"] for s in shots if s["entry"]["kind"] in ("cut", "tone-cut")}
    for c in cuts:
        add_ev(cut_kind.get(c, "cut"), c, c / fps, strength=float(S["score"][c]), dh=float(S["dh"][c]), se=float(S["se"][c]))
    flash_out = []
    for f in flashes:
        t = f["frame"] / fps
        add_ev("flash", f["frame"], t, strength=f["strength"], length=f["length"], flash_kind=f["kind"], delta_luma=f["delta_luma"])
        L = grid.locate(t) if len(grid.beats) else {}
        flash_out.append(dict(f, t=t, bar_beat=bar_beat_str(grid, t), beat_off_ms=L.get("off_ms")))
    soft_out = []
    for q in softs:
        t = q["mid"] / fps
        add_ev(q["kind"], q["mid"], t, strength=q["tv"], length=q["length"], start_frame=q["frame"], end_frame=q["end"])
        L = grid.locate(t) if len(grid.beats) else {}
        soft_out.append(dict(q, t0=q["frame"] / fps, t1=(q["end"] + 1) / fps, bar_beat=bar_beat_str(grid, t), beat_off_ms=L.get("off_ms")))
    punches = detect_punches(A, C, fps)
    punch_out = []
    for p in punches:
        t = p["frame"] / fps
        add_ev(p["kind"].replace(" ", "_"), p["frame"], t, strength=p["z"], value=p["value"], unit=p["unit"])
        L = grid.locate(t) if len(grid.beats) else {}
        punch_out.append(dict(p, t=t, bar_beat=bar_beat_str(grid, t), beat_off_ms=L.get("off_ms")))
    events.sort(key=lambda e: (e["frame"], e["type"]))
    sync_by_type = {}
    hard = [c / fps for c in cuts]
    sync_by_type["hard cuts"] = sync_stats(hard, grid)
    if softs:
        sync_by_type["soft transitions (mid)"] = sync_stats([q["mid"] / fps for q in softs], grid)
    if flashes:
        sync_by_type["flashes"] = sync_stats([f["frame"] / fps for f in flashes], grid)
    for kind in ("zoom-in punch", "zoom-out punch", "motion punch", "pan punch"):
        ts = [p["frame"] / fps for p in punches if p["kind"] == kind]
        if ts:
            sync_by_type[kind + "es"] = sync_stats(ts, grid)
    allb = [s["start"] / fps for s in shots[1:]]
    sync_by_type["all shot boundaries"] = sync_stats(allb, grid)
    av = audio_visual_sync(A, C, env_frames, grid, fps) if (env_frames is not None and len(grid.beats) > 8) else {}

    # 9. global stats
    lens = np.array([s["frames"] for s in shots_out]) / fps
    valid = C["valid"] & (C["label"] != "n/a")
    mix = Counter(C["label"][valid])
    tot = max(sum(mix.values()), 1)
    mix_pct = {k: 100.0 * mix.get(k, 0) / tot for k in ("static", "zoom-in", "zoom-out", "pan", "rotate")}
    me = A["me"][C["valid"]]
    me_cls = {nm: float(np.mean((me >= lo) & (me < hi))) for lo, hi, nm in ME_BINS}
    cs_ = sync_by_type["hard cuts"]
    n_bound = len(shots) - 1
    stats = dict(
        shots=len(shots), hard_cuts=len(cuts), soft_transitions=len(softs), flashes=len(flashes), bursts=n_burst,
        boundaries_per_min=n_bound / dur * 60.0, hard_cuts_per_min=len(cuts) / dur * 60.0,
        median_shot_s=float(np.median(lens)), mean_shot_s=float(lens.mean()), min_shot_s=float(lens.min()), max_shot_s=float(lens.max()),
        p10_shot_s=float(np.percentile(lens, 10)), p90_shot_s=float(np.percentile(lens, 90)),
        keyframes=len(kfs), keyframe_kinds=dict(Counter(k["kind"] for k in kfs)), keyframe_change_threshold=kT,
        pct_cuts_on_beat=(100.0 * cs_["beat"]) if "beat" in cs_ else None,
        pct_cuts_on_beat_chance=(100.0 * cs_["beat_chance"]) if "beat" in cs_ else None,
        pct_cuts_on_downbeat=(100.0 * cs_["downbeat"]) if "beat" in cs_ else None,
        pct_cuts_on_downbeat_chance=(100.0 * cs_["downbeat_chance"]) if "beat" in cs_ else None,
        pct_cuts_on_eighth=(100.0 * cs_["eighth"]) if "beat" in cs_ else None,
        bpm=grid.bpm if len(grid.beats) else None,
        camera_mix_pct=mix_pct, camera_analysable_pct=100.0 * float(valid.mean()),
        motion_energy_percentiles={f"p{q}": float(np.percentile(me, q)) for q in (10, 50, 75, 90, 99)}, motion_energy_mean=float(me.mean()),
        motion_energy_classes=me_cls, text_coverage_pct=100.0 * cov, distinct_texts=len({norm_text(t["text"]) for t in kept}),
        text_tracks=len(kept), text_tracks_all=len(tracks), keyframes_with_text_pct=100.0 * sum(1 for o in ocr if o) / max(len(kfs), 1),
        distinct_palettes=n_pal, mean_luma=float(A["luma"].mean()), dark_frames_pct=100.0 * float(np.mean(A["luma"] < 25)),
        bright_frames_pct=100.0 * float(np.mean(A["luma"] > 180)))
    tbl = [
        ("shots", f"{stats['shots']}  ({stats['hard_cuts']} hard cuts, {stats['soft_transitions']} soft transitions)"),
        ("shot boundaries per minute", f"{stats['boundaries_per_min']:.1f}  (hard cuts {stats['hard_cuts_per_min']:.1f}/min)"),
        ("shot length median / mean / p10-p90 / min-max", f"{stats['median_shot_s']:.2f} / {stats['mean_shot_s']:.2f} / {stats['p10_shot_s']:.2f}-{stats['p90_shot_s']:.2f} / {stats['min_shot_s']:.2f}-{stats['max_shot_s']:.2f} s"),
        ("rapid-cut bursts (>=3 shots of <=12 frames)", str(stats["bursts"])),
        ("flashes (1-3 frame excursions)", str(stats["flashes"])),
        ("keyframes", f"{stats['keyframes']}  ({', '.join(f'{k} {v}' for k, v in sorted(stats['keyframe_kinds'].items()))}; change threshold {kT:.2f})"),
    ]
    if "beat" in cs_:
        tbl += [("cuts within 50 ms of a beat", f"{pct(cs_['beat'])} of {cs_['n']}  (chance {pct(cs_['beat_chance'])})"),
                ("cuts on a downbeat (50 ms)", f"{pct(cs_['downbeat'])}  (chance {pct(cs_['downbeat_chance'])})"),
                ("cuts on an 8th-note position (50 ms)", f"{pct(cs_['eighth'])}  (chance {pct(cs_['eighth_chance'])})"),
                ("cut offset to beat (median abs / circular mean)", f"{cs_['median_abs_offset_ms']:.0f} ms / {cs_['mean_offset_ms']:+.0f} ms"),
                ("tempo", f"{grid.bpm:.2f} BPM ({grid.mode})")]
    tbl += [
        ("camera-move mix (share of frames)", " | ".join(f"{k} {v:.0f}%" for k, v in mix_pct.items()) + f"   [{stats['camera_analysable_pct']:.0f}% of frames analysable]"),
        ("object-motion energy p10 / p50 / p90 / p99 (px/frame @160)", " / ".join(f"{stats['motion_energy_percentiles'][f'p{q}']:.2f}" for q in (10, 50, 90, 99)) + f"   mean {stats['motion_energy_mean']:.2f}"),
        ("motion-energy classes", " | ".join(f"{k} {100 * v:.0f}%" for k, v in me_cls.items())),
        ("text on screen", f"{stats['text_coverage_pct']:.0f}% of the time; {stats['distinct_texts']} distinct texts ({stats['text_tracks']} appearances after junk filter, {stats['text_tracks_all']} raw); OCR found text on {stats['keyframes_with_text_pct']:.0f}% of keyframes"),
        ("distinct palettes", f"{stats['distinct_palettes']}  (colour-histogram clusters of {len(shots)} shots)"),
        ("brightness", f"mean luma {stats['mean_luma']:.0f}/255; {stats['dark_frames_pct']:.0f}% of frames dark (<25), {stats['bright_frames_pct']:.0f}% bright (>180)"),
    ]
    if av:
        o = av["object_motion"]
        fz = o.get("fold", {})
        tbl += [("motion energy vs audio onsets", f"r = {o.get('r_lag0', float('nan')):+.2f} at lag 0, best {o.get('best_r', float('nan')):+.2f} at {o.get('best_lag_ms', 0):+.0f} ms (object motion); "
                                                   f"frame diff r = {av['frame_diff'].get('r_lag0', float('nan')):+.2f}"),
                ("periodic motion at the beat rate", f"object motion beat-fold z = {fz.get('beat', {}).get('z', float('nan')):+.1f} (depth {fz.get('beat', {}).get('depth', float('nan')):.2f}), "
                                                     f"half-beat z = {fz.get('half_beat', {}).get('z', float('nan')):+.1f}, bar z = {fz.get('bar', {}).get('z', float('nan')):+.1f}")]
    stats["table"] = tbl

    caveats = [
        "Cut detection uses a composite of colour-histogram distance, fraction of changed pixels and edge-structure change, with an adaptive threshold; "
        "hard cuts between two similarly coloured / similarly dark pictures can be missed, and in strobing or glitch passages every abrupt state change "
        "counts as a cut (see bursts). Frame-to-frame changes cannot tell a shot change from an effect that swaps the whole picture.",
        "Soft transitions are conservative heuristics (steady, structure-replacing change of 5-30 frames not explained by camera motion); fast "
        "animations that replace the picture gradually can be classed as dissolves, and slow ones can be missed.",
        "Camera model = similarity transform fitted to Farneback flow at the analysis scale; zoom / pan / rotation of < ~1 px over a shot are below the noise. "
        "Flat or very dark frames have no texture -> not analysable. Motion energy ignores anything without edges.",
        "Beat grid = constant-tempo grid fitted to the audio onset envelope (librosa STFT; plain librosa beat_track only as the fallback when the tempo "
        "drifts: on a song with a known 128 BPM grid the fit was exact to <1 ms where beat_track alone was 2% off in tempo). Downbeat = strongest-onset "
        "phase of 4, which can be 2 beats off (check `downbeat_confidence`). Offsets are limited by the 33 ms frame period and by any audio/video "
        "latency of the source (a phone recording can be tens of ms off).",
        "OCR runs on keyframes only: texts shorter than the keyframe spacing can be missed, stylised / tiny / moving text may be misread; "
        "first/last seen times are keyframe times (see the appear / gone windows).",
    ]

    # 10. outputs
    R = dict(label=args.label, video=str(video.relative_to(ROOT)) if str(video).startswith(str(ROOT)) else str(video), info=info, crop=crop,
             W=W, H=H, runtime_s=time.time() - T_START, stats=stats, grid=grid, sync=sync_by_type,
             sync_md=sync_table_md(sync_by_type, av, grid), shots_out=shots_out, flashes=flash_out, soft=soft_out,
             punches=punch_out, punch_top=top_punches(punch_out), text=kept, caveats=caveats)
    (out / "report.md").write_text(build_report(R))
    dump_json(out / "video_beats.json", grid.to_json())
    write_frames_csv(out / "frames.csv", A, S, C, shots, fps)
    write_events_csv(out / "events.csv", events)
    dump_json(out / "ocr.json", [dict(id=k["id"], frame=k["frame"], t=k["t"], items=o) for k, o in zip(kfs, ocr)])
    dump_json(out / "shots.json", dict(
        video=dict(path=R["video"], label=args.label, width=info["width"], height=info["height"], fps=fps, duration_s=info["duration"],
                   frames=n, content_window=dict(x=crop[0], y=crop[1], w=crop[2], h=crop[3], detection=cdesc),
                   analysis_size=[W, H], runtime_s=R["runtime_s"], conventions="t = frame/fps; cut frame = first frame of the new shot"),
        stats={k: v for k, v in stats.items() if k != "table"}, beats=dict(grid.to_json(), beats=None, downbeats=None),
        sync=sync_by_type, audio_visual=av, shots=shots_out,
        cuts=[e for e in events if e["type"] in ("cut", "tone-cut")], flashes=flash_out, soft_transitions=soft_out,
        punches=punch_out, keyframes=[dict(k, ocr=[dict(text=o["text"], conf=round(o["conf"], 3)) for o in oc if o["conf"] >= 0.5])
                                      for k, oc in zip(kfs, ocr)],
        text_timeline=tracks, sheets=sheets, palette_clusters=n_pal), indent=1)
    if not args.keep_work:
        shutil.rmtree(work, ignore_errors=True)
    log(f"done -> {out}  ({time.time() - T_START:.0f}s)")


def write_frames_csv(path, A, S, C, shots, fps):
    n = int(A["n"])
    sid = np.zeros(n, int)
    for s in shots:
        sid[s["start"]:s["end"] + 1] = s["id"]
    cols = ["frame", "t", "shot", "luma", "luma_std", "colourfulness", "abs_diff", "gray_diff", "changed_px", "hist_dist", "grid_diff",
            "struct_change", "cut_score", "motion_comp_resid", "zoom_pct_s", "rot_deg_s", "pan_x_pct_s", "pan_y_pct_s",
            "object_motion", "moving_area", "flow_mag", "cam_inliers", "cam_label"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for i in range(n):
            w.writerow([i, f"{i / fps:.3f}", sid[i], f"{A['luma'][i]:.2f}", f"{A['lstd'][i]:.2f}", f"{A['colf'][i]:.2f}",
                        f"{np.nan_to_num(A['dpix'][i]):.3f}", f"{np.nan_to_num(A['dgray'][i]):.3f}", f"{np.nan_to_num(A['dsat'][i]):.3f}",
                        f"{S['dh'][i]:.4f}", f"{S['dg'][i]:.4f}", f"{S['se'][i]:.3f}", f"{S['score'][i]:.3f}",
                        f"{np.nan_to_num(A['dmc'][i]):.3f}", f"{C['zoom_ps'][i]:.3f}", f"{C['rot_ps'][i]:.3f}", f"{C['pan_x'][i]:.3f}",
                        f"{C['pan_y'][i]:.3f}", f"{np.nan_to_num(A['me'][i]):.3f}", f"{np.nan_to_num(A['act'][i]):.3f}",
                        f"{np.nan_to_num(A['fmag'][i]):.3f}", f"{np.nan_to_num(A['inl'][i]):.3f}", C["label"][i]])


def write_events_csv(path, events):
    cols = ["type", "frame", "t", "shot", "bar", "beat", "beat_pos", "beat_off_ms", "down_off_ms", "strength", "detail"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for e in events:
            detail = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in e.items() if k not in cols}
            w.writerow([e["type"], e["frame"], f"{e['t']:.3f}", e["shot"], e["bar"], e["beat"],
                        "" if e["beat_pos"] is None else f"{e['beat_pos']:.2f}",
                        "" if e["beat_off_ms"] is None else f"{e['beat_off_ms']:.1f}",
                        "" if e["down_off_ms"] is None else f"{e['down_off_ms']:.1f}",
                        "" if e.get("strength") is None else f"{e['strength']:.3f}", json.dumps(detail, default=jdefault)])


if __name__ == "__main__":
    main()
