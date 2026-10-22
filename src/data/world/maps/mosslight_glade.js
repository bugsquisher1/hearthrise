// src/data/world/maps/mosslight_glade.js — the spring ground: where the Meadowbrook rises, under the Warrens' copper hill.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (designer 2026-10-21, lane c-ground-16-31, authored for KIT §4b like the Thicket): the brook
// ('~') runs the full width from the springs in the east, so the glade is two banks. Six clearings on a
// loop joined by 3-wide paths: south of the brook the Crow Field and the Poachers' Camp, over the goblins'
// sluice boards (x44, y19-23: the map's ONE 1-tile choke) the Sluice, the Mosslight Springs, Rook's Hide
// (the ruined spring-house) and Vine Hollow, then back over the ford (x8-10, three wide). Every open tile
// lies in an open 3x3 except the boards. The thicket ('#') blocks a step and a shot and counts as trees.
//
// ART (style 1): the ground is PixelLab map 4589f28b (`mosslight_ground`, art/world/glade), painted from
// these rows in the Meadowbrook's tileset family with a dirt trail along the route; the brook keeps its
// grassy banks (rows 19 and 23) as in the Thicket. The springs' moss, the sluice and Rook's ruined
// spring-house are props. Every placed object is an existing style-1 sprite; the five creatures are the
// glade set (lane b-mosslight-art, 2026-10-22).
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `mosslight_glade`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'mosslight_glade',
  name: 'Mosslight Glade',
  kind: 'hunt',
  hunts: Object.freeze(['mosslight_glade']),
  outdoor: true,
  light: 'day',
  ground: 'mosslight_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass', '~': 'brook', '=': 'planks', ':': 'grass' }),
  rows: Object.freeze([
    '############################################################',
    '######################............########..............####',
    '#####...........######............########..............####',
    '#####...........######..............####..................##',
    '###...............####....................................##',
    '###...............####....................................##',
    '###.......................................................##',
    '###.......................................................##',
    '###.................................####..................##',
    '###.................................########....############',
    '###...............####..............########....############',
    '###...............######............####.............#######',
    '#####.............######............####.............#######',
    '#####.............######################.............#######',
    '######.......###########################.............#######',
    '######.......###########################.............#######',
    '######.......###########################.............#######',
    '######.......###########################...........#########',
    '######.......###########################...........#########',
    '~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
    '~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
    '~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
    '~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
    '~~~~~~~~:::~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~',
    '######.......#############################......############',
    '#####.................####################......############',
    '#####.................####################......############',
    '#####.................#########..................###########',
    '#####.................#########..................###########',
    '#####.................#########..................###########',
    '#####............................................###########',
    '.................................................###########',
    '.................................................###########',
    '.................................................###########',
    '......................#########..................###########',
    '#####.................#########..................###########',
    '#######.............#############..............#############',
    '#######.............#############..............#############',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the gather nodes (hunt-grounds.js `gather`, INERT until the gather engine lands): the full sprite on each node's tile */
    { id: 'pine', x: 6, y: 26 }, { id: 'pine', x: 19, y: 34 }, { id: 'pine', x: 8, y: 35 }, { id: 'oak', x: 32, y: 28 },
    { id: 'oak', x: 46, y: 35 }, { id: 'cw_copper_vein', x: 41, y: 12 }, { id: 'cw_copper_vein', x: 50, y: 16 }, { id: 'cw_copper_vein', x: 52, y: 12 },
    { id: 'oak', x: 24, y: 2 }, { id: 'oak', x: 33, y: 10 }, { id: 'pine', x: 5, y: 4 }, { id: 'pine', x: 15, y: 12 },
    { id: 'oak', x: 4, y: 10 },
    /* the crossings: the goblins' sluice boards (the one 1-tile choke) and the ford stones */
    { id: 'cw_plank_bridge', x: 44, y: 21 }, { id: 'mb_stepping_stones', x: 8, y: 20 }, { id: 'mb_stepping_stones', x: 9, y: 22 }, { id: 'mb_stepping_stones', x: 10, y: 21 },
    { id: 'mb_stepping_stones', x: 9, y: 19 }, { id: 'mb_stepping_stones', x: 10, y: 23 }, { id: 'mb_reeds', x: 43, y: 19 }, { id: 'mb_reeds', x: 45, y: 23 },
    { id: 'mb_reeds', x: 7, y: 19 }, { id: 'mb_reeds', x: 11, y: 23 }, { id: 'mb_reeds', x: 30, y: 23 }, { id: 'mb_reeds', x: 55, y: 19 },
    /* P0 the Crow Field: what the poachers leave when they skin a wolf */
    { id: 'bone_pile', x: 9, y: 28 }, { id: 'bone_pile', x: 17, y: 33 }, { id: 'skull', x: 12, y: 35 }, { id: 'mb_leaf_litter', x: 18, y: 27 },
    { id: 'mb_flowers', x: 7, y: 31 }, { id: 'bush', x: 21, y: 25 }, { id: 'rocks', x: 5, y: 29 },
    /* P1 the Poachers' Camp: a fire, a cart and the skinning block */
    { id: 'collapsed_cart', x: 47, y: 28 }, { id: 'woodpile', x: 33, y: 35 }, { id: 'chopping_block', x: 35, y: 35 }, { id: 'barrels', x: 48, y: 31 },
    { id: 'crates', x: 48, y: 32 }, { id: 'brazier', x: 37, y: 29 }, { id: 'bones', x: 43, y: 29 }, { id: 'straw', x: 36, y: 33 },
    { id: 'sack_pile', x: 31, y: 29 }, { id: 'mb_leaf_litter', x: 44, y: 36 },
    /* P2 the Sluice: the goblins wash the Warrens' ore in the spring run */
    { id: 'cw_rails', x: 42, y: 14 }, { id: 'cw_rails', x: 43, y: 14 }, { id: 'cw_mine_cart', x: 41, y: 16 }, { id: 'cw_ore_stain', x: 49, y: 13 },
    { id: 'cw_puddle', x: 44, y: 17 }, { id: 'cw_tool_rack', x: 40, y: 11 }, { id: 'cw_copper_pots', x: 52, y: 14 },
    /* P3 the Mosslight Springs: the brook rises here, and the moss glows */
    { id: 'moss_puddle', x: 45, y: 3 }, { id: 'moss_puddle', x: 54, y: 6 }, { id: 'cw_puddle', x: 47, y: 6 }, { id: 'mushrooms', x: 42, y: 7 },
    { id: 'mb_fern', x: 55, y: 3 }, { id: 'mb_reeds', x: 53, y: 2 }, { id: 'pebbles', x: 57, y: 7 }, { id: 'mb_stepping_stones', x: 52, y: 6 },
    /* P4 Rook's Hide: the ruined spring-house the poachers camp in */
    { id: 'cracked_flagstone', x: 26, y: 4 }, { id: 'cracked_flagstone', x: 30, y: 4 }, { id: 'cracked_flagstone', x: 26, y: 8 }, { id: 'cracked_flagstone', x: 30, y: 8 },
    { id: 'corner_rubble', x: 25, y: 3 }, { id: 'corner_rubble', x: 31, y: 9 }, { id: 'cw_rubble', x: 32, y: 5 }, { id: 'barrel_broken', x: 23, y: 7 },
    { id: 'loot_bag', x: 34, y: 8 }, { id: 'hay_bale', x: 24, y: 10 }, { id: 'skull', x: 29, y: 10 }, { id: 'bones', x: 31, y: 3 },
    /* P5 Vine Hollow: where the vines drag the moss */
    { id: 'mb_hollow_oak', x: 14, y: 4 }, { id: 'mb_fallen_log', x: 6, y: 6 }, { id: 'mb_fern', x: 12, y: 3 }, { id: 'mb_fern', x: 7, y: 11 },
    { id: 'mushrooms', x: 13, y: 11 }, { id: 'mb_leaf_litter', x: 16, y: 9 },
    /* the edge scatter: trees along the wood */
    { id: 'pine', x: 41, y: 18 }, { id: 'pine', x: 57, y: 3 }, { id: 'pine', x: 12, y: 17 }, { id: 'oak', x: 36, y: 4 },
    { id: 'oak', x: 42, y: 26 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[7, 27], [11, 27], [11, 33], [7, 33]]),
  spawns: Object.freeze([
    [14, 29], [15, 30], [14, 31], [13, 30], [15, 29], [15, 31], [13, 31], [13, 29],
    [40, 31], [41, 32], [40, 33], [39, 32], [41, 31], [41, 33], [39, 33], [39, 31],
    [46, 13], [47, 14], [46, 15], [45, 14], [47, 13], [47, 15], [45, 15], [45, 13],
    [50, 3], [51, 4], [50, 5], [49, 4], [51, 3], [51, 5], [49, 5], [49, 3],
    [28, 5], [29, 6], [28, 7], [27, 6], [29, 5], [29, 7], [27, 7], [27, 5],
    [10, 7], [11, 8], [10, 9], [9, 8], [11, 7], [11, 9], [9, 9], [9, 7],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 33, to: 'town_common' }]),
  start: Object.freeze([1, 33]),
  maskHash: 'd07e85b8',
});
