"""The prints: one scene per era, each rendered by day and by night.

Every scene function takes a Print and paints it plane by plane, back to
front. SCENES holds each scene's function, seed, the horizontal focus used to
crop it for phones, and its title cartouche.
"""
import math

import numpy as np

import motifs as M
from hanga import catmull_rom, smoothstep


def cartouche(P, pl, x, y, title, sub=None, color="ki", size=78):
    """Title cartouche in the top right corner, as on a landscape print."""
    n = len(title)
    w = size * 1.5
    h = size * (n * 1.08 + 0.7)
    box = np.array([(x - w / 2, y), (x + w / 2, y), (x + w / 2, y + h), (x - w / 2, y + h)])
    m = P.mask(box)
    P.block(pl, m, color, alpha=0.95, bokashi=P.vgrad(y, y + h, 1.0, 0.55), grain=0.15, pool=0.05, shift=False)
    P.outline(pl, box, 3.0)
    P.text(pl, title, x, y + size * 0.2, size, font="yuji")
    if sub:
        k = len(sub)
        w2 = size * 0.95
        h2 = size * 0.62 * (k * 1.08 + 0.7)
        x2 = x - w / 2 - w2 / 2 - 18
        box2 = np.array([(x2 - w2 / 2, y), (x2 + w2 / 2, y), (x2 + w2 / 2, y + h2), (x2 - w2 / 2, y + h2)])
        m = P.mask(box2)
        P.block(pl, m, "kasumi_w", alpha=0.9, grain=0.1, pool=0.05, shift=False)
        P.outline(pl, box2, 2.4)
        P.text(pl, sub, x2, y + size * 0.62 * 0.25, size * 0.62, font="mincho")


# ---------------------------------------------------------------- hero
def hero(P):
    """Sunrise over the eastern sea: the name Nihon, 'origin of the sun'."""
    H = 1240
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2860, H))
    if P.night:
        M.stars(P, back, 140, H - 260, seed=4)
        M.disc(P, back, 2860, 560, 118, "moon", halo=True, light=True)
    else:
        M.disc(P, back, 2860, H - 40, 170, "sun", halo="glow")
    M.cloud_band(P, back, 1900, 3840 + 200, 470, 70, color="kasumi", alpha=0.85, lobes=3, seed=2)
    M.cloud_band(P, back, 2450, 3700, 330, 46, color="kasumi", alpha=0.7, seed=3)
    M.cloud_band(P, back, -200, 1300, 700, 60, color="kasumi_w", alpha=0.6, seed=5)
    # far islands on the horizon
    M.ridge(P, back, [(1400, H), (1620, H - 70), (1790, H - 95), (1980, H - 50), (2140, H)], H + 4, "far",
            key=False, top_col="far2", top_depth=60)
    M.ridge(P, back, [(3300, H), (3450, H - 60), (3620, H - 80), (3840, H - 40)], H + 4, "far", key=False,
            top_col="far2", top_depth=50)
    M.sea(P, back, H, moon_path=(2860, 160) if P.night else None, seed=1)
    if not P.night:
        # the sun's path on the water
        rng = np.random.default_rng(7)
        seg = []
        y = H + 10
        while y < 2160:
            spread = 60 + (y - H) * 0.35
            for _ in range(3):
                xx = 2860 + rng.normal(0, spread * 0.4)
                L = rng.uniform(30, 120)
                seg.append([(xx - L / 2, y), (xx + L / 2, y)])
            y += 12 + (y - H) * 0.03
        P.strokes(back, seg, 4.0, color="sun", alpha=0.55, smooth=False)
    M.birds(P, back, [(2380, 820, 1.0), (2460, 780, 0.9), (2520, 850, 0.8), (2600, 800, 0.75), (2300, 870, 0.7)],
            size=24)
    P.commit(back)

    mid = P.plane("L1")
    M.island(P, mid, 3050, 3560, 1330, 150, seed=3, pines=2, pine_h=260)
    M.island(P, mid, 3420, 3840 + 100, 1390, 250, seed=5, pines=2, pine_h=300)
    M.island(P, mid, 2660, 2900, 1320, 80, seed=8, pines=1, pine_h=170)
    M.boat(P, mid, 2140, 1470, 180, sail=True, seed=2)
    P.commit(mid)

    front = P.plane("L2")
    M.wave_crest(P, front, 2350, 1330, 1650, 900, seed=4)
    M.wave_crest(P, front, 1500, 1830, 800, 420, seed=6)
    M.spray(P, front, 2800, 1330, 330, 150, n=90, seed=9)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "日出", "日本")
    P.commit(cart)


SCENES = {
    "hero": {"fn": hero, "seed": 11, "focus": 0.72, "layered": True},
}


def ground(P, pl, y, color="field", dark="hill_dark", depth=900):
    m = P.band(y, 2200)
    P.cover(pl, m)
    P.block(pl, m, color, alpha=1.0, bokashi=P.vgrad(y, y + depth, 0.75, 1.0), grain=0.3, pool=0)
    P.block(pl, m, dark, alpha=0.5, bokashi=P.vgrad(y + depth * 0.3, 2160, 0.0, 1.0), grain=0.3, pool=0)


def grass(P, pl, x0, x1, y, n=120, h=60, seed=0, color="hill_dark", alpha=0.7):
    rng = np.random.default_rng(seed)
    ls = []
    for _ in range(n):
        x = rng.uniform(x0, x1)
        yy = y + rng.uniform(-20, 20)
        hh = h * rng.uniform(0.5, 1.2)
        ls.append([(x, yy), (x + rng.uniform(-12, 12), yy - hh * 0.6), (x + rng.uniform(-24, 24), yy - hh)])
    P.strokes(pl, ls, 2.2, color=color, alpha=alpha)


