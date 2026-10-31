// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/market/state.js — THE MARKET WINDOW'S SCRATCH AND ITS READS.
//
// One scratch per character session. Nothing here is the market: every row is the
// server's last answer (market_browse / market_item / market_mine, each rate-gated by
// the server), read when the window opens, after a press, and on Refresh. A press that
// loses its answer keeps its gesture (sc.gesture) and its keys, so the next press sends
// the same ones and the server replays its decision (market-intents.js).
// ════════════════════════════════════════════════════════════════════════
import { marketBrowse, marketItem, marketMine } from '../../../session/market-intents.js?v=0.2.77';
import { marketKey } from '../../../session/market-gesture.js?v=0.2.77';
import { rulesOf, summaryOf, asksOf, listingOf, historyRowOf } from '../../market-model.js?v=0.2.77';
import { refusalText } from '../../intent-words.js?v=0.2.77';

const SCRATCH = new WeakMap();
/* Items for sale are a page of at most 50 a read, keyset by id: the whole catalogue is about a dozen pages. */
const MAX_PAGES = 16;
const NAMED_CHUNK = 50;
const NAMED_CHUNKS = 4;
const SEARCH_WAIT_MS = 250;
const FRESH_MS = 60000;

/** The window's scratch for one character. */
export function marketScratch(cs) {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { fresh: true, tab: 'browse', query: '', pick: null, paged: false, known: new Map(), knownAt: new Map(), forSale: null, rules: null, closed: false,
      mine: null, locked: false, page: null, want: 1, pending: false, msg: '', readMsg: '', gesture: null, cancels: new Map(), busy: new Set(), timer: 0,
      sell: { source: null, pick: null, qty: '', ask: '', filled: null, msg: '' } };
    SCRATCH.set(cs, s);
  }
  return s;
}

const residueOf = (cs) => (cs && cs.record && cs.record.residue) || {};

/** The remembered view (residue `marketView`): the category, the sort, where a purchase goes, which stack it sells from. */
export function viewOf(cs) { return Object.assign({ cat: 'all', sort: 'price', deliver: 'storage', source: 'bag' }, residueOf(cs).marketView || {}); }

/** One remembered choice. Display only: the server decides each press. */
export function setView(cs, key, value) {
  const v = viewOf(cs);
  v[key] = value;
  cs.setResidue('marketView', v);
}

const takeRules = (sc, raw) => { const r = rulesOf(raw); if (r) { sc.rules = r; sc.closed = !r.enabled; } };

/* One read at a time per kind: a second ask while one is out is the same answer. */
async function once(sc, kind, work) {
  if (sc.busy.has(kind)) return;
  sc.busy.add(kind);
  try { await work(); } finally { sc.busy.delete(kind); }
}

function stale(sc, r) {
  if (r && r.error === 'market_closed') { sc.closed = true; sc.readMsg = ''; return; }
  sc.readMsg = refusalText(r);
}

/** Everything for sale now, every page. */
function readForSale(ctx, cs, sc) {
  return once(sc, 'browse', async () => {
    const rows = [];
    let after;
    for (let i = 0; i < MAX_PAGES; i++) {
      const r = await marketBrowse(cs, after ? { after, limit: NAMED_CHUNK } : { limit: NAMED_CHUNK });
      if (!r.ok) { stale(sc, r); ctx.refresh('market'); return; }
      takeRules(sc, r.body.rules);
      for (const raw of Array.isArray(r.body.items) ? r.body.items : []) { const s = summaryOf(raw); if (s) rows.push(s); }
      after = typeof r.body.next === 'string' ? r.body.next : null;
      if (!after) break;
    }
    const at = Date.now();
    for (const s of rows) { sc.known.set(s.id, s); sc.knownAt.set(s.id, at); }
    sc.forSale = rows.map((s) => s.id);
    sc.readMsg = '';
    ctx.refresh('market');
  });
}

