// src/data/grounds/hasks_ford/pack.js — HASK'S FORD, Levels 45-60, solo first: the Barrow March's first ground, brought into a
// ground pack (lane/b-slake-and-ford, designer 2026-11-10). Built first on lane/b-hasks-ford (2026-10-29) in the old data files,
// then held. Tyler lifted the hold on 2026-11-09 ("Yes lift the hold"). Shape: src/data/grounds/shape.js. The stat lines are the
// formula's (`node tools/pack.mjs propose hasks_ford --write`).
//
// NAMING VOICE (the Barrow March's, written here first): a free company's soldier words (banded, pike, muster, colors, sergeant,
// toll), the river's words (ford, sunk, weed) and the March's place words (barrow, ford). People get one short name (Hask,
// Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors).
// THOSE WORDS ARE FOR NAMES ONLY (Tyler 2026-11-11, on "The foot died in their files at the toll stone": "Fix your voice"). A
// sentence a player reads is plain everyday English, the way Tyler talks to a friend: what happened, in full sentences. No old or
// military words in a sentence (foot, files, colors, rite), no fragments, no "nobody X them" or "still holds", no lists of three,
// no mood words. The story itself goes in the wiki, sample first, never into these rows.
// THE STORY (Tyler 2026-11-09, the arc of record): Havora hired the Banded Company to hold the March. Its captain, Hask, took a
// toll at this ford and then sold the crossing to Lord Krell. Krell's men killed the company here, and nobody burned them. The
// river took some down to the Slake. The officers and Hask lie in the Muster Barrows. Wickstead's Turncoats are the company's
// last deserters. The Hearth lays the dead to rest: their Bone Chips burn at Inner Flame 40 and their Grave Dust at 46.
//
// ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08). A monster has its row's HP and pays its whole kill whoever fights it. There is
// no party scale and no party gate. `groupFit: 'solo'` only picks the formula's solo stats and orders the Hunts window's advice.
// On Normal every group meets the room as built (Tyler 2026-11-11: no party pull). Each harder tier brings ONE pull for every group,
// the table's (5 and 8): this ground needs no tier row of its own.
//
// THE HAMMER'S GROUND. All four bodies are the Undead class as written, so a hammer breaks every one of them (+20% damage and
// +15% accuracy, combat.js WEAKNESS_BONUS). The Slake, five Levels on, is the cousin with the other answers (a sword, an arrow,
// a spell). A resistance is the bestiary's words only: no engine reads weaponResist today.
//
// THE LOOT (src/data/loot-bands.js). THE TIER-4 ARMOR'S FIRST HOME (worn from Level 45): the set in all three weights, each
// piece about hourly (Pikemen boots and helmets, Fordsunk legs, Ledger Wights bodies). Rare, each about every 15 h: the
// Bannerman's gloves and belts. No weapon drops here. The tier-4 weapons are the Slake's, and the hatchets and the crossbow are
// a smith's and a fletcher's (style-gear.js). MEASURED (tests/hunt-core/drop-tables.mjs, a lone tank at the floor in the full
// set, one played hour): each Scarce piece every 0.99-1.05 h, each Rare every 15.2 h, coin 7,403 g, commons 951 g, gear 1,931 g
// (26% of the coin, the cap is 50%) at the tier-4 sale rate of 0.075. That tank clears +40% over its store bill.
// Commons feed the Hearth (Bones, Big Bones, Bone Chips, Grave Dust). Each body drops its own imbuement item, a Material that
// only sells until linings are built (the board, "2026-11-10 Resistance and imbuements"). Ford Weed is the element piece: the
// ground before sells the lining for the ground after, and the Slake's Bargemen will throw cold river water.
// NOT IN THIS PACK YET: the Company Colors (the Bannerman's flag, a named Hearth fuel on the old lane). A named fuel needs a
// row in src/data/hearth.js, which a pack can't add. It comes back when a pack can carry a fuel row.
// NO SPELL ROW WAITS HERE: no Ford body has a monster area spell designed.
//
// WHAT OPENING IT MOVES (not this pack's file): a lone hero at 45-49 is sent here from the Glade, and earns about 250k Level XP
// an hour where the pace of record reads 105-107k (tools/balance-sim/level-pace.json). Computed from the curve's XP, Levels 45 to
// 50 then take about 18.5 hours and not 43.5, and Level 50 comes at about 145 hours, outside the 168 h target's 10%. That is an
// estimate: no career was played with the Ford open. So the Ford opens WITH a re-measured pace
// and a re-fit of the Level curve from 45 up (tools/balance-sim/pace.mjs --fit, tools/gen-level-curve.mjs): the Coordinator's
// world move, listed in the lane's report.
// IT OPENS WITH THE SLAKE (lane/b-slake-and-ford, systems, 2026-11-10; graded as it ships, its own drops on the gear ladder). The
// tier-4 weapons are the Slake's, so opened alone a sword alone at 45 swings its tier-3 sword and nets +5% over its store bill
// (`node tools/pack.mjs check hasks_ford --mode full`, 6 seeds x 4 h), where the rule is +25% for every way. With the Slake's
// mithril sword gettable it nets +45%, and that full grade passes every row (`--with the_slake`, exit 0, 66 rows).
import { definePack, box, gather } from '../shape.js?v=0.2.129';
import map from './map.js?v=0.2.129';

