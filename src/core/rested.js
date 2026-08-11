// ============================================================
// src/core/rested.js — the Rested XP bank.
//
// ACCRUAL IS WATERMARKED, NOT ELAPSED-BASED. `restedAt` is the exact
// instant already paid for; charges = floor((now - restedAt)/CHARGE_MS)
// and restedAt advances by exactly the whole charges granted. Calling
// accrue twice grants nothing the second time. That is deliberate
// defence against the b214 offline DOUBLE-PAY class of bug — a watermark
// cannot be double-read, because the second reader sees an advanced
// clock. It is also precisely the shape `accrued_to` takes server-side.
//
// b228: a charge is a FLAT XP quantum, not a multiplier — capacity, not
// throughput. It is added after the perk block so nothing scales it.
//
// The clock is a PARAMETER, never Date.now(). Server-side that parameter
// is the database's now(), which is the whole point of the exercise.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

export const RESTED_CHARGE_MS = 6 * 60 * 1000;   // 1 charge per 6 minutes
export const RESTED_CAP = 80;                    // 8 hours banked
export const RESTED_CAP_LIBRARY = 120;           // the Great Library's raised bank
export const RESTED_QUANTUM_CAP = 1600;          // the one ceiling, both roads

/* TWO ROADS, ONE CEILING: the homestead Library and the castle Tavern each
   grant a quantum; the game takes the LARGER, never the sum, so a clanless
   maxed homestead and a clanned castle arrive at the same ceiling by
   different roads. Both roads arrive here as plain numbers. */
export function restedQuantum(roads) {
  const r = roads || {};
  const q = Math.max(Number(r.library) || 0, Number(r.clan) || 0, 0);
  return Math.max(0, Math.min(RESTED_QUANTUM_CAP, q));
}

export function restedCap(libraryCap) {
  const n = Number(libraryCap) || 0;
  return n > 0 ? n : RESTED_CAP;
}

/** Idempotent shape repair. A fresh save starts its clock NOW — never at
    epoch, or a brand-new player logs in holding a full unearned bank. */
export function ensureRestedState(state, now, cap) {
  const lim = restedCap(cap);
  if (typeof state.restedXp !== 'number' || !isFinite(state.restedXp) || state.restedXp < 0) state.restedXp = 0;
  if (state.restedXp > lim) state.restedXp = lim;
  if (typeof state.restedAt !== 'number' || !isFinite(state.restedAt) || state.restedAt > now) state.restedAt = now;
  return state;
}

/** Bank whole charges earned since the watermark. Returns what was banked. */
export function accrueRestedXp(state, now, cap) {
  const t = (typeof now === 'number' && isFinite(now)) ? now : 0;
  const lim = restedCap(cap);
  ensureRestedState(state, t, cap);
  const charges = Math.floor((t - state.restedAt) / RESTED_CHARGE_MS);
  if (charges <= 0) return 0;
  state.restedAt += charges * RESTED_CHARGE_MS;   // advance by what we PAID, not to now
  const before = state.restedXp;
  state.restedXp = Math.min(lim, before + charges);
  return state.restedXp - before;
}

/** Spend one charge, returning the FLAT XP it is worth (0 = nothing spent).
    A charge is never burned when it would be worth nothing, which keeps the
    seam genuinely inert for a player with neither road built. */
export function spendRestedCharge(state, quantum) {
  if (!(state.restedXp > 0)) return 0;
  const q = Math.max(0, Number(quantum) || 0);
  if (q <= 0) return 0;
  state.restedXp -= 1;
  return q;
}
