// ============================================================
// src/core/hunt/conditions.js — THE CONDITIONAL ACTION ENGINE (Tyler 2026-10-18)
//
// ONE deterministic condition system for every combat action a hero takes:
// an ability (abilities.js), a food or a drink (consumables.js), and the ammo
// a basic attack looses (damage.js). Not a scripting language: a slot is
//   { action: { type, id }, conditions: [≤ MAX_CONDITIONS { metric, op, value, subject? }], join }
// and the hero's BAR is a list of slots. Slot order IS priority: when an
// action lane is free, its slots are walked in order and the first one whose
// conditions pass AND whose action can happen fires; the next is the fallback
// (a choice with no stock, no target, no mana or a closed lane falls through).
// Ties never arise: slot order is total, and inside a slot every candidate
// (an aim, an ally) is ordered by unit id. The RULE ID is the slot's index in
// the stored bar; every decision event carries it (`rule`) and which
// conditions passed (`pass`, a bit per condition, so it is bounded).
//
// DEFAULT CONDITIONS. A slot with no conditions takes its action's defaults:
// an ability its own trigger (a self-shield under its row's whenBelowPct, an
// ally heal under it for the lowest ally, an area at ABILITY_RULES.areaMin
// monsters); food the hero's eat-at (self_hp_pct below food_below_pct) and
// drink its drink-at. So the eat-at / drink-at options are not a second
// system: they are the values of the default consume slots (defaultSlots).
// Each lane with no slot of its own takes its defaults: the role's rule set
// (src/data/rule-subjects.js ROLE_RULES) for abilities, drink then food for
// the consumable lane, the loaded ammo for the basic attack.
//
// THE AREA FOOTPRINT (enemies_in_aoe; the area a shot or a cast hits). A
// footprint is an n x n square of tiles placed on a candidate AIM: every
// engaged monster the hero can reach (range + line of sight). An odd n is
// centred on the aim; an EVEN n has no centre, so it is placed with the aim
// on the cell at index n/2 - 1 from its north-west corner (a 4x4 covers aim
// -1 .. aim +2 on both axes, reaching south-east). Fixed, so the same world
// always counts the same. The metric is the most monsters any aim covers; the
// action fires at that aim (ties: the hero's own target, then the lowest id).
//
// STOP RULES ({ conditions, join, forMs }; the hero's options.stop_rules): a
// hero whose stop rule has held forMs without a break ends its hunt `rule`
// at its next swing boundary (action-rules.js END_ORDER). The hold is
// persisted on its unit (`ruleHold`), so a settle cut never resets it.
//
// INJECTED (inst.heroes[unitId]): `slots` (the bar, normalised) or the
// shorthand `bar` (ability ids, each a slot with no conditions), `stopRules`,
// `hs` (its supplies), `range`, `ammo`, `items` (the server's item catalogue;
// the static one when absent), `foodBelowPct` / `drinkBelowPct`.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { METRICS, OPERATORS, MAX_CONDITIONS, MAX_STOP_RULES, STOP_HOLD_MS, ACTION_TYPES, CONSUME_KINDS, EFFECT_IDS } from '../../data/condition-metrics.js?v=0.1.0';
import { ABILITIES, ABILITY_RULES } from '../../data/abilities.js?v=0.1.0';
import { CONSUMABLES, CONSUMABLE_RULES } from '../../data/consumables.js?v=0.1.0';
import { SUPPLIES } from '../../data/supplies.js?v=0.1.0';
import { ITEMS } from '../../data/items.js?v=0.1.0';
import { MONSTERS } from '../../data/monsters.js?v=0.1.0';
import { ROLE_RULES } from '../../data/rule-subjects.js?v=0.1.0';
import { cheb, dist2, los } from './grid.js?v=0.1.0';
import { makeEvent } from './events.js?v=0.1.0';

/* ruleHold: ms each stop rule has held, by rule index (null = none held).
   ruleWait: the last `rule_wait` reported, per lane ('rule:why'), so it is reported once. */