# ---------------------------------------------------------------- Jomon
def jomon(P):
    """Sannai-Maruyama, a great Jomon settlement near Aomori, c. 3000 BCE:
    pit dwellings, a longhouse, the six-pillar tower, chestnut woods."""
    import arch as A
    H = 1120
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(3300, H - 60))
    if P.night:
        M.stars(P, back, 170, H - 200, seed=7)
        M.disc(P, back, 900, 420, 70, "moon", halo=True, light=True)
    M.cloud_band(P, back, 1700, 3400, 330, 60, color="kasumi", alpha=0.75, lobes=2, seed=1)
    M.cloud_band(P, back, 2600, 4000, 520, 44, color="kasumi_w", alpha=0.6, seed=2)
    M.ridge(P, back, [(-50, H - 60), (400, H - 170), (900, H - 110), (1500, H - 230), (2100, H - 120), (2700, H - 200),
                      (3300, H - 90), (3900, H - 150)], H + 40, "far", key=False, top_col="far2", top_depth=90)
    # a glimpse of Mutsu Bay
    sea = P.band(H - 20, H + 30)
    P.block(back, sea, "sea_far", alpha=0.9, grain=0.2)
    M.ridge(P, back, [(-50, H + 20), (600, H - 60), (1300, H), (2000, H - 50), (2800, H + 10), (3900, H - 40)], H + 220,
            "hill", top_col="hill_dark", top_depth=160, key_w=2.6)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, 1260, color="field", dark="hill_dark", depth=900)
    rng = np.random.default_rng(5)
    # chestnut wood behind the village: a far row, then taller trees
    for i, x in enumerate(np.linspace(900, 3950, 22)):
        A.canopy(P, mid, x + rng.uniform(-50, 50), 1215 + rng.uniform(-25, 25), rng.uniform(110, 170), rng.uniform(60, 90),
                 "hill_dark", "pine_dark", seed=40 + i, dot_n=0, key=2.0)
    for i, x in enumerate([1350, 1900, 2560, 3350]):
        A.tree(P, mid, x + rng.uniform(-60, 60), 1330, rng.uniform(380, 480), fill="hill", dark="hill_dark", seed=60 + i,
               crowns=2, dot_n=25, light="green_pale")
    M.mist(P, mid, 700, 3100, 1330, 70, seed=3, lobes=5)
    A.tower(P, mid, 3050, 1600, 340, 720)
    A.pit_house(P, mid, 2330, 1560, 580, 260, smoke=True, seed=1, light=P.night)
    A.pit_house(P, mid, 1760, 1620, 280, 180, seed=2, light=P.night)
    A.pit_house(P, mid, 1360, 1700, 240, 150, seed=6, light=P.night)
    A.pit_house(P, mid, 2700, 1700, 320, 200, smoke=True, seed=3, light=P.night)
    A.pit_house(P, mid, 3480, 1780, 330, 210, seed=4, light=P.night)
    A.pit_house(P, mid, 2080, 1840, 380, 230, seed=7, light=P.night)
    M.tufts(P, mid, 0, 3840, 1400, 2100, n=260, seed=4, alpha=0.45)
    A.crowd(P, mid, 1860, 2150, 1740, 72, 3, seed=2, robes=("earth", "robe", "earth_dark"), hats=0)
    A.crowd(P, mid, 2850, 3000, 1850, 80, 2, seed=5, robes=("earth_dark", "earth"), hats=0)
    for (fx, fy) in ((2560, 1790), (3230, 1900)):
        A.poly_block(P, mid, [(fx - 26, fy), (fx - 10, fy - 50), (fx, fy - 76), (fx + 12, fy - 46), (fx + 26, fy)], "fire",
                     key=1.6, smooth=True)
    P.commit(mid)

    front = P.plane("L2")
    A.tree(P, front, 3740, 2240, 1150, fill="hill", dark="pine_dark", seed=3, crowns=3, dot_n=70, light="green_pale")
    M.susuki(P, front, 3230, 2200, 520, n=8, seed=2, lean=-0.4)
    M.susuki(P, front, 180, 2220, 440, n=6, seed=5, lean=0.5)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "縄文", "三内丸山")
    P.commit(cart)


SCENES["jomon"] = {"fn": jomon, "seed": 21, "focus": 0.66}


# ---------------------------------------------------------------- Kofun
def _keyhole(R):
    """Plan of a keyhole-shaped mound: a round rear part and a square front
    that widens toward its end (the front faces +x)."""
    a0 = math.asin(0.55)
    arc = [(R * math.cos(a), R * math.sin(a)) for a in np.linspace(a0, 2 * np.pi - a0, 60)]
    front = [(0.84 * R, -0.55 * R), (2.05 * R, -0.98 * R), (2.05 * R, 0.98 * R), (0.84 * R, 0.55 * R)]
    return np.array(arc + front)


def _plan_to_screen(pts, cx, cy, rot, squash, lift=0.0):
    c, s_ = math.cos(rot), math.sin(rot)
    x = pts[:, 0] * c - pts[:, 1] * s_
    y = pts[:, 0] * s_ + pts[:, 1] * c
    return np.stack([cx + x, cy + y * squash - lift], 1)


def kofun(P):
    """The age of the great tombs: a keyhole-shaped mound in its moats above
    the rice fields of the Yamato plain, a raised storehouse, planting."""
    import arch as A
    H = 900
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(900, H))
    if P.night:
        M.stars(P, back, 120, H - 150, seed=2)
        M.disc(P, back, 3200, 330, 80, "moon", halo=True, light=True)
    M.cloud_band(P, back, 2000, 3900, 250, 50, color="kasumi", alpha=0.8, lobes=2, seed=4)
    M.ridge(P, back, [(-60, H), (500, H - 190), (1000, H - 120), (1700, H - 260), (2300, H - 150), (2900, H - 300),
                      (3500, H - 180), (3950, H - 240)], H + 80, "far", key=False, top_col="far2", top_depth=110)
    M.ridge(P, back, [(-60, H + 60), (700, H - 60), (1500, H + 20), (2200, H - 90), (3000, H), (3950, H - 60)], H + 260,
            "hill", top_col="hill_dark", top_depth=140)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, 1040, color="field", dark="hill_dark", depth=1000)
    M.mist(P, mid, -100, 2400, 1080, 60, seed=6, lobes=4)
    # the mound, seen from above: bank, moat, three terraces under trees
    from scipy import ndimage as ndi
    cx, cy, rot, sq = 2500, 1300, -0.16, 0.42
    R = 420
    base = _keyhole(R)
    foot = catmull_rom(_plan_to_screen(base, cx, cy, rot, sq), 8, closed=True)
    fm = P.mask(foot, pad=160)
    a, bb = fm
    r1, r2 = int(70 * P.s), int(110 * P.s)
    yy, xx = np.ogrid[-r2:r2 + 1, -r2:r2 + 1]
    moat_a = ndi.grey_dilation(a, footprint=(xx ** 2 + (yy / 0.45) ** 2 <= r1 ** 2))
    bank_a = ndi.grey_dilation(a, footprint=(xx ** 2 + (yy / 0.45) ** 2 <= r2 ** 2))
    P.block(mid, (bank_a, bb), "hill", alpha=1.0, knock=True)
    P.edge(mid, (bank_a, bb), 2.2)
    P.block(mid, (moat_a, bb), "field_water", alpha=1.0, knock=True, bokashi=P.vgrad(cy - 300, cy + 300, 0.7, 1.0))
    P.edge(mid, (moat_a, bb), 2.0)
    if P.night:
        P.block(mid, (moat_a, bb), "sky_low", alpha=0.3, cover=False)
    for k, (sc_, lift) in enumerate(((1.0, 0), (0.82, 60), (0.64, 120))):
        tier = catmull_rom(_plan_to_screen(base * sc_, cx, cy, rot, sq, lift), 8, closed=True)
        side = catmull_rom(_plan_to_screen(base * sc_, cx, cy, rot, sq, lift - 55), 8, closed=True)
        m = P.mask([tier, side])
        P.block(mid, m, "pine_dark", alpha=1.0, knock=True)
        P.edge(mid, m, 1.8)
        tm = P.mask(tier)
        P.block(mid, tm, "pine", alpha=1.0, knock=True, bokashi=P.vgrad(cy - 300, cy + 200, 0.75, 1.0))
        P.edge(mid, tm, 1.8)
        rng = np.random.default_rng(k)
        ta, tb = tm
        dots = []
        xmin, xmax, ymin, ymax = tier[:, 0].min(), tier[:, 0].max(), tier[:, 1].min(), tier[:, 1].max()
        for _ in range(int(1100 * sc_)):
            x, y = rng.uniform(xmin, xmax), rng.uniform(ymin, ymax)
            t = np.linspace(0, 2 * np.pi, 7, endpoint=False)
            r = rng.uniform(5, 10)
            dots.append(np.stack([x + r * 1.3 * np.cos(t), y + r * 0.75 * np.sin(t)], 1))
        dm = P.mask(dots)
        da, db = dm
        full = np.zeros((P.H, P.W), np.float32)
        full[tb[0]:tb[1], tb[2]:tb[3]] = ta
        P.block(mid, (da * full[db[0]:db[1], db[2]:db[3]], db), "pine_dark", alpha=0.75, cover=False)
    # a village of thatched houses among trees beyond the tomb
    rng = np.random.default_rng(21)
    for i, x in enumerate(np.linspace(900, 1700, 5)):
        A.canopy(P, mid, x + rng.uniform(-30, 30), 1150 + rng.uniform(-10, 10), rng.uniform(90, 130), rng.uniform(55, 75),
                 "hill", "hill_dark", seed=200 + i, dot_n=0, key=2.0)
    for i, x in enumerate((1000, 1250, 1500)):
        A.pit_house(P, mid, x, 1215, 150, 90, seed=30 + i)
    # rice paddies in perspective
    rows = [1500, 1600, 1730, 1900, 2160]
    rng = np.random.default_rng(3)
    for r in range(len(rows) - 1):
        y0, y1 = rows[r], rows[r + 1]
        x = -200 + rng.uniform(0, 200)
        while x < 3900:
            w = rng.uniform(420, 760) * (0.6 + 0.4 * r)
            skew = (x + w / 2 - 1900) * 0.05
            quad = np.array([(x + 8, y0 + 6), (x + w - 8, y0 + 6), (x + w - 8 + skew, y1 - 6), (x + 8 + skew, y1 - 6)])
            wet = rng.random() < 0.6
            A.poly_block(P, mid, quad, "field_water" if wet else "field", key=1.8,
                         bokashi=P.vgrad(y0, y1, 1.0, 0.7))
            if wet:
                # rows of young rice
                ls = []
                for k in range(int(w / 40)):
                    xx = x + 20 + k * 40
                    for j in range(int((y1 - y0) / 30)):
                        yy = y0 + 18 + j * 30
                        ls.append([(xx + skew * (yy - y0) / (y1 - y0), yy), (xx + skew * (yy - y0) / (y1 - y0) + 2, yy - 10 - r * 3)])
                P.strokes(P_ := mid, ls, 1.8, color="hill_dark", alpha=0.6, smooth=False)
            x += w
    A.granary(P, mid, 3560, 1540, 230, 330)
    A.granary(P, mid, 3290, 1520, 170, 250)
    for i, (fx, fy) in enumerate([(1500, 1690), (1640, 1705), (1850, 1680), (2400, 1850), (2560, 1860)]):
        A.figure(P, mid, fx, fy, 85, robe=("robe", "earth", "robe", "earth_dark", "robe")[i], hat="straw", pose="sit", seed=i)
    if P.night:
        M.fireflies(P, mid, 900, 3800, 1450, 2000, n=70, seed=4)
    P.commit(mid)

    front = P.plane("L2")
    M.susuki(P, front, 3700, 2200, 560, n=8, seed=7, lean=-0.5)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "古墳", "大和")
    P.commit(cart)


