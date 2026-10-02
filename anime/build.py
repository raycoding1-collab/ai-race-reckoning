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
  <x-frame ... [cover]></x-frame>                                         a frame on a reel's stage
Each picture is laid out by its shape (see shape_of): stills fill their box, while banners
and posters are shown whole where cropping would lose them.
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
from urllib.parse import unquote

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
# what each fetched picture actually shows (src/data/images-sourced.json, written by
# tools/images/fetch.py): its description replaces the alt text the shot list wished for
sourced = {}


def esc(s):
    return html.escape(s or "", quote=True)


def find_image(slug):
    for ext in (".webp", ".jpg", ".jpeg", ".png"):
        p = IMG / f"{slug}{ext}"
        if p.exists():
            return p
    return None


def image_info(slug):
    p = find_image(slug)
    if not p:
        return None
    used_images.add(p.name)
    w = h = 0
    if Image is not None:
        try:
            with Image.open(p) as im:
                w, h = im.size
        except Exception:
            pass
    return p, w, h


def shape_of(w, h):
    """'still' for frames between 6:5 and about 2:1, 'wide' for banners and scrolls, 'tall' for posters and pages."""
    if not w or not h:
        return "still"
    r = w / h
    return "tall" if r < 1.2 else "wide" if r > 2.1 else "still"


def img_el(p, w, h, alt, eager=False, pos=None, cls=None, extra=""):
    size = f' width="{w}" height="{h}"' if w and h else ""
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    style = f' style="object-position:{esc(pos)}"' if pos else ""
    c = f' class="{cls}"' if cls else ""
    return f'<img{c} src="img/{p.name}" alt="{esc(alt)}"{size} {loading} decoding="async"{style}{extra}>'


def backdrop(p, eager=False):
    # the same file again, blurred behind a picture that does not fill its box
    loading = "" if eager else ' loading="lazy"'
    return f'<img class="bd" src="img/{p.name}" alt="" aria-hidden="true"{loading} decoding="async">'


ATTR = re.compile(r'(\w+)="([^"]*)"|\b(\w+)\b')


def attrs(s):
    out = {}
    for m in ATTR.finditer(s):
        if m.group(1):
            out[m.group(1)] = m.group(2)
        elif m.group(3):
            out[m.group(3)] = True
    return out


def described(a):
    """The macro's attributes, with the alt text taken from the record of what the fetched
    picture actually shows. Decorative pictures keep alt=""."""
    rec = sourced.get(a.get("src", ""))
    if not rec:
        return a
    a = dict(a)
    if a.get("alt") and rec.get("shows"):
        a["alt"] = rec["shows"]
    if not a.get("credit") and rec.get("credit"):
        a["credit"] = rec["credit"]
    if not a.get("pos") and rec.get("pos"):
        a["pos"] = rec["pos"]  # where the subject sits, for crops
    return a


def shot(a):
    """A picture in a card. Tall pictures sit whole on a blurred copy of themselves, except
    in a cut, where the card turns portrait; wide ones are cropped to the card."""
    a = described(a)
    slug = a.get("src", "")
    info = image_info(slug)
    if not info:
        missing.append(slug)
        tall = " is-tall" if a.get("tall") else ""
        return (
            f'<div class="shot is-ph{tall}" aria-hidden="true">'
            f'<span class="ph"><span lang="ja">{esc(a.get("ph", ""))}</span></span></div>'
        )
    p, w, h = info
    shape = "tall" if a.get("tall") else shape_of(w, h)
    eager = bool(a.get("eager"))
    img = img_el(p, w, h, a.get("alt", ""), eager=eager, pos=a.get("pos") or ("50% 25%" if shape == "tall" else None))
    bd = backdrop(p, eager) if shape == "tall" else ""
    cls = {"tall": " is-tall", "wide": " is-wide"}.get(shape, "")
    return (
        f'<button type="button" class="shot{cls}" data-lb data-t="{esc(a.get("t"))}" '
        f'data-cap="{esc(a.get("cap"))}" data-credit="{esc(a.get("credit"))}">{img}{bd}</button>'
    )


def still(a):
    cap = a.get("cap", "")
    t = a.get("t", "")
    fig = f"<b>{esc(t)}</b> {esc(cap)}" if t else esc(cap)
    return f"<figure>{shot(a)}<figcaption>{fig}</figcaption></figure>"


