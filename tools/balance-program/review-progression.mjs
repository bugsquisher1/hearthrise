#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/review-progression.mjs — the progression review's derived measurements (56-review-progression.md, phase B;
// lane/d-review-progression). NO PLAY: it reads the cached grid (progression-grid.json, the real engine's cells) through grid-derive.mjs
// and re-derives on it what a Level curve and a Blessing ladder do. A curve moves no fight, so hours and death costs are arithmetic on
// the engine's measured Level XP an hour.
//
//   node tools/balance-program/review-progression.mjs law      the pace seat and the lone MID hero: hours to each Level on today's curve and
//                                                              on the Level law (LAW_CURVE below, the same brackets as
//                                                              patches/progression-1-level-law.json), and the doors by day at 12 h
//   node tools/balance-program/review-progression.mjs deaths   XP an hour a head after deaths at the RULED counts (standards.mjs S6), the four
//                                                              against four heroes each alone on Normal, MID and BiS: three Blessings
//                                                              against the ladder, on today's curve and on the law
//   node tools/balance-program/review-progression.mjs cost     what one death costs in the pace seat's hunted hours, by Level: unblessed,
//                                                              three Blessings, the ladder; both curves
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

/* THE LAW (56 section 2.1): cumulative pace hours H(L) = A x L^q from Level 100; a Level costs H'(L) x `multiple` x the contract. Carried as
   brackets: Levels 1 to 50 as LEVEL_CURVE has them, 50 to 100 a ramp, then the law to the unit at 100, 200, 300 and 400. */
export const LAW = Object.freeze({ from: 100, A: 0.643, q: 1.485, multiple: 2.0 });
export const LAW_TAIL = Object.freeze([
  { from: 50, rise: 371353, bend: 0 }, { from: 58, rise: 109822, bend: 0 },
  { from: 100, rise: 154992, bend: 529 }, { from: 200, rise: 260334, bend: 467 }, { from: 300, rise: 353507, bend: 431 },
]);

/* THE BLESSING LADDER (56 section 2.3): three to the first rung, then one more a rung; each past the third halves what is left.
   The rung Levels are content rows, placed where a fully blessed death would pass about six of the pace seat's hours on the law. */
export const LADDER = Object.freeze([[100, 4], [185, 5], [275, 6], [400, 7]]);
export const blessingsAt = (L) => LADDER.reduce((n, [lv, k]) => (L >= lv ? k : n), 3);
export const blessedShare = (L) => 0.25 / 2 ** (blessingsAt(L) - 3);

const grid = readGrid(false);
if (!grid) { console.error('review-progression: no cached progression-grid.json'); process.exit(2); }
const D = await loadGridData(ROOT);
const K = await loadKits(ROOT);
const T = derive(D, grid, K);
const CM = await import('../../src/data/core-model.js');
const lawRows = D.XP.levelCurveRowsOf({ first: CM.LEVEL_CURVE.first, brackets: [...CM.LEVEL_CURVE.brackets.filter((b) => b.from < 50), ...LAW_TAIL] });
const xpToday = T.xpAt;
const xpLaw = (L) => D.XP.xpForLevelOn(lawRows, L);
const seat = T.SEATS[T.PACE], lone = T.SEATS['mid:1:normal'];
const rateAt = (s, L) => (xpToday(L + 1) - xpToday(L)) / s.per[Math.min(L, 399)];
const hoursOn = (s, xp, L) => { let h = 0; for (let l = 1; l < L; l++) h += (xp(l + 1) - xp(l)) / rateAt(s, l); return h; };
const contract = (L) => CM.LEVEL_PACE.contract.a * L ** CM.LEVEL_PACE.contract.b;

if (mode === 'law') {
  console.log('== THE PACE SEAT (' + T.PACE + ', the cached grid). Cells from Level 185 are PROVISIONAL (the skill line) ==');
  console.log('Level | Level XP/h after deaths | x contract | hours today | hours on the law | ruled | this Level: today h | law h | total XP law / today');
  const ruled = Object.fromEntries(CM.LEVEL_PACE.targets);
  for (const L of [10, 25, 50, 60, 75, 88, 100, 110, 145, 185, 200, 250, 300, 350, 400]) {
    const r = rateAt(seat, L);
    console.log([L, r0(r), (r / contract(L)).toFixed(2), r0(hoursOn(seat, xpToday, L)), r0(hoursOn(seat, xpLaw, L)), ruled[L] || '', ((xpToday(L + 1) - xpToday(L)) / r).toFixed(1), ((xpLaw(L + 1) - xpLaw(L)) / r).toFixed(1), (xpLaw(L) / xpToday(L)).toFixed(2)].join(' | '));
  }
  console.log('\n== THE LONE MID HERO ON NORMAL: x contract | hours today | on the law | day at 12 h today | on the law ==');
  for (const L of [50, 75, 100, 110, 185, 200, 300, 400]) { const a = hoursOn(lone, xpToday, L), b = hoursOn(lone, xpLaw, L); console.log([L, (rateAt(lone, L) / contract(L)).toFixed(2), r0(a), r0(b), r0(a / 12), r0(b / 12)].join(' | ')); }
  console.log('\n== THE DOORS, the pace seat: day at 12 h today | on the law ==');
  for (const [L, name] of [[45, 'the Barrow March'], [88, 'Krell\'s Hold'], [110, 'end of open content'], [185, 'end of staged content'], [200, 'Level 200'], [300, 'Level 300'], [400, 'Level 400']]) console.log([name, r0(hoursOn(seat, xpToday, L) / 12), r0(hoursOn(seat, xpLaw, L) / 12)].join(' | '));
}

