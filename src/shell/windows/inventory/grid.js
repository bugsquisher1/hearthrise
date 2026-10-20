// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/grid.js — THE INVENTORY'S ITEM SIDE: SEARCH, GRID, TOOLS.
//
// The right-hand half of the Inventory (index.js): a real slot grid, one sunk
// pocket per stack (pockets.js: the 32 px icon at ×1, the count, rarity, the
// "new", lock and bar-key marks). Above it, across the window: the Bag and
// This hunt tabs, the search (the ONLY item search in the game, with the
// Storage window's: it also lists where else the item is, elsewhere.js), the
// sort and the category row (remembered, residue `bagView`). Below it: the
// picked stack's line with its ONE primary action, the bulk tools (sell the
// selection, sell junk, sell a whole category) and their confirmation with
// the total. This hunt lists what the running hunt picked up with each item's
// loot rule (keep / sell at the shop / leave it), applied by the server on
// pickup.
//
// Every count is the envelope's `inventory`, replaced, never merged; every
// action is ONE intent with the controls off until the server answers
// (actions.js). Patched in place (src/render/paint.js).
// ════════════════════════════════════════════════════════════════════════
import { BAG_CATS, BAG_SORTS, isNew, bagValue } from '../../bag-model.js?v=0.2.19';
import { barIndexOf, barKeyLabel } from '../../bar-assign.js?v=0.2.19';
import { rows, text, cls, attr, prop, element } from '../../../render/paint.js?v=0.2.19';
import { whole, gold } from '../../../render/format.js?v=0.2.19';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.19';
import { glyphSvg } from '../../launcher.js?v=0.2.19';
import { itemIconHtml, itemName } from '../../widgets/bits.js?v=0.2.19';
import { primaryOf, junkOf, confirmWords, huntLoot } from './state.js?v=0.2.19';
import { pocketHtml, patchCount } from './pockets.js?v=0.2.19';
import { elsewhereHtml, patchElsewhere } from './elsewhere.js?v=0.2.19';
import { buryLine, buryBlock, buryingOf, buryRecipeOf } from './bury.js?v=0.2.19';

const RULES = Object.freeze([['keep', 'Keep'], ['sell', 'Sell at the shop'], ['ignore', 'Leave it']]);
export const KEYS = '/ search · arrows move · Enter use · Space select · Delete sell · L lock · Ctrl+A select all';

/** The toolbar across the window (tabs, search, sort, categories). */
export function toolbarHtml(g) {
  return '<div class="hw-tabs" role="tablist">'
    + '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="bag" aria-selected="true">Bag</button>'
    + '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="hunt" aria-selected="false">This hunt</button></div>'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off"></span>'
    + '<label class="hw-sort"><span>Sort</span><select class="hh-select" data-hs-act="sort">' + BAG_SORTS.map(([id, l]) => '<option value="' + id + '">' + esc(l) + '</option>').join('') + '</select></label></div>'
    + '<div class="hw-cats" role="group" aria-label="Show">' + BAG_CATS.map(([id, l]) => '<button type="button" class="hw-cat" data-hs-act="cat" data-cat="' + id + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>';
}

/** The grid column: the bag pane's pockets and the hunt pane's loot list. */
export function gridHtml() {
  return '<section class="hw-pane" data-pane="bag">'
    + '<ul class="hw-pockets" role="listbox" aria-label="Bag" aria-multiselectable="true"></ul>'
    + '<p class="hh-empty hw-none"></p>' + elsewhereHtml() + '</section>'
    + '<section class="hw-pane" data-pane="hunt">'
    + '<p class="hw-cap"><span class="hw-loot-sum"></span></p>'
    + '<ul class="hw-loot"></ul><p class="hh-empty hw-loot-none">Nothing picked up yet. What a hunt brings back shows here, with what to do with each item next time.</p>'
    + '<p class="hw-loot-note"></p></section>';
}

/** Under both columns: the picked stack's line, the bulk tools and their confirmation. */
export function toolsHtml(g) {
  return '<div class="hw-pick"><span class="hw-pick-ico"></span><span class="hw-pick-name"><b></b><small></small></span>'
    + '<button type="button" class="hw-primary" data-hs-act="primary"></button>'
    + '<button type="button" class="hh-tool hw-more" data-hs-act="more" aria-label="More for this item">' + glyphSvg(g, 'uiPlus') + '</button></div>'
    + '<div class="hw-burying" role="status"><span class="hw-burying-q"></span><button type="button" class="hh-tool" data-hs-act="bury-stop">Stop</button></div>'
    + '<div class="hw-bulk"><span class="hw-selcount"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="sell-sel">Sell selected</button>'
    + '<button type="button" class="hh-tool" data-hs-act="clear-sel">Clear</button></div>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="sell-junk"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="sell-cat"></button><span class="hw-value"></span></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">Cancel</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>';
}

function patchPocket(li, r, st) {
  const locked = !!(st.rules && st.rules.locked.has(r.id));
  const fresh = isNew(st.seen, r.id, r.qty);
  const bi = barIndexOf(st.cs, r.id);
  patchCount(li, r.qty);
  cls(li, 'is-new', fresh);
  cls(li, 'is-locked', locked);
  cls(li, 'is-cur', st.sc.cursor === r.id);
  attr(li, 'aria-selected', String(st.sc.sel.has(r.id)));
  text(li.querySelector('.hw-barkey'), bi >= 0 ? barKeyLabel(bi) : '');
  attr(li, 'aria-label', itemName(r.id) + (r.qty > 1 ? ', ' + whole(r.qty) : '') + (locked ? ', locked' : '') + (fresh ? ', new' : ''));
  if (fresh) st.sc.shownNew.add(r.id);
}

/** The toolbar's state: the search text (unless typing in it), the sort, the category, the tabs. */
export function patchToolbar(root, st, ctx) {
  const q = root.querySelector('.hw-q');
  if (ctx.doc.activeElement !== q) prop(q, 'value', st.sc.query);
  prop(root.querySelector('[data-hs-act="sort"]'), 'value', st.prefs.sort);
  for (const b of root.querySelectorAll('.hw-cat')) attr(b, 'aria-pressed', String(b.getAttribute('data-cat') === st.prefs.cat));
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === st.sc.tab));
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === st.sc.tab);
  cls(root.querySelector('.hw-cats'), 'is-off', st.sc.tab !== 'bag');
}

