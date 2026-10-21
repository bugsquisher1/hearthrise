// ============================================================
// src/core/hunt/targeting.js — TARGET CHOICE (spec §3.2 #11-15; parity TG-01..09)
//
// Who each unit is after. A hero picks from the ENGAGED monsters (a monster is
// engaged while it holds a target) in the order its Target setting gives,
// element-aware (TG-03). A monster keeps its target until that target falls
// (it then turns on the pull leader, TG-05/06), a hero's attack peels it
// (TG-07), or a tank Challenges it (TG-08).
//
// A MELEE hero no monster is on walks to its MARK, the first monster its
// Target setting names (roles.js closeIn takes the walk), and keeps a target
// it stands beside until that target falls; a hero monsters ARE on (the
// holding tank) hits the best of what stands beside it. A ranged hero shoots
// the best it can reach.
//
// A unit with no role row (src/data/hunt-roles.js) is not driven here: it is
// a walker the caller moves (the movement fixtures). A solo hunt is a party of
// one: its hero is the leader, and "follow" is its own nearest.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_ROLES, CHALLENGE } from '../../data/hunt-roles.js?v=0.2.24';
import { ABILITIES } from '../../data/abilities.js?v=0.2.24';
import { MONSTERS } from '../../data/monsters.js?v=0.2.24';
import { DEFAULT_TARGET_MODE } from '../../data/rule-subjects.js?v=0.2.24';
import { elementPermille } from '../combat.js?v=0.2.24';
import { cheb, dist2, los } from './grid.js?v=0.2.24';
import { unitById, leaderOf } from './movement.js?v=0.2.24';
import { makeEvent } from './events.js?v=0.2.24';

/* holdMs: ms a Challenged monster stays on its challenger (no other Challenge takes it meanwhile).
   The Challenge's cooldown is the ability's own clock (abilities.js `cds`). leaderLast: the leader's last target (TG-04). */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['holdMs', 'int']]),
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
   ties fall to the NEARER, then to unit id, so the order is total and the same on every
   runtime. (Ties went straight to id until 2026-10-21: a pack of one kind at full life
   put the same first-spawned monster first for "Strongest" whoever stood where.) */
const ORDER = Object.freeze({
  nearest: () => () => 0,
  weakest: () => (a, b) => a.hp - b.hp,
  /* Highest % life first, compared as integers (b.hp / b.maxHp vs a.hp / a.maxHp, cross-multiplied). */
  highest_pct: () => (a, b) => b.hp * a.maxHp - a.hp * b.maxHp,
  strongest: () => (a, b) => b.maxHp - a.maxHp,
  /* The leader's last target first (TG-04), then nearest. The leader itself has no one to follow. */
  follow: (inst, u) => {
    const lt = inst.world.leader !== u.id ? inst.world.leaderLast : null;
    return (a, b) => (b.id === lt) - (a.id === lt);
  },
});

/** Ordered targets for `unit` by its Target setting (TG-01). `settings.tmode` overrides the unit's own. */
export function pickTargets(inst, unit, settings) {
  if (!unit || !roleOf(unit)) return [];
  const mode = (settings && settings.tmode) || unit.tmode;
  const cmp = (ORDER[mode] || ORDER[DEFAULT_TARGET_MODE])(inst, unit);
  return engaged(inst).sort((a, b) => cmp(a, b) || dist2(a, unit) - dist2(b, unit) || a.id - b.id);
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
  const free = engaged(inst).filter((m) => m.target === k.id && m.queued && !(m.holdMs > 0) && cheb(m, k) > 1);
  if (!free.length || sc.rng.int(1, 1000) > row.peel) return null;
  retarget(free[0], hero.id, sc);
  return free[0];
}

/* ── THE CHALLENGE (spec §3.2 #14, TG-08; Tyler 2026-10-16) ─────────────────
   "The tank holds and auto-casts Challenge whenever an engaged on-screen monster
   is not targeting him. Monsters can switch targets." ONE Challenge, for EVERY
   tank in the party: the `challenge` ability (src/data/abilities.js: its cooldown
   is the ability's cdMs, on the unit's `cds` clock, so the auto-cast and the bar
   slot are one clock and never fire twice). It takes every engaged monster within
   CHALLENGE.radius that is not on the tank and not HELD by another tank's
   Challenge; each one it takes is held CHALLENGE.holdMs. Without the hold a
   second tank's Challenge was undone by the first tank's on the next 100 ms
   sub-step (live 2026-10-21: the second hero took no blow, its Defense stayed 1). */
