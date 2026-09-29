"""The paintings. Each scene paints depth planes, back to front, in 3840 x 2160
coordinates. `sun` gives the sun (day) / moon (night) disc as (x, y, r)."""
import numpy as np

from ink import Peak
import landscape as ls


def hero(p):
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 1560, 430, 88, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1010, 1330, 260, tone=0.06, seed=4, peaks=8, fade=0.4, ridge_line=0.25)
    ls.far_range(p, back, -100, 2500, 1090, 1400, 240, tone=0.1, seed=5, peaks=6, fade=0.35, dots=0.5)
    ls.paint_peak(p, back, Peak(p, 520, 800, 1420, 360, 430, "dome", seed=7), tone=0.12, outline=0.35,
                  texture=0.35, folds=3, dots=0.3, fade_top=0.25, fade_len=0.4, width=0.8, seed=7)

    mist = (1180, 1520)
    ls.massif(p, mid, 3120, 560, 1500, 440, 640, kind="dome", subs=3, seed=11, mist=mist, tone=0.24,
              outline=0.75, texture=0.9, folds=5, dots=0.8, trees=2)
    ls.massif(p, mid, 1930, 760, 1540, 430, 360, kind="dome", subs=2, seed=12, mist=mist, tone=0.22,
              outline=0.7, texture=0.8, folds=4, dots=0.7, trees=2)
    ls.massif(p, mid, 2440, 190, 1560, 540, 470, kind="steep", subs=5, seed=13, mist=(1100, 1560), tone=0.42,
              outline=0.92, texture=1.2, folds=8, dots=1.0, trees=3)
    ls.massif(p, mid, 2180, 1180, 1760, 560, 640, kind="hill", subs=2, seed=14, mist=(1560, 1800), tone=0.32,
              outline=0.88, texture=1.0, folds=4, dots=1.2, trees=3)
    ls.ripples(p, mid, 420, 2300, 1560, 1980, count=26, ink=0.2, seed=15, length=(80, 320))
    ls.boat(p, mid, 1180, 1690, 190, seed=16, facing=-1)
    ls.geese(p, mid, 1180, 610, n=9, size=20, dx=-1, seed=17, ink=0.7)

    ls.massif(p, front, 3520, 1640, 2560, 430, 1500, kind="table", subs=4, seed=21, mist=(2450, 2800),
              tone=0.4, outline=1.0, texture=1.0, folds=7, dots=1.3, cun="axe", width=1.35, trees=0)
    ls.massif(p, front, 2650, 1990, 2420, 250, 280, kind="dome", subs=1, seed=22, mist=(2400, 2800),
              tone=0.4, outline=1.0, texture=0.9, folds=2, dots=1.0, cun="axe", width=1.2, trees=0)
    ls.pine(p, front, 3400, 1668, 1060, lean=-0.6, seed=23, width=1.0)
    ls.reeds(p, front, 2330, 2480, 2150, count=14, seed=24)
    return [back, mid, front]


