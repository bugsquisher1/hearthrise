// ============================================================================
// src/data/weapon-line.js — THE WEAPON LINE PAST DAWNSTEEL: A POWER CEILING, AND A HIDDEN SAMPLE OF FIVE UNDER IT
// (designer, lane/d-weapon-line; the design is docs/planning/PRIORITY_BOARD.md "2026-11-16 The weapon line past Dawnsteel").
//
// Tyler 2026-11-16: "yes" to a weapon line past Dawnsteel, the armor line's pattern: unique weapons past tier 7 carry damage that
// grows with the Level they are worn from (about x Level / 110), no tier 8. Tyler 2026-11-14: "after tier 7 we start getting
// unique with the itemization and it goes away from being just standard upgrades, more like tibia".
//
// A BUDGET, NOT A TEMPLATE. The line is a CEILING on a weapon's power, never a stat sheet to copy. The line's weapon at Level R
// is the Dawnsteel weapon of its family with its attack and damage times max(1, R / 110) (`lineWeapon`). Its POWER on a ground is
// what the engine's own rolls make of it there (src/core/combat.js playerCombatRolls: accuracy against each monster's defence,
// the max hit, the critical chance, the weakness and the bane), averaged over the ground's spawn by the time each kill takes
// (tools/balance-sim/weapon-power.mjs). A unique worn from R may spend that budget any way it likes (more accuracy and less max
// hit, more max hit and less accuracy, critical hits, a bane, whatever comes next), as long as on EVERY ground from the line's
// anchor up (every ground whose band starts at 110 or later) its power at Level R is at or under the line's there. So no piece
// is over the line anywhere, and each piece is under it somewhere else: that is its trade, and it's why one piece doesn't win
// every ground. tests/weapon-line.mjs measures both.
//
// WHY THE WEAPON NEEDS A LINE (the board's "2026-11-16 The late grounds, cleaned up"): a Melee hero's own blow is what falls behind
// past Dawnsteel. A lone sword at the Pauper Vaults' floor loses 92k gold an hour and its low point is 58.7 (bar 60); the what-if
// with the Melee weapons' attack and damage x R/110 cleared both reds. Accuracy is capped at 95% against most heads, so most of a
// weapon's power past 110 is its max hit. Accuracy buys power only against the hard-skinned heads (Keeper Dunn 55% -> 76%).
//
// EVERY FAMILY HAS THE LINE; THE SAMPLE IS MELEE. The bow, crossbow, wand and staff profit at every late floor and hold their low
// points, so nothing here adds one. The line still caps them for the day one ships. A wand on the line keeps the Mage under 1.3
// times a warhammer on the line (style-gear SG-8's bar), so the line can't re-open the Mage gap (lane/d-mage-110).
//
// HIDDEN. Nothing here is in ITEMS, in a monster's drops, in a catalogue or in a generator, and no src/ file imports this one, so
// the edge bundle and every served catalogue are what they were. Its readers are the grader (tools/balance-sim/gear.mjs
// STAGED_GEAR, `--uniques`), the power tool and the guard (tests/weapon-line.mjs). The build lane moves the rows into their
// catalogues when Tyler approves the sample (DESIGN_STANDARDS §9: sample, play, then expand).
//
// PURE ESM. Data only. Imports nothing.
// ============================================================================

/** The line's anchor: the Dawnsteel weapon is the curve at Carter's Rest's floor, the first ground past the last standard tier. */
export const WEAPON_LINE_ANCHOR = 110;

/* The Dawnsteel (tier 7) weapon each family's line starts from, with the numbers the line scales (gear-tiers.js WEAPON_FAMILIES
   at tier 7). Restated, never read, so this file imports nothing; tests/weapon-line.mjs WL1 holds it to the generated rows. */
export const WEAPON_LINE_BASE = Object.freeze({
  sword: Object.freeze({ id: 'dawn_sword', atkB: 42, strB: 35 }),
  hatchets: Object.freeze({ id: 'dawn_hatchets', atkB: 42, strB: 38 }),
  warhammer: Object.freeze({ id: 'dawn_warhammer', atkB: 32, strB: 68 }),
  bow: Object.freeze({ id: 'duskwood_bow', atkB: 45, strB: 36, rangeAtkB: 45, rangeStrB: 36 }),
  crossbow: Object.freeze({ id: 'duskwood_crossbow', atkB: 43, strB: 37, rangeAtkB: 43, rangeStrB: 37 }),
  wand: Object.freeze({ id: 'duskwood_wand', atkB: 42, strB: 45, magicAtkB: 42, magicStrB: 45 }),
  staff: Object.freeze({ id: 'duskwood_staff', atkB: 36, strB: 49, magicAtkB: 36, magicStrB: 49 }),
});

/** The fields the line scales: a weapon's attack and damage, in every style it carries them. */
export const LINE_FIELDS = Object.freeze(['atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB']);

/** The line's multiplier for a weapon worn from Level `reqLv`: 1 up to the anchor, then reqLv / 110 (the armor line's own). */
export const weaponLineScale = (reqLv) => Math.max(1, Number(reqLv) / WEAPON_LINE_ANCHOR);

