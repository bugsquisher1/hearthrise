// ════════════════════════════════════════════════════════════════════════
// src/data/party.js — A HUNTING PARTY (HUNT_SCREEN_SPEC §3.9; contract §1.10)
//
//   maxSize     heroes in one party (Tyler 2026-10-16: up to 4, "maybe 5
//               later"). The server reads it as the generated limits row
//               `party_max`; hr_party_join refuses `party_full` past it.
//   lootSplit   'even_value' (week plan item 9): a kill's gold is split evenly
//               between the heroes in the instance, the remainder to the
//               lowest (user_id, slot); items go round-robin from a seeded
//               start on the instance's `r` stream (src/core/party-split.js,
//               the one split). A solo hunt is a party of one.
//   finder      what the party finder filters on: the weapon TYPE a member has
//               equipped, server-read (role comes from the weapon, never the
//               outfit: hunt-roles.js WEAPON_ROLES).
// Any role mix is allowed (Tyler 2026-10-16: four tanks is a party).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const PARTY = Object.freeze({
  maxSize: 4,
  lootSplit: 'even_value',
  finder: Object.freeze(['weapon_type']),
});

/** Every problem with the table, as strings. Empty = valid. */
export function validate() {
  const out = [];
  if (!Number.isInteger(PARTY.maxSize) || PARTY.maxSize < 1 || PARTY.maxSize > 5) out.push('PARTY.maxSize must be a whole 1..5');
  if (PARTY.lootSplit !== 'even_value') out.push('PARTY.lootSplit must be even_value (the only split party-split.js implements)');
  if (!PARTY.finder.every((f) => f === 'weapon_type')) out.push('PARTY.finder names a filter the server does not implement');
  return out;
}
