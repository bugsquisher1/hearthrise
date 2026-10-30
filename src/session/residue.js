// ════════════════════════════════════════════════════════════════════════
// src/session/residue.js — THE RESIDUE ALLOWLIST (CLAUDE.md §6).
//
// The residue is the client-only display state a character keeps on the
// server (`client_state`, written by hr_put_client_state). It is an ALLOWLIST:
// a field not named here is never read from an envelope and never sent. Each
// field gates and spends nothing; anything a player would miss after a reload
// that the game acts on is a server column, not residue.
//
// Each field carries its own sanitizer (shape and size only), applied on the
// way IN (envelope) and on the way OUT (put), so a malformed or oversized value
// can never reach a renderer or the server.
// ════════════════════════════════════════════════════════════════════════
import { PANEL_ALPHA } from '../data/panel-alpha.js?v=0.2.70';
import { TOWN_ZOOM } from '../data/world/view-zoom.js?v=0.2.70';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const HUD_LAYOUT = Object.freeze({ classes: 4, widgets: 48, offset: 4096 });   // headroom over the spec's 2 x 8

/** The World shell's widget show/hide, opacity, place (anchor and offsets) and fold per size class (src/shell/hud.js). */
function sanitizeHudLayout(v) {
  const out = {};
  if (!isObj(v)) return out;
  let classes = 0;
  for (const cls of Object.keys(v)) {
    const rows = v[cls];
    if (!/^[a-z]{1,16}$/.test(cls) || !isObj(rows)) continue;
    const kept = {};
    let n = 0;
    for (const id of Object.keys(rows)) {
      const r = rows[id];
      if (!/^[a-z0-9_-]{1,32}$/.test(id) || !isObj(r)) continue;
      const e = {};
      if (typeof r.anchor === 'string' && /^[tmb][lcr]$/.test(r.anchor)) e.anchor = r.anchor;
      for (const k of ['dx', 'dy']) if (Number.isFinite(r[k])) e[k] = Math.max(-HUD_LAYOUT.offset, Math.min(HUD_LAYOUT.offset, Math.round(r[k])));
      if (Number.isFinite(r.opacity)) e.opacity = Math.max(0.4, Math.min(1, r.opacity));
      if (typeof r.visible === 'boolean') e.visible = r.visible;
      if (typeof r.folded === 'boolean') e.folded = r.folded;
      if (!Object.keys(e).length) continue;
      kept[id] = e;
      if (++n >= HUD_LAYOUT.widgets) break;
    }
    out[cls] = kept;
    if (++classes >= HUD_LAYOUT.classes) break;
  }
  return out;
}

const ID = /^[a-z][a-z0-9_]{0,31}$/;

/** The floating-number toggles (src/data/combat-text.js FLOAT_TYPES): {type: {regular, boss}}. */
function sanitizeCombatText(v) {
  const out = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const id of Object.keys(v)) {
    const r = v[id];
    if (!ID.test(id) || !isObj(r)) continue;
    const e = {};
    for (const k of ['regular', 'boss']) if (typeof r[k] === 'boolean') e[k] = r[k];
    if (Object.keys(e).length) out[id] = e;
    if (++n >= 32) break;
  }
  return out;
}

/** The combat log's filters (LOG_TYPES ids switched off) and its hero / party scope. */
function sanitizeCombatLog(v) {
  const out = {};
  if (!isObj(v)) return out;
  if (Array.isArray(v.off)) out.off = v.off.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 32);
  if (v.scope === 'hero' || v.scope === 'party') out.scope = v.scope;
  return out;
}

import { sanitizeSummaries } from './hunt-summaries.js?v=0.2.70';
import { DEPOT_BASE_STACKS, STORAGE_CHESTS } from '../data/homestead-tiers.js?v=0.2.70';

const ITEM_ID = /^[a-z0-9_]{1,64}$/;
export const BAG_SEEN_MAX = 512;
/* The storage's marks hold one row per stack the fullest depot can hold (every chest built), so a full
   depot never loses a mark to the cap (src/shell/storage-model.js would re-add it on every paint). */
export const STORE_SEEN_MAX = STORAGE_CHESTS.reduce((n, c) => n + c.stacks, DEPOT_BASE_STACKS);

