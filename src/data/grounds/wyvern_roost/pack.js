// src/data/grounds/wyvern_roost/pack.js — WYVERN ROOST, Levels 125-142: the Morrow Hills' third ground, the second that pays the Last Ember
// (lane/d-morrow-grounds, the designer's "2026-11-14 The Morrow Hills" on the board, section 5 row 3; the name is the one kept from Tyler's
// 2026-10-14 world plan). Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new wyvern_roost --like wickstead --band 125,142`,
// then every row rewritten. The stat lines are the formula's (`node tools/pack.mjs propose wyvern_roost --write`): tier 6, floor 125, fit both.
//
// STAGED, A SAMPLE. The map is still Wickstead's layout under a new id (map.js): the crags, ledges and nests are not drawn and there is no
// art. Nothing here is served or listed. It opens only with its own map and art, and after the full grade.
//
// THE PLACE. Past the Ox Road the way to Morrow climbs through a pass, and wyverns nest on the crags over it. They were always there. Nobody
// minded while the wagons came through in a crowd, but with the road shut for years they've spread down onto the road itself.
// STANDING (the board's section 6): it pays the LAST EMBER. Everything here is alive and sitting on the pass the next Morrow is going to need.
// NAMING VOICE: plain words for what a wyvern does or where it sits (fledgling, ledge, bull, crag, brood). No "drake lord", no "wyrm".
// THE LESSON. Dragons are weak to the bow and turn a sword, so this is the bow's ground. Each wyvern asks one question: the Ledge Wyvern
// spits from 5 tiles at whoever stands farthest back (your bow reaches 7, so out-shoot it), the Bull Wyvern's Tail Sweep hits everyone
// standing next to him (melee pays for crowding him), and the Crag Wyvern's Fire Breath is a marked cone (the tank stands in it, everyone
// else steps off). Wyverns breathe fire, so fire does 25% less and ice 15% more: the caster brings ice.
// THE LOOT. No standard gear: Dawnsteel is the last tier (Tyler 2026-11-14) and Carter's Rest, the Ox Road and Lord Krell drop all of it.
// The bow's unique pieces and the Roost Mother's boss pieces (board section 9) wait on Carter's Rest's sample of five. Until then the Roost
// pays in coin, Dragon Bones (Hearth fuel, Inner Flame 35) and Dragon Scales (Hearth fuel, Inner Flame 79, and the top house tiers ask for
// them), two rows that had no source in the game. Each body drops one imbuement item. The odds are the band's (no gear to fit).
import { definePack, box, gather } from '../shape.js?v=0.2.140';
import map from './map.js?v=0.2.140';

const FL = 'wyvern_fledgling', LW = 'ledge_wyvern', BW = 'bull_wyvern', CW = 'crag_wyvern', BR = 'brood_wyvern';

