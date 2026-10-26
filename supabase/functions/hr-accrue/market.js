// ============================================================================
// supabase/functions/hr-accrue/market.js — THE WEIGHHOUSE'S EDGE HALF (market
// build lane 2 of 5). Six verbs, each a transport for ONE engine-only RPC of
// supabase/migrations/2027-01-12-market-account.sql (lane 1, APPLIED; read its
// header first: the contract, the refusal taxonomy, the lock order).
//
//   market_list    { market: { source: 'bag'|'storage', item, qty, ask_each } }  -> hr_market_list
//   market_cancel  { market: { listing } }                                       -> hr_market_cancel
//   market_buy     { market: { listing, qty, max_each, deliver: 'storage'|'bag' } } -> hr_market_buy
//   market_browse  { market: { items?: [id ≤ 50], after?: id, limit?: 1..50 } } -> hr_market_browse
//   market_item    { market: { item } }                                         -> hr_market_item
//   market_mine    {}                                                           -> hr_market_mine
//
// ── WHY THIS FILE COMPUTES NOTHING ──────────────────────────────────────────
// Every rule, cap, price, fee, cut, floor, ceiling and the switch live in SQL,
// under the locks lane 1 takes. This module validates the SHAPE of what the
// player asked (refused BY NAME with lane 1's own shape codes, before any
// database work), spends the edge's rate token, settles the hero first when the
// verb touches its bag, forwards the bounded arguments field by field and hands
// back the RPC's answer verbatim. Edge decides WHAT SHOULD HAPPEN; Postgres
// decides WHETHER IT MAY — and for a trade between two accounts, Postgres decides
// everything else too.
//
// ── THE TWO PRICES THAT CROSS, AND WHY NEITHER IS TRUSTED ───────────────────
//   ask_each   the SELLER's price for their own goods (a declaration, like an
//              activity). hr_market_list bounds it between the shop's bid and
//              max(1,000, 100 x book) under its own catalogue; the buyer is
//              charged from the LOCKED listing row, never from any request.
//   max_each   the BUYER's ceiling: it can only REFUSE a buy (price_above_max),
//              never set what is paid, and it is in the intent name so a replay
//              cannot raise it.
// No qty, price, name, account or timestamp from a request reaches another
// player except as the bounded argument lane 1 re-checks.
//
// ── THE GATES ───────────────────────────────────────────────────────────────
//   · EVERY WRITE spends the registry's edge bucket (`shop`, intents.js) before
//     any database work: the cheap boolean gate for a Storage-only verb, the
//     gate + state read when the verb settles first. The RPC then spends its own
//     `market` counter (60/min, per account): defence in depth, never the
//     binding limit for an honest client.
//   · SETTLE FIRST ONLY ON THE BAG VERBS (threat model §4 #24): list from the
//     bag, buy into the bag. Storage is not an engine input, so list from
//     Storage, buy into Storage and cancel (its units go to Storage) never
//     settle and never carry a version (lane 1 checks p_version on the bag verbs
//     only). `collectsFirst` on the registry row is read by settleBeforeMutate.
//   · THE READS spend nothing here: the RPC's first statement is its own
//     `market_read` gate (hr_market_read_gate, 120/min per account).
//
// ── WHICH REFUSALS CARRY STATE ──────────────────────────────────────────────
// A market refusal wrote nothing (lane 1's protected block rolls back whole), so
// the client's last envelope is still the server's word. Only the codes that
// say "your view of your own bag, purse or Storage is stale" carry a FRESH
// envelope (MARKET_STATE_CODES), and every one of them is answered by lane 1
// after its `market` counter was spent (tests/market-edge.mjs E9 reads that off
// the SQL), so a refusal never buys a free hr_state_of read. Everything else —
// the switch, the shape, the catalogue facts — is answered bare.
//
// PURE ESM, Node + Deno, behind the injected one-statement `exec` seam. No `?v=`
// (not under src/**). SCALARS (and one text-cast array) only: no jsonb bind.
// ============================================================================