/** The line's weapon numbers for `family` worn from Level `reqLv` (null off the table): each LINE_FIELDS number the base carries, scaled and rounded. */
export function lineWeapon(family, reqLv) {
  const b = WEAPON_LINE_BASE[family];
  if (!b) return null;
  const out = {};
  for (const k of LINE_FIELDS) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = Math.round(b[k] * weaponLineScale(reqLv));
  return out;
}

/* ── THE SAMPLE OF FIVE. Wyvern Roost's sword (its one red), and the Pauper Vaults' Melee: two swords that split one budget two
   ways, the hatchets and the warhammer. Shape as the armor line's sample: `row` is the item row as it would ship, `family` the
   line it sits under (its Dawnsteel base copies every field but its own), `attr` the special-attributes.js attribute and key,
   `spend` how it spends the budget (the identity, one line), `source` where it drops (`ch` a kill, proposed: about one every 15
   hours for a lone hero at the floor at 172 kills an hour, by the monster's share of the spawn, as the armor line's; the drop
   guard fits it when the rows go in), `use` what catalogue-coherence files it under, `text` the item card's line. Every bane
   names a class that lives on the piece's own ground. Each power and each "wins where" is measured by tests/weapon-line.mjs and
   printed by `node tools/balance-sim/weapon-power.mjs`. ── */
export const WEAPON_SAMPLE = Object.freeze({
  wagon_guards_sword: Object.freeze({
    row: Object.freeze({ n: 'Wagon Guard\'s Sword', icon: '⚔️', v: 40910, type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB: 43, strB: 32,
      bane: Object.freeze({ class: 'dragon', mult: 1.1 }), effects: Object.freeze(['bane']), rarity: 'unique', tier: 7, reqSkill: 'level', reqLv: 125 }),
    family: 'sword', attr: Object.freeze(['bane', 'dragon']),
    spend: 'all of it on wyverns: the line\'s blow on the Roost, under Dawnsteel anywhere else',
    source: Object.freeze({ monster: 'brood_wyvern', ground: 'wyvern_roost', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'It hits Dragons 10% harder. The wagon guards who rode the pass ground their swords thin to slip under a wyvern\'s scales. One of them is still up in the nest.',
  }),
  watchmans_sword: Object.freeze({
    row: Object.freeze({ n: 'Watchman\'s Sword', icon: '⚔️', v: 54000, type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB: 84, strB: 46,
      bane: Object.freeze({ class: 'human', mult: 1.1 }), effects: Object.freeze(['bane']), rarity: 'unique', tier: 7, reqSkill: 'level', reqLv: 165 }),
    family: 'sword', attr: Object.freeze(['bane', 'human']),
    spend: 'precise: a third more accuracy than the line and an eighth less damage, for the hard-skinned heads and the men',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'pauper_vaults', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'It hits Humans 10% harder. The Havora Watch carried these against the town\'s thieves, and the Watchmen buried down here took theirs with them.',
  }),
  limewashed_sword: Object.freeze({
    row: Object.freeze({ n: 'Limewashed Sword', icon: '⚔️', v: 54000, type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB: 50, strB: 45,
      critB: 0.1, rarity: 'unique', tier: 7, reqSkill: 'level', reqLv: 165 }),
    family: 'sword', attr: Object.freeze(['crit', null]),
    spend: 'keen: under the line\'s accuracy and damage, and one blow in ten more lands critical, for the soft heads',
    source: Object.freeze({ monster: 'bone_wall', ground: 'pauper_vaults', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'It lands a critical hit 10% more often. A hundred years in the ossuary lime ate its edge rough, and a rough edge bites deep.',
  }),
  hoist_hooks: Object.freeze({
    row: Object.freeze({ n: 'Hoist Hooks', icon: '⚔️', v: 54000, type: 'weapon', slot: 'weapon', weaponType: 'axe', atkB: 63, strB: 47,
      bane: Object.freeze({ class: 'undead', mult: 1.1 }), effects: Object.freeze(['bane']), twoHanded: true, rarity: 'unique', tier: 7, reqSkill: 'level', reqLv: 165 }),
    family: 'hatchets', attr: Object.freeze(['bane', 'undead']),
    spend: 'the line\'s accuracy and less damage, paid back on the dead',
    source: Object.freeze({ monster: 'night_carter', ground: 'pauper_vaults', how: 'rare', ch: 0.0031 }), use: 'worn',
    text: 'It hits the Undead 10% harder. The Night Carters dragged the dead up the hoist shaft on these, and some of the dead didn\'t want to go.',
  }),
  dunns_mallet: Object.freeze({
    row: Object.freeze({ n: 'Dunn\'s Mallet', icon: '🔨', v: 59400, type: 'weapon', slot: 'weapon', weaponType: 'hammer', atkB: 72, strB: 92,
      bane: Object.freeze({ class: 'construct', mult: 1.1 }), effects: Object.freeze(['bane']), twoHanded: true, rarity: 'unique', tier: 7, reqSkill: 'level', reqLv: 165 }),
    family: 'warhammer', attr: Object.freeze(['bane', 'construct']),
    spend: 'a hammer that lands: half again the line\'s accuracy and a tenth less damage, and the walls of bone break',
    source: Object.freeze({ monster: 'keeper_dunn', ground: 'pauper_vaults', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'It hits Constructs 10% harder. The Keepers packed the old bones into the walls with it to make room for the new dead, and Keeper Dunn never put it down.',
  }),
});
