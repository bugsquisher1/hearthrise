// ============================================================================
// src/net/market-history.js — YOUR OWN TRADE LEDGER (b361).
//
// THE GAP THIS FILLS. Since market-v2 a listing sells SERVER-SIDE: the seller
// is paid into `player_state.gold` at sale time whether they are online or
// not, there is no `collected` flag, and nothing at all is pushed to the
// client. So gold simply appeared, with no record anywhere of which item sold,
// for how much, or when. In a client-authored economy the player at least had
// the local `recordSale` log; in a server-authoritative one they had nothing.
// "The server is right and you cannot see that it is" is the worst shape this
// program can leave a surface in, and it is a trust problem before it is a UI
// problem.
//
// ── WHAT THIS FILE IS, AND IS NOT ──────────────────────────────────────────
// It is a READER and a CACHE over rows the player can already SELECT for
// themselves. It authors nothing, credits nothing, and is never consulted by
// any payment path — the gold was moved by `hr_market_buy` long before these
// rows are read, and deleting this module would change zero balances. That is
// deliberate: a summary surface that can influence a credit is a summary
// surface that will eventually be forged.
//
// THE ACCESS PATH IS AN EXISTING RLS READ, NOT NEW SURFACE. See the block
// above `fetchSalesHistory` in src/net/supabase-market-backend.js for the
// policy and grant it leans on, both quoted from the applied migration. No
// RPC, no SECURITY DEFINER, no migration, nothing for Security to review.
//
// ── THE SPLIT ──────────────────────────────────────────────────────────────
// Everything above `refresh()` is PURE — no fetch, no DOM, no clock it was not
// handed — so the market panel's rows, the away card's line and the smoke
// suite all read the same arithmetic from a fixture instead of from a live
// account. Everything below it does I/O and caches. The pure half is the
// contract; the impure half is plumbing.
//
// ⚠ NO NEW PERSISTENT STATE. The cache lives in module scope, never in G, so
// there is nothing here for `snapshot()` to upload and nothing to migrate. The
// "since last seen" window for the welcome-back line is derived from the
// RECEIPT the server already wrote (`windowFrom` / `awayMs` / `at`), so the
// feature adds no new save field and no new server state — a summary that
// needed its own watermark would be a second, drift-prone idea of when the
// player was last here.
// ============================================================================

/* ── PURE ─────────────────────────────────────────────────────────────────── */

/** How long a cached history read is considered current. */
export const HISTORY_TTL_MS = 60 * 1000;

/**
 * One `market_sales` row → the shape the UI reads.
 *
 * `role` is derived from WHICH SIDE the caller is on, because one row can only
 * ever be one of the two for a given viewer (a self-trade is impossible:
 * `hr_market_buy` refuses to let a seller buy their own listing). Sellers care
 * about `gold_net` — the tax already came out and quoting gross would promise
 * money that never arrived. Buyers pay `gold_gross`; the tax is not theirs and
 * is not shown to them.
 */
export function normalizeSaleRow(row, userId) {
  if (!row || typeof row !== 'object') return null;
  const sold = row.seller_user_id === userId;
  const bought = row.buyer_user_id === userId;
  if (!sold && !bought) return null;      // RLS should make this unreachable; belt and braces
  const at = (function (v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  })(row.at);
  const gross = Number(row.gold_gross) || 0;
  const tax = Number(row.tax) || 0;
  const net = Number(row.gold_net) || 0;
  return {
    id: String(row.id),
    listingId: row.listing_id || null,
    role: sold ? 'sale' : 'purchase',
    itemId: String(row.item_id || ''),
    qty: Number(row.qty) || 0,
    goldGross: gross,
    tax: tax,
    goldNet: net,
    /* THE ONE NUMBER THE ROW LEADS WITH — what this trade did to your purse,
       signed. A sale adds the net; a purchase costs the gross. */
    goldDelta: sold ? net : -gross,
    at: at,
  };
}

/** Rows → normalized entries, newest first, malformed rows dropped. */
export function normalizeSales(rows, userId) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const e = normalizeSaleRow(r, userId);
    if (e) out.push(e);
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}

/**
 * What sold in (sinceMs, untilMs]. SALES ONLY — a purchase in the window was
 * an action the player took at the keyboard and needs no welcome-back line,
 * whereas a sale is the one market event that happens TO you while you are
 * not looking. That asymmetry is the whole reason this line exists.
 *
 * Exclusive lower bound, inclusive upper: a row exactly on the previous
 * window's edge was already reported, and reporting it twice is how a player
 * learns to distrust the number.
 */
export function salesSince(entries, sinceMs, untilMs) {
  const from = Number(sinceMs);
  const to = Number.isFinite(Number(untilMs)) ? Number(untilMs) : Infinity;
  const sum = { count: 0, qty: 0, gold: 0, items: {} };
  if (!Array.isArray(entries) || !Number.isFinite(from)) return sum;
  for (const e of entries) {
    if (!e || e.role !== 'sale') continue;
    if (!(e.at > from && e.at <= to)) continue;
    sum.count += 1;
    sum.qty += e.qty;
    sum.gold += e.goldNet;
    sum.items[e.itemId] = (sum.items[e.itemId] || 0) + e.qty;
  }
  return sum;
}

