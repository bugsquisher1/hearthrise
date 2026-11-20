// ============================================================================
// supabase/functions/hr-accrue/accrue-rested.js — THE RESTED BANK.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// A side bank on its own watermark, settled beside the pointer by index.ts.
// ============================================================================

/* RESTED XP (b437), banked SERVER-SIDE. The SAME watermarked accrual the client
   runs (src/core/rested.js) — no second formula. It draws NO rng, so appending
   it moves no seeded roll and away == live stays byte-identical (AWAY-1). */
import { accrueRestedXp as coreAccrueRested } from '../../../src/core/rested.js';
import { nat } from './accrual-contract.js';

/**
 * ── THE RESTED BANK, SERVER-SIDE (b437) ────────────────────────────────────
 *
 * Rested XP accrues on WALL-CLOCK, independent of any activity pointer — you
 * rest whether or not you left something running (legacy.js SEAM 3). So it is
 * settled ALONGSIDE the pointer, on its OWN watermark `rested_at` (index.ts's
 * rested settle) — NOT through KIND_ACCRUERS,
 * and settled EVEN WHEN the pointer accrual refused (idle / below-min), because
 * an idle pointer does not mean an idle bank.
 *
 * WATERMARK-IDEMPOTENT, and that is the whole ballgame: `rested_at` is the
 * instant already banked to, charges = floor((now - rested_at)/CHARGE_MS), and
 * the watermark advances by exactly the whole charges granted — so a second call
 * over the same span banks nothing (a non-idempotent advance would be the b214
 * offline double-pay). All of that lives in ONE place, src/core/rested.js, which
 * the client runs too; this function only threads server-owned inputs into it.
 *
 * DRAW-FREE: it touches no rng, so it moves no seeded roll and away == live stays
 * byte-identical.
 *
 * SELF-CONFIGURING SWITCH, like tool_carry/fight: `restedAtMs === null` means the
 * `rested_at` column does not exist on this database → return `absent` and OMIT
 * the delta keys, so a deploy that lands before the migration pays exactly what
 * it paid yesterday (hr_apply would reject an unknown key and cost a whole night).
 *
 * @param nowMs        the SERVER clock
 * @param restedAtMs   player_state.rested_at in ms, or null if the column is absent
 * @param restedXp     player_state.rested_xp (the current banked charge count)
 * @param libraryCap   the raised bank cap for a Great Library owner, or null for
 *                     the default (80). SERVER-OWNED; a null under-pays the bank
 *                     SIZE only (never the rate), which is the safe direction.
 * @returns {accrued:false, reason} | {accrued:true, granted, restedXp, restedAt}
 *   restedXp/restedAt are the NEW ABSOLUTE values for hr_apply.
 */
export function accrueRested({ nowMs, restedAtMs, restedXp, libraryCap }) {
  if (restedAtMs === null || typeof restedAtMs === 'undefined') {
    return { accrued: false, reason: 'absent' };
  }
  const now = nat(nowMs, 0);
  const state = { restedXp: nat(restedXp, 0), restedAt: nat(restedAtMs, now) };
  const cap = (Number.isFinite(Number(libraryCap)) && Number(libraryCap) > 0)
    ? Number(libraryCap) : undefined;
  const granted = coreAccrueRested(state, now, cap);   // mutates state, idempotent
  if (!(granted > 0)) {
    return { accrued: false, reason: 'nothing', restedXp: state.restedXp, restedAt: state.restedAt };
  }
  return { accrued: true, granted, restedXp: state.restedXp, restedAt: state.restedAt };
}
