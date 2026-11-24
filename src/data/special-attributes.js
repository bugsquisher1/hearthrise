// ============================================================================
// src/data/special-attributes.js — SPECIAL-ATTRIBUTE GEAR: THE ATTRIBUTE CATALOGUE AND THE SAMPLE (TWO SHIPPED, TWO HIDDEN)
// (designer, lane/d-special-attributes; the design is docs/planning/PRIORITY_BOARD.md "2026-11-15 Special-attribute gear").
//
// Tyler 2026-11-14: "I would like to sprinkle items like this throughout the game to be farmed to build better sets", after
// "by unique i mean having a special attribute" and "maybe the legs have a % physical resistance". A special piece is the
// standard piece of its slot and tier plus ONE attribute. It drops (armor, shields and weapons); high-end jewelry is crafted.
//
// TWO ARE SHIPPED, TWO ARE HIDDEN (Widow's Fang left the sample, lane/named-pieces 2026-11-23). Krell's Tollgate and the Banded Legguards (`shipped: true`; Tyler 2026-11-14: "a pair of
// pally legs a tank shield") are real items since lane/c-krell-uniques: their home pack (src/data/grounds/krells_hold/pack.js)
// reads the row, the text and the roll's slice FROM HERE, so this file stays the one place they are written. The other two
// are in no ITEMS row, no monster's drops, no recipe, no catalogue and no generator until Tyler approves the sample
// (DESIGN_STANDARDS §9: sample, play, then expand). The only src/ file that imports this one is a shipped row's home pack
// (tests/special-attributes.mjs SA1). Its other readers are the measuring tool (tools/balance-sim/special-table.mjs).
//
// PURE ESM. Data only. Imports only src/data/gear-profiles.js (each row's derived stats).
// ============================================================================

import { withGearStats } from './gear-profiles.js';
import { MATERIAL_TIERS, stepOf } from './gear-tiers.js';

/** The gear tiers a special piece exists at. Tier 1 has none: a Rare drop takes 10 to 20 hours and tier 1 is outgrown in about 5. */
export const SPECIAL_TIERS = Object.freeze([2, 3, 4, 5, 6, 7]);

/* ── THE ATTRIBUTES. One a piece. `field` is the item field the engine reads and `keys` what it may name; `at` is the
   strength at each gear tier (a tier the table doesn't name has no piece of that kind); `cap` is the most a hero gets from
   everything worn, and where that cap lives (NEW: the build lane adds it). `hook` is null when the engine reads the field
   today (physical resistance since lane/c-krell-uniques: src/core/elements.js heroElementPermille). Every size was measured or is marked in the design (tools/balance-sim/special-table.mjs).
   A + skill attribute's `field` is one item field PER KEY (the designer's ruling 2026-11-18 row 1c, PRIORITY_BOARD "2026-11-18 Designer
   rulings"): the engine's own `<skill>Plus` (src/core/combat.js SKILL_PLUS_FIELDS, the Tower weapons' and the Catacombs armor's), read by
   every blow, spell and guard. It was `skillB`, which nothing reads, so the Mudlark's Mitts would have shipped as nothing.
   tests/special-attributes.mjs SA3 holds the map to the engine's. A reader asks `typeof field === 'string' ? field : field[key]`. ── */
