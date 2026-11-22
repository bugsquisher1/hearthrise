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
// WHY HERE AND NOT src/data: a hidden sample must not be imported by the game (AL2). So the sample waits with the simulator, and the build
// lane moves it into src/data; the curve already lives there.
//
// THE LINE IS THE GAME'S GEAR CURVE (lane/c-pace, 44 R10): its formula and anchor are src/data/gear-curve.js and its Dawnsteel armor is each
// weight and slot's own tier-7 sample (src/data/gear-tiers.js ARMOUR_CURVE_LINES), read, never typed. The sample below is as it was cut on
// the armor curve the game plays (src/data/core-model.js ARMOUR_MITIGATION); its re-cut on the designer's x2.4 (D-3) lands with that curve,
// in FB-8 stage 2.
//
// ESM. It reads the game's curve and gear rows (src/data) and writes nothing.
// ============================================================================
import { GEAR_CURVE, curveScale, lineAt } from '../../../src/data/gear-curve.js';
import { ARMOUR_CURVE_LINES, GEAR_LADDERS } from '../../../src/data/gear-tiers.js';

/** The line's anchor: Dawnsteel is the curve at Carter's Rest's floor, the first ground past the last standard tier. */
export const LINE_ANCHOR_LEVEL = GEAR_CURVE.anchor;

/** How far one of a piece's two reads (pace or safety) may go over the line's while their mean stays under it: a heavy or light piece's room. */
export const LINE_TRADE = 0.05;

/** THE LINE'S FIRST LEVEL by weight: the lowest Level whose whole line set is safer than fully tempered Dawnsteel on every late
    ground a hero of that Level is sent to (armor-power.mjs firstLevel; the guard re-measures it). Plate waits for the Roost: on
    Carter's Rest and the Ox Road Dawnsteel plate is at the cap. */
export const LINE_FIRST_LEVEL = Object.freeze({ plate: 129, leather: 120, cloth: 113 });

/* The Dawnsteel set the line starts from, by slot and weight (plate, Dawnhide leather, Duskweave cloth): each line's top rung
   (src/data/gear-tiers.js GEAR_LADDERS) and its last armor sample on the curve (ARMOUR_CURVE_LINES). tests/armor-line.mjs AL1 holds it to
   the generated rows. */
const WEIGHTS = Object.freeze(['plate', 'leather', 'cloth']);
const SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
const topOf = (key) => { const l = GEAR_LADDERS.find((x) => x.key === key); return l.ids[l.ids.length - 1]; };
const lastDef = (key) => { const c = ARMOUR_CURVE_LINES[key]; return c.fields.defB[c.levels.length - 1]; };
export const LINE_BASE = Object.freeze(Object.fromEntries(WEIGHTS.map((w) => [w, Object.freeze({
  ids: Object.freeze(Object.fromEntries(SLOTS.map((s) => [s, topOf(w + ':' + s)]))),
  defB: Object.freeze(Object.fromEntries(SLOTS.map((s) => [s, lastDef(w + ':' + s)]))),
})])));

/** The line's multiplier for a piece worn from Level `reqLv`: 1 up to the anchor, then reqLv / 110 (the game's curve, src/data/gear-curve.js). */
export const lineScale = (reqLv) => curveScale(reqLv);

/** The armor the line's piece of `slot` and `armourClass` worn from Level `reqLv` carries (null off the table): the curve's line at that
    Level, Dawnsteel's own at or under the anchor. */
export function lineArmor(slot, armourClass, reqLv) {
  const c = ARMOUR_CURVE_LINES[armourClass + ':' + slot];
  return c ? lineAt(c, Math.max(Number(reqLv) || 0, LINE_ANCHOR_LEVEL)).defB : null;
}

/* ── THE LINE BY BAND: the Levels a unique is worn from, from the Morrow Hills ladder and the Catacombs (board 2026-11-14 section 5,
   2026-11-15 the Unmarked Catacombs), and what a full set on the line wears. For the board and the wiki; every number is lineArmor's. ── */
export const LINE_BANDS = Object.freeze([
  Object.freeze({ reqLv: 110, where: 'Carter\'s Rest (Dawnsteel itself; the Ox Road opens at 112)' }),
  Object.freeze({ reqLv: 122, where: 'The Night Shift' }),
  Object.freeze({ reqLv: 125, where: 'Wyvern Roost' }),
  Object.freeze({ reqLv: 138, where: 'The Old Guard' }),
  Object.freeze({ reqLv: 145, where: 'The Bellows, Father Gault' }),
  Object.freeze({ reqLv: 165, where: 'The Unmarked Catacombs' }),
  Object.freeze({ reqLv: 185, where: 'the next region' }),
  Object.freeze({ reqLv: 200, where: 'Level 200' }),
]);

