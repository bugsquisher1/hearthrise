// ════════════════════════════════════════════════════════════════════════
// src/data/condition-metrics.js — WHAT A BAR SLOT'S CONDITION CAN TEST.
//
// FIXTURE ROWS (2026-10-18). The conditional action engine's server lane owns
// this file and replaces it whole with the registry the server validates
// against; until then these rows are examples so the slot editor is built
// once against the agreed shape. The editor renders its metric, operator and
// value pickers from METRICS and OPERATORS only, never a hard-coded set. Every
// number here is an example, not a balance value.
//
// A slot (hunt_settings.slots[i]):
//   { action: { type: 'ability'|'consume'|'attack_with_item', id },
//     conditions: [ { metric, op, value, subject? } ]   (at most MAX_CONDITIONS)
//     join: 'and'|'or' }
// Slot order IS priority: the first eligible slot fires, the next is the fallback.
//
// A metric row:
//   id       the wire name
//   label    what the editor shows ("My HP %")
//   value    'pct' | 'count' | 'bool' | 'effect' | 'item' — which value picker
//   ops      the operators it takes (keys of OPERATORS)
//   range    [min, max] for a number value
//   subject  optional: the subject choices ('role' | 'lowest' ...) and their labels
// ════════════════════════════════════════════════════════════════════════

export const MAX_CONDITIONS = 3;

export const OPERATORS = Object.freeze({
  eq: Object.freeze({ label: 'is' }),
  ne: Object.freeze({ label: 'is not' }),
  gt: Object.freeze({ label: 'above' }),
  gte: Object.freeze({ label: 'at or above' }),
  lt: Object.freeze({ label: 'below' }),
  lte: Object.freeze({ label: 'at or below' }),
  has_effect: Object.freeze({ label: 'has' }),
  lacks_effect: Object.freeze({ label: 'lacks' }),
});

const NUM = Object.freeze(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']);

export const METRICS = Object.freeze([
  Object.freeze({ id: 'self_hp_pct', label: 'My HP %', value: 'pct', ops: NUM, range: Object.freeze([1, 99]) }),
  Object.freeze({ id: 'self_mana_pct', label: 'My mana %', value: 'pct', ops: NUM, range: Object.freeze([1, 99]) }),
  Object.freeze({ id: 'ally_hp_pct', label: 'An ally’s HP %', value: 'pct', ops: NUM, range: Object.freeze([1, 99]),
    subject: Object.freeze({ role: 'of a role', lowest: 'the lowest ally' }) }),
  Object.freeze({ id: 'enemies_in_aoe', label: 'Monsters in range of an area attack', value: 'count', ops: NUM, range: Object.freeze([1, 8]) }),
  Object.freeze({ id: 'target_is_boss', label: 'My target is a boss', value: 'bool', ops: Object.freeze(['eq']) }),
  Object.freeze({ id: 'item_qty', label: 'Left in the bag', value: 'count', ops: NUM, range: Object.freeze([0, 1000]),
    subject: Object.freeze({ item: 'of the slot’s item' }) }),
  Object.freeze({ id: 'effect_missing', label: 'An effect on me', value: 'effect', ops: Object.freeze(['has_effect', 'lacks_effect']) }),
]);

/* What a slot can do: the action types and where each type's ids come from. */
export const ACTION_TYPES = Object.freeze({
  ability: Object.freeze({ label: 'Use an ability', from: 'abilities' }),
  consume: Object.freeze({ label: 'Eat or drink', from: 'supplies' }),
  attack_with_item: Object.freeze({ label: 'Attack with an item', from: 'ammo' }),
});
