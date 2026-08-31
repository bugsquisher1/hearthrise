// ============================================================================
// supabase/functions/hr-accrue/claim-reward.js — THE GRANT INTENT.
//
// "I claim today's login reward."
//
// Read ./intents.js first — it is the contract, and ./set-activity.js is its
// first implementation. This is the second, and the FIRST one that moves money.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY THERE IS ONE VERB HERE AND NOT SIX
// ════════════════════════════════════════════════════════════════════════════
// The measurement first, because the design follows from it. 42 direct writes
// to `G.gold` across src/** (control: blinding the scanner's pattern set drops
// the count to 6, so it is not blind). TWELVE are grants. Of those:
//
//   • FIVE are ACCRUAL-COMPUTED — companion procs, the bounty turn-in, the
//     daily-task payout, the quest payout. Every one fires inside killMonster /
//     updateDaily / updateQuest, i.e. inside the loop the server already
//     simulates. They do not want an intent; they want `computeAccrual` to pay
//     them, and the client sites are deleted when live actions move server-side.
//   • ONE is IAP (`legacy.js:2026`), disabled in the web beta, and wants receipt
//     verification rather than a progression intent.
//   • SIX are CLAIM-SHAPED: a discrete "I claim X" gesture against a thing the
//     player has already earned.
//
// And every one of those six is the SAME operation:
//
//     name a claimable → the server checks it has not been claimed
//                      → the server prices it FROM ITS OWN CATALOGUE
//                      → one atomic apply, one version bump, one ledger row.
//
// Six verbs would be six copies of that, six rate buckets, six chances to
// forget the double-claim check. One verb with a CLAIMABLE REGISTRY is one
// implementation, and adding a reward becomes a data row — which is this
// repo's stated golden rule ("grow by adding data, not code").
//
// ════════════════════════════════════════════════════════════════════════════
// WHAT THE SERVER ALREADY OWNS, AND WHY THE SQL FOR THIS IS SO SMALL
// ════════════════════════════════════════════════════════════════════════════
// The double-claim lock is NOT new code. `hr_apply` has had it since the apply
// engine landed and it is exactly right for this:
//
//   · the generic `progress` block CANNOT write 'claimed' — it is refused, and
//     an existing 'claimed' row is preserved through `on conflict` (review S13);
//   · the dedicated `progress_claim` block is the ONLY route to 'claimed', it
//     requires the row to already be 'done', and it asserts `row_count = 1` —
//     a claim that changes nothing is "not earned, or already claimed" and
//     answers `not_claimable`;
//   · all of it runs under `pg_advisory_xact_lock` + `select … for update`
//     inside the protected block, so a refusal rolls the whole delta back.
//
// So a second claim of the same day is refused BY THE DATABASE, under a lock,
// whatever this file believes — and the arithmetic that would otherwise have
// been corrupted by the losing call (see `add: streak` below) is rolled back
// with it. What this file adds is the price and the eligibility.
//
// ════════════════════════════════════════════════════════════════════════════
// THE THREE RULES THIS INTENT IS BUILT ON
// ════════════════════════════════════════════════════════════════════════════
//
// 1. THE CLIENT NAMES A REWARD. IT NEVER NAMES A PERIOD OR AN AMOUNT.
//    `request.js` reads `{kind, key}` and nothing else — there is no `period`
//    field and no `amount` field, so "claim every day since launch" is not a
//    request that can be spelled. The period comes back from
//    `hr_claim_lookup`, which derives it from `now()` with the day-key function
//    the clan domain has used since 2026-08-08. The amount comes from
//    `src/data/rewards.js`, which is vendored into this payload and imported by
//    the browser from the same file.
//
// 2. IT DOES **NOT** COLLECT FIRST, AND THAT IS DERIVED RATHER THAN CHOSEN.
//    `hr_apply` stamps `accrued_to = now()` on a delta carrying `equip` or
//    `activity`, and on nothing else (apply-engine §S5). A claim's delta carries
//    gold, gems, progress, progress_claim and journal — so no unpaid window is
//    closed and there is nothing to confiscate. Collecting first would cost a
//    round trip and buy nothing.
//    ⚠ That is a fact about a DELTA, so it is CHECKED AT RUNTIME
//      (`deltaClosesWindow`) rather than asserted in prose. The day a reward
//      wants to equip what it grants, this intent refuses (`would_confiscate`)
//      instead of silently eating somebody's night.
//
// 3. A REJECTED INTENT IS RETRIED WITH A NEW KEY. Inherited verbatim; the
//    contract's §"A REJECTED INTENT IS RETRIED WITH A NEW KEY" governs. Note
//    the claim's key is CLIENT-CHOSEN, so the client can always take that
//    advice — unlike the accrual collect, which is why the C1 release in
//    `hr_apply` exists.
//
// ════════════════════════════════════════════════════════════════════════════
// THE CLIENT SEAM — the wire, specified. NOT IMPLEMENTED HERE (server half).
// ════════════════════════════════════════════════════════════════════════════
//   POST <SUPABASE_URL>/functions/v1/hr-accrue
//     Authorization: Bearer <user JWT>      ← the ONLY identity
//     {"verb":"claim_reward","slot":N,"intentId":"<uuid>",
//      "reward":{"kind":"daily","key":"login"}}
//
//   200 {ok:true, verb, version, now, state, skills, inventory, equipment,
//        farm, progress, total_level,
//        granted:{kind,key,period,gold,gems,streak,cycle_day,weeks,mult} | null}
//        ⚠ snake_case, and that is not a style choice — the four trailing fields
//          are SPREAD from the pricer's `meta`, so whatever a pricer spells is
//          what reaches the wire. The first revision of this header said
//          `cycleDay,weeksDone` and omitted `mult` while the code emitted
//          `cycle_day, weeks, mult` (Security G3): a client written from the
//          documentation would have rendered three undefineds. The EMITTED
//          spelling wins, because it is the one that ships. The literal key set
//          is asserted in tests/claim-intent.mjs (C4) and again over the real
//          driver in tests/delta-transport.mjs (T7), so this line and the code
//          can no longer drift apart in silence — a new `meta` key is a red
//          build until it is written here too.
//   200 {ok:true, replayed:true, granted:null, …}
//        ⚠ `granted` IS NULL ON A REPLAY, and that is the OPPOSITE of
//          set_activity's `collected`. There the receipt belonged to a SEPARATE
//          apply (the collect) which really did run, so dropping it reported
//          applied payment as nothing (review C5, measured: 3,809 gold). Here
//          there is exactly ONE apply, and on a replay THIS invocation applied
//          nothing — inventing a receipt for it is index.ts's S7 mistake in a
//          new file. The state envelope is fresh and already shows the money.
//   400 {ok:false, error:'missing_intent_id'|'bad_reward'}
//   409 {ok:false, error:'unknown_reward'|'reward_unavailable'|'no_character'}
//        `reward_unavailable` carries `needs`, read out of the registry, so the
//        client can say "not yet" and a reader can see what would unblock it.
//   409 {ok:false, error:'not_claimable'|'version_conflict'|'intent_mismatch'|
//                        'daily_budget'|…, stage:'claim', …envelope}
//   429 {ok:false, error:'rate_limited'}   20/min. Back off; never spin.
//
// ── WHERE IT GOES, SITE BY SITE ────────────────────────────────────────────
// A transport module in the shape of `src/net/activity.js` — pure request
// builder + pure response classifier + a thin caller, so a test can assert the
// LITERAL BYTES on the wire — behind the SAME kill switch as accrual
// (`isServerAccrualEnabled()`; two switches would produce a client that claims
// against a server that never heard of the character). FIRE AND RECONCILE: the
// sheet may show its own optimistic number, but the envelope is the truth and a
// refusal puts it back to what the SERVER says, never to the guess.
//
//   src/features/daily-reward.js:76  claim()
//       → claim_reward {kind:'daily', key:'login'}          ** LIVE TODAY **
//       The local `G.gold += rw.gold` becomes render-only; `applyEnvelopeState`
//       writes the real number and `granted` is the receipt to show.
//       ⚠ `s.lastClaimDay` stays a LOCAL cache for "have I shown the sheet",
//         and stops being the eligibility test. Eligibility is the server's
//         `not_claimable`, which is the only answer that survives a second
//         device.
//
//   The other five are wired the SAME way and each answers
//   `reward_unavailable` with its own `needs` until its dependency lands. Wiring
//   them now is not wasted: the refusal is renderable, so the surface is honest
//   ("not yet") instead of paying a client-authored number.
//
//   src/legacy.js:16101 claimQuestReward()   → {kind:'daily',      key:'goal'}
//                       (weekly tab)         → {kind:'quest',      key:'weekly'}
//   src/features/collection-log.js:64        → {kind:'collection', key:'milestone'}
//   src/features/renown.js:308               → {kind:'flag',       key:'renown_rank'}
//   src/legacy.js:2902 completeBounty()      → {kind:'bounty',     key:'turnin'}
//       ⚠ BLOCKED ON THE MARKS COLUMN, which another workstream is building.
//         A turn-in pays gold AND Bounty Marks, and `marks` has no server home:
//         paying the gold half alone would silently drop the Marks, which is a
//         worse outcome than refusing. It is also kill-driven, so part of it
//         belongs to accrual rather than to a claim.
//
//   NOT WIRED, deliberately, and named so the absence is a decision:
//     src/features/muster.js:948 payChest / src/features/raids.js:899
//     grantReward — the VALUE is already decided by a SECURITY DEFINER RPC.
//     Those are pure bookkeeping and belong INSIDE those RPCs (the 2026-08-15
//     architecture ruling: rules ⇒ Edge, bookkeeping ⇒ database function), not
//     in a verb that re-prices what the database already priced. Clan/raid
//     domain, separate owner.
//     src/admin.js:188 and src/legacy.js:6229 `testerBoost` — dev sinks. They
//     must never acquire a server path.
//
// ── THE SEAM ────────────────────────────────────────────────────────────────
//   exec(text, params) -> Promise<rows[]>
// One statement, its own transaction, as `hr_engine` — which holds ZERO table
// privileges in every schema. THIS FILE CONTAINS NO INSERT, UPDATE OR DELETE
// and could not use one. The whole capability is "propose a delta to a function
// that re-validates every invariant".
// ============================================================================

