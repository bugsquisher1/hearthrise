// ════════════════════════════════════════════════════════════════════════
// src/shell/market-model.js — WHAT THE WEIGHHOUSE'S ANSWERS MEAN ON SCREEN.
//
// PURE (no DOM). The market window and the sale notices read these. Every number
// here is the server's (hr_market_browse / _item / _mine, 2027-01-12-market-account.sql):
// this file reads them defensively, groups and sorts them, and does the sums a player
// is shown BEFORE a press (fee, cut, the buy plan). The server redoes all of it under
// its locks: nothing here is spendable, and a listing's price is the locked row's.
//
//   rulesOf(raw) · summaryOf(raw) · asksOf(raw) · listingOf(raw) · historyRowOf(raw)
//   feeOf / netEachOf     the listing fee and what one sale pays, from the server's rules
//   planBuy(asks, want)   cheapest first across other accounts' listings, never own ones
//   mostAffordable(asks, gold)   how many the purse covers, cheapest first
//   searchIds(query, n)   the catalogue rows a search covers, listed or not
//   browseRows(rows, o)   one category, one sort (the Inventory's kinds)
//   priceSample(page)     the sales behind a price: how much a number can be trusted
//   rowWords · noneWords · ageWords · sellRowWords · listingWords · historyWords   the plain-English lines
//   noticesSince(history, seenAt)   the sold and returned rows a player has not been told
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.76';
import { whole } from '../render/format.js?v=0.2.76';
import { kindOf } from './bag-model.js?v=0.2.76';
import { itemName } from './widgets/bits.js?v=0.2.76';

const int = (v) => (Number.isSafeInteger(v) ? v : null);
const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const whenMs = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** n gold, as the design words it. */
export const goldWords = (n) => whole(n) + ' gold';

export const MARKET_TABS = Object.freeze([['browse', 'Browse'], ['sell', 'Sell'], ['mine', 'My listings'], ['history', 'History']]);
export const MARKET_SORTS = Object.freeze([['price', 'Lowest price'], ['most', 'Most for sale'], ['recent', 'Recently sold'], ['name', 'Name']]);
/* The quantities one press picks on an item page; `afford` and `all` read the server's asks. */
export const BUY_CHIPS = Object.freeze([[1, '1'], [10, '10'], [100, '100'], ['afford', 'Most I can afford'], ['all', 'All']]);

/** The rules a client renders (hr_market_rules), or null when the server sent none: every control stays off. */
export function rulesOf(raw) {
  if (!isObj(raw) || int(raw.fee_bp) === null || int(raw.cut_bp) === null) return null;
  return { enabled: raw.enabled === true, feeBp: raw.fee_bp, feeMin: count(raw.fee_min), cutBp: raw.cut_bp, ttlH: count(raw.ttl_h),
    maxListings: count(raw.max_listings), maxListsPerDay: count(raw.max_lists_per_day), minLevel: int(raw.min_level) };
}

/** One item's summary (hr_market_item_summary). */
export function summaryOf(raw) {
  if (!isObj(raw) || typeof raw.item_id !== 'string') return null;
  return { id: raw.item_id, listable: raw.listable === true, why: typeof raw.why === 'string' ? raw.why : null,
    floor: int(raw.floor), ceiling: int(raw.ceiling), lowest: int(raw.lowest), forSale: count(raw.for_sale),
    lastEach: int(raw.last_each), lastAt: whenMs(raw.last_at), typical: int(raw.typical_7d), volume: count(raw.volume_7d) };
}

/** The asks of an item page, cheapest first as the server sent them: [{ each, qty, listings: [{ id, qty, mine }] }]. */
export function asksOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => isObj(a) && int(a.each) !== null).map((a) => ({ each: a.each, qty: count(a.qty),
    listings: (Array.isArray(a.listings) ? a.listings : []).filter((l) => isObj(l) && typeof l.id === 'string')
      .map((l) => ({ id: l.id, qty: count(l.qty), mine: l.mine === true })) }));
}

/** One of this account's own listings (hr_market_mine). */
export function listingOf(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.item_id !== 'string') return null;
  return { id: raw.id, item: raw.item_id, qty: count(raw.qty), listed: count(raw.qty_listed), each: count(raw.ask_each), fee: count(raw.fee),
    source: raw.source === 'storage' ? 'storage' : 'bag', hero: int(raw.listed_by), expiresAt: whenMs(raw.expires_at), received: count(raw.received) };
}

/** One row of the account's 30-day market history (hr_market_mine). */
export function historyRowOf(raw) {
  if (!isObj(raw) || typeof raw.what !== 'string' || typeof raw.item_id !== 'string') return null;
  return { what: raw.what, item: raw.item_id, qty: Math.abs(int(raw.qty) || 0), gold: int(raw.gold) || 0, each: int(raw.each),
    fee: int(raw.fee), cut: int(raw.cut), deliver: typeof raw.deliver === 'string' ? raw.deliver : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null, at: whenMs(raw.at), hero: int(raw.hero) };
}