if (mode === 'cost') {
  console.log('== ONE DEATH, in the pace seat\'s hunted hours (6% of total Level XP over its measured XP an hour) ==');
  console.log('Level | today: unblessed | 3 Blessings | LAW: unblessed | 3 Blessings | the ladder | Blessings held | Levels lost on the law, ladder');
  for (const L of [50, 75, 100, 125, 145, 165, 185, 200, 250, 275, 300, 350, 400]) {
    const r = rateAt(seat, L), a = 0.06 * xpToday(L) / r, b = 0.06 * xpLaw(L) / r;
    console.log([L, a.toFixed(1), (a / 4).toFixed(1), b.toFixed(1), (b / 4).toFixed(1), (b * blessedShare(L)).toFixed(1), blessingsAt(L), (0.06 * xpLaw(L) * blessedShare(L) / (xpLaw(L + 1) - xpLaw(L))).toFixed(2)].join(' | '));
  }
}

if (mode === 'deaths') {
  const levels = T.levels.filter((L) => L >= 50);
  const count = (tier, gear) => { const b = STD.bandById('S6.' + tier + '.' + gear); return b ? [b.lo ?? b.hi, b.hi ?? b.lo] : null; };
  const f = (x) => (finite(x) ? r0(x / 1000) + 'k' : '-');
  const firstUnder = {};
  for (const [curve, xp] of [['TODAY\'S curve', xpToday], ['THE LAW', xpLaw]]) {
    console.log('\n== XP an hour a head after deaths at the RULED counts (S6 low..high), the four, on ' + curve + ' ==');
    console.log('Level gear | four heroes each alone, Normal | four, Normal | Dangerous gross | 3 Blessings | ladder | Deadly gross | 3 Blessings | ladder | held | measured deaths /1,000 h: Dangerous, Deadly');
    for (const L of levels) for (const gear of ['mid', 'bis']) {
      const n4 = T.get(L, gear, 4, 'normal'), n1 = T.get(L, gear, 1, 'normal');
      if (!n1) continue;
      const cells = [L + ' ' + gear, f(n1.rates.netLevelXpPerH), n4 ? f(n4.rates.netLevelXpPerH) : '-'], meas = [];
      for (const tier of ['dangerous', 'deadly']) {
        const c = T.get(L, gear, 4, tier), k = count(tier, gear);
        if (!c || !k) { cells.push('-', '-', '-'); meas.push('-'); continue; }
        const g = c.rates.levelXpPerH, after = (n, share) => g - (n / 1000) * 0.06 * xp(L) * share;
        const three = [after(k[0], 0.25), after(k[1], 0.25)], lad = [after(k[0], blessedShare(L)), after(k[1], blessedShare(L))];
        cells.push(f(g), f(three[0]) + '..' + f(three[1]), f(lad[0]) + '..' + f(lad[1]));
        meas.push(c.rates.deathsPer1000h);
        for (const [name, v] of [['3 low', three[0]], ['3 high', three[1]], ['ladder low', lad[0]], ['ladder high', lad[1]]]) {
          const key = curve + ' | ' + gear + ' ' + tier + ' | ' + name;
          if (!(key in firstUnder) && v < n1.rates.netLevelXpPerH) firstUnder[key] = L;
        }
      }
      console.log([...cells, blessingsAt(L), meas.join(', ')].join(' | '));
    }
  }
  console.log('\n== THE FIRST CHECKPOINT WHERE THE FOUR EARNS LESS A HEAD THAN FOUR HEROES EACH ALONE ON NORMAL (none = never to Level 400) ==');
  for (const curve of ['TODAY\'S curve', 'THE LAW']) for (const gear of ['mid', 'bis']) for (const tier of ['dangerous', 'deadly']) {
    const g = (n) => firstUnder[curve + ' | ' + gear + ' ' + tier + ' | ' + n] ?? 'none';
    console.log([curve, gear + ' ' + tier, '3 Blessings: low count ' + g('3 low') + ', high count ' + g('3 high'), 'ladder: low ' + g('ladder low') + ', high ' + g('ladder high')].join(' | '));
  }
}
