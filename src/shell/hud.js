// ════════════════════════════════════════════════════════════════════════
// src/shell/hud.js — THE HUD WIDGET CONTRACT: DEFAULTS, LAYOUT, PLACEMENT.
//
// docs/design/WORLD_SHELL.md §2. Every widget is a row in src/data/hud-widgets.js;
// this module turns the rows plus the player's saved layout into "is it shown,
// how faded, where does it sit, is it folded". Show/hide, per-widget opacity,
// Reset layout, and (Tyler 2026-10-25) MOVE and FOLD: a widget whose title carries
// [data-hs-wdrag] is dragged by it (src/shell/widget-move.js; the desktop size
// class), which writes the same anchor/dx/dy, and its [data-hs-wfold] folds it to
// that title (`folded`). A MOVED widget (anchor/dx/dy off its row's defaults) is
// the player's own, like a floating window: it is clamped on screen at every size,
// it stacks under nothing (a row's `below`), a centred bar neither slides for it
// nor pushes it, and it is not in the camera inset (moving a panel never re-frames
// the hero around where it used to be).
//
// THE LAYOUT IS A DISPLAY PREFERENCE. It is stored per size class in the residue
// field `hudLayout` ({desktop:{id:{...}}, phone:{...}}; src/session/residue.js),
// so a phone layout never breaks the desktop one. Nothing may gate an action or
// spend anything on it: tests/hud-layout-display-only.mjs confines every read
// of the name to this file and the residue store.
//
// PURE except for `residueStore`, the adapter onto one character's residue.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.48';

export const SIZE_CLASSES = Object.freeze(['desktop', 'phone']);
export const OPACITY_MIN = 0.4;
export const OPACITY_MAX = 1;
const ANCHOR_RE = /^[tmb][lcr]$/;
const LAYERS = new Set(['world', 'screen']);
const WHENS = new Set(['always', 'hunt']);
const PHONE_KEYS = new Set(['anchor', 'dx', 'dy', 'opacity', 'visible']);

const clampOpacity = (v) => Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, Number(v)));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Throws on a row that breaks the contract; returns the rows by id. */
export function validateWidgetRows(rows) {
  if (!Array.isArray(rows)) throw new Error('hud widgets: rows must be an array');
  const byId = new Map();
  for (const r of rows) {
    const where = 'hud widget ' + JSON.stringify(r && r.id);
    if (!r || typeof r.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(r.id)) throw new Error(where + ': bad id');
    if (byId.has(r.id)) throw new Error(where + ': duplicate id');
    if (typeof r.label !== 'string' || !r.label) throw new Error(where + ': no label');
    if (!LAYERS.has(r.layer)) throw new Error(where + ': layer must be world or screen');
    if (!ANCHOR_RE.test(r.anchor || '')) throw new Error(where + ': anchor must be t|m|b + l|c|r');
    if (!Number.isFinite(r.dx) || !Number.isFinite(r.dy)) throw new Error(where + ': dx/dy must be numbers');
    if (!Array.isArray(r.min) || r.min.length !== 2 || !(r.min[0] > 0) || !(r.min[1] > 0)) throw new Error(where + ': min must be [w, h]');
    if (!(r.opacity >= OPACITY_MIN && r.opacity <= OPACITY_MAX)) throw new Error(where + ': opacity must be 0.4..1');
    if (typeof r.visible !== 'boolean' || typeof r.removable !== 'boolean') throw new Error(where + ': visible/removable must be booleans');
    if (!r.removable && !r.visible) throw new Error(where + ': a widget that cannot be removed must be visible');
    if (!WHENS.has(r.when)) throw new Error(where + ': when must be always or hunt');
    if (!isObj(r.phone)) throw new Error(where + ': phone must be an object');
    for (const k of Object.keys(r.phone)) if (!PHONE_KEYS.has(k)) throw new Error(where + ': phone.' + k + ' is not overridable');
    if (r.phone.anchor !== undefined && !ANCHOR_RE.test(r.phone.anchor)) throw new Error(where + ': bad phone anchor');
    if (r.below !== undefined && (!Array.isArray(r.below) || !r.below.every((x) => typeof x === 'string' && x !== r.id))) throw new Error(where + ': below must list other widget ids');
    byId.set(r.id, r);
  }
  for (const r of byId.values()) for (const x of r.below || []) if (!byId.has(x)) throw new Error('hud widget ' + JSON.stringify(r.id) + ': below names no widget ' + JSON.stringify(x));
  return byId;
}

