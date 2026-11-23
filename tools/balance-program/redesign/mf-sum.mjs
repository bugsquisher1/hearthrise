#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/mf-sum.mjs — THE MONSTER FORMULA AGAINST TODAY'S MONSTERS, ONE TABLE (lane/monster-formula).
//
//   node tools/balance-program/redesign/mf-sum.mjs [dir]      (default tools/balance-program/redesign/mf)
//
// Reads mf-run.mjs's reports (<ground>-<c0|mf>-<low|mid|lineup>.json) and prints, cell by cell, today's monsters (C0) beside the formula
// (mf) on the same dice, against 12-targets.md's C-targets:
//   held      the time-weighted step while all four hunt, from the settle hour (C-1, C-2; the band: floor / ref / top)
//   deaths/d  deaths a party-day of 10 hunted hours (C-3: 0 on Careful and Steady; C-4: Bold 0.3 to 1.5, no wipes)
//   kills/h   the four's kills an hour; kit  the store bill over the income (the econ band 0.2 to 0.3); front  the front seat's share
//   pay       Level XP a hunted hero-hour from the held start, over the hours table (C-5: Careful 0.55 to 0.70 of Steady)
// and per lineup on Steady the held step (04 section 6: a mix every lineup holds equally deep asks no question).
// Exit 0 printed · 2 no reports.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = resolve(ROOT, process.argv[2] || 'tools/balance-program/redesign/mf');
if (!existsSync(DIR)) { console.error('mf-sum: no ' + DIR); process.exit(2); }
const files = readdirSync(DIR).filter((f) => /^(muster|hasks|wing)-(c0|mf)-.+\.json$/.test(f)).sort();
if (!files.length) { console.error('mf-sum: no reports in ' + DIR); process.exit(2); }
const read = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : String(Math.round(x * 100) / 100));
const line = (c, hours) => {
  const g = c.gold || {}, inc = g.incomePerHeroH && g.incomePerHeroH.mean;
  const days = (c.seedsRead * (c.huntedH || hours)) / 10;
  return { held: c.held.mean, sd: c.held.sd, perDay: days ? c.deaths / days : null, wipes: c.wipes, kills: c.killsPerH, kit: inc ? g.storePerHeroH.mean / inc : null,
    front: c.takenShare && c.takenShare[0] ? c.takenShare[0].mean : null, pay: c.payX.mean, coin: g.coinPerHeroH ? g.coinPerHeroH.mean : null };
};
const groups = {};
for (const f of files) {
  const [, ground, who, rest] = f.match(/^([a-z]+)-(c0|mf)-(.+)\.json$/);
  const r = read(f);
  for (const [id, c] of Object.entries(r.cells)) {
    const key = ground + ' ' + rest + ' ' + id.replace(/^base:|^high:/, (m) => (m === 'high:' ? 'L' + c.L + ' ' : 'L' + c.L + ' '));
    (groups[key] || (groups[key] = {}))[who] = line(c, r.hours);
  }
}
console.log('cell                                  | C0: held  dth/d  kills  kit   front pay   coin | MF: held  dth/d  kills  kit   front pay   coin');
for (const [k, v] of Object.entries(groups)) {
  const f = (x) => (x ? String(x.held).padStart(6) + ' ' + r2(x.perDay).padStart(5) + (x.wipes ? 'w' + x.wipes : '  ') + String(x.kills).padStart(5) + '  ' + r2(x.kit).padStart(4) + '  ' + r2(x.front).padStart(4) + '  ' + r2(x.pay).padStart(4) + String(x.coin).padStart(7) : ''.padEnd(47));
  console.log(k.padEnd(38) + '| ' + f(v.c0) + ' | ' + f(v.mf));
}
