#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows.mjs — THE ALPHA WINDOWS' RULES, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows.mjs                the rules
//   node tests/alpha-windows.mjs --mutate       every planted defect must turn a rule RED
//   node tests/alpha-windows.mjs --pure         the pure rules only (no browser)
//   node tests/alpha-windows.mjs --mutate --only=ticker:   just the mutants named so (the town
//                                               ticker's run on a temp copy of src, in seconds)
//   node tests/alpha-windows.mjs --shots <dir>  also write the visual-gate screenshots
//                                               (1440x900 and 922x423)
//
// mutant-anchors: src/shell/town-ticker.js src/session/refusal.js src/session/character-session.js src/shell/widgets/amount.js src/shell/windows/inventory/bury.js src/shell/windows/inventory/state.js src/shell/windows/float-menu.js src/shell/bag-model.js src/session/item-sections.js src/shell/windows/inventory/grid.js src/shell/windows/inventory/actions.js src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/session/edge-intents.js src/world/world-boot.js src/world/core/camera.js src/shell/windows/hunts.js src/shell/windows/storage.js src/shell/hunt-list.js src/shell/windows/skills.js src/shell/launcher.js src/shell/upgrade-plan.js src/shell/widgets/upgrade-line.js src/shell/intent-words.js src/shell/town-work.js src/shell/windows/work.js src/shell/hunt-ground-facts.js src/shell/windows/hunt-detail.js src/shell/hunt-go.js src/shell/windows/party-finder.js src/data/refusal-words.js src/styles/windows.css src/session/residue.js src/shell/panel-alpha.js src/styles/shell.css src/shell/shell.js src/shell/alerts.js src/shell/windows/hunt-summary.js src/data/shell-windows.js
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
//   AW-7  THE SHOP SELLS NO SUPPLIES (Tyler 2026-10-20): the Shop has Buy, Sell and Services (2026-10-25)
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
//         refusal in words with nothing moved, the Shop's offer after a gear purchase, a reload agrees;
//         the screen never offers what the server refuses (Tyler 2026-10-24): an unmet requirement
//         (the server's numbers) or a running hunt turns Equip / Equip upgrades off with the reason
//         beside it, and a refusal says why on the line pressed, in view
//   AW-22 GATHERING AND CRAFTING (designer 2026-10-22: the town skills had no door):
//         each gathering and bench skill in the ledger opens its work; a row shows what
//         the server's level opens (and the next two, "Needs Woodcutting 15"); Start is
//         ONE set_activity { kind:'gather'|'artisan', id }, a switch from another is ONE
//         more (no stop first); the work line reads the server's pointer and survives a
//         reload; Stop is ONE idle and says what the server made; a bench row's amount
//         (1 / 5 / All; a tool starts on 1, stock on All) rides the Start as `count` and
//         the running row says the server's "N left"
//   AW-24 TOWN WORK COUNTS UP BETWEEN PAYOUTS (Tyler 2026-10-23; src/shell/town-ticker.js runs the
//         server's own span loop on the envelope's numbers, display only). Pure rules:
//         TK-1  one action at a time on the engine's interval: the logs and XP, and the line
//               marks the pending count
//         TK-2  a payout REPLACES: the count restarts from the new watermark, nothing counted twice
//         TK-3  never spent: the bag's stacks, the sale and the primary read the server's count;
//               "Makes up to N" reads the server's bag
//         TK-4  the stop's envelope clears it at once
//         TK-5  a payout under the prediction snaps down to the server's word
//         TK-6  nothing ticks idle, in a hunt, without a server clock, or past the horizon
//         TK-7  a refused settle clears it until a newer record; the character keeps the
//               refusal from its settle until the next answer
//         TK-8  a bench counts its inputs down with the engine's own stop, within "N left"
//         TK-9  a dish that can burn is a roll: inputs and the burn's XP are certain, no stack moves
//         TK-10 ROUNDED DOWN: against the engine as the server runs it (perks, a real roll, its
//               tool carry and XP remainder) it never shows an action, item or XP not paid
//         In the page: Start → the line, the skill bar and the bag tick, pending → never sold
//         → a payout replaces → a lower payout snaps down → a reload restarts from the
//         server's watermark → Stop → nothing ticks.
//   AW-17 the skills are two ledgers (the combat one inside the Character window,
//         tests/character-window.mjs) and Gathering and crafting does not scroll at
//         922x423; a character that has never fought sees the pointer to Hunts
// THE HUNTS WINDOW, master-detail (designer plan 2026-10-22, PRIORITY_BOARD "Hunts, Hunt
// prep and the Party finder"), a Level 1 hero in town:
//   AW-25 the list is one line a ground: the band in words with its tone (in range /
//         above / far above), the solo / party glyph, the best or "New", "Fits your
//         level" on the recommendation's line only; the picked ground's page draws who
//         lives there from the world's style-1 idle frames at x2, standing on one ground
//         line, common / uncommon / rare from the spawn points, the rare and its ONE
//         carrier, the bests (one "Not hunted yet" line when none, the server's best
//         replacing it); on the phone the list, then the page as the sheet, then back
//   AW-26 GO AS: the setups as lines (weapon, role, the bar's first four on the setup
//         on now; a set with no setup row is not offered); Enter as the setup on now is
//         ONE hr_hunt_enter; as another it is ONE hr_hunt_preset_apply then ONE
//         hr_hunt_enter naming it, from one press, every control off in flight; a
//         refused apply enters nothing and says why in words
//   AW-27 BEFORE YOU GO: one line per supply kind in slot order from the server's bar,
//         bag, stamina and gold (the designer's walk-through starter bar word for word);
//         the next envelope replaces every number; a line that stops the hunt is marked
//   AW-28 THE PARTY PATH: a party ground's page offers Find a party (the Party window's
//         finder on that ground and this hero's weapon: ONE read with p_hunt) and Bring
//         your heroes (open heroes in no party); a solo ground's page offers neither
//   AW-29 the round trip: pick a ground, Enter, hunting, back in town: Hunts still holds
//         that ground, after a close and reopen too
//   AW-30 THE WINDOW OPACITY (Tyler 2026-10-24): Settings > Interface > Window opacity at 70
//         puts ONE residue `panelAlpha: 70`, fades a window's floor to 0.7 while its title
//         stays solid, and after a reload the windows are still at 0.7 and the slider says 70%
//   AW-31 THE CLEAN RETURN (designer walk 2026-10-25 #5, #6; Tyler 2026-10-25 Services in the Shop): a hero leaving the
//         Cellar gets the summary as the one notice (no analyzer, party panel or "has ended" toast); its main press is
//         the tutorial card's next step ("Next: Sell what only pays coin", Hunt again second), which opens the Shop with
//         the card inside it while the hunt bar leaves with the summary; the ring walks the Sell tab -> Sell all loot ->
//         the confirmation's Sell, and the confirmation is in view inside the window (it sat under a long list); no
//         Services icon, and R opens the Shop on its Services tab (stamina and Blessings), closed or open
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
/* The hunt rows (each ground's theme) the Hunts page draws. */
const HUNTS = (await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href)).HUNT_INDEX;
/* The Cellar's one gear line, alone, as the page must print it (its math is checked from the rows in huntsPure). */
/* The Level XP a hero at Level 30 holds (src/core/xp.js): gear is worn by the hero's Level (Tyler 2026-10-24). */
const LEVEL_30_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(30);
const CELLAR_ODDS = (await import(pathToFileURL(join(ROOT, 'src/render/format.js')).href)).chance(
  (await import(pathToFileURL(join(ROOT, 'src/shell/hunt-ground-facts.js')).href)).scarceSetOf('mill_cellar', 'medium', 1)[0].chance);
/* A Level 1 hero in town (no hunt, no party, no bests yet), 30 min of stamina, two setups the server can put
   on and a third set it cannot (no setup row): the Hunts window's fresh hero (AW-25 .. AW-29). */
function levelOne(e) {
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 });
  e.hunt_bests = { min_ms: 600000, grounds: {} };
  e.stamina = { ms: 1800000, at: e.now, max_ms: 28800000, hunting: false };
  e.hunt_presets = [{ preset: 0, name: 'Cellar rats', action_set: 0, gear: { weapon: 'iron_sword' }, restock: {} },
    { preset: 1, name: 'Bow', action_set: 1, gear: { weapon: 'shortbow' }, restock: {} }];
  e.hunt_settings = Object.assign({}, e.hunt_settings, { presets: [{ preset: 0, name: 'Hunt' }, { preset: 1, name: 'Bow' }, { preset: 2, name: 'Bare set' }] });
}
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
        /* A refusal the next intent gets (AW-21), the engine's shape (equip.js refusalBody): HTTP 409, nothing moved,
           the whole character at its version riding the answer, the verb echoed, the code saying why. */
        if (s.refuse) {
          const error = s.refuse; s.refuse = null;
          return r.fulfill({ status: 409, contentType: 'application/json',
            body: JSON.stringify(Object.assign(clone(s.env), { version: s.version, ok: false, verb: body.verb, error })) });
        }
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

/* A (re)load waits for DOMContentLoaded (hunt-screen's LOAD-PROOF): every module script of the boot has run, so the
   app is up and what follows waits for its STATE. Never the `load` event, which also waits for every image and the
   font sheet, none of which a rule reads then (2026-10-22: the first goto timed out at 6 s on a loaded box, the
   server's first answer alone taking 2.7 s). The boot gets BOOT_MS: no rule is about how fast a page boots. */
const BOOTED = 'domcontentloaded';
const BOOT_MS = 20000;

/* A reload: the stub keeps the session, so the page comes back to the character (or its picker). */
async function reloadAndPlay(page) {
  await page.reload({ waitUntil: BOOTED, timeout: BOOT_MS });
  await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'));
  if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: BOOTED, timeout: BOOT_MS });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

/* A new full envelope, the way the live game gets one: a settle the SERVER committed (the world tick, another
   member's hello) pushed as a frame carrying the whole character at the next version (2026-12-25-frame-push-
   revive.sql), applied like a load. The stub's settle hook runs as for a plain settle (`s.onCall`, no verb), but no
   call is logged: the client asked for nothing. */
async function pushEnvelope(page, s) {
  if (s.onCall) s.onCall('hr-accrue', {});
  const e = s.next();
  await page.evaluate(([uid, env]) => window.__hub.send('hr:' + uid + ':0', { t: 'state', frame: env.version, env }), [UID, e]);
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
  /* board 2026-10-25 #22: Sell all loot sold Silk Thread, the first Crafting recipes' thread: a material a recipe the hero
     can make NOW spends is kept (the server's skill level); one only a far higher level spends is sold */
  const crafter = lootToSell([{ id: 'silk_thread', qty: 6 }, { id: 'slime_gel', qty: 3 }, { id: 'rat_tail', qty: 2 }], { crafting: { xp: 0, level: 1 } });
  if (crafter.join(',') !== 'slime_gel,rat_tail') fails.push('AW-0 a Crafting 1 hero\'s Sell all loot sells ' + crafter.join(', ') + ' (want slime_gel, rat_tail: Silk Thread is its Crafting 1 thread)');
  if (lootToSell([{ id: 'slime_gel', qty: 3 }], { crafting: { xp: 0, level: 30 } }).length) fails.push('AW-0 a Crafting 30 hero\'s Sell all loot sells its Slime Gel');
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
  const plan = (equipment, bag, skills = lv1, level = 5) => upgradePlan({ equipment, bag: bag.map(([id, qty]) => ({ id, qty: qty || 1 })), skills, level });
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
  /* Gear is worn by the hero's LEVEL (Tyler 2026-10-24): at Level 15 with every skill at 1 the Iron Helm goes on, at
     Level 14 it does not, and a Level the server has not sent reads as "cannot wear yet". */
  const byLevel = plan({ weapon: 'bronze_sword' }, [['iron_helm']], lv1, 15);
  if (ops(byLevel) !== '{"helmet":"iron_helm"}') fails.push('AW-21 a Level-15 hero with Defense 1 would put on ' + ops(byLevel) + ', not the Iron Helm');
  const under = plan({ weapon: 'bronze_sword' }, [['iron_helm']], { ...lv1, defense: { level: 99 } }, 14);
  if (Object.keys(under.ops).length) fails.push('AW-21 a Level-14 hero (Defense 99) would put on ' + ops(under));
  const blind = plan({ weapon: 'bronze_sword' }, [['iron_helm']], null, null);
  if (Object.keys(blind.ops).length) fails.push('AW-21 with no server Level Equip upgrades would put on ' + ops(blind));
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
  return fails.concat(await huntsPure(imp), await tickerRules(ROOT));
}

