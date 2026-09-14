// ============================================================================
// src/features/recipe-scrolls.js — THE LEARNED RECIPES, AND READING A SCROLL.
//                                  Extracted from src/legacy.js (2026-09-14)
//                                  with the server verb it now talks to.
//
// ── THE DEFECT, MEASURED IN THE ENGINE RATHER THAN GUESSED ──────────────────
// 2026-08-16-artisan-progress-model.sql built the STORAGE for a learned recipe —
// player_progress kind='flag', key='recipe:<scroll_id>', catalogued in
// hr_unlocks and read back by hr_perks_of as `unlockedRecipes` — and left the
// WRITE to a later author. That author never arrived, so nothing in the database
// had ever written a recipe flag for anybody.
//
// Meanwhile legacy.js wrapped `window.addItem`: picking a scroll up set
// `G.unlockedRecipes[id]` (RESIDUE) and, on a 100 ms setTimeout, called the LOCAL
// `removeItem`. Both halves were client authorship of server-owned state and
// both were invisible to the realm:
//   ATTENDED  the browser said "Recipe Unlocked" and the Forge opened the row;
//   AWAY      supabase/functions/hr-accrue reads hr_perks_of, saw `{}`, and
//             src/core/artisan-sim.js stopped the span at tick 0 with
//             STOP_REASON.GATE — every gated recipe, every night, silently.
// That is CLAUDE.md §6's 2026-09-14 rule in its purest form: the browser said one
// thing and the server said another, and the player only found out by leaving.
//
// ── WHY NO AMNESTY IS OWED (game-designer, final, 2026-09-14) ───────────────
// The consume was LOCAL, so the scroll never left player_inventory. Every scroll
// a player has "spent" is still in their bag on the server and still readable.
// Nothing was taken, so nothing has to be given back.
//
// ── THE SHAPE NOW ───────────────────────────────────────────────────────────
// A scroll stays in the bag like any other item, and READING it is a deliberate
// gesture (the bag's context menu → "Read"). hr_recipe_learn consumes ONE scroll
// and writes the flag in ONE transaction under the character lock; the recipe is
// unlocked by the ENVELOPE it returns, never by this client. A second scroll of a
// recipe already known is refused `already_learned` and is NOT eaten.
//
// FAIL-CLOSED, and it must stay that way: an unheard-from realm answers `{}`,
// which LOCKS a gated recipe rather than opening one. Opening on silence would be
// the residue-ahead class on a surface that can spend materials.
// ============================================================================

const G = () => (typeof window !== 'undefined' ? window.G : null);

/** The learned set in the client's own wire shape, `{ "<scroll_id>": true }` —
 *  the shape src/core/artisan.js gateOk reads on BOTH paths. Empty when the
 *  realm has not spoken. */
export function unlockedRecipesMap() {
  const g = G();
  const s = g && g._recipeUnlocks;
  return (s && s.map && typeof s.map === 'object') ? s.map : {};
}

export function knowsRecipe(id) { return !!unlockedRecipesMap()[id]; }

export const RECIPE_READ_TOASTS = Object.freeze({
  already_learned:  'You already know that recipe — the scroll is untouched.',
  insufficient_item:'That scroll is not in your bag',
  unknown_recipe:   'That scroll teaches nothing the realm knows',
  recipe_daily_cap: 'That is enough reading for today',
  no_character:     'Your character is still loading — try again in a moment',
  intent_mismatch:  'That went out twice — try again in a moment',
  rate_limited:     'Slow down a moment, then try again',
  not_signed_in:    'Sign in to learn recipes',
  rpc_missing:      'The realm can’t record that reading right now — your scroll is safe.',
});

function say(msg, kind) {
  try { if (typeof window.notify === 'function') window.notify(msg, kind); } catch (e) {}
}

const _inflight = Object.create(null);

/**
 * Read one recipe scroll. Sends the item id and an idempotency key; the SCROLL
 * is the price and the server holds it, so no currency crosses and none is named
 * here. Always resolves with the verdict.
 */
export function readRecipeScroll(id) {
  const ITEMS = (typeof window !== 'undefined' && window.ITEMS) || null;
  const def = ITEMS ? ITEMS[id] : null;
  if (!def || !def.recipe) return Promise.resolve({ ok: false, error: 'unknown_recipe' });
  if (knowsRecipe(id)) {
    /* Refused HERE as well as by the realm, and the belt-and-braces is
       deliberate: this is the one gesture that can waste a rare drop, and a
       round trip that ends in `already_learned` is a round trip that had to be
       right about not consuming anything. */
    say('You already know ' + def.n + '.', 'info');
    return Promise.resolve({ ok: false, error: 'already_learned' });
  }
  const GC = window.HearthriseGoalClaim;
  if (!GC || typeof GC.learnRecipe !== 'function') {
    say(RECIPE_READ_TOASTS.rpc_missing, 'kill');
    return Promise.resolve({ ok: false, error: 'rpc_missing' });
  }
  if (_inflight[id]) return Promise.resolve({ ok: false, inflight: true });
  _inflight[id] = true;
  let p;
  try { p = GC.learnRecipe(id); } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') {
    _inflight[id] = false;
    say(RECIPE_READ_TOASTS.rpc_missing, 'kill');
    return Promise.resolve({ ok: false, error: 'rpc_missing' });
  }
  return Promise.resolve(p).then((res) => {
    /* THE UNLOCK IS THE ENVELOPE'S. Adopted through accrue.js's reconciler so a
       receipt and an ordinary envelope land it by exactly one code path — and on
       `already_learned` too, which carries the set and means our picture was
       stale rather than that anything failed. */
    try {
      const A = window.HearthriseAccrual;
      if (A && typeof A.reconcileRecipes === 'function') A.reconcileRecipes(G(), res);
    } catch (e) {}
    if (res && res.ok === true) {
      say('Recipe Unlocked: ' + def.n, 'levelup');
      /* The SCROLL left the SERVER's bag, so ask for the bag rather than
         deleting a row locally: the count on screen is the realm's. */
      try {
        const R = window.HearthriseRecord;
        if (R && typeof R.requestRecord === 'function') {
          const r = R.requestRecord(); if (r && r.catch) r.catch(() => {});
        }
      } catch (e) {}
    } else {
      const code = String((res && res.error) || '');
      say(RECIPE_READ_TOASTS[code] || 'The realm couldn’t record that reading — your scroll is safe.',
        code === 'already_learned' ? 'info' : 'kill');
    }
    try { if (typeof window.renderInventory === 'function') window.renderInventory(); } catch (e) {}
    return res || { ok: false, error: 'bad_response' };
  }).catch(() => {
    say('No connection — your scroll is safe and still in your bag.', 'kill');
    return { ok: false, error: 'network' };
  }).then((r) => { _inflight[id] = false; return r; });
}

if (typeof window !== 'undefined') {
  window.unlockedRecipesMap = unlockedRecipesMap;
  window.knowsRecipe = knowsRecipe;
  window.readRecipeScroll = readRecipeScroll;
  window.HearthriseRecipeScrolls = { unlockedRecipesMap, knowsRecipe, readRecipeScroll, RECIPE_READ_TOASTS };
}
