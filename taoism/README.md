# The Way — source

The site at `tao/` (published at `/tao/`) is generated from this folder: a long
scroll about Taoism with eight ink paintings behind the text, each in a day and a
night version. Edit here, then rebuild.

## Build

Requirements: Python 3 with `numpy`, `scipy`, `pillow`, `fonttools`, `brotli` and
`skia-python` (`pip install numpy scipy pillow fonttools brotli skia-python`; on
Linux skia also needs `libegl1`), and Node for the fonts, stroke data and esbuild:

```sh
cd taoism && npm install && cd ..
```

The page:

```sh
python3 taoism/build.py              # writes tao/index.html, tao/assets/, tao/fonts/, icons
python3 taoism/build.py --artifact   # also writes a preview page to taoism/.cache/artifact/
```

The paintings, only when a scene changes (they are committed in `tao/img/`):

```sh
python3 taoism/art/render.py all --width 3840 --out taoism/.cache/art   # several minutes
python3 taoism/art/export.py                                            # tao/img/, tao/wallpapers/
python3 taoism/art/render.py hero --width 1920 --out /tmp/prev          # quick preview of one scene
```

## Layout

- `src/parts/*.html` — the page, one file per chapter, concatenated in name order.
- `src/sources.json` — every source, keyed by id. Cite with `{{fn:key}}` or
  `{{fn:a,b}}`; the build numbers citations in order of first appearance and writes
  the source list.
- `src/text/daodejing.zh.txt` — the received Wang Bi text in traditional
  characters, one `§N` section per chapter.
  `src/text/daodejing.en.txt` — the translation made for this site.
  `src/text/zhuangzi.txt` — the Zhuangzi stories and quotations, Chinese, then
  `---`, then English.
- Quotations in the page carry `data-q="ddj 16"` or `data-q="zz fish"`. The build
  checks each one against the Chinese text and the translation, and stops if a
  quotation does not match.
- `src/style.css`, `src/js/` — styles and scripts: `stage.js` switches the
  paintings as chapters scroll by, `write.js` writes the large characters stroke
  by stroke, `reader.js` is the Daodejing reader, `sound.js` the ambient sound,
  `ui.js` everything else. Bundled and minified by esbuild with content-hashed
  names.
- `art/ink.py` — the brush: bristle strokes, dry-brush streaks, washes, mist and
  paper bleed, painted as ink density on depth planes.
  `art/landscape.py` — motifs (peaks, pines, figures, boats, pavilions).
  `art/scenes.py` — the eight compositions, with their inscriptions and seals.
  `art/render.py` colors each painting in the day and night palettes, and
  `art/export.py` writes AVIF and WebP at 3840, 2560 and 1600 pixels wide, a
  portrait crop for phones, the depth layers of the opening painting and the
  4K wallpapers.

## Fonts and data

EB Garamond, Cormorant Garamond, LXGW WenKai TC, Noto Serif TC and Zhi Mang Xing
are under the SIL Open Font License. The Chinese font is subset at build time
into two files: one for the running text, the first reader chapter and the first
story, which loads with the page, and one for everything else, which loads only
when another reader chapter or story is opened.
Stroke data for the brush-written titles comes from Make Me a Hanzi through
`hanzi-writer-data`, under the Arphic Public License.