def pass_(p):
    """Laozi rides west to the Hangu Pass at sunset."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 3180, 820, 105, soft=2.5)
    ls.far_range(p, back, 1600, 3940, 1080, 1330, 230, tone=0.07, seed=31, peaks=6, fade=0.4)
    ls.far_range(p, back, 2500, 3940, 1140, 1400, 160, tone=0.11, seed=32, peaks=4, fade=0.35, dots=0.6)
    ls.far_range(p, back, -100, 1900, 1120, 1450, 280, tone=0.06, seed=33, peaks=5, fade=0.4)
    mist = (1150, 1520)
    ls.massif(p, mid, 3560, 640, 1600, 420, 600, kind="crag", subs=3, seed=34, mist=mist, tone=0.34,
              outline=0.9, texture=1.0, folds=6, dots=1.0, trees=2, cun="axe", width=1.1, light=-1)
    ls.massif(p, mid, 2230, 330, 1650, 520, 430, kind="crag", subs=4, seed=35, mist=(1250, 1650), tone=0.4,
              outline=0.95, texture=1.1, folds=8, dots=1.1, trees=3, light=-1)
    ls.massif(p, mid, 2880, 1325, 1760, 620, 560, kind="table", subs=1, seed=361, mist=(1500, 1780), tone=0.3,
              outline=0.9, texture=0.8, folds=3, dots=1.0, trees=0, light=-1)
    ls.gate(p, mid, 2880, 1332, 440, seed=36)
    ls.figure(p, mid, 2990, 1330, 62, pose="stand", facing=-1, seed=37)
    ls.massif(p, mid, 2500, 1500, 2100, 700, 900, kind="hill", subs=2, seed=38, mist=(1900, 2250), tone=0.3,
              outline=0.9, texture=0.9, folds=4, dots=1.2, trees=4, light=-1)
    ls.path_line(p, mid, [(1650, 2200), (1900, 2000), (2350, 1880), (2500, 1720), (2700, 1560), (2800, 1400), (2860, 1335)],
                 width=26, ink=0.55, seed=39)
    ls.ox_rider(p, mid, 2330, 1860, 190, facing=1, seed=40)
    ls.figure(p, mid, 2140, 1905, 70, pose="stand", facing=1, seed=41)
    ls.geese(p, back, 2700, 700, n=7, size=18, dx=-1, seed=42, ink=0.6)
    ls.massif(p, front, 3850, 1760, 2500, 700, 400, kind="crag", subs=2, seed=43, mist=(2400, 2800), tone=0.4,
              outline=1.0, texture=1.0, folds=4, dots=1.2, cun="axe", width=1.3)
    ls.bare_tree(p, front, 3420, 1950, 700, lean=-0.25, spread=1.0, width=1.3, seed=44, depth=6)
    return [back, mid, front]


def yinyang(p):
    """One mountain, lit from the west: its sunny face yang, its shady face yin."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 1180, 360, 80, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1120, 1380, 200, tone=0.06, seed=51, peaks=7, fade=0.4)
    ls.far_range(p, back, 1800, 3940, 1180, 1440, 180, tone=0.1, seed=52, peaks=5, fade=0.35, dots=0.5)
    ls.massif(p, mid, 3350, 780, 1600, 380, 560, kind="dome", subs=2, seed=53, mist=(1250, 1560), tone=0.26,
              outline=0.75, texture=1.2, folds=5, dots=0.8, trees=2, light=-1)
    ls.massif(p, mid, 2480, 260, 1700, 760, 820, kind="dome", subs=5, seed=54, mist=(1280, 1700), tone=0.52,
              outline=0.95, texture=2.2, folds=12, dots=1.3, trees=4, light=-1)
    ls.massif(p, mid, 1850, 1250, 1900, 420, 520, kind="hill", subs=1, seed=55, mist=(1650, 1950), tone=0.2,
              outline=0.7, texture=0.4, folds=2, dots=0.6, trees=3, light=-1)
    for i, (x, w) in enumerate(((1700, 110), (1830, 90), (1990, 120))):
        ls.pavilion(p, mid, x, 1790 + i * 8, w, seed=56 + i, kind="hall")
    ls.ripples(p, mid, 700, 3300, 1930, 2100, count=22, ink=0.2, seed=59, length=(100, 360))
    ls.boat(p, mid, 2650, 2020, 170, seed=60, facing=1)
    ls.massif(p, front, 300, 1880, 2500, 500, 500, kind="dome", subs=1, seed=61, mist=(2400, 2800), tone=0.3,
              outline=0.95, texture=0.8, folds=3, dots=1.0, width=1.2)
    return [back, mid, front]