SCENES["kofun"] = {"fn": kofun, "seed": 31, "focus": 0.68}


# ---------------------------------------------------------------- Nara
def nara(P):
    """Nara, the first great capital: the Hall of the Great Buddha at Todaiji
    with its golden ridge ornaments, a five-storied pagoda, deer, and the
    grassy hills of Wakakusa."""
    import arch as A
    H = 1250
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2600, H - 100))
    if P.night:
        M.stars(P, back, 110, H - 300, seed=5)
        M.disc(P, back, 1800, 380, 76, "moon", halo=True, light=True)
    M.cloud_band(P, back, 1500, 3200, 280, 54, color="kasumi", alpha=0.8, lobes=3, seed=5)
    M.cloud_band(P, back, 2800, 4000, 470, 40, color="kasumi_w", alpha=0.6, seed=6)
    # Wakakusa: three smooth grassy humps
    M.ridge(P, back, [(1200, H + 40), (1650, H - 280), (2050, H - 350), (2450, H - 330), (2850, H - 420), (3300, H - 300),
                      (3950, H - 250)], H + 200, "green_pale", top_col="hill", top_depth=200, key_w=2.6)
    M.ridge(P, back, [(-60, H - 60), (600, H - 200), (1300, H - 120), (1700, H + 60)], H + 100, "far", key=False,
            top_col="far2", top_depth=80)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, 1320, color="field", dark="hill_dark", depth=840)
    rng = np.random.default_rng(8)
    for i, x in enumerate(np.linspace(1300, 3900, 14)):
        A.canopy(P, mid, x + rng.uniform(-40, 40), 1260 + rng.uniform(-20, 20), rng.uniform(120, 170), rng.uniform(70, 95),
                 "pine", "pine_dark", seed=80 + i, dot_n=0, key=2.0)
    # the Great Buddha Hall: two roofs, the upper with golden shibi
    lights = "light"
    A.platform(P, mid, 1850, 3100, 1500, 36, color="grey", steps=(2380, 2570))
    A.walls(P, mid, 1950, 3000, 1330, 1500, posts=11, post="wood", windows=lights if P.night else None)
    A.roof(P, mid, 2475, 1340, 1350, 120, color="roof", ridge=0.84, lift=40)
    A.walls(P, mid, 2080, 2870, 1150, 1260, posts=9, post="wood")
    A.roof(P, mid, 2475, 1175, 1150, 250, color="roof", ridge=0.52, lift=55, gable=True, shibi="gold")
    # the pagoda
    A.pagoda(P, mid, 3330, 1470, 880, color="roof", post="shu")
    M.mist(P, mid, 900, 3700, 1480, 55, seed=8, lobes=5)
    # lantern and deer
    if P.night:
        pass
    P.commit(mid)

    front = P.plane("L2")
    ground_line = 1960
    A.deer(P, front, 2980, 1990, 230, flip=True)
    A.deer(P, front, 3260, 2040, 210, graze=True)
    A.deer(P, front, 2600, 1930, 170, flip=True, graze=True)
    M.tufts(P, front, 1000, 3840, 1700, 2150, n=160, seed=9, alpha=0.4)
    # stone lantern
    lx, lb = 3700, 2040
    A.poly_block(P, front, [(lx - 26, lb), (lx + 26, lb), (lx + 18, lb - 180), (lx - 18, lb - 180)], "grey")
    A.poly_block(P, front, [(lx - 60, lb - 180), (lx + 60, lb - 180), (lx + 50, lb - 205), (lx - 50, lb - 205)], "grey")
    A.poly_block(P, front, [(lx - 42, lb - 205), (lx + 42, lb - 205), (lx + 42, lb - 285), (lx - 42, lb - 285)],
                 "light" if P.night else "grey")
    A.poly_block(P, front, [(lx - 80, lb - 280), (lx + 80, lb - 280), (lx, lb - 360)], "grey", smooth=False)
    A.blossoms(P, front, 3900, 2300, 1150, seed=4, spread=0.9)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "奈良", "東大寺")
    P.commit(cart)


