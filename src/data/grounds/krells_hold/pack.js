// src/data/grounds/krells_hold/pack.js — KRELL'S HOLD, Levels 85-110: the Barrow March's last ground, Lord Krell's castle (lane/b-krells-hold-pack,
// the designer's "2026-11-10 Krell's Hold" on the board; Tyler 2026-11-09: "I like krell", "maybe the last hunt in this area is like the guys
// name and the hunt is his castle"). Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new krells_hold --like wickstead --band
// 85,110` (the Pyre Field, the design's pick, is not on main), then every row rewritten and the map drawn new (map.js). The stat lines are the
// formula's (`node tools/pack.mjs propose krells_hold --write`): tier 6, floor 85, fit both.
//
// STAGED UNTIL ITS ART LANDS. The three engine pieces its bodies wait on are built, and since lane/b-barrow-numbers (2026-11-14) the rows use
// them: the Lookout shoots from 5 tiles (piece 2, `range`), the Pyre Priest mends the most hurt body in his pull (piece 3, Mend the Dead) and
// the Grave Guard's Shield Slam is a marked hit on the two tiles in front of him (piece 1). The grader plays all three as written.
//
// NAMES (the Barrow March's): the monsters and items keep their names (Farmhand, Hask's Lookout, Grave Guard, Pyre Priest, Gatekeeper, Hall Key). THE PLAYER'S
// LINES (item text, the hunt's line) are Tyler's voice (11-11): short, plain, everyday words that say what happened. No old or military
// words in a sentence (the foot, files, colors, rite, warders, binders), nothing poetic, no story paragraphs here. The story is the board's
// "2026-11-10 The living world" and goes to the wiki, sample first. Never Ancient, Shadow, Dark, Eternal, Void or Forgotten. American spelling.
// Who each body is, in one line: the Farmhands are farmhands Krell forced to guard his castle, the Lookouts are Hask's lookouts who took Krell's
// pay, the Grave Guards are the company's officers he dug up from the Barrows, the Pyre Priests are his priests, and the Gatekeeper keeps his keys.
//
// THE LESSON IS THE KRELL FIGHT, ONE QUESTION A CREATURE. The Farmhand says Krell is a living man and an undead kit is wrong for him: the March's
// first living enemy, so poison works again (Human: weak to arrows, poison does 15% more). The Lookout is his adds going for the back line. The
// Grave Guard is his marked hit. The Pyre Priest is "kill the helpers first". The Gatekeeper is the key. Weak-to at density 4: 13 heads to an arrow
// (7 Farmhands, 3 Lookouts, 3 Pyre Priests), 7 to a hammer (5 Grave Guards, 2 Gatekeepers): the Ranger's ground, as the Slake is the sword's and the Pyre
// Field the hammer's. The Drill Yard is all living (a lone bow's room) and the Crypt nearly all dead (a lone hammer's room).
// THE HEAD COUNT, against the design's 8 / 4 / 3 / 3 / 2. Five pockets of four can't give the Crypt its ranks of dead, the Chapel a Grave Guard
// for its Pyre Priests and the Stair its Grave Guard out of only four Grave Guards. So one Farmhand became a Grave Guard: 7 / 5 / 3 / 3 / 2 (13 arrow, 7 hammer
// against the design's 14 and 6), and a Pyre Priest kneels among the Crypt's dead.
//
// THE LOOT (src/data/loot-bands.js). Scarce, about hourly a piece per hero at the floor: the whole TIER-6 armor set in three weights, one slot a
// body (Farmhand boots, Lookout helmets, Grave Guard legs, Gatekeeper bodies), one tier-6 weapon on four bodies and the Grave Guards' tower shield
// (lane/d-drop-homes, 2026-11-18: shields drop at every tier, so his Rare went hourly and his hammer to the Gatekeeper). Rare, each about every 10-20 h: the
// tier-6 gloves (Lookout) and belts (Grave Guard), and the Pyre Priests' wand and codex. Tier 6 is worn from 75, so every piece is wearable the hour it
// drops: this is the game's only source of tier-6 armor. Each body drops one imbuement item, one of each of the five kinds. Each has one
// product of its own: the Farmhand's tithe wheat, the Lookout's bolt iron, the Grave Guard's grave dust, the Pyre Priest's pyre coal, and the toll gold the
// Gatekeeper keeps. The Hall Key is the Gatekeeper's last row, in its own band (loot-bands.js `key`, about one every two hours).
// THE CHANCES ARE FITTED, NOT GUESSED: each was set from the floor hour's kills on the real settle (tests/hunt-core/drop-tables.mjs, a lone
// tank in its tier-6 set, 2026-11-10): Scarce 0.88-1.17 h a piece, Rare 14.6-15.0 h, the Hall Key about every 2.0 h (19 Gatekeepers an hour).
// GOLD IS PRINTED, NEVER A TARGET (NO PROFIT MOLDS, Tyler 2026-11-13): the Lookout's 0.45 to-hit and the Dangerous dmgPm 1300 that
// chased a food share are reverted. His 0.17 blow stays as a danger fix (close calls at the floor) and Deadly brings six, also danger.
import { definePack, box, gather } from '../shape.js';
import map from './map.js';
import { SPECIAL_SAMPLE } from '../../special-attributes.js';

/* KRELL'S TWO UNIQUE PIECES (Tyler 2026-11-14: "a pair of pally legs a tank shield ... just no weapon", "by unique i mean having a special
   attribute"). Their rows and lines are the designer's sample rows (src/data/special-attributes.js: the standard piece plus ONE attribute),
   read from there and written nowhere else; tests/special-attributes.mjs SA1 holds what ships to the row. */
const UNIQUES = Object.freeze(['krells_tollgate', 'banded_legguards']);

const LV = 'farmhand', PK = 'hasks_lookout', WD = 'grave_guard', BD = 'pyre_priest', CS = 'gatekeeper';

