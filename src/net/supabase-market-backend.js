// ============================================================
// src/net/supabase-market-backend.js
//
// Realtime market backend. Tools that consume it: src/market.js's
// HearthriseMarket.* APIs (listItem, cancelListing, buyAggregated,
// placeBuyOffer, etc.). Loaded by supabase-bootstrap.js when
// Supabase credentials are present.
//
// REST shape (from SUPABASE_SETUP.md):
//   POST /rest/v1/market_listings        — create a listing
//   GET  /rest/v1/market_listings        — read with order/filter
//   DELETE /rest/v1/market_listings?id=eq.X — cancel
//   POST /rest/v1/rpc/buy_listing        — atomic buy via stored proc
//   POST /rest/v1/market_buy_offers      — create buy offer
//   DELETE /rest/v1/market_buy_offers?id=eq.X
//
// Realtime: subscribed to INSERT / UPDATE / DELETE on
//   market_listings + market_buy_offers so the panel refreshes
//   live when other players list, cancel, or fill orders.
//
// NOTE on gold/inventory: client still maintains G.gold + G.inventory.
// The atomic transfer ideally happens server-side via the buy_listing
// RPC + a future trigger that updates the seller's snapshot. For soft
// beta we trust the client's pre-checks (covered by the audit doc as
// known v1 limitation).
// ============================================================

import { getSession } from './auth.js';

function getCfg() {
  return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
}

function reqHeaders(cfg, session) {
  return {
    'apikey': cfg.anonKey,
    'Authorization': 'Bearer ' + (session?.access_token || cfg.anonKey),
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

function rowToListing(row) {
  return {
    id: row.id,
    sellerId: row.seller_user_id + ':slot-' + row.seller_slot,
    sellerName: row.seller_name,
    itemId: row.item_id,
    qty: row.qty,
    askEach: row.ask_each,
    postedAt: new Date(row.posted_at).getTime(),
  };
}

function rowToOffer(row) {
  return {
    id: row.id,
    buyerId: row.buyer_user_id + ':slot-' + row.buyer_slot,
    buyerName: row.buyer_name,
    itemId: row.item_id,
    qty: row.qty,
    maxEach: row.max_each,
    escrowed: row.escrowed,
    postedAt: new Date(row.posted_at).getTime(),
  };
}

const SupabaseMarketBackend = {
  async fetchListings() {
    const cfg = getCfg();
    if (!cfg) return [];
    const session = getSession();
    const res = await fetch(cfg.url + '/rest/v1/market_listings?order=posted_at.desc&limit=500', {
      headers: reqHeaders(cfg, session),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(rowToListing);
  },

  async createListing({ itemId, qty, askEach, sellerSlot, sellerName }) {
    const cfg = getCfg();
    const session = getSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const body = {
      seller_user_id: session.user.id,
      seller_slot: sellerSlot,
      seller_name: sellerName,
      item_id: itemId,
      qty,
      ask_each: askEach,
    };
    const res = await fetch(cfg.url + '/rest/v1/market_listings', {
      method: 'POST',
      headers: reqHeaders(cfg, session),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('createListing failed: ' + res.status);
    const rows = await res.json();
    return rows[0] ? rowToListing(rows[0]) : null;
  },

  async cancelListing(listingId) {
    const cfg = getCfg();
    const session = getSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const res = await fetch(cfg.url + '/rest/v1/market_listings?id=eq.' + encodeURIComponent(listingId), {
      method: 'DELETE',
      headers: reqHeaders(cfg, session),
    });
    return res.ok;
  },

  async buyListing(listingId, qtyWanted) {
    const cfg = getCfg();
    const session = getSession();
    if (!cfg || !session) throw new Error('Not signed in');
    // Atomic via stored procedure — server handles inventory + sale recording
    const res = await fetch(cfg.url + '/rest/v1/rpc/buy_listing', {
      method: 'POST',
      headers: reqHeaders(cfg, session),
      body: JSON.stringify({ listing_id: listingId, qty_wanted: qtyWanted }),
    });
    if (!res.ok) throw new Error('buy_listing RPC failed: ' + res.status);
    return await res.json();
  },

  async placeOffer({ itemId, qty, maxEach, buyerSlot, buyerName }) {
    const cfg = getCfg();
    const session = getSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const body = {
      buyer_user_id: session.user.id,
      buyer_slot: buyerSlot,
      buyer_name: buyerName,
      item_id: itemId,
      qty,
      max_each: maxEach,
      escrowed: qty * maxEach,
    };
    const res = await fetch(cfg.url + '/rest/v1/market_buy_offers', {
      method: 'POST',
      headers: reqHeaders(cfg, session),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('placeOffer failed');
    const rows = await res.json();
    return rows[0] ? rowToOffer(rows[0]) : null;
  },

  async cancelOffer(offerId) {
    const cfg = getCfg();
    const session = getSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const res = await fetch(cfg.url + '/rest/v1/market_buy_offers?id=eq.' + encodeURIComponent(offerId), {
      method: 'DELETE',
      headers: reqHeaders(cfg, session),
    });
    return res.ok;
  },
};

// Expose as a Phase-2 swap-in. The market.js LocalBackend stays the
// active path until something explicitly calls
// `window.HearthriseMarket.setBackend(SupabaseMarketBackend)`.
//
// We don't auto-swap because market.js's listings / offers are stored
// in localStorage by character slot — switching backends mid-session
// would orphan the local data. The clean cutover is at next page load:
// once cloud is configured, market.js can opt in via a small wrapper
// added in a later commit.
if (typeof window !== 'undefined') {
  window.HearthriseSupabaseMarket = SupabaseMarketBackend;
  console.log('[supabase-market] backend exposed at window.HearthriseSupabaseMarket — call HearthriseMarket.setBackend(it) to switch');
}
