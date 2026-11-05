// ============================================================================
// src/data/temper.js — TEMPERING, AS DATA: WHAT THE TOWN'S SMITH SELLS (Tyler 2026-11-04: "some sort of upgrade
// system that slightly increases gear power"; designer's table, PRIORITY_BOARD 2026-11-05).
//
// A hero pays gold to temper what it wears. Two tracks, Blows and Armor; five rungs a track; ONE LADDER PER GEAR
// TIER, so power can't compound and the next tier always wins: Steel starts at rung 0, and Iron's rungs still count on
// Iron. Tier 1 has no ladder, so the first hours aren't touched. Nothing is rolled, nothing fails, nothing wears out and
// nothing is lost on a death or a sale. A rung sits on the hero, never on a piece: items are stacks by id and still trade.
//
// A new gear tier is a new row in TEMPER_TIERS. Bookkeeping only: the magnitude is read by src/core/temper.js, and
// Postgres gets the prices through tools/gen-temper.mjs into hr_unlocks and hr_unlock_offers, sold by hr_unlock_buy.
// The gold is lane/d-gold-sinks' final table.
//
// PURE ESM, no imports, no I/O. Node, Deno and the browser read it verbatim.
// ============================================================================

export const TEMPER_RUNGS = 5;
/* What a rung is worth, in permille: 1% harder blows and heals, or 1% less damage reaching the hero. 5% at most. */
export const TEMPER_RUNG_PM = 10;
export const TEMPER_TRACKS = Object.freeze(['blows', 'armor']);
/* The gold of each rung, by gear tier (gear-tiers.js: Iron, Studded and Adept are tier 2, worn at Level 15; Steel, Boarhide and Scholar tier 3, at Level 30). */
export const TEMPER_TIERS = Object.freeze({
  2: Object.freeze([2000, 4000, 8000, 16000, 32000]),
  3: Object.freeze([7000, 14000, 28000, 56000, 112000]),
});

/* WHAT EACH RUNG ALSO TAKES (Tyler 2026-11-05: "require some sort of crafting in order to temper gear"): a crafted material of that tier, bought with the gold in one sale
   (hr_unlock_buy, from the hero's bag and then the account's Storage). Each rung asks about 8% of the hours its gold takes to earn (PRIORITY_BOARD 2026-11-05). */
export const TEMPER_MATERIALS = Object.freeze({
  2: Object.freeze({ item: 'temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
});

export const temperUnlockId = (track, tier) => 'temper:' + track + ':' + tier;
export const temperOfferId = (track, tier, rung) => 'temper.' + track + '.' + tier + '.' + rung;

const tiers = Object.keys(TEMPER_TIERS).map(Number);

/** The hr_unlocks rows: one MAX-merge ladder per track and tier, written only by the spend RPC (kind 'unlock'). */
export const TEMPER_UNLOCKS = Object.freeze(TEMPER_TRACKS.flatMap((track) => tiers.map((tier) => Object.freeze({
  unlock_id: temperUnlockId(track, tier), namespace: 'temper', merge: 'max', progress_kind: 'unlock', max_value: TEMPER_RUNGS,
  rungs: Object.freeze(Array.from({ length: TEMPER_RUNGS }, (_, i) => i + 1)),
}))));

const itemsOf = (tier, i) => (TEMPER_MATERIALS[tier] ? Object.freeze({ [TEMPER_MATERIALS[tier].item]: TEMPER_MATERIALS[tier].qty[i] }) : Object.freeze({}));

/** The hr_unlock_offers rows, exactly its columns: the price of every rung. */
export const TEMPER_OFFERS = Object.freeze(TEMPER_TRACKS.flatMap((track) => tiers.flatMap((tier) => TEMPER_TIERS[tier].map((gold, i) => Object.freeze({
  offer_id: temperOfferId(track, tier, i + 1), table_name: 'temper', name: 'Temper ' + track + ', tier ' + tier + ', rung ' + (i + 1),
  unlock_id: temperUnlockId(track, tier), value: i + 1, gold, items: itemsOf(tier, i), req_property_tier: 0,
})))));

/** The offer-id set the Edge may forward to hr_unlock_buy (supabase/functions/hr-accrue/gold-ladder-catalogue.js). */
export const TEMPER_OFFER_IDS = Object.freeze(TEMPER_OFFERS.map((r) => r.offer_id));
