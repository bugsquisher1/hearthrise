#!/usr/bin/env node
// tools/balance-program/redesign/roads/v0.mjs — THE TOWNS' V0, read off the run files (lane/roads-borrow-values, 2026-11-23).
//   node tools/balance-program/redesign/roads/v0.mjs > tools/balance-program/redesign/roads/v0-values.txt
// 17 section 3 / 18 section 3: V0 is what a move adds at full power to a four that lacks it, in held steps; an offense move's is its pace
// gain / PAY.payStepXp (src/data/danger.js: a step held is that much more pay). V0 = max(0, held, pace steps), one decimal, as the table
// keeps it. Each figure is the paired delta (seed s against the base's seed s) mean +- its standard error. Reads v0.json and v0rules.json
// (roads-run.mjs plans v0 and v0rules). Exit 0 · 2 a file missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const { PAY } = await import(pathToFileURL(join(ROOT, 'src/data/danger.js')).href);
const files = ['v0', 'v0rules'].map((p) => join(HERE, p + '.json'));
if (files.some((f) => !existsSync(f))) { console.error('v0: run roads-run.mjs --plan v0 and --plan v0rules first'); process.exit(2); }
const r1 = (x) => Math.round(x * 10) / 10;
const pm = (s, d = 1) => (s && s.mean !== null ? r1(s.mean) + ' +- ' + (s.se === null ? '?' : r1(s.se)) : 'n/a');
console.log('V0 of each town move: Muster Barrows L60 Steady, held start, 8 seeds x 8 h, the engine\'s own borrow (heroSetup `borrowed`);');
console.log('pace steps = XP % / ' + r1(PAY.payStepXp * 100) + '% (PAY.payStepXp). V0 = max(0, held, pace).');
console.log('move | plan:cell | borrower in base | casts/h | held vs base | XP/hero-h vs base | pace steps | V0');
for (const f of files) {
  const R = JSON.parse(readFileSync(f, 'utf8'));
  for (const o of Object.values(R.cells)) {
    if (!o.vsBase) continue;
    const B = R.cells[o.base], seat = o.seats.find((s) => s.lent);
    const xpPct = { mean: (100 * o.vsBase.xpPerHeroH.mean) / B.xpPerHeroH.mean, se: (100 * o.vsBase.xpPerHeroH.se) / B.xpPerHeroH.mean };
    const pace = xpPct.mean / (PAY.payStepXp * 100);
    const v0 = Math.max(0, o.vsBase.held.mean, pace);
    console.log([o.borrows[0][1], R.plan + ':' + o.id, seat.style + ' in ' + o.base + (o.unlockRaised ? ' (unlock held at ' + Object.values(o.unlockRaised).join(', ') + ')' : ''), pm(seat.lentCastsPerH, 0),
      pm(o.vsBase.held), r1(xpPct.mean) + '% +- ' + r1(xpPct.se), r1(pace), r1(v0)].join(' | '));
  }
}
