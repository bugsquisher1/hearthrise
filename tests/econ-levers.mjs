#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/econ-levers.mjs — THE ECONOMY LEVERS, SET TOGETHER (lane/econ-levers, game designer, 2026-11-22; 04-math-strategy.md section 11,
// 09-crafting.md sections 2.5 and 4.6, 12-targets.md 2.1 and C-5).
//
// The store's prices, the wage, the scale's coin level and ratio, and the pay floor are one lever set: a Steady four's kit must take 0.2 to
// 0.3 of what its hour pays, and that hour must pay about one hour of wage. These arms hold the set against the kept real-engine reading
// (REPORT below: the mixed MID four at Muster Barrows, read from its held hours): a
// price, the wage or the coin moved without re-measuring turns one red.
//
//   EL-PRICE    every store row's price is store-kit.js storePrice of its crafted partner: nothing typed
//   EL-RUNES    the rune ladder is the derived price of each tier, never falling
//   EL-BUYBACK  store-kit's buyback is the edge's SHOP_BUYBACK_RATE (the floor that keeps a crafted partner's bid at its book reads it)
//   EL-COIN     one coin ratio a step: the engine's PAY has no coin ratio of its own (the wage's payStepCoin is the one)
//   EL-KIT      the measured uses of the Steady four, each priced as the server charges it (supply-basics.js storeUsePrice at the buyer's
//               store step: the cell's held depth in the wage's unit, src/core/wage.js depthStep; lane/econ-followups), cost 0.2 to 0.3
//               of its measured pay; Careful and Bold at most 0.33
//   EL-PAY      each stance's measured pay is 0.75 to 1.33 of wage(Level) (the wage tracks the scale's pay); Steady's Levels 0.95 to 1.05
//   EL-STANCE   Careful's measured XP is 0.55 to 0.70 of Steady's (12-targets C-5, through the pay floor of 2.1)
//   EL-SINK     gate 7's gold ledger (tools/balance-program/redesign/sinks/ledger.mjs, lane/sn-sinks, 12-targets section 9): the reference
//               company burns 0.85 to 0.90 of what it mints by day 180, without and with its hall, on this file's kept reading
//
//   node tests/econ-levers.mjs            the guard
//   node tests/econ-levers.mjs --mutate   each arm driven red by a defect planted on in-memory copies (no tracked file is patched)
//
// mutant-anchors: none — every mutant is planted on in-memory copies of the rows and the report
// ci-step: economy-selftests | Economy levers set together - a typed store price, a second coin ratio, the kit out of 0.2-0.3 of pay, the wage off the pay, Careful off C-5
// ci-run: node tests/econ-levers.mjs
// ci-run: node tools/mutant-gate.mjs node tests/econ-levers.mjs --mutate
// Exit: 0 green · 1 a red arm or a missed mutant · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { BASIC_SUPPLIES, STORE_RUNE_PRICE, BASIC_AMMO_PREMIUM, storeUsePrice } from '../src/data/supply-basics.js';
import { depthStep } from '../src/core/wage.js';
import { STORE_KIT, storePrice } from '../src/data/store-kit.js';
import { WAGE, wage } from '../src/data/wage.js';
import { PAY } from '../src/data/danger.js';
import { ITEMS } from '../src/data/items.js';
import { DRINK_ITEMS, DRINK_RECIPES } from '../src/data/drinks.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { RUNE_TIERS, isRune, runeTierOf, versionLevel } from '../src/data/runes.js';
import { SHOP_BUYBACK_RATE } from '../supabase/functions/hr-accrue/catalogue.js';
import { referenceReading, SINK_BAND, KEPT_READING, PRICING } from '../tools/balance-program/redesign/sinks/ledger.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* the kept reading since the tuning pass (lane/tuning-pass, 2026-11-23, 29-tuning-pass.md): Muster Barrows on its monster formula, the
   amount pipeline, floor 0.575, coinPm 6100, 8 seeds x 10 h from step 0, held from hour 4 (tools/balance-program/redesign/tuning/matrix.sh) */
export const REPORT = 'tools/balance-program/redesign/tuning/final/c0-muster-ref.json';
/* the kept reading's ground (its cells' held steps are this ground's own Danger steps) */
const MUSTER = 'muster_barrows';
const KIT_BAND = [0.2, 0.3], KIT_OTHER_MAX = 0.33, PAY_BAND = [0.75, 1.33], STEADY_PAY = [0.95, 1.05], CAREFUL_XP = [0.55, 0.7];

