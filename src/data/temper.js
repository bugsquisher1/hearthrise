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
   45% of theirs. Same 1% a rung and 5% a track (TEMPER_RUNG_PM), so the next tier still wins (tests/hunt-core/temper-play.mjs). */
/* TIER 7, DAWNSTEEL, WORN FROM 88 (Tyler 2026-11-16 "yes": its own ladder, so the sink keeps growing from Level 88 to 110; designed on
   lane/d-temper-dawnsteel, built here by lane/d-gold-sinks 2026-11-18; the measured table is PRIORITY_BOARD "2026-11-18 Gold by band").
   Both tracks: Lord Krell drops a Dawnsteel weapon for every way to fight and the helm and body in every weight. SMALLER RUNGS, 0.4% each and
   2% a track (TEMPER_TIER_RUNG_PM; Tyler 2026-11-15/16: a SMALL cap past Dawnsteel, about +2-3%): there is no tier 8, and the armor past
   Dawnsteel (the armor line's hidden sample, read by its guard, never imported here) starts only about 11% over it, so a bigger Dawnsteel ladder would out-hold what comes
   next (the design's measure: 2.5% failed it by 0.06%). THE GOLD is the design's (both tracks 2.48M, priced at 44% of a lone tank's 5.66M
   before the 11-16 income dial). RE-MEASURED on v0.2.138 (`node tools/balance-sim/audit-table.mjs gold --to 110 --style <s>`, one hero's life
   where the game sends it, every drop sold, Krell's Hold from 88 to 110): a tank banks 0.91M, a hammer 2.63M, a bow 3.23M, a Mage 4.00M, so both
   tracks are 273% / 94% / 77% / 62% of the band (tiers 2 to 6 ask 41% to 115% of theirs, 55% to 73% for the mean hero). Kept: above most of a
   band's gold on purpose (Tyler 2026-11-18: "I want people to make choices on what is important to them"), never needed to progress. */
export const TEMPER_TIERS = Object.freeze({
  2: Object.freeze([2000, 4000, 8000, 16000, 32000]),
  3: Object.freeze([7000, 14000, 28000, 56000, 112000]),
  4: Object.freeze([8000, 16000, 32000, 64000, 128000]),
  5: Object.freeze([12000, 24000, 48000, 96000, 192000]),
  6: Object.freeze([16000, 32000, 64000, 128000, 256000]),
  7: Object.freeze([40000, 80000, 160000, 320000, 640000]),
});
/* A tier whose rung is worth less than TEMPER_RUNG_PM, in permille (Dawnsteel's 0.4%; the reason is above). */
export const TEMPER_TIER_RUNG_PM = Object.freeze({ 7: 4 });

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
  /* Dawnsteel takes the smith's best salt too (no new item): the tier-6 count, so a tier-7 track is about 3 hours of a resting hero's mixing. */
  7: Object.freeze({ item: 'ember_temper_salts', qty: Object.freeze([10, 20, 40, 80, 160]) }),
});

/* ── UNIQUE ARMOR PAST DAWNSTEEL (Tyler 2026-11-15, "ok then yes" to Tempering past tier 7: a PURE GOLD SINK on the unique armor past
   Dawnsteel with a SMALL cap, about +2-3% at most, sized with the simulator before anything is built; on the pre-EA Security list).
   Designed on lane/d-temper-uniques (PRIORITY_BOARD "2026-11-15 Tempering past Dawnsteel"), brought onto v0.2.139 by lane/d-late-items-rescue.

   WHY A BAND, NOT A TIER. Every piece past Dawnsteel carries `tier: 7` (no tier 8, Tyler 2026-11-14; the armor line past Dawnsteel),
   so a ladder keyed on the tier would be ONE ladder for every unique from Level 110 to 400 and the sink would stop growing again. A ladder is
   keyed on the BAND the piece is worn from instead: its Level requirement, floored to the band's first Level. The key is that Level
   ('temper:armor:165'), a number no gear tier will ever reach, so the server's catalogue, hr_temper_view and the perks map read it as they
   read a tier. A new band is a new row here (docs/design/itemization-plan.md §5: "then one a band").

   WHAT IT IS. Armor only (the armor line moves armor; a unique weapon's power is the weapon line's budget and has
   no ladder here). Five rungs, 0.5% less of what reaches the hero a rung, 2.5% a ladder (TEMPER_UNIQUE_RUNG_PM). Same hook, same cap: the
   chain's last step, never past the total mitigation cap. WHY 2.5%: the largest round step at which a fully tempered set a band behind
   still lets more through than the next band's bare set, for every weight on every drafted ground (measured,
   `node tools/balance-sim/temper-uniques-table.mjs next`: thinnest 0.43%, leather 110 against 125 at Wyvern Roost; at 3% that pair
   crosses). And Dawnsteel's whole ladder (2%) stays under the first band's (2.5%), so a unique worn from 110, which carries Dawnsteel's own
   armor on the line, wins once each is tempered. Guarded, tests/temper-uniques.mjs.

   THE GOLD, BY BAND (`temper-uniques-table.mjs gold`, a lone sword-and-shield tank on Normal on the line, the guide food, at the floor,
   middle and top of every drafted ground past Dawnsteel, measured 2026-11-15 before the 11-16 income dial): each ladder doubles as the tiers
   do, 1.86M, 2.48M, 3.10M and 3.10M; a later ladder never costs less than an earlier one. Tyler 2026-11-18: gear upgrades cost more than a
   band banks, on purpose ("I want people to make choices on what is important to them"); the prices are the design's until the designer
   re-prices them on today's gold.

   HIDDEN. A band is sold only when `open` is true, and a band opens when its first piece is a real item (tests/temper-uniques.mjs TU5 holds
   the two together both ways). No piece past Dawnsteel is in ITEMS (the armor line's sample is hidden), so every band is shut: TEMPER_UNLOCKS
   and TEMPER_OFFERS below are exactly what they were and no catalogue moves. The fight reads every band (it is the rule; a hero can only
   hold a rung the server sold), so the simulator can measure a band before it opens. */
