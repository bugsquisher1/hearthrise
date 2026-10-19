// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/amount.js — HOW MANY? THE ONE AMOUNT PICKER.
//
// Tyler 10-18: "there's no way to store a number of items, it's all or
// nothing." Storage's Store / Take and the Inventory's Bury ask how many with
// this: a number field, − and +, All, and the action's own button (Enter in
// the field presses it). It floats in the page's one context menu
// (src/shell/windows/float-menu.js). Display only: it answers a count between
// 1 and the stack the server last sent; the owner sends that count as its
// intent and the counts on screen change only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.6';

/** A whole number clamped to 1..max (a typed "", "abc" or 0 reads as 1). */
export function clampAmount(v, max) {
  const n = Math.floor(Number(v));
  const top = Math.max(1, Math.floor(Number(max)) || 1);
  return Number.isFinite(n) ? Math.max(1, Math.min(top, n)) : 1;
}

/**
 * The picker's markup.
 * @param {{title:string, verb:string, max:number, value?:number, act:string}} o
 *   `act` is the [data-hs-act] of the confirm button (the owner's action).
 */
export function amountHtml(o) {
  const v = clampAmount(o.value === undefined ? o.max : o.value, o.max);
  return '<b class="hw-menu-title">' + esc(o.title) + '</b>'
    + '<span class="hw-amt" role="group" aria-label="How many">'
    + '<button type="button" class="hh-tool" data-hs-act="amt-less" aria-label="One fewer">−</button>'
    + '<input type="number" class="hh-num hw-amt-n" min="1" max="' + o.max + '" step="1" value="' + v + '" aria-label="How many" data-max="' + o.max + '">'
    + '<button type="button" class="hh-tool" data-hs-act="amt-more" aria-label="One more">+</button>'
    + '<button type="button" class="hh-tool" data-hs-act="amt-all">All (' + o.max + ')</button></span>'
    + '<button type="button" class="hw-mi hw-amt-go" data-hs-act="' + esc(o.act) + '" data-hs-default>' + esc(o.verb) + '</button>';
}

/** The count the picker inside `root` holds now (clamped). */
export function amountOf(root) {
  const n = root && root.querySelector('.hw-amt-n');
  return n ? clampAmount(n.value, n.getAttribute('data-max')) : 1;
}

/** −, + and All: change the field. Returns true when `action` was one of them. */
export function stepAmount(root, action) {
  const n = root && root.querySelector('.hw-amt-n');
  if (!n) return false;
  const max = n.getAttribute('data-max');
  const now = clampAmount(n.value, max);
  if (action === 'amt-less') n.value = String(clampAmount(now - 1, max));
  else if (action === 'amt-more') n.value = String(clampAmount(now + 1, max));
  else if (action === 'amt-all') n.value = String(clampAmount(max, max));
  else return false;
  n.focus();
  return true;
}
