#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/craft-wages.mjs — WHAT A HERO'S TIME PAYS AT THE SHOP, PER SKILL ROW (designer 2026-11-01, lane/c-craft-economy).
//
// The bug class: the shop paid more for a hero's hour at a bench than the game pays for an hour of anything else. A blind panel made
// 97,937 g from crafting against 15,200 g from hunting in 27 hours; measured on the real settle and sale, an Iron Bar made by one hero
// from the rock paid 27,000 g/h at Smithing 15 against about 3,000 g/h hunting at the same hours played, and a forged piece sold below its
// own metal. Hunting drives most income (balance ruling 10-25 §1); every skill still pays, and each step down the chain pays more.
//
// AFTER TAX (Tyler 2026-11-01): W-STEP and W-FORGE are floors and read the wage at a PUBLIC bench, after its fee, because that is the
// hero they must still pay. W-RAW and W-CHAIN are ceilings and read the wage with no fee, because that is the hero with a house, the
// most the row pays anyone. A change to a bid, a permille or the cheap goods line moves these numbers by itself.
//
// Chain rate: one hero doing every step, no tool, the row's own paced times (the rates tools/qa/craft-economy.mjs plays on the real
// settle). Stock made from monster drops is bounded by the hunt, so a row with a hunted input is out of the wage (W-CHAIN).
//
//   W-RAW     gathered and sold raw, a node to its skill level pays no more than RAW_CAP
//   W-CHAIN   gather and bench, a row with no hunted input pays no more than CHAIN_CAP, and CHAIN_CAP stays under hunting
//   W-STEP    refining pays more than selling the raw stack: bar, plank, cooked fish
//   W-FORGE   a forged or sewn piece a player can wear sells above the shop's bid for what went in (TIER_3_USE excepted), and forging
//             pays more than selling its bars
//   W-ROOM    a cooked fish's bid sits under the store's price for the same heal, so a cook can undercut the store on the Weighhouse
//   W-USE     Bronze Arrows, Coarse Whetstones and Chalked Runes stay priced at nothing: made for your own use
//   W-TAX     the public bench's fee (src/data/bench-tax.js): no craft charges more than its output sells for, and a row the cheap goods
//             line leaves free never out-earns the taxed rows it stands beside, so the line cannot become the way to work
//   W-COAL    coal has a better rung by the Smithing level of its first sink (Andy 2026-11-05: "a real slog and bottleneck"); its rungs climb in pieces an hour, and the
//             Coal Seam's XP an hour sits between the rocks around it, so mining it costs a smith no Mining
//   W-BENCH   a house bench is a long goal (Tyler 2026-11-01): each bench room's first rung costs at least a week's money, rungs climb,
//             and the shop row and the ladder agree
//   W-RUNE    the rune ladder (Tyler 2026-11-05): a job's runes sell to the shop for less than the book value of the blanks that went in, so a rune is
//             no faucet (the hero's hour is W-CHAIN's, and a blank's bulk bid is W-STEP's: making anything pays more than selling the raw stack);
//             and every deeper rune has a store row and bids under its price, so a crafter can list under the store
//
//   node tests/craft-wages.mjs            the shipped data
//   node tests/craft-wages.mjs --mutate   each arm driven red by a planted defect on the live objects
//
// Exit: 0 green · 1 a finding or a mutant escaped · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { isMain as isEntryModule } from './_is-main.mjs';
import { ITEMS } from '../src/data/items.js';
import { TREES, ROCKS, FISH_SPOTS } from '../src/data/gathering.js';
import { ARTISAN_RECIPES, recipeCategory } from '../src/data/recipes.js';
import { BASIC_SUPPLIES } from '../src/data/supply-basics.js';
import { ROOM_RUNGS } from '../src/data/homestead-tiers.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { recipeInputs } from '../src/core/artisan.js';
import { pacedActionMs, pacedXp } from '../src/core/pacing.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';
import { BENCH_TAX, BENCH_TAX_FREE_UNDER_MG } from '../src/data/bench-tax.js';
import { feeMgOf } from '../src/core/bench-tax.js';
import { isRune, runeTierOf } from '../src/data/runes.js';

