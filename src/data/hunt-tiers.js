// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-tiers.js — THREE WAYS TO HUNT A GROUND (Tyler 2026-11-04, lane/c-difficulty-tiers).
//
// One ground, picked per hero and per ground, the party leader's in a party: Normal is the ground as it stands;
// Dangerous and Deadly bring more monsters at once, hit harder and pay slightly more Level XP. Coin and drops stay the
// row's (Tyler: "Same amount of gold drops, so profit is less likely if they are under level"), rates per kill untouched.
//
// ROW SHAPE { id, pull, powerPm, xpPm }
//   pull     monsters a pull, one entry per party size 1..4: the instance's frozen density (hr_hunt_density_freeze). 0 = the ground
//            as it stands (as built alone, its row's partyPull in a party). A tier's pull is fixed: there is no other dial.
//   powerPm  a monster's atk and its Level, permille of its row. Atk is its accuracy and its blow (combat.js); its Level
//            is what armor reads (mitigation.js) and what a blow trains Defense by (hunt-rewards.js).
//   xpPm     Level XP a kill pays, permille of its row. Nothing else a kill pays moves.
//
// No rule here reads a hero's Level (Tyler 2026-11-04: "They are just simply harder"): stats against stats, the player's pick.
// A ground holds Normal only until it is on TIERED_GROUNDS. Rows and that list stay unfrozen so tools/balance-sim's what-ifs can move them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const HUNT_TIERS = {
  normal: { id: 'normal', pull: [0, 0, 0, 0], powerPm: 1000, xpPm: 1000 },
  dangerous: { id: 'dangerous', pull: [4, 5, 5, 6], powerPm: 1200, xpPm: 1100 },
  deadly: { id: 'deadly', pull: [8, 8, 8, 8], powerPm: 1500, xpPm: 1200 },
};
export const TIER_IDS = Object.freeze(Object.keys(HUNT_TIERS));
export const DEFAULT_TIER = 'normal';
/* The word a player reads, on the picker and the hunt's top bar. */
export const TIER_NAME = Object.freeze({ normal: 'Normal', dangerous: 'Dangerous', deadly: 'Deadly' });

/* THE SAMPLE (CLAUDE.md §10): the grounds whose harder tiers are played and reviewed. A ground not listed is Normal only. */
export const TIERED_GROUNDS = ['mosslight_glade', 'coppercap_warrens'];

/** The tier ids a ground offers, easiest first. */
export const tiersOf = (groundId) => (TIERED_GROUNDS.includes(groundId) ? TIER_IDS : [DEFAULT_TIER]);

/** The row a pick plays on a ground: Normal for anything the ground doesn't offer. */
export function tierRowOf(groundId, id) {
  return tiersOf(groundId).includes(id) ? HUNT_TIERS[id] : HUNT_TIERS[DEFAULT_TIER];
}

/** The pull a tier brings for a group of `size` (0 = the ground as it stands). */
export const pullOfTier = (tier, size) => tier.pull[Math.min(tier.pull.length, Math.max(1, Math.floor(Number(size) || 1))) - 1];

/** A tier row's level of a monster row's level: the armor's read and Defense's training. */
export const levelAtTier = (level, tier) => (tier && tier.powerPm !== 1000 ? Math.round((level * tier.powerPm) / 1000) : level);

/** A monster row as it fights on a tier: its blow and its kill's Level XP. The row itself on Normal, so Normal is the row digit for digit. Coin and drops are always the row's. */
export function atTier(row, tier) {
  if (!row || !tier || (tier.powerPm === 1000 && tier.xpPm === 1000)) return row;
  return { ...row, atk: ((row.atk || 1) * tier.powerPm) / 1000, xp: ((row.xp || 0) * tier.xpPm) / 1000 };
}
