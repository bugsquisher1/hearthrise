// ════════════════════════════════════════════════════════════════════════
// tools/balance-sim/tier-axis.mjs — THE BALANCE PROGRAM'S TIER AXIS, NOW ONE VALUE (lane/retire-tier-chain, 2026-11-26).
//
// The game's tier rows (Normal / Dangerous / Deadly, src/data/hunt-tiers.js and balance-sheet.js TIER_DIALS) retired for the Danger scale
// (12-targets 8.4 item 4): every ground plays its step, and off the scale a ground plays its rows as built. The program's grids, plans,
// atlas rates and readers were built with a tier column; this module answers that column the way the game now does, in one place, so no
// program file keeps a copy of the retired rows: every ground offers Normal alone, and Normal brings no pull of its own.
// THE DEBT IS NAMED: the program's matrix measures the old off-scale game. Its tier column retires with the matrix's rebuild on the Danger
// scale (the designer's, HANDOFFS 2026-11-26 lane/retire-tier-chain); until then every tier cell it builds is a Normal cell.
// ════════════════════════════════════════════════════════════════════════

/** The tiers the program's grids iterate: Normal alone. */
export const TIER_IDS = Object.freeze(['normal']);
export const DEFAULT_TIER = 'normal';
/** The tiers a ground offers: Normal, on every ground. */
export const tiersOf = () => TIER_IDS;
/* Normal is the ground as it stands: no pull of its own, every dial the row's */
const NORMAL = Object.freeze({ id: DEFAULT_TIER, pull: Object.freeze([0, 0, 0, 0]), dmgPm: 1000, hpPm: 1000, xpPm: 1000 });
/** The row a tier plays on a ground: Normal for every pick. */
export const tierRowOf = () => NORMAL;
/** The pull a row brings for a group: none (the ground as built). */
export const pullOfTier = () => 0;
