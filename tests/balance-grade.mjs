#!/usr/bin/env node
// tests/balance-grade.mjs — THE BALANCE GRADER BITES (lane/b-ground-grader, Tyler 2026-11-07: one formula for every hunt, tested
// extensively). tools/balance-sim/grade.mjs grades played cells against the target sheet; this proves, with no engine run, that:
//   good-set      a synthetic grid on target (Normal safe in range, a four 20% over solo, each harder tier paying more) has no
//                 binding FAIL, and `grade.mjs --in` exits 0 on it
//   mutants       each rule family FAILS the cell that breaks it: Normal deaths and dips (on their 95% interval), the low point, a four
//                 under solo on Deadly, a harder tier that pays less; `--in` exits 1 on one
//   party-tiers   (Tyler 2026-11-16, "normal isn't meant for parties anyway") the party lines bind Dangerous and Deadly only: a four or a
//                 seat under solo there FAILS, on Normal nothing; a Deadly four past the contract ceiling FAILS (a report under paceFromLevel)
//   no-profit-molds  (Tyler 2026-11-13) gold is printed, never graded: a lone hero 11% over its bill and a pair five under in profit FAIL
//                 nothing, `--in` exits 0 on them and prints each number in GOLD BY GROUND; no sheet carries a profit rule
//   rare-events   a death rate is FAIL only past its interval: 1 death in 2,000 h on Normal is not proof of more than 1 per 1,000 h
//                 (UNPROVEN at most), 12 in 2,000 h is
//   levels        the grid's Levels: deduped, never under 1, floor+10 past the band's top reads `above`
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gradeCells, synthSet, levelsOf, ranked, feelVerdicts, buildGrid, isProfitRule, wornReport, goldRows, goldReport } from '../tools/balance-sim/grade.mjs';
import { loadGear } from '../tools/balance-sim/gear.mjs';
import { monstersOfGround } from '../tools/pack.mjs';
import { MONSTERS } from '../src/data/monsters.js';
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
/* a four is judged against solos in its own kit: practice-kit heroes beside it don't move the median it is read against (10-25 §5 "same gear quality").
   Planted on Deadly, where the four's line binds: read against them it would be 5.9x, not 1.2 */
const kitCells = synthSet().concat(['hammer', 'bow', 'mage'].map((comp) => ({ ...synthSet().find((c) => c.cell.grade.tier === 'deadly' && c.cell.grade.offset === 'floor' && c.cell.grade.size === 1),
  cell: { id: 'practice-' + comp, level: 16, grade: { ground: 'g', band: [16, 31], groupFit: 'solo', tier: 'deadly', offset: 'floor', size: 1, comp, gear: 'practice' } }, heroes: [{ style: comp, level: 16, hours: 2000, levelXpPerH: 20000, profitPerH: 0, incomePerH: 0, storePerH: 0, deaths: 0, closeCallsPer12h: { k: 0 }, encMinHpPct: { p50: 70 }, coinPerH: 0 }] })));
const kitFour = gradeCells(kitCells, SHEET, flat).verdicts.filter((v) => v.rule === 'four-xp' && v.key.includes('/ deadly / floor /'));
check(kitFour.length === 1 && Math.abs(kitFour[0].value - 1.2) < 1e-9, 'same-kit: practice-kit solos leave the Deadly four at 1.2 (' + kitFour.map((v) => v.value.toFixed(2)).join(', ') + ')');
/* THE PARTY LINES, WHERE THEY BIND (grade-sheet.mjs; Tyler 2026-11-16 "normal isn't meant for parties anyway"; the designer's 2026-11-13 scope): a
   well-built four (all four classes) at the floor and middle of Dangerous and Deadly; a three-class four and the band's top report; Normal never.
   Each four below earns 0.9x a hero alone (under the 1.00 line). */
const slowFour = (tier, offset, comp) => synthSet().map((c) => (c.cell.grade.tier === tier && c.cell.grade.offset === offset && c.cell.grade.size === 4
  ? { ...c, cell: { ...c.cell, grade: { ...c.cell.grade, comp } }, heroes: c.heroes.map((h) => ({ ...h, levelXpPerH: (h.levelXpPerH / 1.2) * 0.9 })) } : c));
