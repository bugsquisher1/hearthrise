#!/usr/bin/env node
// mutant-rule-functions: pure planRules itemTruthRules panelLeftovers
// mutant-runner-functions: main pureMutant
// ════════════════════════════════════════════════════════════════════════
// tests/alpha-windows-pure.mjs — THE ALPHA WINDOWS' CROSS-WINDOW PURE RULES (NO BROWSER).
//
//   node tests/alpha-windows-pure.mjs                  the rules
//   node tests/alpha-windows-pure.mjs --mutate         every planted defect must turn a rule RED
//   node tests/alpha-windows-pure.mjs --pure           its pure rules only (no browser)
//   node tests/alpha-windows-pure.mjs --mutate --only=<prefix>   just the mutants whose name starts so
//   node tests/alpha-windows-pure.mjs --mutate --shard=K/N   the Kth of N shards, balanced by measured seconds (CI splits them)
//   node tests/alpha-windows-pure.mjs --shard-plan   no browser: smoke.yml's shards cover every mutant once, each in budget
//
// mutant-anchors: src/shell/windows/inventory/bury.js src/shell/bag-model.js src/session/edge-intents.js src/shell/hunt-list.js src/shell/launcher-coach.js src/shell/upgrade-plan.js src/core/upgrade-pick.js src/shell/widgets/upgrade-line.js src/shell/town-work.js src/shell/hunt-ground-facts.js src/shell/hunt-go.js src/shell/alerts.js src/shell/carry-in.js src/shell/action-facts.js src/shell/social-watch.js src/shell/windows/inventory/index.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tickerMutant, pureMutant)
//
// One of the alpha windows' guards, split from tests/alpha-windows.mjs (2026-11-19, arch audit item 7): tests/_alpha-windows.mjs
// is the harness they share (play.html with supabase-js and the REST paths stubbed, the character's envelope
// tests/fixtures/alpha-envelope.json) and says which guard holds which window's rules.
//
// The client modules more than one window reads, judged on a planted copy of src with no browser: the intent bodies and
// the shop's receipt, the bag model's sales and cooks, Equip upgrades' plan, the work rows (AW-0 .. AW-22 PURE), the
// playtest plans (planRules: Before you go, Dispatch loot, carry in, Sell spare gear, the doll's weapon list), what an
// item says it is (AW-60) and the panel's leftovers (AW-61 .. AW-63).
//
//   AW-0  PURE: every SKILLS_DEF skill has a guide row; edgeBody refuses a price
//         field and an unknown verb; a bulk-sale plan never names a locked stack
//   AW-70 SELL SPARE GEAR sells what the hero has outgrown in ONE sale, its total first; never what it wears or wants, a higher tier, a Rare, the kit, a locked or planned stack
//   AW-64 HUNT PREP AND BEFORE YOU GO PRINT ONE READER of what the hero can use NOW (the hunt bag in
//         a hunt), every tier of food, drink, ammo and runes, ammo in the engine's order (Andy #74)
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './_client-harness.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';
import { levelBlock } from './_server-level.mjs';
import { FIXTURE, plain, mutate, shardPlan, tickerMutant } from './_alpha-windows.mjs';

