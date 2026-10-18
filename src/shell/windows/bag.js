// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/bag.js — THE BAG: A SATCHEL OF POCKETS (WORLD_SHELL §4, ART_DIRECTION §8, §12).
//
// A real slot grid: one sunk pocket per stack, the pixel icon at the screen's
// one density (32 art px at ×2), the count in the corner, gear framed in its
// rarity with rank pips, a consumable's bar key, a "new" mark until seen and a
// lock mark. Above it: a search box, the category row and the sort (the
// category and sort are remembered, residue `bagView`), the stack count and
// the running bag value at the server's bids. Below it: the picked stack's
// line with its ONE primary action, the bulk tools (sell the selection, sell
// junk, sell a whole category) and their confirmation with the total. A
// second tab, This hunt, lists what the running hunt picked up with each
// item's loot rule (keep / sell at the shop / leave it), which the server
// applies on pickup.
//
// Built once; every envelope and display tick patches it in place
// (src/render/paint.js). Every count is the envelope's `inventory`, replaced,
// never merged; every action is ONE intent with the controls off until the
// server answers (bag-act.js). Desktop window or the phone's sheet.
// ════════════════════════════════════════════════════════════════════════
import { BAG_CATS, BAG_SORTS, kindOf, rarityOf, isNew, bagValue } from '../bag-model.js?v=0.2.0';
import { barIndexOf, barKeyLabel } from '../bar-assign.js?v=0.2.0';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.0';
import { whole, short, gold } from '../../render/format.js?v=0.2.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.0';
import { glyphSvg } from '../launcher.js?v=0.2.0';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.2.0';
import { stateOf, primaryOf, junkOf, confirmWords, huntLoot } from './bag-state.js?v=0.2.0';
import { actBag, commitSeen, BAG_EVENTS } from './bag-act.js?v=0.2.0';
import { closeFloatMenu } from './float-menu.js?v=0.2.0';

const PIPS = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, unique: 5 });
const RULES = Object.freeze([['keep', 'Keep'], ['sell', 'Sell at the shop'], ['ignore', 'Leave it']]);
const KEYS = '/ search · arrows move · Enter use · Space select · S sell · L lock · Ctrl+A select all';

/**
 * The skeleton (built once per opening). Opening the bag again is what clears
 * the "new" marks the player was shown last time (the residue `bagSeen`).
 */
