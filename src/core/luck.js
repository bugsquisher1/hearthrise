// ============================================================================
// src/core/luck.js — THE LUCK FORMULAS THE ENGINE READS (docs/design/itemization-plan.md §15, Luck v3.1). The numbers are src/data/luck.js.
// The BAR (rank n at rankStep x (1^2 + ... + n^2), the far stop, a stage paid once) is the server's alone: 1013-luck.sql hr_luck_rank /
// hr_luck_to_rank over the generated copies of the same rows (tools/gen-luck.mjs); tests/luck.mjs holds them to the data. What the
// engine needs is the number the server sent and what it does to a row.
//
//   clampMagicFind(mf)       a Magic Find the engine may use: an integer 0..MAGIC_FIND_MAX (the far stop + the best Lucky ring)
//   partyMagicFind(list)     the party's one number from the heroes at a kill (LUCK_RULES.party: the highest, or the average's floor)
//   luckPm(mf, band)         permille a row of `band` takes at Magic Find `mf` (Rare / Very Rare: 10 x mf; Trophy: the closing curve)
//   rareCutPm(levelFloor)    permille cut off a Rare row's base chance on a ground whose Level floor is `levelFloor` (0 through Krell's)
//   salvageRivetsOf(t, b)    the rivets one salvaged piece of tier `t` dropped in band `b` pays
//
// Every answer is an INTEGER (permille, percent, Luck), so the sheet, the engine and the database say one number.
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================================

import {
  LUCK_RULES, LUCK_FULL_BANDS, LUCK_TROPHY_BANDS, SALVAGE_RIVETS, LUCKY_PERK_PCT, RARE_CUT,
} from '../data/luck.js?v=0.2.142';

const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);

/** The best Lucky percent any ring gives (the table's last). */
const LUCKY_PCT_MAX = Math.max(...LUCKY_PERK_PCT);

/** The most Magic Find any hero can hold: the far stop plus the best Lucky ring. A guard's upper bound. */
export const MAGIC_FIND_MAX = LUCK_RULES.rankMax + LUCKY_PCT_MAX;

/** A Magic Find the engine may use: an integer in 0..MAGIC_FIND_MAX (anything else, a missing read, is 0). */
export function clampMagicFind(mf) {
  const n = Number(mf);
  return Number.isInteger(n) && n > 0 ? Math.min(MAGIC_FIND_MAX, n) : 0;
}

/** The party's one number from the heroes at the kill (each clamped), by LUCK_RULES.party: the highest (the audit's 11-20 ruling), or
    the floor of the average. Order-free, so who landed the kill never moves it.
    @param {Array<number>} list  each hero's Magic Find, the server's
    @param {string} [rule]       'highest' or 'average' (a data row; the default is LUCK_RULES.party) */
export function partyMagicFind(list, rule = LUCK_RULES.party) {
  const xs = Array.isArray(list) ? list.map(clampMagicFind) : [];
  if (!xs.length) return 0;
  if (rule === 'average') return Math.floor(xs.reduce((s, x) => s + x, 0) / xs.length);
  return Math.max(...xs);
}

/** Permille a row of `band` takes at Magic Find `mf`: Rare and Very Rare 10 x mf; Trophy closes on trophyMaxPm; any other band 0. */
export function luckPm(mf, band) {
  const r = clampMagicFind(mf);
  if (!r) return 0;
  if (LUCK_FULL_BANDS.includes(band)) return 10 * r;
  if (LUCK_TROPHY_BANDS.includes(band)) return Math.floor((LUCK_RULES.trophyMaxPm * r) / (r + LUCK_RULES.trophyHalf));
  return 0;
}

/** The band (8..18) of a ground whose Level floor is `levelFloor`, or 0 through Krell's Hold. */
function cutBandOf(levelFloor) {
  const f = int(levelFloor);
  let band = 0;
  for (const [b, at] of RARE_CUT.bands) if (f >= at) band = b;
  return band;
}

/** Permille cut off a Rare row's base chance on a ground whose Level floor is `levelFloor`: 0 through Krell's Hold, pm at band 8,
    stepPm more a band, maxPm at most. */
export function rareCutPm(levelFloor) {
  const band = cutBandOf(levelFloor);
  if (!band) return 0;
  const first = RARE_CUT.bands[0][0];
  return Math.min(RARE_CUT.maxPm, RARE_CUT.pm + RARE_CUT.stepPm * (band - first));
}

/** The rivets one salvaged piece pays: tier `tier` (past 7, a unique: its band), dropped in band `band` (its lowest drop band). */
export function salvageRivetsOf(tier, band) {
  if (SALVAGE_RIVETS.never.includes(band)) return 0;
  const t = Math.max(1, int(tier));
  if (t > 7) return SALVAGE_RIVETS.uniquePerBand * t;
  return SALVAGE_RIVETS.perTier * t * (band === 'rare' || band === 'trophy' ? SALVAGE_RIVETS.rareMult : 1);
}
