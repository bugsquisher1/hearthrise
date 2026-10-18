// src/data/world/maps/town_common.js — a corner of the Common: the smithy, the mill, the plaza.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// ART (style 1): the ground is PixelLab map 53d53262 (`common_ground`, art/world/common):
// grass, dirt lanes and the cobbled square, painted on these rows. The smithy and the mill
// are whole style-1 building sprites (the mill's wheel is part of it), standing on their
// footprints; nobody walks into either. The props are the Common's style-1 sheet.
export default Object.freeze({
  id: 'town_common',
  name: 'The Common',
  kind: 'town',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  ground: 'common_ground',
  legend: Object.freeze({ '.': 'grass', ':': 'cobble' }),
  rows: Object.freeze([
    '..........:::...........',
    '..........:::...........',
    '..........:::...........',
    '..........:::...........',
    '..........:::...........',
    '..........:::...........',
    '..........::::::::......',
    '::::::::::::::::::......',
    '::::::::::::::::::......',
    '::::::::::::::::::......',
    '..........::::::::......',
    '..........:::...........',
    '..........:::...........',
    '..........:::...........',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the two buildings: the smithy west of the lane, the mill (and its wheel) east */
    { id: 'smithy', x: 2, y: 1 }, { id: 'mill', x: 14, y: 0 },
    /* the mill yard: the cellar hatch, its stores */
    { id: 'hatch', x: 15, y: 6 }, { id: 'barrels', x: 17, y: 5 }, { id: 'flour_sack', x: 18, y: 5 },
    { id: 'water_trough', x: 13, y: 4 },
    /* the smithy yard: the anvil, the smith, the board and its crier */
    { id: 'hedge', x: 1, y: 6 }, { id: 'hedge', x: 2, y: 6 }, { id: 'flower_bed', x: 5, y: 6 }, { id: 'bush', x: 7, y: 6 },
    { id: 'anvil', x: 6, y: 8 }, { id: 'cabbage_crate', x: 1, y: 8 }, { id: 'noticeboard', x: 8, y: 6 },
    { id: 'npc_crier', x: 8, y: 7 }, { id: 'npc_smith', x: 5, y: 8 },
    /* the square */
    { id: 'lamppost', x: 9, y: 10 }, { id: 'lamppost', x: 13, y: 6 }, { id: 'signpost', x: 13, y: 10 },
    { id: 'well', x: 14, y: 8 }, { id: 'woodpile', x: 19, y: 8 }, { id: 'hay_bale', x: 3, y: 10 },
    /* the green */
    { id: 'oak', x: 9, y: 3 }, { id: 'pine', x: 20, y: 1 }, { id: 'pine', x: 22, y: 6 }, { id: 'bush', x: 21, y: 11 },
    { id: 'pine', x: 1, y: 12 }, { id: 'rocks', x: 7, y: 13 }, { id: 'bush', x: 8, y: 11 }, { id: 'hedge', x: 18, y: 10 }, { id: 'pine', x: 20, y: 13 },
    { id: 'bush', x: 17, y: 11 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({ combat: [16, 7], gather: [19, 9], artisan: [7, 8], idle: [4, 11] }),
  exits: Object.freeze([{ x: 15, y: 6, to: 'mill_cellar' }]),
  start: Object.freeze([11, 9]),
  focus: Object.freeze([11, 7]),
  maskHash: '82526f23',
});
