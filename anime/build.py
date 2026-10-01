#!/usr/bin/env python3
"""Build "Drawn to Move", the anime history site.

    python3 anime/build.py                    # writes anime/index.html and anime/assets/
    python3 anime/build.py --artifact OUTDIR  # also writes OUTDIR/index.html (claude.ai artifact body)

Source lives in anime/src: page sections in parts/ (joined in name order), styles in
site.css, behaviour in site.js, and data in data/. Images are read from anime/img;
any image that is missing is replaced by a designed placeholder, and the build lists it.

Macros used in the parts:
  <x-shot src= alt= t= cap= credit= ph= [tall] [eager] [pos=]></x-shot>   a picture with lightbox
  <x-still ...></x-still>                                                 a frame in a film strip
  <x-frame ...></x-frame>                                                 a frame on a reel's stage
  [[key]] or [[key|text]]     inline glossary term (keys in data/glossary.json)
  {{cut}}                     the next CUT number (001, 002, …)
  {{scrub}} {{reelnav}} {{toc}} {{map}} {{chart:market}} {{chart:boxoffice}}
  {{watch}} {{glossary}} {{gldata}} {{quizdata}} {{readtime}}
"""
import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
IMG = ROOT / "img"
ASSETS = ROOT / "assets"

try:
    from PIL import Image  # optional: only used to write width/height on <img>
except Exception:  # pragma: no cover
    Image = None

FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Literata:ital,opsz,wght@0,7..72,400..600;1,7..72,400..600"
    "&family=Shippori+Mincho+B1:wght@600;800"
    "&family=Zen+Kaku+Gothic+New:wght@500;700"
    "&display=swap"
)

missing = []
used_images = set()


def esc(s):
    return html.escape(s or "", quote=True)


def find_image(slug):
    for ext in (".webp", ".jpg", ".jpeg", ".png"):
        p = IMG / f"{slug}{ext}"
        if p.exists():
            return p
    return None


def img_tag(slug, alt, eager=False, pos=None, cls=None, extra=""):
    p = find_image(slug)
    if not p:
        return None
    used_images.add(p.name)
    size = ""
    if Image is not None:
        try:
            with Image.open(p) as im:
                size = f' width="{im.width}" height="{im.height}"'
        except Exception:
            pass
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    style = f' style="object-position:{esc(pos)}"' if pos else ""
    c = f' class="{cls}"' if cls else ""
    return f'<img{c} src="img/{p.name}" alt="{esc(alt)}"{size} {loading} decoding="async"{style}{extra}>'


ATTR = re.compile(r'(\w+)="([^"]*)"|\b(\w+)\b')


def attrs(s):
    out = {}
    for m in ATTR.finditer(s):
        if m.group(1):
            out[m.group(1)] = m.group(2)
        elif m.group(3):
            out[m.group(3)] = True
    return out


def shot(a):
    slug = a.get("src", "")
    tall = " is-tall" if a.get("tall") else ""
    img = img_tag(slug, a.get("alt", ""), eager=bool(a.get("eager")), pos=a.get("pos"))
    if img:
        return (
            f'<button type="button" class="shot{tall}" data-lb data-t="{esc(a.get("t"))}" '
            f'data-cap="{esc(a.get("cap"))}" data-credit="{esc(a.get("credit"))}">{img}</button>'
        )
    missing.append(slug)
    return (
        f'<div class="shot is-ph{tall}" role="img" aria-label="{esc(a.get("alt"))}">'
        f'<span class="ph"><span lang="ja">{esc(a.get("ph", ""))}</span></span></div>'
    )


def still(a):
    cap = a.get("cap", "")
    t = a.get("t", "")
    fig = f"<b>{esc(t)}</b> {esc(cap)}" if t else esc(cap)
    return f"<figure>{shot(a)}<figcaption>{fig}</figcaption></figure>"


