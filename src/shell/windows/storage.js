// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/storage.js — STORAGE: THE HOME CHEST, FROM ANYWHERE IN TOWN.
//
// Tyler 10-18: storage must be usable from anywhere in town (at the
// blacksmith, say), not only at home. The server agrees: hr_bank_move has no
// place check (supabase/migrations/2026-08-27-bank-store.sql), only the
// character lock, the settle-first rule and the stack fuses. Its own launcher
// (T) opens it.
//
// Two grids of the same pocket the Inventory uses (inventory/pockets.js):
// what is in storage, and what is in the bag. A press on a stack moves ONE
// across; Shift moves all of it; a right-click (or a long press) asks how many
// (src/shell/widgets/amount.js: Store X / Take X). Tyler 10-18: "it's all or
// nothing." Each is ONE hr_bank_move naming that exact count (the server moves
// exactly it, under its own lock and stack fuses), every control is off
// until the server answers, and both grids change only from the re-read
// envelope (`bank` and `inventory`, replaced, never merged). The search, the
// kind chips and the sort are the Inventory's own (bag-model.js `view`; Tyler
// 10-22: "storage doesn't have a way to sort or filter"): they apply to both
// grids, and the chip and sort are remembered in the residue `storeView`. The
// Newest sort reads `storeSeen` (storage-model.js markStored): when each
// storage stack was last added to, kept by this character. Display only.
// While a hunt runs the chest is at home and the hero is not: the window says
// so and its moves stay off (the server's own rule is in CONFLICTS.md).
// Beside the bag: Dispatch loot (Tyler 2026-10-25, loot-dispatch.js), ONE
// hr_loot_dispatch that stores every stack planned "Deposit in storage" while
// Storage has room and sells every stack planned "Sell"; off with its reason (a
// hunt, nothing planned), and its line is the server's answer.
// ════════════════════════════════════════════════════════════════════════
import { bagOf, bankOf, depotOf, shopOf } from '../../session/item-sections.js?v=0.2.69';
import { STORE_SEEN_MAX } from '../../session/residue.js?v=0.2.69';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.69';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.69';
import { whole } from '../../render/format.js?v=0.2.69';
import { glyphSvg } from '../launcher.js?v=0.2.69';
import { itemName } from '../widgets/bits.js?v=0.2.69';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.69';
import { BAG_CATS, BAG_SORTS, view } from '../bag-model.js?v=0.2.69';
import { storePrefsOf, markStored } from '../storage-model.js?v=0.2.69';
import { runIntent } from '../intent-words.js?v=0.2.69';
import { pocketHtml, patchCount } from './inventory/pockets.js?v=0.2.69';
import { showTip, hideTip } from './item-tip.js?v=0.2.69';
import { openFloatMenu, closeFloatMenu } from './float-menu.js?v=0.2.69';
import { amountHtml, amountOf, stepAmount } from '../widgets/amount.js?v=0.2.69';
import { dispatchBlock, runDispatch } from '../loot-dispatch.js?v=0.2.69';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { query: '', pending: false, msg: '', press: null, pressed: false }; SCRATCH.set(cs, s); } return s; };
const LONG_PRESS_MS = 500;

const residueOf = (cs) => (cs && cs.record && cs.record.residue) || {};
/* The bag's own "new" marks (the Inventory writes them); none yet reads as all seen, as the Inventory does. */
const bagSeenOf = (cs, bag) => residueOf(cs).bagSeen || Object.fromEntries(bag.map((r) => [r.id, [r.qty, 0]]));

