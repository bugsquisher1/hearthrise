// ============================================================
// src/core/artisan.js — the crafting bench, as arithmetic.
//
// WHAT THIS IS
// `window.doArtisanAction` in legacy.js was the last simulation function
// still reaching for `Math.random()` (three times: craftSave, the cooking
// burn, and the yield_* roll). It also owned the recipe-input consumption,
// the output quantity, and the deterministic artisan-tool carry — i.e. the
// whole production step for cooking / smithing / crafting / prayer.
//
// The accrual engine has to price an overnight of smithing without a DOM,
// so all of that lives here now and legacy.js delegates. Everything the
// function used to READ off a global (G.inventory, G.unlockedRecipes,
// ITEMS, getBonus, HearthriseTools, the cooking level) arrives as an
// argument; everything it used to DO to the world (addItem, removeItem,
// addXp, notify, updateDaily, renderSkillDetail) comes back as a
// description the caller applies.
//
// THE BURN MATHS moved here too, from src/features/cooking-fire.js — that
// file is a CLASSIC script, which Deno cannot import, and the burn chance
// is a rate the server must be able to compute. cooking-fire.js is now a
// delegating shim over these exports, with its constants exposed as
// getters so there is exactly ONE copy of BASE / KITCHEN_NO_BURN rather
// than a core copy and a client copy that drift.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { advanceToolCarry } from './tools.js?v=455';

/* ── Burn (open-fire cooking) ─────────────────────────────────────────
   Values unchanged from b225 / b227. Documented at length in
   src/features/cooking-fire.js, which still owns the player-facing copy;
   only the numbers and the rate function live here. */
export const BURN_BASE = 0.25;              // burn chance at the recipe's req level
export const BURN_PER_LEVEL_RELIEF = 0.01;  // -1pp per cooking level above req
export const BURN_XP_SHARE = 0.25;          // consolation XP as a share of recipe XP
export const BURNT_ITEM = 'burnt_food';

/* One entry per Kitchen rung. L4/L5 restate 0.25 because a rung's bonus map
   REPLACES the rung below it — an L4 that omitted noBurn would silently
   un-burn-proof a player as a reward for upgrading. */
export const KITCHEN_NO_BURN = [0.13, 0.19, 0.25, 0.25, 0.25];

/**
 * The odds this cook is ruined.
 * @param recipe        an ARTISAN_RECIPES cooking entry (reads .req)
 * @param cookingLevel  the player's cooking level
 * @param noBurn        getBonus('noBurn') as a fraction (0.13 = 13 points off)
 */
export function burnChance(recipe, cookingLevel, noBurn) {
  const req = (recipe && typeof recipe.req === 'number') ? recipe.req : 1;
  const lv = (typeof cookingLevel === 'number' && isFinite(cookingLevel)) ? cookingLevel : 1;
  const relief = (typeof noBurn === 'number' && isFinite(noBurn)) ? Math.max(0, noBurn) : 0;
  const mastery = Math.max(0, lv - req) * BURN_PER_LEVEL_RELIEF;
  const c = BURN_BASE - relief - mastery;
  if (!(c > 0)) return 0;
  return Math.min(BURN_BASE, c);
}

/** Whole-percent form for UI copy. burnChance(...)=0.12 -> 12 */
export function burnPct(recipe, cookingLevel, noBurn) {
  return Math.round(burnChance(recipe, cookingLevel, noBurn) * 100);
}

/** XP still awarded when a cook burns. Always at least 1 — never a zero. */
export function burnXp(recipe) {
  const xp = (recipe && Number(recipe.xp)) || 0;
  if (xp <= 0) return 0;
  return Math.max(1, Math.round(xp * BURN_XP_SHARE));
}

/* ── Recipe shape helpers ─────────────────────────────────────────────
   Two recipe dialects ship side by side: the modern `inputs:{id:qty}` dict
   and the legacy `input` + `inputQty` + `secondary`. One reader, so a new
   consumer (the server) cannot learn only half the schema. */
export function recipeInputs(recipe) {
  if (!recipe) return {};
  if (recipe.inputs) return recipe.inputs;   // by reference, as legacy.js did — never mutated
  const i = {};
  if (recipe.input) i[recipe.input] = recipe.inputQty || 1;
  if (recipe.secondary) Object.keys(recipe.secondary).forEach((k) => { i[k] = recipe.secondary[k]; });
  return i;
}

