# Drawn to Move — a history of anime

A long-form, illustrated history of Japanese animation from the picture scrolls of
the twelfth century and a stencilled filmstrip of about 1907 to the global box
office of 2025–26. Published at `/anime/` on this site.

Ten reels (eras), each with the same four parts — context, the artists' intent,
interiority (how the work felt), and ripples (impact in Japan, abroad and on one
life) — plus featured works laid out as storyboard “cuts”, film strips, and
interludes: the Frame Lab (ones, twos and threes), the grammar of anime (sliding
cel layers, the Itano Circus, techniques and motifs), a world map of anime's
impact, the numbers, the makers, myths and facts, a viewing guide, a quiz and a
glossary.

## Build

```sh
python3 anime/build.py
```

Python 3 only; Pillow is optional (it adds width/height to images). The build
joins `src/parts/*.html` in name order, expands the macros described at the top
of `build.py`, renders the map, charts, viewing guide and glossary from
`src/data/`, and writes `index.html` and `assets/`.

`python3 anime/build.py --artifact OUTDIR` also writes a body-only page for
publishing as a claude.ai artifact.

## Images

Pictures live in `img/` as `<slug>.webp` (or `.jpg`/`.png`). Every picture in the
page names its slug in an `<x-shot>`, `<x-still>` or `<x-frame>` macro. When a file
is missing the build substitutes a designed placeholder and lists the missing
slugs in `src/images-missing.txt`, so the page is always complete.

Pre-1917 works are public domain. Studio Ghibli publishes stills for free use
“within the bounds of common sense”. All other stills are © their rights holders,
credited where they appear, and reproduced at reduced size for criticism,
commentary and education.

## Map

`src/data/geo.json` is generated from `src/data/map.json` by `tools/geo.mjs`
(d3-geo, topojson-client and world-atlas from npm; see the comment at the top of
the script). The projection is Natural Earth, centred on 150°E.

## Fonts and credits

Shippori Mincho B1, Literata and Zen Kaku Gothic New from Google Fonts. The
brushed 動 in the opening titles is the glyph from Yuji Boku (SIL Open Font
License), converted to an SVG path and revealed in stroke order.

Facts, dates, figures and quotations were checked against the sources listed at
the end of the page, as of October 2026.
