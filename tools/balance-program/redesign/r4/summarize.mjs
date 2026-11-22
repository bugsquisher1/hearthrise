#!/usr/bin/env node
// tools/balance-program/redesign/r4/summarize.mjs — lane/r4's reading of its v1-climb reports (2026-11-22). No engine run: arithmetic on
// the kept JSON beside it.
//   THE POWER STEP: for each Level, C0 and the hero-power/step candidate, the held step's move when the weapon, the armor, or both (their
//   sum: one gear tier) go one band back, paired seed by seed; and the step's OWN move (candidate minus C0 on the same seeds).
//   THE STANCE PAY: the held-start report's pay multiples.
//   node tools/balance-program/redesign/r4/summarize.mjs        Exit 0 printed · 2 a report missing
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => (existsSync(join(HERE, f)) ? JSON.parse(readFileSync(join(HERE, f), 'utf8')) : null);
const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
const se = (x) => (x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mean(x)) ** 2, 0) / (x.length - 1) / x.length) : 0);
const fmt = (x) => (x.length ? (Math.round(mean(x) * 10) / 10) + ' +- ' + (Math.round(se(x) * 10) / 10) : 'n/a');
const per = (r, id) => r.cells[id].held.perSeed;
/* paired move a - base for each seed; tier = weapon + armor moves on the same seed */
const moves = (r) => {
  const b = per(r, 'base:steady'), w = per(r, 'weapon:steady'), a = per(r, 'armor:steady');
  const ok = (i) => [b[i], w[i], a[i]].every((x) => x !== null && x !== undefined);
  const idx = b.map((_, i) => i).filter(ok);
  return { base: idx.map((i) => b[i]), weapon: idx.map((i) => w[i] - b[i]), armor: idx.map((i) => a[i] - b[i]), tier: idx.map((i) => w[i] + a[i] - 2 * b[i]), idx };
};
let missing = 0;
console.log('THE POWER STEP (Steady mixed MID four, Muster Barrows, held step from hour 4 of 8; moves in steps, mean +- se over paired seeds)');
console.log('Level  cand    n  base held        weapon back     armor back      tier back (sum)   step\'s own tier move (cand - C0)');
for (const L of [20, 60, 110, 185, 400]) {
  const c0 = read('power-C0-L' + L + '.json'), st = read('power-hero-power-step-L' + L + '.json');
  if (!c0 || !st) { missing++; console.log(String(L).padEnd(7) + 'missing'); continue; }
  const m0 = moves(c0), m1 = moves(st);
  const both = m0.idx.filter((i) => m1.idx.includes(i));
  const own = both.map((i) => m1.tier[m1.idx.indexOf(i)] - m0.tier[m0.idx.indexOf(i)]);
  /* THE OFFSET: the step adds weightGear x item Level steps of power at base (offense from the weapon, defense from the armor); the
     candidate's base held minus C0's, paired, over that prediction (r4/item-levels.mjs: the seats' mean item Level) */
  const IL = { 20: 15, 60: 60, 110: 84, 185: 98, 400: 88 }[L];
  const off = both.map((i) => m1.base[m1.idx.indexOf(i)] - m0.base[m0.idx.indexOf(i)]);
  console.log(String(L).padEnd(7) + 'offset at base: +' + fmt(off) + ' steps for ' + IL + ' item Levels (weightGear 1.0): ' + Math.round((100 * mean(off)) / IL) + '% of the step\'s power shows as held depth');
  for (const [name, m] of [['C0', m0], ['step', m1]]) console.log(String(L).padEnd(7) + name.padEnd(6) + String(m.idx.length).padStart(3) + '  ' + fmt(m.base).padEnd(16) + fmt(m.weapon).padEnd(16) + fmt(m.armor).padEnd(16) + fmt(m.tier).padEnd(18) + (name === 'step' ? fmt(own) : ''));
}
const s = read('stance-held-L60.json');
if (!s) missing++;
else {
  console.log('\nSTANCE PAY FROM A HELD START (start = held - ' + 20 + ', pay read from hour ' + Object.values(s.cells)[0].payX.fromH + ' to the four\'s end; multiple of the hours table)');
  for (const [id, c] of Object.entries(s.cells)) console.log('  ' + id.padEnd(16) + ' L' + c.L + '  start ' + c.start + '  held ' + c.held.mean + '  pay ' + c.payX.mean + 'x +- ' + c.payX.sd + ' sd  n ' + c.payX.n + '  window ' + c.payX.windowH + ' h  deaths ' + c.deaths);
}
process.exit(missing ? 2 : 0);
