// tests/balance-calibration.mjs — THE SIMULATOR REPRODUCES REAL HUNTS (lane/d-balance-audit, Tyler 2026-11-19: "rebuild the audit auto
// hunts to make sure what we are testing is accurate to the game").
//
// Every balance number on the board comes from tools/balance-sim. This guard holds the simulator to recorded play: the hunts in
// tests/fixtures/balance-calibration.json (real parties, aggregated and anonymous: seats by index, rates an hour, a date) are replayed on
// the real engine with each seat's own XP, worn set, bar, options and stock (tools/balance-sim/calibrate.mjs), and what the simulator
// answers an hour must land on what the server's tally recorded.
//
//   BC-1  the fixture is anonymous: no id, name, clock time or account key anywhere in it
//   BC-2  the judged sample is not thin: a four and a lone hero, 25 hero-hours or more
//   BC-3  each judged hunt, replayed, lands inside TOL on every metric (kills, Level XP, coin, dealt, taken, healed, store gold, deaths)
//   BC-4  the PLAYED profile (played.mjs: how a hero is dressed and barred when a cell doesn't name its own) lands inside PLAYED_TOL on the
//         recorded parties, with the recorded skills. The plain harness hero's gap is printed beside it and never judged: it is the
//         measured distance between an untouched hero and a real one (kills 0.55-0.83x, taken 1.4-2.4x on 2026-11-19).
//
// JUDGED = `kit: 'held'` (the hunt began after the hero's last setup change, so today's worn set and bar are the ones it hunted in) and
// an hour or more long. The other samples are context: `node tools/balance-sim/calibrate.mjs --run` prints them all.
//
// TOL, AND WHY (measured 2026-11-19, six seed sets of 2 h on each judged hunt): the dice move kills, Level XP, coin and damage dealt by
// 1-3%, damage taken by up to 7%, healing and store gold by about 10%; a seat's start is rebuilt from today's XP minus its later hunts,
// which reads up to a Level high (about +3-5% on the first four). So: 10% on the four that follow kill speed, 15% on damage taken, 25% on
// healing done (where the hunt healed 5,000 an hour or more), 40% on store gold (where it spent 2,000 an hour or more: the carried stock is
// an hour's average, not the bag's real order), and no more than one death in four party-hours where the record has none.
//
// A BALANCE CHANGE MADE ON PURPOSE moves the simulator off a hunt recorded before it. Such a change adds its measured shift to
// DECLARED_SHIFTS in the same commit (what the change does to each metric on these very hunts), and the next export replaces the fixture.
// A red here with no declared shift is the simulator, the engine or the data drifting from what players really got.
//
//   node tests/balance-calibration.mjs            the guard
//   node tests/balance-calibration.mjs --mutate   plants each drift below and proves the guard turns red on it
import { readFileSync } from 'node:fs';
import { run, FIXTURE } from '../tools/balance-sim/calibrate.mjs';
import { loadCellRunner } from '../tools/balance-sim/cell.mjs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TOL = Object.freeze({
  killsPerH: { pct: 10 }, levelXpPerH: { pct: 10 }, coinPerH: { pct: 10 }, dealtPerH: { pct: 10 },
  takenPerH: { pct: 15, min: 2000 }, healedPerH: { pct: 25, min: 5000 }, storePerH: { pct: 40, min: 2000 },
});
export const PLAYED_TOL = Object.freeze({ killsPerH: { pct: 20 }, levelXpPerH: { pct: 20 }, takenPerH: { pct: 25, min: 2000 } });
/* one death in four party-hours (the replay is 2 seeds of 2 h), as a rate summed over the party's seats */
const DEATHS_OVER = 0.26;
const HOURS = 2, SEEDS = 2;

/* DECLARED SHIFTS: [{ after: 'YYYY-MM-DD' (hunts recorded on or before it), why, mult: { metric: x } }]. The recorded rate is multiplied
   by `mult` before it is judged. Measured on this fixture, by `calibrate.mjs --run --monsters ...` or the change's own before/after run. */
