// src/data/grounds/pyre_field/pack.js — THE PYRE FIELD, Levels 70-90, solo first: the second ground built as a ground pack and the
// Barrow March's ground after the Slake (lane/b-pyre-field, designer 2026-11-08; the board's "Where the 50-plus band goes", row 4).
// Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new pyre_field --like the_slake --band 70,90` (the Slake: the
// March's solo-first pack with a six-pocket ring), then every row rewritten. The stat lines are the formula's
// (`node tools/pack.mjs propose pyre_field --write`).
//
// THE NAME is Tyler's call: "The Pyre Field" is the board's working name. To rename it, change hunt.name and the map's `name`; no
// item, monster or line of text names the place.
//
// NAMING VOICE (the Barrow March's, with the Chantry's words added): the free company's soldier words (pike, provost, muster,
// colors), the fire's working words (pyre, stoke, rake, ash, char), and the Chantry's (brother, shroud, prior). People get one
// short name (Hask, Ebbe). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors, armor).
// THE STORY, each step from a place the player has already hunted or will: Hask sold the crossing and the Banded Company died at
// the Ford. The river took some (the Slake), the officers went into the Muster Barrows, and the rest were too many to bury. Prior
// Ebbe's Chantry carried them up onto the high field and burned them on long rows of pyres, so they would not rise. They rose
// anyway: Ebbe's rite bound them to the fire instead of freeing them (his Chantry, 85-110, is the region's end). The Chantry's lay
// brothers who fed the pyres, the Stokers, died at their work and still feed them, and forged in the pyres' heat: the Emberforged
// gear is theirs. The company's camp dogs, the Lurchers, never left their dead and live off the ash. The Hearth lays the dead to
// rest: their Bone Chips burn at Inner Flame 40, Grave Dust at 46, a Lurcher's Razor Claw at 52, a Wraith Veil at 72.
//
// THE FIRE IS THIS GROUND'S LESSON. The class is Undead (a hammer breaks it, fire does 15% more, frost 25% less, poison 50% less).
// The pyres already burned the Charred Pikemen, the Stokers and the Provosts once: each overrides the ELEMENT axis, so fire does
// 25% less to them and frost does full (monster-classes.js: a stated profile replaces the class's). Two bodies differ the other
// way: the Pyre Wraith keeps the class's elements and overrides the WEAPON axis (a spell breaks Ebbe's binding: weak to magic),
// and the Lurchers are living dogs (Mammal: an arrow's ground, fire does 15% more). So the Mage brings Frost Lance and Chalked Ice
// Runes here, and a sword-and-shield hero's Flame Strike earns less than it does at the Slake (the bag guide below says so).
// A weakness is +20% damage and +15% accuracy (combat.js WEAKNESS_BONUS); a resistance is the bestiary's words only (no engine
// reads weaponResist, flagged to Systems by the Slake). Weights at density 4: hammer-weak 16 of 24, ranged-weak 4, magic-weak 4.
// The Slake is the sword's ground and this is the hammer's and the frost's: they disagree on purpose.
//
// THE LOOT (src/data/loot-bands.js). Scarce, about hourly a piece: the TIER-5 set (worn from Level 60) in all three weights and all
// six slots (Pikemen boots and gloves, Stokers legs and belts, Lurchers helmets, Provosts bodies) and one tier-5 weapon on four
// bodies (sword, warhammer, staff, bow). Rare, each about every 15 h: the Yew Wand and Yewclasp Spellbook (the Wraiths, the
// Chantry's books), and the Provosts' tier-6 weapons, worn from 75 (the Stokers forged them in the pyres' heat: Emberforged).
// WHY TIER 5 AND NOT THE BOARD'S "T6 AT 75" (designer, measured 2026-11-08): tier 5 has no source anywhere (the board's home for
// it, the Muster Barrows, is a held party ground), so a lone hero reaches 70 in the Slake's tier 4 or the Warrens' tier 3. A tier-6
// Scarce set is worn only from 75, about 40 hunting hours past the floor: 40 hours of hourly drops nobody can wear. In the kit the
// game can give it today, a lone tank at the floor ate 14.4k g of food an hour against 8.5k coin (drop-tables, -31%). Tier 5
// is worn the hour it drops, and the tier-6 weapons keep the chase from 75 up. Tier-6 armor waits for Ebbe's Chantry.
// TIERS 5 AND 6 HAVE NO SALE RATE (VENDOR_GEAR_RATES stops at tier 3, Phase 0 adds tier 4): a tier above the table sells at its
// last rate, so the hour's gear sells for several times its coin (drop-tables gear-faucet). This pack ships only with both rates.
// Commons feed the Hearth (Bone Chips, Grave Dust, Razor Claw, Wraith Veil, the bones) and the forge (Coal). Each body drops its
// own imbuement item, one of each of the five kinds, kept for the imbuer (catalogue-coherence.js VENDOR_TRASH until imbuing is
// built). The ground's named fuel, Pyre Ash (the board's), waits on a pack field for NAMED_FUELS (src/data/hearth.js): no row.
import { definePack, box, gather } from '../shape.js?v=0.2.106';
import map from './map.js?v=0.2.106';

