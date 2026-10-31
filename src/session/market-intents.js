// ════════════════════════════════════════════════════════════════════════
// src/session/market-intents.js — THE WEIGHHOUSE'S ASKS, SESSION SIDE (no UI).
//
// The market window calls these; each is ONE engine ask through
// CharacterSession.edgeIntent, its body built by edge-intents.js (MARKET_FIELDS):
//   marketList(account, cs, { source, item, qty, askEach, key })       list from the bag or Storage
//   marketCancel(account, cs, listing, key)                            the units go back to Storage
//   marketBuy(account, cs, { listing, qty, maxEach, deliver, key })    deliver 'storage' (default) or 'bag'
//   marketBrowse(cs, { items, after, limit })                          a read: items for sale, or the named ones
//   marketItem(cs, item)                                               a read: one item's asks, line and last sales
//   marketMine(cs)                                                     a read: own listings, history, today's caps
// The server prices, caps, escrows and journals everything (hr-accrue market.js
// -> 2027-01-12-market-account.sql); `askEach` is the seller's own price for their
// own goods and `maxEach` the most the buyer agreed to pay (it can only refuse).
// A write's answer IS the acting hero's envelope (applied by edgeIntent); Storage
// and the purse are the ACCOUNT's, so on ok the account's other open heroes are
// re-read too. A read changes nothing on screen by itself: it hands back the
// server's answer for the window to render. A refusal carries the server's code.
//
// ONE KEY PER GESTURE (Security market review change 4): a write takes its idempotency
// `key` from the caller. A lost answer leaves the gesture holding it, and the next
// press resends the same key with the same fields, so the server replays its decision
// instead of buying twice. `version_conflict` and `settle_first` release or never take
// the key, and the design retries them quietly with it, a bounded number of times.
// ════════════════════════════════════════════════════════════════════════

const usable = (cs) => !!cs && cs.status !== 'closed' && typeof cs.edgeIntent === 'function';
const refuse = () => Promise.resolve({ ok: false, error: 'bad_intent' });

/* The refusals the player never reads: nothing happened, and the same press lands a moment later. */
const QUIET = new Set(['version_conflict', 'settle_first']);
const QUIET_TRIES = 2;
const QUIET_WAIT_MS = 400;

/** A fresh idempotency key for one gesture. */
export function marketKey() { return globalThis.crypto.randomUUID(); }

/** Did the answer get lost on the way back? The server may have acted: only the SAME key may be sent again. */
export function answerLost(r) {
  return !!r && r.ok !== true && typeof r.error === 'string' && (r.error === 'network' || r.error === 'no_token' || /^http_5\d\d$/.test(r.error));
}

/* The account's other open heroes re-read: Storage and the purse are theirs too. */
function rereadOthers(account, cs) {
  const all = account && typeof account.characters === 'function' ? account.characters() : [];
  return Promise.all(all.filter((o) => o !== cs && o && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
}

async function written(account, cs, send) {
  let r = await send();
  for (let i = 0; i < QUIET_TRIES && r && QUIET.has(r.error); i++) {
    await new Promise((done) => setTimeout(done, QUIET_WAIT_MS));
    r = await send();
  }
  if (r && r.ok) await rereadOthers(account, cs);
  return r;
}

/** List `qty` of `item` from this hero's bag ('bag') or the account's Storage ('storage') at `askEach` gold each. */
export function marketList(account, cs, o) {
  if (!usable(cs) || !o) return refuse();
  const fields = { market: { source: o.source, item: o.item, qty: o.qty, ask_each: o.askEach } };
  const key = o.key || marketKey();
  return written(account, cs, () => cs.edgeIntent('market_list', fields, false, key));
}

/** Take a listing of this account back (any hero of it may); its units return to Storage. */
export function marketCancel(account, cs, listing, key) {
  if (!usable(cs)) return refuse();
  const k = key || marketKey();
  return written(account, cs, () => cs.edgeIntent('market_cancel', { market: { listing } }, false, k));
}

/** Buy `qty` from a listing at no more than `maxEach` gold each, into Storage or this hero's bag. */
export function marketBuy(account, cs, o) {
  if (!usable(cs) || !o) return refuse();
  const fields = { market: { listing: o.listing, qty: o.qty, max_each: o.maxEach, deliver: o.deliver || 'storage' } };
  const key = o.key || marketKey();
  return written(account, cs, () => cs.edgeIntent('market_buy', fields, false, key));
}

/** The items for sale now (a page after `after`), or the named `items` (a search / category page). */
export function marketBrowse(cs, o) {
  if (!usable(cs)) return refuse();
  const m = {};
  if (o && o.items !== undefined) m.items = o.items;
  if (o && o.after !== undefined) m.after = o.after;
  if (o && o.limit !== undefined) m.limit = o.limit;
  return cs.edgeIntent('market_browse', { market: m }, true);
}

/** One item's page: the cheapest asks grouped by price (own ones marked), the 30-day line, the last sales. */
export function marketItem(cs, item) {
  if (!usable(cs)) return refuse();
  return cs.edgeIntent('market_item', { market: { item } }, true);
}

/** This account's own listings, its 30 days of market history and today's counts against the caps. */
export function marketMine(cs) {
  if (!usable(cs)) return refuse();
  return cs.edgeIntent('market_mine', {}, true);
}
