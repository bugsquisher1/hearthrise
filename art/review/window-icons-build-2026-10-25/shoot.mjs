// Build shots for lane/b-window-icon-size: the real client on the window tests' fake server,
// before (origin/main's copy of each touched file, saved flat in BEFORE_DIR) vs after (this worktree).
// Run: BEFORE_DIR=<dir> node art/review/window-icons-build-2026-10-25/shoot.mjs <worktree> <out-dir> [before,after] [sizes]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const WT = process.argv[2];
const OUT = process.argv[3];
const only = process.argv[4] ? process.argv[4].split(',') : null;
const h = await import(pathToFileURL(join(WT, 'tests/_client-harness.mjs')).href);
const { leaseBrowser } = await import(pathToFileURL(join(WT, 'tests/_chrome.mjs')).href);
const FIX = JSON.parse(readFileSync(join(WT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const IDS = readdirSync(join(WT, 'assets/icons-bundle/pixel/items')).map((f) => f.replace(/.png$/, ''));
const clone = (o) => JSON.parse(JSON.stringify(o));
mkdirSync(OUT, { recursive: true });

/* The QA hero's shape: a working bag (~44 stacks of a 60 cap) and a well-used depot (~90 stacks). */
const env = clone(FIX);
env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null, bank_cap: 60 });
delete env.hunt; delete env.hunt_analyzer; delete env.hunt_track; delete env.hunt_events;
const pick = (from, n, skip) => IDS.filter((_, i) => i % skip === from).slice(0, n);
for (const id of pick(1, 27, 7)) if (!env.inventory[id]) env.inventory[id] = 1 + (id.length * 7) % 60;
env.bank = {};
for (const id of pick(3, 90, 5)) env.bank[id] = 1 + (id.length * 13) % 240;
const GEAR = ['bronze_sword','iron_sword','steel_sword','bronze_helm','iron_helm','steel_helm','bronze_platebody','bronze_platelegs','bronze_rimmed_shield','ironbound_shield','bronze_axe','iron_axe','bronze_pickaxe','iron_pickaxe'];
env.shop = Object.assign({}, env.shop, { offers: GEAR.map((id, i) => ({ offer: 'gear.' + id, item: id, kind: /axe|pickaxe/.test(id) ? 'tool' : 'gear', price: 40 + i * 35 })), bids: Object.fromEntries(Object.keys(env.inventory).map((id, i) => [id, 2 + i])) });
env.depot = { used: 90, cap: 120, next: { name: 'Oak chest', stacks: 40 } };

const ALL = '.hs-win-coach { display: none !important; }';
const TOUCHED = ['src/styles/windows.css', 'src/data/shell-windows.js'];
const withAll = (f, s) => (f.endsWith('.css') ? s + '\n' + ALL : s);
const BEFORE = process.env.BEFORE_DIR || '';
const OPTS = {
  before: Object.fromEntries(TOUCHED.filter((f) => existsSync(join(BEFORE, f.split('/').pop()))).map((f) => [f, withAll(f, readFileSync(join(BEFORE, f.split('/').pop()), 'utf8'))])),
  after: Object.fromEntries(TOUCHED.map((f) => [f, withAll(f, readFileSync(join(WT, f), 'utf8'))])),
};
const SIZES = [['1440x900', 1440, 900, 1], ['1920x1080', 1920, 1080, 1], ['844x390', 844, 390, 1], ['1440x900-dpr150', 1440, 900, 1.5]];

const browser = await leaseBrowser(chromium);
const metrics = [];
for (const [opt, add] of Object.entries(OPTS)) {
  if (only && !only.includes(opt)) continue;
  const { server, port } = await h.serve(add);
  const base = 'http://127.0.0.1:' + port;
  const sizeOnly = process.argv[5] ? process.argv[5].split(',') : null;
  for (const [tag, w, ht, dpr] of SIZES) {
    if (sizeOnly && !sizeOnly.includes(tag)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: ht }, deviceScaleFactor: dpr, hasTouch: w < 900, isMobile: w < 900 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    let ver = 1;
    const next = () => Object.assign(clone(env), { version: ++ver, client_state: {} });
    await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: h.SDK_STUB }));
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
      const name = r.request().url().split('?')[0].split('/').pop();
      const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
      if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign({ ok: true, accrued: true }, next()));
      return json({ ok: true });
    });
    await page.goto(base + '/play.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('form[data-auth="sign-in"]');
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await page.waitForSelector('[data-app="play"][data-slot="0"]');
    await page.click('[data-app="play"][data-slot="0"]');
    await page.waitForSelector('.hs-launchers');
    await page.waitForTimeout(1200);
    const wins = [['b', 'inventory'], ['t', 'storage'], ['v', 'shop']];
    for (const [key, id] of wins) {
      if (dpr !== 1 && id !== 'inventory') continue;
      for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
        await page.keyboard.press('Escape'); await page.waitForTimeout(160);
      }
      if (w < 900) await page.click('.hs-launch[data-hs-open="' + id + '"]').catch(() => page.keyboard.press(key));
      else await page.keyboard.press(key);
      await page.waitForSelector('[data-hs-win="' + id + '"] [data-hs-built]').catch(() => {});
      await page.waitForTimeout(500);
      const tabs = id === 'shop' ? ['buy', 'sell', 'services'] : [null];
      for (const t of tabs) {
        if (t) { await page.click('[data-hs-win="shop"] .hw-tab[data-tab="' + t + '"]').catch(() => {}); await page.waitForTimeout(300); }
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-hs-win] img')).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
        await page.mouse.move(2, 600);
        await page.evaluate(() => document.querySelectorAll('[data-hs-win] .hs-win-body').forEach((b) => { b.scrollTop = 0; }));
        await page.waitForTimeout(300);
        const name = opt + '-' + tag + '-' + id + (t ? '-' + t : '');
        await page.screenshot({ path: join(OUT, name + '.png') });
        const m = await page.evaluate((wid) => {
          const win = document.querySelector('[data-hs-win="' + wid + '"]');
          if (!win) return null;
          const r = win.getBoundingClientRect();
          const box = (q) => { const e = Array.from(win.querySelectorAll(q)).find((x) => x.offsetParent); if (!e) return null; const b = e.getBoundingClientRect(); return [+b.width.toFixed(1), +b.height.toFixed(1)]; };
          const grids = Array.from(win.querySelectorAll('.hw-pockets')).filter((g) => g.offsetParent).map((g) => {
            const lis = Array.from(g.children).filter((c) => c.offsetParent);
            const top = lis.length ? lis[0].getBoundingClientRect().top : 0;
            return { n: lis.length, perRow: lis.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length, slot: lis.length ? lis[0].getBoundingClientRect().width : 0 };
          });
          const cnt = Array.from(win.querySelectorAll('.hw-count')).find((x) => x.offsetParent);
          const sc = Array.from(win.querySelectorAll('*')).filter((e) => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => ({ cls: e.className.toString().slice(0, 30), view: e.clientHeight, content: e.scrollHeight }));
          return { win: [Math.round(r.width), Math.round(r.height)], grids, pocketArt: box('.hw-pocket .hh-icon'), dollSlot: box('.hw-doll .hw-slot'), dollArt: box('.hw-doll .hw-slot .hh-icon'), line: box('.hw-line'), lineArt: box('.hw-line .hh-icon'), count: cnt ? getComputedStyle(cnt).fontSize : null, scroll: sc };
        }, id);
        metrics.push({ name, ...m });
      }
    }
    await ctx.close();
  }
  server.close();
}
await browser.close();
console.log(JSON.stringify(metrics, null, 0).replace(/\},\{"name"/g, '},\n{"name"'));
process.exit(0);
