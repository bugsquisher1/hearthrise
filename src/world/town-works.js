// ════════════════════════════════════════════════════════════════════════
// src/world/town-works.js — THE TOWN WORKS ON THE MAP (display only; HIDDEN until lane/c-town-works lands).
//
// The seam, so that lane touches no other file here: world-boot.js calls this every town frame with what hr_town_extras added to
// the last town answer. An answer is an ambient swap, { <ambient id>: <its stage's art id> }, the mechanism the Great Hearth's fire
// uses (hearth-burn.js), or null. lane/c-town-works replaces ONLY this body and the server's hr_town_extras body.
// PURE: no DOM, no window, no clock. Nothing here can be spent.
// ════════════════════════════════════════════════════════════════════════

/**
 * @param {object} map  compileMap() output (a town)
 * @param {object|null} extras  TownPresence.extras()
 * @returns {object|null} an ambient swap, or null while the Works are hidden
 */
export function townWorksSwap(map, extras) { // eslint-disable-line no-unused-vars
  return null;
}
