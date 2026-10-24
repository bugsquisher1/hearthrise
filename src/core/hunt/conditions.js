// ============================================================
// src/core/hunt/conditions.js — THE CONDITIONAL ACTION ENGINE (Tyler 2026-10-18)
//
// ONE deterministic condition system for every combat action a hero takes:
// an ability (abilities.js), a food or a drink (consumables.js), and the ammo
// a basic attack looses (damage.js). Not a scripting language: a slot is
//   { action: { type, id }, conditions: [≤ MAX_CONDITIONS { metric, op, value, subject? }], join,
//     enabled?: false (switched Off), ignore?: [≤ MAX_IGNORED monster ids] }
// and the hero's BAR is a list of slots. Slot order IS priority: when an
// action lane is free, its slots are walked in order and the first one whose
// conditions pass AND whose action can happen fires; the next is the fallback
// (a choice with no stock, no target, no mana or a closed lane falls through).
// Ties never arise: slot order is total, and inside a slot every candidate
// (an aim, an ally) is ordered by unit id. The RULE ID is the slot's index in
// the stored bar; every decision event carries it (`rule`) and which
// conditions passed (`pass`, a bit per condition, so it is bounded).
//
// A SLOT DOES EXACTLY WHAT THE SCREEN SAYS (Tyler 2026-10-23, audit c21/c23/c24).
// A slot with no conditions fires whenever it is ready ("whenever it is ready", the
// Configure action's words): nothing hidden stands behind it. The conditions a NEW
// slot starts with (suggestedConditions: an ability's own trigger, food under
// CONSUMABLE_RULES.foodBelowPct, drink under drinkBelowPct) are written ON the slot,
// where the player sees and edits them; the old per-hero eat-at / drink-at settings
// are retired. A slot switched Off (`enabled: false`) never fires; a slot that
// aims at monsters (an attack, or an ability at a monster) with ignored monsters
// never fires AT one of them, nor while the hero's own target is one; a food,
// drink, heal or shield slot is never held back by them. Each lane with no slot of its own takes its defaults: the role's rule set
// (src/data/rule-subjects.js ROLE_RULES, its triggers written as real conditions)
// for abilities and the loaded ammo for the basic attack. Food and drink have NONE
// (Tyler 2026-10-21: the game never picks a supply): a new hero, whose stored bar
// holds nothing, runs the start kit's bar (src/data/start-kit.js START_BAR).
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
// the static one when absent).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { METRICS, OPERATORS, MAX_CONDITIONS, MAX_STOP_RULES, MAX_IGNORED, STOP_HOLD_MS, ACTION_TYPES, ATTACK_KINDS, EFFECT_IDS } from '../../data/condition-metrics.js?v=0.2.44';
import { ABILITIES, suggestedTrigger } from '../../data/abilities.js?v=0.2.44';
import { CONSUMABLES, CONSUMABLE_RULES } from '../../data/consumables.js?v=0.2.44';
import { SUPPLIES } from '../../data/supplies.js?v=0.2.44';
import { ITEMS } from '../../data/items.js?v=0.2.44';
import { MONSTERS } from '../../data/monsters.js?v=0.2.44';
import { ROLE_RULES } from '../../data/rule-subjects.js?v=0.2.44';
import { cheb, dist2, los } from './grid.js?v=0.2.44';
import { makeEvent } from './events.js?v=0.2.44';
import { BASIC_INDEX } from '../../data/supply-basics.js?v=0.2.44';
import { START_BAR } from '../../data/start-kit.js?v=0.2.44';
import { HUNT_ROLES, shootsItem } from '../../data/hunt-roles.js?v=0.2.44';

/* ruleHold: ms each stop rule has held, by its stable rule id (null = none held).
   ruleWait: the last `rule_wait` reported, per lane ('ruleId:why'), so it is reported once.
   Both are keyed by STABLE rule id, never by position. */
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

/* A stable rule id: [a-z0-9_], at most 24. */
const RULE_ID = /^[a-z0-9_]{1,24}$/;

/** A stored slot in the engine's shape: an ability id is a slot with no conditions; null / junk is null.
    `enabled` false = switched Off; `ignore` = the monster ids it never fires at (slotProblem validates both). */