def frame(a):
    """A full-bleed picture. Stills fill the screen; banners and posters are shown whole,
    as a band or a hanging poster, over a blurred copy of themselves. `cover` always fills."""
    a = described(a)
    slug = a.get("src", "")
    data = f' data-t="{esc(a.get("t"))}" data-credit="{esc(a.get("credit"))}"'
    info = image_info(slug)
    if not info:
        missing.append(slug)
        return f'<div class="ph" data-t="{esc(a.get("t"))}" aria-hidden="true"><span lang="ja">{esc(a.get("ph", ""))}</span></div>'
    p, w, h = info
    shape = shape_of(w, h)
    eager = bool(a.get("eager"))
    if a.get("cover") or shape == "still":
        pos = a.get("pos") or ("50% 25%" if shape == "tall" else None)
        return img_el(p, w, h, a.get("alt", ""), eager=eager, pos=pos, extra=data)
    return (
        f'<div class="fr is-{shape}"{data} style="--r:{w / h:.3f};--h:{h}">'
        f'{img_el(p, w, h, a.get("alt", ""), eager=eager, pos=a.get("pos"))}{backdrop(p, eager)}</div>'
    )


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
        ("Demon Slayer: Infinity Castle*", 2025, 40.2, True),
        ("Spirited Away", 2001, 31.7, True),
        ("Titanic", 1997, 27.8, False),
        ("Frozen", 2014, 25.5, False),
        ("Your Name", 2016, 25.2, True),
        ("Kokuho", 2025, 20.8, False),
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
        '<figure class="chart"><h3>Six of the ten biggest films in Japan are anime</h3>'
        '<p class="sub">All-time box office in Japan only, billions of yen, not adjusted for inflation</p>'
        '<div class="legend"><span><i style="background:var(--era)"></i>Anime</span>'
        '<span><i style="background:color-mix(in oklab, var(--ink) 26%, transparent)"></i>Other films</span></div>'
        f'<ol class="hbars" style="--max:45">{items}</ol>'
        '<p class="src">Source: Kōgyō Tsūshinsha figures as reported by Anime News Network, Oricon and Wikipedia, including re-releases. '
        "*Infinity Castle's total when its run in Japan ended in April 2026, ¥0.55 billion short of Mugen Train. "
        'Worldwide it is far ahead of Mugen Train, with ¥117.9 billion from 98.5 million tickets, '
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


def render_imagenote():
    # written after the macros have run, so it can say whether the pictures are in yet
    rights = (
        "The picture scrolls, Hokusai's prints and the films made before 1953 are in the public domain. Studio Ghibli "
        "stills come from the studio's own image library, which it opened in 2020 for free use “within the bounds of "
        "common sense”.",
        "All other stills and key art are © their respective rights holders, credited on each image, and are "
        "reproduced at reduced size for criticism, commentary and education. Photographs from Wikimedia Commons are "
        "credited to their photographers under their Creative Commons licences.",
    )
    if not used_images:
        items = (
            "The stills for this edition have not been added yet. Each picture is a placeholder in its era's colour, "
            "marked with the Japanese title of the work it will show.",
            "When they are added, the picture scrolls, Hokusai's prints and the films made before 1953 will be in the "
            "public domain; Studio Ghibli stills will come from the studio's own image library, opened in 2020 for free "
            "use “within the bounds of common sense”; and all other stills and key art will be credited to their rights "
            "holders and reproduced at reduced size for criticism, commentary and education.",
        )
    elif missing:
        items = rights + ("Pictures not yet added appear as placeholders in their era's colour, marked with the work's Japanese title.",)
    else:
        items = rights
    # Creative Commons photographs: author, licence and source, as their licences ask
    for r in sorted(sourced.values(), key=lambda r: r["slug"]):
        cm = r.get("commons") or {}
        if r["file"] in used_images and cm.get("license", "").startswith("CC"):
            title = re.sub(r"^File:|\.\w+$", "", unquote(r["source_url"].rsplit("/", 1)[-1])).replace("_", " ")
            lic = f'<a href="{esc(cm["license_url"])}" rel="noopener">{esc(cm["license"])}</a>' if cm.get("license_url") else esc(cm["license"])
            items += (f'“<a href="{esc(r["source_url"])}" rel="noopener">{esc(title)}</a>” by {esc(cm.get("artist") or "unknown")}, '
                      f'{lic}, resized and cropped.',)
    return "<ul>" + "".join(f"<li>{t}</li>" for t in items) + "</ul>"


def render_glossary(gl):
    rows = sorted(gl.items(), key=lambda kv: kv[1]["term"].lower())
    return '<dl class="glossary">' + "".join(
        f'<div id="gl-{k}"><dt>{esc(v["term"])}<span lang="ja">{esc(v["jp"])}</span></dt><dd>{esc(v["def"])}</dd></div>' for k, v in rows
    ) + "</dl>"


def build(artifact_dir=None):
    p = SRC / "data" / "images-sourced.json"
    if p.exists():
        sourced.update({r["slug"]: r for r in json.loads(p.read_text())})
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
    body = body.replace("{{imagenote}}", render_imagenote())
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
