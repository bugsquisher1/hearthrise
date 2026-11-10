// src/data/grounds/hasks_ford/pack.js — HASK'S FORD, Levels 45-60: the Barrow March's first ground, brought into a ground pack
// (lane/b-slake-and-ford, designer 2026-11-10; built first on lane/b-hasks-ford 2026-10-29, held, and the hold lifted by Tyler
// 2026-11-09: "Yes lift the hold"). Shape: src/data/grounds/shape.js. The stat lines are the formula's
// (`node tools/pack.mjs propose hasks_ford --write`).
//
// NAMING VOICE (the Barrow March's, written here first): a free company's soldier words (banded, pike, muster, colors, sergeant,
// toll), the river's words (ford, sunk, weed) and the March's place words (barrow, ford). People get one short name (Hask,
// Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors).
// THE STORY (Tyler 2026-11-09, the arc of record): Havora hired the Banded Company to hold the March. Its captain, Hask, took a
// toll at this ford and then sold the crossing to Lord Krell. Krell's men killed the company here, and nobody burned them. The
// river took some down to the Slake. The officers and Hask lie in the Muster Barrows. Wickstead's Turncoats are the company's
// last deserters. The Hearth lays the dead to rest: their Bone Chips burn at Inner Flame 40 and their Grave Dust at 46.
//
// ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08). No party-size row here: no partyPull, no per-size tier pull. A monster has
// its row's HP and pays its whole kill whoever fights it. `groupFit: 'solo'` only picks the formula's solo stats and orders the
// Hunts window's advice. It gates nothing.
//
// THE HAMMER'S GROUND. All four bodies are the Undead class as written, so a hammer breaks every one of them (+20% damage and
// +15% accuracy, combat.js WEAKNESS_BONUS). The Slake, five Levels on, is the cousin with the other answers (a sword, an arrow,
// a spell). A resistance is the bestiary's words only: no engine reads weaponResist today.
//
// THE LOOT (src/data/loot-bands.js). THE TIER-4 ARMOR'S FIRST HOME (worn from Level 45): the set in all three weights, each
// piece about hourly (Pikemen boots and helmets, Fordsunk legs, Ledger Wights bodies). Rare, each about every 15 h: the
// Bannerman's gloves and belts. No weapon drops here. The tier-4 weapons are the Slake's. Commons feed the Hearth (Bones,
// Big Bones, Bone Chips, Grave Dust). Each body drops its own imbuement item, a Material that only sells until linings are
// built (the board, "2026-11-10 Resistance and imbuements"). Ford Weed is the element piece: the ground before sells the
// lining for the ground after, and the Slake's Bargemen will throw cold river water.
// NOT IN THIS PACK YET: the Company Colors (the Bannerman's flag, a named Hearth fuel on the old lane). A named fuel needs a
// row in src/data/hearth.js, which a pack can't add. It comes back when a pack can carry a fuel row.
import { definePack, box, gather } from '../shape.js?v=0.2.113';
import map from './map.js?v=0.2.113';

const PK = 'banded_pikeman', FS = 'fordsunk', LW = 'ledger_wight', BN = 'bannerman';

