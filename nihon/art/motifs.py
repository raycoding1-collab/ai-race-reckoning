"""Motifs in the manner of ukiyo-e landscape prints: skies graded from the top,
bands of cloud, the sea in lines, breaking waves, islands and pines,
mountains, buildings, boats and small figures.

All coordinates are in 3840 x 2160 reference units.
"""
import math

import numpy as np

from hanga import catmull_rom, smoothstep


# ------------------------------------------------------------------ sky
def sky(P, pl, horizon, top_col="sky_top", low_col="sky_low", glow=None, glow_at=None):
    """Sky with ichimonji bokashi: a strong band of colour at the top of the
    sheet, fading down; an optional warm glow at the horizon."""
    full = P.full()
    P.cover(pl, full)
    P.block(pl, (P.band(0, horizon + 40)[0], full[1]), low_col, alpha=0.55,
            bokashi=P.vgrad(horizon * 0.2, horizon, 0.25, 1.0), grain=0.12, pool=0)
    P.block(pl, full, top_col, alpha=1.0, bokashi=P.vgrad(0, horizon * (0.62 if P.night else 0.42), 1.0, 0.0),
            grain=0.3, pool=0)
    if P.night:
        P.block(pl, (P.band(0, horizon + 40)[0], full[1]), top_col, alpha=0.55,
                bokashi=P.vgrad(horizon * 0.3, horizon, 1.0, 0.35), grain=0.2, pool=0)
    if glow:
        gx, gy = glow_at
        P.block(pl, (P.band(0, horizon + 20)[0], full[1]), glow, alpha=0.8,
                bokashi=lambda X, Y: (1 - smoothstep(0, 1, np.hypot((X - gx) / 1500, (Y - gy) / 520))),
                grain=0.1, pool=0)


def disc(P, pl, cx, cy, r, color, alpha=1.0, halo=None, light=False):
    """A sun or moon. A light disc on a dark sky is carved out of the sky block
    (left as paper) and then printed in its own colour."""
    t = np.linspace(0, 2 * np.pi, 180, endpoint=False)
    pts = np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], 1)
    if halo:
        R = r * 3.2
        m = P.mask(np.stack([cx + R * np.cos(t), cy + R * np.sin(t)], 1))
        if light:
            a = m[0] * (1 - smoothstep(r, R, np.hypot(P.X[m[1][0]:m[1][1], m[1][2]:m[1][3]] - cx,
                                                        P.Y[m[1][0]:m[1][1], m[1][2]:m[1][3]] - cy))) * 0.45
            P.uncover(pl, (a, m[1]))
            P.cover(pl, m)
        else:
            P.block(pl, m, halo, alpha=0.5, bokashi=P.rgrad(cx, cy, r, R, 1.0, 0.0), grain=0.05, pool=0, cover=False)
    m = P.mask(pts)
    if light:
        P.uncover(pl, m)
        P.cover(pl, m)
    P.block(pl, m, color, alpha=alpha, grain=0.08, pool=0.05, mottle=0.03, knock=True)
    return pts


def stars(P, pl, n, y_max, seed=3):
    rng = np.random.default_rng(seed)
    dots = []
    for _ in range(n):
        x, y = rng.uniform(0, 3840), rng.uniform(0, y_max) ** 1.0
        r = rng.uniform(2.5, 5.5)
        t = np.linspace(0, 2 * np.pi, 10, endpoint=False)
        dots.append(np.stack([x + r * np.cos(t), y + r * np.sin(t)], 1))
    m = P.mask(dots)
    P.uncover(pl, (m[0] * 0.75, m[1]))


def cloud_band(P, pl, x0, x1, y, h, color="kasumi", alpha=0.9, outline=False, lobes=0, seed=0, fade="both"):
    """Suyari-gasumi: a long band of mist with rounded ends, printed flat with a
    soft bokashi toward its lower edge. `lobes` adds scalloped bumps on top."""
    rng = np.random.default_rng(seed)
    r = h / 2
    top = []
    xs = np.linspace(x0 + r, x1 - r, max(2, lobes + 2))
    for i, x in enumerate(xs):
        top.append((x, y - r - (rng.uniform(0.1, 0.5) * h if lobes and 0 < i < len(xs) - 1 else 0)))
    t = np.linspace(-np.pi / 2, np.pi / 2, 24)
    right = np.stack([x1 - r + r * np.cos(t), y + r * np.sin(t)], 1)
    left = np.stack([x0 + r - r * np.cos(t[::-1]), y + r * np.sin(-t[::-1] + 0)], 1)
    left = np.stack([x0 + r - r * np.cos(t), y - r * np.sin(t)], 1)
    bottom = [(x1 - r, y + r), (x0 + r, y + r)]
    pts = np.vstack([catmull_rom(np.array(top), 20), right, bottom, left])
    m = P.mask(pts)
    if P.night:
        alpha = 1.0
    bok = P.vgrad(y - r, y + r, 1.0, 0.55)
    if fade == "right":
        bok0 = bok
        bok = lambda X, Y: bok0(X, Y) * (1 - smoothstep(x1 - (x1 - x0) * 0.4, x1, X) * 0.9)
    P.block(pl, m, color, alpha=alpha, bokashi=bok, grain=0.15, pool=0.1, knock=True)
    if outline:
        P.outline(pl, pts, 3.2, color="key_soft", alpha=0.7)
    return pts