const PK = 'banded_pikeman', FS = 'fordsunk', LW = 'ledger_wight', BN = 'bannerman';

export default definePack({
  id: 'hasks_ford',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 12 Pikemen, 6 Fordsunk, 4 Ledger Wights and
     the 2 Bannermen. */
  hunt: {
    name: 'Hask\'s Ford', theme: 'Hask\'s soldiers were killed at this river crossing and came back as undead.',
    band: [45, 60],
    spawns: [{ monster: PK, w: 12, rarity: 'common' }, { monster: FS, w: 6, rarity: 'uncommon' },
      { monster: LW, w: 4, rarity: 'uncommon' }, { monster: BN, w: 2, rarity: 'rare' }],
    family: 'Undead', art: PK, travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE ROUTE: in off the Wickstead road to the Pike Files, east along the south bank past the Toll Stone to the Low Barrows,
     back and over the Ford to the Company Stores, east to the Muster Line, then west to the High Barrows. */
  ground: {
    map: 'hasks_ford',
    /* the road in from Wickstead, on the west edge */
    start: [[1, 30], [1, 29], [2, 30], [1, 31]],
    pockets: [
      /* P0 the Pike Files: the company died in its files */
      box([3, 25, 18, 37], [10, 31], [PK, FS], [PK, FS, PK, LW, PK, PK]),
      /* P1 the Toll Stone: where Hask took the coin for the ford. A Bannerman holds it */
      box([19, 25, 37, 35], [28, 30], [BN, PK], [PK, FS, PK, LW, FS, PK]),
      /* P2 the Low Barrows: the rank and file under the mounds. Two Pikemen as built, the Wight at three (2026-11-10: with a
         Wight as built here too, and the Wight and Bannerman at 53 and 58, a lone tank at the floor cleared +26% over its bill
         before its gear. With this and their Levels at 51 and 56 it cleared +81%. As opened, 1 seed x 1 h) */
      box([40, 23, 56, 37], [49, 29], [PK, PK], [LW, FS, PK, FS, PK, BN]),
      /* P3 the Company Stores, over the Ford: the Ledger Wights still keep the books */
      box([22, 3, 38, 15], [29, 9], [LW, PK], [PK, FS, PK, PK, LW, FS]),
      /* P4 the Muster Line: the broken palisade, the colors still up */
      box([40, 3, 57, 11], [48, 7], [PK, PK], [BN, LW, PK, FS, PK, PK]),
      /* P5 the High Barrows: the standing stones */
      box([6, 4, 20, 11], [15, 8], [FS, PK], [LW, PK, PK, FS, LW, PK]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    respawnMs: 60000, pullDist: 1.5, groupFit: 'solo',
    densityMax: [8, 8, 8, 8],
    /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11, "if they want bigger pulls they need to up the difficulty"; lane/d-packs-retune): a party
       meets the room as built, the same as a hero alone. A bigger pull is Dangerous or Deadly (the tier row), never a party's own. */
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): the oaks at
       the clearings' edges, two each at the Pike Files, the Muster Line and the High Barrows. */
    gather: gather(12000, [['oak_tree', 17, 36, 0], ['oak_tree', 5, 34, 0], ['oak_tree', 54, 6, 4], ['oak_tree', 42, 5, 4], ['oak_tree', 7, 8, 5], ['oak_tree', 6, 5, 5]]),
  },
  /* THE BODIES (art: origin/lane/b-hasks-ford-art, art/world/march). The class is Undead (hammer weak, poison and frost do
     less, fire more). No body overrides the weapon axis: the hammer answers all four.
     THE LEVELS (2026-11-10): the Pikeman stands at the floor, as the Thicket's Whelp and the Glade's Crow do, and the others at
     +5, +6 and +11. The old lane had them at 46, 50, 53 and 58. At 46, 50, 51 and 56 a sword alone cleared +20% over its bill at
     the floor, where the rule is +25% for every way to fight. At these it clears +43% (as opened, 4 seeds x 1 h). */
  monsters: {
    banded_pikeman: {
      name: 'Banded Pikeman', icon: '💀', tier: 4, level: 45, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot, still in its files. A blade skates off the ribs (the bestiary's
         words). Their boots and helmets, their bones for the Hearth. */
      weaponResist: ['sword'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'pike_band', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_boots', ch: 0.0064, band: 'scarce' }, { id: 'snakeskin_boots', ch: 0.0064, band: 'scarce' }, { id: 'warlock_boots', ch: 0.0064, band: 'scarce' },
        { id: 'mithril_helm', ch: 0.0064, band: 'scarce' }, { id: 'snakeskin_helmet', ch: 0.0064, band: 'scarce' }, { id: 'warlock_helmet', ch: 0.0064, band: 'scarce' }],
      hp: 61, atk: 26, baseAcc: 1.04, def: 14, xp: 485, gp: [13, 38], formula: true },
    fordsunk: {
      name: 'Fordsunk', icon: '🌊', tier: 4, level: 50, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank: the dead who went into the ford, bloated and slow. Arrows sink into the bloat (the bestiary's words). The
         legs, and the weed that grew through them. */
      weaponResist: ['ranged'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.16, band: 'common' }, { id: 'ford_weed', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platelegs', ch: 0.026, band: 'scarce' }, { id: 'snakeskin_pants', ch: 0.026, band: 'scarce' }, { id: 'warlock_pants', ch: 0.026, band: 'scarce' }],
      hp: 101, atk: 26, baseAcc: 1.08, def: 27, xp: 921, gp: [21, 64], formula: true },
    ledger_wight: {
      name: 'Ledger Wight', icon: '🪦', tier: 4, level: 51, cls: 'undead', family: 'Undead', speed: 3200,
      /* the glass: the company's dead quartermasters, still keeping the books by the stores. It hits hard and breaks fast. A
         spell sinks into the cold (the bestiary's words). The bodies. A lone hero meets about 20 an hour, so its Scarce rows sit
         at the 5% ceiling. Its id is its own: monsters.js holds an old `wight` row with no ground, which a pack can't replace. */
      weaponResist: ['magic'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'ledger_leaf', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platebody', ch: 0.05, band: 'scarce' }, { id: 'snakeskin_body', ch: 0.05, band: 'scarce' }, { id: 'warlock_body', ch: 0.05, band: 'scarce' }],
      hp: 65, atk: 36, baseAcc: 1.05, def: 18, xp: 652, gp: [14, 41], formula: true },
    bannerman: {
      name: 'Bannerman', icon: '🚩', tier: 4, level: 56, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier: the company's dead sergeant, still holding the colors at the Toll Stone. The gloves
         and belts. */
      weaponResist: ['ranged'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'toll_token', ch: 0.1, band: 'uncommon' },
        { id: 'mithril_gauntlets', ch: 0.0033, band: 'rare' }, { id: 'snakeskin_gloves', ch: 0.0033, band: 'rare' }, { id: 'warlock_gloves', ch: 0.0033, band: 'rare' },
        { id: 'mithril_belt', ch: 0.0033, band: 'rare' }, { id: 'snakeskin_belt', ch: 0.0033, band: 'rare' }, { id: 'warlock_belt', ch: 0.0033, band: 'rare' }],
      hp: 151, atk: 36, baseAcc: 1.1, def: 36, xp: 1507, gp: [32, 95], formula: true },
  },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT). The sheet asks the median lone way at the band middle (53) for 0.90-1.10 of the
     pace contract (254,360 an hour at 53). Measured as opened in the tier-4 set, the 8 ways, 4 seeds x 1 h each: at 1.15 the middle
     read 0.92, at 1.22 0.98, and at 1.28 it reads 1.03 (261,500), the floor 1.23 and the band's top 0.88. 1.28 and not 1.22: at
     1.22 the Warrens' Normal paid a lone tank, hammer and wand 2-5% more Level XP at 45 than the Ford did (204k, 282k and 350k
     against 194k, 277k and 334k, 2 seeds x 1 h), and the ground the Hunts window sends a lone hero to should not pay less than
     the party ground beside it. */
  /* RE-FITTED UNDER SOLO +15% AND THE FLATTER CONTRACT (lane/d-packs-retune, 2026-11-12). Tyler 2026-11-11 pays a hero alone +15% Level XP
     (party-class-xp.js SOLO_XP_PM 1150, was 1050) and the pace contract was re-pinned to the measured ladder (core-model.js LEVEL_PACE.contract
     1378 x L^1.298, was 975 x L^1.421: 238k an hour at 53, was 276k). At 1.28 the median lone way read 1.26 of the contract at the band middle
     (quick grade, the Slake's weapons on the ladder, 1 seed x 1 h). A fit scales every way alike, so 1.28 x 1.00 / 1.26 = 1.02. The Warrens'
     own fit fell further the same day (1 -> 0.76), so a lone hero at 45 still earns a little more here than there. */
  xpFit: { k: 1.02, why: 'at 1.28 the median lone way read 1.26 of the pace contract at the band middle (53) under solo +15% and the re-pinned contract (quick grade, 1 seed x 1 h). At 1.02 it reads about 1.00' },
  roster: {
    banded_pikeman: 'swarm',   // the common majority
    fordsunk: 'heavy',         // the tank: slow (2400), thick
    ledger_wight: 'glass',     // fragile, lands often, hits hard
    bannerman: 'elite',        // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw).
     Each is a Material in the bag and only sells until its lining exists. */
  items: {
    pike_band: { n: 'Pike Band', icon: '💀', v: 90, raw: true, imbue: { kind: 'keen', tier: 2 } },
    ford_weed: { n: 'Ford Weed', icon: '🌿', v: 100, raw: true, imbue: { kind: 'element_ward', tier: 2 } },
    ledger_leaf: { n: 'Ledger Leaf', icon: '📜', v: 102, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    toll_token: { n: 'Toll Token', icon: '🪙', v: 112, raw: true, imbue: { kind: 'ward', tier: 2 } },
  },
  itemText: {
    pike_band: 'It\'s the iron ring from a Banded Pikeman\'s spear, stamped with Hask\'s mark',
    ford_weed: 'This river weed grew through a Fordsunk while it lay at the bottom of Hask\'s Ford',
    ledger_leaf: 'It\'s a page from a Ledger Wight\'s account book, listing the pay Hask\'s soldiers never got',
    toll_token: 'Hask\'s men gave these lead tokens to people who paid to cross the river. Bannermen carry a bag of them',
  },
  /* PARTY LEVEL XP (party-class-xp.js's row shape: heroes alive -> permille at 1, 2, ... classes): better only with different
     classes (Tyler 10-31), and since one difficulty the mixed cells are the lever (Tyler 11-08, "Same monsters, re-tune"). Measured
     as opened with every cell at 1000 (the full grid in 1 h cells, 2 seeds): against the median lone way a mixed four read
     0.75-0.80, a three 0.71-0.82 and a pair 0.85-0.93. At these cells a four reads 1.165 to 1.226 at the floor, the middle and the top
     (the ruling's 1.15-1.25) and a pair 1.06-1.16. A fourth class pays a little more than three (tests/hunt-core/xp-share.mjs
     party-class-every-cell). The one-class cells hold every one-class party under its heroes alone: the best reads 0.91
     (tests/party-class-xp-line.mjs, two wands).
     RE-READ 2026-11-10 (systems) on the grader's own full grid, played as it ships (pairs and fours 2 seeds x 2 h, the lone ways
     6 x 4 h). At 1545 and 1555 the four of three classes (tank, hammer, bow, wand) read 1.14 at the middle and the top. The four's
     two cells now 1565 and 1570, held for both ways it can open: alone, the four of three reads 1.15-1.17 and of four 1.19-1.21; with
     the Slake (its weapons on the ladder, the faster party kills) 1.18-1.20 and 1.22-1.24. Pairs 1.01-1.12 alone, 1.06-1.16 with it. */
  /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11; lane/d-packs-retune, 2026-11-12). With no party pull a party walks the same route a
     hero alone walks and splits each kill, so at the cells above a four of four classes read 0.59-0.61 of the median lone way (quick grade,
     floor and middle) and a tank and Healer pair 0.71, where 10-25 §5 asks a four 1.15-1.25, a pair about 1.10 and a three about 1.15. A cell
     is a straight factor on the share, so each mixed cell is its old one times its target over its reading: the four's 1570 x 1.20 / 0.60 =
     3150 (the three-class four 0.98 of it and the two-class 0.90, the base grounds' spread), the pair 1230 x 1.10 / 0.71 = 1905, the threes
     between (x1.77, the two sizes' mean). One-class cells stay at 1150: they already hold every one-class party under solo (party-class-xp-line),
     and a raise would carry it over solo on the big-pull tiers (10-31).
     RE-READ ON THE FULL GRADE (8 lone ways, 6 seeds x 4 h; parties 2 x 2 h; the Slake's weapons on the ladder): the median of eight lone ways sits
     under the quick grade's four, so every mixed cell read about 5% high: the four of four classes 1.30 / 1.25 / 1.24 at the floor, middle and top
     at 3150, the four of three 1.25 / 1.21 / 1.20 at 3090, the pairs 1.17-1.24 at 1905, the threes 1.25-1.42 at 2670. Each cell scaled to its
     target once more: the four 3000 (reads about 1.24 / 1.19 / 1.18) over the three-class four at 2980, the pair 1760 (about 1.08-1.15), the threes
     2310 and 2145 (about 1.08-1.23; a three with no tank earns most). A four's spread from the floor to the top is 5%, inside the band's 8.7%. */
  partyClassXp: { 2: [990, 1760], 3: [1150, 2145, 2310], 4: [1150, 2700, 3025, 3000] },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives.
     Measured at the floor on the default pull, as it ships (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, 2026-11-10
     late, the four's cells at 1565 and 1570). One class is the mean of its five one-class parties (pairs 0.80-0.89, threes
     0.76-0.88, fours 0.77-0.89). Two of two is the mean of three mixes (1.01-1.09), three of three of two (1.08 and 1.05), four of
     four the one played (1.13). The cells between are the size's mix times the cell ratio. */
  /* RE-MEASURED 2026-11-12 (lane/d-packs-retune; tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, every pack
     under this one open on the ladder). One class is the mean of its five one-class parties (pairs 0.59-0.70, threes 0.55-0.65, fours 0.44-0.58), two of two the mean of three mixes, three of three of two,
     four of four the one played (pairs 1.06-1.17, threes 1.06-1.14, the four 1.17); the cells between are the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { 2: [-35, 10], 3: [-40, 0, 10], 4: [-50, 5, 15, 15] },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Slake's bag. Salted Lobster is the cheapest heal an HP at this Level
     (0.83 g an HP). The melee line holds about three hours of a lone tank's bill at the floor (5.8k g an hour, drop-tables). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE PACK'S TEST FACTS. bridge: the Ford's narrowest row (tests/hunt-core/forest-cave.mjs). dropRef: a lone tank at the floor
     in the full own-tier set. valueToday is that hour's measured value (10,285 g: coin 7,403, commons 951, gear 1,931), pinned once. */
  checks: { bridge: [[22, 21], [23, 21], [24, 21], [25, 21], [26, 21], [27, 21], [28, 21], [29, 21], [30, 21], [31, 21], [32, 21], [33, 21], [34, 21], [35, 21], [36, 21]],
    dropRef: { roles: ['tank'], full: true }, valueToday: 10285 },
  map,
});
