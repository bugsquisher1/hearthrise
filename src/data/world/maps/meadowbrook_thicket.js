// src/data/world/maps/meadowbrook_thicket.js — the wood ground: a ring of clearings round the Meadowbrook.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (designer 2026-10-18, authored for KIT §4b): six clearings on a ring round the brook,
// joined by 3-wide paths; every open tile lies in an open 3x3 except the log bridge (x28-32, y5),
// the map's ONE 1-tile choke. The ford (x28-32, y31-33) is the way back, three wide. The brook
// ('~') blocks a step but not a shot; its grassy banks are part of it (no tileset joins water to
// thicket, so the bank stays). The thicket ('#') blocks both and counts as trees (L-TREES).
//
// ART (style 1): the ground is PixelLab map 91df925a (`meadowbrook_ground`, art/world/forest),
// painted from these rows with a dirt trail along the route. Trees and props stand on whole tiles;
// the gather nodes are the trees hunt-grounds.js `gather` lists, on the same tiles.
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `meadowbrook_thicket`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'meadowbrook_thicket',
  name: 'Meadowbrook Thicket',
  kind: 'hunt',
  hunts: Object.freeze(['meadowbrook_thicket']),
  outdoor: true,
  light: 'day',
  ground: 'meadowbrook_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass', '~': 'brook', '=': 'planks', ':': 'grass' }),
  rows: Object.freeze([
    '############################~~~~~###########################',
    '#####...###.........########~~~~~########....####......#####',
    '#####..................#####~~~~~########..............#####',
    '##..........................~~~~~......................#####',
    '##..........................~~~~~.........................##',
    '##..........................=====.........................##',
    '##..........................~~~~~.........................##',
    '####...................#####~~~~~#####....................##',
    '####..........##############~~~~~#####....................##',
    '##########...##############~~~~~##########................##',
    '##########...##############~~~~~##########.............#####',
    '##########...##############~~~~~##########..........########',
    '##########...##############~~~~~##############...###########',
    '########...........########~~~~~##############...###########',
    '########...........########~~~~~##############...###########',
    '########.............#####~~~~~#########...............#####',
    '#####................#####~~~~~#########...............#####',
    '#####................#####~~~~~#####......................##',
    '......................####~~~~~#####......................##',
    '......................####~~~~~#####......................##',
    '......................####~~~~~#####......................##',
    '#####.................####~~~~~#####......................##',
    '#####.................#####~~~~~######..................####',
    '#######...............#####~~~~~######..................####',
    '#######.............#######~~~~~######...####...........####',
    '#######.............#######~~~~~################...#########',
    '###########...#############~~~~~################...#########',
    '######...........##########~~~~~################...#########',
    '######...........###########~~~~~#########............######',
    '######...............#######~~~~~#########............######',
    '###..................#######~~~~~#####....................##',
    '###.........................:::::.........................##',
    '###.........................:::::.........................##',
    '###.........................:::::.........................##',
    '###..................#######~~~~~#####....................##',
    '###..................########~~~~~####..................####',
    '###..................########~~~~~####..................####',
    '#######...........###########~~~~~#######...............####',
    '#######...###.....###########~~~~~#######....#####......####',
    '#############################~~~~~##########################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the gather nodes (hunt-grounds.js `gather`, INERT until the gather engine lands): the full sprite on each node's tile */
    { id: 'pine', x: 6, y: 16 }, { id: 'pine', x: 17, y: 14 }, { id: 'pine', x: 18, y: 23 }, { id: 'pine', x: 8, y: 22 },
    { id: 'pine', x: 2, y: 6 }, { id: 'pine', x: 22, y: 2 }, { id: 'pine', x: 6, y: 7 }, { id: 'oak', x: 40, y: 3 },
    { id: 'oak', x: 56, y: 6 }, { id: 'oak', x: 37, y: 17 }, { id: 'oak', x: 56, y: 17 }, { id: 'oak', x: 39, y: 23 },
    { id: 'oak', x: 54, y: 23 }, { id: 'mb_hollow_oak', x: 55, y: 36 }, { id: 'mb_hollow_oak', x: 39, y: 30 }, { id: 'pine', x: 4, y: 31 },
    { id: 'pine', x: 4, y: 36 }, { id: 'oak', x: 19, y: 36 },
    /* the crossings: the log bridge (the one 1-tile choke) and the ford stones */
    { id: 'mb_log_bridge', x: 30, y: 5 }, { id: 'mb_stepping_stones', x: 29, y: 31 }, { id: 'mb_stepping_stones', x: 30, y: 32 }, { id: 'mb_stepping_stones', x: 31, y: 33 },
    { id: 'mb_stepping_stones', x: 28, y: 32 }, { id: 'mb_stepping_stones', x: 32, y: 31 },
    /* reeds on the brook banks */
    { id: 'mb_reeds', x: 28, y: 3 }, { id: 'mb_reeds', x: 32, y: 7 }, { id: 'mb_reeds', x: 28, y: 30 }, { id: 'mb_reeds', x: 32, y: 30 },
    { id: 'mb_reeds', x: 28, y: 34 }, { id: 'mb_reeds', x: 32, y: 34 }, { id: 'mb_reeds', x: 32, y: 3 }, { id: 'mb_reeds', x: 28, y: 7 },
    /* P0 the woodcutters' clearing: their logs and block */
    { id: 'woodpile', x: 19, y: 15 }, { id: 'chopping_block', x: 11, y: 23 }, { id: 'rocks', x: 7, y: 24 }, { id: 'mb_flowers', x: 9, y: 15 },
    { id: 'mb_flowers', x: 12, y: 21 }, { id: 'mb_leaf_litter', x: 20, y: 21 },
    /* P1 Birch Glade */
    { id: 'rocks', x: 21, y: 7 }, { id: 'mb_fern', x: 5, y: 2 }, { id: 'mb_fern', x: 13, y: 1 }, { id: 'mb_flowers', x: 9, y: 5 },
    { id: 'mb_flowers', x: 14, y: 7 }, { id: 'pine', x: 2, y: 5 },
    /* P2 Briar Hollow: brambles and a fallen trunk */
    { id: 'bush', x: 42, y: 10 }, { id: 'bush', x: 55, y: 9 }, { id: 'bush', x: 45, y: 2 }, { id: 'mb_fallen_log', x: 48, y: 10 },
    { id: 'mb_leaf_litter', x: 53, y: 3 }, { id: 'mb_leaf_litter', x: 44, y: 8 },
    /* P3 Oak Stand */
    { id: 'rocks', x: 38, y: 22 }, { id: 'mb_fern', x: 55, y: 22 }, { id: 'mushrooms', x: 41, y: 16 }, { id: 'pine', x: 40, y: 15 },
    { id: 'mb_leaf_litter', x: 48, y: 18 },
    /* P4 Grayjaw's Den: the bones round the hollow oaks */
    { id: 'bone_pile', x: 53, y: 36 }, { id: 'bone_pile', x: 49, y: 36 }, { id: 'bone_pile', x: 55, y: 32 }, { id: 'mushrooms', x: 40, y: 34 },
    { id: 'mb_leaf_litter', x: 44, y: 30 }, { id: 'mb_fern', x: 56, y: 30 },
    /* P5 Fern Hollow */
    { id: 'mb_fern', x: 6, y: 28 }, { id: 'mb_fern', x: 18, y: 30 }, { id: 'mb_fern', x: 14, y: 37 }, { id: 'mushrooms', x: 5, y: 34 },
    { id: 'mb_fallen_log', x: 16, y: 28 }, { id: 'mb_flowers', x: 12, y: 36 },
    /* the edge scatter: trees and undergrowth along the thicket */
    { id: 'bush', x: 14, y: 1 }, { id: 'bush', x: 18, y: 1 }, { id: 'bush', x: 9, y: 2 }, { id: 'pine', x: 46, y: 2 },
    { id: 'bush', x: 20, y: 7 }, { id: 'rocks', x: 38, y: 7 }, { id: 'pine', x: 57, y: 9 }, { id: 'bush', x: 42, y: 11 },
    { id: 'oak', x: 45, y: 11 }, { id: 'rocks', x: 50, y: 15 }, { id: 'rocks', x: 20, y: 17 }, { id: 'pine', x: 36, y: 20 },
    { id: 'oak', x: 57, y: 21 }, { id: 'rocks', x: 45, y: 24 }, { id: 'bush', x: 6, y: 27 }, { id: 'rocks', x: 16, y: 27 },
    { id: 'pine', x: 44, y: 28 }, { id: 'oak', x: 52, y: 28 }, { id: 'pine', x: 38, y: 34 }, { id: 'rocks', x: 10, y: 37 },
    { id: 'oak', x: 45, y: 37 }, { id: 'rocks', x: 15, y: 38 }, { id: 'bush', x: 51, y: 38 },
    /* the edge scatter: flowers, leaves and ferns in the grass */
    { id: 'mb_flowers', x: 53, y: 2 }, { id: 'mb_flowers', x: 21, y: 3 }, { id: 'mb_flowers', x: 41, y: 3 }, { id: 'mb_leaf_litter', x: 46, y: 5 },
    { id: 'mb_leaf_litter', x: 55, y: 6 }, { id: 'mb_flowers', x: 9, y: 7 }, { id: 'mb_fern', x: 44, y: 10 }, { id: 'mb_fern', x: 49, y: 17 },
    { id: 'mb_fern', x: 38, y: 20 }, { id: 'mb_fern', x: 50, y: 20 }, { id: 'mb_flowers', x: 7, y: 21 }, { id: 'mb_flowers', x: 6, y: 34 },
    { id: 'mb_fern', x: 50, y: 36 }, { id: 'mb_flowers', x: 52, y: 37 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[7, 17], [11, 17], [11, 21], [7, 21]]),
  spawns: Object.freeze([
    [15, 18], [16, 19], [15, 20], [14, 19], [16, 18], [16, 20], [14, 20], [14, 18],
    [17, 3], [18, 4], [17, 5], [16, 4], [18, 3], [18, 5], [16, 5], [16, 3],
    [50, 5], [51, 6], [50, 7], [49, 6], [51, 5], [51, 7], [49, 7], [49, 5],
    [45, 19], [46, 20], [45, 21], [44, 20], [46, 19], [46, 21], [44, 21], [44, 19],
    [51, 32], [52, 33], [51, 34], [50, 33], [52, 32], [52, 34], [50, 34], [50, 32],
    [10, 32], [11, 33], [10, 34], [9, 33], [11, 32], [11, 34], [9, 34], [9, 32],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 19, to: 'town_common' }]),
  start: Object.freeze([1, 19]),
  maskHash: '4d981f23',
});