def frame(a):
    slug = a.get("src", "")
    data = f' data-t="{esc(a.get("t"))}" data-credit="{esc(a.get("credit"))}"'
    img = img_tag(slug, a.get("alt", ""), eager=bool(a.get("eager")), pos=a.get("pos"), extra=data)
    if img:
        return img
    missing.append(slug)
    return f'<div class="ph"{data} role="img" aria-label="{esc(a.get("alt"))}"><span lang="ja">{esc(a.get("ph", ""))}</span></div>'


def expand_macros(text):
    text = re.sub(r"<x-shot\s+(.*?)></x-shot>", lambda m: shot(attrs(m.group(1))), text, flags=re.S)
    text = re.sub(r"<x-still\s+(.*?)></x-still>", lambda m: still(attrs(m.group(1))), text, flags=re.S)
    text = re.sub(r"<x-frame\s+(.*?)></x-frame>", lambda m: frame(attrs(m.group(1))), text, flags=re.S)
    return text


def expand_glossary(text, gl):
    def rep(m):
        key, _, label = m.group(1).partition("|")
        if key not in gl:
            sys.exit(f"unknown glossary key: {key}")
        return f'<button type="button" class="gl" data-gl="{key}">{label or gl[key]["term"]}</button>'

    return re.sub(r"\[\[([a-z]+(?:\|[^\]]+)?)\]\]", rep, text)


def number_cuts(text):
    n = 0

    def rep(_):
        nonlocal n
        n += 1
        return f"{n:03d}"

    return re.sub(r"\{\{cut\}\}", rep, text)


REEL = re.compile(r'<section class="reel" id="(r\d)" data-reel="(\d+)" data-years="([^"]+)" data-title="([^"]+)" style="--era:\s*(#[0-9a-fA-F]{6})')


def reels_in(text):
    return [dict(id=m[0], n=m[1], years=m[2], title=html.unescape(m[3]), c=m[4]) for m in REEL.findall(text)]


def render_scrub(reels):
    return "".join(
        f'<a href="#{r["id"]}" style="--c:{r["c"]}" data-scrub="{r["id"]}" aria-label="Reel {r["n"]}: {esc(r["title"])}, {esc(r["years"])}"></a>'
        for r in reels
    )


def render_reelnav(reels):
    items = "".join(
        f'<li><a href="#{r["id"]}" style="--c:{r["c"]}"><span class="rn-n">Reel {r["n"]}</span>'
        f'<span class="rn-y">{esc(r["years"])}</span><span class="rn-t">{esc(r["title"])}</span></a></li>'
        for r in reels
    )
    return f'<nav class="reels-nav" aria-label="Reels"><ol>{items}</ol></nav>'


def render_toc(reels, extras):
    items = "".join(
        f'<li><a href="#{r["id"]}" style="--c:{r["c"]}" data-toc-link><span class="toc-n">Reel {r["n"]}</span>'
        f'<span class="toc-t">{esc(r["title"])}</span><span class="toc-y">{esc(r["years"])}</span></a></li>'
        for r in reels
    )
    more = "".join(f'<a class="chip" href="#{i}" data-toc-link>{esc(t)}</a>' for i, t in extras)
    return f'<ol>{items}</ol><div class="toc-more">{more}</div>'


