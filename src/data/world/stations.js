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
import { at, TOWN_MAP } from './town/plan.js?v=0.2.47';

export const TAP_OPENS = Object.freeze({
  anvil: Object.freeze({ open: 'skill', skill: 'smithing' }),
  woodpile: Object.freeze({ open: 'skill', skill: 'woodcutting' }),
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
const win = (window) => Object.freeze({ open: 'window', window });
const skill = (id) => Object.freeze({ open: 'skill', skill: id });

/* THE GREAT HEARTH (footprint 11 x 4 at x112-122 y45-48, town/sites.js) and its 24 fuel stands */
const HEARTH_PROPS = [['woodpile', 111, 46], ['woodpile', 123, 46]];
/* the smithy's west yard: 4 forges and 8 anvils (Smithing); in its own yard 6 workbenches and 2 grindstones (Crafting) */
const FORGES = [56, 59, 62, 65].map((x) => ['forge', x, 37]);
const ANVILS = [55, 58, 61, 64].flatMap((x) => [['anvil', x, 41], ['anvil', x, 44]]);
const BENCHES = [['workbench', 67, 37], ['workbench', 69, 37], ['workbench', 71, 37], ['workbench', 67, 40], ['workbench', 69, 40], ['workbench', 71, 40],
  ['grindstone', 67, 43], ['grindstone', 70, 43]];
/* the tavern's cook yard: 8 cook fires (2 x 1), two rows of four */
const FIRES = [61, 64, 67, 70].flatMap((x) => [['hearth', x, 30], ['hearth', x, 33]]);
const DUMMIES = [62, 66, 70, 74].flatMap((x) => [['dummy', x, 64], ['dummy', x, 70]]);
/* the quarry: 24 rock nodes, 6 across and 4 deep */
/* copper nearest the mouth, coal at the back (the art lane's ore samples; the middle columns keep the Common's rocks) */
const ORE = { 146: 'ore_copper_rock', 149: 'ore_copper_rock', 152: 'rocks', 155: 'rocks', 158: 'ore_coal_rock', 161: 'ore_coal_rock' };
const ROCKS = [146, 149, 152, 155, 158, 161].flatMap((x) => [33, 36, 39, 42].map((y) => [ORE[x], x, y]));
const ALTARS = [150, 152, 154, 156].map((x) => ['rune_block', x, 48]);
/* the Westwood: 40 trees, 5 across and 8 deep. The tiers deepen westward: the two west columns are the art lane's
   2 x 2 yews and ashes, the rest the Common's pines and oaks. A woodcutter stands on the row south of its tree. */
const TREE_ART = ['westwood_yew', 'westwood_ash'];
const TREES = Array.from({ length: 40 }, (_, i) => [TREE_ART[i % 5] || (i % 2 ? 'oak' : 'pine'), -22 + (i % 5) * 4 + (i % 2), 18 + Math.floor(i / 5) * 9]);
const TREE_ROWS = { westwood_yew: 2, westwood_ash: 2 };
const treeStands = (trees) => trees.map(([id, x, y]) => [x, y + (TREE_ROWS[id] || 1)]);
/* the farm: 12 plots of 3 x 2 (tilled ground, maps/town_common.js), their workers on the row south of each */
const PLOTS = Array.from({ length: 12 }, (_, i) => [20 + (i % 6) * 6, 82 + Math.floor(i / 6) * 4]);

const ROWS = [
  /* HEARTH SQUARE (x106-129 y36-59): the fire, the field and flanks, the benches */
  { id: 'hearth', district: 'hearth_square', kind: 'artisan', skill: 'prayer', opens: win('inventory'), props: HEARTH_PROPS,
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
  /* THE GATEHOUSE: a hunt ending for many heroes lands here at once; every overground hunt leaves from here */
  { id: 'gatehouse', district: 'gatehouse', kind: 'arrival', opens: win('hunts'), props: [['signpost', 86, 20]],
    stands: F(74, 20, 5, 8), overflow: F(74, 28, 5, 2), fallback: 'square_benches' },
  { id: 'mill_hatch', district: 'mill', kind: 'hunt', opens: null, props: [],
    stands: F(86, 35, 4, 2), overflow: [], fallback: 'gatehouse' },
  { id: 'sewer_grate', district: 'sewer', kind: 'hunt', opens: null, props: [],
    stands: F(42, 68, 6, 1), overflow: [], fallback: 'gatehouse' },
  /* THE SMITHY YARD */
  { id: 'smithy_forges', district: 'smithy', kind: 'artisan', skill: 'smithing', opens: skill('smithing'), props: [...FORGES, ...ANVILS],
    stands: [...south(FORGES), ...south(ANVILS)], overflow: F(55, 47, 8, 1), fallback: 'square_benches' },
  { id: 'smithy_benches', district: 'smithy', kind: 'artisan', skill: 'crafting', opens: skill('crafting'), props: BENCHES,
    stands: south(BENCHES), overflow: [...F(66, 46, 10, 1), [72, 41], [72, 38]], fallback: 'square_benches' },
  /* THE TAVERN'S COOK YARD: two to a fire */
  { id: 'tavern_kitchen', district: 'tavern', kind: 'artisan', skill: 'cooking', opens: skill('cooking'), props: FIRES,
    stands: FIRES.flatMap(([, x, y]) => [[x, y + 1], [x + 1, y + 1]]), overflow: [...F(61, 35, 11, 1), ...F(60, 32, 1, 3)], fallback: 'square_benches' },
  /* THE TRAINING YARD: three to a dummy */
  { id: 'training_yard', district: 'training', kind: 'training', opens: win('hunts'), props: DUMMIES,
    stands: DUMMIES.flatMap(([, x, y]) => [[x, y + 1], [x - 1, y + 1], [x + 1, y + 1]]), overflow: [], fallback: 'square_benches' },
  /* GATHERING: one hero to a tree, a rock, a stretch of shore or a plot */
  { id: 'westwood', district: 'westwood', kind: 'gather', skill: 'woodcutting', opens: skill('woodcutting'), props: TREES,
    stands: treeStands(TREES), overflow: [], fallback: 'square_benches' },
  { id: 'mine', district: 'mine', kind: 'gather', skill: 'mining', opens: skill('mining'), props: ROCKS,
    stands: south(ROCKS), overflow: F(145, 45, 6, 1), fallback: 'square_benches' },
  { id: 'rune_block', district: 'mine', kind: 'artisan', skill: 'runecrafting', opens: skill('runecrafting'), props: ALTARS,
    stands: F(150, 49, 8, 1), overflow: F(150, 50, 7, 1), fallback: 'square_benches' },
  { id: 'shore', district: 'shore', kind: 'gather', skill: 'fishing', opens: skill('fishing'), props: [['bucket', 48, 92]],
    stands: F(50, 93, 40, 1), overflow: [], fallback: 'square_benches' },
  { id: 'river_bank', district: 'river', kind: 'gather', skill: 'fishing', opens: skill('fishing'), props: [],
    stands: F(87, 54, 1, 8), overflow: F(86, 54, 1, 8), fallback: 'shore' },
  { id: 'farm', district: 'farm', kind: 'gather', skill: 'farming', opens: win('farm'), props: [['cabbage_crate', 19, 86]],
    stands: PLOTS.flatMap(([x, y]) => F(x, y + 2, 3, 1)), overflow: [], fallback: 'square_benches' },
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
  artisan: Object.freeze({ smithing: 'smithy_forges', crafting: 'smithy_benches', cooking: 'tavern_kitchen', runecrafting: 'rune_block', prayer: 'hearth' }),
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
