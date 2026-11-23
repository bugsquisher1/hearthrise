// ============================================================
// src/core/reference-company.js — THE REFERENCE COMPANY'S OUTPUT, THE ONE INTERFACE MONSTERS ARE DERIVED FROM (lane/monster-formula;
// 04-math-strategy.md section 1, 27-formula-overhaul.md section 2.1: "monster HP and blow are read off the engine's own reference-company
// output, never a line typed in Level").
//
//   refCompany(level, chain)  { level, heroes, dpsHead, dpsFight, hp, takePm, hit }: four heroes of that Level, MID kits, on Steady, in the
//                      fight chain the monster is met in: 'steps' (the Danger scale's amount pipeline, src/core/hunt/amount.js) or the old
//                      chain (anything else: the Burning Tower's rooms and every ground off the scale, until stage 6):
//     dpsHead   a head's damage a HUNTED second
//     dpsFight  the company's damage a FIGHTING second (four heads over the reference fight share): a monster's health is seconds of it
//     hp        the reference hero's health
//     takePm    the share of a landed monster blow's roll that reaches the reference target after its armor chain, permille
//     hit       the share of a monster's swings that land on the reference hero (its aim is written to land this)
//
// src/core/hunt/monster-formula.js reads nothing else of the heroes. TWO BODIES, one door:
//   'steps'   THE AMOUNT PIPELINE'S OWN OUTPUT (lane/stage3-pipeline; 27 section 2.1): every amount is a share of a reference health
//             (amount.js refHealth), so the reference head's damage a hunted second is one SHARE of refHealth(level), the measured table's
//             at the Level the pipeline's blows were fitted at (AMOUNT.fitLevel) and the same share at every Level (the scale test: 369 to
//             372 held at Levels 30 to 3,000); a landed monster blow reaches the reference target at AMOUNT.pressurePm, and lands at
//             REF.hit only while AMOUNT.hitRoll holds (27 K-2), else always. A formula ground on the scale derives from this.
//   the old chain (the BRIDGE): the measured table MONSTER_FORMULA.REF (src/data/monster-roles.js; v1-climb.mjs readers,
//             lane/monster-formula), read straight between its Levels and held past the ends, and the reference hero's health from
//             VITALS: the old hero blow's share of a health falls with Level (the table holds 27 at Level 60 and 26 at 175), and a
//             monster met in that chain must be sized against it.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTER_FORMULA } from '../data/monster-roles.js';
import { VITALS } from '../data/core-model.js';
import { AMOUNT } from '../data/amount.js';
import { refHealth } from './hunt/amount.js';

/* the reference company is four heroes (04 section 1) */
const HEROES = 4;

/* the measured table read straight between its Levels, held past the ends */
function tableDps(L) {
  const T = MONSTER_FORMULA.REF.dps;
  let dpsHead;
  if (L <= T[0][0]) dpsHead = T[0][1];
  else if (L >= T[T.length - 1][0]) dpsHead = T[T.length - 1][1];
  else {
    let k = 1;
    while (L > T[k][0]) k++;
    const [a, da] = T[k - 1], [b, db] = T[k];
    dpsHead = da + ((db - da) * (L - a)) / (b - a);
  }
  return dpsHead;
}

/** THE REFERENCE COMPANY AT LEVEL `level` in fight `chain` ('steps' or the old chain): the one door every derived monster reads (header). Pure. */
export function refCompany(level, chain) {
  const R = MONSTER_FORMULA.REF;
  const L = Math.max(1, Number(level) || 1);
  if (chain === 'steps') {
    const share = tableDps(AMOUNT.fitLevel) / refHealth(AMOUNT.fitLevel);
    const dpsHead = share * refHealth(L);
    return { level: L, heroes: HEROES, dpsHead, dpsFight: (HEROES * dpsHead) / R.fightShare, hp: refHealth(L),
      takePm: AMOUNT.pressurePm, hit: AMOUNT.hitRoll ? R.hit : 1 };
  }
  const dpsHead = tableDps(L);
  return { level: L, heroes: HEROES, dpsHead, dpsFight: (HEROES * dpsHead) / R.fightShare, hp: VITALS.hpBase + VITALS.hpPerLevel * L,
    takePm: R.takePm, hit: R.hit };
}
