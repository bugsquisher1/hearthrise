// ════════════════════════════════════════════════════════════════════════
// src/data/condition-metrics.js — WHAT A BAR SLOT OR A STOP RULE CAN TEST.
//
// THE REGISTRY of the conditional action engine (Tyler 2026-10-18; lane
// action-engine). The server validates every stored slot and stop rule against
// these rows (supabase/migrations/2026-10-25-action-conditions.sql
// hr_hunt_condition_metrics, pinned equal by tests/hunt-core/conditions.mjs);
// the engine evaluates them in src/core/hunt/conditions.js (one evaluator per
// row, pinned the same way); the bar editor renders its pickers from METRICS
// and OPERATORS only. A new test is a ROW here plus its evaluator, never a
// body edit on the server.
//
// A SLOT (hunt_settings.slots[i], player_action_sets.slots):
//   { action: { type: 'ability'|'consume'|'attack_with_item', id },
//     conditions: [ { metric, op, value, subject? } ]   (at most MAX_CONDITIONS)
//     join: 'and',   (all must match; only a stop rule may join 'or')
//     enabled?: false,   (switched Off: it never fires; absent = On)
//     ignore?: [monster ids] }   (at most MAX_IGNORED: it never fires at one of them)
// Slot order IS priority: the first slot whose conditions pass AND whose action
// can happen fires; the next one is the fallback. A slot with no conditions
// fires whenever it is ready: nothing hidden stands behind it (Tyler 2026-10-23;
// a NEW slot starts with its action's suggested conditions, written on it:
// src/core/hunt/conditions.js suggestedConditions).
//
// A STOP RULE (player_action_sets.options.stop_rules[i]):
//   { conditions: [ … ], join, forMs }
// The hunt ends `rule` (src/data/hunt-sessions.js END_ORDER) once the
// conditions have held for forMs without a break.
//
// A METRIC ROW:
//   id       the wire name
//   label    what the editor shows
//   say      the same test as words inside the slot sentence ("Eat Salted Trout
//            when my HP is at or below 45%": Configure action, art direction 2026-10-21)
//   value    'pct' | 'count' | 'bool' | 'effect' — which value picker
//   ops      the operators it takes (keys of OPERATORS)
//   range    [min, max] for a number value (inclusive, whole)
//   subject  optional: the subject choices and their labels; the first is the default
//   slotOnly true = reads the slot's own action (its footprint or its item), so a
//            stop rule may not use it
//
// Every number here is a bound, not a balance value.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_ROLES } from './hunt-roles.js?v=0.2.62';
import { STATUSES } from './statuses.js?v=0.2.62';

/* Three, all of which must match (Tyler's ruling, 2026-10-19 audit C2; a stop rule may still join
   "any"). The `pass` bitmask is one bit a condition. Server: 2026-10-26-bar-three-conditions.sql. */
export const MAX_CONDITIONS = 3;
export const MAX_STOP_RULES = 3;
/* A slot's IGNORED MONSTERS (Tyler 2026-10-19 Configure action: "Ignored monsters"; lane b-spell-core): the
   monster ids it never fires at, at most this many. A bound, not a balance value. Server: hr_hunt_condition_limits. */
export const MAX_IGNORED = 8;
/* A stop rule's hold, in ms: whole sub-steps, at most ten minutes. */
export const STOP_HOLD_MS = Object.freeze({ min: 0, max: 600000, step: 100 });

/* `say`: the comparison inside the slot sentence ("my HP is at or below 45%"). */
export const OPERATORS = Object.freeze({
  eq: Object.freeze({ label: 'is', say: 'is' }),
  ne: Object.freeze({ label: 'is not', say: 'is not' }),
  gt: Object.freeze({ label: 'above', say: 'is above' }),
  gte: Object.freeze({ label: 'at or above', say: 'is at or above' }),
  lt: Object.freeze({ label: 'below', say: 'is below' }),
  lte: Object.freeze({ label: 'at or below', say: 'is at or below' }),
  has_effect: Object.freeze({ label: 'has', say: 'has' }),
  lacks_effect: Object.freeze({ label: 'lacks', say: 'lacks' }),
});

