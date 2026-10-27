// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/actions.js — WHAT THE PLAYER CAN DO IN THE INVENTORY.
//
// Every gesture that changes the game is ONE intent (CharacterSession):
//   equip / take off       the engine's `equip`: the picked stack's primary, a
//                          doll slot's Wear / Take off, a stack dragged onto a
//                          slot, a worn piece dragged onto the grid, and
//                          "Equip upgrades" (every better piece in ONE delta,
//                          src/shell/upgrade-plan.js)
//   eat                    the engine's `eat`
//   put on the bar         the whole bar restated (bar-assign.js)
//   sell (one, the selection, a category)
//                          ONE `vendor_sell_many` naming the stacks whole,
//                          after a confirmation that shows the total at the
//                          server's bids; LOCKED stacks are never named
//   lock, loot plan        hr_item_lock, hr_loot_rule_set (Keep in bag / Deposit in
//                          storage / Sell, or Don't pick up: loot-dispatch.js)
//   Dispatch loot          ONE hr_loot_dispatch: the server runs every plan in town
//   fuel / cook (and stop) the engine's `set_activity` on the item's Hearth fuel row or
//                          Cooking recipe (bury.js): the server spends the stack (or one:
//                          "Fuel the hearth") and pays; the hero walks to a fuel stand
//   a named fuel           hr_hearth_burn (bury.js burnNamed): one, alone, the square's colour
// While one is in flight every action control is off; the counts change only
// when the re-read envelope replaces the bag and the worn set.
//
// The rest is display: the search (and where else the item is), the category,
// sort and Advanced view (remembered in the residue), selection (click,
// Ctrl/Shift-click, Space, Ctrl+A), the cursor (arrows), the tooltip on hover
// or focus, the context menu (right-click, a long press, or the + button), the
// open doll slot and the "new" marks. No key here is a walk key: selling is
// Delete, so W, A, S and D always reach the World (Tyler 10-18).
// ════════════════════════════════════════════════════════════════════════
import { kindOf, equipSlotFor, equipOps, markSeen, namedFuelOf } from '../../bag-model.js?v=0.2.54';
import { assignToBar, barKind, barIndexOf, barKeyLabel } from '../../bar-assign.js?v=0.2.54';
import { runIntent } from '../../intent-words.js?v=0.2.54';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.54';
import { gold } from '../../../render/format.js?v=0.2.54';
import { itemName } from '../../widgets/bits.js?v=0.2.54';
import { showTip, hideTip } from '../item-tip.js?v=0.2.54';
import { openFloatMenu, closeFloatMenu } from '../float-menu.js?v=0.2.54';
import { stateOf, scratchOf, seenOf, confirmFor, setPref } from './state.js?v=0.2.54';
import { LOOT_CHOICES, planBlock, dispatchWords } from '../../loot-dispatch.js?v=0.2.54';
import { dispatchLoot } from '../../../session/loot-intents.js?v=0.2.54';
import { fitsSlot, dollTip, DRAG_WORN } from './doll.js?v=0.2.54';
import { askElsewhere } from './elsewhere.js?v=0.2.54';
import { skillsOf } from '../../../session/item-sections.js?v=0.2.54';
import { buryRecipeOf, buryLabel, buryBlock, startBury, stopBury, buryQty, namedBlock, burnNamed } from './bury.js?v=0.2.54';
import { equipUpgrades } from '../../widgets/upgrade-line.js?v=0.2.54';
import { wearBlock } from '../../gear-gate.js?v=0.2.54';
import { levelOf } from '../../../session/character-sections.js?v=0.2.54';

const heroLevel = (cs) => { const lv = levelOf(cs); return lv ? lv.level : null; };

export const INVENTORY_EVENTS = Object.freeze(['input', 'keydown', 'contextmenu', 'pointerdown', 'pointerup', 'pointercancel',
  'dragstart', 'dragover', 'dragleave', 'drop', 'dragend', 'mouseover', 'mouseout']);
/** A bag stack in a drag (the action bar and the doll read it). */
export const DRAG_TYPE = 'application/x-hearthrise-item';
const LONG_PRESS_MS = 500;
/* "Link in chat": the item's id goes into the account's chat draft (ctx.account.social, src/social/chat-store.js
   addLink — the name and rarity render from the catalogue) and the chat shows. False when chat is not connected. */
const linkInChat = (ctx, id) => { const s = ctx.account && ctx.account.social; if (!s || !s.chat.addLink(id)) return false; ctx.show('chat'); return true; };
const chatOpen = (ctx) => ctx.wm.openIds().includes('chat');

