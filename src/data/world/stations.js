// ════════════════════════════════════════════════════════════════════════
// src/data/world/stations.js — WHERE PEOPLE STAND, AND WHAT A TAP OPENS.
//
// STATIONS (Havora, the real town: docs/planning/PRIORITY_BOARD.md "Real town
// plan (2026-10-25)"). One row per place a hero does something in town:
//   id        the station's id (also the server's: L2, lane/c-town-stands)
//   district  the district it belongs to (town/plan.js DISTRICTS); every stand lies inside it
//   kind      what a hero there is doing: idle | arrival | hunt | gather | artisan | training | service
//   skill     the skill it trains (gather / artisan), when it trains one
//   opens     what a tap on one of its props opens (a window, a skill screen, Hunts)
//   props     [sprite, x, y]: the things it is built of (counters, forges, trees…), placed on
//             the map by maps/town_common.js; a tap on one opens `opens`
//   stands    the tiles a hero works on, IN ORDER: the primary stands, then the overflow
//             (`primary` is how many are primary). The server gives each hero the lowest free
//             stand at its station (L2), so two heroes never share one; a full station's next
//             hero goes to `fallback`, the square's benches.
// A STAND'S ID is (station id, its 0-based index in `stands`): `hearth`#0 is the first fuel stand.
// Authored in plan coordinates (town/plan.js) and stored as map tiles.
//
// ACTIVITY → STATION (stationFor): which station a hero's town activity stands it at: a gather
// node → the Westwood / the Mine / the Shore / the river bank / the farm; an artisan skill → the
// Smithy / the Tavern / the Rune block / the Hearth; training → the yard; a hunt → its departure.
//
// TAP_OPENS: a sprite that opens the same screen wherever it stands (the tally board, an anvil).
// SITE_OPENS: one placed prop of a station opens that station's screen (the shop's counter and the
// storage counter are the same sprite). Exits are not listed: an object standing on a map exit opens
// that exit (a hunt map names its hunt and the pane opens Hunts on it).
// Display data only: nothing here is a server number, and no tap sends an intent — every action is
// navigation to a screen that already exists.
//
// THE SERVER PLACES EVERY BODY (supabase/migrations/2027-01-28-town-stands.sql): these rows are mirrored
// into the server catalogue by tools/gen-town-stations.mjs (hr_town_stations, hr_town_stands,
// hr_town_station_hosts; `--check` is the twin guard), which refuses a stand off the map, on a blocked
// or unreachable tile, or shared by two stations. When a hero's town activity changes, a hunt ends or
// it appears in town, Postgres holds the lowest free stand of its station in its town instance under a
// unique key; a full station's next hero takes its `fallback`, then the nearest free bench, then the
// nearest free stand. The client never picks a stand (src/session/town-presence.js reads hr_town_view).
// TOWN_INSTANCE: one town instance holds `players` players (Tyler 2026-10-25: 40-60 people in the
// city), each fielding up to `heroesPerPlayer` bodies; the server never seats more players than
// floor(stands / heroesPerPlayer). view/margin/cap: the area a viewer reads (its view in tiles +
// margin on every side, at most cap bodies a read; hr_town_view).
// ════════════════════════════════════════════════════════════════════════
import { at, TOWN_MAP } from './town/plan.js?v=0.2.76';

export const TAP_OPENS = Object.freeze({
  anvil: Object.freeze({ open: 'skill', skill: 'smithing' }),
  woodpile: Object.freeze({ open: 'skill', skill: 'woodcutting' }),
  /* the Great Hearth itself: the bag, where Fuel the hearth is (Tyler 2026-10-25; Inner Flame, src/data/hearth.js) */
  great_hearth: Object.freeze({ open: 'window', window: 'inventory' }),
  /* Tamsin Reeve and her Tally Board in Hearth Square (2026-12-23-tally-tasks.sql): her window. PLACEHOLDER ART:
     the style-1 crier and noticeboard stand in for her until her own sprite and board are drawn. */
  npc_crier: Object.freeze({ open: 'window', window: 'tally' }),
  noticeboard: Object.freeze({ open: 'window', window: 'tally' }),
});

