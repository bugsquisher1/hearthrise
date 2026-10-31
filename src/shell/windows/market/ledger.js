// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/market/ledger.js — MY LISTINGS AND HISTORY: THE ACCOUNT'S OWN BOOK.
//
// Both read hr_market_mine, the account's own rows only. My listings: "2 of 3 left · 240
// each · 6 days left · received 230" with Cancel, which any hero of the account may press.
// History: 30 days of sales, purchases, returns and fees, with List again on anything that
// came back and Buy again on anything bought. The other party is never named: the server's
// rows hold no name to show.
// ════════════════════════════════════════════════════════════════════════
import { rows, text, cls, prop, element } from '../../../render/paint.js?v=0.2.76';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.76';
import { whole } from '../../../render/format.js?v=0.2.76';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.76';
import { nameOf } from '../../../session/item-sections.js?v=0.2.76';
import { listingWords, historyWords } from '../../market-model.js?v=0.2.76';
import { offerForSale, readItem, setView } from './state.js?v=0.2.76';
import { cancelListing } from './browse.js?v=0.2.76';

/** The two ledger panes' skeletons. */
export function ledgerHtml() {
  return '<section class="hw-pane hw-mk-book" data-pane="mine"><ul class="hw-ledger hw-mk-mine"></ul>'
    + '<div class="hw-mk-none"><p class="hh-empty hw-mk-none-p"></p><button type="button" class="hw-primary is-on" data-hs-act="mk-to-sell">List something</button></div>'
    + '<p class="hw-cap hw-mk-caps"></p></section>'
    + '<section class="hw-pane hw-mk-book" data-pane="history"><ul class="hw-ledger hw-mk-hist"></ul><p class="hh-empty hw-mk-hist-none"></p></section>';
}

/* The hero a listing came from, by the server's slot: this account's own, never another's. */
function heroName(ctx, slot) {
  const c = ctx.account && typeof ctx.account.character === 'function' ? ctx.account.character(slot) : null;
  return c ? nameOf(c) : null;
}

/** Paint whichever of the two is showing. */
export function patchLedger(v) {
  const { sc, root, ctx } = v;
  const now = Date.now();
  const mine = sc.mine;
  if (sc.tab === 'mine') {
    const list = mine ? mine.listings : [];
    rows(root.querySelector('.hw-mk-mine'), list, {
      key: (l) => l.id,
      build: (l) => element(ctx.doc, '<li class="hw-line"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, l.item) + '</span><span class="hw-line-name"><b>' + esc(itemName(l.item)) + '</b><small></small></span>'
        + '<button type="button" class="hh-tool" data-hs-act="mk-cancel" data-listing="' + esc(l.id) + '">Cancel</button></li>'),
      patch: (li, l) => {
        const by = heroName(ctx, l.hero);
        text(li.querySelector('small'), listingWords(l, now) + (by ? ' · listed by ' + by : ''));
        prop(li.querySelector('button'), 'disabled', sc.pending);
      },
    });
    const bare = !!mine && !list.length;
    cls(root.querySelector('.hw-mk-none'), 'is-on', bare);
    cls(root.querySelector('.hw-mk-none-p'), 'is-on', bare);
    text(root.querySelector('.hw-mk-none-p'), 'You have nothing listed. Anything you list stays here until it sells, and you can take it back any time.');
    const t = mine ? mine.today : {};
    text(root.querySelector('.hw-mk-caps'), !mine || !sc.rules ? '' : whole(list.length) + ' of ' + whole(sc.rules.maxListings) + ' listings up · ' + whole(Number(t.listed) || 0) + ' of ' + whole(sc.rules.maxListsPerDay) + ' listed today');
    return;
  }
  const hist = mine ? mine.history : [];
  rows(root.querySelector('.hw-mk-hist'), hist, {
    key: (h) => [h.at, h.what, h.item, h.qty].join(':'),
    build: (h) => {
      const again = h.what === 'bought' ? ['mk-buy-again', 'Buy again'] : h.what === 'returned' || h.what === 'cancelled' ? ['mk-list-again', 'List again'] : null;
      return element(ctx.doc, '<li class="hw-line"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, h.item) + '</span><span class="hw-line-name"><b></b><small></small></span>'
        + (again ? '<button type="button" class="hh-tool" data-hs-act="' + again[0] + '" data-item="' + esc(h.item) + '" data-qty="' + h.qty + '">' + again[1] + '</button>' : '') + '</li>');
    },
    patch: (li, h) => {
      const w = historyWords(h, now);
      text(li.querySelector('b'), w.line);
      text(li.querySelector('small'), w.when);
      const b = li.querySelector('button');
      if (b) prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-mk-hist-none');
  text(none, mine && !hist.length ? 'Nothing yet. Your sales, purchases and returns stay here for 30 days.' : '');
  cls(none, 'is-on', !!(mine && !hist.length));
}

/** The ledger's presses. True when one was handled. */
export function actLedger(o, action, ev, t) {
  if (ev.type !== 'click') return false;
  const { ctx, cs, sc, repaint } = o;
  if (action === 'mk-buy-again') {
    const id = t.getAttribute('data-item');
    sc.tab = 'browse';
    sc.pick = id;
    sc.want = 1;
    sc.paged = true;
    sc.msg = '';
    setView(cs, 'cat', 'all');
    repaint();
    readItem(ctx, cs, sc, id);
    return true;
  }
  if (action === 'mk-list-again') {
    const id = t.getAttribute('data-item');
    const last = sc.mine ? sc.mine.history.find((h) => h.what === 'listed' && h.item === id && Number.isSafeInteger(h.each)) : null;
    offerForSale(ctx, id, 'storage', { qty: Number(t.getAttribute('data-qty')) || undefined, each: last ? last.each : undefined });
    readItem(ctx, cs, sc, id);
    return true;
  }
  return false;
}
