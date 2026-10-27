// ════════════════════════════════════════════════════════════════════════
// src/data/consumables.js — FOOD AND DRINK IN A HUNT (HUNT_SCREEN_SPEC §3.4)
//
// Food restores HP. Drink restores mana. There are no potions (Tyler
// 2026-10-16). Half of a food or drink lands at once and half over six
// seconds (Tyler 2026-10-16; week plan item 7). Food and drink share ONE
// lane (Combat Design Bible §9.1). The hero's own stack goes first and costs
// nothing; then the store's row for the hunt's tier, at store price; the hunt
// never stops for lack of stock (gold_out still ends it).
//
// THE ROWS ARE DERIVED, never retyped. An own FOOD is every heal line the bag
// may carry (src/data/supplies.js, its HP read from items.js); an own DRINK is
// every staged drink (src/data/drinks.js, its mana read there); a STORE row is
// a shop supply (src/data/supply-basics.js). Retuning a food stays one edit in
// items.js. The sim's Ham and Moonbloom tea were placeholders for exactly these
// ladders (19 cooked foods, 6 drinks); no second copy of either is authored.
//
// PURE ESM. Data only. Integer numbers only (ms, percent, HP, mana).
// ════════════════════════════════════════════════════════════════════════

import { SUPPLIES } from './supplies.js?v=0.2.57';
import { DRINK_ITEMS } from './drinks.js?v=0.2.57';
import { BASIC_SUPPLIES } from './supply-basics.js?v=0.2.57';
import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.57';

/* The numbers. ASSUMED values (spec §5 #10) are marked; the rest are rulings. */
export const CONSUMABLE_RULES = Object.freeze({
  /* Half now (Tyler 2026-10-16). */
  instantPct: 50,
  /* The other half over 6 s (week plan item 7), one tick a second. */
  overTimeMs: 6000,
  overTimeTickMs: 1000,
  /* The one shared food-and-drink cooldown: 2 s (Tyler 2026-10-19: "2 second global
     cooldown for food/drink is ideal, same cooldown"). */
  laneMs: 2000,
  /* Where a NEW food or drink slot's condition starts (ASSUMED; written on the slot, never applied behind
     it: conditions.js suggestedConditions; the per-hero eat-at / drink-at settings are retired, Tyler 10-23):
     drink under 30% mana, eat under 50% HP. */
  drinkBelowPct: 30,
  foodBelowPct: 50,
});

/* What each kind restores, and the supply kind it is stocked as. */
export const CONSUMABLE_KINDS = Object.freeze({
  food: Object.freeze({ stat: 'hp', supply: 'heal' }),
  drink: Object.freeze({ stat: 'mana', supply: 'mana' }),
});

const row = (id, kind, amount, source, price) => Object.freeze({ id, kind, amount, source, price });

/** id → { id, kind: 'food'|'drink', amount, source: 'own'|'store', price }. Null prototype. */
export const CONSUMABLES = Object.freeze([
  ...Object.values(SUPPLIES).filter((s) => s.kind === 'heal').map((s) => row(s.id, 'food', s.heals, 'own', 0)),
  ...Object.entries(DRINK_ITEMS).map(([id, d]) => row(id, 'drink', d.mana, 'own', 0)),
  ...BASIC_SUPPLIES.filter((b) => b.kind === 'heal' || b.kind === 'mana')
    .map((b) => row(b.id, b.kind === 'heal' ? 'food' : 'drink', b.kind === 'heal' ? b.heals : b.mana, 'store', b.price)),
].reduce((acc, r) => { acc[r.id] = r; return acc; }, Object.create(null)));

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const R = CONSUMABLE_RULES;
  for (const [k, v] of Object.entries(R)) if (!Number.isInteger(v) || v <= 0) out.push(k + ' must be a positive integer, got ' + v);
  if (R.instantPct > 100) out.push('instantPct is over 100');
  if (R.overTimeMs % R.overTimeTickMs !== 0) out.push('overTimeMs is not a whole number of ticks');
  for (const k of ['overTimeTickMs', 'laneMs']) {
    if (R[k] % HUNT_TUNING.stepMs !== 0) out.push(k + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  }
  for (const k of ['drinkBelowPct', 'foodBelowPct']) if (R[k] > 100) out.push(k + ' is over 100');
  for (const r of Object.values(CONSUMABLES)) {
    if (!CONSUMABLE_KINDS[r.kind]) out.push(r.id + ': kind ' + r.kind + ' is neither food nor drink (no potions)');
    if (!Number.isInteger(r.amount) || r.amount <= 0) out.push(r.id + ': restores ' + r.amount + ', not a positive integer');
    if (r.source === 'store' ? !(Number.isInteger(r.price) && r.price > 0) : r.price !== 0) out.push(r.id + ': price ' + r.price + ' does not fit its source ' + r.source);
  }
  return out;
}
