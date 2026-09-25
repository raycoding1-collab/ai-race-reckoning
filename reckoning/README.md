# The AI Race: A Reckoning — source

The site at the repository root (`index.html`, `assets/`, `og.jpg`, icons) is
generated from this folder. Edit here, then rebuild:

```sh
python3 reckoning/build.py
```

Requirements: Python 3 with `fonttools` and `brotli` (`pip install fonttools brotli`),
and the `esbuild` binary installed under `accelerator-anatomy/node_modules`
(`cd accelerator-anatomy && npm install`).

## Layout

- `src/parts/*.html` — the page, one file per chapter, concatenated in name order.
- `src/sources.json` — every source, keyed by id. In the text, cite with
  `{{fn:key}}` or `{{fn:key1,key2}}`; the build numbers citations in order of
  first appearance and writes the source list.
- Each figure carries its data in a `<script type="application/json" class="viz-data">`
  block. The chart is drawn from it, and the build generates the figure's
  "Data" table from its `table` entry, so the two cannot drift apart.
- `src/site.css`, `src/js/` — styles and scripts (`hero.js` is the WebGL night
  flight, `charts.js` the charts, `ui.js` the masthead, contents, footnotes and
  running totals). Bundled and minified by esbuild with content-hashed names.
- `fonts/` — Newsreader, Archivo and IBM Plex Mono (SIL Open Font License),
  subset at build time to the characters the page uses.
- `src/static/` — poster frame, social image and icons.

## Chart colors

Mark colors were checked with the dataviz palette validator against the page
background `#0e0e0d` (dark mode): accent `#d4782e` and cool `#4f86d6` pass every
categorical check; `#9a5a28`/`#d4782e` pass as an ordinal ramp; `#6b675f` is the
context gray.

## Poster frame

`hero-poster.jpg` is a still of the live scene. Open the page with
`?still=0&lights=0` to render the same frame, or `?still=24&lights=30` for the
fully lit landscape.