/**
 * A widget that STACKS under others on its edge (a row's `below`: the tally under the analyzer and the
 * phone's hunt bar): the top that clears, by `gap`, every rect of `above` it would overlap, or its own top
 * when none is in its way. A rect with no size (a hidden widget) is in nobody's way. Pure.
 * ALWAYS ENDS (Andy, live v0.2.38: the page froze for good at a party start and on a hero switch). Rects are
 * the browser's fractional px: rounded, a bottom of 581.4 put the top back at 581, still above it, and the loop
 * "moved" there for ever. The top only ever RISES, to a whole px at or below every bottom it clears (ceil), so a
 * rect it has cleared stays cleared and each rect moves it at most once: above.length passes plus one that moves
 * nothing. That count is also its hard cap: whatever the rects (NaN, a later change), it never spins.
 */
export function stackBelow(r, above, gap) {
  let top = r.top;
  for (let pass = 0, moved = true; moved && pass <= above.length; pass++) {
    moved = false;
    for (const q of above) {
      if (!(q.width > 0 && q.height > 0)) continue;
      const across = r.left < q.left + q.width && r.left + r.width > q.left;
      const under = Math.ceil(q.top + q.height + gap);
      if (across && top < q.top + q.height + gap && top + r.height > q.top && under > top) { top = under; moved = true; }
    }
  }
  return top;
}

/** The row's own layout for a size class: the desktop fields, then the phone block. */
export function defaultsFor(row, sizeClass) {
  const d = { anchor: row.anchor, dx: row.dx, dy: row.dy, opacity: row.opacity, visible: row.visible, folded: false };
  if (sizeClass === 'phone') Object.assign(d, row.phone);
  return d;
}

/** One saved entry merged over its defaults, keeping only fields with a valid shape. */
function mergeEntry(row, base, saved) {
  const L = Object.assign({}, base);
  if (isObj(saved)) {
    if (typeof saved.anchor === 'string' && ANCHOR_RE.test(saved.anchor)) L.anchor = saved.anchor;
    if (Number.isFinite(saved.dx)) L.dx = Math.round(saved.dx);
    if (Number.isFinite(saved.dy)) L.dy = Math.round(saved.dy);
    if (Number.isFinite(saved.opacity)) L.opacity = clampOpacity(saved.opacity);
    if (typeof saved.visible === 'boolean') L.visible = saved.visible;
    if (typeof saved.folded === 'boolean') L.folded = saved.folded;
  }
  if (!row.removable) L.visible = true;
  return L;
}

/** The fields of `L` that differ from `base`: what is worth saving. */
function diffEntry(L, base) {
  const out = {};
  for (const k of Object.keys(base)) if (L[k] !== base[k]) out[k] = L[k];
  return out;
}

/**
 * Where a widget sits inside its layer box: left/top in px from the anchor and
 * offsets, and never off the box horizontally (a widget wider than the space
 * left beside the dock pins to the left edge). `onScreen` (a moved widget) keeps
 * it inside the box vertically too, at every size: a widget taller than the box
 * pins to its top.
 */
export function placeWidget(L, box, size, onScreen = false) {
  const v = L.anchor[0], h = L.anchor[1];
  const x = h === 'l' ? L.dx : h === 'r' ? box.width - size.width - L.dx : (box.width - size.width) / 2 + L.dx;
  const y = v === 't' ? L.dy : v === 'b' ? box.height - size.height - L.dy : (box.height - size.height) / 2 + L.dy;
  const top = onScreen ? Math.max(0, Math.min(y, box.height - size.height)) : y;
  return { left: Math.round(Math.max(0, Math.min(x, box.width - size.width))), top: Math.round(top) };
}

