#!/usr/bin/env node
// tools/balance-sim/sheet-board.mjs — THE BOARD'S TABLE: every ground x tier, the formula's rows (F) against the sheet, one line
// each, from the same runs sheet-check.mjs grades (lane/b-ground-formula). Every value is gradeGround's; nothing is computed here.
//
//   node tools/balance-sim/sheet-board.mjs --in DIR[,DIR2...]
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeGround, load, SHAPE } from './sheet-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const folders = arg('in', join(HERE, 'out', 'formula')).split(',').map((d) => load(resolve(d)));
const cells = folders.flatMap((cs, i) => cs.filter((c) => !folders.slice(i + 1).some((later) => later.some((x) => x.cell.x[0] === c.cell.x[0] && x.ground === c.ground))));
const mark = (l) => (l ? l.value + (l.pass === false ? ' **off**' : '') : '-');
console.log('| Ground (floor) | Normal: deaths, dips / 12 h, typical low, worst margin, bill share | XP at the middle / the four a head | Dangerous at the floor | Deadly at the floor (alone; the four) | Under the weight class (Dangerous pairs; Deadly pairs) | Lines on the sheet |');
console.log('|---|---|---|---|---|---|---|');
for (const g of Object.keys(SHAPE)) {
  const L = gradeGround(cells, g, 'F').lines;
  if (!L.length) continue;
  const by = (id) => L.find((x) => x.id === id);
  const on = L.filter((x) => x.pass === true).length, off = L.filter((x) => x.pass === false).length;
  const normal = ['normal.deaths', 'normal.close', 'normal.typical', 'normal.margin', 'normal.supplies'].map((id) => mark(by(id))).join('; ');
  console.log('| ' + g + ' (' + SHAPE[g].floor + ') | ' + normal + ' | ' + mark(by('normal.xp')) + ' / ' + mark(by('party.four')) + ' | ' + mark(by('dangerous.lone'))
    + ' | ' + mark(by('deadly.lone')) + '; ' + mark(by('deadly.four')) + ' | ' + mark(by('weight.dangerous')) + '; ' + mark(by('weight.deadly')) + ' | ' + on + ' on, ' + off + ' off |');
}
