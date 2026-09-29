#!/usr/bin/env python3
"""Build The Way (published at /tao/) from taoism/src.

    python3 taoism/build.py              # from the repo root
    python3 taoism/build.py --artifact   # also write a preview page for claude.ai

The page is assembled from src/parts/*.html in name order. The build
  - numbers citations written as {{fn:key}} or {{fn:a,b}} and writes the source list,
  - generates the reader, the Zhuangzi stories and the diagrams from src/text/,
  - checks every quotation marked data-q="ddj N" or data-q="zz id" against the
    Chinese text and the translation, and stops if one does not match,
  - subsets the Chinese font to the characters the page uses,
  - bundles and minifies CSS and JS with esbuild and fingerprints every asset.
Paintings are rendered and exported separately (see README.md).
"""
import argparse
import datetime
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "taoism"
SRC = HERE / "src"
OUT = ROOT / "tao"
NM = HERE / "node_modules"
ESBUILD = NM / ".bin" / "esbuild"
SITE_URL = "https://raycoding1-collab.github.io/ai-race-reckoning/tao"
TITLE = "The Way of Taoism"
DESCRIPTION = ("An immersion in Taoism in ten chapters: the Daodejing and its manuscripts, Zhuangzi, "
               "yin and yang, the religion and its mountains, with the whole Daodejing in a new translation "
               "and ink paintings made for the site.")
WPM = 220

sys.path.insert(0, str(HERE / "art"))
import scenes as scene_defs  # noqa: E402


def esc(s):
    return html.escape(s, quote=True)


def digest(b):
    return hashlib.sha256(b).hexdigest()[:10]


# --------------------------------------------------------------------- texts
def read_sections(path):
    """§N-separated text file -> {N: [lines]} (comments and blanks dropped)."""
    out, cur = {}, None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("§"):
            cur = int(line[1:])
            out[cur] = []
            continue
        out[cur].append(line)
    return out


def read_zhuangzi(path):
    items, cur = [], None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line.strip() or line.startswith("#"):
            continue
        if line.startswith("§"):
            f = [x.strip() for x in line[1:].split("|")]
            cur = {"id": f[0], "ch": int(f[1]), "chtitle": f[2], "title": f[3], "src": f[4],
                   "kind": f[5] if len(f) > 5 else "story", "zh": [], "en": [], "mode": "zh"}
            items.append(cur)
            continue
        if line.strip() == "---":
            cur["mode"] = "en"
            continue
        cur[cur["mode"]].append(line.strip())
    return items


DDJ_ZH = read_sections(SRC / "text" / "daodejing.zh.txt")
DDJ_EN = read_sections(SRC / "text" / "daodejing.en.txt")
ZZ = read_zhuangzi(SRC / "text" / "zhuangzi.txt")
ZZ_BY_ID = {z["id"]: z for z in ZZ}
assert sorted(DDJ_ZH) == list(range(1, 82)) and sorted(DDJ_EN) == list(range(1, 82)), "81 chapters expected"

ZH_PUNCT = re.compile(r"[，。；：？！、「」『』（）《》…\s·]")


def zh_norm(s):
    return ZH_PUNCT.sub("", s)


def en_norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"[\"'.,;:!?()]", " ", s.lower())
    return " ".join(s.split())


DDJ_CHARS = sum(len(zh_norm("".join(v))) for v in DDJ_ZH.values())

NOTES = {
    1: "The silk manuscripts from Mawangdui read 恆 <i>héng</i> where this text has 常 <i>cháng</i>, “constant”. See <a href=\"#way\">chapter I</a>.",
    5: "Straw dogs were ritual effigies, honored during a sacrifice and thrown away after it.",
    11: "The hub is the center of the wheel, where the axle passes through.",
    15: "Some printings of the received text read 容 here; this text reads 客, “guest”, with the Heshang Gong text and the silk manuscripts.",
    20: "唯 <i>wéi</i> and 阿 <i>ē</i> are a polite and a curt way of saying yes.",
    27: "襲明, “cloaked light”: 襲 means to put on a garment.",
    39: "輿, “carriage”, is usually read here as 譽, “praise”, and the translation follows that reading.",
    42: "One common reading of the numbers: one is undivided breath, two is yin and yang, three is yin and yang with the breath that blends them.",
    47: "George Harrison set this chapter to music in 1968 as “The Inner Light”.",
    49: "德 is read here as 得, “to gain”, a common reading.",
    50: "十有三 can mean “three in ten” or “thirteen”; the translation follows the first reading.",
    60: "Quoted by Ronald Reagan in his State of the Union address of 1988.",
    64: "The source of the proverb about a journey of a thousand miles. A li is a Chinese mile.",
    67: "The three treasures: 慈 <i>cí</i>, compassion; 儉 <i>jiǎn</i>, restraint or frugality; and not daring to be first.",
    80: "Knotted cords were a way of keeping records before writing.",
}


# ---------------------------------------------------------------- quotations
QUOTE_ERRORS = []


