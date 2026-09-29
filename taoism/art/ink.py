"""Procedural ink-wash (shuimo) painting engine.

Everything is painted as ink density on float32 planes: 0 is bare paper, 1 is
full black ink. Scenes are authored in 3840 x 2160 ("4K") coordinates and
rendered at any size; the painter scales positions and brush widths.

A Plane holds two maps:
  ink    the ink the plane lays down
  cover  what the plane hides of the planes behind it (painted-over paper,
         mist, the body of a mountain). cover >= ink everywhere.
Planes composite front over back as  D = ink + (1 - cover) * D_behind, which
is exactly what CSS alpha compositing does if a plane is exported as an RGBA
layer with colour mix(paper, ink, ink / cover) and alpha = cover. That lets one
scene be flattened into a single picture or split into parallax layers.
"""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator

REF_W, REF_H = 3840, 2160


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def catmull_rom(points, ds):
    """Smooth path through `points`, resampled every `ds` px of arc length."""
    p = np.asarray(points, np.float64)
    if len(p) < 2:
        return p, 0.0
    if len(p) == 2:
        c = p
    else:
        q = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
        segs = []
        for i in range(1, len(q) - 2):
            p0, p1, p2, p3 = q[i - 1], q[i], q[i + 1], q[i + 2]
            n = max(4, int(np.linalg.norm(p2 - p1) / max(ds, 0.25) * 0.6) + 4)
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
    return np.stack([np.interp(s, d, c[:, 0]), np.interp(s, d, c[:, 1])], 1), length


class Plane:
    def __init__(self, h, w):
        self.ink = np.zeros((h, w), np.float32)
        self.cover = np.zeros((h, w), np.float32)
        self.sun = None  # optional colour mask (sun / moon disc) on this plane

    def over(self, front):
        """Put `front` over this plane in place (front hides by its cover)."""
        self.ink = front.ink + (1.0 - front.cover) * self.ink
        self.cover = 1.0 - (1.0 - front.cover) * (1.0 - self.cover)
        if front.sun is not None:
            self.sun = front.sun if self.sun is None else np.maximum(self.sun * (1 - front.cover), front.sun)
        elif self.sun is not None:
            self.sun = self.sun * (1.0 - front.cover)