/** Commit the "new" marks the player has now seen (the residue write is deferred out of the paint). */
export function commitSeen(cs, ids) {
  const sc = scratchOf(cs);
  const want = ids || Array.from(sc.shownNew);
  if (!ids) sc.shownNew.clear();
  if (!want.length) return;
  const items = Object.entries((cs.read('inventory')) || {}).map(([id, qty]) => ({ id, qty }));
  const next = markSeen(seenOf(cs) || {}, items, want);
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
    level: heroLevel(st.cs),
  });
}

/* ── The intents ── */
/* `at`: the line the press was on ('pick:<item>' while that stack is picked, 'slot'; null: the window's own line),
   where its words show (grid.js, doll.js). */
function send(st, repaint, fn, busy, done, at) {
  st.sc.menu = null;
  st.sc.msgAt = at || null;
  return runIntent(st.sc, repaint, fn, busy, done, st.cs);
}

/* Words with no intent behind them (what the screen already knows), on the line `at`. */
function say(st, repaint, msg, at) {
  st.sc.menu = null;
  st.sc.msg = msg;
  st.sc.msgAt = at || null;
  repaint();
}

function goldNow(cs) { const s = cs.read('state'); return s && Number.isSafeInteger(s.gold) ? s.gold : null; }

/** Wear `id` in `slot`, or take the slot's piece off (`id` null): ONE `equip` intent, unless the server's sections
    already say it would be refused (gear-gate.js: a hunt running, a requirement unmet), which is said instead. From
    the press until the server's envelope lands, the slot and the stack moving carry the pending mark (`sc.wearing`,
    display only: the doll, the stats and the bag change only from that envelope; "Equip upgrades" marks every slot
    it names). Its words show on the line `at` the press was on. */
function wear(st, repaint, slot, id, at) {
  const sc = st.sc;
  if (sc.pending) return Promise.resolve({ ok: false, error: 'busy' });
  const why = wearBlock(st.cs, id);
  if (why) { say(st, repaint, why, at); return Promise.resolve({ ok: false, error: 'blocked' }); }
  sc.wearing = { slots: [slot], items: id ? [id] : [] };
  return send(st, repaint, async () => {
    try { return await st.cs.edgeIntent('equip', { equip: equipOps(slot, id, st.eq) }); } finally { sc.wearing = null; }
  }, id ? 'Equipping…' : 'Taking it off…', null, at);
}

function doPrimary(st, id, repaint) {
  const cs = st.cs;
  const k = kindOf(id);
  if (k === 'gear') {
    const slot = equipSlotFor(id, st.eq);
    if (slot) wear(st, repaint, slot, id, 'pick:' + id);
  } else if (k === 'food') {
    send(st, repaint, () => cs.edgeIntent('eat', { item: id }), 'Eating…');
  } else if (barKind(id) && st.bar && barIndexOf(cs, id) < 0) {
    send(st, repaint, () => assignToBar(cs, id), 'Putting it on the bar…');
  } else if (buryRecipeOf(id)) doBury(st, id, repaint);
  else if (namedFuelOf(id)) doNamed(st, id, repaint);
  else askSell(st, [id], 'Sell', repaint);
}

/* Bury or cook the whole stack (bury.js): refused here only for what the screen already knows (a hunt, the level, one running). */
function doBury(st, id, repaint, count) {
  const why = buryBlock(st.cs, buryRecipeOf(id));
  if (why) { say(st, repaint, why); return; }
  startBury(st.cs, st.sc, id, (fn, busy, done) => send(st, repaint, fn, busy, done), repaint, count);
}

/* Burn ONE named fuel in the Great Hearth (bury.js burnNamed): refused here only for what the screen already knows. */
function doNamed(st, id, repaint) {
  const why = namedBlock(st.cs, id);
  if (why) { say(st, repaint, why, 'pick:' + id); return; }
  burnNamed(st.account, st.cs, id, (fn, busy, done) => send(st, repaint, fn, busy, done, 'pick:' + id));
}

function doStopBury(st, repaint) {
  stopBury(st.cs, st.sc, (fn, busy, done) => send(st, repaint, fn, busy, done));
}

function askSell(st, ids, label, repaint) {
  st.sc.menu = null;
  st.sc.confirm = confirmFor(st, ids, label);
  repaint();
}

function doSell(st, repaint) {
  const c = st.sc.confirm;
  if (!c || c.empty) return;
  const cs = st.cs;
  const before = goldNow(cs);
  const lines = c.plan.lines;
  st.sc.confirm = null;
  send(st, repaint, () => cs.edgeIntent('vendor_sell_many', { lines }), 'Selling…', () => {
    const after = goldNow(cs);
    for (const l of lines) st.sc.sel.delete(l.item);
    return before !== null && after !== null ? 'The shop paid ' + gold(after - before) + '.' : 'Sold.';
  });
}

