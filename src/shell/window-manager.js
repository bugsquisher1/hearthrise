// ════════════════════════════════════════════════════════════════════════
// src/shell/window-manager.js — WHICH WINDOWS ARE OPEN, WHERE, AND IN WHAT ORDER.
//
// docs/design/WORLD_SHELL.md §4, ported from the prototype's proven behaviour:
//   desktop  a window opens DOCKED at the right edge, newer ones to its left; a
//            floated window (dragged by its head) leaves the dock. The dock never
//            covers more than DOCK_MAX of the World: opening one that would cross
//            it closes the oldest docked window. At most MAX_OPEN open in all.
//   slots    a docked window keeps its SLOT (its offset from the right edge) for
//            as long as it is open: focusing, opening or closing another window
//            never moves or resizes it (Tyler 10-18: an X press that re-sorted the
//            dock under the pointer never closed anything). A new window takes the
//            first free gap that fits, else the strip's left end; a closed one's
//            place is remembered and a reopen goes back there when it is free.
//            Only when nothing fits inside DOCK_MAX do the survivors pack right
//            (better than closing a second window).
//   order    `open` is the STACK (z order, Esc, focus); it never drives position.
//   phone    ONE full-height side sheet, min(400px, 48vw); opening another
//            replaces it.
//   modal    a row with `modal: true` (Configure action) opens CENTRED over the
//            World on every size class: never docked, never a sheet, and it
//            leaves the windows under it open. On desktop its head drags it like
//            any window (Tyler 2026-10-27), held wholly inside the World (`h`, its
//            measured height); a reopen is centred again. The phone never moves it.
//   Esc      closes the top window; with none open it opens the `escape` row.
//   keys     each row's `key` toggles it; ignored while typing (src/utils/dom.js
//            keyBelongsToField: a text field, or a select's arrows) or with a modifier.
//   motion   a close waits MOTION_MS for the slide-out; none under reduced motion.
//   home     a row with `home: 'bl'` (Chat, Tyler 2026-10-22) opens FLOATING at the
//            World's bottom-left, held to that corner by its bottom edge, until it
//            is dragged; it is never docked, so it never moves a widget or the dock.
//   size     a row with `resizable: true` (and a `height`) takes its size from
//            o.sizeOf(id) (the residue `winSize`, a display preference) clamped to
//            RESIZE_MIN and the World; setSize changes it live (the shell's grip).
//            The phone ignores both: one sheet, its own size.
//   no inset WINDOWS FLOAT OVER THE WORLD (Tyler 2026-10-19): no window, docked,
//            floating, modal or phone sheet, takes any of the World or moves its camera.
//
// PURE: no DOM, no window, no G. The host passes the size class, the World's
// size and a scheduler, so node drives every rule (tests/shell-core.mjs).
// ════════════════════════════════════════════════════════════════════════

import { keyBelongsToField } from '../utils/dom.js?v=0.2.57';

