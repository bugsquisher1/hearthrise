// ============================================================================
// supabase/functions/hr-accrue/market.js — INTENTS #7, #8 AND #9. THE FIRST
// VALUE THAT CROSSES BETWEEN TWO PLAYERS.
//
// Read ./intents.js first (the contract), ./spend.js second (the shared half of
// a value intent), ./unlock-buy.js third (the template this file copies — a
// verb whose commit point is NOT hr_apply), and
// supabase/migrations/2026-08-17-market-v2.sql's header for the authority
// model. Nothing in the SQL contract is restated here; where this file and that
// one could disagree the comment says which line is being obeyed.
//
// ── WHY THIS FILE COMPUTES NOTHING ──────────────────────────────────────────
// Every other verb in this directory reads a catalogue and builds a number: a
// price, a bid, a grant. This one reads NOTHING and builds NO number, and that
// is the design rather than an omission. A market trade is bookkeeping in every
// dimension — an escrow, a price the seller already fixed, a fee rate, and TWO
// characters' rows moving in one transaction — and that last clause is why it
// cannot be an hr_apply delta at all: hr_apply is single-character BY
// CONSTRUCTION (one advisory lock, one version, one state row, one journal
// target), and a delta shape that could move a second player's gold would be
// the most dangerous key in the engine's vocabulary.
//
// So this module's whole job is:
//
//     validate the shape → spend the rate budget → read the envelope →
//     name a listing / an item / a count → render the server's answer
//
// and the three SECURITY DEFINER functions decide everything else for
// themselves: they take the locks in canonical order, refuse a stale version,
// re-validate every invariant, move the value, journal BOTH sides and return
// `hr_state_of`. Edge decides WHAT SHOULD HAPPEN; Postgres decides WHETHER IT
// MAY — and for the one verb that touches a stranger's row, Postgres decides
// rather more than that.
//
// ── THE ONE FIELD THAT IS A PRICE ───────────────────────────────────────────
// `ask` reaches hr_market_list as `p_ask_each`. The argument for why that is
// not a violation of "never trust a client value that crosses to another
// player" is in ./request.js's header and in the migration's, and it turns on
// one fact this file must not undermine: THE BUYER NEVER SENDS A PRICE. There
// is no `ask` in `market_buy`'s branch below, `readAsk` is never consulted for
// it, and hr_market_buy reads `ask_each` off the row it locked. If a price ever
// appears in the buy branch, the market is forgeable from devtools again.
//
// ⚠ NO hr_apply CALL SITE HERE, AND THAT IS NOT A GAP IN tests/delta-transport
//   .mjs T6. T6 walks the deployed directory and requires `::text::jsonb` on
//   the last argument of every hr_apply call site, because a pre-stringified
//   delta bound to a bare `$n::jsonb` is double-encoded by postgres.js (the
//   2026-08-15 P0). These three statements bind SCALARS ONLY — no jsonb
//   parameter exists for that rule to grade, and the double-encoding failure is
//   structurally unreachable when no parameter is json-typed. This is the U11
//   pattern unlock-buy.js established; tests/market-intent.mjs asserts it
//   positively instead (M-U11: no `::jsonb` in any statement in this file).
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { INTENT_ERRORS } from './intents.js';
import { CATALOGUE_ID_RE, UUID_RE, MAX_QTY, MAX_ASK } from './request.js';
import { gateAndRead, refusalBody, shapeRefusal } from './spend.js';

/** The verbs' own names — returned in every body, success and refusal alike, so
    one client dispatcher can route a response without remembering what it
    asked for. Frozen and exported because the client's transport reads this
    list rather than spelling three literals of its own. */
export const LIST_VERB = 'market_list';
export const CANCEL_VERB = 'market_cancel';
export const BUY_VERB = 'market_buy';
export const MARKET_VERBS = Object.freeze([LIST_VERB, CANCEL_VERB, BUY_VERB]);

/* ── THE THREE COMMIT POINTS ────────────────────────────────────────────────
   One statement each, its own transaction, run as `hr_engine` — the role that
   holds ZERO table privileges in every schema. SCALARS ONLY (see the T6 note
   above). The first four parameters are identical across all three and that is
   deliberate: (user, slot, version, intent) is the shape every writer in this
   architecture takes, so a reviewer comparing these three against hr_apply's
   call site is comparing like with like.

   `$3::bigint` is `env.version` — the version THIS call read. Each function
   refuses a stale one and RELEASES the key on that answer (b346 C1), which is
   the whole of our concurrency control. `$4::uuid` is the CLIENT's key: a
   listing is a tap, and the client is the only party that knows which retry is
   which. */
const LIST_SQL = `
  select public.hr_market_list($1::uuid, $2::int, $3::bigint, $4::uuid,
                               $5::text, $6::bigint, $7::bigint) as res`;