export default definePack({
  id: 'hasks_ford',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 12 Pikemen, 6 Fordsunk, 4 Ledger Wights and
     the 2 Bannermen. */
  hunt: {
    name: 'Hask\'s Ford', theme: 'The Banded Company died holding this ford, and nobody burned them.',
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
      /* P2 the Low Barrows: the rank and file under the mounds */
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
    /* NORMAL'S PULL FOR A PARTY (hunt-grounds.js partyPull, the Glade's and Wickstead's): a pair and a three bring three, a four
       brings four. A lone hero's pockets are as built. The harder tiers bring one pull for every group (balance-sheet.js). */
    partyPull: [0, 3, 3, 4],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): the oaks at
       the clearings' edges, two each at the Pike Files, the Muster Line and the High Barrows. */
    gather: gather(12000, [['oak_tree', 17, 36, 0], ['oak_tree', 5, 34, 0], ['oak_tree', 54, 6, 4], ['oak_tree', 42, 5, 4], ['oak_tree', 7, 8, 5], ['oak_tree', 6, 5, 5]]),
  },
  /* THE BODIES (art: origin/lane/b-hasks-ford-art, art/world/march). The class is Undead (hammer weak, poison and frost do
     less, fire more). No body overrides the weapon axis: the hammer answers all four. */
  monsters: {
    banded_pikeman: {
      name: 'Banded Pikeman', icon: '💀', tier: 4, level: 45, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot, still in its files. A blade skates off the ribs (the bestiary's
         words). Their boots and helmets, their bones for the Hearth. */
      weaponResist: ['sword'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'pike_band', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_boots', ch: 0.0064, band: 'scarce' }, { id: 'snakeskin_boots', ch: 0.0064, band: 'scarce' }, { id: 'warlock_boots', ch: 0.0064, band: 'scarce' },
        { id: 'mithril_helm', ch: 0.0064, band: 'scarce' }, { id: 'snakeskin_helmet', ch: 0.0064, band: 'scarce' }, { id: 'warlock_helmet', ch: 0.0064, band: 'scarce' }],
      hp: 61, atk: 26, baseAcc: 1.04, def: 14, xp: 580, gp: [13, 38], formula: true },
    fordsunk: {
      name: 'Fordsunk', icon: '🌊', tier: 4, level: 50, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank: the dead who went into the ford, bloated and slow. Arrows sink into the bloat (the bestiary's words). The
         legs, and the weed that grew through them. */
      weaponResist: ['ranged'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.16, band: 'common' }, { id: 'ford_weed', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platelegs', ch: 0.026, band: 'scarce' }, { id: 'snakeskin_pants', ch: 0.026, band: 'scarce' }, { id: 'warlock_pants', ch: 0.026, band: 'scarce' }],
      hp: 101, atk: 26, baseAcc: 1.08, def: 27, xp: 1102, gp: [21, 64], formula: true },
    ledger_wight: {
      name: 'Ledger Wight', icon: '🪦', tier: 4, level: 51, cls: 'undead', family: 'Undead', speed: 3200,
      /* the glass: the company's dead quartermasters, still keeping the books by the stores. It hits hard and breaks fast. A
         spell sinks into the cold (the bestiary's words). The bodies. */
      weaponResist: ['magic'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'ledger_leaf', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platebody', ch: 0.05, band: 'scarce' }, { id: 'snakeskin_body', ch: 0.05, band: 'scarce' }, { id: 'warlock_body', ch: 0.05, band: 'scarce' }],
      hp: 65, atk: 36, baseAcc: 1.05, def: 18, xp: 780, gp: [14, 41], formula: true },
    bannerman: {
      name: 'Bannerman', icon: '🚩', tier: 4, level: 56, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier: the company's dead sergeant, still holding the colors at the Toll Stone. The gloves
         and belts. */
      weaponResist: ['ranged'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'toll_token', ch: 0.1, band: 'uncommon' },
        { id: 'mithril_gauntlets', ch: 0.0033, band: 'rare' }, { id: 'snakeskin_gloves', ch: 0.0033, band: 'rare' }, { id: 'warlock_gloves', ch: 0.0033, band: 'rare' },
        { id: 'mithril_belt', ch: 0.0033, band: 'rare' }, { id: 'snakeskin_belt', ch: 0.0033, band: 'rare' }, { id: 'warlock_belt', ch: 0.0033, band: 'rare' }],
      hp: 151, atk: 36, baseAcc: 1.1, def: 36, xp: 1802, gp: [32, 95], formula: true },
  },
  xpFit: { k: 1.22, why: 'TUNING' },
  partyClassXp: { 2: [990, 1230], 3: [1150, 1400, 1510], 4: [1150, 1400, 1550, 1550] },
  roster: {
    banded_pikeman: 'swarm',   // the common majority
    fordsunk: 'heavy',         // the tank: slow (2400), thick
    ledger_wight: 'glass',     // fragile, lands often, hits hard
    bannerman: 'elite',        // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw). */
  items: {
    pike_band: { n: 'Pike Band', icon: '💀', v: 90, raw: true, imbue: { kind: 'keen', tier: 2 } },
    ford_weed: { n: 'Ford Weed', icon: '🌿', v: 100, raw: true, imbue: { kind: 'element_ward', tier: 2 } },
    ledger_leaf: { n: 'Ledger Leaf', icon: '📜', v: 102, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    toll_token: { n: 'Toll Token', icon: '🪙', v: 112, raw: true, imbue: { kind: 'ward', tier: 2 } },
  },
  itemText: {
    pike_band: 'The iron band off a Banded Pikeman\'s pike shaft. It has the company\'s mark stamped on it',
    ford_weed: 'River weed that grew through a Fordsunk\'s coat in the years it lay in Hask\'s Ford',
    ledger_leaf: 'A page from a Ledger Wight\'s stores book. Every line is a debt the company was never paid',
    toll_token: 'A lead token Hask\'s men gave for a paid crossing. The Bannerman still carries a pouch of them',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Slake's bag. Salted Lobster is the cheapest heal an HP at this Level. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE PACK'S TEST FACTS. bridge: the Ford's narrowest row (tests/hunt-core/forest-cave.mjs). dropRef: a lone tank at the floor
     in the full own-tier set. valueToday is set from the measured hour (tests/hunt-core/drop-tables.mjs). */
  checks: { bridge: [[22, 21], [23, 21], [24, 21], [25, 21], [26, 21], [27, 21], [28, 21], [29, 21], [30, 21], [31, 21], [32, 21], [33, 21], [34, 21], [35, 21], [36, 21]],
    dropRef: { roles: ['tank'], full: true }, valueToday: 1 },
  map,
});
