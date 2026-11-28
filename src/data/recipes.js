// ════════════════════════════════════════════════════════════════════════
// src/data/recipes.js — THE HEARTH'S FUEL RUNS, the one artisan row left (docs/design/redesign/09-crafting.md 4.13 row 3, 4.17).
//
// THE BENCH IS CUT (lane/bench-cut-data, 2026-11-28). Every good is made by a job (src/data/trades.js KIT_RECIPES, the Work window's Jobs
// list): no bench recipe, no recipe to learn, no bench fee and no bench queue. What stays is a BRIDGE: the Great Hearth's `fuel_*` runs keep
// the artisan channel until F1 lights the company flame (21 section 1), and F1's lighting removes these rows, the channel and hr_apply's
// town-window path together. Nothing new is built on them.
//
// One row per fuel, BUILT from src/data/hearth.js HEARTH_FUELS (the ladder lives there; this file is its shape):
// `{id:'fuel_<item>', name, input, output:null, xp, req, ms}`. `output:null` makes each row a PURE SINK: src/core/artisan.js `recipeInputs`
// reads singular `input` (-> `{[input]:1}`) and `produced` is null when `output` is falsy.
//
// ⚠ ADDING A ROW (to HEARTH_FUELS) MOVES THE SERVER: tools/gen-catalogues.mjs emits one `hr_activities` row per recipe (kind 'artisan',
// req_skill 'inner_flame', req_lv = `req`), and `xp` and `ms` reach the server through the edge payload, which imports this file.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { ITEMS } from './items.js';
import { HEARTH_FUELS, fuelRecipeId } from './hearth.js';

/** The artisan rows by skill: the hearth's fuel runs, nothing else. */
export const ARTISAN_RECIPES = Object.freeze({
  inner_flame: Object.freeze(HEARTH_FUELS.map((f) => Object.freeze({
    id: fuelRecipeId(f.item), name: (ITEMS[f.item] && ITEMS[f.item].n) || f.item, input: f.item, output: null, xp: f.xp, req: f.req, ms: f.ms,
  })).sort((a, b) => (a.req || 0) - (b.req || 0))),
});

/** The same rows for the switch-aware readers (no fuel run is behind a switch, so it is the same table). */
export const ARTISAN_RECIPES_EVERY = ARTISAN_RECIPES;