SCENES["nara"] = {"fn": nara, "seed": 41, "focus": 0.7}


# ---------------------------------------------------------------- Heian
def heian(P):
    """The Phoenix Hall of the Byodoin at Uji (1053): the Amida hall with its
    wings, as if alighting on the pond, doubled in the water."""
    import arch as A
    H = 1180
    WL = 1500  # waterline
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2700, H))
    if P.night:
        M.stars(P, back, 100, H - 300, seed=9)
        M.disc(P, back, 3050, 360, 90, "moon", halo=True, light=True)
    M.cloud_band(P, back, 1400, 3300, 300, 56, color="kasumi", alpha=0.8, lobes=3, seed=9)
    M.ridge(P, back, [(-60, H), (500, H - 160), (1200, H - 90), (1900, H - 230), (2600, H - 150), (3300, H - 260),
                      (3950, H - 150)], H + 120, "far", key=False, top_col="far2", top_depth=90)
    rng = np.random.default_rng(12)
    for i, x in enumerate(np.linspace(-100, 3950, 24)):
        A.canopy(P, back, x + rng.uniform(-40, 40), H + 80 + rng.uniform(-30, 30), rng.uniform(120, 170), rng.uniform(70, 100),
                 "hill" if i % 3 == 0 else "pine", "pine_dark", seed=120 + i, dot_n=0, key=2.0)
    P.commit(back)

    hallp = P.plane("L1")
    ground(P, hallp, 1380, color="field", dark="hill_dark", depth=300)
    cx = 2600
    # central hall with a pent roof and a high main roof, phoenixes on the ridge
    A.platform(P, hallp, cx - 330, cx + 330, WL - 60, 60, color="grey")
    A.walls(P, hallp, cx - 250, cx + 250, WL - 250, WL - 60, posts=5, post="shu", windows="light" if P.night else None)
    A.roof(P, hallp, cx, WL - 250, 700, 70, color="roof", ridge=0.86, lift=28)
    A.walls(P, hallp, cx - 190, cx + 190, WL - 400, WL - 300, posts=5, post="shu")
    A.roof(P, hallp, cx, WL - 380, 620, 190, color="roof", ridge=0.46, lift=48, shibi="gold")
    # wings: raised corridors on red posts, turning forward, with corner towers
    for sgn in (-1, 1):
        x0 = cx + sgn * 330
        x1 = cx + sgn * 900
        xa, xb = min(x0, x1), max(x0, x1)
        posts = [A.rect(x - 6, WL - 200, x + 6, WL) for x in np.linspace(xa, xb, 12)]
        m = P.mask(posts)
        P.block(hallp, m, "shu", alpha=1.0, knock=True)
        P.edge(hallp, m, 1.4)
        A.walls(P, hallp, xa, xb, WL - 270, WL - 200, posts=10, post="shu", panel="wall", rail=False)
        A.roof(P, hallp, (xa + xb) / 2, WL - 265, xb - xa + 90, 60, color="roof", ridge=0.94, lift=10, tiles=True)
        tx = x1
        A.walls(P, hallp, tx - 60, tx + 60, WL - 390, WL - 280, posts=3, post="shu")
        A.roof(P, hallp, tx, WL - 385, 190, 80, color="roof", ridge=0.3, lift=16)
    M.birds(P, hallp, [(cx - 70, WL - 590, 1.2), (cx + 70, WL - 590, 1.2)], size=20, color="gold", alpha=1.0)
    P.commit(hallp)

    water = P.plane("L2")
    wm = P.band(WL, 2200)
    P.cover(water, wm)
    P.block(water, wm, "sea_far", alpha=0.9, bokashi=P.vgrad(WL, 2160, 0.6, 1.0), grain=0.3, pool=0)
    # reflection of the hall and the trees
    tmp = P.plane("tmp")
    tmp.mult[:] = hallp.mult
    tmp.cov[:] = hallp.cov
    P.reflect(tmp, water, WL, alpha=0.6, fade=640)
    P.reflect(back, water, WL - 1, alpha=0.25, fade=500)
    if P.night:
        M.sea(P, water, WL, lines=False, moon_path=(3050, 120)) if False else None
    ls = []
    for k in range(40):
        y = WL + 20 + k * 16 + k * k * 0.3
        if y > 2150:
            break
        x = rng.uniform(-100, 3600)
        ls.append([(x, y), (x + rng.uniform(200, 700), y)])
    P.strokes(water, ls, 2.2, color="sea_line", alpha=0.45, smooth=False)
    # lotus pads in the foreground
    pads = []
    for _ in range(30):
        x, y = rng.uniform(1800, 3800), rng.uniform(1900, 2150)
        r = rng.uniform(26, 50)
        t = np.linspace(0.2, 2 * np.pi - 0.2, 20)
        pads.append(np.vstack([np.stack([x + r * np.cos(t), y + r * 0.35 * np.sin(t)], 1), [(x, y)]]))
    m = P.mask(pads)
    P.block(water, m, "hill", alpha=1.0, knock=True)
    P.edge(water, m, 1.6)
    if P.night:
        M.fireflies(P, water, 1800, 3800, 1550, 1900, n=30, seed=7)
    P.commit(water)

    front = P.plane("L3")
    # wisteria hanging from the top edge
    rng2 = np.random.default_rng(5)
    rac = []
    for k in range(26):
        x = 1750 + k * 66 + rng2.uniform(-20, 20)
        L = rng2.uniform(180, 420)
        for j in range(int(L / 22)):
            y = 30 + j * 22
            r = 13 * (1 - j * 22 / L * 0.6)
            t = np.linspace(0, 2 * np.pi, 8, endpoint=False)
            rac.append(np.stack([x + r * np.cos(t) + math.sin(j * 0.7) * 6, y + r * 0.8 * np.sin(t)], 1))
    m = P.mask(rac)
    P.block(front, m, "beni", alpha=0.7, knock=True)
    P.block(front, m, "robe", alpha=0.35, cover=False)
    P.edge(front, m, 1.2, alpha=0.6)
    leaves = [[(1700 + k * 90, 10), (1750 + k * 90, 60), (1810 + k * 90, 20)] for k in range(20)]
    P.key(front, leaves, 16, color="hill", alpha=1.0, taper=(0.3, 0.3))
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "平安", "平等院")
    P.commit(cart)


SCENES["heian"] = {"fn": heian, "seed": 51, "focus": 0.68}