def check_quote(src, zh, en, where):
    kind, _, ref = src.partition(" ")
    if kind == "ddj":
        n = int(ref)
        zsrc, esrc = zh_norm("".join(DDJ_ZH[n])), en_norm(" ".join(DDJ_EN[n]))
    elif kind == "zz":
        z = ZZ_BY_ID[ref]
        zsrc, esrc = zh_norm("".join(z["zh"])), en_norm(" ".join(z["en"]))
    else:
        return
    for seg in re.split(r"……", zh or ""):
        s = zh_norm(seg)
        if s and s not in zsrc:
            QUOTE_ERRORS.append(f"{where}: Chinese not found in {src}: {seg}")
    for seg in re.split(r"…", en or ""):
        s = en_norm(seg)
        if s and s not in esrc:
            QUOTE_ERRORS.append(f"{where}: English not found in {src}: {seg.strip()}")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def verify_quotes(page):
    for m in re.finditer(r'<figure class="q[^"]*" data-q="([^"]+)">(.*?)</figure>', page, re.S):
        src, body = m.group(1), m.group(2)
        zh = re.search(r'<p class="zh"[^>]*>(.*?)</p>', body, re.S)
        en = re.search(r'<p class="en"[^>]*>(.*?)</p>', body, re.S)
        check_quote(src, strip_tags(zh.group(1)) if zh else "", strip_tags(en.group(1)) if en else "", "figure")
    for m in re.finditer(r'<q data-q="([^"]+)">(.*?)</q>', page, re.S):
        check_quote(m.group(1), "", strip_tags(m.group(2)), "inline")


# ------------------------------------------------------------------ figures
def svg_attr(**kw):
    return " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())


def cosmogony_html():
    import random
    rnd = random.Random(42)
    panels = []
    r = 40
    # 道: the empty circle
    panels.append(("道", "dào", "the Way", f'<circle cx="60" cy="60" r="{r}" class="c-line c-faint"/>'))
    panels.append(("一", "yī", "one", f'<circle cx="60" cy="60" r="{r}" class="c-line c-faint"/><circle cx="60" cy="60" r="9" class="c-ink"/>'))
    yin = (f'M60 {60 - r} A{r} {r} 0 0 1 60 {60 + r} A{r / 2} {r / 2} 0 0 1 60 60 '
           f'A{r / 2} {r / 2} 0 0 0 60 {60 - r}Z')
    panels.append(("二", "èr", "two", f'<circle cx="60" cy="60" r="{r}" class="c-line"/><path d="{yin}" class="c-ink"/>'))
    three = ('<circle cx="47" cy="60" r="26" class="c-ink" opacity=".9"/>'
             '<circle cx="73" cy="60" r="26" class="c-line"/>'
             '<path d="M60 37.5 A26 26 0 0 1 60 82.5 A26 26 0 0 1 60 37.5Z" class="c-mid"/>')
    panels.append(("三", "sān", "three", three))
    dots = []
    for _ in range(120):
        a = rnd.random() * 2 * math.pi
        d = r * math.sqrt(rnd.random()) * 0.96
        dots.append(f'<circle cx="{60 + math.cos(a) * d:.1f}" cy="{60 + math.sin(a) * d:.1f}" r="{rnd.uniform(0.9, 2.6):.1f}" class="c-ink"/>')
    panels.append(("萬物", "wànwù", "the ten thousand things", "".join(dots)))
    items = []
    for han, py, en, g in panels:
        items.append(f'<li class="cosmo-step"><svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">{g}</svg>'
                     f'<p class="cosmo-label"><span class="han" lang="zh-Hant">{han}</span> <i>{py}</i> <span class="cosmo-en">{en}</span></p></li>')
    return (
        '<figure class="q cosmo" data-q="ddj 42">'
        f'<ol class="cosmo-steps">{"".join(items)}</ol>'
        '<blockquote><p class="zh" lang="zh-Hant">道生一，一生二，二生三，三生萬物。</p>'
        '<p class="en">The Way gives birth to one, one gives birth to two, two gives birth to three, three gives birth to the ten thousand things.</p></blockquote>'
        '<figcaption><a class="ref" href="#ddj-42">Daodejing 42</a>. Commentators read the numbers in different ways; '
        'the pictures follow one common reading, in which one is undivided breath, two is yin and yang, and three is yin and yang '
        'with the breath that blends them.</figcaption></figure>'
    )


TRIGRAMS = [  # clockwise from the top; lines bottom (inner) to top (outer), 1 = yang
    ("乾", "qián", "heaven", "111"), ("巽", "xùn", "wind", "011"), ("坎", "kǎn", "water", "010"),
    ("艮", "gèn", "mountain", "001"), ("坤", "kūn", "earth", "000"), ("震", "zhèn", "thunder", "100"),
    ("離", "lí", "fire", "101"), ("兌", "duì", "lake", "110"),
]


