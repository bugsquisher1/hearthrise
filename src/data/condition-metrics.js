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
//   label    the test as a yes/no statement (a bool reads it: "My target is a boss")
//   say      how the test's sentence starts, in the picker and in the slot's summary,
//            which repeat each other word for word ("when my HP is at most 45%",
//            "when it would hit at least 2 monsters": Configure action, Tyler 2026-11-08
//            "at or above 2 what?")
//   unit     a number test's unit, read after the number: '%' for a percent, a count's
//            noun as [one, other] ("monster", "monsters")
//   subjectAfter  true = the subject reads after the number, as part of its unit
//            ("the party has at least 2 heroes under half health")
//   value    'pct' | 'count' | 'bool' | 'effect' | 'move' — which value picker ('move': an ability id, MOVE_IDS)
//   tip      optional: the test's short label in tooltip form, read before the comparison ("Target health below 30%",
//            "Target is Marked", "Target Bleed stacks 3+", "Last move: Rend"); {who} is the subject's label. The
//            slot's title reads it (bar-draft.js conditionTip); a row without one reads its sentence
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

import { HUNT_ROLES } from './hunt-roles.js';
import { STATUSES } from './statuses.js';
import { ABILITIES } from './abilities.js';

/* Three, all of which must match (Tyler's ruling, 2026-10-19 audit C2; a stop rule may still join
   "any"). The `pass` bitmask is one bit a condition. Server: 2026-10-26-bar-three-conditions.sql. */
export const MAX_CONDITIONS = 3;
export const MAX_STOP_RULES = 3;
/* A slot's IGNORED MONSTERS (Tyler 2026-10-19 Configure action: "Ignored monsters"; lane b-spell-core): the
   monster ids it never fires at, at most this many. A bound, not a balance value. Server: hr_hunt_condition_limits. */
export const MAX_IGNORED = 8;
/* A stop rule's hold, in ms: whole sub-steps, at most ten minutes. */
export const STOP_HOLD_MS = Object.freeze({ min: 0, max: 600000, step: 100 });

/* The comparison in plain words, by what it compares (Tyler 2026-11-08): a percent after "is" ("my HP is at most 45%"), a
   count before its noun ("it would hit at least 2 monsters"), a yes/no or an effect by `say`. */
/** @type {Readonly<Record<string, Readonly<{ say?: string, pct?: string, count?: string }>>>} */
export const OPERATORS = Object.freeze({
  eq: Object.freeze({ say: 'is', pct: 'is exactly', count: 'exactly' }),
  ne: Object.freeze({ say: 'is not', pct: 'is not', count: 'any number but' }),
  gt: Object.freeze({ pct: 'is above', count: 'more than' }),
  gte: Object.freeze({ pct: 'is at least', count: 'at least' }),
  lt: Object.freeze({ pct: 'is below', count: 'fewer than' }),
  lte: Object.freeze({ pct: 'is at most', count: 'at most' }),
  has_effect: Object.freeze({ say: 'has' }),
  lacks_effect: Object.freeze({ say: 'lacks' }),
});

