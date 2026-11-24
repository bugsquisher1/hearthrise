#!/usr/bin/env node
// mutant-rule-functions: checks pure selectRules armourWordRules
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-inventory.mjs — THE INVENTORY: THE BAG, THE DOLL AND THE ITEM WELLS, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-inventory.mjs             the rules
//   node tests/alpha-windows-inventory.mjs --mutate    every planted defect must turn a rule RED
//   node tests/alpha-windows-inventory.mjs --pure      its pure rules only (no browser)
//   node tests/alpha-windows-inventory.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-inventory.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-inventory.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-inventory.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/session/character-session.js src/shell/windows/float-menu.js src/shell/bag-model.js src/session/item-sections.js src/shell/windows/inventory/grid.js src/shell/windows/inventory/actions.js src/shell/windows/shop.js src/shell/windows/inventory/doll.js src/shell/windows/storage.js src/shell/upgrade-plan.js src/core/upgrade-pick.js src/shell/widgets/upgrade-line.js src/data/refusal-words.js src/styles/windows.css src/shell/shell.js src/shell/windows/item-tip.js src/data/armour-weights.js src/data/how-to-play.js src/shell/windows/inventory/index.js src/shell/windows/inventory/elsewhere.js src/shell/windows/inventory/selection.js src/data/text/bag.js
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun), pure ones planted into a temp copy of src (tickerMutant)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// The Inventory window: the windows open from their keys and the top bar, the bag patched in place with the server's counts,
// equip and Equip upgrades as intents, locks and the sale's total first, the bar drag and the bag's keys, the fail-safe
// sections, the account search, the loot plans and Dispatch loot, the item wells, every worn slot in view, the bag taking the
// window's height; pure: the bag's selection (AW-77) and the armor weights' words (AW-34).
//
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
//   AW-75 ALSO FOUND IS THE SERVER'S (audit 11-09 F1): with hr_account_items silent the Inventory search's list reads "Searching…"
//         and lists nothing built from the open envelopes; then exactly the answer's rows; a refused read says so with no rows
//   AW-9  FAIL SAFE: with no bag_rules and no shop section, lock, the loot plans
//         and Dispatch loot stay off and the bag value reads a dash; L and the This hunt tab say "Reading your locks…" and
//         "Reading your loot plans…" (bag_rules is projected, so no "switch on when the server starts keeping them")
//   AW-10 a food stack dragged onto a bar slot is ONE hr_action_set_options with
//         the whole bar restated and the item in that slot
//   AW-11 the bag's keys: an arrow moves the cursor, L locks that stack with ONE
//         hr_item_lock, Space selects it
//   AW-15 one Inventory: no Gear, Bag or Find window; the item search is only in
//         Inventory and Storage
//   AW-21 EQUIP UPGRADES: ONE equip intent naming every strictly better piece (the weapon only within its family and grip, a worn off-hand only for one of its kind, never an empty off-hand or ammo; a bane weighs only where it wins; never the weapon's style
//         or a piece above the hero's skill), its slots and stacks marked until the answer, a
//         refusal in words with nothing moved, the Shop's offer after a gear purchase, a reload agrees;
//         the screen never offers what the server refuses (Tyler 2026-10-24): an unmet requirement
//         (the server's numbers) or a running hunt turns Equip / Equip upgrades off with the reason
//         beside it, and a refusal says why on the line pressed, in view; an item card's stat lines and compare carry a piece's own
//         attribute (a resistance, a bane: the engine's numbers), and the card says what the piece does on the hero's ground
//   AW-77 THE BAG'S SELECTION BEHAVES LIKE A FILE LIST (Tyler 2026-11-11: "I can hit ctrl+A to select all, but hitting
//         it again doesn't deselect all"; src/shell/windows/inventory/selection.js, pure): Ctrl+A selects every
//         shown stack and, with every shown stack selected, none; Escape clears; a plain press with a selection
//         active selects only that stack (none active: only the cursor moves); Ctrl+press toggles; Shift+press and
//         Shift+arrow take the range from the anchor, growing and shrinking, Ctrl+Shift adding it; the line reads
//         "N selected · value X gp" at the shop's bids (the count alone with no shop) and Lock reads Unlock over a
//         locked selection; the help line names those keys and is the line the grid shows
//   AW-100 EVERY WORN SLOT IN VIEW (Tyler 2026-11-17: "why am i scrolling to see my belt/ammo slots?"): with the Inventory open,
//         in town at 1280x720, 1518x845, 1920x1080 and 922x423 and in a hunt at 1280x720, 1366x768 and 922x423, all 14 doll
//         slots (Ammo and Belt last) show whole inside every box that clips them, with nothing scrolled; the doll keeps its own
//         52 px wells where the desktop window has the room (town) and never goes under 36; the bag's spaces and gold stay in the window
//   AW-32 DISPATCH LOOT (Tyler 2026-10-25, 2027-01-23-loot-dispatch.sql): mid-hunt the Bag's Dispatch loot is off with
//         "out hunting" in view; in town the item menu offers the loot plan (Keep pressed, Deposit,
//         Sell) and the pickup filter (Don't pick up); Deposit is ONE hr_loot_rule_set {slot, item, rule, key}; the
//         starting kit's Sell is off (Deposit on); Dispatch loot is ONE hr_loot_dispatch {slot, key}, off in flight,
//         its line the server's answer ("Stored 1 stack, sold 2 stacks for 246 gp. 1 stack locked, so kept."), the bag and
//         Storage the re-read envelope's; Storage offers the same button beside the bag at 1440x900 and 844x390
//   AW-33 THE ITEM WELLS (Tyler 10-25, art/review/window-icons-2026-10-25 option C as picked): at 1440x900 the bag's
//         pockets are 44 px wells, 6 a row; Storage's are 44 px, 6 a row in each of its two wells (UI audit 2026-11-18 #4: the storage
//         at the left, the bag at the right, starting and ending on one line, each drawing the server's room left as empty pockets,
//         no pocket cut at a well's foot); the paper doll's wells are larger than the
//         bag's; the Shop's lines hold the art in a 44 px well; every item icon in Inventory, Storage and the Shop
//         draws its 32 px art at exactly 1x (a whole scale, never 1.25x / 1.5x); counts and shop prices at 16 px. At
//         922x423 (a phone) every well, count and line is what it was (36 px, 14.5 px).
//   AW-34 ARMOR WEIGHTS (Tyler 2026-10-25, src/data/armour-weights.js): the Inventory's "Armor worn" line counts the
//         SERVER's equipment (2 plate, 1 leather, 1 cloth -> "2 heavy (+9.3% max HP) · 1 medium · 1 light (+5.8% max
//         mana)", re-read when an envelope takes a piece off); a worn plate helmet's tooltip names its weight and its
//         share; PURE: every armor row's tooltip line, vitals.js adding that same share, and Tamsin's card (as written
//         and as the coach says it) and the Help note saying all three weights (`armor words:` mutants judge these).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';
import { pressBar, barWindows, hasIcon } from './_bar.mjs';
import { FIXTURE, wait, reloadAndPlay, pushEnvelope, openWin, count, sent, pageRun, plain, mutate, shardPlan, tickerMutant } from './_alpha-windows.mjs';

