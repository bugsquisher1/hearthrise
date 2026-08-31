// ============================================================================
// src/data/rewards.js — CLAIMABLE REWARDS, authored once.
//
// A grant intent's whole job is "the SERVER decides how much". That is only
// true if the server can read the number, and until b349 every claimable reward
// in Hearthrise was a literal inside a classic <script> that neither Deno nor
// Node can import. So the numbers move HERE — pure ESM, importable by the
// browser (via src/main.js), by the Edge Function (vendored by
// tools/pack-edge.mjs) and by the tests, all from one file.
//
// ⚠ THIS IS NOT A SECOND COPY, AND THAT IS DELIBERATE.
//   tools/gen-shops.mjs emits a second copy of the SHOP tables with a drift
//   guard, and its header explains why: those tables live in src/legacy.js, a
//   classic script that cannot be imported, held by every other workstream, so
//   the refactor was "the better end state and the worse mid-program move".
//   NEITHER HALF OF THAT REASONING APPLIES HERE. The daily-login cycle lived in
//   src/features/daily-reward.js — a 400-line feature file nobody else is in —
//   so the better end state was also the cheaper move. src/features/daily-
//   reward.js now READS this module (through window.HearthriseRewards, because
//   it is a classic script), so there is exactly one cycle and nothing to
//   drift. Do not "add a drift guard" for a copy that does not exist.
//
// PURE DATA + PURE FUNCTIONS. No DOM, no globals, no I/O, no clock — the caller
// supplies the streak and the caller supplies the day. That is what lets the
// SERVER be the one holding the clock (design: "never trust a client
// timestamp — use now()").
// ============================================================================

/* ── THE DAILY LOGIN CYCLE ──────────────────────────────────────────────────
   Seven escalating days; which day you land on is your streak position, so a
   longer streak keeps landing bigger days. Authored by the Designer — moved
   here verbatim from src/features/daily-reward.js, value for value. */
export const DAILY_LOGIN_CYCLE = Object.freeze([
  Object.freeze({ gold: 500 }),
  Object.freeze({ gold: 1000 }),
  Object.freeze({ gold: 2000, gems: 5 }),
  Object.freeze({ gold: 3500 }),
  Object.freeze({ gold: 6000, gems: 10 }),
  Object.freeze({ gold: 10000 }),
  Object.freeze({ gold: 20000, gems: 30 }),   // Day 7 jackpot
]);

/** Each COMPLETED week scales the whole cycle by this much again. */
export const DAILY_LOGIN_WEEK_BONUS = 0.5;

/* ⚠ THE CAP IS NEW, AND IT IS A BOUND RATHER THAN A BALANCE CHANGE.
   `1 + weeksDone * 0.5` is UNBOUNDED, and the client has been paying it that
   way. Measured against the shipped cycle: a two-year perfect streak reaches
   weeksDone = 104, i.e. x53, i.e. 1,060,000 gold from ONE day-7 claim; three
   years is x79. A server that authorises a payout may not propose an unbounded
   number — every other value the engine proposes has a blast radius, and this
   one had none.

   26 is chosen to be NON-BINDING for any reachable player: it is a full YEAR of
   perfect attendance (52 completed weeks would be x27), so nothing anyone can
   have today changes, and the beta is four days old. It is a fuse, not a dial.

   ⇒ GAME DESIGNER: the DIAL is yours. If a x26 day-7 claim (520,000 gold) is
     too much, lower this number — it is data, and both halves read it. What is
     NOT negotiable is that some finite number lives here. */
export const DAILY_LOGIN_MAX_WEEK_MULT = 26;

export const DAILY_LOGIN_CYCLE_DAYS = DAILY_LOGIN_CYCLE.length;

/**
 * PRICE ONE DAILY-LOGIN CLAIM. The one implementation, called by the client
 * renderer, by the server's claim intent and by the tests.
 *
 * @param streak  the claimer's CONSECUTIVE-DAY count, 1-based. The server
 *                derives it from its own claim history; the client renders a
 *                preview from its local copy and is never believed.
 * @returns {{gold:number, gems:number, cycleDay:number, weeksDone:number, mult:number}}
 *          `cycleDay` is 1-based for display. `mult` is post-cap.
 */
