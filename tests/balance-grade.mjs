#!/usr/bin/env node
// tests/balance-grade.mjs — THE BALANCE GRADER BITES (lane/b-ground-grader, Tyler 2026-11-07: one formula for every hunt, tested
// extensively). tools/balance-sim/grade.mjs grades played cells against the target sheet; this proves, with no engine run, that:
//   good-set      a synthetic grid on target (Normal safe in range, a four 20% over solo, each harder tier paying more) has no
//                 binding FAIL, and `grade.mjs --in` exits 0 on it
//   mutants       each rule family FAILS the cell that breaks it: Normal deaths and dips (on their 95% interval), the low point, a four
//                 far over solo, a harder tier that pays less; `--in` exits 1 on one
//   no-profit-molds  (Tyler 2026-11-13) gold is printed, never graded: a lone hero 11% over its bill and a pair five under in profit FAIL
//                 nothing, `--in` exits 0 on them and prints each number in GOLD BY GROUND; no sheet carries a profit rule
//   rare-events   a death rate is FAIL only past its interval: 1 death in 2,000 h on Normal is not proof of more than 1 per 1,000 h
//                 (UNPROVEN at most), 12 in 2,000 h is
//   levels        the grid's Levels: deduped, never under 1, floor+10 past the band's top reads `above`
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gradeCells, synthSet, levelsOf, ranked, feelVerdicts, isProfitRule } from '../tools/balance-sim/grade.mjs';
import { SHEET, sheetFromBalanceSheet, EARLY_LEVEL } from '../tools/balance-sim/grade-sheet.mjs';
const CM = await import('../src/data/core-model.js');
import { worse } from '../tools/balance-sim/grade-compare.mjs';

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
    const r = spawnSync(process.execPath, [GRADER, '--in', dir, '--sheet', 'local'], { encoding: 'utf8' });
    cli.out = r.stdout || '';
    return r.status;
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

console.log('balance-grade:');
const good = failsOf(synthSet());
check(good.length === 0, 'good-set: no binding FAIL' + (good.length ? ' (' + good.map((v) => v.rule + ' ' + v.key).join('; ') + ')' : ''));
check(cli(synthSet()) === 0, 'good-set: grade.mjs --in exits 0');
for (const [mut, rule] of [['deaths', 'normal-deaths'], ['dips', 'normal-dips'],
  ['four', 'four-xp'], ['tier', 'tier-pays-more'], ['lowpoint', 'normal-low-point']]) {
  check(failsOf(synthSet({ [mut]: true })).some((v) => v.rule === rule), 'mutants: ' + mut + ' FAILS ' + rule);
}
check(cli(synthSet({ deaths: true })) === 1, 'mutants: grade.mjs --in exits 1 on the Normal deaths mutant');

/* NO PROFIT MOLDS (Tyler 2026-11-13): gold is PRINTED per ground, never graded. The old +25% and five-under-loses mutants FAIL nothing, the CLI
   exits 0 on them, and the printed GOLD BY GROUND table carries each number (the floor hero +11% over its bill, the five-under four's 3,500) */
for (const [mut, printed] of [['profit', '| +11% |'], ['under5', 'to 3,500)']]) {
  check(failsOf(synthSet({ [mut]: true })).length === 0, 'no-profit-molds: the ' + mut + ' mutant (gold only) FAILS nothing');
  check(cli(synthSet({ [mut]: true })) === 0 && cli.out.includes('GOLD BY GROUND') && cli.out.includes(printed), 'no-profit-molds: grade.mjs --in exits 0 on the ' + mut + ' mutant and prints ' + printed);
}
/* a four is judged against solos in its own kit: practice-kit fresh heroes at the floor don't drag the median (10-25 §5 "same gear quality") */
const kitFails = failsOf(synthSet({ practice: true })).filter((v) => v.rule === 'four-xp');
check(kitFails.length === 0, 'same-kit: practice-kit solos leave the four at 1.2' + (kitFails.length ? ' (' + kitFails.map((v) => v.key + ' ' + v.value).join('; ') + ')' : ''));
/* THE FOUR'S LINE, WHERE IT BINDS (designer 2026-11-13): a well-built four (all four classes) at the floor and middle; a three-class four and the
   band's top report. Each four below earns 1.08x a hero alone (under the 1.15 line). */
