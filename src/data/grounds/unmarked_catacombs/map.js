// src/data/grounds/unmarked_catacombs/map.js — UNMARKED CATACOMBS: the vaults under Havora's Great Hearth where the Keepers laid the dead nobody
// could pay to burn. Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing
// what blocks a step. Shape of the pack: src/data/grounds/shape.js. Design: the board's "2026-11-15 Unmarked Catacombs" (lane/d-catacombs).
//
// THE GRID (lane/d-catacombs, drawn new: rooms and corridors under the town, not an open field). In from the Night Carters' tunnel off the
// Sewer side (x2-4, north edge), the route is six rooms and back up the hoist shaft:
//   1 the Carters' Cut (x2-15 y5-13), where they broke through the vault wall
//   2 the Long Gallery (x22-55 y3-9), a candle at the foot of the wall for every few names, six pillars down the middle
//   3 the Bone Room (x44-57 y13-24), the ossuary: the old bones stacked to make room, four pillars, a brazier in each corner
//   4 the Flooded Vault (x20-37 y14-29), the lowest vault, where the river seeps in: standing water, two causeways and the bier platform
//   then THE PLANK BRIDGE (x28 y27-32), the one 1-tile choke, over the deep water down to
//   5 the Keepers' Room (x24-44 y33-41), where Keeper Dunn reads the Wood Book by candlelight
//   6 the Loading Vault (x2-12 y22-38), the Carters' yard under the hoist shaft, then up the shaft passage (x3-5) to the Cut.
// Every other passage is at least three tiles wide (checked: every open tile but the bridge lies in an open 3x3).
//   '#' rock (the vault walls and the pillars)   '.' flagstone (the vault floors)   ':' earth (the Carters' tunnel, the Cut and their yard)
//   's' setts (the Keepers' Room)   '~' water (standing water: blocks a step, not a shot)   '=' planks (the bridge)
//
// LIGHT: 'cellar' (dark, the hero carries a lamp, src/world/core/compose.js). Each room is lit its own way, on purpose: the Carters' torches
// in the Cut and the yard, a long row of small candle pools down the Gallery, four braziers in the Bone Room, NOTHING in the Flooded Vault but
// the hero's lamp and four candles on the bier, and a ring of candles in the Keepers' Room. Walking it goes warm, small and many, warm, black,
// then candlelight.
//
// STAGED. The ground is its own vault floor (lane/a-catacomb-art 2026-11-17: `unmarked_catacombs_ground`, set vault, painted from these rows
// by tools/world-art/catacomb-ground.mjs, its walls laid into the paint), and its two signature pieces stand: Dunn's Wood Book in the Keepers'
// Room, north of his pocket, and the ossuary hung on the Bone Room's faces (uc_ossuary_wall, class hanging: no step is blocked). The rest are
// Greenhaven kit props standing in for the vault kit the art list still owes (the board's section 8): the niche candles, the bier, the hoist.
export default Object.freeze({
  id: 'unmarked_catacombs',
  name: 'Unmarked Catacombs',
  kind: 'hunt',
  /* the hunting ground first (the map's own), then the descent's two wings fought in its rooms (src/data/hunt-grounds.js TOWER_GROUNDS: the
     Flooded Vault and the Bone Room, one pocket each; lane/c-catacombs) */
  hunts: Object.freeze(['unmarked_catacombs', 'unmarked_flooded_wing', 'unmarked_bone_wing']),
  outdoor: false,
  light: 'cellar',
  ground: 'unmarked_catacombs_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'flagstone', ':': 'earth', s: 'setts', '~': 'water', '=': 'planks' }),
  rows: Object.freeze([
    '##:::#######################################################', // 0
    '##:::#######################################################',
    '##:::#######################################################',
    '##:::#################..................................####',
    '##:::#################..................................####',
    '##::::::::::::::######..................................####', // 5
    '##::::::::::::::######....#...#...#.......#...#...#.....####',
    '##::::::::::::::........................................####',
    '##::::::::::::::........................................####',
    '##::::::::::::::........................................####',
    '##::::::::::::::#################################...########', // 10
    '##::::::::::::::#################################...########',
    '##::::::::::::::#################################...########',
    '##::::::::::::::############################..............##',
    '###:::##############~~~~~~~...~~~~~~~~######..............##',
    '###:::##############~~~~~~~...~~~~~~~~######..............##', // 15
    '###:::##############~~~~~~~...~~~~~~~~######...#......#...##',
    '###:::##############......................................##',
    '###:::##############......................................##',
    '###:::##############......................................##',
    '###:::##############~~~~~~~...~~~~~~~~######..............##', // 20
    '###:::##############~~~~~~~...~......~######...#......#...##',
    '##:::::::::::#######~~~~~~~...~......~######..............##',
    '##:::::::::::#######~~~~~~~..........~######..............##',
    '##:::::::::::#######~~~~~~~..........~######..............##',
    '##:::::::::::#######~~~~~~~..........~######################', // 25
    '##:::::::::::#######~~~~~~~...~......~######################',
    '##:::::::::::#######~~~~~~~~=~~~~~~~~~######################',
    '##:::::::::::#######~~~~~~~~=~~~~~~~~~######################',
    '##:::::::::::#######~~~~~~~~=~~~~~~~~~######################',
    '##:::::::::::#########~~~~~~=~~~~~~~~~######################', // 30
    '##:::::::::::#########~~~~~~=~~~~~~~~~######################',
    '##:::::::::::#########~~~~~~=~~~~~~~~~######################',
    '##:::::::::::###########sssssssssssssssssssss###############',
    '##:::::::::::###########sssssssssssssssssssss###############',
    '##:::::::::::...........sssssssssssssssssssss###############', // 35
    '##:::::::::::...........sssssssssssssssssssss###############',
    '##:::::::::::...........ssssss#sssssss#ssssss###############',
    '##:::::::::::###########sssssssssssssssssssss###############',
    '########################sssssssssssssssssssss###############',
    '########################sssssssssssssssssssss###############', // 40
    '########################sssssssssssssssssssss###############',
    '############################################################',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    { id: 'cw_gold_seam', x: 2, y: 7 }, { id: 'cw_gold_seam', x: 2, y: 11 }, { id: 'wall_torch', x: 6, y: 4 }, { id: 'wall_torch', x: 12, y: 4 },
    { id: 'collapsed_cart', x: 14, y: 12 }, { id: 'sack_pile', x: 14, y: 6 }, { id: 'sack_pile', x: 13, y: 6 }, { id: 'corner_rubble', x: 15, y: 5 },
    { id: 'corner_rubble', x: 3, y: 12 }, { id: 'exposed_dirt', x: 5, y: 11 }, { id: 'exposed_dirt', x: 12, y: 10 }, { id: 'cw_rubble', x: 15, y: 8 },
    { id: 'candle', x: 24, y: 3 }, { id: 'candle', x: 27, y: 3 }, { id: 'candle', x: 30, y: 3 }, { id: 'candle', x: 33, y: 3 },
    { id: 'candle', x: 36, y: 3 }, { id: 'candle', x: 40, y: 3 }, { id: 'candle', x: 43, y: 3 }, { id: 'candle', x: 46, y: 3 },
    { id: 'candle', x: 52, y: 3 }, { id: 'candle', x: 55, y: 3 }, { id: 'candle', x: 26, y: 9 }, { id: 'candle', x: 30, y: 9 },
    { id: 'candle', x: 34, y: 9 }, { id: 'candle', x: 42, y: 9 }, { id: 'candle', x: 46, y: 9 }, { id: 'candle', x: 54, y: 9 },
    { id: 'web', x: 23, y: 2 }, { id: 'web', x: 48, y: 2 }, { id: 'hanging_chains', x: 31, y: 2 }, { id: 'hanging_chains', x: 44, y: 2 },
    { id: 'skull', x: 25, y: 5 }, { id: 'skull', x: 33, y: 8 }, { id: 'skull', x: 45, y: 4 }, { id: 'skull', x: 53, y: 7 },
    { id: 'bone_pile', x: 28, y: 8 }, { id: 'bone_pile', x: 44, y: 8 }, { id: 'bone_pile', x: 52, y: 4 }, { id: 'cracked_flagstone', x: 36, y: 8 },
    { id: 'cracked_flagstone', x: 48, y: 5 }, { id: 'brazier', x: 45, y: 14 }, { id: 'brazier', x: 56, y: 14 }, { id: 'brazier', x: 45, y: 23 },
    { id: 'brazier', x: 56, y: 23 }, { id: 'wall_torch', x: 52, y: 12 }, { id: 'bone_pile', x: 44, y: 15 }, { id: 'bone_pile', x: 44, y: 19 },
    { id: 'bone_pile', x: 57, y: 17 }, { id: 'bone_pile', x: 57, y: 20 }, { id: 'bone_pile', x: 46, y: 24 }, { id: 'bone_pile', x: 52, y: 24 },
    { id: 'bone_pile', x: 55, y: 13 }, { id: 'skull', x: 48, y: 14 }, { id: 'skull', x: 53, y: 23 }, { id: 'skull', x: 57, y: 22 },
    { id: 'skull', x: 44, y: 21 }, { id: 'bones', x: 49, y: 22 }, { id: 'bones', x: 52, y: 15 }, { id: 'bones', x: 55, y: 19 },
    { id: 'pipe_outflow', x: 28, y: 13 }, { id: 'drowned_lantern', x: 22, y: 15 }, { id: 'drowned_lantern', x: 34, y: 15 }, { id: 'drowned_lantern', x: 24, y: 23 },
    { id: 'drowned_lantern', x: 35, y: 29 }, { id: 'moss_puddle', x: 22, y: 18 }, { id: 'moss_puddle', x: 33, y: 18 }, { id: 'moss_puddle', x: 28, y: 24 },
    { id: 'cw_puddle', x: 28, y: 15 }, { id: 'cw_puddle', x: 36, y: 17 }, { id: 'candle', x: 31, y: 21 }, { id: 'candle', x: 36, y: 21 },
    { id: 'candle', x: 31, y: 26 }, { id: 'candle', x: 36, y: 26 }, { id: 'cw_plank_bridge', x: 28, y: 27 }, { id: 'cw_plank_bridge', x: 28, y: 29 },
    { id: 'cw_plank_bridge', x: 28, y: 31 }, { id: 'candle', x: 31, y: 33 }, { id: 'candle', x: 33, y: 33 }, { id: 'candle', x: 35, y: 33 },
    { id: 'candle', x: 37, y: 33 }, { id: 'candle', x: 25, y: 34 }, { id: 'candle', x: 43, y: 34 }, { id: 'candle', x: 25, y: 40 },
    { id: 'candle', x: 43, y: 40 }, { id: 'hanging_chains', x: 39, y: 32 }, { id: 'hanging_chains', x: 43, y: 32 }, { id: 'coins_scattered', x: 34, y: 34 },
    { id: 'coins_scattered', x: 30, y: 40 }, { id: 'skull', x: 37, y: 40 }, { id: 'skull', x: 26, y: 37 }, { id: 'cracked_flagstone', x: 32, y: 41 },
    { id: 'cracked_flagstone', x: 42, y: 37 }, { id: 'ladder', x: 8, y: 21 }, { id: 'wall_torch', x: 11, y: 21 }, { id: 'collapsed_cart', x: 10, y: 24 },
    { id: 'sack_stack', x: 2, y: 23 }, { id: 'sack_stack', x: 2, y: 24 }, { id: 'sack_stack', x: 2, y: 37 }, { id: 'sack_stack', x: 11, y: 37 },
    { id: 'sack_pile', x: 12, y: 33 }, { id: 'sack_pile', x: 2, y: 30 }, { id: 'sack_pile', x: 12, y: 27 }, { id: 'barrels', x: 12, y: 22 },
    { id: 'barrel_broken', x: 3, y: 35 }, { id: 'straw', x: 6, y: 25 }, { id: 'straw', x: 9, y: 35 }, { id: 'loot_bag', x: 11, y: 30 },
    /* the signature pieces: the Wood Book where Dunn reads it, and the ossuary on the Bone Room's north faces and its four pillars (its torch
       keeps 52,12) */
    { id: 'uc_wood_book', x: 34, y: 35 },
    { id: 'uc_ossuary_wall', x: 44, y: 12 }, { id: 'uc_ossuary_wall_b', x: 45, y: 12 }, { id: 'uc_ossuary_wall_c', x: 46, y: 12 },
    { id: 'uc_ossuary_wall', x: 47, y: 12 }, { id: 'uc_ossuary_wall_b', x: 48, y: 12 }, { id: 'uc_ossuary_wall_c', x: 53, y: 12 },
    { id: 'uc_ossuary_wall', x: 54, y: 12 }, { id: 'uc_ossuary_wall_b', x: 55, y: 12 }, { id: 'uc_ossuary_wall_c', x: 56, y: 12 },
    { id: 'uc_ossuary_wall', x: 57, y: 12 }, { id: 'uc_ossuary_wall_b', x: 47, y: 16 }, { id: 'uc_ossuary_wall_c', x: 54, y: 16 },
    { id: 'uc_ossuary_wall', x: 47, y: 21 }, { id: 'uc_ossuary_wall_b', x: 54, y: 21 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop, in the Carters' Cut by the tunnel mouth */
  path: Object.freeze([[3, 6], [7, 6], [7, 7], [3, 7]]),
  /* every pack tile at full density, the ring of 8 round each pocket's pull tile (pack.js), in pocket order */
  spawns: Object.freeze([
    [9, 8], [10, 9], [9, 10], [8, 9], [10, 8], [10, 10], [8, 10], [8, 8],
    [38, 5], [39, 6], [38, 7], [37, 6], [39, 5], [39, 7], [37, 7], [37, 5],
    [50, 17], [51, 18], [50, 19], [49, 18], [51, 17], [51, 19], [49, 19], [49, 17],
    [28, 18], [29, 19], [28, 20], [27, 19], [29, 18], [29, 20], [27, 20], [27, 18],
    [34, 36], [35, 37], [34, 38], [33, 37], [35, 36], [35, 38], [33, 38], [33, 36],
    [7, 29], [8, 30], [7, 31], [6, 30], [8, 29], [8, 31], [6, 31], [6, 29],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 3, y: 0, to: 'town_common' }]),
  start: Object.freeze([3, 1]),
  maskHash: 'b34acba6',
});