import {
  intentSpec, requiresKey, rateBucketFor, collectsFirst,
  claimIntentNameFor, deltaClosesWindow, INTENT_ERRORS,
} from './intents.js';
import { refusalBody } from './envelope.js';
import {
  CLAIMABLES, claimableFor, claimableId, priceDailyLogin, deriveLoginStreak,
} from '../../../src/data/rewards.js';

/** The verb's own name — used to build `journal.intent` and to read the
    registry. Never a literal at a call site. */
export const VERB = 'claim_reward';

/* ── THE PRICERS ────────────────────────────────────────────────────────────
   One entry per claimable the SERVER can pay, keyed by the same
   `claimableId(kind, key)` the registry uses. A pricer is a PURE function of
   server state:

       price({ spec, lookup, env }) -> { gold, gems, add, meta } | { error, detail }

     spec    the frozen registry row
     lookup  hr_claim_lookup's answer: { today, prev, rows: {<period>: {value,
             state}} } — the SERVER's day keys and the SERVER's claim history
     env     the hr_state_of envelope, for pricers that need levels or gear

   `add` is what lands in `player_progress.value` for the claimed period.

   ⚠ THE REGISTRY AND THIS TABLE ARE TWO LISTS THAT MUST AGREE, so neither is
     allowed to be the only one. At RUNTIME a `status:'priced'` row with no
     pricer answers `reward_unavailable` (a refusal, never a wrong payment or a
     crash); at BUILD time tests/claim-intent.mjs asserts the two sets are equal
     in BOTH directions, so the drift is a red build rather than a live refusal
     nobody sees. `pricedClaimables()` and `pricerIds()` below are what it
     reads — derived, so neither can be restated. */
