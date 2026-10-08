#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/shop-craft-loop.mjs — NO BUY → CRAFT → VENDOR LOOP PRINTS GOLD.
//
// vendor-shop-arbitrage proves no shop offer vendors for more than it costs and
// that every recipe's bid sits under the craft anchor. Neither prices the TWO-
// step loop Security named on content-holes (sec/wave1-review): buy every input
// of a recipe from a gold shop, craft it, vendor the output. This prices exactly
// that, through the edge's own vendorPriceOf (the craft-anchored bid), for every
// recipe whose inputs are ALL gold-buyable:
//   LOOP-1  output bid × outputQty  ≤  Σ input qty × cheapest shop unit price
//
//   node tests/shop-craft-loop.mjs            gate
//   node tests/shop-craft-loop.mjs --selftest a planted 1g iron-bar stack must go red
// Pure data, no database. NO ?v= on imports (tests/**, b332).
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { vendorPriceOf } from '../supabase/functions/hr-accrue/catalogue.js';

function unitPrices(offers) {
  const unit = {};
  for (const o of offers) {
    const gold = (o.cost || []).filter((c) => c.kind === 'currency' && c.id === 'gold');
    if (gold.length !== 1 || (o.cost || []).length !== 1) continue;            // gold-only offers
    const items = (o.grant || []).filter((g) => g.kind === 'item');
    if (items.length !== 1 || (o.grant || []).length !== 1) continue;
    const per = gold[0].amount / items[0].amount;
    if (!(unit[items[0].id] <= per)) unit[items[0].id] = per;
  }
  return unit;
}
const inputsOf = (r) => {
  if (r.inputs) return r.inputs;
  const i = {}; if (r.input) i[r.input] = r.inputQty || 1;
  if (r.secondary) Object.assign(i, r.secondary);
  return i;
};

export function check(offers = SHOP_OFFERS, items = ITEMS) {
  const unit = unitPrices(offers);
  const P = []; let priced = 0;
  for (const [skill, list] of Object.entries(ARTISAN_RECIPES)) {
    for (const r of list || []) {
      if (!r.output) continue;
      const ins = Object.entries(inputsOf(r));
      if (!ins.length || !ins.every(([id]) => unit[id] > 0)) continue;
      priced++;
      const cost = ins.reduce((s, [id, q]) => s + unit[id] * q, 0);
      const gross = vendorPriceOf(items, r.output) * (r.outputQty || 1);
      if (gross > cost) P.push(`LOOP-1 ${skill}/${r.id}: buy inputs ${cost.toFixed(1)}g → vendor ${r.outputQty || 1}× ${r.output} for ${gross}g (+${(gross - cost).toFixed(1)}g a craft)`);
    }
  }
  return { P, priced };
}

if (process.argv.includes('--selftest')) {
  if (check().P.length) { console.error('SELFTEST: the real tree is not green'); process.exit(1); }
  /* Plant the shape the loop needs: a gold offer selling a forge input far below
     what its output vendors for (100 iron bars for 1 gold). */
  const cheap = [...SHOP_OFFERS, { id: 'selftest.iron_bar', table: 'equip',
    cost: [{ kind: 'currency', id: 'gold', amount: 1 }], grant: [{ kind: 'item', id: 'iron_bar', amount: 100 }] }];
  const hit = check(cheap).P.some((p) => p.startsWith('LOOP-1'));
  if (!hit) { console.error('SELFTEST FAILED: 100 iron bars for 1g did not open a loop'); process.exit(1); }
  console.log('SELFTEST PASS shop-craft-loop: a planted 1g stack of 100 iron bars is caught as a loop.');
} else {
  const { P, priced } = check();
  if (P.length) { console.error('✗ shop-craft-loop: ' + P.length + ' loop(s)\n  ' + P.join('\n  ')); process.exit(1); }
  if (priced < 1) { console.error('✗ shop-craft-loop: no recipe is fully shop-buyable — the guard is checking nothing'); process.exit(1); }
  console.log(`✓ shop-craft-loop: ${priced} fully shop-buyable recipe(s), none vendors for more than its inputs cost`);
}
