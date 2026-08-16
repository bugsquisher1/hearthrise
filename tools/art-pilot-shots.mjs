/** Hearthfire art pilot — in-game screenshot harness.
 *  Boots the real index.html headless behind __HR_TEST_HARNESS__, seeds a save
 *  that owns the pilot items, and captures the surfaces that actually render
 *  item + monster art. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT  = process.argv[2];
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };

function serve(){ return new Promise((res)=>{ const s=createServer(async(rq,rs)=>{ try{ const u=decodeURIComponent((rq.url||'/').split('?')[0]); let f=normalize(join(ROOT, u==='/'?'/index.html':u)); if(!f.startsWith(ROOT)){rs.writeHead(403).end();return;} const i=await stat(f).catch(()=>null); if(i?.isDirectory()) f=join(f,'index.html'); const b=await readFile(f); rs.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}).end(b);}catch{rs.writeHead(404).end();} }); s.listen(0,'127.0.0.1',()=>res({s,port:s.address().port})); }); }

const { s, port } = await serve();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function boot({ width, height, theme }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    // The first-time-user tour dims the whole screen — useless for an art review.
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G && !!window._itemPath, null, { timeout: 30000 });
  await page.waitForTimeout(2500);   // let the deferred icon remap + refreshAll run
  if (theme) await page.evaluate((t) => { try { window.applyTheme && window.applyTheme(t); } catch(e){} document.body.setAttribute('data-theme', t); }, theme);
  return { ctx, page };
}

const PILOT_ITEMS = ['iron_ore','bronze_sword','iron_sword','iron_platebody','leather_body','cooked_shrimp','wheat_bread'];

async function seed(page) {
  return page.evaluate((ids) => {
    const G = window.G;
    G.gold = 250000;
    // A believable mixed bag: the pilot items sitting NEXT TO the old painted set,
    // which is the whole point — the shelf has to look like one game.
    const neighbours = ['copper_ore','coal','iron_bar','steel_bar','normal_log','yew_log',
      'steel_sword','rune_sword','iron_helm','steel_platebody','leather_gloves','bronze_belt',
      'copper_ring','hunter_necklace','cooked_trout','cooked_lobster','carrot','pumpkin',
      'bones','ruby','wolf_pelt','slime_gel','bat_wing','dragon_scale','magic_essence'];
    ids.concat(neighbours).forEach((id, i) => { G.inventory[id] = 1 + ((i * 7) % 40); });
    try { G.equipment = G.equipment || {}; G.equipment.weapon='iron_sword'; G.equipment.body='iron_platebody'; } catch(e){}
    // unlock the monsters we parked pilot art on
    try { ['attack','strength','defense','hitpoints','ranged','magic','mining','woodcutting','cooking','smithing','crafting','fishing','farming']
      .forEach(k => { if (G.skills && G.skills[k]) { G.skills[k].level = 60; G.skills[k].xp = 273742; } }); } catch(e){}
    return { items: Object.keys(G.inventory).length, gold: G.gold };
  }, PILOT_ITEMS);
}

/* The daily-reward / FTUE / offline-summary modals all dim the screen, which
   makes an art review impossible. Close whatever is open. */
async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    const closed = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, [class*="daily"], [class*="ftue"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;              // not a full-screen blocker
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

/** Crop to a live element so the art can be judged at the size it renders. */
async function crop(page, selector, name, pad = 16) {
  const box = await page.evaluate(({ sel, pad }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad*2, height: r.height + pad*2 };
  }, { sel: selector, pad });
  if (!box || box.width < 8) { console.log('  crop MISS ' + selector); return false; }
  await page.screenshot({ path: join(OUT, name + '.png'), clip: box });
  console.log('  crop → ' + name + '.png  (' + selector + ')');
  return true;
}

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait || 900);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: !!opts.full });
  console.log('  shot → ' + name + '.png');
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch(e){} }, tab);
  await page.waitForTimeout(1200);
  await dismiss(page);
}

async function fight(page, id) {
  // Keep the champion alive — a dead player drops the arena back to "Choose a foe"
  // and there is no portrait to photograph.
  await page.evaluate((m) => {
    window.G.playerMaxHp = 9990; window.G.playerHp = 9990;
    try { window.startCombat && window.startCombat(m); } catch(e){}
  }, id);
  await page.waitForTimeout(1600);
  await page.evaluate(() => { window.G.playerHp = window.G.playerMaxHp; });
}

// ── DESKTOP, hearthlight (default dark) ────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 });
  console.log('desktop/hearthlight:', JSON.stringify(await seed(page)));

  await go(page, 'inventory');
  await shot(page, '01-inventory-grid');
  // The grid at 1:1 — this is the shelf test: do the pilot icons sit on the
  // same shelf as the old painted set, or do they look pasted in?
  await crop(page, '.inv-grid, #inv-grid, .inventory-grid, .inv-cells', '01b-inventory-grid-closeup', 8);

  // Item detail modal — the LARGEST item render in the game (64 px box).
  await page.evaluate(() => {
    const n = document.querySelector('[data-id="iron_platebody"]');
    if (n) n.click();
  });
  await page.waitForTimeout(900);
  await shot(page, '02-item-detail-iron-platebody');
  await page.keyboard.press('Escape');
  await dismiss(page);

  await go(page, 'combat');
  await shot(page, '03-combat-monster-list');
  await crop(page, '.card-body:has(.monster-row)', '03b-monster-list-closeup', 8);

  for (const [id, label] of [['bear','elk-king'], ['wraith','grim-reaper'], ['lesser_demon','hellhound'], ['dire_wolf','winter-wolf'], ['rat','barn-rat']]) {
    await fight(page, id);
    await dismiss(page);
    await shot(page, '04-arena-' + label);
    await crop(page, '.arena-vs', '04b-arena-' + label + '-closeup', 8);
  }
  await page.evaluate(() => { try { window.stopCombat && window.stopCombat(); } catch(e){} });

  await go(page, 'shops');
  await shot(page, '05-shops');
  await go(page, 'bounty');
  await shot(page, '06-bounty-board');
  await go(page, 'character');
  await shot(page, '07-character-equipment');
  await ctx.close();
}

// ── DESKTOP, cozy-light (retired secondary theme — leak check) ─────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900, theme: 'cozy-light' });
  await seed(page);
  await go(page, 'inventory');
  await shot(page, '08-inventory-cozy-light');
  await ctx.close();
}

// ── MOBILE LANDSCAPE 922×423 (paione's Ulefone — scaled-desktop layout) ─
{
  const { ctx, page } = await boot({ width: 922, height: 423 });
  await seed(page);
  await go(page, 'inventory');
  await shot(page, '09-mobile-landscape-inventory');
  await go(page, 'combat');
  await fight(page, 'dire_wolf');
  await shot(page, '10-mobile-landscape-arena');
  await ctx.close();
}

await browser.close();
s.close();
