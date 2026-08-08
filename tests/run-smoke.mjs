// ============================================================
// tests/run-smoke.mjs — headless runner for the in-game smoke suite (b215)
//
// The 168-test suite in src/features/smoke-test.js is genuinely good, but it
// only ever ran when a human pressed Ctrl+Shift+T in a browser — so it could
// not gate a push, and by the team's own workflow note it typically ran AFTER
// a bug was already live. This script loads the real index.html in headless
// Chromium, calls window.__smokeTest(), and exits non-zero on any failure,
// which turns those existing tests into an actual merge gate. No test rewrites.
//
//   node tests/run-smoke.mjs [--url http://localhost:8123] [--headed]
//
// Exit codes: 0 = all green · 1 = failing tests, runtime errors, or console
// errors · 2 = harness/setup problem (couldn't load the page or find the suite).
// ============================================================

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);
const argOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const HEADED = argv.includes('--headed');
const EXTERNAL_URL = argOf('--url');
const SUITE_TIMEOUT_MS = 120_000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// Minimal static server — the game is a static folder with no build step, so
// serving ROOT is the whole "build".
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
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const run = async () => {
  let server = null, url = EXTERNAL_URL;
  if (!url) { const s = await serve(); server = s.server; url = `http://127.0.0.1:${s.port}/`; }

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Console errors and page crashes are signal too — a suite can pass while the
  // app is throwing in the background.
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  let exitCode = 0;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

    // The suite is registered by main.js's deferred feature boot.
    await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60_000 });
    // Let the engine settle (legacy boot + icon sweeps + deferred setups).
    await page.waitForTimeout(6_000);

    const result = await page.evaluate(async (timeout) => {
      const suite = await Promise.race([
        Promise.resolve(window.__smokeTest({ silent: true })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('suite timed out')), timeout)),
      ]);
      return {
        passed: suite.passed, failed: suite.failed,
        runtimeErrors: suite.runtimeErrors, total: suite.total,
        failures: (suite.results || [])
          .filter((r) => r.status !== 'PASS')
          .map((r) => ({ name: r.name, why: r.why })),
      };
    }, SUITE_TIMEOUT_MS);

    const build = await page.evaluate(() => window.HearthriseBuild?.buildString?.() ?? 'unknown');

    console.log(`\nHearthrise smoke suite — ${build}`);
    console.log(`  passed ${result.passed}/${result.total}   failed ${result.failed}   runtime errors ${result.runtimeErrors}`);

    if (result.failures.length) {
      console.log('\nFailures:');
      for (const f of result.failures) console.log(`  ✗ ${f.name}\n      ${f.why || '(no detail)'}`);
      exitCode = 1;
    }
    if (result.runtimeErrors > 0) {
      console.log(`\n${result.runtimeErrors} runtime error(s) captured during the suite.`);
      exitCode = 1;
    }
    // Ignore benign network noise from the offline/beta posture (Supabase and
    // the CDN-hosted icon fetches are expected to fail with no credentials).
    const realErrors = consoleErrors.filter(
      (t) => !/Failed to load resource|net::ERR|supabase|raw\.githubusercontent/i.test(t)
    );
    if (realErrors.length) {
      console.log('\nConsole errors:');
      for (const t of realErrors.slice(0, 15)) console.log(`  ! ${t}`);
      exitCode = 1;
    }
    if (exitCode === 0) console.log('\nAll green.\n');
  } catch (err) {
    console.error('\nHarness failure:', err.message);
    exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
    server?.close();
  }
  process.exit(exitCode);
};

run();
