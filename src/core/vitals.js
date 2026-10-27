// ============================================================
// src/core/vitals.js — MAX HP, MAX MANA AND THE REGEN RATE, from Level, armour
// weight and Prayer (docs/design/CORE_MODEL.md §3, §5; Tyler 2026-10-14/19).
//
//   maxHp   = floor((hpBase + hpPerLevel x (L-1)) x (1000 + heavyPm) / 1000)
//   maxMana = floor((manaBase + manaPerLevel x (L-1)) x (1000 + lightPm) / 1000)
//   heavyPm = floor(heavyHpPermille x heavy slots / ARMOUR_SLOTS)   (light alike)
//   regen   = 1000 + floor(maxPermille x P / (P + k)), P = the Prayer level
//             (permille of the base HP and mana regen rates, resting and in fight)
//
// DERIVED, NEVER STORED: the server computes the same integers in hr_vitals_of
// (parity: tests/core-curves.mjs). Integer arithmetic in one order, so the
// browser, the edge and Postgres cannot disagree by a rounding.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

import { VITALS, ARMOUR_WEIGHT, ARMOUR_SLOTS, PRAYER_REGEN } from '../data/core-model.js?v=0.2.54';
import { charLevelFromXp, levelOf } from './xp.js?v=0.2.54';
import { isShield } from '../data/shields.js?v=0.2.54';

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/** How many worn pieces of each armour weight `equipment` holds: { heavy, medium, light }.
    Every worn item counts by its own armourClass (only armour carries one), so the server's
    hr_vitals_of counts the same rows (hr_items.armour_weight); the share's denominator is
    ARMOUR_SLOTS.length, the armour slots a full set fills. */
export function armourWeights(equipment, items) {
  const out = { heavy: 0, medium: 0, light: 0 };
  for (const id of Object.values(equipment || {})) {
    const it = id && items ? items[id] : null;
    const w = it && it.slot ? ARMOUR_WEIGHT[it.armourClass] : null;
    if (w) out[w] += 1;
  }
  return out;
}

/** Does `equipment` wear any armour piece? (Defense trains only then.) A worn SHIELD counts (Tyler 2026-10-23,
    SHIELDS: it is armour for Defense XP), though it adds no armour weight (max HP and mana read ARMOUR_SLOTS only). */
export function wearsArmour(equipment, items) {
  if (holdsShield(equipment, items)) return true;
  for (const slot of ARMOUR_SLOTS) {
    const id = equipment && equipment[slot];
    const it = id && items ? items[id] : null;
    if (it && (ARMOUR_WEIGHT[it.armourClass] || int(it.defB) > 0)) return true;
  }
  return false;
}

/** Does `equipment` hold a shield in its off-hand (src/data/shields.js isShield)? A blow it turns aside is a BLOCK:
    Defense trains COMBAT_XP.blockMult times over (src/core/hunt-rewards.js, Tyler 2026-10-18). */
export function holdsShield(equipment, items) {
  const id = equipment && equipment.shield;
  return isShield(id && items ? items[id] : null);
}

/** Max HP at Level `level` wearing `heavy` heavy armour slots. */
export function maxHpFor(level, heavy) {
  const L = Math.max(1, int(level));
  const pm = Math.floor((VITALS.heavyHpPermille * int(heavy)) / ARMOUR_SLOTS.length);
  return Math.floor(((VITALS.hpBase + VITALS.hpPerLevel * (L - 1)) * (1000 + pm)) / 1000);
}

/** Max mana at Level `level` wearing `light` light armour slots. */
export function maxManaFor(level, light) {
  const L = Math.max(1, int(level));
  const pm = Math.floor((VITALS.lightManaPermille * int(light)) / ARMOUR_SLOTS.length);
  return Math.floor(((VITALS.manaBase + VITALS.manaPerLevel * (L - 1)) * (1000 + pm)) / 1000);
}

/** The regen rate at Prayer level `p`, permille of the base rate (1000 = no bonus). */
export function regenPermille(p) {
  const P = Math.max(1, int(p));
  return 1000 + Math.floor((PRAYER_REGEN.maxPermille * P) / (P + PRAYER_REGEN.k));
}

/**
 * Every vital of a character: { level, maxHp, maxMana, regenPm }.
 * @param c { levelXp, skills (xp map), equipment, items }
 */
export function vitalsOf(c) {
  const level = charLevelFromXp(c && c.levelXp);
  const w = armourWeights(c && c.equipment, c && c.items);
  return { level, maxHp: maxHpFor(level, w.heavy), maxMana: maxManaFor(level, w.light),
    regenPm: regenPermille(levelOf(c && c.skills, 'prayer')) };
}
