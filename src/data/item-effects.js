// ============================================================
// src/data/item-effects.js — THE EFFECT REGISTRY.
//
// An item may declare `effects: ['<kind>', …]` — a mechanic beyond its stats
// that some engine reads. Every kind an item names must appear below, and must
// be LIVE: an engine in this repo reads it today and a test proves it.
//
// ── WHAT THIS FILE USED TO BE (and why it is short now) ────────────────────
// Until W0 (2026-10-10) it also held ~30 DECLARED-BUT-UNBUILT kinds and a
// PENDING_SYSTEMS table: self-closing "hatches" that let an item sit in the
// catalogue with no source while its engine was a separate workstream. 40
// items lived behind them for two months, none of the engines landed, and the
// Collection Log counted all 40 so it could never be finished. With the
// Early Access wipe ahead, the coherence audit ruled to cut the rows rather
// than build the effects, and the hatches went with them.
//
// THE RULE NOW: an item that needs an engine is authored in the same change as
// its engine. tests/catalogue-coherence.mjs fails on any item that names a kind
// this table does not mark live, and on any item with no source or no use.
//
// PURE ESM. Data only.
// ============================================================

/**
 * kind → { live, owner, note }
 *
 * `live: true` means an engine in this repo actually reads it TODAY, and a
 * test proves it.
 */
export const EFFECT_KINDS = Object.freeze({
  bane: {
    live: true,
    owner: 'systems',
    note: 'Class damage multiplier. src/core/bane.js → equipmentStats().bane → '
        + 'weaknessInfo().damageMult. Read identically by the live tick and by '
        + 'the Edge accrual engine. Clamped by MAX_BANE_MULT.',
  },
});

/** Is every kind on this item known, and are they all live? */
export function effectsAreLive(item) {
  const list = (item && item.effects) || [];
  if (!list.length) return true;
  return list.every((k) => EFFECT_KINDS[k] && EFFECT_KINDS[k].live);
}
