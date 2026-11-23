// ============================================================
// src/core/reference-company.js — THE REFERENCE COMPANY'S OUTPUT, THE ONE INTERFACE MONSTERS ARE DERIVED FROM (lane/monster-formula;
// 04-math-strategy.md section 1, 27-formula-overhaul.md section 2.1: "monster HP and blow are read off the engine's own reference-company
// output, never a line typed in Level").
//
//   refCompany(level)  { level, heroes, dpsHead, dpsFight, hp, takePm, hit }: four heroes of that Level, MID kits, on Steady:
//     dpsHead   a head's damage a HUNTED second
//     dpsFight  the company's damage a FIGHTING second (four heads over the reference fight share): a monster's health is seconds of it
//     hp        the reference hero's health
//     takePm    the share of a landed monster blow's roll that reaches the reference target after its armor chain, permille
//     hit       the share of a monster's swings that land on the reference hero (its aim is written to land this)
//
// src/core/hunt/monster-formula.js reads nothing else of the heroes, so when the fight pipeline counts heroes in steps (stage 3,
// lane/stage3-pipeline) ONLY THIS BODY CHANGES: it answers the pipeline's own reference output, and every formula monster re-derives
// with no re-fit. Until then the body is the BRIDGE: the measured table MONSTER_FORMULA.REF (src/data/monster-roles.js; v1-climb.mjs
// readers, lane/monster-formula), read straight between its Levels and held past the ends, and the reference hero's health from VITALS.
//
// PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { MONSTER_FORMULA } from '../data/monster-roles.js';
import { VITALS } from '../data/core-model.js';

/* the reference company is four heroes (04 section 1) */
const HEROES = 4;

/** THE REFERENCE COMPANY AT LEVEL `level`: the one door every derived monster reads (header). Pure. */
export function refCompany(level) {
  const R = MONSTER_FORMULA.REF, T = R.dps;
  const L = Math.max(1, Number(level) || 1);
  let dpsHead;
  if (L <= T[0][0]) dpsHead = T[0][1];
  else if (L >= T[T.length - 1][0]) dpsHead = T[T.length - 1][1];
  else {
    let k = 1;
    while (L > T[k][0]) k++;
    const [a, da] = T[k - 1], [b, db] = T[k];
    dpsHead = da + ((db - da) * (L - a)) / (b - a);
  }
  return { level: L, heroes: HEROES, dpsHead, dpsFight: (HEROES * dpsHead) / R.fightShare, hp: VITALS.hpBase + VITALS.hpPerLevel * L,
    takePm: R.takePm, hit: R.hit };
}
