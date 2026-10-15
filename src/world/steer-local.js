// ════════════════════════════════════════════════════════════════════════
// src/world/steer-local.js — THE LOCAL HERO'S FEET, AND WHAT A TAP DOES.
//
// TAP TO WALK IS DISPLAY ONLY. Where your hero stands in the town or your home
// is never sent and never saved: world-boot.js mirrors it into G._world.pos
// (display scratch, `_`-prefixed, so it is outside the residue allowlist) and a
// reload starts you at the map's start. Walking pays nothing and decides
// nothing — leaving the hero alone gives exactly the same game.
//
// createSteer plans 8-way A* paths (core/path.js, no corner cutting) over the
// map's collision mask and plays them at WALK_TILES_PER_S. A tap on a blocked
// tile walks to the nearest reachable open tile. Time is passed in, so a pane
// that was hidden for a minute simply finds the hero at the end of its walk.
//
// tapAction turns a tap (the tile plus the drawn things under it, top-most
// first) into ONE action; runAction hands it to the caller's navigation. Every
// action is a walk or a trip to a screen that already exists — none of them
// sends an intent, which is what "the mill hatch only navigates" means.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { findPath, walkable, reachFrom } from './core/path.js?v=585';

export const WALK_TILES_PER_S = 3.2;

/** The open tile nearest `to` that a walker on `from` can reach, or null. */
function nearestReachable(mask, w, h, from, to) {
  if (walkable(mask, w, h, to[0], to[1])) return to;
  const seen = reachFrom(mask, w, h, from);
  let best = null, bd = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!seen[y * w + x]) continue;
      const d = (x - to[0]) ** 2 + (y - to[1]) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
  }
  return best;
}

const facing = (dx, dy, was) => (dx || dy ? (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n')) : was);

/**
 * @param {{mask: Uint8Array, w: number, h: number}} map
 * @param {[number, number]} at  the tile the hero starts on
 */
export function createSteer(map, at) {
  const { w, h } = map;
  let mask = map.mask;
  let x = at[0], y = at[1], dir = 's';
  /* restSince starts at the first moment anyone asks: a hero that has just
     arrived on the map has been standing for no time at all. */
  let legs = [], leg = null, restSince = null, goal = null, tapped = false;

  /** Plan on a mask where the hero's own tile is open (furniture may appear under it). */
  function plan(from, to) {
    const m = mask[from[1] * w + from[0]] ? Uint8Array.from(mask, (v, i) => (i === from[1] * w + from[0] ? 0 : v)) : mask;
    const end = nearestReachable(m, w, h, from, to);
    return end ? findPath(m, w, h, from, end) : null;
  }
  function startLeg(now) {
    const next = legs.shift();
    if (!next) { leg = null; return; }
    const fx = Math.round(x), fy = Math.round(y);
    const dist = next[0] !== fx && next[1] !== fy ? Math.SQRT2 : 1;
    leg = { fx, fy, tx: next[0], ty: next[1], t0: now, ms: (1000 * dist) / WALK_TILES_PER_S };
    dir = facing(next[0] - fx, next[1] - fy, dir);
  }

  return {
    /** Replace the collision mask (a home's furniture changed). The walk in progress keeps going. */
    setMask(m) { mask = m; },
    /**
     * Walk to `to` ([x, y]). Mid-step, the step finishes first. `byTap` marks a
     * walk the player asked for (the walk mark is drawn for it). False when no
     * open tile near `to` can be reached.
     */
    walkTo(to, now, byTap) {
      const from = leg ? [leg.tx, leg.ty] : [Math.round(x), Math.round(y)];
      const path = plan(from, to);
      if (!path) return false;
      legs = path.slice(1);
      goal = path[path.length - 1];
      tapped = !!byTap;
      if (!leg) startLeg(now);
      if (!leg) { goal = null; restSince = now; }
      return true;
    },
    /** Advance to `now`: { x, y, dir, moving } in tile coords (fractional mid-step). */
    step(now) {
      while (leg && now >= leg.t0 + leg.ms) {
        const end = leg.t0 + leg.ms;
        x = leg.tx; y = leg.ty;
        startLeg(end);
        if (!leg) { goal = null; restSince = end; }
      }
      if (leg) {
        const k = Math.max(0, (now - leg.t0) / leg.ms);
        x = leg.fx + (leg.tx - leg.fx) * k;
        y = leg.fy + (leg.ty - leg.fy) * k;
      }
      return { x, y, dir, moving: !!leg };
    },
    /** How long the hero has stood still (0 while walking). */
    restMs(now) {
      if (restSince === null) restSince = now;
      return leg ? 0 : Math.max(0, now - restSince);
    },
    /** The tile the hero is walking to, and whether a tap sent it there; null when standing. */
    goal() { return goal ? { x: goal[0], y: goal[1], byTap: tapped } : null; },
    /** The tile the hero stands on (or is stepping onto). */
    cell() { return leg ? [leg.tx, leg.ty] : [Math.round(x), Math.round(y)]; },
  };
}

/** What a map exit leads to: a hunt map opens Adventures on its hunt; a town or home switches the scene. */
function exitAction(exit, maps) {
  const to = maps && maps[exit.to];
  if (!to) return null;
  if (to.kind === 'hunt') return to.hunts && to.hunts[0] ? { kind: 'hunt', hunt: to.hunts[0] } : null;
  return { kind: 'scene', choice: to.kind };
}

/**
 * ONE tap → ONE action.
 * @param {object} map  compileMap() output
 * @param {{tile: [number, number], hits: {id: string, tx: number, ty: number, ref: object|null}[]}} pick
 *   hits are the drawn things under the tap, top-most first
 * @param {{opens: object, maps: object}} o  TAP_OPENS, and map rows by id (for exits)
 * @returns {{kind: 'walk', to}|{kind: 'hunt', hunt}|{kind: 'skill', skill}|{kind: 'room', room}|{kind: 'house', room}|{kind: 'scene', choice}}
 */
export function tapAction(map, pick, o) {
  const exitAt = (x, y) => map.exits.find((e) => e.x === x && e.y === y);
  for (const hit of pick.hits || []) {
    const ref = hit.ref;
    if (ref && ref.room) return { kind: 'room', room: ref.room };
    if (ref && ref.sign) return { kind: 'house', room: ref.sign };
    const ex = exitAt(hit.tx, hit.ty);
    const viaExit = ex && exitAction(ex, o.maps);
    if (viaExit) return viaExit;
    const opens = o.opens[hit.id];
    if (opens && opens.open === 'skill') return { kind: 'skill', skill: opens.skill };
  }
  const ex = exitAt(pick.tile[0], pick.tile[1]);
  return (ex && exitAction(ex, o.maps)) || { kind: 'walk', to: pick.tile };
}

/**
 * Hand an action to the caller's navigation. `nav` holds only ways to MOVE
 * between screens (and the hero's feet); there is nothing in it that could
 * send an intent, so no tap can.
 * @param {object} act  tapAction()
 * @param {{walk, hunt, skill, room, house, scene}} nav
 */
export function runAction(act, nav) {
  if (!act) return false;
  if (act.kind === 'walk') return nav.walk(act.to);
  if (act.kind === 'hunt') return nav.hunt(act.hunt);
  if (act.kind === 'skill') return nav.skill(act.skill);
  if (act.kind === 'room') return nav.room(act.room);
  if (act.kind === 'house') return nav.house(act.room);
  if (act.kind === 'scene') return nav.scene(act.choice);
  return false;
}