def taiji_html():
    R = 72
    yin = (f'M0 {-R} A{R} {R} 0 0 1 0 {R} A{R / 2} {R / 2} 0 0 1 0 0 A{R / 2} {R / 2} 0 0 0 0 {-R}Z')
    rings = []
    for i, (han, py, en, lines) in enumerate(TRIGRAMS):
        ang = i * 45
        bars = []
        for k, bit in enumerate(lines):
            y = -118 - k * 11
            if bit == "1":
                bars.append(f'<rect x="-22" y="{y - 3}" width="44" height="6" rx="1"/>')
            else:
                bars.append(f'<rect x="-22" y="{y - 3}" width="19" height="6" rx="1"/><rect x="3" y="{y - 3}" width="19" height="6" rx="1"/>')
        rings.append(f'<g class="tri" transform="rotate({ang})">{"".join(bars)}</g>')
        a = math.radians(ang - 90)
        lx, ly = math.cos(a) * 176, math.sin(a) * 176
        rings.append(f'<text class="tri-label" x="{lx:.1f}" y="{ly:.1f}"><tspan class="tri-han" lang="zh-Hant">{han}</tspan>'
                     f'<tspan x="{lx:.1f}" dy="1.25em">{en}</tspan></text>')
    svg = (f'<svg class="taiji-svg" viewBox="-230 -230 460 460" role="img" aria-labelledby="taiji-title">'
           f'<title id="taiji-title">The taijitu surrounded by the eight trigrams</title>'
           f'<g class="trigrams">{"".join(rings)}</g>'
           f'<g class="taiji-disc"><circle r="{R + 1.5}" class="t-rim"/><circle r="{R}" class="t-yang"/>'
           f'<path d="{yin}" class="t-yin"/><circle cy="{-R / 2}" r="{R / 7}" class="t-yang"/>'
           f'<circle cy="{R / 2}" r="{R / 7}" class="t-yin"/></g></svg>')
    return (
        '<figure class="taiji" aria-labelledby="taiji-cap">'
        f'<div class="taiji-wrap">{svg}'
        '<button type="button" class="taiji-btn" data-theme-toggle aria-label="Switch between day and night"></button></div>'
        '<figcaption id="taiji-cap">The eight trigrams of the Book of Changes around the taijitu, with heaven at the top and earth at '
        'the bottom. Each line is yang (whole) or yin (broken), read from the center outward. Press the disc to turn this site '
        'from day to night, or back.</figcaption></figure>'
    )


PHASES = [  # clockwise from the top: the generating cycle runs wood → fire → earth → metal → water
    ("fire", "火", "huǒ", "south", "summer", "red"),
    ("earth", "土", "tǔ", "center", "late summer", "yellow"),
    ("metal", "金", "jīn", "west", "autumn", "white"),
    ("water", "水", "shuǐ", "north", "winter", "black"),
    ("wood", "木", "mù", "east", "spring", "green"),
]
FEEDS = {"wood": "fire", "fire": "earth", "earth": "metal", "metal": "water", "water": "wood"}
CHECKS = {"wood": "earth", "earth": "water", "water": "fire", "fire": "metal", "metal": "wood"}
FEED_VERB = {"wood": "feeds fire", "fire": "leaves earth in its ashes", "earth": "bears metal",
             "metal": "gathers water", "water": "nourishes wood"}
CHECK_VERB = {"wood": "parts the earth", "earth": "dams water", "water": "quenches fire",
              "fire": "melts metal", "metal": "cuts wood"}


def wuxing_html():
    R, r = 118, 30
    pos = {}
    for i, p in enumerate(PHASES):
        a = math.radians(-90 + i * 72)
        pos[p[0]] = (math.cos(a) * R, math.sin(a) * R)

    def shorten(a, b, d):
        (x1, y1), (x2, y2) = a, b
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        return (x1 + ux * d, y1 + uy * d), (x2 - ux * d, y2 - uy * d)

    arcs, stars, nodes = [], [], []
    for name, han, py, *_ in PHASES:
        a0 = math.atan2(pos[name][1], pos[name][0])
        tgt = FEEDS[name]
        a1 = math.atan2(pos[tgt][1], pos[tgt][0])
        if a1 < a0:
            a1 += 2 * math.pi
        da = r / R * 1.25
        s0, s1 = a0 + da, a1 - da
        p0 = (math.cos(s0) * R, math.sin(s0) * R)
        p1 = (math.cos(s1) * R, math.sin(s1) * R)
        arcs.append(f'<path class="wx-feed" data-from="{name}" d="M{p0[0]:.1f} {p0[1]:.1f} A{R} {R} 0 0 1 {p1[0]:.1f} {p1[1]:.1f}" marker-end="url(#wx-arrow)"/>')
        q0, q1 = shorten(pos[name], pos[CHECKS[name]], r + 6)
        stars.append(f'<path class="wx-check" data-from="{name}" d="M{q0[0]:.1f} {q0[1]:.1f} L{q1[0]:.1f} {q1[1]:.1f}" marker-end="url(#wx-arrow2)"/>')
    for name, han, py, *_ in PHASES:
        x, y = pos[name]
        ly = y + (r + 20 if y > 20 else -(r + 10))
        nodes.append(f'<g class="wx-node" data-phase="{name}" tabindex="0" role="button" aria-label="{name}">'
                     f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" class="wx-disc wx-{name}"/>'
                     f'<text x="{x:.1f}" y="{y + 9:.1f}" class="wx-han" lang="zh-Hant">{han}</text>'
                     f'<text x="{x:.1f}" y="{ly:.1f}" class="wx-name">{name}</text></g>')
    defs = ('<defs><marker id="wx-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0 1 L9 5 L0 9z" class="wx-head"/></marker>'
            '<marker id="wx-arrow2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
            '<path d="M0 1 L9 5 L0 9z" class="wx-head2"/></marker></defs>')
    svg = (f'<svg class="wx-svg" viewBox="-190 -178 380 360" role="img" aria-labelledby="wx-title">'
           f'<title id="wx-title">The five phases: the generating cycle around the circle, the overcoming cycle across it</title>'
           f'{defs}<g>{"".join(stars)}</g><g>{"".join(arcs)}</g>{"".join(nodes)}</svg>')
    rows = "".join(
        f'<tr><th scope="row"><span class="han" lang="zh-Hant">{han}</span> {name}</th><td>{d}</td><td>{s}</td><td>{c}</td>'
        f'<td>{FEED_VERB[name]}</td><td>{CHECK_VERB[name]}</td></tr>'
        for name, han, py, d, s, c in [PHASES[4], PHASES[0], PHASES[1], PHASES[2], PHASES[3]])
    table = ('<div class="table-wrap"><table class="wx-table"><thead><tr><th scope="col">Phase</th><th scope="col">Direction</th>'
             '<th scope="col">Season</th><th scope="col">Color</th><th scope="col">Generates</th><th scope="col">Overcomes</th></tr></thead>'
             f'<tbody>{rows}</tbody></table></div>')
    legend = ('<p class="wx-read" aria-live="polite">Around the circle, each phase generates the next. Across it, each overcomes '
              'the one two steps ahead. Select a phase to follow its two arrows.</p>')
    return (f'<figure class="wuxing" aria-labelledby="wx-cap"><div class="wx-grid"><div class="wx-fig">{svg}</div>'
            f'<div class="wx-side">{legend}{table}</div></div>'
            '<figcaption id="wx-cap" class="visually-hidden">The five phases and their correlations</figcaption></figure>')


