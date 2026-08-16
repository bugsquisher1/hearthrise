/** Hearthfire FULL ITEM BATCH — in-game verification harness.
 *  Descends from tools/art-pilot-shots.mjs. Boots the real index.html headless
 *  behind __HR_TEST_HARNESS__ from a server rooted in THIS checkout (the shared
 *  launch.json points at the main tree, which is how the pilot lost twenty
 *  minutes photographing a build that did not contain its own edits), seeds a
 *  save that owns a wide slice of the batch, and walks every surface that
 *  renders item art — while COUNTING 404s and console errors, because "the
 *  icons look fine" and "nothing 404'd" are different claims. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

/* Walk up for node_modules — a git worktree has none of its own, and
   hardcoding the main checkout's absolute path would make this machine-specific. */
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

const missing = new Set();          // every 404 URL, deduped, across every context
const consoleErrors = [];

async function boot({ width, height, theme, tag }) {
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
  await page.waitForFunction(() => !!window.G && !!window._itemPath, null, { timeout: 30000 });
  await page.waitForTimeout(2600);   // deferred icon remap + refreshAll
  if (theme) await page.evaluate((t) => { try { window.applyTheme && window.applyTheme(t); } catch(e){} document.body.setAttribute('data-theme', t); }, theme);
  return { ctx, page };
}

/** Fill the bag with a WIDE slice of the batch mixed with ids that kept their
 *  old art — the shelf test. A grid of only-new icons proves nothing. */
async function seed(page) {
  return page.evaluate(() => {
    const G = window.G;
    G.gold = 5000000;
    const wired = Object.keys((window.HearthriseItemArt && window.HearthriseItemArt.wiredIconMap()) || {});
    const step = Math.max(1, Math.floor(wired.length / 70));
    const sample = wired.filter((_, i) => i % step === 0).slice(0, 70);
    const legacy = ['slime_gel', 'iron_ore', 'iron_bar', 'steel_bar', 'wolf_pelt', 'muster_seal',
      'rune_sword', 'steel_platebody', 'iron_helm', 'leather_gloves', 'oak_staff', 'yew_rod'];
    sample.concat(legacy).forEach((id, i) => { G.inventory[id] = 1 + ((i * 7) % 40); });
    try {
      G.equipment = G.equipment || {};
      G.equipment.weapon = 'steel_sword'; G.equipment.body = 'iron_platebody';
      G.equipment.legs = 'iron_platelegs'; G.equipment.boots = 'leather_boots';
      G.equipment.gloves = 'leather_gloves'; G.equipment.head = 'bronze_helm';
    } catch(e){}
    try { Object.keys(G.skills || {}).forEach((k) => { G.skills[k].level = 70; G.skills[k].xp = 737627; }); } catch(e){}
    return { bag: Object.keys(G.inventory).length, wired: wired.length };
  });
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

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait || 900);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: !!opts.full });
  console.log('  shot -> ' + name + '.png');
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch(e){} }, tab);
  await page.waitForTimeout(1300);
  await dismiss(page);
}

/** Ask the PAGE which <img> are broken — a 404 listener misses a src that was
 *  never requested because it was empty, and catches nothing about size. */
