#!/usr/bin/env node
// tools/balance-program/formulas/tier-read.mjs — READ-ONLY: every ground's harder-tier rows as the engine reads them, and the Level a
// floor monster is read at by armor on each (hunt-tiers.js levelAtTier: the tier's dmgPm on the monster's Level). Balance program
// 41-formulas-combat.md, exception X-TIER-TRIPLE.
//   node tools/balance-program/formulas/tier-read.mjs
import { GROUND_TIERS, levelAtTier } from '../../../src/data/hunt-tiers.js';
import { HUNT_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../../../src/data/hunts.js';
import { MONSTERS } from '../../../src/data/monsters.js';
import { mitigationOf } from '../../../src/core/mitigation.js';

console.log('ground                     floor  tier        pull  dmgPm  hpPm  xpPm   a floor monster reads as Level   absorb of 100 plate points: Normal -> tier');
for (const [g, rows] of Object.entries(GROUND_TIERS)) {
  const band = HUNT_INDEX[HUNT_GROUNDS[g].hunt] && HUNT_INDEX[HUNT_GROUNDS[g].hunt].band;
  if (!band) continue;
  for (const r of Object.values(rows)) {
    const L = levelAtTier(band[0], r);
    console.log(g.padEnd(27) + String(band[0]).padStart(5) + '  ' + r.id.padEnd(10) + String(r.pull[0]).padStart(6) + String(r.dmgPm).padStart(7) + String(r.hpPm).padStart(6) + String(r.xpPm).padStart(6)
      + String(L).padStart(20) + '              ' + mitigationOf({ heavy: 100 }, band[0]).absorbPm + ' -> ' + mitigationOf({ heavy: 100 }, L).absorbPm);
  }
}
const shooters = Object.entries(MONSTERS).filter(([, m]) => m.range).map(([id, m]) => id + ' (range ' + m.range + ')');
console.log('\nshooters: ' + shooters.join(', '));
