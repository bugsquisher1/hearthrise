// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/selection.js — THE BAG'S SELECTION: WHAT A PRESS OR A KEY MEANS.
//
// PURE. The selection is display state in the Inventory's scratch (state.js:
// `sel`, `anchor`, `base`, `cursor`), never residue; nothing spends it but
// the bulk tools, which name the server's rows (actions.js). This is the one
// place a gesture becomes a selection, the way a file list behaves (Tyler
// 2026-11-11: "I can hit ctrl+A to select all, but hitting it again doesn't
// deselect all"):
//   a plain press        with a selection active, just that stack; with none,
//                        none (the cursor picks it)
//   Ctrl+press, Space    toggles that stack (a finger's tap over a selection
//                        counts as Ctrl: actions.js, since a phone has none)
//   Shift+press / arrow  the range from the anchor (the last stack pressed
//                        without Shift) to it, replacing the selection; with
//                        Ctrl too, added to what was selected when the anchor
//                        was set, so a range can grow and shrink
//   Ctrl+A               every shown stack; pressed with every shown stack
//                        already selected, none
//   Escape               none
// `shown` is the grid's order (bag-model.js view), so a range follows the sort
// and the search on screen. The line over the tools counts the selection and
// values it at the shop's bids (the server's), and the Lock tool reads Unlock
// over a selection that is already locked.
// ════════════════════════════════════════════════════════════════════════
import { bagValue } from '../../bag-model.js?v=0.2.130';
import { gold, whole } from '../../../render/format.js?v=0.2.130';
import { t } from '../../../render/player-text.js?v=0.2.130';

const idsOf = (shown) => shown.map((r) => (typeof r === 'string' ? r : r.id));

/* The anchor: where the next Shift range starts, and what it adds to (Ctrl+Shift). */
function setAnchor(sc, id) { sc.anchor = id; sc.base = new Set(sc.sel); }

function toggle(sc, id) { if (sc.sel.has(id)) sc.sel.delete(id); else sc.sel.add(id); }

/** Nothing selected (the anchor stays: a Shift press after it still ranges from there). */
export function clearSelection(sc) { sc.sel.clear(); sc.base = null; }

/** After a bulk press (Sell, Deposit, Lock: one server ask, all or nothing): done with the selection on ok; a refusal
    moved nothing, so the selection stands for the next try. Returns whether it went. */
export function settleSelection(sc, r) {
  const went = !!(r && r.ok);
  if (went) clearSelection(sc);
  return went;
}

/** Ctrl+A: every shown stack; with every shown stack already selected, none at all. */
export function selectAll(sc, shown) {
  const ids = idsOf(shown);
  if (!ids.length) return;
  if (ids.every((id) => sc.sel.has(id))) sc.sel.clear();
  else for (const id of ids) sc.sel.add(id);
}

/** Ctrl+press or Space on `id`: toggled, and the anchor moves there. */
export function toggleSelect(sc, id) { toggle(sc, id); setAnchor(sc, id); }

/**
 * Shift: the selection becomes the range from the anchor to `id` in the shown order (with `ctrl`, added to what was
 * selected when the anchor was set). With no anchor on screen the range starts at `from` (the cursor before an arrow
 * moved it), which becomes the anchor.
 */
export function rangeTo(sc, id, shown, o) {
  const ids = idsOf(shown);
  const b = ids.indexOf(id);
  if (b < 0) return;
  const held = sc.anchor && ids.includes(sc.anchor);
  const from = held ? sc.anchor : o && o.from && ids.includes(o.from) ? o.from : id;
  if (!held) setAnchor(sc, from);
  const next = new Set(o && o.ctrl && sc.base ? sc.base : []);
  const a = ids.indexOf(from);
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ids[i]);
  sc.sel.clear();
  for (const x of next) sc.sel.add(x);
  sc.cursor = id;
}

/** A press on the stack `id` with its modifiers ({ ctrl, shift }): the selection and the cursor after it. */
export function pressSelect(sc, id, shown, mods) {
  const m = mods || {};
  if (m.shift) { rangeTo(sc, id, shown, { ctrl: !!m.ctrl, from: sc.cursor }); return; }
  if (m.ctrl) toggle(sc, id);
  else if (sc.sel.size) { sc.sel.clear(); sc.sel.add(id); }
  setAnchor(sc, id);
  sc.cursor = id;
}

/** The selection's own keys: Escape (none) and Ctrl+A (all shown, or none). True when the key was one of them. */
export function selectKey(sc, key, mods, shown) {
  if (key === 'Escape') { if (!sc.sel.size) return false; clearSelection(sc); return true; }
  if (mods && mods.ctrl && String(key).toLowerCase() === 'a') { selectAll(sc, shown); return true; }
  return false;
}

/** The selected stacks that are still in the bag (the server's rows), in the shown order first, then the rest. */
export function selectedIds(sc, items) {
  const have = new Set(items.map((r) => r.id));
  return Array.from(sc.sel).filter((id) => have.has(id));
}

/** "3 selected · value 120 gp" at the shop's bids; with no shop yet, the count alone; nothing selected, no line at all. */
export function selectionWords(ids, items, bids) {
  const n = ids.length;
  if (!n) return '';
  if (!bids) return t('bag.selected', { count: n });
  const want = new Set(ids);
  const v = bagValue(items.filter((r) => want.has(r.id)), bids);
  return v.unpriced ? t('bag.selected_worth_unpriced', { count: n, worth: gold(v.total), unpriced: whole(v.unpriced) })
    : t('bag.selected_worth', { count: n, worth: gold(v.total) });
}

/** The Lock tool's word: Unlock over a selection that is locked through, else Lock. */
export function lockLabel(ids, locked) {
  return ids.length && locked && ids.every((id) => locked.has(id)) ? t('controls.unlock') : t('controls.lock');
}
