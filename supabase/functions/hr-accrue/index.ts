// ============================================================================
// supabase/functions/hr-accrue/index.ts — the accrual Edge Function's I/O shell.
//
// This file does five things and nothing else: PROVE who is asking, spend their
// rate budget, read server state, hand it to the pure engine in accrual.js, and
// hand the engine's proposed delta to hr_apply. It contains no game rule and no
// arithmetic on a game value. If a number is computed here, it is in the wrong
// file.
//
// ── THE FOUR CONSTRAINTS THIS FILE EXISTS TO HONOUR ─────────────────────────
//
// 1. EDGE FUNCTIONS NEVER WRITE TABLES (design §2, "the commit point").
//    The connection is made as `hr_engine_login`, which is `NOINHERIT` and
//    granted exactly one thing: `SET ROLE hr_engine`. `hr_engine` holds ZERO
//    table privileges across every schema — verified — and EXECUTE on a short
//    list of functions. So the entire capability of this file, and of anyone
//    who compromises it, is "propose a delta to a function that re-validates
//    every invariant". There is no INSERT here to review because there is no
//    INSERT privilege to use.
//
// 2. THE TRANSACTION POOLER, PORT 6543. NEVER 5432 (design §2a-ii, HARD RULE).
//    Measured on this project: max_connections = 60 with 23 already in use at
//    six players. An Edge Function that opens a session per invocation
//    exhausts that long before CPU becomes interesting, and the failure is
//    total — nobody connects, including the dashboard. Transaction mode is
//    compatible with everything below because every unit of work is one short
//    transaction, and `pg_advisory_xact_lock` / `select … for update` are
//    transaction-scoped and therefore released at commit. It does mean session
//    state does not survive, which is why every transaction re-issues
//    `set local role hr_engine`.
//
// 3. THE CLIENT AUTHORS NOTHING. The request body is read by exactly one
//    function — `parseIntent` in ./request.js — which returns a freshly built,
//    null-prototype object holding one integer: `slot`, 0..5 inclusive,
//    selecting a row the caller already owns. Everything else (the clock, the
//    cap, the equipment, the levels, the activity, the watermark, the seed) is
//    read from a server table inside the same transaction. The engine is called
//    with a literal object, field by field; nothing derived from the body is
//    spread into anything.
//
// 4. IDENTITY IS PROVEN HERE, NOT ASSUMED FROM A DEPLOY FLAG (review D2).
//    Revision 1 DECODED the JWT and never checked its signature, resting the
//    whole property on `verify_jwt` being on at the gateway — with no
//    supabase/config.toml in the repo to hold that setting and no test to
//    assert it. One `--no-verify-jwt` and an unauthenticated caller could read
//    any player's full state envelope and force-collect their absence. Now
//    ./jwt.js verifies against the project's published JWKS (public key only —
//    this function still holds no signing secret, per design §2a-i), and
//    config.toml pins `verify_jwt = true` as a second, independent lock.
//
// 5. THE ONLY CALLER IS A BROWSER, SO CORS IS PART OF THE CONTRACT. Revision 2
//    had no `Access-Control-*` header and no `OPTIONS` branch, which made the
//    deployed function unreachable from hearthrise.net — while curl, Node and
//    every guard in the repo reported it healthy, because none of them issues a
//    preflight. `./cors.js` owns the whole of it: `Deno.serve(withCors(handle))`
//    is the ONLY serve registration in this payload, so the preflight is
//    answered before the JWT work below (a preflight carries no Authorization
//    header by design and would 401 if it reached it) and every response —
//    including the 401, the 429, the 503 and the catch-all 500 — carries the
//    headers without any return site here having to remember them. The `json()`
//    helper below is deliberately unchanged.
//
// ── WHAT THIS FILE COSTS, PER CALL ──────────────────────────────────────────
//   • one JWKS fetch per COLD start (cached in module scope thereafter);
//   • ONE pooled transaction for the rate gate + the state read;
//   • one pooled transaction for the two seeds;
//   • one pooled transaction for the apply — SKIPPED entirely when there is
//     nothing to pay, and the rate gate has already been spent by then, which
//     is the D3 fix: a loop on the non-accruing path now consumes budget.
// ============================================================================

