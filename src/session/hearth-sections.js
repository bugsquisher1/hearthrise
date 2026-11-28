// ════════════════════════════════════════════════════════════════════════
// src/session/hearth-sections.js — THE GREAT HEARTH'S FUEL RUN, AS THE SERVER'S POINTER SAYS IT (09-crafting 4.17, the bridge).
//
// The bench is gone (09 4.17, lane/bench-cut-client): a hero's town work is a job (src/session/trade-sections.js), and the one artisan
// pointer left is a run of fuel into the Great Hearth (`fuel_<item>`, src/data/recipes.js ARTISAN_RECIPES.inner_flame) until the
// company flame lights (4.13 row 3). This file reads that pointer and nothing else:
//   fuelRowOf(id)          a fuel row by its recipe id ({ id, item, need, ms, req, xp }), or null (no bench row is ever one)
//   fuelRunOf(cs)          the fuel row the server says this hero is burning now, with no hunt open, or null
//   fuelEachMs(row)        one fuel's time at the shared pace with no perk (a perk only makes it shorter)
//   fuelSpentAtMs(cs)      the server-clock ms by which the run has certainly burned what the server's bag and Storage hold, or null
//   fuelRunOver(r, nowMs)  has the run a roster read names already burned out? (a closed page's run is settled only when the hero opens)
// Display and timing only: the server spends the fuel, pays the XP and stops the run. Every envelope replaces what this reads.
// ════════════════════════════════════════════════════════════════════════
import { ARTISAN_RECIPES } from '../data/recipes.js';
import { actionIntervalMs } from '../core/pacing.js';
import { heldOf } from './item-sections.js';
import { townWorkRunning } from './town-poll.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/* The Hearth's skill: every fuel row is an output-less row of it (src/data/hearth.js). */
const FLAME = 'inner_flame';

/* recipe id -> its fuel row, built once from the catalogue rows, so a new fuel needs no code */
const FUELS = new Map();
for (const r of ARTISAN_RECIPES[FLAME] || []) {
  if (!r || r.output || typeof r.input !== 'string' || typeof r.id !== 'string') continue;
  FUELS.set(r.id, Object.freeze({ id: r.id, item: r.input, need: Math.max(1, Number(r.inputQty) || 1), ms: Number(r.ms) || 0, req: Math.max(1, Number(r.req) || 1), xp: Number(r.xp) || 0 }));
}

/** A fuel row by its recipe id, or null. */
export function fuelRowOf(id) { return (typeof id === 'string' && FUELS.get(id)) || null; }

const stateOf = (cs) => (cs && typeof cs.read === 'function' ? cs.read('state') : null);

/** The fuel row the server says this hero is burning now (an artisan pointer on a fuel row, no hunt open), or null. */
export function fuelRunOf(cs) {
  const st = stateOf(cs);
  if (!isObj(st) || st.active_kind !== 'artisan' || !townWorkRunning(st, cs.read('hunt'))) return null;
  return fuelRowOf(st.active_id);
}

/** One fuel's time in ms at the shared pace, no perk counted (perks only make it shorter, so a reader errs towards "still burning"). */
export const fuelEachMs = (row) => actionIntervalMs(FLAME, row.ms || 3000, {});

/* How many fuels the server's bag and Storage still cover for this row. */
const coverOf = (cs, row) => Math.floor(((heldOf(cs) || {})[row.item] || 0) / row.need);

/**
 * The SERVER-clock ms by which the run the server holds has certainly burned what its bag and Storage hold, so the engine stops it on the
 * next settle; null for anything else (no run, a hunt open, no watermark). From the server's own record only: its watermark and its bag.
 * Report #68: an unwatched run nobody settled kept saying "Fueling" with its fuel spent (town-poll.js settleSpentBench).
 */
export function fuelSpentAtMs(cs) {
  const row = fuelRunOf(cs);
  const st = stateOf(cs);
  const from = row && isObj(st) ? Date.parse(st.accrued_to) : NaN;
  if (!row || !Number.isFinite(from)) return null;
  return from + coverOf(cs, row) * fuelEachMs(row) + 2000;
}

/**
 * HAS THE RUN A ROSTER READ NAMES BURNED OUT? A closed page's run is settled only when the hero next opens, so a roster read still says
 * "artisan" for a run long done (crafter's panel 2026-11-01). True once the time since the server's watermark covers every fuel the read's
 * bag and Storage still hold. `r`: anything with read(section). `nowMs`: the server's clock. Display only; nothing gates on it.
 */
export function fuelRunOver(r, nowMs) {
  const st = stateOf(r);
  const row = isObj(st) && st.active_kind === 'artisan' ? fuelRowOf(st.active_id) : null;
  const since = isObj(st) ? Date.parse(st.accrued_to) : NaN;
  if (!row || !Number.isFinite(since) || !Number.isFinite(nowMs)) return false;
  return nowMs - since >= coverOf(r, row) * fuelEachMs(row);
}
