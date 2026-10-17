// ============================================================================
// supabase/functions/hr-accrue/hunt-ground.js — WHERE A HUNT IS FOUGHT, SERVER-SIDE.
//
// A hunt runs only on a ground (src/data/hunt-grounds.js, HUNT_SCREEN_SPEC
// §1.2): the pockets, packs, route and respawn of the world the engine steps.
// `huntGroundOf(huntId)` answers that row and its walkable grid, or null when
// the hunt has no ground — and then the hunt cannot be entered at all
// (hr_hunt_enter refuses `no_ground` from the generated hr_hunt_grounds) and a
// settle of it prices nothing. There is no single-foe fallback (spec §1.1).
//
// THE GRID is the ground's world map (src/data/world/maps) read through the
// material table (src/data/world/terrain.js MATERIALS): a `solid` material
// blocks walking and sight. ⚠ OBJECT FOOTPRINTS ARE NOT IN IT: what a placed
// sprite blocks is known only from the atlas manifests the client loads, so
// until the world lane exports the compiled collision mask as data (the map's
// `maskHash` is the contract), the server walks through a barrel the client
// draws. Open item, stated in the S1 report; no ground ships today.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

import { HUNT_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { WORLD_MAPS } from '../../../src/data/world/maps/index.js';
import { MATERIALS } from '../../../src/data/world/terrain.js';
import { makeGrid } from '../../../src/core/hunt/grid.js';

/** The walkable grid of world map `mapId` (materials only), or null. */
export function gridOfMap(mapId) {
  const map = WORLD_MAPS.find((m) => m.id === mapId);
  if (!map || !Array.isArray(map.rows) || !map.rows.length) return null;
  const solid = (x, y) => {
    const mat = MATERIALS[map.legend[map.rows[y][x]]];
    return !mat || mat.solid === true;
  };
  return makeGrid(map.rows[0].length, map.rows.length, (x, y) => !solid(x, y), (x, y) => solid(x, y));
}

/** The ground a hunt is fought on, with its grid: { ground, grid }, or null. */
export function huntGroundOf(huntId) {
  const ground = Object.values(HUNT_GROUNDS).find((g) => g.hunt === huntId) || null;
  if (!ground) return null;
  const grid = gridOfMap(ground.map);
  return grid ? { ground, grid } : null;
}