/* The Cellar's one gear line, alone, as the page must print it (its math is checked from the rows in huntsPure). */
/* The Level XP a hero at Level 30 holds (src/core/xp.js): gear is worn by the hero's Level (Tyler 2026-10-24). */
const LEVEL_30_XP = (await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href)).charXpForLevel(30);
/* AW-21's piece a Level 30 hero cannot wear yet: the Rune Helm (worn from its item Level less 10, 12-targets 8.3; the Mithril Helm it was
   is worn from 30 while the Ford still stamps mithril at 40) */
const LOCKED_HELM = 'rune_helm', LOCKED_LV = (await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href)).ITEMS.rune_helm.reqLv;
/* The windows a player opens from the launcher row, with their keys (src/data/shell-windows.js). */
const WINDOWS = [['h', 'hunts'], ['b', 'inventory'], ['c', 'character'], ['g', 'skills-trade'], ['t', 'storage'], ['v', 'shop'], ['p', 'hunt-prep'], ['x', 'havora']];
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

/* AW-77 PURE: THE BAG'S SELECTION, over the src at `base` (the 'select:' mutants judge a planted copy). The scratch is the
   Inventory's own shape (state.js scratchOf); the shown rows stand in for the grid's order. */
async function selectRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const S = await imp('src/shell/windows/inventory/selection.js');
  const { t } = await imp('src/render/player-text.js');
  const shown = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, qty: 2 }));
  const fresh = () => ({ sel: new Set(), anchor: null, base: null, cursor: null });
  const has = (sc) => [...sc.sel].sort().join();
  /* Ctrl+A: a partial selection → every shown stack; pressed again with every shown stack selected → none, a hidden one too */
  let sc = fresh();
  sc.sel.add('z');   // selected, then filtered out of view
  S.pressSelect(sc, 'b', shown, { ctrl: true });
  S.selectKey(sc, 'a', { ctrl: true }, shown);
  if (has(sc) !== 'a,b,c,d,e,z') fails.push('AW-77 Ctrl+A over a partial selection reads ' + has(sc));
  S.selectKey(sc, 'A', { ctrl: true }, shown);
  if (has(sc) !== '') fails.push('AW-77 Ctrl+A over every shown stack keeps ' + has(sc) + ' (it should clear)');
  S.selectAll(sc, []);
  if (has(sc) !== '') fails.push('AW-77 Ctrl+A over an empty grid selects ' + has(sc));
  /* Escape: none; with none selected it is not the selection's key */
  sc = fresh();
  S.pressSelect(sc, 'c', shown, { ctrl: true });
  if (!S.selectKey(sc, 'Escape', {}, shown) || has(sc) !== '') fails.push('AW-77 Escape leaves ' + has(sc));
  if (S.selectKey(sc, 'Escape', {}, shown)) fails.push('AW-77 Escape with nothing selected was taken as the selection\'s');
  /* Shift: the range from the anchor, growing and shrinking; Ctrl+Shift adds it to what stood when the anchor was set */
  sc = fresh();
  S.pressSelect(sc, 'b', shown, { ctrl: true });
  S.pressSelect(sc, 'd', shown, { shift: true });
  const grew = has(sc);
  S.pressSelect(sc, 'e', shown, { shift: true });
  const grewMore = has(sc);
  S.pressSelect(sc, 'c', shown, { shift: true });
  if (grew !== 'b,c,d' || grewMore !== 'b,c,d,e' || has(sc) !== 'b,c') fails.push('AW-77 Shift ranges read ' + [grew, grewMore, has(sc)].join(' | ') + ' (want b,c,d | b,c,d,e | b,c)');
  S.pressSelect(sc, 'e', shown, { ctrl: true });
  S.pressSelect(sc, 'c', shown, { shift: true, ctrl: true });
  if (has(sc) !== 'b,c,d,e') fails.push('AW-77 Ctrl+Shift reads ' + has(sc) + ' (want the range c..e added to b,c,e)');
  S.pressSelect(sc, 'd', shown, { shift: true });
  if (has(sc) !== 'd,e' || sc.cursor !== 'd') fails.push('AW-77 Shift after Ctrl+Shift reads ' + has(sc) + ' at ' + sc.cursor);
  /* Shift+arrow with no anchor on screen: from the cursor the arrow left, which becomes the anchor */
  sc = fresh();
  sc.cursor = 'c';
  S.rangeTo(sc, 'e', shown, { from: 'c' });
  S.rangeTo(sc, 'd', shown, { from: 'e' });
  if (has(sc) !== 'c,d' || sc.anchor !== 'c') fails.push('AW-77 Shift+arrow reads ' + has(sc) + ' from ' + sc.anchor);
  /* a plain press: with a selection active, only that stack; with none, none (the cursor picks it); Ctrl toggles it off again */
  sc = fresh();
  for (const id of ['a', 'b', 'c']) sc.sel.add(id);
  S.pressSelect(sc, 'b', shown, {});
  if (has(sc) !== 'b' || sc.cursor !== 'b') fails.push('AW-77 a plain press over a,b,c reads ' + has(sc) + ' (want b alone)');
  S.pressSelect(sc, 'b', shown, { ctrl: true });
  if (has(sc) !== '') fails.push('AW-77 Ctrl+press on the one selected stack keeps ' + has(sc));
  S.pressSelect(sc, 'd', shown, {});
  if (has(sc) !== '' || sc.cursor !== 'd') fails.push('AW-77 a plain press with nothing selected reads ' + has(sc) + ' at ' + sc.cursor);
  S.toggleSelect(sc, 'd');
  S.toggleSelect(sc, 'd');
  if (has(sc) !== '') fails.push('AW-77 Space twice keeps ' + has(sc));
  /* the line: the count and the shop's bids; a stack with no bid is said; no shop, the count alone */
  const bids = new Map([['a', 10], ['b', 5]]);
  const line = [S.selectionWords(['a', 'b'], shown, bids), S.selectionWords(['a', 'c'], shown, bids), S.selectionWords(['a'], shown, null)];
  if (line.join(' | ') !== '2 selected, worth 30 gp | 2 selected, worth 20 gp, 1 unpriced | 1 selected') fails.push('AW-77 the selection line reads ' + JSON.stringify(line));
  if (S.selectionWords([], shown, bids) !== '') fails.push('AW-77 nothing selected still reads ' + JSON.stringify(S.selectionWords([], shown, bids)));
  /* THE KEY IS CONSUMED (visual gate v0.2.123: Ctrl+A also selected the page's text): the window's handler takes Ctrl+A from a pocket
     and from a bulk button, stops the browser's own select-all, and selects every shown stack; the search box keeps its own Ctrl+A */
  {
    const A = await imp('src/shell/windows/inventory/actions.js');
    /* the same state.js instance actions.js holds (at the source's own query): one scratch per character */
    const { scratchOf } = await import(pathToFileURL(join(base, 'src/shell/windows/inventory/state.js')).href + sourceQuery(base));
    const env = { inventory: { rat_tail: 3, bones: 2 }, state: { gold: 5 }, bag_rules: { locked: [], loot: {} } };
    const cs = { slot: 0, status: 'open', record: { residue: {} }, read: (k) => (Object.prototype.hasOwnProperty.call(env, k) ? env[k] : null), setResidue() {}, clock: 0 };
    const ctx = { character: cs, account: null, doc: { activeElement: null }, glyphs: {} };
    const body = { querySelector: () => null, isConnected: true };
    const press = (classes, key, o) => {
      const ev = Object.assign({ type: 'keydown', key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, prevented: 0, preventDefault() { this.prevented++; } }, o || {});
      const el = { classList: { contains: (n) => classes.includes(n) }, getAttribute: () => null, value: '' };
      return { took: A.actInventory(ctx, body, classes[0] === 'hw-pocket' ? 'pocket' : 'sell-sel', ev, el, () => {}), prevented: ev.prevented };
    };
    const sc = scratchOf(cs);
    const fromPocket = press(['hw-pocket'], 'a');
    if (fromPocket.took !== true || fromPocket.prevented !== 1 || [...sc.sel].sort().join() !== 'bones,rat_tail') fails.push('AW-77 Ctrl+A on a pocket reads ' + JSON.stringify([fromPocket, [...sc.sel]]));
    const fromButton = press(['hh-tool'], 'a');
    if (fromButton.took !== true || fromButton.prevented !== 1 || sc.sel.size !== 0) fails.push('AW-77 Ctrl+A from a bulk button reads ' + JSON.stringify([fromButton, [...sc.sel]]));
    const inSearch = press(['hh-num', 'hw-q'], 'a');
    if (inSearch.took !== false || inSearch.prevented !== 0 || sc.sel.size !== 0) fails.push('AW-77 Ctrl+A in the search box was taken from it: ' + JSON.stringify([inSearch, [...sc.sel]]));
  }
  /* the selection names only the server's rows (a sold stack drops out of the count) */
  sc = fresh();
  for (const id of ['a', 'gone']) sc.sel.add(id);
  if (S.selectedIds(sc, shown).join() !== 'a') fails.push('AW-77 the selection counts a stack the bag no longer holds: ' + S.selectedIds(sc, shown).join());
  /* after a bulk press: ONE server ask, all or nothing: ok is done with the selection; a refusal moved nothing, so it stands */
  sc = fresh();
  for (const id of ['a', 'b']) sc.sel.add(id);
  if (S.settleSelection(sc, { ok: false, error: 'item_locked', verb: 'bank_move_many', item: 'b' }) || has(sc) !== 'a,b') fails.push('AW-77 a refused bulk press leaves ' + has(sc) + ' (want a,b kept)');
  if (!S.settleSelection(sc, { ok: true, count: 2 }) || has(sc) !== '') fails.push('AW-77 an ok bulk press keeps ' + has(sc));
  /* ...and the bag's Deposit and Lock ARE one ask each (storage-intents.js), never a stack at a time */
  const acts = readFileSync(join(base, 'src/shell/windows/inventory/actions.js'), 'utf8');
  if (!/moveStorageMany\(st\.account, st\.cs, ids, 'deposit'\)/.test(acts) || /\.moveStorage\(/.test(acts)) fails.push('AW-77 Deposit is not one hr_bank_move_many');
  if (!/lockItems\(st\.account, st\.cs, todo, on\)/.test(acts) || /lockItem\(id, on\)[^)]*\)\s*\)\s*,\s*t\('bag\./.test(acts)) fails.push('AW-77 Lock over the selection is not one hr_item_lock_many');
  /* Lock reads Unlock only over a selection locked through */
  const lock = [S.lockLabel(['a', 'b'], new Set(['a', 'b'])), S.lockLabel(['a', 'b'], new Set(['a'])), S.lockLabel(['a'], null), S.lockLabel([], new Set())];
  if (lock.join() !== 'Unlock,Lock,Lock,Lock') fails.push('AW-77 the lock tool reads ' + lock.join());
  /* the key help names the keys read above, and is the list behind the Inventory's ? (one bag.key_* row a hint) */
  const HINTS = ['search', 'move', 'use', 'select', 'range', 'all', 'clear', 'sell', 'lock'];
  const keys = HINTS.map((k) => t('bag.key_' + k)).join(' | ');
  for (const k of ['Ctrl+A to select or deselect all', 'Esc to deselect', 'Shift+click', 'Shift+arrows', 'Ctrl+click']) if (!keys.includes(k)) fails.push('AW-77 the key help leaves out "' + k + '": ' + keys);
  const rowSrc = readFileSync(join(base, 'src/data/shell-windows.js'), 'utf8');
  if (!HINTS.every((k) => rowSrc.includes("'bag.key_" + k + "'"))) fails.push('AW-77 the Inventory\'s ? does not list every bag.key_* row (shell-windows.js helpKeys)');
  return fails;
}

