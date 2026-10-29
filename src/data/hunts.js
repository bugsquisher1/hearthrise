// ════════════════════════════════════════════════════════════════════════
// src/data/hunts.js — HUNTS AS NAMED AREAS (lane C1, game designer spec)
//
// A hunt is a place with a weighted monster mix. It is the ONE source: the
// engine reads it (src/core/hunt-spawn.js), the edge imports it literally, and
// Postgres gets `hr_hunts` / `hr_hunt_spawns` GENERATED from it by
// `node tools/gen-hunts.mjs` (`--check` fails the build on drift).
//
// ROW SHAPE (the client lane builds the picker from exactly this):
//   { id, name, theme, band: [min, max], spawns: [{ monster, w }], family, art }
//     id      [a-z0-9_]; NEVER a monster id (the server pointer is
//             active_kind='combat', active_id=<hunt id or monster id>)
//     band    Level band (CORE_NUMBERS Q9); band[0] is the floor: under it the hunt
//             warns, and refuses at SESSION_LIMITS.belowRangeRefuse Levels under;
//             band[1] is advisory
//     spawns  positive integer weights; every monster must exist in
//             src/data/monsters.js (the generator refuses unknown ids).
//             UNEVEN ON PURPOSE (Tyler 10-18, the Huntera model): a common majority,
//             a couple of uncommon creatures, one or two rare ones, so the bestiary of
//             a whole hunt takes longer than its commons. On a walked ground the weight
//             IS the head-count of its packs (at density 4 where it has the slider),
//             tests/hunt-core/forest-cave.mjs. A boss holds its room and is no weight.
//     rarity  'common' | 'uncommon' | 'rare' per spawn: the label the hunt card and
//             the bestiary show (RARITY_LABEL), never above a commoner spawn's weight
//     family  the dominant monster family, for the picker's grouping
//     art     the monster id whose art represents the area
//     travelS seconds of walking from town (Hunt Sessions, HR-2026-10-14): the
//             session earns and spends nothing while walking. A multiple of
//             the 10 s world tick, 0..300. EVERY ONE IS 0 (Tyler 2026-10-19:
//             "walk time needs to be there when we have destinations to walk
//             to through the town; until then no time needed"): the fight
//             starts the moment the hunt is entered (tests/supplies-catalogue.mjs H1).
//     staged  (optional) true = BUILT BUT NOT OPEN (§3.5: half-built stays hidden): its data,
//             ground, map grid and drop tables are done and fitted, its style-1 art is not
//             (the painted ground, the creatures' walks). The Hunts window never lists it
//             (src/shell/hunt-list.js), its map is STAGED_MAPS (no client draws it), and
//             gen-hunts / gen-hunt-sessions leave it out of the server catalogue, so
//             hr_hunt_enter refuses it. Opening it = art lands + this flag goes
//             (tests/hunt-core/forest-cave.mjs staged-until-art holds the pairing).
//     pull    how many foes the ground shows at once (its MOB density, 1..8)
//     respawnMs  the ground's SPAWN LIMIT: a pull is back this long after it
//             STARTED, whatever the hero does (Security design review
//             2026-10-14 item 1: the kill cap is a stateful cycle, never a
//             per-settle rate). Sized as pull x the reference hero's kill time
//             x 1.1, so a reference hero barely waits and a strong one is
//             capped by the ground. A smaller effective pull respawns sooner
//             in proportion (rule-subjects.js PULL_CAP). Generated into
//             hr_hunt_travel with the walk (tools/gen-hunt-sessions.mjs).
//             MILL CELLAR IS SPARSE ON PURPOSE (gather review finding 5): every
//             tier-1 foe lands a 1-point blow on half its swings (maxHit =
//             floor(atk x 0.45) = 1), so a level-1 hero loses ~12 HP a minute it
//             FIGHTS whichever foe it faces, and the kit's 20 Cooked Shrimp feed
//             about 12 minutes of fighting. The spawn mix cannot change that; the
//             time between foes can. At 60 s a fresh kit hero hunts ~35 minutes
//             on the kit with no fall (tests/hunt-sessions-settle.mjs FRESH),
//             and the ground is the review's "cheapest, best at gathering" row.
//
// TRAINING: a single-monster fight is the one-spawn hunt `trainingHunt(id)`
// below — same shape, generated, never stored. Its pointer is the monster id
// itself, which is why every fight that existed before this file prices
// byte-identically (a one-spawn pick draws nothing from the RNG).
// ════════════════════════════════════════════════════════════════════════

