// ============================================================================
// src/data/armor-line.js — THE ARMOR LINE PAST DAWNSTEEL, AND A HIDDEN SAMPLE OF FIVE ON IT
// (designer, lane/d-armor-past-dawnsteel; the design is docs/planning/PRIORITY_BOARD.md "2026-11-15 Armor past Dawnsteel").
//
// Tyler 2026-11-14: "There is no level cap, so technically there will always be better gear being released as long as the
// game is alive. I think after tier 7 we start getting unique with the itemization and it goes away from being just standard
// upgrades, more like tibia", then "Boss gear to mix and match, rare drops from hunts". Dawnsteel (tier 7, worn from 88) is the
// last standard tier. Past it, unique pieces carry the armor curve.
//
// WHY A LINE. A blow at a hero loses `absorb x P / (P + k x L)` to heavy armor and `dodge x P / (P + k x L)` to medium
// (src/core/mitigation.js; L is the ATTACKER's Level), and light armor takes a flat ward off a blow that grows with the
// attacker's Level. So armor holds its value only if it grows in step with the Levels it faces. Full Dawnsteel holds plate at
// the 60% cap against monsters up to about Level 113 and then slides: at the Pauper Vaults (165-185) it absorbs 55% and a
// Deadly four's tank dies 25 times in 16 hero-hours on the right food, 151 on the ground's guide food (measured,
// tools/balance-sim/armor-line-table.mjs). The line puts it back: a piece worn from Level R carries the armor of the Dawnsteel
// piece of its slot and weight times R / 110, Carter's Rest's floor, where Dawnsteel is the last standard set.
//
// ONE FORMULA, PUBLIC (Tyler 2026-11-08, "formulas are public"): armor(slot, weight, R) = round(Dawnsteel's x max(1, R / 110)).
// The line moves ARMOR only. Every other number on a piece (the weight's style bonuses and penalties) is the Dawnsteel piece's,
// so a caster's damage does not climb with it (the Mage already reads 1.4-1.75x the pace past 110). A unique adds one
// attribute from the special-attribute catalogue (SPECIAL_ATTRIBUTES, its tier-7 size). A unique may sit UNDER the line as its trade (Carter's Rest's
// proposed five do); none sits above it.
//
// HIDDEN. Nothing here is in ITEMS, in a monster's drops, in a catalogue or in a generator, and no src/ file imports this one,
// so the edge bundle and every served catalogue are what they were. Its readers are the measuring tool
// (tools/balance-sim/armor-line-table.mjs) and its guard (tests/armor-line.mjs). The build lane moves the rows into their
// catalogues when Tyler approves the sample (DESIGN_STANDARDS §9: sample, play, then expand).
//
// PURE ESM. Data only. Imports nothing.
// ============================================================================

/** The line's anchor: Dawnsteel is the curve at Carter's Rest's floor, the first ground past the last standard tier. */
export const LINE_ANCHOR_LEVEL = 110;

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

/** The armor a piece of `slot` and `armourClass` worn from Level `reqLv` carries on the line (null off the table). */
export function lineArmor(slot, armourClass, reqLv) {
  const b = LINE_BASE[armourClass];
  if (!b || !Object.prototype.hasOwnProperty.call(b.defB, slot)) return null;
  return Math.round(b.defB[slot] * lineScale(reqLv));
}

/* ── THE LINE BY BAND: the Levels a unique is worn from, from the Morrow Hills ladder and the Vaults (board 2026-11-14 section 5,
   2026-11-15 the Pauper Vaults), and what a full set on the line wears. For the board and the wiki; every number is lineArmor's. ── */
export const LINE_BANDS = Object.freeze([
  Object.freeze({ reqLv: 110, where: 'Carter\'s Rest, the Ox Road (Dawnsteel itself)' }),
  Object.freeze({ reqLv: 125, where: 'Wyvern Roost, the Night Shift' }),
  Object.freeze({ reqLv: 140, where: 'The Old Guard' }),
  Object.freeze({ reqLv: 155, where: 'The Bellows, Father Gault' }),
  Object.freeze({ reqLv: 165, where: 'The Pauper Vaults' }),
  Object.freeze({ reqLv: 185, where: 'the next region' }),
  Object.freeze({ reqLv: 200, where: 'Level 200' }),
]);