/* AW-34 PURE (the armor weights' words), run on `base` so the `armor words:` mutants judge a planted copy of src. */
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
  if (wornW.map((x) => x.text).join(' · ') !== '2 heavy, ' + pc(VITALS.heavyHpPermille * 2 / ARMOUR_SLOTS.length) + ' max HP · 1 medium, more blows miss · 1 light, ' + pc(VITALS.lightManaPermille / ARMOUR_SLOTS.length) + ' max mana')
    fails.push('AW-34 the worn-weight line for 2 plate, 1 leather, 1 cloth and a cape reads ' + JSON.stringify(wornW));
  /* Nothing worn: one plain line, never "0 heavy (+0% max HP)" beside a plate sprite (blind playtest 2026-10-31); a weight with no piece says nothing. */
  const wornNone = AW.wornWeights({ weapon: 'iron_sword' }).map((x) => x.text).join('|');
  if (wornNone !== 'None worn||') fails.push('AW-34 the worn-weight line with no armor reads ' + JSON.stringify(wornNone));
  const wornOne = AW.wornWeights({ helmet: 'iron_helm' }).map((x) => x.text).filter(Boolean);
  if (wornOne.length !== 1 || !/^1 heavy, \+/.test(wornOne[0])) fails.push('AW-34 one heavy piece reads ' + JSON.stringify(wornOne));
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
  if (!/armor weight/.test((await imp('src/data/text/coach.js')).COACH_TEXT.tamsins_task_in_any || '') || !/ armor, then Take/.test(JSON.stringify(cardFor(tamStep, { role: 'mage' }) || {}))) fails.push('AW-34 the tally card no longer asks for a weight');
  const help = (HELP_NOTES.find((n) => n.id === 'armour') || {}).text || '';
  for (const w of AW.WEIGHT_ORDER) {
    if (!help.includes(AW.weightSentence(w))) fails.push('AW-34 the Help note does not say what ' + w + ' armor gives');
  }
  return fails;
}

