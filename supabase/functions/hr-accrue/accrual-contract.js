// ============================================================================
// supabase/functions/hr-accrue/accrual-contract.js — THE ACCRUAL ENGINE'S VOCABULARY.
//
// A piece of the accrual engine (accrual.js: the door, the module map).
// Why a call paid nothing (SKIP), which kinds it can pay (PAYABLE_KINDS), who
// is settling (the caller fence), and nat. It imports nothing.
//
// ── ROLLING BACK A PAYABLE KIND — THE OPERATOR PROCEDURE (Security C3) ─────
// Read this BEFORE reverting an Edge deploy or renaming a catalogue id, because
// the safe order is not the obvious one.
//
// THE HAZARD. A pointer this build cannot price answers with a REFUSING skip
// reason, which defers the window rather than confiscating it. That is right,
// and it has a consequence: the collect refuses, and a refused collect refuses
// the SWITCH, so the character cannot be moved off the pointer by any client
// gesture. Roll the Edge payload back while players hold `artisan` pointers —
// or rename a recipe id — and every one of those characters is frozen until a
// deploy goes forward again.
//
// WHAT ALREADY HANDLES MOST OF IT. `set-activity.js` lets an incoming `idle`
// declaration force-close such a window as a JOURNALLED FORFEIT, for the
// reasons in `POINTER_SKIP_REASONS` (./intents.js) — the ones that are a
// property of the pointer rather than of the absence. So a player who taps
// STOP unfreezes themselves, loses only the window that could not be priced,
// and gets a `forfeited` receipt saying so. That covers a rollback where the
// OLD payload is still deployed and still has that code.
//
// WHAT DOES NOT. Rolling back to a payload that PREDATES the escape hatch (any
// build before b356) removes it, and then nothing client-side unfreezes a
// player. In that case the operator step is:
//
//   -- 1. WHO IS STUCK. Run first; if it returns 0 rows, do nothing.
//   select user_id, slot, active_kind, active_id, accrued_to
//     from public.player_state
//    where active_kind = 'artisan';           -- or the kind being rolled back
//
//   -- 2. IDLE THE POINTER. This is the whole fix; it does not touch a balance.
//   --    `accrued_to` is advanced in the SAME statement, because leaving it
//   --    behind hands the next accrual an absence nobody spent working.
//   update public.player_state
//      set active_kind = 'idle', active_id = null,
//          active_since = null, accrued_to = now(), version = version + 1
//    where active_kind = 'artisan';
//
//   -- 3. JOURNAL IT. An untraced mass write to player_state is indistinguishable
//   --    from an incident later. One row per character, `kind='admin'`.
//   insert into public.player_ledger (user_id, slot, kind, intent, meta)
//   select user_id, slot, 'admin', 'rollback:idle_pointer',
//          jsonb_build_object('was_kind', 'artisan', 'was_id', active_id)
//     from public.player_state where active_kind = 'idle';
//
// ⚠ RUN IT BEFORE THE ROLLBACK DEPLOY, NOT AFTER. Between the deploy and the
//   update, every affected player is frozen; doing it first means they are
//   merely idle, which is a state the old payload understands perfectly.
// ⚠ AND THE DEPLOY ORDER FOR GOING FORWARD IS THE OPPOSITE: Edge first, verify
//   `payload_sha256` on the GET route, client second. A client that declares a
//   kind the deployed engine cannot set earns a 409 on every gesture.
// ============================================================================

/* Reasons a call did nothing. Machine codes, never prose — the client
   localises (design §2, "Error taxonomy"). These are not errors: they are the
   ordinary answer for a player who has nothing to collect.

   ⚠ THIS TABLE IS THE WHOLE SET. Every `reason:` this function returns must be
     a member of it — never a bare string literal at the return site. The
     collect-before-switch rule in ./intents.js partitions these into "safe to
     switch" and "switching would confiscate", and it can only do that for
     reasons it can see. `'no_cap'` was a bare literal here for four builds:
     absent from this table, absent from both lists over there, and classified
     correctly only because classifySkip fails closed. It was right by accident,
     and an accident is not a mechanism. tests/activity-intent.mjs A17 reads
     THIS object and asserts the partition covers it exactly, and that no reason
     is produced as a literal. */