/* AW-25 .. AW-28 PURE: the Hunts page's facts from the data rows and its lines from the server's sections. */
async function huntsPure(imp) {
  const fails = [];
  const { residentsOf, scarceSetOf, raresOf, wornWeightOf } = await imp('src/shell/hunt-ground-facts.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const { huntRows, fitWords, bestLine, bestWords } = await imp('src/shell/hunt-list.js');
  const { setupsOf, beforeLines, freeHeroes } = await imp('src/shell/hunt-go.js');
  const STORE = FIXTURE.hunt_settings.store;
  /* Who lives here: each creature's share of the ground's spawn points (Tyler 10-18: a common majority, some uncommon, a rare). */
  const cellar = residentsOf('mill_cellar').map((m) => m.id + ':' + m.band + ':' + m.level).join();
  if (cellar !== 'rat:common:2,slime:uncommon:2,hive_wasp:uncommon:4') fails.push('AW-25 the Mill Cellar lives as ' + cellar);
  const thicket = residentsOf('meadowbrook_thicket').map((m) => m.id + ':' + m.band).join();
  if (thicket !== 'gray_wolf:common,gray_whelp:common,briarcoat_wolf:uncommon,dire_gray:rare,grayjaw:rare') fails.push('AW-25 the Thicket lives as ' + thicket);
  for (const r of huntRows()) if (!residentsOf(r.hunt).some((m) => m.band === 'common')) fails.push('AW-25 ' + r.hunt + ' has no common creature');
  /* What drops (the loot bands, 2026-10-23): every Rare and Trophy row of the ground's creatures, item and carrier, the
     Trophies last, never a Scarce piece; the hourly gear a line a tier, the worn weight's line word first. */
  for (const r of huntRows()) {
    const want = new Set(), got = raresOf(r.hunt);
    for (const m of residentsOf(r.hunt)) for (const d of MONSTERS[m.id].drops || []) if (d.band === 'rare' || d.band === 'trophy') want.add(d.id + '@' + m.id);
    const ids = got.map((x) => x.id + '@' + x.carrier.id);
    if (ids.length !== want.size || ids.some((k) => !want.has(k))) fails.push('AW-25 ' + r.hunt + ' rares read ' + ids.join('+') + ', the rows say ' + [...want].join('+'));
    if (got.some((x, i) => x.trophy && got.slice(i + 1).some((y) => !y.trophy))) fails.push('AW-25 ' + r.hunt + ' lists a Trophy before a Rare');
  }
  const sets = (h, w) => scarceSetOf(h, w).map((e) => e.lines.join(',') + ':' + e.slots.join(',') + ':' + e.weapons.join(',')).join('|');
  if (sets('millrace_sewer', 'medium') !== 'Leather,Bronze,Apprentice:bodies,legs:|Studded,Iron,Adept:helmets,boots:Iron Sword') fails.push('AW-25 the Sewer\'s gear reads ' + sets('millrace_sewer', 'medium'));
  if (sets('mosslight_glade', null) !== 'Iron,Studded,Adept:helmets,bodies,legs,boots:Longbow') fails.push('AW-25 the glade\'s gear for no worn weight reads ' + sets('mosslight_glade', null));
  /* THE ODDS (Tyler 2026-10-24: "a % drop chance or nothing at all"): each line's chance per kill is the engine's rows
     (monsters.js, the catalogue hr-accrue rolls) at the yield share the settle spawns a party-scaled monster with. Worked
     here from the rows on the Sewer (a party-only boss pocket, two tiers), alone and as four: a tier line = any piece of
     it on one kill of the ground's mix (the pockets that party walks, as built), a Rare = per kill of its carrier (the
     Rat King by the smallest party he meets). */
  const { HUNT_GROUNDS, routeFor, yieldPermille } = await imp('src/data/hunt-grounds.js');
  const { ITEMS } = await imp('src/data/items.js');
  const { chance } = await imp('src/render/format.js');
  const { detailHtml } = await imp('src/shell/windows/hunt-detail.js');
  const sewer = Object.values(HUNT_GROUNDS).find((g) => g.hunt === 'millrace_sewer');
  for (const n of [1, 4]) {
    const y = (size) => yieldPermille(size) / 1000;
    const pts = {};
    for (const i of routeFor(sewer, n)) for (const s of sewer.pockets[i].spawns) pts[s.monster] = (pts[s.monster] || 0) + 1;
    const all = Object.values(pts).reduce((t, k) => t + k, 0);
    const tierOdds = (tier) => Object.entries(pts).reduce((t, [id, k]) => {
      const rows = MONSTERS[id].drops.filter((d) => d.band === 'scarce' && (Number(ITEMS[d.id].tier) || 1) === tier);
      return t + (k / all) * (1 - rows.reduce((p, d) => p * (1 - Math.min(0.95, d.ch * y(n))), 1));
    }, 0);
    const shown = scarceSetOf('millrace_sewer', 'medium', n).map((e) => chance(e.chance)).join('|');
    const want = [1, 2].map((t) => chance(tierOdds(t))).join('|');
    if (shown !== want || /under|^0%/.test(want)) fails.push('AW-25 the Sewer\'s gear odds for ' + n + ' read ' + shown + ', the rows say ' + want);
    const rr = raresOf('millrace_sewer', n).map((x) => x.name + ' ' + chance(x.chance)).join('|');
    const rw = residentsOf('millrace_sewer').flatMap((m) => MONSTERS[m.id].drops.filter((d) => d.band === 'rare' || d.band === 'trophy')
      .map((d) => ({ t: d.band === 'trophy', s: ITEMS[d.id].n + ' ' + chance(Math.min(0.95, d.ch * y(Math.max(n, m.id === 'rat_king' ? 2 : 1)))) })))
      .sort((a, b) => Number(a.t) - Number(b.t)).map((x) => x.s).join('|');
    if (rr !== rw) fails.push('AW-25 the Sewer\'s rare odds for ' + n + ' read ' + rr + ', the rows say ' + rw);
  }
  const fmt = [0.0035, 0.021, 0.12, 0.00009, 0.0001].map(chance).join('|');
  if (fmt !== '0.35%|2.1%|12%|under 0.01%|0.01%') fails.push('AW-25 the odds read ' + fmt + ' (two significant figures, "under 0.01%" below it)');
  /* THE LINEUP FACES THE PLAYER (Tyler 2026-10-24): the page's sprite options draw each creature's idle frame facing
     south, never the side-on east frame (a stub atlas row whose directions sit at different columns). */
  const { LINEUP_SPRITE } = await imp('src/shell/windows/hunt-detail.js');
  const { drawCreature } = await imp('src/render/creature-sprite.js');
  const drewAt = [];
  const g2d = (c) => ({ drawImage: (img, sx) => drewAt.push(sx), clearRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4).fill(255) }) });
  const fakeCanvas = () => { const c = { width: 0, height: 0, getContext: () => g2d(c) }; return c; };
  const shown = Object.assign(fakeCanvas(), { ownerDocument: { createElement: fakeCanvas } });
  const stubArt = new Map([['rat', { image: {}, row: { frame: [4, 4], anchor: [2, 3], anims: { idle: { dirs: { e: [[0, 0]], s: [[40, 0]], n: [[80, 0]] } } } } }]]);
  if (!drawCreature(shown, stubArt, 'rat', LINEUP_SPRITE) || drewAt[drewAt.length - 1] !== 40 || shown.width !== 8)
    fails.push('AW-25 the lineup draws frame x ' + drewAt[drewAt.length - 1] + ' at ' + shown.width + ' px, wanted the front (south) frame at x 40, x2');
  const head = detailHtml();
  if (!head.includes('<h4 class="hw-hd-h">Drops <small') || /about every hour|no odds/i.test(head)) fails.push('AW-25 the drops heading reads ' + (/<h4 class="hw-hd-h">([^<]*)<small class="hw-hd-per hw-hd-per-size"/.exec(head) || [, '?'])[1]);
  const worn = [wornWeightOf({ helmet: 'leather_helmet', body: 'bronze_platebody', pants: 'leather_pants' }), wornWeightOf({ weapon: 'practice_sword' }), wornWeightOf({ helmet: 'adept_helmet', body: 'iron_platebody' })].join();
  if (worn !== 'medium,,heavy') fails.push('AW-25 the worn weight reads ' + worn);
  /* The list line: the band against the Level in words and a tone; the best, or New. */
  const rows = Object.fromEntries(huntRows().map((r) => [r.hunt, r]));
  const fits = [[rows.mill_cellar, 1], [rows.meadowbrook_thicket, 1], [rows.mosslight_glade, 1], [rows.mill_cellar, 20], [rows.mill_cellar, null]].map(([r, lv]) => { const f = fitWords(r, lv); return f ? f.tone + ':' + f.words : '-'; }).join('|');
  if (fits !== 'in:In your range|above:Above your level|far:Far above your level|below:Below your level|-') fails.push('AW-25 the band words read ' + fits);
  const bests = { minMs: 600000, grounds: { mill_cellar: { solo: { xpH: 7141, balanceH: 1859 }, party: { xpH: 9000, balanceH: 10 } } } };
  const lines = [bestLine(null, 'mill_cellar'), bestLine(bests, 'mill_cellar'), bestLine(bests, 'millrace_sewer')].join('|');
  if (lines !== '|Best 9,000 Level XP/h|New') fails.push('AW-25 the list bests read ' + lines);
  const none = bestWords({ minMs: 600000, grounds: {} }, 'mill_cellar');
  if (none.solo || none.party || none.none !== 'Not hunted yet. A hunt of 10 min or more sets your best.') fails.push('AW-25 a ground with no best reads ' + JSON.stringify(none));
  /* A session over plain sections, the way the envelope projects them. */
  const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
  const START = [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)];
  const sess = (o) => { const e = Object.assign({ hunt_settings: { preset: 0, presets: [{ preset: 0, name: 'Set 1' }], slots: START, store: STORE },
    state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }, o); return { read: (k) => e[k] }; };
  const say = (cs, o) => beforeLines(cs, o).map((l) => (l.short ? '!' : '') + l.text).join(' | ');
  /* (A fresh hero's starter bar and Bring your heroes are read on the page's own modules, AW-27 / AW-28 in checks.) */
  const bare = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('consume', 'cooked_shrimp', 0)], store: STORE }, state: { gold: 0 }, stamina: { ms: 0, max_ms: 28800000 } }));
  if (bare !== '!Food: no Cooked Shrimp left. Nothing will be eaten | !No stamina left: rest in town before you go.') fails.push('AW-27 an empty bar and no stamina read ' + JSON.stringify(bare));
  /* A rune spell with no rune and no store behind it loses that spell only (named, not a stop); no food is said. */
  const spell = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('ability', 'flame_strike', 0)], store: STORE } }));
  /* (a rune spell spends any tier of its family, so the line names and counts the family: lane b-spell-content) */
  if (spell !== 'Runes: no Fire runes left. Flame Strike will not fire | Your bar eats and drinks nothing: HP and mana come back only between fights.') fails.push('AW-27 a spell with no rune reads ' + JSON.stringify(spell));
  const poor = say(sess({ state: { gold: 0 }, stamina: { ms: 30 * 60000, max_ms: 28800000 } }));
  if (!/\| Stamina: 30 min left, then the hunt ends\. \| !No gold for the store: the hunt ends when your own supplies run out\.$/.test(poor)) fails.push('AW-27 low stamina and no gold read ' + JSON.stringify(poor));
  const other = say(sess({}), { other: 'Bow' });
  if (!/^Supplies: as Bow’s own bar sets them/.test(other)) fails.push('AW-27 another setup\'s supplies read ' + JSON.stringify(other));
  /* Go as: the setups the server can put on, plus the one in use (its bar's first four); a set with no setup row is not offered. */
  const setups = setupsOf(sess({ hunt_settings: { preset: 0, presets: [{ preset: 0, name: 'Hunt' }, { preset: 1, name: 'Bow' }, { preset: 2, name: 'Bare set' }], slots: FIXTURE.hunt_settings.slots, store: STORE },
    hunt_presets: [{ preset: 1, name: 'Bow', action_set: 1, gear: { weapon: 'shortbow' } }], equipment: { weapon: 'iron_sword' } }))
    .map((p) => [p.preset, p.name, p.inUse, p.weapon, p.roleWords, p.bar ? p.bar.length : '-'].join(':')).join('|');
  /* the fixture hero wears an Iron Sword ALONE: Melee damage (Tyler 2026-10-23, the shield makes the tank) */
  if (setups !== '0:Hunt:true:iron_sword:Melee:4|1:Bow:false:shortbow:Ranger:-') fails.push('AW-26 Go as offers ' + setups);
  /* A closed session is no hero to bring (the open one in a party is checked on the page, AW-28). */
  const me = { slot: 0, status: 'ready', read: () => null };
  if (freeHeroes(me, [me, { slot: 3, status: 'closed', read: (k) => (k === 'name' ? 'Wrenna' : null) }]).length) fails.push('AW-28 Bring your heroes offers a closed session');
  return fails;
}

/* AW-25 TOWN WORK COUNTS UP BETWEEN PAYOUTS (Tyler 2026-10-23), the pure rules: src/shell/town-ticker.js runs the
   server's own span loop on the envelope's numbers. `base` is the repo, or a temp copy of src a ticker mutant was
   planted into (TICKER_MUTANTS below). */
