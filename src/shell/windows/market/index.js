// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/market/index.js — THE WEIGHHOUSE: THE PLAYER MARKET'S ONE WINDOW.
//
// Design: docs/planning/PRIORITY_BOARD.md "Marketplace design (2026-10-24)". Icon row
// "Market", key M, a window on desktop and the same component as a slide-out sheet on a
// phone (src/styles/market.css). Four tabs, for every hero, hunting or not (the market
// moves account goods):
//   Browse       one row per ITEM beside its page (browse.js): asks by price, last sales, Buy
//   Sell         the bag or Storage beside the sheet that lists a stack (sell.js)
//   My listings  each listing with Cancel; History 30 days of the account's trades (ledger.js)
// Anonymous: no seller or buyer name reaches this window; the server's reads hold listing
// ids only. Every number is the server's and every control is off until it has answered.
// ════════════════════════════════════════════════════════════════════════
import { text, cls, attr, prop } from '../../../render/paint.js?v=0.2.78';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.78';
import { whole } from '../../../render/format.js?v=0.2.78';
import { goldOf } from '../../../session/item-sections.js?v=0.2.78';
import { MARKET_TABS } from '../../market-model.js?v=0.2.78';
import { hideTip } from '../item-tip.js?v=0.2.78';
import { marketScratch, rereadAll, readMine, readItem } from './state.js?v=0.2.78';
import { browseHtml, patchBrowse, actBrowse } from './browse.js?v=0.2.78';
import { sellHtml, patchSell, actSell } from './sell.js?v=0.2.78';
import { ledgerHtml, patchLedger, actLedger } from './ledger.js?v=0.2.78';

/** The skeleton (built once per opening). An opening reads the server again. */
export function renderMarket(ctx) {
  if (ctx && ctx.character) marketScratch(ctx.character).fresh = true;
  return '<div class="hw-mk">'
    + '<p class="hw-mk-greet"><span>Aldous Pell, weighmaster: I hold what you list and pay you the moment it sells.</span><b class="hw-gold hw-mk-purse"></b></p>'
    + '<div class="hw-tabs" role="tablist">' + MARKET_TABS.map(([id, l], i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '">' + esc(l) + '</button>').join('')
    + '<button type="button" class="hh-tool hw-mk-refresh" data-hs-act="refresh">Refresh</button></div>'
    + '<p class="hs-note hw-mk-state" role="status"></p>'
    + browseHtml(ctx) + sellHtml() + ledgerHtml()
    + '<p class="hh-intent-msg hw-mk-msg" role="status" aria-live="polite"></p></div>';
}

/* What stands between this account and a trade, in the server's own terms ('' = nothing). */
function blockWords(sc) {
  if (sc.closed) return 'The Weighhouse isn\'t trading right now. Your listings are safe, and you can still take them back.';
  if (sc.locked && sc.rules && sc.rules.minLevel) return 'The Weighhouse trades with heroes of Level ' + whole(sc.rules.minLevel) + ' or higher. Reach it on any hero to buy and sell here. Until then, have a look around.';
  return '';
}

renderMarket.patch = function patchMarket(body, ctx) {
  const cs = ctx.character;
  const sc = marketScratch(cs);
  if (sc.fresh) { sc.fresh = false; rereadAll(ctx, cs, sc); }
  /* a press that asked for a tab (the alert's Open, a menu) shows it */
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('market') : null;
  if (want && MARKET_TABS.some(([id]) => id === want)) sc.tab = want;
  const root = body.querySelector('.hw-mk');
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  const purse = goldOf(cs);
  text(root.querySelector('.hw-mk-purse'), purse === null ? '' : 'Your gold ' + whole(purse));
  const why = blockWords(sc);
  const state = root.querySelector('.hw-mk-state');
  text(state, why || sc.readMsg);
  prop(state, 'hidden', !(why || sc.readMsg));
  prop(root.querySelector('.hw-mk-refresh'), 'disabled', sc.pending);
  const v = { cs, sc, root, ctx, off: sc.pending || !sc.rules || !sc.mine || sc.closed || sc.locked, offWhy: why };
  if (sc.tab === 'browse') patchBrowse(v);
  else if (sc.tab === 'sell') patchSell(v);
  else patchLedger(v);
  text(root.querySelector('.hw-mk-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

renderMarket.events = Object.freeze(['input', 'mouseover', 'mouseout']);

renderMarket.act = function actMarket(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = marketScratch(cs);
  const repaint = () => ctx.refresh('market');
  if (ev.type === 'click' && action === 'tab') {
    sc.tab = t.getAttribute('data-tab');
    sc.msg = '';
    hideTip(ctx.doc);
    repaint();
    if (sc.tab === 'mine' || sc.tab === 'history') readMine(ctx, cs, sc);
    /* One page is held at a time (Browse's pick or Sell's): a tab shows its own again. */
    const id = sc.tab === 'sell' ? sc.sell.pick : sc.tab === 'browse' ? sc.pick : null;
    if (id && (!sc.page || sc.page.id !== id)) readItem(ctx, cs, sc, id);
    return true;
  }
  if (ev.type === 'click' && action === 'refresh') { if (!sc.pending) { sc.known.clear(); sc.knownAt.clear(); rereadAll(ctx, cs, sc); } return true; }
  const o = { ctx, cs, sc, body, repaint };
  return actBrowse(o, action, ev, t) || actSell(o, action, ev, t) || actLedger(o, action, ev, t) || false;
};
