#!/usr/bin/env python3
"""Fetch pictures for Drawn to Move.

The sandbox that builds the site cannot reach image hosts, so this runs in GitHub
Actions (.github/workflows/anime-images.yml) whenever job.json changes, and commits
what it finds back to the branch. It works in two passes:

  "mode": "candidates"  contact sheets of what each source offers, for a person to
                        choose from: tools/images/cand/*.jpg and cand/candidates.json
  "mode": "final"       the chosen pictures, as img/<slug>.webp, recorded in
                        src/data/images-sourced.json
  "mode": "links"       checks the links on the sources page, since the sandbox cannot
                        reach most of them either: tools/images/links-report.json

Sources: Studio Ghibli's free image library (ghibli.jp/gallery), Wikimedia Commons
(public-domain works), AniList and Kitsu (banners and key art), and the pictures
used in each work's English Wikipedia article.

    python3 anime/tools/images/fetch.py anime/tools/images/job.json [--dry]

--dry draws stand-in pictures instead of downloading, to test the layout offline.
"""
import io
import json
import re
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ANIME = HERE.parent.parent
CAND = HERE / "cand"
IMG = ANIME / "img"
SOURCED = ANIME / "src" / "data" / "images-sourced.json"

UA = ("DrawnToMove/1.0 (educational history of anime; "
      "https://github.com/raycoding1-collab/ai-race-reckoning) python-requests")
DRY = "--dry" in sys.argv
LOG = []


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


# ---------------------------------------------------------------- network

if not DRY:
    import requests

    S = requests.Session()
    S.headers["User-Agent"] = UA


def http(method, url, **kw):
    if DRY:
        return None
    kw.setdefault("timeout", 45)
    for i in range(5):
        try:
            r = S.request(method, url, **kw)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", "10") or 10) + 1
                log(f"  429 from {url[:60]}, waiting {wait}s")
                time.sleep(min(wait, 70))
                continue
            if r.status_code >= 500:
                time.sleep(3 + 4 * i)
                continue
            return r
        except Exception as e:  # network errors: retry
            log(f"  {method} failed {url[:90]}: {e}")
            time.sleep(3 + 4 * i)
    return None


def get_json(url, **kw):
    r = http("GET", url, **kw)
    if r is None or r.status_code != 200:
        log(f"  no JSON from {url[:120]} ({getattr(r, 'status_code', 'error')})")
        return None
    try:
        return r.json()
    except ValueError:
        return None


_fake_n = 0