/* This family's pure rules: the plain run and a clean control of its pure mutants run them (a page mutant never does). */
async function pure() {
  return [await selectRules(ROOT), await armourWordRules(ROOT)].flat();
}

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, pure, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-1 AW-2 AW-3 AW-4
      const { ctx, page, errors, s, up } = await open();
      if (!up) fails.push('AW-1 the shell did not mount for the fixture character');
      else {
        /* the windows the top bar reaches: its icons and its groups' menus (tests/_bar.mjs); Hunt prep has no icon (the bar's setup press, tests/top-bar.mjs) */
        const launchers = await barWindows(page);
        for (const [key, id] of WINDOWS) {
          if (hasIcon(id) && !launchers.includes(id)) fails.push('AW-1 the top bar does not reach ' + id);
          if (!(await openWin(page, key, id))) fails.push('AW-1 the ' + key.toUpperCase() + ' key did not open ' + id);
          else if (shots) await shot(page, 'alpha-1440x900-' + id);
        }
        /* AW-1 Havora (vitals 11-12: powders, rounds and gifts at zero for two days): its icon, not only a map building, opens it. */
        for (let i = 0; i < 4 && await page.evaluate(() => document.querySelectorAll('[data-hs-win]:not(.is-leaving):not([data-hs-win="chat"])').length > 0); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(160); }
        await pressBar(page, 'havora').catch(() => null);
        if (!(await wait(page, () => document.querySelector('[data-hs-win="havora"] [data-hs-built]'), null, 3000))) fails.push('AW-1 the Havora icon did not open Havora');
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
        const want = '2 heavy, ' + share(VITALS.heavyHpPermille, 2) + ' max HP · 1 medium, more blows miss · 1 light, ' + share(VITALS.lightManaPermille, 1) + ' max mana';
        if ((await weightsLine()) !== want) fails.push('AW-34 the worn-weight line reads ' + JSON.stringify(await weightsLine()) + ', want ' + JSON.stringify(want));
        if (shots) await shot(page, 'armour-weight-1440x900-doll');
        await page.hover('.hw-slot[data-slot="helmet"]');
        const tip = await page.evaluate(() => { const t = document.querySelector('.hw-tip.is-on .hw-tip-weight'); return t ? t.textContent : null; });
        if (!tip || !tip.startsWith('Heavy armor') || !tip.includes(share(VITALS.heavyHpPermille, 1) + ' max HP, of the ' + share(VITALS.heavyHpPermille, ARMOUR_SLOTS.length) + ' a full heavy set of ' + ARMOUR_SLOTS.length))
          fails.push('AW-34 the worn plate helmet\'s tooltip weight line reads ' + JSON.stringify(tip));
        if (shots) await shot(page, 'armour-weight-1440x900-doll-tip');
        /* AW-21 IN THE PAGE: a side-grade's own attribute on its card and its compare (lane/a-compare-lines 2026-11-16, re-landed by lane/a-honesty-rescue;
           the pure rows are AW-21's in planRules). Kingstooth against a worn Iron Sword, the Cauldron Lid against a worn Coppercap Shield: the bag pocket's tip,
           as a player hovers it, says the bane and the fire resistance as a stat and as a gain. */
        {
          const was = { weapon: s.env.equipment.weapon, shield: s.env.equipment.shield };
          Object.assign(s.env.equipment, { weapon: 'iron_sword', shield: 'coppercap_shield' });
          Object.assign(s.env.inventory, { kingstooth: 1, cauldron_lid: 1 });
          await pushEnvelope(page, s);
          await page.mouse.move(2, 2);
          for (const [id, stat, delta, name] of [['kingstooth', 'Damage to Vermin monsters+10%', '+10% Damage to Vermin monsters', 'compare-kingstooth'],
            ['cauldron_lid', 'Fire damage taken−10%', '−10% Fire damage taken', 'compare-cauldron-lid']]) {
            const read = await page.evaluate((x) => {
              const p = document.querySelector('[data-hs-win="inventory"] .hw-pocket[data-item="' + x + '"]');
              if (!p) return null;
              p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              const tip = document.querySelector('.hw-tip.is-on');
              /* the compare is ONE child of the tip, its "vs" line with its list, so a short screen's two columns never split them (item-tip.js) */
              const list = tip && tip.querySelector('.hw-tip-delta'), block = list && list.parentElement;
              return tip ? { stats: Array.from(tip.querySelectorAll('.hw-tip-stats:not(.hw-tip-perks) dt')).map((d) => d.textContent + d.nextElementSibling.textContent),
                gains: Array.from(tip.querySelectorAll('.hw-tip-delta .is-gain')).map((l) => l.textContent),
                oneBlock: !!(block && block !== tip && block.parentElement === tip && block.querySelector('.hw-tip-cmp')) } : null;
            }, id);
            if (!read || !read.stats.includes(stat) || !read.gains.includes(delta)) fails.push('AW-21 the ' + id + ' tip in the bag reads ' + JSON.stringify(read) + ', want the stat "' + stat + '" and the gain "' + delta + '"');
            if (read && !read.oneBlock) fails.push('AW-21 the ' + id + ' tip\'s compare is not one block with its "vs" line: two columns can split them');
            if (shots) await shot(page, name + '-1440x900-bag-tip');
          }
          await page.mouse.move(2, 2);
          for (const k of ['weapon', 'shield']) { if (was[k]) s.env.equipment[k] = was[k]; else delete s.env.equipment[k]; }
          delete s.env.inventory.kingstooth; delete s.env.inventory.cauldron_lid;
          await pushEnvelope(page, s);
        }
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
        if (!String(await weightsLine()).startsWith('1 heavy, ' + share(VITALS.heavyHpPermille, 1) + ' max HP')) fails.push('AW-34 after the server took the helmet off, the line reads ' + JSON.stringify(await weightsLine()));
        if (shots) { await page.click('.hw-slot[data-slot="weapon"]'); await page.waitForTimeout(200); await shot(page, 'alpha-1440x900-gear-slot'); }
      }
      if (errors.length) fails.push('AW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    /* AW-33 the item wells: measured on the rendered windows, desktop then phone. */
    for (const [vw, vh, want] of [[1440, 900, { pocket: 44, bagRow: 6, storeRow: 6, line: 44, font: '16px', apart: true }], [922, 423, { pocket: 36, line: 40, font: '14.5px' }]]) {
      const tag = 'AW-33 at ' + vw + 'x' + vh + ': ';
      const { ctx, page, up } = await open({ viewport: { width: vw, height: vh }, mutateEnv: (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null });
        e.bank = Object.fromEntries(Object.keys(e.inventory).map((id, i) => [id, 3 + i]));
        /* the server's room: storage holds the bag's stacks of 100 (the House's next chest named), the bag 100 with its next rung */
        const n = Object.keys(e.bank).length;
        e.account = Object.assign({}, e.account, { bank: e.bank, depot: { used: n, cap: 100, next: { name: 'Millrace Crate', stacks: 20 } } });
        e.depot = e.account.depot;
        e.bag_expand = { cap: 100, rung: 0, max: 30, next: { offer: 'bank.0', gold: 3000, adds: 20 } };
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
          /* TWO CONTAINERS SIDE BY SIDE (UI audit 2026-11-18 #4): the storage's well at the left, the bag's at the right, starting and ending on
             one line, each drawing the room the server says it has left (100 a container), and no pocket in view cut at either well's foot */
          if (want.apart) {
            const s = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="storage"] .hw-store-well')).map((w) => {
              const r = w.getBoundingClientRect(), foot = r.top + w.clientTop + w.clientHeight;
              const cut = Array.from(w.querySelectorAll('.hw-pocket')).filter((p) => { const q = p.getBoundingClientRect(); return q.top < foot - 0.5 && q.bottom > foot + 0.5; }).length;
              return { side: w.getAttribute('data-well'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrolls: w.scrollHeight > w.clientHeight + 1,
                pockets: w.querySelectorAll('.hw-pocket').length, items: w.querySelectorAll('.hw-pocket[data-item]').length, cut };
            }));
            const [bank, bag] = [s.find((x) => x.side === 'bank'), s.find((x) => x.side === 'bag')];
            if (!bank || !bag) fails.push(tag + 'Storage has no two wells: ' + JSON.stringify(s));
            else {
              if (!(bank.right <= bag.left) || Math.abs(bank.top - bag.top) > 1) fails.push(tag + 'Storage stacks its grids, not side by side: ' + JSON.stringify(s));
              if (Math.abs(bank.bottom - bag.bottom) > 1) fails.push(tag + 'the two wells end apart: ' + JSON.stringify(s));
              if (bank.cut || bag.cut) fails.push(tag + 'a pocket is cut at a well\'s foot: ' + JSON.stringify(s));
              if (bank.pockets !== 100 || bag.pockets !== 100 || !bank.items || !bag.items) fails.push(tag + 'a well does not draw the room the server says it has (100 each): ' + JSON.stringify(s));
              if (!bank.scrolls || !bag.scrolls) fails.push(tag + 'CONTROL: a full container does not overflow its well: ' + JSON.stringify(s));
            }
          }
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
        if (!st.lock || !st.rules || !st.dispatch || st.value !== 'Loading shop prices…') fails.push('AW-9 without the server’s sections the bag offered ' + JSON.stringify(st));
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
        if (lockSaid !== 'Loading locks…' || said.note !== 'Loading loot plans…' || said.keeping) fails.push('AW-9 before bag_rules loads the bag says ' + JSON.stringify({ lockSaid, ...said }));
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
        if (JSON.stringify(v.rows) !== JSON.stringify(['In storage, shared, ×4', 'Druid, in the bag, ×2'])) fails.push('AW-75 the server\'s answer reads ' + JSON.stringify(v));
        s.findRefuse = 'search_down';
        await page.fill('[data-hs-win="inventory"] .hw-q', 'tail');
        await page.waitForTimeout(700);
        v = await seen();
        if (v.from !== 'Search failed, try again' || v.rows.length || v.none) fails.push('AW-75 a refused search reads ' + JSON.stringify(v));
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
          if (!st.off || !/in town/.test(st.why)) fails.push('AW-32 mid-hunt Dispatch loot is not off with its reason: ' + JSON.stringify(st));
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
            labels: Array.from(document.querySelectorAll('.hw-menu .hw-mi')).map((x) => x.textContent),
            rules: Array.from(document.querySelectorAll('.hw-menu [data-hs-act="m-rule"]')).map((b) => [b.getAttribute('data-rule'), b.textContent, b.getAttribute('aria-pressed'), b.disabled]) }));
        };
        const m = await menuOf('wolf_pelt');
        const want = [['keep', 'Keep', 'true', false], ['deposit', 'Deposit', 'false', false], ['sell', 'Sell', 'false', false], ['ignore', 'Don\'t pick up', 'false', false]];
        if (JSON.stringify(m.rules) !== JSON.stringify(want) || !m.subs.includes('Loot plan') || !m.subs.includes('On pickup')) fails.push('AW-32 the item menu offers ' + JSON.stringify(m));
        /* AW-32b NO WORD TWICE (UI audit 2026-11-18: the menu listed "Sell" twice, the sale now and the loot plan): every entry reads apart */
        const twice = m.labels.filter((w, i) => m.labels.indexOf(w) !== i);
        if (twice.length || !m.labels.includes('Sell now')) fails.push('AW-32b the item menu repeats ' + JSON.stringify(twice) + ' in ' + JSON.stringify(m.labels));
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
          fails.push('AW-32 Deposit sent ' + JSON.stringify(rs.map((c) => c.body)));
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
        if (!sb || !sb.off || !/^Nothing left to move$/.test(sb.why) || !sb.pelt) fails.push('AW-32 Storage after the dispatch reads ' + JSON.stringify(sb));
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

    { // AW-21 EQUIP UPGRADES (gold-sinks designer + 10-22 playtest: four menus per piece): ONE equip intent naming
      // every better piece, never the weapon or a piece the hero cannot wear yet; the slots and stacks marked until the
      // answer; a refusal in words with nothing moved; the Shop offers it right after a gear purchase; a reload agrees
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        /* Level 30 (gear is worn by Level, Tyler 2026-10-24): the bag's Steel Sword is better than the worn Iron Sword, the same family, so it goes on
           (designer 2026-11-03); the Rune Helm needs a Level over 30 (LOCKED_LV). */
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: LEVEL_30_XP });
        /* a heavy hero (Bronze Boots worn, no weight chosen at Tamsin's): its bare gloves slot takes the bag's medium Leather Gloves (designer ruling 2b of 2026-11-18: a bare armor slot takes any weight that beats bare), and every heavy piece goes on */
        e.equipment = Object.assign({}, e.equipment, { boots: 'bronze_boots' });
        Object.assign(e.inventory, { leather_gloves: 1, bronze_belt: 1, copper_ring: 1, [LOCKED_HELM]: 1 });
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
        if (!pre.on || pre.off || !/^Upgrade: Iron Helm \(\+\d+ Defense\)/.test(pre.q) || /Steel|Mithril|Rune/.test(pre.q)) { fails.push('AW-21 the preview line is wrong before the press: ' + JSON.stringify(pre)); break aw21; }
        /* A REQUIREMENT THE SERVER'S NUMBERS SAY IS UNMET (Tyler 2026-10-24, "Gear swapping isn't working": Fingerguns
           was offered Equip on a helm he could not wear, and the refusal said nothing on screen; gear is worn by Level
           since): the picked line's Equip is off and says why, and a press sends nothing. */
        await page.click('.hw-pocket[data-item="' + LOCKED_HELM + '"]');
        await page.waitForTimeout(150);
        const need = await page.evaluate(() => ({ off: document.querySelector('.hw-inv [data-hs-act="primary"]').disabled,
          why: document.querySelector('.hw-inv .hw-pick-why').textContent }));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        if (!need.off || need.why !== 'Requires Level ' + LOCKED_LV + ', now 30.' || sent(s, 'hr-accrue', 'equip').length) fails.push('AW-21 a Rune Helm at Level 30 reads ' + JSON.stringify(need) + ', ' + sent(s, 'hr-accrue', 'equip').length + ' equip(s) sent');
        /* A refusal (the engine's 409): nothing moves, and the words say why ON THE LINE PRESSED, in view (they sat at the
           window's foot, below the fold, so the press looked like nothing). */
        s.refuse = 'requirement_not_met';
        await page.click('.hw-inv [data-hs-act="equip-upgrades"]');
        await page.waitForTimeout(50);
        await wait(page, () => !document.querySelector('.hw-inv [data-hs-act="equip-upgrades"]').disabled, null, 3000);
        const said = await page.evaluate(() => { const n = document.querySelector('.hw-inv .hw-upgrade-why'), b = document.querySelector('[data-hs-win="inventory"] .hs-win-body').getBoundingClientRect();
          const q = n.getBoundingClientRect(); return { t: n.textContent, inView: n.getClientRects().length > 0 && q.top >= b.top - 1 && q.bottom <= b.bottom + 1 }; });
        if (said.t !== 'Requirement not met' || !said.inView) fails.push('AW-21 a refused Equip upgrades says ' + JSON.stringify(said) + ' on its line (want the words, in view)');
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
        if (!/^Upgrade: Copper Ring \(\+/.test(shopLine)) fails.push('AW-21 after a gear purchase the Shop offers ' + JSON.stringify(shopLine));
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
        if (!mid.equip || mid.why !== 'Leave the hunt to change gear' || !mid.upg || mid.upgWhy !== 'Leave the hunt to equip' || sent(s, 'hr-accrue', 'equip').length)
          fails.push('AW-21 mid-hunt the Inventory reads ' + JSON.stringify(mid) + ', ' + sent(s, 'hr-accrue', 'equip').length + ' equip(s) sent');
      } else fails.push('AW-21 the hunting character did not mount');
      if (errors.length) fails.push('AW-21 mid-hunt console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }

    { // AW-100 every worn slot in view, no scroll (Tyler 2026-11-17: "why am i scrolling to see my belt/ammo slots?")
      const inTown = (e) => { for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null }); };
      const SIZES = [[1280, 720, 'town', 52], [1518, 845, 'town', 52], [1920, 1080, 'town', 52], [922, 423, 'town', 36], [1280, 720, 'hunt', 36], [1366, 768, 'hunt', 36], [922, 423, 'hunt', 36]];
      for (const [w, h, scene, least] of SIZES) {
        const at = w + 'x' + h + ' (' + scene + ')';
        const { ctx, page, up } = await open(scene === 'town' ? { viewport: { width: w, height: h }, mutateEnv: inTown } : { viewport: { width: w, height: h } });
        if (!up) { fails.push('AW-100 the ' + at + ' screen did not mount'); await ctx.close(); continue; }
        if (!(await openWin(page, 'b', 'inventory'))) { fails.push('AW-100 B did not open the Inventory at ' + at); await ctx.close(); continue; }
        await page.waitForTimeout(400);
        const m = await page.evaluate(async () => {
          const win = document.querySelector('[data-hs-win="inventory"]');
          const moving = () => { for (let n = win; n; n = n.parentElement) if (getComputedStyle(n).transform !== 'none') return true; return false; };
          for (let i = 0; i < 40 && moving(); i++) await new Promise((r) => setTimeout(r, 50));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          /* what a box shows: its own rect cut by every ancestor that clips (to the window) and by the screen */
          const shown = (el) => {
            let top = 0, bottom = innerHeight;
            for (let a = el.parentElement; a; a = a.parentElement) {
              if (getComputedStyle(a).overflowY !== 'visible') { const b = a.getBoundingClientRect(); top = Math.max(top, b.top + a.clientTop); bottom = Math.min(bottom, b.top + a.clientTop + a.clientHeight); }
              if (a === win) break;
            }
            const q = el.getBoundingClientRect();
            return q.height > 0 && q.top >= top - 0.5 && q.bottom <= bottom + 0.5;
          };
          const slots = Array.from(win.querySelectorAll('.hw-doll .hw-slot'));
          const scrolled = [];
          for (let a = slots[0] && slots[0].parentElement; a; a = a.parentElement) { if (a.scrollTop) scrolled.push(a.className.split(' ')[0] + ' ' + a.scrollTop); if (a === win) break; }
          return { n: slots.length, lost: slots.filter((s) => !shown(s)).map((s) => s.getAttribute('data-slot')), scrolled,
            well: slots.length ? Math.round(slots[0].getBoundingClientRect().width) : 0, foot: shown(win.querySelector('.hw-inv-foot')), phone: matchMedia('(max-height: 540px) and (max-width: 1024px)').matches };
        });
        if (m.n !== 14 || m.lost.length || m.scrolled.length) fails.push('AW-100 at ' + at + ' a worn slot is out of view at rest: ' + JSON.stringify(m));
        if (m.well < least) fails.push('AW-100 at ' + at + ' the doll\'s wells are ' + m.well + ' px, want ' + least + ' or more');
        if (!m.phone && !m.foot) fails.push('AW-100 at ' + at + ' the bag\'s spaces and gold left the window: ' + JSON.stringify(m));
        if (shots) await shot(page, 'worn-in-view-' + w + 'x' + h + '-' + scene);
        await ctx.close();
      }
    }

    { // AW-103 THE BAG TAKES THE WINDOW'S HEIGHT (UI audit 2026-11-18 UI-5: three rows of bag under a stack of lines)
      const inTown = (e) => { for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k]; e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 100 }); };
      /* at 1440x900, and two heights that put the column's foot at other points of a row (a whole row there is the snap's, never luck) */
      for (const height of [900, 874, 851]) {
        const { ctx, page, up } = await open({ viewport: { width: 1440, height }, mutateEnv: inTown });
        if (!up) fails.push('AW-103 the screen did not mount at 1440x' + height);
        else if (!(await openWin(page, 'b', 'inventory'))) fails.push('AW-103 B did not open the Inventory at 1440x' + height);
        else {
          await page.waitForTimeout(500);
          const read = () => page.evaluate(() => {
            const w = document.querySelector('[data-hs-win="inventory"]');
            const box = w.querySelector('.hw-inv-scroll'), ul = w.querySelector('.hw-pockets'), b = box.getBoundingClientRect(), foot = box.clientHeight + b.top + box.clientTop;
            const lis = Array.from(ul.children), f = w.querySelector('.hw-inv-foot').getBoundingClientRect(), doll = w.querySelector('.hw-doll').getBoundingClientRect();
            const rows = new Set(lis.filter((li) => { const q = li.getBoundingClientRect(); return q.height && q.top >= b.top - 0.5 && q.bottom <= foot + 0.5; }).map((li) => Math.round(li.getBoundingClientRect().top)));
            return { items: ul.querySelectorAll('.hw-pocket[data-item]').length, spaces: ul.querySelectorAll('.hw-pocket.is-space').length, rows: rows.size,
              cut: lis.some((li) => { const q = li.getBoundingClientRect(); return q.top < foot - 1 && q.bottom > foot + 1; }),
              footUnder: f.top >= doll.bottom - 0.5 && f.left <= doll.left + 0.5, footHas: ['.hw-capacity', '.hw-gold', '[data-hs-act="dispatch"]'].every((q) => !!w.querySelector('.hw-inv-foot ' + q)),
              spaceTaken: lis.filter((li) => li.classList.contains('is-space')).some((li) => li.hasAttribute('data-item') || li.hasAttribute('tabindex') || li.getAttribute('aria-hidden') !== 'true') };
          });
          const m = await read();
          /* the whole bag: every free space the server's cap leaves drawn after the stacks, five whole rows in view and none cut, the foot under both columns */
          if (m.items + m.spaces !== 100 || m.spaceTaken || (height === 900 && m.rows < 5) || m.cut || !m.footUnder || !m.footHas) fails.push('AW-103 the Inventory at 1440x' + height + ' reads ' + JSON.stringify(m));
          if (height !== 900) { await ctx.close(); continue; }
          /* a search shows its matches alone: no empty pocket says "nothing else" */
          await page.fill('[data-hs-win="inventory"] .hw-q', 'rat');
          await page.waitForTimeout(250);
          const q = await read();
          if (q.spaces !== 0) fails.push('AW-103 a search still draws ' + q.spaces + ' free spaces');
          if (shots) { await page.fill('[data-hs-win="inventory"] .hw-q', ''); await page.waitForTimeout(250); await shot(page, 'bag-height-1440x900'); }
        }
        await ctx.close();
      }
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
  });
}

