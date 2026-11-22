#!/usr/bin/env node
// tools/balance-program/redesign/r9b/summarize.mjs — lane/r9b-heal-step's reading (heals stepped by the healer's gear; the r9 reader, its tier candidates only) of its v1-climb reports (2026-11-22). No engine run:
// arithmetic on the kept JSON beside it (each written by tools/balance-program/redesign/v1-climb.mjs on the engine, the commands below).
//   THE POWER STEP'S OWN TIER: the tree (base:steady) against candidates that move every hero one tier of the gear table's steps
//     (src/core/gear-steps.js, the stand-in for lane/g-gear-steps: tierStepsOf(1) on every slot), the kits and dice identical, paired seed
//     by seed: power-tier-back / -ahead (Muster's baseTier one up / down: both halves), power-offense-back and power-defense-back (one half),
//     power-tier-back-under-cap (both halves, the defense half played under the armor chain's 60% cap): what share of the tier shows.
//   ONE GEAR BAND IN PLAY: the tree's weapon and armor cells (each one MID-kit band back: the shipped stats AND the step), paired.
//   THE STANCE PAY: the held-start report's pay multiples, and Careful over Steady seed by seed.
//   node tools/balance-program/redesign/r9/summarize.mjs        Exit 0 printed · 2 a report missing
// The runs (from the worktree root; V = node tools/balance-program/redesign/v1-climb.mjs --seeds 12 --hours 12 --settle 6):
//   V --only base:steady,weapon:steady,armor:steady --json r9/tier-L60.json
//   V --candidate tools/balance-program/candidates/<id>.json --only base:steady --json r9/<id>-L60.json   (each candidate above)
//   v1-climb.mjs --only base,levels,high --seeds 6 --hours 8 --settle 1 --pay-from 1 --start-from tools/balance-program/redesign/r4/climb-L60.json --margin 20 --json r9/stance-held-L60.json
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => (existsSync(join(HERE, f)) ? JSON.parse(readFileSync(join(HERE, f), 'utf8')) : null);
const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
const se = (x) => (x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mean(x)) ** 2, 0) / (x.length - 1) / x.length) : 0);
const median = (x) => { const s = x.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const r1 = (x) => Math.round(x * 10) / 10;
const fmt = (x) => (x.length ? r1(mean(x)) + ' +- ' + r1(se(x)) + ' se, median ' + r1(median(x)) + ', n ' + x.length : 'n/a');
const paired = (a, ca, b, cb) => {
  const A = a.cells[ca].held.perSeed, B = b.cells[cb].held.perSeed;
  return A.map((x, i) => (Number.isFinite(x) && Number.isFinite(B[i]) ? B[i] - x : null)).filter((x) => x !== null);
};
let missing = 0;
const tier = read('tier-L60.json'), held = read('stance-held-L60.json');
const ONE = 20; /* tierStepsOf(1) in the stand-in (src/core/gear-steps.js) */
console.log('THE POWER STEP AT LEVEL 60, Muster Barrows, the Steady mixed four (MID kits), held step from hour 6 of 12, paired seeds; one tier = ' + ONE + ' steps of power');
if (tier) console.log('  base held                                    ' + fmt(tier.cells['base:steady'].held.perSeed.filter(Number.isFinite)));
for (const [id, what] of [['power-tier-back', 'one tier back, both halves'], ['power-tier-ahead', 'one tier ahead, both halves'], 
]) {
  const c = read(id + '-L60.json');
  if (!tier || !c) { missing++; console.log('  ' + what.padEnd(44) + ' missing'); continue; }
  const d = paired(tier, 'base:steady', c, 'base:steady');
  console.log('  ' + what.padEnd(44) + ' ' + fmt(d) + '   shows ' + Math.round((100 * Math.abs(mean(d))) / ONE) + '% of ' + ONE);
}
if (tier) {
  const w = paired(tier, 'base:steady', tier, 'weapon:steady'), a = paired(tier, 'base:steady', tier, 'armor:steady');
  console.log('  weapon band back (shipped + step) ' + fmt(w));
  console.log('  armor band back (shipped + step)  ' + fmt(a));
  console.log('  one gear band back, both halves   ' + r1(mean(w) + mean(a)) + ' (sum of the two cells\' means)');
} else missing++;
if (held) {
  console.log('\nSTANCE PAY FROM A HELD START (start = R4\'s held - 20, pay read from hour 1 to the four\'s end; multiple of the hours table)');
  for (const v of ['base', 'levels', 'high']) {
    const c = (k) => held.cells[v + ':' + k];
    if (!c('careful') || !c('steady')) continue;
    const pay = (k) => c(k).payX.perSeed;
    for (const k of ['careful', 'steady', 'bold']) if (c(k)) console.log('  ' + (v + ':' + k).padEnd(16) + ' L' + c(k).L + '  held ' + r1(c(k).held.mean) + '  pay ' + c(k).payX.mean + 'x (sd ' + c(k).payX.sd + ', ' + c(k).payX.windowH + ' h)  deaths ' + c(k).deaths);
    const ratio = pay('careful').map((x, i) => (Number.isFinite(x) && Number.isFinite(pay('steady')[i]) ? x / pay('steady')[i] : null)).filter((x) => x !== null);
    console.log('  ' + (v + ': Careful / Steady').padEnd(25) + (Math.round(mean(ratio) * 100) / 100) + 'x  (seeds ' + ratio.map((x) => x.toFixed(2)).join(' ') + '; band 0.55 to 0.70)');
  }
} else missing++;
process.exit(missing ? 2 : 0);
