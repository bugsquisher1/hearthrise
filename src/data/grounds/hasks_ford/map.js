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
// ART: STAGED. The painted ground `hasks_ford_ground` and the hf_ props are on origin/lane/b-hasks-ford-art (art/world/march)
// and are not in this tree, so this row places only props that are loaded today. THE ART IMPORT PUTS THESE BACK, each on its
// tile, and re-pins maskHash (the fixtures block a step; the pull tiles and pack rings were checked clear of them on 10-29).
// Today's hash 7abd1b42 is the grid without them. With them it was 0ebf56a5 on the old lane. The oaks are stand-ins too: the
// March kit keeps oak out, so the import swaps them for a March tree (the art lane's note names westwood_ash or mu_dead_hawthorn).
//   P0 the Pike Files     hf_pyre_unlit 9,34 · hf_pike_stakes 5,27 and 14,33 · hf_pikes_fallen 11,28 · hf_banded_shield 13,36
//   P1 the Toll Stone     hf_toll_stone 23,26 · hf_ford_marker 32,26 · hf_helm_heap 21,33 · hf_pike_stakes 35,28 · hf_rowboat_sunk 22,19
//   P3 the Company Stores hf_tent_torn 25,5 · hf_stores_heap 33,7 · hf_wagon_tipped 35,12
//   P4 the Muster Line    hf_palisade_broken 46,4 · hf_palisade_stake 50,3 and 44,5 · hf_pike_stakes 54,8 · hf_tent_torn 52,10
//                         · hf_pikes_fallen 47,9 · hf_helm_heap 42,9
//   P5 the High Barrows   hf_standing_stone 8,5 and 19,6 · hf_standing_stone_leaning 15,5 · hf_kerb_ring 10,9
//   P2 the Low Barrows    hf_standing_stone 45,27 · hf_standing_stone_leaning 51,29 · hf_kerb_ring 49,33 · hf_palisade_stake 42,28
//                         · hf_banded_shield 53,25
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
    { id: 'crates', x: 24, y: 9 }, { id: 'barrels', x: 31, y: 9 }, { id: 'barrel_broken', x: 37, y: 11 }, { id: 'sack_pile', x: 26, y: 11 }, { id: 'cart_wheel', x: 33, y: 13 },
    /* P5 the High Barrows: the officers */
    { id: 'skull', x: 17, y: 10 }, { id: 'bone_pile', x: 14, y: 10 },
    /* P2 the Low Barrows: the rank and file under the mounds */
    { id: 'skull', x: 43, y: 35 }, { id: 'bones', x: 55, y: 27 },
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
  maskHash: '7abd1b42',
});
