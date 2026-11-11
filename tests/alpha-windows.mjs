#!/usr/bin/env node
// mutant-rule-functions: checks pure huntsPure itemTruthRules panelLeftovers planRules armourWordRules tickerRules stationSortRules prepBuilderRules
// mutant-runner-functions: main shardOf tickerMutant pureMutant
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
// mutant-anchors: src/shell/press-ack.js src/shell/town-ticker.js src/session/refusal.js src/session/character-session.js src/shell/widgets/amount.js src/shell/windows/inventory/bury.js src/shell/windows/inventory/state.js src/shell/windows/float-menu.js src/shell/bag-model.js src/session/item-sections.js src/shell/windows/inventory/grid.js src/shell/windows/inventory/actions.js src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/session/edge-intents.js src/world/world-boot.js src/world/core/camera.js src/shell/windows/hunts.js src/shell/windows/storage.js src/shell/hunt-list.js src/shell/windows/skills.js src/shell/launcher.js src/shell/upgrade-plan.js src/shell/widgets/upgrade-line.js src/shell/intent-words.js src/shell/town-work.js src/shell/windows/work.js src/shell/hunt-ground-facts.js src/shell/windows/hunt-detail.js src/shell/hunt-go.js src/shell/windows/party-finder.js src/data/refusal-words.js src/styles/windows.css src/session/residue.js src/shell/panel-alpha.js src/styles/shell.css src/shell/shell.js src/shell/alerts.js src/shell/windows/hunt-summary.js src/data/shell-windows.js src/shell/windows/item-tip.js src/data/armour-weights.js src/data/hunt-tutorial.js src/data/how-to-play.js src/shell/carry-in.js src/shell/action-facts.js src/shell/social-watch.js src/shell/windows/inventory/index.js src/shell/windows/inventory/elsewhere.js src/shell/station-sort.js src/shell/prep-draft.js src/shell/windows/hunt-prep/builder.js src/shell/windows/hunt-prep/setups.js src/session/preset-read.js
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
//   AW-5  LOCK PROTECTS FROM BULK SELL: "Sell selected" over stacks that include a
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
//   AW-70 SELL SPARE GEAR sells what the hero has outgrown in ONE sale, its total first; never what it wears or wants, a higher tier, a Rare, the kit, a locked or planned stack
//   AW-64 HUNT PREP AND BEFORE YOU GO PRINT ONE READER of what the hero can use NOW (the hunt bag in
//         a hunt), every tier of food, drink, ammo and runes, ammo in the engine's order (Andy #74)
//   AW-65 A STORAGE PRESS ANSWERS IN VIEW (Andy, analytics 11-02: 14 presses in 25 s): at 1366x768 with both grids long and the bag
//         scrolled into reach, "Putting it away…" and the result or the refusal stand in view and off the stack pressed; no stack moves
//         from under the hand; a hero out hunting is told why at the press, and the line goes once the hero is home
//   AW-66 THE SUMMARY'S ANSWER IS THE PRESS'S (party panel 2026-11-03): at 1366x620, on a card tall enough to scroll, the line lies on no press (it
//         stood on the gold "Next:" plate, whose foot read as a half-filled progress bar), "Setting out." goes once the hunt it set out on is over,
//         and every press is in reach as the window opens (door panel 2026-11-04: a hunt out of stamina opened with none in sight)
//   AW-67 NOTHING LIES ON THE PRESS IN HAND (newcomer panel 2026-11-03, 1366x768, the coach's line up): a stack in hand drops the last press's
//         result; its Fuel all, and Stop while it fuels, take a real press at their middle, over the answer line and inside the column; the
//         player's own scroll is not fought; the Shop's tabs stay whole at the top of a scrolled body; the All characters card's
//         figure says what it is (optimizer panel: "Bag 19,369 gp" beside "Your gold 51.7k")
//   AW-71 THE SAME CARD KEEPS ITS BOX AND ITS WORDS FOLLOW THE SERVER (door panel 2026-11-04): "You have 19 left" stood over a bar reading 6 for a whole hunt
//   AW-72 A RING STANDS CLEAR OF THE ANSWER LINE (door panel 2026-11-04, a phone's Services): the next Bless lay behind "Blessing I is yours."
//   AW-73 ON A PHONE THE CARD'S CROSS IS DRAWN IN ITS BUTTON (door panel 2026-11-04): static, it lay over the words in the middle of every closable card
//   AW-74 A SEED SAYS WHAT PLANTING IT NEEDS (coverage bot 2026-11-07: carrot and wheat seeds bought on tier 1 land, every plant refused
//         plot_tier_locked): on the server's tier 1 land a Farming 10 hero's carrot seed reads "Needs plot tier 2 to plant" before the
//         purchase; the turnip seed (tier 1, Farming 1) names no need
//   AW-75 ALSO FOUND IS THE SERVER'S (audit 11-09 F1): with hr_account_items silent the Inventory search's list reads "Searching…"
//         and lists nothing built from the open envelopes; then exactly the answer's rows; a refused read says so with no rows
//   AW-9  FAIL SAFE: with no bag_rules and no shop section, lock, the loot plans
//         and Dispatch loot stay off and the bag value reads a dash; L and the This hunt tab say "Reading your locks…" and
//         "Reading your loot plans…" (bag_rules is projected, so no "switch on when the server starts keeping them")
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
//   AW-19 FUEL THE HEARTH (Tyler live 10-18, "can't bury bones"; 10-25: Inner Flame replaces
//         Prayer): bones offer Fuel all N; it is ONE set_activity { kind:'artisan', id:'fuel_bones' }
//         and nothing else, the Fueling line reads the server's pointer, Stop is ONE set_activity
//         idle, and the bag and the Inner Flame XP change only from the envelope (and stay after a reload)
//   AW-20 COOK ALL (playtest 10-22: Raw Wolf Meat sold for 1 gp, nothing said it cooks):
//         raw food with a one-input Cooking recipe to food offers Cook all, the same ONE
//         set_activity { kind:'artisan', id:'cook_wolf_meat' }; the Cooking line reads the
//         server's pointer; Stop says what the server made and burnt; the tooltip says it
//         cooks; Sell all junk keeps it; a level under the recipe's says so in words
//   AW-21 EQUIP UPGRADES: ONE equip intent naming every strictly better piece (the weapon only within its family and grip, never the off-hand or ammo; never the weapon's style
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
//   AW-76 A CRAFTING STATION SORTS (Andy, Discord 2026-11-11): a bench skill's Sort menu reads Can make, Level, Name;
//         Can make is the default and the order the list had before (what the bag makes first, highest level first,
//         the next locked ones last); Level is low to high, Name A to Z, both over the same rows (the locked ones
//         too); the pick is ONE residue put naming stationSort, kept per station, and after a reload the menu and
//         the order come back from the server; gathering has no menu. Pure half: every bench skill at several
//         levels, each order worked out here from the raw rows, and the residue round trip through the allowlist
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
//         carrier, the bests (one "No best here yet" line when none, the server's best
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
//         Cellar gets the summary as the one notice (no analyzer, party panel, hunt bar or "has ended" toast); its main press is
//         the tutorial card's next step ("Next: Sell what only pays coin", Hunt again second), which opens the Shop with
//         the card inside it while the hunt bar leaves with the summary; the ring walks the Sell tab -> Sell all loot ->
//         the confirmation's Sell, and the confirmation is in view inside the window (it sat under a long list); no
//         Services icon, and R opens the Shop on its Services tab (stamina and Blessings), closed or open
//   AW-32 DISPATCH LOOT (Tyler 2026-10-25, 2027-01-23-loot-dispatch.sql): mid-hunt the Bag's Dispatch loot is off with
//         "out hunting" in view; in town the item menu offers the loot plan (Keep in bag pressed, Deposit in storage,
//         Sell) and the pickup filter (Don't pick up); Deposit is ONE hr_loot_rule_set {slot, item, rule, key}; the
//         starting kit's Sell is off (Deposit on); Dispatch loot is ONE hr_loot_dispatch {slot, key}, off in flight,
//         its line the server's answer ("Stored 1 stack, sold 2 stacks for 246 gp. 1 stack locked, so kept."), the bag and
//         Storage the re-read envelope's; Storage offers the same button beside the bag at 1440x900 and 844x390
//   AW-33 THE ITEM WELLS (Tyler 10-25, art/review/window-icons-2026-10-25 option C as picked): at 1440x900 the bag's
//         pockets are 44 px wells, 6 a row; Storage's are 44 px, 10 a row; the paper doll's wells are larger than the
//         bag's; the Shop's lines hold the art in a 44 px well; every item icon in Inventory, Storage and the Shop
//         draws its 32 px art at exactly 1x (a whole scale, never 1.25x / 1.5x); counts and shop prices at 16 px. At
//         922x423 (a phone) every well, count and line is what it was (36 px, 14.5 px).
//   AW-34 ARMOR WEIGHTS (Tyler 2026-10-25, src/data/armour-weights.js): the Inventory's "Armor worn" line counts the
//         SERVER's equipment (2 plate, 1 leather, 1 cloth -> "2 heavy (+9.3% max HP) · 1 medium · 1 light (+5.8% max
//         mana)", re-read when an envelope takes a piece off); a worn plate helmet's tooltip names its weight and its
//         share; PURE: every armor row's tooltip line, vitals.js adding that same share, and Tamsin's card (as written
//         and as the coach says it) and the Help note saying all three weights (`armor words:` mutants judge these).
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';
import { harnessFail, ruleOf, judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel, levelBlock } from './_server-level.mjs';

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
const LEVEL_5_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(5);
const CELLAR_ODDS = (await import(pathToFileURL(join(ROOT, 'src/render/format.js')).href)).chance(
  (await import(pathToFileURL(join(ROOT, 'src/shell/hunt-ground-facts.js')).href)).scarceSetOf('mill_cellar', 'medium')[0].chance);
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
const ITEM_RPCS = ['hr_item_lock', 'hr_loot_rule_set', 'hr_hunt_preset_save', 'hr_hunt_preset_apply', 'hr_action_set_options', 'hr_hunt_enter', 'hr_bank_move', 'hr_loot_dispatch', 'hr_hunt_restock'];
/* The windows a player opens from the launcher row, with their keys (src/data/shell-windows.js). */
const WINDOWS = [['h', 'hunts'], ['b', 'inventory'], ['c', 'character'], ['g', 'skills-trade'], ['t', 'storage'], ['v', 'shop'], ['p', 'hunt-prep']];

function scripted() {
  /* Like the real server, the residue a put stores comes back in every later envelope (client_state). */
  const s = { env: clone(FIXTURE), version: 1, calls: [], delayMs: 300, reply: { ok: true }, residue: {} };
  /* Like the real server, its clock moves between answers: the first read is a roster answer aged forward (account-session.js
     agedBy), and a later read stamped at the fixture's fixed `now` looks older, so _noteStorage drops every Storage change after it. */
  const said = s.env.now, born = Date.now();
  /* (A case that sets its own clock, AW-24's, keeps it.) */
  /* The server states the Level itself (hr_state_of's `level` block): the stub states it for the XP a case set (./_server-level.mjs). */
  s.next = () => {
    const e = withServerLevel(clone(s.env));
    return Object.assign(e, { version: ++s.version, client_state: clone(s.residue), now: e.now === said ? new Date(Date.parse(said) + Date.now() - born).toISOString() : e.now });
  };
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
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
            body: JSON.stringify(Object.assign(withServerLevel(clone(s.env)), { version: s.version, ok: false, verb: body.verb, error })) });
        }
        if (s.onEdge) s.onEdge(body);
        return json(Object.assign({ ok: true, accrued: true }, s.next()));
      }
      return json(Object.assign({ accrued: true }, s.next()));
    }
    if (ITEM_RPCS.includes(name)) { await new Promise((ok) => setTimeout(ok, s.delayMs)); return json(s.reply); }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (name === 'hr_account_items') {
      /* AW-75: the server stays silent until the rule lets it answer, or refuses */
      if (s.findGate) await s.findGate;
      if (s.findRefuse) return json({ ok: false, error: s.findRefuse });
      return json({ ok: true, rows: [{ slot: null, name: null, item: 'rat_tail', qty: 4, where: 'bank' }, { slot: 1, name: 'Druid', item: 'rat_tail', qty: 2, where: 'bag' }] });
    }
    return json({ ok: true });
  });
}

/* A (re)load waits for DOMContentLoaded (hunt-screen's LOAD-PROOF): every module script of the boot has run, so the
   app is up and what follows waits for its STATE. Never the `load` event, which also waits for every image and the
   font sheet, none of which a rule reads then (2026-10-22: the first goto timed out at 6 s on a loaded box, the
   server's first answer alone taking 2.7 s). The boot gets BOOT_MS: no rule is about how fast a page boots. */
const BOOTED = 'domcontentloaded';
const BOOT_MS = 60000;

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
/* A PRESS IS CHECKED, NOT CLICKED BLIND (runs 42678595702 and 42735492394: a 6 s click timeout read as HARNESS, never as
   the catch it was). Why the control `sel` would not take a player's press, '' when it would: it is on screen, on, and,
   once scrolled into view the way a player scrolls (nearest), the topmost thing at its middle. The caller fails its own
   rule BY NAME with this reason and stops that arm. */
const pressBlock = (page, sel) => page.evaluate((q) => {
  const b = document.querySelector(q);
  if (!b) return 'it is not on screen';
  if (!b.getClientRects().length) return 'it is hidden';
  if (b.disabled) return 'it is off';
  b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = b.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!top || top === b || b.contains(top)) return '';
  const cls = typeof top.className === 'string' ? top.className.trim() : '';
  return 'it lies under ' + top.tagName.toLowerCase() + (cls ? '.' + cls.split(/\s+/).join('.') : '') + (top.textContent ? ' ("' + top.textContent.trim().slice(0, 40) + '")' : '');
}, sel);
const count = (page, id) => page.evaluate((i) => { const li = document.querySelector('.hw-pocket[data-item="' + i + '"]'); return li ? li.querySelector('.hw-count').textContent : null; }, id);
const sent = (s, name, verb) => s.calls.filter((c) => c.name === name && (!verb || c.body.verb === verb));

async function pure() {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { SKILLS_DEF } = await imp('src/data/skills.js');
  const { SKILL_GUIDE } = await imp('src/data/skill-guide.js');
  for (const id of Object.keys(SKILLS_DEF)) if (!SKILL_GUIDE[id]) fails.push('AW-0 the skill ' + id + ' has no row in src/data/skill-guide.js');
  const { edgeBody, withReceipt } = await imp('src/session/edge-intents.js');
  /* What the shop paid is the server's receipt, never the purse's difference (blind playtest 2026-10-31: "Sell for 10,000", "The shop paid 10,012"). */
  const askIt = (ans) => withReceipt(async (send) => { const a = await send(); return a.ok ? { ok: true } : { ok: false, error: 'no' }; }, async () => ans);
  const sold10k = await askIt({ ok: true, body: { ok: true, receipt: { gold: 10000 } } });
  const replayed = await askIt({ ok: true, body: { ok: true, receipt: null } });
  const refused = await askIt({ ok: false, body: { ok: false, receipt: { gold: 5 } } });
  if (sold10k.paid !== 10000 || 'paid' in replayed || 'paid' in refused) fails.push('AW-0 the receipt reads ' + JSON.stringify([sold10k, replayed, refused]));
  if (edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x')) fails.push('AW-0 edgeBody let a price field through');
  if (edgeBody(0, 'grant_gold', { qty: 1 }, 'x')) fails.push('AW-0 edgeBody built an unknown verb');
  if (!edgeBody(0, 'vendor_sell_many', { lines: [{ item: 'rat_tail', qty: 3 }] }, 'x')) fails.push('AW-0 edgeBody refused a well-formed sale');
  /* AW-19: a gathering or crafting pointer the server holds gets the Stop line (every kind: party-ui PI-TOWN). */
  const { buryLine } = await imp('src/shell/windows/inventory/bury.js');
  if (!/stop it here\.$/.test(buryLine({ read: (k) => (k === 'state' ? { active_kind: 'gather', active_id: 'copper_rock' } : null) })))
    fails.push('AW-19 a gathering pointer gets no Stop line, so it would run unseen');
  if (edgeBody(0, 'set_activity', { activity: { kind: 'combat', id: 'rat' } }, 'x')) fails.push('AW-0 edgeBody let the client declare a fight through set_activity');
  /* BONES FEED THE GREAT HEARTH (ruling 2026-10-14; Brannoc 10-22: the tooltip said "Sell it at the shop" and Sell all
     loot sold them; Tyler 2026-10-25: Inner Flame replaces Prayer): an item a recipe spends without making anything is kept
     out of Sell all loot, and its tooltip says its use; a named fuel is Rare, never bulk-sold loot. */
  const { lootToSell } = await imp('src/shell/bag-model.js');
  const { usesOf } = await imp('src/shell/item-lore.js');
  const sold = lootToSell([{ id: 'bones', qty: 15 }, { id: 'rat_tail', qty: 4 }, { id: 'razor_claw', qty: 1 }, { id: 'lamp_jelly', qty: 3 }, { id: 'den_knot', qty: 1 }]);
  if (sold.join(',') !== 'rat_tail') fails.push('AW-0 Sell all loot would sell ' + sold.join(', ') + ' (bones and every Hearth fuel are kept for the Great Hearth)');
  /* board 2026-10-25 #22: Sell all loot sold Silk Thread, the first Crafting recipes' thread. Tyler 2026-11-08: a bulk sale never
     sweeps a Material, whatever the hero's level: Slime Gel (a Crafting 30 input) stays too, and only the Junk is sold */
  const crafter = lootToSell([{ id: 'silk_thread', qty: 6 }, { id: 'slime_gel', qty: 3 }, { id: 'rat_tail', qty: 2 }]);
  if (crafter.join(',') !== 'rat_tail') fails.push('AW-0 Sell all junk sells ' + crafter.join(', ') + ' (want rat_tail only: Silk Thread and Slime Gel are Materials)');
  /* WHAT THE PRICE LEAVES OUT (blind playtest 2026-10-31: "Sell all loot · 423 gp" over a list worth 1,215; "×2,004 · 1 gp
     each · Sell · 1,000 gp"): the loot the button keeps is named with its worth, and a stack past one sale's limit is marked. */
  {
    const { lootKept, lootSale, sellQty } = await imp('src/shell/bag-model.js');
    const bag = [{ id: 'bones', qty: 10 }, { id: 'rat_tail', qty: 2004 }, { id: 'den_knot', qty: 1 }, { id: 'lamp_jelly', qty: 1 }];
    const shop = { bids: new Map([['bones', 1], ['rat_tail', 1], ['lamp_jelly', 9]]) };
    const kept = lootKept(bag, { locked: new Set() }, shop, null);
    if (kept.ids.join() !== 'bones,lamp_jelly' || kept.worth !== 19) fails.push('AW-0 Sell all loot says it keeps ' + JSON.stringify(kept));
    const sale = lootSale(bag, { locked: new Set() }, shop, null);
    if (sale.total !== 1000 || sale.capped !== true || sellQty(2004) !== 1000) fails.push('AW-0 the sale of ×2,004 at 1 gp reads ' + JSON.stringify(sale));
    if (lootKept(bag, { locked: new Set(['bones']) }, shop, null).worth !== 9) fails.push('AW-0 a locked stack is counted among what Sell all loot keeps');
  }
  const bones = usesOf('bones');
  if (!bones.some((l) => /^Burn it in the Great Hearth to train Inner Flame/.test(l)) || bones.some((l) => /sell/i.test(l))) fails.push('AW-0 the bones tooltip reads ' + JSON.stringify(bones));
  const knot = usesOf('den_knot');
  if (!knot.some((l) => /^Burn it in the Great Hearth for a burst of Inner Flame XP, and the fire burns deep amber for all Havora/.test(l))) fails.push('AW-0 the Den Knot tooltip reads ' + JSON.stringify(knot));
  /* AW-20: what cooks is read off the recipe rows (no id list); the bench refuses in words, from the server's level. */
  const { cookOf } = await imp('src/shell/bag-model.js');
  const { buryRecipeOf, buryBlock, buryLabel } = await imp('src/shell/windows/inventory/bury.js');
  const cooks = ['raw_wolf_meat', 'shrimp', 'turnip', 'wheat', 'cooked_wolf_meat', 'bones'].map((id) => (cookOf(id) ? cookOf(id).recipe.id : null));
  if (cooks.join() !== 'cook_wolf_meat,cook_shrimp,cook_turnip,cook_wheat_bread,,') fails.push('AW-20 cookOf reads ' + cooks.join());
  if (lootToSell([{ id: 'raw_wolf_meat', qty: 4 }, { id: 'rat_tail', qty: 1 }]).join() !== 'rat_tail') fails.push('AW-20 Sell all loot would sell the raw meat');
  const meat = usesOf('raw_wolf_meat');
  /* Cook Wolf Meat opens at Cooking 1 (designer 2026-11-11, lane/d-small-calls), so the level refusal is probed on Raw Panther Meat (Cooking 25). */
  if (!meat.includes('Cook it into food (Cooking 1)')) fails.push('AW-20 the raw meat tooltip reads ' + JSON.stringify(meat));
  const cs = (lv, inv, st) => ({ read: (k) => (k === 'skills' ? { cooking: { xp: 0, level: lv } } : k === 'inventory' ? inv : k === 'state' ? st || { active_kind: 'idle', active_id: null } : null) });
  const wolf = buryRecipeOf('raw_wolf_meat'), panther = buryRecipeOf('raw_panther_meat');
  const words = [buryBlock(cs(1, { raw_panther_meat: 3 }), panther), buryBlock(cs(1, { raw_wolf_meat: 3 }), wolf), buryBlock(cs(30, { wheat: 2 }), buryRecipeOf('wheat')),
    buryBlock(cs(5, { raw_wolf_meat: 3 }, { active_kind: 'artisan', active_id: 'cook_shrimp' }), wolf), buryLabel(wolf, 3)];
  if (words.join('|') !== 'You need Cooking 25 to cook Raw Panther Meat. You have 1.||You need 3 Wheat for one. You have 2.|Already cooking. Stop it first.|Cook all') fails.push('AW-20 the bench says ' + JSON.stringify(words));
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
  if (smith.slice(-2).join() !== 'forge_bronze_axe,forge_bronze_pickaxe' || !smith.includes('smelt_bronze') || !smith.includes('reforge_klappas_club') || smith.length !== 6) fails.push('AW-22 Smithing 1 shows ' + smith.join());
  const wcs = (lv, inv) => ({ read: (k) => (k === 'skills' ? { smithing: { xp: 0, level: lv } } : k === 'inventory' ? inv : null) });
  const bronze = workRow('artisan', 'smelt_bronze');
  const said = [workBlock(wcs(1, { copper_ore: 1 }), bronze, false), workBlock(wcs(1, { copper_ore: 2 }), bronze, true),
    workBlock(wcs(1, {}), workRow('artisan', 'forge_bronze_axe'), false), workBlock(wcs(1, { copper_ore: 2 }), bronze, false), String(runsOf(bronze.row, { copper_ore: 11 })),
    workBlock(wcs(1, {}), bronze, false)];
  if (said.join('|') !== 'Needs 2 Copper Ore (you have 1). Gathered with Mining.|Not while a hunt is running.|You need Smithing 3 to make Bronze Axe. You have 1.||5|No Copper Ore in your bag. Gathered with Mining.') fails.push('AW-22 the work rows say ' + JSON.stringify(said));
  return fails.concat(await huntsPure(imp), await tickerRules(ROOT), await armourWordRules(ROOT), await planRules(ROOT), await itemTruthRules(ROOT), await stationSortRules(ROOT), await prepBuilderRules(ROOT));
}

/* AW-76 PURE: A CRAFTING STATION'S SORT, over the src at `base` (the 'station sort:' mutants judge a planted copy).
   Every expected order is worked out here from the raw rows (BENCH_INDEX, catalogue order), never through
   src/shell/station-sort.js; the labels are typed, not read through t(). */
async function stationSortRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const { rowsFor } = await imp('src/shell/windows/work.js');
  const { BENCH_INDEX, runsOf } = await imp('src/shell/town-work.js');
  const { recipeInputs } = await imp('src/core/artisan.js');
  const { SKILLS_DEF } = await imp('src/data/skills.js');
  const S = await imp('src/shell/station-sort.js');
  const R = await imp('src/session/residue.js');
  const req = (id) => BENCH_INDEX[id].recipe.req || 1;
  const nameOf = (id) => String(BENCH_INDEX[id].recipe.name);
  /* a stable sort over ids, so ties keep the catalogue's order */
  const sorted = (ids, cmp) => ids.map((id, i) => [id, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map(([id]) => id);
  let differ = 0, locked = 0, cases = 0;
  for (const skill of Object.keys(SKILLS_DEF).filter((s) => SKILLS_DEF[s].cat === 'artisan')) {
    const cat = Object.keys(BENCH_INDEX).filter((id) => BENCH_INDEX[id].skill === skill);
    if (!cat.length) continue;
    /* a bag that covers every second recipe, so "can make" splits the list */
    const inv = {};
    cat.forEach((id, i) => { if (i % 2 === 0) for (const [it, n] of Object.entries(recipeInputs(BENCH_INDEX[id].recipe))) inv[it] = Math.max(inv[it] || 0, n * 3); });
    const levels = [...new Set([1, ...cat.map(req)])].sort((a, b) => a - b);
    for (const lv of levels) {
      cases++;
      const open = cat.filter((id) => req(id) <= lv);
      const ahead = sorted(cat.filter((id) => req(id) > lv), (a, b) => req(a) - req(b)).slice(0, 2);
      const can = (id) => runsOf(BENCH_INDEX[id].recipe, inv) > 0;
      const want = {
        can: [...sorted(open.filter(can), (a, b) => req(b) - req(a)), ...sorted(open.filter((id) => !can(id)), (a, b) => req(b) - req(a)), ...ahead],
        level: sorted([...open, ...ahead], (a, b) => req(a) - req(b)),
        name: sorted([...open, ...ahead], (a, b) => nameOf(a).localeCompare(nameOf(b), 'en')),
      };
      const got = (sort) => rowsFor(skill, lv, inv, sort).map((w) => w.id).join();
      const at = skill + ' ' + lv + ': ';
      if (got(undefined) !== want.can.join()) fails.push('AW-76 the default order moved at ' + at + got(undefined) + ' (was ' + want.can.join() + ')');
      if (got('can') !== want.can.join() || got('nonsense') !== want.can.join()) fails.push('AW-76 Can make (or an unknown sort) is not the old order at ' + at + got('can') + ' / ' + got('nonsense'));
      if (got('level') !== want.level.join()) fails.push('AW-76 Level is not low to high at ' + at + got('level') + ' (want ' + want.level.join() + ')');
      if (got('name') !== want.name.join()) fails.push('AW-76 Name is not A to Z at ' + at + got('name') + ' (want ' + want.name.join() + ')');
      if (want.level.join() !== want.can.join() && want.name.join() !== want.can.join() && want.name.join() !== want.level.join()) differ++;
      if (ahead.length) locked++;
    }
  }
  /* not vacuous: the three orders differ somewhere, and locked rows were in the lists sorted */
  if (!cases || !differ || !locked) fails.push('AW-76 the cases prove nothing: ' + cases + ' cases, ' + differ + ' where the three orders differ, ' + locked + ' with locked rows');
  /* the menu: three orders under a Sort label, Can make first (the default) */
  const menu = S.sortMenuHtml();
  const opts = [...menu.matchAll(/<option value="([a-z]+)">([^<]+)<\/option>/g)].map((m) => m[1] + '=' + m[2]).join();
  if (opts !== 'can=Can make,level=Level,name=Name' || !/<span>Sort<\/span>/.test(menu) || S.DEFAULT_SORT !== 'can') fails.push('AW-76 the menu reads ' + opts + ' (default ' + S.DEFAULT_SORT + ')');
  /* the pick survives a reload: the field the window puts comes back through the envelope's allowlist, per station */
  if (!R.RESIDUE_FIELDS.includes('stationSort')) fails.push('AW-76 stationSort is not on the residue allowlist');
  const reload = (field) => R.residueOf({ stationSort: field, gold: 9 });
  let res = reload(S.withStationSort({}, 'smithing', 'name'));
  if (S.stationSortOf(res, 'smithing') !== 'name' || S.stationSortOf(res, 'cooking') !== 'can' || 'gold' in res) fails.push('AW-76 after a reload Smithing reads ' + S.stationSortOf(res, 'smithing') + ' and Cooking ' + S.stationSortOf(res, 'cooking'));
  res = reload(S.withStationSort(res, 'cooking', 'level'));
  if (S.stationSortOf(res, 'smithing') !== 'name' || S.stationSortOf(res, 'cooking') !== 'level') fails.push('AW-76 a pick at one station lost another\'s: ' + JSON.stringify(res.stationSort));
  res = reload(S.withStationSort(res, 'smithing', 'can'));
  if (JSON.stringify(res.stationSort) !== '{"cooking":"level"}') fails.push('AW-76 Can make is not kept as no entry: ' + JSON.stringify(res.stationSort));
  const forged = R.sanitizeResidueField('stationSort', { smithing: 'name', not_a_skill: 'name', cooking: 5, 'BAD KEY': 'level', crafting: 'x'.repeat(99) });
  if (JSON.stringify(forged) !== '{"smithing":"name"}') fails.push('AW-76 a forged stationSort keeps ' + JSON.stringify(forged));
  if (S.stationSortOf({ stationSort: { smithing: 'bogus' } }, 'smithing') !== 'can' || S.stationSortOf(null, 'smithing') !== 'can' || S.withStationSort({}, 'smithing', 'bogus') !== null) fails.push('AW-76 an unknown or missing pick is not Can make');
  return fails;
}

/* AW-77 .. AW-84 PURE: THE HUNT PREP BUILDER (lane/b-hunt-prep-builder, Tyler 2026-11-11), over the src at `base` (the
   'prep builder:' mutants judge a planted copy). A fake CharacterSession records every intent; no DOM: the rules drive the
   builder's exported pieces (prep-draft.js, builder.js saveDraft / actBuilder / fightsLine, setups.js actSetups,
   preset-read.js) with the fixture's own hunt_settings, and every expected value is worked out here from the raw rows.
     AW-77  THE COPY IS THE SERVER'S ROW AND SAVE IS ONE INTENT WITH EVERY KEY: the draft reads the fixture's bar, stance, target,
            distance, chase and gold floor; Save sends ONE hr_action_set_options(preset, { slots, stance, target_mode, distance,
            chase, gold_floor }); an option the server never sent is left out, never sent as null
     AW-78  A DROP MOVES OR SWAPS: onto an empty slot the action moves, onto a filled one the two swap, nothing else moves
     AW-79  SAVE AND USE: the save, then ONE hr_hunt_preset_apply of that setup; a refused save puts nothing on; a stale copy sends nothing
     AW-80  USE EQUIPPED ASKS ONCE: the first press sends nothing, the second ONE hr_hunt_preset_save over the picked setup
     AW-81  NEW SAVES ON THE FIRST FREE NUMBER, named from the field (else Setup N)
     AW-82  FIGHTS AS: a press on a dim role says how to get it ("Wear a bow or a crossbow to fight as a Ranger."); the worn role's
            line names the weapon and the shield; no hint shows for the role already worn
     AW-83  SORT AND CLEAR edit the copy: Sort lays the lanes out, Clear empties all twenty; neither sends
     AW-84  THE READ: the setup in use is the envelope's projection (no RPC); another is ONE hr_hunt_preset_read(p_slot, p_preset),
            parsed as hunt_settings is, with the store rows filled in from the envelope when the answer has none; a refusal reads as one */
async function prepBuilderRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const D = await imp('src/shell/prep-draft.js');
  const B = await imp('src/shell/windows/hunt-prep/builder.js');
  const S = await imp('src/shell/windows/hunt-prep/setups.js');
  const R = await imp('src/session/preset-read.js');
  const H = await imp('src/session/hunt-sections.js');
  const { TEXT } = await imp('src/data/text/text-table.js');
  const fx = clone(FIXTURE);
  /* two saved setups, 0 (in use) and 2, so the first free number is 1 */
  fx.hunt_presets = [Object.assign(clone(fx.hunt_presets[0]), { preset: 0, name: 'Cellar rats', gear: { weapon: 'iron_sword', shield: 'wooden_shield' } }),
    Object.assign(clone(fx.hunt_presets[0]), { preset: 2, name: 'Boss nights', gear: { weapon: 'shortbow' } })];
  fx.hunt_settings = Object.assign({}, fx.hunt_settings, { preset: 0, gold_floor: 250 });
  fx.state = Object.assign({}, fx.state, { active_kind: 'idle', active_id: null });
  const calls = [];
  const fakeCs = (env, answer = () => ({ ok: true })) => ({
    slot: 0, status: 'open', read: (k) => (Object.prototype.hasOwnProperty.call(env, k) ? env[k] : null),
    savePreset: async (p, n) => { calls.push(['hr_hunt_preset_save', p, n]); return answer('hr_hunt_preset_save'); },
    applyPreset: async (p) => { calls.push(['hr_hunt_preset_apply', p]); return answer('hr_hunt_preset_apply'); },
    setHuntOptions: async (p, o) => { calls.push(['hr_action_set_options', p, o]); return answer('hr_action_set_options'); },
    edgeIntent: async () => ({ ok: true }),
  });
  const scratch = () => ({ pending: false, msg: '', naming: null, arming: null, armingEquipped: false, adding: false, readyOpen: false, picked: 0, draft: null, draftFor: null, base: '', read: null, stale: false, sorted: false, cleared: false, roleHint: null, drag: null });
  const el = (attrs, extra) => Object.assign({ getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null), closest: () => null, blur() {} }, extra || {});
  const click = { type: 'click' };
  const noop = () => {};
  const settle = () => new Promise((ok) => setTimeout(ok, 20));
  const sent = (name) => calls.filter((c) => c[0] === name);

  // AW-77: the copy from the server's row, and the one intent with every key
  const set = H.settingsView(fx.hunt_settings);
  const draft = D.draftFrom(set);
  const wantSlots = Array.from({ length: 20 }, (_, i) => H.wireSlot(set.slots[i]));
  if (!draft || JSON.stringify(draft.slots) !== JSON.stringify(wantSlots) || draft.stance !== 'balanced' || draft.targetMode !== 'nearest' || draft.distance !== 1 || draft.chase !== true || draft.goldFloor !== 250)
    fails.push('AW-77 the copy reads ' + JSON.stringify(draft).slice(0, 200));
  const opts = D.optionsOf(draft);
  if (Object.keys(opts).sort().join() !== 'chase,distance,gold_floor,slots,stance,target_mode' || opts.stance !== 'balanced' || opts.target_mode !== 'nearest' || opts.distance !== 1 || opts.chase !== true || opts.gold_floor !== 250 || JSON.stringify(opts.slots) !== JSON.stringify(wantSlots))
    fails.push('AW-77 Save would send ' + Object.keys(opts).sort().join() + ' = ' + JSON.stringify(opts).slice(0, 160));
  const unset = D.optionsOf(D.draftFrom(H.settingsView(Object.assign({}, fx.hunt_settings, { gold_floor: null, chase: undefined }))));
  if ('gold_floor' in unset || 'chase' in unset || !('stance' in unset)) fails.push('AW-77 an option the server never sent is sent back: ' + Object.keys(unset).sort().join());
  {
    const cs = fakeCs(fx), sc = scratch();
    sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0;
    sc.draft.stance = 'offensive';
    B.saveDraft({ character: cs, account: {} }, sc, noop, false);
    await settle();
    const o = sent('hr_action_set_options');
    if (o.length !== 1 || o[0][1] !== 0 || o[0][2].stance !== 'offensive' || Object.keys(o[0][2]).sort().join() !== 'chase,distance,gold_floor,slots,stance,target_mode') fails.push('AW-77 Save sent ' + JSON.stringify(o.map((c) => [c[1], Object.keys(c[2]).sort().join()])));
    if (sent('hr_hunt_preset_apply').length) fails.push('AW-77 Save put the setup on');
    if (sc.draft !== null) fails.push('AW-77 the copy was kept after the save (the next patch must show the server\'s row)');
  }
  // AW-78: a drop moves or swaps
  {
    const bar = wantSlots.slice();
    const a = bar[0], b = bar[1];
    const moved = D.dropPlan(bar, 0, 7);
    if (!moved || moved[7] !== a || moved[0] !== null || moved[1] !== b || moved.length !== 20) fails.push('AW-78 a drop on an empty slot did not move: ' + JSON.stringify((moved || []).map((s) => (s ? s.action.id : '-'))));
    const swapped = D.dropPlan(bar, 0, 1);
    if (!swapped || swapped[0] !== b || swapped[1] !== a || swapped.slice(2).some((s, i) => s !== bar[i + 2])) fails.push('AW-78 a drop on a filled slot did not swap the two: ' + JSON.stringify((swapped || []).map((s) => (s ? s.action.id : '-'))));
    if (D.dropPlan(bar, 0, 0) !== null || D.dropPlan(bar, 7, 0) !== null) fails.push('AW-78 a drop on itself, or of an empty slot, changes the bar');
    if (JSON.stringify(bar) !== JSON.stringify(wantSlots)) fails.push('AW-78 a plan changed the bar it was planned over');
  }
  // AW-79: Save and use, a refused save, a stale copy
  {
    calls.length = 0;
    const cs = fakeCs(fx), sc = scratch();
    sc.picked = 2; sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 2;
    sc.draft.chase = false;
    B.saveDraft({ character: cs, account: {} }, sc, noop, true);
    await settle();
    if (calls.map((c) => c[0] + ':' + c[1]).join() !== 'hr_action_set_options:2,hr_hunt_preset_apply:2') fails.push('AW-79 Save and use sent ' + JSON.stringify(calls.map((c) => c[0] + ':' + c[1])));
    calls.length = 0;
    const cs2 = fakeCs(fx, (name) => (name === 'hr_action_set_options' ? { ok: false, error: 'bad_slot', slot: 3 } : { ok: true })), sc2 = scratch();
    sc2.picked = 2; sc2.draft = D.draftFrom(set); sc2.base = D.draftKey(sc2.draft); sc2.draftFor = 2; sc2.draft.chase = false;
    B.saveDraft({ character: cs2, account: {} }, sc2, noop, true);
    await settle();
    if (calls.map((c) => c[0]).join() !== 'hr_action_set_options' || sc2.draft === null) fails.push('AW-79 a refused save sent ' + calls.map((c) => c[0]).join() + (sc2.draft === null ? ' and dropped the copy' : ''));
    calls.length = 0;
    const sc3 = scratch();
    sc3.draft = D.draftFrom(set); sc3.base = D.draftKey(sc3.draft); sc3.draftFor = 0; sc3.draft.chase = false; sc3.stale = true;
    B.saveDraft({ character: fakeCs(fx), account: {} }, sc3, noop, false);
    await settle();
    if (calls.length) fails.push('AW-79 a stale copy (the bar changed under it) was sent: ' + calls.map((c) => c[0]).join());
  }
  // AW-80: Use equipped asks once; AW-81: New on the first free number
  {
    calls.length = 0;
    const cs = fakeCs(fx), ctx = { character: cs, account: {} }, sc = scratch();
    sc.picked = 2;
    const body = { querySelector: () => null };
    S.actSetups(ctx, body, sc, noop, 'use-equipped', click, el({}));
    await settle();
    if (calls.length || !sc.armingEquipped) fails.push('AW-80 the first Use equipped press sent ' + calls.map((c) => c[0]).join() + (sc.armingEquipped ? '' : ' and did not ask'));
    S.actSetups(ctx, body, sc, noop, 'use-equipped', click, el({}));
    await settle();
    const over = sent('hr_hunt_preset_save');
    if (over.length !== 1 || over[0][1] !== 2 || over[0][2] !== 'Boss nights' || calls.length !== 1) fails.push('AW-80 the second Use equipped press sent ' + JSON.stringify(calls));
    calls.length = 0;
    const input = { value: '  Thicket solo ', disabled: false, focus() { input.focused = true; } };
    const body2 = { querySelector: (q) => (q === '.hw-preset-name' ? input : null) };
    const sc2 = scratch();
    S.actSetups(ctx, body2, sc2, noop, 'new', click, el({}));
    if (!sc2.adding || !input.focused || calls.length) fails.push('AW-81 New did not open the name field (or sent something)');
    S.actSetups(ctx, body2, sc2, noop, 'save-new', click, el({}));
    await settle();
    const fresh = sent('hr_hunt_preset_save');
    if (fresh.length !== 1 || fresh[0][1] !== 1 || fresh[0][2] !== 'Thicket solo') fails.push('AW-81 New saved ' + JSON.stringify(fresh) + ' (want number 1, the first free, named Thicket solo)');
    if (sc2.picked !== 1 || sc2.adding) fails.push('AW-81 the new setup is not the one picked, or the field stayed open');
    calls.length = 0;
    input.value = '';
    S.actSetups(ctx, body2, scratch(), noop, 'save-new', click, el({}));
    await settle();
    if (sent('hr_hunt_preset_save').map((c) => c[2]).join() !== 'Setup 2') fails.push('AW-81 an empty name saved as ' + JSON.stringify(sent('hr_hunt_preset_save')));
    if (S.firstFree([{ preset: 0 }, { preset: 1 }, { preset: 2 }, { preset: 3 }, { preset: 4 }]) !== 5) fails.push('AW-81 with every number taken the first free is not the limit');
  }
  // AW-82: Fights as
  {
    const ranger = B.fightsLine('ranger', 'tank', { weapon: 'iron_sword', shield: 'wooden_shield' });
    if (ranger !== 'Wear a bow or a crossbow to fight as a Ranger.') fails.push('AW-82 the Ranger hint reads ' + JSON.stringify(ranger));
    const worn = B.fightsLine('tank', 'tank', { weapon: 'iron_sword', shield: 'wooden_shield' });
    if (!/Iron Sword/.test(worn) || !/Wooden shield/i.test(worn) || /Wear a/.test(worn)) fails.push('AW-82 the worn role\'s line reads ' + JSON.stringify(worn));
    if (!/bare hands/.test(B.fightsLine(null, 'melee_dps', {}))) fails.push('AW-82 no weapon does not read as bare hands');
    for (const r of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) if (typeof TEXT.prep['fights_' + r] !== 'string') fails.push('AW-82 no hint row for ' + r);
  }
  // AW-83: Sort and Clear edit the copy and send nothing
  {
    calls.length = 0;
    const cs = fakeCs(fx), ctx = { character: cs, account: {} }, sc = scratch();
    sc.draft = D.draftFrom(set); sc.base = D.draftKey(sc.draft); sc.draftFor = 0;
    /* the fixture's bar: power_strike, flame_strike (moves), wheat_bread, goldenroot_tea (food and drink); put the bread first by hand */
    sc.draft.slots = D.dropPlan(sc.draft.slots, 2, 7) || sc.draft.slots;
    sc.draft.slots = D.dropPlan(sc.draft.slots, 7, 0) || sc.draft.slots;   /* (a drop that cannot apply is AW-78's to judge) */
    /* now bread (slot 1), flame_strike (2), tea (4), power_strike (8): every one ruled, so Sort keeps each lane's order: the moves, then the food and drink */
    const pre = sc.draft.slots.slice();
    B.actBuilder(ctx, {}, sc, noop, 'sort', click, el({}));
    const ids = sc.draft.slots.map((s) => (s ? s.action.id : '-')).join(' ');
    const { sortBar } = await imp('src/shell/bar-sort.js');
    if (!/^flame_strike power_strike wheat_bread goldenroot_tea( -){16}$/.test(ids) || !sc.sorted) fails.push('AW-83 Sort reads ' + ids + (sc.sorted ? '' : ' and the line is not shown'));
    if (JSON.stringify(sc.draft.slots) !== JSON.stringify(sortBar(pre))) fails.push('AW-83 Sort is not bar-sort.js over the copy');
    B.actBuilder(ctx, {}, sc, noop, 'clear', click, el({}));
    if (sc.draft.slots.length !== 20 || sc.draft.slots.some(Boolean) || !sc.cleared) fails.push('AW-83 Clear left ' + sc.draft.slots.filter(Boolean).length + ' slots');
    B.actBuilder(ctx, {}, sc, noop, 'd-stance', click, el({ 'data-val': 'defensive' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-chase', click, el({}));
    B.actBuilder(ctx, {}, sc, noop, 'd-dist', click, el({ 'data-val': '1' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-target', { type: 'change' }, el({}, { value: 'strongest' }));
    B.actBuilder(ctx, {}, sc, noop, 'd-gold', { type: 'change' }, el({}, { value: '500' }));
    const d = sc.draft;
    if (d.stance !== 'defensive' || d.chase !== false || d.distance !== 2 || d.targetMode !== 'strongest' || d.goldFloor !== 500) fails.push('AW-83 the controls wrote ' + JSON.stringify([d.stance, d.chase, d.distance, d.targetMode, d.goldFloor]));
    if (calls.length) fails.push('AW-83 editing the copy sent ' + calls.map((c) => c[0]).join());
    if (!B.draftDirty(sc)) fails.push('AW-83 an edited copy does not read as not saved');
  }
  // AW-84: the read
  {
    const rpcs = [];
    const server = { rpc: async (name, args) => { rpcs.push([name, args]); return { ok: true, status: 200, body: Object.assign({ ok: true }, clone(fx.hunt_settings), { preset: args.p_preset, stance: 'offensive', store: [] }) }; } };
    const account = { server };
    const cs = fakeCs(fx);
    const live = await R.readPreset(account, cs, 0);
    if (!live.ok || !live.live || rpcs.length || live.set.preset !== 0 || live.set.stance !== 'balanced') fails.push('AW-84 the setup in use was read from the server, or not from the envelope: ' + JSON.stringify([live.ok, live.live, rpcs.length]));
    const other = await R.readPreset(account, cs, 2);
    if (rpcs.length !== 1 || rpcs[0][0] !== 'hr_hunt_preset_read' || JSON.stringify(rpcs[0][1]) !== '{"p_slot":0,"p_preset":2}') fails.push('AW-84 another setup asked ' + JSON.stringify(rpcs));
    if (!other.ok || other.live || other.set.preset !== 2 || other.set.stance !== 'offensive' || other.set.slots.length !== 20 || !other.set.store.length) fails.push('AW-84 the read parsed as ' + JSON.stringify(other).slice(0, 200));
    const refused = await R.readPreset({ server: { rpc: async () => ({ ok: false, status: 404, error: 'http_404', body: null }) } }, cs, 2);
    if (refused.ok || !refused.error) fails.push('AW-84 a refused read reads ' + JSON.stringify(refused));
    const limited = await R.readPreset({ server: { rpc: async () => ({ ok: true, status: 200, body: { ok: false, error: 'rate_limited' } }) } }, cs, 2);
    if (limited.ok || limited.error !== 'rate_limited') fails.push('AW-84 the refusal code the server sent is lost: ' + JSON.stringify(limited));
    const bad = await R.readPreset(account, cs, 9);
    if (bad.ok || rpcs.length !== 1) fails.push('AW-84 a preset past the limit was asked');
  }
  return fails;
}

/* AW-25 .. AW-28 PURE: the Hunts page's facts from the data rows and its lines from the server's sections. */
async function huntsPure(imp) {
  const fails = [];
  const { residentsOf, scarceSetOf, raresOf, wornWeightOf, bigPullOf } = await imp('src/shell/hunt-ground-facts.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const { huntRows, fitWords, bestLine, bestWords, tierPull, tierWords, tierChoiceWords } = await imp('src/shell/hunt-list.js');
  const { setupsOf, beforeLines, freeHeroes } = await imp('src/shell/hunt-go.js');
  const STORE = FIXTURE.hunt_settings.store;
  /* THE PULL EACH TIER BRINGS: Normal is the pack as built for EVERY group size (0; Tyler 2026-11-11 ONE PACK ON NORMAL, partyPull is gone), a harder tier its own row's number for the group's size, and a row of 0 the pack as built too. */
  const rowOf = (hunt) => huntRows().find((x) => x.hunt === hunt);
  const glade = rowOf('mosslight_glade'), thicketR = rowOf('meadowbrook_thicket');
  /* FIXED ROWS, NOT TODAY'S BALANCE (lane/b-tier-dials): the page's words and pulls are read off rows set here on the very rows the page reads
     (hunt-tiers.js, the build's ?v= instance), put back after, so the designer moving a number never turns a words check red. */
  const TV = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + '?v=' + (await imp('src/build-info.js')).BUILD.version);
  const kept = { glade: TV.GROUND_TIERS.mosslight_glade, thicket: TV.GROUND_TIERS.meadowbrook_thicket };
  const tierRow = (id, pull, dmgPm, hpPm, xpPm) => ({ id, pull, dmgPm, hpPm, xpPm });
  try {
    TV.GROUND_TIERS.mosslight_glade = { dangerous: tierRow('dangerous', [4, 5, 5, 6], 1200, 1000, 1100), deadly: tierRow('deadly', [8, 8, 8, 8], 1500, 1000, 1200) };
    TV.GROUND_TIERS.meadowbrook_thicket = { dangerous: tierRow('dangerous', [0, 0, 0, 0], 1500, 1000, 1050), deadly: tierRow('deadly', [0, 0, 0, 0], 3000, 1000, 1080) };
    if (tierPull(glade, 'normal', 1) !== 0) fails.push('AW-25 a lone hero moved off the room as built: ' + tierPull(glade, 'normal', 1));
    if (tierPull(glade, 'normal', 2) !== 0 || tierPull(glade, 'normal', 4) !== 0) fails.push('AW-25 a party on Normal does not read the pack as built (Tyler 2026-11-11): ' + tierPull(glade, 'normal', 2) + ' / ' + tierPull(glade, 'normal', 4));
    if (tierPull(glade, 'dangerous', 1) !== 4 || tierPull(glade, 'dangerous', 4) !== 6 || tierPull(glade, 'deadly', 1) !== 8 || tierPull(glade, 'deadly', 4) !== 8) fails.push('AW-25 a harder tier does not read its row');
    if (tierPull(thicketR, 'deadly', 1) !== 0 || tierPull(thicketR, 'deadly', 4) !== 0) fails.push('AW-25 a row with no more monsters does not read the ground as it stands: ' + tierPull(thicketR, 'deadly', 1) + ' / ' + tierPull(thicketR, 'deadly', 4));
    if (tierWords(glade, 'normal', 1) !== '' || tierChoiceWords(glade, 'normal', 1) !== '') fails.push('AW-25 Normal says more than the ground\'s page: ' + tierWords(glade, 'normal', 1));
    /* THE PLAIN LINE (Tyler 2026-11-08: the old numbers note was 'way too exact'; hunt-tiers.js TIER_LINES): a tier that brings more monsters at once than
       this group's Normal reads its 'more' line, one that brings no more its 'same' line, each with the one death line and never a number. */
    const W = (t, k) => TV.TIER_LINES[t][k] + ' ' + TV.TIER_DEATH_LINE;
    if (tierChoiceWords(glade, 'deadly', 1) !== 'Deadly: big groups that hit hard.') fails.push('AW-25 the line beside Enter reads: ' + tierChoiceWords(glade, 'deadly', 1));
    if (tierWords(glade, 'deadly', 1) !== W('deadly', 'more')) fails.push('AW-25 the Deadly note reads: ' + tierWords(glade, 'deadly', 1));
    if (tierChoiceWords(glade, 'dangerous', 4) !== 'Dangerous: more monsters at once, and they hit harder.') fails.push('AW-25 a four on a bigger pull reads: ' + tierChoiceWords(glade, 'dangerous', 4));
    if (tierChoiceWords(thicketR, 'deadly', 1) !== 'Deadly: the monsters hit much harder.' || tierWords(thicketR, 'dangerous', 4) !== W('dangerous', 'same')) fails.push('AW-25 a row with no more monsters reads: ' + tierChoiceWords(thicketR, 'deadly', 1) + ' / ' + tierWords(thicketR, 'dangerous', 4));
    /* a pull no bigger than this group's Normal (the pack as built, 0 for a pair too since Tyler 2026-11-11) is no more monsters */
    TV.GROUND_TIERS.mosslight_glade.dangerous = tierRow('dangerous', [4, 0, 3, 4], 1200, 1000, 1100);
    if (tierWords(glade, 'dangerous', 2) !== W('dangerous', 'same') || tierWords(glade, 'dangerous', 1) !== W('dangerous', 'more')) fails.push('AW-25 the pull read against Normal: ' + tierWords(glade, 'dangerous', 2));
    /* every dial at a sheet's odd multiple still reads no number, on every tier and group size */
    TV.GROUND_TIERS.mosslight_glade.deadly = tierRow('deadly', [8, 8, 8, 8], 2261, 2847, 1400);
    for (const r of [glade, thicketR]) for (const t of ['dangerous', 'deadly']) for (const n of [1, 2, 3, 4]) if (/\d/.test(tierWords(r, t, n) + tierChoiceWords(r, t, n))) fails.push('AW-25 a tier note carries a number: ' + tierWords(r, t, n));
  } finally { TV.GROUND_TIERS.mosslight_glade = kept.glade; TV.GROUND_TIERS.meadowbrook_thicket = kept.thicket; }
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
    for (const m of [...residentsOf(r.hunt), ...bigPullOf(r.hunt)]) for (const d of MONSTERS[m.id].drops || []) if (d.band === 'rare' || d.band === 'trophy') want.add(d.id + '@' + m.id);
    const ids = got.map((x) => x.id + '@' + x.carrier.id);
    if (ids.length !== want.size || ids.some((k) => !want.has(k))) fails.push('AW-25 ' + r.hunt + ' rares read ' + ids.join('+') + ', the rows say ' + [...want].join('+'));
    if (got.some((x, i) => x.trophy && got.slice(i + 1).some((y) => !y.trophy))) fails.push('AW-25 ' + r.hunt + ' lists a Trophy before a Rare');
  }
  const sets = (h, w) => scarceSetOf(h, w).map((e) => e.lines.join(',') + ':' + e.slots.join(',') + ':' + e.weapons.join(',')).join('|');
  if (sets('millrace_sewer', 'medium') !== 'Leather,Bronze,Apprentice:bodies,legs:|Studded,Iron,Adept:helmets,boots:Iron Sword') fails.push('AW-25 the Sewer\'s gear reads ' + sets('millrace_sewer', 'medium'));
  /* the page's words are one list (v0.2.100 played on Wickstead: "Iron, Studded, Adept: bodies, legs; Bramble Blade") */
  const wick = scarceSetOf('wickstead', 'medium').map((e) => e.what).join('|');
  if (wick !== 'helmets and boots|bodies, legs and Bramble Blade') fails.push('AW-25 Wickstead\'s drop lines read ' + wick);
  if (sets('mosslight_glade', null) !== 'Iron,Studded,Adept:helmets,bodies,legs,boots:Longbow') fails.push('AW-25 the glade\'s gear for no worn weight reads ' + sets('mosslight_glade', null));
  /* THE ODDS (Tyler 2026-10-24: "a % drop chance or nothing at all"): each line's chance per kill is the engine's rows
     (monsters.js, the catalogue hr-accrue rolls), the whole kill's for every party size since 2026-11-08. Worked here from the
     rows on the Sewer (a hall built for a party, two tiers): a tier line = any piece of it on one kill of the ground's mix (every
     pocket on its route, as built), a Rare = per kill of its carrier. */
  const { HUNT_GROUNDS } = await imp('src/data/hunt-grounds.js');
  const { ITEMS } = await imp('src/data/items.js');
  const { chance } = await imp('src/render/format.js');
  const { detailHtml } = await imp('src/shell/windows/hunt-detail.js');
  const sewer = Object.values(HUNT_GROUNDS).find((g) => g.hunt === 'millrace_sewer');
  {
    const pts = {};
    for (const i of sewer.route) for (const s of sewer.pockets[i].spawns) pts[s.monster] = (pts[s.monster] || 0) + 1;
    const all = Object.values(pts).reduce((t, k) => t + k, 0);
    const tierOdds = (tier) => Object.entries(pts).reduce((t, [id, k]) => {
      const rows = MONSTERS[id].drops.filter((d) => d.band === 'scarce' && (Number(ITEMS[d.id].tier) || 1) === tier);
      return t + (k / all) * (1 - rows.reduce((p, d) => p * (1 - Math.min(0.95, d.ch)), 1));
    }, 0);
    const shown = scarceSetOf('millrace_sewer', 'medium').map((e) => chance(e.chance)).join('|');
    const want = [1, 2].map((t) => chance(tierOdds(t))).join('|');
    if (shown !== want || /under|^0%/.test(want)) fails.push('AW-25 the Sewer\'s gear odds read ' + shown + ', the rows say ' + want);
    const rr = raresOf('millrace_sewer').map((x) => x.name + ' ' + chance(x.chance)).join('|');
    const rw = residentsOf('millrace_sewer').flatMap((m) => MONSTERS[m.id].drops.filter((d) => d.band === 'rare' || d.band === 'trophy')
      .map((d) => ({ t: d.band === 'trophy', s: ITEMS[d.id].n + ' ' + chance(Math.min(0.95, d.ch)) })))
      .sort((a, b) => Number(a.t) - Number(b.t)).map((x) => x.s).join('|');
    if (rr !== rw) fails.push('AW-25 the Sewer\'s rare odds read ' + rr + ', the rows say ' + rw);
  }
  /* A MONSTER'S OWN DROP BONUS IS IN EVERY ODDS LINE (2026-11-10: the page left it out, so the Cellar's Slime, x1.15, read its Slime Gel 13% under
     what the server rolls). A FIXED ROW, NOT TODAY'S BALANCE: the Sump Slime is given a bonus on the very rows the page reads (the build's ?v=
     instance), put back after. What a row must read is the roller's own chance (drops.js rollDropTable, on a die that reports its chance and never
     lands) at the multiplier the settle hands it (hunt-rewards.js payKill: weakness(row).dropMult, combat.js weaknessInfo, the monster's own). */
  {
    const { materialsOf } = await imp('src/shell/hunt-ground-facts.js');
    const MV = (await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href + '?v=' + (await imp('src/build-info.js')).BUILD.version)).MONSTERS;
    const { rollDropTable } = await imp('src/core/drops.js');
    const { weaknessInfo } = await imp('src/core/combat.js');
    const rolls = (id) => { const seen = []; rollDropTable(MV[id].drops, { dropMult: weaknessInfo(MV[id], null).dropMult }, { chance: (c) => { seen.push(c); return false; } }); return MV[id].drops.map((d, i) => ({ d, c: seen[i] })); };
    const pts = {};
    for (const i of sewer.route) for (const s of sewer.pockets[i].spawns) pts[s.monster] = (pts[s.monster] || 0) + 1;
    const all = Object.values(pts).reduce((t, k) => t + k, 0);
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    const SLIME = 'sump_slime', had = MV[SLIME].dropBonus;
    try {
      MV[SLIME].dropBonus = 1.5;
      const tierOdds = (tier) => Object.entries(pts).reduce((t, [id, k]) => t + (k / all) * (1 - rolls(id).filter((r) => r.d.band === 'scarce' && (Number(ITEMS[r.d.id].tier) || 1) === tier).reduce((p, r) => p * (1 - r.c), 1)), 0);
      const gear = scarceSetOf('millrace_sewer', 'medium');
      if (gear.length !== 2 || gear.some((e) => !near(e.chance, tierOdds(e.tier)))) fails.push('AW-25 a monster\'s own drop bonus is not in the gear odds: ' + gear.map((e) => e.chance).join(' | ') + ', the roller says ' + [1, 2].map(tierOdds).join(' | '));
      const mine = rolls(SLIME);
      const rares = raresOf('millrace_sewer').filter((x) => x.carrier.id === SLIME);
      if (!rares.length) fails.push('AW-25 CONTROL: the Sump Slime carries no Rare, so the bonus check reads no Rare line');
      if (rares.some((x) => !near(x.chance, mine.find((r) => r.d.id === x.id).c))) fails.push('AW-25 a monster\'s own drop bonus is not in its Rare odds: ' + rares.map((x) => x.name + ' ' + x.chance).join(' | '));
      /* the materials only it drops here, one at least under the roller's 95% cap, where a bonus shows (today its Lamp Jelly; its Slime Gel sits at the cap either way) */
      const mats = materialsOf('millrace_sewer').filter((e) => e.carriers.length === 1 && e.carriers[0] === MV[SLIME].name);
      if (!mats.some((e) => mine.find((r) => r.d.id === e.id).c < 0.95)) fails.push('AW-25 CONTROL: the Sump Slime alone drops no material under the cap here, so the bonus check reads no Materials line');
      if (mats.some((e) =>!near(e.chance, (pts[SLIME] / all) * mine.find((r) => r.d.id === e.id).c))) fails.push('AW-25 a monster\'s own drop bonus is not in the Materials odds: ' + mats.map((e) => e.name + ' ' + e.chance).join(' | '));
    } finally { if (had === undefined) delete MV[SLIME].dropBonus; else MV[SLIME].dropBonus = had; }
  }
  const fmt =[0.0035, 0.021, 0.12, 0.00009, 0.0001].map(chance).join('|');
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
  /* The list line: the band against the Level in words and a tone; the best, or No best yet. */
  const rows = Object.fromEntries(huntRows().map((r) => [r.hunt, r]));
  const fits = [[rows.mill_cellar, 1], [rows.meadowbrook_thicket, 1], [rows.mosslight_glade, 1], [rows.mill_cellar, 20], [rows.mill_cellar, null]].map(([r, lv]) => { const f = fitWords(r, lv); return f ? f.tone + ':' + f.words : '-'; }).join('|');
  if (fits !== 'in:In your range|above:Above your level|far:Far above your level|below:Below your level|-') fails.push('AW-25 the band words read ' + fits);
  const bests = { minMs: 600000, grounds: { mill_cellar: { solo: { xpH: 7141, balanceH: 1859 }, party: { xpH: 9000, balanceH: 10 } } } };
  const lines = [bestLine(null, 'mill_cellar'), bestLine(bests, 'mill_cellar'), bestLine(bests, 'millrace_sewer')].join('|');
  if (lines !== '|Best 9,000 Level XP/h|No best yet') fails.push('AW-25 the list bests read ' + lines);
  const none = bestWords({ minMs: 600000, grounds: {} }, 'mill_cellar');
  if (none.solo || none.party || none.none !== 'No best here yet. Hunt 10 minutes or more to set one.') fails.push('AW-25 a ground with no best reads ' + JSON.stringify(none));
  /* A session over plain sections, the way the envelope projects them. */
  const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
  const START = [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)];
  const sess = (o) => { const e = Object.assign({ hunt_settings: { preset: 0, presets: [{ preset: 0, name: 'Set 1' }], slots: START, store: STORE },
    state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }, o); return { read: (k) => e[k] }; };
  const say = (cs, o) => beforeLines(cs, o).map((l) => (l.short ? '!' : '') + l.text).join(' | ');
  /* (A fresh hero's starter bar and Bring your heroes are read on the page's own modules, AW-27 / AW-28 in checks.) */
  const bare = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('consume', 'cooked_shrimp', 0)], store: STORE }, state: { gold: 0 }, stamina: { ms: 0, max_ms: 28800000 } }));
  if (bare !== 'Food: no Cooked Shrimp left. Nothing will be eaten, so HP comes back only between fights | !No stamina left. Rest in town before you go.') fails.push('AW-27 an empty bar and no stamina read ' + JSON.stringify(bare));
  const poor = say(sess({ state: { gold: 0 }, stamina: { ms: 30 * 60000, max_ms: 28800000 } }));
  if (!/\| Stamina: 30 min left, then the hunt ends\. \| !No gold for the store, so the hunt ends when your own supplies run out\.$/.test(poor)) fails.push('AW-27 low stamina and no gold read ' + JSON.stringify(poor));
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

/* AW-60 AN ITEM TELLS THE TRUTH (blind crafting panel, 2026-11-01), over the src at `base` so the `item truth:` mutants judge a planted
   copy. Every rule that can be a loop over the catalogue is one: a new row is held to it with nothing to edit here. */
async function itemTruthRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const { ITEMS } = await imp('src/data/items.js');
  const { DRINK_ITEMS } = await imp('src/data/drinks.js');
  const { usesOf, sourcesOf, kindWords, saleWords, toolEffect, whereToGet } = await imp('src/shell/item-lore.js');
  const { kindOf, lootToSell, lootSale, lootKept, upgradeNeeds, isStartKit } = await imp('src/shell/bag-model.js');
  const { toolLine, toolLossWords, workBlock, workRow, BENCH_INDEX } = await imp('src/shell/town-work.js');
  const { notListableWords, keptWords } = await imp('src/shell/market-words.js');
  const { beforeLines } = await imp('src/shell/hunt-go.js');
  const { nextUnlock } = await imp('src/data/skill-unlocks.js');
  const { ITEM_DESC } = await imp('src/data/item-descriptions.js');
  /* THE LOOP (the whetstone's "Fired from a bow"): every row's Used for and its header, by what the row is. */
  for (const id of [...Object.keys(ITEMS), ...Object.keys(DRINK_ITEMS)]) {
    const it = ITEMS[id] || DRINK_ITEMS[id], uses = usesOf(id), said = uses.join('. '), srcs = sourcesOf(id).join('. ');
    if (!uses.length || /undefined|NaN/.test(said + srcs + kindWords(id))) fails.push('AW-60 ' + id + ' reads ' + JSON.stringify([kindWords(id), srcs, said]));
    if (/Fired from/.test(said) && !(it.slot === 'ammo' && it.reqSkill === 'ranged')) fails.push('AW-60 ' + id + ' says it is fired from a bow: ' + said);
    if (it.slot === 'ammo' && it.reqSkill === 'ranged' && !/Fired from a bow or crossbow/.test(said)) fails.push('AW-60 the shot ' + id + ' reads ' + said);
    if (it.slot === 'ammo' && it.reqSkill === 'melee' && !/sharpens a melee weapon\. One wears out every \d+ swings/.test(said)) fails.push('AW-60 the whetstone ' + id + ' reads ' + said);
    if (it.slot === 'ammo' && it.reqSkill === 'magic' && !/^Rune/.test(kindWords(id))) fails.push('AW-60 the rune ' + id + ' is headed ' + kindWords(id));
    if (/Sell it at the shop/.test(said) && !(Number(it.v) > 0)) fails.push('AW-60 ' + id + ' says to sell it, and the shop bids nothing on it');
    if (it.seed && !/Plant it on the Farm/.test(said)) fails.push('AW-60 the seed ' + id + ' reads ' + said);
    if (kindWords(id) === 'Junk' && /(Made|Gathered|Grown) with/.test(srcs)) fails.push('AW-60 ' + id + ' is headed Junk and reads ' + srcs);
    if (kindWords(id) === 'Junk' && /^Used in /.test(said)) fails.push('AW-60 ' + id + ' is headed Junk and reads ' + said);
    if (it.type === 'tool') {
      const pc = Math.round(it.toolSpeed * 100) + '%';
      if (/Sell it at the shop/.test(said) || !said.includes(pc + ' faster') || !/while it's in your bag/.test(said) || !/it does nothing in Storage/.test(said)) fails.push('AW-60 the tool ' + id + ' reads ' + said);
      if (kindWords(id) !== 'Tool') fails.push('AW-60 the tool ' + id + ' is headed ' + kindWords(id));
    }
    /* who buys it: the row's book value is what the server's bid and the market's rule read */
    const sale = saleWords(id);
    if (!(Number(it.v) > 0) !== /^For your own use/.test(sale) && !it.bop) fails.push('AW-60 ' + id + ' (book ' + it.v + ') says of its buyers: ' + JSON.stringify(sale));
    if (Number(it.v) > 0 && !it.bop && isStartKit(id) !== /Weighhouse won't list/.test(sale)) fails.push('AW-60 ' + id + ' (kit ' + isStartKit(id) + ') says of its buyers: ' + JSON.stringify(sale));
  }
  /* Bug 7 and worse: what a hero makes or gathers is a material, whoever else drops it. */
  for (const id of ['copper_ore', 'oak_log', 'iron_bar', 'steel_bar', 'timber_beam', 'iron_fitting', 'gold_bar']) if (kindWords(id) !== 'Material') fails.push('AW-60 ' + id + ' is headed ' + kindWords(id));
  /* SELL ALL LOOT: Slime Gel at Crafting 1 with deed III next (Timber Beam -> Slime Gel); Timber Beam itself; the next deed's Silk Thread. */
  const skills = { crafting: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 } };
  const bag = ['slime_gel', 'silk_thread', 'timber_beam', 'iron_ore', 'copper_ore', 'normal_log', 'rat_tail', 'bat_wing'].map((id) => ({ id, qty: 5 }));
  const step = (items) => ({ gold: 1, items: items.map((id) => ({ id, qty: 1 })) });
  const manor = { tier: 2, rooms: [], tiers: [{ tier: 1, owned: true, ...step([]) }, { tier: 2, owned: true, ...step([]) }, { tier: 3, owned: false, ...step(['iron_ore', 'silk_thread', 'timber_beam', 'iron_fitting', 'willow_plank']) }] };
  const needs = upgradeNeeds(manor, null);
  const sold = lootToSell(bag, needs);
  if (sold.includes('slime_gel') || sold.includes('timber_beam') || sold.includes('iron_ore') || !sold.includes('rat_tail')) fails.push('AW-60 with deed III next, Sell all junk sells ' + sold.join(', '));
  if (lootToSell(bag, upgradeNeeds({ tier: 5, rooms: [], tiers: [{ tier: 5, owned: true, ...step([]) }] }, null)).includes('slime_gel')) fails.push('AW-60 Sell all junk sells Slime Gel, a Material, once the House stops asking');
  if (lootToSell(bag, upgradeNeeds(null, null)).includes('slime_gel')) fails.push('AW-60 a House not yet read sells a recipe\'s material on a guess');
  /* the House's own word keeps even Junk: a next step the server prices names it (its catalogue can run ahead of this client's) */
  const asked = upgradeNeeds({ tier: 1, rooms: [], tiers: [{ tier: 2, owned: false, ...step(['rat_tail']) }] }, null);
  if (lootToSell(bag, asked).includes('rat_tail')) fails.push('AW-60 Sell all junk sells the Rat Tail the House\'s next step names');
  const roomed = upgradeNeeds({ tier: 2, tiers: [], rooms: [{ opens: 2, next: { need: 2, ...step(['bat_wing']) } }, { opens: 3, next: { need: 3, ...step(['rat_tail']) } }] }, { next: { canBuild: true, ...step(['venom_sac']) } });
  if (!roomed.has('bat_wing') || !roomed.has('venom_sac') || roomed.has('rat_tail')) fails.push('AW-60 upgradeNeeds reads rooms and chests as ' + [...roomed].join(', '));
  const bids = new Map(bag.map((r) => [r.id, 2]));
  const shop = { bids };
  const onePress = lootSale(bag, { locked: new Set() }, shop, needs);
  const kept = lootKept(bag, { locked: new Set() }, shop, needs);
  if (onePress.lines.some((l) => l.item === 'slime_gel') || !kept.ids.includes('slime_gel')) fails.push('AW-60 the button sells ' + JSON.stringify(onePress.lines) + ' and says it keeps ' + kept.ids.join());
  /* TOOLS: the row, where it counts, and moving one away. */
  const hero = (inv, bank, offers) => { const e = { inventory: inv, skills, shop: { offers: offers || [], bids: {} }, bank: bank || {} }; return { read: (k) => e[k], account: { read: (k) => e[k] } }; };
  const both = hero({ iron_axe: 1, bronze_axe: 1 });
  if (!/Iron Axe is in your bag: Woodcutting 10% faster.*The times below count it/.test(toolLine(both, 'woodcutting'))) fails.push('AW-60 the Woodcutting tool line reads ' + toolLine(both, 'woodcutting'));
  if (toolLine(both, 'runecrafting') !== '') fails.push('AW-60 Runecrafting has no tool and says ' + toolLine(both, 'runecrafting'));
  if (toolLine(both, 'fishing') !== '') fails.push('AW-60 no rod has a source yet, and Fishing says ' + toolLine(both, 'fishing'));
  if (!/^Your Iron Axe is in Storage, so it doesn't count/.test(toolLine(hero({}, { iron_axe: 1 }), 'woodcutting'))) fails.push('AW-60 an axe in Storage reads ' + toolLine(hero({}, { iron_axe: 1 }), 'woodcutting'));
  if (!/Your Iron Axe is in Storage/.test(toolLine(hero({ bronze_axe: 1 }, { iron_axe: 1 }), 'woodcutting'))) fails.push('AW-60 a better axe in Storage reads ' + toolLine(hero({ bronze_axe: 1 }, { iron_axe: 1 }), 'woodcutting'));
  const bare = toolLine(hero({}, {}, [{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }]), 'woodcutting');
  if (!/^No tool in your bag\. Bronze Axe from the Shop: Woodcutting 5% faster/.test(bare)) fails.push('AW-60 a hero with no axe reads ' + bare);
  if (toolLossWords(both, 'iron_axe', 1) !== 'Woodcutting is slower without it. A tool only counts in your bag, so your Bronze Axe takes over.') fails.push('AW-60 storing the best axe says ' + toolLossWords(both, 'iron_axe', 1));
  if (toolLossWords(both, 'bronze_axe', 1) !== '') fails.push('AW-60 storing the axe that was not counting says ' + toolLossWords(both, 'bronze_axe', 1));
  if (toolLossWords(hero({ iron_axe: 2 }), 'iron_axe', 1) !== '') fails.push('AW-60 storing one of two axes says the rate changed');
  if (toolLossWords(hero({ iron_axe: 1 }), 'iron_axe', 1) !== 'Woodcutting is slower without it. A tool only counts in your bag.') fails.push('AW-60 storing the only axe says ' + toolLossWords(hero({ iron_axe: 1 }), 'iron_axe', 1));
  if (toolLossWords(both, 'rat_tail', 1) !== '') fails.push('AW-60 storing a rat tail warns about tools');
  /* A SHORT INPUT SAYS WHERE IT COMES FROM, where the shortage is read. */
  const wc = workRow('artisan', Object.keys(BENCH_INDEX).find((id) => { const i = BENCH_INDEX[id].recipe.inputs || {}; return i.silk_thread && Object.keys(i).length === 1; }));
  const short = workBlock({ read: (k) => (k === 'skills' ? { crafting: { xp: 0, level: 44 } } : k === 'inventory' ? {} : null) }, wc, false);
  if (!/^No Silk Thread in your bag.*Dropped by .* at Mill Cellar/.test(short)) fails.push('AW-60 a recipe short of Silk Thread reads ' + short);
  if (whereToGet('copper_ore') !== 'Gathered with Mining') fails.push('AW-60 a level 1 node\'s source sends a hero to its goblins too: ' + whereToGet('copper_ore'));
  if (whereToGet('normal_plank') !== 'Made with Crafting') fails.push('AW-60 a level 1 recipe\'s source reads ' + whereToGet('normal_plank'));
  if (!/^Made with Crafting \d+$/.test(whereToGet('timber_beam'))) fails.push('AW-60 the Timber Beam\'s source reads ' + whereToGet('timber_beam'));
  if (!/Farming \d+\. Dropped by .* at Mill Cellar/.test(whereToGet('wheat'))) fails.push('AW-60 Wheat\'s source reads ' + whereToGet('wheat'));
  /* THE WEIGHHOUSE SAYS WHY, by the server's reason. */
  if (!/even if you made yours/.test(notListableWords('start_kit')) || !/for your own use/.test(notListableWords('no_value')) || !/for your own use/.test(notListableWords('no_shop_price'))) fails.push('AW-60 the Weighhouse says ' + notListableWords('start_kit') + ' / ' + notListableWords('no_value'));
  const keptLine = keptWords([{ name: 'Cooked Shrimp', why: 'start_kit' }, { name: 'Chalked Earth Rune', why: 'no_value' }, { name: 'Bronze Arrows', why: 'no_value' }]);
  if (!/^3 stacks here can't be sold to other players\. Cooked Shrimp: every new hero.*Chalked Earth Rune and Bronze Arrows: the shop doesn't buy them/.test(keptLine)) fails.push('AW-60 the Sell tab says ' + keptLine);
  /* "... has not priced this yet" reads as an unfinished game: nowhere in the client. */
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(join(d, e.name))) : e.name.endsWith('.js') ? [join(d, e.name)] : []));
  for (const f of walk(join(base, 'src'))) if (/has not priced this yet/.test(readFileSync(f, 'utf8'))) fails.push('AW-60 ' + f.slice(base.length) + ' still says "has not priced this yet"');
  /* BUG 10: a slot names ONE item, so own food the bar doesn't name goes unused: Before you go says so, beside what the bar will do. */
  const slot = (id) => ({ action: { type: 'consume', id }, conditions: [], join: 'and', usable: true });
  const STORE = FIXTURE.hunt_settings.store;
  const sess = (slots, inv) => { const e = { hunt_settings: { preset: 0, presets: [], slots, store: STORE }, state: { gold: 500 }, inventory: inv, stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }; return { read: (k) => e[k] }; };
  const lines = (cs) => beforeLines(cs).map((l) => l.text).join(' | ');
  const starter = [slot('cooked_shrimp'), slot('salted_shrimp'), slot('thin_turnip_juice')];
  const unused = lines(sess(starter, { turnip_juice: 78, cooked_wolf_meat: 112, cooked_shrimp: 34 }));
  if (!unused.includes('You carry 78 Turnip Juice. Put it on the bar to drink it') || !unused.includes('You carry 112 Cooked Wolf Meat. Put it on the bar to eat it')) fails.push('AW-60 Before you go, own stock unused: ' + unused);
  const named = lines(sess([slot('cooked_shrimp'), slot('turnip_juice')], { turnip_juice: 78, cooked_shrimp: 34 }));
  if (/You carry/.test(named) || !named.includes('78 Turnip Juice of yours')) fails.push('AW-60 Before you go, own juice on the bar: ' + named);
  const noDrink = lines(sess([slot('cooked_shrimp')], { turnip_juice: 78, cooked_shrimp: 34 }));
  if (!noDrink.includes('Drink: no slot on your bar. You carry 78 Turnip Juice')) fails.push('AW-60 Before you go, no drink slot: ' + noDrink);
  /* Smaller lines of the same report. */
  if (/Next at level 12: Blank Rune/.test(nextUnlock('runecrafting', 11))) fails.push('AW-60 ' + nextUnlock('runecrafting', 11));
  for (const id of ['copper_ore', 'bronze_bar']) if (/\btin\b/.test(ITEM_DESC[id])) fails.push('AW-60 there is no tin: ' + ITEM_DESC[id]);
  return fails.concat(await panelLeftovers(base));
}

/* AW-61 THE PANEL'S LEFTOVERS (lane/a-panel-leftovers, 2026-11-01), over the src at `base`, judged by the `panel:` mutants. */
async function panelLeftovers(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  /* OWN STOCK BEFORE THE STORE: what "put it on the bar" sends, against the starter bar. */
  const { assignToBar } = await imp('src/shell/bar-assign.js');
  const hp = (v) => [{ metric: 'self_hp_pct', op: 'lt', value: v }], mana = (v) => [{ metric: 'self_mana_pct', op: 'lt', value: v }];
  const row = (id, conditions) => ({ action: { type: 'consume', id }, conditions, join: 'and', usable: true });
  const bar = (slots) => { const out = []; const e = { hunt_settings: { preset: 0, presets: [], slots, store: FIXTURE.hunt_settings.store } };
    return { read: (k) => e[k], setHuntOptions: async (_, o) => { out.push(o.slots); return { ok: true }; }, out }; };
  const sent = async (slots, id, at) => { const c = bar(slots); const r = await assignToBar(c, id, at); return c.out.length ? c.out[0].slice(0, slots.length + 2).map((w) => (w ? w.action.id + ':' + w.conditions.map((x) => x.value).join() : '-')).join(' ') : r.error; };
  const START = () => [row('cooked_shrimp', hp(60)), row('salted_shrimp', hp(60)), row('thin_turnip_juice', mana(30))];
  const own = await sent(START(), 'turnip_juice');
  if (own !== 'cooked_shrimp:60 salted_shrimp:60 turnip_juice:30 thin_turnip_juice:30 -') fails.push('AW-61 own juice goes on the bar as ' + own);
  const food = await sent(START(), 'cooked_wolf_meat');
  if (food !== 'cooked_shrimp:60 cooked_wolf_meat:60 salted_shrimp:60 thin_turnip_juice:30 -') fails.push('AW-61 own food goes on the bar as ' + food);
  const named = await sent(START(), 'turnip_juice', 7);
  if (!/^cooked_shrimp:60 salted_shrimp:60 thin_turnip_juice:30 -/.test(named)) fails.push('AW-61 a slot the player named is overridden: ' + named);
  const gap = await sent([row('cooked_shrimp', hp(60)), { empty: true }, row('thin_turnip_juice', mana(25))], 'turnip_juice');
  if (gap !== 'cooked_shrimp:60 turnip_juice:25 thin_turnip_juice:25 - -') fails.push('AW-61 a gap before the store slot reads ' + gap);
  const noStore = await sent([row('cooked_shrimp', hp(60))], 'turnip_juice');
  if (noStore !== 'cooked_shrimp:60 turnip_juice:30 -') fails.push('AW-61 a bar with no store drink reads ' + noStore);
  /* HUNT AGAIN IN A PARTY: the leader chooses; a member may only go back to the hunt its party is on. */
  const { againRoute } = await imp('src/hunt-view/summary-model.js');
  const party = (isLeader, hunting, hunt) => ({ me: 1, isLeader, hunt, seats: [{ seat: 0, hunting }, { seat: 1, hunting: false }] });
  const how = (p, h) => { const r = againRoute(p, h); return (r.how || 'off') + (r.why ? ':' + r.why : ''); };
  if (how(null, 'mill_cellar') !== 'enter') fails.push('AW-61 a lone hero\'s Hunt again: ' + how(null, 'mill_cellar'));
  if (how(party(false, false, 'mill_cellar'), 'mill_cellar') !== 'off:Your party leader picks the hunt and starts it.') fails.push('AW-61 a member\'s Hunt again: ' + how(party(false, false, 'mill_cellar'), 'mill_cellar'));
  if (how(party(true, false, 'mill_cellar'), 'mill_cellar') !== 'party') fails.push('AW-61 the leader\'s Hunt again: ' + how(party(true, false, 'mill_cellar'), 'mill_cellar'));
  if (how(party(false, true, 'mill_cellar'), 'mill_cellar') !== 'enter') fails.push('AW-61 a member going back in: ' + how(party(false, true, 'mill_cellar'), 'mill_cellar'));
  if (!/^off:Your party is hunting on another ground/.test(how(party(true, true, 'wickstead'), 'mill_cellar'))) fails.push('AW-61 Hunt again elsewhere with the party out: ' + how(party(true, true, 'wickstead'), 'mill_cellar'));
  /* THE ROSTER LINE: a bench job past its end is not "working on". */
  const { heroOf } = await imp('src/session/account-session.js');
  const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
  const recipe = Object.values(ARTISAN_RECIPES).flat().find((r) => r.output === 'normal_plank');
  const input = Object.keys(recipe.inputs || { [recipe.input]: 1 })[0] || recipe.input;
  const body = (left, ageMs) => ({ ok: true, name: 'Tess', now: '2026-11-01T12:00:00.000Z', inventory: { [input]: left },
    state: { level_xp: 0, gold: 1, gold_v: 1, active_kind: 'artisan', active_id: recipe.id, accrued_to: new Date(Date.parse('2026-11-01T12:00:00.000Z') - ageMs).toISOString() } });
  if (!/working on/.test(heroOf(body(1000, 60000)).doing || '')) fails.push('AW-61 a job with logs left reads ' + heroOf(body(1000, 60000)).doing);
  if (heroOf(body(392, 3600000)).doing !== null) fails.push('AW-61 a job past its end still reads ' + heroOf(body(392, 3600000)).doing);
  if (heroOf(body(0, 0)).doing !== null) fails.push('AW-61 a job with nothing left reads ' + heroOf(body(0, 0)).doing);
  const gathering = { ok: true, now: '2026-11-01T12:00:00.000Z', state: { level_xp: 0, active_kind: 'gather', active_id: recipe.id, accrued_to: '2026-11-01T01:00:00.000Z' } };
  if (!heroOf(gathering).doing) fails.push('AW-61 gathering never stops, and reads idle');
  /* A PRIVATE MESSAGE, A FRIEND REQUEST: a toast, once; the message's words stay in the chat. */
  const { createAlertCenter } = await imp('src/shell/alerts.js');
  const { mountSocialWatch } = await imp('src/shell/social-watch.js');
  const hero = { slot: 0, read: () => null, setResidue(f, v) { this.record.residue[f] = v; return true; }, record: { residue: {} }, subscribe: () => () => {} };
  const fns = new Set();
  const convs = [{ tab: 'w:z', id: 'z', name: 'Read Already', unread: 0 }], asks = [], said = [{ id: 'l1', body: 'secret' }];
  const social = { subscribe: (fn) => { fns.add(fn); return () => fns.delete(fn); }, whispers: { conversations: () => convs, lines: () => said }, friends: { incoming: () => asks } };
  const account = { viewed: 0, social, character: () => hero, characters: () => [hero], subscribe: () => () => {} };
  const center = createAlertCenter(account);
  const watch = mountSocialWatch(account, center);
  const tell = () => { for (const fn of fns) fn(); };
  tell();
  if (center.list().length) fails.push('AW-61 nothing arrived, and a toast says ' + center.list()[0].text);
  convs.push({ tab: 'w:x', id: 'x', name: 'Wrenna', unread: 1 });
  tell();
  said.push({ id: 'l2', body: 'and more' });
  tell();
  const toast = center.list().filter((a) => a.kind === 'whisper');
  if (toast.length !== 1 || toast[0].text !== 'Wrenna sent you a private message.' || toast[0].tab !== 'w:x' || toast[0].button !== 'Read it') fails.push('AW-61 a private message toasts ' + JSON.stringify(toast));
  if ((hero.record.residue.alerts || { seen: [] }).seen.some((id) => /^whisper/.test(id))) fails.push('AW-61 a live whisper takes a place in the saved list');
  asks.push({ id: 'y', name: 'Ashgrave', slot: 0 });
  tell(); tell();
  const asked = center.list().filter((a) => a.kind === 'friend');
  if (asked.length !== 1 || asked[0].text !== 'Ashgrave wants to be your friend.' || !(hero.record.residue.alerts || { seen: [] }).seen.includes('friend:y')) fails.push('AW-61 a friend request toasts ' + JSON.stringify(asked));
  /* ...AND IT GOES ONCE IT IS OVER (party panel 2026-11-03: "Kell wants to be your friend" stood through a whole hunt after Accept, only a reload cleared it). */
  asks.length = 0;
  tell();
  if (center.list().some((a) => a.kind === 'friend')) fails.push('AW-61 a request already answered still toasts');
  convs.find((c) => c.id === 'x').unread = 0;
  tell();
  if (center.list().some((a) => a.kind === 'whisper')) fails.push('AW-61 a message already read still toasts');
  watch.destroy(); center.destroy();
  /* AW-63 the panels' round 3 (2026-11-01). */
  const { enterOffWords } = await imp('src/shell/windows/hunts.js');
  if (enterOffWords(null) !== '' || enterOffWords({ isLeader: true }) !== '') fails.push('AW-63 Enter off reads ' + enterOffWords(null));
  if (!/^You're in Mira's party/.test(enterOffWords({ isLeader: false, leaderName: 'Mira' }))) fails.push('AW-63 a member\'s Enter reads ' + enterOffWords({ isLeader: false, leaderName: 'Mira' }));
  const { overBagWords } = await imp('src/shell/windows/inventory/index.js');
  if (overBagWords(99, 100) !== '' || !/Hunts still pick up loot/.test(overBagWords(114, 100))) fails.push('AW-63 a bag past its spaces says ' + overBagWords(114, 100));
  /* THE NEWCOMER'S PANEL (2026-11-01). */
  const { coachHtml } = await imp('src/shell/launcher.js');
  const reader = { read: () => null, record: { residue: { coach: { read: [] } } } };
  const aCard = { id: 'x', title: 'A title', text: 'Some words', done: { kind: 'read' }, gotIt: true };
  if (!/hs-pointer is-line/.test(coachHtml(reader, aCard, true)) || !/data-hs-act="coach-more"/.test(coachHtml(reader, aCard, true)) || /is-line|coach-more/.test(coachHtml(reader, aCard, false))) fails.push('AW-62 a card in a window is not one line, or one outside is');
  const { takeWhyOf, suggestedWeight } = await imp('src/shell/windows/tally.js');
  /* What a first Take asks for: the weight worn most, else the role's; neither said, nothing (blind panel 11-03: "no recommendation") */
  const bySuggest = [[{ boots: 'leather_boots' }, 'tank', 'medium'], [{ helmet: 'iron_helm' }, 'mage', 'heavy'], [{}, 'tank', 'heavy'], [{}, 'melee_dps', 'heavy'], [{}, 'ranger', 'medium'], [{}, 'mage', 'light'], [{}, 'healer', 'light']];
  for (const [w, r, want] of bySuggest) if ((suggestedWeight(w, r) || {}).weight !== want) fails.push('AW-62 a first Take for ' + r + ' in ' + JSON.stringify(w) + ' asks for ' + JSON.stringify(suggestedWeight(w, r)));
  if (suggestedWeight({}, null) !== null) fails.push('AW-62 with nothing said a first Take still guesses ' + JSON.stringify(suggestedWeight({}, null)));
  if (takeWhyOf({ weight: null, held: [], heldMax: 3 }, false, suggestedWeight({}, 'tank')) !== 'Your first Take asks her for heavy armor, which suits a shield tank. Change it below any time.') fails.push('AW-62 the line over her board with a suggestion reads ' + takeWhyOf({ weight: null, held: [], heldMax: 3 }, false, suggestedWeight({}, 'tank')));
  if (!/^Pick the armor weight/.test(takeWhyOf({ weight: null, held: [], heldMax: 3 }, false)) || !/^You hold as many/.test(takeWhyOf({ weight: 'heavy', held: [1, 2, 3], heldMax: 3 }, false))
    || takeWhyOf({ weight: 'heavy', held: [], heldMax: 3 }, false) !== '' || takeWhyOf({ weight: null, held: [], heldMax: 3 }, true) !== '') fails.push('AW-62 the line over her board is wrong');
  const { buryLabel, buryRecipeOf } = await imp('src/shell/windows/inventory/bury.js');
  const bones = buryRecipeOf('bones');
  const burning = { read: (k) => (k === 'state' ? { active_kind: 'artisan', active_id: bones.recipe.id } : null) };
  if (buryLabel(bones, 59) !== 'Fuel all 59' || buryLabel(bones, 59, { read: () => null }) !== 'Fuel all 59' || buryLabel(bones, 59, burning) !== 'Fueling…') fails.push('AW-62 the fuel label reads ' + buryLabel(bones, 59, burning));
  const { rareSaleWords } = await imp('src/shell/item-lore.js');
  if (rareSaleWords([{ item: 'rat_tail', qty: 4 }, { item: 'alpha_fang', qty: 3 }]) !== 'This sells rare finds: 3 Alpha Fang.' || rareSaleWords([{ item: 'rat_tail', qty: 4 }]) !== '') fails.push('AW-62 the sale says ' + rareSaleWords([{ item: 'alpha_fang', qty: 3 }]));
  const { slotOfferHtml, playLineOf } = await imp('src/app/slot-offer.js');
  const offer = { slotId: 2, cost: 15000, max: 5 }, one = { exists: true, slot: 0, gold: 500, goldV: 1 }, two = { exists: true, slot: 1, gold: 500, goldV: 1 };
  if (slotOfferHtml(offer, [one, { exists: false, slot: 1 }]) !== '' || !/Buy a hero slot/.test(slotOfferHtml(offer, [one, two]))) fails.push('AW-62 the slot offer with a free slot empty');
  if (/cost gold/.test(playLineOf(4, 4, 2, offer, [one, { exists: false, slot: 1 }])) || !/and more slots cost gold\.$/.test(playLineOf(4, 4, 2, offer, [one, two]))) fails.push('AW-62 the play line with a free slot empty');
  const { jobReplacedWords } = await imp('src/shell/town-work.js');
  const worker = (state, hunt) => ({ read: (k) => (k === 'state' ? state : k === 'hunt' ? hunt : null) });
  const tree = { active_kind: 'gather', active_id: 'normal_tree', active_since: '2026-11-01T00:00:00Z' };
  const wrow = (await imp('src/shell/town-work.js')).workRow;
  const craft = wrow('artisan', Object.keys((await imp('src/shell/town-work.js')).BENCH_INDEX)[0]);
  if (jobReplacedWords(worker(tree, null), craft) !== 'You stopped chopping the Normal Tree.') fails.push('AW-62 a craft over chopping says ' + JSON.stringify(jobReplacedWords(worker(tree, null), craft)));
  if (jobReplacedWords(worker(tree, null), wrow('gather', 'normal_tree')) !== '') fails.push('AW-62 pressing the running job says it stopped');
  if (jobReplacedWords(worker({ active_kind: 'idle' }, null), craft) !== '') fails.push('AW-62 an idle hero stopped something');
  const { startWork } = await imp('src/shell/town-work.js');
  const pressed = await startWork(worker(tree, null), craft, (fn, busy, done) => done({ ok: true }), null);
  if (pressed !== 'You stopped chopping the Normal Tree.') fails.push('AW-62 the press over chopping answers ' + JSON.stringify(pressed));
  return fails;
}

/* AW-25 TOWN WORK COUNTS UP BETWEEN PAYOUTS (Tyler 2026-10-23), the pure rules: src/shell/town-ticker.js runs the
   server's own span loop on the envelope's numbers. `base` is the repo, or a temp copy of src a ticker mutant was
   planted into (TICKER_MUTANTS below). */
/* AW-34 PURE (the armor weights' words), run on `base` so the `armor words:` mutants judge a planted copy of src. */
/* AW-21 PLANS (pure): the two playtest 2026-10-29 rules, over the src at `base`. Their own function so `--mutate` judges
   their mutants (names starting 'plans:') on a temp copy of src: a mutant run skips pure() and the page never
   reaches either rule (run 40830396041: both escaped). */
async function planRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const UP = await imp('src/shell/upgrade-plan.js');
  const lv1 = { defense: { level: 1 }, melee: { level: 1 }, ranged: { level: 1 }, magic: { level: 1 } };
  /* AW-27 Before you go, a rune spell's line (starter bars, lane/a-starter-bars), over the hunt-go.js at `base`. */
  const { beforeLines, noShotWords } = await imp('src/shell/hunt-go.js');
  /* THE DEATH LINE SAYS THE BLESSED SHARE (designer re-read 2026-11-11: "lose 6%" with 3 of 3 Blessings on): the server's held cut against the 6% */
  {
    const HL = await imp('src/shell/hunt-list.js');
    const glade = HL.huntRows().find((r) => r.band[0] > 6);
    const die = (pm) => (HL.rangeWords(glade, 1, pm) || '').replace(/^.*?If you die/, 'If you die');
    const said = [die(0), die(250), die(750)];
    if (said.join(' | ') !== 'If you die, the hunt ends and you lose 6% of your Level XP. | If you die, the hunt ends. With your Blessings on, you lose 4.5% of your Level XP. | If you die, the hunt ends. With your Blessings on, you lose 1.5% of your Level XP.') fails.push('AW-25 the death line with Blessings reads ' + JSON.stringify(said));
  }
  /* A PLAN THAT HAS RUN IS NOT "NOTHING SET" (designer re-read 2026-11-11: "Nothing is set to Deposit or Sell yet." right under "Sold 17 for 5,407 gp."). */
  const { dispatchBlock } = await imp('src/shell/loot-dispatch.js');
  const bagCs = (inventory, loot) => ({ read: (k) => ({ inventory, bag_rules: { locked: [], loot } })[k] });
  const ran = dispatchBlock(bagCs({ bones: 3 }, { rat_tail: 'sell', wolf_pelt: 'deposit' })), none = dispatchBlock(bagCs({ bones: 3 }, {})), ready = dispatchBlock(bagCs({ rat_tail: 3 }, { rat_tail: 'sell' }));
  if (!/^Your loot plan has nothing left to move\./.test(ran) || !/^You haven’t picked Deposit or Sell for anything yet\./.test(none) || ready !== '') fails.push('AW-32 the Dispatch loot why reads ' + JSON.stringify([ran, none, ready]));
  /* A SHARED COOLDOWN IS A WAIT, NOT A STOP (designer re-read 2026-11-11: "which fires first" read as "never fires", over 2,484 casts in a night). */
  const { sharedCooldownOf } = await imp('src/shell/action-facts.js');
  const wire = (id) => ({ action: { type: 'ability', id }, conditions: [], enabled: true });
  const waits = sharedCooldownOf([wire('power_strike'), wire('flame_strike')], 1);
  if (waits !== 'Waits for Power Strike (slot 1) when both are ready.') fails.push('AW-27 a spell sharing a cooldown reads ' + JSON.stringify(waits));
  const STORE = FIXTURE.hunt_settings.store;
  const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
  const sess = (o) => { const e = Object.assign({ hunt_settings: { preset: 0, presets: [], slots: [], store: STORE }, state: { gold: 500 }, inventory: {},
    stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }, o); return { read: (k) => e[k] }; };
  const say = (cs, o) => beforeLines(cs, o).map((l) => (l.short ? '!' : '') + l.text).join(' | ');
  /* before a hero walks away: how long this stamina lasts, game closed or not (panel 2026-11-01: 5 h 46 idle with no word before leaving) */
  const lasts = say(sess({ stamina: { ms: 3 * 3600000 + 17 * 60000, max_ms: 43200000 } }));
  if (!lasts.includes('Stamina: 3 h 17 min. Your hero hunts that long, even with the game closed, then comes home.')) fails.push('AW-27 a long stamina reads ' + JSON.stringify(lasts));
  /* A rune spell with none of its ticked runes and no store behind it (its slot set to "Leave the hunt": a slot that says nothing
     buys from the shop, Tyler 2026-11-08) loses that spell only (named, not a stop); no food is said. */
  const leaving = (id) => ({ action: { type: 'ability', id, onEmpty: 'leave' }, conditions: [], join: 'and', usable: true, count: 0 });
  const spell = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [leaving('flame_strike')], store: STORE } }));
  /* (a rune spell spends any tier of its family, so the line names and counts the family: lane b-spell-content) */
  /* ...and says the fix: a style's default bar meets a new hero here first (designer 2026-10-29, lane/a-starter-bars) */
  if (spell !== 'Runes: no Fire runes of yours. Flame Strike will not fire. To cast it, press its slot and pick Plain Fire Rune (1 gp a cast) under "When your runes run out" | Your bar eats and drinks nothing: HP and mana come back only between fights. | Stamina: 8 h 0 min. Your hero hunts that long, even with the game closed, then comes home.') fails.push('AW-27 a spell with no rune reads ' + JSON.stringify(spell));
  /* two spells of two families (the Mage's default Frost Lance and Arcane Barrier): both named, each family's store rune */
  const RUNES = STORE.concat([['plain_ice_rune', 'chalked_ice_rune'], ['plain_earth_rune', 'chalked_earth_rune']].map(([id, partner]) => ({ ...STORE.find((r) => r.id === 'plain_fire_rune'), id, partner })));
  const two = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [leaving('frost_lance'), leaving('arcane_barrier')], store: RUNES } }));
  if (!/^Runes: no Ice runes of yours, no Earth runes of yours\. Frost Lance and Arcane Barrier will not fire\. To cast them, press each slot and pick Plain Ice Rune \(1 gp a cast\) or Plain Earth Rune \(1 gp a cast\) under "When your runes run out"/.test(two))
    fails.push('AW-27 two struck spells read ' + JSON.stringify(two));
  /* AW-27 what casts, then what won't (first-hour play 2026-10-31: "no Fire runes of yours, then Plain Fire Rune from the store,
     then no Ice runes of yours, then no Earth runes of yours"); two spells of one family name its store rune once */
  const stored = (id, store) => ({ action: { type: 'ability', id, store }, conditions: [], join: 'and', usable: true, count: 0 });
  const mix = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), leaving('frost_lance')], store: RUNES } }));
  if (!mix.startsWith('Runes: Plain Fire Rune from the store, 1 gp a cast. Frost Lance will not fire. To cast it, press its slot and pick Plain Ice Rune (1 gp a cast)')) fails.push('AW-27 a live spell beside a struck one reads ' + JSON.stringify(mix));
  /* the rune ladder: a named deeper rune is said at its own price; one above the level is no promise: the spell will not fire, and the fix is the family's Plain */
  const SCORED_ROW = { ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_scored_fire_rune', partner: 'scored_fire_rune', price: 8 };
  const deep = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_scored_fire_rune')], store: RUNES.concat([SCORED_ROW]) } }));
  if (!deep.startsWith('Runes: Scored Fire Rune from the store, 8 gp a cast |')) fails.push('AW-27 a deeper store rune reads ' + JSON.stringify(deep));
  const short = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [{ ...stored('fireball', 'plain_scored_fire_rune'), usable: false, why: 'store_level' }], store: RUNES.concat([SCORED_ROW]) } }));
  if (!short.startsWith('Runes: no Fire runes of yours. Fireball will not fire. To cast it, press its slot and pick Plain Fire Rune (1 gp a cast)')) fails.push('AW-27 a store rune above the level reads ' + JSON.stringify(short));
  const WATER = RUNES.concat([{ ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_water_rune', partner: 'chalked_water_rune' }]);
  const same = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('greater_mend', 'plain_water_rune'), stored('circle_of_renewal', 'plain_water_rune')], store: WATER } }));
  if (!same.startsWith('Runes: Plain Water Rune from the store, 1 gp a cast |')) fails.push('AW-27 two spells of one family read ' + JSON.stringify(same));
  /* AW-27 THREE SPELLS ARE THREE SPENDS, NOT A FALLBACK (played 2026-11-05, a new Mage: "Plain Fire Rune..., then Plain Ice Rune..., then Plain Earth Rune"): "then" stays inside one spell's own runes and its store rune */
  const trio = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), stored('frost_lance', 'plain_ice_rune'), stored('arcane_barrier', 'plain_earth_rune')], store: RUNES } }));
  if (!trio.startsWith('Runes: Plain Fire Rune, Plain Ice Rune and Plain Earth Rune from the store, 1 gp a cast |')) fails.push('AW-27 three store spells read ' + JSON.stringify(trio));
  const ownThenTwo = say(sess({ inventory: { chalked_fire_rune: 9 }, hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), stored('frost_lance', 'plain_ice_rune')], store: RUNES } }));
  if (!ownThenTwo.startsWith('Runes: 9 Fire runes of yours, then Plain Fire Rune from the store, 1 gp a cast. Plain Ice Rune from the store, 1 gp a cast |')) fails.push('AW-27 own runes beside a store spell read ' + JSON.stringify(ownThenTwo));
  const sameFamilyOwn = say(sess({ inventory: { chalked_water_rune: 9 }, hunt_settings: { preset: 0, presets: [], slots: [stored('greater_mend', 'plain_water_rune'), stored('circle_of_renewal', 'plain_water_rune')], store: WATER } }));
  if (!sameFamilyOwn.startsWith('Runes: 9 Water runes of yours, then Plain Water Rune from the store, 1 gp a cast |')) fails.push('AW-27 two spells on one family\'s own runes read ' + JSON.stringify(sameFamilyOwn));
  /* AW-27 A SUMMARY RECORDED THIS MOMENT HAS NOT HAD ITS MOMENT: left at once, the next load opens it (played 2026-11-04: a reload 0.7 s after Play left no summary and no bar) */
  {
    const R = await imp('src/hunt-view/summary-recorder.js');
    const env = JSON.parse(JSON.stringify(FIXTURE));
    env.hunt.ended = true;
    env.hunt.session = Object.assign({}, env.hunt.session, { end_reason: 'stamina', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
    let heard = null;
    const cs = { record: { residue: {} }, read: (k) => env[k], timeline: { subscribe() {} }, subscribe(f) { heard = f; }, setResidue(k, v) { cs.record.residue[k] = v; return true; } };
    R.attach(cs);
    heard();
    const had = R.summariesOf(cs).length;
    R.forgetUnreadSummary(cs);
    if (had !== 1 || R.summariesOf(cs).length !== 0) fails.push('AW-27 a summary left at once reads ' + JSON.stringify([had, R.summariesOf(cs).length]));
  }
  /* AW-27 A PICK KEEPS DETAILS ON THE PICK: the list moves under a pointer that has not (art audit 2026-11-04: pick Mend, read Power Strike); the pointer's next move counts again */
  {
    const { renderConfigureAction } = await imp('src/shell/windows/configure-action.js');
    /* the instance the window itself imports (its scratch is per module instance) */
    const { BUILD } = await imp('src/build-info.js');
    const { openSlot } = await import(pathToFileURL(join(base, 'src/shell/bar-draft.js')).href + '?v=' + BUILD.version);
    const sec = { hunt_settings: { preset: 0, presets: [], slots: [slot('ability', 'power_strike', 0)], store: STORE } };
    const cs = { read: (k) => sec[k] };
    openSlot(cs, 0);
    let paints = 0;
    const ctx = { character: cs, refresh: () => { paints++; }, wm: { close() {} } };
    const row = (id) => ({ getAttribute: (k) => ({ 'data-x': 'pick', 'data-type': 'ability', 'data-id': id })[k] ?? null });
    renderConfigureAction.act(ctx, {}, 'cfg', { type: 'click', clientX: 300, clientY: 200 }, row('mend'));
    const afterPick = paints;
    renderConfigureAction.act(ctx, {}, 'cfg', { type: 'mouseover', clientX: 300, clientY: 200 }, row('power_strike'));
    if (paints !== afterPick) fails.push('AW-27 the list moved under a still pointer and Details followed it');
    renderConfigureAction.act(ctx, {}, 'cfg', { type: 'mouseover', clientX: 301, clientY: 200 }, row('power_strike'));
    if (paints !== afterPick + 1) fails.push('AW-27 a moved pointer no longer compares a row after a pick');
  }
  /* AW-27 AN ANSWER LEAVES ON ITS OWN (QA 2026-11-04: "Put on 3 pieces." still stood when the window was reopened hours later), unless a newer one replaced it */
  {
    const { runIntent, ANSWER_STANDS_MS } = await imp('src/shell/intent-words.js');
    const timers = [], real = globalThis.setTimeout, sc = { pending: false, msg: '' };
    globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return 0; };
    try {
      await runIntent(sc, () => {}, async () => ({ ok: true }), 'Equipping…', () => 'Put on 3 pieces.');
      const first = timers.find((t) => t.ms === ANSWER_STANDS_MS), stood = sc.msg;
      if (first) first.fn();
      if (stood !== 'Put on 3 pieces.' || !first || sc.msg !== '') fails.push('AW-27 an answer stands ' + JSON.stringify({ stood, aged: !!first, after: sc.msg }));
      timers.length = 0;
      await runIntent(sc, () => {}, async () => ({ ok: true }), 'Selling…', () => 'Sold 2.');
      const old = timers[0];
      sc.msg = 'Sold 5.';
      if (old) old.fn();
      if (sc.msg !== 'Sold 5.') fails.push('AW-27 an old answer took the newer one with it: ' + JSON.stringify(sc.msg));
    } finally { globalThis.setTimeout = real; }
  }
  /* AW-20 A DRINK IS MADE, NOT COOKED (QA 2026-11-04: "Cooking Turnip: 0 cooked so far" over Turnip Juice); a dish still names what goes on the fire */
  {
    const { nowParts, doWords, workRow } = await imp('src/shell/town-work.js');
    const { lineText } = await imp('src/shell/town-ticker.js');
    const benchLine = (id, inv) => lineText(nowParts({ read: (k) => (k === 'state' ? { active_kind: 'artisan', active_id: id } : k === 'inventory' ? inv : null) }));
    const juice = benchLine('press_turnip_juice', { turnip: 4 });
    if (!/^Making Turnip Juice/.test(juice) || /Cooking|cooked/.test(juice) || doWords(workRow('artisan', 'press_turnip_juice')) !== 'make Turnip Juice') fails.push('AW-20 pressing juice reads ' + JSON.stringify(juice));
    const dish = benchLine('cook_shrimp', { shrimp: 4 });
    if (!/^Cooking Raw Shrimp/.test(dish)) fails.push('AW-20 a dish reads ' + JSON.stringify(dish));
  }
  /* AW-27 BEFORE YOU GO SAYS THE BLESSINGS (board 11-04: nothing said them before the risk), every number the server's */
  const blessed = (held, price) => say(sess({ blessings: { permille: [0, 250, 500, 750][held.length], free_until: 30, tiers: [1, 2, 3].map((tier) => ({ tier, permille: 250 * tier, price, held: held.includes(tier) })) } }));
  const noneFree = blessed([], 0), oneOn = blessed([1], 450), allOn = blessed([1, 2, 3], 450);
  if (!noneFree.endsWith("You have no Blessings on. They cut the XP you lose when you die, and they're free until Level 30. Get them in the Shop's Services tab.")) fails.push('AW-27 no Blessings, free, reads ' + JSON.stringify(noneFree));
  if (!oneOn.endsWith("You have 1 of 3 Blessings on. You lose 25% less XP when you die. The next one costs 450 gp in the Shop's Services tab.")) fails.push('AW-27 one Blessing reads ' + JSON.stringify(oneOn));
  if (!allOn.endsWith('You have all 3 Blessings on. You lose 75% less XP when you die.')) fails.push('AW-27 every Blessing reads ' + JSON.stringify(allOn));
  const nonePaid = blessed([], 450), oneFree = blessed([1], 0);
  if (!nonePaid.endsWith("You have no Blessings on. They cut the XP you lose when you die. The first one costs 450 gp in the Shop's Services tab.")) fails.push('AW-27 no Blessings, priced, reads ' + JSON.stringify(nonePaid));
  if (!oneFree.endsWith("You have 1 of 3 Blessings on. You lose 25% less XP when you die. The rest are free until Level 30 in the Shop's Services tab.")) fails.push('AW-27 one Blessing, the rest free, reads ' + JSON.stringify(oneFree));
  /* AW-27 A MOVE THE WORN WEAPON CAN'T USE SPENDS NOTHING: a club hero is not warned about Flame Volley's runes (QA 2026-11-04) */
  const clubSay = say(sess({ hunt_settings: { preset: 0, presets: [], discipline: 'club', slots: [slot('ability', 'flame_volley', 0), slot('ability', 'power_strike', 0)], store: RUNES } }));
  if (/Flame Volley|Fire rune|^Runes:/.test(clubSay)) fails.push('AW-27 a club hero is told about another weapon\'s runes: ' + JSON.stringify(clubSay));
  /* AW-27 A WEAPON SWAP PUTS THE WORN WEAPON'S MOVES IN FRONT (QA 2026-11-04: bow to club kept Hunter's Mark, Flame Volley and Precision Shot struck in 1-3, Power Strike in 7)
     AND TAKES NONE OFF (report #79, 2026-11-09: staff to spellbook deleted a Healer's four staff spells, and the staff again brought none back): the moves trade places, food never moves */
  const { barAfterSwap } = await imp('src/shell/bar-assign.js');
  const barSlot = (type, id) => ({ action: { type, id }, conditions: [], join: 'and' });
  const swapped = barAfterSwap({ discipline: 'club', slots: [barSlot('ability', 'hunters_mark'), barSlot('ability', 'flame_volley'), barSlot('ability', 'precision_shot'), barSlot('consume', 'cooked_shrimp'), barSlot('consume', 'salted_shrimp'), barSlot('consume', 'thin_turnip_juice'), barSlot('ability', 'power_strike'), barSlot('ability', 'cleave')] });
  const swapRead = (swapped || []).slice(0, 9).map((w) => (w ? w.action.id : '-')).join(' ');
  if (swapRead !== 'power_strike cleave hunters_mark cooked_shrimp salted_shrimp thin_turnip_juice flame_volley precision_shot -') fails.push('AW-27 the bar after bow to club reads ' + JSON.stringify(swapRead));
  if (barAfterSwap({ discipline: 'club', slots: [barSlot('ability', 'power_strike'), barSlot('consume', 'cooked_shrimp')] }) !== null) fails.push('AW-27 a bar with nothing left behind is restated anyway');
  /* the Healer's round trip, as Marigold played it: staff (restoration) to spellbook (destruction) and back gives the bar she had */
  const healerBar = [barSlot('ability', 'mend'), barSlot('ability', 'greater_mend'), barSlot('ability', 'circle_of_renewal'), barSlot('ability', 'green_sickness'), barSlot('ability', 'protective_ward'), null, barSlot('consume', 'cooked_shrimp')];
  const ids = (w) => (w || []).slice(0, 8).map((x) => (x ? x.action.id : '-')).join(' ');
  const onBook = barAfterSwap({ discipline: 'destruction', slots: healerBar });
  const back = barAfterSwap({ discipline: 'restoration', slots: onBook || healerBar });
  if (ids(onBook || healerBar).split(' ').filter((x) => /mend|renewal|sickness|ward/.test(x)).length !== 5) fails.push('AW-27 a swap to the spellbook took moves off the bar: ' + JSON.stringify(ids(onBook)));
  if (ids(back || onBook || healerBar) !== ids(healerBar)) fails.push('AW-27 staff to spellbook and back reads ' + JSON.stringify(ids(back || onBook)) + ', want the bar as it was, ' + JSON.stringify(ids(healerBar)));
  /* AW-27 A BOW WITH NOTHING LOADED WON'T ATTACK, AND THE PAGE SAYS SO BEFORE ENTER (the kit's bow: 0 kills in 7 minutes) */
  const bowSet = (o) => sess({ hunt_settings: { preset: 0, presets: [], role: 'ranger', slots: [], store: STORE }, inventory: { bronze_arrows: 50 }, ...o });
  const empty = say(bowSet({ equipment: { weapon: 'practice_bow' } }));
  if (!empty.startsWith("!Ammo: nothing loaded, so your weapon can't shoot and your hero won't attack. Open your bag, press Bronze Arrows, then Put on the bar.")) fails.push('AW-27 a bow with nothing loaded reads ' + JSON.stringify(empty));
  const full = say(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'bronze_arrows' } }));
  if (!full.startsWith('Ammo: Bronze Arrows loaded. They never run out.')) fails.push('AW-27 a bow with the free arrow reads ' + JSON.stringify(full));
  const paid = say(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'iron_arrows' }, inventory: { iron_arrows: 9 } }));
  if (!paid.startsWith('Ammo: 9 Iron Arrows of yours, loaded.')) fails.push('AW-27 a bow with a paid arrow reads ' + JSON.stringify(paid));
  if (/Ammo/.test(say(sess({ hunt_settings: { preset: 0, presets: [], role: 'tank', slots: [], store: STORE } })))) fails.push('AW-27 a sword is told about ammo');
  /* AW-27 WARNED, NEVER BLOCKED, AND THE WORDS AGREE (the panel 2026-11-01): the hunt screen says what prep said of a bow with
     nothing to shoot; no weapon is said at prep; a held task that does not count here is said; the Sewer's words admit the lone hero who
     walks in; "an Iron Boots"; "Bow or Crossbow or Bow or crossbow"; creation and prep agree on the free arrow. */
  if (!/^nothing loaded, so your weapon can't shoot/.test(noShotWords(bowSet({ equipment: { weapon: 'practice_bow' } })))) fails.push('AW-27 the hunt screen is silent on a bow with nothing to shoot: ' + JSON.stringify(noShotWords(bowSet({ equipment: { weapon: 'practice_bow' } }))));
  if (noShotWords(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'bronze_arrows' } }))) fails.push('AW-27 the hunt screen warns a loaded bow');
  if (!say(sess({ equipment: {} })).startsWith('!Weapon: none on')) fails.push('AW-27 no weapon reads ' + JSON.stringify(say(sess({ equipment: {} }))));
  const TASK = { held: [{ place: 1, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 0, target: 120, keep: false, done: false }], paid_today: 0, per_day: 3, held_max: 3, order: [], recent: [] };
  if (!/Tamsin's tasks: nothing here counts toward them\. Only Giant Rats in .+ count/.test(say(sess({ tally: TASK }), { hunt: 'meadowbrook_thicket' }))) fails.push('AW-27 a held task elsewhere reads ' + JSON.stringify(say(sess({ tally: TASK }), { hunt: 'meadowbrook_thicket' })));
  if (/Tamsin/.test(say(sess({ tally: TASK }), { hunt: 'mill_cellar' }))) fails.push('AW-27 a task that counts here is warned about');
  const { heroWords, huntRows } = await imp('src/shell/hunt-list.js');
  const sewer = huntRows().find((r) => r.hunt === 'millrace_sewer');
  if (heroWords(sewer) !== 'Alone or with up to ' + (sewer.heroes - 1) + ' more') fails.push('AW-27 the Sewer reads ' + JSON.stringify(heroWords(sewer)));
  const { pickWords } = await imp('src/session/tally-sections.js');
  const picked = [['iron_boots', 'Iron Boots'], ['iron_helmet', 'an Iron Helm']].map(([item]) => pickWords({ pick: 'piece', item, qty: 1 }, (id) => ({ iron_boots: 'Iron Boots', iron_helmet: 'Iron Helm' }[id]))).join('|');
  if (picked !== 'Iron Boots|an Iron Helm') fails.push('AW-27 her pick reads ' + picked);
  /* While fueling the picked stack, its pocket and the work line count alike (the panel 2026-11-01: "×15 · 14 being used" by a pocket of 1). */
  const { pickCountWords } = await imp('src/shell/windows/inventory/grid.js');
  if (pickCountWords(15, -14) !== '×1 · 14 being used' || pickCountWords(100, 5) !== '×100 · 5 more on the way' || pickCountWords(7, 0) !== '×7') fails.push('AW-27 the picked stack reads ' + pickCountWords(15, -14));
  const { factsOf } = await imp('src/shell/action-facts.js');
  const { ABILITIES } = await imp('src/data/abilities.js');
  for (const id of Object.keys(ABILITIES)) {
    const req = factsOf({ type: 'ability', id }).requires || '';
    const said = req.replace(/^Works with |\.$/g, '').toLowerCase().split(' or ');
    if (new Set(said).size !== said.length) fails.push('AW-27 ' + id + ' reads ' + JSON.stringify(req));
  }
  const { HOW_YOU_FIGHT } = await imp('src/data/how-to-play.js');
  const shoot = HOW_YOU_FIGHT.find((f) => f.id === 'shoot');
  if (!shoot || !/Bronze Arrows are free and never run out/.test(JSON.stringify(shoot))) fails.push('AW-27 creation says of the bow ' + JSON.stringify(shoot));
  /* AW-8 / AW-27 AN EMPTY FOOD SLOT IS A HEADS-UP, NOT A BLOCKER (Tyler 10-29: "0 food" in Hunt prep on a hero that
     carries food the bar does not name and is not getting hit). Both surfaces say the empty stock and the bag's spare
     food with the fix, and neither calls it short; empty ammo on a shooter's bar still stops it. */
  const { readinessOf, readinessLine } = await imp('src/shell/readiness.js');
  const noStore = (slots, inv) => sess({ hunt_settings: { preset: 0, presets: [], slots, store: STORE, supplySource: 'own', onEmpty: 'stop' }, inventory: inv, name: 'Brannoc' });
  const fed = noStore([slot('consume', 'cooked_shrimp', 0)], { cooked_trout: 12 });
  const fedR = readinessOf(fed);
  const fedSaid = [readinessLine(fedR), fedR.checks.filter((c) => c.id === 'food').map((c) => (c.ok ? '' : '!') + c.text).join(), say(fed)].join(' || ');
  if (fedSaid !== 'Brannoc: ready || Food: no Cooked Shrimp left. You carry 12 Cooked Trout. Put it on the bar to eat it || Food: no Cooked Shrimp left. You carry 12 Cooked Trout. Put it on the bar to eat it | Stamina: 8 h 0 min. Your hero hunts that long, even with the game closed, then comes home.')
    fails.push('AW-8 an empty food slot with spare food in the bag reads ' + JSON.stringify(fedSaid));
  const shooter = readinessOf(sess({ hunt_settings: { preset: 0, presets: [], role: 'ranger', slots: [{ action: { type: 'attack_with_item', id: 'loaded' }, conditions: [], join: 'and', usable: true }], store: STORE, supplySource: 'own', onEmpty: 'stop' }, inventory: {}, name: 'Brannoc' }));
  if (readinessLine(shooter) !== 'Brannoc: 0 ammo') fails.push('AW-8 a bar that shoots with no ammo reads ' + JSON.stringify(readinessLine(shooter)));
  /* AW-64 HUNT PREP READS WHAT THE HERO CAN USE NOW (Andy #74, live 11-02: Eddie with 2,000 Cooked Swordfish in his hunt bag read
     "Food: the store, 432 gp each as used", Fremulon "Ammo: the store as used"; Enter MOVES supplies out of the bag, and the ledger
     shows neither ever paid). Prep and Before you go print ONE reader; in a hunt and in town say the same; every tier of food, drink,
     ammo and runes; ammo in the engine's order (conditions.js attackOrder), so a free stack ends the line and nothing behind it is said. */
  {
  const { BASIC_SUPPLIES } = await imp('src/data/supply-basics.js');
  const { ABILITIES: SPELLS } = await imp('src/data/abilities.js');
  const { itemName: nameOfItem, runeWords: runeWordsOf } = await imp('src/shell/widgets/bits.js');
  const { factsOf: factsOfSlot } = await imp('src/shell/action-facts.js');
  const LIVE = BASIC_SUPPLIES.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner, heals: b.heals || null, mana: b.mana || null, price: b.price }));
  const barOf = (role, slots) => ({ preset: 0, presets: [], role, slots, store: LIVE, supply_source: 'mine', on_empty: 'switch' });
  const inHunt = (name, role, slots, packed, equipment) => sess({ name, hunt_settings: barOf(role, slots), equipment, inventory: {},
    hunt: { session_id: 's-1', hunt_id: 'mosslight_glade', session: { bag: Object.entries(packed).map(([item, left]) => ({ item, left })) } } });
  const inTown = (name, role, slots, packed, equipment) => sess({ name, hunt_settings: barOf(role, slots), equipment, inventory: packed });
  const prepOf = (cs, id) => (readinessOf(cs).checks.find((c) => c.id === id) || {}).text;
  const beforeOf = (cs, id) => (beforeLines(cs).find((l) => l.id === id) || {}).text;
  const eat = (id) => slot('consume', id);
  const spellStore = (id, store) => ({ action: { type: 'ability', id, store }, conditions: [], join: 'and', usable: true });
  const shoot = (id) => slot('attack_with_item', id);
  const EDDIE = [[spellStore('flame_strike', 'plain_fire_rune'), spellStore('rend', 'plain_rupture_rune'), eat('cooked_swordfish'), eat('salted_swordfish'), eat('thin_carrot_juice')],
    { chalked_fire_rune: 7342, cooked_swordfish: 2000 }, { weapon: 'steel_hatchets', ammo: 'steel_whetstone' }];
  const FREMULON = [[shoot('loaded'), shoot('bronze_arrows'), shoot('barbed_arrows'), eat('cooked_swordfish'), eat('thin_carrot_juice')],
    { mithril_arrows: 27300, coarse_whetstone: 26340, bronze_arrows: 2600, cooked_swordfish: 150, cooked_shrimp: 25 }, { weapon: 'willow_longbow', ammo: 'steel_arrows' }];
  const FREMULON_SAYS = 'Ammo: no Steel Arrows left, then Bronze Arrows. They never run out. You carry 27,300 Mithril Arrows: put them on the bar to shoot them.';
  const want64 = [
    ['Eddie food', 'food', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], 'Food: 2,000 Swordfish Steak of yours, then Salted Swordfish from the store, 432 gp each'],
    ['Eddie drink', 'drink', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], 'Drink: Thin Carrot Juice from the store, 18 gp each'],
    ['Eddie ammo', 'ammo', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], undefined],
    ['Fremulon ammo', 'ammo', ['Fremulon', 'ranger', ...FREMULON], FREMULON_SAYS],
    /* the player's order stands: a store slot ahead of his own is said as what it is, the store first */
    ['store ahead of own', 'food', ['A', 'melee_dps', [eat('salted_shrimp'), eat('cooked_shrimp')], { cooked_shrimp: 5 }, { weapon: 'steel_hatchets' }], 'Food: Salted Shrimp from the store, 14 gp each, then 5 Cooked Shrimp of yours'],
    /* carried first, the worn ahead of the bar's, the store last, whatever the bar's order */
    ['the engine\'s order', 'ammo', ['A', 'ranger', [shoot('barbed_arrows')], { barbed_arrows: 5, iron_arrows: 3 }, { weapon: 'willow_longbow', ammo: 'iron_arrows' }], 'Ammo: 3 Iron Arrows of yours, loaded, then 5 Barbed Arrows of yours, then Plain Iron Arrows from the store, 1 gp each.'],
    /* a whetstone or a rune is no one's shot, and the free rung ends the line */
    ['no whetstone in the arrows', 'ammo', ['A', 'ranger', [shoot('loaded')], { coarse_whetstone: 30000, chalked_fire_rune: 40, bronze_arrows: 5 }, { weapon: 'willow_longbow', ammo: 'bronze_arrows' }], 'Ammo: Bronze Arrows loaded. They never run out.'],
    /* the worn slot empty, own stock behind: the store is reached only when it is gone, and idle stock is said beside it */
    ['store with stock idle', 'ammo', ['A', 'ranger', [], { mithril_arrows: 9 }, { weapon: 'willow_longbow', ammo: 'steel_arrows' }], 'Ammo: no Steel Arrows left, then Plain Steel Arrows from the store, 1 gp each. You carry 9 Mithril Arrows: put them on the bar to shoot them.'],
    /* a slot switched Off spends nothing */
    ['an Off slot', 'food', ['A', 'melee_dps', [Object.assign(eat('cooked_shrimp'), { enabled: false }), eat('salted_shrimp')], { cooked_shrimp: 5 }, { weapon: 'steel_hatchets' }], 'Food: Salted Shrimp from the store, 14 gp each. You carry 5 Cooked Shrimp. Put it on the bar to eat it'],
  ];
  /* every tier, every line: own stock counted, then its store row at the server's price */
  const KIND_64 = { heal: ['food', 'Food'], mana: ['drink', 'Drink'] };
  for (const b of BASIC_SUPPLIES) {
    if (KIND_64[b.kind]) want64.push(['tier ' + b.partner, KIND_64[b.kind][0], ['A', 'melee_dps', [eat(b.partner), eat(b.id)], { [b.partner]: 7 }, { weapon: 'steel_hatchets' }], KIND_64[b.kind][1] + ': 7 ' + nameOfItem(b.partner) + ' of yours, then ' + b.n + ' from the store, ' + b.price + ' gp each']);
    else if (!/_rune$/.test(b.id)) want64.push(['tier ' + b.partner, 'ammo', ['A', 'ranger', [shoot('loaded')], { [b.partner]: 7 }, { weapon: 'willow_longbow', ammo: b.partner }], 'Ammo: 7 ' + nameOfItem(b.partner) + ' of yours, loaded, then ' + b.n + ' from the store, ' + b.price + ' gp each.']);
    else {
      const spell = Object.values(SPELLS).find((a) => a.rune === b.partner);
      if (spell) want64.push(['tier ' + b.partner, 'rune', ['A', 'mage', [spellStore(spell.id, b.id)], { [b.partner]: 7 }, { weapon: 'practice_staff' }], 'Runes: 7 ' + runeWordsOf(spell.rune, 7) + ' of yours, then ' + b.n + ' from the store, ' + b.price + ' gp a cast']);
    }
  }
  for (const [what, id, args, text] of want64) {
    for (const [where, make] of [['in a hunt', inHunt], ['in town', inTown]]) {
      const cs = make(...args);
      if (prepOf(cs, id) !== text) fails.push('AW-64 ' + what + ' ' + where + ', Hunt prep reads ' + JSON.stringify(prepOf(cs, id)));
      if (beforeOf(cs, id) !== text) fails.push('AW-64 ' + what + ' ' + where + ', Before you go reads ' + JSON.stringify(beforeOf(cs, id)));
    }
  }
  /* AMMO THE HERO'S SKILL CAN'T USE YET (the engine passes over it, abilities.js shotLine): never said as what flies, never offered as a spare, and said why */
  const atRanged = (level) => (name, role, slots, packed, equipment) => sess({ name, hunt_settings: barOf(role, slots), equipment, inventory: packed, skills: { ranged: { xp: 1, level } } });
  const BOW = { weapon: 'willow_longbow' };
  for (const [what, level, args, text] of [
    ['a Mithril slot under its Ranged, Bronze behind it', 42, [[shoot('mithril_arrows'), shoot('bronze_arrows')], { mithril_arrows: 9, bronze_arrows: 5 }, BOW], 'Ammo: Bronze Arrows. They never run out. Mithril Arrows wait on your bar. Needs Ranged 45 (you have 42).'],
    ['the same bar at the level', 45, [[shoot('mithril_arrows'), shoot('bronze_arrows')], { mithril_arrows: 9, bronze_arrows: 5 }, BOW], 'Ammo: 9 Mithril Arrows of yours, then Bronze Arrows. They never run out.'],
    ['a stack under its Ranged no slot names', 42, [[], { mithril_arrows: 9 }, { weapon: 'willow_longbow', ammo: 'steel_arrows' }], 'Ammo: no Steel Arrows left, then Plain Steel Arrows from the store, 1 gp each.'],
    ['nothing else to shoot', 42, [[shoot('mithril_arrows')], { mithril_arrows: 9 }, BOW], 'Ammo: nothing loaded, so your weapon can\'t shoot and your hero won\'t attack. Press an empty slot on your bar, then Ammo, and pick a shot from the store. Mithril Arrows wait on your bar. Needs Ranged 45 (you have 42).'],
  ]) {
    const cs = atRanged(level)('A', 'ranger', ...args);
    if (beforeOf(cs, 'ammo') !== text) fails.push('AW-64 ' + what + ', Before you go reads ' + JSON.stringify(beforeOf(cs, 'ammo')));
    if (prepOf(cs, 'ammo') !== text) fails.push('AW-64 ' + what + ', Hunt prep reads ' + JSON.stringify(prepOf(cs, 'ammo')));
  }
  if (readinessLine(readinessOf(inHunt('Fremulon', 'ranger', ...FREMULON))) !== 'Fremulon: ready') fails.push('AW-64 Fremulon is not ready: ' + readinessLine(readinessOf(inHunt('Fremulon', 'ranger', ...FREMULON))));
  /* the slot's cost line says the same of the loaded ammo (Tyler 2026-11-08, "Yes, cost line only"): what one shot of the worn
     ammo costs, own first, then the store's, and no store behind a free arrow */
  const loadedSays = (worn, bag) => factsOfSlot({ type: 'attack_with_item', id: 'loaded' }, { store: LIVE, bag, worn, set: { role: 'ranger', supplySource: 'mine', onEmpty: 'switch' } }).cost;
  for (const [worn, bag, text] of [
    ['steel_arrows', [{ id: 'bronze_arrows', qty: 2600 }], 'Cost: 1 shot of Plain Steel Arrows (1 g)'],
    ['iron_arrows', [{ id: 'iron_arrows', qty: 9 }], 'Cost: 1 shot of Iron Arrows (you have 9)'],
    ['bronze_arrows', [{ id: 'bronze_arrows', qty: 2600 }], 'Cost: 1 shot of Bronze Arrows (they never run out)'],
  ]) if (loadedSays(worn, bag) !== text) fails.push('AW-64 the loaded slot on ' + worn + ' reads ' + JSON.stringify(loadedSays(worn, bag)));
  }
  /* AW-8 Hunt prep says HOW MUCH stamina, and in town the supply rate is the LAST hunt's (core-loop play 2026-10-30:
     "Stamina left" with no amount; "on this hunt" over a hero standing in Havora). */
  const an = { hero: { per_hour: { waste: 500 } } };
  const prepSaid = (ended) => readinessOf(sess({ hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended }, hunt_analyzer: an,
    stamina: { ms: 27000000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 } })).checks.filter((c) => c.id === 'stamina' || c.id === 'gold-now').map((c) => c.text).join(' | ');
  const prepWant = (which) => 'Stamina: 7 h 30 m left | Gold: 500 gp · supplies about 500 gp an hour on ' + which + ', about 1 h of gold';
  for (const [ended, which] of [[true, 'your last hunt'], [false, 'this hunt']]) {
    if (prepSaid(ended) !== prepWant(which)) fails.push('AW-8 Hunt prep ' + (ended ? 'in town' : 'mid-hunt') + ' reads ' + JSON.stringify(prepSaid(ended)));
  }
  const ops2 = (p) => JSON.stringify(Object.fromEntries(Object.entries(p.ops).sort(([a], [b]) => (a < b ? -1 : 1))));
  {
    const plan = (equipment, bag, skills = lv1, level = 5) => UP.upgradePlan({ equipment, bag: bag.map(([id, qty]) => ({ id, qty: qty || 1 })), skills, level });
    /* THE WEAPON, SAME FAMILY ONLY (designer 2026-11-03; blind panel: a sword hero wore the Practice Sword for 19 hunted hours over eight Iron Swords). A better one of its family goes on, the
       shield stays where it is, and the style and role never move: another family, another grip, empty hands and the off-hand are the player's choice. */
    const hands = plan({ weapon: 'bronze_sword' }, [['practice_shield'], ['ironbound_shield']], { melee: { level: 99 }, defense: { level: 99 } }, 30);
    if (Object.keys(hands.ops).length) fails.push('AW-21 Equip upgrades would put a shield on: ' + ops2(hands));
    const tank = plan({ weapon: 'practice_sword', shield: 'practice_shield' }, [['iron_sword', 8]], lv1, 15);
    if (ops2(tank) !== '{"weapon":"iron_sword"}' || UP.upgradeWords(tank) !== 'Wear Iron Sword (+3 Melee accuracy).') fails.push('AW-21 a sword-and-shield hero with Iron Swords at Level 15 reads ' + ops2(tank) + ' / ' + UP.upgradeWords(tank));
    if (Object.keys(plan({ weapon: 'practice_sword' }, [['iron_sword']], lv1, 14).ops).length) fails.push('AW-21 an Iron Sword goes on under its Level');
    /* A BANE IS A PLUS (designer re-read 2026-11-11: Level 16 in the Practice Sword with 6 Bramble Blades in the bag): the blade goes on and its preview names the bane, the
       engine's clamped number; a worn bane is never traded away for plain numbers, and the tooltip says what the bane is. */
    const bane = plan({ weapon: 'practice_sword', shield: 'practice_shield' }, [['bramble_blade', 6]], lv1, 16);
    if (ops2(bane) !== '{"weapon":"bramble_blade"}' || UP.upgradeWords(bane, 2, 3) !== 'Wear Bramble Blade (+2 Melee accuracy, +2 Melee damage, +40% damage to Plant monsters).') fails.push('AW-21 a sword hero with Bramble Blades at Level 16 reads ' + ops2(bane) + ' / ' + UP.upgradeWords(bane, 2, 3));
    if ('weapon' in plan({ weapon: 'bramble_blade' }, [['iron_sword']], lv1, 16).ops) fails.push('AW-21 Equip upgrades traded a worn bane away for plain numbers');
    /* A WORN BANE AGAINST A PLAIN STRONGER BLADE IS SAID, NEVER SWAPPED (designer small call 2, 2026-11-11): the slot is a choice and the line says the trade in the
       engine's numbers (Iron Sword +7/+6 over Bramble +6/+5, the bane's clamped +40%); a hand swap to the Iron Sword sticks, since the Bramble does not dominate it. */
    const kept = plan({ weapon: 'bramble_blade', shield: 'practice_shield' }, [['iron_sword', 3]], lv1, 16);
    if (ops2(kept) !== '{}' || JSON.stringify(kept.choices) !== '[{"slot":"weapon","ids":["iron_sword"],"keeps":"bramble_blade","lost":[{"cls":"plant","pct":40}]}]'
      || UP.upgradeWords(kept) !== 'Nothing goes on by itself, since each piece is better at something. Iron Sword hits harder, Bramble Blade does +40% damage to Plant monsters. Pick on the doll.')
      fails.push('AW-21 a worn Bramble Blade with Iron Swords in the bag reads ' + ops2(kept) + ' / ' + JSON.stringify(kept.choices) + ' / ' + UP.upgradeWords(kept));
    const swapped = plan({ weapon: 'iron_sword', shield: 'practice_shield' }, [['bramble_blade', 6]], lv1, 16);
    if (ops2(swapped) !== '{}' || swapped.choices.length || UP.upgradeWords(swapped) !== '') fails.push('AW-21 a hand swap to the Iron Sword does not stick: ' + ops2(swapped) + ' / ' + JSON.stringify(swapped.choices));
    if ((await imp('src/shell/item-lore.js')).baneWords('bramble_blade').join() !== '+40% damage to Plant monsters') fails.push('AW-21 the Bramble Blade tooltip bane reads ' + (await imp('src/shell/item-lore.js')).baneWords('bramble_blade'));
    const steelOverIron = plan({ weapon: 'practice_sword' }, [['iron_sword'], ['steel_sword']], lv1, 30);
    if (ops2(steelOverIron) !== '{"weapon":"steel_sword"}') fails.push('AW-21 of two better swords it would put on ' + ops2(steelOverIron));
    const LADDER = (await imp('src/data/style-gear.js')).STYLE_LADDER;
    for (const [family, row] of Object.entries(LADDER)) {
      if (family === 'spellbook') continue;
      const got = plan({ weapon: row.practice }, [[row.rungs[0]]], lv1, 15);
      if (ops2(got) !== JSON.stringify({ weapon: row.rungs[0] })) fails.push('AW-21 the ' + family + ' ladder: Level 15 with ' + row.rungs[0] + ' would put on ' + ops2(got));
    }
    /* Never another style, whatever it is worth: [worn, better in the bag], each a different family or grip */
    for (const [wornW, other] of [['practice_sword', 'iron_warhammer'], ['practice_sword', 'iron_hatchets'], ['practice_sword', 'longbow'], ['practice_sword', 'oak_wand'], ['practice_club', 'iron_hatchets'],
      ['practice_bow', 'oak_crossbow'], ['practice_crossbow', 'longbow'], ['practice_wand', 'oak_staff'], ['practice_staff', 'oak_wand']]) {
      const got = plan({ weapon: wornW }, [[other]], lv1, 15);
      if ('weapon' in got.ops) fails.push('AW-21 Equip upgrades would change the style: ' + wornW + ' to ' + got.ops.weapon);
    }
    if (Object.keys(plan({}, [['iron_sword']], lv1, 15).ops).length) fails.push('AW-21 Equip upgrades would put a weapon in empty hands');
    /* the club's own climb: the reforge beats the kit from its Level, the Iron Warhammer beats the reforge from its own */
    if (ops2(plan({ weapon: 'practice_club' }, [['klappas_club']], lv1, 5)) !== '{"weapon":"klappas_club"}' || Object.keys(plan({ weapon: 'practice_club' }, [['klappas_club']], lv1, 4).ops).length
      || ops2(plan({ weapon: 'klappas_club' }, [['iron_warhammer']], lv1, 15)) !== '{"weapon":"iron_warhammer"}' || Object.keys(plan({ weapon: 'iron_warhammer' }, [['klappas_club']], lv1, 15).ops).length) fails.push('AW-21 the club\'s climb is broken');
    /* A RING'S PERKS ARE WORTH WEARING (Andy, live 2026-11-09: a plain Banded Signet stayed on Ring 2 beside a perked ring, over a perked one in the bag). A perk plays once (combat.js
       jewelPerksOf), so a second ring of a worn perk adds nothing; Keen against Surge trades off, so it is never a silent swap, and both over a plain ring are the player's pick. */
    const rings = (ring1, ring2, bag) => plan({ weapon: 'practice_sword', ring1, ring2 }, bag.map((id) => [id]), lv1, 20);
    const follow = rings('banded_signet_keen', 'banded_signet', ['banded_signet_follow']);
    /* the ring's name says its perk, so the line names the piece only; a perk a name does not say is said in a few words */
    const unsaid = { picks: follow.picks.map((p) => ({ ...p, id: 'banded_signet' })), choices: [] };
    if (ops2(follow) !== '{"ring2":"banded_signet_follow"}' || UP.upgradeWords(follow) !== 'Wear Banded Signet (Follow-through).' || UP.upgradeWords(unsaid) !== 'Wear Banded Signet (adds Follow-through).')
      fails.push('AW-21 a Follow-through ring in the bag beside a worn Keen ring reads ' + ops2(follow) + ' / ' + UP.upgradeWords(follow) + ' / ' + UP.upgradeWords(unsaid));
    /* a perked ring that also adds a number keeps ONE bracket (voice lane 2026-11-09: "(Follow-through) (+1 Melee accuracy)" read wrong) */
    const both = { picks: follow.picks.map((p) => ({ ...p, gains: [{ label: 'Melee accuracy', text: '+1 Melee accuracy' }, ...p.gains] })), choices: [] };
    if (UP.upgradeWords(both) !== 'Wear Banded Signet (Follow-through, +1 Melee accuracy).') fails.push('AW-21 a perked ring that adds a number reads ' + UP.upgradeWords(both));
    if (Object.keys(rings('banded_signet_follow', 'banded_signet', ['banded_signet_follow']).ops).length) fails.push('AW-21 a second Follow-through ring goes on, though a perk plays once');
    if (Object.keys(rings('banded_signet_follow', 'banded_signet_keen', ['banded_signet_surge']).ops).length) fails.push('AW-21 a Surge ring silently takes a Keen ring\'s place');
    const pick = rings('banded_signet_follow', 'banded_signet', ['banded_signet_keen', 'banded_signet_surge']);
    if (ops2(pick) !== '{}' || JSON.stringify(pick.choices) !== '[{"slot":"ring2","ids":["banded_signet_keen","banded_signet_surge"]}]'
      || UP.upgradeWords(pick) !== 'Nothing goes on by itself, since each piece is better at something. Ring 2: Banded Signet (Keen) or Banded Signet (Surge). Pick on the doll.')
      fails.push('AW-21 Keen and Surge rings over a plain one read ' + ops2(pick) + ' / ' + JSON.stringify(pick.choices) + ' / ' + UP.upgradeWords(pick));
  }
  /* A tie between armor weights goes to the weight the hero chose at Tamsin's (playtest 2026-10-29: a tank paid in
     heavy came home from the Thicket with a Bronze Platebody and a Leather Body and wore neither). No weight known: the
     tie stands. None of that weight in the bag for a BARE slot: the piece that guards most goes on (played 2026-11-04). */
  const found = [['bronze_platebody'], ['leather_body'], ['bronze_boots'], ['leather_boots']].map(([id]) => ({ id, qty: 1 }));
  const kit = { weapon: 'practice_sword', shield: 'practice_shield' };
  const tieOf = (prefer) => UP.upgradePlan({ equipment: kit, bag: found, skills: lv1, level: 5, prefer });
  const tieOps = ['', 'heavy', 'medium', 'light'].map((w) => ops2(tieOf(w || null)) + '/' + tieOf(w || null).choices.length).join(' | ');
  if (tieOps !== '{}/2 | {"body":"bronze_platebody","boots":"bronze_boots"}/0 | {"body":"leather_body","boots":"leather_boots"}/0 | {"body":"bronze_platebody","boots":"bronze_boots"}/0')
    fails.push('AW-21 the weight chosen at Tamsin\'s settles a tie as ' + tieOps);
  /* NO HERO STAYS BARE FOR WANT OF A CHOICE (played 2026-11-04: Marlow fought a night in nothing over 140 pieces; Sorrel, a hammer, was bare at hour 16): her pick, else what the hero wears most, else its role's. */
  const weightIs = [['medium', { weapon: 'practice_sword', body: 'bronze_platebody' }, 'tank', 'medium'], [null, { weapon: 'practice_sword', body: 'leather_body', boots: 'leather_boots' }, 'tank', 'medium'], [null, kit, 'melee_dps', 'heavy'], [null, kit, 'ranger', 'medium'], [null, kit, 'healer', 'light'], [null, kit, null, null]];
  for (const [chosen, worn, role, want] of weightIs) if (UP.preferredWeight(chosen, worn, role) !== want) fails.push('AW-21 chosen ' + chosen + ', role ' + role + ' prefers ' + UP.preferredWeight(chosen, worn, role) + ', wanted ' + want);
  /* the window reads it: a hammer hero, no pick at Tamsin's, with one of each helmet */
  const { upgradeOf } = await imp('src/shell/widgets/upgrade-line.js');
  const bare = { state: { level_xp: 200 }, level: levelBlock(200), inventory: { bronze_helm: 1, leather_helmet: 1 }, equipment: { weapon: 'practice_club' }, hunt_settings: { preset: 0, role: 'melee_dps', slots: [] }, skills: { melee: { xp: 0, level: 1 }, defense: { xp: 0, level: 1 } } };
  if (upgradeOf({ read: (k) => bare[k] }).ops.helmet !== 'bronze_helm') fails.push('AW-21 a hammer hero with no pick would put on ' + JSON.stringify(upgradeOf({ read: (k) => bare[k] }).ops));
  /* a worn slot's tie is still the player's: a heavy hero in Leather Boots isn't moved off them */
  if (UP.upgradePlan({ equipment: { ...kit, boots: 'leather_boots' }, bag: [{ id: 'bronze_boots', qty: 1 }], skills: lv1, level: 5, prefer: 'heavy' }).ops.boots) fails.push('AW-21 Equip upgrades took off a piece of another weight');
  /* A TIER STEP (designer ruling 2026-10-31, played: Marlow, Level 16 in a full Bronze plate set, wore none of ten Iron
     Platebodies, since each one alone broke the set's +1% critical chance): the next tier of the worn weight goes on, and
     the line names the set bonus it ends. */
  const bronzeSet = { weapon: 'bronze_sword', helmet: 'bronze_helm', body: 'bronze_platebody', pants: 'bronze_platelegs', boots: 'bronze_boots', belt: 'bronze_belt' };
  const stepOf = (equipment, ids) => UP.upgradePlan({ equipment, bag: ids.map((id) => ({ id, qty: 1 })), skills: lv1, level: 16 });
  const step = stepOf(bronzeSet, ['iron_platebody', 'iron_platelegs', 'iron_helm']);
  if (ops2(step) !== '{"body":"iron_platebody","helmet":"iron_helm","pants":"iron_platelegs"}' || !UP.upgradeWords(step).endsWith('Your full set\'s +1% critical chance ends.'))
    fails.push('AW-21 a full Bronze set at Level 16 would put on ' + ops2(step) + ': ' + UP.upgradeWords(step));
  if (/critical chance ends/.test(UP.upgradeWords(stepOf({ weapon: 'bronze_sword', body: 'bronze_platebody' }, ['iron_platebody'])))) fails.push('AW-21 a step that ends no set says it ends one');
  /* A tie that stands says why the button is off (playtest 2026-10-29 #11: the line was hidden, nothing said). */
  const tieSaid = UP.upgradeWords(tieOf(null));
  if (tieSaid !== 'Nothing goes on by itself, since each piece is better at something. Body: Bronze Platebody or Leather Body. Boots: Bronze Boots or Leather Boots. Pick on the doll, or pick an armor weight at Tamsin\'s.')
    fails.push('AW-21 a standing tie reads ' + JSON.stringify(tieSaid));
  /* "Decide once": the shop's section bids only on what the bag holds, so a stack sold since (0 in the bag) is never
     called unsellable (playtest 2026-10-29: the coach rang a Sell its row had switched off). */
  const { planBlock } = await imp('src/shell/loot-dispatch.js');
  const noBid = new Map([['bones', 1]]);
  const planSaid = [planBlock('rat_tail', 'sell', noBid, false), planBlock('rat_tail', 'sell', noBid, true), planBlock('rat_tail', 'sell', noBid),
    planBlock('practice_bow', 'sell', noBid, false)].join('|');
  if (planSaid !== '|The shop does not buy this.|The shop does not buy this.|The shop does not buy back your starting kit.') fails.push('AW-21 a loot plan off for a stack not held reads ' + JSON.stringify(planSaid));
  /* AW-70 SELL SPARE GEAR (designer 2026-11-03; optimizer panel, its quit moment: "sell-all, hand-sell 17-20 armor stacks" each return). One sale with its total first: what the hero has outgrown,
     of any weight or family; never what Equip upgrades wants, an empty slot's piece, a higher tier than worn, a Rare, the start kit, what the bench made from the kit (nothing sells another), or a stack locked or planned Keep or Deposit. */
  const { spareSale } = await imp('src/shell/bag-model.js');
  const FACTS = await imp('src/shell/hunt-ground-facts.js');
  const IRON = { weapon: 'iron_sword', shield: 'ironbound_shield', helmet: 'iron_helm', body: 'iron_platebody', pants: 'iron_platelegs', boots: 'iron_boots', gloves: 'leather_gloves', belt: 'bronze_belt',
    ring1: 'copper_ring', ring2: 'copper_ring', necklace: 'hunter_necklace', earrings: 'copper_studs', cape: 'traveler_cape' };
  const stack = (ids) => ids.map((id) => ({ id, qty: 3 }));
  const bidsOn = (rows) => ({ bids: new Map(rows.map((r) => [r.id, 10])) });
  const rulesAre = (loot, locked) => ({ loot: loot || {}, locked: new Set(locked || []) });
  const spareIds = (rows, worn, rules, o) => spareSale(rows, worn, rules || rulesAre(), bidsOn(rows), { isRare: FACTS.isRareOnly, ...(o || {}) }).lines.map((l) => l.item).sort().join();
  /* (the Iron Helm and the Longbow are Rare somewhere and everyday elsewhere, so they are spare; the Iron Warhammer drops only as a Rare, so it is not) */
  const OUTGROWN = ['bronze_helm', 'bronze_platelegs', 'iron_helm', 'studded_helmet', 'adept_pants', 'leather_boots', 'longbow'];
  if (spareIds(stack(OUTGROWN), IRON) !== OUTGROWN.slice().sort().join()) fails.push('AW-70 an Iron hero\'s outgrown stacks read ' + spareIds(stack(OUTGROWN), IRON));
  for (const [what, id, rows, worn, rules, o] of [
    ['a higher tier of another weight', 'boarhide_body', null, IRON],
    ['a higher tier of its own slot', 'steel_platebody', null, IRON],
    ['a piece for an empty slot', 'bronze_helm', null, { ...IRON, helmet: null }],
    ['a Rare', 'houndskin_cloak', null, { ...IRON, cape: 'trollhide_cape' }],
    ['a Rare of a lower tier', 'iron_warhammer', null, { ...IRON, weapon: 'steel_sword' }],
    ['the start kit', 'practice_club', null, IRON],
    ['the Practice Club with Klappa\'s Club in hand', 'practice_club', null, { ...IRON, weapon: 'klappas_club' }],
    ['Klappa\'s Club, another family in hand', 'klappas_club', null, IRON],
    ['Klappa\'s Club, a Tier 1 sword in hand', 'klappas_club', null, { ...IRON, weapon: 'practice_sword' }],
    ['Klappa\'s Club, outgrown by its own family', 'klappas_club', null, { ...IRON, weapon: 'iron_warhammer' }],
    ['a locked stack', 'bronze_helm', null, IRON, rulesAre({}, ['bronze_helm'])],
    ['a stack planned Keep', 'bronze_helm', null, IRON, rulesAre({ bronze_helm: 'keep' })],
    ['a stack planned Deposit', 'bronze_helm', null, IRON, rulesAre({ bronze_helm: 'deposit' })],
    ['what Equip upgrades wants', 'bronze_helm', null, IRON, null, { wanted: new Set(['bronze_helm']) }],
    ['a potato, not gear', 'rat_tail', null, IRON],
  ]) if (spareIds(stack([id]), worn, rules, o)) fails.push('AW-70 Sell spare gear would sell ' + what + ': ' + id);
  const clubs = stack(['practice_club', 'klappas_club']);
  const { lootSale, madeFromKit } = await imp('src/shell/bag-model.js');
  if (lootSale(clubs, rulesAre(), bidsOn(clubs), null).lines.length) fails.push('AW-70 Sell all junk would sell a club: ' + JSON.stringify(lootSale(clubs, rulesAre(), bidsOn(clubs), null).lines));
  if (madeFromKit('klappas_club') !== 'practice_club' || madeFromKit('cooked_shrimp') || madeFromKit('bronze_helm')) fails.push('AW-70 made from the kit reads ' + [madeFromKit('klappas_club'), madeFromKit('cooked_shrimp'), madeFromKit('bronze_helm')].join());
  const saleWords = (await imp('src/shell/item-lore.js')).rareSaleWords;
  if (saleWords([{ item: 'klappas_club', qty: 1 }]) !== 'Nothing sells the Practice Club that makes another Klappa\'s Club.' || saleWords([{ item: 'bronze_helm', qty: 3 }])) fails.push('AW-70 a hand sale of the club says ' + JSON.stringify(saleWords([{ item: 'klappas_club', qty: 1 }])));
  const big = spareSale(stack(Array.from({ length: 70 }, () => 'bronze_helm')), IRON, rulesAre(), { bids: new Map([['bronze_helm', 10]]) }, {});
  if (big.lines.length !== 64 || big.total !== 64 * 3 * 10 || !big.capped) fails.push('AW-70 past the engine\'s 64 lines a sale reads ' + big.lines.length + ' lines, ' + big.total + ' gp');
  /* AW-65 CARRY IN (Tyler 2026-11-02, "Yes, add a press"; Andy: supplies that reached the bag mid-hunt sat unused): while the
     hunt runs and is not on its way home, every hunt supply in the BAG is a row with the server's two counts, what the bar
     spends first (a rune spell spends every tier of its family); never gear or loot; none in town, on the way home or once it
     ended. A struck slot whose stock waits in the bag says so and that a press on the slot carries it in. */
  {
    const { carryRows, carryFor, carryWords } = await imp('src/shell/carry-in.js');
    const { reasonOf } = await imp('src/shell/action-facts.js');
    const spell = { action: { type: 'ability', id: 'fireball' }, conditions: [], join: 'and', usable: false };
    const bar = [Object.assign(slot('consume', 'cooked_shrimp', 0), { usable: false, why: 'none_left' }), spell];
    const BAG = { rat_tail: 9, bronze_sword: 1, wheat_bread: 300, cooked_shrimp: 40, scored_fire_rune: 2, chalked_fire_rune: 12 };
    const hunting = (session, inv = BAG) => sess({ hunt_settings: { preset: 0, presets: [], slots: bar, store: STORE, discipline: 'destruction' }, inventory: inv,
      hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: false, session } });
    const open = { bag: [{ item: 'wheat_bread', left: 5, loaded: 5 }, { item: 'cooked_shrimp', left: 0, loaded: 3 }] };
    const said = (rows) => (rows ? rows.map((r) => r.id + ':' + r.have + '/' + r.inHunt + (r.named ? '*' : '')).join(' ') : String(rows));
    const want65 = 'cooked_shrimp:40/0* chalked_fire_rune:12/0* scored_fire_rune:2/0* wheat_bread:300/5';
    if (said(carryRows(hunting(open))) !== want65) fails.push('AW-65 a running hunt offers ' + said(carryRows(hunting(open))) + ', want ' + want65);
    for (const [what, cs] of [['in town', sess({ inventory: BAG })], ['on the way home', hunting(Object.assign({ leave_at: '2026-11-02T12:00:00Z' }, open))],
      ['once it ended', sess({ inventory: BAG, hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: true, session: open } })], ['with no session read', hunting(undefined)]]) {
      if (carryRows(cs) !== null) fails.push('AW-65 ' + what + ' a hunt offers to carry ' + said(carryRows(cs)));
    }
    const fire = carryFor(hunting(open), spell.action);
    if (said(fire) !== 'chalked_fire_rune:12/0* scored_fire_rune:2/0*') fails.push('AW-65 Fireball\'s slot offers ' + said(fire));
    /* the bar's "loaded" shot spends the WORN ammo (the server's equipment): its stack in the bag is the slot's to carry */
    const loaded = { type: 'attack_with_item', id: 'loaded' };
    const ranger = sess({ hunt_settings: { preset: 0, presets: [], role: 'ranger', slots: [{ action: loaded, conditions: [], join: 'and', usable: true }], store: STORE },
      equipment: { weapon: 'willow_longbow', ammo: 'steel_arrows' }, inventory: { steel_arrows: 500, iron_arrows: 9 },
      hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: false, session: { bag: [] } } });
    if (said(carryFor(ranger, loaded)) !== 'steel_arrows:500/0*' || said(carryRows(ranger)) !== 'steel_arrows:500/0* iron_arrows:9/0')
      fails.push('AW-65 the loaded shot on Steel Arrows offers ' + said(carryFor(ranger, loaded)) + ' of ' + said(carryRows(ranger)));
    if (carryWords({ max: 40 }) !== 'Carry 40 into this hunt' || carryWords({ max: 100000 }) !== 'Carry 100,000 into this hunt') fails.push('AW-65 the press reads ' + carryWords({ max: 40 }));
    const big = carryRows(hunting(open, { cooked_shrimp: 250000 }));
    if (!big || big[0].max !== 100000 || big[0].have !== 250000) fails.push('AW-65 a stack past one carry offers ' + JSON.stringify(big));
    const pack = carryRows(hunting(open));
    const food = reasonOf(bar[0], { slots: bar, store: STORE }, [], null, null, null, pack);
    if (!food || !food.strike || food.text !== 'You have none in this hunt, and 40 Cooked Shrimp wait in your backpack. Press this slot to carry them in.') fails.push('AW-65 the struck food slot reads ' + JSON.stringify(food));
    const rune = reasonOf(spell, { slots: bar, store: STORE, discipline: 'destruction', supplySource: 'mine', onEmpty: 'end' }, [], null, null, null, pack);
    if (!rune || rune.text !== 'Each cast uses a Fire rune. You have none in this hunt, and 14 wait in your backpack. Press this slot to carry them in.') fails.push('AW-65 the struck rune spell reads ' + JSON.stringify(rune));
    /* RUNE-TRUTH (2027-02-21-hunt-carry-in.sql): the server struck a spell whose runes are all above the hero's level: the slot says that, not "the server says". */
    const locked = reasonOf({ ...spell, usable: false, why: 'rune_level' }, { slots: bar, store: STORE, discipline: 'destruction', supplySource: 'mine', onEmpty: 'end' }, [{ id: 'graven_fire_rune', qty: 2 }], null, null, null, null);
    if (!locked || locked.code !== 'rune_level' || !locked.strike || !/^You can’t cast with your Fire runes yet\./.test(locked.text)) fails.push('AW-65 a spell whose runes are above the level reads ' + JSON.stringify(locked));
    /* THE RUNE LADDER (2027-03-08-rune-ladder-slots.sql): a store rune above the hero's level says which rune and what it needs, not "the server says". */
    const SCORED = STORE.concat([{ ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_scored_fire_rune', partner: 'scored_fire_rune', price: 8 }]);
    const over = reasonOf({ ...spell, action: { ...spell.action, store: 'plain_scored_fire_rune' }, usable: false, why: 'store_level' }, { slots: bar, store: SCORED, discipline: 'destruction', supplySource: 'mine', onEmpty: 'switch' }, [], null, null, { magic: { xp: 1, level: 14 } }, null);
    if (!over || over.code !== 'store_level' || !over.strike || !/^Scored Fire Rune needs Magic 15\. This slot waits until then/.test(over.text)) fails.push('AW-65 a store rune above the level reads ' + JSON.stringify(over));
    /* ...and a slot the server calls ready is not struck by the browser, whatever the backpack says (the hunt bag holds its runes). */
    const ready = reasonOf({ ...spell, usable: true }, { slots: bar, store: STORE, discipline: 'destruction', supplySource: 'mine', onEmpty: 'end' }, [{ id: 'chalked_fire_rune', qty: 2 }], null, null, null, []);
    if (ready) fails.push('AW-65 a spell with runes in the hunt bag and none in the backpack reads ' + JSON.stringify(ready));
    /* A SHOT WAITING FOR ITS LEVEL, its stack in the backpack (lane/b-rulings-1102's wait meets the press): the press still carries it,
       every carry line says it can't be shot yet, and the bar's reason stays the wait: it never offers the carry as what makes the slot fire. */
    const waitSlot = { action: { type: 'attack_with_item', id: 'mithril_arrows' }, conditions: [], join: 'and', usable: true };
    const archer = (lv) => sess({ hunt_settings: { preset: 0, presets: [], role: 'ranger', slots: [waitSlot], store: STORE }, skills: { ranged: { xp: 1, level: lv } },
      equipment: { weapon: 'willow_longbow' }, inventory: { mithril_arrows: 40 }, hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended: false, session: { bag: [] } } });
    const shotSet = { slots: [waitSlot], store: STORE, role: 'ranger', supplySource: 'mine', onEmpty: 'end' };
    const [under] = carryFor(archer(42), waitSlot.action) || [];
    if (!under || under.id !== 'mithril_arrows' || under.max !== 40 || under.wait !== 'Needs Ranged 45 (you have 42), so it can’t be shot until then.') fails.push('AW-65 a shot waiting for its level offers ' + JSON.stringify(under));
    const waits = reasonOf(waitSlot, shotSet, [], null, null, { ranged: { xp: 1, level: 42 } }, carryRows(archer(42)));
    if (!waits || waits.code !== 'skill' || !waits.strike || waits.text !== 'Needs Ranged 45 (you have 42). This slot waits until then, and your next ammo fires.') fails.push('AW-65 a waiting shot with its stack in the backpack reads ' + JSON.stringify(waits));
    const [atLevel] = carryFor(archer(45), waitSlot.action) || [];
    if (!atLevel || atLevel.wait !== null) fails.push('AW-65 a shot at its level still says it waits: ' + JSON.stringify(atLevel));
    const woke = reasonOf(waitSlot, shotSet, [], null, null, { ranged: { xp: 1, level: 45 } }, carryRows(archer(45)));
    if (!woke || woke.code !== 'stock' || woke.text !== 'You have none in this hunt, and 40 Mithril Arrows wait in your backpack. Press this slot to carry them in.') fails.push('AW-65 at its level the shot in the backpack reads ' + JSON.stringify(woke));
    const none = reasonOf(bar[0], { slots: bar, store: STORE }, [], null, null, null, null);
    if (!none || none.text !== 'You’re out of Cooked Shrimp. Your next food or drink slot takes over.') fails.push('AW-65 with nothing in the bag the food slot reads ' + JSON.stringify(none));
  }
  return fails;
}

async function armourWordRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  /* AW-34 PURE: every armor piece's tooltip names its weight and its share, read off the rules; a cape or shield none; the
     new-player path (Tamsin's card, where the hero first picks a weight) and the Help note say all three weights. */
  const AW = await imp('src/data/armour-weights.js');
  const { VITALS, ARMOUR_WEIGHT, ARMOUR_SLOTS } = await imp('src/data/core-model.js');
  const { ITEMS } = await imp('src/data/items.js');
  const pc = (pm) => '+' + Math.floor(pm) / 10 + '%';
  const FULL = { heavy: ['max HP', VITALS.heavyHpPermille], light: ['max mana', VITALS.lightManaPermille] };
  for (const [id, it] of Object.entries(ITEMS)) {
    const w = it.slot ? ARMOUR_WEIGHT[it.armourClass] : null;
    const pw = AW.pieceWords(id);
    if (!w) { if (pw) fails.push('AW-34 ' + id + ' (no armor weight) gets a weight line'); continue; }
    const f = FULL[w];
    const ok = pw && pw.head.toLowerCase() === w + ' armor'
      && (f ? pw.text.includes(pc(f[1] / ARMOUR_SLOTS.length) + ' ' + f[0] + ', of the ' + pc(f[1]) + ' a full ' + w + ' set') : /no HP or mana/.test(pw.text) && /miss/.test(pw.text));
    if (!ok) { fails.push('AW-34 ' + id + ' (' + w + ') tooltip weight line reads ' + JSON.stringify(pw)); break; }
  }
  const wornW = AW.wornWeights({ helmet: 'iron_helm', body: 'bronze_platebody', boots: 'leather_boots', pants: 'apprentice_pants', cape: Object.keys(ITEMS).find((k) => ITEMS[k].slot === 'cape'), weapon: 'iron_sword' });
  if (wornW.map((x) => x.text).join(' · ') !== '2 heavy (' + pc(VITALS.heavyHpPermille * 2 / ARMOUR_SLOTS.length) + ' max HP) · 1 medium (more blows miss) · 1 light (' + pc(VITALS.lightManaPermille / ARMOUR_SLOTS.length) + ' max mana)')
    fails.push('AW-34 the worn-weight line for 2 plate, 1 leather, 1 cloth and a cape reads ' + JSON.stringify(wornW));
  /* Nothing worn: one plain line, never "0 heavy (+0% max HP)" beside a plate sprite (blind playtest 2026-10-31); a weight with no piece says nothing. */
  const wornNone = AW.wornWeights({ weapon: 'iron_sword' }).map((x) => x.text).join('|');
  if (wornNone !== 'None yet. Your outfit is only a look.||') fails.push('AW-34 the worn-weight line with no armor reads ' + JSON.stringify(wornNone));
  const wornOne = AW.wornWeights({ helmet: 'iron_helm' }).map((x) => x.text).filter(Boolean);
  if (wornOne.length !== 1 || !/^1 heavy \(/.test(wornOne[0])) fails.push('AW-34 one heavy piece reads ' + JSON.stringify(wornOne));
  /* the share the words say is the one the engine adds: vitals.js maxHpFor / maxManaFor at every count (L 100) */
  const { maxHpFor, maxManaFor } = await imp('src/core/vitals.js');
  for (let n = 0; n <= ARMOUR_SLOTS.length; n++) {
    const hp = Math.floor(((VITALS.hpBase + VITALS.hpPerLevel * 99) * (1000 + Math.floor((VITALS.heavyHpPermille * n) / ARMOUR_SLOTS.length))) / 1000);
    const mp = Math.floor(((VITALS.manaBase + VITALS.manaPerLevel * 99) * (1000 + Math.floor((VITALS.lightManaPermille * n) / ARMOUR_SLOTS.length))) / 1000);
    if (maxHpFor(100, n) !== hp || maxManaFor(100, n) !== mp) { fails.push('AW-34 vitals.js no longer adds the share the armor words say (' + n + ' pieces)'); break; }
  }
  const { HUNT_TUTORIAL, cardFor } = await imp('src/data/hunt-tutorial.js');
  const { HELP_NOTES } = await imp('src/data/how-to-play.js');
  const tamStep = HUNT_TUTORIAL.find((st) => st.id === 'tamsins_task') || {};
  /* both the card as written and as the coach says it to a hero (cardFor: the role's advice) */
  /* What each weight gives is said beside the picker: her window's line and each button's title, off the same sentences (the card is the way, in three lines). */
  const tallySrc = readFileSync(join(base, 'src/shell/windows/tally.js'), 'utf8');
  if (!tallySrc.includes("WEIGHT_ORDER.map(weightSentence).join(' ')") || !tallySrc.includes('title="\' + esc(weightSentence(w))')) fails.push('AW-34 her window no longer says what each weight gives');
  if (!/armor weight/.test(tamStep.text || '') || !/armor weight/.test((cardFor(tamStep, { role: 'mage' }) || {}).text || '')) fails.push('AW-34 the tally card no longer asks for a weight');
  const help = (HELP_NOTES.find((n) => n.id === 'armour') || {}).text || '';
  for (const w of AW.WEIGHT_ORDER) {
    if (!help.includes(AW.weightSentence(w))) fails.push('AW-34 the Help note does not say what ' + w + ' armor gives');
  }
  return fails;
}

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
  const SKILLS = { woodcutting: { xp: 1500, level: 12 }, mining: { xp: 800, level: 8 }, smithing: { xp: 0, level: 1 }, inner_flame: { xp: 120, level: 2 },
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
  /* The row under the line says the same number; a row that is not running keeps the server's (blind playtest 2026-10-31: "2 caught so far · 0 in your bag"). */
  const rowWords = [TW.gatherBagWords(cs1, TW.workOf(cs1), true), TW.gatherBagWords(cs1, TW.workOf(cs1), false)].join('|');
  if (rowWords !== '42 in your bag|40 in your bag') fails.push('TK-1 the gathering row reads ' + rowWords + ', want 42 running and 40 stopped');

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
  const bury = TW.workRow('artisan', 'fuel_bones');
  const bstep = TW.actionMs(hero(envOf('artisan', 'fuel_bones', {})), bury);
  const csb = hero(envOf('artisan', 'fuel_bones', { bones: 8 }));
  csb.clock = T0 + 3 * bstep + 100;
  const b3 = TW.tickOf(csb);
  csb.clock = T0 + 20 * bstep;
  const ball = TW.tickOf(csb);
  const csl = hero(envOf('artisan', 'fuel_bones', { bones: 8 }, { bench_run: { left: 2 } }));
  csl.clock = T0 + 20 * bstep;
  const bleft = TW.tickOf(csl);
  const bline = TK.lineText(buryParts(csb));
  if (!b3 || b3.items.bones !== -3 || TK.aheadXp(b3, 'inner_flame') !== 3 * TW.xpEach(bury) || !ball || ball.items.bones !== -8 || !bleft || bleft.items.bones !== -2 || !/^Fueling the Great Hearth with Bones: 0 Bones left\./.test(bline))
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
  const perks = { gatherSpeed: 0.2, smithSpeed: 0.2, flameSpeed: 0.2, cookSpeed: 0.2, runeSpeed: 0.2, allXP: 0.1, craftSave: 0.3, yield_smithing: 0.2, noBurn: 0.1 };
  const bonus = (k) => perks[k] || 0;
  /* The best axe there is: its speed, its XP and its double-yield carry (the server's carry starts at 0.7, the ticker's at 0). */
  const axe = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'tool' && ITEMS[k].toolSkill === 'woodcutting').sort((a, b) => (ITEMS[b].toolTier || 0) - (ITEMS[a].toolTier || 0))[0];
  const cases = [['gather', 'normal_tree', { normal_log: 3 }], ['gather', 'normal_tree', { [axe]: 1 }], ['gather', 'rich_coal_rock', {}], ['artisan', 'smelt_bronze', { copper_ore: 40 }],
    ['artisan', 'fuel_bones', { bones: 50 }], ['artisan', 'cook_shrimp', { shrimp: 30 }]];
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

/* A mutant needs ONE named red rule, the same rule verdict() reads first: the run stops there instead of walking every
   rule to the end (each browser mutant cost a whole suite, ~154 s, on run 41339988105). A HARNESS line does not stop it,
   so a later named rule still judges exactly as before. The clean control and the plain run see every rule. */
const STOP = Symbol('first red');
async function checks(overrides, shots, { stopAtFirst = false } = {}) {
  const fails = overrides ? [] : await pure();
  if (stopAtFirst) fails.push = function (...a) { Array.prototype.push.apply(this, a); if (a.some((x) => ruleOf(x))) throw STOP; return this.length; };
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
  /* mutant-rules-start */
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
        /* AW-34 ARMOR WEIGHTS (Tyler 2026-10-25): the doll's worn-weight line counts the SERVER's equipment by the server's
           own sum (vitals.js maxHpFor), and the worn piece's tooltip names its weight and its share. */
        const { VITALS, ARMOUR_SLOTS } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href);
        const share = (pm, n) => '+' + Math.floor((pm * n) / ARMOUR_SLOTS.length) / 10 + '%';
        const weightsLine = () => page.evaluate(() => { const p = document.querySelector('.hw-weights'); return p && p.classList.contains('is-on') ? Array.from(p.querySelectorAll('span')).map((x) => x.textContent).join(' · ') : null; });
        Object.assign(s.env.equipment, { helmet: 'iron_helm', body: 'bronze_platebody', pants: 'apprentice_pants' });
        await pushEnvelope(page, s);
        const want = '2 heavy (' + share(VITALS.heavyHpPermille, 2) + ' max HP) · 1 medium (more blows miss) · 1 light (' + share(VITALS.lightManaPermille, 1) + ' max mana)';
        if ((await weightsLine()) !== want) fails.push('AW-34 the worn-weight line reads ' + JSON.stringify(await weightsLine()) + ', want ' + JSON.stringify(want));
        if (shots) await shot(page, 'armour-weight-1440x900-doll');
        await page.hover('.hw-slot[data-slot="helmet"]');
        const tip = await page.evaluate(() => { const t = document.querySelector('.hw-tip.is-on .hw-tip-weight'); return t ? t.textContent : null; });
        if (!tip || !tip.startsWith('Heavy armor') || !tip.includes(share(VITALS.heavyHpPermille, 1) + ' max HP, of the ' + share(VITALS.heavyHpPermille, ARMOUR_SLOTS.length) + ' a full heavy set of ' + ARMOUR_SLOTS.length))
          fails.push('AW-34 the worn plate helmet\'s tooltip weight line reads ' + JSON.stringify(tip));
        if (shots) await shot(page, 'armour-weight-1440x900-doll-tip');
        /* THE TIP GOES WITH ITS WINDOW (designer re-read 2026-11-11: a bag tip stood over the World after B closed the bag, through mouse moves and a hunt start).
           A tip the pointer is not on (the bag's keyboard cursor shows one: actions.js focusCursor) gets no mouseout when its window goes, so the
           pointer is moved off the bag first and the pocket's tip is raised as the cursor raises it. */
        await page.mouse.move(2, 2);
        const raised = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item]'); if (!p) return false;
          p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return !!document.querySelector('.hw-tip.is-on'); });
        if (!raised) fails.push('AW-34 no bag pocket raised its tooltip');
        await page.keyboard.press('b');
        await page.waitForTimeout(450);
        await page.mouse.move(40, 40);
        if (await page.evaluate(() => !!document.querySelector('.hw-tip.is-on'))) fails.push('AW-34 an item tooltip stayed on screen after its window closed by hotkey');
        await page.keyboard.press('b');
        await page.waitForSelector('.hw-slot[data-slot="helmet"]', { timeout: 4000 }).catch(() => fails.push('AW-34 B did not open the bag again'));
        delete s.env.equipment.helmet;
        await pushEnvelope(page, s);
        if (!String(await weightsLine()).startsWith('1 heavy (' + share(VITALS.heavyHpPermille, 1) + ' max HP)')) fails.push('AW-34 after the server took the helmet off, the line reads ' + JSON.stringify(await weightsLine()));
        if (shots) { await page.click('.hw-slot[data-slot="weapon"]'); await page.waitForTimeout(200); await shot(page, 'alpha-1440x900-gear-slot'); }
      }
      if (errors.length) fails.push('AW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    /* AW-33 the item wells: measured on the rendered windows, desktop then phone. */
    for (const [vw, vh, want] of [[1440, 900, { pocket: 44, bagRow: 6, storeRow: 10, line: 44, font: '16px' }], [922, 423, { pocket: 36, line: 40, font: '14.5px' }]]) {
      const tag = 'AW-33 at ' + vw + 'x' + vh + ': ';
      const { ctx, page, up } = await open({ viewport: { width: vw, height: vh }, mutateEnv: (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        e.bank = Object.fromEntries(Object.keys(e.inventory).map((id, i) => [id, 3 + i]));
        e.shop = Object.assign({}, e.shop, { offers: ['bronze_sword', 'iron_helm'].map((id, i) => ({ offer: 'gear.' + id, item: id, kind: 'gear', price: 40 + i * 140 })) });
      } });
      /* Every visible item icon in the window: its drawn size and its art's own; a scale that is not whole wobbles. */
      /* AT REST: the window slides in (shell.css hs-in, 120 ms translateX); a rect read mid-slide maps every icon through
         a fractional transform and reads 32.00006 px for 32 (float noise, not a scale). Measured once nothing moves it. */
      const measure = (id) => page.evaluate(async (w) => {
        const win = document.querySelector('[data-hs-win="' + w + '"]');
        const moving = () => { for (let n = win; n; n = n.parentElement) if (getComputedStyle(n).transform !== 'none') return true; return false; };
        for (let i = 0; i < 40 && moving(); i++) await new Promise((r) => setTimeout(r, 50));
        const vis = (q) => Array.from(win.querySelectorAll(q)).filter((n) => n.getClientRects().length > 0);
        const box = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100]; };
        const rows = (q) => { const l = vis(q); return l.length ? l.filter((n) => Math.abs(n.getBoundingClientRect().top - l[0].getBoundingClientRect().top) < 2).length : 0; };
        const cnt = vis('.hw-count').find((n) => n.textContent);
        const price = vis('.hw-line-name small').find((n) => n.textContent);
        return { pocket: vis('.hw-pocket').map(box)[0] || null, slot: vis('.hw-doll .hw-slot').map(box)[0] || null,
          line: vis('.hw-line .hw-ico').map(box)[0] || null, bagRow: rows('.hw-pockets:not([data-side="bank"]) > .hw-pocket'), storeRow: rows('.hw-pockets[data-side="bank"] > .hw-pocket'),
          count: cnt ? getComputedStyle(cnt).fontSize : null, price: price ? getComputedStyle(price).fontSize : null,
          art: vis('img.hh-icon').filter((i) => i.complete && i.naturalWidth).map((i) => { const r = i.getBoundingClientRect(); return [r.width / i.naturalWidth, r.height / i.naturalHeight, i.getAttribute('src').split('/').pop()]; }) };
      }, id);
      const artOk = (m, where) => {
        if (!m.art.length) { fails.push(tag + where + ' drew no item art to measure'); return; }
        const bad = m.art.filter(([x, y]) => x !== 1 || y !== 1);
        if (bad.length) fails.push(tag + where + ' draws item art at a scale other than exactly 1x: ' + JSON.stringify(bad.slice(0, 3)));
      };
      if (!up) fails.push(tag + 'the shell did not mount');
      else {
        if (!(await openWin(page, 'b', 'inventory'))) fails.push(tag + 'Inventory did not open');
        else {
          const m = await measure('inventory');
          if (!m.pocket || m.pocket[0] !== want.pocket || m.pocket[1] !== want.pocket) fails.push(tag + 'a bag pocket is ' + JSON.stringify(m.pocket) + ', want ' + want.pocket + ' px');
          if (want.bagRow && m.bagRow !== want.bagRow) fails.push(tag + 'the bag shows ' + m.bagRow + ' a row, want ' + want.bagRow);
          if (!m.slot || (want.bagRow ? m.slot[0] <= m.pocket[0] : m.slot[0] !== want.pocket)) fails.push(tag + 'a doll slot is ' + JSON.stringify(m.slot) + ' beside a ' + JSON.stringify(m.pocket) + ' pocket');
          if (m.count !== want.font) fails.push(tag + 'a bag count is ' + m.count + ', want ' + want.font);
          artOk(m, 'Inventory');
        }
        if (!(await openWin(page, 't', 'storage'))) fails.push(tag + 'Storage did not open');
        else {
          const m = await measure('storage');
          if (!m.pocket || m.pocket[0] !== want.pocket) fails.push(tag + 'a storage pocket is ' + JSON.stringify(m.pocket) + ', want ' + want.pocket + ' px');
          if (want.storeRow && m.storeRow !== want.storeRow) fails.push(tag + 'storage shows ' + m.storeRow + ' a row, want ' + want.storeRow);
          artOk(m, 'Storage');
        }
        if (!(await openWin(page, 'v', 'shop'))) fails.push(tag + 'the Shop did not open');
        else {
          const m = await measure('shop');
          if (!m.line || m.line[0] !== want.line || m.line[1] !== want.line) fails.push(tag + 'a Shop line holds its art in ' + JSON.stringify(m.line) + ', want ' + want.line + ' px');
          if (m.price !== want.font) fails.push(tag + 'a Shop price is ' + m.price + ', want ' + want.font);
          artOk(m, 'the Shop');
        }
      }
      await ctx.close();
    }

    { // AW-5 AW-6 the locked stack and the confirmation
      const { ctx, page, s, up } = await open();
      if (up) {
        await openWin(page, 'b', 'inventory');
        for (const id of ['rat_tail', 'slime_gel', 'sticky_core']) await page.click('.hw-pocket[data-item="' + id + '"]', { modifiers: ['Control'] });
        await page.click('[data-hs-act="sell-sel"]');
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
        e.state = Object.assign({}, e.state, { active_kind: 'artisan', active_id: 'fuel_bones' });
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

    { // AW-74 a seed says what planting it needs, before the purchase (the server's Farming and the account's plot tier)
      const seeds = (e) => {
        e.shop = Object.assign({}, e.shop, { offers: e.shop.offers.concat([{ offer: 'supply.turnip_seed', item: 'turnip_seed', kind: 'seed', price: 5 },
          { offer: 'supply.carrot_seed', item: 'carrot_seed', kind: 'seed', price: 10 }]) });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 1154, level: 10, frac: 0 } });
        e.farm_land = { cap: 2, plot_level: 1, deeds: 0, upgrade: { level: 2, gold: 500, deeds: 1, farming: 5 }, plots: [] };
      };
      const { ctx, page, up } = await open({ mutateEnv: seeds });
      if (up && await openWin(page, 'v', 'shop')) {
        await page.waitForTimeout(150);
        const said = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('.hw-shop [data-pane="buy"] .hw-line'))
          .map((l) => [l.getAttribute('data-item'), l.querySelector('small').textContent])));
        if (!/ · Needs plot tier 2 to plant/.test(said.carrot_seed || '') || /Farming/.test(said.carrot_seed || '')) fails.push('AW-74 the carrot seed on tier 1 land reads ' + JSON.stringify(said.carrot_seed));
        if (!said.turnip_seed || /Needs/.test(said.turnip_seed)) fails.push('AW-74 the turnip seed reads ' + JSON.stringify(said.turnip_seed));
      } else fails.push('AW-74 the Shop did not open');
      await ctx.close();
    }

    { // AW-65 CARRY IN (Tyler 2026-11-02, "Yes, add a press"): a hunting hero's Hunt prep offers the bag's supplies with the
      // server's two counts; Carry asks how many and sends ONE hr_hunt_restock (an item id and a count, nothing else); the
      // counts change only from the server's re-read; a settle_first refusal runs the hunter's settle, then ONE more ask
      // under a NEW key. A stateful stub: the server's answer moves its own counts.
      const hunting = (e) => {
        e.hunt = Object.assign({}, e.hunt, { ended: false, session: { bag: [{ item: 'wheat_bread', left: 9, loaded: 14, essential: false }] } });
        e.inventory = Object.assign({}, e.inventory, { cooked_shrimp: 40 });
      };
      const { ctx, page, s, errors, up } = await open({ mutateEnv: hunting });
      if (up) {
        s.onCall = (name, b) => {
          if (name !== 'hr_hunt_restock') return;
          if (s.carryRefuse) { s.reply = { ok: false, error: s.carryRefuse }; s.carryRefuse = null; return; }
          const inv = s.env.inventory, bag = s.env.hunt.session.bag;
          inv[b.p_item] -= b.p_qty; if (!inv[b.p_item]) delete inv[b.p_item];
          const l = bag.find((x) => x.item === b.p_item);
          if (l) { l.left += b.p_qty; l.loaded += b.p_qty; } else bag.push({ item: b.p_item, left: b.p_qty, loaded: b.p_qty, essential: false });
          s.reply = { ok: true, item: b.p_item, qty: b.p_qty, left: (l || bag[bag.length - 1]).left, have: inv[b.p_item] || 0 };
        };
        const P = '[data-hs-win="hunt-prep"] ';
        const row = () => page.evaluate((w) => {
          const b = document.querySelector(w + '[data-hs-act="carry"][data-item="cooked_shrimp"]'), li = b && b.closest('li');
          return li ? { press: b.textContent, label: b.getAttribute('aria-label'), small: li.querySelector('small').textContent, head: !!document.querySelector(w + '.hw-carry-head.is-on') } : null;
        }, P);
        const carry = async (n) => {
          await page.click(P + '[data-hs-act="carry"][data-item="cooked_shrimp"]');
          if (!(await wait(page, () => document.querySelector('.hw-menu.is-on .hw-amt-n'), null, 2000))) return false;
          await page.fill('.hw-menu .hw-amt-n', String(n));
          await page.keyboard.press('Enter');
          return true;
        };
        const said = () => page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, P);
        if (!(await openWin(page, 'p', 'hunt-prep'))) fails.push('AW-65 P did not open Hunt prep while hunting');
        await page.waitForTimeout(200);
        const r0 = await row();
        if (!r0 || r0.press !== 'Carry 40' || r0.label !== 'Carry 40 into this hunt' || r0.small !== '40 in your backpack · 0 in this hunt' || !r0.head)
          fails.push('AW-65 a hunting hero\'s Hunt prep offers ' + JSON.stringify(r0) + ' ' + errors.slice(0, 2).join(' | '));
        if (!(await carry(25))) fails.push('AW-65 Carry did not ask how many');
        for (let i = 0; i < 40 && !/^Carried/.test(await said()); i++) await page.waitForTimeout(100);
        const c = sent(s, 'hr_hunt_restock');
        if (c.length !== 1 || c[0].body.p_slot !== 0 || c[0].body.p_item !== 'cooked_shrimp' || c[0].body.p_qty !== 25 || !/^[0-9a-f-]{36}$/.test(c[0].body.p_idem)
            || Object.keys(c[0].body).sort().join() !== 'p_idem,p_item,p_qty,p_slot') fails.push('AW-65 Carry 25 sent ' + JSON.stringify(c.map((x) => x.body)));
        const r1 = await row();
        if (!r1 || r1.small !== '15 in your backpack · 25 in this hunt' || r1.press !== 'Carry 15') fails.push('AW-65 after the server moved 25, Hunt prep reads ' + JSON.stringify(r1));
        if ((await said()) !== 'Carried 25 Cooked Shrimp into this hunt.') fails.push('AW-65 the answer reads ' + JSON.stringify(await said()));
        /* the hunt is still catching up: the hunter's own settle (paced: catch-up.js's rule), then ONE more ask under a NEW
           key (the first wrote nothing), and the line is the second answer's */
        s.carryRefuse = 'settle_first';
        const at = s.calls.length;
        if (!(await carry(5))) fails.push('AW-65 the second Carry did not ask how many');
        for (let i = 0; i < 40 && sent(s, 'hr_hunt_restock').length < 3; i++) await page.waitForTimeout(100);
        for (let i = 0; i < 40 && !/^Carried 5 /.test(await said()); i++) await page.waitForTimeout(100);
        const asks = s.calls.slice(at).filter((x) => x.name === 'hr_hunt_restock');
        if (asks.length !== 2 || asks[0].body.p_idem === asks[1].body.p_idem || asks.some((x) => x.body.p_qty !== 5))
          fails.push('AW-65 a carry refused settle_first sent ' + JSON.stringify(asks.map((x) => x.body)));
        const r2 = await row();
        if (!r2 || r2.small !== '10 in your backpack · 30 in this hunt') fails.push('AW-65 after the retried carry, Hunt prep reads ' + JSON.stringify(r2));
        if (shots) await shot(page, 'alpha-1440x900-hunt-prep-carry');
      } else fails.push('AW-65 the screen did not mount');
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
      if (up) aw9: {
        await openWin(page, 'b', 'inventory');
        await page.click('.hw-pocket[data-item="rat_tail"]', { button: 'right' });
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ lock: document.querySelector('[data-hs-act="m-lock"]').disabled,
          rules: Array.from(document.querySelectorAll('[data-hs-act="m-rule"]')).every((b) => b.disabled),
          dispatch: document.querySelector('[data-hs-act="dispatch"]').disabled, value: document.querySelector('.hw-value').textContent }));
        if (!st.lock || !st.rules || !st.dispatch || st.value !== 'Reading the shop prices…') fails.push('AW-9 without the server’s sections the bag offered ' + JSON.stringify(st));
        /* The reason is a loading line (audit 11-09 F11): bag_rules IS projected, so "switch on when the server starts keeping them" was false.
           The player's way: Esc puts the menu away, then the stack is pressed, checked, not clicked blind. It was clicked through the open menu,
           whose corner stands on the stack's middle (the press point): Playwright reached it only on its 4th try, after scrolling the bag, and a
           loaded runner can spend its 6 s first. The Equip upgrades mutant's HARNESS (nightly 42678595702, main 42735492394) came with this
           step (a33a2a080) and threw at the time it runs. */
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        const ratBlock = await pressBlock(page, '[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        if (ratBlock) { fails.push('AW-9 the rat tails cannot be pressed once Esc put the item menu away: ' + ratBlock); break aw9; }
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="rat_tail"]');
        await page.keyboard.press('l');
        await page.waitForTimeout(150);
        const lockSaid = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
        await page.click('[data-hs-win="inventory"] .hw-tab[data-tab="hunt"]');
        await page.waitForTimeout(150);
        const said = await page.evaluate(() => ({ note: document.querySelector('[data-hs-win="inventory"] .hw-loot-note').textContent,
          keeping: /starts keeping/.test(document.querySelector('[data-hs-win="inventory"]').textContent) }));
        if (lockSaid !== 'Reading your locks…' || said.note !== 'Reading your loot plans…' || said.keeping) fails.push('AW-9 before bag_rules loads the bag says ' + JSON.stringify({ lockSaid, ...said }));
      } else fails.push('AW-9 the screen did not mount');
      await ctx.close();
    }

    { // AW-75 ALSO FOUND IS THE SERVER'S (audit 11-09 F1): while hr_account_items is silent the list says Searching… and lists
      // nothing (never the open envelopes' copy: this hero's Storage holds 9 rat tails, the server's answer 4); then the answer's
      // rows only; a refused read says so, with no rows and no "Nowhere else."
      let release = null;
      const { ctx, page, s, up } = await open({ mutateEnv: (e) => { e.bank = { rat_tail: 9 }; } });
      if (up) {
        s.findGate = new Promise((ok) => { release = ok; });
        await openWin(page, 'b', 'inventory');
        const seen = () => page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-elsewhere');
          return { on: b.classList.contains('is-on'), from: b.querySelector('.hw-find-from').textContent,
            rows: Array.from(b.querySelectorAll('.hw-found li small')).map((x) => x.textContent),
            none: b.querySelector('.hw-found-none').classList.contains('is-on'), text: b.textContent }; });
        await page.fill('[data-hs-win="inventory"] .hw-q', 'rat');
        await page.waitForTimeout(700);
        let v = await seen();
        if (!sent(s, 'hr_account_items').some((c) => c.body.p_query === 'rat')) fails.push('AW-75 the search never asked the server');
        if (!v.on || v.from !== 'Searching…' || v.rows.length || v.none || /not on the server/.test(v.text)) fails.push('AW-75 with the server silent the list reads ' + JSON.stringify(v));
        release();
        await wait(page, () => document.querySelector('[data-hs-win="inventory"] .hw-find-from').textContent === 'All your characters');
        v = await seen();
        if (JSON.stringify(v.rows) !== JSON.stringify(['In storage (all your characters) · ×4', 'Druid · in the bag · ×2'])) fails.push('AW-75 the server\'s answer reads ' + JSON.stringify(v));
        s.findRefuse = 'search_down';
        await page.fill('[data-hs-win="inventory"] .hw-q', 'tail');
        await page.waitForTimeout(700);
        v = await seen();
        if (v.from !== 'The search did not go through, so nothing is listed. Change the search to try again.' || v.rows.length || v.none) fails.push('AW-75 a refused search reads ' + JSON.stringify(v));
      } else fails.push('AW-75 the screen did not mount');
      if (release) release();
      await ctx.close();
    }

    { // AW-32 DISPATCH LOOT (Tyler 2026-10-25): the loot plan in the item menu, ONE hr_loot_dispatch, the server's answer
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        e.bank = { oak_logs: 12 };
      };
      { // hunting: off, and the reason is in view
        const { ctx, page, up } = await open();
        if (up) {
          await openWin(page, 'b', 'inventory');
          const st = await page.evaluate(() => ({ off: document.querySelector('[data-hs-act="dispatch"]').disabled, why: document.querySelector('.hw-dispatch-why').textContent }));
          if (!st.off || !/out hunting/.test(st.why)) fails.push('AW-32 mid-hunt Dispatch loot is not off with its reason: ' + JSON.stringify(st));
        } else fails.push('AW-32 the screen did not mount (hunting)');
        await ctx.close();
      }
      const { ctx, page, s, up, errors } = await open({ mutateEnv: town });
      if (up) {
        await openWin(page, 'b', 'inventory');
        const menuOf = async (id) => {
          await page.click('.hw-pocket[data-item="' + id + '"]', { button: 'right' });
          await page.waitForTimeout(150);
          return page.evaluate(() => ({ subs: Array.from(document.querySelectorAll('.hw-menu .hw-menu-sub')).map((x) => x.textContent),
            rules: Array.from(document.querySelectorAll('.hw-menu [data-hs-act="m-rule"]')).map((b) => [b.getAttribute('data-rule'), b.textContent, b.getAttribute('aria-pressed'), b.disabled]) }));
        };
        const m = await menuOf('wolf_pelt');
        const want = [['keep', 'Keep in bag', 'true', false], ['deposit', 'Deposit in storage', 'false', false], ['sell', 'Sell', 'false', false], ['ignore', 'Don\'t pick up', 'false', false]];
        if (JSON.stringify(m.rules) !== JSON.stringify(want) || !m.subs.includes('Loot plan') || !m.subs.includes('On pickup')) fails.push('AW-32 the item menu offers ' + JSON.stringify(m));
        if (shots) await shot(page, 'dispatch-1440x900-item-menu');
        s.onCall = (name, body) => {
          if (name === 'hr_loot_rule_set') { s.env.bag_rules.loot[body.p_item] = body.p_rule; }
          if (name === 'hr_loot_dispatch') {
            for (const k of ['wolf_pelt', 'rat_tail', 'slime_gel']) delete s.env.inventory[k];
            s.env.bank = Object.assign({}, s.env.bank, { wolf_pelt: 3 });
          }
        };
        await page.click('.hw-menu [data-hs-act="m-rule"][data-rule="deposit"]');
        await page.waitForTimeout(600);
        const rs = sent(s, 'hr_loot_rule_set');
        if (rs.length !== 1 || rs[0].body.p_item !== 'wolf_pelt' || rs[0].body.p_rule !== 'deposit' || Object.keys(rs[0].body).sort().join() !== 'p_idem,p_item,p_rule,p_slot') {
          fails.push('AW-32 Deposit in storage sent ' + JSON.stringify(rs.map((c) => c.body)));
        }
        /* the starting kit may be deposited but takes no Sell plan (the server's start_kit), said before the press */
        const k = await menuOf('cooked_shrimp');
        const kit = Object.fromEntries(k.rules.map((r) => [r[0], r[3]]));
        if (kit.deposit !== false || kit.sell !== true || kit.keep !== false) fails.push('AW-32 the starting kit offers ' + JSON.stringify(k.rules));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        s.reply = { ok: true, version: 9, stored: { stacks: 1, units: 3, items: { wolf_pelt: 3 } }, sold: { stacks: 2, units: 43, gold: 246, items: { rat_tail: 31, slime_gel: 12 } },
          unplaced: { stacks: 0, items: {}, why: null }, kept: { locked: 1, kit: 0, later: 0 }, sell_refused: null };
        await page.click('[data-hs-win="inventory"] [data-hs-act="dispatch"]');
        await page.waitForTimeout(100);
        const busy = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] [data-hs-act="dispatch"]').disabled);
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => ({ msg: document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent,
          tail: !!document.querySelector('.hw-pocket[data-item="rat_tail"]'), pelt: !!document.querySelector('.hw-pocket[data-item="wolf_pelt"]') }));
        const ds = sent(s, 'hr_loot_dispatch');
        if (ds.length !== 1 || Object.keys(ds[0].body).sort().join() !== 'p_idem,p_slot' || ds[0].body.p_slot !== 0) fails.push('AW-32 Dispatch loot sent ' + JSON.stringify(ds.map((c) => c.body)));
        if (!busy) fails.push('AW-32 Dispatch loot stayed on while its intent was in flight');
        if (after.msg !== 'Stored 1 stack, sold 2 stacks for 246 gp. 1 stack locked, so kept.') fails.push('AW-32 the answer line reads ' + JSON.stringify(after.msg));
        if (after.tail || after.pelt) fails.push('AW-32 the bag did not take the re-read envelope: ' + JSON.stringify(after));
        if (shots) await shot(page, 'dispatch-1440x900-bag-answer');
        await openWin(page, 't', 'storage');
        await page.waitForTimeout(150);
        const sb = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="storage"] [data-hs-act="dispatch"]'); return b ? { off: b.disabled, why: document.querySelector('.hw-store-do .hw-why').textContent, pelt: !!document.querySelector('[data-hs-win="storage"] .hw-pockets[data-side="bank"] [data-item="wolf_pelt"]') } : null; });
        if (!sb || !sb.off || !/^Your loot plan has nothing left to move\. /.test(sb.why) || !sb.pelt) fails.push('AW-32 Storage after the dispatch reads ' + JSON.stringify(sb));
        if (shots) await shot(page, 'dispatch-1440x900-storage-after');
        if (errors.length) fails.push('AW-32 console errors: ' + errors.slice(0, 3).join(' | '));
      } else fails.push('AW-32 the screen did not mount (town)');
      await ctx.close();
      for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) { // Storage with a plan to run
        const ph = await open({ viewport, mutateEnv: (e) => { town(e); e.bag_rules.loot.wolf_pelt = 'deposit'; } });
        if (ph.up) {
          await openWin(ph.page, 't', 'storage');
          await ph.page.waitForTimeout(150);
          const on = await ph.page.evaluate(() => { const x = document.querySelector('[data-hs-win="storage"] [data-hs-act="dispatch"]'); return x ? !x.disabled : null; });
          if (!on) fails.push('AW-32 at ' + viewport.width + 'x' + viewport.height + ' Storage does not offer Dispatch loot');
          /* the sheet scrolls on a phone: the shot shows the bag side with its button */
          await ph.page.evaluate(() => { const x = document.querySelector('[data-hs-win="storage"] [data-hs-act="dispatch"]'); if (x) x.scrollIntoView({ block: 'center' }); });
          await ph.page.waitForTimeout(150);
          if (shots) await shot(ph.page, 'dispatch-' + viewport.width + 'x' + viewport.height + '-storage');
        } else fails.push('AW-32 the ' + viewport.width + 'x' + viewport.height + ' screen did not mount');
        await ph.ctx.close();
      }
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
        /* Havora is bigger than one view: tap the open map toward the hatch until it is well on screen */
        for (let i = 0; i < 8; i++) {
          const h = await at(TOWN.hatch[0], TOWN.hatch[1]);
          const b = await page.evaluate(() => document.querySelector('.world-canvas').getBoundingClientRect().toJSON());
          if (h.x > b.left + 120 && h.x < b.right - 120 && h.y > b.top + 120 && h.y < b.bottom - 200) break;
          await page.mouse.click(Math.min(Math.max(h.x, b.left + 160), b.right - 160), Math.min(Math.max(h.y, b.top + 160), b.bottom - 240));
          await page.waitForTimeout(2500);
        }
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
        const want = ['mill_cellar:picked:Level 1–8:in:In your range:Right for your level:No best yet:Alone or with up to 3 more',
          'meadowbrook_thicket::Level 5–15:above:Above your level::No best yet:Alone or with up to 3 more',
          'millrace_sewer::Level 8–25:above:Above your level::No best yet:Alone or with up to 3 more',
          /* Wickstead, Greenhaven's sixth (lane b-greenhaven-6, opened on its art v0.2.63): the second solo door for 8-18 */
          'wickstead::Level 8–18:above:Above your level::No best yet:Alone or with up to 3 more',
          'mosslight_glade::Level 16–31:far:Far above your level::No best yet:Alone or with up to 3 more',
          'coppercap_warrens::Level 32–50:far:Far above your level::No best yet:Alone or with up to 3 more'];
        if (list.join('|') !== want.join('|')) fails.push('AW-25 the list lines read ' + JSON.stringify(list));
        /* The picked ground's page: who lives here as the world draws them, at a whole-number scale on one ground line. */
        const page1 = () => page.evaluate((w) => {
          const d = document.querySelector(w + '.hw-hunt-detail');
          const vis = (q) => { const n = d.querySelector(q); return n && n.getClientRects().length ? n.textContent : null; };
          return { name: vis('.hw-hd-name'), theme: vis('.hw-hd-theme'),
            sets: Array.from(d.querySelectorAll('.hw-hd-set')).map((n) => n.firstElementChild.textContent + ' · ' + n.querySelector('.hw-hd-odds').textContent),
            per: vis('.hw-hd-per-size'),
            rares: Array.from(d.querySelectorAll('.hw-hd-rares .hw-hd-rare')).map((n) => n.querySelector('.hw-hd-rare-name').textContent + ' / ' + n.querySelector('.hw-hd-rare-by').textContent + (n.classList.contains('is-trophy') ? ' (trophy)' : '')),
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
        if (p.name !== 'Mill Cellar' || p.theme !== HUNTS.mill_cellar.theme || mons !== 'rat:Level 2 · common|slime:Level 2 · uncommon|hive_wasp:Level 4 · uncommon:carrier')
          fails.push('AW-25 the Mill Cellar page reads ' + JSON.stringify({ name: p.name, theme: p.theme, mons }));
        /* the fixture hero wears Leather Boots, so the medium line reads first; the Cellar's one Rare is the Hive Wasp's
           Queen's Comb (the Great Hearth's named fuel, src/data/hearth.js), so the wasp carries and the Rare heading shows */
        /* each line with its chance per kill, alone (the engine's rows: the pure AW-25 works the math from them) */
        if (p.sets.join('|') !== 'Leather, Bronze, Apprentice: helmets · ' + CELLAR_ODDS || p.per !== 'chance per kill, hunting alone'
          || p.rares.join('|') !== "Queen's Comb / Hive Wasp" || !p.raresShown)
          fails.push('AW-25 the Cellar\'s drops read ' + JSON.stringify([p.sets, p.per, p.rares, p.raresShown]));
        if (p.bests.join('|') !== 'No best here yet. Hunt 10 minutes or more to set one.') fails.push('AW-25 with no best the page reads ' + JSON.stringify(p.bests));
        if (shots) await shot(page, 'hunts-1440x900-cellar-level1');
        /* The server's best arrives: the line and the page take it (replaced, never kept from before). */
        s.env.hunt_bests = { min_ms: 600000, grounds: { mill_cellar: { solo: { xp_h: 7141, balance_h: 1859 } } } };
        await pushEnvelope(page, s);
        const best = await page.evaluate((w) => document.querySelector(w + '.hw-hunt[data-hunt="mill_cellar"] .hw-hunt-bestline').textContent, W);
        const p2 = await page1();
        if (best !== 'Best 7,141 Level XP/h' || p2.bests.join('|') !== 'Best alone: 7,141 Level XP per hour · balance 1,859 gp per hour') fails.push('AW-25 the server\'s best reads ' + JSON.stringify([best, p2.bests]));
        /* AW-25b THE PICK FOLLOWS THE ADVICE until the player picks by hand (lane/b-first-hour: the Cellar, picked for a
           Level 1 hero, stayed picked at Level 5 while the coach sent the hero to the Thicket). */
        const pickedNow = () => page.evaluate((w) => (document.querySelector(w + '.hw-hunt.is-picked') || {}).dataset?.hunt, W);
        s.env.state = Object.assign({}, s.env.state, { level_xp: LEVEL_5_XP });
        await pushEnvelope(page, s);
        const at5 = await wait(page, (w) => !!document.querySelector(w + '.hw-hunt.is-picked[data-hunt="meadowbrook_thicket"]'), W, 3000);
        if (!at5) fails.push('AW-25b at Level 5 the pick stayed on ' + (await pickedNow()) + ', not the Thicket the advice marks');
        await page.click(W + '.hw-hunt[data-hunt="mill_cellar"]');
        s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
        await pushEnvelope(page, s);
        s.env.state = Object.assign({}, s.env.state, { level_xp: LEVEL_5_XP });
        await pushEnvelope(page, s);
        if ((await pickedNow()) !== 'mill_cellar') fails.push('AW-25b a ground picked by hand was replaced by the advice: ' + (await pickedNow()));
        s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
        await pushEnvelope(page, s);
        /* AW-26 GO AS: the setups as lines, the one on now chosen; Enter as it is ONE hr_hunt_enter and no apply. */
        const goAs = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-go')).map((b) => [b.dataset.preset, b.getAttribute('aria-checked'), b.querySelector('.hw-go-name').textContent,
          b.querySelector('.hw-go-what').textContent, b.querySelectorAll('.hw-go-bar .hh-icon').length, (b.querySelector('.hw-go-weapon img') || {}).src ? b.querySelector('.hw-go-weapon img').getAttribute('src').split('/').pop() : ''].join(':')), W);
        const g0 = (await goAs()).join('|');
        if (g0 !== '0:true:Hunt:Melee · on now:4:iron_sword.png|1:false:Bow:Ranger:0:shortbow.png') fails.push('AW-26 Go as reads ' + JSON.stringify(g0));
        /* AW-27 BEFORE YOU GO: what the bar spends, in slot order, from the server's bar, bag and gold. */
        const before = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + '.hw-before-line')).map((li) => (li.classList.contains('is-short') ? '!' : '') + li.textContent).join(' | '), W);
        /* Flame Strike's slot names its store rune: carried runes first, then the store's a cast, and the gold pays it. */
        const b0 = await before();
        if (b0 !== 'Runes: 40 Fire runes of yours, then Plain Fire Rune from the store, 1 gp a cast | Food: 14 Wheat Bread of yours. You carry 5 Cooked Shrimp. Put it on the bar to eat it | Drink: 6 Goldenroot Tea of yours | Stamina: 30 min left, then the hunt ends. | Gold: 5,200 gp pays the store as you use it.')
          fails.push('AW-27 Before you go reads ' + JSON.stringify(b0));
        if (await page.evaluate(() => !!document.querySelector('[data-hs-win="hunts"] .hw-ready, [data-hs-win="hunts"] .hw-checks'))) fails.push('AW-27 the Hunts window still carries the readiness checklist');
        /* The next envelope REPLACES every number (CLAUDE.md §6): fewer runes, less bread, no gold (that line now stops the hunt). */
        s.env.inventory = Object.assign({}, s.env.inventory, { chalked_fire_rune: 3 });
        s.env.hunt_settings = clone(s.env.hunt_settings);
        s.env.hunt_settings.slots[2].count = 2;
        s.env.state = Object.assign({}, s.env.state, { gold: 0 });
        await pushEnvelope(page, s);
        const b1 = await before();
        if (b1 !== 'Runes: 3 Fire runes of yours, then Plain Fire Rune from the store, 1 gp a cast | Food: 2 Wheat Bread of yours. You carry 5 Cooked Shrimp. Put it on the bar to eat it | Drink: 6 Goldenroot Tea of yours | Stamina: 30 min left, then the hunt ends. | !No gold for the store, so the hunt ends when your own supplies run out.')
          fails.push('AW-27 Before you go kept a number the server replaced: ' + JSON.stringify(b1));
        /* The page's own modules (a planted defect in them is what is served): a fresh hero's starter bar (the designer's
           walk-through row 4) and Bring your heroes (this account's other open heroes in no party). */
        const own = await page.evaluate(async (STORE) => {
          const m = await import('/src/shell/hunt-go.js?v=0.1.0');
          const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
          const sec = { hunt_settings: { preset: 0, presets: [], store: STORE, slots: [slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', 20), slot('consume', 'salted_shrimp', null), slot('consume', 'thin_turnip_juice', null)] },
            state: { gold: 500 }, inventory: { cooked_shrimp: 20 }, equipment: { weapon: 'practice_sword' } };
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
        if (!pp || pp[0] !== 'Alone or with up to 3 more.' || pp[1] !== 'Find a party' || !/^Your other heroes can come too/.test(pp[2])) fails.push('AW-28 the Sewer page\'s party path reads ' + JSON.stringify(pp));
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

    { // AW-25c 1440x900: the first row of "Who lives here" stands whole above Enter, the warning over it included; a wrapped list line never starts with its dot (board 11-04)
      const { ctx, page, up } = await open({ viewport: { width: 1440, height: 900 }, mutateEnv: levelOne });
      const W = '[data-hs-win="hunts"] ';
      if (!up || !(await openWin(page, 'h', 'hunts'))) fails.push('AW-25c the Hunts window did not open at 1440x900');
      else {
        await page.click(W + '.hw-hunt[data-hunt="millrace_sewer"]');
        await page.waitForTimeout(400);
        const m = await page.evaluate((w) => { const f = document.querySelector(w + '.hw-hd-mon'), pg = document.querySelector(w + '.hw-hd-page'), sub = document.querySelector(w + '.hw-hunt-sub');
          const best = Array.from(document.querySelectorAll(w + '.hw-hunt-bestline')).find((e) => e.textContent);
          return { foot: f && f.getBoundingClientRect().bottom, end: pg.getBoundingClientRect().bottom, flow: getComputedStyle(sub).display, dot: best ? getComputedStyle(best, '::before').content : '' }; }, W);
        if (!m.foot || m.foot > m.end + 0.5) fails.push('AW-25c the first creature is cut at the pane\'s foot: ' + JSON.stringify(m));
        if (m.flow !== 'block') fails.push('AW-25c the list line wraps as flex items, so its dot can start a line: ' + m.flow);
      }
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
        /* a Level 1 under the Thicket's floor: the first press arms "Enter anyway", the second goes */
        await page.click(W + '.hw-hunt-detail .hw-hunt-enter');
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
        e.state = Object.assign({}, e.state, { level_xp: LEVEL_5_XP });
        e.skills = Object.assign({}, e.skills, { farming: { xp: 28, level: 1, frac: 0 } });
        for (const id of ['bronze_sword', 'steel_sword', 'iron_helm', 'iron_platebody', 'shortbow']) delete e.inventory[id];
        for (const id of MORE) { e.inventory[id] = 3; e.shop.bids[id] = 2; }
        e.hunt_settings = Object.assign({}, e.hunt_settings, { slots: [], bar: [] });
        /* this hunt's loot holds Bones too (a skill's offering, never coin) */
        e.hunt = Object.assign({}, e.hunt, { loot: e.hunt.loot.concat([{ item: 'bones', count: 8 }]) });
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
        /* ...and no hunt bar: with the summary open it would hold only a Summary press for it (first-hour playtest 10-29 #10) */
        if (town.analyzer || town.party || town.bar || town.toast || !town.summary) fails.push('AW-31 back in town the screen holds more than the summary: ' + JSON.stringify(town));
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
        /* "Decide once" rings a loot rule on a stack that only pays coin, never on Bones (played 2026-10-25) */
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-win="inventory"] .hw-tab[data-tab="hunt"]');
        await page.waitForTimeout(300);
        const coinRows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="inventory"] [data-rule-item]')).map((s) => s.getAttribute('data-rule-item') + (s.hasAttribute('data-coin') ? ':coin' : '')));
        if (!coinRows.includes('rat_tail:coin') || coinRows.some((x) => /^bones:coin/.test(x))) fails.push('AW-31 the loot-rule rows read ' + JSON.stringify(coinRows) + ' (want Rat Tail marked as coin, never Bones)');
        await openWin(page, 'v', 'shop');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(200);
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

    { // AW-60 THE WINDOWS SAY IT (blind crafting panel 2026-11-01): the rules above, read where the player reads them
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = {};
        e.inventory = { slime_gel: 12, rat_tail: 31, venom_sac: 3, iron_axe: 1, bronze_axe: 1, chalked_fire_rune: 40, turnip_juice: 9, cooked_shrimp: 5 };
        e.skills = Object.assign({}, e.skills, { crafting: { xp: 0, level: 1, frac: 0 }, runecrafting: { xp: 0, level: 1, frac: 0 } });
        e.shop = Object.assign({}, e.shop, { bids: { slime_gel: 5, rat_tail: 6, venom_sac: 40, iron_axe: 250, bronze_axe: 60, turnip_juice: 6, cooked_shrimp: 3 } });
        /* the deed names Venom Sac, a Junk drop no recipe spends: only the House's own word keeps it from Sell all junk */
        e.home = { tier: 2, rooms: [], tiers: [{ offer: 'property.manor', name: 'Stonecross Manor', tier: 3, need: 2, owned: false, gold: 10000, items: { timber_beam: 6, silk_thread: 8, venom_sac: 2 } }] };
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      s.onCall = (name, b) => { if (name === 'hr_bank_move' && s.reply.ok !== false) { s.env.bank[b.p_item] = b.p_qty; delete s.env.inventory[b.p_item]; } };
      const say = (q) => page.evaluate((x) => { const el = document.querySelector(x); return el ? el.textContent : null; }, q);
      if (!up) fails.push('AW-60 the town did not mount');
      else {
        /* The Shop: Slime Gel is a Material (Timber Beam is made from it); Venom Sac is Junk the House's next deed names;
           Rat Tail is Junk nothing wants. Only the first two are kept, and the button's price is the Rat Tails alone. */
        await openWin(page, 'v', 'shop');
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await page.waitForTimeout(200);
        const gel = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="slime_gel"] small');
        const tail = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="rat_tail"] small');
        const sac = await say('[data-hs-win="shop"] .hw-sell-list .hw-line[data-item="venom_sac"] small');
        if (!/Sell all junk keeps it/.test(gel || '') || /keeps it/.test(tail || '')) fails.push('AW-60 the Shop: Slime Gel ' + gel + ' / Rat Tail ' + tail);
        if (!/Sell all junk keeps it/.test(sac || '')) fails.push('AW-60 the Shop forgets the deed that names Venom Sac: ' + sac);
        if (!/· 186 gp$/.test(await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]') || '')) fails.push('AW-60 Sell all junk is priced ' + await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]'));
        /* Selling the counting tool warns in the sale's own confirmation. */
        await page.click('[data-hs-win="shop"] .hw-line[data-item="iron_axe"] [data-hs-act="sell"]');
        await page.waitForTimeout(150);
        if (!/Woodcutting is slower without it/.test(await say('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm-note') || '')) fails.push('AW-60 selling the Iron Axe says ' + await say('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm-note'));
        await page.click('[data-hs-win="shop"] [data-hs-act="confirm-no"]');
        /* The House: a short material's source sits under its cost. */
        await openWin(page, 'e', 'house');
        const house = await say('[data-hs-win="house"] .hw-deed');
        if (!/Timber Beam 6 \(none in your bag or Storage\)\s*Made with Crafting \d+\./.test(house || '') || !/Silk Thread 8[^.]*Dropped by .* at Mill Cellar/.test(house || '')) fails.push('AW-60 the House reads ' + house);
        /* A recipe's short input, the tool line, and a bench row whose output has no buyer. */
        await openWin(page, 'g', 'skills-trade');
        await page.click('[data-hs-win="skills-trade"] [data-skill="crafting"]');
        await page.waitForTimeout(200);
        if (!/No (Wolf Pelt|Silk Thread) in your bag.*Dropped by /.test(await say('[data-hs-win="skills-trade"] .hw-work-rows') || '')) fails.push('AW-60 Crafting rows read ' + await say('[data-hs-win="skills-trade"] .hw-work-rows'));
        await page.click('[data-hs-win="skills-trade"] [data-hs-act="work-back"]');
        await page.click('[data-hs-win="skills-trade"] [data-skill="runecrafting"]');
        await page.waitForTimeout(200);
        if (!/Chalked Fire Rune\. For your own use\. The shop and the Weighhouse won't take it\./.test(await say('[data-hs-win="skills-trade"] .hw-work-rows') || '')) fails.push('AW-60 Runecrafting rows read ' + await say('[data-hs-win="skills-trade"] .hw-work-rows'));
        await page.click('[data-hs-win="skills-trade"] [data-hs-act="work-back"]');
        await page.click('[data-hs-win="skills-trade"] [data-skill="woodcutting"]');
        await page.waitForTimeout(200);
        if (!/^Your Iron Axe is in your bag: Woodcutting 10% faster/.test(await say('[data-hs-win="skills-trade"] .hw-work-tool') || '')) fails.push('AW-60 the Woodcutting tool line reads ' + await say('[data-hs-win="skills-trade"] .hw-work-tool'));
        /* The ground's page lists its materials, with the engine's chance. */
        await openWin(page, 'h', 'hunts');
        await page.click('.hw-hunt[data-hunt="meadowbrook_thicket"]');
        await page.waitForTimeout(250);
        if (!/Wolf Pelt\s*Briarcoat Wolf and Old Grayjaw\s*\d/.test(await page.evaluate(() => document.querySelector('[data-hs-win="hunts"] .hw-hd-mats')?.innerText || ''))) fails.push('AW-60 the Thicket\'s Materials read ' + await say('[data-hs-win="hunts"] .hw-hd-mats'));
        /* The tooltip: a stack with no bid says who won't buy it, in plain words. */
        await openWin(page, 'b', 'inventory');
        await page.hover('[data-hs-win="inventory"] .hw-pocket[data-item="chalked_fire_rune"]');
        const tip = await wait(page, () => document.querySelector('.hw-tip.is-on'), null, 1500) ? await say('.hw-tip') : '';
        if (!/For your own use\. The shop and the Weighhouse won't take it/.test(tip) || /priced/.test(tip)) fails.push('AW-60 the rune\'s tooltip reads ' + tip);
        await page.mouse.move(2, 2);
        /* Storage: the counting axe put away says so, the one that wasn't counting does not. */
        await openWin(page, 't', 'storage');
        /* each line is read once the server has answered, never after a fixed wait: a slow runner still showed "Putting it away…"
           at 500 ms (v0.2.107 run 42441133986, in-page-10). Settled = not the pending line, and not the line before the press. */
        const storeMsg = '[data-hs-win="storage"] .hh-intent-msg';
        const settledAfter = (before) => wait(page, (a) => { const m = document.querySelector(a.sel); const t = m ? m.textContent.trim() : '';
          return !!t && !/…$/.test(t) && t !== a.before; }, { sel: storeMsg, before });
        await page.click('[data-hs-win="storage"] [data-side="bag"] .hw-pocket[data-item="bronze_axe"]');
        await settledAfter(null);
        const quiet = await say(storeMsg);
        await page.click('[data-hs-win="storage"] [data-side="bag"] .hw-pocket[data-item="iron_axe"]');
        await settledAfter(quiet);
        const told = await say(storeMsg);
        if (/slower/.test(quiet || '') || !/Woodcutting is slower without it/.test(told || '')) fails.push('AW-60 Storage says ' + JSON.stringify([quiet, told]));
      }
      if (errors.length) fails.push('AW-60 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // AW-65 a Storage press answers in view
      const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
      const W65 = '[data-hs-win="storage"] ';
      const STACK = W65 + '[data-side="bag"] .hw-pocket[data-item="copper_ore"]';
      const stored = Object.fromEntries(Object.keys(ITEMS).slice(0, 60).map((i) => [i, 3]));
      const bagFull = Object.fromEntries(Object.keys(ITEMS).slice(60, 100).map((i) => [i, 14]));
      const long = (e) => { e.bank = Object.assign({}, stored); e.inventory = Object.assign({}, e.inventory, bagFull, { copper_ore: 14 }); };
      /* The line as a player sees it: its words, in the scrolled body's view or not, and whether it lies on the stack. */
      const lineNow = (page) => page.evaluate(([w, st]) => {
        const body = document.querySelector(w + '[data-hs-body]'), m = document.querySelector(w + '.hh-intent-msg'), s = document.querySelector(st);
        const b = body.getBoundingClientRect(), r = m.getBoundingClientRect(), k = s.getBoundingClientRect();
        return { text: m.textContent, scrolled: body.scrollTop, inView: r.height > 0 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1, onStack: r.height > 0 && r.top < k.bottom && k.top < r.bottom,
          sending: s.classList.contains('is-sending'), stackTop: Math.round(k.top) };
      }, [W65, STACK]);
      const reach = async (page) => {
        await openWin(page, 't', 'storage');
        await page.waitForTimeout(300);
        await page.locator(STACK).scrollIntoViewIfNeeded();
        await page.evaluate((st) => document.querySelector(st).scrollIntoView({ block: 'end' }), STACK);
        await page.waitForTimeout(100);
      };
      {
        const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 768 }, mutateEnv: (e) => { long(e); for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 400 }); } });
        if (!up) fails.push('AW-65 the town did not mount');
        else {
          await reach(page);
          const before = await lineNow(page);
          if (!before.scrolled) fails.push('AW-65 CONTROL: the window does not scroll, so this proves nothing');
          s.delayMs = 700;
          await page.click(STACK);
          await page.waitForTimeout(150);
          const waiting = await lineNow(page);
          if (!/^Putting it away/.test(waiting.text) || !waiting.inView || !waiting.sending) fails.push('AW-65 a press in a scrolled bag, while it waits: ' + JSON.stringify(waiting));
          await wait(page, (w) => /^Put away/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 4000);
          await page.waitForTimeout(150);
          const done = await lineNow(page);
          if (!done.inView) fails.push('AW-65 the result of a press in a scrolled bag is out of sight: ' + JSON.stringify(done));
          if (done.onStack) fails.push('AW-65 the answer lies on the stack just pressed: ' + JSON.stringify(done));
          /* The next press lands where the hand is: its answer moves nothing now the line is up. */
          await page.click(STACK);
          await page.waitForTimeout(100);
          await wait(page, (w) => /^Put away/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 4000);
          await page.waitForTimeout(150);
          const twice = await lineNow(page);
          if (twice.stackTop !== done.stackTop) fails.push('AW-65 the stack moved under the hand: y ' + done.stackTop + ' then ' + twice.stackTop);
          if (sent(s, 'hr_bank_move').length !== 2) fails.push('AW-65 two presses sent ' + sent(s, 'hr_bank_move').length + ' moves');
          s.delayMs = 0;
          s.reply = { ok: false, error: 'bank_full', cap: 400 };
          await page.click(STACK);
          await wait(page, (w) => /full/.test(document.querySelector(w + '.hh-intent-msg').textContent), W65, 5000);
          const refused = await lineNow(page);
          if (refused.text !== 'Your storage is full.' || !refused.inView) fails.push('AW-65 a refusal in a scrolled bag: ' + JSON.stringify(refused));
          s.reply = { ok: true };
        }
        if (errors.length) fails.push('AW-65 console errors: ' + errors.slice(0, 2).join(' | '));
        await ctx.close();
      }
      {
        const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 768 }, mutateEnv: long });
        if (!up) fails.push('AW-65 the hunt did not mount');
        else {
          await reach(page);
          await page.click(STACK, { button: 'right', force: true });
          await page.waitForTimeout(150);
          const asked = await lineNow(page);
          if (!/out hunting/.test(asked.text) || !asked.inView) fails.push('AW-65 a right-click with the hero out hunting does not say why in view: ' + JSON.stringify(asked));
          /* Home: the line no longer holds. */
          const away = clone(s.env);
          for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete s.env[k];
          s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          const home = await lineNow(page);
          if (home.text) fails.push('AW-65 back in town the line still says ' + JSON.stringify(home.text));
          /* Out again, the line empty: a press says why by itself. */
          s.env = away;
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          await page.evaluate((st) => document.querySelector(st).scrollIntoView({ block: 'end' }), STACK);
          await page.click(STACK, { force: true });
          await page.waitForTimeout(150);
          const said = await lineNow(page);
          if (!/out hunting/.test(said.text) || !said.inView) fails.push('AW-65 a press with the hero out hunting does not say why in view: ' + JSON.stringify(said));
          if (sent(s, 'hr_bank_move').length) fails.push('AW-65 a hero out hunting sent a move');
        }
        if (errors.length) fails.push('AW-65 console errors (hunting): ' + errors.slice(0, 2).join(' | '));
        await ctx.close();
      }
    }

    { // AW-66 the summary's answer line and its width
      const W66 = '[data-hs-win="hunt-summary"] ';
      const OVER = { hunt: 'mill_cellar', preset: 0, bag: [], end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: 'left', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' };
      const past = (id, at) => ({ id, hunt: 'mill_cellar', at, reason: 'party_member_left', by: 'Bramwell', why: 'left', ms: 3600000, kills: 1336, xp: 12176, gold: 1135, lootValue: 2243, balance: 3378, balanceH: 1944, rawXpH: 7009, died: 0, loot: [], supplies: [], preset: 0, hoursLimit: null, bag: [], deaths: [] });
      const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 620 }, mutateEnv: (e) => {
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        for (const k of ['hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.hunt.ended = true;
        e.hunt.session = Object.assign({}, e.hunt.session, OVER);
      }, residue: { huntSummaries: [past('11111111-0000-4000-8000-000000000001', Date.parse('2026-10-17T12:30:00Z')), past('11111111-0000-4000-8000-000000000002', Date.parse('2026-10-17T11:00:00Z'))] } });
      if (!up) fails.push('AW-66 the town did not mount');
      else {
        if (!(await openWin(page, 'l', 'hunt-summary'))) fails.push('AW-66 the summary did not open');
        else {
          await page.waitForTimeout(300);
          /* The card with every number on it: the presses are pushed down to the window's foot. */
          await page.click(W66 + '.hsum-past [data-hs-act="pick"]');
          await page.waitForTimeout(200);
          /* The press's line, as this hero's scratch holds it: its words go with the hunt they were said about. */
          await page.evaluate((w) => { const b = document.querySelector(w + '[data-hs-act="again"]'); if (b) { b.disabled = false; b.click(); } }, W66);
          await page.waitForTimeout(700);
          const said = await page.evaluate((w) => {
            const body = document.querySelector(w + '[data-hs-body]'), m = document.querySelector(w + '.hh-intent-msg');
            body.scrollTop = 0;   // the window as it opens: reaching Earlier hunts scrolled it past the presses
            const r = m.getBoundingClientRect();
            /* It stands under every press, wherever the window is scrolled: stuck to the foot it lay on one, or over one still below the fold. */
            const on = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length)
              .filter((x) => r.top < x.getBoundingClientRect().bottom - 1).map((x) => x.textContent);
            /* ...and every press is in reach as the window opens, whatever the reason and the numbers above them weigh (door panel 2026-11-04). */
            const br = body.getBoundingClientRect();
            const cut = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length)
              .filter((x) => { const b = x.getBoundingClientRect(); return b.bottom > br.bottom + 1 || b.top < br.top - 1; }).map((x) => x.textContent);
            const foot = document.querySelector(w + '.hsum-foot').getBoundingClientRect();
            return { text: m.textContent, scrolls: body.scrollHeight - body.clientHeight, on, cut, gap: Math.round(br.bottom - foot.bottom) };
          }, W66);
          if (said.cut.length) fails.push('AW-66 under the summary\'s fold as it opens: ' + said.cut.join(', '));
          if (Math.abs(said.gap) > 1) fails.push('AW-66 the numbers read on ' + said.gap + ' px under the summary\'s presses');
          if (!/^Setting out/.test(said.text)) fails.push('AW-66 CONTROL: Hunt again did not say it set out: ' + JSON.stringify(said));
          if (said.scrolls <= 0) fails.push('AW-66 CONTROL: the card does not scroll at this size, so the line has nothing to lie on');
          if (said.on.length) fails.push('AW-66 the summary\'s answer stands over ' + said.on.join(', '));
          s.env.hunt = Object.assign({}, s.env.hunt, { ended: false, session_id: '5d1c0f2e-0000-4000-8000-000000000066', session: Object.assign({}, s.env.hunt.session, { end_reason: null, ended_at: null, phase: 'hunting' }) });
          await pushEnvelope(page, s);
          s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: Object.assign({}, s.env.hunt.session, OVER) });
          await pushEnvelope(page, s);
          await page.waitForTimeout(400);
          const home = await page.evaluate((w) => { const m = document.querySelector(w + '.hh-intent-msg'); return m ? m.textContent : null; }, W66);
          if (/Setting out/.test(home || '')) fails.push('AW-66 the hero is home and the summary still says ' + JSON.stringify(home));
          /* On a phone's sheet the presses come right under the reason and lie on none of the numbers. */
          await page.setViewportSize({ width: 844, height: 390 });
          await page.waitForTimeout(400);
          const sheet = await page.evaluate((w) => {
            const body = document.querySelector(w + '[data-hs-body]'), stats = document.querySelector(w + '.hsum-stats').getBoundingClientRect();
            body.scrollTop = 0;
            const br = body.getBoundingClientRect();
            const on = Array.from(document.querySelectorAll(w + '.hsum-actions button')).filter((x) => !x.hidden && x.getClientRects().length).map((x) => x.getBoundingClientRect());
            return { n: on.length, inReach: on.every((b) => b.bottom <= br.bottom + 1 && b.top >= br.top - 1), clear: on.every((b) => b.bottom <= stats.top + 1) };
          }, W66);
          if (!sheet.n || !sheet.inReach || !sheet.clear) fails.push('AW-66 the summary on a phone: ' + JSON.stringify(sheet));
        }
      }
      if (errors.length) fails.push('AW-66 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // AW-67 nothing lies on the press in hand
      const W67 = '[data-hs-win="inventory"] ';
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        e.inventory = Object.assign({}, e.inventory, { bones: 23 });
      };
      /* The press takes a real click at its middle: nothing lies on it, and it is inside the column's view. */
      const takes = (page, sel) => page.evaluate((q) => {
        const b = document.querySelector(q);
        if (!b || !b.getClientRects().length) return { hit: false, why: 'not on screen' };
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), low = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
        const on = (n) => !!n && (n === b || b.contains(n));
        return { hit: on(top) && on(low), top: top && (top.className || top.tagName), low: low && (low.className || low.tagName) };
      }, sel);
      const { ctx, page, errors, s, up } = await open({ viewport: { width: 1366, height: 660 }, mutateEnv: town });
      s.onCall = (name, b) => { if (name === 'hr-accrue' && b.verb === 'set_activity') Object.assign(s.env.state, b.activity && b.activity.kind ? { active_kind: b.activity.kind, active_id: b.activity.id } : { active_kind: 'idle', active_id: null }); };
      if (!up) fails.push('AW-67 the town did not mount');
      else {
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(300);
        await page.evaluate((w) => { const m = document.querySelector(w + '.hh-intent-msg'); m.textContent = 'Put on 1 piece.'; }, W67);
        await page.click(W67 + '.hw-pocket[data-item="bones"]');
        await page.waitForTimeout(250);
        const col = await page.evaluate((w) => { const c = document.querySelector(w + '.hw-inv'); return c.scrollHeight - c.clientHeight; }, W67);
        if (col <= 0) fails.push('AW-67 CONTROL: the column does not overflow at this size, so this proves nothing');
        const fuel = await takes(page, W67 + '.hw-pick [data-hs-act="primary"]');
        if (!fuel.hit) fails.push('AW-67 Fuel all does not take a press with the stack in hand: ' + JSON.stringify(fuel));
        await page.click(W67 + '.hw-pick [data-hs-act="primary"]');
        await wait(page, (w) => document.querySelector(w + '.hw-burying.is-on'), W67, 4000);
        await page.waitForTimeout(400);
        const line = await page.evaluate((w) => document.querySelector(w + '.hh-intent-msg').textContent, W67);
        /* The press that worked reads as one: the job's own line has the Stop, and no "Already fueling... Stop it first." sits over it. */
        const onFire = await page.evaluate((w) => document.querySelector(w + '.hw-pick-why').textContent, W67);
        if (onFire) fails.push('AW-67 the stack just put on the fire is refused in words: ' + JSON.stringify(onFire));
        const stop = await takes(page, W67 + '[data-hs-act="bury-stop"]');
        if (!stop.hit) fails.push('AW-67 Stop does not take a press while it fuels (line ' + JSON.stringify(line) + '): ' + JSON.stringify(stop));
        /* The player's own scroll stands: the next patch does not pull the column back. */
        await page.evaluate((w) => { document.querySelector(w + '.hw-inv').scrollTop = 0; }, W67);
        await page.waitForTimeout(700);
        if ((await page.evaluate((w) => document.querySelector(w + '.hw-inv').scrollTop, W67)) !== 0) fails.push('AW-67 the column fights the player\'s own scroll');
        /* The Shop's tabs on a scrolled body. */
        await openWin(page, 'v', 'shop');
        await page.waitForTimeout(300);
        await page.click('[data-hs-win="shop"] .hw-tab:last-child');
        await page.waitForTimeout(250);
        const tabs = await page.evaluate(() => {
          const b = document.querySelector('[data-hs-win="shop"] [data-hs-body]'), t = document.querySelector('[data-hs-win="shop"] .hw-tabs');
          b.scrollTop = 40;
          const br = b.getBoundingClientRect(), r = t.getBoundingClientRect();
          return { scrolled: b.scrollTop, whole: r.top >= br.top - 1 && r.bottom <= br.bottom, gap: Math.round(r.top - br.top) };
        });
        if (!tabs.scrolled) fails.push('AW-67 CONTROL: the Shop does not scroll at this size');
        if (!tabs.whole) fails.push('AW-67 the Shop\'s tabs are cut on a scrolled body: ' + JSON.stringify(tabs));
        if (tabs.gap > 1) fails.push('AW-67 the list reads on ' + tabs.gap + ' px above the Shop\'s stuck tabs');
        /* A tab opens at its top: a carried-over scroll laid its first press behind the stuck tabs. */
        /* the press itself, not Playwright's: its click scrolls the page to the tab first */
        const topped = await page.evaluate(async () => {
          const b = document.querySelector('[data-hs-win="shop"] [data-hs-body]');
          /* this fixture's other tabs are short and would clamp a kept scroll to 0: a floor under them keeps it */
          const floor = document.createElement('div'); floor.style.height = '1500px'; b.append(floor);
          b.scrollTop = 40;
          const was = b.scrollTop;
          document.querySelector('[data-hs-win="shop"] .hw-tab:first-child').click();
          await new Promise((r) => setTimeout(r, 200));
          const now = b.scrollTop;
          floor.remove();
          return { was, now };
        });
        if (!topped.was) fails.push('AW-67 CONTROL: the Shop does not scroll before its tab is pressed');
        if (topped.now !== 0) fails.push('AW-67 the Shop\'s tab opened scrolled down by ' + topped.now);
        /* The card's figure is what the bag would fetch, never a purse (Tyler 10-23: one purse per account). */
        await openWin(page, 'o', 'characters');
        await page.waitForTimeout(250);
        const bagWords = await page.evaluate(() => (document.querySelector('.hw-char .hw-char-bag') || {}).textContent);
        if (!/^Bag worth /.test(bagWords || '')) fails.push('AW-67 the All characters card reads ' + JSON.stringify(bagWords));
        /* AW-71 THE SAME CARD KEEPS ITS BOX AND ITS WORDS FOLLOW THE SERVER (door panel 2026-11-04: "You have 19 left" over a bar reading 6, for the whole hunt). */
        const coachNow = await page.evaluate(async () => {
          const { placeCoach } = await import(location.origin + '/src/shell/launcher.js');
          const box = document.createElement('div');
          const card = (n) => '<p class="hs-pointer" data-coach="first_eat"><b>Your hero just ate</b> <span class="hs-coach-text">You have ' + n + ' left.</span></p>';
          placeCoach(box, card(19));
          const first = box.querySelector('.hs-pointer');
          placeCoach(box, card(19));
          placeCoach(box, card(6));
          return { same: box.querySelector('.hs-pointer') === first, one: box.children.length === 1, words: first.querySelector('.hs-coach-text').textContent };
        });
        if (!coachNow.same || !coachNow.one || coachNow.words !== 'You have 6 left.') fails.push('AW-71 the same card over a new number reads ' + JSON.stringify(coachNow));
        /* AW-72 A RING STANDS CLEAR OF THE ANSWER LINE (door panel 2026-11-04, a phone's Services: the next Bless behind "Blessing I is yours."). */
        const clear = await page.evaluate(async () => {
          const { revealInWindow } = await import(location.origin + '/src/shell/widgets/bits.js');
          const win = document.createElement('div'); win.setAttribute('data-hs-win', 'x');
          win.innerHTML = '<div class="box" style="overflow:auto;height:200px"><div style="height:150px"></div><button style="height:40px;display:block">Bless</button><div style="height:300px"></div>'
            + '<p class="hh-intent-msg" style="position:sticky;bottom:0;margin:0;height:40px">Said.</p></div>';
          document.body.append(win);
          const b = win.querySelector('button');
          revealInWindow(b);
          const out = { press: Math.round(b.getBoundingClientRect().bottom), line: Math.round(win.querySelector('.hh-intent-msg').getBoundingClientRect().top) };
          win.remove();
          return out;
        });
        if (clear.press > clear.line) fails.push('AW-72 a ring landed under the answer line: ' + JSON.stringify(clear));
      }
      if (errors.length) fails.push('AW-67 console errors: ' + errors.slice(0, 2).join(' | '));
      await ctx.close();
    }

    { // AW-18 amounts in Storage; AW-19 bury — a stateful stub: the server's answer moves its own counts
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = { oak_logs: 12, iron_bar: 3, shrimp: 2 };
        e.inventory = Object.assign({}, e.inventory, { raw_wolf_meat: 4, raw_bear_meat: 2, bronze_arrows: 12000 });
      };
      const { ctx, page, errors, s, up } = await open({ mutateEnv: town });
      const shift = (from, to, id, n) => { from[id] -= n; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + n; };
      s.onCall = (name, b) => {
        if (name === 'hr_bank_move' && s.reply.ok !== false) { if (b.p_dir === 'deposit') shift(s.env.inventory, s.env.bank, b.p_item, b.p_qty); else shift(s.env.bank, s.env.inventory, b.p_item, b.p_qty); }
        if (name === 'hr-accrue' && b.verb === 'set_activity') {
          if (b.activity.kind === 'artisan') Object.assign(s.env.state, { active_kind: 'artisan', active_id: b.activity.id });
          else {
            const inv = s.env.inventory;
            if (s.env.state.active_id === 'fuel_bones') { s.env.skills.inner_flame.xp += 6 * (inv.bones || 0); delete inv.bones; }
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
          /* AW-18b (Andy 10-26): 12,000 arrows, Shift-pressed, go in as ONE hr_bank_move of 12,000; a refused deposit
             says the bag's words (not Storage's) in a line the player can see without scrolling, and moves nothing. */
          const W18 = '[data-hs-win="storage"] ';
          const msgSeen = () => page.evaluate((w) => {
            const m = document.querySelector(w + '.hh-intent-msg'); const win = document.querySelector(w.trim());
            if (!m || !m.textContent) return null;
            const r = m.getBoundingClientRect(); let box = win.getBoundingClientRect();
            for (let n = m.parentElement; n && n !== win.parentElement; n = n.parentElement) {
              if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) { const b = n.getBoundingClientRect(); box = { top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom) }; }
            }
            return { text: m.textContent, shown: r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
          }, W18);
          s.reply = { ok: false, error: 'insufficient_item', item_id: 'copper_ore', have: 0, need: 7 };
          await page.click(W18 + '[data-side="bag"] .hw-pocket[data-item="copper_ore"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          s.reply = { ok: true };
          const said = await msgSeen();
          if (!said || said.text !== 'You no longer have that many Copper Ore.') fails.push('AW-18b a refused deposit says ' + JSON.stringify(said && said.text));
          else if (!said.shown) fails.push('AW-18b the refusal of a deposit is out of sight (under the grids, where a full bag scrolls it away)');
          if ((await sc('bag', 'copper_ore')) !== '7') fails.push('AW-18b a refused deposit moved the bag to ' + (await sc('bag', 'copper_ore')));
          await page.click(W18 + '[data-side="bag"] .hw-pocket[data-item="bronze_arrows"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          const arrows = sent(s, 'hr_bank_move').slice(-1).map((c) => c.body.p_item + ':' + c.body.p_qty + ':' + c.body.p_dir).join();
          if (arrows !== 'bronze_arrows:12000:deposit') fails.push('AW-18b a Shift-press on 12,000 arrows sent ' + arrows);
          const label = await page.evaluate((w) => { const li = document.querySelector(w + '[data-side="bank"] .hw-pocket[data-item="bronze_arrows"]'); return li ? li.getAttribute('aria-label') : null; }, W18);
          if (!/, 12,000: /.test(String(label)) || (await sc('bag', 'bronze_arrows')) !== null) fails.push('AW-18b after 12,000 arrows went in, storage reads ' + JSON.stringify(label) + ' and the bag ' + (await sc('bag', 'bronze_arrows')));
          const done = await msgSeen();
          if (!done || !/^Put away 12,000 /.test(done.text) || !done.shown) fails.push('AW-18b the 12,000-arrow deposit says ' + JSON.stringify(done));
          await page.click(W18 + '[data-side="bank"] .hw-pocket[data-item="bronze_arrows"]', { modifiers: ['Shift'] });
          await page.waitForTimeout(800);
          if ((await sc('bag', 'bronze_arrows')) === null) fails.push('AW-18b the 12,000 arrows did not come back out');
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
          await page.click(W + '.hw-cat[data-cat="material"]');
          await page.selectOption(W + '[data-hs-act="sort"]', 'count');
          await page.waitForTimeout(1900);
          const views = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.storeView).filter(Boolean);
          const last = views[views.length - 1];
          if (!last || last.cat !== 'material' || last.sort !== 'count') fails.push('AW-23 the chip and sort were not put as storeView: ' + JSON.stringify(views));
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
        /* AW-19 Fuel the hearth: the bones' primary is Fuel all 8; ONE set_activity; Stop collects; the server's numbers only */
        await openWin(page, 'b', 'inventory');
        await page.click('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]');
        const prim = await page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]').textContent);
        if (prim !== 'Fuel all 8') fails.push('AW-19 the bones offer "' + prim + '", not Fuel all 8');
        else {
          await page.click('[data-hs-win="inventory"] .hw-pick [data-hs-act="primary"]');
          await page.waitForTimeout(800);
          const go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"artisan","id":"fuel_bones"}' || Object.keys(go[0].body).sort().join() !== 'activity,intentId,slot,verb')
            fails.push('AW-19 Fuel all sent ' + JSON.stringify(go.map((c) => c.body)));
          const line = await page.evaluate(() => { const b = document.querySelector('[data-hs-win="inventory"] .hw-burying'); return b && b.classList.contains('is-on') ? b.textContent : ''; });
          if (!/^Fueling the Great Hearth with Bones: 8 Bones left\. Your bag and Inner Flame XP update as it goes\./.test(line)) fails.push('AW-19 no Fueling line from the server pointer: ' + JSON.stringify(line));
          if ((await count(page, 'bones')) !== '8') fails.push('AW-19 the bag painted the bury before the server paid it: bones x' + (await count(page, 'bones')));
          if (shots) await shot(page, 'alpha-1440x900-burying');
          await page.click('[data-hs-win="inventory"] [data-hs-act="bury-stop"]');
          await page.waitForTimeout(800);
          const stop = sent(s, 'hr-accrue', 'set_activity').slice(1);
          if (stop.length !== 1 || JSON.stringify(stop[0].body.activity) !== '{"kind":"idle"}') fails.push('AW-19 Stop sent ' + JSON.stringify(stop.map((c) => c.body)));
          const after = await page.evaluate(() => ({ bones: !!document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]'), msg: document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent }));
          if (after.bones || after.msg !== 'Done: +48 Inner Flame XP.') fails.push('AW-19 after the server burnt them: ' + JSON.stringify(after));
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
            if (bear === 'Cook all' && (low !== 'You need Cooking 40 to cook Raw Bear Meat. You have 11.' || sent(s, 'hr-accrue', 'set_activity').length !== 2)) fails.push('AW-20 Cook all above the level said ' + JSON.stringify(low));
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
        /* Level 30 (gear is worn by Level, Tyler 2026-10-24): the bag's Steel Sword is better than the worn Iron Sword, the same family, so it goes on
           (designer 2026-11-03); the Mithril Helm needs Level 45. */
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
      const WANT = '{"belt":"bronze_belt","body":"iron_platebody","gloves":"leather_gloves","helmet":"iron_helm","ring2":"copper_ring","weapon":"steel_sword"}';
      const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1))));
      const msg = () => page.evaluate(() => document.querySelector('[data-hs-win="inventory"] .hh-intent-msg').textContent);
      if (up) aw21: {
        await openWin(page, 'b', 'inventory');
        await page.waitForTimeout(250);
        const pre = await page.evaluate(() => { const l = document.querySelector('.hw-inv .hw-upgrade'); return { on: l.classList.contains('is-on'), q: l.querySelector('.hw-upgrade-q').textContent, off: l.querySelector('button').disabled }; });
        /* Every step below presses or reads this line: when it is already wrong the catch is made, so stop here rather than click a line a mutant
           reshaped (nightly run 42678595702: a 6 s click timeout on a loaded runner read as HARNESS, not the catch it was). */
        if (!pre.on || pre.off || !/^Wear Iron Helm \(\+\d+ Defense/.test(pre.q) || /Steel|Mithril/.test(pre.q)) { fails.push('AW-21 the preview line is wrong before the press: ' + JSON.stringify(pre)); break aw21; }
        /* A REQUIREMENT THE SERVER'S NUMBERS SAY IS UNMET (Tyler 2026-10-24, "Gear swapping isn't working": Fingerguns
           was offered Equip on a helm he could not wear, and the refusal said nothing on screen; gear is worn by Level
           since): the picked line's Equip is off and says why, and a press sends nothing. */
        await page.click('.hw-pocket[data-item="mithril_helm"]');
        await page.waitForTimeout(150);
        const need = await page.evaluate(() => ({ off: document.querySelector('.hw-inv [data-hs-act="primary"]').disabled,
          why: document.querySelector('.hw-inv .hw-pick-why').textContent }));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        if (!need.off || need.why !== 'Needs Level 45 (you\'re 30).' || sent(s, 'hr-accrue', 'equip').length) fails.push('AW-21 a Mithril Helm at Level 30 reads ' + JSON.stringify(need) + ', ' + sent(s, 'hr-accrue', 'equip').length + ' equip(s) sent');
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
        if (mid.slots !== 'belt,body,gloves,helmet,ring2,weapon' || mid.stacks !== 6 || !mid.off) fails.push('AW-21 the upgrades in flight are not marked on their slots and stacks: ' + JSON.stringify(mid));
        await wait(page, () => !document.querySelector('.hw-slot.is-wearing'), null, 3000);
        await page.waitForTimeout(200);
        const eqs = sent(s, 'hr-accrue', 'equip');
        if (eqs.length !== 2 || sorted(eqs[0].body.equip) !== WANT || sorted(eqs[1].body.equip) !== WANT) fails.push('AW-21 Equip upgrades sent ' + JSON.stringify(eqs.map((c) => c.body.equip)) + ', want ' + WANT + ' once per press');
        if (eqs.some((c) => 'shield' in c.body.equip || 'ammo' in c.body.equip)) fails.push('AW-21 Equip upgrades touched the off-hand or the ammo');
        const after = await page.evaluate(() => ({ helm: document.querySelector('.hw-slot[data-slot="helmet"]').getAttribute('data-item'), weapon: document.querySelector('.hw-slot[data-slot="weapon"]').getAttribute('data-item'),
          line: document.querySelector('.hw-inv .hw-upgrade').classList.contains('is-on') }));
        if (after.helm !== 'iron_helm' || after.weapon !== 'steel_sword' || after.line || (await msg()) !== 'Put on 6 pieces.') fails.push('AW-21 after the server answered: ' + JSON.stringify(after) + ' ' + JSON.stringify(await msg()));
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
        if (!tree || tree.off || tree.btn !== 'Start' || !/^Normal Log · about [\d,]+ an hour · [\d.]+ s · \d+ XP each$/.test(tree.what) || tree.why !== '40 in your bag') fails.push('AW-22 Woodcutting offers ' + JSON.stringify(tree));
        if (!oak || !oak.off || !/^You need Woodcutting 15 to chop the Oak Tree\. You have \d+\.$/.test(oak.why)) fails.push('AW-22 a tree above the server level reads ' + JSON.stringify(oak));
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
          if (!axe || !axe.off || !/^You need Smithing 3 to make Bronze Axe\. You have \d+\.$/.test(axe.why)) fails.push('AW-22 a recipe above the server level reads ' + JSON.stringify(axe));
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
          /* AW-76 A STATION SORTS (Andy, Discord 2026-11-11): Smithing's menu opens on Can make (the old order); Name puts the same
             rows A to Z, locked ones too, as ONE residue put naming stationSort; after a reload the menu and the order come back. */
          const menu = () => page.evaluate((w) => { const box = document.querySelector(w + ' .hw-work.is-on .hw-work-sort'); const sel = box && box.querySelector('select');
            return box ? { shown: !box.hidden && box.getBoundingClientRect().height > 0, value: sel.value, labels: [...sel.options].map((o) => o.textContent).join() } : null; }, W);
          const names = () => page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-work.is-on .hw-work-row .hw-line-name b')).map((b) => b.textContent), W);
          const aToZ = (xs) => xs.slice().sort((a, b) => a.localeCompare(b, 'en')).join();
          const m0 = await menu(), byCan = await names();
          if (!m0 || !m0.shown || m0.value !== 'can' || m0.labels !== 'Can make,Level,Name') fails.push('AW-76 Smithing\'s Sort menu reads ' + JSON.stringify(m0));
          await page.selectOption(W + ' .hw-work-sort select', 'name');
          await page.waitForTimeout(200);
          const byName = await names();
          if (byName.join() !== aToZ(byCan) || byName.join() === byCan.join() || !(await rowsOf()).some((x) => x.off && /^You need Smithing /.test(x.why))) fails.push('AW-76 Name orders ' + byName.join() + ' (Can make had ' + byCan.join() + ')');
          for (let i = 0; i < 40 && !sent(s, 'hr_put_client_state').some((c) => c.body.p_patch && c.body.p_patch.stationSort); i++) await page.waitForTimeout(100);
          const puts = sent(s, 'hr_put_client_state').map((c) => c.body.p_patch && c.body.p_patch.stationSort).filter(Boolean);
          if (JSON.stringify(puts) !== '[{"smithing":"name"}]') fails.push('AW-76 the pick was put as ' + JSON.stringify(puts));
          if (!(await reloadAndPlay(page))) fails.push('AW-76 the reload did not come back');
          else {
            await openWin(page, 'g', 'skills-trade');
            await page.click(W + ' .hw-skill[data-skill="smithing"]');
            await page.waitForTimeout(300);
            const m1 = await menu(), back = await names();
            if (!m1 || m1.value !== 'name' || back.join() !== aToZ(back) || back.length !== byCan.length) fails.push('AW-76 after a reload Smithing reads ' + JSON.stringify(m1) + ': ' + back.join());
            await page.click(W + ' [data-hs-act="work-back"]');
            await page.click(W + ' .hw-skill[data-skill="woodcutting"]');
            await page.waitForTimeout(300);
            const m2 = await menu();
            if (!m2 || m2.shown) fails.push('AW-76 gathering shows a Sort menu: ' + JSON.stringify(m2));
          }
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
      const fresh = (e) => { for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'inner_flame', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 }; for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 }); };
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
        /* AW-73 ON A PHONE THE CARD'S CROSS IS DRAWN IN ITS BUTTON (door panel 2026-11-04): static, it lay over the words in the middle of every closable card. */
        const cross = await page.evaluate(() => {
          const p = document.createElement('p'); p.className = 'hs-pointer has-close';
          p.innerHTML = '<b>A card</b> <span class="hs-coach-text">words</span><button class="hs-coach-min"></button><button class="hs-coach-close"></button>';
          document.querySelector('.hs-launchers').append(p);
          const x = p.querySelector('.hs-coach-close'), out = { pos: getComputedStyle(x).position, width: x.getBoundingClientRect().width };
          p.remove();
          return out;
        });
        if (cross.pos === 'static' || cross.width !== 40) fails.push('AW-73 the phone card\'s cross: ' + JSON.stringify(cross));
        if (await openWin(page, 'h', 'hunts')) {
          await page.waitForTimeout(400);
          const r1 = await ringed();
          const inWin = await page.evaluate(() => { const p = document.querySelector('[data-hs-win="hunts"] > .hs-win-coach .hs-pointer'); return p ? p.textContent : null; });
          if (r1.join() !== 'mill_cellar') fails.push('AW-17b with Hunts open on the phone the ring is on ' + JSON.stringify(r1) + ', wanted the Mill Cellar line');
          /* inside the window it says its words for there (board 2026-10-25 #20: never "Open Hunts" over the open Hunts), and the ringed line first (playtest 10-29) */
          if (!inWin || !/Press the Mill Cellar, then Enter/.test(inWin) || /Open Hunts/.test(inWin)) fails.push('AW-17b the card is not inside the Hunts sheet, in its words for there: ' + JSON.stringify(inWin));
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

    { // AW-61 NOTHING CLIPS: every window's title and a Shop name, in a wide fallback font (GitHub's Linux runner has one); a member's Hunt again is off and says why
      /* ONE HERO ON THE ACCOUNT (lane/a-strip-all-heroes): the stub answers every slot with this same hero, so slot 1 was a second
         "Tyler" that never showed; the strip now lists a hero not open beside the shown one, and two tabs share the top bar. The
         job's rule is about one tab's room. */
      const stall = (e) => { e.hero_slots = [0]; e.shop = Object.assign({}, e.shop, { offers: [{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }, { offer: 'gear.iron_helm', item: 'iron_helm', kind: 'gear', price: 180 }],
        bids: Object.assign({}, e.shop.bids, { alpha_fang: 450, rat_tail: 1 }) }); e.inventory = Object.assign({}, e.inventory, { alpha_fang: 3, rat_tail: 4 }); };
      const { ctx, page, s, up } = await open({ viewport: { width: 1365, height: 846 }, mutateEnv: stall });
      if (!up) fails.push('AW-61 the page did not mount');
      else {
        /* AW-62 AT THE LAPTOP'S WIDTH, IN THE GAME'S OWN FONT: the stance words whole on the bar; the analyzer's tabs inside their panel; Inventory's foot in the window with a coach card up. */
        const readChrome = () => page.evaluate(() => {
          const stance = Array.from(document.querySelectorAll('.hb-stance .hh-seg')).map((b) => ({ t: b.textContent, over: b.scrollWidth - b.clientWidth }));
          const panel = document.querySelector('[data-hs-widget="analyzer"]');
          const tabs = panel ? Array.from(panel.querySelectorAll('.ha-tab')).map((b) => ({ t: b.textContent, right: b.getBoundingClientRect().right, over: b.scrollWidth - b.clientWidth })) : [];
          const d = document.querySelector('.char-tab.is-shown .char-tab-doing') || document.querySelector('.char-tab-doing');
          let label = null;
          if (d) { const was = d.textContent; d.textContent = 'In town, fueling the Great Hearth with Bones'; label = d.scrollWidth - d.clientWidth; d.textContent = was; }
          return { stance, tabs, label, edge: panel ? panel.getBoundingClientRect().right : null };
        });
        /* THE WIDE FONT, WHOLE: --f-ui with nothing after it to fall to (tests/_test-fonts.mjs draws it the same on every machine; run 41385560100:
           the job 9 px and the stance words 7 px over), at the laptop's width and, for the bar's words, at a Steam Deck's 1280. */
        const wideFont = await page.addStyleTag({ content: ":root, body, body[data-theme] { --f-ui: 'Alegreya Sans' !important; }" });
        const wide = await readChrome();
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(150);
        const deck = await readChrome();
        await page.setViewportSize({ width: 1365, height: 846 });
        await page.waitForTimeout(150);
        await wideFont.evaluate((e) => e.remove());
        const own = await readChrome();
        for (const [font, chrome] of [['the wide font', wide], ['this box\'s font', own]]) {
          if (chrome.label === null || chrome.label > 0) fails.push('AW-62 in ' + font + ' the top bar cuts a hero\'s job by ' + chrome.label + ' px');
        }
        for (const [font, chrome] of [['the wide font', wide], ['the wide font at 1280', deck], ['this box\'s font', own]]) {
          if (chrome.stance.length !== 3 || chrome.stance.some((s) => s.over > 0)) fails.push('AW-62 in ' + font + ' the stance words read ' + JSON.stringify(chrome.stance));
          if (chrome.tabs.length && chrome.tabs.some((t) => t.over > 0 || t.right > chrome.edge)) fails.push('AW-62 in ' + font + ' the analyzer tabs read ' + JSON.stringify(chrome));
        }
        const { SHELL_WINDOWS } = await import(pathToFileURL(join(ROOT, 'src/data/shell-windows.js')).href);
        const heads = await page.evaluate((list) => list.map((r) => {
          const host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;width:' + r.width + 'px';
          host.innerHTML = '<header class="hs-win-head"><span class="hs-glyph"></span><h2 class="hs-win-title"></h2>' + (r.key ? '<kbd class="hs-key">M</kbd>' : '') + '<button class="hs-close"></button></header>';
          host.querySelector('h2').textContent = r.title;
          document.body.appendChild(host);
          const t = host.querySelector('h2'), got = { id: r.id, w: t.scrollWidth - t.clientWidth, band: host.firstChild.offsetHeight, ell: getComputedStyle(t).textOverflow };
          host.remove();
          return got;
        }), SHELL_WINDOWS.map((r) => ({ id: r.id, title: r.title || r.label, width: r.width, key: r.key })));
        for (const h of heads) if (h.w > 0 || h.band > 46 || h.ell === 'ellipsis') fails.push('AW-61 the ' + h.id + ' title clips: ' + JSON.stringify(h));
        /* the Shop on the phone (a sheet, half of 667): the name has its own line and is never cut; desktop keeps its one row */
        const shopNames = async (p, tag) => {
          await p.addStyleTag({ content: ":root { --f-ui: 'Alegreya Sans' !important; --f-display: 'Alegreya Sans' !important; }" });
          if (!(await openWin(p, 'v', 'shop'))) { fails.push('AW-61 the Shop did not open at ' + tag); return; }
          await wait(p, () => document.querySelector('[data-hs-win="shop"] .hw-line-name b'), null, 3000);
          const names = await p.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="shop"] .hw-line-name b')).filter((b) => b.getClientRects().length).map((b) => ({ t: b.textContent, over: b.scrollWidth - b.clientWidth })));
          if (!names.length) fails.push('AW-61 no Shop name to measure at ' + tag);
          for (const n of names) if (n.over > 0) fails.push('AW-61 ' + tag + ': the Shop cuts ' + JSON.stringify(n));
        };
        await shopNames(page, '1365');
        /* AW-62 the Shop's confirmation names the rare finds in the sale */
        await page.click('[data-hs-win="shop"] .hw-tab[data-tab="sell"]');
        await wait(page, () => document.querySelector('[data-hs-act="sell-loot"]:not([disabled])'), null, 3000);
        await page.click('[data-hs-act="sell-loot"]');
        const saleNote = await page.evaluate(() => document.querySelector('[data-pane="sell"] .hw-confirm-note').textContent);
        if (!/This sells rare finds: 3 Alpha Fang\./.test(saleNote)) fails.push('AW-62 Sell all loot asks: ' + saleNote);
        await page.click('[data-hs-win="shop"] [data-hs-act="confirm-no"]');
        await page.keyboard.press('v');
        /* AW-62 Inventory's foot stands inside the window at a laptop's height, the bag scrolling above it, with a card up too */
        if (!(await openWin(page, 'b', 'inventory'))) fails.push('AW-62 Inventory did not open');
        else {
          await page.setViewportSize({ width: 1366, height: 768 });
          await page.waitForTimeout(300);
          const foot = await page.evaluate(() => {
            const w = document.querySelector('[data-hs-win="inventory"]');
            w.querySelector('.hs-win-coach').insertAdjacentHTML('beforeend', '<p class="hs-pointer is-line"><b>A card</b> <span class="hs-coach-text">words</span></p>');
            const bottom = (q) => { const e = w.querySelector(q); return e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().bottom) : null; };
            const out = { win: Math.round(w.getBoundingClientRect().bottom), foot: bottom('.hw-inv-foot'), tools: bottom('.hw-tools'), scroll: w.querySelector('.hw-inv-scroll').clientHeight };
            w.querySelector('.hs-win-coach').textContent = '';
            return out;
          });
          /* three whole rows of 44 px wells under a card (it was 97 px: two rows beside a cut doll) */
          if (foot.foot === null || foot.foot > foot.win || foot.tools === null || foot.tools > foot.win || foot.scroll < 130) fails.push('AW-62 Inventory at 1366x768 reads ' + JSON.stringify(foot));
          await page.keyboard.press('b');
          /* the Hunts how-to stands aside for a card there, and comes back */
          if (await openWin(page, 'h', 'hunts')) {
            const hint = await page.evaluate(() => {
              const w = document.querySelector('[data-hs-win="hunts"]'), n = w.querySelector('.hw-hunts-now'), slot = w.querySelector('.hs-win-coach');
              n.classList.add('is-hint');   // the how-to's own class: the fixture's hero is hunting, and a running hunt's line stays
              const was = getComputedStyle(n).display;
              slot.insertAdjacentHTML('beforeend', '<p class="hs-pointer is-line"><b>A card</b></p>');
              const under = getComputedStyle(n).display;
              slot.textContent = '';
              return { was, under };
            });
            if (hint.was === 'none' || hint.under !== 'none') fails.push('AW-62 the Hunts how-to beside a card reads ' + JSON.stringify(hint));
            await page.keyboard.press('h');
          }
          await page.setViewportSize({ width: 1365, height: 846 });
        }
        const phone = await open({ viewport: { width: 667, height: 375 }, mutateEnv: stall });
        if (!phone.up) fails.push('AW-61 the phone did not mount');
        else await shopNames(phone.page, '667');
        await phone.ctx.close();
        /* a member's summary: Hunt again is off, says who chooses, and sends nothing */
        const seat = (n, name) => ({ seat: n, name, unit: 10 + n, hunting: false });
        s.env.party = { id: '00000000-0000-4000-a000-0000000000aa', hunt: 'mill_cellar', max: 4, leader_seat: 0, self_seat: 1, members: [seat(0, 'Bramwell'), seat(1, 'Brannoc')] };
        s.env.hunt = Object.assign({}, s.env.hunt, { ended: true, session: { end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: 'stamina', preset: 0, ended_at: '2026-10-25T00:20:00Z', phase: 'ended' } });
        s.env.state = Object.assign({}, s.env.state, { active_kind: 'idle', active_id: null });
        await pushEnvelope(page, s);
        if (!(await wait(page, () => document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="again"]'), null, 4000))) fails.push('AW-61 the member\'s summary did not open');
        else {
          await page.waitForTimeout(300);
          const seen = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-summary"]'); const b = w.querySelector('[data-hs-act="again"]'); return { off: b.disabled, why: w.querySelector('.hh-intent-msg').textContent, reason: w.querySelector('.hsum-reason').textContent }; });
          if (!seen.off || seen.why !== 'Hunt again is off. Your party leader picks the hunt and starts it.') fails.push('AW-61 a member\'s Hunt again reads ' + JSON.stringify(seen));
          if (!/Bramwell ran out of stamina, so .* came home too\./.test(seen.reason)) fails.push('AW-61 the member\'s end card reads ' + seen.reason);
          /* the leader's own press is the party's Start, never a lone Enter */
          s.env.party = Object.assign({}, s.env.party, { self_seat: 0, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          const mark = s.calls.length;
          await page.click('[data-hs-win="hunt-summary"] [data-hs-act="again"]');
          await page.waitForTimeout(400);
          const names = s.calls.slice(mark).map((c) => c.name);
          if (!names.includes('hr_hunt_party_start') || names.includes('hr_hunt_enter')) fails.push('AW-61 the leader\'s Hunt again sent ' + names.join(','));
          s.env.party = Object.assign({}, s.env.party, { self_seat: 1, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          /* AW-63 sent home still in the party (midgame panel 2026-11-01): Hunts' Enter is off with its reason beside it, and Leave party there is ONE intent */
          if (await openWin(page, 'h', 'hunts')) {
            await page.waitForTimeout(200);
            const foot = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'), e = w.querySelector('.hw-hunt-enter'), l = w.querySelector('[data-hs-act="leave-party"]'); return { off: e.disabled, why: w.querySelector('.hw-enter-why').textContent, leave: !l.hidden && l.getClientRects().length > 0 }; });
            if (!foot.off || !/^You're in Bramwell's party, and they pick the hunt\./.test(foot.why) || !foot.leave) fails.push('AW-63 a member\'s Hunts foot reads ' + JSON.stringify(foot));
            const mk = s.calls.length;
            await page.click('[data-hs-win="hunts"] [data-hs-act="leave-party"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunts\"] [data-hs-act=\"leave-party\"]'"));
            await page.waitForTimeout(300);
            if (s.calls.slice(mk).filter((c) => /party_leave/.test(c.name)).length !== 1) fails.push('AW-63 Leave party in Hunts sent ' + s.calls.slice(mk).map((c) => c.name).join());
            await page.keyboard.press('h');
          }
          /* AW-63 the Party window: its answer under its presses, Disband whole and asking first, a seat coming retires an old answer */
          s.env.party = Object.assign({}, s.env.party, { self_seat: 0, leader_seat: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(200);
          if (await openWin(page, 'y', 'hunt-party')) {
            await page.click('[data-hs-win="hunt-party"] .hw-tab[data-tab="party"]').catch(() => {});
            await page.click('[data-hs-win="hunt-party"] [data-hs-act="invite-name"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunt-party\"] [data-hs-act=\"invite-name\"]'"));
            await page.waitForTimeout(150);
            const lay = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-party"]'), m = w.querySelector('.hw-party > .hh-intent-msg').getBoundingClientRect(), a = w.querySelector('.hw-party-acts').getBoundingClientRect(), d = w.querySelector('[data-hs-act="disband"]'), dr = d.getBoundingClientRect(), b = w.querySelector('.hs-win-body').getBoundingClientRect();
              return { over: m.height > 0 && m.top < a.bottom && a.top < m.bottom, clip: d.scrollWidth - d.clientWidth, past: dr.right - b.right, said: w.querySelector('.hw-party > .hh-intent-msg').textContent }; });
            if (lay.over || lay.clip > 0 || lay.past > 0 || !lay.said) fails.push('AW-63 the Party window lays out as ' + JSON.stringify(lay));
            /* ...and where the window scrolls too (a 1366x768 laptop's browser: 620 px of page), the presses scrolled to its foot: the sticky
               answer every other window keeps would pin itself there, over Leave party and Disband (an unscrolled window never shows it). */
            await page.setViewportSize({ width: 1366, height: 620 });
            await page.waitForTimeout(200);
            const low = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-party"]'), body = w.querySelector('.hs-win-body'), acts = w.querySelector('.hw-party-acts'), m = w.querySelector('.hw-party > .hh-intent-msg');
              const scrolls = body.scrollHeight > body.clientHeight + 1;
              body.scrollTop += acts.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom;
              const a = acts.getBoundingClientRect(), r = m.getBoundingClientRect();
              return { scrolls, said: m.textContent, over: r.height > 0 && r.top < a.bottom && a.top < r.bottom, msg: [Math.round(r.top), Math.round(r.bottom)], acts: [Math.round(a.top), Math.round(a.bottom)] }; });
            await page.setViewportSize({ width: 1365, height: 846 });
            await page.waitForTimeout(200);
            if (!low.scrolls || !low.said) fails.push('AW-63 CONTROL: at 1366x620 the Party window does not scroll with its answer up: ' + JSON.stringify(low));
            else if (low.over) fails.push('AW-63 scrolled to its presses, the Party window\'s answer lies over them: ' + JSON.stringify(low));
            s.env.party = Object.assign({}, s.env.party, { members: s.env.party.members.concat([{ seat: 2, name: 'Solace', unit: 12, hunting: false }]) });
            await pushEnvelope(page, s);
            await page.waitForTimeout(300);
            const stale = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-party"] .hw-party > .hh-intent-msg').textContent);
            if (stale) fails.push('AW-63 an old answer stands after a seat came: ' + stale);
            const dk = s.calls.length;
            await page.click('[data-hs-win="hunt-party"] [data-hs-act="disband"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunt-party\"] [data-hs-act=\"disband\"]'"));
            await page.waitForTimeout(150);
            const armed = await page.evaluate(() => document.querySelector('[data-hs-win="hunt-party"] [data-hs-act="disband"]').textContent);
            if (armed !== 'Sure?' || s.calls.slice(dk).some((c) => /disband/.test(c.name))) fails.push('AW-63 Disband\'s first press: ' + armed);
            await page.keyboard.press('y');
          }
          /* AW-63 a lone hero far under a ground's floor (Tyler 2026-11-04 UTC: never blocked): Enter is live under the words, the first press arms "Enter anyway" and sends nothing */
          delete s.env.party;
          s.env.state = Object.assign({}, s.env.state, { level_xp: 0 });
          await pushEnvelope(page, s);
          await page.waitForTimeout(300);
          if (await openWin(page, 'h', 'hunts')) {
            await page.click('[data-hs-win="hunts"] .hw-hunt[data-hunt="coppercap_warrens"]').catch(() => fails.push('AW-63 could not press ' + "'[data-hs-win=\"hunts\"] .hw-hunt[data-hunt=\"coppercap_warrens\"]'"));
            await page.waitForTimeout(200);
            const far = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'), e = w.querySelector('.hw-hunt-enter'); return { off: e.disabled, why: w.querySelector('.hw-enter-why').textContent, warn: w.querySelector('.hw-hunt-warn').textContent, label: e.textContent }; });
            if (far.off || far.why !== '' || far.label !== 'Enter' || !/^You're 31 Levels under this ground\. .*you lose 6% of your Level XP\.$/.test(far.warn)) fails.push('AW-63 Coppercap far under its floor reads ' + JSON.stringify(far));
            const sentBefore = s.calls.filter((c) => c.name === 'hr_hunt_enter').length;
            await page.click('[data-hs-win="hunts"] .hw-hunt-enter');
            await page.waitForTimeout(200);
            const armed = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunts"]'); return { label: w.querySelector('.hw-hunt-enter').textContent, said: w.querySelector('.hh-intent-msg').textContent }; });
            if (armed.label !== 'Enter anyway' || armed.said !== 'Press Enter anyway to go.' || s.calls.filter((c) => c.name === 'hr_hunt_enter').length !== sentBefore) fails.push('AW-63 the first press of Enter under the floor reads ' + JSON.stringify(armed));
          }
        }
      }
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

    if (shots) { // AW-34's look on a landscape phone: the worn-weight line and a plate helmet's tooltip
      const { ctx, page, up } = await open({ viewport: { width: 844, height: 390 }, mutateEnv: (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        Object.assign(e.equipment, { helmet: 'iron_helm', body: 'bronze_platebody', pants: 'apprentice_pants' });
      } });
      if (up && await openWin(page, 'b', 'inventory')) {
        await page.waitForTimeout(300);
        await page.evaluate(() => document.querySelector('.hw-weights').scrollIntoView({ block: 'center' }));
        await page.mouse.move(2, 380);
        await page.waitForTimeout(150);
        await shot(page, 'armour-weight-844x390-doll');
        await page.hover('.hw-slot[data-slot="helmet"]');
        await page.waitForTimeout(150);
        await shot(page, 'armour-weight-844x390-doll-tip');
      } else fails.push('AW-34 the 844x390 Inventory did not open');
      await ctx.close();
    }
  } catch (e) {
    /* A step that threw is HARNESS, never a rule (2026-10-22: AW-8's disabled click "caught" every later
       mutant). A rule whose control a mutant can hide checks for the control and fails BY NAME. */
    if (e !== STOP) fails.push(harnessFail('a page step', e));
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['armor weight: the doll line never shows', 'src/shell/windows/inventory/doll.js', "  cls(p, 'is-on', !!eq);", "  cls(p, 'is-on', false);"],
  ['armor weight: the doll line counts the bag, not the worn set', 'src/shell/windows/inventory/doll.js', "for (const x of wornWeights(eq))", "for (const x of wornWeights(Object.fromEntries((bagOf(st.cs) || []).map((r, i) => [i, r.id]))))"],
  ['armor weight: the tooltip drops the weight line', 'src/shell/windows/item-tip.js', '  if (wt) h +=', '  if (wt && false) h +='],
  ['armor weight: the share is not the server sum', 'src/data/armour-weights.js', "const pct = (pm) => '+' + (Math.round(pm) / 10) + '%';", "const pct = (pm) => '+' + (Math.round(pm) / 10 + 1) + '%';"],
  ['AW-60 the Shop forgets the House', 'src/shell/windows/shop.js', 'const needs = upgradeNeeds(homeOf(st.cs), chestsOf(st.cs));', 'const needs = undefined;'],
  ['AW-60 Storage puts a tool away in silence', 'src/shell/windows/storage.js', "const slower = dir === 'deposit' ? toolLossWords(cs, id, qty) : '';", "const slower = '';"],
  ['AW-60 the tooltip says nothing of a stack no one buys', 'src/shell/windows/item-tip.js', 'const sale = saleWords(id);', "const sale = '';"],
  ['item truth: a whetstone is fired from a bow again', 'src/shell/item-lore.js', "if (it.reqSkill === 'melee') return t('item.ammo_whetstone'", "if (it.reqSkill === 'nope') return t('item.ammo_whetstone'"],
  ['item truth: a tool says sell it again', 'src/shell/item-lore.js', "  if (tool) out.push(tool);\n", ''],
  ['item truth: a kit stone says sell it', 'src/shell/item-lore.js', "Number(it.v) > 0 ? t('item.sell_it') : ", "true ? t('item.sell_it') : "],
  ['item truth: a seed says sell it', 'src/shell/item-lore.js', "  if (it.seed) out.push(t('item.plant_it'));\n", ''],
  ['station sort: Level runs high to low', 'src/shell/station-sort.js', "if (sort === 'level') return all.sort((a, b) => reqOf(a) - reqOf(b));", "if (sort === 'level') return all.sort((a, b) => reqOf(b) - reqOf(a));"],
  ['station sort: Name is not a sort', 'src/shell/station-sort.js', "  if (sort === 'name') return all.sort(byName);\n", ''],
  ['station sort: a sort drops the locked rows', 'src/shell/station-sort.js', '  const all = open.concat(ahead);', '  const all = open.slice();'],
  ['station sort: Can make no longer puts what the bag makes first', 'src/shell/station-sort.js', 'can(b) - can(a) || reqOf(b) - reqOf(a)', 'reqOf(b) - reqOf(a)'],
  ['station sort: the default is Level', 'src/shell/station-sort.js', "export const DEFAULT_SORT = 'can';", "export const DEFAULT_SORT = 'level';"],
  ['station sort: a pick forgets the other stations', 'src/shell/station-sort.js', "const out = Object.assign({}, own(residue, 'stationSort')", "const out = Object.assign({}, false && own(residue, 'stationSort')"],
  ['station sort: the pick is not kept on the server', 'src/session/residue.js', '  stationSort: sanitizeStationSort,', '  stationSortX: sanitizeStationSort,'],
  ['station sort: a forged key is kept', 'src/session/residue.js', "if (ID.test(id) && Object.prototype.hasOwnProperty.call(SKILLS_DEF, id) && ", 'if (ID.test(id) && '],
  /* THE HUNT PREP BUILDER (AW-77 .. AW-84): the copy, its one intent, the drop, Save and use, Use equipped, New, Fights as, Sort, Clear, the read. */
  ['prep builder: Save drops the stance', 'src/shell/prep-draft.js', '  if (known(d.stance)) o.stance = d.stance;\n', ''],
  ['prep builder: Save sends a null for an option the server never sent', 'src/shell/prep-draft.js', '  if (known(d.goldFloor)) o.gold_floor = d.goldFloor;', '  o.gold_floor = d.goldFloor;'],
  ['prep builder: a drop on a filled slot does nothing', 'src/shell/prep-draft.js', '  return bar[to] ? swapPlan(bar, from, to) : movePlan(bar, from, to);', '  return bar[to] ? null : movePlan(bar, from, to);'],
  ['prep builder: Save and use never puts the setup on', 'src/shell/windows/hunt-prep/builder.js', '    await settleTownActivity(cs);\n    return cs.applyPreset(preset);', '    return r;'],
  ['prep builder: a refused save still puts the setup on', 'src/shell/windows/hunt-prep/builder.js', '    if (!r.ok || !andUse) return r;', '    if (!andUse) return r;'],
  ['prep builder: a stale copy still saves', 'src/shell/windows/hunt-prep/builder.js', '  if (!sc.draft || sc.pending || sc.stale) return;', '  if (!sc.draft || sc.pending) return;'],
  ['prep builder: Use equipped sends at the first press', 'src/shell/windows/hunt-prep/setups.js', '    if (!sc.armingEquipped) { sc.armingEquipped = true; repaint(); return true; }\n', ''],
  ['prep builder: New saves over a used number', 'src/shell/windows/hunt-prep/setups.js', '  const free = firstFree(presetsOf(cs));', '  const free = (presetsOf(cs) || []).length;'],
  ['prep builder: the hint shows for the role already worn', 'src/shell/windows/hunt-prep/builder.js', "  if (roleHint && roleHint !== role && HUNT_ROLES[roleHint]) return t('prep.fights_' + roleHint);", "  if (roleHint && HUNT_ROLES[roleHint]) return t('prep.fights_' + roleHint);"],
  ['prep builder: Sort changes nothing', 'src/shell/windows/hunt-prep/builder.js', "  if (action === 'sort' && click) { d.slots = sortBar(d.slots); sc.sorted = true;", "  if (action === 'sort' && click) { sc.sorted = true;"],
  ['prep builder: Clear leaves the bar', 'src/shell/windows/hunt-prep/builder.js', "  if (action === 'clear' && click) { d.slots = clearedBar(); sc.cleared = true;", "  if (action === 'clear' && click) { sc.cleared = true;"],
  ['prep builder: the setup in use is read from the server', 'src/session/preset-read.js', '  if (live && live.preset === preset) return { ok: true, set: live, live: true, name: null };\n', ''],
  ['prep builder: the read asks for another number', 'src/session/preset-read.js', "{ p_slot: cs.slot, p_preset: preset }", "{ p_slot: cs.slot, p_preset: preset + 1 }"],
  ['AW-76 the window ignores the station\'s pick', 'src/shell/windows/work.js', 'rowsFor(skill, lv, heldOf(cs), sort)', 'rowsFor(skill, lv, heldOf(cs))'],
  ['item truth: a bar a hero makes files as junk', 'src/shell/bag-model.js', "if (dropSet().has(id) && !made) return isSpentMaterial(id) || plannedUse(id) ? 'material' : 'junk';", "if (dropSet().has(id)) return isSpentMaterial(id) || plannedUse(id) ? 'material' : 'junk';"],
  ['item truth: a tool files as a material', 'src/shell/bag-model.js', "const made = it.type !== 'tool' && madeSet().has(id);", 'const made = madeSet().has(id);'],
  ['item truth: the shop\'s raw flag files a tool as a material', 'src/shell/bag-model.js', "if (it.type === 'tool') return 'other';", ''],
  ['item truth: Sell all loot ignores the House', 'src/shell/bag-model.js', ' && !(needs && needs.has(r.id))', ''],
  ['item truth: a gated room counts as a next step', 'src/shell/bag-model.js', 'if (r.next && r.opens <= home.tier && r.next.need <= home.tier) step(r.next);', 'if (r.next) step(r.next);'],
  ['item truth: Sell all junk sweeps a Material', 'src/shell/bag-model.js', "return (items || []).filter((r) => kindOf(r.id) === 'junk' && ", "return (items || []).filter((r) => kindOf(r.id) !== 'gear' && "],
  ['item truth: a storage move of the counting tool is silent', 'src/shell/town-work.js', "if (!before || before.id !== id) return '';", "return '';"],
  ['item truth: storing one of two warns', 'src/shell/town-work.js', "  if (left > 0) return '';\n", ''],
  ['item truth: no tool line', 'src/shell/town-work.js', "  const inBag = pick(skill, invOf(cs));\n", "  if (skill) return '';\n  const inBag = pick(skill, invOf(cs));\n"],
  ['item truth: the tool line offers a rod no one can get', 'src/shell/town-work.js', "ITEMS[id].toolSkill === skill && whereToGet(id));", "ITEMS[id].toolSkill === skill);"],
  ['item truth: an axe in Storage goes unsaid', 'src/shell/town-work.js', "  if (better) return 'Your ' + better;\n", ''],
  ['item truth: a recipe\'s shortage names no source', 'src/shell/town-work.js', "(where ? ' ' + where + '.' : '')", "''"],
  ['item truth: an easy source lists the drop too', 'src/shell/item-lore.js', 'const drop = !easy && r.drops.length ?', 'const drop = r.drops.length ?'],
  ['item truth: a hard source hides the drop', 'src/shell/item-lore.js', 'const drop = !easy && r.drops.length ?', 'const drop = false ?'],
  ['item truth: no-book-value says nothing', 'src/shell/item-lore.js', "if (!(Number(it.v) > 0) || it.bop) return t('item.own_use')", "if (false) return t('item.own_use')"],
  ['item truth: a kit item says the Weighhouse lists it', 'src/shell/item-lore.js', "return isStartKit(id) ? t('item.kit_unlisted')", "return false ? t('item.kit_unlisted')"],
  ['item truth: the Weighhouse has one vague reason', 'src/shell/market-words.js', "(Object.prototype.hasOwnProperty.call(WHY_NOT, why) ? ': ' + WHY_NOT[why] + '.' : '.')", "'.'"],
  ['item truth: panel: the line over her board goes', 'src/shell/windows/tally.js', "  return !t.weight ? (suggest ? suggest.words : NO_WEIGHT_WHY) : t.held.length >= t.heldMax ? FULL_WHY : '';", "  return '';"],
  ['item truth: panel: Fuel all keeps its old number', 'src/shell/windows/inventory/bury.js', "  if (cs && buryingOf(cs) === e) return e.skill === 'cooking' ? 'Cooking…' : 'Fueling…';\n", ''],
  ['item truth: panel: the sale hides its rares', 'src/shell/item-lore.js', "rare.length ? t('item.sells_rares', { items: listWords(rare) }) : ''", "''"],
  ['item truth: panel: a slot on sale beside an empty one', 'src/app/slot-offer.js', "if (!offer || !purse || actor === null || anEmptySlot(roster)) return '';", "if (!offer || !purse || actor === null) return '';"],
  ['item truth: panel: the play line sells a slot beside an empty one', 'src/app/slot-offer.js', "  if (anEmptySlot(rows)) return 'You own '", "  if (false) return 'You own '"],
  ['item truth: panel: the press drops the replaced job\'s line', 'src/shell/town-work.js', "return [replaced, words].filter(Boolean).join(' ');", "return words || '';"],
  ['item truth: panel: a replaced job says nothing', 'src/shell/town-work.js', "  return what ? 'You stopped ' + what + '.' : '';", "  return '';"],
  ['item truth: panel: pressing the running job says it stopped', 'src/shell/town-work.js', "if (!now || now.id === w.id || !townWorkRunning(", "if (!now || !townWorkRunning("],
  ['AW-62 the Shop\'s confirmation hides the rares', 'src/shell/windows/shop.js', "[p.spare ? '' : rareSaleWords(p.lines), p.kept.length", "[p.kept.length"],
  ['AW-62 the stance words clip', 'src/styles/hunt.css', '.hb-plaque { position: relative; align-self: stretch; width: 232px;', '.hb-plaque { position: relative; align-self: stretch; width: 170px;'],
  ['AW-62 the top bar cuts a hero\'s job', 'src/styles/app.css', '  min-width: 0; max-width: 360px;\n', '  min-width: 0; max-width: 250px;\n'],
  ['AW-62 a wide font clips the stance words', 'src/styles/hunt.css', 'font-size: var(--t-micro); font-size-adjust: var(--f-ui-aspect); letter-spacing: 0;', 'font-size: var(--t-micro); letter-spacing: 0;'],
  ['AW-62 a wide font cuts a hero\'s job', 'src/styles/app.css', '.char-tab-doing { font-size: var(--t-micro); font-size-adjust: var(--f-ui-aspect);', '.char-tab-doing { font-size: var(--t-micro);'],
  ['AW-62 the how-to stays beside a card', 'src/styles/shell.css', '[data-hs-win="hunts"]:has(.hs-win-coach .hs-pointer) .hw-hunts-now.is-hint { display: none; }\n', ''],
  ['AW-62 the analyzer tab runs past the panel', 'src/styles/hunt.css', '.ha-tabs .ha-tab { margin-bottom: -2px; padding: 0 4px; }', '.ha-tabs .ha-tab { margin-bottom: -2px; }'],
  ['item truth: panel: a coach card takes the window', 'src/shell/launcher.js', "(line ? ' is-line' : '')", "''"],
  ['AW-62 the foot scrolls off', 'src/styles/windows.css', '.hs-win[data-hs-win="inventory"] .hs-win-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }\n', ''],
  ['AW-63 the first press of Enter under the floor walks straight in', 'src/shell/windows/hunts.js', "if (above && rangeWords(above, levelOf(cs)) && sc.warned !== warnKey(hunt, [])) {", 'if (false) {'],
  ['item truth: panel: a full bag says nothing', 'src/shell/windows/inventory/index.js', "  return used >= cap ? 'Your bag is full.", "  return false ? 'Your bag is full."],
  ['AW-63 Enter off has no reason beside it', 'src/shell/windows/hunts.js', "  text(det.querySelector('.hw-enter-why'), off || choosing);\n", ''],
  ['AW-63 a member has no way out at Enter', 'src/shell/windows/hunts.js', "  prop(det.querySelector('[data-hs-act=\"leave-party\"]'), 'hidden', now || !follower);\n", ''],
  ['AW-65 the answer stays behind a scrolled bag', 'src/styles/windows.css', '.hs-win .hh-intent-msg:not(:empty, .ca-msg) { position: sticky; bottom: 0; z-index: 1; padding: 6px 10px; }', '.hs-win .hh-intent-msg:not(:empty, .ca-msg) { padding: 6px 10px; }'],
  ['AW-65 a result lies on the stack pressed', 'src/shell/press-ack.js', '    clearOfAnswer(p.el);\n', '    if (p.refused) clearOfAnswer(p.el);\n'],
  ['AW-65 a press mid-hunt says nothing', 'src/shell/windows/storage.js', 'if (off || !row) { sayAway(cs, sc, repaint); return true; }', 'if (off || !row) return true;'],
  ['AW-65 a right-click mid-hunt says nothing', 'src/shell/windows/storage.js', '    else sayAway(cs, sc, repaint);\n', ''],
  ['AW-65 the why stays up in town', 'src/shell/windows/storage.js', "  if (!away && sc.msg === STORE_AWAY) sc.msg = '';   // back in town, it no longer holds\n", ''],
  ['item truth: panel: a request already answered still toasts (AW-61)', 'src/shell/social-watch.js', "(a.kind === 'friend' && !asked.has(a.id)) || ", ''],
  ['item truth: panel: a message already read still toasts (AW-61)', 'src/shell/social-watch.js', " || (a.kind === 'whisper' && !unread.has(a.peer))", ''],
  ['AW-66 "Setting out." outlives its hunt', 'src/shell/windows/hunt-summary.js', "  if (sc.huntNow !== huntNow) { if (!sc.pending) sc.msg = ''; sc.huntNow = huntNow; }\n", ''],
  ['AW-66 the summary\'s answer lies on its presses', 'src/styles/windows.css', '.hs-win .hsum-foot > .hh-intent-msg:not(:empty) { position: static; }\n', '.hs-win .hsum-foot > .hh-intent-msg:not(:empty) { position: absolute; top: 0; pointer-events: none; }\n'],
  ['AW-66 the summary\'s presses sit under the fold', 'src/styles/summary.css', '.hsum-foot { position: sticky; bottom: -12px; z-index: 2;', '.hsum-foot {'],
  ['AW-66 the numbers read on under the summary\'s presses', 'src/styles/summary.css', 'position: sticky; bottom: -12px;', 'position: sticky; bottom: 0;'],
  ['AW-67 the Shop\'s last row reads on above its tabs', 'src/styles/windows.css', 'position: sticky; top: -10px; margin-top: -10px; padding-top: 10px;', 'position: sticky; top: 0;'],
  ['AW-67 a Shop tab keeps the last tab\'s scroll', 'src/shell/windows/shop.js', "sc.wear = false; body.scrollTop = 0; repaint(); return true; }", "sc.wear = false; repaint(); return true; }"],
  ['AW-74 a seed the land cannot grow yet is sold with no word', 'src/shell/windows/shop.js', "  const tier = requiredPlotLevel(crop) > (field ? field.plotLevel : 1) ? requiredPlotLevel(crop) : 0;\n", '  const tier = 0;\n'],
  ['AW-73 the phone card\'s cross lies on its words', 'src/styles/shell.css', '.hs-pointer:not(.is-min) > .hs-coach-close { position: relative; top: auto; right: auto;', '.hs-pointer:not(.is-min) > .hs-coach-close { position: static;'],
  ['AW-72 a ring lands under the answer line', 'src/shell/widgets/bits.js', 'if (r.bottom > floor) { p.scrollTop += r.bottom - floor + 8; return true; }', 'if (r.bottom > b.bottom) { p.scrollTop += r.bottom - b.bottom + 8; return true; }'],
  ['AW-66 the summary\'s presses lie on a phone\'s numbers', 'src/styles/summary.css', '  .hsum-card.is-on { display: flex; flex-direction: column; }\n', ''],
  ['AW-71 the same card keeps its first number', 'src/shell/launcher.js', '  else if (key) sameCardWords(have, html);\n', ''],
  ['AW-67 the stack on the fire is refused in words', 'src/shell/windows/inventory/grid.js', "(buryingOf(st.cs) === buryRecipeOf(cur) ? '' : buryBlock(st.cs, buryRecipeOf(cur)))", 'buryBlock(st.cs, buryRecipeOf(cur))'],
  ['AW-67 the card reads as a purse', 'src/data/text/heroes.js', "  bag_worth: 'Bag worth {gold}',", "  bag_worth: 'Bag {gold}',"],
  ['AW-67 the press in hand stays under the answer', 'src/shell/windows/inventory/index.js', '  if (over > 0) root.scrollTop += over + 4;\n', ''],
  ['AW-67 the column fights the player', 'src/shell/windows/inventory/index.js', '  if (st.sc.clearSig === sig) return;\n', ''],
  ['AW-67 the Shop\'s tabs slice', 'src/styles/windows.css', '.hw-shop > .hw-tabs { position: sticky; top: -10px; margin-top: -10px; padding-top: 10px; z-index: 1; background: var(--bg-1); }\n', ''],
  ['AW-63 the answer covers Leave party', 'src/styles/windows.css', '.hs-win .hw-party > .hh-intent-msg:not(:empty) { position: static; }\n', ''],
  ['AW-63 Disband goes on one press', 'src/shell/widgets/party-panel.js', '    if (!sc.disbandArmed) {', '    if (false) {'],
  ['AW-63 an old answer stands after a seat came', 'src/shell/windows/party.js', "if (sc.msgSeats !== undefined && !sc.pending) sc.msg = '';", ''],
  ['AW-61 a window title clips again', 'src/styles/shell.css', '.hs-win-title { margin: 0; flex: 1; min-width: 0;', '.hs-win-title { margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'],
  ['AW-61 Shop names are cut again', 'src/styles/windows.css', '  .hw-shop .hw-line { flex-wrap: wrap; justify-content: flex-end; }', ''],
  ['AW-61 the summary ignores who may press', 'src/shell/windows/hunt-summary.js', "prop(go, 'disabled', sc.pending || huntOpen || !again || !route.how);", "prop(go, 'disabled', sc.pending || huntOpen || !again);"],
  ['AW-61 the leader enters alone', 'src/shell/windows/hunt-summary.js', "if (how === 'party') leadAgain(ctx, cs, sc, repaint, args.hunt);\n    else if (how === 'enter')", "if (how)"],
  ['item truth: Before you go hides the spare juice', 'src/shell/hunt-go.js', "const spare = usable && HEADS_UP_KINDS.has(kind) ? spareWords(kind, carried, barNames(s)) : '';", "const spare = '';"],
  ['item truth: Before you go nags about what is on the bar', 'src/shell/hunt-go.js', "const barNames = (s) => new Set(s.slots.filter((sl) => !sl.empty && sl.enabled !== false && sl.action.type === 'consume').map((sl) => sl.action.id));", 'const barNames = () => new Set();'],
  ['item truth: no drink slot, no word', 'src/shell/hunt-go.js', "if (spare) out.push({ id: kind, text: KIND_WORDS[kind] + ': no slot on your bar. '", "if (false) out.push({ id: kind, text: KIND_WORDS[kind] + ': no slot on your bar. '"],
  ['item truth: panel: own stock goes behind the store again', 'src/shell/bar-assign.js', 'const store = named ? -1 : storeSlotFor(wire, id);', 'const store = -1;'],
  ['item truth: panel: own stock keeps its own lower condition', 'src/shell/bar-assign.js', 'conditions: conditions.map((c) => Object.assign({}, c)), join };', 'conditions: startConditions(action), join };'],
  ['item truth: panel: a named slot is overridden', 'src/shell/bar-assign.js', 'const store = named ? -1 : storeSlotFor(wire, id);', 'const store = storeSlotFor(wire, id);'],
  ['item truth: panel: a member starts a hunt', 'src/hunt-view/summary-model.js', "return party.isLeader ? { how: 'party', why: '' } : { how: null, why: 'Your party leader picks the hunt and starts it.' };", "return party.isLeader ? { how: 'party', why: '' } : { how: 'enter', why: '' };"],
  ['item truth: panel: a member cannot go back in', 'src/hunt-view/summary-model.js', "return party.hunt === hunt ? { how: 'enter', why: '' } :", "return false ? { how: 'enter', why: '' } :"],
  ['item truth: panel: the leader enters alone', 'src/hunt-view/summary-model.js', "return party.isLeader ? { how: 'party', why: '' } :", "return party.isLeader ? { how: 'enter', why: '' } :"],
  ['item truth: panel: a finished job reads working', 'src/session/account-session.js', "return a.kind === 'busy' && !benchJobOver(read, Date.parse(body.now)) ? a.text : null;", "return a.kind === 'busy' ? a.text : null;"],
  ['item truth: panel: gathering reads as a finished job', 'src/session/bench-sections.js', "st.active_kind === 'artisan' && Object.prototype", "Object.prototype"],
  ['item truth: panel: a whisper toasts for every line', 'src/shell/social-watch.js', "if (last && !up.some((a) => a.kind === 'whisper' && a.peer === c.id)) {", 'if (last) {'],
  ['item truth: panel: a whisper with no news toasts', 'src/shell/social-watch.js', 'const last = c.unread > 0 ?', 'const last = true ?'],
  ['item truth: panel: a friend request stays silent', 'src/shell/social-watch.js', "alerts.say(cs, { id: 'friend:' + p.id,", "if (0) alerts.say(cs, { id: 'friend:' + p.id,"],
  ['item truth: panel: a live whisper fills the saved list', 'src/shell/alerts.js', 'if (!c.transient) {', 'if (true) {'],
  ['item truth: the rune says Next at level 12: Blank Rune', 'src/data/skill-unlocks.js', 'r.output && r.req <= firstAt(skill, r.output) ? nameOf(r.output) : r.name', 'r.output ? nameOf(r.output) : r.name'],
  ['armor words: her window stops naming the weights', 'src/shell/windows/tally.js', "WEIGHT_ORDER.map(weightSentence).join(' ')", "''"],
  ['armor words: the Help note forgets medium', 'src/data/how-to-play.js', "    + WEIGHT_ORDER.map(weightSentence).join(' ') + ' Pieces", "    + WEIGHT_ORDER.filter((w) => w !== 'medium').map(weightSentence).join(' ') + ' Pieces"],
  ['a bag icon draws at 1.5x in its well', 'src/styles/windows.css', '.hw-pocket .hw-ico .hh-icon, .hw-slot .hw-ico .hh-icon { width: 32px; height: 32px; }', '.hw-pocket .hw-ico .hh-icon, .hw-slot .hw-ico .hh-icon { width: 48px; height: 48px; }'],
  ['the Shop lines go 2x again', 'src/styles/windows.css', '.hw-line .hw-ico .hh-icon { width: 32px; height: 32px; }', '.hw-line .hw-ico .hh-icon { width: 64px; height: 64px; }'],
  ['the bag wells stay 36 px on Steam', 'src/styles/windows.css', 'width: round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px); height: round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px);', 'width: 36px; height: 36px;'],
  ['a bulk sale names a locked stack', 'src/shell/bag-model.js', '    if (locked.has(id)) { kept.push(id); continue; }\n', ''],
  ['the bag keeps a count the server dropped', 'src/session/item-sections.js', '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  return items;',
    '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  const prev = globalThis.__bag || [];\n  for (const p of prev) { const i = items.find((x) => x.id === p.id); if (!i) items.push(p); else i.qty = Math.max(i.qty, p.qty); }\n  globalThis.__bag = items.map((x) => ({ ...x }));\n  return items;'],
  ['bag actions stay on while an intent is in flight', 'src/shell/windows/inventory/grid.js', "prop(pb, 'disabled', sc.pending || !prim || !!wearWhy || !!eatWhy);", "prop(pb, 'disabled', !prim || !!wearWhy || !!eatWhy);"],
  ['a pocket is rebuilt whenever its count changes', 'src/shell/windows/inventory/grid.js', '    key: (r) => r.id,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),', '    key: (r) => r.id + ":" + r.qty,\n    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),'],
  ['a sale is sent without the confirmation', 'src/shell/windows/inventory/actions.js', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();\n  doSell(st, repaint);'],
  ['the Shop lists supplies again', 'src/data/supply-basics.js', "export const SHOP_SOLD_KINDS = Object.freeze(['tool', 'gear', 'seed']);", "export const SHOP_SOLD_KINDS = Object.freeze(['food', 'drink', 'ammo', 'tool', 'gear', 'seed']);"],
  ['an equip in flight is not marked', 'src/shell/windows/inventory/actions.js', '  sc.wearing = { slots: [slot], items: id ? [id] : [] };\n', ''],
  ['plans: AW-21 Equip upgrades puts a shield on', 'src/shell/upgrade-plan.js', "const STYLE_SLOTS = new Set(['shield', 'ammo']);", "const STYLE_SLOTS = new Set(['ammo']);"],
  ['Equip upgrades wears what the hero cannot use yet', 'src/shell/upgrade-plan.js', '  return have !== null && have >= it.reqLv;', '  return true;'],
  ['plans: AW-21 a hero with no weight stays bare (played 2026-11-04)', 'src/shell/upgrade-plan.js', "return chosen || wornWeightOf(equipment || {}) || WEIGHT_FOR_ROLE[role] || null;", "return chosen || null;"],
  ['plans: AW-21 a bare slot waits for a weight the bag doesn\'t hold', 'src/shell/upgrade-plan.js', "else if (!curIt) front = [front.reduce(", "else if (false) front = [front.reduce("],
  ['plans: AW-21 the window never reads the role', 'src/shell/widgets/upgrade-line.js', "prefer: preferredWeight(t ? t.weight : null, eq, s ? s.role : null) });", "prefer: t ? t.weight : null });"],
  ['plans: Equip upgrades lets a set bonus hold a hero below the next tier', 'src/shell/upgrade-plan.js', '  const set = !fits.some((id) => tierStep(ITEMS[id], curIt));', '  const set = true;'],
  ['plans: AW-21 a bane is a reason to skip the blade again', 'src/shell/upgrade-plan.js', "it.effects.some((e) => e !== 'bane')", 'it.effects.length'],
  ['plans: AW-21 a worn bane is traded for plain numbers', 'src/shell/upgrade-plan.js', '  if (banes) for (const c of MONSTER_CLASSES) { if (a.banes[c] < b.banes[c] - EPS) return false; if (a.banes[c] > b.banes[c] + EPS) more = true; }\n', ''],
  ['plans: AW-21 a worn bane keeps the blade in silence (designer small call 2, 2026-11-11)', 'src/shell/upgrade-plan.js', '  if (!front.length) return baneTrade(slot, cur, now, fits, worn, o, set);', '  if (!front.length) return null;'],
  ['plans: AW-25 the death line ignores the Blessings', 'src/shell/hunt-list.js', '  const cut = Number.isInteger(cutPermille) && cutPermille > 0 ?', '  const cut = false ?'],
  ['plans: AW-32 a plan that ran reads nothing set', 'src/shell/loot-dispatch.js', "Object.values(rules.loot).some((v) => MOVES.has(v)) ? t('shop.dispatch_all_moved')", "false ? t('shop.dispatch_all_moved')"],
  ['plans: AW-27 a shared cooldown reads as never firing', 'src/data/text/bar.js', "  shared_cooldown: 'Waits for {action} (slot {slot}) when both are ready.',", "  shared_cooldown: 'Shares a cooldown with {action} (slot {slot}), which fires first when both are ready.',"],
  ['AW-34 an item tooltip outlives its window', 'src/shell/shell.js', '    hideTipIfGone(doc);\n', ''],
  ['plans: Equip upgrades sees no worth in a ring\'s perks', 'src/shell/upgrade-plan.js', '  for (const p of perksIn(a, b)) { if (perkOf(a, p) < perkOf(b, p)) return false; if (perkOf(a, p) > perkOf(b, p)) more = true; }\n', ''],
  ['plans: Before you go names a struck spell without its fix', 'src/shell/hunt-go.js', "(fixes.length ? '. To cast '", "(fixes.length > 9 ? '. To cast '"],
  ['plans: AW-27 a club hero is warned about another weapon', 'src/shell/hunt-go.js', 'if (moveOffWeapon(s.discipline, a.id)) return null;', ''],
  ['plans: AW-27 three spells read as a fallback ("then")', 'src/shell/hunt-go.js', "+ ' gp a cast').join('. ');", "+ ' gp a cast').join(', then ');"],
  ['plans: AW-27 each store rune is said on its own', 'src/shell/hunt-go.js', "    if (same) same.names.push(p.store.name);\n    else spends.push(", "    spends.push("],
  ['plans: AW-27 a family\'s store rune said twice behind its own runes', 'src/shell/hunt-go.js', "    if (said.has(p.store.name)) continue;\n", ''],
  ['plans: AW-27 a weapon swap leaves its moves struck on the bar', 'src/shell/bar-assign.js', '  const off = (w) => moveOffWeapon(set.discipline, w.action.id);', '  const off = (w) => false;'],
  ['plans: AW-27 a weapon swap takes the other weapon moves off the bar (report #79)', 'src/shell/bar-assign.js', '  const order = moves.filter((w) => !off(w)).concat(moves.filter(off));', '  const order = moves.filter((w) => !off(w)).concat(moves.filter(off).map(() => null));'],
  ['plans: Hunt prep calls an empty food slot short', 'src/shell/hunt-go.js', "(spare ? '. ' + spare : ''), short: false });", "(spare ? '. ' + spare : ''), short: !usable });"],
  ['plans: AW-64 Hunt prep reads the bag in a hunt', 'src/shell/readiness.js', '  const carried = carriedOf(cs);', "  const inv = cs.read('inventory');\n  const carried = inv ? Object.entries(inv).map(([id, qty]) => ({ id, qty })) : null;"],
  ['plans: AW-64 a free arrow is said with the store behind it', 'src/shell/hunt-go.js', '    if (free && !o.ruled) { endless = true; break; }\n', ''],
  ['plans: AW-64 arrows are said in the bar\'s order, not the engine\'s', 'src/shell/hunt-go.js', 'of attackOrder(rows.concat([DEFAULT_ATTACK_ROW])))', 'of rows.concat([DEFAULT_ATTACK_ROW]))'],
  /* AW-65 carry in (Tyler 2026-11-02): the press sends the count the player picked, and only that. */
  ['AW-65 Carry sends the whole stack, not the count picked', 'src/shell/carry-in.js', 'carryIntoHunt(ctx.account, cs, row.id, n)', 'carryIntoHunt(ctx.account, cs, row.id, row.max)'],
  /* AW-65 carry in (Tyler 2026-11-02): what may be offered, when, how many, and the struck slot's words. */
  ['plans: AW-65 a carry offers gear and loot', 'src/shell/carry-in.js', '  return bag.filter((r) => SUPPLIES[r.id] && r.qty > 0)', '  return bag.filter((r) => r.qty > 0)'],
  ['plans: AW-65 a hunt on its way home still offers a carry', 'src/shell/carry-in.js', '!s.ended_at && !s.leave_at && !s.change_at', '!s.ended_at'],
  ['plans: AW-65 one carry offers past the server\'s per-call max', 'src/shell/carry-in.js', 'max: Math.min(r.qty, CARRY_MAX)', 'max: r.qty'],
  ['plans: AW-65 a rune spell offers no rune of its family', 'src/shell/carry-in.js', '  return !!sup && sup.own.includes(id);', '  return false;'],
  ['plans: AW-65 the loaded shot offers nothing of the worn ammo', 'src/shell/carry-in.js', "return (a.id === 'loaded' ? worn : a.id) === id;", 'return a.id === id;'],
  ['plans: AW-65 a struck slot never says its stock waits in the bag', 'src/shell/action-facts.js', '  const inPack = (id) => ((pack || []).find((r) => r.id === id) || {}).have || 0;', '  const inPack = () => 0;'],
  ['plans: AW-65 a shot waiting for its level is carried in with no word of the wait', 'src/shell/carry-in.js', "  return need ? need.text + ', so it can’t be shot until then.' : null;", '  return null;'],
  ['plans: AW-65 a waiting shot offers the carry as what makes it fire', 'src/shell/action-facts.js', "  const shot = shotProblem(a, set && set.role, skills);", "  const shot = (pack || []).some((r) => r.id === a.id) ? '' : shotProblem(a, set && set.role, skills);"],
  ['plans: AW-65 a spell whose runes are above the level says only that the server refused', 'src/shell/action-facts.js', "    if (sl.usable === false && sl.why === 'rune_level') {", '    if (false) {'],
  ['plans: AW-65 a store rune above the level says only that the server refused', 'src/shell/action-facts.js', "    if (sl.usable === false && sl.why === 'store_level') {", '    if (false) {'],
  ['plans: AW-27 a store rune above the level is promised as what casts', 'src/shell/hunt-go.js', "  const off = sl.why === 'store_off' || sl.why === 'store_level';", "  const off = sl.why === 'store_off';"],
  ['plans: AW-64 a worn slot with none left is not said', 'src/shell/hunt-go.js', 'const parts = (dry ? [dry] : [])', 'const parts = []'],
  ['plans: AW-64 a stack no shot reaches is not said', 'src/shell/hunt-go.js', "(spare ? ' You carry ' + whole(spare.qty) + ' ' + itemName(spare.id) + ': put them on the bar to shoot them.' : '')", "''"],
  ['plans: AW-64 a whetstone reads as a spare arrow', 'src/shell/hunt-go.js', ': carried.filter((r) => r.qty > 0 && shootsItem(s.role, ITEMS[r.id]) && ammoPerShot', ': carried.filter((r) => r.qty > 0 && ammoPerShot'],
  /* the loaded slot's shot is read where its cost line is (cast-facts.js stockOf since v0.2.111; bar-draft storeOf no longer sees `worn`) */
  ['plans: AW-64 the loaded slot names a store shot it never buys', 'src/shell/cast-facts.js', "const id = Object.prototype.hasOwnProperty.call(ATTACK_KINDS, a.id) ? worn : a.id;", "const id = Object.prototype.hasOwnProperty.call(ATTACK_KINDS, a.id) ? 'steel_arrows' : a.id;"],
  ['plans: AW-64 ammo under its skill is said as what flies', 'src/shell/hunt-go.js', "    if (short) { if (!locked.some((l) => l.id === id)) locked.push({ id, text: short.text }); continue; }\n", ''],
  ['plans: AW-64 a stack under its skill is offered as a spare', 'src/shell/hunt-go.js', ' && !plan.order.includes(r.id) && !shortOf(r.id, skills, null));', ' && !plan.order.includes(r.id));'],
  ['plans: AW-70 spare gear sells the start kit', 'src/shell/bag-model.js', "kindOf(r.id) === 'gear' && !isStartKit(r.id) && ", "kindOf(r.id) === 'gear' && "],
  ['plans: AW-70 spare gear sells what the bench made from the kit', 'src/shell/bag-model.js', ' && !madeFromKit(r.id) && ', ' && '],
  ['plans: AW-70 selling the one club says nothing', 'src/shell/item-lore.js', "listWords(rare) }) : '', ...once]", "listWords(rare) }) : '']"],
  ['plans: AW-70 a kit-made piece reads as any bench work', 'src/shell/bag-model.js', "if (KIT.has(id) && ITEMS[id] && ITEMS[id].slot && ITEMS[id].slot === ITEMS[r.output].slot) KIT_MADE.set(r.output, id);", "if (KIT.has(id)) KIT_MADE.set(r.output, id);"],
  ['plans: AW-70 spare gear sells a higher tier', 'src/shell/bag-model.js', "return !w || (Number.isInteger(w.tier) && it.tier > w.tier); });", 'return !w; });'],
  ['plans: AW-70 spare gear sells what an empty slot could wear', 'src/shell/bag-model.js', "return !w || (Number.isInteger(w.tier) && it.tier > w.tier); });", "return !!w && Number.isInteger(w.tier) && it.tier > w.tier; });"],
  ['plans: AW-70 spare gear sells a Rare', 'src/shell/bag-model.js', ' && !wanted.has(r.id) && !rare(r.id) && !aboveWorn(r.id, worn)', ' && !wanted.has(r.id) && !aboveWorn(r.id, worn)'],
  ['plans: AW-70 spare gear overrides a Keep plan', 'src/shell/bag-model.js', "    && plans[r.id] !== 'keep' && plans[r.id] !== 'deposit').map((r) => r.id);", "    ).map((r) => r.id);"],
  ['plans: AW-70 a sale past the engine\'s line cap', 'src/shell/bag-model.js', '  if (plan.lines.length <= SELL_LINES_MAX) return plan;', '  return plan;'],
  ['plans: AW-21 a better weapon stays in the bag', 'src/shell/upgrade-plan.js', "const STYLE_SLOTS = new Set(['shield', 'ammo']);", "const STYLE_SLOTS = new Set(['weapon', 'shield', 'ammo']);"],
  ['plans: AW-21 Equip upgrades changes the style', 'src/shell/upgrade-plan.js', "    if (slot === 'weapon' && !sameHands(id, cur, worn)) continue;\n", ''],
  ['plans: AW-21 a bow turns into a crossbow', 'src/shell/upgrade-plan.js', ' && !!ITEMS[id].twoHanded === !!ITEMS[cur].twoHanded', ''],
  ['plans: AW-64 a slot switched Off is said as spending', 'src/shell/hunt-go.js', 'if (!sl || sl.empty || sl.enabled === false) return null;', 'if (!sl || sl.empty) return null;'],
  ['plans: Hunt prep says stamina with no amount', 'src/shell/readiness.js', "'Stamina: ' + hoursWords(st.msLeft) + ' left'", "'Stamina left'"],
  ['plans: Hunt prep calls the last hunt this hunt', 'src/shell/readiness.js', "h && !h.ended ? 'this hunt' : 'your last hunt'", "'this hunt'"],
  ['plans: Equip upgrades forgets the weight chosen at Tamsin\'s', 'src/shell/upgrade-plan.js', '    if (mine.length) front = mine;', '    if (mine.length) front = front.slice();'],
  ['plans: a Sell plan for a stack not held reads unsellable', 'src/shell/loot-dispatch.js', "if (plan === 'sell' && held && bids && !bids.has(id))", "if (plan === 'sell' && bids && !bids.has(id))"],
  ['Equip upgrades marks nothing in flight', 'src/shell/widgets/upgrade-line.js', '  sc.wearing = { slots, items: slots.map((s) => plan.ops[s]) };\n', ''],
  ['Equip upgrades sends one intent per piece', 'src/shell/widgets/upgrade-line.js', "    try { return await cs.edgeIntent('equip', { equip: Object.assign({}, plan.ops) }); } finally { sc.wearing = null; }", "    try { let r; for (const s of slots) r = await cs.edgeIntent('equip', { equip: { [s]: plan.ops[s] } }); return r; } finally { sc.wearing = null; }"],
  ['a level refusal reads as a bare refusal', 'src/data/refusal-words.js', "  requirement_not_met: 'You don\\'t meet that item\\'s requirement yet. Nothing was put on.',\n", ''],
  ['the Shop never offers Equip upgrades', 'src/shell/windows/shop.js', "sc.wear = !!o && o.kind === 'gear';", 'sc.wear = false;'],
  ['the engine answer is re-read (two round trips)', 'src/session/character-session.js', "{ if (!(carries && this._take(ans.body, 'load')) && !(await this.load())) await this.resync(); return { ok: true }; }", '{ if (!(await this.load())) await this.resync(); return { ok: true }; }'],
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
  /* AW-9's press is checked: a menu Esc leaves open lies on the stack, and that is AW-9 red by name, never a 6 s click timeout */
  ['Esc leaves the item menu over the stack (AW-9)', 'src/shell/windows/float-menu.js', "    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFloatMenu(doc); return; }", "    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }"],
  ['bones offer no Bury', 'src/shell/windows/inventory/state.js', "  if (br) return ['bury', buryLabel(br, buryQty(st.cs, id), st.cs)];\n", ''],
  ['Bury debits the bag before the server answers', 'src/shell/windows/inventory/bury.js', "  const qty = buryQty(cs, id);\n", "  const qty = buryQty(cs, id);\n  delete cs.read('inventory')[id];\n"],
  ['Stop does not collect', 'src/shell/town-work.js', "cs.edgeIntent('set_activity', { activity: { kind: 'idle' } })", "Promise.resolve({ ok: true })"],
  ['a skill opens no work', 'src/shell/windows/work.js', "attr(li, 'data-hs-act', door ? 'open-skill' : null);", "attr(li, 'data-hs-act', null);"],
  ['the client cannot declare gathering', 'src/session/edge-intents.js', "(v.kind === 'artisan' || v.kind === 'gather')", "v.kind === 'artisan'"],
  ['a work row ignores the server level', 'src/shell/town-work.js', "  if (lv < (w.row.req || 1)) return skillShortWords(", "  if (false) return skillShortWords("],
  ['the running row offers no Stop', 'src/shell/windows/work.js', "text(b, running ? 'Stop' : 'Start');", "text(b, 'Start');"],
  ['the Burying line ignores the server pointer', 'src/shell/windows/inventory/bury.js', "  if (e) return lineParts(buryingWord(e) + ' ' + itemName(e.input), runParts(cs, workOf(cs)), '. Your bag and ' + skillName(e.skill) + ' XP update as it goes.');", '  if (e) return [];'],
  ['the work line says nothing of how far it has got', 'src/shell/town-work.js', "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), how, '. ' + tail);", "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), [], '. ' + tail);"],
  ['a watched bench is never re-read', 'src/shell/shell.js', "(wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);", "false) watchTown(ctx.character);"],
  ['raw food offers no Cook all', 'src/shell/bag-model.js', "      if (!r || !r.output || r.gated || kindOf(r.output) !== 'food') continue;", '      continue;'],
  ['the bench ignores the server level', 'src/shell/windows/inventory/bury.js', "  if (lv < e.recipe.req) {", "  if (false) {"],
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
  ['coach: "Decide once" rings Bones for the shop (AW-31)', 'src/shell/windows/inventory/grid.js', "attr(sel, 'data-coin', coin.has(l.item) ? '' : null);", "attr(sel, 'data-coin', '');"],
  ['coach: R over the open Shop never switches it to Services (AW-31)', 'src/shell/shell.js', '    for (const id of wm.openIds()) if (wm.wantsTab(id) || wm.wantsFind(id)) refresh(id);\n', ''],
  ['coach: an ended hunt\'s bar stays over its open summary (AW-31)', 'src/shell/shell.js', " && !wm.isOpen('hunt-summary');", ';'],
  /* The Hunts window, master-detail (designer plan 2026-10-22): AW-25 .. AW-29. */
  ['AW-25 every creature reads common', 'src/shell/hunt-ground-facts.js', "  if (share >= SHARE_BANDS.common) return 'common';", "  return 'common';"],
  ['AW-25 a Scarce piece reads as the ground\'s Rare (odds, not the band)', 'src/shell/hunt-ground-facts.js', 'd.ch < 1 && REVEAL_BANDS.includes(bandOf(d));', 'd.ch < 1 && d.ch <= 0.05;'],
  ['AW-25 every line says Right for your level', 'src/shell/hunt-list.js', "if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return party ? t('hunts.tag_right_party') : t('hunts.tag_right_level');", "return party ? t('hunts.tag_right_party') : t('hunts.tag_right_level');"],
  ['AW-25 the band ignores the floor', 'src/shell/hunt-list.js', "  if (rangeWords(r, level)) return r.band[0] - level < FAR_UNDER_LEVELS ?", "  if (false) return r.band[0] - level < FAR_UNDER_LEVELS ?"],
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
  ['AW-27 low stamina is not said', 'src/shell/hunt-go.js', '  else if (st) {', '  else if (false) {'],
  ['plans: how long a hero lasts is said only when it is short', 'src/shell/hunt-go.js', '  else if (st) {', '  else if (st && st.msLeft < STAMINA_SAY_MS) {'],
  ['plans: no weapon is not said', 'src/shell/hunt-go.js', '    if (worn && !worn.weapon) out.push(', '    if (false) out.push('],
  ['plans: a held task that does not count here is not said', 'src/shell/hunt-go.js', '  if (tally) out.push(tally);', '  void tally;'],
  ['AW-27 a line that stops the hunt is not marked', 'src/shell/windows/hunt-detail.js', "cls(li, 'is-short', l.short);", "cls(li, 'is-short', false);"],
  ['AW-28 Find a party searches every ground', 'src/shell/windows/party-finder.js', '  const hunt = sc.ground || null, weapon = sc.weapon || null;', '  const hunt = null, weapon = sc.weapon || null;'],
  ['AW-28 the party path shows on every ground', 'src/shell/windows/hunts.js', "    partyBlock: !follower && (r.groupFit === 'party' || (party && party.isLeader)) ? {", '    partyBlock: !follower ? {'],
  ['AW-28 Bring your heroes offers a hero already in a party', 'src/shell/hunt-go.js', ' && Number.isInteger(o.slot) && !partyMembershipOf(o))', ' && Number.isInteger(o.slot))'],
  ['AW-29 the pick resets after a hunt', 'src/shell/windows/hunts.js', '  if ((!sc.pick || sc.auto) && list.length) {', '  if ((!sc.pick || sc.auto || (h && h.ended)) && list.length) {'],
  ['AW-25b the pick never follows the advice once set', 'src/shell/windows/hunts.js', '  if ((!sc.pick || sc.auto) && list.length) {', '  if (!sc.pick && list.length) {'],
  ['AW-25b a pick by hand is replaced by the advice', 'src/shell/windows/hunts.js', "    sc.pick = hunt; sc.auto = false; sc.msg = ''; sc.paged = true; repaint();", "    sc.pick = hunt; sc.msg = ''; sc.paged = true; repaint();"],
  ['edgeBody lets an unlisted field through', 'src/session/edge-intents.js', '  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;\n', ''],
  /* AW-24 in the page: the bag's pocket is where the ticker shows, so these two are judged by the page rules. */
  ['the bag shows only the server\'s count while town work runs', 'src/shell/windows/inventory/grid.js', '  patchCount(li, shown.qty, shown.ahead !== 0);', '  patchCount(li, r.qty);'],
  ['the find list builds its own rows from this hero\'s Storage again (AW-75)', 'src/shell/windows/inventory/elsewhere.js', "sc.rows.filter((r) => !(r.slot === cs.slot && r.where === 'bag')) : [];",
    "sc.rows.filter((r) => !(r.slot === cs.slot && r.where === 'bag')) : Object.entries(cs.read('bank') || {}).map(([item, qty]) => ({ slot: null, name: null, item, qty, where: 'bank' }));"],
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
  ['ticker: a bench spends inputs the bag does not hold', 'src/shell/town-ticker.js', "    removeItem(id, n) {\n      const take = Math.min(n, supply[id] || 0);\n      const fromBag = Math.min(take, bag[id] || 0);\n      supply[id] = (supply[id] || 0) - take;\n      bag[id] = (bag[id] || 0) - fromBag;\n      if (fromBag) move(id, -fromBag);\n      if (take > fromBag) stored[id] = (stored[id] || 0) - (take - fromBag);\n    },", '    removeItem(id, n) { move(id, -n); },'],
  ['ticker: a dish that may burn is counted as cooked', 'src/shell/town-ticker.js', "  const burnable = !gather && w.skill === 'cooking' && !!w.row.output && burnChance(w.row, cook, 0) > 0;", '  const burnable = false;'],
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
    console.log(fails.length ? 'alpha-windows --pure: ' + fails.length + ' rule(s) RED' : 'alpha-windows --pure: the pure rules hold (AW-0, AW-19..AW-22, AW-24 the town ticker, AW-25..AW-28 the Hunts page, AW-76 the station sort, AW-77..AW-84 the Hunt prep builder)');
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
  const picked = sharded && only ? sharded.filter(([n]) => n.startsWith(only)) : sharded;
  if (!picked || !picked.length) { console.log('  ✗ HARNESS: bad --shard (want --shard=K/N with 1 <= K <= N) or no mutant matches --only'); process.exit(2); }
  /* A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs); the nightly proves them all. */
  const shard = (process.argv.find((x) => x.startsWith('--shard=')) || '').slice(8);
  const mine = scopedMutants('tests/alpha-windows.mjs', picked, { companion: Object.fromEntries(Object.entries(COMPANION).map(([k, v]) => [k, [v[0]]])), tag: shard ? ' (shard ' + shard + ')' : '' });
  if (!mine.length) process.exit(0);
  const pureOnly = mine.every(([n]) => n.startsWith('ticker:') || n.startsWith('armor words:') || n.startsWith('plans:') || n.startsWith('item truth:') || n.startsWith('station sort:') || n.startsWith('prep builder:'));
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
    const v = await judge(() => (name.startsWith('edgeBody') ? pureMutant(over[file]) : name.startsWith('ticker:') ? tickerMutant(over) : name.startsWith('armor words:') ? tickerMutant(over, armourWordRules) : name.startsWith('item truth:') ? tickerMutant(over, itemTruthRules) : name.startsWith('plans:') ? tickerMutant(over, planRules) : name.startsWith('station sort:') ? tickerMutant(over, stationSortRules) : name.startsWith('prep builder:') ? tickerMutant(over, prepBuilderRules) : checks(over, null, { stopAtFirst: true })));
    console.log(report(name, v, counts));
  }
  console.log(exitOf(counts) ? 'alpha-windows --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)' : 'alpha-windows --mutate: ' + mine.length + '/' + mine.length + ' mutants caught, each by a named rule' + (mine === MUTANTS ? '' : ' (' + (only ? '--only=' + only + ', ' : '') + 'of ' + MUTANTS.length + ')'));
  process.exit(exitOf(counts));
}

/* --shard=K/N: every Nth mutant from the Kth. Each mutant re-runs the whole check suite (~63 s on a runner), so CI
   splits the --mutate over N jobs (smoke.yml in-page-10 / 11 / 12 / 17 / 18 / 19; ci-shape registers each shard, so a dropped
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
async function tickerMutant(over, rules = tickerRules) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-ticker-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    for (const [f, text] of Object.entries(over)) writeFileSync(join(tmp, f), text);
    return await rules(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/* The edge-body mutant is a pure module: run AW-0 against the planted text, imported from a temp copy of src (a
   data: URL cannot resolve its relative imports, e.g. ./refusal.js since say-why). */
async function pureMutant(text) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-edgebody-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    writeFileSync(join(tmp, 'src/session/edge-intents.js'), text);
    const { edgeBody } = await import(pathToFileURL(join(tmp, 'src/session/edge-intents.js')).href);
    return edgeBody(0, 'shop_buy', { offer: 'supply.wheat_bread', qty: 2, price: 1 }, 'x') ? ['AW-0 edgeBody let a price field through'] : [];
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

main();