const NUM = Object.freeze(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']);
/* "Whose": the lowest ally, YOURSELF (roadmap p23: a heal aimed at its own caster, ruling 10-18), or the first hero
   of a role (by unit id). */
const ALLY = Object.freeze(Object.assign({ lowest: 'the lowest ally', self: 'yourself' },
  Object.fromEntries(Object.entries(HUNT_ROLES).map(([id, r]) => [id, 'the ' + r.label]))));

export const METRICS = Object.freeze([
  Object.freeze({ id: 'self_hp_pct', label: 'My HP %', say: 'my HP', value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  Object.freeze({ id: 'self_mana_pct', label: 'My mana %', say: 'my mana', value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  Object.freeze({ id: 'ally_hp_pct', label: 'An ally’s HP %', say: 'the HP of', value: 'pct', ops: NUM, range: Object.freeze([0, 100]), subject: ALLY }),
  Object.freeze({ id: 'ally_mana_pct', label: 'An ally’s mana %', say: 'the mana of', value: 'pct', ops: NUM, range: Object.freeze([0, 100]), subject: ALLY }),
  Object.freeze({ id: 'allies_below', label: 'Allies under', say: 'allies under', value: 'count', ops: NUM, range: Object.freeze([0, 5]),
    subject: Object.freeze({ under_50: 'half health', under_60: '60% health', under_70: '70% health', under_80: '80% health', under_90: '90% health' }) }),
  Object.freeze({ id: 'enemies_in_aoe', label: 'Monsters the area would hit', say: 'the monsters it would hit', value: 'count', ops: NUM, range: Object.freeze([0, 25]), slotOnly: true }),
  Object.freeze({ id: 'target_is_boss', label: 'My target is a boss', say: 'my target being a boss', value: 'bool', ops: Object.freeze(['eq']) }),
  Object.freeze({ id: 'item_qty', label: 'Left in the bag', say: 'what is left in the bag', value: 'count', ops: NUM, range: Object.freeze([0, 100000]),
    subject: Object.freeze({ item: 'of this slot’s item', food: 'of food', drink: 'of drink', ammo: 'of the loaded ammo' }) }),
  Object.freeze({ id: 'effect_missing', label: 'An effect', say: 'an effect', value: 'effect', ops: Object.freeze(['has_effect', 'lacks_effect']),
    /* Whose effect: my target, me, or the ally this slot's conditions picked (its heal target; else the lowest ally).
       The effect ids are the status registry's (statuses.js), never invented here. */
    subject: Object.freeze({ target: 'on my target', self: 'on me', ally: 'on the ally I would heal' }) }),
]);

/* What a slot can do: the action types and where each type's ids come from. */
export const ACTION_TYPES = Object.freeze({
  ability: Object.freeze({ label: 'Use an ability', from: 'abilities' }),
  consume: Object.freeze({ label: 'Eat or drink', from: 'supplies' }),
  attack_with_item: Object.freeze({ label: 'Attack with an item', from: 'ammo' }),
});

/* An attack slot may name the hero's LOADED ammo (its equipped ammo slot) instead of
   one item: the attack lane's default (the plain basic attack). */
export const ATTACK_KINDS = Object.freeze({ loaded: 'the loaded ammo' });

/* The effect ids an `effect` value may name. */
export const EFFECT_IDS = Object.freeze(Object.keys(STATUSES));

/** Every problem with the registry, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const seen = new Set();
  const KINDS = ['pct', 'count', 'bool', 'effect'];
  for (const m of METRICS) {
    const at = 'metric ' + m.id + ': ';
    if (!/^[a-z_]{1,32}$/.test(m.id) || seen.has(m.id)) out.push(at + 'bad or duplicate id');
    seen.add(m.id);
    if (!KINDS.includes(m.value)) out.push(at + 'unknown value kind ' + m.value);
    if (!m.ops.length || !m.ops.every((o) => OPERATORS[o])) out.push(at + 'an unknown operator');
    const numeric = m.value === 'pct' || m.value === 'count';
    if (numeric !== !!m.range) out.push(at + 'a number value has a range, nothing else does');
    if (m.range && !(m.range.length === 2 && m.range.every(Number.isInteger) && m.range[0] <= m.range[1])) out.push(at + 'range is [min, max]');
    if (m.value === 'bool' && m.ops.join() !== 'eq') out.push(at + 'a bool takes eq only');
    if (m.value === 'effect' && m.ops.some((o) => !o.endsWith('_effect'))) out.push(at + 'an effect takes has_effect / lacks_effect only');
    if (m.subject && !Object.keys(m.subject).every((k) => /^[a-z0-9_]{1,32}$/.test(k))) out.push(at + 'bad subject key');
    if (typeof m.say !== 'string' || !m.say) out.push(at + 'no words for the slot sentence (say)');
  }
  for (const [k, o] of Object.entries(OPERATORS)) if (typeof o.say !== 'string' || !o.say) out.push('operator ' + k + ': no words for the slot sentence (say)');
  if (!EFFECT_IDS.length) out.push('no effect ids');
  return out;
}
