// ============================================================================
// tools/balance-sim/staged/armor-line.js — THE ARMOR LINE PAST DAWNSTEEL: A POWER CEILING, AND A HIDDEN SAMPLE OF EIGHT UNDER IT
// (designer, lane/d-armor-past-dawnsteel, re-done as a budget in lane/d-armor-line-v2; the design is docs/planning/PRIORITY_BOARD.md
// "2026-11-16 The armor line past Dawnsteel, as a budget").
//
// Tyler 2026-11-14: "There is no level cap, so technically there will always be better gear being released as long as the
// game is alive. I think after tier 7 we start getting unique with the itemization and it goes away from being just standard
// upgrades, more like tibia", then "Boss gear to mix and match, rare drops from hunts". Tyler 2026-11-14 and 2026-11-16 (binding):
// past tier 7 every piece is a named unique with its OWN stat mix and properties; a line is a power BUDGET, a ceiling, never "a
// Dawnsteel twin plus one attribute". The first sample here was that twin; this one is not.
//
// WHY A LINE. A blow at a hero loses `absorb x P / (P + k x L)` to heavy armor and `dodge x P / (P + k x L)` to medium
// (src/core/mitigation.js; L is the ATTACKER's Level), and light armor takes a flat ward off a blow. So armor holds its value
// only if it grows with the Levels it faces. Full Dawnsteel holds plate at the 60% cap against monsters up to about Level 120 and
// then slides. The line's piece of a slot and weight worn from Level R is the Dawnsteel piece with its armor x max(1, R / 110)
// (`lineArmor`, Tyler 2026-11-08: "formulas are public").
//
// A BUDGET, NOT A TEMPLATE. The line's piece is the CEILING, never a sheet to copy. A piece's POWER on a ground is what the engine
// makes of it there (tools/balance-sim/armor-power.mjs, the engine's own rolls and armor chain), read two ways over the ground's
// spawn: PACE (kills a swing: a leather piece's Ranged and critical chance, a cloth piece's Magic, a plate piece's Melee) and SAFETY
// (what reaches the hero a swing: armor, the element it resists, the spells it holds). A unique worn from R may spend the budget
// any way it likes, as long as on EVERY late ground, worn by a hero who can hunt there, the MEAN of its pace and safety over the
// line's piece is at most 1 and neither is more than LINE_TRADE over (the Coordinator's ruling 2026-11-16: that is what lets a
// piece be heavy or light). So a heavy piece takes more armor than the line and pays in its swing; a light one the other way; an
// element piece gives armor for the element its ground casts. And each must WIN somewhere: on a ground a hero of its Level is
// sent to, worn in fully tempered Dawnsteel, it beats the tempered Dawnsteel piece of its slot and every other piece of its slot and
// weight that hero can wear. tests/armor-line.mjs measures all of it.
//
// PLATE CAN'T BEAT TEMPERED DAWNSTEEL ON CARTER'S REST OR THE OX ROAD, AND WHY. Their monsters are Levels 111 to 125, and full
// Dawnsteel plate already absorbs the 60% cap there, so more armor buys nothing; fully tempered Dawnsteel (2%) is then the same
// as the line, rounding aside. So the line's plate first clears tempered Dawnsteel at 129 (LINE_FIRST_LEVEL, measured), and a
// plate piece worn from under that wins only through its trade on its own ground. The anchor stays 110 (Tyler's x R / 110; the
// Tempering bands key on it, tests/temper-uniques.mjs TU3).
//
// HIDDEN. Nothing here is in ITEMS, in a monster's drops, in a catalogue or in a generator, and no src/ file imports this one,
// so the edge bundle and every served catalogue are what they were. Its readers are the measuring tools (armor-power.mjs,
// armor-line-table.mjs, the temper tables), the grader's `--uniques` (tools/balance-sim/gear.mjs STAGED_GEAR) and the guard. The
// build lane moves the rows into their catalogues when Tyler approves the sample (DESIGN_STANDARDS §9: sample, play, then expand).
// WHY HERE AND NOT src/data: a src/ file nothing the game runs imports is an orphan (tests/dead-exports.mjs, tightened 2026-11-18), and
// a hidden sample must not be imported by the game (AL2). So it waits with the simulator, and the build lane moves it into src/data.
//
// PURE ESM. Data only. Imports nothing.
// ============================================================================

/** The line's anchor: Dawnsteel is the curve at Carter's Rest's floor, the first ground past the last standard tier. */
export const LINE_ANCHOR_LEVEL = 110;

/** How far one of a piece's two reads (pace or safety) may go over the line's while their mean stays under it: a heavy or light piece's room. */
export const LINE_TRADE = 0.05;

/** THE LINE'S FIRST LEVEL by weight: the lowest Level whose whole line set is safer than fully tempered Dawnsteel on every late
    ground a hero of that Level is sent to (armor-power.mjs firstLevel; the guard re-measures it). Plate waits for the Roost: on
    Carter's Rest and the Ox Road Dawnsteel plate is at the cap. */
export const LINE_FIRST_LEVEL = Object.freeze({ plate: 129, leather: 120, cloth: 113 });

