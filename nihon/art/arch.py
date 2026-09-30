"""Buildings, trees and figures for the era prints."""
import math

import numpy as np

from hanga import catmull_rom, smoothstep


def rect(x0, y0, x1, y1):
    return np.array([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], float)


def poly_block(P, pl, pts, color, key=2.4, alpha=1.0, bokashi=None, grain=0.2, smooth=False):
    pts = catmull_rom(np.asarray(pts, float), 3, closed=True) if smooth else np.asarray(pts, float)
    m = P.mask(pts)
    P.block(pl, m, color, alpha=alpha, bokashi=bokashi, grain=grain, knock=True)
    if key:
        P.outline(pl, pts, key)
    return m


# ------------------------------------------------------------------ roofs
def roof(P, pl, cx, y, w, h, color="roof", ridge=0.46, lift=None, tiles=True, gable=False, key=2.6,
         shibi=None, eave="wood", hipped=True, snow=False):
    """A Japanese tiled roof seen from the front: eaves sweeping up at the
    corners, a ridge on top, tile rows running down; optional gable and
    ridge-end ornaments (golden shibi on Nara halls)."""
    lift = h * 0.22 if lift is None else lift
    n = 40
    xs = np.linspace(cx - w / 2, cx + w / 2, n)
    ey = y - lift * np.abs((xs - cx) / (w / 2)) ** 3
    wr = w * ridge
    top_l = (cx - wr / 2, y - h)
    top_r = (cx + wr / 2, y - h)
    # concave hips from the eave corners up to the ridge ends
    hip_r = [(xs[-1], ey[-1]), (xs[-1] - (xs[-1] - top_r[0]) * 0.55, ey[-1] - (ey[-1] - top_r[1]) * 0.35), top_r]
    hip_l = [top_l, (xs[0] + (top_l[0] - xs[0]) * 0.45, ey[0] - (ey[0] - top_l[1]) * 0.35), (xs[0], ey[0])]
    R = catmull_rom(np.array(hip_r), 4)
    Lh = catmull_rom(np.array(hip_l), 4)
    body = np.vstack([np.stack([xs, ey], 1), R, Lh])
    m = P.mask(body)
    P.block(pl, m, color, alpha=1.0, bokashi=P.vgrad(y - h, y, 0.8, 1.0), grain=0.25, knock=True)
    if tiles:
        lines = []
        k = max(6, int(w / 26))
        for i in range(1, k):
            f = i / k
            xb = cx - w / 2 + w * f
            yb = y - lift * abs((xb - cx) / (w / 2)) ** 3
            xt = cx - wr / 2 + wr * f if hipped else xb
            lines.append([(xt, y - h + 4), (xb, yb - 4)])
        P.strokes(pl, lines, 1.6, alpha=0.45, smooth=False)
    if gable:
        gh = h * 0.62
        g = np.array([(cx - wr * 0.34, y - h + gh * 0.95), (cx, y - h - gh * 0.08), (cx + wr * 0.34, y - h + gh * 0.95)])
        P.block(pl, P.mask(g), "wood", alpha=0.85, grain=0.2)
        P.outline(pl, g, key * 0.8)
    # eave fascia
    fas = np.vstack([np.stack([xs, ey], 1), np.stack([xs[::-1], ey[::-1] + max(5, h * 0.07)], 1)])
    P.block(pl, P.mask(fas), eave, alpha=1.0, grain=0.15, knock=True)
    P.outline(pl, body, key)
    P.key(pl, np.stack([xs, ey + max(5, h * 0.07)], 1), key * 0.8, smooth=False, taper=(0, 0))
    # ridge
    rb = np.array([(top_l[0] - 6, y - h - 7), (top_r[0] + 6, y - h - 7), (top_r[0] + 6, y - h + 3), (top_l[0] - 6, y - h + 3)])
    P.block(pl, P.mask(rb), "sumi", alpha=0.8)
    if shibi:
        for sx, sg in ((top_l[0], -1), (top_r[0], 1)):
            sh = np.array([(sx, y - h), (sx + sg * h * 0.08, y - h - h * 0.34), (sx + sg * h * 0.2, y - h - h * 0.36),
                           (sx + sg * h * 0.12, y - h - h * 0.12), (sx + sg * h * 0.14, y - h)])
            P.block(pl, P.mask(sh), shibi, alpha=1.0, grain=0.1)
            P.outline(pl, sh, 1.8)
    if snow:
        sn = np.vstack([Lh[::-1][:0], np.array([top_l, top_r]), R[:len(R) // 2]])
        cap = np.vstack([np.array([(top_l[0] - 8, y - h - 9), (top_r[0] + 8, y - h - 9)]),
                         np.stack([xs[::-1], ey[::-1] - h * 0.25 - 6 * np.sin(np.linspace(0, 20, n))], 1)[5:-5]])
        cap = np.array([(top_l[0] - 10, y - h - 10), (top_r[0] + 10, y - h - 10)] +
                       [(x_, y - h * 0.3 - lift * abs((x_ - cx) / (w / 2)) ** 3 + 10 * math.sin(x_ * 0.05))
                        for x_ in np.linspace(cx + w / 2 - 10, cx - w / 2 + 10, 30)])
        cm = P.mask(catmull_rom(cap, 3, closed=True))
        P.uncover(pl, cm)
        P.cover(pl, cm)
        P.block(pl, cm, "snow", alpha=0.3, bokashi=P.vgrad(y - h, y, 0.0, 1.0))
        P.edge(pl, cm, 1.6, alpha=0.7)
    return body


def walls(P, pl, x0, x1, y_top, y_bot, panel="wall", post="shu", posts=6, key=2.2, windows=None, rail=True):
    """A wall of plaster panels between posts, as on temples and halls."""
    P.block(pl, P.mask(rect(x0, y_top, x1, y_bot)), panel, alpha=1.0, grain=0.15, knock=True)
    lines = []
    pw = max(6, (x1 - x0) / posts * 0.12)
    for i in range(posts + 1):
        x = x0 + (x1 - x0) * i / posts
        P.block(pl, P.mask(rect(x - pw / 2, y_top, x + pw / 2, y_bot)), post, alpha=1.0, grain=0.1, shift=False)
        lines.append([(x - pw / 2, y_top), (x - pw / 2, y_bot)])
        lines.append([(x + pw / 2, y_top), (x + pw / 2, y_bot)])
    if rail:
        rh = (y_bot - y_top) * 0.08
        P.block(pl, P.mask(rect(x0, y_top, x1, y_top + rh)), post, alpha=1.0, shift=False)
        lines.append([(x0, y_top + rh), (x1, y_top + rh)])
    if windows:
        for i in range(posts):
            xa = x0 + (x1 - x0) * i / posts + pw
            xb = x0 + (x1 - x0) * (i + 1) / posts - pw
            wy0 = y_top + (y_bot - y_top) * 0.3
            wy1 = y_top + (y_bot - y_top) * 0.75
            P.block(pl, P.mask(rect(xa + (xb - xa) * 0.2, wy0, xb - (xb - xa) * 0.2, wy1)), windows, alpha=1.0,
                    shift=False)
    P.strokes(pl, lines, key * 0.7, alpha=0.8, smooth=False)
    P.outline(pl, rect(x0, y_top, x1, y_bot), key)


def platform(P, pl, x0, x1, y_top, h, color="grey", steps=None, key=2.2):
    P.block(pl, P.mask(rect(x0, y_top, x1, y_top + h)), color, alpha=1.0, grain=0.25, knock=True)
    P.outline(pl, rect(x0, y_top, x1, y_top + h), key)
    if steps:
        sx0, sx1 = steps
        n = 5
        ls = [[(sx0, y_top + h * i / n), (sx1, y_top + h * i / n)] for i in range(1, n)]
        P.strokes(pl, ls, 1.6, alpha=0.6, smooth=False)


# ------------------------------------------------------------------ buildings
def hall(P, pl, cx, base, w, wall_h, roof_h, roofs=1, roof_w=1.35, panel="wall", post="shu", color="roof",
         shibi=None, gable=True, lights=None, snow=False, podium=None):
    """A temple hall: podium, walls between posts, one or two tiers of roof."""
    if podium:
        platform(P, pl, cx - w * 0.62, cx + w * 0.62, base, podium, steps=(cx - w * 0.15, cx + w * 0.15))
    y = base
    wv = w
    for k in range(roofs):
        walls(P, pl, cx - wv / 2, cx + wv / 2, y - wall_h, y, panel=panel, post=post,
              posts=max(3, int(wv / 90)) | 1, windows=lights if (P.night and k == 0) else None)
        y -= wall_h
        rh = roof_h if k == roofs - 1 else roof_h * 0.55
        roof(P, pl, cx, y + rh * 0.12, wv * roof_w, rh, color=color, gable=gable and k == roofs - 1,
             shibi=shibi if k == roofs - 1 else None, ridge=0.5 if k == roofs - 1 else 0.82, snow=snow)
        y -= rh * 0.62
        wv *= 0.78
        wall_h *= 0.6
    return y


def pagoda(P, pl, cx, base, h, tiers=5, color="roof", post="shu", panel="wall", spire="gold", snow=False):
    """A five-storied pagoda: tiers shrinking upward and a bronze finial."""
    body_h = h * 0.78
    th = body_h / tiers
    y = base
    w = h * 0.23
    platform(P, pl, cx - w * 0.75, cx + w * 0.75, base, h * 0.03, color="grey")
    for k in range(tiers):
        ww = w * (1 - 0.1 * k)
        wh = th * 0.42
        walls(P, pl, cx - ww / 2, cx + ww / 2, y - wh, y, panel=panel, post=post, posts=3, rail=False)
        y -= wh
        roof(P, pl, cx, y + th * 0.05, ww * 1.75, th * 0.55, color=color, ridge=0.35, lift=th * 0.22, snow=snow)
        y -= th * 0.58
    # sorin finial with nine rings
    sp = rect(cx - h * 0.008, y - h * 0.2, cx + h * 0.008, y + 4)
    P.block(pl, P.mask(sp), spire, alpha=1.0)
    rings = [[(cx - h * 0.02, y - h * 0.02 - i * h * 0.017), (cx + h * 0.02, y - h * 0.02 - i * h * 0.017)] for i in range(9)]
    P.strokes(pl, rings, 3.0, color=spire, alpha=1.0, smooth=False)
    P.strokes(pl, rings, 1.2, alpha=0.7, smooth=False)
    P.outline(pl, sp, 1.6)
    return y - h * 0.2


def torii(P, pl, cx, base, w, h, color="shu"):
    post_w = w * 0.08
    for sx in (-1, 1):
        x = cx + sx * w * 0.36
        pts = np.array([(x - post_w / 2 - sx * 4, base), (x + post_w / 2 - sx * 4, base), (x + post_w / 2, base - h * 0.95),
                        (x - post_w / 2, base - h * 0.95)])
        poly_block(P, pl, pts, color)
    nuki = rect(cx - w * 0.44, base - h * 0.74, cx + w * 0.44, base - h * 0.68)
    poly_block(P, pl, nuki, color)
    xs = np.linspace(cx - w * 0.58, cx + w * 0.58, 20)
    top = base - h - 10 * np.abs((xs - cx) / (w * 0.58)) ** 2 * -1
    kasagi = np.vstack([np.stack([xs, base - h - 14 * ((xs - cx) / (w * 0.58)) ** 2], 1),
                        np.stack([xs[::-1], base - h + h * 0.07 - 10 * ((xs[::-1] - cx) / (w * 0.58)) ** 2], 1)])
    poly_block(P, pl, kasagi, "sumi")
    shimaki = rect(cx - w * 0.5, base - h + h * 0.07, cx + w * 0.5, base - h + h * 0.13)
    poly_block(P, pl, shimaki, color)


def pit_house(P, pl, cx, base, w, h, smoke=False, seed=0, light=False):
    """A Jomon pit dwelling: a low conical roof of thatch reaching the ground."""
    rng = np.random.default_rng(seed)
    pts = [(cx - w / 2, base), (cx - w * 0.36, base - h * 0.45), (cx - w * 0.12, base - h * 0.92), (cx, base - h),
           (cx + w * 0.12, base - h * 0.92), (cx + w * 0.36, base - h * 0.45), (cx + w / 2, base)]
    R = catmull_rom(np.array(pts), 4)
    m = P.mask(R)
    P.block(pl, m, "thatch", alpha=1.0, grain=0.3, knock=True)
    P.block(pl, m, "thatch_dark", alpha=0.8, bokashi=P.hgrad(cx - w / 2, cx + w / 2, 0.0, 1.0), grain=0.2, pool=0,
            cover=False)
    lines = []
    for i in range(int(w / 16)):
        f = (i + 0.5) / int(w / 16)
        xb = cx - w / 2 + w * f
        lines.append([(cx + (xb - cx) * 0.08, base - h * 0.95), (xb, base - 3)])
    P.strokes(pl, lines, 1.5, alpha=0.5, smooth=False)
    # low doorway
    dw = w * 0.16
    door = np.array([(cx - dw / 2, base), (cx - dw / 2, base - h * 0.28), (cx + dw / 2, base - h * 0.28), (cx + dw / 2, base)])
    P.block(pl, P.mask(door), "light" if light else "sumi", alpha=0.95 if light else 0.85)
    P.outline(pl, door, 2.0)
    P.key(pl, R, 2.8, smooth=False, taper=(0, 0))
    if smoke:
        sm = []
        x, y = cx, base - h
        for k in range(10):
            sm.append((x + 30 * math.sin(k * 0.8 + seed), y - k * 45))
        S = catmull_rom(np.array(sm), 6)
        wv = np.linspace(10, 50, len(S))
        d = np.gradient(S, axis=0)
        d /= np.maximum(np.hypot(d[:, 0], d[:, 1])[:, None], 1e-9)
        nrm = np.stack([-d[:, 1], d[:, 0]], 1)
        poly = np.vstack([S + nrm * wv[:, None] / 2, (S - nrm * wv[:, None] / 2)[::-1]])
        P.block(pl, P.mask(poly), "smoke", alpha=0.7, bokashi=P.vgrad(base - h, base - h - 450, 1.0, 0.0), cover=False,
                grain=0.1)


def granary(P, pl, cx, base, w, h, color="wood"):
    """A Yayoi raised-floor storehouse: stilts, a box, a steep thatched roof."""
    legs = []
    for fx in (-0.4, -0.13, 0.13, 0.4):
        legs.append(rect(cx + fx * w - 5, base - h * 0.42, cx + fx * w + 5, base))
    m = P.mask(legs)
    P.block(pl, m, color, alpha=1.0, knock=True)
    P.edge(pl, m, 1.6)
    box = rect(cx - w * 0.45, base - h * 0.62, cx + w * 0.45, base - h * 0.42)
    poly_block(P, pl, box, "earth")
    rf = np.array([(cx - w * 0.62, base - h * 0.6), (cx - w * 0.2, base - h), (cx + w * 0.2, base - h), (cx + w * 0.62, base - h * 0.6)])
    poly_block(P, pl, rf, "thatch")
    ls = [[(cx - w * 0.2 + w * 0.4 * i / 8, base - h), (cx - w * 0.62 + w * 1.24 * i / 8, base - h * 0.6)] for i in range(1, 8)]
    P.strokes(pl, ls, 1.4, alpha=0.5, smooth=False)


def tower(P, pl, cx, base, w, h, color="wood"):
    """The six-pillar structure of Sannai-Maruyama, as reconstructed: six
    great chestnut posts in two rows, with three open floors."""
    xs = [cx - w / 2, cx, cx + w / 2]
    posts = []
    for x in xs:
        posts.append(rect(x - w * 0.045, base - h, x + w * 0.045, base))
    m = P.mask(posts)
    P.block(pl, m, color, alpha=1.0, grain=0.3, knock=True)
    P.edge(pl, m, 2.0)
    for fl in (0.32, 0.6, 0.88):
        y = base - h * fl
        slab = rect(cx - w / 2 - w * 0.08, y - h * 0.035, cx + w / 2 + w * 0.08, y)
        poly_block(P, pl, slab, "earth_dark")
    ls = [[(cx - w / 2 + w * 0.05, base - h * 0.32), (cx - w * 0.05, base - h * 0.6)],
          [(cx + w * 0.05, base - h * 0.32), (cx + w / 2 - w * 0.05, base - h * 0.6)]]
    P.strokes(pl, ls, 3.0, color="earth_dark", alpha=1.0, smooth=False)


# ------------------------------------------------------------------ trees
def canopy(P, pl, cx, cy, rx, ry, fill, dark, key=2.4, seed=0, lobes=9, dots=None, dot_n=0, alpha=1.0,
           light=None):
    """A rounded tree crown of lobes, darker below, with leaf dots."""
    rng = np.random.default_rng(seed)
    pts = []
    for j in range(lobes * 4):
        a = 2 * np.pi * j / (lobes * 4)
        bump = 1 + 0.09 * abs(math.sin(a * lobes / 2 + seed))
        pts.append((cx + rx * math.cos(a) * bump, cy + ry * math.sin(a) * bump))
    C = catmull_rom(np.array(pts), 3, closed=True)
    m = P.mask(C)
    P.block(pl, m, fill, alpha=alpha, grain=0.25, knock=True)
    P.block(pl, m, dark, alpha=0.85, bokashi=P.vgrad(cy - ry * 0.2, cy + ry, 0.0, 1.0), grain=0.2, pool=0, cover=False)
    if light:
        P.block(pl, m, light, alpha=0.5, bokashi=P.vgrad(cy - ry, cy - ry * 0.2, 1.0, 0.0), grain=0.2, pool=0,
                cover=False)
    if dot_n:
        ds = []
        for _ in range(dot_n):
            a = rng.uniform(0, 2 * np.pi)
            rr = math.sqrt(rng.uniform(0, 1))
            x, y = cx + rx * rr * math.cos(a) * 0.95, cy + ry * rr * math.sin(a) * 0.95
            r = rng.uniform(3, 6)
            t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
            ds.append(np.stack([x + r * 1.3 * np.cos(t), y + r * 0.6 * np.sin(t)], 1))
        dm = P.mask(ds)
        P.block(pl, dm, dots or dark, alpha=0.8, grain=0.1, cover=False)
    P.outline(pl, C, key, alpha=0.85)
    return C


def tree(P, pl, x, base, h, fill="hill", dark="hill_dark", trunk="bark", seed=0, crowns=3, dot_n=60, dots=None,
         light=None, lean=0.0):
    rng = np.random.default_rng(seed)
    tw = max(6, h * 0.05)
    tr = np.array([(x - tw, base), (x + tw, base), (x + tw * 0.6 + lean * h * 0.5, base - h * 0.6),
                   (x - tw * 0.6 + lean * h * 0.5, base - h * 0.6)])
    poly_block(P, pl, tr, trunk, key=2.0)
    for k in range(crowns):
        cx = x + lean * h * 0.5 + rng.uniform(-0.25, 0.25) * h * 0.5
        cy = base - h * (0.62 + 0.18 * k) + rng.uniform(-10, 10)
        canopy(P, pl, cx, cy, h * (0.32 - 0.05 * k) * rng.uniform(0.9, 1.15), h * (0.2 - 0.03 * k), fill, dark,
               seed=seed * 7 + k, dot_n=dot_n, dots=dots, light=light)


def blossoms(P, pl, x, base, h, seed=0, color="sakura", dark="sakura_dark", spread=1.0, petals=True):
    """A cherry in bloom: dark crooked branches under clouds of pink."""
    rng = np.random.default_rng(seed)
    trunk = [(x, base), (x - h * 0.05, base - h * 0.35), (x + h * 0.05, base - h * 0.6)]
    P.key(pl, np.array(trunk), max(10, h * 0.07), color="bark", alpha=1.0, taper=(0, 0.6), wobble=0.2)
    br = []
    for k in range(6):
        a = rng.uniform(-2.6, -0.5)
        L = h * rng.uniform(0.3, 0.55) * spread
        sx, sy = trunk[-1] if k % 2 else trunk[1]
        br.append(np.array([(sx, sy), (sx + math.cos(a) * L * 0.5 + rng.normal(0, 10), sy + math.sin(a) * L * 0.5),
                            (sx + math.cos(a) * L, sy + math.sin(a) * L * 0.8)]))
        P.key(pl, br[-1], max(5, h * 0.03), color="bark", alpha=1.0, taper=(0, 0.8), wobble=0.3)
    for k in range(7):
        b = br[k % len(br)]
        cx, cy = b[-1] + rng.normal(0, 20, 2)
        canopy(P, pl, cx, cy, h * rng.uniform(0.16, 0.26) * spread, h * rng.uniform(0.1, 0.15), color, dark,
               seed=seed * 11 + k, dot_n=40, dots="kasumi_w", key=1.8)
    if petals:
        ps = []
        for _ in range(40):
            px, py = x + rng.normal(0, h * 0.6), base - h * rng.uniform(-0.1, 0.9)
            r = rng.uniform(4, 7)
            t = np.linspace(0, 2 * np.pi, 6, endpoint=False)
            ps.append(np.stack([px + r * np.cos(t), py + r * 0.7 * np.sin(t)], 1))
        P.block(pl, P.mask(ps), color, alpha=0.9, cover=True)


# ------------------------------------------------------------------ figures
def figure(P, pl, x, base, h, robe="robe", hat=None, pose="walk", seed=0, load=None):
    """A small figure in the print manner: robe, head, sometimes a hat."""
    rng = np.random.default_rng(seed)
    body = np.array([(x - h * 0.16, base), (x + h * 0.16, base), (x + h * 0.1, base - h * 0.72), (x - h * 0.1, base - h * 0.72)])
    if pose == "sit":
        body = np.array([(x - h * 0.22, base), (x + h * 0.2, base), (x + h * 0.1, base - h * 0.5), (x - h * 0.1, base - h * 0.5)])
    poly_block(P, pl, body, robe, key=1.6)
    top = base - (h * 0.72 if pose != "sit" else h * 0.5)
    t = np.linspace(0, 2 * np.pi, 12, endpoint=False)
    head = np.stack([x + h * 0.08 * np.cos(t), top - h * 0.09 + h * 0.09 * np.sin(t)], 1)
    poly_block(P, pl, head, "wall", key=1.4)
    if hat:
        hp = np.array([(x - h * 0.2, top - h * 0.1), (x, top - h * 0.28), (x + h * 0.2, top - h * 0.1)])
        poly_block(P, pl, hp, hat, key=1.4)
    if pose == "walk":
        P.strokes(pl, [[(x - h * 0.06, base), (x - h * 0.12, base + h * 0.05)], [(x + h * 0.06, base), (x + h * 0.1, base + h * 0.05)]],
                  1.6, alpha=0.8, smooth=False)


def crowd(P, pl, x0, x1, base, h, n, seed=0, robes=("robe", "shu", "earth", "grey"), hats=0.4):
    rng = np.random.default_rng(seed)
    xs = np.sort(rng.uniform(x0, x1, n))
    for i, x in enumerate(xs):
        figure(P, pl, x, base + rng.uniform(-4, 4), h * rng.uniform(0.9, 1.1), robe=robes[i % len(robes)],
               hat="straw" if rng.random() < hats else None, seed=seed + i)


_DEER_BODY = [(-0.48, -0.55), (-0.30, -0.66), (0.10, -0.64), (0.34, -0.63), (0.43, -0.50), (0.36, -0.38), (0.0, -0.35),
              (-0.38, -0.37), (-0.51, -0.46)]
_DEER_NECK = [(0.26, -0.62), (0.38, -0.86), (0.49, -0.93), (0.53, -0.84), (0.44, -0.52)]
_DEER_HEAD = [(0.44, -0.96), (0.57, -0.99), (0.73, -0.87), (0.71, -0.82), (0.52, -0.83)]
_DEER_EAR = [(0.47, -0.95), (0.40, -1.07), (0.52, -0.97)]
_DEER_LEGS = [[(-0.40, -0.40), (-0.45, -0.20), (-0.41, 0.0)], [(-0.29, -0.38), (-0.30, -0.18), (-0.27, 0.0)],
              [(0.27, -0.40), (0.29, -0.2), (0.30, 0.0)], [(0.37, -0.42), (0.42, -0.22), (0.39, 0.0)]]


def deer(P, pl, x, base, h, flip=False, color="deer", graze=False):
    """A sika deer of Nara, standing (or grazing, head down)."""
    s = -1 if flip else 1

    def tr(pts):
        a = np.asarray(pts, float)
        return np.stack([x + s * a[:, 0] * h, base + a[:, 1] * h], 1)

    neck_pts, head_pts, ear_pts = _DEER_NECK, _DEER_HEAD, _DEER_EAR
    if graze:
        neck_pts = [(0.26, -0.62), (0.44, -0.47), (0.56, -0.24), (0.49, -0.19), (0.38, -0.46)]
        head_pts = [(0.49, -0.26), (0.61, -0.22), (0.66, -0.05), (0.60, -0.03), (0.50, -0.15)]
        ear_pts = [(0.53, -0.23), (0.46, -0.33), (0.57, -0.26)]
    body = catmull_rom(tr(_DEER_BODY), 3, closed=True)
    neck = catmull_rom(tr(neck_pts), 3, closed=True)
    head = catmull_rom(tr(head_pts), 3, closed=True)
    ear = tr(ear_pts)
    legs = [tr(l) for l in _DEER_LEGS]
    m = P.mask([body, neck, head, ear])
    P.block(pl, m, color, alpha=1.0, grain=0.2, knock=True)
    P.key(pl, legs, max(3.5, h * 0.045), color=color, alpha=1.0, smooth=True, taper=(0, 0.2), cover=True)
    P.edge(pl, m, 1.5)
    rng = np.random.default_rng(int(x) + int(base))
    spots = []
    for _ in range(9):
        sx, sy = rng.uniform(-0.32, 0.22), rng.uniform(-0.6, -0.48)
        t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
        spots.append(np.stack([x + s * sx * h + 0.018 * h * np.cos(t), base + sy * h + 0.012 * h * np.sin(t)], 1))
    P.block(pl, P.mask(spots), "wall", alpha=0.85, cover=False)
    tail = tr([(-0.50, -0.55), (-0.56, -0.5), (-0.5, -0.47)])
    P.block(pl, P.mask(tail), "wall", alpha=1.0, knock=True)


# ------------------------------------------------------------------ ships
def junk(P, pl, x, y, L, tilt=0.0, sail="brick", flip=False, seed=0):
    """A Yuan war junk: a high-sterned hull and battened lug sails."""
    rng = np.random.default_rng(seed)
    s = -1 if flip else 1
    c, sn = math.cos(tilt), math.sin(tilt)

    def T(pts):
        a = np.asarray(pts, float)
        px, py = a[:, 0] * s, a[:, 1]
        return np.stack([x + px * c - py * sn, y + px * sn + py * c], 1)

    hull = T([(-0.5 * L, -0.16 * L), (-0.42 * L, -0.02 * L), (0.35 * L, 0.0), (0.52 * L, -0.12 * L), (0.5 * L, -0.2 * L),
              (0.3 * L, -0.13 * L), (-0.3 * L, -0.13 * L), (-0.48 * L, -0.26 * L)])
    poly_block(P, pl, hull, "wood", key=2.4)
    P.strokes(pl, [T([(-0.4 * L, -0.08 * L), (0.4 * L, -0.07 * L)])], 1.6, alpha=0.6, smooth=False)
    for k, (mx, mh, sw) in enumerate(((-0.18, 0.95, 0.34), (0.15, 0.8, 0.28), (0.36, 0.55, 0.18))):
        mast = T([(mx * L, -0.13 * L), (mx * L, -(0.13 + mh) * L)])
        P.key(pl, mast, max(3, L * 0.012), smooth=False, taper=(0, 0))
        top = -(0.13 + mh * 0.95) * L
        bot = -(0.13 + mh * 0.25) * L
        sp = T([(mx * L - sw * L * 0.45, top), (mx * L + sw * L * 0.55, top + 0.03 * L), (mx * L + sw * L * 0.6, bot),
                (mx * L - sw * L * 0.5, bot + 0.02 * L)])
        poly_block(P, pl, sp, sail, key=2.0)
        n = 6
        bat = []
        for j in range(1, n):
            f = j / n
            yy = top + (bot - top) * f
            bat.append(T([(mx * L - sw * L * 0.48, yy + 0.01 * L), (mx * L + sw * L * 0.58, yy + 0.015 * L)]))
        P.strokes(pl, bat, 1.8, alpha=0.7, smooth=False)


def stone_wall(P, pl, x0, x1, top, base, color="grey", seed=0):
    """A low wall of piled stones along the shore, as at Hakata Bay."""
    rng = np.random.default_rng(seed)
    wall = A_rect = np.array([(x0, base), (x0 + 20, top), (x1 - 20, top), (x1, base)], float)
    poly_block(P, pl, wall, color, key=2.4)
    stones = []
    y = top + 12
    while y < base - 6:
        x = x0 + 20 + rng.uniform(0, 30)
        while x < x1 - 30:
            w = rng.uniform(30, 60)
            stones.append([(x, y), (x + w, y)])
            x += w + 6
        y += 22
    P.strokes(pl, stones, 1.6, alpha=0.6, smooth=False)


def banner(P, pl, x, base, h, color="wall", mon=None):
    """A tall nobori banner on a pole."""
    P.key(pl, np.array([(x, base), (x, base - h)]), max(3, h * 0.012), smooth=False, taper=(0, 0))
    w = h * 0.16
    b = rect(x, base - h * 0.95, x + w, base - h * 0.25)
    poly_block(P, pl, b, color, key=1.8)
    if mon:
        t = np.linspace(0, 2 * np.pi, 20, endpoint=False)
        cx, cy, r = x + w / 2, base - h * 0.8, w * 0.28
        poly_block(P, pl, np.stack([cx + r * np.cos(t), cy + r * np.sin(t)], 1), mon, key=1.4)


# ------------------------------------------------------------------ castle, bridge, storehouses
def castle(P, pl, cx, base, w, h, snow=False, lights=False):
    """A castle keep in the manner of Himeji: a battered stone base, white
    plastered storeys with dark windows, stacked roofs with gables."""
    bh = h * 0.28
    xs = np.linspace(-1, 1, 30)
    left = [(cx - w * 0.62 + w * 0.08 * (1 - (1 - t) ** 2), base - bh * t) for t in np.linspace(0, 1, 12)]
    right = [(cx + w * 0.62 - w * 0.08 * (1 - (1 - t) ** 2), base - bh * t) for t in np.linspace(1, 0, 12)]
    stone = np.array(left + right)
    poly_block(P, pl, stone, "grey", key=2.4)
    rng = np.random.default_rng(3)
    ls = []
    for j in range(1, 9):
        y = base - bh * j / 9
        ls.append([(cx - w * 0.6 + w * 0.08 * j / 9, y), (cx + w * 0.6 - w * 0.08 * j / 9, y)])
    P.strokes(pl, ls, 1.4, alpha=0.5, smooth=False)
    y = base - bh
    tiers = 5
    ww = w * 1.0
    th = (h - bh) / tiers
    for k in range(tiers):
        wh = th * 0.55
        walls(P, pl, cx - ww / 2, cx + ww / 2, y - wh, y, panel="wall", post="wall", posts=max(3, int(ww / 70)), rail=False,
              windows="light" if lights else "sumi")
        y -= wh
        roof(P, pl, cx, y + th * 0.08, ww * 1.25, th * 0.5, color="roof", ridge=0.45 if k == tiers - 1 else 0.7,
             lift=th * 0.12, gable=(k % 2 == 1) or k == tiers - 1, shibi="gold" if k == tiers - 1 else None,
             eave="wall", snow=snow)
        y -= th * 0.42
        ww *= 0.8


def arched_bridge(P, pl, x0, x1, y_deck, rise, color="wood", posts=True, water=None):
    """A wooden arched bridge: a curved deck on piers, with railings."""
    xs = np.linspace(x0, x1, 60)
    t = (xs - x0) / (x1 - x0)
    top = y_deck - rise * np.sin(np.pi * t)
    deck = np.vstack([np.stack([xs, top], 1), np.stack([xs[::-1], top[::-1] + 26], 1)])
    poly_block(P, pl, deck, color, key=2.4)
    rail = np.vstack([np.stack([xs, top - 46], 1), np.stack([xs[::-1], top[::-1] - 36], 1)])
    poly_block(P, pl, rail, color, key=2.0)
    ps = [[(x, np.interp(x, xs, top) - 44), (x, np.interp(x, xs, top))] for x in np.linspace(x0 + 20, x1 - 20, 22)]
    P.strokes(pl, ps, 3.0, alpha=0.9, smooth=False, cover=True)
    if posts and water is not None:
        piers = []
        for x in np.linspace(x0 + 80, x1 - 80, 7):
            yt = np.interp(x, xs, top) + 26
            piers.append(rect(x - 8, yt, x + 8, water))
            piers.append(rect(x + 30 - 8, yt, x + 30 + 8, water))
        m = P.mask(piers)
        P.block(pl, m, color, alpha=1.0, knock=True)
        P.edge(pl, m, 1.6)
    return xs, top


def kura(P, pl, x, base, w, h, lights=False):
    """A white-walled storehouse with a black tiled roof and a dark skirt."""
    walls(P, pl, x - w / 2, x + w / 2, base - h, base, panel="wall", post="wall", posts=1, rail=False)
    skirt = rect(x - w / 2, base - h * 0.3, x + w / 2, base)
    poly_block(P, pl, skirt, "roof", key=2.0)
    P.strokes(pl, [[(x - w / 2, base - h * 0.3 + k * h * 0.075), (x + w / 2, base - h * 0.3 + k * h * 0.075)] for k in range(1, 4)],
              1.4, color="wall", alpha=0.7, smooth=False)
    win = rect(x - w * 0.12, base - h * 0.78, x + w * 0.12, base - h * 0.58)
    poly_block(P, pl, win, "light" if lights else "sumi", key=1.6)
    roof(P, pl, x, base - h + 6, w * 1.2, h * 0.34, color="roof", ridge=0.85, lift=6, hipped=False, eave="roof")


# ------------------------------------------------------------------ Meiji
def locomotive(P, pl, x, rail_y, L, lights=False, carriages=3, smoke=True):
    """An early British-built tank engine and four-wheeled carriages, as on
    the Shinbashi-Yokohama line of 1872."""
    body = rect(x, rail_y - L * 0.34, x + L * 0.62, rail_y - L * 0.14)
    poly_block(P, pl, body, "steel", key=2.2)
    cab = rect(x + L * 0.45, rail_y - L * 0.56, x + L * 0.72, rail_y - L * 0.14)
    poly_block(P, pl, cab, "steel", key=2.2)
    cr = rect(x + L * 0.43, rail_y - L * 0.6, x + L * 0.75, rail_y - L * 0.55)
    poly_block(P, pl, cr, "sumi", key=1.6)
    win = rect(x + L * 0.53, rail_y - L * 0.5, x + L * 0.64, rail_y - L * 0.38)
    poly_block(P, pl, win, "light" if lights else "sky_low", key=1.4)
    chimney = np.array([(x + L * 0.06, rail_y - L * 0.34), (x + L * 0.14, rail_y - L * 0.34), (x + L * 0.16, rail_y - L * 0.58),
                        (x + L * 0.04, rail_y - L * 0.58)])
    poly_block(P, pl, chimney, "sumi", key=1.6)
    dome = np.array([(x + L * 0.26, rail_y - L * 0.34), (x + L * 0.28, rail_y - L * 0.42), (x + L * 0.34, rail_y - L * 0.42),
                     (x + L * 0.36, rail_y - L * 0.34)])
    poly_block(P, pl, dome, "gold", key=1.4, smooth=True)
    for wx in (0.12, 0.32, 0.55):
        t = np.linspace(0, 2 * np.pi, 24, endpoint=False)
        r = L * 0.085
        poly_block(P, pl, np.stack([x + L * wx + r * np.cos(t), rail_y - r + r * np.sin(t)], 1), "shu", key=1.8)
    cx = x + L * 0.78
    for k in range(carriages):
        cw = L * 0.6
        c = rect(cx, rail_y - L * 0.42, cx + cw, rail_y - L * 0.12)
        poly_block(P, pl, c, "brick" if k % 2 == 0 else "robe", key=2.0)
        rf = np.array([(cx - 6, rail_y - L * 0.42), (cx + cw + 6, rail_y - L * 0.42), (cx + cw, rail_y - L * 0.47), (cx, rail_y - L * 0.47)])
        poly_block(P, pl, rf, "roof", key=1.6)
        for j in range(5):
            wx0 = cx + cw * (0.07 + j * 0.18)
            poly_block(P, pl, rect(wx0, rail_y - L * 0.37, wx0 + cw * 0.11, rail_y - L * 0.26), "light" if lights else "sky_low",
                       key=1.2)
        for wx in (0.2, 0.8):
            t = np.linspace(0, 2 * np.pi, 20, endpoint=False)
            r = L * 0.06
            poly_block(P, pl, np.stack([cx + cw * wx + r * np.cos(t), rail_y - r + r * np.sin(t)], 1), "sumi", key=1.4)
        cx += cw + L * 0.05
    if smoke:
        puffs = []
        for k in range(9):
            px = x + L * 0.1 + k * L * 0.28
            py = rail_y - L * 0.72 - k * L * 0.05 - math.sin(k) * 10
            r = L * (0.09 + k * 0.02)
            t = np.linspace(0, 2 * np.pi, 16, endpoint=False)
            puffs.append(np.stack([px + r * np.cos(t) * 1.3, py + r * np.sin(t)], 1))
        m = P.mask(puffs)
        P.block(pl, m, "smoke", alpha=0.9, knock=True, bokashi=P.hgrad(x, x + L * 2.6, 1.0, 0.3))
        P.edge(pl, m, 1.6, alpha=0.6)


def telegraph(P, pl, xs, base, h):
    ls = []
    tops = []
    for x in xs:
        ls.append([(x, base), (x, base - h)])
        ls.append([(x - h * 0.08, base - h * 0.92), (x + h * 0.08, base - h * 0.92)])
        tops.append((x, base - h * 0.92))
    P.strokes(pl, ls, max(3, h * 0.015), color="wood", alpha=1.0, smooth=False, cover=True)
    wires = []
    for (a, b) in zip(tops[:-1], tops[1:]):
        for dy in (-h * 0.0, h * 0.04):
            mx = (a[0] + b[0]) / 2
            wires.append([(a[0], a[1] + dy), (mx, a[1] + dy + h * 0.05), (b[0], b[1] + dy)])
    P.strokes(pl, wires, 1.4, alpha=0.7)


def gaslamp(P, pl, x, base, h, lit=False):
    P.key(pl, np.array([(x, base), (x, base - h)]), max(4, h * 0.03), color="steel", smooth=False, taper=(0, 0))
    lamp = np.array([(x - h * 0.07, base - h), (x + h * 0.07, base - h), (x + h * 0.1, base - h * 1.18), (x - h * 0.1, base - h * 1.18)])
    poly_block(P, pl, lamp, "light" if lit else "wall", key=1.8)
    cap = np.array([(x - h * 0.12, base - h * 1.18), (x + h * 0.12, base - h * 1.18), (x, base - h * 1.28)])
    poly_block(P, pl, cap, "steel", key=1.6)
    if lit:
        t = np.linspace(0, 2 * np.pi, 30, endpoint=False)
        r = h * 0.3
        m = P.mask(np.stack([x + r * np.cos(t), base - h * 1.09 + r * np.sin(t)], 1), feather=12)
        P.block(pl, m, "light", alpha=0.35, cover=False)


def brick_building(P, pl, x0, x1, base, h, lights=False, floors=2):
    body = rect(x0, base - h, x1, base)
    poly_block(P, pl, body, "brick", key=2.4)
    ls = [[(x0, base - h + k * 18), (x1, base - h + k * 18)] for k in range(1, int(h / 18))]
    P.strokes(pl, ls, 1.0, color="earth_dark", alpha=0.35, smooth=False)
    arcade = []
    n = max(3, int((x1 - x0) / 110))
    for f in range(floors):
        fy = base - h * (f + 1) / (floors + 0.3) + 10
        for k in range(n):
            wx = x0 + (x1 - x0) * (k + 0.5) / n
            ww = (x1 - x0) / n * 0.45
            wh = h / (floors + 0.3) * 0.55
            win = np.array([(wx - ww / 2, fy + wh), (wx - ww / 2, fy + wh * 0.25), (wx, fy), (wx + ww / 2, fy + wh * 0.25), (wx + ww / 2, fy + wh)])
            poly_block(P, pl, win, "light" if lights else "sumi", key=1.6, smooth=False)
    cornice = rect(x0 - 10, base - h - 18, x1 + 10, base - h)
    poly_block(P, pl, cornice, "wall", key=2.0)


# ------------------------------------------------------------------ Showa and after
def dome_ruin(P, pl, cx, base, w, h, lights=False):
    """The Hiroshima Prefectural Industrial Promotion Hall as it stands today,
    the A-Bomb Dome: a ruined facade and the bare steel frame of its dome."""
    # main block, broken along the top
    bw = w
    wall_top = base - h * 0.52
    body = [(cx - bw / 2, base), (cx - bw / 2, wall_top + 40), (cx - bw * 0.36, wall_top + 10), (cx - bw * 0.22, wall_top + 60),
            (cx - bw * 0.16, wall_top), (cx + bw * 0.16, wall_top), (cx + bw * 0.24, wall_top + 50), (cx + bw * 0.38, wall_top + 20),
            (cx + bw / 2, wall_top + 70), (cx + bw / 2, base)]
    poly_block(P, pl, body, "earth", key=2.6)
    P.block(pl, P.mask(np.array(body)), "earth_dark", alpha=0.6, bokashi=P.vgrad(wall_top, base, 0.0, 1.0), cover=False)
    wins = []
    for f in range(3):
        fy = wall_top + 90 + f * (base - wall_top - 110) / 3
        for k in range(9):
            wx = cx - bw / 2 + bw * (k + 0.5) / 9
            wins.append(rect(wx - bw * 0.022, fy, wx + bw * 0.022, fy + (base - wall_top) * 0.17))
    m = P.mask(wins)
    P.block(pl, m, "sumi", alpha=0.85, knock=True)
    # the stair tower and the drum under the dome
    drum = rect(cx - w * 0.14, base - h * 0.72, cx + w * 0.14, wall_top + 4)
    poly_block(P, pl, drum, "earth", key=2.4)
    dw = []
    for k in range(5):
        wx = cx - w * 0.12 + k * w * 0.06
        dw.append(rect(wx, base - h * 0.69, wx + w * 0.03, base - h * 0.6))
    P.block(pl, P.mask(dw), "sumi", alpha=0.85, knock=True)
    # dome frame: meridian ribs and rings
    dcx, dcy, rx, ry = cx, base - h * 0.72, w * 0.15, h * 0.26
    ribs = []
    for k in range(9):
        f = -1 + 2 * k / 8
        pts = [(dcx + rx * f * math.cos(a), dcy - ry * math.sin(a)) for a in np.linspace(0, np.pi / 2, 16)]
        ribs.append(pts)
    for j in range(1, 4):
        a = np.pi / 2 * j / 4
        ribs.append([(dcx + rx * math.cos(a) * math.cos(b), dcy - ry * math.sin(a)) for b in np.linspace(np.pi, 0, 20)])
    P.strokes(pl, ribs, 3.2, color="steel", alpha=1.0, cover=True)
    top = np.array([(dcx - 18, dcy - ry - 4), (dcx + 18, dcy - ry - 4), (dcx + 12, dcy - ry + 10), (dcx - 12, dcy - ry + 10)])
    poly_block(P, pl, top, "steel", key=1.4)


def floating_lanterns(P, pl, x0, x1, y0, y1, n=40, seed=0):
    rng = np.random.default_rng(seed)
    items = []
    for _ in range(n):
        y = rng.uniform(y0, y1)
        f = (y - y0) / max(1, y1 - y0)
        x = rng.uniform(x0, x1)
        s = 26 + 40 * f
        items.append((y, x, s))
    items.sort()
    for y, x, s in items:
        box = rect(x - s * 0.5, y - s * 0.9, x + s * 0.5, y)
        m = P.mask(box)
        P.uncover(pl, m)
        P.cover(pl, m)
        P.block(pl, m, "light", alpha=1.0, cover=False, bokashi=P.vgrad(y - s, y, 0.6, 1.0))
        P.outline(pl, box, 1.6)
        base_ = rect(x - s * 0.58, y, x + s * 0.58, y + s * 0.12)
        poly_block(P, pl, base_, "wood", key=1.2)
        t = np.linspace(0, 2 * np.pi, 20, endpoint=False)
        refl = np.stack([x + s * 0.4 * np.cos(t), y + s * 0.5 + s * 0.35 * np.sin(t)], 1)
        m = P.mask(refl, feather=4)
        P.block(pl, m, "light", alpha=0.5, cover=False)


def shinkansen(P, pl, x, rail_y, L, lights=False, cars=3):
    """The original bullet train of 1964 (0 series): ivory with a blue band
    and a rounded nose, running right to left."""
    h = L * 0.13
    nose_l = L * 0.22
    for k in range(cars):
        x0 = x + nose_l + k * L * 0.36 if k else x
        if k == 0:
            pts = [(x, rail_y - h * 0.18), (x + nose_l * 0.25, rail_y - h * 0.62), (x + nose_l * 0.7, rail_y - h * 0.96),
                   (x + nose_l + L * 0.3, rail_y - h), (x + nose_l + L * 0.3, rail_y), (x + nose_l * 0.1, rail_y)]
            body = catmull_rom(np.array(pts), 4, closed=True)
            xe = x + nose_l + L * 0.3
        else:
            xs_ = x + nose_l + L * 0.3 + (k - 1) * L * 0.33 + 8
            body = rect(xs_, rail_y - h, xs_ + L * 0.33 - 8, rail_y)
            xe = xs_ + L * 0.33 - 8
        poly_block(P, pl, body, "wall", key=2.2)
        m = P.mask(body)
        band = P.band(rail_y - h * 0.42, rail_y - h * 0.2)
        a, bb = m
        P.block(pl, (a * band[0][bb[0]:bb[1], bb[2]:bb[3]], bb), "robe", alpha=1.0, cover=False)
        skirt = P.band(rail_y - h * 0.14, rail_y)
        P.block(pl, (a * skirt[0][bb[0]:bb[1], bb[2]:bb[3]], bb), "roof", alpha=0.6, cover=False)
        wx0 = body[:, 0].min() + (nose_l * 1.05 if k == 0 else 20)
        wins = []
        while wx0 < xe - 30:
            wins.append(rect(wx0, rail_y - h * 0.8, wx0 + L * 0.012, rail_y - h * 0.56))
            wx0 += L * 0.022
        P.block(pl, P.mask(wins), "light" if lights else "robe", alpha=0.95, knock=True)
    wind = np.array([(x + nose_l * 0.42, rail_y - h * 0.8), (x + nose_l * 0.72, rail_y - h * 0.95), (x + nose_l * 0.85, rail_y - h * 0.9),
                     (x + nose_l * 0.8, rail_y - h * 0.66), (x + nose_l * 0.5, rail_y - h * 0.62)])
    poly_block(P, pl, wind, "light" if lights else "sky_top", key=1.6)


def truss_bridge(P, pl, x0, x1, deck, h, pier_bottom):
    ls = []
    n = int((x1 - x0) / 120)
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        ls.append([(x, deck), (x, deck - h)])
        if k < n:
            xn = x0 + (x1 - x0) * (k + 1) / n
            ls.append([(x, deck), (xn, deck - h)] if k % 2 == 0 else [(x, deck - h), (xn, deck)])
    ls.append([(x0, deck - h), (x1, deck - h)])
    ls.append([(x0, deck), (x1, deck)])
    P.strokes(pl, ls, 4.0, color="steel", alpha=1.0, smooth=False, cover=True)
    piers = [rect(x - 22, deck, x + 22, pier_bottom) for x in np.linspace(x0 + 200, x1 - 200, 5)]
    m = P.mask(piers)
    P.block(pl, m, "grey", alpha=1.0, knock=True)
    P.edge(pl, m, 1.8)


def girder_bridge(P, pl, x0, x1, deck, depth, pier_bottom, span=520):
    """A steel plate-girder railway bridge: a deep web with stiffeners, a rail
    on top, and concrete piers standing in the river."""
    xs = np.arange(x0 + span * 0.5, x1, span)
    piers = [np.array([(x - 30, deck + depth), (x + 30, deck + depth), (x + 40, pier_bottom), (x - 40, pier_bottom)])
             for x in xs]
    for pr in piers:
        poly_block(P, pl, pr, "grey", key=1.6, bokashi=P.vgrad(deck, pier_bottom, 1.0, 0.7))
    web = rect(x0, deck, x1, deck + depth)
    poly_block(P, pl, web, "steel", key=2.0, bokashi=P.vgrad(deck, deck + depth, 0.8, 1.0))
    ls = [[(x, deck + 6), (x, deck + depth - 6)] for x in np.arange(x0 + 20, x1, 44)]
    ls += [[(x0, deck + depth * 0.5), (x1, deck + depth * 0.5)]]
    P.strokes(pl, ls, 1.6, color="sumi", alpha=0.45, smooth=False)
    # a gap between spans over each pier
    P.strokes(pl, [[(x, deck), (x, deck + depth)] for x in xs], 3.0, color="paper", alpha=0.9, smooth=False)
    P.key(pl, [(x0, deck), (x1, deck)], 3.0, smooth=False)
    # the catenary: masts along the parapet carrying the overhead wire
    masts = [[(x, deck), (x, deck - depth * 4.4)] for x in np.arange(x0 + 40, x1, span / 2)]
    P.strokes(pl, masts, 3.4, color="steel", alpha=1.0, smooth=False, cover=True)
    P.strokes(pl, [[(x - 40, deck - depth * 4.2), (x + 40, deck - depth * 4.2)] for x in np.arange(x0 + 40, x1, span / 2)],
              2.4, color="steel", alpha=1.0, smooth=False, cover=True)
    P.strokes(pl, [[(x0, deck - depth * 4.0), (x1, deck - depth * 4.0)]], 1.4, color="sumi", alpha=0.7, smooth=False,
              cover=True)
    return xs