export function normalizeSlot(s) {
  if (typeof s === 'string') return { id: null, action: { type: 'ability', id: s }, conditions: [], join: 'and' };
  if (!isObj(s) || !isObj(s.action)) return null;
  return {
    id: typeof s.id === 'string' && RULE_ID.test(s.id) ? s.id : null,
    action: { type: String(s.action.type), id: String(s.action.id),
      ...(typeof s.action.store === 'string' ? { store: s.action.store } : {}) },
    conditions: Array.isArray(s.conditions) ? s.conditions.map((c) => (isObj(c) ? { metric: c.metric, op: c.op, value: c.value,
      ...(c.subject !== undefined && c.subject !== null ? { subject: c.subject } : {}) } : null)) : [],
    join: s.join === 'or' ? 'or' : 'and',
    ...(s.enabled === false ? { enabled: false } : {}),
    ...(Array.isArray(s.ignore) && s.ignore.length ? { ignore: s.ignore.slice() } : {}),
  };
}

/** Does slot `slot` ignore monster unit `m` (its kind is on the slot's ignore list)? */
export const ignores = (slot, m) => !!(slot && Array.isArray(slot.ignore) && slot.ignore.length && m && m.side === 'mon' && slot.ignore.includes(m.kind));

/* The ability targets that are MONSTERS (abilities.js TARGETS): the only ones an ignore list can mean. */
const MONSTER_TARGETS = Object.freeze(['taunt', 'mark', 'enemy', 'area', 'cleave']);
/** Does `slot` aim at monsters (an attack item, or an ability whose target is a monster)? An IGNORE LIST
    binds only these (Coordinator 2026-10-23): a food, a drink, a heal or a shield aims at a hero, so a hero
    fighting an ignored monster still eats, drinks and heals. */
export function aimsAtMonsters(slot) {
  const a = slot && slot.action;
  if (!a) return false;
  if (a.type === 'attack_with_item') return true;
  return a.type === 'ability' && !!ABILITIES[a.id] && MONSTER_TARGETS.includes(ABILITIES[a.id].target);
}

/* ── VALIDATION (the server's hr_hunt_bar_check / hr_hunt_stop_rules_check, mirrored) ── */

/** The item kind an action id names, or null: abilities by row, food/drink by kind or item, ammo by supply row. */
function actionKnown(type, id) {
  if (type === 'ability') return !!ABILITIES[id];
  /* ONE item, crafted or a store row (Tyler 2026-10-21: the game never picks; no "Any food"). */
  if (type === 'consume') return Object.prototype.hasOwnProperty.call(CONSUMABLES, id);
  /* An attack item is a carried ammo line some weapon can shoot (attackItem): no rune, no whetstone. */
  if (type === 'attack_with_item') return Object.prototype.hasOwnProperty.call(ATTACK_KINDS, id) || attackItem(id);
  return false;
}
/* The roles that shoot (hunt-roles.js shootsItem decides what each can loose). */
const SHOOTERS = Object.freeze(Object.keys(HUNT_ROLES));
/** May an attack slot name item `id`? A carried ammo line some weapon can loose as a shot (hunt-roles.js shootsItem:
    an arrow or a bolt). A rune fuels spells only (Tyler 2026-10-23) and a whetstone sharpens a Melee weapon worn in
    the ammo slot, no one's shot (Andy a41): neither is an attack item. The server's hr_hunt_action_ids, pinned. */
export function attackItem(id) {
  return !!(SUPPLIES[id] && SUPPLIES[id].kind === 'ammo' && SHOOTERS.some((r) => shootsItem(r, ITEMS[id])));
}

/** THE STORE RUNE A SPELL SLOT MAY NAME (`action.store`): a rune spell's slot opts into
    buying its rune's store row once the carried runes are gone (designer 2026-10-21: a
    default bar never buys one unseen). Nothing else carries one: a food or drink slot
    names its ONE item. True when `store` fits the action. */
function storeFits(type, id, store) {
  const b = typeof store === 'string' && Object.prototype.hasOwnProperty.call(BASIC_INDEX, store) ? BASIC_INDEX[store] : null;
  return !!b && type === 'ability' && !!ABILITIES[id] && !!ABILITIES[id].rune && b.partner === ABILITIES[id].rune;
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
  if (join !== undefined && (!JOINS.includes(join) || (!stop && join !== 'and'))) return { error: 'bad_join' };
  for (let i = 0; i < list.length; i++) {
    const why = conditionProblem(list[i], stop);
    if (why) return { error: why, condition: i };
  }
  return null;
}

