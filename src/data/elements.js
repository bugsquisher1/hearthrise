// ════════════════════════════════════════════════════════════════════════
// src/data/elements.js — THE ONE ELEMENT VOCABULARY (ARCHITECTURE_CONTRACTS §1.5)
//
// Every element name in the game is one of these ids: a monster's
// elementWeak / elementResist / elementImmune (monsters.js, monster-classes.js),
// an ability's `element` (abilities.js), a rune item's `element` (items),
// a status's `damageType` (statuses.js, or 'physical'), the hit-effect map
// (hunt-vfx.js) and the generated rune catalogue (tools/gen-catalogues.mjs).
// Each of those validators asks `isElement` here, so a name outside this list
// fails a test instead of silently matching nothing (the 2026-10-21 bug: the
// abilities said 'fire' / 'nature' while every monster said 'ember' / 'poison',
// so Fireball never met the Rat King's ember resist).
//
// ELEMENT_PERMILLE is what one blow of an element is worth against a monster
// that is weak to / resists / is immune to it (HUNT_PARITY_CHECKLIST DM-01:
// weak 1.15, resist 0.75, immune 0). The values are the Game Designer's.
// core/combat.js elementPermille is the one reader in the hunt engine.
//
// PURE ESM. Data only. Vendored into the hr-accrue Edge Function.
// ════════════════════════════════════════════════════════════════════════

/** The three elements. `blight` was renamed POISON everywhere (DEC-ELEM-04). */
export const ELEMENTS = Object.freeze(['ember', 'frost', 'poison']);

/** What one elemental blow is worth, in permille of the rolled amount. */
export const ELEMENT_PERMILLE = Object.freeze({ weak: 1150, resist: 750, immune: 0 });

/** The non-element damage type (a basic swing, a bleed). */
export const PHYSICAL = 'physical';

const SET = new Set(ELEMENTS);

/** Is `e` one of the real elements? The single validity predicate. */
export function isElement(e) {
  return typeof e === 'string' && SET.has(e);
}

/** Every problem with the vocabulary itself, as strings. Empty = valid. */
export function validate() {
  const out = [];
  if (SET.size !== ELEMENTS.length) out.push('ELEMENTS has a duplicate id');
  for (const e of ELEMENTS) if (!/^[a-z]{1,16}$/.test(e)) out.push('element id ' + e + ' is not [a-z]');
  if (SET.has(PHYSICAL)) out.push('physical is not an element');
  const p = ELEMENT_PERMILLE;
  if (!(Number.isInteger(p.weak) && Number.isInteger(p.resist) && p.immune === 0 && p.weak > 1000 && p.resist > 0 && p.resist < 1000)) {
    out.push('ELEMENT_PERMILLE must be weak > 1000 > resist > immune = 0, integers');
  }
  return out;
}
