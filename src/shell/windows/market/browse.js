// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/market/browse.js — BROWSE: ONE ROW PER ITEM, AND ITS PAGE WITH BUY.
//
// The list is what is for sale now (market_browse, every page), or a search over the whole
// catalogue, listed or not ("No one is selling Coal. Last sold 2 days ago for 12 each.").
// The page beside it (on a phone, in its place) reads market_item: the asks by price, the
// 30-day line, the last ten sales, and Buy.
//
// BUY IS ONE PRESS OVER ONE PLAN: cheapest first across other accounts' listings
// (market-model.js planBuy), each line its own intent with the price the player saw as its
// ceiling. If a listing sells first the run stops and says so, and the page re-reads, so the
// next plan is on screen before any more gold moves. A lost answer keeps the plan and its
// keys: the next press resends them and the server replays what it already did.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, attr, prop, style, element } from '../../../render/paint.js?v=0.2.76';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.76';
import { whole } from '../../../render/format.js?v=0.2.76';
import { glyphSvg } from '../../launcher.js?v=0.2.76';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.76';
import { goldOf, nameOf } from '../../../session/item-sections.js?v=0.2.76';
import { huntOf, settingsOf } from '../../../session/hunt-sections.js?v=0.2.76';
import { BAG_CATS } from '../../bag-model.js?v=0.2.76';
import { kindWords, sourcesOf, usesOf, flavourOf } from '../../item-lore.js?v=0.2.76';
import { refusalText } from '../../intent-words.js?v=0.2.76';
import { marketBuy, marketCancel, marketKey } from '../../../session/market-intents.js?v=0.2.76';
import { MARKET_SORTS, BUY_CHIPS, planBuy, mostAffordable, browseRows, searchIds, rowWords, noneWords, ageWords, goldWords, priceSample } from '../../market-model.js?v=0.2.76';
import { showTip, hideTip } from '../item-tip.js?v=0.2.76';
import { viewOf, setView, readItem, rereadAll, searchSoon, holdGesture, dropGesture, cancelKey, answerLost } from './state.js?v=0.2.76';

const SEARCH_MAX = 50;
const LOST_WORDS = 'No answer from the Weighhouse. Press again: it won\'t buy twice.';