export const PRICERS = Object.freeze({
  'daily:login': priceLoginClaim,
});

/** Every registry id this build claims to be able to pay. */
export function pricedClaimables() {
  return Object.keys(CLAIMABLES).filter((id) => CLAIMABLES[id].status === 'priced').sort();
}
/** Every registry id this build actually HAS a pricer for. */
export function pricerIds() { return Object.keys(PRICERS).sort(); }

/* ── THE STREAK, DERIVED FROM THE SERVER'S OWN CLAIM HISTORY ────────────────
   THE IMPLEMENTATION MOVED TO src/data/rewards.js (b498), for the same reason
   the seven-day cycle moved there in b349 and stated at length at its new site:
   a number the CLIENT renders and the SERVER pays must be produced by one
   function, not by two that agree.

   It did not stay agreed. b475 taught the daily sheet to render
   `state.streak_days` — hr_apply's SETTLE streak, "consecutive days the player
   played" — as if it were this one, "consecutive days the player CLAIMED".
   Live on 2026-08-31 the two diverged and the sheet advertised Day 3 (2,000
   gold, 5 gems) against a Day 1 payout (500 gold, no gems).

   The client cannot call `hr_claim_lookup`, but it does not need to: every
   envelope carries the same `daily`/`login` progress rows, so the client builds
   `{prev, rows}` from what it was given and calls THIS function. Re-exported
   here so nothing that imports it from this module (tests/claim-intent.mjs, and
   any future pricer) has to know it moved.

   ⚠ THE STREAK IS STILL NEVER READ FROM THE CLIENT. `G.streak.count` is
     forgeable; it is not an input here and there is no field through which it
     could become one. What the client now shares is the RULE, applied to the
     SERVER's own rows — never a value it gets to name. */