/* ── THE SAMPLE OF FIVE: the Pauper Vaults' rare drops, Level 165, the line's x1.5. The three heavy pieces are the big three slots
   a tank needs on the line to hold the Vaults' Deadly (measured: helm, body and legs on the line with Dawnsteel boots, gloves and
   belt read 6 deaths in 16 hero-hours against the sheet's 9; Dawnsteel alone 25). One body each for leather and cloth shows the
   line on the other two weights. Shape as the special-attribute sample (SPECIAL_SAMPLE): `row` is the item row as it would ship,
   `base` the Dawnsteel piece it copies (armor moved to the line), `attr` the SPECIAL_ATTRIBUTES attribute and key, `source`
   where it drops (`ch` a kill, proposed: about one every 15 hours for a lone tank at the floor, 172 kills an hour, by the
   monster's share of the spawn; the drop guard fits it when the rows go in), `use` what catalogue-coherence files it under,
   `text` the item card's line. Every element the attributes name is a spell on this ground: Lime Sack is poison, Snuff the
   Candles ice, and 90% of what reaches a tank here is physical. ── */
export const LINE_SAMPLE = Object.freeze({
  watchmans_helm: Object.freeze({
    row: Object.freeze({ n: 'Watchman\'s Helm', icon: '🛡️', v: 64800, type: 'armor', slot: 'helmet', defB: 66, armourClass: 'plate', rangeAtkB: -11, magicAtkB: -22,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_helm', attr: Object.freeze(['resist_element', 'frost']),
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'pauper_vaults', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'You take 10% less ice damage. Some of the paupers were old Havora Watch, buried in the one good thing they still owned.',
  }),
  limewashed_plate: Object.freeze({
    row: Object.freeze({ n: 'Limewashed Plate', icon: '🛡️', v: 162000, type: 'armor', slot: 'body', defB: 135, armourClass: 'plate', rangeAtkB: -23, magicAtkB: -45,
      resistPm: Object.freeze({ poison: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platebody', attr: Object.freeze(['resist_element', 'poison']),
    source: Object.freeze({ monster: 'bone_wall', ground: 'pauper_vaults', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'You take 10% less poison damage. It went into the ossuary wall with whoever wore it, and a hundred years in the lime turned it white.',
  }),
  limewashed_leg_plates: Object.freeze({
    row: Object.freeze({ n: 'Limewashed Leg Plates', icon: '🛡️', v: 118800, type: 'armor', slot: 'pants', defB: 96, armourClass: 'plate', rangeAtkB: -16, magicAtkB: -32,
      resistPm: Object.freeze({ physical: 30 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_physical', 'physical']),
    source: Object.freeze({ monster: 'bone_wall', ground: 'pauper_vaults', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'Swings, bites and arrows do 3% less to you. They came out of the same wall as the plate, still set in a crust of lime and knucklebones.',
  }),
  haulers_jerkin: Object.freeze({
    row: Object.freeze({ n: 'Hauler\'s Jerkin', icon: '🎽', v: 113400, type: 'armor', slot: 'body', defB: 75, armourClass: 'leather', rangeAtkB: 45, critB: 0.028, magicAtkB: -14,
      resistPm: Object.freeze({ poison: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawnhide_body', attr: Object.freeze(['resist_element', 'poison']),
    source: Object.freeze({ monster: 'night_carter', ground: 'pauper_vaults', how: 'rare', ch: 0.0031 }), use: 'worn',
    text: 'You take 10% less poison damage. The Night Carters carried the lime sacks on their backs, and this coat is stiff with it.',
  }),
  paupers_shroud: Object.freeze({
    row: Object.freeze({ n: 'Pauper\'s Shroud', icon: '🧥', v: 113400, type: 'armor', slot: 'body', defB: 41, armourClass: 'cloth', magicAtkB: 54, magicStrB: 36, atkB: -23, rangeAtkB: -18,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'duskweave_body', attr: Object.freeze(['resist_element', 'frost']),
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'pauper_vaults', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'You take 10% less ice damage. A gray sheet with a wooden tag still tied to it. Whoever it was is still owed a burning.',
  }),
});
