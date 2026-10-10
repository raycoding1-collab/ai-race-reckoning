#!/usr/bin/env python3
"""video_perceive.py - a "perception kit" for a video.

Lets an AI that can only look at a few still images understand a music video's exact animation:
every cut, every distinct visual state, how things move, and how it all syncs to the music.

    python3 tools/perceive/video_perceive.py VIDEO --label L [--beats beats.json] [options]

Output (default build/perceive/L/):
    report.md       global stats + one table row per shot (camera move, motion, palette, OCR text, keyframes)
    shots.json      everything machine-readable (global stats, shots, cuts, flashes, transitions, punches,
                    beat sync, keyframes, text timeline)
    frames.csv      per-frame signals (luma, colourfulness, diffs, histogram distance, camera zoom/rot/pan,
                    object-motion energy, ...)
    index.md        which keyframes / time span each contact sheet covers
    sheets/         sheet_NN.jpg  contact sheets (<=1600 px wide, 2 rows) with burned-in labels
    keyframes/      kNNN.jpg      change-driven keyframes (higher resolution, label burned in)
    ocr.json        raw OCR (text, confidence, box) of every keyframe at full resolution
    beats.json      the beat grid used (estimated from the video's audio, or loaded from --beats)
    events.csv      every cut / flash / transition / motion punch with offset to nearest beat

Pipeline: ffmpeg rawvideo pipe at small size -> per-frame features + Farneback flow + robust similarity
camera fit (RANSAC) -> shots (cuts, flashes, dissolves/wipes/fades) -> change-driven keyframes ->
sheets -> OCR (rapidocr) -> beats/sync (librosa) -> palettes (k-means) -> report.

--beats accepts: {"beats":[s...], "downbeats":[s...], "bpm":..} (also keys beat_times / downbeat_times),
a bare list of beat times, or a list of {"t"|"time":s, "beat":1..4, "bar":n} dicts.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
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
DSAT_TAU = 16.0          # per-pixel change saturates at this many levels (change-driven keyframes)
VQ_EDGES = [6, 12, 24, 48, 96, 160]
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
    return o


def dump_json(path, obj, indent=None):
    with open(path, "w") as f:
        json.dump(clean(obj), f, default=jdefault, indent=indent, ensure_ascii=False)


# --------------------------------------------------------------------------------------
# probe + decode
# --------------------------------------------------------------------------------------
def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration",
         "-of", "json", str(path)], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    s = j["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    dur = float(s.get("duration") or j["format"]["duration"])
    nb = int(s["nb_frames"]) if s.get("nb_frames", "N/A") not in ("N/A", None) else int(round(dur * fps))
    a = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                        "stream=codec_name", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return dict(width=int(s["width"]), height=int(s["height"]), fps=fps, duration=dur, nb_frames=nb,
                has_audio=bool(a.stdout.strip()))


def analysis_size(w, h, short=160):
    """analysis frame size: `short` px on the short side, even dimensions"""
    if w >= h:
        hh = short
        ww = int(round(w * short / h / 2) * 2)
    else:
        ww = short
        hh = int(round(h * short / w / 2) * 2)
    return ww, hh


def decode_small(path, W, H, mm_path, est_frames):
    """decode every frame (passthrough, no dup/drop) to W x H rgb24 via an ffmpeg rawvideo pipe -> memmap"""
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-an", "-vf",
           f"scale={W}:{H}:flags=area", "-pix_fmt", "rgb24", "-fps_mode", "passthrough", "-f", "rawvideo", "-"]
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


def detect_content_window(mm, n, thr=8, min_frac=0.01):
    """bounding box (y0, y1, x0, x1) in analysis pixels of everything that is ever lit; letterbox bars are pure black.
    Returns the full frame when the lit area is >= 85% of it."""
    H, W = mm.shape[1:3]
    mx = np.zeros((H, W), np.uint8)
    for i in range(0, n, 3):
        np.maximum(mx, np.asarray(mm[i]).max(axis=2), out=mx)
    ever = mx > thr
    rows = np.nonzero(ever.mean(axis=1) > min_frac)[0]
    cols = np.nonzero(ever.mean(axis=0) > min_frac)[0]
    if len(rows) == 0 or len(cols) == 0:
        return (0, H, 0, W)
    y0, y1 = max(int(rows[0]) - 1, 0), min(int(rows[-1]) + 2, H)
    x0, x1 = max(int(cols[0]) - 1, 0), min(int(cols[-1]) + 2, W)
    if (y1 - y0) * (x1 - x0) >= 0.85 * H * W:
        return (0, H, 0, W)
    return (y0, y1, x0, x1)


def fit_camera(flow, gray_prev, rng):
    """Robust similarity camera model from dense flow (prev->cur), on textured pixels.

    u = tx + a*x - b*y ; v = ty + b*x + a*y  with (x, y) relative to the image centre.
    a = zoom rate (fractional scale change per frame, >0 = zoom-in), b = rotation (rad/frame, >0 = clockwise
    on screen), (tx, ty) = content translation in px/frame (+x right, +y down).
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


