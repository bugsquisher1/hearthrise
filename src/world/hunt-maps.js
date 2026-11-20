// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-maps.js — WHICH WORLD MAP A FIGHT IS FOUGHT ON.
//
// Derived, never authored: a map row lists the hunts it renders (`hunts`), and
// each hunt's spawns (src/data/hunts.js) name its monsters, so a named hunt or a
// training fight on one of its monsters both land on that map
// (core/scene-route.js huntMapIndex). A new hunt map is a map row; nothing here
// changes. The spawn weights the bystanders are drawn from come from the same
// hunt row.
//
// THE RUN MAPS (lane/b-catacombs-client, 2026-11-18): a STAGED map a run ground is fought on (src/data/tower.js RUN_GROUNDS: the Unmarked
// Catacombs' two wings, each a pocket of the Catacombs' own map). The 165-185 hunting ground on that map stays staged (its pack is not
// graded or served: never listed, never routed here), but its painted ground and pieces shipped (lane/a-catacomb-art), and the descent is
// served behind its own switch, so the client draws the map for the wings ONLY: the row as the client holds it lists the run grounds and
// nothing else, so no other hunt or monster routes to it. Without it a descent watched would draw the town.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_INDEX } from '../data/hunts.js';
import { WORLD_MAPS, STAGED_MAPS } from '../data/world/maps/index.js';
import { runRulesOf } from '../data/tower.js';
import { huntMapIndex } from './core/scene-route.js';

/** The staged maps a run ground is fought on, each listing its run grounds only. */
const RUN_MAPS = Object.freeze(STAGED_MAPS.filter((m) => (m.hunts || []).some((h) => runRulesOf(h)))
  .map((m) => Object.freeze(Object.assign({}, m, { hunts: Object.freeze(m.hunts.filter((h) => runRulesOf(h))) }))));

/** Every map the World draws: the shipped ones, then the run maps. */
export const DRAWN_MAPS = Object.freeze([...WORLD_MAPS, ...RUN_MAPS]);

export const HUNT_MAP_INDEX = huntMapIndex(DRAWN_MAPS, HUNT_INDEX);

/** The hunt a map renders first: { id, name, spawns } or null. */
export function huntOfMap(map) {
  const id = map && map.hunts && map.hunts[0];
  const h = id && HUNT_INDEX[id];
  return h ? { id, name: h.name || map.name, spawns: h.spawns || [] } : null;
}
