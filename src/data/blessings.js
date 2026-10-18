// ════════════════════════════════════════════════════════════════════════
// src/data/blessings.js — BLESSINGS: PROTECTION FROM THE XP A DEATH TAKES (Tyler 2026-10-18)
//
// Tyler's rules: three blessing tiers, each adds about a third of the
// protection (cumulative 32% / 63% / 95% less XP lost on a death); each tier
// costs more than the last; all three are FREE under combat level 30; above
// it each tier's price scales with level, starting cheap; a death USES THEM
// UP (rebuy after dying). Gold only. Server-owned: a backend lane writes the
// buy RPC and applies `xpLossReductionPermille` to the death XP loss
// (hunt-sessions.js DEATH_XP_LOSS); a money surface for the reopen review.
//
// SCALED FROM Tibia's per-level blessing price (as remembered, NOT re-verified
// against a live source: about 2,000 gold each at level 30, plus 200 a level,
// capped near level 120). We keep its shape (a floor plus a per-level step)
// and cut the gold roughly twentyfold: our economy rule is that common drops
// and gold pay a hunt's supplies, and a fresh hero earns about 1,500 g an hour
// (S1 engine, mill_cellar fixture), so a full set at level 31 (495 g) is a
// third of an hour and at level 100 (3,600 g) a fraction of that level's
// hourly income. Tier n requires tiers 1..n-1.
//
// PRICE (integer): free if combatLevel < freeUntilLevel, else
//   base + perLevel x (combatLevel - freeUntilLevel)
// combatLevel = src/core/xp.js combatLevel (server: hr_lb_combat_level).
//
// WORKED PRICES:          level 31   level 60   level 100
//   tier 1 (32%)             110        400        800
//   tier 2 (63% total)       165        600      1,200
//   tier 3 (95% total)       220        800      1,600
//   full set                 495      1,800      3,600
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BLESSING_RULES = Object.freeze({
  /* All three tiers are free below this combat level. */
  freeUntilLevel: 30,
  /* Tyler 2026-10-18: a death uses every held blessing up. */
  consumedOnDeath: true,
  /* A tier needs every tier below it. */
  requiresPrevious: true,
  currency: 'gold',
});

/* xpLossReductionPermille is CUMULATIVE: the share of the death XP loss removed
   while this tier (and every one below it) is held. */
export const BLESSING_TIERS = Object.freeze([
  Object.freeze({ tier: 1, xpLossReductionPermille: 320, base: 100, perLevel: 10 }),
  Object.freeze({ tier: 2, xpLossReductionPermille: 630, base: 150, perLevel: 15 }),
  Object.freeze({ tier: 3, xpLossReductionPermille: 950, base: 200, perLevel: 20 }),
]);

/** Gold for `tier` at `combatLevel` (0 under the free level), or null for an unknown tier. */
export function blessingPrice(tier, combatLevel) {
  const row = BLESSING_TIERS.find((r) => r.tier === tier);
  if (!row) return null;
  const lv = Math.floor(combatLevel);
  if (lv < BLESSING_RULES.freeUntilLevel) return 0;
  return row.base + row.perLevel * (lv - BLESSING_RULES.freeUntilLevel);
}

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  let prev = null;
  for (const r of BLESSING_TIERS) {
    for (const k of ['tier', 'xpLossReductionPermille', 'base', 'perLevel']) if (!Number.isInteger(r[k]) || r[k] <= 0) out.push('tier ' + r.tier + ': ' + k + ' must be a positive integer');
    if (r.xpLossReductionPermille > 1000) out.push('tier ' + r.tier + ' removes more than the whole loss');
    if (prev && !(r.xpLossReductionPermille > prev.xpLossReductionPermille && r.base > prev.base && r.perLevel >= prev.perLevel)) out.push('tier ' + r.tier + ' must protect more and cost more than tier ' + prev.tier);
    prev = r;
  }
  if (BLESSING_RULES.currency !== 'gold') out.push('blessings are bought with gold only');
  return out;
}
