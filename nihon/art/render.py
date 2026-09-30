#!/usr/bin/env python3
"""Render the prints.

    python3 nihon/art/render.py hero --width 1280 --out /tmp/prev
    python3 nihon/art/render.py all --width 3840 --out nihon/.cache/art

Each scene is printed twice, by day and by night. Output per scene and theme:
  <scene>-<theme>.png          the print on flat paper (the site overlays paper grain)
  <scene>-<theme>-L<n>.png     RGBA depth layers, for scenes marked layered
"""
import argparse
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hanga import Print  # noqa: E402
from palette import PALETTE  # noqa: E402
import scenes  # noqa: E402


def render_scene(name, width, out, themes=("day", "night")):
    spec = scenes.SCENES[name]
    os.makedirs(out, exist_ok=True)
    for theme in themes:
        t0 = time.time()
        P = Print(width, theme, PALETTE, seed=spec["seed"])
        P.keep_layers = bool(spec.get("layered"))
        spec["fn"](P)
        P.image().save(os.path.join(out, f"{name}-{theme}.png"), compress_level=1)
        if P.keep_layers:
            from PIL import Image
            groups = {}
            for lname, rgba in P.layers:
                key = lname if lname.startswith("L") else "L2"
                groups.setdefault(key, []).append(rgba)
            for key, lst in sorted(groups.items()):
                acc = np.zeros_like(lst[0])
                for rgba in lst:
                    a = rgba[..., 3:4]
                    acc[..., :3] = acc[..., :3] * (1 - a) + rgba[..., :3] * a
                    acc[..., 3:4] = acc[..., 3:4] * (1 - a) + a
                if key == "L0":
                    acc[..., 3] = 1.0
                rgb = np.where(acc[..., 3:4] > 1e-4, acc[..., :3] / np.maximum(acc[..., 3:4], 1e-4), 0)
                arr = np.dstack([rgb, acc[..., 3:4]])
                Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
                    os.path.join(out, f"{name}-{theme}-{key}.png"), compress_level=1)
        print(f"  {name} {theme} {time.time() - t0:.1f}s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--out", default="/tmp/prints")
    ap.add_argument("--themes", default="day,night")
    a = ap.parse_args()
    names = list(scenes.SCENES) if a.scene == "all" else a.scene.split(",")
    for n in names:
        render_scene(n, a.width, a.out, tuple(a.themes.split(",")))


if __name__ == "__main__":
    main()
