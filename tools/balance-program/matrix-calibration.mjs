// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/matrix-calibration.mjs — HOW FAR THE HARNESS IS FROM REAL PLAY (the Coordinator 2026-11-21: "have the matrix print a
// calibration row against Andy's hunt, so every diff shows how far the harness is from real play"; lane/c-balance-matrix).
//
// THE REAL HUNT. Krell's Hold on Deadly, the heavy four, 2026-11-20: 9.74 clock hours, 39.0 hero-hours, 0 deaths, read from production
// read-only and written down in docs/design/balance-program/11-krell-hunt-2026-11-20.md (REAL, and THIN: one player, one day). The numbers
// below are that file's, cited by section; the Level XP is the 17.8 hero-hours before the bonus weekend opened (plain XP).
// BESIDE IT, from tests/fixtures/balance-calibration.json (tools/balance-sim/calibrate.mjs --build, aggregated and anonymous): the same four's
// two recorded Krell Deadly hunts of 2026-11-18 whose worn sets are held, with each seat's own XP, skills, kit, bar, options and stock.
//
// THREE PLAYS, each a column, so the gap splits into its causes:
//   recorded   the fixture's heroes, as the server held them, on the engine (calibrate.mjs cellOfSample: nothing dressed): engine and setup
//   real ways  the harness's own heroes (the grid's kit, skills and bar) in the real four's ways, at the real four's Level (79)
//   harness    the grid's four (tank, healer, bow, mage) at the ground's floor (85): what every party cell of the matrix is
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCell, compsOf } from './progression-grid.mjs';

const r = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export const KRELL_2026_11_20 = Object.freeze({
  id: 'krell-2026-11-20', label: 'REAL, THIN (one player, one day)', cited: 'docs/design/balance-program/11-krell-hunt-2026-11-20.md sections 0 to 4',
  ground: 'krells_hold', tier: 'deadly', size: 4, level: 79, heroHours: 39.0,
  killsPerH: 1251, levelXpPerHeadH: 1001000, coinPerHeadH: 15100, storePerHeadH: 10600, deaths: 0,
  /* section 3, a clock hour: damage dealt and taken by seat (the tank wore a hammer) */
  seats: Object.freeze({ front: Object.freeze({ dealtPerH: 67400, takenPerH: 118700 }), bow: Object.freeze({ dealtPerH: 51600, takenPerH: 2000 }),
    mage: Object.freeze({ dealtPerH: 82500, takenPerH: 2100 }), healer: Object.freeze({ dealtPerH: 34400, takenPerH: 48900 }) }),
});
/* a seat's column in the table: the front (tank or melee), the bow, the mage, the healer */
const seatOf = (styleOrRole) => ({ tank: 'front', hammer: 'front', sword: 'front', axes: 'front', melee_dps: 'front', bow: 'bow', crossbow: 'bow', ranger: 'bow', mage: 'mage', healer: 'healer' }[styleOrRole] || styleOrRole);