function patchBagPane(root, st, ctx) {
  const { sc } = st;
  const pane = root.querySelector('[data-pane="bag"]');
  rows(pane.querySelector('.hw-pockets'), st.shown, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),
    patch: (li, r) => patchPocket(li, r, st),
  });
  const none = pane.querySelector('.hw-none');
  cls(none, 'is-on', st.loaded && !st.shown.length);
  text(none, !st.loaded ? '' : !st.items.length ? 'Your bag is empty. Loot from hunts and things you buy land here.' : 'Nothing in the bag matches. Clear the search or pick All.');
  patchElsewhere(pane, ctx, sc.query);
}

/** The picked stack's line, the bulk tools and the confirmation (under both columns). */
export function patchTools(root, st, ctx) {
  const { sc, prefs } = st;
  const onBag = sc.tab === 'bag';
  const cur = onBag && sc.cursor && st.qty.has(sc.cursor) ? sc.cursor : null;
  const pick = root.querySelector('.hw-pick');
  cls(pick, 'is-on', !!cur);
  if (pick.getAttribute('data-item') !== (cur || '')) {
    attr(pick, 'data-item', cur || '');
    pick.querySelector('.hw-pick-ico').innerHTML = cur ? itemIconHtml(ctx.glyphs, cur) : '';
  }
  text(pick.querySelector('b'), cur ? itemName(cur) : '');
  text(pick.querySelector('small'), cur ? '×' + whole(st.qty.get(cur)) + (st.shop && st.shop.bids.has(cur) ? ' · the shop pays ' + gold(st.shop.bids.get(cur)) + ' each' : '') : '');
  const prim = primaryOf(st, cur);
  const pb = pick.querySelector('[data-hs-act="primary"]');
  text(pb, prim ? prim[1] : '');
  cls(pb, 'is-on', !!prim);
  const buryWhy = prim && prim[0] === 'bury' ? (buryingOf(st.cs) ? 'Already burying. Stop it first.' : buryBlock(st.cs, buryRecipeOf(cur))) : '';
  prop(pb, 'disabled', sc.pending || !prim);
  attr(pb, 'title', buryWhy || null);
  const line = buryLine(st.cs);
  const bl = root.querySelector('.hw-burying');
  cls(bl, 'is-on', !!line);
  text(bl.querySelector('.hw-burying-q'), line);
  prop(bl.querySelector('[data-hs-act="bury-stop"]'), 'disabled', sc.pending);
  prop(pick.querySelector('.hw-more'), 'disabled', sc.pending || !cur);

  const selIds = Array.from(sc.sel).filter((id) => st.qty.has(id));
  cls(root.querySelector('.hw-bulk'), 'is-on', onBag && selIds.length > 0);
  text(root.querySelector('.hw-selcount'), selIds.length + ' selected');
  prop(root.querySelector('[data-hs-act="sell-sel"]'), 'disabled', sc.pending || !st.shop);
  const tools = root.querySelector('.hw-tools');
  cls(tools, 'is-off', !onBag);
  const junk = junkOf(st);
  const jb = tools.querySelector('[data-hs-act="sell-junk"]');
  text(jb, 'Sell junk' + (junk.length ? ' (' + junk.length + ')' : ''));
  attr(jb, 'title', st.rules ? 'Sells every stack your loot filter marks "Sell at the shop"' : 'The loot filter is not on the server yet');
  prop(jb, 'disabled', sc.pending || !st.shop || !junk.length);
  const cb = tools.querySelector('[data-hs-act="sell-cat"]');
  const catLabel = (BAG_CATS.find(([id]) => id === prefs.cat) || [])[1] || '';
  cls(cb, 'is-on', prefs.cat !== 'all');
  text(cb, 'Sell all ' + catLabel.toLowerCase());
  prop(cb, 'disabled', sc.pending || !st.shop || !st.shown.length);
  const val = st.shop ? bagValue(st.items, st.shop.bids) : null;
  text(tools.querySelector('.hw-value'), !val ? 'Value –' : 'Worth ' + gold(val.total) + (val.unpriced ? ' (' + val.unpriced + ' unpriced)' : ''));

  const cf = root.querySelector('.hw-confirm');
  cls(cf, 'is-on', !!sc.confirm);
  if (sc.confirm) {
    const words = confirmWords(sc.confirm);
    text(cf.querySelector('.hw-confirm-q'), words[0]);
    text(cf.querySelector('.hw-confirm-note'), words.slice(1).join(' '));
    const yes = cf.querySelector('[data-hs-act="confirm-yes"]');
    text(yes, sc.confirm.empty ? 'Nothing to sell' : 'Sell for ' + gold(sc.confirm.plan.total));
    prop(yes, 'disabled', sc.pending || sc.confirm.empty);
  }
  text(root.querySelector('.hh-intent-msg'), sc.msg);
}

