#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows.mjs — THE ALPHA WINDOWS' RULES, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows.mjs                the rules
//   node tests/alpha-windows.mjs --mutate       every planted defect must turn a rule RED
//   node tests/alpha-windows.mjs --shots <dir>  also write the visual-gate screenshots
//                                               (1440x900 and 922x423)
//
// mutant-anchors: src/shell/widgets/amount.js src/shell/windows/inventory/bury.js src/shell/windows/inventory/state.js src/shell/windows/float-menu.js src/shell/bag-model.js src/session/item-sections.js src/shell/windows/inventory/grid.js src/shell/windows/inventory/actions.js src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/session/edge-intents.js src/world/world-boot.js src/world/core/camera.js src/shell/windows/hunts.js src/shell/windows/storage.js src/shell/hunt-list.js src/shell/windows/skills.js src/shell/launcher.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character's envelope is tests/fixtures/alpha-envelope.json.
//   AW-0  PURE: every SKILLS_DEF skill has a guide row; edgeBody refuses a price
//         field and an unknown verb; a bulk-sale plan never names a locked stack
//   AW-1  Hunts, Inventory, Character, Gathering and crafting, Storage, Shop and Hunt prep open from
//         their keys and the launcher row, with zero console errors
//   AW-2  PATCH IN PLACE: a new envelope changes a pocket's count on the SAME node,
//         and an idle display tick writes nothing to the bag
//   AW-3  SERVER COUNT WINS: the bag shows exactly the envelope's inventory — a
//         stack the server dropped is gone, a lowered count is lowered (replaced,
//         never merged upward); a stack that grew carries the "new" mark, one that
//         shrank does not
//   AW-4  INTENT-ONLY: Equip sends ONE `equip` intent naming the slot and item, the
//         primary goes off at once, and the doll keeps the server's weapon until
//         the re-read envelope says otherwise
//   AW-5  LOCK PROTECTS FROM BULK SELL: "Sell junk" over stacks that include a
//         locked one confirms with the locked stack kept, and the ONE
//         vendor_sell_many it sends never names it
//   AW-6  A SALE SHOWS ITS TOTAL FIRST: nothing is sent until the confirmation
//         (which carries the total at the server's bids) is accepted
//   AW-7  ONE-TAP REFILL: the button shows the server's quoted total before it is
//         pressed; one press sends exactly ONE hr_shop_refill carrying that total
//         and no purchase of its own
//   AW-8  HUNT PREP: the readiness line names this character's shortages from the
//         server's bag and targets; Use sends ONE hr_hunt_preset_apply
//   AW-9  FAIL SAFE: with no bag_rules and no shop section, lock, the loot rules,
//         sell junk and the refill stay off and the bag value reads a dash
//   AW-10 a food stack dragged onto a bar slot is ONE hr_action_set_options with
//         the whole bar restated and the item in that slot
//   AW-11 the bag's keys: an arrow moves the cursor, L locks that stack with ONE
//         hr_item_lock, Space selects it
// Tyler's first live playtest (2026-10-18), in town (a read-only hook puts the World
// pane's runtime on window.__world for its stats() and screenOf()):
//   AW-12 with the Inventory open and a stack focused, D walks the hero; typing in
//         the item search does not (only a text field takes the walk keys)
//   AW-13 presses on the docked Inventory never move the hero; a press on open map does
//   AW-14 going hunting is two presses from town: the mill hatch opens Hunts on the
//         Mill Cellar, Enter is ONE hr_hunt_enter carrying names and counts (the bag
//         up to its restock targets); the foot shows the spaces and the gold
//   AW-15 one Inventory: no Gear, Bag or Find window; the item search is only in
//         Inventory and Storage
//   AW-16 no void: with a window docked the whole town view stays on the map; a
//         Storage press from town moves the whole stack with ONE hr_bank_move
//   AW-18 AMOUNTS (Tyler live 10-18, "it's all or nothing"): in Storage a press
//         moves ONE, Shift-press the whole stack, and a right-click asks how many
//         (Enter confirms); each is ONE hr_bank_move naming exactly that count, and
//         store 3 of 10 reads bag 7 / storage 3 from the envelope, before and after a reload
//   AW-19 BURY (Tyler live 10-18, "can't bury bones"): bones offer Bury all; it is
//         ONE set_activity { kind:'artisan', id:'bury_bones' } and nothing else, the
//         Burying line reads the server's pointer, Stop is ONE set_activity idle, and
//         the bag and the Prayer XP change only from the envelope (and stay after a reload)
//   AW-17 the skills are two ledgers (the combat one inside the Character window,
//         tests/character-window.mjs) and Gathering and crafting does not scroll at
//         922x423; a character that has never fought sees the pointer to Hunts
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The town the playtest checks walk (its size and the mill hatch, from the map row itself). */
const TOWN_ROW = (await import(pathToFileURL(join(ROOT, 'src/data/world/maps/town_common.js')).href)).default;
const TOWN = { w: TOWN_ROW.rows[0].length, h: TOWN_ROW.rows.length, hatch: [TOWN_ROW.exits[0].x, TOWN_ROW.exits[0].y] };
/* A read-only test hook: the World pane's runtime (its stats() and screenOf()) on window.__world. */
const PANE = 'src/app/world-pane.js';
const PANE_SRC = await readFile(join(ROOT, PANE), 'utf8');
if (!PANE_SRC.includes('    runtime.sync();\n')) throw new Error('alpha-windows: the world-pane hook anchor moved');
const HOOK = { [PANE]: PANE_SRC.replace('    runtime.sync();\n', '    runtime.sync();\n    window.__world = runtime;\n') };
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ITEM_RPCS = ['hr_item_lock', 'hr_loot_rule_set', 'hr_restock_set', 'hr_shop_refill', 'hr_hunt_preset_save', 'hr_hunt_preset_apply', 'hr_action_set_options', 'hr_hunt_enter', 'hr_bank_move'];
/* The windows a player opens from the launcher row, with their keys (src/data/shell-windows.js). */
const WINDOWS = [['h', 'hunts'], ['b', 'inventory'], ['c', 'character'], ['g', 'skills-trade'], ['t', 'storage'], ['v', 'shop'], ['p', 'hunt-prep']];

