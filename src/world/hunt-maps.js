// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-maps.js — WHICH WORLD MAP A FIGHT IS FOUGHT ON.
//
// Derived, never authored: a map row lists the hunts it renders (`hunts`), and
// each hunt's spawns (src/data/hunts.js) name its monsters, so a named hunt or a
// training fight on one of its monsters both land on that map
// (core/scene-route.js huntMapIndex). A new hunt map is a map row; nothing here
// changes. The spawn weights the bystanders are drawn from come from the same
// hunt row.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_INDEX } from '../data/hunts.js?v=577';
import { WORLD_MAPS } from '../data/world/maps/index.js?v=577';
import { huntMapIndex } from './core/scene-route.js?v=577';

export const HUNT_MAP_INDEX = huntMapIndex(WORLD_MAPS, HUNT_INDEX);

/** The hunt a map renders first, for its id and spawn weights: { id, spawns } or null. */
export function huntOfMap(map) {
  const id = map && map.hunts && map.hunts[0];
  const h = id && HUNT_INDEX[id];
  return h ? { id, spawns: h.spawns || [] } : null;
}