def water(p):
    """A waterfall in two leaps; someone stands on a rock to watch it."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 900, 330, 70, soft=2.5)
    ls.far_range(p, back, -100, 2600, 1100, 1400, 260, tone=0.07, seed=71, peaks=6, fade=0.4)
    left = ls.massif(p, mid, 2480, 560, 1800, 480, 420, kind="steep", subs=3, seed=73, mist=(1350, 1850), tone=0.34,
                     outline=0.95, texture=1.1, folds=7, dots=1.0, trees=3, width=1.1)
    right = ls.massif(p, mid, 3420, 280, 1900, 760, 700, kind="crag", subs=3, seed=72, mist=(1550, 1950), tone=0.46,
                      outline=0.95, texture=1.3, folds=9, dots=1.1, trees=3, cun="axe", width=1.2)
    xf = 3240
    ytop = min(float(right.y_at(xf)) + 30, 1000.0)
    ls.waterfall(p, mid, xf, ytop, 1280, 84, seed=74, mist=False)
    ls.waterfall(p, mid, xf + 20, 1330, 1720, 120, seed=75, mist=True)
    for x, hgt, lean in ((2330, 300, 0.45), (2600, 260, -0.3)):
        ls.pine(p, mid, x, float(left.y_at(x)) + 8, hgt, lean=lean, seed=int(x), width=0.9)
    ls.pine(p, mid, 3560, float(right.y_at(3560)) + 8, 280, lean=-0.35, seed=77, width=0.9)
    ls.massif(p, front, 3700, 1760, 2500, 520, 600, kind="crag", subs=2, seed=78, mist=(2400, 2800), tone=0.42,
              outline=1.0, texture=1.0, folds=4, dots=1.3, cun="axe", width=1.3)
    rockm = ls.massif(p, front, 1950, 1880, 2500, 330, 380, kind="dome", subs=1, seed=79, mist=(2400, 2800), tone=0.4,
                      outline=1.0, texture=0.9, folds=3, dots=1.2, cun="axe", width=1.2)
    ls.figure(p, front, 2060, float(rockm.y_at(2060)) + 4, 110, pose="stand", facing=1, seed=80, staff=True)
    ls.ripples(p, front, 2300, 3300, 1950, 2150, count=18, ink=0.24, seed=81, length=(60, 220))
    ls.pine(p, front, 1840, float(rockm.y_at(1840)) + 10, 600, lean=-0.35, seed=82, width=1.0)
    return [back, mid, front]


def tree(p):
    """Zhuangzi's useless tree: too gnarled to cut, so it lived to be vast."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 1400, 420, 75, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1180, 1420, 230, tone=0.06, seed=91, peaks=7, fade=0.4)
    ls.far_range(p, back, 1200, 3940, 1260, 1480, 170, tone=0.1, seed=92, peaks=5, fade=0.4, dots=0.6)
    hill = ls.massif(p, mid, 2950, 1560, 2350, 1250, 1350, kind="hill", subs=1, seed=93, mist=(2200, 2550),
                     tone=0.2, outline=0.85, texture=0.5, folds=3, dots=1.2, trees=0)
    x0 = 2950
    ls.old_tree(p, mid, x0, float(hill.y_at(x0)) + 20, 1150, lean=0.06, seed=94, crown=1.0, foliage=0.8, width=1.0)
    xs = 2420
    ls.figure(p, mid, xs, float(hill.y_at(xs)) + 18, 230, pose="lie", facing=-1, seed=95)
    ls.butterfly(p, mid, 2150, 1400, 46, seed=96)
    ls.butterfly(p, mid, 2260, 1310, 36, seed=97)
    ls.dot_tree(p, back, 1650, 1330, 120, seed=98, ink=0.5)
    ls.dot_tree(p, back, 1740, 1340, 90, seed=99, ink=0.45)
    ls.reeds(p, front, 1900, 3800, 2170, count=36, h=(30, 110), seed=100)
    return [back, mid, front]


