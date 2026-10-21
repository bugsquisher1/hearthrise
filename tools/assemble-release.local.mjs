// tools/assemble-release.local.mjs — build set/vX.Y.Z from origin/main plus ready lane branches (CLAUDE.md §3.3a).
//
//   node tools/assemble-release.local.mjs 0.2.21 lane/a-x lane/a-y …          merge each, report
//   node tools/assemble-release.local.mjs 0.2.21 lane/a-x … --bump            also ./bump-version.sh X.Y.Z
//
// Works in its own worktree (../set-vX.Y.Z), never on main, never pushes. A lane that does not merge
// with ZERO conflict hunks is aborted and reported "back to its lane" (§3.3: the Coordinator never
// resolves a conflict by hand). Prints the lanes merged, the ones refused, and the tests the
// assembled diff touches (the guards to run locally before pushing). Local tool, not in CI.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [ver, ...rest] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('usage: node tools/assemble-release.local.mjs X.Y.Z lane/… [--bump]'); process.exit(2); }
const lanes = rest.filter((a) => !a.startsWith('--'));
const bump = rest.includes('--bump');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ok = (cwd, ...a) => { try { git(cwd, ...a); return true; } catch (e) { return false; } };

const repo = process.cwd();
const branch = `set/v${ver}`;
const wt = resolve(repo, '..', `set-v${ver}`);
git(repo, 'fetch', '-q', 'origin', 'main', ...lanes);
if (!existsSync(wt)) {
  if (ok(repo, 'rev-parse', '--verify', '-q', branch)) git(repo, 'worktree', 'add', '-q', wt, branch);
  else git(repo, 'worktree', 'add', '-q', '-b', branch, wt, 'origin/main');
}
if (git(wt, 'status', '--porcelain')) { console.error(`${wt} has uncommitted changes; stopping.`); process.exit(1); }

const merged = [], refused = [];
for (const l of lanes) {
  const ref = 'origin/' + l;
  if (ok(wt, 'merge-base', '--is-ancestor', ref, 'HEAD')) { merged.push(`${l} (already in)`); continue; }
  if (ok(wt, 'merge', '--no-ff', '--no-edit', '-m', `merge: ${l} into ${branch}`, ref)) {
    merged.push(`${l} @ ${git(wt, 'rev-parse', '--short', ref)}`);
  } else {
    const files = git(wt, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    ok(wt, 'merge', '--abort');
    refused.push(`${l}: conflicts in ${files.join(', ') || '(unknown)'}, back to its lane (merge main into itself)`);
  }
}
if (bump && merged.length) execFileSync('bash', ['./bump-version.sh', ver], { cwd: wt, stdio: 'inherit' });

const changed = git(wt, 'diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean);
const tests = changed.filter((f) => /^tests\/.+\.mjs$/.test(f));
const edge = changed.some((f) => f.startsWith('supabase/functions/') || /^src\/(core|data)\//.test(f));
const sql = changed.filter((f) => f.startsWith('supabase/migrations/'));
console.log(`\n${branch} in ${wt}`);
console.log('Merged:\n' + (merged.length ? merged.map((m) => '  ✓ ' + m).join('\n') : '  (none)'));
if (refused.length) console.log('Refused:\n' + refused.map((r) => '  ✗ ' + r).join('\n'));
console.log(`Diff vs main: ${changed.length} files${edge ? ' · touches the edge bundle (pack-edge --hash, one local in-page run, deploy before push)' : ''}${sql.length ? ` · migrations: ${sql.join(', ')}` : ''}`);
if (tests.length) console.log('Tests touched (run these locally before pushing):\n' + tests.map((t) => '  node ' + t).join('\n'));
console.log(bump ? 'Bumped. Next: date + CHANGELOG entry, commit, push release/v' + ver : 'Next: --bump when the set is final.');
