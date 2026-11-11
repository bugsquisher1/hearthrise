// src/data/grounds/hasks_ford/map.js — HASK'S FORD: the crossing the Banded Company died holding. The Barrow March's first ground.
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing
// what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID (drawn by the art lane, art/briefs/hasks-ford-grid-2026-10-28.txt, and wired by the designer 2026-10-29; brought
// into a ground pack by lane/b-slake-and-ford, 2026-11-10, rows unchanged): the river comes in from the west, bends down
// through the Ford and leaves east. Two banks and ONE crossing, the Ford (x22-36, y18-24, shallows and two gravel bars).
// South of the river are the Pike Files (the road in from Wickstead), the Toll Stone and the Low Barrows. Over the Ford are
// the Company Stores, the Muster Line and the High Barrows. Every open tile lies in an open 3x3.
//
// ART: IMPORTED (lane/a-import-ford-art, 2026-11-10, from origin/lane/b-hasks-ford-art). The painted ground `hasks_ford_ground` and
// this ground's two signature pieces (hf_toll_stone, hf_ford_marker) are the set `ford`; the 14 hf_ kit props and the four bodies
// are the set `march` (src/data/world/region-kits.js barrow_march). The hf_ props stand on the tiles the art lane's grid gave
// them, so the mask hash is the old lane's 0ebf56a5 again (the fixtures block a step; pull tiles and pack rings were checked
// clear of them on 10-29). STILL A STAND-IN: the six gather oaks. The March kit keeps oak out, but a gather node draws its
// node kind's sprite (tests/hunt-core/forest-cave.mjs gather-nodes: an oak_tree node needs an `oak` on its tile), so they swap
// the day a March tree node kind exists (the designer's row in src/data/gathering.js), not before.
//
// The pockets, packs, pull tiles and route are in ./pack.js `ground`. `spawns` here lists every pack tile at full density so
// the map lint proves each is open floor.
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
    /* P0 the Pike Files: the company died in its files and nobody burned them */
    { id: 'bones', x: 7, y: 33 }, { id: 'skull', x: 16, y: 35 }, { id: 'mb_fallen_log', x: 4, y: 32 },
    /* P1 the Toll Stone: where Hask took the coin for the ford */
    { id: 'coins_scattered', x: 24, y: 28 }, { id: 'bone_pile', x: 33, y: 34 },
    /* the Ford: stepping stones over the bars, reeds at the water */
    { id: 'mb_stepping_stones', x: 27, y: 19 }, { id: 'mb_stepping_stones', x: 30, y: 23 }, { id: 'mb_reeds', x: 19, y: 18 }, { id: 'mb_reeds', x: 35, y: 18 },
    { id: 'mb_reeds', x: 11, y: 14 }, { id: 'mb_reeds', x: 46, y: 14 }, { id: 'mb_reeds', x: 5, y: 17 }, { id: 'mb_reeds', x: 51, y: 18 }, { id: 'mb_reeds', x: 40, y: 21 },
    { id: 'mb_reeds', x: 18, y: 22 },
    /* P3 the Company Stores: the company's broken stores */
    { id: 'hf_stores_heap', x: 24, y: 9 }, { id: 'barrels', x: 31, y: 9 }, { id: 'barrel_broken', x: 37, y: 11 }, { id: 'sack_pile', x: 26, y: 11 }, { id: 'cart_wheel', x: 33, y: 13 },
    /* P5 the High Barrows: the officers */
    { id: 'skull', x: 17, y: 10 }, { id: 'bone_pile', x: 14, y: 10 },
    /* P2 the Low Barrows: the rank and file under the mounds */
    { id: 'skull', x: 43, y: 35 }, { id: 'bones', x: 55, y: 27 },
    /* THE COMPANY'S DEAD (art/world/march hf_*, the Barrow March kit; the Toll Stone and the Ford Marker are this ground's
       signature, art/world/ford). Each on the tile the art lane's grid gave it (art/briefs/hasks-ford-grid-2026-10-28.txt). */
    { id: 'hf_pyre_unlit', x: 9, y: 34 }, { id: 'hf_pike_stakes', x: 5, y: 27 }, { id: 'hf_pike_stakes', x: 14, y: 33 }, { id: 'hf_pikes_fallen', x: 11, y: 28 },
    { id: 'hf_banded_shield', x: 13, y: 36 },
    { id: 'hf_toll_stone', x: 23, y: 26 }, { id: 'hf_ford_marker', x: 32, y: 26 }, { id: 'hf_helm_heap', x: 21, y: 33 }, { id: 'hf_pike_stakes', x: 35, y: 28 },
    { id: 'hf_rowboat_sunk', x: 22, y: 19 },
    { id: 'hf_tent_torn', x: 25, y: 5 }, { id: 'hf_stores_heap', x: 33, y: 7 }, { id: 'hf_wagon_tipped', x: 35, y: 12 },
    { id: 'hf_palisade_broken', x: 46, y: 4 }, { id: 'hf_palisade_stake', x: 50, y: 3 }, { id: 'hf_palisade_stake', x: 44, y: 5 }, { id: 'hf_pike_stakes', x: 54, y: 8 },
    { id: 'hf_tent_torn', x: 52, y: 10 }, { id: 'hf_pikes_fallen', x: 47, y: 9 }, { id: 'hf_helm_heap', x: 42, y: 9 },
    { id: 'hf_standing_stone', x: 8, y: 5 }, { id: 'hf_standing_stone', x: 19, y: 6 }, { id: 'hf_standing_stone_leaning', x: 15, y: 5 }, { id: 'hf_kerb_ring', x: 10, y: 9 },
    { id: 'hf_standing_stone', x: 45, y: 27 }, { id: 'hf_standing_stone_leaning', x: 51, y: 29 }, { id: 'hf_kerb_ring', x: 49, y: 33 }, { id: 'hf_palisade_stake', x: 42, y: 28 },
    { id: 'hf_banded_shield', x: 53, y: 25 },
    /* the gather nodes (pack.js ground.gather): six oaks at the clearings' edges, two a clearing */
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
