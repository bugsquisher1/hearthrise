// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/bag-act.js — WHAT THE PLAYER CAN DO IN THE BAG.
//
// Every gesture that changes the game is ONE intent (CharacterSession):
//   equip / eat            the engine's `equip` / `eat`
//   put on the bar         the whole bar restated (bar-assign.js)
//   sell (one, the selection, junk, a category)
//                          ONE `vendor_sell_many` naming the stacks whole,
//                          after a confirmation that shows the total at the
//                          server's bids; LOCKED stacks are never named
//   lock, loot rule        hr_item_lock, hr_loot_rule_set
// While one is in flight every action control is off; the counts change only
// when the re-read envelope replaces the bag.
//
// The rest is display: the search, the category and sort (remembered in the
// residue), selection (click, Ctrl/Shift-click, Space, Ctrl+A), the cursor
// (arrows), the tooltip on hover or focus, the context menu (right-click, a
// long press, or the ⋯ button), dragging a stack onto a gear or bar slot, and
// the "new" marks.
// ════════════════════════════════════════════════════════════════════════
import { kindOf, equipSlotFor, markSeen } from '../bag-model.js?v=0.1.0';
import { assignToBar, barKind, barIndexOf, barKeyLabel } from '../bar-assign.js?v=0.1.0';
import { runIntent } from '../intent-words.js?v=0.1.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.1.0';
import { gold } from '../../render/format.js?v=0.1.0';
import { itemName } from '../widgets/bits.js?v=0.1.0';
import { showTip, hideTip } from './item-tip.js?v=0.1.0';
import { openFloatMenu, closeFloatMenu } from './float-menu.js?v=0.1.0';
import { stateOf, scratchOf, prefsOf, seenOf, confirmFor, junkOf } from './bag-state.js?v=0.1.0';
import { skillsOf } from '../../session/item-sections.js?v=0.1.0';

export const BAG_EVENTS = Object.freeze(['input', 'keydown', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel',
  'dragstart', 'dragend', 'mouseover', 'mouseout']);
export const DRAG_TYPE = 'application/x-hearthrise-item';
const LONG_PRESS_MS = 500;
const RULE_WORDS = Object.freeze([['keep', 'Keep'], ['sell', 'Sell at the shop'], ['ignore', 'Leave it']]);

/** Commit the "new" marks the player has now seen (the residue write is deferred out of the paint). */
export function commitSeen(cs, ids) {
  const sc = scratchOf(cs);
  const want = ids || Array.from(sc.shownNew);
  if (!ids) sc.shownNew.clear();
  if (!want.length) return;
  const st = { items: Object.entries((cs.read('inventory')) || {}).map(([id, qty]) => ({ id, qty })) };
  const next = markSeen(seenOf(cs) || {}, st.items, want);
  if (next) queueMicrotask(() => cs.setResidue('bagSeen', next));
}

function tipFor(ctx, st, li) {
  const id = li.getAttribute('data-item');
  const slot = kindOf(id) === 'gear' ? equipSlotFor(id, st.eq) : null;
  showTip(ctx.doc, li, id, {
    qty: st.qty.get(id) || 0,
    bid: st.shop ? (st.shop.bids.has(id) ? st.shop.bids.get(id) : null) : undefined,
    worn: slot ? (st.eq[slot] || null) : undefined,
    locked: !!(st.rules && st.rules.locked.has(id)),
    rule: st.rules ? (st.rules.loot[id] || 'keep') : null,
    offers: st.shop ? st.shop.offers : null,
    skills: skillsOf(st.cs),
  });
}

/* ── The intents ── */
function send(ctx, st, repaint, fn, busy, done) {
  st.sc.menu = null;
  return runIntent(st.sc, repaint, fn, busy, done);
}

function goldNow(cs) { const s = cs.read('state'); return s && Number.isSafeInteger(s.gold) ? s.gold : null; }

