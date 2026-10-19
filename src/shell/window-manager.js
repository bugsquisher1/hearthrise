// ════════════════════════════════════════════════════════════════════════
// src/shell/window-manager.js — WHICH WINDOWS ARE OPEN, WHERE, AND IN WHAT ORDER.
//
// docs/design/WORLD_SHELL.md §4, ported from the prototype's proven behaviour:
//   desktop  a window opens DOCKED at the right edge, newer ones to its left; a
//            floated window (dragged by its head) leaves the dock. The dock never
//            covers more than DOCK_MAX of the World: opening one that would cross
//            it closes the oldest docked window. At most MAX_OPEN open in all.
//   phone    ONE full-height side sheet, min(400px, 48vw); opening another
//            replaces it.
//   Esc      closes the top window; with none open it opens the `escape` row.
//   keys     each row's `key` toggles it; ignored while typing (src/utils/dom.js
//            keyBelongsToField: a text field, or a select's arrows) or with a modifier.
//   motion   a close waits MOTION_MS for the slide-out; none under reduced motion.
//   inset    the covered right-edge rect, published on every change so the World
//            can centre its camera in what is still visible (engine `setInset`).
//
// PURE: no DOM, no window, no G. The host passes the size class, the World's
// size and a scheduler, so node drives every rule (tests/shell-core.mjs).
// ════════════════════════════════════════════════════════════════════════

import { keyBelongsToField } from '../utils/dom.js?v=0.2.3';

export const MAX_OPEN = 3;
export const DOCK_MAX = 0.6;
export const DOCK_GAP = 8;
export const DOCK_EDGE = 12;
export const MOTION_MS = 120;
const SHEET_MAX = 400;
const SHEET_VW = 0.48;

const KEY_RE = /^([a-z]|enter|escape)$/;

/** Throws on a catalogue the manager cannot honour; returns the rows by id. */
export function validateWindowRows(rows) {
  if (!Array.isArray(rows)) throw new Error('shell windows: rows must be an array');
  const byId = new Map(), keys = new Map();
  let escapes = 0;
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(r.id)) throw new Error('shell windows: bad id ' + JSON.stringify(r && r.id));
    if (byId.has(r.id)) throw new Error('shell windows: duplicate id ' + r.id);
    if (typeof r.label !== 'string' || !r.label) throw new Error('shell windows: ' + r.id + ' has no label');
    if (!KEY_RE.test(r.key || '')) throw new Error('shell windows: ' + r.id + ' key must be a letter, enter or escape');
    if (keys.has(r.key)) throw new Error('shell windows: key ' + r.key + ' is both ' + keys.get(r.key) + ' and ' + r.id);
    if (!(r.width > 0)) throw new Error('shell windows: ' + r.id + ' needs a positive width');
    if (r.escape) escapes++;
    byId.set(r.id, r);
    keys.set(r.key, r.id);
  }
  if (escapes > 1) throw new Error('shell windows: more than one escape row');
  return byId;
}