# ---------------------------------------------------------------- Kamakura
def kamakura(P):
    """1281: the Mongol fleet in Hakata Bay, caught by the storm that later
    ages called the kamikaze, the divine wind; the defence wall on the shore."""
    import arch as A
    H = 1080
    back = P.plane("L0")
    full = P.full()
    P.cover(back, full)
    P.block(back, full, "sky_low", alpha=0.9, bokashi=P.vgrad(0, H, 1.0, 0.6), grain=0.25, pool=0)
    P.block(back, full, "sky_top", alpha=1.0, bokashi=P.vgrad(0, H * 0.9, 1.0, 0.2), grain=0.3, pool=0)
    P.block(back, full, "sumi", alpha=0.45, bokashi=P.vgrad(0, H * 0.6, 1.0, 0.0), grain=0.3, pool=0)
    for i, (x0, x1, y) in enumerate(((1200, 3300, 260), (2300, 4000, 470), (-200, 1500, 520), (1600, 3000, 720))):
        M.cloud_band(P, back, x0, x1, y, 90, color="grey", alpha=0.85, lobes=4, seed=40 + i)
    if P.night:
        M.lightning(P, back, 2950, 120, H - 40, seed=3, width=10)
        M.lightning(P, back, 1900, 300, H - 200, seed=8, width=6)
    M.sea(P, back, H, near="sea", far="sea_far", seed=3)
    M.rain(P, back, 0, 3840, 0, 2160, n=900, angle=-0.25, seed=2, alpha=0.3)
    P.commit(back)

    mid = P.plane("L1")
    A.junk(P, mid, 1900, 1180, 420, tilt=0.05, seed=1)
    A.junk(P, mid, 2600, 1230, 520, tilt=-0.18, seed=2, flip=True)
    A.junk(P, mid, 3350, 1190, 460, tilt=0.35, seed=3)
    A.junk(P, mid, 1320, 1130, 300, tilt=-0.1, seed=4, flip=True)
    M.wave_crest(P, mid, 1500, 1150, 900, 380, seed=11, flip=True)
    M.wave_crest(P, mid, 2900, 1180, 1000, 420, seed=12)
    # the shore and the stone wall at the left
    edge = np.array([(1100, 1470), (1330, 1580), (1520, 1760), (1640, 1980), (1690, 2200)])
    shore = np.vstack([[(-50, 1500), (500, 1440)], catmull_rom(edge, 8), [(-50, 2200)]])
    A.poly_block(P, mid, shore, "earth", key=0, bokashi=P.vgrad(1440, 2160, 0.7, 1.0))
    rng = np.random.default_rng(61)
    # the foam where the surf runs up the sand, and wet sand darker below it
    wet = np.vstack([catmull_rom(edge, 8), catmull_rom(edge - [150, 0], 8)[::-1]])
    P.block(mid, P.mask(wet), "earth_dark", alpha=0.35, cover=False)
    for k in range(3):
        P.key(mid, catmull_rom(edge - [30 + 45 * k, -10 * k], 8), 7 - 2 * k, color="paper", alpha=0.9)
    P.key(mid, catmull_rom(np.array([(-50, 1500), (500, 1440), (1100, 1470)]), 8), 2.6, smooth=False)
    # the ripple marks of the beach
    P.strokes(mid, [[(x, y), (x + rng.uniform(80, 220), y + rng.uniform(-6, 6))]
                    for x, y in zip(rng.uniform(0, 1300, 60), rng.uniform(1560, 2150, 60))
                    if x + 250 < np.interp(y, edge[:, 1], edge[:, 0])], 2.0, color="earth_dark", alpha=0.5)
    A.stone_wall(P, mid, 80, 1150, 1360, 1480, seed=2)
    for i, x in enumerate(np.linspace(150, 1050, 7)):
        A.banner(P, mid, x, 1365, 300, color="wall" if i % 2 else "shu", mon="sumi" if i % 2 else None)
    A.crowd(P, mid, 180, 1050, 1370, 60, 10, seed=4, robes=("robe", "sumi", "shu", "earth_dark"), hats=0)
    P.commit(mid)

    front = P.plane("L2")
    M.pine(P, front, 150, 2230, 720, lean=0.3, seed=61, pads=5)
    M.tufts(P, front, 0, 800, 1950, 2160, n=70, seed=6, color="pine_dark", alpha=0.8)
    M.wave_crest(P, front, 2050, 1380, 1900, 860, seed=13)
    M.wave_crest(P, front, 1500, 1840, 900, 380, seed=14, flip=True)
    M.spray(P, front, 2600, 1400, 400, 180, n=110, seed=5)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "鎌倉", "弘安", color="shu")
    P.commit(cart)


SCENES["kamakura"] = {"fn": kamakura, "seed": 61, "focus": 0.62}


# ---------------------------------------------------------------- Muromachi
def muromachi(P):
    """Kinkakuji, the Golden Pavilion, in snow: the villa of the shogun
    Ashikaga Yoshimitsu, gold leaf over its upper floors, on its mirror pond."""
    import arch as A
    H = 1150
    WL = 1520
    back = P.plane("L0")
    M.sky(P, back, H)
    if P.night:
        M.stars(P, back, 60, H - 400, seed=12)
    M.ridge(P, back, [(-60, H + 60), (700, H - 250), (1500, H - 380), (2300, H - 330), (3000, H - 480), (3600, H - 350),
                      (3950, H - 300)], H + 300, "far", key=True, top_col="far2", top_depth=160, key_w=2.4)
    # snow on the hill: carved patches along the ridge
    rng = np.random.default_rng(3)
    patches = []
    for _ in range(90):
        x = rng.uniform(0, 3840)
        y = np.interp(x, [-60, 700, 1500, 2300, 3000, 3600, 3950], [H + 60, H - 250, H - 380, H - 330, H - 480, H - 350, H - 300])
        y += rng.uniform(20, 280)
        w, hh = rng.uniform(40, 120), rng.uniform(10, 26)
        t = np.linspace(0, 2 * np.pi, 12, endpoint=False)
        patches.append(np.stack([x + w * np.cos(t), y + hh * np.sin(t)], 1))
    m = P.mask(patches)
    P.uncover(back, (m[0] * 0.85, m[1]))
    P.cover(back, m)
    P.block(back, m, "snow", alpha=0.4, cover=False)
    for i, x in enumerate(np.linspace(-100, 3950, 20)):
        A.canopy(P, back, x + rng.uniform(-40, 40), H + 160 + rng.uniform(-30, 20), rng.uniform(120, 170), rng.uniform(70, 100),
                 "pine", "pine_dark", seed=300 + i, dot_n=0, key=2.0)
    P.commit(back)

    pav = P.plane("L1")
    ground(P, pav, 1400, color="snow", dark="grey", depth=200)
    cx = 2600
    # first floor: plain wood and white, a shinden-style residence
    A.platform(P, pav, cx - 300, cx + 300, WL - 40, 40, color="grey")
    A.walls(P, pav, cx - 260, cx + 260, WL - 170, WL - 40, posts=7, post="wood", panel="wall",
            windows="light" if P.night else None)
    A.roof(P, pav, cx, WL - 170, 640, 55, color="roof", ridge=0.9, lift=18, snow=True)
    # second and third floors in gold leaf
    A.walls(P, pav, cx - 230, cx + 230, WL - 330, WL - 205, posts=5, post="gold", panel="gold")
    A.roof(P, pav, cx, WL - 330, 580, 60, color="roof", ridge=0.9, lift=20, snow=True)
    A.walls(P, pav, cx - 130, cx + 130, WL - 480, WL - 370, posts=3, post="gold", panel="gold")
    A.roof(P, pav, cx, WL - 470, 400, 150, color="roof", ridge=0.2, lift=40, snow=True)
    M.birds(P, pav, [(cx, WL - 640, 1.4)], size=22, color="gold", alpha=1.0)
    P.key(pav, np.array([(cx, WL - 620), (cx, WL - 660)]), 5, color="gold", smooth=False)
    # snowy pines on the islands
    for (x, y, h, s, w) in ((1650, WL + 40, 360, 1, 340), (3450, WL + 50, 420, 2, 420), (3150, WL + 30, 260, 3, 260)):
        M.island(P, pav, x - w / 2, x + w / 2, y, 70, seed=40 + s, fill="rock", top="snow", key_w=2.4)
        M.pine(P, pav, x, y - 50, h, lean=0.2 * (-1) ** s, seed=s, pads=4)
    P.commit(pav)

    water = P.plane("L2")
    wm = P.band(WL, 2200)
    P.cover(water, wm)
    P.block(water, wm, "sea_far", alpha=0.85, bokashi=P.vgrad(WL, 2160, 0.6, 1.0), grain=0.3, pool=0)
    tmp = P.plane("tmp")
    tmp.mult[:] = pav.mult
    tmp.cov[:] = pav.cov
    P.reflect(tmp, water, WL, alpha=0.6, fade=600)
    ls = []
    for k in range(38):
        y = WL + 16 + k * 16 + k * k * 0.3
        if y > 2150:
            break
        x = rng.uniform(-100, 3600)
        ls.append([(x, y), (x + rng.uniform(200, 700), y)])
    P.strokes(water, ls, 2.2, color="sea_line", alpha=0.4, smooth=False)
    rocks = [(1900, 1760, 180, 60), (3250, 1900, 240, 80), (1200, 2050, 300, 70)]
    for (x, y, w, h) in rocks:
        M.island(P, water, x - w / 2, x + w / 2, y, h, seed=int(x), fill="rock", top="rock_top")
        cap = np.array([(x - w * 0.4, y - h * 0.55), (x, y - h * 1.02), (x + w * 0.4, y - h * 0.5), (x, y - h * 0.62)])
        cm = P.mask(catmull_rom(cap, 3, closed=True))
        P.uncover(water, cm)
        P.cover(water, cm)
    P.commit(water)

    snow = P.plane("L3")
    M.snowfall(P, snow, n=700, seed=5)
    P.commit(snow)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "室町", "金閣")
    P.commit(cart)


