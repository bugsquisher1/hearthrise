// ============================================================================
// src/core/luck.js — THE LUCK FORMULAS, ONE COPY (docs/design/itemization-plan.md §15, Luck v3.1). The numbers are src/data/luck.js;
// the server's SQL reads the generated copies of the same rows (tools/gen-luck.mjs) and tests/luck.mjs holds the two to one answer.
//
//   luckToRank(n)            the Luck that holds percent n: rankStep x (1^2 + ... + n^2), an integer
//   rankOf(luck)             the whole percent an account holds at `luck`, 0..rankMax
//   luckyPctOf(tier)         the Lucky ring perk's Magic Find at a ring tier (0 under tier 2)
//   magicFindOf(luck, ring)  a hero's Magic Find: the account's rank + its worn Lucky percent (clamped to the table's best)
//   partyMagicFind(list)     the party's one number from the heroes at a kill (LUCK_RULES.party: the highest, or the average's floor)
//   luckPm(mf, band)         permille a row of `band` takes at Magic Find `mf` (Rare / Very Rare: 10 x mf; Trophy: the closing curve)
//   rareCutPm(levelFloor)    permille cut off a Rare row's base chance on a ground whose Level floor is `levelFloor` (0 through Krell's)
//   stagesAt(kills)          the Bestiary stages one creature's account count holds; stageLuckBetween(a, b) what crossing pays
//   salvageRivetsOf(t, b)    the rivets one salvaged piece of tier `t` dropped in band `b` pays
//   luckyRivetsFor(tier)     the rivets the Lucky job burns at a ring tier
//
// Every answer is an INTEGER (permille, percent, Luck), so the sheet, the engine and the database say one number.
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================================

import {
  LUCK_RULES, LUCK_FULL_BANDS, LUCK_TROPHY_BANDS, SALVAGE_RIVETS, LUCK_STAGES, LUCKY_PERK_PCT, LUCKY_RIVET_STEP, RARE_CUT,
} from '../data/luck.js?v=0.2.141';

const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0);

/** The Luck that holds percent `n` (0..rankMax). */
export function luckToRank(n) {
  const k = Math.min(LUCK_RULES.rankMax, Math.max(0, int(n)));
  return (LUCK_RULES.rankStep * k * (k + 1) * (2 * k + 1)) / 6;
}

/** The whole percent an account holds at `luck`, 0..rankMax. */
export function rankOf(luck) {
  const l = Math.max(0, int(luck));
  let n = Math.min(LUCK_RULES.rankMax, Math.floor(Math.cbrt((3 * l) / LUCK_RULES.rankStep)));
  while (n < LUCK_RULES.rankMax && luckToRank(n + 1) <= l) n += 1;
  while (n > 0 && luckToRank(n) > l) n -= 1;
  return n;
}

/** The best Lucky percent any ring gives (the table's last). */
export const LUCKY_PCT_MAX = Math.max(...LUCKY_PERK_PCT);

/** The most Magic Find any hero can hold: the far stop plus the best Lucky ring. A guard's upper bound. */
export const MAGIC_FIND_MAX = LUCK_RULES.rankMax + LUCKY_PCT_MAX;

/** The Lucky ring perk's Magic Find at a ring tier (0 under tier 2 or past the table). */
export function luckyPctOf(tier) {
  const t = int(tier);
  return t >= 0 && t < LUCKY_PERK_PCT.length ? LUCKY_PERK_PCT[t] : 0;
}

/** A hero's Magic Find: the account's rank at `luck` plus `ringPct` (the worn Lucky percent, clamped to 0..LUCKY_PCT_MAX). */
export function magicFindOf(luck, ringPct = 0) {
  return rankOf(luck) + Math.min(LUCKY_PCT_MAX, Math.max(0, int(ringPct)));
}

/** A Magic Find the engine may use: an integer in 0..MAGIC_FIND_MAX (anything else, a missing read, is 0). */
export function clampMagicFind(mf) {
  const n = Number(mf);
  return Number.isInteger(n) && n > 0 ? Math.min(MAGIC_FIND_MAX, n) : 0;
}

/** The party's one number from the heroes at the kill (each clamped), by LUCK_RULES.party: the highest (the audit's 11-20 ruling), or
    the floor of the average. Order-free, so who landed the kill never moves it. */
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
export function cutBandOf(levelFloor) {
  const f = int(levelFloor);
  if (f < RARE_CUT.cutFloor) return 0;
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

/** The Bestiary stages one creature's account count `kills` holds (0..LUCK_STAGES.length). */
export function stagesAt(kills) {
  const n = Math.max(0, int(kills));
  let s = 0;
  for (const st of LUCK_STAGES) if (n >= st.kills) s += 1;
  return s;
}

/** The Luck an account count crossing from `before` to `after` kills of one creature pays (each stage once). */
export function stageLuckBetween(before, after) {
  const a = stagesAt(before), b = stagesAt(after);
  let luck = 0;
  for (let i = a; i < b; i++) luck += LUCK_STAGES[i].luck;
  return luck;
}

/** The rivets one salvaged piece pays: tier `tier` (past 7, a unique: its band), dropped in band `band` (its lowest drop band). */
export function salvageRivetsOf(tier, band) {
  if (SALVAGE_RIVETS.never.includes(band)) return 0;
  const t = Math.max(1, int(tier));
  if (t > 7) return SALVAGE_RIVETS.uniquePerBand * t;
  return SALVAGE_RIVETS.perTier * t * (band === 'rare' || band === 'trophy' ? SALVAGE_RIVETS.rareMult : 1);
}

/** The rivets the Lucky job burns for a ring of `tier` (2..7). */
export function luckyRivetsFor(tier) {
  const t = Math.min(7, Math.max(2, int(tier)));
  return LUCKY_RIVET_STEP * t * t;
}

/** The bar as the sheet reads it: { rank, at (Luck that holds it), next (Luck for the next percent, null at the stop) }. */
export function barOf(luck) {
  const rank = rankOf(luck);
  return { rank, at: luckToRank(rank), next: rank >= LUCK_RULES.rankMax ? null : luckToRank(rank + 1) };
}
