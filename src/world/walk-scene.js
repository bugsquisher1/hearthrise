// ════════════════════════════════════════════════════════════════════════
// src/world/walk-scene.js — THE TOWN AND YOUR HOME, ONE FRAME AT A TIME.
//
// The scenes you can walk in (map kinds 'town' and 'home'). Each frame takes
// what the client holds from the server — the town's walkers, your room rungs
// and trophy claims, what your hero is doing — and returns the draw state: your
// hero on its local feet (steer-local.js), the peers walking on theirs
// (town-scene.js), the furniture (home-scene.js), the walk mark and where the
// camera looks, plus `place`: where the hero stands and walks to, for the
// town presence to publish.
// Derived pieces are rebuilt whenever their input changes and REPLACE what was
// there (new rungs re-furnish the home and re-block the hero's mask), never
// merged into it; the peers follow each new walker list (town-scene.js).
// A hero left standing IDLE_TO_STATION_MS walks to its activity's station, but
// never once the player has steered it (a tap walk or the keys) under that
// activity: a hero you walked stays where you left it (live v0.2.1: "my
// character walks to a random spot when I stop moving"). A new activity sends it again.
// PURE: no DOM, no window, no G — world-boot.js reads those and passes `env`.
// ════════════════════════════════════════════════════════════════════════
import { IDLE_TO_STATION_MS, TAP_OPENS } from '../data/world/stations.js?v=0.2.9';
import { createSteer, tapAction, walkClip } from './steer-local.js?v=0.2.9';
import { createTownCast, stationOf } from './town-scene.js?v=0.2.9';
import { furnish, maskWith } from './home-scene.js?v=0.2.9';
import { T } from './core/grid.js?v=0.2.9';
import { pickFacing } from './core/facing.js?v=0.2.9';
import { OUTFITS } from '../data/hunt-outfits.js?v=0.2.9';

/* How far a walked map's camera leans from the hero toward the map's `focus`:
   halfway keeps the hero on screen anywhere on a town-sized map and the plaza
   in view while it idles at the edge. */
const CAMERA_LEAN = 0.5;

/** A tile coordinate on the whole art pixel the draw snaps it to. */
const onPixel = (v) => Math.round(v * T) / T;

/**
 * @param {object} map  compileMap() output (kind 'town' or 'home')
 * @param {{at?: [number, number]|null, sprites: object, openClasses: string[], maps: object, heroSprite?: () => string}} o
 *   at: where the hero stood last on this map; maps: map rows by id (exits);
 *   heroSprite: the hero's outfit sprite id (src/session/hero-look.js), read every frame
 */
export function createWalkScene(map, o) {
  const steer = createSteer(map, o.at || map.start);
  let propsKey = null, props = [];
  const cast = map.kind === 'town' ? createTownCast(map, { sprites: o.sprites }) : null;
  let sentTo = null;
  /* Steered: the player walked the hero (tap or keys) under activity `steeredUnder` (null until the
     next frame names it, when the walk came before any frame). A change of activity clears it. */
  let steered = false, steeredUnder = null, kindNow = null;
  const steerNow = () => { steered = true; steeredUnder = kindNow; };

  function furnishing(env) {
    if (map.kind !== 'home') return;
    const t = env.trophies;
    const key = JSON.stringify([env.rooms || {}, t ? t.rows.map((r) => r.stage) : null]);
    if (key === propsKey) return;
    propsKey = key;
    props = furnish(map.id, env.rooms, t, env.roomName);
    steer.setMask(maskWith(map, props, o.sprites, o.openClasses));
  }

  return {
    map,
    /**
     * @param {{kind: string, rooms?: object, trophies?: {rows: object[]}|null, roomName?: Function,
     *          walkers?: object[]}} env  walkers: the town's people (TownPresence.walkers())
     * @param {number} now  ms
     */
    frame(env, now) {
      furnishing(env);
      const units = cast ? cast.frame(env.walkers, now) : [];
      kindNow = env.kind;
      if (steered && steeredUnder === null) steeredUnder = env.kind;
      else if (steered && steeredUnder !== env.kind) steered = false;
      const station = stationOf(map, env.kind);
      const cell = steer.cell();
      if (!steered && steer.restMs(now) >= IDLE_TO_STATION_MS && (cell[0] !== station[0] || cell[1] !== station[1])) {
        const key = station.join() + '|' + propsKey;
        if (sentTo !== key) { sentTo = key; steer.walkTo(station, now, false); }
      }
      const at = steer.step(now);
      const goal = steer.goal();
      const here = steer.cell();
      const f = map.focus;
      /* The hero is drawn on whole art pixels and the camera is led by THAT
         pixel, not by the fraction, so the hero and the ground under it move
         in the same frames. Led by the fraction, the camera crept a device
         pixel at a time while the hero jumped a whole art pixel (z device px):
         on screen the hero stepped 0, 1, 3, 4 px on alternate frames. */
      const hx = onPixel(at.x), hy = onPixel(at.y);
      const heroId = (o.heroSprite && o.heroSprite()) || OUTFITS.knight;
      const { anim, age } = walkClip(o.sprites[heroId], at, steer.restMs(now), pickFacing);
      return {
        hero: { id: heroId, x: hx, y: hy, dir: at.dir, diag: at.diag, anim, age },
        camera: f ? { x: hx + (f[0] - hx) * CAMERA_LEAN, y: hy + (f[1] - hy) * CAMERA_LEAN } : null,
        units, bubbles: [], props,
        mark: goal && goal.byTap ? { x: goal.x, y: goal.y } : null,
        /* where the hero stands and is walking to, in whole tiles, for the town presence */
        place: { map: map.id, x: here[0], y: here[1], gx: goal ? goal.x : here[0], gy: goal ? goal.y : here[1], dir: at.dir },
      };
    },
    /** A tap ({tile, hits}) → the action it means; a walk is started here. */
    tap(pick, now) {
      const act = tapAction(map, pick, { opens: TAP_OPENS, maps: o.maps });
      if (act.kind === 'walk') { sentTo = null; steerNow(); steer.walkTo(act.to, now, true); }
      return act;
    },
    /**
     * The keys: hold direction v ([dx, dy], each -1..1; null lets go). The same
     * feet as a tap (steer-local.js drive), so nothing a key does is sent either.
     */
    drive(v, now) { sentTo = null; if (v && (v[0] || v[1])) steerNow(); steer.drive(v, now); },
    /** What a tap here would do, without doing it (the pointer's hover cue). */
    peek: (pick) => tapAction(map, pick, { opens: TAP_OPENS, maps: o.maps }),
    /** Where the hero stands (or is stepping onto). */
    cell: () => steer.cell(),
  };
}