# ------------------------------------------------------------------ water
def sea(P, pl, horizon, bottom=2160, near="sea", far="sea_far", lines=True, line_col="sea_line", seed=0,
        moon_path=None, line_gap=26.0):
    """Sea printed in two blocks graded toward the horizon, with the key
    block's even horizontal water lines, closer together in the distance."""
    rng = np.random.default_rng(seed)
    m = P.band(horizon, bottom)
    P.cover(pl, m)
    P.block(pl, m, far, alpha=0.9, bokashi=P.vgrad(horizon, horizon + 260, 1.0, 0.5), grain=0.25, pool=0)
    P.block(pl, m, near, alpha=1.0, bokashi=P.vgrad(horizon + 60, bottom, 0.1, 1.0), grain=0.35, pool=0)
    if lines:
        ls = []
        y = horizon + 8
        gap = 7.0
        while y < bottom:
            x = rng.uniform(-200, 100)
            while x < 3840:
                L = rng.uniform(180, 900) * (0.4 + (y - horizon) / 1200)
                seg = []
                for k in range(8):
                    xx = x + L * k / 7
                    seg.append((xx, y + 2.0 * math.sin(xx / 90 + y)))
                ls.append(seg)
                x += L + rng.uniform(60, 400)
            y += gap
            gap = min(line_gap * 3, gap * 1.13 + 0.6)
        w = 2.4
        P.strokes(pl, ls, w, color=line_col, alpha=0.55)
    if moon_path:
        cx, w0 = moon_path
        seg = []
        y = horizon + 6
        while y < bottom:
            spread = w0 * (0.35 + 1.6 * (y - horizon) / (bottom - horizon))
            for _ in range(int(2 + spread / 40)):
                xx = cx + rng.normal(0, spread * 0.45)
                L = rng.uniform(20, 110) * (0.4 + (y - horizon) / 900)
                seg.append([(xx - L / 2, y), (xx + L / 2, y)])
            y += 9 + (y - horizon) * 0.03
        m = P.mask([P.path(np.array(s), closed=False) for s in seg], stroke=4.5)
        P.uncover(pl, (m[0] * 0.85, m[1]))


# a breaking wave curling to the left, in unit coordinates (u right, v down)
_WAVE_BACK = [(1.00, 1.00), (0.97, 0.80), (0.90, 0.56), (0.79, 0.32), (0.66, 0.14), (0.52, 0.05), (0.39, 0.03)]
_WAVE_LIP = [(0.30, 0.06), (0.22, 0.13), (0.165, 0.23), (0.15, 0.33), (0.175, 0.41)]
_WAVE_UNDER = [(0.225, 0.40), (0.26, 0.345), (0.30, 0.35)]
_WAVE_FACE = [(0.33, 0.45), (0.33, 0.59), (0.29, 0.75), (0.20, 0.90), (0.06, 1.00)]