/** Why a slot's On/Off and ignored monsters are refused, or null (the server's hr_hunt_slot_check, mirrored). */
function switchProblem(s) {
  if (s.enabled !== undefined && typeof s.enabled !== 'boolean') return { error: 'bad_enabled' };
  if (s.ignore === undefined) return null;
  if (!Array.isArray(s.ignore)) return { error: 'bad_ignore' };
  if (s.ignore.length > MAX_IGNORED) return { error: 'too_many_ignored' };
  if (!s.ignore.every((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MONSTERS, id)) || new Set(s.ignore).size !== s.ignore.length) return { error: 'bad_ignore' };
  return null;
}

/** Why one stored slot is refused, or null (null itself is an empty slot). */
export function slotProblem(s) {
  if (s === null || typeof s === 'string') return s === null || ABILITIES[s] ? null : { error: 'bad_action' };
  if (!isObj(s) || !isObj(s.action)) return { error: 'bad_action' };
  if (Object.keys(s).some((k) => !['id', 'action', 'conditions', 'join', 'enabled', 'ignore'].includes(k))) return { error: 'bad_slot' };
  const sw = switchProblem(s);
  if (sw) return sw;
  if (s.id !== undefined && !(typeof s.id === 'string' && RULE_ID.test(s.id))) return { error: 'bad_slot' };
  /* The retired "Any food" / "Any drink": the player names the item (refused in plain words). */
  if (s.action.type === 'consume' && (s.action.id === 'food' || s.action.id === 'drink')) return { error: 'choose_item' };
  if (!ACTION_TYPES[s.action.type] || typeof s.action.id !== 'string' || !actionKnown(s.action.type, s.action.id)) return { error: 'bad_action' };
  if (Object.keys(s.action).some((k) => !['type', 'id', 'store'].includes(k))) return { error: 'bad_action' };
  if (s.action.store !== undefined && !storeFits(s.action.type, s.action.id, s.action.store)) return { error: 'bad_store' };
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
    if (!isObj(r) || Object.keys(r).some((k) => !['id', 'conditions', 'join', 'forMs'].includes(k))) return { error: 'bad_stop_rule', rule: i };
    if (!Array.isArray(r.conditions) || !r.conditions.length) return { error: 'bad_stop_rule', rule: i };
    const f = r.forMs === undefined ? 0 : r.forMs;
    if (!Number.isInteger(f) || f < STOP_HOLD_MS.min || f > STOP_HOLD_MS.max || f % STOP_HOLD_MS.step) return { error: 'bad_hold', rule: i };
    const p = conditionsProblem(r.conditions, r.join, true);
    if (p) return Object.assign({ rule: i }, p);
  }
  return null;
}

/* ── THE SLOTS A HERO FIGHTS WITH ─────────────────────────────────────── */

/* THE STABLE RULE ID (Coordinator architecture check, 2026-10-18). A rule is known
   by an id stored WITH its slot, never by its position: the server stamps it on
   save from the slot's content (hr_hunt_slot_check: 'r' + md5, a repeat of the same
   content suffixed _2, _3 …), so a reorder or a copy keeps every id and an edit
   changes only the edited slot's. Priority is still slot order. A slot that
   reaches the engine unstamped (a test fixture) takes ruleIdOf, the same rule over
   an FNV-1a content hash. Defaults carry fixed ids (d_…). */
