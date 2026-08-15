// ============================================================================
// supabase/functions/hr-accrue/shop-buy.js — INTENT #2. GOLD OUT, ITEMS IN.
//
// "I'll take five Iron Swords."
//
// Read ./intents.js first (the contract) and ./set-activity.js second (intent
// #1, the shape). This is the first intent that MOVES VALUE, and it is the
// template the remaining gold verbs copy, so what it does NOT do matters as
// much as what it does:
//
//   · it never receives a price. The request names an OFFER (`equip.iron_sword`)
//     and a COUNT. The price comes from ./catalogue.js, derived from
//     src/data/shops.js, which is generated from the shop tables a designer
//     edits and drift-guarded at every hop.
//   · it never subtracts anything from anything. It PROPOSES a delta; hr_apply
//     takes the per-character advisory lock, re-checks the version, re-checks
//     every item id against the generated `hr_items`, refuses a negative
//     balance as `insufficient_gold`, journals, bumps the version and returns
//     the new state. Edge decides what should happen; Postgres decides whether
//     it may.
//   · it never reads the player's gold to decide whether they can afford it.
//     That would be a read-modify-write across a network hop, and the answer it
//     produced would be stale by the time it mattered. `insufficient_gold` is
//     hr_apply's, computed under the lock, and it is the ONLY answer to that
//     question in this system.
//
// ── WHY 99 OF THE 128 AUTHORED OFFERS ARE REFUSED, BY NAME ─────────────────
// This verb implements one shape: a single gold cost, item grants, repeatable,
// no conditions. Everything else — unlocks, gem prices, Bounty Marks (which
// have no server column at all), the platform's IAP, anything carrying a skill
// gate or a purchase cap — is refused as `offer_unsupported` WITH THE REASON
// ATTACHED. The eligibility predicate is in ./catalogue.js and it works on the
// offer's SHAPE, so an offer that grows a condition falls out of the sellable
// set by construction rather than being sold ungated.
// ============================================================================

import { INTENT_ERRORS, intentNameOf, catalogueGet } from './intents.js';
import { GOLD_OFFERS, OFFER_REFUSALS } from './catalogue.js';
import { runValueIntent, shapeRefusal } from './spend.js';

/** The verb's own name, used to build `journal.intent` and returned in every
    body so one client dispatcher can route a response without remembering what
    it asked for. */
export const VERB = 'shop_buy';

/**
 * Resolve an offer id to a PRICE, or to a refusal that says why.
 * Pure — no database, no clock, no request beyond the id.
 *
 * Order matters and is deliberate, exactly as it is in `validateDeclaration`:
 * a REAL offer this build cannot sell must be refused by NAME before the
 * "unknown" branch can mislabel it. A player told "no such offer" about the
 * Hearth Hall subscription files a bug against the wrong system.
 *
 * ⚠ `catalogueGet`, NEVER `GOLD_OFFERS[id]` (review C6). The offer id shape
 *   admits `constructor`, which is truthy on a plain object and whose `.gold`
 *   is `undefined` — a FREE purchase. Both catalogues here are null-prototype
 *   AND every lookup goes through the own-property helper; either alone would
 *   do, and this is the surface where "either alone" is not the standard.
 */
export function resolveOffer(offerId) {
  if (typeof offerId !== 'string' || offerId === '') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_OFFER };
  }
  const offer = catalogueGet(GOLD_OFFERS, offerId);
  if (offer) return { ok: true, offer };

  const why = catalogueGet(OFFER_REFUSALS, offerId);
  if (why !== undefined) {
    return {
      ok: false, status: 409, error: INTENT_ERRORS.OFFER_UNSUPPORTED,
      detail: { offer: offerId, reason: why },
    };
  }
  return { ok: false, status: 409, error: INTENT_ERRORS.UNKNOWN_OFFER, detail: { offer: offerId } };
}

/**
 * The delta. Every number in it came out of the catalogue except `qty`, which
 * came out of the request and was bounded by request.js before it got here.
 *
 * `gold` is NEGATIVE and `items` is POSITIVE, in ONE delta, because they are
 * one transaction: hr_apply applies the whole thing inside a single protected
 * block and rolls the WHOLE thing back on any rejection. A purchase that could
 * pay without delivering, or deliver without paying, would be two calls.
 *
 * NOTE THE KEYS IT DOES NOT CARRY: no `activity`, no `equip`, no `accrued_to`.
 * That is what makes `collectsFirst: false` correct rather than convenient, and
 * `guardStampKeys` re-checks it on this exact object before the apply.
 */
export function buyDelta(offer, qty) {
  const items = {};
  for (const g of offer.grant) items[g.id] = (items[g.id] || 0) + g.amount * qty;
  return {
    gold: -(offer.gold * qty),
    items,
    journal: {
      /* `shop` — the ledger's `kind` names WHICH SYSTEM moved the value, and
         the rollup groups on it. The DIRECTION is in the signed `gold` and in
         the `gold_in` stamp hr_apply computes from the delta (0 for a spend),
         and the specific transaction is in `intent`. `vendor_sell` files under
         the same kind for the same reason: both are the NPC shop. */
      kind: 'shop',
      intent: intentNameOf(VERB, offer.id, qty),
      /* Small and genuinely useful: the UNIT PRICE THE SERVER CHARGED, so a
         dispute about a purchase is resolvable from the ledger without
         reconstructing which build's catalogue was live. The total is
         `unit * qty` and is not stored twice. */
      meta: { offer: offer.id, qty, unit_gold: offer.gold },
    },
  };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      the only request-derived value that reaches a query, and
 *                    it selects a row the caller already owns.
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.offer     the offer id from request.js, or null
 * @param o.qty       the bounded integer count from request.js, or null
 * @returns { status, body } — the HTTP answer, built here so the test asserts
 *          the same object the shell serialises.
 */
export async function runShopBuy(o) {
  const { exec, user, slot, intentId, offer: offerId, qty } = o;

  /* (0) SHAPE FIRST — refused before ANY database work, so a malformed client
         cannot spend a real player's rate budget by looping on garbage. THIS is
         why these refusals carry no state envelope: reading one would be the
         database work this check exists to avoid. */
  const shape = shapeRefusal(VERB, intentId, qty);
  if (shape) return shape;

  const resolved = resolveOffer(offerId);
  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: { ok: false, verb: VERB, error: resolved.error, ...(resolved.detail || {}) },
    };
  }
  const offer = resolved.offer;

  /* (1)-(4) are identical for every value intent and live in ./spend.js. */
  const delta = buyDelta(offer, qty);
  return runValueIntent({
    exec, user, slot, verb: VERB, intentId,
    plan: {
      delta,
      /* THE RECEIPT, STATED BY THE SERVER. The client RENDERS this; it does not
         recompute it, and it has no copy of the price to recompute it from.
         `gold` is negative — the same sign the delta carried — so a renderer
         cannot accidentally show a purchase as income. */
      receipt: { offer: offer.id, name: offer.name, qty, gold: delta.gold, items: delta.items },
    },
  });
}
