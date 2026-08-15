// ============================================================================
// supabase/functions/hr-accrue/spend.js — THE SHARED HALF OF A VALUE INTENT.
//
// `set-activity.js` was intent #1 and it spelled its own gate/read/apply/refusal
// plumbing inline, correctly. Intents #2 and #3 are `shop_buy` and `vendor_sell`
// and there are seven more gold verbs behind them, so the plumbing is extracted
// HERE — once — and the verb modules keep only the part that is actually theirs:
// validate a name, look up a price, build a delta.
//
// ⚠ WHY set-activity.js WAS NOT REFACTORED INTO THIS FILE.
//   It is deployed and verified byte-for-byte in production, and its exact
//   source lines are MUTATION ANCHORS in tests/activity-intent.mjs and
//   tests/delta-transport.mjs (T1/T2 read the hr_apply call site out of
//   set-activity.js's own bytes). Moving that statement would disarm two guards
//   while looking like tidying. The handoff already ruled on this shape:
//   "the seam is still the right shape when a THIRD verb actually needs it —
//   T6 is what makes deferring it safe." A third verb needs it; T6 — the payload
//   census that walks every file and requires `::text::jsonb` on hr_apply's last
//   argument — is what grades the statement below.
//
// ── THE SEAM (identical to set-activity.js's) ──────────────────────────────
//   exec(text, params) -> Promise<rows[]>
// ONE statement, its own transaction, run as `hr_engine`. Transaction-mode
// pooling (design §2a-ii, HARD RULE) means no multi-statement transaction may be
// opened and no session state may be relied on between calls.
//
// ⚠ THIS FILE WRITES NO TABLE. No INSERT, no UPDATE, no DELETE, and it could not
//   use one: `hr_engine` holds ZERO table privileges across every schema. The
//   entire capability of everything in this directory is "propose a delta to a
//   function that re-validates every invariant".
//
// PURE ESM. No I/O, no Deno, no globals — so tests/gold-intents.mjs drives these
// exact bytes from Node against a real PostgreSQL, and tests/delta-transport.mjs
// drives them over the real postgres.js wire protocol.
// ============================================================================

import {
  INTENT_ERRORS, rateBucketFor, requiresKey, collectsFirst, guardStampKeys,
} from './intents.js';

/* ── THE OPENING STATEMENT ──────────────────────────────────────────────────
   THE GATE IS FIRST AND THE READ IS CONDITIONAL ON IT (review D3). `case when`
   short-circuits, so a rate-limited caller pays for a boolean and not for a
   full hr_state_of (player_state + fifteen skills + the whole inventory + every
   farm plot + up to 1,000 progress rows). One round trip, not two: at
   max_connections = 60 the cost of a round trip is not latency, it is the
   §2a-ii total outage.

   ⚠ THE BUCKET IS A BIND PARAMETER READ OUT OF `INTENT_REGISTRY`, never a
     literal (review C4). An unknown bucket fails closed inside hr_rate_gate, so
     a wrong registry row is a 429 rather than a brand-new unlimited namespace.

   NOTE it does NOT read `hr_offline_cap_ms`. set-activity.js needs the cap
   because it simulates a window; a spend does not simulate anything, and a
   statement whose result nobody reads is a round trip nobody needs. */
const READ_SQL = `
  with g as (select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed)
  select g.allowed                                                         as allowed,
         case when g.allowed then public.hr_state_of($1::uuid, $2::int) end as state,
         now()                                                             as now
    from g`;

/* THE REFUSAL ENVELOPE (review C2). A refusal that reached the database says
   what the server's state IS, so the client's "put the local view back to what
   the envelope says" is executable on the failure path and not only on the
   happy one. A FRESH read rather than the one taken at the top of the call,
   because the refusal that most needs it — `version_conflict` — means by
   definition that the state moved after that read. */
const REFRESH_SQL = 'select public.hr_state_of($1::uuid, $2::int) as state';

