// src/data/world/maps/town_common.js — HAVORA, the real town: Town Blueprint v0.5 x2 plus the Westwood (192 x 116).
// Row shape and lint: src/world/core/map-compile.js. Rebuild the hash with
// `node tests/world-core.mjs --hashes` after changing what blocks a step.
//
// The plan (docs/planning/PRIORITY_BOARD.md "Real town plan (2026-10-25)") is authored in plan
// coordinates in ../town/*.js and ../stations.js; this file only puts it together:
//   ground     ../town/ground.js (the blueprint's ground, traced x2, with the plan's districts)
//   buildings  ../town/sites.js SITES: PLACEHOLDER FOOTPRINTS (painted, closed: they block a step,
//              their art is the art lane's) on `site` ground; none is left (every lot is a SCENERY sprite)
//   objects    the road wear (../town/wear.js), the style-1 scenery (every building and lot a whole sprite), every
//              station's props, the trees of the green ground, the palisade (../town/palisade.js) and the
//              mountain's scree (../town/mountain.js)
//   stations   one stand of each kind the map lint checks (combat, gather, artisan, idle); every
//              station and its full stand list is ../stations.js
// ART: the town has no one ground (ground: null). Its ground is BLENDED from the Common family's wang16
// pairs (BLEND in ../town/sites.js: grass, the dirt roads, the river and sea banks, the flagstone
// yards, all one tileset family chained from the same grass and dirt tiles), drawn on the dual grid
// (compose.js blendTiles); Hearth Square's paving is a patch over it. A material no pair draws yet
// (a placeholder site) stays a placeholder tone.
import { at, TOWN_NAME, TOWN_MAP } from '../town/plan.js?v=0.2.52';
import { GROUND_ROWS } from '../town/ground.js?v=0.2.52';
import { SITES, SCENERY, EXITS, PATCHES, AMBIENT, BLEND } from '../town/sites.js?v=0.2.52';
import { GREENERY } from '../town/greenery.js?v=0.2.52';
import { WEAR } from '../town/wear.js?v=0.2.52';
import { PALISADE } from '../town/palisade.js?v=0.2.52';
import { SCREE } from '../town/mountain.js?v=0.2.52';
import { STATIONS, STATION_BY_ID, ACTIVITY_STATIONS } from '../stations.js?v=0.2.52';

const tile = (x, y) => { const [mx, my] = at(x, y); return { x: mx, y: my }; };
/** A placeholder footprint: a painted, closed building with its door mid-side. */
function site([id, x, y, w, h, side, offset]) {
  const [mx, my] = at(x, y);
  const along = (n) => (Number.isInteger(offset) ? offset : n >> 1);
  const door = side === 's' ? [mx + along(w), my + h - 1] : side === 'n' ? [mx + along(w), my]
    : side === 'w' ? [mx, my + along(h)] : [mx + w - 1, my + along(h)];
  return Object.freeze({ id, rect: Object.freeze([mx, my, w, h]), doors: Object.freeze([Object.freeze(door)]), painted: true, closed: true });
}
const first = (id) => STATION_BY_ID[id].stands[0];

export default Object.freeze({
  id: TOWN_MAP,
  name: TOWN_NAME,
  kind: 'town',
  hunts: Object.freeze([]),
  outdoor: true,
  light: 'day',
  ground: null,
  legend: Object.freeze({ '.': 'grass', ':': 'cobble', '=': 'earth', '_': 'flagstone', '#': 'planks', '~': 'water', '^': 'cliff', '|': 'palisade', 'o': 'site', '%': 'tilled', ',': 'gravel' }),
  rows: GROUND_ROWS,
  blend: BLEND,
  patches: Object.freeze(PATCHES.map((p) => Object.freeze({ terrain: p.terrain, rect: Object.freeze(at(p.rect[0], p.rect[1]).concat(p.rect[2], p.rect[3])) }))),
  ambient: Object.freeze(AMBIENT.map((a) => Object.freeze(Object.assign({ id: a.id, lift: a.lift }, tile(a.x, a.y))))),
  faces: Object.freeze([]),
  objects: Object.freeze([
    ...SCENERY.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...STATIONS.flatMap((s) => s.props),
    ...GREENERY.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...PALISADE.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...SCREE.map(([id, x, y]) => Object.freeze(Object.assign({ id }, tile(x, y)))),
    ...WEAR.map(([id, x, y]) => Object.freeze(Object.assign({ id: 'square_decal_' + id }, tile(x, y)))),
  ]),
  buildings: Object.freeze(SITES.map(site)),
  path: Object.freeze([]),
  spawns: Object.freeze([]),
  stations: Object.freeze({ combat: first(ACTIVITY_STATIONS.training), gather: first(ACTIVITY_STATIONS.gather.woodcutting),
    artisan: first(ACTIVITY_STATIONS.artisan.smithing), idle: first(ACTIVITY_STATIONS.idle) }),
  exits: Object.freeze(EXITS.map((e) => Object.freeze(Object.assign({ to: e.to }, tile(e.x, e.y))))),
  /* the lint's reach origin: the gatehouse's first stand (a hero back from a hunt arrives on one of the
     gatehouse's stands, the one the SERVER holds for it: 2027-01-28-town-stands.sql) */
  start: first(ACTIVITY_STATIONS.arrival),
  maskHash: 'bb2ea5fe',
});
