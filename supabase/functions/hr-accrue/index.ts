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
import { computeAccrual, levelsOf, degradeStep, accrueWorkers, accrueRested, CALLER_AUTHORITY } from './accrual.js';
/* THE ENVELOPE -> ENGINE INPUT MAP, shared with the world tick (2026-09-22).
   ONE field list for a two-level projection; see ./envelope.js. */
import { engineInputsFromEnvelope } from './envelope.js';
import { withAwayReceipt, receiptRescue } from './away-receipt.js';
/* THE COMPANION-XP ARM SWITCH — ARMED (b550). Threaded into computeAccrual's
   input as `companionXpBacked` (A14-mirrored in set-activity.js). TRUE → the
   engine emits the companion_xp op and IS the only writer: the client half
   returns on blobRetired(). While this was false NOTHING wrote companion XP and
   every pet in the game sat at level 1 — the comment here said "the client keeps
   awarding" long after that stopped being true, which is why it shipped. */
import { COMPANION_XP_SERVER_BACKED } from '../../../src/core/companion-xp.js';
import { verifyJwt, bearerOf, gotrueIntrospector } from './jwt.js';
import { parseIntent } from './request.js';
import { intentIdFor, isKnownVerb, INTENT_ERRORS, rateBucketFor } from './intents.js';
import { partyIntentFence } from './party-fence.js';
import { runSetActivity } from './set-activity.js';
import { runShopBuy } from './shop-buy.js';
import { runVendorSell } from './vendor-sell.js';
import { runClaimReward } from './claim-reward.js';
import { runUnlockBuy } from './unlock-buy.js';
import { runDungeonSettle } from './dungeon-settle.js';
import { runQuartermasterBuy } from './quartermaster-buy.js';
import { runTrophyClaim } from './trophy-claim.js';
import { runMarketList, runMarketCancel, runMarketBuy } from './market.js';
import { runEquip } from './equip.js';
import { runEnchant } from './enchant.js';
import { runEat } from './eat.js';
import { withCors } from './cors.js';
/* THE WORLD TICK'S OWN ENTRY (WORLD_TICK_DESIGN.md §15c, milestone 1b). It is
   the ONE request path that reaches the engine with no player behind it, so it
   is its own module with its own adversarial review and its own test
   (tests/edge-tick-gate.mjs). Nothing else in this payload may import it. */
import { tickGate, tickBodyAuthOk, runTick, readTickBytes, parseTickBytes } from './tick.js';
import { PAYLOAD_SHA256 } from './payload-hash.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from './catalogue.js';
import { ITEMS } from '../../../src/data/items.js';
import { MONSTERS } from '../../../src/data/monsters.js';
/* BESTIARY CHARMS, PHASE 1 — DISPLAY ONLY. `killsByClass` is the ONLY thing
   imported: it folds hr_bestiary_of's per-monster counters into per-CLASS totals
   through `classOfMonster`, so the client is handed eleven numbers instead of a
   roster-sized map and the class taxonomy is resolved in the one place that
   reconciles its spellings. The rank ladder and the two multiplier functions are
   NOT imported here — nothing on the server prices a charm in this build, and an
   unused import would be the first step toward one being read by accident. */
import { killsByClass } from '../../../src/core/charms.js';

/* ── The connection. MODULE SCOPE, so a warm invocation reuses it. ──────────
   Creating the pool per request would defeat the whole point of using the
   pooler: the pool would be the thing exhausting connections. `max: 2` because
   an invocation runs at most two transactions and never concurrently.
   `prepare: false` is REQUIRED in transaction mode — a named prepared
   statement outlives the transaction that created it, but the backend it was
   prepared on does not, so the next statement fails with "prepared statement
   does not exist" under load and only under load. */
const DB_URL = Deno.env.get('HR_ENGINE_DB_URL') ?? '';

/* THE TICK BEARER, READ ONCE AT MODULE LOAD. `tick.js` fails closed on an
   unset or short value — it is never a reason to skip the check — and the
   value itself is never logged, returned or raised. It is NOT the gateway
   key: `verify_jwt = true` stays on and Supabase checks `Authorization`
   before any of this runs. Conflating the two is the whole exploit. */