/* ── authoring helpers: plan-coordinate fields of stands ─────────────────── */
/** Every tile of [x0, x0+w) x [y0, y0+h), row by row. */
const F = (x0, y0, w, h) => { const out = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]); return out; };
/** The checkerboard half of a field ((x + y) even): standing room between neighbours. */
const C = (x0, y0, w, h) => F(x0, y0, w, h).filter(([x, y]) => (x + y) % 2 === 0);
/** The tile south of each prop (where its worker stands), in prop order. */
const south = (props) => props.map(([, x, y]) => [x, y + 1]);
/** The tiles nearest `to` first (then north to south, west to east): the first stand handed out is the closest. */
const nearest = (tiles, [tx, ty]) => tiles.slice().sort((a, b) => ((a[0] - tx) ** 2 + (a[1] - ty) ** 2) - ((b[0] - tx) ** 2 + (b[1] - ty) ** 2)
  || a[1] - b[1] || a[0] - b[0]);
const win = (window) => Object.freeze({ open: 'window', window });
const skill = (id) => Object.freeze({ open: 'skill', skill: id });

/* THE GREAT HEARTH (footprint 11 x 4 at x112-122 y45-48, town/sites.js) and its 24 fuel stands */
const HEARTH_PROPS = [['woodpile', 111, 46], ['woodpile', 123, 46]];
/* THE SMITHY YARD, a working yard against the smithy (lane/b-havora-polish 2026-10-26, Tyler: "very grid like", then
   "tighter and more natural"): four forge hearths, each a tight unit with its two anvils either side of the smith's
   place in front of the fire, its quench trough and its bellows (town/sites.js), two units up by the cook yard and two
   lower, staggered; the crafting benches along the smithy's west and south walls with the grindstones between them. A
   worker stands south of its piece (in front of it, in plain view). */
const FORGES = [['forge', 63, 37], ['forge', 68, 38], ['forge', 61, 42], ['forge', 66, 43]];
const ANVILS = [['anvil', 62, 38], ['anvil', 64, 38], ['anvil', 67, 39], ['anvil', 69, 39], ['anvil', 60, 43], ['anvil', 62, 43],
  ['anvil', 65, 44], ['anvil', 67, 44]];
const BENCHES = [['workbench', 71, 40], ['workbench', 73, 40], ['workbench', 71, 44], ['workbench', 73, 45], ['workbench', 75, 44], ['workbench', 77, 45],
  ['grindstone', 69, 42], ['grindstone', 75, 42]];
/* THE TAVERN'S COOK YARD (lane/b-havora-polish 2026-10-26, Tyler: the forge-sprite fires read as a second smithy): an
   outdoor kitchen at the back door in its own style-1 art: a bread oven against the wall either side of the door, a
   cauldron on its tripod by each, two spit fires out in the yard and the prep tables between them; two cooks at each.
   LISTED IN STAND ORDER, the cook fires first (playtest 2026-10-29 #13: the first cook, handed the lowest free stand, stood
   at the bread oven's foot on the yard's path, "cooking in the road, not at a cook fire"): the spits out in the yard, then
   the cauldrons, then the ovens and the prep tables for a busy kitchen (tests/town-stations.mjs ST-11). */
const FIRES = [['havora_cook_spit', 61, 32], ['havora_cook_spit', 66, 31], ['havora_cook_cauldron', 63, 29], ['havora_cook_cauldron', 71, 29],
  ['havora_bread_oven', 60, 28], ['havora_bread_oven', 68, 28], ['havora_prep_table', 64, 34], ['havora_prep_table', 69, 33]];
/* the training yard: 8 dummies scattered over the yard, three fighters to a dummy */
const DUMMIES = [['dummy', 62, 64], ['dummy', 66, 66], ['dummy', 71, 63], ['dummy', 75, 65], ['dummy', 63, 70], ['dummy', 68, 71],
  ['dummy', 73, 69], ['dummy', 76, 72]];
/* the quarry: 24 rock nodes in small clusters that hug the mountain (lane/b-havora-polish 2026-10-26): veins under the north
   face, a heap either side of the cart path by the mine mouth, a cluster round the outcrop in the middle of the floor, coal
   seams along the east face and by the low outcrop; copper nearest the mouth, the Common's rocks in the middle, coal at the
   back (the art lane's ore samples) */
const ORE = (x) => (x <= 148 ? 'ore_copper_rock' : x <= 155 ? 'rocks' : 'ore_coal_rock');
const ROCKS = [[145, 30], [146, 30], [148, 31], [144, 32], [154, 30], [156, 30], [158, 32], [153, 32], [160, 32], [161, 33], [159, 32],
  [150, 40], [154, 40], [156, 38], [163, 40], [162, 42], [150, 44], [157, 44], [142, 34], [143, 36], [146, 43], [148, 43], [160, 47], [158, 48]].map(([x, y]) => [ORE(x), x, y]);
