// src/data/grounds/krells_hold/pack.js — KRELL'S HOLD, Levels 85-110: the Barrow March's last ground, Lord Krell's castle (lane/b-krells-hold-pack,
// the designer's "2026-11-10 Krell's Hold" on the board; Tyler 2026-11-09: "I like krell", "maybe the last hunt in this area is like the guys
// name and the hunt is his castle"). Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new krells_hold --like wickstead --band
// 85,110` (the Pyre Field, the design's pick, is not on main), then every row rewritten and the map drawn new (map.js). The stat lines are the
// formula's (`node tools/pack.mjs propose krells_hold --write`): tier 6, floor 85, fit both.
//
// STAGED, AND IT STAYS STAGED UNTIL THE ENGINE CAN PLAY IT (the design's section 3, "Engine pieces that do not exist yet"). The Picket
// shoots from range (piece 2), the Binder mends the dead in his pull (piece 3) and the Warder's shield slam is a marked heavy hit (piece 1).
// None of those exists, so the grader plays all five as plain melee bodies. That is fine for a staged pack's numbers and wrong for a player:
// the design says the Picket and the Binder must not ship as plain melee bodies, because that is a reskin. Open it only with pieces 1-3.
//
// NAMING VOICE (the Barrow March's, with the Hold's words): the free company's soldier words (picket, muster, colors, roll), the castle's
// working words (levy, warder, castellan, ward, chain, gate), and the rite's (binder, cord, shroud). People get one short name (Hask, Krell).
// Never Ancient, Shadow, Dark, Eternal, Void or Forgotten. American spelling (armor, colors).
//
// THE STORY, each creature one piece of it. Lord Krell held the March before Havora hired the Banded Company to hold the ford, and he wanted
// the toll back. He bought Captain Hask, and his men killed the company at the Ford. His Binders burned the dead on the Pyre Field, and the rite
// tied them to the Hall Fire in his castle. He is old now and keeps that fire lit. The Levies are farmhands he pressed to hold his walls, the
// Pickets are Hask's own sentries who took Krell's pay too, the Warders are the company's officers he dug back out of the Muster Barrows and
// set at his doors, the Binders are the priests who said the rite, and the Castellan keeps the castle and its keys. Krell is not on the route.
// He sits in his hall behind a door a Hall Key opens (`hall` below), and the Castellan carries the key.
//
// THE LESSON IS THE KRELL FIGHT, ONE QUESTION A CREATURE. The Levy says Krell is a living man and an undead kit is wrong for him: the March's
// first living enemy, so poison works again (Human: weak to arrows, poison does 15% more). The Picket is his adds going for the back line. The
// Warder is his marked hit. The Binder is "kill the helpers first". The Castellan is the key. Weak-to at density 4: 13 heads to an arrow
// (7 Levies, 3 Pickets, 3 Binders), 7 to a hammer (5 Warders, 2 Castellans): the Ranger's ground, as the Slake is the sword's and the Pyre
// Field the hammer's. The Drill Yard is all living (a lone bow's room) and the Undercroft nearly all dead (a lone hammer's room).
// THE HEAD COUNT, against the design's 8 / 4 / 3 / 3 / 2. Five pockets of four can't give the Undercroft its ranks of dead, the Chapel a Warder
// for its Binders and the Stair its Warder out of only four Warders. So one Levy became a Warder: 7 / 5 / 3 / 3 / 2 (13 arrow, 7 hammer
// against the design's 14 and 6), and a Binder kneels among the Undercroft's dead.
//
// THE LOOT (src/data/loot-bands.js). Scarce, about hourly a piece per hero at the floor: the whole TIER-6 armor set in three weights, one slot a
// body (Levy boots, Picket helmets, Warder legs, Castellan bodies), and one tier-6 weapon on four bodies. Rare, each about every 10-20 h: the
// tier-6 gloves (Picket) and belts (Warder), and the Binders' wand and codex. Tier 6 is worn from 75, so every piece is wearable the hour it
// drops: this is the game's only source of tier-6 armor. Each body drops one imbuement item, one of each of the five kinds. Each has one
// product of its own: the Levy's tithe wheat, the Picket's bolt iron, the Warder's grave dust, the Binder's pyre coal, and the toll gold the
// Castellan keeps. The Hall Key is the Castellan's last row (batch 2).
// THE CHANCES ARE MEASURED, NOT GUESSED: each was set from the floor hour's kills on the real settle (tests/hunt-core/drop-tables.mjs). The
// numbers in the comments beside them are that read.
import { definePack, box } from '../shape.js?v=0.2.116';
import map from './map.js?v=0.2.116';

