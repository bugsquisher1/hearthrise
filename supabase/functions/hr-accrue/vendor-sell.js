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
    partyOwnsWindow: o.partyOwnsWindow === true,
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

// ============================================================================
// b564 — `vendor_sell_many`. THE SAME SALE, N STACKS, ONE ANSWER.
//
// "Sell these 30 stacks." Sell Selected and the junk sweep. Before this verb the
// client had two bad options: pay gold locally and send nothing (the envelope
// took it back — CLAUDE.md §6), or send one `vendor_sell` per stack, which costs
// one `shop` rate token and one full settle EACH, empties the player's minute of
// buying, and stops half-sold past thirty stacks.
//
// What changes is the COUNT of round trips. Nothing about the authority does:
//   · every line is priced by `resolveSale` — the SAME function vendor_sell
//     uses, so a bid that differs by which button you pressed is impossible by
//     construction. No unit, price or total is read from the request; request.js
//     `readLines` copies exactly `item` and `qty` out of each line.
//   · ONE delta, ONE hr_apply: `{gold: Σ unit·qty, items: {id: -qty, …}}`. Stock
//     is hr_apply's answer under the per-character lock, and its protected block
//     is all-or-nothing — one short line (`insufficient_item`) refuses the WHOLE
//     batch and nothing moves. A sweep never half-applies.
//   · an unknown or unsellable line refuses the WHOLE intent BEFORE any database
//     work and names the line. A partial sale the player did not ask for is the
//     server authoring a different gesture.
//   · the daily `gold_in` budget is hr_apply's stamp of the delta's own gold, so
//     one big delta is charged exactly what N small ones would have been, and
//     the 50,000,000 per-call gold clamp refuses an oversized sweep by name.
//   · ONE ledger row, kind `shop` (the NPC shop, as vendor_sell), with every
//     line's unit price in `meta.lines` — the audit trail of what the server
//     paid and why, at one row per GESTURE, never one per stack.
// ============================================================================

/** The bulk verb's name. */
export const VERB_MANY = 'vendor_sell_many';

/**
 * A short, deterministic digest of the CANONICAL line set (sorted).
 *
 * WHY THE INTENT NAME NEEDS IT. hr_apply's `intent_mismatch` compares
 * `journal.intent` and nothing else, so whatever changes WHAT THE DELTA DOES
 * must be in the name (intentNameOf's rule: "the quantity is part of the
 * name"). For a list that is every (item, qty) pair, and spelling 64 of them out
 * would put ~4 KB in `player_intents.intent` and `player_ledger.intent` on every
 * sweep. So the name is `vendor_sell_many:<lines>:<digest>`, which makes one key
 * reused for a DIFFERENT sweep a loud `intent_mismatch` rather than a silent
 * `replayed:true` that sold nothing while the client believes it sold.
 *
 * FNV-1a 64 over ASCII ids and integers: pure, synchronous, identical in Node and
 * Deno (BigInt). It is NOT a security boundary and does not need to be — a
 * collision can only make a reused key answer `replayed`, which moves nothing.
 * The money is bounded by the delta, never by this string.
 */
export function linesDigest(lines) {
  const canon = [...lines]
    .map((l) => `${l.item}*${l.qty}`)
    .sort()
    .join(',');
  let h = 0xcbf29ce484222325n;
  const P = 0x100000001b3n;
  const M = 0xffffffffffffffffn;
  for (let i = 0; i < canon.length; i++) {
    h ^= BigInt(canon.charCodeAt(i));
    h = (h * P) & M;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * Resolve EVERY line, or refuse the whole batch naming the first bad one.
 * Pure — no database, no clock.
 *
 * @param lines  the `[{item, qty}]` from request.js readLines
 * @returns {ok:true, sales:[{item,name,unit,qty}]} | {ok:false, status, error, detail}
 */
export function resolveSaleLines(lines) {
  const sales = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const r = resolveSale(l.item);
    if (!r.ok) {
      return { ok: false, status: r.status, error: r.error, detail: { ...(r.detail || {}), line: i } };
    }
    sales.push({ item: r.item, name: r.name, unit: r.unit, qty: l.qty });
  }
  return { ok: true, sales };
}

/**
 * The ONE delta for the whole batch. Same signs as sellDelta: items NEGATIVE,
 * gold POSITIVE, in one object hr_apply applies inside one protected block.
 *
 * ⚠ EVERY `unit` HERE CAME FROM resolveSale (the catalogue). The parameter is
 *   the resolved SALES list, never the request's lines, so a price on the wire
 *   has no path into this function.
 */
export function sellManyDelta(sales) {
  const items = {};
  const lines = {};
  let gold = 0;
  for (const s of sales) {
    gold += s.unit * s.qty;
    items[s.item] = -s.qty;
    /* [qty, unit_gold] — what the server paid, per line, compact: ~30 bytes a
       line, ≤ MAX_SELL_LINES lines, one row per GESTURE. */
    lines[s.item] = [s.qty, s.unit];
  }
  return {
    gold,
    items,
    journal: {
      kind: 'shop',
      intent: intentNameOf(VERB_MANY, sales.length, linesDigest(sales)),
      meta: { lines },
    },
  };
}

/**
 * THE BULK INTENT.
 *
 * @param o.exec      (text, params) => Promise<rows[]>, one statement per call
 * @param o.user      the VERIFIED JWT subject. Never a request field.
 * @param o.slot      selects a row the caller already owns
 * @param o.intentId  the caller's canonical-uuid idempotency key
 * @param o.lines     request.js readLines output, or null
 * @returns { status, body }
 */
export async function runVendorSellMany(o) {
  const { exec, user, slot, intentId, lines } = o;

  /* (0) SHAPE FIRST — before any database work, so garbage spends no rate
     token. The key check is shapeRefusal's (qty 1 stands in: every line's qty
     was bounded by readLines, and a null list is refused just below). */
  const keyShape = shapeRefusal(VERB_MANY, intentId, 1);
  if (keyShape) return keyShape;
  if (!Array.isArray(lines) || lines.length === 0) {
    return { status: 400, body: { ok: false, verb: VERB_MANY, error: INTENT_ERRORS.BAD_LINES } };
  }

  const resolved = resolveSaleLines(lines);
  if (!resolved.ok) {
    return {
      status: resolved.status,
      body: { ok: false, verb: VERB_MANY, error: resolved.error, ...(resolved.detail || {}) },
    };
  }

  /* NOTHING IS CHECKED AGAINST THE PLAYER'S STOCK HERE — vendor_sell's rule.
     A line the player cannot cover comes back from hr_apply as
     `insufficient_item` and the WHOLE batch is refused under the lock. */
  const delta = sellManyDelta(resolved.sales);
  return runValueIntent({
    partyOwnsWindow: o.partyOwnsWindow === true,
    exec, user, slot, verb: VERB_MANY, intentId,
    plan: {
      delta,
      /* THE RECEIPT — the server's own numbers, line by line, and their sum.
         The client builds its toast from `gold` and Σ `lines[].qty` only. */
      receipt: {
        lines: resolved.sales.map((s) => ({
          item: s.item, name: s.name, qty: s.qty, unit_gold: s.unit, gold: s.unit * s.qty,
        })),
        gold: delta.gold,
      },
    },
  });
}
