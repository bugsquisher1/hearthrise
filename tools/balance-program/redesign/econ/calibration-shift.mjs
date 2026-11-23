#!/usr/bin/env node
// tools/balance-program/redesign/econ/calibration-shift.mjs — lane/econ-levers' measured shift for tests/balance-calibration.mjs DECLARED_SHIFTS.
// The store's prices moved (src/data/store-kit.js), so a recorded hunt's store bill moves with them: this replays the guard's judged hunts
// (its fixture, 2 h x 2 seeds, the recorded kits) on a base ref and on this tree, sim over sim, and prints each ground's geometric mean of
// its hunts' own ratios, metric by metric (the guard's own rule for a declared shift).
//   node tools/balance-program/redesign/econ/calibration-shift.mjs [--base origin/set/v0.2.144]      Exit 0 printed · 2 harness
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const BASE = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'origin/set/v0.2.144';
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { run, FIXTURE } = await imp('tools/balance-sim/calibrate.mjs');
const { loadCellRunner } = await imp('tools/balance-sim/cell.mjs');
const { materialize } = await imp('tools/balance-program/baseline/tree.mjs');
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const pick = (s) => s.kit === 'held' && s.hours >= 1;
const METRICS = ['killsPerH', 'levelXpPerH', 'coinPerH', 'dealtPerH', 'takenPerH', 'healedPerH', 'storePerH'];
const tmp = mkdtempSync(join(tmpdir(), 'econ-shift-'));
try {
  materialize({ game: BASE, into: join(tmp, 'tree'), label: 'econ-shift base', harnessRoot: ROOT });
  const play = async (root) => run({ fx, runner: await loadCellRunner(root), hours: 2, seeds: 2, quiet: true, pick });
  const before = await play(join(tmp, 'tree')), after = await play(ROOT);
  const by = {};
  for (const a of after) {
    const b = before.find((x) => x.id === a.id), s = fx.samples.find((x) => x.id === a.id);
    (by[s.ground] || (by[s.ground] = [])).push(Object.fromEntries(METRICS.map((k) => [k, b.cmp[k].sim > 0 ? a.cmp[k].sim / b.cmp[k].sim : 1])));
  }
  for (const [g, rows] of Object.entries(by)) {
    console.log(g + ' (' + rows.length + ' hunts): ' + METRICS.map((k) => k + ' x' + Math.exp(rows.reduce((t, r) => t + Math.log(r[k]), 0) / rows.length).toFixed(3)).join(', '));
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
