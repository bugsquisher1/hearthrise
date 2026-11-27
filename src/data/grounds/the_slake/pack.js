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
// no party scale and no party gate. `groupFit: 'both'` only picks the formula's stats; a party's advice reads its measured lines.
// On Normal every group meets the room as built (Tyler 2026-11-11: no party pull). Each harder tier brings ONE pull for every group.
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
// THE WEAPON GROUND, THE FORD THE ARMOR GROUND (designer 2026-11-16, lane/d-andy-march-feedback; the Ford's header says why). The
// weapons stay as they are; the armor rows go x0.75 (boots 0.0057 -> 0.0043, legs 0.0475 -> 0.0356, helmets 0.021 -> 0.0158, bodies
// 0.05 -> 0.0375) and the gloves and belts x0.85 (0.0014 -> 0.0012, 0.0032 -> 0.0027). Re-measured the same way: each armor piece
// every 1.21-1.44 h, the weapons every 0.91-1.08 h, each Rare every 13.8-18.9 h, gear 2,033 g (23% of the coin), total 11,717 g
// (-4% on the pin). The Slake keeps its other two reasons: about a tenth more XP than the Ford at the same Level, and the weapons.
// Commons feed the Hearth (Grave Dust at 46, Bone Chips at 40, Big Bones) and the forge (Coal, Copper Ore). Each body drops its own
// imbuement item, a Material that only sells until linings are built (the board, "2026-11-10 Resistance and imbuements"). The
// Color Cord is the fire lining's piece for the Pyre Field.
//
// THE BARGEMAN'S SPELL: Cold Bilge (whole group, frost; the area spells board's seed row) is this pack's own `spells` row
// (lane/b-pack-fields, engine piece 10), cast now that the area spells are live.
import { definePack, box, gather } from '../shape.js';
import map from './map.js';

const PK = 'greened_pikeman', BG = 'bargeman', ML = 'mudlark', CS = 'color_sergeant';