export const SPECIAL_ATTRIBUTES = Object.freeze({
  /* 10% less damage from one element, the same at every tier. Linings (imbuements.js) share the cap, so a Sealed lining
     (30%) and one piece is the top, and so is a Stitched lining (20%) and two. Only fire has a job today (the bosses). */
  resist_element: Object.freeze({
    field: 'resistPm', keys: Object.freeze(['ember', 'frost', 'poison']), unit: 'permille',
    at: Object.freeze({ 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100 }),
    cap: Object.freeze({ value: 400, where: 'src/data/elements.js HERO_RESIST_PM.max' }),
    slots: Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt', 'cape', 'shield']), hook: null,
  }),
  /* Less damage from every blow that carries no element (a swing, a bite, an arrow, a bleed). None under tier 5. */
  resist_physical: Object.freeze({
    field: 'resistPm', keys: Object.freeze(['physical']), unit: 'permille',
    at: Object.freeze({ 5: 20, 6: 30, 7: 30 }),
    cap: Object.freeze({ value: 100, where: 'src/data/elements.js HERO_RESIST_PM.physicalMax' }),
    slots: Object.freeze(['pants', 'boots', 'belt', 'shield']), hook: null,
  }),
  /* + Defense while worn. One level is 4 to 6% less damage taken at Levels 40 to 90, so it is +1 at every tier and capped at +2.
     Never on a helmet (the designer 2026-11-18, row 1c; measured 2026-11-16 by lane/d-catacomb-armor: +1 Defense on a helm out-guards the
     NEXT tier's helm), so a cape alone carries it. */
  defense: Object.freeze({
    field: Object.freeze({ defense: 'defensePlus' }), keys: Object.freeze(['defense']), unit: 'levels',
    at: Object.freeze({ 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }),
    cap: Object.freeze({ value: 2, where: 'NEW: src/data/special-attributes.js GEAR_SKILL_CAP.defense' }),
    slots: Object.freeze(['cape']), hook: null,
  }),
  /* + levels of the skill you fight with while worn. Armor only: a weapon's + skill is the Burning Tower's (its key table).
     Magic is in the vocabulary and on NO piece: + Magic measured as nothing for a wand at 40, 60 and 90. */
  skill: Object.freeze({
    field: Object.freeze({ melee: 'meleePlus', ranged: 'rangedPlus', magic: 'magicPlus' }), keys: Object.freeze(['melee', 'ranged', 'magic']), unit: 'levels',
    at: Object.freeze({ 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3 }),
    cap: Object.freeze({ value: 6, where: 'NEW: src/data/special-attributes.js GEAR_SKILL_CAP.weaponSkill, armor and cape together; the weapon adds its own on top' }),
    slots: Object.freeze(['helmet', 'gloves', 'body', 'cape']), hook: null, unproven: Object.freeze(['magic']),
  }),
  /* + critical chance on basic blows. Weapons only (leather armor carries its own small crit as a standard stat). Its sample piece,
     Widow's Fang, is cut (docs/design/redesign/28-named-pieces.md); the kind stays only for the staged weapon line past Dawnsteel
     (the staged line's file under tools/balance-sim/staged), whose sort into Traits or Signatures is 27-formula-overhaul.md 2.3's, still owed. */
  crit: Object.freeze({
    field: 'critB', keys: null, unit: 'chance',
    at: Object.freeze({ 2: 0.06, 3: 0.06, 4: 0.08, 5: 0.08, 6: 0.1, 7: 0.1 }),
    cap: Object.freeze({ value: 0.6, where: 'src/core/combat.js COMBAT_BALANCE.critCap' }),
    slots: Object.freeze(['weapon']), hook: null,
  }),
  /* 10% more damage to one monster class, on the standard weapon's numbers. The engine's ceiling is 1.4; a row uses 1.1. */
  bane: Object.freeze({
    field: 'bane', keys: null, unit: 'mult',
    at: Object.freeze({ 2: 1.1, 3: 1.1, 4: 1.1, 5: 1.1, 6: 1.1, 7: 1.1 }),
    cap: Object.freeze({ value: 1.4, where: 'src/core/bane.js MAX_BANE_MULT' }),
    slots: Object.freeze(['weapon']), hook: null,
  }),
});

/* ── THE SAMPLE, in the item rows' own shape (src/data/items.js, shields.js). `row` is the item row as it would
   ship. `base` is the standard piece whose numbers it copies (null: the ladder has no piece there, the numbers are the
   ladder's next rung). `attr` names the attribute and its key. `source` is where it drops: `how` is the loot band
   (loot-bands.js), or 'daily' for Lord Krell's once-a-day prize roll (`pm` permille a hero). `use` is what
   catalogue-coherence files it under. `text` is the item card's description (once shipped, lore only: the card's stat
   lines say what it does, tests/special-attributes.mjs SA7). `shipped: true`: the row is a real item, read from here by
   its home pack. ── */
