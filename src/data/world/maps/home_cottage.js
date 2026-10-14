// src/data/world/maps/home_cottage.js — your house: the cottage template and its yard.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
export default Object.freeze({
  id: 'home_cottage',
  name: 'Your Cottage',
  kind: 'home',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  legend: Object.freeze({ '.': 'grass', ',': 'path_dirt' }),
  rows: Object.freeze([
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......,........',
    '.......,........',
    '.......,,,,,,,,,',
    '................',
  ]),
  objects: Object.freeze([
    { id: 'bed', x: 5, y: 3 }, { id: 'hearth', x: 9, y: 3 },
    { id: 'table', x: 7, y: 4 }, { id: 'chair', x: 8, y: 4 },
    { id: 'chest', x: 10, y: 5 }, { id: 'rug', x: 7, y: 6 },
    { id: 'pine', x: 1, y: 1 }, { id: 'pine', x: 14, y: 1 }, { id: 'pine', x: 1, y: 9 }, { id: 'pine', x: 10, y: 11 },
    { id: 'bush', x: 3, y: 8 }, { id: 'bush', x: 12, y: 8 },
  ]),
  buildings: Object.freeze([
    { id: 'cottage', rect: [4, 2, 8, 6], wall: 'timber', floor: 'floor_plank', doors: [[7, 7]], roof: { rect: [4, 2, 8, 6], kind: 'thatch' } },
  ]),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 15, y: 10, to: 'town_common' }]),
  start: Object.freeze([7, 5]),
  maskHash: 'a829f008',
});
