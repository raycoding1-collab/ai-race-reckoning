import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://accelerator-anatomy.netlify.app').replace(/\/$/, '');
const out = 'dist';
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/assets`, { recursive: true });
cpSync('public', out, { recursive: true });

const js = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', target: 'es2020',
  legalComments: 'none', write: false,
});
const jsCode = js.outputFiles[0].contents;
const jsName = `assets/app.${hash(jsCode)}.js`;
writeFileSync(`${out}/${jsName}`, jsCode);

const css = await build({ entryPoints: ['src/styles.css'], minify: true, write: false, loader: { '.css': 'css' } });
const cssCode = css.outputFiles[0].contents;
const cssName = `assets/styles.${hash(cssCode)}.css`;
writeFileSync(`${out}/${cssName}`, cssCode);

const fill = (s) => s.replaceAll('%SITE_URL%', SITE_URL).replaceAll('%APP_JS%', `/${jsName}`).replaceAll('%STYLES%', `/${cssName}`);
const html = fill(readFileSync('src/index.html', 'utf8'))
  .replace(/\n\s*\n/g, '\n');
writeFileSync(`${out}/index.html`, html);
writeFileSync(`${out}/404.html`, fill(readFileSync('src/404.html', 'utf8')));
writeFileSync(`${out}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc></url>\n</urlset>\n`);

console.log(`Built for ${SITE_URL}`);
console.log(`  ${jsName}  ${(jsCode.length / 1024).toFixed(0)} KB`);
console.log(`  ${cssName}  ${(cssCode.length / 1024).toFixed(0)} KB`);
