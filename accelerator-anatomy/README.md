# Accelerator Anatomy

A to-scale, real-time 3D model of an AI accelerator package, presented as a scrolling
story with an interactive viewer and a one-minute film.

## Develop

```sh
npm install
npm run build      # outputs dist/
npm run preview    # serves dist/ locally
```

`SITE_URL` sets the absolute URL used for the canonical link, social preview and
sitemap (for example `SITE_URL=https://example.com npm run build`). On Netlify the
deploy URL is picked up automatically.

## Structure

- `src/index.html`, `src/styles.css`: page and styles
- `src/main.js`: scene, procedural textures, scroll story, viewer and film
- `public/`: static files copied as-is (icons, manifest, preview image)
- `build.mjs`: bundles and minifies with esbuild, fingerprints assets, writes robots.txt and sitemap.xml
- `netlify.toml`: build settings and response headers

All textures are generated at runtime; the only runtime dependency is three.js, bundled into the build.
