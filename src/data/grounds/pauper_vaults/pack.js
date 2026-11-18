// src/data/grounds/pauper_vaults/pack.js — THE PAUPER VAULTS, Levels 165-185: the vaults deep under Havora's Great Hearth (lane/d-catacombs,
// the designer's "2026-11-15 The Pauper Vaults" on the board; Tyler 2026-11-14: "one of my favorite hunts in tibia is called 'catacombs' i would
// like a hunt like that", what he loves is "the map/atmosphere/rooms etc", "a later on hunt deep underneath havora or something"). Shape:
// src/data/grounds/shape.js. Started from `node tools/pack.mjs new pauper_vaults --like wickstead --band 165,185`, then every row rewritten and the
// map drawn new (map.js: six rooms, corridors, one plank bridge, cellar light). The stat lines are the formula's (`node tools/pack.mjs propose
// pauper_vaults --write`): tier 6, floor 165, fit both.
//
// STAGED, A SAMPLE OF FIVE. No art (the map stands on a stand-in ground and Greenhaven kit props). Nothing here is served or listed. It opens only
// with its painted ground and pieces, and after the full grade.
//
// THE PLACE. One hard winter more people died in Havora than there was wood to burn. The Keepers carried the rest down under the Great Hearth,
// wrote every name in a book and promised to burn them in the spring. Wood stayed dear, the book got longer every bad winter, and one year a
// Keeper locked the door and stayed down there with them. Years later the Night Carters dug in from the Sewer side and sold the unburned dead
// up the north road by the cartload. The ones they didn't get to are still waiting.
// HAVORA IS NEUTRAL (Tyler 2026-11-14), and so is this ground: no `region` or `standingFor`. Whether it pays standing is Tyler's call (the board).
// NAMING VOICE: the Keepers' words and the Carters' (owed, tag, tally, candle, gallery, bier, hoist, sack, lime). Plain, never Ancient, Shadow,
// Dark, Eternal, Void or Forgotten. American spelling. Who each body is, in one line: the Paupers are the town's unburned dead, the Bone Walls are
// the old bones the Keepers set in lime to make room, the Leeches came in with the river, the Night Carters are the men who sold the dead, and
// Keeper Dunn is the Keeper who stayed.
// THE LESSON. Fire and the hammer. The Paupers and Keeper Dunn are Undead (a hammer breaks them, fire does 15% more), and every room teaches one
// thing more: the Bone Wall is lime and bone, so fire does 25% less and ice 15% more (keep an ice slot), and its Bone Slide is a marked ring round
// it (the tank holds, everyone else steps off); the Leech is soft (a blade opens it); the Night Carter is a living man (an arrow drops him) who
// throws a sack of lime over the whole party; Keeper Dunn snuffs the candles and the cold hits everyone. Kill him first.
// Weak-to at a pull of 4: 18 heads to a hammer (13 Paupers, 4 Bone Walls, Dunn), 3 to a blade, 3 to an arrow.
// THE LOOT. No standard gear: Dawnsteel is the last tier (Tyler 2026-11-14), and Carter's Rest, the Ox Road and Lord Krell drop all of it. The
// Vaults' rare unique pieces (the board's section 6) wait on Carter's Rest's sample of five, as Wyvern Roost's do. Until then it pays in coin,
// Hearth fuel that a Level 165 hero burns (Bones, Big Bones, Bone Chips, Grave Dust), the Carters' gold bars, one imbuement item a body (one of
// each kind), and the Leech's Live Leech for the shop. The odds are the band's (no gear to fit).
// DUNN'S CANDLE, the ground's named Hearth fuel and Dunn's Rare (the board's section 6), is NOT a row yet: a Rare is revealed with its own pixel
// icon (tests/hunt-core/drop-tables.mjs loot-structure), and the icon is owed art. It comes in with its icon, as the pack's `fuel` (shape.js):
// { item: 'dunns_candle', xp: 12000, req: 70, flame: 'tallow', secs: 120, chunk: 'fuel_dunns_candle' }, a Rare row at 0.0067 a Dunn kill.
import { definePack, box, gather } from '../shape.js?v=0.2.139';
import map from './map.js?v=0.2.139';

const PA = 'shrouded_pauper', LE = 'vault_leech', BW = 'bone_wall', CA = 'night_carter', DU = 'keeper_dunn';

