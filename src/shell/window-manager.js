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
//   go to    goTo(id, { tab, find }) is the one door a "take me there" link uses (src/shell/goto.js):
//            it opens (or raises) the window on its tab and asks it for one row; the shell
//            brings that row into view once the window draws it (takeFind), and a close
//            forgets the wish.
//   size     a row with `resizable: true` (and a `height`) takes its size from
//            o.sizeOf(id) (the residue `winSize`, a display preference) clamped to
//            RESIZE_MIN and the World; setSize changes it live (the shell's grip).
//            The phone ignores both: one sheet, its own size.
//   no inset WINDOWS FLOAT OVER THE WORLD (Tyler 2026-10-19): no window, docked,
//            floating, modal or phone sheet, takes any of the World or moves its camera.
//   beside   THE COEXISTENCE TABLE (UX flow audit 2026-11-11: at 1440 the bag closed Storage, the Shop
//            and Character without a word). Two rows that name each other in `beside` share the dock past
//            DOCK_MAX, up to the World's width; a row with `over: true` (Hunts, Hunt prep: wider than the
//            dock) lies over the docked windows and closes none of them.
//   pages    A row with `pageOf` (Monster facts in Hunts, Configure action in Hunt prep) opened by a press
//            inside one of those windows opens as a PAGE of it, not a second window: isOpen and
//            openIds count it, close takes it back to its host, closing the host closes it.
//   back     THE WAY BACK: a window opened by a press inside another (from(opener, fn)) remembers it;
//            back(id) closes a page, or closes the window and opens the one it came from (cameFrom).
//            Display state only, kept in memory, never the residue.
//
// PURE: no DOM, no window, no G. The host passes the size class, the World's
// size and a scheduler, so node drives every rule (tests/shell-core.mjs).
// ════════════════════════════════════════════════════════════════════════

import { keyBelongsToField } from '../utils/dom.js?v=0.2.125';

export const MAX_OPEN = 3;
export const DOCK_MAX = 0.6;
export const DOCK_GAP = 8;
export const DOCK_EDGE = 12;
export const MOTION_MS = 120;
/* The smallest a resizable window gets (its tabs and one line of field must still fit). */
export const RESIZE_MIN = Object.freeze({ w: 280, h: 160 });
/* A home-bl window's bottom edge above the World's: clear of the bottom-left widgets (Players online). */
export const HOME_BOTTOM = 44;
/* A docked window ends above the bottom bar while that leaves it this tall; on a shorter World (1280x720, 1024x768) a window whose
   content needs more rises over the bar to the World's height (Tyler 2026-11-11: "when I open a menu, part of it shouldn't
   automatically be cut off"; the Hunts window had 338 px of a 652 px screen). src/shell/window-fit.js applies it. */
export const DOCK_ROOM_PX = 480;
/** Does a docked window with `cap` px above the bar and `need` px of content rise over the bar? Pure. */
export function overBar(cap, need) { return Number.isFinite(cap) && cap < DOCK_ROOM_PX && need > cap; }

/* The slash opens the Wiki: every letter is a window's or WASD's. */
const KEY_RE = /^([a-z]|\/|enter|escape)$/;

