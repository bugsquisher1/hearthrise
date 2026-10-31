// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/market/sell.js — SELL: A STACK FROM THE BAG OR STORAGE, PRICED IN THE OPEN.
//
// The list is the viewed hero's bag or the account's Storage, each stack with the shop's bid
// and the market's lowest beside it. The sheet beside it shows the fee and the cut before the
// press: "Listing fee: 8 gold now (kept if it doesn't sell). When one sells, the Weighhouse
// keeps 4%: you get 230 each. Listed for 7 days; anything unsold comes back to your storage."
//
// THE PRICE CHIPS (Security market review change 5, threat model #10): a one-press chip only
// from what no other account can steer: Suggested (the catalogue's value) and Your last price.
// Lowest now and Last sold can be printed by a pair of accounts, so they stand beside the box
// as numbers with their sales count, and the player types the price, until the server's read
// carries the sample rules. A listing's price then only ever comes from this player's eyes.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, attr, prop, element } from '../../../render/paint.js?v=0.2.76';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.76';
import { whole } from '../../../render/format.js?v=0.2.76';
import { ITEMS } from '../../../data/items.js?v=0.2.76';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.76';
import { bagOf, bankOf, shopOf, rulesOf as bagRulesOf, nameOf, presetsOf, goldOf } from '../../../session/item-sections.js?v=0.2.76';
import { refusalText } from '../../intent-words.js?v=0.2.76';
import { marketList } from '../../../session/market-intents.js?v=0.2.76';
import { marketKey, answerLost } from '../../../session/market-gesture.js?v=0.2.76';
import { feeOf, netEachOf, sellRowWords, goldWords, priceSample, ageWords } from '../../market-model.js?v=0.2.76';
import { showTip, hideTip } from '../item-tip.js?v=0.2.76';
import { viewOf, setView, readItem, readNamed, rereadAll, holdGesture, dropGesture } from './state.js?v=0.2.76';

/** The Sell pane's skeleton. */
export function sellHtml() {
  return '<section class="hw-pane hw-mk-sell" data-pane="sell"><div class="hw-mk-from" role="group" aria-label="Sell from">'
    + '<button type="button" class="hh-seg" data-hs-act="ms-from" data-from="bag" aria-pressed="true"></button>'
    + '<button type="button" class="hh-seg" data-hs-act="ms-from" data-from="storage" aria-pressed="false">Storage</button><p class="hs-note hw-mk-kept"></p></div>'
    + '<div class="hw-mk-cols"><ul class="hw-mk-list" role="listbox" aria-label="What to sell"></ul>'
    + '<section class="hw-mk-page" aria-label="The picked stack"><div class="hw-hd-page">'
    + '<button type="button" class="hh-tool hw-hd-back" data-hs-act="ms-back">Back to the list</button>'
    + '<p class="hh-empty hw-mk-pickone">Pick a stack to see what it would fetch.</p>'
    + '<div class="hw-mk-sheet"><div class="hw-mk-head"><span class="hw-ico hw-mk-ico"></span><div class="hw-mk-title"><h3 class="hw-hd-name hw-mk-name"></h3><p class="hw-hd-band hw-mk-kind"></p></div></div>'
    + '<dl class="hw-mk-facts"><dt>The shop pays</dt><dd data-f="shop"></dd><dt>Lowest now</dt><dd data-f="low"></dd><dt>Last sold</dt><dd data-f="last"></dd></dl>'
    + '<div class="hw-mk-field"><label for="hw-mk-qty">How many</label><span class="hw-mk-chips"><input id="hw-mk-qty" type="number" min="1" step="1" class="hh-num" data-hs-act="ms-qty">'
    + '<button type="button" class="hh-seg" data-hs-act="ms-share" data-share="all">All</button><button type="button" class="hh-seg" data-hs-act="ms-share" data-share="half">Half</button></span></div>'
    + '<div class="hw-mk-field"><label for="hw-mk-ask">Price each</label><span class="hw-mk-chips"><input id="hw-mk-ask" type="number" min="1" step="1" class="hh-num" data-hs-act="ms-ask">'
    + '<button type="button" class="hh-seg" data-hs-act="ms-chip" data-chip="suggested"></button><button type="button" class="hh-seg" data-hs-act="ms-chip" data-chip="last"></button></span></div>'
    + '</div></div>'
    /* The terms and List stand at the foot OUTSIDE the scroller: what it costs is read right beside the press. */
    + '<div class="hw-mk-foot hw-mk-sellfoot"><p class="hw-mk-terms"></p><p class="hs-note hw-mk-warn"></p><p class="hw-why hw-mk-why"></p>'
    + '<div class="hw-mk-do"><button type="button" class="hw-primary is-on" data-hs-act="ms-list"></button>'
    + '<button type="button" class="hh-tool hw-mk-forget" data-hs-act="ms-forget" hidden>Forget it</button></div></div>'
    + '</section></div></section>';
}

