#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/review-progression.mjs — the progression review's derived tables (56-review-progression.md section 0;
// lane/d-review-progression). NO PLAY: it reads the cached grid (progression-grid.json, the real engine's cells) through grid-derive.mjs
// and works out what a Level curve and a Blessing ladder do. A curve moves no fight, so hours and death costs are ARITHMETIC on the
// engine's measured Level XP an hour: every number here is COMPUTED, never MEASURED.
//
// THE CURVES
//   today     LEVEL_CURVE as it is
//   table50   44's form from Level 50 (RECOMMENDED): the ruled table of hours (LEVEL_PACE.targets, with Level 400 at 4,580) joined on a
//             log scale; from Level 50 a Level costs the table's hours for that Level x the pace seat's measured XP an hour. Levels 1 to
//             50 are today's (the 11-20 new-player ruling 27-2 holds them on a lone hero)
//   table1    44's form from Level 1: the same from the first Level, so the pace seat (a four) is exact at EVERY ruled point
//   trial     WITHDRAWN: the power law H = 0.643 x L^1.485 at 2.0 x the contract that patches/progression-1-level-law.json played
//
//   node tools/balance-program/review-progression.mjs law      hours to each Level for the pace seat and the lone MID hero, and the doors
//   node tools/balance-program/review-progression.mjs deaths   the death arithmetic: what one death costs, where each Blessing rung falls,
//                                                              the death count at which a tier stops paying, and XP an hour after deaths
//                                                              at ASSUMED counts (the ruled S6 band, the real count, the harness's)
//
// Reads only. Writes nothing. Not a guard.
// ════════════════════════════════════════════════════════════════════════
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as STD from './standards.mjs';
import { loadGridData, readGrid } from './progression-grid.mjs';
import { loadKits } from './grid-kit.mjs';
import { derive } from './grid-derive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'law';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const r0 = (x) => Math.round(x);
const TOP = 400;

const grid = readGrid(false);
if (!grid) { console.error('review-progression: no cached progression-grid.json'); process.exit(2); }
const D = await loadGridData(ROOT);
const K = await loadKits(ROOT);
const T = derive(D, grid, K);
const CM = await import('../../src/data/core-model.js');
const xpToday = T.xpAt;
const seat = T.SEATS[T.PACE], lone = T.SEATS['mid:1:normal'];
const rateAt = (s, L) => (xpToday(L + 1) - xpToday(L)) / s.per[Math.min(L, TOP - 1)];
const contract = (L) => CM.LEVEL_PACE.contract.a * L ** CM.LEVEL_PACE.contract.b;

/* THE RULED TABLE OF HOURS (2026-10-25, timed on the MID four by 2026-11-21 call 1; Level 400 by call 2), joined on a log scale. */
const RULED = [[1, 0.05], ...CM.LEVEL_PACE.targets.filter(([L]) => L !== 400), [400, 4580]].sort((a, b) => a[0] - b[0]);
export function ruledHours(L) {
  for (let i = 1; i < RULED.length; i++) if (L <= RULED[i][0]) { const [a, ha] = RULED[i - 1], [b, hb] = RULED[i]; return ha * (hb / ha) ** (Math.log(L / a) / Math.log(b / a)); }
  return RULED[RULED.length - 1][1];
}
const ruledStep = (L) => ruledHours(L + 1) - ruledHours(L);
/* a curve as a total-XP function, from the XP each Level costs */
const curveOf = (step) => { const tot = [0, 0]; for (let L = 1; L <= TOP; L++) tot[L + 1] = tot[L] + step(L); return (L) => tot[Math.min(L, TOP + 1)]; };
const todayStep = (L) => xpToday(L + 1) - xpToday(L);
const TRIAL_TAIL = [{ from: 50, rise: 371353, bend: 0 }, { from: 58, rise: 109822, bend: 0 }, { from: 100, rise: 154992, bend: 529 }, { from: 200, rise: 260334, bend: 467 }, { from: 300, rise: 353507, bend: 431 }];
const trialRows = D.XP.levelCurveRowsOf({ first: CM.LEVEL_CURVE.first, brackets: [...CM.LEVEL_CURVE.brackets.filter((b) => b.from < 50), ...TRIAL_TAIL] });
export const CURVES = {
  today: { name: 'today', xp: xpToday },
  table50: { name: '44\'s form from Level 50 (recommended)', xp: curveOf((L) => (L < 50 ? todayStep(L) : ruledStep(L) * rateAt(seat, L))) },
  table1: { name: '44\'s form from Level 1', xp: curveOf((L) => ruledStep(L) * rateAt(seat, L)) },
  trial: { name: 'WITHDRAWN trial power law', xp: (L) => D.XP.xpForLevelOn(trialRows, L) },
};
const ORDER = ['today', 'table50', 'table1', 'trial'];
const hoursOn = (s, xp, L) => { let h = 0; for (let l = 1; l < L; l++) h += (xp(l + 1) - xp(l)) / rateAt(s, l); return h; };