export function renderBag(ctx) {
  const g = ctx.glyphs;
  if (ctx.character) commitSeen(ctx.character);
  return '<div class="hw-bag" tabindex="0" data-hs-act="bag" aria-label="Bag">'
    + '<div class="hw-tabs" role="tablist">'
    + '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="bag" aria-selected="true">Bag</button>'
    + '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="hunt" aria-selected="false">This hunt</button></div>'
    + '<section class="hw-pane" data-pane="bag">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="search" placeholder="Search the bag" aria-label="Search the bag" autocomplete="off"></span>'
    + '<label class="hw-sort"><span>Sort</span><select class="hh-select" data-hs-act="sort">' + BAG_SORTS.map(([id, l]) => '<option value="' + id + '">' + esc(l) + '</option>').join('') + '</select></label></div>'
    + '<div class="hw-cats" role="group" aria-label="Show">' + BAG_CATS.map(([id, l]) => '<button type="button" class="hw-cat" data-hs-act="cat" data-cat="' + id + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>'
    + '<p class="hw-cap"><span class="hw-stacks"></span><span class="hw-value"></span></p>'
    + '<ul class="hw-pockets" role="listbox" aria-label="Bag" aria-multiselectable="true"></ul>'
    + '<p class="hh-empty hw-none"></p>'
    + '<div class="hw-pick"><span class="hw-pick-ico"></span><span class="hw-pick-name"><b></b><small></small></span>'
    + '<button type="button" class="hw-primary" data-hs-act="primary"></button>'
    + '<button type="button" class="hh-tool hw-more" data-hs-act="more" aria-label="More for this item">' + glyphSvg(g, 'uiPlus') + '</button></div>'
    + '<div class="hw-bulk"><span class="hw-selcount"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="sell-sel">Sell selected</button>'
    + '<button type="button" class="hh-tool" data-hs-act="clear-sel">Clear</button></div>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="sell-junk"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="sell-cat"></button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the sale"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="confirm-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="confirm-no">Cancel</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<p class="hw-keys">' + esc(KEYS) + '</p>'
    + '</section>'
    + '<section class="hw-pane" data-pane="hunt">'
    + '<p class="hw-cap"><span class="hw-loot-sum"></span></p>'
    + '<ul class="hw-loot"></ul><p class="hh-empty hw-loot-none">Nothing picked up yet. What a hunt brings back shows here, with what to do with each item next time.</p>'
    + '<p class="hw-loot-note"></p>'
    + '</section>'
    + '</div>';
}

function pocketHtml(id, glyphs) {
  const rar = rarityOf(id);
  const pips = rar ? '<span class="hw-pips">' + '<i></i>'.repeat(PIPS[rar] || 0) + '</span>' : '';
  return '<li class="hw-pocket is-' + kindOf(id) + (rar ? ' rar-' + rar : '') + '" role="option" tabindex="-1" draggable="true" data-hs-act="pocket" data-item="' + esc(id) + '" aria-label="' + esc(itemName(id)) + '">'
    + '<span class="hw-ico">' + itemIconHtml(glyphs, id) + '</span>' + pips
    + '<b class="hw-count"></b><i class="hw-new">New</i><span class="hw-lock">' + glyphSvg(glyphs, 'uiLock') + '</span><small class="hw-barkey"></small></li>';
}

function patchPocket(li, r, st) {
  const locked = !!(st.rules && st.rules.locked.has(r.id));
  const fresh = isNew(st.seen, r.id, r.qty);
  const bi = barIndexOf(st.cs, r.id);
  text(li.querySelector('.hw-count'), r.qty > 1 ? (r.qty >= 10000 ? short(r.qty) : whole(r.qty)) : '');
  cls(li, 'is-new', fresh);
  cls(li, 'is-locked', locked);
  cls(li, 'is-cur', st.sc.cursor === r.id);
  attr(li, 'aria-selected', String(st.sc.sel.has(r.id)));
  text(li.querySelector('.hw-barkey'), bi >= 0 ? barKeyLabel(bi) : '');
  attr(li, 'aria-label', itemName(r.id) + (r.qty > 1 ? ', ' + whole(r.qty) : '') + (locked ? ', locked' : '') + (fresh ? ', new' : ''));
  if (fresh) st.sc.shownNew.add(r.id);
}

function patchBagPane(body, st, ctx) {
  const { sc, prefs } = st;
  const pane = body.querySelector('[data-pane="bag"]');
  const q = pane.querySelector('.hw-q');
  if (ctx.doc.activeElement !== q) prop(q, 'value', sc.query);
  prop(pane.querySelector('[data-hs-act="sort"]'), 'value', prefs.sort);
  for (const b of pane.querySelectorAll('.hw-cat')) attr(b, 'aria-pressed', String(b.getAttribute('data-cat') === prefs.cat));
  const val = st.shop ? bagValue(st.items, st.shop.bids) : null;
  text(pane.querySelector('.hw-stacks'), st.loaded ? whole(st.items.length) + (st.items.length === 1 ? ' stack' : ' stacks') : 'Reading your bag…');
  text(pane.querySelector('.hw-value'), !val ? 'Value –' : 'Worth ' + gold(val.total) + (val.unpriced ? ' (' + val.unpriced + ' unpriced)' : ''));
  rows(pane.querySelector('.hw-pockets'), st.shown, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs)),
    patch: (li, r) => patchPocket(li, r, st),
  });
  const none = pane.querySelector('.hw-none');
  cls(none, 'is-on', st.loaded && !st.shown.length);
  text(none, !st.items.length ? 'Your bag is empty. Loot from hunts and things you buy land here.' : 'Nothing here matches. Clear the search or pick All.');

  /* The picked stack's line and its one primary action. */
  const cur = sc.cursor && st.qty.has(sc.cursor) ? sc.cursor : null;
  const pick = pane.querySelector('.hw-pick');
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
  prop(pb, 'disabled', sc.pending || !prim);
  prop(pick.querySelector('.hw-more'), 'disabled', sc.pending || !cur);

  /* Bulk tools: the selection, junk, the whole category. */
  const selIds = Array.from(sc.sel).filter((id) => st.qty.has(id));
  cls(pane.querySelector('.hw-bulk'), 'is-on', selIds.length > 0);
  text(pane.querySelector('.hw-selcount'), selIds.length + ' selected');
  prop(pane.querySelector('[data-hs-act="sell-sel"]'), 'disabled', sc.pending || !st.shop);
  const junk = junkOf(st);
  const jb = pane.querySelector('[data-hs-act="sell-junk"]');
  text(jb, 'Sell junk' + (junk.length ? ' (' + junk.length + ')' : ''));
  attr(jb, 'title', st.rules ? 'Sells every stack your loot filter marks "Sell at the shop"' : 'The loot filter is not on the server yet');
  prop(jb, 'disabled', sc.pending || !st.shop || !junk.length);
  const cb = pane.querySelector('[data-hs-act="sell-cat"]');
  const catLabel = (BAG_CATS.find(([id]) => id === prefs.cat) || [])[1] || '';
  cls(cb, 'is-on', prefs.cat !== 'all');
  text(cb, 'Sell all ' + catLabel.toLowerCase());
  prop(cb, 'disabled', sc.pending || !st.shop || !st.shown.length);

  /* The confirmation: the server's total, before anything is sent. */
  const cf = pane.querySelector('.hw-confirm');
  cls(cf, 'is-on', !!sc.confirm);
  if (sc.confirm) {
    const words = confirmWords(sc.confirm);
    text(cf.querySelector('.hw-confirm-q'), words[0]);
    text(cf.querySelector('.hw-confirm-note'), words.slice(1).join(' '));
    const yes = cf.querySelector('[data-hs-act="confirm-yes"]');
    text(yes, sc.confirm.empty ? 'Nothing to sell' : 'Sell for ' + gold(sc.confirm.plan.total));
    prop(yes, 'disabled', sc.pending || sc.confirm.empty);
  }
  text(pane.querySelector('.hh-intent-msg'), sc.msg);
  cls(pane, 'is-pending', sc.pending);
}

function patchHuntPane(body, st, ctx) {
  const pane = body.querySelector('[data-pane="hunt"]');
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

renderBag.patch = function patchBag(body, ctx) {
  const st = stateOf(ctx);
  if (st.unmarked && st.loaded && st.items.length) commitSeen(st.cs, st.items.map((r) => r.id));
  const root = body.querySelector('.hw-bag');
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === st.sc.tab));
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === st.sc.tab);
  if (st.sc.tab === 'bag') patchBagPane(body, st, ctx); else patchHuntPane(body, st, ctx);
  if (!st.sc.menu) closeFloatMenu(ctx.doc);
};

renderBag.events = BAG_EVENTS;
renderBag.act = function act(ctx, body, action, ev, t) {
  return actBag(ctx, body, action, ev, t, () => renderBag.patch(body, ctx));
};