const LV = 'levy', PK = 'hasks_picket', WD = 'warder', BD = 'binder', CS = 'castellan';

export default definePack({
  id: 'krells_hold',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count at density 4 (the first four of each box): 7 Levies, 5 Warders, 3 Pickets, 3 Binders, 2 Castellans. */
  hunt: {
    name: 'Krell\'s Hold', theme: 'Lord Krell\'s castle. His men hold the walls, and the officers he dug out of the Barrows hold his cellar.',
    band: [85, 110],
    spawns: [{ monster: LV, w: 7, rarity: 'common' }, { monster: WD, w: 5, rarity: 'uncommon' },
      { monster: PK, w: 3, rarity: 'uncommon' }, { monster: BD, w: 3, rarity: 'uncommon' }, { monster: CS, w: 2, rarity: 'rare' }],
    family: 'Human', art: LV, travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE ROUTE: in at the gate, west through the yard, north into the chapel, east through the undercroft, up the keep stair, and out the
     sally port round the east wall to the gate. Krell's Hall (x41-56 y1-6) is behind the stair's north door and on no lap. */
  ground: {
    map: 'krells_hold',
    /* on the cart road below the gate, one tile a seat */
    start: [[29, 42], [28, 42], [30, 42], [29, 41]],
    pockets: [
      /* P0 the Cart Gate: the soft door. A hero under 85 pushing for tier-6 boots stands here. Levies on the gate and a Picket over it */
      box([22, 30, 36, 37], [29, 33], [LV, LV], [PK, LV, LV, PK, LV, LV]),
      /* P1 the Drill Yard: all living, the bow's room and the poison rune's. Levies at the pells, Pickets down off the wall walk */
      box([4, 14, 24, 28], [14, 21], [LV, PK], [LV, LV, PK, LV, LV, PK]),
      /* P2 the Chapel: where the rite was written. A Binder beside the dead he mends, so who dies first matters */
      box([4, 3, 18, 11], [11, 7], [BD, WD], [BD, LV, WD, BD, LV, WD]),
      /* P3 the Undercroft: the officers Krell dug out of the Barrows, standing in ranks, and a Binder kneeling among them. The hammer's room */
      box([24, 4, 38, 12], [31, 8], [WD, WD], [BD, WD, WD, BD, WD, WD]),
      /* P4 the Keep Stair: the hardest pull. The Castellan holds the stair to his lord's door, a Picket above him and a Warder at his side */
      box([42, 10, 54, 20], [48, 15], [CS, PK], [CS, WD, PK, WD, WD, PK]),
    ],
    route: [0, 1, 2, 3, 4],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08): no solo or party label, no gate. groupFit 'both' (the formula's rows are the same as
       for 'solo'); no pocket asks for a party size and there is no soloFrom. */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
    partyPull: [0, 3, 3, 4],
  },
  /* THE BODIES. All five are new drawings (the art brief, the board's section 7); none has art yet, so the pack stays staged for that too. */
  monsters: {
    levy: {
      name: 'Levy', icon: '🗡️', tier: 6, level: 86, cls: 'human', family: 'Human', speed: 3400,
      /* the swarm, the common majority: farmhands Krell pressed off the March's fields to hold his walls, in quilted jacks with a bill hook. Young
         and scared. Living, so the Human class with no override: weak to arrows, poison does 15% more. Their tithe grain, the press token they
         showed at the gate, the tier-6 boots and the Emberforged sword off the gate rack. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'wheat', ch: 0.3, band: 'common' }, { id: 'press_token', ch: 0.08, band: 'uncommon' },
        { id: 'ember_boots', ch: 0.02, band: 'scarce' }, { id: 'dragonhide_boots', ch: 0.02, band: 'scarce' }, { id: 'archmage_boots', ch: 0.02, band: 'scarce' },
        { id: 'ember_sword', ch: 0.02, band: 'scarce' }],
      hp: 114, atk: 78, baseAcc: 0.82, def: 36, xp: 1151, gp: [24, 72], formula: true },
    hasks_picket: {
      name: 'Hask\'s Picket', icon: '🏹', tier: 6, level: 88, cls: 'human', family: 'Human', speed: 3000,
      /* the glass: the sentries Captain Hask pulled off the line the night of the Ford. They took Krell's pay too, and now they stand his wall
         walk with a crossbow and the company's striped sleeve under his tabard. Human, no override. Their bolt iron, the whistle nobody answered,
         the tier-6 helmets and the Runewood Bow, and now and then the gloves off a dead officer. A crossbow at range is engine piece 2 (unbuilt). */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'iron_bar', ch: 0.3, band: 'common' }, { id: 'picket_whistle', ch: 0.08, band: 'uncommon' },
        { id: 'ember_helm', ch: 0.045, band: 'scarce' }, { id: 'dragonhide_helmet', ch: 0.045, band: 'scarce' }, { id: 'archmage_helmet', ch: 0.045, band: 'scarce' },
        { id: 'runewood_bow', ch: 0.045, band: 'scarce' },
        { id: 'ember_gauntlets', ch: 0.003, band: 'rare' }, { id: 'dragonhide_gloves', ch: 0.003, band: 'rare' }, { id: 'archmage_gloves', ch: 0.003, band: 'rare' }],
      hp: 109, atk: 103, baseAcc: 0.45, def: 38, xp: 1333, gp: [23, 69], formula: true },
    warder: {
      name: 'Warder', icon: '🛡️', tier: 6, level: 92, cls: 'undead', family: 'Undead', speed: 2400,
      /* the heavy, the slowest thing in the castle: one of the Banded Company's officers, buried with honors in the Muster Barrows, dug up and
         set at Krell's doors behind a door-sized shield. Undead, no override: a hammer breaks him, fire does 15% more, poison half. His grave dust
         for the Hearth, the barrow nail they pulled to get him out, the tier-6 legs and the Emberforged Warhammer, and now and then a belt. His
         shield slam, a marked heavy hit on the tiles in front of him, is engine piece 1 (unbuilt). */
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'grave_dust', ch: 0.5, band: 'common' }, { id: 'barrow_nail', ch: 0.08, band: 'uncommon' },
        { id: 'ember_platelegs', ch: 0.03, band: 'scarce' }, { id: 'dragonhide_pants', ch: 0.03, band: 'scarce' }, { id: 'archmage_pants', ch: 0.03, band: 'scarce' },
        { id: 'ember_warhammer', ch: 0.03, band: 'scarce' },
        { id: 'ember_belt', ch: 0.002, band: 'rare' }, { id: 'dragonhide_belt', ch: 0.002, band: 'rare' }, { id: 'archmage_belt', ch: 0.002, band: 'rare' }],
      hp: 182, atk: 78, baseAcc: 0.88, def: 58, xp: 2077, gp: [38, 115], formula: true },
    binder: {
      name: 'Binder', icon: '📿', tier: 6, level: 95, cls: 'human', family: 'Human', speed: 3000,
      /* the regular: one of Krell's priests, the men who said the rite over the Pyre Field and tied the dead to his fire. Hooded, ash-gray,
         a knotted cord at his belt. Living, Human, no override. The pyre coal on his hands, his cord, the Runewood Staff, and the Binders' own
         wand and codex. He mends the dead in his pull, so the Warders beside him take far longer to drop: engine piece 3 (unbuilt). */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'binders_cord', ch: 0.08, band: 'uncommon' },
        { id: 'runewood_staff', ch: 0.045, band: 'scarce' },
        { id: 'runewood_wand', ch: 0.003, band: 'rare' }, { id: 'runewood_codex', ch: 0.003, band: 'rare' }],
      hp: 157, atk: 100, baseAcc: 0.6, def: 45, xp: 1650, gp: [33, 99], formula: true },
    castellan: {
      name: 'Castellan', icon: '🗝️', tier: 6, level: 100, cls: 'human', family: 'Human', speed: 2800,
      /* the elite and the rare carrier: Krell's steward, in plate with a mace and a ring of keys. He keeps the castle, its stores and the toll.
         A man in plate, so a blade skids off him and a hammer gets through (one override, the weapon axis). The toll gold he keeps, a link of
         his key chain, and the tier-6 bodies. He is the first monster whose drop opens a fight: the Hall Key off his ring (the Key band,
         loot-bands.js, about one every two hours). */
      weaponWeak: 'hammer', weaponResist: ['sword'],
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'gold_bar', ch: 0.3, band: 'common' }, { id: 'castellans_chain', ch: 0.1, band: 'uncommon' },
        { id: 'ember_platebody', ch: 0.05, band: 'scarce' }, { id: 'dragonhide_body', ch: 0.05, band: 'scarce' }, { id: 'archmage_body', ch: 0.05, band: 'scarce' },
        { id: 'hall_key', ch: 0.04, band: 'key' }],
      hp: 263, atk: 105, baseAcc: 0.6, def: 72, xp: 3244, gp: [55, 166], formula: true },
  },
  roster: {
    levy: 'swarm',            // the common majority
    hasks_picket: 'glass',    // shoots the back line (piece 2), fragile, lands often
    warder: 'heavy',          // the shield: slow (2400), thick
    binder: 'regular',        // the middle weight, the mender (piece 3)
    castellan: 'elite',       // the bruiser and the rare carrier
  },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, its tier and book value from its dropper's Level, raw): one of each of the
     five kinds, kept for the imbuer like every ground's (catalogue-coherence.js VENDOR_TRASH until imbuing is built). */
  items: {
    press_token: { n: 'Press Token', icon: '🪙', v: 172, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    picket_whistle: { n: 'Picket Whistle', icon: '📯', v: 176, raw: true, imbue: { kind: 'keen', tier: 3 } },
    barrow_nail: { n: 'Barrow Nail', icon: '📌', v: 184, raw: true, imbue: { kind: 'ward', tier: 3 } },
    binders_cord: { n: 'Binder\'s Cord', icon: '🧶', v: 190, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
    castellans_chain: { n: 'Castellan\'s Chain', icon: '⛓️', v: 200, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    /* THE HALL KEY (the designer's 11-10 ruling 6: it TRADES). `opens` the hall of this ground (`hall` below; drop-tables loot-structure holds
       the Key band to it). One key opens the hall for the whole party and is the leader's; the server takes it on entry and journals it; it
       moves only through Storage and trade (the ruling's rails, for the keyed-room lane). Book value 800: the shop pays that, and the market's
       ceiling is 100x book, so a player can ask up to 80,000 for one. PROPOSED, unmeasured. */
    hall_key: { n: 'Hall Key', icon: '🗝️', v: 800, opens: 'krells_hold' },
  },
  itemText: {
    press_token: 'The wooden token Krell\'s men gave a farmhand when they pressed him into the levy. He had to show it at the gate',
    picket_whistle: 'A sentry\'s tin whistle on its company cord. Hask\'s pickets were supposed to blow it the night of the Ford',
    barrow_nail: 'A coffin nail from the Muster Barrows, pulled when Krell\'s men dug the company\'s officers back up',
    binders_cord: 'The knotted cord a Binder ties round a shroud while he says the rite. One knot for every name on the Roll',
    castellans_chain: 'A link off the chain the Castellan hangs his keys on. He keeps every key in the Hold, the toll box\'s too',
    hall_key: 'Opens Krell\'s Hall for you and your party, once. It\'s used up whether you win or lose. The Castellan kept it on his ring',
  },
  /* THE BAG (supplies.js BAG_GUIDE_BY_HUNT's shape): the Pyre Field's store food, and Chalked Poison Runes in place of its ice. These are
     living men (poison does 15% more), and the dead in the cellar shrug poison off, so a caster brings a second family for the Undercroft.
     Lobster, not the tier-6 Shark: the store sells Salted Shark at 693 for 396 HP (1.75 g a point) and Salted Lobster at 180 for 216 (0.83),
     and on the quick grade a lone floor tank ate 57 Sharks an hour (39.5k g against 13.2k coin). */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_poison_rune', qty: 650 } } },
  /* KRELL'S HALL: one room, one fight, opened with a Hall Key (the design's section 3). Written in the called-room machinery's own shapes, so the
     engine that plays the Rat King's and the Chief's rooms plays this one: `hunt` is a hunts.js CALLED_HUNTS row less its id and `called`,
     `ground` a hunt-grounds.js CALLED_GROUNDS row less its id, hunt, map and call (the boss in the pocket's spawns, his adds in `adds`), and
     `monsters` the room's own called rows (an id ending _called, `called: true`, boss or add, `phases` the boss's two lines,
     core/hunt/boss-phases.js). shape.js checks the shape and tools/pack.mjs lintHall the rest.
     NOT FOLDED INTO THE CALLED ROOMS. Today a called room is behind a gold fee and pays nothing (boss-calls.js; tests/boss-call.mjs holds it),
     and its boss is a copy of a ground's own boss (gen-hunt-sessions calledRows `of`). Krell's door is a key, his room pays (the prize below),
     and he copies no one. Those are the design's engine piece 5, a new room kind on the pre-EA Security list with the key; until it lands
     this hall is data the fold will read, and nothing serves it. Krell's own kit (the coal cone, the Hall Fire's flare, the Roll) is pieces
     1, 6 and 7; on today's machinery he is a boss who calls three adds at half his health, is shielded while they stand and rages at a
     quarter. */
  hall: {
    key: 'hall_key',
    words: { boss: 'Lord Krell', Boss: 'Lord Krell' },
    hunt: { name: 'Krell\'s Hall', theme: 'The Hall Fire burns the length of the north wall. Krell sits in front of it with the Muster Roll in his lap.',
      band: [85, 110], family: 'Human', art: 'lord_krell_called', travelS: 0, pull: 1, respawnMs: 600000 },
    ground: {
      /* in through the door off the Keep Stair, Krell in his high seat across the hall, the fire behind him */
      start: [[48, 8], [47, 8], [49, 8], [48, 9]],
      pockets: [{ room: [41, 1, 56, 6], spawns: [{ monster: 'lord_krell_called', x: 48, y: 2 }],
        /* he reads three names off the Roll: Captain Hask and two of the officers, standing up out of the floor */
        adds: [{ monster: 'hall_hask_called', x: 44, y: 3 }, { monster: 'hall_warder_called', x: 52, y: 3 }, { monster: 'hall_warder_called', x: 48, y: 5 }] }],
      route: [0], respawnMs: 600000, pullDist: 1.5, groupFit: 'party',
    },
    monsters: {
      /* LORD KRELL, Level 110, Human: an old man in Dawnsteel plate. The fire at his back for years: fire does 25% less, poison 15% more (one
         override, the element axis). The formula's boss row for the party fit (2,256 HP, atk 94, tier 6), to be fitted to the ship bar (Tyler
         11-05: the same gear wins about 30% with a bad bar and 85% with a good one, 40 tries a row). His lines are the Chief's (adds at half,
         shielded to 80% while they stand, enraged at a quarter); the enrage x1.4. PROPOSED, unmeasured. */
      lord_krell_called: { name: 'Lord Krell', icon: '👑', tier: 6, level: 110, cls: 'human', family: 'Human', formation: true, called: true, boss: true,
        elements: { ember: 25, poison: -15 },
        hp: 2256, atk: 94, baseAcc: 0.72, def: 80, xp: 0, gp: [0, 0], speed: 2800, drops: [], phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1400, guardPm: 800 } },
      /* CAPTAIN HASK, read off the Roll: the man who sold the crossing. Everyone who gets here killed him in the Muster Barrows; now the man who
         bought him calls him by name and he has to come. The formula's elite at 100. A plain add today (his own kit is piece 6). Not the Barrows'
         own Hask row (lane/b-muster-barrows): this is the hall's, so the two never share an id. */
      hall_hask_called: { name: 'Captain Hask', icon: '⚔️', tier: 6, level: 100, cls: 'undead', family: 'Undead', formation: true, called: true, add: true,
        hp: 263, atk: 105, baseAcc: 0.6, def: 72, xp: 0, gp: [0, 0], speed: 3000, drops: [] },
      /* Two of the company's officers, standing up out of the hall floor: the Hold's Warder row (formula heavy at 92) */
      hall_warder_called: { name: 'Warder', icon: '🛡️', tier: 6, level: 92, cls: 'undead', family: 'Undead', formation: true, called: true, add: true,
        hp: 182, atk: 78, baseAcc: 0.88, def: 58, xp: 0, gp: [0, 0], speed: 2400, drops: [] },
    },
    /* WHAT THE KEYED ROOM PAYS, a kill (the design's section 4; piece 5 reads it, nothing does today). Each rare about 1 kill in 10: the first
       tier 7 in the game (worn from 88), the four weapons and the body and helm in three weights. They break the 5% row ceiling on purpose,
       and the loot-band guard must learn a per-kill boss before these rows reach a monster. Two prizes wait on their own rows: the Roll Page
       (a named Hearth fuel: a NAMED_FUELS pack field, piece 10) and Krell's Toll Box (his Trophy, 100-150 h: a trophy row and its icon). */
    prize: [
      { id: 'coin', gp: [251, 753], band: 'common' },
      { id: 'dawn_sword', ch: 0.1, band: 'rare' }, { id: 'dawn_warhammer', ch: 0.1, band: 'rare' },
      { id: 'duskwood_bow', ch: 0.1, band: 'rare' }, { id: 'duskwood_staff', ch: 0.1, band: 'rare' },
      { id: 'dawn_platebody', ch: 0.1, band: 'rare' }, { id: 'slakehide_body', ch: 0.1, band: 'rare' }, { id: 'shroudweave_body', ch: 0.1, band: 'rare' },
      { id: 'dawn_helm', ch: 0.1, band: 'rare' }, { id: 'slakehide_helmet', ch: 0.1, band: 'rare' }, { id: 'shroudweave_helmet', ch: 0.1, band: 'rare' },
    ],
  },
  map,
});
