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
//   set_activity      { activity: { kind: 'artisan', id } | { kind: 'idle' } }
//                                                                      start a bench recipe (the
//                                                                      Inventory's Bury) / stop; the
//                                                                      engine collects before it switches
// EDGE_INTENTS lists them with the ONLY fields each may carry. Every field is a
// NAME or a COUNT; no field is a price, a total or a balance, so a body built
// here can never tell the server what something costs. edgeBody refuses an
// unknown verb or field rather than drop it, so a typo is loud, never silent.
// tests/client-intent-surface.mjs pins this table (IS-5): a new verb or field
// is a reviewed edit there as well as here.
// ════════════════════════════════════════════════════════════════════════

export const EDGE_INTENTS = Object.freeze({
  equip: Object.freeze(['equip']),
  vendor_sell_many: Object.freeze(['lines']),
  shop_buy: Object.freeze(['offer', 'qty']),
  eat: Object.freeze(['item']),
  /* The character sheet: the slot and nothing else (hr-accrue character-sheet.js). */
  sheet: Object.freeze([]),
  /* Bury (and the other Prayer offerings) is the artisan recipe; idle stops it. */
  set_activity: Object.freeze(['activity']),
  /* The viewed character's near-live hunt: the slot and nothing else (hr-accrue hunt_watch). */
  hunt_watch: Object.freeze([]),
});

/* The engine's own bounds (request.js MAX_SELL_LINES, MAX_QTY, CATALOGUE_ID_RE, OFFER shape). */
export const EDGE_LIMITS = Object.freeze({ sellLines: 64, qty: 1000 });
const ID = /^[a-z0-9_]{1,64}$/;
const OFFER = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){1,3}$/;
const SLOT = /^[a-z0-9_]{1,32}$/;
const qtyOk = (n) => Number.isInteger(n) && n >= 1 && n <= EDGE_LIMITS.qty;

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
  item: (v) => (typeof v === 'string' && ID.test(v) ? v : null),
  /* Only the two declarations the client makes: a bench recipe by id, or stop. */
  activity(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (v.kind === 'idle' && (v.id === undefined || v.id === null)) return { kind: 'idle' };
    return v.kind === 'artisan' && typeof v.id === 'string' && ID.test(v.id) ? { kind: 'artisan', id: v.id } : null;
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
    const v = FIELD[k](fields[k]);
    if (v === null) return null;
    body[k] = v;
  }
  return body;
}