function doLock(st, id, repaint) {
  if (!st.rules) { say(st, repaint, 'Locks switch on when the server starts keeping them.'); return; }
  const on = !st.rules.locked.has(id);
  send(st, repaint, () => st.cs.lockItem(id, on), on ? 'Locking…' : 'Unlocking…');
}

/* The item's loot plan or its pickup filter: ONE hr_loot_rule_set. "Don't pick up" pressed again goes back to Keep in bag. */
function doRule(st, id, rule, repaint) {
  if (!st.rules) return;
  const now = st.rules.loot[id] || 'keep';
  const next = rule === 'ignore' && now === 'ignore' ? 'keep' : rule;
  if (next === now) { st.sc.menu = null; repaint(); return; }
  send(st, repaint, () => st.cs.setLootRule(id, next), next === 'ignore' ? 'Saving: don\'t pick it up…' : 'Saving the loot plan…');
}

/* Dispatch loot: the server runs every plan on the bag; its one answer is the line. */
function doDispatch(ctx, st, repaint) {
  send(st, repaint, () => dispatchLoot(ctx.account, st.cs), 'Dispatching your loot…', (r) => dispatchWords(r.dispatch));
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
  /* An entry that is off says why on its own visible line under it (Tyler 10-25: "if I try to do something and can't,
     tell me why"; a title is not enough on a phone). A press in flight says nothing: the window's line shows it. */
  const item = (act, label, on, extra, why) => '<button type="button" role="menuitem" class="hw-mi" data-hs-act="' + act + '"' + (extra || '') + off(on) + '>' + esc(label) + '</button>'
    + (!on && why ? '<small class="hw-mi-why" data-why="' + act + '">' + esc(why) + '</small>' : '');
  let h = '<b class="hw-menu-title">' + esc(itemName(id)) + '</b>';
  const block = k === 'gear' ? wearBlock(st.cs, id) || (equipSlotFor(id, st.eq) ? '' : itemName(id) + ' does not go in any slot.') : '';
  if (k === 'gear') h += item('m-equip', 'Equip', !block, '', block);
  if (k === 'food') h += item('m-eat', 'Eat', true);
  const br = buryRecipeOf(id);
  const brWhy = br ? buryBlock(st.cs, br) : '';
  /* a fuel stack offers ONE ("Fuel the hearth", a bench count of one) beside the whole stack ("Fuel all N", Tyler 10-25) */
  if (br && br.skill !== 'cooking' && buryQty(st.cs, id) > br.need) h += item('m-fuel-one', 'Fuel the hearth', !brWhy, '', brWhy);
  if (br) h += item('m-bury', buryLabel(br, buryQty(st.cs, id)), !brWhy, '', brWhy);
  const nf = namedFuelOf(id);
  const nfWhy = nf ? namedBlock(st.cs, id) : '';
  if (nf) h += item('m-hearth', 'Fuel the hearth', !nfWhy, '', nfWhy);
  if (barKind(id)) h += item('m-bar', bi >= 0 ? 'On the bar (key ' + barKeyLabel(bi) + ')' : 'Put on the bar', !!st.bar && bi < 0, '', st.bar ? '' : 'The bar is still loading.');
  const sellWhy = locked ? '' : !st.shop ? 'The shop is still loading.' : st.shop.bids.has(id) ? '' : 'The shop does not buy this.';
  h += item('m-sell', locked ? 'Sell (unlock it first)' : 'Sell…', !locked && !sellWhy, '', sellWhy);
  h += item('m-lock', locked ? 'Unlock' : 'Lock', !!st.rules);
  h += item('m-select', sc.sel.has(id) ? 'Unselect' : 'Select', true);
  h += item('m-link', 'Link in chat', !!(ctx.account && ctx.account.social));
  /* The loot plan (what Dispatch loot does with it), then the pickup filter: the current one pressed, a plan the
     server would refuse for this item off with its reason on its own visible line (loot-dispatch.js planBlock). */
  const rule = st.rules ? (st.rules.loot[id] || 'keep') : null;
  const bids = st.shop ? st.shop.bids : null;
  const choice = ([v, w]) => {
    const why = planBlock(id, v, bids) || (st.rules ? '' : 'Reading your loot plans…');
    return item('m-rule', w, !!st.rules && !why, ' data-rule="' + v + '" aria-pressed="' + (rule === v) + '"', why);
  };
  for (const [group, words] of [['plan', 'Loot plan'], ['pickup', 'On pickup']]) {
    h += '<span class="hw-menu-sub">' + words + '</span><span class="hw-menu-rules" role="group" aria-label="' + words + '">'
      + LOOT_CHOICES.filter((c) => c[2] === group).map(choice).join('') + '</span>';
  }
  /* The bag's own menu: its repaint closes only this one, never a menu another surface opened (float-menu.js). */
  sc.menuOwner = {
    onAct: (action, e, b) => actInventory(ctx, body, action, e, b, repaint),
    onClose: () => { if (sc.menu) { sc.menu = null; repaint(); } },
    alive: () => body.isConnected,
  };
  openFloatMenu(ctx.doc, h, at, sc.menuOwner);
  repaint();
}

