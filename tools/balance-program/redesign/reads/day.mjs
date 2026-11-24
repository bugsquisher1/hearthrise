// tools/balance-program/redesign/reads/day.mjs: Bold's party-day against Steady (29-tuning-pass.md 7.2), from the v1-climb reports. Run from the repo root.
import { charXpForLevel } from '../../../../src/core/xp.js';
import { readFileSync } from 'node:fs';
const j = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DEATH = 0.06;
const rows = [
  ['ford', 52, 'tools/balance-program/redesign/tuning/roles/final/c0-ford-ref.json', 'tools/balance-program/redesign/reads/ford-bold.json'],
  ['muster', 60, 'tools/balance-program/redesign/tuning/final/c0-muster-ref.json', 'tools/balance-program/redesign/reads/muster-bold.json'],
  ['bone', 175, 'tools/balance-program/redesign/tuning/roles/final/c0-bone-ref.json', 'tools/balance-program/redesign/reads/bone-bold.json'],
];
for (const [g, L, c0, nb] of rows) {
  const A = j(c0).cells, B = j(nb).cells['base:bold'];
  const st = A['base:steady'], b0 = A['base:bold'];
  const tot = charXpForLevel(L);
  const day = (c) => c.xpPerHeroH * 4 * 10 - (c.deaths / 8) * DEATH * tot; // per party-day, a death 6% of the dead hero's total Level XP
  console.log(g, 'L', L, 'totXP', tot, '| steady', Math.round(day(st)), '| bold now', Math.round(day(b0)), 'd/day', b0.deaths / 8,
    '| bold to the end', Math.round(day(B)), 'd/day', B.deaths / 8, 'day vs steady', (day(B) / day(st)).toFixed(3),
    'hour vs steady', (B.xpPerHeroH / st.xpPerHeroH).toFixed(2), 'first deaths h', JSON.stringify(B.firstDeathH));
}