const CANCEL_SQL = `
  select public.hr_market_cancel($1::uuid, $2::int, $3::bigint, $4::uuid, $5::uuid) as res`;
const BUY_SQL = `
  select public.hr_market_buy($1::uuid, $2::int, $3::bigint, $4::uuid,
                              $5::uuid, $6::bigint) as res`;

/* ── SHAPE, AS PURE PREDICATES ──────────────────────────────────────────────
   Exported so tests/market-intent.mjs drives them with genuinely hostile values
   rather than asserting about the runner's behaviour and hoping the check is
   the reason. Each answers a fact about the REQUEST — never about a row. */

/** A canonical uuid naming a listing, or a refusal. */
export function listingRefusal(verb, listing) {
  if (typeof listing !== 'string' || listing.length !== 36 || !UUID_RE.test(listing)) {
    return { status: 400, body: { ok: false, verb, error: INTENT_ERRORS.BAD_LISTING } };
  }
  return null;
}

/** An item id the catalogue could plausibly hold. NOT a catalogue lookup: the
    tradeable allowlist is `hr_items`, generated from src/data/items.js, and
    hr_market_list checks it unconditionally under the lock. Answering
    `not_tradeable` from an in-process copy would be a second allowlist, and a
    second allowlist is the drift this whole program is organised around. */
export function itemRefusal(verb, item) {
  if (typeof item !== 'string' || !CATALOGUE_ID_RE.test(item)) {
    return { status: 400, body: { ok: false, verb, error: INTENT_ERRORS.BAD_ITEM } };
  }
  return null;
}

/** The ask. `readAsk` has already bounded it; this re-states the property every
    caller of it relies on — a positive integer inside the bound — because a
    parser that returned null and a runner that did not check would be a null
    reaching `$7::bigint` and a listing at a price of nothing. */
export function askRefusal(verb, ask) {
  if (!Number.isSafeInteger(ask) || ask < 1 || ask > MAX_ASK) {
    return { status: 400, body: { ok: false, verb, error: INTENT_ERRORS.BAD_ASK } };
  }
  return null;
}

/**
 * THE SHARED BODY OF A MARKET INTENT.
 *
 * The three verbs differ ONLY in their shape checks and in which statement they
 * run, so the sequence lives here once: gate + read, one statement at the
 * version that read returned, then the server's envelope verbatim. Written as
 * one runner rather than three because three copies of a value-transfer
 * sequence is three chances to get the version wrong in one of them — and the
 * one that got it wrong would be the one that moves a stranger's gold.
 *
 * @param o.exec     (text, params) => Promise<rows[]>, ONE statement per call
 * @param o.user     the VERIFIED JWT subject. Never a request field.
 * @param o.slot     the only request-derived value that reaches a query, and it
 *                   selects a row the caller already owns.
 * @param o.intentId the caller's canonical-uuid idempotency key
 * @param o.verb     which of the three
 * @param o.sql      that verb's statement
 * @param o.args     (user, slot, version, intentId) => the remaining bind values
 * @param o.field    the receipt key the RPC returns (`listed`/`cancelled`/`bought`)
 * @returns { status, body }
 */
async function runMarketIntent(o) {
  const { exec, user, slot, intentId, verb, sql, args, field } = o;

  /* (1) GATE + READ — spend.js's, so the bucket comes from INTENT_REGISTRY and
         an unknown one fails closed in the database. The shape checks have
         already run in the caller, BEFORE this line, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. */
  const read = await gateAndRead({ exec, user, slot, verb });
  if (read.refusal) return read.refusal;
  const env = read.env;

  /* (2) THE COMMIT. Nothing between the read and the statement computes
         anything: `env.version` goes straight back out, and every other bind is
         a NAME or a COUNT that arrived in the request. */
  const [row] = await exec(sql, args(user, slot, env.version, intentId));
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    /* NOTHING WAS APPLIED. Each function's protected block rolls back in full —
       escrow, credit, receipt and journal together — so "a rejected intent is
       retried with a NEW key" holds here without exception, and the two answers
       that are NOT stored under the key (`version_conflict`, released by the
       function itself) are exactly the ones a fresh read makes retryable. The
       code is the function's own, returned verbatim so it survives to the
       client and to hr_rejections. */
    return {
      status: 409,
      body: await refusalBody({
        exec, user, slot, verb,
        refusal: { error: (res && res.error) || 'market_failed', stage: 'market', detail: res ?? null },
        fallback: null,
      }),
    };
  }

  /* (3) THE ENVELOPE. `hr_state_of` verbatim — the client renders it and
         computes nothing. Gold, inventory and version all come out of `res`,
         which is the state AFTER the write, never out of the request.

         ⚠ THE RECEIPT IS THE SERVER'S OWN OBJECT, PASSED THROUGH, NOT REBUILT
           (Security C4, and unlock-buy.js's `charged` rule applied to a
           transfer). `bought` carries the gross, the tax, the per-unit price and
           the SELLER'S NAME, all read off the locked listing row inside the
           transaction that charged. A receipt assembled out here from the
           request's own numbers would be the copy the player SEES being the one
           copy nobody re-validated — and for a purchase, "you paid 5,000" and
           "the server took 50,000" disagreeing is indistinguishable from theft.

         ⚠ NULL ON A REPLAY, spend.js's rule and for spend.js's reason: this
           receipt describes THE REPLAYED TRADE ITSELF, and this invocation
           moved nothing. The envelope still carries the true balance, so the
           client can still settle its prediction — which is the half M6 in
           tests/market-v2.mjs exists to keep true. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb,
      receipt: (res.replayed === true || !res[field]) ? null : res[field],
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/**
 * LIST. Items leave the bag and become the escrow; the listing row IS the goods.
 *
 * @param o.item the item id — a NAME. The tradeable allowlist is the server's.
 * @param o.qty  a COUNT, bounded by request.js at MAX_QTY.
 * @param o.ask  THE PRICE PER UNIT. The only price in this file. See the header.
 */
