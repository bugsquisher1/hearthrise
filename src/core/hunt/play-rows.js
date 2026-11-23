// src/core/hunt/play-rows.js — THE MONSTER ROWS AN INSTANCE PLAYS, out of combat-sim.js (its under-600 rule): huntPlayOf below, and
// swingRows: the rows one swing reads. PURE ESM, dual-runtime.

import { HUNT_GROUNDS, monstersOn } from '../../data/hunt-grounds.js';
import { tierRowOf, DEFAULT_TIER } from '../../data/hunt-tiers.js';
import { MONSTERS } from '../../data/monsters.js';
import { scaleLevelFor, scaledMonsters, scaledTierRow } from '../../data/scaled-hunts.js';
import { runRulesOf } from '../../data/tower.js';
import { formulaOn, formulaTable } from './monster-formula.js';
import { hallTable } from './hall-formula.js';

/**
 * WHAT AN INSTANCE PLAYS ON `groundId` UNDER THE SERVER'S `scale` (src/data/scaled-hunts.js; Tyler 2026-11-07 "party would scale to the
 * leader"). `scale` is { level } when the server says the leader's paid hours scale this window (hr_scaled_hunt_of: the switch on, hours
 * banked, the leader past the ground's band), else null. The SAME answer on the server's settle and the browser's live view:
 *   level     the Level the ground plays at, or null (unscaled, and a scale the data can't play is unscaled too: never half a scale)
 *   monsters  the catalogue with the ground's roster on its scaled rows, the ONE door every reader of a monster row takes (world-step.js
 *             inst.monsters, hunt-rewards.js ctx.monsters); null unscaled, so an unscaled hunt reads exactly what it always read, except
 *             on a ground with its own drop rows (groundDropsOn: the catalogue with those rows on its monsters)
 *   tierOf    a tier pick's row: unscaled, the ground's own (hunt-tiers.js); scaled, the sheet's at the scaled floor (scaledTierRow), and a
 *             pick the scaled ground doesn't offer (Deadly) plays Normal
 *   normalOf  true for a pick that plays Normal for that reason: its frozen pull goes with it (the ground as it stands)
 * THE BURNING TOWER (src/core/hunt/tower.js) is never scaled and plays Normal whatever the leader picked (one difficulty: the floor is the dial);
 * its `monsters` are the floor standing's table, which simulateHuntInstance sets on this answer floor by floor (a fresh object every call).
 */
export function huntPlayOf(groundId, scale) {
  if (runRulesOf(groundId)) return { level: null, monsters: null, tierOf: () => null, normalOf: () => true };
  const asked = scale && Number.isInteger(scale.level) ? scale.level : null;
  const level = asked !== null && scaleLevelFor(groundId, asked) === asked ? asked : null;
  /* A KEYED HALL WITH ITS SWITCH ON (src/core/hunt/hall-formula.js): its bosses on the formula, through the one door (never scaled: a hall has no scale) */
  if (level === null) return { level: null, monsters: hallTable(groundId, MONSTERS) || groundDropsOn(groundId, MONSTERS), tierOf: (id) => tierRowOf(groundId, id), normalOf: () => false };
  const scaled = Object.assign({}, MONSTERS, scaledMonsters(MONSTERS, groundId, level));
  const monsters = groundDropsOn(groundId, scaled) || scaled;
  const own = (id) => scaledTierRow(groundId, id, level);
  return { level, monsters, tierOf: (id) => own(id) || tierRowOf(groundId, DEFAULT_TIER), normalOf: (id) => id !== DEFAULT_TIER && own(id) === null };
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
