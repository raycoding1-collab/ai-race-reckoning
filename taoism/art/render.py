#!/usr/bin/env python3
"""Render the site's paintings.

    python3 taoism/art/render.py hero --width 1920 --out /tmp/prev
    python3 taoism/art/render.py all --width 3840 --out taoism/.cache/art

Each scene is painted once as ink density on depth planes, then coloured in
two palettes: day (ink on warm paper) and night (moonlit). Output per scene:
  <scene>-<theme>.png           flattened picture on flat paper (the site adds
                                paper grain as an overlay)
  <scene>-<theme>-L<n>.png      RGBA depth layers, for scenes marked layered
  <scene>-<theme>-wall.png      the picture with paper grain baked in, for
                                download as a wallpaper
"""
import argparse
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ink import Painter, paper_rgb, smoothstep  # noqa: E402
import scenes  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "node_modules", "@expo-google-fonts")

PALETTES = {
    "day": {
        "paper": paper_rgb("#ECE4D2"),
        "ink": paper_rgb("#17181C"),
        "sun": paper_rgb("#C2462C"),
        "seal": paper_rgb("#B8352A"),
    },
    "night": {
        "paper": paper_rgb("#1A212E"),
        "glow": paper_rgb("#46536A"),
        "ink": paper_rgb("#040509"),
        "sun": paper_rgb("#E8E2CF"),
        "seal": paper_rgb("#8E2E27"),
    },
}


# night: pale washes read darker against the moonlit sky, so boost them
TONE = {
    "day": lambda d: d,
    "night": lambda d: 1.0 - (1.0 - np.clip(d, 0, 1)) ** 2.1,
}


def paper_field(p, pal, theme, moon=None):
    """Per-pixel paper colour: flat by day, a moonlit sky gradient by night."""
    H, W = p.H, p.W
    base = np.broadcast_to(pal["paper"], (H, W, 3)).astype(np.float32).copy()
    if theme == "night":
        yy, xx = p.grid()
        v = yy / H
        # darker zenith, moonlit mist glowing low over the water
        prof = 0.78 + 0.5 * np.exp(-((v - 0.66) / 0.2) ** 2) + 0.12 * v
        base *= prof[..., None]
        if moon is not None:
            mx, my, mr = moon
            d = np.hypot(xx - mx * p.s, yy - my * p.s) / (mr * p.s)
            g = np.exp(-np.maximum(d - 1, 0) / 5.5) * 0.85 + np.exp(-np.maximum(d - 1, 0) / 1.4) * 0.35
            base = base + (pal["glow"] - pal["paper"])[None, None, :] * np.clip(g, 0, 1.2)[..., None]
    return np.clip(base, 0, 1)


def colorize(D, paper, ink):
    return paper * (1.0 - D[..., None]) + ink[None, None, :] * D[..., None]


def apply_disc(rgb, alpha, color, theme):
    if alpha is None:
        return rgb
    a = alpha[..., None]
    if theme == "night":
        # moon: bright disc with a faint cold halo baked into the paper field
        return rgb * (1 - a) + color[None, None, :] * a
    return rgb * (1 - a * 0.92) + color[None, None, :] * (a * 0.92)


def grain_tile(size, seed=3):
    """Seamless paper grain (1 = paper, darker = fibres/tooth) for multiply."""
    rng = np.random.default_rng(seed)
    n = size

    def fbm(beta, lo, hi):
        f = np.fft.fftfreq(n)
        fx, fy = np.meshgrid(f, f)
        r = np.hypot(fx, fy)
        r[0, 0] = 1
        amp = r ** (-beta)
        amp[(r < lo) | (r > hi)] = 0
        ph = np.exp(2j * np.pi * rng.random((n, n)))
        x = np.real(np.fft.ifft2(amp * ph))
        return (x - x.mean()) / (x.std() + 1e-9)

    cloud = fbm(1.6, 1.5 / n, 0.08)
    tooth = fbm(0.6, 0.05, 0.5)
    g = 1.0 - 0.012 * cloud - 0.018 * tooth
    # fibres: short curved strands, wrapped around the tile edges
    acc = np.zeros(n * n)
    for _ in range(int(n * n / 900)):
        x, y = rng.random() * n, rng.random() * n
        a = rng.uniform(0, np.pi)
        L = rng.uniform(12, 90)
        k = int(L * 2)
        t = np.linspace(0, 1, k)
        bend = rng.normal(0, 0.6)
        ang = a + bend * (t - 0.5)
        px = (x + np.cumsum(np.cos(ang)) * L / k) % n
        py = (y + np.cumsum(np.sin(ang)) * L / k) % n
        w = rng.uniform(0.3, 1.0) * (1 if rng.random() < 0.6 else -0.7)
        idx = (py.astype(int) % n) * n + (px.astype(int) % n)
        acc += np.bincount(idx, weights=np.full(k, w), minlength=n * n)
    fib = acc.reshape(n, n)
    fib = ndi.gaussian_filter(fib, 0.6, mode="wrap")
    g = g - 0.05 * fib / (np.abs(fib).max() + 1e-9)
    return np.clip(g, 0.8, 1.02).astype(np.float32)


