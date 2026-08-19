// ============================================================================
// supabase/functions/hr-accrue/gold-ladder-catalogue.js — WHICH GOLD-LADDER
// OFFER IDS `unlock_buy` MAY FORWARD (slices 2 & 3: worker_hire / farm_land / bank).
//
// ── WHAT THIS FILE IS, AND IS NOT ───────────────────────────────────────────
// It is the Edge's FORWARD decision and nothing else. Exactly like
// unlock-catalogue.js it carries NO price: hr_unlock_buy reads the price, the
// rung, the ceiling and the property-tier prerequisite for itself out of
// public.hr_unlock_offers (seeded by 2026-08-19-gold-spend-slices-2-3.sql from
// the SAME manifest this file imports). The Edge cannot propose a cheaper worker
// or a bigger bank because it cannot propose a number at all — it can only name
// an offer id the manifest already knows.
//
// ── WHY A SEPARATE MODULE FROM unlock-catalogue.js ──────────────────────────
// unlock-catalogue.js derives its sellable/refused maps from src/data/shops.js,
// where worker_hire/farm_land/bank do not exist (bank is not a shop offer at
// all; the worker/plot SHOP offers are a different, count-shaped id space that
// stays refused). Folding these ladders into that module would either restate
// the shop predicate or collide the two id spaces. Keeping them here, checked
// with a Set BEFORE the shop maps, keeps both id spaces disjoint and each
// answer unambiguous.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { GOLD_LADDER_OFFER_IDS } from '../../../src/data/gold-ladders.js';

/** Set membership is safe against the `constructor` id shape that a bare object
    lookup admits (unlock-buy.js review C6): Set.prototype.has consults no
    prototype chain. */
const IDS = new Set(GOLD_LADDER_OFFER_IDS);

/** True iff `offerId` is a gold-ladder offer this build forwards to
    hr_unlock_buy. The RPC still re-validates existence, price, rung order, the
    ceiling and the tier gate — this only decides whether the Edge sends it. */
export function isGoldLadderOffer(offerId) {
  return typeof offerId === 'string' && offerId !== '' && IDS.has(offerId);
}
