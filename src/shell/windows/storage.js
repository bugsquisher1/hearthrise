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
// envelope (`bank` and `inventory`, replaced, never merged). The search is the
// same "Find an item" as the Inventory's: it filters both grids.
// While a hunt runs the chest is at home and the hero is not: the window says
// so and its moves stay off (the server's own rule is in CONFLICTS.md).
// ════════════════════════════════════════════════════════════════════════
import { bagOf, bankOf, depotOf } from '../../session/item-sections.js?v=0.2.25';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.25';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.25';
import { whole } from '../../render/format.js?v=0.2.25';
import { glyphSvg } from '../launcher.js?v=0.2.25';
import { itemName } from '../widgets/bits.js?v=0.2.25';
import { runIntent } from '../intent-words.js?v=0.2.25';
import { pocketHtml, patchCount } from './inventory/pockets.js?v=0.2.25';
import { showTip, hideTip } from './item-tip.js?v=0.2.25';
import { openFloatMenu, closeFloatMenu } from './float-menu.js?v=0.2.25';
import { amountHtml, amountOf, stepAmount } from '../widgets/amount.js?v=0.2.25';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { query: '', pending: false, msg: '', press: null, pressed: false }; SCRATCH.set(cs, s); } return s; };
const LONG_PRESS_MS = 500;

const match = (q) => (r) => !q || itemName(r.id).toLowerCase().includes(q);
const byName = (a, b) => (itemName(a.id) < itemName(b.id) ? -1 : 1);

/** The skeleton (built once per opening). */
export function renderStorage(ctx) {
  const g = ctx.glyphs;
  return '<div class="hw-store">'
    + '<div class="hw-find"><span class="hw-search">' + glyphSvg(g, 'uiSearch') + '<input type="search" class="hh-num hw-q" data-hs-act="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off"></span></div>'
    + '<p class="hs-note hw-store-note"></p>'
    + '<h3 class="hw-ledger-head is-on">In storage <small class="hw-store-n" data-n="bank"></small></h3>'
    + '<ul class="hw-pockets" data-side="bank" role="listbox" aria-label="In storage"></ul><p class="hh-empty hw-store-none" data-none="bank"></p>'
    + '<p class="hs-note hw-store-room"></p>'
    + '<h3 class="hw-ledger-head is-on">In your bag <small class="hw-store-n" data-n="bag"></small></h3>'
    + '<ul class="hw-pockets" data-side="bag" role="listbox" aria-label="In your bag"></ul><p class="hh-empty hw-store-none" data-none="bag"></p>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function patchSide(root, ctx, side, list, q, off, depot) {
  const shown = list.filter(match(q)).sort(byName);
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
  const q = sc.query.trim().toLowerCase();
  const input = root.querySelector('.hw-q');
  if (ctx.doc.activeElement !== input) prop(input, 'value', sc.query);
  text(root.querySelector('.hw-store-note'), away ? 'Your storage is at home and your hero is out hunting. Leave the hunt to use it.'
    : !bank ? 'Reading your storage…' : 'Press a stack to move one across. Shift-press moves all of it. Right-click (or hold) to choose how many.');
  const depot = depotOf(cs);
  patchSide(root, ctx, 'bank', bank || [], q, off, depot);
  text(root.querySelector('.hw-store-room'), !depot ? '' : depot.next
    ? 'More room comes from storage chests, built in the House (E). Next: the ' + depot.next.name + ', ' + whole(depot.next.stacks) + ' more stacks.'
    : 'Every storage chest is built.');
  patchSide(root, ctx, 'bag', bag || [], q, off);
  cls(root, 'is-pending', sc.pending);
  cls(root, 'is-off', off);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderStorage.events = Object.freeze(['input', 'mouseover', 'mouseout', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel']);

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
