// ============================================================
// src/core/artisan.js — A RECIPE ROW'S INPUTS.
//
// Two recipe dialects ship side by side: the modern `inputs:{id:qty}` dict and the older `input` + `inputQty` +
// `secondary`. ONE reader, so no consumer (the Hearth's fuel run in src/core/artisan-sim.js, the bag, the item
// tips, the catalogue generators) can learn only half the schema.
//
// The bench's arithmetic (the cooking burn, craftSave, the yield rolls, the jewel roll, the tool double) left with
// the one-town-work cut (09-crafting.md 4.17): town work is a company's jobs (src/core/trades.js).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/** `{ itemId: qty }` a row spends per action. By reference for the `inputs` dialect: never mutate it. */
export function recipeInputs(recipe) {
  if (!recipe) return {};
  if (recipe.inputs) return recipe.inputs;
  const i = {};
  if (recipe.input) i[recipe.input] = recipe.inputQty || 1;
  if (recipe.secondary) Object.keys(recipe.secondary).forEach((k) => { i[k] = recipe.secondary[k]; });
  return i;
}

/** The first input the pool cannot cover, or null. Naming it is what lets the caller say "Out of Bones"
    instead of "Out of materials". */
export function missingInput(recipe, inventory) {
  const inp = recipeInputs(recipe);
  const inv = inventory || {};
  for (const id in inp) { if ((inv[id] || 0) < inp[id]) return id; }
  return null;
}
