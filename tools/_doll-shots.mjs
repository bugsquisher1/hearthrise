/** Equipment paper-doll visual pass. Boots index.html headless behind
 *  __HR_TEST_HARNESS__ from a server rooted in THIS checkout, seeds a save with
 *  a filled sword + helmet (+ more), and photographs the doll on Inventory,
 *  Character and Combat at 1440x900 and 922x423 in hearthlight.
 *  Descends from tools/_home-banner-shots.mjs. */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = process.argv[2];
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
const report = {};

async function boot({ width, height, tag }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
  page.on('requestfailed', (r) => missing.add('FAILED ' + new URL(r.url()).pathname));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 240)}`));
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
    try { localStorage.setItem('hearthrise:inventory-mobile-subtab', 'equip'); } catch (e) {}
    window._charPane = 'equip';
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G, null, { timeout: 30000 });
  await page.waitForTimeout(2400);
  return { ctx, page };
}

/** Equip a real weapon + helmet (+ a few others) so FILLED slots are photographed. */
async function seed(page) {
  return page.evaluate(() => {
    const G = window.G;
    G.gold = 250000;
    try { Object.keys(G.skills || {}).forEach((k) => { G.skills[k].level = 55; G.skills[k].xp = 300000; }); } catch (e) {}
    const ITEMS = window.ITEMS || {};
    const path = window._itemPath || {};
    // pick real ids that HAVE art so a filled slot genuinely paints
    const pick = (slot) => Object.keys(ITEMS).find((id) => ITEMS[id] && ITEMS[id].slot === slot && path[id]);
    G.equipment = G.equipment || {};
    const chosen = {};
    ['weapon','helmet','body','pants','boots','gloves','cape','necklace','shield','ammo','ring1','ring2','belt','earrings'].forEach((s) => {
      const id = pick(s) || (s === 'ring2' ? pick('ring1') : null) || (s === 'ring1' ? pick('ring') : null);
      if (id) { G.equipment[s] = id; chosen[s] = id; }
    });
    // Tyler's exact ask: a sword + a helmet must paint art.
    if (ITEMS.bronze_sword && path.bronze_sword) { G.equipment.weapon = 'bronze_sword'; chosen.weapon = 'bronze_sword'; }
    if (ITEMS.bronze_helmet && path.bronze_helmet) { G.equipment.helmet = 'bronze_helmet'; chosen.helmet = 'bronze_helmet'; }
    try { window.refreshAll && window.refreshAll(); } catch (e) {}
    return chosen;
  });
}

/** Deliberately leave some slots EMPTY so the faint glyph state is photographed too. */
async function halfSeed(page) {
  return page.evaluate(() => {
    const G = window.G;
    ['cape','necklace','ammo','ring2','belt','earrings','gloves'].forEach((s) => { delete G.equipment[s]; });
    try { window.refreshAll && window.refreshAll(); } catch (e) {}
    return Object.keys(G.equipment);
  });
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch (e) {} }, tab);
  await page.waitForTimeout(1000);
}

async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.modal, .modal-backdrop, .overlay, .inv-detail, [class*="daily"], [class*="ftue"], #hr-welcome-modal, #hr-post-signup-modal, .hr-dl-scrim').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < 10000) return;
        el.remove(); n++;
      });
      return n;
    });
    if (!n) break;
    await page.waitForTimeout(250);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

async function shot(page, name, full) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: !!full });
  console.log('  shot -> ' + name + '.png');
}

/** Clip just the doll, at 2x, so slot order/labels can actually be READ.
 *  Picks the VISIBLE doll — several mounts exist in the DOM at once. */
async function clipDoll(page, name, sel) {
  try {
    const handles = await page.$$(sel);
    for (const el of handles) {
      const box = await el.boundingBox();
      if (box && box.width > 8 && box.height > 8) {
        await el.screenshot({ path: join(OUT, name + '.png') });
        console.log('  clip -> ' + name + '.png  (' + Math.round(box.width) + 'x' + Math.round(box.height) + ')');
        return box;
      }
    }
    console.log('  (no visible ' + sel + ' for ' + name + ')');
    return null;
  } catch (e) { console.log('  clip failed ' + name + ': ' + e.message); return null; }
}

/** Geometry probe — which slot is in which grid cell, and does anything overflow. */
async function probe(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    function readGrid(dollSel, slotSel, nameAttr) {
      const doll = [...document.querySelectorAll(dollSel)].find(vis);
      if (!doll) return null;
      const dr = doll.getBoundingClientRect();
      const cs = getComputedStyle(doll);
      const slots = [...doll.querySelectorAll(slotSel)].map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const name = nameAttr === 'class'
          ? ([...el.classList].find((c) => c.startsWith('td-') && c !== 'td-slot' && c !== 'td-companion-slot') || '').replace(/^td-/, '')
          : (el.getAttribute('data-slot') || '');
        const img = el.querySelector('img');
        const lbl = el.querySelector('.td-slot-lbl, em');
        return {
          slot: name,
          col: s.gridColumnStart, row: s.gridRowStart,
          x: Math.round(r.x - dr.x), y: Math.round(r.y - dr.y),
          w: Math.round(r.width), h: Math.round(r.height),
          empty: el.classList.contains('empty') || el.classList.contains('is-empty'),
          imgOk: img ? (img.naturalWidth > 0) : null,
          lblShown: lbl ? getComputedStyle(lbl).display !== 'none' : null,
          title: el.title,
        };
      });
      return {
        box: { w: Math.round(dr.width), h: Math.round(dr.height), bottom: Math.round(dr.bottom), right: Math.round(dr.right) },
        cols: cs.gridTemplateColumns, rows: cs.gridTemplateRows, slots,
      };
    }
    const totals = document.getElementById('fsm-totals');
    return {
      viewport: { w: innerWidth, h: innerHeight },
      scrollOverflow: document.documentElement.scrollWidth - innerWidth,
      td: readGrid('.td-doll', '.td-slot', 'class'),
      fsm: readGrid('.fsm-doll', '.fsm-slot', 'data'),
      fsmTotals: totals ? totals.textContent : null,
    };
  });
}

for (const vp of [{ w: 1440, h: 900, t: 'desktop' }, { w: 922, h: 423, t: 'landscape' }]) {
  const { ctx, page } = await boot({ width: vp.w, height: vp.h, tag: vp.t });
  console.log(vp.t + ' seeded:', JSON.stringify(await seed(page)));
  for (const [tab, label] of [['inventory', 'inv'], ['character', 'char'], ['combat', 'combat']]) {
    await go(page, tab); await dismiss(page); await go(page, tab);
    if (tab === 'character') {
      await page.evaluate(() => {
        window._charPane = 'equip';
        try { (window.renderCharacter || function () {})(); } catch (e) {}
      });
      await page.waitForTimeout(800);
    }
    if (tab === 'inventory') {
      await page.evaluate(() => {
        const p = document.getElementById('panel-inventory');
        if (p && getComputedStyle(document.querySelector('.inv-mob-tabs') || document.body).display !== 'none') {
          const b = document.querySelector('.imt-btn[data-sub="equip"]'); if (b) b.click();
        }
      });
      await page.waitForTimeout(700);
    }
    if (tab === 'combat') {
      // The loadout rail lives on the FIGHT screen — open a preview.
      await page.evaluate(() => {
        const CS = window.HearthriseCombatScreens;
        const M = window.MONSTERS || {};
        const id = Object.keys(M)[0];
        if (CS && typeof CS.preview === 'function' && id) CS.preview(id);
      });
      await page.waitForTimeout(1200);
    }
    await shot(page, `${label}-${vp.t}`);
    await clipDoll(page, `${label}-doll-${vp.t}`, tab === 'combat' ? '.fs-manage' : '.td-wrap');
    report[`${label}-${vp.t}`] = await probe(page);
  }
  // half-empty state on Inventory (glyph read)
  await go(page, 'inventory'); await dismiss(page);
  console.log('  half-seed keeps:', JSON.stringify(await halfSeed(page)));
  await go(page, 'inventory');
  await page.evaluate(() => { const b = document.querySelector('.imt-btn[data-sub="equip"]'); if (b && b.offsetParent) b.click(); });
  await page.waitForTimeout(700);
  await shot(page, `inv-half-${vp.t}`);
  await clipDoll(page, `inv-half-doll-${vp.t}`, '.td-wrap');
  report[`inv-half-${vp.t}`] = await probe(page);

  /* REACHABILITY: the six-row doll is taller than a 423px fold, so prove the
     bottom rows can actually be brought on screen and hit-tested. */
  await seed(page);
  await go(page, 'inventory');
  report[`reach-${vp.t}`] = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const col = [...document.querySelectorAll('.invc-equip-col')].find(vis);
    if (!col) return { error: 'no .invc-equip-col' };
    col.scrollTop = col.scrollHeight;
    const out = { overflowY: getComputedStyle(col).overflowY, scrollH: col.scrollHeight, clientH: col.clientHeight, scrollTop: col.scrollTop, slots: {} };
    ['boots', 'ring1', 'ring2', 'earrings'].forEach((s) => {
      const el = document.querySelector('.invc-equip-col .td-' + s);
      if (!el) { out.slots[s] = 'missing'; return; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out.slots[s] = {
        y: Math.round(r.y), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight,
        hit: hit ? (hit.closest('.td-slot') ? (hit.closest('.td-slot').className.match(/td-(?!slot)[a-z0-9]+/) || [''])[0] : hit.tagName + '.' + hit.className) : null,
      };
    });
    return out;
  });
  await shot(page, `inv-scrolled-${vp.t}`);
  await ctx.close();
}

await writeFile(join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
console.log('\n404s:', missing.size ? [...missing].join(', ') : 'none');
console.log('console errors:', consoleErrors.length ? '\n  ' + consoleErrors.join('\n  ') : 'none');
await browser.close();
s.close();