/** Throws on a catalogue the manager cannot honour; returns the rows by id. */
export function validateWindowRows(rows) {
  if (!Array.isArray(rows)) throw new Error('shell windows: rows must be an array');
  const byId = new Map(), keys = new Map();
  let escapes = 0;
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(r.id)) throw new Error('shell windows: bad id ' + JSON.stringify(r && r.id));
    if (byId.has(r.id)) throw new Error('shell windows: duplicate id ' + r.id);
    if (typeof r.label !== 'string' || !r.label) throw new Error('shell windows: ' + r.id + ' has no label');
    const noKey = r.key === null && ((r.modal === true && r.launcher === false)   // a popup only the game opens
      || r.noShortcut === true                                                    // a launcher row with no letter left for it: the icon opens it
      || r.gm === true);                                                          // the Game Master's window: a key would open an empty window on anyone's keyboard
    if (!noKey && !KEY_RE.test(r.key || '')) throw new Error('shell windows: ' + r.id + ' key must be a letter, the slash, enter or escape');
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
    /* a window the coach's card stays up beside sits home in the far corner: a docked one would take the card's place */
    if (r.besideCoach !== undefined && !(r.besideCoach === true && r.home === 'bl')) throw new Error('shell windows: ' + r.id + ' besideCoach is true on a home window, or absent');
    if ((r.home || r.resizable) && !(r.height > 0)) throw new Error('shell windows: ' + r.id + ' needs a positive height to sit home or resize');
    if ((r.home || r.resizable) && r.modal) throw new Error('shell windows: ' + r.id + ' a modal neither sits home nor resizes');
    if (r.beside !== undefined && !(Array.isArray(r.beside) && r.beside.length && r.beside.every((x) => typeof x === 'string' && x !== r.id))) throw new Error('shell windows: ' + r.id + ' beside is a list of other windows');
    if (r.over !== undefined && !(r.over === true && !r.modal && !r.home)) throw new Error('shell windows: ' + r.id + ' over is true on a docked row, or absent');
    if (r.pageOf !== undefined && !(Array.isArray(r.pageOf) && r.pageOf.length && r.pageOf.every((x) => typeof x === 'string' && x !== r.id) && r.launcher === false)) throw new Error('shell windows: ' + r.id + ' pageOf lists its hosts, on a row with no launcher icon');
    if (r.help !== undefined && !/^[a-z]+\.[a-z0-9_]+$/.test(r.help)) throw new Error('shell windows: ' + r.id + ' help names a text row');
    if (r.escape) escapes++;
    byId.set(r.id, r);
    if (!noKey) keys.set(r.key, r.id);
  }
  if (escapes > 1) throw new Error('shell windows: more than one escape row');
  for (const r of rows) for (const x of (r.beside || []).concat(r.pageOf || [])) if (!byId.has(x)) throw new Error('shell windows: ' + r.id + ' names no window ' + x);
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
  const findWanted = new Map();  // id -> the row a link asked it to bring into view (goTo), until the shell finds it
  const pages = new Map();       // host id -> the page id it shows (a pageOf row opened from inside it)
  const cameFrom = new Map();    // id -> the window a press inside opened it from (back)
  let opener = null;             // the window a press is being handled inside (from), or null
  let returning = false;         // back() is reopening a window: its own way back is kept

  const isModal = (id) => rows.get(id).modal === true;
  const isOver = (id) => rows.get(id).over === true;
  /* Do two rows share the dock (either names the other in `beside`)? */
  const besides = (a, b) => (rows.get(a).beside || []).includes(b) || (rows.get(b).beside || []).includes(a);
  const hostOf = (id) => { for (const [h, p] of pages) if (p === id) return h; return null; };
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
  /* The dock's reach for `id`: DOCK_MAX of the World, or the whole World when every window docked beside it is its partner. */
  function dockMax(id) {
    const occ = spans(id);
    return occ.length && occ.every((q) => besides(id, q.id)) ? world().width - DOCK_EDGE : world().width * DOCK_MAX;
  }

  /* The other docked windows' occupied spans (right-edge offsets), sorted. A window that lies `over` the dock takes no span. */
  function spans(except) {
    return docked().filter((d) => d !== except && slot.has(d) && !leaving.has(d) && !isOver(d))
      .map((d) => ({ id: d, r: slot.get(d), w: width(d) })).sort((a, b) => a.r - b.r);
  }
  const fits = (r, w, occ) => r >= DOCK_EDGE && occ.every((q) => r + w + DOCK_GAP <= q.r || q.r + q.w + DOCK_GAP <= r);

  /* A free slot for id that keeps the dock inside its reach (its remembered one first), or null. */
  function freeSlot(id, prefer) {
    const w = width(id), occ = spans(id), max = dockMax(id);
    const tries = (Number.isFinite(prefer) ? [prefer] : []).concat([DOCK_EDGE], occ.map((q) => q.r + q.w + DOCK_GAP));
    for (const r of tries) if (fits(r, w, occ) && r + w <= max) return r;
    return null;
  }

  /* Give a docked window its slot: a free one; else pack the others right if that makes room; else close the oldest. */
  function place(id, prefer) {
    /* a window wider than the dock lies over it at the edge and moves nobody */
    if (isOver(id)) { slot.set(id, DOCK_EDGE); return; }
    for (;;) {
      const r = freeSlot(id, prefer);
      if (r !== null) { slot.set(id, r); return; }
      const occ = spans(id);
      if (!occ.length) { slot.set(id, DOCK_EDGE); return; }
      const packed = occ.reduce((s, q) => s + q.w + DOCK_GAP, DOCK_EDGE);
      if (packed + width(id) <= dockMax(id)) {
        let at = DOCK_EDGE;
        for (const q of occ) { slot.set(q.id, at); at += q.w + DOCK_GAP; }
        slot.set(id, at);
        return;
      }
      drop(occ.map((q) => q.id).sort((a, b) => open.indexOf(a) - open.indexOf(b))[0]);
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
    findWanted.delete(id);
    leaving.delete(id);
    entering.delete(id);
    pages.delete(id);   // a host takes its page with it
  }

  function emit() {
    for (const fn of listeners) fn({ open: open.slice() });
  }

  function openWindow(id) {
    if (!rows.has(id)) return false;
    const by = opener && opener !== id && live().includes(opener) ? opener : null;
    /* a page of the window the press was in: its host shows it, raised */
    if (by && (rows.get(id).pageOf || []).includes(by)) {
      if (open.includes(id)) drop(id);
      const was = hostOf(id);
      if (was) pages.delete(was);
      pages.set(by, id);
      if (open[open.length - 1] !== by) { open.splice(open.indexOf(by), 1); open.push(by); }
      emit();
      return true;
    }
    /* anywhere else it is a window of its own */
    if (hostOf(id)) pages.delete(hostOf(id));
    if (open.includes(id) && !leaving.has(id)) return focus(id);
    if (by) cameFrom.set(id, by); else if (!returning) cameFrom.delete(id);
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
    /* a page closes back to its host */
    const host = hostOf(id);
    if (host) { pages.delete(host); emit(); return true; }
    if (!open.includes(id) || leaving.has(id)) return false;
    cameFrom.delete(id);
    entering.delete(id);
    if (reducedMotion()) { drop(id); emit(); return true; }
    leaving.add(id);
    emit();
    schedule(() => { if (leaving.has(id)) { drop(id); emit(); } }, MOTION_MS);
    return true;
  }

  function focus(id) {
    if (hostOf(id)) return focus(hostOf(id));
    if (!open.includes(id) || leaving.has(id)) return false;
    if (open[open.length - 1] !== id) { open.splice(open.indexOf(id), 1); open.push(id); emit(); }
    return true;
  }

  function toggle(id) {
    return isOpen(id) ? close(id) : openWindow(id);
  }

  /** Open (or raise) `id` on `tab`: its renderer takes the wish on its next patch (takeTab). */
  function openTab(id, tab) {
    if (!rows.has(id) || typeof tab !== 'string') return false;
    tabWanted.set(id, tab);
    pages.delete(id);   // a host asked for one of its own tabs shows itself, not its page
    if (open.includes(id) && !leaving.has(id)) { focus(id); emit(); return true; }
    return openWindow(id);
  }

  /** A link's door (src/shell/goto.js): open (or raise) `id`, on `o.tab` when given, then ask it for row `o.find` (its renderer
      marks the row data-hs-find; the shell scrolls to it and rings it once drawn). Another link's wish replaces this one. */
  function goTo(id, o) {
    if (!rows.has(id)) return false;
    const tab = o && typeof o.tab === 'string' && o.tab ? o.tab : null;
    const find = o && typeof o.find === 'string' && o.find ? o.find : null;
    const done = tab ? openTab(id, tab) : openWindow(id);
    if (!done) return false;
    if (find) findWanted.set(id, find); else findWanted.delete(id);
    emit();
    return true;
  }

  /* A WINDOW MADE SMALLER NEVER LOSES ONE (friends' panel 2026-11-01): the kept place stays as it was, so it comes back when the
     window grows; what is drawn is held on screen. A float keeps its head in reach; a docked window overlaps its neighbour
     rather than run off the left edge, and a press raises it. */
  function floatAt(id) {
    const f = floating.get(id), w = world();
    return { x: Math.max(0, Math.min(w.width - width(id), f.x)), y: Math.max(0, Math.min(w.height - 48, f.y)) };
  }
  function dockRight(id, r) {
    return Math.max(DOCK_EDGE, Math.min(r, world().width - width(id) - DOCK_EDGE));
  }

  /** The live windows, oldest first (a window sliding out is already gone). */
  const live = () => open.filter((id) => !leaving.has(id));
  /** A window is open, or shown as a page of an open one. */
  function isOpen(id) { return live().includes(id) || (hostOf(id) !== null && live().includes(hostOf(id))); }

  /** The way back from `id` (or the page it shows): its page closes, else it closes and the window it was opened from opens. */
  function back(id) {
    const host = hostOf(id);
    if (host) return back(host);
    if (pages.has(id)) { pages.delete(id); emit(); return true; }
    const to = cameFrom.get(id);
    if (!to || !rows.has(to) || !live().includes(id)) return false;
    const was = opener;
    opener = null;
    returning = true;
    try { close(id); openWindow(to); } finally { opener = was; returning = false; }
    return true;
  }
  /** Where back(id) goes: `id` itself when it shows a page (its own body), the window it came from, or null. */
  function backTo(id) {
    if (pages.has(id)) return id;
    return live().includes(id) && cameFrom.has(id) ? cameFrom.get(id) : null;
  }
  /** Run `fn` as a press inside window `id`: what it opens remembers `id` (and opens as its page when it may). */
  function from(id, fn) {
    const was = opener;
    opener = rows.has(id) ? id : null;
    try { return fn(); } finally { opener = was; }
  }

  function onEscape() {
    const l = live();
    if (l.length) return pages.has(l[l.length - 1]) ? back(l[l.length - 1]) : close(l[l.length - 1]);
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
      else if (floating.has(id)) Object.assign(e, floatAt(id), { docked: false, width: width(id), height: r.resizable ? sizeNow(id).h : null });
      else Object.assign(e, { docked: true, right: slot.has(id) ? slot.get(id) : DOCK_EDGE, width: width(id), height: r.resizable ? sizeNow(id).h : null });
      if (e.docked && !phone) e.right = dockRight(id, e.right);
      out.push(e);
    }
    entering.clear();
    return out;
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return {
    open: openWindow, close, toggle, focus, float, dock, resize, setSize, handleKey, layout, subscribe, openTab, goTo,
    /** The row a link asked `id` to bring into view, or null (it stays asked until takeFind: the row may draw later). */
    wantsFind: (id) => findWanted.get(id) || null,
    /** The shell found the row: the wish is spent. */
    takeFind(id) { const f = findWanted.get(id) || null; findWanted.delete(id); return f; },
    /** The tab a press asked `id` to show, once (its renderer reads it as it patches), or null. */
    takeTab(id) { const t = tabWanted.has(id) ? tabWanted.get(id) : null; tabWanted.delete(id); return t; },
    /** Is a tab wish waiting for `id`? (the shell re-patches that window at once) */
    wantsTab: (id) => tabWanted.has(id),
    /** The size a window shows at now ({w, h}; h null for a row that sizes to its content). */
    sizeOf: (id) => (rows.has(id) ? sizeNow(id) : null),
    /** The open windows, oldest first, then the pages they show. */
    openIds: () => live().concat(live().filter((h) => pages.has(h)).map((h) => pages.get(h))),
    isOpen,
    back, backTo, from,
    /** The page window `id` shows in place of its own body, or null. */
    pageIn: (id) => (live().includes(id) && pages.has(id) ? pages.get(id) : null),
    row: (id) => rows.get(id) || null,
    rows: () => Array.from(rows.values()),
  };
}