/** The first input the bag cannot cover, or null. Naming it is what lets the
    caller say "Out of Iron Ore" instead of "Out of materials". */
export function missingInput(recipe, inventory) {
  const inp = recipeInputs(recipe);
  const inv = inventory || {};
  for (const id in inp) { if ((inv[id] || 0) < inp[id]) return id; }
  return null;
}

export function hasInputs(recipe, inventory) {
  return missingInput(recipe, inventory) === null;
}

export function gateOk(recipe, unlockedRecipes) {
  if (!recipe || !recipe.gated) return true;
  return !!(unlockedRecipes && unlockedRecipes[recipe.gated]);
}

/* b227 — THE MATERIAL-ONLY YIELD LAW (homestead-deepening.md §3.5 / H6).
   `yield_*` and `craftSave` may fire ONLY on a recipe whose output has no
   `type` — a bar, a plank, a dish; never a weapon, armour or jewel. The
   vendor pays full item `v`, so a 20% extra-output roll on a Slagheart
   Platebody prints six figures a session. Any future building in either
   pillar that grants extra output must carry this same predicate. */
export function isMaterialOutput(recipe, items) {
  const out = recipe && recipe.output;
  if (!out) return false;
  const def = (items && items[out]) || null;
  return !!def && !def.type;
}

/** The stat/daily/quest counters a SUCCESSFUL action ticks, per bench.
    One table, because b217 shipped a bug where the live path bumped
    G.stats but not the daily/quest trackers and "Cook 5 dishes" became
    uncompletable. A single map cannot half-update. */
export const BENCH_COUNTERS = {
  cooking: { stats: { cooked: 1 }, progress: ['cooked'] },
  smithing: { stats: { refined: 1, smithed: 1 }, progress: ['smithed'] },
  crafting: { stats: { refined: 1, crafted: 1 }, progress: ['crafted'] },
  /* The two new benches count as CRAFTS. Deliberately reusing the `crafted`
     progress key rather than minting `bound` / `quarried` keys: a progress key
     is only real if a daily/quest actually names it, and inventing two that
     nothing reads would be a counter that ticks into the void — the same
     ghost-key failure §5.1 rejects for speed perks. Reusing `crafted` means
     "craft N things" dailies are completable at the new benches from day one,
     which is what a player expects of a skill in the Artisan column.
     `refined: 1` matches smithing/crafting so the lifetime stat is comparable. */
  runecrafting: { stats: { refined: 1, crafted: 1 }, progress: ['crafted'] },
  stonemason:   { stats: { refined: 1, crafted: 1 }, progress: ['crafted'] },
};

/**
 * One artisan production tick, start to finish.
 *
 * @param recipe an ARTISAN_RECIPES row
 * @param ctx {
 *   skillId, inventory, unlockedRecipes, items,
 *   cookingLevel, noBurn,          // burn inputs; cooking only
 *   bonus(key),                    // craftSave, yield_<skill>
 *   toolCarry, toolDouble, toolXpB,
 *   rng
 * }
 * @returns {
 *   ok, reason?, missing?,         // reason: 'no_recipe' | 'inputs' | 'gate'
 *   consumed:{id:qty}, saved,      // saved = craftSave refunded the inputs
 *   burnt, produced:{id,qty}|null,
 *   extraYield, toolDoubles,
 *   xpSkill, xpAmount,
 *   stats:{}, progress:[], events:[]
 * }
 *
 * ORDER OF RNG DRAWS IS PART OF THE CONTRACT: craftSave, then burn, then
 * yield. A replay that reorders them is a different replay. Each uses
 * rng.chance(), which by contract consumes NO draw at p<=0 or p>=1 — so a
 * player with no Lathe and a player with a 0% Lathe see the same stream.
 *
 * The caller applies the result. Nothing here writes an inventory, grants
 * XP, or speaks to the player.
 */