/** True when a key event must not reach the shell: typing (the one key rule), IME, or a modifier chord. */
function isTypingEvent(ev) {
  if (!ev || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return true;
  return keyBelongsToField(ev.target, ev.key);
}

/**
 * @param {object} o
 * @param {object[]} o.windows      the catalogue (src/data/shell-windows.js)
 * @param {() => boolean} o.isPhone the phone size class
 * @param {() => {width:number,height:number}} o.world  the World's size, CSS px
 * @param {() => boolean} [o.reducedMotion]
 * @param {(fn:Function, ms:number) => any} [o.schedule]
 */
export function createWindowManager(o) {
  const rows = validateWindowRows(o.windows);
  const isPhone = o.isPhone;
  const world = o.world;
  const reducedMotion = o.reducedMotion || (() => false);
  const schedule = o.schedule || ((fn, ms) => setTimeout(fn, ms));
  const open = [];               // ids, oldest first; the last is the top
  const floating = new Map();    // id -> {x, y} once dragged off the dock
  const leaving = new Set();     // ids sliding out
  const entering = new Set();    // ids sliding in on the next paint
  const listeners = new Set();
  let lastInset = '';

  const docked = () => open.filter((id) => !floating.has(id));
  const dockWidth = (ids) => (ids.length ? ids.reduce((s, id) => s + rows.get(id).width, 0) + DOCK_GAP * (ids.length - 1) + DOCK_EDGE : 0);
  const sheetWidth = () => Math.min(SHEET_MAX, Math.round(world().width * SHEET_VW));

  function drop(id) {
    const i = open.indexOf(id);
    if (i >= 0) open.splice(i, 1);
    floating.delete(id);
    leaving.delete(id);
    entering.delete(id);
  }

  function emit() {
    const inset = insetOf();
    const sig = inset.right + 'x' + inset.rect.height;
    const insetChanged = sig !== lastInset;
    lastInset = sig;
    for (const fn of listeners) fn({ open: open.slice(), inset, insetChanged });
  }

  function openWindow(id) {
    if (!rows.has(id)) return false;
    if (open.includes(id) && !leaving.has(id)) return focus(id);
    drop(id);
    if (isPhone()) for (const other of open.slice()) drop(other);
    open.push(id);
    if (!reducedMotion()) entering.add(id);
    if (!isPhone()) {
      const max = world().width * DOCK_MAX;
      while (docked().length > 1 && dockWidth(docked()) > max) drop(docked()[0]);
    }
    while (open.length > MAX_OPEN) drop(open[0]);
    emit();
    return true;
  }

  function close(id) {
    if (!open.includes(id) || leaving.has(id)) return false;
    entering.delete(id);
    if (reducedMotion()) { drop(id); emit(); return true; }
    leaving.add(id);
    emit();
    schedule(() => { if (leaving.has(id)) { drop(id); emit(); } }, MOTION_MS);
    return true;
  }

  function focus(id) {
    if (!open.includes(id) || leaving.has(id)) return false;
    if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); emit(); }
    return true;
  }

  function toggle(id) {
    return open.includes(id) && !leaving.has(id) ? close(id) : openWindow(id);
  }

  /** The live windows, oldest first (a window sliding out is already gone). */
  const live = () => open.filter((id) => !leaving.has(id));

  function onEscape() {
    const l = live();
    if (l.length) return close(l[l.length - 1]);
    for (const r of rows.values()) if (r.escape) return openWindow(r.id);
    return false;
  }

  /** Route a keydown. Returns true when the shell consumed it (the host then preventDefaults). */
  function handleKey(ev) {
    if (isTypingEvent(ev)) return false;
    const k = String(ev.key || '').toLowerCase();
    if (k === 'escape') return onEscape();
    for (const r of rows.values()) if (r.key === k && k !== 'escape') return toggle(r.id);
    return false;
  }

  /** Float a window at {x, y} (desktop only), clamped inside the World. */
  function float(id, pos) {
    if (isPhone() || !open.includes(id)) return false;
    const w = world(), width = rows.get(id).width;
    floating.set(id, { x: Math.round(Math.max(0, Math.min(w.width - width, pos.x))), y: Math.round(Math.max(0, Math.min(w.height - 48, pos.y))) });
    if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); }
    emit();
    return true;
  }

  function dock(id) {
    if (!floating.delete(id)) return false;
    const max = world().width * DOCK_MAX;
    while (docked().length > 1 && dockWidth(docked()) > max) drop(docked().find((d) => d !== id));
    emit();
    return true;
  }

  /** The size class changed: the phone keeps only the top window, docked. */
  function resize() {
    if (isPhone()) {
      while (open.length > 1) drop(open[0]);
      floating.clear();
    }
    emit();
  }

  /** The covered right-edge strip of the World, and its rect, for the camera inset. */
  function insetOf() {
    const w = world();
    let right = 0;
    if (live().length) right = isPhone() ? sheetWidth() : dockWidth(docked().filter((id) => !leaving.has(id)));
    right = Math.min(right, w.width);
    return { right, rect: { x: w.width - right, y: 0, width: right, height: right ? w.height : 0 } };
  }

  /** Where each open window sits: newest docked at the right edge, older ones to its left. */
  function layout() {
    const phone = isPhone();
    const out = [];
    let right = DOCK_EDGE;
    for (let i = open.length - 1; i >= 0; i--) {
      const id = open[i], r = rows.get(id);
      const e = { id, z: 10 + i, top: i === open.length - 1, entering: entering.has(id), leaving: leaving.has(id), phone };
      if (phone) Object.assign(e, { docked: true, right: 0, width: null });
      else if (floating.has(id)) Object.assign(e, { docked: false, x: floating.get(id).x, y: floating.get(id).y, width: r.width });
      else { Object.assign(e, { docked: true, right, width: r.width }); right += r.width + DOCK_GAP; }
      out.unshift(e);
    }
    entering.clear();
    return out;
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return {
    open: openWindow, close, toggle, focus, float, dock, resize, handleKey, layout, subscribe,
    inset: insetOf,
    openIds: () => live(),
    isOpen: (id) => live().includes(id),
    row: (id) => rows.get(id) || null,
    rows: () => Array.from(rows.values()),
  };
}