export { deriveLoginStreak };

/* ── THE PERIOD, AND THE FAIL-CLOSED ROW CHECK — SHARED BY EVERY PRICER ─────
   Security G6. Both of these were written INSIDE priceLoginClaim, where they
   read as part of pricing a login streak. They are not: they are the terms on
   which ANY claimable may be paid, and pricer #2 — written by copying the
   shape of pricer #1, as pricer #1 was written by copying set-activity.js —
   would have inherited the arithmetic and not the guard. Extracted so it is
   inherited STRUCTURALLY: a pricer that does not call this does not get a
   period at all.

   AND IT NOW COVERS THE NON-PERIODIC CASE, WHICH THE ORIGINAL DID NOT. Only
   `daily:login` is priced today and it is periodic, so the `''` period was
   unreachable — but four of the six registry rows are `periodic:false`
   (collection:milestone, flag:renown_rank, bounty:turnin), they file under the
   PERMANENT key `''`, and `hr_claim_lookup` returns `''` rows precisely so this
   can be checked. A one-off claimable is the case where a foreign row matters
   MOST: there is no tomorrow to recover into, so compounding an unknown value
   into a permanent row and then paying for it is unrecoverable rather than
   merely wrong for a day. */

/**
 * The period key a claimable is filed under. ONE spelling, used by the gate
 * below AND by `claimDelta`, because a gate that checks one key while the delta
 * writes another is a check that guards nothing.
 *
 * @returns the key, or `null` when the row is periodic and the SERVER gave no
 *          day — which is a refusal, never a fallback to `''`.
 */
export function periodKeyFor(spec, lookup) {
  if (!spec || !spec.periodic) return '';
  const today = lookup && lookup.today;
  return (typeof today === 'string' && today !== '') ? today : null;
}

/**
 * THE GATE EVERY PRICER RUNS FIRST. Pure.
 *
 * @returns `{ period }` when the claim may proceed, or `{ error, detail }` —
 *          the same refusal shape a pricer returns, so a pricer forwards it
 *          verbatim and cannot accidentally swallow it.
 */
