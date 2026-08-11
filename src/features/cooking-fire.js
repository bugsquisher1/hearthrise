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

  /* ── PHASE A: the ARITHMETIC moved to src/core/artisan.js ───────────────
     Not because it was impure — it never was — but because it is a RATE the
     server must compute when it prices an overnight of cooking, and Deno
     cannot import a classic <script>. This module is now the client-facing
     face of that maths: the functions delegate, the constants are GETTERS
     onto the core values (so CF.BASE IS core.BURN_BASE, one number, not
     two), and the player-facing advice sentence stays here — copy is not
     simulation.

     Load order: this file is a classic script and runs BEFORE core-bridge.js
     (a deferred module), so nothing may read the core at IIFE time. Every
     reference below is inside a function or a getter, which run later. */
  function core() {
    var C = window.HearthriseCore;
    return (C && C.artisan) || null;
  }

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
  /* (the array itself now lives in src/core/artisan.js as KITCHEN_NO_BURN) */

  /**
   * The odds this cook is ruined.
   * @param {object} recipe        an ARTISAN_RECIPES cooking entry (uses .req)
   * @param {number} cookingLevel  the player's cooking level
   * @param {number} noBurn        getBonus('noBurn') — percentage points, as a
   *                               fraction (0.13 = 13 points removed)
   * @returns {number} 0…BASE
   */
  function burnChance(recipe, cookingLevel, noBurn) {
    var A = core();
    return A ? A.burnChance(recipe, cookingLevel, noBurn) : 0;
  }

  /** Whole-percent form for UI copy. burnChance(…)=0.12 → 12 */
  function burnPct(recipe, cookingLevel, noBurn) {
    var A = core();
    return A ? A.burnPct(recipe, cookingLevel, noBurn) : 0;
  }

  /** XP still awarded when a cook burns. Always at least 1 — never a zero. */
  function burnXp(recipe) {
    var A = core();
    return A ? A.burnXp(recipe) : 0;
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

  var API = {
    burnChance: burnChance,
    burnPct: burnPct,
    burnXp: burnXp,
    burnAdvice: burnAdvice
  };

  /* Constants as GETTERS — one identity with src/core/artisan.js. A plain
     copy taken here would also have been `undefined`, because the core
     module has not evaluated when this classic script runs. */
  [['BASE', 'BURN_BASE'], ['PER_LEVEL_RELIEF', 'BURN_PER_LEVEL_RELIEF'],
   ['BURN_XP_SHARE', 'BURN_XP_SHARE'], ['BURNT_ITEM', 'BURNT_ITEM'],
   ['KITCHEN_NO_BURN', 'KITCHEN_NO_BURN']].forEach(function (pair) {
    Object.defineProperty(API, pair[0], {
      enumerable: true,
      get: function () { var A = core(); return A ? A[pair[1]] : undefined; }
    });
  });

  window.HearthriseCookingFire = API;
})();