/* The stacks of the chosen source that the server would list (or has not ruled on yet). */
function stacksOf(cs, sc, source) {
  const all = (source === 'storage' ? bankOf(cs) : bagOf(cs)) || [];
  const shown = [], kept = [];
  for (const r of all) {
    const s = sc.known.get(r.id);
    if (s && !s.listable) kept.push(r); else shown.push(r);
  }
  return { shown: shown.sort((a, b) => itemName(a.id).localeCompare(itemName(b.id))), kept };
}

/* The catalogue's own value, inside the server's floor and ceiling: the one price no player can steer. */
function suggested(id, s) {
  const book = ITEMS[id] && Number(ITEMS[id].v);
  if (!s || !Number.isFinite(book) || book <= 0) return null;
  return Math.min(s.ceiling === null ? book : s.ceiling, Math.max(s.floor === null ? book : s.floor, book));
}

/* What this player last asked for this item (their own history). */
function lastAsk(sc, id) {
  const row = sc.mine ? sc.mine.history.find((h) => h.what === 'listed' && h.item === id && Number.isSafeInteger(h.each)) : null;
  return row ? row.each : null;
}

const whole0 = (raw) => { const n = Math.floor(Number(raw)); return Number.isSafeInteger(n) && n > 0 ? n : 0; };

/* A saved setup that names this piece: the sheet says so, the design's "List it anyway?". */
function setupNaming(cs, id) {
  const presets = presetsOf(cs) || [];
  const hit = presets.find((p) => p && p.gear && Object.values(p.gear).includes(id));
  return hit ? (nameOf(cs) || 'Your hero') + '\'s setup ' + hit.name + ' wears this. List it anyway?' : '';
}