export function resolveClaimPeriod(o) {
  const { spec, lookup } = o;
  const period = periodKeyFor(spec, lookup);
  if (period === null) {
    /* The server did not give us a day. Refusing is the only honest answer: a
       PERIODIC claim written under period '' would be a PERMANENT row that can
       never be claimed again, which is a one-line way to end a player's daily
       reward forever. Note this is not the same as a genuinely non-periodic
       claimable, which is FILED under '' on purpose. */
    return { error: INTENT_ERRORS.REWARD_UNAVAILABLE, detail: { needs: 'a server day key' } };
  }
  /* ⚠ A ROW THIS ENGINE DID NOT WRITE IS REFUSED — AND AN ALREADY-CLAIMED ONE
     IS DELIBERATELY NOT. The distinction cost a red test to find and it is the
     subtlest thing in this file.

     The first revision refused ANY existing today-row, "to save a round trip on
     a second click". Measured: it also intercepted a REPLAY. A client whose
     response was dropped retries with the SAME key — which is exactly what
     idempotency exists for — and got `not_claimable` for a reward it had
     genuinely just been paid, with `granted: null`. The money was in the
     envelope and the receipt was gone: Security's C5 finding, reproduced in a
     new file within a day of it being closed in the old one.

     Only `hr_apply` can tell a replay apart from an honest second click,
     because only `hr_apply` holds `player_intents`. So a 'claimed' row FALLS
     THROUGH: a replay answers `replayed: true` with fresh state, and an honest
     second click answers `not_claimable` from the database, under the character
     lock, with the `progress` write rolled back with it.

     What is refused here is a row in any OTHER state. This engine creates a
     claim row only as part of an atomic claim, so 'active' or 'done' is a state
     it did not write and cannot interpret — and hr_apply's generic `progress`
     block ADDS to `value`, so proceeding would compound a number whose meaning
     is unknown into the next period, then claim it and pay for it. hr_apply
     cannot catch that: from its side it is a well-formed claim of a 'done' row,
     which is precisely what it is built to honour. This check is the ONLY thing
     standing there. FAIL CLOSED. */
  const rows = (lookup && lookup.rows) || {};
  const existing = Object.prototype.hasOwnProperty.call(rows, period) ? rows[period] : null;
  if (existing && existing.state !== 'claimed') {
    return {
      error: 'not_claimable',
      detail: {
        period,
        state: existing.state ?? null,
        why: 'a claim row for this period exists in a state this engine did not write',
      },
    };
  }
  return { period };
}

/**
 * THE DAILY LOGIN REWARD. The only claimable that is a pure function of server
 * state plus the server clock — which is why it is first, rather than merely
 * easiest. Every other claim-shaped grant tests a counter the server does not
 * keep yet (see the registry's `needs` fields).
 */
export function priceLoginClaim(o) {
  const { spec, lookup } = o;
  /* The shared gate, and its refusal forwarded verbatim. runClaimReward ALREADY
     ran this — that is what makes it structural, and pricer #2 inherits it by
     not being reached until it has passed. It is repeated here because the
     pricers are also called directly (by tests, and by whatever tool prices a
     claim for support), it is pure and free, and a pricer that is safe on its
     own is a pricer that cannot be made unsafe by a future refactor of its
     caller. Idempotent by construction: same inputs, same answer. */
  const gate = resolveClaimPeriod({ spec, lookup });
  if (gate.error) return gate;
  const streak = deriveLoginStreak(lookup);
  const p = priceDailyLogin(streak);
  return {
    gold: p.gold,
    gems: p.gems,
    add: streak,
    meta: { streak, cycle_day: p.cycleDay, weeks: p.weeksDone, mult: p.mult },
  };
}

/**
 * Validate the NAMING. Pure — no database, no clock.
 *
 * Order matters and is deliberate, exactly as in set-activity.js: a real
 * claimable the server cannot pay yet must be refused BY NAME
 * (`reward_unavailable`, with `needs`) and never mistaken for a malformed
 * request. A player told "bad request" when the truth is "the server does not
 * track your Renown yet" files a bug against the wrong system.
 *
 * @param r  the parsed `{kind, key}` from request.js, or null
 */
