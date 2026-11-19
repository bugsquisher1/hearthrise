// ============================================================================
// tools/balance-sim/staged/luck.js — LUCK, THE PROPOSED PERMANENT RARE-DROP BONUS, AS DATA AND ONE FORMULA
// (designer, 2026-11-19; Tyler the same night: "You know what I'm just now realizing I loved in old games. Permanent magic find buffs.").
// A PROPOSAL for docs/design/itemization-plan.md. Tyler approves before anything is built.
//
// WHAT IT IS. One number per account that only goes up. Every creature has six Bestiary stages (kill totals, the counters the
// settle already writes: `ev:kill_monster:<id>`). Each stage an account reaches is +1 Luck. Luck raises the chance of the two
// REVEAL bands, Rare and Trophy, on every hunted kill, by
//
//     bonus (permille) = floor( LUCK_CAP_PM x Luck / (Luck + LUCK_HALF) )
//
// so the first points are worth the most, it never stops rising, and it can never pass LUCK_CAP_PM. Nothing else moves: common and
// uncommon rows (crafting stock), Scarce gear (the hourly pace and its coin), keys, gem chips, a keyed hall's daily prize, the Hearth
// Chest, coin and XP all roll as they do today.
//
// WHY THESE NUMBERS.
//   stages   the four the Bestiary already has (2,500 / 5,000 / 10,000 / 20,000, src/data/bestiary.js TROPHY_STAGES) and two early
//            ones (100, 500) so a new account's first hours tick. Each costs more kills than the last: the diminishing return is in
//            the ladder, where a player can see it.
//   cap      250 permille: Tyler's own ceiling for a fully studied boss's relic (2026-10-19, src/data/loot-bands.js trophy boostMax 1.25),
//            which is why Trophy rows sit at 125-150 h. Luck takes that seat, so no band's promise moves.
//   half     100 Luck is half the cap. Measured on played lives (luck-measure.mjs): a lone hero holds about that many at 500 hunted hours.
//
// DERIVED, NEVER STORED. Luck is a pure function of server kill counters. There is no Luck item, currency, column or purchase, so
// there is nothing to buy, trade or forge.
//
// HIDDEN. Nothing in src/ reads this file; tools/balance-sim/staged/luck-measure.mjs does. PURE ESM. Imports nothing.
// ============================================================================

/** The kill totals against ONE creature that each add 1 Luck, ascending. */
export const LUCK_STAGES = Object.freeze([100, 500, 2500, 5000, 10000, 20000]);

/** The bonus can never pass this (permille). The formula clamps to it. */
export const LUCK_CAP_PM = 250;

/** The Luck at which the bonus is half the cap. */
export const LUCK_HALF = 100;

/** The loot bands Luck moves (src/data/loot-bands.js REVEAL_BANDS). */
export const LUCK_BANDS = Object.freeze(['rare', 'trophy']);

/** Stages held against one creature at `kills`. */
export function stagesAt(kills) {
  const n = Math.floor(Number(kills) || 0);
  let s = 0;
  for (const at of LUCK_STAGES) if (n >= at) s += 1;
  return s;
}

/** An account's Luck: stages held over `roster` (creature ids), from `{ id: kills }` (own-property reads only). */
export function luckOf(killsById, roster) {
  let luck = 0;
  for (const id of roster) luck += stagesAt(killsById && Object.prototype.hasOwnProperty.call(killsById, id) ? killsById[id] : 0);
  return luck;
}

/** The bonus in permille at `luck`, 0..LUCK_CAP_PM. Integer, so the server and the sheet show one number. */
export function luckPm(luck) {
  const l = Math.max(0, Math.floor(Number(luck) || 0));
  return Math.min(LUCK_CAP_PM, Math.floor((LUCK_CAP_PM * l) / (l + LUCK_HALF)));
}

/** The multiplier a Rare or Trophy row's chance takes at `luck`. */
export const luckMult = (luck) => 1 + luckPm(luck) / 1000;
