#!/usr/bin/env node
// tools/balance-program/redesign/r9/summarize.mjs — lane/r9-power-step's reading of its v1-climb reports (2026-11-22). No engine run:
// arithmetic on the kept JSON beside it (each written by tools/balance-program/redesign/v1-climb.mjs on the engine, the commands below).
//   THE POWER STEP'S OWN TIER: the tree (base:steady) against the candidates power-tier-back / power-tier-ahead (Muster's gearLv one tier
//     up / down: every hero one tier of power steps weaker / stronger, the kits and dice identical), paired seed by seed.
//   ONE GEAR TIER IN PLAY: the tree's weapon and armor cells (each one gear band back: the shipped stats AND the step), paired.
//   THE STANCE PAY: the held-start report's pay multiples, and Careful over Steady seed by seed.
//   node tools/balance-program/redesign/r9/summarize.mjs        Exit 0 printed · 2 a report missing
// The runs (from the worktree root):
//   v1-climb.mjs --only base:steady,weapon:steady,armor:steady --seeds 12 --hours 12 --settle 6 --json r9/tier-L60.json
//   v1-climb.mjs --candidate tools/balance-program/candidates/power-tier-back.json  --only base:steady --seeds 12 --hours 12 --settle 6 --json r9/own-back-L60.json
//   v1-climb.mjs --candidate tools/balance-program/candidates/power-tier-ahead.json --only base:steady --seeds 12 --hours 12 --settle 6 --json r9/own-ahead-L60.json
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
const tier = read('tier-L60.json'), back = read('own-back-L60.json'), ahead = read('own-ahead-L60.json'), held = read('stance-held-L60.json');
console.log('THE POWER STEP AT LEVEL 60, Muster Barrows, the Steady mixed four (MID kits), held step from hour 6 of 12, paired seeds');
if (tier) console.log('  base held                         ' + fmt(tier.cells['base:steady'].held.perSeed.filter(Number.isFinite)));
if (tier && back) console.log('  own tier back (power-tier-back)   ' + fmt(paired(tier, 'base:steady', back, 'base:steady')));
else missing++;
if (tier && ahead) console.log('  own tier ahead (power-tier-ahead) ' + fmt(paired(tier, 'base:steady', ahead, 'base:steady')));
else missing++;
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
