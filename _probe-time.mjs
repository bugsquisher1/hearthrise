/* Measure the in-page suite duration + the cost of the B492 additions. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8210);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''));
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60000 });
await page.waitForTimeout(3000);

const out = await page.evaluate(async () => {
  const t0 = performance.now();
  const r = await window.__smokeTest();
  const total = performance.now() - t0;
  const slow = (r.results || []).filter((x) => x.ms !== undefined)
    .sort((a, b) => b.ms - a.ms).slice(0, 12).map((x) => x.name + ': ' + Math.round(x.ms) + 'ms');
  const fails = (r.results || []).filter((x) => x.status === 'FAIL').map((x) => x.name + ' — ' + (x.why || ''));
  return { totalMs: Math.round(total), passed: r.passed, total: r.total, failed: r.failed, fails };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
