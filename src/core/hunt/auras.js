// ============================================================
// src/core/hunt/auras.js — PARTY AURAS, ON WHILE SLOTTED (lane/e2-e3-statuses, E3; src/data/auras.js)
//
// A hero whose bar holds an aura move (an ability row with target 'aura', src/data/abilities.js) WEARS that aura while it lives. Every
// living hero of its side within the aura's radius (Chebyshev tiles, the wearer itself at 0) gets one POWER LEDGER ROW of it:
//   { slice, raises, steps, key, scope: 'party', worn }     worn: true on the wearer, false on an ally
// and the ledger (src/core/power-ledger.js clampLedger) counts it by the party-row rule: one per key a party (two fires of one key: the
// larger, never both), an ally's whole and outside its own cap, the wearer's inside its own slice. damage.js reaches it through
// danger.js powerPm, with the hero's own ledger rows, on the Danger scale as every ledger row is; a viewed and a closed hunt read the
// same bars and the same tiles at the same sub-step, so both count the same.
//
// The wearers are read once an instance (inst.auraWearers: a bar never changes inside one swing), the tiles at every read.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { AURAS } from '../../data/auras.js';
import { ABILITIES } from '../../data/abilities.js';
import { cheb } from './grid.js';
import { isHero, isAlly } from './sides.js';
import { withTalentRows } from './talent-rows.js';

const NONE = Object.freeze([]);

/* The aura rows hero entry `h` wears: one a slotted aura move, each key once (a bar with two fires of one key wears the larger). */
function wornBy(h) {
  const byKey = new Map();
  for (const r of h && Array.isArray(h.slots) ? h.slots : NONE) {
    const a = r && r.slot && r.slot.action;
    const row = a && a.type === 'ability' ? ABILITIES[a.id] : null;
    const aura = row && row.target === 'aura' ? AURAS[row.aura] : null;
    if (!aura) continue;
    const was = byKey.get(aura.key);
    if (!was || aura.steps > was.steps) byKey.set(aura.key, aura);
  }
  return [...byKey.values()];
}

/* [hero unit, its aura rows] for every hero of the instance that wears one; read once an instance */
function wearers(inst) {
  if (inst.auraWearers) return inst.auraWearers;
  const out = [];
  if (inst.heroes) for (const u of inst.world.units) if (isHero(u) && inst.heroes[u.id]) { const rows = wornBy(inst.heroes[u.id]); if (rows.length) out.push([u, rows]); }
  inst.auraWearers = out;
  return out;
}

/** THE LEDGER ROWS THAT HOLD ON HERO `unit` NOW beside its own `ledger`, read by danger.js powerPm at every blow: the party's auras on it
    (below), and its own Roads rows whose condition holds now (src/core/hunt/talent-rows.js; none with no build). None for a monster or a
    dead hero. */
export function auraRowsOn(inst, unit) {
  const auras = partyAurasOn(inst, unit);
  return Array.isArray(unit && unit.talentWhen) && unit.talentWhen.length ? withTalentRows(inst, unit, auras) : auras;
}

/* The ledger rows the party's auras put on hero `unit` now (none for a monster, a dead hero or a party wearing no aura). */
function partyAurasOn(inst, unit) {
  if (!inst || !inst.world || !isHero(unit) || unit.alive !== true) return NONE;
  const ws = wearers(inst);
  if (!ws.length) return NONE;
  let out = null;
  for (const [w, rows] of ws) {
    if (w.alive !== true || (w !== unit && !isAlly(w, unit))) continue;
    const d = w === unit ? 0 : cheb(w, unit);
    for (const a of rows) {
      if (d > a.radius) continue;
      (out || (out = [])).push({ slice: a.slice, raises: a.raises, steps: a.steps, key: a.key, scope: 'party', worn: w === unit });
    }
  }
  return out || NONE;
}
