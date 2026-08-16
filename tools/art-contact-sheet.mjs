/**
 * Contact sheet for batch review  ·  Art Director
 * Tiles processed icons on the hearthlight surface at a REVIEW size with the
 * id printed under each, so a whole category can be judged against the prompt
 * sheet in one look. The pilot's lesson: defects (`oak_log` == `bronze_sword`,
 * `iron_ore` reading as meat) are invisible in a file browser and obvious on a
 * shelf.
 *   node tools/art-contact-sheet.mjs <dir> <out.png> [--cols 8] [--cell 150] [--from 0] [--count 48]
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const a = process.argv.slice(2);
const DIR = a[0], OUT = a[1];
const opt = (n, d) => { const i = a.indexOf(n); return i > 0 ? +a[i + 1] : d; };
const COLS = opt('--cols', 8), CELL = opt('--cell', 150), FROM = opt('--from', 0), COUNT = opt('--count', 48);

function walk(d) { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(walk(p)); else if (/\.png$/i.test(e.name)) o.push(p); } return o; }
const all = walk(DIR).sort();
const files = all.slice(FROM, FROM + COUNT);
if (!files.length) { console.log('nothing to sheet'); process.exit(0); }

/* Inlined rather than imported from art-batch-process.mjs: that module runs
   a batch on import (it is a script, not a library). Walks up for
   node_modules so this works from a git worktree, which has none of its own. */
function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(p)) return url.pathToFileURL(p).href;
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(path.dirname(url.fileURLToPath(import.meta.url))));
const browser = await chromium.launch();
const page = await browser.newPage({ viewportSize: { width: COLS * CELL + 24, height: 200 }, deviceScaleFactor: 1 });

const tiles = files.map((f) => ({
  label: path.relative(DIR, f).replace(/\\/g, '/').replace(/\.png$/, ''),
  src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'),
}));

await page.setContent(`<html><body style="margin:0;background:#16120f;font-family:system-ui">
<div style="display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:0;padding:12px">
${tiles.map((t) => `<figure style="margin:0;padding:6px;display:flex;flex-direction:column;align-items:center;gap:4px">
  <div style="width:${CELL - 24}px;height:${CELL - 24}px;display:flex;align-items:center;justify-content:center;background:#221b16;border:1px solid #3a2f26;border-radius:3px">
    <img src="${t.src}" style="max-width:100%;max-height:100%;object-fit:contain">
  </div>
  <figcaption style="color:#d8c9b4;font-size:10px;text-align:center;line-height:1.1;word-break:break-all">${t.label}</figcaption>
</figure>`).join('')}
</div></body></html>`);
await page.waitForTimeout(400);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`${OUT}  (${files.length} of ${all.length}, from ${FROM})`);