const fourVerdicts = (cells) => gradeCells(cells, SHEET, flat).verdicts.filter((v) => v.rule.startsWith('four-xp') && v.verdict !== 'ok');
for (const tier of ['dangerous', 'deadly']) {
  check(fourVerdicts(slowFour(tier, 'floor', 'tank+healer+bow+mage')).some((v) => v.rule === 'four-xp' && v.verdict === 'FAIL'), 'party-tiers: a well-built four on ' + tier + ' at the floor under solo FAILS four-xp');
  check(!fourVerdicts(slowFour(tier, 'floor', 'tank+hammer+bow+mage')).some((v) => v.verdict === 'FAIL') && fourVerdicts(slowFour(tier, 'floor', 'tank+hammer+bow+mage')).some((v) => v.rule === 'four-xp-report' && v.verdict === 'OFF'),
    'party-tiers: a three-class four on ' + tier + ' under solo reads OFF on four-xp-report, never FAIL (its own cell, 10-31)');
  check(!fourVerdicts(slowFour(tier, 'top', 'tank+healer+bow+mage')).some((v) => v.verdict === 'FAIL') && fourVerdicts(slowFour(tier, 'top', 'tank+healer+bow+mage')).some((v) => v.rule === 'four-xp-report' && v.verdict === 'OFF'),
    'party-tiers: a well-built four at the band top on ' + tier + ' under solo reads OFF (a ground being outgrown), never FAIL');
}
const normalSlow = slowFour('normal', 'floor', 'tank+healer+bow+mage');
check(fourVerdicts(normalSlow).length === 0 && !failsOf(normalSlow).length, 'party-tiers: a well-built four on Normal under solo is graded by no line (' + failsOf(normalSlow).map((v) => v.rule).join(', ') + ')');
/* the Deadly four's ceiling (balance-sheet.js party.deadlyFourVsContractMax) against a flat contract: past it FAILS, under paceFromLevel reads OFF */
const BSP = await import('../src/data/balance-sheet.js'), PARTY = BSP.BALANCE_SHEET.party;
const paceVerdicts = (x, level) => gradeCells(synthSet({ fourPace: x, fourPaceLevel: level }), { ...sheetFromBalanceSheet(BSP.BALANCE_SHEET), contract: flat }, flat)
  .verdicts.filter((v) => v.rule === 'four-deadly-pace' && v.key.includes('/ deadly / floor /'));
