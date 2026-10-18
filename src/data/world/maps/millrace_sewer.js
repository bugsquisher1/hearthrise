// src/data/world/maps/millrace_sewer.js — the first party ground: the mill race run underground.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID is the hunt sim's (prototypes/hunt-sim/grid.js, the walkable grid of
// PixelLab map d9c3544c / c8ed5928, docs/design/PIXELLAB_STYLE1_KIT.md §1) with one
// change for the §4b sizing rules: the north link from the west hall to the
// channel (x18-23) was two tiles high and is three. Wall top and wall face both
// become rock ('#'); the engine draws the face wherever floor lies south of it.
// The iron bridge (x32-34, y24) is floor: it is the map's ONE deliberate 1-tile
// choke across the channel. The channel ('~') blocks a step, not a shot.
//
// ART: the props are the shipped cellar kit standing in for the sewer set (the
// rat nests are straw and bones, the bridge is bare flagstone, the water draws
// as the void). The sewer atlas (cut-wall tileset b342fc89, water e0c9621c, the
// kit's props) is an asset handoff; when it ships, only `ground` and object ids
// change, never the grid.
//
// The pockets, packs and route are src/data/hunt-grounds.js `millrace_sewer`;
// `spawns` here lists the same tiles so the map lint proves each is open floor.
export default Object.freeze({
  id: 'millrace_sewer',
  name: 'Millrace Sewer',
  kind: 'hunt',
  hunts: Object.freeze(['millrace_sewer']),
  outdoor: false,
  light: 'cellar',
  ground: 'sewer_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'flagstone', '~': 'sewage' }),
  rows: Object.freeze([
    '############################################################',
    '############################################################',
    '###..........###########........############################',
    '###..........###########........######.........#############',
    '###..........###########..~~~...######.........#############',
    '###..........###########..~~~...######.........#############',
    '###..........###########..~~~...######.........#############',
    '###.........############..~~~...######.........#############',
    '###.........############..~~~...######...........###########',
    '###.........############..~~~...######...........###########',
    '###..........###########..~~~...##########.......###########',
    '########...#############..~~~.........####.......###########',
    '########...#############..~~~.........####.......###########',
    '######......######........~~~~~~~~~...#####...##############',
    '######......######........~~~~~~~~~...#####...##############',
    '######......######........~~~~~~~~~...#####...##############',
    '######......#####...####........~~~...#####...##############',
    '######........###...####........~~~...####......############',
    '######........###...####........~~~...####......###.......##',
    '######........###...####........~~~...####......###.......##',
    '######..............#########...~~~...##........###.......##',
    '....................#########...~~~...##........###.......##',
    '....................#########...~~~...##..................##',
    '######..........#############...~~~.......................##',
    '######..........##########................................##',
    '######..........##########......~~~.............###.......##',
    '########...###############......~~~...##........###.......##',
    '########...###############......~~~...####......###.......##',
    '##............############......~~~...####......###.......##',
    '##............############......~~~...####...######.......##',
    '##............############......~~~...####...###############',
    '##........################......~~~...##...........#########',
    '##........################............##...........#########',
    '##........################............##...........#########',
    '##........##############################...........#########',
    '########################################...........#########',
    '########################################...........#########',
    '########################################...........#########',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* Every prop stands where PixelLab map c8ed5928 places it (the units left out): the same cell,
       the same pixels (tools/world-art/port-pixellab.mjs). */
    /* the walls: torches, outflow pipes, chains, fallen masonry */
    { id: 'wall_torch', x: 5, y: 1 }, { id: 'wall_torch', x: 11, y: 1 }, { id: 'wall_torch', x: 2, y: 20 },
    { id: 'wall_torch', x: 4, y: 27 }, { id: 'wall_torch', x: 26, y: 1 }, { id: 'wall_torch', x: 40, y: 2 },
    { id: 'wall_torch', x: 45, y: 2 }, { id: 'wall_torch', x: 41, y: 30 }, { id: 'wall_torch', x: 52, y: 17 },
    { id: 'pipe_outflow', x: 27, y: 1 }, { id: 'pipe_outflow', x: 33, y: 10 }, { id: 'pipe_outflow', x: 5, y: 20 }, { id: 'pipe_outflow', x: 41, y: 19 },
    { id: 'hanging_chains', x: 35, y: 10 }, { id: 'hanging_chains', x: 55, y: 17 }, { id: 'hanging_chains', x: 7, y: 27 },
    { id: 'wall_chunk', x: 8, y: 1 }, { id: 'wall_chunk', x: 29, y: 1 }, { id: 'wall_chunk', x: 48, y: 30 }, { id: 'wall_chunk', x: 20, y: 13 },
    /* the channel: the one bridge, two lanterns lost in the sewage */
    { id: 'grate_bridge', x: 33, y: 24 }, { id: 'drowned_lantern', x: 33, y: 19 }, { id: 'drowned_lantern', x: 27, y: 9 },
    /* what stands on the floor */
    { id: 'brazier', x: 7, y: 14 },
    { id: 'barrels', x: 36, y: 32 }, { id: 'barrels', x: 7, y: 24 }, { id: 'barrels', x: 55, y: 21 }, { id: 'barrels', x: 55, y: 29 },
    { id: 'collapsed_cart', x: 48, y: 35 }, { id: 'collapsed_cart', x: 11, y: 16 },
    /* nests by the packs, the Rat King's two, and the bones of what came before */
    { id: 'rat_nest', x: 11, y: 5 }, { id: 'rat_nest', x: 11, y: 29 }, { id: 'rat_nest', x: 41, y: 33 },
    { id: 'rat_nest', x: 54, y: 27 }, { id: 'rat_nest', x: 51, y: 19 },
    { id: 'bones', x: 46, y: 4 }, { id: 'bones', x: 51, y: 28 },
    { id: 'corner_rubble', x: 3, y: 2 }, { id: 'corner_rubble', x: 31, y: 2 }, { id: 'corner_rubble', x: 2, y: 33 },
    { id: 'corner_rubble', x: 50, y: 36 }, { id: 'corner_rubble', x: 57, y: 18 }, { id: 'corner_rubble', x: 15, y: 25 },
    /* floor wear, clustered by the walls and the water (about 16% of the floor) */
    { id: 'moss_puddle', x: 25, y: 7 }, { id: 'moss_puddle', x: 30, y: 20 }, { id: 'moss_puddle', x: 30, y: 29 }, { id: 'moss_puddle', x: 36, y: 18 },
    { id: 'moss_puddle', x: 3, y: 33 }, { id: 'moss_puddle', x: 47, y: 26 }, { id: 'moss_puddle', x: 13, y: 24 }, { id: 'moss_puddle', x: 3, y: 29 },
    { id: 'moss_puddle', x: 12, y: 28 }, { id: 'moss_puddle', x: 8, y: 33 }, { id: 'moss_puddle', x: 4, y: 3 }, { id: 'moss_puddle', x: 24, y: 3 },
    { id: 'moss_puddle', x: 36, y: 11 }, { id: 'moss_puddle', x: 38, y: 3 }, { id: 'moss_puddle', x: 40, y: 9 }, { id: 'moss_puddle', x: 4, y: 10 },
    { id: 'moss_puddle', x: 31, y: 22 }, { id: 'moss_puddle', x: 35, y: 12 }, { id: 'moss_puddle', x: 35, y: 25 }, { id: 'moss_puddle', x: 24, y: 14 },
    { id: 'cracked_flagstone', x: 48, y: 9 }, { id: 'cracked_flagstone', x: 36, y: 33 }, { id: 'cracked_flagstone', x: 37, y: 27 },
    { id: 'cracked_flagstone', x: 29, y: 23 }, { id: 'cracked_flagstone', x: 26, y: 28 }, { id: 'cracked_flagstone', x: 6, y: 34 },
    { id: 'cracked_flagstone', x: 12, y: 2 }, { id: 'cracked_flagstone', x: 21, y: 15 }, { id: 'cracked_flagstone', x: 28, y: 2 },
    { id: 'cracked_flagstone', x: 6, y: 16 }, { id: 'cracked_flagstone', x: 8, y: 13 }, { id: 'cracked_flagstone', x: 40, y: 36 },
    { id: 'cracked_flagstone', x: 35, y: 31 }, { id: 'cracked_flagstone', x: 7, y: 2 },
    { id: 'exposed_dirt', x: 42, y: 26 }, { id: 'exposed_dirt', x: 42, y: 17 }, { id: 'exposed_dirt', x: 31, y: 18 }, { id: 'exposed_dirt', x: 47, y: 17 },
    { id: 'exposed_dirt', x: 46, y: 31 }, { id: 'exposed_dirt', x: 44, y: 37 }, { id: 'exposed_dirt', x: 24, y: 9 }, { id: 'exposed_dirt', x: 47, y: 22 },
    { id: 'exposed_dirt', x: 56, y: 24 }, { id: 'exposed_dirt', x: 4, y: 22 }, { id: 'exposed_dirt', x: 3, y: 7 }, { id: 'exposed_dirt', x: 40, y: 25 },
    { id: 'exposed_dirt', x: 15, y: 24 },
    { id: 'floor_grate', x: 50, y: 33 }, { id: 'floor_grate', x: 24, y: 17 }, { id: 'floor_grate', x: 28, y: 33 }, { id: 'floor_grate', x: 24, y: 2 },
    { id: 'floor_grate', x: 40, y: 32 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[7, 17], [12, 17], [12, 22], [7, 22]]),
  spawns: Object.freeze([
    [7, 4], [8, 3], [9, 4], [8, 5],
    [6, 31], [7, 30], [8, 31],
    [30, 27], [31, 29],
    [41, 5], [43, 5], [42, 4], [44, 6],
    [43, 35], [44, 34], [45, 35],
    [55, 23], [54, 21], [54, 25],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 21, to: 'mill_cellar' }]),
  start: Object.freeze([1, 21]),
  maskHash: 'ad6e51f5',
});