export const DECLARED_SHIFTS = Object.freeze([
  /* MONSTERS A LITTLE HARDER (Tyler 2026-11-19, lane/d-harder-monsters; balance-sheet.js STAT_FORMULA): blows and HP x1.1, XP a point x0.96
     (the pace of record holds), the Cellar's XP fit 1.22. MEASURED on this fixture's three judged hunts: `calibrate.mjs --run --hours 2
     --seeds 2` on set/v0.2.141 (2eed3d57b) and on the change, sim over sim, pooled (summed) per metric. By hunt: the Warrens alone
     kills 0.91 / XP 0.96 / coin 0.97 / taken 1.08 / healed 1.14 / store 1.08; Krell's two Deadly fours kills 0.94-0.95 / XP 0.99-1.00 /
     coin 1.04-1.05 / taken 1.17-1.18 / healed 1.22-1.23 / store 1.71-2.16 (the Healer's mana and the tank's food follow the blows). */
  Object.freeze({ after: '2026-11-18', why: 'monsters a little harder: STAT_FORMULA blows and HP x1.1 (Tyler 2026-11-19), XP a point x0.96',
    mult: Object.freeze({ killsPerH: 0.941, levelXpPerH: 0.994, coinPerH: 1.038, dealtPerH: 1.039, takenPerH: 1.166, healedPerH: 1.218, storePerH: 1.744 }) }),
]);

const judgedOf = (fx) => fx.samples.filter((s) => s.kit === 'held' && s.hours >= 1);
const shiftOf = (s, key) => DECLARED_SHIFTS.filter((d) => s.date <= d.after).reduce((m, d) => m * ((d.mult && d.mult[key]) || 1), 1);

function anonymityProblems(fx) {
  const bad = [];
  const BAD_KEY = /^(user|user_id|user8|slot|name|session|session_id|instance|instance_id|hunt_from|ended_at|settled_to|email)$/i;
  const walk = (v, path) => {
    if (typeof v === 'string') {
      if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) bad.push(path + ' holds an id');
      if (/\d{4}-\d{2}-\d{2}T\d{2}:/.test(v)) bad.push(path + ' holds a clock time');
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (BAD_KEY.test(k)) bad.push(path + '.' + k + ' is an account key'); walk(x, path + '.' + k); }
  };
  walk(fx, 'fixture');
  /* a bar slot's id is its place on the bar, never the server's row id */
  for (const [i, bar] of (fx.bars || []).entries()) for (const s of bar || []) if (s && !/^s\d+$/.test(String(s.id))) bad.push('bars[' + i + '] carries a stored slot id');
  return bad;
}

function judge(rows, tol, fxById) {
  const fails = [];
  for (const r of rows) {
    const s = fxById[r.id];
    for (const [key, t] of Object.entries(tol)) {
      const c = r.cmp[key], real = c.real * shiftOf(s, key);
      if (!(real > (t.min || 0))) continue;
      const ratio = c.sim / real;
      if (Math.abs(ratio - 1) * 100 > t.pct) fails.push(`${r.id}: ${key} sim ${Math.round(c.sim)} over real ${Math.round(real)} = x${ratio.toFixed(2)}, past ${t.pct}%`);
    }
    const d = r.cmp.deathsPerH;
    if (d.sim > d.real + DEATHS_OVER) fails.push(`${r.id}: deaths an hour sim ${d.sim} over real ${d.real}`);
  }
  return fails;
}

/** The whole guard on a fixture (and an optional planted drift); answers { fails, lines }. */
async function check(fx, runner, plant = {}) {
  const fails = [], lines = [];
  for (const p of anonymityProblems(fx)) fails.push('BC-1 ' + p);
  const judged = judgedOf(fx), byId = Object.fromEntries(fx.samples.map((s) => [s.id, s]));
  const heroHours = judged.reduce((a, s) => a + s.hours * s.size, 0);
  if (!judged.some((s) => s.size === 4) || !judged.some((s) => s.size === 1) || heroHours < 25) fails.push(`BC-2 the judged sample is thin: ${judged.length} hunts, ${heroHours.toFixed(1)} hero-hours, needs a four, a lone hero and 25 h`);
  const pick = (s) => judged.includes(s);
  const base = { fx, runner, hours: HOURS, seeds: SEEDS, quiet: true, pick, monsters: plant.monsters || null };
  const exact = await run({ ...base, use: plant.use || null });
  for (const f of judge(exact, TOL, byId)) fails.push('BC-3 ' + f);
  const fmt = (r) => ['killsPerH', 'levelXpPerH', 'coinPerH', 'dealtPerH', 'takenPerH', 'healedPerH', 'storePerH'].map((k) => (r.cmp[k].ratio === null ? '  -  ' : r.cmp[k].ratio.toFixed(2).padStart(5))).join(' ');
  lines.push('recorded heroes (sim over real)   kills    xp  coin dealt taken heald store   deaths real/sim');
  for (const r of exact) lines.push(`  ${r.id.padEnd(30)} ${fmt(r)}   ${r.cmp.deathsPerH.real}/${r.cmp.deathsPerH.sim}`);
  if (!plant.skipPlayed) {
    const parties = (s) => pick(s) && s.size > 1;
    const played = await run({ ...base, pick: parties, use: { skills: true }, profile: plant.profileLost ? null : 'played' });
    for (const f of judge(played, PLAYED_TOL, byId)) fails.push('BC-4 ' + f);
    const plain = await run({ ...base, pick: parties, use: {} });
    lines.push('the played profile, recorded skills');
    for (const r of played) lines.push(`  ${r.id.padEnd(30)} ${fmt(r)}   ${r.cmp.deathsPerH.real}/${r.cmp.deathsPerH.sim}`);
    lines.push('the plain harness hero (printed, not judged)');
    for (const r of plain) lines.push(`  ${r.id.padEnd(30)} ${fmt(r)}   ${r.cmp.deathsPerH.real}/${r.cmp.deathsPerH.sim}`);
  }
  return { fails, lines };
}

