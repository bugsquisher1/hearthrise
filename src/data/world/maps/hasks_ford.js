// src/data/world/maps/hasks_ford.js — THE BARROW MARCH'S FIRST GROUND: the ford the Banded Company died holding.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// THE GRID (art lane b-hasks-ford-art, walk grid art/briefs/hasks-ford-grid-2026-10-28.txt, v2 organic; wired by the
// designer, lane b-hasks-ford, 2026-10-29): the river comes in from the west, bends down through the Ford and leaves east,
// so the ground is two banks with ONE crossing, the Ford (x22-36, y18-24, shallows and two gravel bars). South of the
// river the Pike Files (the road in from Wickstead), the Toll Stone and the Low Barrows; over the Ford the Company
// Stores, the Muster Line and the High Barrows. Every open tile lies in an open 3x3.
//
// ART (style 1): the ground is PixelLab map ee5f44c4 (`hasks_ford_ground`, art/world/march), painted from these rows; the
// hf_* props are the march set, the rest shipped style-1 sprites. The four creatures are the march set too.
//
// The pockets, packs, pull tiles and route are src/data/hunt-grounds.js `hasks_ford`;
// `spawns` here lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'hasks_ford',
  name: 'Hask\'s Ford',
  kind: 'hunt',
  hunts: Object.freeze(['hasks_ford']),
  outdoor: true,
  light: 'day',
  ground: 'hasks_ford_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass', '~': 'brook', ':': 'grass' }),
  rows: Object.freeze([
    '############################################################',
    '############################################################',
    '############################################################',
    '#############################################.......########',
    '#######################.....###############...........######',
    '######...#####...#####.......#############.............#####',
    '######....###.....#................######..............#####',
    '######...............................##.................####',
    '#######..................................................###',
    '########.............##....................##............###',
    '#############.......####................##########.......###',
    '~~############.....#####...............############.....####',
    '~~~~~~~###################.............###################~~',
    '~~~~~~~~~~#################............#################~~~~',
    '~~~~~~~~~~~~###############.....#.....########~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~#############.....############~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~###########.....#########~~~~~~~~~~~~~~~~~~~',
    '#####~~~~~~~~~~~~~~########.....######~~~~~~~~~~~~~~~~~~~~~~',
    '#########~~~~~~~~~~~~~~###:::::::##~~~~~~~~~~~~~~~~~~~~~~###',
    '###########~~~~~~~~~~~::::::::::::::~~~~~~~~~~~~############',
    '#############~~~~~~~~~:::::::::::::::~~~~~~~~###############',
    '###############~~~~~~~:::::::::::::::~~~~~~#################',
    '##################~~~~:::::::::::::::~~~####################',
    '######################~~:::::::::::::#############.....#####',
    '##########################::::::::::#############.......####',
    '####.....###############.......##################.......####',
    '###.......############...........#############..........####',
    '###..........########.............#######...#...........####',
    '###...........#######...............#####...............####',
    '...............#.....................##................#####',
    '.....................................................#######',
    '..............................................#......#######',
    '####..............#.....................#....###....########',
    '####.................................###......##....########',
    '#####......................####.....###.......##############',
    '######.............##.....#############.......##############',
    '###########.......#####################.......##############',
    '#############...########################.....###############',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* P0 the Pike Files: the company died in its files; nobody burned them */
    { id: 'hf_pyre_unlit', x: 9, y: 34 }, { id: 'hf_pike_stakes', x: 5, y: 27 }, { id: 'hf_pike_stakes', x: 14, y: 33 }, { id: 'hf_pikes_fallen', x: 11, y: 28 }, { id: 'bones', x: 7, y: 33 }, { id: 'skull', x: 16, y: 35 }, { id: 'hf_banded_shield', x: 13, y: 36 }, { id: 'mb_fallen_log', x: 4, y: 32 },
    /* P1 the Toll Stone: where Hask took the coin for the ford */
    { id: 'hf_toll_stone', x: 23, y: 26 }, { id: 'coins_scattered', x: 24, y: 28 }, { id: 'hf_ford_marker', x: 32, y: 26 }, { id: 'hf_helm_heap', x: 21, y: 33 }, { id: 'hf_pike_stakes', x: 35, y: 28 }, { id: 'bone_pile', x: 33, y: 34 }, { id: 'hf_rowboat_sunk', x: 22, y: 19 },
    /* the Ford: stepping stones over the bars, reeds at the water */
    { id: 'mb_stepping_stones', x: 27, y: 19 }, { id: 'mb_stepping_stones', x: 30, y: 23 }, { id: 'mb_reeds', x: 19, y: 18 }, { id: 'mb_reeds', x: 35, y: 18 }, { id: 'mb_reeds', x: 11, y: 14 }, { id: 'mb_reeds', x: 46, y: 14 }, { id: 'mb_reeds', x: 5, y: 17 }, { id: 'mb_reeds', x: 51, y: 18 }, { id: 'mb_reeds', x: 40, y: 21 }, { id: 'mb_reeds', x: 18, y: 22 },
    /* P3 the Company Stores: the company's broken stores and wagons */
    { id: 'hf_tent_torn', x: 25, y: 5 }, { id: 'hf_stores_heap', x: 33, y: 7 }, { id: 'hf_wagon_tipped', x: 35, y: 12 }, { id: 'crates', x: 24, y: 9 }, { id: 'barrels', x: 31, y: 9 }, { id: 'barrel_broken', x: 37, y: 11 }, { id: 'sack_pile', x: 26, y: 11 }, { id: 'cart_wheel', x: 33, y: 13 },
    /* P4 the Muster Line: the broken palisade the company camped behind */
    { id: 'hf_palisade_broken', x: 46, y: 4 }, { id: 'hf_palisade_stake', x: 50, y: 3 }, { id: 'hf_palisade_stake', x: 44, y: 5 }, { id: 'hf_pike_stakes', x: 54, y: 8 }, { id: 'hf_tent_torn', x: 52, y: 10 }, { id: 'hf_pikes_fallen', x: 47, y: 9 }, { id: 'hf_helm_heap', x: 42, y: 9 },
    /* P5 the High Barrows: standing stones over the officers */
    { id: 'hf_standing_stone', x: 8, y: 5 }, { id: 'hf_standing_stone_leaning', x: 15, y: 5 }, { id: 'hf_kerb_ring', x: 10, y: 9 }, { id: 'skull', x: 17, y: 10 }, { id: 'bone_pile', x: 14, y: 10 }, { id: 'hf_standing_stone', x: 19, y: 6 },
    /* P2 the Low Barrows: the rank and file under the mounds */
    { id: 'hf_standing_stone', x: 45, y: 27 }, { id: 'hf_standing_stone_leaning', x: 51, y: 29 }, { id: 'hf_kerb_ring', x: 49, y: 33 }, { id: 'hf_palisade_stake', x: 42, y: 28 }, { id: 'hf_banded_shield', x: 53, y: 25 }, { id: 'skull', x: 43, y: 35 }, { id: 'bones', x: 55, y: 27 },
      /* the alder wall: the thicket is the wood; six oaks at the clearings' edges are the gather nodes, two a clearing (hunt-grounds.js) */
    { id: 'oak', x: 17, y: 36 }, { id: 'oak', x: 5, y: 34 }, { id: 'oak', x: 54, y: 6 }, { id: 'oak', x: 7, y: 8 }, { id: 'oak', x: 42, y: 5 }, { id: 'oak', x: 6, y: 5 },
  ]),
  buildings: Object.freeze([]),
  path: Object.freeze([[4, 29], [12, 29], [12, 31], [4, 31]]),
  spawns: Object.freeze([
    [10, 30], [11, 31], [10, 32], [9, 31], [11, 30], [11, 32], [9, 32], [9, 30],
    [28, 29], [29, 30], [28, 31], [27, 30], [29, 29], [29, 31], [27, 31], [27, 29],
    [49, 28], [50, 29], [49, 30], [48, 29], [50, 28], [50, 30], [48, 30], [48, 28],
    [29, 8], [30, 9], [29, 10], [28, 9], [30, 8], [30, 10], [28, 10], [28, 8],
    [48, 6], [49, 7], [48, 8], [47, 7], [49, 6], [49, 8], [47, 8], [47, 6],
    [15, 7], [16, 8], [15, 9], [14, 8], [16, 7], [16, 9], [14, 9], [14, 7],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 30, to: 'town_common' }]),
  start: Object.freeze([1, 30]),
  maskHash: '0ebf56a5',
});