/* ⚠ `$5::text::jsonb`, NEVER `$5::jsonb`, BECAUSE THE DELTA IS PRE-STRINGIFIED.
   THE CONSTRAINT: a parameter that POSTGRES DESCRIBES AS json/jsonb makes
   postgres.js re-serialize the bound value with JSON.stringify. The engine
   connects with `prepare: false` (required in transaction mode), so every
   statement takes the describe-first path — Parse with an unspecified type,
   then Describe — the driver learns the resolved type 3802 from
   ParameterDescription, and Bind looks it up in `options.serializers`, where
   3802 maps to JSON.stringify. The already-stringified delta is therefore
   encoded a SECOND time and arrives as a jsonb STRING SCALAR, which hr_apply's
   first guard (`jsonb_typeof(p_delta) <> 'object'`) refuses as `bad_delta`.
   That is why no apply through this Edge Function had ever succeeded in
   production before 2026-08-15 (the P0, commit 6382a45).
   Casting to `text` first makes Postgres describe the parameter as text (25),
   whose serializer is `x => '' + x` — a passthrough — and the SQL cast parses
   it. Correct under BOTH driver typings (an unspecified type 0 is also a
   passthrough), which is why this is preferred over binding the raw object.
   THIS IS THE THIRD APPLY SITE IN THE PAYLOAD, and it is exactly the site
   tests/delta-transport.mjs T6 was written for: T1/T2 grade index.ts and
   set-activity.js by name and could never see this one. T6 walks the deployed
   directory and requires `::text::jsonb` on the last argument of every hr_apply
   call site it finds.
   ⚠ T6 IS A TEXT SCANNER AND IT DOES NOT SKIP COMMENTS — deliberately, because
     a scanner that parses JS is a scanner that can be wrong about JS. So do not
     write the fully-qualified call in prose in this directory; it is graded as
     a call site and reads as an unbound one. That is the guard being broad on
     purpose, not a bug in it. */
const APPLY_SQL = `
  select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::text::jsonb) as res`;

/**
 * Spend the rate budget and read the state envelope.
 *
 * @returns { refusal: {status, body} } | { env, nowMs }
 */
export async function gateAndRead(o) {
  const { exec, user, slot, verb } = o;
  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(verb)]);
  if (!read || read.allowed !== true) {
    return { refusal: { status: 429, body: { ok: false, verb, error: INTENT_ERRORS.RATE_LIMITED } } };
  }
  const env = read.state;
  if (!env || env.ok !== true) {
    return {
      refusal: {
        status: 409,
        body: { ok: false, verb, error: (env && env.error) || INTENT_ERRORS.NO_CHARACTER },
      },
    };
  }
  return { env, nowMs: new Date(read.now).getTime() };
}

/** The single apply. Returns hr_apply's own answer verbatim, or null. */
export async function applyDelta(o) {
  const { exec, user, slot, version, intentId, delta } = o;
  const [row] = await exec(APPLY_SQL, [user, slot, version, intentId, JSON.stringify(delta)]);
  return (row && row.res) || null;
}

/**
 * Build a refusal body carrying the CURRENT `hr_state_of` envelope.
 *
 * ⚠ A FAILED REFRESH MUST NOT TURN A 409 INTO A 500. The refusal is the answer;
 *   the envelope is an aid to reconciling. So the read is best-effort and the
 *   body degrades to "no envelope" — the same shape the documented stateless
 *   refusals have, which the client already handles.
 */
export async function refusalBody(o) {
  const { exec, user, slot, verb, refusal, fallback } = o;
  let env = null;
  try {
    const [row] = await exec(REFRESH_SQL, [user, slot]);
    const fresh = row && row.state;
    if (fresh && fresh.ok === true) env = fresh;
  } catch { /* best effort — see above */ }
  if (!env && fallback && fallback.ok === true) env = fallback;
  if (!env) return { ok: false, verb, ...refusal };
  /* The envelope is spread FIRST so `ok:false` and the refusal fields win. An
     envelope that overwrote `ok` would produce a refusal claiming success,
     which is worse than no envelope at all (A18). */
  return { ...env, ok: false, verb, ...refusal };
}

