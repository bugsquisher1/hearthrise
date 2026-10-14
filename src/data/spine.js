// ════════════════════════════════════════════════════════════════════════
// src/data/spine.js — THE ONE SPINE: the steps a character walks, in order.
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
//   item(id, min)       the server bag holds at least `min`
// ONE KEY PER FACT: fights are `ev:kill_any` and dishes `ev:cooked`, the
// counters hr_claim_quest grades, so a step and its quest never disagree.
// Every count only grows, so a done step stays done. `item` can fall (the
// building stock is spent on the Manor, the pelts on the Keep); the reveal
// reads the furthest step done, so a later step keeps everything it revealed.
//
// Steps 11-21 (Designer ruling 2026-10-11) carry the old Journeyman's Road
// between the Manor, Keep and Castle; cooking and harvest come last because a
// crop timer must not hold the single pointer, and a step already met is
// passed straight by.
//
// Needs that differ from the step's words, on purpose:
//   step 3 counts ANY 5 kills (slime is the T1 starter, but a player who
//          opened on goblins must not be trapped before the Farm);
//   step 5 is the Homestead rung alone (its cost already demands the copper);
//   step 7 is the first craft of any kind (crafted gear was deleted in the
//          2026-10-14 demolition; the counter is unchanged).
//
// Steps 13 and 17 were rewritten by the designer ruling of 2026-10-14
// (Stonemason and dungeons cut): step 13 makes the Manor's building stock,
// step 17 hunts the bear pelts the Keep is built with.
// PURE ESM. No DOM, no window. Imports cleanly in Node.
// ════════════════════════════════════════════════════════════════════════

export const count = (key, min) => Object.freeze({ fact: 'count', key, min });
export const combat = (min) => Object.freeze({ fact: 'combat', min });
export const property = (min) => Object.freeze({ fact: 'property', min });
export const workers = (min) => Object.freeze({ fact: 'workers', min });
export const companions = (min) => Object.freeze({ fact: 'companions', min });
export const item = (id, min) => Object.freeze({ fact: 'item', id, min });

const step = (n, id, need, via, whenDone) => Object.freeze({
  step: n, id, need: Object.freeze(need), via: Object.freeze(via), whenDone,
});

export const SPINE_STEPS = Object.freeze([
  step(1, 'chop_logs', [count('chopped', 15)], ['pane:skills', 'skill:woodcutting'], 'chop fifteen logs'),
  step(2, 'fish_and_cook', [count('fished', 5), count('ev:cooked', 5)], ['skill:fishing', 'skill:cooking'], 'catch and cook five fish'),
  step(3, 'first_kills', [count('ev:kill_any', 5)], ['pane:combat'], 'win five fights'),
  step(4, 'plant_seeds', [count('ev:planted', 1)], ['pane:farming', 'pane:shop'], 'plant your first seeds'),
  step(5, 'homestead', [property(1)], ['skill:mining', 'pane:house'], 'build your Hearthside Homestead'),
  step(6, 'first_hand', [workers(1)], ['pane:house', 'card:workers'], 'hire your first hand'),
  step(7, 'first_craft', [count('crafted', 1)], ['pane:combat', 'skill:crafting'], 'craft your first item'),
  step(8, 'first_harvest', [count('ev:harvest', 6)], ['pane:farming'], 'harvest six crops'),
  step(9, 'seasoned', [count('ev:kill_any', 100), combat(10)], ['pane:combat'], 'win a hundred fights and reach Combat 10'),
  step(10, 'farmstead', [property(2)], ['pane:house'], 'build your Fieldworth Farmstead'),
  step(11, 'road_forge', [count('ev:smithed', 60)], ['skill:smithing'], 'smith sixty items'),
  step(12, 'road_craft', [count('ev:crafted', 60)], ['skill:crafting'], 'craft sixty items'),
  step(13, 'building_stock', [item('iron_fitting', 6), item('timber_beam', 6)], ['skill:smithing', 'skill:crafting'], 'make six iron fittings and six timber beams'),
  step(14, 'road_gather', [count('ev:gather', 500)], ['pane:skills'], 'gather five hundred resources'),
  step(15, 'manor', [property(3)], ['pane:house'], 'build Stonecross Manor'),
  step(16, 'road_hunt', [count('ev:kill_any', 500)], ['pane:combat'], 'win five hundred fights'),
  step(17, 'bear_hunt', [combat(45), item('bear_pelt', 5)], ['pane:combat'], 'reach Combat 45 and bring home five bear pelts'),
  step(18, 'keep', [property(4)], ['pane:house'], 'build Ironvale Keep'),
  step(19, 'road_cook', [count('ev:cooked', 60)], ['skill:cooking'], 'cook sixty dishes'),
  step(20, 'road_harvest', [count('ev:harvest', 40)], ['pane:farming'], 'harvest forty crops'),
  step(21, 'castle', [property(5)], ['pane:house'], 'build Hearthrise Castle'),
]);
