// Bake lightmaps for every chamber (see js/bake.js). Serve the repo root first:
//   python3 -m http.server 8765        then:   node portal/tools/bake.mjs [port] [level ...]
// Writes portal/lightmaps/<hash>.png and portal/lightmaps/index.json.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.LM_OUT || path.join(here, '..', 'lightmaps');
const [port = '8765', ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log(m.text()));
await page.goto(`http://localhost:${port}/portal/index.html?desktop`);
const count = await page.evaluate(async () => (await import('./js/levels.js')).LEVELS.length);
const levels = only.length ? only.map(Number) : [...Array(count).keys()];
const hashes = [];
for (const i of levels) {
  const t0 = Date.now();
  const r = await page.evaluate(async (i) => {
    const { LEVELS } = await import('./js/levels.js');
    const B = await import('./js/bake.js');
    const L = LEVELS[i].build();
    const hash = B.levelHash(L.grid, L.lights || []);
    const res = B.bake(L.grid, L.lights || []);
    const enc = B.encode(res);
    const cv = document.createElement('canvas');
    cv.width = enc.width; cv.height = enc.height;
    cv.getContext('2d').putImageData(new ImageData(enc.pixels, enc.width, enc.height), 0, 0);
    const png = cv.toDataURL('image/png').split(',')[1];
    cv.getContext('2d').putImageData(new ImageData(enc.dirPixels, enc.width, enc.height), 0, 0);
    const dirPng = cv.toDataURL('image/png').split(',')[1];
    let s = 0, n = 0;
    for (let k = 0; k < res.lightmap.length; k += 3) if (res.lightmap[k] > 0) { s += res.lightmap[k + 1]; n++; }
    return { hash, png, dirPng, w: enc.width, h: enc.height, mean: s / Math.max(1, n) };
  }, i);
  fs.writeFileSync(path.join(out, r.hash + '.png'), Buffer.from(r.png, 'base64'));
  fs.writeFileSync(path.join(out, r.hash + '.dir.png'), Buffer.from(r.dirPng, 'base64'));
  hashes.push(r.hash);
  console.log(`level ${i}: ${r.hash} ${r.w}x${r.h} mean ${r.mean.toFixed(3)} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
// keep the index to the chambers as they are now
const all = only.length ? [...new Set([...(fs.existsSync(path.join(out, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'index.json'))) : []), ...hashes])] : hashes;
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(all));
if (!only.length) for (const f of fs.readdirSync(out)) if (f.endsWith('.png') && !all.includes(f.split('.')[0])) fs.unlinkSync(path.join(out, f));
await browser.close();
