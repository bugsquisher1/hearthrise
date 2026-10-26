#!/usr/bin/env node
// tools/balance-sim/sim.mjs — THE COMBAT BALANCE SIMULATOR (Tyler's balance ruling 2026-10-25, §11).
//
// Plays the REAL engine (src/core/combat-sim.js through the settle the world tick runs, via
// tests/hunt-core/fixtures/play-ground.mjs) with the game's real data (src/data/*): it never re-implements a formula,
// so it cannot drift from the game. Seeded and deterministic: the same plan on the same commit answers the same
// numbers. Local tool (heavy): at most 4 worker processes, holding new work above 85% machine CPU.
//
//   node tools/balance-sim/sim.mjs --plan <smoke|cost|baseline|career|full> [--workers 4] [--out DIR] [--only REGEX]
//                                  [--scale X] [--estimate]
//   node tools/balance-sim/sim.mjs --smoke      the CI-safe check: one 15-minute cell, played twice in-process,
//                                               must answer identical, sane numbers (exit 0), else exit 1
//   node tools/balance-sim/report.mjs --in DIR  the baseline report, the dashboard JSON and the CSV from a run
//
// Output (gitignored): tools/balance-sim/out/<plan>/cells.jsonl (one finished cell or career per line; a stopped run
// resumes), cells.errors.jsonl. The committed summary is written by report.mjs.
//
// PLANS: smoke (one cell) · cost (what an hour of each ground costs) · baseline (tonight's subset: S1 careers, S2 the
// solo grid as built, S3 the full box, S4 parties, S5 upgrade steps, S6 healing configs, S7 deep runs) · career /
// career8 (lives as built / at the full box) · whatif, whatif2, whatif3 (candidate changes on the same dice) · full
// (the same matrix at 24 h x 4 seeds: about 88k hero-hours, about 28 h at 4 workers on this PC, measured 4.6 worker-s
// a hero-hour on the baseline).
//
// THE DASHBOARD JSON (out/<plan>/dashboard.json, schema 'hearthrise.balance-dashboard/1'), for a filterable artifact:
//   { schema, generated, commit,
//     dims: { ground[], style[], party[] ('tank+healer'), level[], density[] (0 = as built, 8 = the full box), stage[] },
//     rows: [ one per hero per cell: { cell, stage, ground, band [lo, hi], party, partySize, style, level, density,
//             variant (gear / bar / supply what-if, or null), hours, levelXpPerH, skillXpPerH {skill: xp}, incomePerH,
//             raresPerH, storePerH, profitPerH, margin, killsPerH, ttkS, dps, takenPerH, dmgPerMonsterSwing, healInPerH,
//             sustainRatio, eatsPerH, drinksPerH, deaths, deathsPer1000h {rate, lo, hi, k, hours}, closePer12h {...},
//             minHpP50, minHpP10, difficulty ('easy' | 'normal' | 'hard' | 'extreme', or 'byHp|byDeaths'),
//             rareEveryH, maxHp, mitigation {dodgePm, absorbPm, ward}, kit {slot: item} } ],
//     careers: [ { id, party, hours, reached, hoursTo {L: h}, grounds, deaths, skillsAt, profitPerHByLevel } ],
//     summary: { levelHours, curve, party, upgrades, deathCost } }
// Filter by ground x style x level x partySize x density; colour by difficulty; plot levelXpPerH / profitPerH.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAxes, buildPlan } from './plans.mjs';
import { runPool } from './pool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);

async function smoke() {
  const { loadCellRunner } = await import('./cell.mjs');
  const R = await loadCellRunner(ROOT);
  const axes = await loadAxes(ROOT);
  const [cell] = buildPlan('smoke', axes);
  const a = R.runCell(cell), b = R.runCell(cell);
  const bad = [];
  if (JSON.stringify(a) !== JSON.stringify(b)) bad.push('the same cell answered two different results: the simulator is not deterministic');
  const h = a.heroes[0];
  if (!(h.levelXpPerH > 0)) bad.push('no Level XP measured');
  if (!(a.party.killsPerH > 0)) bad.push('no kills measured');
  if (!(h.encounters > 0)) bad.push('no encounters measured');
  if (!(h.hours > 0.2)) bad.push('the cell did not play its quarter hour (' + h.hours + ' h)');
  for (const [k, v] of Object.entries({ xp: h.levelXpPerH, income: h.incomePerH, taken: h.takenPerH, dealt: h.dealtPerH })) {
    if (!Number.isFinite(v) || v < 0) bad.push(k + ' is not a finite number >= 0: ' + v);
  }
  if (bad.length) { console.error('balance-sim smoke: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('balance-sim smoke: green (' + cell.id + ': ' + h.levelXpPerH + ' Level XP/h, ' + a.party.killsPerH + ' kills/h, '
    + h.encounters + ' encounters, deterministic)');
}

async function main() {
  if (flag('smoke')) { await smoke(); return; }
  const plan = arg('plan', 'baseline');
  const axes = await loadAxes(ROOT);
  let jobs = buildPlan(plan, axes, Number(arg('scale', '1')));
  const only = arg('only', null);
  if (only) jobs = jobs.filter((j) => new RegExp(only).test(j.id));
  if (flag('estimate')) {
    const hours = jobs.reduce((s, j) => s + (j.kind === 'career' ? j.maxHours : j.hours * j.seeds * (j.party.length > 1 ? 4 : 1)), 0);
    console.log(plan + ': ' + jobs.length + ' jobs, ' + Math.round(hours) + ' hero-weighted sim-hours (a four counts 4x)');
    return;
  }
  const out = resolve(arg('out', join(HERE, 'out', plan)));
  const r = await runPool(jobs, join(out, 'cells.jsonl'), { root: ROOT, workers: Number(arg('workers', '4')), cpuMax: Number(arg('cpu', '85')) });
  console.log('balance-sim: ' + r.done + ' done, ' + r.failed + ' failed in ' + Math.round(r.ms / 1000) + ' s -> ' + out);
  if (r.failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