const NUM = Object.freeze(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']);
/* "Whose": the lowest ally, YOURSELF (roadmap p23: a heal aimed at its own caster, ruling 10-18), or the first hero
   of a role (by unit id). */
const ALLY = Object.freeze(Object.assign({ lowest: 'the lowest ally', self: 'yourself' },
  Object.fromEntries(Object.entries(HUNT_ROLES).map(([id, r]) => [id, 'the ' + r.label]))));

const PCT = '%';
const noun = (one, other) => Object.freeze([one, other]);
/* THE STATUSES THAT STACK (statuses.js maxStacks over 1: Bleed today): the subjects of "my target has at least 3 Bleed stacks", and the
   most any of them carries, its range's top. A new stacking status is a row there and is a subject here by itself. */
const STACKING = Object.freeze(Object.values(STATUSES).filter((s) => s.maxStacks > 1));
const STACKS = Object.freeze(Object.fromEntries(STACKING.map((s) => [s.id, s.name + ' stacks'])));
const STACK_MAX = STACKING.reduce((n, s) => Math.max(n, s.maxStacks), 1);
/** @typedef {{ id: string, say: string, tip?: string, unit?: string | readonly string[], subjectAfter?: boolean, value: string, ops: readonly string[],
    range?: readonly number[], subject?: Readonly<Record<string, string>>, slotOnly?: boolean }} Metric */
/** @type {readonly Metric[]} */
export const METRICS = Object.freeze([
  Object.freeze({ id: 'self_hp_pct', say: 'my HP', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  Object.freeze({ id: 'self_mana_pct', say: 'my mana', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  Object.freeze({ id: 'ally_hp_pct', say: 'the HP of', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]), subject: ALLY }),
  Object.freeze({ id: 'ally_mana_pct', say: 'the mana of', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]), subject: ALLY }),
  Object.freeze({ id: 'allies_below', say: 'the party has', unit: noun('hero under', 'heroes under'), subjectAfter: true, value: 'count', ops: NUM, range: Object.freeze([0, 5]),
    subject: Object.freeze({ under_50: 'half health', under_60: '60% health', under_70: '70% health', under_80: '80% health', under_90: '90% health' }) }),
  Object.freeze({ id: 'enemies_in_aoe', say: 'it would hit', unit: noun('monster', 'monsters'), value: 'count', ops: NUM, range: Object.freeze([0, 25]), slotOnly: true }),
  /* THE AREA SPELLS' CONDITIONS (Tyler 2026-11-08: "make sure the conditions are available that make sense"; the board's
     "2026-11-08 Area spells" §2b). Every true/false `say` holds " is ": the slot's words deny it by " is not " (bar-draft.js conditionWords). */
  Object.freeze({ id: 'party_hp_pct', say: 'the party’s HP', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  /* the monsters winding up a spell whose mark covers me, or anyone in the party (a group strike covers everyone):
     "the pack has at least 1 monster casting at me" */
  Object.freeze({ id: 'enemy_casting', say: 'the pack has', unit: noun('monster casting at', 'monsters casting at'), subjectAfter: true, value: 'count', ops: NUM, range: Object.freeze([0, 8]),
    subject: Object.freeze({ self: 'me', any: 'anyone' }) }),
  Object.freeze({ id: 'in_fight', say: 'the fight is on', value: 'bool', ops: Object.freeze(['eq']) }),
  /* the slot's own element against its aim (else my target): it takes more from it, or less */
  Object.freeze({ id: 'target_weak', say: 'my target is weak to it', value: 'bool', ops: Object.freeze(['eq']), slotOnly: true }),
  Object.freeze({ id: 'target_resists', say: 'my target is resistant to it', value: 'bool', ops: Object.freeze(['eq']), slotOnly: true }),
  Object.freeze({ id: 'target_is_boss', say: 'my target is a boss', value: 'bool', ops: Object.freeze(['eq']) }),
  /* (its subject is its unit: "I have at most 5 of my food left") */
  Object.freeze({ id: 'item_qty', say: 'I have', subjectAfter: true, value: 'count', ops: NUM, range: Object.freeze([0, 100000]),
    subject: Object.freeze({ item: 'of this slot’s item left', food: 'of my food left', drink: 'of my drinks left', ammo: 'of the loaded ammo left' }) }),
  Object.freeze({ id: 'effect_missing', say: 'an effect', value: 'effect', ops: Object.freeze(['has_effect', 'lacks_effect']),
    /* Whose effect: my target, me, or the ally this slot's conditions picked (its heal target; else the lowest ally).
       The effect ids are the status registry's (statuses.js), never invented here. */
    subject: Object.freeze({ target: 'on my target', self: 'on me', ally: 'on the ally I would heal' }) }),
  /* THE ROADS' FOUR (18-roads-review §3 item 4, §9 step 1; lane/bar-metrics, Systems 2026-11-22): the tests a finishing strike, a strike
     on a Marked target, a Bleed builder and a rotation need. Each reads the world the one engine settles, viewed or closed alike. */
  /* the hero's own target's HP, a share of its max (no target: nobody, the test fails) */
  Object.freeze({ id: 'target_hp_pct', say: 'my target’s HP', tip: 'Target health', unit: PCT, value: 'pct', ops: NUM, range: Object.freeze([0, 100]) }),
  /* the hero's own target carries a Hunter's Mark still running (abilities.js `mark`: markUntil, read at the sub-step's instant) */
  Object.freeze({ id: 'target_marked', say: 'my target is Marked', tip: 'Target is Marked', value: 'bool', ops: Object.freeze(['eq']) }),
  /* the stacks of one stacking status on the hero's own target: "my target has at least 3 Bleed stacks" */
  Object.freeze({ id: 'target_stacks', say: 'my target has', tip: 'Target {who}', subjectAfter: true, value: 'count', ops: NUM,
    range: Object.freeze([0, STACK_MAX]), subject: STACKS }),
  /* the last ability this hero cast in this hunt ON THE SLOT'S OWN LANE (a supply slot or a stop rule: on any lane), so a Mark between two
     strikes never breaks a rotation (abilities.js fire writes it; persisted with the world): "my last move is Rend" */
  Object.freeze({ id: 'last_move', say: 'my last move', tip: 'Last move', value: 'move', ops: Object.freeze(['eq', 'ne']) }),
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
/* The ability ids a `move` value may name (last_move): every ability row, whoever's it is (a move a hero cannot cast is a test that
   never holds, never a refusal). */
export const MOVE_IDS = Object.freeze(Object.keys(ABILITIES));
/* The named values a value kind takes, by kind: what the server's `vals` column holds for a row of that kind (hr_hunt_cond_check). */
export const VALUE_IDS = Object.freeze({ effect: EFFECT_IDS, move: MOVE_IDS });

/** Every problem with the registry, as strings. Empty = valid. */
export function validate() {
  const out = [];
  const seen = new Set();
  const KINDS = ['pct', 'count', 'bool', 'effect', 'move'];
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
    if (m.value === 'move' && m.ops.some((o) => o !== 'eq' && o !== 'ne')) out.push(at + 'a move takes eq / ne only');
    if (m.tip !== undefined && !(typeof m.tip === 'string' && m.tip)) out.push(at + 'tip: a short label, or none');
    if (typeof m.tip === 'string' && m.tip.includes('{who}') && !m.subject) out.push(at + 'tip: {who} names a subject the row lacks');
    if (m.subject && !Object.keys(m.subject).every((k) => /^[a-z0-9_]{1,32}$/.test(k))) out.push(at + 'bad subject key');
    if (typeof m.say !== 'string' || !m.say) out.push(at + 'say: no words for the slot sentence');
    /* A number has its unit, read after it ("50%", "2 monsters"): a percent's %, a count's noun, or a subject read as its unit. */
    if (m.value === 'pct' && m.unit !== PCT) out.push(at + 'unit: a percent reads its % after the number');
    if (m.value === 'count' && !(Array.isArray(m.unit) && m.unit.length === 2 && m.unit.every((w) => typeof w === 'string' && w)) && !(m.subjectAfter && m.subject)) out.push(at + 'unit: a count needs [one, other] nouns or a subject after it');
    if (m.subjectAfter && !(numeric && m.subject)) out.push(at + 'only a number test with a subject reads it after the number');
    /* Every comparison it takes has words for its kind of value. */
    for (const o of m.ops) if (OPERATORS[o] && typeof OPERATORS[o][numeric ? m.value : 'say'] !== 'string') out.push(at + 'operator ' + o + ' has no words for a ' + m.value);
  }
  if (!EFFECT_IDS.length) out.push('no effect ids');
  if (!MOVE_IDS.length) out.push('no move ids');
  return out;
}
