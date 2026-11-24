// ════════════════════════════════════════════════════════════════════════
// src/data/tower-weapons.js — THE TOWER WEAPONS: WHO LEFT EACH ONE ON THE GREAT HEARTH'S LEDGE (data; names and lines only).
//   Tyler 2026-11-14: "Tower weapons" are "tradable and there are one of each type, they are tiered based on key tier", "relatively
//   close to the tiers dropped in hunting grounds BUT have a special attribute", and the attribute is "+ respective combat skill.
//   bronze +1, silver +2, gold +3, plat +4". The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" §6
//   (origin/lane/d-burning-tower). lane/d-tower-weapons builds them.
//
// WHAT A ROW IS: one key (src/data/chests.js CHEST_KEYS id), one weapon family (gear-tiers.js WEAPON_FAMILIES key), the item id, its
//   name and its one line. NOTHING ELSE IS WRITTEN HERE. Its stats are the standard weapon of its rank, read off the catalogue
//   (chests.js towerWeaponItems: the family's rung at the key's weaponTier, every number copied), its +skill is the key's skillPlus on
//   the family's own combat skill (combat.js SKILL_PLUS_FIELDS), and its source is the Hearth Chest (chests.js `weapons`). So a later key
//   is its seven rows here and nothing else.
//
// THE NAMING VOICE (the Tower's lore, LOCKED by Tyler 2026-11-14: "For a few hundred years people brought their dead to the Hearth, and
//   they'd leave the dead person's sword or bow on the ledge ... the Keepers locked them all in one big chest on the ledge, with a
//   different lock for the better ones"). Every tower weapon belonged to one of Havora's own dead, burned at the Great Hearth, so its
//   name says who: their trade, their office or their place in town, then the family's plain word (Sword, Hammer, Maul or Mallet,
//   Hatchets, Bow, Crossbow, Wand, Staff; one hearth tool that is plainly a staff, the Old Ash Rake), so the type reads from the name.
//   Each lock is one part of the town's history:
//     Bronze    the town's working dead, the trades a player walks past today (the palisade, the mill, the Westwood, the shore, the
//               orchard, the lamps, the bonesetter)
//     Silver    the old crossing, before the toll stone (the design's sample of five, plus the raft builder and the drover)
//     Gold      the Hearth's own rites, the people whose work was the dead (the bier, the passing bell, the vigil, the lychgate)
//     Platinum  the ones who built and first lit the Hearth (the first coal, the mason, the first tree felled, the first Keeper)
//   Rules: no person's name (src/data/text/people.js: an item never spells one); no Banded Company or Krell word (the March's dead were
//   never burned at the Hearth, so none of their weapons is on the ledge); no filler word (DESIGN_STANDARDS §2); at most four of a
//   key's seven are "<someone>'s <weapon>", so the shelf doesn't read as one pattern. LINES are Tyler's voice (DESIGN_STANDARDS §3):
//   who it belonged to, in one or two short plain sentences, no final period (item-descriptions.js's form).
//
// PURE ESM DATA. No imports. Node, Deno and the browser.
// ════════════════════════════════════════════════════════════════════════

const row = (key, family, id, name, line) => Object.freeze({ key, family, id, name, line });

