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
//     band    combat-level band; band[0] is the SERVER-ENFORCED floor
//             (hr_apply refuses `hunt_locked` below it), band[1] is advisory
//     spawns  positive integer weights; every monster must exist in
//             src/data/monsters.js (the generator refuses unknown ids)
//     family  the dominant monster family, for the picker's grouping
//     art     the monster id whose art represents the area
//     travelS seconds of walking from town (Hunt Sessions, HR-2026-10-14): the
//             session earns and spends nothing while walking. A multiple of
//             the 10 s world tick, 10..300 (tests/supplies-catalogue.mjs).
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
    band: [0, 10],
    spawns: [{ monster: 'rat', w: 5 }, { monster: 'slime', w: 3 }, { monster: 'hive_wasp', w: 2 }],
    family: 'Vermin', art: 'rat', travelS: 20, pull: 1, respawnMs: 60000,
  },
  {
    id: 'bramble_edge', name: 'Bramble Edge', theme: 'Where the farm fields give way to thorn and wild things.',
    band: [0, 15],
    spawns: [{ monster: 'small_wolf', w: 4 }, { monster: 'wild_boar', w: 3 }, { monster: 'mandrake', w: 3 }],
    family: 'Mammal', art: 'small_wolf', travelS: 30, pull: 3, respawnMs: 42000,
  },
  {
    id: 'goblin_warren', name: 'Goblin Warren', theme: 'Tunnels full of stolen pots and sharp little knives.',
    band: [0, 15],
    spawns: [{ monster: 'goblin', w: 6 }, { monster: 'kobold', w: 4 }],
    family: 'Humanoid', art: 'goblin', travelS: 30, pull: 5, respawnMs: 60000,
  },
  {
    id: 'ridge_camp', name: 'Ridge Camp', theme: 'A raiders’ camp on the high ridge, and the stags that graze past it.',
    band: [15, 99],
    spawns: [{ monster: 'hobgoblin', w: 4 }, { monster: 'gnoll', w: 4 }, { monster: 'stag', w: 2 }],
    family: 'Humanoid', art: 'hobgoblin', travelS: 60, pull: 5, respawnMs: 54000,
  },
]);

/** Null-prototype index by id: `HUNT_INDEX['constructor']` is undefined. */
export const HUNT_INDEX = Object.freeze(HUNTS.reduce((acc, h) => { acc[h.id] = h; return acc; },
  Object.create(null)));

/* A single-monster fight walks further the stronger the foe: 20 s for a
   tier-1 monster and 20 s more a tier. */
export const TRAINING_TRAVEL_S = Object.freeze({ 1: 20, 2: 40, 3: 60, 4: 80, 5: 100, 6: 120 });

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
    travelS: TRAINING_TRAVEL_S[m.tier] || TRAINING_TRAVEL_S[1],
    pull: 1, respawnMs: TRAINING_RESPAWN_MS,
  };
}
