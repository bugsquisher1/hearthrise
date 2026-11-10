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
// ART: STAGED. The ground `muster_barrows_ground` and the sets `march` and `muster` are on the art lane and load when the pack's
// Phase 0 merges them (src/data/world/region-kits.js barrow_march). Placed below: only the brief's props that are on a loaded set
// (not its nine alder-wall trees or its four reed clumps: they stand on thicket cells, which the map lint keeps for the painted wood and reed bed, so the art import settles them; its two `oak` become `westwood_ash`, region-kits.js). WAITING ON THEIR SETS, at
// the brief's own tiles (the art import places them and rebuilds the hash; every pull tile's 3x3 in ./pack.js is clear of all of them):
//   the Muster Field: mu_weapon_rack 8,5 and 13,5; hf_pike_stakes 16,6; mu_drum_split 11,7; mu_kerbstones 7,7; hf_helm_heap 6,8;
//     mu_crates 18,10; mu_standard_fallen 5,12; hf_tent_torn 9,13; hf_pikes_fallen 16,12
//   the Long Barrows: mu_barrow_door 32,18 (the ground's signature); mu_sword_marker 24,14 and 30,26; mu_urns 23,16; mu_grave_open 33,16;
//     mu_kerbstones 30,20; mu_coffin_lid 26,22
//   the Sergeants' Row: mu_shields_leaning 39,6; mu_sword_marker 42,8, 48,7, 53,8 and 54,12; mu_horse_skull 45,10 and 51,10;
//     hf_banded_shield 42,11; mu_grave_goods 49,9
//   the Captain's Barrow: mu_barrow_door 50,30; mu_grave_goods 53,29; mu_standard_fallen 44,31; hf_standing_stone 42,26 and 44,35;
//     hf_standing_stone_leaning 55,27; mu_bier_unburned 39,29; mu_cairn 43,22
//   the Wet Hollow: hf_kerb_ring 6,26; mu_urns 15,28; mu_cairn 12,26; mu_dead_hawthorn 7,33
//   the Biers: mu_bier_unburned 30,31, 27,34 and 24,35; hf_pyre_unlit 31,33; mu_coffin_lid 26,36; mu_grave_open 20,33; mu_dead_hawthorn 19,31
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
    /* the Long Barrows */
    { id: 'skull', x: 34, y: 22 },
    /* the Captain's Barrow */
    { id: 'bone_pile', x: 41, y: 33 }, { id: 'skull', x: 46, y: 24 },
    /* the Wet Hollow */
    { id: 'bones', x: 8, y: 35 },
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
  maskHash: '6bfb7141',
});
