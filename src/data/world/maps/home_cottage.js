// src/data/world/maps/home_cottage.js — your house: the cottage template on its lane.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
// Only what every cottage has is placed here; what your rooms add (and the
// signposts for rooms not built yet) comes from src/data/world/house-layouts.js.
export default Object.freeze({
  id: 'home_cottage',
  name: 'Your Cottage',
  kind: 'home',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'indoor',
  ground: 'town_ground',
  legend: Object.freeze({ '.': 'grass', ':': 'cobble' }),
  rows: Object.freeze([
    '..............::.......',
    '..............::.......',
    '..............::.......',
    '..............::.......',
    '..............::.......',
    '..............::.......',
    '..............::.......',
    '..............:::::::::',
    '..............:::::::::',
    '..............:::::::::',
    '..............:::::::::',
    ':::::::::::::::::::::::',
    ':::::::::::::::::::::::',
    ':::::::::::::::::::::::',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    { id: 'bed', x: 3, y: 2 }, { id: 'chest_iron', x: 3, y: 4 }, { id: 'wardrobe', x: 12, y: 2 },
    { id: 'rug', x: 7, y: 5 }, { id: 'table', x: 8, y: 7 }, { id: 'chair_side', x: 7, y: 7 },
    { id: 'hedge', x: 14, y: 6 }, { id: 'bush', x: 15, y: 6 }, { id: 'lamppost', x: 14, y: 9 }, { id: 'oak', x: 20, y: 10 },
    { id: 'pine', x: 0, y: 6 }, { id: 'bush', x: 1, y: 13 }, { id: 'hedge', x: 0, y: 11 },
    { id: 'pine', x: 0, y: 1 }, { id: 'young_oak', x: 9, y: 12 }, { id: 'pine', x: 22, y: 2 }, { id: 'pine', x: 12, y: 0 },
  ]),
  buildings: Object.freeze([
    { id: 'cottage', rect: [2, 1, 12, 10], wall: 'plank', floor: 'plank_floor', doors: [[8, 10]], windows: [], chimney: null, roof: { rect: [2, 1, 12, 10], kind: 'roof_wood' } },
    { id: 'neighbour', rect: [16, 1, 5, 5], wall: 'timber', floor: 'plank_floor', doors: [[18, 5]], windows: [17, 20], chimney: 19, closed: true, roof: { rect: [16, 1, 5, 5], kind: 'roof_slate' } },
  ]),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({ idle: [7, 4] }),
  exits: Object.freeze([{ x: 22, y: 12, to: 'town_common' }]),
  start: Object.freeze([6, 7]),
  maskHash: 'fda5731c',
});