/** The skeleton (built once per opening). */
export function renderStorage(ctx) {
  const g = ctx.glyphs;
  return '<div class="hw-store">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off"></span>'
    + '<label class="hw-sort"><span>Sort</span><select class="hh-select" data-hs-act="sort">' + BAG_SORTS.map(([id, l]) => '<option value="' + id + '">' + esc(l) + '</option>').join('') + '</select></label></div>'
    + '<div class="hw-cats" role="group" aria-label="Show">' + BAG_CATS.map(([id, l]) => '<button type="button" class="hw-cat" data-hs-act="cat" data-cat="' + id + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>'
    + '<p class="hs-note hw-store-note"></p>'
    /* The press's answer sits ABOVE both grids (Andy 10-26: under a full bag it was off the bottom, and a refused
       12k-arrow press read as lag): it says "Putting it away…", then the result or the refusal, where the eye is. */
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '<h3 class="hw-ledger-head is-on">In storage <small class="hw-store-n" data-n="bank"></small></h3>'
    + '<ul class="hw-pockets" data-side="bank" role="listbox" aria-label="In storage"></ul><p class="hh-empty hw-store-none" data-none="bank"></p>'
    + '<p class="hs-note hw-store-room"></p>'
    + '<h3 class="hw-ledger-head is-on">In your bag <small class="hw-store-n" data-n="bag"></small></h3>'
    + '<div class="hw-tools hw-store-do"><button type="button" class="hh-tool" data-hs-act="dispatch">Dispatch loot</button><p class="hw-why"></p></div>'
    + '<ul class="hw-pockets" data-side="bag" role="listbox" aria-label="In your bag"></ul><p class="hh-empty hw-store-none" data-none="bag"></p></div>';
}

function patchSide(root, ctx, side, list, shown, off, depot) {
  rows(root.querySelector('.hw-pockets[data-side="' + side + '"]'), shown, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, pocketHtml(r.id, ctx.glyphs, side === 'bank' ? 'withdraw' : 'deposit')),
    patch: (li, r) => {
      patchCount(li, r.qty);
      attr(li, 'aria-label', itemName(r.id) + (r.qty > 1 ? ', ' + whole(r.qty) : '') + (side === 'bank' ? ': take it out' : ': put it away'));
      attr(li, 'aria-disabled', String(off));
      attr(li, 'draggable', 'false');
    },
  });
  /* The storage's space is the ACCOUNT's (the server's used / cap); the bag counts its own stacks. */
  text(root.querySelector('[data-n="' + side + '"]'), side === 'bank' && depot ? whole(depot.used) + ' of ' + whole(depot.cap) + ' stacks'
    : whole(list.length) + (list.length === 1 ? ' stack' : ' stacks'));
  const none = root.querySelector('[data-none="' + side + '"]');
  cls(none, 'is-on', !shown.length);
  text(none, list.length ? 'Nothing here matches.' : side === 'bank' ? 'Your storage is empty. All your characters share it: press a stack in your bag to put it away.' : 'Your bag is empty.');
}

