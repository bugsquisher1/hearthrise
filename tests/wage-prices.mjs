#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/wage-prices.mjs — NO PRICE ROW TYPES ITS GOLD (lane/prices-wage-hours, systems-engineer, 2026-11-23; 27-formula-overhaul.md
// E-6, E-11, T-5 and K-3; 04-math-strategy.md section 11: "every repeating price is stored as hours of the wage").
//
// A town price is hours of the wage at a step (src/data/wage.js wageListPrice: two significant figures, a price tag), and a good the store
// sells whole is the store's one ceiling over its book (src/data/store-kit.js storeAsk). Each arm recomputes every row's gold from the
// row's own hours and step, by its family's rule, and refuses a row whose gold is anything else: a typed price, a second premium, a
// step that is not its gate's. Moving wageBase or payStepCoin moves every price here with the pay; a typed row would not move.
//
//   WP-UNIT    wagePrice is the server's div(hours_pm * hr_wage(step) + 999, 1000) (an independent BigInt), wageListPrice its two figures
//   WP-HOUSE   every room rung and chest: its gold is the list price of its hours at its property tier's step (the rung's gate)
//   WP-SHOP    every SHOP_OFFERS row: a deed its PROPERTY_HOURS_PM at its tier's step, a room its rung's, a good (equip, seed, tool,
//              gear, jewel) the store's ask for its book x count; the companions are the one named holdout (UNCONVERTED)
//   WP-SINKS   every gold-sink ladder is its hours at step 1; the bank's rungs and the key ring are theirs
//   WP-START   the starting purse, the training items and the plot tiers are their hours at step 1
//   WP-TALLY   every task of Tamsin's on a Danger-scale ground pays sharePm of its hours of wage at the ground's refLevel
//   WP-WORKS   the Weighhouse's smallest gift, day, goal a weekly active account and stage marks are their hours at step 1
//   WP-CEIL    ONE store ceiling: no src/data module exports a SHOP_PREMIUM or a JEWEL_SHOP_PREMIUM again, and every plain jewel's
//              shop price is the store's ask for its book
//
//   node tests/wage-prices.mjs            the guard
//   node tests/wage-prices.mjs --mutate   each arm driven red by a defect planted on in-memory copies (no tracked file is patched)
//
// mutant-anchors: none — every mutant is planted on in-memory copies of the rows or of a module's text
// ci-step: economy-selftests | Prices in hours of wage - no town price row types its gold, one store ceiling
// ci-run: node tests/wage-prices.mjs
// ci-run: node tools/mutant-gate.mjs node tests/wage-prices.mjs --mutate
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { wage, wagePrice, wageListPrice, twoFigures } from '../src/data/wage.js';
import { PROPERTY_TIERS, ROOM_RUNGS, STORAGE_CHESTS } from '../src/data/homestead-tiers.js';
import { SHOP_OFFERS, PROPERTY_HOURS_PM } from '../src/data/shops.js';
import { SUPPLY_SHOP_OFFERS, SHOP_SOLD_KINDS } from '../src/data/supply-basics.js';
import { storeAsk, STORE_KIT } from '../src/data/store-kit.js';
import { SINK_RULES } from '../src/data/gold-sinks.js';
import { BANK_LADDER, BANK_BASE_HOURS_PM, BANK_GROWTH, KEY_RING_GOLD, KEY_RING_HOURS_PM } from '../src/data/gold-ladders.js';
import { START_CURRENCY, START_GOLD_HOURS_PM } from '../src/data/start-kit.js';
import { TRAINING_GEAR } from '../src/data/training.js';
import { PLOT_TIER_PRICES } from '../src/core/farm.js';
import { TOWN_WORKS } from '../src/data/town-works.js';
import { JEWEL_SHOP_PRICE } from '../src/data/jewelry.js';
import { ITEMS } from '../src/data/items.js';
import { TALLY_TASKS, TALLY_RULES } from '../src/data/tally-tasks.js';
import { DANGER_GROUNDS } from '../src/data/danger.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* The step an account good with no tier of its own reads (the base wage): gold-sinks.js, gold-ladders.js, training.js, start-kit.js,
   farm.js and town-works.js each say so. */
const BASE_STEP = 1;
/* THE ONE HOLDOUT, a list that only shrinks: a row family whose gold is still typed, with why. */
export const UNCONVERTED = Object.freeze({
  companion: 'three drift-guarded copies of each price (companions.js `source`, companion-unlocks.js, shops.js); converts with the pet slice that reads ownership',
});
/* Per-hero Level formulas the server computes in SQL (not typed rows, so not this guard's): the yard's hour (training.js trainingFee,
   hr_training_fee) and the hero colors (gold-sinks.js hero_colors, hr_sink_price). Each reads the wage once its RPC body does. */
const LEVEL_FORMULAS = Object.freeze(['hero_colors']);

