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
//
// ════════════════════════════════════════════════════════════════════════
// b340 — THE CLIENT IS OFF DIRECT market_listings WRITES
//
// `2026-08-11-market-v2.sql` revokes every client write grant and drops every
// client write policy on the market tables: after it applies, the ONLY writers
// are market_list / market_cancel / market_buy. It has been BLOCKED on this
// file, because these three methods POSTed and DELETEd the table directly and
// applying the migration would have taken listing, cancelling and buying down
// on a live beta.
//
// This file now prefers the RPCs and keeps the v1 table write ONLY as the
// fallback for a server that does not have them yet — which is production
// today. The same shape src/features/leaderboards.js has used since b222, and
// the predicate + probe cache it turns on live in ONE place
// (src/net/server-rpc.js), not three.
//
// ⚠ WHAT THIS DOES **NOT** DO, so nobody reads it as more than it is:
//   · It does not close M1. Possession is still not checked in v1 — see the
//     header of 2026-08-12-market-offers-authority.sql, which explains at
//     length why no v1 possession check is worth writing.
//   · Under v2 the SERVER moves the gold and the items (player_state /
//     player_inventory) while src/market.js still moves G.gold and
//     G.inventory locally. Those are two disjoint universes until the client
//     rewire lands, and reconciling them is that rewire's job, not this
//     file's. market-v2 additionally needs player_inventory to actually be
//     populated before `market_list` can escrow anything — both are recorded
//     as remaining dependencies rather than quietly assumed away.
//
// THE FALLBACK IS A READ-BACK OF PROOF, NOT AN ASSUMPTION. It is taken only
// when the server ANSWERS "no such function" (404 / PGRST202 / 42883 / 42P01).
// A 401, a 403, a rate-limit refusal or a dropped connection is a REFUSAL and
// is surfaced as one — falling back on those would reopen the direct table
// write exactly when the server is unhappy.
// ════════════════════════════════════════════════════════════════════════

import { getSession } from './auth.js?v=342';

/* The market RPCs ship in ONE migration, so one capability governs all four
   decisions below (list / cancel / buy / collect). Probing them separately
   would let the client believe in half a market. */
const MARKET_V2 = 'market_v2';

function rpcSeam() {
  return (typeof window !== 'undefined' && window.HearthriseRpc) || null;
}
function marketAuthority() {
  const R = rpcSeam();
  return R ? R.capability(MARKET_V2) : 'unknown';
}
function noteAuthority(present) {
  const R = rpcSeam();
  if (R) R.note(MARKET_V2, present);
}
function tryV2() {
  const R = rpcSeam();
  return R ? R.shouldTry(MARKET_V2) : false;   // no seam → v1, never a silent half-state
}

/* The idempotency key. The three v2 RPCs refuse a null p_intent_id outright and
   answer `replayed:true` to a repeat, so a retried request can never double-
   list or double-buy. It is the ONLY client-authored value they accept, and it
   authorises nothing: identity, name, clock, price ceiling and escrow are all
   derived server-side. */
function intentId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    }
  } catch (e) {}
  return null;                                  // the server refuses it, loudly, which is correct
}

/* WHICH CHARACTER IS ACTING. multi-character.js owns the answer and publishes
   it (b339); this file must not parse the profile record, because a second
   reader of that record is a second thing to drift — the bug that had
   accrue.js/character.js hard-coded to slot 0 while the player was on slot 2. */
function activeSlot() {
  try {
    const P = window.HearthriseProfile;
    if (P && typeof P.activeSlot === 'function') {
      const s = P.activeSlot();
      if (Number.isInteger(s) && s >= 0 && s <= 5) return s;
    }
  } catch (e) {}
  return 0;
}

function getCfg() {
  return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
}

/**
 * b340: the session, read through the published seam when there is one.
 *
 * `window.HearthriseAuth.getSession` IS the imported `getSession` — auth.js
 * puts the same function object on both — so this is identical at runtime and
 * the import stays as the fallback for a boot order where the global has not
 * been published yet. The reason it exists at all: the ESM binding is
 * module-private and cannot be replaced, so every method below was unreachable
 * from a test that does not have a real signed-in Supabase session. b339's
 * lesson is that when a change spans a module and its caller you mutate the
 * CALLER — and a caller no test can drive is the bug, not an excuse.
 */
function currentSession() {
  try {
    const A = window.HearthriseAuth;
    if (A && typeof A.getSession === 'function') return A.getSession();
  } catch (e) {}
  return getSession();
}