GUODIAN = {2, 5, 9, 13, 15, 16, 17, 18, 19, 20, 25, 30, 31, 32, 35, 37, 40, 41, 44, 45, 46, 48, 52, 54, 55, 56, 57, 59, 63, 64, 66}


def witnesses_html():
    assert len(GUODIAN) == 31

    def grid(order, have, label):
        cells = []
        for n in order:
            part = "dao" if n <= 37 else "de"
            on = " on" if n in have else ""
            cells.append(f'<i class="wc {part}{on}" title="Chapter {n}"></i>')
        return f'<div class="wgrid" role="img" aria-label="{esc(label)}">{"".join(cells)}</div>'

    allc = set(range(1, 82))
    received = list(range(1, 82))
    silk = list(range(38, 82)) + list(range(1, 38))
    items = [
        ("Guodian", "c. 300 BCE", "bamboo slips", "31 of the 81 chapters, in a different order",
         grid(received, GUODIAN, "Guodian: 31 of 81 chapters present"), "guodian"),
        ("Mawangdui", "sealed 168 BCE", "two silk scrolls", "nearly the whole text, with the virtue half first",
         grid(silk, allc, "Mawangdui: all chapters, virtue half first"), "mawangdui"),
        ("Peking University", "Western Han", "bamboo slips", "nearly the whole text, in 77 chapters",
         grid(received, allc, "Peking University: all chapters, in 77 sections"), "beida"),
        ("Received text", "after Wang Bi, 226–249", "printed editions", "81 chapters, the Way half first",
         grid(received, allc, "Received text: 81 chapters"), "wagner"),
    ]
    cards = []
    for name, date, medium, extent, g, fn in items:
        cards.append(f'<li class="wit"><p class="wit-name">{name}</p><p class="wit-meta">{date} · {medium}</p>{g}'
                     f'<p class="wit-extent">{extent}{{{{fn:{fn}}}}}</p></li>')
    return ('<figure class="witnesses" aria-labelledby="wit-cap"><ol class="wit-list">' + "".join(cards) + '</ol>'
            '<figcaption id="wit-cap">Each square is one of the 81 chapters of the received text: '
            '<span class="key key-dao"></span> the Way (1–37), <span class="key key-de"></span> virtue (38–81). '
            'Filled squares are chapters with matching passages in that copy. The Mawangdui grid is laid out in the '
            'manuscripts’ own order.</figcaption></figure>')


def stories_html():
    stories = [z for z in ZZ if z["kind"] == "story"]
    tabs, panels = [], []
    for i, z in enumerate(stories):
        sel = "true" if i == 0 else "false"
        ti = "" if i == 0 else ' tabindex="-1"'
        tabs.append(f'<button type="button" role="tab" class="story-tab" id="st-{z["id"]}" aria-controls="sp-{z["id"]}" '
                    f'aria-selected="{sel}"{ti}><span class="st-n">{i + 1}</span>'
                    f'<span class="st-t">{esc(z["title"])}</span></button>')
        zh = "".join(f"<p>{esc(line)}</p>" for line in z["zh"])
        en = "".join(f"<p>{esc(line)}</p>" for line in z["en"])
        cur = " current" if i == 0 else ""
        panels.append(
            f'<article class="story{cur}" role="tabpanel" id="sp-{z["id"]}" aria-labelledby="st-{z["id"]}">'
            f'<div class="story-zh" lang="zh-Hant">{zh}</div>'
            f'<div class="story-en"><h3 class="story-title">{esc(z["title"])}</h3>{en}'
            f'<p class="story-src">Zhuangzi {z["ch"]}, <span class="han" lang="zh-Hant">{z["chtitle"]}</span>{{{{fn:{z["src"]}}}}}</p></div></article>')
    return (f'<div class="stories"><div class="story-tabs" role="tablist" aria-label="Stories from the Zhuangzi">{"".join(tabs)}</div>'
            f'<div class="story-panels">{"".join(panels)}</div></div>')


