#!/usr/bin/env node
// tools/balance-program/redesign/roads/summarize.mjs — the tables of 18-roads-review-measured.md, read off the run files (q1/q2/q3/q3f.json).
//   node tools/balance-program/redesign/roads/summarize.mjs > tools/balance-program/redesign/roads/summary.txt
// Every figure is mean +- standard error over the cell's seeds (paired deltas: seed s against the base's seed s). Exit 0 · 2 a file missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const runs = ['q1', 'q2', 'q3', 'q3f', 'time1h'].filter((p) => existsSync(join(HERE, p + '.json'))).map((p) => JSON.parse(readFileSync(join(HERE, p + '.json'), 'utf8')));
if (!runs.length) { console.error('summarize: no run files'); process.exit(2); }
const f = (s, d = 1) => (s && s.mean !== null ? (Math.round(s.mean * 10 ** d) / 10 ** d) + ' +- ' + (s.se === null ? '?' : Math.round(s.se * 10 ** d) / 10 ** d) : 'n/a');
const pct = (d, b) => (d && b && b.mean ? (Math.round((1000 * d.mean) / b.mean) / 10) + '%' : 'n/a');
for (const R of runs) {
  console.log('\n== ' + R.plan + ': ' + R.ground + ' L' + R.level + ' ' + R.risk + ', held start ' + R.start + ', ' + R.seeds + ' seeds x ' + R.hours + ' h, held from hour ' + R.settleFromH + ', wall ' + R.wallS + ' s on ' + R.workers + ' workers');
  console.log('cell | held | deaths (seeds) | XP/hero-h | gold/hero-h | store/hero-h | heal all/h | shield in/h | drinks/h | borrowed casts/h, mana/h, borrower heal out/h + self/h');
  for (const o of Object.values(R.cells)) {
    const lent = o.seats.find((s) => s.lent);
    console.log([o.id, f(o.held), o.deathsTotal + ' (' + o.seedsWithDeath + ')', f(o.xpPerHeroH, 0), f(o.incomePerHeroH, 0), f(o.storePerHeroH, 0), f(o.healAllPerH, 0), f(o.shieldInPerH, 0), f(o.drinksPerH, 0),
      lent ? lent.style + ': ' + f(lent.lentCastsPerH, 0) + ', ' + lent.lentManaPerH.mean + ', ' + lent.healOutPerH.mean + ' + ' + lent.selfHealPerH.mean : '-'].join(' | '));
    if (o.vsBase) {
      const B = R.cells[o.base];
      console.log('   vs ' + o.base + ': held ' + f(o.vsBase.held) + ' | XP ' + f(o.vsBase.xpPerHeroH, 0) + ' (' + pct(o.vsBase.xpPerHeroH, B.xpPerHeroH) + ') | gold ' + f(o.vsBase.incomePerHeroH, 0) + ' (' + pct(o.vsBase.incomePerHeroH, B.incomePerHeroH)
        + ') | store ' + f(o.vsBase.storePerHeroH, 0) + ' | heal ' + f(o.vsBase.healAllPerH, 0) + ' | shield ' + f(o.vsBase.shieldInPerH, 0) + ' | drinks ' + f(o.vsBase.drinksPerH, 0) + ' | deaths ' + f(o.vsBase.deaths, 2));
    }
  }
}
/* Q5: how steady each metric is seed to seed (coefficient of variation), and the seeds a cached table needs for +-5% at 95% */
console.log('\n== Q5: seed-to-seed spread of each metric on the base cells (cv = sd / mean), and seeds for a +-5% (95%) mean: n = (1.96 cv / 0.05)^2');
for (const R of runs) for (const o of Object.values(R.cells)) {
  if (o.borrows.length) continue;
  const parts = ['held', 'xpPerHeroH', 'incomePerHeroH', 'storePerHeroH', 'healAllPerH', 'drinksPerH', 'killsPerH'].map((k) => {
    const s = o[k]; if (!s || !s.mean) return k + ' n/a';
    const cv = s.sd / Math.abs(s.mean);
    return k + ' cv ' + (Math.round(cv * 1000) / 10) + '% -> ' + Math.max(1, Math.ceil(((1.96 * cv) / 0.05) ** 2)) + ' seeds';
  });
  console.log(R.plan + ' ' + o.id + ' (' + R.hours + ' h, seed ' + Math.round(o.seedMsMean / 1000) + ' s): ' + parts.join('; ') + '; deaths ' + o.deathsTotal + ' in ' + R.seeds + ' seeds');
}