/** The calibration's jobs (each `seeds` x `hours`), and the fixture samples it plays. `D` loadGridData, `K` loadKits, `root` the tree. */
export async function calibrationJobs(D, K, root, o = {}) {
  const seeds = o.seeds || 1, hours = o.hours || 1;
  const jobs = [], cols = [];
  const add = (col, styles, b) => { cols.push({ col, styles }); for (let s = 0; s < seeds; s++) jobs.push({ id: 'CAL:' + col + '#' + s, key: 'CAL:' + col, whatIf: b.whatIf, cell: { ...b.cell, id: 'CAL:' + col, hours, seeds: 1, seedBase: s } }); };
  const R = KRELL_2026_11_20;
  const four = compsOf(4)[0][0];
  add('harness', four, buildCell(D, K, { L: 85, gear: 'mid', styles: four, tier: R.tier, ground: R.ground }));
  add('realWays', ['hammer', 'bow', 'mage', 'healer'], buildCell(D, K, { L: R.level, gear: 'mid', styles: ['hammer', 'bow', 'mage', 'healer'], tier: R.tier, ground: R.ground }));
  /* the recorded heroes: the fixture's held Krell Deadly samples */
  const fxFile = join(root, 'tests', 'fixtures', 'balance-calibration.json');
  const samples = [];
  if (existsSync(fxFile)) {
    const fx = JSON.parse(readFileSync(fxFile, 'utf8'));
    const { cellOfSample } = await import(pathToFileURL(join(root, 'tools', 'balance-sim', 'calibrate.mjs')).href);
    for (const s of fx.samples.filter((x) => x.ground === R.ground && x.tier === R.tier && x.kit === 'held')) {
      const cell = cellOfSample(fx, s, { hours, seeds: 1, items: K.ITEMS }, D.TI.tierRowOf);
      samples.push(s);
      for (let k = 0; k < seeds; k++) jobs.push({ id: 'CAL:recorded:' + s.id + '#' + k, key: 'CAL:recorded', cell: { ...cell, id: 'CAL:recorded:' + s.id, seedBase: k } });
    }
    if (samples.length) cols.push({ col: 'recorded', styles: samples[0].seats.map((x) => x.role) });
  }
  return { jobs, cols, samples };
}

/** One column's numbers from its seed results (runCell answers): kills a party-hour, a head's XP, coin and store, each seat's dealt and taken. */
function column(results, styles) {
  const ph = results.reduce((a, x) => a + x.party.hours, 0) || 1e-9;
  const out = { killsPerH: r(results.reduce((a, x) => a + x.party.killsPerH * x.party.hours, 0) / ph), seats: {} };
  const heads = results.flatMap((x) => x.heroes), hh = heads.reduce((a, h) => a + h.hours, 0) || 1e-9;
  const w = (f) => r(heads.reduce((a, h) => a + f(h) * h.hours, 0) / hh);
  Object.assign(out, { levelXpPerHeadH: w((h) => h.levelXpPerH), coinPerHeadH: w((h) => h.coinPerH), storePerHeadH: w((h) => h.storePerH), deaths: heads.reduce((a, h) => a + h.deaths, 0) });
  styles.forEach((st, i) => {
    const hs = results.map((x) => x.heroes[i]), hrs = hs.reduce((a, h) => a + h.hours, 0) || 1e-9;
    out.seats[seatOf(st)] = { dealtPerH: r(hs.reduce((a, h) => a + h.dealtPerH * h.hours, 0) / hrs), takenPerH: r(hs.reduce((a, h) => a + h.takenPerH * h.hours, 0) / hrs) };
  });
  const taken = Object.values(out.seats).reduce((a, s) => a + (s.takenPerH || 0), 0);
  for (const s of Object.values(out.seats)) s.takenShare = taken > 0 ? r(s.takenPerH / taken, 3) : null;
  return out;
}