const goldOf = (o) => ((o.cost || []).find((c) => c && c.kind === 'currency' && c.id === 'gold') || {}).amount;
const openTierOf = (tiers, room) => tiers.findIndex((t) => t.rooms.includes(room));

/** Every arm's failures for the given rows (the guard passes the shipped ones; --mutate passes planted copies). */
export function check({
  tiers = PROPERTY_TIERS, rungs = ROOM_RUNGS, chests = STORAGE_CHESTS, offers = SHOP_OFFERS, propertyHours = PROPERTY_HOURS_PM,
  supply = SUPPLY_SHOP_OFFERS, sinks = SINK_RULES, bank = BANK_LADDER, keyRing = KEY_RING_GOLD, start = START_CURRENCY.gold,
  training = TRAINING_GEAR, plots = PLOT_TIER_PRICES, works = TOWN_WORKS, jewels = JEWEL_SHOP_PRICE, sources = null,
  priceFn = wagePrice, listFn = wageListPrice, tally = TALLY_TASKS,
} = {}) {
  const fails = [];
  const f = (arm, msg) => fails.push(arm + ' ' + msg);

  /* WP-UNIT: the one price function against the server twin's arithmetic (ceil(hours x hr_wage / 1000), BigInt) */
  for (const [h, s] of [[1, 1], [39, 1], [1933, 1], [37402, 55], [135516, 90], [999, 2000]]) {
    const want = Number((BigInt(h) * BigInt(wage(s)) + 999n) / 1000n);
    if (priceFn(h, s) !== want) f('WP-UNIT', `wagePrice(${h}, ${s}) = ${priceFn(h, s)}, the server's ceil(h x hr_wage / 1000) = ${want}`);
    const g = priceFn(h, s), t = listFn(h, s);
    if (t !== twoFigures(g) || (g >= 100 && String(t).replace(/0+$/, '').length > 2)) f('WP-UNIT', `wageListPrice(${h}, ${s}) = ${t} is not ${g} to two figures`);
  }
  if (priceFn(0, 1) !== 0) f('WP-UNIT', 'no hours must cost no gold');

  /* WP-HOUSE */
  for (const [room, list] of Object.entries(rungs)) {
    const open = openTierOf(tiers, room);
    list.forEach((r, i) => {
      const step = tiers[Math.max(open, r.tier || 0)].step;
      if (r.step !== step) f('WP-HOUSE', `${room} rung ${i + 1} reads step ${r.step}, its gate's tier is step ${step}`);
      if (!(r.hoursPm > 0) || r.cost.gold !== wageListPrice(r.hoursPm, step)) f('WP-HOUSE', `${room} rung ${i + 1} costs ${r.cost.gold} g, its ${r.hoursPm} milli-hours at step ${step} list at ${wageListPrice(r.hoursPm, step)}: a typed price`);
    });
  }
  for (const c of chests) {
    const step = tiers[c.tier].step;
    if (!(c.hoursPm > 0) || c.cost.gold !== wageListPrice(c.hoursPm, step)) f('WP-HOUSE', `chest ${c.id} costs ${c.cost.gold} g, its ${c.hoursPm} milli-hours at step ${step} list at ${wageListPrice(c.hoursPm, step)}: a typed price`);
  }

  /* WP-SHOP */
  const rungOf = (id) => { const m = /^room\.([a-z_]+)\.(\d+)$/.exec(id); return m && rungs[m[1]] ? rungs[m[1]][Number(m[2]) - 1] : null; };
  for (const o of offers) {
    const g = goldOf(o);
    if (o.table === 'companion') { if (!UNCONVERTED.companion) f('WP-SHOP', `${o.id}: a companion row with no holdout`); continue; }
    if (o.table === 'property') {
      const id = o.id.replace(/^property\./, ''), t = tiers.findIndex((x) => x.id === id);
      const want = t > 0 && propertyHours[id] > 0 ? wageListPrice(propertyHours[id], tiers[t].step) : null;
      if (g !== want) f('WP-SHOP', `${o.id} costs ${g} g, its hours at its tier's step list at ${want}: a typed price`);
    } else if (o.table === 'room') {
      const r = rungOf(o.id);
      if (!r || g !== r.cost.gold) f('WP-SHOP', `${o.id} costs ${g} g, its rung ${r ? r.cost.gold : 'is missing'}: two homes for one price`);
    } else {
      /* a good: equip, a seed bundle, or a supply row (tool, gear, jewel, seed; a food, drink or charge row is store-kit's, EL-PRICE's) */
      const line = o.grant && o.grant[0];
      const it = line && ITEMS[line.id];
      const sold = o.table !== 'supply' || SHOP_SOLD_KINDS.includes((supply.find((s) => s.offer === o.id) || {}).kind);
      if (!sold) continue;
      if (!it || g !== storeAsk(it.v, line.amount)) f('WP-SHOP', `${o.id} costs ${g} g, the store's ask for its book is ${it ? storeAsk(it.v, line.amount) : '(no item)'}: a typed price or a second premium`);
    }
  }

  /* WP-SINKS */
  for (const [id, r] of Object.entries(sinks)) {
    if (LEVEL_FORMULAS.includes(id)) continue;
    const h = r.hoursPm || [];
    if (!Array.isArray(r.prices) || r.prices.length !== h.length || r.prices.some((p, i) => p !== wageListPrice(h[i], BASE_STEP))) {
      f('WP-SINKS', `${id} climbs ${JSON.stringify(r.prices)}, its hours ${JSON.stringify(h)} list at ${JSON.stringify(h.map((x) => wageListPrice(x, BASE_STEP)))}: a typed rung`);
    }
  }
  bank.forEach((r, k) => {
    const want = wageListPrice(Math.round(BANK_BASE_HOURS_PM * Math.pow(BANK_GROWTH, k)), BASE_STEP);
    if (r.gold !== want) f('WP-SINKS', `bank rung ${k + 1} costs ${r.gold} g, its hours list at ${want}: a typed rung`);
  });
  if (keyRing !== wageListPrice(KEY_RING_HOURS_PM, BASE_STEP)) f('WP-SINKS', `the key ring costs ${keyRing} g, its hours list at ${wageListPrice(KEY_RING_HOURS_PM, BASE_STEP)}`);

  /* WP-START */
  if (start !== wageListPrice(START_GOLD_HOURS_PM, BASE_STEP)) f('WP-START', `the starting purse is ${start} g, its ${START_GOLD_HOURS_PM} milli-hours list at ${wageListPrice(START_GOLD_HOURS_PM, BASE_STEP)}`);
  for (const hrs of training.hours) {
    const want = wageListPrice(training.hoursPm[hrs], BASE_STEP);
    if (training.gold[hrs] !== want) f('WP-START', `the ${hrs} h training item costs ${training.gold[hrs]} g, its hours list at ${want}`);
  }
  for (const [lv, p] of Object.entries(plots)) if (p.gold !== wageListPrice(p.hoursPm, BASE_STEP)) f('WP-START', `plot tier ${lv} costs ${p.gold} g, its hours list at ${wageListPrice(p.hoursPm, BASE_STEP)}`);

  /* WP-TALLY */
  for (const t of tally) {
    const g = Object.prototype.hasOwnProperty.call(DANGER_GROUNDS, t.hunt) ? DANGER_GROUNDS[t.hunt] : null;
    if (!g) continue;
    const want = wageListPrice(Math.round((TALLY_RULES.sharePm * t.hoursPm) / 1000), g.refLevel);
    if (!(t.hoursPm > 0) || t.gold !== want) f('WP-TALLY', `${t.id} pays ${t.gold} g on a scale ground, ${TALLY_RULES.sharePm} permille of its ${t.hoursPm} milli-hours of wage(${g.refLevel}) list at ${want}: a typed reward`);
  }

  /* WP-WORKS */
  for (const [id, w] of Object.entries(works)) {
    for (const k of ['minGift', 'perDay', 'perActive']) {
      const want = w.hoursPm && wageListPrice(w.hoursPm[k], BASE_STEP);
      if (w[k] !== want) f('WP-WORKS', `${id}.${k} is ${w[k]} g, its hours list at ${want}: a typed amount`);
    }
    w.stages.forEach((s, i) => { if (s.at !== wageListPrice(s.atHoursPm, BASE_STEP)) f('WP-WORKS', `${id} stage ${i} stands at ${s.at} g, its hours list at ${wageListPrice(s.atHoursPm, BASE_STEP)}`); });
  }

  /* WP-CEIL */
  const texts = sources || readdirSync(join(ROOT, 'src', 'data')).filter((n) => n.endsWith('.js')).map((n) => [n, readFileSync(join(ROOT, 'src', 'data', n), 'utf8')]);
  for (const [n, t] of texts) if (/export\s+const\s+(SHOP_PREMIUM|JEWEL_SHOP_PREMIUM)\b/.test(t)) f('WP-CEIL', `src/data/${n} exports a second store premium: the store's one ceiling is STORE_KIT.storeCeiling (${STORE_KIT.storeCeiling})`);
  for (const [id, g] of Object.entries(jewels)) if (!ITEMS[id] || g !== storeAsk(ITEMS[id].v)) f('WP-CEIL', `${id}'s shop price is ${g} g, the store's ask for its book is ${ITEMS[id] ? storeAsk(ITEMS[id].v) : '(no item)'}`);

  return fails;
}

