#!/usr/bin/env python3
"""Build the main site (repo root index.html + assets/) from reckoning/src.

Footnotes are written in the source as {{fn:key}} or {{fn:a,b}} and numbered
in order of first citation. Every figure's data table is generated from the
JSON block inside it, so the chart and its table cannot drift apart.

    python3 reckoning/build.py            # from the repo root
"""
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reckoning" / "src"
OUT_ASSETS = ROOT / "assets"
SITE_URL = "https://raycoding1-collab.github.io/ai-race-reckoning"
ESBUILD = ROOT / "accelerator-anatomy" / "node_modules" / ".bin" / "esbuild"
FONT_DIR = ROOT / "reckoning" / "fonts"

FONTS = {
    "newsreader": "newsreader-latin-opsz-normal.woff2",
    "newsreader-italic": "newsreader-latin-opsz-italic.woff2",
    "archivo": "archivo-latin-wdth-normal.woff2",
    "plexmono": "ibm-plex-mono-latin-400-normal.woff2",
}

WPM = 230


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:10]


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def render_source(n: int, s: dict) -> str:
    org = esc(s["org"])
    if "t" in s:
        label = f"“{esc(s['t'])}”"
    else:
        label = esc(s["d"])
    d = re.sub(r"^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$", r"\2 \1, \3", s.get("date", ""))
    date = f' <span class="src-date">{esc(d)}</span>' if d else ""
    if s.get("url"):
        body = f'<a href="{esc(s["url"])}" rel="noopener" target="_blank">{label}</a>'
    else:
        body = f"<span>{label}</span>"
    return f'<li id="s{n}"><span class="src-org">{org}</span> {body}{date}</li>'


def table_html(t: dict) -> str:
    head = "".join(f'<th scope="col">{esc(c)}</th>' for c in t["cols"])
    rows = []
    for r in t["rows"]:
        cells = [f'<th scope="row">{esc(r[0])}</th>'] + [f"<td>{esc(c)}</td>" for c in r[1:]]
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return (
        '<details class="viz-table"><summary>Data</summary>'
        f'<table><thead><tr>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></details>'
    )