def temples(p):
    """Halls perched on sheer peaks, cranes crossing the clouds."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 1250, 520, 70, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1250, 1500, 260, tone=0.06, seed=111, peaks=8, fade=0.4)
    ls.massif(p, back, 3620, 700, 1500, 330, 420, kind="steep", subs=2, seed=112, mist=(1000, 1400), tone=0.16,
              outline=0.5, texture=0.6, folds=4, dots=0.5, trees=2)
    ls.massif(p, mid, 2080, 360, 1500, 300, 330, kind="steep", subs=3, seed=113, mist=(950, 1400), tone=0.36,
              outline=0.9, texture=1.1, folds=7, dots=1.0, trees=3)
    ls.pavilion(p, mid, 2080, 395, 150, seed=114, kind="pavilion")
    ls.massif(p, mid, 2880, 150, 1700, 380, 400, kind="steep", subs=5, seed=115, mist=(1150, 1650), tone=0.44,
              outline=0.95, texture=1.3, folds=9, dots=1.1, trees=3)
    ls.pavilion(p, mid, 2885, 205, 190, seed=116, kind="hall")
    ls.pavilion(p, mid, 2700, 760, 130, seed=117, kind="hall")
    ls.pavilion(p, mid, 3040, 1000, 120, seed=118, kind="pavilion")
    ls.path_line(p, mid, [(2700, 790), (2780, 620), (2760, 470), (2850, 260)], width=12, ink=0.5, seed=119)
    ls.path_line(p, mid, [(3040, 1030), (2960, 930), (2760, 800)], width=12, ink=0.5, seed=120)
    for i, (x, y, s) in enumerate(((1330, 800, 200), (1560, 930, 160), (1150, 1000, 140))):
        ls.crane(p, mid, x, y, s, facing=-1, seed=121 + i)
    ls.massif(p, front, 3500, 1820, 2500, 620, 700, kind="crag", subs=2, seed=125, mist=(2400, 2800), tone=0.4,
              outline=1.0, texture=1.0, folds=4, dots=1.2, cun="axe", width=1.3)
    ls.pine(p, front, 3180, 1860, 700, lean=-0.5, seed=126, width=1.0)
    return [back, mid, front]


def hermit(p):
    """A thatched hut under old pines by a stream; someone sits inside."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 2080, 360, 85, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1050, 1350, 260, tone=0.07, seed=131, peaks=7, fade=0.4)
    ls.massif(p, back, 2700, 560, 1400, 600, 700, kind="dome", subs=3, seed=132, mist=(1000, 1400), tone=0.18,
              outline=0.6, texture=0.8, folds=5, dots=0.7, trees=3)
    hill = ls.massif(p, mid, 3050, 1400, 2050, 1000, 1000, kind="table", subs=2, seed=133, mist=(1850, 2200),
                     tone=0.28, outline=0.9, texture=0.9, folds=5, dots=1.3, trees=0)
    yh = float(hill.y_at(2850))
    ls.pine(p, mid, 3050, float(hill.y_at(3050)) + 6, 860, lean=-0.42, seed=134, width=1.0)
    ls.pine(p, mid, 3480, float(hill.y_at(3480)) + 6, 640, lean=-0.15, seed=135, width=0.9)
    ls.hut(p, mid, 2780, yh + 4, 330, seed=136, sitter=True)
    ls.dot_tree(p, mid, 2480, float(hill.y_at(2480)) + 6, 260, seed=141, ink=0.8)
    ls.ripples(p, mid, 1300, 2500, 1900, 2080, count=16, ink=0.22, seed=138, length=(60, 240))
    ls.massif(p, front, 1650, 1900, 2500, 380, 420, kind="dome", subs=1, seed=139, mist=(2400, 2800), tone=0.38,
              outline=1.0, texture=0.8, folds=3, dots=1.2, cun="axe", width=1.2)
    ls.bare_tree(p, front, 3700, 2060, 520, lean=-0.3, spread=0.9, width=1.2, seed=140, depth=6, leaves=0.3)
    return [back, mid, front]


