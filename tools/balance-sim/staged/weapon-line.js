// ============================================================================
// tools/balance-sim/staged/weapon-line.js — THE WEAPON LINE PAST DAWNSTEEL: A POWER CEILING, AND A HIDDEN SAMPLE OF FIVE UNDER IT
// (designer, lane/d-weapon-line; the design is docs/planning/PRIORITY_BOARD.md "2026-11-16 The weapon line past Dawnsteel").
//
// Tyler 2026-11-16: "yes" to a weapon line past Dawnsteel, the armor line's pattern: unique weapons past tier 7 carry damage that
// grows with the Level they are worn from (about x Level / 110), no tier 8. Tyler 2026-11-14: "after tier 7 we start getting
// unique with the itemization and it goes away from being just standard upgrades, more like tibia".
//
// THE LINE IS THE GAME'S GEAR CURVE (lane/c-pace, balance program 44 R10). Its formula and its anchor live in src/data/gear-curve.js and
// its Dawnsteel numbers are the family's own tier-7 sample (src/data/gear-tiers.js WEAPON_LINES), so nothing here types them again: the
// exports below are the curve's, under the names the simulator, the matrix and the guard already read.
//
// A BUDGET, NOT A TEMPLATE. The line is a CEILING on a weapon's power, never a stat sheet to copy. The line's weapon at Level R
// is the Dawnsteel weapon of its family with its attack and damage times max(1, R / 110) (`lineWeapon`). Its POWER on a ground is
// what the engine's own rolls make of it there (src/core/combat.js playerCombatRolls: accuracy against each monster's defence,
// the max hit, the critical chance, the weakness and the bane), read two ways over the ground's spawn: PACE (weighted by how long
// each head takes: kills an hour) and SAFETY (weighted again by what each head does to the hero meanwhile: the low point and the
// food bill) (tools/balance-sim/weapon-power.mjs). A unique worn from R spends that budget its own way AT THE EXCHANGE RATES (44 R11,
// src/data/gear-curve.js GEAR_EXCHANGE): what it buys (more accuracy, critical hits, a bane) is billed as a share of a blow and paid out
// of its damage, so its numbers are arithmetic, never a hand fit. The rates are the most each thing is worth on the measure, so on
// EVERY ground whose band starts at 110 or later, at Level R, the piece is at or under the line's weapon on both reads. And each must
// win somewhere: on some late ground at its Level it beats every other piece of its family a hero that Level can wear, fully tempered
// Dawnsteel included. tests/weapon-line.mjs measures all of it.
//
// WHY THE WEAPON NEEDS A LINE (the board's "2026-11-16 The late grounds, cleaned up"): a Melee hero's own blow is what falls behind
// past Dawnsteel. A lone sword at the Unmarked Catacombs' floor lost 92k gold an hour and its low point was 58.7 (bar 60). Accuracy is
// capped at 95% against most heads, so most of a weapon's power past 110 is its max hit. Accuracy buys power only against the
// hard-skinned heads (Keeper Dunn 55% -> 76%). A bane on heads that don't hurt doesn't buy safety: measured, the Catacombs' axes with
// a bane of the Undead killed as fast as the line and bottomed out 2 points lower, because the Leech and the Night Carter hit hardest.
//
// EVERY FAMILY HAS THE LINE; THE SAMPLE IS MELEE. The bow, crossbow, wand and staff profit at every late floor and hold their low
// points, so nothing here adds one. The line still caps them for the day one ships. A wand on the line keeps the Mage under 1.3
// times a warhammer on the line (style-gear SG-8's bar), so the line can't re-open the Mage gap (lane/d-mage-110).
//
// HIDDEN. Nothing here is in ITEMS, in a monster's drops, in a catalogue or in a generator, and no src/ file imports this one, so
// the edge bundle and every served catalogue are what they were. Its readers are the grader (tools/balance-sim/gear.mjs
// STAGED_GEAR, `--uniques`), the power tool and the guard (tests/weapon-line.mjs). The build lane moves the rows into their
// catalogues when Tyler approves the sample (DESIGN_STANDARDS §9: sample, play, then expand).
// WHY HERE AND NOT src/data: a hidden sample must not be imported by the game (WL2). So the sample waits with the simulator, and the
// build lane moves it into src/data; the curve and its rates already live there.
//
// ESM. It reads the game's curve and rates (src/data) and, for the one number only the engine can say (the share of a blow a weapon's
// damage makes at a Level), the engine's own roll (src/core/combat.js playerCombatRolls). It writes nothing.
// ============================================================================
import { GEAR_CURVE, curveScale, lineAt } from '../../../src/data/gear-curve.js';
import { WEAPON_FAMILIES, WEAPON_LINES, GEAR_ITEMS } from '../../../src/data/gear-tiers.js';
import { SPECIAL_ATTRIBUTES } from '../../../src/data/special-attributes.js';
import { playerCombatRolls } from '../../../src/core/combat.js';
import { deriveProfile } from '../../../src/core/member.js';
import { skillXpForLevel } from '../../../src/core/xp.js';

