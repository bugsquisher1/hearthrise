// ============================================================
// src/core/hunt/status.js — STATUS STACKS (spec §3.3, parity ST-01..06)
//
// Generic stacks: the engine knows stack, tick, refresh and expiry, never a
// status by name; every number is a src/data/statuses.js row. Bleed is the
// first row. Any unit carries stacks, hero or monster (ST-06).
//
// A STACK, persisted on its unit as `statuses` (world-state composes it):
//   { s: status id, src: source unit id or null, left: ms to expiry,
//     next: ms to its next tick, scale: permille, fixed when it landed }
// Every field is an integer or a string, so a settle cut anywhere between
// swings resumes the same stack (world-step#split-parity).
//
// RULES
//   applyStatus  a dead unit takes nothing. Reapplying REFRESHES every stack
//                of that status on the unit, then adds one if under maxStacks
//                (ST-01). The scale is fixed now (spec §3.3 #6):
//                (1000 + skillLv x skillPermillePerLevel) x tierPermille[tier-1] / 1000
//   tickStatuses each sub-step, units in id order, stacks in landing order:
//                left and next fall by dtMs; a due stack ticks (left >= 0, so
//                a 6 s stack ticks six times); the tick is round(roll x scale
//                / 1000), dealt through damage.js landHit() as the row's
//                damageType (bleed: physical, ST-05) with ability = status id,
//                so the one hurt() owns mitigation and landHit the `dmg` event and the
//                kill hand-off (ST-04). Then expired stacks go; a unit that
//                died drops all of its stacks.
//
// DICE. One `sc.rng.int(min, max)` per tick of a row whose tick is a range, in
// the order above; a fixed tick draws nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { STATUSES, validateStatus } from '../../data/statuses.js?v=0.2.30';
import { makeEvent } from './events.js?v=0.2.30';
import { landHit } from './damage.js?v=0.2.30';

export const PERSISTED = Object.freeze({ unit: Object.freeze([['statuses', 'json']]), world: Object.freeze([]), pack: Object.freeze([]) });

/** The status row of `id` (throws on an unknown id: a stack never outlives its row). */
export function statusRow(id) {
  const row = Object.prototype.hasOwnProperty.call(STATUSES, id) ? STATUSES[id] : null;
  if (!row) throw new Error('status: unknown status ' + id);
  return row;
}

/** The permille scale a stack of `row` lands with, from its source's level and rune tier. Refuses, never clamps. */
export function stackScale(row, source) {
  const lv = source && source.skillLv !== undefined && source.skillLv !== null ? source.skillLv : 0;
  const tier = source && source.runeTier !== undefined && source.runeTier !== null ? source.runeTier : 1;
  if (!Number.isInteger(lv) || lv < 0) throw new Error('status: source skillLv must be an integer >= 0, got ' + lv);
  if (!Number.isInteger(tier) || tier < 1 || tier > row.tierPermille.length) {
    throw new Error('status: rune tier ' + tier + ' is outside 1..' + row.tierPermille.length + ' for ' + row.id);
  }
  return Math.floor(((1000 + lv * row.skillPermillePerLevel) * row.tierPermille[tier - 1]) / 1000);
}

/** One tick's damage from a base roll and a stack's permille scale. */
export const tickAmount = (roll, scale) => Math.floor((roll * scale + 500) / 1000);

const stacksOf = (unit) => (Array.isArray(unit.statuses) ? unit.statuses : []);
const countOf = (unit, id) => stacksOf(unit).filter((st) => st.s === id).length;

/**
 * Put `row`'s status on `unit` from `source` ({ u: unit id or null, skillLv,
 * runeTier }). Answers the unit's stack count of that status, or null when
 * nothing landed (a dead or absent unit).
 */
export function applyStatus(inst, unit, row, source, sc) {
  if (!unit || unit.alive !== true) return null;
  const bad = validateStatus(row);
  if (bad.length) throw new Error('applyStatus: ' + bad.join('; '));
  if (statusRow(row.id) !== row) throw new Error('applyStatus: ' + row.id + ' is not the statuses.js row');
  const scale = stackScale(row, source);
  const list = stacksOf(unit).slice();
  for (const st of list) if (st.s === row.id) st.left = row.durationMs;
  const before = countOf({ statuses: list }, row.id);
  if (before < row.maxStacks) {
    const src = source && Number.isSafeInteger(source.u) ? source.u : null;
    list.push({ s: row.id, src, left: row.durationMs, next: row.everyMs, scale });
  }
  unit.statuses = list;
  const stacks = countOf(unit, row.id);
  sc.emit(makeEvent('status_on', sc.atMs, { t: unit.id, status: row.id, stacks }));
  return stacks;
}

/** Status hook: stacks tick and expire. */
export function tickStatuses(inst, sc) {
  const units = inst.world.units;
  for (const unit of units) {
    const list = stacksOf(unit);
    if (!list.length) continue;
    if (unit.alive !== true) { dropAll(unit, sc); continue; }
    for (const st of list) {
      st.left -= sc.dtMs;
      st.next -= sc.dtMs;
      if (st.next > 0 || st.left < 0) continue;
      const row = statusRow(st.s);
      st.next += row.everyMs;
      const roll = row.tick[0] === row.tick[1] ? row.tick[0] : sc.rng.int(row.tick[0], row.tick[1]);
      const amount = tickAmount(roll, st.scale);
      const source = st.src === null ? null : (units.find((u) => u.id === st.src) || null);
      sc.emit(makeEvent('status_tick', sc.atMs, { t: unit.id, status: st.s, amount, element: row.damageType }));
      landHit(inst, sc, source, unit, amount, row.damageType, { id: st.s });
      if (unit.alive !== true) break;
    }
    if (unit.alive !== true) { dropAll(unit, sc); continue; }
    const gone = new Set(list.filter((st) => st.left <= 0).map((st) => st.s));
    unit.statuses = list.filter((st) => st.left > 0);
    for (const id of gone) if (!countOf(unit, id)) sc.emit(makeEvent('status_off', sc.atMs, { t: unit.id, status: id }));
  }
}

/* A unit that died carries nothing on (each status it held ends once). */
function dropAll(unit, sc) {
  const ids = [...new Set(stacksOf(unit).map((st) => st.s))];
  unit.statuses = [];
  for (const id of ids) sc.emit(makeEvent('status_off', sc.atMs, { t: unit.id, status: id }));
}
