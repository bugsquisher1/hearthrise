// ============================================================
// src/core/drops.js — ONE definition of what a drop's chance means, and
// one seeded walk of a monster's drop table.
//
// Wave 4 moved "rare = 0.05" out of three copy-pasted literals; this
// moves it out of legacy.js entirely so the Edge Function that pays an
// offline kill uses the same bands the client's loot preview draws.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { LOOT_BANDS, REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.139';

export const DROP_BAND_MAX = { rare: 0.05, uncommon: 0.15, common: 1.0 };

export function dropBand(ch) {
  if (ch >= 1) return 'always';
  if (ch <= DROP_BAND_MAX.rare) return 'rare';
  if (ch <= DROP_BAND_MAX.uncommon) return 'uncommon';
  return 'common';
}

/**
 * A row's band: its own (`band`, src/data/loot-bands.js), which every walked ground's row names; an
 * unbanded row (the old roster's lucky and salvage finds, the tutorial's seeded fixtures) reads its odds.
 */
export function bandOf(row) {
  if (row && LOOT_BANDS.includes(row.band)) return row.band;
  return dropBand(row ? row.ch : 0);
}

/**
 * The effective chance of one drop row after every multiplier.
 * Guaranteed drops (ch >= 1) are deliberately untouched — a 100% drop
 * cannot be made "more than certain", and letting a buff scale it would
 * silently turn a guarantee into a multi-roll.
 *
 * @param row     { id, ch }
 * @param mods    { dropMult, dropBuff, featuredMult }
 */
export function effectiveDropChance(row, mods) {
  const m = mods || {};
  if (row.ch >= 1) return Math.min(1, row.ch);
  const dropMult = m.dropMult == null ? 1 : m.dropMult;
  const dropBuff = m.dropBuff || 0;
  const featured = m.featuredMult == null ? 1 : m.featuredMult;
  return Math.min(0.95, row.ch * dropMult * (1 + dropBuff) * featured);
}

/**
 * Walk a drop table with an injected RNG. Returns what dropped plus the
 * narrative events the caller should surface — the client turns these
 * into combat-log lines and toasts, the server puts them in the intent
 * envelope's `events[]` (design §2). Core never notifies anything.
 *
 * @returns { dropped: {id:qty}, events: [{type:'drop', id, band, rare}] }
 */
export function rollDropTable(drops, mods, rng) {
  const dropped = {};
  const events = [];
  if (!Array.isArray(drops)) return { dropped, events };
  for (const d of drops) {
    const chance = effectiveDropChance(d, mods);
    if (!rng.chance(chance)) continue;
    dropped[d.id] = (dropped[d.id] || 0) + 1;
    /* Only a Rare or Trophy row earns the "Rare drop" moment and the party's rare roll (REVEAL_BANDS);
       a Scarce piece is a standard drop at any odds. */
    const band = bandOf(d);
    events.push({ type: 'drop', id: d.id, band, rare: REVEAL_BANDS.includes(band) });
  }
  return { dropped, events };
}

/** A prize table's whole roll: the sum of its rows' slices (src/data/boss-halls.js: at most 1; the generator refuses more). */
export function prizeChance(rows) {
  let sum = 0;
  for (const d of Array.isArray(rows) ? rows : []) sum += Math.max(0, Number(d && d.ch) || 0);
  return sum;
}

/**
 * What each prize row is worth on ONE roll, in the rows' order: [{ id, ch }] (a wiki formula; the hall page shows these numbers).
 *   an everyday roll:        ch = the row's own slice
 *   a hero's FIRST roll:     a row marked `first` takes its slice plus its share of the roll's empty part,
 *                            ch = slice + (1 - sum of every slice) x slice / (sum of the `first` rows' slices),
 *                            so a piece always lands; a row not marked keeps its own slice (a unique piece's odds never move).
 * A table with no `first` row rolls its first roll like any other.
 */
export function prizeSlices(rows, first) {
  const list = (Array.isArray(rows) ? rows : []).map((d) => ({ id: d && d.id, ch: Math.max(0, Number(d && d.ch) || 0), sure: !!d && d.first === true }));
  const sum = list.reduce((s, d) => s + d.ch, 0), sure = list.reduce((s, d) => s + (d.sure ? d.ch : 0), 0);
  const empty = first === true && sure > 0 ? Math.max(0, 1 - sum) : 0;
  return list.map((d) => ({ id: d.id, ch: d.sure && empty ? d.ch + (empty * d.ch) / sure : d.ch }));
}

/**
 * A KEYED HALL'S DAILY PRIZE (src/data/boss-halls.js): ONE roll over the boss's rows. Each row's `ch` is its SLICE of that one roll, so
 * the rows are exclusive (a hero takes one piece or none) and no multiplier moves them: what a row says is what a hero's roll is.
 * `first`: this is the hero's first roll on the boss, ever (the server's word): the sure roll (prizeSlices), the last `first` row taking
 * whatever a rounding leaves. ALWAYS ONE DRAW, whatever lands, so the seeded stream after it never depends on the table.
 *
 * @returns the row's event { type: 'drop', id, band, rare }, or null when the roll lands past the last slice
 */
export function rollPrize(rows, rng, first) {
  const u = rng.next();
  const list = Array.isArray(rows) ? rows : [];
  const slices = prizeSlices(list, first);
  const hit = (d) => { const band = bandOf(d); return { type: 'drop', id: d.id, band, rare: REVEAL_BANDS.includes(band) }; };
  let edge = 0;
  for (let i = 0; i < list.length; i++) {
    edge += slices[i].ch;
    if (u < edge) return hit(list[i]);
  }
  /* a sure roll never lands nothing: a draw past the last edge (float dust under 1) is the last `first` row's */
  if (first === true) for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].first === true) return hit(list[i]);
  return null;
}
