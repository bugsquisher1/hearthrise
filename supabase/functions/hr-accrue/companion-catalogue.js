// ============================================================================
// supabase/functions/hr-accrue/companion-catalogue.js — WHICH COMPANION-UNLOCK
// OFFER IDS `unlock_buy` MAY FORWARD (slice 4: shop companions).
//
// ── WHAT THIS FILE IS, AND IS NOT ───────────────────────────────────────────
// The Edge's FORWARD decision and nothing else — the twin of
// gold-ladder-catalogue.js. It carries NO price, NO rung and NO skill gate:
// hr_unlock_buy reads the price, the ceiling, the property-tier prerequisite AND
// the new skill prerequisite (req_skill / req_skill_level) for itself out of
// public.hr_unlock_offers (seeded by 2026-08-19-companion-unlocks.sql from the
// SAME manifest this file imports). The Edge cannot propose a cheaper companion
// or forge a skill level, because it cannot propose a number at all — it can
// only name an offer id the manifest already knows.
//
// ── WHY A SEPARATE MODULE FROM gold-ladder-catalogue.js ─────────────────────
// Different manifest, different id namespace (`companion.*`). Keeping the two
// Sets separate, each checked before the shop maps, keeps every id space
// disjoint and every answer unambiguous.
//
// PURE ESM. No I/O, no Deno, no globals.
// ============================================================================

import { COMPANION_OFFER_IDS } from '../../../src/data/companion-unlocks.js';

/** Set membership, safe against the `constructor` id shape a bare object lookup
    admits (unlock-buy.js review C6): Set.prototype.has consults no prototype
    chain. */
const IDS = new Set(COMPANION_OFFER_IDS);

/** True iff `offerId` is a companion-unlock offer this build forwards to
    hr_unlock_buy. The RPC still re-validates existence, price, rung order, the
    ceiling and BOTH prerequisites — this only decides whether the Edge sends
    it. */
export function isCompanionOffer(offerId) {
  return typeof offerId === 'string' && offerId !== '' && IDS.has(offerId);
}