async function tickerRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const TW = await imp('src/shell/town-work.js');
  const TK = await imp('src/shell/town-ticker.js');
  const { stateOf, primaryOf } = await imp('src/shell/windows/inventory/state.js');
  const { sellPlan } = await imp('src/shell/bag-model.js');
  const { buryParts } = await imp('src/shell/windows/inventory/bury.js');
  const { settleRefusalOf } = await imp('src/session/refusal.js');
  const { simulateSkillSpan } = await imp('src/core/skill-sim.js');
  const { simulateArtisanSpan } = await imp('src/core/artisan-sim.js');
  const { grantXp } = await imp('src/core/progression.js');
  const { createRng } = await imp('src/core/rng.js');
  const { ITEMS } = await imp('src/data/items.js');
  const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
  const iso = (ms) => new Date(ms).toISOString();
  const SKILLS = { woodcutting: { xp: 1500, level: 12 }, mining: { xp: 800, level: 8 }, smithing: { xp: 0, level: 1 }, prayer: { xp: 120, level: 2 },
    cooking: { xp: 1200, level: 11 }, runecrafting: { xp: 0, level: 1 } };
  const envOf = (kind, id, inv, more) => Object.assign({ state: { active_kind: kind, active_id: id, active_since: iso(T0), accrued_to: iso(T0) },
    skills: SKILLS, inventory: inv, equipment: {}, shop: { offers: [], bids: { normal_log: 3, bones: 1 } } }, more || {});
  /* A character as the client holds it: its record (replaced whole by each envelope) and the server's clock. */
  const hero = (env, v = 1) => { const cs = { clock: T0, settleRefusal: null, record: { version: v, data: env, residue: {} },
    read: (k) => cs.record.data[k], serverNow: () => cs.clock, now: () => 0 }; return cs; };
  const pay = (cs, env) => { cs.record = { version: cs.record.version + 1, data: env, residue: {} }; };
  const tree = TW.workRow('gather', 'normal_tree');
  const step = TW.actionMs(hero(envOf('gather', 'normal_tree', {})), tree);
  const each = TW.xpEach(tree);

  /* TK-1: one action at a time, on the engine's interval for the tool the server says the hero holds. */
  const cs1 = hero(envOf('gather', 'normal_tree', { normal_log: 40 }));
  const seen = [];
  for (const k of [1, 2, 3]) for (const t of [k * step - 1, k * step]) {
    cs1.clock = T0 + t;
    const tk = TW.tickOf(cs1);
    seen.push((tk ? TK.aheadQty(tk, 'normal_log') + '/' + TK.aheadXp(tk, 'woodcutting') : 'none'));
  }
  const want1 = [0, 1, 1, 2, 2, 3].map((n) => n + '/' + n * each).join();
  if (seen.join() !== want1) fails.push('TK-1 the logs and XP do not rise one action at a time (' + step + ' ms): ' + seen.join() + ', want ' + want1);
  cs1.clock = T0 + 2 * step + 100;
  const line1 = TW.nowParts(cs1);
  const ahead1 = line1.filter((p) => p.ahead).map((p) => p.text).join('|');
  if (ahead1 !== '42 in your bag') fails.push('TK-1 the work line marks ' + JSON.stringify(ahead1) + ' as pending, want "42 in your bag"');

  /* TK-2: a payout REPLACES: the server's bag and watermark, and the count restarts from them (no double count). */
  pay(cs1, envOf('gather', 'normal_tree', { normal_log: 42 }, { state: { active_kind: 'gather', active_id: 'normal_tree', active_since: iso(T0), accrued_to: iso(T0 + 2 * step) } }));
  const after = TW.tickOf(cs1);
  const shown2 = TK.shownQty(after, 'normal_log', 42);
  if (shown2.qty !== 42 || shown2.ahead !== 0) fails.push('TK-2 after a payout of the same two logs the bag shows ' + JSON.stringify(shown2) + ', want 42 with nothing pending');
  cs1.clock = T0 + 3 * step;
  if (TK.shownQty(TW.tickOf(cs1), 'normal_log', 42).qty !== 43) fails.push('TK-2 the next action after a payout does not count from the new watermark');

  /* TK-5: a payout LOWER than the prediction snaps down: the server's word, nothing pending until its next action. */
  cs1.clock = T0 + 4 * step + 100;   // predicted 44
  pay(cs1, envOf('gather', 'normal_tree', { normal_log: 42 }, { state: { active_kind: 'gather', active_id: 'normal_tree', active_since: iso(T0), accrued_to: iso(T0 + 4 * step) } }));
  const low = TK.shownQty(TW.tickOf(cs1), 'normal_log', 42);
  if (low.qty !== 42 || low.ahead !== 0) fails.push('TK-5 a payout under the prediction shows ' + JSON.stringify(low) + ', want the server\'s 42');

  /* TK-3: NEVER SPENT. With two logs pending, every control reads the server's 40: the bag's stacks, the sale's
     lines, the primary; the pocket alone shows 42, as pending. */
  const cs3 = hero(envOf('gather', 'normal_tree', { normal_log: 40, bones: 8 }));
  cs3.clock = T0 + 2 * step + 100;
  const st3 = stateOf({ character: cs3 });
  const plan3 = sellPlan(st3.items, ['normal_log'], { bids: new Map([['normal_log', 3]]) });
  const sale = plan3.lines.map((l) => l.item + '×' + l.qty).join();
  const shown3 = TK.shownQty(st3.tick, 'normal_log', st3.qty.get('normal_log'));
  if (st3.qty.get('normal_log') !== 40 || sale !== 'normal_log×40' || !primaryOf(st3, 'normal_log') || shown3.qty !== 42 || shown3.ahead !== 2)
    fails.push('TK-3 the pending logs reach a control: qty ' + st3.qty.get('normal_log') + ', sale ' + sale + ', shown ' + JSON.stringify(shown3));
  const csB = hero(envOf('artisan', 'smelt_bronze', { copper_ore: 10 }));
  csB.clock = T0 + 30000;
  const rows = (await imp('src/shell/windows/work.js')).rowsFor('smithing', 1, csB.read('inventory'));
  if (TW.runsOf(TW.workRow('artisan', 'smelt_bronze').row, csB.read('inventory')) !== 5 || !rows.length) fails.push('TK-3 "Makes up to" does not read the server\'s ore');

  /* TK-4 / TK-6: nothing ticks with nothing running, in a hunt, with no server clock, or a watermark past the horizon;
     the stop's envelope clears it at once. */
  const idle = hero(envOf('idle', null, { normal_log: 40 }));
  idle.clock = T0 + 60000;
  const hunt = hero(envOf('gather', 'normal_tree', { normal_log: 40 }, { hunt: { session_id: 'h1', ended: false } }));
  hunt.clock = T0 + 3 * step;
  const stale = hero(envOf('gather', 'normal_tree', { normal_log: 40 }));
  stale.clock = T0 + TK.horizonMs(step) + 200;   // past it by more than the 100 ms bucket the ticker rounds down to
  const blind = hero(envOf('gather', 'normal_tree', { normal_log: 40 }));
  blind.serverNow = () => null;
  const quiet = [['idle', idle], ['hunting', hunt], ['past the horizon', stale], ['no server clock', blind]].filter(([, c]) => TW.tickOf(c) !== null).map(([n]) => n);
  if (quiet.length) fails.push('TK-6 it ticks with ' + quiet.join(', '));
  const cs4 = hero(envOf('gather', 'normal_tree', { normal_log: 40 }));
  cs4.clock = T0 + 2 * step + 100;
  const was = TW.tickOf(cs4);
  pay(cs4, envOf('idle', null, { normal_log: 42 }, { state: { active_kind: 'idle', active_id: null, active_since: null, accrued_to: iso(cs4.clock) } }));
  if (!was || TW.tickOf(cs4) !== null || TW.nowParts(cs4).length) fails.push('TK-4 the stop did not clear the ticking');

  /* TK-7: a settle the engine REFUSED (it will not pay this pointer) clears it at once, until a newer record. */
  const no = settleRefusalOf({ ok: true, body: { ok: true, accrued: false, reason: 'unknown_node', version: 1 } });
  const waits = ['below_min_span', 'nothing_accrued', 'replayed', 'idle'].filter((r) => settleRefusalOf({ ok: true, body: { ok: true, accrued: false, reason: r, version: 1 } }));
  const cs7 = hero(envOf('gather', 'normal_tree', { normal_log: 40 }));
  cs7.clock = T0 + 2 * step + 100;
  cs7.settleRefusal = no;
  const refusedNow = TW.tickOf(cs7);
  pay(cs7, envOf('gather', 'normal_tree', { normal_log: 40 }));
  const newer = TW.tickOf(cs7);
  if (!no || no.version !== 1 || waits.length || refusedNow !== null || !newer || newer.actions !== 2)
    fails.push('TK-7 a refused settle: ' + JSON.stringify({ no, waits, refusedNow, newer: newer && newer.actions }));
  /* ...and the character keeps the engine's word from its settle (hello) until the next answer says otherwise. */
  const { CharacterSession } = await imp('src/session/character-session.js');
  const answers = [{ ok: true, body: { ok: true, accrued: false, reason: 'unpayable_bench', version: 3 } }, { ok: false, error: 'offline' },
    { ok: true, body: { ok: true, accrued: false, reason: 'below_min_span', version: 3 } }];
  const loaded = Object.assign(envOf('gather', 'normal_tree', { normal_log: 40 }), { ok: true, version: 3, now: iso(T0) });
  const real = new CharacterSession({ slot: 0, uid: 'u', server: { accrue: async () => answers.shift(), rpc: async () => ({ ok: true, body: loaded }) } });
  const said = [];
  for (let i = 0; i < 3; i++) { await real.hello(); said.push(real.settleRefusal ? real.settleRefusal.reason + '@' + real.settleRefusal.version : 'none'); }
  real.close();
  if (said.join() !== 'unpayable_bench@3,unpayable_bench@3,none') fails.push('TK-7 the character keeps the settle refusal as ' + said.join() + ' (want it from the refusal, kept through a lost answer, gone at the next)');

  /* TK-8: a bench counts its inputs down with the engine's own stop: never past the bag, never past the run's "N left". */
  const bury = TW.workRow('artisan', 'bury_bones');
  const bstep = TW.actionMs(hero(envOf('artisan', 'bury_bones', {})), bury);
  const csb = hero(envOf('artisan', 'bury_bones', { bones: 8 }));
  csb.clock = T0 + 3 * bstep + 100;
  const b3 = TW.tickOf(csb);
  csb.clock = T0 + 20 * bstep;
  const ball = TW.tickOf(csb);
  const csl = hero(envOf('artisan', 'bury_bones', { bones: 8 }, { bench_run: { left: 2 } }));
  csl.clock = T0 + 20 * bstep;
  const bleft = TW.tickOf(csl);
  const bline = TK.lineText(buryParts(csb));
  if (!b3 || b3.items.bones !== -3 || TK.aheadXp(b3, 'prayer') !== 3 * TW.xpEach(bury) || !ball || ball.items.bones !== -8 || !bleft || bleft.items.bones !== -2 || !/^Burying Bones: 0 Bones left\./.test(bline))
    fails.push('TK-8 the bench count: ' + JSON.stringify({ b3, all: ball && ball.items, left2: bleft && bleft.items, bline }));

  /* TK-9: a dish that can burn is a roll: the inputs and the burn's XP are certain, the dish is not (no stack moves). */
  const cook = TW.workRow('artisan', 'cook_shrimp');
  const cstep = TW.actionMs(hero(envOf('artisan', 'cook_shrimp', {})), cook);
  const csc = hero(envOf('artisan', 'cook_shrimp', { shrimp: 6 }));
  csc.clock = T0 + 2 * cstep + 100;
  const c2 = TW.tickOf(csc);
  const fire = TW.nowParts(csc).filter((p) => p.ahead).map((p) => p.text).join('|');
  const sure = hero(envOf('artisan', 'cook_shrimp', { shrimp: 6 }, { skills: Object.assign({}, SKILLS, { cooking: { xp: 13034431, level: 99 } }) }));
  sure.clock = T0 + 2 * cstep + 100;
  const s2 = TW.tickOf(sure);
  if (!c2 || c2.unsure !== 2 || 'cooked_shrimp' in c2.items || 'burnt_food' in c2.items || c2.items.shrimp !== -2 || !/2 more on the fire/.test(fire)
    || TK.aheadXp(c2, 'cooking') > 2 * TW.xpEach(cook) || !s2 || s2.unsure !== 0 || s2.items.cooked_shrimp !== 2)
    fails.push('TK-9 a dish that can burn: ' + JSON.stringify({ c2, fire, s2 }));

  /* TK-10: ROUNDED DOWN. Against the engine as the SERVER runs it (its perks, a real roll, its tool carry and XP
     remainder), over many windows, the ticker never shows an action, an item or an XP the server did not pay. */
  const perks = { gatherSpeed: 0.2, smithSpeed: 0.2, prayerSpeed: 0.2, cookSpeed: 0.2, runeSpeed: 0.2, allXP: 0.1, craftSave: 0.3, yield_smithing: 0.2, noBurn: 0.1 };
  const bonus = (k) => perks[k] || 0;
  /* The best axe there is: its speed, its XP and its double-yield carry (the server's carry starts at 0.7, the ticker's at 0). */
  const axe = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'tool' && ITEMS[k].toolSkill === 'woodcutting').sort((a, b) => (ITEMS[b].toolTier || 0) - (ITEMS[a].toolTier || 0))[0];
  const cases = [['gather', 'normal_tree', { normal_log: 3 }], ['gather', 'normal_tree', { [axe]: 1 }], ['gather', 'rich_coal_rock', {}], ['artisan', 'smelt_bronze', { copper_ore: 40 }],
    ['artisan', 'bury_bones', { bones: 50 }], ['artisan', 'cook_shrimp', { shrimp: 30 }]];
  const rune = Object.keys(TW.BENCH_INDEX).find((id) => TW.BENCH_INDEX[id].skill === 'runecrafting' && (TW.BENCH_INDEX[id].recipe.outputQty || 1) > 1);
  if (rune) cases.push(['artisan', rune, Object.fromEntries(Object.entries(TW.workRow('artisan', rune).row.inputs || {}).map(([i, n]) => [i, n * 40]))]);
  const rich = Object.assign({}, SKILLS, { mining: { xp: 13034431, level: 99 }, runecrafting: { xp: 13034431, level: 99 } });
  let over = null;
  for (const [kind, id, inv] of cases) {
    const w = TW.workRow(kind, id);
    if (!w) { over = 'no work row ' + id; break; }
    const reach = TK.horizonMs(TW.actionMs(hero(envOf(kind, id, inv, { skills: rich })), w)) - 100;
    for (let i = 0; i < 24 && !over; i++) {
      const span = Math.floor(((i * 7919) % 997) / 997 * reach);
      const st = { skillTargetId: id, skills: Object.fromEntries(Object.entries(rich).map(([k, r]) => [k, r.xp])), xpFrac: { [w.skill]: 0.9 },
        inventory: Object.assign({}, inv), equipment: {}, toolCarry: { [w.skill]: 0.7 }, stats: {}, buffs: [], unlockedRecipes: {} };
      const got = {};
      const fx = { addXp: (s, amt) => grantXp(st, s, amt, { bonus, restedQuantum: 0, authored: false }),
        addItem: (it, n) => { got[it] = (got[it] || 0) + n; st.inventory[it] = (st.inventory[it] || 0) + n; },
        removeItem: (it, n) => { st.inventory[it] = (st.inventory[it] || 0) - n; } };
      const one = Object.create(null);
      const ctx = { fromMs: T0, toMs: T0 + span, items: ITEMS, rng: createRng(i * 31 + 7), bonus, away: true, fx };
      const x0 = Object.assign({}, st.skills);
      const sum = kind === 'gather' ? (one[id] = { skill: w.skill, node: w.row }, simulateSkillSpan(st, Object.assign(ctx, { nodes: one })))
        : (one[id] = { skill: w.skill, recipe: w.row }, simulateArtisanSpan(st, Object.assign(ctx, { recipes: one })));
      const csP = hero(envOf(kind, id, inv, { skills: rich }));
      csP.clock = T0 + span;
      const p = TW.tickOf(csP);
      if (!p) { over = id + ' predicted nothing at ' + span + ' ms'; break; }
      const xs = w.row.xpSkill || w.skill;
      if (p.actions > sum.ticks) over = id + ' at ' + span + ' ms: ' + p.actions + ' actions > the server\'s ' + sum.ticks;
      for (const [it, n] of Object.entries(p.items)) if (n > 0 && n > (got[it] || 0)) over = id + ' at ' + span + ' ms: +' + n + ' ' + it + ' > the server\'s ' + (got[it] || 0);
      if (TK.aheadXp(p, xs) > (st.skills[xs] || 0) - (x0[xs] || 0)) over = id + ' at ' + span + ' ms: +' + TK.aheadXp(p, xs) + ' XP > the server\'s ' + ((st.skills[xs] || 0) - (x0[xs] || 0));
    }
    if (over) break;
  }
  if (over) fails.push('TK-10 the ticker shows more than the server paid: ' + over);
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
    if (o.residue) Object.assign(s.residue, o.residue);
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
        /* AW-4: Equip on a bag sword is one intent, off at once, and the doll waits for the server. In town at the
           Level the sword needs (gear is worn by Level, Tyler 2026-10-24): the engine refuses an equip mid-hunt or under
           its requirement, and the screen never offers one then (AW-21, Tyler 2026-10-24). */
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete s.env[k];
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null, level_xp: LEVEL_30_XP });
        await pushEnvelope(page, s);
        await wait(page, () => { const b = document.querySelector('.hw-pick [data-hs-act="primary"]'); return !b || !b.disabled; }, null, 3000);
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
      const { ctx, page, s, errors, up } = await open({ mutateEnv: tools });
      if (up) {
        if (!(await openWin(page, 'v', 'shop'))) fails.push('AW-7 V did not open the Shop: ' + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win]')).map((w) => w.getAttribute('data-hs-win') + (w.classList.contains('is-leaving') ? ':leaving' : '')))) + ' ' + errors.slice(0, 2).join(' | '));
        await page.waitForTimeout(150);
        const shop = await page.evaluate(() => ({ tabs: Array.from(document.querySelectorAll('.hw-shop .hw-tab')).map((b) => b.getAttribute('data-tab')),
          lines: Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line')).map((l) => l.getAttribute('data-item')),
          refill: !!document.querySelector('.hw-shop [data-hs-act="refill"]') }));
        /* Buy, Sell, and Services (stamina and Blessings, Tyler 2026-10-25): no supply refill anywhere */
        if (shop.tabs.join() !== 'buy,sell,services' || shop.refill) fails.push('AW-7 the Shop\'s tabs are ' + JSON.stringify(shop) + ', want Buy, Sell and Services and no refill'
          + ' [' + (await page.evaluate(() => { const w = document.querySelector('[data-hs-win="shop"]'); return w ? w.outerHTML.slice(0, 400) : 'no shop'; })) + '] ' + errors.slice(0, 2).join(' | '));
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
        if (!/ of 40 spaces$/.test(foot.cap) || foot.gold !== 'Your gold 5,200 gp') fails.push('AW-14 the Inventory foot reads ' + JSON.stringify(foot));
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
          await page.click('[data-hs-win="hunts"] .hw-hunt-detail .hw-hunt-enter');
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

    { // AW-25 .. AW-28: the Hunts window, master-detail (designer plan 2026-10-22), a Level 1 hero in town
      const { ctx, page, errors, s, up } = await open({ mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25 the Hunts window did not open for a Level 1 hero');
      else {
        const drawn = await wait(page, (w) => document.querySelectorAll(w + '.hw-hd-mon.is-drawn').length === 3, W, 8000);
        const list = await page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-hunt')).map((li) => [li.dataset.hunt, li.classList.contains('is-picked') ? 'picked' : '',
          li.querySelector('.hw-hunt-lv').textContent, li.querySelector('.hw-hunt-fit').getAttribute('data-tone'), li.querySelector('.hw-hunt-fit').textContent,
          li.querySelector('.hw-hunt-fits').textContent, li.querySelector('.hw-hunt-bestline').textContent, li.querySelector('.hw-hunt-glyph').title].join(':')), W);
        const want = ['mill_cellar:picked:Level 1–8:in:In your range:Fits your level:New:Built for one hero',
          'meadowbrook_thicket::Level 5–15:above:Above your level::New:Built for one hero',
          'millrace_sewer::Level 8–25:above:Above your level::New:Built for a party',
          'mosslight_glade::Level 16–31:far:Far above your level::New:Built for one hero',
          'coppercap_warrens::Level 32–50:far:Far above your level::New:Built for a party'];
        if (list.join('|') !== want.join('|')) fails.push('AW-25 the list lines read ' + JSON.stringify(list));
        /* The picked ground's page: who lives here as the world draws them, at a whole-number scale on one ground line. */
        const page1 = () => page.evaluate((w) => {
          const d = document.querySelector(w + '.hw-hunt-detail');
          const vis = (q) => { const n = d.querySelector(q); return n && n.getClientRects().length ? n.textContent : null; };
          return { name: vis('.hw-hd-name'), theme: vis('.hw-hd-theme'),
            sets: Array.from(d.querySelectorAll('.hw-hd-set')).map((n) => n.firstElementChild.textContent + ' · ' + n.querySelector('.hw-hd-odds').textContent),
            per: vis('.hw-hd-per-size'),
            rares: Array.from(d.querySelectorAll('.hw-hd-rare')).map((n) => n.querySelector('.hw-hd-rare-name').textContent + ' / ' + n.querySelector('.hw-hd-rare-by').textContent + (n.classList.contains('is-trophy') ? ' (trophy)' : '')),
            raresShown: (() => { const h = d.querySelector('.hw-hd-rares'), head = h && h.previousElementSibling; return !!head && head.getClientRects().length > 0; })(),
            mons: Array.from(d.querySelectorAll('.hw-hd-mon')).map((li) => { const c = li.querySelector('canvas'), b = c.getBoundingClientRect(), st = li.querySelector('.hw-hd-stand').getBoundingClientRect();
              return { id: li.dataset.monster, how: li.querySelector('.hw-hd-mon-how').textContent, drawn: li.classList.contains('is-drawn'), carrier: li.classList.contains('is-carrier'),
                w: c.width, h: c.height, cw: b.width, ch: b.height, ground: Math.round(st.bottom), inside: b.top >= st.top - 0.5 }; }),
            bests: Array.from(d.querySelectorAll('.hw-hd-best')).filter((n) => n.getClientRects().length).map((n) => n.textContent) };
        }, W);
        const p = await page1();
        /* x2: every side even, and shown at the canvas's own size (no CSS scaling; layout may land it on a sub-pixel). */
        if (!drawn || p.mons.some((m) => !m.drawn || !m.w || m.w % 2 || m.h % 2 || Math.abs(m.cw - m.w) > 0.5 || Math.abs(m.ch - m.h) > 0.5)) fails.push('AW-25 the creatures are not drawn at x2 from the world art: ' + JSON.stringify(p.mons));
        if (new Set(p.mons.map((m) => m.ground)).size !== 1 || p.mons.some((m) => !m.inside)) fails.push('AW-25 the creatures do not stand on one ground line, inside it: ' + JSON.stringify(p.mons.map((m) => [m.ground, m.inside])));
        const mons = p.mons.map((m) => m.id + ':' + m.how + (m.carrier ? ':carrier' : '')).join('|');
        if (p.name !== 'Mill Cellar' || p.theme !== HUNTS.mill_cellar.theme || mons !== 'rat:Level 2 · common|slime:Level 2 · uncommon|hive_wasp:Level 4 · uncommon')
          fails.push('AW-25 the Mill Cellar page reads ' + JSON.stringify({ name: p.name, theme: p.theme, mons }));
        /* the fixture hero wears Leather Boots, so the medium line reads first; the Cellar has no Rare, so no Rare heading */
        /* each line with its chance per kill, alone (the engine's rows: the pure AW-25 works the math from them) */
        if (p.sets.join('|') !== 'Leather, Bronze, Apprentice: helmets · ' + CELLAR_ODDS || p.per !== 'chance per kill, hunting alone' || p.rares.length || p.raresShown)
          fails.push('AW-25 the Cellar\'s drops read ' + JSON.stringify([p.sets, p.per, p.rares, p.raresShown]));
        if (p.bests.join('|') !== 'Not hunted yet. A hunt of 10 min or more sets your best.') fails.push('AW-25 with no best the page reads ' + JSON.stringify(p.bests));
        if (shots) await shot(page, 'hunts-1440x900-cellar-level1');
        /* The server's best arrives: the line and the page take it (replaced, never kept from before). */
        s.env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 7141, balance_h: 1859 } } } };
        await pushEnvelope(page, s);
        const best = await page.evaluate((w) => document.querySelector(w + '.hw-hunt[data-hunt="mill_cellar"] .hw-hunt-bestline').textContent, W);
        const p2 = await page1();
        if (best !== 'Best 7,141 Level XP/h' || p2.bests.join('|') !== 'Best alone: 7,141 Level XP per hour · balance 1,859 gp per hour') fails.push('AW-25 the server\'s best reads ' + JSON.stringify([best, p2.bests]));
        /* AW-26 GO AS: the setups as lines, the one on now chosen; Enter as it is ONE hr_hunt_enter and no apply. */
        const goAs = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-go')).map((b) => [b.dataset.preset, b.getAttribute('aria-checked'), b.querySelector('.hw-go-name').textContent,
          b.querySelector('.hw-go-what').textContent, b.querySelectorAll('.hw-go-bar .hh-icon').length, (b.querySelector('.hw-go-weapon img') || {}).src ? b.querySelector('.hw-go-weapon img').getAttribute('src').split('/').pop() : ''].join(':')), W);
        const g0 = (await goAs()).join('|');
        if (g0 !== '0:true:Hunt:Melee · on now:4:iron_sword.png|1:false:Bow:Ranger:0:shortbow.png') fails.push('AW-26 Go as reads ' + JSON.stringify(g0));
        /* AW-27 BEFORE YOU GO: what the bar spends, in slot order, from the server's bar, bag and gold. */
        const before = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-before-line')).map((li) => (li.classList.contains('is-short') ? '!' : '') + li.textContent).join(' | '), W);
        /* Flame Strike's slot names its store rune: carried runes first, then the store's a cast, and the gold pays it. */
        const b0 = await before();
        if (b0 !== 'Runes: 40 Fire runes of yours, then Plain Fire Rune from the store, 1 gp a cast | Food: 14 Wheat Bread of yours | Drink: 6 Goldenroot Tea of yours | Stamina: 30 min left, then the hunt ends. | Gold: 5,200 gp pays the store as you use it.')
          fails.push('AW-27 Before you go reads ' + JSON.stringify(b0));
        if (await page.evaluate(() => !!document.querySelector('[data-hs-win="hunts"] .hw-ready, [data-hs-win="hunts"] .hw-checks'))) fails.push('AW-27 the Hunts window still carries the readiness checklist');
        /* The next envelope REPLACES every number (CLAUDE.md §6): fewer runes, less bread, no gold (that line now stops the hunt). */
        s.env.inventory = Object.assign({}, s.env.inventory, { chalked_fire_rune: 3 });
        s.env.hunt_settings = clone(s.env.hunt_settings);
        s.env.hunt_settings.slots[2].count = 2;
        s.env.state = Object.assign({}, s.env.state, { gold: 0 });
        await pushEnvelope(page, s);
        const b1 = await before();
        if (b1 !== 'Runes: 3 Fire runes of yours, then Plain Fire Rune from the store, 1 gp a cast | Food: 2 Wheat Bread of yours | Drink: 6 Goldenroot Tea of yours | Stamina: 30 min left, then the hunt ends. | !No gold for the store: the hunt ends when your own supplies run out.')
          fails.push('AW-27 Before you go kept a number the server replaced: ' + JSON.stringify(b1));
        /* The page's own modules (a planted defect in them is what is served): a fresh hero's starter bar (the designer's
           walk-through row 4) and Bring your heroes (this account's other open heroes in no party). */
        const own = await page.evaluate(async (STORE) => {
          const m = await import('/src/shell/hunt-go.js?v=0.1.0');
          const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
          const sec = { hunt_settings: { preset: 0, presets: [], store: STORE, slots: [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)] },
            state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, equipment: {} };
          const party = { id: '0a47c0de-0000-4000-a000-00000000aa01', members: [{ seat: 0, name: 'Mira' }], self_seat: 0, leader_seat: 0 };
          const hero = (slot, n, p) => ({ slot, status: 'ready', read: (k) => (k === 'name' ? n : k === 'party' && p ? party : null) });
          const me = hero(0, 'Tyler');
          return { fresh: m.beforeLines({ read: (k) => sec[k] }).map((l) => l.text).join(' | '), free: m.freeHeroes(me, [me, hero(1, 'Mira', true), hero(2, 'Brannoc')]).map((h) => h.name).join() };
        }, FIXTURE.hunt_settings.store);
        if (own.fresh !== 'Food: 20 Cooked Shrimp of yours, then Salted Shrimp from the store, 14 gp each | Drink: Thin Turnip Juice from the store, 10 gp each | Gold: 500 gp pays the store as you use it.')
          fails.push('AW-27 a fresh hero\'s Before you go reads ' + JSON.stringify(own.fresh));
        if (own.free !== 'Brannoc') fails.push('AW-28 Bring your heroes offers ' + JSON.stringify(own.free));
        const enters = () => sent(s, 'hr_hunt_enter').length;
        const applies = () => sent(s, 'hr_hunt_preset_apply').length;
        let e0 = enters(), a0 = applies();
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && enters() === e0; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const asIs = sent(s, 'hr_hunt_enter').slice(e0);
        if (asIs.length !== 1 || asIs[0].body.p_preset !== 0 || asIs[0].body.p_hunt !== 'mill_cellar' || applies() !== a0) fails.push('AW-26 Enter as the setup on now sent ' + JSON.stringify(s.calls.slice(-3).map((c) => c.name + ':' + JSON.stringify(c.body.p_preset))));
        /* Another setup: ONE apply, then ONE enter as it, one press; every control off while it is in flight. */
        await page.click(W + '.hw-go[data-preset="1"]');
        const note = await page.evaluate((w) => document.querySelector(w + '.hw-go-note').textContent, W);
        if (note !== 'Enter puts Bow on first: its gear and its bar.' || !/^Supplies: as Bow’s own bar sets them/.test(await before())) fails.push('AW-26 choosing Bow says ' + JSON.stringify([note, await before()]));
        e0 = enters(); a0 = applies();
        const mark = s.calls.length;
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        const off = await page.evaluate((w) => ({ enter: document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled, go: Array.from(document.querySelectorAll(w + '.hw-go')).every((b) => b.disabled) }), W);
        if (!off.enter || !off.go) fails.push('AW-26 Enter or Go as stayed on while the press was in flight: ' + JSON.stringify(off));
        for (let i = 0; i < 40 && enters() === e0; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);
        const order = s.calls.slice(mark).filter((c) => c.name === 'hr_hunt_preset_apply' || c.name === 'hr_hunt_enter').map((c) => c.name + ':' + c.body.p_preset);
        if (order.join() !== 'hr_hunt_preset_apply:1,hr_hunt_enter:1') fails.push('AW-26 Enter as Bow sent ' + JSON.stringify(order));
        /* A refused apply stops there, in words: nothing is entered. */
        s.reply = { ok: false, error: 'missing_item' };
        await page.click(W + '.hw-go[data-preset="1"]');
        e0 = enters();
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && !(await page.evaluate((w) => /not in your bag/.test(document.querySelector(w + '.hh-intent-msg').textContent), W)); i++) await page.waitForTimeout(100);
        const said = await page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, W);
        if (enters() !== e0 || said !== 'A piece of that setup’s gear is not in your bag, so nothing was put on.') fails.push('AW-26 a refused apply entered or said ' + JSON.stringify([enters() - e0, said]));
        s.reply = { ok: true };
        /* AW-28 THE PARTY PATH: a party ground's page leads to a party; a solo ground's does not. */
        const party = () => page.evaluate((w) => { const b = document.querySelector(w + '.hw-hd-party'); return b && !b.hidden ? [b.querySelector('.hw-hd-party-why').textContent, b.querySelector('.hw-find-here').textContent, b.querySelector('.hw-bring-none').textContent] : null; }, W);
        if (await party()) fails.push('AW-28 the Mill Cellar page offers a party path');
        await page.click(W + '.hw-hunt[data-hunt="millrace_sewer"]');
        await wait(page, (w) => document.querySelectorAll(w + '.hw-hd-mon.is-drawn').length === 6, W, 4000);
        const sewer = await page1();
        if (sewer.name !== 'The Sewer' || !sewer.rares.includes('Crown Shard / Rat King') || sewer.rares[sewer.rares.length - 1] !== 'Rat King\'s Crown / Rat King (trophy)'
          || sewer.sets.length !== 2 || !sewer.mons.some((m) => m.id === 'rat_king' && m.carrier && m.how === 'Level 25 · boss')) fails.push('AW-25 the Sewer page reads ' + JSON.stringify({ name: sewer.name, sets: sewer.sets, rares: sewer.rares, mons: sewer.mons.map((m) => m.id + ':' + m.how) }));
        const pp = await party();
        if (!pp || pp[0] !== 'Best with a party of 2–4.' || pp[1] !== 'Find a party' || !/^Your other heroes can come too/.test(pp[2])) fails.push('AW-28 the Sewer page\'s party path reads ' + JSON.stringify(pp));
        if (shots) { await page.evaluate((w) => { const b = document.querySelector(w + '.hs-win-body'); b.scrollTop = 0; }, W); await shot(page, 'hunts-1440x900-sewer'); }
        if (shots) { await page.evaluate((w) => { const b = document.querySelector(w + '.hs-win-body'); b.scrollTop = b.scrollHeight; }, W); await shot(page, 'hunts-1440x900-sewer-foot'); }
        /* Find a party: the Party window, on its finder, on this ground and this hero's weapon: ONE read with p_hunt. */
        const f0 = sent(s, 'hr_hunt_party_finder').length;
        await page.click(W + '.hw-find-here');
        const opened = await wait(page, () => document.querySelector('[data-hs-win="hunt-party"] [data-hs-built]'), null, 3000);
        for (let i = 0; i < 30 && sent(s, 'hr_hunt_party_finder').length === f0; i++) await page.waitForTimeout(100);
        const fq = sent(s, 'hr_hunt_party_finder').slice(f0).map((c) => c.body.p_hunt + ':' + c.body.p_weapon);
        const tab = await page.evaluate(() => { const P = document.querySelector('[data-hs-win="hunt-party"]'); return P && [(P.querySelector('.hw-tab[aria-selected="true"]') || {}).dataset?.tab, P.querySelector('[data-hs-act="find-ground"]').value, P.querySelector('[data-hs-act="find-weapon"]').value].join(':'); });
        if (!opened || fq.join() !== 'millrace_sewer:sword' || tab !== 'find:millrace_sewer:sword') fails.push('AW-28 Find a party opened ' + JSON.stringify({ opened, fq, tab }));
      }
      if (errors.length) fails.push('AW-25 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-25b the phone: the list, then the ground's page as the sheet, with the way back
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25 the Hunts sheet did not open at 922x423');
      else {
        const seen = () => page.evaluate((w) => { const on = (q) => { const n = document.querySelector(w + q); return !!n && n.getClientRects().length > 0; };
          const b = document.querySelector(w + '.hs-win-body'); return [on('.hw-hunt-list'), on('.hw-hunt-detail'), on('.hw-hd-back'), b.scrollWidth <= b.clientWidth + 1].join(); }, W);
        /* A press as the shell routes it (a DOM click): a control a mutant leaves off-screen is a rule's red, not a harness timeout. */
        const press = (q) => page.evaluate((sel) => { const n = document.querySelector(sel); if (n) n.click(); return !!n; }, W + q);
        const s0 = await seen();
        if (shots) await shot(page, 'hunts-922x423-list');
        await press('.hw-hunt[data-hunt="millrace_sewer"]');
        await page.waitForTimeout(300);
        const s1 = await seen();
        if (shots) await shot(page, 'hunts-922x423-sewer');
        await press('.hw-hd-back');
        await page.waitForTimeout(200);
        const s2 = await seen();
        if (s0 !== 'true,false,false,true' || s1 !== 'false,true,true,true' || s2 !== 'true,false,false,true') fails.push('AW-25 the phone sheet shows (list, page, back, fits) ' + JSON.stringify([s0, s1, s2]));
      }
      await ctx.close();
    }

    { // AW-29 THE ROUND TRIP: open Hunts, pick a ground, Enter, hunt, back in town: Hunts shows the same pick
      const { ctx, page, s, up } = await open({ mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-29 the Hunts window did not open');
      else {
        await page.click(W + '.hw-hunt[data-hunt="meadowbrook_thicket"]');
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
        for (let i = 0; i < 30 && !sent(s, 'hr_hunt_enter').length; i++) await page.waitForTimeout(100);
        const go = sent(s, 'hr_hunt_enter').map((c) => c.body.p_hunt);
        /* The server's answer: the hero is hunting there. */
        s.env.hunt = Object.assign(clone(FIXTURE.hunt), { hunt_id: 'meadowbrook_thicket' });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'combat', active_id: 'meadowbrook_thicket' });
        await pushEnvelope(page, s);
        /* The server says the hero is hunting: the window that sent the Enter closes (playtest 2026-10-24, HS-9b);
           opened again while hunting, it says where the hero is. */
        const closed = await wait(page, () => !document.querySelector('[data-hs-win="hunts"]:not(.is-leaving)'), null, 4000);
        if (!closed) fails.push('AW-29 the Hunts window stayed over the hunt it entered');
        await openWin(page, 'h', 'hunts');
        const hunting = await wait(page, (w) => /You are hunting in Meadowbrook Thicket/.test(document.querySelector(w + '.hw-hunts-now').textContent)
          && document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled, W, 4000);
        /* Back in town (the hunt ended): the window still holds the Thicket, ready to go again; after a close and reopen too. */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        /* (The hunt's end may bring its summary forward; the Hunts window is opened again as a player would.) */
        await openWin(page, 'h', 'hunts');
        const back = await wait(page, (w) => /^Pick a hunt/.test(document.querySelector(w + '.hw-hunts-now').textContent), W, 4000);
        const after = await page.evaluate((w) => [(document.querySelector(w + '.hw-hunt.is-picked') || {}).dataset?.hunt, document.querySelector(w + '.hw-hd-name').textContent,
          document.querySelector(w + '.hw-hunt-detail .hw-hunt-enter').disabled].join(':'), W);
        if (go.join() !== 'meadowbrook_thicket' || !hunting || !back || after !== 'meadowbrook_thicket:Meadowbrook Thicket:false') fails.push('AW-29 the round trip reads ' + JSON.stringify({ go, hunting, back, after }));
      }
      await ctx.close();
    }

    { // AW-31 THE CLEAN RETURN (designer walk 2026-10-25 #5), THE CARD'S NEXT STEP, THE SALE IN VIEW (#6), SERVICES IN THE SHOP
      /* A Level 5 hero in the Cellar with loot and no gear in its bag (the bar's lessons read, a bar with nothing left to
         teach), so the card waiting in town is "Sell what only pays coin"; 25 more priced loot stacks make the Sell list
         run past the Shop's fold. */
      const MORE = ['small_fang', 'giant_rat_hide', 'venom_sac', 'hive_wasp_stinger', 'goblin_ear', 'goblin_totem', 'magic_essence', 'rune_frag', 'coal',
        'bat_wing', 'night_fang', 'oak_log', 'iron_ore', 'spider_eye', 'bear_claw', 'dire_fang', 'alpha_fang', 'willow_log', 'troll_hide', 'iron_bar',
        'steel_bar', 'hell_ember', 'dark_sigil', 'brute_plate', 'cracked_spellstone'];
      const back5 = (e) => {
        e.state = Object.assign({}, e.state, { level_xp: 1736 });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 28, level: 1, frac: 0 } });
        for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete e.inventory[id];
        for (const id of MORE) { e.inventory[id] = 3; e.shop.bids[id] = 2; }
        e.hunt_settings = Object.assign({}, e.hunt_settings, { slots: [], bar: [] });
      };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: back5, residue: { coach: { read: ['bar_intro'] } } });
      if (!up) fails.push('AW-31 the page did not mount');
      else {
        const look = () => page.evaluate(() => {
          const btn = (q) => document.querySelector('[data-hs-win="hunt-summary"] ' + q);
          return { analyzer: !!document.querySelector('[data-hs-widget="analyzer"]'), party: !!document.querySelector('[data-hs-widget="party"]'),
            bar: !!document.querySelector('[data-hs-widget="hunt-topbar"]'), summary: !!document.querySelector('[data-hs-win="hunt-summary"]:not(.is-leaving)'),
            toast: /has ended/.test((document.querySelector('[data-hs-widget="alerts"]') || {}).textContent || ''),
            next: btn('[data-hs-act="coach-next"]') && !btn('[data-hs-act="coach-next"]').hidden ? btn('[data-hs-act="coach-next"]').textContent : null,
            againMain: btn('[data-hs-act="again"]') ? btn('[data-hs-act="again"]').classList.contains('is-primary') : null };
        });
        const ringed = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-coach-ring]')).map((e) => e.getAttribute('data-hs-open') || e.getAttribute('data-tab')
          || e.getAttribute('data-coach-hook') || e.getAttribute('data-hs-act') || e.className));
        const inHunt = await look();
        if (!inHunt.analyzer || !inHunt.bar) fails.push('AW-31 the fixture hunt shows no hunt widgets: ' + JSON.stringify(inHunt));
        /* the hero leaves the Cellar: the summary is the one notice; no analyzer, no party panel, no "has ended" toast */
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'left', ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-built]'), null, 3000);
        await page.waitForTimeout(300);
        const town = await look();
        if (town.analyzer || town.party || town.toast || !town.summary) fails.push('AW-31 back in town the screen holds more than the summary: ' + JSON.stringify(town));
        /* the card's next step is the summary's main press, Hunt again the second */
        if (town.next !== 'Next: Sell what only pays coin' || town.againMain !== false) fails.push('AW-31 the summary\'s main press is ' + JSON.stringify(town) + ', want "Next: Sell what only pays coin" over Hunt again');
        if (shots) await shot(page, 'alpha-1440x900-return-summary');
        /* pressed: the summary goes, the hunt bar leaves with it, and the Shop opens with the card inside it, the Sell tab ringed */
        await page.click('[data-hs-win="hunt-summary"] [data-hs-act="coach-next"]');
        const inShop = await wait(page, () => document.querySelector('[data-hs-win="shop"] [data-hs-built]') && !document.querySelector('[data-hs-win="hunt-summary"]:not(.is-leaving)'), null, 3000);
        await page.waitForTimeout(400);
        const after = await look();
        const card = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="shop"] > .hs-win-coach .hs-pointer'); return p ? p.getAttribute('data-tutorial') : null; });
        if (!inShop || after.bar || card !== 'sell_loot') fails.push('AW-31 the next step left ' + JSON.stringify({ inShop, bar: after.bar, card }) + ', want the Shop open with "Sell what only pays coin" in it and no hunt bar');
        const r0 = await ringed();
        if (r0.join() !== 'sell') fails.push('AW-31 in the Shop the ring is on ' + JSON.stringify(r0) + ', want the Sell tab');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(400);
        if ((await ringed()).join() !== 'sell-loot') fails.push('AW-31 on the Sell tab the ring is on ' + JSON.stringify(await ringed()) + ', want Sell all loot');
        /* the confirmation is in view inside the window (it sat under the list, below the fold), by the Shop's own doing:
           measured in the same task as the press, before the coach's ring (which scrolls to what it rings) can land */
        const cf = await page.evaluate(() => {
          document.querySelector('[data-hs-win="shop"] [data-hs-act="sell-loot"]').click();
          const c = document.querySelector('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm');
          /* in view = inside the window's body box AND on the screen (a body taller than the screen still hides it) */
          const w = c.closest('[data-hs-win]').querySelector('[data-hs-body]').getBoundingClientRect(), r = c.getBoundingClientRect();
          return { on: c.classList.contains('is-on'), top: Math.round(r.top), bottom: Math.round(r.bottom), boxTop: Math.round(Math.max(0, w.top)),
            boxBottom: Math.round(Math.min(window.innerHeight, w.bottom)), lines: document.querySelectorAll('[data-hs-win="shop"] .hw-sell-list > li').length };
        });
        if (!cf.on || cf.top < cf.boxTop || cf.bottom > cf.boxBottom) fails.push('AW-31 the sale\'s confirmation is out of view: ' + JSON.stringify(cf));
        await page.waitForTimeout(400);
        if ((await ringed()).join() !== 'sell-confirm') fails.push('AW-31 with the confirmation open the ring is on ' + JSON.stringify(await ringed()) + ', want its Sell');
        if (shots) await shot(page, 'alpha-1440x900-shop-sell-confirm');
        /* SERVICES IN THE SHOP (Tyler 2026-10-25): no Services icon; R opens the Shop on its Services tab, from the Sell tab too */
        const icons = await page.evaluate(() => Array.from(document.querySelectorAll('.hs-launch')).map((b) => b.getAttribute('data-hs-open')));
        if (icons.includes('services') || !icons.includes('shop')) fails.push('AW-31 the icon row reads ' + icons.join(','));
        await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
        /* at once, in the same task as the key (not at the next display tick) */
        const atOnce = await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
          return (document.querySelector('[data-hs-win="shop"] .hw-tab[aria-selected="true"]') || {}).dataset?.tab; });
        if (atOnce !== 'services') fails.push('AW-31 R over the open Shop did not switch it to Services at once (it shows ' + atOnce + ')');
        await page.waitForTimeout(300);
        const svc = () => page.evaluate(() => ({ tab: (document.querySelector('[data-hs-win="shop"] .hw-tab[aria-selected="true"]') || {}).dataset?.tab,
          pane: !!document.querySelector('[data-hs-win="shop"] [data-pane="services"].is-on .hw-services .hw-bless'),
          stam: !!document.querySelector('[data-hs-win="shop"] [data-pane="services"].is-on [data-hs-act="stam-ask"]') }));
        const v1 = await svc();
        if (v1.tab !== 'services' || !v1.pane || !v1.stam) fails.push('AW-31 R over the open Shop shows ' + JSON.stringify(v1) + ', want its Services tab');
        await openWin(page, 'r', 'shop');
        await page.waitForTimeout(200);
        const v2 = await svc();
        if (v2.tab !== 'services' || !v2.pane) fails.push('AW-31 R with the Shop closed opens ' + JSON.stringify(v2) + ', want the Shop on Services');
        if (shots) await shot(page, 'alpha-1440x900-shop-services');
      }
      if (errors.length) fails.push('AW-31 console errors: ' + errors.slice(0, 3).join(' | '));
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
        /* Level 30 (gear is worn by Level, Tyler 2026-10-24): the bag's Steel Sword is better than the worn Iron Sword, and
           still never put on (the weapon sets the style); the Mithril Helm needs Level 45. */
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: LEVEL_30_XP });
        Object.assign(e.inventory, { leather_gloves: 1, bronze_belt: 1, copper_ring: 1, mithril_helm: 1 });
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
        if (!pre.on || pre.off || !/^Wear Iron Helm \(\+\d+ Defense/.test(pre.q) || /Steel|Mithril/.test(pre.q)) fails.push('AW-21 the preview line is wrong before the press: ' + JSON.stringify(pre));
        /* A REQUIREMENT THE SERVER'S NUMBERS SAY IS UNMET (Tyler 2026-10-24, "Gear swapping isn't working": Fingerguns
           was offered Equip on a helm he could not wear, and the refusal said nothing on screen; gear is worn by Level
           since): the picked line's Equip is off and says why, and a press sends nothing. */
        await page.click('.hw-pocket[data-item="mithril_helm"]');
        await page.waitForTimeout(150);
        const need = await page.evaluate(() => ({ off: document.querySelector('.hw-inv [data-hs-act="primary"]').disabled,
          why: document.querySelector('.hw-inv .hw-pick-why').textContent }));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        if (!need.off || need.why !== 'Needs Level 45 — you\'re 30.' || sent(s, 'hr-accrue', 'equip').length) fails.push('AW-21 a Mithril Helm at Level 30 reads ' + JSON.stringify(need) + ', ' + sent(s, 'hr-accrue', 'equip').length + ' equip(s) sent');
        /* A refusal (the engine's 409): nothing moves, and the words say why ON THE LINE PRESSED, in view (they sat at the
           window's foot, below the fold, so the press looked like nothing). */
        s.refuse = 'requirement_not_met';
        await page.click('.hw-inv [data-hs-act="equip-upgrades"]');
        await page.waitForTimeout(50);
        await wait(page, () => !document.querySelector('.hw-inv [data-hs-act="equip-upgrades"]').disabled, null, 3000);
        const said = await page.evaluate(() => { const n = document.querySelector('.hw-inv .hw-upgrade-why'), b = document.querySelector('[data-hs-win="inventory"] .hs-win-body').getBoundingClientRect();
          const q = n.getBoundingClientRect(); return { t: n.textContent, inView: n.getClientRects().length > 0 && q.top >= b.top - 1 && q.bottom <= b.bottom + 1 }; });
        if (said.t !== 'You don\'t meet that item\'s requirement yet. Nothing was put on.' || !said.inView) fails.push('AW-21 a refused Equip upgrades says ' + JSON.stringify(said) + ' on its line (want the words, in view)');
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
      if (errors.filter((e) => !/status of 409/.test(e)).length) fails.push('AW-21 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-21 MID-HUNT (Tyler 2026-10-24): the engine refuses every equip while the hunt is open (equip.js hunt_open),
      // so the Inventory never offers one: Equip and Equip upgrades are off and say why, a press sends nothing, and the
      // engine's own refusal reads as what to do
      /* Level 30: every piece in the bag is wearable by its Level (Tyler 2026-10-24), so only the hunt turns them off. */
      const hunting = (e) => { Object.assign(e.inventory, { steel_helm: 1, iron_helm: 1, iron_platebody: 1 }); e.state = Object.assign({}, e.state, { level_xp: LEVEL_30_XP }); };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: hunting });
      if (up) {
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(250);
        await page.click('.hw-pocket[data-item="iron_helm"]');
        await page.waitForTimeout(150);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        const mid = await page.evaluate(() => { const q = (x) => document.querySelector('[data-hs-win="inventory"] ' + x);
          return { equip: q('[data-hs-act="primary"]').disabled, why: q('.hw-pick-why').textContent,
            upg: q('[data-hs-act="equip-upgrades"]').disabled, upgWhy: q('.hw-upgrade-why').textContent }; });
        if (!mid.equip || mid.why !== 'Leave the hunt to change gear.' || !mid.upg || mid.upgWhy !== 'Leave the hunt to put these on.' || sent(s, 'hr-accrue', 'equip').length)
          fails.push('AW-21 mid-hunt the Inventory reads ' + JSON.stringify(mid) + ', ' + sent(s, 'hr-accrue', 'equip').length + ' equip(s) sent');
      } else fails.push('AW-21 the hunting character did not mount');
      if (errors.length) fails.push('AW-21 mid-hunt console errors: ' + errors.slice(0, 3).join(' | '));
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

    { // AW-24 TOWN WORK COUNTS UP BETWEEN PAYOUTS (Tyler 2026-10-23), the transition: Start → it ticks, pending →
      // a payout replaces it → a lower payout snaps it down → a reload restarts it from the server's watermark (no
      // double count) → Stop → nothing ticks. The stub pays like the engine: a settle pays the whole actions since its
      // watermark and moves the watermark by exactly those (the rest deferred); its clock is the real one.
      const TWm = await import(pathToFileURL(join(ROOT, 'src/shell/town-work.js')).href);
      const tree = TWm.workRow('gather', 'normal_tree');
      const STEP = TWm.actionMs({ read: (k) => FIXTURE[k] }, tree);
      const XP = TWm.xpEach(tree);
      /* The start is stamped LEAD before its answer, so the first action is due ~400 ms after it (a short test). */
      const LEAD = STEP - 400;
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        /* XP inside its level on the curve (the fixture's 1500 sits under Woodcutting 12's 1584): the bar has room to fill. */
        e.skills = Object.assign({}, e.skills, { woodcutting: { xp: 1700, level: 12, frac: 0 } });
        Object.defineProperty(e, 'now', { get: () => new Date().toISOString(), enumerable: true, configurable: true });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const st = () => s.env.state;
      const from = () => Math.max(Date.parse(st().accrued_to), Date.parse(st().active_since));
      const due = () => (st().active_kind === 'gather' ? Math.max(0, Math.floor((Date.now() - from()) / STEP)) : 0);
      const settle = (short) => {
        const n = due();
        if (!n) return;
        s.env.inventory.normal_log += short ? n - 1 : n;
        s.env.skills.woodcutting.xp += n * XP;
        st().accrued_to = new Date(from() + n * STEP).toISOString();
      };
      s.onCall = (name, b) => {
        if (name !== 'hr-accrue') return;
        if (b.verb === 'set_activity') {
          if (b.activity.kind === 'gather') { const t = new Date(Date.now() - LEAD).toISOString(); Object.assign(st(), { active_kind: 'gather', active_id: b.activity.id, active_since: t, accrued_to: t }); }
          else { settle(false); Object.assign(st(), { active_kind: 'idle', active_id: null }); }
        } else if (!b.verb) { settle(s.short === true); s.short = false; }
      };
      const W = '[data-hs-win="skills-trade"]';
      const pocket = () => page.evaluate(() => { const c = document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="normal_log"] .hw-count'); return c ? { n: Number(c.textContent), ahead: c.classList.contains('is-ahead') } : null; });
      /* A read at least 600 ms from an action boundary, so it can never straddle one. */
      const calm = async () => { for (let i = 0; i < 80; i++) { const ph = (Date.now() - from()) % STEP; if (ph > 600 && ph < STEP - 600) return; await page.waitForTimeout(100); } };
      const want = () => ({ n: s.env.inventory.normal_log + due(), ahead: due() > 0 });
      const same = (a, b) => !!a && a.n === b.n && a.ahead === b.ahead;
      if (!up) fails.push('AW-24 the town did not mount');
      else {
        await openWin(page, 'g', 'skills-trade');
        await page.click(W + ' .hw-skill[data-skill="woodcutting"]');
        await page.waitForTimeout(300);
        await page.click(W + ' .hw-work-row[data-id="normal_tree"] .hw-work-go');
        /* It ticks: the line's count and the skill's XP move one action on, marked pending. */
        const ticked = await wait(page, (w) => document.querySelector(w + ' .hw-work-now .hw-burying-q .is-ahead'), W, 4000);
        const work = await page.evaluate((w) => ({ line: document.querySelector(w + ' .hw-work-now .hw-burying-q').textContent,
          ahead: Array.from(document.querySelectorAll(w + ' .hw-work-now .hw-burying-q .is-ahead')).map((e) => e.textContent).join('|'),
          xp: !!document.querySelector(w + ' .hw-work-head.has-xp .hw-skill-xp.is-ahead'), seg: (document.querySelector(w + ' .hw-work-head .hw-skill-ahead') || {}).style.width }), W);
        if (!ticked || !/^Chopping the Normal Tree: \d+ chopped so far\./.test(work.line) || !/^\d+ chopped so far$/.test(work.ahead) || !work.xp || !work.seg || work.seg === '0%')
          fails.push('AW-24 the Work window did not tick between payouts: ' + JSON.stringify(work));
        if (shots) await shot(page, 'ticker-1440x900-work');
        await openWin(page, 'b', 'inventory');
        await calm();
        const p1 = await pocket(), w1 = want();
        if (!same(p1, w1) || !p1.ahead) fails.push('AW-24 the bag does not count the work in progress, pending: shows ' + JSON.stringify(p1) + ', the server holds ' + s.env.inventory.normal_log + ' and its engine has done ' + due() + ' more');
        /* Never spent: the picked stack, the sale and its total are the server's count. */
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="normal_log"]');
        await page.waitForTimeout(200);
        const pick = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-pick small').textContent);
        await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
        await page.waitForTimeout(300);
        const ask = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-confirm-q').textContent);
        if (shots) await shot(page, 'ticker-1440x900-bag');
        await page.click('[data-hs-win="inventory"] [data-hs-act="confirm-no"]');
        if (!pick.startsWith('×' + s.env.inventory.normal_log + ' · ') || !/more on the way/.test(pick) || ask !== 'Sell Normal Log ×' + s.env.inventory.normal_log + '?')
          fails.push('AW-24 the pending logs reach a control: the pick reads ' + JSON.stringify(pick) + ' and the sale asks ' + JSON.stringify(ask));
        if (sent(s, 'hr-accrue', 'vendor_sell_many').length) fails.push('AW-24 a sale was sent while checking it');
        /* A payout replaces it: the server's bag, the count restarted from its new watermark. */
        const held = s.env.inventory.normal_log;
        await pushEnvelope(page, s);
        await calm();
        const p2 = await pocket(), w2 = want();
        if (s.env.inventory.normal_log <= held || !same(p2, w2)) fails.push('AW-24 after a payout the bag shows ' + JSON.stringify(p2) + ', want ' + JSON.stringify(w2) + ' (the server paid ' + (s.env.inventory.normal_log - held) + ')');
        /* A payout under the prediction snaps it down to the server's word. */
        await wait(page, () => { const c = document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="normal_log"] .hw-count'); return c && c.classList.contains('is-ahead'); }, null, STEP + 1500);
        await calm();
        const shown = await pocket();
        s.short = true;
        await pushEnvelope(page, s);
        const p3 = await pocket(), w3 = want();
        if (!shown || !same(p3, w3) || p3.n >= shown.n) fails.push('AW-24 a payout under the prediction shows ' + JSON.stringify(p3) + ' after ' + JSON.stringify(shown) + ', want the server\'s ' + JSON.stringify(w3));
        /* A reload mid-window: the count starts again from the server's watermark, nothing counted twice. */
        await wait(page, () => { const c = document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="normal_log"] .hw-count'); return c && c.classList.contains('is-ahead'); }, null, STEP + 1500);
        if (!(await reloadAndPlay(page))) fails.push('AW-24 the reload did not come back');
        else {
          await openWin(page, 'b', 'inventory');
          await calm();
          const p4 = await pocket(), w4 = want();
          if (!same(p4, w4)) fails.push('AW-24 after a reload mid-window the bag shows ' + JSON.stringify(p4) + ', want ' + JSON.stringify(w4) + ' (from the server\'s watermark)');
          /* Stop: the server collects; nothing ticks after it. */
          await page.click('[data-hs-win="inventory"] [data-hs-act="bury-stop"]');
          await page.waitForTimeout(800);
          const p5 = await pocket();
          await page.waitForTimeout(STEP + 400);
          const p6 = await pocket();
          const stopped = { n: s.env.inventory.normal_log, ahead: false };
          if (st().active_kind !== 'idle' || !same(p5, stopped) || !same(p6, stopped)) fails.push('AW-24 after Stop the bag shows ' + JSON.stringify(p5) + ' then ' + JSON.stringify(p6) + ', want the server\'s ' + JSON.stringify(stopped) + ' and nothing ticking');
        }
      }
      if (errors.length) fails.push('AW-24 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-17 the skills are two windows and neither scrolls, on the phone too; the first-minute pointer
      /* A character that has killed nothing: Level XP 0 (the core rebuild: Level comes from kills only). */
      const fresh = (e) => { for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'prayer', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 }; for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 }); };
      const { ctx, page, up } = await open({ viewport: { width: 922, height: 423 }, mutateEnv: fresh });
      if (up) {
        const ptr = await page.evaluate(() => { const p = document.querySelector('.hs-pointer'); return p ? p.textContent : null; });
        if (!ptr || !/Open Hunts/.test(ptr)) fails.push('AW-17 a fresh character sees no pointer to Hunts: ' + JSON.stringify(ptr));
        if (shots) await shot(page, 'alpha-922x423-first-minute');
        /* AW-17b THE RING (designer playtest 2026-10-24: on a phone nothing said which of 16 icons is Hunts): the card's
           control wears the gold ring, and the card goes INTO the window it points at: the Hunts icon, then (the phone
           shows the list first) the Mill Cellar's line, with the card at the top of the sheet. */
        const ringed = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-coach-ring]')).map((e) => (e.getAttribute('data-hs-open') || e.getAttribute('data-hunt') || e.className) + (e.getClientRects().length ? '' : ':hidden')));
        const r0 = await ringed();
        if (r0.join() !== 'hunts') fails.push('AW-17b a fresh character\'s ring is on ' + JSON.stringify(r0) + ', wanted the Hunts icon');
        if (await openWin(page, 'h', 'hunts')) {
          await page.waitForTimeout(400);
          const r1 = await ringed();
          const inWin = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="hunts"] > .hs-win-coach .hs-pointer'); return p ? p.textContent : null; });
          if (r1.join() !== 'mill_cellar') fails.push('AW-17b with Hunts open on the phone the ring is on ' + JSON.stringify(r1) + ', wanted the Mill Cellar line');
          /* inside the window it says its words for there (board 2026-10-25 #20: never "Open Hunts" over the open Hunts) */
          if (!inWin || !/Press Enter/.test(inWin) || /Open Hunts/.test(inWin)) fails.push('AW-17b the card is not inside the Hunts sheet, in its words for there: ' + JSON.stringify(inWin));
          if (shots) await shot(page, 'alpha-922x423-first-minute-hunts');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } else fails.push('AW-17b H did not open Hunts');
        for (const [key, id] of [['g', 'skills-trade']]) {
          if (!(await openWin(page, key, id))) { fails.push('AW-17 ' + id + ' did not open'); continue; }
          await page.waitForTimeout(300);
          const m = await page.evaluate((w) => { const b = document.querySelector('[data-hs-win="' + w + '"] .hs-win-body'); return { sh: b.scrollHeight, ch: b.clientHeight, n: b.querySelectorAll('.hw-skill').length }; }, id);
          if (m.sh > m.ch + 1 || m.n < 4) fails.push('AW-17 ' + id + ' at 922x423 scrolls (' + m.sh + ' > ' + m.ch + ') or lists ' + m.n + ' skills');
        }
      } else fails.push('AW-17 the phone did not mount');
      await ctx.close();
    }

    { // AW-30 the window opacity: a display preference in the residue, the fills fade, the words do not, a reload keeps it
      const { ctx, page, s, up } = await open();
      if (!up) fails.push('AW-30 the page did not mount');
      else {
        const look = () => page.evaluate(() => {
          const w = document.querySelector('[data-hs-win="settings"]:not(.is-leaving)');
          const title = w && w.querySelector('.hs-win-title');
          const val = w && w.querySelector('[data-row="ui.windowOpacity"] .st-val');
          return { root: document.documentElement.style.getPropertyValue('--panel-alpha'), floor: w ? getComputedStyle(w, '::before').opacity : null,
            title: title ? getComputedStyle(title).opacity + '|' + getComputedStyle(title).color : null, val: val ? val.textContent : null };
        });
        const toInterface = async () => {
          if (!(await openWin(page, 'Escape', 'settings'))) return false;
          await page.click('[data-hs-win="settings"] .st-tab[data-cat="interface"]');
          return wait(page, () => document.querySelector('[data-row="ui.windowOpacity"] input[type="range"]'), null, 3000);
        };
        if (!(await toInterface())) fails.push('AW-30 Settings > Interface has no Window opacity slider');
        else {
          const before = await look();
          if (before.root !== '1' || before.floor !== '1' || before.val !== '100%') fails.push('AW-30 a fresh hero\'s windows are not solid at 100%: ' + JSON.stringify(before));
          await page.evaluate(() => { const r = document.querySelector('[data-row="ui.windowOpacity"] input[type="range"]');
            r.focus(); r.value = '70'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
          await page.waitForTimeout(300);
          const now = await look();
          if (now.root !== '0.7' || now.floor !== '0.7') fails.push('AW-30 the slider at 70 did not fade the window floor to 0.7: ' + JSON.stringify(now));
          if (now.title !== before.title || !/^1\|/.test(now.title || '')) fails.push('AW-30 the window title faded with its floor: ' + JSON.stringify([before.title, now.title]));
          /* The put is one per burst, after the residue debounce (src/session/config.js residueDebounceMs). */
          for (let i = 0; i < 40 && !sent(s, 'hr_put_client_state').some((c) => c.body.p_patch && c.body.p_patch.panelAlpha === 70); i++) await page.waitForTimeout(100);
          const puts = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.panelAlpha).filter((v) => v !== undefined);
          if (puts[puts.length - 1] !== 70) fails.push('AW-30 the opacity was not put as residue panelAlpha 70: ' + JSON.stringify(puts));
          if (!(await reloadAndPlay(page))) fails.push('AW-30 the reload did not come back');
          else if (!(await toInterface())) fails.push('AW-30 after a reload Settings > Interface did not open');
          else {
            const after = await look();
            if (after.root !== '0.7' || after.floor !== '0.7' || after.val !== '70%') fails.push('AW-30 after a reload the windows are not at 70%: ' + JSON.stringify(after));
          }
        }
      }
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
  ['bag actions stay on while an intent is in flight', 'src/shell/windows/inventory/grid.js', "prop(pb, 'disabled', sc.pending || !prim || !!wearWhy);", "prop(pb, 'disabled', !prim || !!wearWhy);"],
  ['a pocket is rebuilt whenever its count changes', 'src/shell/windows/inventory/grid.js', '    key: (r) => r.id,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),', '    key: (r) => r.id + ":" + r.qty,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),'],
  ['a sale is sent without the confirmation', 'src/shell/windows/inventory/actions.js', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();\n  doSell(st, repaint);'],
  ['the Shop lists supplies again', 'src/data/supply-basics.js', "export const SHOP_SOLD_KINDS = Object.freeze(['tool', 'gear', 'seed']);", "export const SHOP_SOLD_KINDS = Object.freeze(['food', 'drink', 'ammo', 'tool', 'gear', 'seed']);"],
  ['an equip in flight is not marked', 'src/shell/windows/inventory/actions.js', '  sc.wearing = { slots: [slot], items: id ? [id] : [] };\n', ''],
  ['Equip upgrades swaps the weapon', 'src/shell/upgrade-plan.js', "const STYLE_SLOTS = new Set(['weapon', 'shield', 'ammo']);", "const STYLE_SLOTS = new Set(['shield', 'ammo']);"],
  ['Equip upgrades wears what the hero cannot use yet', 'src/shell/upgrade-plan.js', '  return have !== null && have >= it.reqLv;', '  return true;'],
  ['Equip upgrades marks nothing in flight', 'src/shell/widgets/upgrade-line.js', '  sc.wearing = { slots, items: slots.map((s) => plan.ops[s]) };\n', ''],
  ['Equip upgrades sends one intent per piece', 'src/shell/widgets/upgrade-line.js', "    try { return await cs.edgeIntent('equip', { equip: Object.assign({}, plan.ops) }); } finally { sc.wearing = null; }", "    try { let r; for (const s of slots) r = await cs.edgeIntent('equip', { equip: { [s]: plan.ops[s] } }); return r; } finally { sc.wearing = null; }"],
  ['a level refusal reads as a bare refusal', 'src/data/refusal-words.js', "  requirement_not_met: 'You don\\'t meet that item\\'s requirement yet. Nothing was put on.',\n", ''],
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
  ['the Burying line ignores the server pointer', 'src/shell/windows/inventory/bury.js', "  if (e) return lineParts(buryingWord(e) + ' ' + itemName(e.input), runParts(cs, workOf(cs)), '. Your bag and ' + skillName(e.skill) + ' XP update as it goes.');", '  if (e) return [];'],
  ['the work line says nothing of how far it has got', 'src/shell/town-work.js', "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), how, '. ' + tail);", "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), [], '. ' + tail);"],
  ['a watched bench is never re-read', 'src/shell/shell.js', "(wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);", "false) watchTown(ctx.character);"],
  ['raw food offers no Cook all', 'src/shell/bag-model.js', "      if (!r || !r.output || r.gated || kindOf(r.output) !== 'food') continue;", '      continue;'],
  ['the bench ignores the server level', 'src/shell/windows/inventory/bury.js', "  if (lv < e.recipe.req) return 'Needs '", "  if (false) return 'Needs '"],
  ['the skills are one window again', 'src/shell/windows/skills.js', "export const renderTradeSkills = skillsWindow([['gather', 'Gathering'], ['artisan', 'Crafting']]);", "export const renderTradeSkills = skillsWindow([['combat', 'Combat'], ['gather', 'Gathering'], ['artisan', 'Crafting']]);"],
  ['a new player gets no pointer to Hunts', 'src/shell/launcher.js', "+ (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>'", "+ '</nav>'"],
  ['coach: the card leaves when its window opens (AW-17b, playtest 2026-10-24)', 'src/shell/shell.js', "placeCoach(slot, win && slot.parentElement.getAttribute('data-hs-win') === win ? coachHtml(cs, card, true) : '');", "placeCoach(slot, '');"],
  ['coach: nothing inside a window is ringed (AW-17b)', 'src/shell/shell.js', '    ringCoach(ctx, card, ringRoots);\n', ''],
  ['coach: the ring is on a control nobody can see (AW-17b)', 'src/shell/launcher.js', "const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');", 'const shown = () => true;'],
  ['coach: the Hunts window stays over the hunt it entered (AW-29)', 'src/shell/windows/hunts.js', "  const thenClose = (r) => { if (r && r.ok) { sc.closeOnHunt = true; repaint(); } };\n", '  const thenClose = () => {};\n'],
  /* lane/b-tutorial-rings (AW-31): the clean return, the card's next step, the sale in view, Services in the Shop */
  ['coach: the analyzer and the party panel stay in town after the hunt (AW-31)', 'src/shell/shell.js', '    if (!h || !h.ended) return true;\n', '    return true;\n'],
  ['coach: the hunt\'s "has ended" toast shows over its summary (AW-31)', 'src/shell/alerts.js', '    if (c.quiet) return false;\n', ''],
  ['coach: Hunt again stays the summary\'s main press over the card (AW-31)', 'src/shell/windows/hunt-summary.js', 'const card = huntOpen ? null : nextStepOf(ctx);', 'const card = null;'],
  ['coach: the sale\'s confirmation sits under the list, out of view (AW-31)', 'src/shell/windows/shop.js', '  if (opening) revealInWindow(cf);\n', ''],
  ['coach: the sale\'s confirmation is never ringed (AW-31)', 'src/shell/windows/shop.js', ' data-coach-hook="sell-confirm"', ''],
  ['coach: R opens nothing once Services left the icon row (AW-31)', 'src/data/shell-windows.js', ", tabKeys: Object.freeze({ r: 'services' }) }),", ' }),'],
  ['coach: R over the open Shop never switches it to Services (AW-31)', 'src/shell/shell.js', '    for (const id of wm.openIds()) if (wm.wantsTab(id)) refresh(id);\n', ''],
  /* The Hunts window, master-detail (designer plan 2026-10-22): AW-25 .. AW-29. */
  ['AW-25 every creature reads common', 'src/shell/hunt-ground-facts.js', "  if (share >= SHARE_BANDS.common) return 'common';", "  return 'common';"],
  ['AW-25 a Scarce piece reads as the ground\'s Rare (odds, not the band)', 'src/shell/hunt-ground-facts.js', 'd.ch < 1 && REVEAL_BANDS.includes(bandOf(d));', 'd.ch < 1 && d.ch <= 0.05;'],
  ['AW-25 every line says Fits your level', 'src/shell/windows/hunts.js', "fits === r.hunt ? (party ? 'Fits your party' : 'Fits your level') : ''", "(party ? 'Fits your party' : 'Fits your level')"],
  ['AW-25 the band ignores the floor', 'src/shell/hunt-list.js', '  const warn = rangeWords(r, level);', '  const warn = null;'],
  ['AW-25 a ground with no best says nothing', 'src/shell/hunt-list.js', 'none: solo || party ? null :', 'none: true ? null :'],
  ['AW-25 the page shows the first ground, not the pick', 'src/shell/windows/hunts.js', '  const r = list.find((x) => x.hunt === sc.pick) || null;', '  const r = list[0] || null;'],
  ['AW-25 the creatures are never drawn', 'src/shell/windows/hunt-detail.js', '  const ok = drawCreature(c, ART, id, LINEUP_SPRITE);', '  const ok = false;'],
  ['AW-25 each creature stands at its own height', 'src/shell/windows/hunt-detail.js', "  style(lineup, '--stand-h', tallest ? tallest + 'px' : null);\n", ''],
  ['AW-30 the window opacity is not kept in the residue', 'src/session/residue.js', '  panelAlpha: sanitizePanelAlpha,', ''],
  ['AW-30 the windows do not follow the opacity setting', 'src/shell/panel-alpha.js', '  return Number.isInteger(v) ? v : PANEL_ALPHA.initial;', '  return globalThis.__panelAlpha ?? PANEL_ALPHA.initial;'],
  ['AW-30 the opacity fades the whole window, words and all', 'src/styles/shell.css', '  image-rendering: pixelated; opacity: var(--panel-alpha);\n}', '  image-rendering: pixelated;\n}\n.hs-win { opacity: var(--panel-alpha); }'],
  ['AW-25 the phone shows the list and the page at once', 'src/styles/windows.css', '  .hw-hunts.is-paged .hw-hunt-list, .hw-hunts.is-paged .hw-hunts-now, .hw-hunts.is-paged .hw-hunts-reco { display: none; }\n', '  .hw-hunts.is-paged .hw-hunts-now, .hw-hunts.is-paged .hw-hunts-reco { display: none; }\n'],
  ['AW-26 the chosen setup is never put on', 'src/shell/windows/hunts.js', '  if (s && Number.isInteger(want) && want !== s.preset) {', '  if (false) {'],
  ['AW-26 the setup on now is put on again', 'src/shell/windows/hunts.js', '  if (s && Number.isInteger(want) && want !== s.preset) {', '  if (s && Number.isInteger(want)) {'],
  ['AW-26 a refused apply still enters', 'src/shell/windows/hunts.js', "    if (!a || !a.ok) return a || { ok: false, error: 'network' };\n", ''],
  ['AW-26 Go as stays on while in flight', 'src/shell/windows/hunt-detail.js', "      prop(b, 'disabled', v.off);", "      prop(b, 'disabled', false);"],
  ['AW-26 a missing piece reads as a bare refusal', 'src/data/refusal-words.js', "  missing_item: 'A piece of that setup’s gear is not in your bag, so nothing was put on.',\n", ''],
  ['AW-26 Go as offers a set the server cannot put on', 'src/shell/hunt-go.js', '  const ids = new Set(saved.map((p) => p.preset).concat([s.preset]));', '  const ids = new Set(s.presets.map((p) => p.preset).concat([s.preset]));'],
  ['AW-27 the store behind a slot is not said', 'src/shell/hunt-go.js', "  const store = st && st.price !== null ? { name: st.name, price: st.price, each: a.type === 'ability' ? 'a cast' : 'each' } : null;", '  const store = null;'],
  ['AW-27 the gold line never shows', 'src/shell/hunt-go.js', '  if (paysStore && gp !== null) {', '  if (false) {'],
  ['AW-27 low stamina is not said', 'src/shell/hunt-go.js', '  else if (st && st.msLeft < STAMINA_SAY_MS) {', '  else if (false) {'],
  ['AW-27 a line that stops the hunt is not marked', 'src/shell/windows/hunt-detail.js', "cls(li, 'is-short', l.short);", "cls(li, 'is-short', false);"],
  ['AW-28 Find a party searches every ground', 'src/shell/windows/party-finder.js', '  const hunt = sc.ground || null, weapon = sc.weapon || null;', '  const hunt = null, weapon = sc.weapon || null;'],
  ['AW-28 the party path shows on every ground', 'src/shell/windows/hunts.js', "    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {", '    partyBlock: !follower ? {'],
  ['AW-28 Bring your heroes offers a hero already in a party', 'src/shell/hunt-go.js', ' && Number.isInteger(o.slot) && !partyMembershipOf(o))', ' && Number.isInteger(o.slot))'],
  ['AW-29 the pick resets after a hunt', 'src/shell/windows/hunts.js', '  if (!sc.pick && list.length) sc.pick = rec.row ? rec.row.hunt : list[0].hunt;', '  if ((!sc.pick || (h && h.ended)) && list.length) sc.pick = rec.row ? rec.row.hunt : list[0].hunt;'],
  ['edgeBody lets an unlisted field through', 'src/session/edge-intents.js', '  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;\n', ''],
  /* AW-24 in the page: the bag's pocket is where the ticker shows, so these two are judged by the page rules. */
  ['the bag shows only the server\'s count while town work runs', 'src/shell/windows/inventory/grid.js', '  patchCount(li, shown.qty, shown.ahead !== 0);', '  patchCount(li, r.qty);'],
  ['a pending count reads as final', 'src/shell/windows/inventory/pockets.js', "  cls(el, 'is-ahead', !!ahead);\n", ''],
  /* AW-24 the town ticker. `ticker:` mutants are judged by the pure rules on a temp copy of src (tickerMutant). */
  ['ticker: it counts an action before the engine has done it', 'src/shell/town-ticker.js', 'const ctx = { fromMs: win.fromMs, toMs: win.toMs,', 'const ctx = { fromMs: win.fromMs, toMs: win.toMs + stepMs,'],
  ['ticker: the line does not mark the pending count', 'src/shell/town-work.js', "parts.push({ key: 'bag', text: whole(s.qty) + ' in your bag', ahead: s.ahead !== 0 });", "parts.push({ key: 'bag', text: whole(s.qty) + ' in your bag', ahead: false });"],
  ['ticker: a payout does not restart the count (the old record is kept)', 'src/shell/town-work.js', '  if (m && m.rec === rec && m.at === at && m.no === no) return m.tick;', '  if (m && m.at === at && m.no === no) return m.tick;'],
  ['ticker: a payout under the prediction never snaps down (merged upward)', 'src/shell/town-ticker.js', '  const d = aheadQty(tick, id);\n  return { qty: Math.max(0, (Number(qty) || 0) + d), ahead: d };',
    '  const d = aheadQty(tick, id);\n  const q = Math.max(HIGH[id] || 0, (Number(qty) || 0) + d);\n  HIGH[id] = q;\n  return { qty: q, ahead: q - (Number(qty) || 0) };'],
  ['ticker: the pending logs can be sold', 'src/shell/windows/inventory/state.js', '  const list = items || [];', '  const t0 = tickOf(cs);\n  const list = (items || []).map((r) => ({ id: r.id, qty: r.qty + ((t0 && t0.items[r.id]) || 0) }));'],
  ['ticker: a stop keeps the last count ticking', 'src/shell/town-work.js', "  if (!townWorkRunning(st, cs.read('hunt'))) return null;\n", "  if (!townWorkRunning(st, cs.read('hunt'))) { const k = TICKS.get(cs); return k ? k.tick : null; }\n"],
  ['ticker: it ticks long after the server stopped settling', 'src/shell/town-ticker.js', '  if (win.capped) return null;\n', ''],
  ['ticker: a hunter\'s town work ticks', 'src/shell/town-work.js', "  if (!townWorkRunning(st, cs.read('hunt'))) return null;\n", "  if (!st || (st.active_kind !== 'gather' && st.active_kind !== 'artisan')) return null;\n"],
  ['ticker: a refused settle still ticks', 'src/shell/town-work.js', '  const refused = !!no && !(rec && no.version !== null && rec.version > no.version);', '  const refused = false;'],
  ['ticker: "too soon for one action" reads as a refusal', 'src/session/refusal.js', "const SETTLE_WAITS = Object.freeze(['below_min_span', 'nothing_accrued', 'replayed', 'idle']);", "const SETTLE_WAITS = Object.freeze(['below_min_span', 'replayed', 'idle']);"],
  ['ticker: the character forgets the settle refusal', 'src/session/character-session.js', '    if (ans.ok) this.settleRefusal = settleRefusalOf(ans);\n', ''],
  ['ticker: a bench runs past its "N left"', 'src/shell/town-ticker.js', 'maxActions: count(o.left) || null', 'maxActions: null'],
  ['ticker: a bench spends inputs the bag does not hold', 'src/shell/town-ticker.js', "    removeItem(id, n) { const take = Math.min(n, bag[id] || 0); bag[id] = (bag[id] || 0) - take; move(id, -take); },", '    removeItem(id, n) { move(id, -n); },'],
  ['ticker: a dish that may burn is counted as cooked', 'src/shell/town-ticker.js', "  const burnable = !gather && w.skill === 'cooking' && !!w.row.output && burnChance(w.row, levelOf(skills, 'cooking'), 0) > 0;", '  const burnable = false;'],
  ['ticker: a yield range is read at its top', 'src/shell/town-ticker.js', '  int: (lo) => Math.ceil(Number(lo) || 0),', '  int: (lo, hi) => Math.floor(Number(hi) || 0),'],
];
/* The doll mutant needs the want set where an equip is asked: plant it beside the intent. */
const COMPANION = { 'the doll wears the item before the server confirms': ['src/shell/windows/inventory/actions.js', "    if (slot) wear(st, repaint, slot, id, 'pick:' + id);", "    if (slot) globalThis.__want = id;\n    if (slot) wear(st, repaint, slot, id, 'pick:' + id);"],
  /* The high-water mark the merged-upward ticker keeps (module scope: one per planted tree). */
  'ticker: a payout under the prediction never snaps down (merged upward)': ['src/shell/town-ticker.js', 'const own = (o, k) =>', 'const HIGH = {};\nconst own = (o, k) =>'],
  /* today's Shop: the confirmation after the list AND no reveal (either alone keeps it in view) */
  'coach: the sale\'s confirmation sits under the list, out of view (AW-31)': ['src/shell/windows/shop.js',
    `    /* the confirmation beside the press, never under the list (the coach rings its Sell: data-coach-hook) */
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes" data-coach-hook="sell-confirm"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">Cancel</button></div></div>'
    + '<ul class="hw-ledger hw-sell-list"></ul><p class="hh-empty hw-sell-none">Nothing in your bag that the shop buys.</p></section>'`,
    `    + '<ul class="hw-ledger hw-sell-list"></ul><p class="hh-empty hw-sell-none">Nothing in your bag that the shop buys.</p>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes" data-coach-hook="sell-confirm"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">Cancel</button></div></div></section>'`] };

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'alpha-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (process.argv.includes('--pure') && !process.argv.includes('--mutate')) {
    const fails = await pure();
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'alpha-windows --pure: ' + fails.length + ' rule(s) RED' : 'alpha-windows --pure: the pure rules hold (AW-0, AW-19..AW-22, AW-24 the town ticker, AW-25..AW-28 the Hunts page)');
    process.exit(fails.length ? 1 : 0);
  }
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'alpha-windows: ' + fails.length + ' rule(s) RED'
      : 'alpha-windows: the windows open; patch in place; the server’s counts win; intents only; locks hold; totals first; no supplies in the Shop; Hunts from the hatch in two presses; Hunts is lines and a page (who lives there, go as, before you go, the party path, the round trip); window presses and focus never steal the World; no void; storage from town; store any amount; storage sorts and filters; bury and cook pay from the server; skills split' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  /* --only=<prefix>: just the mutants whose name starts with it (`--only=ticker:` re-proves the town ticker in seconds:
     its clean control is the pure rules, which are all that judge those mutants). */
  const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7);
  const sharded = shardOf(MUTANTS);
  const mine = sharded && only ? sharded.filter(([n]) => n.startsWith(only)) : sharded;
  if (!mine || !mine.length) { console.log('  ✗ HARNESS: bad --shard (want --shard=K/N with 1 <= K <= N) or no mutant matches --only'); process.exit(2); }
  const pureOnly = mine.every(([n]) => n.startsWith('ticker:'));
  const clean = await cleanControl(() => (pureOnly ? pure() : checks(null, null)));
  console.log(clean.line);
  if (clean.code) process.exit(clean.code);
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [name, file, from, to] of mine) {
    const over = {};
    const plant = [[file, from, to]].concat(COMPANION[name] ? [COMPANION[name]] : []);
    let missing = null;
    for (const [f, x, y] of plant) {
      const text = over[f] !== undefined ? over[f] : await readFile(join(ROOT, f), 'utf8');
      if (!text.includes(x)) { missing = f; break; }
      over[f] = text.replace(x, y);
    }
    if (missing) { console.log('  ✗ ' + name + ' — HARNESS: anchor not found in ' + missing); counts.harness++; continue; }
    const v = await judge(() => (name.startsWith('edgeBody') ? pureMutant(over[file]) : name.startsWith('ticker:') ? tickerMutant(over) : checks(over, null)));
    console.log(report(name, v, counts));
  }
  console.log(exitOf(counts) ? 'alpha-windows --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'alpha-windows --mutate: ' + mine.length + '/' + mine.length + ' mutants caught, each by a named rule' + (mine === MUTANTS ? '' : ' (' + (only ? '--only=' + only + ', ' : '') + 'of ' + MUTANTS.length + ')'));
  process.exit(exitOf(counts));
}

/* --shard=K/N: every Nth mutant from the Kth. Each mutant re-runs the whole check suite (~63 s on a runner), so CI
   splits the --mutate over N jobs (smoke.yml in-page-10 / 11 / 12; ci-shape registers each shard, so a dropped
   one goes red there). Null for a malformed shard. */
function shardOf(list) {
  const a = process.argv.find((x) => x.startsWith('--shard='));
  if (!a) return list;
  const m = /^--shard=(\d+)\/(\d+)$/.exec(a);
  const k = m ? +m[1] : 0, n = m ? +m[2] : 0;
  return k >= 1 && k <= n ? list.filter((_, i) => i % n === k - 1) : null;
}

/* A ticker mutant is judged by the pure AW-24 rules, run from a temp copy of src (minus the vendored SDK) with the
   planted files written in: the working tree is never touched, and each copy is a fresh module graph. */
async function tickerMutant(over) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-ticker-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    for (const [f, text] of Object.entries(over)) writeFileSync(join(tmp, f), text);
    return await tickerRules(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/* The edge-body mutant is a pure module: run AW-0 against the planted text. */
async function pureMutant(text) {
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const { edgeBody } = await import(url);
  return edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x') ? ['AW-0 edgeBody let a price field through'] : [];
}

main();
