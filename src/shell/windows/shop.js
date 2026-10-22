// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/shop.js — THE SHOP: A STALL LEDGER (WORLD_SHELL §4).
//
// Two tabs on one ledger, every price the SERVER's (`shop` section):
//   Buy     the tools, one list (Tyler 2026-10-20: the Shop keeps gear and tools and sells
//           NO supplies; food, drink and ammo come from the action bar at the
//           store price per use), each with the server's price, what is in the
//           bag, a count and a Buy button that shows the total for that count
//           before it is pressed. ONE `shop_buy` { offer, qty }.
//   Sell    every unlocked bag stack the shop bids on, loot first, one Sell per
//           line and "Sell all loot" — each a confirmation with the total, then
//           ONE `vendor_sell_many`. Locked stacks are listed as kept.
// Every control is off while an intent is in flight; counts and gold change
// only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { shopOf, bagOf, rulesOf, goldOf } from '../../session/item-sections.js?v=0.2.27';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.27';
import { whole, gold } from '../../render/format.js?v=0.2.27';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.27';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.2.27';
import { kindOf, sellPlan, lootToSell } from '../bag-model.js?v=0.2.27';
import { runIntent } from '../intent-words.js?v=0.2.27';
import { showTip, hideTip } from './item-tip.js?v=0.2.27';

const TABS = Object.freeze([['buy', 'Buy'], ['sell', 'Sell']]);
const QTYS = Object.freeze([1, 5, 10, 25, 50, 100]);
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { tab: 'buy', qty: {}, confirm: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The skeleton (built once per opening). */
export function renderShop() {
  return '<div class="hw-shop">'
    + '<div class="hw-tabs" role="tablist">' + TABS.map(([id, l], i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '">' + esc(l) + '</button>').join('') + '</div>'
    + '<p class="hw-cap"><span class="hw-gold"></span><span class="hw-shop-note"></span></p>'
    + '<section class="hw-pane" data-pane="buy">'
    + '<h3 class="hw-ledger-head hw-buy-head">Tools</h3><ul class="hw-ledger hw-buy-list"></ul>'
    + '<p class="hh-empty hw-buy-none">The shop has no prices for you yet.</p></section>'
    + '<section class="hw-pane" data-pane="sell">'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="sell-loot"></button></div>'
    + '<ul class="hw-ledger hw-sell-list"></ul><p class="hh-empty hw-sell-none">Nothing in your bag that the shop buys.</p>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">Cancel</button></div></div></section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function offerRow(ctx, o) {
  return element(ctx.doc, '<li class="hw-line" data-hs-act="line" data-item="' + esc(o.item) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, o.item) + '</span>'
    + '<span class="hw-line-name"><b>' + esc(itemName(o.item)) + '</b><small></small></span>'
    + '<select class="hh-select hw-qty" data-hs-act="qty" data-offer="' + esc(o.offer) + '" aria-label="How many">' + QTYS.map((n) => '<option value="' + n + '">' + n + '</option>').join('') + '</select>'
    + '<button type="button" class="hh-tool" data-hs-act="buy" data-offer="' + esc(o.offer) + '"></button></li>');
}

function patchBuy(root, st, ctx) {
  /* The server's offers as the session reads them: the tools (item-sections.js shopOf drops any other kind). */
  const offers = st.shop ? st.shop.offers : [];
  cls(root.querySelector('.hw-buy-head'), 'is-on', offers.length > 0);
  rows(root.querySelector('.hw-buy-list'), offers, {
    key: (o) => o.offer,
    build: (o) => offerRow(ctx, o),
    patch: (li, o) => {
      const n = st.sc.qty[o.offer] || 1;
      text(li.querySelector('small'), gold(o.price) + ' each · ' + whole(st.qty.get(o.item) || 0) + ' in the bag');
      prop(li.querySelector('select'), 'value', String(n));
      const b = li.querySelector('[data-hs-act="buy"]');
      text(b, 'Buy ' + n + ' · ' + gold(o.price * n));
      prop(b, 'disabled', st.sc.pending || (st.gold !== null && st.gold < o.price * n));
    },
  });
  cls(root.querySelector('.hw-buy-none'), 'is-on', !offers.length);
}

function patchSell(root, st, ctx) {
  const sc = st.sc;
  const locked = st.rules ? st.rules.locked : new Set();
  const bids = st.shop ? st.shop.bids : new Map();
  const list = st.items.filter((r) => bids.has(r.id)).sort((a, b) => (kindOf(b.id) === 'loot') - (kindOf(a.id) === 'loot') || bids.get(b.id) * b.qty - bids.get(a.id) * a.qty);
  rows(root.querySelector('.hw-sell-list'), list, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-line" data-hs-act="line" data-item="' + esc(r.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.id) + '</span>'
      + '<span class="hw-line-name"><b>' + esc(itemName(r.id)) + '</b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="sell" data-item="' + esc(r.id) + '"></button></li>'),
    patch: (li, r) => {
      const isLocked = locked.has(r.id);
      text(li.querySelector('small'), '×' + whole(r.qty) + ' · ' + gold(bids.get(r.id)) + ' each' + (isLocked ? ' · locked' : ''));
      const b = li.querySelector('button');
      text(b, isLocked ? 'Locked' : 'Sell · ' + gold(bids.get(r.id) * Math.min(r.qty, 1000)));
      prop(b, 'disabled', sc.pending || isLocked);
    },
  });
  cls(root.querySelector('.hw-sell-none'), 'is-on', !list.length);
  const loot = lootToSell(st.items);
  const plan = sellPlan(st.items, loot, { locked, bids });
  const lb = root.querySelector('[data-hs-act="sell-loot"]');
  text(lb, 'Sell all loot' + (plan.lines.length ? ' · ' + gold(plan.total) : ''));
  prop(lb, 'disabled', sc.pending || !plan.lines.length);
  const cf = root.querySelector('[data-pane="sell"] .hw-confirm');
  cls(cf, 'is-on', !!sc.confirm);
  if (sc.confirm) {
    const p = sc.confirm;
    text(cf.querySelector('.hw-confirm-q'), p.lines.length === 1 ? 'Sell ' + itemName(p.lines[0].item) + ' ×' + whole(p.lines[0].qty) + '?' : 'Sell ' + p.lines.length + ' stacks?');
    text(cf.querySelector('.hw-confirm-note'), p.kept.length ? p.kept.length + (p.kept.length === 1 ? ' locked stack is' : ' locked stacks are') + ' kept.' : '');
    const yes = cf.querySelector('[data-hs-act="confirm-yes"]');
    text(yes, 'Sell for ' + gold(p.total));
    prop(yes, 'disabled', sc.pending);
  }
}

