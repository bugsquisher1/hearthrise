// ============================================================
// src/core/hunt/damage.js — ONE hurt() (spec §2 damage; parity DM-*)
//
// Every blow any unit lands goes through `hurt`: element (permille, 0 = immune),
// the target's defence, the dealer's and the target's stance, minimum 1, the
// target's shield first, then HP, and the kill hand-off. The pieces of the
// arithmetic are src/core/combat.js's (defenceReduction, monsterAccuracy,
// monsterMaxHit, elementPermille, rollAttack): this file adds no second copy.
//
// `resolveAttacks` swings every unit whose swing is due, on the universal
// COMBAT_BALANCE.tickMs (the one basic-attack interval). A hero swings with the combat snapshot on its unit
// (acc permille, maxHit, element, def), which the settle writes from the
// character's own gear and skills; a monster swings from its MONSTERS row.
// Melee swing only standing on a tile; ranged also while moving (RO-19).
// Dice: the swing's `s` stream, units in id order (engine contract #3).
//
// Mark and vulnerability are abilities.js's (lane H4) statuses: an ability
// passes its own multiplier as `ability.mult` (permille). A shield is the
// target's `shield`, persisted by abilities.js; hurt only spends it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTERS } from '../../data/monsters.js?v=590';
import { HUNT_STANCES, DEFAULT_STANCE } from '../../data/rule-subjects.js?v=590';
import { COMBAT_BALANCE, rollAttack, defenceReduction, monsterAccuracy, monsterMaxHit } from '../combat.js?v=590';
import { cheb } from './grid.js?v=590';
import { atRest, unitById } from './movement.js?v=590';
import { makeEvent } from './events.js?v=590';
import { roleOf, elementOn, inRange, peel } from './targeting.js?v=590';
import { fallen } from './pull-cycle.js?v=590';
import { shareKillXp } from './xp-share.js?v=590';
import { payBasic } from './abilities.js?v=590';

/* stance: the hero's setting. acc (permille), maxHit, def, element: its combat snapshot.
   swingLeftMs: ms until the unit may swing again. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['stance', 'str'], ['acc', 'int'], ['maxHit', 'int'], ['def', 'int'], ['element', 'str'], ['swingLeftMs', 'int']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const stanceOf = (u) => HUNT_STANCES[u && u.stance] || HUNT_STANCES[DEFAULT_STANCE];

/**
 * Apply `amount` from `source` to `target`; answers what landed:
 * { dmg (HP removed), absorbed (shield spent), killed, immune }.
 */
export function hurt(inst, target, amount, source, element, ability) {
  if (!target || !target.alive) return { dmg: 0, killed: false };
  const el = elementOn(target, element);
  if (el === 0) return { dmg: 0, absorbed: 0, killed: false, immune: true };
  let n = Math.floor((Math.max(0, Math.floor(amount)) * el) / 1000);
  if (target.side === 'mon') n -= defenceReduction(MONSTERS[target.kind]);
  if (ability && Number.isInteger(ability.mult)) n = Math.floor((n * ability.mult) / 1000);
  n = Math.floor((n * stanceOf(source).dealt) / 1000);
  n = Math.floor((n * stanceOf(target).taken) / 1000);
  n = Math.max(1, n);
  const absorbed = Number.isInteger(target.shield) && target.shield > 0 ? Math.min(target.shield, n) : 0;
  if (absorbed) target.shield -= absorbed;
  const dmg = Math.min(target.hp, n - absorbed);
  target.hp -= dmg;
  return { dmg, absorbed, killed: target.hp <= 0, immune: false };
}

/**
 * Land a blow and tell the client: the one place a `dmg` / `immune` / `kill` event
 * is made, and the kill hand-off (pull-cycle.fallen, then xp-share.shareKillXp for a
 * monster). `dmg` names its ability ('basic' for a swing) and element (null for none),
 * which the analyzer tally reads. abilities.js lands its hits here too.
 */
export function landHit(inst, sc, source, target, amount, element, ability) {
  if (!target || !target.alive) return { dmg: 0, killed: false };
  const r = hurt(inst, target, amount, source, element, ability);
  /* A status tick whose source has left the world lands with no dealer (u null). */
  const u = source ? source.id : null;
  if (r.immune) sc.emit(makeEvent('immune', sc.atMs, { u, t: target.id }));
  else {
    sc.emit(makeEvent('dmg', sc.atMs, { u, t: target.id, amount: r.dmg,
      ability: (ability && ability.id) || 'basic', element: element || null }));
  }
  if (r.killed) {
    sc.emit(makeEvent('kill', sc.atMs, { u, t: target.id }));
    fallen(inst, target, sc);
    if (target.side === 'mon') shareKillXp(inst, { t: target.id, u, xp: MONSTERS[target.kind].xp }, sc);
  }
  return r;
}

/* One swing of `u` at `t`: miss → a miss event; a hit → landHit. Two draws at most (rollAttack). */
function swing(inst, sc, u, t, accuracy, maxHit) {
  u.swingLeftMs = COMBAT_BALANCE.tickMs;
  const amount = rollAttack(sc.rng, accuracy, maxHit);
  if (amount <= 0) { sc.emit(makeEvent('miss', sc.atMs, { u: u.id, t: t.id })); return null; }
  return landHit(inst, sc, u, t, amount, u.side === 'hero' ? u.element : null, null);
}

/** Attack hook: every living unit whose swing is due swings, in id order. */
export function resolveAttacks(inst, sc) {
  for (const u of inst.world.units) {
    if (!u.alive) continue;
    if (u.swingLeftMs > 0) u.swingLeftMs = Math.max(0, u.swingLeftMs - sc.dtMs);
    if (u.swingLeftMs > 0 || !Number.isInteger(u.target)) continue;
    const t = unitById(inst, u.target);
    if (!t || !t.alive) continue;
    if (u.side === 'mon') {
      if (cheb(u, t) > 1 || !atRest(u)) continue;
      const row = MONSTERS[u.kind];
      swing(inst, sc, u, t, monsterAccuracy(row, t.def), monsterMaxHit(row));
      continue;
    }
    const row = roleOf(u);
    if (!row || (row.melee && !atRest(u)) || !inRange(inst, u, t)) continue;
    /* A RANGED BASIC LOOSES ONE SHOT of the loaded ammo, own first then the store
       (abilities.payBasic, the one supply resolver): no shot, no swing. Only a
       hero the settle supplies (inst.heroes) carries a quiver; a bare fixture
       unit swings free. */
    const supplied = !!(inst.heroes && inst.heroes[u.id]);
    if (supplied && u.role === 'ranger' && !payBasic(inst, u, { ammo: true }, sc)) continue;
    swing(inst, sc, u, t, u.acc / 1000, Math.max(1, u.maxHit));
    if (inst.world.leader === u.id) inst.world.leaderLast = t.id;
    peel(inst, sc, u);
  }
}