export function priceDailyLogin(streak) {
  const s = Number.isFinite(Number(streak)) && Number(streak) > 0 ? Math.floor(Number(streak)) : 1;
  const cycleDay = ((s - 1) % DAILY_LOGIN_CYCLE_DAYS) + 1;
  const weeksDone = Math.floor((s - 1) / DAILY_LOGIN_CYCLE_DAYS);
  const mult = Math.min(DAILY_LOGIN_MAX_WEEK_MULT, 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS);
  const base = DAILY_LOGIN_CYCLE[cycleDay - 1] || DAILY_LOGIN_CYCLE[0];
  return {
    gold: Math.round((base.gold || 0) * mult),
    gems: Math.round((base.gems || 0) * mult),
    cycleDay,
    weeksDone,
    mult,
  };
}

/* ── THE LOGIN STREAK, DERIVED FROM A CLAIM HISTORY ─────────────────────────
   MOVED HERE FROM supabase/functions/hr-accrue/claim-reward.js (b498). It is
   the same function, verbatim; what changed is that it is now readable by the
   BROWSER as well as by Deno, through `window.HearthriseRewards`.

   ⚠ THE MOVE IS THE BUG FIX, and the bug is worth stating because it is the
     same shape as the one `priceDailyLogin` was moved here to end.

     LIVE, 2026-08-31 (b497 play-gate): the sheet advertised "DAILY REWARD ·
     3-DAY STREAK / Claim Day 3 · 2,000 gold · 5 gems" and the server paid Day
     1's 500 gold and no gems. Nothing was lost, but the modal promised 4x what
     it paid — the "feels like theft" class.

     The cause was NOT arithmetic drift. It was that the client was rendering a
     DIFFERENT QUANTITY and calling it the same thing. There are two streaks on
     the server and they answer two different questions:

       player_state.streak_days   consecutive UTC days the player SETTLED
         (hr_apply §4c, 2026-08-21-streak-state.sql) — advanced by any delta
         carrying `accrued_to`, i.e. by PLAYING. Projected on every envelope as
         `state.streak_days`, which is what b475 taught the sheet to read.

       deriveLoginStreak (this)   consecutive UTC days the player CLAIMED the
         login reward — the only one the PAYOUT is a function of.

     They agree exactly while every played day is also a claimed day, which is
     why b475 looked right for three weeks. Play a day without claiming — or
     merely open the game before the day's first settle has reset the settle
     streak — and the sheet promises a day the server will not pay.

     A drift GUARD between two copies would not have caught that: neither copy
     was wrong. One implementation, read by both halves, is the only shape in
     which the question "which day will I be paid?" has one answer.

   `player_progress.value` on a `daily:login` row is THE STREAK LENGTH ON THAT
   DAY — unusual for that column, which is normally a counter, and stated here
   because the shape is what makes the rule one lookup instead of a scan:

       yesterday's row exists and is 'claimed'  ⇒  streak = its value + 1
       anything else                            ⇒  streak = 1

   Nothing walks a history, nothing depends on a retention window, and a player
   who misses a day resets by ARITHMETIC rather than by a reset that has to be
   remembered. It also means the 31-day `hr_progress_prune` cannot silently
   shorten a streak: only yesterday is ever read, and yesterday is never pruned.

   PURE, and it takes the day from its caller — this file holds no clock and no
   day-key function (see the block at the foot of this file for why). The SERVER
   passes `hr_claim_lookup`'s answer; the CLIENT builds the same shape out of the
   `daily`/`login` rows on its envelope. Both hand it `{ prev, rows }` and
   neither computes what "yesterday" means twice.

   ⚠ THE STREAK IS NEVER READ FROM THE CLIENT ON THE SERVER'S SIDE.
     `G.streak.count` exists and is forgeable; it is not an input to the pricer
     and there is no field through which it could become one. The client calling
     this function is rendering a PREVIEW of the server's own arithmetic over the
     server's own rows — it is not proposing a number.

   @param lookup  { prev: <day key>, rows: { <day key>: {value, state} } }
   @returns the 1-based consecutive-day count, floored at 1.
*/
export function deriveLoginStreak(lookup) {
  const rows = (lookup && lookup.rows) || {};
  const prev = lookup && lookup.prev;
  if (typeof prev !== 'string') return 1;
  if (!Object.prototype.hasOwnProperty.call(rows, prev)) return 1;
  const row = rows[prev];
  if (!row || row.state !== 'claimed') return 1;
  const v = Number(row.value);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) + 1 : 1;
}

