"""Landscape motifs painted with the ink engine: ranges, peaks, rocks, pines,
bare trees, water, boats, birds, buildings, sun and moon.

All coordinates are in the 3840 x 2160 reference frame.
"""
import math

import numpy as np
from scipy import ndimage as ndi

from ink import Peak, Plane, smoothstep


def _rng(p, seed):
    return np.random.default_rng(seed) if seed is not None else p.rng


# ------------------------------------------------------------------ ranges
def far_range(p, plane, x0, x1, y_top, y_base, amp, tone=0.12, seed=None, peaks=4,
              sharp=0.5, fade=0.5, ridge_line=0.35, dots=0.0, soft=1.2, detail=6.0):
    """A distant range: a soft silhouette in pale wash that melts into mist."""
    rng = _rng(p, seed)
    n = int((x1 - x0) / 2) + 2
    xs = np.linspace(x0, x1, n)
    y = np.full(n, float(y_base))
    for _ in range(peaks):
        c = rng.uniform(x0, x1)
        w = rng.uniform(0.06, 0.2) * (x1 - x0)
        h = amp * rng.uniform(0.4, 1.0)
        u = np.abs(xs - c) / w
        bump = h * np.clip(1 - u * u, 0, None) ** (1.0 + sharp) * (1 + 0.25 * np.clip(1 - u * 3, 0, 1))
        y = np.minimum(y, y_top + (y_base - y_top) - bump)
    y = y + p.line_noise(n, n / detail, 4, 0.5, rng) * amp * 0.08
    y = y + p.line_noise(n, max(2.0, n / 90), 2, 0.5, rng) * amp * 0.025
    H = max(y_base - y.min(), 1.0)
    body, top = p.ridge_mask(xs, y, base_y=y_base + H * 0.6, soft=soft, base_soft=H * 0.5)
    yy, xx = p.grid()
    depth = (yy - top[None, :]) / (H * p.s)
    fadek = 1.0 - smoothstep(0.0, fade, depth + 0.12 * p.noise_full(300, 3))
    t = tone * (0.55 + 0.45 * np.exp(-np.clip(depth, 0, 9) / 0.08)) * fadek
    tmp = Plane(p.H, p.W)
    p.wash(tmp, body, t, blur=soft * 2.0, mottle=0.3, mottle_scale=260)
    if ridge_line > 0:
        rl = body * np.exp(-np.clip(depth, 0, 9) / 0.012) * tone * ridge_line
        p.wash(tmp, np.ones_like(body), rl, blur=soft, mottle=0.4, mottle_scale=90)
    if dots > 0:
        k = int(dots * (x1 - x0) / 30)
        for _ in range(k):
            x = rng.uniform(x0, x1)
            yt = np.interp(x, xs, y)
            yv = yt + abs(rng.normal(0, H * 0.12))
            f = float(1.0 - smoothstep(0.0, fade, (yv - yt) / H))
            if f < 0.15:
                continue
            p.dot(tmp, x, yv, rng.uniform(5, 10), ink=tone * 1.6 * f, angle=rng.normal(0, 0.15), elong=2.2, dry=0.1)
    tmp.cover = body
    plane.over(tmp)
    return xs, y


def paint_peak(p, plane, pk, tone=0.3, outline=0.8, texture=1.0, folds=5, dots=1.0,
               fade_top=0.3, fade_len=0.45, light=1, width=1.0, cun="hemp", trees=0,
               seed=None, wash_blur=6.0, dark_top=0.5, mist=None, accents=1.0):
    """Paint one summit with outline, folds, texture strokes, wash and moss dots.

    `mist` = (y0, y1) in 4K px: where the mountain starts and finishes melting
    into mist. Without it the mist line is placed relative to the peak height.
    """
    rng = _rng(p, seed)
    H = pk.base - pk.top
    yy, xx = p.grid()
    s = p.s
    if mist is None:
        mist = (pk.top + H * fade_top, pk.top + H * (fade_top + fade_len))
    m0, m1 = mist
    body, top = p.ridge_mask(pk.xs, pk.ys, base_y=m1 + (m1 - m0) * 0.3,
                             soft=0.7, base_soft=(m1 - m0) * 0.3)
    xcol = np.arange(p.W) / s
    mist_off = np.interp(xcol, pk.xs, p.line_noise(len(pk.xs), len(pk.xs) / 6, 3, 0.5, rng)) * (m1 - m0) * 0.25
    yf0 = (m0 + mist_off) * s
    yf1 = (m1 + mist_off) * s
    F = 1.0 - smoothstep(yf0[None, :], yf1[None, :], yy)
    F = np.clip(F * (1.0 + 0.3 * p.noise_full(220, 3)), 0, 1).astype(np.float32)

    tmp = Plane(p.H, p.W)
    depth = np.clip((yy - top[None, :]) / (H * s), 0, 4)
    side = np.where(xx / s < pk.cx, (xx / s - pk.cx) / pk.hw_l, (xx / s - pk.cx) / pk.hw_r)
    shade = smoothstep(-0.15, 0.85, -light * side)
    t = tone * (0.4 + 0.6 * shade) * (0.6 + dark_top * np.exp(-depth / 0.07))
    p.wash(tmp, body, t, blur=wash_blur, mottle=0.4, mottle_scale=200)

    def visible(x, y):
        yi = int(np.clip(y * s, 0, p.H - 1))
        xi = int(np.clip(x * s, 0, p.W - 1))
        return float(F[yi, xi]) * float(body[yi, xi] > 0.3)

    def flow(x, y, L, curl):
        """Path from (x, y) running down the flank: along the flank near the
        ridge, straightening toward the vertical deeper in."""
        lam = 0.22 * H
        pts = [(x, y)]
        cx_, cy_ = x, y
        sg = 1.0 if x >= pk.cx else -1.0
        win = 0.06 * (pk.hw_l if sg < 0 else pk.hw_r)
        for k in range(7):
            yl, yr = pk.y_at(cx_ - win), pk.y_at(cx_ + win)
            if not (np.isfinite(yl) and np.isfinite(yr)):
                break
            slope = abs(yr - yl) / (2 * win)
            dr = np.array([sg, max(slope, 0.25)])
            dr /= np.linalg.norm(dr)
            d_ = max(cy_ - pk.y_at(cx_), 0)
            a = math.exp(-d_ / lam)
            dv = a * dr + (1 - a) * np.array([sg * 0.12, 1.0])
            dv /= np.linalg.norm(dv) + 1e-9
            ang = math.atan2(dv[1], dv[0]) + curl
            cx_ += math.cos(ang) * L / 7
            cy_ += math.sin(ang) * L / 7
            pts.append((cx_, cy_))
        return np.array(pts)

    # ---- texture strokes follow the flanks in bundles, denser in shadow
    if texture > 0:
        area = (pk.hw_l + pk.hw_r) * min(H, m1 - pk.top)
        bundles = int(texture * area / 4200)
        for _ in range(bundles):
            u = rng.uniform(-1, 1)
            x = pk.cx + (u * pk.hw_l if u < 0 else u * pk.hw_r)
            yt = pk.y_at(x)
            if not np.isfinite(yt):
                continue
            dep = abs(rng.normal(0, 0.3)) * (m1 - yt) * 0.9
            y = yt + 3 + dep
            sh = smoothstep(-0.15, 0.85, -light * u)
            if rng.random() > 0.18 + 0.82 * sh:
                continue
            v = visible(x, y)
            if v < 0.08:
                continue
            L = np.clip(rng.uniform(0.07, 0.22) * H, 30, 420)
            path = flow(x, y, L, rng.normal(0, 0.06))
            if len(path) < 3:
                continue
            dvec = path[-1] - path[0]
            nrm = np.array([-dvec[1], dvec[0]]) / (np.linalg.norm(dvec) + 1e-9)
            if cun == "axe":
                wdt = rng.uniform(10, 24) * width
                p.stroke(tmp, path[:3], wdt, ink=rng.uniform(0.3, 0.55) * v, dry=0.8, start=0.95, end=0.25,
                         taper_in=0.08, taper_out=0.6, wobble=0.25)
                continue
            m = int(rng.integers(1, 4))
            sp = rng.uniform(6, 14) * width
            base_ink = rng.uniform(0.28, 0.6) * v
            for i in range(m):
                off = nrm * (i - (m - 1) / 2) * sp + rng.normal(0, 1.5, 2)
                cut = rng.uniform(0.0, 0.25)
                keep = path[: max(3, int(len(path) * (1 - cut)))] + off
                p.stroke(tmp, keep, rng.uniform(1.3, 2.6) * width, ink=base_ink * rng.uniform(0.75, 1.1),
                         dry=0.6, start=0.3, end=0.06, taper_in=0.25, taper_out=0.55)

    # ---- folds: inner ridge lines echoing the flanks
    for _ in range(folds):
        left = rng.random() < (0.68 if light > 0 else 0.32)
        sgn = -1 if left else 1
        hw = pk.hw_l if left else pk.hw_r
        shift = rng.uniform(0.05, 0.35) * hw
        drop = rng.uniform(0.03, 0.3) * H
        a0 = rng.uniform(0.0, 0.4)
        a1 = a0 + rng.uniform(0.18, 0.5)
        xs = pk.cx + sgn * np.linspace(a0, a1, 16) * hw
        pts = []
        for x in xs:
            y = pk.y_at(x - sgn * shift) + drop
            if not np.isfinite(y) or y < pk.y_at(x) + 6:
                continue
            if visible(x, y) < 0.1:
                break
            pts.append((x, y))
        if len(pts) >= 3:
            v = visible(*pts[0])
            p.stroke(tmp, pts, rng.uniform(2.4, 4.6) * width, ink=rng.uniform(0.5, 0.8) * v,
                     dry=0.45, start=0.5, end=0.12, taper_in=0.12, taper_out=0.45, wobble=0.2)
            # a shadow wash hugging the underside of the fold
            if rng.random() < 0.7:
                q = np.array(pts)
                band = np.vstack([q, (q + [0, rng.uniform(0.04, 0.1) * H])[::-1]])
                bm = p.poly_mask(band, feather=10)
                p.wash(tmp, bm * body, tone * 0.5 * v, blur=6, mottle=0.4, mottle_scale=90)
            if accents > 0 and rng.random() < 0.6 * accents:
                q = pts[rng.integers(0, len(pts))]
                p.dot(tmp, q[0], q[1] + 4, rng.uniform(7, 13) * width, ink=0.9 * v, elong=rng.uniform(1.2, 2.0))

    # ---- outline, from the summit down each flank in a few lifts
    if outline > 0:
        for sgn in (-1, 1):
            hw = pk.hw_l if sgn < 0 else pk.hw_r
            a = 0.0
            while a < 1.05:
                b = a + rng.uniform(0.22, 0.55)
                xs = pk.cx + sgn * np.linspace(a, min(b, 1.2), 20) * hw
                pts = []
                for x in xs:
                    y = pk.y_at(x) + 1.5
                    if not np.isfinite(y):
                        continue
                    if visible(x, y + 3) < 0.05:
                        break
                    pts.append((x, y))
                if len(pts) >= 3:
                    v = visible(*pts[0])
                    wv = rng.uniform(3.5, 7.0) * width
                    press = 1.0 + 0.5 * np.clip(p.line_noise(8, 3, 2, 0.5, rng), -1, 1)
                    p.stroke(tmp, pts, wv, ink=outline * (0.7 + 0.3 * v), dry=0.42, start=0.7, end=0.1,
                             taper_in=0.08, taper_out=0.4, press=press, wobble=0.22)
                a = b + rng.uniform(0.0, 0.05)

    # ---- moss dots along the ridge and on the upper slopes
    if dots > 0:
        k = int(dots * (pk.hw_l + pk.hw_r) / 40)
        for _ in range(k):
            u = rng.uniform(-1, 1)
            x = pk.cx + (u * pk.hw_l if u < 0 else u * pk.hw_r)
            yt = pk.y_at(x)
            if not np.isfinite(yt):
                continue
            y = yt + abs(rng.normal(0, 0.04)) * H + 2
            v = visible(x, y)
            if v < 0.2:
                continue
            for _ in range(rng.integers(1, 4)):
                p.dot(tmp, x + rng.normal(0, 8), y + rng.normal(2, 4), rng.uniform(4.5, 9) * width,
                      ink=rng.uniform(0.78, 0.97) * v, elong=rng.uniform(1.2, 1.9))

    # ---- little trees on the ridge
    for _ in range(trees):
        u = rng.uniform(-0.8, 0.8)
        x = pk.cx + (u * pk.hw_l if u < 0 else u * pk.hw_r)
        yt = pk.y_at(x)
        if not np.isfinite(yt) or visible(x, yt + 4) < 0.3:
            continue
        for j in range(rng.integers(2, 6)):
            xj = x + j * rng.uniform(14, 30) * width
            yj = pk.y_at(xj)
            if np.isfinite(yj):
                tiny_pine(p, tmp, xj, yj + 3, rng.uniform(26, 60) * width, ink=0.8 * visible(xj, yj + 4), rng=rng)

    tmp.ink *= F
    tmp.cover = np.maximum(body, tmp.cover * F)
    plane.over(tmp)
    return tmp


