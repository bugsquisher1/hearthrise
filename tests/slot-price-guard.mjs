#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/slot-price-guard.mjs — THE FIRST HERO SLOT STAYS WITHIN ONE LONE HERO'S BANK (Tyler 2026-11-20, balance call 24-9: "i think hero
//   slots should cost even more"; the designer's guard, docs/design/balance-program/24-economy.md "Q9 after Tyler's ruling", and the
//   balance gate G9 in 30-plan.md §E, which turns red in L06).
//
// The second hero is the door from the lone game to the party game, so its price may rise only as far as one hero alone can bank by the
// time it may walk into the party grounds: the end of the Level the Coppercap Warrens opens at (src/data/hunts.js `coppercap_warrens`
// band[0], 32 today), on the balance program's lone bank table (tools/balance-program/lone-bank.mjs, the table
// `node tools/balance-program/gold-model.mjs --slots` prints). The later slots climb freely. Read from data, so a re-cut income table, a
// moved Warrens or a dearer slot each re-judge it:
//   SP-1  src/data/shops.js sells the three slots (character_slot.1-.3), each for gold alone, each dearer than the one before
//   SP-2  the first one (the second hero) costs at most bankThrough(the Warrens' floor) gold
//
//   node tests/slot-price-guard.mjs              the guard
//   node tests/slot-price-guard.mjs --selftest   every planted defect must turn it red
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { SHOP_OFFERS } from '../src/data/shops.js';
import { HUNTS } from '../src/data/hunts.js';
import { BANK, bankThrough } from '../tools/balance-program/lone-bank.mjs';

/** The ground whose floor opens the party game (24-economy.md Q9: "the Level the party grounds open (Coppercap Warrens, 32)"). */
export const PARTY_GROUND = 'coppercap_warrens';

/** The problems with a slot ladder against a lone hero's bank, as sentences. Empty = green. Pure. */
export function problemsOf({ offers = SHOP_OFFERS, hunts = HUNTS, bank = BANK } = {}) {
  const out = [];
  const slots = offers.filter((o) => o && o.table === 'character_slot');
  const ids = slots.map((o) => o.id).sort();
  if (ids.join() !== 'character_slot.1,character_slot.2,character_slot.3') out.push(`SP-1: src/data/shops.js sells hero slots ${ids.join(', ') || 'none'}, not character_slot.1-.3`);
  const gold = (id) => {
    const o = slots.find((x) => x.id === id);
    const c = o && Array.isArray(o.cost) ? o.cost : [];
    return c.length === 1 && c[0].kind === 'currency' && c[0].id === 'gold' && Number.isSafeInteger(c[0].amount) && c[0].amount > 0 ? c[0].amount : null;
  };
  const prices = [1, 2, 3].map((i) => gold('character_slot.' + i));
  prices.forEach((p, i) => { if (p === null) out.push(`SP-1: character_slot.${i + 1} is not priced in gold alone`); });
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] !== null && prices[i - 1] !== null && !(prices[i] > prices[i - 1])) out.push(`SP-1: character_slot.${i + 1} (${prices[i]}) is not dearer than character_slot.${i} (${prices[i - 1]})`);
  }
  const ground = hunts.find((h) => h && h.id === PARTY_GROUND);
  const floor = ground && Array.isArray(ground.band) && Number.isInteger(ground.band[0]) && ground.band[0] >= 1 ? ground.band[0] : null;
  if (floor === null) { out.push(`SP-2: src/data/hunts.js has no ${PARTY_GROUND} with a Level floor: the guard has no line to hold`); return out; }
  const line = bankThrough(floor, bank);
  if (!(line > 0)) out.push(`SP-2: the lone bank table reads ${line} gold through Level ${floor}: the guard has no line to hold`);
  else if (prices[0] !== null && prices[0] > line) {
    out.push(`SP-2: the second hero costs ${prices[0].toLocaleString('en-US')} gold, over the ${line.toLocaleString('en-US')} one lone hero banks through Level ${floor} `
      + `(the ${ground.name} floor): the lone game would end in the price, not the party (Tyler 2026-11-20, call 24-9)`);
  }
  return out;
}

const slotAt = (offers, id, amount) => offers.map((o) => (o.id === id ? { ...o, cost: [{ kind: 'currency', id: 'gold', amount }] } : o));
export const MUTANTS = Object.freeze({
  first_slot_ladder_b: { why: 'the first slot at ladder B (600,000): one hero to Level 37 alone', in: () => ({ offers: slotAt(SHOP_OFFERS, 'character_slot.1', 600000) }) },
  first_slot_one_over: { why: 'the first slot one gold over the line', in: () => ({ offers: slotAt(SHOP_OFFERS, 'character_slot.1', bankThrough(HUNTS.find((h) => h.id === PARTY_GROUND).band[0]) + 1) }) },
  income_recut: { why: 'income re-cut by a third and the slot left where it was', in: () => ({ bank: BANK.map(([l, g]) => [l, Math.floor(g * 2 / 3)]) }) },
  party_ground_earlier: { why: 'the Warrens open at Level 25, under the bank the slot was sized on', in: () => ({ hunts: HUNTS.map((h) => (h.id === PARTY_GROUND ? { ...h, band: [25, h.band[1]] } : h)) }) },
  party_ground_gone: { why: 'the Warrens leave the data: no line to hold', in: () => ({ hunts: HUNTS.filter((h) => h.id !== PARTY_GROUND) }) },
  ladder_falls: { why: 'the fourth hero cheaper than the third', in: () => ({ offers: slotAt(SHOP_OFFERS, 'character_slot.3', 1000000) }) },
  slot_in_crowns: { why: 'a slot priced in something other than gold', in: () => ({ offers: SHOP_OFFERS.map((o) => (o.id === 'character_slot.2' ? { ...o, cost: [{ kind: 'currency', id: 'gems', amount: 500 }] } : o)) }) },
  slot_missing: { why: 'the third hero is no longer sold', in: () => ({ offers: SHOP_OFFERS.filter((o) => o.id !== 'character_slot.2') }) },
});

function selftest() {
  const clean = problemsOf();
  if (clean.length) { console.error('slot-price-guard --selftest: the tree is not green:\n  ' + clean.join('\n  ')); return 2; }
  let missed = 0;
  for (const [id, m] of Object.entries(MUTANTS)) {
    const hit = problemsOf(m.in()).length > 0;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'} ${id}: ${m.why}`);
    if (!hit) missed++;
  }
  if (missed) { console.error(`slot-price-guard --selftest: ${missed} of ${Object.keys(MUTANTS).length} planted defects stayed green`); return 1; }
  console.log(`slot-price-guard --selftest: ${Object.keys(MUTANTS).length}/${Object.keys(MUTANTS).length} planted defects caught`);
  return 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const problems = problemsOf();
  const floor = HUNTS.find((h) => h.id === PARTY_GROUND)?.band?.[0];
  if (problems.length) { console.error('slot-price-guard RED:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`slot-price-guard: green. The second hero costs ${SHOP_OFFERS.find((o) => o.id === 'character_slot.1').cost[0].amount.toLocaleString('en-US')} gold, `
    + `within the ${bankThrough(floor).toLocaleString('en-US')} one lone hero banks through Level ${floor}; the ladder climbs.`);
}