def wave_crest(P, pl, x0, y0, width, height, flip=False, color="wave", seed=0, claws=True, lines=True):
    """A breaking wave in the manner of Hokusai: a blue body rising from the
    right, its lip curling over to the left, edged with claws of white foam.
    (x0, y0) is the top left of its box."""
    rng = np.random.default_rng(seed)

    def to(pts):
        a = np.asarray(pts, float)
        u = 1 - a[:, 0] if flip else a[:, 0]
        return np.stack([x0 + u * width, y0 + a[:, 1] * height], 1)

    outline = catmull_rom(to(_WAVE_BACK + _WAVE_LIP + _WAVE_UNDER + _WAVE_FACE), 5)
    body = np.vstack([outline, to([(0.0, 1.05), (1.0, 1.05)])])
    m = P.mask(body)
    P.block(pl, m, color, alpha=1.0, bokashi=lambda X, Y: 0.55 + 0.45 * smoothstep(y0, y0 + height, Y), grain=0.3, pool=0.15,
            knock=True)
    # lighter water just under the foam, and the dark hollow under the curl
    P.block(pl, m, "wave_light", alpha=0.75, bokashi=lambda X, Y: 1 - smoothstep(y0, y0 + height * 0.45, Y),
            grain=0.2, pool=0, cover=False)
    hx, hy = to([(0.27, 0.52)])[0]
    P.block(pl, m, "wave_line", alpha=0.55, bokashi=P.rgrad(hx, hy, 0, height * 0.35, 1, 0, sy=1.6), grain=0.2,
            pool=0, cover=False)
    if lines:
        # flow lines following the back of the wave
        flows = []
        back = catmull_rom(to(_WAVE_BACK), 5)
        for k in range(1, 12):
            f = k / 12
            off = np.array([(-1 if not flip else 1) * width * 0.05 * k, height * 0.035 * k])
            seg = back[int(len(back) * 0.05 * k):] + off
            seg = seg[(seg[:, 1] < y0 + height) & ((seg[:, 0] - x0) * (1 if not flip else -1) < width * 0.95)]
            if len(seg) > 3:
                flows.append(seg[:: 2])
        P.strokes(pl, flows, 2.8, color="wave_line", alpha=0.5)
    # foam: a white rim along the lip, scalloped on its inner edge, breaking
    # into hooked claws where the lip curls over
    lip = catmull_rom(to(_WAVE_BACK[3:] + _WAVE_LIP), 4)
    nrm = np.gradient(lip, axis=0)
    nrm = np.stack([-nrm[:, 1], nrm[:, 0]], 1) * (-1 if flip else 1)   # outward, into the air
    nrm /= np.maximum(np.hypot(nrm[:, 0], nrm[:, 1])[:, None], 1e-9)
    k = np.arange(len(lip))
    band_w = height * 0.032 * np.linspace(0.4, 1.0, len(lip)) * (1 + 0.45 * np.abs(np.sin(k * 0.55)))
    band = np.vstack([lip + nrm * 3, (lip - nrm * band_w[:, None])[::-1]])
    fm = P.mask(band)
    P.uncover(pl, fm)
    P.cover(pl, fm)
    inner = lip - nrm * band_w[:, None]
    P.key(pl, inner[int(len(inner) * 0.05):], 1.8, smooth=False, alpha=0.7, taper=(0.3, 0.1))
    if claws:
        shapes = []
        i0 = int(len(lip) * 0.5)
        i = i0
        while i < len(lip) - 1:
            p = lip[i]
            tng = lip[min(i + 2, len(lip) - 1)] - lip[max(i - 2, 0)]
            tng /= (np.hypot(*tng) + 1e-9)
            n_ = nrm[i]
            f = (i - i0) / max(1, len(lip) - 1 - i0)
            L = height * rng.uniform(0.05, 0.075) * (0.7 + 0.7 * f)
            nf = int(rng.integers(3, 5))
            for j in range(nf):
                a = (j - (nf - 1) / 2) * 0.42
                d = tng * math.cos(a) * 0.7 + n_ * (0.7 + 0.3 * math.sin(a))
                d /= (np.hypot(*d) + 1e-9)
                side = np.array([-d[1], d[0]])
                base = p + tng * (j - (nf - 1) / 2) * L * 0.34 - n_ * L * 0.1
                tip = base + d * L
                hook = tip + (tng * 0.25 - n_ * 1.0) * L * 0.38
                w0 = L * 0.12
                shapes.append(catmull_rom(np.array([base - side * w0 * 1.4, base + d * L * 0.5 - side * w0, tip, hook,
                                                    tip - d * L * 0.18 + side * w0 * 0.25, base + d * L * 0.45 + side * w0 * 0.9,
                                                    base + side * w0 * 1.4]), 1.5, closed=True))
            i += max(3, int(L * 1.05 / 4))
        cm = P.mask(shapes)
        P.uncover(pl, cm)
        P.cover(pl, cm)
        P.edge(pl, cm, 1.8, alpha=0.9)
    P.key(pl, outline, 3.4, smooth=False, taper=(0.05, 0.05))
    return body


