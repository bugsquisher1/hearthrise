// ============================================================================
// supabase/functions/hr-accrue/tick-reads.js — THE TWO ENGINE INPUTS THE
// ENVELOPE CANNOT CARRY, READ ONCE PER CHARACTER, BY ONE DEFINITION.
//
// `hr_perks_of` (the permanent perk stack: room rungs, plot buildings, the
// property tier, renown, unlockedRecipes) and `hr_bestiary_of` (the per-monster
// kill counters the charm and trophy indexes fold) are not `hr_state_of`
// fields, so every caller that prices a window makes them as their own
// statements. tick.js (the solo tick, steps (1b)/(4b)) and tick-party.js (the
// party unit, once per member) both call THESE two functions — one code path,
// never a second copy (AWAY-12), so a partied member's session is fed exactly
// what a solo character's is (Security N4b, 2026-09-28).
//
// THE BINDING IS THE ARGUMENT LIST. Each read takes the (user, slot) of the
// character whose session it will feed and nothing else; the caller hands the
// answer to that same character's `sessionFromRoster` row. T-X1h/T-X1i in
// tests/edge-tick-gate.mjs fire two characters with different answers in one
// tick and fail on a swapped or dropped read (Security N6).
//
// THE DEGRADE RULE, shared with index.ts's accrue path and set-activity.js's
// collect: ONLY 42883 (a database that predates the function) reads as "none";
// anything else propagates, because a swallowed error is how a guard reports
// a pass. Absent ⇒ null ⇒ zero perks / no charm, the under-paying direction.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

/* THE BESTIARY READ, ONE DEFINITION. The collect path's statement, imported
   rather than retyped, so the tick and the collect aggregate `hr_bestiary_of`
   with the same bytes. */
import { BESTIARY_SQL } from './set-activity.js';

export const PERKS_SQL = 'select public.hr_perks_of($1::uuid, $2::int) as perks';

const undefinedFunction = (e) => String((e && e.code) ?? '') === '42883';

/** `hr_perks_of(user, slot)` → the perk state, or null (none / 42883). */
export async function readTickPerks(exec, userId, slot) {
  try {
    const [p] = await exec(PERKS_SQL, [userId, slot]);
    const pe = p && p.perks;
    return (pe && pe.ok === true) ? pe : null;
  } catch (e) {
    if (!undefinedFunction(e)) throw e;
    return null;
  }
}

/** `hr_bestiary_of(user, slot)` as BESTIARY_SQL → `{monsterId: kills}`, or null. */
export async function readTickBestiary(exec, userId, slot) {
  try {
    const [b] = await exec(BESTIARY_SQL, [userId, slot]);
    const k = b && b.kills;
    return (k && typeof k === 'object' && !Array.isArray(k)) ? k : null;
  } catch (e) {
    if (!undefinedFunction(e)) throw e;
    return null;
  }
}