/**
 * A widget dropped at `rect` (its box's px) as the layout keeps it: the anchor of the box's quarter its middle is
 * in (t|b + l|r: never centred, so a moved widget is never a bar) and the whole px from that corner's edges, the
 * rect first clamped inside the box. Anchored to the nearest corner it keeps its place at any size (a widget left
 * at the bottom-left stays there when the window narrows), and placeWidget puts it back on the same px. Pure.
 */
export function placeFrom(rect, box) {
  const left = Math.max(0, Math.min(rect.left, box.width - rect.width));
  const top = Math.max(0, Math.min(rect.top, box.height - rect.height));
  const h = left + rect.width / 2 < box.width / 2 ? 'l' : 'r';
  const v = top + rect.height / 2 < box.height / 2 ? 't' : 'b';
  return {
    anchor: v + h,
    dx: Math.round(h === 'l' ? left : box.width - rect.width - left),
    dy: Math.round(v === 't' ? top : box.height - rect.height - top),
  };
}

/**
 * WIDGETS NEVER OVERLAP (Tyler 10-19: at 1440x900 with a window docked the hunt bar ran under the
 * analyzer). A centred widget `r` takes the left closest to where it was that clears every
 * edge-anchored widget in its row by `gap`; when no left clears them all (the row is too narrow),
 * it takes the one that hits the fewest (nearest wins a tie) and those it still hits step down
 * below it. Rects are {left, top, width, height} in the box's px. Pure.
 * `fixed` are rects it must also clear but never pushes (the docked windows, r11). An edge rect marked `pinned` (a
 * widget the player moved) is in nobody's row: the bar never slides for it (Tyler 10-22: the bar never travels across
 * the screen for something else) and never pushes it; the player put it there and may move it again.
 * @returns {{left: number, push: {i: number, top: number}[]}}  `i` indexes `edges`
 */
export function clearOfEdges(r, edges, boxWidth, gap, fixed = []) {
  const row = edges.concat(fixed).map((q, i) => ({ q, i })).filter(({ q }) => !q.pinned && q.top < r.top + r.height && q.top + q.height > r.top);
  const hits = (x) => row.filter(({ q }) => !(x + r.width + gap <= q.left || q.left + q.width + gap <= x));
  const xs = [r.left].concat(row.map(({ q }) => q.left + q.width + gap), row.map(({ q }) => q.left - gap - r.width))
    .filter((x) => x >= 0 && x + r.width <= boxWidth)
    .sort((a, b) => hits(a).length - hits(b).length || Math.abs(a - r.left) - Math.abs(b - r.left));
  const left = xs.length ? xs[0] : r.left;
  return { left: Math.round(left), push: hits(left).filter(({ i }) => i < edges.length).map(({ i }) => ({ i, top: Math.round(r.top + r.height + gap) })) };
}

const STAGE_CLEAR_PX = 160;

/**
 * The middle of the stage, which a moved widget never crosses: a STAGE_CLEAR_PX square at the centre
 * of the part of the World the HUD inset leaves (the camera frames the hero there, and windows never
 * move it), so a widget leaving the dock never lands on the fight. Pure.
 */
export function stageOf(inset, box) {
  const cx = inset.left + (box.width - inset.left - inset.right) / 2;
  const cy = inset.top + (box.height - inset.top - inset.bottom) / 2;
  return { left: Math.round(cx - STAGE_CLEAR_PX / 2), top: Math.round(cy - STAGE_CLEAR_PX / 2), width: STAGE_CLEAR_PX, height: STAGE_CLEAR_PX };
}

