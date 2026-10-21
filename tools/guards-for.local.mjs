// tools/guards-for.local.mjs — which tests does THIS diff touch, and are they green? (CLAUDE.md §3.3:
// "run locally only the guards the diff touches"). Run in a lane worktree.
//
//   node tools/guards-for.local.mjs              list the tests for `origin/main...HEAD` + uncommitted changes
//   node tools/guards-for.local.mjs --run        run them one at a time, print only reds (last lines) + a tally
//   node tools/guards-for.local.mjs --base X     diff against X instead of origin/main
//
// A test is picked when it changed itself, when its source names a changed file's basename, or when
// it imports a picked helper; migrations add the replay guards. The rule is tools/lib/guard-deps.mjs.
// Not a substitute for lane-done or the GitHub run; a shortlist so a lane doesn't run all 240 files
// to check a 3-file fix.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { changedFiles, guardSources, touchedBy } from './lib/guard-deps.mjs';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const changed = changedFiles(process.cwd(), `${base}...HEAD`, { worktree: true });

/* The mapping is shared with tools/mutant-gate.mjs (CI's --mutate/--selftest gate): one rule, two callers. */
const pick = new Map([...touchedBy(changed, guardSources(process.cwd()))]
  .filter(([t]) => t.startsWith('tests/') && !basename(t).startsWith('_')));
const list = [...pick.entries()].sort();
console.log(`${changed.length} changed files vs ${base} → ${list.length} tests`);
if (!args.includes('--run')) { for (const [t, why] of list) console.log(`  node ${t}   (${why})`); process.exit(0); }

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
process.exitCode = red ? 1 : 0;
