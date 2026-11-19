#!/usr/bin/env node
// mutant-rule-functions: checks pure tickerRules stationSortRules benchRules
// mutant-runner-functions: main
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-work.mjs — GATHERING AND CRAFTING, TOWN WORK AND THE SKILLS, IN A REAL CHROMIUM.
//
//   node tests/alpha-windows-work.mjs                  the rules
//   node tests/alpha-windows-work.mjs --mutate         every planted defect must turn a rule RED
//   node tests/alpha-windows-work.mjs --pure           its pure rules only (no browser)
//   node tests/alpha-windows-work.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-work.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-work.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//   node tests/alpha-windows-work.mjs --shots <dir>  also write the visual-gate screenshots (1440x900 and 922x423)
//
// mutant-anchors: src/shell/town-ticker.js src/session/refusal.js src/session/character-session.js src/shell/windows/inventory/state.js src/shell/windows/inventory/grid.js src/shell/windows/shop.js src/session/edge-intents.js src/shell/windows/storage.js src/shell/town-work.js src/shell/windows/work.js src/session/residue.js src/styles/shell.css src/shell/shell.js src/data/shell-windows.js src/shell/windows/item-tip.js src/shell/station-sort.js
// mutant-writes-tree: no — page mutants are served overrides (tests/_alpha-windows.mjs pageRun), pure ones planted into a temp copy of src (tickerMutant)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// Town work: what the windows say an item is for, Gathering and crafting (a skill opens its work, Start is one
// set_activity, the station's sort, a row's numbers), town work counting up between payouts, and the skills split;
// pure: the town ticker (TK-1 .. TK-10), the station sort (AW-76) and the bench rows (AW-102).
//
//   AW-22 GATHERING AND CRAFTING (designer 2026-10-22: the town skills had no door):
//         each gathering and bench skill in the ledger opens its work; a row shows what
//         the server's level opens (and the next two, "Needs Woodcutting 15"); Start is
//         ONE set_activity { kind:'gather'|'artisan', id }, a switch from another is ONE
//         more (no stop first); the work line reads the server's pointer and survives a
//         reload; Stop is ONE idle and says what the server made; a bench row's amount
//         (1 / 5 / All; a tool starts on 1, stock on All) rides the Start as `count` and
//         the running row says the server's "N left". A row is a genre row (UI audit 2026-11-18):
//         the inputs as icon chips with counts, one numbers line, "Lv N" by Start; AW-22T the
//         window's band name stands on one line on the ledger and beside Back
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
//         TK-8d a counted run's work line says its own count ("45 of 300 left"), never the stock behind it, and
//               "Stops when materials run out" only where they do; a run until the inputs run out keeps both
//         TK-9  a dish that can burn is a roll: inputs and the burn's XP are certain, no stack moves
//         TK-10 ROUNDED DOWN: against the engine as the server runs it (perks, a real roll, its
//               tool carry and XP remainder) it never shows an action, item or XP not paid
//         In the page: Start → the line, the skill bar and the bag tick, pending → never sold
//         → a payout replaces → a lower payout snaps down → a reload restarts from the
//         server's watermark → Stop → nothing ticks.
//   AW-17 the skills are two ledgers (the combat one inside the Character window,
//         tests/character-window.mjs) and Gathering and crafting does not scroll at
//         922x423; a character that has never fought sees the pointer to Hunts
//   AW-73 ON A PHONE THE CARD'S CROSS IS DRAWN IN ITS BUTTON (door panel 2026-11-04): static, it lay over the words in the middle of every closable card
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';
import { FIXTURE, wait, reloadAndPlay, pushEnvelope, openWin, sent, pageRun, plain, mutate, shardPlan, tickerMutant } from './_alpha-windows.mjs';

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
  if (ahead1 !== '42 in bag') fails.push('TK-1 the work line marks ' + JSON.stringify(ahead1) + ' as pending, want "42 in bag"');
  /* The row under the line says the same number; a row that is not running keeps the server's (blind playtest 2026-10-31: "2 caught so far · 0 in your bag"). */
  const rowWords = [TW.gatherBagWords(cs1, TW.workOf(cs1), true), TW.gatherBagWords(cs1, TW.workOf(cs1), false)].join('|');
  if (rowWords !== '42 in bag|40 in bag') fails.push('TK-1 the gathering row reads ' + rowWords + ', want 42 running and 40 stopped');

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
  if (!b3 || b3.items.bones !== -3 || TK.aheadXp(b3, 'inner_flame') !== 3 * TW.xpEach(bury) || !ball || ball.items.bones !== -8 || !bleft || bleft.items.bones !== -2 || !/^Fueling the Great Hearth with Bones: 0 Bones left$/.test(bline))
    fails.push('TK-8 the bench count: ' + JSON.stringify({ b3, all: ball && ball.items, left2: bleft && bleft.items, bline }));
  /* TK-8b (live v0.2.135: the bag's "Burn" on 2,530 Bones read "with 1 Bones…" over "2,529 Bones left"): a count
     of one names ONE ("1 Bone"), a counted run's line says what the run has to go and never the stock, Burn all keeps the
     stock's count, and every Hearth fuel named in the plural has its one-form (text item.one_<id>). */
  const { startBury } = await imp('src/shell/windows/inventory/bury.js');
  const { itemName, itemNameFor } = await imp('src/shell/widgets/bits.js');
  const { ARTISAN_RECIPES } = await imp('src/data/recipes.js');
  const { recipeInputs } = await imp('src/core/artisan.js');
  const fedWords = startBury(hero(envOf('idle', null, { bones: 2530 })), {}, 'bones', (fn, busy, done) => done({ ok: true }), null, 1);
  const lineAt = (cs, ms) => { cs.clock = T0 + ms; return TK.lineText(buryParts(cs)); };
  const errand = hero(envOf('artisan', 'fuel_bones', { bones: 2530 }, { bench_run: { left: 1 } }));
  const fedLines = [lineAt(errand, 0), lineAt(errand, bstep + 100), lineAt(hero(envOf('artisan', 'fuel_bones', { bones: 1 })), 0),
    lineAt(hero(envOf('artisan', 'fuel_bones', { bones: 2530 })), 0)];
  const fedWant = ['Fueling the Great Hearth with Bones: 1 to go', 'Fueling the Great Hearth with Bones: 0 to go',
    'Fueling the Great Hearth with Bones: 1 Bone left', 'Fueling the Great Hearth with Bones: 2,530 Bones left'];
  /* every stack named in the plural has its one-form: the Hearth fuels, the arrows and bolts; a pair (gear in a slot, Coal
     Tongs) and a mass (Tempering Salts) keep their name */
  const { DRINK_ITEMS } = await imp('src/data/drinks.js');
  const { BASIC_INDEX } = await imp('src/data/supply-basics.js');
  const stacks = Object.assign({}, BASIC_INDEX, DRINK_ITEMS, ITEMS);
  const noOne = [...new Set([...(ARTISAN_RECIPES.inner_flame || []).flatMap((r) => Object.keys(recipeInputs(r))), ...Object.keys(stacks)])]
    .filter((id) => !(stacks[id] && stacks[id].slot && stacks[id].slot !== 'ammo') && !/\b(Salts|Tongs)$/.test(itemName(id)))
    .filter((id) => /[^s]s$/.test(itemName(id)) && itemNameFor(id, 1) === itemName(id));
  if (fedWords !== 'Fueling the Great Hearth with 1 Bone…' || fedLines.join('|') !== fedWant.join('|') || itemNameFor('bones', 2) !== 'Bones' || noOne.length)
    fails.push('TK-8b one Bone fed reads ' + JSON.stringify({ fedWords, fedLines, noOne }) + ', want "…with 1 Bone…" and ' + JSON.stringify(fedWant));
  /* TK-8c THE CLASS: every count beside an item's name reads it through itemNameFor. In play: a market notice and Tamsin's
     pick for ONE Bone. By source (src/shell, src/hunt-view, src/session, src/social, src/app): no `whole(…) + ' ' + itemName(`,
     no pick named by itemName, and no line that fills a "{n} {item}" text row hands it itemName. */
  const { noticeLines } = await imp('src/shell/market-model.js');
  const { pickWords } = await imp('src/session/tally-sections.js');
  const { TEXT } = await imp('src/data/text/text-table.js');
  const oneBone = [noticeLines([{ what: 'sold', at: 1, item: 'bones', qty: 1, each: 2, gold: 2 }], false), noticeLines([{ what: 'returned', at: 2, item: 'bones', qty: 1 }], false)]
    .map((l) => (l[0] ? l[0].text : '')).concat(pickWords({ item: 'bones', qty: 1 }, itemNameFor));
  const countRows = Object.entries(TEXT).flatMap(([sf, rows]) => Object.entries(rows).filter(([, v]) => [].concat(typeof v === 'object' ? Object.values(v) : v)
    .some((x) => /\{(n|qty|count)\} \{item\}/.test(x))).map(([k]) => "'" + sf + '.' + k + "'"));
  const pairs = [];
  for (const dir of ['src/shell', 'src/hunt-view', 'src/session', 'src/social', 'src/app']) {
    for (const f of readdirSync(join(base, dir), { recursive: true })) {
      if (!/\.js$/.test(f)) continue;
      readFileSync(join(base, dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (/(?:whole\((?:[^()]|\([^()]*\))*\)|\.qty|\bqty) \+ ' ' \+ itemName\(/.test(line) || /pickWords\([^;]*?, itemName\)/.test(line)
          || (countRows.some((id) => line.includes(id)) && /\bitem: itemName\(/.test(line))) pairs.push(dir + '/' + f.replace(/\\/g, '/') + ':' + (i + 1));
      });
    }
  }
  if (!/^The Weighhouse sold 1 Bone for /.test(oneBone[0]) || oneBone[1] !== '1 Bone unsold, back in storage' || oneBone[2] !== '1 Bone' || countRows.length < 5 || pairs.length)
    fails.push('TK-8c a count of one beside a plural name: ' + JSON.stringify({ oneBone, countRows: countRows.length, pairs }));

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

  /* TK-8d A COUNTED RUN'S WORK LINE SAYS ITS COUNT (Andy 2026-11-18: Bind Etched Water Runes for 300, the row "Working on it now, 45
     left", the line over it "8,300 Blank Rune left. Stops when materials run out"). The server's bench_run.left less the ticker's certain
     actions, of the run's whole count (the server's tally of this run, bench_tax.run, plus its count left); the stop sentence only where
     the bag and Storage run out first; a run until the inputs run out keeps both. One line for every bench kind. */
  const tally = (r, since, c) => ({ bench_tax: { rooms: {}, fees: {}, carry_mg: 0, keep: 0, run: { r, s: iso(since), c, g: 0, at: iso(T0) } } });
  const workLine = (id, inv, more, ms) => { const cs = hero(envOf('artisan', id, inv, more)); cs.clock = T0 + (ms || 0); return TK.lineText(TW.nowParts(cs)); };
  const etched = 'bind_etched_water_runes';
  const sstep = TW.actionMs(hero(envOf('artisan', 'smelt_bronze', {})), TW.workRow('artisan', 'smelt_bronze'));
  const counted = [
    workLine(etched, { rune_blank: 8300 }, Object.assign({ bench_run: { left: 45 } }, tally(etched, T0, 255))),
    workLine(etched, { rune_blank: 8300 }, Object.assign({ bench_run: { left: 45 } }, tally(etched, T0 - 60000, 80))),
    workLine(etched, { rune_blank: 8300 }, { bench_run: { left: 45 } }),
    workLine(etched, { rune_blank: 200 }, Object.assign({ bench_run: { left: 45 } }, tally(etched, T0, 255))),
    workLine(etched, { rune_blank: 8300 }, tally(etched, T0, 255)),
    workLine('smelt_bronze', { copper_ore: 40 }, Object.assign({ bench_run: { left: 5 } }, tally('smelt_bronze', T0, 3)), 2 * sstep + 100),
    workLine('cook_shrimp', { shrimp: 6 }, Object.assign({ bench_run: { left: 6 } }, tally('cook_shrimp', T0, 0)), 2 * cstep + 100),
    workLine('fuel_bones', { bones: 8 }, { bench_run: { left: 2 } }),
  ];
  const countedWant = ['Making Etched Water Rune: 45 of 300 left', 'Making Etched Water Rune: 45 of 45 left', 'Making Etched Water Rune: 45 left',
    'Making Etched Water Rune: 45 of 300 left. Stops when materials run out', 'Making Etched Water Rune: 8,300 Blank Rune left. Stops when materials run out',
    'Making Bronze Bar: 3 of 8 left', 'Cooking Raw Shrimp: 2 more on the fire, 4 of 6 left', 'Fueling the Great Hearth with Bones: 2 left'];
  const smeltCs = hero(envOf('artisan', 'smelt_bronze', { copper_ore: 40 }, Object.assign({ bench_run: { left: 5 } }, tally('smelt_bronze', T0, 3))));
  smeltCs.clock = T0 + 2 * sstep + 100;
  const smeltAhead = TW.nowParts(smeltCs).filter((p) => p.ahead).map((p) => p.text).join('|');
  if (counted.join('\n') !== countedWant.join('\n') || smeltAhead !== '3 of 8 left')
    fails.push('TK-8d a counted run\'s work line reads ' + JSON.stringify({ counted, smeltAhead }) + ', want ' + JSON.stringify(countedWant) + ' with "3 of 8 left" pending');

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

/* AW-102 PURE: A BENCH ROW SAYS WHAT IT MAKES AND THE LADDER ABOVE IT (itemization audit 2026-11-18 #1, #10), over the src at `base` (the
   'bench:' mutants judge a planted copy). A piece reads its stats, each with its change against the piece the server says is worn in its
   slot (the item card's own numbers); a bare slot says so; a bar says nothing. The rows in full and the ladder hold every recipe of a
   station once at every level, the ladder one rung a Level, low to high. An item's card names no ground that isn't open. */
async function benchRules(base) {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(base, p)).href);
  const { outputVsWorn, ladderOf } = await imp('src/shell/bench-output.js');
  const { rowsFor } = await imp('src/shell/windows/work.js');
  const { compare, statLines } = await imp('src/shell/bag-model.js');
  const { BENCH_INDEX } = await imp('src/shell/town-work.js');
  const { SKILLS_DEF } = await imp('src/data/skills.js');
  const { ITEMS } = await imp('src/data/items.js');
  const { MONSTERS } = await imp('src/data/monsters.js');
  const L = await imp('src/shell/item-lore.js');
  const G = await imp('src/shell/hunt-ground-facts.js');
  const club = outputVsWorn('klappas_club', { weapon: 'practice_sword' });
  const want = compare('klappas_club', 'practice_sword');
  const changed = club ? club.stats.filter((s) => s.change) : [];
  if (!club || club.worn !== 'practice_sword' || !want.length || changed.length !== want.length
    || !want.every((d) => changed.some((s) => s.change.text === d.text && s.change.gain === d.delta > 0 && (s.stat === '' || s.stat.endsWith(' ' + d.label)))))
    fails.push('AW-102 the club against the worn sword is not the card\'s compare: ' + JSON.stringify(club) + ' want ' + JSON.stringify(want));
  const bare = outputVsWorn('bronze_gauntlets', { weapon: 'practice_sword' });
  if (!bare || bare.worn !== null || bare.slot !== 'gloves' || bare.stats.some((s) => s.change) || bare.stats.length !== statLines('bronze_gauntlets').length)
    fails.push('AW-102 gauntlets over a bare gloves slot read ' + JSON.stringify(bare));
  const same = outputVsWorn('bronze_gauntlets', { gloves: 'bronze_gauntlets' });
  if (!same || !same.same || same.stats.some((s) => s.change)) fails.push('AW-102 the piece worn now reads ' + JSON.stringify(same));
  if (outputVsWorn('copper_bar', {}) !== null || outputVsWorn('nope', {}) !== null) fails.push('AW-102 a bar or an unknown id says what it is against the worn set');
  const tool = outputVsWorn('bronze_pickaxe', {});
  if (!tool || tool.stats.length !== 1 || tool.stats[0].stat !== L.toolEffect('bronze_pickaxe')) fails.push('AW-102 a tool does not say what it does: ' + JSON.stringify(tool));
  /* the whole ladder: rows in full + rungs hold each recipe once, the rungs low to high, one a Level */
  let cases = 0, twins = 0;
  for (const skill of Object.keys(SKILLS_DEF).filter((s) => SKILLS_DEF[s].cat === 'artisan')) {
    const cat = Object.keys(BENCH_INDEX).filter((id) => BENCH_INDEX[id].skill === skill);
    if (!cat.length) continue;
    const req = (id) => BENCH_INDEX[id].recipe.req || 1;
    for (const lv of [1, ...new Set(cat.map(req))]) {
      const rows = rowsFor(skill, lv, {}, 'can');
      const shown = new Set(rows.map((w) => w.id));
      const rest = cat.filter((id) => req(id) > lv && !shown.has(id)).map((id) => ({ id, row: BENCH_INDEX[id].recipe }));
      const rungs = ladderOf(rest);
      const inRungs = rungs.flatMap((r) => r.rows.map((w) => w.id));
      const levels = rungs.map((r) => r.level);
      if (inRungs.length + rows.length !== cat.length || new Set(inRungs.concat([...shown])).size !== cat.length
        || levels.some((v, i) => i && v <= levels[i - 1]) || rungs.some((r) => r.rows.some((w) => req(w.id) !== r.level))) {
        fails.push('AW-102 ' + skill + ' at ' + lv + ': the rows and the ladder do not hold every recipe once, a rung a Level: ' + rows.length + ' + ' + inRungs.length + ' of ' + cat.length);
        break;
      }
      if (rungs.length) cases++;
      /* what a rung SHOWS names each thing once and every thing its rows make (post-140 audit C11: Smithing's Unlocks read "Banded Signet",
         "Fang Studs" and "Seam Jasper Band" twice each, a crafted jewel's metal job and its gem job both making the piece) */
      for (const r of rungs) {
        const outs = r.items.map((w) => w.row.output).filter(Boolean);
        const made = new Set(r.rows.map((w) => w.row.output).filter(Boolean));
        if (new Set(outs).size !== outs.length || outs.length !== made.size) {
          fails.push('AW-102 ' + skill + ' at ' + lv + ': the Lv ' + r.level + ' rung shows ' + JSON.stringify(outs) + ' for ' + JSON.stringify([...made]));
          break;
        }
        if (r.rows.length > r.items.length) twins++;
      }
    }
  }
  if (!cases) fails.push('AW-102 no station had a ladder: the cases prove nothing');
  if (!twins) fails.push('AW-102 no rung held two jobs that make one thing: the one-name-a-thing case proves nothing');
  /* #10: a drop no open ground gives names nothing (the catalogue keeps creatures no open ground spawns) */
  const dropped = new Set(Object.values(MONSTERS).flatMap((m) => (m.drops || []).map((d) => d.id)));
  const closed = [...dropped].filter((id) => ITEMS[id] && !G.dropWhereWords(id));
  if (!closed.length) fails.push('AW-102 no item drops only on a closed ground: the case proves nothing');
  const said = closed.filter((id) => L.sourcesOf(id).some((s) => /aren.t open|not open/i.test(s) || /^Dropped by/.test(s)));
  if (said.length) fails.push('AW-102 the card names a closed ground for ' + said.slice(0, 3).join(', '));
  return fails;
}