/* Planted defects, each on a copy: [arm, what, the inputs it changes]. */
function mutants() {
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const firstRoom = Object.keys(ROOM_RUNGS)[0];
  const rungs = clone(ROOM_RUNGS); rungs[firstRoom][0].cost.gold += 1000;
  const stepped = clone(ROOM_RUNGS); stepped[firstRoom][0].step = 90;
  const chests = clone(STORAGE_CHESTS); chests[0].cost.gold = 1500 + 1;
  const deed = clone(SHOP_OFFERS); deed.find((o) => o.id === 'property.castle').cost[0].amount = 2600000;
  const premium = clone(SHOP_OFFERS); { const o = premium.find((x) => x.id === 'supply.bronze_axe'); o.cost[0].amount = 2 * ITEMS.bronze_axe.v; }
  const roomTwo = clone(SHOP_OFFERS); roomTwo.find((o) => o.id === 'room.kitchen.1').cost[0].amount = 41000;
  const sinks = clone(SINK_RULES); sinks.powder.prices[0] = 2100;
  const bank = clone(BANK_LADDER); bank[3].gold = 6900 + 100;
  const training = clone(TRAINING_GEAR); training.gold[12] = 260000;
  const plots = clone(PLOT_TIER_PRICES); plots[3].gold = 5500;
  const works = clone(TOWN_WORKS); works.weighhouse.perDay = 30000;
  const stage = clone(TOWN_WORKS); stage.weighhouse.stages[2].at = 80000;
  const jewels = { ...JEWEL_SHOP_PRICE, banded_signet: 3000 };
  const sources = [['shops.js', 'export const SHOP_PREMIUM = 2;']];
  const tally = clone(TALLY_TASKS); { const t = tally.find((x) => DANGER_GROUNDS[x.hunt]); if (t) t.gold = 2560; }
  return [
    ['WP-UNIT', 'the price floored where the server ceils', { priceFn: (h, st) => Math.floor((h * wage(st)) / 1000) }],
    ['WP-UNIT', 'a list price to three figures', { listFn: (h, st) => { const g = wagePrice(h, st); const p = 10 ** Math.max(0, String(g).length - 3); return Math.round(g / p) * p; } }],
    ['WP-HOUSE', 'a room rung typed 1,000 g over its hours', { rungs }],
    ['WP-HOUSE', 'a rung read at a step that is not its gate\'s', { rungs: stepped }],
    ['WP-HOUSE', 'a chest typed one gold off its hours', { chests }],
    ['WP-SHOP', 'the Castle deed typed at 2,600,000', { offers: deed }],
    ['WP-SHOP', 'SHOP_PREMIUM 2 back on the Bronze Axe', { offers: premium }],
    ['WP-SHOP', 'a room offer priced apart from its rung (two homes)', { offers: roomTwo }],
    ['WP-SINKS', 'a powder rung typed', { sinks }],
    ['WP-SINKS', 'a bank rung typed', { bank }],
    ['WP-SINKS', 'the key ring typed', { keyRing: 25001 }],
    ['WP-START', 'the starting purse typed at 500', { start: 500 }],
    ['WP-START', 'a training item typed', { training }],
    ['WP-START', 'a plot tier typed', { plots }],
    ['WP-TALLY', 'a scale ground task back at its old typed gold', { tally }],
    ['WP-WORKS', 'the Weighhouse day typed', { works }],
    ['WP-WORKS', 'a Weighhouse stage typed', { works: stage }],
    ['WP-CEIL', 'a plain jewel back at its 10x premium', { jewels }],
    ['WP-CEIL', 'a module exports SHOP_PREMIUM again', { sources }],
  ];
}

function main() {
  const mutate = process.argv.includes('--mutate');
  let fails;
  try { fails = check(); } catch (e) { console.error('wage-prices: HARNESS ' + (e && e.stack || e)); process.exit(2); }
  if (fails.length) { console.error('wage-prices: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log(`wage-prices: every town price is hours of wage (${Object.values(ROOM_RUNGS).flat().length} rungs, ${STORAGE_CHESTS.length} chests, `
    + `${SHOP_OFFERS.length} offers, ${Object.keys(SINK_RULES).length - LEVEL_FORMULAS.length} sink ladders, ${BANK_LADDER.length} bank rungs), one store ceiling`);
  if (!mutate) return;
  let missed = 0;
  for (const [arm, what, input] of mutants()) {
    let got;
    try { got = check(input); } catch (e) { console.error(`  HARNESS ${arm} ${what}: ${e.message}`); process.exit(2); }
    const hit = got.some((x) => x.startsWith(arm + ' '));
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${arm}  ${what}`);
    if (!hit) missed++;
  }
  if (missed) { console.error(`wage-prices --mutate: ${missed} mutant(s) escaped`); process.exit(1); }
  console.log('wage-prices --mutate: every planted defect turned its arm red');
}

if (isMain(import.meta.url)) main();