/**
 * A DOCKED WINDOW NEVER COVERS A WIDGET (r11: a window docked during a hunt sat over the analyzer).
 * A right-anchored widget `r` that a docked window lands on slides left along its row, past every
 * docked window and every other edge widget in that row, by `gap`, but never onto a `stops` rect
 * (stageOf: the middle of the fight). Windows never move the World (Tyler 10-19), so the widget
 * moves, not the window. Returns `r.left` when no docked window touches it, the new left when one
 * does, or null when no left between the dock and the stops clears them all (the widget then waits
 * hidden until the dock narrows). Rects {left, top, width, height}. Pure.
 */
export function clearOfDock(r, dock, others, gap, stops = []) {
  const inRow = (q) => q.top < r.top + r.height && q.top + q.height > r.top;
  const hit = (x, q) => inRow(q) && x < q.left + q.width + gap && q.left < x + r.width + gap;
  if (!dock.some((q) => hit(r.left, q))) return r.left;
  const all = dock.concat(others);
  let x = r.left;
  for (let n = 0; n <= all.length; n++) {
    if (stops.some((q) => hit(x, q))) return null;
    const hits = all.filter((q) => hit(x, q));
    if (!hits.length) return Math.round(x);
    x = Math.min(...hits.map((q) => q.left)) - gap - r.width;
    if (x < 0) return null;
  }
  return null;
}

/* The shortest a docked window is capped to; under it the window keeps its height and the bar clears it instead. */
const DOCK_CAP_MIN_PX = 160;

/**
 * A DOCKED WINDOW STOPS ABOVE THE BOTTOM BAR (Tyler 10-22: a Settings tab that made the docked window taller
 * pushed the action bar across the screen). A docked window `pane` whose column crosses a bottom-centre widget's
 * HOME rect (`bars`) ends `gap` above the highest one, so a window that grows never moves the bar; null when no
 * bar is under it, or when the cap would leave it shorter than DOCK_CAP_MIN_PX (the bar then clears it,
 * clearOfEdges). Rects {left, top, width, height} in the shell's px. Pure.
 */
export function dockCap(pane, bars, gap) {
  const top = barTopUnder(pane, bars, gap);
  if (top === null) return null;
  const cap = Math.round(top - gap - pane.top);
  return cap >= DOCK_CAP_MIN_PX ? cap : null;
}

/**
 * ROOM FOR A STACK (v0.2.46: the desktop action bar grew to 170 px, and the Tally, stacked under a full analyzer at
 * 1440x900, was pushed under the bar and off the World). `a` is a widget the widget `s` stacks under (a row's `below`),
 * rects {left, top, width, height} in the box's px: the height `a` may take so `s`, one `gap` under it, still ends one
 * `gap` above the floor (the highest bottom bar in `bars` crossing `s`'s column, else `boxHeight`). Null when they share
 * no column, when `s` takes no room, or when that room is under DOCK_CAP_MIN_PX (`a` stays readable; `s` steps below
 * as before). It reads `a`'s top, never its height, so the cap it sets settles in one pass. Pure.
 */
export function stackRoom(a, s, bars, boxHeight, gap) {
  if (!(s.width > 0 && s.height > 0) || !(s.left < a.left + a.width && s.left + s.width > a.left)) return null;
  const bar = barTopUnder(s, bars, gap);
  const room = Math.floor((bar === null ? boxHeight : bar) - gap - s.height - gap - a.top);
  return room >= DOCK_CAP_MIN_PX ? room : null;
}

/** The highest top of the bottom bars whose span crosses `pane`'s column (by `gap`), or null. Pure. */
function barTopUnder(pane, bars, gap) {
  const under = bars.filter((b) => b.width > 0 && pane.left < b.left + b.width + gap && b.left < pane.left + pane.width + gap);
  return under.length ? Math.min(...under.map((b) => b.top)) : null;
}

/**
 * A HOME WINDOW SITS ABOVE THE BAR (Chat at the bottom-left, Tyler 10-22): where its column crosses a
 * bottom bar (1440x900: the bar spans 235..1205), it stands `gap` above that bar instead of at its home
 * `bottom`, and is never taller than the room left above it. Returns {bottom, max} in the box's px
 * (`max` null when nothing caps it), from the home `bottom` and the box's height. Pure.
 */