/* the price a row's crafted partner sets, read here from the partner's own data (independent of supply-basics' helpers) */
function expectedPrice(b, kit) {
  const p = ITEMS[b.partner] || DRINK_ITEMS[b.partner];
  if (!p) return null;
  if (b.kind === 'ammo') {
    const rune = isRune(p);
    return storePrice({ line: 'charge', step: rune ? versionLevel(runeTierOf(p)) : Number(p.reqLv) || 1, book: Number(p.v) || 0, rune, ammoPremium: BASIC_AMMO_PREMIUM }, kit);
  }
  const key = b.kind === 'heal' ? 'heals' : 'mana';
  const recipe = b.kind === 'heal' ? Object.values(ARTISAN_RECIPES.cooking).find((r) => r.output === b.partner) : DRINK_RECIPES.find((r) => r.output === b.partner);
  return recipe ? storePrice({ line: 'meal', step: recipe.req, amount: b[key], partnerAmount: Number(p[key]), book: Number(p.v) || 0 }, kit) : null;
}

/** Every arm's failures for the given rows, levers and report (the guard passes the shipped ones; --mutate passes planted copies). */
export function check({ basics = BASIC_SUPPLIES, runePrices = STORE_RUNE_PRICE, kit = STORE_KIT, pay = PAY, wageOf = wage, buyback = SHOP_BUYBACK_RATE, useAt = storeUsePrice, report, sinks = null, ledgerReads = KEPT_READING } = {}) {
  const fails = [];
  const f = (arm, msg) => fails.push(arm + ' ' + msg);
  for (const b of basics) {
    const want = expectedPrice(b, kit);
    if (want === null) f('EL-PRICE', b.id + ': its crafted partner ' + b.partner + ' has no made-at Level or no row to price it from');
    else if (b.price !== want) f('EL-PRICE', b.id + ' costs ' + b.price + ' g, its crafted partner prices it at ' + want + ' g: a typed price');
  }
  for (const t of RUNE_TIERS) {
    const rows = basics.filter((b) => b.kind === 'ammo' && /_rune$/.test(b.id) && isRune(ITEMS[b.partner]) && runeTierOf(ITEMS[b.partner]) === t.tier);
    if (!rows.length) f('EL-RUNES', 'no store rune of tier ' + t.tier);
    for (const b of rows) if (b.price !== runePrices[t.tier - 1]) f('EL-RUNES', b.id + ' costs ' + b.price + ', the ladder says ' + runePrices[t.tier - 1]);
    if (t.tier > 1 && !(runePrices[t.tier - 1] >= runePrices[t.tier - 2])) f('EL-RUNES', 'the ladder falls at tier ' + t.tier + ': ' + runePrices.join(' / '));
  }
  if (kit.buyback !== buyback) f('EL-BUYBACK', 'store-kit buys back at ' + kit.buyback + ', the edge at ' + buyback);
  if (Object.prototype.hasOwnProperty.call(pay, 'payStepCoin')) f('EL-COIN', 'PAY carries its own coin ratio (' + pay.payStepCoin + ') beside the wage\'s ' + WAGE.payStepCoin + ': two coin ratios a step');
  /* the kept reading */
  const cells = (report && report.cells) || {};
  /* a use costs its row at the buyer's store step (1062-store-step.sql): the cell's four held its ground's depth, so its store step is
     that depth in the wage's unit (the per-window depth wanders round the hold; the mean is the reading) */
  const bill = (c) => Object.entries(c.kitIds || {}).reduce((s, [id, n]) => s + n * (useAt(id, depthStep(MUSTER, c.held && c.held.mean)) || 0), 0);
  for (const [id, band] of [['base:steady', KIT_BAND], ['base:careful', [0, KIT_OTHER_MAX]], ['base:bold', [0, KIT_OTHER_MAX]]]) {
    const c = cells[id];
    if (!c || !c.kitIds || !c.gold) { f('EL-KIT', 'the kept report has no ' + id + ' cell with its uses and pay (' + REPORT + ')'); continue; }
    const share = bill(c) / c.gold.incomePerHeroH.mean;
    if (!(share >= band[0] && share <= band[1])) f('EL-KIT', id + ': the kit at the buyer\'s step costs ' + share.toFixed(3) + ' of the hour\'s pay, the band is ' + band.join(' to '));
  }
  for (const [id, band] of [['base:careful', PAY_BAND], ['base:steady', STEADY_PAY], ['base:bold', PAY_BAND], ['levels:steady', STEADY_PAY], ['high:steady', STEADY_PAY]]) {
    const c = cells[id];
    if (!c || !c.gold) { f('EL-PAY', 'the kept report has no ' + id + ' cell'); continue; }
    const x = c.gold.incomePerHeroH.mean / wageOf(c.L);
    if (!(x >= band[0] && x <= band[1])) f('EL-PAY', id + ' at Level ' + c.L + ' pays ' + c.gold.incomePerHeroH.mean + ', ' + x.toFixed(3) + ' of wage(' + c.L + ') = ' + wageOf(c.L) + ', the band is ' + band.join(' to '));
  }
  const careful = cells['base:careful'], steady = cells['base:steady'];
  if (!careful || !steady) f('EL-STANCE', 'the kept report has no Careful or Steady cell');
  else {
    const x = careful.payX.mean / steady.payX.mean;
    if (!(x >= CAREFUL_XP[0] && x <= CAREFUL_XP[1])) f('EL-STANCE', 'Careful earns ' + x.toFixed(3) + ' of Steady\'s XP an hour, C-5 says ' + CAREFUL_XP.join(' to '));
  }
  /* gate 7: the gold ledger reads this file's kept reading, and its reference company burns inside the band by day 180 */
  if (ledgerReads !== REPORT) f('EL-SINK', 'the gold ledger reads ' + ledgerReads + ', this file\'s kept reading is ' + REPORT);
  for (const [k, x] of Object.entries(sinks || referenceReading())) {
    if (!(x >= SINK_BAND[0] && x <= SINK_BAND[1])) f('EL-SINK', 'the ledger\'s ' + k + ' company burns ' + x.toFixed(3) + ' of what it mints by day 180, gate 7 says ' + SINK_BAND.join(' to '));
  }
  return fails;
}

