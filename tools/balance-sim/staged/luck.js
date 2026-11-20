// ============================================================================
// tools/balance-sim/staged/luck.js — LUCK v3, THE PROPOSED PERMANENT RARE-DROP BONUS, AS DATA AND ONE FORMULA
// (designer; Tyler 2026-11-19: "Permanent magic find buffs."; 2026-11-20: "it only counts per account and we should add a similar
// system that luck I gained from other sinks like salvaging instead of selling (like gw2)"; 2026-11-20, newest: "for salvaging, i was
// considering a system almost exactly like gw2's where i dont think there is a cap".)
// A PROPOSAL for docs/design/itemization-plan.md §15. Tyler approves before anything is built. v2 (one +25% pool) is in git (56f16fa99).
//
// WHAT IT IS. One Luck total per account that only goes up, and a rank read off it:
//
//     Luck   = what salvaged gear gave (LUCK_PER_TIER, RARE_MULT, UNIQUE_LUCK_PER_BAND) + what the Bestiary's stages gave (STAGE_LUCK)
//     rank n is held once Luck >= RANK_STEP x (1^2 + 2^2 + ... + n^2)          so rank n alone costs RANK_STEP x n^2
//     bonus  = +rank % on Rare rows (to LUCK_RANK_MAX), +min(rank, TROPHY_RANK_MAX) % on Trophy rows
//
//   SALVAGE        worn gear the account's OWN HUNTS dropped, salvaged instead of sold: Luck by the piece's tier and band. As in
//                  Guild Wars 2, where salvaged gear gives Essences of Luck that fill one account bar. No essence ITEM here: the
//                  Luck goes straight onto the bar (an untradeable item whose only use is "consume" is a click with no decision).
//   THE BESTIARY   one count a creature for the WHOLE ACCOUNT. Each stage reached pays a lump of Luck into the same total, once.
//
// THE CURVE HAS NO NEAR CEILING. Each rank costs more than the last (n^2), so Luck held grows with the cube root of Luck earned:
// eight times the gear salvaged is twice the rank. LUCK_RANK_MAX is a far stop the way GW2's 300% is (that one is so far out it plays
// as uncapped): a guard needs a finite top to prove a row never passes its bound, and no measured life comes near it.
//
// WHY THESE NUMBERS (measured by luck-measure.mjs on played lives; the tables are in the plan).
//   per tier   2 Luck a tier: a Scarce piece sells for 30 / 60 / 105 / 137 / 173 g at tiers 1 / 2 / 4 / 5 / 6, so a point of Luck
//              costs about 13-15 g of shop gold at every tier. No tier is the cheap one to farm.
//   rare       a Rare piece is worth five Scarce ones of its tier. A Rare nobody wants has a floor: its Luck.
//   unique     past tier 7 the hourly drop is stock and chips (Tyler 11-18), and uniques are the only gear. One is worth 50 x its band.
//   stages     each four to five times the last, so four heroes sit about one stage ahead on a creature. The lumps climb with them.
//   step       75: a lone hero salvaging everything holds rank 15 at about 500 hours.
//   trophy     25: Tyler's own ceiling for a fully studied boss's relic (2026-10-19, loot-bands.js trophy boostMax 1.25). A Trophy
//              still never comes faster than every 100 h, at any Luck.
//
// EARN-ONLY. Kills don't trade. Salvage pays Luck on at most as many of an item as the account's own hunts have dropped
// (found minus already salvaged for Luck, per account and item, server-held). So Luck from salvage can never pass what the
// account's own hunts dropped, whatever gold or Crowns buy.
//
// HIDDEN. Nothing in src/ reads this file; tools/balance-sim/staged/luck-measure.mjs does. PURE ESM. Imports nothing.
// ============================================================================

/** The account's kill totals against ONE creature that each pay a lump of Luck, ascending. */
export const LUCK_STAGES = Object.freeze([100, 500, 2500, 10000, 40000, 160000]);

/** The Luck each stage pays, once, into the account's total. */
export const STAGE_LUCK = Object.freeze([50, 150, 500, 1500, 5000, 15000]);

/** A standard (Scarce, hourly) piece gives this x its tier. */
export const LUCK_PER_TIER = 2;

/** A Rare piece of tiers 1 to 7 gives this many times a Scarce one of its tier. */
export const RARE_MULT = 5;

/** A unique past tier 7 gives this x its band (8 and up). */
export const UNIQUE_LUCK_PER_BAND = 50;

/** Rank n costs this x n^2 Luck. */
export const RANK_STEP = 100;

/** The far stop: +100% on Rare rows. */
export const LUCK_RANK_MAX = 100;

/** A Trophy row never takes more than this rank. */
export const TROPHY_RANK_MAX = 25;

/** The loot bands Luck moves (src/data/loot-bands.js REVEAL_BANDS). */
export const LUCK_BANDS = Object.freeze(['rare', 'trophy']);

/** Stages held against one creature at `kills`. */
export function stagesAt(kills) {
  const n = Math.floor(Number(kills) || 0);
  let s = 0;
  for (const at of LUCK_STAGES) if (n >= at) s += 1;
  return s;
}

/** The Luck the Bestiary has paid over `roster` (creature ids), from the account's `{ id: kills }` (own-property reads only). */
export function bestiaryLuckOf(killsById, roster) {
  let luck = 0;
  for (const id of roster) {
    const s = stagesAt(killsById && Object.prototype.hasOwnProperty.call(killsById, id) ? killsById[id] : 0);
    for (let i = 0; i < s; i++) luck += STAGE_LUCK[i];
  }
  return luck;
}

/** The Luck one salvaged piece gives: `tier` 1 and up (a band past 7 is a unique), `band` its loot band. */
export function salvageLuckOf(tier, band) {
  const t = Math.max(1, Math.floor(Number(tier) || 1));
  if (t > 7) return UNIQUE_LUCK_PER_BAND * t;
  return LUCK_PER_TIER * t * (band === 'rare' || band === 'trophy' ? RARE_MULT : 1);
}

/** The Luck that holds `rank`: RANK_STEP x (1^2 + ... + rank^2). */
export function luckToRank(rank) {
  const n = Math.max(0, Math.floor(Number(rank) || 0));
  return (RANK_STEP * n * (n + 1) * (2 * n + 1)) / 6;
}

/** The rank held at `luck`, 0..LUCK_RANK_MAX. */
export function rankOf(luck) {
  const l = Math.max(0, Number(luck) || 0);
  let n = Math.min(LUCK_RANK_MAX, Math.floor(Math.cbrt((3 * l) / RANK_STEP)));
  while (n < LUCK_RANK_MAX && luckToRank(n + 1) <= l) n += 1;
  while (n > 0 && luckToRank(n) > l) n -= 1;
  return n;
}

/** The bonus in permille a `band` row takes at `luck`. Integer, so the server and the sheet show one number. */
export function luckPm(luck, band = 'rare') {
  const r = rankOf(luck);
  return 10 * (band === 'trophy' ? Math.min(r, TROPHY_RANK_MAX) : r);
}

/** The multiplier a Rare or Trophy row's chance takes at `luck`. */
export const luckMult = (luck, band = 'rare') => 1 + luckPm(luck, band) / 1000;