def reader_html():
    def grid(a, b):
        return "".join(f'<li><a class="rg" href="#ddj-{n}" data-ch="{n}">{n}</a></li>' for n in range(a, b + 1))

    arts = []
    for n in range(1, 82):
        zh = "".join(f"<p>{esc(line)}</p>" for line in DDJ_ZH[n])
        en_lines = DDJ_EN[n]
        en = "<p>" + "<br>".join(esc(line) for line in en_lines) + "</p>"
        note = f'<p class="ddj-note">{NOTES[n]}</p>' if n in NOTES else ""
        part = "道經" if n <= 37 else "德經"
        cur = " current" if n == 1 else ""
        arts.append(
            f'<article class="ddj{cur}" id="ddj-{n}" data-ch="{n}" aria-labelledby="ddj-{n}-h">'
            f'<header class="ddj-head"><h3 id="ddj-{n}-h" class="ddj-h"><span class="ddj-n">{n}</span>'
            f'<span class="ddj-part"><span class="han" lang="zh-Hant">{part}</span> · {"The Way" if n <= 37 else "Virtue"}</span></h3></header>'
            f'<div class="ddj-body"><div class="ddj-zh" lang="zh-Hant">{zh}</div><div class="ddj-en">{en}{note}</div></div></article>')
    nav = ('<nav class="reader-nav" aria-label="Chapters of the Daodejing">'
           '<p class="reader-part"><span class="han" lang="zh-Hant">道經</span> The Way <span>1–37</span></p>'
           f'<ol class="reader-grid">{grid(1, 37)}</ol>'
           '<p class="reader-part"><span class="han" lang="zh-Hant">德經</span> Virtue <span>38–81</span></p>'
           f'<ol class="reader-grid">{grid(38, 81)}</ol>'
           '<div class="reader-tools">'
           '<button type="button" class="btn btn-quiet" data-reader="prev" aria-label="Previous chapter">Previous</button>'
           '<button type="button" class="btn" data-reader="random">Draw a chapter</button>'
           '<button type="button" class="btn btn-quiet" data-reader="next" aria-label="Next chapter">Next</button>'
           '<button type="button" class="btn btn-quiet" data-reader="flow" aria-pressed="false">Horizontal Chinese</button>'
           '</div></nav>')
    return f'<div class="reader" id="reader">{nav}<div class="reader-pages" aria-live="polite">{"".join(arts)}</div></div>'


# ------------------------------------------------------------------- stage
SCENE_ALT = {}


def stage_html():
    out = []
    for name, spec in scene_defs.SCENES.items():
        focus = f'{spec.get("focus", 0.5) * 100:.0f}%'
        pics = []
        for theme in ("day", "night"):
            base = f"img/{name}-{theme}"
            land = ", ".join(f"{base}-{w}.avif {w}w" for w in (1600, 2560, 3840))
            if spec.get("layered"):
                layers = []
                for i in range(3):
                    lb = f"{base}-L{i}"
                    layers.append(
                        f'<picture class="layer layer-{i}"><source type="image/avif" data-srcset="{lb}-2560.avif 2560w, {lb}-3840.avif 3840w" sizes="108vw">'
                        f'<img alt="" data-src="{lb}-2560.webp" decoding="async"></picture>')
                pics.append(
                    f'<div class="scene-theme {theme}">'
                    f'<picture class="flat"><source type="image/avif" media="(orientation: portrait)" data-srcset="{base}-p.avif">'
                    f'<source type="image/webp" media="(orientation: portrait)" data-srcset="{base}-p.webp">'
                    f'<source type="image/avif" data-srcset="{land}" sizes="100vw"><img alt="" data-src="{base}-2560.webp" decoding="async"></picture>'
                    f'<div class="layers">{"".join(layers)}</div></div>')
            else:
                pics.append(
                    f'<div class="scene-theme {theme}"><picture class="flat">'
                    f'<source type="image/avif" media="(orientation: portrait)" data-srcset="{base}-p.avif">'
                    f'<source type="image/webp" media="(orientation: portrait)" data-srcset="{base}-p.webp">'
                    f'<source type="image/avif" data-srcset="{land}" sizes="100vw">'
                    f'<img alt="" data-src="{base}-2560.webp" decoding="async"></picture></div>')
        out.append(f'<div class="scene" data-scene="{name}" style="--focus:{focus}">{"".join(pics)}</div>')
    return ('<div class="stage" aria-hidden="true">' + "".join(out) +
            '<div class="mist"><i class="m1"></i><i class="m2"></i><i class="m3"></i></div>'
            '<div class="grain day"></div><div class="grain night"></div></div>')


# ------------------------------------------------------------- footnotes
def number_citations(page, sources):
    order, index = [], {}

    def repl(m):
        keys = [k.strip() for k in m.group(1).split(",")]
        nums = []
        for k in keys:
            if k not in sources:
                raise SystemExit(f"unknown source key: {k}")
            if k not in index:
                order.append(k)
                index[k] = len(order)
            nums.append(index[k])
        links = ",".join(f'<a href="#src-{n}" data-fn="{n}">{n}</a>' for n in nums)
        return f'<sup class="fn">{links}</sup>'

    page = re.sub(r"\{\{fn:([^}]+)\}\}", repl, page)
    items = []
    for n, k in enumerate(order, 1):
        s = sources[k]
        date = f' <span class="src-date">{esc(s["date"])}</span>' if s.get("date") else ""
        items.append(f'<li id="src-{n}"><span class="src-org">{esc(s["org"])}</span> '
                     f'<a href="{esc(s["url"])}" rel="noopener" target="_blank">{esc(s["t"])}</a>{date}</li>')
    unused = sorted(set(sources) - set(order))
    if unused:
        print("  note: sources never cited:", ", ".join(unused))
    return page, f'<ol class="src-list">{"".join(items)}</ol>', len(order)


