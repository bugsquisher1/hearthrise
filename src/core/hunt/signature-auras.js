// ============================================================
// src/core/hunt/signature-auras.js — AN AURA A SIGNATURE WEARS: a standing effect on the heroes round its wearer, or on its partner (systems,
// lane/signatures-batch-4, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Batch 4: what is left, and the pieces it needs" P1,
// "Stacking keys"; the rows are src/data/signatures.js `aura`: Sergeant's Sash, Gatekeeper's Plate, Convoy Bell, Lead Rein).
//
// A worn Signature with `aura` holds its effect on every living hero it covers while its wearer lives, read at every blow, heal and regen
// tick (never persisted, never a stack on the unit, so a settle cut anywhere reads the same tiles and health at the same sub-step):
//   covers   the wearer, and with `r` every living hero of its side within r tiles (Chebyshev); with `to: 'with'` only the living hero
//            of its side that wears the Signature `with` names (its partner)
//   with     only while a living hero of the wearer's side, not the wearer, wears that Signature (the pair: #45 and #46 name each other)
//   belowPm  only on a covered hero under that share of its max health, read as the effect is (a heal's line as it begins)
//   one effect, permille:
//     takenPm  less (negative) damage taken from every blow: Guarded's key (statuses.js hero_takes_less, `add`, held to its cap with
//              every other source, 15 "Damage taken by a hero": #35 and #46 beside #1, #3 and #17), read in damage.js landHit
//     regenPm  more mana regeneration (abilities.js regenMana, beside Still Mind): #34
//     healPm   more on every cast heal the WEARER lands on a covered hero (heal-rules.js landHeal, before its cut): #45
// ONE A SIGNATURE: two wearers of one Signature cover a hero once; different Signatures add (15 "the same Signature counts once").
// WHY NOT A LEDGER ROW (src/core/hunt/auras.js, a slotted aura move's): no Signature is routed through the gear slice ledger (15 "Decision:
// how a Signature stays inside the gear slice"), and its cap would hold #45's +30% to 7% on its own wearer; a Signature is sized by what
// it measures (CONFLICTS 2026-11-28 signatures-batch-4).
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random. Draws nothing.
// ============================================================

import { SIGNATURES } from '../../data/signatures.js';
import { cheb } from './grid.js';
import { isHero, isAlly } from './sides.js';

const NONE = Object.freeze([]);
const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
/* the stacking key an effect counts in (statuses.js STATUS_KEYS), by field: none for a field no status carries (added plainly) */
const KEY = Object.freeze({ takenPm: 'hero_takes_less' });

/* the heroes of the instance wearing a Signature with an aura, read once an instance (a boundary writes `signature`; a swing never) */
function wearersOf(inst) {
  if (inst.sigAuraWearers) return inst.sigAuraWearers;
  const out = inst.world.units.filter((u) => isHero(u) && own(SIGNATURES, u.signature) && !!SIGNATURES[u.signature].aura);
  inst.sigAuraWearers = out.length ? out : NONE;
  return inst.sigAuraWearers;
}

/* does a living hero of `w`'s side other than `w` wear Signature `id` */
const partnerIn = (inst, w, id) => inst.world.units.some((o) => o !== w && o.alive === true && isHero(o) && isAlly(w, o) && o.signature === id);

/**
 * THE AURA EFFECTS hero `unit` holds now of one field ('takenPm' | 'regenPm' | 'healPm'): [{ key, id, v }], one a Signature (its id the
 * row, its stacking key the field's), or none. `from`: only the aura its wearer `from` holds (a heal `from` casts: healPm).
 */
export function auraEffects(inst, unit, field, from) {
  if (!inst || !inst.world || !isHero(unit) || unit.alive !== true) return NONE;
  const ws = wearersOf(inst);
  if (!ws.length) return NONE;
  let out = null;
  for (const w of ws) {
    if (w.alive !== true || (w !== unit && !isAlly(w, unit)) || (from && w !== from)) continue;
    const s = SIGNATURES[w.signature], a = s.aura;
    if (!Number.isInteger(a[field])) continue;
    if (a.with !== undefined && !partnerIn(inst, w, a.with)) continue;
    const covers = a.to === 'with' ? unit !== w && unit.signature === a.with : w === unit || (Number.isInteger(a.r) && cheb(w, unit) <= a.r);
    if (!covers) continue;
    if (a.belowPm !== undefined && !(int(unit.hp) * 1000 < a.belowPm * int(unit.maxHp))) continue;
    if (out && out.some((e) => e.id === s.id)) continue;
    (out || (out = [])).push({ key: KEY[field] || null, id: s.id, v: a[field] });
  }
  return out || NONE;
}

/** The permille of one field the party's worn Signatures' auras give hero `unit` now, the different Signatures added (auraEffects); 0 with
    none. For a field no stacking key holds (regenPm, healPm). */
export function auraPm(inst, unit, field, from) {
  const list = auraEffects(inst, unit, field, from);
  let pm = 0;
  for (const e of list) pm += e.v;
  return pm;
}