check(paceVerdicts(PARTY.deadlyFourVsContractMax * 1.04).some((v) => v.verdict === 'FAIL' && v.binding), 'party-tiers: a Deadly four past ' + PARTY.deadlyFourVsContractMax + 'x the contract FAILS four-deadly-pace');
check(paceVerdicts(PARTY.deadlyFourVsContractMax * 0.96).length === 1 && paceVerdicts(PARTY.deadlyFourVsContractMax * 0.96)[0].verdict === 'ok', 'party-tiers: a Deadly four under the ceiling reads ok');
check(paceVerdicts(PARTY.deadlyFourVsContractMax * 1.04, PARTY.paceFromLevel - 1).some((v) => v.verdict === 'OFF'), 'party-tiers: under Level ' + PARTY.paceFromLevel + ' the ceiling reports (OFF), never FAILS');
check(!('fourVsSolo' in PARTY), 'party-tiers: the sheet carries no Normal four multiple (party.fourVsSolo retired 2026-11-16)');
/* ONE RULING, TWO GUARDS: the pack check grades the sheet's party numbers and tests/party-class-xp-line.mjs binds its own (ALONE_BAR, PACE_CAP, PACE_FROM
   at LEVEL_PACE's first target), so they are the same numbers (Tyler 2026-11-16: ">= the same heroes alone", "<= ~2.5x the pace contract") */
{
  const pcx = readFileSync(join(ROOT, 'tests/party-class-xp-line.mjs'), 'utf8'), num = (k) => Number((pcx.match(new RegExp('const ' + k + ' = ([\\d.]+);')) || [])[1]);
  check(num('ALONE_BAR') === PARTY.vsAloneMin && num('PACE_CAP') === PARTY.deadlyFourVsContractMax && /const PACE_FROM = LEVEL_PACE\.targets\[0\]\[0\];/.test(pcx) && PARTY.paceFromLevel === CM.LEVEL_PACE.targets[0][0],
    'party-tiers: the sheet\'s party numbers are party-class-xp-line\'s (alone ' + PARTY.vsAloneMin + ' / ' + num('ALONE_BAR') + ', ceiling ' + PARTY.deadlyFourVsContractMax + ' / ' + num('PACE_CAP') + ', from Level ' + PARTY.paceFromLevel + ')');
}
/* THE SEAT TWINS (grade.mjs buildGrid): a seat's way played alone only for the same heroes alone moves the four's reading and nothing a lone way reads
   (the lone medians, the tier lines, the printed gold) */
{
  /* every seat twin at the Deadly floor slow and losing gold: read as lone ways they would carry the lone median and the printed gold with them */
  const slowTwin = synthSet();
  for (const c of slowTwin.filter((x) => x.cell.grade.seatOnly && x.cell.grade.tier === 'deadly' && x.cell.grade.offset === 'floor')) c.heroes[0].levelXpPerH = 1000, c.heroes[0].profitPerH = -99999;
  const BSS = { ...sheetFromBalanceSheet(BSP.BALANCE_SHEET), contract: flat };
  const read = (cells) => gradeCells(cells, BSS, flat).verdicts.filter((v) => v.key.includes('/ deadly / floor /'));
  const was = read(synthSet()), now = read(slowTwin);
  const four = (vs) => (vs.find((v) => v.rule === 'four-xp') || {}).value;
  check(four(now) > four(was), 'seat-twins: slow seats alone lift the four against the same heroes alone (' + four(was) + ' -> ' + four(now) + ')');
  const others = (vs) => JSON.stringify(vs.filter((v) => v.rule !== 'four-xp').map((v) => [v.rule, v.key, v.value]));
  check(others(now) === others(was) && goldReport(goldRows(slowTwin)) === goldReport(goldRows(synthSet())), 'seat-twins: no other line and no printed gold moves with it');
  const qg = await buildGrid(ROOT, 'quick', { grounds: ['mosslight_glade'] }), twins = qg.filter((j) => j.grade.seatOnly);
  check(twins.length > 0 && twins.every((j) => j.grade.comp === 'healer' && j.grade.tier !== 'normal' && j.profile === 'played' && j.id.includes(',seat,')),
    'seat-twins: quick plays the Healer alone on Dangerous and Deadly only, played, its id saying so (' + twins.length + ')');
}

/* THE PACE CONTRACT READS THE LONE MEDIAN ON EVERY GROUND (Coordinator ruling 2026-11-11, lane/d-solo-fifteen): the contract is fitted on lone heroes, and a four
   a head reads its party bonus on top, so on a party ground it read about 1.2x (the Sewer 1.19, the Warrens 1.52) while its lone median sat in band.
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
/* a seat under the lone hero (Tyler 2026-11-16): felt on Dangerous and Deadly, never on Normal; not for one class (10-31), nor for a party with no
   Healer on a Healer's tier at its Level (designer 2026-11-19, hunt-tiers.js isHealerTier) */
