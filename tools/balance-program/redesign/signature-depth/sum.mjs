#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/sum.mjs — THE SAMPLE'S READING from run.sh's reports (systems, lane/signatures-sample, 2026-11-26).
//
//   node tools/balance-program/redesign/signature-depth/sum.mjs
//
// For each Signature: its four with none against the same four wearing it, on the same seeds. The held step's paired delta (mean and its
// standard error over the seeds), and Level XP, coin and kills a hero-hour as a share of the plain four's. Prints one markdown table.
// Exit 0 printed · 2 a report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIRS = [
  ['Cairn Belt (tank)', 'Muster Barrows', 'muster-tank', 'muster-cairn-belt'],
  ['Barrow Knight\'s Blade (sword)', 'Muster Barrows', 'muster-sword', 'muster-blade'],
  ['Lurcher\'s Collar (bow)', 'Pyre Field', 'pyre-mixed', 'pyre-collar'],
  ['The Wood Book (mage)', 'Muster Barrows', 'muster-mixed', 'muster-wood-book'],
  ['Brewer\'s Apron (healer)', 'Muster Barrows', 'muster-mixed', 'muster-apron'],
];
const cellOf = (name) => {
  const f = join(HERE, name + '.json');
  if (!existsSync(f)) { console.error('sum: no report ' + f); process.exit(2); }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return Object.values(r.cells)[0];
};
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
console.log('| Signature | Ground | Plain held | With it | Held delta (se) | Level XP/h | Coin/h | Kills/h | Deaths |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [name, ground, a, b] of PAIRS) {
  const p = cellOf(a), s = cellOf(b);
  const d = p.held.perSeed.map((x, i) => s.held.perSeed[i] - x);
  const m = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, d.length - 1));
  console.log('| ' + [name, ground, p.held.mean.toFixed(1), s.held.mean.toFixed(1), sgn(m) + ' (' + (sd / Math.sqrt(d.length)).toFixed(1) + ')',
    pct(s.xpPerHeroH, p.xpPerHeroH), pct(s.gold.coinPerHeroH.mean, p.gold.coinPerHeroH.mean), pct(s.killsPerH, p.killsPerH), p.deaths + ' / ' + s.deaths].join(' | ') + ' |');
}