/** The listing fee for `qty` at `ask`: the server's percent of the whole ask, rounded up, never under its minimum. */
export function feeOf(rules, qty, ask) {
  return Math.max(rules.feeMin, Math.ceil(qty * ask * rules.feeBp / 10000));
}

/** What one sold unit pays the seller: the ask less the Weighhouse's cut, rounded up as the server rounds it. */
export function netEachOf(rules, ask) {
  return ask - Math.ceil(ask * rules.cutBp / 10000);
}

/**
 * THE BUY PLAN: `want` units, cheapest first across other accounts' listings, as the lines one press sends in order.
 * Own listings never fill it (the server refuses them `own_listing`). A line's `each` becomes its `max_each`, so a
 * press can never pay above what the player was shown.
 * @returns {{ lines: {listing:string, qty:number, each:number}[], qty:number, total:number, available:number }}
 */
export function planBuy(asks, want) {
  const lines = [];
  let left = Math.max(0, Math.floor(want) || 0), qty = 0, total = 0, available = 0;
  for (const a of asks) {
    for (const l of a.listings) {
      if (l.mine) continue;
      available += l.qty;
      const take = Math.min(left, l.qty);
      if (take <= 0) continue;
      lines.push({ listing: l.id, qty: take, each: a.each });
      left -= take;
      qty += take;
      total += take * a.each;
    }
  }
  return { lines, qty, total, available };
}

/** How many a purse covers, cheapest first. */
export function mostAffordable(asks, purse) {
  let left = count(purse), n = 0;
  for (const a of asks) {
    const others = a.listings.filter((l) => !l.mine).reduce((s, l) => s + l.qty, 0);
    if (a.each <= 0 || !others) continue;
    const take = Math.min(others, Math.floor(left / a.each));
    n += take;
    left -= take * a.each;
    if (take < others) break;
  }
  return n;
}

let TRADEABLE = null;
/* Every catalogue row a player might search for: tradeable and worth something. The server still answers `listable`. */
function tradeableIds() {
  if (!TRADEABLE) TRADEABLE = Object.keys(ITEMS).filter((id) => !ITEMS[id].bop && Number(ITEMS[id].v) > 0 && !ITEMS[id].premium);
  return TRADEABLE;
}

/** A search over the catalogue's names (listed or not), at most `max` ids: the names that start with it first. */
export function searchIds(query, max) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = tradeableIds().map((id) => [id, itemName(id).toLowerCase()]).filter(([, n]) => n.includes(q));
  hits.sort((a, b) => (b[1].startsWith(q) - a[1].startsWith(q)) || a[1].localeCompare(b[1]));
  return hits.slice(0, max).map(([id]) => id);
}

/** One bag category (`all` for every kind), one sort. The rows are the server's summaries. */
export function browseRows(list, o) {
  const cat = (o && o.cat) || 'all', sort = (o && o.sort) || 'price';
  const shown = list.filter((r) => cat === 'all' || kindOf(r.id) === cat);
  const by = {
    price: (a, b) => (a.lowest === null) - (b.lowest === null) || a.lowest - b.lowest,
    most: (a, b) => b.forSale - a.forSale,
    recent: (a, b) => (b.lastAt || 0) - (a.lastAt || 0),
    name: () => 0,
  }[sort] || (() => 0);
  return shown.slice().sort((a, b) => by(a, b) || itemName(a.id).localeCompare(itemName(b.id)));
}

/**
 * THE SALES BEHIND A PRICE (Security market review change 5, threat model #10): a pair of accounts can print a price
 * with one sale, so a number from market history is shown WITH its sample and is never a one-press chip until the
 * server's read carries the sample rules. { sales7d, line } from an item page's daily rows.
 */
export function priceSample(page) {
  const now = page && Number.isFinite(page.at) ? page.at : Date.now();
  const days = page && Array.isArray(page.history) ? page.history : [];
  const week = days.filter((d) => isObj(d) && whenMs(d.day) !== null && now - whenMs(d.day) < 7.5 * 86400000);
  const sales7d = week.reduce((s, d) => s + count(d.trades), 0);
  return { sales7d, line: sales7d === 1 ? '1 sale this week' : whole(sales7d) + ' sales this week' };
}

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** "just now", "12 min ago", "2 h ago", "3 days ago". */
export function ageWords(at, now) {
  if (!Number.isFinite(at)) return '';
  const d = Math.max(0, now - at);
  if (d < MIN) return 'just now';
  if (d < HOUR) return Math.floor(d / MIN) + ' min ago';
  if (d < DAY) return Math.floor(d / HOUR) + ' h ago';
  const n = Math.floor(d / DAY);
  return n + (n === 1 ? ' day ago' : ' days ago');
}