def river(p):
    """A broad river running west; sails go with the current into the haze."""
    back, mid, front = p.plane(), p.plane(), p.plane()
    back.sun = ls.disc(p, 1320, 560, 72, soft=2.5)
    ls.far_range(p, back, -100, 3940, 1080, 1260, 150, tone=0.05, seed=151, peaks=9, fade=0.45)
    ls.far_range(p, back, -100, 2600, 1120, 1300, 170, tone=0.08, seed=152, peaks=7, fade=0.4, dots=0.5)
    ls.massif(p, back, 3300, 820, 1300, 520, 700, kind="dome", subs=2, seed=153, mist=(1060, 1320), tone=0.14,
              outline=0.5, texture=0.6, folds=4, dots=0.6, trees=3)
    bank = ls.massif(p, mid, 3500, 1480, 2000, 900, 900, kind="hill", subs=2, seed=154, mist=(1780, 2050), tone=0.24,
                     outline=0.85, texture=0.8, folds=4, dots=1.3, trees=0)
    for i, x in enumerate((2920, 3080, 3230)):
        ls.pavilion(p, mid, x, float(bank.y_at(x)) + 6, 110 + 10 * i, seed=155 + i, kind="hall")
    ls.willow(p, front, 3350, 1900, 900, lean=-0.2, seed=158, width=1.0)
    ls.willow(p, front, 3700, 1960, 760, lean=0.15, seed=159, width=0.9)
    ls.massif(p, front, 3550, 1880, 2500, 800, 700, kind="hill", subs=1, seed=160, mist=(2400, 2800), tone=0.34,
              outline=1.0, texture=0.7, folds=3, dots=1.2, cun="axe", width=1.2)
    ls.reeds(p, front, 2600, 3000, 2080, count=20, seed=161)
    ls.sailboat(p, mid, 2250, 1600, 240, seed=162, facing=-1)
    ls.sailboat(p, mid, 1500, 1380, 130, seed=163, facing=-1, ink=0.6)
    ls.sailboat(p, back, 980, 1290, 70, seed=164, facing=-1, ink=0.4)
    ls.ripples(p, mid, 900, 3000, 1450, 2050, count=30, ink=0.18, seed=165, length=(100, 380))
    ls.geese(p, back, 1900, 820, n=7, size=16, dx=-1, seed=166, ink=0.6)
    return [back, mid, front]


SCENES = {
    "hero": {
        "paint": hero,
        "seed": 1,
        "sun": (1560, 430, 88),
        "layered": True,
        "inscription": {"x": 3700, "y": 150, "size": 62, "columns": ["道可道非常道", "名可名非常名"], "ink": 0.8},
        "seal": {"x": 3500, "y": 640, "size": 118, "text": "道法自然"},
        "focus": 0.66,
    },
    "pass": {"paint": pass_, "seed": 3, "sun": (3180, 820, 105), "focus": 0.68,
             "inscription": {"x": 3720, "y": 160, "size": 54, "columns": ["老子西出函谷關"], "ink": 0.75},
             "seal": {"x": 3665, "y": 620, "size": 96, "text": "紫氣東來"}},
    "yinyang": {"paint": yinyang, "seed": 5, "sun": (1180, 360, 80), "focus": 0.62,
                "inscription": {"x": 3720, "y": 160, "size": 56, "columns": ["萬物負陰而抱陽"], "ink": 0.75},
                "seal": {"x": 3660, "y": 640, "size": 96, "text": "知白守黑"}},
    "water": {"paint": water, "seed": 7, "sun": (900, 330, 70), "focus": 0.72,
              "inscription": {"x": 3740, "y": 150, "size": 54, "columns": ["天下莫柔弱於水"], "ink": 0.75},
              "seal": {"x": 3680, "y": 590, "size": 92, "text": "上善若水"}},
    "tree": {"paint": tree, "seed": 9, "sun": (1400, 420, 75), "focus": 0.7,
             "inscription": {"x": 3720, "y": 160, "size": 54, "columns": ["無用之用"], "ink": 0.75},
             "seal": {"x": 3660, "y": 420, "size": 96, "text": "寢臥其下"}},
    "temples": {"paint": temples, "seed": 11, "sun": (1250, 520, 70), "focus": 0.72,
                "inscription": {"x": 3720, "y": 160, "size": 54, "columns": ["洞天福地"], "ink": 0.75},
                "seal": {"x": 3660, "y": 420, "size": 96, "text": "太上老君"}},
    "river": {"paint": river, "seed": 15, "sun": (1320, 560, 72), "focus": 0.72,
              "inscription": {"x": 3740, "y": 150, "size": 54, "columns": ["大曰逝逝曰遠遠曰反"], "ink": 0.75},
              "seal": {"x": 3680, "y": 730, "size": 92, "text": "周行不殆"}},
    "hermit": {"paint": hermit, "seed": 13, "sun": (2080, 360, 85), "focus": 0.7,
               "inscription": {"x": 3740, "y": 150, "size": 54, "columns": ["致虛極守靜篤"], "ink": 0.75},
               "seal": {"x": 3680, "y": 560, "size": 92, "text": "歸根曰靜"}},
}
