// tools/guards-for.local.mjs — which tests does THIS diff touch, and are they green? (CLAUDE.md §3.3:
// "run locally only the guards the diff touches"). Run in a lane worktree.
//
//   node tools/guards-for.local.mjs              list the tests for `origin/main...HEAD` + uncommitted changes
//   node tools/guards-for.local.mjs --run        run them one at a time, print only reds (last lines) + a tally,
//                                                then the PROOFS GitHub will run for this diff (no browser)
//   node tools/guards-for.local.mjs --run --pages      the same, with the page guards' proofs (one Chrome, a minute a mutant)
//   node tools/guards-for.local.mjs --run --no-proofs  the plain tests only (a quick loop while editing; not a lane's last run)
//   node tools/guards-for.local.mjs --base X     diff against X instead of origin/main
//
// A test is picked when it changed itself, when its source names a changed file's basename, or when
// it imports a picked helper; migrations add the replay guards. The rule is tools/lib/guard-deps.mjs.
// Not a substitute for lane-done or the GitHub run; a shortlist so a lane doesn't run all 240 files
// to check a 3-file fix.
//
// THE PROOFS (lane r-green-first, 2026-11-07). Of the 51 red causes on the release runs since 11-04, 18 were a
// mutation proof the lane's own change had touched and nobody ran before the push: a mutant whose anchor moved
// (perf-budget's probes, setup-slots' figures_dropped, activity-intent's gate_literal_bucket), a mutant planted
// on a body a later migration redefined (party-flow x2, town-walk, envelope-contract, hunt-sessions-settle), or a
// mutant the change no longer let a rule catch (client-boot B-5/B-17, alpha-windows, char-wipe). GitHub selected
// every one of them from the diff (tools/mutant-gate.mjs); this ran only the plain tests. --run now runs the same
// selection, narrowed the way GitHub narrows it, through tools/preflight.local.mjs --proofs, so the lane that
// moved an anchor is the one that finds it. The proofs read COMMITTED files, as GitHub does: commit first.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, guardSources, touchedBy } from './lib/guard-deps.mjs';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const changed = changedFiles(process.cwd(), `${base}...HEAD`, { worktree: true });

/* The mapping is shared with tools/mutant-gate.mjs (CI's --mutate/--selftest gate): one rule, two callers. */
const pick = new Map([...touchedBy(changed, guardSources(process.cwd()))]
  .filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_')));
const list = [...pick.entries()].sort();
console.log(`${changed.length} changed files vs ${base} → ${list.length} tests`);
if (!args.includes('--run')) {
  for (const [t, why] of list) console.log(`  node ${t}   (${why})`);
  console.log('  + the proofs GitHub will run for this diff: node tools/preflight.local.mjs --proofs --list');
  process.exit(0);
}

let red = 0;
for (const [t] of list) {
  const t0 = Date.now();
  const r = spawnSync('node', [t], { encoding: 'utf8', timeout: 15 * 60000 });
  const secs = Math.round((Date.now() - t0) / 1000);
  if (r.status === 0) { console.log(`  ✓ ${t} (${secs}s)`); continue; }
  red++;
  const tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).join('\n      ');
  console.log(`  ✗ ${t} exit ${r.status ?? 'timeout'} (${secs}s)\n      ${tail}`);
}
console.log(red ? `RED: ${red} of ${list.length}` : `GREEN: ${list.length} of ${list.length}`);

let proofs = 0;
if (!args.includes('--no-proofs')) {
  const dirty = (spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout || '').trim();
  if (dirty) console.log('\nguards-for: UNCOMMITTED changes are not in the proofs\' diff (GitHub reads commits): commit, then run again');
  console.log('\nThe proofs GitHub will run for this diff:');
  const p = spawnSync(process.execPath, [fileURLToPath(new URL('./preflight.local.mjs', import.meta.url)), '--proofs', '--plant', '--base', base, ...(args.includes('--pages') ? ['--pages'] : [])], { stdio: 'inherit' });
  proofs = p.status ?? 1;
  if (proofs === 3) console.log('guards-for: some proofs were NOT JUDGED here; GitHub will judge them');
}
process.exitCode = red || proofs === 1 || proofs === 2 ? 1 : 0;
