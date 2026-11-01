#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/craft-wages.mjs — WHAT A HERO'S TIME PAYS AT THE SHOP, PER SKILL ROW (designer 2026-11-01, lane/c-craft-economy).
//
// The bug class: the shop paid more for a hero's hour at a bench than the game pays for an hour of anything else. A blind panel made
// 97,937 g from crafting against 15,200 g from hunting in 27 hours; measured on the real settle and sale, an Iron Bar made by one hero
// from the rock paid 27,000 g/h at Smithing 15 against about 3,000 g/h hunting at the same hours played, and a forged piece sold below its
// own metal. Hunting drives most income (balance ruling 10-25 §1); every skill still pays, and each step down the chain pays more.
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
import { recipeInputs } from '../src/core/artisan.js';
import { pacedActionMs } from '../src/core/pacing.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

/* The rows a beta player reaches in 40 hours (Mining 60 at 29 h, Woodcutting 60 at 37 h, played: tools/qa/craft-economy.mjs --careers). */
const MAX_REQ = 60;
/* In-band hunting at the hours a skill's level takes to reach, g/h per hero: the 2026-10-31 verdict (1,146 cells on the real settle),
   re-measured on this commit (the priority board's 2026-11-01 section). A wage is judged against these, never against a feel. */
const HUNTING = [[1, 2000], [15, 2900], [30, 3800], [45, 4200], [60, 5500]];
/* A gatherer gets there first: a node's level takes about 1 / 3 / 10 / 33 hours of that one job (played), so raw is judged against the
   grounds of those hours, a bench row against the later hours of both skills. */
const HUNTING_FOR_RAW = [[1, 2000], [15, 2600], [30, 2600], [45, 3500], [60, 4900]];
const at = (table, req) => table.filter(([l]) => l <= req).pop()[1];
const huntingAt = (req) => at(HUNTING, req);
const RAW_CAP = (req) => Math.round(at(HUNTING_FOR_RAW, req) * 0.6);
const CHAIN_CAP = (req) => Math.round(huntingAt(req) * 0.9);
/* Tier 3 sells at 0.14 of book by the 10-23 ruling, one price per item however it came: these are made to be carried. */
const TIER_3_USE = Object.freeze({ forge_coppercap_shield: 'the Warrens-tier shield', reforge_steelgrate: 'a Rare Kingsgrate reforged' });
const SELF_USE = Object.freeze(['bronze_arrows', 'coarse_whetstone', 'chalked_earth_rune', 'chalked_water_rune', 'chalked_fire_rune',
  'chalked_ice_rune', 'chalked_poison_rune', 'chalked_rupture_rune']);

const bid = (id) => vendorPriceOf(ITEMS, id);

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
  if (G[item]) return { sec: G[item].sec, hunted: false };
  const r = B[item];
  if (!r || seen.has(item)) return { sec: 0, hunted: true };
  seen.add(item);
  let sec = pacedActionMs(r.ms) / 1000, hunted = false;
  for (const [id, n] of Object.entries(recipeInputs(r))) {
    const c = chainOf(id, G, B, new Set(seen));
    sec += n * c.sec;
    hunted = hunted || c.hunted;
  }
  return { sec: sec / (Number(r.outputQty) || 1), hunted };
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
    /* a row is judged at the later of its bench level and the level its own gathered input opens */
    const reqs = [r.req, ...Object.keys(recipeInputs(r)).map((id) => (G[id] ? G[id].req : 0))];
    const level = Math.max(...reqs);
    if (!c.hunted && level <= MAX_REQ && perH > CHAIN_CAP(level)) fails.push(`W-CHAIN ${r.id} (level ${level}): ${Math.round(perH)} g/h from the rock to the shop, over ${CHAIN_CAP(level)} (hunting ${huntingAt(level)})`);
    /* refining: one gathered input, one output */
    const ins = recipeInputs(r);
    const keys = Object.keys(ins);
    if (keys.length === 1 && G[keys[0]] && (Number(r.outputQty) || 1) === 1 && !it.type && r.req <= MAX_REQ && skill !== 'runecrafting') {
      const raw = (3600 / (G[keys[0]].sec * ins[keys[0]])) * bid(keys[0]);
      if (perH <= raw) fails.push(`W-STEP ${r.id}: refined pays ${Math.round(perH)} g/h, the raw stack ${Math.round(raw)}: nobody would refine for the shop`);
    }
    if (['weapon', 'armor', 'offhand'].includes(it.type) && !TIER_3_USE[r.id]) {
      const cost = keys.reduce((s, id) => s + ins[id] * bid(id), 0);
      if (unit <= cost) fails.push(`W-FORGE ${r.id}: sells for ${unit} g, the shop's bid for what went in is ${cost} g`);
      const bars = keys.filter((id) => /_bar$/.test(id));
      for (const b of bars) {
        const barRate = (3600 / chainOf(b, G, B).sec) * bid(b);
        if (!c.hunted && perH <= barRate) fails.push(`W-FORGE ${r.id}: forging pays ${Math.round(perH)} g/h, selling the ${b} ${Math.round(barRate)}`);
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
  for (const id of SELF_USE) if (bid(id) !== 0) fails.push(`W-USE ${id}: the shop bids ${bid(id)} g; it is made for your own use (the recipe says so)`);
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
  run('maple logs back at book 80', 'W-RAW', () => setField('maple_log', 'v', 80));
  run('the Iron Bar back at book 90, a fifth of it still too much', 'W-CHAIN', () => setField('iron_bar', 'v', 90));
  run('the Iron Bar off the bulk list (the shop pays its whole book)', 'W-CHAIN', () => setField('iron_bar', 'raw', false));
  run('the Oak Plank off the bulk list', 'W-CHAIN', () => setField('oak_plank', 'raw', false));
  run('Cooked Herring back at 40', 'W-CHAIN', () => setField('cooked_herring', 'v', 40));
  run('Scored Runes back at 2 g a rune', 'W-CHAIN', () => setField('scored_earth_rune', 'v', 2));
  run('the Steel Axe back at book 900', 'W-CHAIN', () => setField('steel_axe', 'v', 900));
  run('Iron Hatchets back at two bars and a plank (a chain faster than the bench)', 'W-CHAIN', () => inputs('smithing', 'forge_iron_hatchets', { iron_bar: 2, normal_plank: 1 }));
  run('an Oak Plank that pays less than the log time it takes', 'W-STEP', () => setField('oak_plank', 'v', 5));
  run('Iron Hatchets that sell below their metal', 'W-FORGE', () => inputs('smithing', 'forge_iron_hatchets', { iron_bar: 12, normal_plank: 2 }));
  run('forging that pays less than selling the bars', 'W-FORGE', () => inputs('smithing', 'forge_iron_warhammer', { iron_bar: 10, normal_plank: 3 }));
  run('Cooked Herring bid over the store\'s Salted Shrimp', 'W-ROOM', () => setField('cooked_herring', 'v', 14));
  run('Bronze Arrows priced', 'W-USE', () => setField('bronze_arrows', 'v', 1));
  run('Chalked Runes priced', 'W-USE', () => setField('chalked_earth_rune', 'v', 1));
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
