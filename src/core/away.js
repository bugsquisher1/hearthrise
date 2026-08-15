// ============================================================
// src/core/away.js — THE AWAY/ACTIVE CONTRACT, as data.
//
// docs/design/away-time-ruling.md, locked 2026-08-11:
//
//   "Away time pays 1.00x. The away/active difference is *which bonus
//    channels are in scope*, never a rate discount, and never a second
//    code path."
//
// Before this file the difference between playing and being away was
// expressed as a SECOND COMBAT LOOP (`processOfflineCombat`) that had
// drifted from the live one in eight separate ways — no crits, no kill
// XP, no drop log, no dailies, no quests, no deeds, no featured-boss
// lift, no weapon speed. Every one of those was a copy-paste omission,
// not a decision. A rule that lives in a duplicated loop is not a rule;
// it is a coincidence that has not broken yet.
//
// So the rule is a TABLE, in one place, read by:
//   • the client's getBonus chain (world-events + buff-queue each ask
//     `channelApplies` instead of inventing their own gate),
//   • src/core/combat-sim.js, the one simulation both paths run,
//   • the Supabase accrual Edge Function, which imports this file.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* THE DIAL. It exists so "away pays less" is a decision someone has to
   make explicitly, in a commit, against a recomputed day model — not an
   emergent property of a loop that forgot to roll crits.
   It is 1.00. Do not set another value without a fresh day-model
   recompute (docs/design/pacing-overhaul.md A.2). */
export const AWAY_RATE_MULT = 1.00;

/* ── WHOSE BONUS IS IT? (the line the scope table actually draws) ───────────
   Tyler, 2026-08-14, stating the rule this table now encodes:

     "The offline portion should function exactly the same as if the player
      was still online. The caveat to that is the fact that after that
      player's 'max offline time' is reached, their character stops all
      activity."
     "The character should not gain the server wide blessing/buffs but they
      should still get their personal / clan buffs."

   So the away/active line is not "timed vs permanent" and never was — it is
   SERVER-WIDE vs PERSONAL. A rotating daily blessing and a world event are
   things the WORLD is doing, and the world does them for people who are in
   it; a Hunter's Feast is something the PLAYER did to their own character,
   and it keeps being true while they sleep. `clan` was already on the
   permanent channel, which is the same call made earlier for the same reason.

   THE BUFF CHANNEL'S TWO HALVES ARE ONE RULE. A timed buff that PAYS away
   must also DRAIN away. Paying without draining is the b326 exploit written
   backwards — eat a 10-minute Feast, shut the tab, harvest eight hours of
   buffed output from a ten-minute consumable — and draining without paying is
   simply a nerf. "Exactly the same as if online" means the Feast runs out
   part-way through the night and the rest of the night is unbuffed.

   The drain lives in src/core/combat-sim.js `simulateSpan`, per tick, because
   that is the only away caller that owns a TIMELINE — the same place the
   Boss-of-the-Day already resolves per UTC-day segment. A caller with no
   timeline cannot honour the second half of this rule; see the KNOWN GAP note
   at the foot of this file. */

/* The bonus channels. A source of power belongs to exactly one. */
export const CHANNEL = {
  /** gear, armour set, perks, renown, clan, property, castle */
  PERMANENT: 'permanent',
  /** crit chance. Gear-sourced (`critB` + the armour-set bonus) AND, since the
      buff channel opened, the `damage_crit` food buff — which reaches an away
      crit roll exactly as it reaches a live one, with no special case, because
      it is simply a member of a channel that pays. */
  CRIT: 'crit',
  /** Boss of the Day / Boss of the Week, resolved per UTC-day segment. */
  BOTD: 'botd',
  /** healing auto-eat — survival, not a bonus. Pays and consumes away. */
  HEAL: 'heal',
  /** rotating daily/weekly blessings and world events (b227). SERVER-WIDE, so
      out of scope away — the one channel Tyler's rule explicitly excludes. */
  BLESSING: 'blessing',
  /** timed consumable buffs (BUFFS_DEF). PERSONAL, so they pay away — and
      because they pay, they drain away. Both halves or neither. */
  BUFF: 'buff',
};

/* The ruling's resolver contract, verbatim. `true` = in scope while away. */
export const AWAY_SCOPE = Object.freeze({
  permanent: true,
  crit: true,
  botd: true,
  heal: true,
  blessing: false,
  buff: true,
});

