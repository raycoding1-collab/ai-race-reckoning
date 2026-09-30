#!/usr/bin/env python3
"""Turn the rendered prints (nihon/.cache/art/*.png) into the site's images.

    python3 nihon/art/export.py            # writes japan/img/ and japan/wallpapers/

For every scene and theme:
  img/<scene>-<theme>-<w>.avif   w = 3840, 2560, 1600 (landscape)
  img/<scene>-<theme>-p.avif     1216 x 2160 portrait crop around the scene's focus
  img/<scene>-<theme>-2560.webp, img/<scene>-<theme>-p.webp   fallbacks
Layered scenes also get img/<scene>-<theme>-L<n>-<w>.avif (w = 3840, 2560)
and a WebP fallback at 2560. The hero wallpapers get the washi grain baked in.
Outputs newer than their source are skipped.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scenes  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "nihon", ".cache", "art")
OUT = os.path.join(ROOT, "japan", "img")
WALL = os.path.join(ROOT, "japan", "wallpapers")

WIDTHS = (3840, 2560, 1600)
PORTRAIT = (1216, 2160)


def washi_tile(size, seed=3):
    """Seamless washi grain (1 = paper, darker = fibre and tooth) for multiply.

    Kōzo paper shows long, loose bast fibres rather than the short strands of
    rice paper, so the strands here are longer and gently curved."""
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
    g = 1.0 - 0.014 * cloud - 0.016 * tooth
    acc = np.zeros(n * n)
    for _ in range(int(n * n / 1100)):
        x, y = rng.random() * n, rng.random() * n
        a = rng.uniform(0, np.pi)
        L = rng.uniform(30, 180)
        k = int(L * 2)
        t = np.linspace(0, 1, k)
        bend = rng.normal(0, 0.9)
        ang = a + bend * (t - 0.5) + 0.3 * np.sin(t * rng.uniform(2, 6))
        px = (x + np.cumsum(np.cos(ang)) * L / k) % n
        py = (y + np.cumsum(np.sin(ang)) * L / k) % n
        w = rng.uniform(0.3, 1.0) * (1 if rng.random() < 0.55 else -0.8)
        idx = (py.astype(int) % n) * n + (px.astype(int) % n)
        acc += np.bincount(idx, weights=np.full(k, w), minlength=n * n)
    fib = acc.reshape(n, n)
    fib = ndi.gaussian_filter(fib, 0.7, mode="wrap")
    g = g - 0.05 * fib / (np.abs(fib).max() + 1e-9)
    return np.clip(g, 0.8, 1.02).astype(np.float32)


def fresh(out, src):
    return os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src)


def save(img, path, fmt, **kw):
    img.save(path, fmt, **kw)
    return os.path.getsize(path)


def export_scene(name, spec, stats):
    for theme in ("day", "night"):
        src = os.path.join(SRC, f"{name}-{theme}.png")
        if not os.path.exists(src):
            print("  missing", src)
            continue
        im = None
        for w in WIDTHS:
            out = os.path.join(OUT, f"{name}-{theme}-{w}.avif")
            if fresh(out, src):
                continue
            im = im or Image.open(src).convert("RGB")
            r = im if w == im.width else im.resize((w, round(w * 9 / 16)), Image.LANCZOS)
            stats.append((out, save(r, out, "AVIF", quality=72 if w == 3840 else 70, speed=5)))
            if w == 2560:
                o2 = out.replace(".avif", ".webp")
                stats.append((o2, save(r, o2, "WEBP", quality=82, method=5)))
        out = os.path.join(OUT, f"{name}-{theme}-p.avif")
        if not fresh(out, src):
            im = im or Image.open(src).convert("RGB")
            scale = im.height / PORTRAIT[1]
            cw = round(PORTRAIT[0] * scale)
            cx = spec.get("focus", 0.5) * im.width
            x0 = int(min(max(cx - cw / 2, 0), im.width - cw))
            crop = im.crop((x0, 0, x0 + cw, im.height))
            if crop.size != PORTRAIT:
                crop = crop.resize(PORTRAIT, Image.LANCZOS)
            stats.append((out, save(crop, out, "AVIF", quality=70, speed=5)))
            o2 = out.replace(".avif", ".webp")
            stats.append((o2, save(crop, o2, "WEBP", quality=82, method=5)))
        if spec.get("layered"):
            i = 0
            while True:
                lsrc = os.path.join(SRC, f"{name}-{theme}-L{i}.png")
                if not os.path.exists(lsrc):
                    break
                lim = None
                for w in (3840, 2560):
                    out = os.path.join(OUT, f"{name}-{theme}-L{i}-{w}.avif")
                    if fresh(out, lsrc):
                        continue
                    lim = lim or Image.open(lsrc).convert("RGBA" if i else "RGB")
                    r = lim if w == lim.width else lim.resize((w, round(w * 9 / 16)), Image.LANCZOS)
                    stats.append((out, save(r, out, "AVIF", quality=72 if w == 3840 else 70, speed=5)))
                    if w == 2560:
                        o2 = out.replace(".avif", ".webp")
                        stats.append((o2, save(r, o2, "WEBP", quality=82, method=5)))
                i += 1
        if name == "hero":
            out = os.path.join(WALL, f"where-the-sun-rises-{theme}-3840x2160.jpg")
            if not fresh(out, src):
                im = im or Image.open(src).convert("RGB")
                a = np.asarray(im).astype(np.float32) / 255.0
                g = washi_tile(1024)
                t = np.tile(g, (a.shape[0] // 1024 + 1, a.shape[1] // 1024 + 1))[: a.shape[0], : a.shape[1]]
                if theme == "day":
                    w_ = a * t[..., None]
                else:
                    w_ = a + (1.0 - t[..., None]) * 0.45 * (1.0 - a)
                img = Image.fromarray((np.clip(w_, 0, 1) * 255 + 0.5).astype(np.uint8))
                stats.append((out, save(img, out, "JPEG", quality=92, optimize=True, progressive=True)))


def textures(stats):
    """The washi grain the page lays over every print (multiply)."""
    out = os.path.join(OUT, "grain.webp")
    if not os.path.exists(out):
        g = washi_tile(768, seed=5)
        # laid over the page at low opacity, so its tooth is stretched here,
        # and saved losslessly so the fine fibres survive
        g = np.clip(1 - (1 - g) * 3.2, 0, 1)
        img = Image.fromarray((g * 255).astype(np.uint8), "L")
        stats.append((out, save(img, out, "WEBP", lossless=True, method=6)))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(WALL, exist_ok=True)
    stats = []
    textures(stats)
    names = sys.argv[1:] or list(scenes.SCENES)
    for name in names:
        export_scene(name, scenes.SCENES[name], stats)
    total = sum(s for _, s in stats)
    for p, s in stats:
        print(f"  {os.path.relpath(p, ROOT)}  {s // 1024} KB")
    print(f"wrote {len(stats)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
