// ════════════════════════════════════════════════════════════════════════
// src/data/hunts.js — HUNTS: a themed place with a weighted spawn table.
//
// A hunt is where you fight, not who: the server picks each foe from `spawns`
// by weight (the start-hunt intent, active_kind 'hunt', lane c-hunts-c1).
// The client only DRAWS these rows; it never rolls a spawn.
//
//   id      stable key (the intent's active_id)
//   name    player-facing place name
//   theme   one short line of flavour for the card
//   band    [min, max] Combat level the hunt is tuned for; below `min` it is shut
//   spawns  [{monster, w}] — monster ids in src/data/monsters.js, integer weights
//   family  the monster class whose painted backdrop the card wears
//   art     the backdrop key (assets/icons-bundle/backgrounds/bg_combat_<art>.jpg)
//
// Adding a hunt is a row here, never code. PURE DATA.
// ════════════════════════════════════════════════════════════════════════

export const HUNTS = Object.freeze([
  Object.freeze({
    id: 'mill_cellar', name: 'Mill Cellar', theme: 'Damp sacks, gnawed grain, something buzzing in the rafters.',
    band: Object.freeze([0, 10]), family: 'vermin', art: 'vermin',
    spawns: Object.freeze([{ monster: 'rat', w: 5 }, { monster: 'slime', w: 3 }, { monster: 'hive_wasp', w: 2 }]),
  }),
  Object.freeze({
    id: 'bramble_edge', name: 'Bramble Edge', theme: 'Where the farm hedges give way to the wild wood.',
    band: Object.freeze([0, 15]), family: 'mammal', art: 'mammal',
    spawns: Object.freeze([{ monster: 'small_wolf', w: 4 }, { monster: 'wild_boar', w: 3 }, { monster: 'mandrake', w: 3 }]),
  }),
  Object.freeze({
    id: 'goblin_warren', name: 'Goblin Warren', theme: 'Tunnels under the old quarry, loud with goblin squabbling.',
    band: Object.freeze([0, 15]), family: 'humanoid', art: 'humanoid',
    spawns: Object.freeze([{ monster: 'goblin', w: 6 }, { monster: 'kobold', w: 4 }]),
  }),
  Object.freeze({
    id: 'ridge_camp', name: 'Ridge Camp', theme: 'A raider camp on the high ridge, with stags grazing below.',
    band: Object.freeze([15, 30]), family: 'humanoid', art: 'humanoid',
    spawns: Object.freeze([{ monster: 'hobgoblin', w: 4 }, { monster: 'gnoll', w: 3 }, { monster: 'stag', w: 3 }]),
  }),
]);
