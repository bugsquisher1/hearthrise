/** Emoji-as-icon sweep: boots index.html headless behind __HR_TEST_HARNESS__ from a
 *  server rooted in THIS checkout, seeds a mid-game save, opens the seven screens in
 *  scope (home / combat / inventory / skills / farm / quests / shop) at 1440x900 and
 *  922x423, photographs each, and AUDITS the rendered DOM for pictographic emoji
 *  standing where an icon belongs.
 *  Descends from tools/_doll-shots.mjs.
 *  usage: node tools/_emoji-shots.mjs <outdir> */
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
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
  page.on('requestfailed', (r) => missing.add('FAILED ' + new URL(r.url()).pathname));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${String(e).slice(0, 240)}`));
  await page.addInitScript(() => {
    window.__HR_TEST_HARNESS__ = true;
    try { localStorage.setItem('hearthrise:ftue:completed', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.G, null, { timeout: 30000 });
  await page.waitForTimeout(2400);
  return { ctx, page };
}

/** Mid-game save: gold, gems, every skill 55, one of every item in the bag,
 *  gear equipped, farm plots planted, so the dense screens actually render. */
async function seed(page) {
  return page.evaluate(() => {
    const G = window.G;
    G.gold = 4200000; G.gems = 900;
    try { Object.keys(G.skills || {}).forEach((k) => { G.skills[k].level = 55; G.skills[k].xp = 300000; }); } catch (e) {}
    const ITEMS = window.ITEMS || {};
    const path = window._itemPath || {};
    G.inventory = G.inventory || {};
    // Fill the bag with a broad slice INCLUDING ids with no painted art, so the
    // fallback path is the thing being photographed.
    const ids = Object.keys(ITEMS);
    const withArt = ids.filter((id) => path[id]).slice(0, 40);
    const noArt = ids.filter((id) => !path[id]).slice(0, 40);
    [...withArt, ...noArt].forEach((id) => { G.inventory[id] = (G.inventory[id] || 0) + 5; });
    const pick = (slot) => ids.find((id) => ITEMS[id] && ITEMS[id].slot === slot);
    G.equipment = G.equipment || {};
    ['weapon','helmet','body','pants','boots','gloves','cape','necklace','shield','ammo','ring1','ring2','belt','earrings'].forEach((s) => {
      const id = pick(s); if (id) G.equipment[s] = id;
    });
    // farm: plant everything plantable
    try {
      (G.plots || []).forEach((p, i) => {
        if (!p) return;
        const crops = Object.keys(window.CROPS || {});
        if (crops.length) { p.crop = crops[i % crops.length]; p.plantedAt = Date.now() - 1000; p.stage = 1; }
      });
    } catch (e) {}
    try { window.refreshAll && window.refreshAll(); } catch (e) {}
    return { inv: Object.keys(G.inventory).length, noArt: noArt.length };
  });
}

async function go(page, tab) {
  await page.evaluate((t) => { try { window.showTab && window.showTab(t); } catch (e) {} }, tab);
  await page.waitForTimeout(900);
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

/** THE AUDIT. Walk visible text nodes of the whole app shell and report every
 *  pictographic emoji, with the chain of ancestors so a structural site (an icon
 *  slot) can be told apart from a decorative one (inside a sentence). */
async function audit(page) {
  return page.evaluate(() => {
    const RE = /\p{Extended_Pictographic}/u;
    const hits = [];
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue || '';
      if (!RE.test(t)) continue;
      const el = n.parentElement;
      if (!el) continue;
      if (el.closest('#smoke-test-panel, .hr-test, script, style')) continue;
      if (!vis(el)) continue;
      const sel = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
      const chain = [];
      let p = el;
      for (let i = 0; i < 4 && p && p !== document.body; i++) { chain.unshift(sel(p)); p = p.parentElement; }
      const stripped = t.replace(/\p{Extended_Pictographic}️?/gu, '').trim();
      hits.push({
        chain: chain.join(' > '),
        text: t.trim().slice(0, 80),
        // STRUCTURAL = the emoji is the whole content of its element (it IS the icon).
        structural: stripped.length === 0,
        panel: (el.closest('[id^="panel-"]') || {}).id || (el.closest('.topbar') ? 'topbar' : (el.closest('#bottom-nav, .sidebar') ? 'nav' : 'shell')),
      });
    }
    return hits;
  });
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('  shot -> ' + name + '.png');
}

const TABS = [
  ['profile', 'home'],
  ['combat', 'combat'],
  ['inventory', 'inventory'],
  ['skills', 'skills'],
  ['farming', 'farm'],
  ['shops', 'shop'],
  ['character', 'character'],
  ['bounty', 'bounty'],
  ['events', 'events'],
  ['house', 'house'],
  ['stable', 'stable'],
  ['clan', 'clan'],
  ['social', 'social'],
];

/** Modals + sub-views that the tab sweep cannot reach. Each entry runs in-page. */
const MODALS = [
  ['quests', () => { (window.openQuestsModal || window.openQuests || function () {})(); }],
  ['more', () => { (window.openMoreModal || function () {})(); }],
  ['recipe-book', () => { window.showTab && window.showTab('skills'); (window.openRecipeBook || function () {})(); }],
  ['collection-log', () => { window.HearthriseCollection && window.HearthriseCollection.open(); }],
  ['bestiary', () => { (window.openBestiary || function () {})(); }],
  ['achievements', () => { (window.openAchievements || function () {})(); }],
  ['lifetime-stats', () => { (window.openLifetimeStats || function () {})(); }],
  ['equip-bonuses', () => { (window.openEquipmentBonuses || function () {})(); }],
  ['objectives', () => { (window.openObjectivesPopout || function () {})(); }],
  ['quartermaster', () => { (window.openQuartermaster || function () {})(); }],
  ['settings', () => { (window.openSettings || function () {})(); }],
  ['skill-detail', () => { window.showTab && window.showTab('skills'); (window.openSkillDetail || function () {})('runecrafting'); }],
  ['inv-detail', () => {
    window.showTab && window.showTab('inventory');
    const id = Object.keys(window.G.inventory || {})[0];
    (window.openInvDetail || function () {})(id);
  }],
  ['item-detail', () => {
    const id = Object.keys(window.G.inventory || {})[0];
    (window.onItemTap || window.openItemDetail || function () {})(id);
  }],
  ['equip-totals', () => { (window.openEquipmentTotals || window.showEquipmentTotals || function () {})(); }],
  ['bank', () => { (window.openBankModal || function () {})(); }],
  ['dungeons', () => { window.showTab && window.showTab('more'); (window.openDungeons || function () {})(); }],
  /* The FIGHT screen, actually fighting — the densest surface in the game and
     the one the release visual gate names. Picks a monster with NO painted art
     when one exists, so the FALLBACK portrait is what gets photographed. */
  ['fight', () => {
    const M = window.MONSTERS || {}, art = window._monsterIcon || {};
    const id = Object.keys(M).find((k) => !art[k]) || Object.keys(M)[0];
    window.showTab && window.showTab('combat');
    if (window.startCombat) window.startCombat(id);
    const CS = window.HearthriseCombatScreens;
    if (CS && CS.preview) CS.preview(id);
  }],
  /* Gathering in progress — the activity bar + the Character "active" card,
     both of which used to draw the node's emoji. */
  ['gathering', () => {
    window.showTab && window.showTab('skills');
    if (window.startSkill) window.startSkill('woodcutting', 'normal_tree', 4600);
    window.showTab && window.showTab('character');
  }],
];

for (const vp of [{ w: 1440, h: 900, t: 'desktop' }, { w: 922, h: 423, t: 'landscape' }]) {
  const { ctx, page } = await boot({ width: vp.w, height: vp.h, tag: vp.t });
  console.log(vp.t + ' seeded:', JSON.stringify(await seed(page)));
  await dismiss(page);
  for (const [tab, label] of TABS) {
    await go(page, tab); await dismiss(page); await go(page, tab);
    await shot(page, `${label}-${vp.t}`);
    report[`${label}-${vp.t}`] = await audit(page);
  }
  for (const [label, fn] of MODALS) {
    // Hard-close everything the previous step opened — modals here are appended
    // to <body> and do not close each other, so without this the captures stack.
    await page.evaluate(() => {
      // Static markup (index.html) is only ever HIDDEN — removing it takes
      // #settings-modal and friends out of the document and showTab throws.
      document.querySelectorAll('.modal').forEach((m) => m.classList.remove('show'));
      // Dynamically-appended overlays are removed; they are rebuilt on open.
      document.querySelectorAll('#quests-modal-overlay, #ach-overlay, #bestiary-overlay, .hr-cl-scrim, .scv-scrim, .drm-scrim, #scv-modal, #buy-modal')
        .forEach((el) => { try { el.remove(); } catch (e) {} });
    });
    await go(page, 'profile'); await dismiss(page);
    await page.evaluate(`(${fn.toString()})()`).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, `${label}-${vp.t}`);
    report[`${label}-${vp.t}`] = await audit(page);
    await page.keyboard.press('Escape').catch(() => {});
  }
  await ctx.close();
}

await writeFile(join(OUT, 'audit.json'), JSON.stringify(report, null, 2));
const flat = Object.entries(report).flatMap(([k, v]) => v.map((h) => ({ screen: k, ...h })));
const struct = flat.filter((h) => h.structural);
console.log('\n=== AUDIT ===');
console.log('emoji-bearing visible text nodes:', flat.length, ' STRUCTURAL (emoji IS the icon):', struct.length);
const byScreen = {};
struct.forEach((h) => byScreen[h.screen] = (byScreen[h.screen] || 0) + 1);
console.log(Object.entries(byScreen).map(([k, v]) => '  ' + v + '  ' + k).join('\n'));
console.log('\n--- structural sites ---');
const seen = new Set();
struct.forEach((h) => { const k = h.chain + '|' + h.text; if (seen.has(k)) return; seen.add(k); console.log(`  [${h.panel}] ${h.text}   <<  ${h.chain}`); });
console.log('\n--- decorative (emoji inside a sentence) ---');
const seen2 = new Set();
flat.filter((h) => !h.structural).forEach((h) => { const k = h.chain + '|' + h.text; if (seen2.has(k)) return; seen2.add(k); console.log(`  [${h.panel}] ${h.text}   <<  ${h.chain}`); });
console.log('\n404s:', missing.size ? [...missing].join(', ') : 'none');
console.log('console errors:', consoleErrors.length ? '\n  ' + consoleErrors.join('\n  ') : 'none');
await browser.close();
s.close();