function reqHeaders(cfg, session) {
  return {
    'apikey': cfg.anonKey,
    'Authorization': 'Bearer ' + (session?.access_token || cfg.anonKey),
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

/**
 * One POST to /rest/v1/rpc/<name>, and the ONE place that updates the market
 * capability from what the server actually answered.
 *
 * Returns { missing:true } when — and only when — the server proved the RPC is
 * not there. Everything else comes back as { status, ok, json } for the caller
 * to treat as a refusal.
 *
 * ⚠ NO ANONYMOUS RETRY. leaderboards.js retries a failed read with the anon key
 *   because a board is public and an expired token should cost the player their
 *   rank, not the whole screen. These are WRITES against the caller's own
 *   character; retrying one without the user's JWT would either be refused as
 *   not_signed_in or — worse, if a grant ever slipped — act as nobody.
 */
async function rpc(cfg, session, name, body) {
  const res = await fetch(cfg.url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: reqHeaders(cfg, session),
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  const R = rpcSeam();
  if (R && R.isMissingRpc(res.status, json)) {
    noteAuthority(false);
    return { missing: true, status: res.status, json: json };
  }
  /* ⚠ ONLY A 200 PROVES PRESENCE. A 401 is answered by PostgREST before the
     function name is ever resolved, so recording "present" on any non-404
     would let one expired token convince the client that market v2 is live —
     and the collectSales branch below would then stop paying out v1 sale
     proceeds for the rest of the session. Absence is proven; presence is
     proven; anything else leaves the capability exactly as it was. */
  if (res.ok) noteAuthority(true);
  return { missing: false, status: res.status, ok: res.ok, json: json };
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
    const session = currentSession();
    const res = await fetch(cfg.url + '/rest/v1/market_listings?order=posted_at.desc&limit=500', {
      headers: reqHeaders(cfg, session),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(rowToListing);
  },

  /**
   * b340: market_list first; the direct POST only if the server proves it has
   * no such function.
   *
   * The RPC accepts none of seller_user_id / seller_name / posted_at — they are
   * derived by the server — so the v2 branch does not send them. It answers
   * `{ok:true, listing_id}`, and the row this returns is reconstructed from
   * what the CALLER supplied plus that id, because src/market.js only reads
   * `.id` and `.sellerId` off it (pushListingToBackend). A refusal throws, so
   * market.js's revert path returns the escrowed items — the same contract the
   * v1 branch has always had.
   */
  async createListing({ itemId, qty, askEach, sellerSlot, sellerName }) {
    const cfg = getCfg();
    const session = currentSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const slot = Number.isInteger(sellerSlot) ? sellerSlot : activeSlot();

    if (tryV2()) {
      const r = await rpc(cfg, session, 'market_list', {
        p_slot: slot, p_item_id: itemId, p_qty: qty,
        p_ask_each: askEach, p_intent_id: intentId(),
      });
      if (!r.missing) {
        const out = r.json;
        if (!r.ok || !out || out.ok !== true) {
          throw new Error('market_list refused: ' + ((out && out.error) || r.status));
        }
        return {
          id: out.listing_id,
          sellerId: session.user.id + ':slot-' + slot,
          sellerName: sellerName, itemId: itemId, qty: qty, askEach: askEach,
          postedAt: Date.now(),
        };
      }
    }

    const body = {
      seller_user_id: session.user.id,
      seller_slot: slot,
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
    const session = currentSession();
    if (!cfg || !session) throw new Error('Not signed in');

    if (tryV2()) {
      const r = await rpc(cfg, session, 'market_cancel',
        { p_listing_id: listingId, p_intent_id: intentId() });
      if (!r.missing) return !!(r.ok && r.json && r.json.ok === true);
    }

    const res = await fetch(cfg.url + '/rest/v1/market_listings?id=eq.' + encodeURIComponent(listingId), {
      method: 'DELETE',
      headers: reqHeaders(cfg, session),
    });
    return res.ok;
  },

  async buyListing(listingId, qtyWanted) {
    const cfg = getCfg();
    const session = currentSession();
    if (!cfg || !session) throw new Error('Not signed in');

    /* market_buy is the whole trade in one transaction: it locks the listing,
       checks the buyer's gold, pays the seller and writes the receipt. Its
       reply carries the same `ok` envelope buy_listing does, which is what
       src/market.js's pushBuyToBackend reads, so the revert-on-refusal path is
       unchanged. */
    if (tryV2()) {
      const r = await rpc(cfg, session, 'market_buy', {
        p_slot: activeSlot(), p_listing_id: listingId,
        p_qty: qtyWanted, p_intent_id: intentId(),
      });
      if (!r.missing) {
        if (!r.ok) throw new Error('market_buy failed: ' + r.status);
        return r.json;
      }
    }

    // Atomic via stored procedure (row-locked decrement + sale-ledger insert).
    // b208: param names must match the SQL signature exactly (PostgREST).
    const res = await fetch(cfg.url + '/rest/v1/rpc/buy_listing', {
      method: 'POST',
      headers: reqHeaders(cfg, session),
      body: JSON.stringify({ p_listing_id: listingId, p_qty: qtyWanted }),
    });
    if (!res.ok) throw new Error('buy_listing RPC failed: ' + res.status);
    return await res.json();
  },

  /* b208: seller proceeds. Fetch my uncollected sales, then atomically flip
     collected=false→true (the filter guarantees a row only pays out once — the
     PATCH returns only rows it actually flipped).
   *
   * ⚠ b340 — THIS IS A v1-ONLY PATH, AND FINDING THAT OUT IS PART OF THE JOB.
   *   market-v2 recreates market_sales as an APPEND-ONLY RECEIPT with no
   *   `collected` column, no client UPDATE grant and no UPDATE policy, because
   *   the seller is paid into player_state.gold at sale time whether they are
   *   online or not. Under v2 there is nothing to collect and nothing here can
   *   collect it: the filter names a column that no longer exists.
   *
   *   That dependency is NOT in the handoff's list of what blocks market-v2 —
   *   the list named lines 73/93/107/120 and stopped. Left as-is, applying the
   *   migration would have turned a silent 400 into a minute-by-minute poll
   *   that fails forever, and the failure would be invisible (`if (!res.ok)
   *   return []`) rather than loud.
   *
   *   So: under a proven-v2 server this returns [] immediately, and the FIRST
   *   400 answered by an undefined column (42703) is itself the proof that v2
   *   is live — the capability heals without a probe request and without a
   *   reload. There is deliberately no "collect" fallback invented for v2;
   *   inventing one would be a client that pays itself.
   */
  async collectSales() {
    const cfg = getCfg();
    const session = currentSession();
    if (!cfg || !session) return [];
    if (marketAuthority() === 'present') return [];
    const base = cfg.url + '/rest/v1/market_sales?seller_user_id=eq.' + session.user.id + '&collected=eq.false';
    const res = await fetch(base + '&select=id,item_id,qty,gold_total,buyer_name', {
      headers: reqHeaders(cfg, session),
    });
    if (!res.ok) {
      /* 42703 = undefined_column. Only market-v2 can produce it here, and only
         by removing `collected` — so this is a POSITIVE identification of the
         v2 schema, not a guess at one. Any other failure (401, 5xx, offline)
         leaves the capability alone and is retried on the next minute tick. */
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (body && body.code === '42703') noteAuthority(true);
      return [];
    }
    const rows = await res.json();
    if (!rows.length) return [];
    const flip = await fetch(base, {
      method: 'PATCH',
      headers: reqHeaders(cfg, session),
      body: JSON.stringify({ collected: true }),
    });
    if (!flip.ok) return [];
    const flipped = await flip.json();          // only the rows we actually flipped
    return flipped.map(r => ({ id: r.id, itemId: r.item_id, qty: r.qty, goldTotal: +r.gold_total }));
  },

  // b208: realtime — nudge the market panel whenever listings change anywhere.
  subscribe(onChange) {
    const client = (window.HearthriseAuth && window.HearthriseAuth.getClient && window.HearthriseAuth.getClient());
    if (!client || this._sub) return;
    try {
      this._sub = client
        .channel('market-listings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_listings' },
          () => { try { onChange(); } catch (e) {} })
        .subscribe();
    } catch (e) {}
  },

  /* ⚠ DELIBERATELY STILL A DIRECT TABLE WRITE, and this is the one case where
     that is the RIGHT answer rather than debt.
     `2026-08-12-market-offers-authority.sql` is APPLIED, and it made every
     field below server-derived on the way in: buyer_user_id is pinned to
     auth.uid(), buyer_name is read out of profiles, posted_at is now(),
     buyer_slot is clamped, item_id must be a tradeable catalogue row, and
     `escrowed` is RECOMPUTED as qty * max_each (the value sent here is
     overwritten, and is kept only so the optimistic local model and the row
     agree). A posted offer is immutable, and there is a 25-row cap per
     character. market-v2 does not touch market_buy_offers at all — it
     recreates market_listings and market_sales only — so routing this through
     an RPC would buy nothing and would invent a third market authority model.
     Revisit when buy offers get a server-side matcher; not before. */
  async placeOffer({ itemId, qty, maxEach, buyerSlot, buyerName }) {
    const cfg = getCfg();
    const session = currentSession();
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
    const session = currentSession();
    if (!cfg || !session) throw new Error('Not signed in');
    const res = await fetch(cfg.url + '/rest/v1/market_buy_offers?id=eq.' + encodeURIComponent(offerId), {
      method: 'DELETE',
      headers: reqHeaders(cfg, session),
    });
    return res.ok;
  },

  // Test seams: the capability key, so the regression suite names the same
  // string this file does rather than a copy of it.
  _CAPABILITY: MARKET_V2,
  _authority: marketAuthority,
};

// b208: auto-install into market.js (which now HAS setBackend). Same retry
// pattern as the chat backend — the classic script may not have evaluated
// yet when this ESM runs.
if (typeof window !== 'undefined') {
  window.HearthriseSupabaseMarket = SupabaseMarketBackend;
  (function installMarket(attempt) {
    if (window.HearthriseMarket && typeof window.HearthriseMarket.setBackend === 'function') {
      window.HearthriseMarket.setBackend(SupabaseMarketBackend);
      console.log('[supabase-market] live backend installed');
      return;
    }
    if ((attempt || 0) >= 60) { console.warn('[supabase-market] HearthriseMarket never appeared'); return; }
    setTimeout(() => installMarket((attempt || 0) + 1), 500);
  })(0);
}