function patchSheet(pane, v, have, source) {
  const { cs, sc, ctx } = v;
  const f = sc.sell;
  const id = f.pick;
  const sheet = pane.querySelector('.hw-mk-sheet');
  const on = !!id && !!have;
  const foot = pane.querySelector('.hw-mk-sellfoot');
  cls(sheet, 'is-on', on);
  cls(foot, 'is-on', on);
  cls(pane.querySelector('.hw-mk-pickone'), 'is-on', !on);
  if (!on) return;
  const ico = sheet.querySelector('.hw-mk-ico');
  if (ico.getAttribute('data-item') !== id) { attr(ico, 'data-item', id); ico.innerHTML = itemIconHtml(ctx.glyphs, id); }
  text(sheet.querySelector('.hw-mk-name'), itemName(id));
  text(sheet.querySelector('.hw-mk-kind'), whole(have.qty) + (source === 'storage' ? ' in your storage' : ' in ' + (nameOf(cs) || 'your hero') + '\'s bag'));
  const s = sc.known.get(id) || null;
  const shop = shopOf(cs);
  const bid = shop && shop.bids.has(id) ? shop.bids.get(id) : null;
  const page = sc.page && sc.page.id === id ? sc.page : null;
  const sample = page ? priceSample(page) : null;
  text(sheet.querySelector('[data-f="shop"]'), bid === null ? 'Nothing' : goldWords(bid));
  text(sheet.querySelector('[data-f="low"]'), !s ? '…' : s.forSale ? whole(s.lowest) + ' each · ' + whole(s.forSale) + ' for sale' : 'No one is selling these');
  /* A number from history carries its sample; it is not a press (market review change 5). */
  text(sheet.querySelector('[data-f="last"]'), !s ? '…' : s.lastEach === null ? 'Never yet' : whole(s.lastEach) + ' each, ' + ageWords(s.lastAt, Date.now()) + (sample ? ' · ' + sample.line : ''));
  const sug = suggested(id, s);
  const mine = lastAsk(sc, id);
  /* The first price on the sheet is the catalogue's, once the server has said what it may be. */
  if (f.filled !== id && sug !== null) { f.ask = String(sug); f.filled = id; }
  const g = sc.gesture && sc.gesture.kind === 'list' && sc.gesture.item === id ? sc.gesture : null;
  const qtyEl = sheet.querySelector('[data-hs-act="ms-qty"]');
  const askEl = sheet.querySelector('[data-hs-act="ms-ask"]');
  if (f.qty === '') f.qty = String(have.qty);
  if (ctx.doc.activeElement !== qtyEl) prop(qtyEl, 'value', g ? String(g.qty) : f.qty);
  if (ctx.doc.activeElement !== askEl) prop(askEl, 'value', g ? String(g.ask) : f.ask);
  attr(qtyEl, 'max', String(have.qty));
  prop(qtyEl, 'disabled', v.off || !!g);
  prop(askEl, 'disabled', v.off || !!g);
  for (const b of sheet.querySelectorAll('[data-hs-act="ms-share"]')) prop(b, 'disabled', v.off || !!g);
  const sugB = sheet.querySelector('[data-chip="suggested"]');
  text(sugB, sug === null ? 'Suggested' : 'Suggested ' + whole(sug));
  prop(sugB, 'disabled', v.off || !!g || sug === null);
  const lastB = sheet.querySelector('[data-chip="last"]');
  text(lastB, mine === null ? '' : 'Your last price ' + whole(mine));
  prop(lastB, 'hidden', mine === null);
  prop(lastB, 'disabled', v.off || !!g);
  const qty = g ? g.qty : whole0(f.qty), ask = g ? g.ask : whole0(f.ask);
  const rules = sc.rules;
  const locked = (bagRulesOf(cs) || { locked: new Set() }).locked.has(id);
  const why = s && !s.listable ? 'Starter kit, gifts and trophies can\'t be sold to other players.'
    : locked ? 'This is locked. Unlock it in your bag to list it.'
    : !qty ? 'Say how many.' : qty > have.qty ? 'You only have ' + whole(have.qty) + '.'
    : !ask ? 'Set a price.'
    : s && s.floor !== null && ask < s.floor ? 'The shop pays ' + whole(s.floor) + ' for one. Ask at least that, or sell it at the shop.'
    : s && s.ceiling !== null && ask > s.ceiling ? 'That\'s more than this can be listed for. The most is ' + whole(s.ceiling) + ' each.'
    : '';
  const purse = goldOf(cs);
  const fee = rules && qty && ask ? feeOf(rules, qty, ask) : null;
  const shortFee = fee !== null && purse !== null && purse < fee ? 'The listing fee is ' + goldWords(fee) + '.' : '';
  text(foot.querySelector('.hw-mk-terms'), rules && fee !== null && !why
    ? 'Listing fee: ' + goldWords(fee) + ' now (kept if it doesn\'t sell). When one sells, the Weighhouse keeps ' + (rules.cutBp / 100) + '%: you get ' + whole(netEachOf(rules, ask)) + ' each. Listed for ' + Math.round(rules.ttlH / 24) + ' days; anything unsold comes back to your storage.'
    : '');
  /* A sale that pays less than the shop would is the seller's call, and the sheet says so (a 1-gold ask nets 0 after the cut). */
  const under = rules && ask && bid !== null && netEachOf(rules, ask) < bid ? 'At this price the shop pays you more than a sale would.' : '';
  text(foot.querySelector('.hw-mk-warn'), [under, setupNaming(cs, id)].filter(Boolean).join(' '));
  text(foot.querySelector('.hw-mk-why'), why || shortFee || f.msg);
  const press = foot.querySelector('[data-hs-act="ms-list"]');
  text(press, g ? 'Try again' : qty && ask ? 'List ' + whole(qty) + ' for ' + whole(ask) + ' each' : 'List');
  prop(press, 'disabled', v.off || !s || !!why || !!shortFee);
  attr(press, 'data-off-why', v.offWhy || why || shortFee || null);
  prop(foot.querySelector('.hw-mk-forget'), 'hidden', !g);
}

/** Paint the Sell pane. */
export function patchSell(v) {
  const { cs, sc, root, ctx } = v;
  const pane = root.querySelector('.hw-mk-sell');
  const f = sc.sell;
  const source = f.source || viewOf(cs).source;
  f.source = source;
  const heroBag = (nameOf(cs) || 'This hero') + '\'s bag';
  for (const b of pane.querySelectorAll('[data-hs-act="ms-from"]')) {
    attr(b, 'aria-pressed', String(b.getAttribute('data-from') === source));
    prop(b, 'disabled', sc.pending);
    if (b.getAttribute('data-from') === 'bag') text(b, heroBag);
  }
  /* A stack picked from elsewhere (the bag's menu, List again) reads its own page once. */
  if (f.pick && f.readFor !== f.pick) { f.readFor = f.pick; readItem(ctx, cs, sc, f.pick); }
  const { shown, kept } = stacksOf(cs, sc, source);
  const ids = shown.map((r) => r.id);
  if (ids.length) readNamed(ctx, cs, sc, ids);
  const shop = shopOf(cs);
  rows(pane.querySelector('.hw-mk-list'), shown, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-mk-row" role="option" data-hs-act="ms-pick" data-item="' + esc(r.id) + '" tabindex="-1"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.id) + '</span>'
      + '<span class="hw-line-name"><b>' + esc(itemName(r.id)) + '</b><small></small></span></li>'),
    patch: (li, r) => {
      const on = f.pick === r.id;
      cls(li, 'is-picked', on);
      attr(li, 'aria-selected', String(on));
      text(li.querySelector('small'), sellRowWords(sc.known.get(r.id) || null, shop && shop.bids.has(r.id) ? shop.bids.get(r.id) : null, r.qty));
    },
  });
  text(pane.querySelector('.hw-mk-kept'), !shown.length && !kept.length ? (source === 'storage' ? 'Your storage is empty.' : 'This bag is empty. Loot from a hunt lands here.')
    : kept.length ? whole(kept.length) + (kept.length === 1 ? ' stack' : ' stacks') + ' here can\'t be sold to other players: starter kit, gifts and trophies.' : '');
  cls(pane, 'is-paged', sc.paged && !!f.pick);
  cls(pane, 'is-bare', !shown.length);
  patchSheet(pane, v, f.pick ? [...shown, ...kept].find((r) => r.id === f.pick) : null, source);
}

