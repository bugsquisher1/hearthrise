// ============================================================
// src/core/mitigation.js — WHAT A HERO'S ARMOUR DOES TO A BLOW (ruling K7, Tyler 2026-10-18).
//
//   Heavy = Absorb, Medium = Dodge, Light = Ward. Each worn piece's armour value (`defB`)
//   feeds its own weight's line, so a mixed set splits by what each slot wears.
//
//   dodgePm  = floor(dodge.maxPm  x Pm / (Pm + dodge.k  x L))     Pm = medium armour value
//   absorbPm = floor(absorb.maxPm x Ph / (Ph + absorb.k x L))     Ph = heavy armour value
//   ward     = floor(Pl x ward.perPointPm / 1000)                 Pl = light armour value
//   keepPm   = the least permille of a LANDED blow that reaches past absorb and ward, so that
//              (1000 - dodgePm) x keepPm / 1000 >= 1000 - capPm: the total cap over the chain.
//   L = the hero's Level. Every number is src/data/core-model.js ARMOUR_MITIGATION.
//
// The order a blow at a hero takes (src/core/hunt/damage.js landHit + hurt): dodge, absorb,
// resistances, ward, then the spell shield and HP. DERIVED, NEVER STORED: the settle writes the
// profile onto the hero's unit at every swing boundary (combat-sim.js syncUnit) from the same
// gear and Level the server holds; the character sheet shows the same numbers.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { ARMOUR_WEIGHT, ARMOUR_MITIGATION } from '../data/core-model.js?v=0.2.40';

const nat = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** The armour value each weight wears: { heavy, medium, light } (the sum of its pieces' defB). */
export function armourValues(equipment, items) {
  const out = { heavy: 0, medium: 0, light: 0 };
  for (const id of Object.values(equipment || {})) {
    const it = id && items ? items[id] : null;
    const w = it && it.slot ? ARMOUR_WEIGHT[it.armourClass] : null;
    if (w) out[w] += nat(it.defB);
  }
  return out;
}

/* maxPm x P / (P + k x L), whole permille; 0 with no armour of that weight. */
const curve = (row, p, level) => (p > 0 ? Math.floor((row.maxPm * p) / (p + row.k * Math.max(1, level))) : 0);

/** No armour: nothing is dodged, absorbed or warded. */
export const NO_MITIGATION = Object.freeze({ dodgePm: 0, absorbPm: 0, ward: 0, keepPm: 0 });

/**
 * The mitigation profile of a hero wearing `values` (armourValues) at Level `level`:
 * { dodgePm, absorbPm, ward, keepPm }. keepPm 0 = no floor needed (nothing to cap).
 */
export function mitigationOf(values, level) {
  const M = ARMOUR_MITIGATION;
  const v = values || {};
  const L = Math.max(1, nat(level));
  const cap = M.capPm;
  /* Dodge alone can never pass the cap; absorb is then held so the two together cannot. */
  const dodgePm = Math.min(cap, curve(M.dodge, nat(v.medium), L));
  const keepPm = dodgePm >= 1000 ? 1000 : Math.min(1000, Math.ceil(((1000 - cap) * 1000) / (1000 - dodgePm)));
  const absorbPm = Math.min(1000 - keepPm, curve(M.absorb, nat(v.heavy), L));
  const ward = Math.floor((nat(v.light) * M.ward.perPointPm) / 1000);
  if (!dodgePm && !absorbPm && !ward) return NO_MITIGATION;
  return Object.freeze({ dodgePm, absorbPm, ward, keepPm });
}

/** The profile of `equipment` at Level `level` (the one call the settle and the sheet make). */
export function mitigationFor(equipment, items, level) {
  return mitigationOf(armourValues(equipment, items), level);
}

/**
 * A LANDED blow of `n` through absorb, the resistance permille `el` and ward, never below the
 * profile's keep floor (the total cap) nor below 1. Answers what reaches the shield and HP.
 */
export function mitigate(n, el, mit) {
  const raw = Math.max(0, Math.floor(n));
  const m = mit || NO_MITIGATION;
  let x = raw - Math.floor((raw * (m.absorbPm || 0)) / 1000);
  x = Math.floor((x * el) / 1000);
  x -= Math.max(0, m.ward || 0);
  const floor = m.keepPm ? Math.floor((Math.floor((raw * el) / 1000) * m.keepPm) / 1000) : 0;
  return Math.max(1, floor, x);
}
