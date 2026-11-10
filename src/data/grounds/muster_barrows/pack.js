// src/data/grounds/muster_barrows/pack.js — THE MUSTER BARROWS, Levels 55-75: the Barrow March's third ground and the first with a
// boss built as a pack (lane/b-muster-barrows, designer 2026-11-09; the board's "Where the 50-plus band goes", row 3).
// Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new muster_barrows --like coppercap_warrens --band 55,75` (the
// Warrens: the party-built ground with a boss), then every row rewritten. The stat lines are the formula's
// (`node tools/pack.mjs propose muster_barrows --write`).
//
// NAMING VOICE (the Barrow March's; Hask's Ford wrote it first): a free company's soldier words (banded, pike, muster, file, colors,
// sergeant, spur) and the grave's working words (barrow, cairn, kerb, bier, urn, coffin nail). People get one short name (Hask,
// Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors, armor).
// THE STORY (Tyler 2026-11-09, the arc of record): Captain Hask sold the crossing to Lord Krell, and Krell's men killed the Banded
// Company at the Ford. The river took some (the Slake). The company's own survivors carried the officers and what they could of the
// files into the old barrow field in the alder wood behind the ford, buried them armed and never burned them. They buried Hask too,
// under the biggest mound, in his captain's cloak and with Krell's price in his purse: nobody knew yet. Krell's priests burned the
// rest on the Pyre Field, and Krell's Hold ends the region. The field was old before the company dug into it: the Cairn Wights
// were there first. The Hearth lays the dead to rest: their Bone Chips burn at Inner Flame 40 and Grave Dust at 46.
//
// ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08; lane/b-one-difficulty, which this lane sits on). There is no party-size row
// here: no partyPull, no per-size tier pull, no party pay cells, no soloFrom. A monster has its row's HP and pays its whole kill
// whoever fights it. `groupFit: 'party'` only picks the formula's party-built stats (2.5x the HP, a softer blow, 0.8 of the XP a
// point: four heroes' damage on one tank) and orders the Hunts window's advice. `forParty: 4` on the Captain's Barrow is the warning
// the Hunts window shows before Enter. Neither gates anything: a lone hero walks every pocket, Hask's included.
//
// THE BODIES ARE THE ONES WITH ART (origin/lane/b-muster-barrows-art aac5732b1): the Muster's own Barrow Knight and Captain Hask
// (art/world/muster) and the March's pikeman and wight (art/world/march, drawn for the Ford and named for this ground by the art
// lane's brief). Four bodies, not five: a fifth needs a drawing first. A monster's numbers are its ground's (the formula reads the
// floor and the fit), so each is this ground's own row under its own id, and the art import adds one line each to
// src/data/monster-art.js HUNT_ART_ALIAS: barrow_pikeman > banded_pikeman, cairn_wight > wight, muster_knight > barrow_knight
// (monsters.js already holds an old `barrow_knight` row with no ground, which a pack can't replace: it retires in a world move).
// EACH CLASS HAS A MARK, and no two bodies ask for the same answer. The Barrow Pikeman is the Undead class as written (a hammer
// breaks it): the many, the area blow's work. The Cairn Wight is cloth and dust with no armor on it (weapon override: an arrow's
// mark; a spell sinks into the cold, as the Ford's wight). The Barrow Knight was buried in his plate (weapon override: a spell
// goes through the visor; a blade and an arrow glance off). Captain Hask is the class as written: the tank's hammer and the Mage's
// Fire Runes both work on him. A weakness is +20% damage and +15% accuracy (combat.js WEAKNESS_BONUS); a resistance is the
// bestiary's words only (no engine reads weaponResist, flagged to Systems by the Slake).
//
// CAPTAIN HASK IS THE GAME'S FIRST BOSS ROW WRITTEN FOR TYLER'S BOSS RULES (2026-11-05: adds at 50% health, an enrage at 25%, a
// real boss bar, a losing line that names the phase; 2026-11-08: the tank soaks the heavy hit, casters step off it, and an
// unavoidable pulse hits the whole group). THE ROW BELOW IS WHAT THE ENGINE CAN PLAY ON A GROUND TODAY: a boss-role stat line, his
// blow held to a third of the floor hero's HP, two Barrow Knights standing with him as built, the warning before Enter. THE DESIGN
// THE ROW WAITS FOR, as data the day the engine takes it:
//     phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1400 }                    on captain_hask
//     adds: [[muster_knight, 44, 24], [muster_knight, 52, 24]]                      on the Captain's Barrow pocket
//   At half health two Barrow Knights come out of the Sergeants' Row for whoever isn't holding him (Challenge and an area slot
//   answer it). Under a quarter he hits 40% harder (the eat lines and the Healer's slots decide the finish). Unmeasured.
// WHAT IS MISSING, exactly (each built for a CALLED room only, src/data/boss-calls.js):
//   1. tools/gen-hunt-sessions.mjs refuses both on a ground: line 668 "has phases and is no called row", line 671 "has adds and is
//      no called room". The server catalogue and its kill bounds have no row for an add that pays.
//   2. src/core/hunt/leash.js resetPack heals a ground's boss and leaves his adds standing (a called room never resets), so after a
//      wipe his 50% line is crossed again and a second wave joins the first. Adds must leave on a reset and with the pocket's respawn.
//   3. src/core/hunt/boss-phases.js keeps no state because a called boss's HP only falls. On a ground it needs "once a life".
//   4. src/shell/widgets/boss-bar.js reads callOfHunt only: quiet on every ground. src/hunt-view/boss-loss.js, the losing line, the same.
//   5. No monster has the dodgeable heavy hit or the whole-group pulse yet (lane/d-area-spells is a spec).
//   6. The grader plays no boss fight as a fight: the ship bar (same gear about 30% with a bad bar, 85% with a good one) has no cell.
//
// THE LOOT (src/data/loot-bands.js). THIS IS WHERE TIER 5 ARMOR COMES FROM (worn from Level 60; the spec gave it no home): the
// whole set in all three weights, Scarce, about hourly a piece (Pikemen boots and helmets, Wights legs, Knights bodies), with one
// tier-5 weapon on each (sword, staff, warhammer). Rare, each about every 15 h: the Wights' Yew Wand and Yewclasp Spellbook, the
// Knights' gloves, and Hask's belts and Yew Bow. Hask's Trophy is his Mantle. The Pyre Field's pack carries the same set for a lone
// hero ten Levels on. Tier 5 has no sale rate (loot-bands.js VENDOR_GEAR_RATES stops at tier 3): a tier above the table sells at
// its last rate, 0.14 of book, and the hour's gear would sell for several times its coin. This pack ships only with or after the
// tier-4 and tier-5 rates (the Pyre Field's pack says the same).
// Commons feed the Hearth (Bones, Big Bones, Bone Chips, Grave Dust). Each body drops its own imbuement item, kept for the imbuer
// (catalogue-coherence.js VENDOR_TRASH until imbuing is built): Sergeant's Spur and Hask's Coin have icons on the art lane, Coffin
// Nail and Urn Shard need one each. The ground's named fuel waits on a pack field for NAMED_FUELS (src/data/hearth.js): no row.
import { definePack, box } from '../shape.js?v=0.2.112';
import map from './map.js?v=0.2.112';

