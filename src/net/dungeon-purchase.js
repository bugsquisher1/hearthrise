// ============================================================================
// src/net/dungeon-purchase.js — THE CLASSIC-SCRIPT DOOR ONTO THE TRADE LEDGER.
//
// src/dungeons.js is a classic script (it runs inside an IIFE off `window` and
// cannot `import`), and src/net/item-ledger.js is a pure ESM leaf that must not
// know about `window` — that purity is what lets tests drive it from Node. This
// module is the twenty lines that join them, and it exists for the same reason
// the `window.__LEGACY_*` doors in legacy.js do.
//
// It publishes ONE function and holds no state of its own. If it never loads,
// `window.__recordItemTrade` is undefined, the call site in dungeons.js skips
// (it is `typeof === 'function'`-guarded), and behaviour is exactly what shipped
// before — the trade simply is not recorded. That is the safe direction for a
// bridge: absent means "no correction", never "half a correction".
// ============================================================================

import * as itemLedger from './item-ledger.js?v=429';

/**
 * Remember a client-authored trade so the next settle envelope cannot revert
 * one leg of it without the other.
 *
 * @param debit  {id: qty} already removed from the bag by the caller
 * @param credit {id: qty} already added to the bag by the caller
 * @param site   short label, for debugging
 */
export function recordItemTrade(debit, credit, site) {
  const G = (typeof window !== 'undefined') ? window.G : null;
  if (!G) return null;
  return itemLedger.record(G, debit, credit, site);
}

if (typeof window !== 'undefined') {
  window.__recordItemTrade = recordItemTrade;
  /* Exposed for the smoke suite and for an incident: reading the outstanding
     list is how you tell "the server has not caught up yet" apart from "the
     correction is stuck on". */
  window.__itemLedger = itemLedger;
}