const seatOn = (tier, comp) => { const s = synthSet(), c = s.find((x) => x.cell.grade.tier === tier && x.cell.grade.offset === 'floor' && x.cell.grade.size === 4); c.heroes[3].levelXpPerH = 30000; if (comp) c.cell.grade.comp = comp; return s; };
const seat = seatOn('deadly');
check(feel(seat).includes('feel-seat-below-solo') && feel(seatOn('dangerous')).includes('feel-seat-below-solo'), 'feel: a party seat under the lone hero on Dangerous and Deadly is flagged');
check(!feel(seatOn('normal')).includes('feel-seat-below-solo'), 'feel: a party seat under the lone hero on Normal is not (11-16: Normal is not tuned for parties)');
check(!feel(seatOn('deadly', 'hammer+hammer+hammer+hammer')).includes('feel-seat-below-solo'), 'feel: a one-class four under the lone hero is not (10-31: one class never out-earns its heroes alone)');
const healerOn = (healerTier) => feelVerdicts(seatOn('deadly', 'tank+hammer+bow+mage'), {}, healerTier).map((v) => v.rule).includes('feel-seat-below-solo');
check(!healerOn((g, t, lv) => g === 'g' && t === 'deadly' && lv === 16) && healerOn(() => false), 'feel: a four with no Healer is read on an ordinary Deadly, not on a Healer\'s tier at its Level');
const two = synthSet().concat(synthSet().map((c) => ({ ...c, cell: { ...c.cell, grade: { ...c.cell.grade, ground: 'g2', band: [30, 40] } },
  heroes: c.heroes.map((h) => ({ ...h, profitPerH: h.profitPerH - 3000 })) })));
check(feel(two).length === 0, 'no-profit-molds: a higher floor netting less gold is no longer flagged (feel-gold-order retired 2026-11-13; ' + feel(two).join(', ') + ')');
check(worse(synthSet(), two).length === 0, 'no-profit-molds: grade-compare calls a gold inversion worse for nobody');