import { INTENT_ERRORS, rateBucketFor, requiresKey } from './intents.js';
import { gateAndRead } from './spend.js';
import { settleBeforeMutate } from './settle-first.js';
import { refusalBody } from './envelope.js';

export const LIST_VERB = 'market_list';
export const CANCEL_VERB = 'market_cancel';
export const BUY_VERB = 'market_buy';
export const BROWSE_VERB = 'market_browse';
export const ITEM_VERB = 'market_item';
export const MINE_VERB = 'market_mine';
export const MARKET_WRITE_VERBS = Object.freeze([LIST_VERB, CANCEL_VERB, BUY_VERB]);
export const MARKET_READ_VERBS = Object.freeze([BROWSE_VERB, ITEM_VERB, MINE_VERB]);

/* ── THE SIX STATEMENTS. One each, its own transaction, as `hr_engine`. The
   bind order IS lane 1's signature order; a guard reads these bytes. ─────── */
const LIST_SQL = `
  select public.hr_market_list($1::uuid, $2::int, $3::bigint, $4::uuid,
                               $5::text, $6::text, $7::bigint, $8::bigint) as res`;
const CANCEL_SQL = `
  select public.hr_market_cancel($1::uuid, $2::int, $3::uuid, $4::uuid) as res`;
const BUY_SQL = `
  select public.hr_market_buy($1::uuid, $2::int, $3::bigint, $4::uuid,
                              $5::uuid, $6::bigint, $7::bigint, $8::text) as res`;
/* `$3::text::text[]`: the ids are CATALOGUE_ID_RE-shaped (no comma, brace, quote
   or space), joined into an array literal and bound as TEXT, so every driver
   passes it through untouched (the ::text::jsonb rule's reason, for an array). */
const BROWSE_SQL = `
  select public.hr_market_browse($1::uuid, $2::int, $3::text::text[], $4::text, $5::int) as res`;
const ITEM_SQL = `
  select public.hr_market_item($1::uuid, $2::int, $3::text) as res`;
const MINE_SQL = `
  select public.hr_market_mine($1::uuid, $2::int) as res`;
/* The Storage-only verbs' gate: the boolean alone, never the state read. */
const GATE_SQL = 'select public.hr_rate_gate($1::uuid, $2::int, $3::text) as allowed';

export const MARKET_SQL = Object.freeze({
  [LIST_VERB]: LIST_SQL, [CANCEL_VERB]: CANCEL_SQL, [BUY_VERB]: BUY_SQL,
  [BROWSE_VERB]: BROWSE_SQL, [ITEM_VERB]: ITEM_SQL, [MINE_VERB]: MINE_SQL, gate: GATE_SQL,
});

/** The refusals that carry a FRESH envelope: the player's view of their own bag, purse or Storage is stale. */
export const MARKET_STATE_CODES = Object.freeze([
  'version_conflict', 'insufficient_item', 'insufficient_gold', 'bag_full', 'storage_full', 'storage_no_room',
]);

/** Lane 1's SHAPE codes (and the edge's), answered 400. */
const SHAPE_CODES = new Set([
  INTENT_ERRORS.MISSING_INTENT_ID, INTENT_ERRORS.BAD_SOURCE, INTENT_ERRORS.BAD_DELIVER, INTENT_ERRORS.BAD_QTY,
  INTENT_ERRORS.BAD_PRICE, INTENT_ERRORS.BAD_REQUEST, 'bad_slot',
]);

/** The HTTP status of a market answer's code. Pure. */
export function marketStatus(error) {
  if (SHAPE_CODES.has(error)) return 400;
  if (error === INTENT_ERRORS.RATE_LIMITED) return 429;
  if (error === INTENT_ERRORS.CLOSED) return 403;
  return 409;
}

const shape = (verb, error, detail) => ({
  status: 400, body: { ok: false, verb, error, ...(detail ? { detail } : {}) },
});

