#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows.mjs — THE ALPHA WINDOWS' RULES, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows.mjs                the rules
//   node tests/alpha-windows.mjs --mutate       every planted defect must turn a rule RED
//   node tests/alpha-windows.mjs --shots <dir>  also write the visual-gate screenshots
//                                               (1440x900 and 922x423)
//
// mutant-anchors: src/session/character-session.js src/shell/widgets/amount.js src/shell/windows/inventory/bury.js src/shell/windows/inventory/state.js src/shell/windows/float-menu.js src/shell/bag-model.js src/session/item-sections.js src/shell/windows/inventory/grid.js src/shell/windows/inventory/actions.js src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/session/edge-intents.js src/world/world-boot.js src/world/core/camera.js src/shell/windows/hunts.js src/shell/windows/storage.js src/shell/hunt-list.js src/shell/windows/skills.js src/shell/launcher.js src/shell/upgrade-plan.js src/shell/widgets/upgrade-line.js src/shell/intent-words.js src/shell/town-work.js src/shell/windows/work.js
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
//         primary goes off at once, the weapon slot and the sword's stack carry the
//         pending mark from the press until the answer (r16), the engine's answer
//         (the whole envelope) is applied with no second round trip to hr_load, and
//         the doll keeps the server's weapon until an envelope says otherwise
//   AW-5  LOCK PROTECTS FROM BULK SELL: "Sell junk" over stacks that include a
//         locked one confirms with the locked stack kept, and the ONE
//         vendor_sell_many it sends never names it
//   AW-6  A SALE SHOWS ITS TOTAL FIRST: nothing is sent until the confirmation
//         (which carries the total at the server's bids) is accepted
//   AW-7  THE SHOP SELLS NO SUPPLIES (Tyler 2026-10-20): the Shop has Buy and Sell
//         only (no Refill), Buy lists the tools and never a food, drink or ammo
//         offer even when a server still sends one, Hunt prep has no refill
//         button and the hunt summary no Restock
//   AW-8  HUNT PREP: the readiness line names this character's shortages from the
//         server's bag and bar; Use sends ONE hr_hunt_preset_apply
//   AW-9  FAIL SAFE: with no bag_rules and no shop section, lock, the loot rules
//         and sell junk stay off and the bag value reads a dash
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
//         Mill Cellar, Enter is ONE hr_hunt_enter carrying names and counts (the
//         bag's own supplies, whole stacks); the foot shows the spaces and the gold
//   AW-15 one Inventory: no Gear, Bag or Find window; the item search is only in
//         Inventory and Storage
//   AW-16 no void: with a window docked the whole town view stays on the map; a
//         Storage press from town moves the whole stack with ONE hr_bank_move
//   AW-18 AMOUNTS (Tyler live 10-18, "it's all or nothing"): in Storage a press
//         moves ONE, Shift-press the whole stack, and a right-click asks how many
//         (Enter confirms); each is ONE hr_bank_move naming exactly that count, and
//         store 3 of 10 reads bag 7 / storage 3 from the envelope, before and after a reload
//   AW-23 SORT AND FILTER (Tyler 10-22, "storage doesn't have a way to sort or filter"):
//         a kind chip and the search narrow both Storage grids, Count orders by the
//         stack, Newest puts the stack just stored first, and the chip and sort are
//         remembered (ONE residue put naming storeView) and come back after a reload
//   AW-19 BURY (Tyler live 10-18, "can't bury bones"): bones offer Bury all; it is
//         ONE set_activity { kind:'artisan', id:'bury_bones' } and nothing else, the
//         Burying line reads the server's pointer, Stop is ONE set_activity idle, and
//         the bag and the Prayer XP change only from the envelope (and stay after a reload)
//   AW-20 COOK ALL (playtest 10-22: Raw Wolf Meat sold for 1 gp, nothing said it cooks):
//         raw food with a one-input Cooking recipe to food offers Cook all, the same ONE
//         set_activity { kind:'artisan', id:'cook_wolf_meat' }; the Cooking line reads the
//         server's pointer; Stop says what the server made and burnt; the tooltip says it
//         cooks; Sell all loot keeps it; a level under the recipe's says so in words
//   AW-21 EQUIP UPGRADES: ONE equip intent naming every strictly better piece (never the weapon
//         or a piece above the hero's skill), its slots and stacks marked until the answer, a
//         refusal in words with nothing moved, the Shop's offer after a gear purchase, a reload agrees
//   AW-22 GATHERING AND CRAFTING (designer 2026-10-22: the town skills had no door):
//         each gathering and bench skill in the ledger opens its work; a row shows what
//         the server's level opens (and the next two, "Needs Woodcutting 15"); Start is
//         ONE set_activity { kind:'gather'|'artisan', id }, a switch from another is ONE
//         more (no stop first); the work line reads the server's pointer and survives a
//         reload; Stop is ONE idle and says what the server made; a bench row's amount
//         (1 / 5 / All; a tool starts on 1, stock on All) rides the Start as `count` and
//         the running row says the server's "N left"
//   AW-17 the skills are two ledgers (the combat one inside the Character window,
//         tests/character-window.mjs) and Gathering and crafting does not scroll at
//         922x423; a character that has never fought sees the pointer to Hunts
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
/* The readiness line with the fixture's bag and bar (supplies are never 'short' against a restock target any more). */
const AW8_LINE = 'Tyler: ready';
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
const ITEM_RPCS = ['hr_item_lock', 'hr_loot_rule_set', 'hr_hunt_preset_save', 'hr_hunt_preset_apply', 'hr_action_set_options', 'hr_hunt_enter', 'hr_bank_move'];
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
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    if (s.onCall) s.onCall(name, body);
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.next());
    if (name === 'hr-accrue') {
      if (body.verb) {
        await new Promise((ok) => setTimeout(ok, s.delayMs));
        /* A refusal the next intent gets (AW-21), the engine's shape: nothing moved, the code says why. */
        if (s.refuse) { const error = s.refuse; s.refuse = null; return json({ ok: false, verb: body.verb, error }); }
        if (s.onEdge) s.onEdge(body);
        return json(Object.assign({ ok: true, accrued: true }, s.next()));
      }
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (ITEM_RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(s.reply); }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_account_items') return json({ ok: true, rows: [{ slot: null, name: null, item: 'rat_tail', qty: 4, where: 'bank' }, { slot: 1, name: 'Druid', item: 'rat_tail', qty: 2, where: 'bag' }] });
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
  /* AW-19: a gathering or crafting pointer the server holds gets the Stop line (every kind: party-ui PI-TOWN). */
  const { buryLine } = await imp('src/shell/windows/inventory/bury.js');
  if (!/stop it here\.$/.test(buryLine({ read: (k) => (k === 'state' ? { active_kind: 'gather', active_id: 'copper_rock' } : null) })))
    fails.push('AW-19 a gathering pointer gets no Stop line, so it would run unseen');
  if (edgeBody(0, 'set_activity', { activity: { kind: 'combat', id: 'rat' } }, 'x')) fails.push('AW-0 edgeBody let the client declare a fight through set_activity');
  /* BONES ARE FOR PRAYER (ruling 2026-10-14; Brannoc 10-22: the tooltip said "Sell it at the shop" and Sell all loot sold
     them): an item a recipe spends without making anything is kept out of Sell all loot, and its tooltip says its use. */
  const { lootToSell } = await imp('src/shell/bag-model.js');
  const { usesOf } = await imp('src/shell/item-lore.js');
  const sold = lootToSell([{ id: 'bones', qty: 15 }, { id: 'rat_tail', qty: 4 }, { id: 'razor_claw', qty: 1 }]);
  if (sold.join(',') !== 'rat_tail') fails.push('AW-0 Sell all loot would sell ' + sold.join(', ') + ' (bones and offerings are kept for Prayer)');
  const bones = usesOf('bones');
  if (!bones.some((l) => /^Bury it to train Prayer/.test(l)) || bones.some((l) => /sell/i.test(l))) fails.push('AW-0 the bones tooltip reads ' + JSON.stringify(bones));
  /* AW-20: what cooks is read off the recipe rows (no id list); the bench refuses in words, from the server's level. */
  const { cookOf } = await imp('src/shell/bag-model.js');
  const { buryRecipeOf, buryBlock, buryLabel } = await imp('src/shell/windows/inventory/bury.js');
  const cooks = ['raw_wolf_meat', 'shrimp', 'turnip', 'wheat', 'cooked_wolf_meat', 'bones'].map((id) => (cookOf(id) ? cookOf(id).recipe.id : null));
  if (cooks.join() !== 'cook_wolf_meat,cook_shrimp,cook_turnip,cook_wheat_bread,,') fails.push('AW-20 cookOf reads ' + cooks.join());
  if (lootToSell([{ id: 'raw_wolf_meat', qty: 4 }, { id: 'rat_tail', qty: 1 }]).join() !== 'rat_tail') fails.push('AW-20 Sell all loot would sell the raw meat');
  const meat = usesOf('raw_wolf_meat');
  if (!meat.includes('Cook it into food (Cooking 5)')) fails.push('AW-20 the raw meat tooltip reads ' + JSON.stringify(meat));
  const cs = (lv, inv, st) => ({ read: (k) => (k === 'skills' ? { cooking: { xp: 0, level: lv } } : k === 'inventory' ? inv : k === 'state' ? st || { active_kind: 'idle', active_id: null } : null) });
  const wolf = buryRecipeOf('raw_wolf_meat');
  const words = [buryBlock(cs(1, { raw_wolf_meat: 3 }), wolf), buryBlock(cs(5, { raw_wolf_meat: 3 }), wolf), buryBlock(cs(30, { wheat: 2 }), buryRecipeOf('wheat')),
    buryBlock(cs(5, { raw_wolf_meat: 3 }, { active_kind: 'artisan', active_id: 'cook_shrimp' }), wolf), buryLabel(wolf, 3)];
  if (words.join('|') !== 'Needs Cooking 5 (you have 1).||Needs 3 Wheat for one.|Already cooking. Stop it first.|Cook all') fails.push('AW-20 the bench says ' + JSON.stringify(words));
  /* AW-21 PURE: "Equip upgrades" by the core's numbers for the CURRENT style (src/shell/upgrade-plan.js). */
  const { upgradePlan, upgradeWords } = await imp('src/shell/upgrade-plan.js');
  const lv1 = { defense: { level: 1 }, melee: { level: 1 }, ranged: { level: 1 }, magic: { level: 1 } };
  const plan = (equipment, bag, skills = lv1) => upgradePlan({ equipment, bag: bag.map(([id, qty]) => ({ id, qty: qty || 1 })), skills, level: 5 });
  const ops = (p) => JSON.stringify(Object.fromEntries(Object.entries(p.ops).sort(([a], [b]) => (a < b ? -1 : 1))));
  /* A melee hero wears the outfitter's belt (heavy, -1 Ranged/Magic accuracy); a bow hero does not (its accuracy would drop). */
  const sword = plan({ weapon: 'bronze_sword' }, [['leather_gloves'], ['bronze_belt']]);
  if (ops(sword) !== '{"belt":"bronze_belt","gloves":"leather_gloves"}') fails.push('AW-21 a sword hero would put on ' + ops(sword));
  const bow = plan({ weapon: 'shortbow' }, [['leather_gloves'], ['bronze_belt']]);
  if (ops(bow) !== '{"gloves":"leather_gloves"}') fails.push('AW-21 a bow hero would put on ' + ops(bow) + ' (the heavy belt costs Ranged accuracy)');
  /* Two copper rings fill both ring slots; the one-line preview names the change. */
  const rings = plan({ weapon: 'bronze_sword' }, [['copper_ring', 2]]);
  if (ops(rings) !== '{"ring1":"copper_ring","ring2":"copper_ring"}' || upgradeWords(rings) !== 'Wear Copper Ring ×2 (+1 Melee accuracy each).') fails.push('AW-21 two rings: ' + ops(rings) + ' / ' + upgradeWords(rings));
  /* Never the hands: a better weapon or a shield in the bag is the player's choice of style. */
  const hands = plan({ weapon: 'bronze_sword' }, [['iron_sword'], ['practice_shield']], { melee: { level: 99 }, defense: { level: 99 } });
  if (Object.keys(hands.ops).length) fails.push('AW-21 Equip upgrades would change the hands: ' + ops(hands));
  /* A worn piece is never traded away: the plate Bronze Belt (more Defense) never replaces a worn Leather Belt (its critical chance). */
  const worn = plan({ weapon: 'bronze_sword', belt: 'leather_belt' }, [['bronze_belt']]);
  if ('belt' in worn.ops) fails.push('AW-21 Equip upgrades traded away a worn belt: ' + ops(worn));
  /* Unknown skills read as "cannot wear yet". */
  const blind = plan({ weapon: 'bronze_sword' }, [['iron_helm']], null);
  if (Object.keys(blind.ops).length) fails.push('AW-21 with no server skills Equip upgrades would put on ' + ops(blind));
  /* AW-22: town work. The client may declare a gathering node (never a fight); a skill shows what its server level opens,
     then the next two; a row refuses in words from the server's level and bag. */
  if (!edgeBody(0, 'set_activity', { activity: { kind: 'gather', id: 'copper_rock' } }, 'x')) fails.push('AW-22 edgeBody refused a gathering node');
  const { rowsFor } = await imp('src/shell/windows/work.js');
  const { workBlock, workRow, runsOf } = await imp('src/shell/town-work.js');
  const smith = rowsFor('smithing', 1, { copper_ore: 10 }).map((w) => w.id);
  if (smith.slice(-2).join() !== 'forge_bronze_axe,forge_bronze_pickaxe' || !smith.includes('smelt_bronze') || smith.length !== 5) fails.push('AW-22 Smithing 1 shows ' + smith.join());
  const wcs = (lv, inv) => ({ read: (k) => (k === 'skills' ? { smithing: { xp: 0, level: lv } } : k === 'inventory' ? inv : null) });
  const bronze = workRow('artisan', 'smelt_bronze');
  const said = [workBlock(wcs(1, { copper_ore: 1 }), bronze, false), workBlock(wcs(1, { copper_ore: 2 }), bronze, true),
    workBlock(wcs(1, {}), workRow('artisan', 'forge_bronze_axe'), false), workBlock(wcs(1, { copper_ore: 2 }), bronze, false), String(runsOf(bronze.row, { copper_ore: 11 })),
    workBlock(wcs(1, {}), bronze, false)];
  if (said.join('|') !== 'Needs 2 Copper Ore (you have 1).|Not while a hunt is running.|Needs Smithing 3.||5|No Copper Ore in your bag.') fails.push('AW-22 the work rows say ' + JSON.stringify(said));
  return fails;
}