/* the release gate (grade-compare.mjs): nothing is worse against itself; a new Normal death and a seat sliding under solo are */
check(worse(synthSet(), synthSet()).length === 0, 'compare: a run against itself is worse nowhere');
check(worse(synthSet(), synthSet({ deaths: true })).some((x) => x.what === 'feel-normal-deaths'), 'compare: a new Normal death is worse');
check(worse(synthSet(), seat).some((x) => x.what === 'seat-vs-solo'), 'compare: a seat sliding under solo on Deadly is worse');
check(!worse(synthSet(), seatOn('normal')).some((x) => x.what === 'seat-vs-solo'), 'compare: a seat sliding under solo on Normal is worse for nobody (11-16)');

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
const grid = await buildGrid(ROOT, 'full', { grounds: ['meadowbrook_thicket'] });
const loneJobs = grid.filter((j) => j.party.length === 1), slow = loneJobs.filter((j) => !(j.windowMs <= 10000));
check(loneJobs.length > 0 && slow.length === 0, 'lone-window: every lone cell (' + loneJobs.length + ', the fresh hero included) reads its HP at 10 s' + (slow.length ? ' (' + slow.length + ' at ' + slow[0].windowMs + ' ms, e.g. ' + slow[0].id + ')' : ''));
/* A STAGED GROUND IS GRADED AS IT SHIPS (lane/b-slake-and-ford 2026-11-10, ported by lane/d-packs-retune): its jobs put its own drops on the gear ladder
   and say so in the cell id; an open ground's jobs carry neither. Without it a staged ground at a tier's first Level is graded one tier under. */
{
  const G = await import('../src/data/hunt-grounds.js');
  const staged = Object.keys(G.HUNT_GROUNDS).filter((g) => !Object.prototype.hasOwnProperty.call(G.OPEN_GROUNDS, g));
  const open = Object.keys(G.OPEN_GROUNDS)[0];
  const jobs = await buildGrid(ROOT, 'quick', { grounds: [...staged, open] });
  const of = (g) => jobs.filter((j) => j.ground === g);
  check(of(open).length > 0 && of(open).every((j) => !(j.gear && j.gear.openAlso) && !j.id.includes(',open')), 'as it ships: an open ground (' + open + ') is played on the open ladder');
  if (!staged.length) console.log('  --   as it ships: no staged ground today, the staged half reads nothing');
  const gear = staged.length ? await loadGear(ROOT) : null;
  for (const g of staged) {
    check(of(g).length > 0 && of(g).every((j) => j.gear && j.gear.openAlso && j.gear.openAlso.join() === g && j.id.includes(',open')), 'as it ships: staged ' + g + ' plays with its own drops, and its cell ids say so');
    const own = monstersOfGround(G.HUNT_GROUNDS[g]).flatMap((m) => (MONSTERS[m].drops || []).map((d) => d.id));
    const only = own.filter((id) => !gear.reach.has(id));
    if (!only.length) { console.log('  --   as it ships: every drop of ' + g + ' is gettable elsewhere, nothing to open'); continue; }
    check(only.every((id) => gear.reachWith([g]).has(id)), 'as it ships: ' + only.length + ' drops found only on ' + g + ' are on its ladder with openAlso, and off it without');
  }
  /* --open-also: a pair that ships together (pack check --with); a name that is no ground is refused before anything plays */
  if (staged.length > 1) {
    const [a, b] = staged, pair = await buildGrid(ROOT, 'quick', { grounds: [a], openAlso: [b] });
    check(pair.every((j) => j.gear.openAlso.join() === a + ',' + b && j.id.includes(',open=' + a + '+' + b)), 'as it ships with ' + b + ': ' + a + '\'s jobs open both, and their ids say so');
  }
  let refused = false;
  try { await buildGrid(ROOT, 'quick', { grounds: [open], openAlso: ['no_such_ground'] }); } catch { refused = true; }
  check(refused, 'as it ships: --open-also with no such ground is refused');
  /* AN OPEN HALL STAYS OPEN (lane/a-grader-uniques): opening a staged ground keeps every open keyed hall's prize on the ladder (Krell's tier 7) */
  const hallPrize = Object.values(G.OPEN_HALL_GROUNDS).flatMap((h) => h.pockets.flatMap((p) => p.spawns)).flatMap((s) => (MONSTERS[s.monster].drops || []).map((d) => d.id))
    .filter((id) => gear && gear.reach.has(id));
  if (staged.length && hallPrize.length) check(hallPrize.every((id) => gear.reachWith([staged[0]]).has(id)), 'as it ships: ' + hallPrize.length + ' open-hall prizes stay gettable with ' + staged[0] + ' opened');
  /* --uniques: its own cell ids and gear on every ladder and store-food cell; the fresh hero keeps the start kit */
  const uq = await buildGrid(ROOT, 'quick', { grounds: [open], uniques: true });
  check(uq.length > 0 && uq.every((j) => j.id.includes(',uniq') && (j.grade.gear === 'practice' ? j.gear.starter === true && !j.gear.uniques : j.gear.uniques === true)),
    'uniques: every cell id says ,uniq and every ladder cell wears the uniques kit (the practice cells the start kit)');
  /* GROUND AND BOSS DROPS ONLY (the designer 2026-11-18 row 1f): the chest's pieces are graded only under --chest, in cells of their own,
     and a plain uniques run prints the swap each way would make with one (the what-if row) */
  check(uq.every((j) => !j.id.includes(',chest') && !(j.gear && j.gear.chest)), 'uniques: no plain uniques cell wears the Hearth Chest\'s pieces (row 1f)');
  const uc = await buildGrid(ROOT, 'quick', { grounds: [open], uniques: true, chest: true });
  check(uc.length === uq.length && uc.every((j) => j.id.includes(',chest') && (j.grade.gear === 'practice' || j.gear.chest === true)), 'uniques --chest: the what-if cells say ,chest and wear the chest\'s pieces');
  const late = 'carters_rest', gl = gear || await loadGear(ROOT), OPEN4 = ['carters_rest', 'ox_road', 'wyvern_roost', 'unmarked_catacombs'].filter((g) => G.HUNT_GROUNDS[g]);
  /* the Level the what-if is read at: the last one where the seven-tier ladder's top is a sword's best ground drop. From 90 a step tier (item
     Level 100, src/data/gear-tiers.js STEP_TIERS, lane/gear-phase-b) outranks every chest weapon, a Dawnsteel twin, so no swap is left to name
     (their re-sort onto steps: CONFLICTS 2026-11-23). It was 110 on the seven-tier ladder */
  const LV = 89;
  if (G.HUNT_GROUNDS[late]) {
    const g4 = { uniques: true, openAlso: OPEN4 }, kit = gl.kitOf('sword', LV, { ground: late, ...g4 });
    const cell = (gearOpts) => ({ cell: { ground: late, gear: gearOpts }, heroes: [{ style: 'sword', level: LV, kit: gl.kitOf('sword', LV, { ground: late, ...gearOpts }) }] });
    const plain = wornReport([cell(g4)], gl), what = wornReport([cell({ ...g4, chest: true })], gl);
    /* the what-if column of the sword's row lists every chest swap ("A for B (slot); C for D (slot)"): since the Catacombs' Platinum armor shipped
       (set/v0.2.141) a helm swap follows the weapon's, so the row is read by its columns, not by how it ends */
    const swaps = (report) => ((report.split('\n').find((l) => l.startsWith('| ' + late + ' / sword / ' + LV + ' |')) || '').split('|')[3] || '').split(';').map((x) => x.trim());
    const chestWeapons = [...gl.CHEST_IDS].filter((id) => gl.ITEMS[id] && gl.ITEMS[id].type === 'weapon').map((id) => gl.ITEMS[id].n);
    check(!Object.values(kit).some((id) => gl.CHEST_IDS.has(id)) && /ground and boss drops only/.test(plain),
      'uniques: a sword at Carter\'s Rest ' + LV + ' is graded in no chest piece (row 1f: ground and boss drops only)');
    check(swaps(plain).some((s) => / \(weapon\)$/.test(s) && chestWeapons.some((n) => s.startsWith(n + ' for '))),
      'uniques: the report\'s what-if row names the chest weapon that sword would swap in (' + swaps(plain).join('; ') + ')');
    check(/--chest/.test(what) && Object.values(gl.kitOf('sword', LV, { ground: late, ...g4, chest: true })).some((id) => gl.CHEST_IDS.has(id)), 'uniques --chest: the same sword wears the chest weapon');
  }
}