renderShop.patch = function patchShop(body, ctx) {
  const cs = ctx.character;
  const items = bagOf(cs) || [];
  const st = { cs, sc: scratchOf(cs), shop: shopOf(cs), rules: rulesOf(cs), items, gold: goldOf(cs), qty: new Map(items.map((r) => [r.id, r.qty])) };
  const root = body.querySelector('.hw-shop');
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === st.sc.tab));
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === st.sc.tab);
  text(root.querySelector('.hw-gold'), 'Your gold ' + gold(st.gold));
  text(root.querySelector('.hw-shop-note'), st.shop ? '' : 'Prices load from the server.');
  if (st.sc.tab === 'buy') patchBuy(root, st, ctx);
  else patchSell(root, st, ctx);
  text(root.querySelector('.hh-intent-msg'), st.sc.msg);
  cls(root, 'is-pending', st.sc.pending);
};

renderShop.events = Object.freeze(['mouseover', 'mouseout']);

renderShop.act = function actShop(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderShop.patch(body, ctx);
  const shop = shopOf(cs);
  if (ev.type === 'mouseover' && action === 'line') {
    const id = t.getAttribute('data-item');
    const bag = bagOf(cs) || [];
    const have = bag.find((r) => r.id === id);
    showTip(ctx.doc, t, id, { qty: have ? have.qty : 0, bid: shop ? (shop.bids.has(id) ? shop.bids.get(id) : null) : undefined, offers: shop ? shop.offers : null });
    return false;
  }
  if (ev.type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
  if (ev.type === 'change') {
    if (action === 'qty') { sc.qty[t.getAttribute('data-offer')] = Number(t.value) || 1; repaint(); }
    return false;
  }
  if (ev.type !== 'click') return false;
  if (action === 'tab') { sc.tab = t.getAttribute('data-tab'); sc.confirm = null; sc.msg = ''; repaint(); return true; }
  if (action === 'buy') {
    const offer = t.getAttribute('data-offer');
    const before = goldOf(cs);
    runIntent(sc, repaint, () => cs.edgeIntent('shop_buy', { offer, qty: sc.qty[offer] || 1 }), 'Buying…',
      () => { const after = goldOf(cs); return before !== null && after !== null ? 'Paid ' + gold(before - after) + '.' : 'Bought.'; });
    return true;
  }
  if (action === 'sell' || action === 'sell-loot') {
    const items = bagOf(cs) || [];
    const rules = rulesOf(cs);
    const ids = action === 'sell' ? [t.getAttribute('data-item')] : lootToSell(items);
    const plan = sellPlan(items, ids, { locked: rules ? rules.locked : null, bids: shop ? shop.bids : null });
    sc.confirm = plan.lines.length ? plan : null;
    repaint();
    return true;
  }
  if (action === 'confirm-no') { sc.confirm = null; repaint(); return true; }
  if (action === 'confirm-yes' && sc.confirm) {
    const lines = sc.confirm.lines;
    const before = goldOf(cs);
    sc.confirm = null;
    runIntent(sc, repaint, () => cs.edgeIntent('vendor_sell_many', { lines }), 'Selling…',
      () => { const after = goldOf(cs); return before !== null && after !== null ? 'The shop paid ' + gold(after - before) + '.' : 'Sold.'; });
    return true;
  }
  return false;
};