/* ════════════════════════════════════════════════════════════════════════════
   THE CLAIMABLE REGISTRY — every gold GRANT site that is a discrete player
   gesture, and what the server would need in order to own it.
   ════════════════════════════════════════════════════════════════════════════

   MEASURED, not recalled (tools scan, 2026-08-15, control: blinding the
   pattern set drops the count 42 -> 6, so the scan is not blind). 42 direct
   writes to `G.gold` across src/** excluding the suite; TWELVE of them are
   grants — gold flowing IN that is neither a vendor conversion nor a market
   transfer — and they fall into three families:

     ACCRUAL-COMPUTED (5)  they fire INSIDE killMonster / updateDaily /
       features/companions.js:223,224      updateQuest, i.e. inside the loop the
       legacy.js:2902  completeBounty      server already simulates. They do NOT
       legacy.js:3386  updateDaily         get an intent; they become part of the
       legacy.js:3463  completeQuest       accrual delta when live combat moves
                                           server-side, and the client sites are
                                           deleted then (HANDOFF ordering, step 5).
       ⚠ completeBounty ALSO pays Bounty Marks, and `marks` has NO server home —
         see the `bounty:turnin` row below.

     CLAIM-SHAPED (6)      a discrete "I claim X" gesture. These ARE the grant
       intents, and they are the rows in this registry.

     OUT OF SCOPE (1)      legacy.js:2026 IAP `grant()`. Purchases are disabled
                           in the web beta ("Purchases open with the Steam /
                           mobile launch"); it needs receipt verification, not a
                           progression intent.

   Plus two DEV sites (admin.js:188, legacy.js:6229 `testerBoost`) which must
   simply never acquire a server path, and which are named here so that "there
   is no intent for them" is a decision on the record rather than an omission.

   ⚠ EVERY REQUIRED FIELD BELOW HAS A READER, AND WHICH READER IS NAMED.
     `supabase/functions/hr-accrue/claim-reward.js` reads `status` on the hot
     path to choose between paying, answering `reward_unavailable` (with
     `needs`) and answering `unknown_reward`; it reads `periodic` to decide
     whether the server stamps a period key; and `claimDelta` reads
     `ledgerKind`, which is the bucket `player_ledger_rollup` aggregates on. A
     row that no code path reads is decoration — the same rule INTENT_REGISTRY
     carries, and for the same reason.

     status: 'priced'  the server can price and pay it TODAY.
             'blocked' a real reward the server cannot yet own. Refused BY NAME
                       so a player is told "not yet", never "bad request", and
                       so the dependency is discoverable from the response.
     needs:  the exact missing capability. Prose, aimed at the next author.
             Required only on a 'blocked' row, and graded there (C0).
     site:   the CLIENT call site this claimable replaces, spelled
             `path/to/file.js:LINE symbolName(...)`.

     ⚠ `site` IS THE ONE FIELD WITH NO RUNTIME READER, AND THAT WAS A FINDING
       (Security G4): it was required and nothing read `spec.site`, which is
       decoration with a guard in front of it. It is KEPT REQUIRED because it is
       the wiring map — how the next author finds the six client sites this verb
       replaces — and it now has a BUILD-TIME reader instead: tests/
       claim-intent.mjs C0b parses the shape, resolves the path against the repo
       and asserts the named symbol is really in that file. So the format above
       is a contract, not a convention; free text will fail the build. The line
       number is bounded but not graded exactly — it drifts on every edit above
       it, and an assertion that goes red for unrelated reasons gets deleted.
       `note` is NOT required and is not graded: it is prose for a human, and it
       is honest about being that.
*/
export const CLAIMABLES = Object.freeze({
  /* ── PRICED ─────────────────────────────────────────────────────────────
     The daily login reward is the ONLY claim-shaped grant whose eligibility is
     a pure function of server state plus the server clock. Everything else
     tests a counter the server does not yet keep, which is why this one is
     first rather than merely easiest. */
  'daily:login': Object.freeze({
    status: 'priced',
    periodic: true,
    site: 'src/features/daily-reward.js:76 claim()',
    ledgerKind: 'quest',
    note: 'streak derived server-side from the previous day\'s own claim row',
  }),

  /* ── BLOCKED, each on a NAMED capability ────────────────────────────────
     These are not "unimplemented". Each is one dependency away, the dependency
     is stated, and the verb answers `reward_unavailable` with it attached — so
     the client can render "not yet" and a reader can tell what would unblock
     it. */
  'daily:goal': Object.freeze({
    status: 'blocked',
    periodic: true,
    site: 'src/legacy.js:16101 claimQuestReward()',
    ledgerKind: 'quest',
    needs: 'server-side daily-goal counters. The goals read stats.* out of the '
         + 'client save (kills, smithed, cropsHarvested…); nothing writes a '
         + 'player_progress row for any of them. Lands with live-action intents.',
  }),
  'quest:weekly': Object.freeze({
    status: 'blocked',
    periodic: true,
    site: 'src/legacy.js:16101 claimQuestReward(isWeekly)',
    ledgerKind: 'quest',
    needs: 'the same stats.* counters as daily:goal, over a 7-day period key.',
  }),
  'collection:milestone': Object.freeze({
    status: 'blocked',
    periodic: false,
    site: 'src/features/collection-log.js:64 claimMilestone()',
    ledgerKind: 'quest',
    needs: 'a server collection model. Eligibility tests how many of 31 monsters '
         + 'and 426 items the character has ever seen; the server records neither.',
  }),
  'flag:renown_rank': Object.freeze({
    status: 'blocked',
    periodic: false,
    site: 'src/features/renown.js:308 claimRank()',
    ledgerKind: 'quest',
    needs: 'server-side Renown. effectiveRenown(G) is computed entirely from the '
         + 'client save and has no column, table or RPC.',
  }),
  'bounty:turnin': Object.freeze({
    status: 'blocked',
    periodic: false,
    site: 'src/legacy.js:2902 completeBounty()',
    ledgerKind: 'quest',
    needs: 'player_state.marks (IN FLIGHT, another workstream) AND a server '
         + 'bounty board. The gold half alone would pay a turn-in while '
         + 'silently dropping the Marks, which is worse than refusing. Note the '
         + 'turn-in is ALSO kill-driven today, so part of it belongs to accrual.',
  }),
});