export const MAX_OPEN = 3;
export const DOCK_MAX = 0.6;
export const DOCK_GAP = 8;
export const DOCK_EDGE = 12;
export const MOTION_MS = 120;
/* The smallest a resizable window gets (its tabs and one line of field must still fit). */
export const RESIZE_MIN = Object.freeze({ w: 280, h: 160 });
/* A home-bl window's bottom edge above the World's: clear of the bottom-left widgets (Players online). */
export const HOME_BOTTOM = 44;

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
    /* tabKeys: a second shortcut that opens this window on one of its tabs ({ r: 'services' }: R opens the Shop on Services) */
    if (r.tabKeys !== undefined) {
      if (!r.tabKeys || typeof r.tabKeys !== 'object') throw new Error('shell windows: ' + r.id + ' tabKeys is an object');
      for (const [k, tab] of Object.entries(r.tabKeys)) {
        if (!/^[a-z]$/.test(k) || typeof tab !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(tab)) throw new Error('shell windows: ' + r.id + ' tab key ' + k + ' must be a letter naming a tab');
        if (keys.has(k) || k === r.key) throw new Error('shell windows: key ' + k + ' is both ' + (keys.get(k) || r.id) + ' and ' + r.id + '\'s ' + tab + ' tab');
        keys.set(k, r.id + ':' + tab);
      }
    }
    if (!(r.width > 0)) throw new Error('shell windows: ' + r.id + ' needs a positive width');
    if (r.modal !== undefined && r.modal !== true) throw new Error('shell windows: ' + r.id + ' modal is true or absent');
    if (r.home !== undefined && r.home !== 'bl') throw new Error('shell windows: ' + r.id + " home is 'bl' or absent");
    if (r.resizable !== undefined && r.resizable !== true) throw new Error('shell windows: ' + r.id + ' resizable is true or absent');
    if ((r.home || r.resizable) && !(r.height > 0)) throw new Error('shell windows: ' + r.id + ' needs a positive height to sit home or resize');
    if ((r.home || r.resizable) && r.modal) throw new Error('shell windows: ' + r.id + ' a modal neither sits home nor resizes');
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
 * @param {(id:string) => ({w:number,h:number}|null)} [o.sizeOf]  a resizable window's saved size
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
  const slot = new Map();        // id -> right offset (px from the World's right edge) of a docked window
  const lastAt = new Map();      // id -> { right } | { x, y }: where it was when it last closed
  const sized = new Map();       // id -> {w, h} set live by setSize (else o.sizeOf's saved one)
  const sizeOf = o.sizeOf || (() => null);
  const tabWanted = new Map();   // id -> the tab a press asked it to show (openTab), until its renderer takes it

  const isModal = (id) => rows.get(id).modal === true;
  const docked = () => open.filter((id) => !floating.has(id) && !isModal(id));
  const isHome = (id) => rows.get(id).home === 'bl';
  /* A resizable window's size: the live one, else the saved one, else the row's; clamped to RESIZE_MIN and the World. */
  function sizeNow(id) {
    const r = rows.get(id);
    if (!r.resizable) return { w: r.width, h: r.height || null };
    const s = sized.get(id) || sizeOf(id) || {};
    const wd = world();
    const w = Number.isFinite(s.w) ? s.w : r.width, h = Number.isFinite(s.h) ? s.h : r.height;
    return {
      w: Math.round(Math.max(RESIZE_MIN.w, Math.min(Math.max(RESIZE_MIN.w, wd.width - 2 * DOCK_EDGE), w))),
      h: Math.round(Math.max(RESIZE_MIN.h, Math.min(Math.max(RESIZE_MIN.h, wd.height - HOME_BOTTOM - DOCK_EDGE), h))),
    };
  }
  const width = (id) => sizeNow(id).w;
  const dockMax = () => world().width * DOCK_MAX;

  /* The other docked windows' occupied spans (right-edge offsets), sorted. */
  function spans(except) {
    return docked().filter((d) => d !== except && slot.has(d) && !leaving.has(d))
      .map((d) => ({ id: d, r: slot.get(d), w: width(d) })).sort((a, b) => a.r - b.r);
  }
  const fits = (r, w, occ) => r >= DOCK_EDGE && occ.every((q) => r + w + DOCK_GAP <= q.r || q.r + q.w + DOCK_GAP <= r);

  /* A free slot for id that keeps the dock inside DOCK_MAX (its remembered one first), or null. */
  function freeSlot(id, prefer) {
    const w = width(id), occ = spans(id), max = dockMax();
    const tries = (Number.isFinite(prefer) ? [prefer] : []).concat([DOCK_EDGE], occ.map((q) => q.r + q.w + DOCK_GAP));
    for (const r of tries) if (fits(r, w, occ) && r + w <= max) return r;
    return null;
  }

  /* Give a docked window its slot: a free one; else pack the others right if that makes room; else close the oldest. */
  function place(id, prefer) {
    for (;;) {
      const r = freeSlot(id, prefer);
      if (r !== null) { slot.set(id, r); return; }
      const occ = spans(id);
      if (!occ.length) { slot.set(id, DOCK_EDGE); return; }
      const packed = occ.reduce((s, q) => s + q.w + DOCK_GAP, DOCK_EDGE);
      if (packed + width(id) <= dockMax()) {
        let at = DOCK_EDGE;
        for (const q of occ) { slot.set(q.id, at); at += q.w + DOCK_GAP; }
        slot.set(id, at);
        return;
      }
      drop(docked().find((d) => d !== id && slot.has(d)));
    }
  }

  function drop(id) {
    const i = open.indexOf(id);
    if (i >= 0) open.splice(i, 1);
    if (floating.has(id)) lastAt.set(id, Object.assign({}, floating.get(id)));
    else if (slot.has(id)) lastAt.set(id, { right: slot.get(id) });
    floating.delete(id);
    slot.delete(id);
    sized.delete(id);   // a reopen reads the saved size (the grip saved it on release)
    leaving.delete(id);
    entering.delete(id);
  }

  function emit() {
    for (const fn of listeners) fn({ open: open.slice() });
  }

  function openWindow(id) {
    if (!rows.has(id)) return false;
    if (open.includes(id) && !leaving.has(id)) return focus(id);
    drop(id);
    if (isPhone() && !isModal(id)) for (const other of open.slice()) drop(other);
    /* The cap counts the dock and the floats only: a modal floats over them and never closes one
       (Tyler v0.2.6: Configure action evicted the oldest docked window and the camera moved). */
    const sheets = () => open.filter((x) => !isModal(x));
    if (!isModal(id)) while (sheets().length >= MAX_OPEN) drop(sheets()[0]);
    open.push(id);
    if (!reducedMotion()) entering.add(id);
    if (!isPhone() && !isModal(id)) {
      const was = lastAt.get(id);
      if (was && was.home) floating.set(id, { home: true });
      else if (was && Number.isFinite(was.x)) {
        const w = world();
        floating.set(id, { x: Math.max(0, Math.min(w.width - width(id), was.x)), y: Math.max(0, Math.min(w.height - 48, was.y)) });
      } else if (!was && isHome(id)) floating.set(id, { home: true });
      else place(id, was ? was.right : null);
    }
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

  /** Open (or raise) `id` on `tab`: its renderer takes the wish on its next patch (takeTab). */
  function openTab(id, tab) {
    if (!rows.has(id) || typeof tab !== 'string') return false;
    tabWanted.set(id, tab);
    if (open.includes(id) && !leaving.has(id)) { focus(id); emit(); return true; }
    return openWindow(id);
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
    for (const r of rows.values()) if (r.tabKeys && Object.prototype.hasOwnProperty.call(r.tabKeys, k)) return openTab(r.id, r.tabKeys[k]);
    return false;
  }

  /* A moved modal's spot, held wholly inside the World (its width, and its height `h` when the host measured it). */
  function modalAt(id, f) {
    const w = world();
    const wide = Math.min(rows.get(id).width, w.width), tall = Number.isFinite(f.h) && f.h > 0 ? Math.min(f.h, w.height) : 48;
    return { x: Math.round(Math.max(0, Math.min(w.width - wide, f.x))), y: Math.round(Math.max(0, Math.min(w.height - tall, f.y))) };
  }

  /** Float a window at {x, y} (desktop only), clamped inside the World; a modal also takes its height `h`. */
  function float(id, pos) {
    if (isPhone() || !open.includes(id) || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;
    const w = world();
    slot.delete(id);
    if (isModal(id)) floating.set(id, Object.assign(modalAt(id, pos), Number.isFinite(pos.h) ? { h: pos.h } : {}));
    else floating.set(id, { x: Math.round(Math.max(0, Math.min(w.width - width(id), pos.x))), y: Math.round(Math.max(0, Math.min(w.height - 48, pos.y))) });
    if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); }
    emit();
    return true;
  }

  /**
   * Resize a resizable window (desktop only) to {w, h}, clamped; returns the size it took, or null.
   * `keepBottom`: a window placed by its top grows UP (its bottom edge stays), as the home corner does.
   */
  function setSize(id, size, keepBottom) {
    if (isPhone() || !open.includes(id) || !rows.get(id).resizable || !size) return null;
    const before = sizeNow(id);
    sized.set(id, { w: Math.round(size.w), h: Math.round(size.h) });
    const now = sizeNow(id);
    sized.set(id, now);
    const f = floating.get(id);
    if (keepBottom && f && !f.home) f.y = Math.max(0, f.y - (now.h - before.h));
    emit();
    return now;
  }

  function dock(id) {
    if (!floating.delete(id)) return false;
    if (!isModal(id)) place(id, null);   // a modal "docks" back to the centre
    emit();
    return true;
  }

  /** The size class changed: the phone keeps only the top window, docked. */
  function resize() {
    if (isPhone()) {
      const sheets = open.filter((id) => !isModal(id));
      while (sheets.length > 1) drop(sheets.shift());
      floating.clear();
      slot.clear();
    } else for (const id of docked()) if (!slot.has(id)) { if (isHome(id)) floating.set(id, { home: true }); else place(id, null); }
    emit();
  }

  /** Where each open window sits: docked ones at their own slot (never the stack order), z from the stack. */
  function layout() {
    const phone = isPhone();
    const out = [];
    for (let i = 0; i < open.length; i++) {
      const id = open[i], r = rows.get(id);
      const e = { id, z: 10 + i, top: i === open.length - 1, entering: entering.has(id), leaving: leaving.has(id), phone };
      if (isModal(id)) Object.assign(e, { docked: false, modal: true, width: r.width }, !phone && floating.has(id) ? modalAt(id, floating.get(id)) : {});
      else if (phone) Object.assign(e, { docked: true, right: 0, width: null });
      else if (floating.has(id) && floating.get(id).home) Object.assign(e, { docked: false, x: DOCK_EDGE, bottom: HOME_BOTTOM, width: width(id), height: r.resizable ? sizeNow(id).h : null });
      else if (floating.has(id)) Object.assign(e, { docked: false, x: floating.get(id).x, y: floating.get(id).y, width: width(id), height: r.resizable ? sizeNow(id).h : null });
      else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE, width: width(id), height: r.resizable ? sizeNow(id).h : null });
      out.push(e);
    }
    entering.clear();
    return out;
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return {
    open: openWindow, close, toggle, focus, float, dock, resize, setSize, handleKey, layout, subscribe, openTab,
    /** The tab a press asked `id` to show, once (its renderer reads it as it patches), or null. */
    takeTab(id) { const t = tabWanted.has(id) ? tabWanted.get(id) : null; tabWanted.delete(id); return t; },
    /** Is a tab wish waiting for `id`? (the shell re-patches that window at once) */
    wantsTab: (id) => tabWanted.has(id),
    /** The size a window shows at now ({w, h}; h null for a row that sizes to its content). */
    sizeOf: (id) => (rows.has(id) ? sizeNow(id) : null),
    openIds: () => live(),
    isOpen: (id) => live().includes(id),
    row: (id) => rows.get(id) || null,
    rows: () => Array.from(rows.values()),
  };
}