/* Every row: a resting hero gathers for free, so a second hero reaches Mining 60 in 29 h and 75 in 114 h of that one job (played: tools/qa/craft-economy.mjs --careers), inside one beta. */
const MAX_REQ = 99;
/* In-band hunting at the hours a skill's level takes to reach, g/h per hero: the 2026-10-31 verdict (1,146 cells on the real settle),
   re-measured on this commit (the priority board's 2026-11-01 section). A wage is judged against these, never against a feel. */
const HUNTING = [[1, 2000], [15, 2900], [30, 3800], [45, 4200], [60, 5500], [75, 7000]];
/* A gatherer gets there first: a node's level takes about 1 / 3 / 10 / 33 hours of that one job (played), so raw is judged against the
   grounds of those hours, a bench row against the later hours of both skills. */
const HUNTING_FOR_RAW = [[1, 2000], [15, 2600], [30, 2600], [45, 3500], [60, 4900], [75, 6000]];
const at = (table, req) => table.filter(([l]) => l <= req).pop()[1];
const huntingAt = (req) => at(HUNTING, req);
const RAW_CAP = (req) => Math.round(at(HUNTING_FOR_RAW, req) * 0.6);
const CHAIN_CAP = (req) => Math.round(huntingAt(req) * 0.9);
/* Tier 3 sells at 0.14 of book by the 10-23 ruling, one price per item however it came: these are made to be carried. */
const TIER_3_USE = Object.freeze({ forge_coppercap_shield: 'the Warrens-tier shield', reforge_steelgrate: 'a Rare Kingsgrate reforged' });
const SELF_USE = Object.freeze(['bronze_arrows', 'coarse_whetstone', 'chalked_earth_rune', 'chalked_water_rune', 'chalked_fire_rune',
  'chalked_ice_rune', 'chalked_poison_rune', 'chalked_rupture_rune']);

const bid = (id) => vendorPriceOf(ITEMS, id);
/* The rows this guard judges, as a mutable copy so --mutate can plant a rate on it (the data rows are frozen). */
const TAX = { permille: { ...BENCH_TAX }, freeUnderMg: BENCH_TAX_FREE_UNDER_MG };
/* One job's fee at a public bench, in gold (exact, the carry makes it so). 0: no fee. */
const feeG = (r) => feeMgOf(TAX.permille[r.skill] || 0, bid(r.output), r.outputQty || 1, TAX.freeUnderMg) / 1000;
/* The rooms that free their skill from the public bench's tax, and the least their first rung may cost: about 17 h of hunting at the
   10-31 pace for the Kitchen, 31 h for the Forge and the Workshop (the priority board's 2026-11-01 bench table). */
const BENCH_ROOMS = Object.freeze({ kitchen: 40000, forge: 75000, workshop: 75000, library: 60000 });

/* The first node a gathered item comes from: the row a player meets it on. */
function gatherIndex() {
  const out = {};
  for (const list of [TREES, ROCKS, FISH_SPOTS]) for (const n of list) {
    const each = (Number(n.qty?.[0] ?? 1) + Number(n.qty?.[1] ?? 1)) / 2;
    if (!out[n.prod]) out[n.prod] = { sec: pacedActionMs(n.ms) / 1000 / each, req: n.req, id: n.id };
  }
  return out;
}
/* The cheapest-level recipe that makes an item (no gated rows: a recipe scroll is not a wage). */
function benchIndex() {
  const out = {};
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list) {
    if (!r.output || r.gated) continue;
    if (!out[r.output] || out[r.output].req > r.req) out[r.output] = { ...r, skill };
  }
  return out;
}
/* Seconds of one hero's time for ONE of `item`, and whether a monster's drop is anywhere in it. */
function chainOf(item, G, B, seen = new Set()) {
  if (G[item]) return { sec: G[item].sec, hunted: false, fee: 0 };
  const r = B[item];
  if (!r || seen.has(item)) return { sec: 0, hunted: true, fee: 0 };
  seen.add(item);
  let sec = pacedActionMs(r.ms) / 1000, hunted = false, fee = feeG(r);
  for (const [id, n] of Object.entries(recipeInputs(r))) {
    const c = chainOf(id, G, B, new Set(seen));
    sec += n * c.sec;
    fee += n * c.fee;
    hunted = hunted || c.hunted;
  }
  const out = Number(r.outputQty) || 1;
  return { sec: sec / out, hunted, fee: fee / out };
}

