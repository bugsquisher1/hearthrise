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
//   BC-5  in each judged party, every SEAT takes its recorded share of the party's damage, within SEAT_SHARE_PTS points (lane/d-audit-fixes-sim,
//         the board's fix 8). The party's sum can land while the wrong hero bleeds: the harness entered a party by role NAME (healer, mage,
//         melee_dps, ranger) where the server enters one player's heroes by slot, so the Krell's Hold Lookout, who shoots the hero farthest
//         back at the pull, shot the replay's Ranger (18% of the party's damage) where the tally had the Healer taking 25%, and BC-3 saw a
//         party total within 3%. play-ground.mjs memberKey now enters in seat order: every seat lands within a point of its record.
//   BC-6  the SKILL LINES (skill-lines.mjs: the skills a career gives a hero at its Level, which a played cell plays when it names none) sit on
//         the recorded heroes: each recorded hero's main skill within LINE_PTS levels of its line at its Level ('alone' for a hero alone, 'party'
//         for a party's seat). The old harness hero (every skill at its Level) reads a Level 72 party hero's main skill 72 against 56-59.
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
import { loadLines, skillsAt } from '../tools/balance-sim/skill-lines.mjs';
import { charLevelFromXp, skillLevelFromXp } from '../src/core/xp.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
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
/* BC-5: a seat's share of its party's damage taken, sim against the record, in points (measured 2026-11-19 on the two Krell's Hold fours: every
   seat within 1 point once the party enters in seat order; 7 to 25 points apart when it entered by role name). Judged where the party took
   TAKEN_MIN an hour or more. */
const SEAT_SHARE_PTS = 10;
const TAKEN_MIN = 10000;
/* BC-6: a recorded hero's main skill against its skill line, in levels (set from the measure below the header) */
const LINE_PTS = 6;
const SKILL_LINES = loadLines();
const HOURS = 2, SEEDS = 2;

/* DECLARED SHIFTS: [{ after: 'YYYY-MM-DD' (hunts recorded on or before it), grounds?: [ground id] (only hunts on these; every ground when
   absent), why, mult: { metric: x } }]. The recorded rate is multiplied by `mult` before it is judged. Measured on this fixture, by
   `calibrate.mjs --run --monsters ...` or the change's own before/after run. A change that moves one ground's hunts (a spell, a row) names it:
   a multiplier pooled over grounds it moves differently fits none of them (lane/d-harder-monsters: the step moved the Warrens' lone store
   bill x1.08 and Krell's fours' x1.71, so one row pooled over both left Krell's over the line once his Hold's own spell came on top). */
export const DECLARED_SHIFTS = Object.freeze([
  /* MONSTERS A LITTLE HARDER (Tyler 2026-11-19, lane/d-harder-monsters; balance-sheet.js STAT_FORMULA): blows and HP x1.1, XP a point x0.96
     (the pace of record holds), the Cellar's XP fit 1.22. MEASURED on this fixture's three judged hunts: `calibrate.mjs --run --hours 2
     --seeds 2` on set/v0.2.142 (db99d405a) and on the change merged over it (Hot Pitch off), sim over sim, pooled (summed) within each ground:
     the Warrens alone, and Krell's two Deadly fours (the Healer's mana and the tank's food follow the blows). */
  Object.freeze({ after: '2026-11-18', grounds: Object.freeze(['coppercap_warrens']), why: 'monsters a little harder: STAT_FORMULA blows and HP x1.1 (Tyler 2026-11-19), XP a point x0.96',
    mult: Object.freeze({ killsPerH: 0.908, levelXpPerH: 0.955, coinPerH: 0.971, dealtPerH: 1.005, takenPerH: 1.084, healedPerH: 1.138, storePerH: 1.077 }) }),
  Object.freeze({ after: '2026-11-18', grounds: Object.freeze(['krells_hold']), why: 'monsters a little harder: STAT_FORMULA blows and HP x1.1 (Tyler 2026-11-19), XP a point x0.96',
    mult: Object.freeze({ killsPerH: 0.942, levelXpPerH: 0.994, coinPerH: 1.043, dealtPerH: 1.037, takenPerH: 1.175, healedPerH: 1.208, storePerH: 1.706 }) }),
  /* KRELL'S HOLD'S HOT PITCH (lane/d-harder-monsters, the balance audit's fix 2, 2026-11-19): the Gatekeeper's group spell reaches the back seats.
     MEASURED the same way on the merged code, Hot Pitch (1.0x every 16 s) off against on. */
  Object.freeze({ after: '2026-11-18', grounds: Object.freeze(['krells_hold']), why: 'Krell\'s Hold\'s Gatekeeper throws Hot Pitch on the whole party (the audit\'s fix 2)',
    mult: Object.freeze({ killsPerH: 1, levelXpPerH: 0.999, coinPerH: 1, dealtPerH: 1.001, takenPerH: 1.039, healedPerH: 1.028, storePerH: 1.048 }) }),
]);