/**
 * THE SHARED BODY OF A VALUE INTENT.
 *
 * A verb hands in a PLAN — a delta it computed from server catalogues, the
 * journal name it will be recorded under, and a receipt describing what it
 * proposed — and this runs the identical sequence for all of them:
 *
 *   (0) shape, already done by the verb
 *   (1) rate gate + state read
 *   (2) rule 3's precondition, on the real delta
 *   (3) one apply, at the version this call read, under the client's key
 *   (4) the server's envelope, verbatim, plus a receipt
 *
 * @param o.plan  { delta, receipt } — `delta.journal.intent` must already name
 *                the verb AND its target AND anything that changes what the
 *                delta does (see intentNameOf).
 * @returns { status, body }
 */
export async function runValueIntent(o) {
  const { exec, user, slot, verb, intentId, plan } = o;

  /* (1) GATE + READ. */
  const read = await gateAndRead({ exec, user, slot, verb });
  if (read.refusal) return read.refusal;
  const env = read.env;

  /* (2) ⚠ RULE 3, BOTH HALVES.
         (a) The registry says whether this verb collects before it acts. It is
             READ here — a registry column nothing reads is decoration (C4) —
             and an unimplemented collect FAILS CLOSED. Refusing costs the
             player one tap; proceeding costs them a night.
         (b) The delta itself must not carry a key that closes the accrual
             window. This is the check that survives a well-meaning feature:
             adding `equip` to a purchase so the sword is also wielded would
             otherwise confiscate every buyer's unpaid window, silently. */
  if (collectsFirst(verb)) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb,
        refusal: { error: INTENT_ERRORS.COLLECT_REQUIRED, stage: 'collect' },
        fallback: env,
      }),
    };
  }
  const stamp = guardStampKeys(verb, plan.delta);
  if (stamp) {
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb,
        refusal: { error: stamp.error, stage: 'plan', detail: { keys: stamp.keys } },
        fallback: env,
      }),
    };
  }

  /* (3) THE APPLY. `env.version` is the version THIS call read; hr_apply
         refuses a stale one, which is the whole of our concurrency control
         (contract rule 7). The key is the CLIENT's — a purchase is a tap, and
         the client is the only party that knows which retry is which. */
  const res = await applyDelta({
    exec, user, slot, version: env.version, intentId, delta: plan.delta,
  });
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED. hr_apply's protected block rolls back in full, so
       there is no partial effect and the contract's "a rejected intent is
       retried with a NEW key" holds without exception here. The code is
       hr_apply's own, returned verbatim so it survives to the client and to
       hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb,
        refusal: { error: (res && res.error) || 'apply_failed', stage: 'apply', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (4) THE ENVELOPE. `hr_state_of` verbatim — the client renders it and
         computes nothing. Gold, inventory and version all come out of `res`,
         which is the state AFTER the write, never out of the request.

         ⚠ THE RECEIPT IS NULL ON A REPLAY, and that is the OPPOSITE of
           set_activity's `collected`. The difference is which apply the receipt
           describes. `collected` is a receipt for a SEPARATE apply that
           genuinely landed during this invocation, so a replayed SWITCH must
           still report it (measured: 3,809 gold reported as null, C5). Here the
           receipt describes THE REPLAYED APPLY ITSELF — this invocation moved
           nothing — so reporting it would be index.ts's `away`-block problem:
           a receipt for work that did not happen. The envelope still carries
           the true balance either way. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb,
      receipt: res.replayed === true ? null : plan.receipt,
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/**
 * The two shape checks every value intent starts with, in one place so nine
 * verbs cannot each get them slightly different.
 *
 * Refused BEFORE any database work, so a malformed client cannot spend a real
 * player's rate budget by looping on garbage — the property tests/gold-intents
 * measures by counting statements, not by reading the code.
 *
 * @returns { status, body } | null
 */
export function shapeRefusal(verb, intentId, qty) {
  if (requiresKey(verb) && !intentId) {
    return { status: 400, body: { ok: false, verb, error: INTENT_ERRORS.MISSING_INTENT_ID } };
  }
  if (!Number.isSafeInteger(qty) || qty < 1) {
    /* `qty` arrives null from request.js for absent / non-numeric / fractional
       / out-of-range. The bound itself lives there (MAX_QTY) so the parser is
       the only place that knows it; this only re-states "it must be a positive
       integer", which is the property every caller of this function relies on
       when it multiplies by it. */
    return { status: 400, body: { ok: false, verb, error: INTENT_ERRORS.BAD_QTY } };
  }
  return null;
}
