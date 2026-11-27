// src/data/grounds/carters_rest/pack.js — CARTER'S REST, Levels 110-125: the first ground of the Morrow Hills, the region after the Barrow March
// (lane/d-next-region, the designer's "2026-11-13 The Morrow Hills" on the board; Tyler 2026-11-14: "get started on the next set of lore and hunts
// after this boss"). Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new carters_rest --like wickstead --band 110,125`, then every
// row rewritten. The stat lines are the formula's (`node tools/pack.mjs propose carters_rest --write`): tier 6, floor 110, fit both.
//
// STAGED: its own map, the inn's six rooms on the Morrow Hills kit (map.js, lane/b-morrow-kit 2026-11-19). Opens with the Ox Road and both
// grounds' art and maps (board 2026-11-19).
//
// THE PLACE. Carter's Rest was the halfway inn on the road from Krell's Hold up to Morrow. Krell shut the road years ago, the carters stopped
// coming, and a family of hill trolls moved in. Harry's cart is parked in the yard, because the trolls are between him and Morrow.
// STANDING (the board's section 6): it pays the LAST EMBER. Everything here is alive and sitting on the road the next Morrow needs.
// NAMING VOICE: inn and carter words (taproom, stable, cellar, slate, sign, yard). Trolls are named for the job they took over at the inn.
// THE LESSON: trolls are Humanoid, so a sword cuts them and poison does 15% more. The Slate Thrower goes for whoever stands farthest back, the
// Stable Troll's swing is a marked hit the tank holds, and the Brewer's boiling mash lands on everyone (a Fire Lining from the March answers it).
// THE LOOT. Scarce: the tier-7 boots and legs in three weights. Rare, each about every 10-20 h: the gloves and belts (the Shop sells a glove and a belt,
// so a ground drops those only as Rares, tests/hunt-core/forest-cave.mjs shop-outfits-defense, the Hold's pattern). Lord Krell has the bodies and helms. Worn from 88, so every
// piece is wearable the hour it drops. Each body drops one imbuement item. FITTED on the floor hour's kills (tests/hunt-core/drop-tables.mjs, a lone
// tank in its full set, lane/d-morrow-grounds 2026-11-14).
import { definePack, box, gather } from '../shape.js';
import map from './map.js';

const PK = 'troll_picker', TH = 'slate_thrower', ST = 'stable_troll', BR = 'troll_brewer', LL = 'the_landlord';