def render_map():
    geo = json.loads((SRC / "data" / "geo.json").read_text())
    spec = json.loads((SRC / "data" / "map.json").read_text())
    by_id = {p["id"]: p for p in geo["pins"]}
    W, H = geo["width"], geo["height"]
    arcs, pins, chips = [], [], []
    for i, p in enumerate(spec["pins"]):
        g = by_id[p["id"]]
        arcs.append(f'<path class="arc" style="--c:{p["c"]}" d="{g["arc"]}"/>')
        pins.append(
            f'<g class="pin" role="button" tabindex="0" aria-pressed="{"true" if i == 0 else "false"}" data-pin="{p["id"]}" style="--c:{p["c"]}" '
            f'aria-label="{esc(p["place"])}, {esc(p["when"])}: {esc(p["title"])}">'
            f'<circle class="halo" cx="{g["x"]}" cy="{g["y"]}" r="6"/><circle class="c" cx="{g["x"]}" cy="{g["y"]}" r="6"/></g>'
        )
        chips.append(f'<button type="button" class="chip" data-pin-chip="{p["id"]}" aria-pressed="{"true" if i == 0 else "false"}">{esc(p["place"].split(",")[0])} · {esc(p["when"])}</button>')
    o = geo["origin"]
    first = spec["pins"][0]
    data = {p["id"]: {k: p[k] for k in ("place", "when", "title", "text", "c")} for p in spec["pins"]}
    svg = (
        f'<svg viewBox="0 0 {W} {H}" role="group" aria-label="World map centred on Japan with {len(pins)} stories of anime abroad">'
        f'<path d="{geo["sphere"]}" fill="none" stroke="var(--rule-strong)" stroke-width="1"/>'
        f'<path class="map-grat" d="{geo["graticule"]}"/>'
        f'<path class="map-land" d="{geo["land"]}"/>'
        f'<path class="map-jp" d="{geo["japan"]}"/>'
        f'<g>{"".join(arcs)}</g>'
        f'<circle cx="{o["x"]}" cy="{o["y"]}" r="4.5" fill="var(--seal)" stroke="var(--bg)" stroke-width="1.5"/>'
        f'<text x="{o["x"] + 9}" y="{o["y"] + 18}" class="ch-lab" style="font-size:13px;font-weight:700">日本</text>'
        f'{"".join(pins)}</svg>'
    )
    panel = (
        f'<div class="map-panel" aria-live="polite" data-map-panel style="--era:{first["c"]}">'
        f'<span class="label" data-f="place">{esc(first["place"])}</span>'
        f'<h3 data-f="title">{esc(first["title"])}</h3><span class="when" data-f="when">{esc(first["when"])}</span>'
        f'<p data-f="text">{first["text"]}</p></div>'
    )
    return (
        f'<div class="map-wrap"><div class="map-box">{svg}</div>{panel}'
        f'<div class="map-list" role="group" aria-label="Choose a story">{"".join(chips)}</div></div>'
        f'<script type="application/json" id="map-data">{json.dumps(data, ensure_ascii=False)}</script>'
    )


def render_market_chart():
    # AJA Anime Industry Reports; trillions of yen, nominal.
    rows = [(2020, 1.1867, 1.2394), (2021, 1.4288, 1.3134), (2022, 1.4685, 1.4592), (2023, 1.6243, 1.7222), (2024, 1.6705, 2.1702)]
    vmax = 4.0
    grid = "".join(f'<span class="vb-line" style="--v:{v}"><em>¥{v}tn</em></span>' for v in (0, 1, 2, 3, 4))
    cols = "".join(
        f'<div class="vb-col"><div class="vb-stack" style="--d:{d};--o:{o}" role="img" aria-label="{y}: ¥{d:.2f} trillion in Japan, ¥{o:.2f} trillion overseas">'
        f'<i class="vb-o"></i><i class="vb-d"></i><b>¥{d + o:.2f}tn</b></div><span class="vb-x">{y}</span></div>'
        for y, d, o in rows
    )
    return (
        '<figure class="chart"><h3>Most of the money now comes from abroad</h3>'
        '<p class="sub">Anime industry revenue by where it was earned, trillions of yen</p>'
        '<div class="legend"><span><i style="background:color-mix(in oklab, var(--ink) 34%, transparent)"></i>In Japan</span>'
        '<span><i style="background:var(--era)"></i>Overseas</span>'
        '<span><i class="lg-dash"></i>Whole market in 2013 (¥1.47tn)</span></div>'
        f'<div class="vbars" style="--max:{vmax}"><div class="vb-plot">{grid}<span class="vb-ref" style="--v:1.47"></span>{cols}</div></div>'
        '<p class="src">Source: Association of Japanese Animations, Anime Industry Reports 2021–2025 (nominal yen). '
        'Overseas revenue was larger than domestic in 2020, 2023 and 2024.</p></figure>'
    )