export function homeAboveBar(pane, bars, gap, bottom, boxHeight) {
  const top = barTopUnder(pane, bars, gap);
  if (top === null) return { bottom, max: null };
  return { bottom: Math.max(bottom, Math.round(boxHeight - top + gap)), max: Math.max(0, Math.round(top - 2 * gap)) };
}

/**
 * THE HOME WINDOW NEVER COVERS A WIDGET (v0.2.32 visual gate, 1440x900: Chat at the bottom-left ran over the
 * foot of a four-seat party panel, its Leave party button and "Costs are personal."). Above the bar as
 * homeAboveBar says, and `gap` below every widget in `tops` (the World's widgets not at the bottom) whose span
 * crosses its column: it shrinks to the room between them; when that room is under `minH` (a chat too short
 * to use) it slides right past the widgets in its way, as far as it must. If no left clears them inside
 * `boxWidth`, it keeps its home column and the room, however small: the widget stays readable and clickable.
 * `pane` {left, width} is the window's HOME column; rects {left, top, width, height} in the box's px.
 * Returns {left, bottom, max} (`max` null when nothing caps it). Pure.
 */
export function homeAt(pane, bars, tops, gap, bottom, box, minH) {
  const fit = (left) => {
    const col = { left, width: pane.width };
    const at = homeAboveBar(col, bars, gap, bottom, box.height);
    const foot = box.height - at.bottom;
    const over = tops.filter((q) => q.width > 0 && q.height > 0 && q.top < foot && q.left < left + pane.width + gap && left < q.left + q.width + gap);
    if (!over.length) return Object.assign({ left, low: [] }, at);
    const room = (q) => Math.max(0, Math.round(foot - gap - q.top - q.height));
    const max = Math.min(...over.map(room), at.max === null ? Infinity : at.max);
    /* `low`: the widgets that leave it under minH (only these are slid past; a bar far above it is not) */
    return { left, low: over.filter((q) => room(q) < minH), bottom: at.bottom, max };
  };
  const home = fit(pane.left);
  let at = home;
  for (let n = 0; n <= tops.length && at.low.length; n++) {
    const left = Math.max(...at.low.map((q) => q.left + q.width)) + gap;
    if (left + pane.width > box.width - gap) break;
    at = fit(left);
  }
  if (at.low.length) at = home;
  return { left: at.left, bottom: at.bottom, max: at.max };
}

/**
 * The World edges the docked HUD widgets cover, so the camera frames the
 * playable area above and beside them (the bottom bar must not sit over the
 * bottom row of a hunt). Each widget is { anchor, rect } in the World box's
 * px: a bottom-anchored widget covers `bottom` up to its top edge; a top-centre
 * one covers `top` down to its bottom edge; a side-anchored one covers that
 * side to its inner edge. Only the part of a widget inside the box covers it (a
 * panel pushed below the phone's bar covers nothing), and a top-corner widget
 * covers the top instead of its side when that strip hides less of the World
 * (the phone's hunt bar, anchored top-right, is a bar, not a side panel).
 * @param {{anchor:string, rect:{left:number, top:number, width:number, height:number}}[]} widgets
 * @param {{width:number, height:number}} box
 */
export function hudInsetOf(widgets, box) {
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const w of widgets) {
    const v = w.anchor[0], h = w.anchor[1], q = w.rect;
    const l = Math.max(0, q.left), t = Math.max(0, q.top);
    const r = Math.min(box.width, q.left + q.width), b = Math.min(box.height, q.top + q.height);
    if (!(r > l && b > t)) continue;
    const side = h === 'l' ? r : box.width - l;
    if (v === 'b') out.bottom = Math.max(out.bottom, box.height - t);
    else if (v === 't' && (h === 'c' || box.width * b < side * box.height)) out.top = Math.max(out.top, b);
    else if (h === 'l') out.left = Math.max(out.left, side);
    else if (h === 'r') out.right = Math.max(out.right, side);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(Math.max(0, Math.min(out[k], k === 'left' || k === 'right' ? box.width : box.height)));
  return out;
}