export const HUNTS = Object.freeze([
  {
    id: 'mill_cellar', name: 'Mill Cellar', theme: 'Damp sacks, gnawed grain and things that buzz in the dark.',
    band: [1, 8],
    spawns: [{ monster: 'rat', w: 3, rarity: 'common' }, { monster: 'slime', w: 1, rarity: 'uncommon' },
      { monster: 'hive_wasp', w: 1, rarity: 'rare' }],
    family: 'Vermin', art: 'rat', travelS: 0, pull: 1, respawnMs: 60000,
  },
  {
    id: 'bramble_edge', name: 'Bramble Edge', theme: 'Where the farm fields give way to thorn and wild things.',
    band: [0, 15],
    spawns: [{ monster: 'small_wolf', w: 4 }, { monster: 'wild_boar', w: 3 }, { monster: 'mandrake', w: 3 }],
    family: 'Mammal', art: 'small_wolf', travelS: 0, pull: 3, respawnMs: 42000,
  },
  {
    id: 'goblin_warren', name: 'Goblin Warren', theme: 'Tunnels full of stolen pots and sharp little knives.',
    band: [0, 15],
    spawns: [{ monster: 'goblin', w: 6 }, { monster: 'kobold', w: 4 }],
    family: 'Humanoid', art: 'goblin', travelS: 0, pull: 5, respawnMs: 60000,
  },
  {
    id: 'ridge_camp', name: 'Ridge Camp', theme: 'A raiders’ camp on the high ridge, and the stags that graze past it.',
    band: [15, 99],
    spawns: [{ monster: 'hobgoblin', w: 4 }, { monster: 'gnoll', w: 4 }, { monster: 'stag', w: 2 }],
    family: 'Humanoid', art: 'hobgoblin', travelS: 0, pull: 5, respawnMs: 54000,
  },
  /* THE FIRST PARTY GROUND (week plan item 17, 2026-10-18). The mill race runs
     under the town here; its rats are the ones that climb into the Mill Cellar.
     A walked ground: its rooms, packs and route are src/data/hunt-grounds.js
     `millrace_sewer`, and its map is src/data/world/maps/millrace_sewer.js. The
     weights below are the pockets' head-count (the Rat King, a boss, is never a
     weighted spawn; he holds the last room). Floor 4: a fresh character (combat 3)
     earns the door in the Mill Cellar first. */
  {
    id: 'millrace_sewer', name: 'The Sewer', theme: 'The mill race runs under the town here. The rats answer to someone.',
    band: [8, 25],
    spawns: [{ monster: 'drain_rat', w: 6, rarity: 'common' }, { monster: 'culvert_bat', w: 4, rarity: 'uncommon' },
      { monster: 'sump_slime', w: 3, rarity: 'uncommon' }, { monster: 'kobold_tosher', w: 3, rarity: 'uncommon' },
      { monster: 'cistern_spider', w: 2, rarity: 'rare' }],
    family: 'Vermin', art: 'drain_rat', travelS: 0, pull: 4, respawnMs: 90000,
  },
  /* THE WOOD GROUND (Tyler 10-18; workbook H-001): a ring of clearings round the
     Meadowbrook, crossed once by a log bridge and once at the ford. Solo first (a
     friend may come along). Floor 5, not the workbook's 1: a walked ground loops through
     every pocket, so its floor is set by the den, and a fresh kit hero fell 3 times in its
     first minutes (tests/hunt-core/forest-cave.mjs --play); the Mill Cellar teaches 1-5. Walked: src/data/hunt-grounds.js `meadowbrook_thicket`.
     Weights are the pockets' head-count at density 1; Old Grayjaw holds the den. */
  {
    id: 'meadowbrook_thicket', name: 'Meadowbrook Thicket', theme: 'Gray wolves den in the thicket along the brook.',
    band: [5, 15],
    spawns: [{ monster: 'gray_wolf', w: 10, rarity: 'common' }, { monster: 'gray_whelp', w: 8, rarity: 'common' },
      { monster: 'briarcoat_wolf', w: 4, rarity: 'uncommon' }, { monster: 'dire_gray', w: 1, rarity: 'rare' }],
    family: 'Mammal', art: 'gray_wolf', travelS: 0, pull: 3, respawnMs: 60000,
  },
  /* THE ORE GROUND (Tyler 10-18; workbook H-005): the goblins' copper diggings,
     down over the Drop on a plank bridge and back up the ore-cart ramp. A party
     ground. Walked: src/data/hunt-grounds.js `coppercap_warrens`. Weights are the
     pockets' head-count at density 1; Chief Coppercap holds the last hall. */
  {
    id: 'coppercap_warrens', name: 'Coppercap Warrens', theme: 'Goblins dig copper here, and the pots on their heads are stolen.',
    band: [32, 50],
    spawns: [{ monster: 'goblin_scavenger', w: 10, rarity: 'common' }, { monster: 'goblin_digger', w: 7, rarity: 'uncommon' },
      { monster: 'goblin_skulker', w: 5, rarity: 'uncommon' }, { monster: 'hobgoblin_foreman', w: 1, rarity: 'rare' }],
    family: 'Humanoid', art: 'goblin_scavenger', travelS: 0, pull: 4, respawnMs: 90000,
  },
  /* THE SPRING GROUND (lane c-ground-16-31, designer 2026-10-21; Tyler's workbook H-003 place, levels 16-31):
     upstream of the Thicket, where the Meadowbrook rises from springs under the Warrens' copper hill. Solo
     first (up to three more may come). Between the Thicket's top (15) and the Warrens' floor (32), the band
     no ground served. Walked: src/data/hunt-grounds.js `mosslight_glade`. Weights are the pockets'
     head-count at density 4; Rook the Poacher holds the ruined spring-house. OPEN since its style-1 art
     landed (lane b-mosslight-art, 2026-10-22: the painted ground and the five creatures). */
  {
    id: 'mosslight_glade', name: 'Mosslight Glade', theme: 'The Meadowbrook rises here, and the copper water makes the moss glow.',
    band: [16, 31],
    spawns: [{ monster: 'carrion_crow', w: 10, rarity: 'common' }, { monster: 'walking_vine', w: 5, rarity: 'uncommon' },
      { monster: 'glade_poacher', w: 4, rarity: 'uncommon' }, { monster: 'brook_bear', w: 2, rarity: 'uncommon' }, { monster: 'goblin_sluicer', w: 2, rarity: 'rare' }],
    family: 'Vermin', art: 'carrion_crow', travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE FARM GROUND (lane b-greenhaven-6, designer 2026-10-28; Greenhaven's sixth, Tyler 10-15): a burned farmstead on
     the Thicket road, where the Meadowbrook leaves the wood. Solo first (up to three more may come). The second solo
     ground for 8-18, where the Thicket was the only one (the 10-28 new-player walk: "one solo ground L6-15"), and the
     first door to tier-2 gloves, belts and jewellery. Walked: src/data/hunt-grounds.js `wickstead`. Weights are the
     pockets' head-count at density 4; the Turncoats, the rare spawn, carry the jewellery. STAGED until its painted
     ground lands (its creatures reuse shipped units: src/data/world/maps/wickstead.js). */
  {
    id: 'wickstead', name: 'Wickstead', theme: 'A burned farm on the Thicket road. Rats in the granary, turncoats in the house.',
    band: [8, 18],
    spawns: [{ monster: 'granary_rat', w: 13, rarity: 'common' }, { monster: 'barn_spider', w: 4, rarity: 'uncommon' },
      { monster: 'barn_wasp', w: 3, rarity: 'uncommon' }, { monster: 'orchard_boar', w: 2, rarity: 'uncommon' }, { monster: 'turncoat', w: 2, rarity: 'rare' }],
    family: 'Vermin', art: 'granary_rat', travelS: 0, pull: 4, respawnMs: 60000,
  },
  /* THE BARROW MARCH (designer 2026-10-28, docs/planning/PRIORITY_BOARD.md Decisions; the region after Greenhaven).
     NAMING VOICE: a free company's soldier words (banded, pike, muster, colours, ford, sergeant), the chantry's church
     words (prior, keener, bell) and the March's place words (barrow, ford, pyre); people get one short name (Hask, Ebbe).
     Never Ancient, Shadow, Dark, Eternal, Forgotten, nor "Lich" or "Reaper" as a name. The story: Havora hired the
     Banded Company to hold the March; its captain Hask sold the ford and rode off; the company died here and nobody burned
     them, and only the Hearth's fire lays the dead to rest (Wickstead's Turncoats are its last deserters).
     HASK'S FORD (lane b-hasks-ford, 2026-10-29; art lane b-hasks-ford-art): the region's first ground, solo first, up the
     road from Wickstead. Walked: src/data/hunt-grounds.js `hasks_ford`. Weights are the pockets' head-count at density
     4; the Bannerman, the rare spawn, holds the Toll Stone and the Muster Line and carries the Company Colors. */
  {
    id: 'hasks_ford', name: 'Hask\'s Ford', theme: 'The Banded Company died holding this ford, and nobody burned them.',
    band: [45, 60],
    spawns: [{ monster: 'banded_pikeman', w: 12, rarity: 'common' }, { monster: 'fordsunk', w: 6, rarity: 'uncommon' },
      { monster: 'wight', w: 4, rarity: 'uncommon' }, { monster: 'bannerman', w: 2, rarity: 'rare' }],
    family: 'Undead', art: 'banded_pikeman', travelS: 0, pull: 4, respawnMs: 60000,
  },
]);

/** The hunts a player can see and enter: every row not `staged`. */
export const OPEN_HUNTS = Object.freeze(HUNTS.filter((h) => h.staged !== true));

/** The words a player reads for a spawn's rarity. */
export const RARITY_LABEL = Object.freeze({ common: 'Common', uncommon: 'Uncommon', rare: 'Rare' });

/** Null-prototype index by id: `HUNT_INDEX['constructor']` is undefined. */
export const HUNT_INDEX = Object.freeze(HUNTS.reduce((acc, h) => { acc[h.id] = h; return acc; },
  Object.create(null)));

/* A single-monster fight's walk, by the foe's tier: 0 for every tier until the
   town has destinations to walk through (Tyler 2026-10-19; see travelS above). */
export const TRAINING_TRAVEL_S = Object.freeze({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });

/* A single foe is back this long after it was engaged: one foe at a time, the
   same spawn limit for every tier (a training fight is a kill-time cap, not a
   farm). */
export const TRAINING_RESPAWN_MS = 10000;

/** The one-spawn hunt a single-monster fight is. Same shape as a HUNTS row. */
export function trainingHunt(monsterId, monster) {
  const m = monster || {};
  return {
    id: monsterId, name: m.name || monsterId, theme: 'Training',
    band: [0, 99], spawns: [{ monster: monsterId, w: 1 }], family: m.family || null, art: monsterId,
    travelS: TRAINING_TRAVEL_S[m.tier] ?? TRAINING_TRAVEL_S[1],
    pull: 1, respawnMs: TRAINING_RESPAWN_MS,
  };
}