export const PERSISTED = Object.freeze({
  unit: Object.freeze([['ruleHold', 'json'], ['ruleWait', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const METRIC = new Map(METRICS.map((m) => [m.id, m]));
const JOINS = Object.freeze(['and', 'or']);
/* Which lane a slot's action takes. */
export const LANE_OF = Object.freeze({ ability: 'ability', consume: 'consume', attack_with_item: 'attack' });

/* ── THE SLOT, NORMALISED ─────────────────────────────────────────────── */

/** A stored slot in the engine's shape: an ability id is a slot with no conditions; null / junk is null. */
export function normalizeSlot(s) {
  if (typeof s === 'string') return { action: { type: 'ability', id: s }, conditions: [], join: 'and' };
  if (!isObj(s) || !isObj(s.action)) return null;
  return {
    action: { type: String(s.action.type), id: String(s.action.id) },
    conditions: Array.isArray(s.conditions) ? s.conditions.map((c) => (isObj(c) ? { metric: c.metric, op: c.op, value: c.value,
      ...(c.subject !== undefined && c.subject !== null ? { subject: c.subject } : {}) } : null)) : [],
    join: s.join === 'or' ? 'or' : 'and',
  };
}

/* ── VALIDATION (the server's hr_hunt_bar_check / hr_hunt_stop_rules_check, mirrored) ── */

/** The item kind an action id names, or null: abilities by row, food/drink by kind or item, ammo by supply row. */
function actionKnown(type, id) {
  if (type === 'ability') return !!ABILITIES[id];
  if (type === 'consume') return Object.prototype.hasOwnProperty.call(CONSUME_KINDS, id) || !!(CONSUMABLES[id] && CONSUMABLES[id].source === 'own');
  if (type === 'attack_with_item') return !!(SUPPLIES[id] && SUPPLIES[id].kind === 'ammo');
  return false;
}

/** Why a condition is refused, or null. `stop` = in a stop rule (no slot to read). */
function conditionProblem(c, stop) {
  if (!isObj(c)) return 'bad_condition';
  const extra = Object.keys(c).filter((k) => !['metric', 'op', 'value', 'subject'].includes(k));
  if (extra.length) return 'bad_condition';
  const m = METRIC.get(c.metric);
  if (!m || (stop && m.slotOnly)) return 'bad_metric';
  if (!m.ops.includes(c.op) || !OPERATORS[c.op]) return 'bad_op';
  if (m.range) { if (!Number.isInteger(c.value) || c.value < m.range[0] || c.value > m.range[1]) return 'bad_value'; }
  else if (m.value === 'bool') { if (typeof c.value !== 'boolean') return 'bad_value'; }
  else if (m.value === 'effect') { if (!EFFECT_IDS.includes(c.value)) return 'bad_value'; }
  if (m.subject) {
    if (c.subject !== undefined && !Object.prototype.hasOwnProperty.call(m.subject, c.subject)) return 'bad_subject';
    if (stop && c.subject === 'item') return 'bad_subject';
  } else if (c.subject !== undefined) return 'bad_subject';
  return null;
}

function conditionsProblem(conds, join, stop) {
  if (conds !== undefined && !Array.isArray(conds)) return { error: 'bad_condition' };
  const list = conds || [];
  if (list.length > MAX_CONDITIONS) return { error: 'too_many_conditions' };
  if (join !== undefined && !JOINS.includes(join)) return { error: 'bad_join' };
  for (let i = 0; i < list.length; i++) {
    const why = conditionProblem(list[i], stop);
    if (why) return { error: why, condition: i };
  }
  return null;
}

/** Why one stored slot is refused, or null (null itself is an empty slot). */
export function slotProblem(s) {
  if (s === null || typeof s === 'string') return s === null || ABILITIES[s] ? null : { error: 'bad_action' };
  if (!isObj(s) || !isObj(s.action)) return { error: 'bad_action' };
  if (Object.keys(s).some((k) => !['action', 'conditions', 'join'].includes(k))) return { error: 'bad_slot' };
  if (!ACTION_TYPES[s.action.type] || typeof s.action.id !== 'string' || !actionKnown(s.action.type, s.action.id)) return { error: 'bad_action' };
  return conditionsProblem(s.conditions, s.join, false);
}

/** Why a whole bar is refused, or null. `max` = the slot cap (ACTION_SET_LIMITS.slots). */
export function barProblem(slots, max) {
  if (!Array.isArray(slots)) return { error: 'bad_slots' };
  if (slots.length > max) return { error: 'too_many_slots' };
  for (let i = 0; i < slots.length; i++) {
    const p = slotProblem(slots[i]);
    if (p) return Object.assign({ slot: i }, p);
  }
  return null;
}

/** Why a stop-rule list is refused, or null. */
export function stopRulesProblem(rules) {
  if (!Array.isArray(rules)) return { error: 'bad_stop_rules' };
  if (rules.length > MAX_STOP_RULES) return { error: 'too_many_stop_rules' };
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!isObj(r) || Object.keys(r).some((k) => !['conditions', 'join', 'forMs'].includes(k))) return { error: 'bad_stop_rule', rule: i };
    if (!Array.isArray(r.conditions) || !r.conditions.length) return { error: 'bad_stop_rule', rule: i };
    const f = r.forMs === undefined ? 0 : r.forMs;
    if (!Number.isInteger(f) || f < STOP_HOLD_MS.min || f > STOP_HOLD_MS.max || f % STOP_HOLD_MS.step) return { error: 'bad_hold', rule: i };
    const p = conditionsProblem(r.conditions, r.join, true);
    if (p) return Object.assign({ rule: i }, p);
  }
  return null;
}

/* ── THE SLOTS A HERO FIGHTS WITH ─────────────────────────────────────── */

/* The defaults a lane takes when the bar holds no slot for it. */
const DEFAULT_CONSUME = Object.freeze([
  Object.freeze({ action: Object.freeze({ type: 'consume', id: 'drink' }), conditions: Object.freeze([]), join: 'and' }),
  Object.freeze({ action: Object.freeze({ type: 'consume', id: 'food' }), conditions: Object.freeze([]), join: 'and' }),
]);

/**
 * WHERE A LANE'S DEFAULTS STAND on the bar: each fills the first EMPTY (null)
 * position, else goes on the end — the rule the server's settings view places
 * them by (hr_hunt_settings_view), so a rule id is the tablet the player sees.
 */
export function placeDefaults(list, defaults) {
  const out = list.slice();
  for (const d of defaults) {
    const i = out.indexOf(null);
    if (i >= 0) out[i] = d; else out.push(d);
  }
  return out;
}

/**
 * The hero's bar as the engine runs it: every stored slot (normalised; null = an
 * empty tablet), then, for each lane the stored bar leaves empty, that lane's
 * defaults (placeDefaults). `allowed(abilityId)` filters abilities to the hero's
 * discipline (hunt-spawn.js); `role` names its ROLE_RULES row. Answers
 * [{ rule, slot }] in priority order: the rule id is the slot's position.
 */
export function heroSlots(stored, role, allowed) {
  const keep = (s) => !!s && !slotProblem(s) && (s.action.type !== 'ability' || !allowed || allowed(s.action.id));
  let list = (Array.isArray(stored) ? stored : []).map((raw) => normalizeSlot(raw));
  const has = (lane) => list.some((s) => keep(s) && LANE_OF[s.action.type] === lane);
  if (!has('ability')) list = placeDefaults(list, (ROLE_RULES[role] || []).map(normalizeSlot).filter(keep));
  if (!has('consume')) list = placeDefaults(list, DEFAULT_CONSUME.map(normalizeSlot));
  const out = [];
  list.forEach((s, i) => { if (keep(s)) out.push({ rule: i, slot: s }); });
  return out;
}

/**
 * The rows `h` carries for one lane: its `slots` (heroSlots' rows, what the
 * settle injects), else its `bar` (the shorthand: ability ids, each a slot with
 * no conditions). Either way the consumable lane falls back to its defaults.
 */
export function slotsFor(h, lane) {
  if (!h) return [];
  let rows = Array.isArray(h.slots)
    ? h.slots.map((r, i) => (r && r.slot ? r : { rule: i, slot: normalizeSlot(r) }))
    : (Array.isArray(h.bar) ? h.bar : []).map((id, i) => ({ rule: i, slot: normalizeSlot(id) }));
  rows = rows.filter((r) => r.slot);
  if (lane === 'consume' && !rows.some((r) => r.slot.action.type === 'consume')) {
    const base = Array.isArray(h.slots) ? h.slots.length : Array.isArray(h.bar) ? h.bar.length : 0;
    rows = DEFAULT_CONSUME.map((s, i) => ({ rule: base + i, slot: normalizeSlot(s) }));
  }
  return rows.filter((r) => LANE_OF[r.slot.action.type] === lane);
}

/* ── THE FOOTPRINT ────────────────────────────────────────────────────── */

/** The [lo, hi] tile offsets of an n x n footprint round its aim (an even n reaches south-east). */
export function footprint(n) {
  const size = Math.max(1, int(n) || 1);
  const lo = size % 2 ? -(size - 1) / 2 : -(size / 2 - 1);
  return [lo, lo + size - 1];
}
/** Is unit `t` inside the n x n footprint aimed at `aim`? */
export function inFootprint(aim, n, t) {
  const [lo, hi] = footprint(n);
  const dx = t.x - aim.x; const dy = t.y - aim.y;
  return dx >= lo && dx <= hi && dy >= lo && dy <= hi;
}

/** The item row an id names: the injected catalogue (the server's), else the static one. */
export const itemRow = (h, id) => (h && h.items && h.items[id]) || ITEMS[id] || null;

/* A slot action's footprint side: an area ability is 3 (the aim and its ring), an
   attack item its row's `area` (1 = one target), everything else 1. */
export function footprintOf(slot, h) {
  const a = slot.action;
  if (a.type === 'ability') return ABILITIES[a.id] && ABILITIES[a.id].target === 'area' ? 3 : 1;
  if (a.type === 'attack_with_item') { const r = itemRow(h, a.id); return Math.max(1, int(r && r.area) || 1); }
  return 1;
}

const engagedMons = (inst) => inst.world.units.filter((u) => u.side === 'mon' && u.alive && Number.isInteger(u.target));
/* Can `hero` reach `t` with `range` tiles: adjacent for 1, else range + line of sight. */
export function reaches(inst, hero, range, t) {
  const r = Math.max(1, int(range) || 1);
  if (r <= 1) return cheb(hero, t) <= 1;
  return dist2(hero, t) <= r * r && los(inst.grid, hero, t);
}

/** The best aim for an n-footprint: { aim, count } over every reachable engaged monster, or null. */
export function bestAim(inst, hero, range, n) {
  const mons = engagedMons(inst);
  let best = null; let bc = -1;
  const cand = mons.filter((m) => reaches(inst, hero, range, m))
    .sort((a, b) => ((b.id === hero.target) - (a.id === hero.target)) || a.id - b.id);
  for (const c of cand) {
    const count = mons.filter((m) => inFootprint(c, n, m)).length;
    if (count > bc) { bc = count; best = c; }
  }
  return best ? { aim: best, count: bc } : null;
}

/* ── THE METRICS (one evaluator per registry row) ─────────────────────── */

/* A share as a ratio { n, d } (pct of a pool), so a test cross-multiplies: no floats. */
const share = (v, max) => (int(max) > 0 ? { n: int(v), d: int(max) } : { n: 1, d: 1 });
const heroesOf = (inst) => inst.world.units.filter((x) => x.side === 'hero' && x.alive).sort((a, b) => a.id - b.id);

/* "Whose": `lowest` = the lowest share among living heroes the hero can reach (it
   included); a role id = the first living hero of that role. Null = nobody. */
function allyOf(cx, subject, stat) {
  const max = stat === 'hp' ? 'maxHp' : 'maxMana';
  const all = heroesOf(cx.inst);
  if (subject && subject !== 'lowest') return all.find((a) => a.role === subject) || null;
  const pool = all.filter((a) => (stat === 'hp' || int(a.maxMana) > 0) && (a === cx.u || reaches(cx.inst, cx.u, cx.h && cx.h.range, a)));
  return pool.sort((a, b) => (int(a[stat]) * int(b[max]) - int(b[stat]) * int(a[max])) || a.id - b.id)[0] || null;
}

const leftOf = (hs, id) => { const l = hs && hs.bag && hs.bag[id]; return l ? Math.max(0, int(l.left)) : 0; };
function kindLeft(hs, kind) {
  let n = 0;
  for (const id of Object.keys((hs && hs.bag) || {})) {
    const c = CONSUMABLES[id];
    if (c && c.source === 'own' && c.kind === kind) n += leftOf(hs, id);
  }
  return n;
}
/* The stock a slot's own action draws on. */
function slotStock(cx) {
  const a = cx.slot && cx.slot.action;
  const hs = cx.h && cx.h.hs;
  if (!a) return 0;
  if (a.type === 'consume') return CONSUME_KINDS[a.id] ? kindLeft(hs, a.id) : leftOf(hs, a.id);
  if (a.type === 'attack_with_item') return leftOf(hs, a.id);
  const row = ABILITIES[a.id];
  return row && row.rune ? leftOf(hs, row.rune) : 0;
}

const EVAL = Object.freeze({
  self_hp_pct: (cx) => share(cx.u.hp, cx.u.maxHp),
  self_mana_pct: (cx) => share(cx.u.mana, cx.u.maxMana),
  ally_hp_pct: (cx, c) => { const a = allyOf(cx, c.subject, 'hp'); if (a) cx.ally = cx.ally || a; return a ? share(a.hp, a.maxHp) : null; },
  ally_mana_pct: (cx, c) => { const a = allyOf(cx, c.subject, 'mana'); return a ? share(a.mana, a.maxMana) : null; },
  enemies_in_aoe: (cx) => {
    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, footprintOf(cx.slot, cx.h));
    if (b) cx.aim = b.aim;
    return b ? b.count : 0;
  },
  target_is_boss: (cx) => {
    const t = Number.isInteger(cx.u.target) ? cx.inst.world.units.find((x) => x.id === cx.u.target) : null;
    return !!(t && t.side === 'mon' && MONSTERS[t.kind] && MONSTERS[t.kind].boss === true);
  },
  item_qty: (cx, c) => {
    const s = c.subject || 'item';
    const hs = cx.h && cx.h.hs;
    if (s === 'item') return slotStock(cx);
    if (s === 'ammo') return cx.h && cx.h.ammo ? leftOf(hs, cx.h.ammo) : 0;
    return kindLeft(hs, s);
  },
  effect_missing: (cx, c) => {
    const who = (c.subject || 'target') === 'self' ? cx.u
      : (Number.isInteger(cx.u.target) ? cx.inst.world.units.find((x) => x.id === cx.u.target) : null);
    return who && Array.isArray(who.statuses) ? who.statuses.map((st) => st.s) : [];
  },
});

/** The registry rows the engine has no evaluator for, and evaluators with no row (both must be empty). */
export function evaluatorGaps() {
  return { missing: METRICS.map((m) => m.id).filter((id) => !EVAL[id]), extra: Object.keys(EVAL).filter((id) => !METRIC.has(id)) };
}

function compare(op, a, b) {
  switch (op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'eq': return a === b;
    case 'ne': return a !== b;
    default: return false;
  }
}

/** Does one condition hold in context `cx` ({ inst, u, h, slot }); false when its subject is nobody. */
export function holds(cx, c) {
  const m = METRIC.get(c.metric);
  const f = m && EVAL[c.metric];
  if (!f) return false;
  const v = f(cx, c);
  if (v === null || v === undefined) return false;
  if (m.value === 'pct') return compare(c.op, v.n * 100, c.value * v.d);
  if (m.value === 'count') return compare(c.op, int(v), c.value);
  if (m.value === 'bool') return compare(c.op, v === true, c.value === true);
  if (m.value === 'effect') return c.op === 'has_effect' ? v.includes(c.value) : !v.includes(c.value);
  return false;
}

/* ── DEFAULT CONDITIONS ───────────────────────────────────────────────── */

const pctOf = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 100 ? v : d);
/** The conditions a slot with none takes (its action's own trigger; see the header). */
export function defaultConditions(slot, h) {
  const a = slot.action;
  if (a.type === 'ability') {
    const row = ABILITIES[a.id];
    if (!row) return [];
    if (row.target === 'self') return [{ metric: 'self_hp_pct', op: 'lt', value: row.whenBelowPct }];
    if (row.target === 'ally') return [{ metric: 'ally_hp_pct', op: 'lt', value: row.whenBelowPct, subject: 'lowest' }];
    if (row.target === 'area') return [{ metric: 'enemies_in_aoe', op: 'gte', value: ABILITY_RULES.areaMin }];
    return [];
  }
  if (a.type === 'consume') {
    const kind = CONSUME_KINDS[a.id] || (CONSUMABLES[a.id] && (CONSUMABLES[a.id].kind === 'drink' ? 'mana' : 'heal'));
    if (kind === 'mana') return [{ metric: 'self_mana_pct', op: 'lt', value: pctOf(h && h.drinkBelowPct, CONSUMABLE_RULES.drinkBelowPct) }];
    if (kind === 'heal') return [{ metric: 'self_hp_pct', op: 'lt', value: pctOf(h && h.foodBelowPct, CONSUMABLE_RULES.foodBelowPct) }];
  }
  return [];
}

/**
 * Test a slot for hero `u`: its conditions (or its defaults), joined. Answers
 * { pass, mask (bit i = condition i held), cx } — `cx.aim` / `cx.ally` are the
 * aim and the ally its conditions found, which the action then uses. Every
 * condition is evaluated (no short-circuit), so `mask` is the whole truth.
 */
export function testSlot(inst, u, h, slot) {
  const cx = { inst, u, h, slot, aim: null, ally: null };
  const conds = slot.conditions.length ? slot.conditions : defaultConditions(slot, h);
  let mask = 0;
  conds.forEach((c, i) => { if (c && holds(cx, c)) mask |= (1 << i); });
  const all = (1 << conds.length) - 1;
  const pass = !conds.length || (slot.join === 'or' ? mask !== 0 : mask === all);
  return { pass, mask, cx };
}

/**
 * THE ONE PICK: walk `rows` (slotsFor) in order; the first whose conditions pass
 * and for which `act(slot, cx, row)` answers a pick (non-null) wins. Answers
 * { pick, rule, mask } or null. `act` says whether the action can happen now.
 */
export function pickSlot(inst, u, h, rows, act, sc, lane) {
  let wait = null;
  for (const row of rows) {
    const t = testSlot(inst, u, h, row.slot);
    if (!t.pass) continue;
    const pick = act(row.slot, t.cx, row);
    if (pick && !pick.why) {
      if (lane && u.ruleWait && u.ruleWait[lane]) { const w = Object.assign({}, u.ruleWait); delete w[lane]; u.ruleWait = Object.keys(w).length ? w : null; }
      return { pick, rule: row.rule, mask: t.mask };
    }
    if (pick && pick.why && !wait) wait = { rule: row.rule, why: pick.why, t: pick.t };
  }
  if (wait && sc && lane) noteWait(u, lane, wait, sc);
  return null;
}

/* WHY A RULE WAITS (the death explanation reads it: "the heal rule was waiting for
   mana"). The highest-priority slot of a lane whose conditions passed but whose
   action could not happen is reported ONCE per (lane, rule, why): the unit keeps its
   last report per lane (`ruleWait`, persisted, so a settle cut never repeats one),
   and a lane that fires clears it. Bounded: one event per change, never per sub-step. */
export const WAIT_WHY = Object.freeze(['mana', 'cooldown', 'no_stock', 'no_target', 'out_of_range', 'gold_short', 'busy']);
function noteWait(u, lane, wait, sc) {
  const key = wait.rule + ':' + wait.why;
  const cur = u.ruleWait && typeof u.ruleWait === 'object' ? u.ruleWait : {};
  if (cur[lane] === key) return;
  u.ruleWait = Object.assign({}, cur, { [lane]: key });
  sc.emit(makeEvent('rule_wait', sc.atMs, { u: u.id, t: Number.isInteger(wait.t) ? wait.t : u.id, rule: wait.rule, why: wait.why }));
}

/* ── STOP RULES ───────────────────────────────────────────────────────── */

/**
 * Stop-rule hook, every sub-step: each living hero's stop rules are tested; a
 * rule that holds adds the sub-step to its hold, one that breaks resets it; a
 * hold that reaches forMs marks the session (`hs.ruleStop` = the rule index) and
 * the span ends the hunt `rule` at the hero's next boundary.
 */
export function checkStopRules(inst, sc) {
  const heroes = inst.heroes || null;
  if (!heroes) return;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || !u.alive) continue;
    const h = heroes[u.id];
    const rules = h && Array.isArray(h.stopRules) ? h.stopRules : null;
    if (!rules || !rules.length || !h.hs || Number.isInteger(h.hs.ruleStop)) continue;
    const hold = Array.isArray(u.ruleHold) ? u.ruleHold.slice(0, rules.length) : [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const t = testSlot(inst, u, h, { action: { type: 'stop', id: '' }, conditions: r.conditions, join: r.join === 'or' ? 'or' : 'and' });
      hold[i] = t.pass ? int(hold[i]) + sc.dtMs : 0;
      if (t.pass && hold[i] >= int(r.forMs)) {
        h.hs.ruleStop = i;
        sc.emit(makeEvent('rule_stop', sc.atMs, { u: u.id, rule: i, pass: t.mask }));
        break;
      }
    }
    u.ruleHold = hold.some((v) => v > 0) ? hold.map(int) : null;
  }
}
