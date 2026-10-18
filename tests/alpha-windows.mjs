#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows.mjs — THE ALPHA WINDOWS' RULES, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows.mjs                the rules
//   node tests/alpha-windows.mjs --mutate       every planted defect must turn a rule RED
//   node tests/alpha-windows.mjs --shots <dir>  also write the visual-gate screenshots
//                                               (1440x900 and 922x423)
//
// mutant-anchors: src/shell/bag-model.js src/session/item-sections.js src/shell/windows/bag.js src/shell/windows/bag-act.js src/shell/windows/shop.js src/shell/windows/gear.js src/session/edge-intents.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs);
// the character's envelope is tests/fixtures/alpha-envelope.json.
//   AW-0  PURE: every SKILLS_DEF skill has a guide row; edgeBody refuses a price
//         field and an unknown verb; a bulk-sale plan never names a locked stack
//   AW-1  Bag, Gear, Skills, Shop, Hunt prep and Find open from their keys and the
//         launcher row, with zero console errors
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
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const ITEM_RPCS = ['hr_item_lock', 'hr_loot_rule_set', 'hr_restock_set', 'hr_shop_refill', 'hr_hunt_preset_save', 'hr_hunt_preset_apply', 'hr_action_set_options'];

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
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  const open = async (o = {}) => {
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const page = await ctx.newPage();
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
        for (const [key, id] of [['b', 'bag'], ['c', 'gear'], ['k', 'skills'], ['v', 'shop'], ['p', 'hunt-prep'], ['f', 'find']]) {
          if (!launchers.includes(id)) fails.push('AW-1 the launcher row has no ' + id);
          if (!(await openWin(page, key, id))) fails.push('AW-1 the ' + key.toUpperCase() + ' key did not open ' + id);
          else if (shots) await shot(page, 'alpha-1440x900-' + id);
        }
        /* AW-2/AW-3: the bag patches its pockets in place and shows exactly the server's counts. */
        await openWin(page, 'b', 'bag');
        await page.waitForTimeout(300);
        if ((await count(page, 'rat_tail')) !== '31') fails.push('AW-3 the bag shows rat tails ×' + (await count(page, 'rat_tail')) + '; the server sent 31');
        await page.evaluate(() => { window.__rat = document.querySelector('.hw-pocket[data-item="rat_tail"]'); });
        /* The hunt's own clocks tick elsewhere on screen; only the bag window's DOM is counted. */
        const idle = await page.evaluate(async () => {
          let n = 0;
          const mo = new MutationObserver((list) => { n += list.length; });
          mo.observe(document.querySelector('[data-hs-win="bag"] [data-hs-body]'), { subtree: true, childList: true, attributes: true, characterData: true });
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
        await openWin(page, 'c', 'gear');
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
        await openWin(page, 'b', 'bag');
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
          await openWin(page, 'f', 'find');
          await page.fill('[data-hs-win="find"] .hw-q', 'rat');
          await page.waitForTimeout(600);
          await shot(page, 'alpha-1440x900-find');
        }
      } else fails.push('AW-7 the screen did not mount');
      await ctx.close();
    }

    { // AW-10 drag to the bar; AW-11 the keyboard
      const { ctx, page, s, up } = await open();
      if (up) {
        await openWin(page, 'b', 'bag');
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
        const sel = await page.evaluate(() => ({ on: document.querySelector('.hw-pocket.is-cur').getAttribute('aria-selected'), bag: !!document.querySelector('[data-hs-win="bag"]:not(.is-leaving)') }));
        if (sel.on !== 'true' || !sel.bag) fails.push('AW-11 Space did not select the cursor stack inside the open bag: ' + JSON.stringify(sel));
      } else fails.push('AW-10 the screen did not mount');
      await ctx.close();
    }

    { // AW-9 fail safe without the new sections
      const { ctx, page, up } = await open({ mutateEnv: (e) => { delete e.bag_rules; delete e.shop; } });
      if (up) {
        await openWin(page, 'b', 'bag');
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

    if (shots) { // the phone size class
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 } });
      if (up) {
        for (const [key, id] of [['b', 'bag'], ['c', 'gear'], ['k', 'skills'], ['v', 'shop'], ['p', 'hunt-prep']]) {
          await openWin(page, key, id);
          await page.waitForTimeout(300);
          await shot(page, 'alpha-922x423-' + id);
        }
      } else fails.push('AW-1 the phone size did not mount');
      await ctx.close();
    }
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
  ['bag actions stay on while an intent is in flight', 'src/shell/windows/bag.js', "prop(pb, 'disabled', sc.pending || !prim);", "prop(pb, 'disabled', !prim);"],
  ['a pocket is rebuilt whenever its count changes', 'src/shell/windows/bag.js', '    key: (r) => r.id,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),', '    key: (r) => r.id + ":" + r.qty,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),'],
  ['a sale is sent without the confirmation', 'src/shell/windows/bag-act.js', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();\n  doSell(null, st, repaint);'],
  ['the refill button hides the total', 'src/shell/windows/shop.js', "text(btn, 'Refill · ' + gold(quote.total));", "text(btn, 'Refill');"],
  ['the refill buys line by line', 'src/shell/windows/shop.js', "runIntent(sc, repaint, () => cs.refill(shop.refill.total), 'Refilling…',",
    "runIntent(sc, repaint, () => Promise.all(shop.refill.lines.map((l) => cs.edgeIntent('shop_buy', { offer: l.offer, qty: l.buy }))).then(() => cs.refill(shop.refill.total)), 'Refilling…',"],
  ['the doll wears the item before the server confirms', 'src/shell/windows/gear.js', '    const id = eq[s] || \'\';', "    const id = (s === 'weapon' && globalThis.__want) || eq[s] || '';"],
  ['edgeBody lets an unlisted field through', 'src/session/edge-intents.js', '  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;\n', ''],
];
/* The doll mutant needs the want set where an equip is asked: plant it beside the intent. */
const COMPANION = { 'the doll wears the item before the server confirms': ['src/shell/windows/bag-act.js', "    if (slot) send(ctx, st, repaint, () => cs.edgeIntent('equip'", "    if (slot) globalThis.__want = id;\n    if (slot) send(ctx, st, repaint, () => cs.edgeIntent('equip'"] };

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'alpha-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'alpha-windows: ' + fails.length + ' rule(s) RED'
      : 'alpha-windows: six windows open; patch in place; the server’s counts win; intents only; locks hold; totals first; one-tap refill' + (shots ? ' (shots in ' + shots + ')' : ''));
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
