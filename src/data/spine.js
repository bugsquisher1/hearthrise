// ════════════════════════════════════════════════════════════════════════
// src/data/spine.js — THE ONE SPINE: the ten steps a new character walks.
//
// The Game Designer's one-spine design (Tyler, 2026-10-11: "too many
// systems… hard to know what direction to take"). Each row is one step; a
// step is DONE when every fact in its `need` list is true on the SERVER's
// projection (src/core/spine-progress.js evaluates them, nothing else does).
//
// COLUMN OWNERSHIP. `step`, `id`, `need`, `via` and `whenDone` are the Systems
// Engineer's: the predicate reads them and tests/reveal-coverage.mjs checks
// them. Lane L1 (the pointer bar) adds its DISPLAY columns (label, route, …) to
// these same rows; the predicate ignores any column it does not know.
//   via       the reveal ids a player must reach to PLAY the step. Each one
//             opens no later than the step becomes current (guard R6), so no
//             step can wait behind a door it opens itself.
//   whenDone  how the step is finished, as the end of "… opens when you …":
//             the tour names a shut door's opening with it.
//
// A NEED IS A SERVER FACT, never a client field. The vocabulary is closed and
// lives in src/core/spine-progress.js FACTS:
//   count(key, min)     a permanent `stat` progress row (period '') >= min
//   combat(min)         combat level derived from the server's skill XP map
//   property(min)       the server's property rung (hr_unlock_buy)
//   workers(min)        hired hands the envelope projects (`res.workers`)
// Every fact the server can confirm only ever grows, so a done step stays
// done and nothing it revealed is ever taken away.
//
// Three needs differ from the step's words, on purpose:
//   step 3 counts ANY 5 kills (slime is the T1 starter, but a player who
//          opened on goblins must not be trapped before the Farm);
//   step 5 is the Homestead rung alone (its cost already demands the copper);
//   step 7 is the first craft (what is WORN changes; a reveal must not).
// PURE ESM. No DOM, no window. Imports cleanly in Node.
// ════════════════════════════════════════════════════════════════════════

export const count = (key, min) => Object.freeze({ fact: 'count', key, min });
export const combat = (min) => Object.freeze({ fact: 'combat', min });
export const property = (min) => Object.freeze({ fact: 'property', min });
export const workers = (min) => Object.freeze({ fact: 'workers', min });
export const companions = (min) => Object.freeze({ fact: 'companions', min });

const step = (n, id, need, via, whenDone) => Object.freeze({
  step: n, id, need: Object.freeze(need), via: Object.freeze(via), whenDone,
});

export const SPINE_STEPS = Object.freeze([
  step(1, 'chop_logs', [count('chopped', 15)], ['pane:skills', 'skill:woodcutting'], 'chop fifteen logs'),
  step(2, 'fish_and_cook', [count('fished', 5), count('cooked', 5)], ['skill:fishing', 'skill:cooking'], 'catch and cook five fish'),
  step(3, 'first_kills', [count('kills', 5)], ['pane:combat'], 'win five fights'),
  step(4, 'plant_seeds', [count('ev:planted', 1)], ['pane:farming', 'pane:shop'], 'plant your first seeds'),
  step(5, 'homestead', [property(1)], ['skill:mining', 'pane:house'], 'build your Hearthside Homestead'),
  step(6, 'first_hand', [workers(1)], ['pane:house', 'card:workers'], 'hire your first hand'),
  step(7, 'first_craft', [count('crafted', 1)], ['pane:combat', 'skill:crafting'], 'craft your first piece of gear'),
  step(8, 'first_harvest', [count('ev:harvest', 6)], ['pane:farming'], 'harvest six crops'),
  step(9, 'seasoned', [count('kills', 100), combat(10)], ['pane:combat'], 'win a hundred fights and reach Combat 10'),
  step(10, 'farmstead', [property(2)], ['pane:house'], 'build your Fieldworth Farmstead'),
]);