export const SKIP = {
  NO_ACTIVITY: 'idle',
  UNSUPPORTED: 'unsupported_activity',
  TOO_SOON: 'below_min_span',
  NO_TARGET: 'unknown_monster',
  NOTHING: 'nothing_accrued',
  /* An activity pointer with no `active_since`. Fail-closed rather than
     substituted — see the precondition below. */
  NO_ACTIVE_SINCE: 'no_active_since',
  /* hr_offline_cap_ms returned 0 (or the read failed). NOTHING in the window
     can be priced, so this is a refusing reason — see the lockout note beside
     REFUSING_SKIP_REASONS in ./intents.js. Unreachable today: the cap function
     floors at 12h. */
  NO_CAP: 'no_cap',
  /* An `artisan` pointer whose id is not a fuel run (catalogue.js FUEL_RUNS):
     a cut bench recipe or a fuel the catalogue no longer has. The NO_TARGET of
     the other payable kind, and a separate code because a support request has
     to be able to tell a cut monster apart from a cut recipe. REFUSING, and a
     POINTER reason: a STOP forfeits the window as a journalled forfeit
     (./intents.js POINTER_SKIP_REASONS), so nobody is frozen on it. */
  NO_RECIPE: 'unknown_recipe',
  /* THE CHARACTER IS ON A HUNT (lane C2). A hunt session's window is settled by
     the hunt settle (./hunt-settle.js: the world tick and the hunt verbs) and by
     nothing else, so the accrue/collect pricing of the same pointer answers
     this and pays nothing. SAFE, not refusing: there is nothing owed HERE —
     the session owns the window, and the accrue verb goes on to settle the
     hunt itself (index.ts, respond). */
  HUNT_OPEN: 'hunt_open',
  /* A COMBAT POINTER WITH NO HUNT SESSION (closed rebuild, lane C2). A fight is
     a session; nothing else prices one. SAFE, not refusing: no window is owed
     to a pointer the server never pays (set-activity answers `hunt_required`
     before one can be declared). */
  HUNT_REQUIRED: 'hunt_required',
  /* THE HUNT WINDOW WOULD LEAVE A WORLD PAST THE BOUND (lane c-tick-shards). The
     world the window ends on encodes past HUNT_TUNING.worldMaxBytes (engine
     contract #4), so accrueHunt proposes NOTHING: refused here, deterministically,
     before any commit is built, never left to the database's CHECK (2026-10-21: a
     63 KB world reached the commit in a mutant). ./hunt-settle.js asks for a
     shorter window, as it does for a degradable clamp (another swing boundary is
     another world). REFUSING: the instance keeps settled_to, swing and world, and
     the window stays owed. Hunt-only: the pointer accrual never produces it. */
  WORLD_TOO_LARGE: 'world_too_large',
};

