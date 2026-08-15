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

   ⚠ EVERY FIELD BELOW IS READ ON THE HOT PATH. `supabase/functions/hr-accrue/
     claim-reward.js` reads `status` to choose between paying, answering
     `reward_unavailable` (with `needs`) and answering `unknown_reward`, and it
     reads `periodic` to decide whether the server stamps a period key. A row
     that no code path reads is decoration — the same rule INTENT_REGISTRY
     carries, and for the same reason.

     status: 'priced'  the server can price and pay it TODAY.
             'blocked' a real reward the server cannot yet own. Refused BY NAME
                       so a player is told "not yet", never "bad request", and
                       so the dependency is discoverable from the response.
     needs:  the exact missing capability. Prose, aimed at the next author.
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
