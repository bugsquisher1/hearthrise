// ============================================================
// src/core/hunt/targeting.js — TARGET CHOICE (spec §3.2 #11-15; parity TG-01..09)
//
// Who each unit is after. A hero picks from the ENGAGED monsters (a monster is
// engaged while it holds a target) in the order its Target setting gives,
// element-aware (TG-03). A monster keeps its target until that target falls
// (it then turns on the pull leader, TG-05/06), a hero's attack peels it
// (TG-07), or the tank Challenges it back (TG-08).
//
// A unit with no role row (src/data/hunt-roles.js) is not driven here: it is
// a walker the caller moves (the movement fixtures). A solo hunt is a party of
// one: its hero is the leader, and "follow" is its own nearest.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_ROLES, CHALLENGE } from '../../data/hunt-roles.js?v=0.2.11';
import { MONSTERS } from '../../data/monsters.js?v=0.2.11';
import { DEFAULT_TARGET_MODE } from '../../data/rule-subjects.js?v=0.2.11';
import { elementPermille } from '../combat.js?v=0.2.11';
import { cheb, dist2, los } from './grid.js?v=0.2.11';
import { unitById, leaderOf } from './movement.js?v=0.2.11';
import { makeEvent } from './events.js?v=0.2.11';

/* chalMs: ms until the unit's Challenge is ready. leaderLast: the leader's last target (TG-04). */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['chalMs', 'int']]),
  world: Object.freeze([['leaderLast', 'int?']]),
  pack: Object.freeze([]),
});

/** The role row a unit plays, or null (a monster, or a hero with no role). */
export const roleOf = (u) => (u && u.side === 'hero' && HUNT_ROLES[u.role]) || null;

/** The living monsters that hold a target, in id order. */
export const engaged = (inst) => inst.world.units.filter((u) => u.side === 'mon' && u.alive && Number.isInteger(u.target));

/** What a blow of `element` is worth against `unit`, in permille (0 = immune). Heroes take every element. */
export const elementOn = (unit, element) => (unit.side === 'mon' ? elementPermille(MONSTERS[unit.kind], element) : 1000);

/** Can hero `u` hit monster `m` from where it stands? Melee: adjacent. Ranged: range + line of sight (TG-02). */
export function inRange(inst, u, m) {
  const row = roleOf(u);
  if (!row || !m || !m.alive) return false;
  if (row.melee) return cheb(u, m) <= 1;
  return dist2(u, m) <= row.range * row.range && los(inst.grid, u, m);
}

/* Target modes (rule-subjects.js TARGET_MODES). Each compares two monsters for hero `u`;
   ties fall to unit id, so the order is total and the same on every runtime. */
const ORDER = Object.freeze({
  nearest: (inst, u) => (a, b) => dist2(a, u) - dist2(b, u),
  weakest: () => (a, b) => a.hp - b.hp,
  /* Highest % life first, compared as integers (b.hp / b.maxHp vs a.hp / a.maxHp, cross-multiplied). */
  highest_pct: () => (a, b) => b.hp * a.maxHp - a.hp * b.maxHp,
  strongest: () => (a, b) => b.maxHp - a.maxHp,
  /* The leader's last target first (TG-04), then nearest. The leader itself has no one to follow. */
  follow: (inst, u) => {
    const lt = inst.world.leader !== u.id ? inst.world.leaderLast : null;
    return (a, b) => (b.id === lt) - (a.id === lt) || dist2(a, u) - dist2(b, u);
  },
});

/** Ordered targets for `unit` by its Target setting (TG-01). `settings.tmode` overrides the unit's own. */
export function pickTargets(inst, unit, settings) {
  if (!unit || !roleOf(unit)) return [];
  const mode = (settings && settings.tmode) || unit.tmode;
  const cmp = (ORDER[mode] || ORDER[DEFAULT_TARGET_MODE])(inst, unit);
  return engaged(inst).sort((a, b) => cmp(a, b) || a.id - b.id);
}

/** The basic attack's target: the first in order it can hit that its element hurts, else the first it can hit (TG-03). */
export function basicTarget(inst, u) {
  const inR = pickTargets(inst, u).filter((m) => inRange(inst, u, m));
  return inR.find((m) => elementOn(m, u.element) > 0) || inR[0] || null;
}

function retarget(m, id, sc) {
  if (m.target === id) return;
  m.target = id;
  if (Number.isInteger(id)) sc.emit(makeEvent('target', sc.atMs, { u: m.id, t: id }));
}

/**
 * A HERO'S ATTACK CAN DRAW A QUEUED MONSTER ONTO IT (spec §3.2 #13, TG-07). The
 * role's peel chance (permille) is drawn only when a monster could be drawn: one
 * that is queued behind the leader and not touching him. Answers the drawn monster.
 */
export function peel(inst, sc, hero) {
  const row = roleOf(hero);
  const k = leaderOf(inst);
  if (!row || !row.peel || !k || k === hero) return null;
  const free = engaged(inst).filter((m) => m.target === k.id && m.queued && cheb(m, k) > 1);
  if (!free.length || sc.rng.int(1, 1000) > row.peel) return null;
  retarget(free[0], hero.id, sc);
  return free[0];
}

/*
 * THE TANK'S AUTO-CHALLENGE (spec §3.2 #14, TG-08): whenever an engaged monster
 * within CHALLENGE.radius of the tank is not on him, he pulls every such monster
 * back, then waits CHALLENGE.cooldownMs. The challenger is the pull leader when
 * he is a tank (the tank leads by role order, so with any tank in the party he
 * is the leader); no player input.
 */
function challenge(inst, sc, k) {
  if (!k || !roleOf(k) || !roleOf(k).tank) return;
  if (k.chalMs > 0) k.chalMs = Math.max(0, k.chalMs - sc.dtMs);
  if (k.chalMs > 0) return;
  const off = engaged(inst).filter((m) => m.target !== k.id && cheb(m, k) <= CHALLENGE.radius);
  if (!off.length) return;
  for (const m of off) { retarget(m, k.id, sc); m.queued = false; }
  sc.emit(makeEvent('challenge', sc.atMs, { u: k.id }));
  k.chalMs = CHALLENGE.cooldownMs;
}

/**
 * Phase-AI hook, every sub-step: monsters whose target fell turn on the leader
 * (TG-05/06), the tank Challenges, then every hero with a role picks its target.
 * In a fight a hero with nothing in range keeps a target to walk to unless the
 * leader is on the move, when it follows the leader instead (RO-05,
 * movement.followTrail follows a hero with no target).
 */
export function chooseTargets(inst, sc) {
  const k = leaderOf(inst);
  for (const m of engaged(inst)) {
    const t = unitById(inst, m.target);
    if (!t || !t.alive) retarget(m, k && k !== t ? k.id : null, sc);
  }
  challenge(inst, sc, k);
  const fighting = inst.world.phase === 'fight';
  const leaderMoving = !!k && k.path.length > 0;
  for (const u of inst.world.units) {
    if (!roleOf(u)) continue;
    if (!u.alive || !fighting) { u.target = null; continue; }
    const b = basicTarget(inst, u);
    const first = b || ((u === k || !leaderMoving) ? pickTargets(inst, u)[0] : null);
    u.target = first ? first.id : null;
  }
}