async function checks(overrides, shots) {
  const fails = overrides ? [] : await pure();
  const { server, port } = await serve(Object.assign({}, HOOK, overrides || {}));
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
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
        const loadsBefore = sent(s, 'hr_load').length;
        await page.click('.hw-pick [data-hs-act="primary"]');
        const mid = await page.evaluate(() => ({ off: document.querySelector('.hw-pick [data-hs-act="primary"]').disabled,
          slot: document.querySelector('.hw-slot[data-slot="weapon"]').classList.contains('is-wearing'),
          busy: document.querySelector('.hw-slot[data-slot="weapon"]').getAttribute('aria-busy'),
          stack: document.querySelector('.hw-pocket[data-item="steel_sword"]').classList.contains('is-wearing'),
          others: document.querySelectorAll('.hw-slot.is-wearing, .hw-pocket.is-wearing').length }));
        if (!mid.off) fails.push('AW-4 the primary stayed on while the equip intent was in flight');
        /* r16 "equipping answers at once": from the press, the weapon slot and the sword's stack carry the pending mark. */
        if (!mid.slot || mid.busy !== 'true' || !mid.stack || mid.others !== 2) fails.push('AW-4 the equip in flight is not marked on its slot and stack: ' + JSON.stringify(mid));
        await wait(page, () => !document.querySelector('.hw-pick [data-hs-act="primary"]').disabled, null, 3000);
        await page.waitForTimeout(150);
        /* The engine's answer IS the envelope: it is applied as it stands, with no second round trip to hr_load. */
        if (sent(s, 'hr_load').length !== loadsBefore) fails.push('AW-4 the equip answer cost a second round trip (hr_load after the intent)');
        if (await page.evaluate(() => document.querySelectorAll('.hw-slot.is-wearing, .hw-pocket.is-wearing').length)) fails.push('AW-4 the pending mark stayed after the server answered');
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

    { // AW-7 no supplies in the Shop; AW-8 hunt prep
      /* The fixture's server still offers food, drink and ammo (the pre-2026-11-02 section): the client must drop them. */
      /* The hero is BURYING when Use is pressed (Andy live 10-21: "burying locks an action"), so in town:
         the fixture's hunt has ended (Use is town-only since presets C4; tests/preset-names.mjs holds that rule).
         The Shop lists the outfitter's gear above the tools (designer 2026-10-22, 2026-11-24-shop-outfitter.sql). */
      const tools = (e) => { e.shop = Object.assign({}, e.shop, { offers: e.shop.offers.concat([{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 },
        { offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 }]) });
        e.state = Object.assign({}, e.state, { active_kind: 'artisan', active_id: 'bury_bones' });
        e.hunt = Object.assign({}, e.hunt, { ended: true }); };
      const { ctx, page, s, up } = await open({ mutateEnv: tools });
      if (up) {
        await openWin(page, 'v', 'shop');
        await page.waitForTimeout(150);
        const shop = await page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('.hw-shop .hw-tab')).map((b) => b.getAttribute('data-tab')),
          lines: Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line')).map((l) => l.getAttribute('data-item')),
          refill: !!document.querySelector('.hw-shop [data-hs-act="refill"]') }));
        if (shop.tabs.join() !== 'buy,sell' || shop.refill) fails.push('AW-7 the Shop still has a refill: ' + JSON.stringify(shop));
        if (shop.lines.join() !== 'leather_gloves,bronze_axe') fails.push('AW-7 the Shop offers ' + JSON.stringify(shop.lines) + ', not the gear then the tools alone');
        /* The session reader is the first filter (the Buy lists only draw their own kinds, so they mask it): it drops
           the fixture's food, drink and ammo itself. */
        const kept = await page.evaluate(async (offers) => (await import('/src/session/item-sections.js?v=0.1.0'))
          .shopOf({ read: (k) => (k === 'shop' ? { offers } : null) }).offers.map((o) => o.kind), FIXTURE.shop.offers);
        if (kept.length) fails.push('AW-7 the session keeps Shop offers of kind ' + JSON.stringify(kept) + ' the server must not sell');
        if (shots) await shot(page, 'alpha-1440x900-shop-tools');
        await openWin(page, 'p', 'hunt-prep');
        await page.waitForTimeout(200);
        if (await page.evaluate(() => !!document.querySelector('[data-hs-act="refill"]'))) fails.push('AW-7 Hunt prep still offers a refill');
        const line = await page.evaluate(() => document.querySelector('.hw-ready-line b').textContent);
        if (line !== AW8_LINE) fails.push('AW-8 the readiness line reads "' + line + '"');
        if (shots) await shot(page, 'alpha-1440x900-hunt-prep');
        await page.click('[data-hs-act="apply"][data-preset="0"]');
        /* Use is TWO round trips here (stop the bury, then the apply): wait for the apply itself, not a fixed 600 ms
           (a loaded box answered the first after it and read "Use sent []"); then let any second, wrong one land. */
        for (let i = 0; i < 40 && !sent(s, 'hr_hunt_preset_apply').length; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const ap = sent(s, 'hr_hunt_preset_apply');
        if (ap.length !== 1 || ap[0].body.p_preset !== 0) fails.push('AW-8 Use sent ' + JSON.stringify(ap.map((c) => c.body)));
        /* A running bury yields: ONE set_activity idle (the engine pays the bones buried so far) BEFORE the apply. */
        const order = s.calls.map((c, i) => [i, c]).filter(([, c]) => c.name === 'hr_hunt_preset_apply' || (c.name === 'hr-accrue' && c.body.verb === 'set_activity'));
        if (order.length !== 2 || order[0][1].name !== 'hr-accrue' || JSON.stringify(order[0][1].body.activity) !== '{"kind":"idle"}')
          fails.push('AW-8 a burying hero\'s Use did not stop the bury first: ' + JSON.stringify(order.map(([, c]) => c.name + ':' + JSON.stringify(c.body.activity || c.body.p_preset))));
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
      } else fails.push('AW-9 the screen did not mount');
      await ctx.close();
    }

    { // AW-12 .. AW-14, AW-16: Tyler's first playtest (10-18), in town with no hunt running
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3 };
        /* a stale restock target BELOW the bag's 14 bread is ignored: the hunt carries the whole stack */
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
          if (!bread || bread.qty !== 14) fails.push('AW-14 the hunt did not carry the whole bread stack: ' + JSON.stringify(b && b.p_bag));
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
        e.bank = { oak_logs: 12, iron_bar: 3, shrimp: 2 };
        e.inventory = Object.assign({}, e.inventory, { raw_wolf_meat: 4, raw_bear_meat: 2 });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const shift = (from, to, id, n) => { from[id] -= n; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + n; };
      s.onCall = (name, b) => {
        if (name === 'hr_bank_move') { if (b.p_dir === 'deposit') shift(s.env.inventory, s.env.bank, b.p_item, b.p_qty); else shift(s.env.bank, s.env.inventory, b.p_item, b.p_qty); }
        if (name === 'hr-accrue' && b.verb === 'set_activity') {
          if (b.activity.kind === 'artisan') Object.assign(s.env.state, { active_kind: 'artisan', active_id: b.activity.id });
          else {
            const inv = s.env.inventory;
            if (s.env.state.active_id === 'bury_bones') { s.env.skills.prayer.xp += 6 * (inv.bones || 0); delete inv.bones; }
            if (s.env.state.active_id === 'cook_wolf_meat') { s.env.skills.cooking.xp += 100; inv.cooked_wolf_meat = inv.raw_wolf_meat - 1; inv.burnt_food = 1; delete inv.raw_wolf_meat; }
            Object.assign(s.env.state, { active_kind: 'idle', active_id: null });
          }
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
          /* AW-23 sort and filter: storage holds oak_logs 11, copper_ore 3, shrimp 2 (iron_bar went back to the bag) */
          const W = '[data-hs-win="storage"] ';
          const grid = (sd) => page.evaluate((x) => [...document.querySelectorAll('[data-hs-win="storage"] .hw-pockets[data-side="' + x + '"] .hw-pocket')].map((li) => li.getAttribute('data-item')).join(), sd);
          await page.click(W + '.hw-cat[data-cat="food"]');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'shrimp' || (await grid('bag')).includes('copper_ore')) fails.push('AW-23 the Food chip shows storage ' + (await grid('bank')) + ' / bag ' + (await grid('bag')));
          await page.click(W + '.hw-cat[data-cat="all"]');
          await page.selectOption(W + '[data-hs-act="sort"]', 'count');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'oak_logs,copper_ore,shrimp') fails.push('AW-23 Count orders storage ' + (await grid('bank')));
          await page.fill(W + '.hw-q', 'cop');
          await page.waitForTimeout(200);
          if ((await grid('bank')) !== 'copper_ore' || (await grid('bag')) !== 'copper_ore') fails.push('AW-23 the search "cop" shows storage ' + (await grid('bank')) + ' / bag ' + (await grid('bag')));
          await page.fill(W + '.hw-q', '');
          await page.selectOption(W + '[data-hs-act="sort"]', 'newest');
          await page.click(W + '[data-side="bag"] .hw-pocket[data-item="iron_bar"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(700);
          if (!(await grid('bank')).startsWith('iron_bar,')) fails.push('AW-23 Newest does not put the stack just stored first: ' + (await grid('bank')));
          await page.click(W + '.hw-cat[data-cat="loot"]');
          await page.selectOption(W + '[data-hs-act="sort"]', 'count');
          await page.waitForTimeout(1900);
          const views = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.storeView).filter(Boolean);
          const last = views[views.length - 1];
          if (!last || last.cat !== 'loot' || last.sort !== 'count') fails.push('AW-23 the chip and sort were not put as storeView: ' + JSON.stringify(views));
          if (!(await reloadAndPlay(page))) fails.push('AW-23 the reload did not come back');
          else {
            await openWin(page, 't', 'storage');
            await page.waitForTimeout(300);
            const sortNow = await page.evaluate(() => document.querySelector('[data-hs-win="storage"] [data-hs-act="sort"]').value);
            if (sortNow !== 'count' || (await grid('bank')) !== 'copper_ore,iron_bar') fails.push('AW-23 after a reload the sort is ' + sortNow + ' and storage shows ' + (await grid('bank')));
            await page.click(W + '.hw-cat[data-cat="all"]');
          }
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
          if (!/^Burying Bones: 8 Bones left\. Your bag and Prayer XP update as it goes\./.test(line)) fails.push('AW-19 no Burying line from the server pointer: ' + JSON.stringify(line));
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
            /* AW-20 a dish above the server's Cooking level (11 < 40) says so in words and sends nothing */
            await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="raw_bear_meat"]');
            /* the control is checked, not clicked blind: raw food with no Cook all is AW-20 red BY NAME, never a click timeout (HARNESS) */
            const bear = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]'); return b && !b.hidden && !b.disabled ? b.textContent : null; });
            if (bear !== 'Cook all') fails.push('AW-20 the raw bear meat offers ' + JSON.stringify(bear) + ', not Cook all');
            else await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
            await page.waitForTimeout(300);
            const low = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
            if (bear === 'Cook all' && (low !== 'Needs Cooking 40 (you have 11).' || sent(s, 'hr-accrue', 'set_activity').length !== 2)) fails.push('AW-20 Cook all above the level said ' + JSON.stringify(low));
            /* AW-20 cook all: the raw meat's primary is Cook all; the same ONE set_activity; Stop says what the server made */
            await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="raw_wolf_meat"]');
            const cp = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]'); return b && !b.hidden && !b.disabled ? b.textContent : null; });
            if (cp !== 'Cook all') fails.push('AW-20 the raw meat offers "' + cp + '", not Cook all');
            else {
              await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
              await page.waitForTimeout(800);
              const go = sent(s, 'hr-accrue', 'set_activity').slice(2);
              if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"artisan","id":"cook_wolf_meat"}') fails.push('AW-20 Cook all sent ' + JSON.stringify(go.map((c) => c.body)));
              const line = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-burying'); return b && b.classList.contains('is-on') ? b.textContent : ''; });
              if (!/^Cooking Raw Wolf Meat: 0 cooked so far, 4 Raw Wolf Meat left\. Your bag and Cooking XP update as it goes\./.test(line)) fails.push('AW-20 no Cooking line from the server pointer: ' + JSON.stringify(line));
              if ((await count(page, 'raw_wolf_meat')) !== '4') fails.push('AW-20 the bag painted the cook before the server did it: x' + (await count(page, 'raw_wolf_meat')));
              if (shots) await shot(page, 'alpha-1440x900-cooking');
              await page.click('[data-hs-win="inventory"] [data-hs-act="bury-stop"]');
              await page.waitForTimeout(800);
              const msg = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
              if (msg !== 'Done: 3 Cooked Wolf Meat, 1 burnt, +100 Cooking XP.') fails.push('AW-20 after the server cooked them: ' + JSON.stringify(msg));
              if (!(await reloadAndPlay(page))) fails.push('AW-20 the reload did not come back');
              else {
                await openWin(page, 'b', 'inventory');
                await page.waitForTimeout(300);
                if ((await count(page, 'cooked_wolf_meat')) !== '3' || (await page.$('[data-hs-win="inventory"] .hw-pocket[data-item="raw_wolf_meat"]'))) fails.push('AW-20 after a reload the bag shows cooked x' + (await count(page, 'cooked_wolf_meat')));
              }
            }
          }
        }
      }
      if (errors.length) fails.push('AW-18 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-21 EQUIP UPGRADES (gold-sinks designer + 10-22 playtest: four menus per piece): ONE equip intent naming
      // every better piece, never the weapon or a piece the hero cannot wear yet; the slots and stacks marked until the
      // answer; a refusal in words with nothing moved; the Shop offers it right after a gear purchase; a reload agrees
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        Object.assign(e.inventory, { leather_gloves: 1, bronze_belt: 1, copper_ring: 1, steel_helm: 1 });
        /* Melee 30: the bag's Steel Sword is better than the worn Iron Sword, and still never put on (the weapon sets the style). */
        e.skills.melee = { xp: 4700, level: 30, frac: 0 };
        e.shop.offers.push({ offer: 'supply.leather_gloves', item: 'leather_gloves', kind: 'gear', price: 160 });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      /* The stateful engine: an equip moves one unit out of the bag per slot and the worn piece back in. */
      s.onEdge = (b) => {
        if (b.verb !== 'equip') return;
        for (const [slot, id] of Object.entries(b.equip)) {
          const was = s.env.equipment[slot];
          if (was) s.env.inventory[was] = (s.env.inventory[was] || 0) + 1;
          s.env.equipment[slot] = id;
          if (!--s.env.inventory[id]) delete s.env.inventory[id];
        }
      };
      const WANT = '{"belt":"bronze_belt","body":"iron_platebody","gloves":"leather_gloves","helmet":"iron_helm","ring2":"copper_ring"}';
      const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1))));
      const msg = () => page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
      if (up) {
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(250);
        const pre = await page.evaluate(() => { const l = document.querySelector('.hw-inv .hw-upgrade'); return { on: l.classList.contains('is-on'), q: l.querySelector('.hw-upgrade-q').textContent, off: l.querySelector('button').disabled }; });
        if (!pre.on || pre.off || !/^Wear Iron Helm \(\+\d+ Defense/.test(pre.q) || /Steel/.test(pre.q)) fails.push('AW-21 the preview line is wrong before the press: ' + JSON.stringify(pre));
        /* A refusal: nothing moves, the words say why. */
        s.refuse = 'requirement_not_met';
        await page.click('.hw-inv [data-hs-act="equip-upgrades"]');
        await page.waitForTimeout(50);
        await wait(page, () => !document.querySelector('.hw-inv [data-hs-act="equip-upgrades"]').disabled, null, 3000);
        if ((await msg()) !== 'Your skill is too low to wear that yet. Nothing was put on.') fails.push('AW-21 a level refusal reads ' + JSON.stringify(await msg()));
        if (await page.evaluate(() => document.querySelector('.hw-slot[data-slot="helmet"]').getAttribute('data-item'))) fails.push('AW-21 the doll changed on a refusal');
        if (shots) await shot(page, 'alpha-1440x900-equip-upgrades');
        /* The press that lands: ONE intent, every slot and stack marked until the answer. */
        await page.click('.hw-inv [data-hs-act="equip-upgrades"]');
        const mid = await page.evaluate(() => ({ slots: Array.from(document.querySelectorAll('.hw-slot.is-wearing')).map((b) => b.getAttribute('data-slot')).sort().join(','),
          stacks: document.querySelectorAll('.hw-pocket.is-wearing').length, off: document.querySelector('.hw-inv [data-hs-act="equip-upgrades"]').disabled }));
        if (mid.slots !== 'belt,body,gloves,helmet,ring2' || mid.stacks !== 5 || !mid.off) fails.push('AW-21 the upgrades in flight are not marked on their slots and stacks: ' + JSON.stringify(mid));
        await wait(page, () => !document.querySelector('.hw-slot.is-wearing'), null, 3000);
        await page.waitForTimeout(200);
        const eqs = sent(s, 'hr-accrue', 'equip');
        if (eqs.length !== 2 || sorted(eqs[0].body.equip) !== WANT || sorted(eqs[1].body.equip) !== WANT) fails.push('AW-21 Equip upgrades sent ' + JSON.stringify(eqs.map((c) => c.body.equip)) + ', want ' + WANT + ' once per press');
        if (eqs.some((c) => 'weapon' in c.body.equip || 'shield' in c.body.equip)) fails.push('AW-21 Equip upgrades touched the hands (the weapon sets the style)');
        const after = await page.evaluate(() => ({ helm: document.querySelector('.hw-slot[data-slot="helmet"]').getAttribute('data-item'), weapon: document.querySelector('.hw-slot[data-slot="weapon"]').getAttribute('data-item'),
          line: document.querySelector('.hw-inv .hw-upgrade').classList.contains('is-on') }));
        if (after.helm !== 'iron_helm' || after.weapon !== 'iron_sword' || after.line || (await msg()) !== 'Put on 5 pieces.') fails.push('AW-21 after the server answered: ' + JSON.stringify(after) + ' ' + JSON.stringify(await msg()));
        if (!(await reloadAndPlay(page))) fails.push('AW-21 the reload did not come back');
        else {
          await openWin(page, 'b', 'inventory');
          await page.waitForTimeout(250);
          const back = await page.evaluate(() => ({ belt: document.querySelector('.hw-slot[data-slot="belt"]').getAttribute('data-item'), line: document.querySelector('.hw-inv .hw-upgrade').classList.contains('is-on') }));
          if (back.belt !== 'bronze_belt' || back.line) fails.push('AW-21 after a reload: ' + JSON.stringify(back));
        }
        /* The Shop: nothing offered until a gear purchase, then the line with the new piece. */
        s.env.inventory.copper_ring = 1;
        delete s.env.equipment.ring1;
        await pushEnvelope(page, s);
        await openWin(page, 'v', 'shop');
        await page.waitForTimeout(200);
        if (await page.evaluate(() => document.querySelector('.hw-shop .hw-upgrade').classList.contains('is-on'))) fails.push('AW-21 the Shop offers Equip upgrades before any gear purchase');
        await page.click('.hw-shop [data-hs-act="buy"][data-offer="supply.leather_gloves"]');
        await wait(page, () => document.querySelector('.hw-shop .hw-upgrade.is-on'), null, 3000);
        const shopLine = await page.evaluate(() => document.querySelector('.hw-shop .hw-upgrade-q').textContent);
        if (!/^Wear Copper Ring \(/.test(shopLine)) fails.push('AW-21 after a gear purchase the Shop offers ' + JSON.stringify(shopLine));
        if (shots) await shot(page, 'alpha-1440x900-shop-upgrades');
      } else fails.push('AW-21 the town character did not mount');
      if (errors.length) fails.push('AW-21 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-22 GATHERING AND CRAFTING: a skill opens its work; Start is ONE set_activity; the server's numbers only
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      s.onCall = (name, b) => {
        if (name !== 'hr-accrue' || b.verb !== 'set_activity') return;
        const st = s.env.state, inv = s.env.inventory;
        /* "Make N": the server stores the count and projects it as bench_run.left. */
        if (b.activity.kind !== 'idle') { Object.assign(st, { active_kind: b.activity.kind, active_id: b.activity.id }); s.env.bench_run = { left: b.activity.count || null }; return; }
        if (st.active_id === 'smelt_bronze') { inv.bronze_bar = 5; delete inv.copper_ore; s.env.skills.smithing.xp += 39; }
        Object.assign(st, { active_kind: 'idle', active_id: null });
      };
      const W = '[data-hs-win="skills-trade"]';
      const rowsOf = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-work.is-on .hw-work-row')).map((li) => {
        const b = li.querySelector('.hw-work-go');
        const n = li.querySelector('.hw-work-n .hh-seg[aria-pressed="true"]');
        return { id: li.getAttribute('data-id'), btn: b.textContent, off: b.disabled, why: li.querySelector('.hw-work-why').textContent, what: li.querySelector('.hw-work-what').textContent, n: n ? n.textContent : null };
      }), W);
      const nowText = () => page.evaluate((w) => { const b = document.querySelector(w + ' .hw-work-now'); return b && b.classList.contains('is-on') ? b.querySelector('.hw-burying-q').textContent : ''; }, W);
      const msg = () => page.evaluate((w) => document.querySelector(w + ' .hh-intent-msg').textContent, W);
      if (!up) fails.push('AW-22 the town did not mount');
      else {
        await openWin(page, 'g', 'skills-trade');
        await page.waitForTimeout(300);
        const doors = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-skill[data-hs-act="open-skill"]')).map((li) => li.getAttribute('data-skill')).join(), W);
        if (doors !== 'woodcutting,mining,fishing,cooking,crafting,smithing,runecrafting') fails.push('AW-22 the skills that open their work: ' + doors);
        if (shots) await shot(page, 'work-1440x900-ledger');
        await page.click(W + ' .hw-skill[data-skill="woodcutting"]');
        await page.waitForTimeout(300);
        let r = await rowsOf();
        const tree = r.find((x) => x.id === 'normal_tree'), oak = r.find((x) => x.id === 'oak_tree');
        if (!tree || tree.off || tree.btn !== 'Start' || !/^Normal Log · [\d.]+ s · \d+ XP each$/.test(tree.what) || tree.why !== '40 in your bag') fails.push('AW-22 Woodcutting offers ' + JSON.stringify(tree));
        if (!oak || !oak.off || oak.why !== 'Needs Woodcutting 15.') fails.push('AW-22 a tree above the server level reads ' + JSON.stringify(oak));
        await page.click(W + ' .hw-work-row[data-id="normal_tree"] .hw-work-go');
        await page.waitForTimeout(800);
        let go = sent(s, 'hr-accrue', 'set_activity');
        if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"gather","id":"normal_tree"}') fails.push('AW-22 Start sent ' + JSON.stringify(go.map((c) => c.body)));
        if (!/^Chopping the Normal Tree: 0 chopped so far\. It keeps going while you are away/.test(await nowText())) fails.push('AW-22 no line from the server pointer: ' + JSON.stringify(await nowText()));
        r = await rowsOf();
        if ((r.find((x) => x.id === 'normal_tree') || {}).btn !== 'Stop') fails.push('AW-22 the running tree offers no Stop');
        /* AW-22 LIVE (Tyler 2026-10-22, "the bag needs to update in real time"): with the window open the
           town work is re-read on its own (town-poll.js, townPollMs); the server has chopped three logs by then,
           and the line says so from that answer, not from a guess. */
        const asks = () => s.calls.filter((c) => c.name === 'hr-accrue' && !c.body.verb).length;
        const asked = asks();
        const onSet = s.onCall;
        let chopped = false;
        s.onCall = (name, b) => {
          if (name === 'hr-accrue' && !b.verb && s.env.state.active_id === 'normal_tree' && !chopped) {
            chopped = true; s.env.inventory.normal_log = (s.env.inventory.normal_log || 0) + 3;
          }
          onSet(name, b);
        };
        for (let i = 0; i < 44 && asks() === asked; i++) await page.waitForTimeout(500);
        await page.waitForTimeout(400);
        s.onCall = onSet;
        if (asks() === asked) fails.push('AW-22 watched town work was never re-read (no settle asked in 22 s)');
        else if (!/^Chopping the Normal Tree: 3 chopped so far\. /.test(await nowText())) fails.push('AW-22 after a settle mid-run the line reads ' + JSON.stringify(await nowText()));
        if (shots) await shot(page, 'work-1440x900-woodcutting');
        if (!(await reloadAndPlay(page))) fails.push('AW-22 the reload did not come back');
        else {
          await openWin(page, 'g', 'skills-trade');
          await page.waitForTimeout(300);
          /* After a reload "so far" has no start to count from: the line says what the server's bag holds. */
          if (!/^Chopping the Normal Tree: \d+ in your bag\./.test(await nowText())) fails.push('AW-22 after a reload the work line reads ' + JSON.stringify(await nowText()));
          /* A switch straight from gathering to a bench: ONE intent (the server collects the old one first). */
          await page.click(W + ' .hw-skill[data-skill="smithing"]');
          await page.waitForTimeout(300);
          r = await rowsOf();
          const bar = r.find((x) => x.id === 'smelt_bronze'), axe = r.find((x) => x.id === 'forge_bronze_axe');
          if (!bar || bar.off || !/^Makes up to 5 · [\d.]+ s · \d+ XP each$/.test(bar.why) || bar.what !== '2 Copper Ore → Bronze Bar') fails.push('AW-22 Smithing offers ' + JSON.stringify(bar));
          if (!axe || !axe.off || axe.why !== 'Needs Smithing 3.') fails.push('AW-22 a recipe above the server level reads ' + JSON.stringify(axe));
          /* "MAKE N" (lane c-work-fixes): a bar starts on All, a tool on 1; the player picks 5 and Start sends count 5. */
          if (bar && bar.n !== 'All') fails.push('AW-22 a bar row starts on ' + bar.n + ', not All');
          if (axe && axe.n !== '1') fails.push('AW-22 a tool row starts on ' + axe.n + ', not 1');
          await page.click(W + ' .hw-work-row[data-id="smelt_bronze"] .hw-work-n [data-n="5"]');
          await page.waitForTimeout(200);
          r = await rowsOf();
          const five = r.find((x) => x.id === 'smelt_bronze');
          if (!five || five.n !== '5' || !/^Makes 5 of up to 5 · /.test(five.why)) fails.push('AW-22 picking 5 reads ' + JSON.stringify(five));
          if (shots) await shot(page, 'work-1440x900-smithing');
          await page.click(W + ' .hw-work-row[data-id="smelt_bronze"] .hw-work-go');
          await page.waitForTimeout(800);
          go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 2 || JSON.stringify(go[1].body.activity) !== '{"kind":"artisan","id":"smelt_bronze","count":5}') fails.push('AW-22 the switch sent ' + JSON.stringify(go.map((c) => c.body)));
          if (!/^Making Bronze Bar: 0 made so far, \d+ Copper Ore left\. It stops when they run out\.$/.test(await nowText())) fails.push('AW-22 the bench line reads ' + JSON.stringify(await nowText()));
          r = await rowsOf();
          if (!/^Working on it now · 5 left · Makes 5 of up to 5 · /.test((r.find((x) => x.id === 'smelt_bronze') || {}).why)) fails.push('AW-22 the bag was spent before the server did it: ' + JSON.stringify(r.find((x) => x.id === 'smelt_bronze')));
          await page.click(W + ' .hw-work-now [data-hs-act="work-stop"]');
          await page.waitForTimeout(800);
          go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 3 || JSON.stringify(go[2].body.activity) !== '{"kind":"idle"}') fails.push('AW-22 Stop sent ' + JSON.stringify(go.map((c) => c.body)));
          if ((await msg()) !== 'Done: 5 Bronze Bar, +39 Smithing XP.' || (await nowText())) fails.push('AW-22 after the server smelted them: ' + JSON.stringify(await msg()));
        }
      }
      if (errors.length) fails.push('AW-22 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
      if (shots) { // the phone sheet
        const ph = await open({ viewport: { width: 922, height: 423 }, mutateEnv: town });
        if (ph.up) {
          await openWin(ph.page, 'g', 'skills-trade');
          await ph.page.click(W + ' .hw-skill[data-skill="cooking"]');
          await ph.page.waitForTimeout(300);
          await shot(ph.page, 'work-922x423-cooking');
        }
        await ph.ctx.close();
      }
    }

    { // AW-17 the skills are two windows and neither scrolls, on the phone too; the first-minute pointer
      /* A character that has killed nothing: Level XP 0 (the core rebuild: Level comes from kills only). */
      const fresh = (e) => { for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'prayer', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 }; for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 }); };
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
    /* A step that threw is HARNESS, never a rule (2026-10-22: AW-8's disabled click "caught" every later
       mutant). A rule whose control a mutant can hide checks for the control and fails BY NAME. */
    fails.push(harnessFail('a page step', e));
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
  ['the Shop lists supplies again', 'src/data/supply-basics.js', "export const SHOP_SOLD_KINDS = Object.freeze(['tool', 'gear', 'seed']);", "export const SHOP_SOLD_KINDS = Object.freeze(['food', 'drink', 'ammo', 'tool', 'gear', 'seed']);"],
  ['an equip in flight is not marked', 'src/shell/windows/inventory/actions.js', '  sc.wearing = { slots: [slot], items: id ? [id] : [] };\n', ''],
  ['Equip upgrades swaps the weapon', 'src/shell/upgrade-plan.js', "const STYLE_SLOTS = new Set(['weapon', 'shield', 'ammo']);", "const STYLE_SLOTS = new Set(['shield', 'ammo']);"],
  ['Equip upgrades wears what the hero cannot use yet', 'src/shell/upgrade-plan.js', '  return !!s && Number.isInteger(s.level) && s.level >= it.reqLv;', '  return true;'],
  ['Equip upgrades marks nothing in flight', 'src/shell/widgets/upgrade-line.js', '  sc.wearing = { slots, items: slots.map((s) => plan.ops[s]) };\n', ''],
  ['Equip upgrades sends one intent per piece', 'src/shell/widgets/upgrade-line.js', "    try { return await cs.edgeIntent('equip', { equip: Object.assign({}, plan.ops) }); } finally { sc.wearing = null; }", "    try { let r; for (const s of slots) r = await cs.edgeIntent('equip', { equip: { [s]: plan.ops[s] } }); return r; } finally { sc.wearing = null; }"],
  ['a level refusal reads as a bare refusal', 'src/data/refusal-words.js', "  requirement_not_met: 'Your skill is too low to wear that yet. Nothing was put on.',\n", ''],
  ['the Shop never offers Equip upgrades', 'src/shell/windows/shop.js', "sc.wear = !!o && o.kind === 'gear';", 'sc.wear = false;'],
  ['the engine answer is re-read (two round trips)', 'src/session/character-session.js', "{ if (!(carries && this._take(ans.body, 'load'))) await this.load(); return { ok: true }; }", '{ await this.load(); return { ok: true }; }'],
  ['the doll wears the item before the server confirms', 'src/shell/windows/inventory/doll.js', '    const id = eq[s] || \'\';', "    const id = (s === 'weapon' && globalThis.__want) || eq[s] || '';"],
  ['a press on a window reaches the World', 'src/world/world-boot.js', "if (!walk || !scene || scene.kind === 'hunt' || !onWorld(e)) return;", "if (!walk || !scene || scene.kind === 'hunt') return;"],
  ['an open window takes the walk keys', 'src/world/world-boot.js', '    if (keyBelongsToField(t, e.code)) { letGo(); return; }', "    if (keyBelongsToField(t, e.code) || (t.closest && t.closest('[data-hs-win]'))) { letGo(); return; }"],
  ['the mill hatch opens nothing', 'src/world/world-boot.js', "    hunt: (id) => emit('entrance', { hunt: id }),", '    hunt: () => false,'],
  ['a hunt carries only part of its own stack', 'src/shell/hunt-list.js', '.map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty) }))', '.map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty, 10) }))'],
  ['a Shift-press in Storage moves one at a time', 'src/shell/windows/storage.js', 'move(cs, sc, repaint, id, ev.shiftKey ? row.qty : 1, action);', 'move(cs, sc, repaint, id, 1, action);'],
  ['a press in Storage moves the whole stack', 'src/shell/windows/storage.js', 'move(cs, sc, repaint, id, ev.shiftKey ? row.qty : 1, action);', 'move(cs, sc, repaint, id, row.qty, action);'],
  ['the Storage chip and sort are not applied', 'src/shell/windows/storage.js', '  const o = { cat: prefs.cat, query: sc.query, sort: prefs.sort,', "  const o = { cat: 'all', query: sc.query, sort: 'name',"],
  ['the amount picker sends the whole stack', 'src/shell/widgets/amount.js', "  return n ? clampAmount(n.value, n.getAttribute('data-max')) : 1;", "  return n ? clampAmount(n.getAttribute('data-max'), n.getAttribute('data-max')) : 1;"],
  ['Enter in the amount picker does nothing', 'src/shell/windows/float-menu.js', "      if (e.key === 'Enter' && def) { e.preventDefault(); e.stopPropagation(); def.click(); }\n", ''],
  ['bones offer no Bury', 'src/shell/windows/inventory/state.js', "  if (br) return ['bury', buryLabel(br, st.qty.get(id))];\n", ''],
  ['Bury debits the bag before the server answers', 'src/shell/windows/inventory/bury.js', "  const qty = (cs.read('inventory') || {})[id] || 0;\n", "  const qty = (cs.read('inventory') || {})[id] || 0;\n  delete cs.read('inventory')[id];\n"],
  ['Stop does not collect', 'src/shell/town-work.js', "cs.edgeIntent('set_activity', { activity: { kind: 'idle' } })", "Promise.resolve({ ok: true })"],
  ['a skill opens no work', 'src/shell/windows/work.js', "attr(li, 'data-hs-act', door ? 'open-skill' : null);", "attr(li, 'data-hs-act', null);"],
  ['the client cannot declare gathering', 'src/session/edge-intents.js', "(v.kind === 'artisan' || v.kind === 'gather')", "v.kind === 'artisan'"],
  ['a work row ignores the server level', 'src/shell/town-work.js', "  if (lv < (w.row.req || 1)) return 'Needs '", "  if (false) return 'Needs '"],
  ['the running row offers no Stop', 'src/shell/windows/work.js', "text(b, running ? 'Stop' : 'Start');", "text(b, 'Start');"],
  ['the Burying line ignores the server pointer', 'src/shell/windows/inventory/bury.js', "    return buryingWord(e) + ' ' + itemName(e.input) + (how ? ': ' + how : '') + '. Your bag and ' + skillName(e.skill) + ' XP update as it goes.';", "    return '';"],
  ['the work line says nothing of how far it has got', 'src/shell/town-work.js', "  return words.charAt(0).toUpperCase() + words.slice(1) + (how ? ': ' + how : '') + '. ' + tail;", "  return words.charAt(0).toUpperCase() + words.slice(1) + '. ' + tail;"],
  ['a watched bench is never re-read', 'src/shell/shell.js', "(wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);", "false) watchTown(ctx.character);"],
  ['raw food offers no Cook all', 'src/shell/bag-model.js', "      if (!r || !r.output || r.gated || kindOf(r.output) !== 'food') continue;", '      continue;'],
  ['the bench ignores the server level', 'src/shell/windows/inventory/bury.js', "  if (lv < e.recipe.req) return 'Needs '", "  if (false) return 'Needs '"],
  ['the skills are one window again', 'src/shell/windows/skills.js', "export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);", "export const renderTradeSkills = skillsWindow([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Crafting']]);"],
  ['a new player gets no pointer to Hunts', 'src/shell/launcher.js', "+ (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>'", "+ '</nav>'"],
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
      : 'alpha-windows: the windows open; patch in place; the server’s counts win; intents only; locks hold; totals first; no supplies in the Shop; Hunts from the hatch in two presses; window presses and focus never steal the World; no void; storage from town; store any amount; storage sorts and filters; bury and cook pay from the server; skills split' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await cleanControl(() => checks(null, null));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of MUTANTS) {
    const over = {};
    const plant = [[file, from, to]].concat(COMPANION[name] ? [COMPANION[name]] : []);
    let missing = null;
    for (const [f, x, y] of plant) {
      const text = over[f] !== undefined ? over[f] : await readFile(join(ROOT, f), 'utf8');
      if (!text.includes(x)) { missing = f; break; }
      over[f] = text.replace(x, y);
    }
    if (missing) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + missing); counts.harness++; continue; }
    const v = await judge(() => (name.startsWith('edgeBody') ? pureMutant(over[file]) : checks(over, null)));
    console.log(report(name, v, counts));
  }
  console.log(exitOf(counts) ? 'alpha-windows --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'alpha-windows --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught, each by a named rule');
  process.exit(exitOf(counts));
}

/* The edge-body mutant is a pure module: run AW-0 against the planted text. */
async function pureMutant(text) {
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const { edgeBody } = await import(url);
  return edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x') ? ['AW-0 edgeBody let a price field through'] : [];
}

main();
