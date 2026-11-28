// ============================================================
// src/core/hunt/cast-targets.js — WHOM A CAST WITH PIECES TAKES, AND WHAT ITS STATUS DOES (lane/talent-effects; a modded row's `fx`,
// src/core/hunt/talent-rows.js moddedRow). abilities.js reads these where it picks a target and where the cast lands; a row with no `fx`
// reads exactly the bar's old rule (the reach the hero's, the lowest share of health first, every unit a shape covers).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { heals } from '../../data/abilities.js';
import { inReach } from './abilities.js';
import { applyStatus, statusRow, stretchStatus, tuneStacks } from './status.js';
import { covers } from './shapes.js';
import { dist2 } from './grid.js';
import { livingOf, targetedFoesOf } from './unit-index.js';
import { sideOf, isAlly } from './sides.js';

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const allies = (inst, u) => livingOf(inst, sideOf(u));
const engaged = (inst, u) => targetedFoesOf(inst, sideOf(u));

/* AN ALLY ROW'S REACH: the hero's (1 = Melee), or a borrowed row's native reach (`reach`, talent-rows.js lend: Greater Mend lent to a
   sword reaches the healer's 7 tiles), and the row's own more (fx.range, whole tiles) */
export const reachOf = (h, row) => (Number.isInteger(row.reach) ? Math.max(1, row.reach) : Math.max(1, int(h && h.range) || 1))
  + (row.fx && row.fx.range > 0 ? row.fx.range : 0);
/* the engaged monsters on unit `a` */
const heldOnCount = (inst, a) => engaged(inst, a).filter((m) => m.target === a.id).length;
/* WHOM AN ALLY ROW TAKES FIRST from `list`: the lowest share of health (ties by id), or with the row's pick `most_held` (Tank Ward) the
   ally the most monsters are on, then the lowest share. A new list, sorted. */
export function allyOrder(inst, hero, row, list) {
  const share = (u) => (int(u.maxHp) > 0 ? (int(u.hp) * 100) / int(u.maxHp) : 100);
  const most = row.fx && row.fx.pick === 'most_held';
  return list.slice().sort((a, b) => (most ? heldOnCount(inst, b) - heldOnCount(inst, a) : 0) || (share(a) - share(b)) || (a.id - b.id));
}

/* ── THE ENGINE PIECES ON A CAST (lane/talent-effects: a modded row's `fx`, src/core/hunt/talent-rows.js moddedRow) ── */

/* AN ALLY ROW'S TARGETS: `t`, and with more targets (fx.extra, Twin Ward) the next the row would take (targetFor's rule: wounded, in its
   reach, a shell only on one holding none; allyOrder's order), never `t` twice */
export function allyTargets(inst, u, row, t) {
  const n = row.fx && row.fx.extra > 0 ? row.fx.extra : 0;
  if (!n) return [t];
  const reach = reachOf(inst.heroes && inst.heroes[u.id], row);
  const share = (a) => (int(a.maxHp) > 0 ? (int(a.hp) * 100) / int(a.maxHp) : 100);
  const ok = (a) => a !== t && a.alive === true && isAlly(u, a) && share(a) < 100 && (heals(row) || !(int(a.shield) > 0)) && (a === u || inReach(inst, u, reach, a));
  return [t, ...allyOrder(inst, u, row, allies(inst, u).filter(ok)).slice(0, n)];
}

/* A PARTY ROW'S HEROES in id order; with fx.limit (Deep Shelter) only that many of those in its radius, by its pick (the lowest share of
   health first, ties by id) */
export function partyOf(inst, u, row) {
  const all = allies(inst, u).slice().sort((x, y) => x.id - y.id);
  const n = row.fx && row.fx.limit > 0 ? row.fx.limit : 0;
  if (!n) return all;
  const r2 = row.radius * row.radius;
  const share = (a) => (int(a.maxHp) > 0 ? (int(a.hp) * 1000) / int(a.maxHp) : 1000);
  const keep = new Set(all.filter((a) => a === u || dist2(a, u) <= r2).sort((a, b) => (share(a) - share(b)) || (a.id - b.id)).slice(0, n));
  return all.filter((a) => keep.has(a));
}

/* AN AREA THAT TAKES ONLY ONE (fx.pick 'target': Pinning Frost, Single Dose): the hero's own target when the shape covers it, else the aim,
   else the nearest it covers (ties by id). A predicate over the covered list; every unit for a row without it. */
export function onlyOne(inst, u, t, row, s) {
  if (!(row.fx && row.fx.pick === 'target')) return () => true;
  const cov = engaged(inst, u).filter((o) => covers(s, o.x, o.y));
  const one = cov.find((o) => o.id === u.target) || cov.find((o) => o === t)
    || cov.slice().sort((a, b) => (dist2(a, u) - dist2(b, u)) || (a.id - b.id))[0] || null;
  return (o) => o === one;
}

/* A CAST'S STATUS WITH PIECES on `m`: its strength (fx.statusPm, permille more or less of what it does) and its wind-up share (fx.windupSlowPm,
   Slowing Frost) on the stacks this caster holds there (status.js tuneStacks), and a second status beside it (fx.also: Weakening
   Sickness's Sapped), as long as the first */
export function tuneAfflict(inst, sc, u, m, row, fx, hit, tier) {
  if (fx.statusPm || fx.windupSlowPm) tuneStacks(m, row.status, u.id, fx.statusPm ? 1000 + fx.statusPm : undefined, fx.windupSlowPm || undefined);
  if (!fx.also || m.alive !== true) return;
  applyStatus(inst, m, statusRow(fx.also), { u: u.id, maxHit: hit, runeTier: tier }, sc);
  if (row.statusMs > 0) stretchStatus(m, fx.also, u.id, row.statusMs);
}

