#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/review-features.mjs — the features review's derived measurements (59-review-features.md, phase B;
// lane/d-review-features). NO PLAY and NO PRODUCTION READ: arithmetic on numbers other tools measured.
//
//   node tools/balance-program/review-features.mjs cost    one account-day of four heroes at 12 hunted and 12 rested hours a hero, in
//                                                          database-seconds and journal rows, step by step: today, each planned server fix,
//                                                          then town work paid in closed form, against the ruled 60 (50-standards 2.8, C2).
//                                                          Rates are model.mjs COST.real (production means read 2026-11-20, 28-platform.md)
//                                                          and 43-formulas-economy.md E18 (114 of 216 journal rows are supply rows).
//   node tools/balance-program/review-features.mjs risk    the cached matrix subset (balance-matrix-subset.json, the real engine): does a
//                                                          hunt's low-health reading tell a death before it happens? Cells by their
//                                                          lowHpP10, and how many of each band held a death.
//
// Every step's assumption is printed beside it. Reads only. Writes nothing. Not a guard.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COST } from './model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const R = COST.real, C = COST.commitsAnHour;

/* THE ACCOUNT: the ruled reference (50-standards section 0 and call 13): four heroes, 12 hunted hours and 12 rested hours each, every
   rested hour at a node or a bench. The tab is open for the share of hunted hours real accounts kept it open (28: 48%). */
const HEROES = 4, HUNT_H = 12, TOWN_H = 12;
const BUDGET = 60;                       // RULED C2 at 1,000 accounts (24 at 10,000)
const PRESS_MS = 59 + 48;                // REAL (28 section 1): hr_apply 59 ms, and the state read a press brings back, 48 ms
const TOWN_TAB_S_AN_HOUR = 4.7;          // MEASURED x REAL (28 section 4): a tab standing in town alone, 660 calls an hour
const SUPPLY_ROWS = 114, HUNT_ROWS = R.ledgerRowsAHuntedHeroHour;   // 43 E18: 114 of the 216

function account({ watchedShare, commitsWatched, commitsAway, tabReadsS, townSettles, townJobStatements, presses, townTabH, supplyRows, hourlyJournal }) {
  const hunted = HEROES * HUNT_H, town = HEROES * TOWN_H;
  const tabH = watchedShare * HUNT_H, watchedHH = Math.min(hunted, tabH * HEROES), awayHH = hunted - watchedHH;
  const settles = watchedHH * commitsWatched + awayHH * commitsAway;
  const hunt = settles * R.dbMsAHeroSettle / 1000;
  const reads = tabH * tabReadsS;
  /* town work: a settle every tick (37 a hero-hour at 19 ms), or closed form: `townJobStatements` statements a job (start, the count's end,
     stop), ASSUMED two jobs a hero a day (one after each of the day's two hunts, the free game's two visits) at the same 19 ms. */
  const townS = townSettles != null ? town * townSettles * R.townDbMsASettle / 1000 : HEROES * 2 * townJobStatements * R.townDbMsASettle / 1000;
  const pressS = presses * PRESS_MS / 1000, tabS = townTabH * TOWN_TAB_S_AN_HOUR;
  const huntRowsAnHour = hourlyJournal ? 3 : (HUNT_ROWS - SUPPLY_ROWS + supplyRows) * (settles / hunted) / R.combatSettlesAHeroHour;
  const townRows = townSettles != null ? (hourlyJournal ? town * 1 : town * R.ledgerRowsATownHeroHour) : HEROES * 2 * 2;
  return { hunt, reads, townS, pressS, tabS, total: hunt + reads + townS + pressS + tabS, rows: hunted * huntRowsAnHour + townRows };
}

