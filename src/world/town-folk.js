// ════════════════════════════════════════════════════════════════════════
// src/world/town-folk.js — HAVORA'S TOWNSFOLK AT THEIR WORK (display only).
//
// Each townsperson (src/data/world/town/folk.js) walks a loop of stops: it rests at a stop, facing its
// work (two stops on one tile are a turn where it stands: a stall keeper looking about), then walks the map's own path (core/path.js findPath, on the walk mask) to the next one at a
// stroll. Where it is is a pure function of the clock, so every client draws the same carter at the same
// crate, a reload puts it back where it was, and nothing is kept between frames but the loop itself.
// Nothing here reads a server value, sends anything, blocks a step or is a player: no name plate, and its
// ref names a townsperson, never a player (the player menu reads ref.player only).
// THE TICK: its place, walk frame and idle frame change only on FOLK_TICK_HZ, so a walker in view costs that
// many paints a second at most, never the frame rate (the World paints only a changed picture).
//
//   createTownFolk(map, sprites).frame(now)  -> units for compose.js (id, x, y, anim, dir, diag, frame, dye, ref)
//   folkExtras(map, sprites)                 -> createWalkScene options: { units } on a map with townsfolk, else {}
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════
import { FOLK, FOLK_TICK_HZ, FOLK_IDLE_FPS, FOLK_WALK_FPS } from '../data/world/town/folk.js?v=0.2.143';
import { findPath } from './core/path.js?v=0.2.143';
import { diagonalOf } from './core/facing.js?v=0.2.143';
import { GRIDS } from '../data/world/art-budget.js?v=0.2.143';

const FOLK_TICK_MS = 1000 / FOLK_TICK_HZ;

/** A facing name ('s', 'ne', ...) as the unit's cardinal and diagonal. */
const facing = (f) => (f.length === 2 ? { dir: f[0], diag: f } : { dir: f, diag: null });
/** The facing of a step (dx, dy): its axis, and its diagonal when it is one. */
const stepFacing = (dx, dy) => ({ dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n', diag: diagonalOf(dx, dy) });

/** One townsperson's loop as legs: a rest at each stop, then the walk to the next. */
function loopOf(map, row) {
  const legs = [];
  let t = 0;
  const stops = row.route;
  for (let i = 0; i < stops.length; i++) {
    const [x, y, rest, face] = stops[i];
    legs.push({ walk: false, from: t, ms: rest, at: [x, y], face: facing(face) });
    t += rest;
    if (stops.length < 2) break;
    const [nx, ny] = stops[(i + 1) % stops.length];
    /* the next stop on the same tile is a turn where it stands: no walk */
    if (nx === x && ny === y) continue;
    const pts = findPath(map.mask, map.w, map.h, [x, y], [nx, ny]) || [[x, y], [nx, ny]];
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const ms = (cum[cum.length - 1] / row.speed) * 1000;
    legs.push({ walk: true, from: t, ms, pts, cum });
    t += ms;
  }
  return { row, legs, loop: Math.max(FOLK_TICK_MS, t) };
}

/** Where a walk leg is `ms` into it: the point, and the facing of the step it is on. */
function along(leg, ms, speed) {
  const d = Math.min(leg.cum[leg.cum.length - 1], (ms / 1000) * speed);
  let k = 1;
  while (k < leg.cum.length - 1 && leg.cum[k] < d) k++;
  const [x0, y0] = leg.pts[k - 1], [x1, y1] = leg.pts[k] || leg.pts[k - 1];
  const seg = leg.cum[k] - leg.cum[k - 1] || 1;
  const f = Math.max(0, Math.min(1, (d - leg.cum[k - 1]) / seg));
  return Object.assign({ x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f }, stepFacing(x1 - x0, y1 - y0));
}

/**
 * @param {object} map  compileMap() output
 * @param {object} sprites  the map's sprite records (the clips' lengths)
 * @param {object[]} [rows]  its people (FOLK[map.id] when absent)
 */
export function createTownFolk(map, sprites, rows = FOLK[map.id] || []) {
  const T = map.T || GRIDS.base.T;
  const onPixel = (v) => Math.round(v * T) / T;
  const loops = rows.map((row) => loopOf(map, row));
  const frames = (id, anim, dir) => {
    const s = sprites && sprites[id], a = s && s.anims && s.anims[anim];
    const d = a && a.dirs && (a.dirs[dir] || a.dirs.s);
    return Array.isArray(d) ? d.length : Number.isInteger(d) ? d : 1;
  };
  return {
    /** The townsfolk on the clock's last tick. @param {number} now ms */
    frame(now) {
      const q = Math.floor(now / FOLK_TICK_MS) * FOLK_TICK_MS;
      return loops.map(({ row, legs, loop }, who) => {
        const local = (((q + row.offsetMs) % loop) + loop) % loop;
        let leg = legs[legs.length - 1];
        for (const l of legs) if (local >= l.from && local < l.from + l.ms) { leg = l; break; }
        const into = local - leg.from;
        const base = { id: row.body, dye: row.dye, ref: Object.freeze({ folk: row.id }) };
        if (!leg.walk) {
          const n = frames(row.body, 'idle', leg.face.diag || leg.face.dir);
          return Object.assign(base, { x: leg.at[0], y: leg.at[1], anim: 'idle', dir: leg.face.dir, diag: leg.face.diag,
            frame: (Math.floor((q * FOLK_IDLE_FPS) / 1000) + who) % n });
        }
        const p = along(leg, into, row.speed);
        const n = frames(row.body, 'walk', p.diag || p.dir);
        return Object.assign(base, { x: onPixel(p.x), y: onPixel(p.y), anim: 'walk', dir: p.dir, diag: p.diag,
          frame: Math.floor((into * FOLK_WALK_FPS) / 1000) % n });
      });
    },
    /** Each townsperson's loop (a test probe): its legs and its length in ms. */
    loops: () => loops,
  };
}

/**
 * What a walk scene on `map` adds for its townsfolk (createWalkScene options).
 * @param {object} map  compileMap() output
 * @param {object} sprites  that map's sprite records
 */
export function folkExtras(map, sprites) {
  if (!(FOLK[map.id] || []).length) return {};
  const folk = createTownFolk(map, sprites);
  return { units: (now) => folk.frame(now) };
}