/* This family's pure rules: the plain run and a clean control of its pure mutants run them (a page mutant never does). */
async function pure() {
  return [await tickerRules(ROOT), await stationSortRules(ROOT), await benchRules(ROOT)].flat();
}

/* The page rules, in the monolith's order (a mutant is caught by the first rule that goes red: tests/_alpha-windows.mjs pageRun). */
async function checks(overrides, shots, opts) {
  return pageRun(overrides, shots, opts, pure, async ({ fails, open, shot }) => {
    /* mutant-rules-start */
    { // AW-60 THE WINDOWS SAY IT (blind crafting panel 2026-11-01): the rules above, read where the player reads them
      const town = (e) => {
        for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party']) delete e[k];
        e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, bank_cap: 40 });
        e.bank = {};
        e.inventory = { slime_gel: 12, rat_tail: 31, venom_sac: 3, iron_axe: 1, bronze_axe: 1, chalked_fire_rune: 40, turnip_juice: 9, cooked_shrimp: 5, stone_maul: 1 };
        e.skills = Object.assign({}, e.skills, { crafting: { xp: 0, level: 1, frac: 0 }, runecrafting: { xp: 0, level: 1, frac: 0 } });
        e.shop = Object.assign({}, e.shop, { bids: { slime_gel: 5, rat_tail: 6, venom_sac: 40, iron_axe: 250, bronze_axe: 60, turnip_juice: 6, cooked_shrimp: 3, stone_maul: 20 } });
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
        if (!/Kept by Sell all junk/.test(gel || '') || /Kept by Sell all junk/.test(tail || '')) fails.push('AW-60 the Shop: Slime Gel ' + gel + ' / Rat Tail ' + tail);
        if (!/Kept by Sell all junk/.test(sac || '')) fails.push('AW-60 the Shop forgets the deed that names Venom Sac: ' + sac);
        if (!/ for 186 gp$/.test(await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]') || '')) fails.push('AW-60 Sell all junk is priced ' + await say('[data-hs-win="shop"] [data-hs-act="sell-loot"]'));
        /* AW-60n the note under the two sales reads aloud as sentences (audit 2026-11-18 A14: "Keeps worn, higher-tier and Rare pieces Keeps 8 Material
           stacks" ran on): an outgrown Stone Maul for Sell spare gear, the kept Materials for Sell all junk, each part closed by its own stop */
        const note = await say('[data-hs-win="shop"] .hw-sell-note');
        if (!/^Sell spare gear keeps [^.]+\. Keeps \d+ Material stacks [^.]*\.$/.test(note || '')) fails.push('AW-60n the Sell tab\'s note reads ' + JSON.stringify(note));
        /* Selling the counting tool warns in the sale's own confirmation. */
        await page.click('[data-hs-win="shop"] .hw-line[data-item="iron_axe"] [data-hs-act="sell"]');
        await page.waitForTimeout(150);
        if (!/Woodcutting slower without it/.test(await say('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm-note') || '')) fails.push('AW-60 selling the Iron Axe says ' + await say('[data-hs-win="shop"] [data-pane="sell"] .hw-confirm-note'));
        await page.click('[data-hs-win="shop"] [data-hs-act="confirm-no"]');
        /* The House: a short material's source sits under its cost. */
        await openWin(page, 'e', 'house');
        const house = await say('[data-hs-win="house"] .hw-deed');
        if (!/Timber Beam 6 \(none in bag or Storage\)\s*Made with Crafting \d+\./.test(house || '') || !/Silk Thread 8[^.]*Dropped by .* at Mill Cellar/.test(house || '')) fails.push('AW-60 the House reads ' + house);
        /* A recipe's short input, the tool line, and a bench row whose output has no buyer. */
        await openWin(page, 'g', 'skills-trade');
        await page.click('[data-hs-win="skills-trade"] [data-skill="crafting"]');
        await page.waitForTimeout(200);
        if (!/No (Wolf Pelt|Silk Thread) in bag.*Dropped by /.test(await say('[data-hs-win="skills-trade"] .hw-work-rows') || '')) fails.push('AW-60 Crafting rows read ' + await say('[data-hs-win="skills-trade"] .hw-work-rows'));
        await page.click('[data-hs-win="skills-trade"] [data-hs-act="work-back"]');
        await page.click('[data-hs-win="skills-trade"] [data-skill="runecrafting"]');
        await page.waitForTimeout(200);
        /* the row's numbers line says it in a tag (UI audit 2026-11-18: a recipe row was a paragraph), its sentence on the pointer */
        const noBuyer = await page.evaluate(() => { const li = document.querySelector('[data-hs-win="skills-trade"] .hw-work-row[data-id*="fire"]'); const s = li && li.querySelector('.hw-work-stat'); return s ? s.textContent.replace(/\u00a0/g, ' ') + '|' + s.getAttribute('title') : ''; });
        if (!/· Can't be sold\|Own use only, can't be sold$/.test(noBuyer)) fails.push('AW-60 Runecrafting rows read ' + JSON.stringify(noBuyer));
        await page.click('[data-hs-win="skills-trade"] [data-hs-act="work-back"]');
        await page.click('[data-hs-win="skills-trade"] [data-skill="woodcutting"]');
        await page.waitForTimeout(200);
        if (!/^Tool: Iron Axe\s+Woodcutting 10% faster/.test(await say('[data-hs-win="skills-trade"] .hw-work-tool') || '')) fails.push('AW-60 the Woodcutting tool line reads ' + await say('[data-hs-win="skills-trade"] .hw-work-tool'));
        /* The ground's page lists its materials, with the engine's chance. */
        await openWin(page, 'h', 'hunts');
        await page.click('.hw-hunt[data-hunt="meadowbrook_thicket"]');
        await page.waitForTimeout(250);
        if (!/Wolf Pelt\s*Briarcoat Wolf and Old Grayjaw\s*\d/.test(await page.evaluate(() => document.querySelector('[data-hs-win="hunts"] .hw-hd-mats')?.innerText || ''))) fails.push('AW-60 the Thicket\'s Materials read ' + await say('[data-hs-win="hunts"] .hw-hd-mats'));
        /* The tooltip: a stack with no bid says who won't buy it, in plain words. */
        await openWin(page, 'b', 'inventory');
        await page.hover('[data-hs-win="inventory"] .hw-pocket[data-item="chalked_fire_rune"]');
        const tip = await wait(page, () => document.querySelector('.hw-tip.is-on'), null, 1500) ? await say('.hw-tip') : '';
        if (!/Own use only, can't be sold/.test(tip) || /priced/.test(tip)) fails.push('AW-60 the rune\'s tooltip reads ' + tip);
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
        if (/slower/.test(quiet || '') || !/Woodcutting slower without it/.test(told || '')) fails.push('AW-60 Storage says ' + JSON.stringify([quiet, told]));
      }
      if (errors.length) fails.push('AW-60 console errors: ' + errors.slice(0, 2).join(' | '));
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
        /* a genre row (UI audit 2026-11-18): the inputs as icon chips with their counts, one numbers line, the Level by Start, the status */
        return { id: li.getAttribute('data-id'), btn: b.textContent, off: b.disabled, why: li.querySelector('.hw-work-why').textContent, what: li.querySelector('.hw-work-what').textContent, n: n ? n.textContent : null,
          stat: li.querySelector('.hw-work-stat').textContent.replace(/\u00a0/g, ' '), lv: li.querySelector('.hw-work-lv').textContent, chips: li.querySelectorAll('.hw-work-in img.hh-icon').length };
      }), W);
      const nowText = () => page.evaluate((w) => { const b = document.querySelector(w + ' .hw-work-now'); return b && b.classList.contains('is-on') ? b.querySelector('.hw-burying-q').textContent : ''; }, W);
      const msg = () => page.evaluate((w) => document.querySelector(w + ' .hh-intent-msg').textContent, W);
      if (!up) fails.push('AW-22 the town did not mount');
      else {
        await openWin(page, 'g', 'skills-trade');
        await page.waitForTimeout(300);
        const doors = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .hw-skill[data-hs-act="open-skill"]')).map((li) => li.getAttribute('data-skill')).join(), W);
        if (doors !== 'woodcutting,mining,fishing,cooking,crafting,smithing,runecrafting') fails.push('AW-22 the skills that open their work: ' + doors);
        /* AW-22F (audit 2026-11-18 A4): Farming, grown in the Farm's plots, was the one line with no arrow and no press. It is a link to the Farm,
           the same arrow and press as the others, and the press opens the Farm. */
        const farmLine = await page.evaluate((w) => { const li = document.querySelector(w + ' .hw-skill[data-key="farming"]'); const lv = li && li.querySelector('.hw-skill-lv');
          return li ? { act: li.getAttribute('data-hs-act'), go: li.getAttribute('data-hs-goto'), role: li.getAttribute('role'), arrow: lv ? getComputedStyle(lv, '::after').content : '' } : null; }, W);
        if (!farmLine || farmLine.act !== 'open-place' || farmLine.go !== 'farm||' || farmLine.role !== 'button' || !/›/.test(farmLine.arrow)) fails.push('AW-22F the Farming line reads ' + JSON.stringify(farmLine));
        else {
          await page.click(W + ' .hw-skill[data-key="farming"]');
          const farmUp = await wait(page, () => document.querySelector('[data-hs-win="farm"] [data-hs-built]'), null, 3000);
          if (!farmUp) fails.push('AW-22F a press on Farming opened no Farm');
          await openWin(page, 'g', 'skills-trade');
          await page.waitForTimeout(300);
        }
        if (shots) await shot(page, 'work-1440x900-ledger');
        /* AW-22T (UI audit 2026-11-18) the band's name stands on ONE line, on the ledger and, with Back showing, on a skill's rows */
        const titleLines = () => page.evaluate((w) => { const h = document.querySelector(w + ' .hs-win-title'); return Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)); }, W);
        if ((await titleLines()) !== 1) fails.push('AW-22T the Gathering and crafting band takes ' + (await titleLines()) + ' lines on the ledger');
        await page.click(W + ' .hw-skill[data-skill="woodcutting"]');
        await page.waitForTimeout(300);
        let r = await rowsOf();
        if ((await titleLines()) !== 1) fails.push('AW-22T the Gathering and crafting band takes ' + (await titleLines()) + ' lines beside Back');
        const tree = r.find((x) => x.id === 'normal_tree'), oak = r.find((x) => x.id === 'oak_tree');
        if (!tree || tree.off || tree.btn !== 'Start' || tree.what !== 'Normal Log' || !/^[\d.]+ s · \d+ XP · about [\d,]+ an hour$/.test(tree.stat) || tree.lv !== 'Lv 1' || tree.why !== '40 in bag') fails.push('AW-22 Woodcutting offers ' + JSON.stringify(tree));
        if (!oak || !oak.off || !/^Requires Woodcutting 15, now \d+$/.test(oak.why)) fails.push('AW-22 a tree above the server level reads ' + JSON.stringify(oak));
        await page.click(W + ' .hw-work-row[data-id="normal_tree"] .hw-work-go');
        await page.waitForTimeout(800);
        let go = sent(s, 'hr-accrue', 'set_activity');
        if (go.length !== 1 || JSON.stringify(go[0].body.activity) !== '{"kind":"gather","id":"normal_tree"}') fails.push('AW-22 Start sent ' + JSON.stringify(go.map((c) => c.body)));
        if (!/^Chopping the Normal Tree: 0 chopped so far\. Runs offline until a hunt starts/.test(await nowText())) fails.push('AW-22 no line from the server pointer: ' + JSON.stringify(await nowText()));
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
          if (!/^Chopping the Normal Tree: \d+ in bag\./.test(await nowText())) fails.push('AW-22 after a reload the work line reads ' + JSON.stringify(await nowText()));
          /* A switch straight from gathering to a bench: ONE intent (the server collects the old one first). */
          await page.click(W + ' .hw-skill[data-skill="smithing"]');
          await page.waitForTimeout(300);
          r = await rowsOf();
          const bar = r.find((x) => x.id === 'smelt_bronze'), axe = r.find((x) => x.id === 'forge_bronze_axe');
          if (!bar || bar.off || bar.why !== 'Makes up to 5' || bar.what !== '2 Copper Ore' || bar.chips !== 1 || !/^[\d.]+ s · \d+ XP$/.test(bar.stat) || bar.lv !== 'Lv 1') fails.push('AW-22 Smithing offers ' + JSON.stringify(bar));
          if (!axe || !axe.off || !/^Requires Smithing 3, now \d+$/.test(axe.why)) fails.push('AW-22 a recipe above the server level reads ' + JSON.stringify(axe));
          /* "MAKE N" (lane c-work-fixes): a bar starts on All, a tool on 1; the player picks 5 and Start sends count 5. */
          if (bar && bar.n !== 'All') fails.push('AW-22 a bar row starts on ' + bar.n + ', not All');
          if (axe && axe.n !== '1') fails.push('AW-22 a tool row starts on ' + axe.n + ', not 1');
          await page.click(W + ' .hw-work-row[data-id="smelt_bronze"] .hw-work-n [data-n="5"]');
          await page.waitForTimeout(200);
          r = await rowsOf();
          const five = r.find((x) => x.id === 'smelt_bronze');
          if (!five || five.n !== '5' || five.why !== 'Makes 5 of up to 5') fails.push('AW-22 picking 5 reads ' + JSON.stringify(five));
          if (shots) await shot(page, 'work-1440x900-smithing');
          /* AW-22X "X" (Andy, Discord 2026-11-12): X opens a number field; 37 + Enter makes the pick 37 and Start sends count 37.
             0 clamps to 1 and 200000 to 100000 (the server's active_left range); Escape closes without a change. */
          const XR = W + ' .hw-work-row[data-id="smelt_bronze"]';
          const typeX = async (v, key) => { await page.click(XR + ' [data-hs-act="work-x"]'); await page.waitForTimeout(100); await page.fill(XR + ' .hw-work-xf', v);
            if (key) await page.press(XR + ' .hw-work-xf', key); else await page.click(XR + ' [data-hs-act="work-x-set"]'); await page.waitForTimeout(150); };
          const xBtn = () => page.evaluate((r) => { const b = document.querySelector(r + ' .hw-work-xb'); const f = document.querySelector(r + ' .hw-work-x');
            return { t: b.textContent, on: b.getAttribute('aria-pressed'), open: !f.hidden, im: document.querySelector(r + ' .hw-work-xf').getAttribute('inputmode') }; }, XR);
          await typeX('0');
          r = await rowsOf(); /* 1 is a choice of its own: its button lights, X stays X */
          if ((r.find((x) => x.id === 'smelt_bronze') || {}).n !== '1' || (await xBtn()).t !== 'X') fails.push('AW-22X 0 did not clamp to 1: ' + JSON.stringify(await xBtn()));
          await typeX('200000', 'Enter');
          if ((await xBtn()).t !== '100,000') fails.push('AW-22X 200000 did not clamp to 100000: ' + JSON.stringify(await xBtn()));
          await typeX('9', 'Escape');
          let xb = await xBtn();
          if (xb.t !== '100,000' || xb.open) fails.push('AW-22X Escape changed the pick or left the field open: ' + JSON.stringify(xb));
          await typeX('37', 'Enter');
          xb = await xBtn();
          if (xb.t !== '37' || xb.on !== 'true' || xb.open || xb.im !== 'numeric') fails.push('AW-22X X set to 37 reads ' + JSON.stringify(xb));
          await page.click(W + ' .hw-work-row[data-id="smelt_bronze"] .hw-work-go');
          await page.waitForTimeout(800);
          go = sent(s, 'hr-accrue', 'set_activity');
          if (go.length !== 2 || JSON.stringify(go[1].body.activity) !== '{"kind":"artisan","id":"smelt_bronze","count":37}') fails.push('AW-22 the switch sent ' + JSON.stringify(go.map((c) => c.body)));
          /* A run of 37 says its own count, never the ore behind it (Andy 2026-11-18, TK-8d); the bag's ore makes 5, so it says the ore stops it first. */
          if (!/^Making Bronze Bar: 0 made so far, 37 left\. Stops when materials run out$/.test(await nowText())) fails.push('AW-22 the bench line reads ' + JSON.stringify(await nowText()));
          r = await rowsOf();
          if (!/^Working on it now, 37 left\. Makes 5 of up to 5$/.test((r.find((x) => x.id === 'smelt_bronze') || {}).why)) fails.push('AW-22 the bag was spent before the server did it: ' + JSON.stringify(r.find((x) => x.id === 'smelt_bronze')));
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
          if (byName.join() !== aToZ(byCan) || byName.join() === byCan.join() || !(await rowsOf()).some((x) => x.off && /^Requires Smithing /.test(x.why))) fails.push('AW-76 Name orders ' + byName.join() + ' (Can make had ' + byCan.join() + ')');
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
        if (!pick.startsWith('×' + s.env.inventory.normal_log + ', ') || !/more on the way/.test(pick) || ask !== 'Sell Normal Log ×' + s.env.inventory.normal_log + '?')
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
        if (!ptr || !/Hunts → Mill Cellar → Enter/.test(ptr)) fails.push('AW-17 a fresh character sees no pointer to Hunts: ' + JSON.stringify(ptr));
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
  });
}

