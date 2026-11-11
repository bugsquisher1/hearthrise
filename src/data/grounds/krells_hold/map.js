// src/data/grounds/krells_hold/map.js — KRELL'S HOLD: Lord Krell's castle at the top of the Stokers' cart road, the Barrow March's last
// ground. Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing
// what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID (lane/b-krells-hold-pack, from the designer's "2026-11-10 Krell's Hold" section 1). A small gray castle in good repair. The
// cart road comes up the hill from the Pyre Field at the south (x27-31) and in through the gatehouse. The route is the castle's five
// rooms in order and out the back: 1 the Cart Gate (the gate court), 2 the Drill Yard (the big yard, the woodyard that fed the pyres),
// 3 the Chapel (where the Fire Priests wrote the rite), 4 the Crypt (the cellar where the dug-up officers stand), 5 the Tower Stairs (the
// way up into the keep), then down the back gate and round the outside of the east wall to the gate. Every corridor is at least
// three tiles wide, so no tile is a choke (checked: every open tile lies in an open 3x3) and the pack declares no bridge.
//   '#' the castle's dressed stone and the hill (rock: blocks a step and a shot)
//   '.' cobble: the gate court and the Drill Yard
//   ':' earth: the cart road up from the Pyre Field
//   'f' flagstone: the Chapel, its doors, and the Tower Stairs
//   's' setts: the Crypt's floor and its stair up into the keep
//   '=' planks: Krell's Hall, x41-56 y1-6, and its door, x47-49 y6-10. NOT ON THE ROUTE. Its fight is a called room behind a Hall
//       Key (pack.js `hall`), so on a hunt the hall stands empty
//   'g' gravel: the back gate and the path outside the east wall
//
// ART: STAGED, NOTHING DRAWN. The ground `krells_hold_ground` is to be painted from these rows on five chained tilesets (cart road and
// gate dirt, yard cobble, chapel flags, crypt stone, hall boards) with gray dressed stone wall slices (a feature every 6 tiles: an
// arrow loop, a torch or a buttress). Only the two coal seams below are placed, because none of the Hold's props exists in an atlas: the gatehouse and
// portcullis at (27-31, 37), the Hall Fire along the hall's north wall, and the fourteen props of the art brief (the board's section 7)
// go on once their sets load. The Crypt wants an Emberstone Vein, which has no node kind or sprite yet (the Pyre Field's flag).
export default Object.freeze({
  id: 'krells_hold',
  name: 'Krell\'s Hold',
  kind: 'hunt',
  hunts: Object.freeze(['krells_hold']),
  outdoor: true,
  light: 'day',
  ground: 'krells_hold_ground',
  legend: Object.freeze({ '#': 'rock', '.': 'cobble', ':': 'earth', f: 'flagstone', s: 'setts', '=': 'planks', g: 'gravel' }),
  rows: Object.freeze([
    '############################################################',
    '#########################################================###',
    '#########################################================###',
    '####fffffffffffffff######################================###',
    '####fffffffffffffff#####sssssssssssssss##================###',
    '####fffffffffffffff#####sssssssssssssss##================###',
    '####fffffffffffffffffffffssssssssssssss##================###',
    '####fffffffffffffffffffffssssssssssssss########===##########',
    '####fffffffffffffffffffffssssssssssssssssss####===##########',
    '####fffffffffffffffffffffssssssssssssssssss####===##########',
    '####fffffffffffffff#####sssssssssssssssssssffff===fffff#####',
    '####fffffffffffffff#####sssssssssssssssssssffffffffffff#####',
    '#########fffff##########sssssssssssssss###fffffffffffff#####',
    '#########fffff############################fffffffffffff#####',
    '####.....fffff...........#################fffffffffffff#####',
    '####.....................#################fffffffffffff#####',
    '####.....................#################fffffffffffff#####',
    '####.....................#################fffffffffffff#####',
    '####.....................#################fffffffffffff#####',
    '####.....................#################fffffffffffff#####',
    '####.....................#################ffffgggggffff#####',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####.....................#####################ggggg#########',
    '####################.....#####################ggggg#########',
    '####################................ggggggggggggggg#########',
    '####################................ggggggggggggggg#########',
    '######################..............ggggggggggggggg#########',
    '######################..............ggggggggggggggg#########',
    '######################..............ggggggggggggggg#########',
    '######################...............#######################',
    '######################...............#######################',
    '######################...............#######################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
  ]),
  faces: Object.freeze([]),
  /* the gather nodes (pack.js ground.gather): two coal seams in the Crypt's north wall, standing in for the Emberstone Vein the cellar
     rock should hold (gathering.js emberstone_rock has no node kind or sprite yet, the Pyre Field's flag) */
  objects: Object.freeze([{ id: 'cw_coal_seam', x: 28, y: 4 }, { id: 'cw_coal_seam', x: 35, y: 4 }]),
  buildings: Object.freeze([]),
  /* the patrol loop, on the cart road below the gate */
  path: Object.freeze([[28, 39], [30, 39], [30, 41], [28, 41]]),
  /* every pack tile at full density, the ring of 8 round each pocket's pull tile (pack.js), in pocket order */
  spawns: Object.freeze([
    [29, 32], [30, 33], [29, 34], [28, 33], [30, 32], [30, 34], [28, 34], [28, 32],
    [14, 20], [15, 21], [14, 22], [13, 21], [15, 20], [15, 22], [13, 22], [13, 20],
    [11, 6], [12, 7], [11, 8], [10, 7], [12, 6], [12, 8], [10, 8], [10, 6],
    [31, 7], [32, 8], [31, 9], [30, 8], [32, 7], [32, 9], [30, 9], [30, 7],
    [48, 14], [49, 15], [48, 16], [47, 15], [49, 14], [49, 16], [47, 16], [47, 14],
  ]),
  stations: Object.freeze({}),
  exits: Object.freeze([{ x: 29, y: 43, to: 'town_common' }]),
  start: Object.freeze([29, 42]),
  maskHash: '7e0cba14',
});
