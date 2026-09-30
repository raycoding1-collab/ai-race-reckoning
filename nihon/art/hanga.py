"""Procedural woodblock-print (moku hanga) engine.

A print is built the way an ukiyo-e print is: one block per colour, printed in
turn on damp paper. Each block lays a transparent water-based pigment, so a
block multiplies the colour already on the paper. The key block, in sumi
black, draws the outlines. Printing leaves its marks: the grain of the cherry
wood shows in flat areas, the baren rubs the pigment on unevenly, pigment
pools at the edges of a carved shape, and the blocks never register exactly.
Graded colour (bokashi) is wiped onto the block by hand.

Scenes are authored in 3840 x 2160 ("4K") coordinates and rendered at any size.

Depth. A scene is painted as planes, back to front. Inside a plane, blocks
multiply; a plane hides the planes behind it where it covers them (`cov`), as
a foreground hill hides the sea behind it. Planes composite as
    canvas = canvas * (1 - cov) + paper * mult * cov
which is what CSS alpha compositing does with an RGBA layer whose colour is
paper * mult and alpha is cov, so a scene can be split into parallax layers.
"""
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REF_W, REF_H = 3840, 2160
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "node_modules", "@expo-google-fonts")


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def catmull_rom(points, ds, closed=False):
    """Smooth curve through `points`, resampled every `ds` units of arc length."""
    p = np.asarray(points, np.float64)
    if closed:
        p = np.vstack([p, p[:1]])
    if len(p) < 3:
        c = p
    else:
        if closed:
            q = np.vstack([p[-2], p, p[1]])
        else:
            q = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
        segs = []
        for i in range(1, len(q) - 2):
            p0, p1, p2, p3 = q[i - 1], q[i], q[i + 1], q[i + 2]
            n = max(4, int(np.linalg.norm(p2 - p1) / max(ds, 0.25)) + 2)
            t = np.linspace(0.0, 1.0, n, endpoint=False)[:, None]
            t2, t3 = t * t, t * t * t
            segs.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                               + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
        segs.append(q[-2][None])
        c = np.vstack(segs)
    d = np.r_[0.0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
    length = float(d[-1])
    m = max(2, int(length / ds) + 1)
    s = np.linspace(0.0, length, m)
    return np.stack([np.interp(s, d, c[:, 0]), np.interp(s, d, c[:, 1])], 1)


class Plane:
    def __init__(self, h, w, name):
        self.name = name
        self.mult = np.ones((h, w, 3), np.float32)
        self.cov = np.zeros((h, w), np.float32)


class Print:
    """One print. Colours are pigments: RGB multipliers in 0..1."""

    def __init__(self, width, theme, palette, seed=1):
        self.W = int(width)
        self.H = int(round(width * REF_H / REF_W))
        self.s = self.W / REF_W
        self.theme = theme
        self.night = theme == "night"
        self.pal = palette
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.paper = self.col("paper")
        self.canvas = np.ones((self.H, self.W, 3), np.float32) * self.paper
        self.layers = []            # (name, rgba) kept for layered export
        self.keep_layers = False
        self._grain = [self._woodgrain(i) for i in range(3)]
        self._mottle = np.clip(self.noise(self.H, self.W, 70 * self.s, 3, 0.5), -1.2, 1.2) * 0.8
        yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        self.X = xx / self.s
        self.Y = yy / self.s

    # ------------------------------------------------------------ basics
    def col(self, name):
        v = self.pal[self.theme].get(name)
        if v is None:
            v = self.pal["day"][name]
        return hexrgb(v) if isinstance(v, str) else np.asarray(v, np.float32)

    def plane(self, name="plane"):
        return Plane(self.H, self.W, name)

    def commit(self, pl):
        c = pl.cov[..., None]
        rgb = self.paper * pl.mult
        self.canvas = self.canvas * (1.0 - c) + rgb * c
        if self.keep_layers:
            self.layers.append((pl.name, np.dstack([rgb, pl.cov])))

    def noise(self, h, w, scale, octaves=4, gain=0.5, lac=2.0, aniso=1.0, rng=None):
        """fBm value noise in about [-1, 1]; `scale` is the largest feature in px.
        aniso > 1 stretches features horizontally."""
        rng = rng or self.rng
        out = np.zeros((h, w), np.float32)
        amp, tot, s = 1.0, 0.0, float(scale)
        for _ in range(octaves):
            if s < 1.5:
                break
            sx, sy = s * aniso, s
            gh, gw = int(h / sy) + 3, int(w / sx) + 3
            g = rng.standard_normal((gh, gw)).astype(np.float32)
            uw, uh = max(w + 1, int(gw * sx)), max(h + 1, int(gh * sy))
            up = np.asarray(Image.fromarray(g, "F").resize((uw, uh), Image.BICUBIC))
            oy = int(rng.integers(0, up.shape[0] - h + 1))
            ox = int(rng.integers(0, up.shape[1] - w + 1))
            out += amp * up[oy:oy + h, ox:ox + w]
            tot += amp
            amp *= gain
            s /= lac
        return out / max(tot, 1e-6) * 1.6

    def line_noise(self, n, scale, octaves=3, gain=0.5):
        out = np.zeros(n)
        amp, tot, s = 1.0, 0.0, float(scale)
        x = np.arange(n)
        for _ in range(octaves):
            if s < 1.0:
                break
            k = int(n / s) + 3
            g = self.rng.standard_normal(k)
            out += amp * np.interp(x / s, np.arange(k), g)
            tot += amp
            amp *= gain
            s /= 2
        return out / max(tot, 1e-6)

    def _woodgrain(self, k):
        """Fine streaks of cherry wood along the plank (horizontal)."""
        h, w = self.H, self.W
        rng = np.random.default_rng(self.seed * 31 + k)
        warp = self.noise(h, w, 420 * self.s, 3, 0.5, aniso=3.0, rng=rng)
        yy = np.arange(h, dtype=np.float32)[:, None] / self.s
        period = 9.0 + 3.0 * k
        phase = (yy + 38.0 * warp + 6.0 * self.noise(h, w, 60 * self.s, 2, aniso=6.0, rng=rng)) / period
        rings = 0.5 + 0.5 * np.sin(phase * 2 * np.pi)
        rings = rings ** 4
        amp = 0.8 + 0.2 * self.noise(h, w, 300 * self.s, 2, aniso=5.0, rng=rng)
        g = rings * np.clip(amp, 0, 1) - 0.2
        return g.astype(np.float32)

    # ------------------------------------------------------------ geometry
    def path(self, pts, closed=True, smooth=False, ds=6.0):
        import skia
        p = np.asarray(pts, np.float64)
        if smooth:
            p = catmull_rom(p, ds, closed=closed)
        p = p * self.s
        path = skia.Path()
        path.moveTo(float(p[0, 0]), float(p[0, 1]))
        for q in p[1:]:
            path.lineTo(float(q[0]), float(q[1]))
        if closed:
            path.close()
        return path

    def mask(self, shapes, stroke=None, feather=0.0, pad=0):
        """Rasterize skia paths (or point lists) to a coverage map 0..1.
        Returns (array, (y0, y1, x0, x1)) cropped to the shapes' bounds."""
        import skia
        if isinstance(shapes, skia.Path):
            shapes = [shapes]
        elif isinstance(shapes, np.ndarray) and shapes.ndim == 2:
            shapes = [shapes]
        elif isinstance(shapes, (list, tuple)) and len(shapes) and np.ndim(shapes[0]) == 1 \
                and not isinstance(shapes[0], skia.Path):
            shapes = [np.asarray(shapes)]
        paths = [s if isinstance(s, skia.Path) else self.path(s) for s in shapes]
        pad = int(4 + (stroke or 0) * self.s + feather * self.s * 3 + pad * self.s)
        b = None
        for p in paths:
            r = p.computeTightBounds()
            b = r if b is None else skia.Rect.MakeLTRB(min(b.left(), r.left()), min(b.top(), r.top()),
                                                         max(b.right(), r.right()), max(b.bottom(), r.bottom()))
        x0 = max(0, int(b.left()) - pad)
        y0 = max(0, int(b.top()) - pad)
        x1 = min(self.W, int(math.ceil(b.right())) + pad)
        y1 = min(self.H, int(math.ceil(b.bottom())) + pad)
        if x1 <= x0 or y1 <= y0:
            return np.zeros((1, 1), np.float32), (0, 1, 0, 1)
        info = skia.ImageInfo.MakeA8(x1 - x0, y1 - y0)
        surf = skia.Surface.MakeRaster(info)
        c = surf.getCanvas()
        c.clear(skia.ColorTRANSPARENT)
        c.translate(-x0, -y0)
        paint = skia.Paint(AntiAlias=True, Color=skia.ColorWHITE)
        if stroke:
            paint.setStyle(skia.Paint.kStroke_Style)
            paint.setStrokeWidth(stroke * self.s)
            paint.setStrokeCap(skia.Paint.kRound_Cap)
            paint.setStrokeJoin(skia.Paint.kRound_Join)
        for p in paths:
            c.drawPath(p, paint)
        a = surf.makeImageSnapshot().toarray()
        a = a.reshape(y1 - y0, x1 - x0, -1)[..., -1].astype(np.float32) / 255.0
        if feather > 0:
            a = ndi.gaussian_filter(a, feather * self.s)
        return a, (y0, y1, x0, x1)

    def full(self):
        return np.ones((self.H, self.W), np.float32), (0, self.H, 0, self.W)

    def band(self, y0, y1, soft=0.0):
        """Horizontal band mask between y0 and y1 (ref units)."""
        m = smoothstep(y0 - soft, y0 + soft, self.Y) * (1 - smoothstep(y1 - soft, y1 + soft, self.Y)) if soft \
            else ((self.Y >= y0) & (self.Y < y1)).astype(np.float32)
        return m.astype(np.float32), (0, self.H, 0, self.W)

    # ------------------------------------------------------------ printing
    def block(self, pl, m, color, alpha=1.0, bokashi=None, grain=0.22, mottle=0.05, pool=0.18,
              cover=True, shift=True, gk=None, knock=False):
        """Print one colour block through mask `m` = (array, bbox) onto plane `pl`.

        bokashi: None, a full-size array, or a function f(X, Y) of ref coordinates
        (cropped to the mask's box) giving 0..1 density.
        """
        a, (y0, y1, x0, x1) = m
        if a.size <= 1:
            return
        if isinstance(color, str):
            color = self.col(color)
        dens = a * alpha
        X = self.X[y0:y1, x0:x1]
        Y = self.Y[y0:y1, x0:x1]
        if bokashi is not None:
            if callable(bokashi):
                dens = dens * bokashi(X, Y)
            else:
                dens = dens * bokashi[y0:y1, x0:x1]
        if pool > 0 and dens.shape[0] > 8 and dens.shape[1] > 8:
            inner = ndi.uniform_filter(a, int(max(3, 9 * self.s)) | 1)
            edge = np.clip(a - inner, 0, 1) * 2.2 + np.clip(a * (1 - inner) * 1.4, 0, 1) * 0.3
            dens = dens * (1 + pool * edge)
        if grain > 0 or mottle > 0:
            gidx = gk if gk is not None else int(self.rng.integers(0, 3))
            g = self._grain[gidx][y0:y1, x0:x1]
            mo = self._mottle[y0:y1, x0:x1]
            dens = dens * (1 - grain * 0.18 + grain * g * 0.5) * (1 + mottle * mo)
        dens = np.clip(dens, 0, 1)
        if shift:
            dx, dy = self.rng.uniform(-1.6, 1.6, 2) * self.s
            if abs(dx) + abs(dy) > 0.3:
                dens = ndi.shift(dens, (dy, dx), order=1, mode="constant")
        sub = pl.mult[y0:y1, x0:x1]
        if knock:
            # a new shape hides what this plane printed under it, as carving does
            k = a[..., None]
            sub *= 1.0 - k
            sub += k
        sub *= 1.0 - dens[..., None] * (1.0 - color)
        if cover:
            cv = pl.cov[y0:y1, x0:x1]
            np.maximum(cv, np.clip(a if cover is True else a * cover, 0, 1), out=cv)

    def cover(self, pl, m, amount=1.0):
        a, (y0, y1, x0, x1) = m
        cv = pl.cov[y0:y1, x0:x1]
        np.maximum(cv, a * amount, out=cv)

    def uncover(self, pl, m):
        """Carve away: the plane shows what is behind it inside the mask."""
        a, (y0, y1, x0, x1) = m
        pl.cov[y0:y1, x0:x1] *= 1 - a
        pl.mult[y0:y1, x0:x1] = pl.mult[y0:y1, x0:x1] * (1 - a[..., None]) + a[..., None]

    def key(self, pl, pts, width, color="sumi", alpha=0.95, closed=False, smooth=True, taper=(0.25, 0.25),
            wobble=0.12, cover=True, ds=4.0):
        """A key-block line: even, slightly swelling, tapering at open ends."""
        strokes = pts if (len(pts) and np.ndim(pts[0]) == 2) else [pts]
        polys = []
        for s_ in strokes:
            s_ = np.asarray(s_, np.float64)
            P = catmull_rom(s_, ds, closed=closed) if smooth and len(s_) > 2 else catmull_rom(s_, ds)
            n = len(P)
            if n < 2:
                continue
            t = np.linspace(0, 1, n)
            w = np.full(n, width, np.float64) * (1 + wobble * self.line_noise(n, max(8, n / 5)))
            if not closed:
                ti, to = taper
                if ti > 0:
                    w *= 0.25 + 0.75 * smoothstep(0, ti, t)
                if to > 0:
                    w *= 0.25 + 0.75 * (1 - smoothstep(1 - to, 1, t))
            d = np.gradient(P, axis=0)
            d /= np.maximum(np.hypot(d[:, 0], d[:, 1])[:, None], 1e-9)
            nrm = np.stack([-d[:, 1], d[:, 0]], 1)
            L = P + nrm * (w[:, None] / 2)
            R = P - nrm * (w[:, None] / 2)
            if closed:
                polys.append(self.path(L, closed=True))
                polys.append(self.path(R[::-1], closed=True))
            else:
                cap_l = [P[0] - d[0] * w[0] * 0.3]
                cap_r = [P[-1] + d[-1] * w[-1] * 0.3]
                polys.append(self.path(np.vstack([cap_l, L, cap_r, R[::-1]]), closed=True))
        if not polys:
            return
        if closed:
            m = self._ring_mask(polys)
        else:
            m = self.mask(polys)
        self.block(pl, m, color, alpha=alpha, grain=0.05, mottle=0.04, pool=0.0, cover=cover, shift=False)

    def _ring_mask(self, polys):
        """Closed outline: fill between outer and inner offset curves (even-odd)."""
        import skia
        path = skia.Path()
        path.setFillType(skia.PathFillType.kEvenOdd)
        for p in polys:
            path.addPath(p)
        return self.mask([path])

    def edge(self, pl, m, width, color="sumi", alpha=0.9, cover=True):
        """Key line around the outside of any mask (the union of its shapes)."""
        a, bb = m
        r = max(1, int(round(width * self.s)))
        grown = ndi.grey_dilation(a, size=(2 * r + 1, 2 * r + 1))
        e = np.clip(grown - a, 0, 1)
        e = ndi.gaussian_filter(e, 0.6 * self.s) if self.s > 0.5 else e
        self.block(pl, (np.clip(e * 1.4, 0, 1), bb), color, alpha=alpha, grain=0.05, mottle=0.03, pool=0.0,
                   cover=cover, shift=False)

    def outline(self, pl, pts, width, color="sumi", alpha=0.95, smooth=False, cover=True):
        """Constant-width stroke around a closed shape (round joins)."""
        m = self.mask([self.path(pts, closed=True, smooth=smooth)], stroke=width)
        self.block(pl, m, color, alpha=alpha, grain=0.05, mottle=0.04, pool=0.0, cover=cover, shift=False)

    def strokes(self, pl, lines, width, color="sumi", alpha=0.95, cover=False, smooth=True):
        """Many open constant-width lines at once (rain, water lines, hatching)."""
        paths = [self.path(l, closed=False, smooth=smooth and len(l) > 2, ds=5.0) for l in lines if len(l) > 1]
        if not paths:
            return
        m = self.mask(paths, stroke=width)
        self.block(pl, m, color, alpha=alpha, grain=0.05, mottle=0.05, pool=0.0, cover=cover, shift=False)

    def text(self, pl, s, x, y, size, color="sumi", font="yuji", vertical=True, alpha=0.95, spacing=1.08):
        """Set characters (vertical by default) at (x, y) = top centre, in ref units."""
        import skia
        path_ = {
            "yuji": os.path.join(FONTS, "yuji-syuku", "400Regular", "YujiSyuku_400Regular.ttf"),
            "mincho": os.path.join(FONTS, "shippori-mincho", "700Bold", "ShipporiMincho_700Bold.ttf"),
        }[font]
        tf = skia.Typeface.MakeFromFile(path_)
        f = skia.Font(tf, size * self.s)
        paths = []
        for i, ch in enumerate(s):
            gid = f.textToGlyphs(ch)[0]
            gp = f.getPath(gid)
            if gp is None:
                continue
            w = f.measureText(ch)
            if vertical:
                gx = x * self.s - w / 2
                gy = (y + (i + 0.88) * size * spacing) * self.s
            else:
                gx = (x + i * size * spacing) * self.s
                gy = (y + size * 0.88) * self.s
            gp.offset(gx, gy)
            paths.append(gp)
        if paths:
            m = self.mask(paths)
            self.block(pl, m, color, alpha=alpha, grain=0.04, mottle=0.03, pool=0.0, cover=True, shift=False)

    def reflect(self, src, dst, y_water, y_max=None, alpha=0.55, fade=700, color="sea", ripple=True):
        """Mirror plane `src` about the waterline y_water into plane `dst`, as a
        paler, broken reflection on still water."""
        yw = int(round(y_water * self.s))
        y_max = int(round((y_max if y_max is not None else REF_H) * self.s))
        n = min(yw, y_max - yw)
        if n <= 0:
            return
        mult = src.mult[yw - n:yw][::-1]
        cov = src.cov[yw - n:yw][::-1]
        if ripple:
            # horizontal breaks: shift rows a little, drop some thin rows
            rows = np.arange(n)
            off = (np.sin(rows * 0.21 / max(self.s, 0.2)) * 4 * self.s * (rows / n + 0.2)).astype(int)
            mult = np.stack([np.roll(mult[i], off[i], axis=0) for i in range(n)])
            cov = np.stack([np.roll(cov[i], off[i]) for i in range(n)])
            gaps = (np.sin(rows / (3.2 * self.s + 0.5) + np.sin(rows * 0.013)) > 0.86)
            cov = cov * np.where(gaps, 0.25, 1.0)[:, None]
        f = alpha * (1 - smoothstep(0, fade * self.s, np.arange(n, dtype=np.float32)))[:, None]
        a = np.clip(cov * f, 0, 1)
        sub = dst.mult[yw:yw + n]
        tint = 1.0 - a[..., None] * (1.0 - mult)
        sub *= tint
        np.maximum(dst.cov[yw:yw + n], a, out=dst.cov[yw:yw + n])

    # ------------------------------------------------------------ gradients
    def vgrad(self, y0, y1, a0=1.0, a1=0.0):
        """Vertical bokashi from density a0 at y0 to a1 at y1."""
        return lambda X, Y: a0 + (a1 - a0) * smoothstep(y0, y1, Y)

    def hgrad(self, x0, x1, a0=1.0, a1=0.0):
        return lambda X, Y: a0 + (a1 - a0) * smoothstep(x0, x1, X)

    def rgrad(self, cx, cy, r0, r1, a0=1.0, a1=0.0, sy=1.0):
        return lambda X, Y: a0 + (a1 - a0) * smoothstep(r0, r1, np.hypot(X - cx, (Y - cy) / sy))

    # ------------------------------------------------------------ output
    def image(self, grain_tile=None):
        c = self.canvas
        if grain_tile is not None:
            t = np.tile(grain_tile, (self.H // grain_tile.shape[0] + 1, self.W // grain_tile.shape[1] + 1))
            t = t[: self.H, : self.W][..., None]
            c = c * t if not self.night else c + (1 - t) * 0.5 * (1 - c)
        return Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))