SCENES["muromachi"] = {"fn": muromachi, "seed": 71, "focus": 0.68}


# ---------------------------------------------------------------- Sengoku
def sengoku(P):
    """The age of castles: a great keep on its stone base, cherry blossom,
    and the banners of an army on the march."""
    import arch as A
    H = 1300
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(1200, H))
    if P.night:
        M.stars(P, back, 90, H - 400, seed=14)
        M.disc(P, back, 3350, 420, 110, "moon", halo=True, light=True)
    M.cloud_band(P, back, 1300, 3000, 260, 56, color="kasumi", alpha=0.8, lobes=3, seed=15)
    M.ridge(P, back, [(-60, H), (800, H - 140), (1600, H - 90), (2400, H - 200), (3200, H - 110), (3950, H - 170)], H + 100,
            "far", key=False, top_col="far2", top_depth=80)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, 1380, color="field", dark="hill_dark", depth=780)
    # the castle hill
    hill = [(1700, 1500), (2100, 1250), (2500, 1180), (3000, 1190), (3500, 1300), (3900, 1480)]
    M.ridge(P, mid, hill, 1700, "hill", top_col="hill_dark", top_depth=120)
    rng = np.random.default_rng(7)
    for i, x in enumerate(np.linspace(1800, 3850, 13)):
        y = np.interp(x, [p[0] for p in hill], [p[1] for p in hill]) + 60
        A.canopy(P, mid, x + rng.uniform(-30, 30), y + rng.uniform(0, 60), rng.uniform(110, 160), rng.uniform(60, 90),
                 "pine", "pine_dark", seed=400 + i, dot_n=0, key=2.0)
    A.castle(P, mid, 2750, 1260, 600, 1050, lights=P.night)
    # turrets on the walls
    for tx in (2150, 3350):
        A.walls(P, mid, tx - 90, tx + 90, 1290, 1380, posts=3, post="wall", panel="wall", windows="sumi", rail=False)
        A.roof(P, mid, tx, 1290, 250, 90, color="roof", ridge=0.4, lift=20, gable=True)
    M.mist(P, mid, 900, 3900, 1560, 70, seed=12, lobes=6)
    # an army's banners along the road
    for i, x in enumerate(np.linspace(1350, 2350, 14)):
        A.banner(P, mid, x, 1760 + (i % 2) * 10, 260, color=("wall", "sumi", "shu")[i % 3], mon="shu" if i % 3 == 0 else None)
    A.crowd(P, mid, 1320, 2400, 1765, 70, 16, seed=9, robes=("sumi", "robe", "earth_dark"), hats=0.2)
    P.commit(mid)

    front = P.plane("L2")
    A.blossoms(P, front, 3700, 2300, 1300, seed=8, spread=1.2)
    A.blossoms(P, front, 1150, 2300, 700, seed=9, spread=0.8)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "戦国", "天守")
    P.commit(cart)


SCENES["sengoku"] = {"fn": sengoku, "seed": 81, "focus": 0.7}