def inscription(p, rgb, spec, color, theme):
    """Vertical calligraphic inscription in ink, columns right to left."""
    from fontTools.ttLib import TTFont
    size = int(spec["size"] * p.s)
    brush = os.path.join(FONT_DIR, "zhi-mang-xing", "400Regular", "ZhiMangXing_400Regular.ttf")
    kai = os.path.join(FONT_DIR, "lxgw-wenkai-tc", "400Regular", "LXGWWenKaiTC_400Regular.ttf")
    font_path = kai
    if os.path.exists(brush):
        cmap = TTFont(brush, lazy=True).getBestCmap()
        if all(ord(c) in cmap for col in spec["columns"] for c in col):
            font_path = brush
    font = ImageFont.truetype(font_path, size)
    img = Image.new("L", (p.W, p.H), 0)
    d = ImageDraw.Draw(img)
    x, y = spec["x"] * p.s, spec["y"] * p.s
    for col in spec["columns"]:
        cy = y
        for ch in col:
            d.text((x, cy), ch, font=font, fill=255, anchor="mt")
            cy += size * 1.12
        x -= size * 1.35
    a = np.asarray(img).astype(np.float32) / 255.0
    a = ndi.gaussian_filter(a, 0.5 * p.s + 0.2)
    a *= spec.get("ink", 0.85) * (1.0 - 0.18 * (0.5 + 0.5 * p.noise_full(40, 3)))
    ink = color
    return rgb * (1 - a[..., None]) + ink[None, None, :] * a[..., None]


def seal(p, rgb, spec, color):
    """A square vermilion seal, characters carved out in white (intaglio)."""
    font_path = os.path.join(FONT_DIR, "noto-serif-tc", "900Black", "NotoSerifTC_900Black.ttf")
    S = int(spec["size"] * p.s)
    chars = spec["text"]
    img = Image.new("L", (S, S), 255)
    d = ImageDraw.Draw(img)
    pad = S * 0.1
    cell = (S - 2 * pad) / 2
    font = ImageFont.truetype(font_path, int(cell * 0.94))
    # seal order: right column top-to-bottom, then left column
    order = [(1, 0), (1, 1), (0, 0), (0, 1)]
    for ch, (cx, cy) in zip(chars, order):
        d.text((pad + cx * cell + cell / 2, pad + cy * cell + cell / 2), ch, font=font, fill=0, anchor="mm")
    a = np.asarray(img).astype(np.float32) / 255.0
    rng = np.random.default_rng(11)
    # rough, uneven impression
    yy, xx = np.mgrid[0:S, 0:S]
    edge = np.minimum.reduce([xx, yy, S - 1 - xx, S - 1 - yy]).astype(np.float32)
    rough = ndi.gaussian_filter(rng.standard_normal((S, S)), S * 0.01 + 0.5) * S * 0.02
    a *= smoothstep(0.5, 2.0, edge + rough)
    speck = ndi.gaussian_filter(rng.random((S, S)), S * 0.004 + 0.4)
    a *= smoothstep(0.35, 0.55, speck + 0.2)
    a *= 0.88
    x0, y0 = int(spec["x"] * p.s), int(spec["y"] * p.s)
    region = rgb[y0:y0 + S, x0:x0 + S]
    region[:] = region * (1 - a[..., None]) + color[None, None, :] * a[..., None] * 0.95 + region * a[..., None] * 0.05 * 0
    return rgb


