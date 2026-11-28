#!/usr/bin/env node
// tools/balance-program/redesign/roads/e5/sum.mjs — THE READINGS of run.sh's reports (systems, lane/e5-borrowing, 2026-11-27; 19 L6 and V4,
// 17 section 3, 20-v030-the-roads.md E5: "Borrowed Greater Mend is 10 steps or less").
//
//   node tools/balance-program/redesign/roads/e5/sum.mjs
//
// For each borrow: the four with nothing borrowed against the same four with the move borrowed, on the same seeds. Read on the two scales
// a borrow's value is read on (src/data/talents.js BORROW_VALUES: "V0 = max(0, held, pace)"): the held step's paired delta, and PACE STEPS,
// the paired delta of the held pace (v1-climb payX, hour 4 on, %) over PACE_STEP_PCT, the pace one held step buys on the reference cells
// (signature-depth/sum.mjs, the designer's 11-27 scale). Each mean with its standard error over the seeds. VALUE = the larger of the two,
// never under 0, so a borrow is sized on whichever way it pays. The borrower's casts of the move an hour say it fired.
// Prints markdown. Exit 0 printed · 2 a report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* (signature-depth/sum.mjs PACE_STEP_PCT: the ten defensive anchors' fit, 0.4335, se 0.0087) */
const PACE_STEP_PCT = 0.43;
/* [label, plain report, borrowed report, borrower seat, move] */
const PAIRS = [
  ['Greater Mend on the hammer, a second healer (M, 19 V4)', 'm-plain', 'm-gm', 0, 'greater_mend'],
  ['Greater Mend on the sword, no healer (N, 17\'s V0 cell)', 'n-plain', 'n-gm', 3, 'greater_mend'],
  ['Circle of Renewal on the sword, no healer (N)', 'n-plain', 'n-cr', 3, 'circle_of_renewal'],
  ['Greater Mend on the sword at -50% (N)', 'n-plain', 'n-gm-500', 3, 'greater_mend'],
  ['Greater Mend on the sword at -30% (N)', 'n-plain', 'n-gm-300', 3, 'greater_mend'],
];
const cellOf = (name) => {
  const f = join(HERE, name + '.json');
  if (!existsSync(f)) return null;
  return Object.values(JSON.parse(readFileSync(f, 'utf8')).cells)[0];
};
const stats = (d) => {
  if (!d.length) return null;
  const m = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, d.length - 1));
  return { m, se: sd / Math.sqrt(d.length), n: d.length };
};
const zip = (a, b, f) => { const d = []; a.forEach((x, i) => { const y = b[i]; if (Number.isFinite(x) && Number.isFinite(y) && f(x, y) !== null) d.push(f(x, y)); }); return d; };
const heldOf = (p, s) => stats(zip(p.held.perSeed, s.held.perSeed, (x, y) => y - x));
const paceOf = (p, s) => (p.payX.perSeed.length !== p.seedsRead || s.payX.perSeed.length !== s.seedsRead ? null
  : stats(zip(p.payX.perSeed, s.payX.perSeed, (x, y) => (x > 0 && y > 0 ? ((y / x - 1) * 100) / PACE_STEP_PCT : null))));
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
const show = (d) => (d ? sgn(d.m) + ' (' + d.se.toFixed(1) + ', ' + d.n + ')' : 'no hold');
const pct = (a, b) => (b > 0 ? sgn((a / b - 1) * 100) + '%' : 'n/a');

let missing = 0;
console.log('| Borrow | Plain held | Held delta (se, seeds) | Pace steps (se, seeds) | Value | Casts/h | Mend casts/h (plain, borrowed) | Heal out/h | Level XP/h | Store/h | Deaths |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [label, a, b, seat, move] of PAIRS) {
  const p = cellOf(a), s = cellOf(b);
  if (!p || !s) { missing++; console.log('| ' + label + ' | owed |||||||||| '); continue; }
  const h = heldOf(p, s), q = paceOf(p, s);
  const value = Math.max(0, h ? h.m : 0, q ? q.m : 0);
  const casts = (c) => (c.seats[seat] && c.seats[seat].castsPerH) || {};
  console.log('| ' + [label, p.held.mean.toFixed(1), show(h), show(q), value.toFixed(1), casts(s)[move] || 0,
    (casts(p).mend || 0) + ', ' + (casts(s).mend || 0), Math.round((s.seats[seat] && s.seats[seat].healOutPerH) || 0),
    pct(s.xpPerHeroH, p.xpPerHeroH), pct(s.gold.storePerHeroH.mean, p.gold.storePerHeroH.mean), p.deaths + ' / ' + s.deaths].join(' | ') + ' |');
}
process.exit(missing === PAIRS.length ? 2 : 0);
