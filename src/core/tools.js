// ============================================================
// src/core/tools.js — gathering/artisan tool progression maths.
//
// Melvor-style application: the BEST tool you own for a skill auto-applies,
// no equip juggling. Tool items live in data/items.js (type:'tool',
// toolSkill, toolTier, toolSpeed).
//
// Ported from src/features/tools.js (b201), which now delegates here.
// The only change is that inventory/equipment/items arrive as arguments
// instead of being read off `window` — which is exactly what lets the
// accrual Edge Function price a gathering tick.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/** Highest-tier owned tool for a skill; checks the bag and (in case a tool
    is ever equipped) the equipment slots. */
export function bestTool(skill, inventory, equipment, items) {
  const cat = items || {};
  let best = null;
  const consider = (id) => {
    const it = cat[id];
    if (!it || it.type !== 'tool' || it.toolSkill !== skill) return;
    if (!best || (it.toolTier || 0) > (best.toolTier || 0)) best = Object.assign({ id }, it);
  };
  const inv = inventory || {};
  Object.keys(inv).forEach((id) => { if ((inv[id] || 0) > 0) consider(id); });
  const eq = equipment || {};
  Object.keys(eq).forEach((slot) => { if (eq[slot]) consider(eq[slot]); });
  return best;
}

export function toolSpeed(tool) { return tool ? (tool.toolSpeed || 0) : 0; }

/* Wave 3: a tool does THREE things. XP and double-yield are DERIVED from
   tier so they climb the ladder the player already climbs; a per-item
   override wins when set. Tier 1 = +2%/2%, Tier 7 (Dawnsteel) = +14%/14%. */
export function toolXpB(tool) {
  if (!tool) return 0;
  return (typeof tool.toolXpB === 'number') ? tool.toolXpB : (tool.toolTier || 0) * 0.02;
}

export function toolDouble(tool) {
  if (!tool) return 0;
  return (typeof tool.toolDouble === 'number') ? tool.toolDouble : (tool.toolTier || 0) * 0.02;
}

/**
 * The DETERMINISTIC extra-yield carry — deliberately NOT an RNG roll, so an
 * offline replay is byte-identical run to run. Each action banks
 * `qty × toolDouble` into a per-skill fractional carry and pays out whole
 * units as they accrue (a 10%-double tool = one bonus every ~10 actions).
 *
 * Mutates `carry` (the client's G._toolCarry, the server's equivalent
 * column) and returns the whole units earned this action.
 *
 * The +1e-9 matters: 0.1 accumulated ten times floats to 0.9999999999999999
 * and would never pay out without it.
 */
export function advanceToolCarry(carry, skill, qty, doubleRate) {
  if (!(doubleRate > 0)) return 0;
  const c = (carry[skill] || 0) + qty * doubleRate;
  const whole = Math.floor(c + 1e-9);
  carry[skill] = c - whole;
  return whole;
}