def spray(P, pl, cx, cy, rx, ry, n=90, seed=0, size=(5, 13)):
    rng = np.random.default_rng(seed)
    dots = []
    for _ in range(n):
        a = rng.uniform(0, 2 * np.pi)
        rr = rng.uniform(0.2, 1.0) ** 0.6
        x, y = cx + rx * rr * math.cos(a), cy - abs(ry * rr * math.sin(a))
        r = rng.uniform(*size)
        t = np.linspace(0, 2 * np.pi, 12, endpoint=False)
        dots.append(np.stack([x + r * np.cos(t), y + r * np.sin(t)], 1))
    m = P.mask(dots)
    P.uncover(pl, m)
    P.cover(pl, m)


# ------------------------------------------------------------------ land
def ridge(P, pl, pts, base_y, fill, alpha=1.0, bokashi_top=None, key=True, key_w=3.4, top_col=None,
          top_depth=120, grain=0.28, seed=0):
    """A hill or range: the ridge line as the top of a filled shape down to base_y.
    `top_col` grades a darker colour down from the ridge (a print's shading)."""
    R = catmull_rom(np.asarray(pts, float), 8)
    poly = np.vstack([R, [(R[-1, 0], base_y), (R[0, 0], base_y)]])
    m = P.mask(poly)
    P.block(pl, m, fill, alpha=alpha, bokashi=bokashi_top, grain=grain, knock=True)
    if top_col:
        ys = np.interp(P.X[m[1][0]:m[1][1], m[1][2]:m[1][3]], R[:, 0], R[:, 1])
        P.block(pl, m, top_col, alpha=0.85,
                bokashi=lambda XX, YY: 1 - smoothstep(0, top_depth, YY - np.interp(XX, R[:, 0], R[:, 1])),
                grain=grain, pool=0, cover=False)
    if key:
        P.key(pl, R, key_w, smooth=False, taper=(0.05, 0.05))
    return R


def fuji(P, pl, cx, top, base, half_w, snow="snow", body="fuji", key_w=3.6, night=False, seed=0):
    """Mount Fuji: a broad cone with a flat, notched summit, snow reaching down
    in fingers, the lower slopes graded into mist."""
    rng = np.random.default_rng(seed)
    tw = half_w * 0.075
    left = [(cx - half_w, base), (cx - half_w * 0.62, base - (base - top) * 0.33),
            (cx - half_w * 0.3, base - (base - top) * 0.72), (cx - tw, top + 6)]
    right = [(cx + tw, top + 4), (cx + half_w * 0.28, base - (base - top) * 0.72),
             (cx + half_w * 0.6, base - (base - top) * 0.34), (cx + half_w, base)]
    crown = [(cx - tw * 0.55, top - 6), (cx - tw * 0.15, top + 4), (cx + tw * 0.25, top - 4), (cx + tw * 0.62, top + 2)]
    L = catmull_rom(np.array(left), 6)
    Rr = catmull_rom(np.array(right), 6)
    outline = np.vstack([L, np.array(crown), Rr])
    m = P.mask(outline)
    P.block(pl, m, body, alpha=1.0, bokashi=P.vgrad(top, base, 1.0, 0.8 if night else 0.25), grain=0.3, knock=True)
    # snow cap: paper left bare, with fingers reaching down the ravines
    snow_y = top + (base - top) * 0.34
    # snow polygon: summit outline above the snow line, closed by a smooth edge
    # of long tongues down the ravines and short ones on the ridges between
    top_poly = [p for p in outline if p[1] <= snow_y + 20]
    x_left = min(p[0] for p in top_poly)
    x_right = max(p[0] for p in top_poly)
    # the snow line: a ragged edge with narrow tongues of snow lying in the
    # ravines, longest near the middle of the cone
    ctrl = [(x_right, snow_y)]
    span = x_right - x_left
    n = 11
    for i in range(1, n):
        xc = x_right - span * i / n + rng.uniform(-0.2, 0.2) * span / n
        edge = abs(i - n / 2) / (n / 2)
        deep = (base - top) * rng.uniform(0.05, 0.16) * (1 - 0.6 * edge)
        w = span / n * rng.uniform(0.12, 0.2)
        ctrl += [(xc + w * 2.2, snow_y + rng.uniform(-0.02, 0.02) * (base - top)),
                 (xc + w * 0.6, snow_y + deep * 0.55), (xc, snow_y + deep), (xc - w * 0.6, snow_y + deep * 0.5),
                 (xc - w * 2.2, snow_y + rng.uniform(-0.02, 0.02) * (base - top))]
    ctrl.append((x_left, snow_y))
    bottom = catmull_rom(np.array(ctrl), 6)
    sp = np.vstack([np.array(top_poly), np.array(bottom)])
    ms = P.mask(sp)
    snow_mask = (ms[0] * 1.0, ms[1])
    P.uncover(pl, snow_mask)
    P.cover(pl, snow_mask)
    P.block(pl, snow_mask, snow, alpha=1.0 if night else 0.35, bokashi=P.vgrad(top, snow_y + 200, 0.2, 1.0),
            grain=0.15, pool=0.1)
    P.key(pl, outline, key_w, smooth=False, taper=(0.02, 0.02))
    return outline


