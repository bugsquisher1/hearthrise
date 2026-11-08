// src/data/grounds/the_slake/pack.js — THE SLAKE, Levels 50-65, solo first: the first ground built as a ground pack
// (lane/b-the-slake, designer 2026-11-07; the board's "2026-11-05 Ground Packs" section 4). Shape: src/data/grounds/shape.js.
// Started from `node tools/pack.mjs new the_slake --like wickstead --band 50,65` (Wickstead: the solo-first template with a
// six-pocket ring), then every row rewritten. The stat lines are the formula's (`node tools/pack.mjs propose the_slake --write`).
//
// THE NAME is Tyler's call: "The Slake" is the working name (a north-country word for a river mudflat), "The Wrack" the fallback.
// To rename it, change hunt.name and the map's `name`; no item, monster or line of text names the place.
//
// NAMING VOICE (the Barrow March's; Hask's Ford wrote it first): a free company's soldier words (banded, pike, muster, colors,
// sergeant), the river's working words (barge, tow path, stake net, mudlark), the March's place words (barrow, ford, slake).
// People get one short name (Hask). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors).
// THE STORY, each step from a place the player has already hunted: the Warrens' copper hill feeds the Meadowbrook's springs (the
// Glade: "the copper water makes the moss glow"), the brook leaves the wood at Wickstead, and below Hask's Ford the river slows and
// drops what it carries: copper silt and the Banded Company's dead. They lay in it for years and went green. Hask sold the crossing,
// so the company's supply barge never got back upstream and broke its back on the middle bar. The river's scavengers, the mudlarks,
// picked the dead and drowned among them. Wickstead's Turncoats are the company's last deserters. The Hearth lays the dead to rest:
// their Grave Dust burns at Inner Flame 46.
//
// THE COUSIN OF THE FORD: same dead, other answers. The Ford's dead all break to a hammer. Here the commonest is weak to a sword, the
// Bargeman to an arrow, the Mudlark to a spell, and the one hammer-weak body is the rare Color Sergeant who carries the caster's
// prizes. A weakness is +20% damage and +15% accuracy (combat.js WEAKNESS_BONUS). A resistance is the bestiary's words only: no
// engine reads weaponResist today (flagged to Systems), so the hammer's area blows still earn well here.
//
// THE LOOT (src/data/loot-bands.js): the tier-4 set in all three weights about hourly (Pikemen boots, Bargemen legs, Mudlarks
// helmets, the Sergeant's bodies), one tier-4 weapon on each body (sword, warhammer, bow, staff), and the Rares the tier-4 gloves
// (Mudlarks), belts (Bargemen) and the Maple Wand and Maplebound Spellbook (the Sergeant), each about every 15 h. The first source
// of any tier-4 piece in the game. Its odds are set from the kills a lone tank makes at the floor (tests/hunt-core/drop-tables.mjs).
// The Sergeant's four rows sit at the 5% Scarce ceiling (about every 1.3 h): he is 2 of the 24 bodies. The tier-4 gear sells at the
// tier-3 rate (loot-bands.js VENDOR_GEAR_RATES stops at tier 3) until Phase 0's ruled tier-4 0.075 lands; at 0.14 the hour's gear
// sells for more than half its coin (drop-tables gear-faucet), so this pack ships with or after that rate. Commons feed the Hearth (Grave Dust at 46, Bone Chips at 40, Big Bones) and the forge (Coal, Copper Ore). Each body
// drops its own imbuement item, kept for the imbuer (catalogue-coherence.js VENDOR_TRASH until imbuing is built).
import { definePack, box } from '../shape.js?v=0.2.106';
import map from './map.js?v=0.2.106';

const PK = 'greened_pikeman', BG = 'bargeman', ML = 'mudlark', CS = 'color_sergeant';

