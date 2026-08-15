// ============================================================================
// supabase/functions/hr-accrue/vendor-sell.js — INTENT #3. ITEMS OUT, GOLD IN.
//
// "Sell 200 Normal Logs."
//
// The mirror of ./shop-buy.js, and the more dangerous half: this verb MINTS
// GOLD. A purchase can only ever destroy currency, so the worst case of a bug
// in it is a player who lost money. A sale creates it, which means every
// mistake here is inflation in a shared economy — the market, the leaderboards
// and the clan treasuries all price against the same gold.
//
// Three things carry that weight, and none of them is in this file:
//   · the price is the SERVER's. The request names an ITEM and a COUNT. The bid
//     is `vendorPriceOf(ITEMS, id)` in ./catalogue.js, computed from the item's
//     own book value and its `raw` flag.
//   · the ITEM MUST EXIST IN THE PLAYER'S INVENTORY, and that is hr_apply's
//     answer, not ours. It takes the per-character advisory lock, does
//     `select qty ... for update`, and refuses `insufficient_item` if the
//     result would go negative. This file DELIBERATELY DOES NOT pre-check the
//     inventory it can see in the state envelope: that read is stale the
//     instant it returns, and a second opinion that can disagree with the
//     authority is worse than no opinion.
//   · the gold it mints is charged against the 25,000,000/day gross-inflow
//     budget (hr_day_budget_check), stamped by hr_apply from the delta itself.
//     There is no delta key for the stamp, so a compromised engine cannot
//     understate its own consumption.
//
// ── WHY THE PRICE IS COMPUTED HERE AND NOT IN SQL ──────────────────────────
// `vendor.sell` is one of the six DERIVED_PRICES in src/data/shops.js — a
// formula, not a row — and the catalogue's own header says it is "DERIVABLE
// TODAY... the cheapest of the six to close". Both inputs are already vendored
// into this payload: `ITEMS[id].v` and `ITEMS[id].raw`, the latter DERIVED in
// items.js from every tree/rock/fishing-spot/crop `prod` plus an explicit
// monster-drop list. Restating either in PL/pgSQL would be a second copy of 426
// items, which is the failure this whole program exists to prevent.
// ============================================================================

import { INTENT_ERRORS, intentNameOf, catalogueGet } from './intents.js';
import { vendorPriceOf } from './catalogue.js';
import { ITEMS } from '../../../src/data/items.js';
import { runValueIntent, shapeRefusal } from './spend.js';

/** The verb's own name. */
export const VERB = 'vendor_sell';

/**
 * Resolve an item id to the vendor's BID, or to a refusal that says why.
 * Pure — no database, no clock.
 *
 * The two refusals are separate on purpose. "There is no such item" and "the
 * vendor will not buy that" are different facts, and 17 of the 426 items are
 * genuinely worth 0 to the vendor (quest keys, sigils, tokens). Collapsing them
 * would tell a player their Bone Key does not exist.
 *
 * ⚠ `catalogueGet`, NEVER `ITEMS[id]` (review C6). The id shape is
 *   /^[a-z0-9_]{1,64}$/, which matches `constructor` and `__proto__`; both are
 *   truthy on ITEMS, and `Object.constructor.v` is `undefined` → `Number(...)`
 *   → 0, so a truthiness guard here would fall through to "not sellable"
 *   rather than "unknown" — a wrong answer today and a free sale the day the
 *   ordering changes. `vendorPriceOf` uses the same helper independently.
 */
export function resolveSale(itemId) {
  if (typeof itemId !== 'string' || itemId === '') {
    return { ok: false, status: 400, error: INTENT_ERRORS.BAD_ITEM };
  }
  const item = catalogueGet(ITEMS, itemId);
  if (item === undefined) {
    return { ok: false, status: 409, error: INTENT_ERRORS.UNKNOWN_ITEM, detail: { item: itemId } };
  }
  const unit = vendorPriceOf(ITEMS, itemId);
  if (!(unit > 0)) {
    return {
      ok: false, status: 409, error: INTENT_ERRORS.ITEM_NOT_SELLABLE,
      detail: { item: itemId },
    };
  }
  return { ok: true, item: itemId, name: item.n || itemId, unit };
}

/**
 * The delta. `items` is NEGATIVE and `gold` is POSITIVE, in ONE delta — hr_apply
 * applies both inside one protected block, so there is no ordering in which the
 * gold lands and the stock does not.
 *
 * ⚠ THE GOLD IS `unit * qty` AND `unit` CAME FROM THE CATALOGUE. If a `unit`
 *   ever reaches this function from the request, the game has an infinite gold
 *   faucet; that is why the parameter is a resolved SALE object built by
 *   `resolveSale` and not a number.
 */
export function sellDelta(sale, qty) {
  return {
    gold: sale.unit * qty,
    items: { [sale.item]: -qty },
    journal: {
      /* `shop`, the same kind shop_buy uses: the ledger's `kind` names the
         SYSTEM, and both are the NPC shop. Direction and amount live in the
         signed `gold` and in hr_apply's `gold_in` stamp (which is non-zero
         here, and is what the daily budget sums over); `intent` names the
         specific sale. `trade` is deliberately left for the PLAYER market. */
      kind: 'shop',
      intent: intentNameOf(VERB, sale.item, qty),
      meta: { item: sale.item, qty, unit_gold: sale.unit },
    },
  };
}

/**
 * THE INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      selects a row the caller already owns
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.item      the item id from request.js, or null
 * @param o.qty       the bounded integer count from request.js, or null
 * @returns { status, body }
 */
export async function runVendorSell(o) {
  const { exec, user, slot, intentId, item: itemId, qty } = o;

  /* (0) SHAPE FIRST — before any database work. */
  const shape = shapeRefusal(VERB, intentId, qty);
  if (shape) return shape;

  const resolved = resolveSale(itemId);
  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: { ok: false, verb: VERB, error: resolved.error, ...(resolved.detail || {}) },
    };
  }

  /* NOTHING IS CHECKED AGAINST THE PLAYER'S STOCK HERE. See the header: that is
     hr_apply's answer, under the lock, and a second opinion that can disagree
     with the authority is worse than none. A sale of an item the player does
     not have comes back `insufficient_item` with `have` and `need` attached. */
  const delta = sellDelta(resolved, qty);
  return runValueIntent({
    exec, user, slot, verb: VERB, intentId,
    plan: {
      delta,
      /* THE RECEIPT. `gold` positive, `items` negative — the signs the delta
         carried, so a renderer cannot show a sale as a purchase. The client has
         no copy of the bid and does not compute this. */
      receipt: {
        item: resolved.item, name: resolved.name, qty,
        unit_gold: resolved.unit, gold: delta.gold,
      },
    },
  });
}