async function pure() {
  const fails = [];
  const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { SKILLS_DEF } = await imp('src/data/skills.js');
  const { SKILL_GUIDE } = await imp('src/data/skill-guide.js');
  for (const id of Object.keys(SKILLS_DEF)) if (!SKILL_GUIDE[id]) fails.push('AW-0 the skill ' + id + ' has no row in src/data/skill-guide.js');
  /* AW-0c A PHONE'S CORNER COUNT FITS ITS POCKET (UI audit 2026-11-18: "10" and "1,493" side by side read as "101,493"): over 999 it reads 1.4k, 12k,
     rounded down; the desktop's 44 px pocket keeps the whole count to ten thousand */
  const { cornerCount, patchCount } = await imp('src/shell/windows/inventory/pockets.js');
  const corner = [999, 1000, 1493, 12000, 999999, 1250000].map(cornerCount).join('|');
  if (corner !== '999|1k|1.4k|12k|999k|1.2kk') fails.push('AW-0c the corner counts read ' + corner);
  const pocketOn = (phone) => { const el = { textContent: '', classList: { toggle() {}, contains: () => false } };
    const li = { querySelector: () => el, ownerDocument: { defaultView: { matchMedia: () => ({ matches: phone }) } } };
    patchCount(li, 1493, false); return el.textContent; };
  if (pocketOn(true) !== '1.4k' || pocketOn(false) !== '1,493') fails.push('AW-0c 1,493 in a pocket reads ' + JSON.stringify({ phone: pocketOn(true), desktop: pocketOn(false) }));
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
  if (buryLine({ read: (k) => (k === 'state' ? { active_kind: 'gather', active_id: 'copper_rock' } : null) }) !== 'Mining the Copper Rock')
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
  if (!knot.some((l) => /^Great Hearth: Inner Flame XP burst, fire burns deep amber for Havora/.test(l))) fails.push('AW-0 the Den Knot tooltip reads ' + JSON.stringify(knot));
  /* AW-20: what cooks is read off the recipe rows (no id list); the bench refuses in words, from the server's level. */
  const { cookOf } = await imp('src/shell/bag-model.js');
  const { buryRecipeOf, buryBlock, buryLabel } = await imp('src/shell/windows/inventory/bury.js');
  const cooks = ['raw_wolf_meat', 'shrimp', 'turnip', 'wheat', 'cooked_wolf_meat', 'bones'].map((id) => (cookOf(id) ? cookOf(id).recipe.id : null));
  if (cooks.join() !== 'cook_wolf_meat,cook_shrimp,cook_turnip,cook_wheat_bread,,') fails.push('AW-20 cookOf reads ' + cooks.join());
  if (lootToSell([{ id: 'raw_wolf_meat', qty: 4 }, { id: 'rat_tail', qty: 1 }]).join() !== 'rat_tail') fails.push('AW-20 Sell all loot would sell the raw meat');
  const meat = usesOf('raw_wolf_meat');
  /* Cook Wolf Meat opens at Cooking 1 (designer 2026-11-11, lane/d-small-calls), so the level refusal is probed on Raw Panther Meat (Cooking 25). */
  if (!meat.includes('Cook it into food (requires Cooking 1)')) fails.push('AW-20 the raw meat tooltip reads ' + JSON.stringify(meat));
  const cs = (lv, inv, st) => ({ read: (k) => (k === 'skills' ? { cooking: { xp: 0, level: lv } } : k === 'inventory' ? inv : k === 'state' ? st || { active_kind: 'idle', active_id: null } : null) });
  const wolf = buryRecipeOf('raw_wolf_meat'), panther = buryRecipeOf('raw_panther_meat');
  const words = [buryBlock(cs(1, { raw_panther_meat: 3 }), panther), buryBlock(cs(1, { raw_wolf_meat: 3 }), wolf), buryBlock(cs(30, { wheat: 2 }), buryRecipeOf('wheat')),
    buryBlock(cs(5, { raw_wolf_meat: 3 }, { active_kind: 'artisan', active_id: 'cook_shrimp' }), wolf), buryLabel(wolf, 3)];
  if (words.join('|') !== 'Requires Cooking 25, now 1||Need 3 Wheat, have 2|Already cooking. Stop it first.|Cook all') fails.push('AW-20 the bench says ' + JSON.stringify(words));
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
  if (ops(rings) !== '{"ring1":"copper_ring","ring2":"copper_ring"}' || upgradeWords(rings) !== 'Upgrade: Copper Ring ×2 (+1 Melee accuracy each)') fails.push('AW-21 two rings: ' + ops(rings) + ' / ' + upgradeWords(rings));
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
  if (!edgeBody(0, 'set_activity', { activity: { kind: 'gather', id: 'copper_rock', count: 20, next: 'wait' } }, 'x')) fails.push('AW-22 edgeBody refused a gathering node');
  /* ...and every job has an end (1026-job-counts.sql): a gathering node with no count, a THEN with no count, or no such THEN, is refused here
     (a THEN of hunt too, since FB-10's re-cut of 1026: no job's end starts a hunt). */
  for (const a of [{ kind: 'gather', id: 'copper_rock' }, { kind: 'artisan', id: 'smelt_bronze', next: 'wait' }, { kind: 'gather', id: 'copper_rock', count: 20, next: 'constructor' },
    { kind: 'gather', id: 'copper_rock', count: 20, next: 'hunt' }]) {
    if (edgeBody(0, 'set_activity', { activity: a }, 'x')) fails.push('AW-22 edgeBody let through ' + JSON.stringify(a));
  }
  const { rowsFor } = await imp('src/shell/windows/work.js');
  const { workBlock, workRow, runsOf } = await imp('src/shell/town-work.js');
  const smith = rowsFor('smithing', 1, { copper_ore: 10 }).map((w) => w.id);
  if (smith.slice(-2).join() !== 'forge_bronze_axe,forge_bronze_pickaxe' || !smith.includes('smelt_bronze') || !smith.includes('reforge_klappas_club') || smith.length !== 6) fails.push('AW-22 Smithing 1 shows ' + smith.join());
  const wcs = (lv, inv) => ({ read: (k) => (k === 'skills' ? { smithing: { xp: 0, level: lv } } : k === 'inventory' ? inv : null) });
  const bronze = workRow('artisan', 'smelt_bronze');
  const said = [workBlock(wcs(1, { copper_ore: 1 }), bronze, false), workBlock(wcs(1, { copper_ore: 2 }), bronze, true),
    workBlock(wcs(1, {}), workRow('artisan', 'forge_bronze_axe'), false), workBlock(wcs(1, { copper_ore: 2 }), bronze, false), String(runsOf(bronze.row, { copper_ore: 11 })),
    workBlock(wcs(1, {}), bronze, false)];
  if (said.join('|') !== 'Needs 2 Copper Ore, have 1. Gathered with Mining.|Not while a hunt is running.|Requires Smithing 3, now 1||5|No Copper Ore in bag. Gathered with Mining.') fails.push('AW-22 the work rows say ' + JSON.stringify(said));
  /* A gathering row on a full bag says so (audit 2026-11-13: the node paid nothing, forever, with no word): the product needs a new
     stack and the server's cap has none. Holding the product, or one free stack, it starts. */
  const gcs = (inv, cap) => ({ read: (k) => (k === 'skills' ? { mining: { xp: 0, level: 1 } } : k === 'inventory' ? inv : k === 'state' ? { bank_cap: cap } : null) });
  const copper = workRow('gather', 'copper_rock');
  const gathered = [workBlock(gcs({ tin_ore: 1 }, 1), copper, false), workBlock(gcs({ copper_ore: 1 }, 1), copper, false), workBlock(gcs({ tin_ore: 1 }, 2), copper, false)];
  if (gathered.join('|') !== 'Bag full, no room for Copper Ore||') fails.push('AW-22 a gathering row on a full bag says ' + JSON.stringify(gathered));
  /* each window family runs its own pure rules (tests/_alpha-windows.mjs) */
  return fails.concat(await planRules(ROOT), await itemTruthRules(ROOT));
}

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
    const die = (pm) => (HL.rangeWords(glade, 1, pm) || '').replace(/^[^]*\n(?=Death)/, '');
    const said = [die(0), die(250), die(750)];
    if (said.join(' | ') !== 'Death: −6% Level XP | Death: −4.5% Level XP (with Blessings) | Death: −1.5% Level XP (with Blessings)') fails.push('AW-25 the death line with Blessings reads ' + JSON.stringify(said));
  }
  /* A PLAN THAT HAS RUN IS NOT "NOTHING SET" (designer re-read 2026-11-11: "Nothing is set to Deposit or Sell yet." right under "Sold 17 for 5,407 gp."). */
  const { dispatchBlock } = await imp('src/shell/loot-dispatch.js');
  const bagCs = (inventory, loot) => ({ read: (k) => ({ inventory, bag_rules: { locked: [], loot } })[k] });
  const ran = dispatchBlock(bagCs({ bones: 3 }, { rat_tail: 'sell', wolf_pelt: 'deposit' })), none = dispatchBlock(bagCs({ bones: 3 }, {})), ready = dispatchBlock(bagCs({ rat_tail: 3 }, { rat_tail: 'sell' }));
  if (!/^Nothing left to move/.test(ran) || !/^No loot plans set/.test(none) || ready !== '') fails.push('AW-32 the Dispatch loot why reads ' + JSON.stringify([ran, none, ready]));
  /* AW-32 THE YARD IS THE REASON, NOT A HUNT (post-140 audit C7: at the Training Yard Equip upgrades said "Leave the hunt to put these on.", the chest's
     Use "Not available while hunting", Dispatch loot "works in town"). A training session is a hunt session, so the server refuses each of these
     during it (hr_hunt_lock's open session, equip.js hunt_open) and the control stays off; it says the training. In a hunt each keeps the hunt's words. */
  {
    const { gearLockWhy, wearBlock } = await imp('src/shell/gear-gate.js');
    const { useBlock } = await imp('src/shell/windows/tower-chest.js');
    const { buryBlock } = await imp('src/shell/windows/inventory/bury.js');
    const at = (huntId) => ({ read: (k) => ({ hunt: { session_id: 's-1', hunt_id: huntId, ended: false, session: {}, hero: {}, pose: { units: [] } },
      state: { active_kind: 'combat' }, inventory: { bones: 3 }, bag_rules: { locked: [], loot: { bones: 'sell' } } })[k] });
    const said = (cs) => [gearLockWhy(cs), gearLockWhy(cs, 'upgrades'), wearBlock(cs, 'iron_sword'), dispatchBlock(cs), useBlock(cs, { chest: {} }, { heldAll: 1, ready: true }),
      buryBlock(cs, { skill: 'prayer' })];
    const yard = said(at('training_yard_melee')), hunt = said(at('wickstead'));
    const busy = 'Not available while training';
    if (JSON.stringify(yard) !== JSON.stringify(['Stop training to change gear', 'Stop training to put these on.', 'Stop training to change gear', busy, busy, busy])
      || JSON.stringify(hunt) !== JSON.stringify(['Leave the hunt to change gear', 'Leave the hunt to put these on.', 'Leave the hunt to change gear', 'Dispatch loot works in town',
        'Not available while hunting', 'Not while a hunt is running.']))
      fails.push('AW-32 the town controls\' why at the yard and on a hunt read ' + JSON.stringify({ yard, hunt }));
    /* Storage's note, its press's answer and the bag's Deposit (storage-model.js storeAwayWords): "Storage is in town" read as if the hero had left town */
    const { storeAwayWords } = await imp('src/shell/storage-model.js');
    const store = [storeAwayWords(at('training_yard_melee')), storeAwayWords(at('wickstead'))];
    if (JSON.stringify(store) !== JSON.stringify(['Stop training to use Storage', 'Storage is in town'])) fails.push('AW-32 Storage\'s why at the yard and on a hunt reads ' + JSON.stringify(store));
  }
  /* AW-104 THE DOLL'S WEAPON LIST, BY THE HERO'S OWN STYLE (post-140 audit C6: to an Iron Sword hero an Oak Wand read +2, above a worse sword, its
     magic numbers summed against the sword's melee ones): swords by their melee gain, then the other styles (a staff is magic too, with the wand) */
  {
    const { sortFits, compare } = await imp('src/shell/bag-model.js');
    const list = (worn, ids) => sortFits('weapon', ids.map((id) => ({ id, delta: compare(id, worn) })), worn).map((f) => f.id);
    const got = [list('iron_sword', ['oak_wand', 'bronze_sword', 'oak_staff', 'steel_sword']), list('oak_wand', ['iron_sword', 'apprentice_staff', 'willow_staff'])];
    if (JSON.stringify(got) !== JSON.stringify([['steel_sword', 'bronze_sword', 'oak_wand', 'oak_staff'], ['willow_staff', 'apprentice_staff', 'iron_sword']]))
      fails.push('AW-104 the doll\'s weapon lists read ' + JSON.stringify(got));
  }
  /* A SHARED COOLDOWN IS A WAIT, NOT A STOP (designer re-read 2026-11-11: "which fires first" read as "never fires", over 2,484 casts in a night). */
  const { sharedCooldownOf } = await imp('src/shell/action-facts.js');
  const wire = (id) => ({ action: { type: 'ability', id }, conditions: [], enabled: true });
  const waits = sharedCooldownOf([wire('power_strike'), wire('flame_strike')], 1);
  if (waits !== 'Waits for Power Strike in slot 1 when both are ready') fails.push('AW-27 a spell sharing a cooldown reads ' + JSON.stringify(waits));
  const STORE = FIXTURE.hunt_settings.store;
  const slot = (type, id, count) => ({ action: { type, id }, conditions: [], join: 'and', usable: true, count });
  const sess = (o) => { const e = Object.assign({ hunt_settings: { preset: 0, presets: [], slots: [], store: STORE }, state: { gold: 500 }, inventory: {},
    stamina: { ms: 28800000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 }, equipment: { weapon: 'practice_sword' } }, o); return { read: (k) => e[k] }; };
  const say = (cs, o) => beforeLines(cs, o).map((l) => (l.short ? '!' : '') + l.text).join(' | ');
  /* before a hero walks away: how long this stamina lasts, game closed or not (panel 2026-11-01: 5 h 46 idle with no word before leaving) */
  const lasts = say(sess({ stamina: { ms: 3 * 3600000 + 17 * 60000, max_ms: 43200000 } }));
  if (!lasts.includes('Stamina: 3 h 17 min')) fails.push('AW-27 a long stamina reads ' + JSON.stringify(lasts));
  /* STORE FOOD TOO WEAK FOR THE GROUND (lane/d-march-balance: a Level 55 tank on the start bar's Salted Shrimp died 2 of 2 in the Muster
     Barrows under "Safe at your level"): under the store food the ground names as its floor (bagGuide.storeFloor), a red line with the
     fix; Salted Trout (1 death in 12 h there) is under it too; a ground that names no floor (the Slake: Salted Shrimp 0 deaths in 8 h) says nothing */
  const fedAt = (hunt, store) => say(sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('consume', 'cooked_lobster', 100), slot('consume', store, null)], store: STORE },
    inventory: { cooked_lobster: 100 } }), { hunt });
  const weakLine = '!Slot 2: Salted Shrimp heals too little here. Pick Salted Lobster';
  const fedReads = [fedAt('muster_barrows', 'salted_shrimp'), fedAt('muster_barrows', 'salted_trout'), fedAt('muster_barrows', 'salted_lobster'), fedAt('the_slake', 'salted_shrimp'), fedAt('millrace_sewer', 'salted_shrimp')];
  if (!fedReads[0].includes(weakLine) || !/^!Slot 2: Salted Trout heals too little/m.test(fedReads[1].split(' | ').find((x) => /heals too little/.test(x)) || '')
    || fedReads.slice(2).some((x) => /heals too little/.test(x))) fails.push('AW-27 store food too weak for the ground reads ' + JSON.stringify(fedReads));
  /* KRELL'S HOLD WARNS LIKE THE BARROWS (the full-game audit's A25, 2026-11-18: a Level 85 tank on the start bar died there in 81 minutes and its
     page said nothing). The Hold names its measured floor (Salted Trout, in the kit a hero arrives in), so the start bar's Salted Shrimp is
     told on its page, naming the slot; a bar on Salted Trout is not. */
  /* AW-27 HUNT PREP'S CHECKLIST SAYS IT TOO (post-140 audit C5): the page where slot 4 is changed read "Oren: ready" under a ground's
     "Pick Salted Lobster". The checklist runs the one weak-food line against the hero's ground, with the server's Level and HP; at the Glade
     a 384 HP Level 16 hero on Salted Shrimp is told nothing on the card or the checklist, because Shrimp is MEASURED safe there (re-measured
     on the real settle for this lane: audit-table storefood, Level 16 and 23, tank / hammer / bow / mage, 0 deaths in 2 h each, lowest HP
     p10 53% to 75%), and a line there would be false (PRIORITY_BOARD F14). */
  {
    const { readinessOf, readinessLine } = await imp('src/shell/readiness.js');
    const heroAt = (store, level, hp) => sess({ hunt_settings: { preset: 0, presets: [], slots: [slot('consume', 'cooked_lobster', 100), slot('consume', store, null)], store: STORE },
      inventory: { cooked_lobster: 100 }, state: { gold: 500, hp, max_hp: hp }, level: { xp: 1, level, into: 0, need: 1000 } });
    const card = (cs, hunt) => say(cs, { hunt }).split(' | ').find((l) => /heals/.test(l)) || '';
    const prepSays = (cs, hunt) => { const r = readinessOf(cs, hunt); return { line: readinessLine(r), food: (r.checks.find((c) => c.id === 'food_weak') || {}).text || '' }; };
    const barrows = heroAt('salted_shrimp', 55, 845), glade = heroAt('salted_shrimp', 16, 384);
    const got = { barrowsCard: card(barrows, 'muster_barrows'), barrowsPrep: prepSays(barrows, 'muster_barrows'), gladeCard: card(glade, 'mosslight_glade'),
      gladePrep: prepSays(glade, 'mosslight_glade'), lobsterPrep: prepSays(heroAt('salted_lobster', 55, 845), 'muster_barrows'),
      /* under the Barrows' band (Level 5) its floor says nothing, as its page does (the 139 audit's B2): the range line says what is wrong */
      underPrep: prepSays(heroAt('salted_shrimp', 5, 190), 'muster_barrows') };
    const want = 'Slot 2: Salted Shrimp heals 72 of 845 HP. Pick Salted Lobster';
    if (got.barrowsCard !== '!' + want || got.barrowsPrep.food !== want || !/: weak food$/.test(got.barrowsPrep.line)
      || got.gladeCard || got.gladePrep.food || /weak food/.test(got.gladePrep.line) || got.lobsterPrep.food || /weak food/.test(got.lobsterPrep.line)
      || got.underPrep.food || /weak food/.test(got.underPrep.line))
      fails.push('AW-27 the weak store food on the card and in Hunt prep reads ' + JSON.stringify(got));
  }
  const holdReads = [fedAt('krells_hold', 'salted_shrimp'), fedAt('krells_hold', 'salted_trout')];
  if (!holdReads[0].includes('!Slot 2: Salted Shrimp heals too little here. Pick Salted Trout') || /heals too little/.test(holdReads[1]))
    fails.push('AW-27 Krell\'s Hold\'s page on the start bar reads ' + JSON.stringify(holdReads));
  /* ...AT THE HERO'S LEVEL, WITH ITS NUMBERS, ON THE SLOT TOO, AND THE GROUND SAYS IT EXPECTS A HEALER (lane/d-audit-balance-2, the playthrough
     audit's F14: in range on Normal a hero died in 8 minutes and nothing said the food was too weak). The floor is the one measured for the
     Level (Salted Lobster to 64, Salted Trout from 65); the server's HP is in the sentence; the bar's store food slot says it while the
     hero hunts there and never to a party with a Healer; the Barrows' page asks melee and ranged heroes under 65 for a Healer. */
  {
    const { weakFoodOf, weakFoodWords, groundFloor } = await imp('src/shell/weak-food.js');
    const { settingsView } = await imp('src/session/hunt-sections.js');
    const { slotWhy } = await imp('src/shell/slot-waits.js');
    const { healerNote } = await imp('src/shell/hunt-list.js');
    /* the server's bar and store rows as the envelope projects them: what a food heals is the server's row, never a client copy */
    const bar = (id) => settingsView({ preset: 0, slots: [slot('consume', id, null)], store: STORE });
    const prepAt = (id, hunt, level, hp) => weakFoodWords('prep', weakFoodOf(bar(id), groundFloor(hunt, level)), hp);
    /* ONE RULE ON EVERY GROUND, IN THE BAND IT WAS MEASURED FOR (the 139 audit's B2: at Level 5 the Barrows and the Hold named a food and the
       Pyre, the Slake and the Ford did not). Under a ground's band no store food is the fix and every ground says the same: nothing; from
       the band's first Level the measured floor speaks */
    const atFive = ['hasks_ford', 'the_slake', 'muster_barrows', 'pyre_field', 'krells_hold'].map((g) => prepAt('salted_shrimp', g, 5, 190));
    const edge = [prepAt('salted_shrimp', 'muster_barrows', 54, 840), prepAt('salted_shrimp', 'muster_barrows', 55, 845)];
    if (atFive.some(Boolean) || edge[0] !== '' || edge[1] !== 'Slot 1: Salted Shrimp heals 72 of 845 HP. Pick Salted Lobster')
      fails.push('AW-27 the food lines under and at a band read ' + JSON.stringify(atFive.concat(edge)));
    const prep = [prepAt('salted_shrimp', 'muster_barrows', 56, 850), prepAt('salted_trout', 'muster_barrows', 64, 990),
      prepAt('salted_trout', 'muster_barrows', 65, 1011), prepAt('salted_shrimp', 'muster_barrows', 65, 1011), prepAt('salted_shrimp', 'the_slake', 50, 819),
      prepAt('salted_shrimp', 'krells_hold', 85, 1208), prepAt('salted_shrimp', 'krells_hold', 88, 1305)];
    if (prep[0] !== 'Slot 1: Salted Shrimp heals 72 of 850 HP. Pick Salted Lobster'
      || prep[1] !== 'Slot 1: Salted Trout heals 120 of 990 HP. Pick Salted Lobster' || prep[2] !== '' || prep[3] !== 'Slot 1: Salted Shrimp heals 72 of 1,011 HP. Pick Salted Trout' || prep[4] !== ''
      || prep[5] !== 'Slot 1: Salted Shrimp heals 72 of 1,208 HP. Pick Salted Trout' || prep[6] !== '')
      fails.push('AW-27 the weak store food at the hero\'s Level reads ' + JSON.stringify(prep));
    /* ...naming every slot that holds it, and with no server store row for the food it says nothing (no client copy of a heal) */
    const two = settingsView({ preset: 0, slots: [slot('consume', 'salted_shrimp', null), slot('consume', 'cooked_lobster', 9), slot('consume', 'salted_shrimp', null)], store: STORE });
    const said = [weakFoodWords('prep', weakFoodOf(two, 'salted_trout'), 0), weakFoodWords('prep', weakFoodOf(two, 'salted_trout'), 990, 'Bryony'),
      weakFoodWords('prep', weakFoodOf(Object.assign({}, two, { store: [] }), 'salted_trout'), 990)];
    if (said[0] !== 'Slots 1 and 3: Salted Shrimp heals too little here. Pick Salted Trout' || said[1] !== 'Bryony\'s slots 1 and 3: Salted Shrimp heals 72 of 990 HP. Pick Salted Trout' || said[2] !== '')
      fails.push('AW-27 the weak food line\'s slots read ' + JSON.stringify(said));
    const facts = (o) => Object.assign({ set: bar('salted_shrimp'), bag: [], hero: { mana: 0 }, worn: null, skills: {}, pack: null, party: 1, alone: true, holding: false, test: null,
      ground: 'muster_barrows', level: 56, hpMax: 850, healed: false }, o);
    const on = (id, o) => slotWhy(slot('consume', id, null), facts(o));
    const why = [on('salted_shrimp'), on('salted_lobster'), on('salted_shrimp', { healed: true }), on('salted_shrimp', { ground: 'the_slake' }), on('salted_shrimp', { ground: null }), on('cooked_shrimp')];
    if (!why[0] || why[0].code !== 'food_weak' || why[0].strike !== false || why[0].text !== 'Salted Shrimp heals 72 of 850 HP. Pick Salted Lobster'
      || why.slice(1).some((x) => x && x.code === 'food_weak')) fails.push('AW-27 the bar\'s weak food slot reads ' + JSON.stringify(why));
    const notes = [healerNote('muster_barrows', 56, 'melee', false), healerNote('muster_barrows', 56, 'ranged', false), healerNote('muster_barrows', 56, 'magic', false),
      healerNote('muster_barrows', 56, 'melee', true), healerNote('muster_barrows', 65, 'melee', false), healerNote('the_slake', 50, 'melee', false)];
    if (notes[0] !== 'Recommended: Healer (Barrow Knight hits too hard for food)' || notes[1] !== notes[0]
      || notes.slice(2).some(Boolean)) fails.push('AW-27 the ground that expects a healer reads ' + JSON.stringify(notes));
    /* no text anywhere tells a player to turn Challenge on or off (Tyler 2026-11-14) */
    if (/challenge/i.test(prep.concat(notes, [why[0] && why[0].text]).join(' '))) fails.push('AW-27 a food or healer line names Challenge');
  }
  /* A rune spell with none of its ticked runes and no store behind it (its slot set to "Leave the hunt": a slot that says nothing
     buys from the shop, Tyler 2026-11-08) loses that spell only (named, not a stop); no food is said. */
  const leaving = (id) => ({ action: { type: 'ability', id, onEmpty: 'leave' }, conditions: [], join: 'and', usable: true, count: 0 });
  const spell = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [leaving('flame_strike')], store: STORE } }));
  /* (a rune spell spends any tier of its family, so the line names and counts the family: lane b-spell-content) */
  /* ...and says the fix: a style's default bar meets a new hero here first (designer 2026-10-29, lane/a-starter-bars) */
  if (spell !== 'Runes: no Fire runes carried. Flame Strike will not fire, pick Plain Fire Rune (1 gp) on the slot | Food and drink: none | Stamina: 8 h 0 min') fails.push('AW-27 a spell with no rune reads ' + JSON.stringify(spell));
  /* two spells of two families (the Mage's default Frost Lance and Arcane Barrier): both named, each family's store rune */
  const RUNES = STORE.concat([['plain_ice_rune', 'chalked_ice_rune'], ['plain_earth_rune', 'chalked_earth_rune']].map(([id, partner]) => ({ ...STORE.find((r) => r.id === 'plain_fire_rune'), id, partner })));
  const two = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [leaving('frost_lance'), leaving('arcane_barrier')], store: RUNES } }));
  if (!/^Runes: no Ice runes carried, no Earth runes carried\. Frost Lance and Arcane Barrier will not fire, pick Plain Ice Rune \(1 gp\) or Plain Earth Rune \(1 gp\) on the slot/.test(two))
    fails.push('AW-27 two struck spells read ' + JSON.stringify(two));
  /* AW-27 what casts, then what won't (first-hour play 2026-10-31: "no Fire runes of yours, then Plain Fire Rune from the store,
     then no Ice runes of yours, then no Earth runes of yours"); two spells of one family name its store rune once */
  const stored = (id, store) => ({ action: { type: 'ability', id, store }, conditions: [], join: 'and', usable: true, count: 0 });
  const mix = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), leaving('frost_lance')], store: RUNES } }));
  if (!mix.startsWith('Runes: Plain Fire Rune (1 gp a cast). Frost Lance will not fire, pick Plain Ice Rune (1 gp) on the slot')) fails.push('AW-27 a live spell beside a struck one reads ' + JSON.stringify(mix));
  /* the rune ladder: a named deeper rune is said at its own price; one above the level is no promise: the spell will not fire, and the fix is the family's Plain */
  const SCORED_ROW = { ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_scored_fire_rune', partner: 'scored_fire_rune', price: 8 };
  const deep = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_scored_fire_rune')], store: RUNES.concat([SCORED_ROW]) } }));
  if (!deep.startsWith('Runes: Scored Fire Rune (8 gp a cast) |')) fails.push('AW-27 a deeper store rune reads ' + JSON.stringify(deep));
  const short = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [{ ...stored('fireball', 'plain_scored_fire_rune'), usable: false, why: 'store_level' }], store: RUNES.concat([SCORED_ROW]) } }));
  if (!short.startsWith('Runes: no Fire runes carried. Fireball will not fire, pick Plain Fire Rune (1 gp) on the slot')) fails.push('AW-27 a store rune above the level reads ' + JSON.stringify(short));
  const WATER = RUNES.concat([{ ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_water_rune', partner: 'chalked_water_rune' }]);
  const same = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('greater_mend', 'plain_water_rune'), stored('circle_of_renewal', 'plain_water_rune')], store: WATER } }));
  if (!same.startsWith('Runes: Plain Water Rune (1 gp a cast) |')) fails.push('AW-27 two spells of one family read ' + JSON.stringify(same));
  /* AW-27 THREE SPELLS ARE THREE SPENDS, NOT A FALLBACK (played 2026-11-05, a new Mage: "Plain Fire Rune..., then Plain Ice Rune..., then Plain Earth Rune"): "then" stays inside one spell's own runes and its store rune */
  const trio = say(sess({ hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), stored('frost_lance', 'plain_ice_rune'), stored('arcane_barrier', 'plain_earth_rune')], store: RUNES } }));
  if (!trio.startsWith('Runes: Plain Fire Rune, Plain Ice Rune and Plain Earth Rune (1 gp a cast) |')) fails.push('AW-27 three store spells read ' + JSON.stringify(trio));
  const ownThenTwo = say(sess({ inventory: { chalked_fire_rune: 9 }, hunt_settings: { preset: 0, presets: [], slots: [stored('fireball', 'plain_fire_rune'), stored('frost_lance', 'plain_ice_rune')], store: RUNES } }));
  if (!ownThenTwo.startsWith('Runes: 9 Fire runes, then Plain Fire Rune (1 gp a cast). Plain Ice Rune (1 gp a cast) |')) fails.push('AW-27 own runes beside a store spell read ' + JSON.stringify(ownThenTwo));
  const sameFamilyOwn = say(sess({ inventory: { chalked_water_rune: 9 }, hunt_settings: { preset: 0, presets: [], slots: [stored('greater_mend', 'plain_water_rune'), stored('circle_of_renewal', 'plain_water_rune')], store: WATER } }));
  if (!sameFamilyOwn.startsWith('Runes: 9 Water runes, then Plain Water Rune (1 gp a cast) |')) fails.push('AW-27 two spells on one family\'s own runes read ' + JSON.stringify(sameFamilyOwn));
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
    const { openSlot } = await import(pathToFileURL(join(base, 'src/shell/bar-draft.js')).href + sourceQuery(base));
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
  /* AW-97 while the Blessings are free, Before you go says nothing of them: the summary's Bless step is the one place (first-30 play 2026-11-12) */
  if (/Blessing/.test(noneFree)) fails.push('AW-97 no Blessings, free, still nags before you go: ' + JSON.stringify(noneFree));
  if (!oneOn.endsWith("Blessings: 1 of 3, -25% death XP loss, next 450 gp")) fails.push('AW-27 one Blessing reads ' + JSON.stringify(oneOn));
  if (!allOn.endsWith('Blessings: 3 of 3, -75% death XP loss')) fails.push('AW-27 every Blessing reads ' + JSON.stringify(allOn));
  const nonePaid = blessed([], 450), oneFree = blessed([1], 0);
  if (!nonePaid.endsWith("Blessings: none (first: 450 gp, Shop → Services)")) fails.push('AW-27 no Blessings, priced, reads ' + JSON.stringify(nonePaid));
  if (/Blessing/.test(oneFree)) fails.push('AW-97 one Blessing, the rest free, still nags before you go: ' + JSON.stringify(oneFree));
  /* AW-27 A MOVE THE WORN WEAPON CAN'T USE SPENDS NOTHING: a club hero is not warned about Flame Volley's runes (QA 2026-11-04) */
  const clubSay = say(sess({ hunt_settings: { preset: 0, presets: [], discipline: 'club', slots: [slot('ability', 'flame_volley', 0), slot('ability', 'power_strike', 0)], store: RUNES } }));
  if (/Flame Volley|Fire rune|^Runes:/.test(clubSay)) fails.push('AW-27 a club hero is told about another weapon\'s runes: ' + JSON.stringify(clubSay));
  /* AW-27 A WEAPON SWAP PUTS THE WORN WEAPON'S MOVES IN FRONT (QA 2026-11-04: bow to club kept Hunter's Mark, Flame Volley and Precision Shot struck in 1-3, Power Strike in 7)
     AND TAKES NONE OFF (report #79, 2026-11-09: staff to spellbook deleted a Healer's four staff spells, and the staff again brought none back): the moves trade places, food never moves */
  const { barAfterSwap } = await imp('src/shell/bar-assign.js');
  const barSlot = (type, id) => ({ action: { type, id }, conditions: [], join: 'and' });
  const swapped = barAfterSwap({ discipline: 'club', slots: [barSlot('ability', 'hunters_mark'), barSlot('ability', 'flame_volley'), barSlot('ability', 'precision_shot'), barSlot('consume', 'cooked_shrimp'), barSlot('consume', 'salted_shrimp'), barSlot('consume', 'thin_turnip_juice'), barSlot('ability', 'power_strike'), barSlot('ability', 'turning_cut')] });
  const swapRead = (swapped || []).slice(0, 9).map((w) => (w ? w.action.id : '-')).join(' ');
  if (swapRead !== 'power_strike turning_cut hunters_mark cooked_shrimp salted_shrimp thin_turnip_juice flame_volley precision_shot -') fails.push('AW-27 the bar after bow to club reads ' + JSON.stringify(swapRead));
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
  if (!empty.startsWith("!Ammo: none loaded (no attacks). Bag → Bronze Arrows → Put on the bar")) fails.push('AW-27 a bow with nothing loaded reads ' + JSON.stringify(empty));
  const full = say(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'bronze_arrows' } }));
  if (!full.startsWith('Ammo: Bronze Arrows (loaded), never runs out')) fails.push('AW-27 a bow with the free arrow reads ' + JSON.stringify(full));
  const paid = say(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'iron_arrows' }, inventory: { iron_arrows: 9 } }));
  if (!paid.startsWith('Ammo: 9 Iron Arrows (loaded)')) fails.push('AW-27 a bow with a paid arrow reads ' + JSON.stringify(paid));
  if (/Ammo/.test(say(sess({ hunt_settings: { preset: 0, presets: [], role: 'tank', slots: [], store: STORE } })))) fails.push('AW-27 a sword is told about ammo');
  /* AW-27 WARNED, NEVER BLOCKED, AND THE WORDS AGREE (the panel 2026-11-01): the hunt screen says what prep said of a bow with
     nothing to shoot; no weapon is said at prep; a held task that does not count here is said; the Sewer's words admit the lone hero who
     walks in; "an Iron Boots"; "Bow or Crossbow or Bow or crossbow"; creation and prep agree on the free arrow. */
  if (!/^none loaded \(no attacks\)/.test(noShotWords(bowSet({ equipment: { weapon: 'practice_bow' } })))) fails.push('AW-27 the hunt screen is silent on a bow with nothing to shoot: ' + JSON.stringify(noShotWords(bowSet({ equipment: { weapon: 'practice_bow' } }))));
  if (noShotWords(bowSet({ equipment: { weapon: 'practice_bow', ammo: 'bronze_arrows' } }))) fails.push('AW-27 the hunt screen warns a loaded bow');
  if (!say(sess({ equipment: {} })).startsWith('!Weapon: none |')) fails.push('AW-27 no weapon reads ' + JSON.stringify(say(sess({ equipment: {} }))));
  const TASK = { held: [{ place: 1, task: 'cellar_giant_rats', hunt: 'mill_cellar', monster: 'rat', kills: 0, target: 120, keep: false, done: false }], paid_today: 0, per_day: 3, held_max: 3, order: [], recent: [] };
  if (!/Tamsin tasks count elsewhere: Giant Rats in .+/.test(say(sess({ tally: TASK }), { hunt: 'meadowbrook_thicket' }))) fails.push('AW-27 a held task elsewhere reads ' + JSON.stringify(say(sess({ tally: TASK }), { hunt: 'meadowbrook_thicket' })));
  if (/Tamsin/.test(say(sess({ tally: TASK }), { hunt: 'mill_cellar' }))) fails.push('AW-27 a task that counts here is warned about');
  const { heroWords, huntRows } = await imp('src/shell/hunt-list.js');
  const sewer = huntRows().find((r) => r.hunt === 'millrace_sewer');
  if (heroWords(sewer) !== 'Players: 1 to ' + sewer.heroes) fails.push('AW-27 the Sewer reads ' + JSON.stringify(heroWords(sewer)));
  const { pickWords } = await imp('src/session/tally-sections.js');
  const picked = [['iron_boots', 'Iron Boots'], ['iron_helmet', 'an Iron Helm']].map(([item]) => pickWords({ pick: 'piece', item, qty: 1 }, (id) => ({ iron_boots: 'Iron Boots', iron_helmet: 'Iron Helm' }[id]))).join('|');
  if (picked !== 'Iron Boots|an Iron Helm') fails.push('AW-27 her pick reads ' + picked);
  /* While fueling the picked stack, its pocket and the work line count alike (the panel 2026-11-01: "×15 · 14 being used" by a pocket of 1). */
  const { pickCountWords } = await imp('src/shell/windows/inventory/grid.js');
  if (pickCountWords(15, -14) !== '×1, 14 being used' || pickCountWords(100, 5) !== '×100, 5 more on the way' || pickCountWords(7, 0) !== '×7') fails.push('AW-27 the picked stack reads ' + pickCountWords(15, -14));
  const { factsOf } = await imp('src/shell/action-facts.js');
  const { ABILITIES } = await imp('src/data/abilities.js');
  for (const id of Object.keys(ABILITIES)) {
    const req = factsOf({ type: 'ability', id }).requires || '';
    const said = req.replace(/^Works with |\.$/g, '').toLowerCase().split(' or ');
    if (new Set(said).size !== said.length) fails.push('AW-27 ' + id + ' reads ' + JSON.stringify(req));
  }
  const { HOW_YOU_FIGHT } = await imp('src/data/how-to-play.js');
  const shoot = HOW_YOU_FIGHT.find((f) => f.id === 'shoot');
  if (!shoot || !/Free Bronze Arrows/.test(JSON.stringify(shoot))) fails.push('AW-27 creation says of the bow ' + JSON.stringify(shoot));
  /* AW-27 ONE NAME PER WEAPON (fresh-account play 11-13: the Hero screen said "Two axes or a hammer", the bag tip "Hatchets or a club"): each style
     names its weapons by the items' own names, and the bag's styles tip (the coach's styles card, one line since the label form 2026-11-16)
     says any style it names the same way: a weapon word of a style in the tip brings the style's whole name. */
  const { ITEMS: KIT } = await imp('src/data/items.js');
  const { COACH_TEXT } = await imp('src/data/text/coach.js');
  const stylesTip = [COACH_TEXT.styles, COACH_TEXT.styles_in].join(' ');
  if (!stylesTip.trim()) fails.push('AW-27 the bag\'s styles tip is empty');
  for (const f of HOW_YOU_FIGHT) {
    const off = f.weapons.filter((w) => !f.name.toLowerCase().includes(String(KIT[w]?.n || w).split(' ').pop().toLowerCase()));
    if (off.length) fails.push('AW-27 the ' + f.id + ' style "' + f.name + '" does not name ' + off.join(', '));
    const words = f.weapons.map((w) => String(KIT[w]?.n || w).split(' ').pop().toLowerCase());
    if (words.some((w) => new RegExp('\\b' + w + '\\b', 'i').test(stylesTip)) && !stylesTip.toLowerCase().includes(f.name.toLowerCase())) fails.push('AW-27 the bag\'s styles tip does not say "' + f.name + '": ' + JSON.stringify(stylesTip));
  }
  /* AW-8 / AW-27 AN EMPTY FOOD SLOT IS A HEADS-UP, NOT A BLOCKER (Tyler 10-29: "0 food" in Hunt prep on a hero that
     carries food the bar does not name and is not getting hit). Both surfaces say the empty stock and the bag's spare
     food with the fix, and neither calls it short; empty ammo on a shooter's bar still stops it. */
  const { readinessOf, readinessLine } = await imp('src/shell/readiness.js');
  const noStore = (slots, inv) => sess({ hunt_settings: { preset: 0, presets: [], slots, store: STORE, supplySource: 'own', onEmpty: 'stop' }, inventory: inv, name: 'Brannoc' });
  const fed = noStore([slot('consume', 'cooked_shrimp', 0)], { cooked_trout: 12 });
  const fedR = readinessOf(fed);
  const fedSaid = [readinessLine(fedR), fedR.checks.filter((c) => c.id === 'food').map((c) => (c.ok ? '' : '!') + c.text).join(), say(fed)].join(' || ');
  if (fedSaid !== 'Brannoc: ready || Food: no Cooked Shrimp left. Carried: 12 Cooked Trout, put it on the bar || Food: no Cooked Shrimp left. Carried: 12 Cooked Trout, put it on the bar | Stamina: 8 h 0 min')
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
  /* a store row's price as the line prints it, read from the data: this case pins the reader, not a price (a store price tune, such as
     lane/d-supply-prices' first pass, turned the literal red) */
  const gp = (id) => BASIC_SUPPLIES.find((b) => b.id === id).price.toLocaleString('en-US') + ' gp';
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
  const FREMULON_SAYS = 'Ammo: no Steel Arrows left, then Bronze Arrows, never runs out, 27,300 Mithril Arrows not on the bar';
  const want64 = [
    ['Eddie food', 'food', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], 'Food: 2,000 Swordfish Steak, then Salted Swordfish (' + gp('salted_swordfish') + ')'],
    ['Eddie drink', 'drink', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], 'Drink: Thin Carrot Juice (' + gp('thin_carrot_juice') + ')'],
    ['Eddie ammo', 'ammo', ['Cheeseburger Eddie', 'melee_dps', ...EDDIE], undefined],
    ['Fremulon ammo', 'ammo', ['Fremulon', 'ranger', ...FREMULON], FREMULON_SAYS],
    /* the player's order stands: a store slot ahead of his own is said as what it is, the store first */
    ['store ahead of own', 'food', ['A', 'melee_dps', [eat('salted_shrimp'), eat('cooked_shrimp')], { cooked_shrimp: 5 }, { weapon: 'steel_hatchets' }], 'Food: Salted Shrimp (' + gp('salted_shrimp') + '), then 5 Cooked Shrimp'],
    /* carried first, the worn ahead of the bar's, the store last, whatever the bar's order */
    ['the engine\'s order', 'ammo', ['A', 'ranger', [shoot('barbed_arrows')], { barbed_arrows: 5, iron_arrows: 3 }, { weapon: 'willow_longbow', ammo: 'iron_arrows' }], 'Ammo: 3 Iron Arrows (loaded), then 5 Barbed Arrows, then Plain Iron Arrows (1 gp)'],
    /* a whetstone or a rune is no one's shot, and the free rung ends the line */
    ['no whetstone in the arrows', 'ammo', ['A', 'ranger', [shoot('loaded')], { coarse_whetstone: 30000, chalked_fire_rune: 40, bronze_arrows: 5 }, { weapon: 'willow_longbow', ammo: 'bronze_arrows' }], 'Ammo: Bronze Arrows (loaded), never runs out'],
    /* the worn slot empty, own stock behind: the store is reached only when it is gone, and idle stock is said beside it */
    ['store with stock idle', 'ammo', ['A', 'ranger', [], { mithril_arrows: 9 }, { weapon: 'willow_longbow', ammo: 'steel_arrows' }], 'Ammo: no Steel Arrows left, then Plain Steel Arrows (1 gp), 9 Mithril Arrows not on the bar'],
    /* a slot switched Off spends nothing */
    ['an Off slot', 'food', ['A', 'melee_dps', [Object.assign(eat('cooked_shrimp'), { enabled: false }), eat('salted_shrimp')], { cooked_shrimp: 5 }, { weapon: 'steel_hatchets' }], 'Food: Salted Shrimp (14 gp). Carried: 5 Cooked Shrimp, put it on the bar'],
  ];
  /* every tier, every line: own stock counted, then its store row at the server's price */
  const KIND_64 = { heal: ['food', 'Food'], mana: ['drink', 'Drink'] };
  for (const b of BASIC_SUPPLIES) {
    if (KIND_64[b.kind]) want64.push(['tier ' + b.partner, KIND_64[b.kind][0], ['A', 'melee_dps', [eat(b.partner), eat(b.id)], { [b.partner]: 7 }, { weapon: 'steel_hatchets' }], KIND_64[b.kind][1] + ': 7 ' + nameOfItem(b.partner) + ', then ' + b.n + ' (' + b.price.toLocaleString('en-US') + ' gp)']);
    else if (!/_rune$/.test(b.id)) want64.push(['tier ' + b.partner, 'ammo', ['A', 'ranger', [shoot('loaded')], { [b.partner]: 7 }, { weapon: 'willow_longbow', ammo: b.partner }], 'Ammo: 7 ' + nameOfItem(b.partner) + ' (loaded), then ' + b.n + ' (' + b.price.toLocaleString('en-US') + ' gp)']);
    else {
      const spell = Object.values(SPELLS).find((a) => a.rune === b.partner);
      if (spell) want64.push(['tier ' + b.partner, 'rune', ['A', 'mage', [spellStore(spell.id, b.id)], { [b.partner]: 7 }, { weapon: 'practice_staff' }], 'Runes: 7 ' + runeWordsOf(spell.rune, 7) + ', then ' + b.n + ' (' + b.price + ' gp a cast)']);
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
    ['a Mithril slot under its Ranged, Bronze behind it', 42, [[shoot('mithril_arrows'), shoot('bronze_arrows')], { mithril_arrows: 9, bronze_arrows: 5 }, BOW], 'Ammo: Bronze Arrows, never runs out, Mithril Arrows: Requires Ranged 45, now 42'],
    ['the same bar at the level', 45, [[shoot('mithril_arrows'), shoot('bronze_arrows')], { mithril_arrows: 9, bronze_arrows: 5 }, BOW], 'Ammo: 9 Mithril Arrows, then Bronze Arrows, never runs out'],
    ['a stack under its Ranged no slot names', 42, [[], { mithril_arrows: 9 }, { weapon: 'willow_longbow', ammo: 'steel_arrows' }], 'Ammo: no Steel Arrows left, then Plain Steel Arrows (1 gp)'],
    ['nothing else to shoot', 42, [[shoot('mithril_arrows')], { mithril_arrows: 9 }, BOW], 'Ammo: none loaded (no attacks). Empty slot → Ammo → pick a store shot, Mithril Arrows: Requires Ranged 45, now 42'],
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
    ['iron_arrows', [{ id: 'iron_arrows', qty: 9 }], 'Cost: 1 shot of Iron Arrows, 9 left'],
    ['bronze_arrows', [{ id: 'bronze_arrows', qty: 2600 }], 'Cost: 1 shot of Bronze Arrows, never runs out'],
  ]) if (loadedSays(worn, bag) !== text) fails.push('AW-64 the loaded slot on ' + worn + ' reads ' + JSON.stringify(loadedSays(worn, bag)));
  }
  /* AW-8 Hunt prep says HOW MUCH stamina, and in town the supply rate is the LAST hunt's (core-loop play 2026-10-30:
     "Stamina left" with no amount; "on this hunt" over a hero standing in Havora). */
  const an = { hero: { per_hour: { waste: 500 } } };
  const prepSaid = (ended) => readinessOf(sess({ hunt: { session_id: 's-1', hunt_id: 'mill_cellar', ended }, hunt_analyzer: an,
    stamina: { ms: 27000000, at: '2026-10-22T00:00:00Z', max_ms: 28800000 } })).checks.filter((c) => c.id === 'stamina' || c.id === 'gold-now').map((c) => c.text).join(' | ');
  const prepWant = (which) => 'Stamina: 7 h 30 m left | Gold: 500 gp, about 1 h at 500 gp/h ' + which;
  for (const [ended, which] of [[true, 'last hunt'], [false, 'on this hunt']]) {
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
    if (ops2(tank) !== '{"weapon":"iron_sword"}' || UP.upgradeWords(tank) !== 'Upgrade: Iron Sword (+3 Melee accuracy)') fails.push('AW-21 a sword-and-shield hero with Iron Swords at Level 15 reads ' + ops2(tank) + ' / ' + UP.upgradeWords(tank));
    if (Object.keys(plan({ weapon: 'practice_sword' }, [['iron_sword']], lv1, 14).ops).length) fails.push('AW-21 an Iron Sword goes on under its Level');
    /* A BANE IS A PLUS (designer re-read 2026-11-11: Level 16 in the Practice Sword with 6 Bramble Blades in the bag): the blade goes on and its preview names the bane, the
       engine's clamped number; a worn bane is never traded away for plain numbers, and the tooltip says what the bane is. */
    const bane = plan({ weapon: 'practice_sword', shield: 'practice_shield' }, [['bramble_blade', 6]], lv1, 16);
    if (ops2(bane) !== '{"weapon":"bramble_blade"}' || UP.upgradeWords(bane, 2, 3) !== 'Upgrade: Bramble Blade (+2 Melee accuracy, +2 Melee damage, +40% damage to Plant monsters)') fails.push('AW-21 a sword hero with Bramble Blades at Level 16 reads ' + ops2(bane) + ' / ' + UP.upgradeWords(bane, 2, 3));
    if ('weapon' in plan({ weapon: 'bramble_blade' }, [['iron_sword']], lv1, 16).ops) fails.push('AW-21 Equip upgrades traded a worn bane away for plain numbers');
    /* A WORN BANE AGAINST A PLAIN STRONGER BLADE IS SAID, NEVER SWAPPED (designer small call 2, 2026-11-11): the slot is a choice and the line says the trade in the
       engine's numbers (Iron Sword +7/+6 over Bramble +6/+5, the bane's clamped +40%); a hand swap to the Iron Sword sticks, since the Bramble does not dominate it. */
    const kept = plan({ weapon: 'bramble_blade', shield: 'practice_shield' }, [['iron_sword', 3]], lv1, 16);
    if (ops2(kept) !== '{}' || JSON.stringify(kept.choices) !== '[{"slot":"weapon","ids":["iron_sword"],"keeps":"bramble_blade","lost":[{"cls":"plant","pct":40}]}]'
      || UP.upgradeWords(kept) !== 'No clear upgrade: Iron Sword hits harder, Bramble Blade does +40% damage to Plant monsters')
      fails.push('AW-21 a worn Bramble Blade with Iron Swords in the bag reads ' + ops2(kept) + ' / ' + JSON.stringify(kept.choices) + ' / ' + UP.upgradeWords(kept));
    /* A BANE IS A REASON ONLY WHERE IT WINS (audit 2026-11-15 F15: Equip upgrades pressed from Level 15 to 55 kept the Bramble Blade over 40 Mithril Swords, "each piece is
       better at something", and the hero died twice at the Barrows, where nothing is a plant). The trade above stands because a plant lives on a ground of the hero's Level
       (Level 16: the Glade's Walking Vine, where the bane lands more a blow); with no plant on any ground of the Level, the bigger numbers go on. */
    /* skills as the server sends them, each with its xp (item-sections.js skillsOf): the engine's blow reads the xp */
    const XPC = await imp('src/core/xp.js');
    const sk = (melee) => ({ defense: { level: 50, xp: XPC.skillXpForLevel('defense', 50) }, melee: { level: melee, xp: XPC.skillXpForLevel('melee', melee) }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } });
    const seasoned = sk(50);
    const past = plan({ weapon: 'bramble_blade', shield: 'practice_shield' }, [['steel_sword', 3], ['mithril_sword', 40]], seasoned, 55);
    if (ops2(past) !== '{"weapon":"mithril_sword"}' || past.choices.length || UP.upgradeWords(past) !== 'Upgrade: Mithril Sword (+12 Melee accuracy)')
      fails.push('AW-21 a Level 55 hero in a Bramble Blade with Mithril Swords in the bag reads ' + ops2(past) + ' / ' + JSON.stringify(past.choices) + ' / ' + UP.upgradeWords(past));
    const vines = plan({ weapon: 'bramble_blade', shield: 'practice_shield' }, [['steel_sword', 2]], sk(30), 30);
    if (ops2(vines) !== '{}' || JSON.stringify(vines.choices) !== '[{"slot":"weapon","ids":["steel_sword"],"keeps":"bramble_blade","lost":[{"cls":"plant","pct":40}]}]')
      fails.push('AW-21 a real trade stopped asking: Level 30 (the Glade, Walking Vines) in a Bramble Blade with Steel Swords reads ' + ops2(vines) + ' / ' + JSON.stringify(vines.choices));
    /* A WORN OFF-HAND TAKES A BETTER ONE OF ITS KIND (audit 2026-11-15 F8: a Level 31 tank still held the Practice Shield): a shield for a shield, a spellbook for a
       spellbook; never a piece into an empty off-hand (above), never a shield for a spellbook, and a shield that costs accuracy for its guard is the player's pick. */
    const guard = plan({ weapon: 'steel_sword', shield: 'practice_shield' }, [['bronze_rimmed_shield'], ['practice_spellbook']], lv1, 31);
    if (ops2(guard) !== '{"shield":"bronze_rimmed_shield"}' || UP.upgradeWords(guard) !== 'Upgrade: Bronze-Rimmed Shield (+1 Defense)') fails.push('AW-21 a tank in the Practice Shield with a Bronze-Rimmed Shield in the bag reads ' + ops2(guard) + ' / ' + UP.upgradeWords(guard));
    if (ops2(plan({ weapon: 'practice_wand', shield: 'practice_spellbook' }, [['bronze_rimmed_shield'], ['ironbound_shield']], lv1, 31)) !== '{}') fails.push('AW-21 Equip upgrades would trade a spellbook for a shield');
    if (ops2(plan({ weapon: 'steel_sword', shield: 'ironbound_shield' }, [['kingsgrate']], lv1, 31)) !== '{}') fails.push('AW-21 Equip upgrades would put on a shield that costs accuracy');
    const swapped = plan({ weapon: 'iron_sword', shield: 'practice_shield' }, [['bramble_blade', 6]], lv1, 16);
    if (ops2(swapped) !== '{}' || swapped.choices.length || UP.upgradeWords(swapped) !== '') fails.push('AW-21 a hand swap to the Iron Sword does not stick: ' + ops2(swapped) + ' / ' + JSON.stringify(swapped.choices));
    /* A PIECE'S BANE IS ON ITS CARD AND ITS COMPARE (lane/a-compare-lines 2026-11-16, re-landed by lane/a-honesty-rescue; the coherence pass's
       DISCOVERIES 1: Kingstooth read "-1 Melee damage" against the Iron Sword, a side-grade shown as a loss): the stat lines and the compare carry the
       bane, the engine's clamped number (bane.js baneMultFor), a gain when the new piece has it and a loss when the worn one does, from the rows, so
       every unique gets it; and the call-only pieces are side-grades by their own attribute (C1, C2: never another piece's numbers plus one). */
    {
      const BM = await imp('src/shell/bag-model.js');
      const said = (l) => l.map((x) => x.text + ' ' + x.label + (x.delta === undefined ? '' : x.delta > 0 ? ' (gain)' : ' (loss)')).join(', ');
      for (const [got, want] of [
        [said(BM.statLines('bramble_blade')), '+6 Melee accuracy, +5 Melee damage, +40% Damage to Plant monsters'],
        [said(BM.statLines('cauldron_lid')), '+6 Defense, −10% Fire damage taken'],
        [said(BM.statLines('kingstooth')), '+8 Melee accuracy, +5 Melee damage, +10% Damage to Vermin monsters'],
        [said(BM.compare('kingstooth', 'iron_sword')), '+1 Melee accuracy (gain), −1 Melee damage (loss), +10% Damage to Vermin monsters (gain)'],
        [said(BM.compare('iron_sword', 'kingstooth')), '−1 Melee accuracy (loss), +1 Melee damage (gain), −10% Damage to Vermin monsters (loss)'],
        [said(BM.compare('cauldron_lid', 'coppercap_shield')), '−1 Defense (loss), −10% Fire damage taken (gain)'],
        [said(BM.compare('coppercap_shield', 'cauldron_lid')), '+1 Defense (gain), +10% Fire damage taken (loss)'],
      ]) if (got !== want) fails.push('AW-21 a piece\'s own attribute: wanted "' + want + '", read "' + got + '"');
      if (!BM.statLines('bramble_blade').some((s) => s.key === 'bane.plant')) fails.push('AW-21 the Bramble Blade\'s bane line is not keyed bane.plant (the special catalogue reads the card by field and class)');
    }
    /* ON THIS GROUND (lane/a-honest-lines 2026-11-16, re-landed by lane/a-honesty-rescue): a unique that reads worse than the ladder's piece can win
       where the hero hunts, so its card says so, from the ground's own monsters through the engine's readers (bane.js classOfMonster, monster-spells.js
       castsOf, elements.js resistProfile), and says nothing where it does nothing special. Generic: a planted resist row gets it with no code. */
    {
      const LORE = await imp('src/shell/item-lore.js'), CAT = (await imp('src/data/items.js')).ITEMS;
      const planted = { ...CAT, aw_resist_helm: { ...CAT.iron_helm, n: 'Planted Helm', resistPm: { ember: 100 } }, aw_guard_helm: { ...CAT.iron_helm, n: 'Guard Helm', resistPm: { physical: 30 } } };
      const edge = (id, hunt) => JSON.stringify(LORE.groundEdgeWords(id, hunt, planted));
      const want = [
        ['bramble_blade', 'mosslight_glade', '{"ground":"Mosslight Glade","lines":["+40% damage vs Walking Vine"]}'],
        ['kingstooth', 'mill_cellar', '{"ground":"Mill Cellar","lines":["+10% damage vs every monster here"]}'],
        ['cauldron_lid', 'coppercap_warrens', '{"ground":"Coppercap Warrens","lines":["−10% Fire damage from Goblin Digger and Chief Coppercap"]}'],
        ['aw_resist_helm', 'wickstead', '{"ground":"Wickstead","lines":["−10% Fire damage from Turncoat"]}'],
        ['bramble_blade', 'wickstead', 'null'], ['aw_resist_helm', 'meadowbrook_thicket', 'null'], ['aw_guard_helm', 'wickstead', 'null'],
        ['iron_sword', 'mosslight_glade', 'null'], ['bramble_blade', null, 'null']];
      for (const [id, hunt, line] of want) if (edge(id, hunt) !== line) fails.push('AW-21 ON THIS GROUND: ' + id + ' on ' + hunt + ' reads ' + edge(id, hunt) + ', not ' + line);
    }
    /* A PIECE'S RESISTANCE IS ON ITS CARD, IN PLAIN WORDS (lane/c-krell-uniques; the special-attributes lane found no card line for resistPm): Krell's two
       unique pieces say what they take off, the engine's own number, after their plain stats, and the comparison against the standard piece names it as the gain. */
    {
      const BM = await imp('src/shell/bag-model.js');
      const line = (id, key) => { const s = BM.statLines(id).find((x) => x.key === key); return s ? s.label + ' ' + s.text : 'no line'; };
      if (line('banded_legguards', 'resistPm.physical') !== 'Physical damage taken −3%') fails.push('AW-21 the Banded Legguards\' card reads ' + line('banded_legguards', 'resistPm.physical') + ', not Physical damage taken −3%');
      if (line('krells_tollgate', 'resistPm.ember') !== 'Fire damage taken −10%') fails.push('AW-21 Krell\'s Tollgate\'s card reads ' + line('krells_tollgate', 'resistPm.ember') + ', not Fire damage taken −10%');
      if (line('krells_tollgate', 'defB') !== 'Defense +15' || BM.statLines('krells_tollgate').length !== 2) fails.push('AW-21 Krell\'s Tollgate\'s card is not its guard and its one attribute: ' + JSON.stringify(BM.statLines('krells_tollgate')));
      if (BM.statLines('dawn_platelegs').some((s) => /^resistPm/.test(s.key))) fails.push('AW-21 a piece with no resistance shows a resistance line');
      const cmp = JSON.stringify(BM.compare('banded_legguards', 'dawn_platelegs'));
      if (cmp !== '[{"label":"Physical damage taken","delta":30,"text":"−3%"}]') fails.push('AW-21 the Banded Legguards against Dawnsteel Platelegs read ' + cmp + ', not the 3% alone');
      /* WHERE THEY COME FROM (found on the card at runtime, lane/c-krell-uniques: every one of Krell's pieces read "Dropped by creatures on grounds that
         aren't open yet", his 14 standard pieces too): an open hall's boss is a place a player can reach, and the link opens the ground his door is on. */
      const LORE = await imp('src/shell/item-lore.js'), GF = await imp('src/shell/hunt-ground-facts.js');
      for (const id of ['krells_tollgate', 'banded_legguards', 'dawn_helm']) {
        if (LORE.sourcesOf(id).join(' | ') !== 'Dropped by Lord Krell at Krell\'s Hall') fails.push('AW-21 the ' + id + ' card\'s Comes from reads ' + JSON.stringify(LORE.sourcesOf(id)) + ', not Dropped by Lord Krell at Krell\'s Hall');
        if (JSON.stringify(GF.dropPlaceOf(id)) !== '{"kind":"hunt","hunt":"krells_hold"}') fails.push('AW-21 the ' + id + ' card\'s source link opens ' + JSON.stringify(GF.dropPlaceOf(id)) + ', not Krell\'s Hold (the hall\'s door)');
      }
      if (LORE.sourcesOf('hall_key').join() !== 'Dropped by Gatekeeper at Krell\'s Hold') fails.push('AW-21 the Hall Key\'s source moved: ' + LORE.sourcesOf('hall_key'));
      const back = BM.compare('dawn_platelegs', 'banded_legguards');
      if (back.length !== 1 || back[0].delta !== -30 || back[0].text !== '+3%') fails.push('AW-21 taking the Banded Legguards off for Dawnsteel Platelegs does not read as +3% physical damage taken: ' + JSON.stringify(back));
    }
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
    if (ops2(follow) !== '{"ring2":"banded_signet_follow"}' || UP.upgradeWords(follow) !== 'Upgrade: Banded Signet (Follow-through)' || UP.upgradeWords(unsaid) !== 'Upgrade: Banded Signet (adds Follow-through)')
      fails.push('AW-21 a Follow-through ring in the bag beside a worn Keen ring reads ' + ops2(follow) + ' / ' + UP.upgradeWords(follow) + ' / ' + UP.upgradeWords(unsaid));
    /* a perked ring that also adds a number: the number follows the name, never a second bracket (voice lane 2026-11-09: "(Follow-through) (+1 Melee accuracy)" read wrong) */
    const both = { picks: follow.picks.map((p) => ({ ...p, gains: [{ label: 'Melee accuracy', text: '+1 Melee accuracy' }, ...p.gains] })), choices: [] };
    if (UP.upgradeWords(both) !== 'Upgrade: Banded Signet (Follow-through), +1 Melee accuracy') fails.push('AW-21 a perked ring that adds a number reads ' + UP.upgradeWords(both));
    if (Object.keys(rings('banded_signet_follow', 'banded_signet', ['banded_signet_follow']).ops).length) fails.push('AW-21 a second Follow-through ring goes on, though a perk plays once');
    if (Object.keys(rings('banded_signet_follow', 'banded_signet_keen', ['banded_signet_surge']).ops).length) fails.push('AW-21 a Surge ring silently takes a Keen ring\'s place');
    const pick = rings('banded_signet_follow', 'banded_signet', ['banded_signet_keen', 'banded_signet_surge']);
    if (ops2(pick) !== '{}' || JSON.stringify(pick.choices) !== '[{"slot":"ring2","ids":["banded_signet_keen","banded_signet_surge"]}]'
      || UP.upgradeWords(pick) !== 'No clear upgrade: Ring 2: Banded Signet (Keen) or Banded Signet (Surge)')
      fails.push('AW-21 Keen and Surge rings over a plain one read ' + ops2(pick) + ' / ' + JSON.stringify(pick.choices) + ' / ' + UP.upgradeWords(pick));
    /* A RESISTANCE COUNTS ONLY WHERE IT PLAYS, THE SAME LEVEL-BAND WAY AS A BANE (lane/a-next-steps; lane/c-krell-uniques gives gear `resistPm`: Krell's Tollgate fire, the
       Banded Legguards physical). Level 17 hunts Wickstead, where the Turncoat's Smoke Pot is fire; Level 20 has no fire on any ground. The rows are made here for the
       test (Bronze Platelegs with a resistance) and put back after. */
    /* the build's ?v= instance of the catalogue, the one upgrade-plan.js reads */
    const { ITEMS: IT } = await import(pathToFileURL(join(base, 'src/data/items.js')).href + sourceQuery(base));
    const threats = (lv) => Array.from(UP.threatsAt(lv)).sort().join();
    if (threats(17) !== 'ember,physical,poison' || threats(20) !== 'physical,poison') fails.push('AW-21 the damage in range reads ' + threats(17) + ' at 17 and ' + threats(20) + ' at 20');
    IT.aw21_fire_legs = { ...IT.bronze_platelegs, n: 'Fireproof Legs', resistPm: { ember: 100 } };
    try {
      const legs = (worn, bag, level) => plan({ weapon: 'practice_sword', pants: worn }, [[bag]], lv1, level);
      const gain = legs('bronze_platelegs', 'aw21_fire_legs', 17);
      if (ops2(gain) !== '{"pants":"aw21_fire_legs"}' || UP.upgradeWords(gain) !== 'Upgrade: Fireproof Legs (-10% Fire damage taken)') fails.push('AW-21 fire resistance where fire is dealt reads ' + ops2(gain) + ' / ' + UP.upgradeWords(gain));
      if (Object.keys(legs('bronze_platelegs', 'aw21_fire_legs', 20).ops).length) fails.push('AW-21 fire resistance counts with no fire in range');
      const keep = legs('aw21_fire_legs', 'iron_platelegs', 17);
      if (ops2(keep) !== '{}' || JSON.stringify(keep.choices) !== '[{"slot":"pants","ids":["iron_platelegs"],"keeps":"aw21_fire_legs","lost":[{"resist":"ember","pct":10}],"gain":"+4 Defense"}]'
        || UP.upgradeWords(keep) !== 'No clear upgrade: Iron Platelegs adds +4 Defense, Fireproof Legs cuts fire damage by 10%')
        fails.push('AW-21 a worn fire resistance against bigger plain numbers where fire is dealt reads ' + ops2(keep) + ' / ' + JSON.stringify(keep.choices) + ' / ' + UP.upgradeWords(keep));
      const gone = legs('aw21_fire_legs', 'iron_platelegs', 20);
      if (ops2(gone) !== '{"pants":"iron_platelegs"}' || gone.choices.length) fails.push('AW-21 a fire resistance with no fire in range holds the bigger numbers off: ' + ops2(gone) + ' / ' + JSON.stringify(gone.choices));
      /* PHYSICAL, once lane/c-krell-uniques' `physical` key is in the engine's profile (elements.js HERO_RESIST_KEYS): every monster swings, so it counts wherever a ground is in range */
      const EL = await imp('src/data/elements.js');
      if (Array.isArray(EL.HERO_RESIST_KEYS) && EL.HERO_RESIST_KEYS.includes('physical')) {
        IT.aw21_guard_legs = { ...IT.bronze_platelegs, n: 'Banded Test Legs', resistPm: { physical: 30 } };
        if (ops2(legs('bronze_platelegs', 'aw21_guard_legs', 20)) !== '{"pants":"aw21_guard_legs"}') fails.push('AW-21 physical resistance does not count, though every monster swings');
        if (ops2(legs('aw21_guard_legs', 'iron_platelegs', 20)) !== '{}') fails.push('AW-21 a worn physical resistance is traded away for plain numbers');
      }
    } finally { delete IT.aw21_fire_legs; delete IT.aw21_guard_legs; }
  }
  /* A tie between armor weights goes to the weight the hero chose at Tamsin's (playtest 2026-10-29: a tank paid in
     heavy came home from the Thicket with a Bronze Platebody and a Leather Body and wore neither). No weight known: the
     tie stands. None of that weight in the bag for a BARE armor slot: the piece that guards most goes on, so it never waits (played 2026-11-04;
     designer ruling 2b of 2026-11-18 put it back after the 139 audit's B6 took it out). */
  const found = [['bronze_platebody'], ['leather_body'], ['bronze_boots'], ['leather_boots']].map(([id]) => ({ id, qty: 1 }));
  const kit = { weapon: 'practice_sword', shield: 'practice_shield' };
  const tieOf = (prefer) => UP.upgradePlan({ equipment: kit, bag: found, skills: lv1, level: 5, prefer });
  const tieOps = ['', 'heavy', 'medium', 'light'].map((w) => ops2(tieOf(w || null)) + '/' + tieOf(w || null).choices.length).join(' | ');
  if (tieOps !== '{}/2 | {"body":"bronze_platebody","boots":"bronze_boots"}/0 | {"body":"leather_body","boots":"leather_boots"}/0 | {"body":"bronze_platebody","boots":"bronze_boots"}/0')
    fails.push('AW-21 the weight chosen at Tamsin\'s settles a tie as ' + tieOps);
  /* THE WEIGHT RULE (designer ruling 2b of 2026-11-18, the full-game audit's A11; it undoes the 139 audit's B6, which made a bare armor slot wait for
     the hero's weight). (1) A BARE armor slot takes the best piece that beats bare, of ANY weight: the Level 1 light Mage holding the Shop's Leather
     Gloves and Bronze Belt and an Apprentice Hat wears the hat AND the gloves (B6 left the gloves bare); the heavy belt costs Magic accuracy, so it
     stays off either way. A heavy hero's bare belt takes the medium Studded Leather Belt, or the Bronze Belt that beats it. */
  const bagOf = (ids) => ids.map((id) => ({ id, qty: 1 }));
  const mage = UP.upgradePlan({ equipment: { weapon: 'practice_wand' }, bag: bagOf(['apprentice_helmet', 'leather_gloves', 'bronze_belt']), skills: lv1, level: 1, prefer: 'light', chosen: 'light' });
  if (ops2(mage) !== '{"gloves":"leather_gloves","helmet":"apprentice_helmet"}' || UP.upgradeWords(mage) !== 'Upgrade: Apprentice Hat (+2 Magic accuracy) and Leather Gloves (+1 Defense)')
    fails.push('AW-21 the Level 1 light Mage puts on ' + ops2(mage) + ': ' + UP.upgradeWords(mage) + ' (want the hat and the gloves, never the heavy belt)');
  const beltOf = (bag, belt) => ops2(UP.upgradePlan({ equipment: { ...kit, body: 'bronze_platebody', ...(belt ? { belt } : {}) }, bag: bagOf(bag), skills: lv1, level: 15, prefer: 'heavy', chosen: 'heavy' }));
  const belts = [beltOf(['studded_belt']), beltOf(['studded_belt', 'bronze_belt'])];
  if (belts[0] !== '{"belt":"studded_belt"}' || belts[1] !== '{"belt":"bronze_belt"}') fails.push('AW-21 a heavy hero\'s bare belt slot takes ' + JSON.stringify(belts));
  /* (2) A WORN piece off the weight chosen at Tamsin's takes a piece of that weight of the same tier or higher, and the line says what the move gives
     up as well as what it adds: a heavy hero's Leather Gloves (bought at Level 9, worn to 85 in the audit) go for the Bronze Gauntlets. Never a lower
     tier (a worn Studded Leather Belt stays over the Bronze Belt), never the reverse (Bronze Boots stay over Leather Boots), and with no weight chosen
     nothing moves a worn piece to another weight. */
  const heavyIn = (worn, bag, chosen) => UP.upgradePlan({ equipment: { ...kit, body: 'bronze_platebody', ...worn }, bag: bagOf(bag), skills: lv1, level: 9, prefer: 'heavy', chosen });
  const moved = heavyIn({ gloves: 'leather_gloves' }, ['bronze_gauntlets'], 'heavy');
  if (ops2(moved) !== '{"gloves":"bronze_gauntlets"}' || UP.upgradeWords(moved) !== 'Upgrade: Bronze Gauntlets (+11 health, -1 Melee accuracy)')
    fails.push('AW-21 a heavy hero\'s worn Leather Gloves with Bronze Gauntlets in the bag: ' + ops2(moved) + ' / ' + UP.upgradeWords(moved));
  const stays = [beltOf(['bronze_belt'], 'studded_belt'), ops2(heavyIn({ boots: 'bronze_boots' }, ['leather_boots'], 'heavy')), ops2(heavyIn({ boots: 'leather_boots' }, ['bronze_boots'], null))];
  if (stays.some((s) => s !== '{}')) fails.push('AW-21 a lower tier, the reverse, or no weight chosen moved a worn piece: ' + JSON.stringify(stays));
  /* ONE PRESS DOES WHAT TWO WOULD: a heavy bow hero's bare boots take the Leather Boots that beat bare, which (2) moves to the Bronze Boots, so the
     press puts the Bronze Boots on at once and the next plan is empty */
  const bow = { weapon: 'practice_bow' };
  const once = UP.upgradePlan({ equipment: bow, bag: bagOf(['leather_boots', 'bronze_boots']), skills: lv1, level: 5, prefer: 'heavy', chosen: 'heavy' });
  const twice = UP.upgradePlan({ equipment: { ...bow, ...once.ops }, bag: bagOf(['leather_boots']), skills: lv1, level: 5, prefer: 'heavy', chosen: 'heavy' });
  if (ops2(once) !== '{"boots":"bronze_boots"}' || ops2(twice) !== '{}' || UP.upgradeWords(once) !== 'Upgrade: Bronze Boots (+2 Defense, -1 Ranged accuracy)')
    fails.push('AW-21 a heavy bow hero\'s bare boots take ' + ops2(once) + ' (' + UP.upgradeWords(once) + '), then ' + ops2(twice));
  /* NO HERO STAYS BARE FOR WANT OF A CHOICE (played 2026-11-04: Marlow fought a night in nothing over 140 pieces; Sorrel, a hammer, was bare at hour 16): her pick, else what the hero wears most, else its role's. */
  const weightIs = [['medium', { weapon: 'practice_sword', body: 'bronze_platebody' }, 'tank', 'medium'], [null, { weapon: 'practice_sword', body: 'leather_body', boots: 'leather_boots' }, 'tank', 'medium'], [null, kit, 'melee_dps', 'heavy'], [null, kit, 'ranger', 'medium'], [null, kit, 'healer', 'light'], [null, kit, null, null]];
  for (const [chosen, worn, role, want] of weightIs) if (UP.preferredWeight(chosen, worn, role) !== want) fails.push('AW-21 chosen ' + chosen + ', role ' + role + ' prefers ' + UP.preferredWeight(chosen, worn, role) + ', wanted ' + want);
  /* the window reads it: a hammer hero, no pick at Tamsin's, with one of each helmet */
  const { upgradeOf } = await imp('src/shell/widgets/upgrade-line.js');
  const bare = { state: { level_xp: 200 }, level: levelBlock(200), inventory: { bronze_helm: 1, leather_helmet: 1 }, equipment: { weapon: 'practice_club' }, hunt_settings: { preset: 0, role: 'melee_dps', slots: [] }, skills: { melee: { xp: 0, level: 1 }, defense: { xp: 0, level: 1 } } };
  if (upgradeOf({ read: (k) => bare[k] }).ops.helmet !== 'bronze_helm') fails.push('AW-21 a hammer hero with no pick would put on ' + JSON.stringify(upgradeOf({ read: (k) => bare[k] }).ops));
  /* A TIER STEP (designer ruling 2026-10-31, played: Marlow, Level 16 in a full Bronze plate set, wore none of ten Iron
     Platebodies, since each one alone broke the set's +1% critical chance): the next tier of the worn weight goes on, and
     the line names the set bonus it ends. */
  const bronzeSet = { weapon: 'bronze_sword', helmet: 'bronze_helm', body: 'bronze_platebody', pants: 'bronze_platelegs', boots: 'bronze_boots', belt: 'bronze_belt' };
  const stepOf = (equipment, ids) => UP.upgradePlan({ equipment, bag: ids.map((id) => ({ id, qty: 1 })), skills: lv1, level: 16 });
  const step = stepOf(bronzeSet, ['iron_platebody', 'iron_platelegs', 'iron_helm']);
  if (ops2(step) !== '{"body":"iron_platebody","helmet":"iron_helm","pants":"iron_platelegs"}' || !UP.upgradeWords(step).endsWith('Set bonus lost: +1% critical chance'))
    fails.push('AW-21 a full Bronze set at Level 16 would put on ' + ops2(step) + ': ' + UP.upgradeWords(step));
  if (/Set bonus lost/.test(UP.upgradeWords(stepOf({ weapon: 'bronze_sword', body: 'bronze_platebody' }, ['iron_platebody'])))) fails.push('AW-21 a step that ends no set says it ends one');
  /* A tie that stands says why the button is off (playtest 2026-10-29 #11: the line was hidden, nothing said). */
  const tieSaid = UP.upgradeWords(tieOf(null));
  if (tieSaid !== 'No clear upgrade: Body: Bronze Platebody or Leather Body. Boots: Bronze Boots or Leather Boots')
    fails.push('AW-21 a standing tie reads ' + JSON.stringify(tieSaid));
  /* "Decide once": the shop's section bids only on what the bag holds, so a stack sold since (0 in the bag) is never
     called unsellable (playtest 2026-10-29: the coach rang a Sell its row had switched off). */
  const { planBlock } = await imp('src/shell/loot-dispatch.js');
  const noBid = new Map([['bones', 1]]);
  const planSaid = [planBlock('rat_tail', 'sell', noBid, false), planBlock('rat_tail', 'sell', noBid, true), planBlock('rat_tail', 'sell', noBid),
    planBlock('practice_bow', 'sell', noBid, false)].join('|');
  if (planSaid !== '|The shop does not buy this.|The shop does not buy this.|Shop doesn\'t buy starting kit') fails.push('AW-21 a loot plan off for a stack not held reads ' + JSON.stringify(planSaid));
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
  /* (the Iron Helm and the Longbow are Rare somewhere and everyday elsewhere, so they are spare; the Kingstooth drops only as a Rare, so it is not; the Iron Warhammer was that piece until the Glade dropped it hourly, 2026-11-18) */
  const OUTGROWN = ['bronze_helm', 'bronze_platelegs', 'iron_helm', 'studded_helmet', 'adept_pants', 'leather_boots', 'longbow'];
  if (spareIds(stack(OUTGROWN), IRON) !== OUTGROWN.slice().sort().join()) fails.push('AW-70 an Iron hero\'s outgrown stacks read ' + spareIds(stack(OUTGROWN), IRON));
  for (const [what, id, rows, worn, rules, o] of [
    ['a higher tier of another weight', 'boarhide_body', null, IRON],
    ['a higher tier of its own slot', 'steel_platebody', null, IRON],
    ['a piece for an empty slot', 'bronze_helm', null, { ...IRON, helmet: null }],
    ['a Rare', 'houndskin_cloak', null, { ...IRON, cape: 'trollhide_cape' }],
    ['a Rare of a lower tier', 'kingstooth', null, { ...IRON, weapon: 'steel_sword' }],
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
  if (saleWords([{ item: 'klappas_club', qty: 1 }]) !== 'Nothing sells the Practice Club that makes another Klappa\'s Klub.' || saleWords([{ item: 'bronze_helm', qty: 3 }])) fails.push('AW-70 a hand sale of the club says ' + JSON.stringify(saleWords([{ item: 'klappas_club', qty: 1 }])));
  const big = spareSale(stack(Array.from({ length: 70 }, () => 'bronze_helm')), IRON, rulesAre(), { bids: new Map([['bronze_helm', 10]]) }, {});
  if (big.lines.length !== 64 || big.total !== 64 * 3 * 10 || big.more !== 6 || big.capped) fails.push('AW-70 past the engine\'s 64 lines a sale reads ' + big.lines.length + ' lines, ' + big.total + ' gp, ' + big.more + ' more, capped ' + big.capped);
  /* AW-70b BULK SALES OF A BIG BAG (audit F18, 2026-11-15: a Level 60 bag of 145 outgrown stacks; replayed on the local world 11-16: Sell spare gear
     left 41 Rare stacks, a press each, and the bag's "Sell all gear" or a 95-stack selection sent 95 lines, which the engine's 64 refuse, so nothing sold).
     Every bulk sale the bag sends carries at most 64 lines and says how many are left; "Select outgrown" selects the outgrown gear, Rares in (the
     player sees the selection and confirms it), never a locked stack, a higher tier, what Equip upgrades wants or the start kit. */
  {
    const { sellPlan: plan70, outgrownIds, upgradeWanted } = await imp('src/shell/bag-model.js');
    const { edgeBody } = await imp('src/session/edge-intents.js');
    const many = Object.keys((await imp('src/data/items.js')).ITEMS).filter((id) => /^[a-z0-9_]+$/.test(id)).slice(0, 95).map((id) => ({ id, qty: 2 }));
    const p95 = plan70(many, many.map((r) => r.id), { bids: new Map(many.map((r) => [r.id, 7])) });
    if (p95.lines.length !== 64 || p95.more !== 31 || p95.total !== 64 * 2 * 7) fails.push('AW-70b a 95-stack sale reads ' + p95.lines.length + ' lines, ' + p95.more + ' more, ' + p95.total + ' gp');
    if (!edgeBody(0, 'vendor_sell_many', { lines: p95.lines }, '00000000-0000-4000-8000-000000000000')) fails.push('AW-70b a 95-stack bag sale builds no engine ask (nothing would sell)');
    const TROLL = { ...IRON, cape: 'trollhide_cape' };
    const outRows = stack(['houndskin_cloak', 'bronze_helm', 'steel_platebody', 'practice_club', 'kingstooth']);
    const picked = outgrownIds(outRows, { ...TROLL, weapon: 'steel_sword' }, rulesAre(), { wanted: upgradeWanted({ picks: [], choices: [] }) }).sort().join();
    if (picked !== 'bronze_helm,houndskin_cloak,kingstooth') fails.push('AW-70b Select outgrown picks ' + picked + ', want bronze_helm,houndskin_cloak,kingstooth');
    if (spareIds(outRows, { ...TROLL, weapon: 'steel_sword' }) !== 'bronze_helm') fails.push('AW-70b Sell spare gear now sells a Rare: ' + spareIds(outRows, { ...TROLL, weapon: 'steel_sword' }));
    const wantedUp = upgradeWanted({ picks: [{ id: 'bronze_helm' }], choices: [{ ids: ['houndskin_cloak'] }] });
    if (outgrownIds(outRows, { ...TROLL, weapon: 'steel_sword' }, rulesAre(), { wanted: wantedUp }).join() !== 'kingstooth') fails.push('AW-70b Select outgrown takes what Equip upgrades wants');
    const SEL = await imp('src/shell/windows/inventory/selection.js');
    const scO = { sel: new Set(['rat_tail']), anchor: 'rat_tail', base: new Set(), cursor: null };
    SEL.selectOutgrown(scO, ['bronze_helm', 'houndskin_cloak', 'iron_warhammer'], new Set(['iron_warhammer']));
    if ([...scO.sel].sort().join() !== 'bronze_helm,houndskin_cloak') fails.push('AW-70b Select outgrown leaves the selection ' + [...scO.sel].sort().join() + ' (a locked stack in, or the old one kept)');
    const ST = await imp('src/shell/windows/inventory/state.js');
    const words = ST.confirmWords({ empty: false, plan: { ...p95, lines: Array.from({ length: 63 }, () => ({ item: 'bronze_helm', qty: 1 })).concat([{ item: 'houndskin_cloak', qty: 1 }]), kept: [], unpriced: [] } }).join(' | ');
    if (!/Remaining: 31 stacks/.test(words) || !/Rares: 1\b/.test(words)) fails.push('AW-70b the bag\'s confirmation reads ' + JSON.stringify(words) + ' (want Remaining: 31 stacks and Rares: 1)');
  }
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
    if (!food || !food.strike || food.text !== 'None in this hunt, 40 Cooked Shrimp in backpack, press to carry them in') fails.push('AW-65 the struck food slot reads ' + JSON.stringify(food));
    const rune = reasonOf(spell, { slots: bar, store: STORE, discipline: 'destruction', supplySource: 'mine', onEmpty: 'end' }, [], null, null, null, pack);
    if (!rune || rune.text !== 'No Fire rune in this hunt, 14 in backpack, press to carry them in') fails.push('AW-65 the struck rune spell reads ' + JSON.stringify(rune));
    /* RUNE-TRUTH (2027-02-21-hunt-carry-in.sql): the server struck a spell whose runes are all above the hero's level: the slot says that, not "the server says". */
    const locked = reasonOf({ ...spell, usable: false, why: 'rune_level' }, { slots: bar, store: STORE, discipline: 'destruction', supplySource: 'mine', onEmpty: 'end' }, [{ id: 'graven_fire_rune', qty: 2 }], null, null, null, null);
    if (!locked || locked.code !== 'rune_level' || !locked.strike || !/^Can't cast Fire runes yet/.test(locked.text)) fails.push('AW-65 a spell whose runes are above the level reads ' + JSON.stringify(locked));
    /* THE RUNE LADDER (2027-03-08-rune-ladder-slots.sql): a store rune above the hero's level says which rune and what it needs, not "the server says". */
    const SCORED = STORE.concat([{ ...STORE.find((r) => r.id === 'plain_fire_rune'), id: 'plain_scored_fire_rune', partner: 'scored_fire_rune', price: 8 }]);
    const over = reasonOf({ ...spell, action: { ...spell.action, store: 'plain_scored_fire_rune' }, usable: false, why: 'store_level' }, { slots: bar, store: SCORED, discipline: 'destruction', supplySource: 'mine', onEmpty: 'switch' }, [], null, null, { magic: { xp: 1, level: 14 } }, null);
    if (!over || over.code !== 'store_level' || !over.strike || !/^Scored Fire Rune requires Magic 15, pick a lower rune/.test(over.text)) fails.push('AW-65 a store rune above the level reads ' + JSON.stringify(over));
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
    if (!under || under.id !== 'mithril_arrows' || under.max !== 40 || under.wait !== 'Requires Ranged 45, now 42') fails.push('AW-65 a shot waiting for its level offers ' + JSON.stringify(under));
    const waits = reasonOf(waitSlot, shotSet, [], null, null, { ranged: { xp: 1, level: 42 } }, carryRows(archer(42)));
    if (!waits || waits.code !== 'skill' || !waits.strike || waits.text !== 'Requires Ranged 45, now 42, next ammo fires meanwhile') fails.push('AW-65 a waiting shot with its stack in the backpack reads ' + JSON.stringify(waits));
    const [atLevel] = carryFor(archer(45), waitSlot.action) || [];
    if (!atLevel || atLevel.wait !== null) fails.push('AW-65 a shot at its level still says it waits: ' + JSON.stringify(atLevel));
    const woke = reasonOf(waitSlot, shotSet, [], null, null, { ranged: { xp: 1, level: 45 } }, carryRows(archer(45)));
    if (!woke || woke.code !== 'stock' || woke.text !== 'None in this hunt, 40 Mithril Arrows in backpack, press to carry them in') fails.push('AW-65 at its level the shot in the backpack reads ' + JSON.stringify(woke));
    const none = reasonOf(bar[0], { slots: bar, store: STORE }, [], null, null, null, null);
    if (!none || none.text !== 'Out of Cooked Shrimp: next food or drink slot takes over') fails.push('AW-65 with nothing in the bag the food slot reads ' + JSON.stringify(none));
  }
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
    if (it.slot === 'ammo' && it.reqSkill === 'melee' && !/sharpens a melee weapon, wears out every \d+ swings/.test(said)) fails.push('AW-60 the whetstone ' + id + ' reads ' + said);
    if (it.slot === 'ammo' && it.reqSkill === 'magic' && !/^Rune/.test(kindWords(id))) fails.push('AW-60 the rune ' + id + ' is headed ' + kindWords(id));
    if (/Sell it at the shop/.test(said) && !(Number(it.v) > 0)) fails.push('AW-60 ' + id + ' says to sell it, and the shop bids nothing on it');
    if (it.seed && !/Plant it on the Farm/.test(said)) fails.push('AW-60 the seed ' + id + ' reads ' + said);
    /* a training item is opened in Training (its skill and hours, the row's own), never "sell it" (lane/c-training-gear-arm read it so) */
    if (it.type === 'training' && (said !== 'Open in Training: ' + it.training.hours + ' h of 200% ' + ({ melee: 'Melee', ranged: 'Ranged', magic: 'Magic', defense: 'Defense' })[it.training.skill] + ' XP' || kindWords(id) !== 'Training item')) fails.push('AW-60 the training item ' + id + ' reads ' + JSON.stringify([kindWords(id), said]));
    if (kindWords(id) === 'Junk' && /(Made|Gathered|Grown) with/.test(srcs)) fails.push('AW-60 ' + id + ' is headed Junk and reads ' + srcs);
    if (kindWords(id) === 'Junk' && /^Used in /.test(said)) fails.push('AW-60 ' + id + ' is headed Junk and reads ' + said);
    if (it.type === 'tool') {
      const pc = Math.round(it.toolSpeed * 100) + '%';
      if (/Sell it at the shop/.test(said) || !said.includes(pc + ' faster') || !/Works from the bag only/.test(said) || !/best tool counts$/.test(said)) fails.push('AW-60 the tool ' + id + ' reads ' + said);
      if (kindWords(id) !== 'Tool') fails.push('AW-60 the tool ' + id + ' is headed ' + kindWords(id));
    }
    /* who buys it: the row's book value is what the server's bid and the market's rule read */
    const sale = saleWords(id);
    if (!(Number(it.v) > 0) !== /^Own use only/.test(sale) && !it.bop) fails.push('AW-60 ' + id + ' (book ' + it.v + ') says of its buyers: ' + JSON.stringify(sale));
    if (Number(it.v) > 0 && !it.bop && isStartKit(id) !== /not at the Weighhouse/.test(sale)) fails.push('AW-60 ' + id + ' (kit ' + isStartKit(id) + ') says of its buyers: ' + JSON.stringify(sale));
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
  /* A KEY IS NEVER JUNK (lane/a-key-never-junk, 2026-11-20): the Hall Key opens Krell's Hold (`opens`), and nothing at a bench spends it, so
     kindOf filed it as Junk and Sell all junk sold it. Every row that opens something, from the catalogue: no bulk sale takes one. */
  const keys = Object.keys(ITEMS).filter((id) => ITEMS[id].opens);
  if (!keys.includes('hall_key')) fails.push('AW-60 CONTROL the Hall Key is no row that opens a hall: ' + keys.join());
  const keyBag = keys.map((id) => ({ id, qty: 1 })).concat([{ id: 'rat_tail', qty: 5 }]);
  const keySale = lootSale(keyBag, { locked: new Set() }, { bids: new Map(keyBag.map((r) => [r.id, 400])) }, null).lines.map((l) => l.item);
  if (keys.some((id) => kindOf(id) === 'junk') || keySale.some((id) => keys.includes(id)) || !keySale.includes('rat_tail')) fails.push('AW-60 Sell all junk sells a key: ' + JSON.stringify({ keySale, kinds: keys.map((id) => [id, kindOf(id)]) }));
  /* TOOLS: the row, where it counts, and moving one away. */
  const hero = (inv, bank, offers) => { const e = { inventory: inv, skills, shop: { offers: offers || [], bids: {} }, bank: bank || {} }; return { read: (k) => e[k], account: { read: (k) => e[k] } }; };
  const both = hero({ iron_axe: 1, bronze_axe: 1 });
  if (!/^Tool: Iron Axe\nWoodcutting 10% faster/.test(toolLine(both, 'woodcutting'))) fails.push('AW-60 the Woodcutting tool line reads ' + toolLine(both, 'woodcutting'));
  if (toolLine(both, 'runecrafting') !== '') fails.push('AW-60 Runecrafting has no tool and says ' + toolLine(both, 'runecrafting'));
  if (toolLine(both, 'fishing') !== '') fails.push('AW-60 no rod has a source yet, and Fishing says ' + toolLine(both, 'fishing'));
  if (!/^Iron Axe in Storage, not counted$/.test(toolLine(hero({}, { iron_axe: 1 }), 'woodcutting'))) fails.push('AW-60 an axe in Storage reads ' + toolLine(hero({}, { iron_axe: 1 }), 'woodcutting'));
  if (!/^Tool: Bronze Axe\n[\s\S]*\nIron Axe in Storage, not counted$/.test(toolLine(hero({ bronze_axe: 1 }, { iron_axe: 1 }), 'woodcutting'))) fails.push('AW-60 a better axe in Storage reads ' + toolLine(hero({ bronze_axe: 1 }, { iron_axe: 1 }), 'woodcutting'));
  const bare = toolLine(hero({}, {}, [{ offer: 'supply.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }]), 'woodcutting');
  if (!/^Tool: none\nBronze Axe: Shop\nWoodcutting 5% faster/.test(bare)) fails.push('AW-60 a hero with no axe reads ' + bare);
  if (toolLossWords(both, 'iron_axe', 1) !== 'Woodcutting slower without it, Bronze Axe takes over') fails.push('AW-60 storing the best axe says ' + toolLossWords(both, 'iron_axe', 1));
  if (toolLossWords(both, 'bronze_axe', 1) !== '') fails.push('AW-60 storing the axe that was not counting says ' + toolLossWords(both, 'bronze_axe', 1));
  if (toolLossWords(hero({ iron_axe: 2 }), 'iron_axe', 1) !== '') fails.push('AW-60 storing one of two axes says the rate changed');
  if (toolLossWords(hero({ iron_axe: 1 }), 'iron_axe', 1) !== 'Woodcutting slower without it') fails.push('AW-60 storing the only axe says ' + toolLossWords(hero({ iron_axe: 1 }), 'iron_axe', 1));
  if (toolLossWords(both, 'rat_tail', 1) !== '') fails.push('AW-60 storing a rat tail warns about tools');
  /* A SHORT INPUT SAYS WHERE IT COMES FROM, where the shortage is read. */
  /* (a bench row whose one input the Cellar drops: the silk-only sewing went with the armor recipes, lane/d-drop-homes 2026-11-18, so the Hearth's Lamp Jelly) */
  const wc = workRow('artisan', Object.keys(BENCH_INDEX).find((id) => { const i = BENCH_INDEX[id].recipe; return i.input === 'lamp_jelly' && !i.inputs; }));
  const short = workBlock({ read: (k) => (k === 'skills' ? { [wc.skill]: { xp: 0, level: 44 } } : k === 'inventory' ? {} : null) }, wc, false);
  if (!/^No Lamp Jelly in bag.*Dropped by .* at Mill Cellar/.test(short)) fails.push('AW-60 a bench row short of Lamp Jelly reads ' + short);
  if (whereToGet('copper_ore') !== 'Gathered with Mining') fails.push('AW-60 a level 1 node\'s source sends a hero to its goblins too: ' + whereToGet('copper_ore'));
  if (whereToGet('normal_plank') !== 'Made with Crafting') fails.push('AW-60 a level 1 recipe\'s source reads ' + whereToGet('normal_plank'));
  if (!/^Made with Crafting \d+$/.test(whereToGet('timber_beam'))) fails.push('AW-60 the Timber Beam\'s source reads ' + whereToGet('timber_beam'));
  if (!/Farming \d+\. Dropped by .* at Mill Cellar/.test(whereToGet('wheat'))) fails.push('AW-60 Wheat\'s source reads ' + whereToGet('wheat'));
  /* THE WEIGHHOUSE SAYS WHY, by the server's reason. */
  if (!/starting kit/.test(notListableWords('start_kit')) || !/own use only/.test(notListableWords('no_value')) || !/own use only/.test(notListableWords('no_shop_price'))) fails.push('AW-60 the Weighhouse says ' + notListableWords('start_kit') + ' / ' + notListableWords('no_value'));
  const keptLine = keptWords([{ name: 'Cooked Shrimp', why: 'start_kit' }, { name: 'Chalked Earth Rune', why: 'no_value' }, { name: 'Bronze Arrows', why: 'no_value' }]);
  if (!/^3 stacks here can't be sold to other players\. Cooked Shrimp: starting kit\. Chalked Earth Rune and Bronze Arrows: not bought by the shop/.test(keptLine)) fails.push('AW-60 the Sell tab says ' + keptLine);
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
  if (!unused.includes('Carried: 78 Turnip Juice, put it on the bar') || !unused.includes('Carried: 112 Cooked Wolf Meat, put it on the bar')) fails.push('AW-60 Before you go, own stock unused: ' + unused);
  const named = lines(sess([slot('cooked_shrimp'), slot('turnip_juice')], { turnip_juice: 78, cooked_shrimp: 34 }));
  if (/Carried: /.test(named) || !named.includes('Drink: 78 Turnip Juice')) fails.push('AW-60 Before you go, own juice on the bar: ' + named);
  const noDrink = lines(sess([slot('cooked_shrimp')], { turnip_juice: 78, cooked_shrimp: 34 }));
  if (!noDrink.includes('Drink: no bar slot. Carried: 78 Turnip Juice')) fails.push('AW-60 Before you go, no drink slot: ' + noDrink);
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
  if (how(party(false, false, 'mill_cellar'), 'mill_cellar') !== 'off:Party leader picks the hunt') fails.push('AW-61 a member\'s Hunt again: ' + how(party(false, false, 'mill_cellar'), 'mill_cellar'));
  if (how(party(true, false, 'mill_cellar'), 'mill_cellar') !== 'party') fails.push('AW-61 the leader\'s Hunt again: ' + how(party(true, false, 'mill_cellar'), 'mill_cellar'));
  if (how(party(false, true, 'mill_cellar'), 'mill_cellar') !== 'enter') fails.push('AW-61 a member going back in: ' + how(party(false, true, 'mill_cellar'), 'mill_cellar'));
  if (!/^off:Party hunting elsewhere/.test(how(party(true, true, 'wickstead'), 'mill_cellar'))) fails.push('AW-61 Hunt again elsewhere with the party out: ' + how(party(true, true, 'wickstead'), 'mill_cellar'));
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
  if (toast.length !== 1 || toast[0].text !== 'Whisper from Wrenna' || toast[0].tab !== 'w:x' || toast[0].button !== 'Read it') fails.push('AW-61 a private message toasts ' + JSON.stringify(toast));
  if ((hero.record.residue.alerts || { seen: [] }).seen.some((id) => /^whisper/.test(id))) fails.push('AW-61 a live whisper takes a place in the saved list');
  asks.push({ id: 'y', name: 'Ashgrave', slot: 0 });
  tell(); tell();
  const asked = center.list().filter((a) => a.kind === 'friend');
  if (asked.length !== 1 || asked[0].text !== 'Ashgrave sent a friend request' || !(hero.record.residue.alerts || { seen: [] }).seen.includes('friend:y')) fails.push('AW-61 a friend request toasts ' + JSON.stringify(asked));
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
  if (!/^Party: Mira picks the hunt/.test(enterOffWords({ isLeader: false, leaderName: 'Mira' }))) fails.push('AW-63 a member\'s Enter reads ' + enterOffWords({ isLeader: false, leaderName: 'Mira' }));
  const { overBagWords } = await imp('src/shell/windows/inventory/index.js');
  if (overBagWords(99, 100) !== '' || !/^Bag full/.test(overBagWords(114, 100))) fails.push('AW-63 a bag past its spaces says ' + overBagWords(114, 100));
  /* THE NEWCOMER'S PANEL (2026-11-01). */
  const { coachHtml } = await imp('src/shell/launcher-coach.js');
  const reader = { read: () => null, record: { residue: { coach: { read: [] } } } };
  const aCard = { id: 'x', title: 'A title', text: 'Some words', done: { kind: 'read' }, gotIt: true };
  if (!/hs-pointer is-line/.test(coachHtml(reader, aCard, true)) || !/data-hs-act="coach-more"/.test(coachHtml(reader, aCard, true)) || /is-line|coach-more/.test(coachHtml(reader, aCard, false))) fails.push('AW-62 a card in a window is not one line, or one outside is');
  /* AW-62 A LINE WITH NO ROOM FOR ITS WORDS IS NO LINE (post-140 audit C12: in the Farm window the title, More and Got it took the whole line, the words
     had 0 px and More "opened" a card that only said them, "...empty plotLess"). Measured as the Farm window measured: the card stands whole, More
     goes; a line that shows a readable share keeps More; a line whose words fit has none; and More/Less stands a word apart from the words. */
  {
    const { fitCoachLine } = await imp('src/shell/launcher-coach.js');
    const lineAt = (client, scroll) => {
      const cl = new Set(['hs-pointer', 'is-line']), attrs = {};
      const more = { hidden: true }, words = { clientWidth: client, scrollWidth: scroll };
      const p = { classList: { contains: (c) => cl.has(c), remove: (c) => cl.delete(c) }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
        setAttribute: (k, v) => { attrs[k] = v; }, querySelector: (q) => (q.includes('more') ? more : words) };
      const slot = { querySelector: () => p };
      fitCoachLine(slot);
      fitCoachLine(slot);   // the next paint keeps it
      return { line: cl.has('is-line'), more: !more.hidden };
    };
    const fit = { farm: lineAt(0, 190), cut: lineAt(160, 300), whole: lineAt(190, 190) };
    if (JSON.stringify(fit) !== JSON.stringify({ farm: { line: false, more: false }, cut: { line: true, more: true }, whole: { line: true, more: false } })
      || !/<\/span> <button type="button" class="hs-coach-more"/.test(coachHtml(reader, aCard, true)))
      fails.push('AW-62 a one-line card in a narrow window reads ' + JSON.stringify(fit));
  }
  const { takeWhyOf, suggestedWeight } = await imp('src/shell/windows/tally.js');
  /* What a first Take asks for: the weight worn most, else the role's; neither said, nothing (blind panel 11-03: "no recommendation") */
  const bySuggest = [[{ boots: 'leather_boots' }, 'tank', 'medium'], [{ helmet: 'iron_helm' }, 'mage', 'heavy'], [{}, 'tank', 'heavy'], [{}, 'melee_dps', 'heavy'], [{}, 'ranger', 'medium'], [{}, 'mage', 'light'], [{}, 'healer', 'light']];
  for (const [w, r, want] of bySuggest) if ((suggestedWeight(w, r) || {}).weight !== want) fails.push('AW-62 a first Take for ' + r + ' in ' + JSON.stringify(w) + ' asks for ' + JSON.stringify(suggestedWeight(w, r)));
  if (suggestedWeight({}, null) !== null) fails.push('AW-62 with nothing said a first Take still guesses ' + JSON.stringify(suggestedWeight({}, null)));
  /* the weight that suits is said once, on her pick line (fresh-account play 11-13: it was said over her board and again under it) */
  if (suggestedWeight({}, 'tank').words !== 'Suggested: heavy, for a shield tank' || suggestedWeight({ boots: 'leather_boots' }, 'tank').words !== 'Suggested: medium, worn most'
    || takeWhyOf({ weight: null, held: [], heldMax: 3 }, false, suggestedWeight({}, 'tank')) !== '') fails.push('AW-62 the weight that suits reads ' + JSON.stringify([suggestedWeight({}, 'tank').words, takeWhyOf({ weight: null, held: [], heldMax: 3 }, false, suggestedWeight({}, 'tank'))]));
  if (!/^Pick an armor weight/.test(takeWhyOf({ weight: null, held: [], heldMax: 3 }, false)) || !/^Max tasks: three/.test(takeWhyOf({ weight: 'heavy', held: [1, 2, 3], heldMax: 3 }, false))
    || takeWhyOf({ weight: 'heavy', held: [], heldMax: 3 }, false) !== '' || takeWhyOf({ weight: null, held: [], heldMax: 3 }, true) !== '') fails.push('AW-62 the line over her board is wrong');
  const { buryLabel, buryRecipeOf } = await imp('src/shell/windows/inventory/bury.js');
  const bones = buryRecipeOf('bones');
  const burning = { read: (k) => (k === 'state' ? { active_kind: 'artisan', active_id: bones.recipe.id } : null) };
  if (buryLabel(bones, 59) !== 'Burn all 59' || buryLabel(bones, 59, { read: () => null }) !== 'Burn all 59' || buryLabel(bones, 59, burning) !== 'Fueling…') fails.push('AW-62 the fuel label reads ' + buryLabel(bones, 59, burning));
  const { rareSaleWords } = await imp('src/shell/item-lore.js');
  if (rareSaleWords([{ item: 'rat_tail', qty: 4 }, { item: 'alpha_fang', qty: 3 }]) !== 'This sells rare finds: 3 Alpha Fang.' || rareSaleWords([{ item: 'rat_tail', qty: 4 }]) !== '') fails.push('AW-62 the sale says ' + rareSaleWords([{ item: 'alpha_fang', qty: 3 }]));
  /* (the hero-slot offer left with the purchase, FB-5 2026-11-21: all four slots are free; the line over the roster is tests/client-boot-pure.mjs B-11's) */
  const { jobReplacedWords } = await imp('src/shell/town-work.js');
  const worker = (state, hunt) => ({ read: (k) => (k === 'state' ? state : k === 'hunt' ? hunt : null) });
  const tree = { active_kind: 'gather', active_id: 'normal_tree', active_since: '2026-11-01T00:00:00Z' };
  const wrow = (await imp('src/shell/town-work.js')).workRow;
  const craft = wrow('artisan', Object.keys((await imp('src/shell/town-work.js')).BENCH_INDEX)[0]);
  if (jobReplacedWords(worker(tree, null), craft) !== 'Stopped chopping the Normal Tree') fails.push('AW-62 a craft over chopping says ' + JSON.stringify(jobReplacedWords(worker(tree, null), craft)));
  if (jobReplacedWords(worker(tree, null), wrow('gather', 'normal_tree')) !== '') fails.push('AW-62 pressing the running job says it stopped');
  if (jobReplacedWords(worker({ active_kind: 'idle' }, null), craft) !== '') fails.push('AW-62 an idle hero stopped something');
  const { startWork } = await imp('src/shell/town-work.js');
  const pressed = await startWork(worker(tree, null), craft, (fn, busy, done) => done({ ok: true }), null);
  if (pressed !== 'Stopped chopping the Normal Tree') fails.push('AW-62 the press over chopping answers ' + JSON.stringify(pressed));
  return fails;
}

const MUTANTS = [
  ['item truth: a whetstone is fired from a bow again', 'src/shell/item-lore.js', "if (it.reqSkill === 'melee') return t('item.ammo_whetstone'", "if (it.reqSkill === 'nope') return t('item.ammo_whetstone'"],
  ['item truth: a tool says sell it again', 'src/shell/item-lore.js', "  if (tool) out.push(tool);\n", ''],
  ['item truth: a kit stone says sell it', 'src/shell/item-lore.js', "Number(it.v) > 0 ? t('item.sell_it') : ", "true ? t('item.sell_it') : "],
  ['item truth: a seed says sell it', 'src/shell/item-lore.js', "  if (it.seed) out.push(t('item.plant_it'));\n", ''],
  ['item truth: a bar a hero makes files as junk', 'src/shell/bag-model.js', "if (dropSet().has(id) && !made) return isSpentMaterial(id) || plannedUse(id) ? 'material' : isRareItem(id) ? 'rare' : 'junk';", "if (dropSet().has(id)) return isSpentMaterial(id) || plannedUse(id) ? 'material' : 'junk';"],
  ['item truth: a tool files as a material', 'src/shell/bag-model.js', "const made = it.type !== 'tool' && madeSet().has(id);", 'const made = madeSet().has(id);'],
  /* lane/a-key-never-junk: the Hall Key back under Junk, so Sell all junk sells it */
  ['item truth: a key files as junk again', 'src/shell/bag-model.js', "  if (it.opens) return 'other';\n", ''],
  ['item truth: the shop\'s raw flag files a tool as a material', 'src/shell/bag-model.js', "if (it.type === 'tool') return 'other';", ''],
  ['item truth: Sell all loot ignores the House', 'src/shell/bag-model.js', ' && !(needs && needs.has(r.id))', ''],
  ['item truth: a gated room counts as a next step', 'src/shell/bag-model.js', 'if (r.next && r.opens <= home.tier && r.next.need <= home.tier) step(r.next);', 'if (r.next) step(r.next);'],
  ['item truth: Sell all junk sweeps a Material', 'src/shell/bag-model.js', "return (items || []).filter((r) => kindOf(r.id) === 'junk' && ", "return (items || []).filter((r) => kindOf(r.id) !== 'gear' && "],
  ['item truth: a storage move of the counting tool is silent', 'src/shell/town-work.js', "if (!before || before.id !== id) return '';", "return '';"],
  ['item truth: storing one of two warns', 'src/shell/town-work.js', "  if (left > 0) return '';\n", ''],
  ['item truth: no tool line', 'src/shell/town-work.js', "  const inBag = pick(skill, invOf(cs));\n", "  if (skill) return '';\n  const inBag = pick(skill, invOf(cs));\n"],
  ['item truth: the tool line offers a rod no one can get', 'src/shell/town-work.js', "ITEMS[id].toolSkill === skill && whereToGet(id));", "ITEMS[id].toolSkill === skill);"],
  ['item truth: an axe in Storage goes unsaid', 'src/shell/town-work.js', "  if (better) return better;\n", ''],
  ['item truth: a recipe\'s shortage names no source', 'src/shell/town-work.js', "(where ? ' ' + where + '.' : '')", "''"],
  ['item truth: an easy source lists the drop too', 'src/shell/item-lore.js', 'const drop = !easy && r.drops.length ?', 'const drop = r.drops.length ?'],
  ['item truth: a hard source hides the drop', 'src/shell/item-lore.js', 'const drop = !easy && r.drops.length ?', 'const drop = false ?'],
  ['item truth: no-book-value says nothing', 'src/shell/item-lore.js', "if (!(Number(it.v) > 0) || it.bop) return t('item.own_use')", "if (false) return t('item.own_use')"],
  ['item truth: a kit item says the Weighhouse lists it', 'src/shell/item-lore.js', "return isStartKit(id) ? t('item.kit_unlisted')", "return false ? t('item.kit_unlisted')"],
  ['item truth: the Weighhouse has one vague reason', 'src/shell/market-words.js', "(Object.prototype.hasOwnProperty.call(WHY_NOT, why) ? ': ' + WHY_NOT[why] + '.' : '.')", "'.'"],
  /* post-140 audit C12: a one-line card with no room for its words stands whole; More/Less a word apart */
  ['item truth: panel: a line with no room for its words stays a line (post-140 C12)', 'src/shell/launcher-coach.js', "  if (p.classList.contains('is-line') && words.clientWidth < Math.min(words.scrollWidth, LINE_WORDS_MIN_PX)) {", '  if (false) {'],
  ['item truth: panel: a card stood whole goes back to a line on the next paint (post-140 C12)', 'src/shell/launcher-coach.js', "  if (p.getAttribute('data-fit') === 'whole') { if (!more.hidden) more.hidden = true; return; }\n", ''],
  ['item truth: panel: More runs into the words (post-140 C12)', 'src/shell/launcher-coach.js', "    + (line ? ' <button type=\"button\" class=\"hs-coach-more\"", "    + (line ? '<button type=\"button\" class=\"hs-coach-more\""],
  ['item truth: panel: the line over her board goes', 'src/shell/windows/tally.js', "  return !tally.weight ? (suggest ? '' : t('tally.no_weight')) : tally.held.length >= tally.heldMax ? t('tally.board_full', { n: countWord(tally.heldMax) }) : '';", "  return '';"],
  ['item truth: panel: Burn all keeps its old number', 'src/shell/windows/inventory/bury.js', "  if (cs && buryingOf(cs) === e) return e.skill === 'cooking' ? 'Cooking…' : 'Fueling…';\n", ''],
  ['item truth: panel: the sale hides its rares', 'src/shell/item-lore.js', "rare.length ? t('item.sells_rares', { items: listWords(rare) }) : ''", "''"],
  ['item truth: panel: the press drops the replaced job\'s line', 'src/shell/town-work.js', "return [replaced, words].filter(Boolean).join(' ');", "return words || '';"],
  ['item truth: panel: a replaced job says nothing', 'src/shell/town-work.js', "  return what ? 'Stopped ' + what : '';", "  return '';"],
  ['item truth: panel: pressing the running job says it stopped', 'src/shell/town-work.js', "if (!now || now.id === w.id || !townWorkRunning(", "if (!now || !townWorkRunning("],
  ['item truth: panel: a coach card takes the window', 'src/shell/launcher-coach.js', "(line ? ' is-line' : '')", "''"],
  ['item truth: panel: a full bag says nothing', 'src/shell/windows/inventory/index.js', "  return used >= cap ? 'Bag full", "  return false ? 'Bag full"],
  ['item truth: panel: a request already answered still toasts (AW-61)', 'src/shell/social-watch.js', "(a.kind === 'friend' && !asked.has(a.id)) || ", ''],
  ['item truth: panel: a message already read still toasts (AW-61)', 'src/shell/social-watch.js', " || (a.kind === 'whisper' && !unread.has(a.peer))", ''],
  ['item truth: Before you go hides the spare juice', 'src/shell/hunt-go.js', "const spare = usable && HEADS_UP_KINDS.has(kind) ? spareWords(kind, carried, barNames(s)) : '';", "const spare = '';"],
  ['item truth: Before you go nags about what is on the bar', 'src/shell/hunt-go.js', "const barNames = (s) => new Set(s.slots.filter((sl) => !sl.empty && sl.enabled !== false && sl.action.type === 'consume').map((sl) => sl.action.id));", 'const barNames = () => new Set();'],
  ['item truth: no drink slot, no word', 'src/shell/hunt-go.js', "if (spare) out.push({ id: kind, text: KIND_WORDS[kind] + ': no bar slot. '", "if (false) out.push({ id: kind, text: KIND_WORDS[kind] + ': no bar slot. '"],
  ['item truth: panel: own stock goes behind the store again', 'src/shell/bar-assign.js', 'const store = named ? -1 : storeSlotFor(wire, id);', 'const store = -1;'],
  ['item truth: panel: own stock keeps its own lower condition', 'src/shell/bar-assign.js', 'conditions: conditions.map((c) => Object.assign({}, c)), join };', 'conditions: startConditions(action), join };'],
  ['item truth: panel: a named slot is overridden', 'src/shell/bar-assign.js', 'const store = named ? -1 : storeSlotFor(wire, id);', 'const store = storeSlotFor(wire, id);'],
  ['item truth: panel: a member starts a hunt', 'src/hunt-view/summary-model.js', "return party.isLeader ? { how: 'party', why: '' } : { how: null, why: t('summary.again_leader') };", "return party.isLeader ? { how: 'party', why: '' } : { how: 'enter', why: '' };"],
  ['item truth: panel: a member cannot go back in', 'src/hunt-view/summary-model.js', "return party.hunt === hunt ? { how: 'enter', why: '' } :", "return false ? { how: 'enter', why: '' } :"],
  ['item truth: panel: the leader enters alone', 'src/hunt-view/summary-model.js', "return party.isLeader ? { how: 'party', why: '' } :", "return party.isLeader ? { how: 'enter', why: '' } :"],
  ['item truth: panel: a finished job reads working', 'src/session/account-session.js', "return a.kind === 'busy' && !benchJobOver(read, Date.parse(body.now)) ? a.text : null;", "return a.kind === 'busy' ? a.text : null;"],
  ['item truth: panel: gathering reads as a finished job', 'src/session/bench-sections.js', "st.active_kind === 'artisan' && Object.prototype", "Object.prototype"],
  ['item truth: panel: a whisper toasts for every line', 'src/shell/social-watch.js', "if (last && !up.some((a) => a.kind === 'whisper' && a.peer === c.id)) {", 'if (last) {'],
  ['item truth: panel: a whisper with no news toasts', 'src/shell/social-watch.js', 'const last = c.unread > 0 ?', 'const last = true ?'],
  ['item truth: panel: a friend request stays silent', 'src/shell/social-watch.js', "alerts.say(cs, { id: 'friend:' + p.id,", "if (0) alerts.say(cs, { id: 'friend:' + p.id,"],
  ['item truth: panel: a live whisper fills the saved list', 'src/shell/alerts.js', 'if (!c.transient) {', 'if (true) {'],
  ['item truth: the rune says Next at level 12: Blank Rune', 'src/data/skill-unlocks.js', 'r.output && r.req <= firstAt(skill, r.output) ? nameOf(r.output) : r.name', 'r.output ? nameOf(r.output) : r.name'],
  ['plans: AW-21 Equip upgrades puts a shield on', 'src/core/upgrade-pick.js', "const STYLE_SLOTS = new Set(['shield', 'ammo']);", "const STYLE_SLOTS = new Set(['ammo']);"],
  ['plans: AW-21 a hero with no weight stays bare (played 2026-11-04)', 'src/core/upgrade-pick.js', "return chosen || wornWeightOf(equipment || {}) || WEIGHT_FOR_ROLE[role] || null;", "return chosen || null;"],
  /* THE WEIGHT RULE (designer ruling 2b of 2026-11-18, undoing the 139 audit's B6): (1) a bare armor slot takes any weight that beats bare, and with
     no piece of the hero's weight in a tie the one that guards most; (2) a worn piece off the weight chosen at Tamsin's moves to it, never to a lower tier */
  ['plans: AW-21 a bare armor slot waits for the hero\'s weight (B6 back, ruling 2b)', 'src/core/upgrade-pick.js', "    if (!weightFits(curIt, it, o.chosen)) continue;\n", "    if (!weightFits(curIt, it, o.chosen) || (!curIt && o.prefer && ARMOUR_SLOTS.includes(slot) && weightOf(it) !== o.prefer)) continue;\n"],
  ['plans: AW-21 a bare slot waits for a weight the bag doesn\'t hold', 'src/core/upgrade-pick.js', "else if (!curIt && ARMOUR_SLOTS.includes(slot)) front = [front.reduce(", "else if (false) front = [front.reduce("],
  ['plans: AW-21 a worn piece off the chosen weight never moves (ruling 2b)', 'src/core/upgrade-pick.js', "  if (offWeight(cur, chosen)) return weightOf(it) === chosen && notLower(it, cur);\n", ''],
  ['plans: AW-21 a worn piece off the chosen weight moves to a lower tier (ruling 2b)', 'src/core/upgrade-pick.js', " && notLower(it, cur);\n", ";\n"],
  ['plans: AW-21 a move to the chosen weight hides what it gives up (ruling 2b)', 'src/shell/upgrade-plan.js', '.concat((p.costs || []).slice(0, gains))', ''],
  ['plans: AW-21 the window never reads the role', 'src/shell/widgets/upgrade-line.js', "prefer: preferredWeight(t ? t.weight : null, eq, s ? s.role : null) });", "prefer: t ? t.weight : null });"],
  ['plans: Equip upgrades lets a set bonus hold a hero below the next tier', 'src/core/upgrade-pick.js', '  const set = !fits.some((id) => tierStep(ITEMS[id], curIt));', '  const set = true;'],
  ['plans: AW-21 a piece\'s resistance is not on its card (lane/c-krell-uniques)', 'src/shell/bag-model.js', "    if (v > 0) out.push({ key: 'resistPm.' + k, label: resistLabel(k), value: v, text: '−' + cutWords(v) });\n", ''],
  ['plans: AW-21 the card reads a resistance as a tenth of itself', 'src/shell/bag-model.js', "    if (v > 0) out.push({ key: 'resistPm.' + k, label: resistLabel(k), value: v, text: '−' + cutWords(v) });", "    if (v > 0) out.push({ key: 'resistPm.' + k, label: resistLabel(k), value: v, text: '−' + cutWords(v / 10) });"],
  ['plans: AW-21 the comparison never names a resistance', 'src/shell/bag-model.js', "    if (d) out.push({ label: resistLabel(k), delta: d, text: (d > 0 ? '−' : '+') + cutWords(d) });\n", ''],
  ['plans: AW-21 the card calls every resistance by one name', 'src/shell/bag-model.js', "const resistLabel = (k) => t('item.resist_taken', { element: t('monster.el_' + k) });", "const resistLabel = (k) => t('item.resist_taken', { element: t('monster.el_ember') });"],
  /* A PIECE'S BANE ON ITS CARD AND COMPARE; THE CARD'S LINE ON THE HERO'S GROUND (lane/a-compare-lines, lane/a-honest-lines; re-landed by lane/a-honesty-rescue) */
  ['plans: AW-21 the card drops a piece\'s bane', 'src/shell/bag-model.js', "    if (v > 1e-9) out.push({ key: 'bane.' + c, label: baneLabel(c), value: v, text: '+' + pctWords(v) });\n", ''],
  ['plans: AW-21 the compare drops a piece\'s bane', 'src/shell/bag-model.js', "    if (Math.abs(d) > 1e-9) out.push({ label: baneLabel(c), delta: d, text: (d > 0 ? '+' : '−') + pctWords(Math.abs(d)) });\n", ''],
  ['plans: AW-21 an item card says nothing of what it does on the hero\'s ground', 'src/shell/item-lore.js', '  return lines.length ? { ground: (HUNT_INDEX[g.hunt]', '  return lines.length && false ? { ground: (HUNT_INDEX[g.hunt]'],
  ['plans: AW-21 an item card\'s ground line skips the resistance', 'src/shell/item-lore.js', '    if (hit.length && pm > 0) lines.push(', '    if (false) lines.push('],
  ['plans: AW-21 an item card\'s ground line names monsters that are not of the bane\'s kind', 'src/shell/item-lore.js', '  for (const m of ms) { const k = baneMultFor(classOfMonster(MONSTERS[m]), ix);', '  for (const m of ms) { const k = Math.max(...Object.values(ix || { x: 1 }));'],
  ['plans: AW-21 a hall boss\'s piece comes from nowhere a player can reach', 'src/shell/hunt-ground-facts.js', "    if (boss && ((MONSTERS[boss] || {}).drops || []).some((d) => d && d.id === item)) standing.push({ g, names: [MONSTERS[boss].name] });\n", ''],
  ['plans: AW-21 a hall piece\'s link opens a hunt page that does not exist', 'src/shell/hunt-ground-facts.js', "  return standing.length ? { kind: 'hunt', hunt: pageOf(standing[0].g) }", "  return standing.length ? { kind: 'hunt', hunt: standing[0].g.hunt }"],
  ['plans: AW-21 a bane is a reason to skip the blade again', 'src/core/upgrade-pick.js', "it.effects.some((e) => e !== 'bane')", 'it.effects.length'],
  ['plans: AW-21 a worn bane is traded for plain numbers', 'src/core/upgrade-pick.js', '  if (traits) for (const c of MONSTER_CLASSES) { const side = baneSide(a, b, c); if (side < 0) return false; if (side > 0) more = true; }\n', ''],
  ['plans: AW-21 a resistance is no number (lane/a-next-steps)', 'src/core/upgrade-pick.js', '  if (traits) for (const k of resistsIn(a, b)) { if (resistOf(a, k) < resistOf(b, k)) return false; if (resistOf(a, k) > resistOf(b, k)) more = true; }\n', ''],
  ['plans: AW-21 a resistance counts with nothing in range dealing it', 'src/core/upgrade-pick.js', '(k in a.resist || k in b.resist) && a.threats.has(k)', '(k in a.resist || k in b.resist)'],
  ['plans: AW-21 a worn resistance is lost in silence', 'src/core/upgrade-pick.js', "const lost = [...(slot === 'weapon' ? banesLost(now, after) : []), ...resistsLost(now, after)];", "const lost = slot === 'weapon' ? banesLost(now, after) : [];"],
  ['plans: AW-21 a spell\'s element is no threat', 'src/core/upgrade-pick.js', 'if (r && !mends(r)) out.add(r.element || PHYSICAL);', 'if (r && !mends(r)) out.add(PHYSICAL);'],
  ['plans: AW-21 a bane is a reason with no such monster in range (F15)', 'src/core/upgrade-pick.js', 'OPEN_HUNTS.filter((h) => Array.isArray(h.band) && !(level < h.band[0] || level > h.band[1]))', 'OPEN_HUNTS.filter((h) => Array.isArray(h.band))'],
  ['plans: AW-21 a worn off-hand stays for a better one of its kind (F8)', 'src/core/upgrade-pick.js', '    for (const slot of UPGRADE_SLOTS.concat(OFFHAND)) {', '    for (const slot of UPGRADE_SLOTS) {'],
  ['plans: AW-21 a worn bane keeps the blade in silence (designer small call 2, 2026-11-11)', 'src/core/upgrade-pick.js', '  if (!front.length) return tradeOf(slot, cur, now, fits, worn, o, set);', '  if (!front.length) return null;'],
  ['plans: AW-25 the death line ignores the Blessings', 'src/shell/hunt-list.js', '  const cut = Number.isInteger(cutPermille) && cutPermille > 0 ?', '  const cut = false ?'],
  ['plans: AW-32 a plan that ran reads nothing set', 'src/shell/loot-dispatch.js', "Object.values(rules.loot).some((v) => MOVES.has(v)) ? t('shop.dispatch_all_moved')", "false ? t('shop.dispatch_all_moved')"],
  ['plans: AW-27 a shared cooldown reads as never firing', 'src/data/text/bar.js', "  shared_cooldown: 'Waits for {action} in slot {slot} when both are ready',", "  shared_cooldown: 'Shares a cooldown with {action} in slot {slot}',"],
  ['plans: Equip upgrades sees no worth in a ring\'s perks', 'src/core/upgrade-pick.js', '  for (const p of perksIn(a, b)) { if (perkOf(a, p) < perkOf(b, p)) return false; if (perkOf(a, p) > perkOf(b, p)) more = true; }\n', ''],
  ['plans: Before you go names a struck spell without its fix', 'src/shell/hunt-go.js', "(fixes.length ? ', pick '", "(fixes.length > 9 ? ', pick '"],
  ['plans: AW-27 store food too weak for the ground goes unsaid', 'src/shell/hunt-go.js', '    const weak = weakFoodLine(s, o && o.hunt, v.level, v.hpMax);\n    if (weak) out.push(weak);\n', ''],
  ['plans: AW-27 a store food just under the floor reads as enough', 'src/shell/weak-food.js', 'if (food === null || heal === null || heal >= want) return null;', 'if (food === null || heal === null || heal * 2 >= want) return null;'],
  ['plans: AW-27 a floor speaks under its band (139 audit B2)', 'src/shell/weak-food.js', 'return !Number.isInteger(level) || !Array.isArray(band) || level >= band[0];', 'return true;'],
  /* post-140 audit C5: Hunt prep's checklist says the weak food the ground's page says; C7: at the yard every town control says the training */
  ['plans: AW-27 Hunt prep\'s checklist reads ready over a weak store food (post-140 C5)', 'src/shell/readiness.js', "    if (weak) { checks.push({ id: weak.id, ok: false, text: weak.text }); short.push(t('prep.ready_short_food_weak')); }\n", ''],
  ['plans: AW-27 Hunt prep judges the bar with no Level (post-140 C5)', 'src/shell/readiness.js', 'const weak = weakFoodLine(s, ground || null, v.level, v.hpMax);', 'const weak = weakFoodLine(s, ground || null, null, v.hpMax);'],
  ['plans: AW-32 the yard reads as a hunt (post-140 C7)', 'src/shell/training-words.js', '  return h && !h.ended && trainedBy(h.huntId) ? t(key) : huntWords;', '  return huntWords;'],
  ['plans: AW-32 the yard reads as a hunt to the gear (post-140 C7)', 'src/shell/gear-gate.js', "  return which === 'upgrades' ? busyWords(cs, GEAR_HUNT_WORDS.upgrades, 'training.busy_upgrades') : busyWords(cs, GEAR_HUNT_WORDS.one, 'training.busy_gear');", "  return which === 'upgrades' ? GEAR_HUNT_WORDS.upgrades : GEAR_HUNT_WORDS.one;"],
  ['plans: AW-32 Dispatch loot at the yard says in town (post-140 C7)', 'src/shell/loot-dispatch.js', "  if (h && !h.ended) return busyWords(cs, 'Dispatch loot works in town');", "  if (h && !h.ended) return 'Dispatch loot works in town';"],
  ['plans: AW-32 Storage at the yard says in town (post-140 C7)', 'src/shell/storage-model.js', "  return busyWords(cs, t('bag.storage_away'), 'training.busy_storage');", "  return t('bag.storage_away');"],
  ['plans: AW-104 the doll\'s weapon list sums every style (post-140 C6)', 'src/shell/bag-model.js', "  if (slot !== 'weapon') return fits.slice().sort((a, b) => sum(b) - sum(a));", "  if (true) return fits.slice().sort((a, b) => sum(b) - sum(a));"],
  ['plans: AW-32 the chest at the yard says hunting (post-140 C7)', 'src/shell/windows/tower-chest.js', "  if (h && !h.ended) return busyWords(cs, t('tower.off_hunting'));", "  if (h && !h.ended) return t('tower.off_hunting');"],
  ['plans: AW-27 the weak food line names no slot', 'src/shell/weak-food.js', "return t('prep.food_weak' + hp, Object.assign(vars, { where }));", "return t('prep.food_weak' + hp, Object.assign(vars, { where: '' }));"],
  ['plans: AW-27 a heal read from the client copy when the server sent none', 'src/shell/weak-food.js', 'return r && Number.isInteger(r.amount) ? r.amount : null;', "return r && Number.isInteger(r.amount) ? r.amount : ((CONSUMABLES[id] || {}).amount || null);"],
  ['plans: AW-27 Krell\'s Hold names no store food floor (audit A25)', 'src/data/grounds/krells_hold/pack.js', "bagGuide: { tier: 4, storeFloor: 'salted_trout', storeFloorFrom: { 88: 'salted_shrimp' },", 'bagGuide: { tier: 4,'],
  ['plans: AW-27 a club hero is warned about another weapon', 'src/shell/hunt-go.js', 'if (moveOffWeapon(s.discipline, a.id)) return null;', ''],
  ['plans: AW-27 three spells read as a fallback ("then")', 'src/shell/hunt-go.js', "+ ' gp a cast)').join('. ');", "+ ' gp a cast)').join(', then ');"],
  ['plans: AW-27 each store rune is said on its own', 'src/shell/hunt-go.js', "    if (same) same.names.push(p.store.name);\n    else spends.push(", "    spends.push("],
  ['plans: AW-27 a family\'s store rune said twice behind its own runes', 'src/shell/hunt-go.js', "    if (said.has(p.store.name)) continue;\n", ''],
  ['plans: AW-27 a weapon swap leaves its moves struck on the bar', 'src/shell/bar-assign.js', '  const off = (w) => moveOffWeapon(set.discipline, w.action.id);', '  const off = (w) => false;'],
  ['plans: AW-27 a weapon swap takes the other weapon moves off the bar (report #79)', 'src/shell/bar-assign.js', '  const order = moves.filter((w) => !off(w)).concat(moves.filter(off));', '  const order = moves.filter((w) => !off(w)).concat(moves.filter(off).map(() => null));'],
  ['plans: Hunt prep calls an empty food slot short', 'src/shell/hunt-go.js', "(spare ? '. ' + spare : ''), short: false });", "(spare ? '. ' + spare : ''), short: !usable });"],
  ['plans: AW-64 Hunt prep reads the bag in a hunt', 'src/shell/readiness.js', '  const carried = carriedOf(cs);', "  const inv = cs.read('inventory');\n  const carried = inv ? Object.entries(inv).map(([id, qty]) => ({ id, qty })) : null;"],
  ['plans: AW-64 a free arrow is said with the store behind it', 'src/shell/hunt-go.js', '    if (free && !o.ruled) { endless = true; break; }\n', ''],
  ['plans: AW-64 arrows are said in the bar\'s order, not the engine\'s', 'src/shell/hunt-go.js', 'of attackOrder(rows.concat([DEFAULT_ATTACK_ROW])))', 'of rows.concat([DEFAULT_ATTACK_ROW]))'],
  /* AW-65 carry in (Tyler 2026-11-02): what may be offered, when, how many, and the struck slot's words. */
  ['plans: AW-65 a carry offers gear and loot', 'src/shell/carry-in.js', '  return bag.filter((r) => SUPPLIES[r.id] && r.qty > 0)', '  return bag.filter((r) => r.qty > 0)'],
  ['plans: AW-65 a hunt on its way home still offers a carry', 'src/shell/carry-in.js', '!s.ended_at && !s.leave_at && !s.change_at', '!s.ended_at'],
  ['plans: AW-65 one carry offers past the server\'s per-call max', 'src/shell/carry-in.js', 'max: Math.min(r.qty, CARRY_MAX)', 'max: r.qty'],
  ['plans: AW-65 a rune spell offers no rune of its family', 'src/shell/carry-in.js', '  return !!sup && sup.own.includes(id);', '  return false;'],
  ['plans: AW-65 the loaded shot offers nothing of the worn ammo', 'src/shell/carry-in.js', "return (a.id === 'loaded' ? worn : a.id) === id;", 'return a.id === id;'],
  ['plans: AW-65 a struck slot never says its stock waits in the bag', 'src/shell/action-facts.js', '  const inPack = (id) => ((pack || []).find((r) => r.id === id) || {}).have || 0;', '  const inPack = () => 0;'],
  ['plans: AW-65 a shot waiting for its level is carried in with no word of the wait', 'src/shell/carry-in.js', '  return need ? need.text : null;', '  return null;'],
  ['plans: AW-65 a waiting shot offers the carry as what makes it fire', 'src/shell/action-facts.js', "  const shot = shotProblem(a, set && set.role, skills);", "  const shot = (pack || []).some((r) => r.id === a.id) ? '' : shotProblem(a, set && set.role, skills);"],
  ['plans: AW-65 a spell whose runes are above the level says only that the server refused', 'src/shell/action-facts.js', "    if (sl.usable === false && sl.why === 'rune_level') {", '    if (false) {'],
  ['plans: AW-65 a store rune above the level says only that the server refused', 'src/shell/action-facts.js', "    if (sl.usable === false && sl.why === 'store_level') {", '    if (false) {'],
  ['plans: AW-27 a store rune above the level is promised as what casts', 'src/shell/hunt-go.js', "  const off = sl.why === 'store_off' || sl.why === 'store_level';", "  const off = sl.why === 'store_off';"],
  ['plans: AW-64 a worn slot with none left is not said', 'src/shell/hunt-go.js', 'const parts = (dry ? [dry] : [])', 'const parts = []'],
  ['plans: AW-64 a stack no shot reaches is not said', 'src/shell/hunt-go.js', "(spare ? ', ' + whole(spare.qty) + ' ' + itemNameFor(spare.id, spare.qty) + ' not on the bar' : '')", "''"],
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
  ['plans: AW-70 a sale past the engine\'s line cap', 'src/shell/bag-model.js', '    if (lines.length >= SELL_LINES_MAX) { more++; continue; }\n', ''],
  ['plans: AW-21 a better weapon stays in the bag', 'src/core/upgrade-pick.js', "const STYLE_SLOTS = new Set(['shield', 'ammo']);", "const STYLE_SLOTS = new Set(['weapon', 'shield', 'ammo']);"],
  ['plans: AW-21 Equip upgrades changes the style', 'src/core/upgrade-pick.js', "    if (slot === 'weapon' && !sameHands(id, cur, worn)) continue;\n", ''],
  ['plans: AW-21 a bow turns into a crossbow', 'src/core/upgrade-pick.js', ' && !!ITEMS[id].twoHanded === !!ITEMS[cur].twoHanded', ''],
  ['plans: AW-64 a slot switched Off is said as spending', 'src/shell/hunt-go.js', 'if (!sl || sl.empty || sl.enabled === false) return null;', 'if (!sl || sl.empty) return null;'],
  ['plans: Hunt prep says stamina with no amount', 'src/shell/readiness.js', "t('prep.ready_stamina', { left: hoursWords(st.msLeft) })", "'Stamina left'"],
  ['plans: Hunt prep calls the last hunt this hunt', 'src/shell/readiness.js', "t(h && !h.ended ? 'prep.gold_spend_now' : 'prep.gold_spend_last', vars)", "t('prep.gold_spend_now', vars)"],
  /* the plan forgets the weight where it reads it: the tie line (live again since ruling 2b lets a bare slot's front hold every weight) and the move */
  ['plans: Equip upgrades forgets the weight chosen at Tamsin\'s', 'src/core/upgrade-pick.js', '    chosen, prefer: chosen || (o && PREFER.has(o.prefer) ? o.prefer : null) };', '    chosen: null, prefer: null };'],
  ['plans: a Sell plan for a stack not held reads unsellable', 'src/shell/loot-dispatch.js', "if (plan === 'sell' && held && bids && !bids.has(id))", "if (plan === 'sell' && bids && !bids.has(id))"],
  ['plans: how long a hero lasts is said only when it is short', 'src/shell/hunt-go.js', '  else if (st) {', '  else if (st && st.msLeft < STAMINA_SAY_MS) {'],
  ['plans: no weapon is not said', 'src/shell/hunt-go.js', '    if (worn && !worn.weapon) out.push(', '    if (false) out.push('],
  ['plans: a held task that does not count here is not said', 'src/shell/hunt-go.js', '  if (tally) out.push(tally);', '  void tally;'],
  ['edgeBody lets an unlisted field through', 'src/session/edge-intents.js', '  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;\n', ''],
];

const COMPANION = {};

const GUARD = 'tests/alpha-windows-pure.mjs';
/* A mutant whose name starts so is judged by that pure rule function on a planted copy of src (tickerMutant), never the page. */
const JUDGES = {
  edgeBody: (over, file) => pureMutant(over[file]),
  'plans:': (over) => tickerMutant(over, planRules),
  'item truth:': (over) => tickerMutant(over, itemTruthRules),
};

async function main() {
  const g = { guard: GUARD, green: 'the pure rules hold (AW-0 the intents and the receipt, AW-19 .. AW-22 pure, the plans, item truth, the panel’s leftovers)', pure: pure, checks: null, mutants: MUTANTS, companion: COMPANION, judges: JUDGES };
  if (process.argv.includes('--shard-plan')) return shardPlan(g);
  if (process.argv.includes('--mutate')) return mutate(g);
  return plain(g);
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

main().then((code) => process.exit(code));