const slowFour = (offset, comp) => synthSet().map((c) => (c.cell.grade.tier === 'normal' && c.cell.grade.offset === offset && c.cell.grade.size === 4
  ? { ...c, cell: { ...c.cell, grade: { ...c.cell.grade, comp } }, heroes: c.heroes.map((h) => ({ ...h, levelXpPerH: 70000 * 1.08 })) } : c));
const fourVerdicts = (cells) => gradeCells(cells, SHEET, flat).verdicts.filter((v) => v.rule.startsWith('four-xp') && v.verdict !== 'ok');
check(fourVerdicts(slowFour('floor', 'tank+healer+bow+mage')).some((v) => v.rule === 'four-xp' && v.verdict === 'FAIL'), 'four-binds: a well-built four at the floor under 1.15 FAILS four-xp');
check(!fourVerdicts(slowFour('floor', 'tank+hammer+bow+mage')).some((v) => v.verdict === 'FAIL') && fourVerdicts(slowFour('floor', 'tank+hammer+bow+mage')).some((v) => v.rule === 'four-xp-report' && v.verdict === 'OFF'),
  'four-binds: a three-class four at the floor under 1.15 reads OFF on four-xp-report, never FAIL (its own cell, 10-31)');
check(!fourVerdicts(slowFour('top', 'tank+healer+bow+mage')).some((v) => v.verdict === 'FAIL') && fourVerdicts(slowFour('top', 'tank+healer+bow+mage')).some((v) => v.rule === 'four-xp-report' && v.verdict === 'OFF'),
  'four-binds: a well-built four at the band top under 1.15 reads OFF (a ground being outgrown), never FAIL');

/* THE PACE CONTRACT READS THE LONE MEDIAN ON EVERY GROUND (Coordinator ruling 2026-11-11, lane/d-solo-fifteen): the contract is fitted on lone heroes, and a four
   is ruled 1.15-1.25x a lone hero, so on a party ground the four a head read about 1.2x it (the Sewer 1.19, the Warrens 1.52) while its lone median sat in band.
   A party ground at its middle: the lone way at 1.0x the contract and the four at 1.5x grades ok; the lone way at 1.3x FAILS, binding, party ground or not. */
const BS0 = await import('../src/data/balance-sheet.js');
const middle = (loneX) => synthSet().filter((c) => c.cell.grade.tier === 'normal' && c.cell.grade.offset === 'floor').map((c) => {
  const size = c.cell.grade.size, xp = size === 1 ? 70000 * loneX : 70000 * 1.5;
  return { ...c, cell: { ...c.cell, grade: { ...c.cell.grade, offset: 'middle' } }, heroes: c.heroes.map((h) => ({ ...h, levelXpPerH: xp })) };
});
const contract = (loneX) => gradeCells(middle(loneX), { ...sheetFromBalanceSheet(BS0.BALANCE_SHEET), contract: flat }, flat, { g: 'party' }).verdicts.filter((v) => v.rule === 'normal-xp-contract');
check(contract(1.0).length === 1 && contract(1.0)[0].verdict === 'ok' && contract(1.0)[0].key.includes('size 1'), 'lone-contract: a party ground reads its lone median, the four at 1.5x is not the pace (' + JSON.stringify(contract(1.0).map((v) => [v.key, v.verdict])) + ')');
check(contract(1.3)[0].verdict === 'FAIL' && contract(1.3)[0].binding === true, 'lone-contract: the lone median at 1.3x FAILS, binding, on a party ground (' + contract(1.3)[0].verdict + ')');
/* THE CONTRACT ON A TUTORIAL GROUND (designer 2026-11-13): a band whose middle is at or under LEVEL_PACE.early's Level reports, never FAILS; the line
   still binds everywhere else (the 1.3x above, on [16, 31]). The grader's copy of the early Level is the data's. */