/** The line's anchor: the Dawnsteel weapon is the curve at Carter's Rest's floor, the first ground past the last standard tier. */
export const WEAPON_LINE_ANCHOR = GEAR_CURVE.anchor;

/* The Dawnsteel (tier 7) weapon each family's line starts from, with the numbers the line scales: the family's last sample on the curve
   (src/data/gear-tiers.js WEAPON_LINES), read, never typed. tests/weapon-line.mjs WL1 holds it to the generated rows. */
export const WEAPON_LINE_BASE = Object.freeze(Object.fromEntries(WEAPON_FAMILIES.map((fam) => {
  const line = WEAPON_LINES[fam.key], last = line.levels.length - 1;
  return [fam.key, Object.freeze({ id: fam.ids[last], [line.acc]: line.fields[line.acc][last], [line.pay]: line.fields[line.pay][last] })];
})));

/* TEMPERED DAWNSTEEL IS THE FLOOR A UNIQUE MUST CLEAR (lane/d-temper-dawnsteel, board "2026-11-16 Tempering Dawnsteel": tier 7 tempers
   5 rungs x 0.4%, so a fully tempered Dawnsteel weapon's blows read x1.02). A unique counts as winning somewhere only where it beats
   that, so the line's first unique Level is where the line clears it (`node tools/balance-sim/weapon-power.mjs` prints it per family). */
export const TEMPERED_DAWNSTEEL = 1.02;

/* THE LINE'S FIRST LEVEL by family: the lowest Level from the anchor where the line's weapon beats fully tempered Dawnsteel on every late
   ground, pace and safety (weapon-power.mjs firstLevel; tests/weapon-line.mjs WL10 re-measures it). Under it the line can't carry a
   unique: at the anchor the line IS Dawnsteel, so nothing can stay under it and beat tempered Dawnsteel anywhere. A unique whose home opens
   under its family's first Level is worn from that Level (WL5): Carter's Rest opens at the anchor, 110, so its sword is worn from 117.
   Re-measured 2026-11-20 on the to-hit ratio (lane/c-tohit-ratio, src/data/to-hit.js, weapon-power.mjs firstLevel): only the staff
   moved, 115 -> 117. */
export const WEAPON_FIRST_LEVEL = Object.freeze({ sword: 117, hatchets: 119, warhammer: 116, bow: 115, crossbow: 116, wand: 114, staff: 117 });

/** The fields the line scales: a weapon's attack and damage, in every style it carries them. */
export const LINE_FIELDS = Object.freeze(['atkB', 'strB', 'rangeAtkB', 'rangeStrB', 'magicAtkB', 'magicStrB']);

