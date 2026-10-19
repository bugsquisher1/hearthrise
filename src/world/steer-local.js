// ════════════════════════════════════════════════════════════════════════
// src/world/steer-local.js — THE LOCAL HERO'S FEET, AND WHAT A TAP DOES.
//
// TAP TO WALK IS DISPLAY ONLY. Where your hero stands in the town or your home
// is never an intent and never saved: world-boot.js mirrors it into
// G._world.pos (display scratch, `_`-prefixed, so it is outside the residue
// allowlist) and a reload starts you at the map's start. In a town the
// character's TownPresence shows it to the other players there (display
// presence, src/session/town-presence.js). Walking pays nothing and decides
// nothing — leaving the hero alone gives exactly the same game.
//
// createSteer plans 8-way A* paths (core/path.js, no corner cutting) over the
// map's collision mask and plays them at WALK_TILES_PER_S. A tap on a blocked
// tile walks to the nearest reachable open tile. Time is passed in, so a pane
// that was hidden for a minute simply finds the hero at the end of its walk.
// HELD KEYS (drive) are the same feet: one tile leg at a time, by the same
// no-corner-cutting rule (core/path.js canStep), at the same speed, written to
// the same display scratch — there is no second movement model, and nothing a
// key does is sent either.
//
// tapAction turns a tap (the tile plus the drawn things under it, top-most
// first) into ONE action; runAction hands it to the caller's navigation. Every
// action is a walk or a trip to a screen that already exists — none of them
// sends an intent, which is what "the mill hatch only navigates" means.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { findPath, walkable, reachFrom, canStep } from './core/path.js?v=0.2.8';
import { diagonalOf } from './core/facing.js?v=0.2.8';

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

/** The tile a body reported at `at` stands on: `at` when open and reachable from the map's start, else the nearest such tile. */
export function standOn(map, at) {
  return nearestReachable(map.mask, map.w, map.h, map.start, [at[0], at[1]]) || map.start;
}

/* ONE WALK CYCLE PER TILE. A walk clip is played by DISTANCE, not by the
   clock: its frame comes from the tiles walked since the body last stood
   still, so every walk starts on the clip's first frame and the feet keep pace
   with the ground. Measured on the pre-style-1 hero's walk e/w (2026-10-14): a
   planted foot travels about 11-12 art px per step, ~24 per two-step cycle, so
   one cycle per tile (32 px) slides the feet a little; the clip's authored
   10 fps at WALK_TILES_PER_S slid them 82 px per cycle, over three times the stride. */
const WALK_CYCLE_TILES = 1;

/**
 * How far into its clip a body is drawn ({anim, age}): walking, the age at which
 * the walk clip shows the frame for the distance covered; standing, the time
 * since it stopped. The hero and every peer use this one rule, so a walk that is
 * re-aimed never restarts its clip.
 * @param {object|undefined} look  the sprite (book entry) the body wears
 * @param {{moving: boolean, walked: number, dir: string, diag?: string|null}} at  createSteer().step()
 * @param {number} restMs
 * @param {(dirs: object, dir: string, diag?: string|null) => string} pick  core/facing.js pickFacing
 */
export function walkClip(look, at, restMs, pick) {
  if (!at.moving) return { anim: 'idle', age: restMs };
  const clip = look && look.anims && look.anims.walk;
  const shown = clip && clip.dirs ? clip.dirs[pick(clip.dirs, at.dir, at.diag)] : null;
  const fps = (clip && clip.fps) || 10, n = (shown && shown.length) || 1;
  return { anim: 'walk', age: ((at.walked / WALK_CYCLE_TILES) * n * 1000) / fps };
}

const SIDE = (dx) => (dx > 0 ? 'e' : 'w');
const UPDOWN = (dy) => (dy > 0 ? 's' : 'n');

