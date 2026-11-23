// ============================================================
// src/core/hunt/status.js — STATUS STACKS (spec §3.3, parity ST-01..06; the general status system, lane/e2-e3-statuses, E2)
//
// Generic stacks: the engine knows stack, tick, key, refresh and expiry, never a status by name; every number is a
// src/data/statuses.js row. Any unit carries stacks, hero or monster (ST-06). What a stack DOES to its unit (more or less damage taken
// or dealt, defence, slow, silence, a heal cut) is read by status-effects.js; this file lands, ticks and ends them.
//
// A STACK, persisted on its unit as `statuses` (world-state composes it):
//   { s: status id, src: source unit id or null, left: ms to expiry, next: ms to its next tick, scale: permille, fixed when it landed,
//     at?: [x, y] a ground patch's tile }
// Every field is an integer, a string or a pair of integers, so a settle cut anywhere between swings resumes the same stack
// (world-step#split-parity). A GROUND stack (statuses.js `ground`, burning ground) is held by the unit that placed it.
//
// RULES
//   applyStatus  a dead unit takes nothing. The scale is fixed now (spec §3.3 #6, stackScale). By the row's refresh (statuses.js):
//                  restart  every stack of the key (an `add` key: of the row) restarts to the row's durationMs (ST-01); a stack of
//                           this row that does not tick is lifted to a stronger scale (never lowered); under maxStacks one more lands;
//                           at maxStacks the weakest stack of ANOTHER row of the key is replaced, when the landing is stronger
//                  keep     the stacks keep their clocks; at maxStacks the oldest of the key goes; the landing is added
//                The stack count of a `strongest` key is the key's (every row of it), of an `add` key the row's.
//   tickStatuses each sub-step, units in id order, stacks in landing order:
//                left and next fall by dtMs; a due stack of a ticking row ticks (left >= 0, so a 6 s stack ticks six times);
//                the tick is round(roll x scale / 1000):
//                  damage  dealt through damage.js landHit() as the row's damageType (bleed: physical, ST-05) with ability = status
//                          id and `dot` (a tick is not a blow: it is never dodged and trains no Defense), so the one hurt() owns
//                          mitigation and landHit the `dmg` event and the kill hand-off (ST-04)
//                  heal    (`heals`) its unit's HP, cut by heal-cut.js healTaken and never past its max: a `heal` naming the status
//                  ground  every living enemy of the holder within the row's r of the patch, in id order, one roll for all
//                Then expired stacks go; a unit that died drops all of its stacks.
//
// DICE. One `sc.rng.int(min, max)` per tick of a row whose tick is a range, in the order above; a fixed tick draws nothing.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { STATUSES, STATUS_KEYS, validateStatus, ticks, slowAt } from '../../data/statuses.js';
import { heroElementPermille } from '../elements.js';
import { makeEvent } from './events.js';
import { landHit } from './damage.js';
import { healTaken } from './heal-cut.js';
import { isHero, isEnemy } from './sides.js';
import { cheb } from './grid.js';

export const PERSISTED = Object.freeze({ unit: Object.freeze([['statuses', 'json']]), world: Object.freeze([]), pack: Object.freeze([]) });

/** The status row of `id` (throws on an unknown id: a stack never outlives its row). */
export function statusRow(id) {
  const row = Object.prototype.hasOwnProperty.call(STATUSES, id) ? STATUSES[id] : null;
  if (!row) throw new Error('status: unknown status ' + id);
  return row;
}

/** The permille scale a stack of `row` lands with, from its source's largest blow (`maxHit`) and rune tier. Refuses, never clamps.
    A status with no scaled effect (takenPm, dealtPm, armorPm, silence) is 1000. A SLOWING one (slowPm) is scaled by its rune tier alone
    when its row carries `tierPermille` (statuses.js slowAt reads the stack's slow off it), else 1000. A HEAL-CUTTING one (healCutPm,
    Withered) on a HERO `unit` is the share of a blow of its `guard` element the hero takes (its resistance, elements.js
    heroElementPermille: a guard lowers the cut by the same percent, heal-cut.js reads it), 1000 with none and on a monster. */