function doPrimary(ctx, st, id, repaint) {
  const cs = st.cs;
  const k = kindOf(id);
  if (k === 'gear') {
    const slot = equipSlotFor(id, st.eq);
    if (slot) send(ctx, st, repaint, () => cs.edgeIntent('equip', { equip: { [slot]: id } }), 'Equipping…');
  } else if (k === 'food') {
    send(ctx, st, repaint, () => cs.edgeIntent('eat', { item: id }), 'Eating…');
  } else if (barKind(id) && st.bar && barIndexOf(cs, id) < 0) {
    send(ctx, st, repaint, () => assignToBar(cs, id), 'Putting it on the bar…');
  } else askSell(st, [id], 'Sell', repaint);
}

function askSell(st, ids, label, repaint) {
  st.sc.menu = null;
  st.sc.confirm = confirmFor(st, ids, label);
  repaint();
}

function doSell(ctx, st, repaint) {
  const c = st.sc.confirm;
  if (!c || c.empty) return;
  const cs = st.cs;
  const before = goldNow(cs);
  const lines = c.plan.lines;
  st.sc.confirm = null;
  send(ctx, st, repaint, () => cs.edgeIntent('vendor_sell_many', { lines }), 'Selling…', () => {
    const after = goldNow(cs);
    for (const l of lines) st.sc.sel.delete(l.item);
    return before !== null && after !== null ? 'The shop paid ' + gold(after - before) + '.' : 'Sold.';
  });
}

function doLock(ctx, st, id, repaint) {
  if (!st.rules) { st.sc.msg = 'Locks switch on when the server starts keeping them.'; st.sc.menu = null; repaint(); return; }
  const on = !st.rules.locked.has(id);
  send(ctx, st, repaint, () => st.cs.lockItem(id, on), on ? 'Locking…' : 'Unlocking…');
}

function doRule(ctx, st, id, rule, repaint) {
  if (!st.rules) return;
  send(ctx, st, repaint, () => st.cs.setLootRule(id, rule), 'Saving the loot rule…');
}

/* ── The context menu: built when it opens, beside the stack ── */
function openMenu(ctx, body, st, id, at, repaint) {
  hideTip(ctx.doc);
  const sc = st.sc;
  sc.cursor = id;
  sc.menu = { id };
  const k = kindOf(id);
  const locked = !!(st.rules && st.rules.locked.has(id));
  const bi = barIndexOf(st.cs, id);
  const off = (on) => (on && !sc.pending ? '' : ' disabled');
  const item = (act, label, on, extra) => '<button type="button" role="menuitem" class="hw-mi" data-hs-act="' + act + '"' + (extra || '') + off(on) + '>' + esc(label) + '</button>';
  let h = '<b class="hw-menu-title">' + esc(itemName(id)) + '</b>';
  if (k === 'gear') h += item('m-equip', 'Equip', !!equipSlotFor(id, st.eq));
  if (k === 'food') h += item('m-eat', 'Eat', true);
  if (barKind(id)) h += item('m-bar', bi >= 0 ? 'On the bar (key ' + barKeyLabel(bi) + ')' : 'Put on the bar', !!st.bar && bi < 0);
  h += item('m-sell', locked ? 'Sell (unlock it first)' : 'Sell…', !locked && !!st.shop && st.shop.bids.has(id));
  h += item('m-lock', locked ? 'Unlock' : 'Lock', !!st.rules);
  h += item('m-select', sc.sel.has(id) ? 'Unselect' : 'Select', true);
  h += '<span class="hw-menu-sub">On pickup</span><span class="hw-menu-rules" role="group" aria-label="On pickup">'
    + RULE_WORDS.map(([v, w]) => item('m-rule', w, !!st.rules, ' data-rule="' + v + '" aria-pressed="' + ((st.rules && (st.rules.loot[id] || 'keep')) === v) + '"')).join('') + '</span>';
  openFloatMenu(ctx.doc, h, at, {
    onAct: (action, e, b) => actBag(ctx, body, action, e, b, repaint),
    onClose: () => { if (sc.menu) { sc.menu = null; repaint(); } },
    alive: () => body.isConnected,
  });
  repaint();
}

function closeMenu(ctx, st) { if (!st.sc.menu) return false; closeFloatMenu(ctx.doc); return true; }

