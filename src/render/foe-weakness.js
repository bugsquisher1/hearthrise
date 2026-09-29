// ============================================================
// src/render/foe-weakness.js — the ONE source for "what is this foe weak to".
//
// Reads `m.weaponWeak`, the field `weaknessInfo` (src/core/combat.js) pays the
// +20% damage / +15% accuracy from. Every surface that names a weakness (Fight
// card, War Table, monster list, loot sheet, Stats) prints these words, so two
// surfaces cannot give two answers (Slime "fears no weapon" vs
// "Weak to 2H Hammer"). A `dropBonus` is NOT a weakness and never reads as one.
//
// Pure ESM, no DOM.
// ============================================================

import { WEAPON_TYPES } from '../core/combat.js?v=560';

/** The weapon type the engine pays a bonus for, or null (retired `neutral` = none). */
export function weaknessOf(m) {
  const w = m && m.weaponWeak;
  return w && w !== 'neutral' && WEAPON_TYPES[w] ? w : null;
}

/** The player-facing weapon name ("2H Hammer"), or '' when the engine pays none. */
export function weaknessWords(m) {
  const w = weaknessOf(m);
  return w ? WEAPON_TYPES[w] : '';
}

/** "Slime is weak to 2H Hammer" / "X fears no weapon" — no trailing stop. */
export function weaknessSentence(m) {
  const name = (m && m.name) || 'This foe';
  const w = weaknessWords(m);
  return w ? `${name} is weak to ${w}` : `${name} fears no weapon`;
}
