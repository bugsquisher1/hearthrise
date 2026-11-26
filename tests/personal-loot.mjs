#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/personal-loot.mjs — PERSONAL LOOT'S SHARE, LUCK AND PITY, PROVEN IN NODE (lane/flame-temper-build, 2026-11-22;
// 21-flame-temper-imbue-loot.md section 4; src/data/party.js PERSONAL_LOOT, src/core/personal-loot.js; the roller is lane/drop-formula's).
//
//   node tests/personal-loot.mjs            the rules
//   node tests/personal-loot.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Personal loot (ch / n a hero, the flame's luck, per-hero pity at the stated rate)
// ci-run: node tests/personal-loot.mjs
// ci-run: node tools/mutant-gate.mjs node tests/personal-loot.mjs --mutate
//
// mutant-anchors: src/core/personal-loot.js src/data/party.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   PL-1  NO FLOOD (L1's rule): n heroes at a kill each rolling ch / n drop, in expectation, what the row drops for one; a guarantee stays
//         one a kill; luck multiplies, never past certainty
//   PL-2  PITY KEEPS THE STATED RATE (04 guard 5): over many seeded heroes, the mean rolls to a find is 1 / p within 2%, at two rates
//   PL-3  PITY NARROWS THE SPREAD (L2's pass): the 90th percentile of rolls to a find is under 2x the mean
//   PL-4  THE LEVERS are the integral's: basePm is the mean of exp(-x - grow x^2 / 2) (to a permille), growPm keeps p90 / mean under 2
//   PL-5  BOTH PATHS: a hero's pity after a run of rolls is the same whether the rolls are settled in one window or many (it is per roll)
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

/* a seeded stream (mulberry32): the test's own dice, never Math.random */
function stream(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [L, party] = await Promise.all([imp('src/core/personal-loot.js'), imp('src/data/party.js')]);
  const P = party.PERSONAL_LOOT, out = [];
  /* PL-1 */
  for (const ch of [0.5, 0.08, 0.016]) for (const n of [1, 2, 3, 4]) {
    if (Math.abs(n * L.heroChance(ch, n, 0) - ch) > 1e-12) out.push('PL-1 ' + n + ' heroes at ' + ch + ' drop ' + n * L.heroChance(ch, n, 0) + ' a kill');
  }
  if (4 * L.heroChance(1, 4, 0) !== 1) out.push('PL-1 a guarantee is not one a kill in a party of four');
  if (Math.abs(L.heroChance(0.01, 1, 300) - 0.013) > 1e-12 || L.heroChance(0.9, 1, 600) !== 1 || L.heroChance(0, 4, 300) !== 0) out.push('PL-1 luck does not multiply under certainty');
  /* PL-2 and PL-3 */
  for (const p of [0.002, 0.0005]) {
    const rnd = stream(Math.round(1 / p)), rolls = [];
    for (let hero = 0; hero < 6000; hero++) {
      let missed = 0, k = 0;
      for (;;) { k++; const hit = rnd() < L.pityChance(p, missed); missed = L.pityAfter(missed, p, hit); if (hit) break; }
      rolls.push(k);
    }
    rolls.sort((x, y) => x - y);
    const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length, p90 = rolls[Math.floor(rolls.length * 0.9)];
    if (Math.abs(mean * p - 1) > 0.03) out.push('PL-2 at ' + p + ' the mean rolls to a find is ' + mean.toFixed(0) + ', want ' + (1 / p).toFixed(0));
    if (!(p90 / mean < 2)) out.push('PL-3 at ' + p + ' the 90th percentile is ' + (p90 / mean).toFixed(2) + 'x the mean');
  }
  /* PL-4 */
  const g = P.pityGrowPm / 1000;
  let M = 0;
  for (let x = 0, dx = 1e-4; x < 20; x += dx) M += Math.exp(-x - (g * x * x) / 2) * dx;
  if (Math.abs(M * 1000 - P.pityBasePm) > 1) out.push('PL-4 pityBasePm ' + P.pityBasePm + ' is not the integral ' + (M * 1000).toFixed(1));
  const x90 = g ? (-1 + Math.sqrt(1 + 2 * g * Math.log(10))) / g : Math.log(10);
  if (!(x90 / M < 2)) out.push('PL-4 growPm ' + P.pityGrowPm + ' leaves p90 at ' + (x90 / M).toFixed(2) + 'x the mean');
  /* PL-5 */
  const seq = [false, false, true, false, false, false, true, false];
  const one = seq.reduce((m, hit) => L.pityAfter(m, 0.001, hit), 0);
  const parts = [seq.slice(0, 3), seq.slice(3, 5), seq.slice(5)].reduce((m, w) => w.reduce((mm, hit) => L.pityAfter(mm, 0.001, hit), m), 0);
  /* (lane/designer-pity) x in pityUnit parts: one miss at 0.001 adds 0.001 x basePm / 1000 of a find */
  if (one !== parts || one !== Math.round((0.001 * P.pityBasePm / 1000) * P.pityUnit)) out.push('PL-5 pity after the same rolls in one window and three is ' + one + ' / ' + parts);
  if (L.pityAfter(5000, 0.01, true) !== 0) out.push('PL-5 a find did not reset the pity');
  return out;
}

const MUTANTS = [
  ['each hero rolls the whole row', 'src/core/personal-loot.js', 'return Math.min(1, (c / k) * ((1000 + l) / 1000));', 'return Math.min(1, c * ((1000 + l) / 1000));'],
  ['luck is ignored', 'src/core/personal-loot.js', 'return Math.min(1, (c / k) * ((1000 + l) / 1000));', 'return Math.min(1, c / k);'],
  ['pity never grows', 'src/core/personal-loot.js', 'return Math.min(1, p0 * (1 + (P.pityGrowPm / 1000) * x));', 'return Math.min(1, p0);'],
  ['pity at the stated chance (a rate above the stated one)', 'src/core/personal-loot.js', 'const p0 = (pr * P.pityBasePm) / 1000, x', 'const p0 = pr, x'],
  ['a find keeps the pity', 'src/core/personal-loot.js', '  if (hit) return 0;\n', ''],
  ['the base share off the integral', 'src/data/party.js', '  pityBasePm: 438,', '  pityBasePm: 500,'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/personal-loot.mjs', pure, mutants: MUTANTS,
  green: 'no flood (ch / n), luck under certainty, pity at the stated rate with p90 under 2x, both paths' });