def pine(P, pl, x, y, h, lean=0.0, seed=0, pads=5, trunk="bark", needles="pine", dark="pine_dark", key_w=2.6,
         spread=1.0):
    """A pine in the print manner: a crooked trunk, and flat clouds of needles
    stacked along it, each graded darker at its underside."""
    rng = np.random.default_rng(seed)
    n = 6
    trunk_pts = []
    for i in range(n):
        f = i / (n - 1)
        trunk_pts.append((x + lean * h * f + rng.normal(0, h * 0.03) * (0 < i < n - 1), y - h * f))
    T = catmull_rom(np.array(trunk_pts), 4)
    wbase = max(8, h * 0.075)
    ws = wbase * (1 - 0.7 * np.linspace(0, 1, len(T)))
    d = np.gradient(T, axis=0)
    d /= np.maximum(np.hypot(d[:, 0], d[:, 1])[:, None], 1e-9)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    poly = np.vstack([T + nrm * ws[:, None] / 2, (T - nrm * ws[:, None] / 2)[::-1]])
    m = P.mask(poly)
    P.block(pl, m, trunk, alpha=1.0, grain=0.2, knock=True)
    P.outline(pl, poly, key_w * 0.8)
    pads_out = []
    for k in range(pads):
        f = 0.35 + 0.65 * (k / max(1, pads - 1))
        idx = min(len(T) - 1, int(f * (len(T) - 1)))
        px, py = T[idx]
        side = (-1) ** k * (0.6 + 0.4 * rng.random())
        pw = h * (0.62 - 0.3 * f) * spread * rng.uniform(0.85, 1.15)
        ph = pw * rng.uniform(0.3, 0.42)
        cx = px + side * pw * 0.45
        cy = py - ph * 0.2
        # branch
        P.key(pl, np.array([(px, py + ph * 0.3), (cx - side * pw * 0.2, cy + ph * 0.25)]), max(3, wbase * 0.35),
              color=trunk, alpha=1.0, smooth=False, taper=(0, 0.5))
        pads_out.append((cx, cy, pw, ph))
    if pads:
        top = T[-1]
        pads_out.append((top[0], top[1] - h * 0.04, h * 0.4 * spread, h * 0.14))
    for (cx, cy, pw, ph) in pads_out:
        pts = []
        nb = 7
        for j in range(nb + 1):
            a = np.pi + np.pi * j / nb
            rr = 1 + 0.12 * rng.normal()
            pts.append((cx + pw / 2 * math.cos(a) * rr, cy + ph * 0.9 * math.sin(a) * rr))
        pts += [(cx + pw * 0.5, cy + ph * 0.25), (cx - pw * 0.5, cy + ph * 0.25)]
        P_ = catmull_rom(np.array(pts), 3, closed=True)
        m = P.mask(P_)
        P.block(pl, m, needles, alpha=1.0, grain=0.25, pool=0.2, knock=True)
        P.block(pl, m, dark, alpha=0.9, bokashi=P.vgrad(cy - ph * 0.3, cy + ph * 0.3, 0.0, 1.0), grain=0.2,
                pool=0, cover=False)
        P.outline(pl, P_, key_w * 0.75, alpha=0.85)
        # needle hatching: short fans along the top edge
        hatch = []
        for j in range(int(pw / 14)):
            hx = cx - pw * 0.42 + j * 14 + rng.uniform(-3, 3)
            hy = cy - ph * 0.55 * math.sin(np.pi * (hx - cx + pw / 2) / pw) + ph * 0.1
            hatch.append([(hx - 5, hy - 10), (hx, hy + 6), (hx + 5, hy - 10)])
        P.strokes(pl, hatch, 1.8, color="sumi", alpha=0.6, smooth=False)
    return T


