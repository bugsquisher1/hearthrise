// src/data/grounds/carters_rest/map.js — CARTER'S REST: the halfway inn on the Morrow road, its yard, stable, roof, brewhouse, taproom and
// cellar (lane/b-morrow-kit 2026-11-19, the designer's "2026-11-14 The Morrow Hills" section 8). Row shape and lint: src/world/core/map-compile.js.
// Rebuild the hash with `node tests/world-core.mjs --hashes` after changing what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID: LAYOUT A (Tyler's pick 2026-11-19, art/review/morrow-kit/layout-sketches/A-inn-faces-the-road.png): the inn faces the road.
// The Morrow road runs east-west along the south (rows 37-40, in from Krell's Hold at the west); the hero starts on it at the porch (row 36,
// x22-35) by the taproom's front door (x28-29). The front range: the guest wing west (its walked Roof, slumped down to the yard at x15-17
// y22-23, where the trolls pull it apart to throw it), the Taproom in the middle (its hearth on the back wall, its back door x32-34) and the
// Cellar east (its keg door x39-41 onto the yard). The cart lane (x7-10) runs up the west side to a small yard behind (packed earth, straw
// paths, cobble only on the wheel track), the Stable on its north-west (door x13-15 y14-16) and the Brewhouse on its north-east (x42-43).
// The route is the pack's six rooms in order: 1 the Yard, 2 the Stable, 3 the Roof, 4 the Brewhouse, 5 the Taproom, 6 the Cellar.
//   '#' the inn's walls and roofs, the yard's dry stone wall and the moor (all block a step and a shot)
//   ':' the road's earth   'e' the yard's and lane's packed earth   'p' trodden straw   '.' the wheel track's cobble
//   '=' the taproom's boards and the porch   'y' the stable's straw (earth)   'f' the brewhouse's flags   'c' the cellar's stone (flagstone)
//   'r' the walked roof's slates (setts)
//
// ART: DRAWN (set `morrow`, tools/world-art/morrow-grounds.mjs). The ground `carters_rest_ground` is painted from these rows on the Morrow
// Hills kit: the moor and road of the approved sample, the inn's floors born dim on the palette, the inn's walls laid over the paint. The
// floors are dim (art/briefs/morrow-hills-art-rules.txt 1): no pocket stands on bright grass.
export default Object.freeze({
  "id": "carters_rest",
  "name": "Carter's Rest",
  "kind": "hunt",
  "hunts": ["carters_rest"],
  "outdoor": true,
  "light": "day",
  "ground": "carters_rest_ground",
  "legend": {"#":"rock",".":"cobble",":":"earth","e":"earth","p":"earth","=":"planks","y":"earth","f":"flagstone","c":"flagstone","r":"setts"},
  "rows": [
    "############################################################",
    "############################################################",
    "############################################################",
    "############################################################",
    "############################################################",
    "############################################################",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyy###############################fffffffffff#####",
    "###yyyyyyyyyyyyypppppppeeeeeeeeeeeeeeeeeeefffffffffffff#####",
    "###yyyyyyyyyyyyypppppppeeeeeeeeeeeeeeeeeeefffffffffffff#####",
    "###yyyyyyyyyyyyyeeeeeeeeeeeeeeeeeeeeeeeeeefffffffffffff#####",
    "################eeeeeeeeeeeeeeeeppeeeeeeee##fffffffffff#####",
    "################eeeeeeeeeeeeeeeeppeeeeeeee##fffffffffff#####",
    "#######e..............eeeeeeeeeeppeeeeeeee##################",
    "#######e..............eeeeeeeeeeppeeeeeeee##################",
    "#######e..e#####eeeeeeeeeeeeeeeeppeeeeeeee##################",
    "#######e..e####rrr##############===####ccc##################",
    "#######e..e####rrr##############===####ccc##################",
    "#######e..e##rrrrrrrr###########===####ccc##################",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e##rrrrrrrr##============##cccccccc###############",
    "#######e..e#################==##############################",
    "#######e..e#################==##############################",
    "#######e..e###########==============########################",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "############################################################",
    "############################################################",
    "############################################################"
  ],
  "faces": [],
  "objects": [
    {"id":"cw_coal_seam","x":44,"y":27},
    {"id":"cw_coal_seam","x":37,"y":32},
    {"id":"mh_ore_wagon_tarped","x":20,"y":17},
    {"id":"mh_chopping_block","x":39,"y":20},
    {"id":"mh_straw_bale","x":24,"y":14},
    {"id":"mh_slate_stack","x":19,"y":21},
    {"id":"mh_kegs","x":33,"y":27},
    {"id":"mh_bar_counter","x":33,"y":29},
    {"id":"mh_taproom_table","x":24,"y":27},
    {"id":"mh_table_over","x":25,"y":32},
    {"id":"mh_stool_broken","x":24,"y":30},
    {"id":"mh_bench","x":23,"y":36},
    {"id":"mh_round_table","x":33,"y":36},
    {"id":"mh_lantern_post","x":22,"y":36},
    {"id":"mh_lantern_post","x":30,"y":36},
    {"id":"mh_inn_sign","x":35,"y":36},
    {"id":"mh_gate_pillar","x":7,"y":36},
    {"id":"mh_gate_pillar","x":10,"y":36},
    {"id":"mh_gate_broken","x":8,"y":33},
    {"id":"mh_stone_trough","x":4,"y":7},
    {"id":"mh_straw_burst","x":11,"y":7},
    {"id":"mh_sack_spilt","x":4,"y":15},
    {"id":"cr_brew_kettle","x":46,"y":8},
    {"id":"cr_brew_kettle","x":52,"y":16},
    {"id":"mh_sacks","x":51,"y":7},
    {"id":"mh_kegs","x":38,"y":26},
    {"id":"mh_keg_spilt","x":42,"y":32},
    {"id":"mh_bar_counter","x":33,"y":31},
    {"id":"mh_stool_broken","x":31,"y":30},
    {"id":"mh_bench","x":24,"y":25},
    {"id":"mh_table_over","x":30,"y":32},
    {"id":"mh_lantern_stake","x":31,"y":15},
    {"id":"mh_lantern_pole","x":6,"y":9},
    {"id":"mh_lantern_pole","x":14,"y":26},
    {"id":"mh_lantern_stake","x":47,"y":10},
    {"id":"mh_lantern_stake","x":27,"y":26},
    {"id":"mh_lantern_stake","x":42,"y":27},
    {"id":"mh_vigil_wood","x":16,"y":17},
    {"id":"mh_kegs","x":40,"y":20},
    {"id":"mh_straw_bale","x":17,"y":21},
    {"id":"mh_mounting_block","x":37,"y":19}
  ],
  "buildings": [],
  "path": [[26,38],[30,38],[30,39],[26,39]],
  "spawns": [[28,16],[29,17],[28,18],[27,17],[29,16],[29,18],[27,18],[27,16],[8,10],[9,11],[8,12],[7,11],[9,10],[9,12],[7,12],[7,10],[17,27],[18,28],[17,29],[16,28],[18,27],[18,29],[16,29],[16,27],[49,11],[50,12],[49,13],[48,12],[50,11],[50,13],[48,13],[48,11],[28,28],[29,29],[28,30],[27,29],[29,28],[29,30],[27,30],[27,28],[40,28],[41,29],[40,30],[39,29],[41,28],[41,30],[39,30],[39,28]],
  "stations": {},
  "exits": [{"x":0,"y":38,"to":"town_common"}],
  "start": [28,38],
  "maskHash": "375bc248"
});
