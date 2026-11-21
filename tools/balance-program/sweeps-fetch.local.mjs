#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/sweeps-fetch.local.mjs — JOIN THE GITHUB SWEEPS INTO balance-sweeps.json (lane/c-balance-matrix, Balance Lab v3).
//
//   node tools/balance-program/sweeps-fetch.local.mjs [--run <id>] [--branch <branch>] [--dir <folder>]
//
// .github/workflows/balance-sweeps.yml runs one job a knob and one a proposal toggle on the proposed game, and uploads `sweep-<job>`. This downloads every artifact of the run (`--run`, else
// the newest balance-sweeps run on `--branch`, else on the current branch) with the GitHub CLI (`gh run download`), joins them with
// balance-matrix.mjs assembleSweeps (the same tree, the same cells, a knob once) and writes tools/balance-program/balance-sweeps.json, the
// precomputed table Balance Lab v3 reads. `--dir`: join sweep-*.json files already on disk instead. Prints the knobs it holds, the live knobs
// it lacks, and STALE when the sweeps were measured on another tree than this one. Reads GitHub, writes one file, plays nothing.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assembleSweeps, SWEEP_FILE, SUBSET_FILE, readCache, compactCells, baseOf, baseHash, cacheFileOf } from './balance-matrix.mjs';
import { RUNS } from './matrix-plan.mjs';
import { readKnobs } from './matrix-scratch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const gh = (...a) => execFileSync('gh', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/* every sweep-*.json under a folder (gh run download puts each artifact in its own sub-folder) */
function sweepFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sweepFiles(p));
    else if (/^sweep-.*\.json$/.test(f)) out.push(p);
  }
  return out;
}

let dir = arg('dir') ? resolve(arg('dir')) : null, scratch = null, runId = arg('run');
if (!dir) {
  if (!runId) {
    /* the run on the branch, or on its sweep branch (balance-sweeps/<branch>: a push there starts the workflow until main holds it) */
    const here = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const branches = arg('branch') ? [arg('branch')] : [here, 'balance-sweeps/' + here];
    const runs = branches.flatMap((b) => JSON.parse(gh('run', 'list', '--workflow', 'balance-sweeps.yml', '--branch', b, '--limit', '1', '--json', 'databaseId,status,conclusion,headSha,createdAt,headBranch')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!runs.length) { console.error('sweeps-fetch: no balance-sweeps run on ' + branches.join(' or ') + ' (git push origin HEAD:refs/heads/balance-sweeps/' + here + ')'); process.exit(2); }
    runId = String(runs[0].databaseId);
    console.log('sweeps-fetch: run ' + runId + ' on ' + runs[0].headBranch + ' (' + runs[0].status + (runs[0].conclusion ? ', ' + runs[0].conclusion : '') + ', ' + runs[0].headSha.slice(0, 9) + ', ' + runs[0].createdAt + ')');
    if (runs[0].status !== 'completed') console.log('  the run is still going: its finished knobs are joined, the rest print as not swept');
  }
  dir = scratch = mkdtempSync(join(tmpdir(), 'hr-sweeps-'));
  gh('run', 'download', runId, '--dir', dir, '--pattern', 'sweep-*');
}
try {
  const files = sweepFiles(dir);
  if (!files.length) { console.error('sweeps-fetch: no sweep-*.json in ' + (runId ? 'run ' + runId : dir)); process.exit(2); }
  const doc = assembleSweeps(files.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
  if (runId) doc.githubRun = runId;
  writeFileSync(SWEEP_FILE, JSON.stringify(doc) + '\n');
  const live = readKnobs(ROOT).knobs.map((k) => k.id);
  const missing = live.filter((id) => !doc.knobs[id]);
  console.log('sweeps-fetch: ' + Object.keys(doc.knobs).length + ' knob(s), ' + Object.values(doc.knobs).reduce((a, k) => a + Object.keys(k.steps).length, 0) + ' steps -> ' + relative(ROOT, SWEEP_FILE));
  if (missing.length) console.log('  not swept: ' + missing.join(', '));
  const toggles = Object.keys(doc.variants || {});
  console.log('  on ' + ((doc.base && doc.base.name) || 'today') + ': ' + toggles.length + ' proposal toggle(s)' + (toggles.length ? ' (' + toggles.join(', ') + ')' : ''));
  /* STALE only when this tree's subset, on the same base, plays other numbers than the sweeps' baseline (the cache must be fresh to tell) */
  const base = doc.base && doc.base.name === 'proposed' ? await baseOf('proposed') : null;
  const hashNow = baseHash(base);
  if (doc.hash !== hashNow) {
    const cache = readCache(base ? cacheFileOf(RUNS.subset, base) : SUBSET_FILE);
    const fresh = cache && cache.hash === hashNow;
    const same = fresh && JSON.stringify(compactCells(cache.cells)) === JSON.stringify(doc.baseline);
    console.log('  measured on ' + doc.hash + ', this tree and base is ' + hashNow + ': ' + (same ? 'this tree\'s subset plays the same numbers cell for cell, the sweeps hold'
      : fresh ? 'STALE, this tree\'s subset plays other numbers (push the tree to balance-sweeps/<branch> to re-sweep)' : 'not judged: run balance-matrix.mjs --subset' + (base ? ' --base proposed' : '') + ' to refresh the cache, then fetch again'));
  }
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
