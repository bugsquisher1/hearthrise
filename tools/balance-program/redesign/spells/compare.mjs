#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/spells/compare.mjs — TWO spell-run.mjs REPORTS, SEED BY SEED (lane/moves-pass-1, 2026-11-22).
//
//   node tools/balance-program/redesign/spells/compare.mjs before.json after.json [afterCell=beforeCell ...]
//
// A code change is measured as two runs of one plan on the same seeds (seed s is the same dice in both: spell-run.mjs seedBase), the
// first on the tree before it, the second after. Each cell of `after` is paired with the cell of the same id in `before` (or the one a
// `afterCell=beforeCell` argument names), and every read is reported as the mean +- se of the per-seed differences. Exit 0 ran · 2 usage.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const [bf, af, ...maps] = process.argv.slice(2);
if (!bf || !af) { console.error('usage: compare.mjs before.json after.json [afterCell=beforeCell ...]'); process.exit(2); }
const B = JSON.parse(readFileSync(bf, 'utf8')), A = JSON.parse(readFileSync(af, 'utf8'));
const pairOf = Object.fromEntries(maps.map((m) => m.split('=')));
const KEYS = ['held', 'deaths', 'xpPerHeroH', 'killsPerH', 'incomePerHeroH', 'storePerHeroH', 'drinksPerH', 'takenPerH'];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const se = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length) : 0; };
const r1 = (x) => Math.round(x * 10) / 10;
console.log('after ' + af + ' against before ' + bf + ' (paired seeds; mean +- se of the differences)');
for (const [id, a] of Object.entries(A.cells)) {
  const b = B.cells[pairOf[id] || id];
  if (!b) continue;
  const parts = [];
  for (const k of KEYS) {
    const d = a.perSeed[k].map((x, i) => (x !== null && b.perSeed[k][i] !== null ? x - b.perSeed[k][i] : null)).filter((x) => x !== null);
    if (!d.length) continue;
    const pct = k === 'xpPerHeroH' || k === 'incomePerHeroH' ? ' (' + r1((mean(d) / b[k].mean) * 100) + '%)' : '';
    parts.push(k + ' ' + r1(mean(d)) + ' +- ' + r1(se(d)) + pct);
  }
  console.log((id + ' vs ' + (pairOf[id] || id)).padEnd(40) + ' held ' + a.held.mean + ' (was ' + b.held.mean + ')  deaths ' + a.deaths.mean + '  xp ' + Math.round(a.xpPerHeroH.mean) + '  gold ' + Math.round(a.incomePerHeroH.mean));
  console.log('    ' + parts.join(' · '));
}
