// ============================================================
// src/core/recovery.js — A KNOCKOUT: what it refuses and how one gets up.
//
// Split out of src/core/away.js for Hunt Sessions (ruling HR-2026-10-14 §2
// "Death"); away.js re-exports every name below.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* ══ A KNOCKOUT ═════════════════════════════════════════════════════════════
   A fall in a hunt knocks the character out for the FLAT `KNOCKOUT_MS` (60 s,
   src/data/hunt-sessions.js; master plan row 16) and stands them up at
   `resumeHpFor(maxHp)`; three falls end the hunt. The Recovery LADDER (0 / 2 /
   4 … 64 minutes, the novice grace) was the away model's and was deleted
   outright with it (closed rebuild, lane C2). What stays here is the property
   of the CHARACTER the ladder used to share a file with: while
   `player_state.recovering_until` runs, the character may not FIGHT. */

/* ── WHAT A KNOCKOUT ACTUALLY TAKES AWAY (Designer ruling, 2026-09-08) ─────
   THE ONE DEFINITION OF "which declared kinds does the recovery window refuse",
   here rather than in either runtime because BOTH read it and a second copy is
   how the client came to start runs the server was refusing. The Edge
   intent imports it (`set-activity.js` §1b); the browser reaches the same frozen
   array through `HearthriseCore.away` (core-bridge.js), so the mirror is the
   SAME BYTES, not an agreement.

   ⚠ IT IS `combat` ONLY, AND THAT IS A NARROWING OF REV. 2 (rev. 3).
     Rev. 2 refused every payable kind — `PAYABLE_KINDS` — on the reasoning that
     being knocked out is a property of the CHARACTER. Measured live, that
     reasoning produced a lock with no key: a solvent Fishing-9 / Cooking-15
     character with an empty food bag was refused fishing for 45 minutes, the
     Market held zero listings and no counter sold food, so there was NO LEGAL
     MOVE. The knockout exists to punish fighting badly, and fishing for your own
     dinner is the CURE that punishment is supposed to teach — a rule that blocks
     the cure converts "you lost combat output" into "you lost access to the game".

     What the exploit (R1) actually guards is EARNING COMBAT OUTPUT WHILE DOWN,
     and gathering is not combat output. The ladder's arithmetic above is
     untouched: its 1.18% / 11.11% / 46.94% bands are ratios of a FOODLESS fighter
     to a FED fighter, BOTH FIGHTING. Letting a downed character fish changes no
     number in that table, so nothing here is repriced.

     The adjacent risk — an away character banking a gather night through a
     knockout — does not arise: away accrual replays the DECLARED pointer, and a
     character who fell was declared `combat`. A fall cannot silently become a
     fishing night. No reduced rate and no XP tax either (a second economy to
     balance, pricing a downside the knockout already charges in full: the fight
     is stopped and `hr_rest` costs food).

   ⚠ IT IS A SUBSET OF `PAYABLE_KINDS`, NOT A RESTATEMENT OF IT. `artisan` is
     absent because it always was in practice — the cooking bench downgrades to
     `idle` — and is now absent on purpose: the bench is the other half of the
     cure. A FOURTH payable kind is therefore NOT gated by default, which is the
     right default for a rule whose whole content is "you may not fight", and
     `recoveryRefuses()` is the one predicate both sides ask so the day that
     changes it changes here. */
export const RECOVERY_REFUSED_KINDS = Object.freeze(['combat']);

/**
 * Does the recovery window refuse a run declared as `kind`?
 * PURE. The predicate, not the array, is what callers should ask — an unknown
 * or absent kind is NOT refused, because `idle` and every non-payable action
 * (building, shopping, travelling, the market, the clan) stay open while a
 * character is down. A knockout stops them FIGHTING; it does not lock them out.
 */
export function recoveryRefuses(kind) {
  return RECOVERY_REFUSED_KINDS.includes(kind);
}

/* ── STANDING BACK UP (rev. 2) ──────────────────────────────────────────────
   A death used to end in a FULL heal, which quietly made dying the cheapest
   way to top up: a character with no food fought to the floor and got their
   whole health bar back for the price of the timer. The character now gets up
   at a FRACTION of their maximum, and the fraction sits deliberately just ABOVE
   Auto-Eat I's 25% trigger — a fed character is topped up by their own
   provisions on the next swing, a foodless one starts the next fight already
   most of the way back down. Food is the way off the floor; the timer only
   stops the bleeding. `max(1, …)` because a 1-HP character is standing and a
   0-HP one is dead, and rounding UP is the direction that cannot loop. */
export const RESUME_HP_FRACTION = 0.40;

/** The HP a character stands back up on. PURE; one definition, both runtimes. */
export function resumeHpFor(maxHp) {
  const m = Math.floor(Number(maxHp));
  if (!isFinite(m) || m <= 0) return 1;
  return Math.max(1, Math.min(m, Math.ceil(RESUME_HP_FRACTION * m)));
}
