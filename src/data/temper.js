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
/* TIER 7, DAWNSTEEL, WORN FROM 88 (Tyler 2026-11-16 "yes": its own ladder, so the sink keeps growing from Level 88 to 110; designer,
   lane/d-temper-dawnsteel; the measured table is PRIORITY_BOARD "2026-11-16 Tempering Dawnsteel"). Both tracks: Lord Krell drops a Dawnsteel
   weapon for every way to fight and the helm and body in every weight, and Carter's Rest the rest of the set. SMALLER RUNGS, 0.4% each and 2% a
   track (TEMPER_TIER_RUNG_PM): past Dawnsteel there is no tier 8, the next armor is the armor line's (src/data/armor-line.js), and its first
   piece above Dawnsteel is worn from 122 at only x1.11. 2% is the largest round step at which full Dawnsteel, fully tempered, still lets more
   through than the line's bare set worn from 122, for every weight on every drafted ground at or past 122 (measured,
   `node tools/balance-sim/temper-dawn-table.mjs next`: thinnest leather at Wyvern Roost, 0.45%; at 2.5% it is -0.06%). A piece worn from 110
   carries Dawnsteel's own armor (the line's anchor), so a unique there wins by its attribute and by its own band's bigger ladder (2.5%), never
   by its bare armor. Guarded, tests/temper-uniques.mjs TU6. THE GOLD (`temper-dawn-table.mjs gold`, a lone tank where the game sends it, Krell's
   Hold from 88 to 110): 260 hours, 5.66M banked. Both tracks ask 2.48M, 44% (tiers 2 to 6 ask 40% to 52%), more than tier 6's 992k and a
   track under the 110 band's 1.86M. */
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
   Designer, lane/d-temper-uniques; the measured table is PRIORITY_BOARD "2026-11-15 Tempering past Dawnsteel".

   WHY A BAND, NOT A TIER. Every piece past Dawnsteel carries `tier: 7` (the armor line past Dawnsteel: no tier 8, Tyler 2026-11-14), so a ladder
   keyed on the tier would be one ladder for every unique from Level 110 to 200 and the sink would stop growing again. A ladder is keyed on
   the BAND the piece is worn from instead: its Level requirement, floored to the band's first Level. The key is that Level ('temper:armor:165'),
   a number no gear tier will ever reach, so the server's catalogue, hr_temper_view and the perks map read it as they read a tier.

   WHAT IT IS. Armor only (the line moves armor; weapons, shields and capes have no line, so there is no Blows ladder here). Five rungs as the
   tiers, half the step: 0.5% less of what reaches the hero a rung, 2.5% a ladder (TEMPER_UNIQUE_RUNG_PM). Same hook, same cap: it is the chain's
   last step and never passes the total mitigation cap: a plate set on the line sits near the 60% cap, so there it takes 1.5% to 2.1% off, not
   2.5%. WHY 2.5%: it is the largest round step at which a fully tempered set a band behind still lets more through than the next band's bare
   set, for every weight on every drafted ground (measured, `node tools/balance-sim/temper-uniques-table.mjs next`: thinnest 0.43%, leather
   110 against 125 at Wyvern Roost; at 3% that pair goes to -0.09%, at 4% plate breaks too). Guarded, tests/temper-uniques.mjs.

   THE GOLD, BY BAND (measured, `temper-uniques-table.mjs gold`: a lone sword-and-shield tank on Normal, on the line with Krell's Tollgate, the
   guide food, 4 seeds x 2 h at the floor, middle and top of every drafted ground past Dawnsteel, as lane/d-audit-balance-2 priced tiers 4 to 6):
   the hero banks 4.00M from 110 to 125 (175 h), 5.82M from 125 to 145 (295 h), 7.95M from 145 to 165 (355 h, read on the Roost: the Bellows
   is not drafted) and 5.24M from 165 to 185 (338 h; the Vaults' floor eats 21k g/h of Salted Lobster). Each ladder doubles as the tiers do and
   asks 1.86M, 2.48M, 3.10M and 3.10M: 47%, 43%, 39% and 59% of its band (tiers 2 to 6 ask 40% to 52%). The 165 ladder holds level with 145
   rather than drop under it: a later ladder never costs less than an earlier one. A new region past the last band is a new row here.

   HIDDEN. A band is sold only when `open` is true, and a band opens when its first piece is a real item (tests/temper-uniques.mjs TU-OPEN holds
   the two together both ways). Today no piece past Dawnsteel is in ITEMS (the armor line's sample is a hidden row set), so every band is shut:
   TEMPER_UNLOCKS and TEMPER_OFFERS below are exactly what they were and no catalogue moves. The fight reads every band (it is the rule; a hero
   can only hold a rung the server sold), so the simulator can measure a band before it opens. */
export const TEMPER_UNIQUE_FROM = 110;
export const TEMPER_UNIQUE_RUNG_PM = 5;
export const TEMPER_UNIQUE_BANDS = Object.freeze({
  110: Object.freeze({ open: false, gold: Object.freeze([60000, 120000, 240000, 480000, 960000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  125: Object.freeze({ open: false, gold: Object.freeze([80000, 160000, 320000, 640000, 1280000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  145: Object.freeze({ open: false, gold: Object.freeze([100000, 200000, 400000, 800000, 1600000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
  165: Object.freeze({ open: false, gold: Object.freeze([100000, 200000, 400000, 800000, 1600000]), qty: Object.freeze([10, 20, 40, 80, 160]) }),
});
/* The material: the smith's best salt, the one tier 6 already takes (no new item; Smithing 75 from Emberstone Ore and Grave Dust, or
   Crafting 75 from a Runewood Plank and Grave Dust; Grave Dust drops at the Ox Road and the Pauper Vaults as well as the March). */
export const TEMPER_UNIQUE_ITEM = 'ember_temper_salts';

const UNIQUE_BAND_LEVELS = Object.keys(TEMPER_UNIQUE_BANDS).map(Number).sort((a, b) => a - b);

/** The ladder a worn piece reads: its band's first Level for armor past Dawnsteel (tier 7 or more, worn from Level 110 or more), else its gear tier. */
export function temperTierOf(it) {
  if (!it) return 0;
  const lv = Number(it.reqLv);
  if (it.armourClass && it.slot && Number(it.tier) >= 7 && lv >= TEMPER_UNIQUE_FROM) {
    let band = 0;
    for (const b of UNIQUE_BAND_LEVELS) if (b <= lv) band = b;
    return band;
  }
  return it.tier;
}

/** A ladder's shape: { rungs, pm } (rungs on the ladder, permille a rung), or null where there is none. */
export function temperLadder(track, tier) {
  if (TEMPER_TIERS[tier]) return { rungs: TEMPER_RUNGS, pm: TEMPER_TIER_RUNG_PM[tier] || TEMPER_RUNG_PM };
  const u = track === 'armor' ? TEMPER_UNIQUE_BANDS[tier] : null;
  return u ? { rungs: u.gold.length, pm: TEMPER_UNIQUE_RUNG_PM } : null;
}

export const temperUnlockId = (track, tier) => 'temper:' + track + ':' + tier;
export const temperOfferId = (track, tier, rung) => 'temper.' + track + '.' + tier + '.' + rung;

const tiers = Object.keys(TEMPER_TIERS).map(Number);
/* The unique bands the smith sells today: only the open ones (none until a piece past Dawnsteel is a real item). */
const openBands = UNIQUE_BAND_LEVELS.filter((b) => TEMPER_UNIQUE_BANDS[b].open);

/** The hr_unlocks rows: one MAX-merge ladder per track and tier, written only by the spend RPC (kind 'unlock'). */
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
