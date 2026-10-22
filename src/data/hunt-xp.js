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

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.25';
import { HUNT_ROLES } from './hunt-roles.js?v=0.2.25';

export const HUNT_XP = Object.freeze({
  groupMs: 1000,
  magicXpPermillePerMana: 1500,
});

/* THE SHARED PARTY XP (Tyler 2026-10-22: "an even split between party, almost exact
   math that Tibia uses"; designer rules the corners, PRIORITY_BOARD Decisions 2026-10-22).
   A kill's XP x (1 + the bonus for the number of DISTINCT role groups among the heroes
   alive at the kill), split evenly between them; each hero's own multiplier after the split.
     minHeroes             a lone hero is no party: below this, no bonus (as a lone player has no party)
     bonusPermilleByRoles  index = distinct role groups (0..4): +20% / +30% / +60% / +100%
     roleGroup             hunt-roles.js role → the role it counts as. Tank is a FUNCTION of
                           Melee, not a role (Tyler 2026-10-16), so tank and melee_dps are one.
     groupLabel            the words the party panel uses.
   The role is the hero UNIT's at the kill (the one the engine plays, set by the settle from
   the weapon). No level range (Tyler 2026-10-22: every member always shares) and no
   "recently active" rule (every hero auto-acts while alive; the dead are not paid). */
export const PARTY_XP = Object.freeze({
  minHeroes: 2,
  bonusPermilleByRoles: Object.freeze([0, 200, 300, 600, 1000]),
  roleGroup: Object.freeze({ tank: 'melee', melee_dps: 'melee', ranger: 'ranger', mage: 'mage', healer: 'healer' }),
  groupLabel: Object.freeze({ melee: 'Melee', ranger: 'Ranger', mage: 'Mage', healer: 'Healer' }),
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const P = PARTY_XP;
  const groups = Object.keys(P.groupLabel);
  if (!Number.isInteger(P.minHeroes) || P.minHeroes < 2) out.push('PARTY_XP.minHeroes must be a whole number >= 2');
  for (const r of Object.keys(HUNT_ROLES)) if (!groups.includes(P.roleGroup[r])) out.push('PARTY_XP.roleGroup has no group for role ' + r);
  for (const r of Object.keys(P.roleGroup)) if (!HUNT_ROLES[r]) out.push('PARTY_XP.roleGroup names an unknown role ' + r);
  const b = P.bonusPermilleByRoles;
  if (b.length !== groups.length + 1 || b[0] !== 0) out.push('PARTY_XP.bonusPermilleByRoles needs one row per group count 0..' + groups.length + ', starting at 0');
  for (let i = 1; i < b.length; i++) if (!Number.isInteger(b[i]) || b[i] < b[i - 1]) out.push('PARTY_XP.bonusPermilleByRoles must be whole permille, never falling');
  const X = HUNT_XP;
  if (!Number.isInteger(X.groupMs) || X.groupMs <= 0 || X.groupMs % HUNT_TUNING.stepMs !== 0) {
    out.push('groupMs must be a positive whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps, got ' + X.groupMs);
  }
  if (!Number.isInteger(X.magicXpPermillePerMana) || X.magicXpPermillePerMana < 0) out.push('magicXpPermillePerMana must be an integer >= 0');
  return out;
}