/** The line's multiplier for a weapon worn from Level `reqLv`: 1 up to the anchor, then reqLv / 110 (the game's curve, src/data/gear-curve.js). */
export const weaponLineScale = (reqLv) => curveScale(reqLv);

/** The line's weapon numbers for `family` worn from Level `reqLv` (null off the table): the curve's line at that Level, Dawnsteel's own at or under the anchor. */
export function lineWeapon(family, reqLv) {
  const line = WEAPON_LINES[family];
  return line ? lineAt(line, Math.max(Number(reqLv) || 0, WEAPON_LINE_ANCHOR)) : null;
}

/** The share of a blow the line's damage number makes for a hero of Level `level` (every combat skill at the Level, as the measure reads
    it): the engine's largest hit with the line's weapon, against the same hit with that number at 0, on a foe with no defence. */
export function blowShare(family, level) {
  const line = WEAPON_LINES[family], base = line && GEAR_ITEMS[WEAPON_LINE_BASE[family].id];
  if (!base) return null;
  const row = { ...base, ...lineWeapon(family, level) };
  const skills = { melee: skillXpForLevel('melee', level), ranged: skillXpForLevel('ranged', level), magic: skillXpForLevel('magic', level) };
  const hit = (r) => playerCombatRolls({ def: 0, tier: 1 }, { items: { w: r }, equipment: { weapon: 'w' }, skills, profile: deriveProfile(r.weaponType) }).maxHit;
  const all = hit(row);
  return (all - hit({ ...row, [line.pay]: 0 })) / all;
}

const round5 = (n) => Math.max(1, Math.round(n / 5) * 5);
const CRIT = SPECIAL_ATTRIBUTES.crit.at[7], BANE = SPECIAL_ATTRIBUTES.bane.at[7];

/** A sample row: its family's Dawnsteel row (kind, slot, hands, tier) with its own words and book, worn from `reqLv`, its numbers the line's
    budget there spent on `buy` at the exchange rates (src/data/gear-curve.js lineAt). */
export function uniqueRow(family, reqLv, buy, n) {
  const base = GEAR_ITEMS[WEAPON_LINE_BASE[family].id];
  const nums = lineAt(WEAPON_LINES[family], reqLv, { ...buy, share: blowShare(family, reqLv) });
  const row = { ...base, n, v: round5(base.v * weaponLineScale(reqLv)), ...nums, rarity: 'unique', reqLv };
  if (row.bane) { row.bane = Object.freeze(row.bane); row.effects = Object.freeze(['bane']); }
  return Object.freeze(row);
}

/* ── THE SAMPLE OF FIVE. Carter's Rest's sword, and the Unmarked Catacombs' Melee: two swords that split one budget two ways, the
   hatchets and the warhammer. Shape as the armor line's sample: `buy` what the piece spends its line's budget on (src/data/gear-curve.js
   lineAt: `accuracy` a share of the line's accuracy number, more or less; `crit` a chance; `bane` a class and multiple, each attribute at
   its tier-7 size from the special-attribute catalogue), `row` the item row as it would ship (computed from `buy`: its damage is what the
   bill leaves), `family` the line it sits under (its Dawnsteel base copies every field but its own), `attr` the special-attribute
   catalogue's attribute and key, `spend` how it spends the budget (the identity, one line), `source` where it drops (`place` its Morrow grid
   row, staged/morrow-grid.js, when it is a Morrow piece; `ch` a kill, proposed: about one every 15 hours for a lone hero at the floor at 172
   kills an hour, by the monster's share of the spawn, as the armor line's; the drop guard fits it when the rows go in), `use` what
   catalogue-coherence files it under, `text` the item card's line. Every bane names a class that lives on the piece's own ground. Each
   power and each "wins where" is measured by tests/weapon-line.mjs and printed by `node tools/balance-sim/weapon-power.mjs`.
   THE GRID WINS (the designer 2026-11-18 row 1b): the Wagon Guard's Sword left the Roost (the bow's ground) for Carter's Rest's sword cell. It
   can't keep its Dragon bane there (no dragon lives at the inn), so it went keen, chosen while the trolls still had no bane class (row 3a gave
   them their `cls`, Humanoid, src/core/bane.js classOfMonster), and it is worn from the sword's first Level, 117 (Carter's Rest opens at the anchor).
   AT THE EXCHANGE RATES (lane/c-pace, 44 R11): each `buy` is the designer's identity as it was hand-fit, re-priced by the published rates.
   Three rows came out exactly as fit; the hooks gain a point of damage (47 -> 48) and the mallet two (92 -> 94), because the fit had
   stopped short of the line. ── */