/* The registry's required columns, exported so a guard reads the contract
   instead of restating it. A hard-coded list cannot notice a column being
   ADDED, which is the direction that produces decoration. */
export const CLAIMABLE_FIELDS = Object.freeze(['status', 'periodic', 'site', 'ledgerKind']);
export const CLAIMABLE_STATUSES = Object.freeze(['priced', 'blocked']);

/**
 * The registry key for a (kind, key) pair. ONE spelling, shared by the client,
 * the server and the tests — two format strings that agree today are two format
 * strings.
 */
export function claimableId(kind, key) {
  return `${kind}:${key}`;
}

/**
 * Look a claimable up. `hasOwnProperty`, never truthiness: the id shape the
 * parser admits is /^[a-z0-9_]{1,64}$/, which matches `constructor` and
 * `__proto__`, and both are truthy on a plain object. (Review C6 — measured on
 * the real ITEMS/MONSTERS maps: the truthiness form let both walk past the
 * guard and issue three database statements where a genuinely unknown id issued
 * none.) `CLAIMABLES` is frozen and null-checked here so the same class of bug
 * cannot arrive through this door.
 */
export function claimableFor(kind, key) {
  if (typeof kind !== 'string' || typeof key !== 'string') return undefined;
  const id = claimableId(kind, key);
  if (!Object.prototype.hasOwnProperty.call(CLAIMABLES, id)) return undefined;
  return CLAIMABLES[id];
}

/* ── THERE IS DELIBERATELY NO DAY-KEY FUNCTION IN THIS FILE ─────────────────
   The first draft exported `utcDayKey(atMs)` / `previousDayKey(atMs)` returning
   'YYYYMMDD'. They were deleted before they had a caller, and the reason is
   worth more than the functions were:

   `public.hr_utc_day_key(timestamptz)` HAS EXISTED SINCE 2026-08-08 (clan-seat)
   and returns `FMYYYY-FMMM-FMDD` — i.e. **2026-8-5**, not 20260805. Two
   functions both correctly answering "which UTC day is it" in two formats is
   not a duplicate that drifts; it is a duplicate that is ALREADY different, and
   the difference only shows up as a `player_progress` row keyed under a period
   nothing else will ever look up. A silently unclaimable reward.

   So: the period key is computed exactly once, in Postgres, by the function
   that already existed, and every consumer uses the STRING it returns. The Edge
   Function never computes a day and never parses one. `hr_claim_lookup`
   (2026-08-16-claim-reward.sql) returns `today` and `prev` alongside the rows,
   which is why it returns them at all rather than just the rows.

   ⚠ AND THERE IS ALREADY A JS ONE — `utcDayKey` in src/core/botd.js, which
     world-events and raids have used for months. It produces 'YYYY-M-D', which
     is EXACTLY what `FMYYYY-FMMM-FMDD` produces, so the two that exist AGREE.
     That is measured, not assumed: tests/claim-intent.mjs C13d compares them on
     a fixed timestamp, across the two languages. Which makes the count of
     day-key implementations TWO, agreeing, rather than three, disagreeing —
     and it means a future intent that genuinely needs one in JS should import
     botd.js's rather than write a fourth.

   src/features/daily-reward.js keeps its own local `todayKey()` for the
   purely-local "have I shown the sheet today" cache. That is display state, it
   has never been authority, and it stays that way. */