export default definePack({
  id: 'carters_rest',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at a pull of 4 (the first four of each box): 10 Pickers, 5 Stable Trolls, 4 Slate Throwers, 4 Brewers, 1 Landlord. */
  hunt: {
    name: 'Carter\'s Rest', theme: 'This was the halfway inn on the road to Morrow. Trolls moved in when the carters stopped coming.',
    band: [110, 125],
    spawns: [{ monster: PK, w: 10, rarity: 'common' }, { monster: ST, w: 5, rarity: 'uncommon' }, { monster: TH, w: 4, rarity: 'uncommon' },
      { monster: BR, w: 4, rarity: 'uncommon' }, { monster: LL, w: 1, rarity: 'rare' }],
    family: 'Troll', art: PK, travelS: 0, pull: 4, respawnMs: 60000,
    /* THE FACTION FIELDS (the board's section 6, spec only until the faction lane builds the settle hook). */
    region: 'morrow_hills', standingFor: 'last_ember',
  },
  ground: {
    map: 'carters_rest',
    /* the road in from Krell's Hold, by Harry's cart */
    start: [[28, 38], [27, 38], [29, 38], [28, 39]],
    pockets: [
      /* P0 the Yard: Pickers going through the last wagon. The soft door */
      box([16, 14, 41, 21], [28, 17], [PK, PK], [TH, PK, PK, BR, PK, PK]),
      /* P1 the Stable: a Stable Troll asleep in the straw and a Picker in the tack room */
      box([3, 6, 12, 16], [8, 11], [ST, PK], [PK, ST, PK, TH, PK, ST]),
      /* P2 the Roof: Slate Throwers up top, pulling the inn apart to throw it */
      box([13, 24, 20, 33], [17, 28], [TH, PK], [TH, PK, ST, PK, TH, PK]),
      /* P3 the Brewhouse: the Brewers and their kettles */
      box([44, 6, 54, 18], [49, 12], [BR, BR], [PK, ST, BR, PK, TH, PK]),
      /* P4 the Taproom: a Stable Troll at the bar and a Thrower on the stairs */
      box([23, 25, 34, 33], [28, 29], [ST, TH], [BR, PK, ST, PK, TH, PK]),
      /* P5 the Cellar: the Landlord sits on the last of the ale. The hardest pull and the rare carrier */
      box([37, 25, 44, 33], [40, 29], [LL, PK], [ST, BR, TH, PK, ST, PK]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands): two coal seams in the Cellar, standing in for a Dawnstone Vein
       (gathering.js dawnstone_rock, Mining 90, has no node kind or sprite yet; the Night Shift gets the first real one). refKillMs the Hold's. */
    gather: gather(12000, [['coal_rock', 44, 27, 5], ['coal_rock', 37, 32, 5]]),
  },
  monsters: {
    troll_picker: {
      name: 'Troll Picker', icon: '🧌', tier: 6, level: 111, cls: 'humanoid', family: 'Troll', speed: 3400,
      role: 'swarm',
      /* the swarm: the young ones, going through the inn's rooms and the last wagon for anything that shines. Humanoid, no override. */
      drops: [{ id: 'bones', everyHours: 0.0322, ch: 0.5, band: 'common' }, { id: 'troll_hide', everyHours: 0.0536, ch: 0.3, band: 'common' }, { id: 'pewter_spoon', everyHours: 0.2011, ch: 0.08, band: 'uncommon' },
        { id: 'ember_boots', everyHours: 1.24, ch: 0.013, band: 'scarce' }, { id: 'dragonhide_boots', everyHours: 1.24, ch: 0.013, band: 'scarce' }, { id: 'archmage_boots', everyHours: 1.24, ch: 0.013, band: 'scarce' }],
      hp: 160, atk: 107, aim: 108, evasion: 42, def: 4, xp: 1451, gp: [24, 70], formula: true },
    slate_thrower: {
      name: 'Slate Thrower', icon: '🧌', tier: 6, level: 114, cls: 'humanoid', family: 'Troll', speed: 3000,
      role: 'shooter',
      /* the glass: a lanky troll on the roof, throwing slates from 5 tiles at whoever stands farthest back (`range`) */
      range: 5,
      drops: [{ id: 'bones', everyHours: 0.06671, ch: 0.482, band: 'common' }, { id: 'troll_hide', everyHours: 0.111, ch: 0.29, band: 'common' }, { id: 'roof_slate', everyHours: 0.4167, ch: 0.0772, band: 'uncommon' },
        { id: 'ember_gauntlets', everyHours: 15.15, ch: 0.00212, band: 'rare' }, { id: 'dragonhide_gloves', everyHours: 15.15, ch: 0.00212, band: 'rare' }, { id: 'archmage_gloves', everyHours: 15.15, ch: 0.00212, band: 'rare' }],
      hp: 154, atk: 142, aim: 150, evasion: 43, def: 5, xp: 1694, gp: [23, 68], formula: true },
    stable_troll: {
      name: 'Stable Troll', icon: '🧌', tier: 6, level: 117, cls: 'humanoid', family: 'Troll', speed: 2400,
      role: 'brute',
      /* the heavy: the big one that sleeps in the stable and swings the water trough */
      spells: ['trough_swing'],
      drops: [{ id: 'big_bones', everyHours: 0.0724, ch: 0.5, band: 'common' }, { id: 'troll_hide', everyHours: 0.0724, ch: 0.5, band: 'common' }, { id: 'stable_bit', everyHours: 0.4526, ch: 0.08, band: 'uncommon' },
        { id: 'ember_platelegs', everyHours: 1.094, ch: 0.0331, band: 'scarce' }, { id: 'dragonhide_pants', everyHours: 1.094, ch: 0.0331, band: 'scarce' }, { id: 'archmage_pants', everyHours: 1.094, ch: 0.0331, band: 'scarce' }],
      hp: 253, atk: 106, aim: 96, evasion: 65, def: 28, xp: 2578, gp: [37, 112], formula: true },
    troll_brewer: {
      name: 'Troll Brewer', icon: '🧌', tier: 6, level: 119, cls: 'humanoid', family: 'Troll', speed: 3000,
      role: 'caster',
      /* the regular: she kept the inn's kettles going and throws the boiling mash over everyone */
      spells: ['boiling_mash'],
      drops: [{ id: 'bones', everyHours: 0.09999, ch: 0.483, band: 'common' }, { id: 'coal', everyHours: 0.09998, ch: 0.483, band: 'common' }, { id: 'coal_tongs', everyHours: 0.6247, ch: 0.0773, band: 'uncommon' }],
      hp: 214, atk: 134, aim: 130, evasion: 49, def: 10, xp: 1996, gp: [31, 95], formula: true },
    the_landlord: {
      name: 'The Landlord', icon: '🧌', tier: 6, level: 123, cls: 'humanoid', family: 'Troll', speed: 2800,
      role: 'brute',
      /* the elite and the rare carrier: the biggest troll, in the innkeeper's apron, sitting on the cellar. He has the last ore wagon's Dawnstone. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'dawnstone_ore', everyHours: 0.9998, ch: 0.29, band: 'common' }, { id: 'cellar_tally', everyHours: 3, ch: 0.0966, band: 'uncommon' },
        { id: 'ember_belt', everyHours: 62.48, ch: 0.00464, band: 'rare' }, { id: 'dragonhide_belt', everyHours: 62.48, ch: 0.00464, band: 'rare' }, { id: 'archmage_belt', everyHours: 62.48, ch: 0.00464, band: 'rare' }],
      hp: 354, atk: 138, aim: 133, evasion: 74, def: 39, xp: 3847, gp: [52, 156], formula: true },
  },
  roster: { troll_picker: 'swarm', slate_thrower: 'glass', stable_troll: 'heavy', troll_brewer: 'regular', the_landlord: 'elite' },
  /* THE PARTS (src/data/imbuements.js's rule: one a body, its book value from its dropper's Level, raw): what an Artificing hero makes an
     imbuement from once an imbuement row names it (src/data/imbue-rules.js), and what a step bench takes (drop-hours.js made.part). */
  items: {
    pewter_spoon: { n: 'Pewter Spoon', icon: '🥄', v: 222, raw: true, part: true },
    roof_slate: { n: 'Roof Slate', icon: '🪨', v: 228, raw: true, part: true },
    stable_bit: { n: 'Stable Bit', icon: '🐴', v: 234, raw: true, part: true },
    coal_tongs: { n: 'Coal Tongs', icon: '🔥', v: 238, raw: true, part: true },
    cellar_tally: { n: 'Cellar Tally', icon: '🪵', v: 246, raw: true, part: true },
  },
  itemText: {
    pewter_spoon: 'One of the inn\'s good spoons. The trolls took every one of them and don\'t know what they\'re for',
    roof_slate: 'A slate off the inn\'s roof. The trolls throw them at whoever\'s standing farthest back',
    stable_bit: 'A horse\'s bit from the stable. There haven\'t been horses here since Krell closed the road',
    coal_tongs: 'One of Krell\'s priests came through here carrying a live coal in these. The trolls kept the tongs',
    cellar_tally: 'The innkeeper\'s tally stick for the cellar. The Landlord can\'t read it, and he won\'t give it up',
  },
  /* Trough Swing: Lash Sweep's numbers. Boiling Mash: 24 s, not Blasting Charge's 32, so a Fire Lining is worth wearing here */
  spells: {
    trough_swing: { n: 'Trough Swing', shape: 'cone', len: 2, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 1000, element: null },
    boiling_mash: { n: 'Boiling Mash', shape: 'group', range: 6, windupMs: 2000, cdMs: 24000, hitPm: 1000, element: 'ember' },
  },
  /* THE BAG: the Hold's store food and the fire rune (Humanoid: poison does 15% more, a caster may swap). */
  /* THE COUNTS, MEASURED (lane/d-late-nearmisses' rule, re-measured on v0.2.139 by lane/d-late-items-rescue). A bag is BAG_TARGET_HOURS (3) of
     its style's eating, a lone hero at the floor on Normal in the uniques kit (tools/balance-sim/gear.mjs, the four late grounds open), Salted
     Lobster an hour turned into Cooked Lobster (300 HP to the store's 216), to the nearest 5: Melee the median of the four Melee ways, Ranged
     the mean of bow and crossbow, Magic 10 (a caster eats none alone, so 10 for a stray pull).
     Measured: the full grade --uniques, eats an hour tank 10.8, hammer 78.3, sword 82.5, axes 107.3, bow 20.3, crossbow 7.7, casters 0; Melee 80.4 =
     175, Ranged 14.0 = 30. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 175 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 30 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 10 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE XP FIT AND PARTY LEVEL XP (lane/d-morrow-grounds 2026-11-14, the Hold's method; quick grade, 1 seed x 1 h, every Barrow March and Morrow pack open
     on the ladder). The median lone way read 1.08 / 1.04 of the contract at the floor and middle, so 0.96. A four of four classes read 0.54 / 0.51 of it and a
     tank and Healer 0.79 / 0.74, so the four 1000 x 1.20 / 0.523 = 2295, the pair 1000 x 1.10 / 0.764 = 1440, the cells between at the Hold's proportions. */
  xpFit: { k: 0.96, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* (Its own party cells are retired: one party table for every ground, Tyler 2026-11-16, src/data/party-class-xp.js.) */
  /* MEASURED (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, 2026-11-14): one class is the mean of its five one-class parties,
     two of two the mean of three duos, three of three of two trios, four of four the one played, the cells between the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-45, -10], 3: [-55, -25, -20], 4: [-65, -40, -35, -35] }, dangerous: { 2: [-35, 10], 3: [-35, 5, 10], 4: [-50, -15, -10, -10] }, deadly: { 2: [-30, 20], 3: [-30, 15, 20], 4: [-45, -10, -5, -5] } },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 22472 },
  map,
});