const CP = 'charred_pikeman', ST = 'stoker', LU = 'lurcher', PW = 'pyre_wraith', PV = 'provost';
/* the pyres burned them once: fire does 25% less, frost full, poison still little (the class's 50) */
const BURNED = Object.freeze({ ember: 25, poison: 50 });

export default definePack({
  id: 'pyre_field',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 9 Pikemen, 4 Stokers, 4 Lurchers, 4 Wraiths
     and 3 Provosts, two of them holding the Great Pyre. */
  hunt: {
    name: 'The Pyre Field', theme: 'Ebbe\'s Chantry burned the Banded Company\'s dead on this field, and they would not stay burned.',
    band: [70, 90],
    spawns: [{ monster: CP, w: 9, rarity: 'common' }, { monster: ST, w: 4, rarity: 'uncommon' },
      { monster: LU, w: 4, rarity: 'uncommon' }, { monster: PW, w: 4, rarity: 'uncommon' }, { monster: PV, w: 3, rarity: 'rare' }],
    family: 'Undead', art: CP, travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE ROUTE, a ring round the Great Pyre: up from the road to the Gate Pyres, west through the south row to the Shroud Rows,
     north through the west gap to the Stokers' Yard, east along the north strip to the Kennels, south through the east gap to the
     Ash Heaps, and west under the Great Pyre to its Provosts, then back down the burn line to the gate. */
  ground: {
    map: 'pyre_field',
    /* on the road in, one tile a seat */
    start: [[29, 38], [30, 38], [28, 38], [31, 38]],
    pockets: [
      /* P0 the Gate Pyres: the first pull, the dead the carts left by the gate, and a dog among them */
      box([10, 29, 27, 37], [20, 32], [CP, CP], [LU, CP, ST, CP, PW, CP]),
      /* P1 the Shroud Rows: the dead laid out for a pyre that never came, and the Wraiths rising out of their shrouds */
      box([3, 15, 22, 26], [9, 20], [PW, PW], [CP, CP, CP, ST, CP, LU]),
      /* P2 the Stokers' Yard: the Chantry's wood, and the brothers who still split it */
      box([3, 2, 25, 12], [14, 7], [ST, CP], [ST, PW, CP, CP, LU, CP]),
      /* P3 the Kennels: the burnt-out pits the Lurchers den in. Three come out at once (as built), as the Slake's Mudlark Holes do,
         so a lone hero's Normal costs real food here */
      box([35, 2, 55, 12], [45, 7], [LU, LU, CP], [LU, CP, ST, CP, LU]),
      /* P4 the Ash Heaps: the pyres that burned down, the Pikemen who crawled out of them, and a Provost driving them back */
      box([39, 15, 57, 26], [51, 21], [CP, PV], [CP, ST, PW, CP, LU, CP]),
      /* P5 the Great Pyre: the officers' pyre, and the Provosts who still keep the company in line under it */
      box([23, 22, 36, 26], [30, 24], [PV, ST], [PV, PW, CP, CP, ST, CP]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    respawnMs: 60000, pullDist: 1.5, partyScale: true, groupFit: 'solo',
    densityMax: [8, 8, 8, 8],
    partyPull: [0, 3, 3, 4],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): coal in the
       Stokers' Yard and the Ash Heaps, the pyres' charcoal (refKillMs the Slake's 12000). The ground wants an Emberstone Vein
       (gathering.js emberstone_rock, Mining 75: the tier-6 ore the Stokers forged with), which has no node kind or sprite yet. */
    gather: gather(12000, [['coal_rock', 7, 4, 2], ['coal_rock', 22, 8, 2], ['coal_rock', 48, 16, 4], ['coal_rock', 54, 20, 4]]),
  },
  /* THE BODIES. New drawings: the Charred Pikeman, the Stoker and the Lurcher. Re-pours: the Pyre Wraith (the March's wight, smoke
     grey) and the Provost (the Muster's barrow knight, burnt black). Each differs from its cousin in its weakness or resistance. */
  monsters: {
    charred_pikeman: {
      name: 'Charred Pikeman', icon: '💀', tier: 5, level: 72, cls: 'undead', family: 'Undead', speed: 3200,
      /* the swarm, the common majority: the company's foot, burned on the rows and risen out of the ash with the stub of a pike. Burned
         once (one override, element). Its boots, its sidearm, its burnt bones for the Hearth. */
      elements: BURNED,
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'pike_ferrule', ch: 0.08, band: 'uncommon' },
        { id: 'rune_boots', ch: 0.015, band: 'scarce' }, { id: 'wyvernhide_boots', ch: 0.015, band: 'scarce' }, { id: 'sorcerer_boots', ch: 0.015, band: 'scarce' },
        { id: 'rune_sword', ch: 0.015, band: 'scarce' }],
      hp: 96, atk: 49, baseAcc: 1.12, def: 29, xp: 1065, gp: [20, 61], formula: true },
    stoker: {
      name: 'Stoker', icon: '🪵', tier: 5, level: 76, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank, the slowest thing on the field: the Chantry's lay brothers who fed the pyres and forged in their heat. Worked in the
         fire all their lives (one override, element). The coal they carry, their smith's hammer, the apron's legs and belts. */
      elements: BURNED,
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'rake_tine', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platelegs', ch: 0.037, band: 'scarce' }, { id: 'wyvernhide_pants', ch: 0.037, band: 'scarce' }, { id: 'sorcerer_pants', ch: 0.037, band: 'scarce' },
        { id: 'rune_warhammer', ch: 0.037, band: 'scarce' },
        { id: 'rune_belt', ch: 0.0025, band: 'rare' }, { id: 'wyvernhide_belt', ch: 0.0025, band: 'rare' }, { id: 'sorcerer_belt', ch: 0.0025, band: 'rare' }],
      hp: 151, atk: 49, baseAcc: 1.14, def: 46, xp: 1884, gp: [32, 95], formula: true },
    lurcher: {
      name: 'Lurcher', icon: '🐕', tier: 5, level: 74, cls: 'mammal', family: 'Mammal', speed: 4600,
      /* the skirmisher: the company's camp dogs, lean and quick enough to run down a kiter, who never left their dead. Living, so the
         Mammal class with no override: an arrow's mark, fire does more. They worry the helmets off the dead, chew the gloves, and
         dig the claws sharp in the ash. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'razor_claw', ch: 0.2, band: 'common' }, { id: 'kennel_tag', ch: 0.08, band: 'uncommon' },
        { id: 'rune_helm', ch: 0.037, band: 'scarce' }, { id: 'wyvernhide_helmet', ch: 0.037, band: 'scarce' }, { id: 'sorcerer_helmet', ch: 0.037, band: 'scarce' },
        { id: 'rune_gauntlets', ch: 0.0025, band: 'rare' }, { id: 'wyvernhide_gloves', ch: 0.0025, band: 'rare' }, { id: 'sorcerer_gloves', ch: 0.0025, band: 'rare' }],
      hp: 92, atk: 65, baseAcc: 0.93, def: 30, xp: 1239, gp: [19, 58], formula: true },
    pyre_wraith: {
      name: 'Pyre Wraith', icon: '👻', tier: 5, level: 78, cls: 'undead', family: 'Undead', speed: 3600,
      /* the regular: a dead man Ebbe's rite bound into the pyre smoke, still in his shroud. A spell undoes the binding and a blade goes
         through smoke (one override, weapon: weak to magic). Its veil and its grave dust for the Hearth, the brother's staff, and the
         Chantry's books it guards: the caster's prizes. */
      weaponWeak: 'magic', weaponResist: ['sword'],
      drops: [{ id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'wraith_veil', ch: 0.2, band: 'common' }, { id: 'shroud_pin', ch: 0.08, band: 'uncommon' },
        { id: 'yew_staff', ch: 0.036, band: 'scarce' },
        { id: 'yew_wand', ch: 0.0024, band: 'rare' }, { id: 'yew_spellbook', ch: 0.0024, band: 'rare' }],
      hp: 129, atk: 62, baseAcc: 1.02, def: 35, xp: 1478, gp: [27, 81], formula: true },
    provost: {
      name: 'Provost', icon: '⚔️', tier: 5, level: 82, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier: the company's provosts, who hanged its deserters (Wickstead's Turncoats ran from them), burned
         in their plate on the officers' pyre and still keep the dead in line under it. Burned once (one override, element), so it
         differs from the barrow knight it is poured from. The bodies, the bow they shot runaways with, and the Stokers' best work, the
         Emberforged weapons the company's officers were burned with. */
      elements: BURNED,
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'warrant_seal', ch: 0.1, band: 'uncommon' },
        { id: 'rune_platebody', ch: 0.038, band: 'scarce' }, { id: 'wyvernhide_body', ch: 0.038, band: 'scarce' }, { id: 'sorcerer_body', ch: 0.038, band: 'scarce' },
        { id: 'yew_bow', ch: 0.038, band: 'scarce' },
        { id: 'ember_sword', ch: 0.0025, band: 'rare' }, { id: 'ember_warhammer', ch: 0.0025, band: 'rare' }, { id: 'runewood_bow', ch: 0.0025, band: 'rare' },
        { id: 'runewood_staff', ch: 0.0025, band: 'rare' }, { id: 'runewood_wand', ch: 0.0025, band: 'rare' }, { id: 'runewood_codex', ch: 0.0025, band: 'rare' }],
      hp: 217, atk: 65, baseAcc: 1.04, def: 57, xp: 2918, gp: [46, 136], formula: true },
  },
  roster: {
    charred_pikeman: 'swarm',   // the common majority
    stoker: 'heavy',            // the tank: slow (2400), thick
    lurcher: 'glass',           // quick (4600), fragile, lands often
    pyre_wraith: 'regular',     // the middle weight, the caster's mark
    provost: 'elite',           // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw): one of
     each of the five kinds, so the field supplies every imbuement the Slake and the Ford do not. */
  items: {
    pike_ferrule: { n: 'Pike Ferrule', icon: '🔩', v: 144, raw: true, imbue: { kind: 'ward', tier: 2 } },
    rake_tine: { n: 'Rake Tine', icon: '🪝', v: 152, raw: true, imbue: { kind: 'keen', tier: 2 } },
    kennel_tag: { n: 'Kennel Tag', icon: '🏷️', v: 148, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
    shroud_pin: { n: 'Shroud Pin', icon: '📍', v: 156, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    warrant_seal: { n: 'Warrant Seal', icon: '🔘', v: 164, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
  },
  itemText: {
    pike_ferrule: 'The iron cap off the foot of a company pike, all a pyre left of the shaft a Charred Pikeman carried',
    rake_tine: 'A bent iron tine off a Stoker\'s fire rake, black from years in the pyres',
    kennel_tag: 'The brass tag off a Lurcher\'s collar, still stamped with the Banded Company\'s mark',
    shroud_pin: 'The bone pin a Chantry brother closed a shroud with. Every Pyre Wraith still wears its own',
    warrant_seal: 'The lead seal off a Provost\'s warrant to hang a deserter. The paper burned and the seal did not',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Slake's store food and drink, and Chalked Ice Runes for Frost Lance in
     place of Fire Runes (the burned dead take 25% less fire and full frost). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_ice_rune', qty: 650 } } },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT): on the formula's rows the median way at the band middle (80) earned 0.85 of the pace
     contract as opened (its own tier-5 set; quick grade, 1 seed), where the sheet asks 0.90-1.10. */
  xpFit: { k: 1.18, why: 'the formula pays 0.85 of the pace contract at the band middle (80), measured as opened on the quick grade' },
  /* THE PARTY'S DANGEROUS PULL, one up (TIER_PULL_OVERRIDES' shape), as the Slake: on the table's 5 a Melee and Healer pair two or three
     Levels under the floor netted +14k to +15k an hour on Dangerous, where the weight-class ruling (11-06) asks them to lose gold. */
  tierOverride: { dangerous: [3, 7, 7, 8], why: 'weight class (11-06): on the table pull of 5, and on 6, a Melee and Healer pair 2-5 under the floor netted gold on Dangerous' },
  /* PARTY LEVEL XP (party-class-xp.js's row shape): better only with different classes (Tyler 10-31). With no row a mixed four read
     0.97-1.00 of its heroes alone and a tank's seat beside a Healer 0.91 (quick grade): the Slake's cells, the same shape. */
  partyClassXp: { 2: [960, 1160], 3: [960, 1120, 1240], 4: [960, 1120, 1230, 1230] },
  checks: { dropRef: { roles: ['tank'], full: true } },
  map,
});