export default definePack({
  id: 'wyvern_roost',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at a pull of 4 (the first four of each box): 10 Fledglings, 5 Bull, 4 Ledge, 4 Crag, 1 Brood. */
  hunt: {
    name: 'Wyvern Roost', theme: 'Wyverns nest on the crags over the road to Morrow. Bring a bow, because a sword barely scratches them.',
    band: [125, 142],
    spawns: [{ monster: FL, w: 10, rarity: 'common' }, { monster: BW, w: 5, rarity: 'uncommon' }, { monster: LW, w: 4, rarity: 'uncommon' },
      { monster: CW, w: 4, rarity: 'uncommon' }, { monster: BR, w: 1, rarity: 'rare' }],
    family: 'Dragon', art: FL, travelS: 0, pull: 4, respawnMs: 60000,
    /* THE FACTION FIELDS (the board's section 6, spec only until the faction lane builds the settle hook). */
    region: 'morrow_hills', standingFor: 'last_ember',
  },
  ground: {
    map: 'wyvern_roost',
    /* the pass road, where Harry's Camp has moved up to (his cart and fire pot) */
    start: [[1, 20], [1, 19], [2, 20], [1, 21]],
    pockets: [
      /* P0 the Scree: fledglings scrapping on the loose stone under the nests. The soft door */
      box([6, 13, 21, 26], [15, 19], [FL, FL], [LW, FL, FL, CW, FL, FL]),
      /* P1 the Ledges: Ledge Wyverns up on the rock, spitting down at the road */
      box([4, 2, 22, 9], [14, 5], [LW, FL], [LW, FL, FL, BW, FL, LW]),
      /* P2 the Bull's Shelf: a flat rock where an old bull sleeps in the sun */
      box([36, 2, 55, 11], [46, 6], [BW, FL], [FL, BW, FL, LW, FL, CW]),
      /* P3 the Burnt Crag: grown wyverns, and the rock black from their fire */
      box([38, 16, 57, 25], [48, 20], [CW, CW], [FL, BW, FL, LW, FL, CW]),
      /* P4 the Saddle: the low point of the pass, where everything crosses */
      box([36, 29, 55, 37], [45, 33], [BW, LW], [FL, CW, FL, LW, FL, FL]),
      /* P5 the Nests: a Brood Wyvern on her eggs, and her fledglings. The hardest pull */
      box([4, 29, 22, 37], [13, 33], [BR, FL], [CW, BW, FL, LW, FL, FL]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands): two gold seams in the crag under the Nests. refKillMs the Hold's. */
    gather: gather(12000, [['gold_rock', 5, 31, 5], ['gold_rock', 6, 36, 5]]),
  },
  monsters: {
    wyvern_fledgling: {
      name: 'Wyvern Fledgling', icon: '🐲', tier: 6, level: 126, cls: 'dragon', family: 'Dragon', speed: 3400,
      /* the swarm: half grown, loud and always hungry. They come off the scree in a crowd. Dragon: an arrow, not a sword. Wyverns breathe
         fire, so fire does 25% less and ice 15% more (the Dragon class sets its element per monster). */
      elements: { ember: 25, frost: -15 },
      drops: [{ id: 'dragon_bones', ch: 0.5, band: 'common' }, { id: 'eggshell', ch: 0.08, band: 'uncommon' }],
      hp: 181, atk: 120, baseAcc: 0.78, def: 58, xp: 1922, gp: [27, 79], formula: true },
    ledge_wyvern: {
      name: 'Ledge Wyvern', icon: '🐲', tier: 6, level: 130, cls: 'dragon', family: 'Dragon', speed: 3000,
      /* the glass: a thin one that sits on a ledge and spits at whoever's standing farthest back. HE SHOOTS (`range`, src/core/hunt/shooters.js)
         from 5 tiles and doesn't come down. A bow reaches 7, so a Ranger can out-shoot him, and a Challenge turns him on the tank. */
      range: 5,
      elements: { ember: 25, frost: -15 },
      drops: [{ id: 'dragon_bones', ch: 0.5, band: 'common' }, { id: 'gizzard_stone', ch: 0.08, band: 'uncommon' }],
      hp: 175, atk: 160, baseAcc: 0.15, def: 60, xp: 2258, gp: [26, 77], formula: true },
    bull_wyvern: {
      name: 'Bull Wyvern', icon: '🐲', tier: 6, level: 133, cls: 'dragon', family: 'Dragon', speed: 2400,
      /* the heavy: an old male, slow and huge. He swings his tail round and hits everyone standing next to him (Tail Sweep, `spells`), so
         heroes who crowd him pay for it. */
      spells: ['tail_sweep'],
      elements: { ember: 25, frost: -15 },
      drops: [{ id: 'dragon_bones', ch: 0.5, band: 'common' }, { id: 'dragon_scale', ch: 0.2, band: 'common' }, { id: 'tail_spur', ch: 0.08, band: 'uncommon' }],
      hp: 287, atk: 118, baseAcc: 0.9, def: 88, xp: 3425, gp: [42, 127], formula: true },
    crag_wyvern: {
      name: 'Crag Wyvern', icon: '🐲', tier: 6, level: 136, cls: 'dragon', family: 'Dragon', speed: 3000,
      /* the regular: a grown wyvern. She breathes fire in a cone in front of her (Fire Breath, a marked hit, `spells`): the tank stands in it,
         everyone else steps off. */
      spells: ['fire_breath'],
      elements: { ember: 25, frost: -15 },
      drops: [{ id: 'dragon_bones', ch: 0.5, band: 'common' }, { id: 'dragon_scale', ch: 0.2, band: 'common' }, { id: 'fire_gland', ch: 0.08, band: 'uncommon' }],
      hp: 244, atk: 151, baseAcc: 0.4, def: 69, xp: 2671, gp: [36, 107], formula: true },
    brood_wyvern: {
      name: 'Brood Wyvern', icon: '🐲', tier: 6, level: 140, cls: 'dragon', family: 'Dragon', speed: 2800,
      /* the elite: a big female sitting on her eggs. No trick, she's just the hardest thing in the pass. The Roost Mother (the boss, board
         section 9) is the oldest of these, and she waits for her own lane. */
      elements: { ember: 25, frost: -15 },
      drops: [{ id: 'dragon_bones', ch: 1, band: 'common' }, { id: 'dragon_scale', ch: 0.5, band: 'common' }, { id: 'stolen_fleece', ch: 0.1, band: 'uncommon' }],
      hp: 402, atk: 155, baseAcc: 0.4, def: 105, xp: 5119, gp: [59, 177], formula: true },
  },
  roster: { wyvern_fledgling: 'swarm', ledge_wyvern: 'glass', bull_wyvern: 'heavy', crag_wyvern: 'regular', brood_wyvern: 'elite' },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, tier and book value from its dropper's Level, raw): one of each of the five kinds. */
  items: {
    eggshell: { n: 'Eggshell', icon: '🥚', v: 252, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    gizzard_stone: { n: 'Gizzard Stone', icon: '🪨', v: 260, raw: true, imbue: { kind: 'keen', tier: 3 } },
    tail_spur: { n: 'Tail Spur', icon: '🦴', v: 266, raw: true, imbue: { kind: 'ward', tier: 3 } },
    fire_gland: { n: 'Fire Gland', icon: '🔥', v: 272, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    stolen_fleece: { n: 'Stolen Fleece', icon: '🐑', v: 280, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
  },
  itemText: {
    eggshell: 'A piece of wyvern eggshell as thick as a roof tile. The fledglings kick them off the ledges',
    gizzard_stone: 'Wyverns swallow stones to grind up what they eat. This one\'s been worn smooth as glass',
    tail_spur: 'The bony spur off a Bull Wyvern\'s tail. He swings it at anyone who stands too close',
    fire_gland: 'The sack in a wyvern\'s throat that the fire comes out of. It\'s still warm',
    stolen_fleece: 'Brood Wyverns line their nests with wool. This came off one of Morrow\'s sheep',
  },
  /* THE ROOST'S TWO (src/data/monster-spells.js rows; numbers start from rows that already play: the Rat King's Tail Lash at Lash Sweep's
     strength as a ring, and Rake the Coals' cone). Measured with the ground on the grade, not tuned one at a time. */
  spells: {
    tail_sweep: { n: 'Tail Sweep', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 16000, hitPm: 1000, element: null },
    fire_breath: { n: 'Fire Breath', shape: 'cone', len: 4, range: 1, windupMs: 1800, cdMs: 14000, hitPm: 1200, element: 'ember' },
  },
  /* THE BAG: the Hold's store food, and the ice rune (wyverns take 15% more from ice). */
  /* THE COUNTS, MEASURED (lane/d-late-nearmisses' rule, re-measured on v0.2.139 by lane/d-late-items-rescue). A bag is BAG_TARGET_HOURS (3) of
     its style's eating, a lone hero at the floor on Normal in the uniques kit (tools/balance-sim/gear.mjs, the four late grounds open), Salted
     Lobster an hour turned into Cooked Lobster (300 HP to the store's 216), to the nearest 5: Melee the median of the four Melee ways, Ranged
     the mean of bow and crossbow, Magic 10 (a caster eats none alone, so 10 for a stray pull).
     Measured: 2 seeds x 2 h a way, eats an hour tank 49.0, hammer 137.5, axes 159.5, sword 190.0, bow 54.0, crossbow 17.3, Mage 0.5, Healer 0; Melee
     148.5 = 320, Ranged 35.65 = 75. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 320 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 75 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 10 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_ice_rune', qty: 650 } } },
  /* THE XP FIT AND PARTY LEVEL XP (lane/d-morrow-grounds 2026-11-14, the Hold's method; quick grade, 1 seed x 1 h, every Barrow March and Morrow pack open
     on the ladder). The median lone way read 1.10 / 1.06 of the contract at the floor and middle (the bow 1.15, the best lone way after the Mage), so 0.94.
     A four of four classes read 0.58 / 0.53 and a tank and Healer 0.77 / 0.72, so the four 1000 x 1.20 / 0.514 = 2335, the pair 1000 x 1.10 / 0.69 = 1595, the
     cells between at the Hold's proportions. */
  xpFit: { k: 0.94, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* (Its own party cells are retired: one party table for every ground, Tyler 2026-11-16, src/data/party-class-xp.js.) */
  /* MEASURED (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, 2026-11-14): one class is the mean of its five one-class parties,
     two of two the mean of three duos, three of three of two trios, four of four the one played, the cells between the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-35, 5], 3: [-45, -5, 0], 4: [-55, -20, -15, -15] }, dangerous: { 2: [-5, 65], 3: [-5, 50, 60], 4: [-20, 30, 40, 40] }, deadly: { 2: [-5, 60], 3: [0, 65, 75], 4: [-10, 45, 50, 55] } },
  /* DEADLY BRINGS SIX (the Hold's and the Pyre Field's row): on eight a four of four classes died 9 times in 4 hero-hours at the floor (36 in 16,
     where the sheet allows 9). Six is the least Deadly may bring; since the one party table (2026-11-16) Dangerous brings 8 on the table, so it brings six here too. */
  tierOverride: { dangerous: 6, deadly: 6, why: 'on the full box a group of four died 9 times in 4 hours at the floor, where the rule allows about 2. On six they hold it, and Dangerous brings the same six (it never brings more than Deadly)' },
  /* DEADLY IS A HEALER'S TIER UNDER 131 (the designer 2026-11-18, row 2: the Roost's Deadly is meant to need fire resistance, Tyler 11-08, and the
     ground drops its answer, the Burnt Crag Leg Plates, on the Crag Wyvern; the Vaults' mechanism). MEASURED with the legs back on the Roost, the uniques
     kit with the four Morrow packs open, Deadly's six, deaths in 16 hero-hours, a tank, hammer, bow and Mage (every death the tank's, the Crag Wyvern's
     marked Fire Breath), 6 seeds x 2 h a cell or 12 where marked: 125 22.0, 126 13.7, 127 15.0, 128 11.7, 129 10.7 (12), 130 9.2 (12), 131 7.0 (12),
     132 7.8 (12), 133 3.7, 135 5.7, 140 0.7, 142 1.0. With a Healer in the hammer's place (tank, Healer, bow, Mage) at 125: 1.3. So 131,
     the first Level from which a four with no Healer reads the sheet's 9 or under (130 read 9.0 on six seeds and 9.2 on twelve). The card says the
     tier's label (hunts.tier_healer) under it. */
  healerTiers: { deadly: 131 },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 21782, deadlyFourNeeds: 'healer' },
  map,
});
