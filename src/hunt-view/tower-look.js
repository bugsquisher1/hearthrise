// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/tower-look.js — THE BURNING TOWER'S FIRE, AS THE SCENE DRAWS IT (lane/a-tower-art; the pour is src/world/pour.js).
//
// The board's "The Burning Tower" §1: the fire remembers what it ate. On the Tower's hunt every monster stands charred (`char`), and on
// a landing its Keeper (src/core/hunt/tower.js towerRoom: the one kind no other slot of the room takes) burns (`keeper`). The floor is
// the live view's (live-engine.js tower(), display only, replaced by every server start point). PURE but for the live read.
// ════════════════════════════════════════════════════════════════════════
import { TOWER_RULES } from '../data/tower.js';
import { towerRoom } from '../core/hunt/tower.js';

/** { keeper: kind | null } on the Tower's hunt (keeper null off a landing or with no floor yet), else null. Pure. */
export function towerLookOf(huntId, floor) {
  if (huntId !== TOWER_RULES.hunt) return null;
  const f = Number.isSafeInteger(floor) && floor >= 1 ? floor : null;
  return { keeper: f !== null ? towerRoom(f).keeper : null };
}

/** The floor the live view stands this character's climb on, or null. */
export function liveFloorOf(cs) {
  const c = cs && cs.live && typeof cs.live.tower === 'function' ? cs.live.tower() : null;
  return c && Number.isSafeInteger(c.floor) ? c.floor : null;
}
