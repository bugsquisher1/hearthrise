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

/* ── THE DAILY LOGIN CYCLE (W0, 2026-10-10 — the coherence audit's #9) ──────
   Seven days; which day you land on is your streak position. Re-authored from
   gold-only to SUPPLIES PLUS MODEST GOLD, because the old cycle paid 43,000
   gold in week one (day 7 alone 20,000), climbed to x26 and reset on one missed
   day: logging in out-earned playing, and stepping away cost everything.

   THE NUMBERS, MEASURED AGAINST WHAT A NEW PLAYER EARNS BY PLAYING
   (src/data/goal-catalogue.js, src/data/monsters.js):
     · the three daily quests pay 400-1,400 gold each, about 2,000 a day and
       14,000 a week;
     · a goblin drops 2-8 gold, so a first hour of fighting is a few hundred;
     · the first House upgrade costs 400 gold, a shop weapon about 300.
   Week one below pays 2,250 gold (about 16% of the daily quests), 25 cooked
   shrimp and 10 cooked herring for Auto-Eat, 25 turnip and 10 carrot seeds for
   the plots (turnip is farming 1, carrot farming 10), one Bone Key (the first
   dungeon, the Crypt of Bones, opens at combat 25) and 2 gems. Day 2 is 200
   gold, below the price of a shop weapon, so the first gear upgrade is still
   one you earn.

   `items` are SUPPLIES: they scale with the week multiplier like gold does.
   `keys` and `gems` are FIXED: one Bone Key a week, never three, because a key
   is a dungeon run and the multiplier is a loyalty bonus, not a loot table.
   Every id is a real ITEMS row; tests/login-reward.mjs asserts it. */
export const DAILY_LOGIN_CYCLE = Object.freeze([
  Object.freeze({ gold: 150, items: Object.freeze({ cooked_shrimp: 10 }) }),
  Object.freeze({ gold: 200, items: Object.freeze({ turnip_seed: 10 }) }),
  Object.freeze({ gold: 250, items: Object.freeze({ cooked_shrimp: 15 }) }),
  Object.freeze({ gold: 300, items: Object.freeze({ carrot_seed: 10 }) }),
  Object.freeze({ gold: 350, items: Object.freeze({ cooked_herring: 10 }) }),
  Object.freeze({ gold: 400, items: Object.freeze({ turnip_seed: 15 }) }),
  Object.freeze({ gold: 600, gems: 2, keys: Object.freeze({ bone_key: 1 }) }),   // Day 7
]);

/** Each COMPLETED week scales gold and supplies by this much again... */
export const DAILY_LOGIN_WEEK_BONUS = 0.5;

/* ...up to x3, reached in week five (x1, x1.5, x2, x2.5, x3). The old cap was
   x26, a fuse rather than a dial; this one is the dial. At the cap the richest
   claim is day 7: 1,800 gold, one Bone Key, 2 gems; a capped week pays 6,750
   gold. The SERVER re-derives this price and refuses any other
   (2026-10-16-login-reward.sql, hr_login_price), so this number and that one
   are bound by tests/login-reward.mjs, which runs both over every streak. */
export const DAILY_LOGIN_MAX_WEEK_MULT = 3;

export const DAILY_LOGIN_CYCLE_DAYS = DAILY_LOGIN_CYCLE.length;

/* THE STORED STREAK IS BOUNDED. Once the multiplier is capped, a longer streak
   changes nothing but the cycle day, so the streak wraps one week back past
   this ceiling (36 → 29: day 1, week 5, still x3). The value in a claim row can
   therefore never grow without limit, and a long absence decays from at most
   this. Derived, never typed: the first week the cap applies, plus that week. */
export const DAILY_LOGIN_STREAK_CAP = DAILY_LOGIN_CYCLE_DAYS
  * (Math.ceil((DAILY_LOGIN_MAX_WEEK_MULT - 1) / DAILY_LOGIN_WEEK_BONUS) + 1);

/**
 * PRICE ONE DAILY-LOGIN CLAIM. The one JS implementation, called by the client
 * renderer, by the server's claim intent and by the tests. Postgres holds the
 * one SQL implementation and refuses a claim this does not equal.
 *
 * @param streak  the claimer's streak position, 1-based. The server derives it
 *                from its own claim history; the client renders a preview.
 * @returns {{gold:number, gems:number, items:Object<string,number>,
 *            cycleDay:number, weeksDone:number, mult:number}}
 *          `items` merges the scaled supplies and the fixed keys; it is `{}` on
 *          a day that pays none. `mult` is post-cap.
 */
