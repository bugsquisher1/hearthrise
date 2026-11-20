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
//     bonus  = +rank % on Rare rows (to LUCK_RANK_MAX); on Trophy rows +TROPHY_MAX_PM x rank / (rank + TROPHY_HALF) permille
//
//   SALVAGE        worn gear the account's OWN HUNTS dropped, salvaged instead of sold: Luck by the piece's tier and band. As in
//                  Guild Wars 2, where salvaged gear gives Essences of Luck that fill one account bar. v3.1: paid as an
//                  account-bound item, the Lucky Rivet (below), with two uses: the bar or a Lucky ring.
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
//   step       100: rank 10 costs 10,000 Luck. A lone hero salvaging everything holds rank 16 at 500 hours (measured).
//   trophy     250 permille is Tyler's own ceiling for a fully studied boss's relic (2026-10-19, loot-bands.js trophy boostMax 1.25).
//              A Trophy closes on it and never reaches it, so it never comes faster than every 100 h at any Luck.
//
// WHAT THE REFERENCES SAY (public repos, read for formulas and structure only; nothing copied).
//   Guild Wars 2   Physe-0/GW2_Magic_Find_Leveling_Cost_GUI, Magic_Find_Req_Luck.py: 300 steps of 1%. A step costs 100 Luck early,
//                  climbs to 30,000 at step 218 and stays there; 4,325,450 Luck in all by that file. So GW2 does stop, at 300%.
//                  Taken: one account total, salvage feeds it, each percent costs more. Not taken: the flat tail and the 300%.
//   Diablo II      yqlu/d2r-dropplot, src/engine/rarity.ts (getEffectiveMf): effective = MF x F / (MF + F), F = 250 for uniques,
//                  500 for sets, 600 for rares. The rarer the class, the lower its ceiling. Taken for Trophy rows.
//   Path of Exile  PathOfBuildingCommunity/PathOfBuilding, src/Modules/CalcPerform.lua: rarity and quantity are two stats, and every
//                  source adds into one sum. Taken: Luck is rarity only, never quantity, and both feeds are one total.
//   rAthena        rathena/rathena, src/map/mob.cpp (mob_getdroprate): one function owns the final rate, bonuses add, the cap is
//                  applied last. Taken: Luck goes inside drops.js effectiveDropChance, under its own 0.95 bound.
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

/** A Trophy row closes on this bonus (permille) and never reaches it; at TROPHY_HALF ranks it holds half. */
export const TROPHY_MAX_PM = 250;
export const TROPHY_HALF = 25;

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

// ---- v3.1 (Tyler 2026-11-20: Luck from salvage is a material item, used on the bar or in crafting; then "let's bind it") ----
// Salvage pays its Luck as LUCKY RIVETS: one rivet is one Luck, stackable, ACCOUNT-BOUND (never traded, never sold; moved between
// the account's own heroes through Storage). A rivet goes on the bar, or into the one recipe that uses it: the Lucky ring.
// The Bestiary still pays straight onto the bar. GW2's own essences are account-bound too, so this matches it.
// The RING trades like all jewelry (Tyler 11-20: "it doesn't create an account wide buff, luck rings can be sold"): it is one hero's
// worn stat, small, counts once, costs a ring perk seat, and salvaging one gives no rivets back, so no Luck crosses accounts.

/** The item salvage pays Luck in. One is one Luck. */
export const LUCK_ITEM = 'lucky_rivet';

/** The Lucky perk (ring pool, counts once a hero, the larger worn): the Magic Find it adds to its wearer, by the piece's tier (index = tier). */
export const LUCKY_PERK_PCT = Object.freeze([0, 0, 1, 2, 2, 3, 3, 4]);

/** The rivets the Lucky job burns for a tier's ring: LUCKY_RIVET_STEP x tier^2. */
export const LUCKY_RIVET_STEP = 500;
export const luckyRivetsFor = (tier) => { const t = Math.min(7, Math.max(2, Math.floor(Number(tier) || 2))); return LUCKY_RIVET_STEP * t * t; };

/** The most Magic Find any hero can hold: the bar's far stop plus the best Lucky perk. A guard's upper bound. */
export const MAGIC_FIND_MAX = LUCK_RANK_MAX + LUCKY_PERK_PCT[LUCKY_PERK_PCT.length - 1];

/** A hero's Magic Find in whole percents: the account's rank plus the Lucky perk worn (`wornTier` 0 = none). */
export const magicFindOf = (luck, wornTier = 0) => rankOf(luck) + (LUCKY_PERK_PCT[Math.min(7, Math.max(0, Math.floor(Number(wornTier) || 0)))] || 0);

/** The bonus in permille a `band` row takes at `luck` (and a Lucky ring of `wornTier`). Integer, so the server and the sheet show one number. */
export function luckPm(luck, band = 'rare', wornTier = 0) {
  const r = magicFindOf(luck, wornTier);
  return band === 'trophy' ? Math.floor((TROPHY_MAX_PM * r) / (r + TROPHY_HALF)) : 10 * r;
}

/** The multiplier a Rare or Trophy row's chance takes at `luck`. */
export const luckMult = (luck, band = 'rare', wornTier = 0) => 1 + luckPm(luck, band, wornTier) / 1000;

// ---- HARDER PAST KRELL (Tyler 2026-11-20: balance Luck "by making gear drops more rare", then "making the drops harder to get at
// higher bands, I want to get people hooked up to Krell and then start introducing really rare drops and strong gear") ----
// Nothing changes through Krell's Hold. From the Morrow door (Level RARE_CUT_FLOOR, band 8) every Rare row drops less often at
// Magic Find 0: a clear step of RARE_CUT at the door, then RARE_CUT_STEP more a band to RARE_CUT_MAX. The step is sized to the Magic
// Find a player who salvages half and wears a ring holds when they get there, so that player finds about what the plan promised
// and Luck is how the rest is earned back. Trophy rows and the hourly drop (gear to tier 7, then stock and chips) are never cut.
// One of a ground's seven uniques becomes its VERY RARE piece: VERY_RARE_HOURS at Magic Find 0, moved by Magic Find in full.

/** The share taken off a Rare row's base chance at band 8, the Morrow door. */
export const RARE_CUT = 0.15;
/** More a band past 8, and the most it ever takes. */
export const RARE_CUT_STEP = 0.01;
export const RARE_CUT_MAX = 0.25;

/** A ground is cut when its Level floor is this or more (the Morrow Hills and on). Nothing through Krell's Hold is. */
export const RARE_CUT_FLOOR = 110;

/** What is left of a Rare row's base chance at `band` (7 and under: all of it). */
export const rareKeepOf = (band) => { const b = Math.floor(Number(band) || 0); return b < 8 ? 1 : 1 - Math.min(RARE_CUT_MAX, RARE_CUT + RARE_CUT_STEP * (b - 8)); };

/** The hours between drops of a ground's Very Rare piece for one hero at Magic Find 0, [min, max]. */
export const VERY_RARE_HOURS = Object.freeze([60, 90]);