export function validateClaim(r) {
  if (!r || typeof r !== 'object') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_REWARD, detail: { why: 'no reward named' } };
  }
  /* Both are null when request.js could not match them against its allowlists:
     `kind` against player_progress's own CHECK list, `key` against
     /^[a-z0-9_]{1,64}$/. A malformed key therefore arrives as `bad_reward`, not
     `unknown_reward` — correct, because it is not a lookup that failed, it is a
     string that could never have been one. */
  if (!r.kind || !r.key) {
    return {
      ok: false, status: 400, error: INTENT_ERRORS.BAD_REWARD,
      detail: { why: r.kind ? 'unreadable reward key' : 'unknown reward kind' },
    };
  }
  /* ⚠ `claimableFor`, NOT `CLAIMABLES[id]`. The key shape matches `constructor`
     and `__proto__`, both of which are truthy on a plain object and both of
     which walked straight past the truthiness form of this check on the real
     ITEMS/MONSTERS maps (review C6). Here it would be worse than a wasted round
     trip: the very next line reads `spec.status`, and `Object.constructor.status`
     is `undefined`, which is neither 'priced' nor 'blocked'. */
  const spec = claimableFor(r.kind, r.key);
  if (!spec) {
    return {
      ok: false, status: 409, error: INTENT_ERRORS.UNKNOWN_REWARD,
      detail: { kind: r.kind, key: r.key },
    };
  }
  if (spec.status !== 'priced') {
    return {
      ok: false, status: 409, error: INTENT_ERRORS.REWARD_UNAVAILABLE,
      detail: { kind: r.kind, key: r.key, needs: spec.needs || null },
    };
  }
  return { ok: true, kind: r.kind, key: r.key, spec, id: claimableId(r.kind, r.key) };
}

/**
 * THE DELTA. Built field by field from SERVER values — the price out of the
 * vendored catalogue, the period out of Postgres, the intent name out of the
 * shared `claimIntentNameFor`.
 *
 * `progress` + `progress_claim` in ONE delta is the whole double-claim lock:
 * hr_apply runs the generic block first (writing the row as 'done') and the
 * claim block second (flipping 'done' → 'claimed', asserting exactly one row
 * moved). A second claim finds a 'claimed' row, which `on conflict` preserves,
 * so the claim block moves ZERO rows and rejects with `not_claimable` — and the
 * rejection rolls the generic block's write back with it.
 */
export function claimDelta(o) {
  const { kind, key, spec, period, priced } = o;
  /* THE GATE'S OWN PERIOD, VERBATIM. This used to be a second
     `spec.periodic ? period : ''` ternary — the same rule, spelled twice, in the
     function that WRITES the row while the fail-closed check spelled it in the
     function that READS it. Two copies that agree today are two copies, and the
     day they disagree the check guards a period nothing writes to (G6). There is
     now exactly one producer, `resolveClaimPeriod`, and runClaimReward hands its
     answer to both. `spec` is still read here — for `ledgerKind` and for the
     intent name — so this is not a parameter that lost its purpose. */
  const p = period;
  const delta = {
    gold: priced.gold,
    progress: [{ kind, key, period: p, add: priced.add, state: 'done' }],
    progress_claim: [{ kind, key, period: p }],
    journal: {
      /* The registry's own `ledgerKind`, not a literal. `player_ledger.kind` is
         what `player_ledger_rollup` aggregates on — it is what still answers
         where a player's gold came from a year after the raw rows are pruned —
         so which bucket a reward lands in is content, and content belongs in
         src/data. */
      kind: spec.ledgerKind,
      intent: claimIntentNameFor(VERB, kind, key, spec.periodic ? p : null),
      meta: priced.meta || {},
    },
  };
  /* OMITTED WHEN ZERO, never sent as 0. hr_apply stamps the ledger according to
     which keys are present, so a zero gems key on every claim would put an empty
     gem movement in the journal for four days out of every seven.

     ⚠ AND A NOTE FOR WHOEVER EDITS THE PROSE IN THIS FILE: tools/pack-edge.mjs
       finds import specifiers with one deliberately simple regex — an
       import/export keyword, then the f-r-o-m keyword, then a quoted string —
       and it does not strip comments. So a comment in which that keyword is
       immediately followed by a quote character is read as a BARE SPECIFIER and
       FAILS THE PACK, which is how two sentences in this file came to be worded
       the way they are. Both were caught by the guard rather than by review;
       the guard is right and the prose is what moves. Do not widen the regex —
       its own header explains why a five-second regex beats a parser here. */
  if (priced.gems) delta.gems = priced.gems;
  return delta;
}

