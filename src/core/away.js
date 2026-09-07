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

export const DAY_MS = 86400000;

/* ── THE CREDITED WINDOW (Ruling 2, 2026-08-15) ─────────────────────────────
   WHICH hours of an over-cap absence get paid — the FIRST `grantMs` after the
   player left, never the LAST `grantMs` before they came back.

   Both sides used to anchor the span to the RETURN instant (`fromMs = now -
   grantMs`, accrual.js; `ctx.fromMs = toMs - spanMs`, legacy.js). That is one
   character's worth of code and two live defects:

     1. AN EXPLOIT. `simulateSpan` resolves the Boss of the Day per UTC-day
        SEGMENT of the credited window. Anchoring to the return instant lets
        the player CHOOSE which days those segments land on, by choosing when
        to open the tab — an 18h absence can be made to pay entirely on the
        x1.5-drop day by returning at the right hour. Anchored to the DEPARTURE
        instant the segments are fixed the moment the player leaves, which is
        when the targeting decision was actually made (the ruling's own
        rationale for paying BotD away at all).
     2. A LIE ABOUT TIMED EFFECTS. A 10-minute Feast eaten on the way out is
        alive for minutes 0–10 of the absence. Credit the LAST twelve hours of
        an eighteen-hour absence and those minutes are outside the window
        entirely: the Feast pays nothing, having been spent on time that was
        forfeited. Credit the FIRST twelve and it pays exactly the ten minutes
        it was worth.

   THE FORFEITED TAIL IS THE CAP, and it is deliberately NOT deferred: the
   caller still stamps its watermark at `now`, so a 40-hour absence is one
   capped night and not four instalments (see accrual.js's `accrued_to` note —
   that comment is load-bearing and must not be "made consistent" with this).

   `activeSinceMs` is the server's second watermark. The window can never open
   before the activity existed, so W = max(watermark, active_since); the client
   has no such column and simply omits it.

   TOTAL BY CONSTRUCTION: garbage in produces a zero-length window at `now`
   rather than a span that pays for time nobody spent.

   @param o { watermarkMs, activeSinceMs?, nowMs, grantMs?, capMs? }
   @returns { fromMs, toMs, awayMs, paidMs, unpaidMs, capped }
            awayMs  the whole absence           (now - watermark)
            paidMs  the credited span           (toMs - fromMs)
            unpaidMs the forfeited tail         (now - toMs)
*/
export function creditWindow(o) {
  const src = o || {};
  const fin = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };
  const nowMs = fin(src.nowMs, 0);
  const watermarkMs = Math.min(nowMs, fin(src.watermarkMs, nowMs));
  /* max(), not a fallback: a MISSING second watermark must not widen the
     window, and a PRESENT one that is later than the first must narrow it. */
  const sinceMs = Math.min(nowMs, fin(src.activeSinceMs, watermarkMs));
  const fromMs = Math.max(watermarkMs, sinceMs);
  const availableMs = Math.max(0, nowMs - fromMs);
  /* The caller owns the cap arithmetic (the server clamps against three
     numbers, the client against `claimOfflineMs`), so a supplied grant is
     honoured — but only ever as a CEILING that is itself clamped into the
     window that actually exists. A caller cannot buy time here that the
     watermarks do not contain. */
  const capMs = Math.max(0, fin(src.capMs, Infinity));
  const asked = Math.max(0, fin(src.grantMs, availableMs));
  const paidMs = Math.min(asked, capMs, availableMs);
  const toMs = fromMs + paidMs;
  return {
    fromMs,
    toMs,
    awayMs: Math.max(0, nowMs - watermarkMs),
    paidMs,
    unpaidMs: Math.max(0, nowMs - toMs),
    capped: (nowMs - toMs) > 0,
  };
}

