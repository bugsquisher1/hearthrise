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
    family: 'Vermin', art: 'rat',
  },
  {
    id: 'bramble_edge', name: 'Bramble Edge', theme: 'Where the farm fields give way to thorn and wild things.',
    band: [0, 15],
    spawns: [{ monster: 'small_wolf', w: 4 }, { monster: 'wild_boar', w: 3 }, { monster: 'mandrake', w: 3 }],
    family: 'Mammal', art: 'small_wolf',
  },
  {
    id: 'goblin_warren', name: 'Goblin Warren', theme: 'Tunnels full of stolen pots and sharp little knives.',
    band: [0, 15],
    spawns: [{ monster: 'goblin', w: 6 }, { monster: 'kobold', w: 4 }],
    family: 'Humanoid', art: 'goblin',
  },
  {
    id: 'ridge_camp', name: 'Ridge Camp', theme: 'A raiders’ camp on the high ridge, and the stags that graze past it.',
    band: [15, 99],
    spawns: [{ monster: 'hobgoblin', w: 4 }, { monster: 'gnoll', w: 4 }, { monster: 'stag', w: 2 }],
    family: 'Humanoid', art: 'hobgoblin',
  },
]);

/** Null-prototype index by id: `HUNT_INDEX['constructor']` is undefined. */
export const HUNT_INDEX = Object.freeze(HUNTS.reduce((acc, h) => { acc[h.id] = h; return acc; },
  Object.create(null)));

/** The one-spawn hunt a single-monster fight is. Same shape as a HUNTS row. */
export function trainingHunt(monsterId, monster) {
  const m = monster || {};
  return {
    id: monsterId, name: m.name || monsterId, theme: 'Training',
    band: [0, 99], spawns: [{ monster: monsterId, w: 1 }], family: m.family || null, art: monsterId,
  };
}