export default definePack({
  id: 'pauper_vaults',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at a pull of 4 (the first four of each box): 13 Paupers, 4 Bone Walls, 3 Leeches, 3 Night Carters, 1 Dunn. */
  hunt: {
    name: 'The Pauper Vaults', theme: 'The dead Havora couldn\'t afford to burn were put down here to wait. They\'re still waiting.',
    band: [165, 185],
    spawns: [{ monster: PA, w: 13, rarity: 'common' }, { monster: BW, w: 4, rarity: 'uncommon' }, { monster: LE, w: 3, rarity: 'uncommon' },
      { monster: CA, w: 3, rarity: 'uncommon' }, { monster: DU, w: 1, rarity: 'rare' }],
    family: 'Undead', art: PA, travelS: 0, pull: 4, respawnMs: 60000,
    /* under Havora, painted from the Greenhaven kit (region-kits.js): a region before Krell's, so it pays no side (neutral; shape.js REGIONS) */
    region: 'greenhaven',
  },
  /* THE ROUTE (map.js): in down the Night Carters' tunnel, the Cut, the Long Gallery, the Bone Room, the Flooded Vault, over the plank bridge to
     the Keepers' Room, west to the Loading Vault, and back up the hoist shaft to the Cut. */
  ground: {
    map: 'pauper_vaults',
    /* in the Carters' tunnel, one tile a seat */
    start: [[3, 1], [2, 1], [4, 1], [3, 2]],
    pockets: [
      /* P0 the Carters' Cut: where they broke through the vault wall. A Carter and the Paupers he was hauling. The soft door */
      box([2, 5, 15, 13], [9, 9], [CA, PA], [PA, PA, LE, PA, CA, PA]),
      /* P1 the Long Gallery: the candles at the foot of the wall, and the Paupers walking it. A Bone Wall come loose from the far end */
      box([24, 3, 52, 9], [38, 6], [PA, PA], [PA, BW, PA, LE, PA, PA]),
      /* P2 the Bone Room: the ossuary. The walls get up. The ice rune's room */
      box([44, 13, 57, 24], [50, 18], [BW, PA], [BW, PA, PA, CA, BW, PA]),
      /* P3 the Flooded Vault: the lowest vault, where the river seeps in. The Leeches' room, in the dark */
      box([20, 14, 37, 26], [28, 19], [LE, LE], [PA, LE, PA, BW, LE, PA]),
      /* P4 the Keepers' Room: Keeper Dunn reading the Wood Book by candlelight, with the dead he keeps. The hardest pull and the rare carrier */
      box([24, 33, 44, 41], [34, 37], [DU, PA], [BW, PA, CA, PA, LE, BW]),
      /* P5 the Loading Vault: the Carters' yard under the hoist shaft, and the sacks they never carted */
      box([2, 22, 12, 38], [7, 30], [CA, CA], [PA, PA, CA, LE, PA, PA]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands): the gold seam the Carters' tunnel cut through in the Cut. They never worked
       it, because the dead paid better. refKillMs the Hold's. */
    gather: gather(12000, [['gold_rock', 2, 7, 0], ['gold_rock', 2, 11, 0]]),
  },
  monsters: {
    shrouded_pauper: {
      name: 'Shrouded Pauper', icon: '🧟', tier: 6, level: 166, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: somebody's grandmother, sewn into a gray sheet and tied at the head and feet, with a wooden tag on the
         wrist. Undead, no override: a hammer breaks them, fire does 15% more. Bones and grave dust for the Hearth, and the tag. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'owing_tag', ch: 0.08, band: 'uncommon' }],
      hp: 216, atk: 140, baseAcc: 1.18, def: 80, xp: 2838, gp: [32, 95], formula: true },
    vault_leech: {
      name: 'Vault Leech', icon: '🪱', tier: 6, level: 169, cls: 'vermin', family: 'Vermin', speed: 2800,
      /* the glass: a leech as long as your arm that came in with the river and fed on the vaults for a hundred years. Vermin, one override on the
         weapon axis: it's soft, so a blade opens it (arrows still go through without much). Living and boneless, so no bones. A live leech for
         the shop, and its jaw. */
      weaponWeak: 'sword', weaponResist: ['ranged'],
      drops: [{ id: 'live_leech', ch: 0.4, band: 'common' }, { id: 'leech_jaw', ch: 0.08, band: 'uncommon' }],
      hp: 206, atk: 184, baseAcc: 0.45, def: 81, xp: 3271, gp: [30, 91], formula: true },
    bone_wall: {
      name: 'Bone Wall', icon: '💀', tier: 6, level: 173, cls: 'construct', family: 'Construct', speed: 2400,
      /* the heavy: a stretch of the ossuary, skulls and long bones the Keepers set in lime to make room, that pulled itself off the wall. A
         Construct, no override: a hammer breaks it, fire does 25% less, ice 15% more. Bone Slide is a marked ring round it as the stack comes down
         (`spells` below): the tank holds, everyone else steps off. Big Bones and Bone Chips, and a lump of the lime. */
      spells: ['bone_slide'],
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.5, band: 'common' }, { id: 'lime_mortar', ch: 0.08, band: 'uncommon' }],
      hp: 338, atk: 137, baseAcc: 1.32, def: 118, xp: 4966, gp: [50, 149], formula: true },
    night_carter: {
      name: 'Night Carter', icon: '🪝', tier: 6, level: 176, cls: 'human', family: 'Human', speed: 3000,
      /* the regular: one of the men who dug in from the Sewer side and sold the unburned dead up the north road by the cartload. Their buyer's
         gone and they're still down here. Human, no override: an arrow drops him, poison does 15% more. He throws a sack of lime over the whole
         party (Lime Sack, `spells` below). The gold he was paid in, and his hook. */
      spells: ['lime_sack'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'gold_bar', ch: 0.3, band: 'common' }, { id: 'carters_hook', ch: 0.08, band: 'uncommon' }],
      hp: 286, atk: 174, baseAcc: 0.74, def: 92, xp: 3846, gp: [42, 126], formula: true },
    keeper_dunn: {
      name: 'Keeper Dunn', icon: '🕯️', tier: 6, level: 181, cls: 'undead', family: 'Undead', speed: 2800,
      /* the elite and the rare carrier: the Keeper who locked the door from the inside and stayed. He's still reading the names out of the Wood
         Book every night and lighting a candle for each. Undead, no override. When you come in he snuffs the candles, and the cold of the deep
         vault hits everyone (Snuff the Candles, `spells` below): kill him first, or bring frost resistance. His snuffer. His candle, the Rare,
         waits on its reveal icon (the header). */
      spells: ['snuff_the_candles'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'candle_snuffer', ch: 0.1, band: 'uncommon' }],
      hp: 471, atk: 178, baseAcc: 0.76, def: 138, xp: 7366, gp: [69, 208], formula: true },
  },
  roster: { shrouded_pauper: 'swarm', vault_leech: 'glass', bone_wall: 'heavy', night_carter: 'regular', keeper_dunn: 'elite' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, tier and book value from its dropper's Level, raw): one of each of the five
     kinds. */
  items: {
    owing_tag: { n: 'Owing Tag', icon: '🏷️', v: 332, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    leech_jaw: { n: 'Leech Jaw', icon: '🦷', v: 338, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    lime_mortar: { n: 'Lime Mortar', icon: '🪨', v: 346, raw: true, imbue: { kind: 'ward', tier: 3 } },
    carters_hook: { n: 'Carter\'s Hook', icon: '🪝', v: 352, raw: true, imbue: { kind: 'keen', tier: 3 } },
    candle_snuffer: { n: 'Candle Snuffer', icon: '🔔', v: 362, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
    /* the Leech's own Common (drop-tables four-slots: a part that sells), Junk: nothing in the game uses it, the shop buys it */
    live_leech: { n: 'Live Leech', icon: '🪱', v: 60 },
  },
  itemText: {
    owing_tag: 'A wooden tag off a pauper\'s wrist. It has a name, a date, and "owed one burning"',
    leech_jaw: 'A leech\'s jaw, three rows of little teeth. They\'ve been feeding down there for a hundred years',
    lime_mortar: 'A lump of the lime the Keepers set the old bones in. The walls didn\'t stay set',
    carters_hook: 'The hook a Night Carter drags a body with. They sold the dead up the north road by the cartload',
    candle_snuffer: 'Keeper Dunn\'s snuffer. He lights a candle for every name in the book, and snuffs them out when you come in',
    live_leech: 'A leech off the vault floor, still alive. Somebody in town always buys leeches',
  },
  /* THE VAULTS' THREE (src/data/monster-spells.js rows; numbers start from rows that already play: Venom Spray's ring, Blasting Charge's group, the
     Turncoat's rare group spell scaled down). Measured with the ground on the grade, not tuned one at a time. */
  spells: {
    bone_slide: { n: 'Bone Slide', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 18000, hitPm: 2000, element: null },
    lime_sack: { n: 'Lime Sack', shape: 'group', range: 6, windupMs: 2000, cdMs: 24000, hitPm: 1000, element: 'poison' },
    snuff_the_candles: { n: 'Snuff the Candles', shape: 'group', range: 6, windupMs: 2000, cdMs: 20000, hitPm: 1500, element: 'frost' },
  },
  /* THE BAG: the Ox Road's store food, and the fire rune (18 heads in 24 are Undead or the Bone Wall). A caster keeps an ice slot for the Bone Wall
     (fire does 25% less on it). `storeFloor` (the March's rule, lane/d-march-balance): MEASURED on the quick grade (1 seed x 1 h, lane/d-catacombs
     2026-11-15), a lone tank at the floor on the start bar's Salted Shrimp died 7 times in the hour (Keeper Dunn 5, the Paupers 2) and lived on
     Salted Lobster, so Before you go names the lobster. */
  bagGuide: { tier: 4, storeFloor: 'salted_lobster',
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* PARTY LEVEL XP (the Hold's method, as Carter's Rest: quick grade, 1 seed x 1 h, the Morrow's three packs open on the ladder, lane/d-catacombs
     2026-11-15). With no row a four of four classes read 0.48 / 0.46 of the pace contract at the floor and middle and a tank and Healer 0.66 / 0.63, so
     the pair 1000 x 1.10 / 0.645 = 1705 and a first four of 2555. At 2555 the four read 1.31 / 1.26 of the median lone way (the sheet's four-xp asks
     1.15-1.25), so the four is 2555 x 0.935 = 2390 (1.22 / 1.18), the cells between at Carter's Rest's proportions. The median lone way read
     0.945 / 0.93 of the contract (the Mage 1.46, as on Carter's Rest), inside the sheet's 0.90-1.10, so no XP fit. */
  /* (Its own party cells are retired: one party table for every ground, Tyler 2026-11-16, src/data/party-class-xp.js.) */
  /* MEASURED (tests/party-class-xp-line.mjs --table --mixed on this ground alone, 3 seeds, the floor, the room as built, 2026-11-15), Carter's Rest's
     way: one class is the mean of its five one-class parties (0.69 / 0.63 / 0.52), two of two the mean of three duos (1.16), three of three of two
     trios (1.10), four of four the one played (1.08), the cells between the size's mix times the cell ratio. Whole fives. Every same-class party is
     under solo (worst 0.75, two bows). */
  partyVsAlone: { normal: { 2: [-40, 0], 3: [-45, -10, -5], 4: [-55, -25, -20, -20] }, dangerous: { 2: [0, 70], 3: [0, 60, 70], 4: [-20, 30, 35, 40] }, deadly: { 2: [-15, 40], 3: [0, 60, 70], 4: [-20, 35, 40, 45] } },
  /* THE BRIDGE (tests/hunt-core/forest-cave.mjs one-choke): the plank bridge over the deep water from the Flooded Vault to the Keepers' Room.
     THE DROP PACE'S REFERENCE (tests/hunt-core/drop-tables.mjs floor-hour): a tank and Healer in the full set. A lone tank on that guard's bar died
     in its fifth minute at the floor (the grade's lone tank on Salted Lobster lives, 0 deaths), so the pair, which holds the floor hour clean. The value
     pin is that pair's floor hour, 17,655 g a head (coin 15,642, commons 2,013, no gear), measured 2026-11-15. */
  /* BOTH HARDER TIERS BRING SIX (lane/d-flat-party-xp on set v0.2.135, 2026-11-17, Carter's Rest's reason). Its own pair cell (1705) went with the one
     table, and on the table's eight a Melee and bow pair earned 0.42 of the same heroes alone on Dangerous and 0.28 on Deadly, a tank and Healer 0.91
     on Deadly. On six every Dangerous and Deadly mix stands at or over its heroes alone (1.14-1.89; party-tier-xp, 2 seeds x 0.5 h), Andy's four 1.58x
     the pace contract. Every pair still dies often on Deadly here: the price of the tier. */
  tierOverride: { dangerous: 6, deadly: 6, why: 'Dangerous and Deadly both bring six monsters at once here. On eight, a pair kept dying' },
  checks: { bridge: [[28, 27], [28, 28], [28, 29], [28, 30], [28, 31], [28, 32]], dropRef: { roles: ['tank', 'healer'], full: true }, valueToday: 17655 },
  map,
});