export function check() {
  const fails = [];
  const G = gatherIndex(), B = benchIndex();
  for (const list of [TREES, ROCKS, FISH_SPOTS]) for (const n of list) {
    if (n.req > MAX_REQ) continue;
    const each = (Number(n.qty?.[0] ?? 1) + Number(n.qty?.[1] ?? 1)) / 2;
    const perH = (3600000 / pacedActionMs(n.ms)) * each * bid(n.prod);
    if (perH > RAW_CAP(n.req)) fails.push(`W-RAW ${n.id} (level ${n.req}): ${Math.round(perH)} g/h sold raw, over ${RAW_CAP(n.req)} (hunting ${at(HUNTING_FOR_RAW, n.req)} at those hours)`);
  }
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) for (const r of list) {
    if (!r.output || r.gated || r.req > MAX_REQ) continue;
    const it = ITEMS[r.output];
    if (!it) continue;
    const c = chainOf(r.output, G, B);
    const unit = bid(r.output);
    const perH = c.sec > 0 ? (3600 / c.sec) * unit : 0;
    /* What the same hour pays at a public bench, every step's fee taken (the header). */
    const afterH = c.sec > 0 ? (3600 / c.sec) * (unit - c.fee) : 0;
    /* a row is judged at the later of its bench level and the level its own gathered input opens */
    const reqs = [r.req, ...Object.keys(recipeInputs(r)).map((id) => (G[id] ? G[id].req : 0))];
    const level = Math.max(...reqs);
    if (!c.hunted && level <= MAX_REQ && perH > CHAIN_CAP(level)) fails.push(`W-CHAIN ${r.id} (level ${level}): ${Math.round(perH)} g/h from the rock to the shop, over ${CHAIN_CAP(level)} (hunting ${huntingAt(level)})`);
    /* refining: one gathered input, one output */
    const ins = recipeInputs(r);
    const keys = Object.keys(ins);
    if (keys.length === 1 && G[keys[0]] && (Number(r.outputQty) || 1) === 1 && !it.type && r.req <= MAX_REQ && skill !== 'runecrafting') {
      const raw = (3600 / (G[keys[0]].sec * ins[keys[0]])) * bid(keys[0]);
      if (afterH <= raw) fails.push(`W-STEP ${r.id}: refined pays ${Math.round(afterH)} g/h after the bench's fee, the raw stack ${Math.round(raw)}: nobody would refine for the shop`);
    }
    if (['weapon', 'armor', 'offhand'].includes(it.type) && !TIER_3_USE[r.id]) {
      const cost = keys.reduce((s, id) => s + ins[id] * bid(id), 0) + feeG(r) / (Number(r.outputQty) || 1);
      if (unit <= cost) fails.push(`W-FORGE ${r.id}: sells for ${unit} g, the shop's bid for what went in plus the bench's fee is ${cost} g`);
      const bars = keys.filter((id) => /_bar$/.test(id));
      for (const b of bars) {
        const bc = chainOf(b, G, B);
        const barRate = (3600 / bc.sec) * (bid(b) - bc.fee);
        if (!c.hunted && afterH <= barRate) fails.push(`W-FORGE ${r.id}: forging pays ${Math.round(afterH)} g/h after the bench's fee, selling the ${b} ${Math.round(barRate)}`);
      }
    }
  }
  /* W-ROOM: a cooked fish against the store row that heals no more than it does */
  const heals = BASIC_SUPPLIES.filter((b) => b.kind === 'heal').sort((a, b) => a.heals - b.heals);
  for (const n of FISH_SPOTS) {
    if (n.req > MAX_REQ) continue;
    const r = Object.values(ARTISAN_RECIPES.cooking).find((x) => recipeInputs(x)[n.prod] && Object.keys(recipeInputs(x)).length === 1);
    if (!r || !r.output) continue;
    const it = ITEMS[r.output];
    const store = heals.filter((b) => b.heals <= Number(it.heals)).pop();
    if (store && bid(r.output) >= store.price) fails.push(`W-ROOM ${r.output}: the shop bids ${bid(r.output)} g, the store sells ${store.n} (${store.heals} HP) at ${store.price} g: no cook can list under the store`);
  }
  /* W-TAX: the fee against what it is a share of, and the free rows against the taxed rows beside them. */
  for (const r of Object.values(B)) {
    const fee = feeG(r);
    const sells = bid(r.output) * (Number(r.outputQty) || 1);
    if (fee > 0 && Math.ceil(fee) > sells) fails.push(`W-TAX ${r.id}: a craft can charge ${Math.ceil(fee)} g and the job sells for ${sells} g`);
    if (fee > 0 || sells === 0 || !(r.skill in TAX.permille)) continue;
    /* Free by the line: it may not pay more than the best taxed row of its skill within a tier above it pays after tax. */
    const c = chainOf(r.output, G, B);
    if (c.hunted || !(c.sec > 0)) continue;
    const wage = (3600 / c.sec) * bid(r.output);
    let best = 0;
    for (const t of Object.values(B)) {
      if (t.skill !== r.skill || !(feeG(t) > 0) || t.req > r.req + 15) continue;
      const tc = chainOf(t.output, G, B);
      if (!tc.hunted && tc.sec > 0) best = Math.max(best, (3600 / tc.sec) * (bid(t.output) - tc.fee));
    }
    if (wage >= best) fails.push(`W-TAX ${r.id}: free by the cheap goods line, it pays ${Math.round(wage)} g/h and the best taxed ${r.skill} row within 15 levels pays ${Math.round(best)} after its fee`);
  }
  /* W-RUNE: every rune above the free rung, against what goes into a job and against the store row a crafter has to beat. */
  for (const r of ARTISAN_RECIPES.runecrafting.filter((x) => isRune(ITEMS[x.output]) && runeTierOf(ITEMS[x.output]) > 1)) {
    const made = bid(r.output) * (Number(r.outputQty) || 1);
    const ins = Object.entries(recipeInputs(r)).reduce((s, [id, n]) => s + n * Number(ITEMS[id].v), 0);
    if (made >= ins) fails.push(`W-RUNE ${r.id}: a job sells to the shop for ${made} g, its inputs book at ${ins} g: a faucet`);
    const store = BASIC_SUPPLIES.find((b) => b.partner === r.output);
    if (!store) fails.push(`W-RUNE ${r.output}: no store row, and every spendable rune has a store partner`);
    else if (bid(r.output) >= store.price) fails.push(`W-RUNE ${r.output}: the shop bids ${bid(r.output)} g and the store sells ${store.n} at ${store.price} g: no crafter can list under the store`);
  }
  /* W-COAL: the supply rung at Mining 1 is exempt from the XP seat on purpose (gathering.js, coal at any level); the seam above it is not. */
  const perHour = (n) => (3600000 / pacedActionMs(n.ms)) * ((Number(n.qty?.[0] ?? 1) + Number(n.qty?.[1] ?? 1)) / 2);
  const xpHour = (n) => (3600000 / pacedActionMs(n.ms)) * pacedXp('mining', n.xp);
  const coalRows = ROCKS.filter((n) => n.prod === 'coal').sort((a, b) => a.req - b.req);
  const firstSink = Math.min(...Object.values(ARTISAN_RECIPES).flat().filter((r) => recipeInputs(r).coal).map((r) => r.req));
  if (!coalRows.some((n) => n.req > 1 && n.req <= firstSink)) fails.push(`W-COAL no coal rung past the Coal Rock by Mining ${firstSink}, where Steel first eats it: ${coalRows.map((n) => n.req).join()}`);
  coalRows.forEach((n, i) => { if (i && !(perHour(n) > perHour(coalRows[i - 1]) * 1.2)) fails.push(`W-COAL ${n.id} brings ${Math.round(perHour(n))} an hour, not a fifth over ${coalRows[i - 1].id}'s ${Math.round(perHour(coalRows[i - 1]))}`); });
  const seam = coalRows.find((n) => n.req > 1 && n.req <= firstSink);
  if (seam) {
    const under = ROCKS.filter((n) => n.req < seam.req && n.prod !== 'coal').sort((a, b) => b.req - a.req)[0], over = ROCKS.filter((n) => n.req > seam.req).sort((a, b) => a.req - b.req)[0];
    if (!(xpHour(seam) > xpHour(under) && xpHour(seam) < xpHour(over))) fails.push(`W-COAL ${seam.id} pays ${Math.round(xpHour(seam))} XP an hour, not between ${under.id} ${Math.round(xpHour(under))} and ${over.id} ${Math.round(xpHour(over))}`);
  }
  for (const id of SELF_USE) if (bid(id) !== 0) fails.push(`W-USE ${id}: the shop bids ${bid(id)} g; it is made for your own use (the recipe says so)`);
  for (const [room, least] of Object.entries(BENCH_ROOMS)) {
    const rungs = ROOM_RUNGS[room];
    if (rungs[0].cost.gold < least) fails.push(`W-BENCH ${room}: the first rung costs ${rungs[0].cost.gold} g, under ${least} g`);
    rungs.forEach((r, i) => {
      if (i && r.cost.gold <= rungs[i - 1].cost.gold) fails.push(`W-BENCH ${room} rung ${i + 1} costs no more than the one below it`);
      const offer = SHOP_OFFERS.find((o) => o.id === 'room.' + room + '.' + (i + 1));
      const gold = offer && offer.cost.find((c) => c.id === 'gold');
      if (!gold || gold.amount !== r.cost.gold) fails.push(`W-BENCH ${room} rung ${i + 1}: the shop row says ${gold && gold.amount}, the ladder ${r.cost.gold}`);
    });
  }
  /* a recipe still files itself (the guard reads rows the bench shows) */
  if (!recipeCategory('smithing', B.iron_hatchets, ITEMS)) fails.push('W-CHAIN harness: Iron Hatchets has no bench category');
  return fails;
}