def _analyse_chunk(job):
    mm_path, n_total, H, W, a, b, crop = job
    cv2.setNumThreads(1)
    mm = np.memmap(mm_path, dtype=np.uint8, mode="r", shape=(n_total, H, W, 3))
    cy0, cy1, cx0, cx1 = crop
    H, W = cy1 - cy0, cx1 - cx0
    n = b - a
    f32 = lambda: np.full(n, np.nan, np.float32)
    o = {k: f32() for k in ("luma", "lstd", "colf", "dpix", "dgray", "dsat", "dmc", "zoom", "rot", "tx", "ty",
                            "inl", "expl", "fmag", "me", "act", "ntex")}
    o["hist"] = np.zeros((n, HIST_BINS), np.float32)
    o["grid"] = np.zeros((n, GRID, GRID, 3), np.uint8)
    o["samp"] = np.zeros((n, PAL_SAMPLES, 3), np.uint8)
    pos = np.random.default_rng(1234).integers(0, H * W, PAL_SAMPLES)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    prev = np.array(mm[a - 1, cy0:cy1, cx0:cx1]) if a > 0 else None
    prev_gray = cv2.cvtColor(prev, cv2.COLOR_RGB2GRAY) if prev is not None else None
    for k in range(n):
        i = a + k
        cur = np.array(mm[i, cy0:cy1, cx0:cx1])
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
        if prev is not None:
            d = cv2.absdiff(cur, prev)
            o["dpix"][k] = d.mean()
            o["dgray"][k] = cv2.absdiff(gray, prev_gray).mean()
            o["dsat"][k] = np.minimum(d.max(axis=2).astype(np.float32) / DSAT_TAU, 1.0).mean()
            flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            warped = cv2.remap(prev_gray, xx - flow[..., 0], yy - flow[..., 1], cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
            o["dmc"][k] = cv2.absdiff(warped, gray).mean()
            cam = fit_camera(flow, prev_gray, np.random.default_rng(i))
            for key, val in cam.items():
                o[key][k] = val
        prev, prev_gray = cur, gray
    return a, o


def analyse_video(path, info, W, H, work, nproc, reuse, keep_frames=False):
    cache = work / "analysis.npz"
    if reuse and cache.exists():
        z = np.load(cache, allow_pickle=False)
        if int(z["W"]) == W and int(z["H"]) == H and abs(float(z["fps"]) - info["fps"]) < 1e-6 and "crop" in z.files:
            log("analysis cache hit", cache)
            return {k: z[k] for k in z.files}
    mm_path = work / "frames_small.u8"
    meta_path = work / "frames_small.json"
    t0 = time.time()
    n = None
    if keep_frames and mm_path.exists() and meta_path.exists():
        m = json.load(open(meta_path))
        if m.get("W") == W and m.get("H") == H:
            n = int(m["n"])
            log(f"reusing decoded frames ({n})")
    if n is None:
        n = decode_small(path, W, H, mm_path, info["nb_frames"])
        json.dump(dict(W=W, H=H, n=n), open(meta_path, "w"))
        log(f"decoded {n} frames at {W}x{H} in {time.time() - t0:.1f}s")
    mmr = np.memmap(mm_path, dtype=np.uint8, mode="r", shape=(n, H, W, 3))
    crop = detect_content_window(mmr, n)
    del mmr
    log(f"content window (analysis px y0,y1,x0,x1): {crop}  of {H}x{W}")
    # ~4 jobs per worker, contiguous chunks (each reads the previous frame for flow)
    nj = max(nproc * 4, 1)
    edges = np.linspace(0, n, nj + 1).astype(int)
    jobs = [(str(mm_path), n, H, W, int(edges[j]), int(edges[j + 1]), crop) for j in range(nj) if edges[j + 1] > edges[j]]
    parts = []
    with ProcessPoolExecutor(max_workers=nproc) as ex:
        for res in ex.map(_analyse_chunk, jobs):
            parts.append(res)
    parts.sort(key=lambda r: r[0])
    A = {k: np.concatenate([p[1][k] for p in parts], axis=0) for k in parts[0][1]}
    A.update(W=W, H=H, fps=info["fps"], n=n, crop=np.array(crop))
    log(f"analysed {n} frames in {time.time() - t0:.1f}s")
    np.savez_compressed(cache, **A)
    if not keep_frames:
        for q in (mm_path, meta_path):
            try:
                os.remove(q)
            except OSError:
                pass
    return A
