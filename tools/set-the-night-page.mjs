#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/set-the-night-page.mjs — the Set the Night battery, run alone.
//
//   node tests/set-the-night-page.mjs
//   node tests/set-the-night-page.mjs --only=NIGHT-3
//   node tests/set-the-night-page.mjs --headed
//
// Same shape and same reason as tests/signup-door-page.mjs: NIGHT-1..4 live
// in src/features/smoke-test.js and the ASSEMBLED suite is the contract —
// this file does not replace it and CI does not call it. It exists because
// the in-page suite is a multi-minute run on a shared budget (b461) and two
// at once read as flakes rather than as contention, so an agent proving one
// new battery would otherwise have to choose between destabilising another
// lane's run and shipping a test it had never seen go green.
//
// ONE page, ONE filtered call into the SAME in-page runner
// (`window.__smokeTest({ only })`), the SAME assertions, no second copy of
// anything. Console errors and page exceptions raised while the battery ran
// are failures too: half of what this battery guards is UI wiring, and a
// silent throw inside a render path is exactly what a pure guard cannot see.
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const argv = process.argv.slice(2);
const arg = (p) => (argv.find((a) => a.startsWith(p)) || '').split('=')[1];
const ONLY = arg('--only') || null;
const HEADED = argv.includes('--headed');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = normalize(join(ROOT, urlPath === '/' ? '/index.html' : urlPath));
        if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
        const info = await stat(filePath).catch(() => null);
        if (info?.isDirectory()) filePath = join(filePath, 'index.html');
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        }).end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* Named explicitly rather than derived, so deleting a test cannot quietly
   shrink what "green" means here. */
const BATTERIES = ONLY ? [ONLY] : ['NIGHT-'];

const { server, port } = await serve();
const url = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + (e && e.message)));

let failed = 0;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60_000 });
  // Let the boot settle so a boot-time console error is not attributed to us.
  await page.waitForTimeout(2500);
  consoleErrors.length = 0;

  for (const only of BATTERIES) {
    const summary = await page.evaluate(async (o) => await window.__smokeTest({ only: o, verbose: false }), only);
    if (!summary.total) {
      console.log(`✗ "${only}" matched NO registered tests — the filter or the battery name is wrong`);
      failed++;
      continue;
    }
    console.log(`\n${only}  —  ${summary.passed}/${summary.total} passed (of ${summary.registered} registered)`);
    for (const r of summary.results) {
      console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.name}${r.why ? '\n      ' + r.why : ''}`);
    }
    failed += summary.failed;
  }

  if (consoleErrors.length) {
    console.log(`\n✗ ${consoleErrors.length} console error(s) while the battery ran:`);
    consoleErrors.slice(0, 10).forEach((e) => console.log('   · ' + e));
    failed += consoleErrors.length;
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n✗ set-the-night page battery FAILED (${failed})\n` : '\n✓ set-the-night page battery green\n');
process.exit(failed ? 1 : 0);