export function ruleIdOf(slot, prefix) {
  /* (Its ignored monsters are its content; switching it Off is not: the id survives an Off and On.) */
  const ign = Array.isArray(slot.ignore) && slot.ignore.length ? [slot.ignore.slice().sort()] : [];
  const text = JSON.stringify([slot.action ? [slot.action.type, slot.action.id] : null, slot.conditions || [], slot.join || 'and', slot.forMs ?? null, ...ign]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (prefix || 'e') + h.toString(16).padStart(8, '0');
}
/* Ids made unique in order: the second copy of the same content is _2, and so on. */
function uniqueIds(list, prefix) {
  const seen = Object.create(null);
  return list.map((s) => {
    if (!s) return s;
    const base = s.id || ruleIdOf(s, prefix);
    seen[base] = (seen[base] || 0) + 1;
    return Object.assign({}, s, { id: seen[base] > 1 ? base + '_' + seen[base] : base });
  });
}

/* The basic attack with the loaded ammo, the attack lane's LAST resort after every
   attack slot (never a tablet). Food and drink have NO default (Tyler 2026-10-21: the
   game never picks a supply); a NEW hero's bar is the start kit's (start-kit.js
   START_BAR), placed only while the stored bar holds nothing at all. */
const DEFAULT_ATTACK = Object.freeze({ id: 'd_attack', action: Object.freeze({ type: 'attack_with_item', id: 'loaded' }), conditions: Object.freeze([]), join: 'and' });
/* The attack lane's default as a row (a bare fixture unit's only one). */
export const DEFAULT_ATTACK_ROW = Object.freeze({ rule: DEFAULT_ATTACK.id, slot: DEFAULT_ATTACK });

/**
 * WHICH AMMO A SHOT LOOSES (Andy #63, 2026-10-24: Bronze worn, Barbed on the bar with none carried, and every shot
 * bought a Plain Barbed Arrow; reordering the bar changed nothing). The attack lane's rows (slotsFor) in the order a
 * swing and a shot spell (abilities.js castShotOf) try them: a bar ammo slot WITH conditions where it stands (a rule
 * the player wrote: area arrows at 3+ in reach), then the WORN ammo (the lane's default, d_attack), then the bar's
 * other ammo in bar order. The caller walks it twice, carried stock only, then the store (shotPasses), so nothing is
 * bought while anything the hero carries can shoot, and the store sells in the same order.
 */
export function attackOrder(rows) {
  const ruled = [], plain = [];
  let worn = null;
  for (const r of rows) {
    if (r.rule === DEFAULT_ATTACK.id && !worn) worn = r;
    else ((r.slot.conditions || []).length ? ruled : plain).push(r);
  }
  return ruled.concat(worn ? [worn] : [], plain);
}
/* The two passes of a shot: `act(own)` answers a slot's pick on carried stock only (own = true), then with the store. */
export function shotPasses(inst, u, h, rows, act, sc) {
  return pickSlot(inst, u, h, rows, act(true), null, 'attack') || pickSlot(inst, u, h, rows, act(false), sc, 'attack');
}

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
 * [{ rule, slot }] in priority order, `rule` the slot's STABLE id (above).
 */
export function heroSlots(stored, role, allowed) {
  const keep = (s) => !!s && !slotProblem(s) && (s.action.type !== 'ability' || !allowed || allowed(s.action.id));
  let list = uniqueIds((Array.isArray(stored) ? stored : []).map((raw) => normalizeSlot(raw)), 'e');
  const has = (lane) => list.some((s) => keep(s) && LANE_OF[s.action.type] === lane);
  const fresh = !list.some(keep);
  if (!has('ability')) list = placeDefaults(list, (ROLE_RULES[role] || []).map(normalizeSlot).filter(keep));
  if (fresh) list = placeDefaults(list, START_BAR.map(normalizeSlot));
  const out = [];
  /* `at`: the slot's place on the bar (0-based), so an event can name "slot 2". A slot switched OFF still
     holds its lane (the player set that lane up: no defaults stand in for it) but never fires. */
  list.forEach((s, at) => { if (keep(s) && s.enabled !== false) out.push({ rule: s.id, slot: s, at }); });
  out.push(DEFAULT_ATTACK_ROW);
  return out;
}

/** A hero's stop rules with their stable ids (the server's, else the content hash). */
export function heroStopRules(rules) {
  return uniqueIds((Array.isArray(rules) ? rules : []).map((r) => ({ id: typeof r.id === 'string' && RULE_ID.test(r.id) ? r.id : null,
    conditions: r.conditions, join: r.join === 'or' ? 'or' : 'and', forMs: Number.isInteger(r.forMs) ? r.forMs : 0 })), 's');
}

/** The rows `h` carries for one lane (heroSlots' rows, what the settle injects). */
export function slotsFor(h, lane) {
  return (h && Array.isArray(h.slots) ? h.slots : []).filter((r) => r && r.slot && LANE_OF[r.slot.action.type] === lane);
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

/** The best aim for an n-footprint: { aim, count } over every reachable engaged monster, or null. A
    monster `slot` ignores is never the aim (it is still counted when the footprint covers it). */
export function bestAim(inst, hero, range, n, slot) {
  const mons = engagedMons(inst);
  let best = null; let bc = -1;
  const cand = mons.filter((m) => reaches(inst, hero, range, m) && !ignores(slot, m))
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
   included); `self` = the hero itself (a heal aimed at yourself, roadmap p23); a role
   id = the first living hero of that role. Null = nobody. */
function allyOf(cx, subject, stat) {
  const max = stat === 'hp' ? 'maxHp' : 'maxMana';
  const all = heroesOf(cx.inst);
  if (subject === 'self') return cx.u.alive ? cx.u : null;
  if (subject && subject !== 'lowest') return all.find((a) => a.role === subject) || null;
  const pool = all.filter((a) => (stat === 'hp' || int(a.maxMana) > 0) && (a === cx.u || reaches(cx.inst, cx.u, cx.h && cx.h.range, a)));
  return pool.sort((a, b) => (int(a[stat]) * int(b[max]) - int(b[stat]) * int(a[max])) || a.id - b.id)[0] || null;
}

const leftOf = (hs, id) => { const l = hs && hs.bag && hs.bag[id]; return l ? Math.max(0, int(l.left)) : 0; };
/* Every own unit of one kind ('food' | 'drink') in the bag: the item_qty metric's "of food" / "of drink". */
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
  if (a.type === 'consume') return leftOf(hs, a.id);
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
    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, footprintOf(cx.slot, cx.h), cx.slot);
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
  allies_below: (cx, c) => {
    const pct = Number(String(c.subject || 'under_50').slice(6)) || 50;
    return heroesOf(cx.inst).filter((a) => int(a.maxHp) > 0 && int(a.hp) * 100 < pct * int(a.maxHp)).length;
  },
  effect_missing: (cx, c) => {
    const s = c.subject || 'target';
    const who = s === 'self' ? cx.u
      : s === 'ally' ? (cx.ally || allyOf(cx, 'lowest', 'hp'))
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

/* ── THE CONDITIONS A NEW SLOT STARTS WITH ────────────────────────────── */

/**
 * The conditions a NEW slot of `action` starts with, written on the slot where the
 * player sees and edits them (the Configure action, bar-draft.js startConditions):
 * an ability's own trigger (abilities.js suggestedTrigger), a food under
 * CONSUMABLE_RULES.foodBelowPct HP, a drink under drinkBelowPct mana. Never applied
 * behind a slot: a slot with no conditions fires whenever it is ready.
 */
export function suggestedConditions(action) {
  const a = action || {};
  if (a.type === 'ability') return ABILITIES[a.id] ? suggestedTrigger(ABILITIES[a.id]).map((c) => Object.assign({}, c)) : [];
  if (a.type === 'consume' && CONSUMABLES[a.id]) {
    return CONSUMABLES[a.id].kind === 'drink' ? [{ metric: 'self_mana_pct', op: 'lt', value: CONSUMABLE_RULES.drinkBelowPct }]
      : [{ metric: 'self_hp_pct', op: 'lt', value: CONSUMABLE_RULES.foodBelowPct }];
  }
  return [];
}

/**
 * Test a slot for hero `u`: its own conditions, joined (none = always). Answers
 * { pass, mask (bit i = condition i held), cx } — `cx.aim` / `cx.ally` are the
 * aim and the ally its conditions found, which the action then uses. Every
 * condition is evaluated (no short-circuit), so `mask` is the whole truth. A slot
 * that aims at monsters (aimsAtMonsters) and IGNORES the monster its hero is
 * fighting does not pass (its other targets are filtered where it aims:
 * abilities.js targetFor, bestAim). A food, drink, heal or shield slot is never
 * held back by its ignore list.
 */
export function testSlot(inst, u, h, slot) {
  const cx = { inst, u, h, slot, aim: null, ally: null };
  if (Array.isArray(slot.ignore) && slot.ignore.length && Number.isInteger(u.target) && aimsAtMonsters(slot)) {
    const t = inst.world.units.find((x) => x.id === u.target);
    if (ignores(slot, t)) return { pass: false, mask: 0, cx };
  }
  const conds = slot.conditions;
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
      return { pick, rule: row.rule, mask: t.mask, label: row.slot.action.id };
    }
    if (pick && pick.why && !wait) wait = { rule: row.rule, why: pick.why, t: pick.t, label: row.slot.action.id };
  }
  if (wait && sc && lane) noteWait(u, lane, wait, sc);
  return null;
}

