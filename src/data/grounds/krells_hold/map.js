// src/data/grounds/krells_hold/map.js — KRELL'S HOLD: Lord Krell's castle at the top of the Stokers' cart road, the Barrow March's last
// ground. Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes` after changing
// what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID (lane/b-krells-hold-pack, from the designer's "2026-11-10 Krell's Hold" section 1). A small gray castle in good repair. The
// cart road comes up the hill from the Pyre Field at the south (x27-31) and in through the gatehouse. The route is the castle's five
// rooms in order and out the back: 1 the Cart Gate (the gate court), 2 the Drill Yard (the big yard, the woodyard that fed the pyres),
// 3 the Chapel (where the Pyre Priests wrote the rite), 4 the Crypt (the cellar where the dug-up officers stand), 5 the Tower Stairs (the
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
// ART: DRAWN (lane/b-barrow-art-import 2026-11-14, set `hold`). The ground `krells_hold_ground` is painted from these rows on the kit's
// hold family (cart road earth, cobble, flagstone, setts, the hall's boards, gravel) with the gray dressed stone wall slices laid over
// the paint (a feature every 6 tiles: an arrow loop, a torch or a buttress). Placed: the two coal seams, and in the hall the Hall Fire
// with its two banners. THE HILL (lane/b-hold-art): the rock outside the walls in the south half is painted as the March's grass and
// gray hill rock (barrow-grounds.mjs holdCastle), so the cart road climbs a hill to the castle; it still blocks a step. THE GATE: the
// road narrows to x28-30 at y38-39, the gatehouse (class gate) stands over it with its towers on (27,38-39) and (31,38-39), cells
// lane/d-hold-pass may move. THE FINISH (lane/b-march-floors): gravel worn into the courts, flagstone relaid in the Crypt, kept
// decals baked into the paint, the keep's mass roofed in slate, the hill on all four sides, the gate's arch open (units in it show),
// and Krell's red hung on three inner faces (kh_banner_hung, class hanging). STILL TO PLACE, each needing cells from the pack (a solid piece moves the mask): the other props of the
// art brief (the board's section 7), all drawn in set `hold`. The Crypt wants an Emberstone Vein, which has no node kind or sprite yet (the Pyre Field's flag).
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
    '############################:::#############################', // 38 the gate: its towers on (27,38-39) and (31,38-39)
    '############################:::#############################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
    '###########################:::::############################',
  ]),
  faces: Object.freeze([]),
  /* the gather nodes (pack.js ground.gather): two coal seams in the Crypt's north wall, standing in for the Emberstone Vein the cellar
     rock should hold (gathering.js emberstone_rock has no node kind or sprite yet, the Pyre Field's flag) */
  objects: Object.freeze([{ id: 'cw_coal_seam', x: 28, y: 4 }, { id: 'cw_coal_seam', x: 35, y: 4 },
    /* Krell's Hall, off the route: the Hall Fire along the north wall behind his seat, his red on one side of it and the Banded
       Company's colors hung upside down on the other */
    { id: 'kh_hall_fire', x: 47, y: 1 }, { id: 'kh_banner_stand', x: 45, y: 1 }, { id: 'kh_colors_upside_down', x: 52, y: 1 },
    /* the cart gate (lane/b-hold-art): the gatehouse's anchor is the middle of its three-tile passage (class gate, open), its towers
       on the rock cells (27,38-39) and (31,38-39); lane/d-hold-pass may move these cells */
    { id: 'kh_gatehouse', x: 29, y: 39 },
    /* Krell's red hung on the inner faces (lane/b-march-floors; class hanging, open: no cell of the pack moves), in pairs either side
       of a face's arrow loop or torch: the Drill Yard's north wall, the keep's south face over the yard, the Chapel's north wall */
    { id: 'kh_banner_hung', x: 16, y: 13 }, { id: 'kh_banner_hung', x: 18, y: 13 },
    { id: 'kh_banner_hung', x: 27, y: 29 }, { id: 'kh_banner_hung', x: 29, y: 29 }, { id: 'kh_banner_hung', x: 39, y: 29 }, { id: 'kh_banner_hung', x: 41, y: 29 },
    { id: 'kh_banner_hung', x: 9, y: 2 }, { id: 'kh_banner_hung', x: 11, y: 2 }]),
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
  maskHash: 'ad75fd7a',
});
