#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/hearthfind-page.mjs — the Hearthfind battery, run alone, plus the two reveal screenshots.
//
//   node tools/hearthfind-page.mjs
//   node tools/hearthfind-page.mjs --only=HF-3
//   node tools/hearthfind-page.mjs --headed
//
// Same shape and same reason as tools/set-the-night-page.mjs: HF-1..5 live
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
const BATTERIES = ONLY ? [ONLY] : ['HF-'];

const { server, port } = await serve();
const url = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });

const consoleErrors = [];
/* The SAME network filter tests/run-smoke.mjs applies: this page has no
   session and talks to the real project, so a resource 404 / net:: / supabase
   line is the environment, not the code under test. `world_finds` legitimately
   404s until its lane-C migration is applied — the module learns that once and
   stops polling (HF-6). A pageerror is never filtered. */
const ENV_NOISE = /Failed to load resource|net::ERR|supabase|skypack|raw\.githubusercontent/i;
page.on('console', (m) => { if (m.type() === 'error' && !ENV_NOISE.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + (e && e.message)));

let failed = 0;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__smokeTestSource === 'esm' && typeof window.__smokeTest === 'function', { timeout: 60_000 });
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

  /* ── THE REVEAL, LOOKED AT ────────────────────────────────────────────────
     The battery grades the COPY and the LIFETIME of the reveal; only a picture
     grades the composition. Two viewports because the ruling's plate is
     over-scaled and a landscape phone is 423px tall (CLAUDE.md §7: phones are
     landscape-only). Driven through the module's own seams, so the screenshot
     is of the shipped renderer and not of a mock. */
  const shots = [
    { name: 'hearthfind-reveal-1440x900', w: 1440, h: 900 },
    { name: 'hearthfind-reveal-922x423', w: 922, h: 423 },
  ];
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.evaluate(() => {
      /* Clear the FTUE tour first: a fresh harness page opens on "Step 1 of 6",
         and a screenshot of the reveal under the tour grades the tour. */
      document.querySelectorAll('.ftue-root,.welcome-overlay,#toasts .toast')
        .forEach((n) => n.remove());
      const HF = window.HearthriseHearthfind;
      HF.dismissReveal();
      window.G.bestiary = window.G.bestiary || {};
      window.G.bestiary.dragon = { kills: 4211, firstKill: 1 };
      HF.__setBoardCount('emberheart', 3);
      HF.showReveal({
        item: 'emberheart', kind: 'monster', source: 'dragon',
        oneIn: 26000, nthToday: 1, at: new Date().toISOString(),
      }, window.G);
      // Jump the entrance to its end state; a screenshot of a 900ms fade is noise.
      const v = document.getElementById('hr-hf-veil');
      if (v) v.classList.add('in', 'bloom', 'odds');
    });
    /* Long enough for the whole entrance to finish on its own timers (dim
       400ms → rise 900ms → bloom 2600ms → odds at 1500ms + 900ms), so the
       picture is the END STATE and not a frame of it. */
    await page.waitForTimeout(3800);
    /* Clear again: the boot fires a rank-up celebration and a welcome modal on
       their own clocks, and either would land ON TOP during the wait. Removed
       immediately before the shutter so the picture is of the reveal alone. */
    await page.evaluate(() => {
      document.querySelectorAll('.ftue-root,.welcome-overlay,.lvl-overlay,.levelup-overlay,'
        + '.rankup-overlay,#toasts .toast').forEach((n) => n.remove());
      document.querySelectorAll('body > div').forEach((n) => {
        if (n.id === 'hr-hf-veil') return;
        const z = parseInt(getComputedStyle(n).zIndex, 10);
        if (z > 99990 && n.offsetHeight > 100) n.remove();
      });
    });
    const path = `.tmp-shots/${s.name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`  📷 ${path}`);
  }
  await page.evaluate(() => window.HearthriseHearthfind.dismissReveal());

  if (consoleErrors.length) {
    console.log(`\n✗ ${consoleErrors.length} console error(s) while the battery ran:`);
    consoleErrors.slice(0, 10).forEach((e) => console.log('   · ' + e));
    failed += consoleErrors.length;
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n✗ hearthfind page battery FAILED (${failed})\n` : '\n✓ hearthfind page battery green\n');
process.exit(failed ? 1 : 0);
