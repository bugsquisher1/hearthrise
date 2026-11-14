// src/data/grounds/muster_barrows/map.js — THE MUSTER BARROWS: the field of burial mounds in the alder wood behind Hask's Ford, where
// the Banded Company buried its officers and its rank and file and never burned them. Row shape and lint: src/world/core/map-compile.js.
// Rebuild the hash with `node tests/world-core.mjs --hashes` after changing what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID IS THE ART LANE'S, CELL FOR CELL (origin/lane/b-muster-barrows-art aac5732b1, art/briefs/muster-barrows-grid-2026-10-29.txt):
// the painted ground art/world/muster/muster_barrows_ground was laid from these rows, so a row moved here is a repaint there. The
// art lane's lint: 1,070 open tiles, every one in an open 3x3 and reachable from the road in. The road comes in from Hask's Ford on
// the west edge, y8-11. No river: larger clearings than the Ford's, joined by lanes three to five tiles wide.
//   '.' withered grass and the mud track (grass: the painter lays the March's grass, mud and barrow-turf tiles from the brief's PAINT rows)
//   '#' alder thicket, the barrow mounds and the reed beds (thicket: blocks a step and a shot)
// The clearings (the art lane's names; the packs standing in them are in ./pack.js `ground`):
//   the Muster Field       x1-19  y4-16   where the company mustered under Hask
//   the Long Barrows       x19-37 y13-29  the rank and file under two long mounds, a sunken lane between them
//   the Sergeants' Row     x34-58 y3-15   four round barrows, a sword before each: the Barrow Knights'
//   the Wet Hollow         x4-18  y24-38  a reed bed where the ground never dried, and the field's older dead
//   the Captain's Barrow   x37-57 y21-38  the great mound (x45-55 y31-36) and its forecourt: Captain Hask
//   the Biers              x19-33 y29-38  the company's dead laid out for a pyre nobody lit
//
// ART: IMPORTED, THE PACK STILL STAGED (lane/b-barrow-integrate 2026-11-14). The ground `muster_barrows_ground` and the set `muster`
// (art/world/muster, by path from origin/lane/b-muster-barrows-art aac5732b1 and built here) and the kit's `march` are loaded sets
// (src/data/world/region-kits.js barrow_march). `objects` places the brief's props at the brief's own tiles, every pull tile's 3x3
// in ./pack.js clear of all of them. NOT PLACED: the brief's nine alder-wall trees and four reed clumps (they stand on thicket cells,
// which the map lint keeps for the painted wood and reed bed), and its two `oak`. The four gather nodes are still `oak` stand-ins:
// the alder kind is drawn (art/world/common alder, brief 20) and waits on its GROUND_NODE_KINDS row (the designer's).
//
// `spawns` lists every pack tile at full density so the map lint proves each is open floor.
export default Object.freeze({
  id: 'muster_barrows',
  name: 'The Muster Barrows',
  kind: 'hunt',
  hunts: Object.freeze(['muster_barrows']),
  outdoor: true,
  light: 'day',
  ground: 'muster_barrows_ground',
  legend: Object.freeze({ '#': 'thicket', '.': 'grass' }),
  rows: Object.freeze([
    '############################################################', // 0
    '############################################################',
    '############################################################',
    '######################################...###################',
    '###############...####################...###################',
    '#######....................###########...###################', // 5
    '#######........................#######...###################',
    '#...##....................................##.......#########', //    the Muster Field, the Sergeants' Row
    '.......................................................#####', //    the road in from Hask's Ford
    '...................#########...........................#####',
    '...................#############.......................#####', // 10
    '...................#################...................#####',
    '###................##################..................#####',
    '###...............################.....................#####',
    '#####...............##...######.......##...............#####',
    '######...............#...######.......####..............####', // 15
    '#######........#.........######.....########............####',
    '#########......##.........######.....########...........####',
    '#########.....####..........####.....################...####', //    the Long Barrows
    '#########....######...........##.....###############....####',
    '#########...########................###############.....####', // 20
    '#########...#######................################.....####',
    '#########....######.................######....#####......###',
    '##########...######....###..........######.....####......###',
    '######...#...######....#####........######...............###',
    '####.........######....######........####................###', // 25 the Wet Hollow, the Captain's Barrow
    '####.........######....#######.........#.................###',
    '####..............#....##########.......................####',
    '####..............##....############...................#####',
    '#####....###......##....##############.................#####',
    '##############....###....###....######.................#####', // 30
    '######...#####......#............#####.........#############',
    '######...#####...................######.......##############', //    the Biers
    '######....####...................######......###############',
    '######.........###...........############....###############',
    '######.........########......############.....##############', // 35
    '#########......########......#############.....#############',
    '############...#########.....#############.....#############',
    '##########################...##############....#############',
    '############################################################',
  ]),
  faces: Object.freeze([]),
  objects: Object.freeze([
    /* the Muster Field */
    { id: 'bones', x: 12, y: 9 },
    { id: 'mu_weapon_rack', x: 8, y: 5 }, { id: 'mu_weapon_rack', x: 13, y: 5 }, { id: 'hf_pike_stakes', x: 16, y: 6 }, { id: 'mu_drum_split', x: 11, y: 7 },
    { id: 'mu_kerbstones', x: 7, y: 7 }, { id: 'hf_helm_heap', x: 6, y: 8 }, { id: 'mu_crates', x: 18, y: 10 }, { id: 'mu_standard_fallen', x: 5, y: 12 },
    { id: 'hf_tent_torn', x: 9, y: 13 }, { id: 'hf_pikes_fallen', x: 16, y: 12 },
    /* the Long Barrows */
    { id: 'skull', x: 34, y: 22 },
    { id: 'mu_barrow_door', x: 32, y: 18 }, { id: 'mu_sword_marker', x: 24, y: 14 }, { id: 'mu_sword_marker', x: 30, y: 26 }, { id: 'mu_urns', x: 23, y: 16 },
    { id: 'mu_grave_open', x: 33, y: 16 }, { id: 'mu_kerbstones', x: 30, y: 20 }, { id: 'mu_coffin_lid', x: 26, y: 22 },
    /* the Sergeants' Row */
    { id: 'mu_shields_leaning', x: 39, y: 6 }, { id: 'mu_sword_marker', x: 42, y: 8 }, { id: 'mu_sword_marker', x: 48, y: 7 }, { id: 'mu_sword_marker', x: 53, y: 8 },
    { id: 'mu_sword_marker', x: 54, y: 12 }, { id: 'mu_horse_skull', x: 45, y: 10 }, { id: 'mu_horse_skull', x: 51, y: 10 }, { id: 'hf_banded_shield', x: 42, y: 11 },
    { id: 'mu_grave_goods', x: 49, y: 9 },
    /* the Captain's Barrow */
    { id: 'bone_pile', x: 41, y: 33 }, { id: 'skull', x: 46, y: 24 },
    { id: 'mu_barrow_door', x: 50, y: 30 }, { id: 'mu_grave_goods', x: 53, y: 29 }, { id: 'mu_standard_fallen', x: 44, y: 31 }, { id: 'hf_standing_stone', x: 42, y: 26 },
    { id: 'hf_standing_stone', x: 44, y: 35 }, { id: 'hf_standing_stone_leaning', x: 55, y: 27 }, { id: 'mu_bier_unburned', x: 39, y: 29 }, { id: 'mu_cairn', x: 43, y: 22 },
    /* the Wet Hollow */
    { id: 'bones', x: 8, y: 35 },
    { id: 'hf_kerb_ring', x: 6, y: 26 }, { id: 'mu_urns', x: 15, y: 28 }, { id: 'mu_cairn', x: 12, y: 26 }, { id: 'mu_dead_hawthorn', x: 7, y: 33 },
    /* the Biers */
    { id: 'mu_bier_unburned', x: 30, y: 31 }, { id: 'mu_bier_unburned', x: 27, y: 34 }, { id: 'mu_bier_unburned', x: 24, y: 35 }, { id: 'hf_pyre_unlit', x: 31, y: 33 },
    { id: 'mu_coffin_lid', x: 26, y: 36 }, { id: 'mu_grave_open', x: 20, y: 33 }, { id: 'mu_dead_hawthorn', x: 19, y: 31 },
    /* the gather nodes (pack.js ground.gather): standing oaks, to swap for a March tree kind */
    { id: 'oak', x: 4, y: 13 }, { id: 'oak', x: 15, y: 14 }, { id: 'oak', x: 22, y: 18 }, { id: 'oak', x: 33, y: 24 },
  ]),
  buildings: Object.freeze([]),
  /* the patrol loop, on the road in */
  path: Object.freeze([[2, 9], [5, 9], [5, 11], [2, 11]]),
  spawns: Object.freeze([
    [9, 9], [10, 10], [9, 11], [8, 10], [10, 9], [10, 11], [8, 11], [8, 9],
    [9, 25], [10, 26], [9, 27], [8, 26], [10, 25], [10, 27], [8, 27], [8, 25],
    [25, 31], [26, 32], [25, 33], [24, 32], [26, 31], [26, 33], [24, 33], [24, 31],
    [26, 18], [27, 19], [26, 20], [25, 19], [27, 18], [27, 20], [25, 20], [25, 18],
    [40, 8], [41, 9], [40, 10], [39, 9], [41, 8], [41, 10], [39, 10], [39, 8],
    [51, 11], [52, 12], [51, 13], [50, 12], [52, 11], [52, 13], [50, 13], [50, 11],
    [48, 25], [49, 26], [48, 27], [47, 26], [49, 25], [49, 27], [47, 27], [47, 25],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 0, y: 9, to: 'town_common' }]),
  start: Object.freeze([1, 9]),
  maskHash: '34269664',
});
