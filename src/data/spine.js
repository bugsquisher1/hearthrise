// ════════════════════════════════════════════════════════════════════════
// src/data/spine.js — THE ONE SPINE: the ten steps a new character walks.
//
// The Game Designer's one-spine design (Tyler, 2026-10-11: "too many
// systems… hard to know what direction to take"). Each row is one step; a
// step is DONE when every fact in its `need` list is true on the SERVER's
// projection (src/core/spine-progress.js evaluates them, nothing else does).
//
// COLUMN OWNERSHIP. `step`, `id` and `need` are the Systems Engineer's: the
// predicate reads them and tests/reveal-coverage.mjs checks them. Lane L1 (the
// pointer bar) adds its DISPLAY columns (label, route, …) to these same rows;
// the predicate ignores any column it does not know.
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

const step = (n, id, need) => Object.freeze({ step: n, id, need: Object.freeze(need) });

export const SPINE_STEPS = Object.freeze([
  step(1, 'chop_logs', [count('chopped', 15)]),
  step(2, 'fish_and_cook', [count('fished', 5), count('cooked', 5)]),
  step(3, 'first_kills', [count('kills', 5)]),
  step(4, 'plant_seeds', [count('ev:planted', 1)]),
  step(5, 'homestead', [property(1)]),
  step(6, 'first_hand', [workers(1)]),
  step(7, 'first_craft', [count('crafted', 1)]),
  step(8, 'first_harvest', [count('ev:harvest', 6)]),
  step(9, 'seasoned', [count('kills', 100), combat(10)]),
  step(10, 'farmstead', [property(2)]),
]);