def render_boxoffice_chart():
    # Japan domestic box office, billions of yen, nominal, including re-releases (Kōgyō Tsūshinsha).
    rows = [
        ("Demon Slayer: Mugen Train", 2020, 40.8, True),
        ("Demon Slayer: Infinity Castle*", 2025, 40.4, True),
        ("Spirited Away", 2001, 31.7, True),
        ("Titanic", 1997, 27.8, False),
        ("Frozen", 2014, 25.5, False),
        ("Your Name", 2016, 25.2, True),
        ("One Piece Film: Red", 2022, 20.3, True),
        ("Harry Potter and the Philosopher's Stone", 2001, 20.3, False),
        ("Princess Mononoke", 1997, 20.2, True),
    ]
    items = "".join(
        f'<li class="{"is-anime" if a else ""}"><span class="hb-t">{esc(t)} <small>{y}</small></span>'
        f'<span class="hb-row"><i style="--v:{v}"></i><b>¥{v:.1f}bn</b></span>'
        f'<span class="visually-hidden">{"Anime" if a else "Not anime"}</span></li>'
        for t, y, v, a in rows
    )
    return (
        '<figure class="chart"><h3>Six of the nine biggest films in Japan are anime</h3>'
        '<p class="sub">All-time domestic box office, billions of yen, not adjusted for inflation</p>'
        '<div class="legend"><span><i style="background:var(--era)"></i>Anime</span>'
        '<span><i style="background:color-mix(in oklab, var(--ink) 26%, transparent)"></i>Other films</span></div>'
        f'<ol class="hbars" style="--max:45">{items}</ol>'
        '<p class="src">Source: Kōgyō Tsūshinsha figures as reported by Anime News Network and Wikipedia, including re-releases. '
        '*Infinity Castle as of March 2026, when it passed ¥40 billion. Worldwide it earned about $820 million, '
        'the most for any Japanese film.</p></figure>'
    )


MOODS = [("wonder", "Wonder"), ("heartbreak", "Heartbreak"), ("think", "Mind-bending"), ("adrenaline", "Adrenaline"),
         ("comfort", "Comfort"), ("unsettling", "Unsettling"), ("laughter", "Laughter")]


def render_watch():
    items = json.loads((SRC / "data" / "watch.json").read_text())
    items.sort(key=lambda w: w["y"])
    chips = "".join(f'<button type="button" class="chip" data-mood="{k}" aria-pressed="false">{v}</button>' for k, v in MOODS)
    fmts = ('<button type="button" class="chip" data-fmt="all" aria-pressed="true">Everything</button>'
            '<button type="button" class="chip" data-fmt="film" aria-pressed="false">Films</button>'
            '<button type="button" class="chip" data-fmt="series" aria-pressed="false">Series</button>'
            '<button type="button" class="chip" data-start aria-pressed="false">Good first watches</button>')
    cards = []
    for w in items:
        mood_names = dict(MOODS)
        tags = "".join(f"<span>{mood_names[m]}</span>" for m in w["m"])
        if w.get("s"):
            tags = '<span class="start">Start here</span>' + tags
        pic = shot({"src": w["img"], "alt": f'{w["t"]} ({w["y"]})', "t": f'{w["t"]} ({w["y"]})', "cap": w["b"], "credit": "", "ph": w.get("ph", "")})
        cards.append(
            f'<article class="w" data-moods="{" ".join(w["m"])}" data-fmt="{w["f"]}" data-start="{"1" if w.get("s") else "0"}">'
            f'{pic}<div class="w-b"><h3 class="w-t">{esc(w["t"])}</h3><p class="w-m">{w["y"]} · {"Film" if w["f"] == "film" else "Series"} · {esc(w["len"])}</p>'
            f'<p class="w-p">{esc(w["b"])}</p><div class="w-tags">{tags}</div></div></article>'
        )
    return (
        f'<div class="filters"><div class="row"><span class="label">Mood</span>{chips}</div>'
        f'<div class="row"><span class="label">Show</span>{fmts}</div></div>'
        f'<p class="watch-count" aria-live="polite" data-watch-count>Showing all {len(items)} works, oldest first.</p>'
        f'<div class="watch" data-watch>{"".join(cards)}</div>'
    )