/** "Seen" marks: item -> [the count last seen, the order it was first seen in], at most `max`. */
function sanitizeSeen(v, max) {
  const out = {};
  if (!isObj(v)) return out;
  const rows = [];
  for (const id of Object.keys(v)) {
    const r = v[id];
    if (!ITEM_ID.test(id) || !Array.isArray(r) || r.length !== 2) continue;
    const [n, at] = r;
    if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(at) || at < 0) continue;
    rows.push([id, n, at]);
  }
  /* Over the cap, the marks seen longest ago go first. */
  rows.sort((a, b) => b[2] - a[2]);
  for (const [id, n, at] of rows.slice(0, max)) out[id] = [n, at];
  return out;
}
const sanitizeBagSeen = (v) => sanitizeSeen(v, BAG_SEEN_MAX);
const sanitizeStoreSeen = (v) => sanitizeSeen(v, STORE_SEEN_MAX);

/** The bag's remembered view: the category row and the sort (src/shell/bag-model.js ids). */
function sanitizeBagView(v) {
  const out = {};
  if (!isObj(v)) return out;
  if (typeof v.cat === 'string' && ID.test(v.cat)) out.cat = v.cat;
  if (typeof v.sort === 'string' && ID.test(v.sort)) out.sort = v.sort;
  if (v.advanced === true) out.advanced = true;
  return out;
}

/** The Storage window's remembered view: the category row and the sort (the same bag-model.js ids). */
function sanitizeStoreView(v) {
  const out = sanitizeBagView(v);
  delete out.advanced;
  return out;
}

export const ALERTS_SEEN_MAX = 64;
const ALERT_ID = /^[a-z]{1,8}:[A-Za-z0-9_:.-]{1,120}$/;

/** The alerts' display state: the kinds switched off, and the event ids already shown (newest last). */
function sanitizeAlerts(v) {
  const out = {};
  if (!isObj(v)) return out;
  if (Array.isArray(v.off)) out.off = v.off.filter((id) => typeof id === 'string' && ID.test(id)).slice(0, 16);
  if (Array.isArray(v.seen)) out.seen = v.seen.filter((id) => typeof id === 'string' && ALERT_ID.test(id)).slice(-ALERTS_SEEN_MAX);
  return out;
}

/* The away recap's last-seen stamp (src/shell/away-recap.js): copies of server numbers this browser last
   showed during a hunt, kept only to say what changed by the next visit. Display state: nothing reads it to
   gate or spend; a forged stamp can only make that one line wrong for its own player. */
function sanitizeAwaySeen(v) {
  if (!isObj(v) || typeof v.s !== 'string' || !/^[A-Za-z0-9_:.-]{1,64}$/.test(v.s) || !Number.isSafeInteger(v.at) || v.at < 0) return {};
  const out = { s: v.s, at: v.at };
  for (const k of ['xp', 'gold', 'kills']) if (Number.isSafeInteger(v[k]) && v[k] >= 0) out[k] = v[k];
  return out;
}

/* A resizable window's size (src/shell/window-sizes.js): window id -> [width, height] in CSS px. The window
   manager clamps it to the screen again on every read; this bounds only the shape and the count. */
const WIN_SIZE = Object.freeze({ windows: 16, min: 120, max: 4096 });
function sanitizeWinSize(v) {
  const out = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const id of Object.keys(v)) {
    const r = v[id];
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(id) || !Array.isArray(r) || r.length !== 2 || !r.every((x) => Number.isFinite(x))) continue;
    out[id] = r.map((x) => Math.max(WIN_SIZE.min, Math.min(WIN_SIZE.max, Math.round(x))));
    if (++n >= WIN_SIZE.windows) break;
  }
  return out;
}

/* The window opacity (src/shell/panel-alpha.js): a whole percent from the floor to solid, on the setting's steps.
   Anything else is no setting at all (the windows stay solid). */
function sanitizePanelAlpha(v) {
  if (!Number.isFinite(v)) return undefined;
  const { min, max, step } = PANEL_ALPHA;
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
}

/* The coach line's fold (src/shell/launcher.js coachFoldOf): folded or not, and the card id the player last had in
   front of them (a goal id joins its parts, so it may run long); and `read`, the tutorial cards the player pressed
   Got it on or had on screen long enough to read (src/shell/launcher.js markCoachRead; ids, oldest first, bounded).
   Display state like the death popup's seen mark: a read only finishes a card that teaches; it gates and spends nothing. */
