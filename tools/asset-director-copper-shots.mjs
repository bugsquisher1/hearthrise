/** Asset Director — verification shots for the copper/bronze/plank icon fix (2026-08-17). */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT  = process.argv[2] || join(ROOT, '_shots-copper-fix');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

function serve(){ return new Promise((res)=>{ const s=createServer(async(rq,rs)=>{ try{ const u=decodeURIComponent((rq.url||'/').split('?')[0]); let f=normalize(join(ROOT, u==='/'?'/index.html':u)); if(!f.startsWith(ROOT)){rs.writeHead(403).end();return;} const i=await stat(f).catch(()=>null); if(i?.isDirectory()) f=join(f,'index.html'); const b=await readFile(f); rs.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}).end(b);}catch{rs.writeHead(404).end();} }); s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port})); }); }

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function boot({ width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G && !!window._itemPath, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

const IDS = ['copper_ore', 'copper_bar', 'bronze_bar', 'oak_plank', 'duskwood_plank', 'runewood_plank'];

async function seed(page) {
  return page.evaluate((ids) => {
    const G = window.G;
    G.gold = 250000;
    ids.forEach((id, i) => { G.inventory[id] = 1 + i; });
    return { items: Object.keys(G.inventory).length };
  }, IDS);
}

async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    const closed = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, [class*="daily"], [class*="ftue"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;
        const x = el.querySelector('.modal-close, [aria-label="Close"], button.close, .x, .modal-x');
        if (x) { x.click(); n++; } else { el.remove(); n++; }
      });
      return n;
    });
    if (!closed) break;
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch(e){} }, tab);
  await page.waitForTimeout(1200);
  await dismiss(page);
}

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('  shot -> ' + name + '.png');
}

for (const [tag, width, height] of [['desktop', 1440, 900], ['mobile-landscape', 922, 423]]) {
  const { ctx, page } = await boot({ width, height });
  console.log(tag + ':', JSON.stringify(await seed(page)));

  await go(page, 'inventory');
  await shot(page, tag + '-01-inventory');

  for (const id of IDS) {
    const opened = await page.evaluate((iid) => {
      if (typeof window.openInvDetail === 'function') { window.openInvDetail(iid); return true; }
      return false;
    }, id);
    if (opened) {
      await page.waitForTimeout(700);
      await shot(page, tag + '-02-popup-' + id);
      await page.keyboard.press('Escape').catch(() => {});
      await dismiss(page);
    } else {
      console.log('  MISS: openInvDetail not found for ' + id);
    }
  }

  await ctx.close();
}

await browser.close();
s.close();
console.log('done -> ' + OUT);
