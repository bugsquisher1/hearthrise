// ============================================================================
// src/net/market-prices.js — WHAT IS ON THE MARKET, AS THE MARKET LAST SAID IT.
//
// The one reader behind every "price" line outside the Market's own rows (the
// item tooltip today). It authors nothing: its facts are counted over rows the
// server returned (uuid ids only — a local 'L…' row is this browser's own
// in-flight listing, never market data), and until a listings read has
// SUCCEEDED the answer is "unknown", which the caller renders as the pending
// mark — never as "none listed" (CLAUDE.md §6).
//
// Pure half first (fixtures in tests/market-prices.mjs), then a module-scope
// cache with a TTL and a coalesced refresh, the shape of market-history.js.
// 7-day statistics need a server projection; this file deliberately has none.
// ============================================================================
import { isListingId } from './gold.js?v=559';

export const LISTINGS_TTL_MS = 60 * 1000;

/** { listed, lowestAsk } over server rows for one item. */
export function listingFacts(listings, itemId, isServerId = isListingId) {
  let listed = 0, lowestAsk = null;
  for (const l of Array.isArray(listings) ? listings : []) {
    if (!l || l.itemId !== itemId || !isServerId(String(l.id))) continue;
    const ask = Number(l.askEach);
    if (!(ask > 0) || !(Number(l.qty) > 0)) continue;
    listed += 1;
    if (lowestAsk === null || ask < lowestAsk) lowestAsk = ask;
  }
  return { listed, lowestAsk };
}

/** The tooltip line, or null when the market has not been read (pending mark). */
export function marketLine(state, facts) {
  if (!state || state.status !== 'ok' || state.truncated) return null;
  if (!facts || !facts.listed) return 'None listed';
  return 'from ' + facts.lowestAsk.toLocaleString() + 'g · ' + facts.listed + ' listed';
}

export const RETRY_MS = 5 * 1000;   // a failing read is retried at most this often

let state = { status: 'unknown', at: 0, truncated: false };
let inFlight = null;
let lastAttempt = 0;

export function getListingsState() { return { status: state.status, at: state.at, truncated: state.truncated }; }

/** Called by market.js after every listings read: 'ok' with the row count, or 'error'. */
export function noteListingsRead(status, count, limit) {
  state = status === 'ok'
    ? { status: 'ok', at: Date.now(), truncated: Number(count) >= Number(limit) }
    : { status: 'error', at: Date.now(), truncated: false };
}

export function isListingsStale(nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return state.status !== 'ok' || (now - state.at) >= LISTINGS_TTL_MS;
}

/** Re-read the listings once when stale; concurrent callers share one read. */
export function refreshListingsIfStale() {
  if (inFlight || !isListingsStale() || Date.now() - lastAttempt < RETRY_MS) return inFlight;
  const M = (typeof window !== 'undefined') && window.HearthriseMarket;
  if (!M || typeof M.refreshFromBackend !== 'function') return null;
  lastAttempt = Date.now();
  inFlight = Promise.resolve().then(() => M.refreshFromBackend()).catch(() => false);
  inFlight.finally(() => { inFlight = null; });
  return inFlight;
}

/** Test seam — the suite drives the renderers through a known state. */
export function __setListingsState(next) {
  state = {
    status: (next && next.status) || 'unknown',
    at: Number(next && next.at) || (next && next.status === 'ok' ? Date.now() : 0),
    truncated: !!(next && next.truncated),
  };
  lastAttempt = Date.now();
  return getListingsState();
}

if (typeof window !== 'undefined') {
  window.HearthriseMarketPrices = {
    LISTINGS_TTL_MS,
    listingFacts, marketLine,
    getListingsState, noteListingsRead, isListingsStale, refreshListingsIfStale,
    __setListingsState,
  };
}
