// ============================================================================
// supabase/functions/hr-accrue/tick-reads.js — THE ENGINE INPUT THE ENVELOPE
// CANNOT CARRY, READ ONCE PER CHARACTER, BY ONE DEFINITION.
//
// `hr_perks_of` (the permanent perk stack: room rungs, plot buildings, the
// property tier, unlockedRecipes) is not an `hr_state_of` field, so every
// caller that prices a window makes it as its own statement. tick.js (step
// (1b)) and hunt-settle.js (a hunt session's settle) call THIS function — one
// code path, never a second copy (AWAY-12). The bestiary read left with the
// charm and trophy combat multipliers (closed rebuild, lane C2): the kill
// counters no longer price a fight.
//
// THE BINDING IS THE ARGUMENT LIST. The read takes the (user, slot) of the
// character whose session it will feed and nothing else (Security N6).
//
// THE DEGRADE RULE, shared with index.ts's accrue path and set-activity.js's
// collect: ONLY 42883 (a database that predates the function) reads as "none";
// anything else propagates, because a swallowed error is how a guard reports
// a pass. Absent ⇒ null ⇒ zero perks, the under-paying direction.
//
// PURE ESM, Node + Deno. No `?v=` (not under src/**).
// ============================================================================

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