export default definePack({
  id: 'the_slake',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 12 Pikemen, 6 Bargemen, 4 Mudlarks and the
     2 Sergeants who hold the barge. */
  hunt: {
    name: 'The Slake', theme: 'The Meadowbrook drops its copper here, and the Banded Company\'s dead with it.',
    band: [50, 65],
    spawns: [{ monster: PK, w: 12, rarity: 'common' }, { monster: BG, w: 6, rarity: 'uncommon' },
      { monster: ML, w: 4, rarity: 'uncommon' }, { monster: CS, w: 2, rarity: 'rare' }],
    family: 'Undead', art: PK, travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE ROUTE, a ring: along the north bar, over the east shallows to the Greenbar, over again to the Mudlark Holes, west along the
     Low Flats, over the wide shallows to the Grounded Barge, and back over the west shallows to the road. */
  ground: {
    map: 'the_slake',
    /* on the road in, one tile a seat */
    start: [[13, 1], [14, 1], [12, 1], [15, 1]],
    pockets: [
      /* P0 the Tow Path: the first pull, the company's foot */
      box([8, 2, 24, 9], [15, 6], [PK, PK], [BG, PK, ML, PK, BG, PK]),
      /* P1 the Stake Nets: the dead the nets caught, and the Mudlarks picking them */
      box([33, 2, 52, 9], [42, 6], [PK, ML], [PK, PK, ML, BG, PK, ML]),
      /* P2 the Greenbar: the bar the copper greens worst */
      box([38, 15, 57, 24], [48, 19], [PK, PK], [BG, PK, CS, PK, BG, ML]),
      /* P3 the Mudlark Holes: their burrows in the south bank. Three come out at once (as built), so a lone hero's Normal costs real
         food (two a pocket left the median way's supplies at 9% of its income, the sheet's floor is 10%) */
      box([33, 30, 55, 37], [40, 34], [ML, PK, ML], [BG, ML, PK, BG, PK]),
      /* P4 the Low Flats: the barge's crew, walked off the wreck, two Bargemen as built */
      box([3, 30, 22, 37], [9, 34], [BG, BG], [PK, ML, PK, BG, PK, ML]),
      /* P5 the Grounded Barge: the Color Sergeants hold the hull */
      box([13, 15, 26, 24], [20, 19], [CS, BG], [PK, CS, BG, PK, PK, ML]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    respawnMs: 60000, pullDist: 1.5, partyScale: true, groupFit: 'solo',
    densityMax: [8, 8, 8, 8],
    partyPull: [0, 3, 3, 4],
  },
  /* THE BODIES (art brief 01 and 06): the Mudlark, the Greened Pikeman and the Bargeman are new drawings; the Color Sergeant is a
     verdigris re-pour of the Ford's Bannerman. Each differs from its Ford cousin in its weakness or resistance (pack-distinct).
     The class is Undead (hammer weak, poison and frost do less, fire more); each overrides at most the weapon axis. */
  monsters: {
    greened_pikeman: {
      name: 'Greened Pikeman', icon: '💀', tier: 4, level: 52, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot after years in the copper silt. A blade finds the joints (one override,
         weapon: weak to the sword, where every Ford body breaks to a hammer; its resistance is the bestiary's words, no engine reads
         one). Played as a regular it bit harder, and a four with no Healer died 33 times in 16 hours on Deadly at the floor (the sheet
         allows 9): the swarm it stays. Its boots and its sidearm. */
      weaponWeak: 'sword', weaponResist: ['hammer'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'copper_ore', ch: 0.4, band: 'common' }, { id: 'green_rivet', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_boots', ch: 0.011, band: 'scarce' }, { id: 'snakeskin_boots', ch: 0.011, band: 'scarce' }, { id: 'warlock_boots', ch: 0.011, band: 'scarce' },
        { id: 'mithril_sword', ch: 0.011, band: 'scarce' }],
      hp: 70, atk: 28, baseAcc: 1.14, def: 18, xp: 809, gp: [15, 44], formula: true },
    bargeman: {
      name: 'Bargeman', icon: '🧟', tier: 4, level: 55, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank, the slowest thing on the flat: the barge's crew. Where the Fordsunk's bloat swallows arrows, the crew's cracked
         hides take them (one override, weapon). The barge's forge cargo, its smith's hammer, the crew's belts. */
      weaponWeak: 'ranged', weaponResist: [],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.4, band: 'common' }, { id: 'barge_nail', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platelegs', ch: 0.022, band: 'scarce' }, { id: 'snakeskin_pants', ch: 0.022, band: 'scarce' }, { id: 'warlock_pants', ch: 0.022, band: 'scarce' },
        { id: 'mithril_warhammer', ch: 0.022, band: 'scarce' },
        { id: 'mithril_belt', ch: 0.0015, band: 'rare' }, { id: 'snakeskin_belt', ch: 0.0015, band: 'rare' }, { id: 'warlock_belt', ch: 0.0015, band: 'rare' }],
      hp: 111, atk: 28, baseAcc: 1.14, def: 31, xp: 1444, gp: [23, 70], formula: true },
    mudlark: {
      name: 'Mudlark', icon: '🪝', tier: 4, level: 54, cls: 'undead', family: 'Undead', speed: 4400,
      /* the skirmisher: the river scavengers who picked the dead and drowned among them, small, crouched and quick enough to catch
         a kiter. Arrows go over a body that low, a spell does not (one override, weapon). It picks the helmets and gloves off the
         dead, and a bow, and the Grave Dust goes in the sack with them. */
      weaponWeak: 'magic', weaponResist: ['ranged'],
      drops: [{ id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'grave_dust', ch: 0.16, band: 'common' }, { id: 'mudlark_hook', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_helm', ch: 0.021, band: 'scarce' }, { id: 'snakeskin_helmet', ch: 0.021, band: 'scarce' }, { id: 'warlock_helmet', ch: 0.021, band: 'scarce' },
        { id: 'maple_bow', ch: 0.021, band: 'scarce' },
        { id: 'mithril_gauntlets', ch: 0.0014, band: 'rare' }, { id: 'snakeskin_gloves', ch: 0.0014, band: 'rare' }, { id: 'warlock_gloves', ch: 0.0014, band: 'rare' }],
      hp: 68, atk: 38, baseAcc: 1.07, def: 19, xp: 958, gp: [14, 43], formula: true },
    color_sergeant: {
      name: 'Color Sergeant', icon: '🚩', tier: 4, level: 60, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier, who holds the grounded barge with the company's colors. No override: the one body on the
         flat a hammer breaks (the Ford's Bannerman turns an arrow). The bodies, the staff, and the caster's prizes. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'color_cord', ch: 0.1, band: 'uncommon' },
        { id: 'mithril_platebody', ch: 0.05, band: 'scarce' }, { id: 'snakeskin_body', ch: 0.05, band: 'scarce' }, { id: 'warlock_body', ch: 0.05, band: 'scarce' },
        { id: 'maple_staff', ch: 0.05, band: 'scarce' },
        { id: 'maple_wand', ch: 0.0045, band: 'rare' }, { id: 'maple_spellbook', ch: 0.0045, band: 'rare' }],
      hp: 161, atk: 38, baseAcc: 1.14, def: 39, xp: 2267, gp: [34, 101], formula: true },
  },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT): on the formula's rows the median way at the band middle (58) earned 0.72 of the pace
     contract as opened (its own tier-4 set) and 0.70 in the Warrens' tier-3 set, where the sheet asks 0.90-1.10. The formula's XP a
     point was fitted from the Thicket to the Warrens; at Level 50 the tier-4 armor's defense jump (plate 66 to 104 over six slots)
     shortens no kill, so the curve runs under the contract, not the layout. */
  /* THE PARTY'S DANGEROUS PULL, one up (TIER_PULL_OVERRIDES' shape): on the table's 5 a Melee and Healer pair two or three Levels under
     the floor netted +2.7k to +3.3k an hour on Dangerous, where the weight-class ruling (11-06) asks them to lose gold (at 6 they
     lose 20-24%, a bow and hammer pair 75% and dies). Five under, the Melee and Healer pair still never dies: the Healer and food
     bought per use keep a pair up on Dangerous on every ground (the v0.2.106 grade fails the same row on five of six). A lone hero
     keeps the table's 3. */
  tierOverride: { dangerous: [3, 6, 6, 7], why: 'weight class (11-06): on the table pull of 5 a Melee and Healer pair 2-3 under the floor netted gold on Dangerous' },
  xpFit: { k: 1.4, why: 'the formula pays 0.72 of the pace contract at the band middle (58), measured as opened over the 8 ways of a full grade' },
  roster: {
    greened_pikeman: 'swarm',   // the common majority
    bargeman: 'heavy',          // the tank: slow (2400), thick
    mudlark: 'glass',           // quick (4400), fragile, lands often
    color_sergeant: 'elite',    // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw). A
     ward and a keen, a life leech and an element ward: the March's soldiers' kinds, where the Sewer and Wickstead fed casters. */
  items: {
    green_rivet: { n: 'Green Rivet', icon: '🔩', v: 104, raw: true, imbue: { kind: 'ward', tier: 2 } },
    barge_nail: { n: 'Barge Nail', icon: '📌', v: 110, raw: true, imbue: { kind: 'keen', tier: 2 } },
    mudlark_hook: { n: 'Mudlark Hook', icon: '🪝', v: 108, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
    color_cord: { n: 'Color Cord', icon: '🎗️', v: 120, raw: true, imbue: { kind: 'element_ward', tier: 2 } },
  },
  itemText: {
    green_rivet: 'A copper rivet off a Greened Pikeman\'s harness, gone green in the river silt',
    barge_nail: 'A long iron nail a Bargeman worked loose from the grounded supply barge',
    mudlark_hook: 'The short iron boathook a Mudlark picked the drowned dead with, green at the point',
    color_cord: 'The cord a Color Sergeant tied the company\'s colors to their staff with',
  },
  /* PARTY LEVEL XP (party-class-xp.js's row shape: heroes alive -> permille at 1, 2, ... classes): better only with different
     classes (Tyler 10-31). Measured on the grader with no row (every cell 1000): a mixed four read 0.98-1.03 of the same heroes
     alone (the ruling's 1.15-1.25) and a tank's seat beside a Healer 0.85-0.92, under going alone. The cells lift the mixed seats
     and keep one class under the even share. The four with a Healer reads about 4% more over its heroes alone than the four with a
     second Melee, so its 4-class cell sits under the 3-class one: both read 1.15-1.25 (grade full, as opened). */
  partyClassXp: { 2: [960, 1160], 3: [960, 1120, 1240], 4: [960, 1120, 1230, 1200] },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives,
     measured as opened at the band middle (58) on the house plan b1102p's parties, 1 h x 2 seeds, the default pull. Two measures
     part here: against the median lone way the grader reads a mixed four at 1.18-1.23 (the ruling's 1.15-1.25), but a Mage or a
     Healer alone earns 40-90% over the median way at 50-65, so against its own heroes alone a four reads only +5%. */
  partyVsAlone: { 2: [-10, 0], 3: [-20, -10, 0], 4: [-15, -5, 5, 5] },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Warrens' tier-3 store food, the cheapest heal an HP (Salted Lobster, 0.83 g
     an HP; the tier-4 Swordfish is 1.50). Quantities are about three hours of the measured eating (checks below). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 80 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 8813 },
  map,
});
