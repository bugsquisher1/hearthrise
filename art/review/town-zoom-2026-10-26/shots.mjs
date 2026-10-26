#!/usr/bin/env node
// art/review/town-zoom-2026-10-26/shots.mjs — Havora at x1 / x1.5 / x2 (and today's) for Tyler's zoom question, through
// view.html (the real renderer; the worktree is served from disk, no server). NOT a test.
//   node art/review/town-zoom-2026-10-26/shots.mjs [name …]   (no names: every shot, then the x1.5 pan check)
// Tyler's screen: 2560 x 1271 CSS at DPR 1 (shots are 2560 x 1440). Today a window wider than 2400 CSS px draws x3.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIGIN = 'http://havora.localhost';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const SQUARE = 'x=130&y=50&crowd=20';
/* [file, query, css width, css height, dpr] */
const SHOTS = [
  ['square-1x', SQUARE + '&zoom=1', 2560, 1440, 1],
  ['square-1_5x', SQUARE + '&zoom=1.5', 2560, 1440, 1],
  ['square-2x', SQUARE + '&zoom=2', 2560, 1440, 1],
  ['square-today-3x', SQUARE, 2560, 1440, 1],
  ['square-1_5x-dpr2', SQUARE + '&zoom=1.5', 1280, 720, 2],
  ['gate-1x', 'crowd=6&zoom=1', 2560, 1440, 1],
  ['gate-1_5x', 'crowd=6&zoom=1.5', 2560, 1440, 1],
  ['gate-2x', 'crowd=6&zoom=2', 2560, 1440, 1],
];
const gpu = process.argv.includes('--gpu');   // the machine's GPU (Tyler's: an RTX 3070) instead of headless SwiftShader
const only = process.argv.slice(2).filter((a) => a !== '--gpu');
const browser = await chromium.launch(gpu ? { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] } : {});
async function open(q, w, h, dpr) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(ORIGIN + '/**', async (r) => {
    const path = decodeURIComponent(new URL(r.request().url()).pathname);
    try { r.fulfill({ body: await readFile(join(ROOT, path)), contentType: TYPES[extname(path)] || 'application/octet-stream' }); }
    catch { r.fulfill({ status: 404, body: '' }); }
  });
  await page.goto(ORIGIN + '/art/review/town-zoom-2026-10-26/view.html?' + q, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  return { page, errors };
}
try {
  for (const [name, q, w, h, dpr] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const { page, errors } = await open(q, w, h, dpr);
    await page.waitForTimeout(500);
    const z = await page.evaluate(() => window.snap().z);
    const file = join(HERE, name + '.png');
    await page.screenshot({ path: file });
    /* a 1:1 crop by the bake oven (a full shot is shown scaled down, which hides x1.5's uneven columns) */
    if (dpr === 1 && name.startsWith('square')) await page.screenshot({ path: join(HERE, 'crop-' + name + '.png'), clip: { x: 1180, y: 380, width: 640, height: 360 } });
    console.log('  ' + name + '  z=' + z + (errors.length ? '  ERRORS: ' + errors.join(' | ') : ''));
    await page.close();
  }
  if (!only.length || only.includes('time')) {
    /* THE TOWN DRAW at 2560 x 1440: 240 frames walking east across the square (new chunks baked on the way) */
    for (const [crowd, walk] of [[20, true], [0, true], [20, false]]) for (const zoom of [1, 1.5, 2]) {
      const { page } = await open('x=130&y=50&crowd=' + crowd + '&zoom=' + zoom, 2560, 1440, 1);
      const r = await page.evaluate((walk) => {
        const ms = [];
        for (let k = 0; k < 240; k++) { const t = performance.now(); window.drawAt(walk ? k / 8 : 0); ms.push(performance.now() - t); }
        ms.sort((a, b) => a - b);
        return { avg: ms.reduce((a, b) => a + b, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1] };
      }, walk);
      console.log('  draw x' + zoom + ' crowd ' + crowd + (walk ? ' walking' : ' standing') + ': avg ' + r.avg.toFixed(2) + ' p95 ' + r.p95.toFixed(2) + ' max ' + r.max.toFixed(1) + ' ms');
      await page.close();
    }
  }
  if (!only.length || only.includes('pan')) {
    /* THE PAN AT x1.5: the camera moved 2/3 art px at a time (one device px); the still world must slide whole,
       every device px of it the one beside it a frame before (a shimmer re-cuts which columns are doubled) */
    for (const zoom of [1.5, 2]) {
      const { page } = await open('x=130&y=50&zoom=' + zoom, 1280, 720, 1);
      const r = await page.evaluate(async (zoom) => {
        const c = document.querySelector('canvas'), g = c.getContext('2d');
        const grab = () => g.getImageData(0, 200, c.width, 1).data;   // one row across the square, above the hero
        const steps = [];
        let prev = null;
        for (let k = 0; k <= 12; k++) {
          window.drawAt(k / zoom / 32);   // 1/z art px per step: one device px
          const row = grab();
          if (prev) {
            let best = null;
            for (const s of [-3, -2, -1, 0, 1, 2, 3]) {
              let same = 0, n = 0;
              for (let x = 8; x < c.width - 8; x++) { n++; if (row[x * 4] === prev[(x + s) * 4] && row[x * 4 + 1] === prev[(x + s) * 4 + 1] && row[x * 4 + 2] === prev[(x + s) * 4 + 2]) same++; }
              if (!best || same / n > best.f) best = { s, f: same / n };
            }
            steps.push(best.s + ':' + (best.f * 100).toFixed(1) + '%');
          }
          prev = row;
        }
        return steps;
      }, zoom);
      console.log('  pan x' + zoom + ' (shift:rigid match per step) ' + r.join(' '));
      await page.close();
    }
  }
} finally { await browser.close(); }