/** The server's summaries for named items (a search, the Sell tab's stacks), only those not read a moment ago. */
export function readNamed(ctx, cs, sc, ids) {
  const at = Date.now();
  const need = ids.filter((id) => !sc.knownAt.has(id) || at - sc.knownAt.get(id) > FRESH_MS).slice(0, NAMED_CHUNK * NAMED_CHUNKS);
  if (!need.length) return Promise.resolve();
  return once(sc, 'named', async () => {
    for (let i = 0; i < need.length; i += NAMED_CHUNK) {
      const part = need.slice(i, i + NAMED_CHUNK);
      const r = await marketBrowse(cs, { items: part });
      if (!r.ok) { stale(sc, r); ctx.refresh('market'); return; }
      takeRules(sc, r.body.rules);
      const when = Date.now();
      for (const raw of Array.isArray(r.body.items) ? r.body.items : []) { const s = summaryOf(raw); if (s) { sc.known.set(s.id, s); sc.knownAt.set(s.id, when); } }
    }
    ctx.refresh('market');
  });
}

/** A typed search reads after a short pause, not on every key. */
export function searchSoon(ctx, cs, sc, ids) {
  clearTimeout(sc.timer);
  sc.timer = setTimeout(() => { readNamed(ctx, cs, sc, ids); }, SEARCH_WAIT_MS);
}

/** One item's page: the asks by price, the 30-day line, the last sales. */
export function readItem(ctx, cs, sc, id) {
  return once(sc, 'item:' + id, async () => {
    const r = await marketItem(cs, id);
    if (sc.pick !== id && sc.sell.pick !== id) return;
    if (!r.ok) { stale(sc, r); ctx.refresh('market'); return; }
    takeRules(sc, r.body.rules);
    const s = summaryOf(r.body.item);
    if (s) { sc.known.set(id, s); sc.knownAt.set(id, Date.now()); }
    sc.page = { id, item: s, asks: asksOf(r.body.asks), history: Array.isArray(r.body.history) ? r.body.history : [],
      recent: Array.isArray(r.body.recent) ? r.body.recent : [], at: Date.now() };
    ctx.refresh('market');
  });
}

/** The account's own listings, its history and today's counts. Works with the switch off. */
export function readMine(ctx, cs, sc) {
  return once(sc, 'mine', async () => {
    const r = await marketMine(cs);
    if (!r.ok) { stale(sc, r); ctx.refresh('market'); return; }
    takeRules(sc, r.body.rules);
    sc.locked = r.body.locked === true;
    sc.mine = { listings: (Array.isArray(r.body.listings) ? r.body.listings : []).map(listingOf).filter(Boolean),
      history: (Array.isArray(r.body.history) ? r.body.history : []).map(historyRowOf).filter(Boolean),
      today: r.body.today && typeof r.body.today === 'object' ? r.body.today : {} };
    ctx.refresh('market');
  });
}

/** Everything the open window shows, read again. */
export function rereadAll(ctx, cs, sc) {
  const out = [readMine(ctx, cs, sc), readForSale(ctx, cs, sc)];
  const id = sc.tab === 'sell' ? sc.sell.pick : sc.pick;
  if (id) out.push(readItem(ctx, cs, sc, id));
  return Promise.all(out);
}

/** The press's outcome read off a list of plain steps: `go` runs with the gesture held until a definite answer. */
export function holdGesture(sc, g) { sc.gesture = g; return g; }

/** Done with a gesture: the next press mints new keys. */
export function dropGesture(sc) { sc.gesture = null; }

/** A key for this listing's Cancel, kept until the server answers definitely (one key per gesture). */
export function cancelKey(sc, listing) {
  if (!sc.cancels.has(listing)) sc.cancels.set(listing, marketKey());
  return sc.cancels.get(listing);
}

/** Open the Sell tab on one stack: the bag's "List on the market…", and History's "List again". */
export function offerForSale(ctx, id, source, o) {
  const cs = ctx.character;
  const sc = marketScratch(cs);
  sc.tab = 'sell';
  sc.sell.source = source;
  sc.sell.pick = id;
  sc.sell.qty = o && Number.isSafeInteger(o.qty) ? String(o.qty) : '';
  sc.sell.ask = o && Number.isSafeInteger(o.each) ? String(o.each) : '';
  sc.sell.filled = o && Number.isSafeInteger(o.each) ? id : null;
  sc.sell.msg = '';
  sc.paged = true;
  ctx.wm.open('market');
  ctx.refresh('market');
}