import postgres from 'npm:postgres@3.4.5';
import { computeAccrual, levelsOf } from './accrual.js';
import { verifyJwt, bearerOf, gotrueIntrospector } from './jwt.js';
import { parseIntent } from './request.js';
import { intentIdFor, isKnownVerb, INTENT_ERRORS, rateBucketFor } from './intents.js';
import { runSetActivity } from './set-activity.js';
import { withCors } from './cors.js';
import { PAYLOAD_SHA256 } from './payload-hash.js';
import { GATHER_NODES } from './catalogue.js';
import { ITEMS } from '../../../src/data/items.js';
import { MONSTERS } from '../../../src/data/monsters.js';

/* ── The connection. MODULE SCOPE, so a warm invocation reuses it. ──────────
   Creating the pool per request would defeat the whole point of using the
   pooler: the pool would be the thing exhausting connections. `max: 2` because
   an invocation runs at most two transactions and never concurrently.
   `prepare: false` is REQUIRED in transaction mode — a named prepared
   statement outlives the transaction that created it, but the backend it was
   prepared on does not, so the next statement fails with "prepared statement
   does not exist" under load and only under load. */
const DB_URL = Deno.env.get('HR_ENGINE_DB_URL') ?? '';

/* Constraint 2, enforced at MODULE LOAD rather than per request. A copy-pasted
   session-mode connection string is the single most likely way the pooler rule
   gets broken, and the damage it does is invisible until the project is busy
   enough to matter — at which point the failure is total and includes the
   dashboard. Checking it here means a misconfigured engine never constructs a
   pool at all and every request answers `engine_unconfigured`, which is a
   diagnosable outage instead of a slow-motion one. */
const POOLER_OK = /:6543(\/|\?|$)/.test(DB_URL);

const sql = (DB_URL && POOLER_OK)
  ? postgres(DB_URL, {
      max: 2,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    })
  : null;

function assertPooler(): void {
  if (!DB_URL) throw new Error('config:HR_ENGINE_DB_URL missing');
  if (!POOLER_OK) {
    throw new Error('config:HR_ENGINE_DB_URL must use the transaction pooler on port 6543, never 5432');
  }
}