/* THE STORE-FOOD FLOOR'S KIT (the designer 2026-11-18 row 2a, tools/balance-sim/audit-table.mjs storefood): by default the kit a hero ARRIVES in,
   one gear tier under the Level's best with every combat skill ARRIVING_SKILL_GAP under the Level; `--kit level` the old one */
{
  const AT = await import('../tools/balance-sim/audit-table.mjs');
  const arr = AT.storeFoodCell({ ground: 'krells_hold', level: 85, style: 'tank', storeFood: 'salted_shrimp' });
  const lvl = AT.storeFoodCell({ ground: 'krells_hold', level: 85, style: 'tank', storeFood: 'salted_shrimp', kit: 'level' });
  check(arr.gear && arr.gear.tierOffset === -1 && arr.gear.only === 'all' && JSON.stringify(arr.skillsBySeat) === JSON.stringify([{ melee: 75, ranged: 75, magic: 75, defense: 75 }]),
    'storefood: the default is the arriving kit (a tier under, Melee, Ranged, Magic and Defense 75 at Level 85)');
  check(!lvl.gear && !lvl.skillsBySeat && lvl.id !== arr.id, 'storefood: --kit level is the Level\'s own kit, in a cell of its own');
  const pair = AT.storeFoodCell({ ground: 'krells_hold', level: 5, style: 'tank', storeFood: 'salted_shrimp', mate: 'healer' });
  check(pair.skillsBySeat.length === 2 && pair.skillsBySeat.every((s) => s.melee === 1), 'storefood: both seats of a pair arrive, and a skill never reads under 1');
  const gl = await loadGear(ROOT), tierOf = (id) => Number((gl.ITEMS[id] || {}).tier) || 1;
  const best = gl.kitOf('tank', 85), came = gl.kitOf('tank', 85, arr.gear);
  check(tierOf(came.weapon) === tierOf(best.weapon) - 1 && tierOf(came.body) === tierOf(best.body) - 1, 'storefood: the arriving tank at 85 wears tier ' + tierOf(came.weapon) + ', one under the Level\'s ' + tierOf(best.weapon));
}

