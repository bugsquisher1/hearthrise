// tools/guards-for.local.mjs — which tests does THIS diff touch, and are they green? (CLAUDE.md §3.3:
// "run locally only the guards the diff touches"). Run in a lane worktree.
//
//   node tools/guards-for.local.mjs              list the tests for `origin/main...HEAD` + uncommitted changes
//   node tools/guards-for.local.mjs --run        run them one at a time, print only reds (last lines) + a tally
//   node tools/guards-for.local.mjs --base X     diff against X instead of origin/main
//
// A test is picked when it changed itself, or when its source names a changed file's basename.
// Migrations add the replay guards (schema-drift, apply-order honesty). Not a substitute for
// lane-done or the GitHub run; a shortlist so a lane doesn't run all 240 files to check a 3-file fix.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const changed = [...new Set([...git('diff', '--name-only', `${base}...HEAD`).split('\n'), ...git('diff', '--name-only').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))];

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'fixtures' ? [] : walk(p)) : /\.mjs$/.test(f) && !f.startsWith('_') ? [p.replace(/\\/g, '/')] : []; });
const tests = walk('tests');
const src = new Map(tests.map((t) => [t, readFileSync(t, 'utf8')]));
const pick = new Map();
for (const f of changed) {
  if (/^tests\/.+\.mjs$/.test(f) && src.has(f)) pick.set(f, 'changed');
  if (!/\.(js|mjs|ts|sql|css|html|json)$/.test(f) || f.startsWith('tests/')) continue;
  const stem = basename(f).replace(/\.(generated\.)?(js|mjs|ts|sql|css|html|json)$/, '');
  if (stem.length < 4) continue;
  /* An import or a path string of the file, not any mention: `from '../src/core/member.js'`, `'src/core/member.js'`. */
  const re = new RegExp(`['"\`][^'"\`]*${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:generated\\.)?(?:js|mjs|ts|sql|css|html|json)`);
  for (const [t, s] of src) if (!pick.has(t) && re.test(s)) pick.set(t, 'loads ' + basename(f));
}
if (changed.some((f) => f.startsWith('supabase/migrations/'))) {
  for (const t of ['tests/schema-drift.mjs', 'tests/apply-order-honesty.mjs']) if (existsSync(t)) pick.set(t, 'migration changed');
}
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
