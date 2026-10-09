// Deterministic frame capture: drives window.renderAt(t) in headless Chromium.
// usage: node src/render.mjs frames <outdir> [fps] [start] [end]
//        node src/render.mjs stills <outdir> t1 t2 ...
import { createRequire } from "module";
import http from "http"; import fs from "fs"; import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2", ".wav": "audio/wav" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;
const [mode, out, ...rest] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--disable-gpu-vsync", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", e => console.error("PAGE ERROR", e.message));
page.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
await page.goto(`http://127.0.0.1:${port}/web/index.html`);
await page.evaluate(() => window.ready);
const canvas = await page.$("canvas");
async function shot(t, file) {
  await page.evaluate(t => window.renderAt(t), t);
  await canvas.screenshot({ path: file, type: "jpeg", quality: 93 });
}
if (mode === "stills") {
  for (const t of rest.map(Number)) await shot(t, path.join(out, `t${t.toFixed(2).padStart(6, "0")}.jpg`));
} else {
  const fps = Number(rest[0] || 30), dur = await page.evaluate(() => window.TL.duration);
  const a = Number(rest[1] || 0), b = Number(rest[2] || dur);
  const n0 = Math.round(a * fps), n1 = Math.round(b * fps);
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    await shot(i / fps, path.join(out, `f${String(i).padStart(5, "0")}.jpg`));
    if (i % 150 === 0) console.log(`frame ${i}/${n1}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
await browser.close(); server.close();
