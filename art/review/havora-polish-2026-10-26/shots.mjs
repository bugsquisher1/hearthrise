#!/usr/bin/env node
// art/review/havora-polish-2026-10-26/shots.mjs — lane/b-havora-polish's review shots of Havora through view.html (the
// real renderer, no sign-in). NOT a test. Needs the worktree served: python -m http.server 8233 (from the root).
//   node art/review/havora-polish-2026-10-26/shots.mjs <before|after> [name …]   (no names: every shot)
// Each place is shot at 1920 x 1080 (x2 art px) and 2560 x 1440 (x3, the renderer's wide-screen density).
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8233/art/review/havora-polish-2026-10-26/view.html';
/* [name, hero tile (map columns = plan x + 24, rows)] */
const PLACES = [
  ['smithy-yard', 86, 41], ['tavern-yard', 89, 32], ['mine', 175, 40], ['westwood-north', 11, 30], ['westwood-south', 11, 72],
  ['farm', 60, 85], ['training-yard', 92, 68],
  ['wall-nw-corner', 36, 12], ['wall-west-gap', 34, 50], ['wall-west-south-end', 36, 76], ['wall-gatehouse-west', 97, 12],
  ['wall-river-east', 124, 12], ['wall-east-corner', 149, 14], ['river-north-crossing', 118, 18], ['river-south-crossing', 116, 74],
  ['docks-west', 124, 89],
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
      const file = join(dir, name + '-' + w + '.png');
      await page.screenshot({ path: file });
      console.log('  ' + file);
      await page.close();
    }
  }
  if (!only.length || only.includes('overview')) {
    const page = await browser.newPage({ viewport: { width: 1536, height: 928 } });
    await page.goto(BASE + '?overview=1&k=0.25', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await page.locator('canvas').screenshot({ path: join(dir, 'overview.png') });
    await page.close();
  }
} finally { await browser.close(); }
