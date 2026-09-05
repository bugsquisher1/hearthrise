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
import { computeAccrual, levelsOf, degradeStep, accrueWorkers, accrueRested } from './accrual.js';
/* THE DORMANT COMPANION-XP ARM SWITCH. Threaded into computeAccrual's input as
   `companionXpBacked` (A14-mirrored in set-activity.js). False → the engine
   emits no companion_xp op; the client keeps awarding. One line to arm. */
import { COMPANION_XP_SERVER_BACKED } from '../../../src/core/companion-xp.js';
import { verifyJwt, bearerOf, gotrueIntrospector } from './jwt.js';
import { parseIntent } from './request.js';
import { intentIdFor, isKnownVerb, INTENT_ERRORS, rateBucketFor } from './intents.js';
import { runSetActivity } from './set-activity.js';
import { runShopBuy } from './shop-buy.js';
import { runVendorSell } from './vendor-sell.js';
import { runClaimReward } from './claim-reward.js';
import { runUnlockBuy } from './unlock-buy.js';
import { runDungeonSettle } from './dungeon-settle.js';
import { runQuartermasterBuy } from './quartermaster-buy.js';
import { runMarketList, runMarketCancel, runMarketBuy } from './market.js';
import { runEquip } from './equip.js';
import { runEnchant } from './enchant.js';
import { runEat } from './eat.js';
import { withCors } from './cors.js';
import { PAYLOAD_SHA256 } from './payload-hash.js';
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from './catalogue.js';
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
       devtools and the food is duped from devtools. */
    if (intent.verb === 'eat') {
      const out = await runEat({
        exec,
        user,                       // the VERIFIED subject, never a body field
        slot,
        intentId: intent.intentId,
        item: intent.item,
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
         `accrued_to` is written as exactly that string (accrual.js: the delta's
         `accrued_to: new Date(nowMs).toISOString()`), and `read.now` carries
         Postgres's MICROSECONDS — so passing the raw value would leave a
         sub-millisecond band above the watermark and below the bound. Deriving
         both from `nowMs` makes them equal by construction rather than by
         rounding luck.
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
    const skills: Record<string, number> = {};
    for (const k of Object.keys(env.skills || {})) skills[k] = Number(env.skills[k].xp) || 0;

    const capMs = Number(read.cap_ms) || 0;
    const equipment = env.equipment || {};

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
      accruedToMs,
      /* THE COMBAT-XP WATERMARK (2026-08-31-combat-xp-credit.sql). Advanced ONLY
         by hr_credit_combat_xp; the settle reads it here and credits combat XP
         only for the window at/after it (accrual.js xpEligibleFromMs), so it never
         re-mints XP a live credit already applied. Absent column → 0 → the split
         is inert and the settle pays the whole window exactly as before. */
      combatXpAccruedToMs: st.combat_xp_accrued_to ? new Date(st.combat_xp_accrued_to).getTime() : 0,
      /* NULL, not a fallback to accruedToMs (b345). `active_since` is the second
         watermark and substituting the first one for it removes the clamp at
         exactly the moment it is needed — a `start_activity` that forgot to send
         `accrued_to` is the case it exists for. computeAccrual now refuses a
         payable activity with no `active_since` by name (`no_active_since`). */
      activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : null,
      activeKind: st.active_kind,
      activeId: st.active_id,
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
      /* THE CONSUMPTION CARRY (design item E2). `?? null` for exactly the
         reason above, and it resolves to null TODAY because
         `player_state.ammo_carry` does not exist yet — the engine then starts
         each span from an empty carry and omits the delta key, which is
         byte-for-byte the pre-E1 behaviour. Wired now so the migration that
         adds the column is one SQL file rather than SQL plus a second Edge
         redeploy. Mirrors set-activity.js field for field (A14). */
      ammoCarry: st.ammo_carry ?? null,
      /* THE IN-FLIGHT FIGHT (Phase 0). `?? null` and NOT `?? {}`, for exactly
         the reason above: null means the column does not exist on this
         database, the engine starts every span at full monster HP and omits
         the `fight` delta key, which is the pre-Phase-0 behaviour. With the
         column, a settle RESUMES the fight instead of restarting it — without
         it, any monster whose time-to-kill exceeds the span pays zero forever
         (docs/design/live-settlement.md §0).
         Mirrors set-activity.js field for field (A14). */
      fight: st.fight ?? null,
      /* THE WEAPON ENCHANT (ELEMENTS v1). `{ <equip_slot>: <element> }` from
         hr_state_of, or `{}` when the column is absent. Unlike tool_carry/fight
         it is a READ-ONLY input to `equipmentStats(equipment, items, enchant)` —
         no delta key is derived from it — so `|| {}` is safe and there is no
         self-configuring-null concern. It is what makes an AWAY fight see the
         element (accrual.js `weakness`). Mirrors set-activity.js (A14). */
      enchant: env.enchant || {},
      /* THE COMBAT STYLE (2026-08-24-combat-style.sql). `player_state.combat_style`,
         projected INSIDE the state object, read off the row hr_apply locks —
         never from the request body, which carries no style field at all. It is
         what makes an away fight train the skill the player picked; without it
         the engine settled every styled grant to Attack (the P0 Paione
         reported). `?? null` and NOT `?? {}`: null means the column does not
         exist on this database, and `resolveStyle(weaponType, null)` is exactly
         the pre-migration behaviour — the column's PRESENCE is the switch. Like
         `enchant` it is READ-ONLY input (no delta key is derived from it), so
         there is no self-configuring-null concern beyond that.
         Mirrors set-activity.js field for field (A14). */
      combatStyle: st.combat_style ?? null,
      /* THE COMPANION-XP ARM SWITCH (dormant). A deploy-time constant, NOT a
         request value. False today → the engine writes no companion_xp op.
         Mirrors set-activity.js field for field (A14). */
      companionXpBacked: COMPANION_XP_SERVER_BACKED,
      /* THE PERMANENT PERK STACK. Server-owned unlock rows only — the room
         rung, the plot buildings, the property tier. `null` means the channel
         is absent or the character has bought nothing, and the engine reads
         that as 0 for every key, which is the `zeroBonus` behaviour that
         shipped before b349. Nothing here comes from the request body. */
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
      return json({ ok: true, accrued: false, reason: out.reason, version: env.version, now: env.now,
        ...(Array.isArray((env as Record<string, any>).workers) ? { workers: (env as Record<string, any>).workers } : {}) });
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

    let res = await apply(mergeAux(out.delta), 0);
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
      res = await apply(mergeAux(out.delta), attempt);
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