function scripted() {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(FIXTURE), version: 1, calls: [], delayMs: 300, reply: { ok: true }, residue: {} };
  s.next = () => Object.assign(clone(s.env), { version: ++s.version, client_state: clone(s.residue) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    if (s.onCall) s.onCall(name, body);
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') {
      if (body.verb) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(Object.assign({ ok: true, accrued: true }, s.next())); }
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (ITEM_RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(s.reply); }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_account_items') return json({ ok: true, rows: [{ slot: 1, name: 'Druid', item: 'rat_tail', qty: 4, where: 'bank' }] });
    return json({ ok: true });
  });
}

/* A reload: the stub keeps the session, so the page comes back to the character (or its picker). */
async function reloadAndPlay(page) {
  await page.reload({ waitUntil: 'load' });
  await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'));
  if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

/* A new full envelope, the way the live game gets one: a skipped frame makes the client re-read. */
async function pushEnvelope(page, s) {
  const frame = s.version + 2;
  s.version = frame;
  const before = s.calls.filter((c) => c.name === 'hr-accrue').length;
  await page.evaluate(([uid, f, st]) => window.__hub.send('hr:' + uid + ':0', { t: 'delta', frame: f, patch: { state: st } }), [UID, frame, s.env.state]);
  for (let i = 0; i < 60 && s.calls.filter((c) => c.name === 'hr-accrue').length <= before; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(250);
}

/* Close every open window (Esc closes the top one; with none open it would open Settings), then open one by its key. */
async function openWin(page, key, id) {
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving)').length > 0); i++) {
    await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  }
  await page.keyboard.press(key);
  return wait(page, (w) => document.querySelector('[data-hs-win="' + w + '"] [data-hs-built]'), id, 3000);
}
const count = (page, id) => page.evaluate((i) => { const li = document.querySelector('.hw-pocket[data-item="' + i + '"]'); return li ? li.querySelector('.hw-count').textContent : null; }, id);
const sent = (s, name, verb) => s.calls.filter((c) => c.name === name && (!verb || c.body.verb === verb));