# ------------------------------------------------------------------ fonts
def subset_fonts(page_text, js_text, fonts_out):
    from fontTools import subset
    from fontTools.ttLib import TTFont

    def cjk(t):
        return {c for c in t if ord(c) > 0x2E7F}
    punct = set("，。；：？！、「」『』（）《》…·")
    lazy_zone = re.sub(r'<div class="reader-pages".*?</article></div>', "", page_text, flags=re.S)
    lazy_zone = re.sub(r'<div class="story-panels">.*?</article></div>', "", lazy_zone, flags=re.S)
    first = [a.group(0) for a in re.finditer(r'<article class="(?:ddj|story) current".*?</article>', page_text, flags=re.S)]
    assert len(first) == 2, "expected the first reader chapter and the first story to be marked current"
    core = sorted(cjk(lazy_zone) | cjk("".join(first)) | cjk(js_text) | punct)
    rest = sorted(cjk(page_text) - set(core))
    files = {"core_chars": core, "rest_chars": rest}
    wk = NM / "@expo-google-fonts/lxgw-wenkai-tc/400Regular/LXGWWenKaiTC_400Regular.ttf"
    jobs = [
        ("wenkai", wk, "".join(core)),
        ("wenkai-more", wk, "".join(rest)),
        ("seal", NM / "@expo-google-fonts/noto-serif-tc/900Black/NotoSerifTC_900Black.ttf", "道法自然歸"),
    ]
    for name, path, text in jobs:
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
        opts.notdef_outline = True
        f = TTFont(str(path), recalcTimestamp=False)  # keep the build reproducible
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(f)
        tmp = fonts_out / f"{name}.woff2"
        f.flavor = "woff2"
        f.save(str(tmp))
        data = tmp.read_bytes()
        final = fonts_out / f"{name}.{digest(data)}.woff2"
        tmp.rename(final)
        files[name] = final.name
        print(f"  font {final.name}: {len(data) // 1024} KB, {len(text)} chars")
    latin = {
        "garamond": ("@fontsource-variable/eb-garamond/files/eb-garamond-{s}-wght-normal.woff2"),
        "garamond-italic": ("@fontsource-variable/eb-garamond/files/eb-garamond-{s}-wght-italic.woff2"),
        "cormorant": ("@fontsource-variable/cormorant-garamond/files/cormorant-garamond-{s}-wght-normal.woff2"),
        "cormorant-italic": ("@fontsource-variable/cormorant-garamond/files/cormorant-garamond-{s}-wght-italic.woff2"),
    }
    for name, pat in latin.items():
        for s in ("latin", "latin-ext"):
            data = (NM / pat.format(s=s)).read_bytes()
            fn = f"{name}-{s}.{digest(data)}.woff2"
            (fonts_out / fn).write_bytes(data)
            files[f"{name}-{s}"] = fn
    return files


FONT_RANGES = {
    "latin": "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    "latin-ext": "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
}


def font_css(files):
    css = []
    for fam, key, style, wght in (("EB Garamond", "garamond", "normal", "400 800"),
                                  ("EB Garamond", "garamond-italic", "italic", "400 800"),
                                  ("Cormorant Garamond", "cormorant", "normal", "300 700"),
                                  ("Cormorant Garamond", "cormorant-italic", "italic", "300 700")):
        for s in ("latin", "latin-ext"):
            css.append(f"@font-face{{font-family:'{fam}';font-style:{style};font-display:swap;font-weight:{wght};"
                       f"src:url(../fonts/{files[f'{key}-{s}']}) format('woff2');unicode-range:{FONT_RANGES[s]}}}")
    ranges = ",".join(f"U+{ord(c):04X}" for c in files["core_chars"])
    css.append(f"@font-face{{font-family:'WenKai';font-style:normal;font-weight:400;font-display:swap;"
               f"src:url(../fonts/{files['wenkai']}) format('woff2');unicode-range:{ranges}}}")
    more = ",".join(f"U+{ord(c):04X}" for c in files["rest_chars"])
    css.append(f"@font-face{{font-family:'WenKai';font-style:normal;font-weight:400;font-display:swap;"
               f"src:url(../fonts/{files['wenkai-more']}) format('woff2');unicode-range:{more}}}")
    css.append(f"@font-face{{font-family:'SealSerif';font-style:normal;font-weight:900;font-display:block;"
               f"src:url(../fonts/{files['seal']}) format('woff2')}}")
    return "\n".join(css) + "\n"


# ------------------------------------------------------------- stroke data
def stroke_data(page):
    chars = []
    for m in re.finditer(r'data-write="([^"]+)"', page):
        for c in m.group(1):
            if c not in chars:
                chars.append(c)
    data = {}
    for c in chars:
        p = NM / "hanzi-writer-data" / f"{c}.json"
        d = json.loads(p.read_text(encoding="utf-8"))
        data[c] = {"s": d["strokes"], "m": [[[round(x), round(y)] for x, y in med] for med in d["medians"]]}
    return data


# -------------------------------------------------------------------- icons
def glyph_path(char, font_path, size=1000):
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont
    f = TTFont(str(font_path))
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord(char)]
    upm = f["head"].unitsPerEm
    pen = SVGPathPen(gs)
    s = size / upm
    tp = TransformPen(pen, (s, 0, 0, -s, 0, 880 * size / 1000))
    gs[name].draw(tp)
    return pen.getCommands(), gs[name].width * s


