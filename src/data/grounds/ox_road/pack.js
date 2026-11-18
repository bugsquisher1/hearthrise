// src/data/grounds/ox_road/pack.js — THE OX ROAD, Levels 112-128: the Morrow Hills' second ground, the first that pays the First Flame
// (lane/d-morrow-grounds, the designer's "2026-11-14 The Morrow Hills" on the board, section 5 row 2). Shape: src/data/grounds/shape.js.
// Started from `node tools/pack.mjs new ox_road --like wickstead --band 112,128`, then every row rewritten. The stat lines are the
// formula's (`node tools/pack.mjs propose ox_road --write`): tier 6, floor 112, fit both.
//
// STAGED, A SAMPLE. The map is still Wickstead's layout under a new id (map.js): the road, the wagons and the broken bridge are not drawn
// and there is no art. Nothing here is served or listed. It opens only with its own map and art, and after the full grade.
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
import { definePack, box, gather } from '../shape.js?v=0.2.138';
import map from './map.js?v=0.2.138';

const TM = 'dead_teamster', RN = 'coal_runner', OX = 'yoke_ox', DR = 'drover', WM = 'wagonmaster';

export default definePack({
  id: 'ox_road',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at a pull of 4 (the first four of each box): 10 Teamsters, 4 Coal Runners, 5 Yoke Oxen, 4 Drovers, 1 Wagonmaster. */
  hunt: {
    name: 'The Ox Road', theme: 'The last wagons out of Morrow got stuck here when Krell shut the road. Gault got the drivers and their oxen back up.',
    band: [112, 128],
    spawns: [{ monster: TM, w: 10, rarity: 'common' }, { monster: OX, w: 5, rarity: 'uncommon' }, { monster: RN, w: 4, rarity: 'uncommon' },
      { monster: DR, w: 4, rarity: 'uncommon' }, { monster: WM, w: 1, rarity: 'rare' }],
    family: 'Undead', art: TM, travelS: 0, pull: 4, respawnMs: 60000,
    /* THE FACTION FIELDS (the board's section 6, spec only until the faction lane builds the settle hook): the region, and the side that
       earns standing here. Morrow's grounds alternate, Last Ember on 1, 3, 5 and First Flame on 2, 4, 6 (Tyler 2026-11-14). */
    region: 'morrow_hills', standingFor: 'first_flame',
  },
  ground: {
    map: 'ox_road',
    /* the road up from Carter's Rest, by Holly's Vigil (her brazier and wood stack) */
    start: [[1, 20], [1, 19], [2, 20], [1, 21]],
    pockets: [
      /* P0 the Turnout: dead teamsters standing by the first stopped wagon. The soft door */
      box([6, 13, 21, 26], [15, 19], [TM, TM], [RN, TM, TM, OX, TM, TM]),
      /* P1 the Yoke: a Yoke Ox still in its harness and the teamster who drove it */
      box([4, 2, 22, 9], [14, 5], [OX, TM], [TM, DR, TM, RN, TM, OX]),
      /* P2 the Coal Path: the short cut up the hill, where Gault's runners carry fire between his camps */
      box([36, 2, 55, 11], [46, 6], [RN, TM], [RN, TM, OX, TM, RN, TM]),
      /* P3 the Broken Bridge: a Drover and his ox at the bridge the wagons couldn't cross */
      box([38, 16, 57, 25], [48, 20], [DR, OX], [TM, OX, DR, TM, RN, TM]),
      /* P4 the Wagon Line: the long row of stopped wagons, a Drover walking it and a runner with him */
      box([36, 29, 55, 37], [45, 33], [DR, RN], [OX, TM, DR, TM, RN, TM]),
      /* P5 the Lead Wagon: the Wagonmaster on the box of the first wagon, sitting on the Dawnstone. The hardest pull */
      box([4, 29, 22, 37], [13, 33], [WM, TM], [OX, DR, RN, TM, OX, TM]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands): two coal seams on the Coal Path, where Gault's runners fill their
       tins. refKillMs the Hold's. */
    gather: gather(12000, [['coal_rock', 40, 3, 2], ['coal_rock', 51, 3, 2]]),
  },
  monsters: {
    dead_teamster: {
      name: 'Dead Teamster', icon: '💀', tier: 6, level: 113, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm: the men who drove the ore wagons. They died with the road shut and they still walk beside their teams. Undead, no
         override. The wagons' axes, and now and then a bow. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'wagon_pin', ch: 0.08, band: 'uncommon' },
        { id: 'dawn_hatchets', ch: 0.02, band: 'scarce' }, { id: 'duskwood_bow', ch: 0.00104, band: 'rare' }],
      hp: 148, atk: 99, baseAcc: 0.94, def: 51, xp: 1517, gp: [22, 65], formula: true },
    coal_runner: {
      name: 'Coal Runner', icon: '🔥', tier: 6, level: 116, cls: 'human', family: 'Human', speed: 3000,
      /* the glass: one of Gault's living runners, carrying live coals in a tin from one of his fires to the next. He throws one at you, and
         it splashes the tiles around where it lands (Hot Coal, `spells`). Human, no override. Gault's caster pieces: the wand and the codex. */
      spells: ['hot_coal'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'runners_tin', ch: 0.08, band: 'uncommon' },
        { id: 'duskwood_wand', ch: 0.026, band: 'scarce' }, { id: 'duskwood_codex', ch: 0.00256, band: 'rare' }],
      hp: 143, atk: 131, baseAcc: 0.45, def: 53, xp: 1777, gp: [21, 63], formula: true },
    yoke_ox: {
      name: 'Yoke Ox', icon: '🐂', tier: 6, level: 119, cls: 'undead', family: 'Undead', speed: 2400,
      /* the heavy: a dead ox still in its yoke, dragging a wagon. It puts its head down and runs straight through whoever it's facing and
         everyone lined up behind them (Trample, a marked line, `spells`). Undead, no override. What's in its wagon: the warhammer, and now and then a crossbow. */
      spells: ['trample'],
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.5, band: 'common' }, { id: 'ox_shoe', ch: 0.08, band: 'uncommon' },
        { id: 'dawn_warhammer', ch: 0.038, band: 'scarce' }, { id: 'duskwood_crossbow', ch: 0.00256, band: 'rare' }],
      hp: 234, atk: 97, baseAcc: 1.04, def: 78, xp: 2694, gp: [34, 104], formula: true },
    drover: {
      name: 'Drover', icon: '🦯', tier: 6, level: 121, cls: 'human', family: 'Human', speed: 3000,
      /* the regular: Gault's living man who walks the dead teams up the road. He jabs a fallen one with his goad, says the words, and it gets
         back up a bit healthier (Goad, a mend, `spells`). Kill him first, or kill the ox first. Human, no override. The staff off his wagon. */
      spells: ['goad'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'dawnstone_ore', ch: 0.2, band: 'common' }, { id: 'drovers_goad', ch: 0.08, band: 'uncommon' },
        { id: 'duskwood_staff', ch: 0.045, band: 'scarce' }],
      hp: 198, atk: 124, baseAcc: 0.64, def: 60, xp: 2086, gp: [29, 87], formula: true },
    wagonmaster: {
      name: 'Wagonmaster', icon: '📜', tier: 6, level: 125, cls: 'undead', family: 'Undead', speed: 2800,
      /* the elite: the man who ran the convoy, dead on the box of the lead wagon and still holding the waybill. No trick, just the hardest
         thing on the road. Undead, no override. The lead wagon's Dawnstone and the Dawnsteel sword. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'dawnstone_ore', ch: 0.3, band: 'common' }, { id: 'waybill', ch: 0.1, band: 'uncommon' },
        { id: 'dawn_sword', ch: 0.0056, band: 'rare' }],
      hp: 327, atk: 127, baseAcc: 0.66, def: 93, xp: 4013, gp: [48, 144], formula: true },
  },
  roster: { dead_teamster: 'swarm', coal_runner: 'glass', yoke_ox: 'heavy', drover: 'regular', wagonmaster: 'elite' },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, tier and book value from its dropper's Level, raw): one of each of the five kinds. */
  items: {
    wagon_pin: { n: 'Wagon Pin', icon: '📌', v: 226, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    runners_tin: { n: 'Runner\'s Tin', icon: '🥫', v: 232, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    ox_shoe: { n: 'Ox Shoe', icon: '🔩', v: 238, raw: true, imbue: { kind: 'ward', tier: 3 } },
    drovers_goad: { n: 'Drover\'s Goad', icon: '🦯', v: 242, raw: true, imbue: { kind: 'keen', tier: 3 } },
    waybill: { n: 'Waybill', icon: '📜', v: 250, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
  },
  itemText: {
    wagon_pin: 'The pin that holds a wagon wheel on. The teamsters all carry spares, and their wagons still aren\'t going anywhere',
    runners_tin: 'A tin box with a live coal in it. Gault\'s runners carry fire from one of his camps to the next in these',
    ox_shoe: 'An iron shoe off a dead ox. An ox wears two on each foot, and these are worn right through',
    drovers_goad: 'A long stick with an iron point. The Drover jabs the dead with it, says the words, and they get back up',
    waybill: 'The Wagonmaster\'s list of what\'s in the wagons. Every load is Dawnsteel, and every one has Krell\'s name on it',
  },
  /* THE OX ROAD'S THREE (src/data/monster-spells.js rows; numbers start from rows that already play: Muck Fling's throw, Lash Sweep's
     strength, the Pyre Rite's mend). Measured with the ground on the grade, not tuned one at a time. */
  spells: {
    trample: { n: 'Trample', shape: 'line', len: 4, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 1000, element: null },
    hot_coal: { n: 'Hot Coal', shape: 'blast', r: 1, range: 4, windupMs: 1600, cdMs: 14000, hitPm: 1500, element: 'ember' },
    goad: { n: 'Goad', shape: 'mend', range: 4, windupMs: 1600, cdMs: 16000, hitPm: 500, element: null },
  },
  /* THE BAG: the Hold's store food, and the fire rune (three of the five are Undead, fire does 15% more). Not measured for cost. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE XP FIT AND PARTY LEVEL XP (lane/d-morrow-grounds 2026-11-14, the Hold's method; quick grade, 1 seed x 1 h, every Barrow March and Morrow pack open
     on the ladder). The median lone way read 1.16 / 1.10 of the contract at the floor and middle (the hammer 1.24, Undead), so 0.91. A four of four classes read
     0.57 / 0.53 and a tank and Healer 0.80 / 0.74, so the four 1000 x 1.20 / 0.489 = 2455, the pair 1000 x 1.10 / 0.684 = 1610, the cells between at the
     Hold's proportions. */
  xpFit: { k: 0.91, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* (Its own party cells are retired: one party table for every ground, Tyler 2026-11-16, src/data/party-class-xp.js.) */
  /* MEASURED (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, 2026-11-14): one class is the mean of its five one-class parties,
     two of two the mean of three duos, three of three of two trios, four of four the one played, the cells between the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-40, 0], 3: [-45, -10, -5], 4: [-55, -25, -20, -20] }, dangerous: { 2: [-25, 30], 3: [-20, 25, 35], 4: [-30, 15, 20, 20] }, deadly: { 2: [-15, 45], 3: [-10, 45, 55], 4: [-25, 25, 30, 35] } },
  /* BOTH HARDER TIERS BRING SIX (lane/d-flat-party-xp on set v0.2.135, 2026-11-17, Carter's Rest's reason). On the table's eight a Melee and bow pair at
     the floor earned 0.60 of the same heroes alone on Deadly; on six every Dangerous and Deadly mix stands at or over them (1.23-1.64; party-tier-xp,
     2 seeds x 0.5 h), Andy's four 1.79x the pace contract. A pair with no Healer still dies often on Deadly here: the price of the tier. */
  tierOverride: { dangerous: 6, deadly: 6, why: 'Dangerous and Deadly both bring six monsters at once here. On eight, a pair with no Healer kept dying' },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 19318 },
  map,
});