/* ── The one statement that opens the call ──────────────────────────────────
   THE GATE IS FIRST AND EVERYTHING ELSE IS CONDITIONAL ON IT (review D3).
   `case when` short-circuits, so a rate-limited caller pays for a boolean
   rather than for a full hr_state_of plus a progress lookup. One round trip,
   not three: at max_connections = 60 the cost of a round trip is not latency,
   it is the §2a-ii total outage.

   THE BUCKET IS A BIND PARAMETER READ OUT OF `INTENT_REGISTRY` ($3), never a
   literal — a literal here is a second registry, and an unknown bucket fails
   closed inside hr_rate_gate, so a wrong row is a 429 rather than a brand-new
   unlimited namespace.

   `hr_claim_lookup` returns the SERVER's day keys with the rows, which is the
   entire reason it returns them: see the block in src/data/rewards.js about the
   'YYYYMMDD' day-key function that was deleted before it had a caller. */
const READ_SQL = `
  with g as (select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed)
  select g.allowed                                                           as allowed,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end   as state,
         case when g.allowed
              then public.hr_claim_lookup($1::uuid, $2::int, $4::text, $5::text) end as lookup,
         now()                                                               as now
    from g`;

/* ⚠ `$5::text::jsonb`, NEVER `$5::jsonb`, BECAUSE THE DELTA IS PRE-STRINGIFIED.
   Identical constraint to set-activity.js's APPLY_SQL and index.ts's tagged
   apply — read either for the full mechanism. The short form: the engine
   connects with `prepare: false` (mandatory in transaction-pooler mode), so
   every statement takes postgres.js's describe-first path, the driver learns the
   resolved parameter type from ParameterDescription, and Bind looks it up in
   `options.serializers` — where jsonb (3802) maps to JSON.stringify. A delta
   that step (4) already stringified is then encoded a SECOND time and reaches
   hr_apply as a jsonb STRING SCALAR, which its first guard
   (`jsonb_typeof(p_delta) <> 'object'`) refuses as `bad_delta`. Every claim
   would 409, forever, and the player would be told the reward was not claimable.
   `::text` makes Postgres describe the parameter as text (25), whose serializer
   is `x => '' + x` — a passthrough — and the SQL cast does the parse. Correct
   under BOTH driver typings (an unspecified type 0 is a passthrough too).
   ALL THREE apply sites must state the same shape; tests/delta-transport.mjs's
   T6 censuses the whole deployed payload for every apply call site and fails on
   any one whose delta argument does not end `::text::jsonb`, so a fourth site
   written by copying an older shape is caught rather than shipped.
   ⚠ And do not write the apply function's name followed by an open parenthesis
     anywhere in this prose: T6's scanner is a balanced-paren walk from that
     exact token, so a mention in a comment is read as a call site with an
     unreadable argument list and fails the guard. (It did, once, here.) */
const APPLY_SQL = `
  select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text::jsonb) as res`;

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and it
 *                    selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.reward    the parsed `{kind, key}` naming
 * @returns { status, body } — the HTTP answer, built here so the test asserts
 *          the same object the shell serialises.
 */
