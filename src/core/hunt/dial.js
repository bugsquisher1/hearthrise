// ════════════════════════════════════════════════════════════════════════
// src/core/hunt/dial.js — THE ONE DIAL A SWING READS: a monster row as it fights on the instance's dial.
//
// The Danger scale's step is the only dial (src/core/hunt/danger.js dangerDial, Tyler 2026-11-22; 12-targets 8.4 item 4: the old tier
// rows, Normal / Dangerous / Deadly, and the scaled hunts left for the scale on lane/retire-tier-chain, 2026-11-26). Every engine reader
// of a monster's blow, health, aim, Level and kill XP takes it through the two calls below, so the engine never learns where a number
// came from. The dial rides the instance as `inst.tier` and the rewards' context as `ctx.tier` (the slot keeps the name the tier rows
// first filled; mutant anchors across the hunt-core guards read those lines byte for byte). No dial (null: a yard, a room, the Tower, a
// ground off the scale) is the row as written, digit for digit.
//
// A DIAL is any object carrying DIALS (permille of the monster row), and optionally `aimPm` / `lvPm`, which split the blow from its aim
// and its Level (dangerDial: a step's growth is its ratio once, on the blow, never again through the to-hit or the armor chain).
// PURE ESM, dual-runtime.
// ════════════════════════════════════════════════════════════════════════

/** The dials a monster row is read through (permille of the row). */
export const DIALS = Object.freeze(['dmgPm', 'hpPm', 'xpPm']);

/* THE DIAL READER: one dial's permille of one stat, 1000 (the row as written) when the dial is absent or silent on it. */
const pmOf = (dial, k) => (dial && Number.isFinite(dial[k]) ? dial[k] : 1000);
/* the aim's and the Level's own permille when the dial names them, else the blow's */
const splitPm = (dial, k) => (dial && Number.isFinite(dial[k]) ? dial[k] : pmOf(dial, 'dmgPm'));

/** A monster row's Level on a dial: the armor's read and Defense's training. */
export const levelAtTier = (level, dial) => { const pm = splitPm(dial, 'lvPm'); return pm !== 1000 ? Math.round((level * pm) / 1000) : level; };

/** A monster row as it fights on a dial: its blow, its aim, its HP and its kill's Level XP. The row itself when every dial reads 1000,
    so no dial is the row digit for digit. Coin and drops are always the row's: the rewards read the dial's coinPm and dropPm themselves. */
export function atTier(row, dial) {
  const dmg = pmOf(dial, 'dmgPm'), hp = pmOf(dial, 'hpPm'), xp = pmOf(dial, 'xpPm'), aim = splitPm(dial, 'aimPm');
  if (!row || (dmg === 1000 && hp === 1000 && xp === 1000 && aim === 1000)) return row;
  /* a harder blow is a surer one unless the dial names the aim's own permille (splitPm) */
  return { ...row, atk: ((row.atk || 1) * dmg) / 1000, ...(Number.isFinite(row.aim) ? { aim: (row.aim * aim) / 1000 } : {}),
    hp: hp === 1000 ? row.hp : Math.max(1, Math.round(((row.hp || 1) * hp) / 1000)), xp: ((row.xp || 0) * xp) / 1000 };
}