async function pure() {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { SKILLS_DEF } = await imp('src/data/skills.js');
  const { SKILL_GUIDE } = await imp('src/data/skill-guide.js');
  for (const id of Object.keys(SKILLS_DEF)) if (!SKILL_GUIDE[id]) fails.push('AW-0 the skill ' + id + ' has no row in src/data/skill-guide.js');
  const { edgeBody } = await imp('src/session/edge-intents.js');
  if (edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x')) fails.push('AW-0 edgeBody let a price field through');
  if (edgeBody(0, 'grant_gold', { qty: 1 }, 'x')) fails.push('AW-0 edgeBody built an unknown verb');
  if (!edgeBody(0, 'vendor_sell_many', { lines: [{ item: 'rat_tail', qty: 3 }] }, 'x')) fails.push('AW-0 edgeBody refused a well-formed sale');
  return fails;
}

async function checks(overrides, shots) {
  const fails = overrides ? [] : await pure();
  const { server, port } = await serve(Object.assign({}, HOOK, overrides || {}));
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = scripted();
    if (o.mutateEnv) o.mutateEnv(s.env);
    await stub(page, s);
    const up = await signInAndPlay(page, base);
    return { ctx, page, errors, s, up };
  };
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); };
  try {
    { // AW-1 AW-2 AW-3 AW-4
      const { ctx, page, errors, s, up } = await open();
      if (!up) fails.push('AW-1 the shell did not mount for the fixture character');
      else {
        const launchers = await page.evaluate(() => Array.from(document.querySelectorAll('.hs-launch')).map((b) => b.getAttribute('data-hs-open')));
        for (const [key, id] of WINDOWS) {
          if (!launchers.includes(id)) fails.push('AW-1 the launcher row has no ' + id);
          if (!(await openWin(page, key, id))) fails.push('AW-1 the ' + key.toUpperCase() + ' key did not open ' + id);
          else if (shots) await shot(page, 'alpha-1440x900-' + id);
        }
        /* AW-15 (Tyler 10-18): one Inventory, no Gear and no Find window, and the item search only inside Inventory and Storage. */
        if (launchers.some((id) => /^(bag|gear|find)$/.test(id))) fails.push('AW-15 the launcher row still opens a separate bag, gear or find window: ' + launchers.join(','));
        const searches = [];
        for (const [key, id] of WINDOWS) {
          await openWin(page, key, id);
          /* The Character window's outfit search finds outfits, not items: it is not an item search. */
          searches.push(...await page.evaluate(() => Array.from(document.querySelectorAll('input[type=search]:not([data-hs-act="of-search"])')).map((i) => { const w = i.closest('[data-hs-win]'); return w ? w.getAttribute('data-hs-win') : 'outside'; })));
        }
        if (!searches.includes('inventory') || !searches.includes('storage') || searches.some((w) => w !== 'inventory' && w !== 'storage')) fails.push('AW-15 the item search is not exactly in Inventory and Storage: ' + searches.join(','));
        /* AW-2/AW-3: the bag patches its pockets in place and shows exactly the server's counts. */
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(300);
        if ((await count(page, 'rat_tail')) !== '31') fails.push('AW-3 the bag shows rat tails ×' + (await count(page, 'rat_tail')) + '; the server sent 31');
        await page.evaluate(() => { window.__rat = document.querySelector('.hw-pocket[data-item="rat_tail"]'); });
        /* The hunt's own clocks tick elsewhere on screen; only the bag window's DOM is counted. */
        const idle = await page.evaluate(async () => {
          let n = 0;
          const mo = new MutationObserver((list) => { n += list.length; });
          mo.observe(document.querySelector('[data-hs-win="inventory"] [data-hs-body]'), { subtree: true, childList: true, attributes: true, characterData: true });
          await new Promise((ok) => setTimeout(ok, 1100));
          mo.disconnect();
          return n;
        });
        if (idle > 0) fails.push('AW-2 idle display ticks wrote ' + idle + ' DOM changes to an unchanged bag');
        /* The bag's first marks (everything already in it is seen) reach the server before the next envelope. */
        for (let i = 0; i < 60 && !s.residue.bagSeen; i++) await page.waitForTimeout(100);
        if (!s.residue.bagSeen || s.residue.bagSeen.rat_tail?.[0] !== 31) fails.push('AW-3 the bag never stored its first "seen" marks: ' + JSON.stringify(s.residue.bagSeen));
        s.env.inventory.rat_tail = 40;
        s.env.inventory.bones = 2;
        delete s.env.inventory.slime_gel;
        await pushEnvelope(page, s);
        const after = await page.evaluate(() => ({ same: document.querySelector('.hw-pocket[data-item="rat_tail"]') === window.__rat,
          rat: document.querySelector('.hw-pocket[data-item="rat_tail"] .hw-count').textContent,
          bones: document.querySelector('.hw-pocket[data-item="bones"] .hw-count').textContent,
          gel: !!document.querySelector('.hw-pocket[data-item="slime_gel"]'),
          ratNew: document.querySelector('.hw-pocket[data-item="rat_tail"]').classList.contains('is-new'),
          bonesNew: document.querySelector('.hw-pocket[data-item="bones"]').classList.contains('is-new') }));
        if (!after.ratNew || after.bonesNew) fails.push('AW-3 the "new" mark is wrong after the envelope (more rat tails new: ' + after.ratNew + ', fewer bones new: ' + after.bonesNew + ')');
        if (!after.same) fails.push('AW-2 a new envelope rebuilt the rat tail pocket instead of patching it');
        if (after.rat !== '40' || after.bones !== '2' || after.gel) fails.push('AW-3 the bag did not take the server’s new counts (rat ' + after.rat + ', bones ' + after.bones + ', slime gel still there: ' + after.gel + ')');
        /* AW-4: Equip on a bag sword is one intent, off at once, and the doll waits for the server. */
        await page.click('.hw-pocket[data-item="steel_sword"]');
        await page.click('.hw-pick [data-hs-act="primary"]');
        const mid = await page.evaluate(() => ({ off: document.querySelector('.hw-pick [data-hs-act="primary"]').disabled }));
        if (!mid.off) fails.push('AW-4 the primary stayed on while the equip intent was in flight');
        const eq = sent(s, 'hr-accrue', 'equip');
        if (eq.length !== 1 || JSON.stringify(eq[0].body.equip) !== '{"weapon":"steel_sword"}' || eq[0].body.slot !== 0) fails.push('AW-4 Equip sent ' + JSON.stringify(eq.map((c) => c.body)));
        if (eq[0] && Object.keys(eq[0].body).some((k) => /price|gold|total|cost/.test(k))) fails.push('AW-4 the equip intent carried a value field');
        const worn = await page.evaluate(() => document.querySelector('.hw-slot[data-slot="weapon"]').getAttribute('data-item'));
        if (worn !== 'iron_sword') fails.push('AW-4 the doll shows ' + worn + ' before the server confirmed the equip');
        s.env.equipment.weapon = 'steel_sword';
        s.env.inventory.iron_sword = 1;
        delete s.env.inventory.steel_sword;
        await pushEnvelope(page, s);
        const now = await page.evaluate(() => document.querySelector('.hw-slot[data-slot="weapon"]').getAttribute('data-item'));
        if (now !== 'steel_sword') fails.push('AW-4 after the server’s envelope, the doll shows ' + now);
        if (shots) { await page.click('.hw-slot[data-slot="weapon"]'); await page.waitForTimeout(200); await shot(page, 'alpha-1440x900-gear-slot'); }
      }
      if (errors.length) fails.push('AW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-5 AW-6 the locked stack and the confirmation
      const { ctx, page, s, up } = await open();
      if (up) {
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-act="sell-junk"]');
        await page.waitForTimeout(150);
        const cf = await page.evaluate(() => ({ on: document.querySelector('.hw-confirm').classList.contains('is-on'),
          q: document.querySelector('.hw-confirm-q').textContent, note: document.querySelector('.hw-confirm-note').textContent,
          yes: document.querySelector('[data-hs-act="confirm-yes"]').textContent }));
        if (sent(s, 'hr-accrue', 'vendor_sell_many').length) fails.push('AW-6 a sale was sent before the confirmation was accepted');
        const total = 31 * 6 + 12 * 5;   // rat tails and slime gel at the fixture's bids; the sticky core is locked
        if (!cf.on || !cf.yes.includes(total.toLocaleString('en-US') + ' gp')) fails.push('AW-6 the confirmation does not show the total ' + total + ' gp: ' + JSON.stringify(cf));
        if (!/1 locked stack is kept/.test(cf.note)) fails.push('AW-5 the confirmation does not say the locked stack is kept: ' + JSON.stringify(cf.note));
        if (shots) await shot(page, 'alpha-1440x900-bag-confirm');
        await page.click('[data-hs-act="confirm-yes"]');
        await page.waitForTimeout(100);
        const sales = sent(s, 'hr-accrue', 'vendor_sell_many');
        const named = sales.length ? sales[0].body.lines.map((l) => l.item).sort() : [];
        if (sales.length !== 1 || JSON.stringify(named) !== '["rat_tail","slime_gel"]') fails.push('AW-5 the bulk sale sent ' + JSON.stringify(sales.map((c) => c.body.lines)));
        if (named.includes('sticky_core') || named.includes('bronze_sword')) fails.push('AW-5 a locked stack was named in the sale');
        /* The context menu and the tooltip, for the visual gate. */
        if (shots) {
          await page.waitForTimeout(500);
          await page.hover('.hw-pocket[data-item="steel_sword"]');
          await page.waitForTimeout(200);
          await shot(page, 'alpha-1440x900-bag-tooltip');
          await page.click('.hw-pocket[data-item="wheat_bread"]', { button: 'right' });
          await page.waitForTimeout(200);
          await shot(page, 'alpha-1440x900-bag-menu');
        }
      } else fails.push('AW-5 the screen did not mount');
      await ctx.close();
    }

    { // AW-7 the one-tap refill; AW-8 hunt prep
      const { ctx, page, s, up } = await open();
      if (up) {
        await openWin(page, 'v', 'shop');
        await page.click('.hw-tab[data-tab="refill"]');
        await page.waitForTimeout(150);
        const label = await page.evaluate(() => document.querySelector('[data-hs-act="refill"]').textContent);
        if (label !== 'Refill · 1,160 gp') fails.push('AW-7 the refill button does not show the quoted total before the press: "' + label + '"');
        if (shots) await shot(page, 'alpha-1440x900-shop-refill');
        await page.click('[data-hs-act="refill"]');
        await page.waitForTimeout(100);
        const off = await page.evaluate(() => document.querySelector('[data-hs-act="refill"]').disabled);
        await page.waitForTimeout(600);
        const refills = sent(s, 'hr_shop_refill');
        if (refills.length !== 1 || refills[0].body.p_quote_total !== 1160 || refills[0].body.p_slot !== 0) fails.push('AW-7 the refill sent ' + JSON.stringify(refills.map((c) => c.body)));
        if (sent(s, 'hr-accrue', 'shop_buy').length) fails.push('AW-7 the refill made purchases of its own');
        if (!off) fails.push('AW-7 the refill button stayed on while the intent was in flight');
        await openWin(page, 'p', 'hunt-prep');
        await page.waitForTimeout(200);
        const line = await page.evaluate(() => document.querySelector('.hw-ready-line b').textContent);
        if (line !== 'Tyler: 14/20 Wheat Bread, 6/10 Goldenroot Tea') fails.push('AW-8 the readiness line reads "' + line + '"');
        if (shots) await shot(page, 'alpha-1440x900-hunt-prep');
        await page.click('[data-hs-act="apply"][data-preset="0"]');
        await page.waitForTimeout(600);
        const ap = sent(s, 'hr_hunt_preset_apply');
        if (ap.length !== 1 || ap[0].body.p_preset !== 0) fails.push('AW-8 Use sent ' + JSON.stringify(ap.map((c) => c.body)));
        if (shots) {
          await openWin(page, 'b', 'inventory');
          await page.fill('[data-hs-win="inventory"] .hw-q', 'rat');
          await page.waitForTimeout(600);
          await shot(page, 'alpha-1440x900-find');
        }
      } else fails.push('AW-7 the screen did not mount');
      await ctx.close();
    }

    { // AW-10 drag to the bar; AW-11 the keyboard
      const { ctx, page, s, up } = await open();
      if (up) {
        await openWin(page, 'b', 'inventory');
        await page.dragAndDrop('.hw-pocket[data-item="cooked_shrimp"]', '.hb-slot[data-slot="7"]');
        await page.waitForTimeout(600);
        const bar = sent(s, 'hr_action_set_options');
        const sl = bar[0] && bar[0].body.p_opts.slots;
        if (bar.length !== 1 || !sl || !sl[7] || sl[7].action.id !== 'cooked_shrimp' || sl[7].action.type !== 'consume'
          || JSON.stringify(sl[2].action) !== JSON.stringify(FIXTURE.hunt_settings.slots[2].action)) fails.push('AW-10 dragging food onto bar slot 8 sent ' + JSON.stringify(bar.map((c) => c.body.p_opts)).slice(0, 300));
        /* The keyboard: focus a pocket, move right, lock what the cursor is on. */
        await page.click('.hw-pocket[data-item="steel_sword"]');
        await page.keyboard.press('ArrowRight');
        const cur = await page.evaluate(() => document.querySelector('.hw-pocket.is-cur').getAttribute('data-item'));
        await page.keyboard.press('l');
        await page.waitForTimeout(600);
        const locks = sent(s, 'hr_item_lock');
        if (locks.length !== 1 || locks[0].body.p_item !== cur || locks[0].body.p_locked !== true) fails.push('AW-11 ArrowRight then L sent ' + JSON.stringify(locks.map((c) => c.body)) + ' (cursor on ' + cur + ')');
        /* Space selects the cursor's stack: the bag consumes it (no page scroll, no window key). */
        await page.keyboard.press(' ');
        const sel = await page.evaluate(() => ({ on: document.querySelector('.hw-pocket.is-cur').getAttribute('aria-selected'), bag: !!document.querySelector('[data-hs-win="inventory"]:not(.is-leaving)') }));
        if (sel.on !== 'true' || !sel.bag) fails.push('AW-11 Space did not select the cursor stack inside the open bag: ' + JSON.stringify(sel));
      } else fails.push('AW-10 the screen did not mount');
      await ctx.close();
    }

    { // AW-9 fail safe without the new sections
      const { ctx, page, up } = await open({ mutateEnv: (e) => { delete e.bag_rules; delete e.shop; } });
      if (up) {
        await openWin(page, 'b', 'inventory');
        await page.click('.hw-pocket[data-item="rat_tail"]', { button: 'right' });
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ lock: document.querySelector('[data-hs-act="m-lock"]').disabled,
          rules: Array.from(document.querySelectorAll('[data-hs-act="m-rule"]')).every((b) => b.disabled),
          junk: document.querySelector('[data-hs-act="sell-junk"]').disabled, value: document.querySelector('.hw-value').textContent }));
        if (!st.lock || !st.rules || !st.junk || st.value !== 'Value –') fails.push('AW-9 without the server’s sections the bag offered ' + JSON.stringify(st));
        await openWin(page, 'v', 'shop');
        await page.click('.hw-tab[data-tab="refill"]');
        const r = await page.evaluate(() => document.querySelector('[data-hs-act="refill"]').disabled);
        if (!r) fails.push('AW-9 the refill was on with no server quote');
      } else fails.push('AW-9 the screen did not mount');
      await ctx.close();
    }

    { // AW-12 .. AW-14, AW-16: Tyler's first playtest (10-18), in town with no hunt running
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3 };
        /* a restock target BELOW the bag's 14 bread: the hunt carries the remembered 10, not the stack */
        e.bag_rules = Object.assign({}, e.bag_rules, { restock: { wheat_bread: 10, goldenroot_tea: 10 } });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      if (!up || !(await wait(page, () => window.__world && window.__world.stats().walk))) fails.push('AW-12 the town did not mount');
      else {
        const hero = () => page.evaluate(() => window.__world.stats().walk.cell.join(','));
        const at = (x, y) => page.evaluate(([a, b]) => window.__world.screenOf(a, b), [x, y]);
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(200);
        /* AW-13 a press on a docked window never reaches the World; a press on open map walks. */
        const c0 = await hero();
        await page.click('[data-hs-win="inventory"] .hw-slot[data-slot="helmet"]');
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        await page.click('[data-hs-win="inventory"] .hw-inv-foot');
        await page.waitForTimeout(900);
        if ((await hero()) !== c0) fails.push('AW-13 clicks inside the docked Inventory walked the hero from ' + c0 + ' to ' + (await hero()));
        const [hx, hy] = c0.split(',').map(Number);
        const p = await at(hx - 3, hy);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(1500);
        if ((await hero()) === c0) fails.push('AW-13 a click on open map beside the window did not walk the hero (still on ' + c0 + ')');
        /* AW-12 the walk keys work with a window open and an item focused; only a text field takes them. */
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        const k0 = await hero();
        await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
        await page.waitForTimeout(500);
        const k1 = await hero();
        if (k1 === k0) fails.push('AW-12 with the Inventory open and a stack focused, D did not walk the hero (' + k0 + ')');
        await page.focus('[data-hs-win="inventory"] .hw-q');
        await page.keyboard.down('a'); await page.waitForTimeout(700); await page.keyboard.up('a');
        await page.waitForTimeout(500);
        if ((await hero()) !== k1) fails.push('AW-12 typing A in the item search walked the hero');
        await page.evaluate(() => document.activeElement.blur());
        /* AW-16 no void: with the window docked the whole town view stays on the map (the hero is mid-map). */
        const box = await page.evaluate(() => document.querySelector('.world-canvas').getBoundingClientRect().toJSON());
        const tl = await at(0, 0), br = await at(TOWN.w - 1, TOWN.h - 1);
        const half = (br.x - tl.x) / (TOWN.w - 1) / 2;
        if (tl.x - half > box.left + 1 || br.x + half < box.right - 1 || tl.y - half > box.top + 1 || br.y + half < box.bottom - 1)
          fails.push('AW-16 with the Inventory docked the camera shows past the map: map ' + JSON.stringify([tl.x - half, tl.y - half, br.x + half, br.y + half].map(Math.round)) + ' vs canvas ' + JSON.stringify([box.left, box.top, box.right, box.bottom].map(Math.round)));
        /* The capacity bar and the gold under the two columns. */
        const foot = await page.evaluate(() => ({ cap: document.querySelector('.hw-captext').textContent, gold: document.querySelector('.hw-gold').textContent }));
        if (!/ of 40 spaces$/.test(foot.cap) || foot.gold !== '5,200 gp') fails.push('AW-14 the Inventory foot reads ' + JSON.stringify(foot));
        if (shots) await shot(page, 'alpha-1440x900-inventory-town');
        /* AW-14 going hunting is two presses from town: the mill hatch opens Hunts on the Mill Cellar, Enter goes. */
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const hatch = await at(TOWN.hatch[0], TOWN.hatch[1]);
        await page.mouse.click(hatch.x, hatch.y);
        const opened = await wait(page, () => document.querySelector('[data-hs-win="hunts"] .hw-hunt.is-picked[data-hunt="mill_cellar"]'), null, 3000);
        if (!opened) fails.push('AW-14 a click on the mill hatch did not open Hunts on the Mill Cellar');
        else {
          if (shots) await shot(page, 'alpha-1440x900-hunts');
          await page.click('[data-hs-win="hunts"] .hw-hunt.is-picked .hw-hunt-enter');
          await page.waitForTimeout(700);
          const enter = sent(s, 'hr_hunt_enter');
          const b = enter[0] && enter[0].body;
          if (enter.length !== 1 || b.p_hunt !== 'mill_cellar' || b.p_slot !== 0 || !Array.isArray(b.p_bag) || Object.keys(b).some((k) => /price|gold|total|cost/.test(k)))
            fails.push('AW-14 Enter sent ' + JSON.stringify(enter.map((c) => c.body)));
          const bread = b && b.p_bag.find((l) => l.item === 'wheat_bread');
          if (!bread || bread.qty !== 10) fails.push('AW-14 the hunt did not carry the bread up to its restock target: ' + JSON.stringify(b && b.p_bag));
        }
        /* AW-16b Storage from town: a Shift-press moves a whole stack, ONE hr_bank_move (the amounts are AW-18). */
        await openWin(page, 't', 'storage');
        await page.click('[data-hs-win="storage"] .hw-pocket[data-item="oak_logs"]', { modifiers: ['Shift'] });
        await page.waitForTimeout(700);
        const mv = sent(s, 'hr_bank_move');
        if (mv.length !== 1 || mv[0].body.p_item !== 'oak_logs' || mv[0].body.p_qty !== 12 || mv[0].body.p_dir !== 'withdraw') fails.push('AW-16 a storage press sent ' + JSON.stringify(mv.map((c) => c.body)));
        /* AW-17 (desktop) neither skills window scrolls; an unlock names each thing and what it is for (Tyler 10-18:
           "and 1 more" made the smithing tools read as weapon crafting). */
        for (const [key, id] of [['g', 'skills-trade']]) {
          await openWin(page, key, id);
          await page.waitForTimeout(300);
          const m = await page.evaluate((w) => { const b = document.querySelector('[data-hs-win="' + w + '"] .hs-win-body'); return { sh: b.scrollHeight, ch: b.clientHeight }; }, id);
          if (m.sh > m.ch + 1) fails.push('AW-17 ' + id + ' at 1440x900 scrolls (' + m.sh + ' > ' + m.ch + ')');
        }
        const smith = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="skills-trade"] .hw-skill')).map((li) => li.textContent).find((t) => /^Smithing/.test(t.trim())) || '');
        if (!/Next at level \d+: .*Bronze Axe \(woodcutting tool\)/.test(smith) || /and 1 more/.test(smith)) fails.push('AW-17 the smithing unlock does not say what it is: ' + JSON.stringify(smith));
      }
      if (errors.length) fails.push('AW-13 console errors in town: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-18 amounts in Storage; AW-19 bury — a stateful stub: the server's answer moves its own counts
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3 };
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const shift = (from, to, id, n) => { from[id] -= n; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + n; };
      s.onCall = (name, b) => {
        if (name === 'hr_bank_move') { if (b.p_dir === 'deposit') shift(s.env.inventory, s.env.bank, b.p_item, b.p_qty); else shift(s.env.bank, s.env.inventory, b.p_item, b.p_qty); }
        if (name === 'hr-accrue' && b.verb === 'set_activity') {
          if (b.activity.kind === 'artisan') Object.assign(s.env.state, { active_kind: 'artisan', active_id: b.activity.id });
          else { s.env.skills.prayer.xp += 6 * (s.env.inventory.bones || 0); delete s.env.inventory.bones; Object.assign(s.env.state, { active_kind: 'idle', active_id: null }); }
        }
      };
      const sc = (side, id) => page.evaluate(([sd, i]) => { const li = document.querySelector('[data-hs-win="storage"] .hw-pockets[data-side="' + sd + '"] .hw-pocket[data-item="' + i + '"]'); return li ? (li.querySelector('.hw-count').textContent || '1') : null; }, [side, id]);
      if (!up) fails.push('AW-18 the town did not mount');
      else {
        await openWin(page, 't', 'storage');
        /* store 3 of 10 through the picker: right-click, type 3, Enter */
        await page.click('[data-hs-win="storage"] [data-side="bag"] .hw-pocket[data-item="copper_ore"]', { button: 'right' });
        const picker = await wait(page, () => document.querySelector('.hw-menu.is-on .hw-amt-n'), null, 2000);
        if (!picker) fails.push('AW-18 a right-click on a bag stack in Storage did not ask how many');
        else {
          await page.fill('.hw-menu .hw-amt-n', '3');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(800);
        }
        let mv = sent(s, 'hr_bank_move');
        if (mv.length !== 1 || mv[0].body.p_item !== 'copper_ore' || mv[0].body.p_qty !== 3 || mv[0].body.p_dir !== 'deposit') fails.push('AW-18 Store 3 sent ' + JSON.stringify(mv.map((c) => c.body)));
        if ((await sc('bag', 'copper_ore')) !== '7' || (await sc('bank', 'copper_ore')) !== '3') fails.push('AW-18 after storing 3 of 10 the bag shows ' + (await sc('bag', 'copper_ore')) + ' and storage ' + (await sc('bank', 'copper_ore')));
        if (!(await reloadAndPlay(page))) fails.push('AW-18 the reload did not come back');
        else {
          await openWin(page, 't', 'storage');
          await page.waitForTimeout(300);
          if ((await sc('bag', 'copper_ore')) !== '7' || (await sc('bank', 'copper_ore')) !== '3') fails.push('AW-18 after a reload the bag shows ' + (await sc('bag', 'copper_ore')) + ' and storage ' + (await sc('bank', 'copper_ore')));
          /* a press takes ONE out; a Shift-press takes the whole stack */
          await page.click('[data-hs-win="storage"] [data-side="bank"] .hw-pocket[data-item="oak_logs"]');
          await page.waitForTimeout(700);
          await page.click('[data-hs-win="storage"] [data-side="bank"] .hw-pocket[data-item="iron_bar"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(700);
          mv = sent(s, 'hr_bank_move').slice(1).map((c) => c.body.p_item + ':' + c.body.p_qty + ':' + c.body.p_dir);
          if (mv.join() !== 'oak_logs:1:withdraw,iron_bar:3:withdraw') fails.push('AW-18 a press then a Shift-press sent ' + JSON.stringify(mv));
          if ((await sc('bank', 'oak_logs')) !== '11') fails.push('AW-18 one oak log out leaves storage showing ' + (await sc('bank', 'oak_logs')));
          if (shots) await shot(page, 'alpha-1440x900-storage');
        }
        /* AW-19 bury: the bones' primary is Bury all; ONE set_activity; Stop collects; the server's numbers only */
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]');
        const prim = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]').textContent);
        if (prim !== 'Bury all') fails.push('AW-19 the bones offer "' + prim + '", not Bury all');
        else {
          await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
          await page.waitForTimeout(800);
          const go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"artisan","id":"bury_bones"}' || Object.keys(go[0].body).sort().join() !== 'activity,intentId,slot,verb')
            fails.push('AW-19 Bury all sent ' + JSON.stringify(go.map((c) => c.body)));
          const line = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-burying'); return b && b.classList.contains('is-on') ? b.textContent : ''; });
          if (!/^Burying Bones\./.test(line)) fails.push('AW-19 no Burying line from the server pointer: ' + JSON.stringify(line));
          if ((await count(page, 'bones')) !== '8') fails.push('AW-19 the bag painted the bury before the server paid it: bones x' + (await count(page, 'bones')));
          if (shots) await shot(page, 'alpha-1440x900-burying');
          await page.click('[data-hs-win="inventory"] [data-hs-act="bury-stop"]');
          await page.waitForTimeout(800);
          const stop = sent(s, 'hr-accrue', 'set_activity').slice(1);
          if (stop.length !== 1 || JSON.stringify(stop[0].body.activity) !== '{"kind":"idle"}') fails.push('AW-19 Stop sent ' + JSON.stringify(stop.map((c) => c.body)));
          const after = await page.evaluate(() => ({ bones: !!document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]'), msg: document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent }));
          if (after.bones || after.msg !== 'Done: +48 Prayer XP.') fails.push('AW-19 after the server buried them: ' + JSON.stringify(after));
          if (!(await reloadAndPlay(page))) fails.push('AW-19 the reload did not come back');
          else {
            await openWin(page, 'b', 'inventory');
            await page.waitForTimeout(300);
            if (await page.$('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]')) fails.push('AW-19 the bones came back after a reload');
          }
        }
      }
      if (errors.length) fails.push('AW-18 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-17 the skills are two windows and neither scrolls, on the phone too; the first-minute pointer
      const fresh = (e) => { for (const k of Object.keys(e.skills)) if (['attack', 'strength', 'defense', 'hitpoints', 'prayer', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 }; for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null }); };
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: fresh });
      if (up) {
        const ptr = await page.evaluate(() => { const p = document.querySelector('.hs-pointer'); return p ? p.textContent : null; });
        if (!ptr || !/Open Hunts/.test(ptr)) fails.push('AW-17 a fresh character sees no pointer to Hunts: ' + JSON.stringify(ptr));
        if (shots) await shot(page, 'alpha-922x423-first-minute');
        for (const [key, id] of [['g', 'skills-trade']]) {
          if (!(await openWin(page, key, id))) { fails.push('AW-17 ' + id + ' did not open'); continue; }
          await page.waitForTimeout(300);
          const m = await page.evaluate((w) => { const b = document.querySelector('[data-hs-win="' + w + '"] .hs-win-body'); return { sh: b.scrollHeight, ch: b.clientHeight, n: b.querySelectorAll('.hw-skill').length }; }, id);
          if (m.sh > m.ch + 1 || m.n < 4) fails.push('AW-17 ' + id + ' at 922x423 scrolls (' + m.sh + ' > ' + m.ch + ') or lists ' + m.n + ' skills');
        }
      } else fails.push('AW-17 the phone did not mount');
      await ctx.close();
    }

    if (shots) { // the phone size class
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 } });
      if (up) {
        for (const [key, id] of WINDOWS) {
          await openWin(page, key, id);
          await page.waitForTimeout(300);
          await shot(page, 'alpha-922x423-' + id);
        }
      } else fails.push('AW-1 the phone size did not mount');
      await ctx.close();
    }
  } catch (e) {
    /* A rule whose control never appeared is RED, not a crashed run (a planted mutant can hide one). */
    fails.push('AW-x a step failed: ' + String(e && e.message).split('\n')[0]);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['a bulk sale names a locked stack', 'src/shell/bag-model.js', '    if (locked.has(id)) { kept.push(id); continue; }\n', ''],
  ['the bag keeps a count the server dropped', 'src/session/item-sections.js', '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  return items;',
    '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  const prev = globalThis.__bag || [];\n  for (const p of prev) { const i = items.find((x) => x.id === p.id); if (!i) items.push(p); else i.qty = Math.max(i.qty, p.qty); }\n  globalThis.__bag = items.map((x) => ({ ...x }));\n  return items;'],
  ['bag actions stay on while an intent is in flight', 'src/shell/windows/inventory/grid.js', "prop(pb, 'disabled', sc.pending || !prim);", "prop(pb, 'disabled', !prim);"],
  ['a pocket is rebuilt whenever its count changes', 'src/shell/windows/inventory/grid.js', '    key: (r) => r.id,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),', '    key: (r) => r.id + ":" + r.qty,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),'],
  ['a sale is sent without the confirmation', 'src/shell/windows/inventory/actions.js', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();\n  doSell(st, repaint);'],
  ['the refill button hides the total', 'src/shell/windows/shop.js', "text(btn, 'Refill · ' + gold(quote.total));", "text(btn, 'Refill');"],
  ['the refill buys line by line', 'src/shell/windows/shop.js', "runIntent(sc, repaint, () => cs.refill(shop.refill.total), 'Refilling…',",
    "runIntent(sc, repaint, () => Promise.all(shop.refill.lines.map((l) => cs.edgeIntent('shop_buy', { offer: l.offer, qty: l.buy }))).then(() => cs.refill(shop.refill.total)), 'Refilling…',"],
  ['the doll wears the item before the server confirms', 'src/shell/windows/inventory/doll.js', '    const id = eq[s] || \'\';', "    const id = (s === 'weapon' && globalThis.__want) || eq[s] || '';"],
  ['a press on a window reaches the World', 'src/world/world-boot.js', "if (!walk || !scene || scene.kind === 'hunt' || !onWorld(e)) return;", "if (!walk || !scene || scene.kind === 'hunt') return;"],
  ['an open window takes the walk keys', 'src/world/world-boot.js', '    if (keyBelongsToField(t, e.code)) { letGo(); return; }', "    if (keyBelongsToField(t, e.code) || (t.closest && t.closest('[data-hs-win]'))) { letGo(); return; }"],
  ['a docked window shows the void past the map', 'src/world/core/camera.js', '    if (span >= v) c = hold(', '    if (false) c = hold('],
  ['the mill hatch opens nothing', 'src/world/world-boot.js', "    hunt: (id) => emit('entrance', { hunt: id }),", '    hunt: () => false,'],
  ['a hunt carries the whole stack past its restock target', 'src/shell/hunt-list.js', 'restock[r.id] > 0 ? Math.min(r.qty, restock[r.id]) : r.qty', 'r.qty'],
  ['a Shift-press in Storage moves one at a time', 'src/shell/windows/storage.js', 'move(cs, sc, repaint, id, ev.shiftKey ? row.qty : 1, action);', 'move(cs, sc, repaint, id, 1, action);'],
  ['a press in Storage moves the whole stack', 'src/shell/windows/storage.js', 'move(cs, sc, repaint, id, ev.shiftKey ? row.qty : 1, action);', 'move(cs, sc, repaint, id, row.qty, action);'],
  ['the amount picker sends the whole stack', 'src/shell/widgets/amount.js', "  return n ? clampAmount(n.value, n.getAttribute('data-max')) : 1;", "  return n ? clampAmount(n.getAttribute('data-max'), n.getAttribute('data-max')) : 1;"],
  ['Enter in the amount picker does nothing', 'src/shell/windows/float-menu.js', "      if (e.key === 'Enter' && def) { e.preventDefault(); e.stopPropagation(); def.click(); }\n", ''],
  ['bones offer no Bury', 'src/shell/windows/inventory/state.js', "  if (br) return ['bury', buryLabel(br, st.qty.get(id))];\n", ''],
  ['Bury debits the bag before the server answers', 'src/shell/windows/inventory/bury.js', "  const qty = (cs.read('inventory') || {})[id] || 0;\n", "  const qty = (cs.read('inventory') || {})[id] || 0;\n  delete cs.read('inventory')[id];\n"],
  ['Stop does not collect', 'src/shell/windows/inventory/bury.js', "cs.edgeIntent('set_activity', { activity: { kind: 'idle' } })", "Promise.resolve({ ok: true })"],
  ['the Burying line ignores the server pointer', 'src/shell/windows/inventory/bury.js', "  return r ? buryingWord(r) + ' ' + itemName(r.input) + '. Your Prayer XP and bag update when it is done.' : '';", "  return '';"],
  ['the skills are one window again', 'src/shell/windows/skills.js', "export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);", "export const renderTradeSkills = skillsWindow([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Crafting']]);"],
  ['a new player gets no pointer to Hunts', 'src/shell/launcher.js', "+ pointerFor(ctx, open) + '</nav>'", "+ '</nav>'"],
  ['edgeBody lets an unlisted field through', 'src/session/edge-intents.js', '  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;\n', ''],
];
/* The doll mutant needs the want set where an equip is asked: plant it beside the intent. */
const COMPANION = { 'the doll wears the item before the server confirms': ['src/shell/windows/inventory/actions.js', '    if (slot) wear(st, repaint, slot, id);', '    if (slot) globalThis.__want = id;\n    if (slot) wear(st, repaint, slot, id);'] };

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'alpha-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'alpha-windows: ' + fails.length + ' rule(s) RED'
      : 'alpha-windows: the windows open; patch in place; the server’s counts win; intents only; locks hold; totals first; one-tap refill; Hunts from the hatch in two presses; window presses and focus never steal the World; no void; storage from town; store any amount; bury pays from the server; skills split' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null, null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const over = {};
    const plant = [[file, from, to]].concat(COMPANION[name] ? [COMPANION[name]] : []);
    let missing = null;
    for (const [f, x, y] of plant) {
      const text = over[f] !== undefined ? over[f] : await readFile(join(ROOT, f), 'utf8');
      if (!text.includes(x)) { missing = f; break; }
      over[f] = text.replace(x, y);
    }
    if (missing) { console.log('  ✗ ' + name + ' — anchor not found in ' + missing); bad++; continue; }
    const fails = name.startsWith('edgeBody') ? await pureMutant(over[file]) : await checks(over, null);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'alpha-windows --mutate: ' + bad + ' escaped' : 'alpha-windows --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

/* The edge-body mutant is a pure module: run AW-0 against the planted text. */
async function pureMutant(text) {
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const { edgeBody } = await import(url);
  return edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x') ? ['AW-0 edgeBody let a price field through'] : [];
}

main();