/* The Dawnsteel set the line starts from, by slot and weight (gear-tiers.js ARMOUR_SLOTS x ARMOUR_LINES at tier 7: plate,
   Dawnhide leather, Duskweave cloth). Restated, never read, so this file imports nothing; tests/armor-line.mjs AL1 holds it to
   the generated rows. */
export const LINE_BASE = Object.freeze({
  plate: Object.freeze({ ids: Object.freeze({ helmet: 'dawn_helm', body: 'dawn_platebody', pants: 'dawn_platelegs', boots: 'dawn_boots', gloves: 'dawn_gauntlets', belt: 'dawn_belt' }),
    defB: Object.freeze({ helmet: 44, body: 90, pants: 64, boots: 30, gloves: 23, belt: 30 }) }),
  leather: Object.freeze({ ids: Object.freeze({ helmet: 'dawnhide_helmet', body: 'dawnhide_body', pants: 'dawnhide_pants', boots: 'dawnhide_boots', gloves: 'dawnhide_gloves', belt: 'dawnhide_belt' }),
    defB: Object.freeze({ helmet: 24, body: 50, pants: 35, boots: 17, gloves: 13, belt: 17 }) }),
  cloth: Object.freeze({ ids: Object.freeze({ helmet: 'duskweave_helmet', body: 'duskweave_body', pants: 'duskweave_pants', boots: 'duskweave_boots', gloves: 'duskweave_gloves', belt: 'duskweave_belt' }),
    defB: Object.freeze({ helmet: 13, body: 27, pants: 19, boots: 9, gloves: 7, belt: 9 }) }),
});

/** The line's multiplier for a piece worn from Level `reqLv`: 1 up to the anchor, then reqLv / 110. */
export const lineScale = (reqLv) => Math.max(1, Number(reqLv) / LINE_ANCHOR_LEVEL);

/** The armor the line's piece of `slot` and `armourClass` worn from Level `reqLv` carries (null off the table). */
export function lineArmor(slot, armourClass, reqLv) {
  const b = LINE_BASE[armourClass];
  if (!b || !Object.prototype.hasOwnProperty.call(b.defB, slot)) return null;
  return Math.round(b.defB[slot] * lineScale(reqLv));
}

/* ── THE LINE BY BAND: the Levels a unique is worn from, from the Morrow Hills ladder and the Vaults (board 2026-11-14 section 5,
   2026-11-15 the Pauper Vaults), and what a full set on the line wears. For the board and the wiki; every number is lineArmor's. ── */
export const LINE_BANDS = Object.freeze([
  Object.freeze({ reqLv: 110, where: 'Carter\'s Rest (Dawnsteel itself; the Ox Road opens at 112)' }),
  Object.freeze({ reqLv: 122, where: 'The Night Shift' }),
  Object.freeze({ reqLv: 125, where: 'Wyvern Roost' }),
  Object.freeze({ reqLv: 138, where: 'The Old Guard' }),
  Object.freeze({ reqLv: 145, where: 'The Bellows, Father Gault' }),
  Object.freeze({ reqLv: 165, where: 'The Pauper Vaults' }),
  Object.freeze({ reqLv: 185, where: 'the next region' }),
  Object.freeze({ reqLv: 200, where: 'Level 200' }),
]);

/* ── THE SAMPLE OF EIGHT: Wyvern Roost's plate (125) for the sword and the tank on the bow's ground, and the Pauper Vaults' five (165),
   one per way of spending the budget. `row` is the item row as it would ship, `base` the Dawnsteel piece of its slot and weight (every
   field but its words, numbers, Level, book and rarity is the base's), `attr` its one special attribute or null (the special-attribute catalogue,
   SPECIAL_ATTRIBUTES, tier-7 size; only one the engine reads), `spend` how it spends the budget (its identity, one line), `source`
   where it drops (`ch` a kill, proposed: about one every 15 hours for a lone hero at the floor at 172 kills an hour, by the monster's
   share of the spawn; the drop guard fits it when the rows go in), `use` what catalogue-coherence files it under, `text` the item
   card's line. Every element a piece resists is a spell on its own ground: Fire Breath (the Crag Wyvern) and, at the Vaults, Lime Sack
   (poison) and Snuff the Candles (ice). Each power and each "wins where" is measured by tests/armor-line.mjs and printed by
   `node tools/balance-sim/armor-power.mjs`. ── */