const PK = 'barrow_pikeman', CW = 'cairn_wight', BK = 'muster_knight', HASK = 'captain_hask';

export default definePack({
  id: 'muster_barrows',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 16 Pikemen, 5 Wights and 6 Knights. Hask holds
     his barrow and has no weight (checks.holders). */
  hunt: {
    name: 'The Muster Barrows', theme: 'The Banded Company buried its officers here. It buried Captain Hask too, who sold them.',
    band: [55, 75],
    spawns: [{ monster: PK, w: 16, rarity: 'common' }, { monster: BK, w: 6, rarity: 'uncommon' }, { monster: CW, w: 5, rarity: 'uncommon' }],
    family: 'Undead', art: BK, travelS: 0, pull: 4, respawnMs: 90000,
  },
  /* THE ROUTE: in off the Ford road to the Muster Field, down the lane to the Wet Hollow, east along the south edge to the Biers,
     up the sunken lane between the Long Barrows, north to the Sergeants' Row and along it, then down the east side to the
     Captain's Barrow. Hask is last, so a party meets every body before it meets him. */
  ground: {
    map: 'muster_barrows',
    /* on the road in, one tile a seat */
    start: [[1, 9], [1, 10], [1, 8], [1, 11]],
    pockets: [
      /* P0 the Muster Field: the first pull, the company's foot standing where it was counted */
      box([1, 4, 19, 16], [9, 10], [PK, PK, PK], [CW, PK, PK, BK, PK]),
      /* P1 the Wet Hollow: the field's older dead, up out of the reed bed */
      box([4, 24, 18, 38], [9, 26], [CW, CW, PK], [PK, CW, PK, PK, CW]),
      /* P2 the Biers: the dead laid out for a pyre nobody lit */
      box([19, 29, 33, 38], [25, 32], [PK, PK, CW], [PK, BK, PK, CW, PK]),
      /* P3 the Long Barrows: the rank and file, and a sergeant still keeping the file */
      box([20, 13, 37, 28], [26, 19], [PK, PK, BK], [PK, CW, PK, PK, CW]),
      /* P4 the Sergeants' Row, its west barrows */
      box([34, 3, 45, 15], [40, 9], [BK, PK, PK], [CW, PK, BK, PK, PK]),
      /* P5 the Sergeants' Row, its east barrows: two Knights at once */
      box([46, 3, 58, 15], [51, 12], [BK, BK, PK], [PK, CW, PK, BK, PK]),
      /* P6 the Captain's Barrow: Captain Hask in the forecourt of the great mound, two of his sergeants with him. BUILT FOR FOUR
         (`forParty`, a warning before Enter and never a gate, Tyler 2026-11-08). */
      { ...box([37, 21, 57, 38], [48, 26], [HASK, BK, BK], [PK, PK, CW, PK, PK]), forParty: 4 },
    ],
    route: [0, 1, 2, 3, 4, 5, 6],
    respawnMs: 90000, pullDist: 1.5, groupFit: 'party',
    densityMax: [8, 8, 8, 8],
  },
  monsters: {
    barrow_pikeman: {
      name: 'Barrow Pikeman', icon: '💀', tier: 4, level: 57, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot, buried in file under the Long Barrows with their pikes beside them. The
         class as written (no override): a hammer breaks them, and they come many at a time, so the area blow earns its slot here.
         Their boots and helmets, their sidearm, their bones for the Hearth. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'coffin_nail', ch: 0.08, band: 'uncommon' },
        { id: 'rune_boots', ch: 0.01, band: 'scarce' }, { id: 'wyvernhide_boots', ch: 0.01, band: 'scarce' }, { id: 'sorcerer_boots', ch: 0.01, band: 'scarce' },
        { id: 'rune_helm', ch: 0.01, band: 'scarce' }, { id: 'wyvernhide_helmet', ch: 0.01, band: 'scarce' }, { id: 'sorcerer_helmet', ch: 0.01, band: 'scarce' },
        { id: 'rune_sword', ch: 0.01, band: 'scarce' }],
      hp: 191, atk: 23, baseAcc: 1.04, def: 21, xp: 1309, gp: [21, 64], formula: true },
    cairn_wight: {
      name: 'Cairn Wight', icon: '🪦', tier: 4, level: 60, cls: 'undead', family: 'Undead', speed: 4000,
      /* the glass, quick enough to reach the back line: the dead who were in this field before the company dug into it, cloth and
         dust under the old cairns. Nothing on it turns an arrow (one override, weapon: weak to ranged; a spell sinks into the cold,
         the bestiary's words). Its grave dust for the Hearth, the legs it was wound in, and the caster's prizes. */
      weaponWeak: 'ranged', weaponResist: ['magic'],
      drops: [{ id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'urn_shard', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platelegs', ch: 0.03, band: 'scarce' }, { id: 'wyvernhide_pants', ch: 0.03, band: 'scarce' }, { id: 'sorcerer_pants', ch: 0.03, band: 'scarce' },
        { id: 'yew_staff', ch: 0.03, band: 'scarce' },
        { id: 'yew_wand', ch: 0.002, band: 'rare' }, { id: 'yew_spellbook', ch: 0.002, band: 'rare' }],
      hp: 188, atk: 31, baseAcc: 1.03, def: 22, xp: 1578, gp: [21, 63], formula: true },
    muster_knight: {
      name: 'Barrow Knight', icon: '⚔️', tier: 5, level: 66, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser: the company's mounted sergeants, buried armed in the round barrows of the Row with a sword set before each and
         their horses beside them. Still in the plate (one override, weapon: a spell goes through the visor, so weak to magic; a
         blade and an arrow glance off, the bestiary's words). The bodies, the warhammer, and the gauntlets nobody could get off. */
      weaponWeak: 'magic', weaponResist: ['sword', 'ranged'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'sergeant_spur', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platebody', ch: 0.03, band: 'scarce' }, { id: 'wyvernhide_body', ch: 0.03, band: 'scarce' }, { id: 'sorcerer_body', ch: 0.03, band: 'scarce' },
        { id: 'rune_warhammer', ch: 0.03, band: 'scarce' },
        { id: 'rune_gauntlets', ch: 0.002, band: 'rare' }, { id: 'wyvernhide_gloves', ch: 0.002, band: 'rare' }, { id: 'sorcerer_gloves', ch: 0.002, band: 'rare' }],
      hp: 440, atk: 41, baseAcc: 0.9, def: 44, xp: 3677, gp: [49, 147], formula: true },
    captain_hask: {
      name: 'Captain Hask', icon: '👑', tier: 5, level: 75, cls: 'undead', family: 'Undead', speed: 2800, boss: true,
      /* THE BOSS: the Banded Company's captain, who sold the crossing to Lord Krell and was buried by the men he sold, in his cloak
         and with the price still on him. The class as written (no override): a hammer and fire both answer him. His belts and the
         bow are the Rares, his Mantle the Trophy. His phases are in the header: this row is what a ground's engine plays today. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.5, band: 'common' }, { id: 'hasks_coin', ch: 0.15, band: 'uncommon' },
        { id: 'rune_belt', ch: 0.01, band: 'rare' }, { id: 'wyvernhide_belt', ch: 0.01, band: 'rare' }, { id: 'sorcerer_belt', ch: 0.01, band: 'rare' },
        { id: 'yew_bow', ch: 0.01, band: 'rare' },
        { id: 'hasks_mantle', ch: 0.0012, band: 'trophy' }],
      hp: 1556, atk: 50, baseAcc: 0.9, def: 52, xp: 14281, gp: [173, 520], formula: true },
  },
  roster: {
    barrow_pikeman: 'swarm',   // the common majority
    cairn_wight: 'glass',      // quick (4000), fragile, lands often
    muster_knight: 'elite',    // the bruiser in plate
    captain_hask: 'boss',
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw), and
     Hask's Trophy (a collector's piece like the Crown and the Cauldron until the Trophy Room hangs boss trophies). */
  items: {
    coffin_nail: { n: 'Coffin Nail', icon: '🔩', v: 114, raw: true, imbue: { kind: 'ward', tier: 2 } },
    urn_shard: { n: 'Urn Shard', icon: '🏺', v: 120, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    sergeant_spur: { n: 'Sergeant\'s Spur', icon: '⚙️', v: 132, raw: true, imbue: { kind: 'keen', tier: 2 } },
    hasks_coin: { n: 'Hask\'s Coin', icon: '🪙', v: 150, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
    hasks_mantle: { n: 'Hask\'s Mantle', icon: '🧥', v: 11000, type: 'trophy', tag: 'trophy', rarity: 'legendary' },
  },
  itemText: {
    coffin_nail: 'An iron nail out of a coffin lid in the Long Barrows. The Barrow Pikeman under it pushed it out himself',
    urn_shard: 'A piece of a burial urn older than the Banded Company. The Cairn Wights were in this field first',
    sergeant_spur: 'The spur off a Barrow Knight\'s boot. The company buried its sergeants armed, with their horses beside them',
    hasks_coin: 'One coin of the price Lord Krell paid Captain Hask for the ford. Hask was buried with all of it',
    hasks_mantle: 'The captain\'s cloak Hask wore the day he sold the crossing. The men he sold buried him in it',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the March's store food and drink, and Chalked Fire Runes (the unburned dead
     take 15% more fire). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE PACK'S TEST FACTS. Hask holds his barrow (no spawn weight). dropRef: the four the ground is built for, at the floor in their
     own-tier set (tests/hunt-core/drop-tables.mjs, as the Warrens'). */
  checks: { holders: [HASK], dropRef: { roles: ['tank', 'healer', 'bow', 'mage'], full: true } },
  map,
});