/* ONE PRESS, ONE KEY: a lost answer keeps the gesture, and the next press resends exactly it. */
async function runList(o) {
  const { ctx, cs, sc, repaint } = o;
  const f = sc.sell;
  const g = sc.gesture && sc.gesture.kind === 'list' && sc.gesture.item === f.pick ? sc.gesture
    : holdGesture(sc, { kind: 'list', item: f.pick, source: f.source, qty: whole0(f.qty), ask: whole0(f.ask), key: marketKey() });
  sc.pending = true;
  sc.msg = 'Taking it to the scales…';
  f.msg = '';
  repaint();
  let r;
  try { r = await marketList(ctx.account, cs, { source: g.source, item: g.item, qty: g.qty, askEach: g.ask, key: g.key }); } catch (e) { r = { ok: false, error: 'network' }; }
  sc.pending = false;
  const said = r.ok ? '' : refusalText(r, cs);
  if (answerLost(r)) { sc.msg = 'No answer from the Weighhouse. Press again: it won\'t list twice.'; repaint(); return; }
  dropGesture(sc);
  if (r.ok) {
    const fee = r.receipt && Number.isSafeInteger(r.receipt.fee) ? ' The fee was ' + goldWords(r.receipt.fee) + '.' : '';
    sc.msg = 'Listed ' + whole(g.qty) + ' ' + itemName(g.item) + ' for ' + whole(g.ask) + ' each.' + fee;
    f.pick = null; f.qty = ''; f.ask = ''; f.filled = null;
    sc.paged = false;
  } else sc.msg = said;
  repaint();
  await rereadAll(ctx, cs, sc);
}

/** Sell's presses. True when one was handled. */
export function actSell(o, action, ev, t) {
  const { ctx, cs, sc, repaint } = o;
  const f = sc.sell;
  if (action === 'ms-pick') {
    const id = t.getAttribute('data-item');
    if (ev.type === 'mouseover') { showTip(ctx.doc, t, id, {}); return false; }
    if (ev.type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
    if (ev.type !== 'click') return false;
    hideTip(ctx.doc);
    if (f.pick !== id) { f.pick = id; f.qty = ''; f.ask = ''; f.filled = null; f.msg = ''; if (sc.gesture && sc.gesture.kind === 'list') dropGesture(sc); }
    sc.paged = true;
    sc.msg = '';
    repaint();
    readItem(ctx, cs, sc, id);
    return true;
  }
  if (action === 'ms-qty' && ev.type === 'input') { f.qty = t.value.slice(0, 12); repaint(); return false; }
  if (action === 'ms-ask' && ev.type === 'input') { f.ask = t.value.slice(0, 12); f.filled = f.pick; repaint(); return false; }
  if (ev.type !== 'click') return false;
  if (action === 'ms-from') { const s = t.getAttribute('data-from'); f.source = s; f.pick = null; f.qty = ''; f.ask = ''; f.filled = null; sc.paged = false; setView(cs, 'source', s); repaint(); return true; }
  if (action === 'ms-back') { sc.paged = false; repaint(); return true; }
  if (action === 'ms-share') {
    const all = ((f.source === 'storage' ? bankOf(cs) : bagOf(cs)) || []).find((r) => r.id === f.pick);
    if (all) { f.qty = String(t.getAttribute('data-share') === 'half' ? Math.max(1, Math.floor(all.qty / 2)) : all.qty); repaint(); }
    return true;
  }
  if (action === 'ms-chip') {
    const s = sc.known.get(f.pick) || null;
    const n = t.getAttribute('data-chip') === 'last' ? lastAsk(sc, f.pick) : suggested(f.pick, s);
    if (n !== null) { f.ask = String(n); f.filled = f.pick; repaint(); }
    return true;
  }
  if (action === 'ms-forget') { dropGesture(sc); sc.msg = ''; repaint(); rereadAll(ctx, cs, sc); return true; }
  if (action === 'ms-list') { if (!sc.pending && !t.disabled && f.pick) runList(o); return true; }
  return false;
}
