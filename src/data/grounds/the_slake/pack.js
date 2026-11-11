// src/data/grounds/the_slake/pack.js — THE SLAKE, Levels 50-65, solo first: the first ground built as a ground pack
// (lane/b-the-slake, designer 2026-11-07; the board's "2026-11-05 Ground Packs" section 4). Shape: src/data/grounds/shape.js.
// RE-FITTED 2026-11-10 (lane/b-slake-and-ford) for one difficulty, the re-fitted Level curve and the tier-4 sale rate. The stat
// lines are the formula's (`node tools/pack.mjs propose the_slake --write`).
//
// THE NAME is Tyler's call: "The Slake" is the working name (a north-country word for a river mudflat), "The Wrack" the fallback.
// To rename it, change hunt.name and the map's `name`. No item, monster or line of text names the place.
//
// NAMING VOICE (the Barrow March's, Hask's Ford wrote it first): a free company's soldier words (banded, pike, muster, colors,
// sergeant), the river's working words (barge, tow path, stake net, mudlark), the March's place words (barrow, ford, slake).
// People get one short name (Hask, Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors).
// THE STORY, each step from a place the player has already hunted: the Warrens' copper hill feeds the Meadowbrook's springs (the
// Glade: "the copper water makes the moss glow"), the brook leaves the wood at Wickstead, and below Hask's Ford the river slows and
// drops what it carries: copper silt and the Banded Company's dead. They lay in it for years and went green. Hask sold the crossing
// to Lord Krell, so the company's supply barge never got back upstream and broke its back on the middle bar. The river's
// scavengers, the mudlarks, picked the dead and drowned among them. The Hearth lays the dead to rest: their Grave Dust burns at
// Inner Flame 46.
//
// ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08). A monster has its row's HP and pays its whole kill whoever fights it. There is
// no party scale and no party gate. `groupFit: 'solo'` only picks the formula's solo stats and orders the Hunts window's advice.
// `partyPull` is Normal's pull for a party, as the Glade and Wickstead carry it. Each harder tier brings ONE pull for every group.
//
// THE COUSIN OF THE FORD: same dead, other answers. The Ford's dead all break to a hammer. Here the commonest is weak to a sword,
// the Bargeman to an arrow, the Mudlark to a spell, and the one hammer-weak body is the rare Color Sergeant. A weakness is +20%
// damage and +15% accuracy (combat.js WEAKNESS_BONUS). A resistance is the bestiary's words only: no engine reads weaponResist
// today (flagged to Systems), so the hammer's area blows still earn well here.
//
// THE LOOT (src/data/loot-bands.js). THE TIER-4 WEAPONS' HOME: one on each body, about hourly (sword, warhammer, bow, staff), and
// the Maple Wand and Maplebound Spellbook as the Sergeant's Rares. The tier-4 armor comes here as it does at the Ford, in all three
// weights, each piece about hourly (Pikemen boots, Bargemen legs, Mudlarks helmets, the Sergeant's bodies), with the gloves
// (Mudlarks) and belts (Bargemen) as Rares, each about every 15 h. The Mithril Hatchets and the Maple Crossbow drop nowhere: a
// smith and a fletcher make them (style-gear.js). MEASURED (tests/hunt-core/drop-tables.mjs, a lone tank at the floor in the
// full set, one played hour): each Scarce piece every 0.91-1.08 h, each Rare every 13.8-16.2 h, coin 8,679 g, commons 943 g, gear
// 2,539 g (29% of the coin, the cap is 50%) at the tier-4 sale rate of 0.075.
// Commons feed the Hearth (Grave Dust at 46, Bone Chips at 40, Big Bones) and the forge (Coal, Copper Ore). Each body drops its own
// imbuement item, a Material that only sells until linings are built (the board, "2026-11-10 Resistance and imbuements"). The
// Color Cord is the fire lining's piece for the Pyre Field.
//
// A SPELL ROW THAT WAITS: the Bargeman's Cold Bilge (whole group, frost; the area spells board's seed row). Monster area spells
// are not live, so this pack is tuned without it. When lane/b-area-set lands, the Bargeman's row and the harder tiers here are
// measured again.
import { definePack, box, gather } from '../shape.js?v=0.2.116';
import map from './map.js?v=0.2.116';

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
    /* TWO AS BUILT IN EVERY POCKET, AND A PIKEMAN IN EACH (2026-11-10). Since one difficulty a lone hero fights the whole HP of
       every body. With three out of the Mudlark Holes, two Bargemen on the Low Flats and a Bargeman beside the Sergeant as built,
       a lone tank at the floor paid 76% of its income in food (as opened, 1 seed x 1 h). The harder bodies now join at three and four. */
    pockets: [
      /* P0 the Tow Path: the first pull, the company's foot */
      box([8, 2, 24, 9], [15, 6], [PK, PK], [BG, PK, ML, PK, BG, PK]),
      /* P1 the Stake Nets: the dead the nets caught, and a Mudlark picking them */
      box([33, 2, 52, 9], [42, 6], [PK, ML], [PK, PK, ML, BG, PK, ML]),
      /* P2 the Greenbar: the bar the copper greens worst */
      box([38, 15, 57, 24], [48, 19], [PK, PK], [BG, PK, CS, PK, BG, ML]),
      /* P3 the Mudlark Holes: their burrows in the south bank */
      box([33, 30, 55, 37], [40, 34], [ML, PK], [ML, BG, ML, PK, BG, PK]),
      /* P4 the Low Flats: the barge's crew, walked off the wreck. One Bargeman as built, a second at three */
      box([3, 30, 22, 37], [9, 34], [BG, PK], [BG, ML, PK, BG, PK, ML]),
      /* P5 the Grounded Barge: a Color Sergeant holds the hull, a second comes at four */
      box([13, 15, 26, 24], [20, 19], [CS, PK], [BG, CS, BG, PK, PK, ML]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    respawnMs: 60000, pullDist: 1.5, groupFit: 'solo',
    densityMax: [8, 8, 8, 8],
    /* NORMAL'S PULL FOR A PARTY (hunt-grounds.js partyPull, the Glade's and Wickstead's): a pair and a three bring three, a four
       brings four. A lone hero's pockets are as built. */
    partyPull: [0, 3, 3, 4],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): oaks on the north
       and south banks, as the Ford placed them (refKillMs its 12000). The March kit has no tree node of its own: the art director's read
       keeps oak off the March, so these swap to a March tree kind (a bank maple or willow, the tier-4 bow and staff wood) when one exists. */
    gather: gather(12000, [['oak_tree', 9, 4, 0], ['oak_tree', 21, 8, 0], ['oak_tree', 5, 34, 4], ['oak_tree', 18, 32, 4]]),
  },
  /* THE BODIES (art brief 01 and 06): the Mudlark is a new drawing. The Greened Pikeman, the Bargeman and the Color Sergeant are
     verdigris re-pours of the Ford's Pikeman, Fordsunk and Bannerman. Each differs from its Ford cousin in its weakness.
     The class is Undead (hammer weak, poison and frost do less, fire more). Each overrides at most the weapon axis.
     THE LEVELS (2026-11-10): the Pikeman stands at the floor, as the Thicket's Whelp and the Glade's Crow do, and the others at
     +2, +4 and +8. At 52, 54, 55 and 60 a sword alone cleared +15% over its bill at the floor, where the rule is +25% for every way
     to fight. At these it clears +43% (as opened, 4 seeds x 1 h). */
  monsters: {
    greened_pikeman: {
      name: 'Greened Pikeman', icon: '💀', tier: 4, level: 50, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot after years in the copper silt. A blade finds the joints (one override,
         weapon: weak to the sword, where every Ford body breaks to a hammer). Its boots and its sidearm. */
      weaponWeak: 'sword', weaponResist: ['hammer'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'copper_ore', ch: 0.4, band: 'common' }, { id: 'green_rivet', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_boots', ch: 0.0057, band: 'scarce' }, { id: 'snakeskin_boots', ch: 0.0057, band: 'scarce' }, { id: 'warlock_boots', ch: 0.0057, band: 'scarce' },
        { id: 'mithril_sword', ch: 0.0057, band: 'scarce' }],
      hp: 68, atk: 28, baseAcc: 1.1, def: 17, xp: 674, gp: [14, 43], formula: true },
    bargeman: {
      name: 'Bargeman', icon: '🧟', tier: 4, level: 54, cls: 'undead', family: 'Undead', speed: 2400,
      /* the tank, the slowest thing on the flat: the barge's crew. Where the Fordsunk's bloat swallows arrows, the crew's cracked
         hides take them (one override, weapon). The barge's forge cargo, its smith's hammer, the crew's belts. A lone hero meets
         about 21 an hour, so its Scarce rows sit near the 5% ceiling. */
      weaponWeak: 'ranged', weaponResist: [],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.4, band: 'common' }, { id: 'barge_nail', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_platelegs', ch: 0.0475, band: 'scarce' }, { id: 'snakeskin_pants', ch: 0.0475, band: 'scarce' }, { id: 'warlock_pants', ch: 0.0475, band: 'scarce' },
        { id: 'mithril_warhammer', ch: 0.0475, band: 'scarce' },
        { id: 'mithril_belt', ch: 0.0032, band: 'rare' }, { id: 'snakeskin_belt', ch: 0.0032, band: 'rare' }, { id: 'warlock_belt', ch: 0.0032, band: 'rare' }],
      hp: 109, atk: 28, baseAcc: 1.12, def: 30, xp: 1226, gp: [23, 69], formula: true },
    mudlark: {
      name: 'Mudlark', icon: '🪝', tier: 4, level: 52, cls: 'undead', family: 'Undead', speed: 4400,
      /* the skirmisher: the river scavengers who picked the dead and drowned among them. Small, crouched and quick enough to catch
         a kiter. Arrows go over a body that low, a spell does not (one override, weapon). It picks the helmets and gloves off the
         dead, and a bow, and the Grave Dust goes in the sack with them. */
      weaponWeak: 'magic', weaponResist: ['ranged'],
      drops: [{ id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'grave_dust', ch: 0.16, band: 'common' }, { id: 'mudlark_hook', ch: 0.08, band: 'uncommon' },
        { id: 'mithril_helm', ch: 0.021, band: 'scarce' }, { id: 'snakeskin_helmet', ch: 0.021, band: 'scarce' }, { id: 'warlock_helmet', ch: 0.021, band: 'scarce' },
        { id: 'maple_bow', ch: 0.021, band: 'scarce' },
        { id: 'mithril_gauntlets', ch: 0.0014, band: 'rare' }, { id: 'snakeskin_gloves', ch: 0.0014, band: 'rare' }, { id: 'warlock_gloves', ch: 0.0014, band: 'rare' }],
      hp: 66, atk: 37, baseAcc: 1.05, def: 18, xp: 798, gp: [14, 41], formula: true },
    color_sergeant: {
      name: 'Color Sergeant', icon: '🚩', tier: 4, level: 58, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser and the rare carrier, who holds the grounded barge with the company's colors. No override: the one body on the
         flat a hammer breaks. The bodies, the staff, and the caster's prizes. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'color_cord', ch: 0.1, band: 'uncommon' },
        { id: 'mithril_platebody', ch: 0.05, band: 'scarce' }, { id: 'snakeskin_body', ch: 0.05, band: 'scarce' }, { id: 'warlock_body', ch: 0.05, band: 'scarce' },
        { id: 'maple_staff', ch: 0.05, band: 'scarce' },
        { id: 'maple_wand', ch: 0.0033, band: 'rare' }, { id: 'maple_spellbook', ch: 0.0033, band: 'rare' }],
      hp: 156, atk: 37, baseAcc: 1.12, def: 38, xp: 1888, gp: [33, 98], formula: true },
  },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT). The sheet asks the median lone way at the band middle (58) for 0.90-1.10 of the
     pace contract (288,135 an hour at 58). Measured as opened in the tier-4 set, the 8 ways, 4 seeds x 1 h each: at 1.05 the middle
     read 0.89, at 1.15 0.98, and at 1.22 it reads 1.04 (298,700), the floor 1.23 and the band's top 0.92. 1.22 and not 1.15: the
     Ford's fit rose to 1.28 to stay level with the Warrens at 45, and at 1.22 the Slake still pays about a tenth more Level XP
     than the Ford for a hero of the same Level (at 50, a lone tank 236k against 213k, a four 358k against 314k a head). It was 1.4
     before one difficulty, when a lone hero fought 55% of a body's HP for 55% of its kill. */
  xpFit: { k: 1.22, why: 'at 1.05 the median lone way read 0.89 of the pace contract at the band middle (58), measured as opened over the 8 ways, 4 seeds x 1 h. At 1.22 it reads 1.04, about a tenth over the Ford at the same Level' },
  /* DANGEROUS BRINGS SIX, one more than the table's five, for every group (TIER_PULL_OVERRIDES' shape: one number). On five a Melee
     and Healer pair two or three Levels under the floor made 2.3k to 5.5k gold an hour a head on Dangerous, and 1.2k five under,
     where the weight-class ruling (11-06) asks them to lose gold. On six they lose 2.2k, 3.1k and 5.7k (as opened, 2 seeds x 1 h).
     What six costs a lone hero at the floor: 24 deaths in 16 hours where five gave 1, for the same XP. A four holds it with no
     death at 465k XP a head. OPEN, ONE ROW OF THE GRADE: five under on Dangerous the sheet also asks that pair to die. It never
     did. Every solo ground fails that row today. */
  tierOverride: { dangerous: 6, why: 'on the table pull of 5 a Melee and Healer pair two to five Levels under the floor still made gold on Dangerous. On 6 they lose it' },
  roster: {
    greened_pikeman: 'swarm',   // the common majority
    bargeman: 'heavy',          // the tank: slow (2400), thick
    mudlark: 'glass',           // quick (4400), fragile, lands often
    color_sergeant: 'elite',    // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw). A
     ward and a keen, a life leech and an element ward. Each is a Material in the bag and only sells until its lining exists. */
  items: {
    green_rivet: { n: 'Green Rivet', icon: '🔩', v: 100, raw: true, imbue: { kind: 'ward', tier: 2 } },
    barge_nail: { n: 'Barge Nail', icon: '📌', v: 108, raw: true, imbue: { kind: 'keen', tier: 2 } },
    mudlark_hook: { n: 'Mudlark Hook', icon: '🪝', v: 104, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
    color_cord: { n: 'Color Cord', icon: '🎗️', v: 116, raw: true, imbue: { kind: 'element_ward', tier: 2 } },
  },
  itemText: {
    green_rivet: 'A copper rivet off a Greened Pikeman\'s harness. The river silt turned it green',
    barge_nail: 'A long iron nail a Bargeman worked loose from the grounded supply barge',
    mudlark_hook: 'The short iron boathook a Mudlark picked the drowned dead with. It is green at the point',
    color_cord: 'The cord a Color Sergeant tied the company\'s colors to the staff with',
  },
  /* PARTY LEVEL XP (party-class-xp.js's row shape: heroes alive -> permille at 1, 2, ... classes): better only with different
     classes (Tyler 10-31), and since one difficulty the mixed cells are the lever (Tyler 11-08, "Same monsters, re-tune"). Measured
     as opened with every cell at 1000 (the full grid in 1 h cells, 2 seeds): against the median lone way a mixed four read
     0.74-0.81, a three 0.70-0.83 and a pair 0.84-0.89. At these cells a four reads 1.16 to 1.24 at the floor, the middle and the top
     (the ruling's 1.15-1.25) and a pair 1.07-1.13. A fourth class pays a little more than three (tests/hunt-core/xp-share.mjs
     party-class-every-cell). The one-class cells hold every one-class party under its heroes alone: the best reads 0.93
     (tests/party-class-xp-line.mjs, four bows). */
  partyClassXp: { 2: [990, 1270], 3: [1150, 1400, 1510], 4: [1150, 1400, 1565, 1570] },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives.
     Measured at the floor on the default pull (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, 2026-11-10). One class is the
     mean of its five one-class parties (pairs 0.83-0.89, threes 0.81-0.92, fours 0.81-0.93). Two of two is the mean of three mixes
     (1.04-1.10), three of three of two (1.09 each), four of four the one played (1.12 at the 1555 cell, 1.13 at 1570). The cells
     between are the size's mix times the cell ratio. */
  partyVsAlone: { 2: [-15, 10], 3: [-15, 0, 10], 4: [-15, 0, 15, 15] },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Warrens' tier-3 store food, the cheapest heal an HP (Salted Lobster, 0.83 g
     an HP. The tier-4 Swordfish is 1.50). The melee line holds about three hours of a lone tank's bill at the floor (6.3k g an
     hour, drop-tables). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE PACK'S TEST FACTS. dropRef: a lone tank at the floor in the full own-tier set. valueToday is that hour's measured value
     (12,160 g: coin 8,679, commons 943, gear 2,539), pinned once. It was 8,813 before one difficulty paid a lone hero the whole kill. */
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 12160 },
  map,
});