/* THE PLAYED HERO (the balance audit's fix 1, lane/d-audit-fixes-sim 2026-11-19): parties and harder tiers are graded on the played hero, a hero alone on
   Normal on the plain one (the pace of record's), with a played twin beside it that only a played cell is read against. */
{
  const grid = await buildGrid(ROOT, 'quick', { grounds: ['mosslight_glade'] });
  const lone = grid.filter((j) => j.grade.size === 1 && j.grade.tier === 'normal' && j.grade.gear === 'ladder');
  const party = grid.filter((j) => j.grade.size > 1), harder = grid.filter((j) => j.grade.tier !== 'normal');
  check(party.length > 0 && party.every((j) => j.profile === 'played' && j.grade.profile === 'played' && j.id.endsWith(',pr=played')), 'played: every party cell plays the played hero, and its id says so');
  check(harder.length > 0 && harder.every((j) => j.profile === 'played'), 'played: every harder-tier cell plays the played hero, alone or not');
  const plain = lone.filter((j) => j.grade.profile === 'plain'), twins = lone.filter((j) => j.grade.profile === 'played');
  check(plain.length > 0 && plain.length === twins.length && plain.every((j) => !j.profile) && twins.every((j) => j.profile === 'played'), 'played: a hero alone on Normal plays plain (' + plain.length + ') with a played twin each (' + twins.length + ')');
  check(grid.filter((j) => j.grade.gear !== 'ladder').every((j) => !j.profile && j.grade.profile === 'plain'), 'played: the practice set and the store-food cell stay plain');
  check(new Set(grid.map((j) => j.id)).size === grid.length, 'played: no two cells share an id');
  /* the scoping, on synthetic cells: a played twin's death fails no Normal rule; a played four is read against the played twins alone, not the plain hero */
  const prof = (cells) => cells.flatMap((c) => {
    const g = c.cell.grade;
    if (g.size === 1 && g.tier === 'normal') return [{ ...c, cell: { ...c.cell, grade: { ...g, profile: 'plain' } } }, { ...c, cell: { ...c.cell, grade: { ...g, profile: 'played' } }, heroes: c.heroes.map((h) => ({ ...h, levelXpPerH: h.levelXpPerH * 1.3 })) }];
    return [{ ...c, cell: { ...c.cell, grade: { ...g, profile: 'played' } }, heroes: c.heroes.map((h) => ({ ...h, levelXpPerH: h.levelXpPerH * 1.3 })) }];
  });
  check(failsOf(prof(synthSet())).length === 0, 'played: the good set split by profile has no binding FAIL (' + failsOf(prof(synthSet())).map((v) => v.rule + ' ' + v.key).join('; ') + ')');
  const twinDies = prof(synthSet()); twinDies.find((c) => c.cell.grade.profile === 'played' && c.cell.grade.size === 1 && c.cell.grade.tier === 'normal' && c.cell.grade.offset === 'floor').heroes[0].deaths = 12;
  check(!failsOf(twinDies).some((v) => v.rule === 'normal-deaths'), 'played: a played twin\'s deaths fail no Normal rule (the plain hero is graded there)');
  const plainDies = prof(synthSet()); plainDies.find((c) => c.cell.grade.profile === 'plain' && c.cell.grade.size === 1 && c.cell.grade.offset === 'floor').heroes[0].deaths = 12;
  check(failsOf(plainDies).some((v) => v.rule === 'normal-deaths'), 'played: the plain hero alone dying on Normal still FAILS normal-deaths');
  /* a four at 1.2x the played heroes alone on its tier reads ok, read against nothing but them (the four's line binds Dangerous and Deadly) */
  const fourOk = gradeCells(prof(synthSet()), SHEET, flat).verdicts.filter((v) => v.rule === 'four-xp');
  check(fourOk.length > 0 && fourOk.every((v) => v.verdict === 'ok' && Math.abs(v.value - 1.2) < 1e-9), 'played: a four is read against the played twins alone (' + fourOk.map((v) => v.value.toFixed(2)).join(', ') + ')');
}

if (fails.length) { console.error('balance-grade: ' + fails.length + ' FAILED'); process.exit(1); }
console.log('balance-grade: all checks pass');
