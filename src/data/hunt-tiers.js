// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tiers.js — THREE WAYS TO HUNT A GROUND (Tyler 2026-11-05: one choice per ground, the tier sets the pull, no dial; lane/c-difficulty-tiers).
//
// One ground, picked per hero and per ground, the party leader's in a party: Normal is the ground as it stands;
// Dangerous and Deadly hit harder, may bring more monsters at once, and pay slightly more Level XP. Coin and drops stay
// the row's (Tyler: "Same amount of gold drops, so profit is less likely if they are under level"), rates per kill untouched.
//
// ROW SHAPE { id, pull, powerPm, xpPm }, one per ground and tier: every number is that ground's, for the ladder rule below.
//   pull     monsters a pull, one entry per party size 1..4: the instance's frozen density (hr_hunt_density_freeze). 0 = the ground
//            as it stands (as built alone, its row's partyPull in a party). A plain column: each cell is that tier's whole answer to how many come.
//   powerPm  a monster's atk and its Level, permille of its row. Atk is its accuracy and its blow (combat.js); its Level
//            is what armor reads (mitigation.js) and what a blow trains Defense by (hunt-rewards.js).
//   xpPm     Level XP a kill pays, permille of its row. Nothing else a kill pays moves.
//
// THE LADDER RULE (tests/hunt-core/hunt-tiers.mjs ladder, the board's "Difficulty tiers"): a ground's top tier never beats the next
// ground's Normal on XP at the Level that fits it, or nobody moves on. Normal doesn't move, so a low ground's room is the
// gap between two Normals: where it's small, the row hits harder and brings no more monsters.
// No rule here reads a hero's Level (Tyler 2026-11-04: "They are just simply harder"): stats against stats, the player's pick.
// A ground not listed is Normal only: the Cellar, the first ground (Coordinator 2026-11-05: a choice adds nothing to the first minutes).
// Rows stay unfrozen so tools/balance-sim's what-ifs can move them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const tier = (id, pull, powerPm, xpPm) => ({ id, pull, powerPm, xpPm });
const NORMAL = Object.freeze(tier('normal', Object.freeze([0, 0, 0, 0]), 1000, 1000));

export const GROUND_TIERS = {
  /* No more monsters: the Thicket's Normal sits about 15% under Wickstead's, so its room is the stats. A pull of 3 at no extra XP already beats it for AoE. */
  meadowbrook_thicket: { dangerous: tier('dangerous', [0, 0, 0, 0], 1500, 1050), deadly: tier('deadly', [0, 0, 0, 0], 3000, 1080) },
  /* A lone hero stops at 5: a full box beats the Glade for a hammer even at no extra XP. A party keeps it, under by a fifth. */
  wickstead: { dangerous: tier('dangerous', [3, 4, 4, 5], 1500, 1050), deadly: tier('deadly', [5, 8, 8, 8], 2000, 1100) },
  /* A lone hero keeps the ground as it stands: a pull of 4 beats the Glade for a hammer. A party keeps the full box. */
  millrace_sewer: { dangerous: tier('dangerous', [0, 5, 5, 6], 1200, 1050), deadly: tier('deadly', [0, 8, 8, 8], 1750, 1100) },
  mosslight_glade: { dangerous: tier('dangerous', [4, 5, 5, 6], 1200, 1100), deadly: tier('deadly', [8, 8, 8, 8], 1500, 1200) },
  coppercap_warrens: { dangerous: tier('dangerous', [4, 5, 5, 6], 1200, 1100), deadly: tier('deadly', [8, 8, 8, 8], 1500, 1200) },
};
export const TIER_IDS = Object.freeze(['normal', 'dangerous', 'deadly']);
export const DEFAULT_TIER = 'normal';
/* The word a player reads, on the picker and the hunt's top bar. */
export const TIER_NAME = Object.freeze({ normal: 'Normal', dangerous: 'Dangerous', deadly: 'Deadly' });

/** The tier ids a ground offers, easiest first. */
export const tiersOf = (groundId) => TIER_IDS.filter((id) => id === DEFAULT_TIER || !!(GROUND_TIERS[groundId] && GROUND_TIERS[groundId][id]));

/** The row a pick plays on a ground: Normal for anything the ground doesn't offer. */
export function tierRowOf(groundId, id) {
  const rows = Object.prototype.hasOwnProperty.call(GROUND_TIERS, groundId) ? GROUND_TIERS[groundId] : null;
  return (rows && Object.prototype.hasOwnProperty.call(rows, id) && rows[id]) || NORMAL;
}

/** The pull a tier brings for a group of `size` (0 = the ground as it stands). */
export const pullOfTier = (row, size) => row.pull[Math.min(row.pull.length, Math.max(1, Math.floor(Number(size) || 1))) - 1];

/** A tier row's level of a monster row's level: the armor's read and Defense's training. */
export const levelAtTier = (level, row) => (row && row.powerPm !== 1000 ? Math.round((level * row.powerPm) / 1000) : level);

/** A monster row as it fights on a tier: its blow and its kill's Level XP. The row itself on Normal, so Normal is the row digit for digit. Coin and drops are always the row's. */
export function atTier(row, tierRow) {
  if (!row || !tierRow || (tierRow.powerPm === 1000 && tierRow.xpPm === 1000)) return row;
  return { ...row, atk: ((row.atk || 1) * tierRow.powerPm) / 1000, xp: ((row.xp || 0) * tierRow.xpPm) / 1000 };
}
