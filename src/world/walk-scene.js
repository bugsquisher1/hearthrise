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
// THE HERO NEVER WALKS ON ITS OWN (Tyler 2026-10-19, after "my character
// randomly walks to a random location after I leave a hunt"): it moves only when
// the player steers it (a tap on open ground, the keys), taps a station, which
// walks it there as well as opening that station's screen, or chose something the
// server gives a place (the real town, 2026-10-25: a new activity walks it to that
// activity's stand, goTo). Standing still for any length of time never moves it.
// PURE: no DOM, no window, no G — world-boot.js reads those and passes `env`.
// ════════════════════════════════════════════════════════════════════════
import { TAP_OPENS, SITE_OPENS } from '../data/world/stations.js?v=0.2.49';
import { createSteer, tapAction, walkClip } from './steer-local.js?v=0.2.49';
import { createTownCast } from './town-scene.js?v=0.2.49';
import { furnish, maskWith } from './home-scene.js?v=0.2.49';
import { pickFacing } from './core/facing.js?v=0.2.49';
import { GRIDS } from '../data/world/art-budget.js?v=0.2.49';
import { OUTFITS } from '../data/hunt-outfits.js?v=0.2.49';

/* How far a walked map's camera leans from the hero toward the map's `focus`:
   halfway keeps the hero on screen anywhere on a town-sized map and the plaza
   in view while it idles at the edge. */
const CAMERA_LEAN = 0.5;

/** A tile coordinate on the whole art pixel of a `T` px grid (the map's: map-compile.js map.T). */
const onPixelOf = (T) => (v) => Math.round(v * T) / T;

/**
 * @param {object} map  compileMap() output (kind 'town' or 'home')
 * @param {{at?: [number, number]|null, sprites: object, openClasses: string[], maps: object, heroSprite?: () => string}} o
 *   at: where the hero stood last on this map; maps: map rows by id (exits);
 *   heroSprite: the hero's outfit sprite id (src/session/hero-look.js), read every frame;
 *   props: fixed props this scene adds to the map ([{id, x, y, ref, plate?}]: the sandbox signs,
 *   src/world/sandbox-scene.js), drawn like a home's furniture and never blocking a step;
 *   units(now): extra display-only units drawn with the scene's people (the sandbox's wanderer)
 */
export function createWalkScene(map, o) {
  const onPixel = onPixelOf(map.T || GRIDS.base.T);   // a map compiled without a grid is the base grid's
  const steer = createSteer(map, o.at || map.start);
  let propsKey = null, props = [];
  const cast = map.kind === 'town' ? createTownCast(map, { sprites: o.sprites }) : null;

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
      if (o.units) units.push(...o.units(now));
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
        units, bubbles: [], props: o.props && o.props.length ? props.concat(o.props) : props,
        mark: goal && goal.byTap ? { x: goal.x, y: goal.y } : null,
        /* where the hero stands and is walking to, in whole tiles, for the town presence */
        place: { map: map.id, x: here[0], y: here[1], gx: goal ? goal.x : here[0], gy: goal ? goal.y : here[1], dir: at.dir },
      };
    },
    /** A tap ({tile, hits}) → the action it means; a walk is started here. */
    tap(pick, now) {
      const act = tapAction(map, pick, { opens: TAP_OPENS, sites: SITE_OPENS, maps: o.maps });
      if (act.kind === 'walk') steer.walkTo(act.to, now, true);
      /* a station tapped: its screen opens AND the hero walks to it (next to it: the station blocks) */
      else if (act.kind === 'skill') steer.walkTo(pick.tile, now, true);
      /* a keeper tapped (Tamsin at her board): her window opens AND the hero walks over */
      else if (act.kind === 'window') steer.walkTo(pick.tile, now, true);
      return act;
    },
    /**
     * The keys: hold direction v ([dx, dy], each -1..1; null lets go). The same
     * feet as a tap (steer-local.js drive), so nothing a key does is sent either.
     */
    drive(v, now) { steer.drive(v, now); },
    /**
     * Walk to the tile the SERVER gave this hero to stand on (its new stand: a new activity, back from a hunt,
     * a counter; world-boot.js from the town presence). The same feet, display only, no mark: nothing is sent.
     */
    goTo(to, now) { steer.walkTo(to, now, false); },
    /** What a tap here would do, without doing it (the pointer's hover cue). */
    peek: (pick) => tapAction(map, pick, { opens: TAP_OPENS, sites: SITE_OPENS, maps: o.maps }),
    /** Where the hero stands (or is stepping onto). */
    cell: () => steer.cell(),
  };
}