/* ── THE SAMPLE OF EIGHT: three Morrow plate pieces on their grid cells (the Night Shift's body, the Roost's legs, the Old Guard's helm)
   and the Unmarked Catacombs' five (165), one per way of spending the budget. `row` is the item row as it would ship, `base` the Dawnsteel
   piece of its slot and weight (every field but its words, numbers, Level, book and rarity is the base's), `attr` its one special attribute or
   null (the special-attribute catalogue, SPECIAL_ATTRIBUTES, tier-7 size; only one the engine reads), `spend` how it spends the budget (its
   identity, one line), `source` where it drops (`place` its Morrow grid row, staged/morrow-grid.js, for a Morrow piece, and `planned: true`
   while that place is not built: no monster to name yet, so it drops nowhere; `ch` a kill, proposed: about one every 15 hours for a lone hero
   at the floor at 172 kills an hour, by the monster's share of the spawn; the drop guard fits it when the rows go in), `use` what
   catalogue-coherence files it under, `text` the item card's line. Every element a piece resists is a spell on its own ground: Fire Breath
   (the Crag Wyvern) and, at the Catacombs, Lime Sack (poison) and Snuff the Candles (ice). Each power and each "wins where" is measured by
   tests/armor-line.mjs and printed by `node tools/balance-sim/armor-power.mjs`.
   THE GRID WINS (the designer 2026-11-18 row 1b): the three were all at the Roost (the bow's ground) to close a lone sword's Normal low point
   there. The Breastplate and the Visor moved to their Appendix A cells and were re-sized by the line to the cell's Level: the most armor that
   keeps its trade under the line on every late ground (AL3, measured), so the Breastplate is 105 at 122 (108 at 125) and the Visor 70 at 138
   (64 at 125; 71 read 1.0005 of the line at the Catacombs). The Leg Plates went to the Roost Mother and came back (row 2): the Roost's healerless
   Deadly four died 17.3 times in 16 hero-hours without them, 9.3 with the plate back, every death the tank's (the Crag Wyvern's marked Fire
   Breath), so the grid swapped the legs cells: the Roost drops legs plate, the Roost Mother legs leather (Roost Mother's Hide).
   RE-CUT ON THE TO-HIT RATIO (2398754cb made to-hit a ratio; lane/a-ci-reds-pre-wave): the same pieces read 100.07 to 100.60% of the line, because
   a Melee point no longer pays for the armor over the line (measured on the ratio: the Breastplate at atkB -8 holds only 104, at -1 or -2 it
   holds 100; the Leg Plates' strB -3 holds 99). Re-sized by the same rule, the most
   armor under the line on every late ground, each style number kept: the Breastplate 105 to 100, the Leg Plates 86 to 81, the Visor 70 to 55,
   the Watchman's Helm 84 to 67, the Limewashed Plate 130 to 128 (one point more reads 100.01 to 100.07%). The Breastplate and the Visor now sit
   AT the line's armor with their Melee cost: a heavy piece's trade has to be re-priced (strB buys armor, atkB barely does), the unique
   re-cut's job, not a sizing rule's. The Roost's healerTiers deaths were measured with the Leg Plates at 86, before the ratio. ── */
