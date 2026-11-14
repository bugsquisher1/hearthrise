// ════════════════════════════════════════════════════════════════════════
// src/world/town-works.js — THE TOWN WORKS ON THE MAP (display only).
//
// world-boot.js calls this every town frame with what hr_town_extras added to the last town answer, {works: {<project>: <stage>}}. A lot is a placed map object, at stage 0's art
// (src/data/world/town/sites.js), so it blocks a step from stage 0, draws in the y-sort with the people and takes a tap. The answer swaps that object's art, a
// { <stage 0's art>: <this stage's art> } that core/compose.js reads as state.objectSwap. Not the Great Hearth's ambient swap: an ambient row is drawn after the light, over
// everyone, so a hero south of the lot would stand behind its front wall, and a tap would never reach it.
// PURE: no DOM, no window, no clock. Nothing here can be spent, and nothing reads this but the frame.
// ════════════════════════════════════════════════════════════════════════
import { TOWN_WORKS } from '../data/town-works.js?v=0.2.130';

/* made once: this runs every town frame */
const SWAPS = new Map(Object.entries(TOWN_WORKS).map(([id, p]) => [id, p.stages.map((s) => Object.freeze({ [p.stages[0].art]: s.art }))]));

/**
 * @param {{id?: string}} map  compileMap() output (a town)
 * @param {{works?: Object<string, number>}|null} extras  TownPresence.extras()
 * @returns {object|null} an object swap, or null while every lot on this map is at stage 0
 */
export function townWorksSwap(map, extras) {
  const works = extras && extras.works;
  if (!works || typeof works !== 'object' || !map) return null;
  let out = null;
  for (const [id, swaps] of SWAPS) {
    if (TOWN_WORKS[id].map !== map.id) continue;
    const stage = works[id];
    if (!Number.isInteger(stage) || stage < 1 || stage >= swaps.length) continue;
    out = out ? Object.assign({}, out, swaps[stage]) : swaps[stage];
  }
  return out;
}
