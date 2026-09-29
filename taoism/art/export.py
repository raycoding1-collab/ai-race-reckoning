#!/usr/bin/env python3
"""Turn rendered paintings (taoism/.cache/art/*.png) into the site's images.

    python3 taoism/art/export.py            # writes tao/img/ and tao/wallpapers/

For every scene and theme:
  img/<scene>-<theme>-<w>.avif   w = 3840, 2560, 1600 (landscape)
  img/<scene>-<theme>-p.avif     1216 x 2160 portrait crop around the scene's focus
  img/<scene>-<theme>-2560.webp, img/<scene>-<theme>-p.webp   fallbacks
Layered scenes also get img/<scene>-<theme>-L<n>-<w>.avif (w = 3840, 2560)
and a WebP fallback at 2560. Hero wallpapers get the paper grain baked in.
Outputs newer than their source are skipped.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scenes  # noqa: E402
from render import grain_tile  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "taoism", ".cache", "art")
OUT = os.path.join(ROOT, "tao", "img")
WALL = os.path.join(ROOT, "tao", "wallpapers")

WIDTHS = (3840, 2560, 1600)
PORTRAIT = (1216, 2160)


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
            out = os.path.join(WALL, f"the-way-{theme}-3840x2160.jpg")
            if not fresh(out, src):
                im = im or Image.open(src).convert("RGB")
                a = np.asarray(im).astype(np.float32) / 255.0
                g = grain_tile(1024)
                t = np.tile(g, (a.shape[0] // 1024 + 1, a.shape[1] // 1024 + 1))[: a.shape[0], : a.shape[1]]
                if theme == "day":
                    w_ = a * t[..., None]
                else:
                    w_ = a + (1.0 - t[..., None]) * 0.45 * (1.0 - a)
                img = Image.fromarray((np.clip(w_, 0, 1) * 255 + 0.5).astype(np.uint8))
                stats.append((out, save(img, out, "JPEG", quality=92, optimize=True, progressive=True)))


def textures(stats):
    """Paper grain (multiply) and a horizontally seamless mist mask."""
    out = os.path.join(OUT, "grain.webp")
    if not os.path.exists(out):
        g = grain_tile(768, seed=5)
        # the tile is laid over the page at low opacity, so its tooth is stretched here,
        # and saved losslessly so the fine fibres survive
        g = np.clip(1 - (1 - g) * 3.2, 0, 1)
        img = Image.fromarray((g * 255).astype(np.uint8), "L")
        stats.append((out, save(img, out, "WEBP", lossless=True, method=6)))
    out = os.path.join(OUT, "mist.webp")
    if not os.path.exists(out):
        W, H = 2048, 512
        rng = np.random.default_rng(21)
        fx = np.fft.fftfreq(W)[None, :]
        fy = np.fft.fftfreq(H)[:, None]
        r = np.hypot(fx * 1.0, fy * 2.2)
        r[0, 0] = 1
        amp = r ** -1.9
        amp[r > 0.08] = 0
        noise = np.real(np.fft.ifft2(amp * np.exp(2j * np.pi * rng.random((H, W)))))
        noise = (noise - noise.mean()) / noise.std()
        v = np.linspace(-1, 1, H)[:, None]
        env = np.exp(-(v / 0.5) ** 2)
        a = np.clip((noise * 0.55 + 0.25) * env, 0, 1)
        a = a ** 1.3
        rgba = np.dstack([np.full((H, W), 255, np.uint8)] * 3 + [(a * 255).astype(np.uint8)])
        stats.append((out, save(Image.fromarray(rgba, "RGBA"), out, "WEBP", quality=80, method=6)))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(WALL, exist_ok=True)
    stats = []
    textures(stats)
    for name, spec in scenes.SCENES.items():
        export_scene(name, spec, stats)
    total = sum(s for _, s in stats)
    for p, s in stats:
        print(f"  {os.path.relpath(p, ROOT)}  {s // 1024} KB")
    print(f"wrote {len(stats)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
