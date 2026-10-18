// ════════════════════════════════════════════════════════════════════════
// src/data/hunt-outfits.js — WHAT A HERO LOOKS LIKE IN A HUNT (parity VW-13, VW-18).
//
// An OUTFIT is a sprite set, independent of the ROLE (the weapon's): any hero may
// wear any outfit (Tyler 10-15/10-16). The server names a member's outfit when it
// has one (`party.members[].outfit`); until it does, a hero wears its role's
// default. Every outfit ships its own walk: none borrows another's art (VW-13).
// Sprites: the `hunt` atlas set (art/world/hunt, tools/world-art/port-hunt-sim.mjs).
// The druid is the healer's default: a green hooded caster, so the first solo-healer
// hunt reads as a healer (the witch stays a wearable outfit).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const OUTFITS = Object.freeze({
  knight: 'outfit_knight',
  berserker: 'outfit_berserker',
  brute: 'outfit_brute',
  ranger: 'outfit_ranger',
  sorcerer: 'outfit_sorcerer',
  witch: 'outfit_witch',
  dawnward: 'outfit_dawnward',
  druid: 'outfit_druid',
});

/* role (src/data/hunt-roles.js) → the outfit it wears when the server names none. */
export const ROLE_OUTFIT = Object.freeze({
  tank: 'knight',
  melee_dps: 'berserker',
  ranger: 'ranger',
  mage: 'sorcerer',
  healer: 'druid',
});

/** The sprite id a hero is drawn with: its named outfit when known, else its role's, else the tank's. */
export function outfitSprite(outfit, role) {
  return OUTFITS[outfit] || OUTFITS[ROLE_OUTFIT[role]] || OUTFITS.knight;
}
