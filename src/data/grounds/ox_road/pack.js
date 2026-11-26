// src/data/grounds/ox_road/pack.js — THE OX ROAD, Levels 112-128: the Morrow Hills' second ground, the first that pays the First Flame
// (lane/d-morrow-grounds, the designer's "2026-11-14 The Morrow Hills" on the board, section 5 row 2). Shape: src/data/grounds/shape.js.
// Started from `node tools/pack.mjs new ox_road --like wickstead --band 112,128`, then every row rewritten. The stat lines are the
// formula's (`node tools/pack.mjs propose ox_road --write`): tier 6, floor 112, fit both.
//
// STAGED, A SAMPLE. The map is layout A (Tyler's pick 2026-11-19, map.js): one long road, the train nose to tail on it, the bridge down under
// its last wagon. Its art is being drawn (lane/b-morrow-kit). Nothing here is served or listed. It opens only with its art, after the full grade.
//
// THE PLACE. When Krell shut the crossing, the last ore wagons coming down from Morrow had nowhere to go, so they stopped on the road and
// the men and oxen driving them died there. Gault got them back up. Now they haul for him, and his Drovers walk them with a goad. Those
// wagons were carrying Krell's last order of Dawnsteel arms, so the road is where the last Dawnsteel weapons are.
// STANDING (the board's section 6): it pays the FIRST FLAME. Everything here is tied to the wrong fire, the kept dead and the people who keep them.
// NAMING VOICE: carting and droving words (teamster, yoke, drover, goad, waybill, linchpin). Gault's living people are named for their job.
// THE LESSON, ONE QUESTION A CREATURE. The Yoke Ox's Trample runs through whoever it faces and everyone lined up behind them, so nobody
// stands behind the tank. The Coal Runner throws a live coal that splashes the tiles around it, so the back line spreads out. The Drover
// gets the dead back up (a mend), so he goes first, or the ox does. Three Undead (a hammer, fire does 15% more) and two living men (an
// arrow, poison does 15% more): the hammer and fire ground beside Carter's Rest's sword ground.
// THE LOOT. Every tier-7 weapon, off the wagons. Worn from 88. Scarce, about hourly a piece per hero at the floor: one a body (the rule is one),
// the hatchets, the wand, the warhammer and the staff. Rare, each about every 10-20 h: the bow, the crossbow, the sword (the Wagonmaster dies
// about 12 times an hour, too few for a Scarce pace at the band's 5% top) and the Duskwood Codex (a codex wears in the shield slot and the
// Shop sells a shield, the Hold's pattern). FITTED on the floor hour's kills (tests/hunt-core/drop-tables.mjs, a lone tank in its full set). No armor (Carter's Rest has the tier-7 boots, legs,
// gloves and belts, Lord Krell the bodies and helms). The unique pieces (board section 9) wait on Carter's Rest's sample of five. Each body
// drops one imbuement item.
import { definePack, box, gather } from '../shape.js';
import map from './map.js';

const TM = 'dead_teamster', RN = 'coal_runner', OX = 'yoke_ox', DR = 'drover', WM = 'wagonmaster';