const ALTARS = [['rune_block', 150, 48], ['rune_block', 152, 47], ['rune_block', 155, 48], ['rune_block', 157, 47]];
/* the Westwood: 40 trees in groves with clearings between and a few strays (the west groves the art lane's 2 x 2 yews
   and ashes, the rest the Common's pines and oaks), listed from the grove by the west gate outward, so the first woodcutters stand
   together by the road. A woodcutter stands on the row south of its tree. */
const TREES = [['oak', -4, 41], ['oak', -6, 38], ['pine', -9, 37], ['oak', -4, 35], ['westwood_ash', -14, 34], ['westwood_ash', -16, 39],
  ['pine', -11, 30], ['pine', -9, 28], ['pine', -7, 26], ['westwood_yew', -18, 34], ['pine', -13, 27], ['westwood_yew', -21, 37],
  ['oak', -15, 26], ['pine', -3, 60], ['pine', -16, 57], ['oak', -10, 20], ['pine', -7, 61], ['westwood_yew', -18, 23],
  ['oak', -9, 62], ['pine', -13, 61], ['oak', -20, 57], ['pine', -21, 22], ['westwood_ash', -18, 62], ['oak', -11, 66],
  ['pine', -8, 67], ['pine', -15, 66], ['oak', -5, 69], ['westwood_yew', -18, 14], ['westwood_yew', -22, 64],
  ['westwood_ash', -21, 15], ['westwood_yew', -20, 67], ['pine', -11, 73], ['oak', -15, 73], ['westwood_ash', -7, 75],
  ['oak', -12, 78], ['pine', -18, 79], ['pine', -15, 80], ['pine', -7, 82], ['pine', -4, 83], ['pine', -23, 83]];
const TREE_ROWS = { westwood_yew: 2, westwood_ash: 2 };
const treeStands = (trees) => trees.map(([id, x, y]) => [x, y + (TREE_ROWS[id] || 1)]);
/* the farm: 12 plots of tilled ground (town/ground.js), 3 to 5 wide, in two uneven rows of fields: [x, y, width], each
   2 deep, its workers on the row south of it */
const PLOTS = [[20, 82, 4], [25, 82, 3], [29, 81, 5], [35, 82, 3], [39, 81, 4], [45, 81, 3],
  [21, 86, 3], [25, 85, 4], [30, 86, 4], [35, 85, 3], [39, 86, 5], [46, 85, 3]];

