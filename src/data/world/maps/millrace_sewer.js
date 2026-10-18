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
  ground: 'cellar_floor',
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
    /* entrance and west hall */
    { id: 'wall_torch', x: 2, y: 20 }, { id: 'wall_torch', x: 7, y: 12 }, { id: 'brazier', x: 14, y: 24 },
    { id: 'puddle', x: 9, y: 23 }, { id: 'pebbles', x: 4, y: 22 },
    /* NW room: the rats' nest */
    { id: 'wall_torch', x: 5, y: 1 }, { id: 'wall_torch', x: 10, y: 1 }, { id: 'barrel_old', x: 3, y: 2 },
    { id: 'straw', x: 11, y: 3 }, { id: 'bones', x: 4, y: 8 }, { id: 'puddle', x: 6, y: 9 },
    /* SW room: the sump */
    { id: 'wall_torch', x: 4, y: 27 }, { id: 'puddle', x: 5, y: 32 }, { id: 'puddle', x: 6, y: 33 },
    { id: 'straw', x: 12, y: 29 }, { id: 'bones', x: 3, y: 33 },
    /* the channel hall */
    { id: 'wall_torch', x: 33, y: 10 }, { id: 'brazier', x: 27, y: 17 }, { id: 'puddle', x: 30, y: 30 },
    { id: 'puddle', x: 36, y: 28 }, { id: 'pebbles', x: 25, y: 9 }, { id: 'bone', x: 29, y: 3 },
    /* east junction hall */
    { id: 'wall_torch', x: 42, y: 16 }, { id: 'barrel_old', x: 47, y: 28 }, { id: 'puddle', x: 45, y: 20 },
    /* NE room: the spiders' web */
    { id: 'wall_torch', x: 40, y: 2 }, { id: 'wall_torch', x: 46, y: 2 }, { id: 'bones', x: 47, y: 9 },
    { id: 'skull', x: 43, y: 11 },
    /* SE room: the toshers' scrap */
    { id: 'wall_torch', x: 48, y: 30 }, { id: 'crate', x: 50, y: 37 }, { id: 'bones', x: 49, y: 36 },
    { id: 'straw', x: 41, y: 36 },
    /* the Rat King's room: two nests, two barrels, the bones of what came before */
    { id: 'wall_torch', x: 54, y: 17 }, { id: 'barrel', x: 57, y: 19 }, { id: 'barrel_banded', x: 57, y: 28 },
    { id: 'straw', x: 51, y: 19 }, { id: 'bones', x: 52, y: 19 }, { id: 'straw', x: 54, y: 28 },
    { id: 'rat_skull', x: 53, y: 28 }, { id: 'bones', x: 51, y: 28 },
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
  maskHash: 'd869c0f6',
});