export default definePack({
  id: 'ox_road',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at a pull of 4 (the first four of each box): 10 Teamsters, 4 Coal Runners, 5 Yoke Oxen, 4 Drovers, 1 Wagonmaster. */
  hunt: {
    name: 'The Ox Road', theme: 'The last wagons out of Morrow got stuck here when Krell shut the road. Gault got the drivers and their oxen back up.',
    band: [112, 130],   // 128 -> 130 (lane/scale-grounds-sweep, 12-targets 8.3: the Level band is the dial): at 128 the strong four could not wear Cobalt (worn from 130), so the reference read depth 18
    spawns: [{ monster: TM, w: 10, rarity: 'common' }, { monster: OX, w: 5, rarity: 'uncommon' }, { monster: RN, w: 4, rarity: 'uncommon' },
      { monster: DR, w: 4, rarity: 'uncommon' }, { monster: WM, w: 1, rarity: 'rare' }],
    family: 'Undead', art: TM, travelS: 0, pull: 4, respawnMs: 60000,
    /* THE FACTION FIELDS (the board's section 6, spec only until the faction lane builds the settle hook): the region, and the side that
       earns standing here. Morrow's grounds alternate, Last Ember on 1, 3, 5 and First Flame on 2, 4, 6 (Tyler 2026-11-14). */
    region: 'morrow_hills', standingFor: 'first_flame',
  },
  ground: {
    map: 'ox_road',
    /* the road in from Carter's Rest at the west, by Holly's Vigil (her brazier and wood stack on the north verge) */
    start: [[1, 21], [1, 20], [2, 21], [1, 22]],
    /* LAYOUT A (map.js): the pockets in route order, a lap about 87 tiles walked (the sketch's measure; Carter's Rest walks 162) */
    pockets: [
      /* P0 the Turnout: dead teamsters standing by the wagon pulled off the road south of the start. The soft door */
      box([8, 25, 19, 34], [13, 29], [TM, TM], [RN, TM, TM, OX, TM, TM]),
      /* P1 the Yoke: a wagon slewed off the road, its Yoke Ox still in the harness and the teamster who drove it */
      box([20, 26, 32, 36], [26, 31], [OX, TM], [TM, DR, TM, RN, TM, OX]),
      /* P2 the Wagon Line: the train's back half by the tipped wagon, a Drover walking it and a runner with him */
      box([33, 25, 44, 36], [38, 31], [DR, RN], [OX, TM, DR, TM, RN, TM]),
      /* P3 the Broken Bridge: a Drover and his ox at the bridge that went down under the last wagon */
      box([36, 12, 44, 20], [42, 17], [DR, OX], [TM, OX, DR, TM, RN, TM]),
      /* P4 the Coal Path: the short cut up the hill from the ford, where Gault's runners carry fire between his camps */
      box([25, 5, 35, 15], [31, 10], [RN, TM], [RN, TM, OX, TM, RN, TM]),
      /* P5 the Lead Wagon: the Wagonmaster on the box of the first wagon, sitting on the Dawnstone. The hardest pull */
      box([10, 11, 22, 19], [16, 16], [WM, TM], [OX, DR, RN, TM, OX, TM]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands): two coal seams by the Coal Path, where Gault's runners fill their
       tins. refKillMs the Hold's. Both in P4's room (the Coal Path: layout A put the path at pocket 4, the stand-in had it at 2), each on
       the map's cw_coal_seam at its tile (the node kind's full sprite). */
    gather: gather(12000, [['coal_rock', 29, 8, 4], ['coal_rock', 35, 14, 4]]),
  },
  monsters: {
    dead_teamster: {
      name: 'Dead Teamster', icon: '💀', tier: 6, level: 113, cls: 'undead', family: 'Undead', speed: 3400,
      role: 'swarm',
      /* the swarm: the men who drove the ore wagons. They died with the road shut and they still walk beside their teams. Undead, no
         override. The wagons' axes, and now and then a bow. */
      drops: [{ id: 'bones', everyHours: 0.0348, ch: 0.5, band: 'common' }, { id: 'grave_dust', everyHours: 0.058, ch: 0.3, band: 'common' }, { id: 'wagon_pin', everyHours: 0.2174, ch: 0.08, band: 'uncommon' },
        /* 0.02 to 0.0163 (lane/c-tohit-ratio, 2026-11-20): on the to-hit ratio the ground's reference group kills Teamsters faster, a Hatchets every 0.65 h a hero, under the Scarce band's 0.75;
           0.0163 to 0.0128 (lane/c-spell-rule, 2026-11-21): every cast a share of the blow, its lone tank kills faster again (0.67 h a hero) */
        { id: 'dawn_hatchets', everyHours: 1.36, ch: 0.0128, band: 'scarce' }, { id: 'duskwood_bow', everyHours: 17.75, ch: 0.00098, band: 'rare' }],
      hp: 163, atk: 109, aim: 131, evasion: 40, def: 5, xp: 1411, gp: [24, 72], formula: true },
    coal_runner: {
      name: 'Coal Runner', icon: '🔥', tier: 6, level: 116, cls: 'human', family: 'Human', speed: 3000,
      role: 'caster',
      /* the glass: one of Gault's living runners, carrying live coals in a tin from one of his fires to the next. He throws one at you, and
         it splashes the tiles around where it lands (Hot Coal, `spells`). Human, no override. Gault's caster pieces: the wand and the codex. */
      spells: ['hot_coal'],
      drops: [{ id: 'bones', everyHours: 0.0889, ch: 0.5, band: 'common' }, { id: 'coal', everyHours: 0.0889, ch: 0.5, band: 'common' }, { id: 'runners_tin', everyHours: 0.5556, ch: 0.08, band: 'uncommon' },
        { id: 'duskwood_wand', everyHours: 1.56, ch: 0.0285, band: 'scarce' }, { id: 'duskwood_codex', everyHours: 17.36, ch: 0.00256, band: 'rare' }], // the wand 0.026 -> 0.0285 (lane/d-harder-monsters 2026-11-19: a tenth more HP, fewer Runners met: 1.60 h)
      hp: 157, atk: 144, aim: 180, evasion: 40, def: 5, xp: 1648, gp: [23, 69], formula: true },
    yoke_ox: {
      name: 'Yoke Ox', icon: '🐂', tier: 6, level: 119, cls: 'undead', family: 'Undead', speed: 2400,
      role: 'brute',
      /* the heavy: a dead ox still in its yoke, dragging a wagon. It puts its head down and runs straight through whoever it's facing and
         everyone lined up behind them (Trample, a marked line, `spells`). Undead, no override. What's in its wagon: the warhammer, and now and then a crossbow. */
      spells: ['trample'],
      drops: [{ id: 'big_bones', everyHours: 0.0889, ch: 0.5, band: 'common' }, { id: 'grave_dust', everyHours: 0.08892, ch: 0.5, band: 'common' }, { id: 'ox_shoe', everyHours: 0.5556, ch: 0.08, band: 'uncommon' },
        /* 0.038 to 0.0326 (lane/c-spell-rule, 2026-11-21): the spell rule's faster lone tank read a Warhammer every 0.73 h a hero, under the band's 0.75 */
        { id: 'dawn_warhammer', everyHours: 1.363, ch: 0.0326, band: 'scarce' }, { id: 'duskwood_crossbow', everyHours: 17.36, ch: 0.00256, band: 'rare' }],
      hp: 257, atk: 107, aim: 114, evasion: 61, def: 29, xp: 2499, gp: [38, 113], formula: true },
    drover: {
      name: 'Drover', icon: '🦯', tier: 6, level: 121, cls: 'human', family: 'Human', speed: 3000,
      role: 'warder',
      /* the regular: Gault's living man who walks the dead teams up the road. He jabs a fallen one with his goad, says the words, and it gets
         back up a bit healthier (Goad, a mend, `spells`). Kill him first, or kill the ox first. Human, no override. The staff off his wagon. */
      spells: ['goad'],
      drops: [{ id: 'bones', everyHours: 0.1333, ch: 0.5, band: 'common' }, { id: 'dawnstone_ore', everyHours: 0.333, ch: 0.2, band: 'common' }, { id: 'drovers_goad', everyHours: 0.833, ch: 0.08, band: 'uncommon' },
        /* 0.045 to 0.0416 (lane/c-tohit-ratio, 2026-11-20): a Staff every 0.74 h a hero on the to-hit ratio, under the Scarce band's 0.75;
           0.0416 to 0.0328 (lane/c-spell-rule, 2026-11-21): 0.67 h a hero under the spell rule */
        { id: 'duskwood_staff', everyHours: 2.03, ch: 0.0328, band: 'scarce' }],
      hp: 218, atk: 136, aim: 153, evasion: 45, def: 10, xp: 1940, gp: [32, 96], formula: true },
    wagonmaster: {
      name: 'Wagonmaster', icon: '📜', tier: 6, level: 125, cls: 'undead', family: 'Undead', speed: 2800,
      role: 'brute',
      /* the elite: the man who ran the convoy, dead on the box of the lead wagon and still holding the waybill. No trick, just the hardest
         thing on the road. Undead, no override. The lead wagon's Dawnstone and the Dawnsteel sword. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'dawnstone_ore', everyHours: 1.333, ch: 0.3, band: 'common' }, { id: 'waybill', everyHours: 4, ch: 0.1, band: 'uncommon' },
        /* 0.0056 to 0.0049 (lane/c-spell-rule, 2026-11-21): a Sword every 9.92 h a hero under the spell rule, under the Rare band's 10 */
        { id: 'dawn_sword', everyHours: 81.6, ch: 0.0049, band: 'rare' }],
      hp: 360, atk: 140, aim: 155, evasion: 68, def: 40, xp: 3732, gp: [53, 159], formula: true },
  },
  roster: { dead_teamster: 'swarm', coal_runner: 'glass', yoke_ox: 'heavy', drover: 'regular', wagonmaster: 'elite' },
  /* THE PARTS (src/data/imbuements.js's rule: one a body, its book value from its dropper's Level, raw): what an Artificing hero makes an
     imbuement from once an imbuement row names it (src/data/imbue-rules.js), and what a step bench takes (drop-hours.js made.part). */
  items: {
    wagon_pin: { n: 'Wagon Pin', icon: '📌', v: 226, raw: true, part: true },
    runners_tin: { n: 'Runner\'s Tin', icon: '🥫', v: 232, raw: true, part: true },
    ox_shoe: { n: 'Ox Shoe', icon: '🔩', v: 238, raw: true, part: true },
    drovers_goad: { n: 'Drover\'s Goad', icon: '🦯', v: 242, raw: true, part: true },
    waybill: { n: 'Waybill', icon: '📜', v: 250, raw: true, part: true },
  },
  itemText: {
    wagon_pin: 'The pin that holds a wagon wheel on. The teamsters all carry spares, and their wagons still aren\'t going anywhere',
    runners_tin: 'A tin box with a live coal in it. Gault\'s runners carry fire from one of his camps to the next in these',
    ox_shoe: 'An iron shoe off a dead ox. An ox wears two on each foot, and these are worn right through',
    drovers_goad: 'A long stick with an iron point. The Drover jabs the dead with it, says the words, and they get back up',
    waybill: 'The Wagonmaster\'s list of what\'s in the wagons. Every load is Dawnsteel, and every one has Krell\'s name on it',
  },
  /* THE OX ROAD'S THREE (src/data/monster-spells.js rows; numbers start from rows that already play: Muck Fling's throw, Lash Sweep's
     strength, the Pyre Rite's mend). Measured with the ground on the grade, not tuned one at a time.
     HOT COAL 1350 (was 1500; lane/d-harder-monsters, 2026-11-19): the formula's blows are x1.1 since Tyler's "raise HP and damage done by all monsters
     slightly", so the Coal Runner's swing tops out at 316 (was 288), and at 1500 his coal landed 474, 38% of a bare floor hero's 1,260 HP, past the 35%
     no monster may hit at a ground's floor (designer 2026-10-21, tests/hunt-core/hunt-data.mjs blow-share). At 1350 it lands 426 (34%), where it
     stood (432): his swing takes the step, his coal holds the rule. */
  spells: {
    trample: { n: 'Trample', shape: 'line', len: 4, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 1000, element: null },
    hot_coal: { n: 'Hot Coal', shape: 'blast', r: 1, range: 4, windupMs: 1600, cdMs: 14000, hitPm: 1350, element: 'ember' },
    goad: { n: 'Goad', shape: 'mend', range: 4, windupMs: 1600, cdMs: 16000, hitPm: 500, element: null },
  },
  /* THE BAG: the Hold's store food, and the fire rune (three of the five are Undead, fire does 15% more). */
  /* THE COUNTS, MEASURED (lane/d-late-nearmisses' rule, re-measured on v0.2.139 by lane/d-late-items-rescue). A bag is BAG_TARGET_HOURS (3) of
     its style's eating, a lone hero at the floor on Normal in the uniques kit (tools/balance-sim/gear.mjs, the four late grounds open), Salted
     Lobster an hour turned into Cooked Lobster (300 HP to the store's 216), to the nearest 5: Melee the median of the four Melee ways, Ranged
     the mean of bow and crossbow, Magic 10 (a caster eats none alone, so 10 for a stray pull).
     Measured: the full grade --uniques, eats an hour tank 23.8, hammer 47.7, axes 95.5, sword 121.4, bow 11.3, crossbow 3.2, casters 0; Melee 71.6 =
     155, Ranged 7.25 = 15. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 155 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 15 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 10 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE XP FIT AND PARTY LEVEL XP (lane/d-morrow-grounds 2026-11-14, the Hold's method; quick grade, 1 seed x 1 h, every Barrow March and Morrow pack open
     on the ladder). The median lone way read 1.16 / 1.10 of the contract at the floor and middle (the hammer 1.24, Undead), so 0.91. A four of four classes read
     0.57 / 0.53 and a tank and Healer 0.80 / 0.74, so the four 1000 x 1.20 / 0.489 = 2455, the pair 1000 x 1.10 / 0.684 = 1610, the cells between at the
     Hold's proportions. */
  xpFit: { k: 0.91, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* (Its own party cells are retired: one party table for every ground, Tyler 2026-11-16, src/data/party-class-xp.js.) */
  /* MEASURED (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, 2026-11-14): one class is the mean of its five one-class parties,
     two of two the mean of three duos, three of three of two trios, four of four the one played, the cells between the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-45, 0], 3: [-55, -25, -20], 4: [-65, -45, -45, -45] }, dangerous: { 2: [-30, 20], 3: [-30, 15, 20], 4: [-40, 0, 5, 10] }, deadly: { 2: [-30, 20], 3: [-25, 20, 30], 4: [-35, 5, 10, 10] } },
  /* BOTH HARDER TIERS BRING SIX (lane/d-flat-party-xp on set v0.2.135, 2026-11-17, Carter's Rest's reason). On the table's eight a Melee and bow pair at
     the floor earned 0.60 of the same heroes alone on Deadly; on six every Dangerous and Deadly mix stands at or over them (1.23-1.64; party-tier-xp,
     2 seeds x 0.5 h), Andy's four 1.79x the pace contract. A pair with no Healer still dies often on Deadly here: the price of the tier. */
  tierOverride: { dangerous: 6, deadly: 6, why: 'Dangerous and Deadly both bring six monsters at once here. On eight, a pair with no Healer kept dying' },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 19318 },
  map,
});