# ---------------------------------------------------------------- Edo
def edo(P):
    """Nihonbashi, the bridge at the centre of Edo from which all roads were
    measured: morning traffic on the bridge, white storehouses along the
    canal, boats, and Fuji far to the west."""
    import arch as A
    H = 1100
    WL = 1650
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2000, H))
    if P.night:
        M.stars(P, back, 60, H - 300, seed=16)
        for (fx, fy, r, sd) in ((1900, 380, 230, 1), (2800, 260, 300, 2), (3350, 520, 180, 3), (2350, 620, 140, 4)):
            M.fireworks(P, back, fx, fy, r, seed=sd, color=("light", "beni", "light", "fire")[sd - 1])
    M.cloud_band(P, back, 700, 2200, 300, 50, color="kasumi", alpha=0.8, lobes=2, seed=16)
    M.fuji(P, back, 1450, 640, H + 20, 520, seed=2, night=P.night)
    M.ridge(P, back, [(-60, H), (500, H - 60), (1000, H - 30), (1800, H - 70), (2600, H - 30), (3950, H - 60)], H + 60,
            "far", key=False, top_col="far2", top_depth=40)
    P.commit(back)

    mid = P.plane("L1")
    # far bank: rooftops and the green of the castle grounds
    ground(P, mid, 1150, color="field", dark="hill_dark", depth=400)
    rng = np.random.default_rng(9)
    for i, x in enumerate(np.linspace(-100, 1500, 9)):
        A.canopy(P, mid, x + rng.uniform(-30, 30), 1140, rng.uniform(110, 160), rng.uniform(60, 85), "pine", "pine_dark",
                 seed=500 + i, dot_n=0, key=2.0)
    for i, x in enumerate(np.arange(1400, 3950, 210)):
        A.kura(P, mid, x, 1470 + (i % 2) * 8, 190, 240 + (i % 3) * 30, lights=P.night)
    # canal
    wm = P.band(WL - 80, 2200)
    P.cover(mid, wm)
    P.block(mid, wm, "sea_far", alpha=0.9, bokashi=P.vgrad(WL - 80, 2160, 0.6, 1.0), grain=0.3, pool=0, knock=True)
    ls = [[(x, y), (x + rng.uniform(150, 500), y)] for y in np.arange(WL - 60, 2160, 24) for x in rng.uniform(-100, 3800, 3)]
    P.strokes(mid, ls, 2.0, color="sea_line", alpha=0.4, smooth=False)
    for (bx, by, L) in ((1400, 1760, 260), (2300, 1900, 300), (3100, 1700, 220)):
        M.boat(P, mid, bx, by, L, seed=int(bx))
    P.commit(mid)

    front = P.plane("L2")
    xs, top = A.arched_bridge(P, front, 700, 3950, 1760, 260, water=2200)
    # traffic on the bridge
    rng = np.random.default_rng(4)
    for i, x in enumerate(np.sort(rng.uniform(900, 3800, 34))):
        y = float(np.interp(x, xs, top)) - 2
        A.figure(P, front, x, y, rng.uniform(70, 95), robe=("robe", "shu", "earth", "sumi", "grey", "beni")[i % 6],
                 hat="straw" if rng.random() < 0.5 else None, seed=i)
    # a daimyo's spears and a palanquin
    for x in np.linspace(1600, 2100, 6):
        y = float(np.interp(x, xs, top))
        P.key(front, np.array([(x, y - 60), (x + 10, y - 230)]), 3.2, smooth=False, taper=(0, 0))
        tuft = np.array([(x + 6, y - 230), (x + 20, y - 290), (x + 30, y - 230)])
        A.poly_block(P, front, tuft, "sumi", key=1.2, smooth=True)
    if P.night:
        for x in np.linspace(1000, 3700, 9):
            y = float(np.interp(x, xs, top)) - 110
            A.poly_block(P, front, A.rect(x - 16, y, x + 16, y + 40), "light", key=1.4)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "江戸", "日本橋")
    P.commit(cart)


SCENES["edo"] = {"fn": edo, "seed": 91, "focus": 0.64}


# ---------------------------------------------------------------- Meiji
def meiji(P):
    """1872: the first railway, Shinbashi to Yokohama, running along an
    embankment built out into the sea at Takanawa; sailing ships and a
    steamer offshore, a brick street and gas lamps."""
    import arch as A
    H = 1000
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2400, H))
    if P.night:
        M.stars(P, back, 80, H - 300, seed=18)
        M.disc(P, back, 2500, 360, 80, "moon", halo=True, light=True)
    M.cloud_band(P, back, 1100, 2800, 280, 50, color="kasumi", alpha=0.8, lobes=3, seed=18)
    M.ridge(P, back, [(1200, H), (1800, H - 60), (2400, H - 40), (3000, H - 90), (3950, H - 30)], H + 10, "far", key=False,
            top_col="far2", top_depth=40)
    M.sea(P, back, H, seed=5, moon_path=(2500, 110) if P.night else None)
    for (x, y, L) in ((1500, 1150, 170), (2050, 1100, 130), (2900, 1130, 150)):
        M.boat(P, back, x, y, L, sail=True, seed=int(x), figure=False)
    # a steamer with a funnel
    sx, sy = 650, 1190
    A.poly_block(P, back, [(sx - 230, sy - 40), (sx + 240, sy - 40), (sx + 200, sy + 10), (sx - 200, sy + 10)], "sumi")
    A.poly_block(P, back, A.rect(sx - 60, sy - 150, sx - 10, sy - 40), "shu")
    A.poly_block(P, back, A.rect(sx - 150, sy - 80, sx + 150, sy - 40), "wall")
    m = P.mask([np.stack([sx - 40 + 60 * k + 40 * np.cos(t), sy - 190 - 25 * k + 30 * np.sin(t)], 1)
                for k in range(5) for t in [np.linspace(0, 2 * np.pi, 14, endpoint=False)]])
    P.block(back, m, "smoke", alpha=0.8, knock=True)
    P.commit(back)

    mid = P.plane("L1")
    # the embankment across the water
    emb_y = 1480
    emb = np.array([(-60, emb_y - 30), (3950, emb_y - 60), (3950, emb_y + 50), (-60, emb_y + 90)])
    A.poly_block(P, mid, emb, "grey", key=2.4)
    P.strokes(mid, [[(-60, emb_y - 30 + k * 30), (3950, emb_y - 60 + k * 27)] for k in range(1, 4)], 1.4, alpha=0.5, smooth=False)
    A.telegraph(P, mid, np.linspace(200, 3800, 9), emb_y - 45, 360)
    A.locomotive(P, mid, 1300, emb_y - 40, 520, lights=P.night, carriages=4)
    P.commit(mid)

    front = P.plane("L2")
    wm = P.band(1560, 2200)
    P.cover(front, wm)
    P.block(front, wm, "sea", alpha=1.0, bokashi=P.vgrad(1560, 2160, 0.5, 1.0), grain=0.3, pool=0, knock=True)
    rng = np.random.default_rng(3)
    ls = [[(x, y), (x + rng.uniform(150, 500), y)] for y in np.arange(1580, 2160, 22) for x in rng.uniform(-100, 3800, 3)]
    P.strokes(front, ls, 2.2, color="sea_line", alpha=0.45, smooth=False)
    # a brick street on the right
    street = np.array([(2900, 1600), (3950, 1520), (3950, 2200), (2700, 2200)])
    A.poly_block(P, front, street, "earth", key=2.4, bokashi=P.vgrad(1520, 2160, 0.75, 1.0))
    # the dressed-stone face of the quay, and the setts of the road
    quay = np.array([(2900, 1600), (2940, 1600), (2745, 2200), (2700, 2200)])
    A.poly_block(P, front, quay, "grey", key=2.0)
    P.strokes(front, [[(2895 - (y - 1600) * 0.325, y), (2935 - (y - 1600) * 0.325, y)] for y in range(1630, 2200, 34)],
              1.6, alpha=0.6, smooth=False)
    P.strokes(front, [[(2960 - (y - 1600) * 0.3, y), (3950, y - 80 * (2200 - y) / 600)] for y in range(1660, 2200, 60)],
              1.4, color="earth_dark", alpha=0.45, smooth=False)
    A.brick_building(P, front, 3150, 3950, 1560, 520, lights=P.night)
    A.gaslamp(P, front, 3000, 1900, 330, lit=P.night)
    A.gaslamp(P, front, 3500, 2080, 380, lit=P.night)
    A.crowd(P, front, 2950, 3450, 2000, 110, 4, seed=12, robes=("sumi", "robe", "grey"), hats=0.3)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "明治", "高輪")
    P.commit(cart)


SCENES["meiji"] = {"fn": meiji, "seed": 101, "focus": 0.6}