export const TEMPER_UNIQUE_FROM = 110;
export const TEMPER_UNIQUE_RUNG_PM = 5;
export const TEMPER_UNIQUE_BANDS = Object.freeze({
  110: Object.freeze({ open: false, gold: Object.freeze([60000, 120000, 240000, 480000, 960000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  125: Object.freeze({ open: false, gold: Object.freeze([80000, 160000, 320000, 640000, 1280000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  145: Object.freeze({ open: false, gold: Object.freeze([100000, 200000, 400000, 800000, 1600000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  165: Object.freeze({ open: false, gold: Object.freeze([100000, 200000, 400000, 800000, 1600000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
});
/* The material: the smith's best salt, the one tiers 6 and 7 already take (no new item; Smithing 75 from Emberstone Ore and Grave Dust,
   or Crafting 75 from a Runewood Plank and Grave Dust). */
export const TEMPER_UNIQUE_ITEM = 'ember_temper_salts';

const UNIQUE_BAND_LEVELS = Object.keys(TEMPER_UNIQUE_BANDS).map(Number).sort((a, b) => a - b);

/** The ladder a worn piece reads: its band's first Level for armor past Dawnsteel (tier 7 or more, worn from Level 110 or more), else its gear tier. */
export function temperTierOf(it) {
  if (!it) return 0;
  /* a step tier's piece (src/data/gear-tiers.js STEP_TIERS, lane/gear-phase-b) is a base of the ladder past Dawnsteel, not a unique: it reads no
     unique band, and its rung number has no row here, so the old ladders are shut on it. Its Temper is Temper on steps (src/core/temper-steps.js) */
  if (Number.isInteger(it.step)) return it.tier;
  const lv = Number(it.reqLv);
  if (it.armourClass && it.slot && Number(it.tier) >= 7 && lv >= TEMPER_UNIQUE_FROM) {
    let band = 0;
    for (const b of UNIQUE_BAND_LEVELS) if (b <= lv) band = b;
    return band;
  }
  return it.tier;
}

/** A ladder's shape: { rungs, pm } (rungs on the ladder, permille a rung), or null where there is none. The fight, the window and the guards read
    a rung's worth here, never TEMPER_RUNG_PM alone. A unique band is an Armor ladder only. */
export function temperLadder(track, tier) {
  if (!TEMPER_TRACKS.includes(track)) return null;
  if (TEMPER_TIERS[tier]) return { rungs: TEMPER_RUNGS, pm: TEMPER_TIER_RUNG_PM[tier] || TEMPER_RUNG_PM };
  const u = track === 'armor' ? TEMPER_UNIQUE_BANDS[tier] : null;
  return u ? { rungs: u.gold.length, pm: TEMPER_UNIQUE_RUNG_PM } : null;
}

export const temperUnlockId = (track, tier) => 'temper:' + track + ':' + tier;
export const temperOfferId = (track, tier, rung) => 'temper.' + track + '.' + tier + '.' + rung;

const tiers = Object.keys(TEMPER_TIERS).map(Number);
/* The unique bands the smith sells today: only the open ones (none until a piece past Dawnsteel is a real item). */
const openBands = UNIQUE_BAND_LEVELS.filter((b) => TEMPER_UNIQUE_BANDS[b].open);

/** The hr_unlocks rows: one MAX-merge ladder per track and tier (and per open unique band, Armor only), written only by the spend RPC (kind 'unlock'). */
export const TEMPER_UNLOCKS = Object.freeze(TEMPER_TRACKS.flatMap((track) => tiers.map((tier) => Object.freeze({
  unlock_id: temperUnlockId(track, tier), namespace: 'temper', merge: 'max', progress_kind: 'unlock', max_value: TEMPER_RUNGS,
  rungs: Object.freeze(Array.from({ length: TEMPER_RUNGS }, (_, i) => i + 1)),
})).concat(track === 'armor' ? openBands.map((band) => Object.freeze({
  unlock_id: temperUnlockId(track, band), namespace: 'temper', merge: 'max', progress_kind: 'unlock', max_value: TEMPER_UNIQUE_BANDS[band].gold.length,
  rungs: Object.freeze(TEMPER_UNIQUE_BANDS[band].gold.map((_, i) => i + 1)),
})) : [])));

const itemsOf = (tier, i) => (TEMPER_MATERIALS[tier] ? Object.freeze({ [TEMPER_MATERIALS[tier].item]: TEMPER_MATERIALS[tier].qty[i] }) : Object.freeze({}));

/** The hr_unlock_offers rows, exactly its columns: the price of every rung. */
export const TEMPER_OFFERS = Object.freeze(TEMPER_TRACKS.flatMap((track) => tiers.flatMap((tier) => TEMPER_TIERS[tier].map((gold, i) => Object.freeze({
  offer_id: temperOfferId(track, tier, i + 1), table_name: 'temper', name: 'Temper ' + track + ', tier ' + tier + ', rung ' + (i + 1),
  unlock_id: temperUnlockId(track, tier), value: i + 1, gold, items: itemsOf(tier, i), req_property_tier: 0,
}))).concat(track === 'armor' ? openBands.flatMap((band) => TEMPER_UNIQUE_BANDS[band].gold.map((gold, i) => Object.freeze({
  offer_id: temperOfferId(track, band, i + 1), table_name: 'temper', name: 'Temper unique armor worn from Level ' + band + ', rung ' + (i + 1),
  unlock_id: temperUnlockId(track, band), value: i + 1, gold, items: Object.freeze({ [TEMPER_UNIQUE_ITEM]: TEMPER_UNIQUE_BANDS[band].qty[i] }), req_property_tier: 0,
}))) : [])));

/** The offer-id set the Edge may forward to hr_unlock_buy (supabase/functions/hr-accrue/gold-ladder-catalogue.js). */
export const TEMPER_OFFER_IDS = Object.freeze(TEMPER_OFFERS.map((r) => r.offer_id));

/* ── TEMPER ON STEPS (systems, lane/flame-temper-build, 2026-11-22; docs/design/redesign/21-flame-temper-imbue-loot.md section 2, 19 L11) ──
   THE RULE THAT REPLACES THE RUNGS ON THE SCALE. The smith tempers a hero's GEAR SLOT, never a piece: five ranks a slot, each +1 item Level
   (ilPerRank) on whatever the slot wears, slot-weighted inside the gear part (src/core/hunt/danger.js gearPartPm; GEAR_STEPS.slotPm), so a
   whole kit at rank 5 is +5 steps (src/data/power-ledger.js temperStepsMax). Rank r opens at hero Level rankEvery x r (40, 80, 120, 160,
   200: 21 D-2). It never counts for the wear check. A rank never leaves the hero: not on a death, a sale, a swap or a listing.
   SEATED ON A TIER. A slot's ranks sit on the tier they were bought or re-seated on. A piece of a HIGHER tier in that slot leaves them
   unseated (they count 0) until re-seated for carryPm x the ranks' full price at the new item step (D-3); the same or a lower tier keeps
   them seated.
   THE PRICE, in hours of wage at the worn piece's item Level (src/data/wage.js wage): a full slot is hoursPm x 13 slots x slotPm / 1000
   (a whole kit 39 hours, weapon 7.8, a ring 1.95); rank r takes r / 15 of it (1 + 2 + 3 + 4 + 5). kitSharePm of it is Temper Kits
   (Smithing goods, 09 chain 3), the rest a fee in gold, burned. A kit is kitHoursPm of wage: ASSUMED (0.1 h), owed with the kit's recipe.
   kitItem null: the kit is not an item yet, so the server refuses a rank (`kits_owed`) until it is: no rank is sold for gold alone.
   STARTING VALUES (21 section 2.2 levers; the Lab moves them in band): rankEvery 40 (30 to 50), hoursPm 3000 (2 to 4 hours a piece),
   kitSharePm 500 (300 to 700), carryPm 350 (250 to 500).
   The server's catalogue (hr_temper_rules, hr_temper_slots) is written from this by tools/gen-flame-temper.mjs. Behind the hr_flags
   switch `temper_steps` (off at apply): the old rungs above stay the smith's offer until it flips. */
export const TEMPER_STEPS = Object.freeze({
  ranks: 5,
  ilPerRank: 1,
  rankEvery: 40,
  hoursPm: 3000,
  kitSharePm: 500,
  carryPm: 350,
  kitHoursPm: 100,
  kitItem: null,
});
