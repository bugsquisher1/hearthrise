// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-xp.js — THE HUNT'S XP NUMBERS (HUNT_SCREEN_SPEC §3.5, parity XP-01..07, AB-04)
//
// Read only by src/core/hunt/xp-share.js. The level curve is NOT here: it is
// src/core/xp.js, the only one (XP-06: the sim's curve is not ported).
//
//   groupMs                 kills within this long of the first are ONE "+XP"
//                           number (XP-03, DECIDED Tyler 10-16: 1 s)
//   magicXpPermillePerMana  Magic XP per mana spent, permille, before the
//                           ability's own multiplier (AB-04, designer 10-15: 1.5)
//
// The per-hero multiplier (bestiary mastery, boosts) is not a number here: it
// is read server-side and injected per hero through the swing context
// (`xpMultOf`); until the bestiary lane plugs in, every hero's is 1 (XP-07).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.63';

export const HUNT_XP = Object.freeze({
  groupMs: 1000,
  magicXpPermillePerMana: 1500,
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const X = HUNT_XP;
  if (!Number.isInteger(X.groupMs) || X.groupMs <= 0 || X.groupMs % HUNT_TUNING.stepMs !== 0) {
    out.push('groupMs must be a positive whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps, got ' + X.groupMs);
  }
  if (!Number.isInteger(X.magicXpPermillePerMana) || X.magicXpPermillePerMana < 0) out.push('magicXpPermillePerMana must be an integer >= 0');
  return out;
}
