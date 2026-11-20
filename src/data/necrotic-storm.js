// ════════════════════════════════════════════════════════════════════════
// src/data/necrotic-storm.js — NECROTIC AND STORM, PHASE 6B: THE SWITCH (docs/design/itemization-plan.md Appendix B, §11 row 6b)
//
// Tyler 2026-11-18: "I want to add Necrotic and Storm and i want each weapon type to have a spell for both." Same night: rune
// families STORM (the hidden Air family, shown as Storm) and BONE (an eighth family, for Necrotic): "Yes storm and bone".
//
// WHAT THE SWITCH HOLDS BACK. While `live` is false NO shipped table moves: the element vocabulary stays fire, ice and poison
// (src/data/elements.js ELEMENTS), so no monster profile, gear resistance, spell or status may name the new two and every screen
// that lists elements lists three; the Withered status is in no table (statuses.js); the Storm family stays hidden and the Bone
// family is absent (runes.js), so no rune, recipe or store row exists (stonecraft.js, supply-basics.js) and no generated catalogue
// moves; the four sample spells are in no list (abilities.js); and no monster class resists or is weak to either (monster-classes.js
// newElementLayer). Ships DARK until the Ox Road (Necrotic) and the Old Guard (Storm) open (plan §11 phase 11).
//
// WHAT IS REAL WITH IT OFF. The engine pieces the elements stand on are code and play for any row that names them, exactly as the fist
// line's own heal (src/data/fists.js): an element's FIXED RULE on a hero it strikes (elements.js ELEMENT_ON_HERO, damage.js landHit:
// a necrotic hit Withers, a storm hit burns mana), the HEAL CUT every heal passes through (src/core/hunt/heal-cut.js: food, spells,
// leech, a healer's casts, the wraps' own heal and a monster's mend), and a spell's LEECH and MANA BACK (abilities.js `leechPm`,
// `manaPerHit`, `manaPerKill`). With no row naming them they change nothing: no draw, no event, no number (engine-parity holds its pins).
// The measuring tool and the test play a planted copy with `live` true (tools/balance-sim/elements-6b-table.mjs,
// tests/hunt-core/necrotic-storm.mjs), so the sample is measured as written and the tree is untouched.
//
// GOING LIVE is one lane: flip `live`, then in the same lane the art (ten rune icons, four spell icons, two hit effects, the Withered
// mark), the element words (src/data/text/monster.js el_necrotic / el_storm), the hit effects (hunt-vfx.js HIT_FX.element), the item
// descriptions, the generated catalogues (items, recipes, store rows, rune spells: Lane C) and the edge deploy. The two guard
// LININGS are phase 6's (plan §5), not this switch's.
//
// PURE ESM. Data only. Imports nothing.
// ════════════════════════════════════════════════════════════════════════

export const NECROTIC_STORM = Object.freeze({
  /* THE SWITCH: false = Necrotic, Storm, the Bone and Storm runes and their spells are in no shipped table (see the header). */
  live: false,
});