export function stackScale(row, source, unit) {
  if (row.healCutPm) return isHero(unit) && row.guard ? heroElementPermille(unit.resistPm, row.guard) : 1000;
  if (!ticks(row) && !row.tierPermille) return 1000;
  /* (a source with no blow, a stack a fixture lands: 1, so its tick is the floor of one point) */
  const hit = source && source.maxHit !== undefined && source.maxHit !== null ? source.maxHit : 1;
  const tier = source && source.runeTier !== undefined && source.runeTier !== null ? source.runeTier : 1;
  if (!Number.isInteger(hit) || hit < 1) throw new Error('status: source maxHit must be an integer >= 1, got ' + hit);
  if (!Number.isInteger(tier) || tier < 1 || tier > row.tierPermille.length) {
    throw new Error('status: rune tier ' + tier + ' is outside 1..' + row.tierPermille.length + ' for ' + row.id);
  }
  if (!ticks(row)) return row.tierPermille[tier - 1];
  return Math.max(row.tierPermille[tier - 1], Math.floor((hit * row.blowPm * row.tierPermille[tier - 1]) / 1000));
}

/** One tick's damage from a base roll and a stack's permille scale. */
export const tickAmount = (roll, scale) => Math.floor((roll * scale + 500) / 1000);

const stacksOf = (unit) => (Array.isArray(unit.statuses) ? unit.statuses : []);
/* a stack's row (stacks only ever name a registry row: statusRow throws otherwise) */
const rowOf = (st) => statusRow(st.s);
/* the stacks a landing of `row` counts against and refreshes: its key's (a strongest key) or its own (an add key) */
const sameStack = (row) => (STATUS_KEYS[row.key].combine === 'add' ? (st) => st.s === row.id : (st) => rowOf(st).key === row.key);
const countOf = (unit, id) => stacksOf(unit).filter((st) => st.s === id).length;
/* HOW STRONG a stack is, to compare two rows of one key (statuses.js validate: rows of a key share their effects): the size of every
   effect it carries at its scale, summed (a tick: its mean roll at its scale) */
function strength(row, scale) {
  let n = 0;
  if (ticks(row)) n += tickAmount(row.tick[0] + row.tick[1], scale);
  for (const k of ['takenPm', 'dealtPm', 'armorPm']) if (Number.isInteger(row[k])) n += Math.abs(row[k]);
  if (row.slowPm) n += slowAt(row, scale);
  if (row.healCutPm) n += Math.floor(((row.healCutPm.hero + row.healCutPm.monster) * scale) / 1000);
  if (row.silence) n += 1;
  return n;
}

/**
 * Put `row`'s status on `unit` from `source` ({ u: unit id or null, maxHit, runeTier, at?: [x, y] a ground patch's tile }). Answers
 * the unit's stack count of that status, or null when nothing landed (a dead or absent unit).
 */