export default definePack({
  id: 'krells_hold',
  status: "open",
  sql: "2027-04-25-pack-krells_hold-2.generated.sql",
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 7 Farmhands, 5 Grave Guards, 3 Lookouts, 3 Pyre Priests, 2 Gatekeepers. */
  hunt: {
    region: 'barrow_march',
    name: 'Krell\'s Hold', theme: 'Lord Krell lives here. His men guard the walls, and the officers he dug up out of the Muster Barrows guard the crypt.',
    band: [85, 110],
    spawns: [{ monster: LV, w: 7, rarity: 'common' }, { monster: WD, w: 5, rarity: 'uncommon' },
      { monster: PK, w: 3, rarity: 'uncommon' }, { monster: BD, w: 3, rarity: 'uncommon' }, { monster: CS, w: 2, rarity: 'rare' }],
    family: 'Human', art: LV, travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE ROUTE: in at the gate, west through the yard, north into the chapel, east through the crypt, up the tower stairs, and out the
     back gate round the east wall to the gate. Krell's Hall (x41-56 y1-6) is behind the stair's north door and on no lap. */
  ground: {
    map: 'krells_hold',
    /* on the cart road below the gate, one tile a seat */
    start: [[29, 42], [28, 42], [30, 42], [29, 41]],
    pockets: [
      /* P0 the Cart Gate: the soft door. A hero under 85 pushing for tier-6 boots stands here. Farmhands on the gate and a Lookout over it */
      box([22, 30, 36, 37], [29, 33], [LV, LV], [PK, LV, LV, PK, LV, LV]),
      /* P1 the Drill Yard: all living, the bow's room and the poison rune's. Farmhands at the pells, Lookouts down off the wall walk */
      box([4, 14, 24, 28], [14, 21], [LV, PK], [LV, LV, PK, LV, LV, PK]),
      /* P2 the Chapel: where the rite was written. A Pyre Priest beside the dead he mends, so who dies first matters */
      box([4, 3, 18, 11], [11, 7], [BD, WD], [BD, LV, WD, BD, LV, WD]),
      /* P3 the Crypt: the officers Krell dug out of the Barrows, standing in ranks, and a Pyre Priest kneeling among them. The hammer's room */
      box([24, 4, 38, 12], [31, 8], [WD, WD], [BD, WD, WD, BD, WD, WD]),
      /* P4 the Tower Stairs: the hardest pull. The Gatekeeper holds the stair to his lord's door, a Lookout above him and a Grave Guard at his side */
      box([42, 10, 54, 20], [48, 15], [CS, PK], [CS, WD, PK, WD, WD, PK]),
    ],
    route: [0, 1, 2, 3, 4],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08): no solo or party label, no gate. groupFit 'both' (the formula's rows for a ground
       not built for a party); no pocket asks for a party size and there is no soloFrom. */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    /* ONE PACK ON NORMAL FOR EVERY GROUP (Tyler 2026-11-11, "if they want bigger pulls they need to up the difficulty"; lane/d-packs-retune): a party
       meets the room as built, the same as a hero alone. A bigger pull is Dangerous or Deadly (the tier row), never a party's own. */
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): two coal seams in the
       Crypt standing in for an Emberstone Vein (gathering.js emberstone_rock, Mining 75, has no node kind or sprite yet). refKillMs the
       Pyre Field's 12000. */
    gather: gather(12000, [['coal_rock', 28, 4, 3], ['coal_rock', 35, 4, 3]]),
  },
  /* THE BODIES. All five are new drawings (the art brief, the board's section 7); none has art yet, so the pack stays staged for that too. */
  monsters: {
    farmhand: {
      name: 'Farmhand', icon: '🗡️', tier: 6, level: 86, cls: 'human', family: 'Human', speed: 3400,
      /* the swarm, the common majority: farmhands Krell pressed off the March's fields to hold his walls, in quilted jacks with a bill hook. Young
         and scared. Living, so the Human class with no override: weak to arrows, poison does 15% more. Their tithe grain, the press token they
         showed at the gate, the tier-6 boots and the Emberforged sword off the gate rack. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'wheat', ch: 0.3, band: 'common' }, { id: 'farmhands_tag', ch: 0.08, band: 'uncommon' },
        { id: 'ember_boots', ch: 0.02, band: 'scarce' }, { id: 'dragonhide_boots', ch: 0.02, band: 'scarce' }, { id: 'archmage_boots', ch: 0.02, band: 'scarce' },
        { id: 'ember_sword', ch: 0.02, band: 'scarce' }],
      hp: 125, atk: 86, aim: 115, evasion: 32, def: 3, xp: 1045, gp: [18, 56], formula: true },
    hasks_lookout: {
      name: 'Hask\'s Lookout', icon: '🏹', tier: 6, level: 88, cls: 'human', family: 'Human', speed: 3000,
      /* the glass: the sentries Captain Hask pulled off the line the night of the Ford. They took Krell's pay too, and now they stand his wall
         walk with a crossbow and the company's striped sleeve under his tabard. Human, no override. Their bolt iron, the whistle nobody answered,
         the tier-6 helmets and the Runewood Bow, and now and then the gloves off a dead officer. HE SHOOTS (`range`, src/core/hunt/shooters.js): from 5 tiles
         at the hero standing farthest back, and he doesn't walk in. A hero's bow reaches 7, so a Ranger can still out-reach him, and a
         Challenge turns his aim to the tank. */
      range: 5,
      /* THE SHOOTER (src/data/monster-roles.js, wave 2; the Danger scale only): on the scale he keeps to the back row, the farthest of it */
      role: 'shooter',
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'iron_bar', ch: 0.3, band: 'common' }, { id: 'lookouts_whistle', ch: 0.08, band: 'uncommon' },
        { id: 'ember_helm', ch: 0.026, band: 'scarce' }, { id: 'dragonhide_helmet', ch: 0.026, band: 'scarce' }, { id: 'archmage_helmet', ch: 0.026, band: 'scarce' },
        { id: 'runewood_bow', ch: 0.026, band: 'scarce' },
        { id: 'ember_gauntlets', ch: 0.0018, band: 'rare' }, { id: 'dragonhide_gloves', ch: 0.0018, band: 'rare' }, { id: 'archmage_gloves', ch: 0.0018, band: 'rare' }],
      hp: 120, atk: 88, aim: 158, evasion: 33, def: 4, xp: 1215, gp: [18, 53], formula: true }, // atk: balance-sheet.js FORMULA_EXCEPTIONS (a danger fix: close calls at the floor)
    grave_guard: {
      name: 'Grave Guard', icon: '🛡️', tier: 6, level: 92, cls: 'undead', family: 'Undead', speed: 2400,
      /* the heavy, the slowest thing in the castle: one of the Banded Company's officers, buried with honors in the Muster Barrows, dug up and
         set at Krell's doors behind a door-sized shield. Undead, no override: a hammer breaks him, fire does 15% more, poison half. His grave dust
         for the Hearth, the barrow nail they pulled to get him out, the tier-6 legs and that door-sized shield, and now and then a belt. His
         Shield Slam is a marked hit on the two tiles in front of him (`spells` below): the tank holds, everyone else steps off.
         HIS SHIELD ABOUT HOURLY (lane/d-drop-homes, designer 2026-11-18; Tyler 2026-11-18: shields drop at every tier): it was a Rare here
         (0.12%); the Emberforged Warhammer he carried beside it went to the Gatekeeper's mace, so each body keeps one weapon. */
      spells: ['shield_slam'],
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.5, band: 'common' }, { id: 'barrow_nail', ch: 0.08, band: 'uncommon' },
        { id: 'ember_platelegs', ch: 0.017, band: 'scarce' }, { id: 'dragonhide_pants', ch: 0.017, band: 'scarce' }, { id: 'archmage_pants', ch: 0.017, band: 'scarce' },
        { id: 'ember_tower_shield', ch: 0.017, band: 'scarce' },
        { id: 'ember_belt', ch: 0.0012, band: 'rare' }, { id: 'dragonhide_belt', ch: 0.0012, band: 'rare' }, { id: 'archmage_belt', ch: 0.0012, band: 'rare' }],
      hp: 200, atk: 86, aim: 101, evasion: 51, def: 22, xp: 1889, gp: [29, 89], formula: true },
    pyre_priest: {
      name: 'Pyre Priest', icon: '📿', tier: 6, level: 95, cls: 'human', family: 'Human', speed: 3000,
      /* the regular: one of Krell's priests, the men who said the rite over the Pyre Field and tied the dead to his fire. Hooded, ash-gray,
         a knotted cord at his belt. Living, Human, no override. The pyre coal on his hands, his cord, the Runewood Staff, and the Pyre Priests' own
         wand and codex. He mends the dead in his pull, so the Grave Guards beside him take far longer to drop (Mend the Dead, `spells` below). Kill him first. */
      spells: ['pyre_rite'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'priests_cord', ch: 0.08, band: 'uncommon' },
        { id: 'runewood_staff', ch: 0.049, band: 'scarce' }, // 0.045 -> 0.049 and the two Rares 0.0035 -> 0.0037 (lane/d-harder-monsters 2026-11-19: a tenth more HP, fewer Priests met an hour: 1.59 h and 20.4 h)
        { id: 'runewood_wand', ch: 0.0037, band: 'rare' }, { id: 'runewood_codex', ch: 0.0037, band: 'rare' }],
      hp: 172, atk: 110, aim: 137, evasion: 38, def: 8, xp: 1496, gp: [25, 76], formula: true },
    gatekeeper: {
      name: 'Gatekeeper', icon: '🗝️', tier: 6, level: 100, cls: 'human', family: 'Human', speed: 2800,
      /* the elite and the rare carrier: Krell's steward, in plate with a mace and a ring of keys. He keeps the castle, its stores and the toll.
         A man in plate, so a blade skids off him and a hammer gets through (one override, the weapon axis). The toll gold he keeps, a link of
         his key chain, the tier-6 bodies and his mace, the Emberforged Warhammer (lane/d-drop-homes, 2026-11-18, off the Grave Guard: about
         15 met an hour, so the 5% ceiling). He is the first monster whose drop opens a fight: the Hall Key off his ring (the Key band,
         loot-bands.js, about one every two hours). */
      spells: ['hot_pitch'], weaponWeak: 'hammer', weaponResist: [], // designer round 3, 2026-11-12: no sword resist, the hammer edge stays
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'gold_bar', ch: 0.3, band: 'common' }, { id: 'gatekeepers_chain', ch: 0.1, band: 'uncommon' },
        { id: 'ember_platebody', ch: 0.05, band: 'scarce' }, { id: 'dragonhide_body', ch: 0.05, band: 'scarce' }, { id: 'archmage_body', ch: 0.05, band: 'scarce' },
        { id: 'ember_warhammer', ch: 0.05, band: 'scarce' },
        { id: 'hall_key', ch: 0.026, band: 'key' }],
      hp: 290, atk: 115, aim: 140, evasion: 59, def: 32, xp: 2961, gp: [43, 128], formula: true },
  },
  roster: {
    farmhand: 'swarm',          // the common majority
    hasks_lookout: 'glass',     // shoots the back line (piece 2), fragile, lands often
    grave_guard: 'heavy',       // the shield: slow (2400), thick
    pyre_priest: 'regular',     // the middle weight, the mender (piece 3)
    gatekeeper: 'elite',        // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw): one of each of the
     five kinds, kept for the imbuer like every ground's (catalogue-coherence.js VENDOR_TRASH until imbuing is built). */
  items: {
    farmhands_tag: { n: 'Farmhand\'s Tag', icon: '🪙', v: 172, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    lookouts_whistle: { n: 'Lookout\'s Whistle', icon: '📯', v: 176, raw: true, imbue: { kind: 'keen', tier: 3 } },
    barrow_nail: { n: 'Barrow Nail', icon: '📌', v: 184, raw: true, imbue: { kind: 'ward', tier: 3 } },
    priests_cord: { n: 'Priest\'s Cord', icon: '🧶', v: 190, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
    gatekeepers_chain: { n: 'Gatekeeper\'s Chain', icon: '⛓️', v: 200, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    /* THE HALL KEY (the designer's 11-10 ruling 6: it TRADES). `opens` the hall of this ground (`hall` below; drop-tables loot-structure holds
       the Key band to it). One key opens the hall for the whole party and is the leader's; the server takes it on entry and journals it; it
       moves only through Storage and trade (the ruling's rails, for the keyed-room lane). Book value 800: the shop pays that, and the market's
       ceiling is 100x book, so a player can ask up to 80,000 for one. PROPOSED, unmeasured. */
    hall_key: { n: 'Hall Key', icon: '🗝️', v: 800, opens: 'krells_hold' },
    /* Krell's Tollgate (tier 7 tank shield, guard 15, 10% less fire damage) and the Banded Legguards (Dawnsteel Platelegs' numbers, 3% less
       physical damage): on his daily prize roll only (`hall` below), 3% a hero a day each. They trade like any gear. */
    ...Object.fromEntries(UNIQUES.map((id) => [id, SPECIAL_SAMPLE[id].row])),
  },
  itemText: {
    farmhands_tag: 'Krell\'s men gave this wooden tag to every farmhand they forced to guard his castle',
    lookouts_whistle: 'A tin whistle from Hask\'s company. His lookouts were supposed to blow it when Krell\'s men came, and they didn\'t',
    barrow_nail: 'A coffin nail from the Muster Barrows. Krell\'s men pulled it out when they dug the company\'s officers back up',
    priests_cord: 'Krell\'s priests tied this cord around the dead before they burned them. They put a knot in it for every name',
    gatekeepers_chain: 'A link off the Gatekeeper\'s key chain. He keeps every key in the castle, including the one to the toll box',
    hall_key: 'It opens Krell\'s Hall for you and your party. You get one fight out of it, win or lose',
    /* item text carries no closing full stop (item-descriptions.js) */
    ...Object.fromEntries(UNIQUES.map((id) => [id, SPECIAL_SAMPLE[id].text.replace(/\.$/, '')])),
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Pyre Field's store food, and Chalked Poison Runes in place of its ice. These are
     living men (poison does 15% more), and the dead in the cellar shrug poison off, so a caster brings a second family for the Crypt.
     Lobster, not the tier-6 Shark: the store sells Salted Shark at 693 for 396 HP (1.75 g a point) and Salted Lobster at 180 for 216 (0.83),
     and on the quick grade a lone floor tank ate 57 Sharks an hour (39.5k g against 13.2k coin).
     `storeFloor` (the Barrows' rule, supplies.js storeFloorFor; lane/a-hunt-prep-truth, the full-game audit's A25: a Level 85 tank on the
     start bar's Salted Shrimp died here in 81 minutes to a Gatekeeper, and the page said nothing). MEASURED in the kit a hero ARRIVES in,
     one gear tier under the Level's best (tier 5 at 85, since tier 6 drops here) with every combat skill 10 under the Level (the Barrows'
     floor was measured in its own tier with skills at the Level, a kit nobody walks in wearing). Lone, Normal, 2 seeds x 2 h a cell,
     tools/balance-sim/cell.mjs. Deaths, tank / hammer / bow / mage:
       Level 85   Salted Shrimp 8 / 3 / 0 / 0 (Hask's Lookout, the Gatekeeper)    Salted Trout 0 / 0 / 0 / 0    Salted Lobster 0 / 0 / 0 / 0
       Level 86   Salted Shrimp 5 / 1      Level 87   Salted Shrimp 3 / 1      Level 88 and 91   Salted Shrimp 0 / 0 (tier 6 is the kit from 88)
     The audit's own kit (Rune armor, the Emberforged Sword and Tower Shield, Leather Gloves, no belt) at 85: Defense 85 0 deaths, Defense 80
     3 (2 Lookouts, a Gatekeeper). So the floor is Salted Trout to 87 and the start bar's Salted Shrimp from 88. In the same kit the Ford (45),
     the Slake (50) and the Pyre Field (70) die 0 times on Salted Shrimp in every way, so they name none. */
  bagGuide: { tier: 4, storeFloor: 'salted_trout', storeFloorFrom: { 88: 'salted_shrimp' },
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_poison_rune', qty: 650 } } },
  /* THE PACK'S TEST FACTS (2026-11-10). dropRef: a lone tank at the floor in its full own-tier set (tests/hunt-core/drop-tables.mjs, the harness's
     tier-6 kit). valueToday is COMPUTED the Pyre Field's way, not a pre-conversion pin: the floor hour's expected coin (12,152 g) and commons
     (1,550) plus the gear-faucet's half of the coin (6,076), the most the hour's worn gear may sell for. No room holders (every placed body
     has a spawn weight) and no one-tile bridge (every corridor is three wide). */
  /* THE XP FIT (lane/d-packs-retune, 2026-11-12): under solo +15% (Tyler 2026-11-11) and the re-pinned, flatter contract (core-model.js LEVEL_PACE.contract,
     522k an hour at 98) the median lone way read 1.11 of the contract at the band middle on the formula's rows (quick grade, 1 seed x 1 h), so 0.90. */
  /* RE-FITTED (lane/b-barrow-numbers, 2026-11-14). With the Lookout shooting, the Priest mending and the Grave Guard's slam the bodies are
     slower to kill than the plain melee rows 0.90 was fitted on: the full grade as it ships read 0.90 of the contract at 98 (the median of 8
     lone ways, 476k against 529k). The mend was then cut to a quarter (`spells`), which gives some of that back, so 0.95. */
  /* RE-FITTED FOR THE CLIMB (lane/d-open-march-balance, 2026-11-15; tests/hunt-core/forest-cave.mjs harder-pays-more, Tyler 2026-11-04
     "harder mobs grand better loot and more exp"). A lone tank at the floor (85) levelled slower here than on the Pyre Field (583k against 615k). 0.95 -> 0.98 (and the Pyre 0.89):
     about 3% over. The full grade's median lone way at 98 read 1.04 of the contract, so about 1.07, inside 0.90-1.10. */
  xpFit: { k: 0.98, why: 'Monsters here give a little less XP than the base formula, so a hero in the middle of the range levels at the usual speed' },
  gpFit: { k: 0.7, why: 'Monsters here drop 30% less gold than the base formula and their loot sells for 30% less, like every hunting ground from the Glade on' },
  /* DEADLY BRINGS SIX, not the table's eight (the Pyre Field's row; lane/d-packs-retune, 2026-11-12): on eight a four with no Healer died 82 times in
     16 hero-hours at the floor and the four with a Healer 10 (full grade, 2 seeds x 2 h), where the sheet allows 9. Six is the least Deadly may bring
     (never under Dangerous, tests/hunt-core/hunt-tiers.mjs rows). Measured on the re-grade below. */
  tierOverride: { dangerous: 6, deadly: 6, why: 'on the full box a group of four with no Healer died 82 times in 16 hours at the floor, and a group with one 10, where the rule allows 9. On six they hold it, and Dangerous brings the same six (it never brings more than Deadly)' },
  /* RE-MEASURED 2026-11-12 (lane/d-packs-retune; tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, every pack
     under this one open on the ladder). One class is the mean of its five one-class parties (pairs 0.54-0.73, threes 0.42-0.70, fours 0.32-0.59), two of two the mean of three mixes, three of three of two,
     four of four the one played (pairs 0.96-1.08, threes 0.93-1.07, the four 1.02: the Pyre Field's shape, a Mage or a Healer alone earns the most); the cells between are the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { normal: { 2: [-40, 5], 3: [-45, -10, -5], 4: [-55, -30, -25, -25] }, dangerous: { 2: [-30, 20], 3: [-25, 25, 30], 4: [-30, 15, 20, 25] }, deadly: { 2: [-10, 55], 3: [0, 60, 70], 4: [-15, 35, 45, 45] } },
  /* DEADLY IS A HEALER'S TIER HERE, UNDER LEVEL 89 (the designer's Q4 2026-11-12 "Deadly keeps six, bring a Healer", checks.deadlyFourNeeds below;
     the page says it since lane/a-honesty-rescue 2026-11-18). MEASURED on set/v0.2.139 (Deadly: pull 6, blows 1330, HP 1150), the ladder kit, 6 seeds
     x 2 h a four, deaths in 16 hero-hours, a tank, hammer, bow and Mage against a tank, Healer, bow and Mage: Level 85 (the floor) 6.7 / 0, 88 1 / 0,
     89 0.7 / 0, 90 0 / 0, 91 0.3 / 0; the full grade (2 seeds) 80 10 / 0, 82 10 / 0, 83 7 / 0, 95 and up 0 / 0. The same rule as the Muster Barrows:
     said under the first Level measured at less than one death in 16 hero-hours without a Healer, here 89. Inside the sheet's bar of 9 at the floor,
     so the grader passes the four with no Healer: the page recommends one, it doesn't say the four can't hold the tier. */
  healerTiers: { deadly: 89 },
  checks: { dropRef: { roles: ['tank'], full: true }, valueToday: 19778, deadlyFourNeeds: 'healer' }, // designer Q4 2026-11-12: Deadly keeps six, bring a Healer
  /* KRELL'S HALL: one room, one fight, opened with a Hall Key (the design's section 3). Shaped to the KEYED HALL contract of engine piece 5
     (lane/b-barrow-boss-room: src/data/boss-halls.js, src/core/hunt/boss-room.js roomOf, tools/gen-hunt-sessions.mjs hallRows; CONFLICTS
     2026-11-13). A HALL PAYS: its boss and adds are plain paying rows (never `called`, no id ending _called), the boss's prize is his own
     drops, XP and coin, and a NAMED ADD (piece 6) is a row that is `boss` and `add` both, with at most his own enrage line. `hunt` is a
     hunts.js HALL_HUNTS row less its id and `hall`; `ground` a hunt-grounds.js HALL_GROUNDS row less its id, hunt, map and `hall` (the boss
     the pocket's ONE spawn, his wave in `adds`). FOLDED (lane/b-barrow-integrate 2026-11-14): BOSS_HALLS.krells_hold = { id: 'krells_hold',
     hunt: 'krells_hold_hall', key: 'hall_key', boss, Boss } (boss-halls.js), the HALL_HUNTS and HALL_GROUNDS rows `krells_hold_hall`, and
     these rows into MONSTERS. STAGED WITH THE PACK: the room's hunt is `staged`, so no catalogue serves it and no page shows its door.
     HIS SPELLS (`spells` below, the design's section 3): Rake the Coals, a marked cone out of the fire, then the Hall Fire, the pulse nobody
     steps out of, every 20 s and twice as often under his enrage line (`phases.hasten`, piece 7). Hask's own kit is a boss's, his marked
     blow (Cleave) and his pulse (War Cry), piece 6. FITTED TO THE SHIP BAR at the band's middle, Level 98 (lane/b-barrow-numbers
     2026-11-14; the numbers are on Krell's row and on `spells`). A key holder has cleared the Tower Stairs, so the middle is who walks in. */
  hall: {
    key: 'hall_key',
    /* WHAT WINS, SAID AT THE DOOR (lane/d-march-balance, the v0.2.132 re-play lost 0 of 6 on the bars a party is handed). The start bar's Salted
       Shrimp is the loss (0 to 5% at every Level, 40 tries a row). `storeFloor` is said to every hero and in red to a bar under it
       (boss-hall-pane.js). `words.bars` are the tuned bar's changes from the one a party is handed, one label line each (Tyler 2026-11-14: a good
       bar is one a person spent time tuning, and an untouched one should mostly lose): each is a "good bar but" row of boss-call-table.mjs that
       loses most when it is taken away (Krell's row).
       THE CARD IS PLAYED AS WRITTEN (the QA audit's F22, 2026-11-15; tests/boss-hall-advice.mjs reads these lines, builds that bar and party, and
       plays them in the gear a hero holds BEFORE his first win: his tier 7 drops only here, so nobody reading the card wears it). On Salted Lobster
       a tank, a healer and a third hero won 56 to 99 of 100 at 85 by who the third was (a sword alone 56, a bow 62, a second tank 63): the tank
       dies under his enrage. On Salted Swordfish every third wins 94 to 100% at 85 (88% or better with Challenge off), for about 2x the food
       (15-22k a head a fight, from 8-12k). So the floor is Swordfish. A tank and a healer alone run out of time whatever they eat: in tier 6, 0% at 88, 45% at 100,
       77% at 104, 92% at 106 (60 tries a row). The first fix's "Level 88" was measured in his own tier 7 (78%), which no first-time pair wears.
       ASKS FOR FOUR SINCE CLOTH'S DAMAGE CUT (lane/fix135-krell-advice, 2026-11-17). Cloth's Magic damage went from 0.4 of a piece's plate twin
       to a tenth plus 1 (gear-tiers.js, lane/d-mage-110), and the healer's staff blow went with it: it had been a third of a three's damage
       here. Out of time, 40 tries a row at 85: a third tank 0%, a sword alone 0%, axes 22%, a hammer 52% (a bow 88, a crossbow, mage or
       healer 98-100); two heroes 0% at 106, 110, 115 and 120. A tank, a healer and any two of the eight kinds win 80 to 100% at 85 (the
       weakest a third tank and a fourth 82%, two hammers 80%), the four his 18,000 HP was fitted on (boss-call-table.mjs: tank, healer,
       hammer, mage).
       THE FLOOR IS LOBSTER SINCE THE SPELL RULE (lane/c-engine-reds, 2026-11-21; tests/boss-hall-advice.mjs HA-FLOOR: the card's food is the
       cheapest store food every party it names wins on). Two formulas moved the fight, not this room: on the to-hit ratio alone (src/data/to-hit.js)
       a third and fourth tank won 2 of 40 at 85, out of time; with the spell rule (every cast a share of the caster's blow) every one of the 36
       parties wins 40 of 40 on Swordfish and 38 to 40 of 40 on Salted Lobster, and on Salted Trout 23 to 31 of 40 in 19 of them (deaths). So
       the card asks for Lobster, at 180 gold a bite against Swordfish's 432. */
    storeFloor: 'salted_lobster',
    /* THE HALL'S SWITCH (lane/hall-formula, 2026-11-23): ON. Lord Krell and Captain Hask fight on the stat formula at their boss kinds
       (src/core/hunt/hall-formula.js; the dials are src/data/bosses.js BOSS_KINDS.hall and .add), not on the hand lines on their rows below,
       which only a switch turned off reads. FITTED AT THE FLOOR (85: the Level a key holder first walks in, and the Level this card speaks
       for). Measured (tools/balance-program/redesign/halls/hall-bench.mjs, 40 seeds a cell, the door's bar, gear before his first win;
       krell-after.txt, krell-before.txt the hand lines): at 85 a tank, healer, hammer and mage win 93% (hand 98), the same four one gear tier
       under 25% (20), a pair, a hero alone, four damage dealers and an untouched bar 0%; other damage pairs 40 to 63% (43 to 73), so who
       comes matters. At 98 93 to 100% (93 to 100), one gear tier under 73% (88). The card's "two more" is not true at 85 on either: tests/
       boss-hall-advice.mjs HA-WIN reads 20 fours under 75% on the hand lines and 20 on these (CONFLICTS.md 2026-11-23). Off: delete this
       line (the guard's own off-plant, tests/hunt-core/hall-formula.mjs OFF, anchors on it). */
    formula: true,
    words: { boss: 'Lord Krell', Boss: 'Lord Krell',
      bars: ['Everyone: Eat under 75%', 'Healer: Circle of Renewal when 2 are under 80%', 'Healer: Greater Mend under 85%', 'Party: a tank, a healer and two more'] },
    hunt: { name: 'Krell\'s Hall', theme: 'Krell sits by the long fire at the back of his hall, holding the list of every soldier his men killed.',
      band: [85, 110], family: 'Human', art: 'lord_krell', travelS: 0, pull: 1, respawnMs: 600000,
      /* THE HALL'S WRITTEN BLOW CAP (designer 2026-11-14, lane/d-hold-pass; tests/hunt-core/hunt-data.mjs blow-share). His Rake the Coals
         tops out at 521 and his swing at 543, 55% of a bare Level 85 hero (lane/d-march-balance; it was 541). Every blow past 35% lands only on the tank or can be stepped out of: his swing goes
         to the tank, and the Rake is marked (Tyler 11-08: the tank soaks the boss's hits, the casters dodge). The pulse that reaches
         everyone, the Hall Fire, tops out at 36% since the door's-bar fit (lane/d-march-balance; 25% before), under his own swing and fire gear's to cut. Held to 35%, measured (boss-call-table.mjs --hall, atk 157, the Rake at 1.0x): on the old
         x1.25 enrage the bad bar won 95% (40 tries), at 10,000 HP still 85%, against Tyler's 30 (11-05). On x1.6 with the Hall Fire at
         1.0x (120 tries) the pulse alone holds the bad bar at 25%, but one gear tier behind wins 99%, eating at 40% 97% and a healer who
         waits 100%: nothing but the pulse asks anything. The tank's big blows are what make gear and the eat lines matter. */
      blowCap: { pct: 55, why: 'Krell\'s biggest hits land on your tank or come with a warning you can step out of. The fire that reaches everyone is smaller, and fire resistance cuts it' } },
    ground: {
      /* in through the door off the Tower Stairs, Krell in his high seat across the hall, the fire behind him */
      start: [[48, 8], [47, 8], [49, 8], [48, 9]],
      pockets: [{ room: [41, 1, 56, 6], spawns: [{ monster: 'lord_krell', x: 48, y: 2 }],
        /* he reads three names off the Roll: Captain Hask and two of the officers, standing up out of the floor */
        adds: [{ monster: 'hall_hask', x: 44, y: 3 }, { monster: 'hall_grave_guard', x: 52, y: 3 }, { monster: 'hall_grave_guard', x: 48, y: 5 }] }],
      route: [0], respawnMs: 600000, pullDist: 1.5, groupFit: 'party',
    },
    monsters: {
      /* LORD KRELL, Level 110, Human: an old man in Dawnsteel plate. The fire at his back for years: fire does 25% less, poison 15% more (one
         override, the element axis). He started as the formula's boss row for the party fit at the floor (2,256 HP, atk 94, tier 6,
         21,720 XP, coin 251-753) and is fitted to the ship bar (Tyler 11-05: the same gear wins about 30% with a bad bar and 85% with a good
         one, 40 tries a row; the numbers are on his row). His lines: adds at half, shielded to 80% while they stand, enraged at a quarter, x1.6.
         HIS PRIZE (the design's section 4), each rare about 1 kill in 28 since lane/d-march-balance (Krell's row): the first tier 7 in the game (worn from 88), the four weapons and the
         body and helm in three weights. Each row sits under the 5% row ceiling.
         Two prizes wait on their own rows: the Roll Page (a named Hearth fuel, piece 10) and Krell's Toll Box (his Trophy, 100-150 h). */
      lord_krell: { name: 'Lord Krell', icon: '👑', tier: 6, level: 110, cls: 'human', family: 'Human', boss: true,
        /* A HALL'S BOSS (src/data/bosses.js BOSS_KINDS.hall): his ramp is the hall's (lane/tower-boss-formula) */
        bossKind: 'hall',
        /* CHALLENGE IS THE PLAYER'S CALL (Tyler 2026-11-14: "the player should decide whether or not challenge should be on"; lane/d-march-balance).
           At the x1.8 / 0.9x fit an untouched bar without Challenge won 0% at 85, so the fight was re-fitted until both are fair (his row below). */
        elements: { ember: 25, poison: -15 },
        /* his marked hit first, then his pulse (monster-spells.js: castSpells starts the first one ready) */
        spells: ['rake_the_coals', 'hall_fire'],
        /* HIS DAILY PRIZE (Tyler 2026-11-14: "a daily kill"; the designer's spec, PRIORITY_BOARD "The Barrow March hand play, ruled" 3 and 4; built
           by lane/c-krell-daily and lane/c-krell-uniques). A hall's boss pays his rows ONCE A DAY PER HERO, each hero's own roll, never the
           party's shared one (boss-halls.js; src/core/drops.js rollPrize; the server's day table player_boss_loot_day). Every row is a SLICE
           of that one roll: a standard tier 7 piece 40%, each of the 14 as likely (0.4 / 14 a row, about 2.9%), then his two unique pieces,
           the Tollgate 3% and the Banded Legguards 3% (special-attributes.js `source.pm`, read from there), and 54% nothing. A hero who
           kills him every day sees about 2.8 standard pieces a week and a given one about every 35 days, each unique about every 33 days
           and one of the two about every 17; trade shortens it. A hero who took it today can still fight: the kill's XP and coin are
           everyone's, every time. The 0.035 a row below was the shared roll before the daily prize.
           A HERO'S FIRST WIN ALWAYS PAYS A PIECE (the QA audit's F21, 2026-11-15: "I beat the last boss and got 174 gold"): the rows marked
           `first` (the 14 standard pieces) share the empty 54% of a hero's first roll ever, 94% / 14 a row (about 6.7%), and the two unique
           pieces keep their 3% (drops.js prizeSlices; the server says which roll is the first, player_boss_loot_day.first). */
        drops: [...['dawn_sword', 'dawn_warhammer', 'duskwood_bow', 'duskwood_staff', 'duskwood_wand', 'duskwood_codex', 'dawn_hatchets', 'duskwood_crossbow',
          'dawn_platebody', 'dawnhide_body', 'duskweave_body', 'dawn_helm', 'dawnhide_helmet', 'duskweave_helmet'].map((id) => ({ id, ch: 0.4 / 14, band: 'rare', first: true })),
          ...UNIQUES.map((id) => ({ id, ch: SPECIAL_SAMPLE[id].source.pm / 1000, band: 'rare' }))],
        /* FITTED TO THE SHIP BAR (lane/b-barrow-numbers 2026-11-14; node tools/balance-sim/boss-call-table.mjs --hall krells_hold --seeds 40,
           the real settle, tank + healer + hammer + mage at Level 98, the band's middle). On the formula's row (2,256 HP, atk 94) every row
           won in 70 s, the bad bar too. At 7,000 HP, atk 205, enrage x1.25 and the spells below: the good bar 95%, the bad bar 30%, the good
           bar one gear tier behind 30%, about 200 s a kill. His XP and coin stay the formula's: his prize is his drops.
           RE-FITTED ON THE RIGHT ANSWER (designer 2026-11-14, lane/d-hold-pass; 200 tries a row). That fit's good bar had Challenge on, and
           Challenge is the wrong press here (boss-calls.js warnGuard): taking it off, the good bar one gear tier behind won 96%, so gear
           checked nothing. The gear check moved to his enrage, x1.25 to x1.6, and the Hall Fire down to 0.55x (below). With Challenge off:
           the good bar 99%, one gear tier behind 54%, the bad bar 31%, eating at 40% 67%, a healer who waits 72%. With Challenge left on
           the good bar still wins 95%, and a bar never touched 62%.
           RE-FITTED IN THE GEAR HIS KEY HOLDERS WEAR (designer 2026-11-14, lane/d-march-balance). Both fits above were played in tier 3 steel:
           the table dressed its party from the open grounds only, and every March ground is staged (boss-call-table.mjs now plays a hall on
           the ladder it ships on). In the Hold's own tier 6 at 98 he fell in 108 s and every row won, the bad bar 85% and four dps with no
           tank 95%, which is what the hand play found (5 of 5, two minutes, Challenge made no difference). Now 14,000 HP, atk 247 (his
           swing tops out at 543, his hall's written 55% of a bare Level 85 hero's 990 HP), to-hit 0.95 and enrage x1.8, 40 tries a row in tier 6: at 98 the good bar 100%,
           a bar never touched 88%, the bad bar 43%, a tank and Healer pair 85% good and 15% bad, four dps with no tank 3%, about 200 s a
           kill. At 88, the first Level tier 7 is worn: the good bar 100%, the bad bar 30%, one gear tier behind 90%. The four's gear check
           is soft (tier 5 still wins 95% at 98); the pair's is real (one tier behind 45%).
           RE-FITTED FOR A TUNED BAR (the same lane, after the v0.2.132 re-play: 0 of 6 on the bars a party is handed; Tyler 2026-11-14: a good bar
           is one a person spent time tuning; the Coordinator: an untouched bar wins about 20-30% at the floor). That fit (x1.8, the Hall Fire 0.9x)
           made Challenge a trap the other way: an untouched bar without it won 0% at 85, its Healer dead to the hastened Hall Fire with the adds on
           her. FITTED ON THE DOOR'S BAR (the v0.2.133 hands-on check: the "good" bar also re-ordered the Mage, which no hint says; Tyler: "the player
           should decide whether or not challenge should be on"): every role on its default moves and Target, eating at 75% and the healer's two heals,
           what the door's hints alone build (boss-call-table.mjs BARS.door). 18,000 HP, enrage x1.8, the Hall Fire 0.65x. 40 tries a row, Challenge
           on / off: the door's bar 90 / 88 at 85, 90 / 80 at 88, 90 / 90 at 98; an untouched bar on Salted Lobster 68 / 65, 80 / 60, 90 / 73; the bad
           bar 8 / 0, 20 / 3, 30 / 20; the start bar's Salted Shrimp 0. General hints (eat, heal) can't open more than about 25 points over an untouched
           bar here without making one Challenge choice a trap. The start bar can't be fitted without making him nothing on real food, so the door
           says the food (hall.storeFloor) and the hints (hall.words.bars: food, eating, healing, party, never a move). His enraged swing tops out at 977, past a bare floor hero's HP: the hall's blow
           cap reads his row, not his enrage (tests/hunt-core/hunt-data.mjs blow-share), and it lands on the tank.
           HIS PRIZE CUT TO 0.035 A ROW (the same lane). At 0.1 a row a kill dropped 1.4 tier 7 pieces, and a four at 98 gets a key about
           every 48 min (the real settle: 0.67 keys an hour, 3 x 2 h), so a party saw about 1.7 tier 7 pieces an hour, the rate tier 6 Scarce
           drops at. Tier 7 is the last standard tier (Tyler 2026-11-14), so it is the chase: at 0.035 a kill drops about one piece in two,
           a four sees one of a given piece about every 23 h, and a hero's own weapon, body and helm come in about 40 h if the party passes
           them round. */
        hp: 18000, atk: 247, aim: 290, evasion: 137, def: 80, xp: 21720, gp: [176, 527], speed: 2800, // gp: the pack's income dial (gpFit 0.7) on [251, 753], mean kept
        phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1800, guardPm: 800, hasten: { spell: 'hall_fire', cdPm: 500 } } },
      /* CAPTAIN HASK, read off the Roll: the man who sold the crossing. Everyone who gets here killed him in the Muster Barrows; now the man who
         bought him calls him by name and he has to come. A NAMED ADD (boss and add both, piece 6): the formula's elite at 100, and his own enrage
         line, the Barrows' (a quarter, x1.15); never a wave or a guard of his own. Not the Barrows' own Hask row: the two never share an id. */
      hall_hask: { name: 'Captain Hask', icon: '⚔️', tier: 6, level: 100, cls: 'undead', family: 'Undead', boss: true, add: true,
        /* a boss's kit, the marked hit then the pulse (Tyler 2026-11-08; tests/hunt-core/spell-rows.mjs boss-kits) */
        spells: ['hasks_cleave', 'hasks_war_cry'],
        /* fitted with the hall (2026-11-14): on the elite's 263 HP he fell in seconds and nobody met him. At 700 HP and atk 135 he is the
           wave's question. His attack is the hall's most sensitive number: at 110 the bad bar won 58%, at 150 the good bar lost its tank
           (both in tier 3 steel, see Krell's row). In tier 6 at 98, 170 (his Cleave held to 1.4x, under the written 55%). */
        hp: 700, atk: 170, aim: 280, evasion: 112, def: 72, xp: 3082, gp: [39, 116], speed: 3000, drops: [], phases: { enragePm: 250, enrageAtkPm: 1150 } },
      /* Two of the company's officers, standing up out of the hall floor: the Hold's Grave Guard row (formula heavy at 92), paying a kill as there */
      hall_grave_guard: { name: 'Grave Guard', icon: '🛡️', tier: 6, level: 92, cls: 'undead', family: 'Undead', add: true,
        hp: 182, atk: 78, aim: 269, evasion: 64, def: 58, xp: 1973, gp: [27, 80], speed: 2400, drops: [] },
    },
  },
  /* THE HOLD'S SPELLS (src/data/monster-spells.js rows; the design's sections 2 and 3).
     THE HALL'S FOUR, MEASURED (lane/b-barrow-numbers 2026-11-14; boss-call-table.mjs --hall krells_hold --seeds 40 --spell <row>.hitPm=N, the
     ship rows at Level 98 with Krell's and Hask's fitted rows: win % on the good bar / the bad bar / the good bar one gear tier behind).
     As set then, in tier 3 steel: 95 / 30 / 30. Re-fitted in tier 6 (Krell's row, lane/d-march-balance): the Rake 0.96x and Hask's Cleave 1.4x, under the hall's written 55% at his and Hask's new attack.
       Rake the Coals: Krell's marked cone, the tank's to stand in and a ranged hero's to step off. 1.2x, Chief Coppercap's Slag Toss.
         Nearly off (0.1x) 98 / 65 / 83, at 2x 75 / 15 / 5: it is the tank's check, and 1.2x holds the bar.
       The Hall Fire: his pulse on every hero in the room, every 20 s, and every 10 s under a quarter (phases.hasten cdPm 500). 0.95x.
         At the old 0.4x a boss this size never troubled a healer who waits. At 0.7-0.85x the bad bar still won 43-46%. At 0.95x it is what
         kills a bad bar: 17 of its 28 losses were the Healer, in the enrage. NOW 0.65x (lane/d-march-balance, the door's-bar fit on Krell's row: an
         untouched healer and late eating lose to it, a tuned one does not). Before that 0.55x (lane/d-hold-pass 2026-11-14): with the enrage at
         x1.6 the tank's gear is what decides the finish, and at 0.55x the pulse everyone takes tops out at 248, 25% of a bare Level 85 hero.
       Cleave: Captain Hask's own marked blow, the two tiles in front of him. 1.5x. Nearly off 100 / 30 / 58, at 2.5x 90 / 30 / 13: it
         only reaches a tank in weak gear, which is its job.
       War Cry: his pulse while he stands, 0.4x every 20 s, no element. Nearly off 100 / 38 / 33, at 0.8x 95 / 28 / 20. Two pulses on
         the party until Hask is down, so the answer is to kill him first. 0.4x is enough to say it.
     THE GROUND'S TWO (the same lane, graded with the ground on the full grade):
       Shield Slam: the Grave Guard's marked hit on the two tiles in front of him, on the Foreman's cone and at his number, 1.0x every 20 s. At 1.5x every
         16 s a lone sword at the floor read a typical low of 59.6% HP on Normal, under the sheet's 60, and at 1.2x every 20 s only 60.5.
       Mend the Dead: the Pyre Priest's mend. From 4 tiles, every 16 s, it puts up to half his own biggest hit back on the most hurt body
         in his pull. He never mends himself. At a full hit every 8 s a lone tank at Level 110 on Dangerous (three Priests in the Chapel's
         pull) healed slower than he killed: 7.5k XP an hour, no death, a fight that never ended. A mend must slow a kill, never stop it.
       Hot Pitch (lane/d-harder-monsters, 2026-11-19; the balance audit's fix 2): the Gatekeeper calls the gatehouse's pitch down on the whole party.
         The Hold's two reached only the tank (a cone) and the monsters (a mend), so the back seats of a recorded Deadly four took next to nothing but
         the Lookout's bolts (Tyler 2026-11-08: area spells are there "so the whole party takes damage"). ON THE GATEKEEPER, NOT THE FARMHANDS, MEASURED:
         on the swarm (at 1.0x every 24 or 32 s, or 0.6x) a lone tank at the Hold's floor in its own tier read 552k / 591k / 574k Level XP an hour on
         three seeds against the Pyre Field's 574k / 582k / 570k at the same Level (585k / 605k / 597k with no pitch): the harder ground paid less
         (tests/hunt-core/forest-cave.mjs harder-pays-more; Tyler 2026-11-04 "harder mobs grant better loot and more exp"). On the Gatekeeper it reads
         591k / 591k / 597k. 1.0x EVERY 16 S (the seed row's 16 s): his swing tops out at 253, so it lands up to 253 on every hero, 26% of a bare floor
         hero's 990 HP. At 1.35x the recorded Deadly fours' Healer, already the Lookout's mark, died 0.5 and 1 times an hour in the replay where the
         record has none (tests/balance-calibration.mjs BC-3; 0.25 at 1.35x every 24 or 32 s); at 1.0x none died, the back seats took 3-4k an hour
         from it and the four's store bill rose about 5%. */
  spells: {
    hot_pitch: { n: 'Hot Pitch', shape: 'group', range: 6, windupMs: 2000, cdMs: 16000, hitPm: 1000, element: 'ember' },
    rake_the_coals: { n: 'Rake the Coals', shape: 'cone', len: 4, range: 1, windupMs: 1800, cdMs: 14000, hitPm: 960, element: 'ember' },
    hall_fire: { n: 'Hall Fire', shape: 'group', range: 6, windupMs: 2000, cdMs: 20000, hitPm: 650, element: 'ember' },
    hasks_cleave: { n: 'Cleave', shape: 'cone', len: 2, range: 1, windupMs: 1600, cdMs: 14000, hitPm: 1400, element: null },
    hasks_war_cry: { n: 'War Cry', shape: 'group', range: 6, windupMs: 2000, cdMs: 20000, hitPm: 400, element: null },
    shield_slam: { n: 'Shield Slam', shape: 'cone', len: 2, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 1000, element: null },
    pyre_rite: { n: 'Mend the Dead', shape: 'mend', range: 4, windupMs: 1600, cdMs: 16000, hitPm: 500, element: null },
  },
  map,
});