/* "6 days left", "3 h left", "under an hour left". */
function leftWords(at, now) {
  if (!Number.isFinite(at)) return '';
  const d = at - now;
  if (d <= 0) return 'coming back to your storage';
  if (d < HOUR) return 'under an hour left';
  if (d < 2 * DAY) return Math.ceil(d / HOUR) + ' h left';
  return Math.floor(d / DAY) + ' days left';
}

/** A Browse row's line: "from 13 each · 320 for sale · last sold 13, 2 h ago". */
export function rowWords(s, now) {
  if (!s.forSale) return noneWords(s, now);
  const last = s.lastEach !== null ? ' · last sold ' + whole(s.lastEach) + ', ' + ageWords(s.lastAt, now) : '';
  return 'from ' + whole(s.lowest) + ' each · ' + whole(s.forSale) + ' for sale' + last;
}

/** "No one is selling this. Last sold 2 days ago for 12 each." */
export function noneWords(s, now) {
  return 'No one is selling this.' + (s.lastEach !== null ? ' Last sold ' + ageWords(s.lastAt, now) + ' for ' + whole(s.lastEach) + ' each.' : '');
}

/** The Sell tab's line for one stack: what the shop pays and what the market says, side by side. */
export function sellRowWords(s, bid, qty) {
  const shop = bid === undefined || bid === null ? 'The shop does not buy this' : 'The shop pays ' + whole(bid);
  const market = !s ? 'Reading the market…' : s.forSale ? 'Market: from ' + whole(s.lowest) : 'No one is selling these';
  return '×' + whole(qty) + ' · ' + shop + ' · ' + market;
}

/** My listings' line: "2 of 3 left · 240 each · 6 days left · received 230". */
export function listingWords(l, now) {
  return whole(l.qty) + ' of ' + whole(l.listed) + ' left · ' + whole(l.each) + ' each · ' + leftWords(l.expiresAt, now)
    + (l.received ? ' · received ' + whole(l.received) : '');
}

/** History's line for one row, in the design's words. */
export function historyWords(h, now) {
  const name = itemName(h.item);
  const when = ageWords(h.at, now);
  const n = whole(h.qty) + ' ' + name;
  const lines = {
    sold: 'Sold ' + n + ' for ' + goldWords((h.each || 0) * h.qty) + '. You received ' + goldWords(h.gold) + '.',
    bought: 'Bought ' + n + ' for ' + goldWords(Math.abs(h.gold)) + '.',
    listed: 'Listed ' + n + ' at ' + whole(h.each || 0) + ' each. Fee ' + goldWords(Math.abs(h.gold)) + '.',
    cancelled: 'Canceled. ' + n + ' went back to your storage.',
    returned: n + ' didn\'t sell and went back to your storage.',
  };
  return { line: lines[h.what] || n, when };
}

/**
 * What a player has not been told: sold and returned rows newer than `seenAt` (ms), oldest first, with the newest time
 * to remember. Pure; the rows are the server's own history.
 */
export function noticesSince(history, seenAt) {
  const fresh = history.map(historyRowOf).filter((h) => h && h.at !== null && h.at > seenAt && (h.what === 'sold' || h.what === 'returned'));
  fresh.sort((a, b) => a.at - b.at);
  return { rows: fresh, newest: fresh.length ? fresh[fresh.length - 1].at : seenAt };
}

/** The notice for a batch of rows: one line per returned stack, and the sales as one line (the design's). */
export function noticeLines(rows, away) {
  const out = [];
  const sold = rows.filter((r) => r.what === 'sold');
  if (sold.length === 1 && !away) {
    const s = sold[0];
    out.push({ key: 'sold', at: s.at, item: s.item, text: 'The Weighhouse sold ' + whole(s.qty) + ' ' + itemName(s.item) + ' for ' + goldWords((s.each || 0) * s.qty) + '. You received ' + goldWords(s.gold) + '.' });
  } else if (sold.length) {
    const gross = sold.reduce((n, s) => n + (s.each || 0) * s.qty, 0);
    const head = away ? 'While you were away the Weighhouse sold ' : 'The Weighhouse sold ';
    const lots = sold.length === 1 ? '1 lot' : whole(sold.length) + ' lots';
    out.push({ key: 'sold', at: sold[sold.length - 1].at, item: null, text: head + lots + ' for ' + goldWords(gross) + '.' });
  }
  for (const r of rows.filter((x) => x.what === 'returned')) {
    out.push({ key: 'back', at: r.at, item: r.item, text: whole(r.qty) + ' ' + itemName(r.item) + ' didn\'t sell and ' + (r.qty === 1 ? 'is' : 'are') + ' back in your storage.' });
  }
  return out;
}
