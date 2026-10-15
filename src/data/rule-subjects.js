// ════════════════════════════════════════════════════════════════════════
// src/data/rule-subjects.js — WHAT THE HUNT ACTION BAR MAY ASK (Hunt Sessions,
// ruling HR-2026-10-14 §2 "Rules (the action bar)"; Game Designer, lane D)
//
// A slot is { kind?, item, on, conditions }: `item` is a packed supply id from
// src/data/supplies.js, a shop supply id from src/data/supply-basics.js (paid
// per use), or one of SLOT_TARGETS; every condition must hold for the slot to
// fire. `kind` is SLOT_KINDS (absent = 'supply'). An action set is up to
// ACTION_SET_LIMITS.slots slots (Tyler 2026-10-14: Huntera's bar, two rows of
// ten) plus its TARGET_MODE and PULL_COUNT. These tables are the WHOLE
// vocabulary. The client sends a subject id, an operator and a whole number;
// the server refuses anything not listed here and refuses a value outside the
// subject's range (never clamps it).
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
  /* Mana (Tyler 2026-10-14): drinks restore it, spells cost it. A character
     with no mana pool reads this condition as FALSE — the slot never fires. */
  self_mana_pct: Object.freeze({ param: null, range: Object.freeze([1, 99]), label: 'My mana %' }),
  buff_left_s: Object.freeze({ param: 'buff', range: Object.freeze([0, 3600]), label: 'Seconds left on a buff' }),
  buff_missing: Object.freeze({ param: 'buff', range: null, label: 'A buff is not running' }),
  bag_left: Object.freeze({ param: 'item', range: Object.freeze([0, 100000]), label: 'Left in the bag' }),
  session_minutes: Object.freeze({ param: null, range: Object.freeze([0, 1440]), label: 'Minutes into the hunt' }),
});

/* WHAT A SLOT HOLDS (Tyler 2026-10-14, Huntera's bar: a spell or a supply).
   `active: false` is RESERVED: the server refuses a slot of that kind until
   the combat redesign ships spells. Absent `kind` = 'supply'. */
export const SLOT_KINDS = Object.freeze({
  supply: Object.freeze({ active: true }),
  spell: Object.freeze({ active: false }),
});

/* WHICH FOE A PULL FIGHTS FIRST, per action set (Huntera's target mode).
   `solo: false` is reserved for parties ('follow' the leader's target) and
   refused on a solo action set. */
export const TARGET_MODES = Object.freeze({
  nearest: Object.freeze({ solo: true, label: 'Nearest' }),
  weakest: Object.freeze({ solo: true, label: 'Weakest' }),
  strongest: Object.freeze({ solo: true, label: 'Strongest' }),
  follow: Object.freeze({ solo: false, label: 'Follow the leader' }),
});
export const DEFAULT_TARGET_MODE = 'nearest';

/* HOW MANY FOES ONE PULL BRINGS, per action set (Huntera's pull count; it
   replaces the stance pull size). Stored, read and clamped by the settle; the
   single-target engine fights one at a time until the combat redesign. */
export const PULL_COUNT = Object.freeze({ min: 1, max: 8, default: 1 });

/* THE PULL A HUNT ACTUALLY RUNS (Security design review 2026-10-14, item 2): the
   action set's pull count, clamped to the ground's own pull size (hunts.js
   `pull`) and to this cap. THE ONE PLACE the player-dial ruling lands: master
   plan row 18 holds it at 1 (the single-target engine) until Tyler rules on the
   dial; 0 = no cap beyond the ground's. Generated into hr_hunt_limits
   ('pull_cap'); the SERVER computes the pull (hr_hunt_pull_of) and the engine
   uses the server's number, never its own. A smaller pull respawns sooner in
   proportion (respawn = ground respawnMs × pull / ground pull), so the dial moves
   the rhythm of a hunt, never its kills an hour. */
export const PULL_CAP = 1;

/* The two comparisons. Stored as ASCII; drawn as ≤ and ≥. */
export const RULE_OPERATORS = Object.freeze({
  '<=': Object.freeze({ label: '≤' }),
  '>=': Object.freeze({ label: '≥' }),
});

/* One use per group per swing, then the group waits. Eating and drinking are
   separate groups, so a mage can do both in one swing. Ammo has no group: it
   is spent by every swing, not fired by a rule. */
export const COOLDOWN_GROUPS = Object.freeze({
  heal: Object.freeze({ ms: 2000 }),
  mana: Object.freeze({ ms: 2000 }),
  buff: Object.freeze({ ms: 1000 }),
});

export const ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 20, conditions: 3 });

/* "Whatever heal is cheapest in the bag": supplies.js HEAL_ORDER picks it. */
export const HEAL_ANY = '*heal';

/* The four slot targets that name no single item. `bag` targets fire the
   cheapest packed line of the kind; `shop` targets fire the shop supply for
   the hunt's tier (supply-basics.js basicFor) and charge its price. */
export const SLOT_TARGETS = Object.freeze({
  [HEAL_ANY]: Object.freeze({ kind: 'heal', from: 'bag' }),
  '*heal_shop': Object.freeze({ kind: 'heal', from: 'shop' }),
  '*mana': Object.freeze({ kind: 'mana', from: 'bag' }),
  '*mana_shop': Object.freeze({ kind: 'mana', from: 'shop' }),
});

const when = (subject, value) => Object.freeze([Object.freeze({ subject, op: '<=', value })]);
const slot = (item, conditions, on = true) => Object.freeze({ item, on, conditions });

/* The preset every character starts with: eat when HP is at or below half,
   drink when mana is at or below 40%, packed food and drink first, then the
   shop's per use. Slots are walked in order and fire at most one use per
   group per swing, so a shop slot fires only when the bag has none left. */
export const DEFAULT_PRESET = Object.freeze({
  name: 'Eat and drink',
  slots: Object.freeze([
    slot(HEAL_ANY, when('self_hp_pct', 50)),
    /* OFF for a new character (master plan row 25): the slot shows its price
       and one tap turns it on; gold moves only through a slot the player
       switched on. */
    slot('*heal_shop', when('self_hp_pct', 50), false),
    slot('*mana', when('self_mana_pct', 40)),
    slot('*mana_shop', when('self_mana_pct', 40), false),
  ]),
});

/** Split `buff_left_s:damage` into { base, param }. A bare subject has param null. */
export function parseSubject(subject) {
  const s = String(subject || '');
  const i = s.indexOf(':');
  return i < 0 ? { base: s, param: null } : { base: s.slice(0, i), param: s.slice(i + 1) };
}
