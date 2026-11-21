// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/atlas/measure.mjs — PLAY THE GROUND-RATE TABLE (the cached full run of `sources.mjs --measure`).
//
// Every ground at both ends of its band, every party size of 50-standards 1.3 and every tier it has, MID kit, on the real settle
// (tools/balance-sim/cell.mjs) through the worker pool (tools/balance-sim/pool.mjs: at most 4 processes, held while the PC is busy, resumable:
// a stopped run picks up where it left off). Writes tools/balance-program/ground-rates.json, stamped with the commit it was played on.
// --quick plays sizes 1 and 4, one composition, Normal and the hardest tier, 1 seed x 1 h; the full run 2 seeds x 1 h, every tier and comp.
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { runPool } from '../../balance-sim/pool.mjs';
import { measureJobs, rowOfResult } from './rates.mjs';
import { PARTIES } from '../standards.mjs';
import { ROOT } from './data.mjs';
import { tierRowOf, pullOfTier } from '../../../src/data/hunt-tiers.js';

/** A tier's pull on a ground for a party size (the row the game itself reads). */
export const pullOf = (ground, tier, size) => pullOfTier(tierRowOf(ground, tier), size);

export const RATES_FILE = join(ROOT, 'tools', 'balance-program', 'ground-rates.json');
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

export async function measureGroundRates(D, opts = {}) {
  const quick = !!opts.quick;
  const seeds = quick ? 1 : 2, hours = 1;
  const jobs = measureJobs({ HUNT_GROUNDS: D.HUNT_GROUNDS, HUNT_INDEX: D.HUNT_INDEX, OPEN_GROUNDS: D.OPEN_GROUNDS, PARTIES, tiersOf: D.tiersOf, pullOf, quick, seeds, hours, only: opts.only || null });
  const commit = commitOf();
  const jsonl = join(tmpdir(), 'hr-ground-rates-' + commit + (quick ? '-quick' : '') + '.jsonl');
  if (opts.fresh && existsSync(jsonl)) rmSync(jsonl);
  const t0 = Date.now();
  const res = await runPool(jobs.map((j) => ({ ...j })), jsonl, { root: ROOT, workers: opts.workers || 4, cpuMax: opts.cpuMax || 85, log: opts.log });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const rows = [];
  for (const line of readFileSync(jsonl, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    const job = byId.get(m.id);
    if (!job || !m.party) continue;
    rows.push(rowOfResult(job, m));
  }
  rows.sort((a, b) => (a.ground + a.level + a.size + a.tier + a.comp).localeCompare(b.ground + b.level + b.size + b.tier + b.comp));
  const prev = existsSync(RATES_FILE) && opts.only ? JSON.parse(readFileSync(RATES_FILE, 'utf8')).rows.filter((r) => !opts.only.includes(r.ground)) : [];
  const table = { schema: 'hearthrise.balance-program.ground-rates/1', commit, quick, seeds, hours, kit: 'MID (gear.mjs uniques, played profile, career-line skills)', tierPull: 'every harder-tier cell carries its tier\'s pull (density)',
    playedMs: Date.now() - t0, cells: jobs.length, failed: res.failed, rows: [...prev, ...rows] };
  writeFileSync(RATES_FILE, JSON.stringify(table, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  return { table, res, jsonl };
}