def fetch_image(url):
    """Download a picture and open it, or None."""
    global _fake_n
    if not url:
        return None
    if DRY:
        _fake_n += 1
        w, h = [(1600, 866), (1900, 400), (460, 650), (4000, 900)][_fake_n % 4]
        im = Image.new("RGB", (w, h), ((_fake_n * 47) % 255, (_fake_n * 91) % 255, 120))
        ImageDraw.Draw(im).text((20, 20), url[-40:], fill="white", font=font(max(24, h // 12)))
        return im
    r = http("GET", url)
    if r is None or r.status_code != 200 or not r.content:
        log(f"  image failed {url[:120]} ({getattr(r, 'status_code', 'error')})")
        return None
    try:
        im = Image.open(io.BytesIO(r.content))
        im.load()
        return im
    except Exception as e:
        log(f"  not an image {url[:120]}: {e}")
        return None


# ---------------------------------------------------------------- drawing

_fonts = {}


def font(size):
    if size not in _fonts:
        try:
            _fonts[size] = ImageFont.load_default(size=size)
        except TypeError:  # old Pillow
            _fonts[size] = ImageFont.load_default()
    return _fonts[size]


def rgb(im):
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (20, 20, 24))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def fit(im, w, h):
    im = rgb(im)
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def label(draw, xy, text, size=18, fill=(255, 255, 255), bg=(0, 0, 0)):
    f = font(size)
    x, y = xy
    l, t, r, b = draw.textbbox((x, y), text, font=f)
    draw.rectangle([l - 4, t - 3, r + 4, b + 3], fill=bg)
    draw.text((x, y), text, font=f, fill=fill)


def grid_sheet(cells, cols, cw, ch, title, path):
    """cells: list of (code, image or None, caption)."""
    rows = (len(cells) + cols - 1) // cols
    cap_h = 26
    W, H = cols * (cw + 8) + 8, 50 + rows * (ch + cap_h + 8)
    sheet = Image.new("RGB", (W, H), (34, 34, 40))
    d = ImageDraw.Draw(sheet)
    d.text((10, 12), title, font=font(24), fill=(255, 230, 160))
    for i, (code, im, cap) in enumerate(cells):
        x = 8 + (i % cols) * (cw + 8)
        y = 50 + (i // cols) * (ch + cap_h + 8)
        d.rectangle([x, y, x + cw, y + ch], fill=(18, 18, 22))
        if im is not None:
            t = fit(im, cw, ch)
            sheet.paste(t, (x + (cw - t.width) // 2, y + (ch - t.height) // 2))
        else:
            d.text((x + 10, y + ch // 2), "—", font=font(20), fill=(120, 120, 120))
        label(d, (x + 6, y + 6), code, 20, (255, 255, 0))
        if cap:
            d.text((x + 2, y + ch + 3), cap[:int(cw / 9)], font=font(16), fill=(220, 220, 220))
    sheet.save(path, quality=72, optimize=True)
    log(f"  sheet {path.name} {W}x{H}")


# ---------------------------------------------------------------- Studio Ghibli

def ghibli_codes():
    """Every gallery code the works pages link to, e.g. {'chihiro': 50}."""
    found = {}
    r = http("GET", "https://www.ghibli.jp/works/")
    if r is None or r.status_code != 200:
        return found
    pages = sorted(set(re.findall(r'href="(?:https://www\.ghibli\.jp)?(/works/[a-z0-9_-]+/)"', r.text)))
    for p in pages:
        rr = http("GET", "https://www.ghibli.jp" + p)
        if rr is None or rr.status_code != 200:
            continue
        for code, n in re.findall(r'gallery/([a-z0-9_]+?)(\d{3})\.(?:jpg|png)', rr.text):
            found[code] = max(found.get(code, 0), int(n))
        time.sleep(0.3)
    log("ghibli codes:", json.dumps(found))
    return found


def run_ghibli(codes, out):
    known = {} if DRY else ghibli_codes()
    for code in codes:
        n = known.get(code, 0)
        if not n and not DRY:
            # not linked from the works pages: probe the gallery directly
            r = http("HEAD", f"https://www.ghibli.jp/gallery/thumb-{code}001.png")
            n = 50 if r is not None and r.status_code == 200 else 0
        if DRY:
            n = 50
        log(f"ghibli {code}: {n} pictures")
        out["ghibli"][code] = {"count": n, "full": f"https://www.ghibli.jp/gallery/{code}NNN.jpg"}
        if not n:
            continue
        cells = []
        for i in range(1, n + 1):
            im = fetch_image(f"https://www.ghibli.jp/gallery/thumb-{code}{i:03d}.png")
            cells.append((f"{code}{i:03d}", im, ""))
        for part, start in enumerate(range(0, len(cells), 25)):
            grid_sheet(cells[start:start + 25], 5, 360, 200, f"Studio Ghibli gallery: {code} ({start + 1}–{start + len(cells[start:start + 25])})",
                       CAND / f"ghibli-{code}-{part + 1}.jpg")


# ---------------------------------------------------------------- Wikimedia Commons

def commons_search(q, limit=12):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
           f"&gsrsearch={quote(q)}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo"
           "&iiprop=url|size|mime|extmetadata&iiurlwidth=480"
           "&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|DateTimeOriginal")
    data = get_json(url)
    if DRY:
        return [{"title": f"File:{q} {i}.jpg", "url": f"https://x/{q}{i}", "thumb": f"https://x/{q}{i}", "w": 4000, "h": 900,
                 "license": "Public domain", "index": i} for i in range(6)]
    pages = sorted((data or {}).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    res = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("mime", "").startswith("image/") or ii.get("mime") == "image/svg+xml":
            continue
        meta = ii.get("extmetadata", {})
        res.append({"title": p["title"], "url": ii.get("url"), "thumb": ii.get("thumburl"), "w": ii.get("width"),
                    "h": ii.get("height"), "page": ii.get("descriptionurl"),
                    "license": re.sub("<[^>]+>", "", meta.get("LicenseShortName", {}).get("value", "")),
                    "artist": re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", ""))[:120],
                    "date": re.sub("<[^>]+>", "", meta.get("DateTimeOriginal", {}).get("value", ""))[:60]})
    return res


def run_commons(items, out):
    for it in items:
        seen, res = set(), []
        for q in it["q"]:
            for r in commons_search(q):
                if r["title"] not in seen:
                    seen.add(r["title"])
                    res.append(r)
            time.sleep(0.5)
        res = res[:20]
        for i, r in enumerate(res):
            r["code"] = f"C{i + 1}"
        out["commons"][it["key"]] = {"slugs": it["slugs"], "results": res}
        log(f"commons {it['key']}: {len(res)} files")
        cells = [(r["code"], fetch_image(r["thumb"]), f"{r['w']}x{r['h']} {r['license'][:18]}") for r in res]
        if cells:
            grid_sheet(cells, 4, 420, 260, f"Commons: {it['key']}  ({', '.join(it['slugs'])})", CAND / f"commons-{it['key']}.jpg")


# ---------------------------------------------------------------- AniList, Kitsu, Wikipedia

AL_Q = """query ($q: String) { Page(perPage: 8) { media(search: $q, type: ANIME) {
  id idMal title { romaji english native } startDate { year } format episodes
  bannerImage coverImage { extraLarge } siteUrl } } }"""


def score(year, fmt, want_year, want_fmt, rank):
    s = -rank * 0.5
    if want_year and year:
        s += 4 if year == want_year else 2 if abs(year - want_year) == 1 else -3
    if want_fmt and fmt:
        s += 2 if fmt.upper() == want_fmt.upper() else 0
    return s


def anilist(w):
    if DRY:
        return [{"id": 1, "title": w["q"], "year": w["year"], "format": w["format"], "banner": "b", "cover": "c"}]
    r = http("POST", "https://graphql.anilist.co", json={"query": AL_Q, "variables": {"q": w["q"]}},
             headers={"Content-Type": "application/json", "Accept": "application/json"})
    time.sleep(2.2)  # AniList allows about 30 requests a minute
    if r is None or r.status_code != 200:
        log(f"  anilist failed for {w['q']} ({getattr(r, 'status_code', 'error')})")
        return []
    media = (r.json().get("data") or {}).get("Page", {}).get("media", []) or []
    res = []
    for i, m in enumerate(media):
        t = m.get("title") or {}
        res.append({"id": m["id"], "mal": m.get("idMal"), "title": t.get("english") or t.get("romaji"),
                    "romaji": t.get("romaji"), "year": (m.get("startDate") or {}).get("year"),
                    "format": m.get("format"), "banner": m.get("bannerImage"),
                    "cover": (m.get("coverImage") or {}).get("extraLarge"), "url": m.get("siteUrl"),
                    "score": score((m.get("startDate") or {}).get("year"), m.get("format"), w["year"], w["format"], i)})
    return sorted(res, key=lambda x: -x["score"])


KITSU_FMT = {"movie": "MOVIE", "TV": "TV", "OVA": "OVA", "ONA": "ONA", "special": "SPECIAL", "music": "MUSIC"}


def kitsu(w):
    if DRY:
        return [{"id": "1", "title": w["q"], "year": w["year"], "format": w["format"], "cover": "kc", "poster": "kp"}]
    data = None
    for base in ("https://kitsu.app/api/edge", "https://kitsu.io/api/edge"):
        data = get_json(f"{base}/anime?filter%5Btext%5D={quote(w['q'])}&page%5Blimit%5D=8",
                        headers={"Accept": "application/vnd.api+json"})
        if data:
            break
    time.sleep(0.4)
    res = []
    for i, d in enumerate((data or {}).get("data", [])):
        a = d.get("attributes", {})
        y = int(a["startDate"][:4]) if a.get("startDate") else None
        fmt = KITSU_FMT.get(a.get("subtype") or a.get("showType") or "", None)
        res.append({"id": d.get("id"), "title": a.get("canonicalTitle"), "year": y, "format": fmt,
                    "cover": ((a.get("coverImage") or {}).get("original")),
                    "poster": ((a.get("posterImage") or {}).get("original") or (a.get("posterImage") or {}).get("large")),
                    "score": score(y, fmt, w["year"], w["format"], i)})
    return sorted(res, key=lambda x: -x["score"])


SKIP_FILE = re.compile(r"\.(svg|ogg|ogv|oga|webm|mid|wav|mp3|flac|pdf|tif?f|gif)$|logo|icon|signature|flag_of|symbol|"
                       r"wikiquote|wiktionary|commons-|portal|edit-clear|question_book|crystal_|nuvola|disambig|"
                       r"padlock|ambox|text_document|people_icon|folder|increase|decrease|steady|star_full|star_empty",
                       re.I)


def wikipedia(w):
    if DRY:
        return [{"file": "File:a.jpg", "url": "u", "thumb": "t", "w": 1280, "h": 720, "article": w["wp"]}]
    s = get_json("https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=1"
                 f"&srsearch={quote(w['wp'])}")
    hits = (s or {}).get("query", {}).get("search", [])
    if not hits:
        return []
    title = hits[0]["title"]
    im = get_json("https://en.wikipedia.org/w/api.php?action=query&format=json&prop=images&imlimit=80"
                  f"&titles={quote(title)}")
    files = []
    for p in (im or {}).get("query", {}).get("pages", {}).values():
        files += [x["title"] for x in p.get("images", []) if not SKIP_FILE.search(x["title"])]
    files = files[:24]
    if not files:
        return []
    info = get_json("https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo"
                    "&iiprop=url|size|mime&iiurlwidth=480&titles=" + quote("|".join(files)))
    res = []
    for p in (info or {}).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("url") or not ii.get("mime", "").startswith("image/"):
            continue
        if (ii.get("width") or 0) < 300:
            continue
        res.append({"file": p["title"], "url": ii["url"], "thumb": ii.get("thumburl") or ii["url"], "w": ii.get("width"),
                    "h": ii.get("height"), "page": ii.get("descriptionurl"), "article": title})
    time.sleep(0.3)
    return res[:8]


def run_anime(works, out):
    rows = []
    for n, w in enumerate(works):
        log(f"anime {n + 1}/{len(works)}: {w['q']} ({w['year']}, {w['format']}) -> {', '.join(w['slugs'])}")
        try:
            al, ki, wp = anilist(w), kitsu(w), wikipedia(w)
        except Exception:
            log(traceback.format_exc())
            al, ki, wp = [], [], []
        rec = {"slugs": w["slugs"], "q": w["q"], "year": w["year"], "format": w["format"],
               "anilist": al[:3], "kitsu": ki[:3], "wikipedia": wp}
        out["anime"][w["key"]] = rec
        rows.append(rec)
    # contact sheets: AniList and Kitsu, five works to a sheet
    for s in range(0, len(rows), 5):
        anime_sheet(rows[s:s + 5], CAND / f"anime-{s // 5 + 1:02d}.jpg")
    # the Wikipedia article pictures, four works to a sheet
    wrows = [r for r in rows if r["wikipedia"]]
    for s in range(0, len(wrows), 4):
        wiki_sheet(wrows[s:s + 4], CAND / f"wiki-{s // 4 + 1:02d}.jpg")


def anime_sheet(rows, path):
    H, LW = 190, 330
    W = LW + 760 + 140 + 600 + 140 + 50
    sheet = Image.new("RGB", (W, 40 + len(rows) * (H + 16)), (34, 34, 40))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), path.stem + "   A-B AniList banner · A-C AniList cover · K-B Kitsu cover · K-P Kitsu poster",
           font=font(20), fill=(255, 230, 160))
    for i, r in enumerate(rows):
        y = 40 + i * (H + 16)
        al = r["anilist"][0] if r["anilist"] else {}
        ki = r["kitsu"][0] if r["kitsu"] else {}
        lines = [", ".join(r["slugs"]), f"want: {r['q']} {r['year']} {r['format'] or ''}",
                 f"AL: {al.get('title', '—')} {al.get('year', '')} {al.get('format', '')}",
                 f"K: {ki.get('title', '—')} {ki.get('year', '')} {ki.get('format', '')}"]
        for j, t in enumerate(lines):
            d.text((8, y + 6 + j * 24), t[:34], font=font(17 if j else 19), fill=(255, 255, 255) if j else (255, 255, 0))
        x = LW
        for code, url, bw in (("A-B", al.get("banner"), 760), ("A-C", al.get("cover"), 140),
                              ("K-B", ki.get("cover"), 600), ("K-P", ki.get("poster"), 140)):
            d.rectangle([x, y, x + bw - 8, y + H], fill=(18, 18, 22))
            im = fetch_image(url) if url else None
            if im is not None:
                t = fit(im, bw - 8, H)
                sheet.paste(t, (x + (bw - 8 - t.width) // 2, y + (H - t.height) // 2))
                label(d, (x + 4, y + 4), f"{code} {im.width}x{im.height}", 16, (255, 255, 0))
            else:
                label(d, (x + 4, y + 4), f"{code} none", 16, (160, 160, 160))
            x += bw
    sheet.save(path, quality=72, optimize=True)
    log(f"  sheet {path.name}")


def wiki_sheet(rows, path):
    cw, ch, LW = 300, 180, 300
    W = LW + 6 * (cw + 8)
    rows_h = []
    for r in rows:
        rows_h.append(((len(r["wikipedia"]) + 5) // 6) * (ch + 34))
    sheet = Image.new("RGB", (W, 40 + sum(rows_h) + 16 * len(rows)), (34, 34, 40))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), path.stem + "   W# = picture used in the English Wikipedia article", font=font(20), fill=(255, 230, 160))
    y = 40
    for r, rh in zip(rows, rows_h):
        d.text((8, y + 6), ", ".join(r["slugs"])[:30], font=font(19), fill=(255, 255, 0))
        d.text((8, y + 32), (r["wikipedia"][0]["article"] if r["wikipedia"] else "")[:30], font=font(16), fill=(220, 220, 220))
        for j, wp in enumerate(r["wikipedia"]):
            wp["code"] = f"W{j + 1}"
            x = LW + (j % 6) * (cw + 8)
            yy = y + (j // 6) * (ch + 34)
            d.rectangle([x, yy, x + cw, yy + ch], fill=(18, 18, 22))
            im = fetch_image(wp["thumb"])
            if im is not None:
                t = fit(im, cw, ch)
                sheet.paste(t, (x + (cw - t.width) // 2, yy + (ch - t.height) // 2))
            label(d, (x + 4, yy + 4), wp["code"], 16, (255, 255, 0))
            d.text((x, yy + ch + 4), f"{wp['w']}x{wp['h']} {wp['file'][5:30]}", font=font(14), fill=(220, 220, 220))
        y += rh + 16
    sheet.save(path, quality=72, optimize=True)
    log(f"  sheet {path.name}")


# ---------------------------------------------------------------- more candidates for particular shots

def commons_category(cat, limit=30):
    data = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers"
                    f"&gcmtitle={quote('Category:' + cat)}&gcmtype=file&gcmlimit={limit}&prop=imageinfo"
                    "&iiprop=url|size|mime|extmetadata&iiurlwidth=480&iiextmetadatafilter=LicenseShortName")
    res = []
    for p in (data or {}).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii.get("mime", "").startswith("image/") or ii.get("mime") == "image/svg+xml":
            continue
        lic = re.sub("<[^>]+>", "", ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", ""))
        res.append({"commons": p["title"], "thumb": ii.get("thumburl"), "w": ii.get("width"), "h": ii.get("height"),
                    "page": ii.get("descriptionurl"), "license": lic})
    return res


def wiki_page_images(lang, title):
    """Pictures on one Wikipedia page, in any language."""
    api = f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json"
    im = get_json(api + f"&prop=images&imlimit=60&redirects=1&titles={quote(title)}")
    files = []
    for p in (im or {}).get("query", {}).get("pages", {}).values():
        files += [x["title"] for x in p.get("images", []) if not SKIP_FILE.search(x["title"])]
    res = []
    for i in range(0, len(files[:40]), 20):
        info = get_json(api + "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=480&titles=" + quote("|".join(files[i:i + 20])))
        for p in (info or {}).get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            if ii.get("url") and ii.get("mime", "").startswith("image/") and (ii.get("width") or 0) >= 250:
                res.append({"wikifile": p["title"], "wikilang": lang, "thumb": ii.get("thumburl") or ii["url"],
                            "w": ii.get("width"), "h": ii.get("height"), "page": ii.get("descriptionurl")})
    return res


def tmdb_id(enwiki_title):
    """TMDB id of an English Wikipedia article's subject (title or search words), via its Wikidata item."""
    api = "https://en.wikipedia.org/w/api.php?action=query&format=json"
    qid = None
    for _ in range(2):
        d = get_json(api + f"&redirects=1&prop=pageprops&ppprop=wikibase_item&titles={quote(enwiki_title)}")
        for p in (d or {}).get("query", {}).get("pages", {}).values():
            qid = qid or p.get("pageprops", {}).get("wikibase_item")
        if qid:
            break
        s = get_json(api + f"&list=search&srlimit=1&srsearch={quote(enwiki_title)}")
        hits = (s or {}).get("query", {}).get("search", [])
        if not hits:
            break
        enwiki_title = hits[0]["title"]
    if not qid:
        return None, None
    data = get_json(f"https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids={qid}")
    for ent in (data or {}).get("entities", {}).values():
        claims = ent.get("claims", {})
        for prop, kind in (("P4947", "movie"), ("P4983", "tv")):
            for c in claims.get(prop, []):
                v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                if v:
                    return kind, str(v)
    return None, None


TMDB_HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.8"}


def tmdb_search(kind, query):
    """TMDB id of the first result on TMDB's own search page, for works Wikidata cannot place."""
    r = http("GET", f"https://www.themoviedb.org/search/{kind}?query={quote(query)}", headers=TMDB_HEADERS)
    if r is None or r.status_code != 200:
        log(f"  TMDB search {kind} {query!r}: {getattr(r, 'status_code', 'error')}")
        return None
    m = re.search(rf'href="/{kind}/(\d+)', r.text)
    return m.group(1) if m else None


def tmdb_stills(ref, limit=24):
    """Backdrops (mostly stills) listed on a work's TMDB images page. `ref` is an English Wikipedia
    title, found through Wikidata, or {"kind": "movie" or "tv", "q": search words} or {"kind", "id"}."""
    if isinstance(ref, dict):
        kind, tid = ref["kind"], ref.get("id") or tmdb_search(ref["kind"], ref["q"])
    else:
        kind, tid = tmdb_id(ref)
    if not tid:
        log(f"  no TMDB id for {ref}")
        return []
    log(f"  TMDB {kind}/{tid} for {ref}")
    seen, res = set(), []
    for q in ("", "?image_language=xx", "?image_language=ja", "?image_language=en"):
        r = http("GET", f"https://www.themoviedb.org/{kind}/{tid}/images/backdrops{q}", headers=TMDB_HEADERS)
        if r is None or r.status_code != 200:
            log(f"  TMDB {kind}/{tid}{q}: {getattr(r, 'status_code', 'error')}")
            continue
        for f in re.findall(r'/t/p/[a-z0-9_]+/([A-Za-z0-9]{20,40}\.(?:jpg|png))', r.text):
            if f not in seen:
                seen.add(f)
                res.append({"url": f"https://image.tmdb.org/t/p/w1280/{f}", "thumb": f"https://image.tmdb.org/t/p/w300/{f}",
                            "page": f"https://www.themoviedb.org/{kind}/{tid}/images/backdrops"})
        time.sleep(0.5)
    return res[:limit]


def anilist_by_id(mid):
    r = http("POST", "https://graphql.anilist.co", headers={"Content-Type": "application/json", "Accept": "application/json"},
             json={"query": "query($id:Int){Media(id:$id){id title{romaji} bannerImage coverImage{extraLarge} siteUrl}}",
                   "variables": {"id": mid}})
    time.sleep(2.2)
    m = ((r.json() if r is not None and r.status_code == 200 else {}).get("data") or {}).get("Media") or {}
    out = []
    if m.get("bannerImage"):
        out.append({"url": m["bannerImage"], "thumb": m["bannerImage"], "page": m.get("siteUrl"), "note": "AniList banner"})
    if (m.get("coverImage") or {}).get("extraLarge"):
        out.append({"url": m["coverImage"]["extraLarge"], "thumb": m["coverImage"]["extraLarge"], "page": m.get("siteUrl"),
                    "note": "AniList cover"})
    return out


def kitsu_by_id(kid):
    d = get_json(f"https://kitsu.app/api/edge/anime/{kid}", headers={"Accept": "application/vnd.api+json"}) or {}
    a = (d.get("data") or {}).get("attributes", {})
    out = []
    for key, note in (("coverImage", "Kitsu cover"), ("posterImage", "Kitsu poster")):
        u = (a.get(key) or {}).get("original")
        if u:
            out.append({"url": u, "thumb": u, "page": f"https://kitsu.app/anime/{kid}", "note": note})
    return out


def run_extra(items, out):
    for it in items:
        key = it["key"]
        log(f"extra {key}")
        found = []
        try:
            for q in it.get("commons", []):
                for r in commons_search(q, 10):
                    found.append({"commons": r["title"], "thumb": r["thumb"], "w": r["w"], "h": r["h"], "page": r.get("page"),
                                  "license": r["license"]})
                time.sleep(0.4)
            for cat in it.get("commons_cat", []):
                found += commons_category(cat)
            for lang, title in it.get("wiki", []):
                found += wiki_page_images(lang, title)
            for t in it.get("tmdb", []):
                found += tmdb_stills(t)
            for mid in it.get("anilist", []):
                found += anilist_by_id(mid)
            for kid in it.get("kitsu", []):
                found += kitsu_by_id(kid)
        except Exception:
            log(traceback.format_exc())
        seen, cands = set(), []
        for f in found:
            ident = f.get("commons") or f.get("wikifile") or f.get("url")
            if ident and ident not in seen:
                seen.add(ident)
                cands.append(f)
        cands = cands[:32]
        cells = []
        for i, f in enumerate(cands):
            f["code"] = f"X{i + 1}"
            im = fetch_image(f["thumb"])
            if im is not None and not f.get("w"):
                f["w"], f["h"] = im.size  # thumbnail size only; the full picture is larger
            src = "Commons " + f.get("license", "")[:14] if f.get("commons") else \
                f"{f.get('wikilang', '')}.wikipedia" if f.get("wikifile") else f.get("note") or "TMDB still"
            cells.append((f["code"], im, f"{f.get('w') or '?'}x{f.get('h') or '?'} {src}"))
        out["extra"][key] = {"slugs": it["slugs"], "candidates": cands}
        if cells:
            grid_sheet(cells, 4, 420, 240, f"Extra: {key} ({', '.join(it['slugs'])})", CAND / f"extra-{key}.jpg")


# ---------------------------------------------------------------- final pictures

def commons_thumb(title, width):
    data = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
                    f"&iiprop=url|size&iiurlwidth={width}&titles={quote(title)}")
    for p in (data or {}).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        return ii.get("thumburl") or ii.get("url"), ii.get("descriptionurl")
    return None, None


def commons_meta(title):
    """Author, licence and description of a Commons file, for its credit line."""
    data = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata"
                    f"&titles={quote(title)}")
    for p in (data or {}).get("query", {}).get("pages", {}).values():
        meta = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})
        pick = lambda k: re.sub(r"\s+", " ", re.sub("<[^>]+>", "", meta.get(k, {}).get("value", ""))).strip()[:300]
        return {"artist": pick("Artist"), "license": pick("LicenseShortName"), "license_url": pick("LicenseUrl"),
                "description": pick("ImageDescription"), "date": pick("DateTimeOriginal"), "credit": pick("Credit")}
    return {}


def wiki_thumb(title, width, lang="en"):
    data = get_json(f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo"
                    f"&iiprop=url|size&iiurlwidth={width}&titles={quote(title)}")
    for p in (data or {}).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        return ii.get("thumburl") or ii.get("url"), ii.get("descriptionurl")
    return None, None


def run_final(picks):
    IMG.mkdir(exist_ok=True)
    sourced = {r["slug"]: r for r in json.loads(SOURCED.read_text())} if SOURCED.exists() else {}
    for p in picks:
        slug = p["slug"]
        try:
            url, page = p.get("url"), p.get("page")
            if p.get("commons"):
                url, page = commons_thumb(p["commons"], p.get("width", 1920))
            elif p.get("wikifile"):
                url, page = wiki_thumb(p["wikifile"], p.get("width", 1280), p.get("wikilang", "en"))
            im = fetch_image(url)
            if im is None:
                log(f"FAILED {slug}: {url}")
                continue
            im = rgb(ImageOps.exif_transpose(im))
            if p.get("crop"):
                x0, y0, x1, y1 = p["crop"]
                im = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
            r = im.width / im.height
            kind = p.get("kind", "still")
            longest = 2400 if r > 2.1 else 1100 if r < 0.9 else 1600
            if max(im.size) > longest:
                im.thumbnail((longest, longest), Image.LANCZOS)
            q = {"banner": 76, "poster": 80}.get(kind, 72)
            out = IMG / f"{slug}.webp"
            im.save(out, "WEBP", quality=q, method=6)
            while out.stat().st_size > 360_000 and q > 50:
                q -= 8
                im.save(out, "WEBP", quality=q, method=6)
            rec = {"slug": slug, "file": out.name, "width": im.width, "height": im.height, "kind": kind,
                   "source_url": page or url, "credit": p.get("credit", ""), "shows": p.get("shows", "")}
            if p.get("commons"):
                rec["commons"] = commons_meta(p["commons"])
            if p.get("cap"):
                rec["cap"] = p["cap"]
            sourced[slug] = rec
            log(f"ok {slug}: {im.width}x{im.height} {out.stat().st_size // 1024} KB")
        except Exception:
            log(f"FAILED {slug}:\n{traceback.format_exc()}")
    SOURCED.write_text(json.dumps(sorted(sourced.values(), key=lambda r: r["slug"]), ensure_ascii=False, indent=1) + "\n")


# ---------------------------------------------------------------- source links

BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def run_links(job):
    """Checks each link on the sources page: does it load, what is the page called, and does
    its text contain the words the citation relies on ("expect", matched by URL fragment)."""
    import html as htmllib
    urls = job.get("urls") or list(dict.fromkeys(re.findall(r'href="(https?://[^"]+)"', (ANIME / job["file"]).read_text())))
    rows = []
    for u in urls:
        rec = {"url": u}
        r = http("GET", u, timeout=30)
        if r is not None and r.status_code in (401, 403, 406, 429, 503):
            rec["first_status"] = r.status_code  # many news sites turn away scripts; ask again as a browser would
            r = http("GET", u, timeout=30, headers={"User-Agent": BROWSER_UA, "Accept": "text/html,*/*",
                                                     "Accept-Language": "en,ja;q=0.8"})
        if r is None:
            rec["status"] = "error"
        else:
            rec["status"] = r.status_code
            if r.url.rstrip("/") != u.rstrip("/"):
                rec["final"] = r.url
            r.encoding = r.encoding if r.encoding and r.encoding.lower() != "iso-8859-1" else r.apparent_encoding
            text = r.text
            m = re.search(r"<title[^>]*>(.*?)</title>", text, re.S | re.I)
            rec["title"] = htmllib.unescape(re.sub(r"\s+", " ", m.group(1))).strip()[:150] if m else ""
            body = htmllib.unescape(re.sub(r"<[^>]+>", " ", text)).lower()
            for frag, words in job.get("expect", {}).items():
                if frag in u:
                    rec["missing"] = [w for w in words if w.lower() not in body]
        log(json.dumps(rec, ensure_ascii=False))
        rows.append(rec)
        time.sleep(1)
    (HERE / "links-report.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n")


# ---------------------------------------------------------------- main

def main():
    job = json.loads(Path(sys.argv[1]).read_text())
    if job["mode"] == "links":
        run_links(job)
        (HERE / "final-log.txt").write_text("\n".join(LOG) + "\n")
    elif job["mode"] == "candidates":
        CAND.mkdir(parents=True, exist_ok=True)
        out = {"ghibli": {}, "commons": {}, "anime": {}}
        for part, fn in (("ghibli", run_ghibli), ("commons", run_commons), ("anime", run_anime)):
            if job.get(part):
                try:
                    fn(job[part], out)
                except Exception:
                    log(f"{part} failed:\n{traceback.format_exc()}")
                (CAND / "candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        (CAND / "log.txt").write_text("\n".join(LOG) + "\n")
    else:  # "final": fetch the chosen pictures, and optionally gather extra candidates for shots still open
        if job.get("picks"):
            run_final(job["picks"])
        if job.get("extra"):
            CAND.mkdir(parents=True, exist_ok=True)
            p = CAND / "candidates.json"
            out = json.loads(p.read_text()) if p.exists() else {}
            out["extra"] = {}
            run_extra(job["extra"], out)
            p.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
        (HERE / "final-log.txt").write_text("\n".join(LOG) + "\n")


if __name__ == "__main__":
    main()
