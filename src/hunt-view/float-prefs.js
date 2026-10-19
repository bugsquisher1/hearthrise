// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/float-prefs.js — WHICH FLOATING NUMBERS SHOW (parity FX-13, VW-08).
//
// PURE. A floating-number type shows over a target when the character's
// display residue `combatText` says so, or else by the type's default for that
// target class (src/data/combat-text.js FLOAT_TYPES): regular monsters and
// heroes, or bosses. The bleed stack badge is on over bosses and off over
// regular monsters by default. Display only: nothing gates or spends on it.
// ════════════════════════════════════════════════════════════════════════
import { FLOAT_TYPES } from '../data/combat-text.js?v=0.2.10';

const BY_ID = new Map(FLOAT_TYPES.map((r) => [r.id, r]));

/**
 * @param {{record: object|null}} cs   the CharacterSession
 * @param {string} type                a FLOAT_TYPES id
 * @param {'regular'|'boss'} target
 */
export function floatShown(cs, type, target) {
  const row = BY_ID.get(type);
  if (!row) return false;
  const saved = cs && cs.record && cs.record.residue && cs.record.residue.combatText;
  const mine = saved && saved[type];
  if (mine && typeof mine[target] === 'boolean') return mine[target];
  return row.on[target] === true;
}

/** The residue value with one toggle set (for CharacterSession.setResidue('combatText', …)). */
export function withFloat(cs, type, target, on) {
  const saved = (cs && cs.record && cs.record.residue && cs.record.residue.combatText) || {};
  const next = {};
  for (const [k, v] of Object.entries(saved)) next[k] = Object.assign({}, v);
  next[type] = Object.assign({}, next[type], { [target]: !!on });
  return next;
}
