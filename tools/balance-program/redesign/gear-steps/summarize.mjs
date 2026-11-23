#!/usr/bin/env node
// tools/balance-program/redesign/gear-steps/summarize.mjs — read the lane's Lab runs (run.sh) back as C-2 and the families' bands.
//   node tools/balance-program/redesign/gear-steps/summarize.mjs
// Paired seeds: a candidate run's base cell against the plain run's base cell on the same seeds (v1-climb seedBase 1000 + s).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (n) => (existsSync(join(HERE, n + '.json')) ? JSON.parse(readFileSync(join(HERE, n + '.json'), 'utf8')) : null);
/* the whole-kit step runs live in view-0/ (the step's own move: GEAR_SCALE_STAT_PM does not reach it) */
const readKit = (n) => read(n) || read('view-0/' + n);
const r1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const paired = (A, B) => {
  if (!A || !B) return null;
  const d = A.held.perSeed.map((x, i) => (x !== null && B.held.perSeed[i] !== null && B.held.perSeed[i] !== undefined ? B.held.perSeed[i] - x : null)).filter((x) => x !== null);
  return d.length ? r1(mean(d)) + ' +- ' + r1(sd(d) / Math.sqrt(d.length)) + ' se (n ' + d.length + ')' : null;
};
const cell = (run, id) => (run && run.cells[id + ':steady']) || null;
const DEPTH = { muster_barrows: (710 - 480) / 20, hasks_ford: (710 - 470) / 20 };
const BAND = { muster_barrows: [480, 710], hasks_ford: [470, 710] };
const lines = [];
const B = read('before-muster-L60'), BK = read('before-muster-L60-kit-ahead');
if (B) lines.push('before this lane (set/v0.2.144), muster L60: base ' + r1(cell(B, 'base').held.mean) + ', shipped up ' + paired(cell(B, 'base'), cell(B, 'up')) + ', back ' + paired(cell(B, 'base'), cell(B, 'back')) + (BK ? ', whole kit ahead ' + paired(cell(B, 'base'), cell(BK, 'base')) : ''));
for (const [plain, ground] of [['muster-L60', 'muster_barrows'], ['hasks-L52', 'hasks_ford'], ['muster-L70', 'muster_barrows'], ['hasks-L45', 'hasks_ford']]) {
  const P = read(plain);
  if (!P) continue;
  const base = cell(P, 'base');
  lines.push(plain + ' (' + ground + ', one depth ' + r1(DEPTH[ground]) + ' steps): base held ' + r1(base.held.mean) + ' +- ' + r1(base.held.sd) + ', deaths ' + base.deaths);
  for (const v of ['up', 'back', 'weapon', 'armor']) if (cell(P, v)) lines.push('  shipped ' + v.padEnd(7) + ' ' + paired(base, cell(P, v)) + '   deaths ' + cell(P, v).deaths);
  for (const k of ['kit-ahead', 'kit-back']) { const C = readKit(plain + '-' + k); if (C) lines.push('  whole ' + k.padEnd(9) + ' ' + paired(base, cell(C, 'base')) + '   deaths ' + cell(C, 'base').deaths); }
}
lines.push('families (base held, Steady; the ground\'s band floor..top):');
for (const [run, ground] of [['muster-L60', 'muster_barrows'], ['muster-L60-swordtank', 'muster_barrows'], ['muster-L60-axes', 'muster_barrows'], ['muster-L60-sword', 'muster_barrows'],
  ['hasks-L52', 'hasks_ford'], ['hasks-L52-swordtank', 'hasks_ford'], ['hasks-L52-axes', 'hasks_ford']]) {
  const R = read(run);
  if (!R) continue;
  const b = cell(R, 'base');
  const [lo, hi] = BAND[ground];
  lines.push('  ' + run.padEnd(22) + '  held ' + r1(b.held.mean) + ' +- ' + r1(b.held.sd) + '  deaths ' + b.deaths + '  ' + (b.held.mean >= lo && b.held.mean <= hi && b.deaths === 0 ? 'in band' : 'OUT OF BAND'));
}
console.log(lines.join('\n'));