def island(P, pl, x0, x1, base, height, fill="rock", top="rock_top", seed=0, pines=0, pine_h=None, key_w=3.0):
    rng = np.random.default_rng(seed)
    n = 7
    xs = np.linspace(x0, x1, n)
    pts = [(x0, base)]
    for i, x in enumerate(xs[1:-1], 1):
        f = math.sin(np.pi * i / (n - 1))
        pts.append((x + rng.uniform(-20, 20), base - height * f * rng.uniform(0.75, 1.1)))
    pts.append((x1, base))
    R = catmull_rom(np.array(pts), 6)
    m = P.mask(R)
    P.block(pl, m, fill, alpha=1.0, grain=0.3, knock=True)
    P.block(pl, m, top, alpha=0.9, bokashi=P.vgrad(base - height, base, 1.0, 0.0), grain=0.25, pool=0, cover=False)
    # rock cracks
    cracks = []
    for _ in range(int((x1 - x0) / 60)):
        cx = rng.uniform(x0 + 20, x1 - 20)
        ytop = np.interp(cx, R[:, 0], R[:, 1]) if False else base - height * 0.7 * math.sin(np.pi * (cx - x0) / (x1 - x0))
        cracks.append([(cx, ytop + rng.uniform(10, 40)), (cx + rng.uniform(-18, 18), ytop + rng.uniform(50, 120))])
    P.strokes(pl, cracks, 2.4, alpha=0.7)
    P.key(pl, R, key_w, closed=False, smooth=False, taper=(0.02, 0.02))
    for k in range(pines):
        px = x0 + (x1 - x0) * (0.25 + 0.5 * (k + 0.5) / pines) + rng.uniform(-30, 30)
        py = base - height * 0.85 * math.sin(np.pi * (px - x0) / (x1 - x0)) + 10
        pine(P, pl, px, py, (pine_h or height * 1.3) * rng.uniform(0.8, 1.15), lean=rng.uniform(-0.25, 0.25),
             seed=seed * 10 + k, pads=4)
    return R


def birds(P, pl, pts, size=26, color="sumi", alpha=0.85):
    """Plovers or geese: a small 'v' of two strokes each."""
    lines = []
    for (x, y, s) in pts:
        w = size * s
        lines.append([(x - w, y - w * 0.35), (x - w * 0.35, y - w * 0.1), (x, y + w * 0.1)])
        lines.append([(x, y + w * 0.1), (x + w * 0.35, y - w * 0.12), (x + w * 0.95, y - w * 0.4)])
    P.strokes(pl, lines, 3.0, color=color, alpha=alpha)


def rain(P, pl, x0, x1, y0, y1, n=600, angle=0.18, length=(60, 180), seed=0, color="sumi", alpha=0.35, w=1.6):
    rng = np.random.default_rng(seed)
    ls = []
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        L = rng.uniform(*length)
        ls.append([(x, y), (x + L * angle, y + L)])
    P.strokes(pl, ls, w, color=color, alpha=alpha, smooth=False)


def boat(P, pl, x, y, L, sail=False, flip=False, hull="hull", seed=0, figure=True):
    """A small wooden boat, optionally with a square sail."""
    s = -1 if flip else 1
    hullp = np.array([(x - L / 2, y - L * 0.06), (x + s * L * 0.5, y - L * 0.12), (x + s * L * 0.42, y + L * 0.03),
                      (x - s * L * 0.4, y + L * 0.03)])
    hullp = np.array([(x - L * 0.5, y - L * 0.07), (x + L * 0.5, y - L * 0.1), (x + L * 0.4, y + L * 0.035),
                      (x - L * 0.38, y + L * 0.035)])
    if flip:
        hullp[:, 0] = 2 * x - hullp[:, 0]
    m = P.mask(hullp)
    P.block(pl, m, hull, alpha=1.0, grain=0.2, knock=True)
    P.outline(pl, hullp, 2.6)
    if sail:
        mx = x
        P.key(pl, np.array([(mx, y - L * 0.07), (mx, y - L * 0.95)]), 3.2, smooth=False, taper=(0, 0))
        sp = np.array([(mx - L * 0.28, y - L * 0.9), (mx + L * 0.28, y - L * 0.9), (mx + L * 0.3, y - L * 0.22),
                       (mx - L * 0.26, y - L * 0.22)])
        m = P.mask(sp)
        P.block(pl, m, "sail", alpha=0.8, grain=0.3, knock=True)
        P.outline(pl, sp, 2.4)
        seams = [[(mx - L * 0.28 + k * L * 0.14, y - L * 0.9), (mx - L * 0.26 + k * L * 0.14, y - L * 0.22)] for k in range(1, 4)]
        P.strokes(pl, seams, 1.8, alpha=0.6, smooth=False)
    if figure:
        fx = x - s * L * 0.18
        body = np.array([(fx - L * 0.035, y - L * 0.08), (fx + L * 0.035, y - L * 0.08), (fx + L * 0.02, y - L * 0.22),
                         (fx - L * 0.02, y - L * 0.22)])
        m = P.mask(body)
        P.block(pl, m, "robe", alpha=1.0, knock=True)
        P.outline(pl, body, 2.0)
        hat = np.array([(fx - L * 0.06, y - L * 0.215), (fx, y - L * 0.27), (fx + L * 0.06, y - L * 0.215)])
        m = P.mask(hat)
        P.block(pl, m, "straw", alpha=1.0, knock=True)
        P.outline(pl, hat, 1.8)