function closeMenu(ctx, st) { if (!st.sc.menu) return false; closeFloatMenu(ctx.doc, st.sc.menuOwner || null); return true; }

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
  const cols = first ? Math.max(1, Math.round(grid.clientWidth / (first.offsetWidth + 2))) : 1;
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
  /* A button or a select keeps its own keys (Enter, Space); only Escape is the Inventory's. */
  if (!t.classList.contains('hw-pocket') && !t.classList.contains('hw-inv')) {
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
  if (k === 'Enter') { if (sc.confirm) doSell(st, repaint); else doPrimary(st, id, repaint); return true; }
  if (k === ' ') { toggleSel(sc, id); repaint(); return true; }
  if (k === 'Delete') { askSell(st, sc.sel.size ? Array.from(sc.sel) : [id], sc.sel.size ? 'Sell selected' : 'Sell', repaint); return true; }
  if (k === 'l' || k === 'L') { doLock(st, id, repaint); return true; }
  if (k === 'ContextMenu') { const r = t.getBoundingClientRect(); openMenu(ctx, body, st, id, { x: r.right, y: r.top }, repaint); return true; }
  return false;
}

const dragTypes = (ev) => Array.from((ev.dataTransfer && ev.dataTransfer.types) || []);

/* A bag stack over a doll slot: wear it there on the drop, when it fits. */
function onSlotDrag(st, ev, t, repaint) {
  if (!dragTypes(ev).includes(DRAG_TYPE)) return false;
  if (ev.type === 'dragleave') { t.classList.remove('is-drop'); return false; }
  ev.preventDefault();
  t.classList.toggle('is-drop', ev.type === 'dragover');
  if (ev.type === 'drop') {
    const id = ev.dataTransfer.getData(DRAG_TYPE);
    const slot = t.getAttribute('data-slot');
    /* the drop opens that slot's line: its words (and the server's answer) show there */
    st.sc.slot = slot;
    if (fitsSlot(id, slot)) wear(st, repaint, slot, id, 'slot');
    else say(st, repaint, itemName(id) + ' does not go in that slot.', 'slot');
  }
  return true;
}

/* A worn piece over the grid: take it off on the drop (its slot's line opens to say how it went). */
function onGridDrag(st, ev, repaint) {
  if (!dragTypes(ev).includes(DRAG_WORN)) return false;
  ev.preventDefault();
  if (ev.type === 'drop') {
    const slot = ev.dataTransfer.getData(DRAG_WORN);
    if (st.eq[slot]) { st.sc.slot = slot; wear(st, repaint, slot, null, 'slot'); }
  }
  return true;
}

function onDoll(ctx, st, action, ev, t, repaint) {
  const sc = st.sc;
  const type = ev.type;
  if (type === 'mouseover' && (action === 'slot' || action === 'fit-row')) { dollTip(ctx, st, t, action); return false; }
  if (type === 'mouseout') { if (!t.contains(ev.relatedTarget)) hideTip(ctx.doc); return false; }
  if (action === 'slot' && (type === 'dragover' || type === 'drop' || type === 'dragleave')) return onSlotDrag(st, ev, t, repaint);
  if (action === 'slot' && type === 'dragstart') {
    const s = t.getAttribute('data-slot');
    if (!st.eq[s]) return false;
    hideTip(ctx.doc);
    ev.dataTransfer.setData(DRAG_WORN, s);
    ev.dataTransfer.setData('text/plain', itemName(st.eq[s]));
    ev.dataTransfer.effectAllowed = 'move';
    return false;
  }
  if (type !== 'click') return false;
  if (action === 'slot') { const s = t.getAttribute('data-slot'); sc.slot = sc.slot === s ? null : s; sc.msg = ''; sc.msgAt = null; repaint(); return true; }
  if (action === 'wear' && sc.slot) { wear(st, repaint, sc.slot, t.getAttribute('data-item'), 'slot'); return true; }
  if (action === 'unequip' && sc.slot && st.eq[sc.slot]) { wear(st, repaint, sc.slot, null, 'slot'); return true; }
  return false;
}