/* ── Selection and the cursor ── */
function toggleSel(sc, id) { if (sc.sel.has(id)) sc.sel.delete(id); else sc.sel.add(id); sc.anchor = id; }

function rangeSel(st, id) {
  const ids = st.shown.map((r) => r.id);
  const a = ids.indexOf(st.sc.anchor || st.sc.cursor), b = ids.indexOf(id);
  if (a < 0 || b < 0) { toggleSel(st.sc, id); return; }
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) st.sc.sel.add(ids[i]);
}

function focusCursor(body, st, ctx) {
  const li = st.sc.cursor && body.querySelector('.hw-pocket[data-item="' + st.sc.cursor + '"]');
  if (li) { li.focus({ preventScroll: false }); tipFor(ctx, st, li); }
}

/* Arrow keys move the cursor through the grid by its real column count. */
function moveCursor(body, st, key) {
  const ids = st.shown.map((r) => r.id);
  if (!ids.length) return;
  const grid = body.querySelector('.hw-pockets');
  const first = grid.firstElementChild;
  const cols = first ? Math.max(1, Math.round(grid.clientWidth / (first.offsetWidth + 4))) : 1;
  const at = Math.max(0, ids.indexOf(st.sc.cursor));
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
  st.sc.cursor = ids[Math.max(0, Math.min(ids.length - 1, (st.sc.cursor ? at + step : 0)))];
}

function onKey(ctx, body, st, ev, t, repaint) {
  const sc = st.sc;
  const k = ev.key;
  if (t.classList.contains('hw-q')) {
    if (k === 'Escape' && sc.query) { sc.query = ''; t.value = ''; repaint(); return true; }
    if (k === 'ArrowDown' || k === 'Enter') { if (!sc.cursor && st.shown.length) sc.cursor = st.shown[0].id; repaint(); focusCursor(body, st, ctx); return true; }
    return false;
  }
  if (sc.menu && k === 'Escape') { closeMenu(ctx, st); focusCursor(body, st, ctx); return true; }
  /* A button or a select keeps its own keys (Enter, Space); only Escape is the bag's. */
  if (!t.classList.contains('hw-pocket') && !t.classList.contains('hw-bag')) {
    if (sc.confirm && k === 'Escape') { sc.confirm = null; repaint(); return true; }
    return false;
  }
  if (sc.confirm && k === 'Escape') { sc.confirm = null; repaint(); return true; }
  if (sc.sel.size && k === 'Escape') { sc.sel.clear(); repaint(); return true; }
  if (k === '/' || ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'f')) { body.querySelector('.hw-q').focus(); return true; }
  if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'a') { for (const r of st.shown) sc.sel.add(r.id); repaint(); return true; }
  if (ev.ctrlKey || ev.metaKey || ev.altKey || sc.menu) return false;
  if (/^Arrow/.test(k)) { moveCursor(body, st, k); repaint(); focusCursor(body, st, ctx); return true; }
  const id = sc.cursor && st.qty.has(sc.cursor) ? sc.cursor : null;
  if (!id) return false;
  if (k === 'Enter') { if (sc.confirm) doSell(ctx, st, repaint); else doPrimary(ctx, st, id, repaint); return true; }
  if (k === ' ') { toggleSel(sc, id); repaint(); return true; }
  if (k === 's' || k === 'S') { askSell(st, sc.sel.size ? Array.from(sc.sel) : [id], sc.sel.size ? 'Sell selected' : 'Sell', repaint); return true; }
  if (k === 'l' || k === 'L') { doLock(ctx, st, id, repaint); return true; }
  if (k === 'ContextMenu') { const r = t.getBoundingClientRect(); openMenu(ctx, body, st, id, { x: r.right, y: r.top }, repaint); return true; }
  return false;
}

/**
 * The bag's [data-hs-act] events. Returns true when the event was consumed.
 * @param {() => void} repaint
 */