/**
 * The residue adapter for ONE character: reads its record's `hudLayout` and
 * writes through CharacterSession.setResidue (which persists it, debounced).
 * `now`: a one-press change (a drop, a fold) is put at once, so a reload right
 * after it keeps it; a slider's burst keeps the debounce. Display-only by contract.
 * @param {{record: object|null, setResidue(f: string, v: object): boolean, flushResidue?(): Promise<boolean>}} character
 */
export function residueStore(character) {
  return {
    read() { const r = character && character.record; const v = r && r.residue && r.residue.hudLayout; return isObj(v) ? v : null; },
    write(next, now = false) {
      if (!character) return;
      character.setResidue('hudLayout', next);
      if (now && typeof character.flushResidue === 'function') Promise.resolve(character.flushResidue()).catch(() => {});
    },
  };
}

/**
 * @param {object} o
 * @param {object[]} o.widgets             the rows (src/data/hud-widgets.js)
 * @param {() => string} o.sizeClass       'desktop' | 'phone'
 * @param {{read():object|null, write(v:object):void}} o.store
 * @param {(id: string) => boolean} [o.inHunt]  true while hunt widget `id` belongs on screen (a hunt is running;
 *                                         src/shell/shell.js huntUp keeps the hunt bar until its summary is closed)
 */