/**
 * The window a receipt covers, in client-clock milliseconds.
 *
 * `windowFrom`/`windowTo` are stated by the server (Ruling 2, b352) and are
 * preferred whenever present. The fallback reconstructs the span from the
 * CREDITED duration and the moment the receipt was written, which is the same
 * derivation the away modal already makes — it is approximate at the edges and
 * that is acceptable for a "what happened while you were out" line, but it is
 * never preferred over a number the server stated.
 *
 * Returns null when the receipt says nothing usable; callers must render no
 * line at all rather than guess a window.
 */
export function receiptWindow(summary) {
  const s = summary || {};
  const from = Number(s.windowFrom);
  const to = Number(s.windowTo);
  if (Number.isFinite(from) && from > 0) {
    return { from, to: (Number.isFinite(to) && to > from) ? to : Infinity };
  }
  const at = Number(s.at);
  /* `hrs` is the same span rounded, and is all an older receipt carries — the
     same fallback order `classifyReceipt` uses, deliberately, so the two
     cannot form different ideas of how wide one absence was. */
  const ms = Number(s.awayMs) || (Math.max(0, Number(s.hrs) || 0) * 3600000);
  if (!Number.isFinite(at) || at <= 0 || ms <= 0) return null;
  return { from: at - ms, to: at };
}

/** '2 listings sold · +340 gold', or null when nothing sold. Pure. */
export function salesSummaryLine(sum) {
  if (!sum || !sum.count) return null;
  return sum.count + ' listing' + (sum.count === 1 ? '' : 's') + ' sold · +'
    + Number(sum.gold).toLocaleString() + ' gold';
}

/**
 * The whole welcome-back line in one call: receipt in, sentence or null out.
 * Takes `entries` explicitly so a test drives it from a fixture and the live
 * caller passes the cache — the module never reaches for its own state here.
 */
export function salesLineForReceipt(summary, entries) {
  const win = receiptWindow(summary);
  if (!win) return null;
  return salesSummaryLine(salesSince(entries, win.from, win.to));
}

/* ── IMPURE: the cache and the read ───────────────────────────────────────── */

let cache = { status: 'unknown', entries: [], at: 0, userId: null };
let inFlight = null;
const listeners = new Set();

/** The backend seam, read off window so this module has no hard dependency on
    a Supabase build being present at all (it is not, in the smoke harness). */
function backend() {
  try {
    const B = (typeof window !== 'undefined') && window.HearthriseSupabaseMarket;
    return (B && typeof B.fetchSalesHistory === 'function') ? B : null;
  } catch (e) { return null; }
}

function emit() {
  for (const fn of listeners) { try { fn(getHistory()); } catch (e) {} }
}

/** Subscribe to cache changes (the market panel re-renders on one). */
export function onHistoryChange(fn) {
  if (typeof fn === 'function') listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The cache, as a value.
 *   status 'unknown' — never successfully read; render "we don't know yet",
 *                      NEVER "you have no trades".
 *   status 'ok'      — `entries` is the server's answer, possibly empty, and
 *                      empty then genuinely means no trades.
 */
export function getHistory() {
  return { status: cache.status, entries: cache.entries.slice(), at: cache.at, userId: cache.userId };
}

export function isHistoryStale(nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return cache.status !== 'ok' || (now - cache.at) >= HISTORY_TTL_MS;
}

/** Test seam — the suite drives the pure half through a known cache. */
export function __setHistoryCache(next) {
  cache = {
    status: (next && next.status) || 'unknown',
    entries: (next && Array.isArray(next.entries)) ? next.entries.slice() : [],
    at: Number(next && next.at) || 0,
    userId: (next && next.userId) || null,
  };
  emit();
  return getHistory();
}

/**
 * Read the ledger. Coalesced — a panel render, a realtime nudge and a
 * welcome-back line arriving in the same tick must cost ONE request, not
 * three. A failure leaves the previous cache exactly as it was and returns it:
 * a flaky connection must never turn a real trade history into "no trades".
 */
export function refreshHistory(opts) {
  if (inFlight) return inFlight;
  const B = backend();
  if (!B) return Promise.resolve(getHistory());
  inFlight = (async () => {
    let res = null;
    try { res = await B.fetchSalesHistory(opts || {}); }
    catch (e) { res = null; }
    if (res && Array.isArray(res.rows)) {
      cache = {
        status: 'ok',
        entries: normalizeSales(res.rows, res.userId),
        at: Date.now(),
        userId: res.userId,
      };
      emit();
    }
    return getHistory();
  })();
  inFlight.finally(() => { inFlight = null; });
  return inFlight;
}

/** Fire-and-forget refresh when the cache has gone stale. Returns nothing. */
export function refreshHistoryIfStale() {
  if (isHistoryStale()) { refreshHistory().catch(() => {}); }
}

/** The live caller's convenience: the welcome-back line from the live cache. */
export function salesLineFor(summary) {
  return salesLineForReceipt(summary, cache.entries);
}

if (typeof window !== 'undefined') {
  window.HearthriseMarketHistory = {
    HISTORY_TTL_MS,
    normalizeSaleRow, normalizeSales, salesSince, receiptWindow,
    salesSummaryLine, salesLineForReceipt, salesLineFor,
    getHistory, isHistoryStale, refreshHistory, refreshHistoryIfStale,
    onHistoryChange, __setHistoryCache,
  };
}
