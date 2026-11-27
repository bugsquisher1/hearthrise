// src/core/hunt/play-rows.js — THE MONSTER ROWS AN INSTANCE PLAYS, out of combat-sim.js (its under-600 rule): huntPlayOf below, and
// swingRows: the rows one swing reads. PURE ESM, dual-runtime.

import { HUNT_GROUNDS, monstersOn } from '../../data/hunt-grounds.js';
import { MONSTERS } from '../../data/monsters.js';
import { runRulesOf } from '../../data/tower.js';
import { formulaOn, formulaTable } from './monster-formula.js';
import { hallTable } from './hall-formula.js';

/**
 * WHAT AN INSTANCE PLAYS ON `groundId`: { monsters }, the ONE door every reader of a monster row takes (world-step.js inst.monsters,
 * hunt-rewards.js ctx.monsters). The SAME answer on the server's settle and the browser's live view:
 *   monsters  a keyed hall's table with its switch on (its bosses on the formula, hall-formula.js), else the catalogue with the ground's
 *             own drop rows on its monsters (groundDropsOn: the Catacombs' wings), else null: the catalogue as written, so every other
 *             hunt reads exactly what it always read
 * THE BURNING TOWER (src/core/hunt/tower.js) answers null; its `monsters` are the floor standing's table, which simulateHuntInstance sets on
 * this answer floor by floor (a fresh object every call). How hard a ground plays is its Danger scale step (danger.js dangerDial), never a
 * row of its own here (the tier rows and the scaled hunts retired for the scale, lane/retire-tier-chain 2026-11-26).
 */
export function huntPlayOf(groundId) {
  if (runRulesOf(groundId)) return { monsters: null };
  return { monsters: hallTable(groundId, MONSTERS) || groundDropsOn(groundId, MONSTERS) };
}

/* A GROUND'S OWN DROP ROWS (src/data/hunt-grounds.js `drops`: the Catacombs' wings, src/data/catacomb-wings.js; lane/r10-more-grounds): every
   monster that stands on the ground carries them after its own rows, so no earlier draw on the seeded stream moves (loot-bands.js), through the
   instance's one door to a monster row. Null for a ground with none, so every other hunt reads exactly what it always read. The unscaled
   table is built once a ground (the same rows every call, viewed or settled). */
const GROUND_DROPS = new Map();
function groundDropsOn(groundId, base) {
  const g = Object.prototype.hasOwnProperty.call(HUNT_GROUNDS, groundId) ? HUNT_GROUNDS[groundId] : null;
  if (!g || !Array.isArray(g.drops) || !g.drops.length) return null;
  if (base === MONSTERS && GROUND_DROPS.has(groundId)) return GROUND_DROPS.get(groundId);
  const out = Object.assign({}, base);
  for (const id of monstersOn(g)) if (out[id]) out[id] = { ...out[id], drops: (out[id].drops || []).concat(g.drops) };
  if (base === MONSTERS) GROUND_DROPS.set(groundId, out);
  return out;
}

/* On the Danger scale on a formula ground (monster-formula.js) every monster on its role's derived row (rewards read play.monsters: a
   derived row keeps its drops, coin and XP); anywhere else the play's own (null: the catalogue). */
export function swingRows(groundId, play, onScale) {
  return onScale && formulaOn(groundId) ? formulaTable(groundId, play.monsters || MONSTERS) : play.monsters;
}