/* THE BLESSING LADDER as a rule in hours: three Blessings, then one more whenever a fully blessed death would cost the pace seat over
   `hours`; each past the third halves what is left. The rung Levels fall out of the curve. */
const LADDER_HOURS = 5;
function rungsOf(xp) {
  const rungs = []; let held = 3;
  for (let L = 50; L <= TOP; L++) { while (held < 9 && (0.06 * xp(L) * 0.25 / 2 ** (held - 3)) / rateAt(seat, L) > LADDER_HOURS) { held += 1; rungs.push([L, held]); } }
  return rungs;
}
const heldAt = (rungs, L) => rungs.reduce((n, [lv, k]) => (L >= lv ? k : n), 3);
const shareAt = (rungs, L) => 0.25 / 2 ** (heldAt(rungs, L) - 3);

if (mode === 'law') {
  const LV = [10, 25, 50, 75, 88, 100, 110, 145, 185, 200, 300, 400];
  console.log('COMPUTED on the cached grid\'s measured Level XP an hour. Cells from Level 185 are PROVISIONAL (the skill line).');
  console.log('\n== THE PACE SEAT (' + T.PACE + '): its XP an hour over the contract, and hours to each Level ==');
  console.log('Level | x contract | ruled | ' + ORDER.join(' | '));
  for (const L of LV) console.log([L, (rateAt(seat, L) / contract(L)).toFixed(2), r0(ruledHours(L)), ...ORDER.map((k) => r0(hoursOn(seat, CURVES[k].xp, L)))].join(' | '));
  console.log('\n== THE LONE MID HERO ON NORMAL: hours (day at 12 h) ==');
  console.log('Level | ' + ORDER.join(' | '));
  for (const L of [10, 25, 50, 75, 100, 110, 185, 200, 300, 400]) console.log([L, ...ORDER.map((k) => { const h = hoursOn(lone, CURVES[k].xp, L); return r0(h) + ' (' + r0(h / 12) + ')'; })].join(' | '));
  console.log('\n== THE DOORS, the pace seat, day at 12 h ==');
  console.log('Door | ' + ORDER.join(' | '));
  for (const [L, name] of [[45, 'the Barrow March'], [88, 'Krell\'s Hold'], [110, 'end of open content'], [185, 'end of staged content'], [200, 'Level 200'], [300, 'Level 300'], [400, 'Level 400']]) console.log([name + ' (' + L + ')', ...ORDER.map((k) => r0(hoursOn(seat, CURVES[k].xp, L) / 12))].join(' | '));
  console.log('\n== HOURS FOR ONE LEVEL, the pace seat ==');
  console.log('Level | ' + ORDER.join(' | '));
  for (const L of [49, 50, 60, 75, 99, 100, 150, 185, 200, 300, 399]) console.log([L, ...ORDER.map((k) => ((CURVES[k].xp(L + 1) - CURVES[k].xp(L)) / rateAt(seat, L)).toFixed(1))].join(' | '));
  console.log('\n== TOTAL LEVEL XP over today\'s ==');
  for (const L of [50, 100, 200, 300, 400]) console.log([L, ...ORDER.map((k) => (CURVES[k].xp(L) / xpToday(L)).toFixed(2))].join(' | '));
}