const MUTANTS = [
  ['AW-60 the Shop forgets the House', 'src/shell/windows/shop.js', 'const needs = upgradeNeeds(homeOf(st.cs), chestsOf(st.cs));', 'const needs = undefined;'],
  ['AW-60 Storage puts a tool away in silence', 'src/shell/windows/storage.js', "const slower = dir === 'deposit' ? toolLossWords(cs, id, qty) : '';", "const slower = '';"],
  ['AW-60 the tooltip says nothing of a stack no one buys', 'src/shell/windows/item-tip.js', 'const sale = saleWords(id);', "const sale = '';"],
  ['bench: a row compares to nothing worn', 'src/shell/bench-output.js', 'const deltas = on && on !== out ? compare(out, on) : [];', 'const deltas = [];'],
  ['bench: a bare slot is not said', 'src/shell/bench-output.js', "slot: on ? null : ((EQUIP_SLOT_META[slot] || {}).label || slot || '').toLowerCase()", 'slot: null'],
  ['bench: the ladder drops a rung', 'src/shell/bench-output.js', '.sort((a, b) => a[0] - b[0]).map(([level, rows]) => ({ level, rows, items: onePerItem(rows) }));', '.sort((a, b) => a[0] - b[0]).slice(1).map(([level, rows]) => ({ level, rows, items: onePerItem(rows) }));'],
  ['bench: the card names a closed ground again', 'src/shell/item-lore.js', '  if (drop) out.push(drop);', '  if (r && r.drops.length) out.push(drop || "Dropped by creatures on grounds no one can reach yet");'],
  ['station sort: Level runs high to low', 'src/shell/station-sort.js', "if (sort === 'level') return all.sort((a, b) => reqOf(a) - reqOf(b));", "if (sort === 'level') return all.sort((a, b) => reqOf(b) - reqOf(a));"],
  ['station sort: Name is not a sort', 'src/shell/station-sort.js', "  if (sort === 'name') return all.sort(byName);\n", ''],
  ['station sort: a sort drops the locked rows', 'src/shell/station-sort.js', '  const all = open.concat(ahead);', '  const all = open.slice();'],
  ['station sort: Can make no longer puts what the bag makes first', 'src/shell/station-sort.js', 'can(b) - can(a) || reqOf(b) - reqOf(a)', 'reqOf(b) - reqOf(a)'],
  ['station sort: the default is Level', 'src/shell/station-sort.js', "export const DEFAULT_SORT = 'can';", "export const DEFAULT_SORT = 'level';"],
  ['station sort: a pick forgets the other stations', 'src/shell/station-sort.js', "const out = Object.assign({}, own(residue, 'stationSort')", "const out = Object.assign({}, false && own(residue, 'stationSort')"],
  ['station sort: the pick is not kept on the server', 'src/session/residue.js', '  stationSort: sanitizeStationSort,', '  stationSortX: sanitizeStationSort,'],
  ['station sort: a forged key is kept', 'src/session/residue.js', "if (ID.test(id) && Object.prototype.hasOwnProperty.call(SKILLS_DEF, id) && ", 'if (ID.test(id) && '],
  ['AW-76 the window ignores the station\'s pick', 'src/shell/windows/work.js', 'rowsFor(skill, lv, heldOf(cs), sort, ', 'rowsFor(skill, lv, heldOf(cs), undefined, '],
  ['AW-22 an input chip shows no icon', 'src/shell/windows/work.js', "    + itemIconHtml(g, id) + esc(whole(n) + ' ' + itemNameFor(id, n)) + '</span>').join('');", "    + esc(whole(n) + ' ' + itemNameFor(id, n)) + '</span>').join('');"],
  ['AW-22 a row is a paragraph again', 'src/shell/windows/work.js', "    : pick === 'all' ? t('work.row_makes', { n: whole(runs * yieldOf(w)) })", "    : pick === 'all' ? t('work.row_makes', { n: whole(runs * yieldOf(w)) }) + ', ' + stat.textContent"],
  ['AW-22T the band reads Gathering and crafting again', 'src/data/shell-windows.js', "label: 'Gathering and crafting', title: 'Skills',", "label: 'Gathering and crafting',"],
  ['AW-73 the phone card\'s cross lies on its words', 'src/styles/shell.css', '.hs-pointer:not(.is-min) > .hs-coach-close { position: relative; top: auto; right: auto;', '.hs-pointer:not(.is-min) > .hs-coach-close { position: static;'],
  ['a skill opens no work', 'src/shell/windows/work.js', "attr(li, 'data-hs-act', door ? 'open-skill' : away ? 'open-place' : null);", "attr(li, 'data-hs-act', away ? 'open-place' : null);"],
  ['AW-60n the Sell note runs on again (audit A14)', 'src/data/text/shop.js', "  spare_keeps: 'Sell spare gear keeps worn, higher-tier and Rare pieces.',", "  spare_keeps: 'Keeps worn, higher-tier and Rare pieces',"],
  ['AW-22F Farming goes nowhere again (audit A4)', 'src/shell/windows/work.js', '    const away = elsewhereOf(id);', '    const away = null;'],
  ['the client cannot declare gathering', 'src/session/edge-intents.js', "(v.kind === 'artisan' || v.kind === 'gather')", "v.kind === 'artisan'"],
  ['a work row ignores the server level', 'src/shell/town-work.js', "  if (lv < (w.row.req || 1)) return skillShortWords(", "  if (false) return skillShortWords("],
  ['the running row offers no Stop', 'src/shell/windows/work.js', "text(b, running ? 'Stop' : 'Start');", "text(b, 'Start');"],
  ['the work line says nothing of how far it has got', 'src/shell/town-work.js', "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), how, tail && '. ' + tail);", "  return lineParts(words.charAt(0).toUpperCase() + words.slice(1), [], tail && '. ' + tail);"],
  ['a watched bench is never re-read', 'src/shell/shell.js', "(wm.isOpen('skills-trade') || wm.isOpen('inventory'))) watchTown(ctx.character);", "false) watchTown(ctx.character);"],
  /* AW-24 in the page: the bag's pocket is where the ticker shows, so these two are judged by the page rules. */
  ['the bag shows only the server\'s count while town work runs', 'src/shell/windows/inventory/grid.js', '  patchCount(li, shown.qty, shown.ahead !== 0);', '  patchCount(li, r.qty);'],
  ['a pending count reads as final', 'src/shell/windows/inventory/pockets.js', "  cls(el, 'is-ahead', !!ahead);\n", ''],
  /* AW-24 the town ticker. `ticker:` mutants are judged by the pure rules on a temp copy of src (tickerMutant). */
  ['ticker: it counts an action before the engine has done it', 'src/shell/town-ticker.js', 'const ctx = { fromMs: win.fromMs, toMs: win.toMs,', 'const ctx = { fromMs: win.fromMs, toMs: win.toMs + stepMs,'],
  ['ticker: the line does not mark the pending count', 'src/shell/town-work.js', "parts.push({ key: 'bag', text: whole(s.qty) + ' in bag', ahead: s.ahead !== 0 });", "parts.push({ key: 'bag', text: whole(s.qty) + ' in bag', ahead: false });"],
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
  /* Andy 2026-11-18: a run of 300 read "8,300 Blank Rune left. Stops when materials run out" (TK-8d) */
  ['ticker: a counted run\'s work line says the stock and that materials stop it', 'src/shell/town-work.js', '  const run = countedRun(cs, w);\n', '  const run = null;\n'],
  ['ticker: a counted run\'s work line forgets what it has made', 'src/shell/town-work.js', 'of: run === undefined ? null : left + (mine ? run.crafts : 0)', 'of: run === undefined ? null : left'],
];

const COMPANION = {
  /* The high-water mark the merged-upward ticker keeps (module scope: one per planted tree). */
  'ticker: a payout under the prediction never snaps down (merged upward)': ['src/shell/town-ticker.js', 'const own = (o, k) =>', 'const HIGH = {};\nconst own = (o, k) =>'] };

const GUARD = 'tests/alpha-windows-work.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
  'ticker:': (over) => tickerMutant(over, tickerRules),
  'station sort:': (over) => tickerMutant(over, stationSortRules),
  'bench:': (over) => tickerMutant(over, benchRules),
};

async function main() {
  const g = { guard: GUARD, green: 'the windows say what an item is for; gathering and crafting from the server; the station sorts; town work counts up between payouts; skills split', pure: pure, checks: checks, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
}

main().then((code) => process.exit(code));