export function applyStatus(inst, unit, row, source, sc) {
  if (!unit || unit.alive !== true) return null;
  const bad = validateStatus(row);
  if (bad.length) throw new Error('applyStatus: ' + bad.join('; '));
  if (statusRow(row.id) !== row) throw new Error('applyStatus: ' + row.id + ' is not the statuses.js row');
  const at = row.ground ? source && source.at : null;
  if (row.ground && !(Array.isArray(at) && at.length === 2 && at.every(Number.isSafeInteger))) throw new Error('applyStatus: a ground status needs its tile (source.at)');
  const scale = stackScale(row, source, unit);
  const mine = sameStack(row);
  let list = stacksOf(unit).slice();
  const src = source && Number.isSafeInteger(source.u) ? source.u : null;
  const fresh = () => ({ s: row.id, src, left: row.durationMs, next: ticks(row) ? row.everyMs : 0, scale, ...(at ? { at: [at[0], at[1]] } : {}) });
  if (row.refresh === 'keep') {
    /* KEEP: the stacks there run on; at maxStacks the oldest of the key goes */
    if (list.filter(mine).length >= row.maxStacks) { const old = list.find(mine); list = list.filter((st) => st !== old); }
    list.push(fresh());
  } else {
    for (const st of list) if (mine(st)) st.left = row.durationMs;
    /* A status that does not tick acts as its strongest stack (status-effects.js effectPm), so a refresh by a stronger landing
       lifts the refreshed stack to it, never lowers it: a Graven Frost Slam on a monster a Chalked Hoarfrost chilled slows it 50%. */
    if (!ticks(row)) for (const st of list) if (st.s === row.id && scale > st.scale) st.scale = scale;
    const before = list.filter(mine).length;
    if (before < row.maxStacks) list.push(fresh());
    else {
      /* AT maxStacks: the weakest stack of ANOTHER row of the key gives way to a stronger landing (15: "the stronger one replaces") */
      let weak = null;
      for (const st of list) if (mine(st) && st.s !== row.id && (!weak || strength(rowOf(st), st.scale) < strength(rowOf(weak), weak.scale))) weak = st;
      if (weak && strength(row, scale) > strength(rowOf(weak), weak.scale)) {
        const gone = weak.s;
        list = list.map((st) => (st === weak ? fresh() : st));
        if (!list.some((st) => st.s === gone)) sc.emit(makeEvent('status_off', sc.atMs, { t: unit.id, status: gone }));
      }
    }
  }
  unit.statuses = list;
  const stacks = countOf(unit, row.id);
  sc.emit(makeEvent('status_on', sc.atMs, { t: unit.id, status: row.id, stacks, ...(at ? { x: at[0], y: at[1] } : {}) }));
  return stacks;
}

/* ONE TICK of a ticking stack `st` of `row` held by `unit`: a damage tick on it, a heal tick on it, or a ground patch's tick on every
   enemy of its holder standing in it. Answers nothing; the unit's `alive` tells the caller whether it fell. */
function tickOne(inst, sc, unit, row, st, units) {
  const roll = row.tick[0] === row.tick[1] ? row.tick[0] : sc.rng.int(row.tick[0], row.tick[1]);
  const amount = tickAmount(roll, st.scale);
  if (row.heals) {
    const got = Math.max(0, Math.min(healTaken(unit, amount), Math.floor(Number(unit.maxHp) || 0) - Math.floor(Number(unit.hp) || 0)));
    sc.emit(makeEvent('status_tick', sc.atMs, { t: unit.id, status: st.s, amount: got, heals: true }));
    if (got > 0) {
      unit.hp = Math.floor(Number(unit.hp) || 0) + got;
      sc.emit(makeEvent('heal', sc.atMs, { u: st.src === null ? unit.id : st.src, t: unit.id, amount: got, ability: st.s }));
    }
    return;
  }
  if (row.ground) {
    const r = row.ground.r;
    sc.emit(makeEvent('status_tick', sc.atMs, { t: unit.id, status: st.s, amount, element: row.damageType, x: st.at[0], y: st.at[1] }));
    for (const m of units) {
      if (m.alive !== true || !isEnemy(unit, m) || cheb(m, { x: st.at[0], y: st.at[1] }) > r) continue;
      landHit(inst, sc, unit, m, amount, row.damageType, { id: st.s, dot: true });
    }
    return;
  }
  const source = st.src === null ? null : (units.find((u) => u.id === st.src) || null);
  sc.emit(makeEvent('status_tick', sc.atMs, { t: unit.id, status: st.s, amount, element: row.damageType }));
  landHit(inst, sc, source, unit, amount, row.damageType, { id: st.s, dot: true });
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
      const row = rowOf(st);
      /* A status that does not tick (a mark, a slow, a heal cut, a silence) only wears off: status-effects.js reads what it does. */
      if (!ticks(row)) continue;
      st.next -= sc.dtMs;
      if (st.next > 0 || st.left < 0) continue;
      st.next += row.everyMs;
      tickOne(inst, sc, unit, row, st, units);
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
