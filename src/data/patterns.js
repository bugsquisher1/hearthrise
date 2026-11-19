// ════════════════════════════════════════════════════════════════════════
// src/data/patterns.js — PATTERNS: A RARE THAT TEACHES ONE HERO A WORN RECIPE (docs/design/itemization-plan.md §5 "Patterns", the
// sample's row "Pattern: Kingsgrate Rivets"; designer 2026-11-19: learned PER HERO through the live server verb hr_recipe_learn)
//
// A pattern is an item, a Rare drop, that names ONE recipe. Reading it (the bag's Learn: src/session/recipe-intents.js) is ONE
// hr_recipe_learn (supabase/migrations/2026-09-14-recipe-learn.sql): the server takes one from THIS hero's bag, writes the hero's flag
// recipe:<pattern>, journals it, and answers the hero's whole learned set. hr_recipes_of projects that set as the envelope's
// `unlocked_recipes`; hr_perks_of hands the same rows to the engine, whose gate (src/core/artisan.js gateOk) reads the recipe's `gated`.
// Another hero of the account, and every other account, still meets a closed bench. So one row here is three rows in the shipped tables:
//   the ITEM   (items.js spreads PATTERN_ITEMS): `teaches` names the recipe it teaches (the bag's Learn reads it)
//   the GATE   (recipes.js byReq, patternGated): that recipe's `gated` names the pattern, so tools/gen-unlocks.mjs catalogues
//              recipe:<pattern> (its gate ids) and hr_recipe_learn accepts it
//   the DROPS  (monsters.js): a Rare row on each monster in `from`, among its Rares (before a key or trophy row)
// ⚠ NEVER `recipe` ON A PATTERN ITEM. The engine reads an item carrying `recipe` as a b352 AUTO-UNLOCK SCROLL: its drop becomes the
//   finder's recipe flag at once and never reaches a bag (supabase/functions/hr-accrue/accrual.js, the three `items[id].recipe` arms),
//   so it could not be traded, stored or read by the hero the player chooses. A pattern is an item until a hero reads it.
//   tests/pattern-learn.mjs holds this on the real settle: a live pattern's drop is credited to the bag as an item.
//
// HIDDEN (PATTERN_LINE.live false), as the fist line is (src/data/fists.js). While it is false none of the three reaches a shipped table:
// no item, no gate, no drop row, so no generated catalogue moves and the Steelgrate reforge stays open to every smith with a Kingsgrate,
// as it is today. tests/pattern-learn.mjs holds the hidden tree and plays a planted copy with `live` true (the bench opens for the hero
// who read the pattern and for no other). GOING LIVE is one lane: the switch, the pixel icon (item-art.js), the regenerated catalogues
// (gen-catalogues for hr_items, gen-unlocks for recipe:<id>, the hunt catalogues for the drop rows) and an edge deploy, in that order.
//
// Every number is PROPOSED (the designer's to retune). The chance is the Rat King's Rare rate (his Crown Shard and Knot sit at 1.4%, the
// Kingsgrate at 1.6%), held to the Rare band's 10-20 h a hero (src/data/loot-bands.js), measured on the real settle by the lane that set
// it. The book value is his Knot's: a pattern sells for little at the trader, its worth is the recipe.
//
// PURE ESM. Data only. Imports nothing.
// ════════════════════════════════════════════════════════════════════════

export const PATTERN_LINE = Object.freeze({
  /* THE SWITCH: false = no pattern is in any shipped table (see the header). */
  live: false,
});

/* One pattern: its item's name, book value and flavour line, the recipe it teaches, and the monsters that drop it ({ monster, ch, band }). */
const pattern = (n, v, recipe, from, desc) => Object.freeze({ n, icon: '📜', v, recipe,
  from: Object.freeze(from.map((r) => Object.freeze({ band: 'rare', ...r }))), desc });

export const PATTERNS = Object.freeze({
  /* THE SAMPLE (plan §4): the Steelgrate reforge is learned from the Rat King. His ground table and his called copy's (boss-calls.js: a
     called boss pays his own ground rows at the ground's rates) carry it alike. */
  kingsgrate_rivets: pattern('Kingsgrate Rivets', 150, 'reforge_steelgrate',
    [{ monster: 'rat_king', ch: 0.014 }, { monster: 'rat_king_called', ch: 0.014 }],
    'A smith\'s pattern for riveting the Rat King\'s grate onto a steel frame. Learn it to reforge a Kingsgrate as the Steelgrate'),
});

const LIVE = PATTERN_LINE.live ? Object.entries(PATTERNS) : [];

/** The pattern items, by id: what items.js spreads (empty while the line is hidden). An item row's `teaches` is the recipe it teaches. */
export const PATTERN_ITEMS = Object.freeze(Object.fromEntries(LIVE.map(([id, p]) => [id, Object.freeze({ n: p.n, icon: p.icon, v: p.v, teaches: p.recipe })])));

/** The pattern items' flavour lines (item-descriptions.js spreads them; empty while hidden). */
export const PATTERN_DESC = Object.freeze(Object.fromEntries(LIVE.map(([id, p]) => [id, p.desc])));

/** recipe id -> the pattern that gates it (empty while hidden). One pattern a recipe: a second one naming the same recipe is refused. */
export const PATTERN_GATES = Object.freeze(LIVE.reduce((m, [id, p]) => {
  if (Object.prototype.hasOwnProperty.call(m, p.recipe)) throw new Error('patterns: ' + p.recipe + ' is taught by ' + m[p.recipe] + ' and ' + id);
  m[p.recipe] = id;
  return m;
}, {}));

/** monster id -> the pattern rows it drops ({ id, ch, band }, in authoring order; empty while hidden). */
export const PATTERN_DROPS = Object.freeze(Object.fromEntries(Object.entries(LIVE.reduce((m, [id, p]) => {
  for (const r of p.from) (m[r.monster] = m[r.monster] || []).push(Object.freeze({ id, ch: r.ch, band: r.band }));
  return m;
}, {})).map(([monster, rows]) => [monster, Object.freeze(rows)])));

/** `recipe` with its pattern's gate when a live pattern teaches it, else `recipe` itself (the same object). A recipe gated already is
    refused: one gate a recipe. */
export function patternGated(recipe) {
  const id = recipe && Object.prototype.hasOwnProperty.call(PATTERN_GATES, recipe.id) ? PATTERN_GATES[recipe.id] : null;
  if (!id) return recipe;
  if (recipe.gated && recipe.gated !== id) throw new Error('patterns: ' + recipe.id + ' is gated by ' + recipe.gated + ' already');
  return Object.freeze({ ...recipe, gated: id });
}