# ---------------------------------------------------------------- Showa
def showa(P):
    """Hiroshima: the A-Bomb Dome on the bank of the Motoyasu River, kept as
    it was left on 6 August 1945. By night, lanterns float on the river in
    memory of the dead."""
    import arch as A
    H = 1250
    WL = 1500
    back = P.plane("L0")
    M.sky(P, back, H)
    if P.night:
        M.stars(P, back, 70, H - 400, seed=20)
    M.cloud_band(P, back, 1500, 3400, 300, 60, color="kasumi_w", alpha=0.7, lobes=3, seed=20)
    M.ridge(P, back, [(-60, H), (700, H - 120), (1500, H - 60), (2300, H - 170), (3100, H - 80), (3950, H - 140)], H + 60,
            "far", key=False, top_col="far2", top_depth=60)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, H + 60, color="field", dark="hill_dark", depth=300)
    rng = np.random.default_rng(22)
    for i, x in enumerate(np.linspace(-100, 3950, 22)):
        if 2150 < x < 3150:
            continue
        A.canopy(P, mid, x + rng.uniform(-30, 30), H + 170 + rng.uniform(-20, 20), rng.uniform(120, 170), rng.uniform(80, 110),
                 "hill", "hill_dark", seed=600 + i, dot_n=0, key=2.0)
    A.dome_ruin(P, mid, 2650, WL - 20, 880, 760, lights=P.night)
    bank = A.rect(-60, WL - 30, 3950, WL + 10)
    A.poly_block(P, mid, bank, "grey", key=2.2)
    P.commit(mid)

    water = P.plane("L2")
    wm = P.band(WL + 10, 2200)
    P.cover(water, wm)
    P.block(water, wm, "sea_far", alpha=0.9, bokashi=P.vgrad(WL, 2160, 0.6, 1.0), grain=0.3, pool=0)
    tmp = P.plane("tmp")
    tmp.mult[:] = mid.mult
    tmp.cov[:] = mid.cov
    P.reflect(tmp, water, WL + 10, alpha=0.45, fade=560)
    ls = [[(x, y), (x + rng.uniform(150, 600), y)] for y in np.arange(WL + 30, 2160, 20) for x in rng.uniform(-100, 3800, 2)]
    P.strokes(water, ls, 2.0, color="sea_line", alpha=0.4, smooth=False)
    if P.night:
        A.floating_lanterns(P, water, 1300, 3900, WL + 80, 2080, n=46, seed=3)
    P.commit(water)

    front = P.plane("L3")
    if not P.night:
        # oleander, the flower that bloomed first in the burned city
        for (x, y, s) in ((3600, 2250, 1.0), (3250, 2300, 0.8)):
            A.canopy(P, front, x, y - 380 * s, 380 * s, 240 * s, "hill", "pine_dark", seed=int(x), dot_n=120, dots="beni",
                     key=2.2)
    else:
        for (x, y, s) in ((3600, 2250, 1.0), (3250, 2300, 0.8)):
            A.canopy(P, front, x, y - 380 * s, 380 * s, 240 * s, "hill", "pine_dark", seed=int(x), dot_n=60, dots="beni",
                     key=2.2)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "昭和", "広島")
    P.commit(cart)


SCENES["showa"] = {"fn": showa, "seed": 111, "focus": 0.68}


# ---------------------------------------------------------------- Postwar
def sengo(P):
    """1964: the Tokaido Shinkansen, the first high-speed railway, crossing
    the Fuji River beneath the mountain."""
    import arch as A
    H = 1250
    back = P.plane("L0")
    M.sky(P, back, H, glow="glow", glow_at=(2600, H))
    if P.night:
        M.stars(P, back, 150, H - 500, seed=24)
    M.cloud_band(P, back, 700, 2100, 420, 50, color="kasumi", alpha=0.8, lobes=2, seed=24)
    M.fuji(P, back, 2650, 240, H + 80, 1500, seed=5, night=P.night)
    M.cloud_band(P, back, 2300, 3950, 1190, 60, color="kasumi_w", alpha=0.9, lobes=3, seed=25)
    M.ridge(P, back, [(-60, H + 20), (800, H - 60), (1500, H), (2400, H + 20), (3300, H - 40), (3950, H + 10)], H + 200,
            "hill", top_col="hill_dark", top_depth=120)
    P.commit(back)

    mid = P.plane("L1")
    ground(P, mid, H + 150, color="field", dark="hill_dark", depth=400)
    # a town at the foot of the mountain, lit at night
    rng = np.random.default_rng(26)
    boxes = []
    for i in range(70):
        x = rng.uniform(900, 3900)
        y = H + 200 + rng.uniform(0, 120)
        w, hh = rng.uniform(40, 110), rng.uniform(30, 90)
        boxes.append((y, x, w, hh))
    boxes.sort()
    for (y, x, w, hh) in boxes:
        hh *= 0.7
        A.poly_block(P, mid, A.rect(x, y - hh, x + w, y), "wall" if not P.night else "roof", key=1.4)
        rh = min(34, w * 0.35)
        rf = np.array([(x - 6, y - hh), (x + w * 0.18, y - hh - rh), (x + w * 0.82, y - hh - rh), (x + w + 6, y - hh)])
        A.poly_block(P, mid, rf, ("roof", "roof", "robe", "earth_dark")[int(rng.integers(4))], key=1.4)
        if P.night:
            wins = [A.rect(x + 8 + k * 16, y - hh * 0.7, x + 16 + k * 16, y - hh * 0.35) for k in range(int((w - 16) / 16))]
            if wins:
                P.block(mid, P.mask(wins), "light", alpha=0.95, knock=True)
        elif w > 60:
            P.block(mid, P.mask([A.rect(x + w * 0.2, y - hh * 0.7, x + w * 0.45, y - hh * 0.35),
                                 A.rect(x + w * 0.6, y - hh * 0.7, x + w * 0.85, y - hh * 0.35)]), "sumi", alpha=0.7, knock=True)
    # the river
    river = np.array([(-60, 1600), (3950, 1560), (3950, 2200), (-60, 2200)])
    A.poly_block(P, mid, river, "sea_far", key=0, bokashi=P.vgrad(1560, 2160, 0.6, 1.0))
    ls = [[(x, y), (x + rng.uniform(150, 600), y)] for y in np.arange(1600, 2160, 22) for x in rng.uniform(-100, 3800, 3)]
    P.strokes(mid, ls, 2.0, color="sea_line", alpha=0.4, smooth=False)
    P.commit(mid)

    front = P.plane("L2")
    deck = 1790
    A.girder_bridge(P, front, -60, 3950, deck, 62, 2200)
    A.shinkansen(P, front, 820, deck - 4, 1250, lights=P.night, cars=7)
    # the piers and the train's shadow in the river
    P.strokes(front, [[(x, 2170 + (k % 3) * 8), (x + rng.uniform(120, 420), 2170 + (k % 3) * 8)]
                      for k, x in enumerate(rng.uniform(-100, 3800, 24))], 2.0, color="sea_line", alpha=0.35, smooth=False)
    P.commit(front)
    cart = P.plane("cart")
    cartouche(P, cart, 3700, 120, "戦後", "富士川")
    P.commit(cart)


SCENES["sengo"] = {"fn": sengo, "seed": 121, "focus": 0.6}
