// src/data/grounds/pyre_field/pack.js — THE PYRE FIELD, Levels 70-90: the second ground built as a ground pack and the
// Barrow March's ground after the Slake (lane/b-pyre-field, designer 2026-11-08; the board's "Where the 50-plus band goes", row 4).
// Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new pyre_field --like the_slake --band 70,90` (the Slake: the
// March's pack with a six-pocket ring), then every row rewritten. The stat lines are the formula's
// (`node tools/pack.mjs propose pyre_field --write`).
//
// THE NAME is Tyler's call: "The Pyre Field" is the board's working name. To rename it, change hunt.name and the map's `name`; no
// item, monster or line of text names the place.
//
// NAMING VOICE (the Barrow March's, with the Hold's words added): the free company's soldier words (pike, provost, muster,
// colors), the fire's working words (pyre, stoke, rake, ash, char), and the Hold's (binder, shroud, roll). People get one
// short name (Hask, Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors, armor).
// THE STORY, each step from a place the player has already hunted or will: Hask sold the crossing and the Banded Company died at
// the Ford. The river took some (the Slake), the officers went into the Muster Barrows, and the rest were too many to bury. Lord
// Krell's Binders carried them up onto the high field and burned them on long rows of pyres, so they would not rise. They rose
// anyway: Krell's rite bound them to the fire instead of freeing them (Krell's Hold, 85-110, is the region's end). The Hold's
// woodmen who fed the pyres, the Stokers, died at their work and still feed them, and forged in the pyres' heat: the Emberforged
// gear is theirs. The company's camp dogs, the Lurchers, never left their dead and live off the ash. The Hearth lays the dead to
// rest: their Bone Chips burn at Inner Flame 40, Grave Dust at 46, a Lurcher's Razor Claw at 52, a Wraith Veil at 72.
//
// THE FIRE IS THIS GROUND'S LESSON. The class is Undead (a hammer breaks it, fire does 15% more, frost 25% less, poison 50% less).
// The pyres already burned the Charred Pikemen, the Stokers and the Provosts once: each overrides the ELEMENT axis, so fire does
// 25% less to them and frost does full (monster-classes.js: a stated profile replaces the class's). Two bodies differ the other
// way: the Pyre Wraith keeps the class's elements and overrides the WEAPON axis (a spell breaks Krell's binding: weak to magic),
// and the Lurchers are living dogs (Mammal: an arrow's ground, fire does 15% more). So the Mage brings Frost Lance and Chalked Ice
// Runes here, and a sword-and-shield hero's Flame Strike earns less than it does at the Slake (the bag guide below says so).
// A weakness is +20% damage and +15% accuracy (combat.js WEAKNESS_BONUS); a resistance is the bestiary's words only (no engine
// reads weaponResist, flagged to Systems by the Slake). Weights at density 4: hammer-weak 16 of 24, ranged-weak 4, magic-weak 4.
// The Slake is the sword's ground and this is the hammer's and the frost's: they disagree on purpose.
//
// THE LOOT (src/data/loot-bands.js). Scarce, about hourly a piece: the TIER-5 boots (Pikemen), legs (Stokers), helmets (Lurchers)
// and bodies (Provosts) in all three weights (worn from Level 60), and one tier-5 weapon on four bodies (sword, warhammer, staff,
// bow). Rare, each about every 15 h: the tier-5 belts (Stokers) and gloves (Lurchers), the Yew Wand and Yewclasp Spellbook (the
// Wraiths) and the Provosts' tier-6 weapons, worn from 75 (the Stokers forged them in the pyres' heat: Emberforged).
// RE-FIT FOR ONE DIFFICULTY (2026-11-10): a lone hero is paid the whole row now, not 0.55 of it, so every Scarce and Rare row came
// down (a Pikeman's boots 0.015 to 0.0115) except the Lurcher's, which went up to the 5% ceiling: the Kennels field one as built
// now, so it is met about 17 times an hour. MEASURED (drop-tables' hour, a lone tank at the floor in its full tier-5 set): each Scarce
// piece every 1.01-1.18 h, each Rare every 14.7-15.5 h.
// WHY TIER 5 AND NOT THE BOARD'S "T6 AT 75" (designer, measured 2026-11-08): tier 5 has no source anywhere (the board's home for
// it, the Muster Barrows, is a held party ground), so a lone hero reaches 70 in the Slake's tier 4 or the Warrens' tier 3. A tier-6
// Scarce set is worn only from 75, about 40 hunting hours past the floor: 40 hours of hourly drops nobody can wear. In the kit the
// game can give it today, a lone tank at the floor ate 14.4k g of food an hour against 8.5k coin (drop-tables, -31%). Tier 5
// is worn the hour it drops, and the tier-6 weapons keep the chase from 75 up. Tier-6 armor waits for Krell's Hold.
// THE SALE RATES (Phase 0, loot-bands.js VENDOR_GEAR_RATES): tier 5 sells at 0.033 of book and tier 6 at 0.015, so the hour's worn
// gear sells for well under half its coin (drop-tables gear-faucet) and a Rune Platebody still sells for more than a Mithril one.
// Commons feed the Hearth (Bone Chips, Grave Dust, Razor Claw, Wraith Veil, the bones) and the forge (Coal).
// THE COMMONS ARE THE HEARTH'S, NOT A PROFIT LEVER (NO PROFIT MOLDS, Tyler 2026-11-13: gold is printed, never a target). A Wraith leaves its
// veil two times in ten, a Lurcher its claw two in ten and Grave Dust drops three in ten, the Pyre Field's own rows as first built; the
// raise to 0.6 / 0.5 / 0.5 that paid a +25% floor is reverted. The hour's gold is printed by tests/hunt-core/drop-tables.mjs.
// Each body drops its own imbuement item, one of each of the five kinds, a Material that only sells until linings are built (its
// book value is twice its dropper's Level). The ground's named fuel, Pyre Ash (the board's), waits on a pack field for NAMED_FUELS
// (src/data/hearth.js): no row.
import { definePack, box, gather } from '../shape.js?v=0.2.129';
import map from './map.js?v=0.2.129';

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
    name: 'The Pyre Field', theme: 'Lord Krell\'s priests burned Hask\'s dead soldiers here. They keep getting back up.',
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
      /* P2 the Stokers' Yard: the Hold's wood, and the Stokers who still split it */
      box([3, 2, 25, 12], [14, 7], [ST, CP], [ST, PW, CP, CP, LU, CP]),
      /* P3 the Kennels: the burnt-out pits the Lurchers den in. A Lurcher and a Pikeman as built, the rest of the pack joining at three
         and up (2026-11-10: with three as built here and at the Ash Heaps a lone tank at the floor paid 26.8k g of food an hour, -13%) */
      box([35, 2, 55, 12], [45, 7], [LU, CP], [LU, LU, CP, ST, CP, LU]),
      /* P4 the Ash Heaps: the pyres that burned down, the Pikemen who crawled out of them, and a Provost driving them back. Two as
         built, the second Pikeman first to join (since one difficulty supplies are a fifth of the median way's income, the sheet's 10-35%) */
      box([39, 15, 57, 26], [51, 21], [CP, PV], [CP, ST, PW, CP, LU, CP]),
      /* P5 the Great Pyre: the officers' pyre, and the Provosts who still keep the company in line under it */
      box([23, 22, 36, 26], [32, 24], [PV, ST], [PV, PW, CP, CP, ST, CP]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08): a monster has its row's HP and pays its whole kill whoever fights it. There
       is no party scale, no solo or party label and no gate. `groupFit: 'both'` only picks the formula's stats (the same as 'solo')
       and orders the Hunts window's advice; no pocket asks for a party size and there is no soloFrom. On Normal every group meets the
       room as built (Tyler 2026-11-11: no party pull; the old [0, 3, 3, 4] is gone). Each harder tier brings ONE pull for every group
       (the tier row below). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11, "if they want bigger pulls they need to up the difficulty"; lane/d-packs-retune): a party
       meets the room as built, the same as a hero alone. A bigger pull is Dangerous or Deadly (the tier row), never a party's own. */
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): coal in the
       Stokers' Yard and the Ash Heaps, the pyres' charcoal (refKillMs the Slake's 12000). The ground wants an Emberstone Vein
       (gathering.js emberstone_rock, Mining 75: the tier-6 ore the Stokers forged with), which has no node kind or sprite yet. */
    gather: gather(12000, [['coal_rock', 7, 4, 2], ['coal_rock', 22, 8, 2], ['coal_rock', 48, 16, 4], ['coal_rock', 54, 20, 4]]),
  },
  /* THE BODIES. New drawings: the Charred Pikeman, the Stoker and the Lurcher. Re-pours: the Pyre Wraith (the March's wight, smoke
     grey) and the Provost (the Muster's barrow knight, burnt black). Each differs from its cousin in its weakness or resistance.
     THE LEVELS (2026-11-10, one difficulty): the Pikeman stands at the floor, as the Slake's and the Ford's commons do, and the others
     at +2, +4, +6 and +10 (were +2, +4, +6, +8 and +12 over the floor). */
  monsters: {
    charred_pikeman: {
      name: 'Charred Pikeman', icon: '💀', tier: 5, level: 70, cls: 'undead', family: 'Undead', speed: 3200,
      /* the swarm, the common majority: the company's foot, burned on the rows and risen out of the ash with the stub of a pike. Burned
         once (one override, element). Its boots, its sidearm, its burnt bones for the Hearth. */
      elements: BURNED,
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'pike_ferrule', ch: 0.08, band: 'uncommon' },
        { id: 'rune_boots', ch: 0.0115, band: 'scarce' }, { id: 'wyvernhide_boots', ch: 0.0115, band: 'scarce' }, { id: 'sorcerer_boots', ch: 0.0115, band: 'scarce' },
        { id: 'rune_sword', ch: 0.0115, band: 'scarce' }],
      hp: 93, atk: 48, baseAcc: 1.1, def: 28, xp: 813, gp: [20, 58], formula: true },
    stoker: {
      name: 'Stoker', icon: '🪵', tier: 5, level: 74, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank, the slowest thing on the field: the Hold's woodmen who fed the pyres and forged in their heat. Worked in the
         fire all their lives (one override, element). The coal they carry, their smith's hammer, the apron's legs and belts. */
      elements: BURNED,
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'rake_tine', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platelegs', ch: 0.029, band: 'scarce' }, { id: 'wyvernhide_pants', ch: 0.029, band: 'scarce' }, { id: 'sorcerer_pants', ch: 0.029, band: 'scarce' },
        { id: 'rune_warhammer', ch: 0.029, band: 'scarce' },
        { id: 'rune_belt', ch: 0.0019, band: 'rare' }, { id: 'wyvernhide_belt', ch: 0.0019, band: 'rare' }, { id: 'sorcerer_belt', ch: 0.0019, band: 'rare' }],
      hp: 147, atk: 47, baseAcc: 1.14, def: 45, xp: 1445, gp: [31, 92], formula: true },
    lurcher: {
      name: 'Lurcher', icon: '🐕', tier: 5, level: 72, cls: 'mammal', family: 'Mammal', speed: 4600,
      /* the skirmisher: the company's camp dogs, lean and quick enough to run down a kiter, who never left their dead. Living, so the
         Mammal class with no override: an arrow's mark, fire does more. They worry the helmets off the dead, chew the gloves, and
         dig the claws sharp in the ash. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'razor_claw', ch: 0.2, band: 'common' }, { id: 'kennel_tag', ch: 0.08, band: 'uncommon' },
        { id: 'rune_helm', ch: 0.05, band: 'scarce' }, { id: 'wyvernhide_helmet', ch: 0.05, band: 'scarce' }, { id: 'sorcerer_helmet', ch: 0.05, band: 'scarce' },
        { id: 'rune_gauntlets', ch: 0.0039, band: 'rare' }, { id: 'wyvernhide_gloves', ch: 0.0039, band: 'rare' }, { id: 'sorcerer_gloves', ch: 0.0039, band: 'rare' }],
      hp: 90, atk: 64, baseAcc: 0.91, def: 29, xp: 955, gp: [19, 57], formula: true },
    pyre_wraith: {
      name: 'Pyre Wraith', icon: '👻', tier: 5, level: 76, cls: 'undead', family: 'Undead', speed: 3600,
      /* the regular: a dead man Krell's rite bound into the pyre smoke, still in his shroud. A spell undoes the binding and a blade goes
         through smoke (one override, weapon: weak to magic). Its veil and its grave dust for the Hearth, the Binder's staff, and the
         Binders' books it guards: the caster's prizes. */
      weaponWeak: 'magic', weaponResist: ['sword'],
      drops: [{ id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'wraith_veil', ch: 0.2, band: 'common' }, { id: 'shroud_pin', ch: 0.08, band: 'uncommon' },
        { id: 'yew_staff', ch: 0.028, band: 'scarce' },
        { id: 'yew_wand', ch: 0.0019, band: 'rare' }, { id: 'yew_spellbook', ch: 0.0019, band: 'rare' }],
      hp: 126, atk: 61, baseAcc: 1, def: 34, xp: 1138, gp: [26, 80], formula: true },
    provost: {
      name: 'Provost', icon: '⚔️', tier: 5, level: 80, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier: the company's provosts, who hanged its deserters (Wickstead's Turncoats ran from them), burned
         in their plate on the officers' pyre and still keep the dead in line under it. Burned once (one override, element), so it
         differs from the barrow knight it is poured from. The bodies, the bow they shot runaways with, and the Stokers' best work, the
         Emberforged weapons the company's officers were burned with. */
      elements: BURNED,
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'warrant_seal', ch: 0.1, band: 'uncommon' },
        { id: 'rune_platebody', ch: 0.029, band: 'scarce' }, { id: 'wyvernhide_body', ch: 0.029, band: 'scarce' }, { id: 'sorcerer_body', ch: 0.029, band: 'scarce' },
        { id: 'yew_bow', ch: 0.029, band: 'scarce' },
        { id: 'ember_sword', ch: 0.002, band: 'rare' }, { id: 'ember_warhammer', ch: 0.002, band: 'rare' }, { id: 'runewood_bow', ch: 0.002, band: 'rare' },
        { id: 'runewood_staff', ch: 0.002, band: 'rare' }, { id: 'runewood_wand', ch: 0.002, band: 'rare' }, { id: 'runewood_codex', ch: 0.002, band: 'rare' },
        { id: 'ember_hatchets', ch: 0.002, band: 'rare' }, { id: 'runewood_crossbow', ch: 0.002, band: 'rare' }],
      hp: 212, atk: 63, baseAcc: 1.04, def: 56, xp: 2248, gp: [45, 133], formula: true },
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
    pike_ferrule: { n: 'Pike Ferrule', icon: '🔩', v: 140, raw: true, imbue: { kind: 'ward', tier: 2 } },
    rake_tine: { n: 'Rake Tine', icon: '🪝', v: 148, raw: true, imbue: { kind: 'keen', tier: 2 } },
    kennel_tag: { n: 'Kennel Tag', icon: '🏷️', v: 144, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
    shroud_pin: { n: 'Shroud Pin', icon: '📍', v: 152, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    warrant_seal: { n: 'Warrant Seal', icon: '🔘', v: 160, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
  },
  /* THE ITEM LINES are player text (Tyler 2026-11-11, the voice rule): short, plain, everyday words, nothing poetic. Names stay. */
  itemText: {
    pike_ferrule: 'The metal cap off the end of a Charred Pikeman\'s spear. The fire burned the rest of it',
    rake_tine: 'A bent prong off a Stoker\'s fire rake. It\'s black from years in the fire',
    kennel_tag: 'The brass tag off a Lurcher\'s collar. It still has Hask\'s mark on it',
    shroud_pin: 'The bone pin that held a Pyre Wraith\'s burial cloth shut',
    warrant_seal: 'The lead seal off a Provost\'s hanging order. The paper burned, but the seal didn\'t',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Slake's store food and drink, and Chalked Ice Runes for Frost Lance in
     place of Fire Runes (the burned dead take 25% less fire and full frost). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_ice_rune', qty: 650 } } },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT). The sheet asks the median lone way at the band middle (80) for 0.90-1.10 of the pace
     contract. Since one difficulty a lone hero fights a body's whole HP for its whole kill: at the old 1.18 the median of the quick
     grade's four ways read 1.20, and at 0.98 the median of the full grade's eight ways read 0.86 (as opened). At 1.14 the eight read 1.00. */
  /* RE-FITTED (lane/d-packs-retune, 2026-11-12): under solo +15% (Tyler 2026-11-11) and the re-pinned, flatter contract (core-model.js LEVEL_PACE.contract,
     407k an hour at 80) the median lone way read 1.41 of the contract at the band middle at 1.14 (quick grade, 1 seed x 1 h). 1.14 / 1.41 = 0.81.
     On the full grade (the median of 8 lone ways) 0.81 read 0.86, so 0.94 (about 1.00). */
  xpFit: { k: 0.94, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  /* THE TIER PULLS (TIER_PULL_OVERRIDES' shape: ONE number a tier for every group), measured as opened, full grade. Dangerous brings six,
     one over the table's five: on five a Melee and Healer pair two Levels under the floor still netted gold on Dangerous, where the
     weight-class ruling (11-06) asks them to lose it. On six they lose 1.9k an hour, 3.4k three under and 7.5k five under. Deadly brings six
     too, two under the table's eight: on eight a four with no Healer died 30 times in 16 hero-hours at the floor, on seven 36, on six 3
     (the sheet allows 9; with a Healer 2, 3 and 0). It can't go under Dangerous (tests/hunt-core/hunt-tiers.mjs rows), so here the two
     tiers bring the same number and Deadly is the harder blow, the thicker body and the bigger XP. On six a four with a Healer earns
     1.28 of its Normal XP on Deadly (the sheet asks 1.25) and 1.23 on Dangerous (1.10). */
  tierOverride: { dangerous: 6, deadly: 6, why: 'Dangerous and Deadly both bring six monsters at once here. With five, a pair a couple of Levels too low still made money on Dangerous. With eight, a group of four with no Healer kept dying on Deadly' },
  /* PARTY LEVEL XP (party-class-xp.js's row shape: heroes alive -> permille at 1, 2, ... classes, each class paying more). The four-xp
     ruling (10-25) reads a four a head against the median lone way, 1.15-1.25 at the floor, middle and top. As opened, full grade, on
     Normal's pull of four: the four with a Healer reads 1.41, 1.36, 1.32 against the four with no Healer (three classes) 1.34, 1.31, 1.26
     at cells 1640 and 1635. Both fall about 7% from the floor to the top and the Healer's four stands about 4% over the other, a 12%
     spread the ruling's 8.7% can't hold with one pair of cells, and the four-class cell must pay more than the three-class one. At 1472
     and 1473 the six read 1.27, 1.23, 1.18 and 1.21, 1.18, 1.13: two rows OPEN, each about 1.5% out (the lane's report, CONFLICTS.md).
     Measured and rejected: Normal's pull of six for a four fits the four-xp band (1.15-1.25) but brings a four the same six on Deadly, so
     Deadly earns it 1.16 of Normal where the sheet asks 1.25 (1.20 on a pull of five); a 45 s respawn moved the solos as much as the
     fours. Trios and pairs are on the table's pull of three: a tank, Healer and bow trio reads 1.10-1.17, a trio with no tank
     1.27-1.34 (trio-xp is advisory, 1.10-1.20), the pairs 1.06-1.14. The one-class cells hold every one-class party under its heroes
     alone (tests/party-class-xp-line.mjs, bar 1.00): at 1150 four bows at 8 each read 1.000 of the same bows alone at their better
     pull, so the one-class four is 1120. */
  /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11; lane/d-packs-retune, 2026-11-12; the Ford's note says the method). The party pull of
     [0, 3, 3, 4] is gone, so a party walks the room as built (two a pocket) and splits each kill: at the cells above the four of four classes read
     0.71 / 0.64 of the median lone way at the floor and middle (quick grade) and the tank and Healer pair 0.79 / 0.74. The four's 1473 x 1.20 / 0.675
     = 2620 (the three-class four 2615: the two read within 2% of each other on this ground), the two-class four 2340, the pair 1170 x 1.10 / 0.765 =
     1685, the threes x1.6 (2150, 2320). One-class cells stay (1120 and 1150 hold every one-class party under solo, party-class-xp-line). A four
     falls about 10% from the floor to the middle here (a 20-Level band): the full grade says whether one cell can hold the floor, middle and top.
     THE FULL GRADE'S READ (8 lone ways, 6 seeds x 4 h; parties 2 x 2 h): the median of eight lone ways sits under the quick grade's four, so the contract
     read lower and every mixed cell higher than the quick grade said. At 2620 the four with a Healer read 1.43 / 1.32 / 1.26 at the floor, middle and top and the four with no Healer 1.39 / 1.30 /
     1.24 at 2615: a four FALLS 13.5% FROM THE FLOOR TO THE TOP of this 20-Level band, and the band is 8.7% wide, so no one cell holds all three
     Levels. Centred on the middle: the four 2380 (about 1.30 / 1.20 / 1.145) over 2375, the pair 1465 (about 1.04-1.13), the threes 1830 and 1695
     (about 1.06-1.26). The floor row reads over and the top row a hair under: Tyler's call (the board, 2026-11-12 Packs re-tuned). */
  /* TIER-5 AND -6 HATCHETS AND CROSSBOW (lane/d-barrow-data, 2026-11-13): the axes and crossbow ways alone now wear those rungs, so the median
     lone way rose: on the full grade the fours read 1.11 (no Healer) and 1.13 at the middle and the tank and Healer pair 0.99 at the top. Each
     cell scaled to its target: the fours 2375 x 1.18 / 1.11 = 2525 and 2380 x 1.18 / 1.13 = 2485, the pair 1465 x 1.04 / 0.99 = 1540. */
  partyClassXp: { 2: [990, 1540], 3: [1150, 1695, 1830], 4: [1120, 2130, 2525, 2485] },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives,
     measured at the floor on the default pull (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, 2026-11-10). One class is the
     mean of its five one-class parties (pairs 0.84-0.90, threes 0.83-0.94, fours 0.79-0.91 at 1150, times 1120/1150). Two of two is the
     mean of three mixes (0.97-1.04), three of three of two (1.07, 1.11), four of four the one played (1.09). The cells between are the
     size's mix times the cell ratio. */
  /* RE-MEASURED 2026-11-12 (lane/d-packs-retune; tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, every pack
     under this one open on the ladder). One class is the mean of its five one-class parties (pairs 0.60-0.72, threes 0.48-0.70, fours 0.36-0.57), two of two the mean of three mixes, three of three of two,
     four of four the one played (pairs 0.92-1.05, threes 0.91-1.00, the four 1.02: a Mage or a Healer alone earns the most here, so a mix reads near even against its own heroes while it reads 1.20 against the median lone way, the band the grader binds); the cells between are the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { 2: [-35, -5], 3: [-40, -10, -5], 4: [-50, -10, 0, 0] },
  /* THE PACK'S TEST FACTS (re-pinned 2026-11-10 for one difficulty). dropRef: a lone tank at the floor in its full own-tier set
     (tests/hunt-core/drop-tables.mjs, the harness's tier-5 kit). valueToday is COMPUTED, the 11-09 method: the hour's expected coin
     (10,090 g) and commons (3,930; re-pinned 2026-11-13 with the commons reverted) plus the gear-faucet's half of the coin (5,045). The
     hour's gear sells for 2,977 g (30% of the coin) at the tier-5 rate of 0.033, and the guard reads the caps as holding up to 0.05.
     No room holders (every placed body has a spawn weight) and no one-tile bridge. */
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 19065 },
  map,
});
