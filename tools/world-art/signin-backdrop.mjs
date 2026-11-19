#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/world-art/signin-backdrop.mjs — THE HEARTH SQUARE BEHIND THE SIGN-IN SCREENS (art audit 2026-11-19 §5: "draw the Hearth
// behind the sign-in panel (a black void today)").
//
// The first thing a player sees is the town's own heart, drawn by the game's own renderer, not painted for the occasion: the
// real town map (town_common) through the real canvas backend at ONE device px an art px, the camera on the Great Hearth, no
// hero and no crowd, one fixed clock (tools/world-art/signin-backdrop.html). The frame is cut to 256 colours (quantize) and
// written as an indexed PNG at its art size; app.css draws it at a whole --art-px (as the World draws the town), centred, under a
// flat --bg-0 scrim, and src/app/auth-backdrop.js asks for it only once the crest has arrived, so the card and the crest paint
// first as they always did.
//
//   node tools/world-art/signin-backdrop.mjs            write assets/brand/hearth-square.png
//   node tools/world-art/signin-backdrop.mjs --check    exit 1 if the committed file's pixels differ from a fresh render
// Re-run it when the square's art or map changes (the file is the town as it stood on the day it was drawn).
// mutant-anchors: none — an art tool: --check compares pixels, it guards no rule
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../../tests/_is-main.mjs';
import { decodePNG, encodeSheetPNG, pixelHash } from './png.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
export const OUT = 'assets/brand/hearth-square.png';
/* 1024 x 640 art px: at 2 CSS px an art px it covers 2048 x 1280, every desktop at 100 % up to 1920 x 1200 and a phone many
   times over. AT is a MAP tile (plan x + WEST, src/data/world/town/plan.js): the Hearth's own column, five tiles north of its
   firebox (plan 117, 48 = map 141, 48 by its row), so the fire burns about 140 art px below the middle, under the card on a
   desktop (centred on it, the crest and the card hid the whole Hearth), the tower rising behind the card, the halls above. */
export const SIZE = Object.freeze({ w: 1024, h: 640 });
export const AT = Object.freeze([141, 41]);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

/** Serve the repository on 127.0.0.1 (the page's atlases and modules), nothing else. */
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      if (!(await stat(path)).isFile()) throw new Error('not a file');
      res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' }).end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

/** The square, rendered: an RGBA image of SIZE art px. */
export async function render() {
  const { chromium } = await import('playwright');
  const { launchOptions } = await import('../../tests/_chrome.mjs');
  const { server, port } = await serve();
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const page = await browser.newPage({ viewport: { width: 2 * SIZE.w, height: 2 * SIZE.h }, deviceScaleFactor: 1 });
    /* nothing leaves the machine: the page draws from the repository alone */
    await page.route((u) => !u.href.startsWith('http://127.0.0.1:' + port + '/'), (r) => r.abort());
    await page.goto('http://127.0.0.1:' + port + '/tools/world-art/signin-backdrop.html?w=' + SIZE.w + '&h=' + SIZE.h + '&at=' + AT.join(','));
    await page.waitForFunction(() => document.title === 'done', null, { timeout: 120000 });
    const b = await page.evaluate(() => window.backdrop);
    if (b.error) throw new Error('the page could not draw the square: ' + b.error);
    if (b.z !== 1 || b.w !== SIZE.w || b.h !== SIZE.h) throw new Error('drawn at zoom ' + b.z + ', ' + b.w + 'x' + b.h + ', not 1:1 at ' + SIZE.w + 'x' + SIZE.h);
    if (b.stubbed) throw new Error(b.stubbed + ' sprites drew as stub boxes (an atlas did not load)');
    return decodePNG(Buffer.from(b.url.split(',')[1], 'base64'));
  } finally { await browser.close(); server.close(); }
}

/**
 * THE PICTURE'S 256 COLOURS. The renderer's light (the Hearth's pool, the braziers') turns the town's palette colours into about
 * 1,800, and an RGBA file of them is 400 KB. A median cut, each colour weighted by its pixels, gives 256; every pixel takes the
 * nearest. The file is then an indexed PNG, and it is drawn under a 72 % scrim, where a step of a few levels in a light pool
 * cannot be told. Deterministic: the same frame gives the same file.
 */
export function quantize(img, n = 256) {
  const { data } = img;
  const key = (i) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
  const count = new Map();
  for (let i = 0; i < data.length; i += 4) count.set(key(i), (count.get(key(i)) || 0) + 1);
  const colours = [...count].map(([k, w]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, w]);
  if (colours.length <= n) return { img, maxErr: 0, colours: colours.length };
  const weight = (b) => b.reduce((s, c) => s + c[3], 0);
  const span = (b) => {
    let best = -1, axis = 0;
    for (let a = 0; a < 3; a++) {
      let lo = 255, hi = 0;
      for (const c of b) { lo = Math.min(lo, c[a]); hi = Math.max(hi, c[a]); }
      if (hi - lo > best) { best = hi - lo; axis = a; }
    }
    return { best, axis };
  };
  const boxes = [colours];
  while (boxes.length < n) {
    /* split the box with the most pixels times its widest side: the light pools get the colours, flat stone keeps few */
    let pick = -1, score = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; const v = span(b).best * weight(b); if (v > score) { score = v; pick = i; } });
    if (pick < 0) break;
    const b = boxes[pick], { axis } = span(b);
    b.sort((x, y) => x[axis] - y[axis] || x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    const half = weight(b) / 2;
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += b[i][3]; if (acc >= half) { cut = i + 1; break; } }
    boxes.splice(pick, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = boxes.map((b) => { const w = weight(b); return [0, 1, 2].map((a) => Math.round(b.reduce((s, c) => s + c[a] * c[3], 0) / w)); });
  const near = new Map();
  let maxErr = 0;
  for (const [r, g, bl] of colours) {
    let best = 0, bd = Infinity;
    pal.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - bl) ** 2; if (d < bd) { bd = d; best = i; } });
    near.set((r << 16) | (g << 8) | bl, pal[best]);
    maxErr = Math.max(maxErr, Math.sqrt(bd));
  }
  const out = { width: img.width, height: img.height, data: new Uint8Array(data.length) };
  for (let i = 0; i < data.length; i += 4) {
    const p = near.get(key(i));
    out.data[i] = p[0]; out.data[i + 1] = p[1]; out.data[i + 2] = p[2]; out.data[i + 3] = 255;
  }
  return { img: out, maxErr, colours: colours.length };
}

if (isMain(import.meta.url)) {
  const { img, maxErr, colours } = quantize(await render());
  const file = join(ROOT, OUT);
  if (process.argv.includes('--check')) {
    const same = pixelHash(decodePNG(readFileSync(file))) === pixelHash(img);
    console.log(same ? 'signin-backdrop: ' + OUT + ' matches a fresh render' : 'signin-backdrop: ' + OUT + ' differs from a fresh render (re-run without --check)');
    process.exit(same ? 0 : 1);
  }
  const bytes = encodeSheetPNG(img);
  writeFileSync(file, bytes);
  console.log('signin-backdrop: wrote ' + OUT + ' ' + img.width + 'x' + img.height + ', ' + colours + ' colours cut to 256 (largest step '
    + maxErr.toFixed(1) + '), ' + Math.round(bytes.length / 1024) + ' KB');
}