const ROWS = [
  /* HEARTH SQUARE (x106-129 y36-59): the fire, the field and flanks, the benches */
  { id: 'hearth', district: 'hearth_square', kind: 'artisan', skill: 'inner_flame', opens: win('inventory'), props: HEARTH_PROPS,
    stands: [...F(112, 49, 11, 1), ...F(111, 50, 13, 1)], overflow: [], fallback: 'square_benches' },
  /* the field (y52-53, checkered, the x110-111 aisle kept open) and the two flanks; then the corner by the storage */
  { id: 'hearth_square', district: 'hearth_square', kind: 'idle', opens: null, props: [],
    stands: [...C(106, 52, 4, 2), ...C(112, 52, 17, 2), ...C(107, 42, 3, 9), ...F(124, 42, 5, 9)],
    overflow: [...F(106, 55, 4, 4), ...C(112, 55, 10, 4)], fallback: 'square_benches' },
  /* six benches (two rows of three, town/sites.js), a seat on the row south of each */
  { id: 'square_benches', district: 'hearth_square', kind: 'idle', opens: null, props: [],
    stands: [...F(123, 56, 6, 1), ...F(123, 59, 6, 1)], overflow: [], fallback: null },
  { id: 'tally', district: 'hearth_square', kind: 'service', opens: win('tally'), props: [['noticeboard', 103, 45], ['npc_crier', 104, 45]],
    stands: F(102, 46, 5, 2), overflow: F(102, 48, 5, 1), fallback: 'square_benches' },
  /* THE SHOP AND THE STORAGE side by side on the square's north edge, their counters on y36 facing the fire
     (the Great Hearth's art stands over x112-122 y38-47, so no stand is there: a hero there would be hidden) */
  { id: 'shop', district: 'hearth_square', kind: 'service', opens: win('shop'), props: [106, 108, 110, 112].map((x) => ['counter', x, 36]),
    stands: F(106, 37, 6, 5), overflow: F(104, 37, 2, 7), fallback: 'square_benches' },
  { id: 'storage', district: 'hearth_square', kind: 'service', opens: win('storage'), props: [123, 125, 127].map((x) => ['counter', x, 36]),
    stands: F(123, 37, 6, 5), overflow: F(129, 36, 3, 4), fallback: 'square_benches' },
  /* the kill-task hunter's door yard, south of the barracks (her window until his own screen) */
  { id: 'hunter', district: 'barracks', kind: 'service', opens: null, props: [],
    stands: F(108, 71, 5, 2), overflow: F(108, 73, 5, 1), fallback: 'square_benches' },
  /* THE GATEHOUSE: a hunt ending for many heroes lands here at once; every overground hunt leaves from here. A hero
     back from a hunt stands in the yard right in front of the gate (the first stands nearest its doors, x81-84 on the
     wall's row 14), so even a phone's few rows show the gate it came through; the yard by the tavern wall overflows */
  { id: 'gatehouse', district: 'gatehouse', kind: 'arrival', opens: win('hunts'), props: [['signpost', 86, 20]],
    stands: nearest([...F(78, 16, 12, 3), ...F(78, 19, 8, 1)], [83, 14]), overflow: F(74, 20, 5, 8), fallback: 'square_benches' },
  { id: 'mill_hatch', district: 'mill', kind: 'hunt', opens: null, props: [],
    stands: F(86, 35, 4, 2), overflow: [], fallback: 'gatehouse' },
  { id: 'sewer_grate', district: 'sewer', kind: 'hunt', opens: null, props: [],
    stands: F(42, 68, 6, 1), overflow: [], fallback: 'gatehouse' },
  /* THE SMITHY YARD */
  { id: 'smithy_forges', district: 'smithy', kind: 'artisan', skill: 'smithing', opens: skill('smithing'), props: [...FORGES, ...ANVILS],
    stands: [...south(FORGES), ...south(ANVILS)],
    overflow: [[64, 41], [63, 40], [65, 40], [66, 41], [64, 44], [61, 40], [68, 41], [64, 46]], fallback: 'square_benches' },
  { id: 'smithy_benches', district: 'smithy', kind: 'artisan', skill: 'crafting', opens: skill('crafting'), props: BENCHES,
    stands: south(BENCHES),
    overflow: [[73, 42], [72, 43], [74, 43], [72, 42], [74, 42], [76, 43], [72, 46], [74, 46], [70, 44], [76, 45], [75, 41], [70, 43]], fallback: 'square_benches' },
  /* THE TAVERN'S COOK YARD: two to a fire */
  { id: 'tavern_kitchen', district: 'tavern', kind: 'artisan', skill: 'cooking', opens: skill('cooking'), props: FIRES,
    stands: FIRES.flatMap(([, x, y]) => [[x, y + 1], [x + 1, y + 1]]),
    overflow: [[65, 31], [68, 30], [64, 32], [68, 32], [69, 31], [63, 31], [67, 33], [62, 31], [70, 31], [67, 34], [63, 34], [61, 30], [66, 35], [68, 34]], fallback: 'square_benches' },
  /* THE TRAINING YARD: three to a dummy */
  { id: 'training_yard', district: 'training', kind: 'training', opens: win('hunts'), props: DUMMIES,
    stands: DUMMIES.flatMap(([, x, y]) => [[x, y + 1], [x - 1, y + 1], [x + 1, y + 1]]), overflow: [], fallback: 'square_benches' },
  /* GATHERING: one hero to a tree, a rock, a stretch of shore or a plot */
  { id: 'westwood', district: 'westwood', kind: 'gather', skill: 'woodcutting', opens: skill('woodcutting'), props: TREES,
    stands: treeStands(TREES), overflow: [], fallback: 'square_benches' },
  { id: 'mine', district: 'mine', kind: 'gather', skill: 'mining', opens: skill('mining'), props: ROCKS,
    stands: south(ROCKS), overflow: [[149, 39], [155, 39], [148, 42], [156, 41], [152, 35], [147, 40]], fallback: 'square_benches' },
  { id: 'rune_block', district: 'mine', kind: 'artisan', skill: 'runecrafting', opens: skill('runecrafting'), props: ALTARS,
    stands: F(150, 49, 8, 1), overflow: F(150, 50, 7, 1), fallback: 'square_benches' },
  { id: 'shore', district: 'shore', kind: 'gather', skill: 'fishing', opens: skill('fishing'), props: [['bucket', 48, 92]],
    stands: F(50, 93, 40, 1), overflow: [], fallback: 'square_benches' },
  { id: 'river_bank', district: 'river', kind: 'gather', skill: 'fishing', opens: skill('fishing'), props: [],
    stands: F(87, 54, 1, 8), overflow: F(86, 54, 1, 8), fallback: 'shore' },
  { id: 'farm', district: 'farm', kind: 'gather', skill: 'farming', opens: win('farm'), props: [['cabbage_crate', 19, 86]],
    stands: PLOTS.flatMap(([x, y, w]) => F(x, y + 2, w, 1)), overflow: [], fallback: 'square_benches' },
];

