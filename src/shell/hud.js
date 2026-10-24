// ════════════════════════════════════════════════════════════════════════
// src/shell/hud.js — THE HUD WIDGET CONTRACT: DEFAULTS, LAYOUT, PLACEMENT.
//
// docs/design/WORLD_SHELL.md §2. Every widget is a row in src/data/hud-widgets.js;
// this module turns the rows plus the player's saved layout into "is it shown,
// how faded, where does it sit". v1 is show/hide, per-widget opacity and Reset
// layout; anchor/dx/dy are read and honoured but nothing here moves them (drag is
// v1.1, and it will write the same three fields).
//
// THE LAYOUT IS A DISPLAY PREFERENCE. It is stored per size class in the residue
// field `hudLayout` ({desktop:{id:{...}}, phone:{...}}; src/session/residue.js),
// so a phone layout never breaks the desktop one. Nothing may gate an action or
// spend anything on it: tests/hud-layout-display-only.mjs confines every read
// of the name to this file and the residue store.
//
// PURE except for `residueStore`, the adapter onto one character's residue.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.39';

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
 */
export function stackBelow(r, above, gap) {
  let top = r.top;
  for (let moved = true; moved;) {
    moved = false;
    for (const q of above) {
      if (!(q.width > 0 && q.height > 0)) continue;
      const across = r.left < q.left + q.width && r.left + r.width > q.left;
      if (across && top < q.top + q.height + gap && top + r.height > q.top) { top = Math.round(q.top + q.height + gap); moved = true; }
    }
  }
  return top;
}

/** The row's own layout for a size class: the desktop fields, then the phone block. */
export function defaultsFor(row, sizeClass) {
  const d = { anchor: row.anchor, dx: row.dx, dy: row.dy, opacity: row.opacity, visible: row.visible };
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
 * left beside the dock pins to the left edge).
 */
export function placeWidget(L, box, size) {
  const v = L.anchor[0], h = L.anchor[1];
  const x = h === 'l' ? L.dx : h === 'r' ? box.width - size.width - L.dx : (box.width - size.width) / 2 + L.dx;
  const y = v === 't' ? L.dy : v === 'b' ? box.height - size.height - L.dy : (box.height - size.height) / 2 + L.dy;
  return { left: Math.round(Math.max(0, Math.min(x, box.width - size.width))), top: Math.round(y) };
}

/**
 * WIDGETS NEVER OVERLAP (Tyler 10-19: at 1440x900 with a window docked the hunt bar ran under the
 * analyzer). A centred widget `r` takes the left closest to where it was that clears every
 * edge-anchored widget in its row by `gap`; when no left clears them all (the row is too narrow),
 * it takes the one that hits the fewest (nearest wins a tie) and those it still hits step down
 * below it. Rects are {left, top, width, height} in the box's px. Pure.
 * `fixed` are rects it must also clear but never pushes (the docked windows, r11).
 * @returns {{left: number, push: {i: number, top: number}[]}}  `i` indexes `edges`
 */
export function clearOfEdges(r, edges, boxWidth, gap, fixed = []) {
  const row = edges.concat(fixed).map((q, i) => ({ q, i })).filter(({ q }) => q.top < r.top + r.height && q.top + q.height > r.top);
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
 * Display-only by contract.
 * @param {{record: object|null, setResidue(f: string, v: object): boolean}} character
 */
export function residueStore(character) {
  return {
    read() { const r = character && character.record; const v = r && r.residue && r.residue.hudLayout; return isObj(v) ? v : null; },
    write(next) { if (character) character.setResidue('hudLayout', next); },
  };
}

/**
 * @param {object} o
 * @param {object[]} o.widgets             the rows (src/data/hud-widgets.js)
 * @param {() => string} o.sizeClass       'desktop' | 'phone'
 * @param {{read():object|null, write(v:object):void}} o.store
 * @param {() => boolean} [o.inHunt]       true while a hunt is running ('hunt' widgets)
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

  function save() {
    const all = store.read();
    const next = {};
    if (isObj(all)) for (const k of SIZE_CLASSES) if (k !== cls && isObj(all[k])) next[k] = all[k];
    const mine = {};
    for (const row of rows.values()) {
      const d = diffEntry(layout.get(row.id), defaultsFor(row, cls));
      if (Object.keys(d).length) mine[row.id] = d;
    }
    if (Object.keys(mine).length) next[cls] = mine;
    store.write(next);
  }

  function changed(id) { for (const fn of listeners) fn(id); }

  function setVisible(id, on) {
    const row = rows.get(id);
    if (!row || (!row.removable && !on)) return false;
    layout.get(id).visible = !!on;
    save(); changed(id);
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
      return !!row && layout.get(id).visible && (row.when === 'always' || inHunt());
    },
    setVisible, setOpacity, reset,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}


/** The `hud` window's body: one line per widget (show, opacity) and Reset layout. */
export function renderHudSettings(ctx) {
  const hud = ctx.hud;
  const line = (row) => {
    const L = hud.layoutOf(row.id);
    const pct = Math.round(L.opacity * 100);
    return '<li class="hs-hudset-row">'
      + '<label class="hs-hudset-show"><input type="checkbox" data-hs-wshow="' + esc(row.id) + '"' + (L.visible ? ' checked' : '') + (row.removable ? '' : ' disabled') + '> '
      + esc(row.label) + (row.when === 'hunt' ? ' <small>in a hunt</small>' : '') + '</label>'
      + '<input type="range" min="40" max="100" step="5" value="' + pct + '" data-hs-wop="' + esc(row.id) + '" aria-label="' + esc(row.label) + ' opacity">'
      + '<span class="hs-hudset-pct">' + pct + '%</span></li>';
  };
  return '<p class="hs-note">Show, hide or fade any part of the screen. Hovering shows it at full strength.</p>'
    + '<ul class="hs-hudset">' + hud.rows().map(line).join('') + '</ul>'
    + '<div class="hs-foot"><button type="button" class="hs-quiet" data-hs-wreset>Reset layout</button></div>';
}
