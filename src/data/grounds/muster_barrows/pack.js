// src/data/grounds/muster_barrows/pack.js — THE MUSTER BARROWS, Levels 55-75: the Barrow March's third ground and the first with a
// boss built as a pack (lane/b-muster-barrows, designer 2026-11-09; the board's "Where the 50-plus band goes", row 3).
// Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new muster_barrows --like coppercap_warrens --band 55,75` (the
// Warrens: the party-built ground with a boss), then every row rewritten. The stat lines are the formula's
// (`node tools/pack.mjs propose muster_barrows --write`).
//
// NAMING VOICE (the Barrow March's; Hask's Ford wrote it first): a free company's soldier words (banded, pike, muster, file, colors,
// sergeant, spur) and the grave's working words (barrow, cairn, kerb, bier, urn, coffin nail). People get one short name (Hask,
// Krell). Never Ancient, Shadow, Dark, Eternal or Forgotten. American spelling (colors, armor).
// THE STORY (Tyler 2026-11-09, the arc of record; the board's 2026-11-10 Barrow March arc, "Then Krell cleaned up, and each ground is
// one piece of the cleaning"): Havora hired the Banded Company under Captain Hask to hold the ford; Lord Krell bought its captain,
// Hask sold the crossing, and Krell's men killed the company where it stood. The river took some (the Slake). Krell buried the
// officers here with honors, armed and in their plate, so it would look like a lost battle, and he buried Hask with them, under the
// biggest mound in his captain's cloak with Krell's price still in his purse, to keep him quiet. Hask still answers to Krell: in
// Krell's Hold he stands up out of the floor when Krell reads the company's Muster Roll (the board's Lord Krell, his 50% line).
// Krell's Binders burned the foot on the Pyre Field, and Krell's Hold ends the region. The field was old before Krell dug into it:
// the Cairn Wights were there first. The Hearth lays the dead to rest: their Bone Chips burn at Inner Flame 40 and Grave Dust at 46.
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
// CAPTAIN HASK IS THE GAME'S FIRST GROUND BOSS BUILT TO TYLER'S BOSS RULES (2026-11-05: adds at 50% health, an enrage at 25%, a
// real boss bar). His row carries the same `phases` a called boss does and his pocket the same `adds`, played by the one engine
// (src/core/hunt/boss-phases.js), viewed or with the browser closed (tests/ground-boss.mjs):
//   At half health two Barrow Pikemen of his file stand up out of the barrows on the north edge and go for whoever isn't holding
//   him (Challenge and an area slot answer it). Under a quarter he hits 15% harder (the eat lines and the Healer's slots decide the
//   finish). MEASURED, because one difficulty sends a lone hero into his barrow and the sheet's "in range is safe" (11-04) grades
//   that hero: quick grade (1 seed x 1 h, Normal), a lone Ranger at the floor (Level 55) died to him at +20% and above, none at +15%;
//   full grade (6 seeds x 4 h a lone way), with a wave of two Barrow Knights a lone sword, hammer and axes at the floor died 13 times
//   in 576 h (none without his lines), so the wave is his file, the swarm an area slot answers, not his sergeants.
// ON A GROUND, NOT IN A ROOM: his adds are the ground's own Barrow Pikemen and pay a Pikeman's kill (a called room's pay nothing).
// A wipe or a holder walking out resets his barrow: he heals and his adds leave (leash.js isAdd), so every try brings one wave.
// His bar is the called boss's (src/shell/widgets/boss-bar.js), shown on a ground once he is hurt. No guard (`guardPm`): his
// file fights for him, it doesn't stand in front of him. Unmeasured as a fight: the grader plays the lap, not a boss try.
// STILL OPEN: the losing line that names the phase (src/hunt-view/boss-loss.js reads the server's record of a CALLED fight only);
// the tank's dodgeable heavy hit and the whole-group pulse (Tyler 2026-11-08; lane/d-area-spells is a spec); the ship bar (same
// gear about 30% with a bad bar, 85% with a good one) has no grader cell.
// THE FULL GRADE (2026-11-10, this row and his file of Pikemen, 252 cells): 1 FAIL, 1 unproven, 36 ok. FAIL tier-deadly-four-held: a
// four with no Healer (tank, hammer, bow, mage) at the floor on Deadly lost its tank 53 times in 16 h (the sheet allows 9; the four
// with a Healer 3). Its killers were the ground's own (Knights 20, Pikemen 17, Wights 9) and Hask 7, so it is the Deadly pull, not his
// lines: the designer's. UNPROVEN feel-normal-deaths: a lone Ranger at the floor on Normal died twice in 192 h (Hask 1, a Knight 1).
//
// THE LOOT (src/data/loot-bands.js). THIS IS WHERE TIER 5 ARMOR COMES FROM (worn from Level 60; the spec gave it no home): the
// whole set in all three weights, Scarce, about hourly a piece (Pikemen boots and helmets, Wights legs, Knights bodies), with one
// tier-5 weapon on each (sword, staff, warhammer). Rare, each about every 15 h: the Wights' Yew Wand and Yewclasp Spellbook, the
// Knights' gloves, and Hask's belts and Yew Bow. HASK'S TROPHY WAITS ON ITS ICON: Hask's Mantle ("The captain's cloak Hask wore the
// day he sold the crossing. The men he sold buried him in it", type and tag trophy, legendary, v 11000), his last row at Trophy odds.
// The art lane drew it over the old barrowking_mantle icon. Every item needs its own icon the day its row lands
// (tests/pixel-icons.mjs), and a revealed one before it may drop (drop-tables loot-structure). The Pyre Field's pack carries the same set for a lone
// hero ten Levels on. Tier 5 has no sale rate (loot-bands.js VENDOR_GEAR_RATES stops at tier 3): a tier above the table sells at
// its last rate, 0.14 of book, and the hour's gear would sell for several times its coin. This pack ships only with or after the
// tier-4 and tier-5 rates (the Pyre Field's pack says the same). Measured here (drop-tables, the four at the floor, each Scarce piece
// every 1.00-1.04 h and each Rare every 14.6-15.2 h): at 0.14 the hour's gear sells for 12,890 g a head against 7,178 of coin, and the
// caps hold up to 0.04 of book for tier 5.
// Commons feed the Hearth (Bones, Big Bones, Bone Chips, Grave Dust). Each body drops its own imbuement item, kept for the imbuer
// (catalogue-coherence.js VENDOR_TRASH until imbuing is built): Sergeant's Spur and Hask's Coin have icons on the art lane, Coffin
// Nail and Urn Shard need one each. The ground's named fuel waits on a pack field for NAMED_FUELS (src/data/hearth.js): no row.
import { definePack, box, gather, addRows } from '../shape.js?v=0.2.123';
import map from './map.js?v=0.2.123';

