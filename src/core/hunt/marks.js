// ============================================================
// src/core/hunt/marks.js — THE MARKS ON THE GROUND (lane/b-area-engine; the area-spells design §3: "shown as a mark on
// the ground that fills before it lands")
//
// The readers of a monster's LIVE CAST, the telegraph monster-spells.js starts and lands. A cast is persisted on its
// caster as `cast` (monster-spells.js PERSISTED):
//   { s: spell id, ms: the whole windup, left: ms until it lands, kind, x, y, dx, dy, r, len }
// (kind .. len: the placed shape, src/core/hunt/shapes.js, fixed as the cast starts). Every reader here asks that one
// record, so the hero's AI (roles.js: a ranged hero or a caster steps off), the bar's conditions (conditions.js
// enemy_casting) and the screen (markTiles: the tiles to draw, the server's own) can never disagree with the hit.
//
// Pure readers: imports no engine module, writes nothing, draws nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { covers, tilesOf } from './shapes.js?v=0.2.113';

/** The placed shape of unit `u`'s live cast, or null (none, or a caster that has fallen). */
export function castShape(u) {
  const c = u && u.alive && u.cast;
  if (!c || typeof c !== 'object') return null;
  return { kind: c.kind, ox: c.x, oy: c.y, dx: c.dx, dy: c.dy, n: 0, r: c.r, len: c.len };
}

/** The living monsters whose live cast covers the tile of any unit in `heroes`, in id order. */
export function castsCovering(inst, heroes) {
  const out = [];
  for (const m of inst.world.units) {
    if (m.side !== 'mon') continue;
    const s = castShape(m);
    if (s && heroes.some((h) => h && covers(s, h.x, h.y))) out.push(m);
  }
  return out;
}

/* A GROUP strike (shapes.js 'group') covers every tile: no ground is safe from it, so it marks no ground a hero could
   step off. It still counts as casting at every hero (castsCovering). */
const groundOf = (m) => { const s = castShape(m); return s && s.kind !== 'group' ? s : null; };

/** Is tile (x, y) under any living monster's GROUND mark (a group strike marks none)? */
export function markedAt(inst, x, y) {
  for (const m of inst.world.units) {
    if (m.side !== 'mon') continue;
    const s = groundOf(m);
    if (s && covers(s, x, y)) return true;
  }
  return false;
}

/** Does a ground mark stand anywhere (a living monster winding up a spell a hero can step off)? */
export const anyMark = (inst) => inst.world.units.some((m) => m.side === 'mon' && !!groundOf(m));

/**
 * THE TILES TO DRAW for unit `u`'s live cast (the screen's mark, the server's own tiles): every walkable tile of `grid`
 * its shape covers, row by row; [] when it holds none, and for a GROUP strike (cast.kind 'group': the screen marks every
 * hero instead). The fill is `1 - cast.left / cast.ms` of the way to its landing.
 */
export function markTiles(u, grid) {
  const s = castShape(u);
  return s ? tilesOf(s, grid) : [];
}

/**
 * THE MARK A `spell` EVENT STARTS (events.js; the live frame's telegraph, what the screen draws from the timeline):
 * { caster, spell, tiles (the walkable tiles of `grid` it covers, the server's own), group (a whole-party strike: no ground
 * tiles, the screen marks every hero), fromMs, landsAtMs }. It closes at the caster's `spell_end` (landed, killed or reset),
 * never on a clock of the screen's own. Null for any other event.
 */
export function markOfEvent(ev, grid) {
  if (!ev || ev.type !== 'spell') return null;
  const s = { kind: ev.shape, ox: ev.x, oy: ev.y, dx: ev.dx || 0, dy: ev.dy || 0, n: 0, r: ev.r || 0, len: ev.len || 0 };
  return { caster: ev.u, spell: ev.spell, tiles: tilesOf(s, grid), group: ev.shape === 'group', fromMs: ev.atMs, landsAtMs: ev.atMs + ev.ms };
}
