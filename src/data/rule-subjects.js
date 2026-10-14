// ════════════════════════════════════════════════════════════════════════
// src/data/rule-subjects.js — WHAT THE HUNT ACTION BAR MAY ASK (Hunt Sessions,
// ruling HR-2026-10-14 §2 "Rules (the action bar)"; Game Designer, lane D)
//
// A slot is { item, on, conditions }: `item` is a supply id from
// src/data/supplies.js or HEAL_ANY, and every condition must hold for the slot
// to fire. These tables are the WHOLE vocabulary. The client sends a subject
// id, an operator and a whole number; the server refuses anything not listed
// here and refuses a value outside the subject's range (never clamps it).
//
// src/core/action-rules.js (lane E) reads this file; it does not restate it.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

/* Subjects. `param` names what follows the colon in `buff_left_s:<type>`:
   'buff' is a type in supplies.js COMBAT_BUFF_TYPES, 'item' a supply id.
   `range` bounds the value; a subject with `range: null` takes no operator
   and no value (it is true or false on its own). */
export const RULE_SUBJECTS = Object.freeze({
  self_hp_pct: Object.freeze({ param: null, range: Object.freeze([1, 99]), label: 'My HP %' }),
  buff_left_s: Object.freeze({ param: 'buff', range: Object.freeze([0, 3600]), label: 'Seconds left on a buff' }),
  buff_missing: Object.freeze({ param: 'buff', range: null, label: 'A buff is not running' }),
  bag_left: Object.freeze({ param: 'item', range: Object.freeze([0, 100000]), label: 'Left in the bag' }),
  session_minutes: Object.freeze({ param: null, range: Object.freeze([0, 1440]), label: 'Minutes into the hunt' }),
});

/* The two comparisons. Stored as ASCII; drawn as ≤ and ≥. */
export const RULE_OPERATORS = Object.freeze({
  '<=': Object.freeze({ label: '≤' }),
  '>=': Object.freeze({ label: '≥' }),
});

/* One use per group per swing, then the group waits. Ammo has no group: it is
   spent by every swing, not fired by a rule. */
export const COOLDOWN_GROUPS = Object.freeze({
  heal: Object.freeze({ ms: 2000 }),
  buff: Object.freeze({ ms: 1000 }),
});

export const ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 10, conditions: 3 });

/* "Whatever heal is cheapest in the bag": supplies.js HEAL_ORDER picks it. */
export const HEAL_ANY = '*heal';

/* The preset every character starts with. It is today's Auto-Eat as one
   slot: eat the cheapest heal when HP is at or below half. */
export const DEFAULT_PRESET = Object.freeze({
  name: 'Eat when hurt',
  slots: Object.freeze([
    Object.freeze({
      item: HEAL_ANY,
      on: true,
      conditions: Object.freeze([Object.freeze({ subject: 'self_hp_pct', op: '<=', value: 50 })]),
    }),
  ]),
});

/** Split `buff_left_s:damage` into { base, param }. A bare subject has param null. */
export function parseSubject(subject) {
  const s = String(subject || '');
  const i = s.indexOf(':');
  return i < 0 ? { base: s, param: null } : { base: s.slice(0, i), param: s.slice(i + 1) };
}
