// ============================================================
// src/core/hunt/leash.js — THE ONE LEASH (spec §3.1 #5-7, #9; parity LE-01..08)
//
// A pack lives in its pocket's room rect plus the ground's leash margin
// (hunt-grounds.js leashMarginOf). `inArea` is the ONE definition of that
// area: the monster leash, the kite / ranged tile filter and the "holder left"
// test all ask it, so there is nowhere a second, slightly different area can
// grow.
//
// `leashAllows` is imported ONLY by movement.js, which calls it for every
// path plan and every step (tests/hunt-core/leash.mjs greps for that and plants
// a bypass that must go red).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { leashMarginOf } from '../../data/hunt-grounds.js?v=0.2.128';
import { makeEvent } from './events.js?v=0.2.128';
import { staleIndex } from './unit-index.js?v=0.2.128';

/** Is (x, y) inside pocket `pocket`'s pack area (its room plus the ground's margin)? */
export function inArea(inst, pocket, x, y) {
  const p = inst.ground.pockets[pocket];
  if (!p) return false;
  const m = leashMarginOf(inst.ground);
  const r = p.room;
  return x >= r[0] - m && y >= r[1] - m && x <= r[2] + m && y <= r[3] + m;
}

/* The pocket of the pack `hero` holds in a fight, or -1 (a world with no phase is a walker world its caller drives). */
const heldPocket = (inst, hero) => (inst.world.phase === 'fight' ? inst.world.packs.findIndex((p) => p.aggro && p.holder === hero.id) : -1);

/**
 * May `unit` stand on (x, y)? A monster only inside its own pack's area; a
 * monster with no known pocket may not move at all (fail closed: a leash that
 * cannot be read holds). A hero holding a pack in a fight only inside that pack's
 * area: its walk, not just where the walk ends, or a retreat round the pack steps
 * out and resets it (Tyler 10-17: kiters never kite outside the area). Any other
 * hero goes anywhere walkable.
 */
export function leashAllows(inst, unit, x, y) {
  if (unit.side !== 'mon') {
    const held = heldPocket(inst, unit);
    return held < 0 || inArea(inst, held, x, y);
  }
  if (!Number.isInteger(unit.pocket)) return false;
  return inArea(inst, unit.pocket, x, y);
}

/** Has the hero holding pocket `pocket`'s aggro left its pack area? */
export function holderOutside(inst, pocket) {
  const pack = inst.world.packs[pocket];
  if (!pack || !pack.aggro || !Number.isInteger(pack.holder)) return false;
  const h = inst.world.units.find((u) => u.id === pack.holder);
  if (!h || !h.alive) return false;
  return !inArea(inst, pocket, h.x, h.y);
}

/**
 * THE LEASH RESET (spec §3.1 #7, LE-06): the pack drops its targets, heals to
 * full and walks home. The walk is a goal; movement.js takes every step of it
 * (it is the only writer of a monster's tile).
 */
export function resetPack(inst, pocket, sc) {
  const pack = inst.world.packs[pocket];
  /* A CALLED ROOM NEVER RESETS: a death ends the whole fight at its next boundary, and his HP only falls (boss-phases.js reads no flag, the fight's record reads where he stood). */
  if (!pack || (inst.ground && inst.ground.call)) return;
  pack.aggro = false;
  pack.holder = null;
  for (const u of inst.world.units) {
    if (u.side !== 'mon' || u.pocket !== pocket || !u.alive) continue;
    u.target = null;
    u.hp = u.maxHp;
    u.goal = u.home ? [u.home[0], u.home[1]] : null;
    u.path = [];
  }
  staleIndex(inst);
  sc.emit(makeEvent('pack_reset', sc.atMs, { pocket }));
}