const PK = 'barrow_pikeman', CW = 'cairn_wight', BK = 'muster_knight', HASK = 'captain_hask';

export default definePack({
  id: 'muster_barrows',
  status: "staged",
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 16 Pikemen, 6 Wights and 5 Knights, who stand only
     on the Sergeants' Row and with their captain. Hask holds his barrow and has no weight (checks.holders). */
  hunt: {
    name: 'The Muster Barrows', theme: "Lord Krell buried the Banded Company's officers here to make it look like they died in battle. Captain Hask sold them out, and he's buried here too.",
    band: [55, 75],
    spawns: [{ monster: PK, w: 16, rarity: 'common' }, { monster: CW, w: 6, rarity: 'uncommon' }, { monster: BK, w: 5, rarity: 'rare' }],
    family: 'Undead', art: BK, travelS: 0, pull: 4, respawnMs: 90000,
  },
  /* THE BIGGER PULLS WAKE THE SERGEANTS. A pocket's first three are the room as built (Normal) and its fourth sets the weights. Slots
     5 to 8 come only on Dangerous and Deadly and hold a Knight or two and a Wight, the bodies that hit hardest. Measured on the quick
     grade (1 seed x 1 h a cell): with Pikemen in those slots a four at the floor held Deadly with no death and a typical low of 44%;
     with two Knights in every pocket's it died 4 times in the hour (the sheet allows 9 in 16 hero-hours); on this mix once. Normal
     does not move.
     THE ROUTE: in off the Ford road to the Muster Field, down the lane to the Wet Hollow, east along the south edge to the Biers,
     up the sunken lane between the Long Barrows, north to the Sergeants' Row and along it, then down the east side to the
     Captain's Barrow. Hask is last, so a party meets every body before it meets him. */
  ground: {
    map: 'muster_barrows',
    /* on the road in, one tile a seat */
    start: [[1, 9], [1, 10], [1, 8], [1, 11]],
    pockets: [
      /* P0 the Muster Field: the first pull, the company's foot standing where it was counted */
      box([1, 4, 19, 16], [9, 10], [PK, PK, PK], [CW, BK, PK, CW, PK]),
      /* P1 the Wet Hollow: the field's older dead, up out of the reed bed */
      box([4, 24, 18, 38], [9, 26], [CW, CW, PK], [PK, CW, BK, PK, CW]),
      /* P2 the Biers: the dead laid out for a pyre nobody lit */
      box([19, 29, 33, 38], [25, 32], [PK, PK, CW], [PK, BK, CW, PK, BK]),
      /* P3 the Long Barrows: the rank and file in the sunken lane, and a sergeant keeping the file when the whole barrow wakes */
      box([20, 13, 37, 28], [26, 19], [PK, PK, CW], [PK, BK, CW, PK, PK]),
      /* P4 the Sergeants' Row, its west barrows */
      box([34, 3, 45, 15], [40, 9], [BK, PK, PK], [CW, BK, PK, CW, BK]),
      /* P5 the Sergeants' Row, its east barrows. One Knight as built and a second at four: as built with two, a Knight killed a lone bow
         at the floor on Normal (quick grade), and Normal in range is safe (11-04) */
      box([46, 3, 58, 15], [51, 12], [BK, PK, PK], [BK, CW, BK, PK, PK]),
      /* P6 the Captain's Barrow: Captain Hask in the forecourt of the great mound, two of his sergeants with him. BUILT FOR FOUR
         (`forParty`, a warning before Enter and never a gate, Tyler 2026-11-08). HIS WAVE (`adds`, his `phases` line at half
         health): two Barrow Pikemen of his file out of the barrows on the pocket's north edge, the walk down to him (the header). */
      { ...box([37, 21, 57, 38], [48, 26], [HASK, BK, BK], [PK, BK, CW, PK, PK]), forParty: 4, adds: addRows([PK, 44, 24], [PK, 52, 24]) },
    ],
    route: [0, 1, 2, 3, 4, 5, 6],
    respawnMs: 90000, pullDist: 1.5, groupFit: 'party',
    densityMax: [8, 8, 8, 8],
    /* THE GATHER SLIDER (inert until the hunt-gathering engine lands; tests/hunt-core/forest-cave.mjs gather-nodes): the field's few
       standing oaks, as the Slake's (refKillMs the Slake's 12000). Stand-ins: the March kit keeps the Greenhaven oak out and has no
       alder node kind yet (hunt-grounds.js GROUND_NODE_KINDS), so they swap when one exists. */
    gather: gather(12000, [['oak_tree', 4, 13, 0], ['oak_tree', 15, 14, 0], ['oak_tree', 22, 18, 3], ['oak_tree', 33, 24, 3]]),
  },
  monsters: {
    barrow_pikeman: {
      name: 'Barrow Pikeman', icon: '💀', tier: 4, level: 57, cls: 'undead', family: 'Undead', speed: 3400,
      /* the swarm, the common majority: the company's foot, buried in file under the Long Barrows with their pikes beside them. The
         class as written (no override): a hammer breaks them, and they come many at a time, so the area blow earns its slot here.
         Their boots and helmets, their sidearm, their bones for the Hearth. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'coffin_nail', ch: 0.08, band: 'uncommon' },
        { id: 'rune_boots', ch: 0.016, band: 'scarce' }, { id: 'wyvernhide_boots', ch: 0.016, band: 'scarce' }, { id: 'sorcerer_boots', ch: 0.016, band: 'scarce' },
        { id: 'rune_helm', ch: 0.016, band: 'scarce' }, { id: 'wyvernhide_helmet', ch: 0.016, band: 'scarce' }, { id: 'sorcerer_helmet', ch: 0.016, band: 'scarce' },
        { id: 'rune_sword', ch: 0.016, band: 'scarce' }],
      hp: 191, atk: 23, baseAcc: 1.04, def: 21, xp: 1100, gp: [21, 64], formula: true },
    cairn_wight: {
      name: 'Cairn Wight', icon: '🪦', tier: 4, level: 60, cls: 'undead', family: 'Undead', speed: 4000,
      /* the glass, quick enough to reach the back line: the dead who were in this field before the company dug into it, cloth and
         dust under the old cairns. Nothing on it turns an arrow (one override, weapon: weak to ranged; a spell sinks into the cold,
         the bestiary's words). Its grave dust for the Hearth, the legs it was wound in, and the caster's prizes. */
      weaponWeak: 'ranged', weaponResist: ['magic'],
      drops: [{ id: 'grave_dust', ch: 0.3, band: 'common' }, { id: 'urn_shard', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platelegs', ch: 0.048, band: 'scarce' }, { id: 'wyvernhide_pants', ch: 0.048, band: 'scarce' }, { id: 'sorcerer_pants', ch: 0.048, band: 'scarce' },
        { id: 'yew_staff', ch: 0.048, band: 'scarce' },
        { id: 'yew_wand', ch: 0.0033, band: 'rare' }, { id: 'yew_spellbook', ch: 0.0033, band: 'rare' }],
      hp: 188, atk: 31, baseAcc: 1.03, def: 22, xp: 1326, gp: [21, 63], formula: true },
    muster_knight: {
      name: 'Barrow Knight', icon: '⚔️', tier: 5, level: 66, cls: 'undead', family: 'Undead', speed: 3000,
      /* the bruiser: the company's mounted sergeants, buried armed in the round barrows of the Row with a sword set before each and
         their horses beside them. Still in the plate (one override, weapon: a spell goes through the visor, so weak to magic; a
         blade and an arrow glance off, the bestiary's words). The bodies, the warhammer, and the gauntlets nobody could get off. */
      weaponWeak: 'magic', weaponResist: ['sword', 'ranged'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'bone_chips', ch: 0.4, band: 'common' }, { id: 'sergeant_spur', ch: 0.08, band: 'uncommon' },
        { id: 'rune_platebody', ch: 0.048, band: 'scarce' }, { id: 'wyvernhide_body', ch: 0.048, band: 'scarce' }, { id: 'sorcerer_body', ch: 0.048, band: 'scarce' },
        { id: 'rune_warhammer', ch: 0.048, band: 'scarce' },
        { id: 'rune_gauntlets', ch: 0.0033, band: 'rare' }, { id: 'wyvernhide_gloves', ch: 0.0033, band: 'rare' }, { id: 'sorcerer_gloves', ch: 0.0033, band: 'rare' }],
      hp: 440, atk: 41, baseAcc: 0.9, def: 44, xp: 3089, gp: [49, 147], formula: true },
    captain_hask: {
      name: 'Captain Hask', icon: '👑', tier: 5, level: 75, cls: 'undead', family: 'Undead', speed: 2800, boss: true,
      /* THE BOSS: the Banded Company's captain, who sold the crossing to Lord Krell and was buried by Krell with the men he sold, in his cloak
         and with the price still on him. The class as written (no override): a hammer and fire both answer him. His belts and the
         bow are the Rares. His Trophy waits on its icon (the header).
         HIS TWO LINES (boss-phases.js, the header): at half his health he calls up his file (the pocket's `adds`), and under a
         quarter he hits 15% harder (measured, the header). No guard: his men fight beside him, they don't shield him. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'grave_dust', ch: 0.5, band: 'common' }, { id: 'hasks_coin', ch: 0.15, band: 'uncommon' },
        { id: 'rune_belt', ch: 0.0133, band: 'rare' }, { id: 'wyvernhide_belt', ch: 0.0133, band: 'rare' }, { id: 'sorcerer_belt', ch: 0.0133, band: 'rare' },
        { id: 'yew_bow', ch: 0.0133, band: 'rare' }],
      hp: 1556, atk: 50, baseAcc: 0.9, def: 52, xp: 11996, gp: [173, 520], formula: true,
      phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1150 } },
  },
  roster: {
    barrow_pikeman: 'swarm',   // the common majority
    cairn_wight: 'glass',      // quick (4000), fragile, lands often
    muster_knight: 'elite',    // the bruiser in plate
    captain_hask: 'boss',
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw). */
  items: {
    coffin_nail: { n: 'Coffin Nail', icon: '🔩', v: 114, raw: true, imbue: { kind: 'ward', tier: 2 } },
    urn_shard: { n: 'Urn Shard', icon: '🏺', v: 120, raw: true, imbue: { kind: 'mana_leech', tier: 2 } },
    sergeant_spur: { n: 'Sergeant\'s Spur', icon: '⚙️', v: 132, raw: true, imbue: { kind: 'keen', tier: 2 } },
    hasks_coin: { n: 'Hask\'s Coin', icon: '🪙', v: 150, raw: true, imbue: { kind: 'life_leech', tier: 2 } },
  },
  itemText: {
    coffin_nail: 'Barrow Pikemen drop these iron nails from their coffins',
    urn_shard: 'Cairn Wights drop these pieces of burial urns. The urns are older than the Banded Company',
    sergeant_spur: 'Barrow Knights drop the spurs off their boots',
    hasks_coin: 'Lord Krell paid Captain Hask in these coins to give up the ford. Hask was buried with all of them',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the March's store food and drink, and Chalked Fire Runes (the unburned dead
     take 15% more fire). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  /* THE XP FIT (balance-sheet.js GROUND_XP_FIT). The sheet asks two things of a party-built ground's Normal at the band middle (65): the
     four a head within 0.90-1.10 of the pace contract, and 1.15-1.25 of the median lone way. On the formula's rows the median lone way
     read 0.94-0.96 of the contract (quick grade, 1 seed x 1 h), so a four paid 1.15 of it sat at 1.10, on the edge. At 0.93 the lone
     way reads about 0.91 and the four about 1.07. */
  /* RE-FITTED (lane/d-packs-retune, 2026-11-12). The pace contract reads the LONE median on a party ground too (Coordinator 2026-11-11), the contract
     was re-pinned flatter (core-model.js LEVEL_PACE.contract 1378 x L^1.298: 311k an hour at 65) and a hero alone earns +15% (Tyler 2026-11-11). At
     0.93 the median lone way read 1.30 of the contract at the band middle (quick grade, the Ford's and the Slake's tier-4 gear on the ladder, 1 seed
     x 1 h). 0.93 x 1.00 / 1.30 = 0.72, the Warrens' own road (1 -> 0.76 the same day). A fit scales a four and a hero alone alike.
     On the full grade (the median of 8 lone ways) 0.72 read 0.86, so 0.84 (about 1.00). */
  xpFit: { k: 0.84, why: 'at 0.93 the median lone way read 1.30 of the pace contract at the band middle (65) under solo +15% and the re-pinned contract, which reads the lone median on a party ground too (quick grade); 0.72 read 0.86 on the full grade. At 0.84 it reads about 1.00' },
  /* THE HARDER TIERS (TIER_PULL_OVERRIDES' shape since one difficulty: ONE pull for every group). Dangerous brings the full box, 8, not
     the table's 5: on 5 a Melee and Healer pair two under the floor netted +2.9k gold an hour a head and five under +0.5k, where the
     weight-class ruling (11-06) asks them to lose gold. On 8 they lose 15.6k and 28.8k (quick grade, 1 seed x 1 h). So here the two
     harder tiers differ by their blows and their pay, not their pull. OPEN, ONE ROW OF THE GRADE: five under on Dangerous the sheet
     also asks that pair to die, and it never did in the hour, on a pull of 5, 7 or 8 (its tank's typical low 44%). The next step up
     in the monsters' own blows is Deadly's, where it died 8 times. The pair pays in gold here, not in deaths.
     THE HARDER TIERS ADD NO HP HERE (the table adds 10%). A tank and Healer pair holding Deadly at the floor earned 1.17 of its Normal
     at the table's dials, where the sheet asks 1.25 of whoever holds it: its kills are held by its damage, and these party-built
     bodies already carry 2.5 times a solo ground's HP. A kill never pays more than +25% for a tier (Tyler 11-05, hunt-tiers rows),
     so the answer is the HP, not the pay. */
  tierOverride: { dangerous: 8, dials: { dangerous: { hpPm: 1000 }, deadly: { hpPm: 1000 } },
    why: 'on the table pull of 5 a Melee and Healer pair two to five Levels under the floor still made gold on Dangerous, so it brings the full box. With the 10% more HP the table adds, a pair holding Deadly at the floor earned 17% over its Normal, under the 25% a tier owes whoever holds it, so the harder tiers add no HP here' },
  /* PARTY LEVEL XP (party-class-xp.js's row shape: a share of the kill by how many classes stand, not a difficulty row). With no row a
     party pays the even share of a whole kill, and on the quick grade a tank and Healer pair read 0.78-0.81 of the median lone way and
     the four-class four 0.85-0.86, where 10-25 asks a pair 1.05-1.15 and a four 1.15-1.25. The mixed cells are those readings scaled
     (a cell is a straight factor on the share): at 1360 the pair read 1.01-1.05 and at 1400 the four 1.11-1.13, so 1440 and 1485. The
     three's cells are set between them. The one-class cells are the Warrens' and hold here (the line below).
     THE FULL GRADE'S SECOND FOUR (2026-11-10, 2 seeds x 2 h a cell): a tank, a hammer, a bow and a mage is THREE classes (Melee twice),
     and at 1440 it read 1.15 / 1.13 / 1.13 of the median lone way at the floor, middle and top (1.10 at the middle without Hask's
     lines), where 10-25 asks 1.15-1.25; the four-class four read 1.22 / 1.21 / 1.19. So 1510 and 1520 (more classes still pay more). */
  /* ONE PACK ON NORMAL (Tyler 2026-11-11; lane/d-packs-retune, 2026-11-12): this ground never carried a party pull, so the cells barely move. Under
     solo +15% the four of four classes read 1.18 / 1.17 of the median lone way at the floor and middle (quick grade, the tier-4 gear on the ladder)
     and the tank and Healer pair 1.10 / 1.14: the four's cells go 1510 / 1520 -> 1540 / 1550 (about 1.20), the pair stays.
     THE FULL GRADE'S READ (8 lone ways, 6 seeds x 4 h; parties 2 x 2 h): the median of eight lone ways sits under the quick grade's four, so the contract
     read lower and every mixed cell higher than the quick grade said. At 1550 the four with a Healer read 1.31 / 1.39 / 1.34 at the floor, middle and top, the four with no Healer (three classes) 1.22 /
     1.28 / 1.24 at 1540, the pairs 1.19-1.35 at 1440, the threes 1.15-1.49 at 1470. Each cell scaled to its target: the four 1385 (about 1.17 / 1.24
     / 1.20) over the three-class four at 1380, the pair 1220 (about 1.01-1.14), the threes 1280 and 1255 (about 1.00-1.30). THE TWO FOURS ARE 8%
     APART at the same cell (the Healer keeps the tank up through the Knights), and the band is 8.7% wide, so the well-built four sits in it and
     the four with no Healer reads about 1.09 / 1.15 / 1.11, under at the floor and top. The sheet names a well-built four (10-25 §5). */
  partyClassXp: { 2: [990, 1220], 3: [990, 1255, 1280], 4: [970, 1185, 1380, 1385] },
  /* WHAT THE PARTY WINDOW SAYS (party-class-xp.js PARTY_VS_ALONE's shape): Level XP a head against the same heroes alone, whole fives,
     measured at the floor on the default pull (tests/party-class-xp-line.mjs --table --mixed, 3 seeds, 2026-11-10, with Hask's lines and
     the cells above). One class is the mean of its five one-class parties: pairs 0.88-0.94 (0.91), threes 0.80-0.89 (0.84), fours
     0.71-0.85 (0.77); no one-class party beats its heroes alone (the worst cell 0.943 as built and 0.936 at 8 each). Two of two is the
     mean of three mixes (1.32-1.37), three of three of two (1.36 and 1.27), four of four the one played (1.28). The cells between are the
     size's mix times the cell ratio. A tank and a Healer are the slowest heroes alone, so a mixed party reads more against them than
     against the median lone way (the cells above). */
  /* RE-MEASURED 2026-11-12 (lane/d-packs-retune; tests/party-class-xp-line.mjs --table --mixed, 3 seeds, the floor, the room as built, every pack
     under this one open on the ladder). One class is the mean of its five one-class parties (pairs 0.80-0.86, threes 0.73-0.81, fours 0.65-0.77), two of two the mean of three mixes, three of three of two,
     four of four the one played (pairs 1.02-1.06, threes 1.01-1.08, the four 1.07); the cells between are the size's mix times the cell ratio. Whole fives. */
  partyVsAlone: { 2: [-15, 5], 3: [-25, 0, 5], 4: [-30, -10, 5, 5] },
  /* THE PACK'S TEST FACTS. Hask holds his barrow (no spawn weight). dropRef: the four the ground is built for, at the floor in the
     harness's own-tier set (tests/hunt-core/drop-tables.mjs, as the Warrens'). valueToday is COMPUTED, not a pre-conversion pin: that
     four's measured coin a head (7,178 g/h) and commons (499) plus the gear-faucet's half of the coin (3,589), the most the hour's
     worn gear may sell for. Tier 5 has no sale rate yet, so gear-faucet and total-value stay red on this ground until one lands. */
  checks: { holders: [HASK], dropRef: { roles: ['tank', 'ranger', 'mage', 'healer'], full: true }, valueToday: 11266 },
  map,
});
