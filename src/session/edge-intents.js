// ════════════════════════════════════════════════════════════════════════
// src/session/edge-intents.js — WHAT THE CLIENT MAY ASK THE ENGINE TO DO WITH ITEMS.
//
// PURE. The engine (supabase/functions/hr-accrue) already runs four item
// intents, each validated field by field in its request.js and priced from
// its own catalogue under the character lock:
//   equip             { equip: { <equip slot>: <item id> | null } }   wear / take off
//   vendor_sell_many  { lines: [{ item, qty }] }                       sell stacks to the shop
//   shop_buy          { offer, qty }                                   buy a server-priced offer
//   eat               { item }                                         eat one food now
//   sheet             {}                                               compute the character sheet
//   unlock_buy        { offer }                                        a house tier or room rung (the
//                                                                      server prices, gates and debits it)
//   set_activity      { activity: { kind: 'gather' | 'artisan', id, count? } | { kind: 'idle' } }  (count: a bench's "make N")
//                                                                      start a gathering node or a bench
//                                                                      recipe (town-work.js) / stop; the
//                                                                      engine collects before it switches
//   market_*          { market: { ... } }                             the Weighhouse (market lane 2): list,
//                                                                      cancel, buy and three reads, each with
//                                                                      the subfields MARKET_FIELDS names
// EDGE_INTENTS lists them with the ONLY fields each may carry. Every field is a
// NAME or a COUNT; no field is a price, a total or a balance, so a body built
// here can never tell the server what something costs — with ONE named
// exception: market_list's `ask_each`, the seller's own price for their own
// goods, which the server bounds between the shop's bid and its ceiling (the
// buyer is charged the server's listing row, never a number from a body;
// market_buy's `max_each` can only refuse). edgeBody refuses an unknown verb or
// field rather than drop it, so a typo is loud, never silent.
// tests/client-intent-surface.mjs pins this table and MARKET_FIELDS (IS-5): a
// new verb or field is a reviewed edit there as well as here.
// ════════════════════════════════════════════════════════════════════════

import { refusalOf } from './refusal.js?v=0.2.66';

export const EDGE_INTENTS = Object.freeze({
  equip: Object.freeze(['equip']),
  vendor_sell_many: Object.freeze(['lines']),
  shop_buy: Object.freeze(['offer', 'qty']),
  eat: Object.freeze(['item']),
  /* The character sheet: the slot and nothing else (hr-accrue character-sheet.js). */
  sheet: Object.freeze([]),
  /* Town work (src/shell/town-work.js): a gathering node or a bench recipe by id; idle stops it. */
  set_activity: Object.freeze(['activity']),
  /* A property tier or a room rung of the account's house, by offer id only (hr_unlock_buy prices it). */
  unlock_buy: Object.freeze(['offer']),
  /* The Weighhouse (hr-accrue market.js, 2027-01-12-market-account.sql): one `market` object each; mine carries none. */
  market_list: Object.freeze(['market']),
  market_cancel: Object.freeze(['market']),
  market_buy: Object.freeze(['market']),
  market_browse: Object.freeze(['market']),
  market_item: Object.freeze(['market']),
  market_mine: Object.freeze([]),
});

/* The `market` object's subfields per verb (hr-accrue request.js readMarket); a browse's are all optional. */
export const MARKET_FIELDS = Object.freeze({
  market_list: Object.freeze(['source', 'item', 'qty', 'ask_each']),
  market_cancel: Object.freeze(['listing']),
  market_buy: Object.freeze(['listing', 'qty', 'max_each', 'deliver']),
  market_browse: Object.freeze(['items', 'after', 'limit']),
  market_item: Object.freeze(['item']),
});
const MARKET_OPTIONAL = Object.freeze({ market_browse: true });

/* The engine's own bounds (request.js MAX_SELL_LINES, MAX_QTY, CATALOGUE_ID_RE, OFFER shape). */
export const EDGE_LIMITS = Object.freeze({ sellLines: 64, qty: 1000, marketQty: 100000000, marketPrice: 1000000000, marketItems: 50 });
const ID = /^[a-z0-9_]{1,64}$/;
const OFFER = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;
const SLOT = /^[a-z0-9_]{1,32}$/;
const qtyOk = (n) => Number.isInteger(n) && n >= 1 && n <= EDGE_LIMITS.qty;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const whole = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;