if (mode === 'deaths') {
  const LV = [50, 75, 100, 145, 185, 200, 250, 300, 350, 400];
  const band = (tier, gear) => { const b = STD.bandById('S6.' + tier + '.' + gear); return [b.lo ?? b.hi, b.hi ?? b.lo]; };
  console.log('COMPUTED, NOT MEASURED. The grid measured Level XP an hour. It recorded about 0 deaths on Deadly (0 in all but three cells), and real play');
  console.log('recorded 1 death in 449 party hours past Level 45 (2.2 a 1,000 h). Every "after deaths" number below is the measured XP rate less an');
  console.log('ASSUMED death count x 6% of total Level XP x the Blessed share. The counts assumed are named on each table.');
  console.log('\n== ONE DEATH in the pace seat\'s hunted hours: unblessed / three Blessings / the ladder (a rung whenever three-plus Blessings would cost over ' + LADDER_HOURS + ' h) ==');
  console.log('Level | ' + ORDER.join(' | '));
  const RUNGS = Object.fromEntries(ORDER.map((k) => [k, rungsOf(CURVES[k].xp)]));
  for (const L of LV) console.log([L, ...ORDER.map((k) => { const h = 0.06 * CURVES[k].xp(L) / rateAt(seat, L); return h.toFixed(1) + ' / ' + (h / 4).toFixed(1) + ' / ' + (h * shareAt(RUNGS[k], L)).toFixed(1); })].join(' | '));
  console.log('\n== WHERE THE RUNGS FALL (the Level each Blessing past the third opens) ==');
  for (const k of ORDER) console.log(k + ': ' + (RUNGS[k].map(([L, n]) => 'Blessing ' + n + ' at Level ' + L).join(', ') || 'none to Level 400'));
  console.log('\n== THE BREAK-EVEN DEATH COUNT: deaths a 1,000 hours at which a blessed four on the tier earns what the same heroes earn alone on Normal ==');
  console.log('   (real play: 2.2. The ruled S6 band: MID Deadly ' + band('deadly', 'mid').join(' to ') + ', MID Dangerous ' + band('dangerous', 'mid').join(' to ') + ', BiS Deadly ' + band('deadly', 'bis').join(' to ') + '. A tier pays while its real count is UNDER this number)');
  for (const [gear, tier] of [['mid', 'deadly'], ['mid', 'dangerous'], ['bis', 'deadly']]) {
    console.log('-- ' + gear.toUpperCase() + ' ' + tier + ': three Blessings | the ladder --');
    console.log('Level | ' + ORDER.join(' | '));
    for (const L of LV) {
      const c = T.get(L, gear, 4, tier), n1 = T.get(L, gear, 1, 'normal');
      if (!c || !n1) continue;
      const room = c.rates.levelXpPerH - n1.rates.netLevelXpPerH;
      console.log([L, ...ORDER.map((k) => { const d = 0.06 * CURVES[k].xp(L); return r0(1000 * room / (d * 0.25)) + ' | ' + r0(1000 * room / (d * shareAt(RUNGS[k], L))); })].join(' || '));
    }
  }
  console.log('\n== THE FIRST CHECKPOINT WHERE A BLESSED FOUR EARNS LESS A HEAD THAN THE SAME HEROES ALONE ON NORMAL, by ASSUMED death count (none = never to 400) ==');
  console.log('curve | kit, tier | 3 Blessings at: real 2.2 | band low | band high || ladder at: real 2.2 | band low | band high');
  for (const k of ORDER) for (const [gear, tier] of [['mid', 'deadly'], ['mid', 'dangerous'], ['bis', 'deadly']]) {
    const [lo, hi] = band(tier, gear);
    const first = (n, ladder) => { for (const L of T.levels.filter((x) => x >= 50)) { const c = T.get(L, gear, 4, tier), n1 = T.get(L, gear, 1, 'normal'); if (!c || !n1) continue; const share = ladder ? shareAt(RUNGS[k], L) : 0.25; if (c.rates.levelXpPerH - (n / 1000) * 0.06 * CURVES[k].xp(L) * share < n1.rates.netLevelXpPerH) return L; } return 'none'; };
    console.log([k, gear + ' ' + tier, first(2.2, false), first(lo, false) + ' (' + lo + ')', first(hi, false) + ' (' + hi + ')', '', first(2.2, true), first(lo, true), first(hi, true)].join(' | '));
  }
  console.log('\n== XP an hour a head, MID four on Deadly, in thousands: alone on Normal | gross | after deaths with 3 Blessings at 2.2 / band low / band high | with the ladder at band low / high ==');
  const [lo, hi] = band('deadly', 'mid');
  for (const k of ['today', 'table50', 'table1']) {
    console.log('-- ' + CURVES[k].name + ' --');
    for (const L of [100, 145, 200, 300, 400]) {
      const c = T.get(L, 'mid', 4, 'deadly'), n1 = T.get(L, 'mid', 1, 'normal'); if (!c || !n1) continue;
      const g = c.rates.levelXpPerH, d = 0.06 * CURVES[k].xp(L), f = (x) => r0(x / 1000), a = (n, s) => f(g - (n / 1000) * d * s);
      console.log([L, f(n1.rates.netLevelXpPerH), f(g), a(2.2, 0.25) + ' / ' + a(lo, 0.25) + ' / ' + a(hi, 0.25), a(lo, shareAt(RUNGS[k], L)) + ' / ' + a(hi, shareAt(RUNGS[k], L)), 'held ' + heldAt(RUNGS[k], L)].join(' | '));
    }
  }
}
if (!['law', 'deaths'].includes(mode)) { console.error('review-progression: law | deaths'); process.exit(2); }
if (!finite(seat && seat.per[50])) process.exit(2);