export async function runClaimReward(o) {
  const { exec, user, slot, intentId, reward } = o;

  /* (0) SHAPE AND REGISTRY FIRST — refused before ANY database work, so a
         malformed or over-eager client cannot spend a real player's rate budget
         by looping on garbage. THIS is why these refusals carry no state
         envelope: reading one would be the database work the check exists to
         avoid (intents.js §"WHICH REFUSALS CARRY STATE"). */
  if (requiresKey(VERB) && !intentId) {
    return { status: 400, body: { ok: false, verb: VERB, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  const v = validateClaim(reward);
  if (!v.ok) {
    return { status: v.status, body: { ok: false, verb: VERB, error: v.error, ...(v.detail || {}) } };
  }
  /* A `status:'priced'` claimable this BUILD cannot price. See the note above
     PRICERS: the two lists are checked against each other at build time, and
     this is what happens if one of them ships anyway. A refusal, never a wrong
     payment, and never a crash that would take the accrue verb down with it. */
  const pricer = Object.prototype.hasOwnProperty.call(PRICERS, v.id) ? PRICERS[v.id] : null;
  if (typeof pricer !== 'function') {
    return {
      status: 409,
      body: {
        ok: false, verb: VERB, error: INTENT_ERRORS.REWARD_UNAVAILABLE,
        kind: v.kind, key: v.key,
        needs: 'this build has no pricer for a claimable its registry calls priced',
      },
    };
  }

  /* (1) GATE + READ + LOOKUP, one statement. */
  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(VERB), v.kind, v.key]);
  if (!read || read.allowed !== true) {
    return { status: 429, body: { ok: false, verb: VERB, error: INTENT_ERRORS.RATE_LIMITED } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return {
      status: 409,
      body: { ok: false, verb: VERB, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER },
    };
  }
  const lookup = read.lookup || {};

  /* (1b) THE PERIOD GATE — SHARED, AND RUN BEFORE ANY PRICER (Security G6).
          This is the "a row for this period exists in a state this engine did
          not write" check, plus "a periodic claimable with no server day key is
          refused, never filed under ''". It lived inside priceLoginClaim, where
          pricer #2 would have had to remember to copy it; running it HERE means
          a pricer inherits it by not being called until it has passed. Its
          refusal shape is a pricer's refusal shape, so the handling below is
          shared too. */
  const gate = resolveClaimPeriod({ spec: v.spec, lookup });

  /* (2) PRICE. Pure, in process, from server values only. The gate's period is
         passed in so a pricer that needs it does not re-derive it. */
  const priced = gate.error ? gate : pricer({ spec: v.spec, lookup, env, period: gate.period });
  if (priced && priced.error) {
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot,
        refusal: { error: priced.error, stage: 'claim', detail: priced.detail ?? null },
        fallback: env,
      }),
    };
  }

  /* (3) THE DELTA, and the fail-closed window check. See intents.js's
         registry row: `collectsFirst:false` is only correct while the delta
         cannot stamp `accrued_to`. Checked rather than trusted, because the
         failure it guards is silent — an unpaid night, no error anywhere. */
  /* `gate.period`, NOT `lookup.today`. The gate is what decided which period was
     checked for a foreign row, and it is the only thing that knows a
     non-periodic claimable is filed under ''. Handing claimDelta `lookup.today`
     here is what made the second ternary necessary in the first place. */
  const delta = claimDelta({
    kind: v.kind, key: v.key, spec: v.spec, period: gate.period, priced,
  });
  if (deltaClosesWindow(delta) && !collectsFirst(VERB)) {
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot,
        refusal: {
          error: INTENT_ERRORS.WOULD_CONFISCATE, stage: 'claim',
          detail: {
            why: 'this delta would stamp accrued_to on a verb that does not collect first, '
               + 'discarding the elapsed window',
            spec: intentSpec(VERB),
          },
        },
        fallback: env,
      }),
    };
  }

  /* (4) APPLY. The single writer. The version is the one just read — a claim
         does not collect, so nothing has bumped it in between. */
  const [applied] = await exec(APPLY_SQL, [user, slot, env.version, intentId, JSON.stringify(delta)]);
  const res = applied && applied.res;

  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED. hr_apply's protected block rolls back in full, so
       `not_claimable` (a second claim), `version_conflict` (a concurrent
       writer), `intent_mismatch` (a key reused for another day) and
       `daily_budget` all leave the claim available. The envelope rides along so
       "reconcile to what the server says" is executable here too. */
    return {
      status: 409,
      body: await refusalBody({
        exec, verb: VERB, user, slot,
        refusal: { error: res && res.error ? res.error : 'apply_failed', stage: 'claim', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* THE ENVELOPE, verbatim, plus a RECEIPT the server states and the client
     renders. `granted` is null on a replay — see the header: one apply, so a
     replay applied nothing, and a receipt for work that did not happen is the
     thing "no renderer may invent a bonus that was not applied" forbids. The
     fresh envelope already carries the money from the original apply. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb: VERB,
      granted: res.replayed === true ? null : {
        kind: v.kind,
        key: v.key,
        period: v.spec.periodic ? (gate.period ?? null) : null,
        gold: priced.gold,
        gems: priced.gems || 0,
        ...(priced.meta || {}),
      },
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}
