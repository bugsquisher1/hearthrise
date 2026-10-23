// ════════════════════════════════════════════════════════════════════════
// src/data/combat-text.js — WHAT THE HUNT SCREEN CAN SHOW, ONE ROW PER TYPE.
//
// HUNT_SCREEN_SPEC §1.2 / §3.11 #4-#5; parity FX-13, CL-01..CL-06.
//
// FLOAT_TYPES   every floating number / combat text type, each its own Settings
//               toggle (display only; the residue field `combatText`). A row's
//               `on` is a default per target class: `regular` monsters and
//               heroes, and `boss` monsters. The bleed stack badge is ON over
//               bosses and OFF over regular monsters by default (Tyler 10-17).
// LOG_TYPES     the combat log's line types (the Combat tab of the chat
//               window): which hunt event `t` each one reads, its label, and
//               the filter it sits under. Lines come only from server events.
//
// A new type is a row here; nothing else changes.
// ════════════════════════════════════════════════════════════════════════

const on = (regular, boss) => Object.freeze({ regular, boss });

export const FLOAT_TYPES = Object.freeze([
  Object.freeze({ id: 'dealt', label: 'Damage you deal', on: on(true, true) }),
  Object.freeze({ id: 'taken', label: 'Damage you take', on: on(true, true) }),
  Object.freeze({ id: 'heal', label: 'Healing', on: on(true, true) }),
  Object.freeze({ id: 'xp', label: 'Level XP gained', on: on(true, true) }),
  Object.freeze({ id: 'level', label: 'Level ups', on: on(true, true) }),
  Object.freeze({ id: 'miss', label: 'Misses and immune hits', on: on(true, true) }),
  Object.freeze({ id: 'supply', label: 'Food, drink and mana', on: on(true, true) }),
  Object.freeze({ id: 'loot', label: 'Loot', on: on(true, true) }),
  Object.freeze({ id: 'ability', label: 'Ability names', on: on(true, true) }),
  Object.freeze({ id: 'bleed_badge', label: 'Bleed stack count', on: on(false, true) }),
]);

/** The target classes a float toggle distinguishes. */
export const FLOAT_TARGETS = Object.freeze(['regular', 'boss']);

export const LOG_TYPES = Object.freeze([
  Object.freeze({ id: 'dealt', label: 'Dealt', events: Object.freeze(['dmg']), side: 'hero' }),
  Object.freeze({ id: 'taken', label: 'Taken', events: Object.freeze(['dmg']), side: 'monster' }),
  Object.freeze({ id: 'heal', label: 'Heals', events: Object.freeze(['heal']) }),
  Object.freeze({ id: 'xp', label: 'Experience', events: Object.freeze(['xp', 'level']) }),
  Object.freeze({ id: 'loot', label: 'Loot', events: Object.freeze(['kill', 'rare_drop']) }),
  Object.freeze({ id: 'supply', label: 'Supplies', events: Object.freeze(['eat', 'drink']) }),
  Object.freeze({ id: 'death', label: 'Deaths', events: Object.freeze(['fall', 'kill']) }),
  Object.freeze({ id: 'status', label: 'Effects', events: Object.freeze(['status_on', 'status_off']) }),
  /* Tamsin's tally done (the server's count reached its target in a settle: src/hunt-view/combat-log.js). */
  Object.freeze({ id: 'tally', label: 'Tally', events: Object.freeze(['tally_done']) }),
]);

/** Most lines the Combat tab keeps (older lines fall off; the analyzer holds the totals). */
export const LOG_MAX_LINES = 200;

/** Every problem with the tables, as strings. Empty = valid. */
export function validateCombatText() {
  const out = [];
  const ids = new Set();
  for (const r of FLOAT_TYPES) {
    if (ids.has(r.id)) out.push('float ' + r.id + ': duplicate');
    ids.add(r.id);
    for (const t of FLOAT_TARGETS) if (typeof r.on[t] !== 'boolean') out.push('float ' + r.id + ': on.' + t + ' must be a boolean');
  }
  const logs = new Set();
  for (const r of LOG_TYPES) {
    if (logs.has(r.id)) out.push('log ' + r.id + ': duplicate');
    logs.add(r.id);
    if (!r.events.length) out.push('log ' + r.id + ': reads no event');
  }
  return out;
}
