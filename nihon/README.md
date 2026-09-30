# Where the Sun Rises — source

The site at `japan/` (published at `/japan/`) is generated from this folder: a
long scroll through the history of Japan, from the Jōmon potters to the present,
with twelve woodblock-style prints behind the text, each in a day and a night
impression. It ends with all one hundred poems of the Hyakunin Isshu, a karuta
game and a finder for Japan's era names. Edit here, then rebuild.

## Build

Requirements: Python 3 with `numpy`, `scipy`, `pillow`, `fonttools`, `brotli` and
`skia-python` (`pip install numpy scipy pillow fonttools brotli skia-python`; on
Linux skia also needs `libegl1`), and Node for the fonts and esbuild:

```sh
cd nihon && npm install && cd ..
```

The page:

```sh
python3 nihon/build.py              # writes japan/index.html, japan/assets/, japan/fonts/, icons
python3 nihon/build.py --artifact   # also writes a preview page to nihon/.cache/artifact/
```

The prints, only when a scene changes (they are committed in `japan/img/`):

```sh
python3 nihon/art/render.py all --width 3840 --out nihon/.cache/art   # about half an hour
python3 nihon/art/export.py                                           # japan/img/, japan/wallpapers/
python3 nihon/art/render.py sengo --width 1600 --out /tmp/prev        # quick preview of one scene
```

## Layout

- `src/parts/*.html` — the page, one file per chapter, concatenated in name order.
  Placeholders such as `{{kana}}`, `{{poems}}`, `{{karuta}}` and `{{sources}}` are
  filled in by the build.
- `src/sources.json` — every source, keyed by id. Cite with `{{fn:key}}` or
  `{{fn:a,b}}`; the build numbers citations in order of first appearance and writes
  the source list.
- Quotations carry a `data-q` attribute, and the build stops if one does not match:
  - `aozora:NAME` — the Japanese must occur in the Aozora Bunko text in
    `src/text/aozora/` (ruby, editorial notes and punctuation are ignored);
  - `hi:N` — the Japanese must be poem N of the Hyakunin Isshu;
  - `web:KEY` — a quotation that cannot be checked offline must cite source `KEY`.
- `src/text/data/` — the Hyakunin Isshu in three independent transcriptions, which
  the build compares poem by poem (corrections are listed in `HI_FIX` in
  `build.py`), and the era names from Harumi with readings from nengo-full.
  The deciding syllables (kimariji) used by the karuta game are computed from how
  each poem is read aloud, and checked against the published lists.
- `src/text/hyakunin.en.txt` — the translations of the hundred poems made for this
  site.
- `src/kanjivg/` — stroke data for the brush-written chapter titles.
- `src/style.css`, `src/js/` — styles and scripts: `stage.js` switches the prints
  as chapters scroll by, `write.js` writes the titles stroke by stroke,
  `anthology.js` is the poem reader, `karuta.js` the card game, `sound.js` the
  ambient sound (the sea and a koto in the in scale, synthesized), `ui.js`
  everything else, including the era finder. Bundled and minified by esbuild with
  content-hashed names.
- `art/hanga.py` — the press: each colour block multiplies into the paper, flat
  areas take the grain of the wood, pigment pools at the edges, graded wiping
  (bokashi) fades a colour out, and the blocks never quite register. A key block
  prints the black outlines.
  `art/motifs.py` — sky, sea, waves, mountains, Fuji, pines, mist, weather.
  `art/arch.py` — buildings and things: halls, pagodas, castles, ships, trains.
  `art/scenes.py` — the twelve compositions, with their title cartouches.
  `art/palette.py` — the day and night pigments.
  `art/render.py` prints each scene in both impressions, and `art/export.py`
  writes AVIF and WebP at 3840, 2560 and 1600 pixels wide, a portrait crop for
  phones, the depth layers of the opening print, the washi grain and the 4K
  wallpapers.

## Fonts and data

Literata, Bodoni Moda, Shippori Mincho and Yuji Syuku are under the SIL Open Font
License. The Japanese fonts are subset at build time to the characters the page
uses. Stroke order data: KanjiVG, copyright Ulrich Apel, under CC BY-SA 3.0.
Japanese texts are from Aozora Bunko (public domain). Hyakunin Isshu data:
`ogura-hyakunin-isshu` (Unlicense), `hyakunin-isshu` (MIT), `kimariji_karuta`
(ISC). Era names: Harumi by Code for History (MIT); readings from nengo-full (MIT).