/* THE PLANTED DRIFTS: [name, the check that must turn red, how the fixture or the run is bent]. */
const clone = (x) => JSON.parse(JSON.stringify(x));
const MUTANTS = [
  ['monsters hit 25% harder', 'BC-3', (fx) => ({ fx, plant: { monsters: { atk: 1.25 }, skipPlayed: true } })],
  ['monsters carry 40% more HP', 'BC-3', (fx) => ({ fx, plant: { monsters: { hp: 1.4 }, skipPlayed: true } })],
  ['a kill pays 20% more Level XP', 'BC-3', (fx) => ({ fx, plant: { monsters: { xp: 1.2 }, skipPlayed: true } })],
  ['a kill drops 30% more coin', 'BC-3', (fx) => ({ fx, plant: { monsters: { gp: 1.3 }, skipPlayed: true } })],
  ['the replay ignores the recorded bars and kits', 'BC-3', (fx) => ({ fx, plant: { use: { skills: true, options: true, bag: true }, skipPlayed: true } })],
  ['the record says 25% less Level XP than the server paid', 'BC-3', (fx) => { const f = clone(fx); for (const s of f.samples) for (const x of s.seats) x.real.levelXpPerH = Math.round(x.real.levelXpPerH * 0.75); return { fx: f, plant: { skipPlayed: true } }; }],
  ['the played profile is lost (a cell asking for it gets the plain hero)', 'BC-4', (fx) => ({ fx, plant: { profileLost: true } })],
  ['an account key rides in the fixture', 'BC-1', (fx) => { const f = clone(fx); f.samples[0].seats[0].user8 = '00000000'; return { fx: f, plant: { skipPlayed: true } }; }],
  ['a stored slot id rides in a bar', 'BC-1', (fx) => { const f = clone(fx); const s = f.bars[0].find(Boolean); s.id = 'r25044e1b'; return { fx: f, plant: { skipPlayed: true } }; }],
  ['no hunt is judged (every kit assumed)', 'BC-2', (fx) => { const f = clone(fx); for (const s of f.samples) s.kit = 'assumed'; return { fx: f, plant: { skipPlayed: true } }; }],
];

const fx0 = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const runner = await loadCellRunner(ROOT);
if (process.argv.includes('--mutate')) {
  const clean = await check(fx0, runner);
  if (clean.fails.length) { console.error('balance-calibration --mutate: the clean control is red, no mutant judged\n  ' + clean.fails.join('\n  ')); process.exit(2); }
  let missed = 0;
  for (const [name, want, bend] of MUTANTS) {
    const b = bend(fx0);
    const res = await check(b.fx, runner, b.plant);
    const bit = res.fails.some((f) => f.startsWith(want));
    console.log(`${bit ? 'CAUGHT' : 'MISSED'}  ${name}  (${want}${bit ? ': ' + res.fails.find((f) => f.startsWith(want)).slice(5, 110) : ''})`);
    if (!bit) missed++;
  }
  console.log(missed ? `balance-calibration --mutate: ${missed} of ${MUTANTS.length} planted drifts MISSED` : `balance-calibration --mutate: ${MUTANTS.length}/${MUTANTS.length} planted drifts caught, clean control green`);
  process.exit(missed ? 1 : 0);
}
const res = await check(fx0, runner);
console.log(res.lines.join('\n'));
if (res.fails.length) { console.error('\nbalance-calibration: RED\n  ' + res.fails.join('\n  ')); process.exit(1); }
console.log(`\nbalance-calibration: green (${judgedOf(fx0).length} recorded hunts replayed, ${judgedOf(fx0).reduce((a, s) => a + s.hours * s.size, 0).toFixed(1)} real hero-hours)`);