/* WHY A RULE WAITS (the death explanation reads it: "the heal rule was waiting for
   mana"). The highest-priority slot of a lane whose conditions passed but whose
   action could not happen is reported ONCE per (lane, rule, why): the unit keeps its
   last report per lane (`ruleWait`, persisted, so a settle cut never repeats one),
   and a lane that fires clears it. Bounded: one event per change, never per sub-step. */
/* 'level': a spell's carried rune casts a version the hero's skill has not unlocked yet (src/data/runes.js). */
export const WAIT_WHY = Object.freeze(['mana', 'cooldown', 'no_stock', 'no_target', 'out_of_range', 'gold_short', 'level']);
function noteWait(u, lane, wait, sc) {
  const key = wait.rule + ':' + wait.why;
  const cur = u.ruleWait && typeof u.ruleWait === 'object' ? u.ruleWait : {};
  if (cur[lane] === key) return;
  u.ruleWait = Object.assign({}, cur, { [lane]: key });
  sc.emit(makeEvent('rule_wait', sc.atMs, { u: u.id, t: Number.isInteger(wait.t) ? wait.t : u.id, rule: wait.rule, rule_label: wait.label, why: wait.why }));
}

/* THE BAR OR THE STOP RULES CHANGED MID-HUNT: the persisted state is keyed by stable
   rule id, so a rule that is still there keeps its hold and its wait (wherever it
   moved on the bar) and an id that is gone is dropped. */