export default definePack({
  id: 'the_slake',
  status: "open",
  sql: "2027-04-22-pack-the_slake.generated.sql",
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 12 Pikemen, 6 Bargemen, 4 Mudlarks and the
     2 Sergeants who hold the barge. */
  hunt: {
    region: 'barrow_march',
    name: 'The Slake', theme: 'The river slows down here and drops its copper in the mud, along with the dead soldiers it carried down from Hask\'s Ford.',
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
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11, "if they want bigger pulls they need to up the difficulty"; lane/d-packs-retune): a party
       meets the room as built, the same as a hero alone. A bigger pull is Dangerous or Deadly (the tier row), never a party's own. */
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): willows on the north
       and south banks, as the Ford placed them (refKillMs its 12000). They are hunt-grounds.js willow_tree, drawn as the March kit's own
       riverbank tree (sprite alder): the oaks that stood in here are gone (lane/b-barrow-numbers 2026-11-14). */
    gather: gather(12000, [['willow_tree', 9, 4, 0], ['willow_tree', 21, 8, 0], ['willow_tree', 5, 34, 4], ['willow_tree', 18, 32, 4]]),
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
      role: 'swarm',
      /* the swarm, the common majority: the company's foot after years in the copper silt. A blade finds the joints (one override,
         weapon: weak to the sword, where every Ford body breaks to a hammer). Its boots and its sidearm. */
      weaponWeak: 'sword', weaponResist: ['hammer'],
      drops: [{ id: 'bones', everyHours: 0.0364, ch: 0.48, band: 'common' }, { id: 'copper_ore', everyHours: 0.0455, ch: 0.384, band: 'common' }, { id: 'green_rivet', everyHours: 0.2273, ch: 0.0768, band: 'uncommon' },
        { id: 'steel_boots', everyHours: 4.23, ch: 0.00413, band: 'scarce' }, { id: 'boarhide_boots', everyHours: 4.23, ch: 0.00413, band: 'scarce' }, { id: 'scholar_boots', everyHours: 4.23, ch: 0.00413, band: 'scarce' },
        { id: 'steel_sword', everyHours: 3.19, ch: 0.00547, band: 'scarce' }],
      hp: 74, atk: 30, aim: 60, evasion: 22, def: 2, xp: 473, gp: [11, 33], formula: true },
    bargeman: {
      name: 'Bargeman', icon: '🧟', tier: 4, level: 54, cls: 'undead', family: 'Undead', speed: 2400,
      role: 'brute',
      /* the tank, the slowest thing on the flat: the barge's crew. Where the Fordsunk's bloat swallows arrows, the crew's cracked
         hides take them (one override, weapon). The barge's forge cargo, its smith's hammer, the crew's belts. A lone hero meets
         about 21 an hour, so its Scarce rows sit near the 5% ceiling. */
      weaponWeak: 'ranged', weaponResist: [], spells: ['cold_bilge'],
      drops: [{ id: 'bones', everyHours: 0.0667, ch: 0.48, band: 'common' }, { id: 'coal', everyHours: 0.0833, ch: 0.384, band: 'common' }, { id: 'barge_nail', everyHours: 0.4167, ch: 0.0768, band: 'uncommon' },
        { id: 'steel_platelegs', everyHours: 0.936, ch: 0.0342, band: 'scarce' }, { id: 'boarhide_pants', everyHours: 0.936, ch: 0.0342, band: 'scarce' }, { id: 'scholar_pants', everyHours: 0.936, ch: 0.0342, band: 'scarce' },
        { id: 'steel_warhammer', everyHours: 0.702, ch: 0.0456, band: 'scarce' },
        { id: 'steel_belt', everyHours: 12.35, ch: 0.00259, band: 'rare' }, { id: 'boarhide_belt', everyHours: 12.35, ch: 0.00259, band: 'rare' }, { id: 'scholar_belt', everyHours: 12.35, ch: 0.00259, band: 'rare' }],
      hp: 120, atk: 30, aim: 54, evasion: 34, def: 13, xp: 869, gp: [18, 53], formula: true },
    mudlark: {
      name: 'Mudlark', icon: '🪝', tier: 4, level: 52, cls: 'undead', family: 'Undead', speed: 4400,
      role: 'stalker',
      /* the skirmisher: the river scavengers who picked the dead and drowned among them. Small, crouched and quick enough to catch
         a kiter. Arrows go over a body that low, a spell does not (one override, weapon). It picks the helmets and gloves off the
         dead, and a bow, and the Grave Dust goes in the sack with them. */
      weaponWeak: 'magic', weaponResist: ['ranged'],
      drops: [{ id: 'bone_chips', everyHours: 0.091, ch: 0.384, band: 'common' }, { id: 'grave_dust', everyHours: 0.227, ch: 0.154, band: 'common' }, { id: 'mudlark_hook', everyHours: 0.4545, ch: 0.0768, band: 'uncommon' },
        { id: 'steel_helm', everyHours: 2.18, ch: 0.016, band: 'scarce' }, { id: 'boarhide_helmet', everyHours: 2.18, ch: 0.016, band: 'scarce' }, { id: 'scholar_helmet', everyHours: 2.18, ch: 0.016, band: 'scarce' }, // 0.0158 -> 0.0167 (lane/d-harder-monsters 2026-11-19: 1.51 h)
        { id: 'willow_longbow', everyHours: 1.73, ch: 0.0202, band: 'scarce' },
        { id: 'steel_gauntlets', everyHours: 30.3, ch: 0.00115, band: 'rare' }, { id: 'boarhide_gloves', everyHours: 30.3, ch: 0.00115, band: 'rare' }, { id: 'scholar_gloves', everyHours: 30.3, ch: 0.00115, band: 'rare' }],
      hp: 72, atk: 41, aim: 84, evasion: 22, def: 2, xp: 560, gp: [11, 31], formula: true },
    color_sergeant: {
      name: 'Color Sergeant', icon: '🚩', tier: 4, level: 58, cls: 'undead', family: 'Undead', speed: 3000,
      role: 'brute',
      /* the bruiser and the rare carrier, who holds the grounded barge with the company's colors. No override: the one body on the
         flat a hammer breaks. The bodies, the staff, and the caster's prizes. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', everyHours: 0.444, ch: 0.288, band: 'common' }, { id: 'color_cord', everyHours: 1.33, ch: 0.0962, band: 'uncommon' },
        { id: 'steel_platebody', everyHours: 3.56, ch: 0.036, band: 'scarce' }, { id: 'boarhide_body', everyHours: 3.56, ch: 0.036, band: 'scarce' }, { id: 'scholar_body', everyHours: 3.56, ch: 0.036, band: 'scarce' },
        { id: 'willow_staff', everyHours: 2.667, ch: 0.048, band: 'scarce' },
        { id: 'willow_wand', everyHours: 40.4, ch: 0.00317, band: 'rare' }, { id: 'willow_spellbook', everyHours: 40.4, ch: 0.00317, band: 'rare' },
        /* the tank's off-hand beside the Mage's (shields.js, the audit's F8): the sergeant's own shield */
        { id: 'coppercap_shield', everyHours: 40.4, ch: 0.00317, band: 'rare' }],
      hp: 171, atk: 40, aim: 75, evasion: 39, def: 19, xp: 1333, gp: [25, 76], formula: true },
  },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT). The sheet asks the median lone way at the band middle (58) for 0.90-1.10 of the
     pace contract (288,135 an hour at 58). Measured as opened in the tier-4 set, the 8 ways, 4 seeds x 1 h each: at 1.05 the middle
     read 0.89, at 1.15 0.98, and at 1.22 it reads 1.04 (298,700), the floor 1.23 and the band's top 0.92. 1.22 and not 1.15: the
     Ford's fit rose to 1.28 to stay level with the Warrens at 45, and at 1.22 the Slake still pays about a tenth more Level XP
     than the Ford for a hero of the same Level (at 50, a lone tank 236k against 213k, a four 358k against 314k a head). It was 1.4
     before one difficulty, when a lone hero fought 55% of a body's HP for 55% of its kill. */
  /* RE-FITTED UNDER SOLO +15% AND THE FLATTER CONTRACT (lane/d-packs-retune, 2026-11-12; the Ford's note says why the numbers moved). At 1.22 the
     median lone way read 1.26 of the contract at the band middle (58: 268k an hour; quick grade, the Ford's armor on the ladder, 1 seed x 1 h).
     1.22 x 1.00 / 1.26 = 0.97. The Ford fell by the same factor, so the Slake still pays about a tenth more than the Ford at the same Level. */
  /* RE-FITTED FOR THE CLIMB (lane/d-open-march-balance, 2026-11-15; tests/hunt-core/forest-cave.mjs harder-pays-more, Tyler 2026-11-04
     "harder mobs grand better loot and more exp"). With the March open the Muster above it paid a four at its floor (55) less a head than the Slake did (581k against 626k), so the
     Slake gives a little back: 0.97 -> 0.93 (the full grade's median lone way at 58 read 0.98 of the contract, so about 0.94; a lone tank at 50 still
     levels about 7% faster here than on the Ford). */
  xpFit: { k: 0.93, why: 'Monsters here give a little less XP than the base formula, so the Muster Barrows above pay a party more' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* THE BARGEMAN'S SPELL (the area spells board's seed row, lane/b-pack-fields): river water over the whole group, frost. One of
     the Slake's own rows, folded into MONSTER_SPELLS (monster-spells.js); the Corded Frost Lining is its answer.
     1800 EVERY 12 S (was 1500 every 16; lane/d-harder-monsters, 2026-11-19, the balance audit's fix 2): it was the Slake's one spell on the back
     seats and a recorded Deadly four's bow, Mage and Healer took about 2.7k an hour from it. The Bargeman's swing tops out at 120, so it lands up to
     216 on every hero, 33% of a bare floor hero (the 35% rule binds just above), and a third more often. */
  spells: {
    cold_bilge: { n: 'Cold Bilge', shape: 'group', range: 6, windupMs: 2000, cdMs: 12000, hitPm: 1800, element: 'frost' },
  },
  roster: {
    greened_pikeman: 'swarm',   // the common majority
    bargeman: 'heavy',          // the tank: slow (2400), thick
    mudlark: 'glass',           // quick (4400), fragile, lands often
    color_sergeant: 'elite',    // the bruiser and the rare carrier
  },
  /* THE PARTS (src/data/imbuements.js's rule: one a body, its book value from its dropper's Level, raw): what an Artificing hero makes an
     imbuement from once an imbuement row names it (src/data/imbue-rules.js), and what a step bench takes (drop-hours.js made.part). */
  items: {
    green_rivet: { n: 'Green Rivet', icon: '🔩', v: 100, raw: true, part: true },
    barge_nail: { n: 'Barge Nail', icon: '📌', v: 108, raw: true, part: true },
    mudlark_hook: { n: 'Mudlark Hook', icon: '🪝', v: 104, raw: true, part: true },
    color_cord: { n: 'Color Cord', icon: '🎗️', v: 116, raw: true, part: true },
  },
  itemText: {
    green_rivet: 'A copper rivet off a Greened Pikeman\'s harness. The river silt turned it green',
    barge_nail: 'A long iron nail a Bargeman pried loose from the wrecked supply barge',
    mudlark_hook: 'A Mudlark used this iron hook to rob the dead in the river. The copper turned the point green',
    color_cord: 'The cord a Color Sergeant used to tie Hask\'s flag to its pole',
  },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives.
     Measured at the floor on the default pull (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, 2026-11-10). One class is the
     mean of its five one-class parties (pairs 0.83-0.89, threes 0.81-0.92, fours 0.81-0.93). Two of two is the mean of three mixes
     (1.04-1.10), three of three of two (1.09 each), four of four the one played (1.12 at the 1555 cell, 1.13 at 1570). The cells
     between are the size's mix times the cell ratio. */
  /* RE-MEASURED 2026-11-12 (lane/d-packs-retune; tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, every pack
     under this one open on the ladder). One class is the mean of its five one-class parties (pairs 0.59-0.68, threes 0.46-0.64, fours 0.18-0.51), two of two the mean of three mixes, three of three of two,
     four of four the one played (pairs 1.06-1.15, threes 1.00-1.09, the four 1.09); the cells between are the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-45, -5], 3: [-55, -25, -20], 4: [-65, -40, -40, -35] }, dangerous: { 2: [-35, 15], 3: [-35, 10, 15], 4: [-40, -5, 0, 5] }, deadly: { 2: [-30, 15], 3: [-30, 10, 20], 4: [-40, 0, 5, 5] } },
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