function patchHuntPane(root, st, ctx) {
  const pane = root.querySelector('[data-pane="hunt"]');
  const loot = huntLoot(st.cs) || [];
  const bids = st.shop ? st.shop.bids : null;
  let worth = 0, priced = true;
  for (const l of loot) if (bids && bids.has(l.item)) worth += bids.get(l.item) * l.count; else priced = false;
  const n = loot.reduce((s, l) => s + l.count, 0);
  text(pane.querySelector('.hw-loot-sum'), loot.length ? 'This hunt: ' + whole(n) + (n === 1 ? ' item' : ' items') + (bids ? ' · worth ' + gold(worth) + (priced ? '' : ' or more') : '') : '');
  rows(pane.querySelector('.hw-loot'), loot, {
    key: (l) => l.item,
    build: (l) => element(ctx.doc, '<li class="hw-loot-row" data-hs-act="loot-row" data-item="' + esc(l.item) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, l.item) + '</span>'
      + '<span class="hw-loot-name"><b>' + esc(itemName(l.item)) + '</b><small></small></span>'
      + '<select class="hh-select" data-hs-act="rule" data-item="' + esc(l.item) + '" aria-label="On pickup">' + RULES.map(([v, w]) => '<option value="' + v + '">' + esc(w) + '</option>').join('') + '</select></li>'),
    patch: (li, l) => {
      const inBag = st.qty.get(l.item) || 0;
      text(li.querySelector('small'), '×' + whole(l.count) + ' this hunt · ' + whole(inBag) + ' in the bag');
      const sel = li.querySelector('select');
      if (st.rules) prop(sel, 'value', st.rules.loot[l.item] || 'keep');
      prop(sel, 'disabled', st.sc.pending || !st.rules);
    },
  });
  cls(pane.querySelector('.hw-loot-none'), 'is-on', !loot.length);
  text(pane.querySelector('.hw-loot-note'), st.rules ? 'The server applies each rule the next time a hunt picks the item up.' : 'Loot rules switch on when the server starts keeping them.');
}

/** The grid column for the open tab. */
export function patchGrid(root, st, ctx) {
  if (st.sc.tab === 'bag') patchBagPane(root, st, ctx); else patchHuntPane(root, st, ctx);
}
