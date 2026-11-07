#!/usr/bin/env node
// tests/balance-grade.mjs — THE BALANCE GRADER BITES (lane/b-ground-grader, Tyler 2026-11-07: one formula for every hunt, tested
// extensively). tools/balance-sim/grade.mjs grades played cells against the target sheet; this proves, with no engine run, that:
//   good-set      a synthetic grid on target (Normal safe and paying in range, five under losing gold, a four 20% over solo, each
//                 harder tier paying more) has no binding FAIL, and `grade.mjs --in` exits 0 on it
//   mutants       each rule family FAILS the cell that breaks it: Normal deaths and dips (on their 95% interval), the low point, the
//                 +25% profit, five-under in profit, a four far over solo, a harder tier that pays less; `--in` exits 1 on one
//   rare-events   a death rate is FAIL only past its interval: 1 death in 2,000 h on Normal is not proof of more than 1 per 1,000 h
//                 (UNPROVEN at most), 12 in 2,000 h is
//   levels        the grid's Levels: deduped, never under 1, floor+10 past the band's top reads `above`
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gradeCells, synthSet, levelsOf, ranked } from '../tools/balance-sim/grade.mjs';
import { SHEET } from '../tools/balance-sim/grade-sheet.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADER = join(ROOT, 'tools/balance-sim/grade.mjs');
const flat = () => 70000;
const fails = [];
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fails.push(what); };
const failsOf = (cells) => gradeCells(cells, SHEET, flat).verdicts.filter((v) => v.verdict === 'FAIL');
const cli = (cells) => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-'));
  try {
    writeFileSync(join(dir, 'cells.jsonl'), cells.map((c) => JSON.stringify(c)).join('\n') + '\n');
    return spawnSync(process.execPath, [GRADER, '--in', dir], { encoding: 'utf8' }).status;
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

console.log('balance-grade:');
const good = failsOf(synthSet());
check(good.length === 0, 'good-set: no binding FAIL' + (good.length ? ' (' + good.map((v) => v.rule + ' ' + v.key).join('; ') + ')' : ''));
check(cli(synthSet()) === 0, 'good-set: grade.mjs --in exits 0');
for (const [mut, rule] of [['deaths', 'normal-deaths'], ['dips', 'normal-dips'], ['profit', 'normal-profit'], ['under5', 'under5-loses'],
  ['four', 'four-xp'], ['tier', 'tier-pays-more'], ['lowpoint', 'normal-low-point']]) {
  check(failsOf(synthSet({ [mut]: true })).some((v) => v.rule === rule), 'mutants: ' + mut + ' FAILS ' + rule);
}
check(cli(synthSet({ profit: true })) === 1, 'mutants: grade.mjs --in exits 1 on the +25% mutant');

/* rare events: one Normal floor cell of 2,000 h holds the whole pooled group's hours (synthSet's floor solo is one cell) */
const withDeaths = (k) => { const cells = synthSet(); const c = cells.find((x) => x.cell.grade.tier === 'normal' && x.cell.grade.offset === 'floor' && x.cell.grade.size === 1); c.heroes[0].deaths = k; return cells; };
const verdictOf = (k) => (gradeCells(withDeaths(k), SHEET, flat).verdicts.find((v) => v.rule === 'normal-deaths' && v.key.includes('/ floor / size 1')) || {}).verdict;
check(verdictOf(1) !== 'FAIL', 'rare-events: 1 death in 2,000 h is ' + verdictOf(1) + ', not FAIL');
check(verdictOf(12) === 'FAIL', 'rare-events: 12 deaths in 2,000 h is FAIL');
check(ranked(gradeCells(withDeaths(12), SHEET, flat).verdicts)[0].verdict === 'FAIL', 'rare-events: a FAIL ranks first');

const L = levelsOf([5, 15], ['under5', 'under3', 'under2', 'floor', 'plus10', 'top']);
check(JSON.stringify(L) === JSON.stringify([{ offset: 'under3', level: 2 }, { offset: 'under2', level: 3 }, { offset: 'floor', level: 5 }, { offset: 'plus10', level: 15 }]),
  'levels: band 5-15 plays 2, 3, 5, 15 (no Level 0, floor+10 is the top) ' + JSON.stringify(L));
check(levelsOf([1, 5], ['floor', 'plus10']).some((x) => x.offset === 'above' && x.level === 11), 'levels: floor+10 past the top reads above');

if (fails.length) { console.error('balance-grade: ' + fails.length + ' FAILED'); process.exit(1); }
console.log('balance-grade: all checks pass');
