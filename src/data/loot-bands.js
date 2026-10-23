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
   sells for). The trader pays a share of a weapon's, armour's, off-hand's or jewel's book value (`v`), floored at 1,
   by the piece's TIER, one price per item wherever it came from; the shop buy-back cap still applies on top
   (supabase/functions/hr-accrue/catalogue.js vendorPriceOf). Book value itself is untouched. By tier because the pace is
   the same on every ground (about a piece an hour per slot per weight) while book value climbs 2-4x a tier and coin
   barely moves (DM-16): tier 3 sells at 0.12 so the Warrens' gear stays under half its coin, as tiers 1-2 do at 0.5.
   A tier above the table (no ground drops one yet) sells at its last rate; a piece with no tier at tier 1's. Measured
   against the caps by tests/hunt-core/drop-tables.mjs. PROVISIONAL. */
export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.12]);
export const VENDOR_GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand', 'jewelry']);

/** The share of book value the trader pays for `item` if it is worn gear, else 1. */
export function gearSaleRate(item) {
  if (!item || !VENDOR_GEAR_TYPES.includes(item.type)) return 1;
  const t = Math.max(1, Math.floor(Number(item.tier) || 1));
  return VENDOR_GEAR_RATES[Math.min(t, VENDOR_GEAR_RATES.length) - 1];
}