export function priceDailyLogin(streak) {
  const s = Number.isFinite(Number(streak)) && Number(streak) > 0 ? Math.floor(Number(streak)) : 1;
  const cycleDay = ((s - 1) % DAILY_LOGIN_CYCLE_DAYS) + 1;
  const weeksDone = Math.floor((s - 1) / DAILY_LOGIN_CYCLE_DAYS);
  const mult = Math.min(DAILY_LOGIN_MAX_WEEK_MULT, 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS);
  const base = DAILY_LOGIN_CYCLE[cycleDay - 1] || DAILY_LOGIN_CYCLE[0];
  const items = {};
  for (const [id, q] of Object.entries(base.items || {})) {
    const n = Math.round(q * mult);
    if (n > 0) items[id] = (items[id] || 0) + n;
  }
  for (const [id, q] of Object.entries(base.keys || {})) {
    if (q > 0) items[id] = (items[id] || 0) + q;
  }
  return {
    gold: Math.round((base.gold || 0) * mult),
    gems: base.gems || 0,
    items,
    cycleDay,
    weeksDone,
    mult,
  };
}

/* ── THE LOGIN STREAK, DERIVED FROM THE LAST CLAIM ──────────────────────────
   ONE function, read by the browser (window.HearthriseRewards) and by the Edge
   Function (vendored), over the SERVER's own claim rows. b498 put it here
   because the sheet once rendered a different streak from the one the payout
   used; that rule stands.

   THE RULE (W0): a missed day costs ONE step, never the whole streak.

       last claim yesterday (gap 1)       ⇒  streak = last + 1
       last claim g days ago (g ≥ 2)      ⇒  streak = last + 1 − (g − 1)
                                              (one step lost per missed day)
       floored at 1, wrapped past DAILY_LOGIN_STREAK_CAP one week at a time

   So a player on day 5 who misses a day comes back to day 5, not day 1; a
   week away costs a week of steps. `hr_claim_lookup` returns `last` — the most
   recent CLAIMED row before today and how many UTC days ago it was, measured
   on the server's clock — so nothing here reads a clock or parses a day key
   (see the foot of this file). Only a 'claimed' row continues a streak: any
   other row is one this engine did not finish, and counting it would let a
   stray write inflate the reward.

   ⚠ A ROW OLDER THAN THE PROGRESS RETENTION (31 days, hr_progress_prune) IS
     GONE, so an absence longer than that starts at day 1. The decay has
     already taken a capped streak (at most 35) to day 5 or below by then, so
     the two rules differ by at most four steps, only past a month away.

   @param lookup  { last: { value, state, gap } | null }
   @returns the 1-based streak position.
*/
export function deriveLoginStreak(lookup) {
  const last = lookup && lookup.last;
  if (!last || typeof last !== 'object' || last.state !== 'claimed') return 1;
  const v = Math.floor(Number(last.value));
  const gap = Math.floor(Number(last.gap));
  if (!Number.isFinite(v) || v < 1 || !Number.isFinite(gap) || gap < 1) return 1;
  const s = v + 1 - (gap - 1);
  if (s < 1) return 1;
  if (s <= DAILY_LOGIN_STREAK_CAP) return s;
  return DAILY_LOGIN_STREAK_CAP - DAILY_LOGIN_CYCLE_DAYS + ((s - 1) % DAILY_LOGIN_CYCLE_DAYS) + 1;
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
    note: 'streak derived server-side from the last claim row; a missed day costs one step',
  }),

  /* ── BLOCKED, each on a NAMED capability ────────────────────────────────
     These are not "unimplemented". Each is one dependency away, the dependency
     is stated, and the verb answers `reward_unavailable` with it attached — so
     the client can render "not yet" and a reader can tell what would unblock
     it. */
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
   which is why it returns them at all rather than just the rows; since
   2026-10-16-login-reward.sql it also returns `last`, with the gap in whole
   UTC days measured in SQL, so the streak rule never parses a key either.

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