def render_scene(name, width, out, themes=("day", "night"), wall=False, keep=False):
    spec = scenes.SCENES[name]
    height = int(round(width * 9 / 16))
    t0 = time.time()
    p = Painter(width, height, seed=spec.get("seed", 1))
    planes = spec["paint"](p)
    print(f"  painted {name} at {width}x{height} in {time.time() - t0:.1f}s", flush=True)
    for pl in planes:
        p.bleed(pl)
        p.grain(pl, 0.07)
    sun = None
    for pl in planes:
        if sun is not None:
            sun = sun * (1 - pl.cover)
        if pl.sun is not None:
            sun = pl.sun if sun is None else np.maximum(sun, pl.sun)
    os.makedirs(out, exist_ok=True)
    results = {}
    for theme in themes:
        pal = PALETTES[theme]
        tone = TONE[theme]
        D = np.zeros((height, width), np.float32)
        for pl in planes:
            D = tone(pl.ink) + (1 - pl.cover) * D
        D = np.clip(D, 0, 1)
        moon = spec.get("sun") if theme == "night" else None
        paper = paper_field(p, pal, theme, moon)
        rgb = colorize(D, paper, pal["ink"])
        rgb = apply_disc(rgb, sun, pal["sun"], theme)
        if "inscription" in spec:
            ins_color = pal["ink"] if theme == "day" else paper_rgb("#9AA3B2")
            rgb = inscription(p, rgb, spec["inscription"], ins_color, theme)
        if "seal" in spec:
            rgb = seal(p, rgb, spec["seal"], pal["seal"])
        img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
        path = os.path.join(out, f"{name}-{theme}.png")
        img.save(path, optimize=False, compress_level=1)
        results[theme] = path
        if wall:
            g = grain_tile(1024)
            tiled = np.tile(g, (height // 1024 + 1, width // 1024 + 1))[:height, :width]
            if theme == "day":
                w = rgb * tiled[..., None]
            else:
                w = rgb + (1.0 - tiled[..., None]) * -0.6 * rgb + (tiled[..., None] - 1.0) * -0.02
            Image.fromarray((np.clip(w, 0, 1) * 255 + 0.5).astype(np.uint8)).save(
                os.path.join(out, f"{name}-{theme}-wall.png"), compress_level=1)
        if spec.get("layered"):
            # layer 0 is opaque (sky); upper layers carry alpha = cover
            acc_sun = None
            for i, pl in enumerate(planes):
                if i == 0:
                    col = colorize(np.clip(tone(pl.ink), 0, 1), paper, pal["ink"])
                    col = apply_disc(col, pl.sun, pal["sun"], theme)
                    if "inscription" in spec:
                        col = inscription(p, col, spec["inscription"], ins_color, theme)
                    if "seal" in spec:
                        col = seal(p, col, spec["seal"], pal["seal"])
                    a = np.ones((height, width), np.float32)
                else:
                    cov = np.clip(pl.cover, 0, 1)
                    frac = np.where(cov > 1e-4, np.clip(tone(pl.ink), 0, 1) / np.maximum(cov, 1e-4), 0)
                    col = colorize(np.clip(frac, 0, 1), paper, pal["ink"])
                    if pl.sun is not None:
                        col = apply_disc(col, pl.sun, pal["sun"], theme)
                    a = cov
                rgba = np.dstack([np.clip(col, 0, 1), a])
                Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(
                    os.path.join(out, f"{name}-{theme}-L{i}.png"), compress_level=1)
    if keep:
        np.save(os.path.join(out, f"{name}-D.npy"), D.astype(np.float16))
    print(f"  done {name} in {time.time() - t0:.1f}s", flush=True)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--out", default="/tmp/art")
    ap.add_argument("--themes", default="day,night")
    ap.add_argument("--wall", action="store_true")
    ap.add_argument("--grain", action="store_true", help="write the paper grain tiles")
    a = ap.parse_args()
    if a.grain:
        os.makedirs(a.out, exist_ok=True)
        g = grain_tile(1024)
        Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8)).save(os.path.join(a.out, "grain.png"))
    names = list(scenes.SCENES) if a.scene == "all" else a.scene.split(",")
    for n in names:
        render_scene(n, a.width, a.out, tuple(a.themes.split(",")), wall=a.wall)


if __name__ == "__main__":
    main()