const tiles = (list) => Object.freeze(list.map(([x, y]) => at(x, y)));
/** Every station of Havora, in map tiles: `stands` is primary then overflow, `primary` how many are primary. */
export const STATIONS = Object.freeze(ROWS.map((r) => Object.freeze({
  id: r.id, map: TOWN_MAP, district: r.district, kind: r.kind, skill: r.skill || null, opens: r.opens,
  props: Object.freeze(r.props.map(([id, x, y]) => { const [mx, my] = at(x, y); return Object.freeze({ id, x: mx, y: my }); })),
  stands: tiles(r.stands.concat(r.overflow)), primary: r.stands.length, fallback: r.fallback,
})));
export const STATION_BY_ID = Object.freeze(Object.fromEntries(STATIONS.map((s) => [s.id, s])));

/** A placed prop of a station opens that station's screen: 'map:x,y' → TAP_OPENS-shaped row. */
export const SITE_OPENS = Object.freeze(Object.fromEntries(STATIONS.filter((s) => s.opens)
  .flatMap((s) => s.props.map((p) => [s.map + ':' + p.x + ',' + p.y, s.opens]))));

/** The windows a tap in the world can open (the pane opens nothing else). */
export const TAP_WINDOWS = Object.freeze(Array.from(new Set(Object.values(TAP_OPENS).concat(Object.values(SITE_OPENS))
  .filter((o) => o.open === 'window').map((o) => o.window))));

/* ACTIVITY → STATION. A fishing node is the shore's unless it is a river fish. */
export const ACTIVITY_STATIONS = Object.freeze({
  gather: Object.freeze({ woodcutting: 'westwood', mining: 'mine', fishing: 'shore', farming: 'farm' }),
  node: Object.freeze({ trout_s: 'river_bank', pikeperch_s: 'river_bank' }),
  artisan: Object.freeze({ smithing: 'smithy_forges', crafting: 'smithy_benches', cooking: 'tavern_kitchen', runecrafting: 'rune_block', inner_flame: 'hearth' }),
  training: 'training_yard',
  /* a hunt leaves from its map's way in: the cellar hatch, the sewer grate, else the gatehouse */
  hunt: Object.freeze({ mill_cellar: 'mill_hatch', millrace_sewer: 'sewer_grate' }),
  huntDefault: 'gatehouse',
  arrival: 'gatehouse',
  idle: 'hearth_square',
});

/**
 * The station a town activity stands a hero at, or the square when nothing names one.
 * @param {{kind: string, skill?: string, node?: string, map?: string}|null} a  kind: gather | artisan | training | hunt | arrival | idle
 * @returns {string} a station id
 */
export function stationFor(a) {
  const A = ACTIVITY_STATIONS;
  if (!a || typeof a.kind !== 'string') return A.idle;
  if (a.kind === 'gather') return (a.node && A.node[a.node]) || A.gather[a.skill] || A.idle;
  if (a.kind === 'artisan') return A.artisan[a.skill] || A.idle;
  if (a.kind === 'training') return A.training;
  if (a.kind === 'hunt') return (a.map && A.hunt[a.map]) || A.huntDefault;
  if (a.kind === 'arrival') return A.arrival;
  return A.idle;
}

export const TOWN_INSTANCE = Object.freeze({ players: 60, heroesPerPlayer: 4, view: Object.freeze([22, 14]), margin: 8, cap: 120 });