export const LINE_SAMPLE = Object.freeze({
  /* ── THE NIGHT SHIFT, 122 (not built: planned) ── */
  wagon_guards_breastplate: Object.freeze({
    row: Object.freeze({ n: 'Wagon Guard\'s Breastplate', icon: '🛡️', v: 119780, type: 'armor', slot: 'body', defB: 100, armourClass: 'plate', atkB: -1, rangeAtkB: -23, magicAtkB: -45,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 122 }),
    base: 'dawn_platebody', attr: null,
    spend: 'heavy: the line\'s armor, 10 over Dawnsteel, and a stiff shoulder takes a point off your Melee',
    source: Object.freeze({ place: 'night_shift', planned: true, how: 'rare' }), use: 'worn',
    text: 'It carries 100 armor, more than any other breastplate at Level 122, and your Melee lands a little less often in it. The wagon guards who rode out of Morrow wore these thick, and Gault put the dead ones to work in the mine, armor and all.',
  }),
  /* ── WYVERN ROOST, 125: the ground's own fire answer (row 2 swapped the legs back from the Roost Mother) ── */
  burnt_crag_leg_plates: Object.freeze({
    row: Object.freeze({ n: 'Burnt Crag Leg Plates', icon: '🛡️', v: 90000, type: 'armor', slot: 'pants', defB: 81, armourClass: 'plate', strB: -2, rangeAtkB: -16, magicAtkB: -32,
      resistPm: Object.freeze({ ember: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 125 }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_element', 'ember']),
    spend: 'fireproof and heavy: the Crag Wyvern\'s fire, more armor, and they cost you some of your swing',
    source: Object.freeze({ place: 'wyvern_roost', monster: 'crag_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'You take 10% less fire damage, and your blows land 2 lighter. They came off the Burnt Crag black, and the wyverns\' fire never got through them.',
  }),
  /* ── THE OLD GUARD, 138 (not built: planned) ── */
  outriders_visor: Object.freeze({
    row: Object.freeze({ n: 'Outrider\'s Visor', icon: '🛡️', v: 54195, type: 'armor', slot: 'helmet', defB: 55, armourClass: 'plate', atkB: -2, rangeAtkB: -11, magicAtkB: -22,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 138 }),
    base: 'dawn_helm', attr: null,
    spend: 'closed: the most armor a helm has here, and a narrow slit costs your Melee 2',
    source: Object.freeze({ place: 'old_guard', planned: true, how: 'rare' }), use: 'worn',
    text: 'It carries 55 armor and costs your Melee 2. The outriders rode ahead of the wagons with these shut against the wind on the stair, and the stone guards there still have the ones that never came back down.',
  }),
  /* ── THE UNMARKED CATACOMBS, 165 ── */
  watchmans_helm: Object.freeze({
    row: Object.freeze({ n: 'Watchman\'s Helm', icon: '🛡️', v: 64800, type: 'armor', slot: 'helmet', defB: 67, armourClass: 'plate', atkB: -1, rangeAtkB: -11, magicAtkB: -22,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_helm', attr: null,
    spend: 'heavy: a full face, 1 more armor than the line, and the narrow slit costs your Melee a point',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'It carries 67 armor, the most of any helm, and your Melee lands a little less often in it. The Havora Watch wore them shut on the night rounds, and some of the paupers were old Watch.',
  }),
  limewashed_plate: Object.freeze({
    row: Object.freeze({ n: 'Limewashed Plate', icon: '🛡️', v: 162000, type: 'armor', slot: 'body', defB: 128, armourClass: 'plate', rangeAtkB: -23, magicAtkB: -45,
      resistPm: Object.freeze({ poison: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platebody', attr: Object.freeze(['resist_element', 'poison']),
    spend: 'the lime\'s answer: under the line\'s armor, and the Night Carters\' Lime Sack does less',
    source: Object.freeze({ monster: 'bone_wall', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'You take 10% less poison damage. It went into the ossuary wall with whoever wore it, and a hundred years in the lime turned it white and sealed it against the stuff.',
  }),
  keepers_leg_plates: Object.freeze({
    row: Object.freeze({ n: 'Keeper\'s Leg Plates', icon: '🛡️', v: 118800, type: 'armor', slot: 'pants', defB: 86, armourClass: 'plate', rangeAtkB: -16, magicAtkB: -32,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawn_platelegs', attr: Object.freeze(['resist_element', 'frost']),
    spend: 'the cold\'s answer: under the line\'s armor, and Keeper Dunn\'s Snuff the Candles does less',
    source: Object.freeze({ monster: 'keeper_dunn', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'You take 10% less ice damage. The Keepers stood their watches in the cold vaults for years, and these are lined against it.',
  }),
  haulers_jerkin: Object.freeze({
    row: Object.freeze({ n: 'Hauler\'s Jerkin', icon: '🎽', v: 113400, type: 'armor', slot: 'body', defB: 69, armourClass: 'leather', rangeAtkB: 45, critB: 0.035, magicAtkB: -14,
      tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'dawnhide_body', attr: null,
    spend: 'light: damage over dodge, 6 under the line\'s armor and a quarter more critical chance than Dawnhide',
    source: Object.freeze({ monster: 'night_carter', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0031 }), use: 'worn',
    text: 'You land a critical hit 3.5% more often in it, a quarter more than a Dawnhide Body, and it carries 69 armor. The Night Carters cut their coats loose at the shoulders to swing the sacks up, and it draws a bow the same way.',
  }),
  paupers_shroud: Object.freeze({
    row: Object.freeze({ n: 'Pauper\'s Shroud', icon: '🧥', v: 113400, type: 'armor', slot: 'body', defB: 36, armourClass: 'cloth', magicAtkB: 54, magicStrB: 10, atkB: -23, rangeAtkB: -18,
      resistPm: Object.freeze({ frost: 100 }), tier: 7, rarity: 'unique', reqSkill: 'level', reqLv: 165 }),
    base: 'duskweave_body', attr: Object.freeze(['resist_element', 'frost']),
    spend: 'the cold\'s answer for a caster: a thin sheet, 5 under the line\'s ward, and Keeper Dunn\'s Snuff the Candles does less',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'You take 10% less ice damage, and it wards 36. A thin gray sheet with a wooden tag still tied to it. Whoever it was is still owed a burning.',
  }),
});
