// ============================================================================
// tools/_gem-suite-probe.mjs — run the IN-PAGE suite standalone for this lane.
//
// NOT the assembled gate. `tests/run-smoke.mjs` owns that and the Coordinator
// runs it on main; a second in-page suite on a busy machine blows the budget and
// reports flakes as reds. This boots the same page and calls the same
// `window.__smokeTest`, so the assertions are identical — it just skips every
// node-side guard (they are run individually in this lane) and prints the
// gem-battery rows by name so the lane's own tests can be READ rather than
// inferred from a total.
//
//   node tools/_gem-suite-probe.mjs
//   HR_SUITE_TIMEOUT_MS=300000 node tools/_gem-suite-probe.mjs
// ============================================================================
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const TIMEOUT = Number(process.env.HR_SUITE_TIMEOUT_MS) > 0 ? Number(process.env.HR_SUITE_TIMEOUT_MS) : 300_000;

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

const { server, port } = await serve();
const url = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });

let code = 0;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60_000 });
  await page.waitForTimeout(6_000);

  const result = await page.evaluate(async (t) => {
    const suite = await Promise.race([
      Promise.resolve(window.__smokeTest({ silent: true })),
      new Promise((_, rej) => setTimeout(() => rej(new Error('suite timed out')), t)),
    ]);
    return {
      passed: suite.passed, failed: suite.failed, total: suite.total,
      runtimeErrors: suite.runtimeErrors,
      lane: (suite.results || [])
        .filter((r) => /^GEM-|hearth token|bag renders the space|b269: buying bank space|slice 6: buyTheme/.test(r.name))
        .map((r) => ({ name: r.name, status: r.status, why: r.why })),
      failures: (suite.results || []).filter((r) => r.status !== 'PASS')
        .map((r) => ({ name: r.name, why: r.why })),
    };
  }, TIMEOUT);

  const build = await page.evaluate(() => window.HearthriseBuild?.buildString?.() ?? 'unknown');
  console.log(`\nin-page suite — ${build}`);
  console.log(`  passed ${result.passed}/${result.total}   failed ${result.failed}   runtime errors ${result.runtimeErrors}`);
  console.log('\nthis lane\'s rows:');
  for (const r of result.lane) console.log(`  ${r.status === 'PASS' ? 'PASS' : 'FAIL'}  ${r.name}${r.why ? '\n        ' + r.why : ''}`);
  if (result.failures.length) {
    console.log('\nfailures:');
    for (const f of result.failures) console.log(`  x ${f.name}\n      ${f.why}`);
  }
  if (consoleErrors.length) {
    console.log(`\nconsole errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 12)) console.log('  ! ' + e);
  }
  if (result.failed > 0 || result.runtimeErrors > 0) code = 1;
} catch (e) {
  console.log('harness failure: ' + (e && e.message));
  code = 2;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