def mist(P, pl, x0, x1, y, h, color="kasumi_w", alpha=0.72, seed=0, lobes=4):
    """A band of mist lying across the land (suyari-gasumi), hiding what is
    behind it; its lower edge dissolves."""
    rng = np.random.default_rng(seed)
    r = h / 2
    xs = np.linspace(x0 + r, x1 - r, lobes + 2)
    top = [(x, y - r - (rng.uniform(0.05, 0.35) * h if 0 < i < len(xs) - 1 else 0)) for i, x in enumerate(xs)]
    bot = [(x, y + r + (rng.uniform(0.0, 0.2) * h if 0 < i < len(xs) - 1 else 0)) for i, x in enumerate(xs)][::-1]
    t = np.linspace(-np.pi / 2, np.pi / 2, 16)
    right = np.stack([x1 - r + r * np.cos(t), y + r * np.sin(t)], 1)
    left = np.stack([x0 + r - r * np.cos(t), y - r * np.sin(t)], 1)
    pts = np.vstack([catmull_rom(np.array(top), 20), right, catmull_rom(np.array(bot), 20), left])
    m = P.mask(pts, feather=6)
    # carve the band softly out of what lies behind, then tint it
    a, bb = m
    fade = P.vgrad(y - r * 0.2, y + r * 1.1, 1.0, 0.25)(P.X[bb[0]:bb[1], bb[2]:bb[3]], P.Y[bb[0]:bb[1], bb[2]:bb[3]])
    k = a * fade * alpha
    sub = pl.mult[bb[0]:bb[1], bb[2]:bb[3]]
    sub *= 1 - k[..., None]
    sub += k[..., None]
    cv = pl.cov[bb[0]:bb[1], bb[2]:bb[3]]
    np.maximum(cv, k, out=cv)
    P.block(pl, (k, bb), color, alpha=0.35 if not P.night else 0.9, grain=0.1, pool=0, cover=False)
    return pts


def susuki(P, pl, x, base, h, n=9, seed=0, lean=0.35, plume="kasumi_w", blade="hill_dark"):
    """Pampas grass: long arching blades and feathery plumes, the autumn grass
    of Musashino plain in prints."""
    rng = np.random.default_rng(seed)
    blades = []
    for _ in range(n * 2):
        L = h * rng.uniform(0.4, 0.8)
        a = -np.pi / 2 + rng.uniform(-0.6, 0.6) + lean * 0.5
        bx = x + rng.uniform(-h * 0.05, h * 0.05)
        pts = [(bx, base)]
        ang = a
        px, py = bx, base
        for k in range(6):
            ang += rng.uniform(0.05, 0.18) * (1 if math.cos(ang) >= 0 else -1)
            px += math.cos(ang) * L / 6
            py += math.sin(ang) * L / 6
            pts.append((px, py))
        blades.append(np.array(pts))
    P.key(pl, blades, max(3, h * 0.012), color=blade, alpha=0.9, taper=(0.0, 0.9), wobble=0.1)
    for _ in range(n):
        L = h * rng.uniform(0.75, 1.0)
        a = -np.pi / 2 + lean * rng.uniform(0.3, 1.0)
        bx = x + rng.uniform(-h * 0.04, h * 0.04)
        top = (bx + math.cos(a) * L, base + math.sin(a) * L)
        stem = np.array([(bx, base), ((bx + top[0]) / 2 + h * 0.03, (base + top[1]) / 2), top])
        P.key(pl, stem, max(2, h * 0.006), color=blade, alpha=0.9, taper=(0, 0.3))
        # plume: a drooping fan of fine strands
        strands = []
        for k in range(14):
            s0 = np.array(top) + np.array([rng.uniform(-6, 6), rng.uniform(0, h * 0.18)])
            dx = h * rng.uniform(0.04, 0.12)
            strands.append([tuple(s0), (s0[0] + dx * 0.6, s0[1] - h * 0.02), (s0[0] + dx, s0[1] + h * 0.03)])
        P.strokes(pl, strands, max(2.5, h * 0.008), color=plume, alpha=0.95, cover=True)
        P.strokes(pl, strands[::3], 1.2, color="key_soft", alpha=0.5)