def write_icons():
    path, adv = glyph_path("道", NM / "@expo-google-fonts/noto-serif-tc/900Black/NotoSerifTC_900Black.ttf")
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'
           '<rect x="40" y="40" width="920" height="920" rx="70" fill="#B8352A"/>'
           f'<g transform="translate(130 110) scale(.74)"><path d="{path}" fill="#F3ECDD"/></g></svg>')
    (OUT / "favicon.svg").write_text(svg, encoding="utf-8")
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGB", (180, 180), (184, 53, 42))
        d = ImageDraw.Draw(img)
        font = ImageFont.truetype(str(NM / "@expo-google-fonts/noto-serif-tc/900Black/NotoSerifTC_900Black.ttf"), 128)
        d.text((90, 92), "道", font=font, fill=(243, 236, 221), anchor="mm")
        img.save(OUT / "apple-touch-icon.png", optimize=True)
    except Exception as e:  # pragma: no cover
        print("  icon:", e)


def write_og():
    from PIL import Image, ImageDraw, ImageFont
    src = HERE / ".cache" / "art" / "hero-day.png"
    if not src.exists():
        print("  og: no hero render, skipped")
        return
    im = Image.open(src).convert("RGB").resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652))
    d = ImageDraw.Draw(im)
    tmp = HERE / ".cache" / "cormorant.ttf"
    try:
        from fontTools.ttLib import TTFont
        f = TTFont(str(NM / "@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2"))
        f.flavor = None
        f.save(str(tmp))
        from fontTools.varLib.instancer import instantiateVariableFont
        inst = instantiateVariableFont(TTFont(str(tmp)), {"wght": 500})
        inst.save(str(tmp))
        title = ImageFont.truetype(str(tmp), 118)
        small = ImageFont.truetype(str(tmp), 34)
    except Exception as e:  # pragma: no cover
        print("  og font:", e)
        title = small = ImageFont.load_default()
    kai = ImageFont.truetype(str(NM / "@expo-google-fonts/lxgw-wenkai-tc/400Regular/LXGWWenKaiTC_400Regular.ttf"), 150)
    ink = (23, 24, 28)
    d.text((86, 150), "道", font=kai, fill=ink)
    d.text((86, 330), "The Way", font=title, fill=ink)
    d.text((90, 470), "An immersion in Taoism", font=small, fill=(74, 72, 67))
    im.save(OUT / "og.jpg", quality=88, optimize=True, progressive=True)