async function auditImgs(page, label) {
  const r = await page.evaluate(() => {
    const out = { total: 0, broken: [], tiny: [], hearthfire: 0 };
    document.querySelectorAll('img').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;              // not laid out
      out.total++;
      if (/hearthfire/.test(el.src)) out.hearthfire++;
      if (el.complete && el.naturalWidth === 0) out.broken.push(el.src.split('/').slice(-2).join('/'));
      else if (r.width < 8 || r.height < 8) out.tiny.push(el.src.split('/').slice(-2).join('/') + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  console.log(`  audit ${label}: ${r.total} imgs, ${r.hearthfire} hearthfire, broken ${r.broken.length}, tiny ${r.tiny.length}`
    + (r.broken.length ? '  BROKEN: ' + r.broken.slice(0, 6).join(', ') : '')
    + (r.tiny.length ? '  TINY: ' + r.tiny.slice(0, 6).join(', ') : ''));
  return r;
}

const audits = [];

// ── DESKTOP, hearthlight (default dark) ────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900, tag: 'desktop-hearthlight' });
  console.log('desktop/hearthlight:', JSON.stringify(await seed(page)));

  await go(page, 'inventory');
  await shot(page, '01-inventory-hearthlight', { full: true });
  audits.push(['inventory', await auditImgs(page, 'inventory')]);

  /* The item-detail popup is the LARGEST item render in the game (64 px box).
     There is no `openItemModal()` to call and the tiles carry no data-id, so
     click a real tile — and CHECK that something opened before believing the
     capture. The first pass silently photographed the inventory again. */
  const detail = await page.evaluate(() => {
    const before = document.querySelectorAll('.qm-overlay, .modal, .item-popup, .tooltip-card').length;
    const tile = document.querySelector('.invc-grid > *, .inv-grid > *, .inventory-grid > *, .inv-cells > *');
    if (!tile) return 'no tile';
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return String(before) + '->' + document.querySelectorAll('.qm-overlay, .modal, .item-popup, .tooltip-card').length;
  });
  await page.waitForTimeout(1000);
  console.log('  item-detail overlays: ' + detail);
  await shot(page, '02-item-detail-modal');
  await page.keyboard.press('Escape'); await dismiss(page);

  await go(page, 'character');
  await shot(page, '03-equipment-doll', { full: true });
  audits.push(['equipment', await auditImgs(page, 'equipment')]);

  await go(page, 'shops');
  await shot(page, '04-shop', { full: true });
  audits.push(['shop', await auditImgs(page, 'shop')]);

  /* There is no separate "bank" screen in Hearthrise — `openBankModal` sells
     bag SPACE, and item storage IS the inventory. The player-market listing
     grid on the Shops tab is the surface that plays the bank's role for art:
     rows of item icons the player did not choose. */
  await page.evaluate(() => { document.querySelectorAll('.shop-tab, [data-shop-tab]').forEach((b) => { if (/market/i.test(b.textContent || '')) b.click(); }); });
  await page.waitForTimeout(1200); await dismiss(page);
  await shot(page, '05-market-listings', { full: true });
  audits.push(['market', await auditImgs(page, 'market')]);

  /* The recipe book lives inside a skill panel, not on a tab of its own. */
  await go(page, 'skills');
  await shot(page, '06-skill-nodes-woodcutting', { full: true });
  audits.push(['skill nodes', await auditImgs(page, 'skill-nodes')]);

  /* The Recipe Book is a BUTTON on the Skills tab, not a tab and not
     `openSkill()` — that call left Woodcutting selected and the first pass
     photographed the wrong screen while reporting success. Click the real
     control and assert it opened before believing the capture. */
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, .btn, a')].find((n) => /recipe book/i.test(n.textContent || ''));
    if (!b) return false; b.click(); return true;
  });
  /* NO dismiss() here: the Recipe Book opens as a full-screen overlay, and
     dismiss() removes any large overlay on sight — the first two passes
     clicked the button, deleted the result, and photographed the Woodcutting
     panel underneath while reporting "found: true". */
  await page.waitForTimeout(1800);
  const shown = await page.evaluate(() => {
    const t = (document.body.innerText || '');
    return /recipe/i.test(t) && document.querySelectorAll('img[src*="hearthfire"]').length;
  });
  console.log('  recipe-book control found: ' + opened + ', hearthfire imgs on screen: ' + shown);
  await shot(page, '06b-recipe-book', { full: true });
  audits.push(['recipe book', await auditImgs(page, 'recipe-book')]);
  await ctx.close();
}

// ── DESKTOP, cozy-light (retired secondary — theme-leak check) ─────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900, theme: 'cozy-light', tag: 'desktop-cozy-light' });
  await seed(page);
  await go(page, 'inventory');
  await shot(page, '07-inventory-cozy-light', { full: true });
  audits.push(['inventory/cozy-light', await auditImgs(page, 'inventory-cozy')]);
  await ctx.close();
}

// ── MOBILE LANDSCAPE 922x423 (paione's Ulefone — scaled-desktop layout) ─
{
  const { ctx, page } = await boot({ width: 922, height: 423, tag: 'mobile-landscape' });
  await seed(page);
  await go(page, 'inventory');
  await shot(page, '08-mobile-landscape-inventory');
  audits.push(['inventory/mobile-landscape', await auditImgs(page, 'mobile')]);
  await ctx.close();
}

await browser.close();
s.close();

const NL = String.fromCharCode(10);
console.log(NL + '── VERDICT ──');
console.log('404 / failed requests: ' + missing.size + (missing.size ? NL + '  ' + [...missing].join(NL + '  ') : ''));
console.log('console errors: ' + consoleErrors.length + (consoleErrors.length ? NL + '  ' + consoleErrors.slice(0, 10).join(NL + '  ') : ''));
const broken = audits.reduce((a, [, r]) => a + r.broken.length, 0);
const hf = audits.reduce((a, [, r]) => a + r.hearthfire, 0);
console.log(`broken <img> across ${audits.length} surfaces: ${broken};  hearthfire icons rendered: ${hf}`);
process.exit(missing.size || consoleErrors.length || broken ? 1 : 0);