/* In key order, then the families' order (gear-tiers.js WEAPON_FAMILIES: sword, warhammer, bow, staff, wand, hatchets, crossbow). */
export const TOWER_WEAPONS = Object.freeze([
  /* BRONZE (worn as iron is, from Level 10 since 12-targets 8.3, the Iron or Oak numbers, +1): the second batch (14 rows with Gold), after the sample's audit. */
  row('bronze', 'sword', 'palisade_sword', 'Palisade Sword', 'The night watch on Havora\'s palisade carried this one. He walked that wall for thirty years'),
  row('bronze', 'warhammer', 'millwrights_mallet', 'Millwright\'s Mallet', 'It fixed the town mill\'s wheel more times than anybody could count'),
  row('bronze', 'bow', 'fowling_bow', 'Fowling Bow', 'A light bow for ducks on the shore. Whoever owned it never missed a dinner'),
  row('bronze', 'staff', 'bonesetters_staff', 'Bonesetter\'s Staff', 'The bonesetter leaned on it on her rounds. She set half the broken arms in town'),
  row('bronze', 'wand', 'lamplighters_wand', 'Lamplighter\'s Wand', 'The lamplighter carried the Hearth\'s fire to every street lamp in Havora with it'),
  row('bronze', 'hatchets', 'westwood_hatchets', 'Westwood Hatchets', 'A woodcutter\'s pair from the Westwood. She cleared the road to the Mine with them'),
  row('bronze', 'crossbow', 'orchard_keepers_crossbow', 'Orchard-Keeper\'s Crossbow', 'The orchard keeper shot boars out of the apple trees with it'),
  /* SILVER (worn at Level 45, the Mithril or Maple numbers, +2): THE SAMPLE (CLAUDE.md §10), the design's five named on
     lane/d-burning-tower and the two it left (the hatchets and the crossbow). The audit moved two lines: the Meadowbrook and "the old
     crossing" each came up twice in seven. */
  row('silver', 'sword', 'tollkeepers_sword', 'Toll-Keeper\'s Sword', 'The toll-keeper\'s sword, from back when Havora ran the crossing itself'),
  row('silver', 'warhammer', 'quarry_maul', 'Quarry Maul', 'It broke the stone that Havora\'s town wall is made of'),
  row('silver', 'bow', 'ferrymans_bow', 'Ferryman\'s Bow', 'He ran the ferry across the Meadowbrook before there was a toll stone, and he shot pike from the boat'),
  row('silver', 'staff', 'old_ash_rake', 'Old Ash Rake', 'A hearth-hand\'s rake from long before today\'s Keeper. The hearth-hands say it\'s still better than theirs'),
  row('silver', 'wand', 'chandlers_wand', 'Chandler\'s Wand', 'The candle-maker\'s wand. It still smells like wax'),
  row('silver', 'hatchets', 'raftwright_hatchets', 'Raftwright Hatchets', 'A raft builder\'s pair. Half the ferries on the river floated on logs he cut'),
  row('silver', 'crossbow', 'drovers_crossbow', 'Drover\'s Crossbow', 'A drover\'s crossbow. He drove cattle through Havora every spring and never lost one to the wolves'),
  /* GOLD (worn at Level 75, the Emberforged or Runewood numbers, +3): the second batch, with Bronze. */
  row('gold', 'sword', 'bierguard_sword', 'Bierguard Sword', 'The guard who walked beside every bier on its way to the Hearth wore this'),
  row('gold', 'warhammer', 'passing_bell_hammer', 'Passing-Bell Hammer', 'It rang the passing bell every time somebody in Havora died'),
  row('gold', 'bow', 'vigil_bow', 'Vigil Bow', 'Somebody always sat up with the dead the night before a burning. This bow sat up with them'),
  row('gold', 'staff', 'mourners_staff', 'Mourner\'s Staff', 'The town\'s head mourner walked in front of every burning with this staff'),
  row('gold', 'wand', 'sextons_wand', 'Sexton\'s Wand', 'The sexton started the dead\'s fires with it, back when the Hearth was only a hearth'),
  row('gold', 'hatchets', 'cordwood_hatchets', 'Cordwood Hatchets', 'They split the wood for every burning at the Hearth, and nothing else'),
  row('gold', 'crossbow', 'lychgate_crossbow', 'Lychgate Crossbow', 'The dead waited at the lychgate before their burning. Its guard kept the wolves off them with this'),
  /* PLATINUM (worn at Level 88, the Dawnsteel or Duskwood numbers, +4): the third batch. "First" is the lock's theme, so it is said in two
     names and one line, not in every line. */
  row('platinum', 'sword', 'coalbearers_sword', 'Coalbearer\'s Sword', 'She carried the coal that lit the Hearth, and this sword kept her alive on the road'),
  row('platinum', 'warhammer', 'hearth_masons_maul', 'Hearth-Mason\'s Maul', 'It set every stone of the Great Hearth, and not one of them has cracked since'),
  row('platinum', 'bow', 'steeplejacks_bow', 'Steeplejack\'s Bow', 'He climbed the chimney to look for the top, long before the fire got in. He came back down with this and never said what he saw'),
  row('platinum', 'staff', 'first_keepers_staff', 'First Keeper\'s Staff', 'The Keepers\' own staff, from before anybody wrote their names down. Every Keeper since has wanted it back'),
  row('platinum', 'wand', 'kindling_wand', 'Kindling Wand', 'It lit the Great Hearth. The fire\'s been going ever since'),
  row('platinum', 'hatchets', 'firstfell_hatchets', 'Firstfell Hatchets', 'They felled the tree the Hearth burned on its first night'),
  row('platinum', 'crossbow', 'flue_watch_crossbow', 'Flue-Watch Crossbow', 'The old Keepers kept a guard at the chimney\'s mouth, and the guard kept this'),
]);

/* One line an item (src/data/item-descriptions.js spreads it). */
export const TOWER_WEAPON_DESC = Object.freeze(Object.fromEntries(TOWER_WEAPONS.map((w) => [w.id, w.line])));