export const LINE_SAMPLE = Object.freeze({
  /* ── WYVERN ROOST, 125 ── */
  wagon_guards_breastplate: Object.freeze({
    row: Object.freeze({ n: 'Wagon Guard\'s Breastplate', icon: '🛡️', v: 122725, type: 'armor', slot: 'body', defB: 108, armourClass: 'plate', atkB: -1, rangeAtkB: -23, magicAtkB: -45,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 125 }),
    base: 'dawn_platebody', attr: null,
    spend: 'heavy: more armor than the line, and a stiff shoulder takes a point off your Melee',
    source: Object.freeze({ monster: 'brood_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'It carries 108 armor, more than any other breastplate at Level 125, and your Melee lands a little less often in it. The wagon guards who rode the pass wore these thick, and one of them is still up in the nest.',
  }),
  burnt_crag_leg_plates: Object.freeze({
    row: Object.freeze({ n: 'Burnt Crag Leg Plates', icon: '🛡️', v: 90000, type: 'armor', slot: 'pants', defB: 86, armourClass: 'plate', strB: -2, rangeAtkB: -16, magicAtkB: -32,
      resistPm: Object.freeze({ ember: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 125 }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_element', 'ember']),
    spend: 'fireproof and heavy: the Crag Wyvern\'s fire, more armor, and they cost you some of your swing',
    source: Object.freeze({ monster: 'crag_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'You take 10% less fire damage, and your blows land 2 lighter. They came off the Burnt Crag black, and the wyverns\' fire never got through them.',
  }),
  outriders_visor: Object.freeze({
    row: Object.freeze({ n: 'Outrider\'s Visor', icon: '🛡️', v: 49090, type: 'armor', slot: 'helmet', defB: 64, armourClass: 'plate', atkB: -2, rangeAtkB: -11, magicAtkB: -22,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 125 }),
    base: 'dawn_helm', attr: null,
    spend: 'closed: the most armor a helm has here, and a narrow slit costs your Melee 2',
    source: Object.freeze({ monster: 'ledge_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'It carries 64 armor and costs your Melee 2. The outriders rode ahead of the wagons with these shut, because the Ledge Wyverns spit at faces.',
  }),
  /* ── THE PAUPER VAULTS, 165 ── */
  watchmans_helm: Object.freeze({
    row: Object.freeze({ n: 'Watchman\'s Helm', icon: '🛡️', v: 64800, type: 'armor', slot: 'helmet', defB: 84, armourClass: 'plate', atkB: -1, rangeAtkB: -11, magicAtkB: -22,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_helm', attr: null,
    spend: 'heavy: a full face, 18 more armor than the line, and the narrow slit costs your Melee a point',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'pauper_vaults', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'It carries 84 armor, the most of any helm, and your Melee lands a little less often in it. The Havora Watch wore them shut on the night rounds, and some of the paupers were old Watch.',
  }),
  limewashed_plate: Object.freeze({
    row: Object.freeze({ n: 'Limewashed Plate', icon: '🛡️', v: 162000, type: 'armor', slot: 'body', defB: 130, armourClass: 'plate', rangeAtkB: -23, magicAtkB: -45,
      resistPm: Object.freeze({ poison: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platebody', attr: Object.freeze(['resist_element', 'poison']),
    spend: 'the lime\'s answer: under the line\'s armor, and the Night Carters\' Lime Sack does less',
    source: Object.freeze({ monster: 'bone_wall', ground: 'pauper_vaults', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'You take 10% less poison damage. It went into the ossuary wall with whoever wore it, and a hundred years in the lime turned it white and sealed it against the stuff.',
  }),
  keepers_leg_plates: Object.freeze({
    row: Object.freeze({ n: 'Keeper\'s Leg Plates', icon: '🛡️', v: 118800, type: 'armor', slot: 'pants', defB: 86, armourClass: 'plate', rangeAtkB: -16, magicAtkB: -32,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_element', 'frost']),
    spend: 'the cold\'s answer: under the line\'s armor, and Keeper Dunn\'s Snuff the Candles does less',
    source: Object.freeze({ monster: 'keeper_dunn', ground: 'pauper_vaults', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'You take 10% less ice damage. The Keepers stood their watches in the cold vaults for years, and these are lined against it.',
  }),
  haulers_jerkin: Object.freeze({
    row: Object.freeze({ n: 'Hauler\'s Jerkin', icon: '🎽', v: 113400, type: 'armor', slot: 'body', defB: 69, armourClass: 'leather', rangeAtkB: 45, critB: 0.035, magicAtkB: -14,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawnhide_body', attr: null,
    spend: 'light: damage over dodge, 6 under the line\'s armor and a quarter more critical chance than Dawnhide',
    source: Object.freeze({ monster: 'night_carter', ground: 'pauper_vaults', how: 'rare', ch: 0.0031 }), use: 'worn',
    text: 'You land a critical hit 3.5% more often in it, a quarter more than a Dawnhide Body, and it carries 69 armor. The Night Carters cut their coats loose at the shoulders to swing the sacks up, and it draws a bow the same way.',
  }),
  paupers_shroud: Object.freeze({
    row: Object.freeze({ n: 'Pauper\'s Shroud', icon: '🧥', v: 113400, type: 'armor', slot: 'body', defB: 36, armourClass: 'cloth', magicAtkB: 54, magicStrB: 10, atkB: -23, rangeAtkB: -18,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'duskweave_body', attr: Object.freeze(['resist_element', 'frost']),
    spend: 'the cold\'s answer for a caster: a thin sheet, 5 under the line\'s ward, and Keeper Dunn\'s Snuff the Candles does less',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'pauper_vaults', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'You take 10% less ice damage, and it wards 36. A thin gray sheet with a wooden tag still tied to it. Whoever it was is still owed a burning.',
  }),
});
