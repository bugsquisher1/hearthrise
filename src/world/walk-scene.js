// ════════════════════════════════════════════════════════════════════════
// src/world/walk-scene.js — THE TOWN AND YOUR HOME, ONE FRAME AT A TIME.
//
// The scenes you can walk in (map kinds 'town' and 'home'). Each frame takes
// what the client holds from the server — the town view, your room rungs and
// trophy claims, what your hero is doing — and returns the draw state: your
// hero on its local feet (steer-local.js), the peers (town-scene.js), the
// furniture (home-scene.js), the crier's line, the walk mark and where the
// camera looks.
// Derived pieces are rebuilt whenever their input changes and REPLACE what was
// there (a new town view re-places every peer; new rungs re-furnish the home
// and re-block the hero's mask), never merged into it.
// A hero left standing IDLE_TO_STATION_MS walks to its activity's station.
// PURE: no DOM, no window, no G — world-boot.js reads those and passes `env`.
// ════════════════════════════════════════════════════════════════════════
import { IDLE_TO_STATION_MS, TAP_OPENS } from '../data/world/stations.js?v=584';
import { createSteer, tapAction } from './steer-local.js?v=584';
import { townState, stationOf } from './town-scene.js?v=584';
import { furnish, maskWith } from './home-scene.js?v=584';

/* How far a walked map's camera leans from the hero toward the map's `focus`:
   halfway keeps the hero on screen anywhere on a town-sized map and the plaza
   in view while it idles at the edge. */
const CAMERA_LEAN = 0.5;

/**
 * @param {object} map  compileMap() output (kind 'town' or 'home')
 * @param {{at?: [number, number]|null, sprites: object, openClasses: string[], maps: object}} o
 *   at: where the hero stood last on this map; maps: map rows by id (exits)
 */
export function createWalkScene(map, o) {
  const steer = createSteer(map, o.at || map.start);
  let propsKey = null, props = [], townKey = null, townView = null, cast = { units: [], bubbles: [] };
  let sentTo = null;

  function furnishing(env) {
    if (map.kind !== 'home') return;
    const t = env.trophies;
    const key = JSON.stringify([env.rooms || {}, t ? t.rows.map((r) => r.stage) : null]);
    if (key === propsKey) return;
    propsKey = key;
    props = furnish(map.id, env.rooms, t, env.roomName);
    steer.setMask(maskWith(map, props, o.sprites, o.openClasses));
  }

  function people(env, now) {
    if (map.kind !== 'town') return;
    const key = Math.floor(now / 1000);   // freshness ages by the second; placement only moves with the view
    if (env.town === townView && key === townKey) return;
    townView = env.town; townKey = key;
    cast = townState(map, env.town, now, env);
  }

  return {
    map,
    /**
     * @param {{kind: string, rooms?: object, trophies?: {rows: object[]}|null, roomName?: Function,
     *          town?: object|null, pollMs?: number, you?: string|null, canon?: Function, band?: Function, crierLine?: Function}} env
     * @param {number} now  ms
     */
    frame(env, now) {
      furnishing(env);
      people(env, now);
      const station = stationOf(map, env.kind);
      const cell = steer.cell();
      if (steer.restMs(now) >= IDLE_TO_STATION_MS && (cell[0] !== station[0] || cell[1] !== station[1])) {
        const key = station.join() + '|' + propsKey;
        if (sentTo !== key) { sentTo = key; steer.walkTo(station, now, false); }
      }
      const at = steer.step(now);
      const goal = steer.goal();
      const f = map.focus;
      return {
        hero: { x: at.x, y: at.y, dir: at.dir, anim: at.moving ? 'walk' : 'idle' },
        camera: f ? { x: at.x + (f[0] - at.x) * CAMERA_LEAN, y: at.y + (f[1] - at.y) * CAMERA_LEAN } : null,
        units: cast.units, bubbles: cast.bubbles, props,
        mark: goal && goal.byTap ? { x: goal.x, y: goal.y } : null,
      };
    },
    /** A tap ({tile, hits}) → the action it means; a walk is started here. */
    tap(pick, now) {
      const act = tapAction(map, pick, { opens: TAP_OPENS, maps: o.maps });
      if (act.kind === 'walk') { sentTo = null; steer.walkTo(act.to, now, true); }
      return act;
    },
    /** What a tap here would do, without doing it (the pointer's hover cue). */
    peek: (pick) => tapAction(map, pick, { opens: TAP_OPENS, maps: o.maps }),
    /** Where the hero stands (or is stepping onto). */
    cell: () => steer.cell(),
  };
}