renderStorage.patch = function patchStorage(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-store');
  const bank = bankOf(cs), bag = bagOf(cs);
  const h = huntOf(cs);
  const away = !!(h && !h.ended);
  const off = sc.pending || away || !bank || !bag;
  const prefs = storePrefsOf(residueOf(cs));
  /* "Recently added": mark the stacks in storage now; one residue put only when a mark changed. */
  const marks = bank ? markStored(residueOf(cs).storeSeen || null, bank, STORE_SEEN_MAX) : null;
  if (marks) queueMicrotask(() => cs.setResidue('storeSeen', marks));
  const o = { cat: prefs.cat, query: sc.query, sort: prefs.sort, bids: (shopOf(cs) || {}).bids };
  const input = root.querySelector('.hw-q');
  if (ctx.doc.activeElement !== input) prop(input, 'value', sc.query);
  prop(root.querySelector('[data-hs-act="sort"]'), 'value', prefs.sort);
  for (const b of root.querySelectorAll('.hw-cat')) attr(b, 'aria-pressed', String(b.getAttribute('data-cat') === prefs.cat));
  text(root.querySelector('.hw-store-note'), away ? 'Your storage is at home and your hero is out hunting. Leave the hunt to use it.'
    : !bank ? 'Reading your storage…' : 'Press a stack to move one across. Shift-press moves all of it. Right-click (or hold) to choose how many.');
  const depot = depotOf(cs);
  patchSide(root, ctx, 'bank', bank || [], view(bank || [], Object.assign({ seen: marks || residueOf(cs).storeSeen || {} }, o)), off, depot);
  text(root.querySelector('.hw-store-room'), !depot ? '' : depot.next
    ? 'More room comes from storage chests, built in the House (E). Next: the ' + depot.next.name + ', ' + whole(depot.next.stacks) + ' more stacks.'
    : 'Every storage chest is built.');
  patchSide(root, ctx, 'bag', bag || [], view(bag || [], Object.assign({ seen: bagSeenOf(cs, bag || []) }, o)), off);
  /* Dispatch loot: off with the server-sections' reason; a hunt's reason is the note above, any other is said here. */
  const dWhy = dispatchBlock(cs);
  const db = root.querySelector('[data-hs-act="dispatch"]');
  prop(db, 'disabled', sc.pending || !!dWhy);
  attr(db, 'title', dWhy || 'Stores every stack planned "Deposit in storage" and sells every stack planned "Sell"');
  text(root.querySelector('.hw-store-do .hw-why'), away ? '' : dWhy);
  cls(root, 'is-pending', sc.pending);
  cls(root, 'is-off', off);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderStorage.events = Object.freeze(['input', 'mouseover', 'mouseout', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel']);

/* The chip or the sort, remembered (residue `storeView`, display only). */
function setPref(cs, key, value) {
  const p = storePrefsOf(residueOf(cs));
  p[key] = value;
  cs.setResidue('storeView', p);
}

/* ONE hr_bank_move naming exactly `qty`; both grids change only from the re-read envelope. */
function move(cs, sc, repaint, id, qty, dir) {
  return runIntent(sc, repaint, () => cs.moveStorage(id, qty, dir), dir === 'withdraw' ? 'Taking it out…' : 'Putting it away…',
    () => (dir === 'withdraw' ? 'Took out ' : 'Put away ') + whole(qty) + ' ' + itemName(id) + '.');
}

/* "How many?" beside the stack: Store X / Take X, up to the stack the server last sent. */
function askAmount(ctx, body, cs, sc, repaint, row, dir, at) {
  hideTip(ctx.doc);
  const verb = dir === 'withdraw' ? 'Take' : 'Store';
  openFloatMenu(ctx.doc, amountHtml({ title: verb + ' how many ' + itemName(row.id) + '?', verb, max: row.qty, value: row.qty, act: 'amt-go' }), at, {
    label: verb + ' how many',
    onAct: (action) => {
      const menu = ctx.doc.querySelector('.hw-menu');
      if (stepAmount(menu, action) || action !== 'amt-go') return;
      const n = amountOf(menu);
      closeFloatMenu(ctx.doc);
      if (!sc.pending) move(cs, sc, repaint, row.id, n, dir);
    },
    onClose: () => {},
    alive: () => body.isConnected,
  });
}

renderStorage.act = function actStorage(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderStorage.patch(body, ctx);
  if (action === 'search' && ev.type === 'input') { sc.query = t.value.slice(0, 40); repaint(); return false; }
  if (action === 'sort' && ev.type === 'change') { setPref(cs, 'sort', t.value); repaint(); return false; }
  if (action === 'cat' && ev.type === 'click') { setPref(cs, 'cat', t.getAttribute('data-cat')); repaint(); return true; }
  if (action === 'dispatch') { if (ev.type === 'click' && !sc.pending && !t.disabled) runDispatch(ctx.account, cs, sc, repaint); return ev.type === 'click'; }
  if (action !== 'withdraw' && action !== 'deposit') return false;
  const id = t.getAttribute('data-item');
  const type = ev.type;
  if (type === 'mouseover') { showTip(ctx.doc, t, id, {}); return false; }
  if (type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
  if (type === 'pointerup' || type === 'pointercancel') { clearTimeout(sc.press); return false; }
  const off = t.getAttribute('aria-disabled') === 'true';
  const row = ((action === 'withdraw' ? bankOf(cs) : bagOf(cs)) || []).find((r) => r.id === id);
  if (type === 'pointerdown') {
    if (!ev.pointerType || ev.pointerType === 'mouse' || off || !row) return false;
    sc.pressed = false;
    clearTimeout(sc.press);
    sc.press = setTimeout(() => { sc.pressed = true; const r = t.getBoundingClientRect(); askAmount(ctx, body, cs, sc, repaint, row, action, { x: r.left, y: r.bottom }); }, LONG_PRESS_MS);
    return false;
  }
  if (type === 'contextmenu') {
    ev.preventDefault();
    if (!off && row) askAmount(ctx, body, cs, sc, repaint, row, action, { x: ev.clientX, y: ev.clientY });
    return true;
  }
  if (type !== 'click') return false;
  if (sc.pressed) { sc.pressed = false; return true; }
  if (off || !row) return true;
  hideTip(ctx.doc);
  move(cs, sc, repaint, id, ev.shiftKey ? row.qty : 1, action);
  return true;
};