def render_glossary(gl):
    rows = sorted(gl.items(), key=lambda kv: kv[1]["term"].lower())
    return '<dl class="glossary">' + "".join(
        f'<div id="gl-{k}"><dt>{esc(v["term"])}<span lang="ja">{esc(v["jp"])}</span></dt><dd>{esc(v["def"])}</dd></div>' for k, v in rows
    ) + "</dl>"


def build(artifact_dir=None):
    gl = json.loads((SRC / "data" / "glossary.json").read_text())
    quiz = json.loads((SRC / "data" / "quiz.json").read_text())
    parts = sorted((SRC / "parts").glob("*.html"))
    body = "\n".join(p.read_text() for p in parts)

    reels = reels_in(body)
    extras = [("lab-frames", "The Frame Lab"), ("lab-grammar", "The grammar of anime"), ("lab-world", "Anime and the world"),
              ("lab-numbers", "The numbers"), ("makers", "The makers"), ("myths", "Myths and facts"), ("watch", "Where to begin"),
              ("quiz", "Test yourself"), ("glossary", "Glossary"), ("sources", "Sources")]

    body = body.replace("{{scrub}}", render_scrub(reels))
    body = body.replace("{{reelnav}}", render_reelnav(reels))
    body = body.replace("{{toc}}", render_toc(reels, extras))
    body = body.replace("{{map}}", render_map())
    body = body.replace("{{chart:market}}", render_market_chart())
    body = body.replace("{{chart:boxoffice}}", render_boxoffice_chart())
    body = body.replace("{{watch}}", render_watch())
    body = body.replace("{{glossary}}", render_glossary(gl))
    body = body.replace("{{gldata}}", f'<script type="application/json" id="gl-data">{json.dumps(gl, ensure_ascii=False)}</script>')
    body = body.replace("{{quizdata}}", f'<script type="application/json" id="quiz-data">{json.dumps(quiz, ensure_ascii=False)}</script>')
    body = expand_macros(body)
    body = expand_glossary(body, gl)
    body = number_cuts(body)

    text_only = re.sub(r"<script.*?</script>|<svg.*?</svg>|<[^>]+>", " ", body, flags=re.S)
    words = len(re.findall(r"[A-Za-z0-9’']+", text_only))
    mins = round(words / 230 / 5) * 5
    body = body.replace("{{readtime}}", f"{mins // 60} hr {mins % 60:02d} min read" if mins >= 60 else f"{mins} min read")

    css = (SRC / "site.css").read_text()
    js = (SRC / "site.js").read_text()
    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "site.css").write_text(css)
    (ASSETS / "site.js").write_text(js)
    v = hashlib.sha1((css + js).encode()).hexdigest()[:10]

    head = (SRC / "head.html").read_text().replace("{{fonts}}", FONTS).replace("{{v}}", v)
    page = f"{head}\n<body>\n{body}\n<script src=\"assets/site.js?v={v}\" defer></script>\n</body>\n</html>\n"
    (ROOT / "index.html").write_text(page)

    if artifact_dir:
        out = Path(artifact_dir)
        out.mkdir(parents=True, exist_ok=True)
        art_body = re.sub(r"<!-- pages-only -->.*?<!-- /pages-only -->", "", body, flags=re.S)
        art = (
            "<title>Drawn to Move</title>\n"
            f'<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            f'<link rel="stylesheet" href="{FONTS}">\n<link rel="stylesheet" href="assets/site.css">\n'
            "<script>document.documentElement.classList.add('js')</script>\n"
            f"{art_body}\n<script src=\"assets/site.js\" defer></script>\n"
        )
        (out / "index.html").write_text(art)

    print(f"built index.html · {len(reels)} reels · {words} words · {len(used_images)} images used · {len(missing)} missing")
    if missing:
        (ROOT / "src" / "images-missing.txt").write_text("\n".join(sorted(set(missing))) + "\n")
    else:
        p = ROOT / "src" / "images-missing.txt"
        if p.exists():
            p.unlink()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", metavar="OUTDIR")
    args = ap.parse_args()
    build(args.artifact)
