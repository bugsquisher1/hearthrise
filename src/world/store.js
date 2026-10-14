// ════════════════════════════════════════════════════════════════════════
// src/world/store.js — WHAT THE WORLD READS, AND THE ONE THING IT WRITES.
//
// READS server state as the client holds it, never a client opinion of it:
// the fight pointer (`activeMonster` / `_huntId`, which reconcileActivityPointer
// keeps on the server's `active_kind`/`active_id`) and the open hunt session
// (`_huntSession`, src/net/hunt.js). Nothing here predicts.
//
// WRITES only `G._world` — display scratch: the viewer's pick of town or home.
// It is `_`-prefixed, so it is never in the residue (RESIDUE_FIELDS is an
// allowlist) and never sent; a reload forgets it, which is correct for a view.
// tests/world-no-authority.mjs fails the build on any other write to G.
// ════════════════════════════════════════════════════════════════════════
import { SCENE_MAPS } from '../data/world/maps/index.js?v=582';
import { sceneFor } from './core/scene-route.js?v=582';
import { HUNT_MAP_INDEX } from './hunt-maps.js?v=582';

/** The display scratch, created on first use. The world's only write to G. */
export function worldOf(G) {
  if (!G._world || typeof G._world !== 'object') G._world = { choice: 'town' };
  return G._world;
}

/** The viewer picks the town or their home for a scene that is not a hunt. */
export function setChoice(G, choice) {
  worldOf(G).choice = choice === 'home' ? 'home' : 'town';
}

/** What the server last said the hero is doing: { kind: 'combat', id } or null.
    The fight pointer first; else an OPEN hunt session from the server's last
    read (src/net/hunt.js G._huntSession), so the hunt's map shows from the
    moment the session opens, before the fight pointer catches up. */
export function activityOf(G) {
  if (G && G.activeMonster) return { kind: 'combat', id: String(G._huntId || G.activeMonster) };
  const v = G && G._huntSession && G._huntSession.view;
  const s = v && v.session;
  return s && !s.ended_at && s.hunt ? { kind: 'combat', id: String(s.hunt) } : null;
}

/** The scene to show now: { map, kind }. */
export function readScene(G) {
  return sceneFor(activityOf(G), worldOf(G).choice, HUNT_MAP_INDEX, SCENE_MAPS);
}