export function resolveArtisanAction(recipe, ctx) {
  const c = ctx || {};
  const rng = c.rng;
  const skillId = c.skillId;
  const bonus = typeof c.bonus === 'function' ? c.bonus : () => 0;
  const fail = (reason, missing) => ({
    ok: false, reason, missing: missing || null,
    consumed: {}, saved: false, burnt: false, produced: null,
    extraYield: 0, toolDoubles: 0, xpSkill: skillId, xpAmount: 0,
    stats: {}, progress: [], events: [],
  });

  if (!recipe) return fail('no_recipe');

  /* b374 — WHICH SKILL A RECIPE PAYS is a property of the recipe, not always
     the bench it sits on. The Stonemason quarry lane (rubble/granite/basalt)
     is rock GATHERING and pays Mining (Tyler: "gathering the rocks should be
     mining, refining them is the stonemason part"); the refine lanes below it
     keep paying the bench. A recipe declares `xpSkill` to redirect its grant;
     everything else falls through to the bench id, so this is invisible to the
     999 recipes that do not set it. The bench (skillId) still owns the counters
     and the gate — only the XP pool moves. */
  const xpSkillId = (recipe && recipe.xpSkill) || skillId;

  const missing = missingInput(recipe, c.inventory);
  /* legacy.js checked inputs BEFORE the gate, and the order is observable:
     an ungated-but-unaffordable recipe says "Out of X", not "Recipe locked". */
  if (missing !== null) return fail('inputs', missing);
  if (!gateOk(recipe, c.unlockedRecipes)) return fail('gate');

  const material = isMaterialOutput(recipe, c.items);
  const events = [];

  /* ── 1. craftSave (Workshop L4/L5) — a free craft, inputs refunded.
     Scoped to the crafting bench that sells it and to material outputs
     (H6), because a free 270,000g platebody is a gold faucet, not a
     better workshop. */
  const saved = !!(skillId === 'crafting' && material && rng.chance(bonus('craftSave')));
  const consumed = saved ? {} : Object.assign({}, recipeInputs(recipe));
  if (saved) events.push({ type: 'craftSave', recipe: recipe.id });

  /* ── 2. the burn roll (cooking only; a forge does not "burn" a sword).
     The ingredients are already gone either way — that is the honest cost. */
  if (skillId === 'cooking' && recipe.output) {
    const chance = burnChance(recipe, c.cookingLevel, c.noBurn);
    if (chance > 0 && rng.chance(chance)) {
      events.push({ type: 'burn', recipe: recipe.id, output: recipe.output, got: BURNT_ITEM });
      return {
        ok: true, reason: null, missing: null,
        consumed, saved, burnt: true,
        produced: { id: BURNT_ITEM, qty: 1 },
        extraYield: 0, toolDoubles: 0,
        xpSkill: xpSkillId, xpAmount: burnXp(recipe),
        /* NO cooked/daily/quest counter. A "cook N dishes" goal counts
           SUCCESSFUL cooks only — letting a burn tick it would make the
           mechanic both invisible and dishonest. Nothing deadlocks: raw
           ingredients are infinitely gatherable. */
        stats: { burnt: 1 }, progress: [], events,
      };
    }
  }

  /* ── 3. yield_<skill> (Kitchen L4/L5, Forge L4/L5). The top rungs of a
     bench pay in OUTPUT, not speed: ms x (1 - speed) runs out of room at
     1.0, and an extra Cooked Shark is a thing you can see in the bag. */
  const extraYield = (recipe.output && material && rng.chance(bonus('yield_' + skillId))) ? 1 : 0;

  let qty = (recipe.outputQty || 1) + extraYield;

  /* ── 4. the artisan tool double — a DETERMINISTIC fractional carry, never
     an RNG roll, so the away replay is byte-identical run to run. */
  let toolDoubles = 0;
  if ((c.toolDouble || 0) > 0 && c.toolCarry) {
    toolDoubles = advanceToolCarry(c.toolCarry, skillId, qty, c.toolDouble);
    qty += toolDoubles;
  }

  const toolXpB = c.toolXpB || 0;
  const xpAmount = toolXpB > 0 ? recipe.xp * (1 + toolXpB) : recipe.xp;

  const bench = BENCH_COUNTERS[skillId];
  const stats = bench ? Object.assign({}, bench.stats) : {};
  if (toolDoubles > 0) stats.toolDoubles = (stats.toolDoubles || 0) + toolDoubles;

  const produced = recipe.output ? { id: recipe.output, qty } : null;
  if (produced) events.push({ type: 'produce', id: produced.id, qty: produced.qty });

  return {
    ok: true, reason: null, missing: null,
    consumed, saved, burnt: false, produced,
    extraYield, toolDoubles,
    xpSkill: xpSkillId, xpAmount,
    stats, progress: bench ? bench.progress.slice() : [],
    events,
  };
}