def massif(p, plane, cx, top, base, hw_l, hw_r, kind="steep", subs=4, seed=None, mist=None,
           sub_kind="dome", **kw):
    """A great peak with smaller rock masses stacked in front of its flanks."""
    rng = _rng(p, seed)
    main = Peak(p, cx, top, base, hw_l, hw_r, kind, seed=int(rng.integers(1 << 30)))
    H = base - top
    if mist is None:
        mist = (top + H * kw.pop("fade_top", 0.45), top + H * (0.45 + kw.pop("fade_len", 0.35)))
    else:
        kw.pop("fade_top", None)
        kw.pop("fade_len", None)
    paint_peak(p, plane, main, mist=mist, seed=int(rng.integers(1 << 30)), **kw)
    subs_spec = []
    for _ in range(subs):
        side = -1 if rng.random() < 0.5 else 1
        hw = hw_l if side < 0 else hw_r
        scx = cx + side * rng.uniform(0.12, 0.8) * hw
        yt = main.y_at(scx)
        if not np.isfinite(yt):
            continue
        stop = yt + rng.uniform(0.06, 0.26) * H
        if stop > mist[0]:
            continue
        subs_spec.append((stop, scx, side))
    subs_spec.sort()
    kw2 = dict(kw)
    kw2["folds"] = max(2, kw.get("folds", 5) // 2)
    kw2["trees"] = max(0, kw.get("trees", 0) // 2)
    for stop, scx, side in subs_spec:
        shw = rng.uniform(0.18, 0.4) * (hw_l + hw_r) / 2
        sub = Peak(p, scx, stop, stop + H * rng.uniform(0.35, 0.6), shw * rng.uniform(0.8, 1.2),
                   shw * rng.uniform(0.8, 1.2), sub_kind, seed=int(rng.integers(1 << 30)), shoulders=1, boulders=2)
        paint_peak(p, plane, sub, mist=mist, seed=int(rng.integers(1 << 30)), **kw2)
    return main


def tiny_pine(p, plane, x, y, h, ink=0.8, rng=None):
    """A far-off pine: a stem and stacked horizontal dabs."""
    rng = rng or p.rng
    p.stroke(plane, [(x, y), (x + rng.normal(0, h * 0.04), y - h)], max(1.2, h * 0.04), ink=ink,
             dry=0.2, start=0.8, end=0.2)
    tiers = rng.integers(4, 7)
    for i in range(tiers):
        f = (i + 0.6) / tiers
        yy = y - h * (0.25 + 0.72 * f)
        w = h * (0.42 - 0.3 * f) * rng.uniform(0.8, 1.2)
        p.stroke(plane, [(x - w * 0.5, yy + rng.normal(0, h * 0.01)), (x + w * 0.5, yy + rng.normal(0, h * 0.02))],
                 max(1.6, h * 0.075), ink=ink * rng.uniform(0.85, 1.0), dry=0.25, start=0.8, end=0.3,
                 taper_in=0.2, taper_out=0.4)


# ------------------------------------------------------------------- rocks
def rock(p, plane, outline_pts, tone=0.25, ink=0.92, light=1, width=1.0, texture=1.0,
         dots=1.0, facets=4, seed=None, cun="axe"):
    """A boulder or cliff: dark lifted outline, facet lines, axe-cut texture."""
    rng = _rng(p, seed)
    P = np.asarray(outline_pts, np.float64)
    Q = p.smooth_poly(P, 3.0)
    # roughen the outline a little
    nq = len(Q)
    jag = p.line_noise(nq, max(4.0, nq / 30), 3, 0.5, rng) * 9 * width
    d = np.gradient(Q, axis=0)
    dn = np.hypot(d[:, 0], d[:, 1]) + 1e-9
    Q = Q + np.stack([-d[:, 1] / dn, d[:, 0] / dn], 1) * jag[:, None]
    mask = p.poly_mask(Q)
    tmp = Plane(p.H, p.W)
    yy, xx = p.grid()
    xmin, xmax = P[:, 0].min(), P[:, 0].max()
    ymin, ymax = P[:, 1].min(), P[:, 1].max()
    cxr = (xmin + xmax) / 2
    side = (xx / p.s - cxr) / max((xmax - xmin) / 2, 1)
    shade = smoothstep(-0.3, 0.9, -light * side)
    # inner shading: darker away from the lit upper edge
    inner = ndi.gaussian_filter(mask, 40 * p.s)
    recess = np.clip(1.0 - inner * 1.3, 0, 1)
    p.wash(tmp, mask, tone * (0.35 + 0.65 * shade) * (0.7 + 0.6 * (1 - recess)), blur=3.0,
           mottle=0.5, mottle_scale=110)
    # facet lines from points on the upper outline, with axe-cut strokes beside them
    top_idx = [i for i in range(nq) if Q[i, 1] < ymin + 0.45 * (ymax - ymin)]
    if not top_idx:
        top_idx = list(range(nq))
    for _ in range(facets):
        a = Q[rng.choice(top_idx)]
        L = rng.uniform(0.3, 0.7) * (ymax - ymin)
        lean = rng.normal(-0.15 * light, 0.2)
        line = np.array([a, a + (lean * L * 0.5, L * 0.5), a + (lean * L + rng.normal(0, 0.08) * L, L)])
        p.stroke(tmp, line, rng.uniform(3.5, 7) * width, ink=ink * 0.85, dry=0.5, start=0.8, end=0.1,
                 taper_in=0.05, taper_out=0.5, wobble=0.25)
        if cun == "axe" and texture > 0:
            k = int(rng.integers(3, 7) * texture)
            for j in range(k):
                t = rng.uniform(0.05, 0.85)
                q = line[0] * (1 - t) + line[-1] * t
                sgn = -light if rng.random() < 0.8 else light
                ang = math.radians(rng.uniform(55, 78))
                Ls = rng.uniform(40, 120) * width
                pts = [q + (sgn * 4, 0), q + (sgn * math.cos(ang) * Ls * 0.5, math.sin(ang) * Ls * 0.5),
                       q + (sgn * math.cos(ang) * Ls, math.sin(ang) * Ls)]
                xi, yi = int(np.clip(pts[-1][0] * p.s, 0, p.W - 1)), int(np.clip(pts[-1][1] * p.s, 0, p.H - 1))
                if mask[yi, xi] < 0.5:
                    continue
                p.stroke(tmp, pts, rng.uniform(14, 34) * width, ink=rng.uniform(0.3, 0.6), dry=0.85,
                         start=1.0, end=0.15, taper_in=0.04, taper_out=0.7, wobble=0.3, streak=1.3)
    if cun != "axe" and texture > 0:
        count = int(texture * (xmax - xmin) * (ymax - ymin) / 3000)
        for _ in range(count):
            x, y = rng.uniform(xmin, xmax), rng.uniform(ymin, ymax)
            xi, yi = int(np.clip(x * p.s, 0, p.W - 1)), int(np.clip(y * p.s, 0, p.H - 1))
            if mask[yi, xi] < 0.5 or rng.random() > 0.2 + 0.8 * float(shade[yi, xi]):
                continue
            L = rng.uniform(25, 70) * width
            p.stroke(tmp, [(x, y), (x + rng.normal(0, 6), y + L * 0.5), (x + rng.normal(0, 10), y + L)],
                     rng.uniform(1.6, 2.8) * width, ink=rng.uniform(0.35, 0.6), dry=0.5)
    # outline in lifts, heavier on the shadow side
    i = 0
    while i < nq - 3:
        j = min(nq - 1, i + int(rng.uniform(0.1, 0.26) * nq))
        seg = Q[i:j + 1:max(1, (j - i) // 14)]
        if len(seg) >= 2:
            sx = (seg[:, 0].mean() - cxr) / max((xmax - xmin) / 2, 1)
            heavy = 1.0 + 0.6 * float(np.clip(-light * sx, 0, 1))
            press = 1.0 + 0.5 * np.clip(p.line_noise(8, 3, 2, 0.5, rng), -1, 1)
            p.stroke(tmp, seg, rng.uniform(6, 10) * width * heavy, ink=ink, dry=0.5, start=0.8, end=0.12,
                     taper_in=0.06, taper_out=0.35, wobble=0.3, press=press)
        i = j + int(rng.uniform(0, 0.02) * nq)
    # moss dots along the upper edge
    if dots > 0:
        k = int(dots * (xmax - xmin) / 34)
        for _ in range(k):
            q = Q[rng.integers(0, nq)]
            if q[1] > ymin + 0.3 * (ymax - ymin):
                continue
            for _ in range(rng.integers(1, 4)):
                p.dot(tmp, q[0] + rng.normal(0, 10), q[1] + rng.normal(5, 4), rng.uniform(7, 13) * width,
                      ink=rng.uniform(0.82, 0.98), elong=rng.uniform(1.1, 1.8))
    tmp.cover = np.maximum(mask, tmp.cover)
    plane.over(tmp)
    return mask


# ------------------------------------------------------------------- trees
def pine(p, plane, x, y, h, lean=-0.25, width=1.0, seed=None, ink=0.92, canopy=1.0, needles=1.0):
    """An old pine: scaled trunk, angular limbs, layered needle-wheels."""
    from ink import catmull_rom
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    w0 = h * 0.085 * width
    # trunk centre line: rises, leans out over the drop, lifts its head again
    shape = [(0.0, 0.0), (0.12, -0.2), (0.42, -0.42), (0.78, -0.6), (1.02, -0.78), (1.1, -0.92), (1.06, -1.0)]
    pts = []
    for fx, fy in shape:
        pts.append((x + lean * h * fx + rng.normal(0, h * 0.015), y + h * fy + rng.normal(0, h * 0.012)))
    C, _ = catmull_rom(np.array(pts), 2.0)
    n = len(C)
    f = np.linspace(0, 1, n)
    tw = w0 * (1.0 - 0.66 * f) * (1 + 0.1 * p.line_noise(n, n / 6, 2, 0.5, rng)) * (1 + 0.5 * np.exp(-f / 0.05))
    d = np.gradient(C, axis=0)
    dn = np.hypot(d[:, 0], d[:, 1]) + 1e-9
    nx, ny = -d[:, 1] / dn, d[:, 0] / dn
    Lft = C + np.stack([nx, ny], 1) * tw[:, None] / 2
    Rgt = C - np.stack([nx, ny], 1) * tw[:, None] / 2
    tmask = p.poly_mask(np.vstack([Lft, Rgt[::-1]]))
    p.wash(tmp, tmask, 0.22, blur=1.5, mottle=0.6, mottle_scale=50)
    # roots gripping the rock
    for sgn in (-1, 1, rng.choice([-1, 1])):
        r0 = C[int(n * 0.02)]
        L = w0 * rng.uniform(1.2, 2.2)
        p.stroke(tmp, [r0, r0 + (sgn * L * 0.5, w0 * 0.2), r0 + (sgn * L, w0 * rng.uniform(0.3, 0.6))],
                 w0 * 0.35, ink=ink, dry=0.55, start=1.0, end=0.1, taper_out=0.6)
    # bark: fish-scale arcs and dark knots
    nsc = int(n * 0.35 * (w0 / 40 + 0.4))
    for _ in range(nsc):
        k = rng.integers(int(n * 0.02), int(n * 0.9))
        o = rng.uniform(-0.36, 0.36)
        c0 = C[k] + np.array([nx[k], ny[k]]) * o * tw[k]
        r = tw[k] * rng.uniform(0.12, 0.24)
        a0 = math.atan2(ny[k], nx[k]) + rng.normal(0, 0.4)
        arc = [(c0[0] + math.cos(a0 + t) * r, c0[1] + math.sin(a0 + t) * r * 0.55) for t in np.linspace(-1.1, 1.1, 5)]
        p.stroke(tmp, arc, max(1.6, tw[k] * 0.06), ink=rng.uniform(0.45, 0.8), dry=0.45, start=0.6, end=0.2)
    for _ in range(3):
        k = rng.integers(int(n * 0.1), int(n * 0.8))
        c0 = C[k] + np.array([nx[k], ny[k]]) * rng.uniform(-0.25, 0.25) * tw[k]
        p.dot(tmp, c0[0], c0[1], tw[k] * 0.22, ink=0.95, elong=1.3)
    # trunk edges, dark and broken
    for edge, wt in ((Lft, 1.0), (Rgt, 0.8)):
        i = 0
        while i < n - 4:
            j = min(n - 1, i + int(rng.uniform(0.2, 0.45) * n))
            seg = edge[i:j + 1:max(1, (j - i) // 14)]
            p.stroke(tmp, seg, max(2.5, w0 * 0.2 * wt * (1 - 0.5 * i / n)), ink=ink, dry=0.55, start=0.9,
                     end=0.3, taper_in=0.08, taper_out=0.3, wobble=0.35)
            i = j + int(rng.uniform(0.0, 0.03) * n)
    # limbs: short, angular arms that reach out and lift at the tips
    limbs = []
    nl = int(5 + 3 * canopy)
    heights = np.sort(rng.uniform(0.42, 0.98, nl))
    lean_side = int(np.sign(lean)) or 1
    for k, hf in enumerate(heights):
        idx = int(hf * (n - 1))
        base = C[idx]
        side = lean_side if rng.random() < 0.62 else -lean_side
        L = h * rng.uniform(0.14, 0.3) * (1.1 - 0.4 * hf)
        a1 = rng.uniform(-0.15, 0.2)
        a2 = a1 - rng.uniform(0.25, 0.6)
        p1 = base + np.array([side * math.cos(a1) * L * 0.5, math.sin(a1) * L * 0.5])
        p2 = p1 + np.array([side * math.cos(a2) * L * 0.5, math.sin(a2) * L * 0.5])
        limb = [base, p1, p2]
        bw = max(2.5, tw[idx] * 0.32)
        p.stroke(tmp, limb, bw, ink=ink, dry=0.5, start=1.0, end=0.3, taper_in=0.02, taper_out=0.5, wobble=0.3)
        for _ in range(rng.integers(1, 3)):
            t = rng.uniform(0.3, 0.9)
            q = p1 * (1 - t) + p2 * t if rng.random() < 0.6 else base * (1 - t) + p1 * t
            tip = q + np.array([side * L * rng.uniform(0.1, 0.22), -L * rng.uniform(0.08, 0.22)])
            p.stroke(tmp, [q, tip], bw * 0.45, ink=ink, dry=0.4, start=1.0, end=0.2)
        limbs.append((np.array([base, p1, (p1 + p2) / 2, p2]), side, L))
    # needle-wheels in flat, cloud-like tiers
    for limb, side, L in limbs:
        for t in (0.35, 0.65, 1.0):
            if rng.random() > 0.9:
                continue
            c = limb[1] * (1 - t) + limb[3] * t if t < 1 else limb[3]
            _needle_cluster(p, tmp, c + rng.normal(0, 6, 2), L * rng.uniform(0.32, 0.46) * needles, rng, ink)
    _needle_cluster(p, tmp, C[-1] + np.array([0, -h * 0.02]), h * 0.09 * needles, rng, ink)
    tmp.cover = np.maximum(tmp.cover, tmask)
    plane.over(tmp)


def _needle_cluster(p, plane, c, r, rng, ink):
    """A tier of needles: soft mass below, wheels of needles radiating upward."""
    cx, cy = float(c[0]), float(c[1])
    blob = Plane(p.H, p.W)
    for _ in range(rng.integers(2, 4)):
        ox, oy = rng.normal(0, r * 0.3), rng.normal(-r * 0.2, r * 0.08)
        p.stroke(blob, [(cx + ox - r * 0.6, cy + oy), (cx + ox + r * 0.6, cy + oy + rng.normal(0, r * 0.04))],
                 r * rng.uniform(0.28, 0.4), ink=0.13, dry=0.05, wet=0.6, start=0.8, end=0.5, wobble=0.3)
    plane.over(blob)
    wheels = rng.integers(2, 5)
    for _ in range(wheels):
        wx = cx + rng.normal(0, r * 0.4)
        wy = cy + rng.normal(0, r * 0.08)
        m = int(rng.integers(11, 18))
        spread = rng.uniform(0.8, 1.0) * math.pi
        a0 = -math.pi / 2 - spread / 2
        for i in range(m):
            a = a0 + spread * (i + rng.uniform(-0.3, 0.3)) / (m - 1)
            L = r * rng.uniform(0.5, 0.75)
            ex, ey = wx + math.cos(a) * L, wy + math.sin(a) * L * 0.62
            p.stroke(plane, [(wx, wy), ((wx + ex) / 2, (wy + ey) / 2 + L * 0.02), (ex, ey)],
                     max(1.1, r * 0.024), ink=ink * rng.uniform(0.85, 1.0), dry=0.12, start=1.0, end=0.04,
                     taper_in=0.02, taper_out=0.8, wobble=0.03)


def bare_tree(p, plane, x, y, h, lean=0.0, spread=1.0, width=1.0, seed=None, ink=0.9, depth=6,
              leaves=0.0, claw=True):
    """A winter tree with crab-claw twigs (after Li Cheng and Guo Xi)."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)

    def grow(x0, y0, ang, L, w, lvl):
        segs = 3 if lvl < 2 else 2
        pts = [(x0, y0)]
        cx, cy, a = x0, y0, ang
        for _ in range(segs):
            a += rng.normal(0, 0.28)
            cx += math.cos(a) * L / segs
            cy += math.sin(a) * L / segs
            pts.append((cx, cy))
        p.stroke(tmp, pts, max(1.0, w), ink=ink, dry=0.45 if lvl < 2 else 0.25, start=1.0, end=0.4 if lvl < depth - 1 else 0.05,
                 taper_in=0.02, taper_out=0.5, wobble=0.15)
        if lvl >= depth - 1 or L < 10:
            if claw and lvl >= depth - 1:
                # claw: short hooked tips curling downward
                for _ in range(rng.integers(1, 3)):
                    ca = a + rng.normal(0, 0.6)
                    q1 = (cx + math.cos(ca) * L * 0.4, cy + math.sin(ca) * L * 0.4)
                    q2 = (q1[0] + math.cos(ca + 1.2 * np.sign(math.cos(ca))) * L * 0.3,
                          q1[1] + abs(math.sin(ca + 1.2)) * L * 0.3)
                    p.stroke(tmp, [(cx, cy), q1, q2], max(0.9, w * 0.6), ink=ink, dry=0.2, start=0.9, end=0.05)
            if leaves > 0 and rng.random() < leaves:
                for _ in range(rng.integers(4, 9)):
                    p.dot(tmp, cx + rng.normal(0, L * 0.6), cy + rng.normal(0, L * 0.4), rng.uniform(5, 10) * width,
                          ink=ink * rng.uniform(0.6, 0.95), elong=rng.uniform(1.0, 1.6), angle=rng.normal(0, 0.4))
            return
        kids = rng.integers(2, 4)
        for i in range(kids):
            da = rng.uniform(0.25, 0.75) * spread * (1 if i % 2 else -1) + rng.normal(0, 0.12)
            grow(cx, cy, a + da, L * rng.uniform(0.6, 0.82), w * rng.uniform(0.55, 0.72), lvl + 1)

    ang = -math.pi / 2 + lean
    grow(x, y, ang, h * 0.38, h * 0.045 * width, 0)
    plane.over(tmp)


def dot_tree(p, plane, x, y, h, seed=None, ink=0.85, width=1.0, style="pepper"):
    """A small leafy tree: a trunk and a crown of dots."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    top = (x + rng.normal(0, h * 0.06), y - h * 0.55)
    p.stroke(tmp, [(x, y), ((x + top[0]) / 2 + rng.normal(0, h * 0.03), (y + top[1]) / 2), top],
             max(1.5, h * 0.045 * width), ink=ink, dry=0.35, start=1.0, end=0.4)
    for _ in range(rng.integers(2, 4)):
        a = -math.pi / 2 + rng.normal(0, 0.7)
        L = h * rng.uniform(0.18, 0.3)
        p.stroke(tmp, [top, (top[0] + math.cos(a) * L, top[1] + math.sin(a) * L)], max(1.0, h * 0.02), ink=ink, dry=0.3)
    cy = y - h * 0.72
    k = int(rng.integers(30, 55))
    for _ in range(k):
        r = h * 0.28 * math.sqrt(rng.random())
        a = rng.uniform(0, 2 * math.pi)
        dx, dy = math.cos(a) * r * 1.2, math.sin(a) * r * 0.85
        if style == "pepper":
            p.dot(tmp, x + dx, cy + dy, rng.uniform(4, 8) * width, ink=ink * rng.uniform(0.5, 1.0), elong=1.1)
        else:
            p.dot(tmp, x + dx, cy + dy, rng.uniform(6, 11) * width, ink=ink * rng.uniform(0.4, 0.9),
                  angle=rng.normal(0, 0.25), elong=2.2)
    plane.over(tmp)


# ------------------------------------------------------------------- water
def ripples(p, plane, x0, x1, y0, y1, count=40, ink=0.28, seed=None, width=1.0, length=(60, 260)):
    rng = _rng(p, seed)
    for _ in range(count):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        L = rng.uniform(*length)
        pts = [(x + i * L / 3, y + rng.normal(0, 1.2)) for i in range(4)]
        p.stroke(plane, pts, rng.uniform(1.3, 2.3) * width, ink=ink * rng.uniform(0.6, 1.0), dry=0.5,
                 start=0.4, end=0.05, taper_in=0.25, taper_out=0.55, cover=False, wobble=0.05)


def reeds(p, plane, x0, x1, y, count=20, h=(30, 90), ink=0.75, seed=None):
    rng = _rng(p, seed)
    for _ in range(count):
        x = rng.uniform(x0, x1)
        hh = rng.uniform(*h)
        lean = rng.normal(0, 0.25)
        p.stroke(plane, [(x, y + rng.normal(0, 4)), (x + lean * hh * 0.4, y - hh * 0.5), (x + lean * hh, y - hh)],
                 rng.uniform(1.5, 2.8), ink=ink * rng.uniform(0.6, 1.0), dry=0.3, start=0.9, end=0.05)


def boat(p, plane, x, y, L, seed=None, ink=0.9, fisher=True, facing=1):
    """A small skiff with a hatted fisherman and his rod."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    f = facing
    hull = [(x - f * L * 0.5, y - L * 0.06), (x - f * L * 0.3, y + L * 0.035), (x, y + L * 0.055),
            (x + f * L * 0.32, y + L * 0.03), (x + f * L * 0.52, y - L * 0.075)]
    m = p.poly_mask(np.array(hull + [(x + f * L * 0.3, y - L * 0.005), (x - f * L * 0.3, y - L * 0.01)]))
    p.wash(tmp, m, 0.55, blur=0.8, mottle=0.2, mottle_scale=20)
    p.stroke(tmp, hull, max(2.0, L * 0.022), ink=ink, dry=0.3, start=0.6, end=0.3)
    p.stroke(tmp, [(x - f * L * 0.46, y - L * 0.055), (x, y - L * 0.012), (x + f * L * 0.48, y - L * 0.06)],
             max(1.3, L * 0.012), ink=ink * 0.8, dry=0.3)
    if fisher:
        fx, fy = x + f * L * 0.12, y - L * 0.02
        # body
        p.stroke(tmp, [(fx - f * L * 0.02, fy), (fx + f * L * 0.01, fy - L * 0.07), (fx + f * L * 0.03, fy - L * 0.11)],
                 max(2.5, L * 0.05), ink=ink * 0.9, dry=0.2, start=1.0, end=0.6)
        # hat
        hat = [(fx - f * L * 0.035, fy - L * 0.115), (fx + f * L * 0.03, fy - L * 0.155), (fx + f * L * 0.1, fy - L * 0.11)]
        p.stroke(tmp, hat, max(2.0, L * 0.03), ink=ink, dry=0.1, start=0.4, end=0.3)
        hm = p.poly_mask(np.array(hat))
        p.wash(tmp, hm, 0.8, blur=0.3, mottle=0)
        # rod and line
        rx, ry = fx + f * L * 0.06, fy - L * 0.08
        tip = (rx + f * L * 0.9, ry - L * 0.34)
        p.stroke(tmp, [(rx, ry), ((rx + tip[0]) / 2, (ry + tip[1]) / 2 + L * 0.015), tip], max(0.9, L * 0.007),
                 ink=ink * 0.8, dry=0.05, start=1.0, end=0.15, wobble=0.0)
        p.stroke(tmp, [tip, (tip[0] + f * L * 0.02, y + L * 0.02)], max(0.6, L * 0.004), ink=ink * 0.45, dry=0.0,
                 start=1.0, end=1.0)
    plane.over(tmp)


# ------------------------------------------------------------------- birds
def geese(p, plane, x, y, n=9, size=22, dx=-1, seed=None, ink=0.8, spread=1.0):
    rng = _rng(p, seed)
    for i in range(n):
        arm = 1 if i % 2 else -1
        k = (i + 1) // 2
        bx = x - dx * k * size * 2.4 * spread + rng.normal(0, size * 0.3)
        by = y + arm * k * size * 1.1 * spread + rng.normal(0, size * 0.35)
        s = size * rng.uniform(0.75, 1.1) * (1 - 0.03 * k)
        flap = rng.uniform(0.15, 0.6)
        p.stroke(plane, [(bx - s * 0.6, by - s * flap * 0.6), (bx - s * 0.25, by - s * flap * 0.1), (bx, by)],
                 max(1.2, s * 0.13), ink=ink, dry=0.15, start=0.3, end=0.9, cover=False)
        p.stroke(plane, [(bx, by), (bx + s * 0.28, by - s * flap * 0.15), (bx + s * 0.62, by - s * flap * 0.7)],
                 max(1.2, s * 0.13), ink=ink, dry=0.15, start=0.9, end=0.2, cover=False)


# ------------------------------------------------------------- sun / moon
def disc(p, x, y, r, soft=2.0, mottle=0.12):
    yy, xx = p.grid()
    d = np.hypot(xx - x * p.s, yy - y * p.s)
    a = 1.0 - smoothstep(r * p.s - soft * p.s, r * p.s + soft * p.s, d)
    if mottle:
        a = a * (1.0 - mottle * (0.5 + 0.5 * p.noise_full(r * 0.6, 3)))
    return np.clip(a, 0, 1).astype(np.float32)


# ------------------------------------------------------------- buildings
def pavilion(p, plane, x, y, w, seed=None, ink=0.9, kind="hall"):
    """A small hall or pavilion drawn in fine ruled lines (jiehua)."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    lw = max(1.2, w * 0.018)
    h = w * (0.42 if kind == "hall" else 0.55)
    # platform
    p.stroke(tmp, [(x - w * 0.55, y), (x + w * 0.55, y)], lw * 1.4, ink=ink, dry=0.1)
    # columns
    cols = 4 if kind == "hall" else 2
    for i in range(cols):
        cx = x - w * 0.4 + i * (w * 0.8 / max(cols - 1, 1))
        p.stroke(tmp, [(cx, y), (cx, y - h * 0.55)], lw, ink=ink * 0.9, dry=0.05, start=1, end=1)
    # railing
    p.stroke(tmp, [(x - w * 0.5, y - h * 0.16), (x + w * 0.5, y - h * 0.16)], lw * 0.8, ink=ink * 0.7, dry=0.1)
    # roof: upswept eaves
    ry = y - h * 0.55
    roof = [(x - w * 0.72, ry - h * 0.14), (x - w * 0.52, ry - h * 0.02), (x - w * 0.2, ry - h * 0.28),
            (x, ry - h * 0.45), (x + w * 0.2, ry - h * 0.28), (x + w * 0.52, ry - h * 0.02), (x + w * 0.72, ry - h * 0.14)]
    rm = p.poly_mask(np.array(roof + [(x + w * 0.5, ry + h * 0.02), (x - w * 0.5, ry + h * 0.02)]))
    p.wash(tmp, rm, 0.62, blur=0.6, mottle=0.15, mottle_scale=20)
    p.stroke(tmp, roof, lw * 1.5, ink=ink, dry=0.15, start=0.6, end=0.6)
    body = p.poly_mask(np.array([(x - w * 0.55, y + 2), (x + w * 0.55, y + 2), (x + w * 0.5, ry), (x - w * 0.5, ry)]))
    tmp.cover = np.maximum(tmp.cover, np.maximum(rm, body))
    plane.over(tmp)


def hut(p, plane, x, y, w, seed=None, ink=0.9, sitter=True):
    """A thatched hut, open at the front, with someone sitting inside."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    h = w * 0.55
    lw = max(1.2, w * 0.02)
    roof = [(x - w * 0.62, y - h * 0.5), (x - w * 0.1, y - h * 1.05), (x + w * 0.35, y - h * 0.95), (x + w * 0.66, y - h * 0.45)]
    rm = p.poly_mask(np.array(roof + [(x + w * 0.5, y - h * 0.5), (x - w * 0.5, y - h * 0.55)]))
    p.wash(tmp, rm, 0.3, blur=1.0, mottle=0.4, mottle_scale=30)
    for _ in range(int(w / 5)):
        t = rng.uniform(0, 1)
        a = np.array(roof[1]) * (1 - t) + np.array(roof[2]) * t
        b = np.array(roof[0]) * (1 - t) + np.array(roof[3]) * t
        p.stroke(tmp, [a, b], lw * 0.7, ink=ink * rng.uniform(0.35, 0.6), dry=0.5, cover=False)
    p.stroke(tmp, roof, lw * 1.6, ink=ink, dry=0.35, start=0.7, end=0.4)
    for cx in (x - w * 0.45, x + w * 0.45):
        p.stroke(tmp, [(cx, y), (cx, y - h * 0.52)], lw * 1.2, ink=ink, dry=0.2)
    p.stroke(tmp, [(x - w * 0.55, y), (x + w * 0.55, y)], lw * 1.3, ink=ink, dry=0.3)
    body = p.poly_mask(np.array([(x - w * 0.5, y + 2), (x + w * 0.5, y + 2), (x + w * 0.5, y - h * 0.55), (x - w * 0.5, y - h * 0.55)]))
    if sitter:
        sx, sy = x - w * 0.05, y - 2
        p.stroke(tmp, [(sx - w * 0.14, sy), (sx, sy - h * 0.05), (sx + w * 0.14, sy)], max(2, w * 0.05), ink=ink * 0.8, dry=0.2)
        p.stroke(tmp, [(sx, sy - h * 0.05), (sx - w * 0.01, sy - h * 0.28)], max(2, w * 0.06), ink=ink * 0.85, dry=0.15, start=1, end=0.7)
        p.dot(tmp, sx - w * 0.01, sy - h * 0.34, max(3, w * 0.06), ink=ink, elong=1.0)
    tmp.cover = np.maximum(tmp.cover, np.maximum(rm, body))
    plane.over(tmp)


# ------------------------------------------------------------- figures
def figure(p, plane, x, y, h, pose="stand", facing=1, ink=0.9, seed=None, staff=False):
    """A scholar in a long robe, a few strokes: standing, seated, or lying."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    f = facing
    lw = max(1.4, h * 0.05)
    if pose == "stand":
        head = (x + f * h * 0.05, y - h * 0.9)
        robe = [(x - f * h * 0.14, y), (x - f * h * 0.08, y - h * 0.45), (x + f * h * 0.02, y - h * 0.8)]
        robe2 = [(x + f * h * 0.02, y - h * 0.8), (x + f * h * 0.14, y - h * 0.45), (x + f * h * 0.16, y)]
        m = p.poly_mask(np.array(robe + robe2))
        p.wash(tmp, m, 0.25, blur=0.6, mottle=0.2, mottle_scale=10)
        p.stroke(tmp, robe, lw, ink=ink, dry=0.2, start=0.5, end=0.4)
        p.stroke(tmp, robe2, lw, ink=ink, dry=0.2, start=0.6, end=0.5)
        p.stroke(tmp, [(x - f * h * 0.14, y), (x + f * h * 0.16, y)], lw * 0.8, ink=ink, dry=0.2)
        # sleeve, hands folded forward
        p.stroke(tmp, [(x + f * h * 0.0, y - h * 0.72), (x + f * h * 0.14, y - h * 0.55), (x + f * h * 0.2, y - h * 0.5)],
                 lw * 1.1, ink=ink, dry=0.2)
        p.dot(tmp, head[0], head[1], h * 0.11, ink=ink, elong=1.1, angle=math.pi / 2)
        # topknot / hat
        p.dot(tmp, head[0] - f * h * 0.01, head[1] - h * 0.08, h * 0.06, ink=ink, elong=1.2)
        if staff:
            p.stroke(tmp, [(x + f * h * 0.28, y + h * 0.02), (x + f * h * 0.24, y - h * 1.05)], lw * 0.7, ink=ink, dry=0.1)
    elif pose == "sit":
        p.stroke(tmp, [(x - f * h * 0.3, y), (x, y - h * 0.08), (x + f * h * 0.3, y)], lw * 1.3, ink=ink, dry=0.2)
        body = [(x - f * h * 0.26, y), (x - f * h * 0.1, y - h * 0.45), (x + f * h * 0.1, y - h * 0.45), (x + f * h * 0.26, y)]
        m = p.poly_mask(np.array(body))
        p.wash(tmp, m, 0.3, blur=0.6, mottle=0.2, mottle_scale=10)
        p.stroke(tmp, body, lw, ink=ink, dry=0.2, start=0.6, end=0.6)
        p.dot(tmp, x, y - h * 0.56, h * 0.13, ink=ink, elong=1.1, angle=math.pi / 2)
        p.dot(tmp, x, y - h * 0.67, h * 0.07, ink=ink, elong=1.2)
    else:  # lying, head propped on an arm
        body = [(x - f * h * 0.5, y - h * 0.05), (x - f * h * 0.1, y - h * 0.16), (x + f * h * 0.35, y - h * 0.12),
                (x + f * h * 0.55, y - h * 0.02)]
        p.stroke(tmp, body, lw * 2.2, ink=ink * 0.75, dry=0.15, start=0.8, end=0.4)
        p.stroke(tmp, [(x - f * h * 0.5, y), (x + f * h * 0.55, y + h * 0.01)], lw, ink=ink, dry=0.2)
        p.dot(tmp, x - f * h * 0.6, y - h * 0.14, h * 0.12, ink=ink, elong=1.1)
        p.stroke(tmp, [(x - f * h * 0.6, y - h * 0.05), (x - f * h * 0.48, y - h * 0.22)], lw * 0.9, ink=ink, dry=0.2)
    tmp.cover = np.clip(tmp.cover * 1.5, 0, 1)
    plane.over(tmp)


def ox_rider(p, plane, x, y, s, facing=1, ink=0.9, seed=None):
    """Laozi riding his water buffalo: the ox walking, the old man seated."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    f = facing
    # body of the ox
    body = [(x - f * s * 0.5, y - s * 0.42), (x - f * s * 0.2, y - s * 0.52), (x + f * s * 0.25, y - s * 0.5),
            (x + f * s * 0.48, y - s * 0.4), (x + f * s * 0.45, y - s * 0.2), (x - f * s * 0.45, y - s * 0.2)]
    m = p.poly_mask(p.smooth_poly(np.array(body), 2.0))
    p.wash(tmp, m, 0.55, blur=1.0, mottle=0.3, mottle_scale=20)
    p.stroke(tmp, [body[0], body[1], body[2], body[3]], max(2, s * 0.03), ink=ink, dry=0.3)
    p.stroke(tmp, [(x - f * s * 0.45, y - s * 0.22), (x + f * s * 0.4, y - s * 0.22)], max(1.5, s * 0.022), ink=ink, dry=0.3)
    # head, lowered, and the sweeping horns
    hx, hy = x + f * s * 0.62, y - s * 0.34
    p.stroke(tmp, [(x + f * s * 0.45, y - s * 0.42), (hx, hy), (x + f * s * 0.7, y - s * 0.22)], s * 0.12,
             ink=ink * 0.9, dry=0.2, start=1.0, end=0.5)
    p.stroke(tmp, [(hx - f * s * 0.04, hy - s * 0.06), (hx - f * s * 0.14, hy - s * 0.16), (hx - f * s * 0.05, hy - s * 0.22)],
             max(1.5, s * 0.022), ink=ink, dry=0.2, start=1.0, end=0.1)
    p.stroke(tmp, [(hx + f * s * 0.02, hy - s * 0.06), (hx + f * s * 0.12, hy - s * 0.15), (hx + f * s * 0.2, hy - s * 0.12)],
             max(1.5, s * 0.022), ink=ink, dry=0.2, start=1.0, end=0.1)
    # legs mid-stride
    for lx, d in ((-0.36, 0.06), (-0.22, -0.05), (0.26, 0.05), (0.38, -0.06)):
        top = (x + f * s * lx, y - s * 0.24)
        p.stroke(tmp, [top, (top[0] + f * s * d, y - s * 0.1), (top[0] + f * s * d * 0.5, y)], max(2, s * 0.045),
                 ink=ink, dry=0.25, start=1.0, end=0.6)
    # tail
    p.stroke(tmp, [(x - f * s * 0.48, y - s * 0.4), (x - f * s * 0.56, y - s * 0.28), (x - f * s * 0.54, y - s * 0.16)],
             max(1.2, s * 0.015), ink=ink, dry=0.2)
    # rider: robe draped over the back, head bowed, long beard
    rx, ry = x - f * s * 0.05, y - s * 0.5
    robe = [(rx - f * s * 0.2, ry + s * 0.12), (rx - f * s * 0.14, ry - s * 0.22), (rx + f * s * 0.04, ry - s * 0.36),
            (rx + f * s * 0.14, ry - s * 0.2), (rx + f * s * 0.2, ry + s * 0.14)]
    rm = p.poly_mask(p.smooth_poly(np.array(robe), 2.0))
    p.erase_behind(tmp, rm)
    p.wash(tmp, rm, 0.12, blur=0.8, mottle=0.3, mottle_scale=12)
    p.stroke(tmp, robe[:3], max(1.6, s * 0.022), ink=ink, dry=0.25, start=0.8, end=0.5)
    p.stroke(tmp, robe[2:], max(1.6, s * 0.022), ink=ink, dry=0.25, start=0.8, end=0.5)
    p.stroke(tmp, [(rx - f * s * 0.02, ry - s * 0.2), (rx + f * s * 0.12, ry - s * 0.08), (rx + f * s * 0.18, ry)],
             max(1.6, s * 0.03), ink=ink, dry=0.25)
    head = (rx + f * s * 0.07, ry - s * 0.42)
    p.dot(tmp, head[0], head[1], s * 0.075, ink=ink * 0.9, elong=1.1, angle=math.pi / 2)
    p.stroke(tmp, [(head[0] + f * s * 0.03, head[1] + s * 0.03), (head[0] + f * s * 0.05, head[1] + s * 0.14)],
             max(1.2, s * 0.02), ink=ink * 0.5, dry=0.3)
    tmp.cover = np.maximum(tmp.cover, m)
    plane.over(tmp)


def butterfly(p, plane, x, y, s, ink=0.85, seed=None):
    rng = _rng(p, seed)
    a = rng.normal(0, 0.3)
    for sg in (-1, 1):
        p.dot(plane, x + sg * s * 0.28, y - s * 0.12, s * 0.42, ink=ink, angle=a + sg * 0.6, elong=1.3)
        p.dot(plane, x + sg * s * 0.2, y + s * 0.18, s * 0.28, ink=ink * 0.8, angle=a - sg * 0.5, elong=1.2)
    p.stroke(plane, [(x, y - s * 0.2), (x, y + s * 0.25)], max(1.0, s * 0.08), ink=ink, dry=0.1, cover=False)


def crane(p, plane, x, y, s, facing=1, ink=0.85, seed=None):
    """A flying crane: neck stretched forward, legs trailing, wings in a V."""
    rng = _rng(p, seed)
    f = facing
    tmp = Plane(p.H, p.W)
    lw = max(1.2, s * 0.02)
    # body: an outlined pale spindle
    body = [(x - f * s * 0.22, y + s * 0.03), (x, y - s * 0.05), (x + f * s * 0.22, y - s * 0.02),
            (x, y + s * 0.07), (x - f * s * 0.22, y + s * 0.03)]
    p.stroke(tmp, body, lw, ink=ink * 0.8, dry=0.1, start=0.8, end=0.8)
    # neck and head, black neck, red crown left to the imagination
    p.stroke(tmp, [(x + f * s * 0.2, y - s * 0.02), (x + f * s * 0.42, y - s * 0.07), (x + f * s * 0.62, y - s * 0.09)],
             max(1.4, s * 0.035), ink=ink, dry=0.1, start=1.0, end=0.8)
    p.dot(tmp, x + f * s * 0.64, y - s * 0.095, s * 0.045, ink=ink, elong=1.3, angle=0)
    p.stroke(tmp, [(x + f * s * 0.66, y - s * 0.095), (x + f * s * 0.78, y - s * 0.08)], max(1, s * 0.015), ink=ink, dry=0.1)
    # legs trailing behind
    for dy in (0.0, 0.025):
        p.stroke(tmp, [(x - f * s * 0.2, y + s * 0.04), (x - f * s * 0.62, y + s * (0.09 + dy))], max(1, s * 0.012),
                 ink=ink, dry=0.1, start=1, end=1)
    # wings raised in a V: pale inner feathers outlined, black primaries
    up = rng.uniform(0.45, 0.75)
    for sg, k in ((1, 1.0), (1, 0.82)):
        root = (x - f * s * 0.02 * k, y - s * 0.03)
        tip = (x - f * s * (0.28 if k == 1 else 0.05), y - s * 0.62 * up * k)
        mid = ((root[0] + tip[0]) / 2 + f * s * 0.08, (root[1] + tip[1]) / 2)
        p.stroke(tmp, [root, mid, tip], lw * 1.1, ink=ink * 0.7, dry=0.1)
        p.stroke(tmp, [(mid[0] - f * s * 0.02, mid[1]), (tip[0] - f * s * 0.02, tip[1] + s * 0.02)], s * 0.08 * k,
                 ink=ink, dry=0.35, start=0.6, end=0.2)
    plane.over(tmp)


# ------------------------------------------------------------- structures
def gate(p, plane, x, y, w, ink=0.92, seed=None):
    """The pass: a battlemented wall with an arched gateway and a tower on top."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    h = w * 0.5
    lw = max(1.4, w * 0.012)
    wall = np.array([(x - w * 0.5, y), (x - w * 0.47, y - h), (x + w * 0.47, y - h), (x + w * 0.5, y)])
    wm = p.poly_mask(wall)
    p.wash(tmp, wm, 0.2, blur=1.0, mottle=0.5, mottle_scale=30)
    for q in (wall[:2], wall[1:3], wall[2:]):
        p.stroke(tmp, q, lw * 1.6, ink=ink, dry=0.35)
    # courses of stone
    for i in range(1, 6):
        yy = y - h * i / 6
        p.stroke(tmp, [(x - w * 0.48, yy), (x + w * 0.48, yy + rng.normal(0, 1))], lw * 0.6, ink=ink * 0.35, dry=0.6, cover=False)
    # arch
    ah, aw = h * 0.62, w * 0.16
    arch = [(x - aw / 2, y)] + [(x + math.cos(t) * aw / 2, y - ah + aw / 2 - math.sin(t) * aw / 2 * 1.1)
                               for t in np.linspace(math.pi, 0, 12)] + [(x + aw / 2, y)]
    am = p.poly_mask(np.array(arch))
    p.wash(tmp, am, 0.75, blur=1.0, mottle=0.2, mottle_scale=20)
    p.stroke(tmp, arch, lw * 1.2, ink=ink, dry=0.2)
    # tower: two storeys under upswept roofs
    tw = w * 0.42
    ty = y - h
    for k, (bw, bh) in enumerate(((tw, h * 0.34), (tw * 0.7, h * 0.28))):
        body = np.array([(x - bw / 2, ty), (x - bw / 2, ty - bh), (x + bw / 2, ty - bh), (x + bw / 2, ty)])
        bm = p.poly_mask(body)
        p.erase_behind(tmp, bm)
        p.stroke(tmp, body[:2], lw, ink=ink, dry=0.1)
        p.stroke(tmp, body[2:], lw, ink=ink, dry=0.1)
        for i in range(1, 4):
            cx = x - bw / 2 + bw * i / 4
            p.stroke(tmp, [(cx, ty), (cx, ty - bh)], lw * 0.7, ink=ink * 0.7, dry=0.1)
        ry = ty - bh
        rw = bw * 1.35
        roof = [(x - rw / 2 - rw * 0.06, ry - bh * 0.18), (x - rw / 2 + rw * 0.08, ry), (x - rw * 0.2, ry - bh * 0.3),
                (x, ry - bh * (0.45 if k else 0.35)), (x + rw * 0.2, ry - bh * 0.3), (x + rw / 2 - rw * 0.08, ry),
                (x + rw / 2 + rw * 0.06, ry - bh * 0.18)]
        rm = p.poly_mask(np.array(roof + [(x + rw / 2 - rw * 0.08, ry + bh * 0.05), (x - rw / 2 + rw * 0.08, ry + bh * 0.05)]))
        p.erase_behind(tmp, rm)
        p.wash(tmp, rm, 0.65, blur=0.6, mottle=0.2, mottle_scale=20)
        p.stroke(tmp, roof, lw * 1.5, ink=ink, dry=0.2, start=0.8, end=0.8)
        ty = ry - bh * 0.12
    tmp.cover = np.maximum(tmp.cover, wm)
    plane.over(tmp)
    return wm


def path_line(p, plane, pts, width=14, ink=0.5, seed=None):
    """A mountain path: two faint edges with a few steps."""
    rng = _rng(p, seed)
    P = np.asarray(pts, np.float64)
    from ink import catmull_rom
    C, _ = catmull_rom(P, 3.0)
    d = np.gradient(C, axis=0)
    dn = np.hypot(d[:, 0], d[:, 1]) + 1e-9
    nrm = np.stack([-d[:, 1] / dn, d[:, 0] / dn], 1)
    wv = width * (0.6 + 0.4 * np.linspace(1, 0.5, len(C)))
    for sg in (-1, 1):
        edge = C + nrm * (sg * wv / 2)[:, None]
        i = 0
        while i < len(edge) - 3:
            j = min(len(edge) - 1, i + int(rng.uniform(40, 140)))
            p.stroke(plane, edge[i:j:6], 1.8, ink=ink * rng.uniform(0.6, 1), dry=0.5, cover=False)
            i = j + int(rng.uniform(5, 30))
    # erase inside so the path reads as a pale band
    band = np.vstack([C + nrm * (wv / 2)[:, None], (C - nrm * (wv / 2)[:, None])[::-1]])
    m = p.poly_mask(band, feather=1.5)
    plane.ink *= (1 - 0.8 * m)


def waterfall(p, plane, x, y0, y1, w, seed=None, mist=True):
    """Carve a waterfall out of the rock: the paper itself is the water."""
    rng = _rng(p, seed)
    n = 30
    ys = np.linspace(y0, y1, n)
    xs = x + p.line_noise(n, 8, 2, 0.5, rng) * w * 0.25
    wd = w * (0.8 + 0.4 * np.linspace(0, 1, n))
    poly = [(xs[i] - wd[i] / 2, ys[i]) for i in range(n)] + [(xs[i] + wd[i] / 2, ys[i]) for i in range(n - 1, -1, -1)]
    m = p.poly_mask(np.array(poly), feather=2.5)
    plane.ink *= (1 - m)
    plane.cover = np.maximum(plane.cover, m)
    for _ in range(int(w / 5)):
        xx0 = x + rng.uniform(-0.35, 0.35) * w
        a = rng.uniform(y0, y1 - (y1 - y0) * 0.2)
        b = a + rng.uniform(0.15, 0.5) * (y1 - y0)
        pts = [(xx0 + np.interp(t, ys, xs) - x, t) for t in np.linspace(a, min(b, y1), 6)]
        p.stroke(plane, pts, rng.uniform(1.2, 2.2), ink=rng.uniform(0.12, 0.3), dry=0.6, cover=False)
    if mist:
        yy, xx_ = p.grid()
        d = np.hypot((xx_ - x * p.s) / (w * 2.6 * p.s), (yy - y1 * p.s) / (w * 1.2 * p.s))
        mm = np.exp(-d ** 2 * 1.5).astype(np.float32)
        plane.ink *= (1 - mm)
        plane.cover = np.maximum(plane.cover, mm)


def bridge(p, plane, x0, x1, y, ink=0.9, seed=None):
    """A plank bridge on two trestles."""
    tmp = Plane(p.H, p.W)
    L = x1 - x0
    lw = max(1.5, L * 0.012)
    p.stroke(tmp, [(x0, y), ((x0 + x1) / 2, y - L * 0.03), (x1, y)], lw * 2, ink=ink, dry=0.3)
    p.stroke(tmp, [(x0, y + lw * 2.5), ((x0 + x1) / 2, y - L * 0.03 + lw * 2.5), (x1, y + lw * 2.5)], lw, ink=ink * 0.7, dry=0.3)
    for t in (0.33, 0.66):
        cx = x0 + L * t
        p.stroke(tmp, [(cx - L * 0.03, y + L * 0.12), (cx, y - L * 0.02)], lw, ink=ink, dry=0.3)
        p.stroke(tmp, [(cx + L * 0.03, y + L * 0.12), (cx, y - L * 0.02)], lw, ink=ink, dry=0.3)
    plane.over(tmp)


def old_tree(p, plane, x, y, h, lean=0.1, seed=None, ink=0.92, crown=1.0, foliage=0.7, width=1.0):
    """An ancient broad tree: a gnarled, hollowed trunk and a sprawling crown."""
    from ink import catmull_rom
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    w0 = h * 0.16 * width
    shape = [(0, 0), (0.05, -0.12), (0.02, -0.25), (0.1, -0.36), (0.14, -0.44)]
    pts = [(x + (fx + lean * -fy) * h + rng.normal(0, h * 0.01), y + fy * h) for fx, fy in shape]
    C, _ = catmull_rom(np.array(pts), 2.0)
    n = len(C)
    f = np.linspace(0, 1, n)
    tw = w0 * (1 - 0.45 * f) * (1 + 0.45 * np.exp(-f / 0.07)) * (1 + 0.12 * p.line_noise(n, n / 4, 2, 0.5, rng))
    d = np.gradient(C, axis=0)
    dn = np.hypot(d[:, 0], d[:, 1]) + 1e-9
    nx, ny = -d[:, 1] / dn, d[:, 0] / dn
    Lft = C + np.stack([nx, ny], 1) * tw[:, None] / 2
    Rgt = C - np.stack([nx, ny], 1) * tw[:, None] / 2
    tmask = p.poly_mask(np.vstack([Lft, Rgt[::-1]]))
    p.wash(tmp, tmask, 0.3, blur=2.0, mottle=0.6, mottle_scale=60)
    # bark: long twisting grain lines and knot-holes
    for _ in range(int(9 * width)):
        o = rng.uniform(-0.4, 0.4)
        k0 = rng.integers(0, int(n * 0.4))
        k1 = min(n - 1, k0 + int(rng.uniform(0.3, 0.7) * n))
        seg = C[k0:k1:max(1, (k1 - k0) // 8)] + np.stack([nx, ny], 1)[k0:k1:max(1, (k1 - k0) // 8)] * \
            (o * tw[k0:k1:max(1, (k1 - k0) // 8)])[:, None]
        if len(seg) >= 2:
            p.stroke(tmp, seg, rng.uniform(2, 4.5) * width, ink=rng.uniform(0.45, 0.8), dry=0.6, wobble=0.3)
    for _ in range(3):
        k = rng.integers(int(n * 0.15), int(n * 0.8))
        c = C[k] + np.array([nx[k], ny[k]]) * rng.uniform(-0.2, 0.2) * tw[k]
        r = tw[k] * rng.uniform(0.1, 0.18)
        ring = [(c[0] + math.cos(t) * r, c[1] + math.sin(t) * r * 1.4) for t in np.linspace(0, 2 * math.pi, 9)]
        p.stroke(tmp, ring, max(2, r * 0.35), ink=0.9, dry=0.3)
        p.dot(tmp, c[0], c[1], r * 0.9, ink=0.8, elong=1.3, angle=math.pi / 2)
    for edge in (Lft, Rgt):
        i = 0
        while i < n - 4:
            j = min(n - 1, i + int(rng.uniform(0.25, 0.5) * n))
            p.stroke(tmp, edge[i:j + 1:max(1, (j - i) // 12)], max(3, w0 * 0.1), ink=ink, dry=0.55, start=0.9,
                     end=0.4, wobble=0.35)
            i = j + int(rng.uniform(0.0, 0.04) * n)
    # roots
    for sg in (-1, -1, 1, 1, 0):
        r0 = C[0] + np.array([sg * w0 * 0.3, 0])
        L = w0 * rng.uniform(0.7, 1.5)
        p.stroke(tmp, [r0, r0 + (sg * L * 0.5 + rng.normal(0, 5), w0 * 0.08), r0 + (sg * L, w0 * rng.uniform(0.1, 0.25))],
                 w0 * 0.22, ink=ink, dry=0.6, start=1.0, end=0.1, taper_out=0.6)
    tmp.cover = np.maximum(tmp.cover, tmask)
    plane.over(tmp)
    # crown: a few heavy limbs, thin crab-claw twigs, clumps of leaf dots
    top = C[-1]
    crown_tmp = Plane(p.H, p.W)
    nl = int(3 + 2 * crown)
    ends = []
    for i in range(nl):
        ang = -math.pi / 2 + (i / max(nl - 1, 1) - 0.5) * 2.3 + rng.normal(0, 0.12)
        L = h * rng.uniform(0.26, 0.4)
        a2 = ang + rng.normal(0, 0.35)
        p1 = top + np.array([math.cos(ang), math.sin(ang)]) * L * 0.45 + rng.normal(0, h * 0.01, 2)
        p2 = p1 + np.array([math.cos(a2), math.sin(a2)]) * L * 0.55
        p.stroke(crown_tmp, [top, p1, p2], w0 * rng.uniform(0.34, 0.48), ink=ink, dry=0.6, start=1.0, end=0.3,
                 taper_in=0.02, taper_out=0.65, wobble=0.3)
        for q, a in ((p1, ang), (p2, a2)):
            bare_tree(p, crown_tmp, q[0], q[1], h * rng.uniform(0.22, 0.32), lean=a + math.pi / 2 + rng.normal(0, 0.2),
                      spread=0.9, width=0.8 * width, seed=int(rng.integers(1 << 30)), ink=ink, depth=4, leaves=0, claw=True)
        ends.append(p2)
        ends.append((p1 + p2) / 2)
    plane.over(crown_tmp)
    if foliage > 0:
        leaf = Plane(p.H, p.W)
        for e in ends:
            for _ in range(int(1 + 2 * foliage)):
                c = e + rng.normal(0, h * 0.06, 2)
                leaf_clump(p, leaf, c[0], c[1], h * rng.uniform(0.07, 0.12), int(40 * foliage), ink, rng)
        plane.over(leaf)


def leaf_clump(p, plane, cx, cy, r, n, ink, rng):
    """A clump of leaf marks, darker underneath where the clump shades itself."""
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        d = r * math.sqrt(rng.random())
        x, y = cx + math.cos(a) * d * 1.25, cy + math.sin(a) * d * 0.8
        shade = 0.55 + 0.45 * np.clip((y - cy) / r + 0.3, 0, 1)
        if rng.random() < 0.5:
            # "jie" mark: two short strokes like a little roof
            s = r * rng.uniform(0.12, 0.2)
            p.stroke(plane, [(x, y - s * 0.4), (x - s * 0.6, y + s * 0.5)], s * 0.5, ink=ink * shade * rng.uniform(0.6, 0.95),
                     dry=0.2, start=1.0, end=0.2)
            p.stroke(plane, [(x + s * 0.1, y - s * 0.4), (x + s * 0.7, y + s * 0.4)], s * 0.5, ink=ink * shade * rng.uniform(0.6, 0.95),
                     dry=0.2, start=1.0, end=0.2)
        else:
            p.dot(plane, x, y, r * rng.uniform(0.1, 0.17), ink=ink * shade * rng.uniform(0.45, 0.9),
                  angle=rng.normal(0, 0.35), elong=rng.uniform(1.3, 2.0))


def willow(p, plane, x, y, h, lean=0.1, seed=None, ink=0.9, width=1.0):
    """A riverside willow: short gnarled trunk, long whips hanging down."""
    from ink import catmull_rom
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    w0 = h * 0.07 * width
    pts = [(x, y), (x + lean * h * 0.1, y - h * 0.18), (x + lean * h * 0.2 + rng.normal(0, h * 0.02), y - h * 0.34),
           (x + lean * h * 0.26, y - h * 0.45)]
    p.stroke(tmp, pts, w0, ink=ink, dry=0.6, start=1.0, end=0.55, taper_in=0.02, taper_out=0.4, wobble=0.3)
    top = np.array(pts[-1])
    crowns = []
    for i in range(int(rng.integers(4, 7))):
        ang = -math.pi / 2 + rng.uniform(-1.0, 1.0)
        L = h * rng.uniform(0.15, 0.28)
        end = top + np.array([math.cos(ang), math.sin(ang)]) * L
        mid = (top + end) / 2 + rng.normal(0, h * 0.02, 2)
        p.stroke(tmp, [top, mid, end], w0 * 0.35, ink=ink, dry=0.5, start=1.0, end=0.2)
        crowns.append(end)
    # hanging whips
    for c in crowns:
        for _ in range(int(rng.integers(6, 11))):
            sx = c[0] + rng.normal(0, h * 0.06)
            sy = c[1] + rng.normal(0, h * 0.03)
            L = h * rng.uniform(0.3, 0.62)
            out = 1.0 if sx >= top[0] else -1.0
            drift = out * rng.uniform(0.18, 0.4) * L
            whip = [(sx, sy), (sx + drift * 0.45, sy - L * 0.1), (sx + drift * 0.85, sy + L * 0.3), (sx + drift, sy + L)]
            p.stroke(tmp, whip, max(1.0, h * 0.0035), ink=ink * rng.uniform(0.45, 0.8), dry=0.25, start=1.0, end=0.05,
                     taper_in=0.02, taper_out=0.6, wobble=0.05, cover=False)
            for t in np.linspace(0.3, 0.95, int(rng.integers(3, 7))):
                qx = sx + drift * t
                qy = sy + L * t
                p.dot(tmp, qx + rng.normal(0, 3), qy, rng.uniform(3, 6) * width, ink=ink * rng.uniform(0.3, 0.6),
                      angle=math.pi / 2 + rng.normal(0, 0.4), elong=2.4)
    plane.over(tmp)


def sailboat(p, plane, x, y, L, seed=None, ink=0.85, facing=-1):
    """A river junk with a battened lug sail."""
    rng = _rng(p, seed)
    tmp = Plane(p.H, p.W)
    f = facing
    hull = [(x - f * L * 0.5, y - L * 0.08), (x - f * L * 0.25, y + L * 0.03), (x + f * L * 0.3, y + L * 0.03),
            (x + f * L * 0.52, y - L * 0.1)]
    hm = p.poly_mask(np.array(hull + [(x + f * L * 0.3, y - L * 0.03), (x - f * L * 0.3, y - L * 0.03)]))
    p.wash(tmp, hm, 0.6, blur=0.6, mottle=0.2, mottle_scale=20)
    p.stroke(tmp, hull, max(1.6, L * 0.018), ink=ink, dry=0.3)
    mx = x + f * L * 0.02
    p.stroke(tmp, [(mx, y - L * 0.02), (mx, y - L * 1.05)], max(1.2, L * 0.01), ink=ink, dry=0.1)
    sail = [(mx - f * L * 0.02, y - L * 1.0), (mx - f * L * 0.42, y - L * 0.92), (mx - f * L * 0.46, y - L * 0.18),
            (mx - f * L * 0.02, y - L * 0.14)]
    sm = p.poly_mask(np.array(sail))
    p.wash(tmp, sm, 0.18, blur=0.8, mottle=0.4, mottle_scale=30)
    p.stroke(tmp, sail + [sail[0]], max(1.2, L * 0.01), ink=ink * 0.8, dry=0.3)
    for t in np.linspace(0.15, 0.9, 6):
        a = np.array(sail[0]) * (1 - t) + np.array(sail[3]) * t
        b = np.array(sail[1]) * (1 - t) + np.array(sail[2]) * t
        p.stroke(tmp, [a, b], max(1.0, L * 0.007), ink=ink * 0.6, dry=0.2, cover=False)
    tmp.cover = np.maximum(tmp.cover, np.maximum(hm, sm * 0.9))
    plane.over(tmp)
