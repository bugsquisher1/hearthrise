// ============================================================
// src/core/hunt/imbue-leech.js — A WORN LEECH IN THE FIGHT (systems, lane/imbue-engine, 2026-11-27; docs/design/redesign/21-flame-temper-
// imbue-loot.md section 11 ruling D-18; the rows are src/data/imbue-rules.js, the arithmetic src/core/imbue.js leechOf and leechPay).
//
// THE RULE. After each blow its wearer lands on a foe (a swing, a shot, a spell's hit; never a status tick, a reflected blow or any other
// piece that lands as `dot`: damage.js landHit is the one door every blow goes through), a Leech pays back its `pm` permille of the HP the
// blow took:
//   back  = floor((took x pm + carry) / 1000)        carry' = the remainder, 0 to 999
// Life Leech: HP, through the heal cut (heal-cut.js healTaken: Withered), never past max HP; a `heal` event naming the imbuement, from the
// hero to itself (the tally's self heal, tally.js). Mana Leech: mana, never past max mana, carried on the blow's `dmg` event as `back` (the
// tally's mana in). The remainder is carried whatever the cap took, so a 30 HP swing at 20 permille pays 0, 1, 0, 1, 1 over five blows.
// No contest curve: the share is of the blow, which already reads the hero (21 D-18); a Leech past wearAhead under its band plays nothing.
//
// PERSISTED on the unit as `leechMilli` (world-state.js composes it), like `shield`: the carry survives every settle cut, so a closed hunt
// (90 s windows) and a viewed one (30 s windows) heal the same HP on the same blows (world-step#split-parity; tests/worn-imbues-db.mjs).
// Draws nothing. A hero with no worn Leech (every hero while imbuements are dark) reads one field and stops.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { leechOf, leechPay } from '../imbue.js';
import { healTaken } from './heal-cut.js';
import { isEnemy } from './sides.js';

/* leechMilli: the thousandths of a point a worn Leech carries to its wearer's next blow (blank 0) */
export const PERSISTED = Object.freeze({ unit: Object.freeze([['leechMilli', 'int']]), world: Object.freeze([]), pack: Object.freeze([]) });

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };

/**
 * ONE BLOW'S LEECH: `u` (the blow's dealer) landed a blow on `t` that took `took` HP. Applies what its worn Leech pays back and keeps the
 * remainder on `u`; answers { id, hp, mana } (what it landed, the imbuement's id for the event), or null when `u` wears no Leech, the blow
 * took nothing or was no blow at a foe. The caller (damage.js landHit) writes the events.
 */
export function leechOn(u, t, took) {
  if (!u || !u.imbues || u.alive !== true || !(took > 0) || !t || !isEnemy(u, t)) return null;
  const l = leechOf(u.imbues, u.heroLv);
  if (!l) return null;
  const pay = leechPay(took, l.pm, u.leechMilli);
  u.leechMilli = pay.carry;
  if (!(pay.back > 0)) return null;
  if (l.of === 'mana') {
    const got = Math.max(0, Math.min(pay.back, int(u.maxMana) - int(u.mana)));
    if (got) u.mana = int(u.mana) + got;
    return got ? { id: l.id, hp: 0, mana: got } : null;
  }
  const got = Math.max(0, Math.min(healTaken(u, pay.back), int(u.maxHp) - int(u.hp)));
  if (got) u.hp = int(u.hp) + got;
  return got ? { id: l.id, hp: got, mana: 0 } : null;
}
