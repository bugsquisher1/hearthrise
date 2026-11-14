// ============================================================
// src/core/hunt/boss-room.js — A BOSS ROOM: ONE FIGHT IN ONE ROOM, CALLED OR KEYED (src/data/boss-calls.js, src/data/boss-halls.js)
//
// Two kinds of room share the fight's rules, and only the first pays nothing:
//   a CALLED room (ground.call: Call out, a gold fee, a stronger copy of a ground's boss) PAYS NOTHING: its swings take the rewards' one
//     door for it (hunt-rewards.js calledSwing, handed the call by combat-sim.js), and tests/boss-call.mjs holds that line;
//   a KEYED HALL (ground.hall: a Hall Key spent on entry, the Krell's Hold design's engine piece 5) PAYS like any ground.
// THE FIGHT, the same in both (combat-sim.js, leash.js): ONE FIGHT (whatever ends one hero's ends everyone's, box ticked or not), its
// limit from the party's first swing (`boss_time`), the room's boss's kill ends it for everyone (`boss_felled`), and nothing resets.
// The room's boss is a call's `monster`, or a hall's ONE spawn (its pocket stands him alone; his adds come at his line: boss-phases.js).
// Read from the ground row alone, never stored: the world's shape is unchanged.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { BOSS_CALLS, BOSS_CALL_RULES } from '../../data/boss-calls.js?v=0.2.130';
import { BOSS_HALL_RULES, hallBossOf } from '../../data/boss-halls.js?v=0.2.130';

/** The room ground `ground` is: { kind: 'call' | 'hall', monster (the boss whose kill ends it), limitMs }, or null for any other ground. */
export function roomOf(ground) {
  if (!ground) return null;
  if (ground.call) {
    const c = BOSS_CALLS[ground.call];
    return c ? { kind: 'call', monster: c.monster, limitMs: BOSS_CALL_RULES.limitMs } : null;
  }
  if (ground.hall) {
    const monster = hallBossOf(ground);
    return monster ? { kind: 'hall', monster, limitMs: BOSS_HALL_RULES.limitMs } : null;
  }
  return null;
}
