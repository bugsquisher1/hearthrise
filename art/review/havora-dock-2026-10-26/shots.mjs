#!/usr/bin/env node
// art/review/havora-dock-2026-10-26/shots.mjs — lane/a-havora-dock's review shots of Havora's east harbour through
// view.html (the real renderer, no sign-in). NOT a test. Needs the worktree served: python -m http.server 8233 (root).
//   node art/review/havora-dock-2026-10-26/shots.mjs <before|after> [name …]
// 1920 x 1080 draws at x2 (the live zoom); 2560 x 1440 at the wide-screen density.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8233/art/review/havora-dock-2026-10-26/view.html';
/* [name, hero tile (map columns), sizes]: Tyler's spot (the dock's NE corner by the manor) first, then the other quays */
const PLACES = [
  ['dock-ne-corner', 159, 82], ['manor-quay', 164, 88], ['mill-race-banks', 117, 26], ['river-south', 116, 70], ['east-shore', 186, 84],
];
const SIZES = [[1920, 1080], [2560, 1440]];
const [phase, ...only] = process.argv.slice(2);
if (!['before', 'after'].includes(phase)) { console.error('usage: shots.mjs <before|after> [name …]'); process.exit(2); }
const dir = join(HERE, phase);
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, x, y] of PLACES) {
    if (only.length && !only.includes(name)) continue;
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(BASE + '?x=' + x + '&y=' + y, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(dir, name + '-' + w + '.png') });
      await page.close();
    }
    console.log('  ' + name);
  }
} finally { await browser.close(); }