export const COACH_READ_MAX = 128;
function sanitizeCoach(v) {
  const out = {};
  if (!isObj(v)) return out;
  if (v.min === true) out.min = true;
  if (typeof v.seen === 'string' && /^[a-z0-9_]{1,256}$/.test(v.seen)) out.seen = v.seen;
  if (Array.isArray(v.read)) {
    const read = Array.from(new Set(v.read.filter((id) => typeof id === 'string' && /^[a-z0-9_]{1,64}$/.test(id)))).slice(-COACH_READ_MAX);
    if (read.length) out.read = read;
  }
  return out;
}

/* The town zoom the viewer picked (src/world/town-zoom.js): one of TOWN_ZOOM.steps, else no pick at all. */
function sanitizeTownZoom(v) {
  return TOWN_ZOOM.steps.includes(v) ? v : undefined;
}

/** field -> sanitizer. The keys ARE the allowlist. */
const SANITIZERS = Object.freeze({
  hudLayout: sanitizeHudLayout,     // display preference: the HUD layout (show, fade, place, fold); gates and spends nothing
  combatText: sanitizeCombatText,   // display preference: which floating numbers show; gates and spends nothing
  combatLog: sanitizeCombatLog,     // display preference: the combat log's filters; gates and spends nothing
  bagSeen: sanitizeBagSeen,         // display state: which bag stacks carry the "new" mark; gates and spends nothing
  bagView: sanitizeBagView,         // display preference: the Inventory's category, sort and Advanced view; gates and spends nothing
  storeView: sanitizeStoreView,     // display preference: the Storage window's category and sort; gates and spends nothing
  storeSeen: sanitizeStoreSeen,     // display state: when each storage stack was last added to, for the Newest sort; gates and spends nothing
  alerts: sanitizeAlerts,           // display state: which alert kinds show and which events were shown; gates and spends nothing
  huntSummaries: sanitizeSummaries, // display state: the last few hunts' summary cards (src/hunt-view/summary-model.js); gates and spends nothing
  awaySeen: sanitizeAwaySeen,       // display state: the away recap's last-seen stamp (src/shell/away-recap.js); gates and spends nothing
  winSize: sanitizeWinSize,         // display preference: a resizable window's size (src/shell/window-sizes.js); gates and spends nothing
  panelAlpha: sanitizePanelAlpha,   // display preference: the window opacity, a percent (src/shell/panel-alpha.js); gates and spends nothing
  coach: sanitizeCoach,             // display state: the coach line folded to its title and the cards read (src/shell/launcher.js); gates and spends nothing
  townZoom: sanitizeTownZoom,       // display preference: the town view's zoom (src/world/town-zoom.js); gates and spends nothing
});

export const RESIDUE_FIELDS = Object.freeze(Object.keys(SANITIZERS));

/** One field, bounded; undefined for a field that is not on the allowlist. */
export function sanitizeResidueField(field, v) {
  const fn = Object.prototype.hasOwnProperty.call(SANITIZERS, field) ? SANITIZERS[field] : null;
  return fn ? fn(v) : undefined;
}

/** The allowlisted, sanitized projection of a `client_state` bag (a fresh object; never the input). */
export function residueOf(bag) {
  const out = {};
  if (!isObj(bag)) return out;
  for (const f of RESIDUE_FIELDS) if (Object.prototype.hasOwnProperty.call(bag, f)) out[f] = sanitizeResidueField(f, bag[f]);
  return out;
}

/**
 * The residue fields PUT but not yet seen back: `sent` (sanitizeResidueField values) minus every field
 * the record's `residue` (residueOf: the same sanitizers, so the same key order whatever order the
 * server's jsonb sent) now holds equal. Until a field is seen back, an envelope without it may predate
 * the put (a re-read that crossed the put in flight), so the client keeps showing what it sent (HS-25:
 * a premium hunt's summary card blinked out on such a re-read). A fresh object.
 */
export function unconfirmedResidue(sent, residue) {
  const out = {};
  for (const [f, v] of Object.entries(isObj(sent) ? sent : {})) {
    const back = isObj(residue) && Object.prototype.hasOwnProperty.call(residue, f) ? residue[f] : undefined;
    if (back === undefined || JSON.stringify(back) !== JSON.stringify(v)) out[f] = v;
  }
  return out;
}