def tufts(P, pl, x0, x1, y0, y1, n=200, seed=0, color="hill_dark", alpha=0.6, size=(20, 60)):
    """Short grass strokes scattered over a field, larger toward the viewer."""
    rng = np.random.default_rng(seed)
    ls = []
    for _ in range(n):
        y = y0 + (y1 - y0) * rng.uniform(0, 1) ** 0.8
        f = (y - y0) / max(1, y1 - y0)
        x = rng.uniform(x0, x1)
        hh = size[0] + (size[1] - size[0]) * f
        for k in range(3):
            dx = (k - 1) * hh * 0.25
            ls.append([(x + dx * 0.3, y), (x + dx, y - hh * (0.7 + 0.3 * (k == 1)))])
    P.strokes(pl, ls, 2.0, color=color, alpha=alpha, smooth=False)


def snowfall(P, pl, n=900, seed=0, y0=0, y1=2160, size=(3, 8)):
    """Falling snow: flakes carved out of every block, left as paper."""
    rng = np.random.default_rng(seed)
    dots = []
    for _ in range(n):
        x, y = rng.uniform(0, 3840), rng.uniform(y0, y1)
        r = rng.uniform(*size)
        t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
        dots.append(np.stack([x + r * np.cos(t), y + r * np.sin(t)], 1))
    m = P.mask(dots)
    P.uncover(pl, m)
    P.cover(pl, m)
    P.block(pl, m, "snow", alpha=0.25, cover=False)


def fireworks(P, pl, cx, cy, r, color="light", seed=0, rays=36):
    """A burst of fireworks: rays of sparks from a point, carved as light."""
    rng = np.random.default_rng(seed)
    ls = []
    dots = []
    for k in range(rays):
        a = 2 * np.pi * k / rays + rng.uniform(-0.05, 0.05)
        rr = r * rng.uniform(0.75, 1.0)
        ls.append([(cx + math.cos(a) * rr * 0.25, cy + math.sin(a) * rr * 0.25),
                   (cx + math.cos(a) * rr * 0.9, cy + math.sin(a) * rr * 0.9 + rr * 0.05)])
        t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
        px, py = cx + math.cos(a) * rr, cy + math.sin(a) * rr + rr * 0.08
        dots.append(np.stack([px + 6 * np.cos(t), py + 6 * np.sin(t)], 1))
    m = P.mask([P.path(np.array(l), closed=False) for l in ls], stroke=3.2)
    P.uncover(pl, m)
    P.cover(pl, m)
    P.block(pl, m, color, alpha=0.8, cover=False)
    dm = P.mask(dots)
    P.uncover(pl, dm)
    P.cover(pl, dm)
    P.block(pl, dm, color, alpha=0.9, cover=False)


def lightning(P, pl, x, y0, y1, seed=0, width=9):
    rng = np.random.default_rng(seed)
    pts = [(x, y0)]
    y = y0
    xx = x
    while y < y1:
        y += rng.uniform(60, 140)
        xx += rng.uniform(-90, 90)
        pts.append((xx, min(y, y1)))
    branch = [pts[2], (pts[2][0] + 160, pts[2][1] + 120), (pts[2][0] + 220, pts[2][1] + 260)]
    m = P.mask([P.path(np.array(pts), closed=False), P.path(np.array(branch), closed=False)], stroke=width)
    P.uncover(pl, m)
    P.cover(pl, m)
    P.block(pl, m, "light", alpha=0.6, cover=False)
    P.edge(pl, m, 2.0, alpha=0.7)


def fireflies(P, pl, x0, x1, y0, y1, n=60, seed=0):
    rng = np.random.default_rng(seed)
    dots = []
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
        dots.append(np.stack([x + 5 * np.cos(t), y + 5 * np.sin(t)], 1))
    m = P.mask(dots, feather=3)
    P.uncover(pl, m)
    P.cover(pl, m)
    P.block(pl, m, "light", alpha=0.9, cover=False)
