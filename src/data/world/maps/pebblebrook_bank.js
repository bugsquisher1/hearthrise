// src/data/world/maps/pebblebrook_bank.js — the river ground: the Pebble Brook below the mill, Levels 25-32.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (designer 2026-10-19, authored for KIT §4b): the brook runs west to east across the middle and
// bends south past the tannery. In from town along the north bank: the Shingle, the Osier Beds, the Eel
// Stakes, then over the mill weir (x47, y15-19: the map's ONE 1-tile choke) to the Weir Pool, west to
// the Tannery Steps and the Withy Bank, and back north over Tanner's Ford (x11-13, y15-19, three wide).
// Every open tile lies in an open 3x3 except the weir. The banks are cut-corner on purpose: no wall runs
// straight for long. The brook ('~') blocks a step but not a shot; the ford's stones (':') are walked.
// The thicket ('#') blocks both and counts as trees (L-TREES).
//
// ART OWED (asset lane): the painted ground `pebblebrook_ground` (style 1, from these rows); until it lands
// the row names the Meadowbrook's painted ground so the map compiles, and the scene reads wrong. Also owed:
// `pb_willow` / `pb_willow_stump` / `pb_weeping_willow` / `pb_weeping_willow_stump` (the gather nodes stand
// on the oak sprite), a weir walk span (the log bridge stands in), and the three crayfish (monsters.js).
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `pebblebrook_bank`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'pebblebrook_bank',
  name: 'Pebblebrook Bank',
  kind: 'hunt',
  hunts: Object.freeze(['pebblebrook_bank']),
  outdoor: true,
  light: 'day',
  ground: 'meadowbrook_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass', '~': 'brook', '=': 'planks', ':': 'earth' }),
  rows: Object.freeze([
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '....########################################..........######',
    '................##############...####....##............#####',
    '................############......##...................#####',
    '##...............######................................#####',
    '####.............#####.................................#####',
    '####..............####................###..............#####',
    '####................#................#####.............#####',
    '####................................########..........######',
    '#####..........#...................###########......########',
    '########......####.....#..........############.....#########',
    '#########.....############........############....##########',
    '~~~~~~~~~~~:::~~~############....#####~~~~~~~~~=~~~~~~~~~~~~',
    '~~~~~~~~~~~:::~~~~~~###############~~~~~~~~~~~~=~~~~~~~~~~~~',
    '~~~~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~',
    '~~~~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~',
    '~~~~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~',
    '###########...###~~~~~~~~~~~~~~~~~~~~~########.....#########',
    '###########...######~~~~~~~~~~~~~~~###########........######',
    '########.........#########~~~~~~~~###########...........####',
    '#######..........##############....########.............####',
    '######...........###########.......#######..............####',
    '####.............########...........######.............#####',
    '####................####............######..............####',
    '####...................#.............#####..............####',
    '#####................................####...............####',
    '#######......................................#.........#####',
    '#########.......#####.......................################',
    '##########...###########...................#################',
    '#############################......###....##################',
    '##############################....##########################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the gather nodes (hunt-grounds.js `gather`, INERT until the gather engine lands): the full sprite on each
       node's tile. Willows for the basket-makers' withies; the oak stands in until the willow art lands. */
    { id: 'oak', x: 24, y: 8 }, { id: 'oak', x: 35, y: 9 }, { id: 'oak', x: 26, y: 13 }, { id: 'oak', x: 33, y: 13 },
    { id: 'oak', x: 55, y: 24 }, { id: 'oak', x: 44, y: 26 },
    { id: 'oak', x: 5, y: 26 }, { id: 'oak', x: 8, y: 23 }, { id: 'oak', x: 20, y: 27 },
    /* the crossings: the mill weir's walk (the one 1-tile choke) and Tanner's Ford's stones */
    { id: 'mb_log_bridge', x: 47, y: 17 },
    { id: 'mb_stepping_stones', x: 11, y: 16 }, { id: 'mb_stepping_stones', x: 12, y: 17 }, { id: 'mb_stepping_stones', x: 13, y: 18 },
    { id: 'mb_stepping_stones', x: 12, y: 19 }, { id: 'mb_stepping_stones', x: 11, y: 18 },
    /* reeds where the banks meet the water */
    { id: 'mb_reeds', x: 9, y: 14 }, { id: 'mb_reeds', x: 30, y: 15 }, { id: 'mb_reeds', x: 46, y: 13 }, { id: 'mb_reeds', x: 50, y: 13 },
    { id: 'mb_reeds', x: 46, y: 20 }, { id: 'mb_reeds', x: 50, y: 20 }, { id: 'mb_reeds', x: 32, y: 23 },
    /* P0 the Shingle: the pebble bar the young crayfish bask on */
    { id: 'pebbles', x: 6, y: 10 }, { id: 'pebbles', x: 14, y: 11 }, { id: 'pebbles', x: 7, y: 12 },
    /* P2 the Eel Stakes: the eel-catchers' traps and gear */
    { id: 'fence', x: 54, y: 9 }, { id: 'barrels', x: 53, y: 5 }, { id: 'bucket', x: 44, y: 11 },
    /* P3 the Weir Pool */
    { id: 'rocks', x: 54, y: 28 }, { id: 'mb_leaf_litter', x: 47, y: 22 },
    /* P4 the Tannery Steps: what the tannery lets fall in */
    { id: 'barrel_broken', x: 25, y: 25 }, { id: 'crates', x: 39, y: 29 }, { id: 'collapsed_cart', x: 27, y: 31 },
    /* P5 the Withy Bank: the basket-makers' cut withies */
    { id: 'woodpile', x: 16, y: 23 }, { id: 'mb_fallen_log', x: 7, y: 29 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[7, 7], [13, 7], [13, 11], [7, 11]]),
  spawns: Object.freeze([
    [10, 8], [11, 9], [10, 10], [9, 9], [11, 8], [11, 10], [9, 10], [9, 8],
    [29, 9], [30, 10], [29, 11], [28, 10], [30, 9], [30, 11], [28, 11], [28, 9],
    [49, 7], [50, 8], [49, 9], [48, 8], [50, 7], [50, 9], [48, 9], [48, 7],
    [50, 24], [51, 25], [50, 26], [49, 25], [51, 24], [51, 26], [49, 26], [49, 24],
    [31, 27], [32, 28], [31, 29], [30, 28], [32, 27], [32, 29], [30, 29], [30, 27],
    [11, 25], [12, 26], [11, 27], [10, 26], [12, 25], [12, 27], [10, 27], [10, 25],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 6, to: 'town_common' }]),
  start: Object.freeze([1, 6]),
  maskHash: '8f8af8a3',
});