const earlyBand = (loneX) => middle(loneX).map((c) => ({ ...c, cell: { ...c.cell, grade: { ...c.cell.grade, band: [1, 8] } } }));
const early = (loneX) => gradeCells(earlyBand(loneX), { ...sheetFromBalanceSheet(BS0.BALANCE_SHEET), contract: flat }, flat, { g: 'solo' }).verdicts.filter((v) => v.rule.startsWith('normal-xp-contract'));
check(!early(0.85).some((v) => v.verdict === 'FAIL') && early(0.85).some((v) => v.rule === 'normal-xp-contract-early' && v.verdict === 'OFF'), 'contract-early: a tutorial ground (middle 5) at 0.85x reads OFF on normal-xp-contract-early, never FAIL');
check(EARLY_LEVEL === CM.LEVEL_PACE.early.level, 'contract-early: the grader early Level ' + EARLY_LEVEL + ' is LEVEL_PACE.early.level ' + CM.LEVEL_PACE.early.level);

/* rare events: one Normal floor cell of 2,000 h holds the whole pooled group's hours (synthSet's floor solo is one cell) */
const withDeaths = (k) => { const cells = synthSet(); const c = cells.find((x) => x.cell.grade.tier === 'normal' && x.cell.grade.offset === 'floor' && x.cell.grade.size === 1); c.heroes[0].deaths = k; return cells; };
const verdictOf = (k) => (gradeCells(withDeaths(k), SHEET, flat).verdicts.find((v) => v.rule === 'normal-deaths' && v.key.includes('/ floor / size 1')) || {}).verdict;
check(verdictOf(1) !== 'FAIL', 'rare-events: 1 death in 2,000 h is ' + verdictOf(1) + ', not FAIL');
check(verdictOf(12) === 'FAIL', 'rare-events: 12 deaths in 2,000 h is FAIL');
check(ranked(gradeCells(withDeaths(12), SHEET, flat).verdicts)[0].verdict === 'FAIL', 'rare-events: a FAIL ranks first');

/* player feel (no sheet): each check is clean on the good set and bites its own mutant */
const feel = (cells) => feelVerdicts(cells).filter((v) => v.verdict === 'FAIL' || v.verdict === 'UNPROVEN').map((v) => v.rule);
check(feel(synthSet()).length === 0, 'feel: the good set reads clean (' + feel(synthSet()).join(', ') + ')');
check(feel(synthSet({ deaths: true })).includes('feel-normal-deaths'), 'feel: a Normal death at the floor is flagged');
check(feel(synthSet({ tier: true })).includes('feel-tier-less'), 'feel: a held Deadly paying less than Normal is flagged');
const seat = synthSet(); seat.find((c) => c.cell.grade.tier === 'normal' && c.cell.grade.offset === 'floor' && c.cell.grade.size === 4).heroes[3].levelXpPerH = 30000;
check(feel(seat).includes('feel-seat-below-solo'), 'feel: a party seat under the lone hero is flagged');
const two = synthSet().concat(synthSet().map((c) => ({ ...c, cell: { ...c.cell, grade: { ...c.cell.grade, ground: 'g2', band: [30, 40] } },
  heroes: c.heroes.map((h) => ({ ...h, profitPerH: h.profitPerH - 3000 })) })));
check(feel(two).length === 0, 'no-profit-molds: a higher floor netting less gold is no longer flagged (feel-gold-order retired 2026-11-13; ' + feel(two).join(', ') + ')');
check(worse(synthSet(), two).length === 0, 'no-profit-molds: grade-compare calls a gold inversion worse for nobody');

/* the release gate (grade-compare.mjs): nothing is worse against itself; a new Normal death and a seat sliding under solo are */
check(worse(synthSet(), synthSet()).length === 0, 'compare: a run against itself is worse nowhere');
check(worse(synthSet(), synthSet({ deaths: true })).some((x) => x.what === 'feel-normal-deaths'), 'compare: a new Normal death is worse');
check(worse(synthSet(), seat).some((x) => x.what === 'seat-vs-solo'), 'compare: a seat sliding under solo is worse');

/* THE WEIGHT CLASS ON THE SHEET THE PACK CHECK READS (designer ruling 2026-11-10; Tyler 11-06: "you're gonna waste money but get
   more exp and possibly die a few times"). The binding half is gold. Deaths are a report line on heroes alone, never a red.
   The pair below is the four staged grounds' red cell: tank and Healer, five under, Dangerous, losing gold, no death in the hour. */
