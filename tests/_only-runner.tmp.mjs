// Focused in-page runner: serves the worktree, boots the game, calls
// window.__smokeTest({only}) and prints PASS/FAIL/SKIP. Dev affordance only —
// the gate remains `node tests/run-smoke.mjs`.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = normalize(process.env.HR_ROOT || process.cwd());
const only = process.argv[2] || '';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
const { server, port } = await new Promise((res) => {
  const s = createServer(async (req, r) => {
    try {
      const p = decodeURIComponent((req.url||'/').split('?')[0]);
      let f = normalize(join(ROOT, p === '/' ? '/index.html' : p));
      if (!f.startsWith(ROOT)) { r.writeHead(403).end('forbidden'); return; }
      const i = await stat(f).catch(()=>null);
      if (i?.isDirectory()) f = join(f, 'index.html');
      const b = await readFile(f);
      r.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store' }).end(b);
    } catch { r.writeHead(404).end('not found'); }
  });
  s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
});
const url = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60000 });
await page.waitForTimeout(6000);
const out = await page.evaluate(async ({ only, timeout }) => {
  const s = await Promise.race([
    Promise.resolve(window.__smokeTest(only ? { silent: true, only } : { silent: true })),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), timeout)),
  ]);
  return { passed: s.passed, failed: s.failed, skipped: s.skipped||0, total: s.total,
    runtimeErrors: s.runtimeErrors,
    results: (s.results||[]).map((r)=>({ name: r.name, status: r.status, why: r.why })) };
}, { only, timeout: Number(process.env.HR_SUITE_TIMEOUT_MS) || 300000 });
console.log(`only="${only}"  passed ${out.passed}/${out.total}  failed ${out.failed}  skipped ${out.skipped}  runtimeErrors ${out.runtimeErrors}`);
for (const r of out.results) if (r.status !== 'PASS') console.log(`  ${r.status}  ${r.name}\n       ${r.why||''}`);
const real = errs.filter((t) => !/Failed to load resource|net::ERR|supabase|raw\.githubusercontent/i.test(t));
if (real.length) { console.log('\nconsole errors:'); for (const t of real.slice(0,10)) console.log('  ! '+t); }
await browser.close(); server.close();
process.exit(out.failed > 0 ? 1 : 0);
