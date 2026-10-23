// ════════════════════════════════════════════════════════════════════════
// src/data/loot-bands.js — THE FIVE LOOT BANDS (game-designer loot redesign,
// approved by Tyler 2026-10-23: "trust the designer's gut")
//
// Every drop row of a converted ground names its `band` (src/data/monsters.js);
// the roller reads it (src/core/drops.js bandOf). A band is a PROMISE IN HOURS
// of hunting per hero at the ground's floor, not a fixed chance: a row's `ch`
// is tuned on the real settle until its band's target holds, and
// tests/hunt-core/drop-tables.mjs measures it every run.
//
//   common    over 15% a kill: creature parts and bones; each sells or feeds a
//             bench. The kill's loot line.
//   uncommon  5% to 15% a kill: the monster's imbuement item. The loot line.
//   scarce    each piece about every hour: the ground's own-tier armour in all three
//             weights (each monster one slot, in heavy, medium and light) and
//             the weapons its creatures carry. Split round-robin in a party.
//   rare      each item every 10-20 h: next-tier pieces, named pieces, the
//             carrier's trophies. The reveal, and the party's rare roll.
//   trophy    every 100-150 h, bosses only, the boss's LAST row: one named
//             prize per boss. The reveal.
//
// Rows sit on a monster in this order, so a row added to a later band (a
// boss's trophy) never moves an earlier row's draw on the seeded stream.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/** The bands, in the order a monster's rows list them. */
export const LOOT_BANDS = Object.freeze(['common', 'uncommon', 'scarce', 'rare', 'trophy']);

/** The bands the server reveals (a `rare_drop` event) and the party's rare roll decides. */
export const REVEAL_BANDS = Object.freeze(['rare', 'trophy']);

/* Each band's promise. `odds` = (above, max] a kill; `hours` = [min, max] expected hours per piece per hero at the
   ground's floor, for rows at or under `oddsMax` a kill (an hours band is never a common). */
const odds = (above, max) => Object.freeze({ odds: Object.freeze([above, max]) });
const hours = (min, max) => Object.freeze({ hours: Object.freeze([min, max]), oddsMax: 0.05 });
/* Scarce: about ONE piece an hour per slot per armour weight (Tyler 2026-10-23, replacing the draft's 1-3 h), held to
   [0.75, 1.5] h so a re-tune moves odds, not the band. PROVISIONAL with every loot number (Tyler 2026-10-23): re-tuned
   once combat is balanced and the economy sims run again; the guards hold whatever the numbers become. */
export const BAND_TARGETS = Object.freeze({
  common: odds(0.15, 1),
  uncommon: odds(0.05, 0.15),
  scarce: hours(0.75, 1.5),
  rare: hours(10, 20),
  trophy: hours(100, 150),
});

/* WHAT WORN GEAR SELLS FOR (Tyler 2026-10-23: keep the Scarce pace and meet the value caps through what dropped gear
   sells for). The trader pays this share of a weapon's, armour's, off-hand's or jewel's book value (`v`), floored at 1,
   one price per item wherever it came from; the shop buy-back cap still applies on top
   (supabase/functions/hr-accrue/catalogue.js vendorPriceOf). Book value itself is untouched. Measured against the caps
   (gear at most half the coin, total value at most +25%) by tests/hunt-core/drop-tables.mjs. PROVISIONAL. */
export const VENDOR_GEAR_RATE = 0.5;
export const VENDOR_GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand', 'jewelry']);
