#!/usr/bin/env node
// art/review/havora-art-2-2026-10-26/shots.mjs — the lane's review shots of Havora through view.html (the real
// renderer, no sign-in). NOT a test. Needs the worktree served: python -m http.server 8232 (from the root).
//   node art/review/havora-art-2-2026-10-26/shots.mjs [name …]   (no names: every shot)
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:8232/art/review/havora-art-2-2026-10-26/view.html';
/* [file, query, width, height]: map columns (plan x + 24) and rows */
const SHOTS = [
  ['0-overview', 'overview=1&k=0.25', 1536, 928],
  ['1-gatehouse-arrival-1440', '', 1440, 900],
  ['2-main-road-1440', 'x=107&y=40', 1440, 900],
  ['3-bridge-1440', 'x=118&y=50', 1440, 900],
  ['4-square-west-edge-1440', 'x=128&y=50', 1440, 900],
  ['5-square-east-edge-1440', 'x=152&y=46', 1440, 900],
  ['6-shacks-nw-1440', 'x=56&y=24', 1440, 900],
  ['7-west-road-westwood-1440', 'x=30&y=48', 1440, 900],
  ['8-shore-pier-1440', 'x=84&y=92', 1440, 900],
  ['9-harbor-se-1440', 'x=140&y=84', 1440, 900],
  ['10-gatehouse-arrival-844x390', '', 844, 390],
];
const only = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const [name, q, w, h] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + (q ? '?' + q : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    const file = join(HERE, name + '.png');
    if (q.startsWith('overview')) await page.locator('canvas').screenshot({ path: file });
    else await page.screenshot({ path: file });
    console.log('  ' + file);
    await page.close();
  }
} finally { await browser.close(); }