/* Each market subfield's bound: the engine's own (request.js readMarket). */
const MARKET_SUB = Object.freeze({
  source: (v) => v === 'bag' || v === 'storage',
  deliver: (v) => v === 'storage' || v === 'bag',
  item: (v) => typeof v === 'string' && ID.test(v),
  after: (v) => typeof v === 'string' && ID.test(v),
  qty: (v) => whole(v, EDGE_LIMITS.marketQty),
  ask_each: (v) => whole(v, EDGE_LIMITS.marketPrice),
  max_each: (v) => whole(v, EDGE_LIMITS.marketPrice),
  limit: (v) => whole(v, EDGE_LIMITS.marketItems),
  listing: (v) => typeof v === 'string' && UUID.test(v),
  items: (v) => Array.isArray(v) && v.length <= EDGE_LIMITS.marketItems && v.every((x) => typeof x === 'string' && ID.test(x)),
});

const FIELD = Object.freeze({
  equip(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const keys = Object.keys(v);
    if (!keys.length || keys.length > 15) return null;
    const out = {};
    for (const k of keys) {
      if (!SLOT.test(k) || !(v[k] === null || ID.test(v[k]))) return null;
      out[k] = v[k];
    }
    return out;
  },
  lines(v) {
    if (!Array.isArray(v) || !v.length || v.length > EDGE_LIMITS.sellLines) return null;
    const seen = new Set();
    const out = [];
    for (const l of v) {
      if (!l || !ID.test(l.item) || !qtyOk(l.qty) || seen.has(l.item)) return null;
      seen.add(l.item);
      out.push({ item: l.item, qty: l.qty });
    }
    return out;
  },
  offer: (v) => (typeof v === 'string' && v.length <= 64 && OFFER.test(v) ? v : null),
  qty: (v) => (qtyOk(v) ? v : null),
  /* The verb's own subfields only (MARKET_FIELDS); a missing one is refused unless the verb's are optional. */
  market(v, verb) {
    const allowed = Object.prototype.hasOwnProperty.call(MARKET_FIELDS, verb) ? MARKET_FIELDS[verb] : null;
    if (!allowed || !v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (Object.keys(v).some((k) => !allowed.includes(k))) return null;
    const out = {};
    for (const k of allowed) {
      if (v[k] === undefined) { if (MARKET_OPTIONAL[verb]) continue; return null; }
      if (!MARKET_SUB[k](v[k])) return null;
      out[k] = Array.isArray(v[k]) ? v[k].slice() : v[k];
    }
    return out;
  },
  item: (v) => (typeof v === 'string' && ID.test(v) ? v : null),
  /* Only the declarations the client makes: a gathering node or a bench recipe by id, or stop. Never `combat`
     (a hunt is hr_hunt_enter's) and never `training`. */
  activity(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (v.kind === 'idle' && (v.id === undefined || v.id === null)) return { kind: 'idle' };
    if (!((v.kind === 'artisan' || v.kind === 'gather') && typeof v.id === 'string' && ID.test(v.id))) return null;
    /* "Make N" (2026-12-01-bench-count.sql): a bench run may carry a whole count 1..100000; the server stops there. */
    if (v.count === undefined || v.count === null) return { kind: v.kind, id: v.id };
    return v.kind === 'artisan' && Number.isInteger(v.count) && v.count >= 1 && v.count <= 100000 ? { kind: v.kind, id: v.id, count: v.count } : null;
  },
});

/**
 * The engine request for one item intent, or null when the verb or a field is
 * not on EDGE_INTENTS or a value is out of the engine's bounds.
 * @param {number} slot
 * @param {string} verb
 * @param {object} fields
 * @param {string} intentId  the idempotency key (a uuid)
 */
export function edgeBody(slot, verb, fields, intentId) {
  const allowed = Object.prototype.hasOwnProperty.call(EDGE_INTENTS, verb) ? EDGE_INTENTS[verb] : null;
  if (!allowed || !fields || typeof fields !== 'object') return null;
  const body = { slot, verb, intentId };
  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return null;
  for (const k of allowed) {
    const v = FIELD[k](fields[k], verb);
    if (v === null) return null;
    body[k] = v;
  }
  return body;
}

/**
 * A READ through the engine (the market's browse / item / mine): the server's answer as it stands, or its refusal.
 * Nothing is applied: a read carries no envelope and changes nothing on screen by itself.
 * @param {{ ok:boolean, body:any, error?:string }} ans
 */
export function edgeRead(ans) {
  return ans && ans.ok && ans.body && ans.body.ok === true ? { ok: true, body: ans.body } : refusalOf(ans || {});
}