/**
 * Split an absence into UTC-day segments.
 *
 * The Boss of the Day is a different boss on either side of UTC midnight,
 * and the ruling pays each segment its own day's boss. At the 12h base cap
 * an absence crosses at most one boundary (two segments); at the 22h
 * ceiling (12h base · +4h renown/property · +2h clan) still at most
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

/* ══ THE RETREAT (Recovery Rule rev. 3, Game Designer 2026-09-07) ═══════════
   THE REALM DOES NOT KEEP SWINGING A FIGHT IT HAS PROVEN THE HERO CANNOT WIN.

   WHAT IT FIXES, measured on the QA account 2026-09-07: a hero with max_hp 13
   and no food, pointed at a dark wizard, fell 28 times in one day (42 lifetime).
   Every fall charged the 64-minute cap, stood the character up on 6 HP, and they
   were face-down again inside a minute. ~22 falls a day, about ONE KILL AN HOUR,
   for ever. Rev. 2 removed the cliff and left a silent busy-wait in its place:
   the run never ends, so nothing ever tells the player it is not working.

   THE TRIGGER IS CONSECUTIVE FALLS, AND `resolveKill` RESETS IT TO ZERO.
   That word is the whole design (the ruling rejects "N deaths per day then
   stop" for it): a hero who can win AT ALL never retreats, however many times
   they die, because every kill clears the counter. Only a hero who cannot land
   a single kill between falls reaches these numbers.

     foodless AT THE FALL  → retreat on the 3rd consecutive fall
     any hero, fed or not  → retreat on the 6th

   WHY TWO RUNGS AND NOT ONE. They answer two different questions, and the copy
   proves it: three foodless falls means "bring provisions" (the player owns the
   fix), six fed falls means "this is out of your league" (the target is wrong).
   One number could only ever say one of those.

   WHY NOT THE FIRST FOODLESS FALL. That is the pre-rev.2 cliff, and it was the
   largest retention loss measured on the beta. Rungs 1-2 stay
   interrupt-don't-terminate. The Retreat is a floor under the ladder, not a
   replacement for it.

   IT IS A TABLE, NEXT TO THE LADDER, AND IT IS DELIBERATELY *NOT* AN
   `AWAY_SCOPE` ENTRY — for exactly the reason the ladder above is not. AWAY_SCOPE
   answers "does this bonus CHANNEL pay while away"; the Retreat is a property of
   the RUN, evaluated identically by the live tick and the away replay because
   there is only one `resolveDeath`. An AWAY_SCOPE key would have made it an
   away-only rule, which is the shape docs/design/away-time-ruling.md forbids,
   and the ruling names that rejection explicitly.

   NO HEAL, NO CLOCK RELIEF. The retreating fall charges its own ladder rung and
   stamps `recovering_until` BEFORE the retreat; `hr_rest` remains the only cure.
   Ending the run is the mercy; it is not amnesty. */

/** Consecutive falls with an EMPTY BAG at the fall that end the run. */
export const RETREAT_FOODLESS_FALLS = 3;
/** Consecutive falls that end the run whatever the bag held. */
export const RETREAT_ANY_FALLS = 6;

/**
 * Does THIS fall end the run?
 *
 * PURE, and the ONLY definition of the rule — both runtimes import it, so there
 * is no second copy to drift, exactly as `recoveryFor` above.
 *
 * @param o { consecFalls, foodless }  `consecFalls` is the count INCLUDING this
 *          fall (1 on the first). `foodless` is read from the LIVE simulated bag
 *          inside `resolveDeath`, never from a window-open snapshot: a hero who
 *          started the night with forty Trout and ate the last one two hours ago
 *          is foodless NOW, and NOW is when the decision is made.
 * @returns true when the hero pulls back to camp.
 */
export function retreatAtFall(o) {
  const c = o || {};
  const n = Math.floor(Number(c.consecFalls));
  if (!isFinite(n) || n <= 0) return false;
  /* `>=`, never `===`. A counter that arrives already past the rung (a column
     restored from a server that counted higher, a clamp that landed above the
     threshold) must still retreat; an equality test would sail straight past it
     and reinstate the busy-wait this rule exists to end. */
  if (n >= RETREAT_ANY_FALLS) return true;
  return !!c.foodless && n >= RETREAT_FOODLESS_FALLS;
}