/* ⚠ THE KINDS THIS ENGINE CAN PAY. THE ACTIVITY INTENT'S ALLOWLIST IS DERIVED
   FROM THIS ARRAY AND MUST NEVER BE WIDER (set-activity.js, asserted by
   tests/activity-intent.mjs A1).

   The reason is the whole "collect before you switch" rule: `hr_apply` stamps
   `accrued_to = now()` on any activity change, so a window the engine cannot
   PRICE is a window the switch CONFISCATES. `hr_activities` holds 344 rows
   across three kinds, so an allowlist wider than what this file simulates would
   let a player set an activity, work it for three hours, switch, and be paid
   nothing — an under-payment created by the very rule that closed the
   over-payment.

   ── WHAT PROTECTS A WIDENING, STATED HONESTLY (b356) ────────────────────
   ⚠ THIS PARAGRAPH USED TO READ: "If you add a kind here without a simulation
     below, the guard fails; that is the guard's entire job." THAT GUARD DID NOT
     EXIST. Measured before rewriting this comment: adding a fourth kind to this
     array and running the whole suite is GREEN, and the new kind then falls
     through the branch below into the COMBAT tail — which looks its `active_id`
     up in MONSTERS, finds nothing, and prices the night against an undefined
     monster. Not a build failure: a wrong payment. The comment was describing
     a protection somebody intended rather than one anybody wrote, which is the
     "assertion that asserts nothing" family this repo has recorded eighteen
     instances of, applied to prose.

   What is TRUE, and each of these is a real mechanism you can break and watch
   go red:

     1. THE DISPATCH IS A TABLE, AND THE BRANCH IS TOTAL. `KIND_ACCRUERS`
        (accrual.js) maps a kind to the function that prices it; `computeAccrual`
        looks the kind up there and then REFUSES anything that is not `combat`
        with `SKIP.UNSUPPORTED`. So a kind added here with no simulation is (a)
        named by tests/artisan-accrual.mjs T1, which compares this array against
        that table in both directions, and (b) paid NOTHING at runtime, its
        window DEFERRED (a refusing reason: delta NONE, watermark unmoved)
        rather than mis-simulated as a fight against a monster that does not
        exist. Two independent mechanisms, one of which is a build failure.
     2. `SETTABLE_KINDS` is DERIVED from this array (set-activity.js), and
        tests/activity-seam.mjs S1 fails the build when the client's
        `ACTIVITY_KINDS` does not match it, S2 when no `declareActivity('<kind>')`
        call site exists in src/legacy.js, and B348-3 in the browser suite when
        no real player GESTURE produces it. So a server-only widening cannot
        ship — that is the b348 bill, and those three are what it bought.
     3. tests/accrual-engine.mjs `settableKindsGuard` asserts the derivation in
        both directions: nothing settable that cannot be paid, nothing payable
        that cannot be set.

   What is still NOT checked, so nobody mistakes this list for one: that the
   simulation a new kind dispatches to is CORRECT. Only fixtures do that.

   ── THE ROLL CALL (the one-town-work cut, 09-crafting.md 4.17) ──────────
   `combat` (a hunt session, settled by ./hunt-settle.js) and `artisan`, which
   is the Great Hearth's fuel runs and nothing else (catalogue.js FUEL_RUNS;
   the bench left with the cut). `gather` LEFT: town work is a company's jobs,
   settled in SQL. A `gather` declaration is refused by name
   (`activity_unsupported`), and a gather pointer an old row still holds is
   priced by nothing (UNSUPPORTED, a POINTER reason: a STOP forfeits it as a
   journalled forfeit). The cut file idles every such pointer before this
   payload deploys. F1's company flame retires `artisan` too (4.13 row 3). */
export const PAYABLE_KINDS = Object.freeze(['combat', 'artisan']);


/* A finite, non-negative integer or the fallback. Used on every number that
   crosses into this engine from a database row — a NULL column, a bigint
   arriving as a string, or a NaN would otherwise propagate into `Math.floor`
   and out the other side as a grant. */
export function nat(v, fallback) {
  const n = Number(v);
  return (Number.isFinite(n) && n >= 0) ? n : fallback;
}