const MUTANTS = [
  ['AW-32b the item menu says Sell twice', 'src/shell/windows/inventory/actions.js', "h += item('m-sell', t('controls.sell_now'),", "h += item('m-sell', t('controls.sell'),"],
  /* UI audit 2026-11-18 #4: Storage's two containers side by side */
  ['AW-33 Storage stacks its two grids again', 'src/styles/windows.css', '.hw-store { flex: 1 1 auto; min-height: 0; display: grid;', '.hw-store { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;'],
  ['AW-33 the two wells end apart, a row cut at a foot', 'src/shell/windows/storage.js', "  if (Number.isFinite(end)) for (const w of wells) w.style.maxHeight = end + 'px';\n", ''],
  ['AW-33 Storage draws no room left', 'src/shell/windows/storage.js', '  return Math.max(0, room.cap - used - (Number.isSafeInteger(room.reserved) ? room.reserved : 0));', '  return 0;'],
  ['AW-100 the doll scrolls with the bag again', 'src/styles/windows.css', '[data-hs-win="inventory"] .hw-inv > .hw-inv-cols { flex: 1 1 auto; min-height: 0; }', '[data-hs-win="inventory"] .hw-inv > .hw-inv-cols { flex: 1 1 auto; min-height: 96px; overflow-y: auto; }'],
  ['AW-103 the bag draws no free space', 'src/shell/windows/inventory/grid.js', "  return !phone && st.loaded && st.prefs.cat === 'all' && !st.sc.query && free > 0 ? free : 0;", '  return 0;'],
  ['AW-103 a search draws free spaces too', 'src/shell/windows/inventory/grid.js', "st.prefs.cat === 'all' && !st.sc.query && free > 0", "st.prefs.cat === 'all' && free > 0"],
  ['AW-103 the bag ends on a cut row', 'src/shell/windows/inventory/index.js', '  if (cut < foot) box.style.maxHeight = Math.floor(cut - top) + \'px\';', ''],
  ['AW-100 the phone\'s doll stands under the toolbar again', 'src/styles/windows.css', '  [data-hs-win="inventory"] .hw-inv { display: grid; grid-template-columns: auto minmax(0, 1fr);', '  [data-hs-win="inventory"] .hw-inv { display: block; grid-template-columns: auto minmax(0, 1fr);'],
  ['armor weight: the doll line never shows', 'src/shell/windows/inventory/doll.js', "  cls(p, 'is-on', !!eq);", "  cls(p, 'is-on', false);"],
  ['armor weight: the doll line counts the bag, not the worn set', 'src/shell/windows/inventory/doll.js', "for (const x of wornWeights(eq))", "for (const x of wornWeights(Object.fromEntries((bagOf(st.cs) || []).map((r, i) => [i, r.id]))))"],
  ['armor weight: the tooltip drops the weight line', 'src/shell/windows/item-tip.js', '  if (wt) h +=', '  if (wt && false) h +='],
  ['armor weight: the share is not the server sum', 'src/data/armour-weights.js', "const pct = (pm) => '+' + (Math.round(pm) / 10) + '%';", "const pct = (pm) => '+' + (Math.round(pm) / 10 + 1) + '%';"],
  /* AW-77 the bag's selection: `select:` mutants are judged by selectRules on a temp copy of src. */
  ['select: Ctrl+A never clears', 'src/shell/windows/inventory/selection.js', '  if (ids.every((id) => sc.sel.has(id))) sc.sel.clear();\n  else for (const id of ids) sc.sel.add(id);', '  for (const id of ids) sc.sel.add(id);'],
  ['select: Escape leaves the selection', 'src/shell/windows/inventory/selection.js', "  if (key === 'Escape') { if (!sc.sel.size) return false; clearSelection(sc); return true; }\n", ''],
  ['select: a plain press toggles again (the selection never ends)', 'src/shell/windows/inventory/selection.js', '  else if (sc.sel.size) { sc.sel.clear(); sc.sel.add(id); }', '  else if (sc.sel.size) toggle(sc, id);'],
  ['select: Shift ranges from the cursor, not the anchor', 'src/shell/windows/inventory/selection.js', '  const from = held ? sc.anchor : o && o.from && ids.includes(o.from) ? o.from : id;', '  const from = o && o.from && ids.includes(o.from) ? o.from : id;'],
  ['select: Shift only ever adds (a range never shrinks)', 'src/shell/windows/inventory/selection.js', '  const next = new Set(o && o.ctrl && sc.base ? sc.base : []);', '  const next = new Set(sc.sel);'],
  ['select: the line leaves out the value', 'src/shell/windows/inventory/selection.js', "  if (!bids) return t('bag.selected', { count: n });", "  return t('bag.selected', { count: n });"],
  ['select: the line counts a stack the bag no longer holds', 'src/shell/windows/inventory/selection.js', '  return Array.from(sc.sel).filter((id) => have.has(id));', '  return Array.from(sc.sel);'],
  ['select: Lock reads Lock over a locked selection', 'src/shell/windows/inventory/selection.js', "  return ids.length && locked && ids.every((id) => locked.has(id)) ? t('controls.unlock') : t('controls.lock');", "  return t('controls.lock');"],
  ['select: the key help forgets that Ctrl+A again deselects', 'src/data/text/bag.js', "key_all: 'Ctrl+A to select or deselect all',", "key_all: 'Ctrl+A to select all',"],
  ['select: a refused bulk press clears the selection', 'src/shell/windows/inventory/selection.js', '  if (went) clearSelection(sc);', '  clearSelection(sc);'],
  ['select: Ctrl+A also selects the page\'s text', 'src/shell/windows/inventory/actions.js', "  if (mods.ctrl && k.toLowerCase() === 'a') { ev.preventDefault(); selectKey(sc, k, mods, st.shown); repaint(); return true; }\n", ''],
  ['select: the line reads 0 selected with nothing selected', 'src/shell/windows/inventory/selection.js', "  if (!n) return '';\n", ''],
  ['select: Deposit puts stacks away one at a time again', 'src/shell/windows/inventory/actions.js', "  bulk(st, repaint, () => moveStorageMany(st.account, st.cs, ids, 'deposit'), t('bag.putting_away'), 'bag.put_away');",
    "  bulk(st, repaint, () => ids.reduce((p, id) => p.then(() => st.cs.moveStorage(id, st.qty.get(id), 'deposit')), Promise.resolve({ ok: true })), t('bag.putting_away'), 'bag.put_away');"],
  ['AW-62 the bag gives way to one row beside the doll', 'src/styles/windows.css', '[data-hs-win="inventory"] .hw-inv-side > .hw-inv-scroll { flex: 1 1 auto; min-height: 96px; overflow-y: auto;', '[data-hs-win="inventory"] .hw-inv-side > .hw-inv-scroll { flex: 0 1 52px; min-height: 0; overflow-y: auto;'],
  ['armor words: her window stops naming the weights', 'src/shell/windows/tally.js', "WEIGHT_ORDER.map(weightSentence).join(' ')", "''"],
  ['armor words: the Help note forgets medium', 'src/data/how-to-play.js', "    + WEIGHT_ORDER.map(weightSentence).join('\\n') + '\\nWeights", "    + WEIGHT_ORDER.filter((w) => w !== 'medium').map(weightSentence).join('\\n') + '\\nWeights"],
  ['a bag icon draws at 1.5x in its well', 'src/styles/windows.css', '.hw-pocket .hw-ico .hh-icon, .hw-slot .hw-ico .hh-icon { width: var(--icon-1); height: var(--icon-1); }', '.hw-pocket .hw-ico .hh-icon, .hw-slot .hw-ico .hh-icon { width: 48px; height: 48px; }'],
  ['the Shop lines go 2x again', 'src/styles/windows.css', '.hw-line .hw-ico .hh-icon { width: var(--icon-1); height: var(--icon-1); }', '.hw-line .hw-ico .hh-icon { width: 64px; height: 64px; }'],
  ['the bag wells stay 36 px on Steam', 'src/styles/windows.css', 'width: max(round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px), calc(var(--icon-1) + 4px)); height: max(round(down, clamp(36px, 36px + (100vw - 1024px) / 32, 44px), 2px), calc(var(--icon-1) + 4px));', 'width: 36px; height: 36px;'],
  ['a bulk sale names a locked stack', 'src/shell/bag-model.js', '    if (locked.has(id)) { kept.push(id); continue; }\n', ''],
  ['the bag keeps a count the server dropped', 'src/session/item-sections.js', '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  return items;',
    '  for (const [id, n] of Object.entries(inv)) if (ID.test(id) && count(n) && n > 0) items.push({ id, qty: n });\n  const prev = globalThis.__bag || [];\n  for (const p of prev) { const i = items.find((x) => x.id === p.id); if (!i) items.push(p); else i.qty = Math.max(i.qty, p.qty); }\n  globalThis.__bag = items.map((x) => ({ ...x }));\n  return items;'],
  ['bag actions stay on while an intent is in flight', 'src/shell/windows/inventory/grid.js', "prop(pb, 'disabled', sc.pending || !prim || !!wearWhy || !!eatWhy);", "prop(pb, 'disabled', !prim || !!wearWhy || !!eatWhy);"],
  ['a pocket is rebuilt whenever its count changes', 'src/shell/windows/inventory/grid.js', "    key: (r) => (r.space === undefined ? r.id : ' space:' + r.space),", "    key: (r) => (r.space === undefined ? r.id + ':' + r.qty : ' space:' + r.space),"],
  ['a sale is sent without the confirmation', 'src/shell/windows/inventory/actions.js', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();', '  st.sc.confirm = confirmFor(st, ids, label);\n  repaint();\n  doSell(st, repaint);'],
  ['an equip in flight is not marked', 'src/shell/windows/inventory/actions.js', '  sc.wearing = { slots: [slot], items: id ? [id] : [] };\n', ''],
  ['Equip upgrades wears what the hero cannot use yet', 'src/core/upgrade-pick.js', '  return have !== null && have >= it.reqLv;', '  return true;'],
  ['AW-21 the tip\'s "vs" line and its list are two blocks again (a short screen\'s columns split them)', 'src/shell/windows/item-tip.js', "h += '<div class=\"hw-tip-vs\"><p class=\"hw-tip-cmp\">'", "h += '<p class=\"hw-tip-cmp\">'"],
  ['AW-34 an item tooltip outlives its window', 'src/shell/shell.js', '    hideTipIfGone(doc);\n', ''],
  ['Equip upgrades marks nothing in flight', 'src/shell/widgets/upgrade-line.js', '  sc.wearing = { slots, items: slots.map((s) => plan.ops[s]) };\n', ''],
  ['Equip upgrades sends one intent per piece', 'src/shell/widgets/upgrade-line.js', "    try { return await cs.edgeIntent('equip', { equip: Object.assign({}, plan.ops) }); } finally { sc.wearing = null; }", "    try { let r; for (const s of slots) r = await cs.edgeIntent('equip', { equip: { [s]: plan.ops[s] } }); return r; } finally { sc.wearing = null; }"],
  ['a level refusal reads as a bare refusal', 'src/data/refusal-words.js', "  requirement_not_met: 'Requirement not met',\n", ''],
  ['the Shop never offers Equip upgrades', 'src/shell/windows/shop.js', "sc.wear = !!o && o.kind === 'gear';", 'sc.wear = false;'],
  ['the engine answer is re-read (two round trips)', 'src/session/character-session.js', "{ if (!(carries && this._take(ans.body, 'load')) && !(await this.load())) await this.resync(); return { ok: true }; }", '{ if (!(await this.load())) await this.resync(); return { ok: true }; }'],
  ['the doll wears the item before the server confirms', 'src/shell/windows/inventory/doll.js', '    const id = eq[s] || \'\';', "    const id = (s === 'weapon' && globalThis.__want) || eq[s] || '';"],
  /* AW-9's press is checked: a menu Esc leaves open lies on the stack, and that is AW-9 red by name, never a 6 s click timeout */
  ['Esc leaves the item menu over the stack (AW-9)', 'src/shell/windows/float-menu.js', "    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFloatMenu(doc); return; }", "    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }"],
  ['the find list builds its own rows from this hero\'s Storage again (AW-75)', 'src/shell/windows/inventory/elsewhere.js', "sc.rows.filter((r) => !(r.slot === cs.slot && r.where === 'bag')) : [];",
    "sc.rows.filter((r) => !(r.slot === cs.slot && r.where === 'bag')) : Object.entries(cs.read('bank') || {}).map(([item, qty]) => ({ slot: null, name: null, item, qty, where: 'bank' }));"],
];

const COMPANION = {
  'the doll wears the item before the server confirms': ['src/shell/windows/inventory/actions.js', "    if (slot) wear(st, repaint, slot, id, 'pick:' + id);", "    if (slot) globalThis.__want = id;\n    if (slot) wear(st, repaint, slot, id, 'pick:' + id);"] };

const GUARD = 'tests/alpha-windows-inventory.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
  'select:': (over) => tickerMutant(over, selectRules),
  'armor words:': (over) => tickerMutant(over, armourWordRules),
};

async function main() {
  const g = { guard: GUARD, green: 'the windows open; patch in place; the server’s counts win; intents only; locks hold; totals first; one Inventory; Equip upgrades; the account search; Dispatch loot; the item wells; every worn slot in view; the bag takes the window’s height; the selection; the armor weights', pure: pure, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