const CHALLENGE_ROW = ABILITIES.challenge;
const challengeReady = (k, atMs) => !(k.cds && Number.isInteger(k.cds.challenge) && k.cds.challenge > atMs);

/** The monsters a Challenge by tank `k` would take now (none when `k` is not a living tank). */
export function challengeable(inst, k) {
  const row = roleOf(k);
  if (!row || !row.tank || !k.alive) return [];
  return engaged(inst).filter((m) => m.target !== k.id && !(m.holdMs > 0) && cheb(m, k) <= CHALLENGE.radius);
}

/**
 * THE CHALLENGE'S EFFECT, the one writer of a taunt: every monster `challengeable`
 * names turns on `k`, leaves its queue and is held. Answers how many it took.
 * Emits `target` per monster and one `challenge`; the clock is the caller's.
 */
export function challengeFrom(inst, sc, k) {
  const took = challengeable(inst, k);
  for (const m of took) { retarget(m, k.id, sc); m.queued = false; m.holdMs = CHALLENGE.holdMs; }
  if (took.length) sc.emit(makeEvent('challenge', sc.atMs, { u: k.id }));
  return took.length;
}

/* The auto-cast: every living tank, in id order, whose Challenge is ready and finds a monster.
   It is the ability's cast (a `cast` event: the bar's cooldown, the hunt screen's "Challenge"). */
function autoChallenge(inst, sc) {
  for (const k of inst.world.units) {
    if (!challengeReady(k, sc.atMs) || !challengeable(inst, k).length) continue;
    sc.emit(makeEvent('cast', sc.atMs, { u: k.id, ability: CHALLENGE_ROW.id, t: k.id, mana: 0,
      magicXpMult: CHALLENGE_ROW.magicXpMult, source: 'own', gold: 0 }));
    challengeFrom(inst, sc, k);
    k.cds = Object.assign({}, k.cds || {}, { [CHALLENGE_ROW.id]: sc.atMs + CHALLENGE_ROW.cdMs });
  }
}

/* Is any engaged monster on hero `u` (it holds them: a tank's hold, a peeled healer)? */
const holding = (inst, u) => engaged(inst).some((m) => m.target === u.id);

/**
 * Phase-AI hook, every sub-step: holds run down, monsters whose target fell turn
 * on the leader (TG-05/06), every tank Challenges, then every hero with a role
 * picks its target:
 *   a MELEE hero no monster is on (a second tank, a Melee DPS) keeps the target it
 *   stands beside until it falls, else takes its MARK, the first its Target
 *   setting names, wherever it stands (roles.js closeIn walks it there);
 *   any other hero hits the best it can reach, else keeps one to walk to.
 * A hero with nothing to hit while the leader is on the move follows him instead
 * (RO-05, movement.followTrail follows a hero with no target).
 */
export function chooseTargets(inst, sc) {
  const k = leaderOf(inst);
  for (const m of inst.world.units) if (m.holdMs > 0) m.holdMs = Math.max(0, m.holdMs - sc.dtMs);
  for (const m of engaged(inst)) {
    const t = unitById(inst, m.target);
    if (!t || !t.alive) { retarget(m, k && k !== t ? k.id : null, sc); m.holdMs = 0; }
  }
  autoChallenge(inst, sc);
  const fighting = inst.world.phase === 'fight';
  const leaderMoving = !!k && k.path.length > 0;
  for (const u of inst.world.units) {
    if (!roleOf(u)) continue;
    if (!u.alive || !fighting) { u.target = null; continue; }
    const marks = roleOf(u).melee && u.chase && !holding(inst, u);
    const cur = marks ? unitById(inst, u.target) : null;
    /* Kept while it stands beside it or walks a path that ends beside it (roles.js closeIn's pick). */
    const enRoute = !!cur && !!u.goal && u.path.length > 0 && cheb({ x: u.goal[0], y: u.goal[1] }, cur) <= 1;
    if (cur && cur.alive && Number.isInteger(cur.target) && (inRange(inst, u, cur) || enRoute)) continue;
    const b = marks ? null : basicTarget(inst, u);
    const all = !b && (u === k || !leaderMoving) ? pickTargets(inst, u) : [];
    const first = b || all.find((m) => elementOn(m, u.element) > 0) || all[0] || null;
    const id = first ? first.id : null;
    /* A new mark is walked to at once, not after the last walk's re-aim clock (roles.js closeIn). */
    if (marks && id !== u.target) u.aiMs = 0;
    u.target = id;
  }
}