export function actBag(ctx, body, action, ev, t, repaint) {
  const st = stateOf(ctx);
  const sc = st.sc;
  const type = ev.type;
  if (type === 'keydown') return onKey(ctx, body, st, ev, t, repaint);
  if (action === 'pocket' || action === 'loot-row') {
    const id = t.getAttribute('data-item');
    if (type === 'mouseover') { tipFor(ctx, st, t); if (action === 'pocket') commitSeen(st.cs, [id]); return false; }
    if (type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
    if (action === 'loot-row') return false;
    if (type === 'dragstart') { hideTip(ctx.doc); ev.dataTransfer.setData(DRAG_TYPE, id); ev.dataTransfer.setData('text/plain', itemName(id)); ev.dataTransfer.effectAllowed = 'copy'; return false; }
    if (type === 'contextmenu') { openMenu(ctx, body, st, id, { x: ev.clientX, y: ev.clientY }, repaint); return true; }
    if (type === 'pointerdown' && ev.pointerType && ev.pointerType !== 'mouse') {
      sc.pressed = false;
      clearTimeout(sc.press);
      sc.press = setTimeout(() => { sc.pressed = true; const r = t.getBoundingClientRect(); openMenu(ctx, body, st, id, { x: r.left, y: r.bottom }, repaint); }, LONG_PRESS_MS);
      return false;
    }
    if (type === 'pointerup' || type === 'pointercancel' || type === 'dragend') { clearTimeout(sc.press); return false; }
    if (type !== 'click') return false;
    if (sc.pressed) { sc.pressed = false; return true; }
    if (ev.shiftKey) rangeSel(st, id);
    else if (ev.ctrlKey || ev.metaKey || sc.sel.size) toggleSel(sc, id);
    sc.cursor = id;
    sc.menu = null;
    commitSeen(st.cs, [id]);
    repaint();
    t.focus();
    return true;
  }
  if (type === 'input' && action === 'search') { sc.query = t.value.slice(0, 40); repaint(); return false; }
  if (type === 'change' && action === 'sort') { st.cs.setResidue('bagView', Object.assign(prefsOf(st.cs), { sort: t.value })); return false; }
  if (type === 'change' && action === 'rule') { doRule(ctx, st, t.getAttribute('data-item'), t.value, repaint); return false; }
  if (type !== 'click') return false;
  const cur = sc.cursor && st.qty.has(sc.cursor) ? sc.cursor : null;
  switch (action) {
    case 'tab': sc.tab = t.getAttribute('data-tab'); sc.menu = null; sc.confirm = null; hideTip(ctx.doc); repaint(); return true;
    case 'cat': st.cs.setResidue('bagView', Object.assign(prefsOf(st.cs), { cat: t.getAttribute('data-cat') })); return true;
    case 'primary': if (cur) doPrimary(ctx, st, cur, repaint); return true;
    case 'more': if (cur) { const r = t.getBoundingClientRect(); openMenu(ctx, body, st, cur, { x: r.left, y: r.bottom + 4 }, repaint); } return true;
    case 'sell-sel': askSell(st, Array.from(sc.sel), 'Sell selected', repaint); return true;
    case 'clear-sel': sc.sel.clear(); repaint(); return true;
    case 'sell-junk': askSell(st, junkOf(st), 'Sell junk', repaint); return true;
    case 'sell-cat': askSell(st, st.shown.map((r) => r.id), 'Sell all', repaint); return true;
    case 'confirm-yes': doSell(ctx, st, repaint); return true;
    case 'confirm-no': sc.confirm = null; repaint(); return true;
    case 'bag': closeMenu(ctx, st); return false;
    default: break;
  }
  const id = sc.menu ? sc.menu.id : cur;
  if (!id) return false;
  switch (action) {
    case 'm-equip': case 'm-eat': doPrimary(ctx, st, id, repaint); return true;
    case 'm-bar': send(ctx, st, repaint, () => assignToBar(st.cs, id), 'Putting it on the bar…'); return true;
    case 'm-sell': askSell(st, [id], 'Sell', repaint); return true;
    case 'm-lock': doLock(ctx, st, id, repaint); return true;
    case 'm-select': toggleSel(sc, id); sc.menu = null; repaint(); return true;
    case 'm-rule': doRule(ctx, st, id, t.getAttribute('data-rule'), repaint); return true;
    default: return false;
  }
}
