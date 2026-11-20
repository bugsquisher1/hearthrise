// src/data/grounds/ox_road/map.js — THE OX ROAD: the last ore wagons out of Morrow, stopped nose to tail on the road where its bridge went down
// (lane/b-morrow-kit 2026-11-19). Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with `node tests/world-core.mjs --hashes`
// after changing what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID: LAYOUT A (Tyler's pick 2026-11-19, art/review/morrow-kit/ox-road-sketches/A-jam-at-the-broken-bridge.png, cells exported from that
// sketch by .scratch/kit/ox-mkmap.mjs): one long road. It comes in from Carter's Rest at the west (rows 20-22) where the hero starts by
// Holly's Vigil (her brazier and wood stack on the north verge), and runs east to the bridge over the stream (x44-49, rows 21-23), its middle
// span down (x46-48 water). The train stands nose to tail on the road facing west, the crossing that never opened; its last wagon went
// through the broken span. A turnout south of the road by the start, a ford below the bridge (rows 28-30), and the coal runners' path from
// the ford up the hill to the north edge, its two coal seams by the path. Crags frame the corners.
// The route is the pack's six pockets in order: 1 the Turnout, 2 the Yoke, 3 the Wagon Line, 4 the Broken Bridge, 5 the Coal Path,
// 6 the Lead Wagon. A lap walks about 87 tiles (the sketch's measure; Carter's Rest as built walks 162).
//   '#' crag (blocks a step and a shot)   ',' the open moor (earth)   ':' the road and its turnout   'j' the coal path
//   '~' the stream (water)   'o' the ford's stones (gravel)   '=' the bridge's planks
//
// ART: set `morrow` (tools/world-art/morrow-grounds.mjs ground ox_road): the ground `ox_road_ground` painted from these rows on the Morrow
// Hills kit. The floors are dim (art/briefs/morrow-hills-art-rules.txt 1): no pocket stands on bright grass.
export default Object.freeze({
  "id": "ox_road",
  "name": "The Ox Road",
  "kind": "hunt",
  "hunts": ["ox_road"],
  "outdoor": true,
  "light": "day",
  "ground": "ox_road_ground",
  "legend": {"#":"rock",",":"earth",":":"earth","j":"earth","~":"water","o":"gravel","=":"planks"},
  "rows": [
    "#########################,,,,j,,,,,,,,,,,,,,,,~~~~##########",
    "########################,,,,,j,,,,,,,,,,,,,,,,~~~~##########",
    "############,,,,####,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~##########",
    "############,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~#########",
    "###########,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~#########",
    "##########,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~#########",
    ",###,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~#########",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,,~~~~,########",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,~~~~,,#######",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,~~~~,,,####,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,,~~~~,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,~~~~,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,~~~~,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,~~~~,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,,,,~~~~,,,,,,,,,,",
    ":::::::::::::::::::::::::::::::::j,,,,,,,,,,,~~~~,,,,,,,,,,,",
    "::::::::::::::::::::::::::::::::::::::::::::==~~~=::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::==~~~=::::::::::",
    ",,,:::::::::::::::::::::::::::::::::::::::::==~~~=::::::::::",
    ",,,,,:::::::::::::,,,,,,,,,,,,,,,,j,,,,,,,,,,~~~~,,,,,,,,,,,",
    ",,,,,,:::::::::,,,,,,,,,,,,,,,,,,,j,,,,,,,,,,~~~~,,,,,,,,,,,",
    ",,,,,,,,::::::,,,,,,,,,,,,,,,,,,,,,jj,,,,,,,,~~~~,,,,,,,,,,,",
    ",,,,,,,,,:::,,,,,,,,,,,,,,,,,,,,,,,,,jj,,,,,,~~~~,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,jj,,,,oooo,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,jjjjoooojjjjj,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,oooo,,,,,jjjj,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,,,,,,,,,jj",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,,,,###,,,",
    "##,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,,,#######",
    "########,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,,########",
    "#########,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,~~~~,#########",
    "##########,,,,,,,,,,,,#######,##,,,,,,,,,,,,,,,~~~~#########",
    "##########,,,,,,,,,###############,,,,,,,,,,,,,~~~~#########",
    "##########,,,,,,,###################,,,,,,,,,,,~~~~#########"
  ],
  "faces": [],
  "objects": [
    {"id":"cw_coal_seam","x":29,"y":8},
    {"id":"mh_coal_seam_worked","x":35,"y":14},
    {"id":"mh_vigil_wood","x":3,"y":19},
    {"id":"mh_vigil_brazier","x":5,"y":19},
    {"id":"mh_ore_wagon","x":9,"y":22},
    {"id":"mh_ore_dropped","x":12,"y":21},
    {"id":"mh_ore_wagon_half","x":14,"y":22},
    {"id":"mh_ore_wagon_slewed","x":21,"y":22},
    {"id":"mh_ore_dropped","x":25,"y":21},
    {"id":"mh_ore_wagon_broken","x":27,"y":22},
    {"id":"mh_lost_wheel","x":29,"y":23},
    {"id":"mh_ore_wagon_tarped","x":37,"y":22},
    {"id":"mh_ore_wagon_tipped","x":8,"y":25},
    {"id":"mh_lantern_stake","x":15,"y":27},
    {"id":"mh_lantern_pole","x":24,"y":29},
    {"id":"mh_lantern_cairn","x":40,"y":29},
    {"id":"sack_pile","x":36,"y":33},
    {"id":"mh_lantern_pole","x":44,"y":19},
    {"id":"mh_lantern_cairn","x":33,"y":8},
    {"id":"mh_lantern_stake","x":18,"y":14},
    {"id":"mh_stone_trough","x":10,"y":28},
    {"id":"mh_slate_stack","x":40,"y":19},
    {"id":"mh_harrys_cart","x":12,"y":14},
    {"id":"mh_sacks","x":2,"y":18},
    {"id":"mh_chopping_block","x":6,"y":18},
    {"id":"mh_vigil_bedrolls","x":4,"y":17},
    {"id":"mh_yoke_dropped","x":8,"y":22}
  ],
  "buildings": [],
  "path": [[1,20],[3,20],[3,22],[1,22]],
  "spawns": [[13,28],[14,29],[13,30],[12,29],[14,28],[14,30],[12,30],[12,28],[26,30],[27,31],[26,32],[25,31],[27,30],[27,32],[25,32],[25,30],[38,30],[39,31],[38,32],[37,31],[39,30],[39,32],[37,32],[37,30],[42,16],[43,17],[42,18],[41,17],[43,16],[43,18],[41,18],[41,16],[31,9],[32,10],[31,11],[30,10],[32,9],[32,11],[30,11],[30,9],[16,15],[17,16],[16,17],[15,16],[17,15],[17,17],[15,17],[15,15]],
  "stations": {},
  "exits": [{"x":0,"y":21,"to":"town_common"}],
  "start": [1,21],
  "maskHash": "32faf315"
});