class Painter:
    def __init__(self, width, height, seed=1):
        self.W, self.H = width, height
        self.s = width / REF_W
        self.rng = np.random.default_rng(seed)
        self.yy, self.xx = None, None

    # ------------------------------------------------------------ utilities
    def px(self, v):
        return v * self.s

    def grid(self):
        if self.yy is None:
            self.yy, self.xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        return self.yy, self.xx

    def plane(self):
        return Plane(self.H, self.W)

    def noise(self, h, w, scale, octaves=4, gain=0.5, lac=2.0, rng=None):
        """fBm value noise in about [-1, 1]; `scale` is the largest feature in output px."""
        rng = rng or self.rng
        out = np.zeros((h, w), np.float32)
        amp, tot, s = 1.0, 0.0, float(scale)
        for _ in range(octaves):
            if s < 1.5:
                break
            gh, gw = int(h / s) + 3, int(w / s) + 3
            g = rng.standard_normal((gh, gw)).astype(np.float32)
            uw, uh = max(w + 1, int(gw * s)), max(h + 1, int(gh * s))
            up = np.asarray(Image.fromarray(g, "F").resize((uw, uh), Image.BICUBIC))
            oy = int(rng.integers(0, up.shape[0] - h + 1))
            ox = int(rng.integers(0, up.shape[1] - w + 1))
            out += amp * up[oy:oy + h, ox:ox + w]
            tot += amp
            amp *= gain
            s /= lac
        return out / max(tot, 1e-6) * 1.6

    def noise_full(self, scale, octaves=4, gain=0.5):
        return self.noise(self.H, self.W, scale * self.s, octaves, gain)

    def line_noise(self, n, scale, octaves=4, gain=0.5, rng=None):
        """1-D fBm over n samples, largest feature `scale` samples, about [-1, 1]."""
        rng = rng or self.rng
        out = np.zeros(n, np.float64)
        x = np.arange(n, dtype=np.float64)
        amp, tot, s = 1.0, 0.0, float(scale)
        for _ in range(octaves):
            if s < 1.0:
                break
            k = int(n / s) + 5
            g = rng.standard_normal(k)
            u = x / s + rng.random()
            i = np.floor(u).astype(int)
            f = u - i
            p0, p1, p2, p3 = g[np.clip(i - 1, 0, k - 1)], g[i], g[np.clip(i + 1, 0, k - 1)], g[np.clip(i + 2, 0, k - 1)]
            out += amp * 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f
                                + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)
            tot += amp
            amp *= gain
            s /= 2.0
        return out / max(tot, 1e-6) * 1.4

    # --------------------------------------------------------------- strokes
    def stroke(self, target, pts, width, ink=0.9, dry=0.25, wet=0.0, start=0.45, end=0.08,
               taper_in=0.12, taper_out=0.35, press=None, bristles=None, wobble=0.12,
               cover=True, fade=None, streak=1.0, tip_len=None):
        """One brush stroke along `pts` (4K coords). `width` in 4K px.

        The brush is a row of bristles; each carries its own ink load and runs
        dry at its own rate, which gives the broken, streaky "flying white"
        (feibai) of a dry brush. `wet` diffuses the stroke into the paper.
        """
        s = self.s
        pts = np.asarray(pts, np.float64) * s
        P, L = catmull_rom(pts, 0.42)
        n = len(P)
        if n < 3 or L < 0.5:
            return
        wmax = max(width * s, 0.35)
        t = np.linspace(0.0, 1.0, n)
        # width profile: brush touches down, presses, lifts to a point
        prof = (start + (1 - start) * smoothstep(0.0, taper_in, t)) * \
               (1.0 - (1.0 - end) * smoothstep(1.0 - taper_out, 1.0, t))
        if press is not None:
            prof = prof * np.interp(t, np.linspace(0, 1, len(press)), press)
        rng = self.rng
        prof = prof * (1.0 + wobble * self.line_noise(n, max(8.0, n / 3)))
        w = np.maximum(wmax * prof, 0.25)
        # tangents / normals
        d = np.gradient(P, axis=0)
        dn = np.hypot(d[:, 0], d[:, 1]) + 1e-9
        tx, ty = d[:, 0] / dn, d[:, 1] / dn
        nx, ny = -ty, tx
        B = bristles or int(np.clip(wmax * 0.9, 4, 44))
        u = np.linspace(-1.0, 1.0, B) + rng.uniform(-0.35, 0.35, B) * (2.0 / B)
        u = np.clip(u, -1, 1)
        load = rng.uniform(0.62, 1.0, B) * (1.0 - 0.3 * np.abs(u) ** 3)
        rate = dry * rng.uniform(0.35, 1.7, B)
        # arc length in 4K px so dryness does not depend on render size
        arc = np.linspace(0.0, L / s, n)
        runs = arc / 900.0
        ink_b = load[None, :] - rate[None, :] * runs[:, None] * 1.6
        if dry > 0:
            nz = np.stack([self.line_noise(n, max(6.0, (38.0 + 60 * rng.random()) * s / 0.42 / 2.4), 3)
                           for _ in range(B)], 1)
            ink_b = ink_b + dry * 0.55 * streak * nz
        ink_b = np.clip(ink_b, 0.0, 1.0)
        ink_b = ink_b * smoothstep(0.04, 0.3, ink_b)
        # bristle positions
        off = (u[None, :] * 0.5) * w[:, None]
        X = P[:, 0:1] + nx[:, None] * off
        Y = P[:, 1:2] + ny[:, None] * off
        amt = ink * ink_b * (w[:, None] / B) * 0.42 * (B / max(B - 1, 1)) * 2.0 / 2.0
        amt = amt * (1.0 if fade is None else 1.0)
        self._splat(target, X.ravel(), Y.ravel(), amt.ravel(), wet, cover, fade)

    def _splat(self, target, X, Y, A, wet=0.0, cover=True, fade=None, blur=0.55):
        pad = int(4 + 3 * (wet * 6 * self.s + 1))
        x0 = int(max(0, math.floor(X.min()) - pad))
        y0 = int(max(0, math.floor(Y.min()) - pad))
        x1 = int(min(self.W, math.ceil(X.max()) + pad + 1))
        y1 = int(min(self.H, math.ceil(Y.max()) + pad + 1))
        if x1 <= x0 or y1 <= y0:
            return
        h, w = y1 - y0, x1 - x0
        lx, ly = X - x0, Y - y0
        ix, iy = np.floor(lx).astype(np.int64), np.floor(ly).astype(np.int64)
        fx, fy = lx - ix, ly - iy
        acc = np.zeros(h * w, np.float64)
        for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)),
                           (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            jx, jy = ix + dx, iy + dy
            ok = (jx >= 0) & (jx < w) & (jy >= 0) & (jy < h)
            acc += np.bincount((jy[ok] * w + jx[ok]), weights=(A[ok] * wt[ok]), minlength=h * w)
        d = acc.reshape(h, w).astype(np.float32)
        d = ndi.gaussian_filter(d, blur * max(self.s, 0.5) + 0.15)
        d = 1.0 - np.exp(-2.2 * d)  # bristles overlapping saturate like real ink
        if wet > 0:
            soft = ndi.gaussian_filter(d, wet * 6.0 * self.s + 0.5)
            d = (1 - wet) * d + wet * np.maximum(soft * 1.15, d * 0.7)
        if fade is not None:
            d *= fade[y0:y1, x0:x1]
        tgt = target.ink[y0:y1, x0:x1]
        target.ink[y0:y1, x0:x1] = 1.0 - (1.0 - tgt) * (1.0 - d)
        if cover:
            c = target.cover[y0:y1, x0:x1]
            target.cover[y0:y1, x0:x1] = 1.0 - (1.0 - c) * (1.0 - d)

    def dot(self, target, x, y, size, ink=0.85, angle=None, elong=1.6, dry=0.15, fade=None):
        """A single short dab (moss dot, leaf dot)."""
        a = self.rng.uniform(0, math.pi) if angle is None else angle
        L = size * elong
        dx, dy = math.cos(a) * L / 2, math.sin(a) * L / 2
        self.stroke(target, [(x - dx, y - dy), (x + dx, y + dy)], size, ink=ink, dry=dry,
                    start=0.7, end=0.35, taper_in=0.3, taper_out=0.5, wobble=0.2, fade=fade)

    # ----------------------------------------------------------------- masks
    def ridge_mask(self, ridge_x, ridge_y, base_y=None, soft=0.8, base_soft=60):
        """Mask of everything below a ridge line given as samples in 4K coords."""
        yy, xx = self.grid()
        xs = np.arange(self.W, dtype=np.float64) / self.s
        top = np.interp(xs, ridge_x, ridge_y, left=np.inf, right=np.inf) * self.s
        m = smoothstep(-soft, soft, yy - top[None, :].astype(np.float32))
        if base_y is not None:
            m *= 1.0 - smoothstep((base_y - base_soft) * self.s, base_y * self.s, yy)
        return m.astype(np.float32), top

    def poly_mask(self, pts, feather=0.0):
        import skia
        surf = skia.Surface(self.W, self.H)
        c = surf.getCanvas()
        c.clear(skia.ColorTRANSPARENT)
        path = skia.Path()
        p = np.asarray(pts, np.float64) * self.s
        path.moveTo(*p[0])
        for q in p[1:]:
            path.lineTo(*q)
        path.close()
        c.drawPath(path, skia.Paint(AntiAlias=True, Color=skia.ColorWHITE))
        a = surf.makeImageSnapshot().toarray()[:, :, 3].astype(np.float32) / 255.0
        if feather > 0:
            a = ndi.gaussian_filter(a, feather * self.s)
        return a

    def smooth_poly(self, pts, ds=6.0):
        P, _ = catmull_rom(np.vstack([pts, pts[:1]]), ds)
        return P

    def wash(self, target, mask, tone, blur=4.0, cover=None, mottle=0.25, mottle_scale=180, rim=0.0):
        """Flat or graded ink wash inside `mask` (full-size arrays or scalars)."""
        d = mask * tone
        if mottle > 0:
            d = d * (1.0 + mottle * self.noise_full(mottle_scale, 4, 0.55))
        if blur > 0:
            d = ndi.gaussian_filter(d, blur * self.s)
        if rim > 0:
            inner = ndi.gaussian_filter(mask, 6 * self.s)
            d = d + rim * np.clip(mask - inner, 0, 1) * tone
        d = np.clip(d, 0, 1).astype(np.float32)
        target.ink = 1.0 - (1.0 - target.ink) * (1.0 - d)
        if cover is not None:
            target.cover = np.maximum(target.cover, cover)

    def erase_behind(self, target, mask):
        """Paint-over: whatever `target` holds under `mask` is hidden (left as paper)."""
        target.ink *= (1.0 - mask)
        target.cover = np.maximum(target.cover, mask)

    # ------------------------------------------------------------ finishing
    def bleed(self, plane, amount=0.7, scale=11.0):
        """Ink creeping along paper fibres: warp edges by a fine noise field."""
        if amount <= 0:
            return
        h, w = self.H, self.W
        a = amount * max(self.s, 0.35)
        nx = self.noise(h, w, scale * max(self.s, 0.5) + 1.5, 3, 0.6) * a
        ny = self.noise(h, w, scale * max(self.s, 0.5) + 1.5, 3, 0.6) * a
        yy, xx = self.grid()
        for name in ("ink", "cover"):
            arr = getattr(plane, name)
            setattr(plane, name, ndi.map_coordinates(arr, [yy + ny, xx + nx], order=1, mode="nearest").astype(np.float32))

    def grain(self, plane, amount=0.06, scale=2.2):
        """Paper tooth: ink density varies where fibres soak up more or less."""
        g = self.noise(self.H, self.W, scale * max(self.s, 0.5) + 1.0, 2, 0.5)
        plane.ink = np.clip(plane.ink * (1.0 + amount * g), 0, 1)


# --------------------------------------------------------------- landforms
def profile(kind):
    """Monotone flank profiles g(u): 0 at the summit, 1 at the foot."""
    shapes = {
        "dome":  ([0, .18, .42, .62, .8, 1.0], [0, .035, .16, .4, .74, 1.0]),
        "steep": ([0, .12, .3, .48, .7, 1.0], [0, .03, .2, .55, .86, 1.0]),
        "crag":  ([0, .08, .22, .38, .6, 1.0], [0, .06, .34, .66, .88, 1.0]),
        "hill":  ([0, .25, .5, .75, 1.0], [0, .09, .34, .72, 1.0]),
        "table": ([0, .3, .45, .62, .8, 1.0], [0, .02, .12, .55, .85, 1.0]),
    }
    u, g = shapes[kind]
    return PchipInterpolator(u, g)


class Peak:
    """One summit: apex (cx, top), feet at `base`, half-widths left/right."""

    def __init__(self, p, cx, top, base, hw_l, hw_r, kind="dome", rough=0.035, seed=None,
                 shoulders=3, boulders=3):
        self.p, self.cx, self.top, self.base = p, cx, top, base
        self.hw_l, self.hw_r, self.kind = hw_l, hw_r, kind
        self.g = profile(kind)
        self.x0 = cx - hw_l * 1.25
        self.x1 = cx + hw_r * 1.25
        n = int((self.x1 - self.x0) / 2) + 2
        self.xs = np.linspace(self.x0, self.x1, n)
        rng = np.random.default_rng(seed) if seed is not None else p.rng
        self.rng = rng
        h = base - top
        u = np.where(self.xs < cx, (cx - self.xs) / hw_l, (self.xs - cx) / hw_r)
        uc = np.clip(u, 0, 1)
        y = top + h * self.g(uc)
        y = np.where(u > 1, base + (u - 1) * h * 0.25, y)
        # shoulders: lesser crests that step down the flanks
        for _ in range(shoulders):
            side = -1 if rng.random() < 0.5 else 1
            hw = hw_l if side < 0 else hw_r
            c = cx + side * rng.uniform(0.3, 0.85) * hw
            wdt = rng.uniform(0.1, 0.24) * hw
            yc = np.interp(c, self.xs, y) - rng.uniform(0.03, 0.09) * h
            bump = yc + (np.abs(self.xs - c) / wdt) ** 1.6 * wdt * 0.9
            y = np.minimum(y, bump)
        # "alum-head" boulders crowding the summit
        for _ in range(boulders):
            c = cx + rng.normal(0, 0.12) * (hw_l + hw_r) / 2
            r = rng.uniform(0.018, 0.045) * h
            yc = np.interp(c, self.xs, y) - r * rng.uniform(0.2, 0.6)
            dd = np.clip(1 - ((self.xs - c) / r) ** 2, 0, None)
            circ = np.where(dd > 0, yc + r - np.sqrt(dd) * r, np.inf)
            y = np.minimum(y, circ)
        # rocky irregularity, larger lower down, small near the summit
        big = p.line_noise(n, n / 5, 3, 0.5, rng) * h * rough * 1.2
        mid = p.line_noise(n, max(4.0, n / 22), 3, 0.5, rng) * h * rough * 0.55
        small = p.line_noise(n, max(3.0, n / 70), 2, 0.55, rng) * h * rough * 0.3
        env = 0.3 + 0.7 * np.clip(uc * 1.6, 0, 1)
        y = y + (big + mid + small) * env
        y = np.maximum(y, top - h * 0.02)
        self.ys = y
        self.h = h

    def y_at(self, x):
        return np.interp(x, self.xs, self.ys, left=np.inf, right=np.inf)

    def slope_at(self, x):
        dx = 3.0
        return (self.y_at(x + dx) - self.y_at(x - dx)) / (2 * dx)


def paper_rgb(hexstr):
    hexstr = hexstr.lstrip("#")
    return np.array([int(hexstr[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0
