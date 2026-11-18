// ════════════════════════════════════════════════════════════════════════
// src/data/world/town/folk.js — HAVORA'S TOWNSFOLK, AS DATA (display only).
//
// Tyler 2026-11-16: "it doesn't feel 'alive' what so ever." People going about their work, each in a body of their own
// (art/world/townsfolk, tools/world-art/import-townsfolk-2026-11-16.mjs): a carter hauling between the arrival yard's crates
// and the trough, a water carrier between the well and Hearth Square, a dock porter on the quay, a market woman looking about
// at her stall, a sweeper working the lane in front of the stalls and a fishwife at the harbour. src/world/town-folk.js walks
// them; nothing here is read by the server, spends, gates or blocks a step, and no one is a player: no name plate, no player menu.
//
//   FOLK_TICK_HZ   everything a townsperson shows (where it stands, its walk and idle frames) changes on
//                  this tick, twice the life beat (src/data/world/ambient-life.js), so a walker in view
//                  costs at most this many paints a second, never the frame rate (tests/perf-budget.mjs
//                  town paints, budget 25)
//   FOLK_IDLE_FPS  a resting townsperson breathes at this rate (every 4th tick)
//   FOLK_WALK_FPS  its walk clip turns at this rate (every 2nd tick)
//   FOLK           map id -> its people: { id, body (the person's own sprite in art/world/townsfolk, idle and walk in eight
//                  facings, drawn as it is: never a hero's outfit, never dyed, never another townsperson's), speed (tiles a second: a
//                  stroll, under the hero's), offsetMs (where in its loop it is at time 0), route: [[x, y, restMs,
//                  face], ...] map tiles it rests on in turn, facing `face` }. A stop is never a station stand
//                  (a hero is set down there) and a walk is short: they work in bursts (tests/town-life.mjs TL-FOLK).
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { LIFE_BEAT_FPS } from '../ambient-life.js?v=0.2.138';
import { at, TOWN_MAP } from './plan.js?v=0.2.138';

export const FOLK_TICK_HZ = LIFE_BEAT_FPS * 2;
export const FOLK_IDLE_FPS = LIFE_BEAT_FPS / 2;
export const FOLK_WALK_FPS = LIFE_BEAT_FPS;

/* one stop of a route, in plan coordinates (town/plan.js) */
const stop = (x, y, restMs, face) => Object.freeze([...at(x, y), restMs, face]);
const person = (o) => Object.freeze(Object.assign({}, o, { route: Object.freeze(o.route) }));

export const FOLK = Object.freeze({
  [TOWN_MAP]: Object.freeze([
    /* the carter: from the arrival yard's crates by the gate down to the trough and the hay, and back */
    person({ id: 'carter', body: 'folk_carter', speed: 1.5, offsetMs: 0,
      route: [stop(77, 17, 18000, 'n'), stop(88, 22, 12000, 'ne')] }),
    /* the water carrier: from the well on the square's west lane to the Great Hearth's side, and back */
    person({ id: 'water_carrier', body: 'folk_water_carrier', speed: 1.3, offsetMs: 7000,
      route: [stop(100, 41, 20000, 'w'), stop(108, 51, 14000, 'e')] }),
    /* the dock porter: from the cargo by the harbour square down the quay to the pier head, and back */
    person({ id: 'dock_porter', body: 'folk_dock_porter', speed: 1.4, offsetMs: 21000,
      route: [stop(131, 83, 19000, 'e'), stop(141, 88, 13000, 's')] }),
    /* the market woman beside her stall on Hearth Square, looking out over the square */
    person({ id: 'market_woman', body: 'folk_market_woman', speed: 1, offsetMs: 0,
      route: [stop(131, 45, 9000, 'w'), stop(131, 45, 5000, 's'), stop(131, 45, 7000, 'w'), stop(131, 45, 4000, 'n')] }),
    /* the sweeper: the lane in front of the stalls, a stretch at a time up to the Hearth Square brazier (his idle is the broom at work) */
    person({ id: 'sweeper', body: 'folk_sweeper', speed: 0.9, offsetMs: 6000,
      route: [stop(130, 54, 16000, 'w'), stop(125, 54, 14000, 's')] }),
    /* the fishwife at the harbour's stalls */
    person({ id: 'fishmonger', body: 'folk_fishmonger', speed: 1, offsetMs: 3000,
      route: [stop(122, 85, 10000, 'e'), stop(122, 85, 6000, 's'), stop(122, 85, 8000, 'e')] }),
  ]),
});