function mutate() {
  const results = [];
  const run = (name, arm, plant) => {
    const undo = plant();
    try { results.push([name, check().some((f) => f.startsWith(arm))]); } finally { undo(); }
  };
  const control = check();
  if (control.length) { console.error('MUTATE CONTROL: the tree is not clean:\n  ' + control.join('\n  ')); process.exit(2); }
  const setField = (id, k, v) => { const had = Object.prototype.hasOwnProperty.call(ITEMS[id], k); const was = ITEMS[id][k]; ITEMS[id][k] = v; return () => { if (had) ITEMS[id][k] = was; else delete ITEMS[id][k]; }; };
  const inputs = (skill, rid, next) => { const list = ARTISAN_RECIPES[skill]; const at = list.findIndex((x) => x.id === rid); const was = list[at]; list[at] = { ...was, inputs: next }; return () => { list[at] = was; }; };
  run('coal back at book 40 (3,273 g/h at Mining 1)', 'W-RAW', () => setField('coal', 'v', 40));
  const rock = (id, k, v) => () => { const n = ROCKS.find((x) => x.id === id), was = n[k]; n[k] = v; return () => { n[k] = was; }; };
  run('the Coal Seam back up at Mining 52: the smith waits twelve hours of mining', 'W-COAL', rock('coal_seam', 'req', 52));
  run('the Coal Seam no richer than the Coal Rock', 'W-COAL', rock('coal_seam', 'qty', [1, 1]));
  run('the Coal Seam paying less XP than the Iron Rock under it', 'W-COAL', rock('coal_seam', 'xp', 30));
  run('the Coal Seam pouring out coal at a raw wage over the cap', 'W-RAW', rock('coal_seam', 'qty', [3, 4]));
  run('maple logs back at book 80', 'W-RAW', () => setField('maple_log', 'v', 80));
  run('the Iron Bar back at book 90, a fifth of it still too much', 'W-CHAIN', () => setField('iron_bar', 'v', 90));
  run('the Iron Bar off the bulk list (the shop pays its whole book)', 'W-CHAIN', () => setField('iron_bar', 'raw', false));
  run('the Oak Plank off the bulk list', 'W-CHAIN', () => setField('oak_plank', 'raw', false));
  run('Cooked Herring back at 40', 'W-CHAIN', () => setField('cooked_herring', 'v', 40));
  run('Scored Runes at 4 g a rune on the cut yield', 'W-CHAIN', () => setField('scored_earth_rune', 'v', 4));
  run('Carved Runes bid past their inputs (a job a faucet)', 'W-RUNE', () => setField('carved_fire_rune', 'v', 9));
  run('Graven Runes bid at their store price (no room to list under it)', 'W-RUNE', () => setField('graven_ice_rune', 'v', 24));
  run('Etched Runes back at the old yield of 36 (a job a faucet)', 'W-RUNE', () => { const list = ARTISAN_RECIPES.runecrafting; const at = list.findIndex((x) => x.id === 'bind_etched_water_runes'); const was = list[at]; list[at] = { ...was, outputQty: 36 }; return () => { list[at] = was; }; });
  run('the Steel Axe back at book 900', 'W-CHAIN', () => setField('steel_axe', 'v', 900));
  run('Iron Hatchets back at two bars and a plank (a chain faster than the bench)', 'W-CHAIN', () => inputs('smithing', 'forge_iron_hatchets', { iron_bar: 2, normal_plank: 1 }));
  run('an Oak Plank that pays less than the log time it takes', 'W-STEP', () => setField('oak_plank', 'v', 5));
  run('Iron Hatchets that sell below their metal', 'W-FORGE', () => inputs('smithing', 'forge_iron_hatchets', { iron_bar: 12, normal_plank: 2 }));
  run('forging that pays less than selling the bars', 'W-FORGE', () => inputs('smithing', 'forge_iron_warhammer', { iron_bar: 10, normal_plank: 3 }));
  run('Cooked Herring bid over the store\'s Salted Shrimp', 'W-ROOM', () => setField('cooked_herring', 'v', 14));
  const rate = (key, v, skill) => () => { if (skill) { const was = TAX.permille[skill]; TAX.permille[skill] = v; return () => { TAX.permille[skill] = was; }; } const was = TAX[key]; TAX[key] = v; return () => { TAX[key] = was; }; };
  run('a public bench taking the whole bid: refining pays less than the raw stack', 'W-STEP', rate(null, 1000, 'smithing'));
  run('a public bench taking 60%: forging pays less than its metal', 'W-FORGE', rate(null, 600, 'smithing'));
  run('a fee above what the job sells for', 'W-TAX', rate(null, 1500, 'cooking'));
  run('the cheap goods line raised until the free rows out-earn the taxed ones', 'W-TAX', rate('freeUnderMg', 6000));
  run('Bronze Arrows priced', 'W-USE', () => setField('bronze_arrows', 'v', 1));
  run('Chalked Runes priced', 'W-USE', () => setField('chalked_earth_rune', 'v', 1));
  const rung = (room, i, gold) => { const c = ROOM_RUNGS[room][i].cost; const was = c.gold; try { c.gold = gold; } catch { /* frozen below */ } return () => { c.gold = was; }; };
  run('the Forge back at 800 g', 'W-BENCH', () => rung('forge', 0, 800));
  run('a Kitchen rung cheaper than the one below it', 'W-BENCH', () => rung('kitchen', 2, 50000));
  let bad = 0;
  for (const [name, hit] of results) { console.log(`  ${hit ? 'CAUGHT ' : 'MISSED '} ${name}`); if (!hit) bad++; }
  const after = check();
  if (after.length) { console.error('MUTATE: a plant leaked:\n  ' + after.join('\n  ')); process.exit(2); }
  console.log(`craft-wages --mutate: ${results.length} mutants, ${bad} missed`);
  process.exit(bad ? 1 : 0);
}

if (isEntryModule(import.meta.url)) {
  try {
    if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) mutate();
    const fails = check();
    if (fails.length) { console.error('craft-wages: RED'); fails.forEach((f) => console.error('  ✗ ' + f)); process.exit(1); }
    console.log(`craft-wages: OK — every gathering and bench row to level ${MAX_REQ} pays under hunting at the hours it takes to reach, and each step down the chain pays more`);
  } catch (e) { console.error('craft-wages: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2); }
}
