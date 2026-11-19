// src/data/grounds/carters_rest/map.js — CARTER'S REST: the halfway inn on the Morrow road, its yard, stable, roof, brewhouse, taproom and
// cellar (lane/b-morrow-kit 2026-11-19, the designer's "2026-11-14 The Morrow Hills" section 8). Row shape and lint: src/world/core/map-compile.js.
// Rebuild the hash with `node tests/world-core.mjs --hashes` after changing what blocks a step. Shape of the pack: src/data/grounds/shape.js.
//
// THE GRID. A coaching inn round a cobbled yard on the moor. The road comes up from Krell's Hold at the south (x27-32), past Harry's cart,
// through the gate in the yard's dry stone wall (row 33). Round the yard: the Stable on the west (its door x14-17 y23-25), the Brewhouse on
// the east (x42-45 y23-25), and the inn's north range: the Roof (the guest wing's slates, slumped down to the yard at x18-20 y13-15, where
// the trolls pull it apart to throw it), the Taproom (its front door x28-30) and the Cellar (the keg hatch x39-41). The route is the pack's
// six rooms in order: 1 the Yard, 2 the Stable, 3 the Roof, 4 the Brewhouse, 5 the Taproom, 6 the Cellar. Every doorway is three wide.
//   '#' the inn's walls and roofs, the dry stone wall and the moor (all block a step and a shot)
//   '.' the yard's cobble   ':' the road's earth   '=' the taproom's boards   'y' the stable's straw (earth)
//   'f' the brewhouse's flags   'c' the cellar's stone (both flagstone)   'r' the walked roof's slates (setts)
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
  "legend": {"#":"rock",".":"cobble",":":"earth","=":"planks","y":"earth","f":"flagstone","c":"flagstone","r":"setts"},
  "rows": [
    "############################################################",
    "############################################################",
    "############################################################",
    "############################################################",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "#####rrrrrrrrrrrrrrr###==============###ccccccccccccccc#####",
    "##################rrr#######===########ccc##################",
    "##################rrr#######===########ccc##################",
    "##################rrr#######===########ccc##################",
    "##################........................##################",
    "##################........................##################",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyyyyyy........................ffffffffffffff####",
    "####yyyyyyyyyyyyyy........................ffffffffffffff####",
    "####yyyyyyyyyyyyyy........................ffffffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "####yyyyyyyyyy####........................####ffffffffff####",
    "##################........................##################",
    "##################........................##################",
    "############################::::############################",
    "############################::::############################",
    "############################::::############################",
    "############################::::############################",
    "############################::::############################",
    "###########################:::::############################",
    "###########################:::::############################",
    "############################:::::###########################",
    "############################:::::###########################",
    "###########################::::::###########################",
    "###########################::::::###########################"
  ],
  "faces": [],
  "objects": [
    {"id":"cw_coal_seam","x":41,"y":5},
    {"id":"cw_coal_seam","x":53,"y":5},
    {"id":"mh_harrys_cart","x":27,"y":25},
    {"id":"sack_pile","x":21,"y":18},
    {"id":"crates","x":39,"y":18},
    {"id":"hay_bale","x":19,"y":22},
    {"id":"barrel_broken","x":38,"y":30},
    {"id":"chopping_block","x":35,"y":17},
    {"id":"mh_trough","x":5,"y":20},
    {"id":"hay_bale","x":12,"y":19},
    {"id":"hay_bale","x":5,"y":29},
    {"id":"sack_stack","x":12,"y":29},
    {"id":"cr_brew_kettle","x":48,"y":19},
    {"id":"cr_brew_kettle","x":54,"y":19},
    {"id":"mh_kegs","x":47,"y":29},
    {"id":"mh_taproom_table","x":24,"y":5},
    {"id":"mh_taproom_table","x":33,"y":5},
    {"id":"mh_taproom_table","x":24,"y":11},
    {"id":"mh_taproom_table","x":33,"y":11},
    {"id":"mh_kegs","x":44,"y":5},
    {"id":"mh_kegs","x":43,"y":11},
    {"id":"mh_kegs","x":50,"y":11}
  ],
  "buildings": [],
  "path": [[28,39],[30,39],[30,41],[28,41]],
  "spawns": [[24,25],[25,26],[24,27],[23,26],[25,25],[25,27],[23,27],[23,25],[8,23],[9,24],[8,25],[7,24],[9,23],[9,25],[7,25],[7,23],[12,7],[13,8],[12,9],[11,8],[13,7],[13,9],[11,9],[11,7],[51,23],[52,24],[51,25],[50,24],[52,23],[52,25],[50,25],[50,23],[29,7],[30,8],[29,9],[28,8],[30,7],[30,9],[28,9],[28,7],[47,7],[48,8],[47,9],[46,8],[48,7],[48,9],[46,9],[46,7]],
  "stations": {},
  "exits": [{"x":29,"y":43,"to":"town_common"}],
  "start": [29,41],
  "maskHash": "373b87da"
});