/**
 * The CARDINAL facing for a step (dx, dy) of a walk heading `trip` overall. A
 * diagonal step also carries its diagonal (core/facing.js), drawn when the art
 * has that facing; this is what shows when it has not. A straight
 * step faces its way. A DIAGONAL step faces the
 * trip's dominant axis (a walk mostly south keeps facing the camera through its
 * diagonal steps, instead of flipping to a side view and back), or,
 * on an exact diagonal, keeps the facing it had when that is one of its two
 * components, else shows the side.
 */
export function facingFor(dx, dy, trip, was) {
  if (!dx && !dy) return was;
  if (!dx) return UPDOWN(dy);
  if (!dy) return SIDE(dx);
  const ax = Math.abs(trip ? trip[0] : 0), ay = Math.abs(trip ? trip[1] : 0);
  if (ax > ay) return SIDE(dx);
  if (ay > ax) return UPDOWN(dy);
  return was === SIDE(dx) || was === UPDOWN(dy) ? was : SIDE(dx);
}

/**
 * @param {{mask: Uint8Array, w: number, h: number}} map
 * @param {[number, number]} at  the tile the hero starts on
 */
export function createSteer(map, at) {
  const { w, h } = map;
  let mask = map.mask;
  let x = at[0], y = at[1], dir = 's', diag = null;
  /* restSince starts at the first moment anyone asks: a hero that has just
     arrived on the map has been standing for no time at all. */
  let legs = [], leg = null, restSince = null, goal = null, tapped = false;
  /* held: the direction the keys hold ([dx, dy], each -1..1) or null. trip: the
     whole walk's heading, for facing. walked: tiles covered since the hero last
     stood still (the walk cycle's phase is read off it). */
  let held = null, trip = null, walked = 0;

  /** Plan on a mask where the hero's own tile is open (furniture may appear under it). */
  function plan(from, to) {
    const m = mask[from[1] * w + from[0]] ? Uint8Array.from(mask, (v, i) => (i === from[1] * w + from[0] ? 0 : v)) : mask;
    const end = nearestReachable(m, w, h, from, to);
    return end ? findPath(m, w, h, from, end) : null;
  }
  /**
   * The next tile the held keys step onto, by the planner's own rule (canStep:
   * no corner cutting). A blocked diagonal slides along whichever of its two
   * straight steps is open, so holding down-right against a wall walks along it.
   */
  function heldStep(fx, fy) {
    if (!held) return null;
    const m = mask[fy * w + fx] ? Uint8Array.from(mask, (v, i) => (i === fy * w + fx ? 0 : v)) : mask;
    const [dx, dy] = held;
    for (const [sx, sy] of dx && dy ? [[dx, dy], [dx, 0], [0, dy]] : [[dx, dy]]) {
      if (canStep(m, w, h, fx, fy, sx, sy)) return [fx + sx, fy + sy];
    }
    return null;
  }
  function startLeg(now) {
    const fx = Math.round(x), fy = Math.round(y);
    const next = legs.shift() || heldStep(fx, fy);
    if (!next) { leg = null; return; }
    const dist = next[0] !== fx && next[1] !== fy ? Math.SQRT2 : 1;
    leg = { ox: fx, oy: fy, fx, fy, tx: next[0], ty: next[1], t0: now, ms: (1000 * dist) / WALK_TILES_PER_S, dist };
    dir = facingFor(next[0] - fx, next[1] - fy, trip, dir);
    diag = diagonalOf(next[0] - fx, next[1] - fy);
  }
  function rest(at) { leg = null; goal = null; restSince = at; walked = 0; }
  /** Play the legs up to `now`; returns how far into its step the hero is (0..1). */
  function advance(now) {
    while (leg && now >= leg.t0 + leg.ms) {
      const end = leg.t0 + leg.ms;
      x = leg.tx; y = leg.ty;
      walked += leg.dist;
      startLeg(end);
      if (!leg) rest(end);
    }
    const k = leg ? Math.max(0, (now - leg.t0) / leg.ms) : 0;
    if (leg) {
      x = leg.fx + (leg.tx - leg.fx) * k;
      y = leg.fy + (leg.ty - leg.fy) * k;
    }
    return k;
  }
  /**
   * The keys changed in the first half of a step: aim that step, from where the
   * hero is now, at the tile the new keys pick from the tile it set out from (S
   * then D a moment later walks the diagonal, not a straight step and then one).
   * Past halfway the step finishes and the next one follows the keys.
   */
  function reAim(now) {
    const k = advance(now);
    if (!leg || k >= 0.5) return;
    const next = heldStep(leg.ox, leg.oy);
    if (!next || (next[0] === leg.tx && next[1] === leg.ty)) return;
    walked += leg.dist * k;
    const dist = Math.hypot(next[0] - x, next[1] - y);
    leg = { ox: leg.ox, oy: leg.oy, fx: x, fy: y, tx: next[0], ty: next[1], t0: now, ms: (1000 * dist) / WALK_TILES_PER_S, dist };
    dir = facingFor(next[0] - leg.ox, next[1] - leg.oy, trip, dir);
    diag = diagonalOf(next[0] - leg.ox, next[1] - leg.oy);
  }

  return {
    /** Replace the collision mask (a home's furniture changed). The walk in progress keeps going. */
    setMask(m) { mask = m; },
    /**
     * Walk to `to` ([x, y]). Mid-step, the step finishes first. `byTap` marks a
     * walk the player asked for (the walk mark is drawn for it). False when no
     * open tile near `to` can be reached. A walk ends any held-key stepping.
     */
    walkTo(to, now, byTap) {
      const from = leg ? [leg.tx, leg.ty] : [Math.round(x), Math.round(y)];
      const path = plan(from, to);
      if (!path) return false;
      held = null;
      legs = path.slice(1);
      goal = path[path.length - 1];
      trip = [goal[0] - from[0], goal[1] - from[1]];
      tapped = !!byTap;
      if (!leg) startLeg(now);
      if (!leg) rest(now);
      return true;
    },
    /**
     * THE KEYS. Hold direction `v` ([dx, dy], each -1, 0 or 1; null or [0, 0]
     * lets go). Held, the hero steps tile by tile that way on the same legs a
     * tap's path plays, and any tap path is dropped; let go, the step in
     * progress finishes and nothing follows it (a change of keys early in a
     * step re-aims that step: reAim). Pressed against a wall, the
     * hero turns to face it.
     */
    drive(v, now) {
      const dx = v ? Math.sign(v[0]) : 0, dy = v ? Math.sign(v[1]) : 0;
      legs = [];
      if (!dx && !dy) { held = null; return; }
      held = [dx, dy]; trip = held; goal = null; tapped = false;
      if (leg) reAim(now);
      else {
        startLeg(now);
        if (!leg) { dir = facingFor(dx, dy, trip, dir); diag = diagonalOf(dx, dy); restSince = now; }
      }
    },
    /**
     * Advance to `now`: { x, y, dir, diag, moving, walked } in tile coords
     * (fractional mid-step); dir is the cardinal facing, diag the diagonal of the
     * last step when it was one (drawn when the art has it: core/facing.js);
     * walked = tiles covered since the hero last stood still.
     */
    step(now) {
      const k = advance(now);
      return { x, y, dir, diag, moving: !!leg, walked: walked + (leg ? leg.dist * k : 0) };
    },
    /** How long the hero has stood still (0 while walking, and while keys are held). */
    restMs(now) {
      if (restSince === null) restSince = now;
      return leg || held ? 0 : Math.max(0, now - restSince);
    },
    /** The tile the hero is walking to, and whether a tap sent it there; null when standing. */
    goal() { return goal ? { x: goal[0], y: goal[1], byTap: tapped } : null; },
    /** The tile the hero stands on (or is stepping onto). */
    cell() { return leg ? [leg.tx, leg.ty] : [Math.round(x), Math.round(y)]; },
  };
}

/** What a map exit leads to: a hunt map names its hunt (the pane opens Hunts on it); a town or home switches the scene. */
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
