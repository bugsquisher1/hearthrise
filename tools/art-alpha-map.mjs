/**
 * ASCII alpha/value map of a matted PNG  ·  Art Director
 *
 * A contact sheet tells you SOMETHING is wrong; this tells you what. Prints
 * one character per sampled pixel:
 *   `.` transparent   `#` opaque and near-black   `o` opaque and near-white
 *   `+` opaque, mid   `:` partially transparent
 * A rectangular block of `#` is a decontamination failure; a block of `o` is
 * trapped backdrop; a ragged `:` field is an unresolved soft matte.
 *
 *   node tools/art-alpha-map.mjs <file.png> [step]
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const FILE = process.argv[2];
const STEP = +(process.argv[3] || 4);
function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = path.join(d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(p)) return url.pathToFileURL(p).href;
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  throw new Error('playwright not found');
}
const { chromium } = await import(findPlaywright(path.dirname(url.fileURLToPath(import.meta.url))));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const dataUrl = 'data:image/png;base64,' + fs.readFileSync(FILE).toString('base64');
const out = await page.evaluate(async ({ dataUrl, STEP }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const rows = [];
  for (let y = 0; y < H; y += STEP) {
    let r = '';
    for (let x = 0; x < W; x += STEP) {
      const i = (y * W + x) * 4, a = d[i + 3];
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      r += a === 0 ? '.' : a < 250 ? ':' : l < 45 ? '#' : l > 205 ? 'o' : '+';
    }
    rows.push(r);
  }
  return `${W}x${H}\n` + rows.join('\n');
}, { dataUrl, STEP });
await browser.close();
console.log(out);
