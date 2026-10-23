// ════════════════════════════════════════════════════════════════════════
// src/world/town-scene.js — THE COMMON: who else is here, walking where they walk.
//
// The people come from the character's TownPresence (src/session/
// town-presence.js): each walker as the server last placed it — the tile it
// stands on, the tile it walks to, its facing, its name, level and role. The
// server is a second or two behind a real walker, so a peer is never moved by
// teleporting it onto each answer: each peer has its OWN FEET (steer-local.js
// createSteer, the same planner and speed the local hero walks with), and a new
// goal from the server re-aims those feet mid-stride. The walk clip is played
// by distance (walkClip), so a re-aimed walk never restarts its animation, and
// a peer that arrives turns to the facing the server named. Only a peer drawn
// more than TOWN_PRESENCE.snapTiles from where the server says it is (an exit,
// a long gap) jumps. A walker the server stops naming is gone on the next
// answer; a reported tile inside a hedge or a building stands on the nearest
// open tile instead (the server does not hold the collision mask).
// Each peer wears the outfit its character chose (the server's walker.outfit,
// else its role's style-1 outfit; src/data/hunt-outfits.js, the one
// the hunt draws it in), carries a nameplate (name · level) and is stamped
// ref.player so a right-click opens the shared player menu for that account.
// PURE: no DOM, no window, no G — the caller passes the walkers and the clock.
// ════════════════════════════════════════════════════════════════════════
import { TOWN_PRESENCE } from '../data/town-presence.js?v=0.2.33';
import { outfitSprite } from '../data/hunt-outfits.js?v=0.2.33';
import { createSteer, standOn, walkClip } from './steer-local.js?v=0.2.33';
import { pickFacing } from './core/facing.js?v=0.2.33';
import { GRIDS } from '../data/world/art-budget.js?v=0.2.33';

/** A tile coordinate on the whole art pixel of a `T` px grid. */
const onPixelOf = (T) => (v) => Math.round(v * T) / T;
/** The same report as before (the server re-sends a walker unchanged until it moves). */
const sameSpot = (a, b) => a.x === b.x && a.y === b.y && a.gx === b.gx && a.gy === b.gy && a.dir === b.dir;

/**
 * The town's people, frame by frame, for ONE map. frame(walkers, now) → units.
 * @param {object} map  compileMap() output for a town map
 * @param {{sprites: object, limits?: object}} o  the atlas book's sprites (for the walk clip's length)
 */
export function createTownCast(map, o) {
  const limits = o.limits || TOWN_PRESENCE;
  const onPixel = onPixelOf(map.T || GRIDS.base.T);   // a map compiled without a grid is the base grid's
  const people = new Map();   // id -> { steer, goal: [x, y], dir, w }

  function place(w, now) {
    const at = standOn(map, [w.x, w.y]);
    const steer = createSteer(map, at);
    const p = { steer, goal: null, dir: w.dir, w };
    aim(p, w, now);
    return p;
  }
  function aim(p, w, now) {
    const goal = standOn(map, [w.gx, w.gy]);
    if (!p.goal || p.goal[0] !== goal[0] || p.goal[1] !== goal[1]) { p.goal = goal; p.steer.walkTo(goal, now, false); }
    p.dir = w.dir;
    p.w = w;
  }

  return {
    /**
     * @param {object[]} walkers  TownPresence.walkers()
     * @param {number} now  ms
     * @returns {object[]} the units to draw
     */
    frame(walkers, now) {
      const live = new Set();
      for (const w of walkers || []) {
        /* a person is a CHARACTER (its user and slot): one account's two characters are two people */
        const key = w.id + ':' + w.slot;
        live.add(key);
        let p = people.get(key);
        if (p && !sameSpot(p.w, w)) {
          /* a NEW report: re-aim from where the peer is drawn, unless that is too far from it (jump) */
          const c = p.steer.cell();
          if (Math.hypot(c[0] - w.x, c[1] - w.y) > limits.snapTiles) p = null;
          else aim(p, w, now);
        } else if (p) p.w = w;
        if (!p) { p = place(w, now); people.set(key, p); }
      }
      for (const id of Array.from(people.keys())) if (!live.has(id)) people.delete(id);
      const units = [];
      for (const p of people.values()) {
        const at = p.steer.step(now);
        const id = outfitSprite(p.w.outfit, p.w.role);
        const { anim, age } = walkClip(o.sprites[id], at, p.steer.restMs(now), pickFacing);
        units.push({
          id, x: onPixel(at.x), y: onPixel(at.y), dir: at.moving ? at.dir : p.dir, diag: at.moving ? at.diag : null, anim, age,
          plate: { text: p.w.name + (p.w.level !== null ? ' · ' + p.w.level : ''), kind: 'peer' },
          /* who this is, for the player menu: the server's account id and slot */
          ref: { player: { id: p.w.id, name: p.w.name, slot: p.w.slot } },
        });
      }
      return units;
    },
    /** How many people this cast holds (a test probe). */
    size: () => people.size,
  };
}
