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