const judgedOf = (fx) => fx.samples.filter((s) => s.kit === 'held' && s.hours >= 1);
const shiftOf = (s, key) => DECLARED_SHIFTS.filter((d) => s.date <= d.after && (!d.grounds || d.grounds.includes(s.ground)))
  .reduce((m, d) => m * ((d.mult && d.mult[key]) || 1), 1);

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

/** BC-5: who in the party bleeds. Each seat's share of the party's damage taken, replay against record (a party of two or more). */
export function seatShareFails(rows, fxById) {
  const fails = [];
  for (const r of rows) {
    if (r.real.length < 2) continue;
    const realSum = r.real.reduce((a, x) => a + (x.takenPerH || 0), 0), simSum = r.sim.seats.reduce((a, x) => a + (x.takenPerH || 0), 0);
    if (!(realSum >= TAKEN_MIN) || !(simSum > 0)) continue;
    r.real.forEach((x, i) => {
      const want = (100 * (x.takenPerH || 0)) / realSum, got = (100 * (r.sim.seats[i].takenPerH || 0)) / simSum;
      const role = ((fxById[r.id] || {}).seats || [])[i] ? fxById[r.id].seats[i].role : '?';
      if (Math.abs(got - want) > SEAT_SHARE_PTS) fails.push(`${r.id}: seat ${i} (${role}) takes ${got.toFixed(1)}% of the party's damage in the replay, ${want.toFixed(1)}% in the record, past ${SEAT_SHARE_PTS} points`);
    });
  }
  return fails;
}

/** BC-6: each recorded hero's main skill against its skill line at its Level ('alone' for a hero alone, 'party' for a party's seat), one hero a
    role, Level and size. Answers { fails, rows }. `snap`: the skill lines (skill-lines.mjs), or the string 'level' (every skill at the Level). */
export function lineFails(fx, snap) {
  const STYLE = { tank: 'tank', melee_dps: 'hammer', ranger: 'bow', mage: 'mage', healer: 'healer' };
  const MAIN = { tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' };
  const fails = [], rows = [], seen = new Set();
  /* a hero alone is judged on the lone line where it hunts a ground of its own Level (its band's top + 10 at most): a Level 61 party hero
     visiting the Cellar (1-8) for an hour was levelled in a party, which no lone sample can say */
  const topOf = (ground) => (HUNT_INDEX[(HUNT_GROUNDS[ground] || {}).hunt] || { band: [0, Infinity] }).band[1];
  for (const s of fx.samples) for (const x of s.seats) {
    const L = charLevelFromXp(x.levelXp), k = MAIN[x.role], key = x.role + ':' + L + ':' + (s.size > 1 ? 'party' : 'alone');
    if (!k || seen.has(key) || (s.size === 1 && L > topOf(s.ground) + 10)) continue;
    seen.add(key);
    const rec = skillLevelFromXp(k, (x.skills || {})[k] || 0), line = s.size > 1 ? 'party' : 'alone';
    const got = snap === 'level' ? L : skillsAt(snap, line, STYLE[x.role], L)[k];
    rows.push(`  ${(x.role + ' ' + line + ' L' + L).padEnd(24)} ${k} record ${rec}, line ${got}`);
    if (Math.abs(got - rec) > LINE_PTS) fails.push(`a ${x.role} at Level ${L} (${line}): its ${k} line reads ${got}, the recorded hero ${rec}, past ${LINE_PTS} levels`);
  }
  return { fails, rows };
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
  for (const f of seatShareFails(exact, byId)) fails.push('BC-5 ' + f);
  const sl = lineFails(fx, plant.lines || SKILL_LINES);
  for (const f of sl.fails) fails.push('BC-6 ' + f);
  lines.push('skill lines against the recorded heroes (BC-6, within ' + LINE_PTS + ' levels)', ...sl.rows);
  const fmt =(r) => ['killsPerH', 'levelXpPerH', 'coinPerH', 'dealtPerH', 'takenPerH', 'healedPerH', 'storePerH'].map((k) => (r.cmp[k].ratio === null ? '  -  ' : r.cmp[k].ratio.toFixed(2).padStart(5))).join(' ');
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
  /* the pre-fix harness: a party entered by role NAME (play-ground.mjs keyed members `role + seat`), each seat's record moving with it */
  ['the replay enters a party by role name, not by seat', 'BC-5', (fx) => { const f = clone(fx); for (const s of f.samples) s.seats.sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0)); return { fx: f, plant: { skipPlayed: true } }; }],
  ['the skill lines are every skill at the Level again (the old harness hero)', 'BC-6', (fx) => ({ fx, plant: { lines: 'level', skipPlayed: true } })],
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
