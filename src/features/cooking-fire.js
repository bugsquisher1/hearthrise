// ============================================================
// src/features/cooking-fire.js  (b225, SYS)
//
// THE CAMPFIRE RULING — Tyler, 2026-08-08 (binding; DECISIONS.md,
// docs/design/homestead-deepening.md §2 PRODUCT-OWNER AMENDMENT):
//
//   "We can't restrict cooking when users don't have a kitchen. They can
//    cook with the fire in the first tier camp, it just has a chance to
//    burn."
//
// Cooking is therefore NEVER gated on the Kitchen. A tier-1 Wanderer's Camp
// cooks on the open fire and sometimes ruins the food. The Kitchen ladder's
// first job stops being "permission to cook" and becomes RELIABILITY: each
// rung buys down the burn chance through `noBurn` — which until this build
// was a ghost bonus key, listed in the House buff panel and produced by
// nothing (homestead-deepening.md §0, finding 2). This module is its reader;
// legacy.js ROOMS.kitchen is its producer.
//
// Forge / Workshop / Shrine gates are UNCHANGED. Smithing on a campfire
// would be silly; cooking on one is the entire point of a campfire.
//
// ── WHY THIS FILE IS PURE ────────────────────────────────────────────────
// burnChance() is the ONE source of truth for the odds. Three callers need
// the same answer and must never disagree:
//   1. the cook itself      (legacy.js doArtisanAction),
//   2. the offline replay   (legacy.js processOffline → doArtisanAction),
//   3. the UI preview       ("Burn risk: 12%" on every cooking tile).
// A second copy of this arithmetic anywhere is a bug waiting to ship, so the
// function takes its three inputs as arguments and touches no globals, no G,
// and no DOM. It is directly unit-testable (smoke suite, b225 block).
//
// ── THE CURVE AS SHIPPED (v1 — Designer owns retuning) ───────────────────
//   burn% = BASE − noBurn − (PER_LEVEL_RELIEF × levels above the recipe req)
//   clamped to [0, BASE].
//
//   BASE                 25%   open fire, no Kitchen, at the recipe's exact
//                              level requirement. High enough to be a real
//                              reason to want a Kitchen, low enough that a
//                              new player still nets 3 of every 4 dishes.
//   Kitchen L1 (Hearthstone)    noBurn 13 pts → 12%
//   Kitchen L2                  noBurn 19 pts → 6%
//   Kitchen L3 (Cast-Iron Range)noBurn 25 pts → 0%   burn-proof, as the
//                              amendment's suggested endpoint specifies.
//   PER_LEVEL_RELIEF      1pt  per cooking level above the recipe's req, so
//                              25 levels of mastery burn-proofs a recipe on
//                              the open fire too. The fire is a nuisance
//                              that fades, never a wall.
//   Both reductions STACK (a Kitchen-L1 cook 6 levels over req burns 6%).
//
//   BURN_XP_SHARE        25%   of the recipe's XP is still awarded on a
//                              burn. Genre standard (a failed cook still
//                              teaches you something) and, more practically,
//                              it means a burn stings without zeroing the
//                              session — a 25% burn rate costs you 18.75% of
//                              your XP/hr, not 25%.
//
// ── WHAT A BURN COSTS, EXACTLY ───────────────────────────────────────────
// The ingredients are consumed (honestly — the amendment says so) and you
// get one BURNT_ITEM instead of the dish. A burn does NOT tick the cooked
// counter, so daily tasks and the onboarding "Cook 5 dishes" quest count
// SUCCESSFUL cooks only and can never be satisfied by failure.
// ============================================================
(function () {
  'use strict';

  var BASE = 0.25;              // open-fire burn chance at the recipe's req level
  var PER_LEVEL_RELIEF = 0.01;  // −1 percentage point per cooking level above req
  var BURN_XP_SHARE = 0.25;     // consolation XP as a share of the recipe's XP
  var BURNT_ITEM = 'burnt_food';

  // The `noBurn` value each Kitchen rung contributes to getBonus('noBurn').
  // Exported so the House panel, the smoke suite and any future Kitchen rung
  // read the ladder from one place rather than re-deriving 12/6/0.
  //
  // b227: the Kitchen grew from three rungs to five (homestead-deepening §3.1),
  // and this table grew with it — one entry per rung, same length, so the
  // suite's anti-drift guard keeps its teeth instead of being relaxed to
  // "the first three agree". L4 and L5 buy YIELD, not reliability: the range
  // is already burn-proof at L3 and there is nothing below zero to sell. They
  // restate 0.25 because a rung's bonus map REPLACES the rung below it rather
  // than adding to it, so an L4 that omitted noBurn would silently un-burn-
  // proof a player as a reward for upgrading.
  var KITCHEN_NO_BURN = [0.13, 0.19, 0.25, 0.25, 0.25];

  /**
   * The odds this cook is ruined.
   * @param {object} recipe        an ARTISAN_RECIPES cooking entry (uses .req)
   * @param {number} cookingLevel  the player's cooking level
   * @param {number} noBurn        getBonus('noBurn') — percentage points, as a
   *                               fraction (0.13 = 13 points removed)
   * @returns {number} 0…BASE
   */
  function burnChance(recipe, cookingLevel, noBurn) {
    var req = (recipe && typeof recipe.req === 'number') ? recipe.req : 1;
    var lv = (typeof cookingLevel === 'number' && isFinite(cookingLevel)) ? cookingLevel : 1;
    var relief = (typeof noBurn === 'number' && isFinite(noBurn)) ? Math.max(0, noBurn) : 0;
    var mastery = Math.max(0, lv - req) * PER_LEVEL_RELIEF;
    var c = BASE - relief - mastery;
    if (!(c > 0)) return 0;
    return Math.min(BASE, c);
  }

  /** Whole-percent form for UI copy. burnChance(…)=0.12 → 12 */
  function burnPct(recipe, cookingLevel, noBurn) {
    return Math.round(burnChance(recipe, cookingLevel, noBurn) * 100);
  }

  /** XP still awarded when a cook burns. Always at least 1 — never a zero. */
  function burnXp(recipe) {
    var xp = (recipe && Number(recipe.xp)) || 0;
    if (xp <= 0) return 0;
    return Math.max(1, Math.round(xp * BURN_XP_SHARE));
  }

  /* The one advisory sentence, so the tile tooltip, the list row and any
     future surface cannot describe the mechanic three different ways.
     `hasKitchen` decides which half of the advice is worth giving. */
  function burnAdvice(pct, hasKitchen) {
    if (!(pct > 0)) return 'Burn-proof — your Kitchen never ruins this dish.';
    return 'Burn risk: ' + pct + '% — ' +
      (hasKitchen ? 'upgrade your Kitchen or level up to improve.'
                  : 'build a Kitchen or level up to improve.');
  }

  window.HearthriseCookingFire = {
    BASE: BASE,
    PER_LEVEL_RELIEF: PER_LEVEL_RELIEF,
    BURN_XP_SHARE: BURN_XP_SHARE,
    BURNT_ITEM: BURNT_ITEM,
    KITCHEN_NO_BURN: KITCHEN_NO_BURN,
    burnChance: burnChance,
    burnPct: burnPct,
    burnXp: burnXp,
    burnAdvice: burnAdvice
  };
})();
