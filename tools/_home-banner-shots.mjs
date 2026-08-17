/** Home-banner visual-gate + audit walk. Boots index.html headless behind
 *  __HR_TEST_HARNESS__ from a server rooted in THIS checkout, seeds a save,
 *  and photographs Home + a survey of chrome surfaces at two viewports in
 *  hearthlight. Descends from tools/art-batch-shots.mjs. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
const TIER = process.argv[3] != null && process.argv[3] !== 'x' ? Number(process.argv[3]) : null;
const SURVEY = process.argv[4] === 'survey';
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

function findPlaywright(from) {
  let d = from;
  for (let i = 0; i < 8; i++) {
    const p = join(d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) return pathToFileURL(p).href;
    const up = normalize(join(d, '..')); if (up === d) break; d = up;
  }
  throw new Error('playwright not found walking up from ' + from);
}
const { chromium } = await import(findPlaywright(ROOT));

function serve(){ return new Promise((res)=>{ const s=createServer(async(rq,rs)=>{ try{ const u=decodeURIComponent((rq.url||'/').split('?')[0]); let f=normalize(join(ROOT, u==='/'?'/index.html':u)); if(!f.startsWith(ROOT)){rs.writeHead(403).end();return;} const i=await stat(f).catch(()=>null); if(i?.isDirectory()) f=join(f,'index.html'); const b=await readFile(f); rs.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}).end(b);}catch{rs.writeHead(404).end();} }); s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port})); }); }

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const missing = new Set();
const consoleErrors = [];

async function boot({ width, height, tag }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
  page.on('requestfailed', (r) => missing.add('FAILED ' + new URL(r.url()).pathname));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 200)}`));
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G, null, { timeout: 30000 });
  await page.waitForTimeout(2400);
  return { ctx, page };
}

async function seed(page, tier) {
  return page.evaluate((tier) => {
    const G = window.G;
    G.gold = 250000;
    try { Object.keys(G.skills || {}).forEach((k) => { G.skills[k].level = 42; G.skills[k].xp = 100000; }); } catch(e){}
    G.stats = G.stats || {}; G.stats.kills = 1287;
    if (tier != null) { try { if (G.homestead) G.homestead.tier = tier; } catch(e){} }
    try { window.refreshAll && window.refreshAll(); } catch(e){}
    return { gold: G.gold, tier: (G.homestead && G.homestead.tier) };
  }, tier);
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch(e){} }, tab);
  await page.waitForTimeout(1200);
}

async function dismiss(page) {
  for (let i = 0; i < 3; i++) {
    const n = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, .inv-detail, [class*="daily"], [class*="ftue"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;
        const x = el.querySelector('.modal-close, [aria-label="Close"], button.close, .x, .modal-x');
        if (x) { x.click(); n++; } else { el.remove(); n++; }
      });
      return n;
    });
    if (!n) break;
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

async function shot(page, name, full) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: !!full });
  console.log('  shot -> ' + name + '.png');
}

for (const vp of [{ w:1440, h:900, t:'desktop' }, { w:922, h:423, t:'landscape' }]) {
  const { ctx, page } = await boot({ width: vp.w, height: vp.h, tag: vp.t });
  console.log(vp.t + ':', JSON.stringify(await seed(page, TIER)));
  await go(page, 'profile');
  await dismiss(page);
  await go(page, 'profile');
  await shot(page, `home-${vp.t}`);
  await shot(page, `home-${vp.t}-full`, true);
  // Close read of just the band (2x via deviceScaleFactor) — the legibility test.
  try {
    const band = await page.$('.hd-hearth');
    if (band) { await band.screenshot({ path: join(OUT, `band-${vp.t}.png`) }); console.log('  shot -> band-' + vp.t + '.png'); }
  } catch (e) { console.log('  band clip failed: ' + e.message); }
  if (SURVEY) {
    for (const tab of ['combat','skills','farming','inventory','house','bounty','social']) {
      await go(page, tab); await dismiss(page);
      await shot(page, `${tab}-${vp.t}`);
    }
  }
  await ctx.close();
}

console.log('\n404s:', missing.size ? [...missing].join(', ') : 'none');
console.log('console errors:', consoleErrors.length ? '\n  ' + consoleErrors.join('\n  ') : 'none');
await browser.close();
s.close();
