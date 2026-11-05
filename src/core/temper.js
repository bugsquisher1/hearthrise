// ============================================================================
// src/core/temper.js — WHAT A HERO'S TEMPERING DOES TO A FIGHT (src/data/temper.js, the design's table).
//
// `temper` is the server's: hr_perks_of's `temper` map, { 'temper:blows:2': 3, ... }. Absent or empty, every function
// here answers "nothing", DRAWS NOTHING and hands back what it was given, so a hero at rung 0 fights byte for byte as
// before (tests/temper.mjs TP-ZERO). The magnitude is never the row's number: a rung is clamped to the ladder.
//
// THE ROUNDING. Blows land as whole HP. A flat `floor(n x 1.01)` pays nothing on any blow under 100, and most of a Level
// 24's blows are under 100, so rung 1 would be gold for nothing. So the part of a point a blow earns is one draw: +1%
// on a blow of 20 lands 21 one time in five. The mean is exact on any blow (TP-ROUND). The draw is the hunt's own seeded
// stream, made only by a hero with a rung, so the server and the browser land the same blow.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================================

import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.90';
import { TEMPER_RUNGS, TEMPER_RUNG_PM, TEMPER_TIERS, temperUnlockId } from '../data/temper.js?v=0.2.90';

/** The rung this hero holds on one ladder, clamped; 0 for a tier with no ladder. */
export function temperRung(temper, track, tier) {
  if (!temper || typeof temper !== 'object' || !TEMPER_TIERS[tier]) return 0;
  const n = Math.floor(Number(temper[temperUnlockId(track, tier)]));
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPER_RUNGS) : 0;
}

/** The permille every blow, spell and heal of this hero gains: its WEAPON's tier's Blows rung. 0 with none. */
export function blowsPmOf(equipment, items, temper) {
  const it = equipment && equipment.weapon && items ? items[equipment.weapon] : null;
  return it ? temperRung(temper, 'blows', it.tier) * TEMPER_RUNG_PM : 0;
}

/**
 * `values` (mitigation.js armourValues: what each weight wears) with each worn piece's own tier's Armor rung on top: a
 * mixed set reads each piece by its tier. The same object when no rung applies. Fractions stay: the armor curve reads them.
 */
export function temperedArmour(values, equipment, items, temper) {
  if (!temper || !equipment || !items) return values;
  let out = values;
  for (const id of Object.values(equipment)) {
    const it = id ? items[id] : null;
    const w = it && it.slot ? ARMOUR_WEIGHT[it.armourClass] : null;
    const rung = w ? temperRung(temper, 'armor', it.tier) : 0;
    if (!rung) continue;
    if (out === values) out = Object.assign({}, values);
    out[w] += (Math.floor(Number(it.defB) || 0) * rung * TEMPER_RUNG_PM) / 1000;
  }
  return out;
}

/**
 * `amount` raised by `pm` permille, in whole points. The part of a point is one draw from `rng`, made only when there is
 * a part, so its mean is exact. A miss stays a miss, and with no rung nothing is drawn.
 */
export function temperedAmount(amount, pm, rng) {
  if (!(pm > 0) || !(amount > 0)) return amount;
  const whole = Math.floor(amount);
  const milli = whole * pm;
  const part = milli % 1000;
  return whole + Math.floor(milli / 1000) + (part > 0 && rng.chance(part / 1000) ? 1 : 0);
}