const DOLL_ACTS = new Set(['slot', 'fit-row', 'wear', 'unequip']);

function onPocket(ctx, body, st, action, ev, t, repaint) {
  const sc = st.sc;
  const type = ev.type;
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
  if (ev.shiftKey && chatOpen(ctx) && linkInChat(ctx, id)) return true;   // Shift+click links it into an open chat
  if (ev.shiftKey) rangeSel(st, id);
  else if (ev.ctrlKey || ev.metaKey || sc.sel.size) toggleSel(sc, id);
  sc.cursor = id;
  sc.menu = null;
  commitSeen(st.cs, [id]);
  repaint();
  t.focus();
  return true;
}

/**
 * The Inventory's [data-hs-act] events. Returns true when the event was consumed.
 * @param {() => void} repaint
 */
export function actInventory(ctx, body, action, ev, t, repaint) {
  const st = stateOf(ctx);
  const sc = st.sc;
  const type = ev.type;
  if (type === 'keydown') return onKey(ctx, body, st, ev, t, repaint);
  if ((type === 'dragover' || type === 'drop') && (action === 'pocket' || action === 'grid')) return onGridDrag(st, ev, repaint);
  if (DOLL_ACTS.has(action)) return onDoll(ctx, st, action, ev, t, repaint);
  if (action === 'pocket' || action === 'loot-row') return onPocket(ctx, body, st, action, ev, t, repaint);
  if (type === 'input' && action === 'search') { sc.query = t.value.slice(0, 40); repaint(); askElsewhere(ctx, sc.query, repaint); return false; }
  if (type === 'change' && action === 'sort') { setPref(st.cs, 'sort', t.value); return false; }
  if (type === 'change' && action === 'rule') { doRule(st, t.getAttribute('data-item'), t.value, repaint); return false; }
  if (type === 'change' && action === 'advanced') { setPref(st.cs, 'advanced', t.checked); return false; }
  if (type !== 'click') return false;
  const cur = sc.cursor && st.qty.has(sc.cursor) ? sc.cursor : null;
  switch (action) {
    case 'tab': sc.tab = t.getAttribute('data-tab'); sc.menu = null; sc.confirm = null; hideTip(ctx.doc); repaint(); return true;
    case 'cat': setPref(st.cs, 'cat', t.getAttribute('data-cat')); return true;
    case 'primary': if (cur) doPrimary(st, cur, repaint); return true;
    case 'more': if (cur) { const r = t.getBoundingClientRect(); openMenu(ctx, body, st, cur, { x: r.left, y: r.bottom + 4 }, repaint); } return true;
    case 'sell-sel': askSell(st, Array.from(sc.sel), 'Sell selected', repaint); return true;
    case 'clear-sel': sc.sel.clear(); repaint(); return true;
    case 'dispatch': doDispatch(ctx, st, repaint); return true;
    case 'sell-cat': askSell(st, st.shown.map((r) => r.id), 'Sell all', repaint); return true;
    case 'confirm-yes': doSell(st, repaint); return true;
    case 'confirm-no': sc.confirm = null; repaint(); return true;
    case 'bury-stop': doStopBury(st, repaint); return true;
    case 'equip-upgrades': sc.menu = null; equipUpgrades(st.cs, sc, repaint, st.upgrade); return true;
    case 'inv': closeMenu(ctx, st); return false;
    default: break;
  }
  const id = sc.menu ? sc.menu.id : cur;
  if (!id) return false;
  switch (action) {
    case 'm-equip': case 'm-eat': doPrimary(st, id, repaint); return true;
    case 'm-bury': doBury(st, id, repaint); return true;
    case 'm-fuel-one': doBury(st, id, repaint, 1); return true;
    case 'm-hearth': doNamed(st, id, repaint); return true;
    case 'm-bar': send(st, repaint, () => assignToBar(st.cs, id), 'Putting it on the bar…'); return true;
    case 'm-sell': askSell(st, [id], 'Sell', repaint); return true;
    case 'm-lock': doLock(st, id, repaint); return true;
    case 'm-select': toggleSel(sc, id); sc.menu = null; repaint(); return true;
    case 'm-link': linkInChat(ctx, id); closeMenu(ctx, st); return true;
    case 'm-rule': doRule(st, id, t.getAttribute('data-rule'), repaint); return true;
    default: return false;
  }
}