/** The bag verbs' settle: gate + read, then settle-before-mutate (the registry decides whether it settles). */
async function settleFirst(o) {
  const { exec, user, slot, verb } = o;
  const read = await gateAndRead({ exec, user, slot, verb });
  if (read.refusal) return { refusal: read.refusal };
  const settled = await settleBeforeMutate({
    exec, user, slot, verb, env: read.env, nowMs: read.nowMs, capMs: read.capMs,
  });
  if (!settled.proceed) return { refusal: settled.refusal };
  return { version: settled.version, collected: settled.collected };
}

/** The Storage-only verbs' gate: one boolean, the registry's bucket. */
async function gateOnly(o) {
  const { exec, user, slot, verb } = o;
  const [row] = await exec(GATE_SQL, [user, slot, rateBucketFor(verb)]);
  if (!row || row.allowed !== true) {
    return { refusal: { status: 429, body: { ok: false, verb, error: INTENT_ERRORS.RATE_LIMITED } } };
  }
  return { version: null, collected: null };
}

/**
 * THE SHARED BODY OF A MARKET WRITE: the gate (and the settle on a bag verb),
 * ONE statement, the server's answer verbatim.
 */
async function runWrite(o) {
  const { exec, user, slot, verb, touchesBag, sql, args, field } = o;
  const pre = touchesBag ? await settleFirst({ exec, user, slot, verb }) : await gateOnly({ exec, user, slot, verb });
  if (pre.refusal) return pre.refusal;
  const collected = pre.collected;

  const [row] = await exec(sql, args(pre.version));
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    const { ok: _ok, ...fields } = (res && typeof res === 'object') ? res : {};
    const refusal = { ...fields, error: (res && res.error) || 'market_failed', stage: 'market', collected };
    const status = marketStatus(refusal.error);
    if (!MARKET_STATE_CODES.includes(refusal.error)) {
      return { status, body: { ok: false, verb, ...refusal } };
    }
    return { status, body: await refusalBody({ exec, user, slot, verb, refusal, fallback: null }) };
  }
  /* THE RECEIPT IS THE SERVER'S OWN OBJECT (`listed` / `cancelled` / `bought`), NULL ON A REPLAY:
     this invocation moved nothing, and the envelope carries the true balance either way. */
  return {
    status: 200,
    body: {
      ...res,
      ok: true,
      verb,
      receipt: (res.replayed === true || !res[field]) ? null : res[field],
      collected,
      ...(res.replayed === true ? { replayed: true } : {}),
    },
  };
}

/* ── THE SHAPE PREDICATES, exported so the guard drives them with hostile values. ── */
const has = (m, k) => !!m && Object.prototype.hasOwnProperty.call(m, k);

/** LIST. The units leave the bag or Storage and become the escrow. */
export async function runMarketList(o) {
  const { exec, user, slot, intentId } = o;
  const m = o.market || null;
  if (requiresKey(LIST_VERB) && !intentId) return shape(LIST_VERB, INTENT_ERRORS.MISSING_INTENT_ID);
  if (!m) return shape(LIST_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'market' });
  if (!m.source) return shape(LIST_VERB, INTENT_ERRORS.BAD_SOURCE);
  if (!m.qty) return shape(LIST_VERB, INTENT_ERRORS.BAD_QTY);
  if (!m.ask_each) return shape(LIST_VERB, INTENT_ERRORS.BAD_PRICE);
  if (!m.item) return shape(LIST_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'item' });
  return runWrite({
    exec, user, slot, verb: LIST_VERB, touchesBag: m.source === 'bag', sql: LIST_SQL, field: 'listed',
    args: (version) => [user, slot, version, intentId, m.source, m.item, m.qty, m.ask_each],
  });
}