# -------------------------------------------------------------------- head
def head_html(css_name, js_name, files, artifact=False):
    theme_boot = ("(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('way-theme');"
                  "if(t==='dark'||t==='light')d.setAttribute('data-theme',t)}catch(e){}})();")
    meta = [
        f'<title>{TITLE}</title>',
        f'<meta name="description" content="{esc(DESCRIPTION)}">',
    ]
    if not artifact:
        meta += [
            '<meta name="theme-color" content="#ECE4D2" media="(prefers-color-scheme: light)">',
            '<meta name="theme-color" content="#161C27" media="(prefers-color-scheme: dark)">',
            '<meta name="color-scheme" content="light dark">',
            f'<link rel="canonical" href="{SITE_URL}/">',
            '<meta property="og:type" content="website">',
            f'<meta property="og:title" content="{TITLE}">',
            f'<meta property="og:description" content="{esc(DESCRIPTION)}">',
            f'<meta property="og:url" content="{SITE_URL}/">',
            f'<meta property="og:image" content="{SITE_URL}/og.jpg">',
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
            '<meta property="og:image:alt" content="An ink painting of misty mountains, a leaning pine and a red sun, with the character 道 and the title The Way">',
            '<meta name="twitter:card" content="summary_large_image">',
            '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
            '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        ]
    meta += [
        f'<link rel="preload" href="fonts/{files["garamond-latin"]}" as="font" type="font/woff2" crossorigin>',
        f'<link rel="preload" href="fonts/{files["wenkai"]}" as="font" type="font/woff2" crossorigin>',
        f'<script>{theme_boot}</script>',
        f'<link rel="stylesheet" href="assets/{css_name}">',
        f'<script type="module" src="assets/{js_name}"></script>',
    ]
    return "\n".join(meta)


# ------------------------------------------------------------------- build
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", action="store_true")
    args = ap.parse_args()

    sources = json.loads((SRC / "sources.json").read_text(encoding="utf-8"))
    parts = sorted((SRC / "parts").glob("*.html"))
    page = "\n".join(p.read_text(encoding="utf-8") for p in parts)

    shortcodes = {
        "witnesses": witnesses_html, "cosmogony": cosmogony_html, "taiji": taiji_html, "wuxing": wuxing_html,
        "stories": stories_html, "reader": reader_html,
    }
    for k, fn in shortcodes.items():
        page = page.replace("{{" + k + "}}", fn())
    page = page.replace("{{ddj_chars}}", f"{DDJ_CHARS:,}").replace("{{year}}", str(datetime.date.today().year))

    verify_quotes(page)
    if QUOTE_ERRORS:
        print("\n".join(QUOTE_ERRORS))
        raise SystemExit(f"{len(QUOTE_ERRORS)} quotation(s) do not match the source texts")

    page, src_list, n_src = number_citations(page, sources)
    page = page.replace("{{sources}}", src_list)

    # reading times per chapter for the contents
    toc = []
    for m in re.finditer(r'<section class="chapter[^"]*" id="([^"]+)" data-scene="[^"]+" data-num="([^"]+)" data-title="([^"]+)"(.*?)</section>', page, re.S):
        cid, num, title, body = m.groups()
        words = len(re.findall(r"[A-Za-z’']+", strip_tags(re.sub(r"<div class=\"reader-pages\".*", "", body, flags=re.S))))
        han = re.search(r'data-write="([^"]+)"', body).group(1)
        dek = strip_tags(re.search(r'<p class="opener-dek">(.*?)</p>', body, re.S).group(1))
        toc.append((cid, num, title, han, dek, max(1, round(words / WPM))))

    toc_html = "".join(
        f'<li><a href="#{cid}"><span class="toc-n">{num}</span><span class="toc-h" lang="zh-Hant">{han}</span>'
        f'<span class="toc-t">{esc(title)}</span><span class="toc-d">{esc(dek)}</span><span class="toc-r">{mins} min</span></a></li>'
        for cid, num, title, han, dek, mins in toc)

    strokes = stroke_data(page)
    body_html = (
        '<a class="skip" href="#way">Skip to the first chapter</a>\n'
        + stage_html() + "\n"
        + mast_html(toc_html) + "\n"
        + '<main id="main">\n' + page.replace('<footer class="end"', '</main>\n<footer class="end"', 1)
        + "\n"
        + f'<script type="application/json" id="stroke-data">{json.dumps(strokes, separators=(",", ":"), ensure_ascii=False)}</script>'
    )
    if "</main>" not in body_html:
        body_html += "</main>"

    # assets
    if OUT.exists():
        for sub in ("assets", "fonts"):
            shutil.rmtree(OUT / sub, ignore_errors=True)
    (OUT / "assets").mkdir(parents=True, exist_ok=True)
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)

    js_src = "".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))
    files = subset_fonts(body_html, js_src, OUT / "fonts")
    css = font_css(files) + (SRC / "style.css").read_text(encoding="utf-8")
    tmp_css = HERE / ".cache" / "site.css"
    tmp_css.parent.mkdir(exist_ok=True)
    tmp_css.write_text(css, encoding="utf-8")
    subprocess.run([str(ESBUILD), str(tmp_css), "--minify", "--loader:.css=css",
                    f"--outfile={HERE / '.cache' / 'site.min.css'}"], check=True, capture_output=True)
    css_min = (HERE / ".cache" / "site.min.css").read_bytes()
    css_name = f"site.{digest(css_min)}.css"
    (OUT / "assets" / css_name).write_bytes(css_min)
    subprocess.run([str(ESBUILD), str(SRC / "js" / "main.js"), "--bundle", "--minify", "--format=esm", "--target=es2020",
                    f"--outfile={HERE / '.cache' / 'site.min.js'}"], check=True, capture_output=True)
    js_min = (HERE / ".cache" / "site.min.js").read_bytes()
    js_name = f"site.{digest(js_min)}.js"
    (OUT / "assets" / js_name).write_bytes(js_min)

    head = head_html(css_name, js_name, files)
    doc = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
           "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
           + head + "\n</head>\n<body>\n" + body_html + "\n</body>\n</html>\n")
    (OUT / "index.html").write_text(doc, encoding="utf-8")
    write_icons()
    write_og()

    if args.artifact:
        art = HERE / ".cache" / "artifact"
        art.mkdir(parents=True, exist_ok=True)
        ahead = head_html(css_name, js_name, files, artifact=True)
        abody = body_html.replace(' download>', '>')
        (art / "index.html").write_text(ahead + "\n" + abody + "\n", encoding="utf-8")
        print("  artifact page:", art / "index.html")

    kb = (OUT / "index.html").stat().st_size // 1024
    print(f"built {OUT / 'index.html'}: {kb} KB html, css {len(css_min) // 1024} KB, js {len(js_min) // 1024} KB, "
          f"{n_src} sources, {DDJ_CHARS} characters in the Daodejing, quotes verified")


def mast_html(toc_html):
    return f'''<header class="mast" data-mast>
  <a class="mast-brand" href="#top" aria-label="The Way, back to the top"><span class="mast-seal" lang="zh-Hant" aria-hidden="true">道</span><span class="mast-title">The Way</span></a>
  <p class="mast-chapter" aria-hidden="true"><span data-mast-num></span><span data-mast-title></span></p>
  <div class="mast-tools">
    <button class="tool" type="button" data-sound aria-pressed="false" aria-label="Play ambient sound">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="snd-off" d="M4 9h4l5-4v14l-5-4H4z"/><path class="snd-wave" d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M18.6 6c2 1.7 3 3.7 3 6s-1 4.3-3 6"/></svg>
    </button>
    <button class="tool tool-taiji" type="button" data-theme-toggle aria-label="Switch between day and night">
      <svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><circle r="10.5" class="tj-rim"/><path class="tj-yin" d="M0 -10 A10 10 0 0 1 0 10 A5 5 0 0 1 0 0 A5 5 0 0 0 0 -10Z"/><circle cy="-5" r="1.6" class="tj-yin"/><circle cy="5" r="1.6" class="tj-yang"/></svg>
    </button>
    <button class="tool tool-toc" type="button" aria-expanded="false" aria-controls="toc" data-toc-open><span>Contents</span></button>
  </div>
  <div class="mast-progress" aria-hidden="true"><i data-progress></i></div>
</header>
<nav class="toc" id="toc" aria-label="Contents" hidden data-toc>
  <div class="toc-inner">
    <div class="toc-head"><p class="toc-kicker">Contents</p><button class="toc-close" type="button" data-toc-close>Close</button></div>
    <ol class="toc-list">{toc_html}</ol>
    <p class="toc-foot"><a href="#reader">The Daodejing, all 81 chapters</a><a href="#sources">Sources</a></p>
  </div>
</nav>'''


if __name__ == "__main__":
    main()
