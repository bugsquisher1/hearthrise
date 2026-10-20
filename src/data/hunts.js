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
//             session earns and spends nothing while walking. TRAVEL_S for every
//             hunt: 0, the hero is at the ground the moment it enters (the live
//             engine lane, 2026-10-20: no walk time). A multiple of the 10 s
//             world tick, 0..300 (tests/supplies-catalogue.mjs).
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

/** The walk from town to every hunt, in seconds: none (the hero arrives as it enters). One value,
    generated into hr_hunt_travel (tools/gen-hunt-sessions.mjs); 0..300 in whole 10 s ticks. */
export const TRAVEL_S = 0;

export const HUNTS = Object.freeze([
  {
    id: 'mill_cellar', name: 'Mill Cellar', theme: 'Damp sacks, gnawed grain and things that buzz in the dark.',
    band: [1, 8],
    spawns: [{ monster: 'rat', w: 3, rarity: 'common' }, { monster: 'slime', w: 1, rarity: 'uncommon' },
      { monster: 'hive_wasp', w: 1, rarity: 'rare' }],
    family: 'Vermin', art: 'rat', travelS: TRAVEL_S, pull: 1, respawnMs: 60000,
  },
  {
    id: 'bramble_edge', name: 'Bramble Edge', theme: 'Where the farm fields give way to thorn and wild things.',
    band: [0, 15],
    spawns: [{ monster: 'small_wolf', w: 4 }, { monster: 'wild_boar', w: 3 }, { monster: 'mandrake', w: 3 }],
    family: 'Mammal', art: 'small_wolf', travelS: TRAVEL_S, pull: 3, respawnMs: 42000,
  },
  {
    id: 'goblin_warren', name: 'Goblin Warren', theme: 'Tunnels full of stolen pots and sharp little knives.',
    band: [0, 15],
    spawns: [{ monster: 'goblin', w: 6 }, { monster: 'kobold', w: 4 }],
    family: 'Humanoid', art: 'goblin', travelS: TRAVEL_S, pull: 5, respawnMs: 60000,
  },
  {
    id: 'ridge_camp', name: 'Ridge Camp', theme: 'A raiders’ camp on the high ridge, and the stags that graze past it.',
    band: [15, 99],
    spawns: [{ monster: 'hobgoblin', w: 4 }, { monster: 'gnoll', w: 4 }, { monster: 'stag', w: 2 }],
    family: 'Humanoid', art: 'hobgoblin', travelS: TRAVEL_S, pull: 5, respawnMs: 54000,
  },
  /* THE FIRST PARTY GROUND (week plan item 17, 2026-10-18). The mill race runs
     under the town here; its rats are the ones that climb into the Mill Cellar.
     A walked ground: its rooms, packs and route are src/data/hunt-grounds.js
     `millrace_sewer`, and its map is src/data/world/maps/millrace_sewer.js. The
     weights below are the pockets' head-count (the Rat King, a boss, is never a
     weighted spawn; he holds the last room). Floor 4: a fresh character (combat 3)
     earns the door in the Mill Cellar first. */
  {
    id: 'millrace_sewer', name: 'Millrace Sewer', theme: 'The mill race runs under the town here. The rats answer to someone.',
    band: [8, 25],
    spawns: [{ monster: 'drain_rat', w: 6, rarity: 'common' }, { monster: 'culvert_bat', w: 4, rarity: 'uncommon' },
      { monster: 'sump_slime', w: 3, rarity: 'uncommon' }, { monster: 'kobold_tosher', w: 3, rarity: 'uncommon' },
      { monster: 'cistern_spider', w: 2, rarity: 'rare' }],
    family: 'Vermin', art: 'drain_rat', travelS: TRAVEL_S, pull: 4, respawnMs: 90000,
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
    family: 'Mammal', art: 'gray_wolf', travelS: TRAVEL_S, pull: 3, respawnMs: 60000,
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
    family: 'Humanoid', art: 'goblin_scavenger', travelS: TRAVEL_S, pull: 4, respawnMs: 90000,
  },
]);

/** The words a player reads for a spawn's rarity. */
export const RARITY_LABEL = Object.freeze({ common: 'Common', uncommon: 'Uncommon', rare: 'Rare' });

/** Null-prototype index by id: `HUNT_INDEX['constructor']` is undefined. */
export const HUNT_INDEX = Object.freeze(HUNTS.reduce((acc, h) => { acc[h.id] = h; return acc; },
  Object.create(null)));


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
    travelS: TRAVEL_S,
    pull: 1, respawnMs: TRAINING_RESPAWN_MS,
  };
}
