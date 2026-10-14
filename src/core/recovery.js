// ============================================================
// src/core/recovery.js — THE RECOVERY RULE (rev. 2), on its own.
//
// Split out of src/core/away.js for Hunt Sessions (ruling HR-2026-10-14 §2
// "Death"): the ladder outlives the away model, so it no longer lives in the
// file that model is deleted from. Behaviour is byte-identical — away.js
// re-exports every name below, so no caller moved.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* ══ THE RECOVERY RULE (First-Night Idle Rescue, Game Designer 2026-09-05) ══
   A DEATH INTERRUPTS A RUN; IT DOES NOT TERMINATE IT.

   Before this table a foodless character's away fight ended at the FIRST death
   and the remaining eleven-and-a-half hours of a twelve-hour night paid ~0.1%.
   That is not a difficulty curve, it is a cliff with no signage, and it was the
   single largest retention loss measured on the beta.

   So: on death the character is KNOCKED OUT for `recoveryFor(...)`, then gets
   back up at `resumeHpFor(maxHp)` and RESUMES THE SAME ACTIVITY.

   IT IS A TABLE, NEXT TO THE OTHER TABLE, AND IT IS DELIBERATELY *NOT* AN
   `AWAY_SCOPE` ENTRY. AWAY_SCOPE answers exactly one question — "does this bonus
   CHANNEL pay while away" — and Recovery is not a bonus channel: it is a
   property of the CHARACTER (`player_state.recovering_until`, an absolute SERVER
   timestamp). Both callers simply refuse to swing while it runs — `simulateSpan`
   skips the tick, the live combat-start intent refuses with `recovering` — so
   the rule is identical live and away BY CONSTRUCTION and AWAY-1 byte parity is
   preserved without a second code path. Putting it in AWAY_SCOPE would have made
   it an away-only rule, which is precisely the shape docs/design/away-time-ruling
   .md exists to forbid.

   THE LADDER (rev. 2, Designer ruling 2026-09-06). Recovery is NOT flat. The
   flat rule was measured and rejected: at a 30-minute survival span a foodless
   character still kept 93.75% of a fed character's output, so "carry food" was
   advice rather than a decision (exploit R4). The cost of falling therefore
   DOUBLES with every fall on the SAME UTC DAY:

     n (deaths today, INCLUDING this one)   1    2    3    4     5     6    >=7
     knocked out                            0   2m   4m   8m   16m   32m    64m

   WHAT THAT BUYS, NORMATIVE (Designer adjudication 2026-09-06). Over a 12h
   night a FOODLESS character surviving S seconds between falls keeps this
   share of a fed character's output:
       S=30s    1.18%  (food 84.7x)
       S=300s  11.11%  (food  9.0x)
       S=1800s 46.94%  (food  2.1x)
   These are the arithmetic of the table above and are the figures of record;
   the ruling's earlier illustration (0.49 / 4.6 / 24.2%) was WITHDRAWN when it
   was shown to describe a ~100-minute effective rung this ladder cannot reach,
   and the adjudication went to THE FORMULA. tests/accrual-engine.mjs RECOVER-8
   brackets all three bands, so changing any constant here moves a test.

   TWO DURABLE ANCHORS, BOTH SERVER-OWNED, NEITHER RE-ARMABLE BY A CLIENT:
     · `deathsTodayBefore`    player_progress kind='stat' key='deaths'
                              period=<UTC day>. The free fall is ONE PER DAY,
                              anchored to a row the server writes — never
                              "deaths in this settle window", because the client
                              owns the settle cadence and a free death per window
                              is a free death per reload (this WAS rev. 1's
                              known limitation, and it is what closes it).
     · `deathsLifetimeBefore` player_progress kind='stat' key='deaths' period=''.
                              THE NOVICE GRACE: while a character's LIFETIME
                              death count is <= NOVICE_GRACE_DEATHS the ladder is
                              clamped to one rung, so somebody's first evening
                              cannot be spent staring at a 32-minute timer. It is
                              lifetime-anchored precisely so it cannot be farmed:
                              it runs out once, forever.

   A NaN in either counter is treated as the HARSHEST reading (veteran, many
   deaths today). Garbage must never buy relief. */

/** One rung. The second fall of a day costs this; each one after doubles it. */
export const RECOVERY_BASE_MS = 120000;
/** The ceiling. 64 minutes — rung 7 and every rung after it. */
export const RECOVERY_CAP_MS = 3840000;
/** Lifetime deaths through which the ladder is held at one rung. */
export const NOVICE_GRACE_DEATHS = 5;
/** The rung a novice is held to. */
export const NOVICE_GRACE_MS = RECOVERY_BASE_MS;

/**
 * How long is this character knocked out for?
 *
 * PURE, and it is the ONLY definition of the ladder — both runtimes import it,
 * so there is no second copy to drift. Both counts are READ BEFORE this death
 * is added, which is what makes the caller's arithmetic (`D_at_span_start +
 * deaths_so_far`) an in-span escalation with no extra bookkeeping.
 *
 * @param o { deathsTodayBefore, deathsLifetimeBefore }
 * @returns ms of Knocked Out: 0 for the day's first fall, then the ladder.
 */
export function recoveryFor(o) {
  const c = o || {};
  /* `harsh` — a non-finite or negative count reads as a LARGE one. The only
     values these two counters buy are relief, so garbage must buy none. */
  const harsh = (v) => {
    const n = Math.floor(Number(v));
    return isFinite(n) && n >= 0 ? n : Infinity;
  };
  const n = harsh(c.deathsTodayBefore) + 1;      // deaths today AFTER this one
  const L = harsh(c.deathsLifetimeBefore) + 1;   // deaths ever  AFTER this one

  if (n <= 1) return 0;
  /* 2^(n-2) with the exponent bounded first: n can be Infinity (garbage), and
     `Math.pow` would hand back Infinity for the ladder rather than the cap. */
  const rungs = Math.min(n - 2, 30);
  let ms = Math.min(RECOVERY_BASE_MS * Math.pow(2, rungs), RECOVERY_CAP_MS);
  if (L <= NOVICE_GRACE_DEATHS) ms = Math.min(ms, NOVICE_GRACE_MS);
  return ms;
}

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