export async function runMarketList(o) {
  const { exec, user, slot, intentId, item, qty, ask } = o;

  /* (0) SHAPE FIRST — refused before ANY database work. `shapeRefusal` is the
         one implementation of the key check and of the count check, so this
         verb cannot get either slightly different from the four that already
         use it. */
  const shape = shapeRefusal(LIST_VERB, intentId, qty);
  if (shape) return shape;
  const badItem = itemRefusal(LIST_VERB, item);
  if (badItem) return badItem;
  const badAsk = askRefusal(LIST_VERB, ask);
  if (badAsk) return badAsk;

  return runMarketIntent({
    exec, user, slot, intentId, verb: LIST_VERB, sql: LIST_SQL, field: 'listed',
    args: (u, s, v, k) => [u, s, v, k, item, qty, ask],
  });
}

/**
 * CANCEL. The escrow comes back, exactly once — the DELETE inside the function
 * is the arbiter, so a cancel racing the expiry sweep cannot return one stack
 * twice. Nothing about that is this file's problem, and that is the point.
 */
export async function runMarketCancel(o) {
  const { exec, user, slot, intentId, listing } = o;

  /* `qty` is passed as 1 and is not part of this verb's wire: a listing is
     cancelled whole (the escrow came out of the bag as one stack and goes back
     as one), and "cancel 3 of my listing" is not a thing the game can mean.
     shapeRefusal is still the one implementation of the key check. */
  const shape = shapeRefusal(CANCEL_VERB, intentId, 1);
  if (shape) return shape;
  const bad = listingRefusal(CANCEL_VERB, listing);
  if (bad) return bad;

  return runMarketIntent({
    exec, user, slot, intentId, verb: CANCEL_VERB, sql: CANCEL_SQL, field: 'cancelled',
    args: (u, s, v, k) => [u, s, v, k, listing],
  });
}

/**
 * BUY. The whole trade, in one transaction, touching a row that belongs to
 * somebody else.
 *
 * ⚠ THE ARGUMENT LIST IS THE SECURITY BOUNDARY. Two values cross it — WHICH
 *   LISTING and HOW MANY — and neither is a price, a total, a seller, a name or
 *   a timestamp. Everything the trade is priced from is read off the listing row
 *   under two advisory locks taken in canonical order. If a third value ever
 *   appears here, read the migration's §"THE ONE UNCOMFORTABLE FIELD" before
 *   adding it, because the whole cross-player argument rests on this list.
 */
export async function runMarketBuy(o) {
  const { exec, user, slot, intentId, listing, qty } = o;

  const shape = shapeRefusal(BUY_VERB, intentId, qty);
  if (shape) return shape;
  const bad = listingRefusal(BUY_VERB, listing);
  if (bad) return bad;

  return runMarketIntent({
    exec, user, slot, intentId, verb: BUY_VERB, sql: BUY_SQL, field: 'bought',
    args: (u, s, v, k) => [u, s, v, k, listing, qty],
  });
}

/** The three statements, exported so a guard reads the BYTES that deploy rather
 *  than a copy of them — the anchor tests/market-intent.mjs uses to assert that
 *  no `::jsonb` parameter has appeared and that the version is always the third
 *  bind. A guard that restates the SQL is a guard that agrees with itself. */
export const MARKET_SQL = Object.freeze({
  [LIST_VERB]: LIST_SQL, [CANCEL_VERB]: CANCEL_SQL, [BUY_VERB]: BUY_SQL,
});

/** Exported for the same reason: the bounds a client should refuse locally
 *  rather than burn a rate slot to be told. Re-exported, never re-typed. */
export const MARKET_BOUNDS = Object.freeze({ maxQty: MAX_QTY, maxAsk: MAX_ASK });