/** The Browse pane's skeleton. */
export function browseHtml(ctx) {
  const g = ctx.glyphs;
  return '<section class="hw-pane hw-mk-browse" data-pane="browse">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="mk-search" placeholder="Find any item" aria-label="Find any item" autocomplete="off"></span>'
    + '<label class="hw-sort"><span>Sort</span><select class="hh-select" data-hs-act="mk-sort">' + MARKET_SORTS.map(([id, l]) => '<option value="' + id + '">' + esc(l) + '</option>').join('') + '</select></label></div>'
    + '<div class="hw-cats" role="group" aria-label="Show">' + BAG_CATS.map(([id, l]) => '<button type="button" class="hw-cat" data-hs-act="mk-cat" data-cat="' + id + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>'
    + '<div class="hw-mk-invite"><h3 class="hw-hd-name">The scales are empty</h3>'
    + '<p class="hw-mk-invite-p"></p><button type="button" class="hw-primary is-on" data-hs-act="mk-to-sell">List something</button></div>'
    + '<div class="hw-mk-cols"><ul class="hw-mk-list" role="listbox" aria-label="Items"></ul>'
    + '<section class="hw-mk-page" aria-label="The picked item"><div class="hw-hd-page">'
    + '<button type="button" class="hh-tool hw-hd-back" data-hs-act="mk-back">Back to the list</button>'
    + '<div class="hw-mk-head"><span class="hw-ico hw-mk-ico"></span><div class="hw-mk-title"><h3 class="hw-hd-name hw-mk-name"></h3><p class="hw-hd-band hw-mk-kind"></p></div></div>'
    + '<p class="hw-mk-lore"></p>'
    + '<p class="hw-mk-price"></p>'
    + '<h4 class="hw-hd-h">For sale</h4><ul class="hw-mk-asks"></ul><p class="hh-empty hw-mk-asks-none is-on"></p>'
    + buyHtml()
    + '<h4 class="hw-hd-h hw-mk-line-h">The last 30 days</h4><div class="hw-mk-line" role="img"></div><p class="hs-note hw-mk-line-note"></p>'
    + '<h4 class="hw-hd-h hw-mk-sales-h">Last sales</h4><ul class="hw-mk-sales"></ul>'
    + '</div></section></div></section>';
}

function buyHtml() {
  return '<div class="hw-mk-buy">'
    + '<div class="hw-mk-chips" role="group" aria-label="How many">' + BUY_CHIPS.map(([v, l]) => '<button type="button" class="hh-seg" data-hs-act="mk-want" data-want="' + v + '" aria-pressed="false">' + esc(l) + '</button>').join('')
    + '<input type="number" min="1" step="1" class="hh-num hw-mk-count" data-hs-act="mk-count" aria-label="How many"></div>'
    + '<label class="hw-mk-goes"><span>Goes to:</span><select class="hh-select" data-hs-act="mk-deliver"><option value="storage">Storage</option><option value="bag"></option></select></label>'
    + '<div class="hw-mk-do"><button type="button" class="hw-primary is-on" data-hs-act="mk-buy"></button>'
    + '<button type="button" class="hh-tool hw-mk-forget" data-hs-act="mk-forget" hidden>Forget it</button></div>'
    + '<p class="hs-note hw-mk-after"></p><p class="hs-note hw-mk-warn"></p></div>';
}

function rowLi(ctx, id) {
  return element(ctx.doc, '<li class="hw-mk-row" role="option" data-hs-act="mk-pick" data-item="' + esc(id) + '" tabindex="-1"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, id) + '</span>'
    + '<span class="hw-line-name"><b>' + esc(itemName(id)) + '</b><small></small></span></li>');
}

/* The rows the list shows: the search's, or what is for sale now, in one category and one sort. */
function listOf(sc, view) {
  const ids = sc.query ? searchIds(sc.query, SEARCH_MAX) : sc.forSale || [];
  const known = ids.map((id) => sc.known.get(id)).filter(Boolean);
  return browseRows(known, { cat: sc.query ? 'all' : view.cat, sort: view.sort });
}

/* The count the player asked for, from a chip or the box. */
function wanted(sc, asks, purse) {
  if (sc.want === 'all') return planBuy(asks, Infinity).available;
  if (sc.want === 'afford') return mostAffordable(asks, purse);
  return sc.want;
}

/* "Brannoc's hunt stops buying food below 2,000 gold. This leaves 1,500." for a running hunt on this account. */
function floorWarning(ctx, left) {
  const all = ctx.account && typeof ctx.account.characters === 'function' ? ctx.account.characters() : [];
  for (const c of all) {
    const h = huntOf(c);
    const s = h && !h.ended ? settingsOf(c) : null;
    if (s && Number.isSafeInteger(s.goldFloor) && s.goldFloor > left) {
      return (nameOf(c) || 'Your hero') + '\'s hunt stops buying food below ' + goldWords(s.goldFloor) + '. This leaves ' + whole(Math.max(0, left)) + '.';
    }
  }
  return '';
}

function patchAsks(root, ctx, sc, page, off) {
  const asks = page ? page.asks : [];
  rows(root.querySelector('.hw-mk-asks'), asks, {
    key: (a) => String(a.each),
    build: () => element(ctx.doc, '<li class="hw-mk-ask"><b class="hw-mk-ask-p"></b><span class="hw-mk-ask-n"></span><span class="hw-mk-ask-own"></span></li>'),
    patch: (li, a) => {
      text(li.querySelector('.hw-mk-ask-p'), whole(a.each) + ' each');
      text(li.querySelector('.hw-mk-ask-n'), whole(a.qty));
      const mine = a.listings.filter((l) => l.mine);
      const own = li.querySelector('.hw-mk-ask-own');
      const key = mine.map((l) => l.id).join(',');
      if (own.getAttribute('data-keys') !== key) {
        attr(own, 'data-keys', key);
        own.innerHTML = mine.map((l) => '<span class="hw-mk-yours">Yours · ' + whole(l.qty) + '</span> <button type="button" class="hh-tool" data-hs-act="mk-cancel" data-listing="' + esc(l.id) + '">Cancel</button>').join(' ');
      }
      for (const b of own.querySelectorAll('button')) prop(b, 'disabled', off);
    },
  });
}

function patchBuy(root, v, page) {
  const { cs, sc, ctx } = v;
  const purse = goldOf(cs);
  const asks = page.asks;
  const view = viewOf(cs);
  const g = sc.gesture && sc.gesture.kind === 'buy' && sc.gesture.item === page.id ? sc.gesture : null;
  const buy = root.querySelector('.hw-mk-buy');
  const n = g ? g.lines.reduce((s, l) => s + l.qty, 0) : wanted(sc, asks, purse);
  const plan = g ? { lines: g.lines, qty: n, total: g.lines.reduce((s, l) => s + l.qty * l.each, 0), available: n } : planBuy(asks, n);
  cls(buy, 'is-on', plan.available > 0 || !!g);
  for (const b of buy.querySelectorAll('[data-hs-act="mk-want"]')) {
    const w = b.getAttribute('data-want');
    attr(b, 'aria-pressed', String(String(sc.want) === w));
    prop(b, 'disabled', v.off || !!g);
  }
  const box = buy.querySelector('.hw-mk-count');
  if (ctx.doc.activeElement !== box) prop(box, 'value', String(plan.qty || ''));
  prop(box, 'disabled', v.off || !!g);
  const sel = buy.querySelector('[data-hs-act="mk-deliver"]');
  const heroBag = (nameOf(cs) || 'This hero') + '\'s bag';
  const opt = sel.querySelector('option[value="bag"]');
  text(opt, heroBag);
  prop(sel, 'value', g ? g.deliver : view.deliver);
  prop(sel, 'disabled', v.off || !!g);
  const left = purse === null ? null : purse - plan.total;
  const short = left !== null && left < 0;
  const press = buy.querySelector('[data-hs-act="mk-buy"]');
  text(press, g ? 'Try again' : plan.qty ? 'Buy ' + whole(plan.qty) + ' for ' + goldWords(plan.total) : 'Buy');
  prop(press, 'disabled', v.off || !plan.qty || (short && !g));
  attr(press, 'data-off-why', v.offWhy || (short ? 'You need ' + goldWords(-left) + ' more.' : null));
  prop(buy.querySelector('.hw-mk-forget'), 'hidden', !g);
  text(buy.querySelector('.hw-mk-after'), left === null || !plan.qty ? '' : short ? 'You need ' + whole(plan.total) + ' gold. You have ' + whole(purse) + '.'
    : 'You\'ll have ' + goldWords(left) + ' left.' + (plan.qty < n ? ' Only ' + whole(plan.qty) + ' are for sale.' : ''));
  text(buy.querySelector('.hw-mk-warn'), left === null || short || !plan.qty ? '' : floorWarning(ctx, left));
}

function patchLine(root, ctx, page) {
  const days = page.history.filter((d) => d && Number.isFinite(Number(d.avg_each)));
  const top = days.reduce((m, d) => Math.max(m, Number(d.high) || Number(d.avg_each)), 1);
  const on = days.length > 0;
  for (const s of ['.hw-mk-line-h', '.hw-mk-line', '.hw-mk-line-note']) prop(root.querySelector(s), 'hidden', !on);
  const line = root.querySelector('.hw-mk-line');
  attr(line, 'aria-label', on ? 'The average price each day it sold' : null);
  rows(line, days, {
    key: (d) => String(d.day),
    build: () => element(ctx.doc, '<i class="hw-mk-bar"></i>'),
    patch: (el, d) => {
      style(el, 'height', Math.max(8, Math.round(Number(d.avg_each) / top * 100)) + '%');
      attr(el, 'title', String(d.day) + ': ' + whole(Number(d.avg_each)) + ' each, ' + whole(Number(d.qty)) + ' sold');
    },
  });
  const sold = days.reduce((s, d) => s + (Number(d.qty) || 0), 0);
  text(root.querySelector('.hw-mk-line-note'), on ? whole(sold) + ' sold on ' + whole(days.length) + (days.length === 1 ? ' day' : ' days') + ', from ' + whole(Math.min(...days.map((d) => Number(d.low) || 0))) + ' to ' + whole(top) + ' each.' : '');
  const recent = page.recent.filter((r) => r && Number.isFinite(Number(r.each)));
  prop(root.querySelector('.hw-mk-sales-h'), 'hidden', !recent.length);
  const now = Date.now();
  rows(root.querySelector('.hw-mk-sales'), recent, {
    key: (r) => String(r.at) + ':' + r.qty,
    build: () => element(ctx.doc, '<li class="hw-mk-sale"></li>'),
    patch: (li, r) => text(li, whole(Number(r.qty)) + ' at ' + whole(Number(r.each)) + ' each · ' + ageWords(Date.parse(r.at), now)),
  });
}

function patchPage(root, v) {
  const { sc, ctx } = v;
  const pageEl = root.querySelector('.hw-mk-page');
  const id = sc.pick;
  prop(pageEl, 'hidden', !id);
  if (!id) return;
  const ico = root.querySelector('.hw-mk-ico');
  if (ico.getAttribute('data-item') !== id) { attr(ico, 'data-item', id); ico.innerHTML = itemIconHtml(ctx.glyphs, id); }
  text(root.querySelector('.hw-mk-name'), itemName(id));
  text(root.querySelector('.hw-mk-kind'), kindWords(id));
  const lore = [flavourOf(id), ...sourcesOf(id).slice(0, 2), ...usesOf(id).slice(0, 1)].filter(Boolean);
  text(root.querySelector('.hw-mk-lore'), lore.join(' · '));
  const page = sc.page && sc.page.id === id ? sc.page : null;
  const s = page ? page.item : sc.known.get(id) || null;
  const sample = page ? priceSample(page) : null;
  const now = Date.now();
  text(root.querySelector('.hw-mk-price'), !s ? 'Reading the market…' : !s.listable ? 'This can\'t be sold to other players.'
    : [s.typical !== null ? 'Usually ' + whole(s.typical) + ' each' : '', s.lastEach !== null ? 'last sold ' + whole(s.lastEach) + ', ' + ageWords(s.lastAt, now) : '', sample && sample.sales7d ? sample.line : ''].filter(Boolean).join(' · '));
  patchAsks(root, ctx, sc, page, v.off);
  const none = root.querySelector('.hw-mk-asks-none');
  const empty = page && !page.asks.length;
  text(none, !page ? '' : empty ? (s ? noneWords(s, now) : 'No one is selling this.') : '');
  prop(none, 'hidden', !empty);
  if (page) { patchBuy(root, v, page); patchLine(root, ctx, page); } else cls(root.querySelector('.hw-mk-buy'), 'is-on', false);
}

/** Paint the Browse pane. */
export function patchBrowse(v) {
  const { cs, sc, root, ctx } = v;
  const pane = root.querySelector('.hw-mk-browse');
  const view = viewOf(cs);
  const input = pane.querySelector('.hw-q');
  if (ctx.doc.activeElement !== input) prop(input, 'value', sc.query);
  prop(pane.querySelector('[data-hs-act="mk-sort"]'), 'value', view.sort);
  for (const b of pane.querySelectorAll('.hw-cat')) {
    attr(b, 'aria-pressed', String(b.getAttribute('data-cat') === view.cat));
    prop(b, 'disabled', !!sc.query);
  }
  const list = listOf(sc, view);
  /* THE EMPTY MARKET READS AS AN INVITATION: said only once the server has answered that nothing is for sale. */
  const bare = sc.forSale !== null && !sc.forSale.length && !sc.query && !sc.closed;
  cls(pane.querySelector('.hw-mk-invite'), 'is-on', bare);
  text(pane.querySelector('.hw-mk-invite-p'), 'Nothing is for sale yet. Be the first: list something from your bag or your storage, and the Weighhouse holds it until someone buys it.');
  const cols = pane.querySelector('.hw-mk-cols');
  prop(cols, 'hidden', bare);
  if (!sc.pick && list.length && !ctx.isPhone()) { sc.pick = list[0].id; readItem(ctx, cs, sc, sc.pick); }
  const now = Date.now();
  rows(pane.querySelector('.hw-mk-list'), list, {
    key: (s) => s.id,
    build: (s) => rowLi(ctx, s.id),
    patch: (li, s) => {
      const on = sc.pick === s.id;
      cls(li, 'is-picked', on);
      attr(li, 'aria-selected', String(on));
      text(li.querySelector('small'), rowWords(s, now));
    },
  });
  cls(pane, 'is-paged', sc.paged && !!sc.pick);
  patchPage(pane, v);
}

/* ONE PRESS: the plan's lines in order, stopping at the first that does not land. */
async function runBuy(o, plan, deliver) {
  const { ctx, cs, sc, repaint } = o;
  const item = sc.pick;
  const g = sc.gesture && sc.gesture.kind === 'buy' && sc.gesture.item === item ? sc.gesture
    : holdGesture(sc, { kind: 'buy', item, deliver, lines: plan.lines.map((l) => Object.assign({ key: marketKey() }, l)), bought: 0, spent: 0 });
  sc.pending = true;
  sc.msg = 'Buying…';
  repaint();
  let stop = null;
  while (g.lines.length) {
    const l = g.lines[0];
    let r;
    try { r = await marketBuy(ctx.account, cs, { listing: l.listing, qty: l.qty, maxEach: l.each, deliver: g.deliver, key: l.key }); } catch (e) { r = { ok: false, error: 'network' }; }
    if (!r.ok) { stop = r; break; }
    g.bought += l.qty;
    g.spent += l.qty * l.each;
    g.lines.shift();
  }
  sc.pending = false;
  const name = itemName(item);
  if (stop && answerLost(stop)) { sc.msg = LOST_WORDS; repaint(); return; }
  dropGesture(sc);
  const done = g.bought ? 'Bought ' + whole(g.bought) + ' ' + name + ' for ' + goldWords(g.spent) + '.' : '';
  const raced = stop && ['gone', 'not_enough', 'expired'].includes(stop.error);
  sc.msg = !stop ? done + (g.deliver === 'storage' ? ' It\'s in your storage.' : ' It\'s in your bag.')
    : raced && g.bought ? done + ' The rest sold first, so nothing more was charged. The next prices are below.'
    : (done ? done + ' ' : '') + refusalText(stop, cs);
  if (!stop) sc.want = 1;
  repaint();
  await rereadAll(ctx, cs, sc);
}

/** Browse's presses. True when one was handled. */
export function actBrowse(o, action, ev, t) {
  const { ctx, cs, sc, repaint } = o;
  if (action === 'mk-pick') {
    const id = t.getAttribute('data-item');
    if (ev.type === 'mouseover') { showTip(ctx.doc, t, id, {}); return false; }
    if (ev.type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
    if (ev.type !== 'click') return false;
    hideTip(ctx.doc);
    if (sc.pick !== id) { sc.want = 1; if (sc.gesture && sc.gesture.kind === 'buy') dropGesture(sc); }
    sc.pick = id;
    sc.paged = true;
    sc.msg = '';
    repaint();
    readItem(ctx, cs, sc, id);
    return true;
  }
  if (action === 'mk-search' && ev.type === 'input') {
    sc.query = t.value.slice(0, 40);
    searchSoon(ctx, cs, sc, searchIds(sc.query, SEARCH_MAX));
    repaint();
    return false;
  }
  if (action === 'mk-sort' && ev.type === 'change') { setView(cs, 'sort', t.value); repaint(); return false; }
  if (action === 'mk-deliver' && ev.type === 'change') { setView(cs, 'deliver', t.value); repaint(); return false; }
  if (action === 'mk-count' && ev.type === 'input') {
    const n = Math.floor(Number(t.value));
    sc.want = Number.isSafeInteger(n) && n > 0 ? n : 0;
    repaint();
    return false;
  }
  if (ev.type !== 'click') return false;
  if (action === 'mk-cat') { setView(cs, 'cat', t.getAttribute('data-cat')); repaint(); return true; }
  if (action === 'mk-back') { sc.paged = false; repaint(); return true; }
  if (action === 'mk-to-sell') { sc.tab = 'sell'; sc.msg = ''; repaint(); return true; }
  if (action === 'mk-want') {
    const w = t.getAttribute('data-want');
    sc.want = w === 'all' || w === 'afford' ? w : Number(w);
    repaint();
    return true;
  }
  if (action === 'mk-forget') { dropGesture(sc); sc.msg = ''; repaint(); rereadAll(ctx, cs, sc); return true; }
  if (action === 'mk-cancel') {
    const listing = t.getAttribute('data-listing');
    if (!sc.pending) cancelListing(o, listing);
    return true;
  }
  if (action === 'mk-buy') {
    const page = sc.page && sc.page.id === sc.pick ? sc.page : null;
    if (!page || sc.pending || t.disabled) return true;
    const plan = planBuy(page.asks, wanted(sc, page.asks, goldOf(cs)));
    if (plan.qty || sc.gesture) runBuy(o, plan, viewOf(cs).deliver);
    return true;
  }
  return false;
}

/** Take one listing back: its own key until a definite answer. Shared with My listings. */
export async function cancelListing(o, listing) {
  const { ctx, cs, sc, repaint } = o;
  sc.pending = true;
  sc.msg = 'Taking it back…';
  repaint();
  let r;
  try { r = await marketCancel(ctx.account, cs, listing, cancelKey(sc, listing)); } catch (e) { r = { ok: false, error: 'network' }; }
  sc.pending = false;
  if (answerLost(r)) { sc.msg = 'No answer from the Weighhouse. Press Cancel again: it\'s safe.'; repaint(); return; }
  sc.cancels.delete(listing);
  const c = r.ok && r.receipt ? r.receipt : null;
  sc.msg = !r.ok ? refusalText(r, cs) : c && c.item_id ? 'Canceled. ' + whole(c.qty) + ' ' + itemName(c.item_id) + (c.qty === 1 ? ' is' : ' are') + ' back in your storage.' : 'Canceled. It\'s back in your storage.';
  repaint();
  await rereadAll(ctx, cs, sc);
}