const BS = await import('../src/data/balance-sheet.js');
const WC = sheetFromBalanceSheet(BS.BALANCE_SHEET);
const pairCell = (store) => { const c = structuredClone(synthSet().find((x) => x.cell.grade.tier === 'dangerous' && x.cell.grade.offset === 'under5' && x.cell.grade.size === 1));
  const h = { ...c.heroes[0], hours: 1, deaths: 0, storePerH: store, profitPerH: c.heroes[0].incomePerH - store };
  return { ...c, cell: { ...c.cell, grade: { ...c.cell.grade, size: 2, comp: 'tank+healer' } }, heroes: [h, { ...h, style: 'healer' }] }; };
const lone = (deaths) => synthSet().filter((x) => x.cell.grade.tier === 'dangerous' && x.cell.grade.offset === 'under5' && x.cell.grade.size === 1)
  .map((c) => { const k = structuredClone(c); k.heroes[0].deaths = deaths; return k; });
const wc = (cells) => gradeCells(cells, WC, flat).verdicts.filter((v) => v.rule.startsWith('wc-'));
check(!wc([pairCell(6000)]).some((v) => v.verdict === 'FAIL'), 'weight-class: a pair five under on Dangerous that loses gold and never dies is not a FAIL ('
  + wc([pairCell(6000)]).filter((v) => v.verdict === 'FAIL').map((v) => v.rule).join(', ') + ')');
check(!wc([pairCell(1000)]).some((v) => v.verdict === 'FAIL'), 'no-profit-molds: the same pair in profit FAILS nothing (the under-Level gold line is retired 2026-11-13)');
for (const [name, sheet] of [['the local sheet', SHEET], ['the balance sheet\'s', WC]]) {
  const gold = sheet.rules.filter(isProfitRule).map((r) => r.id);
  check(gold.length === 0, 'no-profit-molds: ' + name + ' carries no profit rule (' + gold.join(', ') + ')');
}
check(wc(lone(0)).some((v) => v.rule === 'wc-under-lone-dies' && v.verdict === 'OFF'), 'weight-class: every lone way holding five under on Dangerous reads OFF on wc-under-lone-dies, never FAIL');
check(wc(lone(2)).some((v) => v.rule === 'wc-under-lone-dies' && v.verdict === 'ok'), 'weight-class: lone heroes dying five under reads ok');
check(!WC.rules.some((r) => r.metric === 'deaths' && r.min != null && r.binding), 'weight-class: no binding line asks a group to die');

const L = levelsOf([5, 15], ['under5', 'under3', 'under2', 'floor', 'plus10', 'top']);
check(JSON.stringify(L) === JSON.stringify([{ offset: 'under3', level: 2 }, { offset: 'under2', level: 3 }, { offset: 'floor', level: 5 }, { offset: 'plus10', level: 15 }]),
  'levels: band 5-15 plays 2, 3, 5, 15 (no Level 0, floor+10 is the top) ' + JSON.stringify(L));
check(levelsOf([1, 5], ['floor', 'plus10']).some((x) => x.offset === 'above' && x.level === 11), 'levels: floor+10 past the top reads above');

/* lone-window (lane/d-live-grounds-2): a lone cell's HP trace is read at the live settle cadence. At 120 s cell.mjs spread a window's regeneration evenly
   and read phantom dips under 25% (a fresh Thicket melee 1.5-3.5 in 12 h, a Glade Ranger about 6) on fights that read 0 at 10 s with the same XP and gold. */
const { buildGrid } = await import('../tools/balance-sim/grade.mjs');
const grid = await buildGrid(ROOT, 'full', { grounds: ['meadowbrook_thicket'] });
const loneJobs = grid.filter((j) => j.party.length === 1), slow = loneJobs.filter((j) => !(j.windowMs <= 10000));
check(loneJobs.length > 0 && slow.length === 0, 'lone-window: every lone cell (' + loneJobs.length + ', the fresh hero included) reads its HP at 10 s' + (slow.length ? ' (' + slow.length + ' at ' + slow[0].windowMs + ' ms, e.g. ' + slow[0].id + ')' : ''));

if (fails.length) { console.error('balance-grade: ' + fails.length + ' FAILED'); process.exit(1); }
console.log('balance-grade: all checks pass');