/* ── Identity configuration ─────────────────────────────────────────────────
   SUPABASE_URL and SUPABASE_ANON_KEY are injected into every Edge Function by
   the platform. The anon key is used for exactly one thing — the `apikey`
   header GoTrue requires on the HS* introspection fallback — and it grants
   nothing this function does not already have. NO SIGNING SECRET IS READ HERE,
   and none must ever be: a function that can verify an HS256 token can also
   mint `role: service_role` (design §2a-i, permanently rejected). */
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const JWKS_URL = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` : '';
const ISSUER = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : '';
const introspect = SUPABASE_URL ? gotrueIntrospector(SUPABASE_URL, ANON_KEY) : undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* ── Idempotency ────────────────────────────────────────────────────────────
   THE KEY IS DERIVED, NOT ACCEPTED, for the `accrue` verb. Every intent the
   PLAYER initiates takes a client-generated uuid, which is right there: the
   client knows which retry is which. An accrual is different — it is the same
   operation no matter who asks or how often, and it is defined entirely by
   (user, slot, the watermark it starts from). Deriving the key from those makes
   a replay idempotent even across two concurrent invocations that have never
   heard of each other, and removes a client-supplied value from the one call
   whose whole job is to pay out.

   `intentIdFor` MOVED to ./intents.js in b345 and is imported above. It is
   shared now, not copied, because the COLLECT that every collect-before-switch
   intent runs derives the same key — so an `accrue` and a `set_activity` racing
   on one watermark AND one version land on one key and the window is paid
   EXACTLY once, across two verbs that have never heard of each other. The
   salting argument, the `version` term that keeps a REFUSED accrual from
   re-deriving a poisoned key forever, and the `intent_mismatch` second lock are
   all documented at its definition. */

/* ── The clamps that a smaller span can escape (review S8) ──────────────────
   Every clamp in hr_apply is a BLAST RADIUS, set far above honest play, and any
   rejection is an incident. But a rejection ROLLS BACK — including the
   watermark — so the next call recomputes the identical span, trips the
   identical clamp, and the character's accrual is bricked forever with no
   self-service recovery. Measured headroom today is 2,830,315 XP against the
   5,000,000 per-skill clamp at 24h/maxed/best-in-slot (56.6%), and it tightens
   with every faster weapon and every higher-XP monster.

   So a clamp rejection is answered by paying LESS: halve the span and try
   again, up to MAX_DEGRADE times, and if even that trips, advance the watermark
   alone. The player loses part of one absence — exactly as a cap overflow loses
   it, because the engine always simulates the window ENDING at now() — instead
   of losing every absence from here to the end of the account. The incident is
   already recorded by hr_apply's own hr_record_rejection on each rejected
   attempt, which is what makes the degradation loud rather than silent. */

/* `daily_budget` (C5/X3) is here for the SAME REASON as `bank_full`, and it is
   the one entry whose absence would have been load-bearing: the day ceiling is
   checked in hr_apply AFTER the per-call clamps, so halving the span halves the
   proposed inflow and an honest accrual that lands on the ceiling costs part of
   one absence instead of returning 409 forever with the watermark frozen.
   apply-engine.sql:1010 already documents it as being on this list — it was
   not, and nothing failed, because nothing calls this function yet. A comment
   in one file asserting a property of another file is not an assertion.
   RESIDUAL, stated: after MAX_DEGRADE the last-resort forfeit advances the
   watermark and pays nothing, which for a day-budget trip discards time that
   the next UTC day would have paid. That is the pre-existing ladder behaviour
   and is left unchanged here; it is a Security/Designer call, not a CORS fix. */
const DEGRADABLE = new Set([
  'gold_clamp', 'gem_clamp', 'item_clamp', 'xp_clamp', 'progress_clamp',
  'too_many_item_kinds', 'too_many_equip_ops', 'too_many_farm_ops',
  'too_many_progress_ops', 'bank_full', 'daily_budget',
]);
const MAX_DEGRADE = 3;

type Row = Record<string, any>;

/* Constraint 5. `withCors` answers the OPTIONS preflight itself and never calls
   this handler for one; for everything else it runs the handler and copies the
   CORS headers onto whatever comes back. There must be exactly ONE
   `Deno.serve(` in this payload and it must be this one — tests/cors-preflight.mjs
   asserts that against the PACKED bytes, so a second registration cannot
   quietly bypass the wrapper. */
Deno.serve(withCors(async (req: Request): Promise<Response> => {
  /* The build fingerprint. No identity, no database, no state — it exists so
     the smoke suite can compare the bytes DEPLOYED against the bytes in the
     repo, which `pack-edge --check` structurally cannot do (it re-derives the
     payload from the same repo it just read). Nothing here is a secret. */
  if (req.method === 'GET') {
    return json({ ok: true, fn: 'hr-accrue', payload_sha256: PAYLOAD_SHA256 });
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let user: string;
  try {
    if (!JWKS_URL) throw new Error('config:SUPABASE_URL missing — cannot verify a token');
    user = await verifyJwt(bearerOf(req.headers.get('Authorization')), {
      jwksUrl: JWKS_URL, issuer: ISSUER, introspect,
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (msg.startsWith('config:')) return json({ ok: false, error: 'engine_unconfigured' }, 503);
    if (msg === 'auth_unavailable') return json({ ok: false, error: 'auth_unavailable' }, 503);
    return json({ ok: false, error: 'not_signed_in' }, 401);
  }

  /* The ENTIRE read of the request body — one call, one reader, in one place
     that a Node test can execute. See ./request.js. Four fields come back and
     every one of them is a name or a selector; none is a value any progression
     number is computed from. */
  const intent = parseIntent(await req.json().catch(() => ({})));
  const slot = intent.slot;

  /* An UNKNOWN verb is refused, never defaulted to `accrue`. An ABSENT verb IS
     `accrue`, because that is what the deployed client posts and a deploy that
     stopped understanding the live client would take away time off every player
     at once. request.js draws exactly that line; this is where it is answered. */
  if (intent.verb === null || !isKnownVerb(intent.verb)) {
    return json({ ok: false, error: INTENT_ERRORS.UNKNOWN_VERB }, 400);
  }

  try {
    assertPooler();
    if (!sql) throw new Error('config:no_connection');

    /* ── THE SEAM EVERY INTENT USES ────────────────────────────────────────
       One statement, its own transaction, `set local role hr_engine` re-issued
       inside it — because transaction mode does not keep a backend between
       transactions, so a session-scoped SET would be silently lost and hr_apply
       would then refuse to honour p_user. That failure surfaces as
       `forbidden_impersonation`, which is a confusing name for a pooler
       misconfiguration.

       This is the ONLY database access an intent module has, and it can only
       run one statement — so no intent can open a long transaction, hold a
       connection, or write a table it was not granted (hr_engine holds zero
       table privileges in every schema). */
    const exec = async (text: string, params: unknown[]): Promise<Record<string, any>[]> =>
      await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        return await tx.unsafe(text, params as any[]);
      }) as unknown as Record<string, any>[];

    /* ── VERB DISPATCH ─────────────────────────────────────────────────────
       Each intent is its own pure ESM module behind `exec`, so the bytes a Node
       test drives are the bytes that deploy. index.ts stays what its header
       says it is: prove who is asking, then hand off. */
    if (intent.verb === 'set_activity') {
      const out = await runSetActivity({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        activity: intent.activity,
      });
      return json(out.body, out.status);
    }

    // ── READ. One transaction, engine role, rate gate FIRST. ───────────────
    // `set local role hr_engine` must be inside the transaction: transaction
    // mode does not keep a backend between transactions, so a session-scoped
    // SET would be silently lost and hr_apply would then refuse to honour
    // p_user. That failure looks like `forbidden_impersonation`, which is a
    // confusing name for a pooler misconfiguration — hence this note.
    //
    // ⚠ THE GATE IS THE FIRST STATEMENT (review D3). hr_apply rate-limits
    //   itself, but the not-accruing path RETURNS BEFORE hr_apply — so before
    //   this fix a loop on POST /hr-accrue cost two pooled transactions, a full
    //   hr_state_of (inventory, fifteen skills, farm, progress), hr_seed and
    //   hr_offline_cap_ms per request and consumed NO budget. At
    //   max_connections = 60 that is the §2a-ii total outage, dashboard
    //   included. The same reasoning apply-engine.sql:420 already states: a
    //   rejected call must still consume budget, otherwise "spam it" is a free
    //   denial of service. The LIMIT is not passed from here — hr_rate_gate
    //   owns it per bucket, because a caller that names its own rate limit does
    //   not have one.
    const read = await sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      /* The bucket is READ OUT OF INTENT_REGISTRY, never written here. A literal
         at this call site is a second registry, and a second registry is how the
         row over there became decoration in the first place. */
      const [gate] = await tx`select public.hr_rate_gate(${user}::uuid, ${slot}::int,
                                                         ${rateBucketFor('accrue')}::text) as allowed`;
      if (!gate?.allowed) return { limited: true } as Row;
      const [row] = await tx`
        select public.hr_state_of(${user}::uuid, ${slot}::int)      as state,
               public.hr_offline_cap_ms(${user}::uuid, ${slot}::int) as cap_ms,
               now()                                                as now`;
      return row as Row;
    });

    if (read?.limited) return json({ ok: false, error: 'rate_limited' }, 429);

    const env = read?.state as Record<string, any> | null;
    if (!env || env.ok !== true) {
      return json({ ok: false, error: (env && env.error) || 'no_character' }, 409);
    }

    const st = env.state;
    const nowMs = new Date(read.now as string).getTime();
    const accruedToMs = st.accrued_to ? new Date(st.accrued_to).getTime() : nowMs;

    // Two seeds, one round trip. The PRNG seed is derived from a label that
    // names the watermark, so the SAME absence always replays to the SAME rolls
    // (a dispute is resolvable from the ledger) while remaining unpredictable,
    // because hr_seed mixes a 256-bit secret held in a table with RLS on, no
    // policy and no grant to any client role. The client can see `accrued_to` —
    // hr_load returns it so the UI can render a countdown — and that is exactly
    // why the seed may not be a function of visible values alone (review S20).
    //
    // The idempotency salt uses a DIFFERENT LABEL on purpose. The PRNG seed is
    // masked to 32 bits and its consequences (which drops landed) are visible
    // to the player; the intent salt must not be inferable from them.
    //
    // THE PERK STATE RIDES THIS TRANSACTION, not a third one. `hr_perks_of`
    // returns bookkeeping only — which rooms at which rung, how many plot
    // buildings, the property tier — and src/core/perks.js turns that into
    // magnitudes, so the room table is never copied into SQL.
    //
    // ⚠ AND IT DEGRADES ON EXACTLY ONE ERROR CODE. A missing COLUMN reads as
    //   null (that is how `tool_carry` self-configures), but a missing
    //   FUNCTION is a hard 42883 that aborts the whole transaction — so a
    //   deploy that landed before the migration would 500 every accrual
    //   instead of quietly paying what it paid yesterday. Catching 42883 and
    //   ONLY 42883, then re-running the seed read without the perk column,
    //   restores the "safe in either order" property the tool-carry column has
    //   by construction. Any other error still propagates: a swallowed error
    //   is how a guard reports SKIPPED and gets read as a pass.
    const seedSql = (withPerks: boolean) => sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      const [r] = withPerks
        ? await tx`
        select (public.hr_seed(${user}::uuid, ${slot}::int,
                               ${'accrue:' + String(st.accrued_to)}) & 4294967295)::bigint as seed,
               public.hr_seed(${user}::uuid, ${slot}::int,
                              ${'intent:accrue:' + String(st.accrued_to)})::text as salt,
               public.hr_perks_of(${user}::uuid, ${slot}::int) as perks`
        : await tx`
        select (public.hr_seed(${user}::uuid, ${slot}::int,
                               ${'accrue:' + String(st.accrued_to)}) & 4294967295)::bigint as seed,
               public.hr_seed(${user}::uuid, ${slot}::int,
                              ${'intent:accrue:' + String(st.accrued_to)})::text as salt`;
      return r as Row;
    });
    let seedRow: Row;
    let perkChannel = 'live';
    try {
      seedRow = await seedSql(true) as Row;
    } catch (e) {
      if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;
      // This database predates the perk channel. Pay what yesterday paid.
      perkChannel = 'absent';
      seedRow = await seedSql(false) as Row;
    }
    const salt = String(seedRow?.salt ?? '');
    /* `ok !== true` covers both "no character" and a future refusing shape.
       null → EMPTY_PERKS in the engine → 0 for every key → today's behaviour. */
    const perkEnv = seedRow?.perks as Record<string, unknown> | null;
    const perks = (perkEnv && perkEnv.ok === true) ? perkEnv : null;

    // ── COMPUTE. Pure, in-process, no I/O. Field by field. ─────────────────
    const skills: Record<string, number> = {};
    for (const k of Object.keys(env.skills || {})) skills[k] = Number(env.skills[k].xp) || 0;

    const capMs = Number(read.cap_ms) || 0;
    const equipment = env.equipment || {};

    /* The engine is called with a LITERAL, field by field, from named server
       values. `slot` is the only field on this object whose value came from the
       request, and it selects a row the caller already owns. */
    const runAccrual = (spanCapMs: number) => computeAccrual({
      userId: user,
      slot,
      nowMs,
      accruedToMs,
      /* NULL, not a fallback to accruedToMs (b345). `active_since` is the second
         watermark and substituting the first one for it removes the clamp at
         exactly the moment it is needed — a `start_activity` that forgot to send
         `accrued_to` is the case it exists for. computeAccrual now refuses a
         payable activity with no `active_since` by name (`no_active_since`). */
      activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : null,
      activeKind: st.active_kind,
      activeId: st.active_id,
      capMs: spanCapMs,
      seed: Number(seedRow?.seed) || 0,
      hp: Number(st.hp) || 0,
      maxHp: Number(st.max_hp) || 0,
      gold: Number(st.gold) || 0,
      skills,
      equipment,
      /* AUTO-EAT. All four values are columns on the row hr_apply locks, read
         inside the same transaction as everything else above. `inventory` is
         the first input the engine SPENDS rather than only reads — auto-eat
         consumes food — which is why the returned delta's `items` map is
         signed. The three settings are what let the server heal exactly as the
         client does; without them it never healed at all and an unattended
         night ended at the first death (measured: -63% to -99% of the night).
         `auto_eat_enabled` is also the purchased-trait receipt, so nothing here
         defaults to true. */
      inventory: env.inventory || {},
      autoEatEnabled: st.auto_eat_enabled === true,
      autoEatFood: st.auto_eat_food ?? null,
      autoEatPct: Number(st.auto_eat_pct),
      /* THE GATHER CARRY. `?? null` and NOT `?? {}`: null means the column does
         not exist on this database, and the engine reads that as "do not write
         a tool_carry key", because hr_apply refuses an unknown delta key and
         that refusal costs a whole night. The presence of the column IS the
         switch — there is no flag to forget to flip.
         Mirrors set-activity.js field for field (A14). */
      toolCarry: st.tool_carry ?? null,
      /* THE PERMANENT PERK STACK. Server-owned unlock rows only — the room
         rung, the plot buildings, the property tier. `null` means the channel
         is absent or the character has bought nothing, and the engine reads
         that as 0 for every key, which is the `zeroBonus` behaviour that
         shipped before b349. Nothing here comes from the request body. */
      perks,
      items: ITEMS,
      monsters: MONSTERS,
      nodes: GATHER_NODES,
    });

    let out = runAccrual(capMs);

    if (!out.accrued) {
      // Nothing to pay. NOTHING IS WRITTEN — in particular the watermark is not
      // advanced, so a sub-threshold call cannot confiscate the time it
      // declined to pay for. The rate budget HAS been spent (see the gate
      // above), so this path is not free to loop.
      return json({ ok: true, accrued: false, reason: out.reason, version: env.version, now: env.now });
    }

    // ── APPLY. The single writer. ──────────────────────────────────────────
    const apply = async (delta: unknown, attempt: number) => {
      /* THE DERIVED KEY. Named arguments, and `version` is one of them — the
         anti-deadlock half documented above `intentIdFor` in ./intents.js. It
         MUST be the same version this statement names below, and it must match
         set-activity.js's collect field for field, or the two verbs stop sharing
         a key and a window that should replay conflicts instead. */
      const intentId = await intentIdFor({
        user, slot, watermark: String(st.accrued_to), version: env.version, salt, attempt,
      });
      const applied = await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        const [r] = await tx`
          select public.hr_apply(${user}::uuid, ${slot}::int, ${env.version}::bigint,
                                 ${intentId}::uuid, ${JSON.stringify(delta)}::jsonb) as res`;
        return r as Row;
      });
      return applied?.res as Record<string, any>;
    };

    let res = await apply(out.delta, 0);
    let degraded: Record<string, unknown> | null = null;

    /* THE DEGRADE LADDER (S8). Only ever entered on a clamp — never on a
       version conflict, a rate limit, an unknown id or an insufficiency, all of
       which mean something other than "this span was too big". */
    for (let attempt = 1;
         attempt <= MAX_DEGRADE && res && res.ok !== true && DEGRADABLE.has(String(res.error));
         attempt++) {
      const smaller = Math.floor(Number(out.grantMs) / 2);
      degraded = { from: String(res.error), attempt, spanMs: smaller };
      if (!(smaller > 0)) break;
      const next = runAccrual(smaller);
      if (!next.accrued) break;
      out = next;
      res = await apply(out.delta, attempt);
    }

    if (res && res.ok !== true && degraded && DEGRADABLE.has(String(res.error))) {
      /* Last resort: pay nothing, but MOVE THE WATERMARK, so the next absence
         is a fresh span instead of the same poisoned one forever. This is a
         real loss for the player and it is the smaller of the two losses on
         offer; hr_apply has recorded an incident for every attempt above. */
      const forfeit = {
        accrued_to: 'now',
        journal: { kind: 'accrue', intent: 'accrue_forfeit', meta: { reason: String(res.error) } },
      };
      const rescue = await apply(forfeit, MAX_DEGRADE + 1);
      if (rescue && rescue.ok === true) {
        return json({
          ok: true, accrued: false, reason: 'clamped', degraded,
          version: rescue.version ?? env.version, now: rescue.now ?? env.now,
        });
      }
    }

    if (!res || res.ok !== true) {
      // A rejection here is EITHER an incident OR a balance change that outgrew
      // its blast radius — see the block above c_max_xp_delta in apply-engine.sql
      // and docs/design/server-authority.md §2 "What the per-call clamps buy".
      // (This comment used to say "an INCIDENT, not a tuning problem"; that was
      // deleted on 2026-08-11 with the 5M -> 12M XP clamp ruling, because honest
      // play at best-in-slot over a 24h cap can now approach a clamp and the
      // degrade ladder above makes a trip recoverable rather than fatal.)
      // Returned verbatim so the machine code survives to the client and to
      // hr_rejections.
      return json({ ok: false, error: (res && res.error) || 'apply_failed', detail: res ?? null }, 409);
    }

    /* ── REPLAY HONESTY (review S7) ────────────────────────────────────────
       hr_apply answers a replayed key with `ok:true` plus a FRESH state
       envelope, which is right — the effect was applied exactly once and the
       caller should get current state. What it must not produce is an `away`
       block: that block is a receipt for a delta, and on a replay THIS
       invocation's delta was not applied. Returning a freshly recomputed
       welcome-back summary for work that did not happen is precisely the thing
       "no renderer can invent a bonus that was not applied" forbids. So the
       receipt is dropped and the reason is stated. */
    if (res.replayed === true) {
      return json({ ...res, ok: true, accrued: false, reason: 'replayed' });
    }

    return json({
      ok: true,
      accrued: true,
      // The authoritative post-apply envelope, straight from hr_state_of —
      // the client renders this and computes nothing.
      ...res,
      ...(degraded ? { degraded } : {}),
      levels: levelsOf(Object.fromEntries(
        Object.entries(res.skills || {}).map(([k, v]) => [k, (v as any).xp]),
      )),
      // The welcome-back payload, stated by the simulation so no renderer can
      // invent a bonus that was not applied (the away ruling's "player-facing
      // honesty" clause). featuredDropMult included — b326.
      away: {
        grantMs: out.grantMs,
        capped: out.capped,
        tickMs: out.tickMs,
        /* Which permanent perks this night was PRICED AT — 'live' when
           hr_perks_of answered, 'absent' when this database predates it. It is
           reported for the same reason `capped` and `blessed` are: the away
           ruling's honesty clause says the card may not imply a bonus that was
           not applied, and a night silently priced at zero perks is exactly
           that. It is also the only way to tell "deployed and correctly paying
           nothing because nothing is unlocked" from "deployed against a
           database with no perk channel" from the outside. */
        perkChannel,
        kills: out.summary.kills,
        crits: out.summary.crits,
        died: out.summary.died,
        // How much food the night ate. The welcome-back card has to be able to
        // say it: a player who returns to an empty Cooked Shark stack and no
        // explanation files a bug, and the honest answer is "it kept you alive
        // for the whole twelve hours".
        foodEaten: out.foodEaten,
        blessed: out.summary.blessed,
        buffsPaused: out.summary.buffsPaused,
        featuredMs: out.summary.featuredMs,
        featuredDropMult: out.summary.featuredDropMult,
        gold: out.summary.gold,
        xp: out.summary.xp,
        items: out.summary.items,
        levelUps: out.levelUps,
        events: out.events,
      },
    });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    // Configuration failures are distinguishable from runtime ones, because a
    // misconfigured engine that answers "server_error" is an outage nobody can
    // diagnose. Never echo the connection string.
    if (msg.startsWith('config:')) return json({ ok: false, error: 'engine_unconfigured' }, 503);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}));