def words(fragment: str) -> int:
    text = re.sub(r"<script.*?</script>", " ", fragment, flags=re.S)
    text = re.sub(r"<details.*?</details>", " ", text, flags=re.S)
    text = re.sub(r"<sup class=\"fn\">.*?</sup>", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return len(re.findall(r"[\w'’$%.,-]+", html.unescape(text)))


def minutes(n_words: int) -> int:
    return max(1, round(n_words / WPM))


def main() -> None:
    sources = json.loads((SRC / "sources.json").read_text())
    page = "".join(p.read_text() for p in sorted((SRC / "parts").glob("*.html")))

    # Footnotes, numbered by first citation.
    order: list[str] = []

    def fn(match: re.Match) -> str:
        keys = [k.strip() for k in match.group(1).split(",")]
        links = []
        for k in keys:
            if k not in sources:
                raise SystemExit(f"unknown source key: {k}")
            if k not in order:
                order.append(k)
            n = order.index(k) + 1
            links.append(f'<a href="#s{n}" data-fn="{n}" aria-label="Source {n}">{n}</a>')
        return '<sup class="fn">' + '<span class="fn-sep">,</span>'.join(links) + "</sup>"

    page = re.sub(r"\{\{fn:([^}]+)\}\}", fn, page)
    unused = [k for k in sources if k not in order]
    if unused:
        print("note: sources never cited:", ", ".join(unused))
    source_list = '<ol class="source-list">' + "".join(
        render_source(i + 1, sources[k]) for i, k in enumerate(order)
    ) + "</ol>"
    page = page.replace("{{sources}}", source_list)

    # Data tables from each figure's JSON.
    def with_table(match: re.Match) -> str:
        block = match.group(0)
        data = json.loads(match.group(1))
        return block + (table_html(data["table"]) if "table" in data else "")

    page = re.sub(
        r'<script type="application/json" class="viz-data">(.*?)</script>', with_table, page, flags=re.S
    )

    # Reading times, per chapter and in total (body text only, not sources).
    body = page.split('<section class="endmatter"')[0]
    total_words = words(body.split('<main id="top">', 1)[1])
    for m in re.finditer(r'<section class="chapter[^"]*" id="([a-z]+)"(.*?)</section>', body, flags=re.S):
        cid, chunk = m.group(1), m.group(2)
        mins = f"{minutes(words(chunk))} min"
        page = page.replace(f'data-readtime="{cid}"></span>', f'data-readtime="{cid}">{mins}</span>')
        page = page.replace(f'data-toc-time="{cid}"></span>', f'data-toc-time="{cid}">{mins}</span>')
    page = page.replace("{{read_minutes}}", str(minutes(total_words)))
    page = page.replace("{{source_count}}", str(len(order)))
    page = page.replace("{{site_url}}", SITE_URL)

    # Assets.
    if OUT_ASSETS.exists():
        shutil.rmtree(OUT_ASSETS)
    (OUT_ASSETS / "fonts").mkdir(parents=True)

    used_chars = set(html.unescape(re.sub(r"<[^>]+>", " ", page)))
    used_chars |= set((SRC / "js").joinpath("charts.js").read_text())
    used_chars |= set(chr(c) for c in range(0x20, 0x7F))
    used_chars |= set("’‘“”–—…·×−≈→↗€£°½")
    text_file = ROOT / "reckoning" / ".subset-chars.txt"
    text_file.write_text("".join(sorted(ch for ch in used_chars if ch.isprintable())))

    font_paths = {}
    for key, name in FONTS.items():
        src = FONT_DIR / name
        tmp = ROOT / "reckoning" / f".{key}.woff2"
        subprocess.run(
            [
                "pyftsubset", str(src), f"--text-file={text_file}", "--flavor=woff2",
                "--layout-features=kern,liga,calt,lnum,pnum,tnum,onum,case,ss01,frac,sups",
                "--no-hinting", "--desubroutinize", f"--output-file={tmp}",
            ],
            check=True,
        )
        data = tmp.read_bytes()
        tmp.unlink()
        out = f"{key}.{digest(data)}.woff2"
        (OUT_ASSETS / "fonts" / out).write_bytes(data)
        font_paths[key] = out
    text_file.unlink()

    css = (SRC / "site.css").read_text()
    for key, out in font_paths.items():
        css = css.replace("{{font:%s}}" % key, f"fonts/{out}")
    css_min = subprocess.run(
        [str(ESBUILD), "--loader=css", "--minify"], input=css.encode(), capture_output=True, check=True
    ).stdout
    css_name = f"site.{digest(css_min)}.css"
    (OUT_ASSETS / css_name).write_bytes(css_min)

    js = subprocess.run(
        [str(ESBUILD), str(SRC / "js" / "main.js"), "--bundle", "--minify", "--format=esm",
         "--target=es2020", "--legal-comments=none"],
        capture_output=True, check=True,
    ).stdout
    js_name = f"site.{digest(js)}.js"
    (OUT_ASSETS / js_name).write_bytes(js)

    for key, out in font_paths.items():
        page = page.replace("{{font:%s}}" % key, f"assets/fonts/{out}")
    page = page.replace("{{css}}", f"assets/{css_name}").replace("{{js}}", f"assets/{js_name}")

    shutil.copy(SRC / "static" / "hero-poster.jpg", OUT_ASSETS / "hero-poster.jpg")
    for static in ("favicon.svg", "apple-touch-icon.png", "og.jpg"):
        shutil.copy(SRC / "static" / static, ROOT / static)

    leftover = re.findall(r"\{\{[^}]*\}\}", page)
    if leftover:
        raise SystemExit(f"unreplaced tokens: {sorted(set(leftover))}")

    (ROOT / "index.html").write_text(page)
    kb = lambda p: f"{p.stat().st_size / 1024:.0f} KB"
    print(f"index.html {kb(ROOT / 'index.html')}, {len(order)} sources, {minutes(total_words)} min read")
    for f in sorted(OUT_ASSETS.rglob("*")):
        if f.is_file():
            print(" ", f.relative_to(ROOT), kb(f))


if __name__ == "__main__":
    main()
