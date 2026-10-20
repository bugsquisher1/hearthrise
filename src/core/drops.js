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

import { RELIC_TIER, MAX_RELIC_MULT } from '../data/bestiary-stages.js?v=0.2.12';

export const DROP_BAND_MAX = { rare: 0.05, uncommon: 0.15, common: 1.0 };

export function dropBand(ch) {
  if (ch >= 1) return 'always';
  if (ch <= DROP_BAND_MAX.rare) return 'rare';
  if (ch <= DROP_BAND_MAX.uncommon) return 'uncommon';
  return 'common';
}

/* Below this a percentage stops meaning anything ('0.0%' for a .0004 lucky
   row), so the odds read as '1 in N' instead. */
export const ODDS_ONE_IN_BELOW = 0.001;

/**
 * THE ONE ODDS FORMATTER for a non-guaranteed chance (0 < ch < 1): '12%',
 * '0.8%', or '1 in 1,087' under ODDS_ONE_IN_BELOW. Every drop-table surface
 * (fight screen, Boss of the Day card, monster panel) prints through this, so
 * no two screens can state one row two ways. Callers render ch >= 1 themselves.
 */
export function formatDropOdds(ch) {
  const c = Number(ch) || 0;
  if (c > 0 && c < ODDS_ONE_IN_BELOW) return `1 in ${Math.round(1 / c).toLocaleString('en-US')}`;
  const p = c * 100;
  return `${p >= 1 ? Math.round(p) : p.toFixed(1)}%`;
}

/**
 * The effective chance of one drop row after every multiplier.
 * Guaranteed drops (ch >= 1) are deliberately untouched — a 100% drop
 * cannot be made "more than certain", and letting a buff scale it would
 * silently turn a guarantee into a multi-roll.
 *
 * @param row     { id, ch, tier? }
 * @param mods    { dropMult, dropBuff, featuredMult, yieldMult, relicMult }
 *
 * relicMult: the account bestiary's activated stage for the killed monster
 * (src/data/bestiary-stages.js), handed in by the member the server assembled
 * from its own projection. It multiplies ONLY a row marked `tier: 'relic'`,
 * before the 0.95 cap; anything that is not a number >= 1 counts as 1 and it
 * never exceeds the top stage's MAX_RELIC_MULT.
 */
export function effectiveDropChance(row, mods) {
  const m = mods || {};
  /* yieldMult: the kill's yield share (a party-scaled monster pays its HP share of every chance, a sure drop included). */
  const y = m.yieldMult == null ? 1 : m.yieldMult;
  if (row.ch >= 1) return Math.min(1, row.ch * y);
  const dropMult = m.dropMult == null ? 1 : m.dropMult;
  const dropBuff = m.dropBuff || 0;
  const featured = m.featuredMult == null ? 1 : m.featuredMult;
  const relic = row.tier === RELIC_TIER ? relicMultOf(m.relicMult) : 1;
  return Math.min(0.95, row.ch * dropMult * (1 + dropBuff) * featured * y * relic);
}

/* A relic multiplier as the engine honours it: 1..MAX_RELIC_MULT, else 1. */
function relicMultOf(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_RELIC_MULT) : 1;
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
    const band = dropBand(d.ch);
    events.push({ type: 'drop', id: d.id, band, rare: band === 'rare' });
  }
  return { dropped, events };
}