/** The calibration table: rows [metric, real, fixture real, recorded, realWays, harness, harness / real]. `byKey` job key -> [runCell answers]. */
export function calibrationTable(byKey, cols, samples) {
  const R = KRELL_2026_11_20;
  const c = Object.fromEntries(cols.map(({ col, styles }) => [col, byKey['CAL:' + col] && byKey['CAL:' + col].length ? column(byKey['CAL:' + col], styles) : null]));
  /* the fixture's own real numbers, hour-weighted over its held samples */
  let fx = null;
  if (samples.length) {
    const hrs = samples.reduce((a, s) => a + s.hours, 0);
    const seatReal = (k) => samples.reduce((a, s) => a + s.seats.reduce((b, x) => b + (x.real[k] || 0), 0) / s.seats.length * s.hours, 0) / hrs;
    fx = { killsPerH: r(samples.reduce((a, s) => a + s.real.killsPerH * s.hours, 0) / hrs), levelXpPerHeadH: r(seatReal('levelXpPerH')), coinPerHeadH: r(seatReal('coinPerH')), storePerHeadH: r(seatReal('storePerH')),
      deaths: samples.reduce((a, s) => a + s.seats.reduce((b, x) => b + (x.real.deathsPerH || 0) * s.hours, 0), 0), seats: {} };
    for (const [i, x] of samples[0].seats.entries()) {
      const k = seatOf(x.role);
      fx.seats[k] = { takenPerH: r(samples.reduce((a, s) => a + (s.seats[i].real.takenPerH || 0) * s.hours, 0) / hrs), dealtPerH: r(samples.reduce((a, s) => a + (s.seats[i].real.dealtPerH || 0) * s.hours, 0) / hrs) };
    }
    const t = Object.values(fx.seats).reduce((a, s) => a + s.takenPerH, 0);
    for (const s of Object.values(fx.seats)) s.takenShare = t > 0 ? r(s.takenPerH / t, 3) : null;
  }
  const realTaken = Object.values(R.seats).reduce((a, s) => a + s.takenPerH, 0);
  const real = { killsPerH: R.killsPerH, levelXpPerHeadH: R.levelXpPerHeadH, coinPerHeadH: R.coinPerHeadH, storePerHeadH: R.storePerHeadH, deaths: R.deaths,
    seats: Object.fromEntries(Object.entries(R.seats).map(([k, s]) => [k, { ...s, takenShare: r(s.takenPerH / realTaken, 3) }])) };
  const pick = (o, path) => (o ? path.split('.').reduce((x, k) => (x ? x[k] : undefined), o) : undefined);
  const lines = [['killsPerH', 'Kills a party-hour'], ['levelXpPerHeadH', 'Level XP a hero-hour'], ['coinPerHeadH', 'Coin a hero-hour'], ['storePerHeadH', 'Store gold a hero-hour'], ['deaths', 'Deaths']];
  for (const s of ['front', 'bow', 'mage', 'healer']) lines.push(['seats.' + s + '.takenPerH', 'Damage taken an hour, ' + s], ['seats.' + s + '.takenShare', 'Share of the damage, ' + s], ['seats.' + s + '.dealtPerH', 'Damage dealt an hour, ' + s]);
  const rows = lines.map(([path, label]) => {
    const rv = pick(real, path), hv = pick(c.harness, path);
    return { metric: path, label, real: rv ?? null, fixture: pick(fx, path) ?? null, recorded: pick(c.recorded, path) ?? null, realWays: pick(c.realWays, path) ?? null, harness: hv ?? null,
      harnessVsReal: Number.isFinite(rv) && rv > 0 && Number.isFinite(hv) ? r(hv / rv, 3) : null };
  });
  return { real: R, rows };
}

/** The table as text: one line a metric. */
export function printCalibration(t, out = console.log, before = null) {
  const f = (x) => (x === null || x === undefined ? '-' : Math.abs(x) < 2 && !Number.isInteger(x) ? x.toFixed(3) : Math.round(x).toLocaleString('en-US'));
  out('CALIBRATION against real play: ' + t.real.ground + ' ' + t.real.tier + ', ' + t.real.label + ' (' + t.real.cited + ')');
  out('  columns: real 11-20 (Level ' + t.real.level + ', ' + t.real.heroHours + ' hero-h) | real 11-18 (fixture, held kits) | engine on the recorded heroes | harness heroes in the real ways at ' + t.real.level + ' | the matrix\'s four at 85 | four / real' + (before ? ' | four / real BEFORE' : ''));
  const B = before ? new Map(before.rows.map((x) => [x.metric, x])) : null;
  for (const x of t.rows) out('  ' + x.label.padEnd(34) + [x.real, x.fixture, x.recorded, x.realWays, x.harness, x.harnessVsReal].map(f).map((s) => s.padStart(11)).join('') + (B ? f(B.get(x.metric) && B.get(x.metric).harnessVsReal).padStart(11) : ''));
}
