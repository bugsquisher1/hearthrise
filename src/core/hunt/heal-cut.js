// ============================================================
// src/core/hunt/heal-cut.js — EVERY HEAL A UNIT TAKES, THROUGH ONE CUT (itemization plan Appendix B1: Necrotic)
//
// A unit under a HEAL-CUTTING status (src/data/statuses.js `healCutPm`: Withered) takes less from every heal while it lasts:
// "everything that heals the hero heals 30% less: food, spells, leech, a healer's casts" (B1), and a Withered monster
// "heals half as much" (B3). This file is the one reader, so no heal can forget it. Its callers, one per way HP comes back:
//   abilities.js   a spell's heal (Mend, Greater Mend, a party heal) and a spell's leech (Reave)
//   consumables.js food, its instant half and each over-time tick
//   pull-cycle.js  the wraps' own heal (the fist line's selfHealPm); NOT natural regeneration, which is no heal (B1's list)
//   monster-spells.js a monster's mend on its packmate
// A shield is no heal: Withered never touches one ("a healer who shields instead of heals", B1).
//
// A wiki formula: the strongest live heal-cutting stack's cut,
//   hero    cut = floor(healCutPm.hero x scale / 1000)   (scale: the share of its guard element the hero takes, fixed as it landed:
//                                                        status.js stackScale; 1000 with no guard)
//   monster cut = healCutPm.monster
//   landed = n - floor(n x cut / 1000)                     (a 1-point heal still lands 1)
// A unit under no such stack takes every heal whole: no read moves a number, no draw is made.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { effectPm } from './status-effects.js';
import { healInPm } from './talent-rows.js';

/** The permille unit `u` loses from every heal now (status-effects.js effectPm: the strongest live heal-cutting stack's), 0 with none,
    never the whole heal. */
export const healCutPmOf = (u) => Math.min(999, effectPm(u, 'healCutPm'));

/** What a heal of `n` lands on `u` (before its missing-HP cap, which each caller keeps): n less its cut. `n` itself with no cut. */
export function healTaken(u, n) {
  const cut = healCutPmOf(u);
  return cut > 0 && n > 0 ? n - Math.floor((n * cut) / 1000) : n;
}

/**
 * THE ONE HEAL DOOR FOR A HERO'S HEALS (lane/talent-effects): a heal of `n` on `u` less its cut (healTaken), then the healing `u` RECEIVES
 * now (talent-rows.js healInPm: its own and its ward-caster's rows, capped) on what is left: landed + floor(landed x pm / 1000), never
 * under 0. A unit with no such row lands exactly healTaken's. Callers: abilities.js (a cast's heal and its leech), status.js (a heal tick).
 */
export function healIn(inst, u, n) {
  const cut = healTaken(u, n);
  const pm = cut > 0 ? healInPm(inst, u) : 0;
  return pm ? Math.max(0, cut + Math.floor((cut * pm) / 1000)) : cut;
}
