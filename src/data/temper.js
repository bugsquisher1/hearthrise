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
/* TIERS 4 TO 6, PRICED BY THE LEVEL THE GEAR IS WORN AT (designer 2026-11-15, lane/d-audit-balance-2; the playthrough audit's F17 and F20, on
   lane/d-audit-balance-1's proposal). The Barrow March has worn Mithril, Rune and Emberforged since v0.2.132 and the smith had no rungs for
   them, so from Level 45 to 88 no gold sink grew with the hero. MEASURED on one hero's life (`node tools/balance-sim/audit-table.mjs sinks`,
   a sword and shield hero sent where the game sends it, every drop sold): it banks 1.10M from Level 45 to 60, 1.77M from 60 to 75 and
   1.89M from 75 to 90. Both tracks of a tier ask 496k, 744k and 992k: 45%, 42% and 52% of the band's gold, where tiers 2 and 3 ask 40% and
   45% of theirs. Same 1% a rung and 5% a track (TEMPER_RUNG_PM), so the next tier still wins (tests/hunt-core/temper-play.mjs). Tier 7
   (Krell's pieces, worn at 88) has no ladder: his prize holds no weapon, so its Blows track would be a row nothing wears. */
export const TEMPER_TIERS = Object.freeze({
  2: Object.freeze([2000, 4000, 8000, 16000, 32000]),
  3: Object.freeze([7000, 14000, 28000, 56000, 112000]),
  4: Object.freeze([8000, 16000, 32000, 64000, 128000]),
  5: Object.freeze([12000, 24000, 48000, 96000, 192000]),
  6: Object.freeze([16000, 32000, 64000, 128000, 256000]),
});

/* WHAT EACH RUNG ALSO TAKES (Tyler 2026-11-05: "require some sort of crafting in order to temper gear"): a crafted material of that tier, bought with the gold in one sale
   (hr_unlock_buy, from the hero's bag and then the account's Storage). A whole tier takes 3 to 5 hours of a resting hero's work, under a tenth of the hours its gold takes to
   earn, and no coal (the measured table, PRIORITY_BOARD 2026-11-05). */
export const TEMPER_MATERIALS = Object.freeze({
  2: Object.freeze({ item: 'temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
  3: Object.freeze({ item: 'fine_temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
  /* One salt a tier, mixed at the Smithing level its metal opens at (45, 60, 75), from that metal and the March's Grave Dust: no coal in
     any of them (src/data/recipes.js mix_mithril_temper_salts and its two sisters carry the why). Or packed at Crafting's same level from
     that tier's planks and the dust (pack_mithril_temper_salts and its sisters): the forge or the workbench, the player's call. */
  4: Object.freeze({ item: 'mithril_temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
  5: Object.freeze({ item: 'rune_temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
  6: Object.freeze({ item: 'ember_temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
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