function rekey(u, h) {
  if (u.ruleWait && typeof u.ruleWait === 'object') {
    const ids = new Set((Array.isArray(h.slots) ? h.slots : []).map((r) => r && r.rule));
    const w = {};
    for (const [lane, key] of Object.entries(u.ruleWait)) if (ids.has(String(key).slice(0, String(key).lastIndexOf(':')))) w[lane] = key;
    u.ruleWait = Object.keys(w).length ? w : null;
  }
  if (u.ruleHold && typeof u.ruleHold === 'object') {
    const ids = new Set((Array.isArray(h.stopRules) ? h.stopRules : []).map((r) => r.id));
    const hold = {};
    for (const [id, ms] of Object.entries(u.ruleHold)) if (ids.has(id)) hold[id] = int(ms);
    u.ruleHold = Object.keys(hold).length ? hold : null;
  }
}

/* ── STOP RULES ───────────────────────────────────────────────────────── */

/**
 * Stop-rule hook, every sub-step: each living hero's stop rules are tested; a
 * rule that holds adds the sub-step to its hold, one that breaks resets it; a
 * hold that reaches forMs marks the session (`hs.ruleStop` = the rule's stable id)
 * and the span ends the hunt `rule` at the hero's next boundary. Holds are keyed
 * by rule id (`ruleHold` { id: ms }); first the state is re-keyed to the hero's
 * current bar and stop rules (rekey).
 */
export function checkStopRules(inst, sc) {
  const heroes = inst.heroes || null;
  if (!heroes) return;
  for (const u of inst.world.units) {
    if (u.side !== 'hero' || !u.alive) continue;
    const h = heroes[u.id];
    if (!h) continue;
    rekey(u, h);
    const rules = Array.isArray(h.stopRules) ? h.stopRules : null;
    if (!rules || !rules.length || !h.hs || typeof h.hs.ruleStop === 'string') continue;
    const hold = Object.assign({}, u.ruleHold || {});
    for (const r of rules) {
      const t = testSlot(inst, u, h, { action: { type: 'stop', id: '' }, conditions: r.conditions, join: r.join === 'or' ? 'or' : 'and' });
      if (t.pass) hold[r.id] = int(hold[r.id]) + sc.dtMs; else delete hold[r.id];
      if (t.pass && hold[r.id] >= int(r.forMs)) {
        h.hs.ruleStop = r.id;
        sc.emit(makeEvent('rule_stop', sc.atMs, { u: u.id, rule: r.id, pass: t.mask }));
        break;
      }
    }
    u.ruleHold = Object.keys(hold).length ? hold : null;
  }
}
