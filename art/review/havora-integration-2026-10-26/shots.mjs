#!/usr/bin/env node
// art/review/havora-integration-2026-10-26/shots.mjs — lane/i-havora's review shots of Havora through view.html (the
// real renderer, no sign-in; the worktree is served to the page from disk, no server). NOT a test.
//   node art/review/havora-integration-2026-10-26/shots.mjs [name …]   (no names: every shot)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIGIN = 'http://havora.localhost';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
/* [file, query, width, height]: map columns; crowd = the first N stands of every station hold a hero */
const SHOTS = [
  ['1-arrival-1440', 'crowd=6', 1440, 900],
  ['2-arrival-844x390', 'crowd=4', 844, 390],
  ['3-square-stands-1440', 'x=130&y=50&crowd=40', 1440, 900],
  ['4-smithy-1440', 'x=85&y=41&crowd=12', 1440, 900],
  ['5-mine-1440', 'x=170&y=38&crowd=12', 1440, 900],
  ['6-westwood-1440', 'x=8&y=27&crowd=12', 1440, 900],
  ['7-shore-1440', 'x=76&y=91&crowd=12', 1440, 900],
  ['8-square-844x390', 'x=130&y=50&crowd=40', 844, 390],
];
const only = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const [name, q, w, h] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route(ORIGIN + '/**', async (r) => {
      const path = decodeURIComponent(new URL(r.request().url()).pathname);
      try { r.fulfill({ body: await readFile(join(ROOT, path)), contentType: TYPES[extname(path)] || 'application/octet-stream' }); }
      catch { r.fulfill({ status: 404, body: '' }); }
    });
    await page.goto(ORIGIN + '/art/review/havora-integration-2026-10-26/view.html' + (q ? '?' + q : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const file = join(HERE, name + '.png');
    await page.screenshot({ path: file });
    console.log('  ' + file + (errors.length ? '  ERRORS: ' + errors.join(' | ') : ''));
    await page.close();
  }
} finally { await browser.close(); }
