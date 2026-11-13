// ============================================================================
// src/core/temper.js — WHAT A HERO'S TEMPERING DOES TO A FIGHT (src/data/temper.js, the design's table).
//
// `temper` is the server's: hr_perks_of's `temper` map, { 'temper:blows:2': 3, ... }. Absent or empty, every function
// here answers "nothing", DRAWS NOTHING and hands back what it was given, so a hero at rung 0 fights byte for byte as
// before (tests/hunt-core/temper.mjs). The magnitude is never the row's number: a rung is clamped to the ladder.
//
// THE TWO TRACKS, each in what a player feels: Blows raises what lands on a monster (a spell's, a bleed's and a heal's
// too); Armor lowers what reaches the hero, after the armor chain and never past its total cap, the unit the balance
// ruling measures armor in ("less actual incoming damage"). Tempering armor POINTS paid nothing: a rung moved plate and
// leather 0.3% on the curve, and a full cloth set's ward floored to the same whole point for three rungs out of five.
//
// THE ROUNDING. Blows land as whole HP, and a flat `floor(n x 1.01)` pays nothing on any blow under 100, so the part of a
// point is one draw: +1% on a blow of 20 lands 21 one time in five. The mean is exact on any blow. The draw is the hunt's
// own seeded stream, made only by a hero with a rung, so the server and the browser land the same blow.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================================

import { ARMOUR_WEIGHT } from '../data/core-model.js?v=0.2.127';
import { TEMPER_RUNGS, TEMPER_RUNG_PM, TEMPER_TIERS, temperUnlockId } from '../data/temper.js?v=0.2.127';

/* The armor points a piece wears: a shield or a cape wears none here (mitigation.js armourValues reads the same pieces). */
const armorPointsOf = (it) => (it && it.slot && ARMOUR_WEIGHT[it.armourClass] ? Math.floor(Number(it.defB) || 0) : 0);

/** The rung this hero holds on one ladder, clamped; 0 for a tier with no ladder. */
export function temperRung(temper, track, tier) {
  if (!temper || typeof temper !== 'object' || !TEMPER_TIERS[tier]) return 0;
  const n = Math.floor(Number(temper[temperUnlockId(track, tier)]));
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPER_RUNGS) : 0;
}

/** The permille this hero's blows and heals gain: its WEAPON's tier's Blows rung. 0 with none. */
export function blowsPmOf(equipment, items, temper) {
  const it = temper && equipment && equipment.weapon && items ? items[equipment.weapon] : null;
  return it ? temperRung(temper, 'blows', it.tier) * TEMPER_RUNG_PM : 0;
}

/**
 * The permille every blow at this hero loses: each worn armor piece's own tier's Armor rung, weighted by the armor the
 * piece wears. So a mixed set reads piece by piece, and moving one piece up a tier costs that piece's share of the rung,
 * never the whole ladder.
 */
export function armorPmOf(equipment, items, temper) {
  if (!temper || !equipment || !items) return 0;
  let worn = 0, rungs = 0;
  for (const id of Object.values(equipment)) {
    const it = id ? items[id] : null;
    const def = armorPointsOf(it);
    if (def > 0) { worn += def; rungs += def * temperRung(temper, 'armor', it.tier); }
  }
  return worn > 0 ? Math.floor((rungs * TEMPER_RUNG_PM) / worn) : 0;
}

/**
 * The line of armor this hero wears most, among the pieces with a ladder: { tier, armourClass }, the row the smith's window
 * offers (the most armor points, the higher tier on a tie). Null with no such piece.
 */
export function armorLineOf(equipment, items) {
  const worn = {};
  for (const id of Object.values(equipment || {})) {
    const it = id && items ? items[id] : null;
    const def = armorPointsOf(it);
    if (def > 0) {
      const k = (worn[it.tier] = worn[it.tier] || { tier: it.tier, armourClass: it.armourClass, def: 0, best: 0 });
      k.def += def;
      if (def > k.best) { k.best = def; k.armourClass = it.armourClass; }
    }
  }
  const lines = Object.values(worn).sort((a, b) => b.def - a.def || b.tier - a.tier);
  const top = lines.find((l) => TEMPER_TIERS[l.tier]) || lines[0];
  return top ? { tier: top.tier, armourClass: top.armourClass } : null;
}

/**
 * `amount` moved by `pm` permille (a blow up, a blow at a hero down), in whole points. The part of a point is one draw
 * from `rng`, made only when there is a part, so the mean is exact. No rung, or nothing to move: `amount`, nothing drawn.
 */
export function temperedAmount(amount, pm, rng) {
  if (!pm || !(amount > 0)) return amount;
  const milli = Math.floor(amount) * (1000 + pm);
  const part = milli % 1000;
  return Math.floor(milli / 1000) + (part > 0 && rng.chance(part / 1000) ? 1 : 0);
}
