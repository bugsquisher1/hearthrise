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

export const DROP_BAND_MAX = { rare: 0.05, uncommon: 0.15, common: 1.0 };

export function dropBand(ch) {
  if (ch >= 1) return 'always';
  if (ch <= DROP_BAND_MAX.rare) return 'rare';
  if (ch <= DROP_BAND_MAX.uncommon) return 'uncommon';
  return 'common';
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
  if (row.ch >= 1) return row.ch;
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
    const band = dropBand(d.ch);
    events.push({ type: 'drop', id: d.id, band, rare: band === 'rare' });
  }
  return { dropped, events };
}