const SAMPLE = {
  krells_tollgate: Object.freeze({
    row: Object.freeze({ n: 'Krell\'s Tollgate', icon: '🛡️', v: 43200, type: 'offhand', slot: 'shield', offhand: 'shield',
      resistPm: Object.freeze({ ember: 100 }), tier: 7, rarity: 'mythic', reqSkill: 'level' }),
    base: null, attr: Object.freeze(['resist_element', 'ember']),
    source: Object.freeze({ monster: 'lord_krell', ground: 'krells_hold', how: 'daily', pm: 30 }), use: 'worn', shipped: true,
    text: 'Krell had his toll house gate cut down into a shield. Every coin that crossed the ford went through it.',
  }),
  banded_legguards: Object.freeze({
    row: Object.freeze({ n: 'Banded Legguards', icon: '🛡️', v: 79200, type: 'armor', slot: 'pants', armourClass: 'plate',
      resistPm: Object.freeze({ physical: 30 }), tier: 7, rarity: 'mythic', reqSkill: 'level' }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_physical', 'physical']),
    source: Object.freeze({ monster: 'lord_krell', ground: 'krells_hold', how: 'daily', pm: 30 }), use: 'worn', shipped: true,
    text: 'Krell\'s smith made these from the Banded Company\'s armor. He left the bronze bands on so everyone would know whose they were.',
  }),
  mudlarks_mitts: Object.freeze({
    row: Object.freeze({ n: 'Mudlark\'s Mitts', icon: '🎽', v: 735, type: 'armor', slot: 'gloves', armourClass: 'leather',
      rangedPlus: 2, tier: 4, rarity: 'epic', reqSkill: 'level' }),
    base: 'snakeskin_gloves', attr: Object.freeze(['skill', 'ranged']),
    source: Object.freeze({ monster: 'mudlark', ground: 'the_slake', how: 'rare' }), use: 'worn',
    text: 'Your Ranged counts as 2 higher while you wear them. A Mudlark finds things in the river by feel, and these are worn thin at every fingertip.',
  }),
  /* The wave-3 staff, re-fitted to the tier-6 staff's numbers (the id and the name stay; its old row is untouched, as above). */
  demoncaller_staff: Object.freeze({
    row: Object.freeze({ n: 'Demoncaller', icon: '🪄', v: 13000, type: 'weapon', slot: 'weapon', weaponType: 'magic', discipline: 'restoration', twoHanded: true,
      bane: Object.freeze({ class: 'undead', mult: 1.1 }), effects: Object.freeze(['bane']),
      tier: 6, rarity: 'legendary', reqSkill: 'level' }),
    base: 'runewood_staff', attr: Object.freeze(['bane', 'undead']),
    source: Object.freeze({ monster: 'provost', ground: 'pyre_field', how: 'rare' }), use: 'worn',
    text: 'It hits the Undead 10% harder. The Provosts carried these to call the burned back up. The soldiers they called had another name for them.',
  }),
};
/* THE SAMPLE AS IT SHIPS: each row's base stats DERIVED (src/data/gear-profiles.js; tools/gen-gear.mjs writes them under
   'special:<id>', since a hidden row's id can be a live item's too): a row with a `base` is that standard piece at its item Level (the
   attribute on top), one without (a shield) is its ladder's piece at its own item Level. */
/* A ROW IS STAMPED TO ITS TIER (12-targets 8.3): its material's grid step, worn from its item Level less wearAhead (src/data/gear-tiers.js
   MATERIAL_TIERS), so no row types a Level and a special piece is worn as its standard piece is. */
const onGrid = (row) => { const m = MATERIAL_TIERS[row.tier - 1]; return { ...row, reqLv: m.level, ...stepOf(m) }; };
export const SPECIAL_SAMPLE = /** @type {Readonly<typeof SAMPLE>} */ (Object.freeze(Object.fromEntries(Object.entries(SAMPLE).map(([id, s]) =>
  [id, Object.freeze({ ...s, row: withGearStats({ [id]: onGrid(s.row) }, 'special:')[id] })]))));