/**
 * Is this channel paying, given the context?
 * Unknown channels default to TRUE — a new source of power is a base
 * reward until someone deliberately gates it. The five omissions the
 * ruling fixes were all base rewards that a second loop silently dropped,
 * so the safe default is "it pays", never "it is quietly missing".
 *
 * @param channel one of CHANNEL
 * @param ctx     { away: bool }
 */
export function channelApplies(channel, ctx) {
  if (!ctx || !ctx.away) return true;
  const v = AWAY_SCOPE[channel];
  return v === undefined ? true : v;
}

/** The rate multiplier for this context. 1 live, AWAY_RATE_MULT away. */
export function rateMult(ctx) {
  return (ctx && ctx.away) ? AWAY_RATE_MULT : 1;
}

export const DAY_MS = 86400000;

/**
 * Split an absence into UTC-day segments.
 *
 * The Boss of the Day is a different boss on either side of UTC midnight,
 * and the ruling pays each segment its own day's boss. At the 12h base cap
 * an absence crosses at most one boundary (two segments); at the 22h
 * ceiling (16h Offline+ · +4h renown/property · +2h clan) still at most
 * one. This is written as a loop anyway, because a cap is a number someone
 * will raise and a hardcoded "max two" is a bug waiting for that commit.
 *
 * @returns [{ fromMs, toMs, ms }] in chronological order; [] for an empty
 *          or inverted span.
 */
export function utcDaySegments(fromMs, toMs) {
  const a = Number(fromMs);
  const b = Number(toMs);
  if (!isFinite(a) || !isFinite(b) || b <= a) return [];
  const out = [];
  let cursor = a;
  /* Guard the loop as well as the maths: a garbage span must produce a
     bounded answer, never a hang. 400 segments is >1 year of absence. */
  let guard = 0;
  while (cursor < b && guard++ < 400) {
    const nextMidnight = (Math.floor(cursor / DAY_MS) + 1) * DAY_MS;
    const end = Math.min(nextMidnight, b);
    out.push({ fromMs: cursor, toMs: end, ms: end - cursor });
    cursor = end;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   CLOSED (b347 + b351) — WHAT THIS BLOCK USED TO WARN ABOUT, AND WHY THE
   HISTORY IS WORTH KEEPING. Read it before touching any away replay.

   `AWAY_SCOPE.buff` is a property of the SCOPE TABLE, so opening it opens the
   buff channel for EVERY consumer of `channelApplies` at once. That is the
   table's whole virtue and it was also the trap: for a while it paid three away
   callers and only one of them could drain.

     1. away COMBAT   — src/core/combat-sim.js `simulateSpan`. Owned a timeline
                        from the start (it segments the absence by UTC day for
                        the Boss of the Day), so it drove the buff clock and a
                        buff expired at the right instant.
     2. away GATHER   ) legacy.js processOffline: `ticks = floor(spanMs /
     3. away ARTISAN  ) offlineIntervalMs())`, the interval derived ONCE before
                        the first action and nothing advancing a clock inside.
                        A flat single-rate loop cannot express a buff expiring
                        mid-window: it paid the buff for the whole absence and
                        drained none of it. Measured, 8h woodcutting with one
                        10-minute `gather_speed +4%`: 6,250 actions against an
                        honest 6,005, and the buff came back reading 10:00.
                        Fifty times the earned value, by shutting the tab.

   HOW IT WAS CLOSED, in the order it had to happen:
     b347 gave (2)/(3) a timeline in legacy.js — split the span at the
          buff-expiry boundary, run each slice at its OWN re-derived rate, drain
          after the slice's actions rather than before.
     b351 moved that loop into `skillSim.sliceSpan` and put BOTH branches on it
          (`simulateSkillSpan`, `simulateArtisanSpan`), so all three away
          callers now run a boundary-split timeline and the shape cannot be
          reintroduced by writing a fourth caller: the loop is the injectable
          primitive, and its boundary source is a parameter.

   TWO RULES THAT SURVIVE THE FIX:
     • Do NOT "fix" a future variant by closing `AWAY_SCOPE.buff` again. That
       reverts a stated design rule to work around a loop that should have had a
       timeline all along — and leaving the freeze in while the payout is open
       pays a whole 3,600,000 ms absence out of a 300,000 ms consumable: 12x,
       worse than the exploit b326 closed. The payout and the drain are ONE
       change, always.
     • The ORDER inside a slice is load-bearing: derive the rate and run the
       slice's actions FIRST, drain the clock AFTER. A buff alive when the
       action happens pays for that action, exactly as it would live.
   ══════════════════════════════════════════════════════════════════════════ */