const SAMPLE = (family, reqLv, buy, n, rest) => Object.freeze({ buy: Object.freeze(buy), row: uniqueRow(family, reqLv, buy, n), family, ...rest });
export const WEAPON_SAMPLE = Object.freeze({
  wagon_guards_sword: SAMPLE('sword', 117, { accuracy: 0.05, crit: CRIT }, 'Wagon Guard\'s Sword', {
    attr: Object.freeze(['crit', null]),
    spend: 'keen: a little more accuracy than the line, a sixth less damage, and one blow in ten more lands critical',
    source: Object.freeze({ place: 'carters_rest', monster: 'the_landlord', ground: 'carters_rest', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'It lands a critical hit 10% more often. The wagon guards stopped at Carter\'s Rest on every trip, and the Landlord kept the swords of the ones who couldn\'t pay.',
  }),
  watchmans_sword: SAMPLE('sword', 165, { accuracy: 1 / 3, bane: { class: 'human', mult: BANE } }, 'Watchman\'s Sword', {
    attr: Object.freeze(['bane', 'human']),
    spend: 'precise: a third more accuracy than the line and an eighth less damage, for the hard-skinned heads and the men',
    source: Object.freeze({ monster: 'shrouded_pauper', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0007 }), use: 'worn',
    text: 'It hits Humans 10% harder. The Havora Watch carried these against the town\'s thieves, and the Watchmen buried down here took theirs with them.',
  }),
  limewashed_sword: SAMPLE('sword', 165, { accuracy: -0.2, crit: CRIT }, 'Limewashed Sword', {
    attr: Object.freeze(['crit', null]),
    spend: 'keen: under the line\'s accuracy and damage, and one blow in ten more lands critical, for the soft heads',
    source: Object.freeze({ monster: 'bone_wall', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0023 }), use: 'worn',
    text: 'It lands a critical hit 10% more often. A hundred years in the ossuary lime ate its edge rough, and a rough edge bites deep.',
  }),
  hoist_hooks: SAMPLE('hatchets', 165, { accuracy: 0.2, crit: CRIT }, 'Hoist Hooks', {
    attr: Object.freeze(['crit', null]),
    spend: 'sure and keen: a fifth more accuracy than the line and a sixth less damage, and one blow in ten more lands critical, best on the hard-skinned',
    source: Object.freeze({ monster: 'night_carter', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0031 }), use: 'worn',
    text: 'It lands a critical hit 10% more often. The Night Carters dragged the dead up the hoist shaft on these, and a hook that\'s caught doesn\'t let go.',
  }),
  dunns_mallet: SAMPLE('warhammer', 165, { accuracy: 0.375, bane: { class: 'construct', mult: BANE } }, 'Dunn\'s Mallet', {
    attr: Object.freeze(['bane', 'construct']),
    spend: 'a hammer that lands: three eighths more accuracy than the line and a twelfth less damage, and the walls of bone break',
    source: Object.freeze({ monster: 'keeper_dunn', ground: 'unmarked_catacombs', how: 'rare', ch: 0.0093 }), use: 'worn',
    text: 'It hits Constructs 10% harder. The Keepers packed the old bones into the walls with it to make room for the new dead, and Keeper Dunn never put it down.',
  }),
});