function cost() {
  const today = { watchedShare: R.watchedShareOfHuntedHours, commitsWatched: C.watched, commitsAway: C.away, tabReadsS: R.tabHourReadsS.today,
    townSettles: R.townSettlesAHeroHour, presses: 100, townTabH: 2, supplyRows: SUPPLY_ROWS, hourlyJournal: false };
  const steps = [
    ['0 today', today, 'REAL means x the 12 h day. 100 presses and 2 h of a town tab a day are ASSUMED (27: 32 to 40 presses a four-hero return, two returns)'],
    ['1 + lane/c-server-cost (L01): no off-screen poll', { ...today, tabReadsS: R.tabHourReadsS.afterServerCostLane }, 'CITED 28 step 1'],
    ['2 + commit at the flush (L12)', null, 'a watched hero commits like an away one. RULED 28-1, not built'],
    ['3 + delta envelopes (L24)', null, 'tab reads / 4, press read / 4. ASSUMED by 28 step 7'],
    ['4 + one heartbeat, town alone sends nothing (L25)', null, 'the town tab line goes. RULED 28-7'],
    ['5 + the hourly journal (L13)', null, 'rows only. RULED 28-2'],
    ['6 + Carry on and the plans (L07, L21): 20 presses', null, 'BUILT (1024) and planned. ASSUMED 20 presses a day after them'],
    ['7 + TOWN WORK IN CLOSED FORM (this review)', null, '3 statements a job, 2 jobs a hero a day. HYPOTHESIS until a fixture plays it'],
  ];
  let cur = { ...steps[1][1] };
  steps[2][1] = cur = { ...cur, commitsWatched: C.away };
  steps[3][1] = cur = { ...cur, tabReadsS: cur.tabReadsS / 4, pressRead: true };
  steps[4][1] = cur = { ...cur, townTabH: 0 };
  steps[5][1] = cur = { ...cur, hourlyJournal: true };
  steps[6][1] = cur = { ...cur, presses: 20 };
  steps[7][1] = cur = { ...cur, townSettles: null, townJobStatements: 3 };
  console.log('ONE ACCOUNT-DAY: ' + HEROES + ' heroes, ' + HUNT_H + ' hunted + ' + TOWN_H + ' rested hours each. Database-seconds, against the ruled ' + BUDGET + ' (C2). COMPUTED from model.mjs COST.real, not measured at 12 h.');
  console.log('step | hunt settles | tab reads | town work | presses | town tab | TOTAL | x budget | journal rows | assumption');
  const f = (n) => n.toFixed(n < 10 ? 1 : 0);
  for (const [name, s, why] of steps) {
    const a = account(s);
    if (s.pressRead) { a.total -= a.pressS; a.pressS = s.presses * (59 + 48 / 4) / 1000; a.total += a.pressS; }
    console.log([name, f(a.hunt), f(a.reads), f(a.townS), f(a.pressS), f(a.tabS), f(a.total), (a.total / BUDGET).toFixed(1), Math.round(a.rows).toLocaleString('en-US'), why].join(' | '));
  }
  const last = account(steps[7][1]); const pressS = 20 * (59 + 12) / 1000;
  const left = BUDGET - last.reads - last.townS - pressS;
  const commits = left * 1000 / R.dbMsAHeroSettle / (HEROES * HUNT_H);
  console.log('\nWHAT IS LEFT. After step 7 the hunt settle is ' + f(last.hunt) + ' s of the day. The budget leaves ' + f(left) + ' s for it: ' + commits.toFixed(1) + ' commits a hero-hour at ' + R.dbMsAHeroSettle + ' ms each (today ' + C.away + ' away), a flush about every ' + Math.round(3600 / commits) + ' s, or a commit ' + (R.dbMsAHeroSettle * commits / C.away).toFixed(0) + ' ms cheap at today\'s cadence.');
  const without = account({ ...steps[7][1], townSettles: R.townSettlesAHeroHour });
  const leftW = BUDGET - without.reads - without.townS - pressS;
  console.log('WITHOUT step 7 the town takes ' + f(without.townS) + ' s and leaves the settle ' + f(leftW) + ' s: ' + (leftW * 1000 / R.dbMsAHeroSettle / (HEROES * HUNT_H)).toFixed(1) + ' commits a hero-hour, a flush about every ' + Math.round(3600 / (leftW * 1000 / R.dbMsAHeroSettle / (HEROES * HUNT_H))) + ' s.');
  console.log('SUPPLY ROWS (43 E18): ' + SUPPLY_ROWS + ' of the ' + HUNT_ROWS + ' journal rows a hunted hero-hour are a row a supply kind a settle. Summed on the session they are 2 rows an hour (bought, own).');
}

function risk() {
  const j = JSON.parse(readFileSync(join(HERE, 'balance-matrix-subset.json'), 'utf8'));
  const cells = j.cells;
  console.log('THE LOW-HEALTH READING AGAINST DEATHS: ' + cells.length + ' cells of the cached matrix subset (commit ' + j.commit + ', ' + j.seeds + ' seed x ' + j.hours + ' h a cell: a SMALL sample, standard X26 asks 4 seeds x 8 h for a death rate).');
  console.log('lowHpP10 = the health share the worst tenth of fights fell to. Level 185 and over is PROVISIONAL (the skill line, V1).');
  console.log('lowHpP10 | cells | with a death | under Level 185: cells | with a death');
  for (const [a, b] of [[0, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 1.01]]) {
    const s = cells.filter((x) => x.m.lowHpP10 >= a && x.m.lowHpP10 < b), u = s.filter((x) => x.L < 185);
    console.log(['under ' + Math.round(Math.min(b, 1) * 100) + '%' + (a ? ', at least ' + Math.round(a * 100) + '%' : ''), s.length, s.filter((x) => x.m.deaths > 0).length, u.length, u.filter((x) => x.m.deaths > 0).length].join(' | '));
  }
  const near = cells.filter((x) => x.m.deaths === 0 && x.m.lowHpP10 < 0.5);
  console.log('Near misses (no death in the hour, lowHpP10 under 50%): ' + near.length + ': ' + near.map((x) => x.key + ' ' + Math.round(x.m.lowHpP10 * 100) + '%').join(', '));
}

const cmd = process.argv[2];
if (cmd === 'cost') cost();
else if (cmd === 'risk') risk();
else { console.log('usage: node tools/balance-program/review-features.mjs cost | risk'); process.exit(2); }