function readReport() {
  return JSON.parse(readFileSync(join(ROOT, REPORT), 'utf8'));
}

function mutate(report) {
  const plants = [
    ['EL-PRICE', 'a typed price on the Salted Lobster', () => ({ basics: BASIC_SUPPLIES.map((b) => (b.id === 'salted_lobster' ? { ...b, price: 180 } : b)) })],
    ['EL-PRICE', 'a store row with no crafted partner to price it', () => ({ basics: [...BASIC_SUPPLIES, { id: 'salted_mystery', kind: 'heal', partner: 'nothing_here', heals: 50, price: 5 }] })],
    ['EL-RUNES', 'the old hand-typed ladder', () => ({ runePrices: [1, 8, 12, 28, 44] })],
    ['EL-BUYBACK', 'a store floor read at another buy-back', () => ({ kit: { ...STORE_KIT, buyback: 0.4 } })],
    ['EL-COIN', 'the engine\'s own 0.7% coin ratio back', () => ({ pay: { ...PAY, payStepCoin: 0.007 } })],
    ['EL-KIT', 'the old store ladder (shark 693, carrot 18, mithril 4, etched 12)', () => ({ useAt: (id, step) => ({ salted_lobster: 180, thin_carrot_juice: 18, plain_mithril_arrows: 4 }[id] ?? (/^plain_etched_/.test(id) ? 12 : storeUsePrice(id, step))) })],
    ['EL-KIT', 'a use priced at the raw Danger step (wage(576) is 8x a Level 60 hour)', () => ({ useAt: (id) => storeUsePrice(id, 576) })],
    ['EL-PAY', 'the wage left at lane W\'s 3,800 after the coin level moved', () => ({ wageOf: (L) => Math.floor(3800 * 1.004 ** L) })],
    ['EL-SINK', 'hunting blocks at half their price (the bought blocks are the sink that closes the ledger)', () => ({ sinks: referenceReading({ ...PRICING, blockPrice: (o) => { const g = PRICING.blockPrice(o); return g === null ? null : Math.floor(g / 2); } }) })],
    ['EL-SINK', 'the ledger reading another kept report', () => ({ ledgerReads: 'tools/balance-program/redesign/econ/after-muster-L60.json' })],
    ['EL-STANCE', 'Careful measured with no pay floor (0.32x)', () => ({ report: { ...report, cells: { ...report.cells, 'base:careful': { ...report.cells['base:careful'], payX: { mean: 0.32 } } } } })],
  ];
  let missed = 0;
  for (const [arm, name, plant] of plants) {
    const fails = check({ report, ...plant() });
    const caught = fails.some((x) => x.startsWith(arm + ' '));
    console.log((caught ? '  caught ' : '  MISSED ') + arm + ': ' + name);
    if (!caught) missed++;
  }
  return missed;
}

if (isMain(import.meta.url)) {
  let report;
  try { report = readReport(); } catch (e) { console.error('econ-levers: harness: ' + e.message); process.exit(2); }
  if (process.argv.includes('--mutate')) {
    if (check({ report }).length) { console.error('econ-levers --mutate: the shipped data is red; run the guard first'); process.exit(1); }
    const missed = mutate(report);
    console.log(missed ? 'econ-levers --mutate: ' + missed + ' MISSED' : 'econ-levers --mutate: every arm bites');
    process.exit(missed ? 1 : 0);
  }
  const fails = check({ report });
  for (const x of fails) console.log('  ✗ ' + x);
  console.log(fails.length ? 'econ-levers: RED (' + fails.length + ')' : 'econ-levers: green');
  process.exit(fails.length ? 1 : 0);
}