const TICK_SECRET = Deno.env.get('HR_TICK_SHARED_SECRET') ?? '';

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

  /* ── THE WORLD TICK BRANCH, AND IT IS BEFORE `verifyJwt` ON PURPOSE ───────
     A tick request is not about one player and carries no player token, so the
     JWT verification below — which DERIVES `user` from the token — has nothing
     to verify and nothing to derive. §15c specifies the branch here, and
     everything that makes it narrower than the gate it steps around lives in
     ./tick.js: the discriminator is the PRESENCE of `X-HR-Tick-Auth` (never
     the body), the header carries a token DERIVED PER FIRE rather than a
     long-lived bearer (Security T-5.3 — `v1 t=<bucket> b=<body sha256>
     m=<hmac>`), its shape and its ±90 s window are checked before a byte of
     body is buffered, the mac is verified constant time against
     `HR_TICK_SHARED_SECRET` over the bytes that actually arrived, an unset or
     short secret refuses every tick request, and EVERY refusal answers the
     SAME `401 not_signed_in` the player path answers so this branch is not an
     oracle — not for "does op:tick exist here", and not for which check bit.

     ⚠ A REQUEST WITHOUT THAT HEADER IS NOT A TICK REQUEST AND FALLS THROUGH
       UNCHANGED, including one whose body says `op: 'tick'`: `parseIntent`
       has no reader for `op`, so such a body is that caller's own accrual and
       reaches nothing here. A player's JWT can therefore never arrive at the
       tick, which is the property tests/edge-tick-gate.mjs T-P1 executes. */
  const tick = tickGate(req.headers, TICK_SECRET);
  if (tick) {
    if (!tick.ok) return json(tick.body, tick.status);
    try {
      /* ── STAGE TWO: THE BODY BINDING, BEFORE ANYTHING ELSE AT ALL ────────
         `tickGate` proved the token's SHAPE and its WINDOW. It could not prove
         the mac, because the mac covers the body hash and the body had not
         been read. So: read the bytes (bounded by Content-Length AND by
         counting what actually arrives, so a chunked sender that omits the
         header is metered too), then verify sha256(bytes) === `b` and that `m`
         verifies over `t.b` in constant time.

         ⚠ ORDER MATTERS AND THIS IS THE ORDER. No parse, no pooler, no
           connection, no `set local role` until `tickBodyAuthOk` is true. A
           body that could not be read is `false` here rather than a 400:
           answering an unreadable body differently from an unauthenticated one
           would hand an unauthenticated caller an oracle the static bearer
           never gave. Every pre-auth refusal on this branch is the same
           `401 not_signed_in` the player path returns. */
      const bytes = await readTickBytes(req);
      if (!tickBodyAuthOk(tick.token, bytes, TICK_SECRET)) {
        return json({ ok: false, error: 'not_signed_in' }, 401);
      }
      /* ONLY NOW is attacker-controlled JSON parsed — and by this point it is
         not attacker-controlled, because the bytes are bound to a mac only the
         driver could have produced. `bad_request` is safe to distinguish here:
         reaching it means holding the secret. */
      const body = parseTickBytes(bytes);
      if (body === null) return json({ ok: false, error: 'bad_request' }, 400);
      assertPooler();
      if (!sql) throw new Error('config:no_connection');
      const execTick = async (text: string, params: unknown[]): Promise<Record<string, any>[]> =>
        await sql.begin(async (tx) => {
          await tx`set local role hr_engine`;
          return await tx.unsafe(text, params as any[]);
        }) as unknown as Record<string, any>[];
      const out = await runTick({ exec: execTick, body });
      return json(out.body, out.status);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (msg.startsWith('config:')) return json({ ok: false, error: 'engine_unconfigured' }, 503);
      /* Never the exception text: it is the only thing on this path that could
         carry a fragment of a connection string into a response body. */
      return json({ ok: false, error: 'tick_failed' }, 500);
    }
  }

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

    /* ── INVARIANT 8, AT THE DOOR (M8 S2) ──────────────────────────────────
       BEFORE THE DISPATCH AND BEFORE ANY KEY IS DERIVED (§18.3). For the life
       of a party hunt the party watermark IS the member's watermark, and
       `hr_party_tick_settle` is the only writer of either — so a partied
       character's own `accrue` is refused `party_settle_required` and every
       `collectsFirst` verb `party_hunt_running`. The quantity being fenced is
       the INSTANT of an ordinary client intent, which would otherwise re-price
       a window three other players are paid from: CLAUDE.md §1's target
       property failing by timing rather than by number (§18.4 T-5b).

       ONE call site, not eight — see supabase/functions/hr-accrue/party-fence
       .js for why, and for why it fails closed. It costs a read only for a verb
       it could actually refuse. */
    {
      const refusal = await partyIntentFence({ exec, user, slot, verb: intent.verb });
      if (refusal) return json(refusal.body, refusal.status);
    }

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

    /* ── THE EQUIP VERB (b366) ─────────────────────────────────────────────
       A LOADOUT MAP OF NAMES, and nothing else. No quantity (an equip is
       always one unit), no stats (`ITEMS[id]` is server-side), no source slot
       (the source is the player's own inventory row, debited under a lock).
       If a `stats`, `bonus`, `qty` or `power` ever appears in this argument
       list, gear is forgeable from devtools again. */
    if (intent.verb === 'equip') {
      const out = await runEquip({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        equip: intent.equip,
      });
      return json(out.body, out.status);
    }

    /* ── THE ENCHANT VERB (ELEMENTS v1) — a clone of equip ──────────────────
       A SLOT NAME and a RUNE NAME, and nothing else. No element (it is
       `hr_runes[rune]`, server-side), no magnitude, no success bit. If an
       `element`, `power`, `magnitude` or `success` ever appears in this
       argument list, the enchant is forgeable from devtools. */
    if (intent.verb === 'enchant') {
      const out = await runEnchant({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        enchant: intent.enchant,
      });
      return json(out.body, out.status);
    }

    /* ── MANUAL FOOD CONSUMPTION (2026-08-25, Paione P0) ───────────────────
       An ITEM NAME and nothing else. No heal amount (it is `ITEMS[item].heals`,
       server-side), no qty (an eat is one unit), no hp (the server computes the
       absolute from its own hp + the catalogue heal). If a `heals`, `hp`, `qty`
       or `amount` ever appears in this argument list, the heal is forgeable from
       devtools and the food is duped from devtools.

       `auto` is the ONE exception to "no client fact reaches this verb", and it
       is an exception that can only make the answer SMALLER: it declares that the
       auto-eater fired this heal, which SUPPRESSES the buff (see readAuto in
       request.js for why it can neither mint nor cross to another player). It
       carries no amount, no duration and no type. */
    if (intent.verb === 'eat') {
      const out = await runEat({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        item: intent.item,
        auto: intent.auto,
      });
      return json(out.body, out.status);
    }

    /* ── THE GOLD VERBS (b351) ─────────────────────────────────────────────
       Each is handed a LITERAL, field by field, from named values — never a
       spread of `intent`. That is the same rule the accrue path follows below
       and it is what keeps this file free of any way for an unlisted body key
       to reach a verb: `parseIntent` builds seven fields and each dispatch
       names the ones its verb uses.

       ⚠ NO PRICE CROSSES THIS BOUNDARY. `offer` and `item` are NAMES and `qty`
         is a bounded count; the numbers they turn into are read out of
         ./catalogue.js inside the verb. If a `price`, `cost`, `unit` or `total`
         ever appears in one of these argument lists, the economy is forgeable
         from devtools again. */
    if (intent.verb === 'shop_buy') {
      const out = await runShopBuy({
        exec,
        user,
        slot,
        intentId: intent.intentId,
        offer: intent.offer,
        qty: intent.qty,
      });
      return json(out.body, out.status);
    }

    if (intent.verb === 'vendor_sell') {
      const out = await runVendorSell({
        exec,
        user,
        slot,
        intentId: intent.intentId,
        item: intent.item,
        qty: intent.qty,
      });
      return json(out.body, out.status);
    }

    /* b349 — THE GRANT INTENT. Same shape as the lines above it and that is the
       point: index.ts stays five things (prove who is asking, spend the budget,
       read, compute, commit) and every intent is a pure ESM module a Node test
       can drive. Note what is NOT forwarded — there is no period and no amount
       to forward, because request.js has no reader for either. */
    if (intent.verb === 'claim_reward') {
      const out = await runClaimReward({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        reward: intent.reward,
      });
      return json(out.body, out.status);
    }

    /* b354 — THE UNLOCK PURCHASE. It forwards LESS than shop_buy does: no
       quantity, because a rung is bought once, and the OFFER ID is the whole of
       what crosses. The price, the rung, the ladder, the property-tier gate and
       the blueprint are all read inside hr_unlock_buy out of
       public.hr_unlock_offers — so unlike every other verb here, this one's
       commit point is not hr_apply, which structurally cannot write a level. */
    if (intent.verb === 'unlock_buy') {
      const out = await runUnlockBuy({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        offer: intent.offer,
      });
      return json(out.body, out.status);
    }

    /* ── THE DUNGEON SETTLE VERB (dungeon-settlement.md §2). Same three lines
       the others get. It forwards a DUNGEON object {id, mode, quality} and
       nothing else — no loot, no scrip, no key. hr_dungeon_settle reads the loot
       table, the scrip base and the entry key from the client-unwritable
       catalogue and the caller's own inventory; p_quality is clamped to [0,1] and
       scales SELF-ONLY scrip. Like unlock_buy, its commit point is not hr_apply
       (a dedicated RPC), because a scrip credit + loot roll + key debit is one
       transaction with its own re-validation. */
    if (intent.verb === 'dungeon_settle') {
      const out = await runDungeonSettle({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        dungeon: intent.dungeon,
      });
      return json(out.body, out.status);
    }

    /* ── THE QUARTERMASTER BUY VERB (dungeon-settlement.md §4, increment 3). Same
       three lines. It forwards ONE offer id (`qm.<item>`) and nothing else — no
       item, no price, no scrip amount. hr_quartermaster_buy reads the price + the
       item from the client-unwritable hr_qm_offers, debits scrip and grants the
       item in one transaction. Like unlock_buy / dungeon_settle its commit point is
       a dedicated RPC, not hr_apply — a scrip debit + item grant is one atomic
       trade with its own re-validation (the b372 half-undo, closed). */
    if (intent.verb === 'quartermaster_buy') {
      const out = await runQuartermasterBuy({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        offer: intent.offer,
      });
      return json(out.body, out.status);
    }

    /* ── THE TROPHY CLAIM VERB (docs/design/BESTIARY_LADDER.md §4). Same three
       lines. It forwards a MONSTER ID and a STAGE NUMBER and nothing else — no
       kill count, no multiplier, no "earned" bit. hr_trophy_claim validates the
       monster against the server's own combat catalogue, re-reads the kill total
       from player_progress under the advisory lock, and writes one collection
       row plus one ledger row. Like unlock_buy / dungeon_settle / quartermaster_buy
       its commit point is a dedicated RPC and not hr_apply — a trophy row is a
       GREATEST-style once-ever write, and hr_apply merges progress ADDITIVELY.

       ⚠ IT MINTS NOTHING, so this is the one value-verb dispatch in this file
         after which no balance has moved. See trophy-claim.js's header for why
         that is the feature's whole security argument rather than an omission. */
    if (intent.verb === 'trophy_claim') {
      const out = await runTrophyClaim({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        trophy: intent.trophy,
      });
      return json(out.body, out.status);
    }

    /* ── b355 — THE MARKET VERBS. THE FIRST VALUE THAT CROSSES BETWEEN TWO
       PLAYERS, and the dispatch is the same three lines the others get, which
       is the point: index.ts stays five things and every intent is a pure ESM
       module a Node test can drive.

       ⚠ READ THE ARGUMENT LISTS. `market_buy` forwards a LISTING and a COUNT
         and nothing else — there is no `ask` in it, and there must never be.
         The seller names a price ONCE, in `market_list`, about their own goods;
         from then on it is server state, and hr_market_buy reads it off the row
         it locked. That asymmetry is the whole of the cross-player argument
         (./request.js §"…AND THEN THERE IS `ask`"), and it lives visibly in
         these two argument lists rather than in a comment somewhere else. */
    if (intent.verb === 'market_list') {
      const out = await runMarketList({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        item: intent.item,
        qty: intent.qty,
        ask: intent.ask,
      });
      return json(out.body, out.status);
    }

    if (intent.verb === 'market_cancel') {
      const out = await runMarketCancel({
        exec,
        user,
        slot,
        intentId: intent.intentId,
        listing: intent.listing,
      });
      return json(out.body, out.status);
    }

    if (intent.verb === 'market_buy') {
      const out = await runMarketBuy({
        exec,
        user,
        slot,
        intentId: intent.intentId,
        listing: intent.listing,
        qty: intent.qty,
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
      /* ── THE BESTIARY COUNTERS RIDE THIS TRANSACTION (charms phase 1) ──────
         `hr_bestiary_of` (2026-08-20-bestiary.sql) is the dedicated read over
         the `ev:kill_monster:%` population — deliberately NOT dug out of
         hr_state_of's `progress` array, which is `limit 1000` with a
         `progress_truncated` flag, because a capability must never answer "you
         have never killed one of those" because the character owns a lot of
         collection rows. That is the same argument hr_perks_of won.

         IT IS HERE AND NOT IN A THIRD TRANSACTION for the §2a-ii connection
         rule: max_connections is 60, an accrual already costs two pooled
         transactions, and the resource that fails TOTALLY is the one nobody
         gets to add 50% to for a display feature.

         ⚠ AND IT IS BEHIND A SAVEPOINT, not the three-rung literal ladder the
           SEED transaction uses. A missing FUNCTION is a hard 42883 that aborts
           its whole transaction, and aborting THIS transaction would 500 every
           accrual on a database that has not applied the bestiary migration —
           i.e. a display feature would be able to cost every player their
           night. A savepoint makes the abort recoverable without a second
           connection AND without doubling the number of hand-written query
           literals every time another optional projection is added (the seed
           ladder is already 3 literals for 2 capabilities; a 4th capability
           there would be 8). Rolling back to the savepoint leaves `state` and
           `cap_ms`, already read above, untouched.
           42883 AND ONLY 42883 is swallowed. Anything else propagates: a
           swallowed error is how a guard reports SKIPPED and gets read as a
           pass. Verified on production 2026-09-13 — the function EXISTS
           (public.hr_bestiary_of(p_user uuid, p_slot integer), SECURITY
           DEFINER, hr_engine-only) — so this ladder is the safety net for a
           replay/dev database, not the expected path. */
      let kills: Row[] | null = null;
      try {
        kills = await tx.savepoint((sp: typeof tx) => sp`
          select monster_id, kills
            from public.hr_bestiary_of(${user}::uuid, ${slot}::int)`) as unknown as Row[];
      } catch (e) {
        if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;
        kills = null;
      }
      /* THE CLAIMED TROPHY ROWS (docs/design/BESTIARY_LADDER.md §4), in their
         OWN savepoint rather than the one above. A combined savepoint would
         make a database that has hr_bestiary_of but not hr_trophy_of — i.e.
         every database between the two applies — lose the KILL counters too,
         which price the drop multiplier. Degrading a projection is a missing
         badge; degrading the counters is an under-paid night.
         Same rule otherwise: 42883 AND ONLY 42883 degrades, to null, and
         absence is never a claim. */
      let trophyRows: Row[] | null = null;
      try {
        trophyRows = await tx.savepoint((sp: typeof tx) => sp`
          select monster_id, stage
            from public.hr_trophy_of(${user}::uuid, ${slot}::int)`) as unknown as Row[];
      } catch (e) {
        if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;
        trophyRows = null;
      }
      /* THE SERVER'S COLLECTION COUNT (Ledger of Firsts, 2026-09-27). The
         number of DISTINCT combat drops hr_claim_milestone verifies the items
         rungs against — `count(*)` over hr_collection_of, the exact read that
         RPC makes. Until now it rode no envelope, so the Collection log gated
         its items rungs on G.collection (the bag + attended pickups, gathered
         and crafted ids included) and offered Claim on rungs the server
         answered `incomplete` (CLAUDE.md §6). Its OWN savepoint, for the reason
         the trophy read has one: a database without the function must not
         cost the kill counters. The VERIFIED user and slot only, never a body
         field. 42883 AND ONLY 42883 degrades, to null — the key is then
         omitted and the client's fail-safe is "nothing claimable". */
      let collectionFound: number | null = null;
      try {
        const counted = await tx.savepoint((sp: typeof tx) => sp`
          select count(*)::int as n
            from public.hr_collection_of(${user}::uuid, ${slot}::int)`) as unknown as Row[];
        const n = Number(counted?.[0]?.n ?? 0);
        collectionFound = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      } catch (e) {
        if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;
        collectionFound = null;
      }
      return { ...(row as Row), bestiary_rows: kills, trophy_rows: trophyRows,
        collection_found: collectionFound } as Row;
    });

    if (read?.limited) return json({ ok: false, error: 'rate_limited' }, 429);

    const env = read?.state as Record<string, any> | null;
    if (!env || env.ok !== true) {
      return json({ ok: false, error: (env && env.error) || 'no_character' }, 409);
    }

    /* ── THE BESTIARY CHARM BLOCK (charms phase 1 — DISPLAY ONLY) ──────────
       Per-monster counters in, per-CLASS totals out, folded by
       src/core/charms.js `killsByClass` through `classOfMonster` — the one
       function that reconciles the two live spellings of the eleventh class
       (`extradimensional` on the roster row, `extra_dimensional` in the bane
       taxonomy). The client is therefore handed at most ELEVEN numbers rather
       than a roster-sized map, and it never has to know the taxonomy.

       ⚠ IT SHIPS AS ITS OWN TOP-LEVEL BLOCK, NOT INSIDE `state`. `state` is
         hr_state_of's projection and the client applies it as authority field
         by field; this is a DERIVED read that rides along, exactly like
         `away`. Putting it inside `state` would make it look like a column.

       ⚠ NO RANK IS COMPUTED HERE, and none is stored anywhere. The rank is
         derived from these counters on every read (src/core/charms.js
         `charmIndex`), which is the Game Designer's 2026-09-13 ruling and the
         reason this feature needs no migration and no save field.

       `null` when the projection is absent (a database without
       2026-08-20-bestiary.sql) — the key is then OMITTED from every response,
       and the client's fail-safe is rank 0. Absence is never a claim. */
    const bestiaryRows = Array.isArray((read as Record<string, unknown>)?.bestiary_rows)
      ? (read as Record<string, unknown>).bestiary_rows as Row[]
      : null;
    const trophyRows = Array.isArray((read as Record<string, unknown>)?.trophy_rows)
      ? (read as Record<string, unknown>).trophy_rows as Row[]
      : null;
    let bestiary: {
      kills_by_class: Record<string, number>;
      kills_by_monster: Record<string, number>;
      /* OPTIONAL, and the `?` is the type-level half of Security F3: a required
         field is a field the emit site cannot leave out, and this one MUST be
         left out when hr_trophy_of did not answer. See the emit below. */
      trophies?: Array<{ monster: string; stage: number }>;
    } | null = null;
    /* THE SAME ROWS, HANDED TO THE ENGINE RAW (charms phase 2). The engine does
       its OWN fold (accrual.js `killsByClass` → `charmIndex`) rather than reading
       `kills_by_class` back: that block is a display projection, and an engine
       that priced a drop table off a presentation shape would make the wire
       load-bearing. `null` when the projection is absent ⇒ no charm ⇒ the
       pre-charm numbers. Nothing here is request-derived. */
    let bestiaryKills: Record<string, number> | null = null;
    if (bestiaryRows) {
      const byId: Record<string, number> = {};
      for (const r of bestiaryRows) {
        const id = String(r?.monster_id ?? '');
        const n = Number(r?.kills ?? 0);
        if (id && n > 0) byId[id] = n;
      }
      /* Spread into a PLAIN object: killsByClass returns a null-prototype map
         (its keys are data-derived lookup keys) and the wire wants an ordinary
         JSON object. `{}` when nothing has been killed yet — a truthful empty
         bestiary, distinct from the absent key above. */
      /* ⚠ `kills_by_monster` RIDES THE SAME BLOCK, AND IT IS NOT REDUNDANT WITH
         `kills_by_class`. The TROPHY ladder is per monster: its badge, and the
         "8,120 more to Slayer" line that is the whole retention affordance,
         cannot be rendered from eleven class totals. It is the same `byId` the
         engine is handed — the server's own rows, never a client counter — so
         the panel and the engine read ONE set of numbers (CLAUDE.md §6: the
         browser never says one thing while the server says another). At most
         one entry per monster ever killed, so ≤108 today.

         ⚠ AND THE CLAIMED TROPHY ROWS. The stage is DERIVED from the counters
         above and is NOT sent — there is no stage field on this wire, so there
         is none to forge. This array is the CLAIM half only: which trophies the
         server has actually written, which is what the button's "Claimed" state
         must read. `[]` is a truthful "none claimed"; the key is OMITTED
         entirely on a database without hr_trophy_of, and the client's fail-safe
         is "not claimed", never a claim the server does not hold.

         ⚠ THE OMISSION IS A SPREAD, NOT A COMMENT (Security F3, 2026-09-22).
           This block said all of the above and then emitted `trophies: claimed`
           UNCONDITIONALLY, built from `trophyRows ?? []`. So on the 42883
           degradation path — and on this feature's own documented rollback,
           `drop function public.hr_trophy_of` — the key was PRESENT and EMPTY.
           noteEnvelope (src/features/bestiary-trophies.js) reads a present key
           as authority, so `hasTrophyKey` went true with nothing in it,
           `isClaimed` went false for every trophy the server holds, and the
           panel re-offered Claim on a claimed trophy while the server answered
           `already_owned`. That is CLAUDE.md §6's "the browser says one thing
           and the server says another", on the surface this lane built.
           `trophy-claim.js`'s PROJECTION_SQL path already had this right — a
           failed re-read drops the whole block rather than emitting an empty
           one — and this is the same rule at the other emit site: ABSENCE MUST
           STAY ABSENCE, because an empty array is a claim and null is not. */
      const claimed: Array<{ monster: string; stage: number }> = [];
      for (const r of (trophyRows ?? [])) {
        const mid = String(r?.monster_id ?? '');
        const st = Number(r?.stage ?? 0);
        if (mid && Number.isFinite(st) && st > 0) claimed.push({ monster: mid, stage: Math.floor(st) });
      }
      bestiary = {
        kills_by_class: { ...(killsByClass(byId, MONSTERS) || {}) },
        kills_by_monster: { ...byId },
        ...(trophyRows ? { trophies: claimed } : {}),
      };
      bestiaryKills = byId;
    }

    /* THE COLLECTION BLOCK — `{ found }`, the server's distinct combat-drop
       count, or null when hr_collection_of did not answer. ABSENCE STAYS
       ABSENCE (the trophy wire's Security F3 rule): null omits the key at every
       emit site; a present `found: 0` is a truthful "none yet". */
    const collectionFoundRaw = (read as Record<string, unknown>)?.collection_found;
    const collection: { found: number } | null =
      (typeof collectionFoundRaw === 'number' && Number.isFinite(collectionFoundRaw))
        ? { found: Math.max(0, Math.floor(collectionFoundRaw)) }
        : null;

    const st = env.state;
    const nowMs = new Date(read.now as string).getTime();

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
    /* ⚠ `hr_attended_kills` RIDES THIS TRANSACTION, NOT A THIRD ONE, and that is
       the §2a-ii connection rule rather than a micro-optimisation: `max_connections`
       is 60, an accrual already costs two pooled transactions, and a third would be
       a 50% increase in the resource that fails TOTALLY (nobody connects, dashboard
       included). It is also why it is here and not in the READ transaction above:
       a missing FUNCTION is a hard 42883 that aborts its whole transaction, and
       aborting the read would 500 every accrual on a database that has not applied
       the migration. This transaction already owns that degrade.
       THE LADDER IS THREE RUNGS, not two, because the two absences are
       INDEPENDENT — a database can have `hr_perks_of` and not `hr_attended_kills`
       (the ordinary case the day this ships), and collapsing them into one
       fallback would silently drop the perk channel on every such database and
       under-pay every bonus in the game. Each rung drops exactly one capability
       and the previous rung's absence is remembered. */
    /* ⚠ THE THREE QUERIES ARE WRITTEN OUT, NOT COMPOSED FROM A SHARED FRAGMENT.
       `postgres`'s nested-fragment support would let the two seed columns be
       factored out, but a fragment built by calling the tagged template eagerly
       is a pending query object, and getting that subtlety wrong here does not
       fail loudly — it fails as "every accrual 500s". Three literals cost eight
       duplicated lines and cannot be wrong. */
    /* SECURITY CONDITION C6 — THE UPPER EDGE OF THE ATTENDED WINDOW, AND IT IS
       THE WATERMARK, TO THE MILLISECOND.
       `hr_attended_kills` runs in the SEED transaction, which starts strictly
       AFTER the state transaction whose `now()` this settle will advance
       `accrued_to` to. A window bounded only below by `accrued_to` therefore
       projects any credit row committed in that gap — the settle pays it, and
       the next settle projects it AGAIN, because it is still newer than the
       watermark. `(accrued_to, now]` is the ONLY double-pay guard this design
       has, so the two ends must name the same instant.
       ⚠ IT IS `new Date(nowMs).toISOString()`, NOT `read.now`, DELIBERATELY.
         `read.now` carries Postgres's MICROSECONDS, so passing the raw value
         would leave a sub-millisecond band above this bound that no window
         covers. Deriving the bound from `nowMs` — the same integer the delta's
         watermark is derived from — makes the two commensurable by construction
         rather than by rounding luck.
       ⚠ AND THE WATERMARK IS NO LONGER ALWAYS THIS INSTANT (2026-09-16). An
         uncapped window now stamps `accrued_to` at `nowMs` MINUS the sub-tick
         remainder the simulation did not spend, so the half-wound swing is
         deferred instead of destroyed (accrual.js `settledWatermarkMs`). That
         would re-open the band `(accrued_to, nowMs]` to a SECOND projection of
         a row this settle already ate — so the same function FLOORS the
         watermark at `attended.to`, the newest row it actually consumed. C6's
         property is unchanged and is now stated where it can be executed: a
         credit row is inside exactly one window. Rows stamped after this read
         carry `created_at > nowMs` and are picked up by the next settle, which
         is what they were always for.
       ⚠ AND IT IS A SERVER VALUE. `nowMs` is `new Date(read.now).getTime()` —
         Postgres's own clock, read in this call. Nothing in the request body
         reaches it. The function clamps it with `least(p_upto, now())` anyway,
         so the worst a wrong value could ever do is pay LESS. */
    const attendedUpto = new Date(nowMs).toISOString();
    const seedSql = (withPerks: boolean, withAttended: boolean) => sql.begin(async (tx) => {
      await tx`set local role hr_engine`;
      const [r] = (withPerks && withAttended)
        ? await tx`
        select (public.hr_seed(${user}::uuid, ${slot}::int,
                               ${'accrue:' + String(st.accrued_to)}) & 4294967295)::bigint as seed,
               public.hr_seed(${user}::uuid, ${slot}::int,
                              ${'intent:accrue:' + String(st.accrued_to)})::text as salt,
               public.hr_perks_of(${user}::uuid, ${slot}::int) as perks,
               public.hr_attended_kills(${user}::uuid, ${slot}::int,
                                        ${attendedUpto}::timestamptz) as attended`
        : withPerks
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
    let attendedChannel = 'live';
    try {
      seedRow = await seedSql(true, true) as Row;
    } catch (e) {
      if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;
      /* One of the two is absent. Try WITHOUT the newer one first, so the common
         case — a database that has perks and not yet the attended read — keeps
         its perk channel. Only if that ALSO 42883s is the perk channel absent. */
      attendedChannel = 'absent';
      try {
        seedRow = await seedSql(true, false) as Row;
      } catch (e2) {
        if (String((e2 as { code?: string } | null)?.code ?? '') !== '42883') throw e2;
        // This database predates the perk channel. Pay what yesterday paid.
        perkChannel = 'absent';
        seedRow = await seedSql(false, false) as Row;
      }
    }
    const salt = String(seedRow?.salt ?? '');
    /* `ok !== true` covers both "no character" and a future refusing shape.
       null → EMPTY_PERKS in the engine → 0 for every key → today's behaviour. */
    const perkEnv = seedRow?.perks as Record<string, unknown> | null;
    const perks = (perkEnv && perkEnv.ok === true) ? perkEnv : null;
    /* THE ATTENDED KILL LEDGER (docs/design/attended-loot-credit.md). Every value
       in it was written by hr_credit_kills into hr_kill_credit_log — a table no
       client role may write, holding counts that verb already clamped to a
       physical maximum against the SERVER clock. `null` on `ok !== true` and on
       an absent function, which the engine reads as "propose nothing new".
       ⚠ NOTHING HERE COMES FROM THE REQUEST BODY. The request carries no kill
         count, no monster and no window; `slot` is the only client-chosen value
         in the whole call and it selects a row the caller already owns. */
    const attendedEnv = seedRow?.attended as Record<string, unknown> | null;
    const attendedIn = (attendedEnv && attendedEnv.ok === true) ? attendedEnv : null;

    // ── COMPUTE. Pure, in-process, no I/O. Field by field. ─────────────────
    /* ⚠ THE ENVELOPE'S OWN FIELDS ARE NOT LISTED HERE ANY MORE (2026-09-22).
       They were, and the world tick listed them a SECOND time in
       `tick-gather.js sessionFromRoster` — off `env.state` instead of off the
       envelope top level, so the tick handed the engine `skills {}` for a
       Mining-61 character and every shadow window came back `would_ticks: 0`
       with `activity: {kind:'idle'}`. One two-level shape, two readers, and
       both "worked". The map now lives in ./envelope.js with ONE field list and
       both callers spread it; see that file's header for the measurement.
       Everything NOT in it — the seed, the perks, the attended ledger, the
       bestiary, the cap, the catalogues, the caller literals — is still named
       at this call site, because none of it comes from the envelope. */
    const capMs = Number(read.cap_ms) || 0;

    /* The engine is called with a LITERAL, field by field, from named server
       values. `slot` is the only field on this object whose value came from the
       request, and it selects a row the caller already owns.
       `step` is what the DEGRADE LADDER varies between attempts, and it is
       produced by `degradeStep` in accrual.js rather than computed here — what
       "a smaller proposal" means is a game rule and this file holds none (see
       the header). */
    const runAccrual = (step: {
      capMs: number; actionBudget: number | null; attended: Record<string, unknown> | null;
    }) => computeAccrual({
      userId: user,
      slot,
      nowMs,
      /* EVERY FIELD `hr_state_of` OWNS, IN ONE PLACE: the pointer, the two
         watermarks, hp/max_hp/gold, skills/inventory/equipment, enchant, buffs,
         the auto-eat settings, tool_carry / ammo_carry / fight, the recovery
         line, the retreat counter, the two death anchors, hearthfind_ready and
         combat_style. Not one of them is request-derived — the envelope is the
         projection the row hr_apply locks is read through. */
      ...engineInputsFromEnvelope(env, nowMs),
      capMs: step.capMs,
      /* THE LADDER'S KNOB (Security C1). Null on the first attempt and on every
         non-artisan path — unbounded, i.e. exactly the pre-b356 behaviour. On a
         degraded artisan attempt it is HALF THE ACTIONS THE PREVIOUS ATTEMPT
         RAN, because an artisan night is bounded by the BAG whenever the player
         left less material than the clock could consume, and halving the span
         of a bag-bound run reduces the proposal by less than half — measured,
         sometimes by nothing at all. It is derived from the ENGINE'S OWN
         previous answer; nothing here comes from the request body. */
      actionBudget: step.actionBudget,
      /* ── WHO IS SETTLING (b531; the caller taxonomy, 2026-09-18) ──────────
         A SERVER LITERAL. Never read off the request body, never defaulted from
         one: a client that could name its own caller would pick 'collect' and
         buy the ACCRUE_MIN_MS exemption on demand, turning a 1 s poll loop into
         a payable window. tests/activity-intent.mjs asserts the literal.

         'accrue' HERE, and that is the point. The accrue verb does not touch
         the pointer, so a span it declines to price is DEFERRED and the next
         cadence poll sees a longer one — exactly the reasoning ACCRUE_MIN_MS
         was written on, so the floor stays on this path unchanged, and the
         sub-action remainder is deferred rather than stamped away.
         set-activity.js's collect passes 'collect' because the switch that
         follows it stamps `active_since = now()` and destroys the window
         instead of deferring it.
         Mirrors set-activity.js field for field (A14). */
      caller: 'accrue',
      /* THE RUNTIME HALF OF THAT SENTENCE (Security, 2026-09-18). A14b's source
         regex only reads THIS file and set-activity.js; a future third call
         site forwarding a body would be invisible to it. `CALLER_AUTHORITY` is
         an imported object IDENTITY, which a JSON request body cannot express,
         so any caller that did not come from server code reads as 'accrue'.
         Passed on this path too — 'accrue' needs no privilege, but A14 requires
         the two literals to carry the same field set, and a field present on
         only one side is exactly the drift A14 exists to catch. */
      callerAuthority: CALLER_AUTHORITY,
      /* THE ATTENDED TOP-UP'S INPUT, AND IT COMES OFF `step`, NOT OFF THE CLOSURE.
         `degradeStep` returns `attended: null` on every rung, so a degraded
         attempt proposes strictly less. Reading `attendedIn` directly here would
         INVERT the ladder: halving the span cuts `summary.kills`, which GROWS
         `min(attended, cap) - summary.kills`, so the "smaller" proposal would be
         bigger, earn the same rejection three times and forfeit the night. The
         value flows through the same knob object every other ladder-varied input
         does, for exactly that reason. */
      attended: step.attended,
      seed: Number(seedRow?.seed) || 0,
      /* THE BESTIARY COUNTERS (charms phase 2). `hr_bestiary_of`'s rows, read in
         the state transaction above behind its own savepoint, folded to a charm
         rank BY THE ENGINE. No client value, no delta key, and null ⇒ no charm.
         Mirrors set-activity.js field for field (A14). */
      bestiaryKills,
      /* THE COMPANION-XP ARM SWITCH (ARMED, b550). A deploy-time constant, NOT
         a request value. True today → the engine writes the companion_xp op and
         is its only writer. Mirrors set-activity.js field for field (A14). */
      companionXpBacked: COMPANION_XP_SERVER_BACKED,
      /* THE PERMANENT PERK STACK. Server-owned unlock rows only — the room
         rung, the plot buildings, the property tier. It does NOT come from the
         envelope: `hr_perks_of` is its own read, in the seed transaction.
         `null` means the channel is absent or the character has bought nothing,
         and the engine reads that as 0 for every key, which is the `zeroBonus`
         behaviour that shipped before b349. Nothing here is request-derived. */
      perks,
      /* THE ARTISAN GATE. `?? null`, not `?? {}` — null means this database
         predates the model, and the engine reads that as LOCKED. Nothing here
         comes from the request. */
      unlockedRecipes: ((perkEnv && perkEnv.ok === true ? perkEnv.unlockedRecipes : null) ?? null) as Record<string, boolean> | null,
      items: ITEMS,
      monsters: MONSTERS,
      nodes: GATHER_NODES,
      /* THE ARTISAN INDEX — the FULL one, so the engine can tell "no such
         recipe apart from a bench that is not server-owned yet. Built once in
         ./catalogue.js; nothing here comes from the request.
         Mirrors set-activity.js field for field (A14). */
      recipes: ARTISAN_RECIPES_ALL,
    });

    let out = runAccrual({ capMs, actionBudget: null, attended: attendedIn });

    /* ── THE PARALLEL WORKER SETTLE (worker-settlement slice) ───────────────
       Hired-crew production is a CONTINUOUS activity that runs ALONGSIDE the
       pointer, on its OWN watermark `workers_accrued_to`. It is settled here —
       NOT through KIND_ACCRUERS — and it is settled EVEN WHEN the pointer
       accrual refused (idle / below-min / unsupported), because a pointer that
       owes nothing does not mean a crew that owes nothing. That is the whole bug
       the design closes: the early `!out.accrued` return below MUST NOT skip a
       pending worker window. `accrueWorkers` is pure and draws no rng, so its
       output is server-owned and deterministic. The crew + watermark are read
       from the SAME hr_state_of transaction as everything else, never a body. */
    const wout = accrueWorkers({
      nowMs,
      workersAccruedToMs: st.workers_accrued_to ? new Date(st.workers_accrued_to).getTime() : null,
      crew: Array.isArray(env.workers) ? env.workers : [],
      nodes: GATHER_NODES,
      items: ITEMS,
    });

    /* Merge the worker delta into ANY delta bound for hr_apply: worker items
       fold into the signed `items` map (so hr_apply's qty_in counts them against
       the day budget), `workers` is the per-worker xp sub-delta, and
       `workers_accrued_to:'now'` advances the crew watermark. Applied to a COPY
       at every apply site — including each degrade rung — because the worker
       figures are small, constant across attempts, and must ride the ONE
       hr_apply call the pointer makes. */
    const mergeWorkers = (delta: Record<string, any>): Record<string, any> => {
      if (!wout.accrued) return delta;
      const d: Record<string, any> = { ...delta };
      const items: Record<string, number> = { ...(d.items || {}) };
      for (const id of Object.keys(wout.items)) {
        items[id] = (Number(items[id]) || 0) + Number(wout.items[id]);
      }
      d.items = items;
      d.workers = wout.workers;
      d.workers_accrued_to = 'now';
      /* C2 (2026-09-08 security review) — JOURNAL THE CREW SHARE. On this merged
         path the crew's items ride the POINTER's delta and the row keeps the
         pointer's kind/intent/meta.ms, so the ledger showed a `gather` row whose
         item count no rate could explain: the first-hire backlog mint was found
         only by dividing meta.ms by the node rate. `meta.crew` names the crew
         half of the row explicitly — span, quantity, worker count and the exact
         items — so the next crew defect is one query away instead of arithmetic.
         hr_apply already merges `journal.meta` into the row
         (jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta','{}')), so
         this needs no SQL change and adds no write surface; a <=6-worker item map
         is far inside the 2 KB journal backstop. Spread-merged so a caller that
         already set a journal (the standalone worker settle below) keeps its
         kind/intent and its own meta keys. */
      /* Folded into an EXISTING journal only. Both call sites (the pointer's
         out.delta and the standalone settle below) always carry one with a
         `kind`; hr_apply coalesces a kindless journal to kind='admin', so
         inventing one here to hang meta.crew off would mislabel the row. */
      if (d.journal && typeof d.journal === 'object') {
        const j: Record<string, any> = { ...(d.journal as Record<string, any>) };
        j.meta = {
          ...((j.meta as Record<string, any>) || {}),
          crew: {
            ms: wout.summary.spanMs,
            qty: wout.summary.qty,
            workers: wout.summary.workers,
            items: wout.items,
          },
        };
        d.journal = j;
      }
      return d;
    };

    /* ── THE PARALLEL RESTED SETTLE (b437) ──────────────────────────────────
       Rested XP banks on WALL-CLOCK, independent of the pointer — you rest
       whether or not an activity is running — so it is settled here alongside the
       crew, on its OWN watermark `rested_at`, and EVEN WHEN the pointer accrual
       refused. `accrueRested` is pure, draws no rng, and is watermark-idempotent.
       The bank cap is left at the server default (a Great Library owner's raised
       120 bank is a named arm-blocker — under-pays the SIZE only, never the rate).
       `restedAtMs === null` (the column is absent) omits the keys entirely — the
       same self-configuring switch tool_carry/fight use. */
    const rout = accrueRested({
      nowMs,
      restedAtMs: st.rested_at ? new Date(st.rested_at).getTime() : null,
      restedXp: Number(st.rested_xp) || 0,
      libraryCap: null,
    });

    /* Fold the NEW ABSOLUTE bank values into any delta bound for hr_apply.
       `rested_at` is an ISO STRING (hr_apply casts `::timestamptz`); it is the
       exact advanced watermark (old + granted*CHARGE_MS), NOT `now()`, so the
       bank cannot be double-paid on the next call. Applied to a COPY at every
       apply site — including each degrade rung and the parallel settles — because
       the figures are small, constant across attempts, and must ride the ONE
       hr_apply call the pointer makes. */
    const mergeRested = (delta: Record<string, any>): Record<string, any> => {
      if (!rout.accrued) return delta;
      return {
        ...delta,
        rested_xp: Number(rout.restedXp),
        rested_at: new Date(Number(rout.restedAt)).toISOString(),
      };
    };
    /* The two parallel settles compose: crew items + rested bank both ride the
       pointer's hr_apply (or the standalone settle below). */
    const mergeAux = (delta: Record<string, any>): Record<string, any> =>
      mergeRested(mergeWorkers(delta));

    if (!out.accrued) {
      // The pointer owes nothing. If the CREW and/or the RESTED bank owe
      // something, settle whichever do in ONE hr_apply call — the watermarks that
      // advance are workers_accrued_to and/or rested_at, NEVER accrued_to (so the
      // daily streak does not bump on a pointer-idle settle). No degrade ladder:
      // a crew haul + a handful of rested charges are tiny and cannot trip a
      // per-call clamp.
      if (wout.accrued || rout.accrued) {
        // The journal names the dominant reason; when only rested banked it is a
        // plain `accrue` row (kind is allowlisted), intent `accrue:rested`.
        const journal = wout.accrued
          ? { kind: 'worker', intent: 'accrue',
              meta: { ms: wout.summary.spanMs, qty: wout.summary.qty,
                workers: wout.summary.workers, capped: wout.summary.capped,
                ...(rout.accrued ? { rested: rout.granted } : {}) } }
          : { kind: 'accrue', intent: 'accrue:rested', meta: { rested: rout.granted } };
        // Named `delta` (not `workerDelta`) so the `::text::jsonb` transport is
        // the SAME shape tests/delta-transport.mjs grades on every apply site —
        // a bare ::jsonb here would double-serialise and answer bad_delta.
        const delta = mergeAux({ journal });
        // Key idempotency on whichever watermark drove the settle. Either way a
        // replay dedups on this intent id; and even a fresh call cannot double-pay
        // because accrueRested/accrueWorkers recompute from the ADVANCED watermark.
        const auxWatermark = wout.accrued
          ? ('workers:' + String(st.workers_accrued_to ?? ''))
          : ('rested:' + String(st.rested_at ?? ''));
        const wIntentId = await intentIdFor({
          user, slot, watermark: auxWatermark,
          version: env.version, salt, attempt: 0,
        });
        const wres = await sql.begin(async (tx) => {
          await tx`set local role hr_engine`;
          const [r] = await tx`
            select public.hr_apply(${user}::uuid, ${slot}::int, ${env.version}::bigint,
                                   ${wIntentId}::uuid, ${JSON.stringify(delta)}::text::jsonb) as res`;
          return r as Row;
        });
        const wr = wres?.res as Record<string, any>;
        if (wr && wr.ok === true && wr.replayed !== true) {
          /* THE ENVELOPE CONTRACT (b475). A standalone rested/worker settle
             applied a delta and advanced its watermark(s) exactly like the main
             away path, so it MUST carry an `away` receipt or the client gate
             `isEnvelopeApplicable` (src/net/accrue.js) rejects the 200 as
             malformed — three of those trip ACCRUE_HALT_AFTER_TRIES and raise
             the alarming "Away progress is paused" modal while HIDING a grant
             the server already made. The receipt below is a PURE PROJECTION of
             what was already granted on THIS call — no new rolls, no
             Math.random, so AWAY-1 determinism holds and no forgery surface is
             added (it only reports values the server minted).

             `grantMs` is the wall span from the OLDEST driving watermark that
             actually accrued to `now`; rested banks on wall-clock for everyone,
             workers on their own watermark. The rested BANK is surfaced through
             the existing `rested:{granted}` field, NOT folded into `away.xp` —
             summaryFromAway would otherwise misreport a bank charge as skill
             XP. `items` carries the worker haul so the welcome-back card credits
             the crew's production. */
          const driveMsList: number[] = [];
          if (wout.accrued && st.workers_accrued_to) driveMsList.push(new Date(st.workers_accrued_to).getTime());
          if (rout.accrued && st.rested_at) driveMsList.push(new Date(st.rested_at).getTime());
          const driveMs = driveMsList.length ? Math.min(...driveMsList) : nowMs;
          const grantMs = Math.max(0, nowMs - driveMs);
          const away = {
            grantMs,
            capped: false,
            awayMs: grantMs,
            paidMs: grantMs,
            unpaidMs: 0,
            /* MS NUMBERS, not ISO. The main away path sets these from
               credit.fromMs / credit.toMs (accrual.js), and the client's
               summaryFromAway reads them as `Number(a.windowFrom) || null` — an
               ISO string coerces to NaN and the welcome-back card would show a
               null window. So the projection uses the same numeric contract. */
            windowFrom: driveMs,
            windowTo: nowMs,
            tickMs: 0,
            perkChannel: 'n/a',
            kills: 0,
            crits: 0,
            died: false,
            foodEaten: 0,
            blessed: false,
            buffsPaused: false,
            featuredMs: 0,
            featuredDropMult: 1,
            gold: 0,
            xp: {},
            items: wout.accrued ? wout.items : {},
            levelUps: [],
            events: [],
          };
          /* ⚠ THE ROSTER, NOT THE SUMMARY, LIVES AT `workers` (2026-08-25).
             `...wr` is hr_state_of and already carries `workers` as the CREW
             ROSTER — the array src/net/accrue.js reconcileWorkers reads. An
             earlier revision spread the worker SUMMARY at that same key here,
             which OVERWROTE that array with a stats object; reconcileWorkers saw
             a non-array, returned null, and left G.workers.hired = [] — so an
             idle player with a PRODUCING crew (their own pointer idle, crew
             mining) saw an empty roster and re-hired a worker they already had
             (QA 0a47ba77, live). The crew haul is already surfaced on
             `away.items`; the summary is telemetry only, so it moves to a
             non-colliding key and the roster survives. */
          return json({ ok: true, accrued: true, ...wr, away,
            ...(bestiary ? { bestiary } : {}),
            ...(collection ? { collection } : {}),
            ...(wout.accrued ? { workerSummary: wout.summary } : {}),
            ...(rout.accrued ? { rested: { granted: rout.granted } } : {}) });
        }
        // A refused / replayed aux settle falls through to the plain not-accrued
        // response: nothing was minted, no watermark moved.
      }
      // Nothing to pay. NOTHING IS WRITTEN — in particular the watermark is not
      // advanced, so a sub-threshold call cannot confiscate the time it
      // declined to pay for. The rate budget HAS been spent (see the gate
      // above), so this path is not free to loop.
      // ⚠ BUT THE CREW ROSTER STILL RIDES (2026-08-25). This is the boot path for
      //   an idle player with an idle crew: the pointer owes nothing and the
      //   workers produced nothing, yet the client must still render the crew it
      //   HAS. `env` is hr_state_of, so its `workers` is the authoritative
      //   roster; passing it lets reconcileWorkers paint the crew. An empty roster
      //   is a truthful [] (the player has no crew) — reconcile treats that as
      //   "the crew is genuinely empty", which is correct.
      /* ⚠ THE BESTIARY BLOCK RIDES THE NOT-ACCRUED PATH TOO, and that is the
         whole difference between a feature that works and one that is
         "forgotten on reload". This is the COMMON BOOT RESPONSE — an idle
         character with nothing to pay — and the client's envelope applier
         (applyEnvelopeState) never runs on it, so anything carried only by the
         accrued path would be invisible to exactly the player who opens the
         Bestiary after a reload. Nothing is minted here; it is a read. */
      return json({ ok: true, accrued: false, reason: out.reason, version: env.version, now: env.now,
        ...(bestiary ? { bestiary } : {}),
        ...(collection ? { collection } : {}),
        ...(Array.isArray((env as Record<string, any>).workers) ? { workers: (env as Record<string, any>).workers } : {}) });
    }

    // ── APPLY. The single writer — `applyOnce` is the statement, `apply`
    //    below is the statement PLUS the one rescue it is allowed to make. ──
    const applyOnce = async (delta: unknown, attempt: number) => {
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
        /* ⚠ `::text::jsonb`, NEVER `::jsonb`, ON A PRE-STRINGIFIED DELTA.
           THE CONSTRAINT: a parameter that POSTGRES DESCRIBES AS json/jsonb
           makes postgres.js re-serialize the value with JSON.stringify. With
           `prepare: false` (required in transaction mode, see the pool above)
           every statement takes the describe-first path — Parse with an
           unspecified type, then Describe — so the driver ALWAYS learns the
           resolved type from ParameterDescription and Bind then looks it up in
           `options.serializers`. `serializers[3802]` is JSON.stringify, so the
           already-stringified delta is encoded a SECOND time and arrives as a
           jsonb STRING SCALAR. hr_apply's first guard is
           `jsonb_typeof(p_delta) <> 'object'`, so every apply this function has
           ever attempted in production returned `bad_delta` — never once
           applied, from the first deploy (found 2026-08-15).
           Casting the parameter to `text` first makes Postgres describe it as
           text (25), whose serializer is `x => '' + x` — a passthrough — and
           the SQL cast does the parse. This shape is correct under BOTH driver
           typings (an unspecified type 0 is also a passthrough), which is why
           it is preferred over handing the driver the raw object.
           set-activity.js's APPLY_SQL must use the same shape. */
        const [r] = await tx`
          select public.hr_apply(${user}::uuid, ${slot}::int, ${env.version}::bigint,
                                 ${intentId}::uuid, ${JSON.stringify(delta)}::text::jsonb) as res`;
        return r as Row;
      });
      return applied?.res as Record<string, any>;
    };

    /* ── THE CARD IS NEVER WORTH THE NIGHT (F2, security 2026-09-07) ─────────
       `bad_receipt` is deliberately NOT in DEGRADABLE and that is right —
       shortening a span cannot repair a malformed object. But it left the whole
       absence hostage to the card: hr_apply refuses the DELTA, not the key, and
       `bad_receipt` is not a clamp, so the degrade ladder is never entered. One
       receipt the database disagrees with — a builder field `c_receipt_keys` has
       not learnt yet, a bound the two sides read differently, an `at` outside the
       clock slack — would 409 EVERY away settle for EVERY player until a
       redeploy, watermark frozen and night unpaid, over a Home card.

       So a refusal of the receipt now costs the RECEIPT and nothing else: the
       single writer retries the SAME delta once with the key DELETED. Placed
       here rather than at the two call sites because this is the one function
       that talks to hr_apply — a future apply site inherits the rescue instead
       of re-learning this lesson.

       ⚠ The retry carries its own `attempt` number, so `intentIdFor` derives a
         DIFFERENT key: this is a fresh apply, never a replay of the rejected
         one. `RECEIPT_RETRY_BASE` is past both the degrade rungs (1..MAX_DEGRADE)
         and the forfeit (MAX_DEGRADE + 1), so no two paths can collide on a key.
       ⚠ Retried ONCE, and only when the delta ACTUALLY CARRIED a receipt. A
         `bad_receipt` on a delta with no receipt in it is a different defect and
         must not be masked by a retry that changes nothing.
       ⚠ hr_apply has already journalled the refusal (hr_record_rejection) and
         `receiptRejected` puts it on the response, so "the card is missing" and
         "the engine and the database disagree about the receipt shape" are never
         the same observation from outside. Pay the player, then tell them. */
    const RECEIPT_RETRY_BASE = MAX_DEGRADE + 2;
    let receiptRejected: string | null = null;
    const apply = async (delta: unknown, attempt: number) => {
      const r = await applyOnce(delta, attempt);
      const rescued = receiptRescue(r, delta);
      if (!rescued) return r;
      receiptRejected = String((r as Row).why ?? 'refused');
      console.warn('[hr-accrue] hr_apply refused the away receipt (' + receiptRejected
        + ') — retrying the same delta WITHOUT it so the night is still paid');
      return await applyOnce(rescued, RECEIPT_RETRY_BASE + attempt);
    };

    /* ── THE LAST AWAY-CLASSIFIED RECEIPT (ruling 2026-09-07) ──────────────
       A receipt the server PAID is progression, not preference. Built by
       ./away-receipt.js — plain ESM so tests/away-receipt-journal.mjs grades THE
       SHIPPED FUNCTION rather than a transcription of it, which is the only way
       a guard on a Deno TypeScript shell can bite.

       ⚠ RECOMPUTED ON EVERY DEGRADE ATTEMPT, never computed once. The clamp
         ladder HALVES the span, and a halved span can fall under SYNC_MAX_MS —
         at which point hr_apply would answer `bad_receipt` and 409 the WHOLE
         absence over a card. Recomputed, the receipt is simply the first thing
         dropped: pay the player, then tell them, in that order.

       ⚠ Composed OUTSIDE mergeAux deliberately. mergeAux is the crew + rested
         bank and also rides the POINTER-IDLE settle above, which has no span and
         must never carry a receipt. */
    let res = await apply(withAwayReceipt(mergeAux(out.delta), out), 0);
    let degraded: Record<string, unknown> | null = null;

    /* THE DEGRADE LADDER (S8). Only ever entered on a clamp — never on a
       version conflict, a rate limit, an unknown id or an insufficiency, all of
       which mean something other than "this span was too big". */
    for (let attempt = 1;
         attempt <= MAX_DEGRADE && res && res.ok !== true && DEGRADABLE.has(String(res.error));
         attempt++) {
      /* WHAT "SMALLER" MEANS IS THE ENGINE'S DECISION, NOT THIS FILE'S. It used
         to be `Math.floor(out.grantMs / 2)` right here, which is correct only
         while output is proportional to time — true for combat and gathering,
         FALSE for artisan, where the bag can bound the night and halving the
         span then shrinks the proposal by less than half or not at all
         (Security C1). `degradeStep` picks the right knob per kind and returns
         null when there is nothing smaller left to ask for. */
      const step = degradeStep(out, attempt);
      if (!step) break;
      degraded = { from: String(res.error), ...step.report };
      const next = runAccrual(step);
      if (!next.accrued) break;
      /* `degradeStep` drops the attended top-up on every rung (accrual.js states
         why: keeping it would make each "smaller" proposal BIGGER). Say so on
         the receipt, or "the loot did not top up" and "the migration is not
         applied" become the same observation from outside. */
      attendedChannel = 'degraded';
      /* THE RUNG MUST ACTUALLY BE SMALLER. A step that proposes the same work
         as the attempt that was just rejected would earn the same rejection and
         burn a rung for nothing — three of those and the night is forfeited.
         This is the C1 defect expressed as a runtime fuse rather than only as a
         test: if a future kind's degradeStep stops shrinking, the ladder stops
         instead of grinding down to the forfeit. */
      if (Number(next.summary?.ticks) >= Number(out.summary?.ticks)) break;
      out = next;
      res = await apply(withAwayReceipt(mergeAux(out.delta), out), attempt);
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
      return json({ ...res, ok: true, accrued: false, reason: 'replayed',
        ...(bestiary ? { bestiary } : {}),
        ...(collection ? { collection } : {}) });
    }

    return json({
      ok: true,
      accrued: true,
      // The authoritative post-apply envelope, straight from hr_state_of —
      // the client renders this and computes nothing.
      ...res,
      ...(degraded ? { degraded } : {}),
      /* The bestiary charm counters (phase 1, display only). Read in the state
         transaction BEFORE this settle's kills were applied, so a settle that
         crosses a threshold shows the new rank on the NEXT read rather than in
         the same breath as the welcome-back card. That is deliberate: the
         alternative is adding the delta's kills to a projection by hand here,
         i.e. the client being shown a number the database has not confirmed. */
      ...(bestiary ? { bestiary } : {}),
      ...(collection ? { collection } : {}),
      levels: levelsOf(Object.fromEntries(
        Object.entries(res.skills || {}).map(([k, v]) => [k, (v as any).xp]),
      )),
      // The welcome-back payload, stated by the simulation so no renderer can
      // invent a bonus that was not applied (the away ruling's "player-facing
      // honesty" clause). featuredDropMult included — b326.
      away: {
        grantMs: out.grantMs,
        capped: out.capped,
        /* WHICH hours were credited, not merely how many (Ruling 2, 2026-08-15).
           Since the credited window is the FIRST `grantMs` after the player
           left, a capped night's window no longer ends at `now` — so a renderer
           can no longer derive it, and a derived one would name the wrong day's
           Boss of the Day. Stated, like every other field on this payload.
           `awayMs` is the credited span (its shipped meaning); the forfeited
           tail is `unpaidMs`, and the absence is the two added together. */
        awayMs: out.summary.awayMs,
        paidMs: out.summary.paidMs,
        unpaidMs: out.summary.unpaidMs,
        windowFrom: out.summary.windowFrom,
        windowTo: out.summary.windowTo,
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
        /* The same question for the attended kill ledger, reported for the same
           reason: 'live' when hr_attended_kills answered, 'absent' when this
           database has not applied 2026-09-10-attended-loot-credit.sql,
           'degraded' when the clamp ladder ran (which drops the top-up by
           design — see degradeStep). Without it, "the
           loot is still snapping down" and "the migration is not applied yet"
           are indistinguishable from outside, which is exactly how the bounty
           hang survived a verification pass. */
        attendedChannel,
        /* ⚠ `attendedKills` / `attendedTopUp` / `attendedCap` ARE DELIBERATELY
           NOT HERE (Security condition C2 on the F1 sign-off, 2026-09-04). All
           four numbers ARE journalled — `meta.att = {claimed, cap, sim, top}` —
           and that is where the watches read them, on a table no client can
           select. Putting them on the RECEIPT hands the forger the detector's
           own calibration: `cap` is the exact threshold Watch B's
           `rows_at_the_cap` keys on, `claimed`/`sim` is the ratio its
           `median_claim_over_sim` line keys on, and a forger who can read its
           own `cap` each settle can sit one unit under every per-settle line
           forever. Nothing in src/ ever read them (grepped: zero consumers), so
           this costs the client nothing.
           `attendedChannel` STAYS: it is a deployment fact, not a calibration —
           'live' / 'absent' / 'degraded' says whether the ledger answered, which
           is the only way to tell "the loot is still snapping down" from "the
           migration is not applied yet" from outside. It names no number.
           DO NOT re-add the three "for the welcome-back card": the card states
           what was PAID (gold, items, kills), and the top-up is already inside
           those totals — that is the entire point of §3.5. */
        /* ── DID THE STORED RECEIPT LAND? (F2) ───────────────────────────────
           OMITTED ENTIRELY on the ordinary path, present with hr_apply's own
           `why` when the receipt was REFUSED and the delta was re-applied
           without it. It is a deployment fact of the same family as
           `perkChannel` / `attendedChannel` and it names no number: without it,
           "this night was paid but the Home card is empty after a reload" and
           "the engine and the database disagree about the receipt shape" are
           the same observation from outside, which is exactly how a
           disagreement about a jsonb key would survive a verification pass. */
        ...(receiptRejected ? { receiptRefused: receiptRejected } : {}),
        kills: out.summary.kills,
        crits: out.summary.crits,
        died: out.summary.died,
        /* WHAT KILLED THEM, and WHY NOTHING HEALED THEM. Both are the same
           sentence on the return receipt — *"You died to Ancient Bear —
           auto-eat was off, so nothing healed you"* — and neither may be
           inferred (b341's standard, restated by ruling 2b, 2026-08-31).

           `diedTo` was missing outright: the client's `summaryFromAway` had no
           foe to name, so a server-stated death rendered "You died" with a
           blank where the monster goes. `autoEat` is the state the ENGINE ran
           this span with (accrual.js states it off `eatCfg`), not the client's
           current toggle, which is a different instant.

           Both are self-configuring on the way down: a client reading a
           receipt from an older deployment finds them absent, says nothing,
           and never guesses. */
        diedTo: out.summary.diedTo ?? null,
        autoEat: out.summary.autoEat,
        // How much food the night ate. The welcome-back card has to be able to
        // say it: a player who returns to an empty Cooked Shark stack and no
        // explanation files a bug, and the honest answer is "it kept you alive
        // for the whole twelve hours".
        foodEaten: out.foodEaten,
        /* ── WHY THE RUN ENDED BEFORE THE ABSENCE DID (b345, restored) ──────
           The engine has stated all five of these since the artisan/gather
           simulations landed (`src/core/artisan-sim.js` returns `burnt`,
           `stoppedBy`, `stoppedById`, `stoppedSkill`, `stoppedPerHour`;
           `src/core/skill-sim.js` returns the first four of those, gathering
           consuming nothing) and `out.summary` spreads the whole span summary —
           they were dropped HERE, at the response boundary, and nowhere else.
           The cost is the exact bug b345 exists to have deleted: eight Raw
           Shrimp against an eight-hour absence earns for 31 seconds and the
           card reports eight hours of honest pay with nothing about the stop.

           PASS-THROUGH ONLY. Nothing is computed, inferred or defaulted to a
           guess: a path that did not state a stop sends `null`/`0`, which the
           renderers read as "say nothing" (home-dashboard.js `awayStop` returns
           null on a falsy `stoppedBy`). In particular the server must NEVER
           derive the stop from `paidMs < awayMs` — tick flooring makes that
           inequality true on a perfectly ordinary night.

           A STOP IS A STRING OR IT IS NOTHING, for the same reason the client
           translator says so: a non-string truthy value reaches a renderer as
           "something stopped" with nothing to say about it, which is worse than
           silence. `burnt` and `stoppedPerHour` are counts, so they floor at 0. */
        burnt: Math.max(0, Math.floor(Number(out.summary.burnt) || 0)),
        stoppedBy: typeof out.summary.stoppedBy === 'string' && out.summary.stoppedBy
          ? out.summary.stoppedBy : null,
        stoppedById: typeof out.summary.stoppedById === 'string' && out.summary.stoppedById
          ? out.summary.stoppedById : null,
        stoppedSkill: typeof out.summary.stoppedSkill === 'string' && out.summary.stoppedSkill
          ? out.summary.stoppedSkill : null,
        stoppedPerHour: Math.max(0, Math.floor(Number(out.summary.stoppedPerHour) || 0)),
        /* ── THE RECOVERY ROWS (Recovery Rule rev.2) ────────────────────────
           Stated by `src/core/combat-sim.js` (:723-:737) and read by
           `summaryFromAway` since b341 — but never sent, so the headline
           first-night mechanic rendered as "0 deaths" on every server-stated
           receipt and a night that ended four falls in looked identical to one
           that ran clean. `recoverLadder` is the ladder AS CHARGED, one entry
           per fall, and is sent verbatim because a card that regenerated the
           doubling from a count would be wrong (and harsher than the truth) on
           every night that met the novice clamp or the 64-minute cap. It is
           bounded by the same death cap the simulation is (~20 entries on the
           worst night), so it cannot grow the receipt without bound. */
        deaths: Math.max(0, Math.floor(Number(out.summary.deaths) || 0)),
        recoverMs: Math.max(0, Math.floor(Number(out.summary.recoverMs) || 0)),
        recoverRemainingMs: Math.max(0, Math.floor(Number(out.summary.recoverRemainingMs) || 0)),
        recoverLadder: Array.isArray(out.summary.recoverLadder)
          ? out.summary.recoverLadder.map((v: any) => Math.max(0, Math.floor(Number(v) || 0)))
          : [],
        /* ── THE RETREAT ROWS (Recovery Rule rev. 3) ────────────────────────
           `stoppedBy` above already carries 'retreat' — these three are what
           turn it into a sentence, and every one of them is STATED by
           src/core/combat-sim.js rather than inferred here:
             retreatMs        ms INTO the credited window at which the hero
                              pulled back. `null` (never 0) when there was no
                              retreat, because ZERO means "on the very first
                              tick" and a renderer testing truthiness would
                              report the worst possible night as a good one —
                              the same trap `dryMs` carries.
             retreatFoodless  was the bag empty AT THAT FALL? It decides WHICH
                              of the two ruled sentences the player reads
                              ("bring provisions" vs "out of your league"), and
                              it is NOT `autoEat.hadFood`, which is a
                              window-OPEN snapshot and belongs to a different
                              sentence.
             retreatFalls     the consecutive-fall count that tripped it, so the
                              copy cannot promise a rung the table no longer
                              charges.
           `idleMs` rides with them: the slice of the credited window that paid
           NOTHING because the hero had already gone home. Without it the card
           has to subtract two numbers whose flooring it does not own, which is
           exactly the inference b341 forbids. */
        retreatMs: (out.summary.stoppedBy === 'retreat'
                    && Number.isFinite(Number(out.summary.retreatMs)))
          ? Math.max(0, Math.floor(Number(out.summary.retreatMs))) : null,
        retreatFoodless: !!out.summary.retreatFoodless,
        retreatFalls: Math.max(0, Math.floor(Number(out.summary.retreatFalls) || 0)),
        idleMs: Math.max(0, Math.floor(Number(out.summary.idleMs) || 0)),
        blessed: out.summary.blessed,
        buffsPaused: out.summary.buffsPaused,
        featuredMs: out.summary.featuredMs,
        featuredDropMult: out.summary.featuredDropMult,
        /* THE BESTIARY CHARM THIS NIGHT WAS PRICED WITH (phase 2). Stated by the
           simulation, for the same reason `featuredDropMult` is: the card may
           not imply a bonus that was not applied, and it may not leave one
           unnamed either — a paid multiplier no receipt mentions is a number the
           player has to take on trust (Security review 2026-09-13, item 6).
           null / 1 on an unstudied class, which prints nothing. */
        charmClass: out.summary.charmClass ?? null,
        charmRank: Math.max(0, Math.floor(Number(out.summary.charmRank) || 0)),
        charmDropMult: out.summary.charmDropMult ?? 1,
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