/* ── WHO IS SETTLING THIS WINDOW (the caller taxonomy, 2026-09-18) ───────────
   This replaces the boolean `finalWindow`, which was doing two jobs under a
   name that only described one of them. Two behaviours hang off it — the
   ACCRUE_MIN_MS floor (computeAccrual) and refusal (b) in settledWatermarkMs —
   and they are properties of WHO IS CALLING, not of the window:

     'accrue'   index.ts's cadence poll. The pointer survives the call, so a
                sub-minute window is DEFERRED (the floor applies) and the
                sub-action remainder is deferred too. Today's behaviour.
     'collect'  set-activity.js's collect-before-switch. The switch that follows
                stamps `active_since = now()`, so there is no next call and
                nothing to defer INTO: the floor is exempt and the watermark
                stamps `now()`. Exactly today's `finalWindow: true` (b531).
     'tick'     the world tick (services/world-tick, docs/planning/
                WORLD_TICK_DESIGN.md). A 10 s window is below the floor, so the
                floor is exempt — but a tick window's remainder IS deferrable,
                because the tick's NEXT window starts at the watermark this one
                stamped. Borrowing 'collect' for it (the 2026-09-18 spike) made
                `settledWatermarkMs` stamp `now()` and forfeit the sub-action
                remainder every ten seconds: measured 2.0% / 3.5% / 7.8% of a
                ten-minute span on the three parity fixtures with alignment off
                (tests/world-tick-parity.mjs --mutate --callerTick). The tick was
                protected only by `alignWindow` zeroing the remainder — two
                independent mechanisms having to agree, one of them named the
                opposite of what it did.

   ⚠ THE CALLER IS A SERVER LITERAL, NEVER A REQUEST FIELD. index.ts and
     set-activity.js each spell it as a constant string in the computeAccrual
     literal; nothing reads it off the body. tests/activity-intent.mjs asserts
     that (A14 + the caller SOURCE arm), because a caller a client could choose
     would let it pick 'collect' and buy the floor exemption on demand.

   FAIL-SAFE: anything unrecognised — absent, misspelled, a hostile value —
   reads as 'accrue', the most conservative of the three. 'accrue' keeps the
   floor (grants nothing it is unsure about) and defers the remainder (settles
   LESS than now, so the window stays open and is paid next call). The only
   caller that can LOSE time by being mislabelled is 'collect', and 'collect' is
   a single call site with its own source guard. */
export const ACCRUAL_CALLERS = Object.freeze(['accrue', 'collect', 'tick']);

/* ── THE RUNTIME FENCE (Security, 2026-09-18) ────────────────────────────────
   The paragraph above says the caller is a server literal, and A14b asserts it
   — ON TWO FILENAMES, `index.ts` and `set-activity.js`. That is the whole of
   the guard, and it is a source regex: a THIRD edge call site (a future intent
   handler, a new verb's module) would spell `caller: body.caller` and no guard
   in this repo would fire, because A14 and A14b both enumerate the two files
   they knew about. A source assertion cannot see a file that did not exist when
   it was written.

   So the privilege is fenced at RUNTIME as well, by an unforgeable token rather
   than by a string. `CALLER_AUTHORITY` is a module-private object IDENTITY: the
   only way to hold it is to `import` it from this module, and a request body
   cannot — it arrives as JSON, and JSON has no way to express "this exact
   object". `JSON.parse(JSON.stringify(CALLER_AUTHORITY))` is a different
   object and is refused, which is the property stated as a test
   (tests/settle-carry-defer.mjs D4g).

   The result: EVERY value a client could ever get into `inp.caller`, through
   any present or future call site that forwards a body, reads as 'accrue' —
   the floor stays on and the window is deferred. The privileged callers must
   both name themselves AND prove they are server code. This does not stop an
   author who deliberately imports the token and wires a body field to it; no
   in-process check can. It stops the accident, which is the one that ships. */
export const CALLER_AUTHORITY = Object.freeze({ hearthrise: 'accrual-caller-authority' });

export function accrualCaller(inp) {
  const c = inp && inp.caller;
  if (c !== 'collect' && c !== 'tick') return 'accrue';
  /* Identity, not shape: `===` on the frozen singleton. A structural check
     (`inp.callerAuthority.hearthrise === '...'`) would be satisfiable by a JSON
     body and would be no fence at all. */
  return (inp.callerAuthority === CALLER_AUTHORITY) ? c : 'accrue';
}
