// ============================================================================
// tools/balance-sim/staged/luck.js — LUCK, THE PROPOSED PERMANENT RARE-DROP BONUS, AS DATA AND ONE FORMULA
// (designer, 2026-11-19; Tyler the same night: "You know what I'm just now realizing I loved in old games. Permanent magic find buffs.").
// REVISED 2026-11-20 for Tyler's rulings on the first version: "If it's going to be per account it needs to be adjusted ... My vote is it
// only counts per account and we should add a similar system that luck I gained from other sinks like salvaging instead of selling (like gw2)".
// A PROPOSAL for docs/design/itemization-plan.md §15. Tyler approves before anything is built.
//
// WHAT IT IS. One number per account that only goes up, fed two ways, read by one formula:
//
//     Luck  = the Bestiary's stages + salvage's points
//     bonus (permille) = floor( LUCK_CAP_PM x Luck / (Luck + LUCK_HALF) )      on Rare and Trophy rows only
//
//   THE BESTIARY   one count a creature for the WHOLE ACCOUNT: a kill counts once, whichever of the account's heroes were there (four of
//                  its heroes in one hunt add one, four hunting apart add four). Each stage reached is +1 Luck.
//   SALVAGE        worn gear the account's OWN HUNTS dropped, salvaged instead of sold, by what the shop would have paid for it.
//                  Point n costs SALVAGE_STEP x n gold of it, so the first points are cheap and each one costs more.
//
// Nothing else moves: common and uncommon rows (crafting stock), Scarce gear (the hourly pace and its coin), keys, gem chips, a keyed
// hall's daily prize, the Hearth Chest, coin and XP all roll as they do today.
//
// WHY THESE NUMBERS (measured by luck-measure.mjs on played lives; the tables are in the plan).
//   stages   each about four or five times the last, so an account with four heroes (four times the kills) sits about ONE stage ahead on
//            a creature, never four times the Luck. The first version's ladder (..., 5,000 / 10,000 / 20,000) doubled, and a four-hero
//            account filled a ground's creatures in a few hundred hours. The top stage is out of a one-hero account's ordinary reach on
//            purpose: there is always a next stage.
//   step     a salvage point is priced in the gold the player gave up, and the price climbs by SALVAGE_STEP a point, so the points held
//            grow with the square root of the gear salvaged: four heroes salvaging everything hold about twice a lone hero's, not four times.
//   cap      250 permille: Tyler's own ceiling for a fully studied boss's relic (2026-10-19, src/data/loot-bands.js trophy boostMax 1.25),
//            which is why Trophy rows sit at 125-150 h. Luck takes that seat, so no band's promise moves. Both feeds share the one cap.
//   half     the Luck at which the bonus is half the cap, sized for two feeds.
//
// EARN-ONLY. Kills don't trade. A salvage point is paid only when the SERVER salvages a piece straight out of a hunt's own loot (the
// plan's fourth loot destination, applied on Dispatch): the piece never becomes a bag item first, so nothing bought, traded, crafted
// or taken from the store can reach it. A piece salvaged later at a bench gives its stock and no Luck.
//
// HIDDEN. Nothing in src/ reads this file; tools/balance-sim/staged/luck-measure.mjs does. PURE ESM. Imports nothing.
// ============================================================================

/** The account's kill totals against ONE creature that each add 1 Luck, ascending. */
export const LUCK_STAGES = Object.freeze([100, 500, 2500, 10000, 40000, 160000]);

/** Salvage point n costs this x n gold of salvaged gear (the shop's price for it). */
export const SALVAGE_STEP = 150;

/** The bonus can never pass this (permille). The formula clamps to it. */
export const LUCK_CAP_PM = 250;

/** The Luck at which the bonus is half the cap. */
export const LUCK_HALF = 150;

/** The loot bands Luck moves (src/data/loot-bands.js REVEAL_BANDS). */
export const LUCK_BANDS = Object.freeze(['rare', 'trophy']);

/** Stages held against one creature at `kills`. */
export function stagesAt(kills) {
  const n = Math.floor(Number(kills) || 0);
  let s = 0;
  for (const at of LUCK_STAGES) if (n >= at) s += 1;
  return s;
}

/** The Bestiary's Luck: stages held over `roster` (creature ids), from the account's `{ id: kills }` (own-property reads only). */
export function luckOf(killsById, roster) {
  let luck = 0;
  for (const id of roster) luck += stagesAt(killsById && Object.prototype.hasOwnProperty.call(killsById, id) ? killsById[id] : 0);
  return luck;
}

/** The gold of salvaged gear that holds `points` salvage points: SALVAGE_STEP x (1 + 2 + ... + points). */
export function salvageCostTo(points) {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  return (SALVAGE_STEP * n * (n + 1)) / 2;
}

/** Salvage's Luck at `gold` of gear salvaged, lifetime: the most points whose cost it covers. */
export function salvageLuckOf(gold) {
  const g = Math.max(0, Number(gold) || 0);
  let n = Math.floor((Math.sqrt(1 + (8 * g) / SALVAGE_STEP) - 1) / 2);
  while (salvageCostTo(n + 1) <= g) n += 1;
  while (n > 0 && salvageCostTo(n) > g) n -= 1;
  return n;
}

/** The bonus in permille at `luck`, 0..LUCK_CAP_PM. Integer, so the server and the sheet show one number. */
export function luckPm(luck) {
  const l = Math.max(0, Math.floor(Number(luck) || 0));
  return Math.min(LUCK_CAP_PM, Math.floor((LUCK_CAP_PM * l) / (l + LUCK_HALF)));
}

/** The multiplier a Rare or Trophy row's chance takes at `luck`. */
export const luckMult = (luck) => 1 + luckPm(luck) / 1000;
