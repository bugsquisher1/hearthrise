// balance-variant: armor/hit-ratio
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/variants/armor/armor.hit-ratio.js — ARMOR AGAINST HIT SIZE, UNCAPPED: a formula family for the rule slot `armor`
// (tools/balance-program/rule-slots.json). Engine code the one engine runs, never a model of it: a scratch copy plays it in place of
// src/core/mitigation.js, with the shipped module beside it as mitigation.shipped.js lending every export this family does not change
// (armourValues, steadyPmOf, NO_MITIGATION). Never in a bundle: tools/pack-edge.mjs refuses it.
//
// THE FAMILY (docs/design/redesign/04-math-strategy.md section 2, the families table's "Armor against hit size", the ARPG calculators'
// shape, and section 15 "Defense"). Heavy armor's absorb is priced against the BLOW, not against the attacker's Level:
//
//   absorbPm(n) = floor(absorb.maxPm x Ph / (Ph + HIT_K x n))        Ph = heavy armor value, n = the blow before armor
//
// so a heavy set is strong against many small blows and weak against one big one, with no Level term and NO TOTAL CAP (04 section 2:
// "No cap. The limit on defense is the number of steps a kit can hold"). Dodge (medium, against the attacker's Level) and ward (light,
// flat) are the shipped lines with the cap taken off; the order of the chain and every draw are the shipped module's.
//
// HIT_K = 0.5, set so the two families agree on an AVERAGE blow and part only by blow size. COMPUTED 2026-11-21 over the 190 MONSTERS
// rows on set/v0.2.144: a monster's largest blow (combat.js monsterMaxHit) is a median 2.47 x its Level, a uniform blow's mean half of it,
// 1.24 x Level (REF_BLOW); the shipped absorb reads 0.62 x Level, and 0.62 / 1.24 = 0.5. REF_BLOW only prices the absorb the profile SHOWS
// (the character sheet's line); a played blow reads its own size.
//
// Shelf entry: added 2026-11-21, expires 2027-02-21 (rule-slots.json). The winner of a comparison moves into src/core; the loser is deleted.
// ════════════════════════════════════════════════════════════════════════
import { ARMOUR_MITIGATION } from '../data/core-model.js';
import { temperedAmount } from './temper.js';
import { NO_MITIGATION, armourValues } from './mitigation.shipped.js';

export * from './mitigation.shipped.js';

const HIT_K = 0.5;
const REF_BLOW = 1.24;

const nat = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
/* the shipped line, maxPm x P / (P + k x L), for dodge: whole permille, 0 with no armor of that weight */
const levelLine = (row, p, level) => (p > 0 ? Math.floor((row.maxPm * p) / (p + row.k * Math.max(1, level))) : 0);
/* the share of a blow of `n` that heavy armor `p` takes, whole permille */
const absorbAgainst = (p, n) => (p > 0 ? Math.floor((ARMOUR_MITIGATION.absorb.maxPm * p) / (p + HIT_K * Math.max(1, n))) : 0);

/**
 * The profile of armor `values` against an attacker of level `level`: { dodgePm, absorbPm, ward, keepPm, heavy }. `heavy` is what each
 * blow prices; `absorbPm` is the share an average blow of that attacker loses (what a sheet shows). keepPm is 0: this family has no cap.
 */
export function mitigationOf(values, level) {
  const v = values || {};
  const L = Math.max(1, nat(level));
  const heavy = nat(v.heavy);
  const dodgePm = levelLine(ARMOUR_MITIGATION.dodge, nat(v.medium), L);
  const ward = Math.floor((nat(v.light) * ARMOUR_MITIGATION.ward.perPointPm) / 1000);
  if (!dodgePm && !heavy && !ward) return NO_MITIGATION;
  return Object.freeze({ dodgePm, absorbPm: absorbAgainst(heavy, Math.round(REF_BLOW * L)), ward, keepPm: 0, heavy });
}

/** The profile of `equipment` against an attacker of level `level`. */
export function mitigationFor(equipment, items, level) {
  return mitigationOf(armourValues(equipment, items), level);
}

/**
 * A LANDED blow of `n` through absorb (priced on `n` itself), the resistance permille `el` and ward, never below 1. `armorPm` is the
 * wearer's Tempering and worn steadyPm, the chain's last step; none, and `rng` is not touched.
 */
export function mitigate(n, el, mit, armorPm, rng) {
  const raw = Math.max(0, Math.floor(n));
  const m = mit || NO_MITIGATION;
  let x = raw - Math.floor((raw * absorbAgainst(nat(m.heavy), raw)) / 1000);
  x = Math.floor((x * el) / 1000);
  x -= Math.max(0, m.ward || 0);
  if (armorPm) x = temperedAmount(x, -armorPm, rng);
  return Math.max(1, x);
}
