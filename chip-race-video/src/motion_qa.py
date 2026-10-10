"""Motion QA: flag unintended static stretches and report the energy per scene window.

usage: python3 -I src/motion_qa.py <video.mp4> [--from S --to E] [--holds 25.8-26.2,105-108.7]
Prints per-second energy, a list of static stretches longer than 1.2 s (p95 flow < 0.3 px at half-res)
that are not inside a declared hold, and a summary.
"""
import sys, subprocess, json
import numpy as np
import cv2

args = sys.argv[1:]
vid = args[0]
opt = {args[i][2:]: args[i + 1] for i in range(1, len(args) - 1, 2) if args[i].startswith("--")}
t0, t1 = float(opt.get("from", 0)), float(opt.get("to", 1e9))
holds = [tuple(map(float, h.split("-"))) for h in opt.get("holds", "").split(",") if h]
W, H, FPS = 480, 270, 30
cmd = ["ffmpeg", "-v", "error", "-ss", str(t0), "-i", vid] + (["-t", str(t1 - t0)] if t1 < 1e8 else []) + \
      ["-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"]
raw = subprocess.run(cmd, capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W)
p95 = np.zeros(len(fr))
for i in range(1, len(fr)):
    f = cv2.calcOpticalFlowFarneback(fr[i - 1], fr[i], None, 0.5, 3, 15, 3, 5, 1.2, 0)
    p95[i] = np.percentile(np.hypot(f[..., 0], f[..., 1]), 95)
t = t0 + np.arange(len(fr)) / FPS
still = p95 < 0.3
stretches, s = [], None
for i, v in enumerate(still):
    if v and s is None: s = i
    if (not v or i == len(still) - 1) and s is not None:
        a, b = t[s], t[i]
        if b - a > 1.2 and not any(h0 <= a and b <= h1 for h0, h1 in holds):
            stretches.append((round(a, 2), round(b, 2)))
        s = None
sec = {int(x): [] for x in t}
for x, v in zip(t, p95): sec[int(x)].append(v)
print("per-second motion (p95 px/frame @480p):", " ".join(f"{k}:{np.mean(v):.1f}" for k, v in sec.items()))
print("STATIC STRETCHES (fix or declare as holds):", stretches if stretches else "none")
print(f"summary: still {np.mean(still)*100:.0f}%  fast(>4px) {np.mean(p95 > 4)*100:.0f}%  mean {p95.mean():.2f}")