/** CANCEL. Any hero of the account; the units go to Storage. No settle, no version. */
export async function runMarketCancel(o) {
  const { exec, user, slot, intentId } = o;
  const m = o.market || null;
  if (requiresKey(CANCEL_VERB) && !intentId) return shape(CANCEL_VERB, INTENT_ERRORS.MISSING_INTENT_ID);
  if (!m || !m.listing) return shape(CANCEL_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'listing' });
  return runWrite({
    exec, user, slot, verb: CANCEL_VERB, touchesBag: false, sql: CANCEL_SQL, field: 'cancelled',
    args: () => [user, slot, intentId, m.listing],
  });
}

/**
 * BUY. The whole trade in one transaction, priced from the locked listing row.
 * ⚠ THE ARGUMENT LIST IS THE SECURITY BOUNDARY: which listing, how many, the
 *   buyer's ceiling, where the goods go. No price the buyer pays is in it.
 */
export async function runMarketBuy(o) {
  const { exec, user, slot, intentId } = o;
  const m = o.market || null;
  if (requiresKey(BUY_VERB) && !intentId) return shape(BUY_VERB, INTENT_ERRORS.MISSING_INTENT_ID);
  if (!m || !m.listing) return shape(BUY_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'listing' });
  if (!m.qty) return shape(BUY_VERB, INTENT_ERRORS.BAD_QTY);
  if (!m.max_each) return shape(BUY_VERB, INTENT_ERRORS.BAD_PRICE);
  if (!m.deliver) return shape(BUY_VERB, INTENT_ERRORS.BAD_DELIVER);
  return runWrite({
    exec, user, slot, verb: BUY_VERB, touchesBag: m.deliver === 'bag', sql: BUY_SQL, field: 'bought',
    args: (version) => [user, slot, version, intentId, m.listing, m.qty, m.max_each, m.deliver],
  });
}

/** A READ: one statement (the RPC gates itself), the answer verbatim. */
async function runRead(o) {
  const { exec, verb, sql, args } = o;
  const [row] = await exec(sql, args);
  const res = (row && row.res) || null;
  if (!res || res.ok !== true) {
    const { ok: _ok, ...fields } = (res && typeof res === 'object') ? res : {};
    const error = (res && res.error) || 'market_failed';
    return { status: marketStatus(error), body: { ok: false, verb, ...fields, error } };
  }
  return { status: 200, body: { ...res, ok: true, verb } };
}

/** BROWSE: the named items (≤ 50), or the items for sale now, a page at a time. */
export async function runMarketBrowse(o) {
  const { exec, user, slot } = o;
  const m = o.market || Object.create(null);
  /* An ABSENT subfield is `undefined` (request.js); a present unreadable one is `null`. */
  if (m.items === null || m.after === null || m.limit === null) {
    return shape(BROWSE_VERB, INTENT_ERRORS.BAD_REQUEST,
      { field: m.items === null ? 'items' : m.after === null ? 'after' : 'limit' });
  }
  const items = has(m, 'items') && Array.isArray(m.items) ? `{${m.items.join(',')}}` : null;
  return runRead({
    exec, verb: BROWSE_VERB, sql: BROWSE_SQL,
    args: [user, slot, items, has(m, 'after') && m.after !== undefined ? m.after : null,
      has(m, 'limit') && m.limit !== undefined ? m.limit : null],
  });
}

/** ONE ITEM'S PAGE: asks by price, the 30-day line, the last sales. */
export async function runMarketItem(o) {
  const { exec, user, slot } = o;
  const m = o.market || null;
  if (!m || !m.item) return shape(ITEM_VERB, INTENT_ERRORS.BAD_REQUEST, { field: 'item' });
  return runRead({ exec, verb: ITEM_VERB, sql: ITEM_SQL, args: [user, slot, m.item] });
}

/** MINE: the account's own listings, 30 days of its own history, today's caps (works with the switch off). */
export async function runMarketMine(o) {
  const { exec, user, slot } = o;
  return runRead({ exec, verb: MINE_VERB, sql: MINE_SQL, args: [user, slot] });
}
