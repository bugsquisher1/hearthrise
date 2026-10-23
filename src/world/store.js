// ════════════════════════════════════════════════════════════════════════
// src/world/store.js — WHAT THE WORLD READS, AND THE ONE THING IT WRITES.
//
// READS server state as the client holds it, never a client opinion of it:
// the fight pointer (`activeMonster` / `_huntId`, which reconcileActivityPointer
// keeps on the server's `active_kind`/`active_id`). Nothing here predicts.
//
// WRITES only `G._world` — display scratch: the viewer's pick of town or home,
// and `pos`, where the local hero stands while you tap it about the town or
// your home ({ map, x, y } in tiles). It is `_`-prefixed, so it is never in the
// residue (RESIDUE_FIELDS is an allowlist) and never an intent (in a town the
// World hands it to the character's TownPresence, which shows it to the other
// players there); a reload forgets it, which is correct for a view. tests/world-no-authority.mjs fails the build
// on any other write to G.
// ════════════════════════════════════════════════════════════════════════
import { SCENE_MAPS } from '../data/world/maps/index.js?v=0.2.36';
import { sceneFor } from './core/scene-route.js?v=0.2.36';
import { HUNT_MAP_INDEX } from './hunt-maps.js?v=0.2.36';

/** The display scratch, created on first use. The world's only write to G. */
export function worldOf(G) {
  if (!G._world || typeof G._world !== 'object') G._world = { choice: 'town' };
  return G._world;
}

/** The viewer picks the town or their home for a scene that is not a hunt. */
export function setChoice(G, choice) {
  worldOf(G).choice = choice === 'home' ? 'home' : 'town';
}

/** Where the local hero stood last on `map` ([x, y] whole tiles), or null. */
export function heroPosOn(G, map) {
  const p = worldOf(G).pos;
  return p && p.map === map && Number.isFinite(p.x) && Number.isFinite(p.y) ? [Math.round(p.x), Math.round(p.y)] : null;
}

/** Note where the local hero stands now. Display only: never an intent, never saved. */
export function notePos(G, map, x, y) {
  const w = worldOf(G);
  if (!w.pos || w.pos.map !== map) w.pos = { map, x, y };
  else { w.pos.x = x; w.pos.y = y; }
}

/** Forget where the hero stood (it went hunting): back in town it arrives at the map's start. */
export function forgetPos(G) {
  delete worldOf(G).pos;
}

/** What the server last said the hero is doing: { kind: 'combat', id } or null. */
export function activityOf(G) {
  return G && G.activeMonster ? { kind: 'combat', id: String(G._huntId || G.activeMonster) } : null;
}

/** The scene to show now: { map, kind }. `homeMap` is the template the property rung picks. */
export function readScene(G, homeMap) {
  const maps = homeMap && homeMap !== SCENE_MAPS.home ? Object.assign({}, SCENE_MAPS, { home: homeMap }) : SCENE_MAPS;
  return sceneFor(activityOf(G), worldOf(G).choice, HUNT_MAP_INDEX, maps);
}