export function createHud(o) {
  const rows = validateWidgetRows(o.widgets);
  const sizeClass = o.sizeClass;
  const store = o.store;
  const inHunt = o.inHunt || (() => false);
  const listeners = new Set();
  let cls = null;
  let layout = new Map();

  function load() {
    cls = SIZE_CLASSES.includes(sizeClass()) ? sizeClass() : 'desktop';
    const all = store.read();
    const saved = isObj(all) && isObj(all[cls]) ? all[cls] : {};
    layout = new Map();
    for (const row of rows.values()) layout.set(row.id, mergeEntry(row, defaultsFor(row, cls), saved[row.id]));
  }

  function save(now = false) {
    const all = store.read();
    const next = {};
    if (isObj(all)) for (const k of SIZE_CLASSES) if (k !== cls && isObj(all[k])) next[k] = all[k];
    const mine = {};
    for (const row of rows.values()) {
      /* a moved widget's place is kept whole: its offsets mean nothing without its corner (a later default never mixes in) */
      const L = layout.get(row.id);
      const d = Object.assign(isMoved(row.id) ? { anchor: L.anchor, dx: L.dx, dy: L.dy } : {}, diffEntry(L, defaultsFor(row, cls)));
      if (Object.keys(d).length) mine[row.id] = d;
    }
    if (Object.keys(mine).length) next[cls] = mine;
    store.write(next, now);
  }

  function changed(id) { for (const fn of listeners) fn(id); }

  function setVisible(id, on) {
    const row = rows.get(id);
    if (!row || (!row.removable && !on)) return false;
    layout.get(id).visible = !!on;
    save(); changed(id);
    return true;
  }

  /** Moved = off its row's own place for this size class (a drag wrote anchor/dx/dy). */
  function isMoved(id) {
    const row = rows.get(id);
    if (!row) return false;
    const L = layout.get(id), d = defaultsFor(row, cls);
    return L.anchor !== d.anchor || L.dx !== d.dx || L.dy !== d.dy;
  }

  /**
   * A drag's place (placeFrom). `keep` false holds it in memory only, for the frames of the drag; the drop keeps
   * it (one residue put per gesture) and tells the subscribers.
   */
  function setPlace(id, at, keep = true) {
    if (!rows.has(id) || !at || !ANCHOR_RE.test(at.anchor || '') || !Number.isFinite(at.dx) || !Number.isFinite(at.dy)) return false;
    Object.assign(layout.get(id), { anchor: at.anchor, dx: Math.round(at.dx), dy: Math.round(at.dy) });
    if (keep) { save(true); changed(id); }
    return true;
  }

  /** The widget back at its row's own place (its opacity, show and fold are kept). */
  function putBack(id) {
    const row = rows.get(id);
    if (!row) return false;
    const d = defaultsFor(row, cls);
    return setPlace(id, { anchor: d.anchor, dx: d.dx, dy: d.dy });
  }

  /** Folded to its title, or open. */
  function setFolded(id, on) {
    if (!rows.has(id)) return false;
    layout.get(id).folded = !!on;
    save(true); changed(id);
    return true;
  }

  function setOpacity(id, v) {
    if (!rows.has(id) || !Number.isFinite(Number(v))) return false;
    layout.get(id).opacity = clampOpacity(v);
    save(); changed(id);
    return true;
  }

  /** Back to the rows' defaults for THIS size class; the other class is untouched. */
  function reset() {
    const all = store.read();
    const next = {};
    if (isObj(all)) for (const k of SIZE_CLASSES) if (k !== cls && isObj(all[k])) next[k] = all[k];
    store.write(next);
    load(); changed(null);
  }

  load();
  return {
    sizeClass: () => cls,
    reload() { load(); changed(null); },
    layoutOf: (id) => (layout.has(id) ? Object.assign({}, layout.get(id)) : null),
    rows: () => Array.from(rows.values()),
    row: (id) => rows.get(id) || null,
    /** Shown = the player's switch, and the row's `when` (a hunt widget only in a hunt). */
    isShown(id) {
      const row = rows.get(id);
      return !!row && layout.get(id).visible && (row.when === 'always' || inHunt(id));
    },
    setVisible, setOpacity, reset, isMoved, setPlace, putBack, setFolded,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}


/** The `hud` window's body: one line per widget (show, opacity, Put back once it is moved) and Reset layout. */
export function renderHudSettings(ctx) {
  const hud = ctx.hud;
  const line = (row) => {
    const L = hud.layoutOf(row.id);
    const pct = Math.round(L.opacity * 100);
    return '<li class="hs-hudset-row">'
      + '<label class="hs-hudset-show"><input type="checkbox" data-hs-wshow="' + esc(row.id) + '"' + (L.visible ? ' checked' : '') + (row.removable ? '' : ' disabled') + '> '
      + esc(row.label) + (row.when === 'hunt' ? ' <small>in a hunt</small>' : '') + '</label>'
      + '<input type="range" min="40" max="100" step="5" value="' + pct + '" data-hs-wop="' + esc(row.id) + '" aria-label="' + esc(row.label) + ' opacity">'
      + '<span class="hs-hudset-pct">' + pct + '%</span>'
      + (hud.isMoved(row.id) ? '<button type="button" class="hs-quiet hs-hudset-put" data-hs-act="put-back" data-wid="' + esc(row.id) + '" aria-label="Put the ' + esc(row.label) + ' back">Put back</button>' : '')
      + '</li>';
  };
  const move = hud.sizeClass() === 'desktop' ? ' Drag the Hunt analyzer or the Tally by its title to move it.' : '';
  return '<p class="hs-note">Show, hide or fade any part of the screen. Hovering shows it at full strength.' + move + '</p>'
    + '<ul class="hs-hudset">' + hud.rows().map(line).join('') + '</ul>'
    + '<div class="hs-foot"><button type="button" class="hs-quiet" data-hs-wreset>Reset layout</button></div>';
}

/* Put back: one moved widget at its own place again, and this list redrawn without its button. */
renderHudSettings.act = function actHudSettings(ctx, body, action, ev, t) {
  if (action !== 'put-back' || ev.type !== 'click') return;
  if (ctx.hud.putBack(t.getAttribute('data-wid'))) ctx.refresh('hud');
};
